/**
 * 云函数 quotaOperate
 * 用户每日可查询次数配额：上限 20 次，每日 0 点（北京时间）自动重置
 * action:
 *  - get     获取今日剩余查询次数（不消耗）
 *  - consume 消耗一次查询次数（先校验配额，不足返回 code=3）
 * 重置逻辑：以 quotaDate（YYYY-MM-DD）为判断依据，不存在今日记录即视为 0 次，
 * 首次消耗时创建今日记录，天然完成"每日 0 点重置"；前端不做任何时间重置，防改手机时间作弊。
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const DAILY_LIMIT = 20

// 北京时间日期字符串 YYYY-MM-DD（云函数默认 UTC，需 +8 小时）
function todayStr() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

exports.main = async (event) => {
  const { action = 'get' } = event || {}
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 1, msg: '获取用户身份失败' }

  const quotaDate = todayStr()

  // 读取今日配额记录（不存在即已重置为 0）
  let quota = null
  try {
    const res = await db
      .collection('toilet_user_quota')
      .where({ openid: OPENID, quotaDate })
      .limit(1)
      .get()
    quota = res.data[0] || null
  } catch (err) {
    console.warn('读取配额记录失败', err)
  }
  const usedCount = quota ? Number(quota.usedCount || 0) : 0

  // 消耗一次查询次数
  if (action === 'consume') {
    if (usedCount >= DAILY_LIMIT) {
      return {
        code: 3,
        msg: '今日查询次数已用完，每日0点将会重置次数',
        usedCount,
        dailyLimit: DAILY_LIMIT,
        remaining: 0
      }
    }
    if (!quota) {
      // 首次消耗：创建今日记录（即完成当日重置）
      await db.collection('toilet_user_quota').add({
        data: { openid: OPENID, quotaDate, usedCount: 1, _openid: OPENID, createTime: db.serverDate() }
      })
    } else {
      await db.collection('toilet_user_quota').doc(quota._id).update({
        data: { usedCount: usedCount + 1 }
      })
    }
    return {
      code: 0,
      msg: 'ok',
      usedCount: usedCount + 1,
      dailyLimit: DAILY_LIMIT,
      remaining: DAILY_LIMIT - usedCount - 1
    }
  }

  // 默认：获取今日剩余次数
  return {
    code: 0,
    msg: 'ok',
    usedCount,
    dailyLimit: DAILY_LIMIT,
    remaining: Math.max(DAILY_LIMIT - usedCount, 0)
  }
}