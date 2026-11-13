'use strict';
// Minimal Shuriken ParticleSystem emulation + small helper effects
(() => {
const M = E.M;
const ev = (m, t, rnd) => {
  if (m == null) return 0;
  if (typeof m === 'number') return m;
  switch (m[0]) {
    case 'c': return m[1];
    case 'r': return m[1] + (m[2] - m[1]) * (rnd == null ? Math.random() : rnd);
    case 'k': return m[1] * curve(m[2], t || 0);
    case 'rk': { const a = curve(m[2], t || 0), b = curve(m[3], t || 0); return m[1] * (a + (b - a) * (rnd == null ? Math.random() : rnd)); }
  }
  return 0;
};
const curve = (pts, t) => { const f = E.clamp(t, 0, 1) * 8; const i = Math.min(7, Math.floor(f)); return pts[i] + (pts[i + 1] - pts[i]) * (f - i); };
const gradAt = (g, t) => {
  const c = g.c, a = g.a; let col = c[0][1], al = a[0][1];
  for (let i = 0; i < c.length; i++) { if (t <= c[i][0]) { if (i === 0) { col = c[0][1]; break; } const p = c[i - 1], q = c[i]; const k = (t - p[0]) / (q[0] - p[0] || 1); col = [p[1][0] + (q[1][0] - p[1][0]) * k, p[1][1] + (q[1][1] - p[1][1]) * k, p[1][2] + (q[1][2] - p[1][2]) * k]; break; } col = c[i][1]; }
  for (let i = 0; i < a.length; i++) { if (t <= a[i][0]) { if (i === 0) { al = a[0][1]; break; } const p = a[i - 1], q = a[i]; const k = (t - p[0]) / (q[0] - p[0] || 1); al = p[1] + (q[1] - p[1]) * k; break; } al = a[i][1]; }
  return [col[0], col[1], col[2], al];
};
const colEv = (m, t, rnd) => {
  if (!m) return [1, 1, 1, 1];
  if (m[0] === 'c') return m[1];
  if (m[0] === 'r') { const r = rnd == null ? Math.random() : rnd; return m[1].map((v, i) => v + (m[2][i] - v) * r); }
  if (m[0] === 'g') return gradAt(m[1], t);
  if (m[0] === 'rg') { const a = gradAt(m[1], t), b = gradAt(m[2], t); const r = rnd == null ? Math.random() : rnd; return a.map((v, i) => v + (b[i] - v) * r); }
  return [1, 1, 1, 1];
};
const systems = new Set();
const P = (E.particles = {
  get(comp) {
    if (comp.sys) return comp.sys;
    const key = comp.go.file + ':' + comp.id;
    const cfg = E.D.ps[key]; if (!cfg) return null;
    comp.sys = { cfg, comp, parts: [], t: 0, acc: 0, playing: false, emitting: false, bursts: [] };
    return comp.sys;
  },
  play(comp) { const s = this.get(comp); if (!s) return; s.t = 0; s.acc = 0; s.playing = true; s.emitting = true; s.bursts = (s.cfg.bursts || []).map((b) => ({ time: b[0], n: b[1], cycles: b[2] || 1, iv: b[3] || 0.01, done: 0 })); systems.add(s); },
  stop(comp, clear) { const s = comp.sys; if (!s) return; s.emitting = false; if (clear) s.parts.length = 0; },
  clear(comp) { if (comp.sys) comp.sys.parts.length = 0; },
  emit(comp, n) { const s = this.get(comp); if (!s) return; systems.add(s); for (let i = 0; i < n; i++) spawn(s); },
  update(dt) {
    for (const s of systems) {
      const c = s.cfg; const g = s.comp.go;
      if (g.destroyed) { systems.delete(s); continue; }
      const active = g.activeInHierarchy;
      if (s.playing && s.emitting && active) {
        s.t += dt * (c.sim || 1);
        let tt = s.t;
        if (tt > c.dur) { if (c.loop) { s.t -= c.dur; for (const b of s.bursts) b.done = 0; } else s.emitting = false; }
        if (s.emitting) {
          const rate = ev(c.rate, s.t / c.dur);
          s.acc += rate * dt; while (s.acc >= 1 && s.parts.length < (c.max || 1000)) { s.acc -= 1; spawn(s); }
          for (const b of s.bursts) { while (b.done < b.cycles && s.t >= b.time + b.done * b.iv) { const n = Math.round(ev(b.n)); for (let i = 0; i < n; i++) spawn(s); b.done++; } }
        }
      }
      const gv = ev(c.grav) * 9.81;
      for (let i = s.parts.length - 1; i >= 0; i--) {
        const p = s.parts[i]; p.age += dt;
        if (p.age >= p.life) { s.parts.splice(i, 1); continue; }
        const k = p.age / p.life;
        let vx = p.vx, vy = p.vy;
        if (c.vel) { vx += ev(c.vel[0], k, p.r1); vy += ev(c.vel[1], k, p.r2); }
        p.vy -= gv * dt;
        if (c.force) { p.vx += ev(c.force[0], k, p.r1) * dt; p.vy += ev(c.force[1], k, p.r2) * dt; }
        p.x += vx * dt; p.y += vy * dt;
        if (c.rotLife) p.rot += ev(c.rotLife, k, p.r3) * dt;
      }
      if (!s.emitting && !s.parts.length) { s.playing = false; systems.delete(s); }
    }
  },
  draw(comp, ctx) {
    const s = comp.sys; if (!s || !s.parts.length) return;
    const c = s.cfg; const g = comp.go;
    let img = null;
    if (c.tex && E.D.tex[c.tex]) { img = E.texImg(E.D.tex[c.tex][0]); if (!img._ok) img = null; }
    E.setT(g.wm);
    for (const p of s.parts) {
      const k = p.age / p.life;
      let size = p.size * (c.sizeLife ? ev(c.sizeLife, k, p.r4) : 1);
      const col = colEv(c.colLife, k, p.r5);
      const a = p.col[3] * col[3]; if (a <= 0.01 || size <= 0) continue;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-p.rot); ctx.globalAlpha = a;
      if (img) {
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (c.tiles) { const tx = c.tiles[0] || 1, ty = c.tiles[1] || 1; sw = img.width / tx; sh = img.height / ty; const fr = Math.floor((ev(c.tiles[3], 0, p.r6) * tx * ty + ev(c.tiles[2], k, p.r6) * tx * ty * (c.tiles[5] || 1))) % (tx * ty); sx = (fr % tx) * sw; sy = Math.floor(fr / tx) * sh; }
        ctx.scale(1, -1);
        ctx.drawImage(img, sx, sy, sw, sh, -size / 2, -size / 2, size, size);
      } else {
        const r = size / 2; const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        const cc = [p.col[0] * col[0], p.col[1] * col[1], p.col[2] * col[2]];
        gr.addColorStop(0, E.colorStr(cc.concat(1), 1)); gr.addColorStop(1, E.colorStr(cc.concat(0), 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
});
const spawn = (s) => {
  const c = s.cfg; const k = s.t / (c.dur || 1);
  const sh = c.shape || {};
  let x = 0, y = 0, dx = 0, dy = 1;
  if (sh.en) {
    const t = sh.type;
    if (t === 5 || t === 15 || t === 16) { x = (Math.random() - 0.5) * (sh.scale[0] || 1); y = (Math.random() - 0.5) * (sh.scale[1] || 1); dx = 0; dy = 1; }
    else if (t === 4 || t === 8) { const ang = ((Math.random() * 2 - 1) * (sh.angle || 0)) * E.DEG; const r = (sh.r || 0) * Math.random(); x = (Math.random() * 2 - 1) * r; dx = Math.sin(ang); dy = Math.cos(ang); }
    else { const arc = (sh.arc || 360) * E.DEG; const a = Math.random() * arc; const r = (sh.r || 1) * (1 - (sh.rt == null ? 1 : sh.rt) * Math.random()); dx = Math.cos(a); dy = Math.sin(a); x = dx * r; y = dy * r; }
    x += sh.pos ? sh.pos[0] : 0; y += sh.pos ? sh.pos[1] : 0;
    if (sh.rotz) { const rr = sh.rotz * E.DEG, cs = Math.cos(rr), sn = Math.sin(rr); [x, y] = [x * cs - y * sn, x * sn + y * cs]; [dx, dy] = [dx * cs - dy * sn, dx * sn + dy * cs]; }
  } else { dx = 0; dy = 0; }
  const sp = ev(c.speed, k);
  const col = colEv(c.color, k);
  s.parts.push({ x, y, vx: dx * sp, vy: dy * sp, age: 0, life: Math.max(0.01, ev(c.life, k)), size: ev(c.size, k), rot: ev(c.rot, k), col, r1: Math.random(), r2: Math.random(), r3: Math.random(), r4: Math.random(), r5: Math.random(), r6: Math.random() });
};
// auto-play particle systems that play on awake
const origAwake = E._awakeTree;
E._awakeTree = (root) => {
  origAwake(root);
  if (!root.activeInHierarchy) return;
  const walk = (g) => { if (!g.activeSelf) return; for (const c of g.comps) if (c.t === 'PS') { const s = P.get(c); if (s && s.cfg.paw && !s.playing) P.play(c); } for (const ch of g.children) walk(ch); };
  walk(root);
};
E.psPlay = (g) => { const go = g.go || g; for (const c of go.compsInChildren('PS')) P.play(c); };
E.psStop = (g, clear) => { const go = g.go || g; for (const c of go.compsInChildren('PS')) P.stop(c, clear); };
})();

// ---------------------------------------------------------------- AssetKits ParticleImage (UI particles)
(() => {
const mmv = (v, t) => {
  if (v == null) return 0; if (typeof v === 'number') return v;
  const m = v.m_Mode;
  const cv = (c) => { const k = (c && c.curve) || []; if (!k.length) return 1; if (t <= k[0][0]) return k[0][1]; for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const a = k[i - 1], b = k[i]; return a[1] + (b[1] - a[1]) * ((t - a[0]) / (b[0] - a[0] || 1)); } return k[k.length - 1][1]; };
  if (m === 0) return v.m_ConstantMax;
  if (m === 3) return v.m_ConstantMin + Math.random() * (v.m_ConstantMax - v.m_ConstantMin);
  if (m === 1) return (v.m_CurveMultiplier || 1) * cv(v.m_CurveMax);
  if (m === 2) return (v.m_CurveMultiplier || 1) * (cv(v.m_CurveMin) + Math.random() * (cv(v.m_CurveMax) - cv(v.m_CurveMin)));
  return v.m_ConstantMax || 0;
};
const sep = (v, t) => (v && v.mainCurve ? (v.separated ? [mmv(v.xCurve, t), mmv(v.yCurve, t)] : [mmv(v.mainCurve, t), mmv(v.mainCurve, t)]) : [mmv(v, t), mmv(v, t)]);
const cget = (c, k) => (Array.isArray(c) ? c[k] : c ? c['rgba'[k]] : 1);
const gradCol = (g, t, rnd) => {
  if (!g) return [1, 1, 1, 1];
  const mode = g.m_Mode;
  if (mode === 0 || mode == null) { const c = g.m_ColorMax || g.m_Color; return c ? [0, 1, 2, 3].map((k) => cget(c, k)) : [1, 1, 1, 1]; }
  if (mode === 2) { const a = g.m_ColorMin, b = g.m_ColorMax; const r = rnd == null ? Math.random() : rnd; return [0, 1, 2, 3].map((k) => cget(a, k) + (cget(b, k) - cget(a, k)) * r); }
  const gr = g.m_GradientMax; if (!gr) return [1, 1, 1, 1];
  const keys = (n, pre) => { const a = []; for (let i = 0; i < n; i++) a.push([gr[pre + 'time' + i] / 65535, gr['key' + i]]); return a; };
  const ck = keys(gr.m_NumColorKeys || 2, 'c'), ak = keys(gr.m_NumAlphaKeys || 2, 'a');
  if (mode === 4) { const kk = ck[Math.floor((rnd == null ? Math.random() : rnd) * ck.length)][1]; return [cget(kk, 0), cget(kk, 1), cget(kk, 2), 1]; }
  const tt = mode === 3 ? (rnd == null ? Math.random() : rnd) : t;
  const at = (arr, k) => { for (let i = 0; i < arr.length; i++) if (tt <= arr[i][0]) { if (!i) return cget(arr[0][1], k); const a = arr[i - 1], b = arr[i]; const f = (tt - a[0]) / (b[0] - a[0] || 1); return cget(a[1], k) + (cget(b[1], k) - cget(a[1], k)) * f; } return cget(arr[arr.length - 1][1], k); };
  return [at(ck, 0), at(ck, 1), at(ck, 2), at(ak, 3)];
};
class ParticleImage extends E.Behaviour {
  awake() { this.parts = []; this.t = 0; this.acc = 0; this.playing = false; this.onFinish = []; this.onArrive = []; }
  onEnable() { if (this.d._playMode === 0) this.play(); }
  play() { this.t = 0; this.acc = 0; this.playing = true; this.emitting = true; this.bursts = (this.d._bursts || []).map((b) => ({ time: b.time || 0, count: b.count || 10, done: false })); for (const ch of this.d._children || []) { const c = E.resolve(this.go, ch); if (c && c.play && c !== this) c.play(); } }
  stop() { this.emitting = false; }
  clear() { this.parts.length = 0; }
  spawn() {
    const d = this.d; const sh = d._shape;
    let x = 0, y = 0, dx = 0, dy = 1;
    if (sh === 1) { const a = Math.random() * Math.PI * 2; const r = (d._radius || 0) * (d._emitOnSurface ? 1 : Math.sqrt(Math.random())); x = Math.cos(a) * r; y = Math.sin(a) * r; dx = Math.cos(a); dy = Math.sin(a); }
    else if (sh === 3) { x = (Math.random() - 0.5) * (d._width || 0); y = (Math.random() - 0.5) * (d._height || 0); dx = 0; dy = 1; }
    else if (sh === 2 || sh === 4) { const half = ((d._angle || 30) / 2) * E.DEG; const a = (Math.random() * 2 - 1) * half; dx = Math.sin(a); dy = Math.cos(a); }
    const k = this.t / (d._duration || 1);
    const sp = mmv(d._startSpeed, k) * 60;
    const life = Math.max(0.05, mmv(d._lifetime, k));
    const size = sep(d._startSize, k);
    const col = gradCol(d._startColor, k);
    this.parts.push({ x, y, vx: dx * sp, vy: dy * sp, age: 0, life, w: size[0], h: size[1], rot: mmv(d._startRotation, k) || 0, col, r: Math.random(), fi: null });
  }
  update(dt) {
    const d = this.d;
    if (this.playing && this.emitting) {
      this.t += dt;
      const dur = d._duration || 1;
      if (this.t >= dur) { if (d._loop) { this.t -= dur; for (const b of this.bursts) b.done = false; } else this.emitting = false; }
      if (this.emitting) {
        this.acc += (d._rate || 0) * dt; while (this.acc >= 1) { this.acc -= 1; this.spawn(); }
        for (const b of this.bursts) if (!b.done && this.t >= b.time) { b.done = true; for (let i = 0; i < b.count; i++) this.spawn(); }
      }
    }
    const grav = mmv(d._gravity, 0) * 60;
    const tgt = this.target || (d._attractorTarget ? E.resolve(this.go, d._attractorTarget) : null);
    let tp = null;
    if (tgt && tgt.wm && this.go.wm) tp = E.M.ap(E.M.inv(this.go.wm), tgt.wm[4], tgt.wm[5]);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); if (tp) for (const f of this.onArrive) f(); continue; }
      const k = p.age / p.life;
      p.vy += grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += (mmv(d._rotationOverLifetime, k) || 0) * dt;
      if (tp) { const f = E.clamp(mmv(d._toTarget, k), 0, 1); p.dx = p.x + (tp[0] - p.x) * f; p.dy = p.y + (tp[1] - p.y) * f; } else { p.dx = p.x; p.dy = p.y; }
    }
    if (this.playing && !this.emitting && !this.parts.length) { this.playing = false; for (const f of this.onFinish.slice()) f(); }
  }
  drawUI(ctx, alpha) {
    if (!this.parts.length) return;
    const d = this.d;
    let img = null, tf = null;
    if (d.m_Texture && E.D.tex[d.m_Texture]) { tf = E.D.tex[d.m_Texture][0]; img = E.texImg(tf); if (!img._ok) img = null; }
    E.setT(this.go.wm);
    const tiles = d._textureTile;
    for (const p of this.parts) {
      const k = p.age / p.life;
      const sz = d._sizeOverLifetime ? sep(d._sizeOverLifetime, k) : [1, 1];
      const lc = d._colorOverLifetime ? gradCol(d._colorOverLifetime, k, p.r) : [1, 1, 1, 1];
      const a = alpha * p.col[3] * lc[3]; if (a < 0.01) continue;
      const w = p.w * sz[0], h = p.h * sz[1];
      ctx.save(); ctx.translate(p.dx, p.dy); ctx.rotate(-p.rot * E.DEG); ctx.globalAlpha = a;
      const col = [p.col[0] * lc[0], p.col[1] * lc[1], p.col[2] * lc[2]];
      if (img) {
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (d._sheetModule && tiles) { const tx = tiles.x || tiles[0] || 1, ty = tiles.y || tiles[1] || 1; sw = img.width / tx; sh = img.height / ty; if (p.fi == null) p.fi = Math.floor(Math.random() * tx * ty); sx = (p.fi % tx) * sw; sy = Math.floor(p.fi / tx) * sh; }
        ctx.scale(1, -1);
        const tinted = (col[0] < 0.99 || col[1] < 0.99 || col[2] < 0.99) ? E.tinted(Object.assign([tf, sx, sy, sw, sh], { img }), [col[0], col[1], col[2]]) : null;
        if (tinted) ctx.drawImage(tinted, -w / 2, -h / 2, w, h); else ctx.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
      } else { ctx.fillStyle = E.colorStr([col[0], col[1], col[2], 1]); ctx.fillRect(-w / 2, -h / 2, w, h); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
E.scripts['AssetKits.ParticleImage.ParticleImage'] = ParticleImage;
})();
