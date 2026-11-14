'use strict';
// Dumpling mode, livestream half (docs/specs/spec_dumpling.md, read from the original's disassembly):
// NK.LivestreamPresenter (room switch, countdown, viewers / idle question / donate loops, OpenBox order, end + exp + level up),
// NK.UnboxStageView (fly-in, swipe to tear the label, 3 tap beats with tremble, reveal with rays / light / flash / confetti,
// tap to continue, curved fly to the shelf slot), streamer emotions (EmotionTable) and the code-built donate banner.
(() => {
const G = E.Game; const D = G.dumpling;
const { find, setText, img, sfx, vib, toLocal, tw, shake, punchS, punchR, jump, wait, newImg, col, getA, setA, so, str } = D;
const P = () => D.P();
const RARITY_KEY = ['Common', 'Rare', 'Epic', 'Legendary'];
const CHAT = ['openCommon', 'openRare', 'openEpic', 'openMythic'];
const EXP_PER_LIVE = 3000;
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const rnd = (a, b) => a + Math.random() * (b - a);
// stage-local point (UnboxStage stretches full screen, pivot centre) from a screen point / a GameObject
const stagePt = (st, x, y) => E.M.ap(E.M.inv(st.wm), x, y);

// ---------------------------------------------------------------- emotions (EmotionManager / StreamerEmotionController)
const FACE = { 1: 'happy_heart', 2: 'eye_blinks', 3: 'happy', 4: 'tear_up', 5: 'phung_phiu', 6: 'cry', 7: 'angry' };
const EM = { Idle: 0, HeartEyes: 1, Sparkling: 2, Happy: 3, Teary: 4, Pouting: 5, Crying: 6, Angry: 7 };
// EmotionTable: rarity -> [first open (new), repeat open (duplicate)]
const EMOTION_TABLE = [
  [[EM.HeartEyes, EM.Sparkling], [EM.Teary, EM.Pouting, EM.Crying, EM.Angry]],
  [[EM.Happy, EM.Sparkling], [EM.Teary, EM.Happy, EM.Crying, EM.Pouting, EM.Angry]],
  [[EM.HeartEyes, EM.Happy, EM.Sparkling], [EM.Crying, EM.Teary, EM.Pouting, EM.Angry]],
  [[EM.Happy, EM.Sparkling, EM.HeartEyes], [EM.Teary, EM.Pouting, EM.Crying, EM.Happy]],
];
const BEAT_EMOTION = [-1, EM.Happy, EM.Sparkling];

// ---------------------------------------------------------------- UnboxFx (pooled images under the stage "Fx" rect)
class Fx {
  constructor(root) { this.root = root; }
  part(sp, x, y, w, h, color) { const g = newImg('p', this.root, sp, w, h, color); g.rt[4] = x; g.rt[5] = y; return g; }
  burst(sp, cx, cy, n, dmin, dmax, smin, smax, colors, dur) {
    for (let i = 0; i < n; i++) {
      const s = rnd(smin, smax); const g = this.part(sp, cx, cy, s, s, E.pick(colors)); const a = Math.random() * Math.PI * 2, d = rnd(dmin, dmax);
      g.sx = g.sy = 0.2; g.rot = rnd(0, 360);
      tw(g, { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, rot: g.rot + rnd(-180, 180) }, dur, 'outCubic');
      tw(g, { s: 1 }, dur * 0.3, 'outBack').then(() => tw(g, { s: 0, a: 0 }, dur * 0.7, 'inQuad')).then(() => E.destroy(g));
    }
  }
  debris(cx, cy, n, smin, smax, colors, spread, power) {
    for (let i = 0; i < n; i++) {
      const s = rnd(smin, smax); const g = this.part(null, cx, cy, s, s * rnd(0.5, 1), E.pick(colors)); const d = rnd(0.6, 0.9);
      tw(g, { rot: rnd(-540, 540) }, d, 'linear');
      jump(g, cx + rnd(-spread, spread), cy - rnd(spread * 0.4, spread), power * rnd(0.6, 1), d, 'linear').then(() => E.destroy(g));
      tw(g, { a: 0 }, d * 0.4, 'inQuad', d * 0.6);
    }
  }
  ring(sp, x, y, color, size, dur) { const g = this.part(sp, x, y, size, size, color); g.sx = g.sy = 0.2; tw(g, { s: 1, a: 0 }, dur, 'outCubic').then(() => E.destroy(g)); }
  confetti(n, colors, dur, h, w) {
    for (let i = 0; i < n; i++) {
      const s = rnd(16, 30); const x0 = rnd(-w / 2, w / 2); const g = this.part(null, x0, h / 2 + rnd(20, 200), s, s * 0.55, E.pick(colors)); const d = rnd(dur * 0.6, dur);
      g.rot = rnd(0, 360); tw(g, { y: -h / 2 - 60, x: x0 + rnd(-120, 120), rot: g.rot + rnd(-720, 720) }, d, 'linear', rnd(0, 0.3)).then(() => E.destroy(g));
    }
  }
  flyingLid(sp, x, y, size, dir) { const g = this.part(sp, x, y, size, size); tw(g, { rot: dir * 200, a: 0 }, 0.9, 'linear'); jump(g, x + dir * 520, y - 900, 420, 0.9, 'linear').then(() => E.destroy(g)); }
  clear() { for (const c of this.root.children.slice()) E.destroy(c); }
}

// ---------------------------------------------------------------- NK.UnboxStageView
class Stage {
  constructor(ctrl, go) {
    this.c = ctrl; this.go = go; this.art = ctrl.art; this.d = (go.comp('NK.UnboxStageView') || {}).d || {};
    const f = (n) => find(go, n);
    this.cg = go.comp('CG'); this.dim = go.comp('Img');
    this.box = f('Box'); this.body = f('Body'); this.label = f('Label'); this.bskG = f('BoxSkeleton'); this.bsk = this.bskG.comp('Spine');
    this.glow = f('Glow'); this.dum = f('Dumpling'); this.dsk = find(this.dum, 'Skeleton').comp('Spine'); this.newTag = find(this.dum, 'NewTag');
    this.card = f('NameCard'); this.banner = f('Banner'); this.hint = f('Hint'); this.hand = find(this.hint, 'Hand');
    this.boxPos = [this.box.rt[4], this.box.rt[5]]; this.dumPos = [this.dum.rt[4], this.dum.rt[5]]; this.cardPos = [this.card.rt[4], this.card.rt[5]];
    const idx = (g) => g.parent.children.indexOf(g);
    // Awake: Light (1100) at the glow's index, 2 confetti sheets, the Fx root at the dumpling's index, a full-screen Flash on top
    this.light = newImg('Light', go, this.art._fxLight, 1100, 1100); this.light.setSiblingIndex(idx(this.glow) + 1);
    this.confetti = [0, 1].map(() => { const g = newImg('Confetti', go, this.art._fxConfetti, 1064, 801); g.setSiblingIndex(idx(this.dum)); return g; });
    const fxRoot = E.newGO('Fx', go, true); fxRoot.rt = [0.5, 0.5, 0.5, 0.5, 0, 0, 10, 10, 0.5, 0.5]; fxRoot.setSiblingIndex(idx(this.dum)); this.fx = new Fx(fxRoot);
    this.flash = newImg('Flash', go, null, 0, 0); this.flash.rt = [0, 0, 1, 1, 0, 0, 0, 0, 0.5, 0.5];
    img(this.glow).sp = this.art._fxRays; img(this.glow).pa = 1;
    this.ensureHand();
    this.hide();
  }
  sprite(k) { return this.art[k]; }
  ensureHand() { // EnsureHandSkeleton: Hand_Ctrl spine under the hand, placeholder image off
    const key = Object.keys(P().spine).find((k) => P().spine[k].name === 'bf_Hand_Ctrl'); img(this.hand).color[3] = 0;
    if (key) { const c = { t: 'Spine', ui: 1, data: key, skin: 'default', anim: 'idle', loop: true, go: this.hand, enabled: true, color: [1, 1, 1, 1] }; this.hand.comps.push(c); E.spineInit(c); this.handSp = c; }
  }
  killAll() { for (const g of [this.box, this.dum, this.card, this.newTag, this.glow, this.light, this.flash, this.label, this.banner, this.hand, this.hint, this.go, ...this.confetti]) E.killOwner(g); E.killOwner(this); }
  hide() {
    this.killAll(); this.fx.clear(); this.mode = 0; this.cancelInput();
    this.cg.alpha = 0; this.cg.br = false; this.go.setActive(false); this.setDim(0);
    Object.assign(this.box, { sx: 1, sy: 1, rot: 0 }); this.box.rt[4] = this.boxPos[0]; this.box.rt[5] = this.boxPos[1];
    img(this.body).color = [1, 1, 1, 0]; this.label.setActive(false); this.bsk.color = [1, 1, 1, 1];
    this.dum.setActive(false); Object.assign(this.dum, { sx: 1, sy: 1, rot: 0 }); this.dum.rt[4] = this.dumPos[0]; this.dum.rt[5] = this.dumPos[1];
    this.glow.setActive(false); this.glow.rot = 0; this.light.setActive(false); setA(this.flash, 0); for (const c of this.confetti) c.setActive(false);
    this.card.setActive(false); this.card.rt[4] = this.cardPos[0]; this.card.rt[5] = this.cardPos[1]; this.card.sx = this.card.sy = 1;
    this.newTag.setActive(false); this.banner.setActive(false); this.hint.setActive(false);
  }
  setDim(a) { this.dim.color = [this.dim.color[0], this.dim.color[1], this.dim.color[2], a]; }
  // 1.5 OpenAsync: the box flies in from its tray slot
  async open(boxArt, from) {
    this.hide(); this.go.setActive(true); this.cg.alpha = 1; this.cg.br = true;
    const c = this.bsk; c._played = true; E.spineSkin(c, boxArt.Skin); E.spinePlay(c, 'CloseIdle_full', true);
    E.tween({ dur: 0.35, owner: this.go, update: (v) => this.setDim(0.88 * v) });
    await wait(0.01, this); // one layout pass for world matrices
    if (from && from.wm) { const p = stagePt(this.go, from.wm[4], from.wm[5]); this.box.rt[4] = p[0]; this.box.rt[5] = p[1]; }
    Object.assign(this.box, { sx: 0.45, sy: 0.45, rot: -10 });
    const b = this.box, [bx, by] = this.boxPos;
    await tw(b, { sx: 0.52, sy: 0.36 }, 0.08);
    await Promise.all([jump(b, bx, by, 320, 0.5), tw(b, { sx: 0.92, sy: 1.08 }, 0.5), tw(b, { rot: 0 }, 0.5, 'outBack', 0, 'boxRot')]);
    await tw(b, { sx: 1.14, sy: 0.86 }, 0.07);
    await tw(b, { s: 1 }, 0.45, 'outElastic');
    this.fx.burst(this.art._fxStar, bx, by - 230, 8, 120, 260, 26, 44, [[1, 1, 1, 1]], 0.5); vib(15);
    this.startIdle();
  }
  startIdle() { const b = this.box; this.idle = E.tween({ dur: 0.75, loops: -1, yoyo: true, owner: 'idle' + b.pid, ease: E.ease.inOutSine, update: (v) => { b.sx = 1 + 0.03 * v; b.sy = 1 - 0.03 * v; } }); }
  stopIdle() { E.killOwner('idle' + this.box.pid); this.box.sx = this.box.sy = 1; }
  startTremble(p) { this.tremble = shake(this.box, 1, Math.min(1, Math.max(0, p)) * 5 + 2, 40, false, -1, 'tremble'); }
  stopTremble() { E.killOwner('tremble'); this.box.rt[4] = this.boxPos[0]; this.box.rt[5] = this.boxPos[1]; }
  // 1.7 hints and the Hand_Ctrl hand (positions are stage-space, the hand lives under Hint)
  showHint(text, swipe) {
    const h = this.hint, hd = this.hand; h.setActive(true); E.killOwner(h); h.sx = h.sy = 0.6; tw(h, { s: 1 }, 0.35, 'outBack'); setText(find(h, 'Text'), text);
    E.killOwner(hd); hd.setActive(true); hd.sx = hd.sy = 1; if (this.handSp) E.spinePlay(this.handSp, swipe ? 'idle' : 'Click', true);
    const toHint = (x, y) => [x - h.rt[4], y - h.rt[5]]; const [bx, by] = this.boxPos;
    if (swipe) {
      const a = toHint(bx - 230, by - 100), b = toHint(bx + 210, by - 100);
      const loop = async () => { if (!hd.activeSelf || !this.go.activeSelf) return; hd.rt[4] = a[0]; hd.rt[5] = a[1]; await wait(0.2, hd); await tw(hd, { x: b[0], y: b[1] }, 0.7, 'inOutCubic'); await wait(0.2, hd); if (hd.activeSelf) loop(); };
      loop();
    } else {
      const p = toHint(bx + 170, by - 70); hd.rt[4] = p[0]; hd.rt[5] = p[1];
      const loop = async () => { if (!hd.activeSelf || !this.go.activeSelf) return; await tw(hd, { s: 0.75 }, 0.12); await tw(hd, { s: 1 }, 0.25, 'outBack'); await wait(0.2, hd); if (hd.activeSelf) loop(); };
      loop();
    }
  }
  hideHint() { E.killOwner(this.hand); this.hand.setActive(false); E.killOwner(this.hint); this.hint.setActive(false); }
  // 1.8 input: Tear (horizontal drag progress) / Tap (completes on pointer down)
  cancelInput() { if (this.l) E.input.off(this.l); this.l = null; this.res = null; }
  waitInput(mode) {
    this.cancelInput(); this.mode = mode;
    return new Promise((res) => {
      this.res = res;
      this.l = E.input.on((t, ev) => {
        if (!this.go.activeInHierarchy) return;
        if (t === 'down') { this.last = stagePt(this.go, ev.x, ev.y); if (this.mode === 2) this.complete(); }
        else if (t === 'move' && this.mode === 1) this.onDrag(ev);
        else if (t === 'up' && this.mode === 1) this.onEndDrag();
      });
    });
  }
  complete() { const r = this.res; this.mode = 0; this.cancelInput(); if (r) r(); }
  waitTear(dist) { this.tearDir = 0; this.tearProg = 0; this.lastCrackle = 0; this.tearDist = Math.max(dist, 1); return this.waitInput(1); }
  waitTap() { return this.waitInput(2); }
  onDrag(ev) {
    const k = E.canvasScale(this.c.live) || 1; const dx = (ev.dx || 0) / k; const ad = Math.abs(dx);
    if (ad > 0.01) {
      if (!this.tearDir) { this.stopIdle(); E.killOwner(this.box); E.killOwner('boxRot'); this.tearDir = dx > 0 ? 1 : -1; this.hideHint(); }
      this.tearProg = Math.min(1, this.tearProg + ad / this.tearDist);
      const e = 1 - (1 - this.tearProg) ** 2, dir = this.tearDir;
      this.box.rot = dir * 4 * e;
      if (this.tearProg - this.lastCrackle >= 0.12) { // crackle: shreds + sparkles along the tear edge
        this.lastCrackle = this.tearProg; const w = this.box.rect.w * 0.85;
        const x = this.boxPos[0] + dir * (w * 0.8 * e - 0.5 * w), y = this.boxPos[1] + rnd(80, 230);
        this.fx.debris(x, y, 3, 14, 24, SHRED, 160, 200); this.fx.burst(this.art._fxSparkle, x, y, 2, 30, 100, 30, 50, [[1, 1, 1, 1]], 0.4); vib(10);
      }
    }
    if (this.tearProg >= 1) this.complete();
  }
  onEndDrag() { if (!this.tearDir || this.tearProg >= 1) return; E.killOwner(this.box); this.box.rot = 0; punchR(this.box, this.tearDir * 8, 0.35, 8); }
  // 1.9 TearOffLabel: unbox_tag, shreds, sparkles, recoil
  tearOff() {
    const dir = this.tearDir || 1; const c = this.bsk; let d = 0.5;
    const st = c.state; if (st && c.data_) { const a = c.data_.findAnimation('unbox_tag'); st.setAnimation(0, 'unbox_tag', false); st.addAnimation(0, 'Close_box', true, 0); d = Math.min(2, Math.max(0.3, a ? a.duration : 0.5)); }
    const [bx, by] = this.boxPos; const cx = bx + dir * 160, cy = by + 150;
    this.fx.debris(cx, cy, 14, 18, 34, SHRED, 380, 420);
    this.fx.burst(this.art._fxSparkle, cx, cy, 8, 80, 220, 40, 70, [[1, 1, 1, 1], [1, 0.95, 0.7, 1]], 0.55);
    E.killOwner(this.box); tw(this.box, { sx: 1.1, sy: 0.9 }, 0.07).then(() => { tw(this.box, { s: 1 }, 0.4, 'outElastic'); tw(this.box, { rot: 0 }, 0.5, 'outElastic', 0, 'boxRot'); });
    vib(30); // _sfxTear is null in the original
    return d;
  }
  // 1.10 PlayBeat: hop + squash, alternating tilt, ring at the finger, star burst, light, final shake; tremble afterwards
  beat(beat, beats) {
    const p = Math.min(1, beat / Math.max(beats, 1)); const b = this.box, [bx, by] = this.boxPos;
    this.stopIdle(); this.stopTremble(); E.killOwner(b); E.killOwner('boxRot'); b.rot = 0;
    const ang = (p * 8 + 6) * (beat % 2 ? 1 : -1), hop = p * 80 + 50;
    (async () => {
      await tw(b, { sx: 1.18, sy: 0.8 }, 0.06);
      await Promise.all([tw(b, { y: by + hop }, 0.16), tw(b, { sx: 0.9, sy: 1.12 }, 0.16, 'outQuad', 0, 'bs'), tw(b, { rot: ang }, 0.16, 'outQuad', 0, 'boxRot')]);
      await Promise.all([tw(b, { y: by }, 0.13, 'inQuad'), tw(b, { rot: 0 }, 0.13, 'outQuad', 0, 'boxRot'), tw(b, { s: 1 }, 0.13, 'outQuad', 0, 'bs')]);
      await tw(b, { sx: 1.12, sy: 0.88 }, 0.06); await tw(b, { s: 1 }, 0.3, 'outElastic');
      if (this.mode === 2) this.startTremble(p);
    })();
    const lp = this.last || [bx, by];
    this.fx.ring(this.art._fxLight, lp[0], lp[1], [1, 1, 1, 0.9], 260, 0.45);
    this.fx.burst(this.art._fxStar, bx, by + 120, 3 * beat + 4, 160, 320, 24, 48, [[1, 1, 1, 1], [1, 0.9, 0.6, 1]], 0.6);
    const L = this.light; L.setActive(true); L.rt[4] = bx; L.rt[5] = by; tw(L, { a: 0.25 + 0.4 * p }, 0.2); tw(L, { s: 0.55 + 0.35 * p }, 0.3, 'outBack', 0, 'lightS');
    if (beat >= beats) shake(this.go, 0.3, 16, 30, true, 0, 'stageShake');
    vib(p >= 0.9 ? 45 : p >= 0.5 ? 28 : 15); sfx('button_click');
  }
  flashA(a, d) { const f = img(this.flash); f.color = [1, 1, 1, a]; tw(this.flash, { a: 0 }, d); }
  // 1.11 RevealAsync
  async reveal(boxArt, d, rarity, isNew, name) {
    const art = this.art; const hype = isNew ? rarity : 0; const rc = col(art._rarityColors[rarity]);
    this.stopIdle(); this.stopTremble(); E.killOwner(this.box); this.box.rot = 0; this.box.sx = this.box.sy = 1;
    const [bx, by] = this.boxPos, [dx, dy] = this.dumPos;
    // A. open the box (spine "Open" event), flash, sound, the box sinks and fades
    tw(this.light, { a: 0.9 }, 0.4);
    await new Promise((res) => {
      const c = this.bsk; let done = false; const fin = () => { if (!done) { done = true; res(); } };
      const go = () => { const e = c.state.setAnimation(0, 'Open', false); c.state.addAnimation(0, 'OpenIdle', true, 0); e.listener = { event: (en, ev) => { if (ev && ev.data && ev.data.name === 'Open') fin(); }, complete: fin }; };
      if (c.ready) go(); else c.queue.push(go); E.after(2.5, fin, this);
    });
    this.flashA(rarity > 1 ? 1 : 0.75, 0.4); vib(45); sfx('open_box');
    tw(this.box, { y: by - 70 }, 0.6, 'inOutSine'); E.tween({ dur: 0.6, owner: this.bskG, update: (v) => { this.bsk.color[3] = 1 - v; } });
    // B. rays
    const G2 = this.glow; G2.setActive(true); img(G2).sp = rarity >= 3 ? art._fxRaysMythic : art._fxRays; img(G2).color = [rc[0], rc[1], rc[2], 0]; G2.sx = G2.sy = 0.2;
    tw(G2, { a: isNew ? 0.6 : 0.3 }, 0.35); tw(G2, { s: 1 + 0.1 * hype }, 0.55, 'outBack', 0, 'glowS');
    E.tween({ dur: 8 - hype, loops: -1, owner: 'glowRot', ease: E.ease.linear, update: (v) => { G2.rot = -360 * v; } });
    // C. light
    const L = this.light; L.rt[4] = dx; L.rt[5] = dy; const lc = lerp(rc, [1, 1, 1, 1], 0.5); img(L).color = [lc[0], lc[1], lc[2], isNew ? 0.85 : 0.5]; L.sx = L.sy = 0.9;
    E.tween({ dur: 0.7, loops: -1, yoyo: true, owner: 'lightLoop', ease: E.ease.inOutSine, update: (v) => { L.sx = L.sy = 0.9 + 0.22 * v; } });
    // D. dumpling pop + particles + confetti
    const du = this.dum; du.setActive(true); img(du).sp = d.Sprite; img(du).color[3] = 0; const ds = this.dsk; ds._played = true; E.spineSkin(ds, d.Skin); E.spinePlay(ds, 'idle_3', true);
    du.rt[4] = bx; du.rt[5] = by + 60; du.sx = du.sy = 0.2; du.rot = 0;
    const white = [1, 1, 1, 1], warm = [1, 0.95, 0.7, 1];
    this.fx.burst(art._fxSparkle, dx, dy, isNew ? 8 * hype + 12 : 6, 180, 60 * hype + 420, 40, 80, [white, rc, warm], 0.8);
    this.fx.burst(art._fxStar, dx, dy, isNew ? 4 * hype + 8 : 3, 220, 480, 30, 55, [white, rc], 1.0);
    this.burstConfetti();
    const h = this.go.rect ? this.go.rect.h : 1920, w = this.go.rect ? this.go.rect.w : 1080;
    this.fx.confetti(isNew ? 20 * rarity + 20 : 15, CONFETTI, 2.2, h, w);
    if (isNew && rarity >= 2) { shake(this.go, 0.25 + 0.12 * rarity, 10 + 6 * rarity, 30, true, 0, 'stageShake'); sfx('win'); }
    // E. mythic banner + echoes
    if (isNew && rarity >= 3) {
      const B = this.banner; B.setActive(true); B.sx = B.sy = 0; B.rot = -8;
      Promise.all([tw(B, { s: 1.15 }, 0.3, 'outBack'), tw(B, { rot: 0 }, 0.3, 'outQuad', 0, 'bRot')]).then(() => tw(B, { s: 1 }, 0.6));
      (async () => { for (let i = 0; i < 3; i++) { await wait(0.26, this); if (!du.activeSelf) return; this.flashA(0.5, 0.3); this.fx.burst(art._fxSparkle, dx, dy, 14, 120, 520, 40, 80, [white, rc], 0.8); vib(28); } })();
    }
    // F. name card
    const C = this.card; C.setActive(true); C.rt[4] = this.cardPos[0]; C.rt[5] = this.cardPos[1] - 140; C.sx = C.sy = 0.6;
    const tcol = col(art._rarityTextColors[rarity]); const rname = E.tr(art._rarityNames[rarity] || RARITY_KEY[rarity]);
    const nt = find(C, 'Name').comp('Txt'), rt = find(C, 'Rarity').comp('Txt');
    nt.text = name; nt.color = lerp(tcol, [0, 0, 0, 1], 0.45); rt.text = isNew ? rname : E.tr(str('livestream.duplicate')).replace('{0}', rname); rt.color = tcol;
    this.newTag.setActive(false);
    // G. main sequence
    const seq = (async () => {
      await Promise.all([tw(du, { x: dx, y: dy + 50 }, 0.3), tw(du, { sx: 0.75, sy: 1.3 }, 0.3, 'outQuad', 0, 'duS')]);
      await Promise.all([tw(du, { x: dx, y: dy }, 0.16, 'inQuad'), tw(du, { sx: 1.25, sy: 0.78 }, 0.16, 'outQuad', 0, 'duS')]);
      await tw(du, { s: 1 }, 0.6, 'outElastic', 0, 'duS');
      if (!isNew) await new Promise((r) => { punchR(du, 12, 0.5, 6); E.after(0.5, r, this); });
    })();
    tw(C, { x: this.cardPos[0], y: this.cardPos[1] }, 0.4, 'outBack', 0.45); tw(C, { s: 1 }, 0.4, 'outBack', 0.45, 'cardS');
    if (isNew) E.after(0.55, () => { const T = this.newTag; T.setActive(true); T.sx = T.sy = 2.4; T.rot = -25; tw(T, { s: 1, rot: 0 }, 0.25, 'inQuad'); vib(15); }, this);
    await seq;
    if (isNew) E.tween({ dur: 0.55, loops: -1, yoyo: true, owner: this.newTag, ease: E.ease.inOutSine, update: (v) => { this.newTag.sx = 1 + 0.04 * v; this.newTag.sy = 1 - 0.04 * v; } });
  }
  burstConfetti() { // 1.12: two big confetti sheets burst left/right from the dumpling, drift and fade (~3 s)
    const [dx, dy] = this.dumPos;
    this.confetti.forEach((g, i) => {
      const side = i ? 1 : -1; E.killOwner(g); g.setActive(true); img(g).color = [1, 1, 1, 0]; g.rt[4] = dx; g.rt[5] = dy; g.sx = g.sy = 0.3; g.rot = 0;
      tw(g, { a: 1 }, 0.15, 'outQuad', 0, 'cfA' + i);
      tw(g, { x: dx + side * 260, y: dy + 180 }, 0.45, 'outCubic').then(() => tw(g, { x: dx + side * 280, y: dy - 120 }, 2.6, 'outSine'));
      tw(g, { sx: side, sy: 1 }, 0.45, 'outBack', 0, 'cfS' + i); tw(g, { rot: side * 4 }, 2.6, 'inOutSine', 0.45, 'cfR' + i);
      tw(g, { a: 0 }, 1.4, 'inQuad', 1.6, 'cfA' + i).then(() => g.setActive(false));
    });
  }
  // 1.13 FlyToAsync: everything else fades, the dumpling flies on a hump with a star trail and lands with a ring + sparkles
  async flyTo(slot, isNew) {
    this.hideHint(); E.killOwner(this.newTag); E.killOwner('glowRot'); E.killOwner('lightLoop');
    for (const g of [this.glow, this.light, ...this.confetti]) tw(g, { a: 0 }, 0.25, 'outQuad', 0, 'fo' + g.pid);
    tw(this.card, { s: 0 }, 0.2, 'inBack', 0, 'cardS'); tw(this.newTag, { s: 0 }, 0.15, 'inBack'); this.banner.setActive(false);
    E.tween({ dur: 0.35, owner: this.go, update: (v) => this.setDim(0.88 * (1 - v)) }); this.cg.br = false;
    const du = this.dum; if (!slot || !slot.wm) { await wait(0.3, this); this.hide(); return; }
    const tgt = stagePt(this.go, slot.wm[4], slot.wm[5]); const scale = Math.max(0.01, slot.rect.h / du.rect.h);
    const s0 = [du.rt[4], du.rt[5]]; const mid = [(s0[0] + tgt[0]) / 2, (s0[1] + tgt[1]) / 2 + 220];
    await tw(du, { sx: 1.2, sy: 0.8 }, 0.1);
    let trail = 0; const sx0 = du.sx, sy0 = du.sy, r0 = du.rot;
    await new Promise((res) => E.tween({ dur: 0.62, owner: du, ease: E.ease.linear, update: (v) => {
      const t = E.ease.inOutQuad(v), q = 1 - t; // quadratic curve through the hump (CatmullRom [mid, end])
      const cx = 2 * mid[0] - (s0[0] + tgt[0]) / 2, cy = 2 * mid[1] - (s0[1] + tgt[1]) / 2;
      du.rt[4] = q * q * s0[0] + 2 * q * t * cx + t * t * tgt[0]; du.rt[5] = q * q * s0[1] + 2 * q * t * cy + t * t * tgt[1];
      const si = E.ease.inQuad(v); du.sx = sx0 + (scale - sx0) * si; du.sy = sy0 + (scale - sy0) * si;
      du.rot = r0 + (s0[0] > tgt[0] ? -360 : 360) * t;
      if (!isNew) this.dsk.color[3] = 1 - 0.35 * v;
      if (v - trail >= 0.05 / 0.62) { trail = v; this.fx.burst(this.art._fxStar, du.rt[4], du.rt[5], 1, 0, 40, 22, 36, [[1, 1, 1, 1]], 0.4); }
    }, done: res }));
    du.setActive(false);
    this.fx.ring(this.art._fxLight, tgt[0], tgt[1], [1, 1, 1, 0.9], slot.rect.h * 2.2, 0.4);
    this.fx.burst(this.art._fxSparkle, tgt[0], tgt[1], isNew ? 10 : 4, 0, 160, 26, 48, [[1, 1, 1, 1], [1, 0.92, 0.6, 1]], 0.5);
    vib(15); sfx('collect_coin');
    await wait(0.35, this); this.dsk.color[3] = 1; this.hide();
  }
}
const SHRED = [[1, 1, 1, 1], [1, 0.95, 0.85, 1], [1, 0.78, 0.86, 1], [0.95, 0.36, 0.42, 1], [1, 0.86, 0.45, 1]];
const CONFETTI = [[1, 0.85, 0.48, 1], [1, 0.56, 0.72, 1], [0.56, 0.83, 1, 1], [0.76, 0.66, 0.96, 1], [0.56, 0.9, 0.71, 1], [1, 1, 1, 1]];

// ---------------------------------------------------------------- NK.DonateBannerView (built in code)
class Donate {
  constructor(parent, art) {
    const A = art._donate; this.A = A;
    const root = (this.root = E.newGO('Donate', parent, true)); root.rt = [0, 0, 1, 1, 0, 0, 0, 0, 0.5, 0.5]; root.comps.push({ t: 'CG', alpha: 1, ia: true, br: true, go: root, enabled: true });
    const at = (g, ax, ay, x, y) => { g.rt[0] = g.rt[2] = ax; g.rt[1] = g.rt[3] = ay; g.rt[4] = x; g.rt[5] = y; return g; };
    const text = (parent2, s, fs, x, y, w, h, c) => { const g = E.newGO('Text', parent2, true); g.rt = [0.5, 0.5, 0.5, 0.5, x, y, w, h, 0.5, 0.5]; g.comps.push({ t: 'Txt', text: s, fs, ha: 2, va: 512, color: c || [1, 1, 1, 1], enabled: true, go: g, font: A.Font, ow: 0.25, oc: [0.78, 0.27, 0.42, 1], auto: 1, fmin: 18, fmax: fs, wrap: 1 }); return g; };
    this.phone = at(newImg('Phone', root, A.Phone, 130, 134), 0, 1, 80, -430); this.phone.rot = -10;
    const badge = newImg('Alert', this.phone, null, 44, 44, [0.91, 0.23, 0.29, 1]); badge.rt[4] = 52; badge.rt[5] = 52; text(badge, '!', 34, 0, 2, 44, 44);
    const bar = (this.banner = at(newImg('Banner', root, A.Bar, 760, 140), 0.5, 1, 30, -440)); this.bannerPos = [30, -440];
    this.avatar = newImg('Avatar', bar, E.pick(A.Avatars || []), 120, 120); this.avatar.rt[4] = -330; this.avatar.rt[5] = 8;
    this.timer = newImg('Timer', bar, A.TimerRing, 150, 157); this.timer.rt[4] = -330; this.timer.rt[5] = 8; Object.assign(img(this.timer), { it: 3, fm: 4, fo: 2, fa: 1, fcw: 0 });
    this.label = text(bar, E.tr(str('livestream.gift')), 44, -105, 6, 270, 110);
    const coin = newImg('Coin', bar, A.Coin, 80, 80); coin.rt[4] = 105; coin.rt[5] = 6;
    this.amount = text(bar, '0', 60, 225, 6, 170, 80);
    const cb = (this.claim = newImg('Claim', bar, A.ClaimButton, 270, 96)); cb.rt[4] = 235; cb.rt[5] = -86; Object.assign(img(cb), { it: 1 }); img(cb).nr = 0;
    cb.comps.push({ t: 'Btn', go: cb, onClick: [], interactable: true, enabled: true, tr: 0 }); text(cb, E.tr(str('common.claim') || 'Claim'), 46, -6, 4, 220, 80);
    const ads = newImg('Ads', cb, A.AdsIcon, 55, 57); ads.rt[4] = 125; ads.rt[5] = 38;
    const close = (this.close = newImg('Close', bar, A.Close, 64, 64)); close.rt[4] = 365; close.rt[5] = 62; img(close).nr = 0;
    close.comps.push({ t: 'Btn', go: close, onClick: [() => this.closeBanner(false)], interactable: true, enabled: true, tr: 0 });
    G.onClick(cb, () => this.onClaim());
    this.hide();
  }
  hide() { E.killOwner(this.root); E.killOwner(this.banner); E.killOwner(this.timer); E.killOwner(this.phone); E.killOwner(this.claim); this.showing = false; this.root.setActive(false); }
  show(amount, dur, onClaim) {
    this.hide(); this.showing = true; this.onClaimCb = onClaim; this.root.setActive(true); this.root.comps[0].alpha = 1;
    this.amount.comp('Txt').text = String(Math.round(amount)); img(this.avatar).sp = E.pick(this.A.Avatars || [img(this.avatar).sp]); img(this.timer).fa = 1;
    this.claim.comp('Btn').interactable = false; const ph = this.phone; ph.sx = ph.sy = 0; ph.setActive(true); this.banner.setActive(false);
    (async () => {
      await tw(ph, { s: 1 }, 0.3, 'outBack');
      await new Promise((r) => { const b = ph.rot; E.tween({ dur: 1.2, owner: ph, ease: E.ease.linear, update: (v) => { ph.rot = b + 18 * Math.sin(v * Math.PI * 18) * (1 - v); }, done: () => { ph.rot = b; r(); } }); });
      if (!this.showing) return;
      const B = this.banner; B.setActive(true); B.rt[4] = this.bannerPos[0] - 1100; B.rt[5] = this.bannerPos[1];
      await tw(B, { x: this.bannerPos[0] }, 0.45, 'outBack');
      if (!this.showing) return;
      this.claim.comp('Btn').interactable = true;
      E.tween({ dur: 0.5, loops: -1, yoyo: true, owner: this.claim, ease: E.ease.inOutSine, update: (v) => { this.claim.sx = this.claim.sy = 1 + 0.06 * v; } });
      this.timerTw = E.tween({ dur: Math.max(dur, 0.1), owner: this.timer, ease: E.ease.linear, update: (v) => { img(this.timer).fa = 1 - v; }, done: () => this.closeBanner(false) });
    })();
  }
  onClaim() { if (!this.showing || !this.claim.comp('Btn').interactable) return; this.claim.comp('Btn').interactable = false; E.killOwner(this.timer); const f = this.onClaimCb; if (f) f(); } // rewarded ad = granted at once
  complete() { this.closeBanner(true); }
  closeBanner(claimed) {
    if (!this.showing) return; this.showing = false; E.killOwner(this.timer); E.killOwner(this.claim); this.claim.comp('Btn').interactable = false;
    const B = this.banner; punchS(B, 0.12, 0.12, 0.35, 6);
    E.after(0.35, () => { tw(this.root, { a: 0 }, 0.3); tw(B, { x: this.bannerPos[0] + (claimed ? 0 : 300), y: this.bannerPos[1] + 60 }, 0.3, 'inQuad').then(() => this.hide()); }, this.root);
  }
}

// ================================================================= LivestreamPresenter (methods of DumplingGame)
Object.assign(D.DumplingGame.prototype, {
  showLive() {
    this.paid = false;
    const v = (this.live = this.open('LivestreamView', null));
    this.cfg = so('NK.LivestreamConfig'); this.art = so('NK.LivestreamArtLibrary');
    this.lv = { coins: 0, viewers: 0, busy: false, ended: false, results: [] };
    this.shelf = find(v, 'Room'); this.hud = find(v, 'Hud');
    this.stage = new Stage(this, find(v, 'UnboxStage'));
    setText(find(this.hud, 'Coins'), 0); setText(find(this.hud, 'Viewers'), 0);
    this.streamerGo = find(v, 'Streamer'); this.streamer = this.streamerGo.compInChildren('Spine');
    this.donate = new Donate(v, this.art); this.donate.root.setSiblingIndex(v.children.indexOf(find(v, 'UnboxStage')));
    // the room was picked on the Dumpling home (background selector); the switcher here only keeps "Start Live"
    if (this.room == null || !D.roomDumplings(this.room).length) this.room = D.currentRoom();
    this.roomList = [this.room];
    this.buildShelf(); this.buildTray();
    this.chat = new D.LiveChatFeed(find(v, 'Live Chat'));
    this.chooseRoom();
  },
  // 2.6 RoomSwitcher: arrows only with 2+ rooms, Start pulses; switching slides the room background (0.35 s InOutCubic)
  chooseRoom() {
    const sw = find(this.live, 'RoomSwitcher'); sw.setActive(true);
    const prev = find(sw, 'Previous'), next = find(sw, 'Next'), start = find(sw, 'StartLive');
    prev.setActive(this.roomList.length > 1); next.setActive(this.roomList.length > 1);
    const pulse = () => E.tween({ dur: 0.6, loops: -1, yoyo: true, owner: start, ease: E.ease.inOutSine, update: (k) => { start.sx = start.sy = 1 + 0.05 * k; } });
    pulse();
    const step = async (d, btn) => {
      E.killOwner('arrow' + btn.pid); punchS(btn, 0.2, 0.2, 0.25, 6, 'arrow' + btn.pid);
      if (this.roomList.length < 2 || this.switching) return; this.switching = true; start.comp('Btn').interactable = false;
      const i = this.roomList.indexOf(this.room); this.room = this.roomList[(i + d + this.roomList.length) % this.roomList.length];
      await this.slideRoom(d); this.switching = false; start.comp('Btn').interactable = true;
    };
    G.onClick(prev, () => step(-1, prev)); G.onClick(next, () => step(1, next));
    G.onClick(start, () => { if (this.switching) return; E.killOwner(start); sw.setActive(false); D.save().room = this.room; G.save(); this.goLive(); });
  },
  async slideRoom(dir) {
    const bg = find(this.shelf, 'Background'); const w = this.shelf.rect ? this.shelf.rect.w : 1080;
    const ghost = newImg('RoomLeaving', this.shelf, img(bg).sp, 0, 0); ghost.rt = bg.rt.slice(); ghost.setSiblingIndex(0);
    this.buildShelf(); bg.rt[4] = dir * w;
    await Promise.all([tw(ghost, { x: -dir * w }, 0.35, 'inOutCubic'), tw(bg, { x: 0 }, 0.35, 'inOutCubic')]);
    E.destroy(ghost);
  },
  buildShelf() {
    const bg = find(this.shelf, 'Background'); const slots = find(bg, 'Slots'); const tpl = find(slots, 'SlotTemplate');
    for (const c of slots.children.slice()) if (c !== tpl) E.destroy(c);
    const r = this.art._rooms.find((x) => x.Room === this.room) || this.art._rooms[0];
    img(bg).sp = r.Background;
    const W = this.shelf.rect ? this.shelf.rect.w : 1080; bg.rt[7] = W / 0.5625; // AspectRatioFitter WidthControlsHeight 0.5625
    this.slots = {};
    for (const d of D.roomDumplings(this.room)) {
      const g = D.clone(tpl, slots); const sz = W * 0.15;
      g.rt = [d.Position.x, d.Position.y, d.Position.x, d.Position.y, 0, 0, sz, sz, 0.5, 0.5];
      this.slots[d.Id] = g; this.paintSlot(g, d, D.owned(this.room, d.Id));
    }
  },
  paintSlot(g, d, have) {
    const icon = find(g, 'Icon'); const sk = find(g, 'Skeleton'); const sp = sk.comp('Spine');
    img(icon).sp = d.Sprite; img(icon).color = have ? [1, 1, 1, 0] : [0, 0, 0, 0.93];
    sk.setActive(have); if (have && sp) { sp._played = true; E.spineSkin(sp, d.Skin); E.spinePlay(sp, 'idle_1', true); }
  },
  buildTray() {
    const boxes = find(this.live, 'Boxes'); const tpl = find(boxes, 'BoxTemplate');
    for (const c of boxes.children.slice()) if (c !== tpl) E.destroy(c);
    tpl.setActive(false);
    // layout as on device (the prefab's LayoutGroup values were not exported): 3 centred columns of ~26% width from the tray top
    const lay = boxes.comp('Layout'); if (lay && lay.cell) { lay.cell = [290, 262]; lay.gsp = [40, 22]; lay.con = 1; lay.cc = 3; lay.al = 1; lay.pad = [0, 0, 40, 0]; }
    this.trayBoxes = this.bags.map((b) => {
      const g = D.clone(tpl, boxes); const a = D.boxArt(b.chest); img(g).sp = a.Closed; g._bag = b; g._art = a;
      G.onClick(g, () => this.onBoxClicked(g));
      return g;
    });
    this.setBoxesInteractable(false);
  },
  setBoxesInteractable(on) { // LivestreamBoxItem: idle pulse 1.06 yoyo, staggered by sibling index
    this.trayBoxes.forEach((g, i) => {
      E.killOwner(g); g.sx = g.sy = 1; g.comp('Btn').interactable = on && !g._opened;
      if (on && !g._opened) E.tween({ dur: 0.5, loops: -1, yoyo: true, delay: i * 0.15, owner: g, ease: E.ease.inOutSine, update: (k) => { g.sx = g.sy = 1 + 0.06 * k; } });
    });
  },
  // emotions: face on track 1 (loops until the next one), Idle clears it; "curious" on track 2 while asking
  face(id) {
    const sp = this.streamer; if (!sp || id < 0) return; this.emoVer = (this.emoVer || 0) + 1;
    if (id === 0) { const f = () => { try { sp.state.setEmptyAnimation(1, 0.1); } catch (e) {} }; if (sp.ready) f(); else sp.queue.push(f); return; }
    E.spinePlay(sp, FACE[id], true, 1);
  },
  idleLater(sec) { const v = this.emoVer; E.after(sec, () => { if (this.emoVer === v) this.face(EM.Idle); }, this); },
  punchStreamer() { E.killOwner('punchStreamer'); this.streamerGo.sx = this.streamerGo.sy = 1; punchS(this.streamerGo, 0.05, 0.08, 0.5, 5, 'punchStreamer'); },
  // 2.2 GoLive
  async goLive() {
    const v = this.live; const cd = find(v, 'Countdown'); cd.setActive(true); const tx = cd.comp('Txt'); const step = this.cfg._countdownStep || 0.75;
    for (const n of ['3', '2', '1', str('livestream.countdown_go')]) { tx.text = n; cd.sx = cd.sy = 1.6; tw(cd, { s: 1 }, 0.3, 'outBack'); await wait(n.length > 1 ? step * 1.2 : step, this); }
    cd.setActive(false);
    const badge = find(this.hud, 'LiveBadge'); E.tween({ dur: 0.6, loops: -1, yoyo: true, owner: badge, ease: E.ease.inOutSine, update: (k) => { badge.sx = badge.sy = 1 + 0.1 * k; } });
    this.lv.viewers = E.randInt(this.cfg._startViewers.x, this.cfg._startViewers.y); this.setViewers();
    this.face(EM.Idle);
    E.spinePlay(this.streamer, 'hello', false, 0); E.spineAdd(this.streamer, 'idle', true, 0); this.punchStreamer();
    this.lv.live = true; this.chat.start('onBegin');
    this.liveLoop(); this.idleLoop(); this.donateLoop();
    if (this.trayBoxes.length) this.setBoxesInteractable(true); else this.endLive();
  },
  setViewers() { setText(find(this.hud, 'Viewers'), this.lv.viewers.toLocaleString('en-US').replace(/,/g, '.')); },
  liveLoop() { if (!this.lv.live) return; E.after(this.cfg._viewerTickInterval || 2.1, () => { if (!this.lv.live) return; this.lv.viewers += E.randInt(this.cfg._viewersPerTick.x, this.cfg._viewersPerTick.y); this.setViewers(); this.liveLoop(); }, this); },
  // IdleLoop / StreamerQuestionView: 5 s without touch -> "curious" on track 2 until the next touch
  idleLoop() {
    this.lastTouch = E.time || 0; this.asking = false; const sp = this.streamer;
    this.idleL = E.input.on((t) => { if (t === 'down') { this.lastTouch = E.time; if (this.asking) { this.asking = false; try { sp.state.setEmptyAnimation(2, 0); } catch (e) {} } } });
    const tick = () => { if (!this.lv.live) return; if (!this.asking && (E.time - this.lastTouch) >= (this.cfg._idleQuestionDelay || 5)) { this.asking = true; E.spinePlay(sp, 'curious', true, 2); } E.after(0.2, tick, this); };
    tick();
  },
  async donateLoop() {
    const c = this.cfg; if (!(c._donateMaxPerLive > 0)) return;
    await wait(c._donateFirstDelay || 3, this);
    for (let i = 0; i < c._donateMaxPerLive; i++) {
      while (this.lv.live && this.lv.busy) await wait(0.2, this); if (!this.lv.live) return;
      const amount = E.pick(c._donateRewards || [500]);
      this.donate.show(amount, c._donateDuration || 8, () => this.claimDonate(amount));
      while (this.donate.showing) await wait(0.2, this); if (!this.lv.live) return;
      await wait(rnd(c._donateInterval.x, c._donateInterval.y), this);
    }
  },
  claimDonate(amount) { if (!this.lv.live) return; this.donate.complete(); this.grantCoins(amount); this.face(EM.HeartEyes); this.idleLater(2); },
  grantCoins(n) {
    if (!(n > 0)) return; const from = this.lv.coins; this.lv.coins += n; G.addMoney(n);
    const coins = find(this.hud, 'Coins'); const t = coins.compInChildren('Txt');
    E.tween({ dur: 0.8, owner: 'hudCoins', ease: E.ease.outCubic, update: (v) => { t.text = String(Math.round(from + n * v)); } });
    E.killOwner('coinPunch'); coins.sx = coins.sy = 1; punchS(coins, 0.18, 0.18, 0.6, 6, 'coinPunch');
    const tg = t.go; const gain = E.newGO('CoinGain', coins, true); gain.rt = tg.rt.slice(); gain.rt[4] += 20; gain.sx = gain.sy = 0.5;
    gain.comps.push({ t: 'Txt', text: '+' + n, fs: t.fs, font: t.font, ha: t.ha, va: t.va, color: col(this.livestreamGainColor()), enabled: true, go: gain, ow: 0.2, oc: [1, 1, 1, 1] });
    tw(gain, { s: 1.25 }, 0.15, 'outBack').then(() => tw(gain, { s: 1 }, 0.1)); tw(gain, { y: gain.rt[5] - 70 }, 1.0, 'outQuad', 0, 'gy'); tw(gain, { a: 0 }, 0.4, 'outQuad', 0.7, 'ga').then(() => E.destroy(gain));
  },
  livestreamGainColor() { const h = this.hud.comp('NK.LivestreamHudView'); return (h && h.d && h.d._gainColor) || { r: 0.18, g: 0.63, b: 0.24, a: 1 }; },
  onBoxClicked(g) { if (this.lv.busy || this.lv.ended || !this.lv.live || g._opened) return; this.donate.closeBanner(false); this.openBox(g); },
  // 2.4 OpenBox
  async openBox(g) {
    this.lv.busy = true; this.setBoxesInteractable(false); g._opened = true;
    const d = D.roll(this.room, g._bag.chest); const art = g._art;
    if (!d) { img(g).sp = art.Opened; this.lv.busy = false; return; }
    const isNew = !D.owned(this.room, d.Id); const rarity = D.rarityOf(this.room, d.Id);
    this.face(EM.Happy); this.punchStreamer();
    const st = this.stage;
    await st.open(art, g);
    st.showHint(E.tr(str('livestream.hint_swipe')), true);
    await st.waitTear(this.cfg._tearDistance || 120);
    const dd = st.tearOff(); await wait(dd, this);
    st.showHint(E.tr(str('livestream.hint_tap')), false);
    const beats = this.cfg._tapBeats || 3;
    for (let b = 1; b <= beats; b++) { await st.waitTap(); st.beat(b, beats); this.face(BEAT_EMOTION[b - 1] ?? -1); }
    st.hideHint();
    await st.reveal(art, d, rarity, isNew, D.roomName(this.room));
    this.chat.burst(isNew ? CHAT[rarity] : 'openDuplicate', 3, true);
    if (isNew) { const sv = D.save(); (sv.owned[this.room] = sv.owned[this.room] || []).push(d.Id); G.save(); }
    this.lv.results.push({ id: d.Id, rarity, isNew });
    await wait(this.cfg._revealDismissDelay || 0.3, this);
    await st.waitTap();
    this.face(E.pick(EMOTION_TABLE[rarity][isNew ? 0 : 1]));
    if (isNew) { this.grantCoins((this.cfg._newDumplingRewards || [])[rarity] || 0); this.punchStreamer(); }
    img(g).sp = art.Opened;
    const slot = this.slots[d.Id];
    await st.flyTo(slot, isNew);
    if (slot) { this.paintSlot(slot, d, true); if (isNew) { E.killOwner(slot); slot.sx = slot.sy = 1; punchS(slot, 0.35, 0.35, 0.5, 6); } else shake(slot, 0.4, 12, 20, true); }
    this.idleLater(this.cfg._reactionTime || 2);
    this.lv.busy = false;
    if (this.trayBoxes.every((b) => b._opened)) { await wait(0.7, this); this.endLive(); } else this.setBoxesInteractable(true);
  },
  // 2.5 EndLive -> exp, popup with the multiplier sweep, claim -> level up (if any) -> Home
  endLive() {
    if (this.lv.ended) return; this.lv.ended = true; this.lv.live = false; this.chat.stop(); this.setBoxesInteractable(false); this.donate.hide();
    if (this.idleL) E.input.off(this.idleL); try { this.streamer.state.setEmptyAnimation(2, 0); } catch (e) {}
    try { // CaptureScreenshotAsync: the phone shows the live as it ended
      const src = E.canvas; const ar = 553 / 803; let w = src.width, h = src.height; if (w / h > ar) w = h * ar; else h = w / ar;
      const cv = document.createElement('canvas'); cv.width = Math.round(w / 2); cv.height = Math.round(h / 2);
      cv.getContext('2d').drawImage(src, (src.width - w) / 2, (src.height - h) / 2, w, h, 0, 0, cv.width, cv.height); this.shotCanvas = cv;
    } catch (e) { this.shotCanvas = null; }
    const sv = D.save(); const before = D.levelOf(sv.exp); sv.exp += EXP_PER_LIVE; sv.lives = (sv.lives || 0) + 1; G.save();
    const after = D.levelOf(sv.exp); this.newLevel = after > before ? after : 0;
    const pop = find(this.live, 'EndLivestreamPopup'); pop.setActive(true);
    const vg = pop.comp('NK.VerticalGradient'); const bgi = img(pop); if (vg && bgi) { const t = vg.d._top, b = vg.d._bottom; bgi.color = [(t.r + b.r) / 2, (t.g + b.g) / 2, (t.b + b.b) / 2, 1]; }
    const raw = find(pop, 'Screenshot') && find(pop, 'Screenshot').comp('Raw'); if (raw && this.shotCanvas) raw.canvas = this.shotCanvas;
    const cg = pop.comp('CG'); cg.alpha = 0; tw(pop, { a: 1 }, 0.25);
    const content = find(pop, 'Content'); content.sx = content.sy = 0.85; tw(content, { s: 1 }, 0.4, 'outBack');
    const title = find(pop, 'Title'); title.sx = title.sy = 0; tw(title, { s: 1 }, 0.45, 'outBack', 0.15);
    const ads = find(pop, 'AdsButton'); E.tween({ dur: 0.5, loops: -1, yoyo: true, owner: ads, ease: E.ease.inOutSine, update: (k) => { ads.sx = ads.sy = 1 + 0.06 * k; } });
    const reward = Math.round(this.cfg._completeLiveReward || 200);
    setText(find(pop, 'ClaimButton'), reward); const coinsT = find(pop, 'Coins').compInChildren('Txt'); coinsT.text = String(this.money());
    const mult = this.cfg._adsMultipliers || [2, 3, 4, 5, 4, 3, 2];
    ['x0', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6'].forEach((n, i) => { const l = find(pop, n); if (l) l.comp('Txt').text = 'x' + mult[i]; });
    const ptr = find(pop, 'Pointer'); const range = 355; let cur = mult[0];
    E.tween({ dur: this.cfg._multiplierSweepTime || 1, loops: -1, yoyo: true, owner: ptr, ease: E.ease.linear, update: (k) => {
      ptr.rt[4] = -range + 2 * range * k; cur = mult[Math.min(mult.length - 1, Math.round(k * (mult.length - 1)))]; setText(ads, 'x' + cur + ' coins');
    } });
    let done = false;
    const claim = async (m) => {
      if (done) return; done = true; E.killOwner(ptr); E.killOwner(ads);
      const from = this.money(); this.lv.coins += reward * m; G.addMoney(reward * m); const to = this.money();
      E.tween({ dur: 0.7, owner: coinsT.go, ease: E.ease.outCubic, update: (k) => { coinsT.text = String(Math.round(from + (to - from) * k)); } });
      const icon = find(find(pop, 'Coins'), 'Icon'); punchS(icon, 0.3, 0.3, 0.7, 6); vib(30);
      await wait(1.1, this);
      if (this.newLevel) this.showLevelUp(this.newLevel); else this.home();
    };
    G.onClick(ads, () => claim(cur)); // rewarded ad = granted at once
    G.onClick(find(pop, 'ClaimButton'), () => claim(1));
  },
  showLevelUp(level) { // CloseAfterClaim: the live modal hides, then LevelUp opens over a modal backdrop
    E.destroy(this.live); this.live = null;
    const bd = newImg('ModalBackdrop', this.go, null, 0, 0, [0, 0, 0, 0]); bd.rt = [0, 0, 1, 1, 0, 0, 0, 0, 0.5, 0.5]; tw(bd, { a: 0.75 }, 0.25);
    const v = this.open('LevelUpView', this.go);
    const lt = find(v, '[Text] Level'); if (lt) lt.comp('Txt').text = 'Level ' + level;
    const ach = find(v, '[Group] Achievement'); if (ach) ach.setActive(false);
    const panel = find(v, 'Panel'); panel.sx = panel.sy = 0.6; const cg = v.comp('CG'); if (cg) cg.alpha = 0; tw(v, { a: 1 }, 0.25); tw(panel, { s: 1 }, 0.4, 'outBack');
    vib(40);
    G.onClick(find(v, '[Button] Next'), () => { sfx('button_click'); this.home(); });
  },
});

// chat: bursts of a reveal category replace the "begin" chatter for a moment (PlayRevealChat), then OnBegin resumes
const LC = D.LiveChatFeed.prototype; const burst0 = LC.burst;
LC.burst = function (set, n, resume) { burst0.call(this, set, n); if (resume && this.timer) { this.stop(); const f = this.startSet || 'onBegin'; setTimeout(() => { if (!this.root.destroyed) this.start(f); }, n * 350 + 1200); } };
const start0 = LC.start; LC.start = function (set) { this.startSet = set; return start0.call(this, set); };
})();
