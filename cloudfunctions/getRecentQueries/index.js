/**
 * 云函数 getRecentQueries（最近查询记录）
 * 用途：读取当前用户「最近查询记录」——即用户查找/浏览过的厕所（toilet_view_record 集合，
 *       由 saveSearchedToilets 写入），按最近查看时间倒序返回，供首页「最近查询记录」按钮渲染到地图。
 * 入参：{ max } 可选，默认 100，上限 200
 * 返回：{ code, msg, list, total }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext()
    if (!OPENID) return { code: 1, msg: '获取用户身份失败', list: [], total: 0 }

    const MAX = Math.min(Number(event.max) || 100, 200)

    let res
    try {
      res = await db.collection('toilet_view_record')
        .where({ openid: OPENID })
        .orderBy('lastSeenTime', 'desc')
        .limit(MAX)
        .get()
    } catch (err) {
      // 集合尚不存在（用户还没查询过）：属于正常空状态，不视为异常
      const msg = (err && err.errMsg) || String(err)
      if (msg.indexOf('not exist') >= 0 || msg.indexOf('-502005') >= 0) {
        return { code: 0, msg: 'ok', list: [], total: 0, empty: true }
      }
      throw err
    }

    const list = (res.data || []).map((t) => ({
      _id: t._id,
      toiletId: t.toiletId || '',
      name: t.name || '未命名公厕',
      lat: t.lat,
      lng: t.lng,
      source: t.source || 'user',
      address: t.address || '',
      lastSeenTime: t.lastSeenTime || t.createTime || 0
    }))
    console.log('[getRecentQueries] 返回最近查询记录', list.length, '条')
    return { code: 0, msg: 'ok', list, total: list.length }
  } catch (err) {
    console.error('[getRecentQueries] 异常（完整错误）', err)
    return { code: -1, msg: (err && err.errMsg) || '读取失败', list: [], total: 0 }
  }
}