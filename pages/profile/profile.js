// pages/profile/profile.js - 我的页面：头像昵称授权、我的上报、我的评价
const app = getApp()
const db = wx.cloud.database()
const util = require('../../utils/util.js')

Page({
  data: {
    // 用户资料
    nickname: '',
    nicknameInput: '',
    avatarUrl: '',
    // 本地待上传的头像
    avatarTempPath: '',
    // 我的上报
    myToilets: [],
    // 我的评价
    myComments: [],
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
   * 初始化：获取 openid、加载资料与数据
   */
  async initPage() {
    try {
      const openid = await util.getOpenId()
      this.openid = openid
      await this.loadUser()
      this.loadMyToilets()
      this.loadMyComments()
    } catch (err) {
      console.error('初始化我的页面失败', err)
      this.setData({ loading: false })
    }
  },

  /**
   * 开发工具：一键导入演示数据（调用 initData 云函数）
   */
  initDemoData() {
    wx.showLoading({ title: '导入中', mask: true })
    wx.cloud
      .callFunction({ name: 'initData' })
      .then((res) => {
        wx.hideLoading()
        const r = res.result || {}
        if (r.code === 0) {
          wx.showModal({
            title: '导入成功',
            content: '已导入 ' + r.inserted + ' 个演示公厕，返回首页即可在地图上查看。',
            showCancel: false
          })
        } else if (r.code === 3) {
          wx.showModal({
            title: '数据已更新',
            content: '已为 ' + r.patched + ' 个公厕补齐蹲位状态与附近便利店信息，重新编译即可体验新功能。',
            showCancel: false
          })
        } else if (r.code === 2) {
          wx.showModal({
            title: '已存在演示数据',
            content: '数据库已有 ' + r.existed + ' 条演示数据，无需重复导入。',
            showCancel: false
          })
        } else {
          wx.showModal({ title: '导入结果', content: r.msg || '未知结果', showCancel: false })
        }
      })
      .catch((err) => {
        wx.hideLoading()
        const msg = (err && (err.errMsg || err.message || '')) || ''
        const notDeployed =
          msg.indexOf('FunctionName') > -1 ||
          msg.indexOf('not found') > -1 ||
          msg.indexOf('-501000') > -1 ||
          msg.indexOf('function not exists') > -1
        wx.showModal({
          title: '导入失败',
          content: notDeployed
            ? '云函数 initData 尚未部署：请在开发者工具中右键 cloudfunctions/initData 文件夹 → 上传并部署：云端安装依赖，然后重试。'
            : '导入失败：' + msg,
          showCancel: false
        })
      })
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
        const cloudPath =
          'avatars/' + this.openid + '-' + Date.now() + '.' + ext
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
   * 加载我的上报（按时间倒序）
   */
  async loadMyToilets() {
    try {
      const res = await db
        .collection('toilet')
        .where({ _openid: this.openid })
        .orderBy('createTime', 'desc')
        .limit(20)
        .get()
      const myToilets = res.data.map((item) => ({
        ...item,
        timeText: util.formatTime(item.createTime)
      }))
      this.setData({ myToilets })
    } catch (err) {
      console.error('加载我的上报失败', err)
    }
  },

  /**
   * 加载我的评价（按时间倒序，并补充公厕名称）
   */
  async loadMyComments() {
    try {
      const res = await db
        .collection('comment')
        .where({ _openid: this.openid })
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
          .collection('toilet')
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

  // 跳转到公厕详情
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id })
  }
})
