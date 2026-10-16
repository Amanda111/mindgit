---
description: 新建一份产品思维导图（mindmap.md）
argument-hint: "[产品名]"
allowed-tools: Bash(node:*), Bash(git:*), Read, Edit
---

1. 如果当前目录已经有 `mindmap.md`，不要覆盖，告诉用户已经有了。
2. 运行 `node "${CLAUDE_PLUGIN_ROOT}/bin/mindgit.js" init mindmap.md --title "$ARGUMENTS"`（没给产品名就先问一句产品叫什么）。
3. 如果用户在对话里已经描述过产品的目标、用户或功能，把这些填进模板，替换占位的“模块 A / 模块 B”，按 mindgit 技能里的格式写状态和优先级。
4. 如果当前目录不是 git 仓库，问用户要不要 `git init`。是 git 仓库就提交一次：`git add mindmap.md && git commit -m "新建产品导图"`。
5. 最后提示可以用 `/mindgit:open` 打开画布。
