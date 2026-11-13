# Core systems spec: "Clicker DIY: ASMR Charm Master"

Scope: boot/loading, scene transition, UI base and popups, money and coin-fly, save data, audio, vibration, the livestream comment and viewer system, pooling, and small utilities.
Notation: `level0:NNN` / `sharedassets0.assets:NNN` are export ids. GameObject paths come from `S/dump/levelN.txt`. Ease ids are DOTween ids (1 Linear, 5 InQuad, 6 OutQuad, 7 InOutQuad, 25 InOutElastic, 26 InBack, 27 OutBack). "(inferred)" marks a guess.

---------------------------------------------------------------------------------------------------

## 1. Overview: boot and scene flow

Scenes (Unity build index → name; the code loads scenes by path string, see `GameConfig`):

| idx | scene | GameConfig constant (path) |
|---|---|---|
| level0 | Loading | – |
| level1 | Home | `HomeScene = "Assets/_Game/Scenes/Home.unity"` |
| level2 | ModeClicker | `ClickerScene = ".../ModeClicker.unity"` |
| level3 | BlindbagMinigame | `BlindbagScene` |
| level4 | BlindBagCollection | `BlindbagCollection` |
| level5 | DreamHouse | `DreamHouseScene` |
| level6 | ScoopGame | `ScoopGameScene` |

Boot sequence (level0):
1. Persistent (DontDestroyOnLoad) roots are created in level0 and live for the whole session:
   `Master` (DataManager + all GameData components, PoolManager, AudioManager, GameSession, VibrationManager, DailyMissionManager, …),
   `SimpleTransitionCanvas` (SimpleSceneTransition: the scene-transition overlay),
   `SceneLoader` (an older transition system that is never used), and `OverlayView` (ad overlays, all inactive; skip it).
   `DataManager.Initiate` loads every save (see §5) before anything reads money or settings.
2. `UIManager` (level0 root, Canvas) holds `LoadingControl` and the loading-screen visuals. This object is NOT DDOL, so it is destroyed when Home loads.
3. `LoadingControl.Start` → `IELoadScene("Home", _loadingDuration = 10.0)`:
   - wait **1.0 s** (`WaitForSeconds(1)`)
   - start `LoadSceneAsync("Home")` with `allowSceneActivation = false`
   - start the progress tween: `DOVirtual.Float(0 → 100, 10 s, Linear)` sets `LoadingText` = `"Loading {0}%"` with `{0}` = `(int)value`.
     At the same time `Fill.DOFillAmount(1, 10 s)` runs with ease Linear and OnUpdate `HiddenSlider.value = Fill.fillAmount`. The slider is invisible.
   - `AdsManager.RequestConsent(cb)` sets `consentRequestComplete = true`. For the port, treat it as complete immediately.
   - wait until the async progress is ≥ 0.9 and consent is complete, then `WaitForSeconds(10)`.
     The 10 s wait begins at about the same moment as the tween, so the two end together.
   - then `allowSceneActivation = true`, and Home appears. (The original shows an App Open ad first when remote config allows it; skip that.) Banner ad: skip.
   - **Total: about 11 s from launch to Home.** There is no fade on this first switch. The Home scene runs its own `SimpleSceneTransition.FadeOut()` / `ForceFadeOut()` (called from `HomeScreen`/`ScreenHome`).
4. After that, every scene change goes through `SimpleSceneTransition.FlashIn(targetScenePath, hasMascot)` (§2).
   `BaseScene.Update`: on Android, the Escape key calls `Application.Quit` (ignore on web).

### Loading-screen visuals (level0 `UIManager`, initial state from the dump)
- `Bg` Image `BG_loading_repeat-x` (full screen). `BgTexture` is inactive.
- `Star/Image..Image (4)`: 5 sprites `BG_loading_element`, local scale 1.3, each with an autoplay DOTweenAnimation:
  Scale to 1.0, 0.5 s, ease InOutQuad, infinite Yoyo (pulsing 1.3↔1.0).
  Delays: Image 0.0, Image(4) 0.1, Image(3) 0.2, Image(2) 0.3, Image(1) 0.4.
  Anchored positions: (80,-138), (-579,-914), (481,-1223), (-416,1114), (587,1363).
- `SkeletonGraphic (peguin_loading)`: Spine `sharedassets0.assets:14509`, anim `loading`, loop, pos (0,-370).
- `LogoImage` (sprite `logo`): DOTweenAnimation Scale to 0.95, 1.0 s, OutQuad, infinite Yoyo.
  It also has a ShinyEffectForUGUI (location 0.211, width 0.25, rotation -48, softness 1, brightness 1). The component is static unless played (optional shine).
- `LoadingBar` (sprite `progress_bound`, scale 1.35, anchored bottom-center at y=906.7, 755×100):
  - `Fill`: Image `progress_fill`, Filled, horizontal (fillMethod 0), fillAmount starts at 0. It is driven 0→1 over 10 s.
  - `LoadingText`: TMP "Loading 0 %" at the start, 70 pt white. It becomes "Loading N%" (no space before %) during the tween.
  - `Fill/Scroll`: RawImage with `Scroller` (x speed -0.2), inactive. `HiddenSlider` graphics have alpha 0 and its rotating handle image is inactive, so nothing of it is visible.
- `FX_touch_UI` particle (tap FX). Inactive and unused here: `Text` (TextLoadingAnimation), `CharmRandom` (CharmRandomLoading has no sprites), `BreakAdController/BlockScreen` (an "ADS Break" overlay; skip).

---------------------------------------------------------------------------------------------------

## 2. SimpleSceneTransition (persistent overlay, `SimpleTransitionCanvas`)

