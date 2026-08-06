// pages/list/list.js - 厕所列表页：按距离由近到远展示全部公厕
const app = getApp()
const db = wx.cloud.database()
const util = require('../../utils/util.js')

const DEFAULT_CENTER = { latitude: 23.12908, longitude: 113.3245 }

Page({
  data: {
    toilets: [],
    loading: true
  },

  onLoad() {
    this.initPage()
  },

  /**
   * 初始化：确保有定位信息，然后加载列表
   */
  async initPage() {
    await this.ensureLocation()
    this.loadToilets()
  },

  onPullDownRefresh() {
    this.loadToilets().finally(() => wx.stopPullDownRefresh())
  },

  /**
   * 获取定位（优先使用缓存）
   */
  ensureLocation() {
    return new Promise((resolve) => {
      if (app.globalData.userLocation) {
        resolve(true)
        return
      }
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          app.globalData.userLocation = { latitude: res.latitude, longitude: res.longitude }
          resolve(true)
        },
        fail: () => {
          // 定位失败：以演示数据城市中心兜底，仅影响距离展示
          app.globalData.userLocation = DEFAULT_CENTER
          resolve(false)
        }
      })
    })
  },

  /**
   * 加载公厕列表：计算距离并按由近到远排序
   */
  async loadToilets() {
    this.setData({ loading: true })
    try {
      const res = await db.collection('toilet').where({ status: 1 }).limit(20).get()
      const loc = app.globalData.userLocation
      const toilets = res.data
        .map((item) => {
          const meters = util.getDistance(loc.latitude, loc.longitude, item.latitude, item.longitude)
          return {
            ...item,
            distanceMeters: meters,
            distanceText: util.formatDistance(meters),
            tags: util.getFacilityTags(item)
          }
        })
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
      this.setData({ toilets })
    } catch (err) {
      console.error('加载公厕列表失败', err)
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 跳转公厕详情
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id })
  },

  // 回到地图视图
  goMap() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
