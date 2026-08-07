/**
 * 云函数 getNearToilet
 * 按半径查询周边有效公厕（geoNear 地理位置聚合）
 * 入参：latitude、longitude、radius（米）
 * 过滤：invalid=false 且 auditStatus='pass'（仅展示有效且审核通过的点位）
 *
 * 【必读】toiletAll 集合必须建立 loc 字段 2dsphere 地理位置索引，否则 geoNear 会直接报错：
 * 1. 打开微信开发者工具 → 云开发控制台 → 数据库 → 集合 toiletAll
 * 2. 点击「索引管理」→「新建索引」
 * 3. 字段名选择 loc，类型选择「地理位置（2dsphere）」
 * 4. 写入数据时必须同时保存 loc: db.Geo.Point(lng, lat)（initData / submitReport / saveTencentPoi 均已写入）
 * 5. 未建索引时本函数自动降级：改为 where + JS 球面距离过滤（返回 fallback=true），
 *    无索引也能正常返回库内点位；但仍建议尽快建索引，点位量大后 geoNear 更高效
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 展示规则：invalid 不为 true（缺字段视为有效）且 auditStatus 为 'pass' 或字段缺失（兼容手动导入/旧数据缺字段；pending 待审核 / reject 驳回不展示）
const visibleQuery = _.and([
  { invalid: _.neq(true) },
  _.or([{ auditStatus: 'pass' }, { auditStatus: _.exists(false) }])
])

// haversine 球面距离（米），供 JS 降级方案使用；入参非法返回 NaN，由 isFinite 兜底
function getDistance(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180
  const R = 6371000
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// 点位字段统一映射（geoNear 与 JS 降级共用）
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
    photoUrls: item.photoUrls || [],
    rating: item.rating || 0,
    ratingCount: item.ratingCount || 0,
    distance: Math.round(item.distance || 0)
  }
}

exports.main = async (event) => {
  const { latitude, longitude, radius } = event || {}
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !(radius > 0)) {
    return { code: 1, msg: '参数不完整：latitude/longitude/radius 必填' }
  }

  // 1. 优先 geoNear（需要 toiletAll.loc 字段 2dsphere 索引；无索引会抛错）
  try {
    const res = await db
      .collection('toiletAll')
      .aggregate()
      .geoNear({
        near: db.Geo.Point(longitude, latitude),
        distanceField: 'distance',
        maxDistance: radius,
        spherical: true,
        query: visibleQuery
      })
      .limit(100)
      .end()
    const list = (res.list || []).map(mapItem)
    console.log('[getNearToilet] geoNear 命中', list.length, '条')
    return { code: 0, msg: 'ok', fallback: false, list, total: list.length }
  } catch (err) {
    // 常见原因：toiletAll 未建 loc 2dsphere 索引 / 老数据没有 loc 字段 → 打印错误码与完整信息，随后降级
    console.error('[getNearToilet] geoNear 失败，降级为 JS 距离过滤（请为 toiletAll.loc 创建 2dsphere 索引）', {
      errCode: err && err.errCode,
      errMsg: (err && err.errMsg) || (err && err.message) || err
    })
  }

  // 2. 降级：where 拉取全部有效点位 + JS 球面距离过滤（无索引也能正常返回，避免前端判定查询失败）
  try {
    const res = await db
      .collection('toiletAll')
      .where(visibleQuery)
      .limit(1000)
      .get()
    const list = (res.data || [])
      .map((item) => ({
        ...item,
        distance: getDistance(latitude, longitude, Number(item.lat), Number(item.lng))
      }))
      .filter((item) => isFinite(item.distance) && item.distance <= radius)
      .sort((a, b) => a.distance - b.distance)
      .map(mapItem)
    console.log('[getNearToilet] JS 降级过滤后命中', list.length, '条')
    return { code: 0, msg: 'ok（JS 降级）', fallback: true, list, total: list.length }
  } catch (err) {
    console.error('[getNearToilet] 降级查询也失败（toiletAll 可能未创建或权限异常）', {
      errCode: err && err.errCode,
      errMsg: (err && err.errMsg) || (err && err.message) || err
    })
    return {
      code: 2,
      msg: '查询失败：' + ((err && err.errMsg) || (err && err.message) || 'toiletAll 集合不存在或索引缺失') + '（请确认 toiletAll 已创建且 loc 字段建有 2dsphere 索引）'
    }
  }
}