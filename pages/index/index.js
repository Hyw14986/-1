// pages/index/index.js - 首页：地图展示周边公厕（周边搜索 POI + 用户上报点位）
const app = getApp()
const db = wx.cloud.database()
const util = require('../../utils/util.js')

// ============================================================
// 腾讯位置服务 WebService API 配置
// 1. 前往 https://lbs.qq.com 注册开发者并创建应用，申请 Key（需开通 WebServiceAPI）
// 2. 把下面的 QQ_MAP_KEY 替换成你自己的 Key
// 3. 在小程序后台【开发管理 → 服务器域名 → request 合法域名】添加：https://apis.map.qq.com
// ============================================================
const QQ_MAP_KEY = 'GEFBZ-6ZJK3-45U3Q-O4H6X-65A3K-NAFLU'
const QQ_SEARCH_URL = 'https://apis.map.qq.com/ws/place/v1/search'
const SEARCH_KEYWORD = '公共厕所'
const SEARCH_RADIUS = 3000 // 周边搜索半径（米）

// 定位失败时的兜底中心点（广州珠江新城），仅用于保证地图可打开
const DEFAULT_CENTER = { latitude: 23.12908, longitude: 113.3245 }

Page({
  data: {
    latitude: DEFAULT_CENTER.latitude,
    longitude: DEFAULT_CENTER.longitude,
    scale: 15,
    markers: [],
    toilets: [],
    hasLocation: false,
    locationReady: false,
    loadingDone: false,
    selectedToilet: null,
    loadDone: false,
    locateMaskHidden: false,
    // 精准筛选：母婴室 / 无障碍（可多选，仅对带设施字段的用户上报点位生效）
    filters: { accessible: false, babyCare: false },
    // 蹲位余量提示文案
    seatTip: '蹲位充足'
  },

  onShow() {
    // 每次回到首页都刷新数据（比如刚上报过新公厕）
    this.initPage()
    // 首页使用自定义悬浮式底部菜单，隐藏系统 tabBar（切到其他 tab 时系统 tabBar 会自动恢复）
    if (wx.hideTabBar) {
      wx.hideTabBar({ animation: false })
    }
  },

  /**
   * 页面初始化：先定位，再加载周边公厕
   */
  async initPage() {
    await this.ensureLocation()
    this.loadMarkers()
  },

  /**
   * 获取用户位置（优先使用缓存的定位）
   */
  ensureLocation() {
    return new Promise((resolve) => {
      // 已有定位直接使用
      if (app.globalData.userLocation) {
        const { latitude, longitude } = app.globalData.userLocation
        this.setData({ latitude, longitude, hasLocation: true, locationReady: true, loadingDone: true })
        resolve(true)
        return
      }
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          const location = { latitude: res.latitude, longitude: res.longitude }
          app.globalData.userLocation = location
          this.setData({
            latitude: location.latitude,
            longitude: location.longitude,
            hasLocation: true,
            locationReady: true,
            loadingDone: true
          })
          resolve(true)
        },
        fail: () => {
          // 定位失败：友好提示，回退到默认中心点，仅展示用户上报点位
          wx.showToast({ title: '定位失败，请检查定位权限后重试', icon: 'none' })
          this.setData({
            latitude: DEFAULT_CENTER.latitude,
            longitude: DEFAULT_CENTER.longitude,
            locationReady: false,
            loadingDone: true
          })
          resolve(false)
        }
      })
    })
  },

  /**
   * 加载并合并两类公厕点位，生成地图标记：
   * ① 腾讯位置服务周边搜索 POI（type: 'poi'）
   * ② 云数据库 toilet_report 用户上报点位（type: 'user_report'）
   * @param {boolean} silent 拖动地图等静默刷新时不显示 loading
   */
  async loadMarkers(silent) {
    if (!silent) wx.showLoading({ title: '加载中', mask: true })
    try {
      const loc = app.globalData.userLocation
      // 并行拉取两类数据源；定位失败时没有搜索中心，只展示用户上报点位
      const [pois, reports] = await Promise.all([
        loc ? this.searchNearbyPois(loc.latitude, loc.longitude) : Promise.resolve([]),
        this.loadUserReports()
      ])
      const toilets = pois.concat(reports)
      console.log('周边公厕数量：poi=', pois.length, 'user_report=', reports.length)
      this.setData({ toilets })
      // 按当前筛选条件生成地图标记点
      this.refreshMarkers()
      // 计算蹲位余量提示
      this.setSeatTip(toilets)
      // 若已有选中的公厕，重新关联（按 类型+坐标 匹配，POI 无 _id）
      if (this.data.selectedToilet) {
        const selected = this.data.selectedToilet
        const found = toilets.find(
          (t) => t.type === selected.type && t.latitude === selected.latitude && t.longitude === selected.longitude
        )
        if (found) this.selectToilet(found)
      }
    } finally {
      if (!silent) wx.hideLoading()
      this.setData({ loadDone: true })
    }
  },

  /**
   * 腾讯位置服务：周边搜索 3000 米内「公共厕所」POI（GCJ-02 坐标系，适配 map 组件）
   */
  searchNearbyPois(latitude, longitude) {
    return new Promise((resolve) => {
      // Key 未配置时跳过周边搜索，避免无意义请求
      if (!QQ_MAP_KEY || QQ_MAP_KEY.indexOf('请替换') === 0) {
        console.warn('未配置腾讯位置服务 QQ_MAP_KEY，已跳过周边搜索')
        resolve([])
        return
      }
      wx.request({
        url: QQ_SEARCH_URL,
        data: {
          keyword: SEARCH_KEYWORD,
          location: latitude + ',' + longitude,
          radius: SEARCH_RADIUS,
          page_size: 20,
          key: QQ_MAP_KEY
        },
        success: (res) => {
          const body = res.data || {}
          if (body.status === 0 && Array.isArray(body.data)) {
            resolve(
              body.data.map((item) => ({
                type: 'poi',
                name: item.title || '公共厕所',
                address: item.address || item.title || '',
                latitude: item.location.lat,
                longitude: item.location.lng
              }))
            )
          } else {
            console.warn('腾讯周边搜索无结果', body)
            resolve([])
          }
        },
        fail: (err) => {
          console.warn('腾讯周边搜索请求失败', err)
          resolve([])
        }
      })
    })
  },

  /**
   * 读取云数据库 toilet_report 集合中的用户上报公厕（集合不存在时静默返回空）
   */
  async loadUserReports() {
    try {
      const list = await util.fetchAllRecords(db.collection('toilet_report'))
      return list.map((item) => ({
        type: 'user_report',
        _id: item._id,
        name: item.name || '未命名公厕',
        address: item.address || '',
        latitude: item.latitude,
        longitude: item.longitude,
        rating: item.rating,
        ratingCount: item.ratingCount,
        hasAccessible: !!item.hasAccessible,
        hasBabyCare: !!item.hasBabyCare,
        hasToiletPaper: !!item.hasToiletPaper,
        isFree: !!item.isFree,
        seatStatus: item.seatStatus
      }))
    } catch (err) {
      // 集合未创建/无权限时忽略，不影响周边 POI 渲染
      console.warn('读取用户上报公厕失败（集合不存在时忽略）', err)
      return []
    }
  },

  /**
   * 生成地图标记点（保留原始下标便于回查；按筛选条件过滤）
   */
  buildMarkers(list) {
    const { accessible, babyCare } = this.data.filters
    return list
      .map((item, index) => ({
        id: index,
        toiletIndex: index,
        type: item.type,
        latitude: item.latitude,
        longitude: item.longitude,
        // 来源标记：poi 用常规图标，user_report 用高亮图标，便于区分
        iconPath: item.type === 'user_report' ? '/images/marker-active.png' : '/images/marker.png',
        width: item.type === 'user_report' ? 40 : 36,
        height: item.type === 'user_report' ? 40 : 36,
        anchor: { x: 0.5, y: 0.93 }
      }))
      .filter((marker, index) => {
        const item = list[index]
        if (accessible && !item.hasAccessible) return false
        if (babyCare && !item.hasBabyCare) return false
        return true
      })
  },

  /**
   * 按当前筛选条件刷新地图标记点
   */
  refreshMarkers() {
    const markers = this.buildMarkers(this.data.toilets)
    this.setData({ markers })
  },

  /**
   * 切换筛选条件（母婴室 / 无障碍，可多选）
   */
  toggleFilter(e) {
    const key = e.currentTarget.dataset.key
    const filters = { ...this.data.filters, [key]: !this.data.filters[key] }
    this.setData({ filters })
    this.refreshMarkers()
    // 若选中的公厕被筛掉，收起底部卡片
    if (this.data.selectedToilet) {
      const selected = this.data.selectedToilet
      const stillVisible = this.data.toilets.some(
        (t) => t.type === selected.type && t.latitude === selected.latitude && t.longitude === selected.longitude
      )
      if (!stillVisible) this.setData({ selectedToilet: null })
    }
  },

  // 清除筛选，显示全部公厕
  clearFilter() {
    this.setData({ filters: { accessible: false, babyCare: false } })
    this.refreshMarkers()
  },

  /**
   * 蹲位余量提示：按点位中「蹲位紧张」占比给出简单提示（无数据时默认充足）
   */
  setSeatTip(toilets) {
    if (!toilets.length) {
      this.setData({ seatTip: '暂无蹲位数据' })
      return
    }
    const busy = toilets.filter((t) => t.seatStatus === 'busy').length
    this.setData({ seatTip: busy / toilets.length >= 0.4 ? '蹲位较紧张' : '蹲位充足' })
  },

  /**
   * 拖动地图结束：以地图中心点作为新的搜索中心，静默刷新周边公厕
   */
  onMapRegionChange(e) {
    if (e.type !== 'end') return
    const center = e.detail && e.detail.centerLocation
    if (!center || !center.latitude) return
    this.setData({ latitude: center.latitude, longitude: center.longitude })
    this.loadMarkers(true)
  },

  // 跳过定位引导，直接浏览地图
  skipLocateMask() {
    this.setData({ locateMaskHidden: true })
  },

  // 手动重试加载周边公厕
  retryLoad() {
    this.loadMarkers()
  },

  /**
   * 点击地图标记：弹出公厕简要卡片（名称、地址、距离）
   */
  onMarkerTap(e) {
    const marker = this.data.markers.find((m) => m.id === e.detail.markerId)
    if (!marker) return
    const toilet = this.data.toilets[marker.toiletIndex]
    if (!toilet) return
    this.selectToilet(toilet)
    // 高亮选中的标记点
    const markers = this.data.markers.map((m) => {
      const isActive = m.id === marker.id
      const base = m.type === 'user_report' ? '/images/marker-active.png' : '/images/marker.png'
      return {
        ...m,
        iconPath: isActive ? '/images/marker-active.png' : base,
        width: isActive ? 42 : m.type === 'user_report' ? 40 : 36,
        height: isActive ? 42 : m.type === 'user_report' ? 40 : 36
      }
    })
    this.setData({ markers })
  },

  /**
   * 组装选中公厕的卡片数据（设施标签、距离）
   */
  selectToilet(toilet) {
    const selectedToilet = {
      ...toilet,
      tags: util.getFacilityTags(toilet),
      distanceText: this.getDistanceText(toilet)
    }
    this.setData({ selectedToilet })
  },

  /**
   * 计算当前公厕距用户的距离文案
   */
  getDistanceText(toilet) {
    const loc = app.globalData.userLocation
    if (!loc) return ''
    const meters = util.getDistance(loc.latitude, loc.longitude, toilet.latitude, toilet.longitude)
    return util.formatDistance(meters)
  },

  // 点击地图空白处：收起卡片
  onMapTap() {
    if (this.data.selectedToilet) this.setData({ selectedToilet: null })
  },

  // 阻止卡片点击冒泡到地图
  noop() {},

  // 切换到列表视图
  goList() {
    wx.navigateTo({ url: '/pages/list/list' })
  },

  // 跳转上报页（tabBar 页使用 switchTab）
  goReport() {
    wx.switchTab({ url: '/pages/report/report' })
  },

  // 查看厕所详情：仅用户上报点位有数据库记录，POI 点位提示不支持
  goDetail() {
    const toilet = this.data.selectedToilet
    if (!toilet) return
    if (!toilet._id) {
      wx.showToast({ title: '该点位暂不支持查看详情', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/detail/detail?id=' + toilet._id })
  },

  // 调用微信地图导航（公共方法）
  openLocationFor(toilet) {
    wx.openLocation({
      latitude: toilet.latitude,
      longitude: toilet.longitude,
      name: toilet.name,
      address: toilet.address || '',
      scale: 18,
      fail: (err) => {
        const msg = (err && err.errMsg) || ''
        if (msg.indexOf('auth deny') > -1 || msg.indexOf('privacy') > -1) {
          wx.showModal({
            title: '无法打开导航',
            content: '未授权位置信息或隐私接口未开启，请在小程序设置中允许使用位置信息后重试。',
            showCancel: false
          })
        } else {
          wx.showToast({ title: '打开地图失败，请重试', icon: 'none' })
        }
      }
    })
  },

  // 导航到选中的公厕
  navToToilet() {
    const toilet = this.data.selectedToilet
    if (!toilet) return
    this.openLocationFor(toilet)
  },

  // 一键导航：优先导航已选公厕，未选时自动取最近的公厕
  navNow() {
    let target = this.data.selectedToilet
    const loc = app.globalData.userLocation
    if (!target && this.data.toilets.length && loc) {
      target = this.data.toilets
        .map((t) => ({
          ...t,
          _dist: util.getDistance(loc.latitude, loc.longitude, t.latitude, t.longitude)
        }))
        .sort((a, b) => a._dist - b._dist)[0]
    }
    if (!target) {
      wx.showToast({ title: '暂无可导航的公厕', icon: 'none' })
      return
    }
    this.openLocationFor(target)
  },

  // 悬浮底部菜单：找厕所（回到我的定位）
  dockHome() {
    this.locateMe()
  },

  // 悬浮底部菜单：我的
  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' })
  },

  // 回到我的定位
  locateMe() {
    if (app.globalData.userLocation) {
      const { latitude, longitude } = app.globalData.userLocation
      this.setData({ latitude, longitude, scale: 15 })
    } else {
      this.ensureLocation().then((ok) => {
        if (ok) {
          const { latitude, longitude } = app.globalData.userLocation
          this.setData({ latitude, longitude, scale: 15 })
        }
      })
    }
  },

  // 重试定位
  retryLocation() {
    app.globalData.userLocation = null
    this.ensureLocation()
  },

  // 打开设置页授权定位
  openSetting() {
    wx.openSetting({
      success: (res) => {
        if (res.authSetting['scope.userLocation']) {
          app.globalData.userLocation = null
          this.ensureLocation()
        }
      }
    })
  },

  /**
   * 附近便利店买纸：优先已选公厕关联的便利店，否则取最近的公厕
   */
  buyPaper() {
    let target = this.data.selectedToilet
    const loc = app.globalData.userLocation
    if (!target && this.data.toilets.length && loc) {
      target = this.data.toilets
        .map((t) => ({
          ...t,
          _dist: util.getDistance(loc.latitude, loc.longitude, t.latitude, t.longitude)
        }))
        .sort((a, b) => a._dist - b._dist)[0]
    }
    const store = target && target.nearStore
    if (!store) {
      wx.showModal({
        title: '附近便利店',
        content: '暂未收录这附近的便利店信息，可在微信「搜一搜」或外卖 App 搜索「便利店」应急购买纸巾～',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    wx.showModal({
      title: '附近便利店',
      content: (store.name || '附近便利店') + (store.distanceText ? ' · 距你约' + store.distanceText : '') + '，需要导航过去买纸吗？',
      confirmText: '去导航',
      cancelText: '再想想',
      success: (res) => {
        if (res.confirm) {
          wx.openLocation({
            latitude: store.latitude,
            longitude: store.longitude,
            name: store.name,
            address: store.address || '',
            scale: 17,
            fail: () => wx.showToast({ title: '打开地图失败', icon: 'none' })
          })
        }
      }
    })
  }
})