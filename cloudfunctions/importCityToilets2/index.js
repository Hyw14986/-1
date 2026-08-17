/**
 * 云函数 importCityToilets（城市公厕批量导入工具）- 吞吐调优版
 * 用途：把 data.js 中爬取的城市公厕点位（武汉/湛江/北京/上海/广州/深圳/成都/杭州/重庆/西安/南京/郑州，GCJ-02）写入 toiletAll
 * API 与旧版完全兼容：event = { start, limit } 分片导入，幂等（重复执行不产生重复数据）
 * 调优点（解决旧版在数据量增大后的两大瓶颈）：
 *  1. 读取现有记录改为「_id 游标分页」（旧版 skip 分页超过 1 万条会报错），且只取去重所需字段；
 *  2. 去重改为「同名分桶 + 50 米内」判定（旧版对每条记录遍历全部现有记录做距离计算，库越大越慢）；
 *  3. 支持 event.maxMillis 执行预算：到点提前返回 { partial: true }，避免被 3s 超时直接杀死、进度不可见，可反复续导。
 */
const cloud = require('wx-server-sdk')
const TOILETS = require('./data.js')

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

function isValidCoordinate(lat, lng) {
  const la = Number(lat)
  const ln = Number(lng)
  return isFinite(la) && isFinite(ln) && la >= -90 && la <= 90 && ln >= -180 && ln <= 180
}

// 读取 toiletAll 全部现有记录（_id 游标分页，规避 skip 上限 10000），只取去重所需字段
async function loadAllExisting() {
  const rows = []
  const pageSize = 1000
  let lastId = ''
  while (true) {
    let query = db.collection('toiletAll')
    if (lastId) query = query.where({ _id: _.gt(lastId) })
    const res = await query
      .orderBy('_id', 'asc')
      .limit(pageSize)
      .field({ name: true, lat: true, lng: true })
      .get()
    const data = res.data || []
    rows.push(...data)
    if (data.length < pageSize) break
    lastId = data[data.length - 1]._id
  }
  return rows
}

async function batchInsert(records, existing, concurrency, maxMillis) {
  const startTime = Date.now()
  let inserted = 0
  let skipped = 0
  let failed = 0
  // 同名分桶：只对同名校验 50 米内距离，避免 O(全部现有 × 待导入) 的距离计算
  const byName = new Map()
  for (const t of existing) {
    const n = t.name || '公共厕所'
    if (!byName.has(n)) byName.set(n, [])
    byName.get(n).push(t)
  }
  const isDup = (lat, lng, name) => {
    const bucket = byName.get(name)
    if (!bucket) return false
    for (const t of bucket) {
      if (isValidCoordinate(t.lat, t.lng) && getDistance(lat, lng, Number(t.lat), Number(t.lng)) <= 50) return true
    }
    return false
  }
  const docs = []
  for (const rec of records) {
    const lat = Number(rec.lat)
    const lng = Number(rec.lng)
    const name = rec.name || '公共厕所'
    if (!isValidCoordinate(lat, lng)) { skipped++; continue }
    if (isDup(lat, lng, name)) { skipped++; continue }
    docs.push({
      lat,
      lng,
      loc: db.Geo.Point(lng, lat),
      name,
      address: rec.address || '',
      city: rec.city || '',
      district: rec.district || '',
      source: ['osm', 'amap', 'chain'].indexOf(rec.source) >= 0 ? rec.source : 'tencent',
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
    })
  }
  const BATCH = 20
  for (let i = 0; i < docs.length; i += BATCH * concurrency) {
    if (maxMillis > 0 && Date.now() - startTime > maxMillis) {
      return { inserted, skipped, failed, partial: true, pending: docs.length - i }
    }
    const slice = docs.slice(i, i + BATCH * concurrency)
    const jobs = []
    for (let j = 0; j < slice.length; j += BATCH) jobs.push(slice.slice(j, j + BATCH))
    const results = await Promise.all(jobs.map(async (batchDocs) => {
      try {
        await db.collection('toiletAll').add({ data: batchDocs })
        return batchDocs.length
      } catch (err) {
        // 批量写入失败：降级为逐条，保证不丢数据
        let ok = 0
        for (const d of batchDocs) {
          try { await db.collection('toiletAll').add({ data: d }); ok++ }
          catch (e) { failed++; console.error('[importCityToilets] 写入失败', d.name, e) }
        }
        return ok
      }
    }))
    inserted += results.reduce((a, b) => a + b, 0)
    if (i % 2000 === 0) console.log('[importCityToilets] 写入进度', i, '/', docs.length)
  }
  return { inserted, skipped, failed, partial: false, pending: 0 }
}

exports.main = async (event = {}) => {
  const start = Date.now()
  const startIdx = Math.max(0, Number(event.start) || 0)
  const limit = Math.max(0, Number(event.limit) || 0)
  const maxMillis = Number(event.maxMillis) > 0 ? Number(event.maxMillis) : 2500
  const batch = limit > 0 ? TOILETS.slice(startIdx, startIdx + limit) : TOILETS
  const bySource = {}
  for (const r of batch) bySource[r.source] = (bySource[r.source] || 0) + 1
  console.log('[importCityToilets] 待导入', batch.length, '条（区间', startIdx, '-', startIdx + batch.length, '/', TOILETS.length, '）', JSON.stringify(bySource))
  const existing = await loadAllExisting()
  console.log('[importCityToilets] 库内现有记录', existing.length, '条，开始去重导入')
  const result = await batchInsert(batch, existing, 8, maxMillis)
  const used = Date.now() - start
  const msg = result.partial
    ? `本片未完成（${used}ms 已达预算）：新增 ${result.inserted}，跳过 ${result.skipped}，失败 ${result.failed}，剩余 ${result.pending}，请再次调用续导`
    : `导入完成：新增 ${result.inserted}，跳过 ${result.skipped}（已存在/非法），失败 ${result.failed}，耗时 ${used}ms`
  return {
    code: result.partial ? 2 : 0,
    msg,
    total: batch.length,
    inserted: result.inserted,
    skipped: result.skipped,
    failed: result.failed,
    partial: result.partial
  }
}
