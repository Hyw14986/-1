/**
 * 云函数 initData
 * 初始化演示数据：向 toilet 集合写入覆盖全国主要城市的公厕点位
 * 幂等：若已存在 source='seed' 的数据则跳过，避免重复导入
 * 调用方式：event.force = true 可强制重新导入
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 演示数据：覆盖全国主要城市的公共厕所（坐标为城市地标附近，仅供演示）
const SEED_TOILETS = [
  // ---------- 华北 ----------
  { name: '天安门广场东侧公厕', address: '北京市东城区天安门广场东侧', latitude: 39.9076, longitude: 116.3989, openTime: '06:00-22:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.7, ratingCount: 28 },
  { name: '王府井大街公厕', address: '北京市东城区王府井大街', latitude: 39.9163, longitude: 116.4108, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.4, ratingCount: 16 },
  { name: '和平路步行街公厕', address: '天津市和平区和平路步行街', latitude: 39.1290, longitude: 117.2000, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.2, ratingCount: 9 },
  { name: '中山桥北侧公厕', address: '甘肃省兰州市城关区中山桥北侧', latitude: 36.0645, longitude: 103.8126, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 3.9, ratingCount: 7 },

  // ---------- 东北 ----------
  { name: '中央大街公厕', address: '黑龙江省哈尔滨市道里区中央大街', latitude: 45.7700, longitude: 126.6180, openTime: '全天开放', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.6, ratingCount: 21 },
  { name: '圣索菲亚教堂公厕', address: '黑龙江省哈尔滨市道里区透笼街', latitude: 45.7690, longitude: 126.6250, openTime: '08:30-20:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 4.1, ratingCount: 8 },
  { name: '中街步行街公厕', address: '辽宁省沈阳市沈河区中街', latitude: 41.7980, longitude: 123.4530, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.3, ratingCount: 14 },
  { name: '星海广场公厕', address: '辽宁省大连市沙河口区星海广场', latitude: 38.8930, longitude: 121.5910, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.5, ratingCount: 18 },

  // ---------- 华东 ----------
  { name: '人民广场地铁站公厕', address: '上海市黄浦区人民广场地铁站', latitude: 31.2304, longitude: 121.4737, openTime: '05:30-23:30', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.8, ratingCount: 32 },
  { name: '外滩观光平台公厕', address: '上海市黄浦区中山东一路外滩', latitude: 31.2400, longitude: 121.4900, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.6, ratingCount: 24 },
  { name: '花城广场东区公厕', address: '广东省广州市天河区花城广场东侧', latitude: 23.12267, longitude: 113.32526, openTime: '全天开放', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.8, ratingCount: 23 },
  { name: '广州塔西广场公厕', address: '广东省广州市海珠区广州塔西广场', latitude: 23.1065, longitude: 113.3245, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: false, rating: 4.5, ratingCount: 15 },
  { name: '天河城广场公厕', address: '广东省广州市天河区天河路208号', latitude: 23.13219, longitude: 113.31879, openTime: '10:00-22:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: false, isFree: true, rating: 4.4, ratingCount: 19 },
  { name: '市民中心广场公厕', address: '广东省深圳市福田区市民中心', latitude: 22.5431, longitude: 114.0579, openTime: '06:00-23:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.7, ratingCount: 26 },
  { name: '深圳湾公园公厕', address: '广东省深圳市南山区深圳湾公园', latitude: 22.5067, longitude: 113.9494, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 4.3, ratingCount: 12 },
  { name: '西湖断桥公厕', address: '浙江省杭州市西湖区北山街断桥', latitude: 30.2590, longitude: 120.1480, openTime: '06:00-22:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.7, ratingCount: 27 },
  { name: '河坊街公厕', address: '浙江省杭州市上城区河坊街', latitude: 30.2380, longitude: 120.1680, openTime: '09:00-22:00', hasAccessible: false, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.0, ratingCount: 6 },
  { name: '新街口地铁站公厕', address: '江苏省南京市玄武区新街口地铁站', latitude: 32.0410, longitude: 118.7790, openTime: '05:30-23:30', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.6, ratingCount: 22 },
  { name: '夫子庙公厕', address: '江苏省南京市秦淮区夫子庙', latitude: 32.0200, longitude: 118.7870, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.2, ratingCount: 11 },
  { name: '观前街公厕', address: '江苏省苏州市姑苏区观前街', latitude: 31.3130, longitude: 120.6280, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.5, ratingCount: 17 },
  { name: '五四广场公厕', address: '山东省青岛市市南区五四广场', latitude: 36.0620, longitude: 120.3860, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.4, ratingCount: 13 },
  { name: '中山路步行街公厕', address: '福建省厦门市思明区中山路', latitude: 24.4510, longitude: 118.0770, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.3, ratingCount: 10 },
  { name: '三坊七巷公厕', address: '福建省福州市鼓楼区三坊七巷', latitude: 26.0810, longitude: 119.2960, openTime: '08:30-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 4.1, ratingCount: 8 },

  // ---------- 华中 ----------
  { name: '江汉路步行街公厕', address: '湖北省武汉市江汉区江汉路', latitude: 30.5830, longitude: 114.2930, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.5, ratingCount: 20 },
  { name: '东湖绿道公厕', address: '湖北省武汉市武昌区东湖绿道', latitude: 30.5580, longitude: 114.3860, openTime: '06:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 4.2, ratingCount: 9 },
  { name: '五一广场公厕', address: '湖南省长沙市芙蓉区五一广场', latitude: 28.1940, longitude: 112.9730, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.4, ratingCount: 15 },
  { name: '二七纪念塔公厕', address: '河南省郑州市二七区二七广场', latitude: 34.7480, longitude: 113.6620, openTime: '08:00-21:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.0, ratingCount: 7 },
  { name: '八一广场公厕', address: '江西省南昌市东湖区八一广场', latitude: 28.6820, longitude: 115.8579, openTime: '06:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.1, ratingCount: 8 },
  { name: '淮河路步行街公厕', address: '安徽省合肥市庐阳区淮河路步行街', latitude: 31.8640, longitude: 117.2890, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 3.9, ratingCount: 6 },

  // ---------- 华南 ----------
  { name: '朝阳广场公厕', address: '广西壮族自治区南宁市兴宁区朝阳广场', latitude: 22.8170, longitude: 108.3665, openTime: '06:00-23:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.1, ratingCount: 9 },
  { name: '骑楼老街公厕', address: '海南省海口市龙华区骑楼老街', latitude: 20.0440, longitude: 110.3500, openTime: '09:00-22:00', hasAccessible: false, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 3.8, ratingCount: 5 },

  // ---------- 西南 ----------
  { name: '天府广场地铁站公厕', address: '四川省成都市青羊区天府广场', latitude: 30.6570, longitude: 104.0668, openTime: '05:30-23:30', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.7, ratingCount: 25 },
  { name: '宽窄巷子公厕', address: '四川省成都市青羊区宽窄巷子', latitude: 30.6690, longitude: 104.0560, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.4, ratingCount: 14 },
  { name: '解放碑步行街公厕', address: '重庆市渝中区解放碑步行街', latitude: 29.5569, longitude: 106.5774, openTime: '全天开放', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.6, ratingCount: 22 },
  { name: '洪崖洞公厕', address: '重庆市渝中区嘉陵江滨江路洪崖洞', latitude: 29.5622, longitude: 106.5792, openTime: '10:00-23:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: false, isFree: false, rating: 4.2, ratingCount: 12 },
  { name: '翠湖公园公厕', address: '云南省昆明市五华区翠湖公园', latitude: 25.0400, longitude: 102.7000, openTime: '07:00-21:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.3, ratingCount: 11 },
  { name: '甲秀楼公厕', address: '贵州省贵阳市南明区甲秀楼', latitude: 26.6470, longitude: 106.6860, openTime: '08:00-21:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 4.0, ratingCount: 7 },

  // ---------- 西北 ----------
  { name: '钟楼广场公厕', address: '陕西省西安市碑林区钟楼广场', latitude: 34.2610, longitude: 108.9420, openTime: '全天开放', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.6, ratingCount: 23 },
  { name: '大雁塔北广场公厕', address: '陕西省西安市雁塔区大雁塔北广场', latitude: 34.2180, longitude: 108.9640, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.4, ratingCount: 16 },
  { name: '人民广场公厕', address: '新疆维吾尔自治区乌鲁木齐市天山区人民广场', latitude: 43.7940, longitude: 87.6150, openTime: '08:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.0, ratingCount: 8 },
  { name: '布达拉宫广场公厕', address: '西藏自治区拉萨市城关区布达拉宫广场', latitude: 29.6540, longitude: 91.1180, openTime: '09:00-18:00', hasAccessible: false, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 4.3, ratingCount: 10 }
]

exports.main = async (event) => {
  const force = !!(event && event.force)

  // 幂等判断：已存在种子数据则跳过
  const existRes = await db.collection('toilet').where({ source: 'seed' }).count()
  if (existRes.total > 0 && !force) {
    return {
      code: 2,
      msg: '已存在演示数据，跳过导入（如需强制重新导入请传 force=true）',
      existed: existRes.total
    }
  }

  // 批量写入
  let inserted = 0
  for (const toilet of SEED_TOILETS) {
    await db.collection('toilet').add({
      data: {
        ...toilet,
        photos: [],
        status: 1,
        source: 'seed',
        createTime: db.serverDate()
      }
    })
    inserted += 1
  }

  return {
    code: 0,
    msg: '演示数据导入成功',
    inserted
  }
}
