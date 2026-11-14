// Mini Unity runtime on Canvas2D: scene graph built from exported Unity scene/prefab data.
// Coordinates: "screen space" = logical px, origin at screen centre, y up. World units are mapped by the main camera.
'use strict';
const E = (window.E = {});
E.W = 1080; E.H = 2160; E.time = 0; E.dt = 0; E.frame = 0;
E.D = { files: {}, spr: {}, tex: {}, so: {}, names: {}, enums: {}, mats: {}, spineMeta: {}, audio: {} };
E.scripts = {};
E.DEG = Math.PI / 180;

// ------------------------------------------------------------------ assets
E.fetchJSON = (u) => fetch(u + (window.BUILD && window.BUILD !== 'dev' ? (u.includes('?') ? '&' : '?') + 'v=' + window.BUILD : '')).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
E.loadFile = async (fn) => {
  if (!E.D.files[fn]) E.D.files[fn] = await E.fetchJSON('data/' + fn + '.json');
  return E.D.files[fn];
};
// extra content packs (data/<name>_pack.json + data/<name>.json), merged into E.D on first use; E.scenePacks[level] = name
E.packs = {}; E.scenePacks = {};
E.loadPack = (name) => {
  if (!E.packs[name]) E.packs[name] = (async () => {
    const [p] = await Promise.all([E.fetchJSON('data/' + name + '_pack.json'), E.loadFile(name)]);
    Object.assign(E.D.spr, p.spr); Object.assign(E.D.tex, p.tex); Object.assign(E.D.so, p.so); Object.assign(E.D.names, p.names);
    Object.assign(E.D.mats, p.mats); Object.assign(E.D.spineMeta, p.spine); Object.assign(E.D.audio, p.audio);
    if (E._loc && p.loc) for (const k in p.loc) if (!E._loc[k]) E._loc[k] = p.loc[k];
    E._sprByName = null; if (E._trNum) E._trNum.clear();
    E.D[name] = p;
    return p;
  })();
  return E.packs[name];
};
E.imgs = {};
E.texImg = (file) => {
  let im = E.imgs[file];
  if (!im) {
    im = new Image();
    im._p = new Promise((res) => { im.onload = () => { im._ok = 1; res(im); }; im.onerror = () => { im._bad = 1; res(im); }; });
    im.src = 'assets/tex/' + file;
    E.imgs[file] = im;
  }
  return im;
};
// sprite: [texfile, x, y(top), w, h, pvx, pvy, ppu, border[l,b,r,t], name, rectW, rectH, offX, offY]
E.sprite = (key) => {
  if (!key) return null;
  const s = E.D.spr[key];
  if (!s) return null;
  if (!s.img) s.img = E.texImg(s[0]);
  return s;
};
E.spriteByName = (name) => {
  if (!E._sprByName) { E._sprByName = {}; for (const k in E.D.spr) E._sprByName[E.D.spr[k][9]] = k; }
  return E._sprByName[name];
};
E.preloadSprites = (keys, onProg) => {
  const ps = []; const seen = new Set();
  for (const k of keys) {
    const s = E.sprite(k);
    if (!s || seen.has(s[0])) continue;
    seen.add(s[0]); if (!s.img._ok && !s.img._bad) ps.push(s.img._p);
  }
  let done = 0;
  return Promise.all(ps.map((p) => p.then(() => { done++; if (onProg) onProg(done / ps.length); })));
};
// collect sprite keys referenced by a file's node subtree (or the whole file)
E.collectSprites = (fileName, rootPid, out) => {
  out = out || new Set();
  const F = E.D.files[fileName]; if (!F) return out;
  const visit = (n) => {
    if (!n) return;
    for (const c of n.c || []) {
      if (c.sp) out.add(c.sp);
      if (c.t === 'MB' && c.d) E.collectRefs(c.d, out);
    }
    for (const ch of n.ch || []) visit(F.nodes[ch]);
  };
  if (rootPid != null) visit(F.nodes[rootPid]); else for (const k in F.nodes) { const n = F.nodes[k]; for (const c of n.c || []) { if (c.sp) out.add(c.sp); if (c.t === 'MB' && c.d) E.collectRefs(c.d, out); } }
  return out;
};
E.collectRefs = (v, out) => {
  if (typeof v === 'string') { if (E.D.spr[v]) out.add(v); return; }
  if (Array.isArray(v)) { for (const x of v) E.collectRefs(x, out); return; }
  if (v && typeof v === 'object') for (const k in v) E.collectRefs(v[k], out);
};

// ------------------------------------------------------------------ localisation (Key,English,Vietnamese,... table from the game)
E.langs = ['English']; E.lang = 'English'; E._loc = null; E._li = 0;
E.setLanguage = (l) => { const i = E.langs.indexOf(l); E.lang = i >= 0 ? l : 'English'; E._li = Math.max(0, i); };
E._trNum = new Map(); // "Level 3" → key "Level $" (the table's numbered keys), cached per language
E.tr = (s) => {
  if (!E._li || !s || !E._loc) return s;
  const v = E._loc[s] || E._loc[s.trim()];
  if (v) return v[E._li] || s;
  const ck = E._li + '|' + s; let r = E._trNum.get(ck);
  if (r === undefined) {
    r = s; const m = /\d+/.exec(s);
    if (m) { const w = E._loc[s.replace(m[0], '$')]; if (w && w[E._li] && w[E._li].includes('$')) r = w[E._li].replace('$', m[0]); }
    if (E._trNum.size > 5000) E._trNum.clear();
    E._trNum.set(ck, r);
  }
  return r;
};

