---
description: 检查导图的改动，写一条清楚的提交信息并提交
argument-hint: "[导图文件，默认 mindmap.md]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(node:*)
---

1. 运行 `node "${CLAUDE_PLUGIN_ROOT}/bin/mindgit.js" summary $ARGUMENTS`，看“最新版本”下面列出的未提交变化；再用 `git diff` 看导图文件和 `assets/` 的具体改动。
2. 没有改动就告诉用户没什么要提交的。
3. 用一句中文写提交信息，说清楚哪些功能新增了、哪些状态变了，例如“登录模块：短信验证完成，新增微信登录”。
4. `git add` 导图文件和新增的图片，然后 `git commit`。不要提交无关文件，不要 push。
5. 告诉用户提交了什么。
