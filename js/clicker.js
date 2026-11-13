'use strict';
// Clicker DIY mode (level2 "ModeClicker") + Home keycap collection view (level1).
// case -> 3D printer -> switches -> keycaps + colour -> decor -> keychain -> assembly -> result -> 10 s livestream -> complete -> Home
(() => {
const G = E.Game, S = E.scripts, M = E.M;
const goOf = (r) => G.goOf(r);
const user = () => G.data().user;
const EZ = E.ease;

// ------------------------------------------------------------------ save data (DataClicker / ClickerSaveData)
const DC = {
  data() {
    const s = G.data();
    if (!s.clicker || typeof s.clicker !== 'object') s.clicker = {};
    const c = s.clicker;
    if (c._maxKeycapAmount == null) c._maxKeycapAmount = 12;
    if (c._latestIndexCreated == null) c._latestIndexCreated = 0;
    if (!Array.isArray(c._savedKeycap)) c._savedKeycap = [];
    return c;
  },
  list() { return DC.data()._savedKeycap; },
  canAdd() { const d = DC.data(); return d._savedKeycap.length < d._maxKeycapAmount; },
  freeSlotCount() { const d = DC.data(); return d._maxKeycapAmount - d._savedKeycap.length; },
  register(item) { const d = DC.data(); d._latestIndexCreated++; item.Index = d._latestIndexCreated; d._savedKeycap.push(item); G.save(); },
  get(index) { return DC.list().find((k) => k.Index === index) || null; },
  remove(index) { const d = DC.data(); d._savedKeycap = d._savedKeycap.filter((k) => k.Index !== index); G.save(); },
};
G.dataClicker = DC;

// ------------------------------------------------------------------ configs (data_config_type = 1 -> _dataList)
const CFG = { base: 'sharedassets0.assets:14397', sw: 'sharedassets1.assets:845', kc: 'sharedassets1.assets:843', kch: 'sharedassets1.assets:844', decor: 'sharedassets0.assets:14398' };
const cfgList = (k) => { const s = E.so(CFG[k]); return (s && s._dataList) || []; };
const byId = (k, id) => { const l = cfgList(k); return (l[id] && l[id].Id === id) ? l[id] : (l.find((x) => x.Id === id) || null); };
const UNL = { base: 'UnlockedClickerBase', sw: 'UnlockedClickerSwitch', kc: 'UnlockedClickerKeycap', kch: 'UnlockedClickerKeychain', decor: 'UnlockedClickerDecor' };
const unlockList = (name) => { const u = user(); if (!Array.isArray(u[name])) u[name] = []; return u[name]; };
const hasUnlocked = (name, id) => unlockList(name).includes(id);
const unlock = (name, id) => { const l = unlockList(name); if (!l.includes(id)) { l.push(id); G.save(); } };
const soundNames = () => { if (!E._esNames) E._esNames = new Set(Object.values(E.ESound)); return E._esNames; };
const parseSound = (n) => (n && soundNames().has(n) ? n : null);

// ------------------------------------------------------------------ helpers
const snd = (id, opts) => { if (user().sound === false) return null; return E.playSound(id, opts); };
const vib = (ms) => E.vibrate(ms);
const setA = (sr, a) => { if (sr && sr.color) sr.color[3] = a; };
const vis = (g, b) => { g = goOf(g); if (g) g.setActive(b); };
const scr = () => (E.ui ? E.ui.getScreen('Clicker.IngameClickerScreen') : null);
// SetParent(p, worldPositionStays=true) keeping world position, rotation and scale (engine setParent only keeps position)
const reparentKeep = (g, p) => {
  const m = g.worldMatrix(); const wr = g.worldRot();
  const ws = [Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3])];
  g.setParent(p, false);
  if (p) { const pm = p.worldMatrix(); g.sx = ws[0] / (Math.hypot(pm[0], pm[1]) || 1); g.sy = ws[1] / (Math.hypot(pm[2], pm[3]) || 1); g.rot = wr - p.worldRot(); }
  else { g.sx = ws[0]; g.sy = ws[1]; g.rot = wr; }
  g.setWorldPos(m[4], m[5]);
};
// UI: screen position of a laid-out RectTransform pivot / place a RectTransform at a screen position
const uiPos = (g) => (g && g.wm ? [g.wm[4], g.wm[5]] : [0, 0]);
const uiPlaceAt = (g, sx, sy) => {
  const p = g && g.parent; if (!p || !p.wm || !p.rect || !g.rt) return;
  const l = M.ap(M.inv(p.wm), sx, sy); const r = g.rt, P = p.rect;
  r[4] = l[0] - P.w * (r[0] + (r[2] - r[0]) * r[8] - P.pvx);
  r[5] = l[1] - P.h * (r[1] + (r[3] - r[1]) * r[9] - P.pvy);
};
// world-space canvases: the exporter stores their RectTransform position only in rt[4..5] (p is 0,0) -> move it to x/y
const fixWorldCanvases = (root) => {
  const walk = (g) => {
    const c = g.comp('Canvas');
    if (c && c.mode === 2 && g.rt && !g._wcFixed && !(g.parent && g.parent.rt)) { g._wcFixed = true; if (!g.x && !g.y && (g.rt[4] || g.rt[5])) { g.x = g.rt[4]; g.y = g.rt[5]; } }
    for (const ch of g.children) walk(ch);
  };
  if (root) walk(root);
};
// ScrollRect drives its Viewport to stretch over the scroll view (exported rect is 0x0) -> stretch it here
const fixScrollViewports = (root) => {
  for (const sc of root.compsInChildren('Scroll')) {
    const vp = goOf(E.resolve(sc.go, sc.vp)) || sc.go.find('Viewport');
    if (vp && vp.rt && vp.rt[0] === vp.rt[2] && vp.rt[1] === vp.rt[3] && !vp.rt[6] && !vp.rt[7]) { vp.rt[0] = 0; vp.rt[1] = 0; vp.rt[2] = 1; vp.rt[3] = 1; vp.rt[4] = 0; vp.rt[5] = 0; }
  }
};
// local tween of a world object to a pose (local x, y, rot of a sibling transform)
const tweenToPose = (g, pose, dur, ease, done) => {
  E.killOwner(g);
  const fx = g.x, fy = g.y, fr = g.rot, tx = pose.x, ty = pose.y; let tr = pose.rot;
  while (tr - fr > 180) tr -= 360; while (tr - fr < -180) tr += 360;
  return E.tween({ dur, ease, owner: g, update: (v) => { g.x = fx + (tx - fx) * v; g.y = fy + (ty - fy) * v; g.rot = fr + (tr - fr) * v; }, done });
};
let kmc = null; // KeycapMakerController singleton
let popCoin = null; // ClickerPopCoin

// ------------------------------------------------------------------ glow (URP Light2D sprite light) -> additive tinted sprite copy
const glows = new Set();
const makeGlow = (parent) => {
  const g = E.newGO('Glow Light 2D', parent);
  const c = {
    t: 'MB', cls: 'Clicker.GlowSprite2DItem', enabled: true, go: g, sp: null, col: [1, 1, 1, 1], v: 0, sortOrder: 20,
    setSprite(s) { this.sp = s; }, setColor(cl) { this.col = (cl || [1, 1, 1, 1]).slice(); },
    doGlow() { E.killOwner(this); E.tween({ dur: 0.1, ease: EZ.outQuad, owner: this, update: (k) => { this.v = 0.1 * k; }, done: () => { const f = this.v; E.tween({ dur: 0.5, ease: EZ.outQuad, owner: this, update: (k) => { this.v = f * (1 - k); } }); } }); },
    drawWorld(ctx, alpha) {
      if (this.v <= 0.002 || !this.sp || !this.go.wm) return;
      const k = Math.min(1, this.v / 0.1), cl = this.col;
      ctx.globalCompositeOperation = 'lighter';
      E.drawSRWith({ sp: this.sp, color: [cl[0], cl[1], cl[2], 0.5 * k], go: this.go }, alpha);
      E.drawSRWith({ sp: this.sp, color: [cl[0], cl[1], cl[2], 0.3 * k], go: { wm: M.mul(this.go.wm, [1.2, 0, 0, 1.2, 0, 0]) } }, alpha);
      ctx.globalCompositeOperation = 'source-over';
    },
  };
  g.comps.push(c); glows.add(c);
  return c;
};
const releaseAllGlow = () => { for (const c of glows) { E.killOwner(c); if (!c.go.destroyed) E.destroy(c.go); } glows.clear(); };
class Light2DManager extends E.Behaviour {
  awake() { const t = this.go.findDeep('Glow Light 2D'); if (t) t.setActive(false); }
  borrowGlowItem(parent) { return makeGlow(parent); }
  releaseAllItem() { releaseAllGlow(); }
  onDestroy() { glows.clear(); }
}
S['Clicker.Light2DManager'] = Light2DManager;
class GlowSprite2DItem extends E.Behaviour {} // scene template only (glow drawn by makeGlow)
S['Clicker.GlowSprite2DItem'] = GlowSprite2DItem;

// ------------------------------------------------------------------ sprite preload
const allConfigSprites = (out) => {
  const add = (k) => { if (k) out.add(k); };
  for (const b of cfgList('base')) { add(b.Icon); add(b.OnPrinterSpr); add(b.OnTraySpr); }
  for (const s of cfgList('sw')) add(s.Icon);
  for (const k of cfgList('kc')) { add(k.Icon); for (const c of k.KeycapColors || []) add(c); }
  for (const k of cfgList('kch')) { add(k.Icon); add(k.KeychainSprite); }
  for (const d of cfgList('decor')) { add(d.Icon); add(d.Sprite); }
  return out;
};
const addPreload = (level, fn) => { // additive with other files (ui.js composePreload)
  if (E.composePreload) { E.composePreload(level); E.scenePreload[level] = fn; return; }
  const prev = E.scenePreload[level];
  E.scenePreload[level] = () => { const out = fn(); if (prev) for (const k of prev() || []) out.add(k); return out; };
};
addPreload('level2', () => {
  const refs = [];
  for (const b of cfgList('base')) refs.push(b.BaseKeycapObject, b.BasePrinterObject);
  refs.push(G.poolPrefab(5));
  return allConfigSprites(E.prefabSprites(refs.filter(Boolean)));
});
addPreload('level1', () => { // saved clickers shown on the Home collection shelves
  const out = new Set(); const refs = [];
  for (const it of DC.list()) {
    const b = byId('base', it.BaseKeycapId); if (b) refs.push(b.BaseKeycapObject);
    const s = byId('sw', it.SwitchId); if (s) out.add(s.Icon);
    const k = byId('kc', it.KeycapId); if (k) for (const c of k.KeycapColors || []) out.add(c);
    const ch = byId('kch', it.KeychainId); if (ch) out.add(ch.KeychainSprite);
    for (const id of it.DecorIdList || []) { const d = id >= 0 ? byId('decor', id) : null; if (d) out.add(d.Sprite); }
  }
  return E.prefabSprites(refs, out);
});
const setActiveCharacter = (b) => { const s = G.session; if (s && s.setActiveCharacter) s.setActiveCharacter(b); else if (G.setActiveCharacter) G.setActiveCharacter(b); };

// ================================================================== scene boot
class AutoSceneClicker extends E.Behaviour {
  start() {
    G.music('bgm_ingame_1');
    if (E.ui) E.ui.showScreen('Clicker.IngameClickerScreen');
  }
}
S.AutoSceneClicker = AutoSceneClicker;

