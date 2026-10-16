// Mindgit parser: Markdown -> mind map tree, plus version diff.
// Works in the browser (window.MindgitParse) and in Node (require).
(function (root) {
  const STATUS = {
    '待开发': 'todo', 'todo': 'todo',
    '进行中': 'doing', 'doing': 'doing',
    '完成': 'done', '已完成': 'done', 'done': 'done',
    '搁置': 'paused', 'paused': 'paused',
  };
  const STATUS_LABEL = { todo: '待开发', doing: '进行中', done: '完成', paused: '搁置' };
  const TAG_RE = /`?\[([^\]\n]+)\](?!\()`?/g;

  function parseTags(raw) {
    let status = null, priority = null;
    let text = raw.replace(TAG_RE, (m, t) => {
      const k = t.trim().toLowerCase();
      if (STATUS[k]) { status = STATUS[k]; return ''; }
      if (/^p\d$/.test(k)) { priority = k.toUpperCase(); return ''; }
      return m;
    });
    text = text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> label
      .replace(/\*\*|__|`/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return { text, status, priority };
  }

  function mk(raw, checkbox) {
    const t = parseTags(raw);
    if (!t.status && checkbox) t.status = checkbox === ' ' ? 'todo' : 'done';
    return { text: t.text, status: t.status, priority: t.priority, children: [] };
  }

  function parse(md) {
    const lines = String(md || '').replace(/\r/g, '').split('\n');
    let i = 0;
    if ((lines[0] || '').trim() === '---') {
      i = 1;
      while (i < lines.length && lines[i].trim() !== '---') i++;
      i++;
    }
    const tree = { text: '', status: null, priority: null, children: [] };
    let heads = [{ level: 0, node: tree }];
    let list = [];
    let sawTitle = false;
    let inFence = false;

    for (; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
      if (inFence || !line.trim()) continue;

      let m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (m) {
        const level = m[1].length;
        list = [];
        if (level === 1 && !sawTitle && tree.children.length === 0) {
          Object.assign(tree, parseTags(m[2]));
          sawTitle = true;
          heads = [{ level: 1, node: tree }];
          continue;
        }
        while (heads.length > 1 && heads[heads.length - 1].level >= level) heads.pop();
        const node = mk(m[2]);
        heads[heads.length - 1].node.children.push(node);
        heads.push({ level, node });
        continue;
      }

      m = line.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/);
      if (m) {
        const indent = m[1].replace(/\t/g, '    ').length;
        while (list.length && list[list.length - 1].indent >= indent) list.pop();
        const parent = list.length ? list[list.length - 1].node : heads[heads.length - 1].node;
        const node = mk(m[3], m[2] && m[2].toLowerCase());
        parent.children.push(node);
        list.push({ indent, node });
      }
      // Paragraph text is ignored for now.
    }
    assignIds(tree, '', 0);
    return tree;
  }

  // Ids are the path of texts below the root, so renaming the product keeps the diff stable.
  function assignIds(node, id, depth) {
    node.id = id;
    node.depth = depth;
    const seen = {};
    for (const c of node.children) {
      const n = (seen[c.text] = (seen[c.text] || 0) + 1);
      const key = n > 1 ? c.text + '#' + n : c.text;
      assignIds(c, id ? id + '\u001f' + key : key, depth + 1);
    }
  }

  function flatten(tree) {
    const map = new Map();
    (function walk(n) { map.set(n.id, n); n.children.forEach(walk); })(tree);
    return map;
  }

  function diff(prevTree, nextTree) {
    const out = { added: [], removed: [], status: [], initial: !prevTree };
    if (!prevTree) return out;
    const a = flatten(prevTree), b = flatten(nextTree);
    for (const [id, n] of b) {
      if (!a.has(id)) out.added.push(n);
      else if (id && a.get(id).status !== n.status) out.status.push({ node: n, from: a.get(id).status, to: n.status });
    }
    for (const [id, n] of a) if (!b.has(id)) out.removed.push(n);
    // Only report the top of an added or removed subtree.
    const topOnly = (list, map) => list.filter(n => {
      const p = n.id.split('\u001f').slice(0, -1).join('\u001f');
      return !list.some(o => o.id === p);
    });
    out.addedTop = topOnly(out.added);
    out.removedTop = topOnly(out.removed);
    return out;
  }

  // A task is a node with a status and no statused descendants.
  function stats(tree) {
    const counts = { todo: 0, doing: 0, done: 0, paused: 0 };
    const modules = [];
    function hasStatusBelow(n) { return n.children.some(c => c.status || hasStatusBelow(c)); }
    (function walk(n) {
      const tasks = n.children.filter(c => c.status && !hasStatusBelow(c));
      if (tasks.length) {
        const m = { node: n, todo: 0, doing: 0, done: 0, paused: 0, total: tasks.length };
        tasks.forEach(t => m[t.status]++);
        modules.push(m);
      }
      if (n.status && !hasStatusBelow(n)) counts[n.status]++;
      n.children.forEach(walk);
    })(tree);
    const total = counts.todo + counts.doing + counts.done + counts.paused;
    return { counts, total, modules };
  }

  const api = { parse, diff, stats, flatten, STATUS_LABEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MindgitParse = api;
})(this);
