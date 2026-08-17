/**
 * 云函数 submitDevMessage 提交「对开发者说的话」
 * 集合：developer_message（type、content、openid、createTime）
 * 管理员在云开发控制台 developer_message 集合查看用户留言
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const { type, content } = event || {}
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 1, msg: '获取用户身份失败' }
  const text = String(content || '').trim().slice(0, 500)
  if (!text) return { code: 1, msg: '请填写留言内容' }
  const typeText = String(type || '其他悄悄话').trim().slice(0, 20)

  await db.collection('developer_message').add({
    data: {
      type: typeText,
      content: text,
      openid: OPENID,
      _openid: OPENID,
      createTime: db.serverDate()
    }
  })
  return { code: 0, msg: '留言已送达，开发者热泪盈眶' }
}