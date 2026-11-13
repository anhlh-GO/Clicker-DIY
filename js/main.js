'use strict';
(async () => {
  const boot = document.getElementById('boot');
  const cv = document.getElementById('c');
  E.initCanvas(cv);
  E.bindInput(cv);
  E.loadSave();
  const [sp, so, names, enums, mats, spine, audio, ps] = await Promise.all([
    E.fetchJSON('data/sprites.json'), E.fetchJSON('data/so.json'), E.fetchJSON('data/names.json'), E.fetchJSON('data/enums.json'),
    E.fetchJSON('data/mats.json'), E.fetchJSON('assets/spine/spine.json'), E.fetchJSON('assets/audio/audio.json'), E.fetchJSON('data/ps.json'),
  ]);
  E.D.ps = ps;
  try { const loc = await E.fetchJSON('data/localize.json'); E.langs = loc.langs; E._loc = loc.map; } catch (e) {}
  { const u = (E.save.user || {}); const nav = (navigator.language || 'en').toLowerCase();
    const guess = nav.startsWith('vi') ? 'Vietnamese' : nav.startsWith('fr') ? 'French' : nav.startsWith('de') ? 'German' : nav.startsWith('es') ? 'Spanish' : nav.startsWith('pt') ? 'Portuguese' : nav.startsWith('ru') ? 'Russian' : nav.startsWith('ja') ? 'Japanese' : nav.startsWith('ko') ? 'Korean' : 'English';
    E.setLanguage(u.CurrentLanguage && String(u.CurrentLanguage).trim() ? u.CurrentLanguage : guess); }
  E.D.spr = sp.spr; E.D.tex = sp.tex; E.D.so = so; E.D.names = names; E.D.enums = enums; E.D.mats = mats; E.D.spineMeta = spine; E.D.audio = audio;
  for (const [k, v] of Object.entries(enums['Framework.ESound'] || {})) E.ESound[v] = k;
  await Promise.all(['sharedassets0.assets', 'resources.assets', 'sharedassets1.assets', 'sharedassets3.assets', 'sharedassets4.assets', 'sharedassets5.assets', 'sharedassets6.assets'].map((f) => E.loadFile(f).catch(() => null)));
  try { await document.fonts.load('800 40px "Baloo Bhai 2"'); await document.fonts.load('700 40px Fredoka'); } catch (e) {}
  boot.style.display = 'none';
  // main loop (rAF with setInterval fallback for hidden tabs)
  let last = performance.now();
  const step = () => {
    const now = performance.now();
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1; if (dt <= 0) return;
    try { E.update(dt); E.updateScrolls(dt); E.render(); } catch (e) { console.error(e); }
  };
  let rafOk = false;
  const raf = () => { rafOk = true; step(); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  setInterval(() => { if (performance.now() - last > 120) step(); }, 50);
  const q = new URLSearchParams(location.search);
  if (E.Game && E.Game.boot && !q.get('scene')) E.Game.boot();
  else await E.loadScene(q.get('scene') || 'level0');
})();
