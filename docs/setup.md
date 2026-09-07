# 初始环境记录

日期：2026-09-07。

## 工作区与仓库

- 工作区：`房东模拟器工作区/`。
- 独立 Git 仓库：`角色卡/`。
- GitHub：<https://github.com/KelvinKHan/landlord-simulator-cards>，公开仓库，默认分支 `main`。
- 首次公开内容包括原始 JSON / PNG、项目说明、开发参考和校验工具，上传范围已经用户明确确认。

## 可用工具

| 工具 | 检查时的版本 | 当前用途 |
| --- | --- | --- |
| Git | 2.50.1 | 本地版本管理 |
| GitHub CLI | 2.91.0 | 创建和检查远程仓库 |
| Python | 3.9.6 | JSON / PNG 结构与原始字节校验 |
| Node.js | 24.14.0 | 后续 JavaScript 工程准备，目前未使用 |
| npm | 11.9.0 | 后续依赖管理准备，目前未使用 |

新增依赖：无。

## 基准检查

- 原始文件复制前后 SHA-256 一致。
- JSON 可以解析，格式标识为 Character Card V3。
- PNG 签名与各数据块 CRC 校验通过。
- PNG 内的 `chara`、`ccv3` 均与独立 JSON 完全一致。
- 世界书 16 条，酒馆助手脚本 30 个（启用 23 个），正则 9 条，备用开场白 2 条。
- 校验工具能拒绝损坏的 PNG、内容不一致的 JSON / PNG 以及缺失文件。

## 本次主要命令

- `python3 tools/validate_card.py --baseline`：原始文件完整性与格式一致性校验。
- `git init -b main`、`git diff --cached --check`、`git commit`：初始化、检查和记录首个版本。
- `gh repo create --public --source=. --remote=origin --push`：创建公开仓库并同步初始版本。
- `gh repo view`、`git ls-remote`：确认远程可见性和提交状态。

Git 提交署名在本仓库内设置为 GitHub 用户名和对应的 noreply 邮箱，未改全局 Git 设置。

## 验收与边界

1. 在本地 `originals/` 找到两份原始文件。
2. 在仓库运行 `python3 tools/validate_card.py --baseline`，应输出“PASS”。
3. 打开 GitHub 仓库，确认公开状态及目录、说明和工具可见。

静态校验不证明插件运行兼容。尚未安装或启动 SillyTavern，尚未进行卡片导入、界面和脚本联调。
下一步先盘点世界书和脚本之间的关系、卡内远程依赖以及实际插件版本，再确定开发与回写方案。
