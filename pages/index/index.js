// pages/index/index.js - 附近厕所主页面
// 核心交互：选择半径（实时预览红圈）→ 点击【开始寻找】→ 渲染红圈 → 加载圈内公厕 → 查询不限次数，成功后才写记录
// 查询分支：①库有数据+POI服务商失败→仅展示本地库；②库空+服务商有数据→正常渲染POI点位；③两边无数据→空状态弹窗；④接口异常→不扣次数提示重试
// 错误处理：所有云函数/地图接口异常均 console.error 打印完整错误对象；球面距离过滤被丢弃点位打印距离，便于排查误过滤
// 数据源：toiletAll 自有库（gov/user/tencent 缓存）+ 腾讯/高德/百度/天地图 POI 多源合并（可降级）
const app = getApp()
const util = require('../../utils/util.js')
const { ensurePrivacyAuthorize } = require('../../utils/privacy.js')
const { QQ_MAP_KEY, AMAP_KEY, BAIDU_AK } = require('../../config/keys.js')

// 腾讯位置服务配置
const QQ_SEARCH_URL = 'https://apis.map.qq.com/ws/place/v1/search'
// 公厕多关键词（各数据源逐词查询后合并去重，显著提升召回率；高德 keywords 支持 | 一次传多词）
const SEARCH_KEYWORDS = ['公共厕所', '公厕', '卫生间', '洗手间', '公共卫生间', '旅游厕所']
const SEARCH_KEYWORD = SEARCH_KEYWORDS[0] // 单关键词兼容
// 各数据源关键词数量：高德/百度设为主流查询（全 6 词）；腾讯配额紧张（每日易触发 status=121）仅查 1 个主词且仅作保底；
// 天地图按天配额较宽松保持全 6 词。修改此处即可调整每个数据源的查询强度
const SOURCE_KEYWORD_COUNT = { tencent: 1, amap: SEARCH_KEYWORDS.length, baidu: SEARCH_KEYWORDS.length, tianditu: SEARCH_KEYWORDS.length }

// 高德地图 Web 服务配置（主流数据源）
const AMAP_SEARCH_URL = 'https://restapi.amap.com/v3/place/around'
// 高德 Web服务 API 并发限制：个人开发者「周边搜索」默认 QPS≈6，超出返回 infocode=10045（QPS 超限）
// 用信号量把高德请求并发控制在 AMAP_MAX_CONCURRENCY=6 以内，超出部分排队依次执行
const AMAP_MAX_CONCURRENCY = 6

// ===== 多数据源并发限制器（防止各地图服务商 API 并发/QPS 超限）=====
// 各服务商免费并发上限不同（百度最容易触发，必须压住）：
//   - 百度 place/v2/search：免费并发上限约 3，超出返回 status=401「并发超限」
//   - 高德 place/around：个人版 QPS≈6，超出返回 infocode=10045（QPS 超限）
//   - 腾讯 place/v1/search：并发敏感且日配额仅 200 次，主动压到 1
//   - 天地图 / OSM：走云函数代理，同样限流防止多轮搜索叠加并发
const BAIDU_MAX_CONCURRENCY = 1 // 百度免费并发/QPS 上限≈3：压到 1 并发 + 全局 1200ms 最小请求间隔（峰值≈0.83 QPS），彻底避免 status=401
const TENCENT_MAX_CONCURRENCY = 1
const TIANDITU_MAX_CONCURRENCY = 2
const OSM_MAX_CONCURRENCY = 2
// 信号量语义：任务入队后只有空闲槽位才执行；doXxxRequest 必须返回 Promise 且 Promise 在
// wx.request 完成/失败后才 resolve，保证槽位被占用到请求真正结束（避免只限制“发起”不限“进行中”）
function createConcurrencyLimiter(name, maxConcurrency) {
  let activeCount = 0
  const waitingQueue = []
  function pump() {
    while (activeCount < maxConcurrency && waitingQueue.length > 0) {
      const item = waitingQueue.shift()
      activeCount++
      // 并发排队日志已按需求移除，避免控制台刷屏（并发限制功能保持不变）
      Promise.resolve().then(item.task).then(
        (res) => { activeCount--; item.resolve(res); pump() },
        (err) => { activeCount--; item.reject(err); pump() }
      )
    }
  }
  return function run(task) {
    return new Promise((resolve, reject) => {
      waitingQueue.push({ task, resolve, reject })
      pump()
    })
  }
}
const runAmapWithLimit = createConcurrencyLimiter('高德', AMAP_MAX_CONCURRENCY)
const runBaiduWithLimit = createConcurrencyLimiter('百度', BAIDU_MAX_CONCURRENCY)
const runTencentWithLimit = createConcurrencyLimiter('腾讯', TENCENT_MAX_CONCURRENCY)
const runTiandituWithLimit = createConcurrencyLimiter('天地图', TIANDITU_MAX_CONCURRENCY)
const runOsmWithLimit = createConcurrencyLimiter('OSM', OSM_MAX_CONCURRENCY)

// 百度地图 Web 服务配置（主流数据源）
// 需在百度地图开放平台（https://lbsyun.baidu.com/）申请「服务端」类型 AK，
// 并到微信公众平台把 https://api.map.baidu.com 加入 request 合法域名
// 并发注意：百度免费并发/QPS 上限≈3，且按秒计数——已用 runBaiduWithLimit 信号量压到并发=1，并叠加全局 1200ms 最小请求间隔，保证单秒请求数 <3
const BAIDU_SEARCH_URL = 'https://api.map.baidu.com/place/v2/search'

// 天地图周边搜索配置（第四数据源：CGCS2000≈WGS-84，需转 GCJ-02 后供小程序 map 使用）
// 重要：天地图 Key 分「浏览器端 / 服务端」两种权限类型，小程序 wx.request 直连会被识别为浏览器端访问；
//       本项目使用「服务端」类型 Key，必须经云函数 searchTiandituPoi 代理查询（服务端访问），
//       否则返回 403（code 301013 权限类型错误）。Key 存放在云函数 searchTiandituPoi/index.js 顶部 TIANDITU_KEY。
// 云函数 searchTiandituPoi 需在微信开发者工具中右键部署后生效；未部署时前端静默跳过该源，不影响其他数据源。
// 云函数出网不受小程序 request 合法域名白名单限制，无需在微信公众平台添加天地图域名。
const TIANDITU_ENABLED = true // 是否启用天地图数据源（依赖云函数 searchTiandituPoi 已部署）

// 多源合并模式：true=并行调用高德/百度/天地图（主流源）并合并点位，仅当主流源均无点位时才查询腾讯保底（配额紧张，省着用）
// false=降级链模式（高德→百度→天地图→腾讯保底→OSM，任一成功即停止，接口调用更省）
const MERGE_ALL_PROVIDERS = true

// 定位失败兜底中心（广州珠江新城）
const DEFAULT_CENTER = { latitude: 23.12908, longitude: 113.3245 }
const LOCATE_TIMEOUT = 8000
const REQUEST_TIMEOUT = 8000

// ===== 趣味功能数据池（纯本地展示，不采集、不上传、无 UGC）=====
// 今日如厕运势（emoji + 签文 + 小提示）
const FORTUNES = [
  { text: '宜疾走，转角即是桃源', tip: '膀胱不是许愿池，别硬憋' },
  { text: '大吉，南边三百步有贵人', tip: '贵人可能是一间干净公厕' },
  { text: '宜轻装简行，忌盲目相信导航', tip: '跟着感觉走，顺便问个路人' },
  { text: '如厕运顺风，坐下即赢', tip: '带包纸巾，胜率翻倍' },
  { text: '今日水逆，厕运逆势上扬', tip: '越急的时候越要稳住呼吸' },
  { text: '宜踩点，忌冲刺', tip: '提前锁定厕所，比什么都重要' },
  { text: '今日运势像自动冲水，一切顺其自然', tip: '别和身体对抗' },
  { text: '适合探索未知的小巷', tip: '好厕所常藏在不起眼的角落' },
  { text: '宜早不宜晚，宜静不宜跑', tip: '从容的人总有好位置' },
  { text: '今日马桶运：水到渠成', tip: '多喝温水，畅通无阻' },
  { text: '忌憋大招', tip: '小问题早点解决' },
  { text: '宜随身带纸，纸就是安全感', tip: '纸巾是当代护身符' },
  { text: '今日幸运方向：离你最近的那扇门', tip: '打开它，世界就亮了' },
  { text: '宜深呼吸，忌原地打转', tip: '先定位，再行动' },
  { text: '今日厕运：一路绿灯', tip: '看到空位就冲，别犹豫' },
  { text: '忌相信再忍一会儿', tip: '身体发出的信号要立刻回应' },
  { text: '宜像水一样自由流动', tip: '该去就去，生活才顺畅' },
  { text: '今日宜感谢每间干净厕所', tip: '文明使用，好运加倍' },
  { text: '宜收集幸运地标', tip: '记住好厕所的位置，未来可期' },
  { text: '今日如厕指数：五星', tip: '保持心情，通畅自来' },
  { text: '宜顺流而下，忌逆流而上', tip: '别和身体较劲' },
  { text: '今日宜小步快走', tip: '每一步都离出口更近' },
  { text: '宜保持松弛感', tip: '越放松，越能找到好位置' },
  { text: '今日宜相信直觉', tip: '直觉会带你找到最近的厕所' }
]
// 如厕冷知识（点击切换下一条）
const FUN_FACTS = [
  '人一生大约有三年是在厕所里度过的',
  '冲水时先盖马桶盖，能减少气溶胶飞溅',
  '古罗马人把公共厕所当成社交现场',
  '太空站马桶靠气流收集，而不是靠水冲',
  '听到流水声更容易产生尿意，是条件反射',
  '日本很多公厕的马桶圈能加热',
  '南极科考站也有环保干式公厕',
  '厕所门锁不紧时，人的紧张感会自动增强',
  '人在紧张时更容易想上厕所，是神经反应',
  '历史上第一份抽水马桶专利可追溯到十六世纪',
  '黄金马桶曾在纽约展出，价值数百万美元',
  '大象每天能产生几十公斤粪便，人类远不如它',
  '多数人上完厕所会下意识洗手，这是好习惯',
  '冲水声能短暂掩盖一切，也可能吵醒整层楼',
  '城市里公厕密度高的地方，往往更需要排队',
  '厕所不只是房间，也是城市文明的小窗口',
  '古代欧洲没有下水道，街道曾当过垃圾场',
  '世界最贵的公厕造价惊人，还不一定最好用',
  '膀胱平均能储存三百到五百毫升尿液',
  '憋尿太久容易尿路感染，别硬撑',
  '好厕所常藏在商场中庭背后的拐角',
  '带手机进厕所，平均停留时间会悄悄变长',
  '自动冲水有时过于敏感，有时又假装没看见',
  '如厕时放松肩颈，身体会更快进入状态'
]

// 腾讯 POI 当日额度耗尽标记（status=121）
let poiQuotaExhausted = false
let poiQuotaExhaustedDate = ''
// 腾讯 POI 本地每日调用预算保护：未认证账号地点搜索默认 200 次/日，预留余量避免打到硬限额
const TENCENT_DAILY_BUDGET = 190
let tencentDailyCalls = 0
let tencentDailyCallsDate = ''
// 同位置短时缓存：命中缓存时跳过 getNearToilet 与全部地图 POI API，最大限度减少外部 API 消耗
const CHECKIN_STORAGE_KEY = 'my_checkins_v1'
const CHECKIN_RADIUS = 50
const SEARCH_CACHE_KEY = 'nearby_search_cache_v1'
const SEARCH_CACHE_TTL = 30 * 60 * 1000 // 30 分钟：同位置同半径重复查询直接复用结果
const SEARCH_CACHE_MAX = 5 // 最多同时缓存 5 个不同位置的查询结果，超出淘汰最旧
const SEARCH_COOLDOWN_MS = 15000 // 连续真实查询最小间隔（防刷，命中同位置缓存不受限）
/**
 * 构造同位置缓存 key：经纬度取 3 位小数（约 111 米网格）+ 查询半径，
 * 同一网格同一半径视为「同一位置」，30 分钟内重复查询直接复用结果
 */
function buildSearchCacheKey(lat, lng, radius) {
  return Math.round(Number(lat) * 1000) / 1000 + ',' + Math.round(Number(lng) * 1000) / 1000 + ',' + radius
}
// 高德 POI 当日额度耗尽标记（infocode=10044）
let amapQuotaExhausted = false
let amapQuotaExhaustedDate = ''
// 百度 POI 当日额度耗尽标记（status=302 天配额超限 / 402 配额超限）
let baiduQuotaExhausted = false
let baiduQuotaExhaustedDate = ''
// 百度并发超限（status=401）仅控制台一次性提示，不弹用户提醒，避免刷屏
let baiduConcurrencyWarned = false
// 百度全局 QPS 限速：免费并发/QPS 上限≈3，强制任意两次百度请求起始间隔 ≥1200ms（峰值约 0.83 QPS），
// 跨关键词、跨多次查询全局生效，避免连续请求落在同一秒内触发 status=401 并发超限 / 平台并发预警
let baiduLastRequestAt = 0
const BAIDU_MIN_REQUEST_GAP = 1200
function waitBaiduPace() {
  const now = Date.now()
  const start = Math.max(baiduLastRequestAt, now)
  baiduLastRequestAt = start + BAIDU_MIN_REQUEST_GAP
  const wait = start - now
  return new Promise((resolve) => {
    if (wait > 0) setTimeout(resolve, wait)
    else resolve()
  })
}

/**
 * 球面距离（haversine 公式，单位米）
 * 数值校验：入参非法/NaN/越界经纬度时返回 NaN，由调用方 isFinite 兜底丢弃该点位，
 * 防止 NaN 把全部有效点位误过滤掉。
 * 已验证：同点=0m；纬度差 1° ≈ 111.2km；北京→上海 ≈ 1067km，精度可靠，可用于圈内过滤
 */
