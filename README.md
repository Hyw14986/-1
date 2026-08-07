# 去哪儿拉 - 便民找公共厕所小程序（附近厕所版）

基于微信云开发（云数据库 + 云存储 + 云函数）的找厕所小程序：按半径查找周边公厕、地图导航、评分评价、上报新点位、查询次数配额管理。

## 功能一览

- **首页（附近厕所）**：页面标题「附近厕所」，左上角下拉选择查询半径（500 / 1000 / 2000 / 3000 米），点击「开始寻找」才执行查询，整套查询成功后才消耗 1 次查询次数（每日上限 20 次，0 点自动重置，失败不扣次数）；地图中心永久锁定用户 GCJ-02 定位，绘制红色圆形查询圈，只渲染圈内公厕 marker；底部卡片统计「在您附近找到 X 个厕所」并可展开按距离排序的列表；点击 marker 打开详情弹窗（来源标签、设施标签、平均分、评价列表、导航 / 收藏 / 写评价 / 举报）
- **上报页**：填写名称、地图选点、详细地址、开放时间、多选设施标签（无障碍 / 母婴室 / 有纸巾 / 24小时开放）、收费情况单选（免费 / 收费 / 其他自定义）、上传现场照片（最多 3 张，存入云存储）；提交后写入 `toiletAll`，`auditStatus=pending`，需管理员审核通过后才对外展示；50 米内已有公厕会提示重复上报
- **我的页**：微信头像昵称授权登录；顶部展示「今日剩余查询次数：N / 20」进度条；功能入口：查询记录、关于小程序；模块：我上报的厕所（展示审核状态）、我的评价、我的收藏
- **查询记录页**：展示每次点击「开始寻找」的历史记录（查询时间、半径、找到厕所数量）；支持「再次查询」（回填半径回首页，不扣次数，需再点开始寻找）、单条删除、一键清空

## 重要业务规则

1. 仅用户手动点击「开始寻找」触发完整查询流程；只要自有数据库（getNearToilet 云函数）查询成功即消耗 1 次查询次数并新增查询记录，腾讯地图接口异常不影响扣次数与记录；仅当数据库云函数本身异常才不消耗次数；筛选、查看详情、再次查询回填半径都不消耗次数
2. 次数上限每日 20 次，每日 0 点重置，重置逻辑全部在云函数 `quotaOperate` 内部完成（比对 `quotaDate`），前端不做时间重置，防改手机时间作弊
3. 全程统一 GCJ-02 坐标系；红圈外点位不渲染、不进列表、不参与统计（禁止仅 CSS 视觉隐藏）
4. 数据源合并：`toiletAll` 自有库（gov 政府导入 / user 用户上报 / tencent 腾讯缓存 / osm 开放地图导入）+ 周边 POI 多源降级（腾讯 place/v1/search → 高德 place/around → 百度 place/v2/search → OSM Overpass 兜底）；POI 返回后做球面距离二次过滤，只保留圈内点位；腾讯 POI 命中时经 `saveTencentPoi` 50 米去重后缓存回库
5. 腾讯 POI 只缓存用户真实查询触发、且处于红圈之内的点位，`saveTencentPoi` 云函数内 50 米同名去重
6. 用户上报必须 `auditStatus=pass` 才展示；`invalid=true` 的点位全部过滤
7. 所有写库操作全部经由云函数（上报、评价、收藏、举报、查询记录、次数扣减），前端不直接写数据库，规避恶意刷数据
8. 查询容错（任一地图服务商报错 / 超时 / 返回空均不判定整体失败）：①任一服务商正常返回 → 合并过滤数据库点位与 POI 点位（来源分别标记 gov / user / tencent / amap / baidu / osm）；②服务商全部异常但数据库有数据 → 保留数据库点位渲染，toast「地图服务商暂时异常，仅展示用户上报的厕所点位」；③数据库云函数失败且服务商也失败 → 弹窗「查询失败，本次未消耗次数，请稍后重试」，不扣次数；④数据库无数据且服务商无数据 → 空状态弹窗「附近暂未找到公厕，试试扩大半径或上报新点位」（含扩大半径 / 上报按钮）；百度接口报 302/402（当日配额用尽）当日自动跳过；OSM 云函数未部署时静默跳过
9. 政府开放数据导入：`importCityToilets`（武汉 296 条 + 湛江 48 条）与 `importGovToilets`（达州宣汉旅游厕所 45 条 + 宿迁洋河新区公厕 34 条，CGCS2000≈WGS-84 入库时自动转 GCJ-02）两个导入云函数均已内置点位且幂等；在云开发控制台右键「云端测试」即可导入，重复执行不产生重复数据

