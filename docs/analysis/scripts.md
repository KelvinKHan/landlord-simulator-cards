# 30 个脚本的职责和依赖

源码位置以 [README 定位约定](README.md#阅读定位约定) 为准。这里记的是实际代码的读写方向，不以脚本名称和注释代替判断。CSS、图标、动画与界面事件也已纳入结构检查；以下集中写它们对业务配合产生的影响。

## 变量底座与入口

| 编号 / 名称 / 状态 | 提供的能力与依赖 | 数据、事件和其他组件的配合 |
| --- | --- | --- |
| S00 MVU zod（开）／开 | 只有一条 import，加载 MVU artifact/bundle.js。依赖助手全局接口。 | 解析 W00 初始数据和消息补丁，提供 Mvu API。并非将 MVU 固定为某个版本；远端地址没有 commit/tag。脚本按钮含重处理变量、重读初值等，运行实现来自远端。 |
| S01 变量结构（开）／开 | 定义 Zod 4 schema，import registerMvuSchema；使用全局 z、$。 | 世界四字段、公寓、租客、大富翁、分基地。房间 refine 限制住户只能在卧室/您的房间；顶层 superRefine 试图保证住户与租客双向对应。当前辅助库重建顶层对象会丢掉这一检查。没有唯一楼层、格子冲突、固定房保护等完整约束。证据：S01:12–129。 |
| S02 悬浮球管理／开 | 父窗口 FloatingMenuManager，registerButton/unregisterButton，待注册队列 `_fmmPendingRegistrations`。 | 管理按钮排序、拖拽与位置；原公寓、手机、工坊、switcher、大富翁通过它或备用独立按钮打开。destroy 会清空注册表；重新装载管理器后，先前模块是否重新注册需验证。S02:514–699。 |
| S03 switcher／开 | 扫描当前角色脚本/正则，内置按名字匹配，用户快照按 ID 匹配。 | localStorage 保存开关预设；只调整 character 级别，不调整全局预设、世界书或数据库。关闭脚本后执行名字匹配的 DOM/全局清理；导出按钮复制启停名单。模式差异见 flows.md。 |
| S04 公寓（开）／开 | 公寓 2D/3D 展示、建造、装修、招募、人物/关系、主题；可选 Three.js。 | 找最近非用户消息读取 MVU，缓存在本脚本。操作主要追加主输入框命令；打开面板时刷新。提供父窗口 getApartmentBedrooms、refreshApartmentData、关系界面接口，供 R04/S22/S23 使用。卧室 API 只读缓存；未打开/未刷新时可能为空或旧值。S04:1957、2675、2868。 |
| S05 悬浮球示例（别开）／关 | 两个 echo 示例动作和位置重置。 | 无租客/变量业务，仅模板。清理时对父 document 使用未命名空间的 off(mousemove/touchmove/…)；误启停可能影响别的拖拽处理器。S05:371–425。 |

## 原版手机：基础层

| 编号 / 名称 / 状态 | 提供的能力与依赖 | 数据、事件和其他组件的配合 |
| --- | --- | --- |
| S06 小手机主程序／开 | 父窗口 PhoneSystem：APP 注册、renderer、事件、设置、副 API；生成内层手机 iframe。 | settings 存角色名分区 localStorage，壁纸另存。通过 postMessage 打开 APP/返回桌面/保存配置；iframe 时钟优先 MVU，每 3 秒更新。**新闻生成系统就在这里**，S20 只是界面。新闻直调副 API，按游戏日期轮询并写 phone_news。请求没有统一超时/取消；消息接收未核对 source/origin；保存配置的日志会包含配置对象。S06:216–725、1010–1120、1340 起。 |
| S07 聊天数据库／开 | 父窗口 ChatDB，IndexedDB TenantChatDB。 | conversations 以 chatId 分区，messages 以 conversationId 分区。维护群/私聊、游戏时间、未读、删除/撤回、导入/导出；需 S13 打开时 init。群成员主要由用户手动同步。导入非 merge 时先清空当前聊天，再处理结构，需先完整验证输入。S07 全部。 |
| S08 分析调度器／开 | 父窗口 AnalysisScheduler，优先级队列，单任务串行，历史 50 条。 | 已接入的核心任务是 S09 租客分析；定义 NEWS 类型不等于 S06 已使用它。取消只处理排队任务，没有运行中 abort、超时、重试、chatId 绑定。初始化会重置队列/历史。S08 全部。 |
| S09 租客分析系统／开 | 父窗口 TenantAnalyzer；使用 PhoneSystem、副 API、S08、MVU、世界书 API。 | 近期消息名字筛选 → 固定/旧动态 + 上下文 → 副模型 → `[租客动态]姓名`。原版每消息截取 500 字并去 HTML 标签；去标签不等于去掉 JSONPatch 内容。存每聊天进度，但排队任务未锁定原聊天；异步完成可能在切换后写当前书。脚本底部和 init 都安装 watcher，须验证重复注册。 |
| S10 分析队列组件／开 | 队列浮层，依赖 S08 queue-updated。 | 显示当前任务及最多 3 个等待任务，不执行任务、不写游戏数据。延迟 500ms 后只探测一次调度器；如果当时不存在不会自动重订阅。原实例 DOM 存在时，元素引用重建也需验证。S10:298–341。 |
| S11 聊天核心／开 | 父窗口 ChatCore；读 ChatDB、TenantAnalyzer、MVU 和 PhoneSystem 设置。 | 群聊解析“成员名:消息”，私聊清洗前缀；自行 fetch 副 API，支持 abort，不经过 S08。读取近期主剧情、人物固定/动态资料及其他会话摘要，具体窗口见 flows.md。主世界书 W14 不会自动进入这些独立提示词。失败可留下已写用户消息；没有自动 MVU 更新。 |
| S12 聊天正文联动／开 | 父窗口 ChatSync，将 ChatDB 最近消息转换为短摘要。 | 500ms 按会话防抖，但全局 syncInProgress 忙时直接放弃。缓存首个 WORLDBOOK_NAME 后未按聊天清空；写 `[租客微信]…`。忽略写入函数 false，仍把消息标为已同步；删除最后一条后空摘要不清理旧世界书。兼容 slash 创建条目与变量回退均不等价于主路径。S12 全部。 |

## 原版手机：应用层

| 编号 / 名称 / 状态 | 提供的能力与依赖 | 数据、事件和其他组件的配合 |
| --- | --- | --- |
| S13 聊天APP／开 | PhoneSystem 的通讯界面，依赖 S07/S11/S12。 | 打开时确定 chatId 并初始化 DB，创建业主群。输入→存用户消息→生成回复→同步；提供撤回、删记录、群成员同步、导入导出。表情包读取工坊 IndexedDB，发图/描述但不会自动触发 AI 回复。关闭界面不等于取消未完成请求。 |
| S14 租客档案APP／开 | PhoneSystem 的档案界面，依赖 TenantAnalyzer 与 AnalysisScheduler。 | 查看固定/动态档案与进度、手动分析、修改间隔（偶数，4–100）等。不是 R04 的档案入库界面；不直接改 MVU。每次打开添加轮询和监听，关闭仅移除 DOM，需验证重复订阅。S14:588 起。 |
| S15 提示词/控制台查看器／开 | 原版调试 APP，拦截父窗口 console、PhoneSystem.callExternalAPI 和已存在的 ChatCore.callAPI。 | 保存内存日志和请求记录供查看。对 ChatCore 只记录传入 user prompt，不代表完整请求的 system/assistant 前缀；对 S21 直接 fetch 没有统一拦截。启用顺序影响挂钩覆盖面；配置日志可能进入调试记录。 |
| S16 地图／开 | 手机城市静态图与 20 个地点按钮。 | 用“我前往了地点”覆盖主输入框，等待用户发送；不写变量、没有位置服务；与 W13 触发不一致。 |
| S17 音乐／开 | PhoneSystem 音乐 APP、父页面 audio、收藏/历史/队列/歌词。 | 调第三方 api.vkeys.cn 搜索与获取 QQ 音乐地址，XHR 超时 10 秒；播放依赖远端资源。localStorage 保存收藏、历史及部分播放状态。没有世界书、主模型或 MVU 联动；不等同于 S28 环境音。 |
| S18 世界地图／开 | Leaflet 1.9.4、地图瓦片、Nominatim 搜索；读取 MVU 租客。 | 世界目的地/坐标/同行选择→填主输入框→W13。不会主动发送；不写独立位置状态；没有向天气系统传目的地。 |
| S19 天气APP／开 | 自带 WeatherSystem 与手机 renderer。 | 日期种子、季节、天气持续时间/转移矩阵、每 2 小时预报；生成 7 天数据，小时推进更新当前天气与变化说明。浏览器保存、30 秒轮询，写 phone_weather。日期读取与 MVU 主路径不同；新聊天无缓存时未显式清空旧 data，日期/小时又相同时有沿用旧预报的可能。S19:176–620、712–1172。 |
| S20 新闻／开 | PhoneSystem.newsSystem 的显示和刷新 APP。 | 订阅 news-updated，调用 S06.generateNews；不直接从正则读取，不自己构造生成 prompt，不经过 S08。标题时间显示也混有宿主实际时间。 |
| S21 和欧欧聊天吧！／开 | 独立 OC 聊天 UI，注入原版联系人界面。 | 固定的欧欧人设 + 单独聊天历史 → 自己 fetch 副 API；使用 PhoneSystem 配置，但不经其调用封装。不读租客/公寓/ChatLore，明确是独立网友关系。历史保存在单独 localStorage，未同步正文。错误文本可能作为 OC 回复保存。S21:61–188、453–632。 |

## 跨消息与扩展玩法

| 编号 / 名称 / 状态 | 提供的能力与依赖 | 数据、事件和其他组件的配合 |
| --- | --- | --- |
| S22 美化完整修复版 by jovial_dolphin_19209／开 | 独立消息渲染器，直接重建父页面消息主体。 | 读原始消息、处理 thinking、自定义标签、最近 10 条深度；重复实现 R03–R08 的候选人/档案/DLC，尾部仍用 formatAsDisplayedMessage。依赖助手消息 API、S04 卧室 API、ChatLore 与 slash；保存配置到 IndexedDB。详见 regex.md。 |
| S23 创意工坊main／开 | 本地素材库、预设、表情包、世界观、云端交流界面；可选 FloatingMenuManager。 | WorkshopStickersDB 内容与表情，localStorage 设置/预设/活跃世界观。角色写固定档案后填入住指令；房间填建造指令；世界观改 ChatLore 和第 0 条消息。云端浏览/下载/上传/Discord 登录/审核接口是独立分支，连接 workshop-api.chenoo.workers.dev 或本地指定 apiBase；只有相应操作才上传内容。未在本分析中调用。S23:480–515、698–851、924–1112、1587–1632。 |
| S24 大富翁主脚本／关 | 图结构棋盘、骰子/岔路、功能格/场景格/房产格/事件格、小游戏、筹码道具、据点分红、同行和 NPC 招募。 | 当前消息 MVU 大富翁/分基地由脚本直接读改写。场景指令临时写 ChatLore，回复后清理；NPC 主基地复用 TenantLore，分基地另有 DOM 取名回写。模型提示大多要求不输出变量更新。头像另存 IndexedDB，图像从 HuggingFace 资源加载。activeBuffs、尺度配置等与 S01 缺字段；等级上限同时出现 3 与 4。S24:373–445、2909–3144、3732–3953、4315–4360。 |

## 二改版：默认全部关闭

| 编号 / 名称 | 替代关系及接口 | 与原版未统一之处 |
| --- | --- | --- |
| S25 公寓（二改版） | Shadow DOM 中的 AptSystem 底座，集成公寓、设置、日志/API查看、通知岛、注册模块、队列（最多 2 并发，最多重试 3 次，90 秒超时）。支持建筑、人物、关系查看，读取 MVU。 | 调用缺失的 initCentralState 导致标准导出启动路径断在初次 MVU 渲染前；未提供原版 getApartmentBedrooms。API/主题存 apt_os_settings；界面读取用户资金及世界天气，schema 未完整声明。建造命令可能直接发送，和原版只填输入框不同。provider 下拉存在，但网络请求仍用 OpenAI 兼容格式，不能据此认定原生 Claude 协议可用。 |
| S26 租客分析系统（二改版） | 挂载 AptSystem，集成分析引擎、档案 UI 和设置；重新占用父窗口 TenantAnalyzer 名称。 | 固定/动态条目名沿用原版，但默认只分析 content 标签，进度仅内存且未按聊天重置。消息 watcher 标志挂在父窗口；停用重启时旧标志与监听是否一致需验。与 S09 同时启用会争用 TenantAnalyzer 和动态档案。 |
| S27 聊天系统（二改版） | 集成 ChatDB/Core/Sync/App，父窗口导出 AptChatDB/AptChatCore/AptChatSync/AptChatApp，并提供 AptOS_ChatAPI.pushMessage。 | DB 为 AptChatDB，不迁移原版聊天。世界书前缀仍 `[租客微信]`，继承缓存书名、忙时丢同步、空消息不清旧条目等问题。摘要扩大为群聊 15/私聊 12 条、每条 200 字、总约 2500 字。通过 AptSystem.callExternalAPI 请求，但聊天本身不排进 Scheduler。pushMessage 未同步世界书，且 DB 需先初始化。 |
| S28 音乐（二改版） | 实际为环境音电台，挂在 AptSystem；11 段固定音频、手动/沉浸模式。 | 读 MVU 世界天气/时间，按关键词选择环境音；不继承 QQ 音乐收藏。世界.天气 没有当前卡内生产者；`14:30` 也不匹配晨/午/晚/夜关键词，时间匹配常退到默认。 |
| S29 报社系统（二改版） | AptSystem 的 BayNewsDaemon 和报纸 UI/设置。15 秒检查日期，走 Scheduler 和副 API，生成新闻 JSON。 | 与 S06 写同一 phone_news，但使用 apt_news 缓存；默认 content 标签作为“秘密线索”，与原卡正文格式和 W14 知情规则不一致。任务未固定 chatId，完成时使用当前聊天存储键。 |

## 必须一起考虑的接口组

| 改动对象 | 至少需要联查 |
| --- | --- |
| 人物名字、档案格式、招募按钮 | W06/W07、R03/R04、S22、S23、S24、S09/S26、S11/S27、房间住户 |
| 房间/租客/世界数据结构 | W00/W01/W02/W03/W04、S01、S04/S25、S23/S24、手机所有 MVU 读者 |
| 主正文 XML 标签 | W06–W11、R03–R08、S22、S09/S26、S11/S27、S06/S29 的上下文提取 |
| 手机发送/撤回/导入导出 | S07/S11/S12/S13；二改对应 S27；固定/动态 ChatLore 不应随聊天撤回误删 |
| 模式切换/脚本卸载 | S03、S02、PhoneSystem/AptSystem、TenantAnalyzer、全部 parent 全局与事件、数据库分区 |
| 世界观和开场变更 | W00/W05/W07、全部开场、S23、MVU 初始化及重演、所有监听聊天切换的后台任务 |

这些关系是后续修改范围的依据。一次局部修复应明确它作用于原版、二改版还是两者，并通过对应入口验证。
