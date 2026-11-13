# Home scene (level1 "Home") + meta features — implementation spec

Sources: `dis/*.s` (ScreenHome, HomeButton, Home.*, Decor.*, DailyLoginPopup, DailyReward.*, DailyMission.*, DailyTask.*,
LoginTimeReward.*, LuckyWheel*, GiftBoxLuckyWheel, Profile*, PopupRename, Setting*, PlayTimeTracker, PlayDayTracker,
Character.*, GameConfig), `dump/level0.txt`, `dump/level1.txt`, `out/data/level1.json`, `out/data/so.json`.
"(inferred)" = not proven by code/data. Ads (ShowInter / ShowRewarded / ShowCollap / ShowMREC) are skipped:
**a rewarded-ad button = give the reward immediately; an interstitial before an action = just do the action.**

Ease ids: InBack 26 (0x1a), OutBack 27 (0x1b), InOutSine 4, OutBounce... ESound ids from `enums.json`:
1 click, 3 complete, 4 home_touch_pet, 44 sfx_coin_dropping, 46 sfx_open_giftbox, 47 sfx_purchase_coin,
49 sfx_wheel_spinning, 50 sfx_win_prize. "Haptic(4)" = light vibration; "Vibrate(100)" = 100 ms vibration.

---------------------------------------------------------------------------------------------------------------------
## 1. Overview / flow

### 1.1 What is on screen
* **World (sprites, world space)** — `HomeController/Env` (level1):
  * `Wall` (0,1.6) SR, sorting 0 — wallpaper, driven by Decor category "BackgroundChanger" (sprites R1..R4).
  * `Table` (0,-2.92) SR sorting 3 — table, Decor "TableChanger" (table_1..table_4). `FullWidthSprite` stretches it.
  * `Table`(SortingGroup o4) (0,-2.32) / `Accessory` (-0.3,1.0) SR `decor` o1 — static decoration (no Decor category drives
    the AccessoryChanger in the shipped DecorAsset → stays as authored).
  * `Table/Pet` (2.95,2.9) Spine SkeletonAnimation + BoxCollider2D 3.29x3.32 + `Home.PetChanger` + `Home.BoxTrigger(Name=Pet 0)`
    + `Decor.PetChanger` — the tappable pet.
  * `luckywheel` (1.55,-1.8) SR + Spine "Jelly_luckywheel" + BoxCollider2D 2.39x3.03 + BoxTrigger(Name=LuckyWheel 1) +
    WorldButton + LuckyWheelButton (handtap child, notification parts "6","7"). **WorldButton.onClick has no listeners in the
    build → tapping the world wheel does nothing (inferred).** The UI "Lucky Spin" button opens the wheel.
  * `BlindbagDecor` (SortingGroup o4)/`Accessory` sprite `decor_blindbag` — alternative decoration, swapped in by
    `HomeController.ShowBlindbagDecor(true)` (no caller found; keep hidden by default (inferred: it is active in scene, but
    `_decorGo` is the shown one; implement `ShowBlindbagDecor(false)` at start)).
  * `WorldBlock` (0,0) SR `Square` o23 — full-screen blocker sprite (SetActiveWorldBlock), normally as authored.
* **Character** — lives in level0 DDOL `Master/GameSession/CharacterContainer` at local (0,-1.5), BoxCollider2D +
  `Home.BoxTrigger(Name=Character 2)` + `Decor.CharacterChanger`; the character prefab (Character_* from sharedassets0) is
  instantiated in it by `GameSession.GenCharacter` from the selected Decor "CharacterChanger" option. Spine idle anim "idle" loop.
  `HomeController.Start`: CharacterContainer.localY = -1.5.
* **UI** — `UIManager/Screen/Sceen Home Clone` (ScreenHome): Header (ProfilePanel + Money box), Body buttons, `Panel Decor`.
  Popups under `UIManager/Popup/*` (all present in the scene, shown/hidden through UIManager).

### 1.2 Home buttons (`Sceen Home Clone/Body/*`) — what each does
| GameObject | field | Click handler | Result |
|---|---|---|---|
| `Button Live` (txt "Start Live") | _liveButton | OnLiveButtonClicked | sound click(1); OnHideButtons(0.5); ShowPopup **PopupPrepare** ("Start DIY") |
| `Blindbag` | _blindbagButton | lambda b__1 | click sound; HidePanel(virtual)…; OnHideButtons(0.5); ShowPopup **PopupIntroBlindbag** |
| `ScoopButton` ("Lucky Scoop") | _scoopButton | lambda b__2 | click; OnHideButtons(0.5); ShowPopup **PopupIntroScoop** |
| `CollectionClickerButon` | _collectionClickerButton | OnCollectionClickerButtonClicked | click; GameSession.SetActiveCharacter(false); ShowScreen **ScreenClickerCollection** (keycap shelf in same scene, `CollectionClicker/Collection`) |
| `DreamhouseButton` | _dreamHouseButton | OnDreamhouseButtonClicked | click; SetActiveCharacter(false); SimpleSceneTransition.FlashIn(GameConfig.DreamHouseScene) → loads **DreamHouse (level5)** |
| `DecorButton` | _decorButton | OnDecorButtonClicked | click; ShowDecor() = DecorPanel.OnShow + OnHideButtons(0.5); Money box `DOAnchorPosX(-50, 0.5)` ease InBack delay 0.3 |
| `DailyButton` ("Daily Login") | _dailyButton | OnDailyButtonClicked | click; ShowPopup **DailyLoginPopup**, `.ShowTutorial(false)` (hand off, close buttons on) |
| `DailyTaskButton` | _dailyTaskButton | OnDailyTaskButtonClicked | click; ShowPopup **PopupDailyTask** |
| `IdleChest-LoginTime` ("Online Rewards") | _loginTimeButton | OnLoginTimeButtonClicked | click; ShowPopup **LoginTimeRewardPopup** |
| `LuckyWheelButton` ("Lucky Spin") | _luckyWheelUIButton | OnLuckyWheelButtonClicked | click; ShowPopup **LuckyWheelPopup** |
| `SettingButton` | _settingButton | lambda b__0 | PlayClickSound; ShowPopup **ProfilePopup** (settings + language) |
| `RemoveAdButton` (inactive) | _removeAdButton | OnRemoveAdClick | click sound only (IAP – skip) |
| Header `Panel Profile/Panel/Name Field` | ProfilePanel._changeNameButton | ProfilePanel b__10_0 | click; ShowPopup **PopupRename** |
`_tradingButton` = null in scene (Trading feature disabled). `-Scoop` (inactive), `-PhoneRing` (inactive) unused.
Every button is a `HomeButton`: OnInit caches RectTransform + parent and hides `_handTutorial`; Button.onClick → HomeButton.onClick
UnityEvent → ScreenHome handler. All click sounds: `PlaySound(click=1, vol 1)`.

