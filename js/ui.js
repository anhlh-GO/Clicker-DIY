'use strict';
// Meta systems + popups of the Home scene: daily login, daily tasks, online (play-time) rewards, lucky wheel,
// profile / rename / settings / language. Also the shared data services used by home.js (decor data, profile,
// GameSession facade, keycap-decor unlocks) because this file loads before home.js.
(() => {
const G = E.Game, S = E.scripts;
const goOf = (r) => G.goOf(r);
const act = (r, b) => { const g = goOf(r); if (g) g.setActive(!!b); };
const setTxt = (r, s) => { const t = E.txtOf(r); if (t) t.text = String(s); };
const imgOf = (r) => (!r ? null : r.t === 'Img' ? r : goOf(r) ? goOf(r).comp('Img') : null);
const setSp = (r, sp) => { const i = imgOf(r); if (i && sp) i.sp = sp; };
const inter = (r, b) => { const bt = G.btn(r); if (bt) bt.interactable = !!b; };
const user = () => G.data().user;
const vibOn = () => user().vibration !== false;
const vibrate = (ms) => { if (vibOn()) E.vibrate(ms); };
const haptic = () => vibrate(15);
const pad2 = (n) => (n < 10 ? '0' : '') + n;
const dayKey = (d = new Date()) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const yesterdayKey = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };
G.dayKey = dayKey;
const popIn = (g, dur, owner, done) => { if (!g) { if (done) done(); return; } E.killOwner(g); g.sx = g.sy = 0; E.scaleTo(g, 1, dur, { ease: E.ease.outBack, owner: g, done }); };
const weighted = (list, wKey) => { const tot = list.reduce((s, x) => s + x[wKey], 0); let r = Math.random() * tot; for (const x of list) { if (r < x[wKey]) return x; r -= x[wKey]; } return list[list.length - 1]; };
// screen-space move of a UI object onto another UI object (anchored position delta)
const uiMoveOnto = (g, target, dur, o = {}) => {
  if (!g || !target || !g.wm || !target.wm || !g.parent || !g.parent.wm) return null;
  const s = Math.hypot(g.parent.wm[0], g.parent.wm[1]) || 1;
  const tx = g.rt[4] + (target.wm[4] - g.wm[4]) / s, ty = g.rt[5] + (target.wm[5] - g.wm[5]) * (g.parent.wm[3] < 0 ? -1 : 1) / s;
  return E.moveTo(g, tx, ty, dur, o);
};
G.uiMoveOnto = uiMoveOnto;

// ---------------------------------------------------------------- scene preload composition helper
// several files may assign E.scenePreload.levelN; make every assignment additive.
E.composePreload = (level) => {
  if (E.scenePreload['_c_' + level]) return;
  const fns = []; const prev = E.scenePreload[level]; if (prev) fns.push(prev);
  Object.defineProperty(E.scenePreload, level, {
    configurable: true, enumerable: true,
    get: () => () => { if (E._pl) return new Set(); E._pl = true; const out = new Set(); try { for (const f of fns) { try { const r = f(); if (r) for (const k of r) out.add(k); } catch (e) { console.error(e); } } } finally { E._pl = false; } return out; },
    set: (f) => { if (typeof f === 'function') fns.push(f); },
  });
  E.scenePreload['_c_' + level] = true;
};
E.composePreload('level1');

// ---------------------------------------------------------------- keycap decor helpers (DataUser.UnlockClickerDecor)
const KEYCAP_CFG = 'sharedassets0.assets:14398';
const keycapLists = () => { const c = E.so(KEYCAP_CFG) || {}; return ['_dataList', '_onTopDataList', '_replaceDataList', '_replaceButOnBaseDataList'].map((k) => c[k] || []); };
const keycapById = (id) => { for (const l of keycapLists()) { const f = l.find((x) => x.Id === id); if (f) return f; } return null; };
const hasKeycap = (id) => (user().UnlockedClickerDecor || []).includes(id);
const unlockKeycap = (id) => { const u = user(); if (!u.UnlockedClickerDecor) u.UnlockedClickerDecor = []; if (!u.UnlockedClickerDecor.includes(id)) { u.UnlockedClickerDecor.push(id); G.save(); } };
// DecorKeycapConfig.GetRandomDataLockedCommon/Rare (retry up to 11 times until a not-owned one)
const randomLockedKeycap = (rarity) => {
  const pool = (keycapLists()[0] || []).filter((x) => x.Rarity === rarity);
  if (!pool.length) return null;
  for (let i = 0; i < 11; i++) { const k = E.pick(pool); if (!hasKeycap(k.Id)) return k; }
  return null;
};
G.meta = { keycapById, hasKeycap, unlockKeycap, randomLockedKeycap, dayKey };

// ---------------------------------------------------------------- Decor data (Decor.DataDecor)
const DECOR_ASSET = 'sharedassets0.assets:14403';
let _cats = null;
const decorCats = () => { if (!_cats) { const a = E.so(DECOR_ASSET); _cats = a ? a.CategoryAssets.map((k) => E.so(k)) : []; } return _cats; };
const _decorChecked = new WeakSet();
const decorData = () => {
  const s = G.data();
  if (!s.decor || !Array.isArray(s.decor.CategoryDataList)) s.decor = { CategoryDataList: [] };
  if (!_decorChecked.has(s.decor)) {
    const L = s.decor.CategoryDataList;
    decorCats().forEach((c, i) => {
      let e = L.find((x) => x.ID === i);
      if (!e) { e = { ID: i, SelectedItemID: 0, UnlockedItems: [] }; L.push(e); }
      for (const o of c.OptionDatas) if (o.UnlockType === 0 && !e.UnlockedItems.includes(o.ID)) e.UnlockedItems.push(o.ID);
    });
    _decorChecked.add(s.decor);
  }
  return s.decor;
};
G.decor = {
  cats: decorCats,
  entry(i) { return decorData().CategoryDataList.find((x) => x.ID === i); },
  selected(i) { const e = this.entry(i); return e ? e.SelectedItemID : 0; },
  setSelected(i, id) { const e = this.entry(i); if (e) { e.SelectedItemID = id; G.save(); } },
  owned(i, id) { const e = this.entry(i); return !!e && e.UnlockedItems.includes(id); },
  unlock(i, id) { const e = this.entry(i); if (e && !e.UnlockedItems.includes(id)) { e.UnlockedItems.push(id); G.save(); } },
  indexByName(n) { return decorCats().findIndex((c) => c.Name === n); },
  option(i, id) { const c = decorCats()[i]; return c ? c.OptionDatas.find((o) => o.ID === id) || c.OptionDatas[0] : null; },
  // a Coin option not owned and affordable
  canAnyBuy(i) { const c = decorCats()[i]; return !!c && c.OptionDatas.some((o) => o.UnlockType === 2 && !this.owned(i, o.ID) && G.money() >= o.Price); },
};

// ---------------------------------------------------------------- Profile (Profile.ProfileManager, PlayerPrefs profile_data)
G.profile = {
  listeners: new Set(),
  d() { const s = G.data(); if (!s.profile) s.profile = { Name: 'You', Level: 1, ExperiencePoint: 0, AvatarId: 0, IsLevelUp: false }; return s.profile; },
  notify() { for (const f of this.listeners) try { f(); } catch (e) { console.error(e); } },
  setName(n) { n = (n || '').trim(); this.d().Name = n || 'You'; G.save(); this.notify(); },
  setAvatar(id) { this.d().AvatarId = id; G.save(); this.notify(); },
  requirement() { return this.d().Level * 25; }, // Level * GameConfig.XpToNextLevel
  obtainExperiencePoint() { const p = this.d(); p.ExperiencePoint += 50; const up = p.ExperiencePoint >= this.requirement(); if (up) { p.Level++; p.IsLevelUp = true; } G.save(); this.notify(); return up; },
};
G.profile.ObtainExperiencePoint = () => G.profile.obtainExperiencePoint();

// ---------------------------------------------------------------- GameSession facade (instance = level0 Master/GameSession, see home.js)
if (!G.session) G.session = {
  inst: null, BackFromGameMode: 0, ScoopOrderId: -1, OrderAvatar: null, CanShowSpecial: true, IsPlayAGame: false, InterShownCount: 0,
  get Avatar() { const o = G.decor.option(0, G.decor.selected(0)); return o ? o.IconDefault : null; },
  get CharacterContainer() { return this.inst ? this.inst.container : null; },
  get MainCharacter() { return this.inst ? this.inst.main : null; },
  setActiveCharacter(b) { if (this.inst) this.inst.setActiveCharacter(b); },
  SetActiveCharacter(b) { this.setActiveCharacter(b); },
  genCharacter() { if (this.inst) this.inst.genCharacter(); },
};

// ---------------------------------------------------------------- Daily tasks (DailyTask.DailyTaskController + DataDailyTask)
const TASK_SO = 'sharedassets0.assets:14498';
const taskSO = () => E.so(TASK_SO);
const taskCfg = (id) => taskSO().DailyTasks.find((t) => t.Id === id);
const DT = (G.dailyTask = {
  listeners: new Set(),
  on(f) { this.listeners.add(f); return f; }, off(f) { this.listeners.delete(f); },
  emit(type, id) { for (const f of [...this.listeners]) try { f(type, id); } catch (e) { console.error(e); } },
  d() { const s = G.data(); if (!s.dailyTask) s.dailyTask = { IsFirstTime: true, LastLoginDateString: '', CompletedTasks: [], InprogressTasks: [], Order: [] }; if (!s.dailyTask.Order) s.dailyTask.Order = []; return s.dailyTask; },
  check() {
    const d = this.d();
    const all = [...d.InprogressTasks, ...d.CompletedTasks];
    const valid = all.length > 0 && all.every((t) => !!taskCfg(t.TaskId));
    if (!valid || d.LastLoginDateString !== dayKey()) this.generate();
    return d;
  },
  rewards() { // three star rewards 20..60 summing to 100
    const a = E.randInt(0, 41), b = E.randInt(0, 41 - a), c = 40 - a - b;
    return E.shuffle([a, b, c]).map((x) => x + 20);
  },
  generate() {
    const d = this.d();
    d.CompletedTasks = []; d.InprogressTasks = [];
    const r = this.rewards();
    const ids = E.shuffle(taskSO().DailyTasks.map((t) => t.Id)).slice(0, 3);
    ids.forEach((id, i) => d.InprogressTasks.push({ TaskId: id, ProgressValue: 0, RewardValue: r[i] }));
    d.Order = ids.slice();
    d.LastLoginDateString = dayKey();
    G.save();
    this.emit('reset');
  },
  list() { const d = this.check(); const all = [...d.InprogressTasks, ...d.CompletedTasks]; const ord = d.Order && d.Order.length ? d.Order : all.map((t) => t.TaskId); return ord.map((id) => all.find((t) => t.TaskId === id)).filter(Boolean); },
  task(id) { const d = this.d(); return d.InprogressTasks.find((t) => t.TaskId === id) || d.CompletedTasks.find((t) => t.TaskId === id) || null; },
  isCompleted(id) { return this.d().CompletedTasks.some((t) => t.TaskId === id); },
  isClaimable(id) { const d = this.check(); const t = d.InprogressTasks.find((x) => x.TaskId === id); const c = taskCfg(id); return !!t && !!c && t.ProgressValue >= c.TargetProgress; },
  anyClaimable() { return this.list().some((t) => this.isClaimable(t.TaskId)); },
  progressTask(id, v) {
    const d = this.check();
    const t = d.InprogressTasks.find((x) => x.TaskId === id);
    if (!t || this.isClaimable(id)) return;
    t.ProgressValue += v; G.save();
    this.emit('progress', id);
  },
  completeTask(id) {
    const d = this.check();
    const i = d.InprogressTasks.findIndex((x) => x.TaskId === id);
    if (i < 0) return;
    const [t] = d.InprogressTasks.splice(i, 1); d.CompletedTasks.push(t); G.save();
    this.emit('completed', id);
    if (d.CompletedTasks.length >= 3) this.emit('all');
  },
  stars() { return this.d().CompletedTasks.reduce((s, t) => s + t.RewardValue, 0); },
});
G.dailyTask.ProgressTask = (id, v) => DT.progressTask(id, v);
// MoneyManager.UpdateMoney(+delta) → coin quests 1, 2, 5
G.moneyListeners.add((v, delta) => { if (delta >= 1) { DT.progressTask(1, delta); DT.progressTask(2, delta); DT.progressTask(5, delta); } });

// ---------------------------------------------------------------- Online rewards data (LoginTimeReward.DataPlayTime / PlayTimeTracker)
const LTR_CFG = 'sharedassets0.assets:14487';
const ltrCfg = () => E.so(LTR_CFG).DataList;
const PT = (G.playTime = {
  d() {
    const s = G.data();
    if (!s.playTime) s.playTime = { LastLoginDateString: dayKey(), AccumulatedSeconds: 0, RewardClaimed: [] };
    const p = s.playTime;
    if (p.LastLoginDateString !== dayKey()) { p.LastLoginDateString = dayKey(); p.AccumulatedSeconds = 0; p.RewardClaimed = []; G.save(); }
    const n = ltrCfg().length; while (p.RewardClaimed.length < n) p.RewardClaimed.push(false);
    return p;
  },
  seconds() { return this.d().AccumulatedSeconds; },
  minutes() { return Math.floor(this.seconds() / 60); },
  claimed(i) { return !!this.d().RewardClaimed[i]; },
  canClaimThis(i) { return i === 0 || this.claimed(i - 1); },
  reached(i) { return this.minutes() >= ltrCfg()[i].Minute; },
  claimable(i) { return !this.claimed(i) && this.reached(i) && this.canClaimThis(i); },
  anyClaimable() { return ltrCfg().some((c, i) => this.claimable(i)); },
});

// ---------------------------------------------------------------- global meta tick (play time, daily-task play minutes)
let saveT = 0, minuteT = 0, accT = 0;
const metaTick = (dt) => {
  accT += dt;
  if (accT >= 0.25) { const p = PT.d(); p.AccumulatedSeconds += accT; accT = 0; if (E.save) E.save.vibration = user().vibration !== false; } // E.vibrate reads E.save.vibration
  saveT += dt; if (saveT >= 10) { saveT = 0; G.save(); }
  minuteT += dt; if (minuteT >= 60) { minuteT -= 60; DT.progressTask(3, 1); DT.progressTask(6, 1); }
};
const _update = E.update;
E.update = (dt) => { _update(dt); try { metaTick(dt); } catch (e) { console.error(e); } };

// ================================================================= ProfilePanel
class ProfilePanel extends E.Behaviour {
  awake() { this.l = () => this.refresh(); }
  onEnable() { G.profile.listeners.add(this.l); this.refresh(); if (!this._wired) { this._wired = true; G.onClick(this.ref('_changeNameButton'), () => { G.click(); if (E.ui) E.ui.showPopup('PopupRename'); }); } }
  onDisable() { G.profile.listeners.delete(this.l); }
  onInit() {}
  onShow() { this.refresh(); }
  onHide() {}
  refresh() { this.updateAvatar(); this.updateLevel(); this.updateName(); this.updateProgress(); return this; }
  updateAvatar() { const a = G.session.Avatar; if (a) setSp(this.ref('_avatarImage'), a); return this; }
  updateLevel() { setTxt(this.ref('_levelText'), 'Level ' + G.profile.d().Level); return this; }
  updateName() { setTxt(this.ref('_nameText'), G.profile.d().Name || 'You'); return this; }
  updateProgress() {
    const p = G.profile.d(), req = G.profile.requirement();
    setTxt(this.ref('_experienceText'), Math.round(p.ExperiencePoint) + '/' + req);
    const f = imgOf(this.ref('_levelProgressImage')); if (f) f.fa = req > 0 ? E.clamp(p.ExperiencePoint / req, 0, 1) : 0;
    return this;
  }
  onChangeAnchorPositionY(delay, dur, y, ease, cb) { E.killOwner(this.go); if (dur <= 0 && delay <= 0) { this.go.rt[5] = y; if (cb) cb(); return; } E.moveTo(this.go, this.go.rt[4], y, dur, { delay, ease, owner: this.go, done: cb }); }
}
S.ProfilePanel = ProfilePanel;
G.refreshProfilePanels = () => { for (const p of E.findObjectsOfType('ProfilePanel')) if (p.refresh) p.refresh(); };

// ================================================================= Daily login (7 days)
const DAILY_CFG = 'sharedassets1.assets:849';
const DL = (G.dailyLogin = {
  d() { const s = G.data(); if (!s.dailyLogin) s.dailyLogin = { LastLoginDate: yesterdayKey(), DayIndex: 0 }; return s.dailyLogin; },
  maxDay: 7,
  isEnable() { const d = this.d(); return d.DayIndex < this.maxDay && d.LastLoginDate < dayKey(); },
  claimed() { const d = this.d(); d.LastLoginDate = dayKey(); d.DayIndex += 1; G.save(); },
});
class DailyLoginController extends E.Behaviour {
  setLimitDay(n) { DL.maxDay = n; }
  get DayIndex() { return DL.d().DayIndex; }
  get IsEnable() { return DL.isEnable(); }
  saveLoginData() { DL.claimed(); }
}
S['DailyReward.DailyLoginController'] = DailyLoginController;
class DailyItemBase extends E.Behaviour {
  onInit(index, cfg, ctrl) { this.DayIndex = index; this.DailyConfig = cfg; this.Controller = ctrl; this.Content = cfg.Contents[index]; this.cfg = E.resolve(this.go, this.d.Config) || {}; this.setUpData(); }
  setUpData() {}
  getStatus() { const li = DL.d().DayIndex; return this.DayIndex < li ? 1 : this.DayIndex === li ? 0 : 2; } // 1 Reward, 0 Select, 2 Unselect
  checkBox() { return this.go.find('Checked') || this.go.findDeep('Checked'); }
  onRefresh() {
    const st = this.getStatus(); const t = 'Day ' + (this.DayIndex + 1);
    for (const k of ['DayTextClaimed', 'DayTextSelected', 'DayTextNormal']) setTxt(this.ref(k), t);
    act(this.ref('DayTextClaimed'), st === 1); act(this.ref('DayTextSelected'), st === 0); act(this.ref('DayTextNormal'), st === 2);
    const pi = imgOf(this.ref('PanelImage')); const c = this.cfg;
    if (pi && c) { const sp = st === 1 ? c._rewardedSprite : st === 0 ? c._selectedSprite : c._unselectSprite; if (sp) pi.sp = sp; }
    this.enableIcon(st);
  }
  enableIcon(st) { const cb = this.checkBox(); if (cb) cb.setActive(st === 1); }
  onReward() {
    const c = this.Content; if (!c) return;
    if (c.IsCoin) { if (G.moneyMgr) G.moneyMgr.showUp(); G.collectMoney(c.Coin, 10); return; }
    for (const it of c.ItemConfig.Contents || []) {
      if (it.AssetName === 'Keycap') { if (!hasKeycap(it.ID)) unlockKeycap(it.ID); continue; }
      const cat = G.decor.indexByName(it.AssetName); if (cat >= 0) G.decor.unlock(cat, it.ID);
    }
  }
}
class NormalDayItem extends DailyItemBase {
  setUpData() {
    const c = this.Content; if (!c) return;
    setSp(this.ref('_iconGoldImage'), c.Icon); setSp(this.ref('_iconItemImage'), c.Icon);
    setTxt(this.ref('_coinText'), c.Coin);
    act(this.ref('_iconGoldImage'), c.IsCoin); act(this.ref('_iconItemImage'), !c.IsCoin); act(this.ref('_coinText'), true);
    const cb = this.checkBox(); if (cb) cb.setActive(false);
  }
  enableIcon(st) {
    super.enableIcon(st);
    if (st === 1) return;
    const c = this.Content; if (!c) return;
    act(this.ref('_iconGoldImage'), c.IsCoin); act(this.ref('_iconItemImage'), !c.IsCoin); act(this.ref('_coinText'), c.IsCoin);
  }
}
S['DailyMission.NormalDayItem'] = NormalDayItem;
class SpecialDayItem extends DailyItemBase {}
S['DailyReward.SpecialDayItem'] = SpecialDayItem;

class DailyLoginPopup extends E.PopupBase {
  onInit() {
    this.panelDur = 0.35;
    this.ctrl = this.ref('_dailyLoginController');
    this.cfg = E.so(this.d._dailyConfig) || E.so(DAILY_CFG);
    this.items = this.refs('_dailyItems').filter(Boolean);
    DL.maxDay = this.items.length || 7;
    this.items.forEach((it, i) => it.onInit && it.onInit(i, this.cfg, this.ctrl));
    G.onClick(this.ref('_claimButton'), () => this.onClaim());
    G.onClick(this.ref('_closeButton'), () => { G.click(); this.hide(); });
    G.onClick(this.ref('_closeButtonHidden'), () => { G.click(); this.hide(); });
  }
  showTutorial(b) { act(this.ref('_handGo'), b); act(this.ref('_closeButton'), !b); act(this.ref('_closeButtonHidden'), !b); }
  ShowTutorial(b) { this.showTutorial(b); }
  onShow(tutorial = false) { this.refreshStatus(); this.showTutorial(!!tutorial); if (G.moneyMgr) G.moneyMgr.showUp(); }
  onHide() { this.checkNotification(); if (G.moneyMgr) G.moneyMgr.backToParent(); }
  onClaim() {
    if (!DL.isEnable()) return;
    vibrate(100); G.click();
    act(this.ref('_closeButton'), true); act(this.ref('_closeButtonHidden'), true); act(this.ref('_handGo'), false);
    const it = this.items[DL.d().DayIndex]; if (it && it.onReward) it.onReward();
    DL.claimed();
    this.refreshStatus();
  }
  refreshStatus() {
    for (const it of this.items) if (it.onRefresh) it.onRefresh();
    const en = DL.isEnable();
    act(this.ref('_claimButton'), en); act(this.ref('_unClaimGo'), !en); act(this.ref('_textClaimed'), !en);
  }
  checkNotification() { act(this.ref('_notificationGo'), DL.isEnable()); }
  CheckNotification() { this.checkNotification(); }
}
S.DailyLoginPopup = DailyLoginPopup;

// ================================================================= Daily tasks UI
class DailyTaskController extends E.Behaviour { start() { DT.check(); } } // DDOL in level0 Master; logic lives in G.dailyTask
S['DailyTask.DailyTaskController'] = DailyTaskController;
class DailyMissionManager extends E.Behaviour {}
S['DailyMission.DailyMissionManager'] = DailyMissionManager;

class DailyTaskItemUI extends E.Behaviour {
  setup(task, popup) {
    this.task = task; this.popup = popup; this.cfg = taskCfg(task.TaskId);
    if (!this._wired) {
      this._wired = true;
      G.onClick(this.ref('_claimButton'), () => { G.click(); DT.completeTask(this.task.TaskId); });
      G.onClick(this.ref('_skipButton'), () => { G.click(); DT.completeTask(this.task.TaskId); }); // rewarded ad "skip_task" = free
      const go = this.go.findDeep('GoButton'); if (go) G.onClick(go, () => this.onGo());
    }
    this.updateProperties();
  }
  onGo() {
    G.click();
    if (this.popup) this.popup.hide();
    const home = E.ui && E.ui.getScreen('ScreenHome');
    if (!home) return;
    if (this.cfg && this.cfg.MissionType === 4) home.showDecor(); else home.onLiveButtonClicked();
  }
  updateProperties() {
    const c = this.cfg, t = DT.task(this.task.TaskId) || this.task; this.task = t; if (!c) return;
    setSp(this.ref('_icon'), c.Icon);
    setTxt(this.ref('_descriptionText'), c.TaskDescription);
    setTxt(this.ref('_rewardText'), 'x' + t.RewardValue);
    const p = Math.min(Math.floor(t.ProgressValue), c.TargetProgress);
    setTxt(this.ref('_progressText'), p + '/' + c.TargetProgress);
    const f = imgOf(this.ref('_progressImage')); if (f) f.fa = E.clamp(p / c.TargetProgress, 0, 1);
    const done = DT.isCompleted(t.TaskId), claim = !done && DT.isClaimable(t.TaskId);
    act(this.ref('_doneIcon'), done); act(this.ref('_doneBG'), done);
    act(this.ref('_claimButton'), claim);
    act(this.ref('_skipButton'), !done && !claim);
    const go = this.go.findDeep('GoButton'); if (go) go.setActive(!done && !claim);
  }
  rewardScreenPos() { const g = goOf(this.ref('_rewardPos')) || this.go; return g.wm ? [g.wm[4], g.wm[5]] : null; }
}
S['DailyTask.DailyTaskItemUI'] = DailyTaskItemUI;

class PopupDailyTask extends E.PopupBase {
  onInit() {
    this.panelDur = 0.35;
    this.bar = this.ref('_rewardProgressBar'); if (this.bar) this.bar.max = 100;
    this.items = [];
    const close = () => { if (this.collecting) return; G.click(); this.hide(); };
    G.onClick(this.ref('_btnClose'), close); G.onClick(this.ref('_btnClose2'), close);
    act(this.ref('_blockObject'), false);
    this.l = DT.on((type, id) => this.onTaskEvent(type, id));
    this.build();
  }
  onDestroy() { if (this.l) DT.off(this.l); }
  build() {
    const content = goOf(this.ref('_contentRect'));
    for (const it of this.items) E.destroy(it.go);
    this.items = [];
    const tpl = content && content.children.find((c) => c.comp('DailyTask.DailyTaskItemUI'));
    if (tpl) tpl.setActive(false);
    for (const t of DT.list()) {
      const r = E.spawn(this.d._itemPrefab, content); const g = goOf(r) || r; if (!g) continue;
      g.setActive(true); g.sx = g.sy = 1;
      const ui = g.comp('DailyTask.DailyTaskItemUI'); if (!ui) continue;
      ui.setup(t, this); this.items.push(ui);
    }
    this._key = DT.d().Order.join(',') + '|' + DT.d().LastLoginDateString;
  }
  onShow() {
    DT.check();
    if (this._key !== DT.d().Order.join(',') + '|' + DT.d().LastLoginDateString) this.build();
    const content = goOf(this.ref('_contentRect')); if (content && content.rt) content.rt[5] = 0;
    inter(this.ref('_btnClose'), false); inter(this.ref('_btnClose2'), false);
    E.after(0.35, () => { inter(this.ref('_btnClose'), true); inter(this.ref('_btnClose2'), true); }, this);
    this.refresh(0);
    if (DT.d().IsFirstTime) { DT.d().IsFirstTime = false; G.save(); E.after(0, () => E.ui.showPopup('DailyTask.PopupDailyTaskTutorial'), this); }
  }
  onHide() { this.updateNoti(); }
  refresh(dur = 1) {
    for (const it of this.items) it.updateProperties();
    if (this.bar) { if (dur <= 0) this.bar.setValue(DT.stars()); else this.bar.doValue(DT.stars(), dur); }
    this.updateNoti();
  }
  updateNoti() { act(this.ref('_notiObject'), DT.anyClaimable()); }
  onTaskEvent(type, id) {
    if (!this.isShowing) { this.updateNoti(); return; }
    if (type === 'reset') { this.build(); this.refresh(0); return; }
    if (type === 'progress') { this.refresh(0); return; }
    if (type === 'completed') {
      const it = this.items.find((x) => x.task.TaskId === id);
      act(this.ref('_blockObject'), true); this.collecting = true;
      if (it) it.updateProperties();
      const cs = this.ref('_collectingStar');
      const fin = () => E.after(0.5, () => { act(this.ref('_blockObject'), false); this.collecting = false; this.refresh(1); }, this);
      if (cs && cs.collect) cs.collect(5, fin, it ? it.rewardScreenPos() : null); else fin();
      return;
    }
    if (type === 'all') {
      const wait = () => { if (this.collecting) { E.after(0.1, wait, this); return; } E.ui.showPopup('DailyTask.PopupDailyTaskReward'); };
      wait();
    }
  }
}
S['DailyTask.PopupDailyTask'] = PopupDailyTask;

class PopupDailyTaskReward extends E.PopupBase {
  spine() { const a = this.ref('_animator'); const g = goOf(a); return g ? g.comp('Spine') : null; }
  onInit() { this.noPanelAnim = true; G.onClick(this.ref('_openButton'), () => this.onOpen()); }
  onShow() {
    this.opened = false; act(this.ref('_tapToOpenObject'), true);
    const sp = this.spine(); if (sp) { const anims = E.spineAnims(sp); if (anims.includes('idle')) E.spinePlay(sp, 'idle', true); }
    if (G.moneyMgr) G.moneyMgr.showUp();
  }
  onHide() { if (G.moneyMgr) G.moneyMgr.backToParent(); }
  onOpen() {
    if (this.opened) return; this.opened = true;
    G.click(); act(this.ref('_tapToOpenObject'), false);
    let fired = false;
    const after = () => {
      if (fired) return; fired = true;
      G.sound(3);
      const sp = this.spine(); if (sp) E.spinePlay(sp, 'open_gift2', true);
      const amount = weighted(taskSO().Rewards, 'Weight').RewardAmount;
      const p = goOf(this.ref('_spawnPoint'));
      G.collectMoney(amount, 10, () => this.hide(), p && p.wm ? [p.wm[4], p.wm[5]] : undefined);
    };
    const sp = this.spine();
    if (sp) { E.spinePlay(sp, 'open_gift', false, 0, after); E.after(3, after, this); } else after(); // safety if the spine never completes
  }
}
S['DailyTask.PopupDailyTaskReward'] = PopupDailyTaskReward;

class PopupDailyTaskTutorial extends E.PopupBase {
  onInit() { this.noPanelAnim = true; G.onClick(this.ref('_closeButton'), () => { G.click(); this.hide(); const p = E.ui.getPopup('DailyTask.PopupDailyTask'); if (p && !p.isShowing) E.ui.showPopup('DailyTask.PopupDailyTask'); }); }
  async onShow() {
    const steps = this.refs('_tutorialSteps').filter(Boolean);
    for (const s of steps) s.alpha = 0;
    act(this.ref('_textObject'), false); inter(this.ref('_closeButton'), false);
    const tok = (this._tok = (this._tok || 0) + 1);
    for (const s of steps) {
      E.fadeTo(s, 1, 0.5, { owner: this });
      await E.wait(0.5 + 0.25, this); if (tok !== this._tok || !this.isShowing) return;
    }
    act(this.ref('_textObject'), true); inter(this.ref('_closeButton'), true);
  }
  onHide() { this._tok++; }
}
S['DailyTask.PopupDailyTaskTutorial'] = PopupDailyTaskTutorial;

// ================================================================= Online rewards (play-time)
class PlayTimeTracker extends E.Behaviour { start() { PT.d(); } } // accumulation runs in metaTick (all scenes)
S.PlayTimeTracker = PlayTimeTracker;

class DailyLoginRewardUIItem extends E.Behaviour {
  setup(cfg, idx, popup) {
    this.cfg = cfg; this.idx = idx; this.popup = popup;
    if (!this._wired) {
      this._wired = true;
      G.onClick(this.ref('_claimFreeButton'), () => { G.click(); this.popup.claimReward(this.idx); });
      G.onClick(this.ref('_watchAdButton'), () => { G.click(); this.popup.claimReward(this.idx); }); // rewarded "online_rewards" = free
    }
    setTxt(this.ref('_txtMinutes'), cfg.Minute === 1 ? '1 min' : cfg.Minute + ' mins');
    const t = cfg.RewardType;
    act(this.ref('_coinContent'), t === 0); act(this.ref('_charmContent'), t === 1 || t === 3); act(this.ref('_skinContent'), t === 2);
    if (t === 0) setTxt(this.ref('_txtCoinAmount'), cfg.RewardAmount);
  }
  status(name) { const st = this.go.findDeep('RewardStatus'); return st ? st.findDeep(name) : null; }
  updateProcess() {
    const i = this.idx, c = this.cfg;
    const claimed = PT.claimed(i), reached = PT.reached(i) && PT.canClaimThis(i);
    const btns = this.refs('_rewardButtons').map(goOf);
    for (const b of btns) if (b) b.setActive(false);
    let show;
    if (claimed) show = this.ref('_doneButton');
    else if (reached) show = c.ClaimType === 1 ? this.ref('_watchAdButton') : this.ref('_claimFreeButton');
    else show = this.ref('_notDoneButton');
    act(show, true);
    const board = imgOf(this.ref('_rewardBoard'));
    if (board) { const sp = claimed ? this.d._claimedBoardSprite : this.d._readyBoardSprite; if (sp) board.sp = sp; }
    const lock = this.status('Lock'), can = this.status('CanClaim'), done = this.status('CheckDone');
    if (lock) lock.setActive(!claimed && !reached); if (can) can.setActive(!claimed && reached); if (done) done.setActive(claimed);
  }
  animShow(delay) {
    const g = this.go; E.killOwner(g); g.sx = g.sy = 0.5;
    E.scaleTo(g, 1, 0.5, { delay, ease: E.ease.outBack, owner: g });
    const cg = this.ref('_canvasGroup'); if (cg) { cg.alpha = 0; E.tween({ dur: 0.3, delay, owner: g, update: (v) => { cg.alpha = v; } }); }
  }
}
S.DailyLoginRewardUIItem = DailyLoginRewardUIItem;

class LoginTimeRewardPopup extends E.PopupBase {
  panel() { return goOf(this.ref('_tfPanel')); }
  onInit() {
    this.panelDur = 0.3;
    this.cfg = E.so(this.d._loginTimeRewardConfig) ? E.so(this.d._loginTimeRewardConfig).DataList : ltrCfg();
    this.rows = this.refs('_rewardUIItemList').filter(Boolean);
    this.rows.forEach((r, i) => { if (this.cfg[i]) r.setup(this.cfg[i], i, this); });
    const close = () => { G.click(); vibrate(100); this.hide(); };
    G.onClick(this.ref('_closeButton'), close); G.onClick(this.ref('_closeButton2'), close);
  }
  onShow() { if (G.moneyMgr) G.moneyMgr.showUp(); this.loadRewardData(); this.rows.forEach((r, i) => r.animShow(0.15 + i * 0.05)); }
  onHide() { if (G.moneyMgr) G.moneyMgr.backToParent(); }
  loadRewardData() { for (const r of this.rows) if (r.cfg) r.updateProcess(); }
  update() { this._t = (this._t || 0) + E.dt; if (this._t >= 1) { this._t = 0; this.loadRewardData(); } }
  claimReward(i) {
    if (PT.claimed(i) || !PT.claimable(i)) return;
    const c = this.cfg[i]; PT.d().RewardClaimed[i] = true; G.save();
    if (G.moneyMgr) G.moneyMgr.showUp();
    const coins = () => G.collectMoney(c.RewardAmount, 10);
    if (c.RewardType === 0) coins();
    else if (c.RewardType === 1 || c.RewardType === 3) {
      const k = randomLockedKeycap(c.RewardType === 1 ? 0 : 1);
      if (k) { unlockKeycap(k.Id); const p = E.ui.showPopup('LoginTimeReward.ClaimLoginRewardPopup'); if (p) p.showUnlockDecorKeycap(k.Icon || k.Sprite); } else coins();
    } else if (c.RewardType === 2) {
      const cat = G.decor.cats()[0];
      const pool = cat ? cat.OptionDatas.filter((o) => o.UnlockType === 3 && !G.decor.owned(0, o.ID)) : [];
      if (pool.length) { const o = E.pick(pool); G.decor.unlock(0, o.ID); const p = E.ui.showPopup('LoginTimeReward.ClaimLoginRewardPopup'); if (p) p.showDecorSkinContent(o.ID); } else coins();
    }
    this.loadRewardData();
  }
  // Home button status (runs from ScreenHome.update, popup may be hidden)
  homeTick(btnGo) {
    if (!btnGo) return;
    const noti = btnGo.find('DotNoti'); if (noti) noti.setActive(PT.anyClaimable());
    const sec = PT.seconds();
    const next = this.cfg ? this.cfg.find((c) => sec < c.Minute * 60) : ltrCfg().find((c) => sec < c.Minute * 60);
    const tbg = btnGo.find('TimeBG'), t1 = btnGo.find('Time (1)');
    if (tbg) tbg.setActive(!!next); if (t1) t1.setActive(!!next);
    if (next) { const rem = Math.max(0, Math.ceil(next.Minute * 60 - sec)); setTxt(this.ref('_txtTimer'), pad2(Math.floor(rem / 60)) + ':' + pad2(rem % 60)); }
  }
}
S['LoginTimeReward.LoginTimeRewardPopup'] = LoginTimeRewardPopup;

class ClaimLoginRewardPopup extends E.PopupBase {
  panel() { return goOf(this.ref('_tfPanel')); }
  onInit() {
    this.panelDur = 0.3;
    G.onClick(this.ref('_btnClose'), () => { G.click(); this.hide(); });
    G.onClick(this.ref('_btnCollectKeycap'), () => { G.click(); this.hide(); });
    G.onClick(this.ref('_btnClaimSkinDecor'), () => { G.click(); this.claimSkin(); });
    const ac = this.go.find('AnimationContent'); if (ac) ac.setActive(false);
  }
  onShow() { const ac = this.go.find('AnimationContent'); if (ac) ac.setActive(false); act(this.ref('_tfPanel'), true); }
  showUnlockDecorKeycap(sprite) {
    act(this.ref('_unlockCharmContent'), true); act(this.ref('_unlockDecorContent'), false);
    setSp(this.ref('_imgDecorKeycap'), sprite);
    act(this.ref('_btnCollectKeycap'), true); act(this.ref('_btnClaimSkinDecor'), false);
  }
  showDecorSkinContent(id) {
    const o = G.decor.option(0, id); this.skinSprite = o ? o.Icon : null;
    act(this.ref('_unlockCharmContent'), false); act(this.ref('_unlockDecorContent'), true);
    setSp(this.ref('_imgSkinDecor'), this.skinSprite);
    act(this.ref('_btnCollectKeycap'), false); act(this.ref('_btnClaimSkinDecor'), true);
  }
  claimSkin() {
    const ac = this.go.find('AnimationContent');
    const holder = goOf(this.ref('_skinDecorHolder')), start = goOf(this.ref('_skinDecorStartPos')), target = goOf(this.ref('_tfButtonDecor'));
    if (!ac || !holder || !target) { this.hide(); return; }
    act(this.ref('_tfPanel'), false); ac.setActive(true);
    setSp(this.ref('_imgSkinDecorAnim'), this.skinSprite);
    if (start) { holder.rt[4] = start.rt[4]; holder.rt[5] = start.rt[5]; }
    holder.sx = holder.sy = 1;
    E.after(0.02, () => { // after one layout pass
      uiMoveOnto(holder, target, 0.5, { ease: E.ease.inBack, owner: holder });
      E.scaleTo(holder, 0.2, 0.5, { ease: E.ease.inBack, owner: holder, done: () => {
        const home = goOf(this.ref('_tfButtonDecorAtHome'));
        if (home) { E.killOwner(home); E.scaleTo(home, 1.2, 0.1, { owner: home, done: () => E.scaleTo(home, 1, 0.1, { owner: home }) }); }
        this.hide();
      } });
    }, this);
  }
}
S['LoginTimeReward.ClaimLoginRewardPopup'] = ClaimLoginRewardPopup;

// ================================================================= Lucky wheel
const WHEEL = (G.luckyWheel = {
  d() { const s = G.data(); if (!s.wheel) s.wheel = { Count: 0, IsCountdown: '' }; return s.wheel; },
  check() { const d = this.d(); if (!d.IsCountdown || d.IsCountdown < dayKey()) { d.Count = 0; } return d; },
});
class LuckyWheelNode extends E.Behaviour {
  get nodeId() { return String(this.d._id); }
  get rotationValue() { return this.d._rotationValue || 0; }
  setData(cfg) { this.cfg = cfg; const t = this.go.find('txtMoney'); if (t && cfg && cfg.Reward === 0) { const tx = t.comp('Txt'); if (tx) tx.text = String(cfg.RewardAmount); } }
  playAnimationReward(delay) { const g = this.go; E.killOwner(g); E.after(delay, () => E.punchScale(g, 0.3, 0.4, { owner: g }), g); }
}
S.LuckyWheelNode = LuckyWheelNode;
class RewardMysteryBox {} // data class (IsCoin, Value)
S.RewardMysteryBox = RewardMysteryBox;

class GiftBoxLuckyWheel extends E.Behaviour {
  awake() { const f = goOf(this.ref('_tfFullContent')); if (f) f.setActive(false); }
  setGiftBox(i) { setSp(this.ref('_imgLid'), (this.d._lidSprites || [])[i]); setSp(this.ref('_imgBody'), (this.d._bodySprites || [])[i]); setSp(this.ref('_imgFront'), (this.d._frontSprites || [])[i]); }
  rarityVis(r) { const c = E.so(this.d._rarityVisualConfig); return c ? c.DataList.find((x) => x.Rarity === r) || c.DataList[0] : null; }
  applyRarity(r) {
    const v = this.rarityVis(r); if (!v) return;
    setSp(this.ref('_imgCircleGlow'), v.CircleGlow); setSp(this.ref('_imgRarityPanel'), v.Panel);
    for (const s of this.refs('_imgStars')) setSp(s, v.Star);
  }
  setReward(sprite, rarity) { this.isCoin = false; setSp(this.ref('_imgReward'), sprite); this.applyRarity(rarity >= 0 && rarity <= 3 ? rarity : 0); }
  setRewardCoin(v) { this.isCoin = true; this.coinValue = v; setSp(this.ref('_imgReward'), this.d._coinSprite); this.applyRarity(0); }
  animUnbox(onClose) {
    const full = goOf(this.ref('_tfFullContent')), box = goOf(this.ref('_rtGiftBox')), lid = goOf(this.ref('_imgLid'));
    const reward = this.go.findDeep('Reward'), stars = goOf(this.ref('_tfStarHolder')), glow = goOf(this.ref('_tfGlow'));
    const bg = imgOf(this.ref('_bgBlack')), close = goOf(this.ref('_btnCloseGiftBox'));
    if (!full || !box) { if (onClose) onClose(); return; }
    if (!this._init) {
      this._init = true;
      this.lid0 = lid ? [lid.rt[4], lid.rt[5]] : null; this.rew0 = reward ? reward.rt[5] : 0; this.bgA = bg ? bg.color[3] : 1;
      G.onClick(close, () => { G.click(); this.closeBox(); });
    }
    this.onClose = onClose;
    full.setActive(true); if (close) close.setActive(false);
    const fcg = full.comp('CG'); if (fcg) fcg.alpha = 1;
    if (bg) { bg.color[3] = 0; E.fadeTo(bg, this.bgA, 0.3, { owner: this }); }
    if (lid && this.lid0) { E.killOwner(lid); lid.rt[4] = this.lid0[0]; lid.rt[5] = this.lid0[1]; lid.sx = lid.sy = 1; const li = lid.comp('Img'); if (li) li.color[3] = 1; }
    if (reward) { E.killOwner(reward); reward.rt[5] = this.rew0; reward.sx = reward.sy = 1; }
    if (stars) stars.sx = stars.sy = 0; if (glow) glow.sx = glow.sy = 0;
    E.killOwner(box); box.sx = box.sy = 0;
    E.scaleTo(box, 1, 0.5, { ease: E.ease.inOutBack, owner: box, done: () => {
      if (!lid) return this.revealReward(reward, stars, glow, close);
      E.scaleTo(lid, [1, 0.9], 0.2, { owner: lid, done: () => {
        G.sound(46); lid.sy = 1;
        const li = lid.comp('Img'); const op = box.find('LidOpenPos');
        E.moveTo(lid, op ? op.rt[4] : lid.rt[4] + 476, op ? op.rt[5] : lid.rt[5] - 50, 0.4, { owner: lid, ease: E.ease.outQuad });
        if (li) E.fadeTo(li, 0, 0.4, { owner: lid });
        this.revealReward(reward, stars, glow, close);
      } });
    } });
  }
  revealReward(reward, stars, glow, close) {
    if (reward) E.moveTo(reward, reward.rt[4], 415, 0.5, { owner: reward, ease: E.ease.outBack });
    if (stars) E.scaleTo(stars, 1, 0.5, { ease: E.ease.outBack, owner: stars });
    if (glow) E.scaleTo(glow, 1, 0.5, { ease: E.ease.outBack, owner: glow });
    G.sound(50);
    E.after(0.5, () => { if (close) close.setActive(true); }, this);
  }
  closeBox() {
    const full = goOf(this.ref('_tfFullContent')); const close = goOf(this.ref('_btnCloseGiftBox'));
    if (close) close.setActive(false);
    let cg = full && full.comp('CG');
    if (!cg && full) { cg = { t: 'CG', alpha: 1, ia: true, br: true, go: full, enabled: true }; full.comps.push(cg); }
    if (!cg) { this.finish(); return; }
    E.tween({ dur: 0.3, owner: this, update: (v) => { cg.alpha = 1 - v; }, done: () => { full.setActive(false); cg.alpha = 1; this.finish(); } });
  }
  finish() { const f = this.onClose; this.onClose = null; if (f) f(); }
}
S.GiftBoxLuckyWheel = GiftBoxLuckyWheel;

class LuckyWheelPopup extends E.PopupBase {
  onInit() {
    this.noPanelAnim = true;
    this.cfg = E.so(this.d._configSO).Configs;
    this.nodes = this.refs('_nodes').filter(Boolean);
    for (const n of this.nodes) n.setData(this.cfg.find((c) => c.RewardId === n.nodeId));
    G.onClick(this.ref('_spinButton'), () => this.onSpinButtonClick());
    const close = () => this.onButtonCloseClicked();
    G.onClick(this.ref('_btnClose'), close); G.onClick(this.ref('_btnClose2'), close);
    G.onClick(this.ref('_getCoinButton'), () => { G.click(); act(this.ref('_getCoinButton'), false); this.startButtonSpinAnim(); this.activeButtonBack(); });
    act(this.ref('_getCoinButton'), false);
    const p = this.penguin(); if (p) E.spinePlay(p, 'idle', true);
    this.wheel = goOf(this.ref('_wheelImage'));
    this.blueY0 = 53;
  }
  penguin() { const r = this.ref('_pinginSpine'); return r && r.t === 'Spine' ? r : goOf(r) ? goOf(r).comp('Spine') : null; }
  onShow() {
    if (G.moneyMgr) G.moneyMgr.showUp();
    G.session.setActiveCharacter(false);
    this.checkCounterSpin();
    act(this.ref('_spinButton'), true); act(this.ref('_btnClose'), true); act(this.ref('_btnClose2'), true); inter(this.ref('_spinButton'), true);
    act(this.ref('_getCoinButton'), false);
    this.spinning = false;
    const w = this.wheel; if (w) { E.killOwner(w); w.rot = 0; E.tween({ dur: 2, owner: w, ease: E.ease.outQuad, update: (v) => { w.rot = 360 * v; }, done: () => { w.rot = 0; } }); }
    this.startButtonSpinAnim();
  }
  onHide() { this.stopButtonSpinAnim(); this.spinning = false; this._spin = null; }
  checkCounterSpin() {
    const d = WHEEL.check(); this.isAdOn = d.Count >= 2;
    act(this.ref('_adsIconRect'), this.isAdOn);
    setTxt(this.ref('_counterText'), d.Count + '/2');
  }
  spinBtnGo() { return goOf(this.ref('_spinButton')); }
  startButtonSpinAnim() {
    const b = this.spinBtnGo(); if (!b) return;
    b.setActive(true); act(this.ref('_textBlank'), true); act(this.ref('_btnClose'), true); act(this.ref('_btnClose2'), true);
    E.killOwner(b); b.sy = 1;
    E.tween({ dur: 0.5, loops: -1, yoyo: true, ease: E.ease.inOutBack, owner: b, update: (v) => { b.sy = 1 + 0.1 * v; } });
  }
  stopButtonSpinAnim() { const b = this.spinBtnGo(); if (b) { E.killOwner(b); b.sy = 1; } }
  onSpinButtonClick() {
    if (this.spinning) return;
    const u = user(); if (!u.Tracking) u.Tracking = { Spin: 0 }; u.Tracking.Spin++;
    G.click(); haptic();
    this.startSpin(); // rewarded "spin" when isAdOn = free
  }
  startSpin() {
    inter(this.ref('_spinButton'), false); this.stopButtonSpinAnim();
    G.sound(49); vibrate(100); act(this.ref('_btnClose'), false);
    this.spinning = true;
    const r = Math.random() * this.cfg.reduce((s, c) => s + c.Rate, 0);
    let acc = 0, reward = this.cfg[this.cfg.length - 1];
    for (const c of this.cfg) { acc += c.Rate; if (acc > r) { reward = c; break; } }
    this.runAnimation(reward);
  }
  runAnimation(reward) {
    const b = this.spinBtnGo();
    if (b) E.tween({ dur: 0.1, loops: 2, yoyo: true, owner: b, update: (v) => { b.sy = 1 - 0.3 * v; }, done: () => { b.sy = 1; } });
    const blue = goOf(this.ref('_blueButtonRect')); if (blue) E.moveTo(blue, blue.rt[4], 19, 0.2, { owner: blue });
    act(this.ref('_btnClose'), false); act(this.ref('_btnClose2'), false); act(this.ref('_textBlank'), false);
    const node = this.nodes.find((n) => n.nodeId === reward.RewardId) || this.nodes[0];
    this._spin = { t: 0, phase: 1, amount: 0, target: node.rotationValue, node, reward };
  }
  update(dt) {
    const s = this._spin; const w = this.wheel; if (!s || !w) return;
    s.t += dt;
    if (s.phase === 1) {
      s.amount += (this.d._spinSpeed || 60) * dt; w.rot += s.amount;
      if (s.t >= (this.d._initSpinDuration || 2)) { s.phase = 2; s.t = 0; s.start = ((w.rot % 360) + 360) % 360; s.end = s.target + 720; }
    } else {
      const D = this.d._decelerationDuration || 2; const k = Math.min(1, s.t / D);
      w.rot = s.start + (s.end - s.start) * (1 - Math.pow(1 - k, 3));
      if (k >= 1) { w.rot = s.target; this._spin = null; this.onLanded(s.node, s.reward); }
    }
  }
  onLanded(node, reward) {
    const d = WHEEL.d(); d.Count = Math.min(d.Count + 1, 2); if (d.Count >= 1) d.IsCountdown = dayKey(); G.save();
    this.checkCounterSpin();
    const p = this.penguin(); if (p) { E.spinePlay(p, 'penguin_open_mouth', false, 0, () => E.spinePlay(p, 'penguin_open_mouth_loop', true)); }
    G.sound(44);
    node.playAnimationReward(0.8);
    const finish = () => { this.spinning = false; this.startButtonSpinAnim(); this.activeButtonBack(); };
    const closeMouth = () => { if (p) E.spinePlay(p, 'penguin_close_mouth', false, 0, () => E.spinePlay(p, 'idle', true)); };
    if (reward.Reward === 1) {
      E.after(1, () => {
        const gb = this.ref('_giftBoxLuckyWheel'); if (!gb) { finish(); return; }
        gb.setGiftBox(reward.RewardId === '1' ? 0 : 1);
        closeMouth();
        const boxes = this.d._mysteryBoxes || [];
        let kc = null;
        for (const b of boxes) if (!b.IsCoin && !hasKeycap(b.Value)) { const k = keycapById(b.Value); if (k) { kc = k; break; } }
        let coin = 0;
        if (kc) { gb.setReward(kc.Icon || kc.Sprite, kc.Rarity); unlockKeycap(kc.Id); }
        else { const cs = boxes.filter((b) => b.IsCoin); coin = cs.length ? E.pick(cs).Value : 100; gb.setRewardCoin(coin); }
        gb.animUnbox(() => {
          if (coin) { if (G.moneyMgr) G.moneyMgr.showMoneyAddOn(coin, 2); G.collectMoney(coin, 10); }
          finish();
        });
      }, this);
    } else {
      this.getMoney(reward.RewardAmount, closeMouth);
    }
  }
  getMoney(amount, closeMouth) {
    G.addMoney(amount);
    setTxt(this.ref('_txtCoinGet'), amount);
    const fx = this.ref('_fxCoin'); if (fx && fx.play) fx.play();
    E.after(1.5, () => {
      closeMouth();
      const c = goOf(this.ref('_getCoinButtonContent')); if (c) { c.sx = c.sy = 0; E.scaleTo(c, 1, 0.2, { ease: E.ease.outBack, owner: c }); }
      act(this.ref('_getCoinButton'), true);
      G.sound(50);
      this.spinning = false;
    }, this);
  }
  activeButtonBack() { inter(this.ref('_spinButton'), true); const blue = goOf(this.ref('_blueButtonRect')); if (blue) E.moveTo(blue, blue.rt[4], this.blueY0, 0.3, { owner: blue }); }
  onButtonCloseClicked() {
    if (this.spinning) return;
    G.click();
    G.session.setActiveCharacter(true);
    this.hide();
    if (E.ui) E.ui.showScreen('ScreenHome');
    if (G.moneyMgr) G.moneyMgr.backToParent();
  }
}
S.LuckyWheelPopup = LuckyWheelPopup;

// ================================================================= Settings / profile / rename / language
class SettingButton extends E.Behaviour {
  key() { return ['sound', 'music', 'vibration'][this.d._type] || 'sound'; }
  isOn() { return user()[this.key()] !== false; }
  setup() { if (this._wired) return; this._wired = true; G.onClick(this.ref('_button') || this.go, () => this.toggle()); }
  refresh() { const im = imgOf(this.ref('_image')); if (im) im.sp = this.isOn() ? this.d._onSprite : this.d._offSprite; }
  toggle() {
    const u = user(), k = this.key(); u[k] = !this.isOn(); G.save();
    if (k === 'music') { if (u.music) { E.audio.setMusicMuted(false); if (!E.audio.musicName) G.music(E.pick(['bgm_home_1', 'bgm_home_2', 'bgm_home_3'])); } else E.audio.setMusicMuted(true); }
    if (k === 'vibration') { if (E.save) E.save.vibration = u.vibration; if (u.vibration) E.vibrate(100); }
    G.click();
    this.refresh();
  }
  setData() { this.refresh(); }
}
S.SettingButton = SettingButton;
class SettingPanel extends E.Behaviour {
  btns() { return ['_soundButton', '_musicButton', '_vibrateButton'].map((k) => this.ref(k)).filter((b) => b && b.refresh); }
  onEnable() { for (const b of this.btns()) { b.setup(); b.refresh(); } }
  refresh() { for (const b of this.btns()) { b.setup(); b.refresh(); } }
}
S.SettingPanel = SettingPanel;
class SettingsPopup extends E.PopupBase { // not placed in any exported scene; generic fallback
  onInit() { for (const k of ['_closeButton', '_btnClose', '_closeButtonHidden']) G.onClick(this.ref(k), () => { G.click(); this.hide(); }); }
  onShow() { const sp = this.go.compInChildren('SettingPanel'); if (sp && sp.refresh) sp.refresh(); }
}
S.SettingsPopup = SettingsPopup;
class ProfilePopup extends E.PopupBase {
  onInit() {
    this.panelDur = 0.35;
    G.onClick(this.ref('_closeButton'), () => { G.click(); this.hide(); });
    G.onClick(this.ref('_closeFullscreenButton'), () => { G.click(); this.hide(); });
    G.onClick(this.ref('_restoreButton'), () => G.click()); // IAP restore: skipped
    G.onClick(this.ref('_prevlanguageButton'), () => { G.click(); this.updateLanguage(); }); // English only
    G.onClick(this.ref('_nextlanguageButton'), () => { G.click(); this.updateLanguage(); });
  }
  onShow() { const sp = this.ref('_settingPanel'); if (sp && sp.refresh) sp.refresh(); this.updateLanguage(); }
  updateLanguage() { setTxt(this.ref('_txtLanguage'), 'English'); }
}
S.ProfilePopup = ProfilePopup;

class PopupRename extends E.PopupBase {
  onInit() {
    this.noPanelAnim = true;
    const close = () => { G.click(); this.hide(); };
    G.onClick(this.ref('_closeButton'), close); G.onClick(this.ref('_overlayCloseButton'), close);
    G.onClick(this.ref('_confirmButton'), () => this.onConfirm());
    // TMP_InputField: no text-input widget in the engine → tapping the field opens a native prompt
    const f = goOf(this.ref('_inputField'));
    if (f) {
      let b = f.comp('Btn');
      if (!b) { b = { t: 'Btn', go: f, onClick: [], interactable: true, enabled: true, tr: 0 }; f.comps.push(b); }
      b.onClick.push(() => {
        let v = null;
        try { v = window.prompt('Enter your name', this.value || ''); } catch (e) { v = null; }
        if (v != null) { this.value = this.sanitize(v).slice(0, 20); this.updateField(); }
      });
    }
  }
  sanitize(s) { return String(s || '').replace(/[^A-Za-z0-9_. ]+/g, ''); }
  valid() { return this.sanitize(this.value).trim().length > 0; }
  updateField() {
    const f = goOf(this.ref('_inputField')); if (!f) return;
    const ph = f.findDeep('Placeholder'), tx = f.findDeep('Text');
    if (tx && tx.comp('Txt')) tx.comp('Txt').text = this.value || '';
    if (ph) ph.setActive(!this.value);
    const im = imgOf(this.ref('_confirmButton')); if (im) im.sp = this.valid() ? this.d._interactiveSprite : this.d._unInteractiveSprite;
  }
  onShow() {
    this.value = ''; this.updateField();
    const p = goOf(this.ref('_panel')); if (p) { E.killOwner(p); p.sx = p.sy = 1; p.rot = 0; E.punchScale(p, 0.1, 0.36, { owner: p }); E.tween({ dur: 0.36, owner: p, ease: E.ease.linear, update: (v) => { p.rot = 4 * Math.sin(v * Math.PI * 3) * (1 - v); }, done: () => { p.rot = 0; } }); }
  }
  onConfirm() {
    if (!this.valid()) return;
    G.click();
    G.profile.setName(this.sanitize(this.value).trim());
    G.refreshProfilePanels();
    this.hide();
  }
}
S.PopupRename = PopupRename;

const LOCALIZE_ASSET = 'sharedassets0.assets:14496';
class LanguageUIItem extends E.Behaviour {
  setup(data, onClick) {
    this.data = data;
    setSp(this.ref('_imgFlag'), data.Flag); setTxt(this.ref('_txtRegion'), data.RegionName);
    if (!this._wired) { this._wired = true; G.onClick(this.go, () => onClick(this)); }
  }
  setSelected(b) {
    this.Selected = b; const s = this.go.find('Selected'); if (s) s.setActive(b);
    const t = E.txtOf(this.ref('_txtRegion')); if (t) { const c = b ? this.d._colorSelected : this.d._colorNormal; if (c) t.color = c.slice(); }
  }
}
S.LanguageUIItem = LanguageUIItem;
class PopupLanguage extends E.PopupBase {
  onInit() {
    this.noPanelAnim = true;
    const la = E.so(LOCALIZE_ASSET); const en = la && la.DataList.find((x) => x.Language === 'English');
    this.item = this.ref('_cellItem');
    if (this.item && en) { this.item.setup(en, (it) => { G.click(); it.setSelected(true); const cb = G.goOf(this.ref('_btnConfirm')); if (cb) cb.setActive(true); }); this.item.setSelected(true); }
    { const cb = G.goOf(this.ref('_btnConfirm')); if (cb) cb.setActive(true); }
    G.onClick(this.ref('_btnConfirm'), () => { G.click(); const u = user(); u.CurrentLanguage = 'English'; u.IsSelectedLanguage = true; G.save(); this.hide(); });
  }
}
S['Home.PopupLanguage'] = PopupLanguage;

// ---------------------------------------------------------------- preload (SO-referenced sprites used by these popups / decor)
E.scenePreload.level1 = () => {
  const out = new Set();
  for (const k of [DECOR_ASSET, DAILY_CFG, TASK_SO, 'sharedassets1.assets:846', 'sharedassets1.assets:848']) { const so = E.so(k); if (so) E.collectRefs(so, out); }
  for (const c of decorCats()) E.collectRefs(c, out);
  for (const id of [70, 76, 95, 104]) { const k = keycapById(id); if (k) { if (k.Icon) out.add(k.Icon); if (k.Sprite) out.add(k.Sprite); } }
  const la = E.so(LOCALIZE_ASSET); if (la) for (const x of la.DataList) if (x.Flag) out.add(x.Flag);
  E.prefabSprites(['sharedassets1.assets:897', G.poolPrefab(5), G.poolPrefab(105)], out);
  return out;
};
})();
