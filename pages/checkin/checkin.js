// pages/checkin/checkin.js
// 纯本地工具：厕所打卡，记录累计次数、连续天数和最近 7 天
// 不联网、不写数据库、无 UGC，符合个人主体小程序审核要求
const KEY = 'toilet_checkin_v1'

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function formatDate(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
}

function getYesterday(date) {
  const d = new Date(date.getTime())
  d.setDate(d.getDate() - 1)
  return formatDate(d)
}

Page({
  data: {
    todayLabel: '',
    today: '',
    todayChecked: false,
    totalCount: 0,
    streak: 0,
    recentDates: []
  },

  onLoad() {
    this.initPage()
  },

  onShow() {
    this.initPage()
  },

  initPage() {
    const now = new Date()
    const today = formatDate(now)
    const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()]
    const todayLabel = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 星期' + week

    const stored = wx.getStorageSync(KEY) || {}
    const lastDate = stored.lastDate || ''
    const yesterday = getYesterday(now)

    let streak = stored.streak || 0
    if (lastDate !== today && lastDate !== yesterday) {
      streak = 0
    }

    this.setData({
      todayLabel,
      today,
      todayChecked: lastDate === today,
      totalCount: stored.totalCount || 0,
      streak,
      recentDates: stored.recentDates || []
    })
  },

  checkin() {
    const now = new Date()
    const today = formatDate(now)
    const stored = wx.getStorageSync(KEY) || {}

    if (stored.lastDate === today) {
      wx.showToast({ title: '今天已经打过卡啦', icon: 'none' })
      return
    }

    const yesterday = getYesterday(now)
    let streak = 1
    if (stored.lastDate === yesterday) {
      streak = (stored.streak || 0) + 1
    }

    const totalCount = (stored.totalCount || 0) + 1
    const recentDates = stored.recentDates || []
    recentDates.unshift(today)
    const uniqueDates = []
    recentDates.forEach((item) => {
      if (uniqueDates.indexOf(item) === -1 && uniqueDates.length < 7) {
        uniqueDates.push(item)
      }
    })

    const next = {
      lastDate: today,
      totalCount,
      streak,
      recentDates: uniqueDates
    }

    wx.setStorageSync(KEY, next)
    wx.vibrateShort({ type: 'medium', fail: () => {} })

    this.setData({
      todayChecked: true,
      totalCount,
      streak,
      recentDates: uniqueDates
    })

    wx.showToast({ title: '打卡成功', icon: 'success' })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})