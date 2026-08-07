// app.js
// 去哪儿拉 - 便民找厕所小程序
// 微信云开发入口：初始化云环境、全局状态

App({
  onLaunch() {
    // 基础库需 >= 2.2.3 才支持云开发
    if (!wx.cloud) {
      console.error('当前微信基础库版本过低，请使用 2.2.3 或以上版本以使用云能力')
      return
    }
    // 初始化云开发环境（环境 ID 见 README 说明）
    wx.cloud.init({
      env: 'cloudbase-d7gjo6cw585f5db63',
      traceUser: true
    })
  },
  globalData: {
    // 用户当前定位（gcj02 坐标系），供各页面共享
    userLocation: null,
    // 当前用户 openid（由 getOpenId 云函数获取）
    openid: '',
    // 查询记录页「再次查询」回填的半径下标（首页 onShow 读取后清空）
    pendingRadiusIndex: null,
    // 我的页面跳转指定公厕 id（首页 onShow 读取后打开详情弹窗）
    pendingToiletId: null
  }
})
