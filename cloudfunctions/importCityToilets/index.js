/**
 * 云函数 importCityToilets（城市公厕批量导入工具）- importKey 增量去重版
 * 用途：把 data.js 中爬取的城市公厕点位（武汉/湛江/北京/上海/广州/深圳/成都/杭州/重庆/西安/南京/郑州，GCJ-02）写入 toiletAll
 * API 与旧版兼容：event = { start, limit, maxMillis } 分片导入，幂等（重复执行不产生重复数据）
 * 设计要点（解决云函数 3s 超时 + 库变大后全表扫描卡死）：
 *  1. 每条记录生成稳定 importKey = city_v1_<data.js 下标>，用于幂等去重（按 in 分批查询，不读全表）；
 *  2. 仅读取「无 importKey 的旧记录」（数量固定：早期导入的数据）做 50 米内同名去重；
 *     旧版导入的无 importKey 记录靠 50 米同名去重覆盖，避免重复；
 *  3. 支持 event.maxMillis 执行预算：到点提前返回 { partial: true }，可反复续导。
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

// 读取所有「无 importKey」的旧记录（早期导入/手动录入，数量固定），用于 50 米内同名去重
async function loadLegacyRecords() {
  const rows = []
  const pageSize = 1000
  let skip = 0
  while (true) {
    const res = await db.collection('toiletAll')
      .where({ importKey: _.exists(false) })
      .skip(skip)
      .limit(pageSize)
      .field({ name: true, lat: true, lng: true })
      .get()
    const data = res.data || []
    rows.push(...data)
    if (data.length < pageSize) break
    skip += pageSize
  }
  return rows
}

// 分批查询本片 importKey 中已存在的集合
async function loadExistingKeys(keys) {
  const existing = new Set()
  const CHUNK = 200
  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK)
    const res = await db.collection('toiletAll')
      .where({ importKey: _.in(chunk) })
      .field({ importKey: true })
      .limit(chunk.length)
      .get()
    for (const d of res.data || []) existing.add(d.importKey)
  }
  return existing
}

async function batchInsert(records, legacyRows, existingKeys, maxMillis) {
  const startTime = Date.now()
  let inserted = 0
  let skipped = 0
  let failed = 0
  // 旧记录按名称分桶，只对同名校验 50 米内距离
  const byName = new Map()
  for (const t of legacyRows) {
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
    if (existingKeys.has(rec.importKey)) { skipped++; continue }
    if (isDup(lat, lng, name)) { skipped++; continue }
    docs.push({
      lat,
      lng,
      loc: db.Geo.Point(lng, lat),
      importKey: rec.importKey,
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
  for (let i = 0; i < docs.length; i += BATCH * 8) {
    if (maxMillis > 0 && Date.now() - startTime > maxMillis) {
      return { inserted, skipped, failed, partial: true, pending: docs.length - i }
    }
    const slice = docs.slice(i, i + BATCH * 8)
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
  const started = Date.now()
  const startIdx = Math.max(0, Number(event.start) || 0)
  const limit = Math.max(0, Number(event.limit) || 0)
  const maxMillis = Number(event.maxMillis) > 0 ? Number(event.maxMillis) : 2500
  const batch = limit > 0 ? TOILETS.slice(startIdx, startIdx + limit) : TOILETS
  // 为每条记录生成稳定 importKey（data.js 下标），保证幂等
  const records = batch.map((r, i) => Object.assign({}, r, { importKey: 'city_v1_' + (startIdx + i) }))
  const bySource = {}
  for (const r of records) bySource[r.source] = (bySource[r.source] || 0) + 1
  console.log('[importCityToilets] 待导入', records.length, '条（区间', startIdx, '-', startIdx + records.length, '/', TOILETS.length, '）', JSON.stringify(bySource))
  // 始终读取无 importKey 的旧记录做 50 米同名去重（旧版导入的数据没有 importKey，必须靠距离去重避免重复）
  const legacyRows = await loadLegacyRecords()
  const existingKeys = await loadExistingKeys(records.map((r) => r.importKey))
  console.log('[importCityToilets] 旧记录(无importKey)=', legacyRows.length, '条，本片已存在=', existingKeys.size, '条')
  const result = await batchInsert(records, legacyRows, existingKeys, maxMillis)
  const used = Date.now() - started
  const msg = result.partial
    ? `本片未完成（${used}ms 已达预算）：新增 ${result.inserted}，跳过 ${result.skipped}，失败 ${result.failed}，剩余 ${result.pending}，请再次调用续导`
    : `导入完成：新增 ${result.inserted}，跳过 ${result.skipped}（已存在/非法），失败 ${result.failed}，耗时 ${used}ms`
  return {
    code: result.partial ? 2 : 0,
    msg,
    total: records.length,
    inserted: result.inserted,
    skipped: result.skipped,
    failed: result.failed,
    partial: result.partial,
    nextStart: result.partial ? startIdx : startIdx + records.length
  }
}
