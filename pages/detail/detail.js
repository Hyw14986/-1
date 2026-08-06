// pages/detail/detail.js - 厕所详情页：设施信息、导航、评分评价
const app = getApp()
const db = wx.cloud.database()
const util = require('../../utils/util.js')

Page({
  data: {
    toilet: null,
    tags: [],
    distanceText: '',
    comments: [],
    commentRating: 0,
    commentContent: '',
    hasCommented: false,
    myComment: null,
    loading: true,
    submitting: false,
    defaultAvatar: '/images/default-avatar.png'
  },

  onLoad(options) {
    this.toiletId = options.id
    this.initPage()
  },

  /**
   * 初始化：加载公厕信息、评价列表、我的评价状态
   */
  async initPage() {
    await this.loadToilet()
    this.loadComments()
    this.loadMyComment()
  },

  /**
   * 加载公厕详情
   */
  async loadToilet() {
    wx.showLoading({ title: '加载中', mask: true })
    try {
      const res = await db.collection('toilet').doc(this.toiletId).get()
      const toilet = res.data
      wx.setNavigationBarTitle({ title: toilet.name || '公厕详情' })
      const loc = app.globalData.userLocation
      let distanceText = ''
      if (loc) {
        const meters = util.getDistance(loc.latitude, loc.longitude, toilet.latitude, toilet.longitude)
        distanceText = util.formatDistance(meters)
      }
      this.setData({
        toilet,
        tags: util.getFacilityTags(toilet),
        distanceText,
        loading: false
      })
    } catch (err) {
      console.error('加载公厕详情失败', err)
      wx.showToast({ title: '公厕不存在或已被删除', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    } finally {
      wx.hideLoading()
    }
  },

  /**
   * 加载评价列表（按时间倒序）
   */
  async loadComments() {
    try {
      const res = await db
        .collection('comment')
        .where({ toiletId: this.toiletId })
        .orderBy('createTime', 'desc')
        .limit(20)
        .get()
      const comments = res.data.map((item) => ({
        ...item,
        timeText: util.formatTime(item.createTime)
      }))
      this.setData({ comments })
    } catch (err) {
      console.error('加载评价失败', err)
    }
  },

  /**
   * 查询当前用户是否已评价过该厕所
   * 通过 getOpenId 云函数获取 openid，再按 _openid 查询
   */
  async loadMyComment() {
    try {
      const openid = await this.getOpenId()
      const res = await db
        .collection('comment')
        .where({ toiletId: this.toiletId, _openid: openid })
        .limit(1)
        .get()
      if (res.data.length) {
        this.setData({ hasCommented: true, myComment: res.data[0] })
      }
    } catch (err) {
      console.error('查询我的评价失败', err)
    }
  },

  /**
   * 获取当前用户 openid（带缓存）
   */
  getOpenId() {
    return new Promise((resolve, reject) => {
      if (app.globalData.openid) {
        resolve(app.globalData.openid)
        return
      }
      wx.cloud
        .callFunction({ name: 'getOpenId' })
        .then((res) => {
          const openid = res.result && res.result.openid
          if (openid) {
            app.globalData.openid = openid
            resolve(openid)
          } else {
            reject(new Error('获取 openid 失败'))
          }
        })
        .catch(reject)
    })
  },

  // 导航去该厕所
  navToToilet() {
    const toilet = this.data.toilet
    if (!toilet) return
    wx.openLocation({
      latitude: toilet.latitude,
      longitude: toilet.longitude,
      name: toilet.name,
      address: toilet.address || '',
      scale: 18
    })
  },

  // 预览现场照片
  previewPhoto(e) {
    const src = e.currentTarget.dataset.src
    wx.previewImage({ current: src, urls: this.data.toilet.photos })
  },

  // 打分变化
  onStarChange(e) {
    this.setData({ commentRating: e.detail.value })
  },

  // 评价内容输入
  onContentInput(e) {
    this.setData({ commentContent: e.detail.value })
  },

  /**
   * 提交评价：调用 submitComment 云函数
   * 云函数内校验：同一 openid + 同一 toiletId 只能评价一次
   */
  async submitComment() {
    if (this.data.submitting) return
    const rating = this.data.commentRating
    if (!rating || rating < 1) {
      wx.showToast({ title: '请先给厕所打分', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'submitComment',
        data: {
          toiletId: this.toiletId,
          rating,
          content: this.data.commentContent
        }
      })
      const result = res.result || {}
      if (result.code === 0) {
        wx.showToast({ title: '评价成功，感谢分享', icon: 'success' })
        this.setData({ hasCommented: true, commentContent: '', commentRating: 0 })
        this.loadComments()
        this.loadToilet()
      } else if (result.code === 2) {
        // 已评价过，刷新我的评价状态
        this.setData({ hasCommented: true })
        this.loadMyComment()
        wx.showToast({ title: result.msg || '你已评价过该厕所', icon: 'none' })
      } else {
        wx.showToast({ title: result.msg || '提交失败，请重试', icon: 'none' })
      }
    } catch (err) {
      console.error('提交评价失败', err)
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
