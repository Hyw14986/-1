// pages/reportRank/reportRank.js - 用户上报功德榜（憋神功德无量榜）
// 数据来源：云函数 getReportRank（toiletAll 审核通过的用户上报聚合）
Page({
  data: {
    list: [],
    top: [], // 领奖台前 3 名
    rest: [], // 其余列表
    rankOffset: 1,
    loading: true,
    error: ''
  },

  onLoad() {
    this.loadRank()
  },

  onPullDownRefresh() {
    this.loadRank(() => wx.stopPullDownRefresh())
  },

  /**
   * 拉取功德榜
   */
  loadRank(done) {
    this.setData({ loading: true, error: '' })
    wx.cloud
      .callFunction({ name: 'getReportRank', data: { limit: 50 } })
      .then((res) => {
        const r = res.result || {}
        if (r.code === 0) {
          const list = (r.list || []).map((item) => ({ ...item, title: this.funTitle(item.rank) }))
          const hasPodium = list.length >= 3
          this.setData({
            list,
            top: hasPodium ? list.slice(0, 3) : [],
            rest: hasPodium ? list.slice(3) : list,
            rankOffset: hasPodium ? 4 : 1,
            loading: false
          })
        } else {
          this.setData({ error: r.msg || '获取失败', loading: false })
        }
      })
      .catch((err) => {
        console.error('[reportRank] 获取功德榜失败（完整错误）', err)
        this.setData({ error: '功德榜开小差了，下拉刷新再试', loading: false })
      })
      .finally(() => done && done())
  },

  /**
   * 根据名次颁发搞笑称号
   */
  funTitle(rank) {
    if (rank === 1) return '厕所菩萨'
    if (rank === 2) return '蹲坑大师'
    if (rank === 3) return '如厕引路人'
    if (rank <= 10) return '功德侠客'
    if (rank <= 20) return '潜力蹲神'
    return '厕所旅人'
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  }
})