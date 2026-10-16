// Local editing server: serves the canvas, writes canvas edits back to the Markdown file,
// and pushes changes made elsewhere (an editor, Claude, git) to every open canvas.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif' };
const MAX_UPLOAD = 20 * 1024 * 1024;

module.exports = function serve({ abs, port, history, page }) {
  const dir = path.dirname(abs);
  const read = () => (fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '');
  const hash = s => crypto.createHash('sha1').update(s).digest('hex');
  const state = () => {
    const content = read();
    return { content, hash: hash(content), commits: history(abs).commits };
  };
  const head = () => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (_) { return ''; } };

  const clients = new Set();
  let lastKey = hash(read()) + head();
  function broadcast() {
    const msg = 'data: ' + JSON.stringify(state()) + '\n\n';
    for (const res of clients) res.write(msg);
  }
  setInterval(() => {
    const key = hash(read()) + head();
    if (key !== lastKey) { lastKey = key; broadcast(); }
  }, 1000).unref();

  const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const body = (req, limit) => new Promise((ok, fail) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { fail(new Error('文件太大')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', fail);
  });
  const inside = p => p === dir || p.startsWith(dir + path.sep);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        const s = state();
        const { html } = page(abs, { mode: 'live', hash: s.hash }, false);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(html);
      }
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, state());
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(': connected\n\n');
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 25000);
        req.on('close', () => { clearInterval(ping); clients.delete(res); });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/save') {
        const { content, base } = JSON.parse((await body(req, 5 * 1024 * 1024)).toString('utf8'));
        if (typeof content !== 'string') return json(res, 400, { error: '缺少内容' });
        const current = read();
        if (base && base !== hash(current) && current !== content) return json(res, 409, state());
        fs.writeFileSync(abs, content);
        lastKey = hash(content) + head();
        // Other open canvases need the new content too.
        setImmediate(broadcast);
        return json(res, 200, { hash: hash(content) });
      }
      if (req.method === 'POST' && url.pathname === '/api/upload') {
        const name = path.basename(url.searchParams.get('name') || 'image.png').replace(/[^\w一-龥.-]+/g, '-');
        const ext = path.extname(name).slice(1).toLowerCase();
        if (!MIME[ext]) return json(res, 400, { error: '只支持 png、jpg、gif、webp、svg、avif 图片' });
        const data = await body(req, MAX_UPLOAD);
        const assets = path.join(dir, 'assets');
        fs.mkdirSync(assets, { recursive: true });
        let file = path.join(assets, name), i = 2;
        while (fs.existsSync(file)) file = path.join(assets, name.replace(/(\.\w+)$/, `-${i++}$1`));
        fs.writeFileSync(file, data);
        return json(res, 200, { src: path.relative(dir, file).split(path.sep).join('/') });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/files/')) {
        const file = path.resolve(dir, decodeURIComponent(url.pathname.slice(7)));
        const type = MIME[path.extname(file).slice(1).toLowerCase()];
        if (!inside(file) || !type || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
        return fs.createReadStream(file).pipe(res);
      }
      res.writeHead(404); res.end();
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') console.error(`端口 ${port} 已被占用，换一个：mindgit serve ${path.basename(abs)} --port ${port + 1}`);
    else console.error(err.message);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    const link = `http://localhost:${port}`;
    console.log(`Mindgit 画布已打开：${link}`);
    console.log(`正在编辑 ${abs}。画布上的改动会直接写回这个文件，文件的改动也会实时出现在画布上。按 Ctrl+C 停止。`);
    if (process.argv.includes('--open')) {
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
      const args = process.platform === 'win32' ? ['/c', 'start', '', link] : [link];
      try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch (_) { /* no browser */ }
    }
  });
};