// ------------------------------------------------------------------ tint cache
E._tint = new Map();
E.tinted = (s, col) => {
  // returns a canvas with sprite region multiplied by rgb (alpha handled by caller)
  const key = s[0] + '|' + s[1] + '|' + s[2] + '|' + s[3] + '|' + s[4] + '|' + col[0] + ',' + col[1] + ',' + col[2];
  let c = E._tint.get(key);
  if (c) return c;
  if (!s.img._ok) return null;
  const w = Math.max(1, Math.round(s[3])), h = Math.max(1, Math.round(s[4]));
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(s.img, s[1], s[2], s[3], s[4], 0, 0, w, h);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = `rgb(${Math.round(col[0] * 255)},${Math.round(col[1] * 255)},${Math.round(col[2] * 255)})`;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(s.img, s[1], s[2], s[3], s[4], 0, 0, w, h);
  E._tint.set(key, c);
  if (E._tint.size > 600) E._tint.delete(E._tint.keys().next().value);
  return c;
};

// ------------------------------------------------------------------ matrices [a,b,c,d,e,f]
const M = (E.M = {
  id: () => [1, 0, 0, 1, 0, 0],
  mul: (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]],
  inv: (m) => { const d = m[0] * m[3] - m[1] * m[2] || 1e-12; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; },
  ap: (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]],
  trs: (x, y, rot, sx, sy) => { const c = Math.cos(rot * E.DEG), s = Math.sin(rot * E.DEG); return [c * sx, s * sx, -s * sy, c * sy, x, y]; },
});

// ------------------------------------------------------------------ GameObject
let goId = 1;
class GO {
  constructor(name) {
    this.uid = goId++; this.name = name || 'GameObject'; this.activeSelf = true; this.parent = null; this.children = [];
    this.comps = []; this.x = 0; this.y = 0; this.z = 0; this.rot = 0; this.sx = 1; this.sy = 1;
    this.rt = null; this.layer = 0; this.wm = M.id(); this.rect = null; this.destroyed = false; this.pid = 0; this.file = '';
  }
  get active() { return this.activeSelf; }
  get activeInHierarchy() { let g = this; while (g) { if (!g.activeSelf || g.destroyed) return false; g = g.parent; } return true; }
  setActive(v) {
    v = !!v; if (v === this.activeSelf) return;
    const was = this.activeInHierarchy;
    this.activeSelf = v;
    const now = this.activeInHierarchy;
    if (was !== now) E._propagateActive(this, now);
  }
  add(ch, keepWorld) {
    if (ch.parent) ch.remove();
    ch.parent = this; this.children.push(ch); return ch;
  }
  insert(ch, idx) { if (ch.parent) ch.remove(); ch.parent = this; this.children.splice(Math.max(0, Math.min(idx, this.children.length)), 0, ch); return ch; }
  remove() { if (!this.parent) { const i = E.roots.indexOf(this); if (i >= 0) E.roots.splice(i, 1); return; } const a = this.parent.children; const i = a.indexOf(this); if (i >= 0) a.splice(i, 1); this.parent = null; }
  setParent(p, worldStays) {
    let wp = null;
    if (worldStays) wp = this.worldPos();
    const wasActive = this.activeInHierarchy;
    this.remove();
    if (p) { this.parent = p; p.children.push(this); } else E.roots.push(this);
    if (worldStays && wp) this.setWorldPos(wp[0], wp[1]);
    const now = this.activeInHierarchy; if (now !== wasActive) E._propagateActive(this, now);
  }
  get siblingIndex() { return this.parent ? this.parent.children.indexOf(this) : E.roots.indexOf(this); }
  setSiblingIndex(i) { const a = this.parent ? this.parent.children : E.roots; const k = a.indexOf(this); if (k < 0) return; a.splice(k, 1); a.splice(Math.max(0, Math.min(i, a.length)), 0, this); }
  setAsLastSibling() { this.setSiblingIndex(1e9); }
  setAsFirstSibling() { this.setSiblingIndex(0); }
  find(path) {
    let cur = this;
    for (const p of path.split('/')) { if (!cur) return null; cur = cur.children.find((c) => c.name === p) || null; }
    return cur;
  }
  findDeep(name) { for (const c of this.children) { if (c.name === name) return c; const r = c.findDeep(name); if (r) return r; } return null; }
  comp(t) { return this.comps.find((c) => c.t === t || c.cls === t) || null; }
  comps_(t) { return this.comps.filter((c) => c.t === t || c.cls === t); }
  compInChildren(t, incInactive = true) { const r = this.comp(t); if (r) return r; for (const c of this.children) { if (!incInactive && !c.activeSelf) continue; const x = c.compInChildren(t, incInactive); if (x) return x; } return null; }
  compsInChildren(t, out = [], incInactive = true) { for (const c of this.comps) if (c.t === t || c.cls === t) out.push(c); for (const ch of this.children) if (incInactive || ch.activeSelf) ch.compsInChildren(t, out, incInactive); return out; }
  compInParent(t) { let g = this; while (g) { const c = g.comp(t); if (c) return c; g = g.parent; } return null; }
  get sr() { return this.comp('SR'); }
  get img() { return this.comp('Img'); }
  get txt() { return this.comp('Txt'); }
  // ---- transform helpers (world for non-UI; for UI it's "screen" space of the canvas)
  worldMatrix() { // world-space (not camera) matrix for world objects
    let m = M.trs(this.x, this.y, this.rot, this.sx, this.sy);
    let p = this.parent;
    while (p) { m = M.mul(p.localMatrix(), m); p = p.parent; }
    return m;
  }
  localMatrix() { if (this.rt && this._ui) return M.trs(this._lx, this._ly, this.rot, this.sx, this.sy); return M.trs(this.x, this.y, this.rot, this.sx, this.sy); }
  worldPos() { const m = this.worldMatrix(); return [m[4], m[5]]; }
  worldZ() { let z = this.z || 0, p = this.parent; while (p) { z += p.z || 0; p = p.parent; } return z; }
  setWorldPos(x, y) {
    if (!this.parent) { this.x = x; this.y = y; return; }
    const pm = M.inv(this.parent.worldMatrix()); const l = M.ap(pm, x, y); this.x = l[0]; this.y = l[1];
  }
  lossyScale() { const m = this.worldMatrix(); return [Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3])]; }
  worldRot() { let r = this.rot, p = this.parent; while (p) { r += p.rot; p = p.parent; } return r; }
  // UI anchored position helpers
  get ax() { return this.rt ? this.rt[4] : this.x; } set ax(v) { if (this.rt) this.rt[4] = v; else this.x = v; }
  get ay() { return this.rt ? this.rt[5] : this.y; } set ay(v) { if (this.rt) this.rt[5] = v; else this.y = v; }
  get w() { return this.rect ? this.rect.w : 0; } get h() { return this.rect ? this.rect.h : 0; }
  setSize(w, h) { if (this.rt) { const r = this.rect; const pw = r ? r.w - this.rt[6] : 0, ph = r ? r.h - this.rt[7] : 0; this.rt[6] = w - pw; this.rt[7] = h - ph; } }
  get path() { const a = []; let g = this; while (g) { a.unshift(g.name); g = g.parent; } return a.join('/'); }
}
E.GO = GO;
E.roots = [];

