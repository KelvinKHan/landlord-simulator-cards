# 房东模拟器角色卡

《房东模拟器》SillyTavern 角色卡的维护仓库。

当前阶段：已建立工作区，并完成 Z5.20 世界书、正则、脚本配合关系的静态梳理。
当前重点是理解项目，尚未开始业务修复；作者已取消大富翁开发方向，原始导出中的相关内容保留作基准。
初始公开提交包含两份原始卡、文档和校验工具。
克隆本仓库即可在 `originals/` 获取 Z5.20 原始 JSON 和 PNG。

## 目录

| 目录 | 用途 |
| --- | --- |
| `originals/` | 原始 JSON 和 PNG，作为不可覆盖的基准备份 |
| `src/` | 后续整理的角色设定、世界书、脚本、正则与界面源码 |
| `exports/` | 后续可导入 SillyTavern 的成品卡 |
| `docs/` | 参考资料、环境记录和基准文件清单 |
| `tools/` | 原卡校验、只读提取及离线接口核验工具 |

## 配合关系梳理

[先读项目整体理解](docs/analysis/project-model.md)：从玩法、人物记忆和一次操作如何完成理解项目。

[分析总览](docs/analysis/README.md)提供 16 个世界书、9 条正则和 30 个脚本的逐项依据，包含数据流、招募与入住流程、手机记忆同步及原版/二改版差异。

本次分析保留原始 JSON/PNG 和全部启停设置，未修订卡内业务逻辑。作者已确认本仓库的公开维护范围。

## 已检查的基准

- 名称：房东模拟器Z5.20；格式标识：`chara_card_v3` / `3.0`。
- 世界书 16 条；酒馆助手脚本 30 个（启用 23 个、停用 7 个）；正则规则 9 条；备用开场白 2 条。
- PNG 尺寸 512 × 768，内含 `chara` 与 `ccv3` 两份角色卡数据。
- 两份 PNG 内嵌数据均与独立 JSON 完全相同。
- `xiaobaix-tasks` 扩展存在，任务列表为空；酒馆助手变量字典为空。

上述结果来自静态文件解析。SillyTavern 内的导入、脚本执行、MVU 更新和界面渲染尚未联调。

## 校验

需要 Python 3.9 或更高版本，不需要安装第三方依赖。
在仓库目录运行：

```sh
python3 tools/validate_card.py --baseline
```

这会检查 JSON 结构、PNG 数据块校验和、两种格式内容一致性，以及文件是否仍与初次导入时完全一致。

将来核对其他成对导出文件时：

```sh
python3 tools/validate_card.py path/to/card.json path/to/card.png
```

工具支持本次 SillyTavern 导出所使用的 PNG `tEXt` / Base64 角色卡元数据；不执行其中的 JavaScript。

只读提取全部组件：`python3 tools/inspect_card.py`。
JavaScript 语法和接口样例核验另需本地分析依赖，安装与运行步骤见 [核验记录](docs/analysis/verification.md)。

## 开发参考

详见 [参考资料](docs/references.md) 和 [环境记录](docs/setup.md)。
后续开发前先确定正在使用的 SillyTavern、酒馆助手及 MVU 版本，再按实际依赖配置运行环境。
当前没有安装、启动或修改 SillyTavern，也没有进行框架升级。
