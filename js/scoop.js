'use strict';
// Lucky Scoop (level6 "ScoopGame"): customize bowl/spoon/bag, scoop stars (2D physics), open blind bags,
// pack charms into a gift box, pick a card, deliver the box to the penguin, collect income + tip.
(() => {
const G = E.Game, S = E.scripts, M = E.M;
const goOf = (r) => G.goOf(r);
const btnOf = (r) => G.btn(r);
const vib = () => E.vibrate(60);
const CFG_TYPE = 0; // RemoteConfig data_config_type (default 0)
const POOL = { ScoopCategoryItem: 12, ScoopOptionItem: 13, ScoopStar: 106, YellowBall: 107, Compliment: 108 };
const SOK = {
  visual: 'sharedassets0.assets:14491', bowlCat: 'sharedassets0.assets:14490', spoonCat: 'sharedassets0.assets:14492', bagCat: 'sharedassets0.assets:14489',
  bagSkin: 'sharedassets6.assets:160', gift: 'sharedassets6.assets:161', card: 'sharedassets6.assets:159', star: 'sharedassets6.assets:162',
  bowlVis: 'sharedassets6.assets:163', spoonVis: 'sharedassets6.assets:164', charm: 'sharedassets1.assets:847',
};
G.session = G.session || {}; // GameSession (cross-scene transient): ScoopOrderId, OrderAvatar, BackFromGameMode, IsPlayAGame

// ------------------------------------------------------------------ small helpers (DOTween-like: "from" captured at tween start)
const tweenVal = (get, set, to, dur, o = {}) => {
  let f = null; const os = o.onStart;
  const t = Object.assign({ dur }, o);
  t.onStart = () => { f = get(); if (os) os(); };
  t.update = (v) => { if (f === null) f = get(); set(f + (to - f) * v); };
  return E.tween(t);
};
const rtTo = (g, i, v, dur, o = {}) => (g && g.rt ? tweenVal(() => g.rt[i], (x) => { g.rt[i] = x; }, v, dur, Object.assign({ owner: g.rt }, o)) : null);
const alphaTo = (c, a, dur, o = {}) => {
  if (!c) return null; const cg = c.t === 'CG';
  return tweenVal(() => (cg ? c.alpha : c.color[3]), (x) => { if (cg) c.alpha = x; else c.color[3] = x; }, a, dur, Object.assign({ owner: c }, o));
};
const scaleTo = (g, s, dur, o = {}) => {
  const tx = Array.isArray(s) ? s[0] : s, ty = Array.isArray(s) ? s[1] : s; let fx = null, fy = null; const os = o.onStart;
  return E.tween(Object.assign({ dur, owner: g }, o, {
    onStart: () => { fx = g.sx; fy = g.sy; if (os) os(); },
    update: (v) => { if (fx === null) { fx = g.sx; fy = g.sy; } g.sx = fx + (tx - fx) * v; g.sy = fy + (ty - fy) * v; },
  }));
};
const moveW = (g, x, y, dur, o = {}) => {
  let s = null; const os = o.onStart;
  return E.tween(Object.assign({ dur, owner: g }, o, {
    onStart: () => { s = g.worldPos(); if (os) os(); },
    update: (v) => { if (!s) s = g.worldPos(); g.setWorldPos(s[0] + (x - s[0]) * v, s[1] + (y - s[1]) * v); },
  }));
};
const jumpW = (g, x, y, power, dur, o = {}) => {
  let s = null; const os = o.onStart;
  return E.tween(Object.assign({ dur, owner: g, ease: E.ease.linear }, o, {
    onStart: () => { s = g.worldPos(); if (os) os(); },
    update: (v) => { if (!s) s = g.worldPos(); g.setWorldPos(s[0] + (x - s[0]) * v, s[1] + (y - s[1]) * v + power * 4 * v * (1 - v)); },
  }));
};
const rotToShort = (g, to, dur, o = {}) => { // DORotate RotateMode.Fast (shortest path)
  let f = null, t = to; const os = o.onStart;
  return E.tween(Object.assign({ dur, owner: g }, o, {
    onStart: () => { f = g.rot; t = f + ((((to - f) % 360) + 540) % 360) - 180; if (os) os(); },
    update: (v) => { if (f === null) { f = g.rot; t = f + ((((to - f) % 360) + 540) % 360) - 180; } g.rot = f + (t - f) * v; },
  }));
};
const yoyoScale = (g, axis, to, dur, o = {}) => tweenVal(() => (axis ? g.sy : g.sx), (x) => { if (axis) g.sy = x; else g.sx = x; }, to, dur, Object.assign({ owner: g, loops: 2, yoyo: true }, o));
const setSG = (sg, on) => { if (sg) { sg.enabled = !!on; sg.off = on ? 0 : 1; } };
const wpos = (r) => { const g = goOf(r); return g ? g.worldPos() : [0, 0]; };
const toLocalUI = (parent, sx, sy) => M.ap(M.inv(parent.wm), sx, sy);
const rootNamed = (n) => E.roots.find((r) => r.name === n) || E.findInScene(n);
const soundOn = () => G.data().user.sound !== false;
// Engine fix (scoped to level6): a UI graphic with scale 0 has a degenerate matrix, its inverse is all zeros and it
// then "contains" every point, so hidden scale-0 texts (Content/Message, Basket...) swallowed every tap. Unity never hits
// those; drop them from the raycast list after each render.
if (!E._scoopRenderPatched) {
  E._scoopRenderPatched = true;
  const render0 = E.render;
  E.render = () => {
    render0();
    if (E.scene !== 'level6' || !E._uiHits) return;
    E._uiHits = E._uiHits.filter((h) => { const m = h.g && h.g.wm; return !m || Math.abs(m[0] * m[3] - m[1] * m[2]) > 1e-9; });
  };
}
// compliment pool element (PoolType.Compliment 108)
const spawnCompliment = (sprite, x, y) => {
  const r = E.spawn(G.poolPrefab(POOL.Compliment), null); const g = goOf(r) || r; if (!g || !g.comp) return;
  const ci = g.comp('ScoopGame.ComplimentItem'); if (ci) ci.showEffect(sprite, x, y);
};

// ------------------------------------------------------------------ config + save data
const visualAsset = () => E.so(SOK.visual);
const catAsset = (i) => { const v = visualAsset(); return v ? E.so(v.CategoryAssets[i]) : null; };
const optById = (ca, id) => (ca ? ca.OptionDatas.find((o) => o.ID === id) || null : null);
const charmAsset = () => E.so(SOK.charm);
const randCharm = () => E.pick(charmAsset().DataList); // GetRandomData(0.6): the rate is ignored, uniform
// DataScoopVisual: G.data().scoop = {CategoryDataList:[{ID,SelectedItemID,UnlockedItems}]}
const DSV = {
  data() {
    const s = G.data();
    if (!s.scoop || !Array.isArray(s.scoop.CategoryDataList)) {
      const list = [];
      (visualAsset().CategoryAssets || []).forEach((k, i) => { const ca = E.so(k); list.push({ ID: i, SelectedItemID: 0, UnlockedItems: ca.OptionDatas.filter((o) => o.UnlockType === 0).map((o) => o.ID) }); });
      s.scoop = Object.assign(s.scoop || {}, { CategoryDataList: list }); G.save();
    }
    return s.scoop;
  },
  find(cat) { return this.data().CategoryDataList.find((c) => c.ID === cat) || null; },
  getSelected(cat) { const c = this.find(cat); return c ? c.SelectedItemID : 0; },
  has(cat, id) { const c = this.find(cat); return !!c && c.UnlockedItems.includes(id); },
  unlock(cat, id) { const c = this.find(cat); if (!c || c.UnlockedItems.includes(id)) return false; c.UnlockedItems.push(id); G.save(); return true; },
  setSelected(cat, id) { const c = this.find(cat); if (c) { c.SelectedItemID = id; G.save(); } },
};
// static OptionPanel.OnOptionSelected(categoryIndex, optionID)
const optionEv = new Set();
const fireOption = (cat, id) => { for (const f of [...optionEv]) try { f(cat, id); } catch (e) { console.error(e); } };

// ------------------------------------------------------------------ ScoopDataHolding (runtime only)
let holding = null;
const orderId = () => { const v = G.session.ScoopOrderId; return v != null && v >= 0 ? v : localOrder; }; // GameSession.ScoopOrderId (set by Home PopupIntroScoop, -1 = none)
let localOrder = null;
class ScoopDataHolding extends E.Behaviour {
  awake() { holding = this; if (!this.items) this.items = []; }
  get OpenedItems() { return this.items; }
  clearScoopData() { this.items = []; }
  registerItem(id) { this.items.push(id); }
  thisItemMakePair(id) { return this.items.filter((x) => x === id).length % 2 === 1; }
  hasOrderItem() { const o = orderId(); return o != null && this.items.includes(o); }
}
S['ScoopGame.ScoopDataHolding'] = ScoopDataHolding;
const H = () => { if (!holding) { holding = Object.create(ScoopDataHolding.prototype); holding.items = []; } return holding; };

E.scenePreload.level6 = () => {
  const out = E.prefabSprites(Object.values(POOL).map((t) => G.poolPrefab(t)));
  for (const k of Object.values(SOK)) { const d = E.so(k); if (d) E.collectRefs(d, out); }
  return out;
};

let ctrl = null, screen = null;

// ================================================================== ScoopGameController
class ScoopGameController extends E.Behaviour {
  awake() {
    ctrl = this; this._maxScoop = 1; this._currentScoop = 0; this._blindBagScooped = 0; this._boxPrice = 0; this._cardPrice = 0;
    this.optL = (cat, id) => this.onOptionSelected(cat, id);
  }
  onEnable() { optionEv.add(this.optL); }
  onDisable() { optionEv.delete(this.optL); }
  start() {
    this.bowl = this.ref('_bowlController'); this.drag = this.ref('_spoonDragController'); this.plate = this.ref('_blindBoxPlate');
    this.put = this.ref('_putCharmToBox'); this.bgAfter = goOf(this.ref('_bgAfterScoop')); this.give = this.ref('_giveBoxToCharacter');
    this.bagVisual = this.ref('_blindBagVisualAsset') || E.so(SOK.bagSkin);
    // no order from Home (direct ?scene=level6): pick one like PopupIntroScoop would
    if (G.session.setActiveCharacter) G.session.setActiveCharacter(false);
    localOrder = null;
    if (orderId() == null) { const l = charmAsset().DataList.filter((x) => (x.OrderLocalize || '').trim() !== ''); if (l.length) localOrder = E.pick(l).Id; }
    this.bowl.go.setActive(true); this.plate.go.setActive(false); this._blindBagScooped = 0;
    screen = E.ui.showScreen('ScoopGame.ScreenInGame');
    screen.registerScoopGame(this);
    this.drag.init(this); this.give._scoopGameController = this; this.put.init(this);
    this.put.go.setActive(false);
    this.setupScoopResult();
    this.startScoopGame();
    this._blindBagSkinId = DSV.getSelected(2);
    this.plate.setBlindBoxVisual(this.skinName(this._blindBagSkinId));
  }
  skinName(id) { const d = this.bagVisual._dataList.find((x) => x.ID === id); return d ? d.SkinName : 'defaults'; }
  onOptionSelected(cat, id) { if (cat !== 2 || !this.plate) return; this._blindBagSkinId = id; this.plate.setBlindBoxVisual(this.skinName(id)); }
  startScoopGame() { this.bowl.spawnStars(); this.bowl.showTutorial(); H().clearScoopData(); }
  hideScoopTutorial() { this.bowl.hideTutorial(); screen.showProcessBar(true); }
  setupScoopResult() { const n = E.randInt(4, 9); const list = this.bowl.getScooped(n); this._blindBagScooped += list.length; this.drag.setupResult(list); }
  doneOneScoop() { this._currentScoop++; if (this._maxScoop === 1) screen.showButtonAddScoop(true); }
  addMoreScoop() { this._maxScoop++; }
  goToStepBlindBox() {
    if (this.bgAfter) this.bgAfter.setActive(true);
    this.bowl.go.setActive(false); this.plate.go.setActive(true);
    this.setupBlindBoxPlate(); screen.showContentUnbox();
  }
  setupBlindBoxPlate() {
    this.plate.clearPlate();
    for (let i = 0; i < this._blindBagScooped; i++) { const d = randCharm(); this.plate.spawnBlindBox(d.Id, d.Sprite); }
    this.plate.popOutBlindBox();
  }
  addMoreBlindBox() { const d = randCharm(); this.plate.addMoreRandomBox(d.Id, d.Sprite); }
  isDoneUnbox() { return this.plate.doneUnbox; }
  gotoStepSelectBox() { this.plate.go.setActive(false); }
  hideTrayResult() { this.plate.hideTrayResult(); }
  gotoStepSort() { screen.block.setActive(true); this.put.go.setActive(true); this.put.openLid(() => screen.block.setActive(false)); }
  createCharmDrag(sp) { this.put.spawnCharm(sp); }
  onDonePutCharmStep() { screen.showContentSortPart2(); }
  onDoneSelectCardStep() {
    screen.block.setActive(true);
    this.put.closeLid(() => { screen.hide(); E.ui.showPopup('ScoopGame.DoneBoxCharmPopup'); });
  }
  gotoDelivery() { this.put.prepareFinalBox(); this.put.go.setActive(false); this.give.go.setActive(true); }
  onSelectGiftBox(sp) { this.give.setGiftBox(sp); this.give.setSkinCharacter(); }
  setBoxVisual(d) { this.put.setBoxVisual(d); }
  setCardVisual(d) { this.put.setCardVisual(d); }
  setBoxPrice(v) { this._boxPrice = v; }
  setCardPrice(v) { this._cardPrice = v; }
  getIncome() { return CFG_TYPE === 1 ? H().items.length * 100 : 300; }
  getTip() { return H().hasOrderItem() ? (CFG_TYPE === 1 ? 300 : 200) : 0; }
  showEndGame() {}
}
S['ScoopGame.ScoopGameController'] = ScoopGameController;

// ================================================================== Bowl + physics
// small custom 2D solver: dynamic circles (stars r .45, balls r .3, equal mass) vs static polygons/boxes of Bowl/Collider
// and the 3 kinematic spoon circles. Gravity 9.81*5, friction .4, restitution 0, angular drag .05.
const PH = { g: -9.81 * 5, mu: 0.4, sub: 4, iters: 3, step: 1 / 60, maxV: 40, angDrag: 0.05 };
const polyBB = (pts) => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const p of pts) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); } return [a, b, c, d]; };
const inPoly = (pts, x, y) => { let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
const closestOnPoly = (pts, x, y, out) => {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const ax = pts[j][0], ay = pts[j][1], ex = pts[i][0] - ax, ey = pts[i][1] - ay;
    const L = ex * ex + ey * ey || 1e-12; let t = ((x - ax) * ex + (y - ay) * ey) / L; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + ex * t, cy = ay + ey * t, d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
    if (d < best) { best = d; out[0] = cx; out[1] = cy; }
  }
  out[2] = Math.sqrt(best); return out;
};
// body vs immovable/kinematic surface; n points from the surface to the body centre; (svx,svy) = surface velocity
const contact = (b, nx, ny, svx, svy) => {
  const rvx = b.vx - svx, rvy = b.vy - svy; const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return;
  const pn = -vn, tx = -ny, ty = nx;
  const vt = rvx * tx + rvy * ty - b.w * b.r;
  let pt = -vt / 3; const lim = PH.mu * pn; if (pt > lim) pt = lim; else if (pt < -lim) pt = -lim;
  b.vx += pn * nx + pt * tx; b.vy += pn * ny + pt * ty; b.w -= (2 * pt) / b.r;
};
class BowlController extends E.Behaviour {
  awake() {
    this.hand = goOf(this.ref('_imageTransform'));
    this.loopGo = this.go.find('Tutorial/icon_infinity'); // _goLoop (inferred)
    if (this.hand) this.hand.setActive(false); if (this.loopGo) this.loopGo.setActive(false);
    this.tutKey = {};
    this.spoonGo = this.go.find('Spoon');
    this._bowlSkinId = DSV.getSelected(0); this._spoonSkinId = DSV.getSelected(1);
    this.updateBowlVisual(); this.updateSpoonVisual();
    this.optL = (cat, id) => this.onOptionSelected(cat, id); optionEv.add(this.optL);
    this.stars = []; this.balls = []; this.bodies = null;
  }
  onDestroy() { optionEv.delete(this.optL); }
  onOptionSelected(cat, id) {
    if (cat === 0) { this._bowlSkinId = id; this.updateBowlVisual(); }
    else if (cat === 1) { this._spoonSkinId = id; this.updateSpoonVisual(); }
  }
  updateBowlVisual() {
    const a = this.ref('_bowlVisualAsset') || E.so(SOK.bowlVis); const d = a && a._dataList.find((x) => x.ID === this._bowlSkinId); if (!d) return;
    const f = this.ref('_srBowlFull'), fr = this.ref('_srBowlFront'), sh = this.ref('_srShadow');
    if (f) f.sp = d.Full; if (fr) fr.sp = d.Front; if (sh) sh.sp = d.Shadow;
  }
  updateSpoonVisual() {
    const a = this.ref('_spoonVisualAsset') || E.so(SOK.spoonVis); const d = a && a._dataList.find((x) => x.ID === this._spoonSkinId); if (!d) return;
    const f = this.ref('_srSpoonFull'), fr = this.ref('_srSpoonFront');
    if (f) f.sp = d.Full; if (fr) fr.sp = d.Front;
  }
  starAsset() { return this.ref('_scoopStarAsset') || E.so(SOK.star); }
  spawnStars() {
    for (const b of this.stars.concat(this.balls)) E.destroy(b.go);
    this.stars = []; this.balls = [];
    const tl = wpos(this.ref('_tfTopLeft')), br = wpos(this.ref('_tfBottomRight'));
    this.spawnRect = [tl[0], br[0], br[1], tl[1]];
    const holder = goOf(this.ref('_starHolder')) || this.go;
    const list = this.starAsset().DataList;
    const mk = (type) => {
      const r = E.spawn(G.poolPrefab(type), holder); const g = goOf(r) || r;
      g.setWorldPos(E.rand(tl[0], br[0]), E.rand(br[1], tl[1]));
      const c = g.comp('Circle'); const rad = (c ? c.r : 0.3) * Math.abs(g.sx || 1);
      return { go: g, r: rad };
    };
    const n = this.d._starSpawn || 18;
    for (let i = 0; i < n; i++) {
      const s = mk(POOL.ScoopStar); const it = s.go.comp('ScoopStarItem'); if (it) it.setVisual(list[i % list.length]);
      this.stars.push(s);
      this.balls.push(mk(POOL.YellowBall));
    }
    this.initPhysics();
  }
  getScooped(n) { const l = this.starAsset().DataList; const out = []; for (let i = 0; i < n; i++) out.push(E.pick(l)); return out; }
  initPhysics() {
    const col = this.go.find('Collider'); const m = col.worldMatrix();
    this.statics = [];
    for (const c of col.comps) {
      const of = c.of || [0, 0];
      if (c.t === 'Poly') for (const path of c.pts) this.statics.push(path.map((p) => M.ap(m, p[0] + of[0], p[1] + of[1])));
      else if (c.t === 'Box') { const hx = c.sz[0] / 2, hy = c.sz[1] / 2; this.statics.push([[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map((p) => M.ap(m, p[0] + of[0], p[1] + of[1]))); }
    }
    this.statics = this.statics.map((pts) => ({ pts, bb: polyBB(pts) }));
    this.bodies = this.stars.concat(this.balls).map((b) => { const p = b.go.worldPos(); return { go: b.go, x: p[0], y: p[1], vx: 0, vy: 0, a: b.go.rot || 0, w: 0, r: b.r }; });
    const sc = this.spoonGo && this.spoonGo.find('Collider');
    this.spoonCol = sc ? { g: sc, circles: sc.comps.filter((c) => c.t === 'Circle' && !c.trig) } : null;
    this.acc = 0; this.prevSpoon = null;
  }
  spoonCircles() {
    if (!this.spoonCol) return [];
    const m = this.spoonCol.g.worldMatrix(); const k = Math.hypot(m[0], m[1]);
    return this.spoonCol.circles.map((c) => { const p = M.ap(m, c.of[0], c.of[1]); return { x: p[0], y: p[1], r: c.r * k }; });
  }
  update(dt) {
    if (!this.bodies) return;
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= PH.step) { this.acc -= PH.step; this.fixedStep(PH.step); }
    for (const b of this.bodies) { b.go.setWorldPos(b.x, b.y); b.go.rot = b.a; }
  }
  fixedStep(h) {
    // SpoonDragController.FixedUpdate: rb.MovePosition(_targetPos) while scooping
    const drag = ctrl && ctrl.drag;
    if (drag && drag._isScooping && drag._targetPos && this.spoonGo) this.spoonGo.setWorldPos(drag._targetPos[0], drag._targetPos[1]);
    const cur = this.spoonCircles(); const prev = this.prevSpoon && this.prevSpoon.length === cur.length ? this.prevSpoon : cur; this.prevSpoon = cur;
    const B = this.bodies, n = B.length, hs = h / PH.sub, cp = [0, 0, 0];
    for (let s = 0; s < PH.sub; s++) {
      const k = (s + 1) / PH.sub;
      const SP = cur.map((c, i) => ({ x: prev[i].x + (c.x - prev[i].x) * k, y: prev[i].y + (c.y - prev[i].y) * k, vx: (c.x - prev[i].x) / h, vy: (c.y - prev[i].y) / h, r: c.r }));
      const damp = 1 / (1 + PH.angDrag * hs);
      for (const b of B) { b.vy += PH.g * hs; b.x += b.vx * hs; b.y += b.vy * hs; b.a += b.w * hs * 57.29578; b.w *= damp; }
      for (let it = 0; it < PH.iters; it++) {
        // body vs body
        for (let i = 0; i < n; i++) {
          const a = B[i];
          for (let j = i + 1; j < n; j++) {
            const b = B[j]; const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
            if (dx >= rr || dx <= -rr || dy >= rr || dy <= -rr) continue;
            const d2 = dx * dx + dy * dy; if (d2 >= rr * rr) continue;
            let d = Math.sqrt(d2), nx = 0, ny = 1; if (d > 1e-6) { nx = dx / d; ny = dy / d; } else d = 0;
            const pen = (rr - d) * 0.5; a.x -= nx * pen; a.y -= ny * pen; b.x += nx * pen; b.y += ny * pen;
            const rvx = b.vx - a.vx, rvy = b.vy - a.vy, vn = rvx * nx + rvy * ny;
            if (vn < 0) {
              const jn = -vn * 0.5; a.vx -= jn * nx; a.vy -= jn * ny; b.vx += jn * nx; b.vy += jn * ny;
              const tx = -ny, ty = nx; const vt = rvx * tx + rvy * ty - b.w * b.r - a.w * a.r;
              let pt = -vt / 6; const lim = PH.mu * jn; if (pt > lim) pt = lim; else if (pt < -lim) pt = -lim;
              a.vx -= pt * tx; a.vy -= pt * ty; b.vx += pt * tx; b.vy += pt * ty; a.w -= (2 * pt) / a.r; b.w -= (2 * pt) / b.r;
            }
          }
        }
        // body vs kinematic spoon circles (infinite mass)
        for (const b of B) for (const c of SP) {
          const dx = b.x - c.x, dy = b.y - c.y, rr = b.r + c.r; const d2 = dx * dx + dy * dy; if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2) || 1e-6; const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : 1;
          b.x = c.x + nx * rr; b.y = c.y + ny * rr; contact(b, nx, ny, c.vx, c.vy);
        }
        // body vs static bowl
        for (const b of B) for (const st of this.statics) {
          const bb = st.bb; if (b.x + b.r < bb[0] || b.x - b.r > bb[2] || b.y + b.r < bb[1] || b.y - b.r > bb[3]) continue;
          const inside = inPoly(st.pts, b.x, b.y); closestOnPoly(st.pts, b.x, b.y, cp); const d = cp[2];
          let nx, ny;
          if (inside) { if (d < 1e-9) continue; nx = (cp[0] - b.x) / d; ny = (cp[1] - b.y) / d; }
          else { if (d >= b.r || d < 1e-9) continue; nx = (b.x - cp[0]) / d; ny = (b.y - cp[1]) / d; }
          b.x = cp[0] + nx * b.r; b.y = cp[1] + ny * b.r; contact(b, nx, ny, 0, 0);
        }
      }
      for (const b of B) { const v = Math.hypot(b.vx, b.vy); if (v > PH.maxV) { b.vx *= PH.maxV / v; b.vy *= PH.maxV / v; } }
    }
    // safety: anything squeezed out of the cup is dropped back in
    const R = this.spawnRect;
    for (const b of B) if (b.y < -1 || b.y > 12 || b.x < -6 || b.x > 6.5 || !isFinite(b.x) || !isFinite(b.y)) { b.x = E.rand(R[0], R[1]); b.y = E.rand(R[2], R[3]); b.vx = b.vy = b.w = 0; }
  }
  showTutorial() {
    if ((G.data().user.ScoopPlayTime || 0) > 0) return;
    const P = this.refs('_waypoints').map(goOf).filter(Boolean).map((g) => g.worldPos());
    if (!P.length || !this.hand) return;
    this.hand.setActive(true); if (this.loopGo) this.loopGo.setActive(true);
    this.hand.setWorldPos(P[0][0], P[0][1]);
    E.killOwner(this.tutKey);
    const sp = this.d._moveSpeed || 3; let k = 1;
    const next = () => {
      if (k >= P.length) { this.hand.setWorldPos(P[0][0], P[0][1]); k = 1; } // SetLoops(-1) Restart
      const a = P[k - 1], b = P[k]; k++;
      E.tween({ dur: Math.hypot(b[0] - a[0], b[1] - a[1]) / sp, ease: E.ease.linear, owner: this.tutKey, update: (v) => this.hand.setWorldPos(a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v), done: next });
    };
    next();
  }
  hideTutorial() { E.killOwner(this.tutKey); if (this.hand) this.hand.setActive(false); if (this.loopGo) this.loopGo.setActive(false); }
}
S['ScoopGame.BowlController'] = BowlController;

