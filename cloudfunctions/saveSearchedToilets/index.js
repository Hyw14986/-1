/**
 * 云函数 saveSearchedToilets（记录「用户查找过的厕所」）
 * 用途：每次查询成功后，把本次查询到的圈内公厕点位记录到 toilet_view_record 集合，
 *       形成每个用户自己的「查找过/浏览过」的厕所历史，便于后续在「我的」页面展示。
 * 去重规则：
 *  - 同一用户（openid）+ 同名称 + 50 米内 → 视为同一条记录，仅更新 lastSeenTime/坐标，不重复插入
 *  - 每次最多记录 50 条（MAX_RECORDS），防止查询点位过多时写入量爆炸
 * 说明：
 *  - toiletId 仅在点位来自 toiletAll 数据库时存在（getNearToilet 返回 _id）；地图服务商 POI 点位先经
 *    saveTencentPoi 全源缓存入库，本函数侧重记录「用户视角的查找历史」，无 _id 也不影响展示
 *  - 写入全程由云函数完成（前端不直接操作数据库），与项目「所有写库操作经云函数」约束一致
 *
 * 性能优化（解决 -504003 云函数 3 秒超时）：
 *  - 原来逐条「查重 + 写入」，几十个点位会产生几十次数据库往返，极易超过默认 3 秒超时
 *  - 现在改为：批量拉取该用户同名历史记录（_.in 每批 50 个名字、limit 1000）→ 内存距离去重
 *    → 批量 add（每批 20 条）+ 少量 doc.update 逐条更新
 *  - 配合本目录 config.json 的 timeout: 20，避免任务超时被杀
 *
 * 云端测试入参示例：{ "toilets": [{ "name": "公共厕所", "lat": 21.443084, "lng": 110.77915, "source": "amap" }] }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 单次最多记录条数（防止一次查询返回上百个点位时写入量过大）
const MAX_RECORDS = 50

// haversine 球面距离（米）
function getDistance(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180
  const R = 6371000
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// 数组按指定大小切块
function chunk(arr, size) {
  const result = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

// 判断坐标是否合法（历史数据可能缺 lat/lng，去重距离计算前必须校验，避免 NaN 误判）
function validCoord(lat, lng) {
  const la = Number(lat)
  const ln = Number(lng)
  return la >= -90 && la <= 90 && ln >= -180 && ln <= 180
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 1, msg: '获取用户身份失败' }

  const toilets = Array.isArray(event.toilets) ? event.toilets : []
  if (!toilets.length) return { code: 0, msg: 'ok', saved: 0, updated: 0, skipped: 0 }

  // 1. 前置校验 + 归一化（最多取 MAX_RECORDS 条）
  const items = []
  for (const t of toilets.slice(0, MAX_RECORDS)) {
    const name = String((t && t.name) || '').trim()
    const lat = Number(t && t.lat)
    const lng = Number(t && t.lng)
    if (!name || !validCoord(lat, lng)) continue
    items.push({
      name,
      lat,
      lng,
      source: String((t && t.source) || ''),
      toiletId: String((t && t._id) || '')
    })
  }
  if (!items.length) return { code: 0, msg: 'ok', saved: 0, updated: 0, skipped: 0 }

  // 2. 批量拉取该用户同名历史记录（_.in 每批 50 个名字，limit 1000；单条查询失败不阻断整体）
  const names = [...new Set(items.map((i) => i.name))]
  const nameGroups = chunk(names, 50)
  const existing = []
  const queryResults = await Promise.all(
    nameGroups.map((group) =>
      db.collection('toilet_view_record').where({ openid: OPENID, name: _.in(group) }).limit(1000).get()
        .catch((err) => {
          console.warn('批量去重查询失败（已跳过该组）', err)
          return { data: [] }
        })
    )
  )
  queryResults.forEach((r) => existing.push(...(r.data || [])))

  // 3. 内存去重：同一用户 + 同名 + 50 米内 → 复用旧记录，仅更新浏览时间
  let saved = 0
  let updated = 0
  let skipped = 0
  const toAdd = []
  const toUpdate = []
  const usedExisting = new Set()
  const now = Date.now()

  for (const item of items) {
    let dup = null
    for (const e of existing) {
      if (usedExisting.has(e._id)) continue
      if (e.name === item.name && validCoord(e.lat, e.lng) && getDistance(item.lat, item.lng, e.lat, e.lng) <= 50) {
        dup = e
        usedExisting.add(e._id)
        break
      }
    }
    if (dup) {
      toUpdate.push({ id: dup._id, item })
    } else {
      toAdd.push({
        openid: OPENID,
        _openid: OPENID,
        toiletId: item.toiletId,
        name: item.name,
        lat: item.lat,
        lng: item.lng,
        source: item.source,
        createTime: now,
        lastSeenTime: now
      })
    }
  }

  // 4. 批量新增（每批 20 条）
  for (const batch of chunk(toAdd, 20)) {
    try {
      await db.collection('toilet_view_record').add({ data: batch })
      saved += batch.length
    } catch (err) {
      console.warn('批量写入查找记录失败（完整错误）', err)
      skipped += batch.length
    }
  }

  // 5. 逐条更新已存在记录（通常很少，直接 doc.update）
  for (const u of toUpdate) {
    try {
      await db.collection('toilet_view_record').doc(u.id).update({
        data: {
          toiletId: u.item.toiletId,
          lat: u.item.lat,
          lng: u.item.lng,
          source: u.item.source,
          lastSeenTime: now
        }
      })
      updated++
    } catch (err) {
      console.warn('更新查找记录失败', err)
      skipped++
    }
  }

  console.log('[saveSearchedToilets] 新增=', saved, '更新=', updated, '跳过=', skipped)
  return { code: 0, msg: 'ok', saved, updated, skipped }
}