// ================================================================== KeycapMakerController
class KeycapMakerController extends E.Behaviour {
  awake() {
    kmc = this;
    this.baseKeycapId = -1; this.switchId = -1; this.keycapId = -1; this.keycapColorId = 0; this.keychainId = -1; this.switchAmount = 0;
    this.srTray = this.ref('_srTray');
    this.goTray = this.go.find('Tray-Scale');
    this.srBaseOnTray = this.ref('_srBaseKeycapOnTray');
    this.srPreview = this.ref('_srPreviewPrinter');
    this.tutBase = this.ref('_tutorialSelectKeycapBase');
    this.printer = this.ref('_printerMachine');
    this.switchList = this.refs('_switchList').filter(Boolean);
    this.keycapList = this.refs('_keycapList').filter(Boolean);
    this.srKeychain = this.ref('_srKeychain');
    this.base = this.ref('_baseKeycapObject');
    this.holder = goOf(this.ref('_tfBaseKeycapHolder'));
    this.highlight = goOf(this.ref('_tfHighlight'));
    this.drag = this.ref('_dragManager');
    this.bgTable = goOf(this.ref('_bgTable')); this.bgWall = goOf(this.ref('_bgWall'));
    this.srBG = this.ref('_srBG'); this.srBGC = this.ref('_srBGForPopupComplete');
    this.fx = goOf(this.ref('_tfFinalEffect'));
    this.tapHand = this.ref('_pointerHandTutorial'); this.dragHand = this.ref('_dragHandTutorial');
    this.finalPose = goOf(this.ref('_tfFinalPose')); this.livePose = goOf(this.ref('_tfLivestreamPose')); this.completePose = goOf(this.ref('_tfCompletePose'));
    fixWorldCanvases(this.go);
    if (this.printer) fixWorldCanvases(this.printer.go);
  }
  start() { this.initiate(); }
  onDestroy() { if (kmc === this) kmc = null; }
  initiate() {
    for (const s of this.switchList) { s.go.sx = s.go.sy = 0; }
    for (const k of this.keycapList) { k.go.sx = k.go.sy = 0; }
    if (this.goTray) this.goTray.setActive(false);
    if (this.srKeychain) this.srKeychain.go.sx = this.srKeychain.go.sy = 0;
    if (this.highlight) this.highlight.sx = this.highlight.sy = 0;
    if (this.drag) this.drag.setDraggable(false);
    setA(this.srBG, 0); setA(this.srBGC, 0);
    if (this.fx) this.fx.sx = this.fx.sy = 0;
    this.showTableBG();
    if (this.tutBase) this.tutBase.showWithAnim();
  }
  showTableBG() { vis(this.bgTable, true); vis(this.bgWall, false); }
  showWallBG() { vis(this.bgTable, false); vis(this.bgWall, true); }
  // ---- step 1: case
  setBaseKeycapId(id) {
    if (this.tutBase) this.tutBase.hideTutorial();
    const d = byId('base', id); if (!d) return;
    this.baseKeycapId = id;
    this.changePrinterBasePreview(d.OnTraySpr);
    if (this.srBaseOnTray) this.srBaseOnTray.sp = d.OnTraySpr;
    this.switchAmount = d.SwitchAmount;
  }
  changePrinterBasePreview(spr) {
    vib(50);
    const g = this.srPreview && this.srPreview.go; if (!g) return;
    E.killOwner(g);
    E.scaleTo(g, 0, 0.1, { done: () => { this.srPreview.sp = spr; E.scaleTo(g, 1, 0.3, { ease: EZ.outBack }); } });
  }
  hidePreviewShowPrinter() {
    const g = this.srPreview && this.srPreview.go; if (g) { E.killOwner(g); g.sx = g.sy = 0; }
    const d = byId('base', this.baseKeycapId);
    if (this.printer) { if (d) this.printer.changeBaseKeycap(d.BasePrinterObject); this.printer.go.setActive(true); }
    this.showWallBG();
  }
  speedUpPrinter() { if (this.printer) this.printer.rail().speedUp(); }
  hidePrinterShowTray() { if (this.printer) this.printer.go.setActive(false); if (this.goTray) this.goTray.setActive(true); this.showWallBG(); }
  spawnAssembleKeycap() {
    const d = byId('base', this.baseKeycapId); if (!d) return;
    if (this.base && this.base.go && !this.base.go.destroyed) E.destroy(this.base.go);
    const b = E.spawn(d.BaseKeycapObject, this.holder);
    const bg = goOf(b); bg.x = 0; bg.y = 0; bg.rot = 0;
    fixWorldCanvases(bg);
    this.base = bg.comp('Clicker.BaseKeycapObject') || b;
    if (this.drag) this.drag.setBaseKeycapChecking(this.base);
  }
  // ---- step 3: switch
  spawnSwitch(id) {
    const d = byId('sw', id); if (!d) return;
    this.switchId = id;
    this.switchList.forEach((s, i) => {
      const g = s.go; E.killOwner(g); g.sx = g.sy = 0;
      if (i < this.switchAmount) { s.setVisual(d.Icon); E.scaleTo(g, 1, 0.3, { ease: EZ.outBack, delay: i * 0.1, onStart: () => vib(40) }); }
    });
    if (this.base) this.base.setSwitch(d.Icon);
  }
  setSwitchSound(s) { if (this.base) this.base.setSwitchSound(s); }
  // ---- step 4: keycap shape + colour
  spawnKeycap(id) {
    const d = byId('kc', id); if (!d) return;
    this.keycapId = id;
    this.keycapList.forEach((k, i) => {
      const g = k.go; E.killOwner(g); g.sx = g.sy = 0;
      if (i < this.switchAmount) { k.setDecor(d.Icon, 0, -1); E.scaleTo(g, 1, 0.3, { ease: EZ.outBack, delay: i * 0.1, onStart: () => vib(40) }); }
    });
    if (this.base) this.base.setKeycap(d.Icon, 0);
  }
  setKeycapColor(c) {
    this.keycapColorId = c;
    const d = byId('kc', this.keycapId); if (!d) return;
    const spr = (d.KeycapColors || [])[c] || d.Icon;
    this.keycapList.forEach((k, i) => { if (i < this.switchAmount) k.setDecor(spr, 0, -1); });
    if (this.base) this.base.setKeycap(spr, 0);
  }
  // ---- step 5: decor
  setKeycapDecor(decorId, spr, type) { if (this.base) this.setKeycapIndexDecor(this.base.currentSetupKeycapIndex, decorId, spr, type); }
  setKeycapIndexDecor(index, decorId, spr, type) {
    if (index < 0) return;
    const t = this.keycapList[index]; if (t) t.setDecor(spr, type, decorId);
    if (this.base) this.base.setKeycapIndex(index, spr, type, decorId);
  }
  showStepDecorKeycap() {
    if (this.goTray) this.goTray.setActive(false);
    if (this.base) { this.base.showKeycapsOnly(); this.base.turnModeSetup(true); this.base.onSetupKeycap(0); }
    this.showTableBG();
  }
  jumpToNextKeycap() { if (this.base) this.base.jumpToNextKeycap(); }
  showHighlightSetupAt(tf) {
    const h = this.highlight; if (!h || !tf) return;
    const p = tf.worldPos(); h.setWorldPos(p[0], p[1]);
    E.killOwner(h); h.sx = h.sy = 1.2; E.scaleTo(h, 1, 0.3);
  }
  // ---- step 6: keychain
  showSelectKeychain() {
    const h = this.highlight; if (h) { E.killOwner(h); h.sx = h.sy = 0; }
    if (this.goTray) this.goTray.setActive(true);
    if (this.base) this.base.hideKeycaps();
    this.showWallBG();
  }
  setKeychain(id) {
    const d = byId('kch', id); if (!d) return;
    this.keychainId = id;
    this.changeKeychainPreview(d.Icon);
    if (this.base) this.base.setKeychain(d.KeychainSprite);
  }
  changeKeychainPreview(spr) {
    const s = this.srKeychain; if (!s) return; const g = s.go;
    E.killOwner(g);
    E.scaleTo(g, 0, 0.1, { done: () => { s.sp = spr; E.scaleTo(g, 1, 0.3, { ease: EZ.outBack }); } });
  }
  // ---- step 7: assembly
  prepareAssembleStep() {
    if (this.base) this.base.removeSetupEvent();
    this.showTableBG();
    this.moveTrayToLowPos(0);
    this.animAppearBaseKeycap(1.0);
  }
  moveTrayToLowPos(delay) {
    if (this.srTray) this.srTray.sp = this.d._trayTopViewSprite || this.srTray.sp;
    const t = this.goTray; if (t) E.moveTo(t, t.x, -8, 1.0, { delay });
    const b = this.srBaseOnTray;
    if (b) {
      const g = b.go;
      E.moveTo(g, g.x, g.y + 1, 0.5, { delay: delay + 0.5, done: () => { if (this.drag) { this.drag.updateFallbackPosition(); this.drag.setDraggable(true); } this.showDragHandTutorial(true); } });
      E.fadeTo(b, 0, 0.5, { delay: delay + 0.5, owner: b });
    }
  }
  animAppearBaseKeycap(delay) {
    const b = this.base; if (!b) return; const g = b.go;
    g.sx = g.sy = 0; b.showBaseOnly();
    E.scaleTo(g, 1, 0.3, { delay, ease: EZ.outBack });
  }
  // ---- step 8: result
  showResult() {
    if (this.goTray) this.goTray.setActive(false);
    const b = this.base; if (!b) return;
    const sw = byId('sw', this.switchId);
    b.glowColor = sw ? sw.Color : [1, 1, 1, 1];
    b.applyGlowColor(); b.updateGlowSprite();
    const s = scr(); if (s && s.go.activeSelf) s.hide();
    b.rotateKeychain(true);
    tweenToPose(b.go, this.finalPose, 0.5, EZ.inOutSine, () => {
      if (this.srBG) E.fadeTo(this.srBG, 0.95, 0.5, { owner: this.srBG });
      if (this.fx) E.scaleTo(this.fx, 1, 0.5, { ease: EZ.outBack, done: () => {
        b.turnModeSetup(false);
        if (E.ui) E.ui.showPopup('Clicker.PopupDoneAssemble');
        this.showWallBG();
      } });
    });
  }
  moveResultToCenter() {
    if (this.srBG) E.fadeTo(this.srBG, 0, 0.5, { owner: this.srBG });
    if (this.fx) { E.killOwner(this.fx); E.scaleTo(this.fx, 0, 0.5, { ease: EZ.inBack }); }
    const b = this.base; if (!b) return;
    b.rotateKeychain(false);
    tweenToPose(b.go, this.livePose, 0.5, EZ.inOutSine);
  }
  moveResultToComplete(onComplete) {
    if (this.srBGC) E.fadeTo(this.srBGC, 1, 0.3, { owner: this.srBGC });
    const b = this.base; if (!b) { if (onComplete) onComplete(); return; }
    b.rotateKeychain(true);
    tweenToPose(b.go, this.completePose, 0.5, EZ.inOutSine, onComplete);
  }
  showBGComplete() { if (this.srBGC) E.fadeTo(this.srBGC, 1, 0.3, { owner: this.srBGC }); }
  showHandComplete() { if (this.base && this.base.handFollowClick) this.base.handFollowClick.showHand(true); this.autoClickRandomTime(); }
  autoClickRandomTime() { const n = E.randInt(3, 5); for (let i = 0; i < n; i++) this.after(E.rand(0.1, 1.5), () => { if (this.base) this.base.clickRandomKeycap(); }); }
  showTapHandTutorial(show) { if (!user().IsFirstClicker || !this.tapHand) return; if (show) this.tapHand.show(); else this.tapHand.hide(); }
  showDragHandTutorial(show) { if (!user().IsFirstClicker || !this.dragHand) return; if (show) this.dragHand.show(); else this.dragHand.hide(); }
  callHandTouchThisSpot(t) { if (this.base && this.base.handFollowClick) this.base.handFollowClick.clickAt(t); }
  callRemoveKeycapAt(i) { if (this.base) this.base.pullBackKeycap(i); }
  // ---- save to collection
  trySaveKeycapToDatabase() {
    const mk = () => ({ Index: 0, BaseKeycapId: this.baseKeycapId, SwitchId: this.switchId, KeycapId: this.keycapId, KeycapColorId: this.keycapColorId, KeychainId: this.keychainId, DecorIdList: this.base ? this.base.getDecorData() : [], Value: 0 });
    if (DC.canAdd()) { DC.register(mk()); return; }
    const p = E.ui && E.ui.showPopup('Clicker.CollectionFullPopup');
    if (p && p.setEventCallback) p.setEventCallback(() => { DC.data()._maxKeycapAmount++; G.save(); DC.register(mk()); }, 500);
  }
}
S['Clicker.KeycapMakerController'] = KeycapMakerController;

