# Clicker DIY mode (scene level2 "ModeClicker") – implementation spec

Source: `dis/Clicker.*.s`, `dis/CharmGame.*.s`, `AutoSceneClicker`, `KeycapEffect`, `DataClicker`, `ClickerSaveData*`, scene `out/data/level2.json`, configs in `out/data/so.json`.
Conventions: "OutBack" etc. = DOTween ease (27 OutBack, 26 InBack, 3 OutSine, 2 InSine, 4 InOutSine, 1 Linear, 25 InOutElastic).
Sounds = `Framework.ESound` names (id). Vibrate(n) = `Framework.Vibration.Vibrate(n ms)`. Ads are free: a rewarded ad button = instant success,
`AdsManager.ShowInter(...,cb)` = just run `cb`. `DevTrack`/Firebase calls ignored. "(inferred)" = not 100 % proven from asm.

Persistent user data used here (`DataUser.dataSave`, class `DataSaveUser`):
`IsFirstGame` (0x3a), `IsFirstClicker` (0x3b), `ClickerRewardClaimCount` (0x3c), `Money` (0x48), `ClickerPlayTime` (0x4c),
lists `UnlockedClickerDecor`, `UnlockedClickerSwitch`, `UnlockedClickerBase`, `UnlockedClickerKeycap`(obsolete but still written), `UnlockedClickerKeychain`.
New users start with IsFirstGame = IsFirstClicker = true (inferred). `RemoteConfigManager.data_config_type` default = **1** → every config uses `_dataList` (the `_dataListAB` lists are only used when the remote value ≠ 1; ignore).

---------------------------------------------------------------------------------------------------
## 1. Overview / player flow

Entry: Home → "DIY" (or Collection empty slot → CreateMorePopup "Create more") → `SimpleSceneTransition.FlashIn("Assets/_Game/Scenes/ModeClicker.unity")` (= level2).
Exit: always back to `GameConfig.HomeScene = "Assets/_Game/Scenes/Home.unity"` (level1) via FlashIn.

Scene start (`AutoSceneClicker.Start`): `AudioManager.StopAllMusic()`, `PlayMusic(bgm_ingame_1 (4), volume 1)`, `UIManager.ShowScreen<IngameClickerScreen>()`.
`KeycapMakerController.Initiate()` runs on singleton init (Awake) – see §2.1.

Steps (all inside one scene; no camera moves – the MainCamera at (0,1) never changes; only objects/BG sprites swap):

| # | Step | UI panel (IngameClickerScreen child) | World objects | BG |
|---|---|---|---|---|
| 1 | Choose case (base keycap) | SelectBaseKeycapPanel | `KeycapMakerController/PrinterPreview-Scale/PreviewBaseKeycap` sprite preview + `TutorialBaseKeycap` ("Choose a case to start !") | Table |
| 2 | 3D printer prints the case | Printer3D-UIContent (comments, chat, Speed-Up 100 coins) | `PrinterMachine` (rails, progress lights, BtnMachineOn) | Wall |
| 3 | Choose switch type | SelectSwitchPanel | `Tray-Scale` with N switches popping in | Wall |
| 4 | Choose keycap shape + colour | SelectKeycapPanel + PopupSelectColor | N keycaps on tray | Wall |
| 5 | Decorate each keycap (charm on top / replace keycap) | DecorKeycapPanel (tabs Charm / Replace / Paint[hidden]) | finished case object shows keycaps only, highlight frame on selected keycap | Table |
| 6 | Choose keychain | SelectKeychainPanel | tray with keychain preview | Wall |
| 7 | Assemble: drag switches → slots, keycaps → on switches, keychain → hook | none (BtnNext hidden) | tray slides down, case object appears, drag hand tutorial | Table |
| 8 | Result: clicker rotates/moves to Final pose, BG darkens, glow FX; PopupDoneAssemble ("Continue") | PopupDoneAssemble | | Wall + BG_Complete α .95 |
| 9 | Livestream 10 s: player taps keycaps (switch sound, +1 coin per tap, comments) | ScreenClickerLivestream | object at Livestream pose | Wall |
| 10 | Complete: object to Complete pose, auto-clicking hand, reward popup, save to collection | PopupClickerComplete (+ CollectionFullPopup if collection full) | | BG_Final α 1 |
| 11 | Collect (600 / x2 1200) → Home | | | |

Home button (top-left, hidden while `IsFirstGame`) → BackHomePopup → confirm → Home scene (nothing saved).

---------------------------------------------------------------------------------------------------
## 2. Classes

### 2.1 Clicker.KeycapMakerController (MonoSingleton) – `KeycapMakerController` (root of world objects)
State: `_baseKeycapId=-1, _switchId=-1, _keycapId=-1, _keycapColorId=0, _keychainId=-1, _switchAmount` (slots of chosen case).
Serialized refs (level2):
- `_goTray`/`_srTray` = `KeycapMakerController/Tray-Scale` / `Tray visual` (sprite `tray`), `_traySprite=tray`, `_trayTopViewSprite=tray_topview`,
  `_srBaseKeycapOnTray` = `Tray visual/Base_keycap` (SR case sprite drawn on the tray).
- `_srPreviewPrinter` = `PrinterPreview-Scale/PreviewBaseKeycap`; `_tutorialSelectKeycapBase` = `PrinterPreview-Scale/TutorialBaseKeycap`.
- `_printerMachine` = `PrinterMachine` (root, inactive at start).
- `_switchList` = 9 × `Tray visual/Switch/switch` (SwitchObject), `_keycapList` = 9 × `Tray visual/Keycap/Keycap` (KeycapObject).
- `_srKeychain` = `Tray visual/KeychainPreview`.
- `_baseKeycapObject` = current case object (scene placeholder `BaseKeycapHolder/carton_box-BaseKeycapObject`, replaced by prefab instance), `_tfBaseKeycapHolder`=`BaseKeycapHolder` (0,4.5).
- `_tfHighlight` = `BaseKeycapHolder/HighlightKeycap` (4 corner sprites focus_1..4, child ScaleAnim has its own DOTweenAnimation pulse).
- `_dragManager` = `TrayDragManager`; `_pointerHandTutorial` = `BaseKeycapHolder/TutorialTap` (TutorialDrag), `_dragHandTutorial` = `TrayDragManager/TutorialDrag`.
- `_bgTable`=`BG_Table` (BG_Ingame_tile, active), `_bgWall`=`BG_Wall` (BG_ingame, inactive), `_srBG`=`BG_Complete` SR, `_srBGForPopupComplete`=`BG_Final` SR, `_tfFinalEffect`=`BG_Final/Effect` (3 glow_effect sprites with DOTweenAnimation rotation).
- Poses (children of BaseKeycapHolder, local): `_tfFinalPose` BaseKeycapFinalPose (0,-2.9) → world y≈1.6; `_tfLivestreamPose` (0,-2.0) → y 2.5; `_tfCompletePose` (0,-0.64) → y 3.86.
- configs: Base sharedassets0:14397, Switch sharedassets1:845, Keycap sharedassets1:843, Keychain sharedassets1:844.

Methods:
- `Initiate()`: `_ingameClickerScreen = UIManager.GetScreen<IngameClickerScreen>()`; every tray switch & keycap `localScale=0`; `_goTray.SetActive(false)`; `_srKeychain` scale 0; `_tfHighlight` scale 0; `_dragManager.SetDraggable(false)`; `_srBG` alpha 0; `_srBGForPopupComplete` alpha 0; `_tfFinalEffect` scale 0; `ShowTableBG()`; `SetMultipleInput(false)` (disables multi-touch on the InputSystemUIInputModule); `_tutorialSelectKeycapBase.ShowWithAnim()` (always, not only first time).
- `ShowTableBG()`: BG_Table on, BG_Wall off. `ShowWallBG()`: BG_Table off, BG_Wall on.
- `SetBaseKeycapId(id)`: tutorialSelectKeycapBase.HideTutorial(); data = BaseConfig.GetData(id); `_baseKeycapId=id`; `ChangePrinterBasePreview(data.OnTraySpr)`; `_srBaseKeycapOnTray.sprite = data.OnTraySpr`; `_switchAmount = data.SwitchAmount`.
- `ChangePrinterBasePreview(spr)`: Vibrate(50); preview.DOKill; preview.DOScale(0, 0.1) → OnComplete: sprite=spr, DOScale(1, 0.3) OutBack.
- `HidePreviewShowPrinter()`: preview DOKill, scale→0; `_printerMachine.ChangeBaseKeycap(data.BasePrinterObject)`; PrinterMachine.SetActive(true); `ShowWallBG()`.
- `SpeedUpPrinter()` → `printerMachine._printerRail.SpeedUp()`.
- `HidePrinterShowTray()`: PrinterMachine off, tray on, ShowWallBG.
- `SpawnAssembleKeycap()`: data=GetData(_baseKeycapId); if old `_baseKeycapObject` exists → Destroy; `_baseKeycapObject = Instantiate(data.BaseKeycapObject, _tfBaseKeycapHolder)`, localPosition=(0,0,0); `_dragManager.SetBaseKeycapChecking(it)`. (Its Awake hides everything – see 2.2.)
- `SpawnSwitch(id)`: data=SwitchConfig.GetData(id); `_switchId=id`; for i in 0..8: tray switch i DOKill, scale 0; if i < _switchAmount: sprite=data.Icon, `DOScale(1,0.3).SetEase(OutBack).SetDelay(i*0.1).OnStart(Vibrate(40))`. Then `_baseKeycapObject.SetSwitch(data.Icon)`.
- `SetSwitchSound(eSound)` → `_baseKeycapObject.SetSwitchSound`.
- `SpawnKeycap(id)`: data=KeycapConfig.GetData(id); `_keycapId=id`; for i in 0..8: tray keycap DOKill, scale 0; if i<_switchAmount: `SetDecor(data.Icon, None, -1)`, DOScale(1,0.3) OutBack delay i*0.1, OnStart Vibrate(40). `_baseKeycapObject.SetKeycap(data.Icon, None)`.
- `SetKeycapColor(c)`: `_keycapColorId=c`; spr = KeycapConfig[_keycapId].KeycapColors[c]; tray keycaps i<_switchAmount `.SetDecor(spr, None, -1)`; `_baseKeycapObject.SetKeycap(spr, None)`. (No anim.)
- `SetKeycapDecor(decorId, spr, type)` → `SetKeycapIndexDecor(_baseKeycapObject.CurrentSetupKeycapIndex, ...)`: tray keycap[index].SetDecor(spr,type,decorId) and `_baseKeycapObject.SetKeycapIndex(index, spr, type, decorId)`.
- `ShowStepDecorKeycap()`: tray off; base.ShowKeycapsOnly(); base.TurnModeSetup(true); base.OnSetupKeycap(0); ShowTableBG.
- `JumpToNextKeycap()` → base.JumpToNextKeycap().
- `ShowHighlightSetupAt(tf)`: highlight.position = tf.position; DOKill; localScale = 1.2; DOScale(1, 0.3).
- `ShowSelectKeychain()`: highlight DOKill, scale 0; tray on; base.HideKeycaps(); highlight DOScale(0); ShowWallBG.
- `SetKeychain(id)`: data=KeychainConfig.GetData(id); `_keychainId=id`; `ChangeKeychainPreview(data.Icon)`; base `_srKeychain.sprite = data.KeychainSprite`.
- `ChangeKeychainPreview(spr)`: tray keychain DOKill; DOScale(0,0.1) → sprite=spr, DOScale(1,0.3) OutBack.
- `PrepareAssembleStep()`: base.RemoveSetupEvent(); ShowTableBG; `MoveTrayToLowPos(0)`; `AnimAppearBaseKeycap(1.0)`.
- `MoveTrayToLowPos(delay)`: `_srTray.sprite = tray_topview`; `_goTray.transform.DOLocalMoveY(-8, 1.0).SetDelay(delay)`; `_srBaseKeycapOnTray.DOLocalMoveY(localY+1, 0.5).SetDelay(delay+0.5).OnComplete(→ dragManager.UpdateFallbackPosition(); dragManager.SetDraggable(true); ShowDragHandTutorial(true))`; `_srBaseKeycapOnTray.DOFade(0, 0.5).SetDelay(delay+0.5)`.
- `AnimAppearBaseKeycap(delay)`: base localScale=0; base.ShowBaseOnly(); base.DOScale(1, 0.3).SetDelay(delay).SetEase(OutBack).
- `ShowResult()` (called by base when assembly complete): tray off; base `_switchGlowColor = SwitchConfig[_switchId].Color`; base.ApplyGlowColor(); base.UpdateGlowSprite(); `UIManager.HideScreen<IngameClickerScreen>()` (inferred type); base.RotateKeychain(true); base `DORotateQuaternion(FinalPose.rotation, 0.5)` + `DOMove(FinalPose.position, 0.5).SetEase(InOutSine).OnComplete(A)`.
  A: `_srBG.DOFade(0.95, 0.5)`; `_tfFinalEffect.DOScale(1, 0.5).SetEase(OutBack).OnComplete(B)`.
  B: base.TurnModeSetup(false) (keycaps become clickable); `ShowPopup<PopupDoneAssemble>()`; ShowWallBG; SetMultipleInput(true).
