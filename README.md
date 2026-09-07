# 房东模拟器角色卡

《房东模拟器》的 SillyTavern 维护仓库。作者拥有原卡及本仓库。

当前候选版：**5.21.0-rc.2**。已实现单一酒馆助手入口、原版/二改版选择、按正式 Release 更新脚本与官方世界书，以及启动、异步写入和重绘的时序修复。本版进一步移除大富翁、分基地的变量定义、世界书内容和新卡开场说明；原始 Z5.20 卡保持不变。

## 导入与游玩

1. 下载 [新版 PNG](exports/房东模拟器Z5.21.0-rc.2.png) 或 [新版 JSON](exports/房东模拟器Z5.21.0-rc.2.json)，任选一种导入 SillyTavern。
2. 安装并启用酒馆助手；允许本卡脚本、正则，并导入内置世界书。实际验证版本为 SillyTavern 1.18.0、酒馆助手 4.9.5。
3. 酒馆助手的角色脚本列表中只有 **房东模拟器 · 单入口**。在游戏右下角选择原版或二改版。
4. 选择开场后正常游玩。两版保留各自手机记录；切换会关闭当前应用窗口，现有正文记忆不会被清空。

在旧卡上单独替换脚本时，使用 [单入口脚本文件](exports/房东模拟器-单入口脚本.json)，并停用旧卡原有的整组脚本；不要让两组同时运行。原始卡仍可从 [originals](originals/) 取回。

要使用删除大富翁说明后的开场，请导入本版完整卡并新建聊天。脚本更新不会改写旧聊天开场，也不会主动清除旧存档字段；玩家改过的世界书条目在冲突时保留。详见 [大富翁移除范围](docs/removing-monopoly.md)。

入口代码：

```js
import 'https://cdn.jsdelivr.net/gh/KelvinKHan/landlord-simulator-cards@v5.21.0-rc.2/dist/bootstrap.js';
```

入口启动时查询 GitHub **正式 Release**。开发分支提交和候选版不会自动推送给正式版玩家；本入口在尚无正式版时使用自身候选版。详细行为见 [运行与更新说明](docs/runtime-and-updates.md)。

## 文件组织

| 目录 | 用途 |
| --- | --- |
| `originals/` | 原始 JSON / PNG，字节不变的基准备份 |
| `src/legacy/` | 保留原玩法的内部模块及针对性修复 |
| `src/runtime/` | 依赖顺序、资源清理、聊天归属、写入与重绘协调 |
| `src/updater/` | 正式版发现、完整性检查、缓存、世界书合并和失败恢复 |
| `src/content/` | 世界书、正则与不可变的 Z5.20 更新基线 |
| `dist/` | CDN 分发的入口、运行包、内容包和版本清单 |
| `exports/` | 可以导入的 JSON / PNG 和单入口脚本 |
| `tests/` | 自动测试；所有模型请求使用隔离样例 |
| `docs/` | 项目理解、修复范围、验收与发布说明 |

## 验证与发布

```sh
npm ci
npx playwright install chromium
npm run check
npm run test:integration
```

前一项检查包含构建、逻辑测试、Chromium 联调与原卡基准校验；后一项自动安装固定版本的隔离 SillyTavern 和酒馆助手，使用新建的临时测试数据，不读取个人酒馆或调用付费 API。

[测试记录](docs/testing/README.md) · [修复范围及仍待处理的问题](docs/timing-fixes.md) · [发布步骤](docs/releases.md)

旧版的 [整体理解](docs/analysis/project-model.md) 和 [逐组件分析](docs/analysis/README.md) 继续保留，描述的是 Z5.20 基准；新版修复状态以以上文档为准。
