/**
 * 云函数 submitComment
 * 提交厕所评价：
 * 1. 校验参数与公厕是否存在
 * 2. 唯一性校验：同一 openid + 同一 toiletId 仅允许一条评价
 * 3. 写入 comment 集合（附带头像昵称快照，并显式写入 _openid）
 * 4. 重新聚合该公厕的平均评分并回写 toilet.rating / ratingCount
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const { toiletId, rating, content } = event
  const { OPENID } = cloud.getWXContext()

  // 1. 参数校验
  if (!toiletId) {
    return { code: 1, msg: '参数不完整' }
  }
  const score = Number(rating)
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return { code: 1, msg: '评分需为 1-5 的整数' }
  }
  const text = String(content || '').trim().slice(0, 200)

  // 2. 校验公厕存在
  try {
    await db.collection('toilet').doc(toiletId).get()
  } catch (err) {
    return { code: 1, msg: '公厕不存在或已被删除' }
  }

  // 3. 唯一性校验：同一 openid 对同一 toiletId 只能评价一次
  const existRes = await db.collection('comment').where({ toiletId, _openid: OPENID }).count()
  if (existRes.total > 0) {
    return { code: 2, msg: '你已评价过该公厕，不能重复评价' }
  }

  // 4. 读取用户资料（头像昵称快照，展示在评价列表）
  let nickname = '微信用户'
  let avatarUrl = ''
  try {
    const userRes = await db.collection('user').where({ _openid: OPENID }).limit(1).get()
    if (userRes.data.length) {
      nickname = userRes.data[0].nickname || nickname
      avatarUrl = userRes.data[0].avatarUrl || ''
    }
  } catch (err) {
    console.warn('读取用户资料失败', err)
  }

  // 5. 写入评价（云函数端不会自动添加 _openid，必须显式写入，供查重与"我的评价"使用）
  const addRes = await db.collection('comment').add({
    data: {
      toiletId,
      rating: score,
      content: text,
      nickname,
      avatarUrl,
      _openid: OPENID,
      createTime: db.serverDate()
    }
  })

  // 6. 聚合平均分并回写公厕
  const $ = db.command.aggregate
  const aggRes = await db
    .collection('comment')
    .aggregate()
    .match({ toiletId })
    .group({ _id: null, avg: $.avg('$rating'), count: $.sum(1) })
    .end()
  const stat = (aggRes.list && aggRes.list[0]) || {}
  const avgRating = Math.round((stat.avg || 0) * 10) / 10
  const ratingCount = stat.count || 1

  await db.collection('toilet').doc(toiletId).update({
    data: {
      rating: avgRating,
      ratingCount
    }
  })

  return {
    code: 0,
    msg: '评价成功',
    commentId: addRes._id,
    rating: avgRating,
    ratingCount
  }
}
