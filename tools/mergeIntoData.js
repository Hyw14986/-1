/**
 * 合并采集结果到 importCityToilets/data.js
 * 1) 读取 tools/output/<城市>.json（10 城 + 连锁洗手间）
 * 2) 读取现有 data.js，按「同名+50米」去重
 * 3) 追加新点位，重写 data.js（UTF-8 无 BOM）
 * 用法：node tools/mergeIntoData.js
 */
const fs = require('fs')
const path = require('path')

const DATA_FILE = path.join(__dirname, '..', 'cloudfunctions', 'importCityToilets', 'data.js')
const OUT_DIR = path.join(__dirname, 'output')

function haversine(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180
  const R = 6371000
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
function isValid(lat, lng) {
  return isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

// 读现有 data.js
const oldSrc = fs.readFileSync(DATA_FILE, 'utf8')
const existing = eval(oldSrc.replace(/^\/\/.*$/gm, '').replace(/module\.exports\s*=\s*/, ''))
console.log('现有记录数=', existing.length)

const cityFiles = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('progress-') && f !== 'merged.json')
const bySource = {}
let added = 0
let dup = 0
const newRecords = []
for (const f of cityFiles.sort()) {
  const city = f.replace('.json', '')
  const recs = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'))
  let cityAdded = 0
  for (const r of recs) {
    if (!isValid(r.lat, r.lng)) continue
    const name = r.name || '公共厕所'
    // 与现有库去重
    let isDup = false
    for (const t of existing) {
      if (!isValid(t.lat, t.lng)) continue
      const d = haversine(r.lat, r.lng, Number(t.lat), Number(t.lng))
      if (d <= 50 && (t.name || '') === name) { isDup = true; break }
      if (d <= 25) { isDup = true; break }
    }
    if (isDup) { dup++; continue }
    existing.push({ lat: r.lat, lng: r.lng, name, address: r.address || '', city: r.city || city, district: r.district || '', source: r.source || 'amap' })
    newRecords.push({ lat: r.lat, lng: r.lng, name, address: r.address || '', city: r.city || city, district: r.district || '', source: r.source || 'amap' })
    bySource[r.source || 'amap'] = (bySource[r.source || 'amap'] || 0) + 1
    added++
    cityAdded++
  }
  console.log(city, '采集', recs.length, '条，新增', cityAdded)
}
console.log('新增合计=', added, '重复=', dup, '按来源=', JSON.stringify(bySource))

const now = new Date().toISOString()
const header = [
  '// 城市公厕批量导入数据（高德POI网格采集 + 连锁洗手间 + 历史腾讯/OSM数据，已统一为 GCJ-02）',
  '// 生成时间: ' + now,
  '// 说明：',
  '//  - tencent/osm 为历史数据（武汉/湛江早期采集）',
  '//  - amap 为高德 place/around（types=200300）网格遍历采集：武汉/湛江/吴川（半径2500m）+ 北京/上海/广州/深圳/成都/杭州/重庆/西安/南京/郑州（半径2000m 格距2800m，2026-08-08）',
  '//  - chain 为连锁品牌洗手间（肯德基/麦当劳/星巴克/瑞幸咖啡，place/text 采集，name 已加「-洗手间」后缀，2026-08-08）',
  '// 字段：name 名称、address 地址、lat/lng（GCJ-02）、city 城市、district 区县、source 数据来源(tencent/osm/amap/chain)',
  'module.exports = ' + JSON.stringify(existing) + '\n'
].join('\n')
fs.writeFileSync(DATA_FILE, header, 'utf8')
console.log('写入 data.js 完成，总记录=', existing.length, '，文件大小=', (fs.statSync(DATA_FILE).size / 1024 / 1024).toFixed(2) + 'MB')