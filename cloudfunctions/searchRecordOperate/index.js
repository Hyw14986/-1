/**
 * 云函数 searchRecordOperate 查询记录管理
 * action:
 *  - add    新增一条查询记录（写入 toilet_search_record）
 *  - list   按时间倒序读取当前用户全部记录
 *  - delete 删除单条记录（仅限本人）
 *  - clear  清空当前用户全部记录
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const { action = 'list' } = event || {}
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 1, msg: '获取用户身份失败' }

  // 新增查询记录
  if (action === 'add') {
    const searchRadius = Number(event.searchRadius)
    const searchCount = Number(event.searchCount || 0)
    const userLat = Number(event.userLat)
    const userLng = Number(event.userLng)
    if (!(searchRadius > 0) || !(userLat >= -90 && userLat <= 90) || !(userLng >= -180 && userLng <= 180)) {
      return { code: 1, msg: '参数不完整' }
    }
    const addRes = await db.collection('toilet_search_record').add({
      data: {
        openid: OPENID,
        _openid: OPENID,
        searchRadius,
        searchCount,
        userLat,
        userLng,
        searchTime: Date.now()
      }
    })
    return { code: 0, msg: 'ok', recordId: addRes._id }
  }

  // 读取当前用户全部记录（时间倒序）
  if (action === 'list') {
    const res = await db
      .collection('toilet_search_record')
      .where({ openid: OPENID })
      .orderBy('searchTime', 'desc')
      .limit(100)
      .get()
    const list = (res.data || []).map((item) => ({
      _id: item._id,
      searchRadius: item.searchRadius,
      searchCount: item.searchCount,
      userLat: item.userLat,
      userLng: item.userLng,
      searchTime: item.searchTime
    }))
    return { code: 0, msg: 'ok', list, total: list.length }
  }

  // 删除单条记录（仅限本人）
  if (action === 'delete') {
    const id = event.id
    if (!id) return { code: 1, msg: '参数不完整' }
    const del = await db.collection('toilet_search_record').where({ _id: id, openid: OPENID }).remove()
    return { code: 0, msg: 'ok', removed: del.stats.removed }
  }

  // 清空当前用户全部记录
  if (action === 'clear') {
    const del = await db.collection('toilet_search_record').where({ openid: OPENID }).remove()
    return { code: 0, msg: 'ok', removed: del.stats.removed }
  }

  return { code: 1, msg: '未知 action' }
}