MonoSingleton. `Initiate()` calls DontDestroyOnLoad.
Serialized refs:
`_whiteFlashImage` = `FlashFx` (Image `BG_loading_repeat-x`, full stretch, start alpha 0),
`_tfMascot` = `SkeletonGraphic (hamster_shipber)` (inactive, at -3465,-80), `_tfLeft` = `Left` (-700,-80 from the left edge), `_tfCenter` = `Center` (0,-80), `_tfRight` = `Right` (+700 from the right edge),
`_pinginSpine` = `SkeletonGraphic (peguin_loading)` (anim `loading` loop, pos (0,400), 967×916),
`_keycapEffectCanvas` = `KeycapEffect` CanvasGroup (start alpha 0), `_keycapEffect` = `KeycapEffect` (7 keycap letters L,O,A,D,I,N,G on a `Loading_case` base, plus 5 pulsing stars with the same DOTweenAnimations as the loading screen),
`_charmAnimation` (unused).
State: `_hasMascot`, `_tweenAnimDone`, `_isAnimating` (`IsAnimating` getter), `_loadSceneOperation`.

**Important:** every async entry point sets `_hasMascot = false`, so the hamster-mascot branch never runs.
The `hasMascot` argument of `FlashIn` is ignored. Implement only the "no mascot" path.

### AnimFlashIn()
```
_tweenAnimDone=false; _isAnimating=true
whiteFlash.raycastTarget = true            // blocks input
whiteFlash.DOKill(); whiteFlash.alpha = 0 (instant)
whiteFlash.DOFade(1, 0.5)
pinginSpine.gameObject.SetActive(true); pinginSpine.DOFade(1, 0.5)
keycapCanvas.DOFade(1, 0.2).SetDelay(0.3)
keycapEffect.Animate()
DOVirtual.DelayedCall(1.0, ()=>{ _tweenAnimDone=true; _isAnimating=false }, ignoreTimeScale)
```
`KeycapEffect.Animate()`: kill the old sequence, then build a sequence. For each letter in order, Append `DOAnchorPosY(-31, 0.2)` with ease InQuad, then Append `DOAnchorPosY(-15, 0.2)` with ease OutQuad.
The sequence loops infinitely, giving a "typing" wave across L-O-A-D-I-N-G with a 2.8 s cycle. `StopAnimate()`: kill it and set every letter `DOAnchorPosY(-15, 0)`.

### FlashIn(string targetScene, bool hasMascot)  (async; used by every "go to scene" button)
```
_hasMascot=false
if targetScene == GameConfig.HomeScene: GameSession.CanShowSpecial = true
AnimFlashIn(); (ShowMREC ad: skip)
_loadSceneOperation = LoadSceneAsync(targetScene) with allowSceneActivation=false; wait until progress >= 0.9
while !_tweenAnimDone: yield frame
_loadSceneOperation.allowSceneActivation = true; yield 2 frames
```
The screen stays white with the penguin and LOADING. The new scene's controller must call `FadeOut()`. Callers: HomeScreen/ScreenHome, IngameClickerScreen, ScoopGame*, Blindbag*, DreamHouseController.

### FadeOut()  (no-mascot path)
```
whiteFlash.DOKill()
pinginSpine.DOKill(); pinginSpine.DOFade(0, 0.5).OnComplete(pingin.SetActive(false))
keycapCanvas.DOFade(0, 0.5)
whiteFlash.DOFade(0, 0.5).OnComplete(keycapEffect.StopAnimate(); whiteFlash.raycastTarget=false)
```
### ForceFadeOut(): the same but instant
Kill tweens, then set white, pingin and keycap alpha to 0 immediately (duration 0). Pingin is deactivated, keycaps are stopped, and the white image raycastTarget is set to false.
### Transition(Action onTransition)  (in-scene "flash" without a scene load; used by ScoopGame ScreenInGame and BlindbagCollectionController)
`AnimFlashIn()` → wait for `_tweenAnimDone` (1.0 s) → `onTransition()` → `FadeOut()`.
### JustLoadScene(path): `LoadSceneAsync` with no visuals.
### FlashIn(float time, Action action)
Only used by AdsManager around app-open ads. It runs AnimFlashIn → waits for done → waits `time` → runs `action` → FadeOut. Optional for the port.

### SceneLoader (unused)
It has CircleIN/CircleOUT EasyTransition animators and a `Translate` with 0.5 s waits. Nothing outside the class calls it, so skip it.
`LoadingControl.LoadScene` is also never called externally.

---------------------------------------------------------------------------------------------------

## 3. UI framework

### UIBase (base for ScreenBase / PopupBase; both subclasses are empty)
Fields: `_isShowing`, `_canvasGroup` (GetComponent in OnInit), `_uiManager`.
- `OnInit(ui)`: cache the CanvasGroup and UIManager, then hide instantly.
- `OnShow()`: `FrameWorkUtility.SetActive(canvasGroup, true, 0)` and `_isShowing=true`.
- `OnHide()`: `SetActive(canvasGroup, false, 0)` and `_isShowing=false`.
- `FrameWorkUtility.SetActive(cg, on, fadeTime)`: `cg.DOKill(); cg.DOFade(on?1:0, fadeTime); cg.blocksRaycasts = on`.
  Base show/hide is an **instant alpha 0/1 swap**. The GameObject stays active and the CanvasGroup only toggles alpha and raycasts.
- `OnBack()` returns false. `GetName()` = type name.

### UIManager (per scene, MonoSingleton)
`_arrScreens`/`_arrPopups` are serialized. `OnInit` builds dictionaries keyed by type name (it logs "Invalid screen name" on duplicates) and calls `OnInit(this)` on each.
`ShowScreen<T>/HideScreen<T>/ShowPopup<T>/HidePopup<T>/GetScreen<T>/GetPopup<T>` are generic dictionary lookups that call `OnShow`/`OnHide`. There is no stack and no animation of its own.
`OnHideClick()` (debug "hide UI" toggle): every `UIHide` object gets CanvasGroup alpha 0/1 and every `UIDisable` object gets scale 0/1.

### Popup show animation convention (implemented in each popup subclass, not in the base)
The usual pattern: `UIBase.OnShow()`, then set the popup's inner panel `localScale = 0`, then `panel.DOScale(1, d)` with ease **OutBack (27)**.
Buttons are often made non-interactable until the tween completes. Hide is usually just `UIBase.OnHide()` (instant).

