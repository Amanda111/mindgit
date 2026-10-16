# Mindgit

Claude Code 插件：用 Markdown 写产品思维导图，用 git 管版本，在浏览器画布上编辑，改动和 md 文件双向同步。

- **画布编辑**：点选节点后改名、加子节点和同级节点、删除、设状态和优先级、插入图片，支持撤销
- **双向同步**：画布上的改动直接写回 md 文件；你或 Claude 改了文件，画布实时更新
- **历史回放**：读取导图文件的每次 git 提交，时间轴逐个版本切换，高亮每个版本新增的节点和状态变化
- **进度统计**：整体完成度和每个模块的进度，按状态筛选节点
- **AI 友好**：源文件是纯 Markdown，Claude 直接读写；插件自带技能，教 Claude 按约定改导图、写提交信息

## 安装

在 Claude Code 里：

```
/plugin marketplace add <这个仓库的地址或本地路径>
/plugin install mindgit@mindgit
```

需要 Node.js 18 以上，没有其他依赖。

## 命令

| 命令 | 作用 |
|---|---|
| `/mindgit:init [产品名]` | 新建 `mindmap.md` |
| `/mindgit:open [文件]` | 打开可编辑画布（本地服务，默认 http://localhost:4321） |
| `/mindgit:status [文件]` | 汇报进度和最近的变化 |
| `/mindgit:commit [文件]` | 检查导图改动，写清楚提交信息并提交 |
| `/mindgit:render [文件]` | 生成单文件 HTML（图片内嵌，可离线打开、发给别人） |

也可以直接对 Claude 说“把登录模块标记为完成”“给首页加个草图”，插件的技能会按约定改文件。

用 `/mindgit:render` 生成过 HTML 之后，Claude 每次改导图，插件的钩子都会自动刷新这个 HTML。

不在 Claude Code 里也能用命令行：

```bash
node bin/mindgit.js serve mindmap.md --open    # 画布编辑
node bin/mindgit.js summary mindmap.md          # 进度摘要（加 --json 输出 JSON）
node bin/mindgit.js render mindmap.md           # 生成 HTML
node bin/mindgit.js init mindmap.md --title 产品名
```

## 画布快捷键

| 按键 | 作用 |
|---|---|
| `Tab` | 加子节点 |
| `Enter` | 加同级节点 |
| `F2` / 双击 | 改名 |
| `1` `2` `3` `4` | 待开发 / 进行中 / 完成 / 搁置（再按一次取消） |
| `0` | 清除状态 |
| `Delete` | 删除节点 |
| 方向键 | 在节点间移动 |
| `Ctrl/⌘ + Z` | 撤销 |
| 拖入或粘贴图片 | 插入到节点，文件存进 `assets/` |

## Markdown 约定

```markdown
# 产品名

## 功能模块
### 登录 `[P0]` `[进行中]`
- 短信验证 `[完成]` ![草图](assets/login.png)
- [ ] 微信登录
```

- `#` 一级标题是导图中心；`##`、`###` 和列表缩进是层级
- 状态：`[待开发]` `[进行中]` `[完成]` `[搁置]`，也认 `- [ ]` / `- [x]`
- 优先级：`[P0]` `[P1]` `[P2]`
- 图片：写在节点那一行，或节点下一行单独一行

画布只改动相关的那几行，文件里其余的写法、空行和注释都保持原样。

## 结构

- `.claude-plugin/`：插件和插件市场清单
- `skills/mindgit/`：教 Claude 维护导图的技能
- `commands/`：斜杠命令
- `hooks/`：Claude 改完导图后刷新 HTML
- `src/parse.js`：解析、版本对比、进度统计、按行编辑（浏览器和 Node 通用）
- `src/template.html`：画布页面
- `src/server.js`：本地同步服务
- `bin/mindgit.js`：命令行
