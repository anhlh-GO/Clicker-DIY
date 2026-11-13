'use strict';
// Core game services: save data, money, scenes, UIManager / ScreenBase / PopupBase, common widgets.
(() => {
const G = (E.Game = {});
G.SCENES = { Loading: 'level0', Home: 'level1', ModeClicker: 'level2', BlindbagMinigame: 'level3', BlindBagCollection: 'level4', DreamHouse: 'level5', ScoopGame: 'level6' };
// ---------------------------------------------------------------- save
G.defaults = () => ({ user: { money: 200, sound: true, music: true, vibration: true, IsFirstGame: true, IsFirstClicker: true, IsFirstLuckWheel: true, ClickerPlayTime: 0, BlindbagPlayTime: 0, ScoopPlayTime: 0, UnlockedClickerDecor: [], UnlockedClickerSwitch: [], UnlockedClickerBase: [], UnlockedClickerKeychain: [], OwnedGiftBox: [], OwnedCard: [], StartTime: new Date().toISOString() }, prefs: {} });
G.data = () => {
  const s = E.save;
  const d = G.defaults();
  for (const k in d) if (s[k] == null) s[k] = d[k];
  for (const k in d.user) if (s.user[k] == null) s.user[k] = d.user[k];
  return s;
};
G.saveNow = () => E.writeSave();
let saveT = null;
G.save = () => { if (saveT) return; saveT = setTimeout(() => { saveT = null; E.writeSave(); }, 50); };
G.pref = (k, def = 0) => { const p = G.data().prefs; return p[k] == null ? def : p[k]; };
G.setPref = (k, v) => { G.data().prefs[k] = v; G.save(); };
// ---------------------------------------------------------------- money
G.moneyListeners = new Set();
G.money = () => G.data().user.money;
G.addMoney = (delta, opts = {}) => {
  const u = G.data().user; u.money = Math.max(0, Math.round(u.money + delta)); G.save();
  for (const f of G.moneyListeners) try { f(u.money, delta, opts); } catch (e) { console.error(e); }
};
G.canAfford = (p) => G.money() >= p;
// ---------------------------------------------------------------- sounds
G.sound = (id) => { if (G.data().user.sound === false) return null; return E.playSound(id); };
G.click = () => G.sound(1);
G.music = (name) => { E.audio.musicMuted = G.data().user.music === false; E.audio.playMusic(name); };
// ---------------------------------------------------------------- scene transition
let overlay = null;
G.transitionAlpha = 0;
E.onPostRender = (ctx) => {
  if (G.transitionAlpha > 0.001) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = G.transitionAlpha; ctx.fillStyle = G.transitionColor || '#fff'; ctx.fillRect(0, 0, E.canvas.width, E.canvas.height); ctx.globalAlpha = 1; }
};
G.busy = false;
// FlashIn: white overlay + penguin + LOADING keycaps (SimpleSceneTransition, persistent from level0)
G.goto = async (scene, opts = {}) => {
  if (G.busy) return; G.busy = true;
  const level = G.SCENES[scene] || scene;
  const tr = G.transition;
  if (tr) await tr.flashIn();
  else { G.transitionColor = '#fff'; await new Promise((r) => E.tween({ dur: 0.3, keep: true, ease: E.ease.linear, owner: 'transition', update: (v) => { G.transitionAlpha = v; }, done: r })); }
  E.input.locked = 0;
  if (tr) tr._fadedThisScene = false;
  try { await E.loadScene(level); } catch (e) { console.error(e); }
  G.scene = scene;
  G.busy = false;
  if (tr) { if (!tr._fadedThisScene) tr.fadeOut(); tr._fadedThisScene = false; }
  else E.tween({ dur: 0.35, keep: true, ease: E.ease.linear, owner: 'transition', update: (v) => { G.transitionAlpha = 1 - v; } });
};
G.boot = async () => { await E.loadScene('level0'); };
E.Game.boot = G.boot;
class DDOL extends E.Behaviour { awake() { let r = this.go; while (r.parent) r = r.parent; r._ddol = true; } }
E.scripts.DDOL = DDOL;
class SimpleSceneTransition extends E.Behaviour {
  awake() {
    G.transition = this; let r = this.go; while (r.parent) r = r.parent; r._ddol = true;
    this.white = this.ref('_whiteFlashImage'); this.pin = this.ref('_pinginSpine'); this.kcg = this.ref('_keycapEffectCanvas'); this.ke = this.ref('_keycapEffect');
    const m = G.goOf(this.ref('_tfMascot')); if (m) m.setActive(false);
    this.force();
  }
  force() { E.killOwner(this); if (this.white) { this.white.color[3] = 0; this.white.nr = 1; } if (this.pin) { this.pin.color[3] = 0; this.pin.go.setActive(false); } if (this.kcg) this.kcg.alpha = 0; if (this.ke) this.ke.stop(); }
  flashIn() {
    return new Promise((res) => {
      E.killOwner(this);
      const w = this.white; w.nr = 0; w.color[3] = 0;
      this.tween({ dur: 0.5, keep: true, update: (v) => { w.color[3] = v; } });
      if (this.pin) { this.pin.go.setActive(true); const p = this.pin; this.tween({ dur: 0.5, keep: true, update: (v) => { p.color[3] = v; } }); }
      if (this.kcg) { const k = this.kcg; k.alpha = 0; this.tween({ dur: 0.2, delay: 0.3, keep: true, update: (v) => { k.alpha = v; } }); }
      if (this.ke) this.ke.animate();
      E.tween({ dur: 0, delay: 1.0, keep: true, owner: this, done: res });
    });
  }
  fadeOut() {
    this._fadedThisScene = true;
    E.killOwner(this);
    const w = this.white, p = this.pin, k = this.kcg;
    const a0 = w.color[3], p0 = p ? p.color[3] : 0, k0 = k ? k.alpha : 0;
    this.tween({ dur: 0.5, keep: true, update: (v) => { w.color[3] = a0 * (1 - v); if (p) p.color[3] = p0 * (1 - v); if (k) k.alpha = k0 * (1 - v); }, done: () => { if (p) p.go.setActive(false); if (this.ke) this.ke.stop(); w.nr = 1; } });
  }
  transition(cb) { return this.flashIn().then(() => { cb && cb(); this.fadeOut(); }); }
}
E.scripts.SimpleSceneTransition = SimpleSceneTransition;
class KeycapEffect extends E.Behaviour {
  animate() {
    this.stop(); const L = this.refs('_letters').map(G.goOf).filter(Boolean); if (!L.length) return;
    this.run = true; let i = 0;
    const step = () => { if (!this.run) return; const g = L[i % L.length]; i++; E.tween({ dur: 0.2, keep: true, owner: this, ease: E.ease.inQuad, update: (v) => { g.rt[5] = -15 + (-31 + 15) * v; }, done: () => E.tween({ dur: 0.2, keep: true, owner: this, ease: E.ease.outQuad, update: (v) => { g.rt[5] = -31 + 16 * v; }, done: step }) }); };
    step();
  }
  stop() { this.run = false; E.killOwner(this); for (const g of this.refs('_letters').map(G.goOf)) if (g) g.rt[5] = -15; }
}
E.scripts.KeycapEffect = KeycapEffect;
class LoadingControl extends E.Behaviour {
  async start() {
    const txt = E.txtOf(this.ref('_loadingText')), fill = this.ref('_loadingFillImage');
    if (fill) fill.fa = 0;
    await E.wait(1, this);
    const homeLoad = E.loadFile('level1');
    await new Promise((r) => this.tween({ dur: 10, ease: E.ease.linear, update: (v) => { if (txt) txt.text = 'Loading ' + Math.floor(v * 100) + '%'; if (fill) fill.fa = v; }, done: r }));
    await homeLoad;
    await E.loadScene('level1'); G.scene = 'Home';
  }
}
E.scripts.LoadingControl = LoadingControl;
// ---------------------------------------------------------------- base UI classes
class UIBase extends E.Behaviour {
  get isShowing() { return this.go.activeSelf && this._showing; }
  init() { if (this._inited) return; this._inited = true; if (this.onInit) this.onInit(); }
}
class ScreenBase extends UIBase {
  show(...a) { this.init(); this.go.setActive(true); this._showing = true; const cg = this.go.comp('CG'); if (cg) { cg.alpha = 1; cg.br = true; cg.ia = true; } if (this.onShow) this.onShow(...a); return this; }
  hide() { this._showing = false; if (this.onHide) this.onHide(); this.go.setActive(false); }
}
class PopupBase extends UIBase {
  panel() { const p = this.d._panel ? this.ref('_panel') : null; return p && p.go ? p.go : p; }
  show(...a) {
    this.init();
    this.go.setActive(true); this._showing = true;
    const cg = this.go.comp('CG');
    if (cg) { cg.alpha = 1; cg.br = true; }
    const p = this.panel();
    if (p && !this.noPanelAnim) { E.killOwner(p); p.sx = p.sy = 0; E.scaleTo(p, 1, this.panelDur || 0.36, { ease: E.ease.outBack, owner: this }); }
    if (this.onShow) this.onShow(...a);
    return this;
  }
  hide() {
    if (!this._showing) return;
    this._showing = false;
    if (this.onHide) this.onHide();
    this.go.setActive(false); if (this.onHidden) this.onHidden();
  }
  close() { this.hide(); }
}
E.UIBase = UIBase; E.ScreenBase = ScreenBase; E.PopupBase = PopupBase;

// UIManager: owns screens + popups of the current scene
class UIManager extends E.Behaviour {
  awake() {
    E.ui = this;
    this.screens = this.refs('_arrScreens').filter(Boolean);
    this.popups = this.refs('_arrPopups').filter(Boolean);
    for (const s of this.screens) { s.go.setActive(false); }
    for (const p of this.popups) { p.go.setActive(false); }
  }
  _find(list, cls) { return list.find((c) => c.cls === cls || c.constructor.name === cls || c.go.name === cls); }
  getScreen(cls) { return this._find(this.screens, cls); }
  getPopup(cls) { return this._find(this.popups, cls); }
  showScreen(cls, ...a) { const s = this.getScreen(cls); if (!s) { console.warn('no screen', cls); return null; } for (const o of this.screens) if (o !== s && o.go.activeSelf) (o.hide ? o.hide() : o.go.setActive(false)); return s.show ? s.show(...a) : (s.go.setActive(true), s); }
  showPopup(cls, ...a) { const p = this.getPopup(cls); if (!p) { console.warn('no popup', cls); return null; } return p.show ? p.show(...a) : (p.go.setActive(true), p); }
  hidePopup(cls) { const p = this.getPopup(cls); if (p) (p.hide ? p.hide() : p.go.setActive(false)); }
  anyPopup() { return this.popups.some((p) => p.go.activeSelf); }
}
E.scripts.UIManager = UIManager;

// ---------------------------------------------------------------- common widgets
const txtOf = (r) => (r && r.t === 'Txt' ? r : r && r.go ? r.go.comp('Txt') : r && r.comp ? r.comp('Txt') : null);
E.txtOf = txtOf;
G.fmt = (n) => Math.round(n).toLocaleString('en-US');
// pool prefabs (PoolConfigs)
G.poolPrefab = (type) => { const a = E.soByClass('PoolAsset'); const e = a && a.poolDataList.find((x) => x.poolType === type); return e ? e.prefab : null; };
let moneyMgr = null;
class MoneyManager extends E.Behaviour {
  awake() { moneyMgr = this; G.moneyMgr = this; this.defaultParent = this.go.parent; }
  onEnable() {
    G.moneyMgr = this;
    this.txt = txtOf(this.ref('_moneyText'));
    this.shown = G.money(); this.setText(this.shown);
    this.l = (v, delta, opts) => { if (opts.noAnim) { this.shown = v; this.setText(v); return; } this.animTo(v); };
    G.moneyListeners.add(this.l);
  }
  onDisable() { G.moneyListeners.delete(this.l); }
  refresh() { this.shown = G.money(); this.setText(this.shown); }
  setText(v) { if (this.txt) this.txt.text = G.fmt(v); }
  animTo(v) { E.killOwner(this); const from = this.shown; this.tween({ dur: 1, ease: E.ease.outQuad, update: (k) => { this.shown = from + (v - from) * k; this.setText(this.shown); } }); }
  showUp() { const top = E.ui ? E.ui.go : null; if (top && this.go.parent !== top) this.go.setParent(top, false), this.go.setAsLastSibling(); }
  backToParent() { if (this.defaultParent && this.go.parent !== this.defaultParent) this.go.setParent(this.defaultParent, false); }
  showMoneyAddOn(v, d) { const mi = this.ref('_moneyItem'); if (mi && mi.show) mi.show(v, d); }
  // CollectMoney: coins fly to the icon, money credited when the first coin lands, cb after 2 s
  collectMoney(amount, n = 10, cb, spawnWorld) {
    if (this._cb) { const c = this._cb; this._cb = null; c(); }
    this._cb = cb;
    const cc = this.ref('_collectingCoin');
    const fin = () => { G.addMoney(amount); E.after(2, () => { const c = this._cb; this._cb = null; if (c) c(); }, this); };
    if (cc && cc.collect) cc.collect(n, fin, spawnWorld); else fin();
  }
}
E.scripts.MoneyManager = MoneyManager;
G.collectMoney = (amount, n, cb, spawn) => { if (G.moneyMgr && G.moneyMgr.go.activeInHierarchy) G.moneyMgr.collectMoney(amount, n, cb, spawn); else { G.addMoney(amount); if (cb) E.after(0.5, cb); } };
class CollectingCoin extends E.Behaviour {
  async collect(n, onFirst, spawnScreen) {
    const parent = G.goOf(this.ref('_coinParent')) || this.go;
    const sp = G.goOf(this.ref('_spawnLocation')), end = G.goOf(this.ref('_endPosition')), label = G.goOf(this.ref('_coinLabel'));
    const prefab = G.poolPrefab(this.d._prefabType || 5);
    if (!prefab || !sp || !end) { onFirst(); return; }
    let sx = sp.rt ? sp.rt[4] : 0, sy = sp.rt ? sp.rt[5] : 0;
    if (spawnScreen && parent.wm) { const l = E.M.ap(E.M.inv(parent.wm), spawnScreen[0], spawnScreen[1]); sx = l[0]; sy = l[1]; }
    const ex = end.rt[4], ey = end.rt[5];
    const coins = [];
    for (let i = 0; i < n; i++) {
      const c = E.spawn(prefab, parent); const g = c.go || c;
      g.rt[0] = g.rt[2] = sp.rt ? sp.rt[0] : 0.5; g.rt[1] = g.rt[3] = sp.rt ? sp.rt[1] : 0.5;
      g.rt[4] = sx + E.rand(this.d._minX, this.d._maxX); g.rt[5] = sy + E.rand(this.d._minY, this.d._maxY); g.sx = g.sy = 1;
      const y0 = g.rt[5]; const d = Math.random() * 0.3;
      E.tween({ dur: Math.max(0.05, d), owner: g, ease: E.ease.linear, update: (v) => { g.rt[5] = y0 + 30 * Math.sin(v * Math.PI * 5) * (1 - v); } });
      coins.push(g);
      await E.wait(0.005, this);
    }
    await E.wait(0.3, this);
    let first = false;
    const dur = (this.d._duration || 1) * 0.5;
    coins.forEach((g, i) => {
      E.after(0.02 * i, () => {
        const fx = g.rt[4], fy = g.rt[5];
        E.tween({ dur, owner: g, ease: E.ease.inBack, update: (v) => { g.rt[4] = fx + (ex - fx) * v; g.rt[5] = fy + (ey - fy) * v; }, done: () => {
          G.sound(6); E.destroy(g);
          if (label) E.punchScale(label, 0.5, 0.1);
          if (!first) { first = true; onFirst(); }
        } });
      }, this);
    });
  }
}
E.scripts['JobGame.CollectingCoin'] = CollectingCoin;
class MoneyItem extends E.Behaviour { // "+N" floating label under the money box
  awake() { this.cg = this.ref('_canvasGroup'); if (this.cg) this.cg.alpha = 0; this.txt = txtOf(this.ref('_text')); }
  show(v, d = 1) {
    if (!this.txt) return;
    this.txt.text = String(v);
    E.killOwner(this.go);
    this.go.rt[5] = -85;
    if (this.cg) { this.cg.alpha = 1; E.fadeTo(this.cg, 0, d, { owner: this.go }); }
    E.moveTo(this.go, this.go.rt[4], -50, d);
  }
}
// ---------------------------------------------------------------- livestream comments & viewers
class CommentHandler extends E.Behaviour {
  awake() { this.enabledSpawn = !!this.d.IsEnableToSpawnComment; this.queue = []; this.t = 0; const img = this.go.comp('Img'); if (img && !img.sp) img.color[3] = 0; }
  get IsEnableToSpawnComment() { return this.enabledSpawn; } set IsEnableToSpawnComment(v) { this.enabledSpawn = v; }
  asset() { if (!this._asset) { const a = this.d._asset; this._asset = a ? E.so(a) : null; } return this._asset; }
  update() {
    if (!this.enabledSpawn || E.time < this.t) return;
    this.t = E.time + (this.d._isRandomTimerComment ? E.rand(0.8, 1.6) : 0.8);
    this.spawnLive();
    const a = this.asset(); const lines = a && (a.ChatContents || []);
    if (lines && lines.length) this.queue.push({ viewer: true, text: E.pick(lines) });
  }
  spawnLive() { if (!this.queue.length) return; if (this.d._playSoundSpawn) G.sound(2) ; const c = this.queue.shift(); this.comment(c.text, c.viewer); }
  userComment(t) { this.queue.push({ viewer: false, text: t }); }
  comment(text, viewer) {
    const parent = G.goOf(this.ref('_commentParent')) || this.go;
    const c = E.spawn(this.d._prefabComment, parent); if (!c) return;
    const g = c.go || c; const cc = g.comp('CommentControl');
    const av = E.so(this.d._viewerAvatarAsset);
    let sp = null; const list = av && av.Avatars;
    if (list && list.length) { do { sp = E.pick(list); } while (list.length > 1 && sp === this._last); this._last = sp; }
    if (cc) { cc.appear(); cc.setText(text); cc.init(sp); }
    const max = this.d._maxChatShowing || 3;
    g.sx = g.sy = 1.3; g.rt[4] = 60; g.rt[5] = this.d._distanceComment || 10;
    E.moveTo(g, 60, max * 100, max * 0.6, { ease: E.ease.linear, done: () => { E.moveTo(g, 60, (max + 1) * 100, 0.6, { ease: E.ease.linear }); if (cc) cc.fadeOut(() => E.destroy(g)); else E.destroy(g); } });
  }
}
E.scripts.CommentHandler = CommentHandler;
class CommentControl extends E.Behaviour {
  parts() { return ['text_meshPro', '_layoutImage', '_layoutBG', 'img_avatar'].map((k) => this.ref(k)).filter(Boolean).map((r) => (r.color ? r : r.go ? r.go.comp('Img') || r.go.comp('Txt') : r.comp && (r.comp('Img') || r.comp('Txt')))).filter(Boolean); }
  appear() { for (const p of this.parts()) p.color[3] = 1; }
  setText(t) { const tx = E.txtOf(this.ref('text_meshPro')); if (tx) tx.text = t; const lt = G.goOf(this.ref('layout_txt')); if (lt && lt.rt) lt.rt[6] = Math.min(t.length * (this.d.widthScaleText || 40), this.d.widthMaxScaleText || 460); }
  init(sp) { const a = this.ref('img_avatar'); const im = a && (a.t === 'Img' ? a : G.goOf(a).comp('Img')); if (im && sp) im.sp = sp; const s = G.goOf(this.ref('_localScale')); if (s) { s.sx = s.sy = 0; E.after(0.016, () => E.scaleTo(s, 1, 0.2, { ease: E.ease.outBack })); } }
  fadeOut(cb) { const ps = this.parts(); E.tween({ dur: 0.3, owner: this.go, update: (v) => { for (const p of ps) p.color[3] = 1 - v; }, done: cb }); }
}
E.scripts.CommentControl = CommentControl;
class LivestreamPanel extends E.Behaviour {
  txt() { return E.txtOf(this.ref('_txtViewCount')) || this.go.compInChildren('Txt'); }
  onEnable() { this.onShowPanel(); }
  onDisable() { this.onHidePanel(); }
  onShowPanel() {
    this.onHidePanel();
    this.view = E.randInt(5000, 22000); const t = this.txt(); if (t) t.text = String(this.view);
    const loop = () => { const prev = this.view; this.view += E.randInt(-500, 500); const nv = this.view; this.tween({ dur: 1, update: (k) => { const t2 = this.txt(); if (t2) t2.text = String(Math.round(prev + (nv - prev) * k)); } }); this.after(E.rand(1, 2), loop); };
    this.after(E.rand(1, 2), loop);
  }
  onHidePanel() { this.kill(); }
}
E.scripts['Livestream.LivestreamPanel'] = LivestreamPanel;
class ChatInput extends E.Behaviour { // tap the chat bar to send a quick cheer
  onEnable() { const b = this.go.comp('Btn') || null; this.h = this.ref('_commentHandler'); }
  onPointerClick() { const h = this.h || this.ref('_commentHandler'); if (h && h.userComment) h.userComment(E.pick(['So cute!!', 'Wow 😍', 'Love it!', 'Hello everyone!', 'ASMR time ✨'])); }
}
E.scripts['Livestream.ChatInput'] = ChatInput;
E.scripts['Home.MoneyItem'] = MoneyItem;
class Scroller extends E.Behaviour {
  awake() { this.raw = this.go.comp('Raw'); }
  update(dt) { if (this.raw) { const uv = this.raw.uv || (this.raw.uv = [0, 0, 1, 1]); uv[0] = (uv[0] + this.d._x * dt) % 1; uv[1] = (uv[1] + this.d._y * dt) % 1; } }
}
E.scripts.Scroller = Scroller;
class CameraController extends E.Behaviour {
  awake() { this.cam = this.go.comp('Cam'); G.camCtl = this; this.base = this.cam ? this.cam.sz : 5; }
  // keep horizontal extent of a 16:9 (portrait) design when the screen is taller
  clampSize(size) { const asp = E.H / E.W; const b = this.d._baseAspect || 1.7778; return asp > b ? size * (asp / b) : size; }
  setSize(size, clamp) { if (this.cam) this.cam.sz = clamp ? this.clampSize(size) : size; }
}
E.scripts.CameraController = CameraController;
class NotEnoughMoneyPopup extends PopupBase {
  onInit() {
    const add = (k, f) => { const b = this.ref(k); const btn = b && (b.t === 'Btn' ? b : b.go ? b.go.comp('Btn') : b.comp && b.comp('Btn')); if (btn) btn.onClick.push(f); };
    add('_closeButton', () => { G.click(); this.hide(); });
    add('_closeButtonHidden', () => { G.click(); this.hide(); });
    add('_purchaseButton', () => { G.click(); this.hide(); G.addMoney(1000); G.sound(47); });
  }
}
E.scripts.NotEnoughMoneyPopup = NotEnoughMoneyPopup;
G.notEnough = () => { if (E.ui) E.ui.showPopup('NotEnoughMoneyPopup'); };
// button helper: accepts Btn comp / GO / component on a GO
G.btn = (r) => { if (!r) return null; if (r.t === 'Btn') return r; const g = r.go || r; return g.comp ? g.comp('Btn') : null; };
G.onClick = (r, f) => { const b = G.btn(r); if (b) b.onClick.push(f); return b; };
G.goOf = (r) => (r ? (r instanceof E.GO ? r : r.go || null) : null);
// FX touch trigger (UI particle at tap position)
class TouchEffectTrigger extends E.Behaviour {
  onEnable() { this.l = E.input.on((t, ev) => { if (t !== 'down') return; const fx = G.goOf(this.ref('_touchEffect')); if (!fx || !fx.parent || !fx.parent.wm) return; const p = E.M.ap(E.M.inv(fx.parent.wm), ev.x, ev.y); if (fx.rt) { fx.rt[4] = p[0]; fx.rt[5] = p[1]; } else { fx.x = p[0]; fx.y = p[1]; } E.psPlay(fx); }); }
  onDisable() { E.input.off(this.l); }
}
E.scripts['DreamHouse.TouchEffectTrigger'] = TouchEffectTrigger;
})();