| popup | panel tween |
|---|---|
| NotEnoughMoneyPopup, PopupNewRoom | 0→1, 0.36 s OutBack |
| Clicker.BackHomePopup | 0→1, 0.5 s OutBack |
| CollectionFull, CreateMore, DeleteKeycap, PopupClickerComplete, CollectionComplete, ClaimLoginReward | 0→1, 0.3 s OutBack |
| DailyLogin, PopupDailyTask, ProfilePopup, Donate panel | 0→1, 0.35 s OutBack |
| PopupItemLocked | 0→1, 0.2 s OutBack |
| RateUs, PopupRename | DOPunchScale(0.1, 0.36 / 0.1-ish, vibrato 10) instead of a scale-in |

### NotEnoughMoneyPopup
Fields: `_panel`, `_closeButton`, `_closeButtonHidden`, `_purchaseButton`, `_lastParent`, `_featureUsing` (analytics only).
- `OnShow`: canvas visible, `_isShowing=true`, `_panel.localScale=0` → `DOScale(1, 0.36)` OutBack.
  It also re-parents the scene's MoneyManager money box under this popup (`_lastParent` remembers the old parent) so the counter is visible on top of the popup.
- Close / hidden close: `PlaySound(click)` then hide.
- Purchase button ("watch ad for coins", **treat as free**): `PlaySound(click)`, then `MoneyManager.CollectMoney(1000, coinObj=10, onCompleted=Hide)`, then hide.
- `OnHide`: instant hide, then return the money box to `_lastParent`.

### Clicker.BackHomePopup (generic part)
Fields: `_btnConfirm`, `_btnCancel`, `_btnCancel2` (the background tap), `_tfPanel` (scale 0 in OnInit).
- `OnShow`: base show; all 3 buttons non-interactable; `_tfPanel.DOScale(1, 0.5)` OutBack, and OnComplete makes the buttons interactable.
- Confirm: disable buttons, `PlaySound(click)`, (interstitial ad: skip), `SimpleSceneTransition.FlashIn(HomeScene, false)`.
- Cancel / Cancel2: `PlaySound(click)`, (interstitial: skip), disable buttons, `OnHide()` (instant).

### NoInternetPopup / PopupNointernet: skipped (never show on web).

---------------------------------------------------------------------------------------------------

## 4. Money system

### Data
`DataUser.dataSave.Money` (int). **The starting value on a fresh install is 200** (set in `DataUser.NewData`).
`DataUser.GetMoney()` returns it. `DataUser.UpdateMoney(v)` sets `Money=v` and saves immediately.

### MoneyManager (one per scene; MonoSingleton; it is the money box UI)
Instances:
- level1 `UIManager/Screen/Sceen Home Clone/Header/Money` (anchored top-right (-168,-105), 226×78.5)
- level2 `UIManager/Screen/Money`
- level3 `UIManager/StoreScreen/SafeArea/Money`
- level4 `UIManager/[Popup]/CollectionCompletePopup/Money`
- level5 `UIManager/[Sceen]/ScreenInGame/Money`
- level6 `UIManager/[Popup]/Money`

Fields: `_canvasGroup` (on Money), `_moneyText` (`Money/MoneyText` TMP), `_collectingCoin` (CollectingCoin on the same object), `_moneyItem` (`Money/MoneyItem`, the floating "+N" label), `_money` (cached), `_defaultParent`, `_delayCallback`, `_onCompleted`.
There is also a static event `OnMoneyChanged` (UnityAction; ScreenTrading and ScoopGame.OptionPanel subscribe).

- `Awake`: `_money = DataUser.GetMoney()`; `moneyText = _money.ToString("N0")` (thousand separators, e.g. "1,250"); `_defaultParent = transform.parent`.
- `RefreshMoney()`: re-read the saved value and set the text (no tween). ScreenHome calls it.
- `UpdateMoney(delta)`, the **only way money changes (add or spend)**:
  ```
  old=_money; _money = max(0, _money+delta)
  DOTween.To(()=>old, x=>moneyText = x.ToString("N0"), _money, 1.0s)   // counter roll, default ease (OutQuad)
  DataUser.UpdateMoney(_money)   // saved
  OnMoneyChanged?.Invoke()
  if delta >= 1: DailyTaskController.ProgressTask(QuestId_Collect200Coin=1, delta),
                 ProgressTask(QuestId_Collect500Coin=2, delta), ProgressTask(QuestId_Collect1000Coin=5, delta)
  ```
  To spend, callers pass a negative delta (shops in ScoopGame.SelectCard/SelectBox, ScreenTrading, …). Callers check `GetMoney() >= price` themselves, and the floor at 0 is a safety clamp.
  `Add1Mil()` = cheat `UpdateMoney(1000000)`.
- `CollectMoney(money, coinObjAmount, onCompleted)`, the reward with a coin fly:
  ```
  _delayCallback.Kill(); if _onCompleted != null: _onCompleted(); _onCompleted=null; _delayCallback=null
  _onCompleted = onCompleted
  transform.SetParent(<top-level singleton>.transform)     // pops the money box above popups (inferred: UIManager root)
  _collectingCoin.CollectCoins(coinObjAmount, onFirstCoinArrived:
        UpdateMoney(money)
        _delayCallback = DOVirtual.DelayedCall(2.0, ()=>{ _onCompleted?.Invoke(); _onCompleted=null; _delayCallback=null;
                                                         transform.SetParent(_defaultParent) }, ignoreTimeScale))
  ```
  The overload `CollectMoney(money, Vector3 spawnPos, coinObjAmount, onCompleted)` first sets the coin spawn location (world position), and its final callback does not clear `_delayCallback`.
- `ShowUp()`: re-parent to the top singleton. `BackToParent()`: back to `_defaultParent`. ScoopGame uses both. `SetCurrentParent(t)`, `UpdateParent()` (re-cache `_defaultParent`).
- `ShowMoneyAddOn(value, duration)` calls `MoneyItem.Show(value, duration)`.
- `OnShow/OnHide`: instant CanvasGroup toggle.
- Known callers of CollectMoney: NotEnoughMoneyPopup (1000, 10 coins), RemoveAdsPackPopup, LoginTimeRewardPopup, PopupClickerComplete, CollectionCompletePopup, AutoSellPopup. Each passes its own amount.