- `MoveResultToCenter()` (Continue from PopupDoneAssemble): `_srBG.DOFade(0,0.5)`; `_tfFinalEffect.DOScale(0,0.5).SetEase(InBack)`; base.RotateKeychain(false); rotate+move to LivestreamPose 0.5 InOutSine.
- `MoveResultToComplete(onComplete)`: `_srBGForPopupComplete.DOFade(1, 0.3)`; RotateKeychain(true); rotate+move to CompletePose 0.5 InOutSine → onComplete.
- `ShowBGComplete()`: `_srBGForPopupComplete.DOFade(1,0.3)` (unused).
- `ShowHandComplete()`: base.HandFollowClick.ShowHand(true); `AutoClickRandomTime()`.
- `AutoClickRandomTime()`: n = Random.Range(3,5) (3 or 4); for each: `DOVirtual.DelayedCall(Random.Range(0.1,1.5), base.ClickRandomKeycap)` (independent delays).
- `ShowTapHandTutorial(show)` / `ShowDragHandTutorial(show)`: only if `IsFirstClicker`: `_pointerHandTutorial` / `_dragHandTutorial` `.Show()` or `.Hide()`.
- `CallHandTouchThisSpot(t)` → base.HandFollowClick.ClickAt(t). `CallRemoveKeycapAt(i)` → base.PullBackKeycap(i).
- `TrySaveKeycapToDatabase()` (called from PopupClickerComplete.OnShow): `DataClicker dc`; if `dc.CanAddNewKeycap()` (saved count < maxKeycapAmount): `item = new ClickerSaveDataItem{BaseKeycapId,SwitchId,KeycapId,KeycapColorId,KeychainId, DecorIdList = base.GetDecorData()}`; `dc.RegisterNewKeycap(item)`.
  Else `ShowPopup<CollectionFullPopup>().SetEventCallback(onBuy, 500)`; onBuy: `dataSave.maxKeycapAmount++`, `dc.SaveData()`, then create+register the item as above. If the player declines, the clicker is not saved.

### 2.2 Clicker.BaseKeycapObject – the finished-case prefab (one per case, from BaseKeycapConfig.BaseKeycapObject)
Structure (example `carton_box-BaseKeycapObject`, prefab `3x3-BaseKeycapObject` etc. in sharedassets0 dump): `Base` SR (`_srBaseKeycap`), `BaseTopCover` SR (`_srBaseKeycapFront`, front lip drawn above switches),
`Switch/Position[i]/switch_visual` (SwitchObject, with SpriteMask), `Keycap/Position[i]/Keycap` (KeycapObject with children keycap / top-decor / replace and `KeycapClick` world Canvas with ButtonFull (EventTrigger) + ButtonSetup), `KeychainHolder/keychain` (`_srKeychain`), `HandComplete` (HandFollowClick, inactive).
Fields: `_switchPositions`, `_switchObjects`, `_switchPlaced(bool list)`, `_switchGlowColor`(default white), `_keycapPositions`, `_keycapObjects`, `_keycapPlaced`, `_keychainPlaced`, `_keycapClicks`, `_currentSetupKeycapIndex=-1`, `_handFollowClick`.
- `Awake`: base & front SR objects inactive; fill `_switchPlaced`/`_keycapPlaced` with false (one per object); every switch & keycap localScale 0; keychain scale 0, `_keychainPlaced=false`; for each `_keycapClicks[i]`: `SetBaseKeycapObject(this)`, `SetButtonSetupEvent(OnSetupKeycap, i)`; `_handFollowClick.ShowHand(false)`.
- `IsAssembleDone` = all `_switchPlaced` true && all `_keycapPlaced` true && `_keychainPlaced`.
- `ShowKeycapsOnly()`: base & front inactive; keycap i `DOScale(1,0.3).SetDelay(i*0.1).SetEase(OutBack)`.
- `ShowBaseOnly()`: base & front active.
- `HideKeycaps()`: every keycap DOKill, localScale 0.
- `TurnModeSetup(b)`: each KeycapClick.TurnModeSetup(b) (b=true: ButtonSetup visible/ButtonFull hidden; false: clickable mode).
- `RemoveSetupEvent()`: each KeycapClick `_onSetupClick.RemoveAllListeners()`.
- `SetSwitch(spr)`: all switch visuals sprite=spr. `SetSwitchSound(s)`: each KeycapClick.SetSoundClick(s).
- `SetKeycap(spr, type)`: each keycapObject.SetDecor(spr, type, -1). `SetKeycapIndex(i, spr, type, decorId)`: keycapObjects[i].SetDecor(...). `SetKeychain(spr)`.
- `ShowAll()`: base+front on; switch i DOScale(1,0.5) OutBack delay i*0.1; keycap i DOScale(1,0.5) OutBack delay (i+switchCount)*0.1; keychain DOScale(1,0.5) OutBack delay (switchCount+keycapCount)*0.1 (unused in the flow).
- `ShowAllNoAnim()`: base+front on; all switches/keycaps scale 1; keychain scale 1, `_keychainPlaced=true`; TurnModeSetup(true); hand hidden. (collection view)
- `OnSetupKeycap(i)`: `_currentSetupKeycapIndex=i`; KMC.ShowHighlightSetupAt(keycapObjects[i].transform).
- `JumpToNextKeycap()`: if index+1 < keycapObjects.Count → OnSetupKeycap(index+1) (else stays). `ShowFirstHighlight()` → OnSetupKeycap(0).
- `CheckDropSwitch(t, range)`: returns index of closest switch position with `!_switchPlaced[i]` and 3D distance ≤ range (−1 if none).
- `CheckDropKeycap(t, range)`: closest keycap position i with `_switchPlaced[i] && !_keycapPlaced[i]` within range.
- `CheckDropKeychain(t, range)`: `!_keychainPlaced` and distance(t, _srKeychain) ≤ range.
- `DropSwitchReal(i)`: `_switchPlaced[i]=true`; `CheckDoneAssemble()`; switchObjects[i].DOScale(1, 0.2).SetEase(OutBack).
- `DropKeycapReal(i, visual)`: `_keycapPlaced[i]=true`; CheckDoneAssemble(); keycapObjects[i].CloneKeycap(visual) (copies the 3 sprites, active states, decorId, type); DOScale(1,0.2) OutBack → OnComplete UpdateGlowSprite().
- `PullBackKeycap(i)`: Play `sfx_assemble_remove`(53); `_keycapPlaced[i]=false`; keycapObjects[i].DOScale(0, 0) (instant).
- `ActiveKeychain()`: `_keychainPlaced=true`; CheckDoneAssemble(); `_srKeychain` DOScale(1,0.2) OutBack. `JustShowKeychain()`: keychainPlaced=true, keychain scale 1 instantly.
- `CheckDoneAssemble()`: if IsAssembleDone → `KMC.ShowResult()`.
- `GetDecorData()`: list of keycapObjects[i].DecorId (−1 = none).
- `ClickRandomKeycap()`: `_keycapClicks[Random.Range(0,count)].HandleClick()`.
- `RotateKeychain(on)`: target = `_srKeychain.transform.parent` (KeychainHolder). on: DOKill; DOLocalRotate(0,0,0, 0) then DOLocalRotate((0,0,-8), 2.0).SetEase(InOutSine).SetLoops(-1, Yoyo) (swinging). off: DOKill; DOLocalRotate((0,0,0), 0.3).
- `ApplyGlowColor()`: each KeycapClick.CreateGlowEffect(_switchGlowColor). `UpdateGlowSprite()`: each KeycapClick.UpdateGlow().