class ScoopStarItem extends E.Behaviour {
  get Visual() { const s = this.ref('_srVisual'); return s ? s.sp : null; }
  setVisual(sp) { const s = this.ref('_srVisual'); if (s) s.sp = sp; }
}
S.ScoopStarItem = ScoopStarItem;
class YellowBall extends E.Behaviour {}
S['ScoopGame.YellowBall'] = YellowBall;

// ================================================================== Spoon
class Spoon extends E.Behaviour {
  prep() { if (this._p) return; this._p = 1; this.front = this.go.find('VisualFront'); this.scoopedList = this.refs('_scoopedList').filter(Boolean); }
  awake() { this.prep(); if (this.front) this.front.setActive(false); }
  releaseScoop() { this.prep(); if (this.front) this.front.setActive(false); E.killOwner(this.go); rotToShort(this.go, 65, 0.3); }
  scoopUp() { rotToShort(this.go, 15, 0.3); }
  setResult(list) {
    this.prep();
    for (const sr of this.scoopedList) sr.go.setActive(false);
    for (let i = 0; i < list.length && i < this.scoopedList.length; i++) {
      const sr = this.scoopedList[i]; sr.sp = list[i]; sr.go.setActive(true);
      E.killOwner(sr.go); sr.go.sx = sr.go.sy = 0; scaleTo(sr.go, 1, 0.1);
    }
    if (this.front) this.front.setActive(true);
  }
}
S['ScoopGame.Spoon'] = Spoon;