// ================================================================== BaseKeycapObject (finished case prefab)
class BaseKeycapObject extends E.Behaviour {
  L() {
    if (this._L) return this._L;
    const L = (this._L = {});
    L.srBase = this.ref('_srBaseKeycap'); L.srFront = this.ref('_srBaseKeycapFront');
    L.swPos = this.refs('_switchPositions').map(goOf); L.sw = this.refs('_switchObjects').filter(Boolean);
    L.kcPos = this.refs('_keycapPositions').map(goOf); L.kc = this.refs('_keycapObjects').filter(Boolean);
    L.clicks = this.refs('_keycapClicks').filter(Boolean);
    L.srKeychain = this.ref('_srKeychain'); L.hand = this.ref('_handFollowClick');
    this.swPlaced = L.sw.map(() => false); this.kcPlaced = L.kc.map(() => false); this.kchPlaced = false;
    if (this._idx == null) this._idx = -1;
    if (!this.glowColor) this.glowColor = (this.d._switchGlowColor || [1, 1, 1, 1]).slice();
    L.clicks.forEach((c, i) => { if (c.setBaseKeycapObject) { c.setBaseKeycapObject(this); c.setButtonSetupEvent(() => this.onSetupKeycap(i)); } });
    return L;
  }
  awake() {
    const L = this.L();
    vis(L.srBase, false); vis(L.srFront, false);
    this.swPlaced = L.sw.map(() => false); this.kcPlaced = L.kc.map(() => false);
    for (const s of L.sw) s.go.sx = s.go.sy = 0;
    for (const k of L.kc) k.go.sx = k.go.sy = 0;
    if (L.srKeychain) L.srKeychain.go.sx = L.srKeychain.go.sy = 0;
    this.kchPlaced = false;
    if (L.hand && L.hand.showHand) L.hand.showHand(false);
  }
  get handFollowClick() { return this.L().hand; }
  get currentSetupKeycapIndex() { return this._idx == null ? -1 : this._idx; }
  get keycapObjects() { return this.L().kc; }
  isAssembleDone() { this.L(); return this.swPlaced.every(Boolean) && this.kcPlaced.every(Boolean) && this.kchPlaced; }
  showKeycapsOnly() { const L = this.L(); vis(L.srBase, false); vis(L.srFront, false); L.kc.forEach((k, i) => { E.killOwner(k.go); E.scaleTo(k.go, 1, 0.3, { delay: i * 0.1, ease: EZ.outBack }); }); }
  showBaseOnly() { const L = this.L(); vis(L.srBase, true); vis(L.srFront, true); }
  hideKeycaps() { for (const k of this.L().kc) { E.killOwner(k.go); k.go.sx = k.go.sy = 0; } }
  turnModeSetup(b) { for (const c of this.L().clicks) c.turnModeSetup(b); }
  removeSetupEvent() { for (const c of this.L().clicks) c.removeSetupEvent(); }
  setSwitch(spr) { for (const s of this.L().sw) s.setVisual(spr); }
  setSwitchSound(s) { for (const c of this.L().clicks) c.setSoundClick(s); }
  setKeycap(spr, type) { for (const k of this.L().kc) k.setDecor(spr, type, -1); }
  setKeycapIndex(i, spr, type, decorId) { const k = this.L().kc[i]; if (k) k.setDecor(spr, type, decorId); }
  setKeychain(spr) { const s = this.L().srKeychain; if (s) s.sp = spr; }
  showAll() {
    const L = this.L(); vis(L.srBase, true); vis(L.srFront, true);
    const ns = L.sw.length, nk = L.kc.length;
    L.sw.forEach((s, i) => E.scaleTo(s.go, 1, 0.5, { ease: EZ.outBack, delay: i * 0.1 }));
    L.kc.forEach((k, i) => E.scaleTo(k.go, 1, 0.5, { ease: EZ.outBack, delay: (i + ns) * 0.1 }));
    if (L.srKeychain) E.scaleTo(L.srKeychain.go, 1, 0.5, { ease: EZ.outBack, delay: (ns + nk) * 0.1 });
  }
  showAllNoAnim() {
    const L = this.L(); vis(L.srBase, true); vis(L.srFront, true);
    for (const s of L.sw) { E.killOwner(s.go); s.go.sx = s.go.sy = 1; }
    for (const k of L.kc) { E.killOwner(k.go); k.go.sx = k.go.sy = 1; }
    if (L.srKeychain) { L.srKeychain.go.sx = L.srKeychain.go.sy = 1; }
    this.kchPlaced = true;
    this.turnModeSetup(true);
    if (L.hand && L.hand.showHand) L.hand.showHand(false);
  }
  onSetupKeycap(i) { this._idx = i; const k = this.L().kc[i]; if (kmc && k) kmc.showHighlightSetupAt(k.go); }
  jumpToNextKeycap() { const i = this.currentSetupKeycapIndex; if (i + 1 < this.L().kc.length) this.onSetupKeycap(i + 1); }
  showFirstHighlight() { this.onSetupKeycap(0); }
  _closest(list, t, range, ok) {
    const p = goOf(t).worldPos(); let best = -1, bd = 1e9;
    list.forEach((g, i) => { if (!g || !ok(i)) return; const q = g.worldPos(); const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d <= range && d < bd) { bd = d; best = i; } });
    return best;
  }
  checkDropSwitch(t, range) { const L = this.L(); return this._closest(L.swPos, t, range, (i) => !this.swPlaced[i]); }
  checkDropKeycap(t, range) { const L = this.L(); return this._closest(L.kcPos, t, range, (i) => this.swPlaced[i] && !this.kcPlaced[i]); }
  checkDropKeychain(t, range) {
    const L = this.L(); if (this.kchPlaced || !L.srKeychain) return false;
    const p = goOf(t).worldPos(), q = L.srKeychain.go.worldPos(); return Math.hypot(p[0] - q[0], p[1] - q[1]) <= range;
  }
  getPosKeycap(i) { const k = this.L().kc[i]; return k ? k.go.worldPos() : null; }
  dropSwitchReal(i) { const L = this.L(); this.swPlaced[i] = true; this.checkDoneAssemble(); const s = L.sw[i]; if (s) { E.killOwner(s.go); E.scaleTo(s.go, 1, 0.2, { ease: EZ.outBack }); } }
  dropKeycapReal(i, visual) {
    const L = this.L(); this.kcPlaced[i] = true; this.checkDoneAssemble();
    const k = L.kc[i]; if (!k) return;
    if (visual) k.cloneKeycap(visual);
    E.killOwner(k.go); E.scaleTo(k.go, 1, 0.2, { ease: EZ.outBack, done: () => this.updateGlowSprite() });
  }
  pullBackKeycap(i) { snd(53); this.kcPlaced[i] = false; const k = this.L().kc[i]; if (k) { E.killOwner(k.go); k.go.sx = k.go.sy = 0; } }
  activeKeychain() { const L = this.L(); this.kchPlaced = true; this.checkDoneAssemble(); if (L.srKeychain) { E.killOwner(L.srKeychain.go); E.scaleTo(L.srKeychain.go, 1, 0.2, { ease: EZ.outBack }); } }
  justShowKeychain() { const L = this.L(); this.kchPlaced = true; if (L.srKeychain) L.srKeychain.go.sx = L.srKeychain.go.sy = 1; }
  checkDoneAssemble() { if (this.isAssembleDone() && kmc && kmc.base === this && !this._resultShown) { this._resultShown = true; kmc.showResult(); } }
  getDecorData() { return this.L().kc.map((k) => (k.decorId == null ? -1 : k.decorId)); }
  clickRandomKeycap() { const c = this.L().clicks; if (c.length) c[E.randInt(0, c.length)].handleClick(); }
  rotateKeychain(on) {
    const s = this.L().srKeychain; const h = s && s.go.parent; if (!h) return;
    E.killOwner(h);
    if (on) { h.rot = 0; E.tween({ dur: 2.0, ease: EZ.inOutSine, loops: -1, yoyo: true, owner: h, update: (v) => { h.rot = -8 * v; } }); }
    else E.rotTo(h, 0, 0.3);
  }
  applyGlowColor() { for (const c of this.L().clicks) c.createGlowEffect(this.glowColor); }
  updateGlowSprite() { for (const c of this.L().clicks) c.updateGlow(); }
}
S['Clicker.BaseKeycapObject'] = BaseKeycapObject;

// ================================================================== KeycapObject / SwitchObject
class KeycapObject extends E.Behaviour {
  R() {
    if (!this._R) {
      this._R = { kc: this.ref('_srKeycap'), top: this.ref('_srOnTop'), rep: this.ref('_srReplace') };
      if (this.decorId == null) this.decorId = this.d._decorId != null ? this.d._decorId : -1;
      if (this.decorType == null) this.decorType = 0;
      if (!this.baseSprite && this._R.kc) this.baseSprite = this._R.kc.sp;
    }
    return this._R;
  }
  get DecorId() { this.R(); return this.decorId; }
  setDecor(spr, type, decorId) {
    const R = this.R();
    this.decorId = decorId; this.decorType = type;
    if (type === 0) { if (R.kc) R.kc.sp = spr; vis(R.top, false); vis(R.rep, false); vis(R.kc, true); this.baseSprite = spr; }
    else if (type === 1) { if (R.kc) R.kc.sp = this.baseSprite; if (R.top) R.top.sp = spr; vis(R.top, true); vis(R.kc, true); vis(R.rep, false); this.smallScale(); }
    else if (type === 2) { if (R.rep) R.rep.sp = spr; vis(R.rep, true); vis(R.top, false); vis(R.kc, false); this.smallScale(); }
    else if (type === 3) this.smallScale();
    else if (type === 4) { if (R.kc) R.kc.sp = spr; vis(R.top, false); vis(R.rep, false); vis(R.kc, true); this.smallScale(); }
  }
  smallScale() { const g = this.go; E.killOwner(g); E.scaleTo(g, 1.1, 0.1, { done: () => E.scaleTo(g, 1, 0.3) }); }
  cloneKeycap(root) {
    const R = this.R(), Q = root.R();
    this.decorId = root.decorId; this.decorType = root.decorType; this.baseSprite = root.baseSprite;
    for (const k of ['kc', 'top', 'rep']) { if (R[k] && Q[k]) { R[k].sp = Q[k].sp; R[k].go.setActive(Q[k].go.activeSelf); } }
  }
  get visualSR() { const R = this.R(); if (R.kc && R.kc.go.activeSelf) return R.kc; if (R.rep && R.rep.go.activeSelf) return R.rep; return null; }
}
S['Clicker.KeycapObject'] = KeycapObject;
class SwitchObject extends E.Behaviour {
  setVisual(spr) { const s = this.ref('_srSwitch'); if (s) s.sp = spr; }
}
S['Clicker.SwitchObject'] = SwitchObject;