### 2.3 Clicker.KeycapObject (tray keycaps and case keycaps)
Children: `keycap` SR (`_srKeycap`), `top-decor` SR at (0,0.41) (`_srOnTop`), `replace` SR (`_srReplace`). Fields `_decorId`, `_decorKeycapType`, `_baseKeycapSprite`.
`SetDecor(spr, type, decorId)`: store decorId & type, then:
- None(0): keycap.sprite = spr; top-decor off; replace off; keycap on; `_baseKeycapSprite = spr`. (no anim)
- OnTop(1): keycap.sprite = `_baseKeycapSprite`; top-decor.sprite = spr, on; keycap on; replace off; SmallScale().
- Replace(2): replace.sprite = spr, on; top-decor off; keycap off; SmallScale().
- CustomPaint(3): only SmallScale().
- ReplaceButOnBase(4): keycap.sprite = spr; top-decor off; replace off; keycap on; SmallScale(). (`_baseKeycapSprite` NOT changed, so choosing a charm later restores the coloured keycap.)
`SmallScale()`: DOScale(1.1, 0.1) → OnComplete DOScale(1, 0.3).
`CloneKeycap(root)`: copy decorId, type, the 3 sprites and their activeSelf from `root`.

### 2.4 Clicker.SwitchObject: `SetVisual(spr)` → `_srSwitch.sprite`. Tray switch also has DraggableSwitch + BoxCollider2D.

### 2.5 Clicker.KeycapClick (world-space Canvas on each case keycap)
`_btnSetup` (ButtonSetup), `_btnFullEventTrigger` (ButtonFull with EventTrigger), `_keycapObject` (parent KeycapObject, found in Awake), `_soundClick` (ESound), `_glowSprite2DItem`.
- `Awake`: btnSetup.onClick → HandleSetup; EventTrigger entry **PointerDown (id 2)** → HandleClick; both buttons inactive initially (inferred: setup off).
- `TurnModeSetup(isSetup)`: ButtonFull active = !isSetup; ButtonSetup active = isSetup.
- `HandleSetup()`: if keycapObject → `_onSetupClick.Invoke()` → BaseKeycapObject.OnSetupKeycap(index).
- `HandleClick()` (a tap on the finished clicker):
  1. keycap DOKill, localScale = 1.
  2. base.HandFollowClick.ClickAt(keycap.transform) (moves the "HandComplete" hand if visible).
  3. If `UIManager.GetScreen<ScreenClickerLivestream>()` exists and is showing (inferred type): `ClickerPopCoin.SpawnOneCoin(this.transform.position)` and `KMC.ShowTapHandTutorial(false)`.
  4. Vibrate(40). If glow item exists → `DoGlow()`.
  5. keycap `DOLocalMoveY(-0.4, 0.1)` → OnComplete `DOLocalMoveY(0, 0.03)` (press-down/bounce).
  6. if `_soundClick != None` → PlaySound(_soundClick) (the switch sound, see §3.2).
- `CreateGlowEffect(color)`: if the visible keycap sprite object (keycap SR, else replace SR) is active → `_glowSprite2DItem = Light2DManager.BorrowGlowItem(thatSR.transform)`; glow.SetSprite(sprite of that SR); glow.SetColor(color); reset local scale/position (inferred one/zero).
- `UpdateGlow()`: if glow: re-parent it under the currently active visual (keycap or replace), localPos 0, sprite = that sprite, scale = 1.

### 2.6 Clicker.GlowSprite2DItem / Light2DManager (URP Light2D glow per keycap)
GlowSprite2DItem: `_light2D` (sprite light), `_spreadLight2D`; Awake: both intensities 0, `_currentValue=0`.
`SetColor(c)`: both lights color = c. `SetSprite(s)`: light2D sprite.
`DoGlow()`: kill tween; `DOTween.To(v, 0.1 /*end*/, 0.1 /*s*/)` OnUpdate: light.intensity = v, spread.intensity = v/0.1; OnComplete `To(v→0, 0.5)` same updates. (So each tap flashes a soft coloured glow 0→0.1 in 0.1 s then fades in 0.5 s.) In HTML: an additive blurred copy of the keycap sprite tinted with switch Color, alpha ∝ v/0.1.
Light2DManager: pool of GlowSprite2DItem under `_tfLightPoolHolder` using the scene template `Light 2D (Glow Effect)/Glow Light 2D`; `BorrowGlowItem(parent)` = reuse an inactive/available item or instantiate, parent to `parent`; `ReleaseAllItem()` = return all (called before leaving scene / leaving inspect).

### 2.7 Clicker.HandFollowClick (`HandComplete` under the case; hand_hold/hand_overlay/finger_overlay sprites)
`ShowHand(b)`: gameObject.SetActive(b). `ClickAt(target)`: `_movableHand` DOKill, localPosition = 0; `DOMove(target.position, 0.1).SetEase(InSine)` → OnComplete `DOLocalMove(0, 0.1).SetEase(OutSine)` (inferred return to rest).

### 2.8 Clicker.ClickerPopCoin (UIManager/Screen/PopCoin) – coin per tap
Fields: `_prefabType=Coin(5)` pool, `_coinParent=_rectCoinHolder` (= UIManager/Screen), `_endPosition=_coinLabel` = Money widget `MoneyIconImage`/money label (UIManager/Screen/Money...), `_duration=1.0`, `_uiCamera`=UICamera, offsets `_minX=-150,_maxX=150,_minY=-100,_maxY=100`.
`SpawnOneCoin(worldPos)`: p = WorldToCanvasLocal(worldPos) (MainCamera WorldToScreen → ScreenPointToLocalPoint in holder with UICamera); spawn pool coin under parent, scale 1, localPos = p; target = p + (Random(-150,150), Random(-100,100)); `DOLocalJump(target, jumpPower 10, 1 jump, 0.2 s)` → `MoveCoinTask`.
`MoveCoinTask(coin)`: `DOLocalMove(_endPosition.localPosition, 1.0).SetEase(InBack)` → OnComplete: PlaySound(jelly_Coin (6), volume 0.3); despawn coin; `ReactToCollectionCoin()`.
`ReactToCollectionCoin()`: label DOKill, scale reset 1; `DOPunchScale((0.5,0.5,0.5), 0.1, vibrato 10, elasticity 1).SetEase(InOutElastic)`; `MoneyManager.UpdateMoney(+1)`.
=> **Every tap during the 10 s livestream = +1 coin** (credited when the coin arrives, ~1.2 s later).

### 2.9 Clicker.PrinterMachine / PrinterRail / PrinterProcess / Printer2DButton / BasePrinterObject  (step 2)
Hierarchy `PrinterMachine` (0,5.35): `PrinterVisual` (printer), `PrinterProcess` (10 × `BG/BG` printer_progress_off, 10 × `Process/process` printer_progress_on (inactive), `status_off`/`status_on` lamp),
`PrinterRail` (`VerticalRail` printer_rail o11 at (0,1.3) → `HorizontalRail` printer_head o12 → `MaskHolder`; `Offset` (0,-1.28)), `MaskLeft`/`MaskRight` (SpriteMasks that reveal the printed case),
`BaseKeycapHolder/<x>_BasePrinter` (BasePrinterObject: Visual SR print_case_*, `Top`, `Bottom` transforms), `Printer2DButton` canvas (BtnMachineOn, BtnSpeedUp inactive), `hand_tutorial_temp` (handtap with DOTweenAnimation), `printer_overlay`.
PrinterRail data: `_minX=-1.87, _maxX=1.87` (world X), `_minY/_maxY` recomputed by SetLimit.
- `PrinterMachine.Awake`: Printer2DButton.Init(this) (BtnMachineOn → OnPrinterButtonClick, speed-up button → rail.SpeedUp); process.ResetStatus(); process.OnMachineStateChange(false).
- `ChangeBaseKeycap(prefab)`: destroy `_currentBasePrinter`; instantiate prefab under `_tfBasePrinterKeycapHolder`, localPos 0, scale 1; `OnBaseKeycapChange()` → `rail.SetLimit(Bottom.position.y, Top.position.y)` then `rail.ResetRails()`.
- `ResetStatus()`: `_isProcessing=false`; process reset/off; rails reset; hand tutorial active.
- `OnPrinterButtonClick()` (tap the green machine button): PlaySound(sfx_3d_printer_start 34); `_soundChannel = PlaySound(sfx_3d_printer_running 33, loop=true)`; hand tutorial off; start button interactable=false; process.ResetStatus(); process.OnMachineStateChange(true) (status_on shown); rails.ResetRails(); `_isProcessing=true`; `Printer3DUIContent.ShowBtnSpeedUp(true)`; `rail.StartMoveRail(onDone)`.
  onDone: stop running loop; PlaySound(sfx_3d_printer_complete 32, vol 0.3); ShowBtnSpeedUp(false); `IngameClickerScreen.ShowBtnNext(true)`; process.OnMachineStateChange(false); `_isProcessing=false`.
- `Update()`: while processing, every 0.1 s: `process.SetProcess(rail.Progress)`.
- `OnDisable/OnDestroy`: stop running sound channel.
- `PrinterProcess.ResetStatus()`: all 10 `process` lights inactive; `status_off` on, `status_on` off. `OnMachineStateChange(on)`: status_off.active=!on, status_on.active=on.
  `SetProcess(p 0..100)`: k = floor(p/10); light i active iff i ≤ k (so first light lit at 0 %, all 10 at ≥90 %).
