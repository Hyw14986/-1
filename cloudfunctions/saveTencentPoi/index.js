/**
 * 云函数 saveTencentPoi（全源 POI 合规缓存，函数名为历史命名，实际已支持全部数据源）
 * 保存前端查询时由地图服务商（tencent / amap / baidu / tianditu / osm）返回的圈内公厕点位到 toiletAll。
 * 去重规则：
 *  - toiletAll 中 50 米内已存在同名称公厕（任意来源）→ 跳过，禁止重复回写
 *  - 同一批次内已接受的点位也参与去重（同名 + 50 米只保留第一条，等价于原逐条写入时的效果）
 *  - 入库点位均为用户真实查询触发、且经前端球面距离过滤后处于红圈之内
 *  - source 取自点位自带来源标记；缺失时按 amap 处理（前端现在都会传 source）
 *
 * 返回 list：已入库/已存在点位的 { name, lat, lng, _id }，供前端回填 _id 支持收藏/举报/反馈
 *
 * 性能优化（解决 -504003 云函数 3 秒超时）：
 *  - 原来逐条「查重 + 写入」，几十个点位会产生几十次数据库往返，极易超过默认 3 秒超时
 *  - 现在改为：批量拉取库内同名候选（_.in 每批 50 个名字、limit 1000）→ 内存距离去重 → 批量 add（每批 20 条）
 *  - 配合本目录 config.json 的 timeout: 20，避免任务超时被杀
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

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

exports.main = async (event) => {
  const pois = Array.isArray(event && event.pois) ? event.pois : []
  if (!pois.length) return { code: 0, msg: 'ok', saved: 0, skipped: 0 }

  // 1. 前置校验 + 归一化
  const items = []
  for (const poi of pois) {
    const name = String((poi && poi.name) || '').trim()
    const lat = Number(poi && poi.lat)
    const lng = Number(poi && poi.lng)
    if (!name || !validCoord(lat, lng)) continue
    items.push({
      name,
      lat,
      lng,
      source: String((poi && poi.source) || 'amap'), // 来源：tencent/amap/baidu/tianditu/osm
      address: String((poi && poi.address) || '')
    })
  }
  if (!items.length) return { code: 0, msg: 'ok', saved: 0, skipped: 0 }

  // 2. 批量拉取库内同名候选（_.in 每批 50 个名字，limit 1000；单条查询失败不阻断整体）
  const names = [...new Set(items.map((i) => i.name))]
  const nameGroups = chunk(names, 50)
  const candidates = []
  const queryResults = await Promise.all(
    nameGroups.map((group) =>
      db.collection('toiletAll').where({ name: _.in(group), invalid: false }).limit(1000).get()
        .catch((err) => {
          console.warn('批量去重查询失败（已跳过该组）', err)
          return { data: [] }
        })
    )
  )
  queryResults.forEach((r) => candidates.push(...(r.data || [])))

  // 3. 内存去重：与库内候选 或 本批次已接受点位 同名且 50 米内 → 跳过
  let saved = 0
  let skipped = 0
  const toAdd = []
  const resultList = [] // 已入库/已存在点位的 _id，回填给前端供收藏/举报/反馈使用
  for (const item of items) {
    let duplicate = false
    let dupId = ''
    // 与库内候选比较
    for (const c of candidates) {
      if (c.name === item.name && validCoord(c.lat, c.lng) && getDistance(item.lat, item.lng, c.lat, c.lng) <= 50) {
        duplicate = true
        dupId = c._id
        break
      }
    }
    // 与本批次已接受点位比较（保持原逐条写入语义：先写库的优先生效）
    if (!duplicate) {
      for (const a of toAdd) {
        if (a.name === item.name && getDistance(item.lat, item.lng, a.lat, a.lng) <= 50) {
          duplicate = true
          break
        }
      }
    }
    if (duplicate) {
      skipped++
      if (dupId) resultList.push({ name: item.name, lat: item.lat, lng: item.lng, _id: dupId })
      continue
    }
    toAdd.push({
      lat: item.lat,
      lng: item.lng,
      // 地理位置字段：配合 loc 2dsphere 索引供 geoNear 使用（见 getNearToilet 顶部注释）
      loc: db.Geo.Point(item.lng, item.lat),
      name: item.name,
      address: item.address,
      source: item.source,
      invalid: false,
      hasPaper: false,
      isCharge: false,
      isBarrierFree: false,
      hasBabyRoom: false,
      isOpen24h: false,
      openTime: '',
      photoUrls: [],
      auditStatus: 'pass',
      rating: 0,
      ratingCount: 0,
      createTime: db.serverDate()
    })
  }

  // 4. 批量写入（每批 20 条，避免单次批量写入过大）
  for (const batch of chunk(toAdd, 20)) {
    try {
      const addRes = await db.collection('toiletAll').add({ data: batch })
      const ids = (addRes && addRes._ids) || []
      batch.forEach((b, idx) => {
        if (ids[idx]) resultList.push({ name: b.name, lat: b.lat, lng: b.lng, _id: ids[idx] })
      })
      saved += batch.length
    } catch (err) {
      console.warn('批量写入 POI 缓存失败（完整错误）', err)
      skipped += batch.length
    }
  }

  console.log('[saveTencentPoi] 新增=', saved, '跳过=', skipped)
  return { code: 0, msg: 'ok', saved, skipped, list: resultList }
}