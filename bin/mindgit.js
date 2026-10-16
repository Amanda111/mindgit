#!/usr/bin/env node
// Usage: mindgit <mindmap.md> [--out dist/index.html] [--fragment]
// Reads every git commit that touched the file (plus uncommitted edits) and writes one self-contained HTML page.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const file = args.find((a, i) => !a.startsWith('--') && !['--out'].includes(args[i - 1]));
if (!file) {
  console.error('用法: mindgit <mindmap.md> [--out dist/index.html] [--fragment]');
  process.exit(1);
}
const abs = path.resolve(file);
const out = path.resolve(opt('--out', 'dist/index.html'));
const fragment = args.includes('--fragment');

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

let commits = [];
let rel = path.basename(abs);
try {
  const top = git(path.dirname(abs), 'rev-parse', '--show-toplevel').trim();
  rel = path.relative(top, abs).split(path.sep).join('/');
  const log = git(top, 'log', '--reverse', '--format=%H%x1f%h%x1f%aI%x1f%an%x1f%s', '--', rel).trim();
  commits = log ? log.split('\n').map(line => {
    const [sha, short, date, author, message] = line.split('\x1f');
    let content = '';
    try { content = git(top, 'show', `${sha}:${rel}`); } catch (_) { /* file deleted in this commit */ }
    return { sha, short, date, author, message, content };
  }) : [];
} catch (_) {
  console.warn('不是 git 仓库，只渲染当前文件。');
}

const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
if (!commits.length || commits[commits.length - 1].content !== current) {
  commits.push({ sha: '', short: 'WIP', date: new Date().toISOString(), author: '', message: '未提交的修改', content: current, wip: true });
}

const src = path.join(__dirname, '..', 'src');
const parser = fs.readFileSync(path.join(src, 'parse.js'), 'utf8');
const title = (current.match(/^#\s+(.+)$/m) || [, 'Mindgit'])[1].replace(/`?\[[^\]]+\]`?/g, '').trim() + ' 导图';
const data = JSON.stringify({ file: rel, commits }).replace(/</g, '\\u003c');
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

let html = fs.readFileSync(path.join(src, 'template.html'), 'utf8')
  .split('__TITLE__').join(esc(title))
  .replace('/*__PARSER__*/', () => parser)
  .replace('__DATA__', () => data);
if (!fragment) {
  html = '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    '<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n' + html + '\n</body>\n</html>\n';
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`已生成 ${path.relative(process.cwd(), out) || out}（${commits.length} 个版本）`);