// ================================================================== SpoonDragController
class SpoonDragController extends E.Behaviour {
  awake() { this._dragTimer = 0; this._isScoopDone = false; this._isScooping = false; this._resultStars = []; this._targetPos = null; this._still = 0; }
  init(c) {
    this.ctrl = c; this.spoon = this.ref('_spoon');
    this.center = wpos(this.ref('_tfCenter')); this.rx = this.d._radiusX || 2.3; this.ry = this.d._radiusY || 2.2;
    this.dur = this.d._dragDuration || 3;
  }
  setupResult(list) { this._resultStars = list.slice(); }
  onEnable() { if (this.l) E.input.off(this.l); this.l = E.input.on((t, ev) => this.onInput(t, ev)); }
  onDisable() { if (this.l) E.input.off(this.l); this.l = null; this.setLoop(false, true); }
  onDestroy() { this.setLoop(false, true); }
  pw() { return E.screenToWorld(E.input.x, E.input.y); }
  clampToEllipse(x, y) {
    const dx = x - this.center[0], dy = y - this.center[1]; const k = (dx * dx) / (this.rx * this.rx) + (dy * dy) / (this.ry * this.ry);
    if (k > 1) { const s = Math.sqrt(k); return [this.center[0] + dx / s, this.center[1] + dy / s]; }
    return [x, y];
  }
  onInput(t, ev) {
    if (!this.ctrl || !screen) return;
    if (t === 'down') {
      if (E.uiRaycast(ev.x, ev.y) || this._isScoopDone || !this.spoon.go.activeInHierarchy) return;
      this.ctrl.hideScoopTutorial();
      this.spoon.releaseScoop();
      this._isScooping = true; screen.setBtnDecorInteractable(false);
      const sp = this.spoon.go.worldPos(), w = this.pw();
      this._dragOffset = [sp[0] - w[0], sp[1] - w[1]]; this._last = w;
      this._targetPos = this.clampToEllipse(sp[0], sp[1]);
    } else if (t === 'up') {
      if (this._isScoopDone || !this._isScooping) return;
      this.setLoop(false, true); this._isScooping = false; screen.setBtnDecorInteractable(true);
    }
  }
  // sc_scoop loop at volume 1 while moving / 0 while still (no gain control in the engine: stop after 0.15 s of no movement)
  setLoop(on, now) {
    if (on) { this._still = 0; if (!this._snd && soundOn()) this._snd = E.playSound(10, { loop: true }); return; }
    if (!now) { this._still += E.dt; if (this._still < 0.15) return; }
    if (this._snd) { this._snd.stop(); this._snd = null; }
  }
  update(dt) {
    if (!this.ctrl || !this._isScooping) return;
    const w = this.pw();
    this._targetPos = this.clampToEllipse(w[0] + this._dragOffset[0], w[1] + this._dragOffset[1]);
    this.checkDragDuration(dt, w);
  }
  checkDragDuration(dt, w) {
    if (this._isScoopDone) return;
    const moved = Math.hypot(w[0] - this._last[0], w[1] - this._last[1]); this._last = w;
    if (moved < 0.01) { this.setLoop(false); return; }
    this.setLoop(true);
    this._dragTimer += dt;
    const img = screen.procImg;
    if (img) { E.killOwner(img); const target = Math.min(1, this._dragTimer / this.dur); tweenVal(() => img.fa || 0, (x) => { img.fa = x; }, target, 0.2, { owner: img }); }
    if (this._dragTimer >= this.dur) this.scoopDone();
  }
  scoopDone() {
    this.setLoop(false, true);
    this._isScoopDone = true; this._isScooping = false;
    const sg = this.spoon.go;
    E.killOwner(sg);
    this.spoon.setResult(this._resultStars);
    if (screen.proc) screen.proc.setActive(false);
    this.ctrl.doneOneScoop(); screen.updateScoopStatus(); this.spoon.scoopUp();
    moveW(sg, 2, 8, 0.5, { done: () => {
      vib();
      screen.showPreviewAnimWithStars(this.spoon.scoopedList, () => {}, () => this.afterPreview());
    } });
  }
  afterPreview() {
    if (this.ctrl._currentScoop === this.ctrl._maxScoop) { this.setLoop(false, true); this.ctrl.goToStepBlindBox(); return; }
    this._dragTimer = 0; this._isScoopDone = this._isScooping = false;
    this.ctrl.setupScoopResult(); screen.setBtnDecorInteractable(true);
  }
}
S['ScoopGame.SpoonDragController'] = SpoonDragController;

// ================================================================== ScreenInGame
class ScreenInGame extends E.ScreenBase {
  onInit() {
    this.cs = goOf(this.ref('_contentScoop')); this.cu = goOf(this.ref('_contentUnbox')); this.csb = goOf(this.ref('_contentSelectBox')); this.csort = goOf(this.ref('_contentSort'));
    this.block = this.go.find('BlockScreen'); // _goBlockScreen (not exported)
    this.proc = this.cs ? this.cs.find('Process') : null; // _goScoopProcess (not exported)
    this.procImg = this.ref('_imgScoopProcess');
    this.addBtn = btnOf(this.ref('_addScoopButton')); this.decorBtn = btnOf(this.ref('_decorButton'));
    this.txtScoop = E.txtOf(this.ref('_txtScoopAmount'));
    this.preview = this.ref('_previewListStar'); this.panel = this.ref('_scoopPanel');
    this.fly = this.ref('_charmFlyToBasket'); this.selectBox = this.ref('_selectBox'); this.selectCard = this.ref('_selectCard');
    this.chat = goOf(this.ref('_contentChat')); this.comments = this.ref('_commentHandler'); this.emoji = goOf(this.ref('_fxEmoji'));
    if (this.panel) this.panel.onInit(this);
    if (this.proc) this.proc.setActive(false); if (this.block) this.block.setActive(false);
    G.onClick(this.ref('_closeButton'), () => { G.click(); E.ui.showPopup('Clicker.BackHomePopup'); });
    G.onClick(this.addBtn, () => this.addMoreScoop());
    G.onClick(this.decorBtn, () => this.onBtnDecorClick());
    this.selectBox.init(this); this.selectBox.spawnBox();
    this.selectCard.init(this); this.selectCard.spawnCard();
    const cg = this.selectCard.ref('_canvasGroup'); if (cg) { E.killOwner(cg); cg.alpha = 0; }
    this.showButtonAddScoop(false); // hidden until the first scoop (inferred)
  }
  onShow() {
    const ci = goOf(this.ref('_chatInput')); if (ci) ci.setActive(true);
    if (this.comments && 'IsEnableToSpawnComment' in this.comments) this.comments.IsEnableToSpawnComment = true;
    if (this.emoji) E.psPlay(this.emoji);
    this.showContentScoop();
  }
  registerScoopGame(c) { this.ctrl = c; }
  setBtnDecorInteractable(b) { if (this.decorBtn) this.decorBtn.interactable = b; }
  showProcessBar(show) {
    if (!this.proc) return;
    if (show) { if (!this.proc.activeSelf) { if (this.procImg) { E.killOwner(this.procImg); this.procImg.fa = 0; } this.proc.setActive(true); } }
    else this.proc.setActive(false);
  }
  updateScoopProcess(v) { const img = this.procImg; if (img) { E.killOwner(img); tweenVal(() => img.fa || 0, (x) => { img.fa = x; }, v, 0.2, { owner: img }); } }
  updateScoopStatus() { if (this.txtScoop) this.txtScoop.text = `${this.ctrl._currentScoop}/${this.ctrl._maxScoop}`; }
  showButtonAddScoop(b) { const g = goOf(this.addBtn); if (g) g.setActive(b); }
  addMoreScoop() { // rewarded ad "add_scoop" -> treated as success
    G.click();
    this.showButtonAddScoop(false); this.ctrl.addMoreScoop(); this.updateScoopStatus();
  }
  onBtnDecorClick() {
    G.click();
    this.panel.onShow();
    this.panel.registerCloseAction(() => this.showStepScoopButton(true, 0.5));
    this.showStepScoopButton(false, 0.5);
  }
  showStepScoopButton(show, dur) {
    const A = show ? E.ease.outBack : E.ease.inBack, Rv = show ? E.ease.inBack : E.ease.outBack;
    const mv = (k, i, a, b, ease) => { const g = goOf(this.ref(k)); if (!g || !g.rt) return; E.killOwner(g.rt); rtTo(g, i, show ? a : b, dur, { ease }); };
    mv('_rectBtnHome', 4, 140, -150, A);
    mv('_rectScoopTime', 5, -455, -1200, A);
    mv('_rectAddScoop', 5, -615, -1300, A);
    mv('_rectBtnDecor', 4, 0, 300, E.ease.linear);
    mv('_rectChat', 4, 5, -700, A);
    mv('_rectInputChat', 4, 5, -700, A);
    mv('_rtMoney', 4, 225, -170, Rv);
    const cam = this.ref('_mainCamera'); const cg = cam && cam.go;
    if (cg) { E.killOwner(this.camKey || (this.camKey = {})); tweenVal(() => cg.y, (y) => { cg.y = y; }, show ? 0 : -5, dur, { owner: this.camKey, ease: E.ease.outQuad }); }
  }
  showPreviewAnimWithStars(srs, onFly, onDone) {
    this.setBtnDecorInteractable(false);
    this.preview.showPreviewAnim(srs, onFly, () => { if (onDone) onDone(); });
  }
  setContents(scoop, unbox, sel, sort) { if (this.cs) this.cs.setActive(scoop); if (this.cu) this.cu.setActive(unbox); if (this.csb) this.csb.setActive(sel); if (this.csort) this.csort.setActive(sort); }
  showContentScoop() { this.setContents(true, false, false, false); }
  showContentUnbox() { this.setContents(false, true, false, false); this.showChatContent(true); }
  showContentSelectBox() { this.setContents(false, false, true, false); this.showChatContent(false); this.moneyShowUp(); }
  showContentSort() { this.moneyBack(); this.setContents(false, false, false, false); this.showChatContent(true); }
  showContentSortPart2() {
    this.moneyShowUp();
    if (this.csort) this.csort.setActive(true);
    const cg = this.selectCard.ref('_canvasGroup'); if (cg) { E.killOwner(cg); alphaTo(cg, 1, 0.5); }
    this.showChatContent(false);
    this.selectCard.showCardOnPosition(true);
  }
  // MoneyManager.ShowUp/BackToParent; the counter is parked off-screen (x 225) during the scoop step, so bring it to x -170 (approximation)
  moneyShowUp() { const mm = G.moneyMgr; if (!mm) return; mm.showUp(); if (mm.go.rt) { E.killOwner(mm.go.rt); rtTo(mm.go, 4, -170, 0.3); } }
  moneyBack() { const mm = G.moneyMgr; if (mm) mm.backToParent(); }
  showChatContent(show) {
    if (this.chat) this.chat.setActive(show);
    if (this.emoji) { this.emoji.setActive(show); if (show) E.psPlay(this.emoji); else E.psStop(this.emoji); }
  }
  showCharmFlyToBasket(sprite, isLuck, onDone) {
    if (isLuck) this.ctrl.addMoreBlindBox();
    this.fly.showNewCharm(sprite, isLuck, () => {
      if (onDone) onDone();
      this.ctrl.put.spawnCharm(sprite);
      E.after(0.1, () => {
        if (!this.ctrl.plate.doneUnbox || this._unboxDone) return;
        this._unboxDone = true;
        this.ctrl.plate.hideTrayResult();
        E.after(0.5, () => {
          const go = () => { this.showContentSelectBox(); this.ctrl.gotoStepSelectBox(); };
          if (G.transition && G.transition.transition) G.transition.transition(go); else go();
        }, this);
      }, this);
    });
  }
  onSelectGiftBoxDone(d) {
    this.showContentSort();
    this.ctrl.onSelectGiftBox(d.SpriteFull); this.ctrl.gotoStepSort();
    this.ctrl.put.setBoxVisual(d);
    this.ctrl._boxPrice = d.UnlockType === 2 ? d.Price : 100;
  }
  onSelectCard(card) { this.ctrl.put.setCardVisual(card); }
  onSelectCardDone(card) {
    this.moneyBack();
    if (this.csort) this.csort.setActive(false);
    this.ctrl.onDoneSelectCardStep();
    this.ctrl._cardPrice = card.UnlockType === 2 ? card.Price : 100;
    if (this.emoji) { E.psStop(this.emoji); this.emoji.setActive(false); }
  }
  onSetupGiftBoxDone() { this.ctrl.gotoDelivery(); }
}
S['ScoopGame.ScreenInGame'] = ScreenInGame;