### JobGame.CollectingCoin: coin-fly animation
Money instance config (all scenes): `_prefabType` = PoolType.Coin (5) → prefab `Coin` (99×95 coin image).
`_coinParent` = the Money object; `_spawnLocation` = `Money/SpawnPos` (Home: anchored (-363,-1369), roughly the screen centre relative to the top-right money box); `_endPosition` = `_coinLabel` = `Money/MoneyIconImage`.
`_duration` 1.0 (halved in Start, so **0.5 s**); spread `_minX/_maxX` = ±150 and `_minY/_maxY` = ±100.
(PopupDailyTask uses another instance with PoolType Star (105), spread ±50 and its own end target.)
```
Start: _defaultSpawnPosition = spawnLocation.position; _duration *= 0.5
CollectCoins(n, onCoinCollected):     (async)
  await until !_isCollecting; _isCollecting = true
  ResetCoins()  (destroy leftovers, _firstCoinMoved=false)
  await SpawnCoin(n, _spawnLocation.localPosition):
     for i in 0..n-1:
        coin = PoolManager.SpawnObject(Coin, zero, identity, parent=_coinParent); localScale=1
        coin.localPosition = (spawn.x + rand(minX,maxX), spawn.y + rand(minY,maxY), 0)
        task_i = coin.DOPunchPosition(punch=(0,30,1), duration=rand(0,0.3), vibrato 10, elasticity 1).SetEase(InOutElastic)
        await 0.005 s
     await all task_i
  await MoveCoinsTask(onCoinCollected):
     for each coin: start MoveCoinTask(coin); await 0.02 s      (stagger 20 ms)
     await all
  MoveCoinTask(coin):
     await coin.DOLocalMove(_endPosition.localPosition, _duration=0.5).SetEase(InBack)
     PlaySound(jelly_Coin)                    // one "coin" sfx per coin
     remove + Destroy(coin)
     ReactToCollectionCoin(): _coinLabel.DOPunchScale((0.5,0.5,0.5), 0.1, vibrato 10, elasticity 1).SetEase(InOutElastic)
     if !_firstCoinMoved: _firstCoinMoved = true; onCoinCollected()   // credit happens when the FIRST coin lands
  _isCollecting=false; _spawnLocation.position = _defaultSpawnPosition
```
So coins burst around SpawnPos, wobble up for 0-0.3 s, then fly one after another (0.02 s apart) into the coin icon with an InBack "wind-up" over 0.5 s.
When the first coin lands, the counter starts rolling up over 1 s. Each landing pops the icon. About 2 s after the first landing, `onCompleted` fires and the box returns to its parent.

### Home.MoneyItem ("+N" floating label under the box)
Fields: `_canvasGroup`, `_text`, `_rectTransform` (`Money/MoneyItem`, (31.6,-85), 165×68).
`Show(value, duration)`: `text = string.Format("{0}", value)` (callers pass the number, e.g. LuckyWheelPopup); `anchoredPos.y = -85`; `alpha = 1`; `DOAnchorPosY(-50, duration)`; `canvasGroup.DOFade(0, duration)`.

---------------------------------------------------------------------------------------------------

## 5. Save data model

### Mechanism (DataManager on `Master/DataManager`, DDOL)
- `SaveType = 0` → **PlayerPrefs** (port: localStorage). Type 1 would be files in `persistentDataPath/Save` XOR-"encrypted" with the device id; it is not used.
- `GameDatasList` (in order): LevelData, DataUser, Decor.DataDecor, DailyTask.DataDailyTask, LoginTimeReward.DataPlayTime, ScoopGame.DataScoopVisual, BlindBagCollection.BlindbagCollectionData, DreamHouse.DataDreamHouse, DataClicker.
- Key = `GameData.GetName()` = the component's type name (`GetType().Name` (inferred), e.g. `"DataUser"`). Value = JSON of its `dataSave` object (Unity JsonUtility-style; field names as below).
- `Initiate`: create the folder (file mode only). For each GameData: if `HasData()` (PlayerPrefs.HasKey) → `LoadData()` (plus `UpdateData()` if `HasUpdateData()`, which logs "{0} has Update!!"); else → `NewData()` (inferred order).
- Every setter on DataUser calls `SaveData()` immediately. `SaveDataToPlayerPrefs` does `SetString` and sets `_isPrefsDirty`.
  `Update()` flushes (`PlayerPrefs.Save`) every **30 s** (unscaled) when dirty. `SaveAllData()` runs on `OnApplicationPause` and `OnApplicationQuit` (saves all, then flushes).
  On web, writing localStorage directly on every save is equivalent.
- `DeleteSave()` = PlayerPrefs.DeleteAll.

### DataUser → `DataSaveUser` (key "DataUser"). Defaults set by `NewData()`
| field | type | default | notes |
|---|---|---|---|
| IsNoAd | bool | false | `SetNoAd()` sets true |
| HasSpecialPack | bool | false | `ClaimSpecialPack()` |
| StartTime / StartTimeString | DateTime / string | now / `now.ToString("o")` | `GetDaysPassed()` = whole days since (TryParseExact "o"), 1 on failure; `GetTimePlayed()` = days |
| CurrentLanguage | string | "" | |
| LocaleId | int | 0 | Get/SetLocaleId |
| IsVibrationOn | bool | **true** | HasVibration / SetVibration |
| IsMusicOn | bool | **true** | HasMusic / SetMusic |
| IsSoundOn | bool | **true** | HasSound / SetSound |
| IsRateUs | bool | false | |
| IsFirstLuckWheel | bool | **true** | |
| IsSelectedLanguage | bool | false | **reset to false in `OnApplicationQuit`**, then saved |
| IsFirstGame | bool | **true** | first-session flag (tutorials) |
| IsFirstClicker | bool | **true** | |
| ClickerRewardClaimCount | int | 0 | |
| IsUnlockedDailyTask / IsUnlockedDecor / IsUnlockedIdleChest / IsUnlockedDreamHouse | bool | false | feature unlocks (see GameConfig PlayCountUnlock*) |
| IsDoneTutorialCollection / IsDoneTutorialBlindBag | bool | false | |
| **Money** | int | **200** | |
| ClickerPlayTime / BlindbagPlayTime / ScoopPlayTime | int | 0 | play counters |
| ClaimedAchievement | List<int> | [] | AddClaimedAchievement |
| UnlockedClickerDecor / UnlockedClickerSwitch / UnlockedClickerBase / UnlockedClickerKeycap (obsolete) / UnlockedClickerKeychain | List<int> | [] | `UnlockX(id)` adds the id if missing and saves; `HasUnlockedX(id)` = Contains |
| OwnedGiftBox / OwnedCard | List<int> | [] | AddUnlockGiftBox / AddUnlockCard |
| Tracking | TrackingPlayTime {Spin:int} | {Spin:0} | |
| OpenAppTime | int | 0 | |
| Trading | TradingSaveData {DailyTickets:-1, BonusTickets:0, LastResetDate:"", TicketAdsWatchedToday:0, TradeCount:0, StealCount:0} | as shown | `LoadData` creates any missing lists / Trading object (migration) |