### 1.3 Scene entries/exits
* Enter Home: (from Loading or back from a mode). ScreenHome.OnShow → `OnShowPopupPart1`, `OnShowPopupPart2`, `CheckShowIntroModeInstead`.
* `CheckShowIntroModeInstead`: reads `GameSession.BackFromGameMode` (GameModeEnum: 0 None,1 Clicker,2 BlindBag,3 Scoop), resets it to 0:
  * 1 (back from Clicker/ModeClicker): OnHideButtons(0.5); ShowPopup PopupPrepare; then GetPopup<?>(b78) → SetAsLastSibling
    (some other popup brought to front — unidentified generic, (inferred) a reward/level popup; safe to ignore).
  * 2 (back from BlindbagMinigame): OnHideButtons(0.5); ShowPopup PopupIntroBlindbag.
  * 3 (back from ScoopGame): OnHideButtons(0.5); ShowPopup PopupIntroScoop.
  → i.e. returning from a mode lands on that mode's intro popup, not the bare home.
* Scenes loaded from Home: ModeClicker (level2) via PopupPrepare; BlindbagMinigame (level3) via PopupIntroBlindbag or
  PopupCollectionBlindbag; ScoopGame (level6) via PopupIntroScoop; DreamHouse (level5) via Dreamhouse button.
  Transition = `SimpleSceneTransition.FlashIn(sceneName)` (flash/fade, owned by framework).
  Scene paths (GameConfig .cctor): Home `Assets/_Game/Scenes/Home.unity`, DreamHouse, BlindbagMinigame, BlindBagCollection,
  ModeClicker, ScoopGame.

---------------------------------------------------------------------------------------------------------------------
## 2. Classes

### 2.1 ScreenHome (`UIManager/Screen/Sceen Home Clone`, ScreenBase)
Fields → objects: _settingButton=Body/SettingButton, _liveButton=Body/Button Live, _decorButton, _dailyButton, _dailyTaskButton,
_loginTimeButton=Body/IdleChest-LoginTime, _luckyWheelUIButton, _removeAdButton, _dreamHouseButton, _collectionClickerButton,
_scoopButton(+_scoopButtonRect), _blindbagButton(+_blindbagButtonRect), _tradingButton=null, _decorPanel=Panel Decor,
_profilePanel=Header/Panel Profile, _homeController=HomeController, _moneyRect=Header/Money.
`_goPhone`, `_goBlockScreen`, `_goScaleTutorialCollection` are not in the export (inferred: `Body/PhoneRing`, `Body/BlockScreen`,
`Body/CollectionClickerButon/ScaleTutorial`). `_countdownTutorialLive` (Games.CountdownTimer) never started.

**OnInit(uiManager)**: LocalizationManager.Read; ProfilePanel.OnInit; DecorPanel.OnInit(this); DecorPanel.OnHidePanel += OnHideDecorPanel;
HomeButton.OnInit for all buttons; BlockScreen.SetActive(false); **OnHideButtons(0)** (snap all off-screen); wire listeners (table above);
SimpleSceneTransition.FadeOut (or ForceFadeOut on first load).

**OnShowPopupPart1**:
```
BlockScreen.SetActive(false); ScaleTutorialCollection.SetActive(false)
ProfilePanel.UpdateAvatar/UpdateLevel/UpdateName/UpdateProgress; DOVirtual.DelayedCall(0.1, ProfilePanel.UpdateLevel)
MoneyManager.RefreshMoney(); DailyLoginPopup.CheckNotification(); AudioManager.PlayMusicIfNotPlaying()
if DataUser.IsFirstGame:                      // very first session: only "Start Live" is offered
    liveButton.OnChangeAnchorPositionY(delay 0, dur 0.5, y 425, OutBack)
    BlockScreen.SetActive(true)              // blocks every other button
elif DataUser.IsDoneTutorialCollection:
    OnShowButtons(0.5)
else:                                        // collection tutorial pending
    collectionButton.OnChangeAnchorPositionX(delay 0.35, dur 0.5, x -120, OutBack)
    BlockScreen.SetActive(true); ScaleTutorialCollection.SetActive(true)   // pulsing icon (DOTweenAnimation in scene)
```
(IsFirstGame / IsDoneTutorialCollection are written by the Clicker / Collection code, not here.)

**OnShowPopupPart2**: CheckLocalize(); PlayerPrefs "ReturnHomeCount" += 1; ShowButtonStartLive(true) (Button Live active).

**CheckLocalize**: if DataUser.CurrentLanguage.Trim()=="" → LocalizationManager.Language="English",
DataUser.CurrentLanguage = that, ShowPopup **PopupLanguage** (first-launch language picker); else Language = saved value.

**OnShowButtons(d)** — all tweens `DOAnchorPos*` duration d, ease OutBack(27), delay 0.35 (except Profile/Decor delay 0):
ProfilePanel Y→-60; Decor X→-120; Daily X→120; Setting X→-88; DailyTask X→120; LoginTime X→120; RemoveAd X→-36;
LuckyWheel X→-120; DreamHouse X→120; Collection X→-120; Blindbag rect X→-120; Scoop rect X→-120; (Trading X→-120);
Live button Y→425.
**OnHideButtons(d)** — ease InBack(26), delay 0.35 if d>0 else 0: Profile Y→400; Decor X→250; Daily X→-250; Setting X→250;
Live Y→-400; RemoveAd X→250; DailyTask X→-250; LoginTime X→-250; LuckyWheel X→250; DreamHouse X→-250; Collection X→250;
Blindbag X→250; Scoop X→250. (Left column anchored left: daily/dailyTask/loginTime/dreamhouse; the rest anchored right.)
HidePanel()=OnHideButtons(0.5), ShowPanel()=OnShowButtons(0.5).
**OnHideDecorPanel(d)** (DecorPanel closed): moneyRect DOAnchorPosX(-168,d) OutBack; OnShowButtons(0.5); GameSession.UpdateAvatar;
ProfilePanel refresh. **MoveMoneyLeft()**: moneyRect DOKill; DOAnchorPosX(-168, …).
OnHide → ProfilePanel.OnHide. SetActiveButtonDailyTask(b) toggles that button GO.
PlayerPrefs keys: `ReturnHomeCount` (int), `RateUsShown` (bool; unused here).

### 2.2 HomeButton
OnChangeAnchorPositionX/Y(delay, duration, pos, ease, onCompleted): `_rect.DOKill(); _rect.DOAnchorPosX/Y(pos, duration).SetDelay(delay).SetEase(ease).OnComplete(onCompleted)`.
SetActiveHandTutorial(v) → `_handTutorial.SetActive(v)`. SetActiveStatus / AnimUnlockPhase1/2 are empty (no lock system active).

