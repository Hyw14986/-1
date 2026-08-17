// custom-tab-bar/index.js - 自定义底部 tab 栏（找厕所 / 中间上报加号 / 我的）
// 业务：两个 tab 走 switchTab；中间加号跳转上报页（与首页原 goReport 一致），不占查询次数
Component({
  data: {
    selected: 0
  },
  methods: {
    switchToIndex() {
      wx.switchTab({ url: '/pages/index/index' })
    },
    switchToProfile() {
      wx.switchTab({ url: '/pages/profile/profile' })
    },
    goReport() {
      // UGC 上报功能已按个人主体审核要求停用（入口已隐藏）
      wx.showToast({ title: '上报功能暂未开放', icon: 'none' })
    }
  }
})