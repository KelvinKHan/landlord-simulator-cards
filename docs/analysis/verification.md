# 核验记录与验收方案

## 本次完成的检查

| 检查 | 结果 | 证明的范围 |
| --- | --- | --- |
| JSON 结构、PNG 签名/CRC、chara/ccv3 数据一致性、原始 SHA-256 | 通过 | 两份原卡未被分析过程修改 |
| 55 个组件提取与元数据索引 | 通过 | 16 世界书、9 正则、30 脚本，ID 在各集合内唯一；原始 ID、开关及扩展字段保留 |
| 30 个脚本的 Babel 语法解析 | 30/30 通过 | JavaScript 能解析；没有执行脚本或远端 import |
| 正则替换中的 JavaScript | 3/3 通过 | R03、R04、R05 的内嵌脚本语法正确 |
| S06 动态生成的手机 iframe 脚本 | 1/1 通过 | 仅对 AST 中字面量作拼接，动态内容换成无行为占位文字后解析；不是执行生成器 |
| 九条正则编译 | 9/9 通过 | 按已固定的 ST 字符串解析算法处理，不为裸正则擅自补 g |
| 18 组离线接口探针 | 已记录预期行为及缺口 | 包括 R02 贪婪范围、严格候选格式、旅行触发、开关模式、缺函数、Zod 重建/事务、重复楼层、EJS 标记 |
| EJS 起始标记扫描 | 0 处 | 本卡 JSON 内没有 `<%`，不代表用户全局预设没有 EJS |

34 段 JavaScript 语法均通过；发现的问题属于逻辑、数据契约及生命周期，不能用“语法无错”排除。完整输出见 [contract-checks.json](contract-checks.json)。

### 关键离线结果

- R00 的两个方向标志可分别生效，但无 g；连续两个占位符会剩一个。
- R02 的两块更新间正文丢失已复现。
- R03 原候选人字段解析只接受规定的英文冒号/空格/引号形式。
- S16 城市地图短语不激活 W13，S18 两种短语均激活。
- S03 原版启用 23 个脚本，与导出相差 S22 关/S24 开；二创启用 11 个。
- S25 赋值后的 AptSystem 没有 initCentralState；全卡只有一个调用引用。
- S23 wsAutoInjectWorldView 全卡只有一次定义引用，没有调用点。
- Zod 顶层对象重建会丢检查；未知顶层保留、未知嵌套删除；恢复双向一致性检查时，应同时提交关联对象。
- 幻想年份无法直接 parseInt 成数字；二改分析的 content 过滤不会匹配未包标签的正常正文。
- 六租客开场重复追加已有的“地下一楼”。

## 可复查命令

在仓库根目录运行：

```sh
python3 tools/validate_card.py --baseline
python3 tools/inspect_card.py
npm install --prefix .local/analysis-tools --save-exact @babel/parser@7.28.5 zod@4.1.11 --ignore-scripts --no-audit --no-fund
node tools/audit_contracts.cjs
git diff --check
```

Python 校验/提取只用标准库。离线 JavaScript 分析依赖安装在 `.local`，不属于角色卡运行依赖，不会改变 SillyTavern 或用户全局 Node 设置。执行期间采用 Node 24.14.0、Python 3.9.6、Babel parser 7.28.5、Zod 4.1.11。

提取工具默认写 `.local/inspection/`，保留原文内容与行号；分析探针写 `.local/analysis/contract-checks.json`。工具不使用 eval，不调用角色脚本函数，不打开网页，不发送生成请求。Zod 实验用自行构造的最小对象验证库行为。

## 对照过的上游版本

这些是本次只读核查的参考版本，**不是用户实际安装版本**。源文件 URL、字节数及哈希记录在 [sources.json](sources.json)。旧 `.cursor/rules` 入口与当前模板入口见 [开发参考](../references.md)。

| 上游 | 参考提交 | 核查内容 |
| --- | --- | --- |
| SillyTavern/SillyTavern release | `8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8` | 正则方向/顺序/解析，世界书导入字段 |
| N0VI028/JS-Slash-Runner main | `8e0f4324e7d051025a333831411f03bd3145fac8` | 世界书 API、消息变量、宏替换、事件名称、脚本 iframe 装载 |
| MagicalAstrogy/MagVarUpdate beta | `61010dab47bc3a08a1b626320bf7fc8c9573eca4` | InitVar、JSONPatch 翻译、变量更新事件和辅助接口 |
| StageDog/tavern_resource main | `dee97e8c3e24e1e75efe21141743e4b5c0af776e` | Zod schema 注册与逐命令验证 |

实际卡内的两个 import 没有版本锁，本次还直接下载了它们作为**文本**比对：

| 文件 | 字节 | SHA-256 |
| --- | --- | --- |
| [卡内 MVU bundle 地址](https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js) | 307765 | `be149c7fb531c9f8755bde722931b3389ac8470218248fec12440d2b2a9b9c89` |
| [卡内 mvu_zod 地址](https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js) | 4705 | `78c40f52d81022d9d769a923a49e673b8babb562656051a7d0410b6b19f45184` |

