/**
 * 云函数 fixToiletLoc（一次性数据修复工具）
 * 用途：给 toiletAll 中缺失 loc 字段的存量记录补全 loc: db.Geo.Point(lng, lat)
 *       （geoNear 依赖 loc 字段 + 2dsphere 索引；补齐后 geoNear 才能命中存量数据，避免每次降级）
 *
 * 入参（均可选）：
 *  - deleteInvalid: true 时，对 lat/lng 非法、无法补全 loc 的记录执行删除（默认 false，仅列出不删除）
 *  - pageSize: 每页条数（云函数单次上限 1000，默认 1000）
 *
 * 调用方式（微信开发者工具控制台）：
 *   wx.cloud.callFunction({ name: 'fixToiletLoc' }).then(console.log)
 *   wx.cloud.callFunction({ name: 'fixToiletLoc', data: { deleteInvalid: true } }).then(console.log)
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function isValidCoordinate(lat, lng) {
  const la = Number(lat)
  const ln = Number(lng)
  return typeof la === 'number' && typeof ln === 'number' && !isNaN(la) && !isNaN(ln) &&
    la >= -90 && la <= 90 && ln >= -180 && ln <= 180
}

exports.main = async (event) => {
  const deleteInvalid = !!(event && event.deleteInvalid)
  const pageSize = Math.min(1000, Math.max(1, Number((event && event.pageSize) || 1000)))

  const summary = { scanned: 0, filled: 0, unfillable: 0, deleted: 0, failed: 0 }
  const unfillableList = []

  try {
    // 校验集合存在
    await db.collection('toiletAll').count()

    let offset = 0
    let page = 0
    while (page < 50) { // 最多扫 50 页（5 万条），防死循环
      const res = await db.collection('toiletAll')
        .where({ loc: _.exists(false) })
        .limit(pageSize)
        .skip(offset)
        .get()
      const docs = res.data || []
      if (!docs.length) break

      for (const doc of docs) {
        summary.scanned++
        const id = doc._id
        const lat = Number(doc.lat)
        const lng = Number(doc.lng)
        if (isValidCoordinate(lat, lng)) {
          try {
            await db.collection('toiletAll').doc(id).update({
              data: { loc: db.Geo.Point(lng, lat) }
            })
            summary.filled++
          } catch (err) {
            summary.failed++
            console.error('[fixToiletLoc] 补全 loc 失败', id, err)
          }
        } else {
          summary.unfillable++
          unfillableList.push({ _id: id, name: doc.name || '', lat: doc.lat, lng: doc.lng })
          if (deleteInvalid) {
            try {
              await db.collection('toiletAll').doc(id).remove()
              summary.deleted++
            } catch (err) {
              summary.failed++
              console.error('[fixToiletLoc] 删除非法记录失败', id, err)
            }
          }
        }
      }

      offset += docs.length
      page++
      if (docs.length < pageSize) break // 最后一页
    }

    return {
      code: 0,
      msg: deleteInvalid
        ? '已补全 loc，并删除非法记录'
        : '已补全 loc；存在无法补全的记录（未删除，请人工核对）',
      summary,
      unfillableList: unfillableList.slice(0, 50),
      unfillableTotal: unfillableList.length
    }
  } catch (err) {
    console.error('[fixToiletLoc] 执行失败（toiletAll 可能未创建）', err)
    return {
      code: 1,
      msg: '执行失败：' + ((err && err.errMsg) || (err && err.message) || err),
      summary
    }
  }
}