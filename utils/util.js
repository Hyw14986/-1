/**
 * utils/util.js - 通用工具函数
 * 距离计算、距离/时间格式化、设施标签映射、获取 openid
 */

/**
 * 计算两个经纬度之间的距离（haversine 公式）
 * @param {number} lat1 纬度1
 * @param {number} lng1 经度1
 * @param {number} lat2 纬度2
 * @param {number} lng2 经度2
 * @returns {number} 距离（米）
 */
function getDistance(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180
  const R = 6371000 // 地球半径（米）
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

/**
 * 格式化距离：不足 1000 米显示米，否则显示千米
 * @param {number} meters 距离（米）
 * @returns {string} 例如 "350m" / "1.2km"
 */
function formatDistance(meters) {
  if (meters === null || meters === undefined || isNaN(meters)) return ''
  if (meters < 1000) return meters + 'm'
  return (meters / 1000).toFixed(1) + 'km'
}

/**
 * 格式化时间：云数据库 serverDate 返回 ISO 字符串或 Date
 * @param {Date|string} input 时间
 * @returns {string} 例如 "2026-08-06 14:30"
 */
function formatTime(input) {
  if (!input) return ''
  const date = input instanceof Date ? input : new Date(input)
  if (isNaN(date.getTime())) return ''
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    ' ' +
    pad(date.getHours()) +
    ':' +
    pad(date.getMinutes())
  )
}

/**
 * 设施标签定义（key -> 展示文案）
 */
const FACILITY_LABELS = {
  hasAccessible: '无障碍',
  hasBabyCare: '母婴室',
  hasToiletPaper: '有纸巾',
  isFree: '免费'
}

/**
 * 获取公厕开启的设施标签列表
 * @param {object} toilet 公厕数据
 * @returns {string[]} 标签文案数组，如 ['无障碍', '免费']
 */
function getFacilityTags(toilet) {
  if (!toilet) return []
  const tags = []
  if (toilet.hasAccessible) tags.push(FACILITY_LABELS.hasAccessible)
  if (toilet.hasBabyCare) tags.push(FACILITY_LABELS.hasBabyCare)
  if (toilet.hasToiletPaper) tags.push(FACILITY_LABELS.hasToiletPaper)
  if (toilet.isFree) tags.push(FACILITY_LABELS.isFree)
  return tags
}

/**
 * 获取当前用户 openid（调用 getOpenId 云函数，带全局缓存）
 * @returns {Promise<string>} openid
 */
function getOpenId() {
  const app = getApp()
  return new Promise((resolve, reject) => {
    if (app.globalData.openid) {
      resolve(app.globalData.openid)
      return
    }
    wx.cloud
      .callFunction({ name: 'getOpenId' })
      .then((res) => {
        const openid = res.result && res.result.openid
        if (openid) {
          app.globalData.openid = openid
          resolve(openid)
        } else {
          reject(new Error('获取 openid 失败'))
        }
      })
      .catch(reject)
  })
}

module.exports = {
  getDistance,
  formatDistance,
  formatTime,
  getFacilityTags,
  getOpenId,
  FACILITY_LABELS
}