function getDistance(lat1, lng1, lat2, lng2) {
  lat1 = Number(lat1); lng1 = Number(lng1); lat2 = Number(lat2); lng2 = Number(lng2)
  if (!isFinite(lat1) || !isFinite(lng1) || !isFinite(lat2) || !isFinite(lng2)) {
    console.warn('[index] 球面距离计算入参非法，返回 NaN', lat1, lng1, lat2, lng2)
    return NaN
  }
  if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90 || lng1 < -180 || lng1 > 180 || lng2 < -180 || lng2 > 180) {
    console.warn('[index] 球面距离计算入参越界，返回 NaN', lat1, lng1, lat2, lng2)
    return NaN
  }
  const rad = (d) => (d * Math.PI) / 180
  const R = 6371000
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function isValidCoordinate(latitude, longitude) {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    !isNaN(latitude) && !isNaN(longitude) &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180
  )
}

// BD-09（百度坐标）→ GCJ-02（火星坐标）转换：百度 POI 返回 BD-09，微信小程序 map 使用 GCJ-02
function bd09ToGcj02(lat, lng) {
  const x = Number(lng) - 0.0065
  const y = Number(lat) - 0.006
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * Math.PI * 3000 / 180)
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * Math.PI * 3000 / 180)
  return { lat: z * Math.sin(theta), lng: z * Math.cos(theta) }
}

// WGS-84（GPS / 天地图 CGCS2000）→ GCJ-02（火星坐标）转换：天地图 POI 返回 CGCS2000≈WGS-84，
// 微信小程序 map 使用 GCJ-02，转换后坐标才能与定位/其他数据源对齐（偏差几十米，可接受）
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