// ================================================================== PreviewListStar ("You've got N charms")
class PreviewListStar extends E.Behaviour {
  prep() {
    if (this._p) return; this._p = 1;
    this.cg = this.ref('_cvGroup'); this.content = goOf(this.ref('_tfContent')); this.pos = this.refs('_previewPos').map(goOf);
    this.imgs = this.refs('_previewImages'); this.txt = E.txtOf(this.ref('_txtMessage')); this.key = {};
  }
  awake() { this.prep(); if (this.cg) { this.cg.alpha = 0; this.cg.br = false; } if (this.content) this.content.sx = this.content.sy = 0; }
  showPreviewAnim(srs, onHalf, onDone) {
    this.prep();
    E.killOwner(this.key);
    G.sound(13);
    const n = srs.filter((s) => s.go.activeSelf).length;
    if (this.txt) this.txt.text = "You've got $ charms".replace('$', String(n));
    srs.forEach((sr, i) => {
      const img = this.imgs[i], pg = this.pos[i]; if (!img || !pg) return;
      const ig = img.go, act = sr.go.activeSelf;
      ig.setActive(act); pg.setActive(act);
      E.killOwner(ig); E.killOwner(ig.rt); ig.sx = ig.sy = 0;
      const par = ig.parent;
      if (par && par.wm) { const w = sr.go.worldPos(); const s = E.worldToScreen(w[0], w[1]); const l = toLocalUI(par, s[0], s[1]); ig.rt[4] = l[0]; ig.rt[5] = l[1]; }
      img.sp = sr.sp;
      E.after(0.02, () => {
        scaleTo(ig, 1, 0.3, { delay: i * 0.05, onStart: () => sr.go.setActive(false) });
        let tgt = [ig.rt[4], ig.rt[5]];
        if (pg.wm && par && par.wm) tgt = toLocalUI(par, pg.wm[4], pg.wm[5]);
        rtTo(ig, 4, tgt[0], 0.5, { delay: i * 0.05 });
        tweenVal(() => ig.rt[5], (y) => { ig.rt[5] = y; }, tgt[1], 0.5, { delay: i * 0.05, owner: ig.rt, done: () => scaleTo(ig, 0, 0.5, { ease: E.ease.inBack, delay: 2.0, done: () => ig.setActive(false) }) });
      }, this.key);
    });
    const cg = this.cg, ct = this.content, K = { owner: this.key };
    if (cg) { cg.br = true; alphaTo(cg, 1, 0.3, K); }
    if (ct) {
      scaleTo(ct, 1, 0.5, Object.assign({ delay: 0.3, ease: E.ease.outBack }, K));
      scaleTo(ct, 0, 0.5, Object.assign({ delay: 2.3, ease: E.ease.inBack }, K));
    }
    E.after(1.3, () => { if (onHalf) onHalf(); }, this.key);
    if (cg) alphaTo(cg, 0, 0.5, Object.assign({ delay: 2.55 }, K));
    E.after(3.05, () => { if (cg) cg.br = false; if (onDone) onDone(); }, this.key);
  }
}
S.PreviewListStar = PreviewListStar;

// ================================================================== Decor panel (ScoopPanel / CategoryPanel / OptionPanel)
class ScoopPanel extends E.Behaviour {
  onInit(scr) {
    this.screen = scr; this.cg = this.ref('_canvasGroup'); this.panel = goOf(this.ref('_panel'));
    this.categoryPanel = this.ref('_categoryPanel'); this.optionPanel = this.ref('_optionPanel');
    this.categoryPanel.onInit(this); this.optionPanel.onInit(this);
    // _btnClose2 and _closeButton are the same button: wired once
    G.onClick(this.ref('_btnClose'), () => this.onButtonCloseClicked());
    G.onClick(this.ref('_btnClose2'), () => this.onButtonCloseClicked());
    this.initY = this.panel.rt[5];
    this.hideY = this.initY - (this.panel.rt[7] + (this.d._yOffset || 200));
    this.panel.rt[5] = this.hideY;
    this.setCG(false); this.cg.ia = false;
  }
  setCG(on) { E.killOwner(this.cg); this.cg.alpha = on ? 1 : 0; this.cg.br = on; }
  onShow() {
    this.cg.ia = false; this.setCG(true);
    E.killOwner(this.panel.rt); rtTo(this.panel, 5, this.initY, 0.36, { done: () => { this.cg.ia = true; } });
    this.categoryPanel.selectDefaultCategory();
  }
  onHide() {
    this.cg.ia = false;
    E.killOwner(this.panel.rt); rtTo(this.panel, 5, this.hideY, 0.36, { done: () => this.setCG(false) });
    this.categoryPanel.onHideDecorPanel();
  }
  onButtonCloseClicked() { G.click(); this.onHide(); if (this._onClose) this._onClose(); }
  registerCloseAction(a) { this._onClose = a; return this; }
  get OptionPanel() { return this.optionPanel; }
}
S['ScoopGame.ScoopPanel'] = ScoopPanel;

class CategoryPanel extends E.Behaviour {
  onInit(panel) {
    this.panel = panel; this.setup();
    if (!this.l) { this.l = (c, i) => this.onOptionSelected(c, i); optionEv.add(this.l); }
    this.bowlGo = rootNamed('Bowl'); this.bagGo = rootNamed('PreviewBag'); // _goBowl / _goBagPreview (inferred)
  }
  onDestroy() { if (this.l) optionEv.delete(this.l); }
  setup() {
    this.items = [];
    const content = goOf(this.ref('_contentParent'));
    (visualAsset().CategoryAssets || []).forEach((k, i) => {
      const ca = E.so(k);
      const r = E.spawn(G.poolPrefab(POOL.ScoopCategoryItem), content); const g = goOf(r) || r; g.sx = g.sy = 1;
      const it = g.comp('ScoopGame.CategoryItem'); if (!it) return;
      it.onInit((x) => this.onCategoryItemClicked(x)); it.setIcon(ca.OnIcon, ca.OffIcon); it.index = i;
      this.items.push(it);
    });
  }
  selectDefaultCategory() { if (this.items[0]) this.selectedCategory(this.items[0]); }
  selectedCategory(it) {
    if (this.sel) this.sel.setSelected(false);
    this.sel = it; it.setSelected(true);
    const idx = this.items.indexOf(it);
    this.panel.optionPanel.setup(idx).selectedOptionItemByIndex(DSV.getSelected(idx));
  }
  onCategoryItemClicked(it) {
    G.click(); vib();
    it.startClickEffect();
    this.selectedCategory(it);
    if (this.bowlGo) this.bowlGo.setActive(it.index !== 2);
    if (this.bagGo) this.bagGo.setActive(it.index === 2);
  }
  onOptionSelected(cat, id) {
    if (cat !== 2) return;
    this._blindBagSkinId = id;
    const opt = optById(this.ref('_blindBagCategoryAsset') || catAsset(2), id); if (!opt) return;
    this.refs('_previewBagList').forEach((sr, i) => {
      if (!sr) return; sr.sp = opt.Icon; const g = sr.go; E.killOwner(g);
      scaleTo(g, 0.9, 0.1, { delay: i * 0.1, done: () => scaleTo(g, 0.8, 0.2) });
    });
  }
  getBlindbagVisual() { return optById(this.ref('_blindBagCategoryAsset') || catAsset(2), this._blindBagSkinId); }
  onHideDecorPanel() { if (this.bowlGo) this.bowlGo.setActive(true); if (this.bagGo) this.bagGo.setActive(false); }
}
S['ScoopGame.CategoryPanel'] = CategoryPanel;

class CategoryItem extends E.Behaviour {
  icon() { return this.ref('_icon'); }
  get Index() { return this.index; }
  setIndex(i) { this.index = i; }
  onInit(cb) { G.onClick(this.ref('_button'), () => cb(this)); this.setSelected(false); }
  setIcon(on, off) { this.onSp = on; this.offSp = off; const ic = this.icon(); if (ic) ic.sp = off; }
  setSelected(b) { const s = goOf(this.ref('_selected')); if (s) s.setActive(b); const ic = this.icon(); if (ic) ic.sp = b ? this.onSp : this.offSp; }
  setActiveNotification(b) { const n = goOf(this.ref('_iconNoti')); if (n) n.setActive(b); }
  startClickEffect() { const ic = this.icon(); const g = ic && ic.go; if (!g) return; E.killOwner(g); g.sx = g.sy = 1; E.punchScale(g, 0.1, 0.2); }
}
S['ScoopGame.CategoryItem'] = CategoryItem;

