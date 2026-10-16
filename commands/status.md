---
description: 汇报产品导图的进度、进行中的事和最近一次的变化
argument-hint: "[导图文件，默认 mindmap.md]"
allowed-tools: Bash(node:*), Bash(git log:*)
---

运行：

```
node "${CLAUDE_PLUGIN_ROOT}/bin/mindgit.js" summary $ARGUMENTS
```

根据输出，用几句话告诉用户：整体完成度、每个模块的进度、现在在做什么、最近一次版本改了什么。如果有未提交的修改，提醒一下可以用 `/mindgit:commit` 存成一个版本。不要原样贴出整段输出。
