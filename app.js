// app.js
// 找厕所不迷路 - 找厕所小程序
// 微信云开发入口：初始化云环境、全局状态
const { ensurePrivacyAuthorize } = require('./utils/privacy.js')

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

    // 隐私协议：启动时主动查询并请求授权，避免 getLocation 等敏感接口在用户同意前被调用触发框架报错（invalid init scl）
    this.initPrivacyAuthorize()

    // 【业务约束】toiletAll 允许为空（无自建数据属正常场景），客户端一律不自动触发 fixToiletLoc。
    // loc 迁移仅在云开发网页控制台对 fixToiletLoc 手动执行云端测试完成，禁止恢复以下自动调用：
    // this.migrateToiletLoc()
  },

  /**
   * 隐私协议授权（微信官方流程，基础库 >= 2.32.3 生效，老基础库自动跳过）
   * 启动即查询隐私授权状态；需要授权时主动拉起微信官方隐私弹窗。
   * 用户同意后，后续定位/头像/昵称等敏感能力不再被框架拦截，也不会再报 invalid init scl。
   */
  initPrivacyAuthorize() {
    if (!wx.getPrivacySetting || !wx.requirePrivacyAuthorize) return
    wx.getPrivacySetting({
      success: (res) => {
        // 诊断日志：确认隐私指引是否已被客户端读到（needAuthorization + 指引名称）
        console.log('[app] 隐私指引状态 needAuthorization=', !!(res && res.needAuthorization), '| 指引名称=', (res && res.privacyContractName) || '（未读取到，指引未生效）')
        if (res && res.needAuthorization) {
          wx.requirePrivacyAuthorize({
            success: () => {
              console.log('[app] 隐私协议已同意，敏感能力可正常使用')
            },
            fail: (err) => {
              console.warn('[app] 用户未同意隐私协议（定位将回退默认位置，不影响浏览）', err)
            }
          })
        }
      },
      fail: (err) => {
        console.warn('[app] 查询隐私授权状态失败（可忽略）', err)
      }
    })
  },

  // 【已停用·仅保留参考】手动数据修复：调用 fixToiletLoc 云函数补全 loc 字段。
  // 后续录入厕所数据后，请到云开发网页控制台 → 云函数 → fixToiletLoc → 云端测试手动执行。
  // migrateToiletLoc() {
  //   wx.cloud.callFunction({ name: 'fixToiletLoc' })
  //     .then((res) => {
  //       const r = res.result || {}
  //       console.log('[migrateToiletLoc] fixToiletLoc 返回 code=', r.code, '| 统计=', JSON.stringify(r.summary), '| 无法补全=', (r.unfillableList || []).length, '条')
  //     })
  //     .catch((err) => {
  //       console.error('[migrateToiletLoc] fixToiletLoc 调用失败（可能未部署，可忽略）', err)
  //     })
  // },
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