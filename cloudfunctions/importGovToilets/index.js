/**
 * 云函数 importGovToilets（政府开放数据批量导入工具）
 * 用途：把 data.js 中整理的政府开放数据公厕点位写入 toiletAll
 *       当前数据集：达州市宣汉县旅游厕所 45 条 + 宿迁市洋河新区公厕 34 条（来源：达州市/宿迁市公共数据开放平台，原始坐标 CGCS2000≈WGS-84）
 * 数据字段：name、address、lat/lng（原始坐标）、city、district、charge、source=gov、srcId 平台编号
 *
 * 坐标系说明：政府开放数据平台一般发布 CGCS2000（与 WGS-84 误差约 1 米），
 * 而微信小程序 map 使用 GCJ-02，因此入库时默认执行 wgs84→gcj02 转换。
 * 若人工核对发现数据本身已是 GCJ-02，可在云端测试入参传 { coordType: 'gcj02' } 跳过转换。
 *
 * 幂等：写入前按「同名 + 50 米内」与 toiletAll 现有记录去重，重复执行不会产生重复数据；
 * 可直接在云开发控制台对本函数执行「云端测试」触发。
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

// WGS-84（CGCS2000 可近似等同）→ GCJ-02 火星坐标转换（标准算法，用于微信小程序 map）
function wgs84ToGcj02(lat, lng) {
  const a = 6378245.0
  const ee = 0.00669342162296594323
  const outOfChina = (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271)
  if (outOfChina) return { lat: Number(lat), lng: Number(lng) }
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
    console.warn('[importGovToilets] 读取现有记录失败（toiletAll 可能未创建，按无重复处理）', err)
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
            source: 'gov',
            govSrcId: rec.srcId || '',
            invalid: false,
            hasPaper: false,
            isCharge: false,
            isBarrierFree: false,
            hasBabyRoom: false,
            isOpen24h: false,
            openTime: rec.openTime || '',
            feeType: 'free',
            feeDesc: rec.charge || '',
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
        console.error('[importGovToilets] 写入失败', name, err)
      }
    }))
  }
  return { inserted, skipped, failed }
}

exports.main = async (event = {}) => {
  const start = Date.now()
  // coordType: 'wgs84'（默认，政府数据通常为 CGCS2000≈WGS-84，转 GCJ-02） | 'gcj02'（跳过转换）
  const coordType = event.coordType === 'gcj02' ? 'gcj02' : 'wgs84'
  console.log('[importGovToilets] 待导入', TOILETS.length, '条 | coordType=', coordType)

  const prepared = TOILETS.map((r) => {
    if (!isValidCoordinate(r.lat, r.lng)) return r
    if (coordType === 'gcj02') return r
    const g = wgs84ToGcj02(Number(r.lat), Number(r.lng))
    return { ...r, lat: g.lat, lng: g.lng }
  })
  // 打印转换前后首条坐标，便于人工核对
  if (prepared[0]) {
    console.log('[importGovToilets] 坐标转换示例（前3条）：', prepared.slice(0, 3).map((r) => r.name + ' -> ' + r.lat.toFixed(6) + ',' + r.lng.toFixed(6)).join(' | '))
  }

  const existing = await loadAllExisting()
  console.log('[importGovToilets] 库内现有记录', existing.length, '条，开始去重导入')
  const { inserted, skipped, failed } = await batchInsert(prepared, existing, 8)
  const used = Date.now() - start
  return {
    code: 0,
    msg: '导入完成：新增 ' + inserted + '，跳过 ' + skipped + '（已存在/非法），失败 ' + failed + '，耗时 ' + used + 'ms',
    total: prepared.length,
    coordType,
    inserted,
    skipped,
    failed
  }
}