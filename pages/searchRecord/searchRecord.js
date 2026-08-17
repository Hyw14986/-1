// pages/searchRecord/searchRecord.js - 查询记录页
// 展示用户每次点击「开始寻找」的历史记录：查询时间（友好格式）、半径、找到厕所数量（0 结果特殊图标）
// 支持：再次查询（确认弹窗提示会消耗次数，回填半径回首页，需再点开始寻找）、单条删除、一键清空
const app = getApp()
const util = require('../../utils/util.js')

// 与首页一致的半径选项
const RADIUS_OPTIONS = [500, 1000, 2000, 3000]

Page({
  data: {
    records: [],
    loading: true
  },

  onShow() {
    this.loadRecords()
  },

  /**
   * 读取当前用户全部查询记录（searchRecordOperate list，时间倒序）
   */
  loadRecords() {
    this.setData({ loading: true })
    wx.cloud
      .callFunction({ name: 'searchRecordOperate', data: { action: 'list' } })
      .then((res) => {
        const r = res.result || {}
        const records = (r.list || []).map((item) => ({
          ...item,
          timeText: util.formatFriendlyTime(item.searchTime),
          radiusText: item.searchRadius + '米',
          // 0 结果记录使用不同图标标记
          icon: Number(item.searchCount) > 0 ? '/images/icons/search.svg' : '/images/icons/empty.svg'
        }))
        this.setData({ records, loading: false })
        console.log('[searchRecord] 查询记录条数=', records.length)
      })
      .catch((err) => {
        console.error('[searchRecord] 加载查询记录失败（完整错误）', err)
        this.setData({ loading: false })
        wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
      })
  },

  /**
   * 再次查询：先弹确认弹窗，确认后回填半径返回地图页
   */
  againSearch(e) {
    const radius = Number(e.currentTarget.dataset.radius)
    wx.showModal({
      title: '再次查询',
      content: '将按 ' + radius + ' 米半径再次查询，是否继续？',
      confirmText: '继续',
      cancelText: '取消',
      confirmColor: '#74b9ff',
      success: (res) => {
        if (!res.confirm) return
        const index = RADIUS_OPTIONS.indexOf(radius)
        app.globalData.pendingRadiusIndex = index >= 0 ? index : 1
        wx.switchTab({ url: '/pages/index/index' })
      }
    })
  },

  /**
   * 删除单条记录（确认后调用云函数）
   */
  deleteRecord(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条查询记录吗？',
      confirmColor: '#e05a6d',
      success: (res) => {
        if (!res.confirm) return
        wx.cloud
          .callFunction({ name: 'searchRecordOperate', data: { action: 'delete', id } })
          .then((r) => {
            const result = r.result || {}
            wx.showToast({ title: result.code === 0 ? '已删除' : (result.msg || '删除失败'), icon: 'none' })
            this.loadRecords()
          })
          .catch((err) => {
            console.error('[searchRecord] 删除记录失败（完整错误）', err)
            wx.showToast({ title: '删除失败，请检查网络', icon: 'none' })
          })
      }
    })
  },

  /**
   * 一键清空全部记录（确认后调用云函数）
   */
  clearAll() {
    if (!this.data.records.length) return
    wx.showModal({
      title: '清空记录',
      content: '确定清空全部查询记录吗？此操作不可恢复',
      confirmColor: '#e05a6d',
      success: (res) => {
        if (!res.confirm) return
        wx.cloud
          .callFunction({ name: 'searchRecordOperate', data: { action: 'clear' } })
          .then((r) => {
            const result = r.result || {}
            wx.showToast({ title: result.code === 0 ? '已清空' : (result.msg || '清空失败'), icon: 'none' })
            this.loadRecords()
          })
          .catch((err) => {
            console.error('[searchRecord] 清空记录失败（完整错误）', err)
            wx.showToast({ title: '清空失败，请检查网络', icon: 'none' })
          })
      }
    })
  }
})