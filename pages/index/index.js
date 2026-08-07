// pages/index/index.js - 附近厕所主页面
// 核心交互：选择半径（实时预览红圈）→ 点击【开始寻找】→ 渲染红圈 → 加载圈内公厕 → 整套查询成功后才消耗次数并写记录
// 查询分支：①库有数据+腾讯失败→仅展示本地库；②库空+腾讯有数据→正常渲染腾讯POI；③两边无数据→空状态弹窗；④接口异常→不扣次数提示重试
// 错误处理：所有云函数/地图接口异常均 console.error 打印完整错误对象；球面距离过滤被丢弃点位打印距离，便于排查误过滤
// 数据源：toiletAll 自有库（gov/user/tencent 缓存）+ 腾讯/高德/百度/天地图 POI 多源合并（可降级）
const app = getApp()
const util = require('../../utils/util.js')

// 腾讯位置服务配置
const QQ_MAP_KEY = 'GEFBZ-6ZJK3-45U3Q-O4H6X-65A3K-NAFLU'
const QQ_SEARCH_URL = 'https://apis.map.qq.com/ws/place/v1/search'
// 公厕多关键词（各数据源逐词查询后合并去重，显著提升召回率；高德 keywords 支持 | 一次传多词）
const SEARCH_KEYWORDS = ['公共厕所', '公厕', '卫生间', '洗手间', '公共卫生间', '旅游厕所', 'WC']
const SEARCH_KEYWORD = SEARCH_KEYWORDS[0] // 单关键词兼容

// 高德地图 Web 服务配置（备用数据源：腾讯失败/为空/额度耗尽时自动切换）
const AMAP_KEY = '5ad7207ca36306e6559d30ed02ef37bc'
const AMAP_SEARCH_URL = 'https://restapi.amap.com/v3/place/around'

// 百度地图 Web 服务配置（第三备用数据源：腾讯/高德均失败或为空时启用）
// 需在百度地图开放平台（https://lbsyun.baidu.com/）申请「服务端」类型 AK，
// 并到微信公众平台把 https://api.map.baidu.com 加入 request 合法域名
const BAIDU_AK = 'JggVZQfYf3r0sklCquGHKUAWNfus2BbG'
const BAIDU_SEARCH_URL = 'https://api.map.baidu.com/place/v2/search'

// 天地图周边搜索配置（第四数据源：CGCS2000≈WGS-84，需转 GCJ-02 后供小程序 map 使用）
// 重要：天地图 Key 分「浏览器端 / 服务端」两种权限类型，小程序 wx.request 直连会被识别为浏览器端访问；
//       本项目使用「服务端」类型 Key，必须经云函数 searchTiandituPoi 代理查询（服务端访问），
//       否则返回 403（code 301013 权限类型错误）。Key 存放在云函数 searchTiandituPoi/index.js 顶部 TIANDITU_KEY。
// 云函数 searchTiandituPoi 需在微信开发者工具中右键部署后生效；未部署时前端静默跳过该源，不影响其他数据源。
// 云函数出网不受小程序 request 合法域名白名单限制，无需在微信公众平台添加天地图域名。
const TIANDITU_ENABLED = true // 是否启用天地图数据源（依赖云函数 searchTiandituPoi 已部署）

// 多源合并模式：true=每次查询并行调用腾讯/高德/百度/天地图并合并点位（点位最多，各源当日额度耗尽自动跳过）
// false=降级链模式（腾讯→高德→百度→天地图→OSM，任一成功即停止，接口调用更省）
const MERGE_ALL_PROVIDERS = true

// 定位失败兜底中心（广州珠江新城）
const DEFAULT_CENTER = { latitude: 23.12908, longitude: 113.3245 }
const LOCATE_TIMEOUT = 8000
const REQUEST_TIMEOUT = 8000