// ------------------------------------------------------------------ component base for scripts
class Behaviour {
  constructor(go, def) { this.go = go; this.t = 'MB'; this.cls = def ? def.cls : this.constructor.name; this.id = def ? def.id : 0; this.d = (def && def.d) || {}; this.enabled = def ? !def.off : true; this._started = false; this._awoken = false; }
  get tr() { return this.go; }
  ref(field) { return E.resolve(this.go, typeof field === 'string' && field in this.d ? this.d[field] : field); }
  refs(field) { const a = this.d[field] || []; return a.map((x) => E.resolve(this.go, x)); }
  get gameObject() { return this.go; }
  setEnabled(v) { v = !!v; if (v === this.enabled) return; this.enabled = v; if (this.go.activeInHierarchy) { if (v) { if (this.onEnable) this.onEnable(); } else if (this.onDisable) this.onDisable(); } }
  tween(o) { o.owner = o.owner || this; return E.tween(o); }
  after(t, fn) { return E.after(t, fn, this); }
  kill() { E.killOwner(this); }
}
E.Behaviour = Behaviour;

// ------------------------------------------------------------------ instantiate
// instance map: file:pid -> GO / component, attached to every GO of the instance as go._map
E.instantiate = (src, parent, opts) => {
  // src: "file:pid" of a GameObject or a GO (clone of runtime object not supported -> use src def)
  opts = opts || {};
  let file, pid;
  if (typeof src === 'string') { const i = src.lastIndexOf(':'); file = src.slice(0, i); pid = +src.slice(i + 1); }
  else if (src && src._src) { file = src._src[0]; pid = src._src[1]; }
  else throw new Error('bad instantiate src');
  const F = E.D.files[file];
  if (!F) { console.warn('file not loaded', file); return null; }
  const map = new Map();
  const created = [];
  const build = (p, par) => {
    const n = F.nodes[p]; if (!n) return null;
    const g = new GO(n.n); g.file = file; g.pid = p; g._src = [file, p]; g._map = map;
    g.activeSelf = !n.off; g.layer = n.ly || 0;
    const P = n.p || [0, 0]; g.x = P[0]; g.y = P[1]; g.z = P[2] || 0;
    if (n.r) g.rot = n.r; if (n.s) { g.sx = n.s[0]; g.sy = n.s[1]; }
    if (n.rt) g.rt = n.rt.slice();
    map.set(p, g);
    if (par) { g.parent = par; par.children.push(g); }
    for (const c of n.c || []) {
      let comp;
      if (c.t === 'MB') {
        const C = E.scripts[c.cls];
        if (!C) { comp = { t: 'MB', cls: c.cls, id: c.id, d: c.d, enabled: !c.off, go: g, _stub: 1 }; }
        else { comp = new C(g, c); }
      } else {
        comp = Object.assign({}, c); comp.go = g; comp.enabled = !c.off;
        if (comp.t === 'Img' || comp.t === 'Txt' || comp.t === 'Raw') comp.color = comp.col ? comp.col.slice() : (comp.t === 'Txt' ? null : [1, 1, 1, 1]);
        if (comp.t === 'SR') comp.color = comp.col ? comp.col.slice() : [1, 1, 1, 1];
        if (comp.t === 'Txt') { if (!comp.color) comp.color = c.col ? c.col.slice() : [1, 1, 1, 1]; comp.text = c.s || ''; }
        if (comp.t === 'CG') comp.alpha = c.a;
        if (comp.t === 'Btn') { comp.onClick = []; comp.interactable = c.ia !== 0 && c.ia !== false; }
        if (comp.t === 'Spine') E.spineInit(comp);
      }
      g.comps.push(comp);
      if (c.id) map.set(c.id, comp);
      created.push(comp);
    }
    for (const ch of n.ch || []) build(ch, g);
    return g;
  };
  const root = build(pid, null);
  if (!root) return null;
  if (opts.keepPos === false) { root.x = 0; root.y = 0; }
  if (parent) { root.parent = parent; parent.children.push(root); } else if (!opts.detached) E.roots.push(root);
  // lifecycle
  if (!opts.noAwake) E._awakeTree(root);
  return root;
};
E._awakeTree = (root) => {
  const act = root.activeInHierarchy;
  if (!act) return;
  const list = [];
  const walk = (g) => { if (!g.activeSelf) return; for (const c of g.comps) list.push(c); for (const ch of g.children) walk(ch); };
  walk(root);
  for (const c of list) if (c instanceof Behaviour && !c._awoken) { c._awoken = true; if (c.awake) try { c.awake(); } catch (e) { console.error(c.cls, 'awake', e); } }
  for (const c of list) if (c instanceof Behaviour && c.enabled && c.onEnable) try { c.onEnable(); } catch (e) { console.error(c.cls, 'onEnable', e); }
  for (const c of list) if (c.t === 'MB' && c.cls === 'DG.Tweening.DOTweenAnimation') E.dotweenEnable(c);
  for (const c of list) if (c.t === 'Spine') E.spineEnable(c);
};
E._propagateActive = (g, now) => {
  if (now) { E._awakeTree(g); return; }
  const walk = (x) => {
    if (!x.activeSelf && x !== g) return;
    for (const c of x.comps) {
      if (c instanceof Behaviour && c._awoken && c.enabled && c.onDisable) try { c.onDisable(); } catch (e) { console.error(c.cls, 'onDisable', e); }
      if (c.cls === 'DG.Tweening.DOTweenAnimation') E.dotweenDisable(c);
    }
    for (const ch of x.children) walk(ch);
  };
  walk(g);
};
E.destroy = (g) => {
  if (!g || g.destroyed) return;
  if (g.activeInHierarchy) E._propagateActive(g, false);
  const walk = (x) => { x.destroyed = true; for (const c of x.comps) { if (c instanceof Behaviour) { E.killOwner(c); if (c.onDestroy) try { c.onDestroy(); } catch (e) { console.error(e); } } } for (const ch of x.children) walk(ch); E.killOwner(x); };
  walk(g);
  g.remove();
};
E.newGO = (name, parent, ui) => { const g = new GO(name); if (ui) g.rt = [0.5, 0.5, 0.5, 0.5, 0, 0, 100, 100, 0.5, 0.5]; if (parent) { g.parent = parent; parent.children.push(g); } else E.roots.push(g); return g; };

