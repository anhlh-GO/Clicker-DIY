'use strict';
// Home scene (level1): ScreenHome + HomeButtons, world (pet / character / decor), intro popups, Decor panel,
// and the persistent GameSession character (level0 Master/GameSession/CharacterContainer).
(() => {
const G = E.Game, S = E.scripts;
const goOf = (r) => G.goOf(r);
const act = (r, b) => { const g = goOf(r); if (g) g.setActive(!!b); };
const setTxt = (r, s) => { const t = E.txtOf(r); if (t) t.text = String(s); };
const imgOf = (r) => (!r ? null : r.t === 'Img' ? r : goOf(r) ? goOf(r).comp('Img') : null);
const setSp = (r, sp) => { const i = imgOf(r); if (i && sp) i.sp = sp; };
const inter = (r, b) => { const bt = G.btn(r); if (bt) bt.interactable = !!b; };
const user = () => G.data().user;
const vibrate = (ms) => { if (user().vibration !== false) E.vibrate(ms); };
const haptic = () => vibrate(15);
const sess = () => G.session;
const HOME_BGM = ['bgm_home_1', 'bgm_home_2', 'bgm_home_3'];
let homeCtl = null, decorCtl = null, screenHome = null;

// anchored-position tween with its own kill key (DOKill on the RectTransform)
const mvKey = (g) => g._mvKey || (g._mvKey = { mv: g });
const moveAxis = (g, axis, v, dur, delay, ease, done) => {
  if (!g || !g.rt) return;
  const k = mvKey(g); E.killOwner(k);
  const i = axis === 'x' ? 4 : 5;
  if (dur <= 0 && delay <= 0) { g.rt[i] = v; if (done) done(); return; }
  const f = { v0: null };
  E.tween({ dur, delay, ease, owner: k, onStart: () => { f.v0 = g.rt[i]; }, update: (t) => { if (f.v0 == null) f.v0 = g.rt[i]; g.rt[i] = f.v0 + (v - f.v0) * t; }, done });
};
const moveLocalY = (g, y, dur) => { if (!g) return; const k = mvKey(g); E.killOwner(k); const y0 = g.y; E.tween({ dur, owner: k, ease: E.ease.outQuad, update: (t) => { g.y = y0 + (y - y0) * t; } }); };

// ---------------------------------------------------------------- preload (character prefabs + decor pool prefabs)
E.scenePreload.level1 = () => {
  const refs = [G.poolPrefab(6), G.poolPrefab(7), G.poolPrefab(5), 'sharedassets1.assets:812'];
  const cat = G.decor.cats()[0]; if (cat) for (const o of cat.OptionDatas) if (o.PrefabSpine) refs.push(o.PrefabSpine);
  const out = E.prefabSprites(refs.filter(Boolean));
  const va = E.so('sharedassets1.assets:848'); if (va) for (const a of va.Avatars) out.add(a);
  return out;
};

// ---------------------------------------------------------------- scene hooks: hide the shared character outside Home,
// infer BackFromGameMode when the mode did not set it, create level0 Master when Home is loaded directly (?scene=level1)
let prevLevel = null;
const ensureMaster = () => {
  if (sess().inst || E.findInScene('Master')) return;
  E.loadFile('level0').then(() => { if (!sess().inst && !E.findInScene('Master')) E.instantiate('level0:213', null); }).catch((e) => console.error(e));
};
const prevOSL = E.onSceneLoaded;
E.onSceneLoaded = (level) => {
  if (prevOSL) try { prevOSL(level); } catch (e) { console.error(e); }
  const s = sess();
  if (level === 'level1') {
    if (s._quitToHome) { s._quitToHome = false; s.BackFromGameMode = 0; } else if (!s.BackFromGameMode && s.autoBackMode !== false) { const m = { level2: 1, level4: 2, level6: 3 }[prevLevel]; if (m) s.BackFromGameMode = m; }
    s.CanShowSpecial = true;
    if (s.CharacterContainer) { E.killOwner(mvKey(s.CharacterContainer)); s.CharacterContainer.y = -1.5; }
    ensureMaster();
  } else if (level !== 'level0') s.setActiveCharacter(false);
  prevLevel = level;
};

// ================================================================= GameSession (level0 Master, DDOL)
class GameSession extends E.Behaviour {
  awake() { sess().inst = this; this.container = goOf(this.ref('_characterContainer')); this.main = null; this.curId = -1; }
  start() { this.genCharacter(); this.setActiveCharacter(E.scene === 'level1'); }
  onDestroy() { if (sess().inst === this) sess().inst = null; }
  updateAvatar() { return sess().Avatar; }
  genCharacter() {
    if (!this.container) return;
    if (this.main) { E.destroy(this.main); this.main = null; }
    const id = G.decor.selected(0); const o = G.decor.option(0, id);
    this.curId = id;
    if (!o || !o.PrefabSpine) return;
    const r = E.spawn(o.PrefabSpine, this.container); const g = goOf(r) || r; if (!g) return;
    g.x = 0; g.y = 0; g.sx = g.sy = 0;
    E.scaleTo(g, 1, 0.36, { ease: E.ease.outBack, owner: g, keep: true });
    this.main = g;
    const sp = g.compInChildren('Spine'); if (sp) E.spinePlay(sp, 'idle', true);
    G.refreshProfilePanels && G.refreshProfilePanels();
  }
  setActiveCharacter(b) { if (this.container) this.container.setActive(!!b); }
  SetActiveCharacter(b) { this.setActiveCharacter(b); }
}
S.GameSession = GameSession;

// ================================================================= world triggers
class BoxTrigger extends E.Behaviour {
  awake() { this.listeners = this.listeners || new Set(); }
  get Name() { return this.d.Name; }
  on(f) { (this.listeners = this.listeners || new Set()).add(f); return f; }
  off(f) { if (this.listeners) this.listeners.delete(f); }
  onMouseButtonDown() { for (const f of [...(this.listeners || [])]) try { f(this.d.Name); } catch (e) { console.error(e); } }
  enableBoxCollider(b) { const c = this.go.comp('Box'); if (c) c.enabled = !!b; }
}
S['Home.BoxTrigger'] = BoxTrigger;
class WorldButton extends E.Behaviour { // onClick has no listeners in the build
  onEnable() { const bt = this.ref('_boxTrigger'); if (bt && bt.on) this.l = bt.on(() => { for (const f of this.onClick || []) f(); }); }
  onDisable() { const bt = this.ref('_boxTrigger'); if (bt && bt.off) bt.off(this.l); }
}
S['Home.WorldButton'] = WorldButton;
class LuckyWheelButton extends E.Behaviour {
  setActiveTutorial(v) { act(this.ref('_handTutorialGo'), v); }
  setActiveNotification(v) { for (const g of this.refs('_luckyWheelNotificationGos')) act(g, v); }
}
S['Home.LuckyWheelButton'] = LuckyWheelButton;
class BonusController extends E.Behaviour {} // StartCountdown has no caller
S['Home.BonusController'] = BonusController;

// ---------------------------------------------------------------- pet
class PetChanger extends E.Behaviour {
  awake() { this.sp = this.ref('_skeleton'); this.bt = this.ref('_boxTrigger'); this.data = this.d._data; this.s0 = this.go.sx; }
  onEnable() { if (this.bt && this.bt.on) this.l = this.bt.on(() => this.onPressed()); }
  onDisable() { if (this.bt && this.bt.off) this.bt.off(this.l); this.busy = false; if (this.bt) this.bt.enableBoxCollider(true); }
  onPressed() {
    if (this.busy || !this.sp || !this.data) return;
    G.sound(4); this.busy = true; this.bt.enableBoxCollider(false);
    const tok = (this._tok = (this._tok || 0) + 1);
    const back = () => { if (tok !== this._tok) return; this._tok++; E.spinePlay(this.sp, this.data.IdleAnimation, true); this.bt.enableBoxCollider(true); this.busy = false; };
    E.spinePlay(this.sp, this.data.TouchAnimation, false, 0, back);
    E.after(4, back, this); // safety if the completion never fires
  }
  setPet(data) {
    this.data = data; const c = this.sp; if (!c || !data) return;
    if (c.data !== data.SkeletonData) { c.data = data.SkeletonData; c._played = false; c.skin = data.SkinName; c.anim = data.IdleAnimation; c.loop = true; E.spineInit(c); }
    else { E.spineSkin(c, data.SkinName); E.spinePlay(c, data.IdleAnimation, true); }
    this.busy = false; if (this.bt) this.bt.enableBoxCollider(true);
    const g = this.go; E.killOwner(mvKey(g)); g.sx = g.sy = 0; E.scaleTo(g, this.s0 || 1, 0.36, { ease: E.ease.outBack, owner: mvKey(g) });
  }
}
S['Home.PetChanger'] = PetChanger;

// ================================================================= Decor changers (IItemChanger)
const PET_ASSET = 'sharedassets0.assets:14402';
class SpriteChanger extends E.Behaviour {
  changeItem(cat, id) { const o = G.decor.option(cat, id); const sr = this.ref('_spriteRenderer'); if (o && o.ImageSprite && sr) sr.sp = o.ImageSprite; }
}
class BackgroundChanger extends SpriteChanger {}
class TableChanger extends SpriteChanger {}
class AccessoryChanger extends SpriteChanger {}
class DecorChanger extends SpriteChanger {}
S['Decor.BackgroundChanger'] = BackgroundChanger; S['Decor.TableChanger'] = TableChanger;
S['Decor.AccessoryChanger'] = AccessoryChanger; S['Decor.DecorChanger'] = DecorChanger;
class DecorPetChanger extends E.Behaviour {
  changeItem(cat, id) {
    if (id === this.cur) return;
    const pc = this.ref('_petChanger'); if (!pc || !pc.setPet) return;
    this.cur = id;
    const a = E.so(this.d._petHomeAsset) || E.so(PET_ASSET); const L = a._dataList;
    pc.setPet(L[id < L.length ? id : 0]);
  }
}
S['Decor.PetChanger'] = DecorPetChanger;
class CharacterChanger extends E.Behaviour {
  onEnable() { const bt = this.ref('_boxTrigger'); if (bt && bt.on) this.l = bt.on(() => this.onPressed()); }
  onDisable() { const bt = this.ref('_boxTrigger'); if (bt && bt.off) bt.off(this.l); this.clicked = false; }
  changeItem(cat, id) { const s = sess(); if (s.inst && s.inst.curId !== id) s.genCharacter(); if (G.refreshProfilePanels) G.refreshProfilePanels(); }
  onPressed() { // MotionStateMachine CuteState (random cute anim once) → IdleState
    const main = sess().MainCharacter; const sp = main && main.compInChildren('Spine');
    if (!sp || this.clicked) return;
    this.clicked = true;
    const tok = (this._tok = (this._tok || 0) + 1);
    const done = () => { if (tok !== this._tok) return; this._tok++; E.spinePlay(sp, 'idle', true); this.clicked = false; };
    E.spinePlay(sp, E.pick(['cute', 'cute2', 'cute3', 'cute4']), false, 0, done);
    E.after(5, done, this);
  }
}
S['Decor.CharacterChanger'] = CharacterChanger;
class QuickContentChanger extends E.Behaviour {} // live-ops (Halloween) swap: disabled
S.QuickContentChanger = QuickContentChanger;
class FullWidthSprite extends E.Behaviour {} // table sprite is already wider than the camera
S.FullWidthSprite = FullWidthSprite;

class DecorController extends E.Behaviour {
  awake() { decorCtl = this; }
  onDestroy() { if (decorCtl === this) decorCtl = null; }
  start() { sess().setActiveCharacter(true); this.setupSavedOptions(); }
  changers() {
    const map = {};
    for (const cls of ['Decor.CharacterChanger', 'Decor.BackgroundChanger', 'Decor.TableChanger', 'Decor.PetChanger', 'Decor.AccessoryChanger', 'Decor.DecorChanger']) {
      const name = cls.split('.')[1];
      for (const c of E.findObjectsOfType(cls)) if (!map[name] && c.changeItem && (c.go.activeInHierarchy || name === 'CharacterChanger')) map[name] = c;
    }
    return map;
  }
  setupSavedOptions() { G.decor.cats().forEach((c, i) => this.onOptionSelected(i, G.decor.selected(i), true)); }
  onOptionSelected(cat, id, silent) {
    const c = G.decor.cats()[cat]; if (!c) return;
    const ch = this.changers()[c.Name]; if (ch) ch.changeItem(cat, id);
    if (cat === 0 && !silent) { G.profile.setAvatar(id); if (G.refreshProfilePanels) G.refreshProfilePanels(); }
  }
}
S['Decor.DecorController'] = DecorController;

// ================================================================= Decor panel UI
class CategoryItem extends E.Behaviour {
  setup(i, asset, cb) {
    this.idx = i; this.asset = asset;
    if (!this._wired) { this._wired = true; G.onClick(this.ref('_button') || this.go, () => { G.click(); haptic(); E.punchScale(this.go, 0.1, 0.2, { owner: mvKey(this.go) }); cb(this); }); }
    this.setSelected(false);
  }
  setSelected(b) { this.sel = b; setSp(this.ref('_icon'), b ? this.asset.OnIcon : this.asset.OffIcon); act(this.ref('_selected'), b); }
  refresh() { act(this.ref('_iconNoti'), G.decor.canAnyBuy(this.idx)); }
}
S['Decor.CategoryItem'] = CategoryItem;
class CategoryPanel extends E.Behaviour {
  setup(panel) {
    this.panel = panel; this.items = [];
    const parent = goOf(this.ref('_contentParent'));
    G.decor.cats().forEach((c, i) => {
      const r = E.spawn(G.poolPrefab(6), parent); const g = goOf(r) || r; if (!g) return;
      g.sx = g.sy = 1;
      const it = g.comp('Decor.CategoryItem'); if (!it) return;
      it.setup(i, c, (x) => this.selectCategory(x.idx)); this.items.push(it);
    });
    this.refresh();
  }
  selectDefaultCategory() { this.selectCategory(0); }
  selectCategory(i) {
    this.cur = i;
    for (const it of this.items) it.setSelected(it.idx === i);
    const op = this.panel.optionPanel;
    op.setup(i); op.selectedOptionItemByIndex(G.decor.selected(i));
    this.refresh();
  }
  refresh() { for (const it of this.items) it.refresh(); }
}
S['Decor.CategoryPanel'] = CategoryPanel;

class OptionItem extends E.Behaviour {
  setup(cat, opt, panel) {
    this.cat = cat; this.opt = opt; this.panel = panel; this.isSel = false;
    if (!this._wired) {
      this._wired = true;
      G.onClick(this.ref('_btnSelected'), () => this.onSelectClick());
      G.onClick(this.ref('_btnBuy'), () => this.panel.onOptionItemBuyClicked(this));
    }
    setSp(this.ref('_icon'), opt.Icon);
    setTxt(this.ref('_txtPrice'), opt.Price);
    setTxt(this.ref('_txtDay'), 'Day ' + opt.Price);
    this.refresh();
  }
  get owned() { return G.decor.owned(this.cat, this.opt.ID); }
  refresh() {
    const o = this.opt, own = this.owned, t = o.UnlockType;
    act(this.ref('_optionByMoney'), !own && t === 2); act(this.ref('_optionByAds'), !own && t === 1);
    act(this.ref('_optionByIAP'), !own && t === 5); act(this.ref('_optionByDay'), !own && t === 3);
    act(this.ref('_btnBuy'), !own);
    inter(this.ref('_btnBuy'), t === 1 || t === 2); // Coin stays tappable so an unaffordable tap shows NotEnoughMoney
    inter(this.ref('_btnSelected'), own);
    act(this.ref('_txtStatus'), own); setTxt(this.ref('_txtStatus'), this.isSel ? 'Equipped' : 'Owned');
    act(this.ref('_selected'), this.isSel);
    act(this.ref('_iconNoti'), !own && t === 2 && G.money() >= o.Price);
  }
  setSelected(b) { this.isSel = b; this.refresh(); }
  punch() { E.punchScale(this.go, 0.1, 0.2, { owner: mvKey(this.go) }); }
  onSelectClick() { G.click(); haptic(); this.punch(); if (this.owned) this.panel.selectedOptionItem(this); else this.panel.onOptionItemBuyClicked(this); }
}
S['Decor.OptionItem'] = OptionItem;

class OptionPanel extends E.Behaviour {
  onInit(panel) { this.panel = panel; this.items = []; this.ml = () => this.refresh(); }
  onEnable() { if (this.ml) G.moneyListeners.add(this.ml); }
  onDisable() { if (this.ml) G.moneyListeners.delete(this.ml); }
  setup(cat) {
    this.cat = cat; this.selected = null;
    const parent = goOf(this.ref('_contentParent'));
    for (const it of this.items) E.destroy(it.go);
    this.items = [];
    const c = G.decor.cats()[cat]; if (!c) return;
    for (const o of c.OptionDatas) {
      const r = E.spawn(G.poolPrefab(7), parent); const g = goOf(r) || r; if (!g) continue;
      g.sx = g.sy = 1;
      const it = g.comp('Decor.OptionItem'); if (!it) continue;
      it.setup(cat, o, this); this.items.push(it);
    }
    if (parent && parent.rt) parent.rt[4] = 0; // scroll to start
  }
  refresh() { for (const it of this.items) it.refresh(); if (this.panel && this.panel.categoryPanel) this.panel.categoryPanel.refresh(); }
  selectedOptionItemByIndex(id) { const it = this.items.find((x) => x.opt.ID === id); if (it) { if (this.selected) this.selected.setSelected(false); this.selected = it; it.setSelected(true); } }
  selectedOptionItem(it) {
    if (this.selected && this.selected !== it) this.selected.setSelected(false);
    this.selected = it; it.setSelected(true);
    G.decor.setSelected(this.cat, it.opt.ID);
    if (decorCtl) decorCtl.onOptionSelected(this.cat, it.opt.ID);
  }
  onOptionItemBuyClicked(it) {
    G.click(); haptic();
    const o = it.opt;
    if (o.UnlockType === 1) { this.unlockOptionItem(it); return; } // rewarded "unlock_decor" = free
    if (o.UnlockType !== 2) return; // Day / IAP: nothing
    if (o.Price > G.money()) { it.punch(); G.notEnough(); return; }
    G.sound(47); G.addMoney(-o.Price);
    this.unlockOptionItem(it);
  }
  unlockOptionItem(it) {
    G.decor.unlock(this.cat, it.opt.ID);
    it.refresh(); this.selectedOptionItem(it);
    if (this.panel && this.panel.categoryPanel) this.panel.categoryPanel.refresh();
    G.dailyTask.progressTask(4, 1);
    const c = G.decor.cats()[this.cat]; if (c && c.Name === 'CharacterChanger') G.dailyTask.progressTask(0, 1);
  }
}
S['Decor.OptionPanel'] = OptionPanel;

class DecorPanel extends E.Behaviour {
  onInit(screen) {
    if (this._inited) return; this._inited = true;
    this.screen = screen;
    this.panelGo = goOf(this.ref('_panel'));
    this.categoryPanel = this.ref('_categoryPanel'); this.optionPanel = this.ref('_optionPanel');
    this.optionPanel.onInit(this); this.categoryPanel.setup(this);
    G.onClick(this.ref('_btnClose'), () => this.onButtonCloseClicked());
    G.onClick(this.ref('_closeButton'), () => this.onButtonCloseClicked());
    if (this.panelGo) { this.initialY = this.panelGo.rt[5]; this.hideY = this.initialY - (this.panelGo.rt[7] + (this.d._yOffset || 200)); this.panelGo.rt[5] = this.hideY; }
    this.go.setActive(false);
  }
  get isOpen() { return this.go.activeSelf && this._open; }
  onShow() {
    this._open = true; this.go.setActive(true);
    const cg = this.go.comp('CG'); if (cg) { cg.alpha = 1; cg.br = true; cg.ia = true; }
    moveAxis(this.panelGo, 'y', this.initialY, 0.36, 0, E.ease.outQuad);
    this.categoryPanel.selectDefaultCategory();
    if (homeCtl) homeCtl.onShowDecorPanelHandler(0.36);
  }
  onButtonCloseClicked() {
    if (!this._open) return;
    G.click(); this._open = false;
    moveAxis(this.panelGo, 'y', this.hideY, 0.36, 0, E.ease.outQuad, () => { if (!this._open) this.go.setActive(false); });
    if (homeCtl) homeCtl.onHideDecorPanelHandler(0.36);
    if (this.screen) this.screen.onHideDecorPanel(0.36);
  }
  updateNoti() { act(this.ref('_iconNoti'), G.decor.cats().some((c, i) => G.decor.canAnyBuy(i))); }
}
S['Decor.DecorPanel'] = DecorPanel;

// ================================================================= Home controller (world)
class HomeController extends E.Behaviour {
  awake() { homeCtl = this; this.env = goOf(this.ref('_envGo')); }
  onDestroy() { if (homeCtl === this) homeCtl = null; }
  start() { const c = sess().CharacterContainer; if (c) c.y = -1.5; this.showBlindbagDecor(false); }
  onEnable() { this.l = E.input.on((t, ev) => { if (t === 'down') this.onTap(ev); }); }
  onDisable() { E.input.off(this.l); }
  onTap(ev) {
    if (E.input.locked > 0 || G.busy) return;
    if (E.uiRaycast(ev.x, ev.y)) return;
    if (!screenHome || !screenHome.isShowing) return;
    for (const h of E.overlapPointAll(ev.wx, ev.wy)) {
      const bt = h.g.comp('Home.BoxTrigger');
      if (bt && bt.onMouseButtonDown && h.g.activeInHierarchy) { bt.onMouseButtonDown(); return; }
    }
  }
  onShowDecorPanelHandler(d) { moveLocalY(this.env, 1.0, d); moveLocalY(sess().CharacterContainer, -0.5, d); }
  onHideDecorPanelHandler(d) { moveLocalY(this.env, 0, d); moveLocalY(sess().CharacterContainer, -1.5, d); }
  showBlindbagDecor(show) {
    act(this.ref('_blindbagDecorGo'), show); act(this.ref('_decorGo'), !show);
    const lw = goOf(this.ref('_luckyWheelGo'));
    if (show) { this._lw = lw ? lw.activeSelf : false; if (lw) lw.setActive(false); } else if (lw && this._lw != null) { lw.setActive(this._lw); this._lw = null; }
  }
  setActiveWorldBlock(v) { act(this.ref('_worldBlockGo'), v); return this; }
  setActiveDecor(v) { act(this.ref('_decorGo'), v); return this; }
  setActiveLuckWheel() { return this; }
}
S['Home.HomeController'] = HomeController;

class AutoSceneHome extends E.Behaviour { start() { if (E.ui && !(screenHome && screenHome.isShowing)) E.ui.showScreen('ScreenHome'); } }
S.AutoSceneHome = AutoSceneHome;

// ================================================================= HomeButton + ScreenHome
class HomeButton extends E.Behaviour {
  onInit() { this.rect = this.go; this.parent0 = this.go.parent; act(this.ref('_handTutorial'), false); }
  onChangeAnchorPositionX(delay, dur, x, ease, cb) { moveAxis(this.go, 'x', x, dur, delay, ease, cb); }
  onChangeAnchorPositionY(delay, dur, y, ease, cb) { moveAxis(this.go, 'y', y, dur, delay, ease, cb); }
  setActiveHandTutorial(v) { act(this.ref('_handTutorial'), v); }
  setActiveStatus() {} animUnlockPhase1() {} animUnlockPhase2() {}
}
S.HomeButton = HomeButton;

class ScreenHome extends E.ScreenBase {
  awake() { screenHome = this; G.homeScreen = this; }
  onDestroy() { if (screenHome === this) screenHome = null; }
  onInit() {
    screenHome = this; G.homeScreen = this;
    const R = (k) => this.ref(k);
    this.b = {
      setting: R('_settingButton'), live: R('_liveButton'), decor: R('_decorButton'), daily: R('_dailyButton'), dailyTask: R('_dailyTaskButton'),
      loginTime: R('_loginTimeButton'), lucky: R('_luckyWheelUIButton'), removeAd: R('_removeAdButton'), dream: R('_dreamHouseButton'),
      collection: R('_collectionClickerButton'), scoop: R('_scoopButton'), blindbag: R('_blindbagButton'),
    };
    this.scoopRect = goOf(R('_scoopButtonRect')) || goOf(this.b.scoop); this.blindRect = goOf(R('_blindbagButtonRect')) || goOf(this.b.blindbag);
    this.profile = R('_profilePanel'); this.decorPanel = R('_decorPanel'); this.homeController = R('_homeController'); this.money = goOf(R('_moneyRect'));
    this.body = this.go.find('Body');
    this.block = this.body && this.body.find('BlockScreen');
    this.scaleTut = goOf(this.b.collection) && goOf(this.b.collection).find('ScaleTutorial');
    for (const k in this.b) { const hb = this.b[k]; if (hb && hb.onInit) hb.onInit(); }
    if (G.addDumplingHomeButton) this.b.dumpling = G.addDumplingHomeButton(this); // added mode (js/dumpling.js)
    if (this.decorPanel && this.decorPanel.onInit) this.decorPanel.onInit(this);
    if (this.block) this.block.setActive(false);
    this.onHideButtons(0);
    const on = (hb, f) => { if (!hb) return; G.onClick(hb.ref ? hb.ref('_button') || hb.go : hb, f); };
    on(this.b.live, () => this.onLiveButtonClicked());
    on(this.b.blindbag, () => { G.click(); this.onHideButtons(0.5); E.ui.showPopup('Home.PopupIntroBlindbag'); });
    on(this.b.scoop, () => { G.click(); this.onHideButtons(0.5); E.ui.showPopup('Home.PopupIntroScoop'); });
    on(this.b.collection, () => this.onCollectionClickerButtonClicked());
    on(this.b.dream, () => { G.click(); sess().setActiveCharacter(false); G.goto('DreamHouse'); });
    on(this.b.decor, () => { G.click(); this.showDecor(); });
    on(this.b.daily, () => { G.click(); const p = E.ui.showPopup('DailyLoginPopup', false); if (p && p.showTutorial) p.showTutorial(false); });
    on(this.b.dailyTask, () => { G.click(); E.ui.showPopup('DailyTask.PopupDailyTask'); });
    on(this.b.loginTime, () => { G.click(); E.ui.showPopup('LoginTimeReward.LoginTimeRewardPopup'); });
    on(this.b.lucky, () => { G.click(); E.ui.showPopup('LuckyWheelPopup'); });
    on(this.b.setting, () => { G.click(); E.ui.showPopup('ProfilePopup'); });
    on(this.b.removeAd, () => G.click()); // IAP: skipped
  }
  onShow() {
    sess().setActiveCharacter(true);
    this.onShowPopupPart1();
    this.onShowPopupPart2();
    this.checkShowIntroModeInstead();
    this.updateDots();
  }
  onHide() {}
  onShowPopupPart1() {
    if (this.block) this.block.setActive(false); if (this.scaleTut) this.scaleTut.setActive(false);
    if (this.profile && this.profile.refresh) { this.profile.refresh(); E.after(0.1, () => this.profile.updateLevel(), this); }
    if (G.moneyMgr && G.moneyMgr.refresh) G.moneyMgr.refresh();
    const dl = E.ui.getPopup('DailyLoginPopup'); if (dl && dl.checkNotification) dl.checkNotification();
    G.music(E.pick(HOME_BGM)); // PlayMusicIfNotPlaying: random home track
    // The original gates Home behind two tutorial steps (first session: only "Start Live"; then only "Collection").
    // Requested: every mode reachable from the start, so all buttons always slide in.
    this.onShowButtons(0.5);
  }
  onShowPopupPart2() {
    this.checkLocalize();
    G.setPref('ReturnHomeCount', G.pref('ReturnHomeCount', 0) + 1);
    act(this.b.live, true);
  }
  checkLocalize() {
    const u = user();
    if (!u.CurrentLanguage || !String(u.CurrentLanguage).trim()) { u.CurrentLanguage = E.lang; G.save(); E.ui.showPopup('Home.PopupLanguage'); }
  }
  checkShowIntroModeInstead() {
    const s = sess(); const m = s.BackFromGameMode | 0; s.BackFromGameMode = 0;
    if (m === 1) { this.onHideButtons(0.5); E.ui.showPopup('Home.PopupPrepare'); }
    else if (m === 2) { this.onHideButtons(0.5); E.ui.showPopup('Home.PopupIntroBlindbag'); }
    else if (m === 3) { this.onHideButtons(0.5); E.ui.showPopup('Home.PopupIntroScoop'); }
  }
  onShowButtons(d) {
    const e = E.ease.outBack, b = this.b;
    if (this.profile && this.profile.onChangeAnchorPositionY) this.profile.onChangeAnchorPositionY(0, d, -60, e);
    if (b.decor) b.decor.onChangeAnchorPositionX(0, d, -120, e);
    const X = (hb, x) => { if (hb) hb.onChangeAnchorPositionX(0.35, d, x, e); };
    X(b.daily, 120); X(b.setting, -88); X(b.dailyTask, 120); X(b.loginTime, 120); X(b.removeAd, -36); X(b.lucky, -120); X(b.dream, 120); X(b.collection, -120); X(b.dumpling, 120);
    moveAxis(this.blindRect, 'x', -120, d, 0.35, e); moveAxis(this.scoopRect, 'x', -120, d, 0.35, e);
    if (b.live) b.live.onChangeAnchorPositionY(0.35, d, 425, e);
  }
  onHideButtons(d) {
    const e = E.ease.inBack, dl = d > 0 ? 0.35 : 0, b = this.b;
    if (this.profile && this.profile.onChangeAnchorPositionY) this.profile.onChangeAnchorPositionY(dl, d, 400, e);
    const X = (hb, x) => { if (hb) hb.onChangeAnchorPositionX(dl, d, x, e); };
    X(b.decor, 250); X(b.daily, -250); X(b.setting, 250); X(b.removeAd, 250); X(b.dailyTask, -250); X(b.loginTime, -250); X(b.lucky, 250); X(b.dream, -250); X(b.collection, 250); X(b.dumpling, -250);
    if (b.live) b.live.onChangeAnchorPositionY(dl, d, -400, e);
    moveAxis(this.blindRect, 'x', 250, d, dl, e); moveAxis(this.scoopRect, 'x', 250, d, dl, e);
  }
  hidePanel() { this.onHideButtons(0.5); }
  showPanel() { this.onShowButtons(0.5); }
  onLiveButtonClicked() { G.click(); this.onHideButtons(0.5); E.ui.showPopup('Home.PopupPrepare'); }
  onCollectionClickerButtonClicked() {
    G.click();
    sess().setActiveCharacter(false);
    E.ui.showScreen('Clicker.ScreenClickerCollection');
    const u = user(); if (!u.IsDoneTutorialCollection) { u.IsDoneTutorialCollection = true; G.save(); } // set by ScreenClickerCollection.OnShow in the original
  }
  showDecor() {
    if (!this.decorPanel) return;
    this.decorPanel.onShow();
    this.onHideButtons(0.5);
    if (this.money) moveAxis(this.money, 'x', -50, 0.5, 0.3, E.ease.inBack);
  }
  onHideDecorPanel(d) {
    if (this.money) moveAxis(this.money, 'x', -168, d, 0, E.ease.outBack);
    this.onShowButtons(0.5);
    if (this.profile && this.profile.refresh) this.profile.refresh();
  }
  moveMoneyLeft() { if (this.money) moveAxis(this.money, 'x', -168, 0.5, 0, E.ease.outBack); }
  setActiveButtonDailyTask(b) { act(this.b.dailyTask, b); }
  update(dt) { this._t = (this._t || 0) + dt; if (this._t >= 0.5) { this._t = 0; this.updateDots(); } }
  updateDots() {
    if (!E.ui) return;
    const dl = E.ui.getPopup('DailyLoginPopup'); if (dl && dl.checkNotification) dl.checkNotification();
    const dt = E.ui.getPopup('DailyTask.PopupDailyTask'); if (dt && dt.updateNoti) dt.updateNoti();
    const lt = E.ui.getPopup('LoginTimeReward.LoginTimeRewardPopup'); if (lt && lt.homeTick) lt.homeTick(goOf(this.b.loginTime));
    if (this.decorPanel && this.decorPanel.updateNoti) this.decorPanel.updateNoti();
  }
}
S.ScreenHome = ScreenHome;

class HomeScreen extends E.ScreenBase { // legacy resources prefab (3 scene buttons)
  onInit() {
    G.onClick(this.ref('_btnStartGame'), () => { G.click(); G.goto('ModeClicker'); });
    G.onClick(this.ref('_btnScoopGame'), () => { G.click(); G.goto('ScoopGame'); });
    G.onClick(this.ref('_btnBlindbagGame'), () => { G.click(); G.goto('BlindbagMinigame'); });
  }
}
S.HomeScreen = HomeScreen;

// ================================================================= intro popups (fake livestream)
const VIEWER_NAMES = 'sharedassets0.assets:14495', VIEWER_AVATARS = 'sharedassets1.assets:848', CHARM_BOX = 'sharedassets1.assets:847';
class IntroPopupBase extends E.PopupBase {
  onInit() {
    this.noPanelAnim = true;
    G.onClick(this.ref('_playButton'), () => this.onButtonPlayClicked());
    G.onClick(this.ref('_backButton'), () => this.onButtonBackClicked());
    this.board = goOf(this.ref('_missionBoard')); if (this.board) this.board.sx = this.board.sy = 0;
    setTxt(this.ref('_txtTipMoney'), this.tip());
  }
  tip() { return '+100'; }
  ch() { return this.ref('_commentHandler'); }
  playGo() { return goOf(this.ref('_playButton')); }
  async onShow() {
    const tok = (this._tok = (this._tok || 0) + 1);
    const pg = this.playGo(); if (pg) { E.killOwner(mvKey(pg)); pg.sx = pg.sy = 1; pg.setActive(false); } inter(this.ref('_playButton'), false);
    if (this.board) { E.killOwner(mvKey(this.board)); this.board.sx = this.board.sy = 0; }
    const pp = this.ref('_profilePanel'); if (pp && pp.refresh) pp.refresh();
    const cg = this.go.comp('CG'); if (cg) { cg.alpha = 1; cg.br = true; }
    const c = this.ch(); if (c) { c.queue = []; c.enabledSpawn = true; c.userComment('Welcome !'); }
    this.beforeWait();
    await E.wait(1, this); if (tok !== this._tok || !this.isShowing) return;
    this.pickCustomer();
    G.sound(4);
    if (this.board) E.scaleTo(this.board, 1, 0.5, { ease: E.ease.outBack, owner: mvKey(this.board) });
    await E.wait(1, this); if (tok !== this._tok || !this.isShowing) return;
    vibrate(100);
    E.after(0.5, () => { if (tok !== this._tok || !this.isShowing) return; const g = this.playGo(); if (g) g.setActive(true); inter(this.ref('_playButton'), true); this.startButtonPlayAnim(); }, this);
  }
  beforeWait() {}
  pickCustomer() {
    const n = E.so(this.d._viewerNameAsset) || E.so(VIEWER_NAMES), a = E.so(this.d._viewerAvatarAsset) || E.so(VIEWER_AVATARS);
    const name = n && n.Contents && n.Contents.length ? E.pick(n.Contents) : 'Wendy';
    const av = a && a.Avatars && a.Avatars.length ? E.pick(a.Avatars) : null;
    setTxt(this.ref('_txtCustomerName'), name); if (av) setSp(this.ref('_customerAvatar'), av);
    sess().OrderAvatar = av; sess().CustomerName = name;
  }
  startButtonPlayAnim() { const g = this.playGo(); if (!g) return; const k = mvKey(g); E.killOwner(k); g.sx = g.sy = 1; E.tween({ dur: 0.5, loops: -1, yoyo: true, ease: E.ease.inOutSine, owner: k, update: (v) => { g.sx = g.sy = 1 + 0.1 * v; } }); }
  stopButtonPlayAnim() { const g = this.playGo(); if (g) { E.killOwner(mvKey(g)); g.sx = g.sy = 1; } }
  stopComments() { const c = this.ch(); if (c) c.enabledSpawn = false; }
  onHide() { this._tok = (this._tok || 0) + 1; this.stopComments(); this.stopButtonPlayAnim(); }
  onButtonPlayClicked() {
    if (G.busy) return;
    G.click(); haptic();
    this.stopButtonPlayAnim(); const g = this.playGo(); if (g) E.punchScale(g, 0.1, 0.2, { owner: mvKey(g) });
    inter(this.ref('_playButton'), false);
    this.stopComments();
    this.play();
  }
  play() {}
  onButtonBackClicked() {
    if (this._backing) return; this._backing = true; E.after(0.3, () => { this._backing = false; });
    G.click(); this.stopComments();
    if (this.board) { E.killOwner(mvKey(this.board)); this.board.sx = this.board.sy = 0; }
    this.hide();
    const s = E.ui.showScreen('ScreenHome'); if (s && s.moveMoneyLeft) s.moveMoneyLeft();
  }
}
class PopupPrepare extends IntroPopupBase {
  play() { const u = user(); u.ClickerPlayTime = (u.ClickerPlayTime || 0) + 1; G.save(); G.goto('ModeClicker'); }
}
S['Home.PopupPrepare'] = PopupPrepare;
class PopupIntroScoop extends IntroPopupBase {
  tip() { return '+200'; } // RemoteConfig A/B default
  beforeWait() {
    const a = E.so(this.d._charmBlindBoxAsset) || E.so(CHARM_BOX); if (!a) return;
    const orders = a.DataList.map((x, i) => ({ Id: x.Id, OrderLocalize: x.OrderLocalize || (a._orders || [])[i] || '' })).filter((x) => x.OrderLocalize);
    if (!orders.length) return;
    const o = E.pick(orders);
    setTxt(this.ref('_txtOrder'), o.OrderLocalize);
    sess().ScoopOrderId = o.Id;
  }
  play() { const u = user(); u.ScoopPlayTime = (u.ScoopPlayTime || 0) + 1; G.save(); G.goto('ScoopGame'); }
}
S['Home.PopupIntroScoop'] = PopupIntroScoop;
class PopupIntroBlindbag extends IntroPopupBase {
  onInit() { super.onInit(); G.onClick(this.ref('_collectionButton'), () => this.onButtonCollectionClicked()); }
  play() { const u = user(); u.BlindbagPlayTime = (u.BlindbagPlayTime || 0) + 1; G.save(); G.goto('BlindbagMinigame'); }
  onButtonCollectionClicked() {
    G.click(); sess().setActiveCharacter(false);
    this.showVisual(false);
    E.ui.showPopup('Home.PopupCollectionBlindbag');
  }
  showVisual(b) { const cg = this.go.comp('CG'); if (cg) { cg.alpha = b ? 1 : 0; cg.br = !!b; cg.ia = !!b; } const c = this.ch(); if (c) c.enabledSpawn = !!b; }
  ShowVisual(b) { this.showVisual(b); }
}
S['Home.PopupIntroBlindbag'] = PopupIntroBlindbag;

class PopupCollectionBlindbag extends E.PopupBase {
  onInit() {
    this.noPanelAnim = true;
    act(this.ref('_blindBagCollection'), false);
    G.onClick(this.ref('_backButton'), () => this.onBack());
    G.onClick(this.ref('_playButton'), () => this.onPlay());
  }
  onShow() {
    inter(this.ref('_backButton'), true); inter(this.ref('_playButton'), true);
    act(this.ref('_blindBagCollection'), true);
    const hc = this.ref('_homeController'); if (hc && hc.go) hc.go.setActive(false);
  }
  onBack() {
    G.click(); sess().setActiveCharacter(true);
    const hc = this.ref('_homeController'); if (hc && hc.go) hc.go.setActive(true);
    this.hide();
    act(this.ref('_blindBagCollection'), false);
    const ib = E.ui.getPopup('Home.PopupIntroBlindbag'); if (ib && ib.showVisual) ib.showVisual(true);
  }
  onPlay() {
    if (G.busy) return;
    G.click(); haptic();
    inter(this.ref('_backButton'), false); inter(this.ref('_playButton'), false);
    const u = user(); u.BlindbagPlayTime = (u.BlindbagPlayTime || 0) + 1; G.save();
    G.goto('BlindbagMinigame');
  }
}
S['Home.PopupCollectionBlindbag'] = PopupCollectionBlindbag;

// ================================================================= small utilities
class BackgroundControl extends E.Behaviour { // scale a SpriteRenderer to cover the camera
  start() { if (this.d._scaleFit) this.scaleFit(); }
  scaleFit() {
    const sr = this.go.comp('SR'); const s = sr && E.sprite(sr.sp); const cam = E.mainCam; if (!s || !cam) return;
    const h = 2 * cam.sz, w = h * (E.W / E.H); const sw = s[10] / s[7], sh = s[11] / s[7];
    const k = Math.max(w / sw, h / sh); this.go.sx = this.go.sy = k;
  }
  setActive(b) { this.go.setActive(b); }
}
S.BackgroundControl = BackgroundControl;
class RotateByDrag extends E.Behaviour { // drag horizontally to spin around the chosen axis (z for 2D), damped
  onBeginDrag() { this._dragged = true; }
  onDrag(ev) { this.vel = -(ev.dx || 0) * (this.d.rotationSpeed || 0.2); this.go.rot += this.vel; }
  onEndDrag() { this._dragged = false; }
  update(dt) { if (this._dragged || !this.vel) return; this.go.rot += this.vel; this.vel *= Math.max(0, 1 - (this.d.rotationDamping || 5) * dt); if (Math.abs(this.vel) < 1e-3) this.vel = 0; }
}
S.RotateByDrag = RotateByDrag;
})();
