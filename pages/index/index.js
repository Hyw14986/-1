// pages/index/index.js - 附近厕所主页面
// 核心交互：选择半径 → 点击【开始寻找】→ 消耗 1 次查询次数 → 渲染红色查询圈 → 加载圈内公厕
// 数据源：toiletAll 自有库（gov/user/tencent 缓存）+ 腾讯 POI 降级补充
const app = getApp()
const util = require('../../utils/util.js')

// 腾讯位置服务配置
const QQ_MAP_KEY = 'GEFBZ-6ZJK3-45U3Q-O4H6X-65A3K-NAFLU'
const QQ_SEARCH_URL = 'https://apis.map.qq.com/ws/place/v1/search'
const SEARCH_KEYWORD = '公共厕所'

// 定位失败兜底中心（广州珠江新城）
const DEFAULT_CENTER = { latitude: 23.12908, longitude: 113.3245 }
const LOCATE_TIMEOUT = 8000
const REQUEST_TIMEOUT = 8000

// 腾讯 POI 当日额度耗尽标记（status=121）
let poiQuotaExhausted = false
let poiQuotaExhaustedDate = ''

// 球面距离（米）
function getDistance(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180
  const R = 6371000
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function isValidCoordinate(latitude, longitude) {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    !isNaN(latitude) && !isNaN(longitude) &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180
  )
}