### Other GameData (owned by other areas; structure and defaults only)
- `LevelData` → `{currentLevel:0, highestLevel:0}` (`DataLevel`/`DataLevelSave`, `PassLevel`)
- `Decor.DataDecor` → `{CategoryDataList:[]}` (also provides the selected character/avatar, see GameSession)
- `DailyTask.DataDailyTask` → `{IsFirstTime:false, LastLoginDateString:"", CompletedTasks:[], InprogressTasks:[]}`
- `LoginTimeReward.DataPlayTime` → `{LastLoginDateString:"", AccumulatedSeconds:0, RewardClaimed:[]}`
- `ScoopGame.DataScoopVisual` → `{CategoryDataList:[]}`
- `BlindBagCollection.BlindbagCollectionData` → `{BoxsetDataSave:[]}`
- `DreamHouse.DataDreamHouse` → `{IsFirstTime:false, IsDoneTutorial:false, CurrentRoomIndex:0, UnlockedRooms:[], CurrentRoomSteps:{}, RoomSaved:[]}`
- `DataClicker` → `{_maxKeycapAmount:9, _latestIndexCreated:0, _savedKeycap:[]}`
- Legacy, unused classes: `UserData`/`UserSaveData` (IsNoAd, StartTime, Money, IsVibrationOn, IsMusicOn, IsSoundOn).
- Separate PlayerPrefs key: `"VibrationManager"` (int, default 1) is used only if `VibrationManager.IsPlayerPrefsSave` (false in the scene), so vibration lives in DataUser.

### GameSession (`Master/GameSession`, DDOL runtime state, not saved)
`SceneLoadFromLoading = true`, `AnimNeedToCast = 99`, `BackFromGameMode = 0`, `CanShowSpecial` (set true in Start and on every FlashIn to Home), `IsPlayAGame`, `InterShownCount`, `ScoopOrderId`, `PopupRemoveAdShown`, `Avatar`/`OrderAvatar` sprites.
- `Start`: `UpdateAvatar()` (Avatar = DataDecor selected option of category index 0 → option sprite), then `GenCharacter()`:
  destroy the old character and instantiate the selected "CharacterChanger" option prefab under `CharacterContainer`; localPosition 0, scale 0 → `DOScale(1, 0.36)` OutBack.
  Then `SetActiveCharacter(false)`.
- `SetActiveCharacter(bool)` / `SetActiveCharacter(scaleMul, yOffset)`: show the character, restore the initial scale × mul, and offset Y. Home/other areas own the details.

### GameConfig statics (global constants)
PanelHidePosX 1300, DefaultDuration 0.36, **SpawnCommentTimer 0.8**, DistanceComment 200, TimeToFreeLuckyWheel 5, BonusTime 5, MoveSpeed 10,
InGameMissionReward 1900, BonusMoneyReward 3000, DefaultMoneyReward 300, **MinViewers 5000, MaxViewers 22000**,
PlayCountUnlock: Decor 0, DreamHouse 1, DumplingBlindBox 2, LuckyScoop 3, IdleChest 4, BlindBag 5, DailyTask 7, PartTime 8,
BlinkInterval 0.3, MinStartIconAnim 2, MaxStartIconAnim 6, XpToNextLevel 25, MoneyRightCharm 500, MoneyWrongCharm 300, MoneySuppriseOrder 500, MinimumTip 100,
QuestId_BuyNewSkin 0, Collect200Coin 1, Collect500Coin 2, Play10Minutes 3, BuyDecor 4, Collect1000Coin 5, Play12Minutes 6, MaxKeycapAmount 12.

---------------------------------------------------------------------------------------------------

## 6. Audio (Framework.AudioManager on `Master/AudioManager`, DDOL; static `_instance`)

- Clips: `_musicClipList` = [bgm_home_1, bgm_home_2, bgm_home_3, bgm_ingame_1]; `_soundClipList` = 61 clips (see `S/out/audio/*.mp3`).
- **Mapping:** `GetSoundAudioClip(key)` = the first clip whose `name == key.ToString()` (same for music with EMusic).
  So every ESound plays the file with the identical name. ESound `Spinning_Wheel` (8) has no clip and is silent.
  The clips collect_dollar, happy, foot_step, open_door, wow are never referenced.
- Channels: object pools of MusicChannel/SoundChannel prefabs (default capacity 10, max 20). Each channel is one AudioSource.
- `PlaySound(key, volume=1, delay=0, isLoop=false, isSetTimeStop=false, timeStop=0)`:
  if `!DataUser.HasSound()` → return null. Otherwise take a free channel, then either `Play` (clip, volume, `loop=false`, `PlayDelayed(delay)`, auto-release when the clip ends) or `PlayLoop` (loop=true; with isSetTimeStop it stops after timeStop).
  `StopSound/PauseSound/ResumeSound(key)` act on every channel playing that key. `IsSoundPlaying(key)`. `StopAllSound()`.