// ================================================================== KeycapClick (world canvas on each case keycap)
class KeycapClick extends E.Behaviour {
  P() {
    if (!this._P) {
      const bs = this.ref('_btnSetup'); const bf = this.ref('_btnFullEventTrigger');
      this._P = { btnSetup: G.btn(bs), goSetup: goOf(bs), goFull: goOf(bf) };
      this.keycap = this.go.parent ? this.go.parent.compInParent('Clicker.KeycapObject') : null;
      if (this._P.btnSetup) this._P.btnSetup.onClick.push(() => this.handleSetup());
    }
    return this._P;
  }
  awake() {
    const P = this.P();
    if (this._mode == null) { vis(P.goSetup, false); vis(P.goFull, false); }
    if (this._forceInit == null) this.go._forceGR = E.scene === 'level2';
  }
  setBaseKeycapObject(b) { this.base = b; }
  setButtonSetupEvent(fn) { this.onSetup = fn; }
  removeSetupEvent() { this.onSetup = null; }
  setSoundClick(s) { this.soundClick = s; }
  turnModeSetup(isSetup) {
    const P = this.P(); this._mode = isSetup ? 1 : 0;
    vis(P.goFull, !isSetup); vis(P.goSetup, isSetup);
    this._forceInit = 1; this.go._forceGR = E.scene === 'level2' || !isSetup;
  }
  handleSetup() { if (this.keycap && this.onSetup) this.onSetup(); }
  onPointerDown(ev) {
    const P = this.P(); let t = ev && ev.target;
    while (t && t !== this.go) { if (t === P.goFull) { if (P.goFull.activeInHierarchy) this.handleClick(); return; } t = t.parent; }
  }
  handleClick() {
    const k = this.keycap; if (!k) return;
    const g = k.go;
    E.killOwner(g); g.sx = g.sy = 1;
    if (this.base && this.base.handFollowClick) this.base.handFollowClick.clickAt(g);
    const live = E.ui && E.ui.getScreen('Clicker.ScreenClickerLivestream');
    if (live && live.isShowing) { if (popCoin) popCoin.spawnOneCoin(this.go.worldPos()); if (kmc) kmc.showTapHandTutorial(false); }
    vib(40);
    if (this.glow && !this.glow.go.destroyed) this.glow.doGlow();
    const y0 = 0;
    E.tween({ dur: 0.1, owner: g, update: (v) => { g.y = y0 - 0.4 * v; }, done: () => { const f = g.y; E.tween({ dur: 0.03, owner: g, update: (v) => { g.y = f + (y0 - f) * v; } }); } });
    if (this.soundClick) snd(this.soundClick);
  }
  createGlowEffect(color) {
    const k = this.keycap; if (!k) return;
    const sr = k.visualSR; if (!sr) return;
    if (!this.glow || this.glow.go.destroyed) this.glow = makeGlow(sr.go);
    else { this.glow.go.setParent(sr.go, false); }
    const g = this.glow.go; g.x = g.y = 0; g.rot = 0; g.sx = g.sy = 1;
    this.glow.setSprite(sr.sp); this.glow.setColor(color);
  }
  updateGlow() {
    const gl = this.glow; if (!gl || gl.go.destroyed || !this.keycap) return;
    const sr = this.keycap.visualSR; if (!sr) return;
    if (gl.go.parent !== sr.go) gl.go.setParent(sr.go, false);
    gl.go.x = gl.go.y = 0; gl.go.sx = gl.go.sy = 1; gl.setSprite(sr.sp);
  }
}
S['Clicker.KeycapClick'] = KeycapClick;

// ================================================================== HandFollowClick
class HandFollowClick extends E.Behaviour {
  showHand(b) { this.go.setActive(b); }
  clickAt(target) {
    const h = goOf(this.ref('_movableHand')); if (!h || !target) return;
    E.killOwner(h); h.x = 0; h.y = 0;
    const s = h.worldPos(), t = goOf(target).worldPos();
    E.tween({ dur: 0.1, ease: EZ.inSine, owner: h, update: (v) => h.setWorldPos(s[0] + (t[0] - s[0]) * v, s[1] + (t[1] - s[1]) * v), done: () => E.moveTo(h, 0, 0, 0.1, { ease: EZ.outSine }) });
  }
}
S['Clicker.HandFollowClick'] = HandFollowClick;

// ================================================================== ClickerPopCoin (+1 coin per livestream tap)
class ClickerPopCoin extends E.Behaviour {
  awake() { popCoin = this; }
  onDestroy() { if (popCoin === this) popCoin = null; }
  spawnOneCoin(wp) {
    const parent = goOf(this.ref('_coinParent')); const end = goOf(this.ref('_endPosition')); const label = goOf(this.ref('_coinLabel'));
    const prefab = G.poolPrefab(this.d._prefabType || 5);
    if (!parent || !prefab || !parent.wm || !parent.rect) { G.addMoney(1); return; }
    const sc = E.worldToScreen(wp[0], wp[1]);
    const l = M.ap(M.inv(parent.wm), sc[0], sc[1]);
    const c = E.spawn(prefab, parent); const g = goOf(c) || c; if (!g || !g.rt) { G.addMoney(1); return; }
    g.rt[0] = g.rt[2] = parent.rect.pvx; g.rt[1] = g.rt[3] = parent.rect.pvy;
    g.rt[4] = l[0]; g.rt[5] = l[1]; g.sx = g.sy = 1;
    const tx = l[0] + E.rand(this.d._minX != null ? this.d._minX : -150, this.d._maxX != null ? this.d._maxX : 150);
    const ty = l[1] + E.rand(this.d._minY != null ? this.d._minY : -100, this.d._maxY != null ? this.d._maxY : 100);
    const dur = this.d._duration || 1;
    E.tween({ dur: 0.2, ease: EZ.linear, owner: g, update: (v) => { g.rt[4] = l[0] + (tx - l[0]) * v; g.rt[5] = l[1] + (ty - l[1]) * v + 10 * 4 * v * (1 - v); }, done: () => {
      const ex = end && end._lx != null ? end._lx : 0, ey = end && end._ly != null ? end._ly : 0;
      const fx = g.rt[4], fy = g.rt[5];
      E.tween({ dur, ease: EZ.inBack, owner: g, update: (v) => { g.rt[4] = fx + (ex - fx) * v; g.rt[5] = fy + (ey - fy) * v; }, done: () => {
        snd(6, { vol: 0.3 }); E.destroy(g);
        if (label) { E.killOwner(label); label.sx = label.sy = 1; E.punchScale(label, 0.5, 0.1); }
        G.addMoney(1);
      } });
    } });
  }
}
S['Clicker.ClickerPopCoin'] = ClickerPopCoin;

// ================================================================== 3D printer (step 2)
class BasePrinterObject extends E.Behaviour {
  get top() { return goOf(this.ref('_tfTop')); }
  get bottom() { return goOf(this.ref('_tfBottom')); }
}
S['Clicker.BasePrinterObject'] = BasePrinterObject;
class PrinterProcess extends E.Behaviour {
  P() { if (!this._P) this._P = { lights: this.refs('_percents').map(goOf).filter(Boolean), off: this.go.find('status_off'), on: this.go.find('status_on') }; return this._P; }
  resetStatus() { const P = this.P(); for (const l of P.lights) l.setActive(false); vis(P.off, true); vis(P.on, false); }
  onMachineStateChange(on) { const P = this.P(); vis(P.off, !on); vis(P.on, on); }
  setProcess(p) { const k = Math.floor(p / 10); this.P().lights.forEach((l, i) => l.setActive(i <= k)); }
}
S['Clicker.PrinterProcess'] = PrinterProcess;
class PrinterRail extends E.Behaviour {
  P() {
    if (!this._P) {
      this._P = { h: goOf(this.ref('_tfHorizontalRail')), v: goOf(this.ref('_tfVerticalRail')), off: goOf(this.ref('_tfOffsetY')), mh: goOf(this.ref('_tfMaskHolder')), ml: goOf(this.ref('_tfMaskLeft')), mr: goOf(this.ref('_tfMaskRight')) };
      this.minX = this.d._minX != null ? this.d._minX : -1.87; this.maxX = this.d._maxX != null ? this.d._maxX : 1.87;
      if (this.minY == null) { this.minY = this.d._minY != null ? this.d._minY : -2; this.maxY = this.d._maxY != null ? this.d._maxY : 0.5; }
    }
    return this._P;
  }
  setLimit(minY, maxY) { const P = this.P(); const o = P.off ? P.off.y : 0; this.minY = minY - o; this.maxY = maxY - o; }
  wx(g, x) { const p = g.worldPos(); g.setWorldPos(x, p[1]); }
  wy(g, y) { const p = g.worldPos(); g.setWorldPos(p[0], y); }
  resetRails() { const P = this.P(); this.kill(); if (P.h) this.wx(P.h, this.maxX); if (P.v) this.wy(P.v, this.minY); this.isSpeedUp = false; }
  get progress() { const P = this.P(); if (!P.v || this.maxY === this.minY) return 0; return E.clamp((P.v.worldPos()[1] - this.minY) / (this.maxY - this.minY), 0, 1) * 100; }
  hs() { return this.isSpeedUp ? 20 : 2; }
  vs() { return this.isSpeedUp ? 10 : 1; }
  moveX(g, x, speed, done) {
    const s = g.worldPos()[0]; const dur = Math.abs(x - s) / speed;
    return this.tween({ dur, ease: EZ.linear, update: (v) => this.wx(g, s + (x - s) * v), done });
  }
  startMoveRail(cb) { this.onDone = cb; this.stopSig = false; this.moveRailLeft(); }
  afterPass() { if (this.stopSig) { this.stopSig = false; const f = this.onDone; if (f) f(); return true; } return false; }
  moveRailLeft() {
    const P = this.P();
    if (P.ml && P.mh) { const y = P.mh.worldPos()[1]; P.ml.setWorldPos(this.maxX, y); }
    if (P.ml) this.moveX(P.ml, this.minX, this.hs());
    this.moveX(P.h, this.minX, this.hs(), () => this.moveRailUpOneStep(() => { if (!this.afterPass()) this.moveRailRight(); }));
  }
  moveRailRight() {
    const P = this.P();
    if (P.mr && P.mh) { const y = P.mh.worldPos()[1]; P.mr.setWorldPos(this.minX, y); }
    if (P.mr) this.moveX(P.mr, this.maxX, this.hs());
    this.moveX(P.h, this.maxX, this.hs(), () => this.moveRailUpOneStep(() => { if (!this.afterPass()) this.moveRailLeft(); }));
  }
  moveRailUpOneStep(cb) {
    const P = this.P(); const s = P.v.worldPos()[1], t = s + 0.2;
    this.tween({ dur: 0.2 / this.vs(), ease: EZ.linear, update: (v) => this.wy(P.v, s + (t - s) * v), done: () => { if (P.v.worldPos()[1] >= this.maxY - 1e-4) this.stopSig = true; cb(); } });
  }
  speedUp() { this.kill(); this.isSpeedUp = true; this.moveRailLeft(); }
}
S['Clicker.PrinterRail'] = PrinterRail;
class Printer2DButton extends E.Behaviour {
  init(machine) {
    if (this._inited) return; this._inited = true;
    fixWorldCanvases(this.go); this.go._forceGR = true;
    this.start_ = G.btn(this.ref('_startButton'));
    G.onClick(this.start_, () => machine.onPrinterButtonClick());
    G.onClick(this.ref('_speedUpButton'), () => machine.rail().speedUp());
  }
  setStartInteractable(b) { if (this.start_) this.start_.interactable = b; }
}
S['Clicker.Printer2DButton'] = Printer2DButton;
class PrinterMachine extends E.Behaviour {
  rail() { return this.ref('_printerRail'); }
  process() { return this.ref('_printerProcess'); }
  btn2d() { const b = this.ref('_printer2DButton'); if (b && b.init) b.init(this); return b; }
  awake() {
    this.btn2d();
    const p = this.process(); if (p) { p.resetStatus(); p.onMachineStateChange(false); }
    this.handTut = this.go.find('hand_tutorial_temp');
    this.t = 0;
  }
  changeBaseKeycap(prefab) {
    if (!this.cur) this.cur = this.ref('_currentBasePrinter');
    if (this.cur && this.cur.go && !this.cur.go.destroyed) E.destroy(this.cur.go);
    const holder = goOf(this.ref('_tfBasePrinterKeycapHolder'));
    const c = E.spawn(prefab, holder); const g = goOf(c) || c;
    if (g) { g.x = 0; g.y = 0; g.sx = g.sy = 1; }
    this.cur = (g && g.comp('Clicker.BasePrinterObject')) || c;
    this.onBaseKeycapChange();
  }
  onBaseKeycapChange() {
    const r = this.rail(); const c = this.cur; if (!r || !c || !c.top || !c.bottom) return;
    r.setLimit(c.bottom.worldPos()[1], c.top.worldPos()[1]); r.resetRails();
  }
  resetStatus() { this.isProcessing = false; const p = this.process(); if (p) { p.resetStatus(); p.onMachineStateChange(false); } const r = this.rail(); if (r) r.resetRails(); vis(this.handTut, true); }
  content() { const s = scr(); return s ? s.ref('_printer3DUIContent') : null; }
  onPrinterButtonClick() {
    if (this.isProcessing) return;
    snd(34);
    if (this.loop) this.loop.stop();
    this.loop = snd(33, { loop: true });
    vis(this.handTut || this.go.find('hand_tutorial_temp'), false);
    const b = this.btn2d(); if (b) b.setStartInteractable(false);
    const p = this.process(); if (p) { p.resetStatus(); p.onMachineStateChange(true); }
    const r = this.rail(); r.resetRails();
    this.isProcessing = true; this.t = 0;
    const ct = this.content(); if (ct) ct.showBtnSpeedUp(true);
    r.startMoveRail(() => {
      if (this.loop) { this.loop.stop(); this.loop = null; }
      snd(32, { vol: 0.3 });
      const c2 = this.content(); if (c2) c2.showBtnSpeedUp(false);
      const s = scr(); if (s) s.showBtnNext(true);
      if (p) { p.setProcess(100); p.onMachineStateChange(false); }
      this.isProcessing = false;
    });
  }
  update(dt) {
    if (!this.isProcessing) return;
    this.t += dt;
    if (this.t >= 0.1) { this.t = 0; const p = this.process(), r = this.rail(); if (p && r) p.setProcess(r.progress); }
  }
  onDisable() { if (this.loop) { this.loop.stop(); this.loop = null; } }
  onDestroy() { if (this.loop) { this.loop.stop(); this.loop = null; } }
}
S['Clicker.PrinterMachine'] = PrinterMachine;

