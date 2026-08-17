// pages/profile/profile.js - 我的页面
// 模块：用户资料、查询记录、我上报的厕所（审核状态）、我的评价、我的收藏、关于小程序
// 查询记录/收藏等全部走云函数，前端不直写数据库
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
    // 我的上报
    myToilets: [],
    // 我的评价
    myComments: [],
    // 我的收藏
    favorites: [],
    // 我的打卡
    checkinCount: 0,
    checkinList: [],
    showCheckins: false,
    showMyToilets: false,
    showMyComments: false,
    showFavorites: false,
    loading: true,
    defaultAvatar: '/images/default-avatar.png',
    // 关于/打赏弹窗
    aboutVisible: false,
    rewardVisible: false,
    rewardQr: '/images/reward-qr.jpg',
    rewardQrBroken: false
  },

  onShow() {
    // 自定义 tabBar：同步选中态（我的=1）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    this.initPage()
    this.loadCheckins()
  },

  /**
   * 返回主页（tabBar 页使用 switchTab）
   */
  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  /**
   * 公厕排行榜（全网人气 + 全国综合）
   * 【个人主体审核】纯展示榜单数据，页面无任何提交/上传/评价入口
   */
  goRank() {
    wx.navigateTo({ url: '/pages/rank/rank' })
  },

  /**
   * 厕所打卡（纯本地打卡工具，无网络、无 UGC）
   */
  goCheckin() {
    wx.navigateTo({ url: '/pages/checkin/checkin' })
  },

  /**
   * 给开发者留言（对开发者说悄悄话）
   */
  goDevMessage() {
    // 【个人主体审核】给开发者留言已停用
    return
    wx.navigateTo({ url: '/pages/devMessage/devMessage' })
  },

  /**
   * 初始化：获取 openid、次数配额与各模块数据
   */
  async initPage() {
    try {
      const openid = await util.getOpenId()
      this.openid = openid
      this.loadUser()
      // 【个人主体审核】我的上报/我的评价模块已停用
      // this.loadMyToilets()
      // this.loadMyComments()
      this.loadFavorites()
    } catch (err) {
      console.error('初始化我的页面失败', err)
      this.setData({ loading: false })
    }
  },


  /**
   * 憋神功德无量榜（用户上报排行榜）
   */
  goReportRank() {
    // 【个人主体审核】上报功德榜已停用
    return
    wx.navigateTo({ url: '/pages/reportRank/reportRank' })
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
    // 昵称仅允许中英文与数字，其他字符（空格/符号/emoji）一律拒绝
    if (!/^[\u4e00-\u9fa5A-Za-z0-9]+$/.test(nickname)) {
      wx.showToast({ title: '昵称仅支持中文、英文和数字', icon: 'none' })
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
   * 进入查询记录页
   */
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
        rejectReason: item.rejectReason || '',
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
   * 加载我的打卡（本地缓存，不写云端）
   */
  loadCheckins() {
    try {
      const list = wx.getStorageSync('my_checkins_v1') || []
      const arr = Array.isArray(list) ? list : []
      const normalized = arr.map((item) => Object.assign({}, item, {
        timeText: util.formatTime(item.createTime)
      }))
      this.setData({ checkinList: normalized, checkinCount: normalized.length })
    } catch (err) {
      console.warn('[profile] 加载打卡记录失败（不影响主流程）', err)
    }
  },

  /**
   * 展开/收起 我的上报/我的评价/我的收藏 区块
   */
  toggleSection(e) {
    const key = e.currentTarget.dataset.key
    if (!key || typeof this.data[key] !== 'boolean') return
    this.setData({ [key]: !this.data[key] })
  },

  /**
   * 宫格快捷入口：展开对应区块并滚动定位
   */
  goSection(e) {
    const key = e.currentTarget.dataset.key
    const id = e.currentTarget.dataset.id
    if (key && typeof this.data[key] === 'boolean' && !this.data[key]) {
      this.setData({ [key]: true })
    }
    if (id) {
      wx.pageScrollTo({ selector: '#' + id, duration: 300 })
    }
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

  goSearchRecord() {
    wx.navigateTo({ url: '/pages/searchRecord/searchRecord' })
  },

  /**
   * 关于小程序（趣味版自绘弹窗，纯展示不涉及业务数据）
   */
  showAbout() {
    this.setData({ aboutVisible: true })
  },

  closeAbout() {
    this.setData({ aboutVisible: false })
  },

  /**
   * 打赏支持：展示微信赞赏码（images/reward-qr.jpg，请替换为开发者自己的赞赏码）
   * 说明：无支付资质时不接入 wx.requestPayment，采用「赞赏码」扫码方式，纯展示不产生交易数据
   */
  showReward() {
    // 【个人主体审核】打赏/赞赏码入口已隐藏，避免个人主体支付类功能误判
    return
  },

  closeReward() {
    this.setData({ rewardVisible: false })
  },

  // 弹窗卡片内部点击：阻止冒泡关闭
  noop() {},

  // 赞赏码加载失败：提示替换占位图
  onRewardQrError() {
    this.setData({ rewardQrBroken: true })
    console.warn('[profile] 赞赏码图片加载失败，请检查 images/reward-qr.jpg 是否存在')
  },

  /**
   * 保存赞赏码到相册（getImageInfo 拿到本地可用路径后写入相册）
   * 相册权限被拒时引导去设置开启
   */
  saveRewardQr() {
    if (this.data.rewardQrBroken) {
      wx.showToast({ title: '赞赏码图片未配置，请联系开发者', icon: 'none' })
      return
    }
    wx.getImageInfo({
      src: this.data.rewardQr,
      success: (info) => {
        wx.saveImageToPhotosAlbum({
          filePath: info.path,
          success: () => {
            wx.showToast({ title: '已保存，去微信扫一扫识别吧', icon: 'none' })
          },
          fail: (err) => {
            const msg = (err && err.errMsg) || ''
            if (msg.indexOf('auth deny') >= 0 || msg.indexOf('authorize') >= 0) {
              wx.showModal({
                title: '需要相册权限',
                content: '保存赞赏码需要相册权限，去设置里开启后就能保存啦',
                confirmText: '去设置',
                cancelText: '取消',
                success: (r) => {
                  if (r.confirm) wx.openSetting()
                }
              })
            } else {
              wx.showToast({ title: '保存失败，长按图片也能识别', icon: 'none' })
            }
          }
        })
      },
      fail: () => {
        wx.showToast({ title: '赞赏码加载失败，长按图片试试', icon: 'none' })
      }
    })
  },

  // 更多功能占位：点击提示开发中，后续功能上线后再替换跳转
  comingSoon(e) {
    const name = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.name) || '新功能'
    wx.showToast({ title: name + ' 正在开发中，敬请期待～', icon: 'none' })
  }
})
