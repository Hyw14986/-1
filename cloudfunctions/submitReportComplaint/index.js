/**
 * 云函数 submitReportComplaint 提交举报
 * 集合：toilet_report（toiletId、reason、openid、createTime）
 * 管理员在云开发控制台查看举报记录后，手动将对应公厕 invalid 置为 true
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const { toiletId, reason } = event || {}
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 1, msg: '获取用户身份失败' }
  if (!toiletId) return { code: 1, msg: '参数不完整' }
  const text = String(reason || '').trim().slice(0, 200)
  if (!text) return { code: 1, msg: '请填写举报原因' }

  await db.collection('toilet_report').add({
    data: { toiletId, reason: text, openid: OPENID, _openid: OPENID, createTime: db.serverDate() }
  })
  return { code: 0, msg: '举报已提交，感谢反馈' }
}