/**
 * 云函数：importOpenDataToilets（公厕开放数据批量导入工具）
 * 数据源：
 *   1. 山东省公共数据开放网 16 个区县目录（威海/淄博/滨州/潍坊/烟台/德州/济宁/济南莱芜等，原始坐标 CGCS2000≈WGS-84）
 *   2. GitHub chcorophyll/Free-Public-Toilet-Map（海口，源自高德 POI，已为 GCJ-02）
 * 坐标说明：微信小程序 map 使用 GCJ-02。
 *   - 山东目录默认执行 wgs84→gcj02 转换；若人工核对发现某批数据已是 GCJ-02，
 *     可在云端测试传参 { coordType: 'gcj02' } 跳过转换。
 * 幂等：每条记录生成稳定 importKey = open_v1_<data.js 下标>，重复执行不产生重复数据；
 *       另与 toiletAll 中「同名 + 50 米内」的旧记录（无 importKey 的历史数据）做距离去重。
 * 分片：event = { start, limit, maxMillis }，云函数 60s 超时可反复续导（maxMillis 默认 2500ms）。
 * 使用：部署后在云开发控制台对该函数执行「云端测试」即可触发导入。
 */
const cloud = require('wx-server-sdk')
const TOILETS = require('./data.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

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

// WGS-84（CGCS2000 可近似等同）→ GCJ-02 火星坐标转换
function wgs84ToGcj02(lat, lng) {
  const a = 6378245.0
  const ee = 0.00669342162296594323
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) return { lat: Number(lat), lng: Number(lng) }
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - ee * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI)
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI)
  return { lat: Number(lat) + dLat, lng: Number(lng) + dLng }
}
function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0
  ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0
  return ret
}
function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0
  ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0
  return ret
}

async function loadLegacyRecords() {
  const rows = []
  try {
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
  } catch (err) {
    console.warn('[importOpenDataToilets] 读取旧记录失败（toiletAll 可能为空），按无重复处理', err)
  }
  return rows
}

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
      source: rec.source || 'gov',
      govSrcId: rec.govSrcId || '',
      tags: rec.tags || [],
      invalid: false,
      hasPaper: false,
      isCharge: false,
      isBarrierFree: !!rec.isBarrierFree,
      hasBabyRoom: !!rec.hasBabyRoom,
      isOpen24h: !!rec.isOpen24h,
      openTime: rec.openTime || '',
      feeType: rec.feeType || 'free',
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
        let ok = 0
        for (const d of batchDocs) {
          try { await db.collection('toiletAll').add({ data: d }); ok++ }
          catch (e) { failed++; console.error('[importOpenDataToilets] 写入失败', d.name, e) }
        }
        return ok
      }
    }))
    inserted += results.reduce((a, b) => a + b, 0)
  }
  return { inserted, skipped, failed, partial: false, pending: 0 }
}

exports.main = async (event = {}) => {
  const started = Date.now()
  const startIdx = Math.max(0, Number(event.start) || 0)
  const limit = Math.max(0, Number(event.limit) || 0)
  const maxMillis = Number(event.maxMillis) > 0 ? Number(event.maxMillis) : 2500
  const batch = limit > 0 ? TOILETS.slice(startIdx, startIdx + limit) : TOILETS
  const records = batch.map((r, i) => Object.assign({}, r, { importKey: 'open_v1_' + (startIdx + i) }))
  const byCity = {}
  for (const r of records) byCity[r.city] = (byCity[r.city] || 0) + 1
  console.log('[importOpenDataToilets] 待导入', records.length, '条（区间', startIdx, '-', startIdx + records.length, '/', TOILETS.length, '）', JSON.stringify(byCity))
  const legacyRows = await loadLegacyRecords()
  const existingKeys = await loadExistingKeys(records.map((r) => r.importKey))
  console.log('[importOpenDataToilets] 旧记录(无importKey)=', legacyRows.length, '条，本片已存在', existingKeys.size, '条')
  const result = await batchInsert(records, legacyRows, existingKeys, maxMillis)
  const used = Date.now() - started
  const msg = result.partial
    ? `本片未完成（${used}ms 已达预算）：新增 ${result.inserted}，跳过 ${result.skipped}，失败 ${result.failed}，剩余 ${result.pending}，请再次调用续导`
    : `导入完成：新增 ${result.inserted}，跳过 ${result.skipped}（已存在/非法/50米内同名），失败 ${result.failed}，耗时 ${used}ms`
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