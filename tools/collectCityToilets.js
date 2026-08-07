/**
 * 城市公厕 POI 批量采集工具（B：网格扩城 + E：连锁洗手间）
 * 数据源：高德地图 place/around（types=200300 公共厕所，GCJ-02）+ place/text（连锁品牌）
 * 说明：百度需 Referer/SN 校验、腾讯今日配额已耗尽，本工具当前仅用高德；如后续有可用 key 可扩展。
 * 用法：
 *   node tools/collectCityToilets.js --all          # 采集全部城市
 *   node tools/collectCityToilets.js --city 北京     # 只采北京
 *   node tools/collectCityToilets.js --chains 北京   # 只采连锁洗手间
 * 输出：tools/output/<city>.json（最终去重点位）、tools/output/progress-<city>.json（断点续采）
 */
const https = require('https')
const fs = require('fs')
const path = require('path')

// ============ 配置 ============
const AMAP_KEY = process.env.AMAP_KEY || '5ad7207ca36306e6559d30ed02ef37bc'
const AMAP_MAX_CONCURRENCY = 3      // 高德个人开发者并发上限，超限报 10045
const GRID_RADIUS = 2000            // 每格查询半径（米）
const GRID_STEP = 2800              // 网格间距（米），略小于 1.4×半径，保证覆盖重叠
const MAX_PAGES_PER_CELL = 4        // offset=25，最多取前 100 条/格
const MAX_RETRY = 3                 // 单格失败重试次数

// 城市配置：[西经, 南纬, 东经, 北纬]（GCJ-02，只覆盖主城区核心区）
const CITIES = {
  '北京': [116.05, 39.70, 116.75, 40.15],
  '上海': [121.30, 31.05, 121.70, 31.35],
  '广州': [113.15, 23.02, 113.45, 23.22],
  '深圳': [113.80, 22.45, 114.35, 22.65],
  '成都': [103.90, 30.52, 104.25, 30.75],
  '杭州': [119.95, 30.15, 120.35, 30.38],
  '重庆': [106.35, 29.45, 106.70, 29.70],
  '西安': [108.80, 34.15, 109.10, 34.40],
  '南京': [118.65, 31.95, 118.95, 32.15],
  '郑州': [113.50, 34.65, 113.80, 34.85]
}
// 连锁品牌（E：连锁洗手间），name 统一加「-洗手间」后缀，source='chain'
const CHAIN_BRANDS = ['肯德基', '麦当劳', '星巴克', '瑞幸咖啡']

const OUT_DIR = path.join(__dirname, 'output')
fs.mkdirSync(OUT_DIR, { recursive: true })

// ============ 工具函数 ============
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
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

// 全局并发信号量（与小程序端 AMAP_MAX_CONCURRENCY=3 一致，避免 10045 并发超限）
let active = 0
const queue = []
function enqueue(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject })
    pump()
  })
}
function pump() {
  while (active < AMAP_MAX_CONCURRENCY && queue.length) {
    const { fn, resolve, reject } = queue.shift()
    active++
    fn().then(resolve, reject).finally(() => { active--; pump() })
  }
}

function amapGet(url, retry = 0) {
  return enqueue(() => new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      const chunks = []
      res.on('data', (d) => chunks.push(d))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
    req.on('timeout', () => { req.destroy(); reject(new Error('amap timeout')) })
    req.on('error', (e) => reject(e))
  })).then(async (text) => {
    let json
    try { json = JSON.parse(text) } catch (e) { throw new Error('amap bad json: ' + text.slice(0, 100)) }
    if (json.status === '1') return json
    const code = json.infocode
    // 限流/并发类错误：退避重试；连续失败由上层决定是否放弃该格
    if (code === '10021' || code === '10045' || code === '10003') {
      if (retry < MAX_RETRY) {
        await sleep(2000 * (retry + 1))
        return amapGet(url, retry + 1)
      }
      throw new Error('amap limit code=' + code + ' msg=' + (json.info || ''))
    }
    throw new Error('amap err code=' + code + ' msg=' + (json.info || ''))
  })
}

// ============ 去重 ============
function makeDeduper() {
  const arr = []
  return {
    add(item) {
      // 同名 + 50 米内视为重复；或任意名 25 米内视为重复（网格重叠）
      for (const it of arr) {
        if (!isValid(it.lat, it.lng) || !isValid(item.lat, item.lng)) continue
        const d = haversine(item.lat, item.lng, it.lat, it.lng)
        if (d <= 25) return false
        if (d <= 50 && it.name === item.name) return false
      }
      arr.push(item)
      return true
    },
    all() { return arr }
  }
}

// ============ 网格采集（B） ============
function buildGrid(box) {
  const [w, s, e, n] = box
  const midLat = (s + n) / 2
  const dLat = GRID_STEP / 111320
  const dLng = GRID_STEP / (111320 * Math.cos((midLat * Math.PI) / 180))
  const cells = []
  for (let lat = s; lat <= n + dLat / 2; lat += dLat) {
    for (let lng = w; lng <= e + dLng / 2; lng += dLng) {
      if (isValid(lat, lng)) cells.push({ lat: +lat.toFixed(6), lng: +lng.toFixed(6) })
    }
  }
  return cells
}

