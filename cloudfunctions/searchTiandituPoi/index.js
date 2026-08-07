/**
 * 云函数 searchTiandituPoi（天地图周边公厕搜索代理，第四数据源）
 * 用途：天地图 Key 分「浏览器端 / 服务端」两种权限类型。小程序 wx.request 直连会被天地图识别为
 *       浏览器端访问，若使用「服务端」类型 Key 会返回 403（code 301013 权限类型错误）。
 *       因此本函数以服务端身份调用天地图接口，前端通过 wx.cloud.callFunction 调本函数，规避权限限制。
 * 说明：
 * 1. 天地图返回 CGCS2000（≈WGS-84）坐标，本函数统一转换为 GCJ-02（小程序 map 坐标系）。
 * 2. 接口：https://api.tianditu.gov.cn/v2/search（旧版 /search 已失效返回 404），queryType=3 周边搜索。
 * 3. 前端 searchPoiWithFallback 四源并行调用本函数；接口异常只记录日志，不影响主查询流程与次数消耗。
 * 4. Key 在天地图控制台（https://console.tianditu.gov.cn/）申请，类型必须选「服务端」；按天配额，当日用尽自动跳过。
 *
 * 云端测试入参示例：{ "latitude": 21.44182, "longitude": 110.77824, "radius": 3000 }
 */
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 天地图「服务端」Key（在 https://console.tianditu.gov.cn/ 申请；更换 Key 直接替换此处）
const TIANDITU_KEY = 'efac1d7241be6075e3b3a653e0acdc69'
const TIANDITU_SEARCH_URL = 'https://api.tianditu.gov.cn/v2/search'
const REQUEST_TIMEOUT = 8000
const SEARCH_KEYWORD = '公共厕所'

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

exports.main = async (event = {}) => {
  const latitude = Number(event.latitude)
  const longitude = Number(event.longitude)
  const radius = Number(event.radius) || 3000
  if (!isValidCoordinate(latitude, longitude)) {
    return { code: -1, msg: '经纬度非法', list: [] }
  }
  try {
    // mapBound 取搜索圆的外接矩形，满足官方必填要求
    const latSpan = radius / 111000
    const lngSpan = radius / (111000 * Math.cos((latitude * Math.PI) / 180))
    const mapBound = [
      (longitude - lngSpan).toFixed(6),
      (latitude - latSpan).toFixed(6),
      (longitude + lngSpan).toFixed(6),
      (latitude + latSpan).toFixed(6)
    ].join(',')
    const postStr = JSON.stringify({
      keyWord: SEARCH_KEYWORD,
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
      console.warn('[searchTiandituPoi] HTTP 非 200', res.statusCode, String(res.body).slice(0, 200))
      return { code: -2, msg: 'HTTP ' + res.statusCode, list: [] }
    }
    const body = JSON.parse(res.body)
    // v2 接口成功状态为 status.infocode===1000；旧版 /search 为 status==='0'，兼容两者
    const ok = (body.status && body.status.infocode === 1000) || body.status === '0'
    if (!ok) {
      console.warn('[searchTiandituPoi] 接口返回非成功', JSON.stringify(body))
      const errCode = (body.status && body.status.infocode) || body.status || body.code || -3
      return { code: errCode, msg: body.msg || (body.status && body.status.cndesc) || '查询失败', list: [] }
    }
    if (!Array.isArray(body.pois)) {
      console.warn('[searchTiandituPoi] 无 pois 数组', JSON.stringify(body).slice(0, 300))
      return { code: 0, msg: 'ok', list: [] }
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
    console.log('[searchTiandituPoi] 原始 POI=', (body.pois || []).length, '有效点位=', list.length, '半径=', radius)
    return { code: 0, msg: 'ok', list }
  } catch (err) {
    console.error('[searchTiandituPoi] 查询失败（完整错误）', err)
    return { code: -4, msg: (err && err.message) || '查询失败', list: [] }
  }
}