### 2.3 Home.HomeController (`HomeController`)
* Start: register on ScreenHome.DecorPanel.OnShowPanel/OnHidePanel; CharacterContainer.localY=-1.5.
* **OnShowDecorPanelHandler(d)**: Env.DOLocalMoveY(1.0, d); CharacterContainer.DOLocalMoveY(-0.5, d)  (scene slides up to make room).
* **OnHideDecorPanelHandler(d)**: Env.DOLocalMoveY(0, d); CharacterContainer.DOLocalMoveY(-1.5, d). (d = 0.36 from DecorPanel.)
* **Update (world tap)**: if pointer pressed this frame and not over UI: ray = Camera.main.ScreenToWorldPoint(pointer);
  Physics2D.Raycast(pt, dir, 100); if hit collider has BoxTrigger → `boxTrigger.OnMouseButtonDown()` → `OnPressed?.Invoke(Name)`.
* ShowBlindbagDecor(show): BlindbagDecor.SetActive(show); Decor(Table group).SetActive(!show); when showing remember and hide
  luckywheel GO, when hiding restore it. SetActiveWorldBlock(v)→WorldBlock; SetActiveDecor(v)→Table group; SetActiveLuckWheel = no-op.

### 2.4 Home.BoxTrigger / Home.WorldButton / Home.LuckyWheelButton / Home.MoneyItem / Home.BonusController
* BoxTrigger: `Name` (EntityName Pet 0, LuckyWheel 1, Character 2), `OnPressed(UnityAction<EntityName>)`, EnableBoxCollider(b).
* WorldButton: subscribes BoxTrigger.OnPressed → onClick.Invoke() (no listeners in build).
* LuckyWheelButton: SetActiveTutorial(v) → handtap GO; SetActiveNotification(v) → GOs "6","7" of the wheel spine. No callers found.
* **MoneyItem** (`Header/Money/MoneyItem`, "+" text): `Show(value, dur)`: text = value ("{0}", prefixed by "+" child text);
  anchoredY = -85; alpha 1; DOAnchorPosY(-50, dur); canvasGroup.DOFade(0, dur). Used by lucky-wheel coin box.
* BonusController (DDOL): StartCountdown(min) → coroutine counts min*60 s, fires OnTimeRemainingChanged(min,sec) and OnTimeUp. **No caller → unused.**

### 2.5 Pet — Home.PetChanger (+ Decor.PetChanger, Home.PetHomeAsset)
Data `ConfigPetHome` (so 14402): Id0 "Penguin Blue" skin `blue` idle `idle` touch `on_click_blue`; Id1 "Bear" skin `default`
touch `on_click`; Id2 "Cat" skin default touch `on_click`; Id3 "Penguin Pink" skin `pink` touch `on_click_pink`.
(Penguin blue/pink share one SkeletonData; Bear and Cat each have their own.)
* OnEnable: subscribe BoxTrigger.OnPressed; DelayedCall(0.1) → AnimationState.Complete += OnCompletedAnimation.
* **OnPressed**: PlaySound(home_touch_pet=4); BoxTrigger collider disabled; AnimationState.SetAnimation(0, data.TouchAnimation, loop=false).
* OnCompletedAnimation: SetAnimation(0, data.IdleAnimation, loop=true); collider enabled again.
* SetAnimation(code, loop): transform.DOKill; localScale = 0 (inferred: "pop") → DOScale(1, 0.36) OutBack; SetAnimation + Apply.
* SetPet(data): store data; skeleton = data.SkeletonData, SetSkin(data.SkinName), SetToSetupPose; re-hook Complete after 0.1 s; SetAnimation(idle,true).
* Decor.PetChanger.ChangeItem(cat, optionID): if optionID == current → return; id = (optionID < petAsset.count) ? optionID : 0;
  petChanger.SetPet(PetHomeAsset.GetData(id)); AnimIdle().

### 2.6 Character tap — Decor.CharacterChanger + Character.MotionStateMachine
* OnPressed (BoxTrigger Character): RegetComponents (MotionStateMachine in children); if none or `_isClicked` → ignore;
  `_isClicked=true`; `motion.ChangeState(CuteState, loop=false, onStart: {}, onComplete: {ChangeState(IdleState, loop=true); _isClicked=false})`.
* States (MotionStateMachine.InitAnimation, anim enum EAnimationSpineType names = spine animation names):
  Idle=`idle`, Wait=`ready_to_eat`, Drink=`drink`, Spicy=`spicy`, Surprise=`suprise`, Sour=`sour`, Cool=`cold`,
  Happy=random of [`happy`,`happy2`,`happy3`,`happy4`], **Cute=random of [`cute`,`cute2`,`cute3`,`cute4`]**,
  EatFood=random of [`eat`,`eat2`..`eat10`].  No sound on character tap.
* ChangeItem(cat, optionID) (Decor category 0): if id changed: GameSession.GenCharacter() (instantiates option.PrefabSpine into
  CharacterContainer), ProfilePanel.UpdateAvatar, RegetComponents.
* DecorController.Start: SetActiveCharacter(true); motion.ChangeState(IdleState, loop=true); collect all IItemChanger in scene;
  `SetupSavedOptions()` = for each category i: OnOptionSelected(i, DataDecor.GetSelectedItem(i)).
* SpineAnimationHandler (on character spine): PlayOnAwake=true, IsLoop=true, AnimationPlayOnAwake=4 (`idle`).
* GameSession.SetActiveCharacter(false) is called whenever a full-screen mode opens (collection, dream house, lucky wheel,
  blind-bag collection); (true) when returning.

---------------------------------------------------------------------------------------------------------------------
## 3. Intro popups ("Start DIY" / "Let's Scoop" / blind bag)

All three share the "fake livestream" layout: Header/Panel Profile (ProfilePanel), TopLeftUI (ButtonHome back, LIVE badge,
LivePanel viewer counter = Livestream.LivestreamPanel.Initialized/OnShow/OnHide), CommentHandler (chat), MakeButton,
MissionBoard (customer commission card). Customer name/avatar = `ViewerNameAsset.PickRandomContent()` / `ViewerAvatarAsset.PickRandom()`.

### 3.1 Home.PopupPrepare ("You've got a commission !!" → `Start DIY`, Clicker mode)
* OnInit: listeners (MakeButton→OnButtonPlayClicked, TopLeftUI/ButtonHome→OnButtonBackClicked); LivestreamPanel.Initialized;
  MissionBoard.localScale = 0; `_txtTipMoney` = "+100".