class OptionPanel extends E.Behaviour {
  ensureL() { if (!this.l) this.l = () => this.refresh(); return this.l; }
  onInit(panel) { this.decorPanel = panel; this.items = this.items || []; const l = this.ensureL(); if (this.go.activeInHierarchy) G.moneyListeners.add(l); }
  onEnable() { const l = this.ensureL(); G.moneyListeners.delete(l); G.moneyListeners.add(l); }
  onDisable() { if (this.l) G.moneyListeners.delete(this.l); }
  onDestroy() { if (this.l) G.moneyListeners.delete(this.l); }
  setup(cat) {
    this.items = this.items || [];
    this.catIdx = cat; this.ca = catAsset(cat);
    this.adjustOptionItemSize();
    const money = G.money();
    this.items.forEach((it, i) => {
      const opt = this.ca.OptionDatas[i];
      const unlocked = DSV.has(cat, opt.ID);
      const coinReady = !(money < opt.Price || unlocked) && opt.UnlockType === 2;
      it.onInit((x) => this.onOptionItemClicked(x), (x) => this.onOptionItemBuyClicked(x));
      it.setIcon(opt.Icon); it.id = opt.ID; it.setPrice(opt.Price); it.setUnlockType(opt.UnlockType);
      it.setInteractableBtnSelected(unlocked || coinReady || opt.UnlockType === 1);
      it.setActiveStatus(unlocked); it.setActiveBuyButton(!unlocked); it.setInteractableBtnBuy(true);
      it.setActiveNotification(coinReady);
    });
    return this;
  }
  adjustOptionItemSize() {
    const need = this.ca.OptionDatas.length; const content = goOf(this.ref('_contentParent'));
    while (this.items.length < need) {
      const r = E.spawn(G.poolPrefab(POOL.ScoopOptionItem), content); const g = goOf(r) || r; g.sx = g.sy = 1;
      this.items.push(g.comp('ScoopGame.OptionItem'));
    }
    while (this.items.length > need) { const it = this.items.pop(); if (this.sel === it) this.sel = null; E.destroy(it.go); }
  }
  selectedOptionItemByIndex(i) { if (i >= 0 && i < this.items.length) this.selectedOptionItem(this.items[i]); }
  selectedOptionItem(it) {
    if (this.sel) this.sel.setSelected(false);
    this.sel = it; it.setSelected(true);
    DSV.setSelected(this.catIdx, it.id);
    fireOption(this.catIdx, it.id);
  }
  onOptionItemClicked(it) { G.click(); vib(); this.handleClickOptionItem(it); }
  handleClickOptionItem(it) {
    it.startClickEffect();
    if (DSV.has(this.catIdx, it.id)) this.selectedOptionItem(it); else this.onOptionItemBuyClicked(it);
  }
  onOptionItemBuyClicked(it) {
    G.click(); vib();
    const opt = optById(this.ca, it.id); if (!opt) return;
    if (opt.UnlockType === 1) { this.unlockOptionItem(it); return; } // rewarded ad "unlock_scoop_decor" -> success
    if (opt.UnlockType === 5) return;
    if (opt.Price > G.money()) { it.startClickEffect(); G.notEnough(); return; }
    G.sound(47); G.addMoney(-opt.Price);
    this.unlockOptionItem(it);
  }
  unlockOptionItem(it) {
    if (!it) return;
    DSV.unlock(this.catIdx, it.id);
    it.setInteractableBtnSelected(true); it.setActiveStatus(true); it.setActiveBuyButton(false); it.setActiveNotification(false);
    this.selectedOptionItem(it);
  }
  refresh() {
    if (!this.ca || !this.items) return; const money = G.money();
    for (const it of this.items) {
      if (DSV.has(this.catIdx, it.id)) continue;
      const opt = optById(this.ca, it.id); if (!opt) continue;
      const ok = money >= opt.Price && opt.UnlockType === 2;
      it.setActiveNotification(ok); it.setInteractableBtnSelected(ok);
    }
  }
  updateDefaultOption() {}
}
S['ScoopGame.OptionPanel'] = OptionPanel;

class OptionItem extends E.Behaviour {
  bSel() { return btnOf(this.ref('_btnSelected')); }
  bBuy() { return btnOf(this.ref('_btnBuy')); }
  vis(k, b) { const g = goOf(this.ref(k)); if (g) g.setActive(b); }
  onInit(onSel, onBuy) {
    const a = this.bSel(), b = this.bBuy();
    if (a) { a.onClick.length = 0; a.onClick.push(() => onSel(this)); }
    if (b) { b.onClick.length = 0; b.onClick.push(() => onBuy(this)); }
    this.setSelected(false);
  }
  setSelected(b) {
    this.vis('_selected', b); this.vis('_checkOptional', b);
    const t = E.txtOf(this.ref('_txtStatus')); if (t) { t.text = b ? 'Equipped' : 'Owned'; t.color = b ? [0, 0, 1, 1] : [0, 0, 0, 1]; }
  }
  setIcon(sp) { const i = this.ref('_icon'); if (i) i.sp = sp; }
  setID(id) { this.id = id; } getID() { return this.id; }
  setPrice(p) { const t = E.txtOf(this.ref('_txtPrice')); if (t) t.text = String(p); }
  setUnlockType(t) { this.vis('_optionByMoney', t === 2); this.vis('_optionByAds', t === 1); this.vis('_optionByIAP', t === 5); }
  setActiveStatus(b) { const t = E.txtOf(this.ref('_txtStatus')); if (t && t.go) t.go.setActive(b); }
  setActiveBuyButton(b) { const bb = this.bBuy(); if (bb) bb.go.setActive(b); }
  setInteractableBtnSelected(b) { const a = this.bSel(); if (a) a.interactable = b; }
  setInteractableBtnBuy(b) { const a = this.bBuy(); if (a) a.interactable = b; }
  setActiveNotification(b) { this.vis('_iconNoti', b); }
  startClickEffect() { const p = goOf(this.ref('_panel')); if (!p) return; E.killOwner(p); p.sx = p.sy = 1; E.punchScale(p, 0.1, 0.2); }
}
S['ScoopGame.OptionItem'] = OptionItem;

// ================================================================== Unbox: BlindBoxPlate / BlindBox / CharmFlyToBasket / ComplimentItem
class BlindBoxPlate extends E.Behaviour {
  prep() { if (this._p) return; this._p = 1; if (!this.spawned) this.spawned = []; if (this.hold == null) this.hold = 0; if (this.skin == null) this.skin = 'defaults'; }
  awake() { this.prep(); }
  get RareCharmCount() { this.prep(); return this.spawned.filter((b) => b._isLuck).length; }
  get doneUnbox() { this.prep(); return this.spawned.filter((b) => !b._openDone).length === 0; }
  tmpl() { return this.ref('_blindBoxItem'); }
  setBlindBoxVisual(skin) { this.prep(); this.skin = skin; const t = this.tmpl(); if (t && t.setVisual) t.setVisual(skin); }
  clearPlate() { this.prep(); for (const b of this.spawned) E.destroy(b.go); this.spawned = []; this.hold = 0; }
  randIn(trK, blK) { const tr = wpos(this.ref(trK)), bl = wpos(this.ref(blK)); return [E.rand(bl[0], tr[0]), E.rand(bl[1], tr[1])]; }
  makeBox(id, sprite) {
    const t = this.tmpl(); const holder = goOf(this.ref('_tfHolder'));
    const g = E.instantiate(t.go, holder);
    const box = g.comp('ScoopGame.BlindBox');
    box.setVisual(this.skin); box.setCharm(id, sprite); box.disableBagClick();
    box._tfPlate = goOf(this.ref('_tfPlateResult')); box._onPlatePos = this.randIn('_tfTopRightPlate', '_tfBottomLeftPlate'); box._blindBoxPlate = this;
    g.name = 'BlindBox_' + g.siblingIndex;
    return box;
  }
  spawnBlindBox(id, sprite) {
    this.prep();
    const n = this.spawned.length; const p = this.randIn('_tfTopRight', '_tfBottomLeft');
    const box = this.makeBox(id, sprite);
    box.go.setWorldPos(p[0], p[1]); box.go.z = n * 0.1; box.go.rot = E.rand(0, 360);
    this.spawned.push(box); this.hold++;
  }
  popOutBlindBox() {
    this.prep();
    const c = this.ref('_collider'); if (c) c.enabled = true;
    E.after(0.1, () => { for (let i = 0; i < this.spawned.length; i++) E.after(i * 0.1, () => this.checkPopOutBlindBox(), this); }, this);
  }
  onPointerDown(ev) { if (ev && E.uiRaycast(ev.x, ev.y)) return; this.checkPopOutBlindBox(); }
  checkPopOutBlindBox() {
    this.prep();
    if (this.hold < 1) return;
    G.sound(16); vib();
    const tgt = this.randIn('_tfTopRightOpen', '_tfBottomLeftOpen');
    const pl = goOf(this.ref('_tfPlate'));
    if (pl) { E.killOwner(pl); pl.sx = pl.sy = 1; yoyoScale(pl, 0, 1.1, 0.05); yoyoScale(pl, 1, 1.1, 0.05, { delay: 0.05 }); }
    const box = this.spawned[this.hold - 1];
    jumpW(box.go, tgt[0], tgt[1], 3, 0.5, { delay: 0.15, done: () => { vib(); box.enableClick(); } });
    this.hold--;
    if (this.hold === 0) {
      const c = this.ref('_collider'); if (c) c.enabled = false;
      if (pl) scaleTo(pl, 0, 0.5, { ease: E.ease.inBack });
    }
  }
  addMoreRandomBox(id, sprite) {
    this.prep();
    const tgt = this.randIn('_tfTopRightOpen', '_tfBottomLeftOpen'); const n = this.spawned.length;
    const tp = this.tmpl().go.worldPos();
    const box = this.makeBox(id, sprite);
    box.go.setWorldPos(tp[0], tp[1]); box.go.rot = E.rand(0, 360); box.go.z = n * 0.1;
    this.spawned.push(box);
    jumpW(box.go, tgt[0], tgt[1], 3, 1.0, { done: () => { vib(); box.enableClick(); } });
  }
  spawnCompliment() {
    const p = this.randIn('_tfComplimentTopRight', '_tfComplimentBottomLeft');
    const r = E.randInt(0, 4);
    spawnCompliment(this.d._complimentSprites[r], p[0], p[1]);
    G.sound(this.d._complimentSoundEnum[r]);
  }
  hideTrayResult() {
    const pr = goOf(this.ref('_tfPlateResult')); if (!pr) return;
    tweenVal(() => pr.y, (y) => { pr.y = y; }, -20, 0.8, { delay: 0.3, ease: E.ease.inBack, owner: pr });
  }
}
S['ScoopGame.BlindBoxPlate'] = BlindBoxPlate;