- `PrinterRail.SetLimit(minY,maxY)`: `_minY = minY − Offset.localY`, `_maxY = maxY − Offset.localY` (Offset local y = -1.28 → head tip aligned with case bottom/top).
- `ResetRails()`: horizontal `DOMoveX(_maxX, 0)`, vertical `DOMoveY(_minY, 0)`, `_isSpeedUp=false`.
- `StartMoveRail(onDone)`: `MoveRailLeft()`; `_onRailMoveDoneEvent` = onDone.
- `MoveRailLeft()`: MaskLeft snapped (DOMoveY to MaskHolder.y, DOMoveX(_maxX) instantly), then MaskLeft & HorizontalRail `DOMoveX(_minX, speed)` **speed-based, Linear**, speed = 2 u/s normal, 20 u/s when sped up → OnComplete `MoveRailUpOneStep(cb)`; cb: if `_hasSignalStop` → clear flag, invoke done event; else `MoveRailRight()`.
- `MoveRailRight()`: mirror (MaskRight snapped to `_minX`, then MaskRight & HorizontalRail to `_maxX`), then up-step, then Left.
- `MoveRailUpOneStep(cb)`: VerticalRail `DOMoveY(y + 0.2, speed)` speed-based Linear, speed 1 u/s (10 when sped up); OnComplete: if vertical.y ≥ `_maxY` → `_hasSignalStop = true`; cb().
- `Progress` = clamp01((vertical.y − minY)/(maxY − minY))·100.
- `SpeedUp()`: kill all 4 tweens, `_isSpeedUp = true`, restart `MoveRailLeft()` from current position (10× faster).
Timing example (icecream case: Top 2.35, Bottom −1.57 → 3.92 tall ⇒ 20 passes): normal ≈ 20 × (3.74/2 + 0.2/1) ≈ 41 s; sped-up ≈ 4 s.
Visual: the printed case (BasePrinterObject sprite) is revealed by the SpriteMasks that follow the head (mask children under `MaskLeft`/`MaskRight`; whole printed area masked progressively) – implement as a clip rect from the case bottom to the current head Y.

### 2.10 Clicker.Printer3DUIContent (IngameClickerScreen/Printer3D-UIContent)
`_panel`, `_iconCoin` (BtnSpeedUp/Money), `_btnSpeedUp` (text "Speed Up" + coin "100"), `_btnNextPos`, `_commentHandler`, `_emojiFx`, `_chatInput`. const `_speedUpCost = 100`.
- `Init(screen)`: panel inactive; btnSpeedUp → OnBtnSpeedUpClick; chatInput.OnInit.
- `ShowContent()`: panel on; btnSpeedUp hidden; `screen.RegisterButtonNextEvent(next)`; BtnNext at `_btnNextPos`; emojiFx.Play; chatInput on; `commentHandler.IsEnableToSpawnComment = true` (printer comments, asset `CommentAsset_3D_printer`); if `IsFirstGame` → `_iconCoin` hidden (speed-up free).
  next: (inter ad) → ShowBtnNext(false); HideContent(); KMC.HidePrinterShowTray(); `screen.GoToStepSwitch()`.
- `OnBtnSpeedUpClick()`: if IsFirstGame → KMC.SpeedUpPrinter(), hide button (free). Else if Money ≥ 100 → SpeedUpPrinter; hide button; PlaySound(sfx_purchase_coin 47); `MoneyManager.UpdateMoney(-100)`. Else `ShowPopup<NotEnoughMoneyPopup>()`.
- `HideContent()`: panel off; emoji stop+clear; comments disabled.

