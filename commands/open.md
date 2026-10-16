---
description: 打开 Mindgit 画布，在浏览器里编辑导图，改动和 md 文件双向同步
argument-hint: "[导图文件，默认 mindmap.md] [--port 4321]"
allowed-tools: Bash(node:*), Bash(ls:*)
---

在后台启动 Mindgit 画布服务（用 Bash 的 run_in_background）：

```
node "${CLAUDE_PLUGIN_ROOT}/bin/mindgit.js" serve $ARGUMENTS --open
```

如果没给文件且当前目录没有 `mindmap.md`，先问用户导图文件在哪，或建议用 `/mindgit:init` 新建。

启动后告诉用户：
- 画布地址（输出里的 http://localhost:端口）
- 在画布上点选节点就能改：Tab 加子节点，Enter 加同级，双击改名，1–4 设状态，拖入或粘贴图片
- 画布上的改动会直接写回文件；你（Claude）改文件时，画布也会实时更新
- 改完想存一个版本时，用 `/mindgit:commit`

端口被占用时换一个端口重试。