* **OnShow (async)**:
```
gameObject active; MakeButton GO hidden, not interactable
ProfilePanel refresh; base.OnShow; LivestreamPanel.OnShow
CommentHandler.UserComment(Localize("Welcome !"))
await 1s
CustomerName = ViewerNameAsset.PickRandomContent(); CustomerAvatar = ViewerAvatarAsset.PickRandom()
PlaySound(4); MissionBoard.DOScale(1, 0.5).SetEase(OutBack)
await 1s
Vibrate(100ms); DelayedCall(0.5): MakeButton active+interactable; StartButtonPlayAnim()
```
* StartButtonPlayAnim: DOScale(1.1, 0.36?) loop -1 Yoyo, ease InOutSine(4) ("breathing"). StopButtonPlayAnim: DOKill, scale 1.
* StartButtonPlayClickEffect: DOPunchScale(0.1, 0.2s, vibrato 10, elasticity 1).
* **OnButtonPlayClicked**: sound click; Haptic(4); click effect; MakeButton not interactable; CommentHandler stop;
  FlashIn(GameConfig.ClickerScene) → **ModeClicker**; DataUser.ClickerPlayTime += 1.
* **OnButtonBackClicked**: click; CommentHandler stop; MissionBoard.DOScale(0); (interstitial "prepare_back") →
  ShowScreen<ScreenHome>; ScreenHome.MoveMoneyLeft().

### 3.2 Home.PopupIntroScoop ("You've got a Lucky Scoop order" → `Let's Scoop`)
Identical sequence to PopupPrepare, with:
* Tip text: "+300" if RemoteConfig A/B flag == 1 else "+200" (use **+200** default (inferred)).
* In OnShow before the 1 s wait: `order = CharmBlindBoxAsset.GetOrder()` (random entry with non-empty OrderLocalize, e.g.
  "I want a Cat paw clicker"); `_txtOrder = Localize(order.OrderLocalize)`; `GameSession.ScoopOrderId = order.Id`.
* Play → FlashIn(GameConfig.ScoopGameScene) → **ScoopGame**; DataUser.ScoopPlayTime += 1.
* Back (guarded by a re-entry flag) → interstitial "scoop_home_click" → MissionBoard scale 0 → ShowScreen ScreenHome, MoveMoneyLeft.

### 3.3 Home.PopupIntroBlindbag ("Go shopping")
* No mission board shown (MissionBoard inactive); `CollectionButton` ("My Collection") extra.
* OnShow: like above (Welcome comment, wait 1 s, wait 1 s, pick viewer name/avatar, DelayedCall 0.5 → MakeButton on + breathing anim).
  Tip "+100".
* Play → FlashIn(GameConfig.BlindbagScene) → **BlindbagMinigame**; DataUser.BlindbagPlayTime += 1.
* Back → interstitial "intro_blindbag_back" → ShowScreen ScreenHome, MoveMoneyLeft.
* **OnButtonCollectionClicked**: click; GameSession.SetActiveCharacter(false); ShowVisual(false) (this popup's CanvasGroup
  alpha 0 + blocksRaycasts false); ShowPopup **PopupCollectionBlindbag**.
* ShowVisual(b): canvasGroup.alpha = b?1:0; blocksRaycasts = b; CommentHandler paused/resumed (inferred).

### 3.4 Home.PopupCollectionBlindbag (in-scene blind-bag collection viewer)
Fields: BtnBack, BtnPlay ("+ Get Blind Bag"), _blindBagCollection = root `CollectionBlindBag` (BlindBagCollection.CollectionSelector,
owned by the blind-bag spec), _homeController, _physics2DRaycaster (MainCamera).
* OnShow: CollectionBlindBag GO active (+ selector init); HomeController GO hidden (inferred); Physics2DRaycaster.enabled = true.
* Back: click; (interstitial "blind_bag_back_click"); SetActiveCharacter(true); HomeController active; raycaster restored;
  CollectionBlindBag inactive; hide popup; `GetPopup<PopupIntroBlindbag>().ShowVisual(true)`.
* Play: click; Haptic(4); (interstitial "blind_bag_play_click") → buttons not interactable; FlashIn(BlindbagScene); BlindbagPlayTime += 1.

### 3.5 Other: HomeScreen (resources prefab) is a legacy screen (3 buttons LoadScene) — not used. AutoSceneHome.Start is empty.

---------------------------------------------------------------------------------------------------------------------
## 4. Feature unlocks
* **No feature-unlock gating is active in this build.** `AnimUnlockFeature`, `PopupUnlockAt`, `BackHomeUnlockAsset`,
  `HomeUnlockItemData` have no callers and no scene instance; `HomeButton.SetActiveStatus/AnimUnlockPhase1/2` are empty;
  every `Lock` child ("TextDaysLeft") under the buttons is inactive and never toggled. GameConfig still declares
  PlayCountUnlockDecor 0, DreamHouse 1, DumplingBlindBox 2, LuckyScoop 3, IdleChest 4, BlindBag 5, DailyTask 7, PartTime 8
  (unused). DataUser flags IsUnlockedDailyTask/Decor/IdleChest/DreamHouse exist but Home doesn't read them.
* The only first-time gating is in OnShowPopupPart1 (IsFirstGame → only Start Live; collection tutorial) and PopupLanguage.
* For reference (if ever needed): AnimUnlockFeature.ShowUnlockX(): cover on; `_imgTutorial` gets the button's sprite/size,
  placed at screen centre, scale 0 → DOScale(1, 0.5) OutBack, then DOMove to button world centre (1 s, InBack) → DOScale…; cover off.
  PopupUnlockAt.OnShow: panel at initial pos, PlaySound(4, vol 0.5), DOLocalMoveY(+130, 2 s) then hide.

---------------------------------------------------------------------------------------------------------------------
## 5. Meta popups

### 5.1 Daily Login (7 days) — DailyLoginPopup + DailyReward.DailyLoginController + DailyMission.*
PlayerPrefs: `LastLoginDate` (string, DateTime "o" round-trip format; default = Today-1), `DayIndex` (int, default 0).
* `_maxDay` = number of day items = 7 (SetLimitDay in OnInit).
* **IsEnable** = DayIndex < 7 AND LastLoginDate.Date < Today. (After 7 claims the calendar is finished forever; no reset.)
* Claim: Vibrate(100); click sound; close buttons shown; `ClaimReward(DayIndex)` → `dailyItems[DayIndex].OnReward()`;
  SaveLoginData: LastLoginDate = Today, DayIndex += 1; RefreshStatus.
* RefreshStatus: each item OnRefresh; `GetButton` active iff IsEnable; `UnClaim` and `SeeYaTomrow` text shown iff !IsEnable.
* Item status (GetStatus): DayIndex(item) < loginDayIndex → Reward(1, claimed: checkbox + claimed sprite);
  == → Select(0, today/next highlighted); > → Unselect(2). Day text = Localize("Day $") with $ = index+1.
* OnShow: RefreshStatus; panel scale 0 → DOScale(1, 0.35) OutBack; MoneyManager.SetCurrentParent(popup) (money box on top).
  OnHide: CheckNotification; MoneyManager back to ScreenHome; close callback.