### 2.11 Clicker.IngameClickerScreen (UIManager/Screen/IngameClickerScreen)
Fields: `_btnNext` (green "v" button, inactive), `_btnHome` (TopLeftUI/ButtonHome), `_livestreamPanel` (viewer count), panels, `_popupSelectColor`, `_tfHandTutorial` (`HandTutorial`, UI hand with DOTweenAnimation).
- `OnInit`: init every panel with this; btnNext → click sound(1) + `_onBtnNextClick.Invoke()`; btnHome → OnBtnHomeClick; livestreamPanel.Initialized(); `GameSession.SetActiveCharacter(false)` (inferred); `SimpleSceneTransition.FadeOut()` (scene fade-in).
- `OnShow`: if IsFirstGame → btnHome hidden; `SelectBaseKeycapPanel.ShowPanel()`; ShowBtnNext(false); livestreamPanel.OnShow().
- `RegisterButtonNextEvent(a)`: replaces the single Next listener. `ShowBtnNext(b)`, `SetBtnNextPosition(p)` (world position of each panel's BtnNextPos).
- `GoToStepPrinter()` → printer3DUIContent.ShowContent(). `GoToStepSwitch()` → selectSwitchPanel.ShowPanel(). `GoToStepKeycap()` → selectKeycapPanel.ShowPanel().
  `GoToStepDecorKeycap()` → popupSelectColor.Hide(); decorKeycapPanel.ShowPanel(). `GoToStepSelectKeychain()` → selectKeychainPanel.ShowPanel().
- `ShowPopupColor(tf)` → popupSelectColor.ShowAt(tf, 0). `HidePopupColor()`.
- `OnBtnHomeClick()`: PlaySound(click 1); ShowPopup<BackHomePopup>().
- `ShowTutorialAt(t)`: only if IsFirstClicker: `_tfHandTutorial.position = t.position`, active. `HideTutorial()`: inactive.

### 2.12 Selection panels: SelectBaseKeycapPanel / SelectSwitchPanel / SelectKeycapPanel / SelectKeychainPanel / DecorKeycapPanel
Common layout: bottom tab panel (`Panel` with BG "tab", category button(s), ScrollView grid of items cloned from the inactive template `…UIItem`). `_rtShowPos`/`_rtHidePos` give anchoredPositions.
- `Awake`: panel anchoredPosition = HidePos; panel inactive; `LoadData()`.
- `LoadData()`: for every config entry i (DataList order): ensure listItem[i] exists (Instantiate template under its parent); `item.SetData(data.Id, data.Icon)`; `item.SetUnlockStatus(data.UnlockMethod.Type, data.UnlockMethod.Value, userUnlocked = DataUser.HasUnlockedX(id) || Type==Unlocked)`; item active; `item.RegisterClickListener(onUse)`. Surplus items inactive. (Decor additionally `item.SetType(data.Type)`.)
- `ShowPanel()`: panel active; `DOAnchorPos(ShowPos, 0.5).SetEase(OutSine).OnComplete(tutorial)`; `screen.RegisterButtonNextEvent(next)`; BtnNext moved to `_btnNextPos`. tutorial: if `!_tutorialShown` → `screen.ShowTutorialAt(listItem[0].transform)` (only shows when IsFirstClicker).
- `HidePanel()`: `DOAnchorPos(HidePos, 0.5).SetEase(InSine)` → panel inactive.
- `OnItemSelect(id)`: for each item: `SetSelected(item.activeSelf && item.ID == id)`.
Per panel `onUse(id)` (runs after the item is unlocked/selected) and `next`:
| Panel | onUse(id) | next (BtnNext) |
|---|---|---|
| SelectBaseKeycap | `DataUser.UnlockClickerBase(id)`; KMC.SetBaseKeycapId(id); ShowBtnNext(true); OnItemSelect(id); tutorialShown=true; HideTutorial | HidePanel; ShowBtnNext(false); KMC.HidePreviewShowPrinter(); KMC.SpawnAssembleKeycap(); screen.GoToStepPrinter() |
| SelectSwitch | `UnlockClickerSwitch(id)`; KMC.SpawnSwitch(id); if Enum.TryParse(data.SoundName → ESound s): PlaySound(s) and KMC.SetSwitchSound(s); ShowBtnNext(true); OnItemSelect; tutorialShown=true; HideTutorial | HidePanel; ShowBtnNext(false); GoToStepKeycap |
| SelectKeycap | `UnlockClickerKeycap(id)`; KMC.SpawnKeycap(id); ShowBtnNext(true); `screen.ShowPopupColor(listItem[index].transform)` (→ colour 0 auto-applied); OnItemSelect; tutorialShown=true; HideTutorial | HidePanel; ShowBtnNext(false); HidePopupColor; GoToStepDecorKeycap; KMC.ShowStepDecorKeycap() |
| DecorKeycap | `UnlockClickerDecor(id)`; KMC.SetKeycapDecor(id, data.Sprite, data.Type); ShowBtnNext(true); OnItemSelect(id); DeselectAll(); base.JumpToNextKeycap(); tutorialShown=true; HideTutorial | ShowBtnNext(false); GoToStepSelectKeychain; KMC.ShowSelectKeychain(); HidePanel |
| SelectKeychain | `UnlockClickerKeychain(id)`; KMC.SetKeychain(id); ShowBtnNext(true); OnItemSelect; tutorialShown=true; HideTutorial | (inter ad) HidePanel; ShowBtnNext(false); HidePopupColor; KMC.PrepareAssembleStep() |
Next is only visible after something was chosen, except DecorKeycapPanel.ShowPanel which calls ShowBtnNext(true) immediately (decor optional).
DecorKeycapPanel specifics: 3 CategoryButtons `BtnOnTopDecor` (_btnCharm, icon ic_charm), `BtnReplaceDecor` (ic_keycap_S), `BtnPaintDecor` (inactive in scene; click only plays click sound).
`ShowPanel` additionally: all categories SetSelected(false), `_btnCharm.SetSelected(true)`, `ShowListDecorOnTop()`.
`OnDecorOnTopCategoryClick` / `OnDecorReplaceCategoryClick`: AudioHelper.PlayClickSound; all SetSelected(false); this one true; show list; `_scrollRect.DOVerticalNormalizedPos(1, 0.2).SetEase(OutSine)` (scroll to top).
`ShowListDecorOnTop`: item active iff Type==OnTop(1). `ShowListDecorReplace`: active iff Type==Replace(2) or ReplaceButOnBase(4). `DeselectAll`: every active item SetSelected(false) (so decor items never stay highlighted).
CategoryButton.SetSelected(b): `_goSelected` active=b; icon localScale = b ? 1.2 : 0.85 (inferred mapping of the two constants).

### 2.13 Clicker.ClickerUIItem (+ BaseKeycapUIItem, SwitchUIItem, KeycapUIItem, KeychainUIItem, DecorKeycapUIItem)
Children: NotSelected, Selected (box_item_selected), Icon, Check, AdLock (button_ads, "0/1"), CoinLock (button_coin + price text), OtherLock (ic_lock).
- `SetData(id, icon)`: `_id=id`, icon sprite, `_unlocked=false`.
- `SetSelected(b)`: Selected & Check active=b, NotSelected active=!b.
- `SetUnlockStatus(type, value, userUnlocked)`: `_priceCached=value`, `_unlockStatus=type`, `_unlocked=userUnlocked`. If userUnlocked: hide all locks, status=Unlocked. Else: Unlocked → no lock; Ads → AdLock only; Coin → CoinLock only, `_txtCoinPrice = value`; BlindBag/other → OtherLock only.
- `RegisterClickListener(onUse)`: btnFull.onClick = `OnItemClick(onUse)`.
- `OnItemClick(onUse)`: `PlayClickSound()` (click 1; SwitchUIItem overrides with nothing because the switch sound plays instead) then by status:
  Unlocked → SetSelected(true); onUse(id).
  Ads → (rewarded ad "unlock_item" = free) SetSelected(true); onUse(id); UpdateVisualUnlock().
  Coin → if Money ≥ price: PlaySound(sfx_purchase_coin 47); MoneyManager.UpdateMoney(-price); SetSelected(true); onUse(id); UpdateVisualUnlock(); else ShowPopup<NotEnoughMoneyPopup>.
  BlindBag → ShowPopup<PopupItemLocked>().ShowWithItem(icon sprite) (cannot be used here; obtained in Blind-bag mode).
- `UpdateVisualUnlock()`: status=Unlocked; all lock objects hidden. Persistence happens in onUse (`DataUser.UnlockClickerX(id)`) – so an item bought/ad-unlocked once stays unlocked.

### 2.14 Clicker.PopupSelectColor (IngameClickerScreen/PopupSelectColor)
7 buttons in order: White, Blue, Green, Pink, Purple, Red, Yellow (index = KeycapColors index). `_selected` = ring image (child of White), `_canvasGroup`, `_tfPanel` (with Arrow), `_tfSubPanel` (box_color).
- `Awake`: alpha 0, not interactable, no raycast. `Init`: button i → OnButtonClick(i).
- `ShowAt(parent, idx)`: `_isShowing=true`; panel.position = parent.position (arrow points at the tapped keycap item); subPanel `DOMoveX(this.transform.position.x, 0)` (keep the colour strip centred on screen); `_tfParent=parent`; `canvasGroup.DOFade(1, 0.3).SetEase(OutSine)` → interactable+raycast; `_selectedIndex=idx`; `OnButtonClick(idx)` (always idx 0 = White when a new keycap shape is chosen).
- `OnButtonClick(i)`: AudioHelper.PlayClickSound; KMC.SetKeycapColor(i); `_selected` reparented to button i, localPosition 0.
- `Hide()`: `_tfParent=null`; not interactable/raycast; `DOFade(0, 0.3).SetEase(InSine)`.

### 2.15 Drag & drop (assembly): Clicker.DragManager (`KeycapMakerController/TrayDragManager`) + DraggableClickerItem/DraggableSwitch/DraggableKeycap/DraggableKeychain
Lists: 9 switches (DragType Switch 0, sortOrder 2), 1 keychain (`KeychainPreview`, type 2, sortOrder 3), 9 keycaps (type 1, sortOrder 1). `_tfCurrentHolding` = `CurrentDragHolding` (SortingGroup on top). `_handOffset = (-0.4, 1.5, 0)`.
- `SetDraggable(b)`: every item `_allowDrag=b`; manager `_allowDrag=b`. `UpdateFallbackPosition()`: every item caches its current localPosition (after the tray moved down).
- `Update()` (only when `_allowDrag`): pointer = mouse or primary touch;
  press: world point (MainCamera.ScreenToWorldPoint, z 0); `_current = Pick(point)` (checks switches, then keychain, then keycaps; inferred: item whose Collider2D contains the point, AllowDrag true, not done, highest SortOrder). If found: `_tfOldParent=parent`; reparent to CurrentDragHolding; `_offset = item.pos − point + _handOffset`; `item.OnPickUp()`; Vibrate(50); `KMC.ShowDragHandTutorial(false)`.
  hold: item.position = point + `_offset` (item floats up-left of the finger).
  release: reparent to old parent; Vibrate(50); `CheckLogic()`; `_current=null`.
- `CheckLogic()` by DragType:
  Switch: i = base.CheckDropSwitch(item, **3.0**); i ≥ 0 → item.SetDone(); base.DropSwitchReal(i); item.OnDropped(i); PlaySound(sfx_assemble_put 52). else item.OnDropped(-1).
  Keycap: i = base.CheckDropKeycap(item, **2.5**) (slot must already have its switch); i ≥ 0 → SetDone; base.DropKeycapReal(i, item's KeycapObject); item.OnDropped(i); item.position = base keycapObjects[i].position; sound 52. else OnDropped(-1).
  Keychain: base.CheckDropKeychain(item, **2.0**) → base.ActiveKeychain(); SetDone; OnDropped; sound 52. else OnDropped(-1).
- DraggableClickerItem: `OnPickUp()` localScale = 0.9; `PlaySoundPickUp()` = sfx_assemble_hold 51; `SetDone()` isDone=true; `ActiveDragAgain()` isDone=false;
  `OnDropped(i)`: localScale = 1; if isDone → `_droppedSlot=i`, `_allowDrag=false`, gameObject inactive (the base object now shows the real part); else → localPosition = cached (snap back, no tween).
- DraggableKeycap overrides: `OnPickUp()`: base OnPickUp; all its SRs alpha → 1; `isDone=false`; if `_droppedSlot < 0` PlaySoundPickUp (51) else `base.PullBackKeycap(_droppedSlot)` (sfx_assemble_remove 53, slot emptied); `_droppedSlot=-1`.
  `PlaySoundPickUp()` = no-op override (sound only via the check above). `OnDropped(i)`: localScale 1; if isDone: `_droppedSlot=i`, its SRs alpha → 0 (stays as an invisible, still-draggable proxy on top of the slot so the player can pull the keycap out again); else snap back to cached localPosition.
Assembly completes the moment the last part lands (switches → keycaps (any order of keycap/slot) → keychain any time).

### 2.16 Clicker.TutorialDrag (hand animations) and Clicker.TutorialSelectKeycapBase
TutorialDrag (`_srHand` handtap, `_tfHand`, `_appearPos`, `_movePos[]`, `_endPos`, `_moveSpeed`):
`Show()`: kill; hand alpha 0; hand.position = appearPos; Sequence: Append `DOFade(1, 0.5)`; for each movePos Append `DOMove(pos, _moveSpeed)` Linear; Append `DOMove(endPos, _moveSpeed)` Linear; Append `DOFade(0,0.5)`; AppendCallback(hand.position = appearPos); `SetLoops(-1)` (Restart). `Hide()`: kill sequence & tweens, alpha 0.
- Drag hand (`TrayDragManager/TutorialDrag`, speed 0.5): Start (1.43,-2.45) → Move1 (0.58,-4.66) → End (0.09,4.75) — from a tray part up to the case. Shown after tray moves down (first clicker only), hidden at first pick.
- Tap hand (`BaseKeycapHolder/TutorialTap`, speed 0.2): Start (1.18,1.78) → Move1..Move4 alternating (-0.34,-0.98)/(0.46,0.25) → End (-0.17,-0.67): tapping the keycaps. Shown at livestream start (first clicker), hidden at first coin.
TutorialSelectKeycapBase (`TutorialBaseKeycap`: `tutorial sprite` SR + text "Choose a case to start !"; `_previewSprite = [case1_tut, case2_tut, case3_tut]`):
`ShowWithAnim()`: active; `Show1StepTutorial()`: `_tfPreviewKeycap.DOScale(0, 0.1).SetDelay(1.5)` → sprite = previewSprite[cur], cur = (cur+1)%3, `DOScale(1, 0.3).SetEase(OutBack)` → repeat. `HideTutorial()`: kill, inactive (on first case pick).
In-UI pointing hand (`IngameClickerScreen/HandTutorial`) – see ShowTutorialAt (points at first item of each panel, first clicker only).

### 2.17 Livestream: Clicker.ScreenClickerLivestream (UIManager/Screen/ScreenClickerLivestream), ClickerLivestreamController
Fields: `_btnHome`, `_livestreamPanel` (viewer counter), `_commentHandler` (asset `CommentAsset_Clicker_live`), `_emojiFx`, `_chatInput`, `_goProcess`=`ProcessBG`, `_imgProcess`=`ProcessBG/Process` (fill), `_liveTime = 10 s`.
- `OnInit`: btnHome → OnBtnHomeClick; chatInput.OnInit; livestreamPanel.Initialized.
- `OnShow`: livestreamPanel.OnShow; if IsFirstGame hide home; `StartLive()`.
- `StartLive()`: PlaySound(click 1); `VibrationManager.Haptic(4)`; emojiFx.Play; chatInput on; `KMC.ShowTapHandTutorial(true)`; commentHandler.IsEnableToSpawnComment = true; ProcessBG on; fill = 0 → `DOFillAmount(1, 10).SetEase(Linear)`; `_countDownTween = DOVirtual.DelayedCall(10, end)`.
  end: ProcessBG off; ShowTapHandTutorial(false); this.Hide(); `KMC.MoveResultToComplete(() => { KMC.ShowHandComplete(); ShowPopup<PopupClickerComplete>(); })`.
- `OnHide`: livestreamPanel.OnHide; emoji stop+clear; comments disabled. `OnDestroy`: kill countdown.
- `OnBtnHomeClick`: click sound, (inter) → ShowPopup<BackHomePopup>.
- `ClickerLivestreamController.PlayLiveCamera()` is empty (no camera effect).
Comments (CommentHandler, shared component): while enabled, every `GameConfig.SpawnCommentTimer = 0.8 s` (`_isRandomTimerComment=false`) one random line from the CommentAsset is spawned as a chat bubble with random viewer avatar; `_maxChatShowing = 3`, `_distanceComment = 10`, no spawn sound. No donation comments are triggered by Clicker code (the donate prefab only appears via other systems / ChatInput). Viewer count is driven by LivestreamPanel (GameConfig MinViewers/MaxViewers).

### 2.18 Popups
- **PopupDoneAssemble** (UIManager/Popup/PopupDoneAssemble: Title, BtnContinue, ConfettiFullscreen): `OnShow`: PlaySound(sfx_finish 45); confetti active. `OnHide`: confetti stop, inactive.
  BtnContinue: AudioHelper.PlayClickSound → (inter ad only if ClickerRewardClaimCount ≥ 4; ignore) → `ContinueToLivestream`: (inter) → Hide popup; `KMC.MoveResultToCenter()`; `ShowScreen<ScreenClickerLivestream>()`.
- **PopupClickerComplete** (Title, Compliment(Avatar, Message), RewardInfo(TxtEarnings, TxtTips), BtnAdReward "x2", BtnNoThanls, Confetti):
  `OnInit`: `_moneyReward = data_config_type==1 ? 500 : 400` (→ 500), `_moneyBonus = 100`; confetti inactive.
  `OnShow`: PlaySound(sfx_result_confetti 48); confetti on; pop-in: Title scale 0→1 0.3 OutBack; Compliment 0→1 0.3 OutBack delay 0.5; RewardInfo delay 0.75; BtnAdReward delay 1.0; BtnReward delay 1.5 (same 0.3 OutBack);
  `TxtEarnings = "+500"`, `TxtTips = "+100"`; if IsFirstClicker → IsFirstGame = IsFirstClicker = false; `ClickerPlayTime++`; save DataUser; `_imgCustomer.sprite` = current customer/viewer avatar (from a session singleton, inferred); ProfileManager.ObtainExperiencePoint(); **KMC.TrySaveKeycapToDatabase()**.
  `OnBtnRewardClick` (No thanks): click sound; both buttons disabled; `ClickerRewardClaimCount = min(count+1, 4)`; save; `MoneyManager.CollectMoney(500+100 = 600, 10 flying coins, cb)`.
  `OnBtnAdRewardClick` (x2, free): click sound; ad cb: disable buttons; `CollectMoney((500+100)*2 = 1200, 10, cb)`.
  cb: (inter) → `Light2DManager.ReleaseAllItem()`; `SimpleSceneTransition.FlashIn(GameConfig.HomeScene)`.
  `OnHide`: confetti stop/off.
- **CollectionFullPopup** (also in level1 as base of UnlockSlotPopup): `SetEventCallback(onBuy, price)`: price text = price (500), `_onBuySuccess` = onBuy.
  OnShow: buttons disabled; panel scale 0 → DOScale(1,0.3) OutBack → buttons enabled; `MoneyManager.ShowUp()` (money widget above popup). OnHide: `MoneyManager.BackToParent()`.
  BtnWatchAds: disable buttons; click sound; onBuy(); Hide. BtnCoin: disable; click sound; if Money ≥ price → UpdateMoney(-price), (inter) → onBuy() (+Hide, inferred) else re-enable + NotEnoughMoneyPopup. Close/NoThanks: click sound → (inter) → Hide.
- **PopupItemLocked** (Panel, Image (item), OkButton): `ShowWithItem(spr)` sets image; OnShow panel 0→DOScale(1, 0.2) OutBack, then close interactable; Close: click sound, disable, DOScale(0,0) → Hide.
- **BackHomePopup**: OnShow: buttons disabled, `_tfPanel` (scale 0 from OnInit) DOScale(1, 0.5) OutBack → enabled. Confirm: disable, click sound → (inter) → FlashIn(HomeScene). Cancel/Cancel2: click sound → Hide.
- **NotEnoughMoneyPopup** – generic (other spec).
- Home-only: CreateMorePopup / DeleteKeycapPopup / UnlockSlotPopup (§5).

### 2.19 Data: DataClicker / ClickerSaveData / ClickerSaveDataItem
`DataClicker : GameData`, saved via `DataManager.SaveData(key = type name "DataClicker" (inferred), ClickerSaveData)`.
`ClickerSaveData { int _maxKeycapAmount = 12; int _latestIndexCreated = 0; List<ClickerSaveDataItem> _savedKeycap }`.
`ClickerSaveDataItem { int Index; BaseKeycapId; SwitchId; KeycapId; KeycapColorId; KeychainId; List<int> DecorIdList (per keycap slot, -1=none); int Value (trade valuation, set by Trading.ClickerValuation.EnsureSnapshot – ignore) }`.
- `NewData()`: new ClickerSaveData(), save. `LoadData()`: load; null lists repaired.
- `RegisterNewKeycap(item)`: `_latestIndexCreated++`; `item.Index = _latestIndexCreated`; EnsureSnapshot; add; save.
- `GetKeycap(index)`: find by Index. `FreeSlotCount` = max − count. `CanAddNewKeycap()` = count < `_maxKeycapAmount`. `RemoveSavedKeycap(index)`: RemoveAll(k.Index==index), save.
- `TryCommitTrade(...)`: trading system (other spec).

---------------------------------------------------------------------------------------------------
## 3. Data / config

### 3.1 Unlock rules (Clicker.UnlockMethod {Type, Value})
Type: 0 Unlocked (free), 1 Ads (Value = ads needed, always 1 → treat as free tap), 2 Coin (Value = price), 3 BlindBag (locked here; shows PopupItemLocked; unlocked only when Blind-bag mode adds the id to the DataUser unlocked list).
User-unlocked ids are kept in DataUser lists (UnlockedClickerBase/Switch/Keycap/Keychain/Decor); every successful selection also calls UnlockClickerX(id) (idempotent add).
Coins: earned +1 per tap during the 10-s livestream, +600 (or +1200 with x2) at the end. Spent: printer Speed-Up 100 (free while IsFirstGame), coin-locked items (price), collection slot 500.

### 3.2 Switch sounds (ESound id) – played on switch pick in the panel and on every tap of the finished clicker
Blue_Switch 36, Pink_Switch 39, Red_Switch 41, Penguin_Switch 57, White_Switch 42, Green_Switch 38, Purple_Switch 40, Brown_Switch 37, Clear_Switch 54, Yellow_Switch 43, Fairy_Switch 55, Peach_Switch 56, Black_Switch 35, Silver_Switch 58.
Other sounds: click 1, jelly_Coin 6 (coin arrives, vol .3), sfx_3d_printer_complete 32 (vol .3), sfx_3d_printer_running 33 (loop), sfx_3d_printer_start 34, sfx_finish 45, sfx_purchase_coin 47, sfx_result_confetti 48, sfx_assemble_hold 51, sfx_assemble_put 52, sfx_assemble_remove 53. Music bgm_ingame_1 (4).

### 3.3 Numbers summary
Livestream 10 s; comment every 0.8 s; reward 500 + tip 100 (x2 = 1200); speed-up 100; slot 500; max collection 12 (+1 per bought slot); drag radii switch 3.0 / keycap 2.5 / keychain 2.0 world units; hand offset (-0.4,1.5); printer head speed 2 (20) u/s horizontal, step 0.2 at 1 (10) u/s; tray moves to local y −8 in 1.0 s; case appears scale 0→1 0.3 OutBack after 1.0 s; part spawn pop 0.3 OutBack, stagger 0.1; result pose tween 0.5 InOutSine; BG_Complete α .95 0.5 s; FinalEffect scale 1 0.5 OutBack; keychain swing ±(0→-8°) 2 s InOutSine yoyo; tap press −0.4 y 0.1 s + back 0.03 s; glow 0→0.1 in 0.1 s, →0 in 0.5 s; coin jump 0.2 s (power 10, ±150/±100 px), fly 1.0 s InBack; panel slide 0.5 OutSine in / InSine out.

### 3.4 Config tables (`_dataList`, data_config_type = 1)

**BaseKeycapConfig** (49; slots = SwitchAmount = number of switches/keycaps; prefab ref = so.json pathId)

| Id | icon | SwitchAmount (slots) | unlock | BaseKeycapObject prefab |
|---|---|---|---|---|
| 0 | ic_case_cloud | 3 | free | sharedassets0.assets:16089 |
| 1 | ic_case_container | 2 | free | sharedassets0.assets:17765 |
| 2 | icon_case_crate | 1 | free | sharedassets0.assets:15994 |
| 3 | ic_case_heart | 1 | Ad 1 | sharedassets0.assets:15995 |
| 4 | ic_case_avocado | 1 | Ad 1 | sharedassets0.assets:17770 |
| 5 | ic_case_1x3 | 3 | free | sharedassets0.assets:16091 |
| 6 | ic_case_2x1 | 2 | free | sharedassets0.assets:17766 |
| 7 | ic_case_2x2 | 4 | free | sharedassets0.assets:14889 |
| 8 | ic_case_3x1 | 3 | free | sharedassets0.assets:16088 |
| 9 | ic_case_3x2 | 6 | Coin 500 | sharedassets0.assets:15347 |
| 10 | ic_case_3x3 | 9 | Coin 300 | sharedassets0.assets:16954 |
| 11 | ic_case_fencenblue | 6 | Ad 1 | sharedassets0.assets:16087 |
| 12 | ic_case_bento | 4 | BlindBag | sharedassets0.assets:14891 |
| 13 | ic_case_4x1 | 4 | free | sharedassets0.assets:17333 |
| 14 | ic_case_blush | 4 | free | sharedassets0.assets:17059 |
| 15 | ic_case_2x2_choco | 3 | free | sharedassets0.assets:17629 |
| 16 | ic_case_clear | 4 | free | sharedassets0.assets:14890 |
| 17 | ic_case_banana | 1 | Coin 250 | sharedassets0.assets:15749 |
| 18 | ic_case_eggtreay | 4 | Coin 1500 | sharedassets0.assets:17297 |
| 19 | ic_ase_dumpling | 1 | free | sharedassets0.assets:15993 |
| 20 | ic_case_fence_brown | 4 | free | sharedassets0.assets:15559 |
| 21 | iuc_case_cream | 1 | Ad 1 | sharedassets0.assets:16002 |
| 22 | ic_case_ringbox | 2 | free | sharedassets0.assets:15561 |
| 23 | ic_case_toilet | 1 | free | sharedassets0.assets:16003 |
| 24 | ic_case_vase_brown | 1 | free | sharedassets0.assets:15999 |
| 25 | ic_case_woodbox | 1 | free | sharedassets0.assets:16004 |
| 26 | ic_case_pan | 1 | Coin 250 | sharedassets0.assets:15265 |
| 27 | ic_case_leaf_F | 1 | Coin 600 | sharedassets0.assets:15997 |
| 28 | ic_case_magic | 4 | Coin 500 | sharedassets0.assets:17332 |
| 29 | ic_case_nitendvo | 4 | Ad 1 | sharedassets0.assets:17060 |
| 30 | ic_case_ps5 | 2 | Ad 1 | sharedassets0.assets:17767 |
| 31 | ic_case_pumpkin | 1 | Coin 300 | sharedassets0.assets:16001 |
| 32 | ic_case_T | 5 | Coin 400 | sharedassets0.assets:16955 |
| 33 | ic_case_vaseoink | 1 | Coin 800 | sharedassets0.assets:15992 |
| 34 | ic_case_vasewhite | 1 | Coin 500 | sharedassets0.assets:16000 |
| 35 | ic_case_sand | 3 | Ad 1 | sharedassets0.assets:16090 |
| 36 | ic_case_2x2_phomai | 4 | Ad 1 | sharedassets0.assets:17296 |
| 37 | ic_case_stove | 1 | Ad 1 | sharedassets0.assets:16790 |
| 38 | ic_case_boxcake | 4 | BlindBag | sharedassets0.assets:15838 |
| 39 | ic_case_carton | 1 | BlindBag | sharedassets0.assets:17635 |
| 40 | ic_case_cooker | 1 | BlindBag | sharedassets0.assets:15998 |
| 41 | ic_case_durian | 1 | BlindBag | sharedassets0.assets:15996 |
| 42 | ic_case_fishbox | 2 | BlindBag | sharedassets0.assets:17768 |
| 43 | ic_case_laptop | 2 | BlindBag | sharedassets0.assets:15560 |
| 44 | ic_case_shoebox | 2 | BlindBag | sharedassets0.assets:15563 |
| 45 | ic_case_solid | 3 | BlindBag | sharedassets0.assets:16092 |
| 46 | ic_case_chest | 2 | BlindBag | sharedassets0.assets:15562 |
| 47 | ic_case_turtle | 1 | BlindBag | sharedassets0.assets:15200 |
| 48 | ic_case_ufo | 1 | BlindBag | sharedassets0.assets:16132 |

**SwitchConfig** (14; Icon is also the switch sprite on tray and case)

| Id | icon | SoundName (ESound) | glow Color | unlock |
|---|---|---|---|---|
| 0 | switch_blue | Blue_Switch | [0.0, 0.44, 1.0, 1.0] | free |
| 1 | switch_pink | Pink_Switch | [1.0, 0.0, 0.89, 1.0] | free |
| 2 | switch_red | Red_Switch | [1.0, 0.0, 0.03, 1.0] | free |
| 3 | switch_penguin | Penguin_Switch | [0.33, 0.76, 1.0, 1.0] | Ad 1 |
| 4 | switch_white | White_Switch | [0.77, 0.77, 0.77, 1.0] | Ad 1 |
| 5 | switch_green | Green_Switch | [0.0, 1.0, 0.05, 1.0] | free |
| 6 | switch_purple | Purple_Switch | [0.54, 0.0, 1.0, 1.0] | Coin 300 |
| 7 | switch_brown | Brown_Switch | [0.62, 0.19, 0.0, 1.0] | free |
| 8 | switch_clear | Clear_Switch | [0.77, 0.77, 0.77, 1.0] | Coin 500 |
| 9 | switch_yellow | Yellow_Switch | [0.8, 0.57, 0.01, 1.0] | free |
| 10 | switch_fairy | Fairy_Switch | [1.0, 0.0, 0.68, 1.0] | Coin 500 |
| 11 | switch_peach | Peach_Switch | [0.89, 0.42, 0.16, 1.0] | Ad 1 |
| 12 | switch_black | Black_Switch | [0.42, 0.42, 0.42, 1.0] | free |
| 13 | switch_silver | Silver_Switch | [0.55, 0.55, 0.55, 1.0] | free |

**KeycapConfig** (5 shapes × 7 colours)

| Id | Icon | KeycapColors[0..6] | unlock |
|---|---|---|---|
| 0 | keycap_1_white | keycap_1_white, keycap_1_blue, keycap_1_green, keycap_1_pink, keycap_1_purple, keycap_1_red, keycap_1_yellow | free |
| 1 | keycap_2_white | keycap_2_white, keycap_2_blue, keycap_2_green, keycap_2_pink, keycap_2_purple, keycap_2_red, keycap_2_yellow | free |
| 2 | keycap_3_white | keycap_3_white, keycap_3_blue, keycap_3_green, keycap_3_pink, keycap_3_purple, keycap_3_red, keycap_3_yellow | free |
| 3 | keycap_4_white | keycap_4_white, keycap_4_blue, keycap_4_green, keycap_4_pink, keycap_4_purple, keycap_4_red, keycap_4_yellow | free |
| 4 | keycap_5_white | keycap_5_white, keycap_5_blue, keycap_5_green, keycap_5_pionk, keycap_5_purple, keycap_5_red, keycap_5_yellow | free |

KeycapColors index = PopupSelectColor button index (0 White, 1 Blue, 2 Green, 3 Pink, 4 Purple, 5 Red, 6 Yellow).

**KeychainConfig** (37; Id:KeychainSprite[unlock], Icon = ic_<same>):
0:keychain_17[free] 1:keychain_27[free] 2:keychain_1[free] 3:keychain_12[Ad] 4:keychain_7[Ad] 5:keychain_3[free] 6:keychain_29[free] 7:keychain_31[free] 8:keychain_24[free] 9:keychain_5[free] 10:keychain_13[Coin600] 11:keychain_25[Ad] 12:keychain_23[free] 13:keychain_9[free] 14:keychain_6[free] 15:keychain_21[Coin150] 16:keychain_2[Coin200] 17:keychain_11[Ad] 18:keychain_15[Coin1000] 19:keychain_14[Ad] 20:keychain_10[free] 21:keychain_22[Ad] 22:keychain_8[Coin500] 23:keychain_18[free] 24:keychain_20[Coin1000] 25:keychain_19[free] 26:keychain_26[Coin250] 27:keychain_16[Ad] 28:keychain_4[Coin400] 29:keychain_28[Ad] 30:keychain_30[Coin600] 31:keychain_32[free] 32:keychain_33[Coin800] 33:keychain_34[Coin800] 34:keychain_35[Ad] 35:keychain_36[Coin500] 36:keychain_37[Ad]

**DecorKeycapConfig** `_dataList` (205 entries; Id:Sprite[unlock]; icon = `Icon` field). Type counts: OnTop(1) 95 (43 free, 6 Ad, 8 Coin, 38 BlindBag); Replace(2) 31; ReplaceButOnBase(4) 79. Rarity (0 Common,1 Rare,2 Epic,3 Legendary,99 Special) is only used by blind-bag random picks (`GetRandomDataLockedCommon/Rare`).
- OnTop (charm tab): 0:_0035_charm_bow[free] 1:_0042_charm_heart1 2:_0038_charm_mushroom_1 3:_0037_charm_mushroom_2[Ad] 4:charm_butterfly[Ad] 5:_0043_charm_heart2 6:_0045_Layer-11 7:charm_buoy[Coin200] 8:_0036_charm_coca[BB] 9:charm_bat 10:charm_button 11:charm_candy_2[Ad] 12:charm_volleyball 13:charm_book 14:charm_dragon[BB] 15:charm_cockie 16:charm_donut 17:charm_bolide[BB] 18:_0039_charm_cat[BB] 19:charm_lucky_cat[BB] 20:charm_starfish 21:charm_whale 22:charm_witch 23:charm_chicken[Coin200] 24:keycap_ufo[BB] 25:_0030_charm_apple[BB] 26:charm_cinnamoroll[Coin500] 27:charm_console[BB] 28:charm_dimsum 29:charm_ghost 30:charm_pizza[Coin300] 31:charm_potato[Ad] 32:charm_sauce 33:charm_duck[BB] 34:charm_dumpling[Coin300] 35:charm_paper[Coin150] 36:charm_slippers[Ad] 37:charm_skull[Coin200] 38–63: letters A..Z (_0015_charm_A … _0021_charm_Z)[free] 64–70,72–74,76–94: BB (snaill, hat, wheel, headset, mouse, capy, jellyfish, key, kiwi, pan, geta, sakura, umbrella, gummy_1, candy_1, alien, sun, wing, lemon, pearl, clover, candy1_pink, lid, sponge, cap, glasses, socks, cherry, wreath) 71:_0028_charm_gummy_2[Coin100] 75:charm_trap[Ad]. (unmarked = free)
- Replace (type 2): 95 keycap_dumpling,96 keycap_seal,101 keycap_cat[BB],102 banana,103 cookerlid,104 egg,106 pot[Ad],111 fish[Coin350],112 frog,115 meatball[Coin250],116 orange,117 Keycap_avocado[Coin300],123 rabbit,130 turtle[BB],131 pig,134 corn,135 cream1,136 cream2[Coin350],137 egg1[Coin200],138 egg2,139 penguin,141 egg3[Coin250],142 egg4,151 beer,152 capy[Coin500],153 durian[BB],154 rice[BB],155 shit,171 apple,174 catim,204 ufo (all `keycap_*`, unmarked free).
- ReplaceButOnBase (type 4, keycap_C_/R_/E_/L_ patterns + tulip/hydrangea): ids 97–203 not listed above; unlock mix: 16 free, 12 Ad, 14 Coin (100…1000), 37 BlindBag – read `so.json` key `sharedassets0.assets:14398` `_dataList` directly (fields Id, Icon, Type, Rarity, Sprite, UnlockMethod).

---------------------------------------------------------------------------------------------------
## 4. Tutorial / first-time behaviour
Flags: `IsFirstGame` (gates: Home buttons hidden in IngameClickerScreen & ScreenClickerLivestream; printer Speed-Up free and its coin icon hidden), `IsFirstClicker` (gates: UI pointing hand `ShowTutorialAt`, drag hand in assembly, tap hand in livestream). Both cleared in PopupClickerComplete.OnShow (first completed clicker).
Sequence for a first-time player:
1. TutorialBaseKeycap cycles case1/2/3_tut sprites above the printer with text "Choose a case to start !" (shown every visit, hidden on first pick). UI hand points at the first item of every panel (base, switch, keycap, decor, keychain) until the player taps any item in that panel (`_tutorialShown`).
2. Printer: `hand_tutorial_temp` (handtap sprite with DOTweenAnimation) next to the machine button (PrinterMachine._goHandTutorial; hidden when the button is pressed – inferred binding).
3. Assembly: TrayDragManager/TutorialDrag hand loops (tray → case) until the first pick.
4. Livestream: TutorialTap hand loops over the keycaps until the first tap that spawns a coin.
5. Complete: HandComplete hand auto-clicks 3–4 random keycaps (always, not only first time).

---------------------------------------------------------------------------------------------------
## 5. Home collection view (level1): ScreenClickerCollection / CollectionShelf / CollectionKeycapItem / KeycapGenerator / CreateMorePopup / DeleteKeycapPopup / UnlockSlotPopup
- **ScreenClickerCollection** (`_collectionShelfs` shelf-loop objects each holding 3 `KeycapItem`s; `_collectionItems` = all items in order; `_drag2D` AxisDrag2D vertical scroller; `_tfInspectPos`; `_petAtHome`; `_handTutorial`; const `_minShelfCount=4`).
  OnInit: buttons (Home, Back, RemoveKeycap); content on / preview off; items Init(this); `LoadSavedData()`.
  `LoadSavedData()`: saved = DataClicker list; n = min(saved.Count, items.Count); unlockedSlots = min(max(maxKeycapAmount, n)…, items.Count) (decoded: `m = maxKeycapAmount < n ? saved.Count : maxKeycapAmount; slots = min(m, items.Count)`);
  items[0..n) → SetData(CanInspect, saved[i]); items[n..slots) → SetData(Available); items[slots..] → SetData(Locked).
  `_showingShelfCount`: if n % 3 == 0 → (n ≥ 12 ? n/3 + 1 : 4) else (n ≥ 15 ? floor(n/3) : 4); clamped to shelves.Count−1; `UpdateShelf()` → AxisDrag2D.ScrollToTop and drag limit = shelf[_showingShelfCount].LimitBottomDragValue.
  OnShow: content on, preview off, Home on, Back off, Remove off, petAtHome off; hand tutorial shown if `!IsDoneTutorialCollection` (inferred) ; SetMultipleInput(false).
  `ShowPreviewClick(item)`: SetMultipleInput(true); hand off; collection content off, preview content on; Home off, Back on, Remove on; `_inspectItem=item`; `_inspectKeycap = item.KeycapGenerator.KeycapHolding`; `_inspectIndex = item index (data.Index)`; inspect.TurnModeSetup(false) (tap = play switch sound); reparent to `_tfInspectPos`; DOLocalMove(0, 0.1) Linear; DOScale(1, 0.1) Linear.
  `BackToCollection()`: SetMultipleInput(false); inspect.TurnModeSetup(true); content on/preview off; Home on, Back off, Remove off; reparent to the item; DOLocalMove(0,0.1); DOScale(0.35, 0.1).
  OnBtnRemoveKeycapClick: click sound; ShowPopup<DeleteKeycapPopup>().SetEventCallback(() => { DeleteCurrentKeycap(); BackToCollection(); }).
  `DeleteCurrentKeycap()`: remove saved item with Index == _inspectIndex, save, `LoadSavedData()`.
  `UnlockNewSlot()`: first item with state Locked → SetData(Available).
  OnBtnBack: click sound → (inter) → BackToCollection; Light2DManager.ReleaseAllItem. OnBtnHome: click sound → (inter) → hide screen, show Home, character on, petAtHome on.
- **CollectionShelf**: `Update` – if the shelf is above `_limitTop` or below `_limitBottom` (world y) hide it (localScale 0) else scale 1 (culling).
- **CollectionKeycapItem** (`_contentLock/_contentEmpty/_contentCanInspect`, buttons Lock/Available/Inspect): `SetData(state,data)`: Locked → ShowVisualLocked; Available → ShowVisualAvailable; CanInspect → if generator.CanGenerateThisItem(data) → ShowVisualCanInspect + GenerateKeycap(data) else `RemoveSavedKeycap(data.Index)` and Available.
  Visuals: exactly one of the three button+content pairs active.
  OnBtnLock: click sound → ShowPopup<UnlockSlotPopup/CollectionFullPopup>().SetEventCallback(onBuy, 500); onBuy: screen.UnlockNewSlot(); `maxKeycapAmount++`; save.
  OnBtnAvailable: click sound → ShowPopup<CreateMorePopup>(). OnBtnInspect: click sound → (inter) → screen.ShowPreviewClick(this).
- **KeycapGenerator** (`_keycapScale = 0.35`, `_baseKeycapObjectHolder`): `CanGenerateThisItem(d)` = base config & switch config exist for the ids.
  `GenerateKeycap(d)`: cache d; destroy old; Instantiate base prefab (BaseKeycapConfig[d.BaseKeycapId].BaseKeycapObject) under this; ShowBaseOnly; SetSwitch(switch.Icon); SetSwitchSound(parse SoundName); SetKeycap(KeycapConfig[d.KeycapId].KeycapColors[d.KeycapColorId], None); TurnModeSetup(true); keychain sprite = Keychain[d.KeychainId].KeychainSprite, JustShowKeychain; for each i: if DecorIdList[i] valid → SetKeycapIndex(i, decor.Sprite, decor.Type, id); RemoveSetupEvent; localScale = 0.35.
  `OnEnable`: after 0.1 s: SetSwitch again, glow color = switch Color → ApplyGlowColor, SetSwitchSound, TurnModeSetup(true), ShowAllNoAnim, RemoveSetupEvent, set layer "Inspect" recursively.
- **CreateMorePopup**: OnShow panel 0→1 0.3 OutBack then buttons enabled. CreateMore: click → (inter) → disable buttons, `FlashIn(GameConfig.ClickerScene)` (level2) + session bookkeeping. NoThanks/Close: click → (inter) → Hide.
- **DeleteKeycapPopup**: OnShow `_deleteCamera` on, panel 0→1 0.3 OutBack. Delete: click → (inter) → `_onConfirmDelete`. NoThanks: click → hide. OnHide: deleteCamera off.
- **UnlockSlotPopup** = CollectionFullPopup subclass (same behaviour).

## 6. Misc classes
- **CharmGame.CountDownStartStream / LivestreamCharmScreen**: legacy (not present in any exported scene). CountDown: text shows "3","2","1": each step `DOScale(1.2, 0.05)`+`DOFade(1,0.05)` then `DOScale(1,0.95)`+`DOFade(0,0.95)` Linear, then onDone + hide. LivestreamCharmScreen.OnShow → countdown → StartLive (click sound, haptic 4, emoji fx, chat on, comments on, 10-s delayed call that does nothing).
- **KeycapEffect** (level0 Loading title letters): Sequence per letter: `DOAnchorPosY(-31, 0.2)` InQuad then `DOAnchorPosY(-15, 0.2)` OutQuad, staggered, loop -1; `StopAnimate` → all letters y = -15.
- **Clicker.ClickerLivestreamController.PlayLiveCamera** – empty.

---------------------------------------------------------------------------------------------------
## 7. Implementation checklist
1. Scene boot: music bgm_ingame_1, Initiate() state (tray hidden, parts scale 0, BG_Table), TutorialBaseKeycap cycle, IngameClickerScreen → SelectBaseKeycapPanel slide-in 0.5 s.
2. Generic item grid (ClickerUIItem): lock badges, coin buy (−price, sound 47), ad = free, BlindBag → PopupItemLocked, persistence of unlocked ids in DataUser lists, single shared BtnNext with per-panel position/callback.
3. Case pick: preview swap anim (0.1 down / 0.3 OutBack), store SwitchAmount; Next → printer + instantiate case prefab.
4. Printer: button → start/run(loop) sounds; head sweep (speed-based 2 u/s, 0.2 up-steps at 1 u/s) between Bottom/Top of the BasePrinterObject; 10 progress lights; mask reveal; Speed-Up ×10 (100 coins, free first game); done → complete sound, Next appears; 3D-printer comments every 0.8 s.
5. Switch pick: spawn N tray switches (stagger 0.1, 0.3 OutBack, vibrate), play switch sound, set case switch sprite + click sound.
6. Keycap pick: spawn N keycaps, colour popup at item, colour 0 auto; colour buttons recolour all.
7. Decor: keycaps-only view + highlight frame; tap keycap = select slot; charm/replace tabs; apply rules of KeycapObject.SetDecor; auto-advance to next keycap; Next always available.
8. Keychain pick (tray preview + case sprite).
9. Assembly: tray to y −8 (1 s), case pop-in at 1 s, enable drag; drag rules/radii/offset; slot order (switch before keycap); pull-back keycaps; sounds 51/52/53; completion → ShowResult.
10. Result: pose tweens, BG .95, FinalEffect, keychain swing, glow lights per keycap (switch colour), PopupDoneAssemble (sfx_finish, confetti).
11. Livestream 10 s: fill bar, tap = switch sound + press bounce + glow + coin (+1, jump 0.2 → fly 1.0 InBack, punch label) + hand tutorial; comments 0.8 s.
12. Complete: pose to CompletePose, BG_Final fade 1, auto-click hand 3–4 taps; PopupClickerComplete (+500 / +100, staggered pop-ins, x2 option); clear first-time flags, ClickerPlayTime++, save clicker to DataClicker (max 12, CollectionFullPopup 500 to extend); collect 600/1200 → Home.
13. Home button → BackHomePopup → Home (nothing saved).
14. Home collection screen (§5): shelves of 3, slot states, inspect at 1.0 scale (tap to hear), delete, buy slot 500, empty slot → CreateMore → ModeClicker.
