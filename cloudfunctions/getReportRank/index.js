/**
 * 云函数 getReportRank 用户上报功德榜
 * 统计 toiletAll 中 source='user' 且审核通过（auditStatus=pass）且未失效的记录，
 * 按上报人 openid 聚合数量，积分 = 数量 * 5（每座审核通过奖励 5 积分，与 pointsOperate 规则一致）。
 * 入参：{ limit } 可选，默认 20，最大 50
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

/** openid 脱敏展示 */
function maskOpenid(openid) {
  const s = String(openid || '')
  if (!s) return '神秘侠客'
  if (s.length <= 6) return s.slice(0, 2) + '****'
  return s.slice(0, 3) + '****' + s.slice(-4)
}

exports.main = async (event) => {
  const limit = Math.min(parseInt((event && event.limit) || 20, 10) || 20, 50)

  try {
    const agg = await db
      .collection('toiletAll')
      .aggregate()
      .match({ source: 'user', auditStatus: 'pass', invalid: _.neq(true) })
      .group({ _id: '$_openid', count: $.sum(1) })
      .sort({ count: -1 })
      .limit(limit)
      .end()

    const list = (agg.list || [])
      .filter((g) => g._id)
      .map((g, index) => ({
        rank: index + 1,
        openid: maskOpenid(String(g._id)),
        count: Number(g.count || 0),
        points: Number(g.count || 0) * 5
      }))

    console.log('[getReportRank] 上榜人数=', list.length)
    return { code: 0, msg: 'ok', list, total: list.length }
  } catch (err) {
    console.error('[getReportRank] 完整错误', err)
    return { code: 1, msg: '功德榜获取失败', err: String((err && err.errMsg) || err) }
  }
}