class BlindBox extends E.Behaviour {
  prep() {
    if (this._p) return; this._p = 1;
    this.srCharm = this.ref('_srCharm'); this.tfCharm = goOf(this.ref('_tfCharm')); this.col = this.ref('_collider');
    this.sg = this.ref('_sortingGroup'); this.spine = this.ref('_bagSkeleton');
    this.luck = this.tfCharm ? this.tfCharm.find('lucky') : null; // _goLuck (inferred: charm/lucky)
    if (this._openDone == null) this._openDone = false; if (this._isLuck == null) this._isLuck = false;
  }
  awake() { this.prep(); }
  get IsLuck() { return this._isLuck; }
  get OpenDone() { return this._openDone; }
  init(plate) { this._blindBoxPlate = plate; }
  setVisual(skin) {
    this.prep(); const sp = this.spine; if (!sp) return;
    E.spineSkin(sp, skin);
    E.spinePlay(sp, 'animation', true);
  }
  setCharm(id, sprite) { this.prep(); this._dataId = id; if (this.srCharm) this.srCharm.sp = sprite; this._isLuck = false; if (this.luck) this.luck.setActive(false); }
  enableClick() { this.prep(); if (this.col) this.col.enabled = true; }
  disableBagClick() { this.prep(); if (this.col) this.col.enabled = false; }
  setDestination(tf, pos) { this._tfPlate = tf; this._onPlatePos = pos; }
  onPointerDown(ev) {
    this.prep();
    if (ev && E.uiRaycast(ev.x, ev.y)) return;
    if (!this.col || !this.col.enabled) return;
    this.checkPairAndRegisterData();
    this.disableBagClick();
    this.animOpen(() => {});
  }
  checkPairAndRegisterData() {
    if (H().thisItemMakePair(this._dataId)) { this._isLuck = true; if (this.luck) this.luck.setActive(true); }
    H().registerItem(this._dataId);
  }
  animOpen(onComplete) {
    G.sound(16); G.sound(18); vib();
    if (this.sg) this.sg.o = (this.sg.o || 0) + 3;
    if (this.spine) E.spinePlay(this.spine, 'bag_open', false);
    E.after(0.4, () => {
      if (this._blindBoxPlate) this._blindBoxPlate.spawnCompliment();
      if (onComplete) onComplete();
      if (this.tfCharm) scaleTo(this.tfCharm, 0.8, 0.3, { ease: E.ease.linear, done: () => { if (this._isLuck) G.sound(19); this.showAtCenter(); } });
      else this.showAtCenter();
      this.animFade();
    }, this);
  }
  animFade() { const sp = this.spine; if (!sp || !sp.color) return; E.killOwner(sp); alphaTo(sp, 0, 0.5, { owner: sp }); }
  showAtCenter() {
    moveW(this.go, 0, 2, 0.5);
    rotToShort(this.go, 0, 0.5, { done: () => {
      if (this.luck) this.luck.setActive(false);
      screen.showCharmFlyToBasket(this.srCharm.sp, this._isLuck, () => this.moveToTray());
    } });
  }
  moveToTray() {
    if (!this._tfPlate) return;
    if (this.sg) this.sg.o -= 3;
    this.go.setParent(this._tfPlate, true);
    E.killOwner(this.go);
    scaleTo(this.go, 0.45, 0.5);
    const p = this._onPlatePos;
    jumpW(this.go, p[0], p[1], 1, 0.5, { onStart: () => { this._openDone = true; } });
    this._openDone = true;
  }
}
S['ScoopGame.BlindBox'] = BlindBox;

class CharmFlyToBasket extends E.Behaviour {
  prep() {
    if (this._p) return; this._p = 1;
    this.imgLucky = this.ref('_imgLucky'); this.bg = this.ref('_spriteBG'); this.content = goOf(this.ref('_tfContent')); this.c2d = goOf(this.ref('_tfContent2D'));
    this._animatingTime = 0;
  }
  awake() { this.prep(); }
  showNewCharm(sprite, isLuck, onDone) {
    this.prep();
    const lg = this.imgLucky && this.imgLucky.go;
    if (isLuck) {
      G.sound(24);
      if (lg) { E.killOwner(lg.rt); lg.rt[5] = 170; lg.setActive(true); rtTo(lg, 5, 500, 0.3); }
      this._animatingTime = E.time + 2;
      if (this.bg) { E.killOwner(this.bg); alphaTo(this.bg, 0.95, 0.3); }
      if (this.content) { E.killOwner(this.content); scaleTo(this.content, 1, 0.5, { ease: E.ease.outBack }); }
      if (this.c2d) { E.killOwner(this.c2d); scaleTo(this.c2d, 1, 0.5, { ease: E.ease.outBack }); }
    }
    E.after(isLuck ? 2.5 : 1.0, () => { if (onDone) onDone(); }, this);
    E.after(isLuck ? 2.0 : 0.5, () => {
      if (lg) lg.setActive(false);
      if (E.time >= this._animatingTime - 1e-3) {
        if (this.bg) { E.killOwner(this.bg); alphaTo(this.bg, 0, 0.5); }
        if (this.content) { E.killOwner(this.content); scaleTo(this.content, 0, 0.3, { ease: E.ease.inBack }); }
        if (this.c2d) { E.killOwner(this.c2d); scaleTo(this.c2d, 0, 0.3, { ease: E.ease.inBack }); }
      }
    }, this);
  }
}
S['ScoopGame.CharmFlyToBasket'] = CharmFlyToBasket;

class ComplimentItem extends E.Behaviour {
  showEffect(sprite, x, y) {
    const main = this.ref('_srMainCompliment'); const subs = this.refs('_srSubEffect').filter(Boolean);
    if (main) { main.sp = sprite; E.killOwner(main); main.color[3] = 1; }
    for (const s of subs) { E.killOwner(s); s.color[3] = 1; }
    E.killOwner(this.go);
    this.go.setWorldPos(x, y); this.go.sx = this.go.sy = 0;
    scaleTo(this.go, 1, 0.5, { ease: E.ease.outBack, done: () => {
      for (const s of subs) alphaTo(s, 0, 0.9, { delay: 0.5 });
      if (main) alphaTo(main, 0, 1.0, { delay: 0.5, done: () => E.destroy(this.go) }); else E.destroy(this.go);
    } });
  }
}
S['ScoopGame.ComplimentItem'] = ComplimentItem;

// ================================================================== Select box / card carousels
class CarouselBase extends E.Behaviour {
  init(scr) {
    this.screen = scr;
    G.onClick(this.ref('_btnLeft'), () => { G.click(); this.shiftRight(); this.show(); });
    G.onClick(this.ref('_btnRight'), () => { G.click(); this.shiftLeft(); this.show(); });
    G.onClick(this.ref('_btnSelect'), () => { G.click(); this.proceed(this.list[2].data); });
    G.onClick(this.ref('_btnAdsUnlock'), () => this.onBtnAdUnlockClick());
    G.onClick(this.ref('_btnCoinUnlock'), () => this.onBtnCoinUnlockClick());
  }
  spawnList(assetKey, tmplKey, holderKey, cls) {
    const data = (this.ref(assetKey) || {}).DataList || [];
    const t = this.ref(tmplKey); const holder = goOf(this.ref(holderKey));
    this.list = this.list || [];
    while (this.list.length < data.length) { const g = E.instantiate(t.go, holder); this.list.push(g.comp(cls)); }
    data.forEach((d, i) => this.list[i].setData(d));
    this.shiftRight(); this.shiftRight();
  }
  shiftRight() { if (this.list.length >= 2) this.list.unshift(this.list.pop()); }
  shiftLeft() { if (this.list.length >= 2) this.list.push(this.list.shift()); }
  vis(k, b) { const g = goOf(this.ref(k)); if (g) g.setActive(b); }
  showOnPosition(cb) {
    this.vis('_btnSelect', false); this.vis('_btnAdsUnlock', false); this.vis('_btnCoinUnlock', false);
    const P = this.refs('_previewPositions').map(goOf);
    for (let i = 0; i < P.length && i < this.list.length; i++) {
      const g = this.list[i].go; E.killOwner(g); E.killOwner(g.rt);
      rtTo(g, 4, P[i].rt[4], 0.3);
      tweenVal(() => g.rt[5], (y) => { g.rt[5] = y; }, P[i].rt[5], 0.3, { owner: g.rt });
      scaleTo(g, P[i].sx, 0.3, { done: cb });
    }
    for (let i = P.length; i < this.list.length; i++) { const g = this.list[i].go; E.killOwner(g); E.killOwner(g.rt); g.sx = g.sy = 0; }
  }
  checkShowButton() {
    const d = this.list[2].data; const owned = G.data().user[this.ownedKey] || [];
    if (d.UnlockType === 0 || owned.includes(d.Id)) this.vis('_btnSelect', true);
    else if (d.UnlockType === 2) { const t = E.txtOf(this.ref('_txtCoinPrice')); if (t) t.text = String(d.Price); this.vis('_btnCoinUnlock', true); }
    else this.vis('_btnAdsUnlock', true);
  }
  addOwned(id) { const u = G.data().user; const a = u[this.ownedKey] || (u[this.ownedKey] = []); if (!a.includes(id)) a.push(id); G.save(); }
  onBtnCoinUnlockClick() {
    const d = this.list[2].data; G.click();
    if (G.money() < d.Price) { G.notEnough(); return; }
    this.addOwned(d.Id); G.sound(47); G.addMoney(-d.Price);
    this.proceed(d);
  }
  onBtnAdUnlockClick() { const d = this.list[2].data; G.click(); this.addOwned(d.Id); this.proceed(d); } // rewarded ad -> success
}
class SelectBox extends CarouselBase {
  get ownedKey() { return 'OwnedGiftBox'; }
  spawnBox() { this.spawnList('_giftBoxAsset', '_boxItem', '_tfBoxHolder', 'ScoopGame.BoxUIItem'); this.showBoxOnPosition(); }
  show() { this.showBoxOnPosition(); }
  showBoxOnPosition() {
    const tn = E.txtOf(this.ref('_txtBoxName'));
    if (tn && tn.go) tn.go.setActive(false);
    this.showOnPosition(() => { if (tn && tn.go) tn.go.setActive(true); this.checkShowButton(); });
    if (tn) tn.text = this.list[2].data.Name;
  }
  proceed(d) { this.screen.onSelectGiftBoxDone(d); }
}
S['ScoopGame.SelectBox'] = SelectBox;
class SelectCard extends CarouselBase {
  get ownedKey() { return 'OwnedCard'; }
  spawnCard() { this.spawnList('_giftCardAsset', '_cardItem', '_tfCardHolder', 'ScoopGame.CardUIItem'); this.showCardOnPosition(false); }
  show() { this.showCardOnPosition(true); }
  showCardFirstTime() { this.showCardOnPosition(true); }
  showCardOnPosition(showCard) {
    this.showOnPosition(() => this.checkShowButton());
    if (showCard) this.screen.onSelectCard(this.list[2].data);
  }
  proceed(d) { this.screen.onSelectCardDone(d); }
}
S['ScoopGame.SelectCard'] = SelectCard;
class BoxUIItem extends E.Behaviour {
  get Data() { return this.data; }
  setData(d) { this.data = d; const im = this.ref('_previewImage'); if (im) im.sp = d.SpriteFull; this.go.setActive(true); }
}
S['ScoopGame.BoxUIItem'] = BoxUIItem;
class CardUIItem extends E.Behaviour {
  get Data() { return this.data; }
  setData(d) { this.data = d; const im = this.ref('_previewImage'); if (im) im.sp = d.CardSprite; this.go.setActive(true); } // Card 6 has no sprite: white rect like Unity
}
S['ScoopGame.CardUIItem'] = CardUIItem;