Page({
  data: {
    // 定位（GCJ-02，地图中心永久锁定用户位置）
    latitude: DEFAULT_CENTER.latitude,
    longitude: DEFAULT_CENTER.longitude,
    locationReady: false,
    loadingDone: false,
    locateTipHidden: false,
    // 查询半径
    radiusOptions: [500, 1000, 2000, 3000],
    radiusIndex: 1,
    selectedRadius: 1000,
    // 查询状态
    searched: false,
    loading: false,
    emptyText: '',
    // 红色查询圈（点击开始寻找后才渲染）
    circles: [],
    // 公厕数据（仅圈内点位）
    allToilets: [],
    toilets: [],
    markers: [],
    totalCount: 0,
    // 今日剩余查询次数
    remaining: 20,
    dailyLimit: 20,
    // 底部列表展开
    showList: false,
    // 顶部筛选（本地过滤，不耗次数）
    filters: { hasPaper: false, barrierFree: false, babyRoom: false, open24h: false },
    // 详情弹窗
    selectedToilet: null,
    comments: [],
    commentScore: 5,
    commentContent: '',
    submittingComment: false,
    favorited: false
  },

  onLoad() {
    // 页面加载：仅定位 + 读取今日剩余次数，不自动查询、无红圈、无 marker
    this.ensureLocation()
    this.fetchQuota()
  },

  onShow() {
    // 使用系统 tabBar（找厕所/我的），无需隐藏
    // 查询记录页「再次查询」：回填该次半径（不自动查询、不扣次数，需点击开始寻找）
    const pendingRadiusIndex = app.globalData.pendingRadiusIndex
    if (typeof pendingRadiusIndex === 'number' && pendingRadiusIndex >= 0 && pendingRadiusIndex < this.data.radiusOptions.length) {
      app.globalData.pendingRadiusIndex = null
      const selectedRadius = this.data.radiusOptions[pendingRadiusIndex]
      this.setData({ radiusIndex: pendingRadiusIndex, selectedRadius })
      wx.showToast({ title: '已回填查询半径：' + selectedRadius + '米，点击开始寻找', icon: 'none' })
    }
    // 我的页面跳转：打开指定公厕详情弹窗
    const pendingToiletId = app.globalData.pendingToiletId
    if (pendingToiletId) {
      app.globalData.pendingToiletId = null
      this.openToiletById(pendingToiletId)
    }
    // 回到页面时刷新剩余次数
    if (this.data.loadingDone) this.fetchQuota()
  },

  /**
   * 获取用户位置（GCJ-02），带超时保护；失败回退默认坐标并显示提示条
   */
  ensureLocation() {
    const self = this
    if (app.globalData.userLocation) {
      const { latitude, longitude } = app.globalData.userLocation
      self.setData({ latitude, longitude, locationReady: true, loadingDone: true })
      console.log('[index] 使用缓存定位', latitude, longitude)
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      console.warn('[index] 定位超时，使用默认坐标')
      wx.showToast({ title: '定位超时，已切换到默认位置', icon: 'none' })
      self.setData({ locationReady: false, loadingDone: true })
    }, LOCATE_TIMEOUT)
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const location = { latitude: res.latitude, longitude: res.longitude }
        app.globalData.userLocation = location
        self.setData({ ...location, locationReady: true, loadingDone: true })
        console.log('[index] 定位成功', location)
      },
      fail: () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        wx.showToast({ title: '定位失败，已切换到默认位置', icon: 'none' })
        self.setData({ locationReady: false, loadingDone: true })
      }
    })
  },

  /**
   * 获取今日剩余查询次数（quotaOperate get，不消耗）
   */
  fetchQuota() {
    wx.cloud.callFunction({
      name: 'quotaOperate',
      data: { action: 'get' }
    }).then((res) => {
      const r = res.result || {}
      if (r.code === 0) {
        this.setData({ remaining: r.remaining, dailyLimit: r.dailyLimit })
        console.log('[index] 今日剩余查询次数', r.remaining, '/', r.dailyLimit)
      }
    }).catch((err) => {
      console.warn('[index] 获取剩余次数失败', err)
    })
  },

  /**
   * 选择查询半径：只更新界面，不自动查询
   */
  onRadiusChange(e) {
    const radiusIndex = Number(e.detail.value)
    const selectedRadius = this.data.radiusOptions[radiusIndex]
    this.setData({ radiusIndex, selectedRadius })
    console.log('[index] 切换查询半径', selectedRadius, '米（未触发查询）')
  },

  /**
   * 点击【开始寻找】：校验并消耗 1 次查询次数 → 渲染红圈 → 加载圈内公厕
   */
  startSearch() {
    const { loading, loadingDone, remaining } = this.data
    if (loading) return
    // 定位未完成前禁止查询；定位失败已回退默认坐标（loadingDone=true）时允许按默认位置查询
    if (!loadingDone) {
      wx.showToast({ title: '定位中，请稍后重试', icon: 'none' })
      this.ensureLocation()
      return
    }
    if (remaining <= 0) {
      wx.showToast({ title: '今日查询次数已用完，每日0点将会重置次数', icon: 'none' })
      return
    }
    this.setData({ loading: true, emptyText: '' })
    // 消耗一次查询次数（云函数内部做每日 0 点重置）
    wx.cloud.callFunction({
      name: 'quotaOperate',
      data: { action: 'consume' }
    }).then((res) => {
      const r = res.result || {}
      if (r.code === 3) {
        // 今日次数已用尽
        this.setData({ loading: false, remaining: 0 })
        wx.showToast({ title: '今日查询次数已用完，每日0点将会重置次数', icon: 'none' })
        return
      }
      if (r.code !== 0) {
        this.setData({ loading: false })
        wx.showToast({ title: r.msg || '查询失败', icon: 'none' })
        return
      }
      this.setData({ remaining: r.remaining })
      this.renderCircle()
      this.loadToiletData()
    }).catch((err) => {
      console.error('[index] 消耗查询次数失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' })
    })
  },

  /**
   * 渲染红色圆形查询圈（圆心固定用户定位）
   */
  renderCircle() {
    const { latitude, longitude, selectedRadius } = this.data
    this.setData({
      searched: true,
      circles: [{
        latitude,
        longitude,
        radius: selectedRadius,
        color: '#FF6B6B',
        fillColor: '#FF6B6B26',
        strokeWidth: 3
      }]
    })
    console.log('[index] 渲染查询圈 radius=', selectedRadius, '圆心=', latitude, longitude)
  },

  /**
   * 加载圈内公厕：优先 toiletAll 自有库；≤2 条时降级调用腾讯 POI 并做球面距离二次过滤
   */
  async loadToiletData() {
    const { latitude, longitude, selectedRadius } = this.data
    try {
      // 1. 自有库 geoNear 查询（失败不阻断，继续腾讯降级）
      let near = []
      try {
        const nearRes = await wx.cloud.callFunction({
          name: 'getNearToilet',
          data: { latitude, longitude, radius: selectedRadius }
        })
        near = (nearRes.result && nearRes.result.list) || []
      } catch (err) {
        console.warn('[index] 自有库查询失败（云函数未部署或 2dsphere 索引缺失），降级腾讯 POI', err)
      }
      console.log('[index] 自有库圈内点位=', near.length)

      let toilets = near.slice()

      // 2. 降级：自有库 ≤2 条时调用腾讯 place/v1/search
      if (near.length <= 2) {
        const poiList = await this.searchTencentPoi(latitude, longitude, selectedRadius)
        console.log('[index] 腾讯返回原始点位=', poiList.length)
        // 球面距离二次过滤：只保留红圈内点位
        const filtered = poiList.filter((p) => getDistance(latitude, longitude, p.lat, p.lng) <= selectedRadius)
        console.log('[index] 球面距离过滤后圈内腾讯点位=', filtered.length)
        if (filtered.length) {
          // 缓存腾讯 POI 到 toiletAll（不阻塞渲染）
          this.saveTencentPois(filtered)
          toilets = toilets.concat(filtered)
        }
      }

      // 3. 圈内点位去重合并（同名 50 米内去重）
      toilets = this.dedupeToilets(toilets)
      this.renderToilets(toilets)

      // 4. 写查询记录（含本次查到数量）
      this.addSearchRecord(toilets.length)
    } catch (err) {
      console.error('[index] 加载公厕失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
    }
  },

  /**
   * 腾讯 POI 周边搜索（仅当 Key 已配置；接口失败只弹 toast，不清空自有库点位）
   */
  searchTencentPoi(latitude, longitude, radius) {
    return new Promise((resolve) => {
      const today = new Date().toDateString()
      if (poiQuotaExhaustedDate !== today) {
        poiQuotaExhausted = false
        poiQuotaExhaustedDate = today
      }
      if (poiQuotaExhausted) {
        console.log('[index] 腾讯 POI 当日额度已用尽，跳过腾讯查询')
        resolve([])
        return
      }
      if (!QQ_MAP_KEY || QQ_MAP_KEY.indexOf('请替换') === 0) {
        console.warn('[index] 未配置 QQ_MAP_KEY，跳过腾讯查询')
        resolve([])
        return
      }
      wx.request({
        url: QQ_SEARCH_URL,
        data: {
          keyword: SEARCH_KEYWORD,
          location: latitude + ',' + longitude,
          radius: radius,
          page_size: 20,
          key: QQ_MAP_KEY
        },
        timeout: REQUEST_TIMEOUT,
        success: (res) => {
          const body = res.data || {}
          if (body.status === 0) {
            const list = Array.isArray(body.data) ? body.data : []
            resolve(list.map((item) => ({
              name: item.title || '公共厕所',
              address: item.address || '',
              lat: item.location && item.location.lat,
              lng: item.location && item.location.lng
            })).filter((p) => isValidCoordinate(p.lat, p.lng)))
            return
          }
          const errCode = body.status
          console.warn('[index] 腾讯 POI 查询失败 errCode=', errCode, 'message=', body.message)
          if (errCode === 111) console.warn('[index] 腾讯Key授权AppID不匹配，请核对小程序AppID')
          if (errCode === 121) {
            poiQuotaExhausted = true
            poiQuotaExhaustedDate = today
            console.warn('[index] 腾讯地图地点搜索当日配额已用尽')
          }
          wx.showToast({ title: '官方公厕查询失败，仅展示自有数据', icon: 'none' })
          resolve([])
        },
        fail: (err) => {
          console.warn('[index] 腾讯 POI 请求失败', err)
          wx.showToast({ title: '官方公厕查询失败，仅展示自有数据', icon: 'none' })
          resolve([])
        }
      })
    })
  },

  /**
   * 异步缓存腾讯圈内 POI 到 toiletAll（saveTencentPoi 云函数内部做 50 米去重）
   */
  saveTencentPois(pois) {
    wx.cloud.callFunction({
      name: 'saveTencentPoi',
      data: { pois }
    }).then((res) => {
      const r = res.result || {}
      console.log('[index] 腾讯 POI 缓存结果 saved=', r.saved, 'skipped=', r.skipped)
    }).catch((err) => {
      console.warn('[index] 腾讯 POI 缓存失败', err)
    })
  },

  /**
   * 圈内点位去重：同名且 50 米内只保留一条
   */
  dedupeToilets(list) {
    const result = []
    for (const item of list) {
      const dup = result.some((t) =>
        t.name === item.name && getDistance(t.lat, t.lng, item.lat, item.lng) <= 50
      )
      if (!dup) result.push(item)
    }
    return result
  },

  /**
   * 渲染圈内 marker（只渲染红圈内的点位；marker id 用数字）
   */
  renderToilets(toilets) {
    const markers = []
    const { latitude, longitude, selectedRadius } = this.data
    toilets.forEach((item, index) => {
      const dist = getDistance(latitude, longitude, item.lat, item.lng)
      if (dist > selectedRadius) {
        console.log('[index] 丢弃圈外点位：', item.name, '距离=', Math.round(dist), '米')
        return
      }
      item.distance = Math.round(dist)
      item.distanceText = util.formatDistance(dist)
      markers.push({
        id: index, // 数字 id
        latitude: item.lat,
        longitude: item.lng,
        width: 34,
        height: 34,
        anchor: { x: 0.5, y: 0.95 },
        callout: {
          content: item.name,
          color: '#2c3e50',
          fontSize: 12,
          borderRadius: 8,
          bgColor: '#ffffff',
          padding: 6,
          display: 'BYCLICK'
        }
      })
    })
    console.log('[index] 渲染 marker 数量=', markers.length, '（圈内=', toilets.length, '）')
    this.setData({ allToilets: toilets, toilets, markers, totalCount: markers.length, loading: false })
  },

  /**
   * 写入查询记录（不阻塞）
   */
  addSearchRecord(searchCount) {
    const { latitude, longitude, selectedRadius } = this.data
    wx.cloud.callFunction({
      name: 'searchRecordOperate',
      data: { action: 'add', searchRadius: selectedRadius, searchCount, userLat: latitude, userLng: longitude }
    }).then((res) => {
      console.log('[index] 查询记录已写入', res.result)
    }).catch((err) => {
      console.warn('[index] 写入查询记录失败', err)
    })
  },

  /**
   * 顶部筛选：仅对已获取圈内数据生效，本地过滤，不消耗查询次数
   */
  toggleFilter(e) {
    const key = e.currentTarget.dataset.key
    const filters = { ...this.data.filters, [key]: !this.data.filters[key] }
    this.setData({ filters })
    this.applyFilter()
  },

  clearFilter() {
    this.setData({ filters: { hasPaper: false, barrierFree: false, babyRoom: false, open24h: false } })
    this.applyFilter()
  },

  applyFilter() {
    const { allToilets, filters } = this.data
    const toilets = allToilets.filter((t) => {
      if (filters.hasPaper && !t.hasPaper) return false
      if (filters.barrierFree && !t.isBarrierFree) return false
      if (filters.babyRoom && !t.hasBabyRoom) return false
      if (filters.open24h && !t.isOpen24h) return false
      return true
    })
    this.renderToilets(toilets)
  },

  // 展开/收起底部列表
  toggleList() {
    this.setData({ showList: !this.data.showList })
  },

  /**
   * 点击 marker：打开详情弹窗（基础信息、标签、平均分、评价列表）
   */
  onMarkerTap(e) {
    const marker = this.data.markers.find((m) => m.id === e.detail.markerId)
    if (!marker) return
    const toilet = this.data.toilets.find(
      (t) => t.lat === marker.latitude && t.lng === marker.longitude
    )
    if (!toilet) return
    this.openDetail(toilet)
  },

  // 列表条目点击：定位到对应公厕并打开详情
  onListItemTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    const toilet = this.data.toilets[index]
    if (toilet) this.openDetail(toilet)
  },

  openDetail(toilet) {
    const distance = util.formatDistance(getDistance(this.data.latitude, this.data.longitude, toilet.lat, toilet.lng))
    this.setData({
      selectedToilet: { ...toilet, distanceText: distance },
      commentScore: 5,
      commentContent: '',
      comments: []
    })
    this.loadComments(toilet._id)
    this.checkFavorited(toilet._id)
  },

  closeDetail() {
    this.setData({ selectedToilet: null })
  },

  /**
   * 根据 id 读取公厕并打开详情弹窗（我的页面跳转用）
   */
  openToiletById(toiletId) {
    if (!toiletId) return
    const db = wx.cloud.database()
    db.collection('toiletAll')
      .doc(toiletId)
      .get()
      .then((res) => {
        const toilet = res.data
        if (toilet && isValidCoordinate(toilet.lat, toilet.lng)) {
          this.openDetail(toilet)
        } else {
          wx.showToast({ title: '未找到该公厕', icon: 'none' })
        }
      })
      .catch((err) => {
        console.warn('[index] 打开公厕失败', err)
        wx.showToast({ title: '未找到该公厕', icon: 'none' })
      })
  },

  // 读取评价列表（走云函数，保证任意用户可见全部评价，不受集合权限限制）
  loadComments(toiletId) {
    if (!toiletId) return
    wx.cloud
      .callFunction({ name: 'getComments', data: { toiletId } })
      .then((res) => {
        const r = res.result || {}
        this.setData({ comments: r.list || [] })
      })
      .catch((err) => {
        console.warn('[index] 读取评价失败', err)
        this.setData({ comments: [] })
      })
  },

  checkFavorited(toiletId) {
    if (!toiletId) return
    wx.cloud.callFunction({ name: 'favoriteOperate', data: { action: 'check', toiletId } }).then((res) => {
      const r = res.result || {}
      this.setData({ favorited: !!r.favorited })
    }).catch(() => {})
  },

  // 一键导航
  navToToilet() {
    const toilet = this.data.selectedToilet
    if (!toilet) return
    wx.openLocation({
      latitude: toilet.lat,
      longitude: toilet.lng,
      name: toilet.name,
      address: toilet.address || '',
      scale: 18,
      fail: () => wx.showToast({ title: '打开地图失败', icon: 'none' })
    })
  },

  // 收藏 / 取消收藏
  toggleFavorite() {
    const toilet = this.data.selectedToilet
    if (!toilet || !toilet._id) {
      wx.showToast({ title: '该点位暂不支持收藏', icon: 'none' })
      return
    }
    const action = this.data.favorited ? 'remove' : 'add'
    wx.cloud.callFunction({ name: 'favoriteOperate', data: { action, toiletId: toilet._id } }).then((res) => {
      const r = res.result || {}
      if (r.code === 0) {
        this.setData({ favorited: action === 'add' })
        wx.showToast({ title: action === 'add' ? '收藏成功' : '已取消收藏', icon: 'none' })
      } else if (r.code !== 2) {
        wx.showToast({ title: r.msg || '操作失败', icon: 'none' })
      }
    }).catch(() => wx.showToast({ title: '网络异常', icon: 'none' }))
  },

  // 评分选择
  onScoreTap(e) {
    this.setData({ commentScore: Number(e.currentTarget.dataset.score) })
  },

  onCommentInput(e) {
    this.setData({ commentContent: e.detail.value })
  },

  // 提交评价
  submitComment() {
    const toilet = this.data.selectedToilet
    const { commentScore, commentContent, submittingComment } = this.data
    if (!toilet || !toilet._id) return
    if (!String(commentContent || '').trim()) {
      wx.showToast({ title: '评价内容不能为空', icon: 'none' })
      return
    }
    if (submittingComment) return
    this.setData({ submittingComment: true })
    wx.cloud.callFunction({
      name: 'submitComment',
      data: { toiletId: toilet._id, score: commentScore, content: commentContent }
    }).then((res) => {
      const r = res.result || {}
      this.setData({ submittingComment: false })
      if (r.code === 0) {
        wx.showToast({ title: '评价成功', icon: 'success' })
        this.closeDetail()
      } else {
        wx.showToast({ title: r.msg || '评价失败', icon: 'none' })
      }
    }).catch((err) => {
      console.error('[index] 提交评价失败', err)
      this.setData({ submittingComment: false })
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
  },

  // 举报
  reportToilet() {
    const toilet = this.data.selectedToilet
    if (!toilet || !toilet._id) {
      wx.showToast({ title: '该点位暂不支持举报', icon: 'none' })
      return
    }
    wx.showModal({
      title: '举报公厕',
      editable: true,
      placeholderText: '请填写举报原因（如位置已失效、信息错误等）',
      success: (res) => {
        if (!res.confirm) return
        const reason = String(res.content || '').trim()
        if (!reason) {
          wx.showToast({ title: '请填写举报原因', icon: 'none' })
          return
        }
        wx.cloud.callFunction({
          name: 'submitReportComplaint',
          data: { toiletId: toilet._id, reason }
        }).then((r) => {
          const result = r.result || {}
          wx.showToast({ title: result.msg || '举报已提交', icon: 'none' })
        }).catch(() => wx.showToast({ title: '网络异常', icon: 'none' }))
      }
    })
  },

  // 阻止详情卡片点击冒泡
  noop() {},

  // 去上报
  goReport() {
    wx.navigateTo({ url: '/pages/report/report' })
  },

  // 我的
  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' })
  },

  // 重新定位
  retryLocation() {
    app.globalData.userLocation = null
    this.ensureLocation()
  },

  // 关闭定位提示条
  closeLocateTip() {
    this.setData({ locateTipHidden: true })
  }
})