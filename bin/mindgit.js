#!/usr/bin/env node
// mindgit render  <mindmap.md> [--out <path>] [--fragment]   生成可视化 HTML（默认 <目录>/.mindgit/index.html）
// mindgit summary <mindmap.md> [--json]                       输出进度和最近一次提交的变化，给人或 AI 读
// mindgit serve   <mindmap.md> [--port 4321]                  打开可编辑的画布，和 md 文件双向同步
// mindgit init    [mindmap.md] [--title <产品名>]             新建导图模板
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const P = require('../src/parse.js');

const L = P.STATUS_LABEL;
const argv = process.argv.slice(2);
const CMDS = ['render', 'summary', 'init', 'serve'];
const cmd = CMDS.includes(argv[0]) ? argv.shift() : 'render';
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const flag = name => argv.includes(name);
const positional = argv.filter((a, i) => !a.startsWith('--') && !['--out', '--title', '--port'].includes(argv[i - 1]));
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

function die(msg) { console.error(msg); process.exit(1); }

function findMap(given) {
  if (given) return path.resolve(given);
  for (const name of ['mindmap.md', 'MINDMAP.md', 'docs/mindmap.md']) if (fs.existsSync(name)) return path.resolve(name);
  die('没找到导图文件。请指定路径，例如：mindgit render docs/mindmap.md；或先运行 mindgit init');
}

// Every commit that touched the file, oldest first, plus uncommitted edits as a WIP version.
function history(abs) {
  let commits = [];
  let rel = path.basename(abs);
  try {
    const top = git(path.dirname(abs), 'rev-parse', '--show-toplevel').trim();
    rel = path.relative(top, abs).split(path.sep).join('/');
    const log = git(top, 'log', '--reverse', '--format=%H%x1f%h%x1f%aI%x1f%an%x1f%s', '--', rel).trim();
    commits = log ? log.split('\n').map(line => {
      const [sha, short, date, author, message] = line.split('\x1f');
      let content = '';
      try { content = git(top, 'show', `${sha}:${rel}`); } catch (_) { /* deleted in this commit */ }
      return { sha, short, date, author, message, content };
    }) : [];
  } catch (_) { /* not a git repo: render the file alone */ }
  const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
  if (!commits.length || commits[commits.length - 1].content !== current) {
    commits.push({ sha: '', short: 'WIP', date: new Date().toISOString(), author: '', message: '未提交的修改', content: current, wip: true });
  }
  return { rel, commits };
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif' };
const mimeOf = f => MIME[path.extname(f).slice(1).toLowerCase()];

// Images referenced by any version, read from disk and inlined so the page works on its own.
function inlineAssets(abs, commits) {
  const dir = path.dirname(abs);
  const assets = {};
  const re = /!\[[^\]]*\]\(\s*<?([^)\s>]+)/g;
  for (const c of commits) {
    let m;
    while ((m = re.exec(c.content))) {
      const src = m[1];
      if (assets[src] || /^(https?:|data:)/.test(src)) continue;
      const file = path.resolve(dir, decodeURIComponent(src));
      if (!file.startsWith(dir + path.sep) || !mimeOf(file) || !fs.existsSync(file)) continue;
      assets[src] = `data:${mimeOf(file)};base64,` + fs.readFileSync(file).toString('base64');
    }
  }
  return assets;
}

function page(abs, extra, fragment) {
  const { rel, commits } = history(abs);
  const src = path.join(__dirname, '..', 'src');
  const current = commits[commits.length - 1].content;
  const title = (P.parse(current).text || 'Mindgit') + ' 导图';
  const data = JSON.stringify(Object.assign({ file: rel, commits }, extra)).replace(/</g, '\\u003c');
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  let html = fs.readFileSync(path.join(src, 'template.html'), 'utf8')
    .split('__TITLE__').join(esc(title))
    .replace('/*__PARSER__*/', () => fs.readFileSync(path.join(src, 'parse.js'), 'utf8'))
    .replace('__DATA__', () => data);
  if (!fragment) {
    html = '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
      '<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n' + html + '\n</body>\n</html>\n';
  }
  return { html, commits };
}