class Printer3DUIContent extends E.Behaviour {
  init(screen) {
    this.scr = screen;
    this.panel = goOf(this.ref('_panel')); if (this.panel) this.panel.setActive(false);
    this.btn = G.btn(this.ref('_btnSpeedUp'));
    if (!this._wired) { this._wired = true; G.onClick(this.btn, () => this.onBtnSpeedUpClick()); }
  }
  showContent() {
    const s = this.scr || scr();
    vis(this.panel, true);
    this.showBtnSpeedUp(false);
    s.registerButtonNextEvent(() => { s.showBtnNext(false); this.hideContent(); if (kmc) kmc.hidePrinterShowTray(); s.goToStepSwitch(); });
    s.setBtnNextPosition(goOf(this.ref('_btnNextPos')));
    const fx = this.ref('_emojiFx'); if (fx) E.psPlay(fx);
    vis(this.ref('_chatInput'), true);
    const ch = this.ref('_commentHandler'); if (ch) ch.IsEnableToSpawnComment = true;
    vis(this.ref('_iconCoin'), !user().IsFirstGame);
  }
  showBtnSpeedUp(b) { vis(this.btn, b); }
  onBtnSpeedUpClick() {
    if (user().IsFirstGame) { if (kmc) kmc.speedUpPrinter(); this.showBtnSpeedUp(false); return; }
    if (G.money() >= 100) { if (kmc) kmc.speedUpPrinter(); this.showBtnSpeedUp(false); snd(47); G.addMoney(-100); }
    else G.notEnough();
  }
  hideContent() {
    vis(this.panel, false);
    const fx = this.ref('_emojiFx'); if (fx) E.psStop(fx, true);
    const ch = this.ref('_commentHandler'); if (ch) ch.IsEnableToSpawnComment = false;
  }
}
S['Clicker.Printer3DUIContent'] = Printer3DUIContent;

// ================================================================== IngameClickerScreen
class IngameClickerScreen extends E.ScreenBase {
  onInit() {
    this.btnNext = G.btn(this.ref('_btnNext')); this.goNext = goOf(this.btnNext);
    G.onClick(this.btnNext, () => { G.click(); if (this._next) this._next(); });
    G.onClick(this.ref('_btnHome'), () => this.onBtnHomeClick());
    this.hand = goOf(this.ref('_tfHandTutorial'));
    this.panels = {};
    for (const k of ['_selectBaseKeycapPanel', '_selectSwitchPanel', '_selectKeycapPanel', '_decorKeycapPanel', '_selectKeychainPanel']) { const p = this.ref(k); this.panels[k] = p; if (p && p.init) p.init(this); }
    this.printer = this.ref('_printer3DUIContent'); if (this.printer && this.printer.init) this.printer.init(this);
    this.color = this.ref('_popupSelectColor'); if (this.color && this.color.init) this.color.init();
  }
  onShow() {
    vis(this.ref('_btnHome'), !user().IsFirstGame);
    const p = this.panels._selectBaseKeycapPanel; if (p) p.showPanel();
    this.showBtnNext(false);
  }
  update() {
    const g = this._nextPos;
    if (g && g.wm && this.goNext && this.goNext.activeSelf) { const p = uiPos(g); uiPlaceAt(this.goNext, p[0], p[1]); }
    if (this._tutT && this.hand && this.hand.activeSelf && this._tutT.wm) { const p = uiPos(this._tutT); uiPlaceAt(this.hand, p[0], p[1]); }
  }
  registerButtonNextEvent(fn) { this._next = fn; }
  showBtnNext(b) { vis(this.goNext, b); if (b) this.update(); }
  setBtnNextPosition(g) { this._nextPos = g; this.update(); }
  goToStepPrinter() { if (this.printer) this.printer.showContent(); }
  goToStepSwitch() { this.panels._selectSwitchPanel.showPanel(); }
  goToStepKeycap() { this.panels._selectKeycapPanel.showPanel(); }
  goToStepDecorKeycap() { if (this.color) this.color.hide(); this.panels._decorKeycapPanel.showPanel(); }
  goToStepSelectKeychain() { this.panels._selectKeychainPanel.showPanel(); }
  showPopupColor(tf) { if (this.color) this.color.showAt(tf, 0); }
  hidePopupColor() { if (this.color) this.color.hide(); }
  onBtnHomeClick() { G.click(); if (E.ui) E.ui.showPopup('Clicker.BackHomePopup'); }
  showTutorialAt(t) { if (!user().IsFirstClicker || !this.hand || !t) return; this._tutT = t; const p = uiPos(t); uiPlaceAt(this.hand, p[0], p[1]); this.hand.setActive(true); }
  hideTutorial() { this._tutT = null; vis(this.hand, false); }
}
S['Clicker.IngameClickerScreen'] = IngameClickerScreen;

// ================================================================== selection item (ClickerUIItem + subclasses)
class ClickerUIItem extends E.Behaviour {
  P() {
    if (!this._p) {
      const f = (n) => this.go.find(n);
      const coin = f('CoinLock');
      this._p = { sel: f('Selected'), notSel: f('NotSelected'), check: f('Check'), ad: f('AdLock'), coin, other: f('OtherLock'),
        icon: (f('Icon') && f('Icon').comp('Img')) || this.ref('_imgIcon'), price: (coin && coin.compInChildren('Txt')) || E.txtOf(this.ref('_txtCoinPrice')), btn: this.go.comp('Btn') };
    }
    return this._p;
  }
  get ID() { return this._id; }
  get iconSprite() { const i = this.P().icon; return i ? i.sp : null; }
  setData(id, icon) { this._id = id; const i = this.P().icon; if (i) i.sp = icon; this.unlocked = false; }
  setType(t) { this.type = t; }
  setSelected(b) { const P = this.P(); vis(P.sel, b); vis(P.check, b); vis(P.notSel, !b); }
  setUnlockStatus(type, value, userUnlocked) {
    const P = this.P();
    this.price = value; this.status = type; this.unlocked = userUnlocked;
    if (userUnlocked) { vis(P.ad, false); vis(P.coin, false); vis(P.other, false); this.status = 0; return; }
    vis(P.ad, type === 1); vis(P.coin, type === 2); vis(P.other, type >= 3);
    if (type === 2 && P.price) P.price.text = String(value);
  }
  registerClickListener(onUse) { const b = this.P().btn; if (b) b.onClick = [() => this.onItemClick(onUse)]; }
  playClickSound() { G.click(); }
  onItemClick(onUse) {
    this.playClickSound();
    const st = this.status;
    if (st === 0) { this.setSelected(true); onUse(this._id); }
    else if (st === 1) { this.setSelected(true); onUse(this._id); this.updateVisualUnlock(); } // rewarded ad = free
    else if (st === 2) {
      if (G.money() >= this.price) { snd(47); G.addMoney(-this.price); this.setSelected(true); onUse(this._id); this.updateVisualUnlock(); }
      else G.notEnough();
    } else { const p = E.ui && E.ui.showPopup('Clicker.PopupItemLocked'); if (p && p.showWithItem) p.showWithItem(this.iconSprite); }
  }
  updateVisualUnlock() { const P = this.P(); this.status = 0; vis(P.ad, false); vis(P.coin, false); vis(P.other, false); }
}
S['Clicker.ClickerUIItem'] = ClickerUIItem;
for (const n of ['BaseKeycapUIItem', 'KeycapUIItem', 'KeychainUIItem', 'DecorKeycapUIItem']) S['Clicker.' + n] = class extends ClickerUIItem {};
S['Clicker.SwitchUIItem'] = class SwitchUIItem extends ClickerUIItem { playClickSound() {} };

class CategoryButton extends E.Behaviour {
  setSelected(b) { vis(this.go.find('Selected'), b); const ic = goOf(this.ref('_tfIcon')); if (ic) ic.sx = ic.sy = b ? 1 : 0.85; }
  get button() { return G.btn(this.ref('_buttonThis')) || this.go.comp('Btn'); }
}
S['Clicker.CategoryButton'] = CategoryButton;