// resolve a "file:pid" reference relative to a GameObject's instance map
E.resolve = (go, key) => {
  if (key == null) return null;
  if (typeof key !== 'string') return key;
  const i = key.lastIndexOf(':'); if (i < 0) return null;
  const file = key.slice(0, i), pid = +key.slice(i + 1);
  const map = go && go._map;
  if (map && go.file === file) {
    const r = map.get(pid); if (r) return r;
    const F = E.D.files[file];
    if (F && F.c2g[pid] != null) { const g = map.get(F.c2g[pid]); if (g) return g; }
  }
  // scene-wide lookup (references from scene objects into other scene objects of other instances)
  if (E.sceneMap) {
    if (E.sceneMap.has(key)) return E.sceneMap.get(key);
    const F0 = E.D.files[file];
    if (F0 && F0.c2g[pid] != null && E.sceneMap.has(file + ':' + F0.c2g[pid])) return E.sceneMap.get(file + ':' + F0.c2g[pid]);
  }
  if (E.D.spr[key]) return { sprite: key };
  if (E.D.so[key]) return E.so(key);
  if (E.D.audio[key]) return { clip: E.D.audio[key][0] };
  const F = E.D.files[file];
  if (F) { if (F.nodes[pid]) return { prefab: key }; if (F.c2g[pid] != null) return { prefab: file + ':' + F.c2g[pid], comp: pid }; }
  return { asset: key };
};
E.so = (key) => { const s = E.D.so[key]; return s ? s.d : null; };
E.soByClass = (cls) => { for (const k in E.D.so) if (E.D.so[k].cls === cls) return E.D.so[k].d; return null; };
E.prefabKey = (r) => (r && r.prefab) || r;
// instantiate a prefab reference (object returned by resolve or key)
E.spawn = (ref, parent, opts) => {
  if (typeof ref === 'string') { const r = E.resolve(null, ref); if (r && r.prefab) ref = r; }
  const key = typeof ref === 'string' ? ref : ref && ref.prefab;
  if (!key) return null;
  const g = E.instantiate(key, parent, opts);
  if (g && ref && ref.comp) return g.comps.find((c) => c.id === ref.comp) || g;
  return g;
};

