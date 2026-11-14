'use strict';
// Dumpling mode (level7): the core loop of NOC's "Dumpling Idol Livestream" game (bf pack, tools/bf_export.py),
// rebuilt on its original views: LoadingGoShop (doors) -> MainShop (8 blind-bag shelves, cart of 6) -> Pay (drag boxes onto the
// scanner, receipt) -> Livestream (pick a room, countdown, tap a box 3x, swipe to tear the label, reveal a dumpling onto the room
// shelf, chat / viewers / coins) -> End popup (x2..x5 sweep). Coins are Clicker DIY's wallet.
// Numbers come from the original data: ChestTable (rarity rates, prices), RoomNameTable (per-room dumpling rarity + weight),
// LivestreamConfig, LivestreamArtLibrary (box / room / dumpling art + shelf positions). Home features of that game are not ported.
(() => {
const G = E.Game, S = E.scripts;
const goOf = (r) => G.goOf(r);
const vib = (ms) => E.vibrate(ms || 30);
const RARITY = ['Common', 'Rare', 'Epic', 'Legendary'];
const CHAT_SET = ['openCommon', 'openRare', 'openEpic', 'openMythic'];
const MAX_CART = 6, MIN_BUY = 4; // Buy is enabled at 4+ bags (ShopMainView)
let P = null, ctrl = null;
E.scenePacks.level7 = 'bf';
G.SCENES.Dumpling = 'level7';

// ---------------------------------------------------------------- data
let bfNames = null;
const bfSprite = (name) => { if (!bfNames) { bfNames = {}; for (const k in P.spr) bfNames[P.spr[k][9]] = k; } return bfNames[name]; };
const so = (cls) => { for (const k in E.D.so) if (E.D.so[k].cls === cls && E.D.so[k].d && k.startsWith('bf:')) return E.D.so[k].d; return null; };
const str = (key, ...a) => { let s = (P.strings && P.strings[key]) || key; a.forEach((v, i) => { s = s.replace('{' + i + '}', v); }); return s; };
const chests = () => P.db.ChestTable;
const chestOf = (packType) => chests().find((c) => c.id === packType) || chests()[0];
const chestName = (c) => str('chest.' + ['Common', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Epic', 'Legendary', 'Mythic'][c.id]);
const rates = (c) => { const out = []; const re = /\((\w+),([\d.]+)\)/g; let m; while ((m = re.exec(c.rewards.params[1] || ''))) out.push([RARITY.indexOf(m[1]), +m[2]]); return out.filter((x) => x[0] >= 0); };
const boxArt = (c) => { const art = so('NK.LivestreamArtLibrary'); return art._boxes.find((b) => b.Box === c.id) || art._boxes[0]; }; // _boxes[ChestType]
const save = () => { const s = G.data(); if (!s.dumpling) s.dumpling = { owned: {}, room: -1, lives: 0, exp: 0 }; if (s.dumpling.exp == null) s.dumpling.exp = 0; return s.dumpling; };
const owned = (room, id) => (save().owned[room] || []).includes(id);
const roomRow = (room) => P.db.RoomNameTable.find((r) => r.room === room);
// DumplingUnboxService: a dumpling exists when it has a table row and art; a room needs both (-> rooms 0, 1, 4, 6)
const roomDumplings = (room) => { const r = roomRow(room); if (!r) return []; return so('NK.LivestreamArtLibrary')._dumplings.filter((d) => d.Room === room && r.dumplings.some((x) => x.id === d.Id)); };
const rooms = () => P.db.RoomNameTable.slice().sort((a, b) => a.sort - b.sort).map((r) => r.room).filter((r) => so('NK.LivestreamArtLibrary')._rooms.some((a) => a.Room === r) && roomDumplings(r).length);
const roomUnlockLevel = (room) => Math.max(1, (roomRow(room) || {}).unlockLevel || 0);
// player level of this mode (PlayerLevelTable; +3000 exp per finished live)
const levelOf = (exp) => { let lv = 1; for (const [l, need] of P.db.PlayerLevelTable) if (exp >= need) lv = l; return lv; };
const playerLevel = () => levelOf(save().exp);
const isComplete = (room) => roomDumplings(room).every((d) => owned(room, d.Id));
const currentRoom = () => { const un = rooms().filter((r) => roomUnlockLevel(r) <= playerLevel()); return un.find((r) => !isComplete(r)) ?? un[un.length - 1] ?? rooms()[0]; };
const playableRooms = () => { const l = rooms().filter((r) => roomUnlockLevel(r) <= playerLevel() && !isComplete(r)); return l.length ? l : [currentRoom()]; };
const roomName = (room) => { const keys = Object.keys(P.strings).filter((k) => k.startsWith('room.')); const a = so('NK.LivestreamArtLibrary')._rooms.find((r) => r.Room === room); return (keys[room] && P.strings[keys[room]]) || (a && a.Name) || 'Room'; };
const rarityOf = (room, id) => { const r = roomRow(room); const d = r && r.dumplings.find((x) => x.id === id); return d ? d.rarity : 0; };
// DumplingUnboxService.Roll: rarity from the chest's RandomBag weights; with _missingRates[chest] % the pool is limited to unowned
// dumplings (otherwise any, so duplicates happen); Pick = dumplings of that rarity by ratio, else a fallback rarity present in the pool
const pickW = (arr, w) => { const t = arr.reduce((s, x) => s + w(x), 0); let r = Math.random() * t; for (const x of arr) { r -= w(x); if (r <= 0) return x; } return arr[arr.length - 1]; };
const roll = (room, chest) => {
  const all = roomDumplings(room); const row = roomRow(room); if (!all.length) return null;
  const rr = rates(chest); const rw = rr.length ? rr : [[0, 1]];
  let rarity = pickW(rw.filter((x) => x[1] > 0).length ? rw.filter((x) => x[1] > 0) : rw, (x) => x[1])[0];
  const unowned = all.filter((d) => !owned(room, d.Id));
  const miss = (so('NK.LivestreamConfig')._missingRates || [])[chest.id] || 0;
  const pool = unowned.length && Math.random() * 100 < miss ? unowned : all;
  let m = pool.filter((d) => rarityOf(room, d.Id) === rarity);
  if (!m.length) {
    const total = rw.reduce((s, x) => s + x[1], 0); const present = [...new Set(pool.map((d) => rarityOf(room, d.Id)))];
    rarity = pickW(present, (r) => Math.max((rw.find((x) => x[0] === r) || [0, 0])[1], total * 0.01)); m = pool.filter((d) => rarityOf(room, d.Id) === rarity);
  }
  const ratio = (d) => (row.dumplings.find((x) => x.id === d.Id) || {}).weight || 0;
  return m.reduce((s, d) => s + ratio(d), 0) > 0 ? pickW(m, ratio) : E.pick(m);
};

// ---------------------------------------------------------------- small UI helpers
const find = (g, path) => { if (!g) return null; let x = g; for (const p of path.split('/')) { x = x.children.find((c) => c.name === p) || x.findDeep(p); if (!x) return null; } return x; };
const setText = (g, t) => { const tx = g && (g.comp('Txt') || g.compInChildren('Txt')); if (tx) tx.text = String(t); };
const img = (g) => g && g.comp('Img');
const clone = (tpl, parent) => { const g = E.instantiate(tpl._src[0] + ':' + tpl._src[1], parent || tpl.parent); g.setActive(true); return g; };
const fade = (cg, a, d, o) => E.tween(Object.assign({ dur: d, owner: cg.go, update: ((f) => (v) => { cg.alpha = f + (a - f) * v; })(cg.alpha) }, o || {}));
const punch = (g, amt = 0.15, d = 0.25) => E.punchScale(g, amt, d);
// game events -> the original clips (bf_*.mp3: opendoor, button_click, scan, buydone, open_box, win, collect_coin, transition, OpenView, HideView)
const SFX = { door_open: 'opendoor', tap: 'button_click', tear: 'open_box', reveal: 'win', reveal_rare: 'win', coin: 'collect_coin', countdown: 'transition', error: 'HideView' };
const sfx = (name) => { if (G.data().user.sound === false) return; const n = 'bf_' + (SFX[name] || name); const k = Object.keys(P.audio).find((x) => P.audio[x][0] === n); if (k) E.playSound(P.audio[k][0]); };
// screen point -> parent-local anchored position of a UI object
const toLocal = (g, x, y) => { const p = E.M.ap(E.M.inv(g.parent.wm), x, y); return [p[0] + (g.rt[0] === g.rt[2] ? -(g.parent.rect.w * (g.rt[0] - g.parent.rect.pvx)) : 0), p[1] + (g.rt[1] === g.rt[3] ? -(g.parent.rect.h * (g.rt[1] - g.parent.rect.pvy)) : 0)]; };
const inRect = (g, x, y) => { if (!g.wm || !g.rect) return false; const p = E.M.ap(E.M.inv(g.wm), x, y); const R = g.rect; return p[0] >= -R.w * R.pvx && p[0] <= R.w * (1 - R.pvx) && p[1] >= -R.h * R.pvy && p[1] <= R.h * (1 - R.pvy); };

// ---------------------------------------------------------------- DOTween-like helpers (owner = the GameObject; values read when the step starts)
// tw(g, {x, y, sx, sy, s, rot, a}, dur, ease, delay): x/y = anchoredPosition, a = alpha of the Img / CG / Spine on g
const EZ = (e) => (typeof e === 'function' ? e : E.ease[e || 'outQuad'] || E.ease.outQuad);
const alphaComp = (g) => g.comp('CG') || g.comp('Img') || g.comp('Spine') || g.comp('Txt');
const getA = (g) => { const c = alphaComp(g); return !c ? 1 : c.t === 'CG' ? c.alpha : c.color ? c.color[3] : 1; };
const setA = (g, a) => { const c = alphaComp(g); if (!c) return; if (c.t === 'CG') c.alpha = a; else if (c.color) c.color[3] = a; };
const tw = (g, to, dur, ease, delay = 0, owner) => new Promise((res) => {
  const go = () => {
    const f = { x: g.rt ? g.rt[4] : g.x, y: g.rt ? g.rt[5] : g.y, sx: g.sx, sy: g.sy, rot: g.rot || 0, a: getA(g) };
    const t = Object.assign({}, to); if (t.s != null) { t.sx = t.sy = t.s; }
    E.tween({ dur: Math.max(dur, 0.0001), owner: owner || g, ease: EZ(ease), update: (v) => {
      const L = (k) => f[k] + (t[k] - f[k]) * v;
      if (t.x != null) { if (g.rt) g.rt[4] = L('x'); else g.x = L('x'); }
      if (t.y != null) { if (g.rt) g.rt[5] = L('y'); else g.y = L('y'); }
      if (t.sx != null) g.sx = L('sx'); if (t.sy != null) g.sy = L('sy'); if (t.rot != null) g.rot = L('rot'); if (t.a != null) setA(g, L('a'));
    }, done: res });
  };
  if (delay > 0) E.after(delay, go, owner || g); else go();
});
// DOShakeAnchorPos(dur, strength, vibrato, fadeOut); loops -1 = forever
const shake = (g, dur, str, vib = 10, fadeOut = true, loops = 0, owner) => {
  const bx = g.rt[4], by = g.rt[5]; let k = -1, ox = 0, oy = 0;
  return E.tween({ dur, loops, owner: owner || g, ease: E.ease.linear, update: (v) => {
    const kk = Math.floor(v * vib); if (kk !== k) { k = kk; const a = Math.random() * Math.PI * 2; ox = Math.cos(a) * str; oy = Math.sin(a) * str; }
    const m = fadeOut ? 1 - v : 1; g.rt[4] = bx + ox * m; g.rt[5] = by + oy * m;
  }, done: () => { g.rt[4] = bx; g.rt[5] = by; } });
};
// DOPunchScale / DOPunchRotation (vibrato oscillations, decaying)
const punchS = (g, ax, ay, dur, vib = 6, owner) => { const bx = g.sx, by = g.sy; return E.tween({ dur, owner: owner || g, ease: E.ease.linear, update: (v) => { const k = Math.sin(v * Math.PI * vib) * (1 - v); g.sx = bx * (1 + ax * k); g.sy = by * (1 + ay * k); }, done: () => { g.sx = bx; g.sy = by; } }); };
const punchR = (g, deg, dur, vib = 6, owner) => { const b = g.rot || 0; return E.tween({ dur, owner: owner || g, ease: E.ease.linear, update: (v) => { g.rot = b + deg * Math.sin(v * Math.PI * vib) * (1 - v); }, done: () => { g.rot = b; } }); };
// DOJumpAnchorPos(target, power, 1 jump)
const jump = (g, x, y, power, dur, ease = 'outQuad', owner) => new Promise((res) => { const x0 = g.rt[4], y0 = g.rt[5]; E.tween({ dur, owner: owner || g, ease: EZ(ease), update: (v) => { g.rt[4] = x0 + (x - x0) * v; g.rt[5] = y0 + (y - y0) * v + power * 4 * v * (1 - v); }, done: res }); });
const wait = (s, owner) => new Promise((r) => E.after(s, r, owner || 'dumpling'));
const newImg = (name, parent, sp, w, h, color) => { const g = E.newGO(name, parent, true); g.rt = [0.5, 0.5, 0.5, 0.5, 0, 0, w, h, 0.5, 0.5]; g.comps.push({ t: 'Img', sp, color: (color || [1, 1, 1, 1]).slice(), enabled: true, go: g, nr: 1 }); return g; };
const col = (c) => (c ? [c.r, c.g, c.b, c.a == null ? 1 : c.a] : [1, 1, 1, 1]);

// ================================================================= controller
class DumplingGame extends E.Behaviour {
  awake() { ctrl = this; P = E.D.bf; this.cart = []; }
  onDestroy() { if (ctrl === this) ctrl = null; }
  start() { G.music('bgm_home_1'); this.showGoShop(); }
  open(name, parent) { const pid = P._roots ? P._roots[name] : null; const key = 'bf:' + (pid || rootPid(name)); return E.instantiate(key, parent === undefined ? this.go : parent); }
  money() { return G.money(); }
  cartCost() { return this.cart.reduce((s, c) => s + c.price, 0); }
  home() { G.goto('Home'); }
  // ------------------------------------------------------------ 1. supermarket doors
  showGoShop() {
    this.showShop();
    const v = this.open('LoadingGoShopView');
    const L = find(v, 'DoorLeft'), R = find(v, 'DoorRight'), prompt = find(v, 'TapToOpenPrompt'), dim = img(find(v, 'DimOverlay'));
    let opened = false;
    G.onClick(find(v, 'ButtonTapToOpen'), () => {
      if (opened) return; opened = true; sfx('door_open'); vib();
      const pcg = prompt && prompt.comp('CG'); if (pcg) fade(pcg, 0, 0.2);
      E.moveTo(L, -540, 0, 0.7, { ease: E.ease.inOutCubic }); E.moveTo(R, 540, 0, 0.7, { ease: E.ease.inOutCubic });
      if (dim) E.fadeTo(dim, 0, 0.7);
      E.after(0.75, () => E.destroy(v), this);
    });
  }
  // ------------------------------------------------------------ 2. shop shelves + cart (Views.Shop.ShopMainView / ShoppingCartView)
  showShop() {
    const v = (this.shopView = this.open('MainShopView'));
    sfx('HideView'); // the view's enter animation calls PlayExitClip (a quirk of the original)
    this.cartView = find(v, 'ShoppingCart');
    this.points = ['Point', 'Point (1)', 'Point (2)', 'Point (3)', 'Point (4)', 'Point (5)'].map((n) => find(this.cartView, n));
    this.ads = this.ads || {};
    const items = v.compsInChildren('Views.Shop.BlindBagItem');
    for (const it of items) it.setup(this);
    G.onClick(this.cartView, () => this.removeLast());
    G.onClick(find(v, 'ButtonBuy'), () => this.checkout());
    G.onClick(find(v, 'ButtonBack'), () => { sfx('button_click'); this.home(); });
    // intro: bags, then room, cart, buy/labels pop from 0 with an overshoot, alpha 0->1 over 0.4 s, staggered 0.05 s from 0.25 s
    const pops = items.map((i) => i.go).concat(['Room', 'ShoppingCart', 'ButtonBuy', 'TotalBag', 'TotalCoin'].map((n) => find(v, n)).filter(Boolean));
    pops.forEach((g, i) => { g.sx = g.sy = 0; const cg = g.comp('CG'); if (cg) cg.alpha = 0; tw(g, { s: 1, a: 1 }, 0.4, 'outBack', 0.25 + 0.05 * i); });
    // idle: every 3-6 s, 1-3 random bags punch-rotate
    const idle = () => { if (!this.shopView || this.shopView.destroyed) return; for (let k = E.randInt(1, 4); k > 0; k--) punchR(E.pick(items).go, 15, 0.5, 6); E.after(E.rand(3, 6), idle, this); };
    E.after(E.rand(3, 6), idle, this);
    this.refreshCart(true);
  }
  canAdd(price) { return this.cart.length < MAX_CART && this.money() >= this.cartCost() + price; }
  addToCart(item, chest, price) {
    if (this.cart.length >= MAX_CART) { punch(this.cartView, 0.1); this.toast(E.tr('Cart is full')); return false; }
    if (this.money() < this.cartCost() + price) { this.noMoney(); return false; }
    const icon = img(item.icon()).sp;
    this.cart.push({ chest, price, icon });
    // BagFlyItem: DOJump(power max(3, dist*0.5), 0.6) InQuad, scale 1 -> 1.25 (0.24 OutQuad) -> 0.2 (0.36 InBack), rotate -360
    const src = item.icon(); const pt = this.points[this.cart.length - 1];
    const fly = newImg('BagFly', this.shopView, icon, src.rect.w, src.rect.h);
    const p0 = toLocal(fly, src.wm[4], src.wm[5]); fly.rt[4] = p0[0]; fly.rt[5] = p0[1];
    this.refreshCart(false, true);
    E.after(0.02, async () => {
      const p1 = toLocal(fly, pt.wm[4], pt.wm[5]); const dist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      tw(fly, { s: 1.25 }, 0.24, 'outQuad').then(() => tw(fly, { s: 0.2 }, 0.36, 'inBack'));
      tw(fly, { rot: -360 }, 0.6, 'linear');
      await jump(fly, p1[0], p1[1], Math.max(3, dist * 0.5), 0.6, 'inQuad');
      E.destroy(fly); this.refreshCart();
      pt.sx = pt.sy = 1.2; tw(pt, { s: 1 }, 0.4, 'outBounce'); punchR(pt, 20, 0.4, 7);
      punchS(this.cartView, 0.08, -0.05, 0.35, 4); punchR(this.cartView, 8, 0.35, 10, 'cartRot');
      sfx('button_click'); vib(20);
    }, this);
    return true;
  }
  removeLast() {
    if (!this.cart.length) return;
    sfx('button_click'); this.cart.pop(); this.refreshCart(); punchS(this.cartView, -0.06, 0.04, 0.35, 4);
  }
  refreshCart(first, skipLast) {
    this.points.forEach((p, i) => { const c = this.cart[i]; const show = !!c && !(skipLast && i === this.cart.length - 1); p.setActive(show); if (c) img(p).sp = c.icon; });
    setText(find(this.shopView, 'TotalBag'), this.cart.length + '/' + MAX_CART);
    setText(find(this.shopView, 'TotalCoin'), this.cartCost());
    const buy = find(this.shopView, 'ButtonBuy'); if (buy) { const cg = buy.comp('CG'); if (cg && !first) cg.alpha = this.cart.length >= MIN_BUY ? 1 : 0.5; const b = buy.comp('Btn'); if (b) b.interactable = this.cart.length >= MIN_BUY; }
    for (const it of this.shopView.compsInChildren('Views.Shop.BlindBagItem')) it.refresh();
  }
  toast(text) {
    const t = newImg('Toast', this.shopView, null, 700, 110, [0, 0, 0, 0.6]); t.rt[5] = 0;
    const tx = E.newGO('Text', t, true); tx.rt = [0, 0, 1, 1, 0, 0, 0, 0, 0.5, 0.5]; tx.comps.push({ t: 'Txt', text, fs: 46, ha: 2, va: 512, color: [1, 1, 1, 1], enabled: true, go: tx, font: null });
    t.sx = t.sy = 0.6; tw(t, { s: 1 }, 0.25, 'outBack'); E.after(1.2, () => E.destroy(t), this);
  }
  noMoney() {
    vib(60);
    const t = find(this.shopView, 'TotalCoin'); if (t) { punchS(t, 0.2, 0.2, 0.35, 6); const tx = t.compInChildren('Txt'); if (tx) { const c0 = tx.color.slice(); tx.color = [1, 0.25, 0.25, 1]; E.after(0.6, () => { tx.color = c0; }, this); } }
  }
  checkout() {
    if (this.cart.length < MIN_BUY) { punchS(find(this.shopView, 'ButtonBuy'), 0.15, 0.15, 0.3); return; }
    sfx('button_click'); this.showPay();
  }
  // ------------------------------------------------------------ 3. checkout scanner (Views.Pay.PayPresenter / PayView / PayDragBoxItem)
  showPay() {
    const v = (this.payView = this.open('PayView'));
    sfx('OpenView');
    const content = find(v, 'Content'); content.rt[5] = -1920; tw(content, { y: 0 }, 0.3, 'outQuart'); // slides up from the bottom
    const grid = find(v, 'BoxTemplate').parent; const slots = grid.children.filter((g) => g.name.startsWith('BoxTemplate'));
    slots.forEach((g) => g.setActive(false));
    this.payBoxes = this.cart.map((c, i) => { const g = slots[i]; g.setActive(true); img(g).sp = c.icon; img(g).color[3] = 1; g._item = c; return g; });
    this.scan = find(v, 'ScanContainer'); this.laser = find(v, 'ScanLaser'); this.machine = find(v, 'Body');
    if (this.laser) { this.laser.setActive(true); this.laser.rt[5] = -260; E.tween({ dur: 0.9, loops: -1, yoyo: true, owner: this.laser, ease: E.ease.inOutSine, update: (k) => { this.laser.rt[5] = -260 - 130 * k; } }); }
    this.receipt = find(v, 'ReceiptContainer'); this.rows = this.receipt.findDeep('ReceiptContainer').children.filter((c) => c.comp('Views.Pay.PayReceiptRowItem'));
    this.rows.forEach((r) => r.setActive(false));
    this.scanned = 0;
    this.totalG = find(this.receipt, 'Total'); setText(this.totalG.children[1], 0);
    const back = find(this.shopView, 'ButtonBack'); if (back) back.setActive(false);
    G.onClick(find(v, 'ButtonExit'), () => { sfx('HideView'); E.input.off(this.payL); E.destroy(v); this.payView = null; if (back) back.setActive(true); });
    G.onClick(find(v, 'ButtonGreen'), () => this.pay());
    this.payL = E.input.on((t, ev) => this.onPayInput(t, ev));
  }
  onPayInput(t, ev) {
    if (!this.payView) return;
    // the grid re-lays its children every frame, so a floating copy follows the finger
    if (t === 'down') {
      const b = this.payBoxes.find((g) => g.activeSelf && !g._done && inRect(g, ev.x, ev.y)); if (!b) return;
      const f = newImg('DragBox', this.payView, img(b).sp, b.rect.w, b.rect.h);
      const p = toLocal(f, ev.x, ev.y); f.rt[4] = p[0]; f.rt[5] = p[1]; tw(f, { s: 1.15 }, 0.15);
      img(b).color[3] = 0; this.drag = { b, f };
    } else if (t === 'move' && this.drag) {
      const { b, f } = this.drag; const p = toLocal(f, ev.x, ev.y); f.rt[4] = p[0]; f.rt[5] = p[1];
      if (inRect(this.scan, ev.x, ev.y)) { this.drag = null; b.setActive(false); this.scanBox(b, f); } // entering the zone triggers the scan
    } else if (t === 'up' && this.drag) {
      const { b, f } = this.drag; this.drag = null;
      E.destroy(f); img(b).color[3] = 1; b.sx = b.sy = 0.8; tw(b, { s: 1 }, 0.25, 'outBack');
    }
  }
  scanBox(b, f) {
    b._done = true; sfx('scan'); vib(60);
    const c = toLocal(f, this.scan.wm[4], this.scan.wm[5]); f.sx = f.sy = 1.2;
    tw(f, { x: c[0], y: c[1], s: 0.05, rot: E.pick([-25, 25]) }, 0.3, 'inQuad').then(() => E.destroy(f));
    if (!this.receipt.activeSelf) { const si = img(this.scan); if (si) E.fadeTo(si, 0, 0.25); }
    this.receipt.setActive(true);
    const row = this.rows[this.scanned++];
    if (row) { row.setActive(true); const tx = row.compsInChildren('Txt'); tx[0].text = chestName(b._item.chest); tx[1].text = 'x1'; row.sx = row.sy = 1.15; tw(row, { s: 1 }, 0.22, 'outBack'); }
    setText(this.totalG.children[1], this.payBoxes.filter((x) => x._done).reduce((s, x) => s + x._item.price, 0)); this.totalG.sx = this.totalG.sy = 1.25; tw(this.totalG, { s: 1 }, 0.22, 'outBack');
    // the machine squashes: (1.04,.96) 0.08 -> (.97,1.04) 0.10 -> 1 0.18 OutBounce, y -6 / +12 / 0
    const m = this.machine; const y0 = m._y0 == null ? (m._y0 = m.rt[5]) : m._y0; E.killOwner(m);
    tw(m, { sx: 1.04, sy: 0.96, y: y0 - 6 }, 0.08).then(() => tw(m, { sx: 0.97, sy: 1.04, y: y0 + 12 }, 0.1)).then(() => tw(m, { s: 1, y: y0 }, 0.18, 'outBounce'));
    if (this.scanned >= this.payBoxes.length) E.after(0.45, () => { const g = find(this.payView, 'ButtonGreen'); g.setActive(true); g.sx = g.sy = 0; tw(g, { s: 1 }, 0.3, 'outBack'); }, this);
  }
  pay() {
    if (this.paid) return; this.paid = true;
    sfx('buydone'); vib(20); G.addMoney(-this.cartCost());
    this.bags = this.cart.slice(); this.cart = [];
    E.input.off(this.payL); const pv = this.payView; if (pv) find(pv, 'ButtonGreen').setActive(false);
    const ty = pv && find(pv, 'ThankYouContainer'); if (ty) { this.receipt.setActive(false); ty.setActive(true); ty.sx = ty.sy = 0.6; tw(ty, { s: 1 }, 0.3, 'outBack'); }
    E.after(0.5, () => { sfx('HideView'); E.destroy(this.payView); E.destroy(this.shopView); this.payView = this.shopView = null; this.showLive(); }, this);
  }
}
S['Dumpling.DumplingGame'] = DumplingGame;
const rootPid = (name) => { if (!P._roots) { P._roots = {}; const F = E.D.files.bf; for (const k in F.nodes) if (F.nodes[k].par == null) P._roots[F.nodes[k].n] = +k; } return P._roots[name]; };

// ---------------------------------------------------------------- shop item (Views.Shop.BlindBagItem)
class BlindBagItem extends E.Behaviour {
  icon() { return goOf(this.ref('_icon')); }
  setup(c) {
    this.c = c; this.chest = chestOf(this.d._packType | 0);
    const ch = this.chest; this.byAds = ch.unlockType === 2 || ch.price <= 0;
    // the icon follows the pack tier (chest.Common .. chest.Diamond); the two big bottom packs keep their prefab art
    const tier = ['Common', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Epic'][ch.id];
    const key = tier && bfSprite(tier); const ic = this.icon(); if (key && ic) img(ic).sp = key;
    this.price = Math.round(ch.price);
    const bc = goOf(this.ref('_btnCoin')), ba = goOf(this.ref('_btnAds'));
    bc.setActive(!this.byAds); ba.setActive(this.byAds);
    E.txtOf(this.ref('_coinTxt')).text = String(this.price);
    G.onClick(bc, () => this.c.addToCart(this, ch, this.price));
    G.onClick(ba, () => this.adTap());
    this.refresh();
  }
  adTap() { // rewarded "watch N ads" bag: each tap counts one ad, the bag is added once the count is reached
    const k = this.chest.id; const n = (this.c.ads[k] = (this.c.ads[k] || 0) + 1);
    if (n >= this.chest.adsUnlock) { if (this.c.addToCart(this, this.chest, 0)) this.c.ads[k] = 0; else this.c.ads[k] = n - 1; }
    this.refresh();
  }
  refresh() {
    if (!this.chest) return;
    const t = E.txtOf(this.ref('_adsTxt')); if (t) t.text = (this.c.ads[this.chest.id] || 0) + '/' + this.chest.adsUnlock;
    const cg = this.go.comp('CG'); if (cg) cg.alpha = this.byAds || this.c.canAdd(this.price) || this.c.cart.length >= MAX_CART ? 1 : 0.6;
  }
}
S['Views.Shop.BlindBagItem'] = BlindBagItem;

// ---------------------------------------------------------------- live chat (LiveChat / ChatItem: newest at the bottom)
class LiveChatFeed {
  constructor(root) {
    this.root = root; this.box = find(root, 'Chat Box');
    this.items = this.box.children.filter((c) => c.comp('ChatItem'));
    this.items.forEach((c) => { c.setActive(false); const t = find(c, '[Text] Chat text').comp('Txt'); if (t) { t.wrap = 0; t.auto = 1; t.fmin = 14; t.fmax = 28; } }); // one line per bubble, shrink to fit
    this.queue = []; this.avatars = ((root.comp('LiveChat') || {}).d || {}).avatarFrames || [];
    // "Say something to fans": tapping the field asks for a line (no TMP_InputField in the engine) and posts it as the player
    const field = find(root, 'InputField (TMP)');
    if (field) {
      let b = field.comp('Btn'); if (!b) { b = { t: 'Btn', go: field, onClick: [], interactable: true, enabled: true, tr: 0 }; field.comps.push(b); }
      b.onClick.push(() => { let v = null; try { v = window.prompt(E.tr('Say something to fans'), ''); } catch (e) { v = null; } if (v && v.trim()) this.push(v.trim().slice(0, 60), true); });
    }
  }
  lines(set) { const out = []; for (let i = 0; i < 20; i++) { const k = 'commentBot.' + set + '.' + i; if (P.strings[k]) out.push(P.strings[k]); } return out; }
  push(text, mine) {
    // newest line at the bottom (y 29), older ones stacked 64 above, at most 4 shown
    const slot = this.items.shift(); this.items.push(slot);
    this.vis = (this.vis || []).filter((c) => c !== slot); this.vis.push(slot); while (this.vis.length > 4) this.vis.shift().setActive(false);
    slot.setActive(true); slot.rt[4] = 0; slot.rt[5] = 29 - 64; const cg = slot.comp('CG'); if (cg) { cg.alpha = 0; fade(cg, 1, 0.2); }
    const n = this.vis.length; this.vis.forEach((c, i) => { const o = 'chatMove' + c.pid; E.killOwner(o); E.moveTo(c, 0, 29 + (n - 1 - i) * 64, 0.2, { owner: o }); });
    setText(find(slot, '[Text] Chat text'), mine ? text : E.tr(text));
    const av = find(slot, '[Image] Frame Avatar'); if (av && this.avatars.length) { const s = E.pick(this.avatars); if (typeof s === 'string' && E.D.spr[s]) img(av).sp = s; }
  }
  start(set) { this.stop(); const L = this.lines(set); this.timer = setInterval(() => { if (this.root.destroyed) return this.stop(); this.push(E.pick(L)); }, 1600); this.push(E.pick(L)); }
  burst(set, n) { const L = this.lines(set); for (let i = 0; i < n; i++) setTimeout(() => { if (!this.root.destroyed) this.push(E.pick(L)); }, i * 350); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

// ---------------------------------------------------------------- engine helper: arc move for UI (bag -> cart)
E.jumpUI = (g, x, y, h, dur, done) => {
  const x0 = g.rt[4], y0 = g.rt[5];
  return E.tween({ dur, owner: g, ease: E.ease.linear, update: (v) => { const e = 1 - (1 - v) * (1 - v); g.rt[4] = x0 + (x - x0) * e; g.rt[5] = y0 + (y - y0) * v + h * 4 * v * (1 - v); }, done });
};

// ---------------------------------------------------------------- Home entry: a "Dumpling" button under Dream House (left column)
// It is a copy of the Dream House HomeButton (same slide in/out), with the Dumpling steamer-box art.
G.addDumplingHomeButton = (screen) => {
  const dream = screen.b.dream && screen.b.dream.go; if (!dream) return null;
  E.D.spr['ui:dumplingIcon'] = ['ui_dumpling_icon.webp', 0, 0, 506, 503, 0.5, 0.5, 100, [0, 0, 0, 0], 'dumpling_icon', 584, 552, 38.01, 24.08];
  const g = E.instantiate(dream._src[0] + ':' + dream._src[1], dream.parent);
  g.name = 'DumplingButton';
  g.rt = dream.rt.slice(); g.rt[5] = dream.rt[5] - 247; // next slot of the column (daily -110, task -370, online -600, dream -853)
  const im = g.comp('Img'); if (im) { im.sp = 'ui:dumplingIcon'; im.pa = 1; }
  for (const c of g.children) {
    if (c.comp('Txt')) c.comp('Txt').text = 'Dumpling';
    else c.setActive(false); // hand hint, red dot, lock
  }
  const hb = g.comp('HomeButton'); if (hb && hb.onInit) hb.onInit();
  G.onClick(g, () => { G.click(); G.goto('Dumpling'); });
  return hb;
};

// sprites used by code (art library, chest icons) are not referenced by the prefabs: preload them with the scene
E.scenePreload.level7 = () => {
  const out = new Set(); P = E.D.bf;
  const F = E.D.files.bf; for (const name of ['LoadingGoShopView', 'MainShopView', 'PayView', 'LivestreamView']) E.collectSprites('bf', rootPid(name), out);
  E.collectRefs(so('NK.LivestreamArtLibrary'), out);
  for (const k in P.spine) if (P.spine[k].name === 'bf_Level_up') E.collectSprites('bf', rootPid('LevelUpView'), out);
  return out;
};
// shared with js/dumpling_live.js (livestream half of the mode)
G.dumpling = { P: () => P, find, setText, img, clone, fade, punch, sfx, vib, toLocal, inRect, tw, shake, punchS, punchR, jump, wait, newImg, col, getA, setA,
  so, str, roll, owned, save, rooms, playableRooms, currentRoom, roomUnlockLevel, playerLevel, levelOf, isComplete, roomDumplings, roomName, rarityOf,
  boxArt, chestName, bfSprite, rootPid, LiveChatFeed, DumplingGame };
})();
