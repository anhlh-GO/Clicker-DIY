'use strict';
// Blind bag supermarket (level3)
(() => {
const G = E.Game, S = E.scripts;
G.bagIdList = G.bagIdList || [];
const user = () => G.data().user;
let ctrl = null, tutor = null;
const market = () => E.soByClass('ScoopGame.BlindbagMarketAsset');
const marketData = (id) => market()._dataList.find((x) => x.ID === id) || market()._dataList[id];
E.scenePreload.level3 = () => E.prefabSprites(['sharedassets3.assets:116', 'sharedassets3.assets:112']);
// DOJump helper (world position)
E.jumpWorld = (g, tx, ty, power, dur, o = {}) => {
  const s = g.worldPos();
  return E.tween(Object.assign({ dur, owner: g, ease: E.ease.linear, update: (v) => { g.setWorldPos(s[0] + (tx - s[0]) * v, s[1] + (ty - s[1]) * v + power * 4 * v * (1 - v)); } }, o));
};
// world pointer helpers
const pointerWorld = () => [E.input.wx, E.input.wy];
const clickableAt = (wx, wy, method = 'onMouseButtonDown') => {
  const hits = E.overlapPointAll(wx, wy);
  hits.sort((a, b) => b.idx - a.idx);
  for (const h of hits) { let g = h.g; while (g) { const c = g.comps.find((x) => x instanceof E.Behaviour && typeof x[method] === 'function'); if (c) return c; g = g.parent; } }
  return null;
};
const spineOf = (r) => { const g = G.goOf(r); return g ? g.compInChildren('Spine') : null; };

class BlindbagGameController extends E.Behaviour {
  awake() {
    ctrl = this;
    this.items = G.goOf(this.ref('_itemContainer')).compsInChildren('Blindbag.ItemBase');
    for (const it of this.items) it.onInitItem(this);
    this.basket = this.ref('_basket'); this.basket.controller = this;
    this.scan = this.ref('_scanMachine'); this.scan.onInitialized(this); this.scan.setActive(false);
    G.goOf(this.ref('_storeGo')).setActive(true);
    this.basket.go.setActive(true);
    this.door = this.ref('_door'); this.door.hide(0);
  }
  start() {
    G.bagIdList = [];
    const ds = E.ui.showScreen('Blindbag.DoorScreen');
    ds.onOpen = () => this.onOpenDoor();
    this.door.go.setActive(true);
  }
  onOpenDoor() {
    this.door.open(1, () => {
      E.ui.getScreen('Blindbag.DoorScreen').hide();
      const s = E.ui.showScreen('Blindbag.StoreScreen');
      this.store = s;
      s.onOrder = () => this.orderItems();
      G.goOf(this.ref('_tfShopAndTable')).setActive(true);
      this.door.go.setActive(false);
      this.ref('_inputHandler').draggable = true;
      if (tutor) tutor.showShelf(true);
    });
  }
  onClicked() {
    const [wx, wy] = pointerWorld();
    const c = clickableAt(wx, wy);
    if (c && (c.cls === 'Blindbag.ItemBase' || c.cls === 'Blindbag.Basket')) c.onMouseButtonDown();
  }
  fullBasket() { this.store && this.store.showCartFull(1); }
  updateBasket() {
    const n = this.basket.totalItem(), p = this.basket.totalPrice();
    if (!this.store) return;
    this.store.setCounter(n); this.store.setPrice(p); this.store.confirm.enableState(n > 0);
  }
  enableConfirm(b) { this.store && this.store.confirm.enableState(b); }
  orderItems() {
    const block = G.goOf(this.store.ref('_blockScreen')); if (block) block.setActive(true);
    const bc = this.ref('_basketCollider'); if (bc) bc.enabled = false;
    this.ref('_inputHandler').draggable = false;
    this.scan.setActive(true);
    const t = G.goOf(this.ref('_tfShopAndTable'));
    const fx = t.x;
    E.tween({ dur: 1, ease: E.ease.linear, owner: t, update: (v) => { t.x = fx + (-30 - fx) * v; }, done: () => {
      if (tutor) tutor.showScan(true);
      G.goOf(this.ref('_itemContainer')).setActive(false);
      G.goOf(this.ref('_storeGo')).setActive(false);
      this.scan.setData(this.basket.orderingBags());
      if (block) block.setActive(false);
      const b = this.basket.go; const by = b.y;
      E.tween({ dur: 1, owner: b, update: (v) => { b.y = by + (-12.5 - by) * v; }, done: () => b.setActive(false) });
    } });
  }
  async orderingCompleted() {
    this.scan.onBuyCompleted();
    G.addMoney(-this.basket.totalPrice()); G.sound(47);
    await E.wait(2, this);
    this.scan.setActive(false);
    if (this.store) this.store.hide();
    G.goto('BlindBagCollection');
  }
}
S['Blindbag.BlindbagGameController'] = BlindbagGameController;

// tap detector (tap = release without dragging more than 5px)
class InputHandler extends E.Behaviour {
  onEnable() {
    this.l = E.input.on((t, ev) => {
      if (!this.draggable) return;
      if (t === 'down') { this.overUi = !!E.uiRaycast(ev.x, ev.y); this.clicking = !this.overUi; this.drag = false; this.lx = ev.x; }
      else if (t === 'move' && this.clicking) { if (Math.abs(ev.x - this.lx) > 5 / (E.cssScale || 1)) this.drag = true; this.lx = ev.x; }
      else if (t === 'up') { if (this.clicking && !this.drag && !this.overUi) ctrl && ctrl.onClicked(); this.clicking = false; }
    });
  }
  onDisable() { E.input.off(this.l); }
}
S['Blindbag.InputHandler'] = InputHandler;

class AxisDrag2D extends E.Behaviour {
  onEnable() {
    this.l = E.input.on((t, ev) => {
      if (t === 'down') {
        if (E.uiRaycast(ev.x, ev.y)) return;
        const box = this.go.comp('Box');
        if (box && box.enabled && E.ptInCollider(box, this.go, ev.wx, ev.wy)) { this.dragging = true; this.grab = this.local(ev)[this.d.axis === 1 ? 1 : 0] - (this.d.axis === 1 ? this.go.y : this.go.x); }
      } else if (t === 'move' && this.dragging) {
        const p = this.local(ev); const v = E.clamp(p[this.d.axis === 1 ? 1 : 0] - this.grab, this.d.minValue, this.d.maxValue);
        if (this.d.axis === 1) this.go.y = v; else this.go.x = v;
      } else if (t === 'up') this.dragging = false;
    });
  }
  local(ev) { return this.go.parent ? E.M.ap(E.M.inv(this.go.parent.worldMatrix()), ev.wx, ev.wy) : [ev.wx, ev.wy]; }
  onDisable() { E.input.off(this.l); this.dragging = false; }
}
S.AxisDrag2D = AxisDrag2D;

class ItemBase extends E.Behaviour {
  onInitItem(c) {
    this.controller = c; this.data = marketData(this.d._id);
    const t = E.txtOf(this.ref('_priceText')); if (t) t.text = String(this.data.Price);
    this.orderItems = this.refs('_orderItems').map(G.goOf);
  }
  nearest() {
    const [wx, wy] = pointerWorld(); const px = wx + 0, py = wy - 0.5;
    let best = this.orderItems[0], bd = 1e9;
    for (const it of this.orderItems) { if (!it.activeSelf) continue; const p = it.worldPos(); const d = (p[0] - px) ** 2 + (p[1] - py) ** 2; if (d < bd) { bd = d; best = it; } }
    return best;
  }
  shake(it) {
    E.killOwner(it); it.rot = -5;
    E.tween({ dur: 0.15, loops: 4, yoyo: true, ease: E.ease.linear, owner: it, update: (v) => { it.rot = -5 + 10 * v; }, done: () => { it.rot = 0; } });
  }
  async onMouseButtonDown() {
    G.sound(17);
    const sel = this.nearest();
    const b = this.controller.basket;
    if (b.isFull()) { this.shake(sel); this.controller.fullBasket(); return; }
    if (this.data.Price + b.reviewPrice() > G.money()) { this.shake(sel); E.vibrate(100); G.notEnough(); return; }
    if (tutor) tutor.showShelf(false);
    const point = b.freePoint();
    const pg = G.goOf(point.Point);
    const bag = E.spawn(this.controller.d._orderBagPrefab, pg);
    const bagGo = bag.go || bag;
    bagGo.sx = bagGo.sy = 1.2;
    bag.setSkin(sel);
    bag.bagName = this.data.Name; bag.price = this.data.Price; bag.id = this.d._id;
    const sp = sel.worldPos();
    sel.setActive(false);
    point.bag = bag;
    bagGo.setWorldPos(sp[0], sp[1]);
    const fx = bagGo.x, fy = bagGo.y, fr = bagGo.rot;
    E.tween({ dur: 1, ease: E.ease.inBack, owner: bagGo, update: (v) => { bagGo.x = fx * (1 - v); bagGo.y = fy * (1 - v); } });
    E.tween({ dur: 1, ease: E.ease.linear, owner: bagGo, update: (v) => { bagGo.rot = fr * (1 - v); } });
    point.state = 1; this.controller.updateBasket();
    await E.wait(1, this);
    point.state = 2; G.sound(16); E.vibrate(60); this.controller.updateBasket();
    const s0 = sel.sx; sel.sx = sel.sy = 0; sel.setActive(true);
    E.scaleTo(sel, 0.4, 0.35);
  }
}
S['Blindbag.ItemBase'] = ItemBase;

class Basket extends E.Behaviour {
  awake() { this.points = (this.d._point || []).map((p) => ({ Point: this.ref(p.Point), state: 0, bag: null })); }
  isFull() { return this.points.every((p) => p.state !== 0); }
  freePoint() { return this.points.find((p) => p.state === 0); }
  totalItem() { return this.points.filter((p) => p.state === 2).length; }
  totalPrice() { return this.points.filter((p) => p.state === 2).reduce((s, p) => s + p.bag.price, 0); }
  reviewPrice() { return this.points.filter((p) => p.state !== 0 && p.bag).reduce((s, p) => s + p.bag.price, 0); }
  orderingBags() { return this.points.filter((p) => p.bag).map((p) => p.bag); }
  onMouseButtonDown() { const a = this.ref('_animator'); if (a && a.showUp) a.showUp(); this.removeLast(); }
  removeLast() {
    this.controller.enableConfirm(false);
    for (let i = this.points.length - 1; i >= 0; i--) {
      const p = this.points[i];
      if (p.state === 2) { p.state = 1; G.sound(16); p.bag.fadeOut(1, () => { E.destroy(p.bag.go); p.bag = null; p.state = 0; this.controller.updateBasket(); }); return; }
    }
  }
}
S['Blindbag.Basket'] = Basket;

class ItemAnimator extends E.Behaviour {
  showUp() {
    const g = this.go; E.killOwner(g); g.sx = g.sy = 1;
    E.tween({ dur: 0.15, owner: g, update: (v) => { g.sy = 1 - 0.1 * v; g.sx = 1 + 0.1 * v; }, done: () => E.scaleTo(g, 1, 0.15) });
  }
  shake() { const g = this.go, x = g.sx, y = g.sy; E.tween({ dur: 0.15, owner: g, update: (v) => { g.sy = y * (1 + 0.2 * v); g.sx = x * (1 - 0.2 * v); }, done: () => E.scaleTo(g, [x, y], 0.15) }); }
}
S['Jelly.ItemAnimator'] = ItemAnimator;

class BlindBagAnimation extends E.Behaviour {
  get spine() { return spineOf(this.ref('_spineBag')); }
  setSkin(src) { const s = src.compInChildren ? src.compInChildren('Spine') : src; const sk = s && (s.skin || (s.skeleton && s.skeleton.skin && s.skeleton.skin.name)); if (sk && this.spine) E.spineSkin(this.spine, sk); this.skinName = sk; }
  fadeOut(d, cb) { const s = this.spine; if (!s) { cb && cb(); return; } E.tween({ dur: d, owner: this, ease: E.ease.linear, update: (v) => { s.color[3] = 1 - v; }, done: cb }); }
  initBuying(target) { this.go.rot = E.randInt(-70, 70); this.cached = [this.go.x, this.go.y, this.go.rot]; this.target = target; }
  addCollider() { if (!this.go.comp('Box')) this.go.comps.push({ t: 'Box', sz: [1.6, 2.0], of: [0, -0.2], enabled: true, go: this.go }); }
  onMouseButtonDown() { this.go.rot = 0; }
  onMouseButtonDrag() {
    if (this.triggered || !this.target) return;
    const [wx, wy] = pointerWorld(); const k = E.clamp(E.dt * 20, 0, 1);
    const p = this.go.worldPos(); const nx = p[0] + (wx - p[0]) * k, ny = p[1] + (wy - p[1]) * k;
    this.go.setWorldPos(nx, ny);
    const t = this.target.worldPos();
    if (Math.abs(nx - t[0]) < 1 && Math.abs(ny - t[1]) < 0.5) { this.triggered = true; if (this.onScan) this.onScan(this); }
  }
  onMouseButtonUp() { if (!this.triggered && this.cached) { this.go.x = this.cached[0]; this.go.y = this.cached[1]; this.go.rot = this.cached[2]; } }
}
S['Blindbag.BlindBagAnimation'] = BlindBagAnimation;

class ScanMachine extends E.Behaviour {
  onInitialized(c) {
    this.controller = c; this.dict = {};
    for (const k of ['_outroHeart', '_outroBag']) { const g = G.goOf(this.ref(k)); if (g) g.sx = g.sy = 0; }
  }
  setActive(v) { this.go.setActive(v); const i = G.goOf(this.ref('_introGo')); if (i) i.setActive(v); }
  onEnable() { this.draggable = true; this.l = E.input.on((t, ev) => this.onInput(t, ev)); }
  onDisable() { E.input.off(this.l); }
  onInput(t, ev) {
    if (!this.draggable) return;
    if (t === 'down') { if (E.uiRaycast(ev.x, ev.y)) return; const c = clickableAt(ev.wx, ev.wy); this.hit = c && c.cls === 'Blindbag.BlindBagAnimation' && !c.triggered ? c : null; if (this.hit) this.hit.onMouseButtonDown(); }
    else if (t === 'up') { if (this.hit) this.hit.onMouseButtonUp(); this.hit = null; }
  }
  update() { if (this.hit && E.input.down) this.hit.onMouseButtonDrag(); }
  setData(bags) {
    this.bags = bags; this.scanned = 0;
    const cont = G.goOf(this.ref('_containerBag'));
    const bl = G.goOf(this.ref('_bottomLeft')).worldPos(), tr = G.goOf(this.ref('_topRight')).worldPos();
    bags.forEach((bag, i0) => {
      const i = i0 + 1; const g = bag.go;
      E.killOwner(g);
      g.setParent(cont, true);
      g.z = 0.1 * i;
      const delay = 0.2 * i;
      const s0 = g.sx;
      E.tween({ dur: 0.5, delay, ease: E.ease.linear, owner: g, onStart: () => G.sound(17), update: (v) => { g.sx = g.sy = s0 + (1.4 - s0) * v; } });
      E.jumpWorld(g, E.rand(bl[0], tr[0]), E.rand(bl[1], tr[1]), 1, 0.5, { delay, done: () => bag.initBuying(G.goOf(this.ref('_scanPos'))) });
      bag.onScan = (b) => this.onScanItem(b);
      bag.addCollider();
    });
  }
  onScanItem(bag) {
    G.goOf(this.ref('_introGo')).setActive(false); G.goOf(this.ref('_billGo')).setActive(true);
    G.sound(59); if (tutor) tutor.showScan(false);
    this.scanAnim(() => {
      const name = bag.bagName;
      if (this.dict[name]) this.dict[name].updatePrice(bag.price);
      else { const line = E.spawn(this.d._billLinePrefab, G.goOf(this.ref('_billContainer'))); line.setData(name, bag.price); this.dict[name] = line; }
      this.updateTotal(); E.vibrate(50);
    }, () => {
      const g = bag.go; const fx = g.x;
      E.tween({ dur: 0.5, owner: g, update: (v) => { g.x = fx + 10 * v; }, done: () => { E.destroy(g); this.scanned++; if (this.scanned >= this.bags.length) this.controller.orderingCompleted(); } });
    });
  }
  scanAnim(onTrig, onDone) {
    const l = G.goOf(this.ref('_scanLineTf'));
    l.x = 0; l.y = -0.4; l.sx = l.sy = 0.5;
    E.tween({ dur: 0.5, ease: E.ease.linear, owner: l, update: (v) => { l.y = -0.4 + (0.6 + 0.4) * v; }, done: () => {
      onTrig();
      E.tween({ dur: 0.5, ease: E.ease.linear, owner: l, update: (v) => { l.y = 0.6 - 1.2 * v; }, done: () => { l.sx = l.sy = 0; onDone(); } });
    } });
  }
  updateTotal() { const t = E.txtOf(this.ref('_totalText')); if (t) t.text = String(Object.values(this.dict).reduce((s, l) => s + l.total, 0)); }
  onBuyCompleted() {
    G.goOf(this.ref('_introGo')).setActive(false); G.goOf(this.ref('_billGo')).setActive(false); G.goOf(this.ref('_outroGo')).setActive(true);
    const h = G.goOf(this.ref('_outroHeart')), b = G.goOf(this.ref('_outroBag'));
    if (h) E.scaleTo(h, 1, 0.5, { delay: 0.5, ease: E.ease.outBack });
    if (b) E.scaleTo(b, 1, 0.5, { ease: E.ease.outBack });
    G.bagIdList.push(...this.bags.map((x) => x.id));
    const p = spineOf(this.ref('_pinginCashier')); if (p) E.spinePlay(p, 'happy_idle', true);
  }
}
S['Blindbag.ScanMachine'] = ScanMachine;

class BillLine extends E.Behaviour {
  setData(name, price) { this.n = 1; this.name = name; this.total = price; this.upd(); }
  updatePrice(p) { this.total += p; this.n++; this.upd(); }
  upd() { const a = E.txtOf(this.ref('_itemNameText')); if (a) a.text = this.name + ' x' + this.n; const b = E.txtOf(this.ref('_priceText')); if (b) b.text = String(this.total); }
}
S['Blindbag.BillLine'] = BillLine;

class Door extends E.Behaviour {
  parts() { return ['_leftDoor', '_rightDoor', '_roof'].map((k) => G.goOf(this.ref(k))); }
  hide(d) { const [l, r, f] = this.parts(); for (const g of [l, r, f]) g.setActive(true); l.x = 0; r.x = 0; f.y = 8; }
  open(d, cb) {
    G.sound(22);
    const [l, r, f] = this.parts();
    const lx = l.x, rx = r.x, fy = f.y;
    E.tween({ dur: d, ease: E.ease.outQuad, owner: this, update: (v) => { l.x = lx + (-10 - lx) * v; r.x = rx + (10 - rx) * v; f.y = fy + (13.5 - fy) * v; }, done: () => { l.setActive(false); r.setActive(false); f.setActive(false); cb && cb(); } });
  }
}
S['Blindbag.Door'] = Door;

class DoorScreen extends E.ScreenBase {
  onInit() { const b = this.ref('_openDoorButton'); G.onClick(b, () => { G.goOf(b).setActive(false); if (this.onOpen) this.onOpen(); }); }
  onShow() { G.music('bgm_ingame_1'); }
}
S['Blindbag.DoorScreen'] = DoorScreen;

class MarketButton extends E.Behaviour {
  awake() { this.en = true; }
  enableState(v) { this.en = v; const b = this.ref('_button'); const img = b && b.go.comp('Img'); if (img) img.sp = v ? this.d._onSprite : this.d._offSprite; }
}
S['Blindbag.MarketButton'] = MarketButton;

class NotiCanvas extends E.Behaviour {
  awake() { this.cg = this.ref('_canvasGroup'); this.y0 = this.go.rt[5]; if (this.cg) this.cg.alpha = 0; }
  reset() { E.killOwner(this); if (this.cg) this.cg.alpha = 0; this.go.rt[5] = this.y0; this.showing = false; }
  show(d) {
    if (this.showing) return; this.showing = true;
    if (this.cg) this.cg.alpha = 1;
    this.tween({ dur: d, update: (v) => { if (this.cg) this.cg.alpha = 1 - v; this.go.rt[5] = this.y0 + 150 * v; }, done: () => { if (this.cg) this.cg.alpha = 0; this.go.rt[5] = this.y0; } });
  }
}
S['Blindbag.NotiCanvas'] = NotiCanvas;

class StoreScreen extends E.ScreenBase {
  onInit() {
    this.confirm = this.go.findDeep('ConfirmButton').comp('Blindbag.MarketButton') || this.ref('_confirmOrderButton');
    G.onClick(this.confirm.ref ? this.confirm.ref('_button') : this.confirm, () => { if (!this.confirm.en) return; G.click(); G.goOf(this.ref('_bottomPanel')).setActive(false); if (this.onOrder) this.onOrder(); });
    G.onClick(this.ref('_closeButton'), () => { G.click(); E.ui.showPopup('Clicker.BackHomePopup'); });
    const bs = G.goOf(this.ref('_blockScreen')); if (bs) bs.setActive(false);
    this.animButtons(false, 0.1);
  }
  rts() { return { cnt: G.goOf(this.ref('_itemCounterRectTransform')), tot: G.goOf(this.ref('_totalPriceRectTransform')), close: G.goOf(this.ref('_closeButtonTransform')), money: G.goOf(this.ref('_moneyRectTransform')), conf: G.goOf(this.ref('_confirmOrderRectTransform')) }; }
  animButtons(show, d) {
    const r = this.rts(); const ease = show ? E.ease.outBack : E.ease.inBack;
    const mv = (g, axis, v) => { if (!g) return; const f = g.rt[axis]; E.tween({ dur: d, ease, owner: g, update: (k) => { g.rt[axis] = f + (v - f) * k; } }); };
    if (show) { mv(r.cnt, 4, 40); mv(r.tot, 4, 40); mv(r.close, 5, -40); mv(r.money, 5, -100); mv(r.conf, 4, -140); }
    else { mv(r.cnt, 4, -400); mv(r.tot, 4, -400); mv(r.close, 5, 150); mv(r.money, 5, 100); mv(r.conf, 4, 200); }
  }
  onShow() {
    this.confirm.enableState(false);
    this.animButtons(true, 0.35);
    { const c = G.goOf(this.ref('_closeButton')); if (c) c.setActive(true); } // always offer Home
  }
  setCounter(n) { const t = E.txtOf(this.ref('_itemCountText')); if (t) t.text = n + '/5'; }
  setPrice(p) { const t = E.txtOf(this.ref('_priceText')); if (t) t.text = String(p); }
  showCartFull(d) { const n = this.ref('_cartFullNotiCanvas'); if (n) { n.reset(); n.show(d); } }
}
S['Blindbag.StoreScreen'] = StoreScreen;

class TutorialBlindBag extends E.Behaviour {
  awake() { tutor = this; this.showShelf(false); this.showScan(false); }
  can() { return !user().IsDoneTutorialBlindBag; }
  showShelf(b) { const g = G.goOf(this.ref('_tutorialClickBagOnShelf')); if (g) { g.setActive(false); if (b && this.can()) g.setActive(true); } }
  showScan(b) { const g = G.goOf(this.ref('_tutorialScanItem')); if (g) { g.setActive(false); if (b && this.can()) g.setActive(true); } }
}
S['Blindbag.TutorialBlindBag'] = TutorialBlindBag;

// generic "Quit game / Progress will be lost" popup used by mini games
class BackHomePopup extends E.PopupBase {
  panel() { return G.goOf(this.ref('_tfPanel')); }
  onInit() {
    G.onClick(this.ref('_btnConfirm'), () => { G.click(); this.hide(); if (G.session) G.session._quitToHome = true; G.goto('Home'); });
    G.onClick(this.ref('_btnCancel'), () => { G.click(); this.hide(); });
    G.onClick(this.ref('_btnCancel2'), () => { G.click(); this.hide(); });
  }
}
S['Clicker.BackHomePopup'] = BackHomePopup;
})();
