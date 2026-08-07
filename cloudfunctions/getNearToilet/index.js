/**
 * 云函数 getNearToilet
 * 按半径查询周边有效公厕（geoNear 地理位置聚合）
 * 入参：latitude、longitude、radius（米）
 * 过滤：invalid=false 且 auditStatus='pass'（仅展示有效且审核通过的点位）
 *
 * 【必读】toiletAll 集合 2dsphere 地理位置索引配置（否则 geoNear 报错，返回 code=2）：
 * 1. 打开微信开发者工具 → 云开发控制台 → 数据库 → 集合 toiletAll
 * 2. 点击「索引管理」→「新建索引」
 * 3. 字段名选择 lat，类型选择「地理位置（2dsphere）」，或同时将 lat/lng 组合索引设为 2dsphere
 * 4. 保存后，本函数才能按距离聚合检索；未建索引时前端会提示并降级为腾讯 POI 查询
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const { latitude, longitude, radius } = event || {}
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !(radius > 0)) {
    return { code: 1, msg: '参数不完整：latitude/longitude/radius 必填' }
  }
  try {
    const res = await db
      .collection('toiletAll')
      .aggregate()
      .geoNear({
        near: db.Geo.Point(longitude, latitude),
        distanceField: 'distance',
        maxDistance: radius,
        spherical: true,
        query: { invalid: false, auditStatus: 'pass' }
      })
      .limit(100)
      .end()
    const list = (res.list || []).map((item) => ({
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
    }))
    return { code: 0, msg: 'ok', list, total: list.length }
  } catch (err) {
    console.error('geoNear 查询失败（请确认 toiletAll 已创建 2dsphere 索引）', err)
    return { code: 2, msg: '查询失败：' + ((err && err.errMsg) || (err && err.message) || 'geoNear 索引缺失') + '（请为 toiletAll 的 lat/lng 创建 2dsphere 地理位置索引）' }
  }
}