/**
 * 云函数 getAllToilets
 * 用途：首页「一键显示最近 100 个厕所」——读取 toiletAll 有效公厕点位（按 createTime 倒序，最新入库优先）+ 返回数据库已收录总量
 * 可见性口径与 getNearToilet 一致：invalid != true 且 auditStatus 非 pending/reject（缺失视为有效）
 * 入参：
 *   countOnly: true  仅返回总量（页面加载时轻量统计，不做分页查询）
 *   max: 返回点位上限（默认 2000，防止小程序 map 组件渲染卡顿）
 * 返回：{ code, msg, total, list, truncated }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 可见性判断：pending 待审核 / reject 驳回不展示；auditStatus 缺失视为有效（兼容手动导入/旧数据缺字段）
function isVisible(item) {
  const s = item && item.auditStatus
  return s !== 'pending' && s !== 'reject'
}

// 点位字段统一映射（与 getNearToilet 保持一致的展示口径）
function mapItem(item) {
  return {
    _id: item._id,
    lat: item.lat,
    lng: item.lng,
    name: item.name || '未命名公厕',
    address: item.address || '',
    source: item.source || 'gov',
    hasPaper: !!item.hasPaper,
    isCharge: !!item.isCharge,
    isBarrierFree: !!item.isBarrierFree,
    hasBabyRoom: !!item.hasBabyRoom,
    isOpen24h: !!item.isOpen24h,
    openTime: item.openTime || '',
    rating: item.rating || 0,
    ratingCount: item.ratingCount || 0,
    photoUrls: item.photoUrls || []
  }
}

exports.main = async (event = {}) => {
  try {
    const where = { invalid: _.neq(true) }
    const countRes = await db.collection('toiletAll').where(where).count()
    const total = countRes.total || 0
    console.log('[getAllToilets] 数据库已收录有效公厕', total, '条')
    if (event.countOnly) {
      return { code: 0, msg: 'ok', total, list: [], truncated: false }
    }
    const MAX = Math.min(Number(event.max) || 2000, 3000)
    const rows = []
    const pageSize = 1000
    let skip = 0
    // 分页拉取全部有效点位（云函数 get 单次上限 1000 条），再按可见性过滤
    while (rows.length < MAX) {
      const res = await db.collection('toiletAll').where(where)
        .orderBy('createTime', 'desc')
        .field({
          name: true, address: true, lat: true, lng: true, source: true,
          rating: true, ratingCount: true, photoUrls: true, hasPaper: true, isCharge: true,
          isBarrierFree: true, hasBabyRoom: true, isOpen24h: true, openTime: true
        })
        .skip(skip).limit(pageSize).get()
      const data = (res.data || []).filter(isVisible)
      rows.push(...data)
      if ((res.data || []).length < pageSize) break
      skip += (res.data || []).length
    }
    const list = rows.slice(0, MAX).map(mapItem)
    console.log('[getAllToilets] 返回点位', list.length, '条，截断=', total > list.length)
    return { code: 0, msg: 'ok', total, list, truncated: total > list.length }
  } catch (err) {
    console.error('[getAllToilets] 异常（完整错误）', err)
    return {
      code: -1,
      msg: (err && err.errMsg) || (err && err.message) || '数据库读取失败',
      total: 0,
      list: [],
      truncated: false
    }
  }
}