// ------------------------------------------------------------------ scenes
E.scene = null;
E.scenePreload = {};
// sprite keys used by prefab references (string "file:pid" GO/comp keys)
E.prefabSprites = (refs, out) => {
  out = out || new Set();
  for (const r of refs) {
    if (!r) continue;
    const res = E.resolve(null, r);
    const key = res && res.prefab; if (!key) continue;
    const i = key.lastIndexOf(':');
    E.collectSprites(key.slice(0, i), +key.slice(i + 1), out);
  }
  return out;
};
E.loadScene = async (level, onProg) => {
  if (E.scenePacks[level]) await E.loadPack(E.scenePacks[level]);
  const F = await E.loadFile(level);
  E.killAll();
  for (const r of E.roots.slice()) if (!r._ddol) E.destroy(r);
  E.input && E.input.reset();
  const keys = E.collectSprites(level);
  if (E.scenePreload[level]) for (const k of E.scenePreload[level]()) keys.add(k);
  await E.preloadSprites(keys, onProg);
  E.scene = level;
  // build every root of the scene. Scene objects share one instance map so cross references work.
  const map = new Map();
  E.sceneMap = new Map();
  const rootPids = Object.keys(F.nodes).filter((p) => F.nodes[p].par == null).map(Number);
  const roots = [];
  for (const p of rootPids) {
    const g = E.instantiate(level + ':' + p, null, { noAwake: true });
    if (!g) continue;
    roots.push(g);
    for (const [k, v] of g._map) map.set(k, v);
  }
  // unify instance maps
  const fix = (g) => { g._map = map; for (const ch of g.children) fix(ch); };
  for (const r of roots) fix(r);
  for (const [k, v] of map) E.sceneMap.set(level + ':' + k, v);
  E.cameras = [];
  for (const r of roots) for (const c of r.compsInChildren('Cam')) E.cameras.push(c);
  E.mainCam = E.cameras.filter((c) => c.enabled && c.go.activeInHierarchy && (c.mask & 1)).sort((a, b) => a.depth - b.depth)[0] || null;
  for (const r of roots) E._awakeTree(r);
  if (E.onSceneLoaded) E.onSceneLoaded(level);
  return roots;
};
E.findInScene = (name) => { for (const r of E.roots) { if (r.name === name) return r; const x = r.findDeep(name); if (x) return x; } return null; };
E.findObjectOfType = (cls) => { for (const r of E.roots) { const c = r.compInChildren(cls); if (c) return c; } return null; };
E.findObjectsOfType = (cls) => { const out = []; for (const r of E.roots) r.compsInChildren(cls, out); return out; };

