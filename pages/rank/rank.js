// pages/rank/rank.js - 公厕排行榜（全网人气 + 全国综合）
// 数据来源：云函数 getToiletRank
Page({
  data: {
    tab: 'hot', // hot=全网人气榜 / nation=全国综合榜
    hot: [],
    nation: [],
    display: [], // 当前 tab 展示列表
    top: [], // 领奖台前 3 名
    rest: [], // 其余列表
    rankOffset: 1, // 列表起始名次
    loading: true,
    error: '',
    popup: null // 底部详情弹窗数据
  },

  onLoad() {
    this.loadRank()
  },

  onPullDownRefresh() {
    this.loadRank(() => wx.stopPullDownRefresh())
  },

  /**
   * 拉取排行榜数据
   */
  loadRank(done) {
    this.setData({ loading: true, error: '' })
    wx.cloud
      .callFunction({ name: 'getToiletRank', data: { limit: 100 } })
      .then((res) => {
        const r = res.result || {}
        if (r.code === 0) {
          this.setData({
            hot: r.data.hot || [],
            nation: r.data.nation || [],
            loading: false
          })
          this.applyList()
        } else {
          this.setData({ error: r.msg || '获取失败', loading: false })
        }
      })
      .catch((err) => {
        console.error('[rank] 获取排行榜失败（完整错误）', err)
        this.setData({ error: '网络开小差了，下拉刷新再试', loading: false })
      })
      .finally(() => done && done())
  },

  /**
   * 根据当前 tab 组装展示列表与领奖台
   */
  applyList() {
    const src = this.data[this.data.tab] || []
    const hasPodium = src.length >= 3
    this.setData({
      display: src,
      top: hasPodium ? src.slice(0, 3) : [],
      rest: hasPodium ? src.slice(3) : src,
      rankOffset: hasPodium ? 4 : 1
    })
  },

  /**
   * 切换榜单
   */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.tab) return
    this.setData({ tab, popup: null })
    this.applyList()
  },

  /**
   * 点击榜单项：打开底部详情弹窗
   */
  openPopup(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.display[index]
    if (!item) return
    this.setData({ popup: item })
  },

  closePopup() {
    this.setData({ popup: null })
  },

  noop() {},

  /**
   * 一键前往：拉起微信地图定位
   */
  goNavigate() {
    const item = this.data.popup
    if (!item) return
    if (!item.lat || !item.lng) {
      wx.showToast({ title: '该点位暂不支持定位', icon: 'none' })
      return
    }
    wx.openLocation({
      latitude: Number(item.lat),
      longitude: Number(item.lng),
      name: item.name,
      address: item.address || item.city || '',
      scale: 16,
      fail: (err) => {
        console.error('[rank] 打开地图失败（完整错误）', err)
        wx.showToast({ title: '打开地图失败，请重试', icon: 'none' })
      }
    })
  }
})