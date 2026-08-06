// pages/index/index.js - 首页：地图展示周边公厕
const app = getApp()
const db = wx.cloud.database()
const util = require('../../utils/util.js')

// 演示数据所在城市中心（广州珠江新城），定位失败时的兜底中心点
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
    initError: ''
  },

  onShow() {
    // 每次回到首页都刷新数据（比如刚上报过新公厕）
    this.initPage()
  },

  /**
   * 页面初始化：先定位，再拉取公厕点位
   */
  async initPage() {
    await this.ensureLocation()
    this.loadToilets()
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
          // 未授权或失败：使用演示数据城市作为中心点，并展示引导
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
   * 拉取全部可见公厕并生成地图标记点
   */
  async loadToilets() {
    wx.showLoading({ title: '加载中', mask: true })
    try {
      // 分页拉取全部可见公厕：保证地图上所有点位都打上公厕图标（小程序端单次查询上限 20 条）
      const toilets = await util.fetchAllRecords(db.collection('toilet').where({ status: 1 }))
      const markers = toilets.map((item, index) => ({
        id: index,
        toiletId: item._id,
        latitude: item.latitude,
        longitude: item.longitude,
        iconPath: '/images/marker.png',
        width: 36,
        height: 36,
        anchor: { x: 0.5, y: 0.93 }
      }))
      this.setData({ toilets, markers })
      // 若已有选中的厕所，重新关联
      if (this.data.selectedToilet) {
        const found = toilets.find((t) => t._id === this.data.selectedToilet._id)
        if (found) this.selectToilet(found)
      }
    } catch (err) {
      console.error('加载公厕失败', err)
      if (this.isCollectionMissing(err)) {
        // 云数据库集合未创建：给出初始化引导
        this.setData({ initError: '数据库未初始化' })
        wx.showModal({
          title: '云数据库尚未初始化',
          content: '请先在 cloudfunctions/initData 上右键「上传并部署：云端安装依赖」，再右键「云端测试」运行一次，即可自动创建集合并导入演示公厕。',
          showCancel: false,
          confirmText: '知道了'
        })
      } else {
        wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
      }
    } finally {
      wx.hideLoading()
    }
  },

  /**
   * 判断是否为云数据库集合不存在的错误
   */
  isCollectionMissing(err) {
    const msg = (err && (err.errMsg || err.message || '')) || ''
    return msg.indexOf('collection not exists') > -1 || msg.indexOf('-502005') > -1 || msg.indexOf('DATABASE_COLLECTION_NOT_EXIST') > -1
  },

  // 数据库初始化完成后重新加载
  retryLoad() {
    this.setData({ initError: '' })
    this.loadToilets()
  },

  /**
   * 点击地图标记：弹出厕所简要卡片
   */
  onMarkerTap(e) {
    const marker = this.data.markers.find((m) => m.id === e.detail.markerId)
    if (!marker) return
    const toilet = this.data.toilets.find((t) => t._id === marker.toiletId)
    if (!toilet) return
    this.selectToilet(toilet)
    // 高亮选中的标记点
    const markers = this.data.markers.map((m) =>
      m.toiletId === toilet._id
        ? { ...m, iconPath: '/images/marker-active.png', width: 42, height: 42 }
        : { ...m, iconPath: '/images/marker.png', width: 36, height: 36 }
    )
    this.setData({ markers })
  },

  /**
   * 组装选中公厕的卡片数据（距离、设施标签）
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

  // 查看厕所详情
  goDetail() {
    const toilet = this.data.selectedToilet
    if (!toilet) return
    wx.navigateTo({ url: '/pages/detail/detail?id=' + toilet._id })
  },

  // 调用微信地图导航
  navToToilet() {
    const toilet = this.data.selectedToilet
    if (!toilet) return
    wx.openLocation({
      latitude: toilet.latitude,
      longitude: toilet.longitude,
      name: toilet.name,
      address: toilet.address || '',
      scale: 18
    })
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
  }
})