// ------------------------------------------------------------------ tweens
const tweens = [];
E.tweens = tweens;
const EZ = {};
EZ.linear = (t) => t;
EZ.inSine = (t) => 1 - Math.cos((t * Math.PI) / 2); EZ.outSine = (t) => Math.sin((t * Math.PI) / 2); EZ.inOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
EZ.inQuad = (t) => t * t; EZ.outQuad = (t) => 1 - (1 - t) * (1 - t); EZ.inOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
EZ.inCubic = (t) => t * t * t; EZ.outCubic = (t) => 1 - Math.pow(1 - t, 3); EZ.inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
EZ.inQuart = (t) => t ** 4; EZ.outQuart = (t) => 1 - (1 - t) ** 4; EZ.inOutQuart = (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
EZ.inQuint = (t) => t ** 5; EZ.outQuint = (t) => 1 - (1 - t) ** 5; EZ.inOutQuint = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);
EZ.inExpo = (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)); EZ.outExpo = (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)); EZ.inOutExpo = (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2);
EZ.inCirc = (t) => 1 - Math.sqrt(1 - t * t); EZ.outCirc = (t) => Math.sqrt(1 - (t - 1) ** 2); EZ.inOutCirc = (t) => (t < 0.5 ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2 : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2);
const c1 = 1.70158, c2 = c1 * 1.525, c3 = c1 + 1, c4 = (2 * Math.PI) / 3, c5 = (2 * Math.PI) / 4.5;
EZ.inBack = (t) => c3 * t ** 3 - c1 * t * t; EZ.outBack = (t) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; EZ.inOutBack = (t) => (t < 0.5 ? ((2 * t) ** 2 * ((c2 + 1) * 2 * t - c2)) / 2 : ((2 * t - 2) ** 2 * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2);
EZ.inElastic = (t) => (t === 0 ? 0 : t === 1 ? 1 : -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * c4));
EZ.outElastic = (t) => (t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1);
EZ.inOutElastic = (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? -(2 ** (20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2 : (2 ** (-20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1);
EZ.outBounce = (t) => { const n1 = 7.5625, d1 = 2.75; if (t < 1 / d1) return n1 * t * t; if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75; if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375; return n1 * (t -= 2.625 / d1) * t + 0.984375; };
EZ.inBounce = (t) => 1 - EZ.outBounce(1 - t); EZ.inOutBounce = (t) => (t < 0.5 ? (1 - EZ.outBounce(1 - 2 * t)) / 2 : (1 + EZ.outBounce(2 * t - 1)) / 2);
E.ease = EZ;
E.easeById = [EZ.outQuad, EZ.linear, EZ.inSine, EZ.outSine, EZ.inOutSine, EZ.inQuad, EZ.outQuad, EZ.inOutQuad, EZ.inCubic, EZ.outCubic, EZ.inOutCubic, EZ.inQuart, EZ.outQuart, EZ.inOutQuart, EZ.inQuint, EZ.outQuint, EZ.inOutQuint, EZ.inExpo, EZ.outExpo, EZ.inOutExpo, EZ.inCirc, EZ.outCirc, EZ.inOutCirc, EZ.inElastic, EZ.outElastic, EZ.inOutElastic, EZ.inBack, EZ.outBack, EZ.inOutBack, EZ.inBounce, EZ.outBounce, EZ.inOutBounce, EZ.linear, EZ.linear, EZ.linear, EZ.linear, EZ.linear, EZ.linear];
// E.tween({dur, delay, ease, update(k,raw), done, owner, loops(-1 inf), yoyo, unscaled})
E.tween = (o) => {
  const t = Object.assign({ t: 0, delay: 0, ease: EZ.outQuad, loops: 1, yoyo: false, dur: 0.3 }, o);
  if (typeof t.ease === 'string') t.ease = EZ[t.ease] || EZ.outQuad;
  if (typeof t.ease === 'number') t.ease = E.easeById[t.ease] || EZ.outQuad;
  t._loop = 0; tweens.push(t);
  return t;
};
E.after = (sec, fn, owner) => E.tween({ dur: 0, delay: sec, done: fn, owner, ease: EZ.linear });
E.wait = (sec, owner) => new Promise((r) => E.after(sec, r, owner || 'wait'));
E.kill = (t, complete) => { if (!t || t.killed) return; const i = tweens.indexOf(t); if (i >= 0) tweens.splice(i, 1); t.killed = true; if (complete) { if (t.update) t.update(1, 1); if (t.done) t.done(); } };
E.killOwner = (owner) => { for (const t of tweens.slice()) if (t.owner === owner || t.target === owner) E.kill(t); };
E.killAll = () => { for (const t of tweens.slice()) if (!t.keep) E.kill(t); };
const updateTweens = (dt) => {
  for (const t of tweens.slice()) {
    if (t.killed) continue;
    if (t.paused) continue;
    const d = dt * (t.timeScale || 1);
    if (t.delay > 0) { t.delay -= d; if (t.delay > 0) continue; if (t.onStart) { t.onStart(); t.onStart = null; } }
    else if (t.onStart) { t.onStart(); t.onStart = null; }
    t.t += d;
    const k = t.dur <= 0 ? 1 : Math.min(1, t.t / t.dur);
    let v = k;
    const rev = t.yoyo && t._loop % 2 === 1;
    v = t.ease(rev ? 1 - k : k);
    if (t.update) { try { t.update(v, rev ? 1 - k : k); } catch (e) { console.error(e); E.kill(t); continue; } }
    if (k >= 1) {
      t._loop++;
      if (t.loops < 0 || t._loop < t.loops) { t.t = 0; if (t.onLoop) t.onLoop(t._loop); continue; }
      E.kill(t);
      if (t.done) try { t.done(); } catch (e) { console.error(e); }
    }
  }
};
// convenience tweens on GOs
E.lerp = (a, b, k) => a + (b - a) * k;
E.to = (target, props, dur, o = {}) => {
  const from = {};
  for (const k in props) from[k] = target[k];
  return E.tween(Object.assign({ dur, owner: o.owner || target, target, update: (v) => { for (const k in props) target[k] = from[k] + (props[k] - from[k]) * v; if (o.onUpdate) o.onUpdate(v); } }, o));
};
E.moveTo = (g, x, y, dur, o = {}) => { // local position (world objects) or anchored position (UI)
  if (g.rt && !o.local3d) { const fx = g.rt[4], fy = g.rt[5]; return E.tween(Object.assign({ dur, owner: g, update: (v) => { g.rt[4] = fx + (x - fx) * v; g.rt[5] = fy + (y - fy) * v; } }, o)); }
  const fx = g.x, fy = g.y; return E.tween(Object.assign({ dur, owner: g, update: (v) => { g.x = fx + (x - fx) * v; g.y = fy + (y - fy) * v; } }, o));
};
E.moveWorld = (g, x, y, dur, o = {}) => { const s = g.worldPos(); return E.tween(Object.assign({ dur, owner: g, update: (v) => g.setWorldPos(s[0] + (x - s[0]) * v, s[1] + (y - s[1]) * v) }, o)); };
E.scaleTo = (g, s, dur, o = {}) => { const fx = g.sx, fy = g.sy; const tx = Array.isArray(s) ? s[0] : s, ty = Array.isArray(s) ? s[1] : s; return E.tween(Object.assign({ dur, owner: g, update: (v) => { g.sx = fx + (tx - fx) * v; g.sy = fy + (ty - fy) * v; } }, o)); };
E.rotTo = (g, r, dur, o = {}) => { const f = g.rot; return E.tween(Object.assign({ dur, owner: g, update: (v) => { g.rot = f + (r - f) * v; } }, o)); };
E.fadeTo = (c, a, dur, o = {}) => { // c: CG / Img / SR / Txt component
  if (c.t === 'CG') { const f = c.alpha; return E.tween(Object.assign({ dur, owner: c.go, update: (v) => { c.alpha = f + (a - f) * v; } }, o)); }
  const f = c.color[3]; return E.tween(Object.assign({ dur, owner: c.go, update: (v) => { c.color[3] = f + (a - f) * v; } }, o));
};
E.punchScale = (g, amt = 0.2, dur = 0.3, o = {}) => { const bx = g.sx, by = g.sy; return E.tween(Object.assign({ dur, owner: g, ease: EZ.linear, update: (v) => { const k = Math.sin(v * Math.PI) * (1 - v * 0.5); g.sx = bx * (1 + amt * k); g.sy = by * (1 + amt * k); }, done: () => { g.sx = bx; g.sy = by; } }, o)); };

// ------------------------------------------------------------------ DOTweenAnimation component
E.dotweenEnable = (c) => {
  const d = c.d || {};
  if (!d.autoPlay || c._tw) return;
  if (c._played && d.autoKill) return;
  c._played = true;
  const g = d.targetGO ? E.resolve(c.go, d.targetGO) : c.go;
  const tgo = (g && g.go) || g || c.go;
  const tcomp = d.target ? E.resolve(c.go, d.target) : null;
  const at = d.animationType;
  const loops = d.loops === -1 ? -1 : (d.loops || 1);
  const yoyo = d.loopType === 1;
  const ease = E.easeById[d.easeType] || EZ.outQuad;
  const dur = d.duration || 1;
  const base = { dur, delay: d.delay || 0, ease, loops, yoyo, owner: c };
  const ev = d.endValueV3 || [0, 0, 0];
  let tw = null;
  const go = tgo;
  if (at === 5) { // scale
    const fx = go.sx, fy = go.sy;
    let tx = d.optionalBool0 ? d.endValueFloat : ev[0], ty = d.optionalBool0 ? d.endValueFloat : ev[1];
    if (d.isRelative) { tx += fx; ty += fy; }
    if (d.isFrom) { go.sx = tx; go.sy = ty; tw = E.tween(Object.assign(base, { update: (v) => { go.sx = tx + (fx - tx) * v; go.sy = ty + (fy - ty) * v; } })); }
    else tw = E.tween(Object.assign(base, { update: (v) => { go.sx = fx + (tx - fx) * v; go.sy = fy + (ty - fy) * v; } }));
  } else if (at === 1 || at === 2) { // move / local move
    const ui = !!go.rt;
    const fx = ui ? go.rt[4] : go.x, fy = ui ? go.rt[5] : go.y;
    let tx = ev[0], ty = ev[1];
    if (at === 1 && !ui && go.parent && !d.isRelative) { const l = M.ap(M.inv(go.parent.worldMatrix()), tx, ty); tx = l[0]; ty = l[1]; }
    if (ui && at === 1 && !d.isRelative) { tx = fx + (ev[0] - 0) * 0; ty = fy; } // world move on UI: unsupported -> keep
    if (d.isRelative) { tx += fx; ty += fy; }
    const set = (x, y) => { if (ui) { go.rt[4] = x; go.rt[5] = y; } else { go.x = x; go.y = y; } };
    if (d.isFrom) { set(tx, ty); tw = E.tween(Object.assign(base, { update: (v) => set(tx + (fx - tx) * v, ty + (fy - ty) * v) })); }
    else tw = E.tween(Object.assign(base, { update: (v) => set(fx + (tx - fx) * v, fy + (ty - fy) * v) }));
  } else if (at === 3 || at === 4) {
    const f = go.rot; let t = ev[2]; if (d.isRelative) t += f;
    if (d.isFrom) { go.rot = t; tw = E.tween(Object.assign(base, { update: (v) => { go.rot = t + (f - t) * v; } })); }
    else tw = E.tween(Object.assign(base, { update: (v) => { go.rot = f + (t - f) * v; } }));
  } else if (at === 7 || at === 6) { // fade / color
    const comp = (tcomp && tcomp.t ? tcomp : null) || go.comp('CG') || go.comp('Img') || go.comp('SR') || go.comp('Txt');
    if (comp) {
      const isCG = comp.t === 'CG';
      const getA = () => (isCG ? comp.alpha : comp.color[3]);
      const setA = (a) => { if (isCG) comp.alpha = a; else comp.color[3] = a; };
      if (at === 7) {
        const f = getA(), t = d.endValueFloat;
        if (d.isFrom) { setA(t); tw = E.tween(Object.assign(base, { update: (v) => setA(t + (f - t) * v) })); }
        else tw = E.tween(Object.assign(base, { update: (v) => setA(f + (t - f) * v) }));
      } else if (!isCG) {
        const f = comp.color.slice(), t = d.endValueColor || [1, 1, 1, 1];
        tw = E.tween(Object.assign(base, { update: (v) => { for (let i = 0; i < 4; i++) comp.color[i] = f[i] + (t[i] - f[i]) * v; } }));
      }
    }
  } else if (at === 9 || at === 10 || at === 11) { // punch
    const bx = go.sx, by = go.sy, br = go.rot, px = go.rt ? go.rt[4] : go.x, py = go.rt ? go.rt[5] : go.y;
    tw = E.tween(Object.assign(base, { ease: EZ.linear, update: (v) => { const k = Math.sin(v * Math.PI * ((d.optionalInt0 || 10) / 2)) * (1 - v); if (at === 11) { go.sx = bx + ev[0] * k; go.sy = by + ev[1] * k; } else if (at === 10) go.rot = br + ev[2] * k; else { if (go.rt) { go.rt[4] = px + ev[0] * k; go.rt[5] = py + ev[1] * k; } else { go.x = px + ev[0] * k; go.y = py + ev[1] * k; } } } }));
  } else if (at === 12 || at === 13 || at === 14) { // shake
    const bx = go.sx, by = go.sy, br = go.rot, px = go.rt ? go.rt[4] : go.x, py = go.rt ? go.rt[5] : go.y;
    const str = d.optionalBool0 ? ev : [d.endValueFloat, d.endValueFloat, d.endValueFloat];
    tw = E.tween(Object.assign(base, { ease: EZ.linear, update: (v) => { const k = 1 - v; const rx = (Math.random() * 2 - 1) * k, ry = (Math.random() * 2 - 1) * k; if (at === 14) { go.sx = bx + str[0] * rx; go.sy = by + str[1] * ry; } else if (at === 13) go.rot = br + str[2] * rx; else { if (go.rt) { go.rt[4] = px + str[0] * rx; go.rt[5] = py + str[1] * ry; } else { go.x = px + str[0] * rx; go.y = py + str[1] * ry; } } if (v >= 1) { if (at === 14) { go.sx = bx; go.sy = by; } } } }));
  } else if (at === 21 && go.rt) {
    const fw = go.rt[6], fh = go.rt[7], tw2 = d.endValueV2 || [fw, fh];
    tw = E.tween(Object.assign(base, { update: (v) => { go.rt[6] = fw + (tw2[0] - fw) * v; go.rt[7] = fh + (tw2[1] - fh) * v; } }));
  }
  c._tw = tw;
};
E.dotweenDisable = (c) => { if (c._tw) { E.kill(c._tw); c._tw = null; c._played = false; } };

// ------------------------------------------------------------------ audio
E.audio = {
  ctx: null, buf: {}, raw: {}, muted: false, musicMuted: false, music: null, musicName: null, vol: 1,
  init() { if (this.ctx) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} },
  unlock() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); if (this._pendingMusic) { const m = this._pendingMusic; this._pendingMusic = null; this.playMusic(m); } },
  async get(name) {
    if (this.buf[name]) return this.buf[name];
    if (!this.ctx) return null;
    if (!this.raw[name]) this.raw[name] = fetch('assets/audio/' + name + '.mp3').then((r) => r.arrayBuffer()).then((ab) => this.ctx.decodeAudioData(ab)).catch(() => null);
    this.buf[name] = await this.raw[name];
    return this.buf[name];
  },
  play(name, opts = {}) {
    if (!name || this.muted) return null;
    if (!this.ctx) return null;
    const rec = { name, src: null, stopped: false, stop() { this.stopped = true; if (this.src) try { this.src.stop(); } catch (e) {} } };
    this.get(name).then((b) => {
      if (!b || rec.stopped) return;
      const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = !!opts.loop;
      const g = this.ctx.createGain(); g.gain.value = (opts.vol == null ? 1 : opts.vol) * this.vol;
      if (opts.pitch) s.playbackRate.value = opts.pitch;
      s.connect(g); g.connect(this.ctx.destination); s.start(); rec.src = s;
    });
    return rec;
  },
  playMusic(name) {
    if (this.musicName === name && this.music) return;
    if (this.music) this.music.stop();
    this.musicName = name;
    if (this.musicMuted || !name) { this.music = null; return; }
    if (!this.ctx || this.ctx.state !== 'running') { this._pendingMusic = name; }
    this.music = this.play(name, { loop: true, vol: 0.5 });
  },
  setMusicMuted(m) { this.musicMuted = m; if (m) { if (this.music) this.music.stop(); this.music = null; } else { const n = this.musicName; this.musicName = null; this.playMusic(n); } },
};
E.ESound = {};
E.playSound = (id, opts) => { // id: ESound int or name
  let name = typeof id === 'number' ? E.ESound[id] : id;
  if (!name) return null;
  name = E.soundFile[name] || name;
  return E.audio.play(name, opts);
};
E.soundFile = { Spinning_Wheel: 'sfx_wheel_spinning' };
E.vibrate = (ms) => { try { if (E.save && E.save.user && E.save.user.vibration === false) return; if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; navigator.vibrate && navigator.vibrate(ms || 15); } catch (e) {} };

// ------------------------------------------------------------------ save
E.save = {};
E.saveKey = 'charm-master-save-v1';
E.loadSave = () => { try { E.save = JSON.parse(localStorage.getItem(E.saveKey) || '{}') || {}; } catch (e) { E.save = {}; } };
E.writeSave = () => { try { localStorage.setItem(E.saveKey, JSON.stringify(E.save)); } catch (e) {} };

// ------------------------------------------------------------------ main loop
E.update = (dt) => {
  E.dt = dt; E.time += dt; E.frame++;
  updateTweens(dt);
  // scripts
  const list = [];
  const walk = (g) => { if (!g.activeSelf || g.destroyed) return; for (const c of g.comps) if (c instanceof Behaviour && c.enabled) list.push(c); for (const ch of g.children) walk(ch); };
  for (const r of E.roots.slice()) walk(r);
  for (const c of list) if (!c._started && !c.go.destroyed) { c._started = true; if (c.start) try { c.start(); } catch (e) { console.error(c.cls, 'start', e); } }
  for (const c of list) if (c.update && c._started && !c.go.destroyed && c.enabled) try { c.update(dt); } catch (e) { console.error(c.cls, 'update', e); }
  for (const c of list) if (c.lateUpdate && c._started && !c.go.destroyed && c.enabled) try { c.lateUpdate(dt); } catch (e) { console.error(c.cls, 'lateUpdate', e); }
  E.spineUpdate(dt);
  if (E.particles) E.particles.update(dt);
};
E.rand = (a, b) => a + Math.random() * (b - a);
E.randInt = (a, b) => Math.floor(a + Math.random() * (b - a)); // [a,b)
E.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
E.shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
E.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
