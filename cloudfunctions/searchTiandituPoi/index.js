/**
 * 云函数 searchTiandituPoi（天地图周边公厕搜索代理，第四数据源）
 * 用途：天地图 Key 分「浏览器端 / 服务端」两种权限类型。小程序 wx.request 直连会被天地图识别为
 *       浏览器端访问，若使用「服务端」类型 Key 会返回 403（code 301013 权限类型错误）。
 *       因此本函数以服务端身份调用天地图接口，前端通过 wx.cloud.callFunction 调本函数，规避权限限制。
 * 说明：
 * 1. 天地图返回 CGCS2000（≈WGS-84）坐标，本函数统一转换为 GCJ-02（小程序 map 坐标系）。
 * 2. 接口：https://api.tianditu.gov.cn/v2/search（旧版 /search 已失效返回 404），queryType=3 周边搜索。
 * 3. 多关键词：天地图 keyWord 单次只支持一个词，本函数按 SEARCH_KEYWORDS 逐词查询后做「同名 50 米」去重合并，
 *    显著提升召回率；每个关键词独立一次请求，配额/鉴权类错误立即停止后续关键词，避免无效消耗。
 * 4. 前端 searchPoiWithFallback 四源并行调用本函数；接口异常只记录日志，不影响主查询流程与次数消耗。
 * 5. Key 在天地图控制台（https://console.tianditu.gov.cn/）申请，类型必须选「服务端」；按天配额，当日用尽自动跳过。
 *
 * 云端测试入参示例：{ "latitude": 21.44182, "longitude": 110.77824, "radius": 3000 }
 */
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const { TIANDITU_KEY } = require('./key')

// 天地图「服务端」Key（在 https://console.tianditu.gov.cn/ 申请；更换 Key 直接替换此处）
const TIANDITU_SEARCH_URL = 'https://api.tianditu.gov.cn/v2/search'
const REQUEST_TIMEOUT = 8000
// 公厕多关键词：逐词查询合并，提升召回率（天地图对部分关键词命中偏少，多词互补）
const SEARCH_KEYWORDS = ['公共厕所', '公厕', '卫生间', '洗手间', '公共卫生间', '旅游厕所']

// CGCS2000≈WGS-84 → GCJ-02 火星坐标转换（标准算法，与前端保持一致）
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

function isValidCoordinate(lat, lng) {
  const la = Number(lat)
  const ln = Number(lng)
  return isFinite(la) && isFinite(ln) && la >= -90 && la <= 90 && ln >= -180 && ln <= 180
}

// 同名且 50 米内去重（跨关键词合并）
function dedupe(list) {
  const result = []
  for (const item of list) {
    let dup = false
    for (const t of result) {
      const d = getDistance(t.lat, t.lng, item.lat, item.lng)
      if (isFinite(d) && t.name === item.name && d <= 50) { dup = true; break }
    }
    if (!dup) result.push(item)
  }
  return result
}

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

// 通用 HTTP GET 请求
function request(url) {
  return new Promise((resolve, reject) => {
    let u
    try { u = new URL(url) } catch (e) { reject(e); return }
    const req = https.get(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        timeout: REQUEST_TIMEOUT,
        headers: { 'User-Agent': 'QuNaLaToiletFinder/1.0 (WeChat Mini Program)' }
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
      }
    )
    req.on('timeout', () => { req.destroy(new Error('request timeout')) })
    req.on('error', reject)
  })
}

