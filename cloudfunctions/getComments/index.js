/**
 * 云函数 getComments 读取公厕评价列表（公开浏览）
 * 说明：云函数端以管理员身份读取，不受客户端集合权限限制，
 * 保证任意用户打开公厕详情弹窗都能看到全部历史评价。
 * 入参：toiletId
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const toiletId = event && event.toiletId
  if (!toiletId) return { code: 1, msg: '参数不完整' }

  try {
    const res = await db
      .collection('toilet_comment')
      .where({ toiletId })
      .orderBy('createTime', 'desc')
      .limit(20)
      .get()
    return { code: 0, msg: 'ok', list: res.data || [] }
  } catch (err) {
    console.error('读取评价失败', err)
    return { code: 2, msg: '读取评价失败', list: [] }
  }
}