function render(abs) {
  if (!fs.existsSync(abs)) die('文件不存在：' + abs);
  const out = path.resolve(opt('--out', path.join(path.dirname(abs), '.mindgit', 'index.html')));
  const { commits } = history(abs);
  const { html } = page(abs, { mode: 'static', assets: inlineAssets(abs, commits) }, flag('--fragment'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`已生成 ${out}（${commits.length} 个版本）`);
}

function summary(abs) {
  if (!fs.existsSync(abs)) die('文件不存在：' + abs);
  const { rel, commits } = history(abs);
  const last = commits[commits.length - 1];
  const prev = commits[commits.length - 2];
  const tree = P.parse(last.content);
  const s = P.stats(tree);
  const d = P.diff(prev && P.parse(prev.content), tree);
  const pct = s.total ? Math.round(s.counts.done / s.total * 100) : 0;
  if (flag('--json')) {
    console.log(JSON.stringify({
      file: rel, title: tree.text, versions: commits.length, progress: pct, counts: s.counts,
      modules: s.modules.map(m => ({ name: m.node.text, status: m.node.status, priority: m.node.priority, done: m.done, doing: m.doing, todo: m.todo, paused: m.paused, total: m.total })),
      latest: { sha: last.short, message: last.message, date: last.date },
      changes: { added: d.addedTop.map(n => n.text), removed: d.removedTop.map(n => n.text), status: d.status.map(x => ({ node: x.node.text, from: x.from, to: x.to })) },
    }, null, 2));
    return;
  }
  const lines = [];
  lines.push(`# ${tree.text || '(未命名)'}  ·  ${rel}`);
  lines.push(`进度 ${pct}%：完成 ${s.counts.done}，进行中 ${s.counts.doing}，待开发 ${s.counts.todo}，搁置 ${s.counts.paused}（共 ${s.total} 项，${commits.length} 个版本）`);
  lines.push('');
  lines.push('## 模块');
  for (const m of s.modules) {
    const tag = [m.node.priority, m.node.status && L[m.node.status]].filter(Boolean).join(' ');
    lines.push(`- ${m.node.text || '(根)'}${tag ? ` [${tag}]` : ''}：${m.done}/${m.total} 完成${m.doing ? `，${m.doing} 进行中` : ''}`);
  }
  const doing = [];
  (function walk(n) { if (n.status === 'doing') doing.push(n.text); n.children.forEach(walk); })(tree);
  if (doing.length) { lines.push(''); lines.push('## 进行中'); doing.forEach(t => lines.push('- ' + t)); }
  lines.push('');
  lines.push(`## 最新版本：${last.short} ${last.message}`);
  if (d.initial) lines.push('- 第一个版本');
  d.addedTop.forEach(n => lines.push('+ ' + n.text));
  d.status.forEach(x => lines.push(`~ ${x.node.text}：${x.from ? L[x.from] : '无'} → ${x.to ? L[x.to] : '无'}`));
  d.removedTop.forEach(n => lines.push('- ' + n.text));
  if (!d.initial && !d.added.length && !d.removed.length && !d.status.length) lines.push('（导图结构没有变化）');
  console.log(lines.join('\n'));
}

function init(abs) {
  if (fs.existsSync(abs)) die('已存在：' + abs);
  const title = opt('--title', '产品名称');
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `# ${title}

## 目标
- 一句话定位：
- 目标用户：

## 功能模块
### 模块 A \`[P0]\` \`[待开发]\`
- 功能 A1 \`[待开发]\`
- 功能 A2 \`[待开发]\`
### 模块 B \`[P1]\` \`[待开发]\`
- 功能 B1 \`[待开发]\`

## 原型 / 页面
- 首页

## 版本计划
### v0.1
- 模块 A

## 待决问题
- （待填）
`);
  console.log('已创建 ' + abs);
}

if (cmd === 'serve') require('../src/server.js')({ abs: findMap(positional[0]), port: Number(opt('--port', 4321)), history, page });
else if (cmd === 'init') init(path.resolve(positional[0] || 'mindmap.md'));
else if (cmd === 'summary') summary(findMap(positional[0]));
else render(findMap(positional[0]));
