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
4. 数据源合并：`toiletAll` 自有库（gov 政府导入 / user 用户上报 / tencent 腾讯缓存）+ 腾讯 place/v1/search 周边搜索降级（自有库圈内 ≤2 条才调用）；腾讯返回后做球面距离二次过滤，只保留圈内点位
5. 腾讯 POI 只缓存用户真实查询触发、且处于红圈之内的点位，`saveTencentPoi` 云函数内 50 米同名去重
6. 用户上报必须 `auditStatus=pass` 才展示；`invalid=true` 的点位全部过滤
7. 所有写库操作全部经由云函数（上报、评价、收藏、举报、查询记录、次数扣减），前端不直接写数据库，规避恶意刷数据
8. 查询容错（腾讯接口报错 / 超时 / 返回空均不判定整体失败）：①腾讯正常返回 → 合并过滤数据库点位与腾讯 POI；②腾讯异常但数据库有数据 → 保留数据库点位渲染，toast「地图服务商暂时异常，仅展示用户上报的厕所点位」；③数据库云函数失败且腾讯也失败 → 弹窗「查询失败，本次未消耗次数，请稍后重试」，不扣次数；④数据库无数据且腾讯无数据 → 空状态弹窗「附近暂未找到公厕，试试扩大半径或上报新点位」（含扩大半径 / 上报按钮）

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
`quotaOperate`、`getNearToilet`、`saveTencentPoi`、`searchRecordOperate`、`submitReport`、`submitComment`、`favoriteOperate`、`submitReportComplaint`、`getComments`、`initData`、`getOpenId`

### 6. 导入政府公开演示数据
部署完成后，在 `cloudfunctions/initData` 上【右键 → 云端测试】直接运行（参数可留空），会：
- 自动创建缺失的集合
- 向 `toiletAll` 导入 110+ 个点位（`source='gov'`、`auditStatus='pass'`，湖北 / 广东为真实地址，其余省市为地标附近粗略点位）
> 幂等设计：已存在 `source='gov'` 数据时自动跳过；如需强制重导，测试参数传 `{"force": true}`。

### 7. 配置腾讯位置服务 Key（可选增强）
`pages/index/index.js` 顶部 `QQ_MAP_KEY` 已填入一个 WebServiceAPI Key（`GEFBZ-6ZJK3-45U3Q-O4H6X-65A3K-NAFLU`）。
- 若提示 111（Key 授权 AppID 不匹配）或 121（当日配额用尽），请到 [腾讯位置服务](https://lbs.qq.com) 申请自己的 Key 并替换
- 同时在小程序后台【开发管理 → 开发设置 → 服务器域名】的 request 合法域名中添加：`https://apis.map.qq.com`

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
├── cloudfunctions/                  # 11 个云函数（见上表）
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