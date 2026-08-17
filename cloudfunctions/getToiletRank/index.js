/**
 * 云函数 getToiletRank 公厕排行榜
 * 返回两个榜单：
 *  - hot   ：全网人气榜，读取 toilet_hot 种子数据（网络公开报道的网红/最美公厕）
 *  - nation：全国综合榜，toiletAll 全国点位按「评分/评价数/点赞数/图片」综合热度排序（固定 50 名）
 * 入参：{ limit } 可选，默认 50，最大 100
 * 输出：{ code, msg, data: { hot: [], nation: [] } }
 * 容错：两个榜单互不影响，任一数据源异常仅返回空列表并打印完整错误。
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

/** 保留 1 位小数 */
function round1(num) {
  const n = Number(num)
  if (!isFinite(n)) return 0
  return Math.round(n * 10) / 10
}

/** 从设施字段生成标签 */
function makeTags(t) {
  const tags = []
  if (!t) return tags
  if (t.hasPaper) tags.push('有纸巾')
  if (t.isBarrierFree) tags.push('无障碍')
  if (t.hasBabyRoom) tags.push('母婴室')
  if (t.isOpen24h) tags.push('24小时')
  if (t.feeType === 'free' || !t.isCharge) tags.push('免费')
  return tags
}

/** 读取全网人气榜（toilet_hot） */
async function loadHot(limit) {
  try {
    const res = await db.collection('toilet_hot')
      .where({ invalid: _.neq(true) })
      .orderBy('seedScore', 'desc')
      .limit(limit)
      .get()
    return (res.data || []).map((t) => ({
      _id: t._id,
      name: t.name,
      city: t.city || '',
      address: t.address || '',
      lat: t.lat,
      lng: t.lng,
      score: round1(t.seedScore),
      userCount: 0,
      hotDesc: t.hotDesc || '',
      reviews: (t.reviews || []).slice(0, 3),
      tags: t.tags || [],
      photoUrls: (t.photoUrls || []).slice(0, 3),
      source: 'hot'
    }))
  } catch (err) {
    console.error('[getToiletRank] 人气榜读取失败（完整错误）', err)
    return []
  }
}

/**
 * 读取全国综合榜（toiletAll 全国有效点位，按综合热度排序）
 * 综合热度 = 评分加权 + 评价数 + 点赞数 + 有图加成，优先展示「有人评过/被赞过/带图」的厕所，
 * 全部 0 分点位也能正常上榜（按城市/名称稳定排序），保证榜单始终有 50 名可展示。
 */
async function loadNation(limit) {
  try {
    const where = { invalid: _.neq(true) }
    // 1. 分页拉取全国有效点位（上限 3000，覆盖全国导入数据）
    const candidates = []
    const MAX_CANDIDATES = 3000
    const pageSize = 1000
    let skip = 0
    while (candidates.length < MAX_CANDIDATES) {
      const res = await db.collection('toiletAll').where(where)
        .field({
          name: true, city: true, district: true, address: true, lat: true, lng: true,
          source: true, rating: true, ratingCount: true, photoUrls: true,
          hasPaper: true, isCharge: true, isBarrierFree: true, hasBabyRoom: true,
          isOpen24h: true, openTime: true, auditStatus: true
        })
        .skip(skip).limit(pageSize).get()
      const data = (res.data || []).filter((t) => {
        const s = t.auditStatus
        return s !== 'pending' && s !== 'reject'
      })
      candidates.push(...data)
      if ((res.data || []).length < pageSize) break
      skip += (res.data || []).length
    }

    // 2. 聚合点赞数（toilet_like 按 toiletId 分组）
    const likeMap = {}
    try {
      const ids = candidates.map((t) => t._id)
      const likeAgg = await db.collection('toilet_like')
        .where({ toiletId: _.in(ids.slice(0, 500)) })
        .aggregate()
        .group({ _id: '$toiletId', count: $.sum(1) })
        .end()
      ;(likeAgg.list || []).forEach((g) => { likeMap[g._id] = g.count || 0 })
    } catch (err) {
      console.warn('[getToiletRank] 点赞数聚合失败（忽略，按 0 处理）', (err && err.errMsg) || err)
    }

    // 3. 综合热度分 + 排序
    const list = candidates.map((t) => {
      const rating = Number(t.rating) || 0
      const ratingCount = Number(t.ratingCount) || 0
      const likes = likeMap[t._id] || 0
      const photos = Array.isArray(t.photoUrls) ? t.photoUrls.filter((u) => !!u) : []
      const heat = rating * 8
        + Math.min(ratingCount, 500) * 0.02
        + Math.min(likes, 500) * 0.05
        + (photos.length ? 0.5 : 0)
      return {
        _id: t._id,
        name: t.name || '未命名公厕',
        city: t.city || '',
        district: t.district || '',
        address: t.address || '',
        lat: Number(t.lat) || 0,
        lng: Number(t.lng) || 0,
        score: round1(rating),
        ratingCount,
        likes,
        heat,
        hotDesc: '',
        reviews: [],
        tags: makeTags(t),
        photoUrls: photos.slice(0, 3),
        source: t.source || 'gov'
      }
    })

    list.sort((a, b) =>
      b.heat - a.heat
      || b.ratingCount - a.ratingCount
      || b.likes - a.likes
      || (a.city + a.name).localeCompare(b.city + b.name, 'zh-Hans-CN')
    )
    // 全国综合榜固定 50 名（用户要求：排行榜有 50）
    return list.slice(0, Math.min(limit, 50))
  } catch (err) {
    console.error('[getToiletRank] 全国综合榜读取失败（完整错误）', err)
    return []
  }
}

exports.main = async (event) => {
  const limit = Math.min(parseInt((event && event.limit) || 50, 10) || 50, 100)

  const [hot, nation] = await Promise.all([loadHot(limit), loadNation(limit)])
  console.log('[getToiletRank] 人气榜条数=', hot.length, '全国综合榜条数=', nation.length)
  return { code: 0, msg: 'ok', data: { hot, nation } }
}