// ================================================================== PutCharmToBox / CharmDrag
class PutCharmToBox extends E.Behaviour {
  prep() {
    if (this._p) return; this._p = 1;
    this.list = []; this.cur = null; this.status = 0; this.imported = null;
    this.srBox = this.ref('_srBox'); this.srFront = this.ref('_srBoxFront'); this.srLid = this.ref('_srLid'); this.srCard = this.ref('_srCard');
    this.tfBox = goOf(this.ref('_tfBox')); this.tfBoxHolder = goOf(this.ref('_tfBoxHolder')); this.tfCharmHolder = goOf(this.ref('_tfCharmDragHolder'));
    this.boxSG = this.ref('_boxSortingGroup'); this.tray = goOf(this.ref('_tfTrayBelow'));
    const bc = this.ref('_basePolygonCollider'); this.basePoly = bc ? { c: bc, g: bc.go } : null;
    this.colors = { wrong: this.d._wrongColor || [1, 0.647, 0.647, 1], right: this.d._rightColor || [0.647, 1, 0.647, 1], normal: this.d._normalColor || [1, 1, 1, 1] };
  }
  awake() { this.prep(); }
  init(c) { this.prep(); this._scoopGameController = c; setSG(this.boxSG, false); }
  get boxPolygon() { return this.imported || this.basePoly; }
  setBoxVisual(d) {
    this.prep();
    if (this.srBox) this.srBox.sp = d.SpriteBody; if (this.srFront) this.srFront.sp = d.SpriteBodyFront; if (this.srLid) this.srLid.sp = d.SpriteLid;
    if (this.imported) { E.destroy(this.imported.g); this.imported = null; }
    if (d.ColliderPrefab) {
      const parent = this.basePoly ? this.basePoly.g.parent : this.tfBox;
      const r = E.spawn(d.ColliderPrefab, parent); const g = goOf(r) || r;
      if (g && g.comp) { g.x = 0; g.y = 0; g.z = 0; const pc = g.comp('Poly'); if (pc) this.imported = { c: pc, g }; }
    }
  }
  setCardVisual(d) {
    this.prep(); const c = this.srCard; if (!c) return;
    c.sp = d.CardSprite;
    E.killOwner(c); E.killOwner(c.go);
    c.color[3] = 0; c.go.sx = c.go.sy = 1.3;
    alphaTo(c, 1, 0.2); scaleTo(c.go, 1, 0.3, { ease: E.ease.outBack });
  }
  spawnCharm(sprite) {
    this.prep();
    const t = this.ref('_charmDrag'); if (!t) return;
    const g = E.instantiate(t.go, this.tfCharmHolder); const cd = g.comp('ScoopGame.CharmDrag');
    cd.setVisual(sprite);
    const tr = wpos(this.ref('_tfSpawnTopRight')), bl = wpos(this.ref('_tfSpawnBottomLeft'));
    g.setWorldPos(E.rand(bl[0], tr[0]), E.rand(bl[1], tr[1])); g.z = 0;
    cd.setBackPosition();
    g.setActive(true);
    this.list.push(cd);
  }
  onEnable() { this.prep(); if (this.l) E.input.off(this.l); this.l = E.input.on((t, ev) => this.onInput(t, ev)); }
  onDisable() { if (this.l) E.input.off(this.l); this.l = null; }
  pick(wx, wy) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const cd = this.list[i]; const col = cd.go.comp('Box');
      if (col && col.enabled && cd.go.activeInHierarchy && E.ptInCollider(col, cd.go, wx, wy)) return cd;
    }
    return null;
  }
  onInput(t, ev) {
    if (t === 'down') {
      if (E.uiRaycast(ev.x, ev.y)) return;
      const cd = this.pick(ev.wx, ev.wy); if (!cd) return;
      if (this.cur) this.checkDragOnPos();
      G.sound(16); vib();
      this.cur = cd; const p = cd.go.worldPos(); this._offset = [p[0] - ev.wx, p[1] - ev.wy];
      cd.onDrag();
    } else if (t === 'up') {
      if (!this.cur) return;
      this.checkDragOnPos(); this.checkDoneStep();
      this.cur = null; this.status = 0;
    }
  }
  update() {
    if (!this.cur || !E.input.down) return;
    const w = E.screenToWorld(E.input.x, E.input.y);
    this.cur.go.setWorldPos(w[0] + this._offset[0], w[1] + this._offset[1]); this.cur.go.z = 0;
    this.checkDragStatus();
  }
  inside(cd) { const bp = this.boxPolygon; if (!bp) return false; const p = cd.go.worldPos(); return E.ptInCollider(bp.c, bp.g, p[0], p[1]); }
  checkDragStatus() {
    if (!this.cur) return;
    const ins = this.inside(this.cur); const st = ins ? 2 : 1;
    if (st === this.status) return;
    this.status = st; this.cur.setColor(ins ? this.colors.right : this.colors.wrong);
  }
  checkDragOnPos() {
    const c = this.cur; if (!c) return;
    const ins = this.inside(c);
    c._isOnRightPos = ins;
    c.setColor(this.colors.normal); c.onRelease();
    if (ins) {
      G.sound(20); vib(); this.spawnCompliment();
      const n = this.list.filter((x) => !x._isOnRightPos).length;
      c.go.z = (c.go.z || 0) + n * 0.1;
    } else c.backToPosition();
  }
  spawnCompliment() {
    const tr = wpos(this.ref('_tfComplimentTopRight')), bl = wpos(this.ref('_tfComplimentBottomLeft'));
    const i = E.randInt(0, (this.d._complimentSprites || []).length);
    spawnCompliment(this.d._complimentSprites[i], E.rand(bl[0], tr[0]), E.rand(bl[1], tr[1]));
    G.sound(this.d._complimentSoundEnum[i]);
  }
  checkDoneStep() {
    if (this._stepDone || this.list.some((c) => !c._isOnRightPos)) return;
    this._stepDone = true;
    if (screen && screen.block) screen.block.setActive(true);
    this.list.forEach((c) => c.setDraggable(false));
    const tr = this.tray;
    const fin = () => { if (screen) { screen.showContentSortPart2(); if (screen.block) screen.block.setActive(false); } };
    if (tr) tweenVal(() => tr.y, (y) => { tr.y = y; }, -20, 1.0, { ease: E.ease.inBack, owner: tr, done: fin }); else fin();
  }
  squash(done) { const bh = this.tfBoxHolder; if (!bh) { if (done) done(); return; } E.killOwner(bh); yoyoScale(bh, 1, 0.9, 0.3, { done }); }
  openLid(cb) {
    this.prep(); vib();
    this.squash();
    const lid = this.srLid; if (!lid) { if (cb) cb(); return; }
    alphaTo(lid, 0, 0.3, { delay: 0.6 });
    const p = wpos(this.ref('_tfLidOpenPos'));
    moveW(lid.go, p[0], p[1], 0.5, { delay: 0.3, ease: E.ease.outQuart, done: cb });
  }
  closeLid(cb) {
    this.prep();
    if (this.tfCharmHolder && this.tfBox) this.tfCharmHolder.setParent(this.tfBox, true);
    const lid = this.srLid; const p = wpos(this.ref('_tfLidClosePos'));
    alphaTo(lid, 1, 0.3);
    moveW(lid.go, p[0], p[1], 0.5, { ease: E.ease.inQuart, done: () => {
      G.sound(21); vib();
      this.squash(() => { const b = this.tfBox; tweenVal(() => b.y, (y) => { b.y = y; }, 2.0, 0.3, { owner: b }); });
      E.after(1.0, () => { if (cb) cb(); }, this);
    } });
  }
  prepareFinalBox() {
    this.prep();
    const fin = goOf(this.ref('_tfBoxFinal')); const b = this.tfBox; if (!fin || !b) return;
    E.killOwner(b);
    b.setParent(fin, true);
    b.sx = b.sy = 0.8; b.x = 0; b.y = 0; b.z = 0;
    setSG(this.boxSG, true);
  }
}
S['ScoopGame.PutCharmToBox'] = PutCharmToBox;

class CharmDrag extends E.Behaviour {
  sr() { return this.ref('_srVisual'); }
  sgc() { return this.ref('_sortingGroup'); }
  get IsRightPos() { return !!this._isOnRightPos; }
  setVisual(s) { const r = this.sr(); if (r) r.sp = s; }
  setColor(c) { const r = this.sr(); if (r) r.color = c.slice(); }
  setOnRightPos(b) { this._isOnRightPos = b; }
  setDraggable(b) { const c = this.go.comp('Box'); if (c) c.enabled = b; }
  onDrag() { const sg = this.sgc(); if (sg) sg.o = 6; E.killOwner(this.go); scaleTo(this.go, 1.1, 0.3); }
  onRelease() { E.killOwner(this.go); scaleTo(this.go, 1.0, 0.3, { done: () => { const sg = this.sgc(); if (sg) sg.o = 3; } }); }
  setBackPosition() { this._backPosition = this.go.worldPos(); }
  backToPosition() { E.killOwner(this.go); const p = this._backPosition || this.go.worldPos(); moveW(this.go, p[0], p[1], 0.75); } // DOKill also stops the release scale (as in Unity)
}
S['ScoopGame.CharmDrag'] = CharmDrag;
class BoxComplete extends E.Behaviour {}
S['ScoopGame.BoxComplete'] = BoxComplete;
class GiftDraggable extends E.Behaviour {}
S['ScoopGame.GiftDraggable'] = GiftDraggable;

// ================================================================== DoneBoxCharmPopup ("Completed!" -> Delivery)
class DoneBoxCharmPopup extends E.PopupBase {
  onInit() {
    G.onClick(this.ref('_btnDelivery'), () => this.onBtnDeliveryClick());
    this.bg = this.ref('_imgDeliveryBG'); this.txt = E.txtOf(this.ref('_txtDelivery')); this.mascot = goOf(this.ref('_rtMascot'));
    this.effect = goOf(this.ref('_tfEffect')); this.stars = this.refs('_imgStarList').filter(Boolean);
    this.bg2d = this.ref('_2dBg'); this.glow = goOf(this.ref('_tfGlow'));
    if (this.bg) this.bg.color[3] = 0; if (this.txt) this.txt.color[3] = 0;
    if (this.mascot) this.mascot.rt[4] = -1000; if (this.effect) this.effect.sx = this.effect.sy = 0;
    for (const s of this.stars) s.color[3] = 0; // (inferred) alpha 0 until Delivery
    if (this.glow && !this._glowInit) { this._glowInit = true; this.glow.sx = this.glow.sy = 0; }
  }
  onShow() {
    const fx = goOf(this.ref('_fxComplete')); if (fx) fx.setActive(true);
    const bc = goOf(this.ref('_backContent')); if (bc) bc.setActive(true);
    const db = btnOf(this.ref('_btnDelivery')); if (db) db.go.setActive(true);
    G.sound(11);
    if (this.effect) { E.killOwner(this.effect); this.effect.sx = this.effect.sy = 0; scaleTo(this.effect, 1, 0.5, { ease: E.ease.outBack }); }
    if (this.bg2d) { E.killOwner(this.bg2d); alphaTo(this.bg2d, 0.95, 0.2, { ease: E.ease.linear }); }
    if (this.glow) { E.killOwner(this.glow); this.glow.sx = this.glow.sy = 0; scaleTo(this.glow, 1, 0.5, { ease: E.ease.outBack }); }
  }
  onHide() { const fx = goOf(this.ref('_fxComplete')); if (fx) fx.setActive(false); }
  onBtnDeliveryClick() {
    G.click();
    const db = btnOf(this.ref('_btnDelivery')); if (db) db.go.setActive(false);
    if (this.bg) alphaTo(this.bg, 1, 0.3);
    for (const s of this.stars) alphaTo(s, 1, 0.3);
    if (this.txt) alphaTo(this.txt, 1, 0.3);
    if (this.mascot) { E.killOwner(this.mascot.rt); rtTo(this.mascot, 4, 0, 1.0, { ease: E.ease.linear }); rtTo(this.mascot, 4, 1000, 1.0, { delay: 2.0, ease: E.ease.inBack }); }
    G.sound(25);
    if (this.bg2d) alphaTo(this.bg2d, 0, 0.3);
    if (this.glow) scaleTo(this.glow, 0, 0.3);
    if (this.bg) alphaTo(this.bg, 0, 0.3, { delay: 2.7 });
    for (const s of this.stars) alphaTo(s, 0, 0.3, { delay: 2.7 });
    const start = () => { const bc = goOf(this.ref('_backContent')); if (bc) bc.setActive(false); if (screen) screen.onSetupGiftBoxDone(); };
    const end = () => this.hide();
    if (this.txt) alphaTo(this.txt, 0, 0.3, { delay: 2.7, onStart: start, done: end });
    else { E.after(2.7, start, this); E.after(3.0, end, this); }
  }
}
S['ScoopGame.DoneBoxCharmPopup'] = DoneBoxCharmPopup;

