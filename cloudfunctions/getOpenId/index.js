/**
 * 云函数 getOpenId
 * 返回当前调用用户的 openid，供客户端查询"我的上报/我的评价"
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const { OPENID, APPID, UNIONID } = cloud.getWXContext()
  return {
    openid: OPENID,
    appid: APPID,
    unionid: UNIONID || ''
  }
}
