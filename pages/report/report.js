// pages/report/report.js - 上报厕所页：提交新公厕点位到云数据库
const db = wx.cloud.database()

Page({
  data: {
    // 表单数据
    name: '',
    address: '',
    openTime: '',
    // 位置（由 wx.chooseLocation 选择）
    location: null,
    // 设施标签开关
    tags: {
      hasAccessible: false,
      hasBabyCare: false,
      hasToiletPaper: false,
      isFree: false
    },
    // 本地待上传照片
    photos: [],
    submitting: false
  },

  // 返回主页（tabBar 页使用 switchTab）
  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onAddressInput(e) {
    this.setData({ address: e.detail.value })
  },

  onOpenTimeInput(e) {
    this.setData({ openTime: e.detail.value })
  },

  /**
   * 在地图上选择位置（自动填充地址和经纬度）
   */
  chooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          location: {
            latitude: res.latitude,
            longitude: res.longitude,
            address: res.address || res.name
          },
          address: res.address || res.name || ''
        })
      },
      fail: (err) => {
        // 用户取消不提示；授权失败时引导
        if (err.errMsg && err.errMsg.indexOf('auth') > -1) {
          wx.showModal({
            title: '需要定位权限',
            content: '请在设置中开启位置权限后重试',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) wx.openSetting()
            }
          })
        }
      }
    })
  },

  /**
   * 切换设施标签
   */
  toggleTag(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ ['tags.' + key]: !this.data.tags[key] })
  },

  /**
   * 选择现场照片（相册/拍照）
   */
  choosePhotos() {
    const remain = 3 - this.data.photos.length
    if (remain <= 0) return
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = res.tempFiles.map((f) => f.tempFilePath)
        this.setData({ photos: this.data.photos.concat(paths) })
      }
    })
  },

  // 删除某张照片
  removePhoto(e) {
    const index = e.currentTarget.dataset.index
    const photos = this.data.photos.slice()
    photos.splice(index, 1)
    this.setData({ photos })
  },

  /**
   * 校验表单并提交
   */
  async submit() {
    if (this.data.submitting) return
    const { name, address, location, openTime, tags } = this.data

    // 表单校验
    if (!name.trim()) {
      wx.showToast({ title: '请填写厕所名称', icon: 'none' })
      return
    }
    if (!location) {
      wx.showToast({ title: '请在地图上选择位置', icon: 'none' })
      return
    }
    if (!address.trim()) {
      wx.showToast({ title: '请补充详细地址', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中', mask: true })
    try {
      // 1. 上传照片到云存储
      const photoFileIDs = await this.uploadPhotos()

      // 2. 写入公厕点位到云数据库（自动带上当前用户 _openid）
      const res = await db.collection('toilet').add({
        data: {
          name: name.trim(),
          address: address.trim(),
          latitude: location.latitude,
          longitude: location.longitude,
          openTime: openTime.trim() || '全天开放',
          hasAccessible: tags.hasAccessible,
          hasBabyCare: tags.hasBabyCare,
          hasToiletPaper: tags.hasToiletPaper,
          isFree: tags.isFree,
          photos: photoFileIDs,
          rating: 0,
          ratingCount: 0,
          status: 1, // 1=公开可见（无需审核）
          source: 'user', // 来源：用户上报
          createTime: db.serverDate()
        }
      })

      wx.hideLoading()
      wx.showModal({
        title: '上报成功',
        content: '新的公厕点位已公开，感谢你的贡献！',
        confirmText: '查看详情',
        cancelText: '返回首页',
        success: (modalRes) => {
          if (modalRes.confirm) {
            wx.redirectTo({ url: '/pages/detail/detail?id=' + res._id })
          } else {
            wx.switchTab({ url: '/pages/index/index' })
          }
        }
      })
    } catch (err) {
      console.error('上报失败', err)
      wx.hideLoading()
      wx.showToast({ title: '提交失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  /**
   * 将本地照片上传到云存储，返回 fileID 列表
   */
  async uploadPhotos() {
    const uploads = this.data.photos.map((filePath) => {
      const ext = (filePath.match(/\.(\w+)$/) || [])[1] || 'jpg'
      const cloudPath = 'toilet-photos/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext
      return wx.cloud.uploadFile({ cloudPath, filePath }).then((res) => res.fileID)
    })
    return Promise.all(uploads)
  }
})
