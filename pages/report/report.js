// pages/report/report.js - 上报厕所页
// 提交流程：表单校验 → 上传现场照片到云存储 → 调用 submitReport 云函数写入 toiletAll
// 上报点位 auditStatus=pending，需管理员审核通过后才对外展示；上报不消耗查询次数
// 进入页面自动定位：wx.getLocation 获取当前位置，腾讯逆地址解析尽力补全地址（失败仅填坐标，可手动选择）

// 腾讯地图 WebService Key（逆地址解析用；apis.map.qq.com 已在 request 合法域名白名单）
// 高德地图 WebService Key（逆地址解析降级备用；restapi.amap.com 已在 request 合法域名白名单）
const { QQ_MAP_KEY, AMAP_KEY } = require('../../config/keys.js')
const { ensurePrivacyAuthorize } = require('../../utils/privacy.js')
Page({
  data: {
    // 表单数据
    name: '',
    address: '',
    isPublic: true,
    // 位置（由 wx.chooseLocation 选择）
    location: null,
    // 设施标签开关（与 toiletAll 字段一一对应）
    tags: {
      hasPaper: false,
      isBarrierFree: false,
      hasBabyRoom: false,
      isOpen24h: false,
      // 其他：用户自行填写，文案存 otherTagText
      other: false
    },
    // 设施标签「其他」自定义文案
    otherTagText: '',
    // 收费情况：free 免费 / paid 收费 / other 其他（自定义）
    feeType: 'free',
    feeDesc: '',
    // 坑位类型：squat 蹲便 / sitting 坐便 / both 都有 / other 其他（自行填写）
    seatType: '',
    seatTypeOther: '',
    // 体验评分（1-5 星，0 表示未选）：hygiene 卫生 / comfort 如厕体验 / air 空气质量
    scores: { hygiene: 0, comfort: 0, air: 0 },
    totalScore: 0,
    // 附加设施：洗手液 / 烘手器 / 空调
    facilities: { hasSoap: false, hasDryer: false, hasAC: false },
    // 本地待上传照片
    photos: [],
    // 想对大家说的话（选填），随厕所一起展示给其他用户
    note: '',
    submitting: false,
    // 是否已自动定位（区别于手动选点）
    autoLocated: false,
    // 自动定位展示文案（坐标，地址解析成功后被地址覆盖）
    locText: ''
  },

  onLoad() {
    // 进入页面自动定位并填入当前位置（失败不阻塞，仍可手动在地图上选择）
    this.autoFillLocation()
  },

  /**
   * 自动定位：wx.getLocation 获取当前位置坐标，并尽力逆地址解析补全地址
   * 隐私兼容：未同意隐私协议前不调用 getLocation，保持可手动在地图上选择
   */
  autoFillLocation() {
    if (this.data.location) return
    ensurePrivacyAuthorize()
      .then(() => {
        wx.getLocation({
          type: 'gcj02',
          success: (res) => {
            const lat = res.latitude
            const lng = res.longitude
            const location = { latitude: lat, longitude: lng, address: '' }
            const locText = '已自动定位（' + lat.toFixed(4) + ', ' + lng.toFixed(4) + '），可点上方按钮微调'
            this.setData({ location, autoLocated: true, locText, address: '' })
            console.log('[report] 已自动定位', lat, lng)
            // 尽力反向地理编码补全详细地址（失败静默，仅保留坐标）
            this.reverseGeocode(lat, lng)
          },
          fail: (err) => {
            console.warn('[report] 自动定位失败（可手动在地图上选择位置）', err)
            this.setData({ autoLocated: false, locText: '' })
            // 用户拒绝授权时引导去设置
            if (err.errMsg && err.errMsg.indexOf('auth') > -1) {
              wx.showModal({
                title: '需要定位权限',
                content: '开启定位后会自动填入当前位置，也可以手动在地图上选择',
                confirmText: '去设置',
                success: (res) => {
                  if (res.confirm) wx.openSetting()
                }
              })
            }
          }
        })
      })
      .catch(() => {
        // 未同意隐私协议：不阻塞页面，仍可手动在地图上选择位置
        console.warn('[report] 未同意隐私协议，跳过自动定位（可手动选择位置）')
        this.setData({ autoLocated: false, locText: '' })
      })
  },

  /**
   * 逆地址解析：腾讯优先，失败/配额耗尽自动降级高德 regeo，尽力拿到「城市+街道」地址
   * 名称自动填入依赖这里成功拿到地址；两个源都失败时仅保留坐标（仍可手动选择位置）
   */
  reverseGeocode(latitude, longitude) {
    const done = (address) => {
      this.setData({ 'location.address': address, address, locText: '' })
      this.autoFillName(address)
      console.log('[report] 逆地址解析成功', address)
    }
    wx.request({
      url: 'https://apis.map.qq.com/ws/geocoder/v1/',
      data: { location: latitude + ',' + longitude, key: QQ_MAP_KEY, get_poi: 0 },
      timeout: 8000,
      success: (res) => {
        const r = res.data || {}
        if (r.status === 0 && r.result && r.result.address) {
          done(r.result.address)
        } else {
          // 腾讯 key 配额耗尽（status=121）等异常：降级高德，保证名称仍能自动生成
          console.warn('[report] 腾讯逆地址解析异常，降级高德', r.status, r.message)
          this.reverseGeocodeAmap(latitude, longitude, done)
        }
      },
      fail: (err) => {
        console.warn('[report] 腾讯逆地址解析失败，降级高德（完整错误）', err)
        this.reverseGeocodeAmap(latitude, longitude, done)
      }
    })
  },

  /**
   * 高德逆地理编码备用（restapi.amap.com 已在 request 合法域名白名单）
   * 返回 formatted_address，如「广东省湛江市吴川市沿塘路36号」
   */
  reverseGeocodeAmap(latitude, longitude, done) {
    wx.request({
      url: 'https://restapi.amap.com/v3/geocode/regeo',
      data: { location: longitude + ',' + latitude, key: AMAP_KEY, extensions: 'base' },
      timeout: 8000,
      success: (res) => {
        const r = res.data || {}
        if (r.status === '1' && r.regeocode && r.regeocode.formatted_address) {
          done(r.regeocode.formatted_address)
        } else {
          console.warn('[report] 高德逆地址解析失败（保留坐标）', r.status, r.info)
        }
      },
      fail: (err) => {
        console.warn('[report] 高德逆地址解析失败（保留坐标，完整错误）', err)
      }
    })
  },

  // 返回主页（tabBar 页使用 switchTab）
  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  /**
   * 自动补全厕所名称：名称为空时，用地址生成「城市+地点+厕所」
   * 名称已手动填写时跳过，绝不覆盖用户输入；去掉省级前缀保留城市名，总长度不超 30 字
   */
  autoFillName(address) {
    if (this.data.name && this.data.name.trim()) return
    const base = (address || '').trim()
    if (!base) return
    // 去掉结尾已有的“公厕/厕所”，避免“XXX公厕厕所”这种重复
    let cleaned = base.replace(/(公厕|厕所)$/, '').trim()
    // 去掉省级前缀（如“广东省”），保留「市/县/区 + 街道」，更贴近“吴川市××路厕所”
    const prov = cleaned.match(/^[\u4e00-\u9fa5]{1,10}?(省|自治区|特别行政区)/)
    if (prov) cleaned = cleaned.slice(prov[0].length).trim()
    // 取开头 28 字（保留城市名，避免末尾截断把“吴川市”裁掉），总长度不超 30 字
    const short = cleaned.length > 28 ? cleaned.slice(0, 28) : cleaned
    this.setData({ name: (short + '厕所').slice(0, 30) })
  },

  onAddressInput(e) {
    this.setData({ address: e.detail.value })
    // 名称仍为空时，自动同步为「地址+厕所」（如逆地址解析失败、用户手动补填地址的情况）
    this.autoFillName(e.detail.value)
  },


  /**
   * 是否对外开放：true 对外开放 / false 不对公众开放
   */
  selectIsPublic(e) {
    this.setData({ isPublic: Number(e.currentTarget.dataset.public) === 1 })
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
          address: res.address || res.name || '',
          autoLocated: false,
          locText: ''
        })
        this.autoFillName(this.data.address)
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
   * 选择坑位类型（蹲便 / 坐便 / 都有）
   */
  selectSeat(e) {
    this.setData({ seatType: e.currentTarget.dataset.seat })
  },

  // 坑位类型为「其他」时的自定义说明
  onSeatTypeOtherInput(e) {
    this.setData({ seatTypeOther: e.detail.value })
  },

  /**
   * 切换附加设施（洗手液 / 烘手器 / 空调）
   */
  toggleFacility(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ ['facilities.' + key]: !this.data.facilities[key] })
  },

  // 设施标签「其他」自定义说明
  onOtherTagInput(e) {
    this.setData({ otherTagText: e.detail.value })
  },

  // 想对大家说的话（选填）
  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  /**
   * 点击星级评分，并自动计算综合评分（已选分项的平均值）
   */
  onScoreTap(e) {
    const key = e.currentTarget.dataset.key
    const score = Number(e.currentTarget.dataset.score)
    this.setData({ ['scores.' + key]: score }, () => this.calcTotalScore())
  },

  /**
   * 综合评分 = 已选分项平均值，四舍五入为 1-5 整数
   */
  calcTotalScore() {
    const { hygiene, comfort, air } = this.data.scores
    const picked = [hygiene, comfort, air].filter((s) => s > 0)
    const total = picked.length ? Math.round(picked.reduce((a, b) => a + b, 0) / picked.length) : 0
    this.setData({ totalScore: total })
  },

  /**
   * 选择现场照片（相册/拍照）：仅允许 1 张，选中后立即压缩，减小云存储占用
   */
  choosePhotos() {
    if (this.data.photos.length >= 1) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const filePath = res.tempFiles[0] && res.tempFiles[0].tempFilePath
        if (!filePath) return
        wx.showLoading({ title: '处理照片中', mask: true })
        this.compressImage(filePath)
          .then((compressed) => {
            console.log('[report] 照片压缩完成', filePath, '->', compressed)
            this.setData({ photos: [compressed] })
          })
          .catch(() => {
            // 压缩失败兜底：使用原图，不阻塞选择
            this.setData({ photos: [filePath] })
          })
          .finally(() => wx.hideLoading())
      }
    })
  },

  /**
   * 图片压缩：等比缩到最长边 1280px、质量 60（尽量让上传图片存储数据小）
   * wx.compressImage 失败时回退使用原图路径
   */
  compressImage(filePath) {
    return new Promise((resolve) => {
      if (!wx.compressImage) {
        resolve(filePath)
        return
      }
      wx.compressImage({
        src: filePath,
        compressedWidth: 1280,
        quality: 60,
        success: (res) => resolve(res.tempFilePath || filePath),
        fail: (err) => {
          console.warn('[report] 图片压缩失败，使用原图', err)
          resolve(filePath)
        }
      })
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
    // 【个人主体审核】上报公厕功能已停用（入口已隐藏），禁止调用 submitReport / 云存储上传
    wx.showToast({ title: '上报功能暂未开放', icon: 'none' })
    return
    if (this.data.submitting) return
    // 兜底：未填名称时用地址自动生成「地址+厕所」
    if (!this.data.name.trim() && this.data.address.trim()) {
      this.autoFillName(this.data.address)
    }
    const { name, address, location, isPublic, tags, feeType, feeDesc, seatType, seatTypeOther, scores, facilities, otherTagText, note } = this.data

    // 表单校验
    if (!name.trim()) {
      wx.showToast({ title: '请填写厕所名称', icon: 'none' })
      return
    }
    if (!location) {
      wx.showToast({ title: '请在地图上选择位置', icon: 'none' })
      return
    }

    if (seatType === 'other' && !seatTypeOther.trim()) {
      wx.showToast({ title: '请填写坑位类型说明', icon: 'none' })
      return
    }
    if (tags.other && !otherTagText.trim()) {
      wx.showToast({ title: '请填写设施说明', icon: 'none' })
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
          isPublic,
          hasPaper: tags.hasPaper,
          isCharge,
          isBarrierFree: tags.isBarrierFree,
          hasBabyRoom: tags.hasBabyRoom,
          isOpen24h: tags.isOpen24h,
          feeType,
          feeDesc: feeType === 'other' ? feeDesc.trim() : '',
          seatType,
          seatTypeOther: seatType === 'other' ? seatTypeOther.trim() : '',
          otherTagText: tags.other ? otherTagText.trim() : '',
          hygieneScore: scores.hygiene,
          comfortScore: scores.comfort,
          airScore: scores.air,
          totalScore: this.data.totalScore,
          hasSoap: facilities.hasSoap,
          hasDryer: facilities.hasDryer,
          hasAC: facilities.hasAC,
          photoUrls: photoFileIDs,
          note: note.trim()
        }
      })
      const result = res.result || {}
      wx.hideLoading()

      if (result.code === 0) {
        // 成功反馈：清空表单 + toast 提示 + 自动返回主页（延迟跳转，保证用户看到成功提示）
        console.log('[report] 上报成功 id=', result.id, 'msg=', result.msg)
        this.setData({
          name: '',
          address: '',
          isPublic: true,
          location: null,
          tags: { hasPaper: false, isBarrierFree: false, hasBabyRoom: false, isOpen24h: false, other: false },
          otherTagText: '',
          seatTypeOther: '',
          feeType: 'free',
          feeDesc: '',
          seatType: '',
          scores: { hygiene: 0, comfort: 0, air: 0 },
          totalScore: 0,
          facilities: { hasSoap: false, hasDryer: false, hasAC: false },
          photos: [],
          note: '',
          autoLocated: false,
          locText: ''
        })
        wx.showToast({ title: '上报成功，已提交审核', icon: 'success', duration: 2000 })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' })
        }, 1600)
      } else if (result.code === 2) {
        // 延时弹窗：避免 hideLoading 后同帧调用 showModal 在部分版本被吞掉
        setTimeout(() => {
          wx.showModal({
            title: '重复上报',
            content: result.msg || '该位置 50 米内已存在公厕',
            showCancel: false
          })
        }, 80)
      } else {
        setTimeout(() => {
          wx.showModal({
            title: '提交失败',
            content: result.msg || '请稍后重试',
            showCancel: false
          })
        }, 80)
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
