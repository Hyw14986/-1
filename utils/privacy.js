// utils/privacy.js - 微信隐私协议授权工具
// 背景：控制台出现「invalid init scl: init before tap」报错，这是微信基础库已知问题：
// 在用户同意《小程序用户隐私保护指引》之前调用隐私接口（如 wx.getLocation、chooseAvatar）就会触发。
// 本工具统一封装「隐私授权前置校验」：所有自动调用隐私接口的位置先经过这里，
// 未同意前不发起敏感 API 调用，从根本上规避该框架报错。
// 依赖：基础库 >= 2.32.3 提供 wx.getPrivacySetting / wx.requirePrivacyAuthorize；老基础库自动放行。

/**
 * 确保用户已同意小程序隐私协议（拉起微信官方隐私弹窗）
 * @returns {Promise<boolean>} resolve=true 表示可安全调用隐私接口；reject 表示用户未同意/拒绝授权
 */
function ensurePrivacyAuthorize() {
  return new Promise((resolve, reject) => {
    // 老基础库（< 2.32.3）无隐私拦截能力：直接放行，保持原有业务行为
    if (!wx.getPrivacySetting || !wx.requirePrivacyAuthorize) {
      resolve(true)
      return
    }
    wx.getPrivacySetting({
      success: (res) => {
        if (!res || !res.needAuthorization) {
          // 用户已经同意过隐私协议：无需再弹窗，直接放行
          resolve(true)
          return
        }
        // 需要授权：调用官方接口拉起微信隐私弹窗
        // 用户同意 → success；用户拒绝 → fail（距上次拒绝不足 10 秒会直接 fail，不重复弹窗）
        wx.requirePrivacyAuthorize({
          success: () => {
            console.log('[privacy] 用户已同意隐私协议')
            resolve(true)
          },
          fail: (err) => {
            console.warn('[privacy] 用户未同意隐私协议（敏感接口将被跳过）', err)
            reject(err || new Error('privacy authorize rejected'))
          }
        })
      },
      fail: (err) => {
        // 查询授权状态失败：不阻塞流程，按旧逻辑放行，由调用方自身的失败处理兜底
        console.warn('[privacy] 查询隐私授权状态失败（可忽略）', err)
        resolve(true)
      }
    })
  })
}

module.exports = { ensurePrivacyAuthorize }