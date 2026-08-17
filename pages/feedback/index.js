// pages/feedback/feedback.js - 我要反馈：对公厕信息问题提交反馈
// 提交到云函数 submitFeedback，写入 toilet_feedback 集合（toiletId、type、content、openid、createTime）
// 管理员在云开发控制台查看反馈记录后处理对应公厕问题
Page({
  data: {
    id: '',
    name: '',
    address: '',
    types: ['位置不准确', '厕所已关闭', '设施损坏', '卫生较差', '其他'],
    type: '',
    content: '',
    submitting: false
  },

  onLoad(options) {
    this.setData({
      id: options.id || '',
      name: options.name ? decodeURIComponent(options.name) : '该公厕',
      address: options.address ? decodeURIComponent(options.address) : ''
    })
  },

  selectType(e) {
    this.setData({ type: e.currentTarget.dataset.type })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  async submit() {
    if (this.data.submitting) return
    if (!this.data.id) {
      wx.showToast({ title: '该点位暂不支持反馈', icon: 'none' })
      return
    }
    if (!this.data.type) {
      wx.showToast({ title: '请选择反馈类型', icon: 'none' })
      return
    }
    const content = this.data.content.trim()
    if (!content) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中', mask: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'submitFeedback',
        data: { toiletId: this.data.id, type: this.data.type, content }
      })
      wx.hideLoading()
      const r = res.result || {}
      if (r.code === 0) {
        console.log('[feedback] 反馈提交成功', r.msg)
        wx.showToast({ title: '反馈已提交，感谢您的帮助', icon: 'success', duration: 2000 })
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        wx.showToast({ title: r.msg || '提交失败，请稍后重试', icon: 'none' })
      }
    } catch (err) {
      console.error('[feedback] 提交反馈失败（完整错误）', err)
      wx.hideLoading()
      wx.showToast({ title: '提交失败，请检查网络后重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})