// 关键词请求间隔（毫秒）：规避天地图 QPS 限流（HTTP 429）
const KEYWORD_DELAY_MS = 300
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 单关键词查询：返回 { ok, list, errCode, errMsg }
async function queryKeyword(keyword, latitude, longitude, radius) {
  const latSpan = radius / 111000
  const lngSpan = radius / (111000 * Math.cos((latitude * Math.PI) / 180))
  const mapBound = [
    (longitude - lngSpan).toFixed(6),
    (latitude - latSpan).toFixed(6),
    (longitude + lngSpan).toFixed(6),
    (latitude + latSpan).toFixed(6)
  ].join(',')
  const postStr = JSON.stringify({
    keyWord: keyword,
    level: '17',
    mapBound,
    queryType: '3',
    pointLonlat: longitude + ',' + latitude,
    queryRadius: radius,
    count: '20',
    start: '0'
  })
  const url = TIANDITU_SEARCH_URL + '?postStr=' + encodeURIComponent(postStr) + '&type=query&tk=' + TIANDITU_KEY
  const res = await request(url)
  if (res.statusCode !== 200) {
    // 429 = 触发天地图 QPS 限流，返回专用错误码供上层立即停止后续关键词
    if (res.statusCode === 429) {
      return { ok: false, list: [], errCode: -429, errMsg: 'HTTP 429 请求过于频繁（天地图QPS限流）' }
    }
    return { ok: false, list: [], errCode: -2, errMsg: 'HTTP ' + res.statusCode }
  }
  const body = JSON.parse(res.body)
  // v2 接口成功状态为 status.infocode===1000；旧版 /search 为 status==='0'，兼容两者
  const ok = (body.status && body.status.infocode === 1000) || body.status === '0'
  if (!ok) {
    const errCode = (body.status && body.status.infocode) || body.status || body.code || -3
    return { ok: false, list: [], errCode, errMsg: body.msg || (body.status && body.status.cndesc) || '查询失败' }
  }
  if (!Array.isArray(body.pois)) {
    return { ok: true, list: [], errCode: 0 }
  }
  const list = []
  for (const item of body.pois) {
    const loc = String(item.lonlat || '').split(',')
    const wgsLng = parseFloat(loc[0])
    const wgsLat = parseFloat(loc[1])
    if (!isValidCoordinate(wgsLat, wgsLng)) continue
    const g = wgs84ToGcj02(wgsLat, wgsLng)
    list.push({
      name: item.name || '公共厕所',
      address: item.address || '',
      lat: g.lat,
      lng: g.lng,
      source: 'tianditu',
      distance: item.distance || ''
    })
  }
  return { ok: true, list, errCode: 0 }
}

exports.main = async (event = {}) => {
  const latitude = Number(event.latitude)
  const longitude = Number(event.longitude)
  const radius = Number(event.radius) || 3000
  if (!isValidCoordinate(latitude, longitude)) {
    return { code: -1, msg: '经纬度非法', list: [] }
  }
  try {
    const all = []
    let firstErrCode = 0
    let firstErrMsg = ''
    // 逐关键词查询：配额/鉴权类错误立即停止，避免无效消耗；单个词失败不阻断其余词
    for (let index = 0; index < SEARCH_KEYWORDS.length; index++) {
      const keyword = SEARCH_KEYWORDS[index]
      const r = await queryKeyword(keyword, latitude, longitude, radius)
      if (r.ok) {
        console.log('[searchTiandituPoi] 关键词=', keyword, '返回=', r.list.length)
        all.push(...r.list)
      } else {
        console.warn('[searchTiandituPoi] 关键词=', keyword, '失败 errCode=', r.errCode, 'msg=', r.errMsg)
        if (!firstErrCode) { firstErrCode = r.errCode; firstErrMsg = r.errMsg }
        // 已知配额/限流/鉴权类错误码：429 QPS限流、1003 当日调用量超限、301013 权限类型错误、3008 无权限
        if (r.errCode === -429 || r.errCode === 1003 || r.errCode === 301013 || r.errCode === 3008) break
      }
      // 请求之间统一加间隔，规避 QPS 限流（最后一个关键词无需等待）
      if (index < SEARCH_KEYWORDS.length - 1) {
        await sleep(KEYWORD_DELAY_MS)
      }
    }
    const list = dedupe(all)
    console.log('[searchTiandituPoi] 多关键词合并后有效点位=', list.length, '| 半径=', radius, '| 首个错误码=', firstErrCode)
    return { code: 0, msg: 'ok', list, warnErrCode: firstErrCode }
  } catch (err) {
    console.error('[searchTiandituPoi] 查询失败（完整错误）', err)
    return { code: -4, msg: (err && err.message) || '查询失败', list: [] }
  }
}
