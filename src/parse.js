// Mindgit core: Markdown -> mind map tree, version diff, progress stats,
// and line-level edits so changes made on the canvas are written back to the Markdown.
// Works in the browser (window.MindgitParse) and in Node (require).
(function (root) {
  const STATUS = {
    '待开发': 'todo', 'todo': 'todo',
    '进行中': 'doing', 'doing': 'doing',
    '完成': 'done', '已完成': 'done', 'done': 'done',
    '搁置': 'paused', 'paused': 'paused',
  };
  const STATUS_LABEL = { todo: '待开发', doing: '进行中', done: '完成', paused: '搁置' };
  const SEP = '\u001f';
  const TAG_RE = /`?\[([^\]\n]+)\](?!\()`?/g;
  const IMG_RE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/;
  const HEAD_RE = /^(#{1,6})(\s+)(.*?)(\s+#+)?\s*$/;
  const LIST_RE = /^(\s*)([-*+]|\d+[.)])(\s+)(?:\[([ xX])\]\s+)?(.*)$/;
  const isStatus = t => !!STATUS[t.trim().toLowerCase()];
  const isPriority = t => /^p\d$/i.test(t.trim());

  // Split the content of one line into text, image and tags.
  function parseContent(raw) {
    let status = null, priority = null, image = null;
    let s = raw.replace(new RegExp(IMG_RE.source, 'g'), (m, alt, src) => { if (!image) image = { alt, src }; return ' '; });
    s = s.replace(TAG_RE, (m, t) => {
      if (isStatus(t)) { status = STATUS[t.trim().toLowerCase()]; return ' '; }
      if (isPriority(t)) { priority = t.trim().toUpperCase(); return ' '; }
      return m;
    });
    const text = s
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*|__|`/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return { text: text || (image ? image.alt : ''), status, priority, image };
  }

  function parse(md) {
    const lines = String(md || '').replace(/\r/g, '').split('\n');
    let i = 0;
    if ((lines[0] || '').trim() === '---') {
      i = 1;
      while (i < lines.length && lines[i].trim() !== '---') i++;
      i++;
    }
    const tree = { text: '', status: null, priority: null, image: null, children: [], line: -1, kind: 'root', level: 1 };
    let heads = [{ level: 0, node: tree }];
    let list = [];
    let last = tree;
    let sawTitle = false;
    let inFence = false;

    for (; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
      if (inFence || !line.trim()) continue;

      let m = line.match(HEAD_RE);
      if (m) {
        const level = m[1].length;
        list = [];
        if (level === 1 && !sawTitle && tree.children.length === 0) {
          Object.assign(tree, parseContent(m[3]), { line: i, kind: 'h', level: 1 });
          sawTitle = true;
          heads = [{ level: 1, node: tree }];
          last = tree;
          continue;
        }
        while (heads.length > 1 && heads[heads.length - 1].level >= level) heads.pop();
        const node = Object.assign(parseContent(m[3]), { children: [], line: i, kind: 'h', level });
        heads[heads.length - 1].node.children.push(node);
        heads.push({ level, node });
        last = node;
        continue;
      }

      m = line.match(LIST_RE);
      if (m) {
        const indent = m[1].replace(/\t/g, '    ').length;
        while (list.length && list[list.length - 1].indent >= indent) list.pop();
        const parent = list.length ? list[list.length - 1].node : heads[heads.length - 1].node;
        const node = Object.assign(parseContent(m[5]), { children: [], line: i, kind: 'li', indent, bullet: m[2], check: m[4] == null ? null : m[4].toLowerCase() });
        if (!node.status && node.check != null) node.status = node.check === 'x' ? 'done' : 'todo';
        parent.children.push(node);
        list.push({ indent, node });
        last = node;
        continue;
      }

      // A paragraph that is only an image belongs to the node above it.
      const im = line.trim().match(new RegExp('^' + IMG_RE.source + '$'));
      if (im && !last.image) { last.image = { alt: im[1], src: im[2] }; last.imageLine = i; }
    }
    finish(tree, '', 0, lines);
    tree.lineCount = lines.length;
    return tree;
  }

  // Ids are the path of texts below the root, so renaming the product keeps the diff stable.
  function finish(node, id, depth, lines) {
    node.id = id;
    node.depth = depth;
    const seen = {};
    let end = Math.max(node.line, node.imageLine == null ? -1 : node.imageLine);
    for (const c of node.children) {
      const n = (seen[c.text] = (seen[c.text] || 0) + 1);
      const key = n > 1 ? c.text + '#' + n : c.text;
      end = Math.max(end, finish(c, id ? id + SEP + key : key, depth + 1, lines));
    }
    node.end = end;
    return end;
  }

  function flatten(tree) {
    const map = new Map();
    (function walk(n) { map.set(n.id, n); n.children.forEach(walk); })(tree);
    return map;
  }
  const parentId = id => id.includes(SEP) ? id.slice(0, id.lastIndexOf(SEP)) : '';

  function diff(prevTree, nextTree) {
    const out = { added: [], removed: [], status: [], addedTop: [], removedTop: [], initial: !prevTree };
    if (!prevTree) return out;
    const a = flatten(prevTree), b = flatten(nextTree);
    for (const [id, n] of b) {
      if (!a.has(id)) out.added.push(n);
      else if (id && a.get(id).status !== n.status) out.status.push({ node: n, from: a.get(id).status, to: n.status });
    }
    for (const [id, n] of a) if (!b.has(id)) out.removed.push(n);
    const topOnly = list => { const ids = new Set(list.map(n => n.id)); return list.filter(n => !ids.has(parentId(n.id))); };
    out.addedTop = topOnly(out.added);
    out.removedTop = topOnly(out.removed);
    return out;
  }

  // A task is a node with a status and no statused descendants.
  function stats(tree) {
    const counts = { todo: 0, doing: 0, done: 0, paused: 0 };
    const modules = [];
    const below = n => n.children.some(c => c.status || below(c));
    (function walk(n) {
      const tasks = n.children.filter(c => c.status && !below(c));
      if (tasks.length) {
        const m = { node: n, todo: 0, doing: 0, done: 0, paused: 0, total: tasks.length };
        tasks.forEach(t => m[t.status]++);
        modules.push(m);
      }
      if (n.status && !below(n)) counts[n.status]++;
      n.children.forEach(walk);
    })(tree);
    const total = counts.todo + counts.doing + counts.done + counts.paused;
    return { counts, total, modules };
  }

  // ---------- edits ----------
  // Every edit takes the Markdown and a node from parse(md), and returns new Markdown.
  // Only the lines that belong to that node change, so the rest of the file stays as written.

  function splitLine(line) {
    let m = line.match(HEAD_RE);
    if (m) return { prefix: m[1] + m[2], content: m[3], kind: 'h' };
    m = line.match(LIST_RE);
    if (m) return { prefix: m[1] + m[2] + m[3], check: m[4], content: m[5], kind: 'li' };
    return { prefix: '', content: line, kind: 'p' };
  }

  function rebuild(parts, change) {
    const c = parts.content;
    let text = c, tags = [], img = null;
    text = text.replace(new RegExp(IMG_RE.source, 'g'), m => { img = img || m; return ' '; });
    text = text.replace(TAG_RE, (m, t) => { if (isStatus(t) || isPriority(t)) { tags.push({ m, t: t.trim() }); return ' '; } return m; });
    text = text.replace(/\s+/g, ' ').trim();
    let status = tags.find(x => isStatus(x.t));
    let pri = tags.find(x => isPriority(x.t));
    let check = parts.check;
    if ('text' in change) text = change.text;
    if ('image' in change) img = change.image ? `![${change.image.alt || ''}](${change.image.src})` : null;
    if ('priority' in change) pri = change.priority ? { m: '`[' + change.priority + ']`' } : null;
    if ('status' in change) {
      const s = change.status;
      if (check != null && (s === 'done' || s === 'todo' || !s)) {
        check = s === 'done' ? 'x' : ' ';
        status = null;
      } else status = s ? { m: '`[' + STATUS_LABEL[s] + ']`' } : null;
    }
    const prefix = check != null && parts.kind === 'li' ? parts.prefix + '[' + check + '] ' : parts.prefix;
    return prefix + [text, pri && pri.m, status && status.m, img].filter(Boolean).join(' ');
  }

  function lines(md) { return String(md).replace(/\r/g, '').split('\n'); }

  function updateNode(md, node, change) {
    const ls = lines(md);
    if (node.line < 0) {
      // No title line yet: create one.
      if ('text' in change) ls.unshift('# ' + change.text, '');
      return ls.join('\n');
    }
    if ('image' in change && node.imageLine != null) {
      if (change.image) ls[node.imageLine] = `![${change.image.alt || ''}](${change.image.src})`;
      else ls.splice(node.imageLine, 1);
      change = Object.assign({}, change); delete change.image;
      if (!Object.keys(change).length) return ls.join('\n');
    }
    ls[node.line] = rebuild(splitLine(ls[node.line]), change);
    return ls.join('\n');
  }

  function insertAt(ls, at, line, blankBefore) {
    const add = [];
    if (blankBefore && at > 0 && ls[at - 1] && ls[at - 1].trim()) add.push('');
    add.push(line);
    if (blankBefore && ls[at] && ls[at].trim()) add.push('');
    ls.splice(at, 0, ...add);
    return ls;
  }

  function addChild(md, node, text) {
    const ls = lines(md);
    const at = node.end + 1;
    if (node.kind === 'li') {
      const first = node.children[0];
      const indent = first ? ' '.repeat(first.indent) : ' '.repeat(node.indent + 2);
      const bullet = first ? first.bullet : node.bullet;
      return insertAt(ls, at, indent + (/\d/.test(bullet) ? '1.' : bullet) + ' ' + text, false).join('\n');
    }
    if (node.line < 0 && !node.children.length) return md.replace(/\s*$/, '\n\n## ' + text + '\n');
    const headKid = node.children.find(c => c.kind === 'h');
    if (headKid || node.kind === 'root' || node.level === 1) {
      const level = headKid ? headKid.level : Math.min(6, (node.level || 1) + 1);
      return insertAt(ls, at, '#'.repeat(level) + ' ' + text, true).join('\n');
    }
    const firstLi = node.children.find(c => c.kind === 'li');
    return insertAt(ls, at, (firstLi ? ' '.repeat(firstLi.indent) + firstLi.bullet : '-') + ' ' + text, false).join('\n');
  }

  function addSibling(md, node, text) {
    const ls = lines(md);
    const at = node.end + 1;
    if (node.kind === 'li') return insertAt(ls, at, ' '.repeat(node.indent) + (/\d/.test(node.bullet) ? '1.' : node.bullet) + ' ' + text, false).join('\n');
    if (node.kind === 'h') return insertAt(ls, at, '#'.repeat(node.level) + ' ' + text, true).join('\n');
    return md;
  }

  function removeNode(md, node) {
    if (node.line < 0 || node.depth === 0) return md;
    const ls = lines(md);
    let from = node.line, to = node.end;
    // Headings own the text below them up to the next heading of the same or higher level.
    if (node.kind === 'h') {
      let j = to + 1;
      while (j < ls.length && !(ls[j].match(HEAD_RE) && ls[j].match(HEAD_RE)[1].length <= node.level)) j++;
      to = j - 1;
      while (to > from && !ls[to].trim()) to--;
      if (ls[to + 1] !== undefined && !ls[to + 1].trim() && (from === 0 || !ls[from - 1].trim())) to++;
    }
    ls.splice(from, to - from + 1);
    return ls.join('\n');
  }

  function findById(tree, id) { return flatten(tree).get(id) || null; }

  const api = { parse, diff, stats, flatten, findById, parentId, updateNode, addChild, addSibling, removeNode, STATUS_LABEL, SEP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MindgitParse = api;
})(this);
