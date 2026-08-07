// pages/report/report.js - 上报厕所页
// 提交流程：表单校验 → 上传现场照片到云存储 → 调用 submitReport 云函数写入 toiletAll
// 上报点位 auditStatus=pending，需管理员审核通过后才对外展示；上报不消耗查询次数
Page({
  data: {
    // 表单数据
    name: '',
    address: '',
    openTime: '',
    // 位置（由 wx.chooseLocation 选择）
    location: null,
    // 设施标签开关（与 toiletAll 字段一一对应）
    tags: {
      hasPaper: false,
      isBarrierFree: false,
      hasBabyRoom: false,
      isOpen24h: false
    },
    // 收费情况：free 免费 / paid 收费 / other 其他（自定义）
    feeType: 'free',
    feeDesc: '',
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
        console.error('[report] 选择位置失败（完整错误）', err)
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
   * 选择收费情况（免费 / 收费 / 其他）
   */
  selectFee(e) {
    this.setData({ feeType: e.currentTarget.dataset.fee })
  },

  // 收费情况为「其他」时的自定义文案
  onFeeDescInput(e) {
    this.setData({ feeDesc: e.detail.value })
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
   * 校验表单并提交（调用 submitReport 云函数，写库全部在云函数端完成）
   */
  async submit() {
    if (this.data.submitting) return
    const { name, address, location, openTime, tags, feeType, feeDesc } = this.data

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

      // 2. 收费映射：免费=false；收费/其他=true
      const isCharge = feeType === 'paid' || feeType === 'other'

      // 3. 调用云函数提交（云函数端做重复检测并写入 toiletAll）
      const res = await wx.cloud.callFunction({
        name: 'submitReport',
        data: {
          name: name.trim(),
          address: address.trim(),
          lat: location.latitude,
          lng: location.longitude,
          openTime: openTime.trim() || '全天开放',
          hasPaper: tags.hasPaper,
          isCharge,
          isBarrierFree: tags.isBarrierFree,
          hasBabyRoom: tags.hasBabyRoom,
          isOpen24h: tags.isOpen24h,
          feeType,
          feeDesc: feeType === 'other' ? feeDesc.trim() : '',
          photoUrls: photoFileIDs
        }
      })
      const result = res.result || {}
      wx.hideLoading()

      if (result.code === 0) {
        wx.showModal({
          title: '上报成功',
          content: '已提交审核，审核通过后将在附近厕所地图展示，感谢你的贡献！',
          confirmText: '查看我的上报',
          cancelText: '返回首页',
          success: (modalRes) => {
            if (modalRes.confirm) {
              wx.switchTab({ url: '/pages/profile/profile' })
            } else {
              wx.switchTab({ url: '/pages/index/index' })
            }
          }
        })
      } else if (result.code === 2) {
        wx.showModal({
          title: '重复上报',
          content: result.msg || '该位置 50 米内已存在公厕',
          showCancel: false
        })
      } else {
        wx.showModal({
          title: '提交失败',
          content: result.msg || '请稍后重试',
          showCancel: false
        })
      }
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