* CheckNotification: `Body/DailyButton/Dot`.SetActive(IsEnable) (called on home show and popup hide).
* Rewards (`DailyConfig` so sharedassets1:849, Content[i]):
  | Day | Reward |
  |---|---|
  | 1 | 200 coins |
  | 2 | Decor Background id 2 (R3) |
  | 3 | 400 coins |
  | 4 | 1200 coins |
  | 5 | Decor Table id 2 (table_3) |
  | 6 | 2000 coins |
  | 7 (Day7Item, SpecialDayItem) | Character id 1 (Character_Skin_Clicker_2) + Pet id 1 (Bear) + keycap decors 113, 147, 105 (A/B alternates 127, 133, 104) |
  OnReward: if IsCoin → `MoneyManager.CollectMoney(Coin, flyCount 10)` (coin fly to money box + add); else for each content:
  AssetName "Keycap" → id = (RemoteConfig flag==1 ? ID : ID_AB) — use ID (inferred default); if !DataUser.HasUnlockedKeycapDecor(id)
  → DataUser.UnlockClickerDecor(id); otherwise categoryIndex = DecorAsset.GetCategoryIndexByName(AssetName) → DataDecor.UnlockItem(cat, ID).
  The Decor "Day N" items (UnlockType Day, Price = N) are exactly these daily-login unlocks.

### 5.2 Daily Tasks — DailyTask.DailyTaskController (DDOL on `Master/DailyMissionManager`) + DataDailyTask + PopupDailyTask
Task pool (DailyTaskDataSO): 0 "Buy New Skin" BuyItem target 1; 1 "Collect 200 Coins" 200; 2 "Collect 500 Coins" 500;
3 "Play For 10 Minutes" PlayTime 10; 4 "Buy 2 Items In Decor" BuyItem 2; 5 "Collect 1000 Coins" 1000; 6 "Play For 12 Minutes" 12.
Big reward weights: 6000:40, 7000:30, 8000:20, 9000:8, 10000:2 (coins).
* Start: CheckValidTask (if saved tasks reference unknown ids → regenerate); CheckForNewDay: if LastLoginDate.Date < Today →
  GenerateNewDailyMissions + SaveLastLoginDate; current = InprogressTasks.
* **GenerateNewDailyMissions**: ResetForNewDay (clear completed/in-progress); rewards = GenerateRewardNumbers();
  pick 3 distinct random tasks from the pool → AddInProgressTask(taskId, progress 0, reward[i]).
* **GenerateRewardNumbers**: a = rand[0,40], b = rand[0,40-a], c = 40-a-b; shuffle; each +20 → three "star" rewards (20..60) summing to **100**.
* **ProgressTask(id, v)**: only if id is in today's list, not completed and not yet claimable → progress += v; OnTaskProgressed(id).
  Sources: MoneyManager.UpdateMoney(+amount≥1) → tasks 1, 2, 5 (+amount); DataDailyTask.Update every 60 s of play → tasks 3 and 6 (+1);
  Decor purchase → task 4 (+1), and if it was a Character option also task 0 (+1). (LevelUp type unused.)
* IsTaskClaimable = in list, not completed, progress ≥ target. **CompleteTask(id)** (Claim / Skip): AddCompletedTask (moves
  from in-progress to completed); OnTaskCompleted(id); if completed count ≥ 3 → OnAllTasksCompleted.
* PopupDailyTask: OnInit builds one DailyTaskItemUI per current task (prefab sharedassets1:897), progress bar max 100.
  OnShow: if DataDailyTask.IsFirstTime → show DailyTaskTutorialPopup and SetFirstTime(false); scroll to top; Refresh;
  panel scale 0→1 0.35 OutBack, then close buttons interactable. Refresh: each item UpdateProperties; big bar
  DoProgressValue(sum of RewardValue of completed tasks, 1 s).
  OnTaskCompleted: block on, isCollecting=true, CollectingStar from item's RewardPos, 5 stars fly → (InvokeDelay 0.5) block off,
  isCollecting=false; Refresh. OnAllTasksCompleted: wait until !isCollecting → ShowPopup PopupDailyTaskReward.
  Close (Overlay or BtnClose) → interstitial "daily_task_close" → hide. Noti `Body/DailyTaskButton/DotNoti` = AnyTaskClaimable.
* DailyTaskItemUI: icon, description (localized), reward "x{0}" (star value), progress "{p}/{target}" + fill p/target.
  Completed → Done icon/BG, buttons hidden. Claimable → Claim button only. Otherwise Go + Skip buttons.
  Go: close popup; mission type BuyItem(4) → ScreenHome.ShowDecor(); other types → ScreenHome.OnLiveButtonClicked().
  **Skip** = rewarded ad "skip_task" → CompleteTask (free in port). Claim → CompleteTask.
* PopupDailyTaskReward: tap Overlay → click sound; Spine BoxSpine "open_gift" (once) → on complete: sound complete(3),
  "open_gift2" loop, amount = weighted random (above), CollectMoney(amount, from SpawnPoint, 10 coins) → close.
* DailyTaskTutorialPopup: 5 steps (TaskIcon, Arrow, StarIcon, Arrow(1), RewardIcon) hidden; each fades in (0.5 s) one after
  another with 0.25 s waits; then TxtDesc + close button enabled; close → ShowPopup PopupDailyTask.
Save (DataDailyTask via DataManager): IsFirstTime, LastLoginDateString, CompletedTasks[{TaskId,ProgressValue,RewardValue}], InprogressTasks[…].

### 5.3 Online Rewards (login-time) — PlayTimeTracker + DataPlayTime + LoginTimeRewardPopup + DailyLoginRewardUIItem
Config `ConfigLoginTime`:
| Id | Minute | Reward | Amount | Claim |
|---|---|---|---|---|
| 0 | 1 | Coin | 200 | Free |
| 1 | 2 | RandomKeycapCommon | 1000 (coins if none left) | Ads |
| 2 | 5 | Coin | 500 | Free |
| 3 | 7 | RandomKeycapRare | 1000 (fallback coins) | Ads |
| 4 | 10 | Coin | 1000 | Free |
| 5 | 15 | RandomDecorSkin | 1000 (fallback coins) | Free |
* **PlayTimeTracker** (DDOL): starts 2 s after boot (LoadOrReset). Update: if date changed (key "yyyy-MM-dd", local) →
  ResetForNewDay (seconds=0, RewardClaimed all false); seconds += deltaTime; save every 10 s (and on DataManager save-all).
  Counts time in every scene while the app runs. Minutes = floor(seconds/60).
