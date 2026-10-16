# Mindgit

用 Markdown 写思维导图，用 git 管版本，渲染成一个可以回放历史的可视化页面。

## 用法

```bash
node bin/mindgit.js ../product-map/mindmap.md --out dist/index.html
```

打开生成的 `dist/index.html` 即可，页面是单文件，不需要服务器。

- 读取这个文件在 git 里的每一次提交，加上还没提交的修改
- 时间轴可以逐个版本切换，或点 ▶ 回放全部
- 每个版本会高亮相对上一版的新增节点和状态变化
- 右侧显示整体进度和每个模块的进度，点状态标签可以筛选节点

## Markdown 约定

- `#` 一级标题是导图中心，`##`、`###` 和列表缩进是层级
- 状态标签：`[待开发]` `[进行中]` `[完成]` `[搁置]`，也支持 `- [ ]` / `- [x]`
- 优先级标签：`[P0]` `[P1]` `[P2]`

## 结构

- `src/parse.js`：Markdown 转树、版本对比、进度统计（浏览器和 Node 通用）
- `src/template.html`：渲染页面
- `bin/mindgit.js`：命令行，读 git 历史并生成 HTML