## 云数据库集合

| 集合 | 用途 | 关键字段 |
| --- | --- | --- |
| `toiletAll` | 公厕主集合 | lat、lng（GCJ-02）、name、address、source（gov/user/tencent）、invalid、hasPaper、isCharge、isBarrierFree、hasBabyRoom、isOpen24h、openTime、feeType、feeDesc、photoUrls、auditStatus（pending/pass/reject）、rating、ratingCount |
| `toilet_comment` | 评价 | toiletId、openid、score（1-5）、content、nickname、avatarUrl、createTime；同一 openid 对同一 toiletId 仅一条 |
| `toilet_favorite` | 收藏 | openid、toiletId、createTime |
| `toilet_report` | 举报 | toiletId、reason、openid、createTime |
| `toilet_search_record` | 查询记录 | openid、searchRadius、searchCount、userLat、userLng、searchTime |
| `toilet_user_quota` | 每日次数配额 | openid、quotaDate（YYYY-MM-DD）、usedCount（上限 20） |
| `user` | 用户资料 | nickname、avatarUrl |

## 云函数清单（cloudfunctions/）

| 云函数 | 作用 |
| --- | --- |
| `quotaOperate` | 获取/消耗今日查询次数，每日 0 点重置（上限 20） |
| `getNearToilet` | geoNear 按半径查圈内有效公厕（invalid=false 且 auditStatus=pass） |
| `saveTencentPoi` | 缓存腾讯圈内 POI 到 toiletAll（50 米同名去重） |
| `searchRecordOperate` | 查询记录 add / list / delete / clear |
| `submitReport` | 用户上报（50 米重复检测 + 写入 pending 待审核） |
| `submitComment` | 提交评价（唯一性校验 + 聚合回写评分） |
| `favoriteOperate` | 收藏 add / remove / list / check |
| `submitReportComplaint` | 提交举报 |
| `getComments` | 公开读取公厕评价列表（管理员身份读取，不受权限限制） |
| `initData` | 一键导入全国 110+ 政府公开演示点位到 toiletAll（湖北 / 广东为真实地址） |
| `getOpenId` | 获取当前用户 openid |
| `importCityToilets` | 批量导入城市公厕点位（武汉 / 湛江，腾讯POI+OSM，GCJ-02，幂等） |
| `importGovToilets` | 批量导入政府开放数据点位（达州宣汉旅游厕所 45 条 + 宿迁洋河新区公厕 34 条，WGS-84→GCJ-02，幂等） |
| `fetchOsmToilet` | OpenStreetMap Overpass 兜底查询（WGS-84→GCJ-02，多镜像重试） |
| `fixToiletLoc` | 批量补全 toiletAll 缺失 loc 字段（仅云端测试手动触发，勿在客户端自动调用） |

## 部署步骤（重要）

### 1. 导入项目
打开微信开发者工具 → 导入项目 → 选择本目录，AppID 已配置为 `wx059b081bb01787a0`（如无该 AppID 的云开发权限，请换成自己的小程序 AppID）。

### 2. 开通云开发
工具栏点击【云开发】→ 开通 → 创建环境。若环境 ID 与你现有环境不同，请修改 `app.js` 中 `wx.cloud.init({ env: '你的环境ID' })`（当前为 `cloudbase-d7gjo6cw585f5db63`）。

### 3. 创建数据库集合并配置权限
云开发控制台 → 数据库，创建 7 个集合：`toiletAll`、`toilet_comment`、`toilet_favorite`、`toilet_report`、`toilet_search_record`、`toilet_user_quota`、`user`（或直接部署并运行 `initData`，它会自动创建这些集合）。
每个集合权限建议设置为：**所有用户可读，仅创建者可读写**（自定义安全规则更佳：读开放，写仅管理员/云函数）。

### 4. 为 toiletAll 创建地理索引（重要）
`getNearToilet` 使用 `geoNear` 地理位置聚合，必须先在云开发控制台为 `toiletAll` 集合创建地理索引：
- 点击 `toiletAll` → 索引管理 → 新建索引 → 字段 `lat` 与 `lng` 设置为**地理位置索引（2dsphere）**
- 未创建索引时 `getNearToilet` 会返回失败，首页会自动降级为腾讯 POI 查询，功能仍可用，但自有库点位无法按半径检索

### 5. 部署云函数
在开发者工具左侧资源管理器，找到 `cloudfunctions` 目录，依次对全部 11 个函数【右键 → 上传并部署：云端安装依赖】：
`quotaOperate`、`getNearToilet`、`saveTencentPoi`、`searchRecordOperate`、`submitReport`、`submitComment`、`favoriteOperate`、`submitReportComplaint`、`getComments`、`initData`、`getOpenId`、`importCityToilets`、`importGovToilets`、`fetchOsmToilet`、`fixToiletLoc`

