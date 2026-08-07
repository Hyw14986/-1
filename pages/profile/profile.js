// pages/profile/profile.js - 我的页面
// 模块：用户资料、今日剩余查询次数、查询记录、我上报的厕所（审核状态）、我的评价、我的收藏、关于小程序
// 次数配额/查询记录/收藏等全部走云函数，前端不直写数据库
const app = getApp()
const db = wx.cloud.database()
const util = require('../../utils/util.js')

Page({
  data: {
    // 用户资料
    nickname: '',
    nicknameInput: '',
    avatarUrl: '',
    avatarTempPath: '',
    // 今日剩余查询次数
    remaining: 20,
    dailyLimit: 20,
    // 我的上报
    myToilets: [],
    // 我的评价
    myComments: [],
    // 我的收藏
    favorites: [],
    loading: true,
    defaultAvatar: '/images/default-avatar.png'
  },

  onShow() {
    this.initPage()
  },

  /**
   * 返回主页（tabBar 页使用 switchTab）
   */
  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  /**
   * 初始化：获取 openid、次数配额与各模块数据
   */
  async initPage() {
    try {
      const openid = await util.getOpenId()
      this.openid = openid
      this.fetchQuota()
      this.loadUser()
      this.loadMyToilets()
      this.loadMyComments()
      this.loadFavorites()
    } catch (err) {
      console.error('初始化我的页面失败', err)
      this.setData({ loading: false })
    }
  },

  /**
   * 今日剩余查询次数（quotaOperate get，不消耗）
   */
  fetchQuota() {
    wx.cloud
      .callFunction({ name: 'quotaOperate', data: { action: 'get' } })
      .then((res) => {
        const r = res.result || {}
        if (r.code === 0) {
          this.setData({ remaining: r.remaining, dailyLimit: r.dailyLimit })
          console.log('[profile] 今日剩余查询次数', r.remaining, '/', r.dailyLimit)
        }
      })
      .catch((err) => console.error('[profile] 获取剩余次数失败（完整错误）', err))
  },

  /**
   * 加载用户资料（头像昵称）
   */
  async loadUser() {
    try {
      const res = await db.collection('user').where({ _openid: this.openid }).limit(1).get()
      if (res.data.length) {
        const user = res.data[0]
        this.setData({
          nickname: user.nickname || '',
          nicknameInput: user.nickname || '',
          avatarUrl: user.avatarUrl || ''
        })
      }
    } catch (err) {
      console.error('加载用户资料失败', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 选择微信头像（新版头像填写能力）
   */
  onChooseAvatar(e) {
    this.setData({ avatarTempPath: e.detail.avatarUrl })
  },

  /**
   * 输入昵称（新版昵称填写能力）
   */
  onNicknameInput(e) {
    this.setData({ nicknameInput: e.detail.value })
  },

  /**
   * 保存资料：上传头像到云存储，昵称头像写入 user 集合
   */
  async saveProfile() {
    const nickname = this.data.nicknameInput.trim()
    if (!nickname) {
      wx.showToast({ title: '请填写昵称', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中', mask: true })
    try {
      // 上传新头像（如有）
      let avatarUrl = this.data.avatarUrl
      if (this.data.avatarTempPath) {
        const ext = (this.data.avatarTempPath.match(/\.(\w+)$/) || [])[1] || 'png'
        const cloudPath = 'avatars/' + this.openid + '-' + Date.now() + '.' + ext
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: this.data.avatarTempPath
        })
        avatarUrl = uploadRes.fileID
      }

      // 查询是否已有资料记录，有则更新、无则新增
      const existed = await db.collection('user').where({ _openid: this.openid }).limit(1).get()
      const data = {
        nickname,
        avatarUrl,
        updateTime: db.serverDate()
      }
      if (existed.data.length) {
        await db.collection('user').doc(existed.data[0]._id).update({ data })
      } else {
        await db.collection('user').add({ data })
      }

      this.setData({
        nickname,
        avatarUrl,
        avatarTempPath: ''
      })
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      console.error('保存资料失败', err)
      wx.hideLoading()
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  /**
   * 审核状态文案
   */
  auditText(status) {
    if (status === 'pass') return '已通过'
    if (status === 'reject') return '已驳回'
    return '待审核'
  },

  /**
   * 加载我的上报（toiletAll 中本人上报，按时间倒序，展示审核状态）
   */
  async loadMyToilets() {
    try {
      const res = await db
        .collection('toiletAll')
        .where({ _openid: this.openid })
        .orderBy('createTime', 'desc')
        .limit(20)
        .get()
      const myToilets = res.data.map((item) => ({
        ...item,
        auditText: this.auditText(item.auditStatus),
        timeText: util.formatTime(item.createTime)
      }))
      this.setData({ myToilets })
    } catch (err) {
      console.error('加载我的上报失败', err)
    }
  },

  /**
   * 加载我的评价（toilet_comment，按时间倒序，并补充公厕名称）
   */
  async loadMyComments() {
    try {
      const res = await db
        .collection('toilet_comment')
        .where({ openid: this.openid })
        .orderBy('createTime', 'desc')
        .limit(20)
        .get()
      const comments = res.data

      // 批量查询关联公厕名称
      const toiletIds = [...new Set(comments.map((c) => c.toiletId))]
      const nameMap = {}
      if (toiletIds.length) {
        const _ = db.command
        const toiletRes = await db
          .collection('toiletAll')
          .where({ _id: _.in(toiletIds) })
          .limit(20)
          .get()
        toiletRes.data.forEach((t) => {
          nameMap[t._id] = t.name
        })
      }

      const myComments = comments.map((item) => ({
        ...item,
        toiletName: nameMap[item.toiletId] || '公厕',
        timeText: util.formatTime(item.createTime)
      }))
      this.setData({ myComments })
    } catch (err) {
      console.error('加载我的评价失败', err)
    }
  },

  /**
   * 加载我的收藏（favoriteOperate list）
   */
  loadFavorites() {
    wx.cloud
      .callFunction({ name: 'favoriteOperate', data: { action: 'list' } })
      .then((res) => {
        const r = res.result || {}
        this.setData({ favorites: r.list || [] })
      })
      .catch((err) => console.error('[profile] 加载收藏失败（完整错误）', err))
  },

  /**
   * 打开公厕详情：回首页并唤起详情弹窗
   */
  openToilet(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    app.globalData.pendingToiletId = id
    wx.switchTab({ url: '/pages/index/index' })
  },

  /**
   * 进入查询记录页
   */
  goSearchRecord() {
    wx.navigateTo({ url: '/pages/searchRecord/searchRecord' })
  },

  /**
   * 关于小程序
   */
  showAbout() {
    wx.showModal({
      title: '关于小程序',
      content:
        '去哪儿拉 - 便民找厕所小程序\n\n数据来源：政府公开导入 + 用户上报 + 腾讯地图周边查询缓存。\n\n每人每日可查询 20 次，每日 0 点自动重置。',
      showCancel: false,
      confirmText: '知道了'
    })
  }
})