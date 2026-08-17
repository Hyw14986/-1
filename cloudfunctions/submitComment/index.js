/**
 * 云函数 submitComment 提交厕所评价
 * 集合：toilet_comment（openid、toiletId、score、hygiene、comfort、air、content、likes、replies、createTime）
 * 评分维度与上报页对应：hygiene 卫生环境 / comfort 如厕体验 / air 空气质量 / total 综合（兼容旧字段 score/rating）
 * 限制：同一 openid 对同一 toiletId 仅允许一条评价（防刷分）
 * 提交成功后重新聚合 toiletAll 的平均评分并回写
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const { toiletId, score, content } = event || {}
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 1, msg: '获取用户身份失败' }
  if (!toiletId) return { code: 1, msg: '参数不完整' }

  // 评分维度与上报页对应（卫生/体验/空气/综合），兼容旧字段 score/rating（作为综合分）
  const parseScore = (v) => {
    const n = Math.round(Number(v))
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0
  }
  const hygiene = parseScore(event.hygiene)
  const comfort = parseScore(event.comfort)
  const air = parseScore(event.air)
  let total = parseScore(event.total)
  if (!total) total = parseScore(score) || parseScore(event.rating)
  if (!total) return { code: 1, msg: '评分需为 1-5 的整数' }
  const text = String(content || '').trim().slice(0, 300)
  if (!text) return { code: 1, msg: '评价内容不能为空' }

  // 校验公厕存在
  try {
    await db.collection('toiletAll').doc(toiletId).get()
  } catch (err) {
    return { code: 1, msg: '公厕不存在或已被删除' }
  }

  // 唯一性：同一 openid 对同一 toiletId 只能评价一次
  const existRes = await db.collection('toilet_comment').where({ toiletId, openid: OPENID }).count()
  if (existRes.total > 0) {
    return { code: 2, msg: '你已评价过该公厕，不能重复评价' }
  }

  // 读取用户资料快照（头像昵称展示在评价列表）
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

  await db.collection('toilet_comment').add({
    data: {
      toiletId,
      openid: OPENID,
      _openid: OPENID,
      score: total,
      hygiene,
      comfort,
      air,
      total,
      content: text,
      nickname,
      avatarUrl,
      likes: [],
      likeCount: 0,
      replies: [],
      createTime: db.serverDate()
    }
  })

  // 聚合平均分并回写 toiletAll
  const $ = db.command.aggregate
  const aggRes = await db
    .collection('toilet_comment')
    .aggregate()
    .match({ toiletId })
    .group({ _id: null, avg: $.avg('$score'), count: $.sum(1) })
    .end()
  const stat = (aggRes.list && aggRes.list[0]) || {}
  const avgRating = Math.round((stat.avg || 0) * 10) / 10
  const ratingCount = stat.count || 1
  await db.collection('toiletAll').doc(toiletId).update({
    data: { rating: avgRating, ratingCount }
  })

  return { code: 0, msg: '评价成功', rating: avgRating, ratingCount }
}