### 6. 导入政府公开演示数据
部署完成后，在 `cloudfunctions/initData` 上【右键 → 云端测试】直接运行（参数可留空），会：
- 自动创建缺失的集合
- 向 `toiletAll` 导入 110+ 个点位（`source='gov'`、`auditStatus='pass'`，湖北 / 广东为真实地址，其余省市为地标附近粗略点位）
> 幂等设计：已存在 `source='gov'` 数据时自动跳过；如需强制重导，测试参数传 `{"force": true}`。

### 7. 配置腾讯位置服务 Key（可选增强）
`pages/index/index.js` 顶部 `QQ_MAP_KEY` 已填入一个 WebServiceAPI Key（`GEFBZ-6ZJK3-45U3Q-O4H6X-65A3K-NAFLU`）。
- 若提示 111（Key 授权 AppID 不匹配）或 121（当日配额用尽），请到 [腾讯位置服务](https://lbs.qq.com) 申请自己的 Key 并替换
- 同时在小程序后台【开发管理 → 开发设置 → 服务器域名】的 request 合法域名中添加：`https://apis.map.qq.com`
- **每日配额**：未认证个人账号「地点搜索」默认 **200 次/日**（QPS 5），完成实名认证后默认提升至 **2000 次/日** 并可申请更高额度（如 50000 次/日）。建议到 [腾讯位置服务-配额提升](https://lbs.qq.com/quotaImprove) 提交申请；代码内置本地每日调用预算保护（`pages/index/index.js` 顶部 `TENCENT_DAILY_BUDGET`，默认 190 次/日），达预算后当天不再发起腾讯请求、自动交由高德/百度/天地图等其他源，避免直接打满 121 硬限额

### 7.5 配置高德 / 百度 / 天地图 Key（备用数据源，可选）
周边 POI 查询默认为**多源合并模式**（`MERGE_ALL_PROVIDERS=true`）：每次「开始寻找」并行调用腾讯 / 高德 / 百度 / 天地图并合并去重点位（点位最多），各源当日额度耗尽自动跳过；改为 `false` 则退化为降级链模式（腾讯→高德→百度→天地图→OSM，任一成功即停止，更省接口配额）。任一源失败/为空都不影响整体查询与次数消耗。

- **高德**：`pages/index/index.js` 顶部 `AMAP_KEY` 已填入 Key（`5ad7207ca36306e6559d30ed02ef37bc`）。额度不足时到 [高德开放平台](https://console.amap.com/) 申请「Web服务」Key 并替换；request 合法域名需添加 `https://restapi.amap.com`
- **百度**：`pages/index/index.js` 顶部 `BAIDU_AK` 当前为占位符，需到 [百度地图开放平台](https://lbsyun.baidu.com/) 控制台 → 应用管理 → 创建应用，类型选「服务端」，获取 AK 后填入；同时在小程序后台 request 合法域名添加 `https://api.map.baidu.com`
  - 百度接口返回 BD-09 坐标，代码内置 `bd09ToGcj02` 自动转 GCJ-02；若报 302/402（当日配额用尽）当天自动跳过百度源
- **天地图**：Key 类型必须为「服务端」，存放在云函数 `searchTiandituPoi/index.js` 顶部 `TIANDITU_KEY`（已填入 `efac1d7241be6075e3b3a653e0acdc69`）。小程序客户端直连会被天地图识别为浏览器端访问，使用服务端 Key 会报 403（code 301013 权限类型错误），因此必须经该云函数代理查询；在开发者工具中部署 `searchTiandituPoi` 后前端自动生效，未部署时静默跳过该源
  - 天地图坐标基准为 CGCS2000（≈WGS-84），云函数内置 `wgs84ToGcj02` 自动转 GCJ-02；周边搜索走 `v2/search` 接口（旧版 `/search` 已失效返回 404，必须用 v2）`queryType=3`（pointLonlat + queryRadius），按天配额有限，当日用尽自动跳过；云函数出网不受小程序 request 合法域名白名单限制
- **OSM**：部署 `fetchOsmToilet` 云函数后自动生效，无需 Key；未部署时前端静默跳过
- **多关键词**：四个地图源按 `公共厕所 / 公厕 / 卫生间 / 洗手间 / 公共卫生间 / 旅游厕所` 逐词查询后合并去重（高德 `keywords` 用 `|` 一次传多词）。**高德 / 百度设为主流查询**（全 6 词），腾讯配额紧张仅查 1 个主词，天地图全 6 词；可在 `pages/index/index.js` 顶部 `SOURCE_KEYWORD_COUNT` 调整每个数据源的查询强度，各源遇到配额/限流类错误自动停止后续关键词
- **全源合规缓存**：任意地图服务商（tencent/amap/baidu/tianditu/osm）查询返回且处于红圈内的点位，都会经云函数 `saveTencentPoi`（历史命名，已支持全部来源）做 50 米同名去重后写入 `toiletAll`，跨用户共享、越用越多，减少后续 API 调用
- **用户查找历史**：每次查询成功并扣减次数后，前端调用云函数 `saveSearchedToilets` 把本次圈内公厕记录到 `toilet_view_record` 集合（字段：openid、toiletId、name、lat/lng、source、createTime/lastSeenTime）；同一用户 + 同名 + 50 米内视为同一条，只更新时间不重复插入，单次最多记 50 条，便于后续「我的」页面展示个人查找历史

### 7.6 政府开放数据导入与调研说明
政府开放数据没有单一「全国全集」，本仓库按可落地原则处理：
- **已内置可导入**（有经纬度）：`importCityToilets`（武汉 3131 + 湛江 487：高德POI网格采集 3274 + 腾讯POI 199 + OSM 145，2026-08-08 扩充）、`importGovToilets`（达州宣汉旅游厕所 45 条 + 宿迁洋河新区公厕 34 条，CGCS2000≈WGS-84，入库自动转 GCJ-02）。部署后在云开发控制台右键对应函数 → 云端测试即可，幂等可重复执行
- **调研结论（未内置）**：北海市 473 条（`bh.data.gxzf.gov.cn` 可直接下载但无经纬度，纯文本地址需地理编码，成本高未纳入）；达州平台同款 CMS 已破解下载直链；深圳/广州/山东平台存在公厕数据集，但下载需登录或字段不含坐标，待后续单独对接
- **住建部「城市公厕云平台」调研结论（不可接入）**：原入口 `lavatory.cnues.com` 域名已过期进入出售状态（实测为 4.cn 出售页），平台已停止运营，且从未公开过 API / 数据接口，无法接入；替代方案是各省市公共数据开放平台——已确认无锡（`data.wuxi.gov.cn` 环卫公厕分页查询服务）、温州鹿城（`data.wenzhou.gov.cn`，含高德经纬度）、十堰（`opendata.shiyan.gov.cn`，接口 `queryggcs`）等含经纬度公厕数据集，留待后续批量采集
- 政府数据统一写入 `toiletAll`，`source='gov'`、`auditStatus='pass'`、含 `loc` 地理字段，可直接参与 geoNear 圈内查询与地图渲染

### 8. 编译运行
点击【编译】即可使用。首次进入会请求位置权限，请允许。首页默认展示「请选择范围并点击开始寻找」，选择半径点击按钮后才会渲染红圈并加载公厕。

## 真机与发布注意事项

- **位置接口**：`app.json` 已声明 `permission` 与 `requiredPrivateInfos`（`getLocation`、`chooseLocation`）。真机运行前需在小程序后台【开发管理 → 接口设置】申请开通"地理位置"接口，并在【设置 → 服务内容声明】中补充《用户隐私保护指引》并勾选"位置信息"
- **基础库**：建议使用 3.0 以上基础库（云开发最低要求 2.2.3）
- **审核流程**：用户上报点位 `auditStatus=pending`，管理员在云开发控制台将 `toiletAll` 对应记录改为 `auditStatus='pass'` 后即可对外展示；举报记录在 `toilet_report` 查看，处理后可手动将对应点位 `invalid` 置为 `true`
- **数据权限**：云函数读写不受集合权限限制；前端只读浏览依赖集合「所有用户可读」权限，请按第 3 步配置

## 目录结构

```
├── app.js / app.json / app.wxss     # 全局配置：云开发初始化、tabbar（找厕所/我的）、定位权限、全局样式
├── project.config.json              # 项目配置（已声明 cloudfunctionRoot）
├── cloudfunctions/                  # 15 个云函数（见上表）
├── components/star/                 # 星级评分组件（展示 + 打分）
├── images/                          # tabbar 图标、地图标记、默认头像
├── pages/
│   ├── index/                       # 首页附近厕所（半径选择 + 红圈 + 圈内 marker + 详情弹窗）
│   ├── report/                      # 上报公厕页
│   ├── profile/                     # 我的页（次数配额 + 查询记录 + 上报/评价/收藏）
│   ├── searchRecord/                # 查询记录页
│   ├── list/                        # （旧版列表页，暂未引用）
│   └── detail/                      # （旧版详情页，暂未引用）
└── utils/util.js                    # 距离计算、时间格式化、openid 获取
```