- `AudioHelper`: static wrappers. `PlaySound(...)`, `PlayClickSound()` (= PlaySound(click,1) if sound is on), `PlayRandomSound(ESound[])` (random element), `PlaySoundIfNotPlaying(key)`.
- `PlayMusic(key, volume)`: if `!DataUser.HasMusic()` → null. Otherwise `StopAllMusic()`, take a free channel, then `Play(clip, volume)` with **loop=true** and `PlayDelayed(0)`. `CurrentMusicKey` = the key of the playing channel.
- `GetRandomHomeBGM()` = random of [bgm_home_1, bgm_home_2, bgm_home_3].
  `PlayMusicIfNotPlaying(vol)`: `pick = random home BGM; if CurrentMusicKey == pick return; else StopAllMusic; PlayMusic(pick, vol)`.
  This is a literal check, so returning Home often switches to another random home track.
- `SetVolumeMusic(v)`: set the volume of the playing music channel. `set_IsMuteMusic/IsMuteSound`: `AudioSource.mute` on all channels.

Music per scene (callers):
| scene | call | result |
|---|---|---|
| Home (`ScreenHome.OnShowPopupPart1`) | `PlayMusicIfNotPlaying(1.0)` | random bgm_home_1..3, loop |
| Settings toggle (`SettingButton.SetData`) | music on → `PlayMusicIfNotPlaying(1)`; off → `StopAllMusic()` | |
| ModeClicker (`AutoSceneClicker.Start`) | `StopAllMusic(); PlayMusic(bgm_ingame_1, 1.0)` | |
| BlindbagMinigame (`Blindbag.DoorScreen.OnShow`) | `PlayMusic(bgm_ingame_1, 1.0)` | |
| BlindBagCollection, ScoopGame (`Controller.Start`) | `SetVolumeMusic(0.4)` | the home track keeps playing at 40% |
| DreamHouse, Loading | no call | (Loading is silent; DreamHouse keeps the current track) |

Notable SFX in this area: `click` (1) on buttons; `comment` (2) at volume 0.5 for each spawned live comment when `_playSoundSpawn`; `jelly_Coin` (6) for each coin landing.

### Framework.VibrationManager
`Haptic(EHapticType)` reads only `IsVibrationOn` (DataUser.IsVibrationOn). The native call is compiled out, so it **does nothing**.
Port: either a no-op or `navigator.vibrate(10-20ms)` when on (optional). EHapticType: Selection, Success, Warning, Failure, LightImpact, MediumImpact, HeavyImpact, RigidImpact, SoftImpact, None. It is called from 22 places.

---------------------------------------------------------------------------------------------------

## 7. Livestream comment and viewer system

### Assets
- `CommentAsset` (ScriptableObject): `rawText` (lines), `ChatContents` (list of lines). `PickRandomLiveComment()` = `Localize(random(ChatContents))`.
  `GetStartLiveMessage()` (editor) splits rawText on newlines into ChatContents.
  Pools (full text in `S/out/data/so.json`):
  - `sharedassets0.assets:14494` **CommentAsset_Intro**: 166 lines ("Hiii everybody!", "Hello hello!", …). Used by the Home intro popups (PopupPrepare, PopupIntroBlindBag, PopupIntroScoop).
  - `sharedassets2.assets:117` **CommentAsset_3D_printer**: 152 lines. Used by ModeClicker `IngameClickerScreen/Printer3D-UIContent/Panel/CommentHandler`.
  - `sharedassets2.assets:118` **CommentAsset_Clicker_live**: 160 lines. Used by ModeClicker `ScreenClickerLivestream`, BlindBagCollection `ScreenInGame/CommentChat`, ScoopGame `ScreenInGame/CommentChat`.
  - `sharedassets6.assets:165/166` Negative/PositiveCompliment (10 lines each): ScoopGame order feedback (other area).
- `ViewerAvatarAsset` `sharedassets1.assets:848`: 13 avatar sprites. `PickRandom()` = uniform.
- `ViewerNameAsset` `sharedassets0.assets:14495`: 1000 names, split on ','. `PickRandomContent()`. It is not used by CommentHandler, since comments show no names.
- `CommentConfig {IsViewer, Id(long), Content}`. `ECommentType {None, Donate}`.

### CommentHandler (per screen)
Serialized (all instances): `IsEnableToSpawnComment=false` (the owning screen turns it on/off; e.g. PopupPrepare sets it false on Play/Back), `_distanceComment=10`,
`_prefabComment` = `sharedassets1.assets:812` "Comment" prefab, `_prefabDonateComment` = `:818` "CommentDonate", `_commentParent` (the chat area RectTransform), `_isRandomTimerComment=false`,
`_playSoundSpawn` (true on Home intro popups, false in game scenes), `_viewerAvatarAsset`, `_maxChatShowing` (4 on Home popups, 3 in game scenes).
Runtime: `CommentStringIdQueue` (FIFO), `_targetTime=0`, `_latestAvatar`.
- `OnEnable`: create/clear the queue.
- `Update`:
  ```
  if IsEnableToSpawnComment && Time.time > _targetTime:
     _targetTime = Time.time + (_isRandomTimerComment ? Random(0.8, 1.6) : 0.8)     // GameConfig.SpawnCommentTimer
     SpawnCommentLive()
     queue.Enqueue({IsViewer:true, Id:0, Content: asset.PickRandomLiveComment()})
  ```
  The queue lags by one, so the first tick shows nothing (unless the user typed) and every later tick shows the comment queued on the previous tick. Result: **one comment every 0.8 s**.
