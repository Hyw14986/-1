/**
 * 云函数 saveTencentPoi（全源 POI 合规缓存，函数名为历史命名，实际已支持全部数据源）
 * 保存前端查询时由地图服务商（tencent / amap / baidu / tianditu / osm）返回的圈内公厕点位到 toiletAll。
 * 去重规则：
 *  - toiletAll 中 50 米内已存在同名称公厕（任意来源）→ 跳过，禁止重复回写
 *  - 入库点位均为用户真实查询触发、且经前端球面距离过滤后处于红圈之内
 *  - source 取自点位自带来源标记；缺失时按 amap 处理（前端现在都会传 source）
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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

exports.main = async (event) => {
  const pois = Array.isArray(event && event.pois) ? event.pois : []
  if (!pois.length) return { code: 0, msg: 'ok', saved: 0, skipped: 0 }

  let saved = 0
  let skipped = 0

  for (const poi of pois) {
    const name = String((poi && poi.name) || '').trim()
    const lat = Number(poi && poi.lat)
    const lng = Number(poi && poi.lng)
    const source = String((poi && poi.source) || 'amap') // 来源：tencent/amap/baidu/tianditu/osm
    if (!name || !(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) {
      skipped++
      continue
    }
    // 去重：50 米内已存在同名称公厕则跳过（含 gov/user/tencent/amap/baidu/tianditu/osm 全部来源，禁止重复回写）
    let duplicate = false
    try {
      const nearby = await db.collection('toiletAll').where({ name, invalid: false }).limit(20).get()
      for (const item of nearby.data) {
        if (getDistance(lat, lng, item.lat, item.lng) <= 50) {
          duplicate = true
          break
        }
      }
    } catch (err) {
      console.warn('去重查询失败', err)
    }
    if (duplicate) {
      skipped++
      continue
    }
    try {
      await db.collection('toiletAll').add({
        data: {
          lat,
          lng,
          // 地理位置字段：配合 loc 2dsphere 索引供 geoNear 使用（见 getNearToilet 顶部注释）
          loc: db.Geo.Point(lng, lat),
          name,
          address: String((poi && poi.address) || ''),
          source,
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
        }
      })
      saved++
    } catch (err) {
      console.warn('写入 POI 缓存失败 source=', source, err)
      skipped++
    }
  }

  return { code: 0, msg: 'ok', saved, skipped }
}