// ================================================================== selection panels
class ClickerPanel extends E.Behaviour {
  awake() { this.setup(); }
  init(s) { this.scr = s; this.setup(); }
  get S() { return this.scr || scr(); }
  setup() {
    if (this._set) return; this._set = true;
    this.list = [];
    this.panel = goOf(this.ref('_thisPanelRect'));
    this.showPos = goOf(this.ref('_rtShowPos')); this.hidePos = goOf(this.ref('_rtHidePos'));
    this.nextPos = goOf(this.ref('_btnNextPos'));
    if (this.panel && this.hidePos) { this.panel.rt[4] = this.hidePos.rt[4]; this.panel.rt[5] = this.hidePos.rt[5]; }
    if (this.panel) { this.panel.setActive(false); fixScrollViewports(this.panel); }
    this.loadData();
  }
  loadData() {
    const tpl = goOf(this.ref(this.tplField)); if (!tpl) return;
    const data = cfgList(this.cfgKey);
    data.forEach((dt, i) => {
      let it = this.list[i];
      if (!it) { const g = E.instantiate(tpl, tpl.parent); it = g.comps.find((c) => c instanceof ClickerUIItem); this.list.push(it); }
      it.setData(dt.Id, dt.Icon);
      if (it.setType) it.setType(dt.Type);
      const um = dt.UnlockMethod || { Type: 0, Value: 0 };
      it.setUnlockStatus(um.Type, um.Value, hasUnlocked(UNL[this.cfgKey], dt.Id) || um.Type === 0);
      it.go.setActive(true);
      it.setSelected(false);
      it.registerClickListener((id) => this.onUse(id));
    });
    for (let i = data.length; i < this.list.length; i++) this.list[i].go.setActive(false);
  }
  showPanel() {
    const p = this.panel; if (!p) return;
    p.setActive(true); E.killOwner(p);
    const t = this.showPos ? [this.showPos.rt[4], this.showPos.rt[5]] : [0, 0];
    E.moveTo(p, t[0], t[1], 0.5, { ease: EZ.outSine, done: () => this.tutorial() });
    const s = this.S; s.registerButtonNextEvent(() => this.next()); s.setBtnNextPosition(this.nextPos);
  }
  hidePanel() {
    const p = this.panel; if (!p) return; E.killOwner(p);
    const t = this.hidePos ? [this.hidePos.rt[4], this.hidePos.rt[5]] : [0, -1090];
    E.moveTo(p, t[0], t[1], 0.5, { ease: EZ.inSine, done: () => p.setActive(false) });
  }
  tutorial() { if (this.tutShown) return; const f = this.list.find((i) => i.go.activeSelf); if (f) this.S.showTutorialAt(f.go); }
  doneTut() { this.tutShown = true; this.S.hideTutorial(); }
  onItemSelect(id) { for (const it of this.list) it.setSelected(it.go.activeSelf && it.ID === id); }
  dataOf(id) { return byId(this.cfgKey, id); }
}
class SelectBaseKeycapPanel extends ClickerPanel {
  get tplField() { return '_baseKeycapUIItem'; } get cfgKey() { return 'base'; }
  onUse(id) { unlock(UNL.base, id); if (kmc) kmc.setBaseKeycapId(id); this.S.showBtnNext(true); this.onItemSelect(id); this.doneTut(); }
  next() { const s = this.S; this.hidePanel(); s.showBtnNext(false); if (kmc) { kmc.hidePreviewShowPrinter(); kmc.spawnAssembleKeycap(); } s.goToStepPrinter(); }
}
S['Clicker.SelectBaseKeycapPanel'] = SelectBaseKeycapPanel;
class SelectSwitchPanel extends ClickerPanel {
  get tplField() { return '_switchUIItem'; } get cfgKey() { return 'sw'; }
  onUse(id) {
    unlock(UNL.sw, id); if (kmc) kmc.spawnSwitch(id);
    const d = this.dataOf(id); const s = parseSound(d && d.SoundName);
    if (s) { snd(s); if (kmc) kmc.setSwitchSound(s); }
    this.S.showBtnNext(true); this.onItemSelect(id); this.doneTut();
  }
  next() { const s = this.S; this.hidePanel(); s.showBtnNext(false); s.goToStepKeycap(); }
}
S['Clicker.SelectSwitchPanel'] = SelectSwitchPanel;
class SelectKeycapPanel extends ClickerPanel {
  get tplField() { return '_keycapUIItem'; } get cfgKey() { return 'kc'; }
  onUse(id) {
    unlock(UNL.kc, id); if (kmc) kmc.spawnKeycap(id);
    const s = this.S; s.showBtnNext(true);
    const it = this.list.find((x) => x.ID === id); if (it) s.showPopupColor(it.go);
    this.onItemSelect(id); this.doneTut();
  }
  next() { const s = this.S; this.hidePanel(); s.showBtnNext(false); s.hidePopupColor(); s.goToStepDecorKeycap(); if (kmc) kmc.showStepDecorKeycap(); }
}
S['Clicker.SelectKeycapPanel'] = SelectKeycapPanel;
class SelectKeychainPanel extends ClickerPanel {
  get tplField() { return '_keychainUIItem'; } get cfgKey() { return 'kch'; }
  onUse(id) { unlock(UNL.kch, id); if (kmc) kmc.setKeychain(id); this.S.showBtnNext(true); this.onItemSelect(id); this.doneTut(); }
  next() { const s = this.S; this.hidePanel(); s.showBtnNext(false); s.hidePopupColor(); if (kmc) kmc.prepareAssembleStep(); }
}
S['Clicker.SelectKeychainPanel'] = SelectKeychainPanel;
class DecorKeycapPanel extends ClickerPanel {
  get tplField() { return '_decorKeycapUIItem'; } get cfgKey() { return 'decor'; }
  setup() {
    if (this._set) return;
    super.setup();
    this.cats = this.refs('_listCategoryBtn').filter(Boolean);
    this.btnCharm = this.ref('_btnCharm'); this.btnReplace = this.ref('_btnReplace'); this.btnPaint = this.ref('_btnPaint');
    if (this.btnCharm) G.onClick(this.btnCharm.button, () => this.onCategory(this.btnCharm, () => this.showListDecorOnTop()));
    if (this.btnReplace) G.onClick(this.btnReplace.button, () => this.onCategory(this.btnReplace, () => this.showListDecorReplace()));
    if (this.btnPaint) G.onClick(this.btnPaint.button, () => G.click());
  }
  showPanel() {
    super.showPanel();
    this.S.showBtnNext(true);
    for (const c of this.cats) c.setSelected(false);
    if (this.btnCharm) this.btnCharm.setSelected(true);
    this.showListDecorOnTop();
  }
  onCategory(btn, show) {
    G.click();
    for (const c of this.cats) c.setSelected(false);
    btn.setSelected(true); show();
    const sc = this.ref('_scrollRect'); const content = sc && (E.resolve(sc.go, sc.content) || null);
    const cg = goOf(content) || (sc && sc.go.find('Viewport/Content'));
    if (cg && cg.rt) { const f = cg.rt[5]; E.killOwner(cg); E.tween({ dur: 0.2, ease: EZ.outSine, owner: cg, update: (v) => { cg.rt[5] = f * (1 - v); } }); }
  }
  showListDecorOnTop() { for (const it of this.list) it.go.setActive(it.type === 1); }
  showListDecorReplace() { for (const it of this.list) it.go.setActive(it.type === 2 || it.type === 4); }
  deselectAll() { for (const it of this.list) if (it.go.activeSelf) it.setSelected(false); }
  onUse(id) {
    unlock(UNL.decor, id);
    const d = this.dataOf(id); if (d && kmc) kmc.setKeycapDecor(id, d.Sprite, d.Type);
    this.S.showBtnNext(true); this.onItemSelect(id); this.deselectAll();
    if (kmc) kmc.jumpToNextKeycap();
    this.doneTut();
  }
  next() { const s = this.S; s.showBtnNext(false); s.goToStepSelectKeychain(); if (kmc) kmc.showSelectKeychain(); this.hidePanel(); }
}
S['Clicker.DecorKeycapPanel'] = DecorKeycapPanel;

// ================================================================== PopupSelectColor
class PopupSelectColor extends E.Behaviour {
  awake() { this.init(); }
  init() {
    if (this._i) return; this._i = true;
    this.cg = this.ref('_canvasGroup'); if (this.cg) { this.cg.alpha = 0; this.cg.ia = false; this.cg.br = false; }
    this.panel = goOf(this.ref('_tfPanel')); this.sub = goOf(this.ref('_tfSubPanel')); this.sel = goOf(this.ref('_selected'));
    this.btns = this.refs('_colorButton').map(G.btn).filter(Boolean);
    this.btns.forEach((b, i) => b.onClick.push(() => this.onButtonClick(i)));
  }
  update() {
    if (!this._target || !this.panel) return;
    uiPlaceAt(this.panel, this._target[0], this._target[1]);
    if (this.sub && this.sub.wm && this.go.wm) uiPlaceAt(this.sub, this.go.wm[4], this.sub.wm[5]);
  }
  showAt(parent, idx) {
    this.init();
    this.showing = true;
    this._target = uiPos(goOf(parent)); this.update();
    if (this.cg) { E.killOwner(this.cg.go); E.fadeTo(this.cg, 1, 0.3, { ease: EZ.outSine, done: () => { this.cg.ia = true; this.cg.br = true; } }); }
    this.selectedIndex = idx;
    this.onButtonClick(idx);
  }
  onButtonClick(i) {
    G.click();
    if (kmc) kmc.setKeycapColor(i);
    const b = this.btns[i]; if (b && this.sel) { this.sel.setParent(b.go, false); this.sel.rt[4] = 0; this.sel.rt[5] = 0; }
  }
  hide() {
    this.showing = false;
    if (!this.cg) return;
    this.cg.ia = false; this.cg.br = false; E.killOwner(this.cg.go);
    E.fadeTo(this.cg, 0, 0.3, { ease: EZ.inSine, done: () => { this._target = null; } });
  }
}
S['Clicker.PopupSelectColor'] = PopupSelectColor;

// ================================================================== assembly drag & drop
class DraggableClickerItem extends E.Behaviour {
  awake() { this.base_(); }
  base_() {
    if (this._b) return; this._b = true;
    if (this.allowDrag == null) this.allowDrag = !!this.d._allowDrag;
    this.isDone = false; this.dropped = -1; this.fb = [this.go.x, this.go.y];
  }
  get collider() { return this.ref('_collider') || this.go.comps.find((c) => c.t === 'Box'); }
  get sortOrder() { return this.d._sortOrder || 0; }
  get dragType() { return this.d._dragType || 0; }
  hit(wx, wy) {
    const c = this.collider; if (!c || c.enabled === false || !this.go.activeInHierarchy) return false;
    const m = (c.go || this.go).worldMatrix(); if (Math.abs(m[0] * m[3] - m[1] * m[2]) < 1e-8) return false; // zero-scale (hidden) parts
    return E.ptInCollider(c, c.go || this.go, wx, wy);
  }
  updateFallback() { this.base_(); this.fb = [this.go.x, this.go.y]; }
  onPickUp() { this.go.sx = this.go.sy = 0.9; this.playSoundPickUp(); }
  playSoundPickUp() { snd(51); }
  setDone() { this.isDone = true; }
  activeDragAgain() { this.isDone = false; }
  onDropped(i) {
    this.go.sx = this.go.sy = 1;
    if (this.isDone) { this.dropped = i; this.allowDrag = false; this.go.setActive(false); }
    else { this.go.x = this.fb[0]; this.go.y = this.fb[1]; }
  }
}
S['Clicker.DraggableClickerItem'] = DraggableClickerItem;
S['Clicker.DraggableSwitch'] = class DraggableSwitch extends DraggableClickerItem {};
S['Clicker.DraggableKeychain'] = class DraggableKeychain extends DraggableClickerItem {};
class DraggableKeycap extends DraggableClickerItem {
  srs() { return this.refs('_srVisual').filter(Boolean); }
  onPickUp() {
    this.base_();
    this.go.sx = this.go.sy = 0.9;
    for (const s of this.srs()) setA(s, 1);
    this.isDone = false;
    if (this.dropped < 0) snd(51);
    else if (kmc && kmc.base) kmc.base.pullBackKeycap(this.dropped);
    this.dropped = -1;
  }
  playSoundPickUp() {}
  onDropped(i) {
    this.go.sx = this.go.sy = 1;
    if (this.isDone) { this.dropped = i; for (const s of this.srs()) setA(s, 0); }
    else { this.go.x = this.fb[0]; this.go.y = this.fb[1]; }
  }
}
S['Clicker.DraggableKeycap'] = DraggableKeycap;

class DragManager extends E.Behaviour {
  L() {
    if (!this._L) this._L = { sw: this.refs('_switchList').filter(Boolean), kch: this.refs('_keychainList').filter(Boolean), kc: this.refs('_keycapList').filter(Boolean), hold: goOf(this.ref('_tfCurrentHolding')) };
    return this._L;
  }
  all() { const L = this.L(); return L.sw.concat(L.kch, L.kc); }
  awake() { this.handOffset = [-0.4, 1.5]; if (this.allow == null) this.allow = false; }
  onEnable() { this.h = E.input.on((t, ev) => this.onInput(t, ev)); }
  onDisable() { E.input.off(this.h); this.cur = null; }
  setBaseKeycapChecking(b) { this.base = b; }
  setDraggable(b) { for (const it of this.all()) { it.base_(); it.allowDrag = b; } this.allow = b; }
  updateFallbackPosition() { for (const it of this.all()) it.updateFallback(); }
  pick(wx, wy) {
    let best = null;
    for (const it of this.all()) { if (!it.allowDrag || !it.hit(wx, wy)) continue; if (!best || it.sortOrder > best.sortOrder) best = it; }
    return best;
  }
  onInput(t, ev) {
    if (!this.allow) return;
    if (t === 'down') {
      if (this.cur) return;
      const it = this.pick(ev.wx, ev.wy); if (!it) return;
      this.cur = it; this.oldParent = it.go.parent;
      reparentKeep(it.go, this.L().hold || null);
      const p = it.go.worldPos();
      this.offset = [p[0] - ev.wx + this.handOffset[0], p[1] - ev.wy + this.handOffset[1]];
      it.onPickUp(); vib(50);
      if (kmc) kmc.showDragHandTutorial(false);
      it.go.setWorldPos(ev.wx + this.offset[0], ev.wy + this.offset[1]);
    } else if (t === 'move' && this.cur) {
      this.cur.go.setWorldPos(ev.wx + this.offset[0], ev.wy + this.offset[1]);
    } else if (t === 'up' && this.cur) {
      const it = this.cur;
      it.go.setWorldPos(ev.wx + this.offset[0], ev.wy + this.offset[1]);
      reparentKeep(it.go, this.oldParent);
      vib(50);
      this.checkLogic(it);
      this.cur = null;
    }
  }
  checkLogic(it) {
    const b = this.base || (kmc && kmc.base); if (!b) { it.onDropped(-1); return; }
    const type = it.dragType;
    if (type === 0) {
      const i = b.checkDropSwitch(it.go, 3.0);
      if (i >= 0) { it.setDone(); b.dropSwitchReal(i); it.onDropped(i); snd(52); } else it.onDropped(-1);
    } else if (type === 1) {
      const i = b.checkDropKeycap(it.go, 2.5);
      if (i >= 0) {
        it.setDone(); b.dropKeycapReal(i, it.go.comp('Clicker.KeycapObject')); it.onDropped(i);
        const p = b.getPosKeycap(i); if (p) it.go.setWorldPos(p[0], p[1]);
        snd(52);
      } else it.onDropped(-1);
    } else if (type === 2) {
      if (b.checkDropKeychain(it.go, 2.0)) { b.activeKeychain(); it.setDone(); it.onDropped(0); snd(52); } else it.onDropped(-1);
    } else it.onDropped(-1);
  }
}
S['Clicker.DragManager'] = DragManager;