async function collectGrid(cityName, box) {
  const cells = buildGrid(box)
  const progressFile = path.join(OUT_DIR, 'progress-' + cityName + '.json')
  const done = new Set()
  if (fs.existsSync(progressFile)) {
    try { JSON.parse(fs.readFileSync(progressFile, 'utf8')).forEach((k) => done.add(k)) } catch (e) { console.log('进度文件损坏，重新采集', cityName) }
  }
  const deduper = makeDeduper()
  const skippedCells = []
  let consecutiveFail = 0
  let poiCount = 0
  console.log('[采集]', cityName, '网格', cells.length, '格，已跳过已完成', done.size, '格')
  let cursor = 0
  for (const cell of cells) {
    cursor++
    const key = cell.lat + ',' + cell.lng
    if (done.has(key)) continue
    let got = []
    try {
      for (let page = 1; page <= MAX_PAGES_PER_CELL; page++) {
        const url = 'https://restapi.amap.com/v3/place/around?key=' + AMAP_KEY +
          '&location=' + cell.lng + ',' + cell.lat +
          '&types=200300&radius=' + GRID_RADIUS + '&offset=25&page=' + page + '&extensions=base'
        const json = await amapGet(url)
        const pois = json.pois || []
        for (const p of pois) {
          const [lng, lat] = (p.location || '').split(',').map(Number)
          const rec = { name: p.name || '公共厕所', address: p.address || '', lat, lng, city: cityName, district: p.adname || '', source: 'amap' }
          if (isValid(lat, lng) && deduper.add(rec)) got.push(rec)
        }
        if (pois.length < 25) break
        if (page * 25 >= Number(json.count || 0)) break
      }
    } catch (e) {
      skippedCells.push({ key, err: e.message })
      consecutiveFail++
      console.log('[采集]', cityName, '格失败', key, e.message)
      if (consecutiveFail >= 10) {
        console.log('[熔断]', cityName, '连续失败', consecutiveFail, '格，疑似配额/Key异常，中止本城市采集')
        break
      }
      continue
    }
    consecutiveFail = 0
    poiCount += got.length
    done.add(key)
    if (cursor % 50 === 0 || cursor === cells.length) {
      console.log('[进度]', cityName, cursor + '/' + cells.length, '累计点位', poiCount)
      fs.writeFileSync(progressFile, JSON.stringify([...done]), 'utf8')
    }
  }
  fs.writeFileSync(progressFile, JSON.stringify([...done]), 'utf8')
  return { city: cityName, cells: cells.length, skippedCells: skippedCells.length, points: deduper.all() }
}

// ============ 连锁洗手间（E） ============
async function collectChains(cityName) {
  const deduper = makeDeduper()
  let count = 0
  for (const brand of CHAIN_BRANDS) {
    for (let page = 1; page <= 4; page++) {
      const url = 'https://restapi.amap.com/v3/place/text?key=' + AMAP_KEY +
        '&keywords=' + encodeURIComponent(brand) +
        '&city=' + encodeURIComponent(cityName) +
        '&citylimit=true&offset=25&page=' + page + '&extensions=base'
      let json
      try { json = await amapGet(url) } catch (e) { console.log('[连锁]', cityName, brand, '失败', e.message); break }
      const pois = json.pois || []
      for (const p of pois) {
        const [lng, lat] = (p.location || '').split(',').map(Number)
        const rec = { name: (p.name || brand) + '-洗手间', address: p.address || '', lat, lng, city: cityName, district: p.adname || '', source: 'chain' }
        if (isValid(lat, lng) && deduper.add(rec)) count++
      }
      if (pois.length < 25) break
    }
  }
  console.log('[连锁]', cityName, '品牌洗手间', count, '条')
  return deduper.all()
}

// ============ 主流程 ============
async function main() {
  const args = process.argv.slice(2)
  const all = args.includes('--all')
  const onlyChains = args.includes('--chains')
  let targets = []
  if (all || onlyChains) targets = Object.keys(CITIES)
  else {
    const ci = args.indexOf('--city')
    if (ci >= 0 && args[ci + 1]) targets = [args[ci + 1]]
  }
  if (!targets.length) { console.log('用法：--all | --city <城市> | --chains <城市>'); return }
  console.log('高德 key=', AMAP_KEY.slice(0, 6) + '****', '并发=', AMAP_MAX_CONCURRENCY, '半径=', GRID_RADIUS, '格距=', GRID_STEP)
  const allPoints = []
  for (const name of targets) {
    const box = CITIES[name]
    if (!box) { console.log('未知城市', name); continue }
    let gridPoints = []
    if (!onlyChains) {
      const r = await collectGrid(name, box)
      gridPoints = r.points
      console.log('[汇总]', name, '网格采集点位', gridPoints.length, '，失败格', r.skippedCells)
    }
    const chainPoints = await collectChains(name)
    const cityPoints = [...gridPoints, ...chainPoints]
    fs.writeFileSync(path.join(OUT_DIR, name + '.json'), JSON.stringify(cityPoints, null, 1), 'utf8')
    console.log('[输出]', name + '.json', cityPoints.length, '条')
    allPoints.push(...cityPoints)
  }
  const mergedFile = path.join(OUT_DIR, 'merged.json')
  fs.writeFileSync(mergedFile, JSON.stringify(allPoints, null, 1), 'utf8')
  console.log('[完成] 总计', allPoints.length, '条 →', mergedFile)
}
main().catch((e) => { console.error('FATAL', e); process.exit(1) })