/**
 * 云函数 submitFeedback 提交公厕反馈
 * 集合：toilet_feedback（toiletId、type、content、openid、createTime）
 * 管理员在云开发控制台查看反馈记录后，处理对应公厕问题（如修正信息、置 invalid 等）
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const { toiletId, type, content } = event || {}
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 1, msg: '获取用户身份失败' }
  if (!toiletId) return { code: 1, msg: '参数不完整' }
  const text = String(content || '').trim().slice(0, 500)
  if (!text) return { code: 1, msg: '请填写反馈内容' }
  const typeText = String(type || '其他').trim().slice(0, 20)

  await db.collection('toilet_feedback').add({
    data: {
      toiletId,
      type: typeText,
      content: text,
      openid: OPENID,
      _openid: OPENID,
      createTime: db.serverDate()
    }
  })
  return { code: 0, msg: '反馈已提交，感谢您的帮助' }
}