Page({
  data: {
    // 定位（GCJ-02，地图中心永久锁定用户位置）
    latitude: DEFAULT_CENTER.latitude,
    longitude: DEFAULT_CENTER.longitude,
    locationReady: false,
    loadingDone: false,
    locateTipHidden: false,
    // 查询半径
    radiusOptions: [500, 1000, 2000, 3000],
    radiusIndex: 1,
    selectedRadius: 1000,
    // 查询状态
    searched: false,
    loading: false,
    emptyText: '',
    // 红色查询圈（点击开始寻找后渲染；切换半径实时预览尺寸）
    circles: [],
    // 公厕数据（仅圈内点位）
    allToilets: [],
    toilets: [],
    markers: [],
    totalCount: 0,
    // 筛选无匹配提示
    filterEmpty: false,
    // 最近查询记录模式
    showAllMode: false,
    // 底部列表展开
    showList: false,
    // 顶部筛选（本地过滤，不耗次数）
    filters: { hasPaper: false, barrierFree: false, babyRoom: false, open24h: false },
    // marker 简易气泡卡片
    markerBubble: false,
    selectedMarker: null,
    // 0 结果空状态弹窗
    emptyModal: false,
    // 详情弹窗
    selectedToilet: null,
    comments: [],
    defaultAvatar: '/images/default-avatar.png',
    commentScores: { hygiene: 0, comfort: 0, air: 0 },
    commentTotalScore: 0,
    commentContent: '',
    submittingComment: false,
    detailCardScrollTop: 0,
    // 评价页全屏可滑动悬浮按钮位置（px）
    commentFabLeft: 0,
    commentFabTop: 0,
    favorited: false,
    toiletLiked: false,
    toiletLikeCount: 0,
    // 上报悬浮钮可拖动位置（px，left/top 内联到 fixed 定位；初始右下角，仅限屏幕下半部拖动）
    fabLeft: 0,
    fabTop: 0,
    // ===== 趣味功能（纯本地）=====
    fortune: { text: '', tip: '' },
    fortuneIndex: 0,
    funFact: '',
    funFactIndex: 0,
    breathOpen: false,
    breathPhase: '',
    breathText: '',
    breathSec: 0,
    breathRound: 0,
    breathScale: 1
  },

  // ===== 趣味功能：今日如厕运势（按日期固定一签，可手动换签，纯本地）=====
  genDailyFortune() {
    try {
      const idx = this.pickIndex(FORTUNES.length, -1)
      this.setData({ fortune: FORTUNES[idx], fortuneIndex: idx })
    } catch (err) {
      console.warn('[index] 生成运势失败（不影响主流程）', err)
    }
  },

  rerollFortune() {
    const idx = this.pickIndex(FORTUNES.length, this.data.fortuneIndex)
    this.setData({ fortune: FORTUNES[idx], fortuneIndex: idx })
  },

  // ===== 趣味功能：如厕冷知识随机切换（纯本地）=====
  nextFunFact() {
    const idx = this.pickIndex(FUN_FACTS.length, this.data.funFactIndex)
    this.setData({ funFact: FUN_FACTS[idx], funFactIndex: idx })
  },

  // 从数据池取一个与 last 不同的随机下标，避免连续重复
  pickIndex(length, last) {
    if (length <= 1) return 0
    let idx = Math.floor(Math.random() * length)
    if (idx === last) idx = (idx + 1) % length
    return idx
  },

  // ===== 趣味功能：憋住啦·深呼吸急救（纯本地计时动画，无网络无UGC）=====
  openBreath() {
    if (this.data.breathOpen) return
    this.setData({ breathOpen: true })
    this.startBreathRound(1)
  },

  closeBreath() {
    if (this._breathTimer) {
      clearInterval(this._breathTimer)
      this._breathTimer = null
    }
    this.setData({ breathOpen: false, breathPhase: '', breathText: '', breathSec: 0, breathRound: 0, breathScale: 1 })
  },

  startBreathRound(round) {
    const phases = [
      { key: 'inhale', text: '吸气～', sec: 4, scale: 1.18 },
      { key: 'hold', text: '屏住…', sec: 4, scale: 1.18 },
      { key: 'exhale', text: '呼气～', sec: 6, scale: 0.72 }
    ]
    let pi = 0
    let sec = phases[0].sec
    this.setData({ breathRound: round, breathPhase: phases[0].key, breathText: phases[0].text, breathSec: sec, breathScale: phases[0].scale })
    if (this._breathTimer) clearInterval(this._breathTimer)
    this._breathTimer = setInterval(() => {
      sec--
      if (sec <= 0) {
        pi++
        if (pi >= phases.length) {
          if (round >= 3) {
            clearInterval(this._breathTimer)
            this._breathTimer = null
            this.setData({ breathPhase: 'done', breathText: '满血复活，冲去厕所！', breathSec: 0, breathScale: 1 })
            setTimeout(() => this.closeBreath(), 1400)
            return
          }
          this.startBreathRound(round + 1)
          return
        }
        sec = phases[pi].sec
        this.setData({ breathPhase: phases[pi].key, breathText: phases[pi].text, breathSec: sec, breathScale: phases[pi].scale })
      } else {
        this.setData({ breathSec: sec })
      }
    }, 1000)
  },

  onReady() {
    // 地图上下文：视野缩放（includePoints API）用它触发，避免 wxml include-points 空数组导致腾讯地图 SDK fitBounds 崩溃
    this.mapCtx = wx.createMapContext('map', this)
  },

  /**
   * 用 MapContext.includePoints 缩放视野覆盖点位（比 wxml include-points 属性更稳：
   * 属性方式传空数组/异常数组会触发地图 SDK fitBounds 读取 points[0].lat 崩溃）
   */
  fitMapPoints(points) {
    if (!this.mapCtx || !Array.isArray(points) || points.length === 0) return
    const valid = points.filter((p) => p && isValidCoordinate(p.latitude, p.longitude))
    if (valid.length === 0) return
    console.log('[index] 调整地图视野覆盖点位', valid.length, '个')
    try {
      this.mapCtx.includePoints({ points: valid, padding: [60, 60, 60, 60] }).catch((e) => {
        console.error('[index] includePoints 视野调整失败（完整错误）', e)
      })
    } catch (err) {
      console.error('[index] includePoints 视野调整异常（完整错误）', err)
    }
  },

  onLoad() {
    // 页面加载：仅定位 + 读取数据库总量，不自动查询、无红圈、无 marker
    this.ensureLocation()
    this.initFabPosition()
    // 趣味功能：今日运势 + 冷知识（纯本地）
    this.genDailyFortune()
    this.nextFunFact()
  },

  // 页面卸载：清理深呼吸计时器，防止内存泄漏
  onUnload() {
    if (this._breathTimer) {
      clearInterval(this._breathTimer)
      this._breathTimer = null
    }
  },

  onShow() {
    // 自定义 tabBar：同步选中态（找厕所=0）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    // 使用系统 tabBar（找厕所/我的），无需隐藏
    // 查询记录页「再次查询」：回填该次半径（不自动查询、不扣次数，需点击开始寻找）
    const pendingRadiusIndex = app.globalData.pendingRadiusIndex
    if (typeof pendingRadiusIndex === 'number' && pendingRadiusIndex >= 0 && pendingRadiusIndex < this.data.radiusOptions.length) {
      app.globalData.pendingRadiusIndex = null
      const selectedRadius = this.data.radiusOptions[pendingRadiusIndex]
      this.setData({ radiusIndex: pendingRadiusIndex, selectedRadius })
      wx.showToast({ title: '已回填查询半径：' + selectedRadius + '米，点击开始寻找', icon: 'none' })
    }
    // 我的页面跳转：打开指定公厕详情弹窗
    const pendingToiletId = app.globalData.pendingToiletId
    if (pendingToiletId) {
      app.globalData.pendingToiletId = null
      this.openToiletById(pendingToiletId)
    }
  },

  /**
   * 获取用户位置（GCJ-02），带超时保护；失败回退默认坐标并显示提示条
   * 隐私兼容：先确认用户已同意隐私协议，未同意前不调用 getLocation（避免框架 invalid init scl 报错）
   */
  ensureLocation() {
    const self = this
    if (app.globalData.userLocation) {
      const { latitude, longitude } = app.globalData.userLocation
      self.setData({ latitude, longitude, locationReady: true, loadingDone: true })
      console.log('[index] 使用缓存定位', latitude, longitude)
      return
    }
    const doLocate = () => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        console.error('[index] 定位超时（完整信息）：已切换默认坐标', DEFAULT_CENTER)
        wx.showToast({ title: '定位超时，已切换到默认位置', icon: 'none' })
        self.setData({ locationReady: false, loadingDone: true })
      }, LOCATE_TIMEOUT)
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          const location = { latitude: res.latitude, longitude: res.longitude }
          app.globalData.userLocation = location
          self.setData({ ...location, locationReady: true, loadingDone: true })
          console.log('[index] 定位成功', location)
        },
        fail: (err) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          console.error('[index] 定位失败（完整错误）', err)
          const locErrMsg = (err && err.errMsg) || ''
          if (err.errno === 112 || locErrMsg.indexOf('api scope is not declared') > -1) {
            // errno 112：后台《用户隐私保护指引》未声明「位置信息」，属配置问题，需在微信公众平台补充声明
            console.error('[index] 定位不可用：请在微信公众平台「设置-服务内容声明-用户隐私保护指引」补充声明「位置信息」后重试（约5分钟生效）')
            wx.showToast({ title: '定位服务未配置，已切换到默认位置', icon: 'none' })
          } else {
            wx.showToast({ title: '定位失败，已切换到默认位置', icon: 'none' })
          }
          self.setData({ locationReady: false, loadingDone: true })
        }
      })
    }
    // 隐私协议前置校验：用户拒绝隐私授权时按「定位失败」兜底，地图用默认坐标正常渲染，不再触发框架报错
    ensurePrivacyAuthorize()
      .then(doLocate)
      .catch((err) => {
        console.warn('[index] 未同意隐私协议，已切换默认坐标', err)
        wx.showToast({ title: '未同意隐私协议，已切换到默认位置', icon: 'none' })
        self.setData({ locationReady: false, loadingDone: true })
      })
  },


  /**
   * 选择查询半径：实时预览红圈尺寸，不触发查询、不渲染 marker
   */
  onRadiusChange(e) {
    const radiusIndex = Number(e.detail.value)
    const selectedRadius = this.data.radiusOptions[radiusIndex]
    const { latitude, longitude } = this.data
    this.setData({
      radiusIndex,
      selectedRadius,
      circles: [{
        latitude,
        longitude,
        radius: selectedRadius,
        color: '#FF6B6B',
        fillColor: '#FF6B6B26',
        strokeWidth: 3
      }]
    })
    console.log('[index] 切换查询半径', selectedRadius, '米（实时预览红圈，未触发查询）')
  },

  /**
   * 点击【开始寻找】：
   * 1. 校验定位就绪、经纬度有效（查询不限次数，无次数上限）
   * 2. 渲染红色查询圈，按钮进入 loading 状态（防重复点击）
   * 3. 执行 loadToiletData 完整查询（geoNear + 多源POI降级）
   * 4. 整套查询成功后才写查询记录；连续真实查询有 15 秒冷却，命中同位置缓存不受限
   */
  startSearch() {
    const { loading, loadingDone, latitude, longitude, selectedRadius } = this.data
    // 全局查询锁：同一时间只允许一个查询在跑，防止筛选/快速连点/页面回退叠加触发多轮并发请求
    if (this.searchInFlight) {
      console.warn('[index] 已有查询进行中，忽略重复开始寻找')
      wx.showToast({ title: '查询进行中，请稍候', icon: 'none' })
      return
    }
    if (loading) return
    // 定位未完成前禁止查询；定位失败已回退默认坐标（loadingDone=true）时允许按默认位置查询
    if (!loadingDone) {
      wx.showToast({ title: '定位中，请稍后重试', icon: 'none' })
      this.ensureLocation()
      return
    }
    // 经纬度校验：无效直接提示开启定位权限，不发起任何请求
    if (!isValidCoordinate(latitude, longitude)) {
      console.error('[index] 经纬度无效，拒绝发起查询', latitude, longitude)
      wx.showToast({ title: '获取定位失败，请开启手机定位权限', icon: 'none' })
      return
    }
    // Scroll to map after search starts
    wx.pageScrollTo({
      selector: '#toilet-map',
      duration: 300
    })
    // 同位置短时缓存：30 分钟内同一位置（约 111 米网格）同一半径已查过，直接复用上次结果，
    // 不再调用 getNearToilet，也不再调用高德/百度/天地图/腾讯/OSM 任何地图 API
    const cached = this.getNearbyCache(latitude, longitude, selectedRadius)
    if (cached) {
      console.log('[index] 命中同位置短时缓存，跳过地图 API 查询，直接渲染缓存点位 count=', cached.length)
      this.renderCircle()
      this.setData({ searched: true, loading: false, emptyText: '', allToilets: cached, filterEmpty: false, showList: false })
      this.renderToilets(cached)
      // 缓存复用不弹 toast 打扰用户（控制台保留命中日志）；同样写查询记录
      this.writeSearchRecord(cached)
      return
    }
    // 连续查询冷却（防刷）：不限次数但限制真实接口调用频率；命中同位置缓存已在上方 return，不受此限制
    const nowMs = Date.now()
    const waitMs = (this.nextSearchTime || 0) - nowMs
    if (waitMs > 0) {
      wx.showToast({ title: '手速太快啦，休息 ' + Math.ceil(waitMs / 1000) + ' 秒再试～', icon: 'none' })
      return
    }
    this.nextSearchTime = nowMs + SEARCH_COOLDOWN_MS
    this.setData({ loading: true, emptyText: '' })
    this.renderCircle()
    this.loadToiletData()
  },

  /**
   * 渲染红色圆形查询圈（圆心固定用户定位）
   */
  renderCircle() {
    const { latitude, longitude, selectedRadius } = this.data
    this.setData({
      searched: true,
      circles: [{
        latitude,
        longitude,
        radius: selectedRadius,
        color: '#FF6B6B',
        fillColor: '#FF6B6B26',
        strokeWidth: 3
      }]
    })
    console.log('[index] 渲染查询圈 radius=', selectedRadius, '圆心=', latitude, longitude)
  },

  /**
   * 加载圈内公厕（完整查询流程，容错重构）：
   * 执行顺序：① getNearToilet 读自有库 → ② 多源 POI（高德/百度/天地图主流并行，腾讯保底）
   * 分支：
   *  - 情况1：服务商正常返回 POI → 合并过滤数据库点位与 POI 点位
   *  - 情况2：服务商报错/超时/返回空 → 不判定整体失败，保留数据库点位继续渲染，toast「地图服务商暂时异常，仅展示用户上报的厕所点位」
   *  - 情况3：数据库云函数失败 && 服务商也失败 → 弹窗「查询失败，本次未消耗次数，请稍后重试」，不扣次数
   *  - 情况4：数据库无数据 && 服务商无数据 → 空状态弹窗「附近暂未找到公厕，试试扩大半径或上报新点位」
   * 次数规则：不限次数；只要自有数据库查询成功即写查询记录；仅数据库云函数本身异常时不写记录
   * 注意：toiletAll 必须建立 loc 字段 2dsphere 地理位置索引（写入时需带 loc: db.Geo.Point(lng, lat)，见 cloudfunctions/getNearToilet/index.js 顶部注释）；未建索引时 getNearToilet 已内置 JS 距离过滤降级，不会误判查询失败
   */
  async loadToiletData() {
    const { latitude, longitude, selectedRadius } = this.data

    // 0. geoNear 查询前校验经纬度
    if (!isValidCoordinate(latitude, longitude)) {
      console.error('[index] 经纬度无效，无法发起 geoNear 查询', latitude, longitude)
      wx.showToast({ title: '获取定位失败，请开启手机定位权限', icon: 'none' })
      this.setData({ loading: false })
      return
    }
    // 全局查询锁：任何路径（含筛选期间误触发）都不允许并发第二轮查询，
    // 同一时刻只允许一个 loadToiletData 在跑，从根源上杜绝百度/高德等地图 API 并发超限
    if (this.searchInFlight) {
      console.warn('[index] 已有查询进行中，忽略重复 loadToiletData')
      return
    }
    this.searchInFlight = true
    try {

    // 1. 自有库 geoNear 查询（依赖 toiletAll 的 2dsphere 地理位置索引）
    let dbOk = false
    let near = []
    try {
      const nearRes = await wx.cloud.callFunction({
        name: 'getNearToilet',
        data: { latitude, longitude, radius: selectedRadius }
      })
      const r = nearRes.result || {}
      if (r.code === 0) {
        dbOk = true
        near = Array.isArray(r.list) ? r.list : []
        console.log('[index] 自有数据库返回点位数量=', near.length, '| 降级模式=', !!r.fallback, '| 点位=', near.map((t) => t.name + '(' + t.distance + 'm)').join(', '))
      } else {
        // 云函数正常调用但返回业务错误（入参缺失/集合不存在/索引缺失等），打印错误码与错误信息
        console.error('[index] getNearToilet 返回错误 errCode=', r.code, '| errMsg=', r.msg, '| 完整返回=', JSON.stringify(r), '| 请检查 toiletAll.loc 2dsphere 索引')
      }
    } catch (err) {
      // 调用异常（云函数未部署/网络异常）：打印完整错误对象 + 错误码/错误信息，方便定位问题
      console.error('[index] getNearToilet 调用异常（完整错误对象）', err)
      console.error('[index] getNearToilet 调用异常 errCode=', (err && err.errCode) || 'N/A', '| errMsg=', (err && err.errMsg) || (err && err.message) || 'N/A')
    }

    // 2. 周边 POI：高德/百度/天地图主流并行，腾讯仅作保底（失败不阻断整体查询，只轻提示）
    const poiRes = await this.searchPoiWithFallback(latitude, longitude, selectedRadius)
    const poiOk = poiRes.ok
    const poiList = poiRes.list || []

    // 3. 球面距离二次过滤：只保留红圈内点位；非法/NaN 数值单独丢弃，防止误过滤全部有效点位
    let filtered = []
    if (poiOk && poiList.length) {
      for (const p of poiList) {
        // 边界校验：非法坐标直接丢弃并记录，避免污染过滤结果
        if (!p || !isFinite(Number(p.lat)) || !isFinite(Number(p.lng)) || !isValidCoordinate(Number(p.lat), Number(p.lng))) {
          console.warn('[index] 过滤丢弃非法坐标POI点位：', p && p.name, p && p.lat, p && p.lng)
          continue
        }
        const lat = Number(p.lat)
        const lng = Number(p.lng)
        const dist = getDistance(latitude, longitude, lat, lng)
        if (!isFinite(dist)) {
          console.warn('[index] 过滤丢弃距离计算异常点位：', p.name, '距离=', dist)
          continue
        }
        if (dist <= selectedRadius) {
          filtered.push({ ...p, lat, lng })
        } else {
          console.log('[index] 过滤丢弃POI点位：', p.name, '距离=', Math.round(dist), '米，超出半径', selectedRadius, '米')
        }
      }
      console.log('[index] 距离过滤后最终有效点位数量=', filtered.length)
    }

    // 4. 分支处理（容错）
    let toilets = []
    let toastText = ''
    let queryFail = false
    let showEmpty = false
    let shouldConsume = true

    if (!dbOk) {
      // 数据库云函数异常
      if (poiOk && filtered.length > 0) {
        // 数据库异常但地图接口有数据：展示地图点位，本次不消耗次数
        toilets = filtered.slice()
        toastText = '数据库服务异常，仅展示地图服务商点位'
        shouldConsume = false
      } else {
        // 情况3：数据库云函数失败 && 服务商也失败 → 弹窗，不扣次数
        queryFail = true
        toastText = '查询失败，本次未消耗次数，请稍后重试'
        shouldConsume = false
      }
    } else {
      // 数据库查询成功（正常消耗次数）
      if (poiOk && filtered.length > 0) {
        // 情况1：地图接口正常返回 POI，合并数据库点位与 POI 点位（全源回写缓存）
        toilets = near.concat(filtered)
        // 全源合规缓存：任意地图服务商（tencent/amap/baidu/tianditu/osm）圈内点位回写 toiletAll，
        // saveTencentPoi 云函数内部 50 米同名去重，跨用户共享越用越多（函数名为历史命名，已支持全部来源）
        if (filtered.length > 0) {
          this.savePoiCache(this.dedupeToilets(filtered))
        }
      } else if (near.length > 0) {
        // 情况2：服务商报错/超时/返回空，保留数据库点位继续渲染（轻提示，不阻断）
        toilets = near.slice()
        // 服务商异常（含百度并发 401）不再打扰用户：静默降级为仅展示数据库点位，渲染逻辑不变
        if (!poiOk) {
          console.warn('[index] 地图服务商异常，已静默降级为仅展示数据库点位（不弹提醒）')
        } else if (poiRes.errCode === 121) {
          toastText = '今日官方公厕查询额度已用尽，仅展示用户上报的厕所点位'
        }
      } else {
        // 情况4：数据库无数据 && 服务商无数据（或全部失败）→ 空状态弹窗
        toilets = []
        showEmpty = true
        // 服务商异常（含百度并发 401）不弹提醒：静默展示空状态引导（空状态弹窗仍保留）
        if (!poiOk) {
          console.warn('[index] 地图服务商异常，静默处理空状态（不弹提醒）')
        }
      }
    }

    if (queryFail) {
      // 情况3：弹窗提示，不扣次数、不生成查询记录
      this.setData({ allToilets: [] })
      this.renderToilets([])
      console.error('[index] 整套查询失败（本次不消耗次数）', toastText)
      wx.showModal({
        title: '查询失败',
        content: toastText,
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }

    // 圈内点位去重合并（同名 50 米内去重），保存全量集（筛选基于它）
    toilets = this.dedupeToilets(toilets)
    this.setData({ allToilets: toilets })
    this.renderToilets(toilets)
    // 写入同位置短时缓存：30 分钟内同位置同半径再次查询直接复用，不打地图 API
    this.saveNearbyCache(latitude, longitude, selectedRadius, toilets)
    if (toastText) {
      wx.showToast({ title: toastText, icon: 'none' })
    }

    // 5. 查询记录：数据库云函数正常即写查询记录；仅数据库异常时不写
    if (shouldConsume) {
      await this.writeSearchRecord(toilets)
    } else {
      console.log('[index] 数据库云函数异常，本次不消耗查询次数')
    }

    // 6. 情况4：空状态弹窗（含扩大半径 / 上报厕所快捷按钮）
    if (showEmpty) {
      this.showEmptyModal()
    }
    } finally {
      // 释放全局查询锁并复位 loading（成功/失败/中途 return 都会执行），保证下一次查询可正常发起
      this.searchInFlight = false
      this.setData({ loading: false })
    }
  },

  /**
   * 腾讯 POI 周边搜索（place/v1/search）
   * 参数：boundary=nearby(lat,lng,radius)，腾讯已废弃 location+radius（会返回 status=348）
   * 返回 { ok, list, errCode }：
   *  - ok=true   查询成功，或按规则跳过（当日额度已用尽 / 未配置 Key）
   *  - ok=false  接口报错或网络异常（完整错误已打印到控制台）
   */
  searchTencentPoi(latitude, longitude, radius) {
    return new Promise((resolve) => {
      const today = new Date().toDateString()
      if (poiQuotaExhaustedDate !== today) {
        poiQuotaExhausted = false
        poiQuotaExhaustedDate = today
      }
      if (poiQuotaExhausted) {
        console.log('[index] 腾讯 POI 当日额度已用尽，跳过腾讯查询')
        resolve({ ok: true, list: [], errCode: 121 })
        return
      }
      // 本地每日调用预算保护：达预算后本日不再发起腾讯请求（保留余量，避免直接打到 status=121 硬限额）
      if (tencentDailyCallsDate !== today) {
        tencentDailyCalls = 0
        tencentDailyCallsDate = today
      }
      if (tencentDailyCalls >= TENCENT_DAILY_BUDGET) {
        console.warn('[index] 腾讯 POI 本地每日调用预算已达上限（' + TENCENT_DAILY_BUDGET + '），今日跳过腾讯查询')
        resolve({ ok: true, list: [], errCode: 121 })
        return
      }
      if (!QQ_MAP_KEY || QQ_MAP_KEY.indexOf('请替换') === 0) {
        console.warn('[index] 未配置 QQ_MAP_KEY，跳过腾讯查询')
        resolve({ ok: true, list: [], errCode: 0 })
        return
      }
      // 多关键词轮询：腾讯 keyword 单次只支持一个词，逐词查询后按「同名 50 米」去重合并
      const all = []
      // 腾讯配额紧张：仅查 1 个主词（公共厕所），降低无效 API 消耗；高德/百度为主流查询走全词
      const keywords = SEARCH_KEYWORDS.slice(0, SOURCE_KEYWORD_COUNT.tencent)
      let anySuccess = false
      let lastErr = 0
      const runKeyword = (index) => {
        if (index >= keywords.length) {
          const list = this.dedupeToilets(all)
          if (list.length > 0 || anySuccess) {
            resolve({ ok: true, errCode: 0, list })
          } else {
            resolve({ ok: false, list: [], errCode: lastErr || -1 })
          }
          return
        }
        // 实际发起腾讯请求前计数（本地预算保护用）
        tencentDailyCalls++
        // 腾讯并发敏感且日配额仅 200 次：所有请求经 runTencentWithLimit 信号量（并发=1）严格串行
        runTencentWithLimit(() => this.doTencentRequest(latitude, longitude, radius, keywords[index])).then((res) => {
          if (res.ok) {
            anySuccess = true
            // 打印腾讯接口原始返回数据，便于调试
            console.log('[index] 腾讯接口原始返回数据（keyword=', keywords[index], '）', JSON.stringify(res.body))
            const list = Array.isArray(res.body.data) ? res.body.data : []
            all.push(...list.map((item) => ({
              name: item.title || '公共厕所',
              address: item.address || '',
              lat: item.location && item.location.lat,
              lng: item.location && item.location.lng,
              source: 'tencent'
            })).filter((p) => isValidCoordinate(p.lat, p.lng)))
            runKeyword(index + 1)
            return
          }
          if (res.err) {
            lastErr = -1
            console.error('[index] 腾讯 POI 请求失败（完整错误 keyword=', keywords[index], '）', res.err)
            runKeyword(index + 1)
            return
          }
          const body = res.body || {}
          const errCode = body.status
          lastErr = errCode
          // 打印完整返回体，方便定位 Key/配额/参数问题
          console.error('[index] 腾讯 POI 查询失败（完整返回 keyword=', keywords[index], '）', JSON.stringify(body))
          if (errCode === 111) console.error('[index] 腾讯Key授权AppID不匹配，请核对小程序AppID与Key绑定')
          if (errCode === 121) {
            poiQuotaExhausted = true
            poiQuotaExhaustedDate = today
            console.error('[index] 腾讯地图地点搜索当日配额已用尽')
          }
          // 配额/鉴权类错误停止后续关键词，避免无效消耗；其他错误继续尝试下一关键词
          if (errCode === 121 || errCode === 111) {
            const list = this.dedupeToilets(all)
            resolve({ ok: anySuccess || list.length > 0, list, errCode: errCode || lastErr })
            return
          }
          runKeyword(index + 1)
        }).catch((err) => {
          lastErr = -1
          console.error('[index] 腾讯 POI 请求异常（完整错误 keyword=', keywords[index], '）', err)
          runKeyword(index + 1)
        })
      }
      runKeyword(0)
    })
  },

  /**
   * 腾讯 place/v1/search 单次请求（由 runTencentWithLimit 信号量排队后调用，并发=1）
   * 注意：runTencentWithLimit 不会 reject（doTencentRequest 恒 resolve），此处 .catch 仅作防御性兜底
   * 返回 Promise：resolve { ok:true, body }（status=0）或 { ok:false, body }（业务错误）或 { ok:false, err }（网络异常）
   */
  doTencentRequest(latitude, longitude, radius, keyword) {
    return new Promise((resolve) => {
      wx.request({
        url: QQ_SEARCH_URL,
        // 重要：腾讯 place/v1/search 已废弃 location+radius，必须用 boundary=nearby(lat,lng,radius)，
        // 否则返回 status=348「boundary 参数不合法」，导致腾讯接口必败（实测验证）
        data: {
          keyword: keyword,
          boundary: 'nearby(' + latitude + ',' + longitude + ',' + radius + ')',
          page_size: 20,
          key: QQ_MAP_KEY
        },
        timeout: REQUEST_TIMEOUT,
        success: (res) => {
          const body = res.data || {}
          resolve(String(body.status) === '0' ? { ok: true, body } : { ok: false, body })
        },
        fail: (err) => {
          resolve({ ok: false, err })
        }
      })
    })
  },

  /**
   * 高德 POI 周边搜索（v3/place/around，主流数据源）
   * 坐标：高德返回 GCJ-02（location 格式为 经度,纬度），与小程序地图一致
   * 搜索策略：优先按分类 200300（公共设施;公共厕所）搜索（召回比单关键词更全），
   *          分类无结果时回退多关键词搜索兜底（公共厕所|公厕|卫生间|洗手间）
   * 返回 { ok, list, errCode }：
   *  - ok=true   查询成功
   *  - ok=false  接口报错/网络异常/未配置 Key（完整错误已打印到控制台）
   */
  searchAmapPoi(latitude, longitude, radius) {
    return new Promise((resolve) => {
      const today = new Date().toDateString()
      if (amapQuotaExhaustedDate !== today) {
        amapQuotaExhausted = false
        amapQuotaExhaustedDate = today
      }
      if (amapQuotaExhausted) {
        console.log('[index] 高德 POI 当日额度已用尽，跳过高德查询')
        resolve({ ok: false, list: [], errCode: 10044, quotaExhausted: true })
        return
      }
      if (!AMAP_KEY || AMAP_KEY.indexOf('请替换') === 0) {
        console.warn('[index] 未配置 AMAP_KEY，跳过高德查询')
        resolve({ ok: false, list: [], errCode: -2 })
        return
      }
      // 优先分类搜索：200300 = 公共设施;公共厕所，覆盖各种命名的公厕点位
      this.amapRequest(latitude, longitude, radius, { types: '200300' }, (res) => {
        if (res.ok && res.list.length > 0) {
          resolve(res)
          return
        }
        // 分类搜索无结果：回退多关键词兜底，避免漏掉名称匹配但未标注分类的点位
        this.amapRequest(latitude, longitude, radius, { keywords: SEARCH_KEYWORDS.join('|') }, resolve)
      })
    })
  },

  /**
   * 高德 place/around 单次请求封装（不单独计数配额，由 searchAmapPoi 控制）
   * 返回 { ok, list, errCode }，list 已映射 name/address/lat/lng/source 并过滤非法坐标
   */
  amapRequest(latitude, longitude, radius, extraParams, callback) {
    // 高德并发限制：个人版 Web服务 API 周边搜索默认 QPS≈6，超过会报 infocode=10045（QPS 超限）；
    // 通过信号量排队，把高德请求并发控制在 AMAP_MAX_CONCURRENCY=6 以内（槽位占用到请求真正结束）
    runAmapWithLimit(() => this.doAmapRequest(latitude, longitude, radius, extraParams)).then(
      (res) => callback(res),
      (err) => {
        console.error('[index] 高德请求排队执行异常（完整错误）', err)
        callback({ ok: false, list: [], errCode: -1 })
      }
    )
  },

  /**
   * 高德 place/around 单次请求（由 amapRequest 信号量排队后调用）
   */
  doAmapRequest(latitude, longitude, radius, extraParams) {
    return new Promise((resolve) => {
      wx.request({
        url: AMAP_SEARCH_URL,
        // 高德 place/around：location 传 经度,纬度；radius 米；extraParams 传 types 或 keywords
        data: {
          key: AMAP_KEY,
          location: longitude + ',' + latitude,
          radius: radius,
          offset: 25,
          page: 1,
          extensions: 'base',
          sortrule: 'distance',
          ...extraParams
        },
        timeout: REQUEST_TIMEOUT,
        success: (res) => {
          const body = res.data || {}
          if (String(body.status) === '1') {
            // 打印高德接口原始返回数据，便于调试
            console.log('[index] 高德接口原始返回数据（status=1 参数=', JSON.stringify(extraParams), '）', JSON.stringify(body))
            const pois = Array.isArray(body.pois) ? body.pois : []
            resolve({
              ok: true,
              errCode: 0,
              list: pois.map((item) => {
                const loc = String(item.location || '').split(',')
                return {
                  name: item.name || '公共厕所',
                  address: item.address || '',
                  lat: parseFloat(loc[1]),
                  lng: parseFloat(loc[0]),
                  source: 'amap'
                }
              }).filter((p) => isValidCoordinate(p.lat, p.lng))
            })
            return
          }
          const infocode = body.infocode || 'unknown'
          const today = new Date().toDateString()
          // 打印完整返回体，方便定位 Key/配额/参数问题
          console.error('[index] 高德 POI 查询失败（完整返回 参数=', JSON.stringify(extraParams), '）', JSON.stringify(body))
          if (infocode === '10044') {
            amapQuotaExhausted = true
            amapQuotaExhaustedDate = today
            console.error('[index] 高德地图周边搜索当日配额已用尽（infocode=10044）')
          }
          if (infocode === '10045') console.error('[index] 高德 QPS 超限（infocode=10045）')
          if (infocode === '10001') console.error('[index] 高德 Key 无效，请核对高德 Web 服务 Key')
          resolve({ ok: false, list: [], errCode: infocode })
        },
        fail: (err) => {
          console.error('[index] 高德 POI 请求失败（完整错误 参数=', JSON.stringify(extraParams), '）', err)
          resolve({ ok: false, list: [], errCode: -1 })
        }
      })
    })
  },
  /**
   * 百度 POI 周边搜索（place/v2/search，主流数据源）
   * 坐标：百度返回 BD-09，需经 bd09ToGcj02 转换为 GCJ-02 后供小程序 map 使用
   * 返回 { ok, list, errCode }：
   *  - ok=true   查询成功
   *  - ok=false  接口报错/网络异常/未配置 Key/当日额度用尽
   */
  searchBaiduPoi(latitude, longitude, radius) {
    return new Promise((resolve) => {
      const today = new Date().toDateString()
      if (baiduQuotaExhaustedDate !== today) {
        baiduQuotaExhausted = false
        baiduQuotaExhaustedDate = today
      }
      if (baiduQuotaExhausted) {
        console.log('[index] 百度 POI 当日额度已用尽，跳过百度查询')
        resolve({ ok: false, list: [], errCode: 302, quotaExhausted: true })
        return
      }
      if (!BAIDU_AK || BAIDU_AK.indexOf('请替换') === 0) {
        console.warn('[index] 未配置 BAIDU_AK，跳过百度查询')
        resolve({ ok: false, list: [], errCode: -2 })
        return
      }
      // 多关键词轮询：百度 query 单次只支持一个词，逐词查询后按「同名 50 米」去重合并
      const all = []
      // 百度为主流查询：按配置查全 6 词，提升召回
      const keywords = SEARCH_KEYWORDS.slice(0, SOURCE_KEYWORD_COUNT.baidu)
      let anySuccess = false
      let lastErr = 0
      const runKeyword = (index) => {
        if (index >= keywords.length) {
          const list = this.dedupeToilets(all)
          if (list.length > 0 || anySuccess) {
            resolve({ ok: true, errCode: 0, list })
          } else {
            resolve({ ok: false, list: [], errCode: lastErr || -1 })
          }
          return
        }
        // 百度免费并发/QPS 上限≈3：信号量并发压到 1，配合 doBaiduRequest 内全局 1200ms 最小请求间隔，
        // 峰值约 0.83 QPS，任意 1 秒内的百度请求数稳定 <3，从根上避免 status=401 并发超限
        const fire = () => {
        this.baiduRequest(latitude, longitude, radius, keywords[index], (res) => {
          if (res.ok) {
            anySuccess = true
            // 打印百度接口原始返回数据，便于调试
            console.log('[index] 百度接口原始返回数据（status=0 keyword=', keywords[index], '）', JSON.stringify(res.body))
            const results = Array.isArray(res.body.results) ? res.body.results : []
            all.push(...results.map((item) => {
              const loc = item.location || {}
              // 百度返回 BD-09，先转 GCJ-02
              const g = bd09ToGcj02(Number(loc.lat), Number(loc.lng))
              return {
                name: item.name || '公共厕所',
                address: item.address || '',
                lat: g.lat,
                lng: g.lng,
                source: 'baidu'
              }
            }).filter((p) => isValidCoordinate(p.lat, p.lng)))
            runKeyword(index + 1)
            return
          }
          const errCode = res.errCode
          lastErr = errCode
          // 401 并发超限：静默处理（仅提示一次、不发完整错误刷屏），立即停止后续关键词，并追加 3 秒冷却
          if (String(errCode) === '401') {
            if (!baiduConcurrencyWarned) {
              baiduConcurrencyWarned = true
              console.log('[index] 百度地图并发超限（status=401），已自动限流跳过（仅提示一次）')
            }
            baiduLastRequestAt = Date.now() + 3000
            const list = this.dedupeToilets(all)
            resolve({ ok: anySuccess || list.length > 0, list, errCode: errCode || lastErr })
            return
          }
          // 打印完整返回体/错误对象，方便定位 Key/配额/参数问题（401 已在上方静默处理）
          if (res.body) {
            console.error('[index] 百度 POI 查询失败（完整返回 keyword=', keywords[index], '）', JSON.stringify(res.body))
          } else if (res.err) {
            console.error('[index] 百度 POI 请求失败（完整错误 keyword=', keywords[index], '）', res.err)
          }
          if (String(errCode) === '302' || String(errCode) === '402') {
            baiduQuotaExhausted = true
            baiduQuotaExhaustedDate = today
            console.error('[index] 百度地图地点搜索当日配额已用尽（status=', errCode, '）')
          }
          // 配额类错误停止后续关键词，避免无效消耗；其他错误继续尝试下一关键词
          if (String(errCode) === '302' || String(errCode) === '402') {
            const list = this.dedupeToilets(all)
            resolve({ ok: anySuccess || list.length > 0, list, errCode: errCode || lastErr })
            return
          }
          runKeyword(index + 1)
          })
        }
        if (index === 0) {
          fire()
        } else {
          setTimeout(fire, 400)
        }
      }
      runKeyword(0)
    })
  },

  /**
   * 百度 place/v2/search 单次请求（由 runBaiduWithLimit 信号量排队后调用，并发=1，叠加全局 1200ms 请求间隔）
   * 返回 Promise：resolve { ok:true, errCode:0, body }（status=0）或 { ok:false, errCode, body }（业务错误）或 { ok:false, errCode:-1, err }（网络异常）
   */
  baiduRequest(latitude, longitude, radius, query, callback) {
    runBaiduWithLimit(() => this.doBaiduRequest(latitude, longitude, radius, query)).then(
      (res) => callback(res),
      (err) => {
        console.error('[index] 百度请求排队执行异常（完整错误）', err)
        callback({ ok: false, list: [], errCode: -1 })
      }
    )
  },

  async doBaiduRequest(latitude, longitude, radius, query) {
    // 全局 QPS 限速：无论哪个搜索路径触发，任意两次百度请求起始间隔 ≥1200ms，从根上避免并发超限
    await waitBaiduPace()
    return new Promise((resolve) => {
      wx.request({
        url: BAIDU_SEARCH_URL,
        // 百度 place/v2/search：location 传 纬度,经度；radius 米；filter 按距离排序
        data: {
          query: query,
          location: latitude + ',' + longitude,
          radius: radius,
          output: 'json',
          ak: BAIDU_AK,
          scope: 2,
          page_size: 20,
          filter: 'sort_name:distance|sort_rule:ascending'
        },
        timeout: REQUEST_TIMEOUT,
        success: (res) => {
          const body = res.data || {}
          if (String(body.status) === '0') {
            resolve({ ok: true, errCode: 0, body })
          } else {
            resolve({ ok: false, errCode: body.status, body })
          }
        },
        fail: (err) => {
          resolve({ ok: false, errCode: -1, err })
        }
      })
    })
  },

  /**
   * 天地图周边搜索（主流数据源，经云函数 searchTiandituPoi 代理）
   * 为什么走云函数：天地图 Key 若为「服务端」类型，前端 wx.request 直连返回 403（301013 权限类型错误），
   * 必须由云函数以服务端身份访问；坐标转换（CGCS2000→GCJ-02）也统一在云函数内完成。
   * 返回 { ok, list, errCode }：云函数未部署/接口失败/解析失败均 ok=false，不阻断其他数据源与次数消耗。
   */
  searchTiandituPoi(latitude, longitude, radius) {
    return new Promise((resolve) => {
      if (!TIANDITU_ENABLED) {
        console.warn('[index] 未启用天地图数据源，跳过查询')
        resolve({ ok: false, list: [], errCode: -2 })
        return
      }
      // 天地图经云函数代理，同样限流（并发=2）防止多轮搜索叠加并发
      runTiandituWithLimit(() => wx.cloud.callFunction({
        name: 'searchTiandituPoi',
        data: { latitude, longitude, radius }
      })).then((res) => {
        const r = res.result || {}
        if (r.code === 0 && Array.isArray(r.list)) {
          console.log('[index] 天地图（云函数代理）返回点位数量=', r.list.length)
          resolve({ ok: true, list: r.list.filter((p) => isValidCoordinate(p.lat, p.lng)), errCode: 0 })
          return
        }
        console.warn('[index] 天地图云函数无结果 code=', r.code, 'msg=', r.msg)
        resolve({ ok: false, list: [], errCode: r.code || -1 })
      }).catch((err) => {
        console.warn('[index] 天地图云函数不可用（可能未部署，忽略）', (err && err.errMsg) || err)
        resolve({ ok: false, list: [], errCode: -3 })
      })
    })
  },
/**
   * OpenStreetMap Overpass 兜底查询（云函数 fetchOsmToilet，第五备用数据源）
   * OSM 在中国覆盖稀疏且公共实例不稳定，仅作为最后补充：成功则并入点位，失败只记录日志，
   * 不阻断主查询流程，不影响次数消耗。云函数未部署时捕获 FUNCTION_NOT_FOUND 后正常返回空。
   */
  fetchOsmToilet(latitude, longitude, radius) {
    return new Promise((resolve) => {
      // OSM 兜底同样限流（并发=2）防止多轮搜索叠加并发
      runOsmWithLimit(() => wx.cloud.callFunction({
        name: 'fetchOsmToilet',
        data: { latitude, longitude, radius }
      })).then((res) => {
        const r = res.result || {}
        if (r.code === 0 && Array.isArray(r.list)) {
          console.log('[index] OSM 兜底返回点位数量=', r.list.length)
          resolve({ ok: true, list: r.list.filter((p) => isValidCoordinate(p.lat, p.lng)), errCode: 0 })
          return
        }
        console.warn('[index] OSM 兜底无结果 code=', r.code, 'msg=', r.msg)
        resolve({ ok: false, list: [], errCode: r.code || -1 })
      }).catch((err) => {
        console.warn('[index] OSM 兜底云函数不可用（可能未部署，忽略）', (err && err.errMsg) || err)
        resolve({ ok: false, list: [], errCode: -3 })
      })
    })
  },

  /**
   * 周边 POI 多源降级：高德/百度/天地图主流（合并模式并行、降级模式按链），腾讯仅作保底 → OSM 兜底
   * 返回 { ok, list, errCode, provider }：provider = tencent | amap | baidu | tianditu | osm
   */
  async searchPoiWithFallback(latitude, longitude, radius) {
    // ===== 合并模式：并行查询高德/百度/天地图（主流源），腾讯仅作保底（主流源均无点位时才查询）=====
    if (MERGE_ALL_PROVIDERS) {
      const [amapRes, baiduRes, tiandituRes] = await Promise.all([
        this.searchAmapPoi(latitude, longitude, radius),
        this.searchBaiduPoi(latitude, longitude, radius),
        this.searchTiandituPoi(latitude, longitude, radius)
      ])
      const sources = [
        { name: 'amap', res: amapRes },
        { name: 'baidu', res: baiduRes },
        { name: 'tianditu', res: tiandituRes }
      ]
      let merged = []
      const okSources = []
      const errCodes = {}
      for (const s of sources) {
        if (s.res.ok && (s.res.list || []).length > 0) {
          merged = merged.concat(s.res.list)
          okSources.push(s.name)
        } else if (s.res.ok) {
          console.log('[index] ' + s.name + ' 返回空点位，继续合并其他来源')
        } else {
          console.warn('[index] ' + s.name + ' 查询失败 errCode=', s.res.errCode)
          errCodes[s.name + 'ErrCode'] = s.res.errCode
        }
      }
      // 腾讯保底：主流源（高德/百度/天地图）均无有效点位时，才调用腾讯补位（配额紧张，省着用）
      if (merged.length === 0) {
        console.log('[index] 高德/百度/天地图均无点位，启用腾讯保底查询')
        const tencentRes = await this.searchTencentPoi(latitude, longitude, radius)
        if (tencentRes.ok && (tencentRes.list || []).length > 0) {
          merged = tencentRes.list
          okSources.push('tencent')
        } else if (tencentRes.ok) {
          console.log('[index] tencent 保底返回空点位')
        } else {
          console.warn('[index] tencent 保底查询失败 errCode=', tencentRes.errCode)
          errCodes.tencentErrCode = tencentRes.errCode
        }
      }
      if (merged.length === 0) {
        // 主流源与腾讯保底全部为空/失败 → OSM 云函数兜底（尽力而为，失败不影响主流程）
        const osmRes = await this.fetchOsmToilet(latitude, longitude, radius)
        if (osmRes.ok && (osmRes.list || []).length > 0) {
          return { ...osmRes, provider: 'osm' }
        }
        // 全部无数据：ok=false 让上层按服务商异常处理（不阻断数据库点位渲染）
        return { ok: false, list: [], provider: 'amap+baidu+tianditu', errCode: -1, ...errCodes, osmErrCode: osmRes.errCode, tiandituErrCode: tiandituRes.errCode }
      }
      console.log('[index] 合并模式点位 provider=', okSources.join('+'), '原始点位=', merged.length)
      return { ok: true, list: merged, errCode: 0, provider: okSources.join('+'), merged: true, ...errCodes }
    }

    // ===== 降级模式：主流源优先，任一成功即停止，腾讯仅作保底 =====
    // 高德（主流源）
    const amapRes = await this.searchAmapPoi(latitude, longitude, radius)
    if (amapRes.ok && (amapRes.list || []).length > 0) {
      return { ...amapRes, provider: 'amap' }
    }
    // 高德失败/为空 → 百度备用（未配置 AK 时快速跳过）
    const baiduRes = await this.searchBaiduPoi(latitude, longitude, radius)
    if (baiduRes.ok && (baiduRes.list || []).length > 0) {
      return { ...baiduRes, provider: 'baidu' }
    }
    // 百度失败/为空 → 天地图备用（未配置 Key 时快速跳过）
    const tiandituRes = await this.searchTiandituPoi(latitude, longitude, radius)
    if (tiandituRes.ok && (tiandituRes.list || []).length > 0) {
      return { ...tiandituRes, provider: 'tianditu' }
    }
    // 主流源均无数据 → 腾讯保底查询（配额紧张，仅兜底时调用）
    const tencentRes = await this.searchTencentPoi(latitude, longitude, radius)
    if (tencentRes.ok && (tencentRes.list || []).length > 0) {
      return { ...tencentRes, provider: 'tencent' }
    }
    // 腾讯保底也无数据 → OSM 云函数兜底（尽力而为，失败不影响主流程）
    const osmRes = await this.fetchOsmToilet(latitude, longitude, radius)
    if (osmRes.ok && (osmRes.list || []).length > 0) {
      return { ...osmRes, provider: 'osm' }
    }
    // 全部无数据：保留腾讯结果状态（ok 原样），附上各源错误码便于排查
    return { ...tencentRes, provider: 'tencent', amapErrCode: amapRes.errCode, baiduErrCode: baiduRes.errCode, tiandituErrCode: tiandituRes.errCode, osmErrCode: osmRes.errCode }
  },

  /**
   * 读取同位置短时缓存（同 111 米网格 + 同半径 + 30 分钟内）：
   * 命中则直接复用上次查询结果，不调用任何地图 API / 云函数，最大限度节省配额
   */
  getNearbyCache(latitude, longitude, radius) {
    try {
      const all = wx.getStorageSync(SEARCH_CACHE_KEY) || {}
      const key = buildSearchCacheKey(latitude, longitude, radius)
      const hit = all[key]
      if (!hit || !Array.isArray(hit.toilets) || hit.toilets.length === 0) return null
      if (Date.now() - hit.time > SEARCH_CACHE_TTL) return null
      console.log('[index] 命中同位置短时缓存 key=', key, '点位=', hit.toilets.length)
      return hit.toilets
    } catch (err) {
      console.warn('[index] 读取附近缓存失败（完整错误）', err)
      return null
    }
  },

  /**
   * 写入同位置短时缓存（最多保留 SEARCH_CACHE_MAX 个位置，超出淘汰最旧；同时清理过期缓存）
   */
  saveNearbyCache(latitude, longitude, radius, toilets) {
    try {
      if (!Array.isArray(toilets) || toilets.length === 0) return
      const now = Date.now()
      const all = wx.getStorageSync(SEARCH_CACHE_KEY) || {}
      // 清理过期缓存，避免无限累积
      Object.keys(all).forEach((k) => {
        if (now - (all[k].time || 0) > SEARCH_CACHE_TTL) delete all[k]
      })
      const key = buildSearchCacheKey(latitude, longitude, radius)
      all[key] = { time: now, toilets }
      const keys = Object.keys(all)
      if (keys.length > SEARCH_CACHE_MAX) {
        keys.sort((a, b) => (all[a].time || 0) - (all[b].time || 0))
        delete all[keys[0]]
        console.log('[index] 附近缓存超过上限，已淘汰最旧位置', keys[0])
      }
      wx.setStorageSync(SEARCH_CACHE_KEY, all)
      console.log('[index] 已写入同位置短时缓存 key=', key, '点位=', toilets.length, '缓存位置数=', Object.keys(all).length)
    } catch (err) {
      console.warn('[index] 写入附近缓存失败（完整错误）', err)
    }
  },

  /**
   * 查询成功渲染后写查询记录（次数已不限，无需扣减）：
   * 记录用户本次查找过的厕所 + 写入查询记录；缓存命中复用旧结果时同样写记录，保持业务一致
   */
  async writeSearchRecord(toilets) {
    try {
      this.saveSearchedToilets(toilets)
      this.addSearchRecord(toilets.length)
    } catch (err) {
      console.error('[index] 写查询记录异常（查询已完成，完整错误）', err)
    }
  },

  /**
   * 异步缓存圈内 POI 到 toiletAll（saveTencentPoi 云函数内部做 50 米去重；函数名为历史命名，已支持全部数据源）
   */
  savePoiCache(pois) {
    wx.cloud.callFunction({
      name: 'saveTencentPoi',
      data: { pois }
    }).then((res) => {
      const r = res.result || {}
      console.log('[index] 全源 POI 缓存结果 saved=', r.saved, 'skipped=', r.skipped)
      // 回填入库后的 _id：让 POI 点位立即支持收藏/举报/反馈（无需等下一次查询）
      if (Array.isArray(r.list) && r.list.length) {
        this.applyPoiIds(r.list)
      }
    }).catch((err) => {
      console.error('[index] 全源 POI 缓存失败（完整错误）', err)
    })
  },

  /**
   * 把 saveTencentPoi 返回的入库点位 _id 回填到当前页面 toilets / allToilets / 弹窗数据，
   * 使地图服务商 POI 点位（原无 _id）也能立即支持收藏、举报、反馈
   */
  applyPoiIds(poiIds) {
    if (!Array.isArray(poiIds) || !poiIds.length) return
    const match = (item) => {
      if (!item || item._id || !isValidCoordinate(item.lat, item.lng)) return false
      for (const p of poiIds) {
        if (p && p._id && p.name === item.name && getDistance(item.lat, item.lng, p.lat, p.lng) <= 50) {
          item._id = p._id
          return true
        }
      }
      return false
    }
    let changed = false
    const toilets = this.data.toilets.map((t) => { const c = Object.assign({}, t); if (match(c)) changed = true; return c })
    const allToilets = this.data.allToilets.map((t) => { const c = Object.assign({}, t); if (match(c)) changed = true; return c })
    if (changed) this.setData({ toilets, allToilets })
    // 详情弹窗已打开且该点位缺 _id 时同步补上
    if (this.data.selectedToilet && !this.data.selectedToilet._id) {
      const copy = Object.assign({}, this.data.selectedToilet)
      if (match(copy)) this.setData({ 'selectedToilet._id': copy._id })
    }
    // marker 气泡已打开且该点位缺 _id 时同步补上
    if (this.data.selectedMarker && !this.data.selectedMarker._id) {
      const copy = Object.assign({}, this.data.selectedMarker)
      if (match(copy)) this.setData({ 'selectedMarker._id': copy._id })
    }
  },

  /**
   * 解析点位在 toiletAll 中的 _id：已带 _id 直接返回；POI 点位按「同名 50 米」在库中兜底查找
   * 兜底失败返回空字符串（该点位可能尚未回写数据库，提示暂不支持）
   */
  resolveToiletId(toilet) {
    return new Promise((resolve) => {
      if (!toilet) return resolve('')
      if (toilet._id) return resolve(toilet._id)
      const db = wx.cloud.database()
      db.collection('toiletAll')
        .where({ name: toilet.name, invalid: false })
        .limit(50)
        .get()
        .then((res) => {
          const data = res.data || []
          for (const doc of data) {
            if (isValidCoordinate(doc.lat, doc.lng) && getDistance(toilet.lat, toilet.lng, doc.lat, doc.lng) <= 50) {
              resolve(doc._id)
              return
            }
          }
          resolve('')
        })
        .catch((err) => {
          console.error('[index] 解析点位 _id 失败（完整错误）', err)
          resolve('')
        })
    })
  },

  /**
   * 圈内点位去重：同名且 50 米内只保留一条
   */
  dedupeToilets(list) {
    const result = []
    for (const item of list) {
      // 非法坐标点位直接跳过，避免距离计算 NaN 影响去重
      if (!item || !isValidCoordinate(item.lat, item.lng)) {
        console.warn('[index] 去重跳过非法坐标点位：', item && item.name)
        continue
      }
      let dup = false
      for (const t of result) {
        const dist = getDistance(t.lat, t.lng, item.lat, item.lng)
        if (isFinite(dist) && t.name === item.name && dist <= 50) {
          dup = true
          break
        }
      }
      if (!dup) result.push(item)
    }
    return result
  },

  /**
   * 渲染圈内 marker（只渲染红圈内的点位；marker id 用数字）
   */
  renderToilets(toilets) {
    const { latitude, longitude, selectedRadius, filters } = this.data
    // 先逐条校验并计算距离，再按距离由近到远排序，保证「最近」速览、底部列表与 marker 顺序一致
    const valid = []
    toilets.forEach((item) => {
      // 边界校验：非法/NaN 坐标或距离不参与渲染，防止误过滤全部有效点位
      if (!isValidCoordinate(item.lat, item.lng)) {
        console.warn('[index] 丢弃非法坐标点位：', item.name, item.lat, item.lng)
        return
      }
      const dist = getDistance(latitude, longitude, item.lat, item.lng)
      if (!isFinite(dist)) {
        console.warn('[index] 丢弃距离计算异常点位：', item.name, '距离=', dist)
        return
      }
      if (!this.data.showAllMode && dist > selectedRadius) {
        console.log('[index] 丢弃圈外点位：', item.name, '距离=', Math.round(dist), '米')
        return
      }
      item.distance = Math.round(dist)
      item.distanceText = util.formatDistance(dist)
      valid.push(item)
    })
    valid.sort((a, b) => (a.distance || 0) - (b.distance || 0))
    const markers = valid.map((item, index) => ({
      id: index, // 数字 id
      latitude: item.lat,
      longitude: item.lng,
      iconPath: item.source === 'user' ? '/images/marker/toilet-active.png' : '/images/marker/toilet.png', // 用户上报点位用开心马桶，其余用可爱马桶
      width: 34,
      height: 34,
      anchor: { x: 0.5, y: 0.95 },
      callout: {
        content: item.name,
        color: '#2c3e50',
        fontSize: 12,
        borderRadius: 8,
        bgColor: '#ffffff',
        padding: 6,
        display: 'BYCLICK'
      }
    }))
    // 筛选无匹配提示：有筛选条件且原数据非空但结果为空
    const hasFilter = !!(filters.hasPaper || filters.barrierFree || filters.babyRoom || filters.open24h)
    const filterEmpty = hasFilter && this.data.allToilets.length > 0 && valid.length === 0
    console.log('[index] 渲染 marker 数量=', markers.length, '（圈内=', valid.length, '）filterEmpty=', filterEmpty)
    // 筛选等本地操作不释放搜索中的 loading 锁：查询进行中（searchInFlight）时保持 loading=true，
    // 防止用户误以为查询已结束而再次点击开始寻找，导致多轮并发请求（百度 QPS 极易超限）
    this.setData({ toilets: valid, markers, totalCount: markers.length, loading: this.searchInFlight ? true : false, filterEmpty })
  },

  /**
   * 写入查询记录（仅在整套查询成功并扣减次数后调用）
   */
  addSearchRecord(searchCount) {
    const { latitude, longitude, selectedRadius } = this.data
    wx.cloud.callFunction({
      name: 'searchRecordOperate',
      data: { action: 'add', searchRadius: selectedRadius, searchCount, userLat: latitude, userLng: longitude }
    }).then((res) => {
      console.log('[index] 查询记录已写入', res.result)
    }).catch((err) => {
      console.error('[index] 写入查询记录失败（完整错误）', err)
    })
  },

  /**
   * 记录用户查找过的厕所（saveSearchedToilets 云函数写入 toilet_view_record）
   * 在整套查询成功并扣减次数后调用；云函数内按 openid+同名50米去重，只更新时间不重复插入
   */
  saveSearchedToilets(toilets) {
    const list = Array.isArray(toilets) ? toilets.filter((t) => t && isValidCoordinate(t.lat, t.lng)) : []
    if (list.length === 0) return
    wx.cloud.callFunction({
      name: 'saveSearchedToilets',
      data: { toilets: list }
    }).then((res) => {
      const r = res.result || {}
      console.log('[index] 查找过的厕所已记录 saved=', r.saved, 'updated=', r.updated, 'skipped=', r.skipped)
    }).catch((err) => {
      console.error('[index] 记录查找过的厕所失败（完整错误）', err)
    })
  },

  /**
   * 顶部筛选：仅对已获取圈内数据生效，本地过滤，不消耗查询次数
   */
  toggleFilter(e) {
    // 【硬约束】筛选标签只允许做本地数据过滤，禁止在 toggleFilter / clearFilter / applyFilter /
    // renderToilets 中触发任何 loadToiletData 或地图 POI 请求（腾讯/高德/百度/天地图/OSM 一律不碰），
    // 彻底杜绝筛选点击消耗地图 API 并发配额；配合 WXML 使用 catchtap 阻止事件冒泡
    const key = e.currentTarget.dataset.key
    const filters = { ...this.data.filters, [key]: !this.data.filters[key] }
    this.setData({ filters })
    this.applyFilter()
  },

  // 一键重置筛选（同样纯本地过滤，不触发任何地图 API 请求）
  clearFilter() {
    this.setData({ filters: { hasPaper: false, barrierFree: false, babyRoom: false, open24h: false } })
    this.applyFilter()
  },

  applyFilter() {
    // 仅按筛选条件过滤已获取的圈内数据：纯本地计算，不消耗次数、不发起任何地图请求
    const { allToilets, filters } = this.data
    const toilets = allToilets.filter((t) => {
      if (filters.hasPaper && !t.hasPaper) return false
      if (filters.barrierFree && !t.isBarrierFree) return false
      if (filters.babyRoom && !t.hasBabyRoom) return false
      if (filters.open24h && !t.isOpen24h) return false
      return true
    })
    this.renderToilets(toilets)
  },


  // 最近查询记录：展示当前用户查找/浏览过的厕所（按最近查看时间倒序） / 退出查询
  toggleShowAll() {
    if (this.data.showAllMode) {
      this.exitShowAll()
    } else {
      this.showAllToilets()
    }
  },

  /**
   * 最近查询记录：读取当前用户的 toilet_view_record（getRecentQueries 云函数按 lastSeenTime 倒序），
   * 把最近查询过的厕所渲染到地图，隐藏红圈、用 include-points 缩放视野覆盖这些点位；
   * 不消耗查询次数、不调用任何地图 POI 接口
   */
  showAllToilets() {
    if (this.data.loading) return
    // 【性能优化】最近查询记录：云函数按 lastSeenTime 倒序返回最多 100 条，本地只做坐标校验、
    // 保留记录顺序；单次 setData 若传输过大（>250KB）会触发性能警告，
    // 且地图堆叠过多 marker 会卡顿，这里把大体积数据拆成多次 setData：markers / allToilets / toilets 各一次。
    const SHOW_ALL_MAX = 100 // 最终展示：最近查询记录最多 100 条
    const CANDIDATE_MAX = 100 // 云函数单次返回上限
    const { latitude, longitude, filters } = this.data
    this.setData({ loading: true, markerBubble: false, selectedToilet: null, emptyModal: false, showList: false })
    wx.cloud.callFunction({
      name: 'getRecentQueries',
      data: { max: CANDIDATE_MAX }
    }).then((res) => {
      const r = res.result || {}
      if (r.code !== 0) {
        throw new Error(r.msg || '查询记录读取失败')
      }
      const list = r.list || []
      if (list.length === 0) {
        console.warn('[index] 暂无最近查询记录')
        this.setData({ loading: false, showAllMode: false })
        wx.showToast({ title: '还没有查询记录，先点「开始寻找」找厕所吧', icon: 'none' })
        return
      }
      // 保留云函数返回顺序（最近查看在前），本地只做坐标校验
      const sorted = list
        .map((t) => {
          const dist = getDistance(latitude, longitude, t.lat, t.lng)
          return Object.assign({}, t, { distance: Math.round(dist), distanceText: util.formatDistance(dist) })
        })
        .filter((t) => isFinite(t.distance) && isValidCoordinate(t.lat, t.lng))
      const nearest = sorted.slice(0, SHOW_ALL_MAX)
      const markers = nearest.map((item, index) => ({
        id: 10000 + index, // 数字 id，避开腾讯 POI / 圈内 marker 的 id 段，防止冲突
        latitude: item.lat,
        longitude: item.lng,
        iconPath: item.source === 'user' ? '/images/marker/toilet-active.png' : '/images/marker/toilet.png', // 用户上报点位用开心马桶，其余用可爱马桶
        width: 34,
        height: 34,
        anchor: { x: 0.5, y: 0.95 },
        callout: {
          content: item.name,
          color: '#2c3e50',
          fontSize: 12,
          borderRadius: 8,
          bgColor: '#ffffff',
          padding: 6,
          display: 'BYCLICK'
        }
      }))
      // 视野覆盖：均匀抽样最多 30 个点 + 用户位置，用 MapContext.includePoints 缩放到覆盖全部点位
      const sample = nearest.filter((_, i) => i % Math.max(1, Math.ceil(nearest.length / 29)) === 0).slice(0, 29)
      const fitPoints = [{ latitude, longitude }].concat(sample.map((t) => ({ latitude: t.lat, longitude: t.lng })))
      console.log('[index] 最近查询记录 total=', r.total, '有效=', sorted.length, '展示=', nearest.length)

      // 先渲染地图 markers 与轻量状态（约 100+KB）
      this.setData({
        showAllMode: true,
        loading: false,
        searched: true,
        circles: [], // 查询记录模式不画红圈
        markers,
        totalCount: markers.length,
        filterEmpty: false
      })
      // 列表数据体积较大，单独分次写入，避免单次 setData 超过 250KB 触发性能警告
      this.setData({ allToilets: nearest })
      this.setData({ toilets: nearest })
      this.fitMapPoints(fitPoints)
      wx.showToast({ title: '已展示最近查询记录 ' + nearest.length + ' 条', icon: 'none' })
      // 若已有筛选条件，继续对查询记录生效
      if (filters.hasPaper || filters.barrierFree || filters.babyRoom || filters.open24h) {
        this.applyFilter()
      }
    }).catch((err) => {
      console.error('[index] 最近查询记录加载失败（完整错误）', err)
      this.setData({ loading: false, showAllMode: false })
      wx.showToast({ title: '查询记录加载失败，请稍后重试', icon: 'none' })
    })
  },
  // 展开/收起底部列表（0 个厕所时不可展开）
  toggleList() {
    if (this.data.totalCount === 0) return
    this.setData({ showList: !this.data.showList })
  },

  /**
   * 点击 marker：优先弹出简易气泡卡片（含查看详情按钮）
   */
  onMarkerTap(e) {
    const marker = this.data.markers.find((m) => m.id === e.detail.markerId)
    if (!marker) return
    const toilet = this.data.toilets.find(
      (t) => t.lat === marker.latitude && t.lng === marker.longitude
    )
    if (!toilet) return
    // 记录 marker 点击时间，防止 map 的 bindtap 同时触发导致气泡刚开就关
    this._lastMarkerTap = Date.now()
    const distanceText = util.formatDistance(getDistance(this.data.latitude, this.data.longitude, toilet.lat, toilet.lng))
    this.setData({
      markerBubble: true,
      selectedMarker: { ...toilet, distanceText }
    })
  },

  // 点击地图空白：关闭简易气泡（marker 点击后 300ms 内的 tap 忽略）
  onMapTap() {
    if (this._lastMarkerTap && Date.now() - this._lastMarkerTap < 300) return
    if (this.data.markerBubble) {
      this.setData({ markerBubble: false })
    }
  },

  // 气泡卡片「查看详情」
  viewDetailFromBubble() {
    const toilet = this.data.selectedMarker
    this.setData({ markerBubble: false })
    if (toilet) this.openDetail(toilet)
  },

  // 气泡卡片「一键导航」
  navFromBubble() {
    const toilet = this.data.selectedMarker
    this.setData({ markerBubble: false })
    if (!toilet) return
    wx.openLocation({
      latitude: toilet.lat,
      longitude: toilet.lng,
      name: toilet.name,
      address: toilet.address || '',
      scale: 18,
      fail: (err) => {
        console.error('[index] 打开地图导航失败（完整错误）', err)
        wx.showToast({ title: '打开地图失败，请检查定位权限', icon: 'none' })
      }
    })
  },

  // 列表条目点击：打开详情弹窗
  onListItemTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    const toilet = this.data.toilets[index]
    if (toilet) this.openDetail(toilet)
  },

  // 底部列表「一键导航」：不打开详情，直接拉起微信地图导航
  navFromList(e) {
    const index = Number(e.currentTarget.dataset.index)
    const toilet = this.data.toilets[index]
    if (!toilet || !isValidCoordinate(toilet.lat, toilet.lng)) {
      wx.showToast({ title: '该厕所暂不支持导航', icon: 'none' })
      return
    }
    wx.openLocation({
      latitude: toilet.lat,
      longitude: toilet.lng,
      name: toilet.name,
      address: toilet.address || '',
      scale: 18,
      fail: (err) => {
        console.error('[index] 列表导航打开地图失败（完整错误）', err)
        wx.showToast({ title: '打开地图失败，请检查定位权限', icon: 'none' })
      }
    })
  },

  // 地图右下角定位按钮：回到用户定位中心点
  relocate() {
    if (app.globalData.userLocation) {
      const { latitude, longitude } = app.globalData.userLocation
      this.setData({ latitude, longitude, locationReady: true, loadingDone: true })
      console.log('[index] 回到我的位置', latitude, longitude)
      wx.showToast({ title: '已回到我的位置', icon: 'none' })
    } else {
      console.log('[index] 无定位缓存，重新获取定位')
      app.globalData.userLocation = null
      this.ensureLocation()
      wx.showToast({ title: '正在重新定位…', icon: 'none' })
    }
  },

  // 空状态弹窗：扩大查询半径（自动切换下一档，不自动查询）
  expandRadius() {
    const { radiusIndex, radiusOptions, latitude, longitude } = this.data
    if (radiusIndex >= radiusOptions.length - 1) {
      wx.showToast({ title: '已是最大查询半径', icon: 'none' })
      return
    }
    const nextIndex = radiusIndex + 1
    const selectedRadius = radiusOptions[nextIndex]
    this.setData({
      radiusIndex: nextIndex,
      selectedRadius,
      emptyModal: false,
      circles: [{
        latitude,
        longitude,
        radius: selectedRadius,
        color: '#FF6B6B',
        fillColor: '#FF6B6B26',
        strokeWidth: 3
      }]
    })
    wx.showToast({ title: '已切换至 ' + selectedRadius + ' 米，点击开始寻找', icon: 'none' })
  },

  // 空状态弹窗：去上报
  goReportFromEmpty() {
    // 【个人主体审核】上报功能已停用（入口已隐藏）
    return
    this.setData({ emptyModal: false })
    wx.navigateTo({ url: '/pages/report/report' })
  },

  // 关闭空状态弹窗
  closeEmptyModal() {
    this.setData({ emptyModal: false })
  },

  // 展示 0 结果空状态弹窗
  showEmptyModal() {
    this.setData({ emptyModal: true })
  },


  openDetail(toilet) {
    const distance = util.formatDistance(getDistance(this.data.latitude, this.data.longitude, toilet.lat, toilet.lng))
    this.setData({
      selectedToilet: { ...toilet, distanceText: distance },
      commentScores: { hygiene: 0, comfort: 0, air: 0 },
      commentTotalScore: 0,
      commentContent: '',
      comments: [],
      detailCardScrollTop: 0,
      toiletLiked: false,
      toiletLikeCount: 0
    })
    // 【个人主体审核】评价/评分功能已停用：不初始化评价悬浮按钮、不拉取评价列表
    // this.initCommentFab()
    // this.loadComments(toilet._id)
    this.checkFavorited(toilet._id)
    this.checkToiletLike(toilet._id)
  },

  closeDetail() {
    this.setData({ selectedToilet: null })
  },

  // 预览现场照片（用户上报照片审核通过后对所有用户展示）
  previewPhoto(e) {
    const src = e.currentTarget.dataset.src
    if (!src) return
    const urls = (this.data.selectedToilet && this.data.selectedToilet.photoUrls) || []
    wx.previewImage({ current: src, urls })
  },

  /**
   * 根据 id 读取公厕并打开详情弹窗（我的页面跳转用）
   */
  openToiletById(toiletId) {
    if (!toiletId) return
    const db = wx.cloud.database()
    db.collection('toiletAll')
      .doc(toiletId)
      .get()
      .then((res) => {
        const toilet = res.data
        if (toilet && isValidCoordinate(toilet.lat, toilet.lng)) {
          this.openDetail(toilet)
        } else {
          wx.showToast({ title: '未找到该公厕', icon: 'none' })
        }
      })
      .catch((err) => {
        console.error('[index] 打开公厕失败（完整错误）', err)
        wx.showToast({ title: '未找到该公厕', icon: 'none' })
      })
  },

  // 读取评价列表（走云函数，保证任意用户可见全部评价，不受集合权限限制）
  loadComments(toiletId) {
    // 【个人主体审核】不再读取/展示其他用户评价
    return
    if (!toiletId) return
    wx.cloud
      .callFunction({ name: 'getComments', data: { toiletId } })
      .then((res) => {
        const r = res.result || {}
        if (r.code === 0) {
          // 补充展示字段：头像兜底、评价时间友好格式化、点赞/回复交互状态
          const list = (r.list || []).map((item) => ({
            ...item,
            timeText: item.createTime ? util.formatTime(item.createTime) : '',
            replyOpen: false,
            replyContent: ''
          }))
          this.setData({ comments: list })
        } else {
          console.error('[index] getComments 返回错误（完整返回）', JSON.stringify(r))
          this.setData({ comments: [] })
        }
      })
      .catch((err) => {
        console.error('[index] 读取评价失败（完整错误）', err)
        this.setData({ comments: [] })
      })
  },

  checkFavorited(toiletId) {
    if (!toiletId) return
    wx.cloud.callFunction({ name: 'favoriteOperate', data: { action: 'check', toiletId } }).then((res) => {
      const r = res.result || {}
      this.setData({ favorited: !!r.favorited })
    }).catch((err) => {
      console.error('[index] 检查收藏状态失败（完整错误）', err)
    })
  },

  // 检查厕所点赞状态（是否已赞 + 点赞总数）
  checkToiletLike(toiletId) {
    if (!toiletId) return
    wx.cloud.callFunction({ name: 'toiletLikeOperate', data: { action: 'get', toiletId } }).then((res) => {
      const r = res.result || {}
      if (r.code === 0) {
        this.setData({ toiletLiked: !!r.liked, toiletLikeCount: r.likeCount || 0 })
      }
    }).catch((err) => {
      console.error('[index] 检查厕所点赞状态失败（完整错误）', err)
    })
  },

  // 点赞 / 取消点赞（POI 点位无 _id 时按「同名 50 米」兜底解析后操作，同一用户同一厕所 toggle）
  toggleToiletLike() {
    const toilet = this.data.selectedToilet
    if (!toilet) {
      wx.showToast({ title: '该点位暂不支持点赞', icon: 'none' })
      return
    }
    this.resolveToiletId(toilet).then((toiletId) => {
      if (!toiletId) {
        wx.showToast({ title: '该点位暂不支持点赞', icon: 'none' })
        return
      }
      if (toilet._id !== toiletId) this.setData({ 'selectedToilet._id': toiletId })
      wx.cloud.callFunction({ name: 'toiletLikeOperate', data: { action: 'toggle', toiletId } }).then((res) => {
        const r = res.result || {}
        if (r.code === 0) {
          this.setData({ toiletLiked: !!r.liked, toiletLikeCount: r.likeCount || 0 })
          wx.showToast({ title: r.liked ? '点赞成功' : '已取消点赞', icon: 'none' })
        } else {
          console.error('[index] toiletLikeOperate 返回错误（完整返回）', JSON.stringify(r))
          wx.showToast({ title: r.msg || '操作失败', icon: 'none' })
        }
      }).catch((err) => {
        console.error('[index] 点赞操作失败（完整错误）', err)
        wx.showToast({ title: '操作失败，请检查网络后重试', icon: 'none' })
      })
    })
  },

  // 一键导航
  navToToilet() {
    const toilet = this.data.selectedToilet
    if (!toilet) return
    wx.openLocation({
      latitude: toilet.lat,
      longitude: toilet.lng,
      name: toilet.name,
      address: toilet.address || '',
      scale: 18,
      fail: (err) => {
        console.error('[index] 打开地图导航失败（完整错误）', err)
        wx.showToast({ title: '打开地图失败，请检查定位权限', icon: 'none' })
      }
    })
  },

  // 收藏 / 取消收藏（POI 点位无 _id 时按「同名 50 米」兜底解析后操作）
  toggleFavorite() {
    const toilet = this.data.selectedToilet
    if (!toilet) {
      wx.showToast({ title: '该点位暂不支持收藏', icon: 'none' })
      return
    }
    this.resolveToiletId(toilet).then((toiletId) => {
      if (!toiletId) {
        wx.showToast({ title: '该点位暂不支持收藏', icon: 'none' })
        return
      }
      if (toilet._id !== toiletId) this.setData({ 'selectedToilet._id': toiletId })
      const action = this.data.favorited ? 'remove' : 'add'
      wx.cloud.callFunction({ name: 'favoriteOperate', data: { action, toiletId } }).then((res) => {
        const r = res.result || {}
        if (r.code === 0) {
          this.setData({ favorited: action === 'add' })
          wx.showToast({ title: action === 'add' ? '收藏成功' : '已取消收藏', icon: 'none' })
        } else if (r.code !== 2) {
          console.error('[index] favoriteOperate 返回错误（完整返回）', JSON.stringify(r))
          wx.showToast({ title: r.msg || '操作失败', icon: 'none' })
        }
      }).catch((err) => {
        console.error('[index] 收藏操作失败（完整错误）', err)
        wx.showToast({ title: '操作失败，请检查网络后重试', icon: 'none' })
      })
    })
  },

  // 评分选择（与上报页维度对应：卫生环境/如厕体验/空气质量，综合自动计算）
  onCommentScoreTap(e) {
    // 【个人主体审核】评分功能已停用
    return
    const key = e.currentTarget.dataset.key
    const score = Number(e.currentTarget.dataset.score)
    if (!key || !score) return
    this.setData({ ['commentScores.' + key]: score }, () => this.calcCommentTotal())
  },

  // 综合评分：三维平均，四舍五入为 1-5 整数（与云函数校验一致，保证用户可正常提交评分）
  calcCommentTotal() {
    const { hygiene, comfort, air } = this.data.commentScores
    const total = Math.round((hygiene + comfort + air) / 3)
    this.setData({ commentTotalScore: total })
  },

  onCommentInput(e) {
    // 【个人主体审核】评价输入已停用
    return
    this.setData({ commentContent: e.detail.value })
  },

  // 提交评价（四维评分与上报页对应，成功后实时刷新评分与评价列表）
  submitComment() {
    // 【个人主体审核】提交评价已停用，禁止调用 submitComment 云函数
    return
    const toilet = this.data.selectedToilet
    const { commentScores, commentTotalScore, commentContent, submittingComment } = this.data
    if (!toilet || !toilet._id) return
    if (!commentScores.hygiene || !commentScores.comfort || !commentScores.air) {
      wx.showToast({ title: '请完成全部评分', icon: 'none' })
      return
    }
    if (!String(commentContent || '').trim()) {
      wx.showToast({ title: '评价内容不能为空', icon: 'none' })
      return
    }
    if (submittingComment) return
    this.setData({ submittingComment: true })
    wx.cloud.callFunction({
      name: 'submitComment',
      data: {
        toiletId: toilet._id,
        hygiene: commentScores.hygiene,
        comfort: commentScores.comfort,
        air: commentScores.air,
        total: commentTotalScore,
        content: commentContent
      }
    }).then((res) => {
      const r = res.result || {}
      this.setData({ submittingComment: false })
      if (r.code === 0) {
        wx.showToast({ title: '评价成功', icon: 'success' })
        // 实时刷新当前厕所评分与评价列表（保留弹窗展示）
        this.refreshToiletScore(toilet._id)
        this.loadComments(toilet._id)
        this.setData({ commentContent: '', commentScores: { hygiene: 0, comfort: 0, air: 0 }, commentTotalScore: 0 })
      } else {
        console.error('[index] submitComment 返回错误（完整返回）', JSON.stringify(r))
        wx.showToast({ title: r.msg || '评价失败', icon: 'none' })
      }
    }).catch((err) => {
      console.error('[index] 提交评价失败（完整错误）', err)
      this.setData({ submittingComment: false })
      wx.showToast({ title: '提交评价失败，请检查网络后重试', icon: 'none' })
    })
  },

  // 点赞 / 取消点赞（走 commentOperate 云函数，同一用户 toggle）
  toggleCommentLike(e) {
    // 【个人主体审核】评论点赞已停用
    return
    const index = Number(e.currentTarget.dataset.index)
    const comment = this.data.comments[index]
    if (!comment || !comment._id) return
    wx.cloud.callFunction({
      name: 'commentOperate',
      data: { action: 'like', commentId: comment._id }
    }).then((res) => {
      const r = res.result || {}
      if (r.code === 0) {
        this.setData({
          ['comments[' + index + '].liked']: r.liked,
          ['comments[' + index + '].likeCount']: r.likeCount
        })
      } else {
        wx.showToast({ title: r.msg || '操作失败', icon: 'none' })
      }
    }).catch((err) => {
      console.error('[index] 点赞失败（完整错误）', err)
      wx.showToast({ title: '点赞失败，请稍后重试', icon: 'none' })
    })
  },

  // 展开 / 收起回复输入框
  toggleReplyInput(e) {
    // 【个人主体审核】评论回复已停用
    return
    const index = Number(e.currentTarget.dataset.index)
    const comment = this.data.comments[index]
    if (!comment) return
    this.setData({ ['comments[' + index + '].replyOpen']: !comment.replyOpen })
  },

  // 回复内容输入
  onReplyInput(e) {
    // 【个人主体审核】评论回复输入已停用
    return
    const index = Number(e.currentTarget.dataset.index)
    this.setData({ ['comments[' + index + '].replyContent']: e.detail.value })
  },

  // 提交回复（成功后重新拉取评价列表展示最新回复）
  submitReply(e) {
    // 【个人主体审核】提交回复已停用
    return
    const index = Number(e.currentTarget.dataset.index)
    const comment = this.data.comments[index]
    if (!comment || !comment._id) return
    const content = String(comment.replyContent || '').trim()
    if (!content) {
      wx.showToast({ title: '回复内容不能为空', icon: 'none' })
      return
    }
    wx.cloud.callFunction({
      name: 'commentOperate',
      data: { action: 'reply', commentId: comment._id, content }
    }).then((res) => {
      const r = res.result || {}
      if (r.code === 0) {
        wx.showToast({ title: '回复成功', icon: 'success' })
        const toilet = this.data.selectedToilet
        if (toilet && toilet._id) this.loadComments(toilet._id)
      } else {
        wx.showToast({ title: r.msg || '回复失败', icon: 'none' })
      }
    }).catch((err) => {
      console.error('[index] 回复失败（完整错误）', err)
      wx.showToast({ title: '回复失败，请稍后重试', icon: 'none' })
    })
  },

  // 删除自己的评论（仅 isMine 评论显示删除入口）
  deleteMyComment(e) {
    // 【个人主体审核】删除评论已停用
    return
    const index = Number(e.currentTarget.dataset.index)
    const comment = this.data.comments[index]
    if (!comment || !comment._id || !comment.isMine) return
    wx.showModal({
      title: '删除评论',
      content: '确定删除这条评论吗？删除后不可恢复',
      confirmColor: '#FF3B30',
      success: (res) => {
        if (!res.confirm) return
        wx.cloud.callFunction({
          name: 'commentOperate',
          data: { action: 'delete', commentId: comment._id }
        }).then((r2) => {
          const r = r2.result || {}
          if (r.code === 0) {
            const comments = this.data.comments.slice()
            comments.splice(index, 1)
            this.setData({ comments })
            wx.showToast({ title: '已删除', icon: 'success' })
            // 删除后刷新厕所评分（评论数与均分变化）
            const toilet = this.data.selectedToilet
            if (toilet && toilet._id) this.refreshToiletScore(toilet._id)
          } else {
            wx.showToast({ title: r.msg || '删除失败', icon: 'none' })
          }
        }).catch((err) => {
          console.error('[index] 删除评论失败（完整错误）', err)
          wx.showToast({ title: '删除失败，请稍后重试', icon: 'none' })
        })
      }
    })
  },

  /**
   * 评价页全屏可滑动悬浮按钮：初始化位置（读取系统窗口尺寸 + 本地保存，默认右下偏上）
   */
  initCommentFab() {
    // 【个人主体审核】评价悬浮按钮已停用
    return
    try {
      const win = wx.getSystemInfoSync()
      const px = win.windowWidth / 750 // 1rpx 对应的 px
      this.cfabSize = 88 * px
      this.cwinW = win.windowWidth
      this.cwinH = win.windowHeight
      const saved = wx.getStorageSync('comment_fab_pos')
      if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
        this.setData({ commentFabLeft: saved.left, commentFabTop: saved.top })
      } else {
        this.setData({
          commentFabLeft: Math.round(this.cwinW - this.cfabSize - 24 * px),
          commentFabTop: Math.round(this.cwinH - this.cfabSize - 320 * px)
        })
      }
    } catch (err) {
      console.warn('[index] 初始化评价悬浮按钮位置失败（完整错误）', err)
    }
  },

  // 悬浮按钮：按下记录起点
  cfabTouchStart(e) {
    // 【个人主体审核】评价悬浮按钮已停用
    return
    const t = e.touches && e.touches[0]
    if (!t) return
    this._cfabDrag = {
      startX: t.clientX,
      startY: t.clientY,
      left: this.data.commentFabLeft,
      top: this.data.commentFabTop,
      moved: false
    }
  },

  // 悬浮按钮：拖动（全屏范围可滑动）
  cfabTouchMove(e) {
    // 【个人主体审核】评价悬浮按钮已停用
    return
    const drag = this._cfabDrag
    const t = e.touches && e.touches[0]
    if (!drag || !t) return
    const dx = t.clientX - drag.startX
    const dy = t.clientY - drag.startY
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) drag.moved = true
    let left = drag.left + dx
    let top = drag.top + dy
    left = Math.max(8, Math.min(this.cwinW - this.cfabSize - 8, left))
    top = Math.max(8, Math.min(this.cwinH - this.cfabSize - 8, top))
    this.setData({ commentFabLeft: left, commentFabTop: top })
  },

  // 悬浮按钮：松手（未拖动视为点击，滚动到写评价表单）
  cfabTouchEnd() {
    // 【个人主体审核】评价悬浮按钮已停用
    return
    const drag = this._cfabDrag
    if (!drag) return
    this._cfabDrag = null
    try {
      wx.setStorageSync('comment_fab_pos', { left: this.data.commentFabLeft, top: this.data.commentFabTop })
    } catch (e) {
      // 存储失败不影响功能
    }
    if (!drag.moved) this.onCommentFabTap()
  },

  // 点击悬浮按钮：把详情弹窗滚动到「写评价」表单
  onCommentFabTap() {
    // 【个人主体审核】评价悬浮按钮已停用
    return
    const query = wx.createSelectorQuery()
    query.select('.detail-card').scrollOffset()
    query.select('.detail-card').boundingClientRect()
    query.select('.comment-form').boundingClientRect()
    query.exec((res) => {
      const offset = res[0]
      const card = res[1]
      const form = res[2]
      if (!offset || !card || !form) return
      const target = offset.scrollTop + (form.top - card.top) - 20
      this.setData({ detailCardScrollTop: Math.max(0, Math.round(target)) })
    })
  },

  /**
   * 提交评价后实时刷新厕所评分（详情弹窗 + 列表数据）
   */
  refreshToiletScore(toiletId) {
    if (!toiletId) return
    const db = wx.cloud.database()
    db.collection('toiletAll')
      .doc(toiletId)
      .get()
      .then((res) => {
        const t = res.data
        if (!t) return
        const rating = t.rating || 0
        const ratingCount = t.ratingCount || 0
        // 详情弹窗
        if (this.data.selectedToilet && this.data.selectedToilet._id === toiletId) {
          this.setData({
            'selectedToilet.rating': rating,
            'selectedToilet.ratingCount': ratingCount
          })
        }
        // 列表数据
        const toilets = this.data.toilets.map((item) =>
          item._id === toiletId ? { ...item, rating, ratingCount } : item
        )
        const allToilets = this.data.allToilets.map((item) =>
          item._id === toiletId ? { ...item, rating, ratingCount } : item
        )
        this.setData({ toilets, allToilets })
        console.log('[index] 公厕评分已刷新', toiletId, rating, ratingCount)
      })
      .catch((err) => {
        console.error('[index] 刷新公厕评分失败（完整错误）', err)
      })
  },

  // 举报（POI 点位无 _id 时按「同名 50 米」兜底解析后操作）
  reportToilet() {
    // 【个人主体审核】举报/反馈已停用
    return
    const toilet = this.data.selectedToilet
    if (!toilet) {
      wx.showToast({ title: '该点位暂不支持举报', icon: 'none' })
      return
    }
    this.resolveToiletId(toilet).then((toiletId) => {
      if (!toiletId) {
        wx.showToast({ title: '该点位暂不支持举报', icon: 'none' })
        return
      }
      if (toilet._id !== toiletId) this.setData({ 'selectedToilet._id': toiletId })
      wx.showModal({
        title: '举报公厕',
        editable: true,
        placeholderText: '请填写举报原因（如位置已失效、信息错误等）',
        success: (res) => {
          if (!res.confirm) return
          const reason = String(res.content || '').trim()
          if (!reason) {
            wx.showToast({ title: '请填写举报原因', icon: 'none' })
            return
          }
          wx.cloud.callFunction({
            name: 'submitReportComplaint',
            data: { toiletId, reason }
          }).then((r) => {
            const result = r.result || {}
            wx.showToast({ title: result.msg || '举报已提交', icon: 'none' })
          }).catch((err) => {
            console.error('[index] 提交举报失败（完整错误）', err)
            wx.showToast({ title: '举报提交失败，请检查网络后重试', icon: 'none' })
          })
        }
      })
    })
  },

  // 我要反馈：从气泡卡片进入（带厕所 id/名称/地址；POI 点位无 _id 时兜底解析）
  feedbackFromBubble() {
    // 【个人主体审核】反馈入口已停用
    return
    const m = this.data.selectedMarker
    if (!m) {
      wx.showToast({ title: '该点位暂不支持反馈', icon: 'none' })
      return
    }
    this.resolveToiletId(m).then((toiletId) => {
      if (!toiletId) {
        wx.showToast({ title: '该点位暂不支持反馈', icon: 'none' })
        return
      }
      wx.navigateTo({
        url: '/pages/feedback/feedback?id=' + toiletId +
          '&name=' + encodeURIComponent(m.name || '') +
          '&address=' + encodeURIComponent(m.address || '')
      })
    })
  },

  // 我要反馈：从详情弹窗进入（POI 点位无 _id 时兜底解析）
  feedbackToilet() {
    // 【个人主体审核】反馈入口已停用
    return
    const t = this.data.selectedToilet
    if (!t) {
      wx.showToast({ title: '该点位暂不支持反馈', icon: 'none' })
      return
    }
    this.resolveToiletId(t).then((toiletId) => {
      if (!toiletId) {
        wx.showToast({ title: '该点位暂不支持反馈', icon: 'none' })
        return
      }
      wx.navigateTo({
        url: '/pages/feedback/feedback?id=' + toiletId +
          '&name=' + encodeURIComponent(t.name || '') +
          '&address=' + encodeURIComponent(t.address || '')
      })
    })
  },

  // 反馈 / 举报（合并为一个入口：先弹出选择，再走原有举报或反馈逻辑）
  reportOrFeedback() {
    // 【个人主体审核】反馈/举报已停用
    return
    const toilet = this.data.selectedToilet
    if (!toilet) {
      wx.showToast({ title: '该点位暂不支持操作', icon: 'none' })
      return
    }
    wx.showActionSheet({
      itemList: ['举报公厕', '反馈公厕问题'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.reportToilet()
        } else if (res.tapIndex === 1) {
          this.feedbackToilet()
        }
      }
    })
  },

  // 阻止详情卡片点击冒泡
  /**
   * 打卡到此一游：用户需在公厕 50 米范围内才能打卡；本地记录，不写云端
   */
  checkinToilet() {
    const toilet = this.data.selectedToilet
    if (!toilet || !isValidCoordinate(toilet.lat, toilet.lng)) {
      wx.showToast({ title: '该公厕暂不支持打卡', icon: 'none' })
      return
    }
    if (!this.data.locationReady) {
      wx.showToast({ title: '请先允许定位，获取你的位置', icon: 'none' })
      return
    }
    const distance = getDistance(this.data.latitude, this.data.longitude, toilet.lat, toilet.lng)
    if (!isFinite(distance)) {
      wx.showToast({ title: '定位异常，请稍后重试', icon: 'none' })
      return
    }
    if (distance > CHECKIN_RADIUS) {
      const remain = Math.ceil(distance - CHECKIN_RADIUS)
      wx.showToast({ title: `距离公厕还差${remain}米，靠近后再打卡`, icon: 'none' })
      return
    }
    const record = {
      _id: toilet._id || `toilet_${toilet.lat}_${toilet.lng}`,
      name: toilet.name || '未知公厕',
      address: toilet.address || '附近公厕',
      lat: toilet.lat,
      lng: toilet.lng,
      createTime: Date.now()
    }
    try {
      const list = wx.getStorageSync(CHECKIN_STORAGE_KEY) || []
      const arr = Array.isArray(list) ? list : []
      if (!arr.some((item) => item._id === record._id)) arr.unshift(record)
      wx.setStorageSync(CHECKIN_STORAGE_KEY, arr)
    } catch (err) {
      console.warn('[index] 写入打卡记录失败（不影响主流程）', err)
    }
    wx.showToast({ title: '打卡成功，已记录到我的打卡', icon: 'success' })
  },

  noop() {},

  // ===== 上报悬浮钮：可拖动（仅限屏幕下半部），位置持久化 =====

  // 初始化按钮位置：读取系统窗口尺寸 + 本地保存的位置；无保存则默认右下角
  initFabPosition() {
    try {
      const win = wx.getSystemInfoSync()
      const px = win.windowWidth / 750 // 1rpx 对应的 px
      this.fabSize = 104 * px // 按钮 104rpx
      this.winW = win.windowWidth
      this.winH = win.windowHeight
      const saved = wx.getStorageSync('report_fab_pos')
      if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
        this.setData({ fabLeft: saved.left, fabTop: saved.top })
        console.log('[index] 上报按钮恢复上次位置', saved)
      } else {
        this.setData({
          fabLeft: Math.round(this.winW - this.fabSize - 32 * px),
          fabTop: Math.round(this.winH - this.fabSize - 180 * px)
        })
      }
    } catch (err) {
      console.warn('[index] 初始化上报按钮位置失败（完整错误）', err)
    }
  },

  fabTouchStart(e) {
    const t = e.touches && e.touches[0]
    if (!t) return
    this._fabDrag = {
      startX: t.clientX,
      startY: t.clientY,
      left: this.data.fabLeft,
      top: this.data.fabTop,
      moved: false
    }
  },

  fabTouchMove(e) {
    const drag = this._fabDrag
    const t = e.touches && e.touches[0]
    if (!drag || !t) return
    const dx = t.clientX - drag.startX
    const dy = t.clientY - drag.startY
    // 位移超过 8px 才判定为拖动，避免点击误触发
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) drag.moved = true
    if (!drag.moved) return
    // 仅限屏幕下半部：top 不小于窗口 42% 高度，底部预留 60rpx，左右各留 8px
    const px = this.winW / 750
    const minTop = Math.round(this.winH * 0.42)
    const maxTop = Math.round(this.winH - this.fabSize - 60 * px)
    const maxLeft = Math.round(this.winW - this.fabSize - 8)
    const left = Math.min(Math.max(drag.left + dx, 8), maxLeft)
    const top = Math.min(Math.max(drag.top + dy, minTop), maxTop)
    this.setData({ fabLeft: left, fabTop: top })
  },

  fabTouchEnd() {
    const drag = this._fabDrag
    if (!drag) return
    // 拖动结束：持久化位置
    if (drag.moved) {
      try {
        wx.setStorageSync('report_fab_pos', { left: this.data.fabLeft, top: this.data.fabTop })
      } catch (err) {
        console.warn('[index] 保存上报按钮位置失败（完整错误）', err)
      }
    }
    // 记录本次是否拖动过，供 goReport 拦截拖动结束后误触发的 tap
    this.fabJustDragged = !!drag.moved
    this._fabDrag = null
  },

  // 去上报（拖动结束时可能伴随 tap，拖动过则忽略本次 tap）
  goReport() {
    // 【个人主体审核】上报功能已停用（入口已隐藏）
    return
    if (this.fabJustDragged) {
      this.fabJustDragged = false
      return
    }
    wx.navigateTo({ url: '/pages/report/report' })
  },

  // 我的
  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' })
  },

  // 重新定位
  retryLocation() {
    app.globalData.userLocation = null
    this.ensureLocation()
  },

  // 关闭定位提示条
  closeLocateTip() {
    this.setData({ locateTipHidden: true })
  }
})
