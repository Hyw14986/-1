/**
 * 云函数 seedHotToilets 公厕排行榜种子数据初始化
 * 用途：把网络公开报道整理的「网红 / 最美公厕」写入 toilet_hot 集合，
 *       供排行榜「全网人气榜」展示；幂等，按 name 去重，不会重复新增。
 * 集合：toilet_hot
 * 字段：name、city、address、lat、lng、seedScore、hotDesc、reviews、tags、photoUrls、invalid、createTime
 * 使用：云开发控制台 → 云函数 → seedHotToilets → 云端测试（入参可传 { force: true } 强制覆盖更新）
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const HOT_DATA = require('./data.js')

/** 确保集合存在：云开发集合必须显式创建，不存在时自动创建，避免首次执行报 -502005 */
async function ensureCollection(name) {
  try {
    await db.createCollection(name)
    console.log('[seedHotToilets] 集合不存在，已自动创建：' + name)
  } catch (err) {
    // 集合已存在或并发创建冲突：忽略，继续正常写入
  }
}

exports.main = async (event) => {
  const { force = false } = event || {}
  await ensureCollection('toilet_hot')
  let added = 0
  let updated = 0
  let skipped = 0

  for (const item of HOT_DATA) {
    const name = (item.name || '').trim()
    if (!name) continue

    const exist = await db.collection('toilet_hot').where({ name }).count()
    if (exist.total > 0) {
      if (force) {
        const { _id, createTime, ...rest } = item
        await db.collection('toilet_hot').where({ name }).update({
          data: { ...rest, invalid: false }
        })
        updated++
      } else {
        skipped++
      }
      continue
    }

    await db.collection('toilet_hot').add({
      data: { ...item, invalid: false, createTime: db.serverDate() }
    })
    added++
  }

  return {
    code: 0,
    msg: 'ok',
    added,
    updated,
    skipped,
    total: HOT_DATA.length
  }
}