下载内容留在被忽略的 `.local/analysis/upstream/`，未作为第三方依赖源码上传，也未据此升级卡内 import。JSONPatch 的 `add` 是该 MVU 解析器接受的 insert 别名，六租客开场使用 add 本身不是错误。依据：[补丁翻译实现](https://github.com/MagicalAstrogy/MagVarUpdate/blob/61010dab47bc3a08a1b626320bf7fc8c9573eca4/src/function/update_variables.ts#L218)。

已确认标准事件名称为 `message_received` 与 `chat_id_changed`。部分脚本写字面量 `MESSAGE_RECEIVED` 或 `chat_changed`，不能与枚举对象的成员名混淆；是否另有兼容事件由实际运行环境决定。依据：[助手事件定义](https://github.com/N0VI028/JS-Slash-Runner/blob/8e0f4324e7d051025a333831411f03bd3145fac8/@types/iframe/event.d.ts#L193)。

## 外部服务关系

| 用途 | 卡内连接来源 | 本次是否实际调用业务 |
| --- | --- | --- |
| 主模型 | 用户 SillyTavern 的主 API，未包含在导出中 | 否 |
| 手机聊天/分析/新闻/欧欧 | 用户手机或 AptSystem 设置的副 API | 否，未读取用户配置 |
| MVU / Zod helper | jsDelivr 上的 GitHub 构建文件及其 import | 仅下载两个入口为文本，不运行 |
| 工坊 | workshop-api.chenoo.workers.dev 或 workshop_apiBase | 否；未登录、上传、下载业务素材、调用管理接口 |
| 地图 | Leaflet CDN、OpenStreetMap 瓦片、Nominatim | 否 |
| 音乐 | api.vkeys.cn 及返回的音频地址 | 否 |
| 二改环境音 | actions.google.com/sounds | 否 |
| 棋盘图片/图标/装饰图 | HuggingFace、Iconify 等 | 否 |

当前实际可达性、CORS、服务配额、iframe CSP、模型输出质量均未由静态检查证明。源码中的 localhost 图床分支当前由 `_USE_HF=true` 关闭，不应误认为正常游玩必须启动 localhost:3456。

## 本次交付的手动验收

1. 打开分析总览，能沿编号找到全部 55 个组件及其输入/输出。
2. 沿 flows.md 走一遍“招募→固定档案→保存→正式入住”，核对自己的设计意图；每个存储位置和执行者均已分开说明。
3. 查看 findings.md，确认问题证据和拟修复范围；没有任何业务修复被暗中写回原卡。
4. 运行 validate_card.py --baseline，应输出 PASS；GitHub 可看到新增分析文档、工具和原有原卡。

## 下一阶段的真实酒馆验收矩阵

以下均应在独立测试聊天、测试数据与明确的插件版本中执行；本次尚未执行。

| 场景 | 通过条件 |
| --- | --- |
| 冷启动、刷新、慢网加载 | MVU/schema/公寓/手机均可用；脚本不重复注册，控制台无启动断点 |
| 空公寓开局、六租客开局 | 初值、楼层唯一性、房间格子、租客对应正确；预置固定档案有来源 |
| 建造/装修/拆除 | 操作在预期时机发送；固定/有住户房间保护成立；显示与 MVU 相符 |
| 五选一、五选二 | 候选人解析完整，生成对应档案；选择阶段不提前入住 |
| 保存、空房入住、合租、退租 | 档案和人物 ID 一致；关联数据一次完成；失败可恢复 |
| 美化开/关、消息编辑、重生成、旧楼层 | 标签渲染一致；按钮不重发，原始消息不被改坏 |
| 原版手机群聊/私聊、失败、撤回全部 | DB、世界书、主提示词三者同步，错误不会显示成功 |
| 两聊天往返、请求未完成时切换 | 无内容或任务写到另一个聊天；分支归属正确 |
| 分析自动/手动、网络超时 | 正确选择人物与上下文，完成前不假报成功，不产生重复任务 |
| 日内、跨日、跨年、幻想历法 | 公寓、天气、新闻使用一致世界时间；新聊天不会继承旧缓存 |
| 人物秘密与群聊新闻 | 不在场角色、群聊成员、新闻不能凭空获得受限事实 |
| 工坊应用角色/房间/世界观 | 每个按钮修改范围符合说明；更换世界观可回滚，旧附加规则不残留 |
| 大富翁结算、增益、分基地招募 | 直接状态更新持久化；AI 不重复扣款；名字关联不依赖渲染后标签 |
| 原版→二创→原版 | 无缺函数、冲突全局或孤立计时器；数据库迁移/隔离与世界书摘要一致 |
| 导入合法/损坏/重复备份 | 校验先于清空；失败保留旧数据；重复导入不破坏引用 |

主 API 与副 API 的版本、模型和安装配置仍未提供；这些属于实际验证的输入，不影响本次完整源码关系梳理的完成。