* Popup OnShow: money box moved into header (anchoredY -120); LoadRewardData (each row UpdateProcess); panel scale 0→1 0.3 OutBack;
  rows AnimShow(delay 0.15 + i*0.05): scale 0.5→1 0.5 OutBack + fade in 0.3. OnHide: money box restored.
* Row UpdateProcess: minutes < Minute → NotDone button, lock, "x min" label; claimed → Done button, claimed board;
  else (reached) → Free button (ClaimType Free) or Ad button (Ads), CanClaim board; but if previous row not claimed
  (`CanClaimThisReward`: id 0 or RewardClaimed[id-1]) → only NotDone. Rewards must be claimed in order.
  Labels: "1 min" or "$ mins".
* ClaimReward(row): if already claimed → return; RewardClaimed[id]=true; then
  Coin → CollectMoney(amount, 10); RandomKeycapCommon/Rare → keycap = DecorKeycapConfig.GetRandomDataLockedCommon/Rare
  (retry up to 11 times until not owned); found → DataUser.UnlockClickerDecor(id) + ShowPopup ClaimLoginRewardPopup.ShowUnlockDecorKeycap(sprite);
  none → CollectMoney(amount). RandomDecorSkin → random Character option with UnlockType==Day(3) not yet unlocked; found →
  DataDecor.UnlockItem(0, id) + ClaimLoginRewardPopup.ShowDecorSkinContent(id); none → CollectMoney(amount). Refresh rows.
  Ad claim = rewarded "online_rewards" → same ClaimReward.
* Popup Update (every 1 s, runs while hidden too): any reached & unclaimed → `_goNoti` (IdleChest-LoginTime/DotNoti, inferred) on;
  next locked reward exists → timer GOs on (IdleChest-LoginTime/TimeBG, Time(1)) and `Time (1)/TxtTime` = "{mm:D2}:{ss:D2}"
  remaining until it; all reached → timer hidden.
* ClaimLoginRewardPopup: shows Charm (keycap icon) or SkinCharacter content; panel scale 0→1 0.3 OutBack; Collect/Close → hide;
  Claim skin → skin image DOMove to the Decor button position + DOScale (0.5 s, InBack) then pulse the Decor button (1.2, 0.1).
* Close → interstitial "close_login" + Vibrate(100) → hide.
Save (DataPlayTime): LastLoginDateString ("yyyy-MM-dd"), AccumulatedSeconds, RewardClaimed[bool x6].

### 5.4 Lucky Wheel — LuckyWheelPopup (+ LuckyWheelNode, LuckyWheelConfigSO, GiftBoxLuckyWheel)
Wheel nodes (`PinginFollower/WheelImage/WheelNode*`, rotation value): id0 0°, id1 60°, id2 120°, id3 180°, id4 240°, id5 300°.
Config (LuckyWheelConfigSO): id0 Coins 30 rate 20; id1 Item (gift box) 15; id2 Coins 50 15; id3 Coins 30 15; id4 Item 20; id5 Coins 100 15.
LoadConfig fills each node (coin icon + amount text, or box icon). Mystery boxes: coin {100,300,700,1000}, keycap decor ids {70,76,95,104}.
Settings: _initSpinDuration 2, _decelerationDuration 2, _spinSpeed 60. Penguin SkeletonGraphic anims: `idle`, `penguin_open_mouth`,
`penguin_open_mouth_loop`, `penguin_close_mouth`.
* **Spin counter** (PlayerPrefs): `Count` = GetInt("LastFreeSpinTime", 0) (sic – key reused), `"IsCountdown"` = string date of first spin today.
  CheckCounterSpin: if `IsCountdownDone` (stored date's Day-of-month < today's Day-of-month; default Now-1 day) → Count = 0;
  isAdOn = (Count == 2); ads icon shown iff isAdOn; `Counter/Text` = "{Count}/2".
  ⇒ **2 free spins per day, then every spin needs a rewarded ad** (free in port). Note original only compares day-of-month
  (bug at month rollover) — port: compare full dates.
  (CanFreeSpin/StartFreeSpin/cooldown timer exist but are not wired → unused.)
* OnInit: SpinButton→OnSpinButtonClick, btnClose→OnButtonCloseClicked; LoadConfig; penguin `idle` loop.
* OnShow: active; MoneyManager.SetCurrentParent; SetActiveCharacter(false); CheckCounterSpin; SpinButton + btnClose shown;
  ShowLuckyWheel: WheelImage.DORotate(0,0,360, 2 s, FastBeyond360) then euler 0; StartButtonSpinAnim(SpinButton).
* StartButtonSpinAnim(btn): btn, txtContent ("Click on the blank to continue"), btnClose, BtnClose2 active; btn.DOScaleY(1.1, 0.5) loop -1 Yoyo, ease InOutBack(28).
* **OnSpinButtonClick**: Tracking.AddSpin; click; Haptic(4); if isAdOn → rewarded "spin" → StartSpin; else StartSpin.
* **StartSpin(onComplete)**: SpinButton not interactable; StopButtonSpinAnim; PlaySound(sfx_wheel_spinning 49); Vibrate(100); btnClose hidden;
  isSpinning=true; reward = ConfigSO.GetRandomReward() (r = Random.Range(0, ΣRate=100); first cumulative > r);
  RunAnimation(reward.RewardId, b__0).
* RunAnimation: SpinButton DOScaleY(0.7, 0.1) loops 2 Yoyo; blueButtonRect DOAnchorPosY(19, 0.2); hide btnClose, BtnClose2, txtContent;
  start SpinAnimation coroutine.
* **SpinAnimation(resultID)**: node = node with id==resultID; target = node.rotationValue.
  Phase 1 (t < 2 s): spinAmount += spinSpeed*dt; WheelImage.Rotate(0,0,spinAmount) each frame (accelerating).
  Phase 2 (2 s): start = current euler z; end = target + 720 (as coded: start + 720 + (target-start));
  z = start + (end-start) * (1-(1-t)^3) (cubic ease-out), t = elapsed/2. Finally euler z = target. Callback.
* b__0 (landed): Count = min(Count+1, 2); if Count ≥ 1 → "IsCountdown" = Now; CheckCounterSpin;
  penguin `penguin_open_mouth` → then `penguin_open_mouth_loop` loop; PlaySound(sfx_coin_dropping 44);
  node.PlayAnimationReward(0.8) (delayed highlight); then b__3:
  * Reward Item (ids 1,4): giftBox.SetGiftBox(resultID=="1" ? 0 : 1) (box_gift1/2 sprites) → **GetRewardItem**:
    penguin `penguin_close_mouth` → `idle` loop; first keycap box (70,76,95,104 in order) not owned and existing in
    DecorKeycapConfig → giftBox.SetReward(sprite, rarity) + DataUser.UnlockClickerDecor(id); else random coin box value
    (100/300/700/1000) → SetRewardCoin; giftBox.AnimUnbox(); on box close: (coin) MoneyItem.Show(value, 2 s) +
    CollectMoney(value, 10); then StartButtonSpinAnim + ActiveButtonBack + onComplete.
  * Reward Coins: **GetMoney(amount)**: MoneyManager.UpdateMoney(+amount) immediately; ButtonGetCoin listener;
    TxtCoin = amount; FxMoney particle Play; after 1.5 s: penguin `penguin_close_mouth`→`idle`, ButtonGetCoin content scale 0→1 0.2 OutBack,
    ButtonGetCoin shown, PlaySound(sfx_win_prize 50). Tap ButtonGetCoin → StartButtonSpinAnim, ActiveButtonBack, hide it.
