/**
 * 云函数 commentOperate 评论互动（点赞 / 回复 / 删除）
 * action:
 *  - like   { commentId }           点赞/取消点赞（同一用户同一评论 toggle）
 *  - reply  { commentId, content }  回复评论（写入该评论的 replies 数组）
 *  - delete { commentId }           删除自己的评论（仅允许评论作者 _openid === OPENID）
 * 集合：toilet_comment
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 单条评论点赞人数上限（防止数组无限膨胀）
const MAX_LIKES = 200

/** 读取用户资料快照（回复展示昵称/头像用） */
async function getUserProfile(OPENID) {
  let nickname = '微信用户'
  let avatarUrl = ''
  try {
    const res = await db.collection('user').where({ _openid: OPENID }).limit(1).get()
    if (res.data.length) {
      nickname = res.data[0].nickname || nickname
      avatarUrl = res.data[0].avatarUrl || ''
    }
  } catch (err) {
    console.warn('读取用户资料失败', err)
  }
  return { nickname, avatarUrl }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 1, msg: '获取用户身份失败' }

  const action = event && event.action
  const commentId = event && event.commentId
  if (!commentId) return { code: 1, msg: '参数不完整' }

  // ===== 点赞 / 取消点赞（toggle）=====
  if (action === 'like') {
    let doc
    try {
      doc = await db.collection('toilet_comment').doc(commentId).get()
    } catch (err) {
      return { code: 1, msg: '评论不存在或已删除' }
    }
    const likes = Array.isArray(doc.data.likes) ? doc.data.likes.slice() : []
    const idx = likes.indexOf(OPENID)
    let liked = false
    if (idx > -1) {
      likes.splice(idx, 1)
    } else {
      if (likes.length >= MAX_LIKES) likes.shift()
      likes.push(OPENID)
      liked = true
    }
    const likeCount = likes.length
    await db.collection('toilet_comment').doc(commentId).update({
      data: { likes, likeCount }
    })
    return { code: 0, msg: liked ? '点赞成功' : '已取消点赞', liked, likeCount }
  }

  // ===== 回复评论 =====
  if (action === 'reply') {
    const text = String(event.content || '').trim().slice(0, 200)
    if (!text) return { code: 1, msg: '回复内容不能为空' }
    const profile = await getUserProfile(OPENID)
    const reply = {
      rid: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      openid: OPENID,
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      content: text,
      createTime: db.serverDate()
    }
    await db.collection('toilet_comment').doc(commentId).update({
      data: { replies: _.push([reply]) }
    })
    return { code: 0, msg: '回复成功' }
  }

  // ===== 删除自己的评论 =====
  if (action === 'delete') {
    let doc
    try {
      doc = await db.collection('toilet_comment').doc(commentId).get()
    } catch (err) {
      return { code: 1, msg: '评论不存在或已删除' }
    }
    if (!doc.data || doc.data._openid !== OPENID) {
      return { code: 2, msg: '只能删除自己的评论' }
    }
    await db.collection('toilet_comment').doc(commentId).remove()
    return { code: 0, msg: '删除成功' }
  }

  return { code: 1, msg: '未知操作' }
}
