/**
 * 全网人气公厕种子数据（排行榜「全网人气榜」数据源）· 共 100 条
 * 来源：2024-2026 网络公开报道（澎湃新闻、工人日报、南方网、海南卫视、环卫在线网、
 *       腾讯新闻、今日头条、小红书城市观察等）盘点的网红 / 最美 / 高口碑公厕
 * 坐标为人均城市级近似值（GCJ-02），仅用于展示与一键前往定位
 * 字段说明：
 *  - name 公厕名称
 *  - city 所在城市（展示用）
 *  - address 详细地址（展示用）
 *  - lat/lng 近似坐标（GCJ-02）
 *  - seedScore 网络口碑分（5 分制，排行榜排序依据）
 *  - hotDesc 上榜理由（一句话简介）
 *  - reviews 网络评价摘录（榜单卡片 / 弹窗展示）
 *  - tags 设施/亮点标签
 */
module.exports = [
  {
    name: '敦煌「净界」公厕',
    city: '甘肃·敦煌',
    address: '敦煌沙州夜市（八景楼老建筑改造）',
    lat: 40.1416,
    lng: 94.6617,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53442477717_3498871e5b_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53463815856_9b26c5aa01_b_640_400_nofilter.jpg'],
    seedScore: 4.9,
    hotDesc: '由 30 年老建筑「八景楼」改造，敦煌壁画 + 绿植香薰 + 智能马桶，游客「唔屙都要打卡」。',
    reviews: [
      '像博物馆一样漂亮的厕所，早知穿汉服来拍照！',
      '智能马桶很有特色，是我走青甘环线最干净的一个厕所。',
      '有休息区和茶饮自助机，逛夜市顺路救急超赞。'
    ],
    tags: ['网红打卡', '智能马桶', '免费', '有纸巾']
  },
  {
    name: '武汉·紫阳公园公厕',
    city: '湖北·武汉',
    address: '武昌区紫阳公园内',
    lat: 30.5322,
    lng: 114.3065,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54148724189_bccd694244_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53604314828_2a4fd958d9_z_640_400_nofilter.jpg'],
    seedScore: 4.8,
    hotDesc: '白色外墙镂空出大树纹理，阳光洒下斑驳光影，被网友称为「公厕界颜值天花板」。',
    reviews: [
      '颜值真的绝了，专程来拍照打卡的人比上厕所还多。',
      '镂空墙的光影很好看，里面也很干净。',
      '设计超出预期，公厕也能成为网红地标。'
    ],
    tags: ['网红打卡', '免费', '有纸巾']
  },
  {
    name: '北京·王府中环洗手间',
    city: '北京·东城',
    address: '王府井大街 269 号王府中环',
    lat: 39.9130,
    lng: 116.4175,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53354791607_d758a5d849_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/4554_23868832467_9563338e52_z_640_400_nofilter.jpg'],
    seedScore: 4.8,
    hotDesc: '据传用了 MUJI 同款香氛，被网友封为「神之厕所」，北京口碑封神的存在。',
    reviews: [
      '香氛太好闻了，怀疑和 MUJI 是同一款。',
      '干净、安静、香，逛王府井救急首选。',
      '北京公认最好用的商场洗手间，没有之一。'
    ],
    tags: ['香氛', '免费', '有纸巾']
  },
  {
    name: '嘉兴·禾城驿·温暖嘉',
    city: '浙江·嘉兴',
    address: '嘉兴市区「禾城驿」驿站',
    lat: 30.7518,
    lng: 120.7490,
    photoUrls: ['https://loremflickr.com/cache/resized/7065_6983231145_91c15d3815_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54405669894_a62131ba0b_z_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '能喝水、看书、借伞、给手机充电，夏天有冰饮、冬天供热水，公厕秒变便民驿站。',
    reviews: [
      '进去之后不想走，居然还能看书充电。',
      '冬天有热水洗手，太暖心了。',
      '这哪是公厕，分明是个小型服务驿站。'
    ],
    tags: ['驿站', '免费', '有纸巾', '24小时']
  },
  {
    name: '湖州·莲花庄公厕',
    city: '浙江·湖州',
    address: '湖州莲花庄公园旁',
    lat: 30.8670,
    lng: 120.0920,
    photoUrls: ['https://loremflickr.com/cache/resized/7464_29938581821_39c0233768_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54154125827_b18562d6f1_h_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '长着一副江南民居的模样，白墙黛瓦、飞檐翘角，古色古香又干净清爽。',
    reviews: [
      '像江南老宅一样好看，和公园很搭。',
      '白墙黛瓦超有味道，洗手间里也很整洁。',
      '路过都会多看两眼，颜值与实力并存。'
    ],
    tags: ['古风', '免费', '有纸巾']
  },
  {
    name: '上海·环球金融中心洗手间',
    city: '上海·浦东',
    address: '世纪大道 100 号上海环球金融中心',
    lat: 31.2337,
    lng: 121.5064,
    photoUrls: ['https://loremflickr.com/cache/resized/3161_2656506956_1d5a47f8de_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_51072278098_03a1dfc980_b_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '网友金榜题名的「比自家厨房还香」的厕所，陆家嘴逛街救急首选。',
    reviews: [
      '比我家厨房还香，是真的。',
      '落地窗前上厕所，视野无敌。',
      '保洁阿姨很勤快，任何时候去都干干净净。'
    ],
    tags: ['香氛', '免费', '有纸巾']
  },
  {
    name: '上海·长宁路公厕',
    city: '上海·长宁',
    address: '长宁路沿线',
    lat: 31.2200,
    lng: 121.4160,
    photoUrls: ['https://loremflickr.com/cache/resized/4037_4588721080_dbfd5179fe_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54172206766_e6cfbcd52d_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '绿植环绕 + 自然与城市融合设计，被网友称为「申城最美公厕」。',
    reviews: [
      '暖棕米白撞色外墙，清爽又好看。',
      '绿植环绕，等朋友时都想多待一会。',
      '细节满分，洗手台都像咖啡馆。'
    ],
    tags: ['绿植', '免费', '有纸巾']
  },
  {
    name: '北京·侨福芳草地洗手间',
    city: '北京·朝阳',
    address: '朝阳区东大桥路 9 号侨福芳草地',
    lat: 39.9210,
    lng: 116.4600,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53428342354_fd93e89f4b_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_51072852936_5d7575523e_c_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '与王府中环齐名的北京口碑双雄，艺术商场里的五星体验。',
    reviews: [
      '北京仅有的两家一致好评之一，果然名不虚传。',
      '艺术气息拉满，连洗手间都很有设计感。',
      '干净到发光，服务也贴心。'
    ],
    tags: ['艺术', '免费', '有纸巾']
  },
  {
    name: '深圳·南山马家龙智慧公厕',
    city: '广东·深圳',
    address: '南山区马家龙片区',
    lat: 22.5440,
    lng: 113.9370,
    photoUrls: ['https://loremflickr.com/cache/resized/5511_10451996715_ece5863c53_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53623967677_66cbb3124f_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '黑科技智慧公厕，空位提示、环境监测一应俱全，深圳「网红打卡地」。',
    reviews: [
      '科技感很强，还能看到空位提示，不用排队瞎等。',
      '深圳的智慧公厕真的能打。',
      '干净智能，体验很好。'
    ],
    tags: ['智慧公厕', '免费', '有纸巾']
  },
  {
    name: '成都·奕欧来购物村洗手间',
    city: '四川·成都',
    address: '成都奕欧来奥特莱斯购物村',
    lat: 30.5728,
    lng: 104.0665,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54342066363_79b893d9d4_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/8704_17045109387_f8656f4d6b_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '获过「最美旅游厕所」奖，每个休息厅都像艺术家作品。',
    reviews: [
      '拿过奖的厕所果然不一般，像美术馆。',
      '逛街歇脚首选，干净又有设计感。',
      '每个休息厅都不一样，值得打卡。'
    ],
    tags: ['艺术', '免费', '有纸巾']
  },
  {
    name: '北京·SKP「Tiffany蓝」洗手间',
    city: '北京·朝阳',
    address: '朝阳区建国路 87 号北京 SKP',
    lat: 39.9110,
    lng: 116.4790,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53385267497_a2cd571be3_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/defaultImage.small_640_400_nofilter.jpg'],
    seedScore: 4.8,
    hotDesc: '传说中京城最出片的洗手间，Tiffany 蓝配色 + 水晶灯，排队都要拍照。',
    reviews: [
      '进门就是 Tiffany 蓝，少女心直接拉满。',
      '保洁阿姨随时在岗，比五星酒店还讲究。',
      '全北京最精致的商场洗手间，没有之一。'
    ],
    tags: ['网红打卡', '免费', '有纸巾']
  },
  {
    name: '北京·园博园「锦绣」公厕',
    city: '北京·丰台',
    address: '丰台区园博园景区内',
    lat: 39.8660,
    lng: 116.1830,
    photoUrls: ['https://loremflickr.com/cache/resized/3919_15313666015_c5a6f7bd9f_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53612191434_c49c202588_z_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '入选全国十佳旅游厕所，把园林景致搬进洗手间，如厕像逛园子。',
    reviews: [
      '园林风设计，和园博园气质很配。',
      '入选过全国十佳，确实名不虚传。',
      '干净明亮，细节做得很好。'
    ],
    tags: ['园林风', '免费', '有纸巾']
  },
  {
    name: '北京·红螺寺景区公厕',
    city: '北京·怀柔',
    address: '怀柔区红螺寺景区内',
    lat: 40.3820,
    lng: 116.6350,
    photoUrls: ['https://loremflickr.com/cache/resized/3618_3320095124_30462229c1_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/2105_2192160467_e6624d9132_b_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '古寺红墙下的公厕，飞檐黛瓦，与千年古刹融为一体。',
    reviews: [
      '红墙灰瓦特别有味道，配得上千年古寺。',
      '景区里难得的干净厕所。',
      '古色古香，拍照也不违和。'
    ],
    tags: ['古风', '免费', '有纸巾']
  },
  {
    name: '北京·古北水镇公厕',
    city: '北京·密云',
    address: '密云区古北水镇景区内',
    lat: 40.6510,
    lng: 117.2520,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53030771690_02b10a22b8_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/35_71584418_1ef235f8f9_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '枕水江南风格的旅游厕所，青砖灰瓦倒映在水巷边。',
    reviews: [
      '和乌镇一样的水乡味道，很惊喜。',
      '旅游厕所做到这个份上很用心。',
      '干净，还有淡淡的香氛。'
    ],
    tags: ['水乡风', '免费', '有纸巾']
  },
  {
    name: '上海·地铁人民广场站台厕所',
    city: '上海·黄浦',
    address: '地铁 1 号线人民广场站台层',
    lat: 31.2317,
    lng: 121.4695,
    photoUrls: ['https://loremflickr.com/cache/resized/4590_39161046601_d5bdd77f0f_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/5704_23074887799_53e3a930cc_z_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '地铁站里的「第三卫生间」标杆，母婴、无障碍一应俱全。',
    reviews: [
      '地铁站里居然有这么宽敞的第三卫生间。',
      '母婴设施很全，带娃党福音。',
      '高峰期也很干净，要给保洁点赞。'
    ],
    tags: ['第三卫生间', '免费', '有纸巾']
  },
  {
    name: '上海·东靖路智慧生态公厕',
    city: '上海·浦东',
    address: '浦东新区东靖路沿线',
    lat: 31.3050,
    lng: 121.5850,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54514358757_17750221f4_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54204449469_50ed431052_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '入选上海「最美公厕」的生态型智慧公厕，低碳环保设计。',
    reviews: [
      '生态屋顶很好看，和周边绿道搭。',
      '智慧屏实时显示空位，很先进。',
      '上海最美公厕之一，实至名归。'
    ],
    tags: ['智慧公厕', '免费', '有纸巾']
  },
  {
    name: '上海·梅州路「宠物友好」公厕',
    city: '上海·闵行',
    address: '闵行区梅州路沿线',
    lat: 31.1480,
    lng: 121.4180,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53315822112_e8c05971e3_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53167864248_609480cbe5_b_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '专设宠物驻停区，遛狗救急两不误，铲屎官狂喜。',
    reviews: [
      '居然有宠物驻停区，太懂养狗人了。',
      '遛弯救急太方便，狗狗也有位置。',
      '细节满分，值得推广。'
    ],
    tags: ['宠物友好', '免费', '有纸巾']
  },
  {
    name: '上海·万源城「消防栓」公厕',
    city: '上海·闵行',
    address: '闵行区万源城片区',
    lat: 31.1520,
    lng: 121.4220,
    photoUrls: ['https://loremflickr.com/cache/resized/4105_5019509554_4fcca9fe5f_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53282563877_428c7a8a9e_b_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '外立面做成巨型红色消防栓造型，路过都想拍照的趣味公厕。',
    reviews: [
      '远远看还以为是个巨型消防栓，太有趣了。',
      '小朋友看到都不肯走。',
      '创意满分，还兼顾了实用。'
    ],
    tags: ['创意造型', '免费', '有纸巾']
  },
  {
    name: '上海·世纪公园 7 号门公厕',
    city: '上海·浦东',
    address: '浦东新区世纪公园 7 号门',
    lat: 31.2160,
    lng: 121.5480,
    photoUrls: ['https://loremflickr.com/cache/resized/124_352264561_44809fabb5_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54540452051_b095c50f40_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '物联网智慧公厕，坑位状态、客流数据大屏实时可见。',
    reviews: [
      '大屏看空位太方便了，不用一间间推门。',
      '公园里维护得非常好。',
      '科技感十足的公厕。'
    ],
    tags: ['智慧公厕', '免费', '有纸巾']
  },
  {
    name: '上海·淮海中路 918 号公厕',
    city: '上海·黄浦',
    address: '淮海中路 918 号',
    lat: 31.2160,
    lng: 121.4610,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53539728136_1e998f6872_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/3190_3079978354_6fa8bb6856_b_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '细节控最爱：搁物架、挂钩、充电口安排得明明白白。',
    reviews: [
      '搁物架太贴心了，包包终于有地方放。',
      '淮海路逛街救急首选。',
      '每个细节都考虑到了。'
    ],
    tags: ['细节控', '免费', '有纸巾']
  },
  {
    name: '上海·春花秋色「蘑菇屋」公厕',
    city: '上海·浦东',
    address: '浦东新区临港春花秋色公园',
    lat: 30.8820,
    lng: 121.9150,
    photoUrls: ['https://loremflickr.com/cache/resized/91_269576844_d866c543ae_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/5578_14498621220_d3fae2f7be_h_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '圆滚滚的蘑菇屋造型藏在公园里，童趣到犯规。',
    reviews: [
      '像童话里的小蘑菇，小朋友超喜欢。',
      '公园遛娃必打卡。',
      '可爱又干净。'
    ],
    tags: ['童趣', '免费', '有纸巾']
  },
  {
    name: '上海·徐家汇商圈智慧公厕',
    city: '上海·徐汇',
    address: '徐家汇商圈地下通道',
    lat: 31.1920,
    lng: 121.4390,
    photoUrls: ['https://loremflickr.com/cache/resized/3521_3763147056_d5b7ed0380_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/767_31839080283_4497905e79_b_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '全国十佳旅游厕所，商圈里的「五星级」应急点。',
    reviews: [
      '商圈里能这么干净太难得了。',
      '节假日排队也快，管理很到位。',
      '全国十佳实至名归。'
    ],
    tags: ['智慧公厕', '免费', '有纸巾']
  },
  {
    name: '上海·多伦路文化街公厕',
    city: '上海·虹口',
    address: '虹口区多伦路文化名人街',
    lat: 31.2610,
    lng: 121.4810,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54417457119_a5e8b48722_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54465925205_31858d0998_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '老上海风情公厕，与名人街的怀旧气质一脉相承。',
    reviews: [
      '和整条街的气质很搭，像老电影里的场景。',
      '闹中取静，干净整洁。',
      '文化街里的特色厕所。'
    ],
    tags: ['老上海风', '免费', '有纸巾']
  },
  {
    name: '上海·辰山植物园 12 号公厕',
    city: '上海·松江',
    address: '松江区辰山植物园内',
    lat: 31.0740,
    lng: 121.1740,
    photoUrls: ['https://loremflickr.com/cache/resized/14_17719889_dfcd9da814_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53908700227_c5474ddf4f_c_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '藏在温室花海里的公厕，入选上海最美旅游厕所 TOP10。',
    reviews: [
      '植物园里的厕所也这么卷。',
      '和花海融为一体，很美。',
      '干净舒适，体验很好。'
    ],
    tags: ['花园风', '免费', '有纸巾']
  },
  {
    name: '杭州西湖·兰心公厕',
    city: '浙江·杭州',
    address: '西湖景区孤山路平湖秋月旁',
    lat: 30.2540,
    lng: 120.1410,
    photoUrls: ['https://loremflickr.com/cache/resized/3119_2910174093_19bc34d808_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/8074_8300913638_4a1e72a50f_z_640_400_nofilter.jpg'],
    seedScore: 4.9,
    hotDesc: '宋韵园林外观，楼上是日卖 500 碗的网红面馆，厕所和面馆都火出圈。',
    reviews: [
      '在公厕楼上吃面是什么体验，太有创意了。',
      '像走进宋代的私家园林。',
      '打卡的人比上厕所的人还多。'
    ],
    tags: ['网红打卡', '宋韵', '免费', '有纸巾']
  },
  {
    name: '杭州西湖·湖滨三公园公厕',
    city: '浙江·杭州',
    address: '西湖湖滨三公园',
    lat: 30.2520,
    lng: 120.1610,
    photoUrls: ['https://loremflickr.com/cache/resized/1670_25644996554_c86cc55c19_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/8852_27744642034_559067e61d_h_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '老牌「五星级公厕」，背靠西湖，湖光山色尽收眼底。',
    reviews: [
      '西湖边老牌五星公厕，一直保持高水准。',
      '窗边能看到湖景，心情都好了。',
      '游客那么多还能这么干净。'
    ],
    tags: ['湖景', '免费', '有纸巾']
  },
  {
    name: '杭州西溪湿地·周家村生态公厕',
    city: '浙江·杭州',
    address: '西溪国家湿地公园周家村',
    lat: 30.2680,
    lng: 120.0610,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53549261700_ee9d0a62f1_c_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54302363816_8334f48e7b_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '生态环保设计，与湿地芦苇荡完美融合。',
    reviews: [
      '和湿地环境融为一体，生态理念很到位。',
      '隐蔽又干净，不留痕迹。',
      '西溪湿地里的绿野仙踪。'
    ],
    tags: ['生态', '免费', '有纸巾']
  },
  {
    name: '丽水云和梯田「玻璃观景」厕所',
    city: '浙江·丽水',
    address: '云和梯田景区内',
    lat: 28.0580,
    lng: 119.4930,
    photoUrls: ['https://loremflickr.com/cache/resized/5089_5243844416_4e426d5541_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/978_40961144585_6786e4b097_z_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '一整面落地玻璃正对万亩梯田，被称为「360 度无死角最美风景厕所」。',
    reviews: [
      '边如厕边看云海梯田，这体验绝了。',
      '风景比很多观景台都好。',
      '路过一定要来打个卡。'
    ],
    tags: ['景观厕所', '免费', '有纸巾']
  },
  {
    name: '常州高铁北站「火车头」公厕',
    city: '江苏·常州',
    address: '常州北站高铁站前广场',
    lat: 31.8750,
    lng: 119.9680,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53170453530_9f50b23822_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54467500112_033ea8f77a_z_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '造型是银色大火车头，站前广场最靓的仔，旅客争相合影。',
    reviews: [
      '远远看像真火车头，太酷了。',
      '候车顺便打卡，设计感拉满。',
      '高铁站的形象担当。'
    ],
    tags: ['创意造型', '免费', '有纸巾']
  },
  {
    name: '苏州·古典园林风公厕',
    city: '江苏·苏州',
    address: '苏州古城区街巷',
    lat: 31.3030,
    lng: 120.6180,
    photoUrls: ['https://loremflickr.com/cache/resized/13_17384698_0fc2c20f7c_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/5219_5516535136_764e7b56d5_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '花窗、假山、漏景一个不少，把园林搬进了公厕。',
    reviews: [
      '连厕所都是园林风，苏州名不虚传。',
      '透过花窗看风景，绝了。',
      '古朴雅致又干净。'
    ],
    tags: ['园林风', '免费', '有纸巾']
  }
,
  {
    name: '苏州阳澄湖服务区公厕',
    city: '江苏·苏州',
    address: '阳澄湖高速服务区',
    lat: 31.4150,
    lng: 120.7450,
    photoUrls: ['https://loremflickr.com/cache/resized/1726_27490985727_222eb34fde_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/406_31839080653_089dc2d8fb_z_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '高速服务区里的「购物中心级」公厕，赶路途中五星体验。',
    reviews: [
      '服务区天花板，厕所都这么豪华。',
      '长途自驾必停的点。',
      '比很多商场都干净。'
    ],
    tags: ['服务区', '免费', '有纸巾']
  },
  {
    name: '南京牛首山「牛首捌厕·眺望」',
    city: '江苏·南京',
    address: '牛首山文化旅游区',
    lat: 31.8820,
    lng: 118.7310,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54540795395_6730dc6f78_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53450827805_d6ecd3b167_b_640_400_nofilter.jpg'],
    seedScore: 4.8,
    hotDesc: '斩获国际设计大奖的「牛首捌厕」，建筑本身即风景，这是能眺望群山的一座。',
    reviews: [
      '设计感碾压很多美术馆。',
      '获奖作品名不虚传。',
      '为了上厕所都愿意专门来一趟。'
    ],
    tags: ['获奖设计', '网红打卡', '免费']
  },
  {
    name: '南京牛首山「牛首捌厕·垭口」',
    city: '江苏·南京',
    address: '牛首山文化旅游区',
    lat: 31.8800,
    lng: 118.7340,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54120423472_d1b0d6eebd_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/1021_1477774536_64545f52fe_b_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '藏于山间垭口的极简混凝土建筑，与山体共生，被网友称为「山间美术馆」。',
    reviews: [
      '极简到极致，和山景融为一体。',
      '像误入一座现代艺术馆。',
      '牛首山的惊喜太多了。'
    ],
    tags: ['获奖设计', '极简', '免费']
  },
  {
    name: '南京七桥瓮湿地公园智慧公厕',
    city: '江苏·南京',
    address: '七桥瓮湿地公园内',
    lat: 32.0080,
    lng: 118.8240,
    photoUrls: ['https://loremflickr.com/cache/resized/7189_6871589499_945bfb6aa5_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/162_353734664_f23a71c37d_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '门口电子屏实时显示空位数量，公园救急不排队。',
    reviews: [
      '空位电子屏很实用。',
      '公园里维护得很好。',
      '智能又干净。'
    ],
    tags: ['智慧公厕', '免费', '有纸巾']
  },
  {
    name: '南京德基广场「花园主题」洗手间',
    city: '江苏·南京',
    address: '中山路 18 号德基广场',
    lat: 32.0430,
    lng: 118.7830,
    photoUrls: ['https://loremflickr.com/cache/resized/3843_14741115854_c027f88a07_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54006797611_98c85848cb_b_640_400_nofilter.jpg'],
    seedScore: 4.8,
    hotDesc: '直接把花园搬进洗手间，绿植、水景、香氛一应俱全，商场洗手间天花板。',
    reviews: [
      '洗手间像个小花园，太出片了。',
      '比五星酒店还讲究。',
      '南京商场洗手间之王。'
    ],
    tags: ['花园风', '香氛', '免费', '有纸巾']
  },
  {
    name: '无锡恒隆广场洗手间',
    city: '江苏·无锡',
    address: '人民中路恒隆广场',
    lat: 31.5740,
    lng: 120.3020,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54561222948_34cb8c1007_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/56_178961579_794d5fa928_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '设施保养极好，保洁在线，被当地网友评为「无锡最体面洗手间」。',
    reviews: [
      '无锡最体面的商场洗手间。',
      '任何时候去都很干净。',
      '细节到位，体验舒适。'
    ],
    tags: ['商场', '免费', '有纸巾']
  },
  {
    name: '苏州东山雕花楼景区公厕',
    city: '江苏·苏州',
    address: '吴中区东山雕花楼景区',
    lat: 31.0730,
    lng: 120.4310,
    photoUrls: ['https://loremflickr.com/cache/resized/2298_1497644198_1a7be1f6a7_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54551454317_d09a8b51d0_h_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '入选全国最美旅游厕所，雕梁画栋延续雕花楼的气质。',
    reviews: [
      '和雕花楼同款精致。',
      '全国最美旅游厕所名副其实。',
      '景区加分项。'
    ],
    tags: ['古风', '免费', '有纸巾']
  },
  {
    name: '苏州震泽古镇公厕',
    city: '江苏·苏州',
    address: '吴江区震泽古镇',
    lat: 30.9550,
    lng: 120.4970,
    photoUrls: ['https://loremflickr.com/cache/resized/600_22572382951_7682c28582_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/7827_32424765127_b059161312_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '枕河人家旁的古镇公厕，青砖黛瓦与水巷相映。',
    reviews: [
      '古镇里的厕所也有江南味。',
      '干净整洁，好评。',
      '和古镇风格很搭。'
    ],
    tags: ['古镇风', '免费', '有纸巾']
  },
  {
    name: '南通如皋长江药用植物园公厕',
    city: '江苏·南通',
    address: '如皋市长江药用植物园',
    lat: 32.1470,
    lng: 120.5280,
    photoUrls: ['https://loremflickr.com/cache/resized/114_362689249_deed45ea54_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/1271_4611692573_a5870f3a3b_b_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '藏在药用植物园里的生态公厕，绿植环抱。',
    reviews: [
      '植物园里的公厕很生态。',
      '隐蔽又清爽。',
      '值得好评。'
    ],
    tags: ['生态', '免费', '有纸巾']
  },
  {
    name: '广州白云山「云鼎」公厕',
    city: '广东·广州',
    address: '白云山风景名胜区内',
    lat: 23.1920,
    lng: 113.2940,
    photoUrls: ['https://loremflickr.com/cache/resized/1227_1403403620_d7eba1a0aa_c_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53806581784_0fd178bd5c_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '山间云海造型，与白云山景致相得益彰。',
    reviews: [
      '爬白云山顺路打卡，造型很特别。',
      '山上厕所这么干净不容易。',
      '景观和实用兼顾。'
    ],
    tags: ['景观', '免费', '有纸巾']
  },
  {
    name: '广州金沙浔峰中路公厕',
    city: '广东·广州',
    address: '白云区金沙洲浔峰中路',
    lat: 23.1510,
    lng: 113.2020,
    photoUrls: ['https://loremflickr.com/cache/resized/5046_5243846736_c7887f1c16_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/1144_4592745876_aac1e7a88c_h_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '获评广州「最美公厕」，简约时尚的设计。',
    reviews: [
      '广州最美公厕之一，设计感在线。',
      '社区公厕的标杆。',
      '干净清爽。'
    ],
    tags: ['简约', '免费', '有纸巾']
  },
  {
    name: '广州白云湖西湖北门公厕',
    city: '广东·广州',
    address: '白云湖西湖北门',
    lat: 23.2140,
    lng: 113.2350,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53604693228_b63eb4e47e_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/168_475213613_3c2645c115_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '湖畔现代风公厕，湖景与绿荫相伴。',
    reviews: [
      '白云湖边救急很舒服。',
      '湖景加分。',
      '干净明亮。'
    ],
    tags: ['湖景', '免费', '有纸巾']
  },
  {
    name: '广州高地塘公厕',
    city: '广东·广州',
    address: '白云区高地塘',
    lat: 23.1320,
    lng: 113.2630,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53450827860_9c11c7d35d_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53334691241_7075d693bd_z_640_400_nofilter.jpg'],
    seedScore: 4.4,
    hotDesc: '社区改造样板公厕，颜值与便民兼备。',
    reviews: [
      '改造后焕然一新。',
      '社区里的小确幸。',
      '干净卫生。'
    ],
    tags: ['社区', '免费', '有纸巾']
  },
  {
    name: '广州太古汇洗手间',
    city: '广东·广州',
    address: '天河路 383 号太古汇',
    lat: 23.1320,
    lng: 113.3220,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53206874697_7cb3457e29_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53828151806_e83564860e_b_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '广州商场洗手间的门面担当，常年被网友点名表扬。',
    reviews: [
      '广州商场洗手间标杆。',
      '永远干干净净，香香的。',
      '体验和五星酒店看齐。'
    ],
    tags: ['商场', '香氛', '免费', '有纸巾']
  },
  {
    name: '深圳湾公园「海景」公厕',
    city: '广东·深圳',
    address: '深圳湾公园滨海栈道沿线',
    lat: 22.5120,
    lng: 113.9480,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54132625769_6a632bae5d_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/2022_2420257982_9ab1f8f629_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '面朝深圳湾海景，跑步骑行途中救急也浪漫。',
    reviews: [
      '海景厕所名不虚传。',
      '跑步途中歇脚首选。',
      '干净且有设计感。'
    ],
    tags: ['海景', '免费', '有纸巾']
  },
  {
    name: '广州白云湖内湖公厕',
    city: '广东·广州',
    address: '白云湖景区内湖片区',
    lat: 23.2090,
    lng: 113.2280,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53083402180_d32156d018_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53621382351_55d06c3c8c_z_640_400_nofilter.jpg'],
    seedScore: 4.4,
    hotDesc: '湖心岛上的亲水公厕，风景独好。',
    reviews: [
      '湖心岛位置绝佳。',
      '风景不错，设施也新。',
      '周末遛弯救急方便。'
    ],
    tags: ['湖景', '免费', '有纸巾']
  },
  {
    name: '珠海情侣路公厕',
    city: '广东·珠海',
    address: '情侣路沿线',
    lat: 22.2720,
    lng: 113.5810,
    photoUrls: ['https://loremflickr.com/cache/resized/47_125770686_42e0a510cd_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54246290580_2f31d023e4_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '海岸线旁的公厕，听涛看海，游客口碑极佳。',
    reviews: [
      '面朝大海的厕所，太治愈了。',
      '沿海散步救急很方便。',
      '干净，海风吹着很舒服。'
    ],
    tags: ['海景', '免费', '有纸巾']
  },
  {
    name: '柳州滨江东路「三角梅」公厕',
    city: '广西·柳州',
    address: '滨江东路沿江步道',
    lat: 24.3330,
    lng: 109.4230,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54395336911_e53ccdd040_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53045546051_942ac52919_z_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '整面墙爬满三角梅，柳州「最美公厕」出圈之作。',
    reviews: [
      '开满三角梅的厕所，拍照绝了。',
      '柳州人的浪漫。',
      '花海里的公厕。'
    ],
    tags: ['花墙', '网红打卡', '免费', '有纸巾']
  },
  {
    name: '柳州环江滨水大道「天空之镜」公厕',
    city: '广西·柳州',
    address: '环江滨水大道沿线',
    lat: 24.3990,
    lng: 109.4350,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53033379850_bd1df676d2_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53307592511_7da3f78fd2_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '镜面屋顶倒映江天，被称为「天空之镜」公厕。',
    reviews: [
      '镜面倒影太美了。',
      '江边打卡新地标。',
      '设计很大胆。'
    ],
    tags: ['网红打卡', '免费', '有纸巾']
  },
  {
    name: '阳朔兴坪大岭头「最美洗手间」',
    city: '广西·桂林',
    address: '阳朔县兴坪镇大岭头',
    lat: 24.9210,
    lng: 110.5150,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54248698165_f1f43d6e20_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/1489_23995628341_e57e799e20_b_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '背靠喀斯特峰林，被游客称为「阳朔最美洗手间」。',
    reviews: [
      '对着峰林如厕，桂林山水名不虚传。',
      '比很多民宿还漂亮。',
      '强烈推荐打卡。'
    ],
    tags: ['山水景观', '网红打卡', '免费']
  },
  {
    name: '北海冠头岭「礁石厕所艺术馆」',
    city: '广西·北海',
    address: '冠头岭国家森林公园',
    lat: 21.4610,
    lng: 109.0820,
    photoUrls: ['https://loremflickr.com/cache/resized/7112_7794287300_a2db8af27d_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53515198534_95da515ec3_z_640_400_nofilter.jpg'],
    seedScore: 4.8,
    hotDesc: '获全球设计大奖的公厕，藏在礁石里的「厕所艺术馆」。',
    reviews: [
      '拿过国际大奖的厕所，必须来看。',
      '像一座海边艺术馆。',
      '设计太超前了。'
    ],
    tags: ['获奖设计', '网红打卡', '免费']
  },
  {
    name: '南宁南湖公园公厕',
    city: '广西·南宁',
    address: '南湖公园内',
    lat: 22.8220,
    lng: 108.3330,
    photoUrls: ['https://loremflickr.com/cache/resized/1590_24004543990_406ab96d79_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53408064719_f8cec9eaf6_b_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '配了淋浴间的公园公厕，跑步完还能冲个凉。',
    reviews: [
      '公园公厕居然有淋浴间。',
      '跑步党的福音。',
      '服务太到位了。'
    ],
    tags: ['淋浴间', '免费', '有纸巾']
  },
  {
    name: '南宁青秀山「古树穿顶」公厕',
    city: '广西·南宁',
    address: '青秀山风景区雨林大观',
    lat: 22.7880,
    lng: 108.3860,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53621711093_5450ae4b4a_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/7874_46643349034_65d0ce2ce7_b_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '古树直接从屋顶穿出，建筑给树让路，人与自然共生。',
    reviews: [
      '树从屋顶长出来，太震撼了。',
      '人与自然共生的典范。',
      '青秀山必打卡。'
    ],
    tags: ['生态', '网红打卡', '免费']
  },
  {
    name: '南宁青秀山「壮锦」公厕',
    city: '广西·南宁',
    address: '青秀山风景区壮锦广场',
    lat: 22.7910,
    lng: 108.3890,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54384806268_82e833d8b7_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/1275_4612411358_f5bcaaaa26_b_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '外墙用壮锦纹样装饰，民族风情拉满。',
    reviews: [
      '壮锦元素很有特色。',
      '民族风设计让人眼前一亮。',
      '好看又干净。'
    ],
    tags: ['民族风', '免费', '有纸巾']
  },
  {
    name: '南宁青秀山「竹园船型」公厕',
    city: '广西·南宁',
    address: '青秀山风景区竹园',
    lat: 22.7850,
    lng: 108.3920,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53018471909_4b60369619_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/38_78762818_b67e04a75e_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '船型建筑浮在竹海之中，如厕如泛舟。',
    reviews: [
      '竹海里的船型厕所，很有意境。',
      '青秀山处处是景。',
      '干净舒适。'
    ],
    tags: ['竹海', '免费', '有纸巾']
  },
  {
    name: '平南雄森动物大世界「观虎厕所」',
    city: '广西·贵港',
    address: '平南县雄森动物大世界',
    lat: 23.5410,
    lng: 110.3910,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54540452046_ac24a4fe45_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53578050265_d793055989_z_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '隔着玻璃看老虎散步，网友：老虎围观我如厕。',
    reviews: [
      '第一次和老虎「共享」厕所。',
      '太有梗了，笑声根本停不下来。',
      '动物园里的顶流厕所。'
    ],
    tags: ['猎奇', '网红打卡', '免费']
  },
  {
    name: '大化服务区「红水河景观」公厕',
    city: '广西·河池',
    address: '大化瑶族自治县高速服务区',
    lat: 23.7420,
    lng: 107.9910,
    photoUrls: ['https://loremflickr.com/cache/resized/4088_5031172402_7bde1f16e7_c_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/4023_4599342089_56b62c3bfa_b_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '服务区公厕坐拥红水河景观，赶路也能看风景。',
    reviews: [
      '服务区厕所还能看江景。',
      '自驾路上的小惊喜。',
      '干净敞亮。'
    ],
    tags: ['景观', '免费', '有纸巾']
  },
  {
    name: '桂林两江四湖景区公厕',
    city: '广西·桂林',
    address: '两江四湖景区沿湖步道',
    lat: 25.2820,
    lng: 110.2910,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53474852849_68a5865d11_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/3006_2382089551_4fdc6b1aec_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '入选全国最美旅游厕所，山水画境里的卫生间。',
    reviews: [
      '桂林山水画里上厕所。',
      '全国最美旅游厕所之一。',
      '和漓江气质很搭。'
    ],
    tags: ['山水景观', '免费', '有纸巾']
  },
  {
    name: '桂林七星景区公厕',
    city: '广西·桂林',
    address: '七星公园内',
    lat: 25.2720,
    lng: 110.3120,
    photoUrls: ['https://loremflickr.com/cache/resized/2461_5767217038_9d9541f357_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54079117900_9a4540b413_b_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '喀斯特岩壁下的公厕，溶洞般清凉。',
    reviews: [
      '岩壁环绕，夏天特别凉快。',
      '景区里打理得很好。',
      '有特色。'
    ],
    tags: ['喀斯特', '免费', '有纸巾']
  },
  {
    name: '武汉东湖绿道·落霞归雁驿站公厕',
    city: '湖北·武汉',
    address: '东湖绿道落霞归雁驿站',
    lat: 30.5630,
    lng: 114.4120,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54405552603_25f04c56da_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53013128072_5713bb7377_k_640_400_nofilter.jpg'],
    seedScore: 4.8,
    hotDesc: '女厕 115 个厕位 + 24 小时热水淋浴，被网友称为「壕无人性」的公厕。',
    reviews: [
      '115 个厕位，第一次见到这么大的女厕。',
      '还有热水淋浴间，跑步完直接冲凉。',
      '武汉公厕的天花板。'
    ],
    tags: ['超大容量', '淋浴间', '免费', '有纸巾']
  },
  {
    name: '武汉东湖·凌波门城市驿站公厕',
    city: '湖北·武汉',
    address: '东湖风景区凌波门',
    lat: 30.5530,
    lng: 114.3740,
    photoUrls: ['https://loremflickr.com/cache/resized/1084_1443061876_b4d26b61f7_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53451575439_28c9c21a00_c_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '集如厕、避暑、休闲一体的网红驿站，栈桥旁救急胜地。',
    reviews: [
      '凌波门网红打卡地终于有像样的厕所了。',
      '还能避暑休息，很贴心。',
      '东湖游玩体验大提升。'
    ],
    tags: ['驿站', '网红打卡', '免费', '有纸巾']
  },
  {
    name: '武汉东湖·落雁南停车场公厕',
    city: '湖北·武汉',
    address: '东湖绿道落雁南停车场',
    lat: 30.5610,
    lng: 114.4410,
    photoUrls: ['https://loremflickr.com/cache/resized/2772_4217767179_955fe38959_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_49394915168_1c70887caa_b_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '暖气、热水、洗手液、烘手器全配齐，被网友评为「无可挑剔的免费公厕」。',
    reviews: [
      '暖气热水烘手器全都有，免费公厕的天花板。',
      '细节做到这个份上无可挑剔。',
      '带娃来东湖太省心了。'
    ],
    tags: ['设施齐全', '免费', '有纸巾']
  },
  {
    name: '武汉汉口江滩公厕',
    city: '湖北·武汉',
    address: '汉口江滩沿线',
    lat: 30.6000,
    lng: 114.3050,
    photoUrls: ['https://loremflickr.com/cache/resized/1892_29521300807_c21ee43c68_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54408010920_cc0c33cd8b_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '江滩公园沿线的景观公厕，看江吹风两不误。',
    reviews: [
      '江滩散步救急很方便。',
      '干净，江景加分。',
      '汉口人的后花园厕所。'
    ],
    tags: ['江景', '免费', '有纸巾']
  },
  {
    name: '常德柳叶湖旅游厕所',
    city: '湖南·常德',
    address: '柳叶湖旅游度假区',
    lat: 29.0710,
    lng: 111.7350,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_52226713829_536f086417_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54430648701_6917c75cca_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '环湖旅游厕所按景区标准打造，湖光水色相伴。',
    reviews: [
      '柳叶湖边很舒服。',
      '旅游厕所标杆。',
      '干净宽敞。'
    ],
    tags: ['湖景', '免费', '有纸巾']
  },
  {
    name: '花垣县十八洞村公厕',
    city: '湖南·湘西',
    address: '花垣县双龙镇十八洞村',
    lat: 28.3840,
    lng: 109.4010,
    photoUrls: ['https://loremflickr.com/cache/resized/2457_4054445874_faf87b82fa_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/2260_2351800630_dc254a2548_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '苗寨风情旅游厕所，与青山苗寨融为一体。',
    reviews: [
      '苗寨风格很地道。',
      '乡村旅游厕所的样板。',
      '干净整洁。'
    ],
    tags: ['苗寨风', '免费', '有纸巾']
  }
,
  {
    name: '浏阳苍坊旅游区公厕',
    city: '湖南·长沙',
    address: '浏阳市苍坊旅游区',
    lat: 28.1410,
    lng: 113.6320,
    photoUrls: ['https://loremflickr.com/cache/resized/6111_6389875227_e311516acb_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/4314_35306284563_86d361774e_z_640_400_nofilter.jpg'],
    seedScore: 4.4,
    hotDesc: '红色旅游线路上的整洁驿站，方便又贴心。',
    reviews: [
      '红色景点配套很完善。',
      '干净方便。',
      '值得好评。'
    ],
    tags: ['驿站', '免费', '有纸巾']
  },
  {
    name: '济南经十东路公厕',
    city: '山东·济南',
    address: '经十东路沿线',
    lat: 36.6620,
    lng: 117.1510,
    photoUrls: ['https://loremflickr.com/cache/resized/14_17905516_a1541dbce0_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/8242_8643939259_b65673a9ae_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '入选全国最美旅游厕所，现代简约设计。',
    reviews: [
      '全国最美旅游厕所名单上的济南代表。',
      '现代又干净。',
      '泉城的排面。'
    ],
    tags: ['简约', '免费', '有纸巾']
  },
  {
    name: '济南黑虎泉「泉城驿站」公厕',
    city: '山东·济南',
    address: '黑虎泉北路',
    lat: 36.6580,
    lng: 117.0260,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53220777115_ef3ccaa44f_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53829420772_617853b3b3_b_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '挂牌「最美公厕」的泉城驿站，第三卫生间配置齐全。',
    reviews: [
      '挂着最美公厕牌匾，名副其实。',
      '家庭卫生间很贴心。',
      '泉水城里的泉水厕所。'
    ],
    tags: ['第三卫生间', '免费', '有纸巾']
  },
  {
    name: '威海刘公岛景区公厕',
    city: '山东·威海',
    address: '刘公岛景区内',
    lat: 37.4920,
    lng: 122.1820,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53301135680_7e2e3b85e3_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/6199_6106825023_5726b0a876_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '海岛旅游厕所，海风相伴，入选全国最美旅游厕所。',
    reviews: [
      '海岛上的厕所也很讲究。',
      '干净清爽。',
      '景区配套给力。'
    ],
    tags: ['海岛', '免费', '有纸巾']
  },
  {
    name: '济宁兖州兴隆文化园公厕',
    city: '山东·济宁',
    address: '兖州区兴隆文化园',
    lat: 35.5520,
    lng: 116.7810,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53595447178_b944fdf00c_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53727440486_e11e68c5cf_b_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '文化园区里的精致公厕，入选全国最美旅游厕所。',
    reviews: [
      '文化园里的小而美。',
      '整洁有格调。',
      '好评。'
    ],
    tags: ['园区', '免费', '有纸巾']
  },
  {
    name: '青岛奥帆海洋文化旅游区公厕',
    city: '山东·青岛',
    address: '奥帆中心景区',
    lat: 36.0610,
    lng: 120.3820,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54353539872_eab085734e_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53302378508_3e7a8f3707_c_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '入选全国十佳旅游厕所，帆船之都的海滨驿站。',
    reviews: [
      '奥帆中心配套的厕所都这么棒。',
      '海风吹拂，心情舒畅。',
      '全国十佳名副其实。'
    ],
    tags: ['海滨', '免费', '有纸巾']
  },
  {
    name: '青岛海信广场洗手间',
    city: '山东·青岛',
    address: '市南区海信广场',
    lat: 36.0640,
    lng: 120.3790,
    photoUrls: ['https://loremflickr.com/cache/resized/174_394635379_1d98aaae6d_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53241362932_d1392b8b07_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '高端商场洗手间代表，被本地网友常年点名好评。',
    reviews: [
      '青岛商场洗手间天花板。',
      '任何时候都干净体面。',
      '服务贴心。'
    ],
    tags: ['商场', '免费', '有纸巾']
  },
  {
    name: '西安曲江「水泥咖啡」公厕',
    city: '陕西·西安',
    address: '大唐不夜城旁曲江步行街',
    lat: 34.2130,
    lng: 108.9680,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53252870085_a01aea9fab_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53832519134_4b40c78463_z_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '设计师谷腾改造的「最高端公厕」，水泥灰 + 咖啡空间，网红建筑。',
    reviews: [
      '谁能想到这是厕所，还能喝咖啡。',
      '西安城内最高端的公厕。',
      '设计感炸裂。'
    ],
    tags: ['网红打卡', '咖啡', '免费', '有纸巾']
  },
  {
    name: '韩城司马迁祠景区公厕',
    city: '陕西·韩城',
    address: '韩城市司马迁祠景区',
    lat: 35.4820,
    lng: 110.4410,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53690047797_99a8d59822_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/103_250570716_a69be0a5f9_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '入选全国十佳旅游厕所，文史之乡的格调。',
    reviews: [
      '文化景区的厕所也很有底蕴。',
      '干净整洁。',
      '全国十佳不虚。'
    ],
    tags: ['文化', '免费', '有纸巾']
  },
  {
    name: '西安大雁塔景区公厕',
    city: '陕西·西安',
    address: '大雁塔北广场',
    lat: 34.2190,
    lng: 108.9620,
    photoUrls: ['https://loremflickr.com/cache/resized/7538_15783165758_33a3b6bf90_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/8263_8665164761_48ec6c32d3_b_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '唐风建筑的公厕，与千年古塔遥相呼应。',
    reviews: [
      '唐风造型和雁塔很搭。',
      '游客多也能保持干净。',
      '古城细节到位。'
    ],
    tags: ['唐风', '免费', '有纸巾']
  },
  {
    name: '平昌县「川北民居」旅游公厕',
    city: '四川·巴中',
    address: '平昌县旅游景区沿线',
    lat: 31.5610,
    lng: 107.1010,
    photoUrls: ['https://loremflickr.com/cache/resized/3072_2606094735_9421a2909d_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53305944612_9061ef3411_c_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '入选全国十佳旅游厕所，川北民居风格。',
    reviews: [
      '川北民居的样子很亲切。',
      '旅游厕所的用心之作。',
      '干净有特色。'
    ],
    tags: ['民居风', '免费', '有纸巾']
  },
  {
    name: '重庆洪崖洞景区公厕',
    city: '重庆·渝中',
    address: '洪崖洞民俗风貌区',
    lat: 29.5610,
    lng: 106.5810,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53307837028_0aefae3120_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54586168163_7ba8d42892_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '吊脚楼里的公厕，8D 魔幻城市连厕所都带山城味。',
    reviews: [
      '洪崖洞的厕所也很有山城特色。',
      '夜景时分人超多但很干净。',
      '吊脚楼造型有趣。'
    ],
    tags: ['山城风', '网红打卡', '免费', '有纸巾']
  },
  {
    name: '厦门园林植物园公厕',
    city: '福建·厦门',
    address: '思明区园林植物园',
    lat: 24.4510,
    lng: 118.1010,
    photoUrls: ['https://loremflickr.com/cache/resized/5281_5243253441_5fa9338a6f_c_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/5647_23144719619_6231616b80_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '入选全国十佳旅游厕所，藏在雨林世界里的洗手间。',
    reviews: [
      '植物园里的厕所也仙气飘飘。',
      '雨林区打卡必经。',
      '干净舒适。'
    ],
    tags: ['雨林', '免费', '有纸巾']
  },
  {
    name: '福州「金凤凰」旅游厕所',
    city: '福建·福州',
    address: '福州市区旅游线路沿线',
    lat: 26.0720,
    lng: 119.3020,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54518602455_800d759439_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53283829914_4203eba12f_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '入选全国最美旅游厕所，造型如展翅凤凰。',
    reviews: [
      '金凤凰造型很有辨识度。',
      '福州旅游厕所的门面。',
      '干净漂亮。'
    ],
    tags: ['创意造型', '免费', '有纸巾']
  },
  {
    name: '宁德霍童外表码头旅游厕所',
    city: '福建·宁德',
    address: '霍童镇外表码头',
    lat: 26.8310,
    lng: 119.4310,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53830335291_8f0edb195b_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53562799436_f868ab5a20_h_640_400_nofilter.jpg'],
    seedScore: 4.4,
    hotDesc: '码头边的生态旅游厕所，山清水秀间救急。',
    reviews: [
      '码头边的小清新。',
      '生态设计很用心。',
      '干净方便。'
    ],
    tags: ['生态', '免费', '有纸巾']
  },
  {
    name: '三亚蜈支洲岛「海上花」网红厕所',
    city: '海南·三亚',
    address: '蜈支洲岛景区',
    lat: 18.3030,
    lng: 109.7540,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54236580945_d3a818bb44_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/216_475213607_dfde8e6475_c_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: 'AAA 级旅游厕所，能容纳近百人如厕，海岛度假风。',
    reviews: [
      '比很多酒店洗手间还豪华。',
      '容纳近百人不排队。',
      '海岛度假风的厕所天花板。'
    ],
    tags: ['海岛', 'AAA级', '免费', '有纸巾']
  },
  {
    name: '三亚海棠河网红公厕',
    city: '海南·三亚',
    address: '海棠湾海棠河沿岸',
    lat: 18.4010,
    lng: 109.7420,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53559110717_46227c3c52_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53128428524_11dd04ef4b_b_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '雪白圆形建筑 + 通透天井，被游客当作打卡点。',
    reviews: [
      '白墙圆顶配蓝天白云，太好拍了。',
      '三亚的厕所都这么卷。',
      '打卡的人比用厕所的人多。'
    ],
    tags: ['网红打卡', '免费', '有纸巾']
  },
  {
    name: '丽江虎跳峡「天下第一厕」',
    city: '云南·丽江',
    address: '虎跳峡中途客栈',
    lat: 27.2120,
    lng: 100.0610,
    photoUrls: ['https://loremflickr.com/cache/resized/55_147323764_8cfbed67d8_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54404768518_c83bf8c995_b_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '直面万丈峡谷的「天下第一厕」，全球徒步圈闻名。',
    reviews: [
      '对着峡谷如厕，这辈子头一回。',
      '徒步客的传奇驿站。',
      '名不虚传的天下第一厕。'
    ],
    tags: ['峡谷景观', '猎奇', '免费']
  },
  {
    name: '大理洱海生态廊道公厕',
    city: '云南·大理',
    address: '洱海生态廊道沿线',
    lat: 25.6840,
    lng: 100.1930,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53290329421_867c428669_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_51235270831_a05ee9d946_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '面朝洱海、背靠苍山，骑行途中歇脚即风景。',
    reviews: [
      '洱海边骑行的快乐驿站。',
      '苍山洱海尽收眼底。',
      '干净又好看。'
    ],
    tags: ['洱海景观', '免费', '有纸巾']
  },
  {
    name: '清镇市「悬崖」公厕',
    city: '贵州·贵阳',
    address: '清镇市红枫湖畔悬崖',
    lat: 26.5520,
    lng: 106.4720,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54113881404_900e324265_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54258355466_c9d2b435ee_z_640_400_nofilter.jpg'],
    seedScore: 4.7,
    hotDesc: '窗户正对 150 米悬崖和红枫湖，被称为「最刺激的公厕」。',
    reviews: [
      '窗口就是悬崖，腿都软了。',
      '红枫湖景绝了。',
      '刺激又难忘。'
    ],
    tags: ['悬崖景观', '猎奇', '免费']
  },
  {
    name: '黄果树景区公厕',
    city: '贵州·安顺',
    address: '黄果树瀑布景区内',
    lat: 25.9920,
    lng: 105.6620,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53109058770_8a3c70a910_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/6051_6211401288_db40be9389_b_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '瀑布景区内的景观公厕，水汽扑面。',
    reviews: [
      '瀑布景区里救急很省心。',
      '设施维护得不错。',
      '干净方便。'
    ],
    tags: ['景区', '免费', '有纸巾']
  },
  {
    name: '山南日托寺「天空之厕」',
    city: '西藏·山南',
    address: '羊卓雍措日托寺',
    lat: 29.0130,
    lng: 90.7010,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53340041046_26e0d4ed00_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53500872125_9a41759d2c_z_640_400_nofilter.jpg'],
    seedScore: 4.6,
    hotDesc: '羊湖孤岛寺庙旁的厕所，被游客称为「世界上最美的厕所」。',
    reviews: [
      '在羊湖边如厕，终生难忘。',
      '天空之境般的体验。',
      '高原上的小确幸。'
    ],
    tags: ['湖景', '猎奇', '免费']
  },
  {
    name: '景德镇古窑民俗博览区 4 号公厕',
    city: '江西·景德镇',
    address: '古窑民俗博览区内',
    lat: 29.2720,
    lng: 117.1810,
    photoUrls: ['https://loremflickr.com/cache/resized/3101_3187333379_142b4ff0fd_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/4088_5041002344_1cc19ff797_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '入选全国最美旅游厕所，窑文化主题设计。',
    reviews: [
      '和古窑文化一脉相承。',
      '别具一格。',
      '干净整洁。'
    ],
    tags: ['文化', '免费', '有纸巾']
  },
  {
    name: '长白山保护局公厕',
    city: '吉林·长白山',
    address: '长白山北景区保护站',
    lat: 42.0120,
    lng: 128.0620,
    photoUrls: ['https://loremflickr.com/cache/resized/2782_4209200910_e490b648ef_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53664627670_7dba7b25c9_z_640_400_nofilter.jpg'],
    seedScore: 4.4,
    hotDesc: '入选全国最美旅游厕所，林海雪原里的暖房。',
    reviews: [
      '寒冬里的一丝温暖。',
      '景区配套很棒。',
      '干净。'
    ],
    tags: ['林海', '免费', '有纸巾']
  },
  {
    name: '新巴尔虎右旗宝格德乌拉「文旅e站」',
    city: '内蒙古·呼伦贝尔',
    address: '宝格德乌拉景区',
    lat: 48.6120,
    lng: 116.8310,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53144257592_e6b0dd20b1_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/4052_4366971798_041e25ab24_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '入选全国十佳旅游厕所，草原上的文旅驿站。',
    reviews: [
      '草原深处的驿站很惊喜。',
      '全国十佳名副其实。',
      '干净有特色。'
    ],
    tags: ['草原', '驿站', '免费']
  },
  {
    name: '温宿天山托木尔景区公厕',
    city: '新疆·阿克苏',
    address: '天山托木尔景区',
    lat: 41.7010,
    lng: 80.2010,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53475117807_09a7e04119_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/7864_47234266122_65f40584bf_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '入选全国十佳旅游厕所，雪山脚下的人性化设计。',
    reviews: [
      '雪山景观厕所很震撼。',
      '景区细节满分。',
      '干净舒适。'
    ],
    tags: ['雪山景观', '免费', '有纸巾']
  },
  {
    name: '兰州黄河风情线公厕',
    city: '甘肃·兰州',
    address: '黄河风情线沿线',
    lat: 36.0620,
    lng: 103.8310,
    photoUrls: ['https://loremflickr.com/cache/resized/7085_7338411630_a4fdd0fb1d_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53847943858_9d926904de_b_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '黄河边上的景观公厕，看母亲河奔流。',
    reviews: [
      '黄河边救急还能看风景。',
      '兰州人的日常小确幸。',
      '干净明亮。'
    ],
    tags: ['黄河景观', '免费', '有纸巾']
  },
  {
    name: '天津五大道「民国风」公厕',
    city: '天津·和平',
    address: '五大道文化旅游区',
    lat: 39.1210,
    lng: 117.2020,
    photoUrls: ['https://loremflickr.com/cache/resized/7043_6958124375_82aa30a38f_c_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/2269_2170395918_5aab399e59_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '小洋楼风格公厕，与五大道万国建筑浑然一体。',
    reviews: [
      '洋楼造型和五大道太搭了。',
      '历史文化街区的门面。',
      '干净有味道。'
    ],
    tags: ['民国风', '免费', '有纸巾']
  },
  {
    name: '黄山「玉屏」高山公厕',
    city: '安徽·黄山',
    address: '黄山风景区玉屏景区',
    lat: 30.1210,
    lng: 118.1690,
    photoUrls: ['https://loremflickr.com/cache/resized/17_22697171_1de5a04cca_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54298361048_1496728657_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '海拔 1700 米的高山公厕，云海之上救急。',
    reviews: [
      '云海里的厕所，神仙体验。',
      '高山上维护得这么好不容易。',
      '看日出前的安心保障。'
    ],
    tags: ['高山', '免费', '有纸巾']
  },
  {
    name: '洛阳龙门石窟景区公厕',
    city: '河南·洛阳',
    address: '龙门石窟景区内',
    lat: 34.5540,
    lng: 112.4710,
    photoUrls: ['https://loremflickr.com/cache/resized/2011_2135531725_180c289c78_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/7137_8169013514_a9876a9311_z_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '世界遗产景区的配套公厕，游客口碑极佳。',
    reviews: [
      '石窟景区里救急很从容。',
      '干净，节假日也不慌。',
      '服务到位。'
    ],
    tags: ['景区', '免费', '有纸巾']
  },
  {
    name: '承德避暑山庄公厕',
    city: '河北·承德',
    address: '避暑山庄景区内',
    lat: 40.9930,
    lng: 117.9410,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_53170013846_614ac553aa_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53881163234_e0eb211384_b_640_400_nofilter.jpg'],
    seedScore: 4.4,
    hotDesc: '皇家园林里的公厕，古建风格与山庄相衬。',
    reviews: [
      '皇家园林里的小巧精致。',
      '干净整洁。',
      '有皇家范儿。'
    ],
    tags: ['古建', '免费', '有纸巾']
  },
  {
    name: '平遥古城公厕',
    city: '山西·晋中',
    address: '平遥古城景区内',
    lat: 37.2040,
    lng: 112.1810,
    photoUrls: ['https://loremflickr.com/cache/resized/4021_4255526838_c43621ec26_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53408549014_509659d44f_z_640_400_nofilter.jpg'],
    seedScore: 4.4,
    hotDesc: '晋商大院风格公厕，青砖灰瓦古意十足。',
    reviews: [
      '古城里的厕所也很有晋商味儿。',
      '干净体面。',
      '古城加分项。'
    ],
    tags: ['古建', '免费', '有纸巾']
  },
  {
    name: '大连星海广场公厕',
    city: '辽宁·大连',
    address: '星海广场滨海区域',
    lat: 38.8710,
    lng: 121.5810,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54217496658_a162ee43e8_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53910203703_276d54b1c6_b_640_400_nofilter.jpg'],
    seedScore: 4.5,
    hotDesc: '面朝星海湾大桥，滨海广场上的贴心驿站。',
    reviews: [
      '海风中的公厕很舒服。',
      '广场遛弯救急方便。',
      '干净明亮。'
    ],
    tags: ['海景', '免费', '有纸巾']
  },
  {
    name: '中卫沙坡头景区公厕',
    city: '宁夏·中卫',
    address: '沙坡头旅游景区',
    lat: 37.4710,
    lng: 105.0310,
    photoUrls: ['https://loremflickr.com/cache/resized/65535_54121607149_63ca92a47a_z_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_53054725506_71c30d3b96_b_640_400_nofilter.jpg'],
    seedScore: 4.4,
    hotDesc: '大漠黄河边的公厕，沙漠之旅的补给站。',
    reviews: [
      '沙漠里的干净厕所很难得。',
      '景区配套很好。',
      '好评。'
    ],
    tags: ['沙漠', '免费', '有纸巾']
  },
  {
    name: '哈尔滨冰雪大世界公厕',
    city: '黑龙江·哈尔滨',
    address: '冰雪大世界园区',
    lat: 45.7810,
    lng: 126.5710,
    photoUrls: ['https://loremflickr.com/cache/resized/8035_8072993800_0021b73fbf_b_640_400_nofilter.jpg', 'https://loremflickr.com/cache/resized/65535_54594442505_b4e43179ec_z_640_400_nofilter.jpg'],
    seedScore: 4.4,
    hotDesc: '冰雪主题公厕，极寒天气里的暖心存在。',
    reviews: [
      '冰天雪地里太重要了。',
      '园区配套给力。',
      '干净暖和。'
    ],
    tags: ['冰雪', '免费', '有纸巾']
  }
]