* ActiveButtonBack: SpinButton interactable; blueButtonRect DOAnchorPosY(53, 0.3).
* Close (btnClose / BtnClose): click; (interstitial "close_lucky_wheel") → close action; SetActiveCharacter(true);
  ShowScreen<ScreenHome>; MoneyManager.BackToParent. OnHide: stop anims, hide.
* GiftBoxLuckyWheel.AnimUnbox (inferred sequence from tweens): FullContent on; black BG fade; box drops in (DOAnchorPosY 0.5 s,
  scale 0→1 0.5 InOutBack); lid squash DOScaleY(0.9, 0.2) → lid flies up (anchoredY 550, fade) with PlaySound(sfx_open_giftbox 46);
  reward rises (anchoredY 415, 0.5 s), stars/glow scale 0→1 0.5 OutBack (glow tint/star/panel sprites from RarityVisualConfig
  `ConfigLuckyWheel` by rarity), PlaySound(sfx_win_prize 50); BtnCloseGiftBox → fade out 0.3 s, invoke onClick event.

### 5.5 Decor panel — Decor.DecorPanel / CategoryPanel / OptionPanel / OptionItem / DataDecor / DecorController
DecorAsset category order: **0 Character (CharacterChanger), 1 Background_HLW (BackgroundChanger), 2 Table_HLW (TableChanger), 3 Pet (PetChanger)**.
Options (UnlockType: Unlocked / Ads(=free) / Coin(price) / Day(N=daily-login day) / IAP):
* Character: 0 Unlocked Character_Skin_Clicker_1 (icon clicker_01); 1 Day7 Character_Skin_Clicker_2; 2 Unlocked Character_Default_Charm_2;
  3 Coin 1000 Character_Default_Charm_1; 4 Ads Character_Gugugaga_Charm; 5 Ads Character_Lily; 6 Coin 1500 Character_Christmas_2025;
  7 Ads Character_Chicken; 8 Coin 2200 Character_Mira; 9 Day7 Character_Rumi; 10 Ads Character_Skin_Halloween 1; 11 IAP Character_Joey;
  12 Ads Character_Default; 13 Ads Character_Skin_Noel; 14 Coin 3200 Character_Skin_Halloween.
* Background: 0 R1, 1 R2 (Unlocked); 2 R3 Day2; 3 R4 Ads.  Table: 0 table_1, 1 table_2 (Unlocked); 2 table_3 Day5; 3 table_4 Ads.
* Pet: 0 Penguin Blue Unlocked; 1 Bear Day7; 2 Cat Coin 500; 3 Penguin Pink Ads.
(Character option "IconDefault" = avatar sprite used for the profile picture.)
* DecorPanel.OnInit: CategoryPanel.Setup (one CategoryItem per category, pooled id 6), OptionPanel.OnInit; btnClose & CloseButton →
  OnButtonCloseClicked; hideY = initialY - (panel.height + yOffset 200); panel anchoredY = hideY; hidden.
* OnShow: active; panel DOAnchorPosY(initialY, 0.36); CategoryPanel.SelectDefaultCategory (category 0); OnShowPanel(0.36).
  OnButtonCloseClicked: click; OnHide (panel → hideY 0.36, then inactive); OnHidePanel(0.36); ScreenHome.OnShowButtons(0.5).
* CategoryItem: icon on/off sprites (selected uses OnIcon), selected frame; click → click sound, Haptic(4), punch scale, Refresh,
  SelectedCategory → OptionPanel.Setup(index) + SelectedOptionItemByIndex(DataDecor.GetSelectedItem(index)).
  Noti dot on a category = DecorController.CanAnyBuyOption(cat) (a Coin option not owned and affordable); DecorPanel._iconNoti =
  `Body/DecorButton/Dot`.
* OptionPanel.Setup(cat): create/despawn pooled OptionItems (pool id 7) to option count; scroll to start; per option:
  icon; price text; Day text Localize("Day $"); unlock badge by type (_optionByMoney/Ads/IAP/Day); selected button
  interactable if owned; buy button shown iff not owned, interactable iff (affordable or Ads); Day-type buy button hidden.
  OptionPanel.Refresh on MoneyManager.OnMoneyChanged (re-evaluate affordability).
* Click option → click, Haptic(4), punch; owned → SelectedOptionItem; else → OnOptionItemBuyClicked.
* **OnOptionItemBuyClicked**: click; Haptic(4); by type: Ads → rewarded "unlock_decor" → UnlockOptionItem (free in port);
  Day / IAP → nothing; Coin: price > money → punch + ShowPopup NotEnoughMoneyPopup; else PlaySound(sfx_purchase_coin 47),
  MoneyManager.UpdateMoney(-price), UnlockOptionItem.
* UnlockOptionItem: DataDecor.UnlockItem(cat, id); item → owned (status text on, buy button off); SelectedOptionItem(item);
  CategoryPanel.Refresh; DailyTask ProgressTask(4 "Buy decor", 1); if category is CharacterChanger also ProgressTask(0 "Buy new skin", 1).
* SelectedOptionItem: previous.SetSelected(false); item.SetSelected(true) (status "Equipped", others "Owned");
  DataDecor.SetSelectedItem(cat, id); OptionPanel.OnOptionSelected(cat,id) → DecorController.OnOptionSelected:
  find the IItemChanger whose type name == category.Name → ChangeItem(cat, id); if cat==0 → ProfileManager.SetAvatar(id, option.IconDefault).
* Changers: BackgroundChanger / TableChanger → SpriteRenderer.sprite = option.ImageSprite; PetChanger (2.5); CharacterChanger (2.6).
  (QuickContentChanger on Wall/Table/Accessory can swap to live-ops sprites `bg_hlw`/`table_hlw`/`decor_hlw` — Halloween event;
  treat as disabled (inferred).)
Save (DataDecor via DataManager): CategoryDataList[{ID, SelectedItemID, UnlockedItems[int]}]. NewData: per category
SelectedItemID 0, UnlockedItems = all options with UnlockType Unlocked; LoadData adds any newly-"Unlocked" options.

