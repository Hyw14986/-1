// pages/devMessage/devMessage.js - 对开发者说悄悄话
// 提交到云函数 submitDevMessage，写入 developer_message 集合（type、content、openid、createTime）
// 管理员在云开发控制台 developer_message 集合查看用户留言
Page({
  data: {
    types: ['夸夸开发者', '功能建议', 'BUG 汇报', '吐槽一下', '其他悄悄话'],
    type: '',
    content: '',
    submitting: false
  },

  selectType(e) {
    this.setData({ type: e.currentTarget.dataset.type })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  async submit() {
    // 【个人主体审核】给开发者留言已停用（入口已隐藏），禁止提交
    wx.showToast({ title: '留言功能暂未开放', icon: 'none' })
    return
    if (this.data.submitting) return
    if (!this.data.type) {
      wx.showToast({ title: '先选一个「你想说什么」吧', icon: 'none' })
      return
    }
    const content = this.data.content.trim()
    if (!content) {
      wx.showToast({ title: '悄悄话还没写呢，别害羞～', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: '送出中', mask: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'submitDevMessage',
        data: { type: this.data.type, content }
      })
      wx.hideLoading()
      const r = res.result || {}
      if (r.code === 0) {
        console.log('[devMessage] 留言送达', r.msg)
        wx.showToast({ title: '已收到！开发者感动哭.jpg', icon: 'success', duration: 2200 })
        setTimeout(() => wx.navigateBack(), 1600)
      } else {
        wx.showToast({ title: r.msg || '发送失败，稍后再试', icon: 'none' })
      }
    } catch (err) {
      console.error('[devMessage] 提交失败（完整错误）', err)
      wx.hideLoading()
      wx.showToast({ title: '网络开小差了，稍后再试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})