// 腾讯 POI 当日额度耗尽标记（status=121）
let poiQuotaExhausted = false
let poiQuotaExhaustedDate = ''
// 高德 POI 当日额度耗尽标记（infocode=10044）
let amapQuotaExhausted = false
let amapQuotaExhaustedDate = ''
// 百度 POI 当日额度耗尽标记（status=302 天配额超限 / 402 配额超限）
let baiduQuotaExhausted = false
let baiduQuotaExhaustedDate = ''

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
    // 今日剩余查询次数
    remaining: 20,
    dailyLimit: 20,
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
    commentScore: 5,
    commentContent: '',
    submittingComment: false,
    favorited: false
  },

  onLoad() {
    // 页面加载：仅定位 + 读取今日剩余次数，不自动查询、无红圈、无 marker
    this.ensureLocation()
    this.fetchQuota()
  },

  onShow() {
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
    // 回到页面时刷新剩余次数
    if (this.data.loadingDone) this.fetchQuota()
  },

  /**
   * 获取用户位置（GCJ-02），带超时保护；失败回退默认坐标并显示提示条
   */
  ensureLocation() {
    const self = this
    if (app.globalData.userLocation) {
      const { latitude, longitude } = app.globalData.userLocation
      self.setData({ latitude, longitude, locationReady: true, loadingDone: true })
      console.log('[index] 使用缓存定位', latitude, longitude)
      return
    }
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
        wx.showToast({ title: '定位失败，已切换到默认位置', icon: 'none' })
        self.setData({ locationReady: false, loadingDone: true })
      }
    })
  },

  /**
   * 获取今日剩余查询次数（quotaOperate get，不消耗）
   */
  fetchQuota() {
    wx.cloud.callFunction({
      name: 'quotaOperate',
      data: { action: 'get' }
    }).then((res) => {
      const r = res.result || {}
      if (r.code === 0) {
        this.setData({ remaining: r.remaining, dailyLimit: r.dailyLimit })
        console.log('[index] 今日剩余查询次数', r.remaining, '/', r.dailyLimit)
      } else {
        console.error('[index] quotaOperate get 返回错误（完整返回）', JSON.stringify(r))
      }
    }).catch((err) => {
      console.error('[index] 获取剩余次数失败（完整错误）', err)
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
   * 1. 校验定位就绪、经纬度有效、剩余次数 > 0
   * 2. 渲染红色查询圈，按钮进入 loading 状态（防重复点击）
   * 3. 执行 loadToiletData 完整查询（geoNear + 腾讯降级）
   * 4. 整套查询成功后才消耗 1 次查询次数并写查询记录；失败不扣次数、不写记录
   */
  startSearch() {
    const { loading, loadingDone, remaining, latitude, longitude } = this.data
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
    if (remaining <= 0) {
      wx.showToast({ title: '今日查询次数已用完，每日0点将会重置次数', icon: 'none' })
      return
    }
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
   * 执行顺序：① getNearToilet 读自有库 → ② 腾讯 place 接口（带超时）
   * 分支：
   *  - 情况1：腾讯正常返回 POI → 合并过滤数据库点位与腾讯点位
   *  - 情况2：腾讯报错/超时/返回空 → 不判定整体失败，保留数据库点位继续渲染，toast「地图服务商暂时异常，仅展示用户上报的厕所点位」
   *  - 情况3：数据库云函数失败 && 腾讯也失败 → 弹窗「查询失败，本次未消耗次数，请稍后重试」，不扣次数
   *  - 情况4：数据库无数据 && 腾讯无数据 → 空状态弹窗「附近暂未找到公厕，试试扩大半径或上报新点位」
   * 次数规则：只要自有数据库查询成功即消耗 1 次并写查询记录；仅数据库云函数本身异常才不消耗次数
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

    // 2. 周边 POI：腾讯优先，失败/为空/额度耗尽时自动切高德备用（失败不阻断整体查询，只轻提示）
    const poiRes = await this.searchPoiWithFallback(latitude, longitude, selectedRadius)
    const poiOk = poiRes.ok
    const poiList = poiRes.list || []
    console.log('[index] 周边POI返回（provider=', poiRes.provider, 'ok=', poiOk, 'errCode=', poiRes.errCode, '原始点位=', poiList.length, '）完整信息=', JSON.stringify(poiRes))

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
        // 情况3：数据库云函数失败 && 腾讯也失败 → 弹窗，不扣次数
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
        // 情况2：腾讯报错/超时/返回空，保留数据库点位继续渲染（轻提示，不阻断）
        toilets = near.slice()
        if (!poiOk) {
          toastText = '地图服务商暂时异常，仅展示用户上报的厕所点位'
        } else if (poiRes.errCode === 121) {
          toastText = '今日官方公厕查询额度已用尽，仅展示用户上报的厕所点位'
        }
      } else {
        // 情况4：数据库无数据 && 腾讯无数据（或腾讯也失败）→ 空状态弹窗
        toilets = []
        showEmpty = true
        if (!poiOk) {
          toastText = '地图服务商暂时异常，仅展示用户上报的厕所点位'
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
    if (toastText) {
      wx.showToast({ title: toastText, icon: 'none' })
    }

    // 5. 次数消耗：数据库云函数正常即消耗 1 次并写查询记录；仅数据库异常不消耗
    if (shouldConsume) {
      try {
        const quotaRes = await wx.cloud.callFunction({
          name: 'quotaOperate',
          data: { action: 'consume' }
        })
        const q = quotaRes.result || {}
        if (q.code === 3) {
          // 查询已完成但次数配额已用尽（如多端同时使用）
          console.warn('[index] 查询完成但次数配额已用尽（完整返回）', JSON.stringify(q))
          this.setData({ remaining: 0 })
          wx.showToast({ title: '今日查询次数已用完，每日0点将会重置次数', icon: 'none' })
          return
        }
        if (q.code !== 0) {
          console.error('[index] 消耗次数返回错误（完整返回）', JSON.stringify(q))
          wx.showToast({ title: q.msg || '次数扣减失败，请稍后重试', icon: 'none' })
          return
        }
        this.setData({ remaining: q.remaining })
        console.log('[index] 查询成功，已消耗 1 次，剩余', q.remaining, '/', q.dailyLimit)
        this.addSearchRecord(toilets.length)
      } catch (err) {
        // 次数扣减失败：数据已展示，但未扣次数、不写查询记录
        console.error('[index] 消耗查询次数异常（查询已完成但未扣次数，完整错误）', err)
        wx.showToast({ title: '查询已完成，次数同步失败，请检查网络', icon: 'none' })
      }
    } else {
      console.log('[index] 数据库云函数异常，本次不消耗查询次数')
    }

    // 6. 情况4：空状态弹窗（含扩大半径 / 上报厕所快捷按钮）
    if (showEmpty) {
      this.showEmptyModal()
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
      if (!QQ_MAP_KEY || QQ_MAP_KEY.indexOf('请替换') === 0) {
        console.warn('[index] 未配置 QQ_MAP_KEY，跳过腾讯查询')
        resolve({ ok: true, list: [], errCode: 0 })
        return
      }
      // 多关键词轮询：腾讯 keyword 单次只支持一个词，逐词查询后按「同名 50 米」去重合并
      const all = []
      let anySuccess = false
      let lastErr = 0
      const runKeyword = (index) => {
        if (index >= SEARCH_KEYWORDS.length) {
          const list = this.dedupeToilets(all)
          if (list.length > 0 || anySuccess) {
            resolve({ ok: true, errCode: 0, list })
          } else {
            resolve({ ok: false, list: [], errCode: lastErr || -1 })
          }
          return
        }
        wx.request({
          url: QQ_SEARCH_URL,
          // 重要：腾讯 place/v1/search 已废弃 location+radius，必须用 boundary=nearby(lat,lng,radius)，
          // 否则返回 status=348「boundary 参数不合法」，导致腾讯接口必败（实测验证）
          data: {
            keyword: SEARCH_KEYWORDS[index],
            boundary: 'nearby(' + latitude + ',' + longitude + ',' + radius + ')',
            page_size: 20,
            key: QQ_MAP_KEY
          },
          timeout: REQUEST_TIMEOUT,
          success: (res) => {
            const body = res.data || {}
            if (body.status === 0) {
              anySuccess = true
              // 打印腾讯接口原始返回数据，便于调试
              console.log('[index] 腾讯接口原始返回数据（keyword=', SEARCH_KEYWORDS[index], '）', JSON.stringify(body))
              const list = Array.isArray(body.data) ? body.data : []
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
            const errCode = body.status
            lastErr = errCode
            // 打印完整返回体，方便定位 Key/配额/参数问题
            console.error('[index] 腾讯 POI 查询失败（完整返回 keyword=', SEARCH_KEYWORDS[index], '）', JSON.stringify(body))
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
          },
          fail: (err) => {
            lastErr = -1
            console.error('[index] 腾讯 POI 请求失败（完整错误 keyword=', SEARCH_KEYWORDS[index], '）', err)
            runKeyword(index + 1)
          }
        })
      }
      runKeyword(0)
    })
  },

  /**
   * 高德 POI 周边搜索（v3/place/around，备用数据源）
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
          callback({
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
        callback({ ok: false, list: [], errCode: infocode })
      },
      fail: (err) => {
        console.error('[index] 高德 POI 请求失败（完整错误 参数=', JSON.stringify(extraParams), '）', err)
        callback({ ok: false, list: [], errCode: -1 })
      }
    })
  },
  /**
   * 百度 POI 周边搜索（place/v2/search，第三备用数据源）
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
      let anySuccess = false
      let lastErr = 0
      const runKeyword = (index) => {
        if (index >= SEARCH_KEYWORDS.length) {
          const list = this.dedupeToilets(all)
          if (list.length > 0 || anySuccess) {
            resolve({ ok: true, errCode: 0, list })
          } else {
            resolve({ ok: false, list: [], errCode: lastErr || -1 })
          }
          return
        }
        wx.request({
          url: BAIDU_SEARCH_URL,
          // 百度 place/v2/search：location 传 纬度,经度；radius 米；filter 按距离排序
          data: {
            query: SEARCH_KEYWORDS[index],
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
              anySuccess = true
              // 打印百度接口原始返回数据，便于调试
              console.log('[index] 百度接口原始返回数据（status=0 keyword=', SEARCH_KEYWORDS[index], '）', JSON.stringify(body))
              const results = Array.isArray(body.results) ? body.results : []
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
            const errCode = body.status
            lastErr = errCode
            // 打印完整返回体，方便定位 Key/配额/参数问题
            console.error('[index] 百度 POI 查询失败（完整返回 keyword=', SEARCH_KEYWORDS[index], '）', JSON.stringify(body))
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
          },
          fail: (err) => {
            lastErr = -1
            console.error('[index] 百度 POI 请求失败（完整错误 keyword=', SEARCH_KEYWORDS[index], '）', err)
            runKeyword(index + 1)
          }
        })
      }
      runKeyword(0)
    })
  },

  /**
   * 天地图周边搜索（第四数据源，经云函数 searchTiandituPoi 代理）
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
      wx.cloud.callFunction({
        name: 'searchTiandituPoi',
        data: { latitude, longitude, radius }
      }).then((res) => {
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
      wx.cloud.callFunction({
        name: 'fetchOsmToilet',
        data: { latitude, longitude, radius }
      }).then((res) => {
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
   * 周边 POI 多源降级：腾讯优先 → 高德 → 百度 → OSM 兜底
   * 返回 { ok, list, errCode, provider }：provider = tencent | amap | baidu | osm
   */
  async searchPoiWithFallback(latitude, longitude, radius) {
    // ===== 合并模式：并行查询腾讯/高德/百度/天地图，四源点位合并（点位最多）=====
    if (MERGE_ALL_PROVIDERS) {
      const [tencentRes, amapRes, baiduRes, tiandituRes] = await Promise.all([
        this.searchTencentPoi(latitude, longitude, radius),
        this.searchAmapPoi(latitude, longitude, radius),
        this.searchBaiduPoi(latitude, longitude, radius),
        this.searchTiandituPoi(latitude, longitude, radius)
      ])
      const sources = [
        { name: 'tencent', res: tencentRes },
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
      if (merged.length === 0) {
        // 四源全部为空/失败 → OSM 云函数兜底（尽力而为，失败不影响主流程）
        const osmRes = await this.fetchOsmToilet(latitude, longitude, radius)
        if (osmRes.ok && (osmRes.list || []).length > 0) {
          return { ...osmRes, provider: 'osm' }
        }
        // 全部无数据：ok=false 让上层按服务商异常处理（不阻断数据库点位渲染）
        return { ok: false, list: [], provider: 'tencent+amap+baidu+tianditu', errCode: -1, ...errCodes, osmErrCode: osmRes.errCode, tiandituErrCode: tiandituRes.errCode }
      }
      console.log('[index] 合并模式点位 provider=', okSources.join('+'), '原始点位=', merged.length)
      return { ok: true, list: merged, errCode: 0, provider: okSources.join('+'), merged: true, ...errCodes }
    }

    // ===== 降级模式：任一服务商成功即停止，接口调用更省 =====
    const tencentRes = await this.searchTencentPoi(latitude, longitude, radius)
    if (tencentRes.ok && (tencentRes.list || []).length > 0) {
      return { ...tencentRes, provider: 'tencent' }
    }
    // 腾讯失败/为空/额度耗尽 → 高德备用
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
    // 前四源均无数据 → OSM 云函数兜底（尽力而为，失败不影响主流程）
    const osmRes = await this.fetchOsmToilet(latitude, longitude, radius)
    if (osmRes.ok && (osmRes.list || []).length > 0) {
      return { ...osmRes, provider: 'osm' }
    }
    // 全部无数据：保留腾讯结果状态（ok 原样），附上各源错误码便于排查
    return { ...tencentRes, provider: 'tencent', amapErrCode: amapRes.errCode, baiduErrCode: baiduRes.errCode, tiandituErrCode: tiandituRes.errCode, osmErrCode: osmRes.errCode }
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
    }).catch((err) => {
      console.error('[index] 全源 POI 缓存失败（完整错误）', err)
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
    const markers = []
    const { latitude, longitude, selectedRadius, filters } = this.data
    toilets.forEach((item, index) => {
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
      if (dist > selectedRadius) {
        console.log('[index] 丢弃圈外点位：', item.name, '距离=', Math.round(dist), '米')
        return
      }
      item.distance = Math.round(dist)
      item.distanceText = util.formatDistance(dist)
      markers.push({
        id: index, // 数字 id
        latitude: item.lat,
        longitude: item.lng,
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
      })
    })
    // 筛选无匹配提示：有筛选条件且原数据非空但结果为空
    const hasFilter = !!(filters.hasPaper || filters.barrierFree || filters.babyRoom || filters.open24h)
    const filterEmpty = hasFilter && this.data.allToilets.length > 0 && toilets.length === 0
    console.log('[index] 渲染 marker 数量=', markers.length, '（圈内=', toilets.length, '）filterEmpty=', filterEmpty)
    this.setData({ toilets, markers, totalCount: markers.length, loading: false, filterEmpty })
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
   * 顶部筛选：仅对已获取圈内数据生效，本地过滤，不消耗查询次数
   */
  toggleFilter(e) {
    const key = e.currentTarget.dataset.key
    const filters = { ...this.data.filters, [key]: !this.data.filters[key] }
    this.setData({ filters })
    this.applyFilter()
  },

  // 一键重置筛选
  clearFilter() {
    this.setData({ filters: { hasPaper: false, barrierFree: false, babyRoom: false, open24h: false } })
    this.applyFilter()
  },

  applyFilter() {
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

  // 点击剩余次数文字：弹出说明
  onQuotaTap() {
    wx.showModal({
      title: '查询次数说明',
      content: '每人每天最多可查询 20 次，每日 0 点自动重置。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  openDetail(toilet) {
    const distance = util.formatDistance(getDistance(this.data.latitude, this.data.longitude, toilet.lat, toilet.lng))
    this.setData({
      selectedToilet: { ...toilet, distanceText: distance },
      commentScore: 5,
      commentContent: '',
      comments: []
    })
    this.loadComments(toilet._id)
    this.checkFavorited(toilet._id)
  },

  closeDetail() {
    this.setData({ selectedToilet: null })
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
    if (!toiletId) return
    wx.cloud
      .callFunction({ name: 'getComments', data: { toiletId } })
      .then((res) => {
        const r = res.result || {}
        if (r.code === 0) {
          this.setData({ comments: r.list || [] })
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

  // 收藏 / 取消收藏
  toggleFavorite() {
    const toilet = this.data.selectedToilet
    if (!toilet || !toilet._id) {
      wx.showToast({ title: '该点位暂不支持收藏', icon: 'none' })
      return
    }
    const action = this.data.favorited ? 'remove' : 'add'
    wx.cloud.callFunction({ name: 'favoriteOperate', data: { action, toiletId: toilet._id } }).then((res) => {
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
  },

  // 评分选择
  onScoreTap(e) {
    this.setData({ commentScore: Number(e.currentTarget.dataset.score) })
  },

  onCommentInput(e) {
    this.setData({ commentContent: e.detail.value })
  },

  // 提交评价（成功后实时刷新当前厕所评分与评价列表）
  submitComment() {
    const toilet = this.data.selectedToilet
    const { commentScore, commentContent, submittingComment } = this.data
    if (!toilet || !toilet._id) return
    if (!String(commentContent || '').trim()) {
      wx.showToast({ title: '评价内容不能为空', icon: 'none' })
      return
    }
    if (submittingComment) return
    this.setData({ submittingComment: true })
    wx.cloud.callFunction({
      name: 'submitComment',
      data: { toiletId: toilet._id, score: commentScore, content: commentContent }
    }).then((res) => {
      const r = res.result || {}
      this.setData({ submittingComment: false })
      if (r.code === 0) {
        wx.showToast({ title: '评价成功', icon: 'success' })
        // 实时刷新当前厕所评分与评价列表（保留弹窗展示）
        this.refreshToiletScore(toilet._id)
        this.loadComments(toilet._id)
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

  // 举报
  reportToilet() {
    const toilet = this.data.selectedToilet
    if (!toilet || !toilet._id) {
      wx.showToast({ title: '该点位暂不支持举报', icon: 'none' })
      return
    }
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
          data: { toiletId: toilet._id, reason }
        }).then((r) => {
          const result = r.result || {}
          wx.showToast({ title: result.msg || '举报已提交', icon: 'none' })
        }).catch((err) => {
          console.error('[index] 提交举报失败（完整错误）', err)
          wx.showToast({ title: '举报提交失败，请检查网络后重试', icon: 'none' })
        })
      }
    })
  },

  // 阻止详情卡片点击冒泡
  noop() {},

  // 去上报
  goReport() {
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