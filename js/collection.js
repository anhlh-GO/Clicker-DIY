'use strict';
// Blind Bag Collection (level4): unbox the bought bags, place the new charms into the collection, auto-sell, completion popup.
// CollectionSelector / CollectionBox / CollectionNaviagationButton / PagesScrollVisual also run read-only in Home (level1).
(() => {
const G = E.Game, S = E.scripts;
G.bagIdList = G.bagIdList || [];
const user = () => G.data().user;
const vib = () => E.vibrate(60);
let ctrl = null; // level4 BlindbagCollectionController (null in other scenes)
const rayOk = () => !ctrl || ctrl.rayOn; // Physics2DRaycaster on CameraMain (level4 only)

// ---------------------------------------------------------------- helpers
const COL_ASSET = 'sharedassets0.assets:14399', VIS_ASSET = 'sharedassets0.assets:14493';
const colAsset = () => E.so(COL_ASSET) || E.soByClass('BlindBagCollection.BlindbagCollectionAsset');
const visAsset = () => E.so(VIS_ASSET) || E.soByClass('ScoopGame.BlindBagVisualAsset');
const spKey = (s) => (s && typeof s === 'object' ? s.sprite : s) || null;
const compOf = (r, t) => { if (!r) return null; if (r.t === t) return r; const g = G.goOf(r); return g ? g.comp(t) : null; };
// SpriteRenderer.bounds.size (sprite rect / ppu * lossy scale)
const srBounds = (sr) => { const s = sr && E.sprite(sr.sp); if (!s) return [1, 1]; const ls = sr.go.lossyScale(); return [Math.max(1e-4, (s[10] || s[3]) / s[7] * ls[0]), Math.max(1e-4, (s[11] || s[4]) / s[7] * ls[1])]; };
// Transform.SetParent(p) with worldPositionStays (position, rotation and scale)
const reparentKeep = (g, p) => {
  const wp = g.worldPos(), wr = g.worldRot(), ls = g.lossyScale();
  g.setParent(p, false);
  g.setWorldPos(wp[0], wp[1]);
  g.rot = wr - (p ? p.worldRot() : 0);
  const ps = p ? p.lossyScale() : [1, 1];
  g.sx = ls[0] / (ps[0] || 1); g.sy = ls[1] / (ps[1] || 1);
};
const shortRot = (from, to) => { let d = ((to - from) % 360 + 540) % 360 - 180; return from + d; }; // DORotate fast mode
const rotToWorld = (g, worldTarget, dur, o = {}) => { const tgt = worldTarget - (g.parent ? g.parent.worldRot() : 0); return E.rotTo(g, shortRot(g.rot, tgt), dur, o); };
const jumpLocal = (g, tx, ty, power, dur, o = {}) => { const sx = g.x, sy = g.y; return E.tween(Object.assign({ dur, owner: g, ease: E.ease.linear, update: (v) => { g.x = sx + (tx - sx) * v; g.y = sy + (ty - sy) * v + power * 4 * v * (1 - v); } }, o)); };
if (!E.jumpWorld) E.jumpWorld = (g, tx, ty, power, dur, o = {}) => { const s = g.worldPos(); return E.tween(Object.assign({ dur, owner: g, ease: E.ease.linear, update: (v) => { g.setWorldPos(s[0] + (tx - s[0]) * v, s[1] + (ty - s[1]) * v + power * 4 * v * (1 - v)); } }, o)); };
const zTo = (g, z, dur, o = {}) => { const f = g.z || 0; return E.tween(Object.assign({ dur, owner: g, update: (v) => { g.z = f + (z - f) * v; } }, o)); };
const rhe = (x) => { const f = Math.floor(x), d = x - f; if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1; return Math.round(x); }; // Math.Round (banker's)
const transition = (cb) => { // SimpleSceneTransition.Transition (flash in, callback, fade out) without breaking G.goto's fade flag
  const tr = G.transition;
  if (!tr) { cb(); return; }
  tr.transition(cb).then(() => { tr._fadedThisScene = false; });
};
const playFx = (r, on) => { const g = G.goOf(r); if (!g) return; if (on) { g.setActive(true); const c = r && r.play ? r : g.comp('AssetKits.ParticleImage.ParticleImage'); if (c && c.play) c.play(); } else { const c = r && r.stop ? r : g.comp('AssetKits.ParticleImage.ParticleImage'); if (c && c.stop) c.stop(); g.setActive(false); } };

// ---------------------------------------------------------------- BlindbagCollectionData (save)
const ITEM_TYPE_COUNT = 13; // Enum.GetValues(CollectionItemType).Length
const CD = () => { const s = G.data(); if (!s.blindbagCollection || !Array.isArray(s.blindbagCollection.BoxsetDataSave)) s.blindbagCollection = { BoxsetDataSave: [] }; return s.blindbagCollection; };
const colData = {
  get: CD,
  isUnlocked: (bs, type) => { const e = CD().BoxsetDataSave.find((x) => x.BoxsetType === bs); return !!e && e.ItemTypes.includes(type); },
  unlock: (bs, type) => { const l = CD().BoxsetDataSave; let e = l.find((x) => x.BoxsetType === bs); if (!e) { e = { BoxsetType: bs, ItemTypes: [] }; l.push(e); } if (!e.ItemTypes.includes(type)) e.ItemTypes.push(type); },
  isBoxsetCompleted: (bs) => { const e = CD().BoxsetDataSave.find((x) => x.BoxsetType === bs); return !!e && e.ItemTypes.length >= ITEM_TYPE_COUNT; },
  save: () => G.save(),
};
G.blindbagCollection = colData;

// ---------------------------------------------------------------- BlindbagCollectionAsset logic
let curProb = null; // CurrentProbabilities, in memory only (reset at app start)
const asset = {
  boxset: (bs) => colAsset().CollectionBoxsets.find((x) => x.BoxsetType === bs),
  item: (type, bs) => { const b = asset.boxset(bs); if (!b) return null; return type === 0 ? b.FullKeycap : (b.DecorItems || []).find((x) => x.Type === type) || null; },
  randomItemType() {
    const A = colAsset();
    if (!curProb) curProb = (A.CurrentProbabilities || [21, 79]).slice();
    const cur = curProb, base = A.BaseProbabilities || [85, 15];
    const n = Math.min(cur.length, base.length); if (!n) return 0;
    let total = 0; for (let i = 0; i < n; i++) total += Math.max(0, cur[i]);
    if (total < 1) return 0;
    let r = E.randInt(0, total), idx = 0;
    for (let i = 0; i < n; i++) { r -= Math.max(0, cur[i]); if (r < 0) { idx = i; break; } }
    let d = rhe(base[idx] * 0.1); if (base[idx] >= 1) d = Math.max(d, 1);
    const take = Math.min(d, cur[idx]); cur[idx] -= take;
    if (take >= 1) {
      let Sm = 0; for (let j = 0; j < n; j++) if (j !== idx) Sm += Math.max(0, base[j]);
      if (Sm >= 1) {
        let given = 0;
        for (let j = 0; j < n; j++) if (j !== idx) { const a = rhe(Math.max(0, base[j]) / Sm * take); cur[j] += a; given += a; }
        let rem = take - given;
        for (let j = 0; j < n && rem !== 0; j++) if (j !== idx) { const s = Math.sign(rem); cur[j] += s; rem -= s; }
      }
    }
    if (idx === 1) return E.randInt(1, 6); // Decor1..Decor5
    return idx < 13 ? idx : 0;
  },
  randomBoxsetType: () => { const l = colAsset().CollectionBoxsets; return l[E.randInt(0, l.length)].BoxsetType; },
  itemSprite: (type, bs) => { const it = asset.item(type, bs); if (!it) console.warn('collection item missing', type, bs); return it ? it.ItemSprite : null; },
  itemID: (type, bs) => { const it = asset.item(type, bs); return it ? it.ID_Cached : -1; }, // data_config_type == 1
  rarity: (type, bs) => {
    if (type === 0) return 99; // Special
    const it = asset.item(type, bs); const cfg = E.so(colAsset()._decorKeycapConfig);
    const d = it && cfg && (cfg._dataList || []).find((x) => x.Id === it.ID_Cached);
    return d ? d.Rarity : 0;
  },
  price: (type) => { const A = colAsset(); const P = type === 0 ? A.FullKeycapPrice : A.DecorItemPrice; return E.randInt(P[0], P[1] + 1); },
};
G.blindbagCollectionAsset = asset;
// RarityVisualConfig.GetDataByRarity (ConfigLuckyWheel is the only instance)
G.rarityVisual = (r, cfg) => { const c = cfg || E.so('sharedassets1.assets:846') || E.soByClass('RarityVisualConfig'); return c && (c.DataList || []).find((x) => x.Rarity === r) || null; };
const visData = (id) => { const l = visAsset()._dataList; return l.find((x) => x.ID === id) || l[id] || E.pick(l); };

// static BlindbagDragController.OnDragStart / OnDragEnd
const dragStart = new Set(), dragEnd = new Set();

E.scenePreload.level4 = () => {
  const out = E.prefabSprites(['sharedassets4.assets:49', 'sharedassets0.assets:6914', G.poolPrefab(108), G.poolPrefab(5)].filter(Boolean));
  for (const b of colAsset().CollectionBoxsets) { if (b.FullKeycap && b.FullKeycap.ItemSprite) out.add(b.FullKeycap.ItemSprite); for (const d of b.DecorItems || []) if (d.ItemSprite) out.add(d.ItemSprite); }
  return out;
};

// ---------------------------------------------------------------- Spine BoneFollower (paper card rides the bag bone)
class BoneFollower extends E.Behaviour {
  lateUpdate() {
    const sp = compOf(this.ref('skeletonRenderer'), 'Spine');
    if (!sp || !sp.ready || !sp.skeleton) return;
    const bone = sp.skeleton.findBone(this.d.boneName); if (!bone) return;
    const sc = (sp.meta && sp.meta.scale) || 0.01;
    const p = E.M.ap(sp.go.worldMatrix(), bone.worldX * sc, bone.worldY * sc);
    if (this.d.followXYPosition !== false) this.go.setWorldPos(p[0], p[1]);
    if (this.d.followBoneRotation) this.go.rot = bone.getWorldRotationX() + sp.go.worldRot() - (this.go.parent ? this.go.parent.worldRot() : 0);
  }
}
if (!S['Spine.Unity.BoneFollower']) S['Spine.Unity.BoneFollower'] = BoneFollower;

// ---------------------------------------------------------------- tutorial (Blindbag.TutorialBlindBag is in blindbag.js)
const showTutorialUnbox = (target, show) => {
  const t = E.findObjectOfType('Blindbag.TutorialBlindBag'); if (!t) return;
  if (t.showTutorialUnbox) { t.showTutorialUnbox(target, show); return; }
  const g = G.goOf(E.resolve(t.go, t.d._tutorialUnbox)); if (!g) return;
  g.setActive(false);
  if (show && !user().IsDoneTutorialBlindBag && target) { const p = G.goOf(target).worldPos(); g.setWorldPos(p[0], p[1]); g.setActive(true); }
};
const TB = S['Blindbag.TutorialBlindBag'];
if (TB && !TB.prototype.showTutorialUnbox) TB.prototype.showTutorialUnbox = function (target, show) {
  const g = G.goOf(this.ref('_tutorialUnbox')); if (!g) return;
  g.setActive(false);
  if (show && !user().IsDoneTutorialBlindBag && target) { const p = G.goOf(target).worldPos(); g.setWorldPos(p[0], p[1]); g.setActive(true); }
};

// ---------------------------------------------------------------- BlindbagCollectionController
class BlindbagCollectionController extends E.Behaviour {
  awake() {
    ctrl = this; this.rayOn = false;
    this.cacheDataItems = []; this.lockedItemTypes = new Set(); this.checkDuplicate = new Set(); this.unlockedItems = [];
    this.cachedCaseID = []; this.cachedDecorID = [];
  }
  onDestroy() { if (ctrl === this) ctrl = null; }
  start() {
    if (!E.audio.musicName) G.music('bgm_home_1'); // (SetVolumeMusic 0.4: no volume API, keeps the home track)
    this.plate = this.ref('_blindBoxPlate');
    this.plate.go.setActive(false); this.rayOn = false;
    this.drag = this.ref('_dragController');
    this.screen = E.ui.showScreen('BlindBagCollection.BlindbagGameScreen');
    this.goToStepBlindBox();
  }
  goToStepBlindBox() {
    G.goOf(this.ref('_openBagObject')).setActive(true); this.plate.go.setActive(true); this.rayOn = true;
    G.goOf(this.ref('_collectionObject')).setActive(false);
    this.setupBlindBoxPlate();
    if (this.screen) this.screen.showContentUnbox();
  }
  setupBlindBoxPlate() {
    this.plate.clearPlate();
    const ids = G.bagIdList && G.bagIdList.length ? G.bagIdList.slice() : [0, 3, 5];
    for (const id of ids) this.pickRandomItemAndSpawn(visData(id).SkinName);
    this.plate.autoSpawnBlindBox();
  }
  getRandomItemData() {
    const type = asset.randomItemType(), bs = asset.randomBoxsetType();
    return { type, bs, sprite: asset.itemSprite(type, bs), id: asset.itemID(type, bs), rarity: asset.rarity(type, bs) };
  }
  isLucky() { return E.randInt(0, 101) <= (colAsset().LuckBagChance || 30); }
  pickRandomItemAndSpawn(skin) {
    const d = this.getRandomItemData();
    this.plate.spawnBlindBox(d.sprite, skin, this.isLucky(), d.rarity);
    this.addItemToCacheIfNeeded(d.type, d.bs, d.sprite);
    (d.type === 0 ? this.cachedCaseID : this.cachedDecorID).push(d.id);
  }
  addMoreBlindBox() {
    const d = this.getRandomItemData();
    const skin = E.pick(visAsset()._dataList).SkinName;
    this.plate.addMoreRandomBox(d.sprite, skin, this.isLucky(), d.rarity);
    this.addItemToCacheIfNeeded(d.type, d.bs, d.sprite);
    (d.type === 0 ? this.cachedCaseID : this.cachedDecorID).push(d.id);
  }
  addItemToCacheIfNeeded(type, bs, sprite) {
    const key = type + ':' + bs;
    if (!this.lockedItemTypes.has(key)) { this.cacheDataItems.push({ type, bs, sprite }); this.lockedItemTypes.add(key); }
    if (this.checkDuplicate.has(key)) this.unlockedItems.push({ sprite, price: asset.price(type) });
    else {
      this.checkDuplicate.add(key);
      if (colData.isUnlocked(bs, type)) this.unlockedItems.push({ sprite, price: asset.price(type) });
    }
  }
  isDoneUnbox() { return this.plate.doneUnbox; }
  goToCollectionStep() { this.rayOn = false; this.onGoToCollectionStep(); }
  onGoToCollectionStep() {
    transition(() => {
      if (this.unlockedItems.length > 0) { const p = E.ui.showPopup('BlindBagCollection.AutoSellPopup'); if (p) p.initalizePrice(this.unlockedItems, () => {}); }
      this.plate.go.setActive(false);
      G.goOf(this.ref('_openBagObject')).setActive(false);
      G.goOf(this.ref('_collectionObject')).setActive(true);
      const hb = G.goOf(this.ref('_homeButtonObject')); if (hb) hb.setActive(false);
      this.drag.initalizeBlindbag(this.cacheDataItems);
      this.rayOn = true;
      if (this.drag.itemLeft === 0) { this.rayOn = false; this.onCollectionComplete(); }
    });
  }
  onCollectionComplete() {
    G.goOf(this.ref('_collectionBoxsetObject')).setActive(false);
    if (this.screen) { const b = G.goOf(this.screen.ref('_goBlockScreen')); if (b) b.setActive(true); this.screen.showChatContent(false); }
    E.ui.showPopup('BlindBagCollection.CollectionCompletePopup');
  }
}
S['BlindBagCollection.BlindbagCollectionController'] = BlindbagCollectionController;

// ---------------------------------------------------------------- BlindBoxPlate (tray)
class BlindBoxPlate extends E.Behaviour {
  awake() { this.spawned = []; this.hold = 0; }
  get doneUnbox() { return this.spawned.every((b) => b.opened); }
  wp(k) { return G.goOf(this.ref(k)).worldPos(); }
  lp(k) { const g = G.goOf(this.ref(k)); return [g.x, g.y]; }
  clearPlate() { for (const b of this.spawned) E.destroy(b.go); this.spawned = []; this.hold = 0; }
  newBox(sprite, skin, isLuck, rarity) {
    const tmpl = G.goOf(this.ref('_blindBoxItem'));
    const g = E.instantiate(tmpl, G.goOf(this.ref('_tfHolder')));
    g.rot = E.rand(0, 360);
    const b = g.comp('BlindBagCollection.BlindbagCollectionBox');
    b.setSkinBag(skin); b.setData(sprite, isLuck, rarity); b.disableClick();
    return b;
  }
  spawnBlindBox(sprite, skin, isLuck, rarity) {
    const bl = this.wp('_tfBottomLeft'), tr = this.wp('_tfTopRight');
    const b = this.newBox(sprite, skin, isLuck, rarity);
    b.go.setWorldPos(E.rand(bl[0], tr[0]), E.rand(bl[1], tr[1])); b.go.z = this.spawned.length * 0.1;
    this.spawned.push(b); this.hold++;
  }
  autoSpawnBlindBox() {
    for (let i = 0; i < this.spawned.length; i++) this.after(i * 0.1, () => this.checkPopOutBlindBox());
    this.after(1.0, () => { if (this.spawned[0]) showTutorialUnbox(this.spawned[0].go, true); });
  }
  randOpen() { const bl = this.wp('_tfBottomLeftOpen'), tr = this.wp('_tfTopRightOpen'); return [E.rand(bl[0], tr[0]), E.rand(bl[1], tr[1])]; }
  checkPopOutBlindBox() {
    if (this.hold >= 1) {
      G.sound(17); vib();
      const b = this.spawned[this.hold - 1]; const t = this.randOpen();
      E.jumpWorld(b.go, t[0], t[1], 3, 0.5, { delay: 0.15, done: () => { vib(); b.enableClick(); } });
      this.hold--;
    }
    if (this.hold === 0) { const c = this.ref('_collider'); if (c && c.t) c.enabled = false; }
  }
  addMoreRandomBox(sprite, skin, isLuck, rarity) {
    const b = this.newBox(sprite, skin, isLuck, rarity);
    const tp = G.goOf(this.ref('_blindBoxItem')).worldPos(); b.go.setWorldPos(tp[0], tp[1]);
    this.spawned.push(b);
    const t = this.randOpen(); b.go.z = this.spawned.length * 0.1;
    E.jumpWorld(b.go, t[0], t[1], 3, 1.0, { delay: 1.5, done: () => { vib(); b.enableClick(); } });
  }
  getNewItem(tf) {
    const bl = this.lp('_tfBottomLeftPlate'), tr = this.lp('_tfTopRightPlate');
    const x = E.rand(bl[0], tr[0]), y = E.rand(bl[1], tr[1]);
    E.killOwner(tf);
    reparentKeep(tf, G.goOf(this.ref('_tfPlateHoldResult'))); tf.z = 0;
    jumpLocal(tf, x, y, 2, 0.5);
  }
  onPointerDown() {}
}
S['BlindBagCollection.BlindBoxPlate'] = BlindBoxPlate;

// ---------------------------------------------------------------- BlindbagCollectionBox (one bag)
class BlindbagCollectionBox extends E.Behaviour {
  awake() { this.opened = false; this.isLuck = false; }
  start() { this.screen = E.ui && E.ui.getScreen('BlindBagCollection.BlindbagGameScreen'); }
  spine() { return compOf(this.ref('_spineBag'), 'Spine'); }
  luckGo() { return this.go.findDeep('Lucky'); }
  setSkinBag(skin) { const s = this.spine(); if (s && skin) E.spineSkin(s, skin); }
  setData(sprite, isLuck, rarity) {
    const sr = this.ref('_srKeycap'), kt = G.goOf(this.ref('_tfKeycap'));
    sr.sp = spKey(sprite); kt.sx = kt.sy = 1;
    const [w, h] = srBounds(sr); const k = Math.min(1, 2 / w, 2 / h); kt.sx *= k; kt.sy *= k;
    this.isLuck = isLuck; const lg = this.luckGo(); if (lg) lg.setActive(isLuck);
    const list = this.d._paperCardData || [];
    const p = list.find((x) => x.Rarity === rarity); const paper = this.ref('_srPaper');
    if (p) { paper.color[3] = 1; paper.sp = spKey(p.CardSprite); this.glowSprite = spKey(p.GlowSprite); }
    else { paper.color[3] = 0; this.glowSprite = list[0] ? spKey(list[0].GlowSprite) : null; }
  }
  enableClick() { const c = this.ref('_collider'); if (c) c.enabled = true; }
  disableClick() { const c = this.ref('_collider'); if (c) c.enabled = false; }
  onPointerDown() {
    if (!rayOk()) return;
    const c = this.ref('_collider'); if (c && !c.enabled) return;
    this.disableClick(); showTutorialUnbox(this.go, false); this.animOpen(() => {});
  }
  animOpen(onComplete) {
    const sg = this.ref('_sortingGroup'); if (sg) sg.o = 6;
    this.tDoneBG = this.tDoneGlow = E.time + 2;
    const bg = this.ref('_srResult'); E.killOwner(bg.go); E.fadeTo(bg, 0.95, 0.3);
    const g = this.go;
    E.killOwner(g);
    E.moveWorld(g, 0, -1.5, 0.5); zTo(g, -5, 0.5); E.scaleTo(g, 1.5, 0.5);
    rotToWorld(g, 0, 0.5, { done: () => this.b0(onComplete) });
  }
  b0(onComplete) {
    G.sound(16); G.sound(18); vib();
    const s = this.spine(); if (s) E.spinePlay(s, 'bag_open', false);
    this.after(1.0, () => this.b1(onComplete));
  }
  b1(onComplete) {
    const glow = this.ref('_srGlow'); if (glow && this.glowSprite) glow.sp = this.glowSprite;
    const bg = this.ref('_srResult'); E.killOwner(bg.go); E.fadeTo(bg, 0.95, 0.1);
    const ge = G.goOf(this.ref('_tfGlowEffect')); E.killOwner(ge); E.scaleTo(ge, 1, 1.0, { ease: E.ease.outBack });
    const kt = G.goOf(this.ref('_tfKeycap'));
    if (kt.sx <= 0.5) { const [w, h] = srBounds(this.ref('_srKeycap')); E.scaleTo(kt, Math.min(1, 1.6 / w, 1.6 / h), 0.5, { ease: E.ease.linear }); }
    if (onComplete) onComplete();
    this.fadeOutSpine(0.25);
    const pw = E.ui.showPopup('Blindbag.PopupWowBlindbag'); if (pw && pw.showGetOneMore) pw.showGetOneMore(this.isLuck);
    const pp = G.goOf(this.ref('_tfPaperPack')); const y0 = pp.y;
    E.tween({ dur: 0.3, owner: pp, ease: E.ease.linear, update: (v) => { pp.y = y0 + (3 - y0) * v; }, done: () => this.b2() });
  }
  b2() { if (this.isLuck) G.sound(19); this.showAtCenter(() => { this.opened = true; }); }
  fadeOutSpine(d, cb) { const s = this.spine(); if (!s || !s.color) { if (cb) cb(); return; } const a0 = s.color[3]; this.tween({ dur: d, update: (v) => { s.color[3] = a0 * (1 - v); }, done: cb }); }
  showAtCenter(onDone) {
    const pp = G.goOf(this.ref('_tfPaperPack'));
    const finish = () => {
      E.ui.hidePopup('Blindbag.PopupWowBlindbag');
      this.hideEffect(); this.flyToTray(); onDone();
      E.scaleTo(pp, 0, 0.3);
    };
    if (this.isLuck) {
      if (ctrl) ctrl.addMoreBlindBox();
      const lg = this.luckGo();
      const px = pp.x; E.tween({ dur: 0.5, owner: pp, update: (v) => { pp.x = px + (-1 - px) * v; } });
      rotToWorld(pp, 6, 0.5);
      if (lg) {
        const lx = lg.x; E.tween({ dur: 0.5, owner: lg, update: (v) => { lg.x = lx + (3 - lx) * v; } });
        rotToWorld(lg, -12, 0.5, { done: () => this.after(1.5, finish) });
      } else this.after(2.0, finish);
    } else this.after(1.5, finish);
  }
  hideEffect() {
    if (E.time > this.tDoneGlow) { const ge = G.goOf(this.ref('_tfGlowEffect')); E.killOwner(ge); E.scaleTo(ge, 0, 0.5, { ease: E.ease.inBack }); }
    if (E.time > this.tDoneBG) { const bg = this.ref('_srResult'); E.killOwner(bg.go); E.fadeTo(bg, 0, 0.5, { ease: E.ease.linear }); }
  }
  flyToTray() {
    this.ref('_blindBoxPlate').getNewItem(G.goOf(this.ref('_tfKeycap')));
    const sc = this.screen || (E.ui && E.ui.getScreen('BlindBagCollection.BlindbagGameScreen'));
    if (sc) sc.handleCharmFlyToPlate(false);
  }
}
S['BlindBagCollection.BlindbagCollectionBox'] = BlindbagCollectionBox;

// ---------------------------------------------------------------- BlindbagGameScreen (ScreenInGame)
class BlindbagGameScreen extends E.ScreenBase {
  onInit() {
    this.doneFlag = false;
    const b = G.goOf(this.ref('_goBlockScreen')); if (b) b.setActive(false);
    G.onClick(this.ref('_closeButton'), () => { G.click(); E.ui.showPopup('Clicker.BackHomePopup'); });
  }
  onShow() {
    const ch = this.ref('_commentHandler'); if (ch) ch.IsEnableToSpawnComment = true;
    const em = this.ref('_fxEmoji'); if (em) E.psPlay(em);
    const lp = this.ref('_livestreamPanel'); if (lp && lp.onShowPanel) lp.onShowPanel();
    if (!user().IsDoneTutorialBlindBag) { const c = G.goOf(this.ref('_closeButton')); if (c) c.setActive(false); }
  }
  onHide() { const ch = this.ref('_commentHandler'); if (ch) ch.IsEnableToSpawnComment = false; const lp = this.ref('_livestreamPanel'); if (lp && lp.onHidePanel) lp.onHidePanel(); }
  showContentUnbox() { const g = G.goOf(this.ref('_contentUnbox')); if (g) g.setActive(true); }
  showContentSelectBox() {
    const b = G.goOf(this.ref('_goBlockScreen')); if (b) b.setActive(false);
    this.showChatContent(false);
    const c = G.goOf(this.ref('_contentUnbox')); if (c) c.setActive(false);
    const lp = G.goOf(this.ref('_livestreamPanel')); if (lp) lp.setActive(false);
  }
  showChatContent(b) {
    const c = G.goOf(this.ref('_contentChat')); if (c) c.setActive(b);
    const em = this.ref('_fxEmoji'); const eg = G.goOf(em);
    if (eg) { eg.setActive(b); if (b) E.psPlay(eg); else E.psStop(eg); }
  }
  handleCharmFlyToPlate() {
    const b = G.goOf(this.ref('_goBlockScreen')); if (b) b.setActive(false);
    E.after(2.0, () => {
      const c = ctrl; if (!c) return;
      if (c.plate.doneUnbox && !this.doneFlag) {
        this.doneFlag = true; // (interstitial 'done_unbox' skipped)
        this.showContentSelectBox(); this.updateUnlockedItemData(); c.goToCollectionStep();
      }
    }, this.go);
  }
  updateUnlockedItemData() {
    const c = ctrl; if (!c) return; const u = user();
    if (!Array.isArray(u.UnlockedClickerBase)) u.UnlockedClickerBase = [];
    if (!Array.isArray(u.UnlockedClickerDecor)) u.UnlockedClickerDecor = [];
    for (const id of c.cachedCaseID) if (id >= 0 && !u.UnlockedClickerBase.includes(id)) u.UnlockedClickerBase.push(id);
    for (const id of c.cachedDecorID) if (id >= 0 && !u.UnlockedClickerDecor.includes(id)) u.UnlockedClickerDecor.push(id);
    G.save();
  }
  remoteCallAddMoreBag() { if (ctrl) ctrl.addMoreBlindBox(); }
}
S['BlindBagCollection.BlindbagGameScreen'] = BlindbagGameScreen;

// ---------------------------------------------------------------- compliment (ScoopGame.ComplimentItem prefab, PoolType 108)
const showCompliment = (g, x, y, sprite) => {
  const c = g.comp('ScoopGame.ComplimentItem');
  const main = c ? compOf(E.resolve(g, c.d._srMainCompliment), 'SR') : g.compInChildren('SR');
  const subs = c ? (c.d._srSubEffect || []).map((k) => compOf(E.resolve(g, k), 'SR')).filter(Boolean) : [];
  if (main) { if (sprite) main.sp = sprite; main.color[3] = 1; }
  for (const s of subs) s.color[3] = 1;
  E.killOwner(g); g.setWorldPos(x, y); g.sx = g.sy = 0;
  E.scaleTo(g, 1, 0.5, { ease: E.ease.outBack, done: () => {
    for (const s of subs) E.fadeTo(s, 0, 0.9, { delay: 0.5 });
    if (main) E.fadeTo(main, 0, 1.0, { delay: 0.5, done: () => E.destroy(g) }); else E.after(1.5, () => E.destroy(g));
  } });
};

// ---------------------------------------------------------------- BlindbagDragController
class BlindbagDragController extends E.Behaviour {
  awake() { this.spawnedItems = []; this.itemLeft = 0; this.cur = null; this.h = (it) => this.onDragStartHandler(it); dragStart.add(this.h); }
  onDestroy() { dragStart.delete(this.h); }
  selector() { return this.ref('_collectionSelector'); }
  initalizeBlindbag(all) {
    const pts = E.shuffle(this.refs('_randomPositions').map(G.goOf).filter(Boolean));
    const holder = G.goOf(this.ref('_holder'));
    for (let i = 0; i < all.length; i++) {
      const { type, bs, sprite } = all[i];
      if (colData.isUnlocked(bs, type)) continue;
      const it = E.spawn(this.d._itemPrefab, holder); if (!it) continue;
      const g = G.goOf(it) || it;
      const pt = pts[i];
      if (pt) { const p = pt.worldPos(); g.setWorldPos(p[0], p[1]); } else { const p = holder.worldPos(); g.setWorldPos(p[0] + E.rand(-4, 4), p[1] + E.rand(-1, 1)); }
      g.rot = E.randInt(-45, 45);
      const di = g.comp('BlindBagCollection.ItemDraggable');
      di.setData(type, bs, sprite);
      this.spawnedItems.push(g); this.itemLeft++;
    }
  }
  update() {
    if (!this.cur) return;
    this.cur.go.setWorldPos(E.input.wx + this.off[0], E.input.wy + this.off[1]);
    if (!E.input.down) this.onDragEnded();
  }
  onDragStartHandler(item) {
    if (this.cur) this.onDragEnded();
    this.cur = item;
    reparentKeep(item.go, G.goOf(this.ref('_focus')));
    const p = item.go.worldPos(); const b = this.d._dragOffsetBonus || [0, 2, 0];
    this.off = [p[0] - E.input.wx + (b[0] || 0), p[1] - E.input.wy + (b[1] != null ? b[1] : 2)];
    G.sound(16);
  }
  onDragEnded() {
    const it = this.cur; if (!it) return;
    const sel = this.selector();
    const p = it.go.worldPos(); const t = sel.getCurrentItemPosition();
    if (Math.hypot(p[0] - t[0], p[1] - t[1]) < 1.8) {
      vib(); this.spawnCompliment(0, 0);
      const completed = this.unlockCurrentItemInCollection(it);
      it.go.setActive(false); this.itemLeft--;
      if (this.itemLeft <= 0) this.after(completed ? 6 : 2, () => this.complete());
    } else for (const f of [...dragEnd]) f();
    it.onDragEnded();
    reparentKeep(it.go, G.goOf(this.ref('_holder')));
    this.cur = null;
  }
  unlockCurrentItemInCollection(it) {
    G.sound(16);
    colData.unlock(it.boxsetType, it.itemType); colData.save();
    const box = this.selector().currentBox;
    if (box) box.unlockCurrentBox();
    const completed = colData.isBoxsetCompleted(it.boxsetType);
    if (completed && box) this.after(0.5, () => { const s = this.ref('_showCompleteBoxset'); if (s && s.show) s.show(box.go); });
    return completed;
  }
  complete() {
    for (const g of this.spawnedItems) g.setActive(true);
    const c = this.ref('_collectionController') || ctrl; if (c) c.onCollectionComplete();
  }
  spawnCompliment(x, y) {
    const pf = G.poolPrefab(108); if (!pf) return;
    const g = G.goOf(E.spawn(pf, null)) ; if (!g) return;
    const i = E.randInt(0, 4);
    const sp = spKey(this.ref((this.d._complimentSprites || [])[i]));
    showCompliment(g, x + E.rand(-4, 4), y + E.rand(-4, 4), sp);
    const snd = (this.d._complimentSoundEnum || [])[i]; if (snd != null) G.sound(snd);
  }
  isDragging() { return !!this.cur; }
  getTotalItem() { return this.itemLeft; }
}
S['BlindBagCollection.BlindbagDragController'] = BlindbagDragController;

// ---------------------------------------------------------------- ItemDraggable (charm on the plate)
class ItemDraggable extends E.Behaviour {
  awake() { this.col = this.go.comps.find((c) => c.t === 'Circle' || c.t === 'Box' || c.t === 'Poly') || null; this.itemType = this.d._collectionItemType || 0; this.boxsetType = this.d._collectionBoxsetType || 0; }
  start() { if (this.ip) return; this.ip = this.go.worldPos(); this.irot = this.go.worldRot(); this.is = [this.go.sx, this.go.sy]; }
  setData(type, bs, sprite) {
    this.itemType = type; this.boxsetType = bs;
    const vis = compOf(this.ref('_spriteRenderer'), 'SR'); if (!vis) return;
    vis.sp = spKey(sprite); vis.go.sx = vis.go.sy = 1;
    const [w, h] = srBounds(vis); const k = Math.min(1, 4 / w, 4 / h); vis.go.sx *= k; vis.go.sy *= k;
  }
  get CollectionItemType() { return this.itemType; }
  get BoxsetType() { return this.boxsetType; }
  onPointerDown() {
    if (!rayOk()) return;
    if (!this.ip) this.start();
    if (this.col) this.col.enabled = false;
    for (const f of [...dragStart]) f(this);
    E.killOwner(this.go);
    rotToWorld(this.go, 0, 0.1, { ease: E.ease.outQuad }); E.scaleTo(this.go, 1, 0.1, { ease: E.ease.outQuad });
  }
  onDragEnded() {
    const g = this.go; E.killOwner(g);
    if (this.col) this.col.enabled = true;
    if (this.ip) { g.setWorldPos(this.ip[0], this.ip[1]); g.rot = this.irot - (g.parent ? g.parent.worldRot() : 0); }
    const s = this.is || [g.sx, g.sy];
    g.sx = s[0] * 0.5; g.sy = s[1] * 0.5;
    E.scaleTo(g, s, 0.1, { ease: E.ease.outBack });
  }
  compareData(bs) { return bs === this.boxsetType; }
}
S['BlindBagCollection.ItemDraggable'] = ItemDraggable;

// ---------------------------------------------------------------- PagesScrollVisual (page dots)
const pageGos = (p, k) => (p.d[k] || []).map((x) => G.goOf(E.resolve(p.go, x)));
const pagesSet = (p, n) => { if (!p) return; if (p.setPages) return p.setPages(n); pageGos(p, '_pageBG').forEach((g, i) => { if (g) g.setActive(i < n); }); };
const pagesHighlight = (p, idx) => { if (!p) return; if (p.highlightPage) return p.highlightPage(idx); pageGos(p, '_pageHighlight').forEach((g, i) => { if (g) g.setActive(i === idx); }); };
class PagesScrollVisual extends E.Behaviour {
  setPages(n) { pageGos(this, '_pageBG').forEach((g, i) => { if (g) g.setActive(i < n); }); }
  highlightPage(idx) { pageGos(this, '_pageHighlight').forEach((g, i) => { if (g) g.setActive(i === idx); }); }
  SetPages(n) { this.setPages(n); }
  HighlightPage(i) { this.highlightPage(i); }
}
if (!S.PagesScrollVisual) S.PagesScrollVisual = PagesScrollVisual;

// ---------------------------------------------------------------- CollectionSelector (12 collection pages + arrows)
class CollectionSelector extends E.Behaviour {
  awake() {
    this.boxes = this.refs('_collectionBoxes').filter(Boolean);
    this.prev = this.ref('_previousButton'); this.next = this.ref('_nextButton');
    if (this.prev) { this.prev.onClick = () => this.onPreviousButtonClicked(); if (this.prev.canPress == null) this.prev.canPress = true; }
    if (this.next) { this.next.onClick = () => this.onNextButtonClicked(); if (this.next.canPress == null) this.next.canPress = true; }
    this.h1 = (it) => this.onDragStartHandler(it); this.h2 = () => this.onDragEndHandler();
    dragStart.add(this.h1); dragEnd.add(this.h2);
    this.idx = 0; this.currentBox = this.boxes[0];
    this.pages = this.ref('_pagesScrollVisual');
    pagesSet(this.pages, this.boxes.length); pagesHighlight(this.pages, 0);
  }
  onDestroy() { dragStart.delete(this.h1); dragEnd.delete(this.h2); }
  onPreviousButtonClicked() { G.click(); if (this.idx - 1 >= 0) { this.idx--; pagesHighlight(this.pages, this.idx); this.updateCurrentBox(); } }
  onNextButtonClicked() { G.click(); if (this.idx < this.boxes.length - 1) { this.idx++; pagesHighlight(this.pages, this.idx); this.updateCurrentBox(); } }
  updateCurrentBox() {
    this.currentBox = this.boxes[this.idx];
    if (this.prev) this.prev.go.setActive(this.idx > 0);
    if (this.next) this.next.go.setActive(this.idx < this.boxes.length - 1);
    if (this.mt) E.kill(this.mt);
    const piv = G.goOf(this.ref('_pivot')); if (!piv) return;
    const fx = piv.x, tx = -this.idx * (this.d._boxSpacing || 17);
    const dur = Math.abs(tx - fx) / (this.d._moveSpeed || 20);
    this.mt = E.tween({ dur, owner: piv, ease: E.ease.outQuad, update: (v) => { piv.x = fx + (tx - fx) * v; } });
  }
  onDragStartHandler(item) {
    const i = this.boxes.findIndex((b) => b.boxsetType === item.boxsetType);
    if (i < 0) return;
    this.idx = i; pagesHighlight(this.pages, i);
    this.boxes[i].setHighlight(item.itemType);
    this.updateCurrentBox();
    if (this.prev) this.prev.canPress = false; if (this.next) this.next.canPress = false;
  }
  onDragEndHandler() {
    if (this.currentBox) this.currentBox.disableHighlight();
    if (this.prev) this.prev.canPress = true; if (this.next) this.next.canPress = true;
  }
  getCurrentItemPosition() { return this.currentBox ? this.currentBox.getCurrentItemPosition() : [999, 999]; }
  unlockCurrentItemInBoxset() { if (this.currentBox) this.currentBox.unlockCurrentBox(); }
}
S['BlindBagCollection.CollectionSelector'] = CollectionSelector;

class CollectionNaviagationButton extends E.Behaviour {
  awake() { if (this.canPress == null) this.canPress = true; }
  onPointerDown() { if (this.canPress !== false && this.onClick) this.onClick(); }
}
S['BlindBagCollection.CollectionNaviagationButton'] = CollectionNaviagationButton;

// ---------------------------------------------------------------- CollectionBox (one collection page)
class CollectionBox extends E.Behaviour {
  get boxsetType() { return this.d._boxsetType; }
  start() { this.refresh(); }
  ensure() { if (!this.items) this.refresh(); return this.items; }
  refresh() {
    const bs = this.d._boxsetType;
    this.items = (this.d._collectionItems || []).map((x) => ({ IsUnlocked: colData.isUnlocked(bs, x.ItemType), ItemType: x.ItemType, Icon: compOf(this.ref(x.Icon), 'SR') }));
    for (const it of this.items) {
      if (!it.Icon) continue;
      it.Icon.go.setActive(it.IsUnlocked);
      if (it.IsUnlocked) { it.Icon.color = [1, 1, 1, 1]; if (it.ItemType === 0) this.showChildren(it); }
    }
  }
  showChildren(it) { for (const s of it.Icon.go.compsInChildren('SR')) s.go.setActive(true); }
  getCurrentItemPosition() { return this.cur && this.cur.Icon ? this.cur.Icon.go.worldPos() : [999, 999]; }
  setHighlight(type) {
    this.ensure();
    this.cur = this.items.find((x) => x.ItemType === type) || null;
    if (!this.cur || !this.cur.Icon) return;
    const ic = this.cur.Icon; ic.go.setActive(true);
    if (this.hl) E.kill(this.hl);
    ic.color[3] = 0;
    this.hl = E.tween({ dur: 0.5, loops: -1, yoyo: true, ease: E.ease.inOutSine, owner: this, update: (v) => { ic.color[3] = 0.8 * v; } });
  }
  disableHighlight() {
    if (this.hl) { E.kill(this.hl); this.hl = null; }
    if (this.cur && !this.cur.IsUnlocked && this.cur.Icon) this.cur.Icon.go.setActive(false);
    this.cur = null;
  }
  unlockCurrentBox() {
    if (!this.cur || this.cur.IsUnlocked) return;
    for (const it of this.items) if (it.ItemType === this.cur.ItemType) {
      it.IsUnlocked = true;
      if (it.Icon) { it.Icon.color = [1, 1, 1, 1]; it.Icon.go.setActive(true); if (it.ItemType === 0) this.showChildren(it); }
    }
    if (this.hl) { E.kill(this.hl); this.hl = null; }
    this.cur = null;
  }
}
S['BlindBagCollection.CollectionBox'] = CollectionBox;

// ---------------------------------------------------------------- ShowCompleteBoxset (unreachable with the shipped data: needs 13 item types)
class ShowCompleteBoxset extends E.Behaviour {
  start() { const r = G.goOf(this.ref('_root')); if (r) r.setActive(false); }
  show(boxGo) {
    const root = G.goOf(this.ref('_root')); if (!root || !boxGo) return;
    const oldParent = boxGo.parent, start = boxGo.worldPos();
    boxGo.setParent(root, false); boxGo.x = 0; boxGo.y = 0;
    root.setActive(true);
    playFx(this.ref('_confettiParticle'), true); G.sound(11);
    if (ctrl) ctrl.rayOn = false;
    const cg = this.ref('_screenCanvasGroup'); if (cg) { cg.ia = false; E.fadeTo(cg, 0, 0.25); }
    const ov = compOf(this.ref('_overlay'), 'SR'); if (ov) { ov.color[3] = 0; E.fadeTo(ov, 0.8, 0.25); }
    const hdr = G.goOf(this.ref('_headerAnimation'));
    boxGo.sx = boxGo.sy = 0.3;
    E.scaleTo(boxGo, 1, 0.35, { ease: E.ease.outBack, done: () => {
      if (hdr) { hdr.sx = hdr.sy = 0; E.scaleTo(hdr, 1.5, 0.35, { ease: E.ease.outBack }); }
      this.after(2, () => {
        if (hdr) E.scaleTo(hdr, 0, 0.35, { ease: E.ease.inBack });
        this.after(0.35, () => {
          const y0 = boxGo.worldPos()[1];
          E.tween({ dur: 0.5, owner: boxGo, ease: E.ease.outBack, update: (v) => { const p = boxGo.worldPos(); boxGo.setWorldPos(p[0], y0 + (start[1] - y0) * v); }, done: () => {
            boxGo.setParent(oldParent, false); boxGo.setWorldPos(start[0], start[1]);
            playFx(this.ref('_confettiParticle'), false);
            if (cg) cg.ia = true; root.setActive(false); if (ctrl) ctrl.rayOn = true;
          } });
          if (cg) E.fadeTo(cg, 1, 0.25); if (ov) E.fadeTo(ov, 0, 0.25);
        });
      });
    } });
  }
}
S['BlindBagCollection.ShowCompleteBoxset'] = ShowCompleteBoxset;

// ---------------------------------------------------------------- AutoSellPopup ("You already own this item")
class SellItem extends E.Behaviour {
  setItem(sprite, price) {
    this.sprite = sprite; this.count = 1;
    const im = compOf(this.ref('_itemImage'), 'Img'); if (im) im.sp = spKey(sprite);
    const p = E.txtOf(this.ref('_priceText')); if (p) p.text = String(price);
    const c = E.txtOf(this.ref('_countText')); if (c) c.text = 'x1';
  }
  addDuplicate() { this.count++; const c = E.txtOf(this.ref('_countText')); if (c) c.text = 'x' + this.count; }
}
S['BlindBagCollection.SellItem'] = SellItem;

class AutoSellPopup extends E.PopupBase {
  onInit() {
    this.rows = [];
    G.onClick(this.ref('_tradeAdButton'), () => { G.click(); G.collectMoney(this.total, 10); this.hide(); }); // ad = instant success
    G.onClick(this.ref('_tradeNormalButton'), () => { G.click(); G.collectMoney(Math.floor(this.total * 0.2), 10); this.hide(); });
  }
  initalizePrice(items, onComplete) {
    this.init();
    this.cb = onComplete; this.total = 0;
    for (const r of this.rows) E.destroy(r.go); this.rows = [];
    const tmpl = G.goOf(this.ref('_sellItemInstance'));
    for (const { sprite, price } of items) {
      let s = this.rows.find((x) => x.sprite === sprite);
      if (s) s.addDuplicate();
      else {
        const g = E.instantiate(tmpl, tmpl.parent); g.setActive(true);
        s = g.comp('BlindBagCollection.SellItem'); s.setItem(sprite, price); this.rows.push(s);
      }
      this.total += price;
    }
    const a = E.txtOf(this.ref('_txtTradeAdPrice')); if (a) a.text = String(this.total);
    const n = E.txtOf(this.ref('_txtTradeNormalPrice')); if (n) n.text = String(Math.floor(this.total * 0.2));
  }
  onHide() { const cb = this.cb; this.cb = null; if (cb) cb(); for (const r of this.rows) E.destroy(r.go); this.rows = []; }
}
S['BlindBagCollection.AutoSellPopup'] = AutoSellPopup;

// ---------------------------------------------------------------- CollectionCompletePopup ("Completed!")
class CollectionCompletePopup extends E.PopupBase {
  onInit() {
    G.onClick(this.ref('_btnAdReward'), () => this.onBtnAdRewardClick());
    G.onClick(this.ref('_btnReward'), () => this.onBtnRewardClick());
    const fx = G.goOf(this.ref('_fxConfetti')); if (fx) fx.setActive(false);
    this.moneyReward = 500; this.moneyBonus = 100;
  }
  pop(k, delay) { const g = G.goOf(this.ref(k)); if (!g) return; E.killOwner(g); g.sx = g.sy = 0; E.scaleTo(g, 1, 0.3, { ease: E.ease.outBack, delay }); }
  onShow() {
    this.busy = false;
    for (const k of ['_btnAdReward', '_btnReward']) { const b = G.btn(this.ref(k)); if (b) b.interactable = true; }
    G.sound(48); playFx(this.ref('_fxConfetti'), true);
    this.pop('_tfTitle', 0); this.pop('_tfRewardInfo', 0.75); this.pop('_tfBtnAdReward', 1.0); this.pop('_tfBtnReward', 1.5);
    const e = E.txtOf(this.ref('_txtEarnings')); if (e) e.text = '+' + this.moneyReward;
    const t = E.txtOf(this.ref('_txtTips')); if (t) t.text = '+' + this.moneyBonus;
    const u = user(); u.BlindbagPlayTime = (u.BlindbagPlayTime || 0) + 1; G.save();
    if (G.orderAvatar) { const im = compOf(this.ref('_imgCustomer'), 'Img'); if (im) im.sp = spKey(G.orderAvatar); }
    if (G.obtainExperiencePoint) try { G.obtainExperiencePoint(); } catch (er) { console.error(er); }
  }
  lockButtons() { for (const k of ['_btnAdReward', '_btnReward']) { const b = G.btn(this.ref(k)); if (b) b.interactable = false; } }
  onBtnRewardClick() {
    if (this.busy) return; this.busy = true;
    G.click(); this.lockButtons();
    const u = user(); u.ClickerRewardClaimCount = Math.min((u.ClickerRewardClaimCount || 0) + 1, 4); G.save();
    G.collectMoney(this.moneyReward + this.moneyBonus, 10, () => this.finish());
  }
  onBtnAdRewardClick() { // rewarded ad treated as instant success
    if (this.busy) return; this.busy = true;
    G.click(); this.lockButtons();
    G.collectMoney((this.moneyReward + this.moneyBonus) * 2, 10, () => this.finish());
  }
  finish() {
    const u = user(); if (!u.IsDoneTutorialBlindBag) { u.IsDoneTutorialBlindBag = true; G.save(); }
    G.BackFromGameMode = 2; G.backFromGameMode = 2; // GameModeEnum.BlindBag
    G.goto('Home');
  }
  onHide() { playFx(this.ref('_fxConfetti'), false); }
}
S['BlindBagCollection.CollectionCompletePopup'] = CollectionCompletePopup;

// ---------------------------------------------------------------- Blindbag.PopupWowBlindbag ("Wow!" / "Get 1 more !")
class PopupWowBlindbag extends E.PopupBase {
  parts() { return [G.goOf(this.ref('_tfContentNormal')), G.goOf(this.ref('_tfContentGetOneMore'))]; }
  showGetOneMore(isLuck) {
    const [n, m] = this.parts();
    if (n) n.setActive(!isLuck); if (m) m.setActive(!!isLuck);
    for (const g of [n, m]) if (g) { E.killOwner(g); E.scaleTo(g, 1, 0.3, { ease: E.ease.outBack }); }
    playFx(this.ref('_fx'), true);
    const t = E.txtOf(this.ref('_txtReaction')); const l = this.d._reactionText || [];
    if (t && l.length) t.text = l[E.randInt(0, l.length)];
  }
  hide() {
    if (!this._showing) return;
    const [n, m] = this.parts();
    if (m) { E.killOwner(m); E.scaleTo(m, 0, 0.3, { ease: E.ease.inBack }); }
    if (!n) { super.hide(); playFx(this.ref('_fx'), false); return; }
    E.killOwner(n);
    E.scaleTo(n, 0, 0.3, { ease: E.ease.inBack, done: () => { super.hide(); playFx(this.ref('_fx'), false); } });
  }
}
S['Blindbag.PopupWowBlindbag'] = PopupWowBlindbag;

// ---------------------------------------------------------------- CharmFlyToBasketBB (not used in level4: its Content has scale 0)
class CharmFlyToBasketBB extends E.Behaviour { initialize() { this.imageScale = 0.8; this.imageScaleOnBasket = 0.2; } }
if (!S['BlindBagCollection.CharmFlyToBasketBB']) S['BlindBagCollection.CharmFlyToBasketBB'] = CharmFlyToBasketBB;
})();