- `SpawnCommentLive()`: `if queue.Count>0: if _playSoundSpawn: PlaySound(comment, 0.5); c = queue.Dequeue(); Comment(c.Content, c.IsViewer)`.
- `UserComment(text)`: `queue.Enqueue({IsViewer:false, Content:text})`, so the player's message appears on the next tick. ChatInput and the Home intro popups call it.
- `Comment(content, isViewer)`:
  ```
  go = PoolManager.SpawnObject(_prefabComment, zero, identity, _commentParent); cc = go.CommentControl; rect = go.RectTransform
  cc.Appear(); cc.SetText(Localize(content)); cc.text.enableAutoSizing = !isViewer
  avatar = _viewerAvatarAsset.PickRandom()  (re-picked if equal to _latestAvatar; _latestAvatar = avatar)
  cc.Init(avatar); cc.SetLayoutType(isViewer)
  rect.DOKill(); rect.localScale = (1.3,1.3,1.3); rect.localPosition = (60, _distanceComment=10, 0)
  rect.DOAnchorPosY(_maxChatShowing*100, _maxChatShowing*0.6).SetEase(Linear).OnComplete(
      rect.DOAnchorPosY((_maxChatShowing+1)*100, 0.6).SetEase(Linear)
      cc.AnimFadeOut(() => cc.DespawnSelf()))
  ```
  Each bubble rises from y=10 to y=400 over 2.4 s (Home, max 4) or to y=300 over 1.8 s (game scenes, max 3), about 162 px/s.
  It then rises 100 px more while fading out over 0.3 s, then returns to the pool. With a 0.8 s spawn interval, about 3-4 bubbles are visible at once, stacked ~130 px apart.
- Unused entry points: `StartComment()` ("Welcome !" streamer bubble), `SpawnCommentLive(long,…)` and `SpawnDonateComment(sprite, scale)` (6 s rise to y=1000). `Refresh()` resets `_commentCount`. `ClearComment()` is empty.

### CommentControl (on the comment prefabs, PoolElement)
"Comment" prefab: `timeAnim 0.3`, `widthMaxScaleText 460`, `widthScaleText 40`, `_layoutImage` / `_layoutBG` (bubble images), `text_meshPro`, `img_avatar`, `_localScale` (inner pop-in transform), `_viewerRectSprite` = `_streamerRectSprite` = `sharedassets1.assets:705` (same sprite, so layout type makes no visual difference).
- `Appear()`: alpha 1 (instant) on text, layoutImage, layoutBG, avatar.
- `Init(avatar)`: `img_avatar.overrideSprite = avatar`; `_localScale.localScale = 0`; wait one frame; `_localScale.DOScale(1, 0.2)` OutBack (the bubble pops in).
- `SetText(t)`: `text = t`; `layout_txt.sizeDelta.x = min(t.Length * 40, 460)` (Utilities.WidthTextCalculator; bubble width grows by 40 px per character up to 460).
- `SetLayoutType(isViewer)`: `_layoutImage.sprite = isViewer ? _viewerRectSprite : _streamerRectSprite`.
- `AnimFadeOut(cb)`: fade text, layoutImage, layoutBG, avatar → 0 over 0.3 s; OnComplete `cb`.
- `OnMoveUp(cb)` (unused): DOAnchorPosY(+140, timeAnim). `OnDespawn` (unused): fade 0 over timeAnim. `OnDespawned`: kill the tween.

### Livestream.LivestreamPanel (viewer counter, `…/TopLeftUI/LivePanel` or `…/Header/LivePanel`)
- `OnShow()`: `_currentView = Random.Range(5000, 22000)` (int, max exclusive); `text = _currentView.ToString()` (no separators); start the `UpdateView` coroutine.
- `UpdateView`: loop { `OnUpdateView()`; wait `Random.Range(1f, 2f)` s }.
- `OnUpdateView()`: `prev=_currentView; _currentView += Random.Range(-500, 500)` (no clamp); `_viewTween = DOTween.To(prev→_currentView, 1.0 s)` writes the int text every update; OnComplete sets the final text.
- `OnHide()`: kill the tween and stop coroutines. `Initialized()` is empty. Callers: IngameClickerScreen, ScreenClickerLivestream, LivestreamCharmScreen, BlindbagGameScreen, ScoopGame ScreenInGame, Home PopupPrepare/IntroBlindbag/IntroScoop.

### Livestream.ChatInput
`_inputField` (TMP_InputField), `_commentHandler`. `OnInit()` adds a listener on the input's submit/end-edit event (inferred: onSubmit) that calls `_commentHandler.UserComment(text)` and then sets `inputField.text = ""`.

### Livestream.DonatePanel / ItemGift (not present in any scene; not wired)
- DonatePanel: `OnInit` picks a random avatar and sets scale 0. `OnShow`: `DOScale(1, 0.35)` OutBack, auto-hide after 5.5 s (`DelayedCall`), shiny effect loop 1 s.
  Claim: `PlaySound(click)`, `_money.CollectMoney(1000, 10)`, hide. `OnHide`: `DOScale(0, 0.35)` and stop the shine. Implement only if another area spawns it.
- ItemGift (pool type 8 prefab "ItemGift"): `SetIcon(sprite)`; `StartShowEffect()`: scale 1, then `DOPunchScale(0.1, 0.2, vibrato 10, elasticity 1)`.

---------------------------------------------------------------------------------------------------

## 8. Pooling and small utilities

### PoolManager (`Master/PoolManager`, PathologicalGames SpawnPools `PoolDestroy` / `PoolDdt` (DontDestroy))
`poolAsset` = `PoolConfigs` (`sharedassets0.assets:14499`): PoolType → prefab:
Coin(5)→`Coin`, CategoryItem(6)→`CategoryItem_new`, OptionItem(7)→`OptionItem_1`, ItemGift(8)→`ItemGift`, LanguageItem(9)→`LanguageItem`, Star(105)→`Star` (46×45),
ScoopStar(106), YellowBall(107), Compliment(108), ScoopCategoryItem(12), ScoopOptionItem(13), GlowSprite(1000)→`Glow Light 2D`.
- `SpawnObject(PoolType, pos, rot, parent)` = `SpawnObject(poolAsset.GetPoolElement(type), …)`. `SpawnObject(prefab, pos, rot, parent)` spawns from `poolDestroy` (a null prefab logs an error) and `AssignPool` sets `PoolElement.pool`.
- `DespawnObject(t)`: if `t` is spawned in the pool → Despawn; else Destroy. `DeSpawnAll()`. `SpawnDontDestroy(prefab)` uses the DDOL pool.
- Port: a simple per-prefab free list. On spawn: re-parent, reset transform, activate. On despawn: deactivate.

