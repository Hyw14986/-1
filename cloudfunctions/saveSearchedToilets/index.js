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
 * 云端测试入参示例：{ "toilets": [{ "name": "公共厕所", "lat": 21.443084, "lng": 110.77915, "source": "amap" }] }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 1, msg: '获取用户身份失败' }

  const toilets = Array.isArray(event.toilets) ? event.toilets : []
  if (!toilets.length) return { code: 0, msg: 'ok', saved: 0, updated: 0, skipped: 0 }

  let saved = 0
  let updated = 0
  let skipped = 0
  const now = Date.now()

  for (const t of toilets.slice(0, MAX_RECORDS)) {
    const name = String((t && t.name) || '').trim()
    const lat = Number(t && t.lat)
    const lng = Number(t && t.lng)
    if (!name || !(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) {
      skipped++
      continue
    }
    // 去重：同一用户 + 同名 + 50 米内 → 复用旧记录，仅更新浏览时间
    let dup = null
    try {
      const res = await db.collection('toilet_view_record').where({ openid: OPENID, name }).limit(20).get()
      for (const item of res.data) {
        if (getDistance(lat, lng, item.lat, item.lng) <= 50) {
          dup = item
          break
        }
      }
    } catch (err) {
      console.warn('查找记录去重查询失败', err)
    }
    try {
      if (dup) {
        await db.collection('toilet_view_record').doc(dup._id).update({
          data: {
            toiletId: String((t && t._id) || ''),
            lat,
            lng,
            source: String((t && t.source) || ''),
            lastSeenTime: now
          }
        })
        updated++
      } else {
        await db.collection('toilet_view_record').add({
          data: {
            openid: OPENID,
            _openid: OPENID,
            toiletId: String((t && t._id) || ''),
            name,
            lat,
            lng,
            source: String((t && t.source) || ''),
            createTime: now,
            lastSeenTime: now
          }
        })
        saved++
      }
    } catch (err) {
      console.warn('写入查找记录失败', err)
      skipped++
    }
  }

  console.log('[saveSearchedToilets] 新增=', saved, '更新=', updated, '跳过=', skipped)
  return { code: 0, msg: 'ok', saved, updated, skipped }
}
