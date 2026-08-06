// pages/list/list.js - 厕所列表页：按距离由近到远展示全部公厕
const app = getApp()
const db = wx.cloud.database()
// 数据库查询指令（用于兼容手动导入时缺少 status 字段的数据）
const _ = db.command
const util = require('../../utils/util.js')

const DEFAULT_CENTER = { latitude: 23.12908, longitude: 113.3245 }

Page({
  data: {
    toilets: [],
    loading: true,
    loadError: ''
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
      // 分页拉取全部公厕：列表展示所有点位（小程序端单次查询上限 20 条）
      const loc = app.globalData.userLocation
      const toilets = (await util.fetchAllRecords(
        db.collection('toilet').where(_.or([{ status: 1 }, { status: _.exists(false) }]))
      ))
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
      const msg = (err && (err.errMsg || err.message || '')) || ''
      if (msg.indexOf('collection not exists') > -1 || msg.indexOf('-502005') > -1 || msg.indexOf('DATABASE_COLLECTION_NOT_EXIST') > -1) {
        this.setData({ loadError: '云数据库尚未初始化，请先部署并运行 initData 云函数' })
      } else {
        wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
      }
    } finally {
      this.setData({ loading: false })
    }
  },

  // 跳转公厕详情
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id })
  },

  // 直接导航到指定公厕
  navToToilet(e) {
    const id = e.currentTarget.dataset.id
    const toilet = this.data.toilets.find((t) => t._id === id)
    if (!toilet) return
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

  // 重新加载列表
  reload() {
    this.setData({ loadError: '' })
    this.loadToilets()
  },

  // 悬浮加号：跳转上报页（tabBar 页使用 switchTab）
  goReport() {
    wx.switchTab({ url: '/pages/report/report' })
  },

  // 回到地图视图
  goMap() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
