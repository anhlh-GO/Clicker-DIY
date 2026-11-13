'use strict';
// Dream House (level5): room decorating
(() => {
const G = E.Game;
const S = E.scripts;
const ev = { init: new Set() }; // static RoomController.OnInitialized
const DH = () => {
  const s = G.data();
  if (!s.dh) s.dh = { IsFirstTime: true, IsDoneTutorial: false, CurrentRoomIndex: 0, UnlockedRooms: [0, 1, 2], CurrentRoomSteps: {}, RoomSaved: {} };
  return s.dh;
};
const steps = () => DH().CurrentRoomSteps;
const stepCount = () => Object.keys(steps()).length;
const addStep = (step, opt) => { const d = DH(); d.CurrentRoomSteps[step] = opt; d.RoomSaved[d.CurrentRoomIndex] = Object.assign({}, d.CurrentRoomSteps); G.save(); };
const setRoomIndex = (i) => { const d = DH(); d.CurrentRoomIndex = i; if (!d.RoomSaved[i]) d.RoomSaved[i] = {}; G.save(); };
const loadSteps = () => { const d = DH(); d.CurrentRoomSteps = Object.assign({}, d.RoomSaved[d.CurrentRoomIndex] || {}); };
const unlockedDH = () => !!G.data().user.IsUnlockedDreamHouse;
const setUnlockedDH = () => { if (!unlockedDH()) { G.data().user.IsUnlockedDreamHouse = true; G.save(); } };
const asset = () => {
  const a = E.soByClass('DreamHouse.DreamHouseAsset');
  return { Rooms: a.Rooms.map((k) => { const r = E.so(k); return { key: k, Name: r.Name, Icon: r.Icon, RoomPrefab: r.RoomPrefab, DecorItems: r.DecorItems.map((di) => ({ ItemList: di.ItemList.map((x) => E.so(x)) })) }; }) };
};
let ctrl = null;
E.scenePreload.level5 = () => {
  const a = asset(); const refs = [];
  for (const r of a.Rooms) { refs.push(r.RoomPrefab); for (const di of r.DecorItems) for (const c of di.ItemList) refs.push(c.ItemPrefab); }
  const out = E.prefabSprites(refs);
  for (const r of a.Rooms) for (const di of r.DecorItems) for (const c of di.ItemList) out.add(c.Icon);
  return out;
};

class DreamHouseController extends E.Behaviour {
  awake() { ctrl = this; this.asset = asset(); }
  start() {
    if (G.camCtl) G.camCtl.setSize(13.5, true);
    G.music('bgm_home_2');
    const scr = E.ui.showScreen('DreamHouse.ScreenInGame');
    this.screen = scr;
    this.DecorItemPanel = scr.ref('_decorItemPanel');
    this.IsCompletedAllRoom = false;
    this.idx = DH().CurrentRoomIndex || 0;
    this.startRoom(this.idx);
    if (!G.pref('dream_house_play')) G.setPref('dream_house_play', 1);
  }
  startRoom(i) {
    if (i < 0 || i >= this.asset.Rooms.length) return;
    this.idx = i;
    if (this.CurrentRoom) E.destroy(this.CurrentRoom.go);
    const g = E.spawn(this.asset.Rooms[i].RoomPrefab, null);
    g.x = 0; g.y = 1; g.z = 0;
    this.CurrentRoom = g.comp('DreamHouse.RoomController');
    this.CurrentRoom.initialize(this.asset.Rooms[i]);
  }
  completedRoom() { if (this.CurrentRoom) { E.destroy(this.CurrentRoom.go); this.CurrentRoom = null; } this.startRoom(this.idx); }
  unlockNextRoom() {
    this.idx++;
    if (this.idx < this.asset.Rooms.length) { const u = DH().UnlockedRooms; if (!u.includes(this.idx)) u.push(this.idx); }
    else { this.idx = 0; this.IsCompletedAllRoom = true; }
    setRoomIndex(this.idx); loadSteps();
  }
  saveCurrentRoomStep(opt) { addStep(this.CurrentRoom.currentStep, opt); }
}
S['DreamHouse.DreamHouseController'] = DreamHouseController;

class RoomController extends E.Behaviour {
  awake() { this.items = this.refs('_decorItems'); this.stepCbs = []; this.doneCbs = []; }
  initialize(cfg) {
    this.cfg = cfg;
    this.items.forEach((it, i) => it.onInit(cfg.DecorItems[i], (x) => this.onMarkPoint(x)));
    this.currentStep = stepCount();
    this.CurrentDecorItem = null;
    if (this.currentStep < this.items.length) { this.CurrentDecorItem = this.items[this.currentStep]; this.CurrentDecorItem.setActiveMarkPoint(true); }
    for (const [s, o] of Object.entries(steps())) if (this.items[+s]) this.items[+s].createObject(o);
    for (const f of ev.init) f();
  }
  isFirstStep() { return this.currentStep === 0; }
  nextStep() {
    if (this.currentStep < this.items.length - 1) {
      this.CurrentDecorItem.setActiveMarkPoint(false); this.currentStep++;
      this.CurrentDecorItem = this.items[this.currentStep]; this.CurrentDecorItem.setActiveMarkPoint(true);
      for (const f of this.stepCbs) f(this.currentStep);
    } else {
      this.CurrentDecorItem = null;
      for (const f of this.stepCbs) f(this.items.length);
      ctrl.unlockNextRoom();
      for (const f of this.doneCbs) f();
      if (DH().IsFirstTime) { DH().IsFirstTime = false; G.save(); }
    }
  }
  onMarkPoint() {
    if (!this.CurrentDecorItem) return;
    G.click();
    this.CurrentDecorItem.setActiveMarkPoint(false);
    const a = this.cfg.DecorItems[this.currentStep];
    E.after(0.1, () => ctrl.DecorItemPanel.onShowPanel(a), this);
    if (tut) tut.setHand(0, false);
  }
}
S['DreamHouse.RoomController'] = RoomController;

class DecorItem extends E.Behaviour {
  awake() { this.idx = -1; this.obj = null; }
  onInit(asset, cb) {
    this.asset = asset;
    const mp = this.ref('_markPointButton');
    this.mp = mp;
    if (mp) { mp.setInteractable(false); mp.go.setActive(false); mp.listeners = [() => cb(this)]; }
  }
  setActiveMarkPoint(b) { if (this.mp) { this.mp.go.setActive(b); this.mp.setInteractable(b); } }
  createObject(i) {
    i = +i;
    if (this.obj && this.idx === i) return this.obj;
    if (this.obj) { E.destroy(this.obj); this.obj = null; }
    this.idx = i;
    const c = this.asset.ItemList[i];
    const g = E.spawn(c.ItemPrefab, this.go);
    const p = c.Position || [0, 0, 0];
    g.x = p[0]; g.y = p[1]; g.z = p[2] || 0; g.rot = 0; g.sx = g.sy = 1;
    this.obj = g;
    return g;
  }
  markPos() { return this.mp ? this.mp.go.worldPos() : this.go.worldPos(); }
}
S['DreamHouse.DecorItem'] = DecorItem;

class ButtonObject extends E.Behaviour {
  awake() { this.interactable = true; this.listeners = this.listeners || []; this.col = this.go.comps.find((c) => c.t === 'Box' || c.t === 'Circle' || c.t === 'Poly'); }
  setInteractable(b) { this.interactable = b; if (this.col) this.col.enabled = b; }
  onPointerDown() { if (!this.interactable) return; for (const f of this.listeners.slice()) f(this); }
}
S['DreamHouse.ButtonObject'] = ButtonObject;

class MarkPointAnimation extends E.Behaviour {
  onEnable() {
    if (this.by == null) { this.by = this.go.y; this.bs = this.go.sx; }
    this.go.y = this.by; this.go.sx = this.go.sy = this.bs;
    const g = this.go, y0 = this.by, s0 = this.bs;
    this.tween({ dur: 0.8, loops: -1, yoyo: true, ease: E.ease.inOutSine, update: (v) => { g.y = y0 + 0.35 * v; } });
    this.tween({ dur: 0.8, loops: -1, yoyo: true, ease: E.ease.inOutQuad, update: (v) => { g.sx = g.sy = s0 + (1.1 - s0) * v; } });
  }
  onDisable() { this.kill(); if (this.by != null) { this.go.y = this.by; this.go.sx = this.go.sy = this.bs; } }
}
S['DreamHouse.MarkPointAnimation'] = MarkPointAnimation;

class DecorItemPanel extends E.Behaviour {
  onInit() {
    this.cg = this.ref('_canvasGroup');
    this.items = this.refs('_items');
    this.setVisible(false);
    this.selected = null;
    for (const it of this.items) it.addListeners((u) => this.onSelect(u), (u) => this.onCoin(u), (u) => this.onAds(u));
  }
  setVisible(b) { if (!this.cg) return; this.cg.alpha = b ? 1 : 0; this.cg.ia = b; this.cg.br = b; }
  onShowPanel(a) {
    this.asset = a;
    this.items.forEach((it, i) => it.onInitCard(a.ItemList[i]));
    this.setVisible(true);
    this.items.forEach((it, i) => E.after(0.15 * i, () => it.onShowAnim(), this));
    E.after(0.15 * this.items.length, () => { if (DH().IsFirstTime && ctrl.CurrentRoom.currentStep === 0 && tut) tut.setHand(1, true); }, this);
  }
  onHide() { this.setVisible(false); this.selected = null; }
  setInteractableItems(b) { for (const it of this.items) it.setInteractable(b); }
  setSelected(u) { if (u === this.selected) return; if (this.selected) this.selected.setSelected(false); this.selected = u; u.setSelected(true); }
  place(u) {
    const idx = this.items.indexOf(u);
    const di = ctrl.CurrentRoom.CurrentDecorItem;
    di.createObject(idx);
    const fx = G.goOf(this.ref('_decorItemEffect'));
    if (fx) { const p = di.markPos(); fx.setWorldPos(p[0], p[1]); E.psPlay(fx); }
    if (tut) { tut.setHand(1, false); tut.done(); }
    G.sound(31);
  }
  onSelect(u) {
    setUnlockedDH();
    if (u.IsUnlocked) return;
    G.click(); this.place(u); this.setSelected(u);
  }
  onCoin(u) {
    G.click(); setUnlockedDH();
    if (u.Price > G.money()) { G.notEnough(); return; }
    G.addMoney(-u.Price); G.sound(47);
    this.commit(u);
  }
  onAds(u) { G.click(); G.sound(47); setUnlockedDH(); this.commit(u); }
  commit(u) {
    this.setInteractableItems(false);
    this.place(u); u.unlocked(); this.setSelected(u);
    this.onHide();
    ctrl.saveCurrentRoomStep(this.items.indexOf(u));
    ctrl.CurrentRoom.nextStep();
  }
}
S['DreamHouse.DecorItemPanel'] = DecorItemPanel;

class DecorItemUI extends E.Behaviour {
  addListeners(sel, coin, ads) {
    G.onClick(this.ref('_selectButton'), () => sel(this));
    G.onClick(this.ref('_buttonFree'), () => coin(this));
    G.onClick(this.ref('_buttonCoin'), () => coin(this));
    G.onClick(this.ref('_buttonAds'), () => ads(this));
  }
  onInitCard(cfg) {
    if (this.y0 == null) this.y0 = this.go.rt[5];
    this.cfg = cfg; this.IsUnlocked = false; this.setInteractable(true);
    const ic = this.ref('_icon'); if (ic) ic.sp = cfg.Icon;
    this.Price = cfg.Price;
    if (DH().IsFirstTime && ctrl.CurrentRoom.isFirstStep()) this.Price = 0;
    const pt = E.txtOf(this.ref('_priceText')); if (pt) pt.text = String(this.Price);
    const vis = (k, b) => { const g = G.goOf(this.ref(k)); if (g) g.setActive(b); };
    if (unlockedDH()) { vis('_buttonFree', false); vis('_buttonAds', cfg.UnlockType === 1); vis('_buttonCoin', cfg.UnlockType === 2); }
    else { vis('_buttonFree', true); vis('_buttonAds', false); vis('_buttonCoin', false); this.Price = 0; }
    this.setSelected(false);
    const cg = this.ref('_canvasGroup'); if (cg) cg.alpha = 0;
  }
  onShowAnim() {
    const g = this.go; E.killOwner(g);
    g.rt[5] = this.y0 - 100;
    const cg = this.ref('_canvasGroup'); if (cg) E.fadeTo(cg, 1, 0.5);
    E.moveTo(g, g.rt[4], this.y0, 0.5, { ease: E.ease.outQuad });
  }
  unlocked() { this.IsUnlocked = true; for (const k of ['_buttonCoin', '_buttonAds', '_buttonFree']) { const g = G.goOf(this.ref(k)); if (g) g.setActive(false); } }
  setInteractable(b) { for (const k of ['_selectButton', '_buttonCoin', '_buttonAds', '_buttonFree']) { const bt = G.btn(this.ref(k)); if (bt) bt.interactable = b; } }
  setSelected(b) { const g = G.goOf(this.ref('_selectedObject')); if (g) g.setActive(b); }
}
S['DreamHouse.DecorItemUI'] = DecorItemUI;

class ProgressBar extends E.Behaviour {
  setActive(b) { this.go.setActive(b); if (b) { const f = this.ref('_progressValue'); if (f) { E.killOwner(this); f.fa = 0; } } }
  setValue(v) { const f = this.ref('_progressValue'); if (f) f.fa = v / this.max; const t = E.txtOf(this.ref('_progressText')); if (t) t.text = v + '/' + this.max; }
  doValue(v, dur) { const f = this.ref('_progressValue'); E.killOwner(this); if (f) { const a = f.fa || 0, b = v / this.max; this.tween({ dur, update: (k) => { f.fa = a + (b - a) * k; } }); } const t = E.txtOf(this.ref('_progressText')); if (t) t.text = v + '/' + this.max; }
}
S['DreamHouse.ProgressBar'] = ProgressBar;

class ScreenInGame extends E.ScreenBase {
  onInit() {
    G.onClick(this.ref('_backButton'), () => { G.click(); G.goto('Home'); });
    G.onClick(this.ref('_doneButton'), () => { G.click(); if (ctrl.IsCompletedAllRoom) G.goto('Home'); else E.ui.showPopup('DreamHouse.PopupNewRoom'); });
    G.onClick(this.ref('_listHomeButton'), () => { G.click(); E.ui.showPopup('DreamHouse.PopupListRoom'); });
    this.l = () => this.onRoomInit(); ev.init.add(this.l);
    this.ref('_decorItemPanel').onInit();
  }
  onDestroy() { ev.init.delete(this.l); }
  onRoomInit() {
    const done = G.goOf(this.ref('_doneButton')); if (done) done.setActive(false);
    ctrl.DecorItemPanel.onHide();
    const bar = this.ref('_progressBar'); bar.max = ctrl.CurrentRoom.cfg.DecorItems.length; bar.setActive(true); bar.setValue(ctrl.CurrentRoom.currentStep);
    ctrl.CurrentRoom.stepCbs.push((s) => bar.doValue(s, 0.3));
    ctrl.CurrentRoom.doneCbs.push(() => { if (done) done.setActive(true); });
  }
}
S['DreamHouse.ScreenInGame'] = ScreenInGame;

class PopupListRoom extends E.PopupBase {
  onInit() {
    G.onClick(this.ref('_btnClose'), () => { G.click(); this.hide(); });
    this.items = [];
    const content = G.goOf(this.ref('_content'));
    for (const r of ctrl.asset.Rooms) {
      const ui = E.spawn(this.d._roomItemPrefab, content);
      ui.onInitItem(r, (it) => this.onSelect(it));
      this.items.push(ui);
    }
    this.l = () => this.setSelectedRoom(this.items[ctrl.asset.Rooms.indexOf(ctrl.CurrentRoom.cfg)]); ev.init.add(this.l);
    this.l();
  }
  onDestroy() { ev.init.delete(this.l); }
  onShow() { for (const it of this.items) it.setUnlocked(true); }
  setSelectedRoom(it) { if (!it || it === this.sel) return; if (this.sel) this.sel.setSelected(false); this.sel = it; it.setSelected(true); }
  onSelect(it) {
    G.click();
    if (it === this.sel) return;
    const idx = this.items.indexOf(it);
    setRoomIndex(idx); loadSteps(); ctrl.startRoom(idx); this.setSelectedRoom(it); this.hide();
  }
}
S['DreamHouse.PopupListRoom'] = PopupListRoom;

class RoomItemUI extends E.Behaviour {
  onInitItem(cfg, cb) {
    G.onClick(this.ref('_selectButton'), () => cb(this));
    const ic = this.ref('_iconImage'); if (ic) ic.sp = cfg.Icon;
    this.setSelected(false);
  }
  setUnlocked(b) { const l = G.goOf(this.ref('_lockImage')); if (l) l.setActive(!b); const bt = G.btn(this.ref('_selectButton')); if (bt) bt.interactable = b; }
  setSelected(b) { const s = G.goOf(this.ref('_selectedObject')); if (s) s.setActive(b); }
}
S['DreamHouse.RoomItemUI'] = RoomItemUI;

class PopupNewRoom extends E.PopupBase {
  onInit() {
    G.onClick(this.ref('_backButton'), () => { G.click(); this.hide(); });
    G.onClick(this.ref('_decorateButton'), () => { G.click(); this.hide(); ctrl.completedRoom(); });
  }
  show() { this.noPanelAnim = true; super.show(); const p = this.panel(); if (p) { E.killOwner(p); p.sx = p.sy = 0; E.scaleTo(p, 1, 0.36, { ease: E.ease.outBack }); } return this; }
}
S['DreamHouse.PopupNewRoom'] = PopupNewRoom;

let tut = null;
class TutorialHandler extends E.Behaviour {
  awake() { tut = this; this.hands = this.refs('_handTutorials').map(G.goOf); }
  onEnable() { this.l = () => { if (!DH().IsDoneTutorial && DH().IsFirstTime && stepCount() === 0) this.setHand(0, true); }; ev.init.add(this.l); }
  onDisable() { ev.init.delete(this.l); }
  setHand(i, b) { if (DH().IsDoneTutorial) return; const h = this.hands[i]; if (h && h.activeSelf !== b) h.setActive(b); }
  done() { if (!DH().IsDoneTutorial) { DH().IsDoneTutorial = true; G.save(); } }
}
S['DreamHouse.TutorialHandler'] = TutorialHandler;

class DreamHouseFirstGameTutorial extends E.Behaviour {
  awake() { const b = G.goOf(this.ref('_btnIntro')); if (b) b.setActive(false); const h = G.goOf(this.ref('_tfHighlight')); if (h) h.setActive(false); }
}
S.DreamHouseFirstGameTutorial = DreamHouseFirstGameTutorial;
})();
