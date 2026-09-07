# 开发参考资料

入口检查日期：2026-09-07。这里记录文档入口，不代表已经安装对应插件或验证兼容性。

| 涉及内容 | 优先查阅 |
| --- | --- |
| SillyTavern 角色卡与世界书 | [源代码](https://github.com/SillyTavern/SillyTavern)、[官方文档](https://docs.sillytavern.app/) |
| 酒馆助手的脚本、接口与渲染 | [JS-Slash-Runner](https://github.com/N0VI028/JS-Slash-Runner)、[作者文档](https://n0vi028.github.io/JS-Slash-Runner-Doc/) |
| MVU，包括 MVU Zod 与 MVU beta | [开发模板](https://github.com/StageDog/tavern_helper_template)、[当前开发说明目录](https://github.com/StageDog/tavern_helper_template/tree/main/.agents/skills) |
| EJS 提示词模板 | [ST-Prompt-Template](https://github.com/zonde306/ST-Prompt-Template/) |

## MVU 参考链接变更

用户提供的旧入口是：
<https://github.com/StageDog/tavern_helper_template/blob/main/.cursor/rules>

检查时该路径不存在，上游 `main` 当前提供以下相关文件：

- [MVU 角色卡](https://github.com/StageDog/tavern_helper_template/blob/main/.agents/skills/mvu-character-card/SKILL.md)
- [MVU 变量框架](https://github.com/StageDog/tavern_helper_template/blob/main/.agents/skills/mvu-variable-framework/SKILL.md)
- [酒馆助手脚本](https://github.com/StageDog/tavern_helper_template/blob/main/.agents/skills/tavern-helper-script/SKILL.md)
- [酒馆助手前端](https://github.com/StageDog/tavern_helper_template/blob/main/.agents/skills/tavern-helper-frontend/SKILL.md)

这些链接用于后续查阅，未复制为本项目的本地技能或执行配置。
不要据此直接升级卡内 MVU；应先检查卡内的实际导入地址、版本标记及接口用法。
