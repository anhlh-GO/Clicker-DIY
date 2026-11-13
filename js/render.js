'use strict';
(() => {
const M = E.M;
let cv, ctx, K = 1, base = [1, 0, 0, -1, 0, 0];
E.canvas = null;
E.initCanvas = (el) => {
  cv = el; ctx = el.getContext('2d'); E.canvas = el; E.ctx = ctx;
  const fit = () => {
    const ww = window.innerWidth, wh = window.innerHeight;
    let ar = ww / wh; ar = E.clamp(ar, 9 / 21, 9 / 16);
    E.W = 1080; E.H = Math.round(1080 / ar);
    let cssH = wh, cssW = cssH * (E.W / E.H);
    if (cssW > ww) { cssW = ww; cssH = cssW * (E.H / E.W); }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    K = cv.width / E.W;
    E.cssScale = cssW / E.W;
    base = [K, 0, 0, -K, cv.width / 2, cv.height / 2];
    E.base = base;
  };
  fit(); window.addEventListener('resize', fit);
};
const setT = (m) => { const t = M.mul(base, m); ctx.setTransform(t[0], t[1], t[2], t[3], t[4], t[5]); };
E.setT = setT;

// ------------------------------------------------------------------ camera
E.camMatrix = (cam) => {
  cam = cam || E.mainCam;
  const size = cam ? (cam.sz || 5) : 5;
  const p = cam ? cam.go.worldPos() : [0, 0];
  const s = E.H / (2 * size);
  return [s, 0, 0, s, -p[0] * s, -p[1] * s];
};
E.screenToWorld = (x, y, cam) => M.ap(M.inv(E.camMatrix(cam)), x, y);
E.worldToScreen = (x, y, cam) => M.ap(E.camMatrix(cam), x, y);
// client (css px) -> screen logical (center origin, y up)
E.clientToScreen = (cx, cy) => { const r = cv.getBoundingClientRect(); return [((cx - r.left) / r.width - 0.5) * E.W, (0.5 - (cy - r.top) / r.height) * E.H]; };

// ------------------------------------------------------------------ layout
const canvasScale = (g) => {
  const sc = g.comp('Scaler');
  if (!sc || sc.mode !== 1 || !sc.ref) return 1;
  const m = sc.match || 0;
  const lw = Math.log2(E.W / sc.ref[0]), lh = Math.log2(E.H / sc.ref[1]);
  if (sc.sm === 1) return Math.min(E.W / sc.ref[0], E.H / sc.ref[1]) > 0 ? (Math.max(E.W / sc.ref[0], E.H / sc.ref[1]) && Math.pow(2, Math.min(lw, lh))) : 1; // expand
  if (sc.sm === 2) return Math.pow(2, Math.max(lw, lh)); // shrink
  return Math.pow(2, (1 - m) * lw + m * lh);
};
E.canvasScale = canvasScale;
const rectOf = (g, P) => {
  const r = g.rt;
  const w = P.w * (r[2] - r[0]) + r[6], h = P.h * (r[3] - r[1]) + r[7];
  const lx = P.w * r[0] + P.w * (r[2] - r[0]) * r[8] + r[4] - P.w * P.pvx;
  const ly = P.h * r[1] + P.h * (r[3] - r[1]) * r[9] + r[5] - P.h * P.pvy;
  return [w, h, lx, ly];
};
// preferred sizes (very small subset of Unity's layout system)
const prefSize = (g, axis) => {
  const le = g.comp('LE');
  if (le) { const v = axis === 0 ? le.pw : le.ph; if (v != null && v >= 0) return v; }
  const lay = g.comp('Layout');
  if (lay && !lay.off && lay.k !== 'G') {
    const kids = g.children.filter((c) => c.activeSelf && c.rt && !(c.comp('LE') && c.comp('LE').ig));
    const pad = lay.pad || [0, 0, 0, 0];
    const horiz = lay.k === 'H';
    if ((axis === 0) === horiz) {
      let s = 0; for (const c of kids) s += childSize(c, axis, lay);
      return s + Math.max(0, kids.length - 1) * (lay.sp || 0) + (axis === 0 ? pad[0] + pad[1] : pad[2] + pad[3]);
    }
    let m = 0; for (const c of kids) m = Math.max(m, childSize(c, axis, lay));
    return m + (axis === 0 ? pad[0] + pad[1] : pad[2] + pad[3]);
  }
  if (lay && !lay.off && lay.k === 'G') {
    const kids = g.children.filter((c) => c.activeSelf && c.rt);
    const pad = lay.pad || [0, 0, 0, 0];
    const cols = lay.con === 1 ? lay.cc : lay.con === 2 ? Math.ceil(kids.length / lay.cc) : Math.max(1, Math.floor(((g.rect ? g.rect.w : 1000) - pad[0] - pad[1] + lay.gsp[0]) / (lay.cell[0] + lay.gsp[0])));
    const rows = Math.ceil(kids.length / Math.max(1, cols));
    if (axis === 0) return pad[0] + pad[1] + cols * lay.cell[0] + Math.max(0, cols - 1) * lay.gsp[0];
    return pad[2] + pad[3] + rows * lay.cell[1] + Math.max(0, rows - 1) * lay.gsp[1];
  }
  const t = g.comp('Txt');
  if (t && t.enabled) { const m = E.measureText(t, axis === 0 ? 1e6 : (g.rect ? g.rect.w : 1e6)); return axis === 0 ? m.w : m.h; }
  const im = g.comp('Img');
  if (im && im.sp) { const s = E.sprite(im.sp); if (s) return (axis === 0 ? s[10] : s[11]) * (100 / s[7]); }
  return axis === 0 ? g.rt[6] : g.rt[7];
};
const childSize = (c, axis, lay) => {
  const ctl = axis === 0 ? lay.cw : lay.ch;
  let v = ctl ? prefSize(c, axis) : (c.rect ? (axis === 0 ? c.rect.w : c.rect.h) : (axis === 0 ? c.rt[6] : c.rt[7]));
  const cs = axis === 0 ? lay.csw : lay.csh;
  if (cs) v *= axis === 0 ? c.sx : c.sy;
  return v;
};
const doLayout = (g, R) => {
  const lay = g.comp('Layout');
  if (!lay || lay.off) return;
  const kids = g.children.filter((c) => c.activeSelf && c.rt && !(c.comp('LE') && c.comp('LE').ig));
  if (lay.rev) kids.reverse();
  const pad = lay.pad || [0, 0, 0, 0];
  const al = lay.al || 0; const ax = al % 3, ay = Math.floor(al / 3); // 0 left/upper ..
  const x0 = -R.w * R.pvx, yTop = R.h * (1 - R.pvy);
  if (lay.k === 'G') {
    const cols = lay.con === 1 ? lay.cc : Math.max(1, Math.floor((R.w - pad[0] - pad[1] + lay.gsp[0]) / (lay.cell[0] + lay.gsp[0])));
    const rowsN = Math.ceil(kids.length / cols);
    const usedW = cols * lay.cell[0] + (cols - 1) * lay.gsp[0], usedH = rowsN * lay.cell[1] + (rowsN - 1) * lay.gsp[1];
    const offX = pad[0] + (R.w - pad[0] - pad[1] - usedW) * (ax / 2), offY = pad[2] + (R.h - pad[2] - pad[3] - usedH) * (ay / 2);
    kids.forEach((c, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const cx = x0 + offX + col * (lay.cell[0] + lay.gsp[0]), cyT = yTop - offY - row * (lay.cell[1] + lay.gsp[1]);
      c._lay = { w: lay.cell[0], h: lay.cell[1], x: cx + lay.cell[0] * c.rt[8], y: cyT - lay.cell[1] * (1 - c.rt[9]) };
    });
    return;
  }
  const horiz = lay.k === 'H';
  const sizes = kids.map((c) => [childSize(c, 0, lay), childSize(c, 1, lay)]);
  const innerW = R.w - pad[0] - pad[1], innerH = R.h - pad[2] - pad[3];
  const sp = lay.sp || 0;
  const total = sizes.reduce((s, z) => s + z[horiz ? 0 : 1], 0) + Math.max(0, kids.length - 1) * sp;
  const expand = horiz ? lay.ew : lay.eh;
  const ctrlMain = horiz ? lay.cw : lay.ch;
  let extra = (horiz ? innerW : innerH) - total;
  let perExtra = 0;
  if (expand && kids.length) { if (ctrlMain) { perExtra = Math.max(0, extra) / kids.length; extra = 0; } }
  let cur;
  if (expand && !ctrlMain && kids.length) { // spread positions
    cur = 0;
  } else cur = Math.max(0, extra) * ((horiz ? ax : ay) / 2);
  kids.forEach((c, i) => {
    let w = sizes[i][0], h = sizes[i][1];
    if (horiz) { w += perExtra; if (lay.ch) { h = lay.eh ? innerH : Math.min(h, innerH); } }
    else { h += perExtra; if (lay.cw) { w = lay.ew ? innerW : Math.min(w, innerW); } }
    let slot = horiz ? w : h;
    if (expand && !ctrlMain && kids.length) slot = ((horiz ? innerW : innerH) - Math.max(0, kids.length - 1) * sp) / kids.length;
    const sw = (lay.csw ? c.sx : 1), sh = (lay.csh ? c.sy : 1);
    let px, py;
    if (horiz) {
      const left = x0 + pad[0] + cur + (slot - w) / 2 * (expand && !ctrlMain ? 1 : 0);
      px = left + w * c.rt[8] * (1 / sw) * sw;
      const freeY = innerH - h;
      const topY = yTop - pad[2] - freeY * (ay / 2);
      py = topY - h * (1 - c.rt[9]);
    } else {
      const top = yTop - pad[2] - cur - (slot - h) / 2 * (expand && !ctrlMain ? 1 : 0);
      py = top - h * (1 - c.rt[9]);
      const freeX = innerW - w;
      px = x0 + pad[0] + freeX * (ax / 2) + w * c.rt[8];
    }
    c._lay = { w: horiz ? (lay.cw ? w / sw : null) : (lay.cw ? w / sw : null), h: horiz ? (lay.ch ? h / sh : null) : (lay.ch ? h / sh : null), x: px, y: py };
    cur += slot + sp;
  });
};
const fitSize = (g) => {
  const f = g.comp('Fit'); if (!f) return;
  if (f.h === 2) { const w = prefSize(g, 0); g.rt[6] = w - (g._PW || 0) * (g.rt[2] - g.rt[0]); }
  if (f.v === 2) { const h = prefSize(g, 1); g.rt[7] = h - (g._PH || 0) * (g.rt[3] - g.rt[1]); }
};
E.layoutNode = (g, pm, P, ui, cam) => {
  if (!g.activeSelf) return;
  const cvs = g.comp('Canvas');
  if (cvs && (cvs.mode === 0 || cvs.mode === 1) && !ui) {
    const s = canvasScale(g); g._cscale = s;
    g.rect = { w: E.W / s, h: E.H / s, pvx: 0.5, pvy: 0.5 };
    g.wm = [s, 0, 0, s, 0, 0]; g._ui = true; g._rootCanvas = true;
  } else if (g.rt && ui && P) {
    if (!g._vpFix && g.rt[6] === 0 && g.rt[7] === 0 && g.rt[0] === g.rt[2] && g.rt[1] === g.rt[3] && g.parent && g.parent.comp('Scroll')) { g._vpFix = 1; g.rt[0] = 0; g.rt[1] = 0; g.rt[2] = 1; g.rt[3] = 1; g.rt[4] = 0; g.rt[5] = 0; }
    g._PW = P.w; g._PH = P.h;
    fitSize(g);
    let w, h, lx, ly;
    if (g._lay) {
      const L = g._lay;
      const rr = rectOf(g, P);
      w = L.w != null ? L.w : rr[0]; h = L.h != null ? L.h : rr[1];
      if (L.w != null || L.h != null) { if (L.w != null) g.rt[6] = L.w - P.w * (g.rt[2] - g.rt[0]); if (L.h != null) g.rt[7] = L.h - P.h * (g.rt[3] - g.rt[1]); }
      lx = L.x; ly = L.y;
      if (L.w == null) w = rr[0]; if (L.h == null) h = rr[1];
      g._lay = null;
    } else { [w, h, lx, ly] = rectOf(g, P); }
    g._lx = lx; g._ly = ly; g._ui = true;
    g.rect = { w, h, pvx: g.rt[8], pvy: g.rt[9] };
    g.wm = M.mul(pm, M.trs(lx, ly, g.rot, g.sx, g.sy));
  } else if (cvs && cvs.mode === 2) {
    if (!g._wcFix && g.rt) { g._wcFix = 1; if (g.x === 0 && g.y === 0 && (g.rt[4] || g.rt[5])) { g.x = g.rt[4]; g.y = g.rt[5]; } }
    g.wm = M.mul(pm, M.trs(g.x, g.y, g.rot, g.sx, g.sy));
    const r = g.rt || [0, 0, 0, 0, 0, 0, 100, 100, 0.5, 0.5];
    g.rect = { w: r[6], h: r[7], pvx: r[8], pvy: r[9] }; g._ui = true; g._worldCanvas = true;
  } else {
    g._ui = false;
    g.wm = M.mul(pm, M.trs(g.x, g.y, g.rot, g.sx, g.sy));
    if (g.rt) { g.rect = { w: g.rt[6], h: g.rt[7], pvx: g.rt[8], pvy: g.rt[9] }; }
  }
  if (g._ui) doLayout(g, g.rect);
  const kidsUI = g._ui;
  for (const c of g.children) E.layoutNode(c, g.wm, kidsUI ? g.rect : null, kidsUI, cam);
};
E.layoutAll = () => {
  const cm = E.camMatrix();
  E._cm = cm;
  for (const r of E.roots) E.layoutNode(r, cm, null, false);
};
// force layout of one subtree (used by scripts needing positions immediately)
E.relayout = () => E.layoutAll();

// ------------------------------------------------------------------ drawing primitives
const colorStr = (c, a) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a == null ? c[3] : a})`;
E.colorStr = colorStr;
const isWhite = (c) => c[0] >= 0.999 && c[1] >= 0.999 && c[2] >= 0.999;
const srcOf = (s, col) => {
  if (!s.img._ok) return null;
  if (col && !isWhite(col)) { const t = E.tinted(s, col); return t ? [t, 0, 0, t.width, t.height] : null; }
  return [s.img, s[1], s[2], s[3], s[4]];
};
// draw sprite region at local rect (x,y bottom-left, w,h) in current transform (y-up)
const blit = (src, sx, sy, sw, sh, x, y, w, h) => {
  if (w === 0 || h === 0 || sw <= 0 || sh <= 0) return;
  ctx.save(); ctx.transform(1, 0, 0, -1, 0, 0);
  ctx.drawImage(src, sx, sy, sw, sh, x, -(y + h), w, h);
  ctx.restore();
};
E.blit = blit;
const nineSlice = (src, s, x, y, w, h, bs, fillCenter = true) => {
  // src=[img,sx,sy,sw,sh]; s sprite (for border); bs = border scale (px -> local)
  const [img, sx, sy, sw, sh] = src;
  const fx = sw / s[3], fy = sh / s[4];
  let [bl, bb, br, bt] = s[8];
  let L = bl * bs, B = bb * bs, R = br * bs, T = bt * bs;
  if (L + R > Math.abs(w)) { const k = Math.abs(w) / (L + R); L *= k; R *= k; }
  if (B + T > Math.abs(h)) { const k = Math.abs(h) / (B + T); B *= k; T *= k; }
  const sL = bl * fx, sR = br * fx, sB = bb * fy, sT = bt * fy;
  const cw = sw - sL - sR, ch = sh - sT - sB;
  const xs = [x, x + L, x + w - R, x + w], ys = [y, y + B, y + h - T, y + h];
  const sxs = [sx, sx + sL, sx + sw - sR, sx + sw]; // texture x
  const sys = [sy + sh, sy + sh - sB, sy + sT, sy]; // texture y (top-down) matching ys bottom-up
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (i === 1 && j === 1 && !fillCenter) continue;
    const dw = xs[i + 1] - xs[i], dh = ys[j + 1] - ys[j];
    const tsw = sxs[i + 1] - sxs[i], tsh = sys[j] - sys[j + 1];
    if (dw <= 0.01 || dh <= 0.01 || tsw <= 0 || tsh <= 0) continue;
    blit(img, sxs[i], sys[j + 1], tsw, tsh, xs[i], ys[j], dw + 0.4, dh + 0.4);
  }
};
E.nineSlice = nineSlice;

// SpriteRenderer
const drawSR = (c, alpha) => {
  const s = E.sprite(c.sp); if (!s) return;
  const a = c.color[3] * alpha; if (a <= 0.003) return;
  const src = srcOf(s, c.color); if (!src) return;
  const ppu = s[7];
  setT(c.go.wm);
  if (c.fx || c.fy) ctx.transform(c.fx ? -1 : 1, 0, 0, c.fy ? -1 : 1, 0, 0);
  ctx.globalAlpha = a;
  if (c.dm && c.sz) {
    const w = c.sz[0], h = c.sz[1];
    const x = -s[5] * w, y = -s[6] * h;
    if (s[8][0] || s[8][1] || s[8][2] || s[8][3]) nineSlice(src, s, x, y, w, h, 1 / ppu);
    else blit(src[0], src[1], src[2], src[3], src[4], x, y, w, h);
  } else {
    const x = (-s[5] * s[10] + s[12]) / ppu, y = (-s[6] * s[11] + s[13]) / ppu;
    blit(src[0], src[1], src[2], src[3], src[4], x, y, s[3] / ppu, s[4] / ppu);
  }
  ctx.globalAlpha = 1;
};
E.drawSRWith = drawSR;

// UI Image
const drawImg = (c, g, alpha) => {
  const R = g.rect; if (!R) return;
  const a = c.color[3] * alpha; if (a <= 0.003) return;
  let x = -R.w * R.pvx, y = -R.h * R.pvy, w = R.w, h = R.h;
  setT(g.wm);
  ctx.globalAlpha = a;
  const s = c.sp ? E.sprite(c.sp) : null;
  if (!s) {
    if (c.sp && !s) { ctx.globalAlpha = 1; return; }
    // the original project renders in linear colour space: a dark overlay blended there looks much lighter than
    // the same alpha blended in sRGB. effective sRGB alpha for black-ish overlays = 1 - (1-a)^(1/2.2)
    if (a < 1 && Math.max(c.color[0], c.color[1], c.color[2]) < 0.35) ctx.globalAlpha = 1 - Math.pow(1 - a, 1 / 2.2);
    ctx.fillStyle = colorStr(c.color, 1); ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; return;
  }
  const src = srcOf(s, c.color); if (!src) { ctx.globalAlpha = 1; return; }
  if (c.pa && c.it !== 1) { const ar = s[3] / s[4]; if (w / h > ar) { const nw = h * ar; x += (w - nw) * R.pvx; w = nw; } else { const nh = w / ar; y += (h - nh) * R.pvy; h = nh; } }
  const hasBorder = s[8][0] || s[8][1] || s[8][2] || s[8][3];
  if ((c.it === 1 || c.it === 2) && hasBorder) {
    nineSlice(src, s, x, y, w, h, (100 / s[7]) / (c.ppm || 1), !c.nfc);
  } else if (c.it === 3) {
    const fa = c.fa == null ? 1 : c.fa;
    if (fa <= 0) { ctx.globalAlpha = 1; return; }
    ctx.save();
    ctx.beginPath();
    if (c.fm === 0) { const fw = w * fa; if (c.fo === 1) ctx.rect(x + w - fw, y, fw, h); else ctx.rect(x, y, fw, h); }
    else if (c.fm === 1) { const fh = h * fa; if (c.fo === 1) ctx.rect(x, y + h - fh, w, fh); else ctx.rect(x, y, w, fh); }
    else {
      const cx = x + w / 2, cy = y + h / 2, rr = Math.hypot(w, h);
      // radial360: origin 0 bottom,1 right,2 top,3 left ; clockwise flag
      const startA = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][c.fo || 0];
      const sweep = Math.PI * 2 * fa * (c.fm === 2 ? 0.25 : c.fm === 3 ? 0.5 : 1);
      ctx.moveTo(cx, cy);
      if (c.fcw) ctx.arc(cx, cy, rr, startA, startA - sweep, true); else ctx.arc(cx, cy, rr, startA, startA + sweep, false);
      ctx.closePath();
    }
    ctx.clip();
    if (hasBorder && false) nineSlice(src, s, x, y, w, h, 100 / s[7]); else blit(src[0], src[1], src[2], src[3], src[4], x, y, w, h);
    ctx.restore();
  } else blit(src[0], src[1], src[2], src[3], src[4], x, y, w, h);
  ctx.globalAlpha = 1;
};
const drawRaw = (c, g, alpha) => {
  const R = g.rect; if (!R) return;
  const a = c.color[3] * alpha; if (a <= 0.003) return;
  setT(g.wm); ctx.globalAlpha = a;
  const x = -R.w * R.pvx, y = -R.h * R.pvy;
  if (c.canvas) { blit(c.canvas, 0, 0, c.canvas.width, c.canvas.height, x, y, R.w, R.h); ctx.globalAlpha = 1; return; }
  const t = c.tex && E.D.tex[c.tex];
  if (t) {
    const im = E.texImg(t[0]);
    if (im._ok) {
      const uv = c.uv || [0, 0, 1, 1];
      if (uv[2] === 1 && uv[3] === 1 && uv[0] === 0 && uv[1] === 0) blit(im, 0, 0, im.width, im.height, x, y, R.w, R.h);
      else { // tiled scroll
        const pat = ctx.createPattern(im, 'repeat');
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, R.w, R.h); ctx.clip();
        const sx = R.w / (im.width * uv[2]), sy = R.h / (im.height * uv[3]);
        ctx.transform(sx, 0, 0, -sy, x - uv[0] * im.width * sx, y + R.h + uv[1] * im.height * sy);
        ctx.fillStyle = pat; ctx.fillRect(uv[0] * im.width - 2, -uv[1] * im.height - 2, im.width * uv[2] + 4, im.height * uv[3] + 4);
        ctx.restore();
      }
    }
  } else if (!c.tex) { ctx.fillStyle = colorStr(c.color, 1); ctx.fillRect(x, y, R.w, R.h); }
  ctx.globalAlpha = 1;
};

// ------------------------------------------------------------------ text (TMP approximation)
const FONT = {
  'DVN-Fredoka-Bold SDF': ['Fredoka', 700], 'SignikaNegative-Brazil-Bold SDF': ['Signika Negative', 700], 'Nunito-Black SDF': ['Nunito', 900],
  'LilitaOne-Regular SDF': ['Lilita One', 400], 'BalooBhai2-ExtraBold SDF': ['Baloo Bhai 2', 800], 'LiberationSans SDF': ['Arial', 400],
};
const fontOf = (t) => { const n = t.font ? E.D.names[t.font] : null; return FONT[n] || ['Baloo Bhai 2', 800]; };
const parseRich = (s, baseCol) => {
  // returns list of runs {t, col, size(rel), b}
  const out = []; let col = null; let size = null; const stack = [];
  const re = /<(\/?)([a-zA-Z]+)(?:=([^>]*))?>/g; let last = 0; let m;
  s = String(s).replace(/<br\s*\/?>/gi, '\n');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: s.slice(last, m.index), col, size });
    last = re.lastIndex;
    const close = m[1] === '/', tag = m[2].toLowerCase(), val = m[3];
    if (tag === 'color') { if (close) col = stack.pop() || null; else { stack.push(col); let v = (val || '').replace(/"/g, ''); col = v; } }
    else if (tag === 'size') { if (close) size = null; else { const v = (val || '').replace(/"/g, ''); size = v.endsWith('%') ? parseFloat(v) / 100 : v.endsWith('em') ? parseFloat(v) : -parseFloat(v); } }
    else if (tag === 'sprite') out.push({ t: '', sprite: val, col, size });
  }
  if (last < s.length) out.push({ t: s.slice(last), col, size });
  return out;
};
const NAMED = { white: '#fff', black: '#000', red: '#f00', green: '#0f0', blue: '#00f', yellow: '#ff0', orange: '#ffa500', purple: '#a020f0' };
const cssCol = (v) => { if (!v) return null; if (NAMED[v]) return NAMED[v]; if (v[0] === '#') { if (v.length === 9) { const a = parseInt(v.slice(7, 9), 16) / 255; return `rgba(${parseInt(v.slice(1, 3), 16)},${parseInt(v.slice(3, 5), 16)},${parseInt(v.slice(5, 7), 16)},${a})`; } return v; } return v; };
const layoutText = (t, maxW, fs) => {
  const [fam, wt] = fontOf(t);
  const italic = t.st & 2 ? 'italic ' : '';
  const bold = t.st & 1 ? Math.max(wt, 800) : wt;
  ctx.font = `${italic}${bold} ${fs}px "${fam}"`;
  const cs = (t.cs || 0) * fs / 100;
  if ('letterSpacing' in ctx) ctx.letterSpacing = cs + 'px';
  let txt = t.text == null ? '' : String(t.text);
  if (t.st & 16) txt = txt.toUpperCase(); else if (t.st & 8) txt = txt.toLowerCase();
  const runs = parseRich(txt);
  // flatten into words with style
  const lines = [[]]; let lw = 0; const lineW = [0];
  const wrap = t.wrap === 1 || t.wrap === true;
  const pushTok = (tok, run) => {
    const f = run.size ? (run.size < 0 ? -run.size : fs * run.size) : fs;
    ctx.font = `${italic}${bold} ${f}px "${fam}"`;
    const w = ctx.measureText(tok).width;
    if (wrap && lw + w > maxW + 0.5 && lw > 0 && tok.trim()) {
      // trim trailing space
      lines.push([]); lineW.push(0); lw = 0;
      if (!tok.trim()) return;
    }
    lines[lines.length - 1].push({ tok, w, f, col: run.col });
    lw += w; lineW[lineW.length - 1] = lw;
  };
  for (const run of runs) {
    if (run.sprite != null) continue;
    const parts = run.t.split('\n');
    parts.forEach((p, i) => {
      if (i > 0) { lines.push([]); lineW.push(0); lw = 0; }
      const toks = p.split(/(\s+)/).filter((x) => x.length);
      for (const tk of toks) pushTok(tk, run);
    });
  }
  // trim trailing spaces width
  for (let i = 0; i < lines.length; i++) { const L = lines[i]; while (L.length && !L[L.length - 1].tok.trim()) { lineW[i] -= L[L.length - 1].w; L.pop(); } }
  const lh = fs * (1.25 + (t.ls || 0) / 100);
  return { lines, lineW, lh, fam, wt: bold, italic, w: Math.max(0, ...lineW), h: lines.length * lh };
};
E.measureText = (t, maxW) => { const L = layoutText(t, maxW, t.fs || 36); return { w: L.w + 2, h: L.h }; };
const matOf = (t) => (t.mat && E.D.mats[t.mat]) || null;
const drawTxt = (t, g, alpha, world) => {
  const R = g.rect; if (!R) return;
  const a = (t.color ? t.color[3] : 1) * alpha; if (a <= 0.003) return;
  let txt = t.text; if (txt == null || txt === '') return;
  const mg = t.mg || [0, 0, 0, 0]; // left top right bottom (x,y,z,w)
  const mgArr = Array.isArray(mg) ? mg : [mg.x || 0, mg.y || 0, mg.z || 0, mg.w || 0];
  const bw = R.w - mgArr[0] - mgArr[2], bh = R.h - mgArr[1] - mgArr[3];
  let fs = t.fs || 36;
  let L;
  if (t.auto) {
    let hi = t.fmax || fs, lo = t.fmin || 8; fs = hi;
    L = layoutText(t, bw, fs);
    if (L.w > bw + 0.5 || L.h > bh + 0.5) {
      for (let i = 0; i < 8; i++) { const mid = (hi + lo) / 2; const l2 = layoutText(t, bw, mid); if (l2.w > bw + 0.5 || l2.h > bh + 0.5) hi = mid; else lo = mid; }
      fs = lo; L = layoutText(t, bw, fs);
    }
  } else L = layoutText(t, bw, fs);
  if (t._fsOut !== fs) t._fsOut = fs;
  setT(g.wm);
  ctx.save(); ctx.transform(1, 0, 0, -1, 0, 0); // y-down local, origin at pivot
  const left = -R.w * R.pvx + mgArr[0], top = -(R.h * (1 - R.pvy)) + mgArr[1];
  const ha = t.ha || 2, va = t.va || 512;
  let y0;
  const totalH = L.h;
  if (va & 256) y0 = top; else if (va & 1024) y0 = top + bh - totalH; else y0 = top + (bh - totalH) / 2;
  const mat = matOf(t);
  let ow = 0, oc = null, dil = 0, und = null;
  if (mat) {
    const f = mat.f; ow = (f._OutlineWidth || 0) * (f._ScaleRatioA || 1); oc = mat.c._OutlineColor; dil = f._FaceDilate || 0;
    if (mat.kw && mat.kw.includes('UNDERLAY_ON')) und = { c: mat.c._UnderlayColor, x: f._UnderlayOffsetX || 0, y: f._UnderlayOffsetY || 0, d: f._UnderlayDilate || 0 };
  }
  if (t.ow) { ow = Math.max(ow, t.ow); if (t.oc) oc = t.oc; }
  const baseCol = t.color || [1, 1, 1, 1];
  const face = mat && mat.c._FaceColor ? mat.c._FaceColor : [1, 1, 1, 1];
  const fc = [baseCol[0] * face[0], baseCol[1] * face[1], baseCol[2] * face[2], 1];
  ctx.globalAlpha = a;
  ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  const grad = t.grad;
  for (let i = 0; i < L.lines.length; i++) {
    const line = L.lines[i]; const lwid = L.lineW[i];
    let x = left;
    if (ha & 2) x = left + (bw - lwid) / 2; else if (ha & 4) x = left + bw - lwid;
    const y = y0 + L.lh * (i + 0.5);
    for (const pass of [0, 1, 2]) {
      let xx = x;
      for (const tk of line) {
        ctx.font = `${L.italic}${L.wt} ${tk.f}px "${L.fam}"`;
        if ('letterSpacing' in ctx) ctx.letterSpacing = ((t.cs || 0) * tk.f / 100) + 'px';
        if (pass === 0 && und && und.c) { ctx.fillStyle = colorStr(und.c); const ox = und.x * tk.f * 0.08, oy = -und.y * tk.f * 0.08; ctx.lineWidth = tk.f * (ow * 0.42 + und.d * 0.1 + dil * 0.08); ctx.strokeStyle = colorStr(und.c); ctx.strokeText(tk.tok, xx + ox, y + oy); ctx.fillText(tk.tok, xx + ox, y + oy); }
        else if (pass === 1 && ow > 0 && oc) { ctx.strokeStyle = colorStr(oc, 1); ctx.lineWidth = tk.f * (ow * 0.42 + dil * 0.08); ctx.strokeText(tk.tok, xx, y); }
        else if (pass === 2) {
          let fill = tk.col ? cssCol(tk.col) : colorStr(fc, 1);
          if (grad && !tk.col && grad.topLeft) { const gr = ctx.createLinearGradient(0, y - tk.f / 2, 0, y + tk.f / 2); gr.addColorStop(0, colorStr([grad.topLeft[0] * baseCol[0], grad.topLeft[1] * baseCol[1], grad.topLeft[2] * baseCol[2], 1])); gr.addColorStop(1, colorStr([grad.bottomLeft[0] * baseCol[0], grad.bottomLeft[1] * baseCol[1], grad.bottomLeft[2] * baseCol[2], 1])); fill = gr; }
          ctx.fillStyle = fill;
          if (dil > 0.05) { ctx.strokeStyle = fill; ctx.lineWidth = tk.f * dil * 0.08; ctx.strokeText(tk.tok, xx, y); }
          ctx.fillText(tk.tok, xx, y);
        }
        xx += tk.w;
      }
    }
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore(); ctx.globalAlpha = 1;
};
E.drawTxt = drawTxt;

// ------------------------------------------------------------------ UI tree drawing
E._uiHits = [];
E._colliders = [];
let drawIdx = 0;
const cgAlpha = (g) => { const cg = g.comp('CG'); return cg ? cg.alpha : 1; };
const drawUI = (g, alpha, clips, batches, block, inter, isRoot) => {
  if (!g.activeSelf) return;
  const cvs = g.comp('Canvas');
  if (!isRoot && cvs && cvs.ov && cvs.enabled) { batches.push({ g, o: cvs.o || 0, alpha, clips, block, inter }); return; }
  if (cvs && !g._noGR) { const gr = g.comp('GR'); if (!gr || !gr.enabled || (g._worldCanvas && !cvs.cam && !g._forceGR)) block = false; else if (!(g.comp('CG') && (g.comp('CG').br === false || g.comp('CG').br === 0))) block = true; }
  const cg = g.comp('CG');
  if (cg) { alpha *= cg.alpha; if (cg.br === false || cg.br === 0) block = false; if (cg.ia === false || cg.ia === 0) inter = false; }
  if (alpha <= 0.002 && !g._forceHit) { return; }
  let clipNow = clips;
  const mask = g.comp('Mask'), rmask = g.comp('RMask');
  const graphics = [];
  for (const c of g.comps) {
    if (!c.enabled) continue;
    if (c.t === 'Img') { if (!(mask && !mask.off && !mask.show)) drawImg(c, g, alpha); graphics.push(c); }
    else if (c.t === 'Raw') { drawRaw(c, g, alpha); graphics.push(c); }
    else if (c.t === 'Txt') { drawTxt(c, g, alpha); graphics.push(c); }
    else if (c.t === 'Spine' && c.ui) { E.drawSpine(c, alpha); }
    else if (c.t === 'MB' && c.drawUI) { c.drawUI(ctx, alpha); if (c.hitUI) graphics.push(c); }
    else if (c.t === 'PS' && c.sys && E.particles) E.particles.draw(c, ctx);
  }
  // raycast targets
  if (block && Math.abs(g.wm[0] * g.wm[3] - g.wm[1] * g.wm[2]) > 1e-9) for (const c of graphics) if (!c.nr && g.rect) E._uiHits.push({ g, c, im: M.inv(g.wm), rect: g.rect, clips, inter, idx: drawIdx++ });
  if ((mask && !mask.off) || (rmask && !rmask.off)) {
    clipNow = clips.concat([{ im: M.inv(g.wm), rect: g.rect, wm: g.wm }]);
    ctx.save(); setT(g.wm); ctx.beginPath(); const R = g.rect; ctx.rect(-R.w * R.pvx, -R.h * R.pvy, R.w, R.h); ctx.clip();
    for (const ch of g.children) drawUI(ch, alpha, clipNow, batches, block, inter, false);
    ctx.restore();
    return;
  }
  for (const ch of g.children) drawUI(ch, alpha, clipNow, batches, block, inter, false);
};
const drawCanvasBatch = (b) => {
  const pend = [];
  ctx.save();
  if (b.clips && b.clips.length) for (const c of b.clips) { setT(c.wm); ctx.beginPath(); const R = c.rect; ctx.rect(-R.w * R.pvx, -R.h * R.pvy, R.w, R.h); ctx.clip(); }
  drawUI(b.g, b.alpha, b.clips || [], pend, b.block, b.inter, true);
  ctx.restore();
  return pend;
};
const drawCanvases = (list) => {
  // list of batches; nested override canvases are sorted globally by order
  let queue = list.slice().sort((a, b) => a.o - b.o || a.seq - b.seq);
  let seq = 0;
  while (queue.length) {
    const b = queue.shift();
    const pend = drawCanvasBatch(b);
    if (pend.length) { for (const p of pend) { p.seq = ++seq + 1e6; p.o = p.o; } queue = queue.concat(pend).sort((x, y) => x.o - y.o || (x.seq || 0) - (y.seq || 0)); }
  }
};

// ------------------------------------------------------------------ world drawing with sorting groups
const collectWorld = (g, list, masks, alpha) => {
  if (!g.activeSelf) return;
  const sg = g.comp('SG');
  const cvs = g.comp('Canvas');
  if (cvs && cvs.mode === 2) { list.push({ kind: 'canvas', g, o: cvs.o || 0, z: g.wm ? 0 : 0, idx: drawIdx++, alpha }); return; }
  let target = list, tmasks = masks;
  if (sg && sg.enabled && !sg.off) {
    const grp = { kind: 'group', g, o: sg.o || 0, z: g.worldZ(), idx: drawIdx++, items: [], masks: [] };
    list.push(grp); target = grp.items; tmasks = grp.masks;
  }
  for (const c of g.comps) {
    if (!c.enabled) continue;
    if (c.t === 'SR' && c.sp) target.push({ kind: 'sr', c, o: c.o || 0, z: g.worldZ(), idx: drawIdx++, masks: tmasks, alpha });
    else if (c.t === 'SM' && c.sp) { tmasks.push(c); masks !== tmasks && masks.push; }
    else if (c.t === 'Spine' && !c.ui) { const mr = g.comp('MR'); target.push({ kind: 'spine', c, o: mr ? mr.o : 0, z: g.worldZ(), idx: drawIdx++, alpha }); }
    else if (c.t === 'Txt' && c.world) { const mr = g.comp('MR'); target.push({ kind: 'wtxt', c, o: mr ? mr.o : (c.o || 0), z: g.worldZ(), idx: drawIdx++, alpha }); }
    else if (c.t === 'MB' && c.drawWorld) target.push({ kind: 'custom', c, o: c.sortOrder || 0, z: g.worldZ(), idx: drawIdx++, alpha });
    else if ((c.t === 'Box' || c.t === 'Circle' || c.t === 'Poly')) E._colliders.push({ c, g, idx: drawIdx });
    else if (c.t === 'PSR' && E.particles) { const ps = g.comp('PS'); if (ps && ps.sys) target.push({ kind: 'ps', c: ps, o: c.o || 0, z: g.worldZ(), idx: drawIdx++, alpha }); }
  }
  for (const ch of g.children) collectWorld(ch, target, tmasks, alpha);
};
const sortItems = (a) => a.sort((x, y) => x.o - y.o || y.z - x.z || x.idx - y.idx);
let maskCanvas = null, maskCtx = null;
const drawMaskedSR = (it) => {
  const c = it.c; const masks = (it.masks || []).filter((m) => m.enabled && m.go.activeInHierarchy);
  if (!masks.length) { if (c.mi === 1) return; drawSR(c, it.alpha); return; }
  if (!maskCanvas) { maskCanvas = document.createElement('canvas'); maskCtx = maskCanvas.getContext('2d'); }
  if (maskCanvas.width !== cv.width || maskCanvas.height !== cv.height) { maskCanvas.width = cv.width; maskCanvas.height = cv.height; }
  const main = ctx;
  ctx = maskCtx; E.ctx = ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  drawSR(c, it.alpha);
  ctx.globalCompositeOperation = c.mi === 1 ? 'destination-in' : 'destination-out';
  // union of masks: draw masks to a second layer then composite
  if (!E._m2) { E._m2 = document.createElement('canvas'); E._m2c = E._m2.getContext('2d'); }
  const m2 = E._m2, m2c = E._m2c; if (m2.width !== cv.width || m2.height !== cv.height) { m2.width = cv.width; m2.height = cv.height; }
  m2c.setTransform(1, 0, 0, 1, 0, 0); m2c.clearRect(0, 0, cv.width, cv.height);
  ctx = m2c; E.ctx = ctx;
  for (const m of masks) drawSR({ sp: m.sp, color: [1, 1, 1, 1], go: m.go }, 1);
  ctx = maskCtx; E.ctx = ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(m2, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx = main; E.ctx = ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(maskCanvas, 0, 0);
};
const drawItems = (items) => {
  sortItems(items);
  for (const it of items) {
    if (it.kind === 'group') drawItems(it.items);
    else if (it.kind === 'sr') { if (it.c.mi) drawMaskedSR(it); else drawSR(it.c, it.alpha); }
    else if (it.kind === 'spine') E.drawSpine(it.c, it.alpha);
    else if (it.kind === 'wtxt') drawTxt(it.c, it.c.go, it.alpha, true);
    else if (it.kind === 'canvas') { const pend = []; drawUI(it.g, it.alpha, [], pend, true, true, true); if (pend.length) drawCanvases(pend); }
    else if (it.kind === 'custom') it.c.drawWorld(ctx, it.alpha);
    else if (it.kind === 'ps') E.particles.draw(it.c, ctx);
  }
};

// ------------------------------------------------------------------ frame
E.render = () => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const cam = E.mainCam;
  const bg = cam && cam.bg ? cam.bg : [0, 0, 0, 1];
  ctx.fillStyle = colorStr(bg, 1); ctx.fillRect(0, 0, cv.width, cv.height);
  E.layoutAll();
  E._uiHits = []; E._colliders = []; drawIdx = 0;
  // world
  const world = []; const gm = [];
  const screenCanvases = [];
  for (const r of E.roots) {
    if (!r.activeSelf) continue;
    const cvs = r.comp('Canvas');
    if (cvs && (cvs.mode === 0 || cvs.mode === 1)) { if (cvs.enabled) screenCanvases.push({ g: r, o: (cvs.mode === 0 ? 100000 : 0) + (cvs.o || 0), alpha: 1, clips: [], block: true, inter: true, seq: screenCanvases.length }); continue; }
    collectWorld(r, world, gm, 1);
  }
  // screen canvases nested under non-canvas roots (e.g. GameHandle/...): find them
  const findNested = (g) => { for (const c of g.children) { if (!c.activeSelf) continue; const cv2 = c.comp('Canvas'); if (cv2 && (cv2.mode === 0 || cv2.mode === 1) && !c._ui) { screenCanvases.push({ g: c, o: (cv2.mode === 0 ? 100000 : 0) + (cv2.o || 0), alpha: 1, clips: [], block: true, inter: true, seq: screenCanvases.length }); } else if (!c.comp('Canvas')) findNested(c); } };
  for (const r of E.roots) if (r.activeSelf && !r.comp('Canvas')) findNested(r);
  drawItems(world);
  E._worldHitEnd = E._uiHits.length;
  drawCanvases(screenCanvases);
  if (E.onPostRender) E.onPostRender(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
};
// root canvases nested inside world objects must be laid out as root canvases: patch layoutNode for them
const origLayout = E.layoutNode;
E.layoutNode = (g, pm, P, ui, cam) => {
  const cvs = g.comp('Canvas');
  if (cvs && (cvs.mode === 0 || cvs.mode === 1) && !ui) return origLayout(g, pm, null, false, cam);
  return origLayout(g, pm, P, ui, cam);
};

// ------------------------------------------------------------------ spine
E.spineCache = {};
E.spineLoad = (name) => {
  if (E.spineCache[name]) return E.spineCache[name];
  const p = (async () => {
    const [atlasText, json] = await Promise.all([fetch('assets/spine/' + name + '.atlas').then((r) => r.text()), fetch('assets/spine/' + name + '.json').then((r) => r.text())]);
    const pages = atlasText.split('\n').map((s) => s.trim()).filter((s) => /\.(webp|png)$/.test(s));
    const imgs = {};
    await Promise.all(pages.map((pg) => new Promise((res) => { const im = new Image(); im.onload = () => { imgs[pg] = im; res(); }; im.onerror = res; im.src = 'assets/spine/' + pg; })));
    const atlas = new spine.TextureAtlas(atlasText);
    glInit();
    for (const page of atlas.pages) page.setTexture(new spine.GLTexture(GLS.ctx, imgs[page.name], false));
    const sj = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas));
    sj.scale = 1;
    const data = sj.readSkeletonData(json);
    let mesh = false;
    for (const sk of data.skins) for (const ent of sk.attachments) if (ent) for (const k in ent) if (ent[k] instanceof spine.MeshAttachment) mesh = true;
    data._mesh = mesh;
    return data;
  })();
  E.spineCache[name] = p;
  return p;
};
E.spineMetaOf = (key) => E.D.spineMeta[key];
E.spineInit = (c) => {
  const meta = E.D.spineMeta[c.data];
  if (!meta) return;
  c.meta = meta;
  c.ready = false; c.queue = [];
  c.timeScale = c.ts == null ? 1 : c.ts;
  c.color = c.col ? c.col.slice() : [1, 1, 1, 1];
  E.spineLoad(meta.name).then((data) => {
    c.data_ = data;
    c.skeleton = new spine.Skeleton(data);
    if (c.skin) { try { c.skeleton.setSkinByName(c.skin); } catch (e) {} }
    c.skeleton.setToSetupPose();
    const sd = new spine.AnimationStateData(data); sd.defaultMix = meta.mix || 0.2;
    c.state = new spine.AnimationState(sd);
    c.ready = true;
    if (c.anim && !c._played) { try { c.state.setAnimation(0, c.anim, !!c.loop); } catch (e) {} }
    for (const q of c.queue) q();
    c.queue = [];
    c.skeleton.updateWorldTransform(spine.Physics ? spine.Physics.update : undefined);
  });
};
E.spineEnable = () => {};
E.spinePlay = (c, anim, loop, track = 0, onDone) => {
  const f = () => {
    if (!c.data_ || !c.data_.findAnimation(anim)) { if (onDone) onDone(); return null; }
    c._played = true;
    const e = c.state.setAnimation(track, anim, !!loop);
    if (onDone) { e.listener = { complete: () => { if (!loop) onDone(); } }; }
    return e;
  };
  if (!c || !c.meta) { if (onDone) onDone(); return; }
  if (c.ready) return f(); c.queue.push(f);
};
E.spineAdd = (c, anim, loop, delay = 0, track = 0) => { const f = () => { if (c.data_.findAnimation(anim)) c.state.addAnimation(track, anim, !!loop, delay); }; if (c.ready) f(); else c.queue.push(f); };
E.spineSkin = (c, skin) => { const f = () => { try { c.skeleton.setSkinByName(skin); c.skeleton.setSlotsToSetupPose(); c._dirty = true; } catch (e) {} }; if (c.ready) f(); else c.queue.push(f); };
E.spineAnims = (c) => (c.data_ ? c.data_.animations.map((a) => a.name) : []);
E.spineUpdate = (dt) => {
  // updated lazily during draw
  E._spineDt = dt;
};
// Spine is drawn with WebGL (spine-webgl) into one shared offscreen canvas, then blitted into the 2D canvas.
// (spine-canvas' triangle renderer clips every mesh triangle and was ~10 ms/frame for the character alone.)
const GLS = (E.spineGL = { cv: null, ctx: null, r: null, W: 0, H: 0, off: new spine.Vector2(), size: new spine.Vector2(), tmp: [] });
const glInit = () => {
  if (GLS.r) return GLS;
  GLS.cv = document.createElement('canvas'); GLS.cv.width = GLS.W = 512; GLS.cv.height = GLS.H = 512;
  GLS.ctx = new spine.ManagedWebGLRenderingContext(GLS.cv, { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
  GLS.r = new spine.SceneRenderer(GLS.cv, GLS.ctx, false);
  return GLS;
};
const glSize = (w, h) => {
  // grow-only, power-of-two-ish to avoid frequent reallocations
  let W = GLS.W, H = GLS.H;
  while (W < w) W *= 2; while (H < h) H *= 2;
  if (W !== GLS.W || H !== GLS.H) { GLS.cv.width = GLS.W = Math.min(W, 4096); GLS.cv.height = GLS.H = Math.min(H, 4096); }
};
E.spineTick = (c) => {
  if (c._lastFrame === E.frame) return;
  c._lastFrame = E.frame;
  c.state.update((E._spineDt || 0) * c.timeScale);
  c.state.apply(c.skeleton);
  c.skeleton.updateWorldTransform(spine.Physics ? spine.Physics.update : undefined);
};
// draw skeleton of spine component c with full device-space matrix dm (skeleton units -> device px, y up) into ctx2d
E.spineBlit = (ctx2d, dm, c, alpha) => {
  if (!c.ready || !c.skeleton) return;
  glInit();
  const sk = c.skeleton;
  sk.x = 0; sk.y = 0; sk.scaleY = 1; sk.scaleX = 1;
  sk.color.a = 1;
  sk.getBounds(GLS.off, GLS.size, GLS.tmp);
  let bx = GLS.off.x, by = GLS.off.y, bw = GLS.size.x, bh = GLS.size.y;
  if (!isFinite(bx) || bw <= 0 || bh <= 0) return;
  const pad = 2; // skeleton units
  bx -= pad; by -= pad; bw += pad * 2; bh += pad * 2;
  let k = Math.max(Math.hypot(dm[0], dm[1]), Math.hypot(dm[2], dm[3])); // device px per skeleton unit
  const maxPx = 2048;
  if (bw * k > maxPx) k = maxPx / bw; if (bh * k > maxPx) k = maxPx / bh;
  const pw = Math.max(1, Math.ceil(bw * k)), ph = Math.max(1, Math.ceil(bh * k));
  glSize(pw, ph);
  const gl = GLS.ctx.gl;
  gl.viewport(0, 0, pw, ph);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  const cam = GLS.r.camera;
  cam.viewportWidth = pw / k; cam.viewportHeight = ph / k; cam.zoom = 1;
  cam.position.set(bx + (pw / k) / 2, by + (ph / k) / 2, 0);
  GLS.r.begin();
  GLS.r.drawSkeleton(sk, false);
  GLS.r.end();
  // blit: GL canvas region (0, H-ph, pw, ph) shows skeleton rect [bx, bx+pw/k] x [by, by+ph/k] (top row = max y)
  let src = GLS.cv, sx = 0, sy = GLS.H - ph;
  if (c._wantCache) { // keep a bitmap of a skeleton that is not animating
    const cc = c._cache || (c._cache = { cv: document.createElement('canvas') });
    cc.cv.width = pw; cc.cv.height = ph;
    cc.cv.getContext('2d').drawImage(GLS.cv, 0, GLS.H - ph, pw, ph, 0, 0, pw, ph);
    cc.k = k; cc.bx = bx; cc.by = by; cc.pw = pw; cc.ph = ph; cc.skin = sk.skin ? sk.skin.name : ''; cc.ok = true;
    src = cc.cv; sx = 0; sy = 0;
  }
  ctx2d.save();
  ctx2d.setTransform(dm[0], dm[1], dm[2], dm[3], dm[4], dm[5]);
  ctx2d.transform(1, 0, 0, -1, 0, 0);
  ctx2d.globalAlpha = alpha;
  ctx2d.drawImage(src, sx, sy, pw, ph, bx, -(by + ph / k), pw / k, ph / k);
  ctx2d.restore();
};
const spineStatic = (c) => { const t = c.state.tracks; for (let i = 0; i < t.length; i++) if (t[i]) return false; return true; };
const drawCached = (ctx2d, dm, c, alpha) => {
  const cc = c._cache; if (!cc || !cc.ok) return false;
  const k = Math.max(Math.hypot(dm[0], dm[1]), Math.hypot(dm[2], dm[3]));
  if (Math.abs(k - cc.k) / cc.k > 0.15 || (c.skeleton.skin ? c.skeleton.skin.name : '') !== cc.skin) return false;
  ctx2d.save();
  ctx2d.setTransform(dm[0], dm[1], dm[2], dm[3], dm[4], dm[5]);
  ctx2d.transform(1, 0, 0, -1, 0, 0);
  ctx2d.globalAlpha = alpha;
  ctx2d.drawImage(cc.cv, 0, 0, cc.pw, cc.ph, cc.bx, -(cc.by + cc.ph / cc.k), cc.pw / cc.k, cc.ph / cc.k);
  ctx2d.restore();
  return true;
};
E.spineInvalidate = (c) => { if (c && c._cache) c._cache.ok = false; };
E.drawSpine = (c, alpha) => {
  if (!c.ready) return;
  if (!(c._cache && c._cache.ok && !c._dirty && spineStatic(c))) E.spineTick(c);
  const sc = c.ui ? 100 * (c.meta.scale || 0.01) : (c.meta.scale || 0.01);
  const m = M.mul(base, M.mul(c.go.wm, [sc * (c.fx ? -1 : 1), 0, 0, sc * (c.fy ? -1 : 1), 0, 0]));
  const a = (c.color ? c.color[3] : 1) * alpha;
  if (a <= 0.003) return;
  const st = spineStatic(c);
  if (st && !c._dirty && drawCached(ctx, m, c, a)) return;
  c._wantCache = st; c._dirty = false;
  E.spineBlit(ctx, m, c, a);
  c._wantCache = false;
};
})();
