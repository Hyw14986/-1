/**
 * 云函数 initData
 * 初始化演示数据：向 toilet 集合写入覆盖全国主要城市的公厕点位
 * 幂等：若已存在 source='seed' 的数据则跳过，避免重复导入
 * 调用方式：event.force = true 可强制重新导入
 *
 * 数据来源说明：
 * - 湖北武汉汉阳区 21 座：武汉市汉阳区城管执法局《延时开放公厕》官方名录（24小时开放19座、6:00-24:00开放2座）
 * - 湖北宜昌/襄阳等：当地公共数据平台/公开地图地址，坐标为地标级精度
 * - 广东东莞黄江 12 座：《黄江镇公厕管理维护服务项目用户需求书》官方归集表，坐标为官方提供
 * - 广东广州/深圳/佛山/珠海等：公开地图与媒体报道的真实公厕地址，坐标为地标级精度
 * - 其他城市：城市地标附近粗略点位，仅供演示
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 演示用便利店品牌池（附近买纸功能）
const STORE_NAMES = ['美宜佳便利店', '天福便利店', '喜市多便利店', '7-11便利店', '罗森便利店', '全家便利店']

/**
 * 为演示公厕补充「蹲位状态」与「附近便利店」信息（地标级精度）
 * @param {object} toilet 公厕数据（用于生成便利店坐标）
 * @param {number} index 序号
 */
function buildSeedPatch(toilet, index) {
  // 蹲位状态：约 1/3 为紧张，其余充足
  const seatStatus = index % 3 === 2 ? 'busy' : 'free'
  const storeName = STORE_NAMES[index % STORE_NAMES.length]
  return {
    seatStatus,
    nearStore: {
      name: storeName,
      address: toilet.address || '',
      // 便利店坐标：在原公厕坐标基础上偏移 200~500 米
      latitude: (toilet.latitude || 0) + 0.0015 + (index % 4) * 0.0008,
      longitude: (toilet.longitude || 0) + 0.002,
      distanceText: (200 + (index % 4) * 100) + 'm'
    }
  }
}