`PoolElement`: `DespawnSelf()` (despawn now), `DespawnSelf(delay)` (DelayedCall), `SetPosition/Rotation/Scale/EulerAngles`. `AutoDespawn : PoolElement`: `OnEnable` → `DespawnSelf(timeLife)`.

### EventDispatcher
A singleton `Dictionary<EventID, Action<object>>` with Register/Post/Remove/Clear. `EventID` = {None 0, RefeshTopping 1}.
**No code outside EventDispatcher/EventDispatcherExtension calls it, so nothing fires or listens.** It can be omitted.

### Others
- `Define`: `DEFAULT = "Default"`, `UI = "UI"` (sorting layer names).
- `Common`: Log/Warning/Assert wrappers (no gameplay).
- `Helper`: `GetWorldMousePosition2D()`, `IsPointerOverUIElement()` (EventSystem raycast; used to ignore world taps through UI).
- `Utilities.WidthTextCalculator(rect, text, perChar, max)`: `rect.sizeDelta.x = min(text.Length*perChar, max)`.
- `TimeUtilities.ConvertTimeString(s)` = `DateTime.Parse(s)`.
- `Scroller`: UV scroll; each frame `uvRect.x += _x*dt`, `uvRect.y += _y*dt` (RawImage) or the material mainTextureOffset (Image). The loading-bar instance (x=-0.2) is inactive.
- `TextAnim`: cycles `_contents[i]` into its TMP every `_timeInterval` s, looping. `SpawnInCircle.Spawn()`: places `tfList[i]` on a circle of `radius` at angle 2π·i/n (editor helper). Neither is placed in any scene.
- `LocalizeText` (`_txtLocalize`, `_hasCustomKey`, `_key`): OnEnable sets the text to `Localize(_hasCustomKey ? _key : currentText)`. **English only: leave the authored text as is.** `LocalizationManager.Localize(x)` returns the English string for English keys, which are the English sentences themselves; use identity.
- `GameController`: an empty MonoSingleton. `BaseScene`: Escape → Quit (Android), and `LoadSettingsScene()` (unused).
- `TextLoadingAnimation` / `CharmRandomLoading`: their objects are inactive (or have no sprites) in every scene and nothing outside them calls them, so skip both.

---------------------------------------------------------------------------------------------------

## 9. Tutorial / first-time behaviour (core-level)
- First launch: no saves → `NewData()` for every GameData. Money 200, music/sound/vibration on, `IsFirstGame = IsFirstClicker = IsFirstLuckWheel = true`, all unlock and tutorial flags false.
  Other areas read these flags to run their tutorials.
- `IsSelectedLanguage` is cleared on every quit (the language picker logic belongs to Home; English-only port can ignore it).
- `GameSession.CanShowSpecial = true` at start and on every return to Home (it gates a "special offer" popup on Home; ads/IAP, so it can be ignored).

---------------------------------------------------------------------------------------------------

## 10. Implementation checklist
1. Persistent singletons created once: DataManager (localStorage, key = type name, JSON of dataSave, NewData defaults above), AudioManager, PoolManager, GameSession, and the SimpleSceneTransition overlay that survives scene loads.
2. Loading scene: stars pulse 1.3↔1.0 (0.5 s InOutQuad yoyo, delays 0-0.4), logo 1↔0.95 (1 s OutQuad yoyo), penguin Spine `loading` loop. Wait 1 s, then fill the bar 0→1 and "Loading N%" 0→100 linearly over 10 s, then switch to Home with no fade.
3. Scene change = `FlashIn(scene)`: white overlay fades in over 0.5 s and blocks input, penguin fades in over 0.5 s, LOADING keycaps fade in (0.2 s after a 0.3 s delay) with the typing wave (0.2 s InQuad down to -31, 0.2 s OutQuad up to -15 per letter, looping).
   After ≥1 s and the scene being ready, swap the scene. The new scene calls `FadeOut()` (all fade out over 0.5 s, then the input block is removed) or `ForceFadeOut()` (instant). `Transition(cb)` = flash in, cb, fade out.
4. UIBase show/hide = instant CanvasGroup alpha and raycast toggle. Popups scale their panel 0→1 with OutBack (0.3/0.35/0.36/0.5 s per the table). NotEnoughMoney gives free +1000 (10 coins). BackHome confirms with FlashIn(Home).
5. Money: `UpdateMoney(delta)` clamps at ≥0, rolls the "N0" counter over 1 s, saves immediately, fires OnMoneyChanged, and progresses the daily-task coin quests (ids 1, 2, 5) for positive deltas.
   `CollectMoney(amount, n, cb)`: spawn n coins at SpawnPos ±150/±100 with a punch wobble, fly each to the coin icon (0.5 s InBack, 0.02 s stagger), `jelly_Coin` sfx and icon punch per coin, credit when the first coin lands, cb after 2 s.
6. MoneyItem "+N": y -85→-50 and fade 1→0 over `duration`.
7. Audio: play the clip named exactly like the ESound/EMusic enum. SFX only if sound is on, music only if music is on.
   Music loops. Home = random of 3 home BGMs. Clicker/Blindbag = bgm_ingame_1. Collection/Scoop = current music at 0.4. Vibration = no-op.
8. Comments: while enabled, every 0.8 s show the queued comment (random line from the screen's CommentAsset) and queue another.
   Each bubble: avatar random (not the same as the last), width = min(len*40, 460), pop-in scale 0→1 over 0.2 s OutBack, start at (60,10) with scale 1.3, rise linearly to max·100 over max·0.6 s, then rise 100 more over 0.6 s while fading out over 0.3 s, then despawn.
   `comment` sfx at 0.5 only on Home intro popups. Typed chat → `UserComment` (shown on the next tick).
9. Viewer counter: random 5000-21999, then every 1-2 s change by a random amount in [-500, 499], tweened over 1 s, shown as a plain integer.
10. Skip: ads, IAP, consent, NoInternet, SceneLoader, EventDispatcher, TextLoadingAnimation, CharmRandomLoading, DonatePanel (unless used elsewhere), Scroller on the loading bar.
