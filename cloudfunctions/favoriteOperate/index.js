/**
 * 云函数 favoriteOperate 收藏管理
 * action:
 *  - add    收藏公厕
 *  - remove 取消收藏
 *  - list   我的收藏列表
 *  - check  是否已收藏（返回 true/false）
 * 集合：toilet_favorite（openid、toiletId、createTime）
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const { action = 'list', toiletId } = event || {}
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 1, msg: '获取用户身份失败' }

  if (action === 'add') {
    if (!toiletId) return { code: 1, msg: '参数不完整' }
    const exist = await db.collection('toilet_favorite').where({ openid: OPENID, toiletId }).count()
    if (exist.total > 0) return { code: 2, msg: '已收藏' }
    await db.collection('toilet_favorite').add({
      data: { openid: OPENID, toiletId, _openid: OPENID, createTime: db.serverDate() }
    })
    return { code: 0, msg: '收藏成功' }
  }

  if (action === 'remove') {
    if (!toiletId) return { code: 1, msg: '参数不完整' }
    await db.collection('toilet_favorite').where({ openid: OPENID, toiletId }).remove()
    return { code: 0, msg: '已取消收藏' }
  }

  if (action === 'check') {
    if (!toiletId) return { code: 1, msg: '参数不完整' }
    const exist = await db.collection('toilet_favorite').where({ openid: OPENID, toiletId }).count()
    return { code: 0, msg: 'ok', favorited: exist.total > 0 }
  }

  // list：我的收藏（关联查询公厕信息）
  const favRes = await db
    .collection('toilet_favorite')
    .where({ openid: OPENID })
    .orderBy('createTime', 'desc')
    .limit(100)
    .get()
  const ids = (favRes.data || []).map((f) => f.toiletId)
  const toilets = []
  if (ids.length) {
    const tRes = await db.collection('toiletAll').where({ _id: db.command.in(ids) }).limit(100).get()
    toilets.push(...tRes.data)
  }
  return { code: 0, msg: 'ok', list: toilets, total: toilets.length }
}