// ================================================================== tutorials
class TutorialDrag extends E.Behaviour {
  P() { if (!this._P) this._P = { sr: this.ref('_srHand'), hand: goOf(this.ref('_tfHand')), appear: goOf(this.ref('_appearPos')), moves: this.refs('_movePos').map(goOf).filter(Boolean), end: goOf(this.ref('_endPos')) }; return this._P; }
  awake() { setA(this.P().sr, 0); }
  show() {
    this.hide();
    const P = this.P(); const sr = P.sr, h = P.hand; if (!sr || !h || !P.appear) return;
    const sp = this.d._moveSpeed || 0.5;
    const run = () => {
      const ap = P.appear.worldPos(); h.setWorldPos(ap[0], ap[1]); setA(sr, 0);
      const pts = P.moves.concat(P.end ? [P.end] : []).map((g) => g.worldPos());
      const step = (i) => {
        if (i >= pts.length) { this.tween({ dur: 0.5, update: (v) => setA(sr, 1 - v), done: run }); return; }
        const s = h.worldPos(), t = pts[i];
        this.tween({ dur: sp, ease: EZ.linear, update: (v) => h.setWorldPos(s[0] + (t[0] - s[0]) * v, s[1] + (t[1] - s[1]) * v), done: () => step(i + 1) });
      };
      this.tween({ dur: 0.5, update: (v) => setA(sr, v), done: () => step(0) });
    };
    run();
  }
  hide() { this.kill(); setA(this.P().sr, 0); }
}
S['Clicker.TutorialDrag'] = TutorialDrag;
class TutorialSelectKeycapBase extends E.Behaviour {
  awake() { const tc = this.go.find('TextCanvas'); if (tc) fixWorldCanvases(tc); }
  showWithAnim() { this.go.setActive(true); const tc = this.go.find('TextCanvas'); if (tc) fixWorldCanvases(tc); this.cur = this.cur || 0; this.step(); }
  step() {
    const t = goOf(this.ref('_tfPreviewKeycap')), sr = this.ref('_srPreviewKeycap'); if (!t) return;
    const spr = this.refs('_previewSprite').map((x) => (x && x.sprite) || x);
    E.scaleTo(t, 0, 0.1, { delay: 1.5, owner: this, done: () => {
      if (sr && spr.length) { sr.sp = spr[this.cur % spr.length]; this.cur = (this.cur + 1) % spr.length; }
      E.scaleTo(t, 1, 0.3, { ease: EZ.outBack, owner: this, done: () => this.step() });
    } });
  }
  hideTutorial() { this.kill(); this.go.setActive(false); }
}
S['Clicker.TutorialSelectKeycapBase'] = TutorialSelectKeycapBase;

// ================================================================== livestream (10 s clicking)
class ScreenClickerLivestream extends E.ScreenBase {
  onInit() {
    G.onClick(this.ref('_btnHome'), () => { G.click(); if (E.ui) E.ui.showPopup('Clicker.BackHomePopup'); });
    this.procBG = this.go.find('ProcessBG');
  }
  onShow() { vis(this.ref('_btnHome'), !user().IsFirstGame); this.startLive(); }
  startLive() {
    G.click(); vib(30);
    const fx = this.ref('_emojiFx'); if (fx) E.psPlay(fx);
    vis(this.ref('_chatInput'), true);
    if (kmc) kmc.showTapHandTutorial(true);
    const ch = this.ref('_commentHandler'); if (ch) ch.IsEnableToSpawnComment = true;
    vis(this.procBG, true);
    const img = this.ref('_imgProcess');
    if (img) { img.fa = 0; this.tween({ dur: this.d._liveTime || 10, ease: EZ.linear, update: (v) => { img.fa = v; } }); }
    this.after(this.d._liveTime || 10, () => {
      vis(this.procBG, false);
      if (kmc) kmc.showTapHandTutorial(false);
      this.hide();
      if (kmc) kmc.moveResultToComplete(() => { kmc.showHandComplete(); if (E.ui) E.ui.showPopup('Clicker.PopupClickerComplete'); });
    });
  }
  onHide() {
    const fx = this.ref('_emojiFx'); if (fx) E.psStop(fx, true);
    const ch = this.ref('_commentHandler'); if (ch) ch.IsEnableToSpawnComment = false;
  }
}
S['Clicker.ScreenClickerLivestream'] = ScreenClickerLivestream;
S['Clicker.ClickerLivestreamController'] = class ClickerLivestreamController extends E.Behaviour { playLiveCamera() {} };

// ================================================================== popups
const confettiOn = (c, on) => { if (!c) return; const g = goOf(c); if (on) { if (g) g.setActive(true); if (c.play) c.play(); } else { if (c.stop) c.stop(); if (g) g.setActive(false); } };
class PopupDoneAssemble extends E.PopupBase {
  onInit() {
    this.noPanelAnim = true;
    this.btn = G.btn(this.ref('_btnContinue'));
    G.onClick(this.btn, () => {
      G.click(); this.hide();
      if (kmc) kmc.moveResultToCenter();
      if (E.ui) E.ui.showScreen('Clicker.ScreenClickerLivestream');
    });
  }
  onShow() { snd(45); confettiOn(this.ref('_fxConfetti'), true); }
  onHide() { confettiOn(this.ref('_fxConfetti'), false); }
}
S['Clicker.PopupDoneAssemble'] = PopupDoneAssemble;
class PopupClickerComplete extends E.PopupBase {
  onInit() {
    this.noPanelAnim = true;
    this.reward = 500; this.bonus = 100;
    confettiOn(this.ref('_fxConfetti'), false);
    this.bR = G.btn(this.ref('_btnReward')); this.bA = G.btn(this.ref('_btnAdReward'));
    G.onClick(this.bR, () => this.onBtnRewardClick());
    G.onClick(this.bA, () => this.onBtnAdRewardClick());
  }
  setButtons(b) { if (this.bR) this.bR.interactable = b; if (this.bA) this.bA.interactable = b; }
  onShow() {
    snd(48);
    confettiOn(this.ref('_fxConfetti'), true);
    [['_tfTitle', 0], ['_tfCompliment', 0.5], ['_tfRewardInfo', 0.75], ['_tfBtnAdReward', 1.0], ['_tfBtnReward', 1.5]].forEach(([k, d]) => {
      const g = goOf(this.ref(k)); if (!g) return; E.killOwner(g); g.sx = g.sy = 0; E.scaleTo(g, 1, 0.3, { ease: EZ.outBack, delay: d });
    });
    const te = E.txtOf(this.ref('_txtEarnings')); if (te) te.text = '+' + this.reward;
    const tt = E.txtOf(this.ref('_txtTips')); if (tt) tt.text = '+' + this.bonus;
    const u = user();
    if (u.IsFirstClicker) { u.IsFirstGame = false; u.IsFirstClicker = false; }
    u.ClickerPlayTime = (u.ClickerPlayTime || 0) + 1;
    G.save();
    const av = E.so(this.d._viewerAvatarAsset); const img = this.ref('_imgCustomer');
    if (img && av && av.Avatars && av.Avatars.length) img.sp = E.pick(av.Avatars);
    this.setButtons(true);
    if (kmc) kmc.trySaveKeycapToDatabase();
  }
  finish() { releaseAllGlow(); G.goto('Home'); }
  onBtnRewardClick() {
    G.click(); this.setButtons(false);
    const u = user(); u.ClickerRewardClaimCount = Math.min((u.ClickerRewardClaimCount || 0) + 1, 4); G.save();
    G.collectMoney(this.reward + this.bonus, 10, () => this.finish());
  }
  onBtnAdRewardClick() { G.click(); this.setButtons(false); G.collectMoney((this.reward + this.bonus) * 2, 10, () => this.finish()); }
  onHide() { confettiOn(this.ref('_fxConfetti'), false); }
}
S['Clicker.PopupClickerComplete'] = PopupClickerComplete;
class CollectionFullPopup extends E.PopupBase {
  panel() { return goOf(this.ref('_tfPanel')); }
  onInit() {
    this.panelDur = 0.3;
    this.btns = ['_btnWatchAds', '_btnCoin', '_btnClose', '_btnClose2'].map((k) => G.btn(this.ref(k)));
    const [w, c, x1, x2] = this.btns;
    G.onClick(w, () => { this.setButtons(false); G.click(); const f = this.onBuy; this.hide(); if (f) f(); });
    G.onClick(c, () => {
      this.setButtons(false); G.click();
      if (G.money() >= this.price) { G.addMoney(-this.price); const f = this.onBuy; this.hide(); if (f) f(); }
      else { this.setButtons(true); G.notEnough(); }
    });
    for (const b of [x1, x2]) G.onClick(b, () => { G.click(); this.hide(); });
    this.price = 500;
  }
  setButtons(b) { for (const x of this.btns) if (x) x.interactable = b; }
  setEventCallback(onBuy, price) { this.onBuy = onBuy; this.price = price; const t = E.txtOf(this.ref('_txtCoinPrice')); if (t) t.text = String(price); return this; }
  onShow() { this.setButtons(false); E.after(0.3, () => this.setButtons(true), this); if (G.moneyMgr) G.moneyMgr.showUp(); }
  onHide() { if (G.moneyMgr) G.moneyMgr.backToParent(); }
}
S['Clicker.CollectionFullPopup'] = CollectionFullPopup;
S['Clicker.UnlockSlotPopup'] = class UnlockSlotPopup extends CollectionFullPopup {};
class PopupItemLocked extends E.PopupBase {
  panel() { return goOf(this.ref('_tfPanel')); }
  onInit() {
    this.panelDur = 0.2;
    this.btn = G.btn(this.ref('_btnClose'));
    G.onClick(this.btn, () => { G.click(); if (this.btn) this.btn.interactable = false; const p = this.panel(); if (p) { E.killOwner(p); p.sx = p.sy = 0; } this.hide(); });
  }
  showWithItem(spr) { const im = this.ref('_imgItem'); const img = im && (im.t === 'Img' ? im : goOf(im) && goOf(im).comp('Img')); if (img && spr) img.sp = spr; return this; }
  onShow() { if (this.btn) this.btn.interactable = false; E.after(0.2, () => { if (this.btn) this.btn.interactable = true; }, this); }
}
S['Clicker.PopupItemLocked'] = PopupItemLocked;
class CreateMorePopup extends E.PopupBase {
  panel() { return goOf(this.ref('_tfPanel')); }
  onInit() {
    this.panelDur = 0.3;
    this.btns = ['_btnCreateMore', '_btnNoThank', '_btnClose'].map((k) => G.btn(this.ref(k)));
    G.onClick(this.btns[0], () => { G.click(); this.setButtons(false); releaseAllGlow(); G.goto('ModeClicker'); });
    for (const b of this.btns.slice(1)) G.onClick(b, () => { G.click(); this.hide(); });
  }
  setButtons(b) { for (const x of this.btns) if (x) x.interactable = b; }
  onShow() { this.setButtons(false); E.after(0.3, () => this.setButtons(true), this); }
}
S['Clicker.CreateMorePopup'] = CreateMorePopup;
class DeleteKeycapPopup extends E.PopupBase {
  panel() { return goOf(this.ref('_tfPanel')); }
  onInit() {
    this.panelDur = 0.3;
    G.onClick(this.ref('_btnDelete'), () => { G.click(); const f = this.onConfirm; this.hide(); if (f) f(); });
    for (const k of ['_btnClose', '_btnClose2']) G.onClick(this.ref(k), () => { G.click(); this.hide(); });
  }
  setEventCallback(fn) { this.onConfirm = fn; return this; }
  onShow() { vis(this.ref('_deleteCamera'), true); }
  onHide() { vis(this.ref('_deleteCamera'), false); }
}
S['Clicker.DeleteKeycapPopup'] = DeleteKeycapPopup;