### 5.6 Profile / settings / language
* ProfilePanel (Home header and each intro popup): name (`ProfileManager.User.Name`, default "You"), "Level $" from DataUser level,
  exp text "{exp}/{level*XpToNextLevel(25)}" and fill, avatar = GameSession avatar (selected character IconDefault).
  OnChangeAnchorPositionY used by ScreenHome. Click Name Field → PopupRename.
* ProfileManager (DDOL): PlayerPrefs `profile_data` = JSON UserProfile {Name, Level, ExperiencePoint, AvatarId, IsLevelUp};
  SetName (empty → "You"), SetAvatar(id, sprite) → save + OnAvatarChanged; ObtainExperiencePoint (+50, level up when ≥ requirement) (used by modes).
* PopupRename: input cleared; open anim punch + rotate; confirm (sanitized with regex `[^A-Za-z0-9_. ]+` removed, button sprite
  `button_claim`/`button_claim_off` by validity) → ProfileManager.SetName, Home ProfilePanel.UpdateName, close. Cheat: name "Tdtc500k" → +500000 coins (ignore/optional).
* ProfilePopup (opened by SettingButton): SettingPanel with Sound/Music/Vibrate toggles (SettingButton _type 0/1/2, sprites
  toggle_on/toggle_off) stored in DataUser IsSoundOn/IsMusicOn/IsVibrationOn; Music off → StopAllMusic, on → PlayMusicIfNotPlaying;
  Vibrate on → test vibration. Language row: prev/next arrows cycle LocalizeAsset list
  [English, Vietnamese, Japanese, French, German, Spanish, Portuguese, Russian, Korean], `TxtLanguage` shows it; Restore (IAP) skip.
  Close / fullscreen close button → hide.
* PopupLanguage (first Home visit, see CheckLocalize): list of the same 9 languages (flag + name, selected colour #0AA700,
  normal #5C5C67); tap selects; BtnConfirm → set LocalizationManager.Language + DataUser.CurrentLanguage/IsSelectedLanguage, close.
* SettingsPopup class (PlayerPrefs IsMusicOn/IsSoundOn/IsVibrateOn) is not in the Home scene (other scenes).

### 5.7 Misc
* PlayDayTracker (static, analytics): PlayerPrefs `FirstDayPlayed`, `LastDayPlayed`, `TimePlayedCount` (distinct days), `StreakDayCount`.
  Not needed for gameplay.
* Games.CountdownTimer (StartCountdown/OnTrigger), Games.RandomAnimation / CharacterLoadingSelector (loading-screen character),
  Games.SpineColorChanger (tint wheel spine), TabBase/TabToggle (generic tab CanvasGroup toggles), PagesScrollVisual
  (page dots: SetPages(n), HighlightPage(i) — used in BlindBagCollection), CameraController / RotateByDrag (DreamHouse scene),
  BackgroundControl (`_scaleFit`: scale SpriteRenderer to cover the camera) — utility classes, not home logic.

---------------------------------------------------------------------------------------------------------------------
## 6. Saved data summary
| Store | Key / field | Meaning |
|---|---|---|
| PlayerPrefs | `ReturnHomeCount` | ++ each Home show |
| PlayerPrefs | `LastLoginDate` ("o"), `DayIndex` | Daily login 7-day calendar |
| PlayerPrefs | `LastFreeSpinTime` (int Count 0..2), `IsCountdown` (date string) | Lucky wheel daily spins |
| PlayerPrefs | `profile_data` (JSON) | name / level / exp / avatar id |
| PlayerPrefs | `FirstDayPlayed`, `LastDayPlayed`, `TimePlayedCount`, `StreakDayCount` | analytics |
| DataManager DataDecor | CategoryDataList | owned + selected decor per category |
| DataManager DataDailyTask | IsFirstTime, LastLoginDateString, CompletedTasks, InprogressTasks | daily tasks |
| DataManager DataPlayTime | LastLoginDateString, AccumulatedSeconds, RewardClaimed[6] | online rewards |
| DataManager DataUser | Money, CurrentLanguage, IsSoundOn/IsMusicOn/IsVibrationOn, IsFirstGame, IsDoneTutorialCollection, ClickerPlayTime/BlindbagPlayTime/ScoopPlayTime, UnlockedClickerDecor | shared user data |
| GameSession (memory) | BackFromGameMode, ScoopOrderId | cross-scene transient |

## 7. Tutorial / first-time
1. First Home visit: CheckLocalize → PopupLanguage (pick language). If DataUser.IsFirstGame: all buttons stay hidden, BlockScreen on,
   only "Start Live" slides up to y 425 → PopupPrepare → Clicker (first game).
2. After that, until IsDoneTutorialCollection: only the Collection button slides in (x -120) with the pulsing ScaleTutorial and BlockScreen.
3. Daily tasks: first open shows DailyTaskTutorialPopup (IsFirstTime). Daily login: hand on Get button controlled by ShowTutorial (passed false from Home).

## 8. Implementation checklist
- [ ] Home world: Wall/Table/Pet/luckywheel sprites + DDOL CharacterContainer (y -1.5); pointer→Physics2D raycast→BoxTrigger.OnPressed (ignore when over UI).
- [ ] Pet tap: sound 4, touch anim once, back to idle loop, collider disabled during anim. Character tap: random cute anim once → idle.
- [ ] ScreenHome show/hide button tweens (exact X/Y targets, 0.5 s, OutBack/InBack, delay 0.35); money box X moves (-168/-50).
- [ ] Button routing table §1.2; intro popups §3 with timed sequence (1 s, 1 s, 0.5 s), tips +100/+200/+100, scene loads, play counters.
- [ ] BackFromGameMode → reopen intro popup of the mode on return.
- [ ] First-time flows: language popup, IsFirstGame live-only, collection tutorial.
- [ ] Decor panel: 4 categories, option states, buy (coin / ad=free / day/IAP locked), select+apply, save DataDecor, Env slide (Y 1.0 / char -0.5), daily-task progress hooks, category noti dots.
- [ ] Daily login 7-day (claim once per calendar day, never resets after day 7), rewards table, Dot noti.
- [ ] Daily tasks: 3 random/day, star rewards summing 100, progress hooks (coins earned, 60 s play ticks, decor buys), claim/skip, big box reward weighted 6000–10000.
- [ ] Online rewards: daily play-time accumulator (resets at local midnight), 6 sequential rewards at 1/2/5/7/10/15 min, keycap/skin fallbacks to coins, home timer "mm:ss" + dot.
- [ ] Lucky wheel: weighted pick (rates 20/15/15/15/20/15), 2 free spins per day then ad(=free), spin physics (2 s accel + 2 s cubic-out to target+720), penguin anims, coin vs gift-box rewards.
- [ ] Profile panel / rename / settings toggles / language cycling; persist as in §6.
