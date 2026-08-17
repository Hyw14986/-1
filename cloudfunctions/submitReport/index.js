/**
 * 云函数 submitReport 用户上报公厕
 * 流程：
 * 1. 参数校验（名称、经纬度必填）
 * 2. 重复检测：toiletAll 中 50 米内已存在有效公厕 → 提示重复上报
 * 3. 写入 toiletAll，source='user'，auditStatus='pending'（待管理员审核，仅 pass 展示）
 * 上报功能不消耗查询次数
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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

/** 评分钳制：0-5，保留 1 位小数，非法值归 0 */
function clampScore(v) {
  const n = Number(v)
  if (!isFinite(n)) return 0
  return Math.min(5, Math.max(0, Math.round(n * 10) / 10))
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 1, msg: '获取用户身份失败' }

  const name = String((event && event.name) || '').trim()
  const lat = Number(event && event.lat)
  const lng = Number(event && event.lng)
  if (!name || !(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) {
    return { code: 1, msg: '请填写公厕名称并选择位置' }
  }

  // 重复检测：50 米内已存在有效公厕
  try {
    const nearby = await db.collection('toiletAll').where({ invalid: false }).limit(50).get()
    for (const item of nearby.data) {
      if (getDistance(lat, lng, item.lat, item.lng) <= 50) {
        return { code: 2, msg: '该位置 50 米内已存在公厕，请勿重复上报' }
      }
    }
  } catch (err) {
    console.warn('重复检测失败（toiletAll 可能未创建）', err)
  }

  const feeType = ['free', 'paid', 'other'].indexOf(event && event.feeType) > -1 ? event.feeType : 'free'
  const seatType = ['squat', 'sitting', 'both', 'other'].indexOf(event && event.seatType) > -1 ? event.seatType : ''

  const addRes = await db.collection('toiletAll').add({
    data: {
      lat,
      lng,
      // 地理位置字段：配合 loc 2dsphere 索引供 geoNear 使用（见 getNearToilet 顶部注释）
      loc: db.Geo.Point(lng, lat),
      name,
      address: String((event && event.address) || ''),
      source: 'user',
      invalid: false,
      hasPaper: !!(event && event.hasPaper),
      isCharge: !!(event && event.isCharge),
      isBarrierFree: !!(event && event.isBarrierFree),
      hasBabyRoom: !!(event && event.hasBabyRoom),
      isOpen24h: !!(event && event.isOpen24h),
      // 坑位类型：squat 蹲便 / sitting 坐便 / both 都有 / other 其他（自定义说明存 seatTypeOther）
      seatType,
      seatTypeOther: seatType === 'other' ? String((event && event.seatTypeOther) || '').trim() : '',
      // 设施标签「其他」自定义说明（前端 tags.other 选中时提交）
      otherTagText: String((event && event.otherTagText) || '').trim(),
      // 体验评分：卫生环境 / 如厕体验 / 空气质量 / 综合（0-5）
      hygieneScore: clampScore(event && event.hygieneScore),
      comfortScore: clampScore(event && event.comfortScore),
      airScore: clampScore(event && event.airScore),
      totalScore: clampScore(event && event.totalScore),
      // 附加设施：洗手液 / 烘手器 / 空调
      hasSoap: !!(event && event.hasSoap),
      hasDryer: !!(event && event.hasDryer),
      hasAC: !!(event && event.hasAC),
      // 是否对外开放：默认对外开放（全天开放）；选择不对公众开放时标记对应文案
      openTime: (event && event.isPublic === false) ? '不对公众开放' : String((event && event.openTime) || '') || '全天开放',
      feeType,
      feeDesc: feeType === 'other' ? String((event && event.feeDesc) || '') : '',
      photoUrls: Array.isArray(event && event.photoUrls) ? event.photoUrls : [],
      // 上报者想对大家说的话（选填）
      note: String((event && event.note) || '').trim(),
      auditStatus: 'pending',
      rating: 0,
      ratingCount: 0,
      _openid: OPENID,
      createTime: db.serverDate()
    }
  })

  return { code: 0, msg: '上报成功，等待管理员审核', id: addRes._id }
}