// 演示数据：覆盖全国主要城市的公共厕所（湖北/广东为真实地址，坐标为地标级精度）
const SEED_TOILETS = [
  // ========== 华中·湖北（真实地址） ==========
  // ---- 武汉·汉阳区（官方名录） ----
  { name: '摩尔城公厕', address: '湖北省武汉市汉阳区王家湾摩尔城对面（龙阳大道特6号）', latitude: 30.5610, longitude: 114.2085, openTime: '全天开放', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.6, ratingCount: 18 },
  { name: '红光村128号公厕', address: '湖北省武汉市汉阳区红光村红光路玻璃厂一号内', latitude: 30.5595, longitude: 114.2160, openTime: '全天开放', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.3, ratingCount: 9 },
  { name: '通达加油站公厕', address: '湖北省武汉市汉阳区汉阳大道622号通达加油站内', latitude: 30.5588, longitude: 114.2285, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.2, ratingCount: 11 },
  { name: '肖家湾公厕', address: '湖北省武汉市汉阳区肖家湾井岗村72号对面', latitude: 30.5555, longitude: 114.2360, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.0, ratingCount: 7 },
  { name: '栖贤路公厕', address: '湖北省武汉市汉阳区汉阳大道栖贤路特1号', latitude: 30.5610, longitude: 114.2535, openTime: '全天开放', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.4, ratingCount: 13 },
  { name: '汉阳公园公厕', address: '湖北省武汉市汉阳区汉阳公园内（汉阳大道莲花湖旁）', latitude: 30.5510, longitude: 114.2680, openTime: '全天开放', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.5, ratingCount: 16 },
  { name: '红建村公厕', address: '湖北省武汉市汉阳区桥机嘉园红建村87号对面', latitude: 30.5470, longitude: 114.2440, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.1, ratingCount: 8 },
  { name: '红建村101号公厕', address: '湖北省武汉市汉阳区红建村社区红建村335号后面', latitude: 30.5465, longitude: 114.2430, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.2, ratingCount: 10 },
  { name: '红建村102号公厕', address: '湖北省武汉市汉阳区红建村社区红建村38号旁', latitude: 30.5455, longitude: 114.2455, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.0, ratingCount: 6 },
  { name: '芳草路公厕', address: '湖北省武汉市汉阳区四新大道与芳草西路交汇处', latitude: 30.5400, longitude: 114.2280, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 3.9, ratingCount: 5 },
  { name: '龟北路公厕', address: '湖北省武汉市汉阳区龟山北路创意园大门旁', latitude: 30.5588, longitude: 114.2695, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 4.0, ratingCount: 7 },
  { name: '区文体局公厕', address: '湖北省武汉市汉阳区墨水湖北路汉阳全民健身中心旁', latitude: 30.5510, longitude: 114.2305, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 4.1, ratingCount: 8 },
  { name: '江城大道公厕', address: '湖北省武汉市汉阳区江城大道与墨水湖北路交汇处', latitude: 30.5480, longitude: 114.2240, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 3.8, ratingCount: 4 },
  { name: '马沧湖路公厕', address: '湖北省武汉市汉阳区马沧湖路武汉卫民门诊部42号对面', latitude: 30.5460, longitude: 114.2400, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 3.9, ratingCount: 6 },
  { name: '龙江路公厕', address: '湖北省武汉市汉阳区龙江路2号旁', latitude: 30.5485, longitude: 114.2365, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 3.8, ratingCount: 5 },
  { name: '汉南路中段公厕', address: '湖北省武汉市汉阳区汉南路中段', latitude: 30.5490, longitude: 114.2720, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 3.7, ratingCount: 3 },
  { name: '月湖桥旁公厕', address: '湖北省武汉市汉阳区月湖桥下知音大道东侧', latitude: 30.5595, longitude: 114.2540, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 4.0, ratingCount: 7 },
  { name: '四新南路公厕', address: '湖北省武汉市汉阳区四新南路与江城大道交汇处', latitude: 30.5300, longitude: 114.2245, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 3.8, ratingCount: 4 },
  { name: '墨水湖南路公厕', address: '湖北省武汉市汉阳区墨水湖南路中段', latitude: 30.5340, longitude: 114.2430, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 3.9, ratingCount: 5 },
  { name: '陶家岭公厕', address: '湖北省武汉市汉阳区龙阳湖北路生鲜市场旁', latitude: 30.5620, longitude: 114.2060, openTime: '06:00-24:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.3, ratingCount: 12 },
  { name: '长江大桥汉阳桥头公厕', address: '湖北省武汉市汉阳区长江大桥汉阳桥头车站旁', latitude: 30.5500, longitude: 114.2840, openTime: '06:00-24:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.2, ratingCount: 10 },
  // ---- 武汉·其他区 ----
  { name: '光荣坊社区公厕', address: '湖北省武汉市江岸区解放大道1427附15号（西马街道光荣坊社区）', latitude: 30.6260, longitude: 114.2910, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.1, ratingCount: 9 },
  { name: '黄埔人家公厕', address: '湖北省武汉市江岸区二七北路75号', latitude: 30.6340, longitude: 114.3050, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.0, ratingCount: 6 },
  { name: '西北湖2号公厕', address: '湖北省武汉市江汉区西北湖（建设大道）', latitude: 30.5995, longitude: 114.2640, openTime: '全天开放', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.5, ratingCount: 15 },
  { name: '茶港小游园公厕', address: '湖北省武汉市武昌区茶港小游园（东湖路）', latitude: 30.5460, longitude: 114.3560, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.2, ratingCount: 8 },
  { name: '江汉路步行街公厕', address: '湖北省武汉市江汉区江汉路步行街', latitude: 30.5830, longitude: 114.2930, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.5, ratingCount: 20 },
  { name: '东湖绿道公厕', address: '湖北省武汉市武昌区东湖绿道', latitude: 30.5580, longitude: 114.3860, openTime: '06:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 4.2, ratingCount: 9 },
  // ---- 宜昌 ----
  { name: '滨江公园公厕', address: '湖北省宜昌市西陵区沿江大道98号滨江公园', latitude: 30.6914, longitude: 111.2856, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.4, ratingCount: 14 },
  { name: '夷陵广场公厕', address: '湖北省宜昌市西陵区夷陵广场', latitude: 30.6915, longitude: 111.2860, openTime: '06:00-23:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.3, ratingCount: 11 },
  { name: '二十七中公厕', address: '湖北省宜昌市点军区江南大道二十七中旁', latitude: 30.6750, longitude: 111.2520, openTime: '06:00-22:00', hasAccessible: false, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 3.9, ratingCount: 5 },
  { name: '宜昌东站公厕', address: '湖北省宜昌市伍家岗区城东大道宜昌东站广场', latitude: 30.6580, longitude: 111.3630, openTime: '全天开放', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.5, ratingCount: 17 },
  // ---- 襄阳 ----
  { name: '昭明台公厕', address: '湖北省襄阳市襄城区北街昭明台旁', latitude: 32.0180, longitude: 112.1390, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.4, ratingCount: 13 },
  { name: '磁器街公厕', address: '湖北省襄阳市樊城区磁器街路口', latitude: 32.0410, longitude: 112.1390, openTime: '06:00-22:00', hasAccessible: false, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 3.9, ratingCount: 6 },
  { name: '胜利街公厕', address: '湖北省襄阳市襄城区胜利街218号', latitude: 32.0120, longitude: 112.1430, openTime: '06:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.0, ratingCount: 7 },
  { name: '诸葛亮广场公厕', address: '湖北省襄阳市樊城区长虹路诸葛亮广场', latitude: 32.0570, longitude: 112.1170, openTime: '全天开放', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.5, ratingCount: 16 },
  // ---- 黄石/荆州/孝感/鄂州 ----
  { name: '团城山公园公厕', address: '湖北省黄石市下陆区团城山公园', latitude: 30.2060, longitude: 115.0390, openTime: '06:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.1, ratingCount: 8 },
  { name: '黄石港江滩公厕', address: '湖北省黄石市黄石港区沿江大道江滩公园', latitude: 30.2430, longitude: 115.0760, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.2, ratingCount: 10 },
  { name: '宾阳楼公厕', address: '湖北省荆州市荆州区荆州古城东门宾阳楼', latitude: 30.3520, longitude: 112.2030, openTime: '08:00-21:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.3, ratingCount: 12 },
  { name: '沙市中山路公厕', address: '湖北省荆州市沙市区中山路步行街', latitude: 30.3240, longitude: 112.2470, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 4.0, ratingCount: 7 },
  { name: '董永公园公厕', address: '湖北省孝感市孝南区董永公园', latitude: 30.9300, longitude: 113.9100, openTime: '06:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.1, ratingCount: 8 },
  { name: '西山公园公厕', address: '湖北省鄂州市鄂城区西山风景区', latitude: 30.3950, longitude: 114.8900, openTime: '08:00-21:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.2, ratingCount: 9 },

  // ========== 华南·广东（真实地址） ==========
  // ---- 广州 ----
  { name: '花城广场东区公厕', address: '广东省广州市天河区花城广场东侧', latitude: 23.12267, longitude: 113.32526, openTime: '全天开放', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.8, ratingCount: 23 },
  { name: '广州塔西广场公厕', address: '广东省广州市海珠区广州塔西广场', latitude: 23.1065, longitude: 113.3245, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: false, rating: 4.5, ratingCount: 15 },
  { name: '天河城广场公厕', address: '广东省广州市天河区天河路208号', latitude: 23.13219, longitude: 113.31879, openTime: '10:00-22:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: false, isFree: true, rating: 4.4, ratingCount: 19 },
  { name: '越秀公园公厕', address: '广东省广州市越秀区解放北路988号越秀公园内', latitude: 23.1416, longitude: 113.2648, openTime: '06:00-22:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.6, ratingCount: 21 },
  { name: '北京路步行街公厕', address: '广东省广州市越秀区北京路步行街', latitude: 23.1269, longitude: 113.2711, openTime: '09:00-22:30', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.3, ratingCount: 14 },
  { name: '上下九步行街公厕', address: '广东省广州市荔湾区上下九步行街', latitude: 23.1180, longitude: 113.2440, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 4.1, ratingCount: 10 },
  { name: '白云山南门公厕', address: '广东省广州市白云区白云山风景名胜区南门', latitude: 23.1780, longitude: 113.2990, openTime: '06:00-21:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.4, ratingCount: 13 },
  // ---- 深圳 ----
  { name: '市民中心广场公厕', address: '广东省深圳市福田区市民中心', latitude: 22.5431, longitude: 114.0579, openTime: '06:00-23:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.7, ratingCount: 26 },
  { name: '深圳湾公园公厕', address: '广东省深圳市南山区深圳湾公园', latitude: 22.5067, longitude: 113.9494, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 4.3, ratingCount: 12 },
  { name: '荔枝公园公厕', address: '广东省深圳市福田区红岭中路1001号荔枝公园', latitude: 22.5458, longitude: 114.1020, openTime: '06:00-23:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.6, ratingCount: 22 },
  { name: '莲花山公园公厕', address: '广东省深圳市福田区莲花山公园', latitude: 22.5530, longitude: 114.0590, openTime: '06:00-22:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.5, ratingCount: 18 },
  { name: '东门步行街公厕', address: '广东省深圳市罗湖区东门步行街', latitude: 22.5480, longitude: 114.1270, openTime: '09:00-23:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.2, ratingCount: 11 },
  { name: '马家龙公厕', address: '广东省深圳市南山区马家龙街角', latitude: 22.5440, longitude: 113.9440, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 4.1, ratingCount: 9 },
  // ---- 佛山 ----
  { name: '新明一路公厕', address: '广东省佛山市禅城区新明一路22号23座旁', latitude: 23.0040, longitude: 113.1210, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.1, ratingCount: 8 },
  { name: '陈村镇政府公厕', address: '广东省佛山市顺德区陈村镇政府旁镇西广场', latitude: 22.9550, longitude: 113.2010, openTime: '06:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.2, ratingCount: 10 },
  { name: '金澜南路公厕', address: '广东省佛山市禅城区金澜南路广龙商厦南侧', latitude: 23.0005, longitude: 113.1260, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 3.9, ratingCount: 6 },
  { name: '顺峰山公园公厕', address: '广东省佛山市顺德区大良街道顺峰山公园', latitude: 22.8220, longitude: 113.2700, openTime: '06:00-22:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.5, ratingCount: 16 },
  // ---- 东莞·黄江（官方归集表） ----
  { name: '黄江公厕01（嘉荣广场）', address: '广东省东莞市黄江镇嘉荣广场', latitude: 22.9180, longitude: 114.01048, openTime: '全天开放', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.4, ratingCount: 15 },
  { name: '黄江公厕05（大家乐广场）', address: '广东省东莞市黄江镇大家乐广场', latitude: 22.9144, longitude: 113.9953, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.1, ratingCount: 9 },
  { name: '黄江公厕09（田美向南六街）', address: '广东省东莞市黄江镇田美向南六街', latitude: 22.9172, longitude: 114.03345, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.0, ratingCount: 7 },
  { name: '黄江公厕10（板湖公园）', address: '广东省东莞市黄江镇板湖村板湖公园', latitude: 22.92684, longitude: 114.03007, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.2, ratingCount: 11 },
  { name: '黄江公厕11（玉堂围旧围）', address: '广东省东莞市黄江镇玉堂围旧围', latitude: 22.98964, longitude: 114.01453, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.1, ratingCount: 8 },
  { name: '黄江公厕14（社贝路）', address: '广东省东莞市黄江镇社贝路', latitude: 22.92933, longitude: 114.04049, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.0, ratingCount: 6 },
  { name: '黄江公厕17（袁屋围水文街）', address: '广东省东莞市黄江镇袁屋围水文街', latitude: 22.9048, longitude: 114.00581, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 3.9, ratingCount: 5 },
  { name: '黄江公厕21（鸡啼岗正扬厂对面）', address: '广东省东莞市黄江镇鸡啼岗正扬厂对面绿化带', latitude: 22.90633, longitude: 114.02135, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 3.8, ratingCount: 4 },
  { name: '黄江公厕23（北岸社区中心广场）', address: '广东省东莞市黄江镇北岸社区中心广场', latitude: 22.89119, longitude: 114.00814, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 3.9, ratingCount: 5 },
  { name: '黄江公厕24（江兴路公园）', address: '广东省东莞市黄江镇黄江村江兴路公园', latitude: 22.88379, longitude: 114.00293, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.0, ratingCount: 7 },
  { name: '黄江公厕27（田心广场南侧）', address: '广东省东莞市黄江镇田心广场南侧', latitude: 22.83581, longitude: 113.97467, openTime: '全天开放', hasAccessible: false, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 3.9, ratingCount: 5 },
  { name: '黄江公厕36（星光村公园）', address: '广东省东莞市黄江镇星光村公园', latitude: 22.82399, longitude: 113.95510, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.1, ratingCount: 8 },
  // ---- 珠海 ----
  { name: '粤华路公厕', address: '广东省珠海市香洲区粤华路208号旁', latitude: 22.2290, longitude: 113.5390, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.1, ratingCount: 9 },
  { name: '长沙新苑公厕', address: '广东省珠海市香洲区明珠北路388号长沙新苑', latitude: 22.2760, longitude: 113.5260, openTime: '06:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.0, ratingCount: 7 },
  { name: '海滨泳场公厕', address: '广东省珠海市香洲区情侣中路86号海滨泳场', latitude: 22.2430, longitude: 113.5785, openTime: '08:00-21:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.5, ratingCount: 15 },
  // ---- 惠州/中山/湛江 ----
  { name: '惠州西湖公厕', address: '广东省惠州市惠城区惠州西湖景区', latitude: 23.0940, longitude: 114.4000, openTime: '06:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.4, ratingCount: 13 },
  { name: '红花湖公厕', address: '广东省惠州市惠城区红花湖景区', latitude: 23.0750, longitude: 114.3900, openTime: '06:00-21:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.2, ratingCount: 10 },
  { name: '孙文西路步行街公厕', address: '广东省中山市石岐街道孙文西路步行街', latitude: 22.5180, longitude: 113.3850, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.2, ratingCount: 11 },
  { name: '金沙湾观海长廊公厕', address: '广东省湛江市赤坎区金沙湾观海长廊', latitude: 21.2540, longitude: 110.4000, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.3, ratingCount: 12 },

  // ========== 其他城市（地标附近粗略点位） ==========
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
  { name: '西湖断桥公厕', address: '浙江省杭州市西湖区北山街断桥', latitude: 30.2590, longitude: 120.1480, openTime: '06:00-22:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.7, ratingCount: 27 },
  { name: '河坊街公厕', address: '浙江省杭州市上城区河坊街', latitude: 30.2380, longitude: 120.1680, openTime: '09:00-22:00', hasAccessible: false, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.1, ratingCount: 9 },
  { name: '新街口地铁站公厕', address: '江苏省南京市玄武区新街口地铁站', latitude: 32.0410, longitude: 118.7790, openTime: '05:30-23:30', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.5, ratingCount: 21 },
  { name: '夫子庙公厕', address: '江苏省南京市秦淮区夫子庙', latitude: 32.0200, longitude: 118.7870, openTime: '08:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.4, ratingCount: 17 },
  { name: '观前街公厕', address: '江苏省苏州市姑苏区观前街', latitude: 31.3130, longitude: 120.6280, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.3, ratingCount: 13 },
  { name: '五四广场公厕', address: '山东省青岛市市南区五四广场', latitude: 36.0620, longitude: 120.3860, openTime: '全天开放', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.4, ratingCount: 13 },
  { name: '中山路步行街公厕', address: '福建省厦门市思明区中山路', latitude: 24.4510, longitude: 118.0770, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.3, ratingCount: 10 },
  { name: '三坊七巷公厕', address: '福建省福州市鼓楼区三坊七巷', latitude: 26.0810, longitude: 119.2960, openTime: '08:30-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 4.1, ratingCount: 8 },
  // ---------- 华中·其他 ----------
  { name: '五一广场公厕', address: '湖南省长沙市芙蓉区五一广场', latitude: 28.1940, longitude: 112.9730, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: true, hasToiletPaper: true, isFree: true, rating: 4.4, ratingCount: 15 },
  { name: '二七纪念塔公厕', address: '河南省郑州市二七区二七广场', latitude: 34.7480, longitude: 113.6620, openTime: '08:00-21:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.0, ratingCount: 7 },
  { name: '八一广场公厕', address: '江西省南昌市东湖区八一广场', latitude: 28.6820, longitude: 115.8579, openTime: '06:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: true, isFree: true, rating: 4.1, ratingCount: 8 },
  { name: '淮河路步行街公厕', address: '安徽省合肥市庐阳区淮河路步行街', latitude: 31.8640, longitude: 117.2890, openTime: '09:00-22:00', hasAccessible: true, hasBabyCare: false, hasToiletPaper: false, isFree: true, rating: 3.9, ratingCount: 6 },
  // ---------- 华南·其他 ----------
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

/**
 * 确保基础集合存在（不存在则创建）
 * 云函数端可用 db.createCollection 创建集合，避免客户端直接读取时报 collection not exists
 * @returns {string[]} 本次新建的集合名列表
 */
async function ensureCollections() {
  const created = []
  for (const name of ['toilet', 'comment', 'user']) {
    try {
      await db.createCollection(name)
      created.push(name)
    } catch (err) {
      // 集合已存在会抛错，属正常情况，忽略
    }
  }
  return created
}

exports.main = async (event) => {
  const force = !!(event && event.force)

  // 自动创建基础集合（已存在则跳过），再执行导入
  const created = await ensureCollections()

  // 幂等判断：已存在种子数据则跳过
  const existRes = await db.collection('toilet').where({ source: 'seed' }).count()
  if (existRes.total > 0 && !force) {
    // 已存在演示数据：增量补齐新字段（蹲位状态 / 附近便利店），无需强制重导
    const missingRes = await db
      .collection('toilet')
      .where({ source: 'seed', seatStatus: _.exists(false) })
      .limit(100)
      .get()
    if (missingRes.data.length) {
      let patched = 0
      for (const doc of missingRes.data) {
        await db.collection('toilet').doc(doc._id).update({
          data: buildSeedPatch(doc, patched)
        })
        patched += 1
      }
      return {
        code: 3,
        msg: '已补齐演示数据新字段（蹲位状态/附近便利店）',
        patched
      }
    }
    return {
      code: 2,
      msg: '已存在演示数据，跳过导入（如需强制重新导入请传 force=true）',
      existed: existRes.total
    }
  }

  // 批量写入（含蹲位状态与附近便利店信息）
  let inserted = 0
  for (let i = 0; i < SEED_TOILETS.length; i++) {
    const toilet = SEED_TOILETS[i]
    await db.collection('toilet').add({
      data: {
        ...toilet,
        ...buildSeedPatch(toilet, i),
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
    inserted,
    createdCollections: created
  }
}