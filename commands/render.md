---
description: 把导图和它的 git 历史生成一个单文件 HTML，可以直接打开或发给别人
argument-hint: "[导图文件，默认 mindmap.md] [--out 输出路径]"
allowed-tools: Bash(node:*)
---

运行：

```
node "${CLAUDE_PLUGIN_ROOT}/bin/mindgit.js" render $ARGUMENTS
```

默认输出到导图同目录的 `.mindgit/index.html`，图片会内嵌进去，不需要服务器。告诉用户文件路径，并说明：这个文件可以离线打开、回放历史版本；在里面的编辑不会写回 md，要编辑请用 `/mindgit:open`。

如果 `.mindgit/` 还没被 git 忽略，建议把它加进 `.gitignore`。