// ================================================================== Home collection view (level1)
class KeycapGenerator extends E.Behaviour {
  get KeycapHolding() { return this.holding && !this.holding.go.destroyed ? this.holding : null; }
  canGenerateThisItem(d) { return !!(d && byId('base', d.BaseKeycapId) && byId('sw', d.SwitchId)); }
  generateKeycap(d) {
    this.dat = d;
    if (this.holding && !this.holding.go.destroyed) E.destroy(this.holding.go);
    this.holding = null;
    const bc = byId('base', d.BaseKeycapId); if (!bc) return;
    const c = E.spawn(bc.BaseKeycapObject, this.go); const g = goOf(c) || c; if (!g) return;
    g.x = 0; g.y = 0; g.rot = 0;
    fixWorldCanvases(g);
    const b = g.comp('Clicker.BaseKeycapObject'); this.holding = b;
    const sw = byId('sw', d.SwitchId), kc = byId('kc', d.KeycapId), kch = byId('kch', d.KeychainId);
    b.showBaseOnly();
    if (sw) { b.setSwitch(sw.Icon); b.setSwitchSound(parseSound(sw.SoundName)); }
    if (kc) b.setKeycap((kc.KeycapColors || [])[d.KeycapColorId] || kc.Icon, 0);
    b.turnModeSetup(true);
    if (kch) b.setKeychain(kch.KeychainSprite);
    b.justShowKeychain();
    (d.DecorIdList || []).forEach((id, i) => { const dd = id >= 0 ? byId('decor', id) : null; if (dd) b.setKeycapIndex(i, dd.Sprite, dd.Type, id); });
    b.removeSetupEvent();
    g.sx = g.sy = this.d._keycapScale || 0.35;
    if (this.go.activeInHierarchy) this.onEnable();
  }
  onEnable() {
    this.after(0.1, () => {
      const b = this.KeycapHolding, d = this.dat; if (!b || !d) return;
      const sw = byId('sw', d.SwitchId);
      if (sw) { b.setSwitch(sw.Icon); b.glowColor = (sw.Color || [1, 1, 1, 1]).slice(); }
      b.applyGlowColor();
      if (sw) b.setSwitchSound(parseSound(sw.SoundName));
      b.turnModeSetup(true); b.showAllNoAnim(); b.removeSetupEvent();
    });
  }
}
S['Clicker.KeycapGenerator'] = KeycapGenerator;
class CollectionShelf extends E.Behaviour {
  update() {
    const t = goOf(this.ref('_limitTop')), b = goOf(this.ref('_limitBottom')); if (!t || !b) return;
    const y = this.go.worldPos()[1];
    const s = (y > t.worldPos()[1] || y < b.worldPos()[1]) ? 0 : 1;
    this.go.sx = this.go.sy = s;
  }
}
S['Clicker.CollectionShelf'] = CollectionShelf;
class CollectionKeycapItem extends E.Behaviour {
  init(screen) {
    this.scr = screen;
    this.gen = this.ref('_keycapGenerator');
    this.cLock = goOf(this.ref('_contentLock')); this.cEmpty = goOf(this.ref('_contentEmpty')); this.cInspect = goOf(this.ref('_contentCanInspect'));
    this.bLock = goOf(this.ref('_btnLock')); this.bAvail = goOf(this.ref('_btnAvailable')); this.bInspect = goOf(this.ref('_btnInspect'));
    this.wc = this.go.find('WorldCanvas') || (this.bLock && this.bLock.parent);
    this.state = 0;
  }
  get KeycapGenerator() { return this.gen; }
  get Data() { return this.data; }
  setData(state, data) {
    this.state = state; this.data = data || null;
    if (state === 2) {
      if (this.gen && this.gen.canGenerateThisItem(data)) { this.visual(2); this.gen.generateKeycap(data); }
      else { if (data) DC.remove(data.Index); this.setData(1, null); }
      return;
    }
    this.visual(state);
  }
  visual(s) { vis(this.cLock, s === 0); vis(this.bLock, s === 0); vis(this.cEmpty, s === 1); vis(this.bAvail, s === 1); vis(this.cInspect, s === 2); vis(this.bInspect, s === 2); }
  hitTest(x, y) {
    const g = this.wc; if (!g || !g.wm || !this.go.activeInHierarchy) return false;
    const m = g.wm; if (Math.abs(m[0] * m[3] - m[1] * m[2]) < 1e-6) return false;
    const p = M.ap(M.inv(m), x, y); const r = g.rect || { w: 200, h: 200, pvx: 0.5, pvy: 0.5 };
    return p[0] >= -r.w * r.pvx && p[0] <= r.w * (1 - r.pvx) && p[1] >= -r.h * r.pvy && p[1] <= r.h * (1 - r.pvy);
  }
  onTap() {
    if (this.state === 0) {
      G.click();
      const p = E.ui && (E.ui.showPopup('Clicker.UnlockSlotPopup') || E.ui.showPopup('Clicker.CollectionFullPopup'));
      if (p && p.setEventCallback) p.setEventCallback(() => { this.scr.unlockNewSlot(); DC.data()._maxKeycapAmount++; G.save(); }, 500);
    } else if (this.state === 1) { G.click(); if (E.ui) E.ui.showPopup('Clicker.CreateMorePopup'); }
    else { G.click(); this.scr.showPreviewClick(this); }
  }
}
S['Clicker.CollectionKeycapItem'] = CollectionKeycapItem;
class ScreenClickerCollection extends E.ScreenBase {
  onInit() {
    G.onClick(this.ref('_btnHome'), () => this.onBtnHomeClick());
    G.onClick(this.ref('_btnBack'), () => this.onBtnBackClick());
    G.onClick(this.ref('_btnRemoveKeycap'), () => this.onBtnRemoveKeycapClick());
    const root = E.findInScene('CollectionClicker');
    this.content = root ? root.find('Collection') : E.findInScene('Collection');
    this.preview = root ? root.find('PreviewSingle') : E.findInScene('PreviewSingle');
    if (this.content) fixWorldCanvases(this.content);
    const dr = this.ref('_drag2D'); this.drag = dr instanceof E.GO ? dr.comp('AxisDrag2D') : dr;
    this.inspectPos = goOf(this.ref('_tfInspectPos'));
    this.shelves = this.refs('_collectionShelfs').filter(Boolean);
    this.items = [];
    for (const s of this.shelves) for (const it of s.refs('_3ItemsHolding')) if (it) this.items.push(it);
    for (const it of this.items) it.init(this);
    vis(this.content, true); vis(this.preview, false);
    this.loadSavedData();
  }
  loadSavedData() {
    const saved = DC.list().slice();
    const n = Math.min(saved.length, this.items.length);
    const max = DC.data()._maxKeycapAmount;
    const m = max < n ? saved.length : max;
    const slots = Math.min(m, this.items.length);
    for (let i = 0; i < this.items.length; i++) {
      if (i < n) this.items[i].setData(2, saved[i]);
      else if (i < slots) this.items[i].setData(1, null);
      else this.items[i].setData(0, null);
    }
    let c = n % 3 === 0 ? (n >= 12 ? n / 3 + 1 : 4) : (n >= 15 ? Math.floor(n / 3) : 4);
    this.showingShelfCount = Math.min(c, this.shelves.length - 1);
    this.updateShelf();
  }
  updateShelf() {
    const dr = this.drag; if (!dr) return;
    dr.go.y = dr.d.minValue != null ? dr.d.minValue : dr.go.y;
    const sh = this.shelves[this.showingShelfCount]; if (sh && sh.d.LimitBottomDragValue != null) dr.d.maxValue = sh.d.LimitBottomDragValue;
  }
  setButtons(home, back, remove) { vis(this.ref('_btnHome'), home); vis(this.ref('_btnBack'), back); vis(this.ref('_btnRemoveKeycap'), remove); }
  onShow() {
    vis(this.content, true); vis(this.preview, false);
    this.setButtons(true, false, false);
    vis(this.ref('_petAtHome'), false);
    vis(this.ref('_handTutorial'), !user().IsDoneTutorialCollection && DC.list().length > 0);
    setActiveCharacter(false);
    if (!this.l) this.l = E.input.on((t, ev) => this.onInput(t, ev));
  }
  onHide() {
    if (this.l) { E.input.off(this.l); this.l = null; }
    if (this.inspectKeycap) this.backToCollection(true);
    vis(this.content, false); vis(this.preview, false);
  }
  onDisable() { if (this.l) { E.input.off(this.l); this.l = null; } }
  onInput(t, ev) {
    if (t === 'down') { this.down = { x: ev.x, y: ev.y, ui: !!E.uiRaycast(ev.x, ev.y) }; return; }
    if (t !== 'up' || !this.down) return;
    const d = this.down; this.down = null;
    if (d.ui || Math.hypot(ev.x - d.x, ev.y - d.y) > 25 || !this.content || !this.content.activeInHierarchy || (E.ui && E.ui.anyPopup())) return;
    const it = this.items.find((i) => i.hitTest(ev.x, ev.y));
    if (it) it.onTap();
  }
  showPreviewClick(item) {
    const b = item.KeycapGenerator && item.KeycapGenerator.KeycapHolding; if (!b) return;
    vis(this.ref('_handTutorial'), false);
    if (!user().IsDoneTutorialCollection) { user().IsDoneTutorialCollection = true; G.save(); }
    vis(this.content, false); vis(this.preview, true);
    this.setButtons(false, true, true);
    this.inspectItem = item; this.inspectKeycap = b; this.inspectIndex = item.data ? item.data.Index : -1;
    b.turnModeSetup(false);
    reparentKeep(b.go, this.inspectPos);
    E.killOwner(b.go);
    E.moveTo(b.go, 0, 0, 0.1, { ease: EZ.linear }); E.scaleTo(b.go, 1, 0.1, { ease: EZ.linear });
  }
  backToCollection(silent) {
    const b = this.inspectKeycap, item = this.inspectItem;
    this.inspectKeycap = null; this.inspectItem = null;
    if (!silent) { vis(this.content, true); vis(this.preview, false); this.setButtons(true, false, false); }
    if (!b || b.go.destroyed || !item) return;
    b.turnModeSetup(true);
    const gen = item.KeycapGenerator; if (!gen) return;
    reparentKeep(b.go, gen.go);
    E.killOwner(b.go);
    if (silent) { b.go.x = b.go.y = 0; b.go.sx = b.go.sy = gen.d._keycapScale || 0.35; return; }
    E.moveTo(b.go, 0, 0, 0.1, { ease: EZ.linear }); E.scaleTo(b.go, gen.d._keycapScale || 0.35, 0.1, { ease: EZ.linear });
  }
  unlockNewSlot() { const it = this.items.find((i) => i.state === 0); if (it) it.setData(1, null); }
  deleteCurrentKeycap() { DC.remove(this.inspectIndex); this.loadSavedData(); }
  onBtnRemoveKeycapClick() {
    G.click();
    const p = E.ui && E.ui.showPopup('Clicker.DeleteKeycapPopup');
    if (p && p.setEventCallback) p.setEventCallback(() => { this.deleteCurrentKeycap(); this.backToCollection(); });
  }
  onBtnBackClick() { G.click(); this.backToCollection(); releaseAllGlow(); }
  onBtnHomeClick() {
    G.click();
    this.hide();
    if (E.ui) E.ui.showScreen('ScreenHome');
    setActiveCharacter(true);
    vis(this.ref('_petAtHome'), true);
  }
}
S['Clicker.ScreenClickerCollection'] = ScreenClickerCollection;
S.TempEndGame = class TempEndGame extends E.PopupBase {};
})();
