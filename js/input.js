'use strict';
(() => {
const M = E.M;
const inRect = (h, x, y) => {
  const p = M.ap(h.im, x, y); const R = h.rect;
  const x0 = -R.w * R.pvx, y0 = -R.h * R.pvy;
  return p[0] >= x0 && p[0] <= x0 + R.w && p[1] >= y0 && p[1] <= y0 + R.h;
};
const clipOk = (h, x, y) => { for (const c of h.clips || []) if (!inRect(c, x, y)) return false; return true; };
E.uiRaycast = (x, y) => {
  const H = E._uiHits;
  for (let i = H.length - 1; i >= 0; i--) { const h = H[i]; if (inRect(h, x, y) && clipOk(h, x, y)) return h; }
  return null;
};
E.uiRaycastAll = (x, y) => E._uiHits.filter((h) => inRect(h, x, y) && clipOk(h, x, y)).reverse();
// ---- world colliders
const ptInCollider = (c, g, wx, wy) => {
  const im = M.inv(g.worldMatrix()); const p = M.ap(im, wx, wy);
  const of = c.of || [0, 0]; const lx = p[0] - of[0], ly = p[1] - of[1];
  if (c.t === 'Box') return Math.abs(lx) <= c.sz[0] / 2 && Math.abs(ly) <= c.sz[1] / 2;
  if (c.t === 'Circle') return lx * lx + ly * ly <= c.r * c.r;
  if (c.t === 'Poly') {
    for (const path of c.pts) { let ins = false; for (let i = 0, j = path.length - 1; i < path.length; j = i++) { const xi = path[i][0], yi = path[i][1], xj = path[j][0], yj = path[j][1]; if ((yi > ly) !== (yj > ly) && lx < ((xj - xi) * (ly - yi)) / (yj - yi) + xi) ins = !ins; } if (ins) return true; }
    return false;
  }
  return false;
};
E.ptInCollider = ptInCollider;
E.overlapPointAll = (wx, wy, filter) => {
  const out = [];
  for (const it of E._colliders) { if (!it.c.enabled) continue; if (filter && !filter(it)) continue; if (ptInCollider(it.c, it.g, wx, wy)) out.push(it); }
  return out;
};
const orderOf = (g) => { const s = g.comp('SR') || (g.children[0] && g.children[0].comp('SR')); let o = s ? s.o : 0; let p = g; while (p) { const sg = p.comp('SG'); if (sg && sg.enabled) { o += sg.o * 1000; break; } p = p.parent; } return o; };
E.worldRaycast = (wx, wy) => {
  const hits = E.overlapPointAll(wx, wy);
  if (!hits.length) return null;
  hits.sort((a, b) => orderOf(b.g) - orderOf(a.g) || b.idx - a.idx);
  return hits[0];
};
// ---- handler lookup
const findUp = (g, pred) => { while (g) { for (const c of g.comps) if (pred(c)) return c; g = g.parent; } return null; };
const isBtn = (c) => c.t === 'Btn' && c.enabled;
const has = (m) => (c) => c instanceof E.Behaviour && c.enabled && typeof c[m] === 'function';

const I = (E.input = {
  down: false, x: 0, y: 0, wx: 0, wy: 0, listeners: [], cur: null, locked: 0,
  on(fn) { this.listeners.push(fn); return fn; },
  off(fn) { const i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1); },
  reset() { this.cur = null; this.down = false; },
  overUI() { return !!E.uiRaycast(this.x, this.y); },
});
let dragThreshold = 18;
const mkEv = (x, y) => { const w = E.screenToWorld(x, y); return { x, y, wx: w[0], wy: w[1] }; };
const emit = (type, ev) => { for (const f of I.listeners.slice()) try { f(type, ev); } catch (e) { console.error(e); } };
const btnPress = (b, on) => { b._pressed = on; const img = b.go.comp('Img'); if (b.tr === 1 && img) { if (on) { b._c0 = img.color.slice(); img.color[0] *= 0.78; img.color[1] *= 0.78; img.color[2] *= 0.78; } else if (b._c0) { img.color[0] = b._c0[0]; img.color[1] = b._c0[1]; img.color[2] = b._c0[2]; } } };
E.clickButton = (b) => {
  if (!b || !b.interactable || !b.enabled) return;
  for (const f of b.onClick.slice()) try { f(); } catch (e) { console.error(e); }
  // persistent calls
  const calls = b.cb && b.cb.m_PersistentCalls && b.cb.m_PersistentCalls.m_Calls;
  if (calls) for (const pc of calls) {
    const t = E.resolve(b.go, pc.m_Target); const mn = pc.m_MethodName; if (!t || !mn) continue;
    const a = pc.m_Arguments || {}; const arg = pc.m_Mode === 3 ? a.m_IntArgument : pc.m_Mode === 4 ? a.m_FloatArgument : pc.m_Mode === 5 ? a.m_StringArgument : pc.m_Mode === 6 ? !!a.m_BoolArgument : undefined;
    if (t instanceof E.GO) { if (mn === 'SetActive') t.setActive(arg); continue; }
    if (typeof t[mn] === 'function') try { t[mn](arg); } catch (e) { console.error(e); }
    else if (typeof t[mn[0].toLowerCase() + mn.slice(1)] === 'function') try { t[mn[0].toLowerCase() + mn.slice(1)](arg); } catch (e) { console.error(e); }
  }
};
const onDown = (cx, cy, id) => {
  E.audio.unlock();
  if (I.cur) return;
  const [x, y] = E.clientToScreen(cx, cy);
  I.down = true; I.x = x; I.y = y;
  const ev = mkEv(x, y); I.wx = ev.wx; I.wy = ev.wy;
  const st = { id, sx: x, sy: y, x, y, ev, dragging: false, t0: E.time };
  I.cur = st;
  emit('down', ev);
  if (I.locked > 0) return;
  const h = E.uiRaycast(x, y);
  st.ui = h;
  if (h) {
    st.target = h.g;
    st.inter = h.inter !== false;
    st.btn = st.inter ? findUp(h.g, isBtn) : null;
    if (st.btn && !st.btn.interactable) st.btn = null;
    st.downH = findUp(h.g, has('onPointerDown'));
    st.dragH = findUp(h.g, (c) => has('onDrag')(c) || has('onBeginDrag')(c) || (c.t === 'Scroll'));
    st.clickH = findUp(h.g, has('onPointerClick'));
    st.upH = findUp(h.g, has('onPointerUp'));
    if (st.btn) btnPress(st.btn, true);
    ev.target = h.g; ev.hit = h;
    if (st.downH) st.downH.onPointerDown(ev);
    if (st.dragH && st.dragH.t === 'Scroll') E.scrollBegin(st.dragH, ev);
    return;
  }
  const w = E.worldRaycast(ev.wx, ev.wy);
  st.world = w;
  if (w) {
    st.target = w.g; ev.target = w.g; ev.collider = w.c;
    st.downH = findUp(w.g, (c) => has('onPointerDown')(c) || has('onMouseDown')(c));
    st.dragH = findUp(w.g, (c) => has('onDrag')(c) || has('onBeginDrag')(c) || has('onMouseDrag')(c));
    st.clickH = findUp(w.g, has('onPointerClick'));
    st.upH = findUp(w.g, (c) => has('onPointerUp')(c) || has('onMouseUp')(c));
    if (st.downH) { if (st.downH.onPointerDown) st.downH.onPointerDown(ev); else st.downH.onMouseDown(ev); }
  }
};
const onMove = (cx, cy, id) => {
  const [x, y] = E.clientToScreen(cx, cy);
  I.x = x; I.y = y; const ev = mkEv(x, y); I.wx = ev.wx; I.wy = ev.wy;
  const st = I.cur;
  if (!st) { emit('hover', ev); return; }
  ev.dx = x - st.x; ev.dy = y - st.y; st.x = x; st.y = y; ev.target = st.target;
  emit('move', ev);
  if (I.locked > 0) return;
  if (!st.dragging && Math.hypot(x - st.sx, y - st.sy) > dragThreshold) {
    st.dragging = true;
    if (st.dragH) {
      if (st.btn && st.dragH.t === 'Scroll') { btnPress(st.btn, false); st.btn = null; }
      if (st.dragH.t === 'Scroll') E.scrollDragStart(st.dragH, ev);
      else if (st.dragH.onBeginDrag) st.dragH.onBeginDrag(ev);
    }
  }
  if (st.dragging && st.dragH) {
    if (st.dragH.t === 'Scroll') E.scrollDrag(st.dragH, ev);
    else if (st.dragH.onDrag) st.dragH.onDrag(ev); else if (st.dragH.onMouseDrag) st.dragH.onMouseDrag(ev);
  } else if (st.world && st.downH && st.downH.onMouseDrag && !st.dragH) st.downH.onMouseDrag(ev);
};
const onUp = (cx, cy, id) => {
  const st = I.cur; if (!st) return;
  const [x, y] = cx == null ? [st.x, st.y] : E.clientToScreen(cx, cy);
  I.down = false; I.x = x; I.y = y; I.cur = null;
  const ev = mkEv(x, y); ev.target = st.target;
  emit('up', ev);
  if (st.btn) btnPress(st.btn, false);
  if (I.locked > 0 && !st.downH) return;
  if (st.dragging && st.dragH) { if (st.dragH.t === 'Scroll') E.scrollEnd(st.dragH, ev); else if (st.dragH.onEndDrag) st.dragH.onEndDrag(ev); }
  if (st.upH) { if (st.upH.onPointerUp) st.upH.onPointerUp(ev); else if (st.upH.onMouseUp) st.upH.onMouseUp(ev); }
  const moved = Math.hypot(x - st.sx, y - st.sy);
  if (!st.dragging || moved < dragThreshold * 2) {
    // still over same target?
    if (st.ui) {
      const h = E.uiRaycast(x, y);
      const ok = h && (h.g === st.target || isAncestor(st.btn ? st.btn.go : st.target, h.g));
      if (ok) {
        if (st.btn && st.btn.interactable && (!st.dragging || !st.dragH || st.dragH.t !== 'Scroll')) E.clickButton(st.btn);
        if (st.clickH && !st.dragging) st.clickH.onPointerClick(ev);
      }
    } else if (st.clickH && !st.dragging) st.clickH.onPointerClick(ev);
  }
};
const isAncestor = (a, g) => { while (g) { if (g === a) return true; g = g.parent; } return false; };
E.bindInput = (el) => {
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture && el.setPointerCapture(e.pointerId); onDown(e.clientX, e.clientY, e.pointerId); e.preventDefault(); });
  el.addEventListener('pointermove', (e) => { if (I.cur && I.cur.id !== e.pointerId) return; onMove(e.clientX, e.clientY, e.pointerId); });
  el.addEventListener('pointerup', (e) => { if (I.cur && I.cur.id !== e.pointerId) return; onUp(e.clientX, e.clientY, e.pointerId); });
  el.addEventListener('pointercancel', (e) => onUp(null, null, e.pointerId));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
};
// ---- ScrollRect
E.scrollBegin = (s, ev) => { s._vel = [0, 0]; s._drag = false; };
E.scrollDragStart = (s, ev) => { s._drag = true; s._vel = [0, 0]; };
const scrollContent = (s) => E.resolve(s.go, s.content);
const scrollToScale = (s) => { const vp = s.vp ? E.resolve(s.go, s.vp) : s.go; const g = vp && vp.go ? vp.go : vp || s.go; return g.wm ? Math.hypot(g.wm[0], g.wm[1]) : 1; };
E.scrollDrag = (s, ev) => {
  const c = scrollContent(s); if (!c) return; const g = c.go || c;
  const k = scrollToScale(s);
  const dx = s.h ? ev.dx / k : 0, dy = s.v ? ev.dy / k : 0;
  g.rt[4] += dx; g.rt[5] += dy;
  s._vel = [dx / Math.max(E.dt, 1 / 120), dy / Math.max(E.dt, 1 / 120)];
  E.scrollClamp(s, true);
};
E.scrollEnd = (s) => { s._drag = false; };
E.scrollClamp = (s, soft) => {
  const c = scrollContent(s); if (!c) return; const g = c.go || c;
  const vpr = s.vp ? E.resolve(s.go, s.vp) : s.go; const vg = vpr && vpr.go ? vpr.go : vpr || s.go;
  if (!g.rect || !vg.rect) return;
  // content offsets inside viewport (assume content pivot/anchors at top or left)
  const V = vg.rect, C = g.rect;
  if (s.v) {
    // content top relative to viewport top
    const top = g._ly + C.h * (1 - C.pvy); const vTop = V.h * (1 - V.pvy);
    const minY = 0, maxY = Math.max(0, C.h - V.h);
    let off = top - vTop; // >0 when scrolled down
    const cl = E.clamp(off, minY, maxY);
    if (off !== cl) g.rt[5] -= off - cl;
  }
  if (s.h) {
    const left = g._lx - C.w * C.pvx; const vLeft = -V.w * V.pvx;
    const maxX = 0, minX = Math.min(0, V.w - C.w);
    let off = left - vLeft; const cl = E.clamp(off, minX, maxX);
    if (off !== cl) g.rt[4] -= off - cl;
  }
};
E.updateScrolls = (dt) => {
  for (const r of E.roots) for (const s of r.compsInChildren('Scroll', [], false)) {
    if (!s.go.activeInHierarchy) continue;
    if (!s._drag && s._vel && (Math.abs(s._vel[0]) > 5 || Math.abs(s._vel[1]) > 5)) {
      const c = scrollContent(s); if (!c) continue; const g = c.go || c;
      g.rt[4] += s._vel[0] * dt; g.rt[5] += s._vel[1] * dt;
      s._vel[0] *= Math.pow(0.135, dt); s._vel[1] *= Math.pow(0.135, dt);
    }
    E.scrollClamp(s);
  }
};
})();
