/**
 * 云函数 fetchOsmToilet（OpenStreetMap Overpass 兜底查询）
 * 用途：腾讯/高德/百度 POI 均失败或为空时，从 OpenStreetMap 查询附近公共厕所点位，
 *       作为免费兜底数据源。OSM 在中国覆盖稀疏，仅作补充，不作为主数据源。
 *
 * 说明：
 * 1. OSM 返回 WGS-84 坐标，本函数统一转换为 GCJ-02（微信小程序 map 坐标系）。
 * 2. Overpass 公共实例不稳定，内置多镜像依次重试；请求带 User-Agent，遵守 ODbL 与实例负载策略。
 * 3. 由前端 searchPoiWithFallback 最后一级调用；接口异常只记录日志，不影响主查询流程与次数消耗。
 *
 * 云端测试入参示例：{ "latitude": 30.5928, "longitude": 114.3055, "radius": 5000 }
 */
const cloud = require('wx-server-sdk')
const https = require('https')
const http = require('http')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// Overpass 公共实例列表（按稳定性排序；overpass.osm.ch 为瑞士专属镜像，仅作最后兜底）
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
  'https://overpass.osm.ch/api/interpreter'
]
const MIRROR_TIMEOUT = 9000 // 单个实例超时（毫秒）

// 通用 HTTP POST 请求（application/x-www-form-urlencoded 提交 Overpass QL）
function request(url, formBody, timeout) {
  return new Promise((resolve, reject) => {
    let u
    try { u = new URL(url) } catch (e) { reject(e); return }
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formBody),
          'User-Agent': 'QuNaLaToiletFinder/1.0 (WeChat Mini Program; contact: dev@example.com)'
        },
        timeout
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
      }
    )
    req.on('timeout', () => { req.destroy(new Error('request timeout')) })
    req.on('error', reject)
    req.write(formBody)
    req.end()
  })
}

// WGS-84 → GCJ-02 火星坐标转换（标准算法）
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

// 依次尝试各 Overpass 镜像，返回第一个可用的结果
async function queryOverpass(latitude, longitude, radius) {
  // Overpass QL：查询圆形范围内的 amenity=toilets 节点
  const ql = '[out:json][timeout:15];node["amenity"="toilets"](around:' + radius + ',' + latitude + ',' + longitude + ');out 50;'
  const body = 'data=' + encodeURIComponent(ql)
  let lastErr = ''
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      console.log('[fetchOsmToilet] 尝试镜像', mirror)
      const res = await request(mirror, body, MIRROR_TIMEOUT)
      if (res.statusCode !== 200) {
        lastErr = 'HTTP ' + res.statusCode
        console.warn('[fetchOsmToilet] 镜像返回非 200', mirror, res.statusCode)
        continue
      }
      const json = JSON.parse(res.body)
      if (!json || !Array.isArray(json.elements)) {
        lastErr = '非法返回体'
        console.warn('[fetchOsmToilet] 镜像返回非 JSON 结构', mirror, String(res.body).slice(0, 200))
        continue
      }
      return { mirror, elements: json.elements }
    } catch (err) {
      lastErr = (err && err.message) || String(err)
      console.warn('[fetchOsmToilet] 镜像请求失败', mirror, lastErr)
    }
  }
  throw new Error('所有 Overpass 镜像均不可用：' + lastErr)
}

exports.main = async (event = {}) => {
  const latitude = Number(event.latitude)
  const longitude = Number(event.longitude)
  const radius = Number(event.radius) || 5000
  if (!isValidCoordinate(latitude, longitude)) {
    return { code: -1, msg: '经纬度非法', list: [] }
  }
  try {
    const { mirror, elements } = await queryOverpass(latitude, longitude, radius)
    const list = []
    for (const el of elements) {
      if (el.type !== 'node' || !isValidCoordinate(el.lat, el.lon)) continue
      // 名称优先取 name，其次取 operator/ref，都没有则给通用名
      const tags = el.tags || {}
      const name = tags.name || tags.operator || '公共厕所'
      const g = wgs84ToGcj02(el.lat, el.lon)
      list.push({
        name,
        address: tags['addr:full'] || tags['addr:street'] || '',
        lat: g.lat,
        lng: g.lng,
        source: 'osm',
        osmId: el.id,
        mirror
      })
    }
    console.log('[fetchOsmToilet] 镜像=', mirror, 'OSM 原始节点=', elements.length, '有效点位=', list.length)
    return { code: 0, msg: 'ok', list }
  } catch (err) {
    console.error('[fetchOsmToilet] 查询失败（完整错误）', err)
    return { code: -2, msg: (err && err.message) || '查询失败', list: [] }
  }
}