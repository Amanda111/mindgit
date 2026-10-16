#!/usr/bin/env node
// After Claude edits a mind map, refresh its static HTML — but only if one was rendered before,
// so the plugin never adds files to a project on its own.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let input = '';
process.stdin.on('data', c => (input += c));
process.stdin.on('end', () => {
  try {
    const file = (JSON.parse(input).tool_input || {}).file_path;
    if (!file || !/\.md$/i.test(file)) return;
    const out = path.join(path.dirname(file), '.mindgit', 'index.html');
    if (!fs.existsSync(out)) return;
    const head = fs.readFileSync(out, 'utf8').slice(0, 200000);
    if (!head.includes(JSON.stringify(path.basename(file)).slice(1, -1))) return;
    execFileSync(process.execPath, [path.join(__dirname, '..', 'bin', 'mindgit.js'), 'render', file, '--out', out], { stdio: 'ignore', timeout: 25000 });
  } catch (_) { /* never block the edit */ }
});