// ================================================================== GiveBoxToCharacter
class GiveBoxToCharacter extends E.Behaviour {
  prep() {
    if (this._p) return; this._p = 1;
    this.gift = goOf(this.ref('_gift')); this.srGift = this.ref('_srGift'); this.srHand = this.ref('_srHand'); this.srDemo = this.ref('_srBoxDemo');
    this.tfHand = goOf(this.ref('_tfHand')); this.tutKey = {};
    const ch = this.ref('_characterEndgame'); const cg = goOf(ch);
    this.spine = cg ? cg.comp('Spine') : null;
  }
  setGiftBox(sp) { this.prep(); if (this.srGift) this.srGift.sp = sp; if (this.srDemo) this.srDemo.sp = sp; }
  setSkinCharacter() {
    this.prep(); if (!this.spine) return;
    const list = this.d._characterSkinName || ['Lily'];
    let main = null;
    try { const mc = G.session.MainCharacter; const sp = mc && mc.compInChildren && mc.compInChildren('Spine'); main = sp && sp.skeleton && sp.skeleton.skin ? sp.skeleton.skin.name : sp ? sp.skin : null; } catch (e) { main = null; }
    let s, guard = 0; do { s = E.pick(list); } while (s === main && ++guard < 50);
    E.spineSkin(this.spine, s);
  }
  idle() { if (this.spine) E.spinePlay(this.spine, 'idle', true); }
  onEnable() {
    this.prep();
    this.idle(); this._allowDrag = true; this.dragging = false;
    if (!G.pref('tutorial_gift_box', 0)) { this.showTutorial(); G.setPref('tutorial_gift_box', 1); }
    if (this.l) E.input.off(this.l); this.l = E.input.on((t, ev) => this.onInput(t, ev));
  }
  onDisable() { if (this.l) E.input.off(this.l); this.l = null; }
  showTutorial() {
    const h = this.srHand, hg = this.tfHand, demo = this.srDemo; if (!h || !hg) return;
    E.killOwner(this.tutKey);
    const appear = wpos(this.ref('_tfHandAppear')), box = wpos(this.ref('_tfBox')), chr = wpos(this.ref('_tfCharacter'));
    const K = { owner: this.tutKey };
    const lap = () => {
      h.color[3] = 0; hg.setWorldPos(appear[0], appear[1]);
      alphaTo(h, 1, 0.3, K);
      moveW(hg, box[0], box[1], 0.3, Object.assign({ delay: 0.3 }, K));
      if (demo) alphaTo(demo, 0.7, 0.3, Object.assign({ delay: 0.6 }, K));
      moveW(hg, chr[0], chr[1], 1.0, Object.assign({ delay: 0.9, ease: E.ease.linear }, K));
      alphaTo(h, 0, 0.3, Object.assign({ delay: 1.9 }, K));
      if (demo) alphaTo(demo, 0, 0.3, Object.assign({ delay: 1.9 }, K));
      E.after(2.5, lap, this.tutKey);
    };
    lap();
  }
  hideTutorial() { E.killOwner(this.tutKey); if (this.srHand) this.srHand.color[3] = 0; if (this.srDemo) this.srDemo.color[3] = 0; }
  onInput(t, ev) {
    if (!this._allowDrag || !this.gift) return;
    if (t === 'down') {
      if (E.uiRaycast(ev.x, ev.y)) return;
      G.sound(16); vib(); this.hideTutorial();
      const g = this.gift.worldPos(); this._dragOffset = [g[0] - ev.wx, g[1] - ev.wy]; this.dragging = true;
    } else if (t === 'up') {
      if (!this.dragging) return;
      this.dragging = false; this.checkOnRightPos();
    }
  }
  update() {
    if (!this.dragging || !this._allowDrag || !this.gift) return;
    const w = E.screenToWorld(E.input.x, E.input.y);
    this.gift.setWorldPos(w[0] + this._dragOffset[0], w[1] + this._dragOffset[1]);
  }
  checkOnRightPos() {
    const p = this.gift.worldPos(), tr = wpos(this.ref('_tfCheckTopRight')), bl = wpos(this.ref('_tfCheckBottomLeft'));
    const inside = p[0] <= tr[0] && p[0] >= bl[0] && p[1] <= tr[1] && p[1] >= bl[1];
    if (!inside) {
      this._allowDrag = false; const b = wpos(this.ref('_tfBackPos'));
      moveW(this.gift, b[0], b[1], 0.1, { done: () => { this._allowDrag = true; } });
    } else {
      this._allowDrag = false;
      const r = wpos(this.ref('_tfRightPos')); this.gift.setWorldPos(r[0], r[1]);
      const bs = goOf(this.ref('_boxScale')); if (bs) bs.sx = bs.sy = 0.5;
      this.characterReceiveGift();
      G.sound(24); vib();
    }
  }
  characterReceiveGift() {
    vib(); G.sound(23);
    const after = () => {
      this.idle();
      E.after(1.0, () => {
        const c = this._scoopGameController || ctrl; if (c) c.showEndGame();
        const pop = E.ui.showPopup('ScoopGame.CompletedPopup');
        if (pop && pop.setMoneyResult && c) pop.setMoneyResult(c.getIncome(), c.getTip());
      }, this);
    };
    if (this.spine && this.spine.ready) E.spinePlay(this.spine, E.pick(['happy', 'happy2', 'happy3', 'happy4']), false, 0, after);
    else E.after(1.333, after, this); // skeleton not loaded: keep the happy-anim timing
  }
}
S['ScoopGame.GiveBoxToCharacter'] = GiveBoxToCharacter;

// ------------------------------------------------------------------ RenderCam -> RawImage: draw a world subtree into an offscreen canvas
let viewSpine = null;
const drawSRTo = (ctx, base, c) => {
  const s = E.sprite(c.sp); if (!s || !s.img || !s.img._ok) return;
  const a = c.color ? c.color[3] : 1; if (a <= 0.003) return;
  let src = [s.img, s[1], s[2], s[3], s[4]];
  const col = c.color; if (col && (col[0] < 0.999 || col[1] < 0.999 || col[2] < 0.999)) { const t = E.tinted(s, col); if (t) src = [t, 0, 0, t.width, t.height]; }
  const m = M.mul(base, c.go.worldMatrix()); ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  if (c.fx || c.fy) ctx.transform(c.fx ? -1 : 1, 0, 0, c.fy ? -1 : 1, 0, 0);
  ctx.globalAlpha = a;
  const ppu = s[7]; let x, y, w, h;
  if (c.dm && c.sz) { w = c.sz[0]; h = c.sz[1]; x = -s[5] * w; y = -s[6] * h; }
  else { x = (-s[5] * s[10] + s[12]) / ppu; y = (-s[6] * s[11] + s[13]) / ppu; w = s[3] / ppu; h = s[4] / ppu; }
  ctx.transform(1, 0, 0, -1, 0, 0);
  ctx.drawImage(src[0], src[1], src[2], src[3], src[4], x, -(y + h), w, h);
};
const drawSpineTo = (ctx, base, c) => {
  if (!c.ready || !window.spine || !c.skeleton) return;
  const sc = (c.meta && c.meta.scale) || 0.01;
  const m = M.mul(M.mul(base, c.go.worldMatrix()), [sc * (c.fx ? -1 : 1), 0, 0, sc * (c.fy ? -1 : 1), 0, 0]);
  E.spineTick(c);
  E.spineBlit(ctx, m, c, c.color ? c.color[3] : 1);
};
const renderWorldView = (canvas, roots, cx, cy, halfH) => {
  const ctx = canvas.getContext('2d'); const W = canvas.width, Hh = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, Hh);
  const s = Hh / (2 * halfH); const base = [s, 0, 0, -s, W / 2 - cx * s, Hh / 2 + cy * s];
  let idx = 0;
  const collect = (g, list) => {
    if (!g.activeSelf) return;
    const sg = g.comp('SG'); let target = list;
    if (sg && sg.enabled && !sg.off) { const grp = { k: 'g', o: sg.o || 0, z: g.worldZ(), i: idx++, items: [] }; list.push(grp); target = grp.items; }
    for (const c of g.comps) {
      if (!c.enabled) continue;
      if (c.t === 'SR' && c.sp) target.push({ k: 'sr', c, o: c.o || 0, z: g.worldZ(), i: idx++ });
      else if (c.t === 'Spine' && !c.ui) { const mr = g.comp('MR'); target.push({ k: 'sp', c, o: mr ? mr.o : 0, z: g.worldZ(), i: idx++ }); }
    }
    for (const ch of g.children) collect(ch, target);
  };
  const list = []; for (const r of roots) if (r) collect(r, list);
  const draw = (items) => {
    items.sort((a, b) => a.o - b.o || b.z - a.z || a.i - b.i);
    for (const it of items) { try { if (it.k === 'g') draw(it.items); else if (it.k === 'sr') drawSRTo(ctx, base, it.c); else drawSpineTo(ctx, base, it.c); } catch (e) { /* skip */ } }
  };
  draw(list);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
};

// ================================================================== CompletedPopup (Earnings / Tips, x2 or No thanks)
class CompletedPopup extends E.PopupBase {
  onInit() {
    G.onClick(this.ref('_adsButton'), () => this.onAdsButtonClicked());
    G.onClick(this.ref('_rewardButton'), () => this.onRewardButtonClicked());
    this._income = 0; this._tip = 0;
  }
  onShow() {
    const mm = G.moneyMgr; if (mm && mm.go.rt) { E.killOwner(mm.go.rt); mm.go.rt[4] = -170; }
    this.updateResult();
    if (G.profile && G.profile.obtainExperiencePoint) try { G.profile.obtainExperiencePoint(); } catch (e) { console.error(e); }
    const av = G.session.OrderAvatar; const im = this.ref('_imgCustomer'); if (av && im) im.sp = av;
    G.sound(9);
    this.setInteractButtons(true);
    this.startAdsButtonAnim();
    const u = G.data().user; u.ScoopPlayTime = (u.ScoopPlayTime || 0) + 1; G.save();
    this.setupRender();
  }
  setMoneyResult(income, tip) {
    this._income = income; this._tip = tip;
    const a = E.txtOf(this.ref('_incomeMoneyText')), b = E.txtOf(this.ref('_tipMoneyText'));
    if (a) a.text = String(income); if (b) b.text = String(tip);
  }
  updateResult() {
    const a = this.ref(H().hasOrderItem() ? '_positiveCommentAsset' : '_negativeCommentAsset');
    const lines = a && (a.ChatContents || (a.rawText ? a.rawText.split('\n').filter(Boolean) : []));
    const t = E.txtOf(this.ref('_txtCompliment')); if (t && lines && lines.length) t.text = E.pick(lines);
  }
  setupRender() {
    const raw = this.ref('_rewardImage'); if (!raw) return;
    if (!this.cv) { this.cv = document.createElement('canvas'); this.cv.width = 426; this.cv.height = 772; } // Mask rect 568.5 x 1029 (x0.75)
    raw.canvas = this.cv; this.raw = raw;
  }
  update() {
    if (!this._showing || !this.cv || !ctrl || !ctrl.give) return;
    const w = this.raw && this.raw.go.rect; if (w && w.w > 0 && w.h > 0) { const hh = Math.round((this.cv.width * w.h) / w.w); if (Math.abs(hh - this.cv.height) > 2) this.cv.height = hh; }
    // RenderCam: (-2.67, 2.5), orthographic size 9
    renderWorldView(this.cv, [ctrl.give.go], -2.67, 2.5, 9);
  }
  setInteractButtons(b) { const a = btnOf(this.ref('_adsButton')), r = btnOf(this.ref('_rewardButton')); if (a) a.interactable = b; if (r) r.interactable = b; }
  startAdsButtonAnim() {
    const b = btnOf(this.ref('_adsButton')); const g = b && b.go; if (!g) return;
    E.killOwner(g); g.sx = g.sy = 1;
    scaleTo(g, 1.1, 0.5, { loops: -1, yoyo: true, delay: 2.0, ease: E.ease.inOutSine });
  }
  stopAdsButtonAnim() { const b = btnOf(this.ref('_adsButton')); const g = b && b.go; if (!g) return; E.killOwner(g); g.sx = g.sy = 1; }
  onAdsButtonClicked() { G.click(); vib(); this.setInteractButtons(false); this.onRewardMoney(this._income + this._tip * 2); } // rewarded ad -> success
  onRewardButtonClicked() { G.click(); vib(); this.setInteractButtons(false); this.onRewardMoney(this._income + this._tip); }
  onRewardMoney(money) {
    this.stopAdsButtonAnim();
    G.collectMoney(money, 10, null);
    this.handleAfterRewardMoney();
  }
  handleAfterRewardMoney() {
    G.save();
    E.after(4.0, () => {
      G.session.IsPlayAGame = true;
      G.session.BackFromGameMode = 3; G.BackFromGameMode = 3; // GameModeEnum.Scoop
      G.goto('Home');
    }, this);
  }
}
S['ScoopGame.CompletedPopup'] = CompletedPopup;
})();
