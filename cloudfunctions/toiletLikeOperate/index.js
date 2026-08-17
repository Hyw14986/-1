/**
 * 云函数 toiletLikeOperate 厕所点赞
 * action:
 *  - get    { toiletId }  查询当前用户是否已赞 + 该厕所总点赞数
 *  - toggle { toiletId }  点赞/取消点赞（同一用户同一厕所 toggle，防止刷赞）
 * 集合：toilet_like（openid、toiletId、createTime）
 * 返回：{ code, msg, liked, likeCount }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

/** 确保集合存在：云开发集合必须显式创建，不存在时自动创建，避免首次执行报 -502005 */
async function ensureCollection(name) {
  try {
    await db.createCollection(name)
    console.log('[toiletLikeOperate] 集合不存在，已自动创建：' + name)
  } catch (err) {
    // 集合已存在或并发创建冲突：忽略
  }
}

exports.main = async (event = {}) => {
  await ensureCollection('toilet_like')
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 1, msg: '获取用户身份失败', liked: false, likeCount: 0 }
  const toiletId = event.toiletId
  if (!toiletId) return { code: 1, msg: '参数不完整', liked: false, likeCount: 0 }

  try {
    if (event.action === 'toggle') {
      const exist = await db.collection('toilet_like').where({ openid: OPENID, toiletId }).count()
      if (exist.total > 0) {
        await db.collection('toilet_like').where({ openid: OPENID, toiletId }).remove()
      } else {
        await db.collection('toilet_like').add({
          data: { openid: OPENID, toiletId, _openid: OPENID, createTime: db.serverDate() }
        })
      }
      const cnt = await db.collection('toilet_like').where({ toiletId }).count()
      return { code: 0, msg: 'ok', liked: exist.total === 0, likeCount: cnt.total || 0 }
    }

    // 默认 get：是否已赞 + 点赞总数
    const exist = await db.collection('toilet_like').where({ openid: OPENID, toiletId }).count()
    const cnt = await db.collection('toilet_like').where({ toiletId }).count()
    return { code: 0, msg: 'ok', liked: exist.total > 0, likeCount: cnt.total || 0 }
  } catch (err) {
    console.error('[toiletLikeOperate] 异常（完整错误）', err)
    return { code: -1, msg: (err && err.errMsg) || '操作失败', liked: false, likeCount: 0 }
  }
}