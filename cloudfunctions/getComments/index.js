/**
 * 云函数 getComments 读取公厕评价列表（公开浏览）
 * 说明：云函数端以管理员身份读取，不受客户端集合权限限制，
 * 保证任意用户打开公厕详情弹窗都能看到全部历史评价。
 * 返回：{ code, msg, list, myOpenid }
 * 每条评论附带：likeCount / likes / replies / isMine（是否我的）/ liked（我是否已点赞）
 * 入参：toiletId
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const toiletId = event && event.toiletId
  if (!toiletId) return { code: 1, msg: '参数不完整' }
  const { OPENID } = cloud.getWXContext()

  try {
    const res = await db
      .collection('toilet_comment')
      .where({ toiletId })
      .orderBy('createTime', 'desc')
      .limit(20)
      .get()
    const list = (res.data || []).map((c) => ({
      ...c,
      likeCount: c.likeCount || (Array.isArray(c.likes) ? c.likes.length : 0),
      replies: Array.isArray(c.replies) ? c.replies : [],
      isMine: !!OPENID && c._openid === OPENID,
      liked: !!OPENID && Array.isArray(c.likes) && c.likes.indexOf(OPENID) > -1
    }))
    return { code: 0, msg: 'ok', list, myOpenid: OPENID || '' }
  } catch (err) {
    console.error('读取评价失败', err)
    return { code: 2, msg: '读取评价失败', list: [], myOpenid: '' }
  }
}