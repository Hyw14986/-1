/**
 * 云函数 importCityToilets（城市公厕批量导入工具）
 * 用途：把 data.js 中爬取的两城公厕点位（武汉/湛江，腾讯POI + OpenStreetMap，GCJ-02）写入 toiletAll
 * 数据字段：name、address、lat、lng（GCJ-02）、city、district、source（tencent / osm）
 *
 * 幂等：写入前按「同名 + 50 米内」与 toiletAll 现有记录去重，重复执行不会产生重复数据；
 * 已存在的记录跳过，仅新增缺失点位。可直接在云开发控制台对本函数执行「云端测试」触发。
 */
const cloud = require('wx-server-sdk')
const TOILETS = require('./data.js')

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

function isValidCoordinate(lat, lng) {
  const la = Number(lat)
  const ln = Number(lng)
  return isFinite(la) && isFinite(ln) && la >= -90 && la <= 90 && ln >= -180 && ln <= 180
}

// 一次性预载 toiletAll 全部现有记录，用于内存去重（避免逐条查询拖慢执行）
async function loadAllExisting() {
  const rows = []
  try {
    const pageSize = 1000
    let offset = 0
    while (true) {
      const res = await db.collection('toiletAll').limit(pageSize).skip(offset).get()
      const data = res.data || []
      rows.push(...data)
      if (data.length < pageSize) break
      offset += data.length
    }
  } catch (err) {
    console.warn('[importCityToilets] 读取现有记录失败（toiletAll 可能未创建，按无重复处理）', err)
  }
  return rows
}

// 并行控制：分批写入，避免超时
async function batchInsert(records, existing, concurrency) {
  let inserted = 0
  let skipped = 0
  let failed = 0
  const isDup = (lat, lng, name) => {
    for (const t of existing) {
      if ((t.name || '') === name && isValidCoordinate(t.lat, t.lng) && getDistance(lat, lng, Number(t.lat), Number(t.lng)) <= 50) {
        return true
      }
    }
    return false
  }
  for (let i = 0; i < records.length; i += concurrency) {
    const chunk = records.slice(i, i + concurrency)
    await Promise.all(chunk.map(async (rec) => {
      const lat = Number(rec.lat)
      const lng = Number(rec.lng)
      const name = rec.name || '公共厕所'
      if (!isValidCoordinate(lat, lng)) { skipped++; return }
      try {
        if (isDup(lat, lng, name)) { skipped++; return }
        await db.collection('toiletAll').add({
          data: {
            lat,
            lng,
            // 地理位置字段：配合 loc 2dsphere 索引供 geoNear 使用
            loc: db.Geo.Point(lng, lat),
            name,
            address: rec.address || '',
            city: rec.city || '',
            district: rec.district || '',
            source: ['osm', 'amap'].indexOf(rec.source) >= 0 ? rec.source : 'tencent',
            invalid: false,
            hasPaper: false,
            isCharge: false,
            isBarrierFree: false,
            hasBabyRoom: false,
            isOpen24h: false,
            openTime: '',
            feeType: 'free',
            feeDesc: '',
            photoUrls: [],
            auditStatus: 'pass',
            rating: 0,
            ratingCount: 0,
            createTime: db.serverDate()
          }
        })
        inserted++
      } catch (err) {
        failed++
        console.error('[importCityToilets] 写入失败', name, err)
      }
    }))
  }
  return { inserted, skipped, failed }
}

exports.main = async () => {
  const start = Date.now()
  // 按来源分组统计
  const bySource = {}
  for (const r of TOILETS) bySource[r.source] = (bySource[r.source] || 0) + 1
  console.log('[importCityToilets] 待导入', TOILETS.length, '条', JSON.stringify(bySource))
  const existing = await loadAllExisting()
  console.log('[importCityToilets] 库内现有记录', existing.length, '条，开始去重导入')
  const { inserted, skipped, failed } = await batchInsert(TOILETS, existing, 8)
  const used = Date.now() - start
  return {
    code: 0,
    msg: `导入完成：新增 ${inserted}，跳过 ${skipped}（已存在/非法），失败 ${failed}，耗时 ${used}ms`,
    total: TOILETS.length,
    inserted,
    skipped,
    failed
  }
}