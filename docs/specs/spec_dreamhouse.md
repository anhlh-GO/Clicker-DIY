# Dream House (room decorating): implementation spec

**Scene.** level5 = `Assets/_Game/Scenes/DreamHouse.unity` (`GameConfig.DreamHouseScene`). Exit goes to `GameConfig.HomeScene` (`Assets/_Game/Scenes/Home.unity`, level1) via `SimpleSceneTransition.FlashIn(HomeScene, hasMascot=true)`.

**Sources.** `dis/DreamHouse.*.s`, `dis/DreamHouseFirstGameTutorial.s`, `out/data/level5.json`, `out/data/sharedassets0.assets.json` (room prefabs), `out/data/so.json`.

**Sounds** (`Framework.ESound`): `click`=1, `SFX_Place`=31, `sfx_purchase_coin`=47. Every call is `AudioManager.PlaySound(id, volume 1, delay 0)`. This mode has no vibration.

**Ads.** Treat every `ShowInter` / `ShowRewarded` as completing at once with success. Skip `ShowCollap` (collapsible banner).

---------------------------------------------------------------------------------------------------
## 1. Overview / player flow

1. **Enter from Home.** `DreamHouseController.Start` runs these steps in order:
   - `SimpleSceneTransition.FadeOut()` (transition fade-in) and `CameraController.SetSizeHasClamp(13.5, true)` (ortho size 13.5).
   - Load `DreamHouseAsset` (so.json `sharedassets0.assets:14484`) and the `DataDreamHouse` save.
   - Show screen **ScreenInGame**.
   - `currentRoomIndex = save.CurrentRoomIndex`, `IsCompletedAllRoom = false`, then `StartRoom(currentRoomIndex)`.
   - On the very first entry (`PlayerPrefs "dream_house_play" == 0`): set that pref to 1, call `DreamHouseFirstGameTutorial.ShowIntro()`, and after `DOVirtual.DelayedCall(0.1s)` call `ShowHighlightAt(CurrentRoom.CurrentDecorItem.MarkPointTransform)`. See §4 for a caveat.
2. **Room.** A room is an instantiated prefab (`RoomConfig.RoomPrefab`) with N **DecorItem slots** (steps). Only the slot for the current step shows a bobbing **MarkPoint** (`mark_position` sprite). Steps run strictly in order 0,1,2,…
3. **Tap the MarkPoint** (world collider). It plays `click`, hides the MarkPoint, and opens the **DecorItemPanel** after 0.1 s. The panel is a bottom bar with 3 option cards.
4. **Tap a card to preview it.** The option's prefab is placed in the room at its configured position, with a sparkle particle and `SFX_Place`. Previews are free and can be changed any number of times.
5. **Buy a card** with the Coin button, the Ads button, or (very first purchase only) the Free button. The option stays placed, the step is saved as `stepIndex → optionIndex`, the panel hides, the progress bar animates, and the next slot's MarkPoint appears.
6. **Buy the last step** and the room is complete:
   - the next room is unlocked;
   - on the first completion, `IsFirstTime` is set false and saved;
   - the **Done** button appears and pulses.
7. **Done** shows an interstitial, then:
   - if every room is completed: go Home;
   - otherwise show **PopupNewRoom** ("New Room", with Decorate and X). **Decorate** destroys the current room and calls `StartRoom(next index)`. **X** closes the popup and stays; Done is still visible, so tapping it again reopens the popup.
8. **List house** (always visible) opens **PopupListRoom**, a grid of all rooms. Every room is selectable. Picking another room switches to it and restores its saved progress.
9. **Back** (home icon): `click`, interstitial `"back_decor"`, then `FlashIn(HomeScene, true)`.

Rooms in the data: **Room 1** (living room, 12 steps) and **Room 2** (kitchen, 14 steps). The full config table is in §5.

---------------------------------------------------------------------------------------------------
## 2. Scene layout (level5): objects the code references

```
HandTutorial_1 (inactive, world)  SR handtap o5, pos (0.44,-1.64), rotZ 100; DOTweenAnimation Scale -> 1.025, 0.3s, InOutQuint(16), Yoyo, loops -1 (autoplay)
CanvasPattern/Pattern              scrolling RawImage background (Scroller)
BG                                 SR BG_dreamhouse_reppeat-x o-1
Effects/DecorItemEffect            ParticleSystem (children blink, Sparks)  -> DecorItemPanel._decorItemEffect
DreamHouseController               DreamHouse.DreamHouseController (singleton)
  TutorialHandler                  DreamHouse.TutorialHandler (_handTutorials=[HandTutorial_1, HandTutorial_2]) + DreamHouseFirstGameTutorial
    -Highlight (-100,17.99)        SR mark_position o10; child Square (scale 50x50, SR Square o4 = dim overlay)  -> _tfHighlight
  TouchEffectTrigger               _canvas=UIManager canvas, _touchEffect=UIManager/FX_touch_UI
UIManager (Canvas)
  BG                               Img BG_dreamhouse_reppeat-x
  [Sceen]/ScreenInGame             CanvasGroup + DreamHouse.ScreenInGame
    Header/btnBack                 Img button_home       -> _backButton
    Header/ProgressBar             Img progress_bound, FillImage(progress_fill, Filled), TextProgress '0/12' -> _progressBar
    Body/Button: ListRoom          Img btn_room, text 'List house' -> _listHomeButton
    Body/ItemPanel                 CanvasGroup + DecorItemPanel; Content (HorizontalLayout spacing 25, centred)
       DecorItemUI, DecorItemUI (1), DecorItemUI (2)   (each 258x412; card = Button + CanvasGroup)
         Image (box_item) / -Selected (box_item_pick) / Icon / ButtonGroup:
           ButtonCoin (button_coin; 'Text: Price' + ic_coin_full)   -> _buttonCoin, _priceText
           -ButtonAds (button_blue; 'Get' + ic_ads)                -> _buttonAds
           -ButtonFree (button_green; 'Free')                      -> _buttonFree
    Body/-Button: Done             button_green 'Done'; DOTweenAnimation Scale relative +0.05, 0.5s, OutCubic(9), Yoyo, -1
    -HandTutorial_2 (UI)           Img handtap over first card (anchor 0.2843,0.0779, pos 49,76, 130x130); Scale->1.025 0.3s InOutQuint Yoyo -1
    Money                          MoneyManager coin counter (global coins)
  [Popup]/PopupListRoom            Overlay, Panel(board_tutorial): Button: Close (btn_redo), Title 'Dream House',
                                   Scroll View/Viewport/Content (GridLayout cell 934x470, spacing 50x30, 1 column, pad L15 T3)
  [Popup]/PopupNewRoom             Panel(board_popup_pink): Title_feature_2, 'New Room', Glow, Icon (kr1_wall_2_131310, static),
                                   DecorateButton (pulse 1.025 0.3s ease 17 Yoyo), CloseButton (button_x) = _backButton
  [Popup]/NotEnoughMoneyPopup      'Not enough coin', PurchaseButton (+1000 via ad), shared popup (see its own spec)
  BtnIntro (full-screen, Button not interactable, no listeners) -> _btnIntro
    Content -> _tfIntroContent: 'Welcome Home!' (+5 twinkle stars), 'Pick 1 of 3 items to decorate ', -'Tap anywhere to continue'
  FX_touch_UI                      UI ParticleSystem (touch feedback)
GameHandle/Main Camera             ortho size 13.5, pos z -10; CameraController (baseAspect 1.7778)
```

Room prefabs (sharedassets0): `Room_1` [3306] and `Room_2` [4934]. Both have this shape:
```
Room_x (RoomController, _decorItems = slots in step order)
  EmptyRoom (0,-0.05) SR normalroom o1         // empty room shell drawn under everything
  DecorItems/
    <SlotName> (DecorItem, _markPointButton = its MarkPoint)
      -<OptionN>  (inactive placeholder copies of option prefabs; code never activates them, so keep them hidden)
      -MarkPoint (x,y) SR mark_position o3, BoxCollider2D, ButtonObject, MarkPointAnimation
```

**Room_1 slots and MarkPoint positions** (local):

| step | slot | MarkPoint |
|---|---|---|
| 0 | Floor | (0, -1.77) |
| 1 | Wall | (0, 3.60) |
| 2 | Sofa | (2.29, 0.04) |
| 3 | Window | (-3.07, 1.92) |
| 4 | Television | (-2.80, -2.89) |
| 5 | Cabinet | (5.48, -1.05) |
| 6 | Table | (-0.65, -1.21) |
| 7 | Chair | (2.19, -3.16) |
| 8 | Lamp | (0.02, 2.06) |
| 9 | Picture | (3.34, 3.08) |
| 10 | Carpet | (-0.52, -1.85) |
| 11 | Plant | (-5.05, -1.02) |

**Room_2 slots and MarkPoint positions** (local):

| step | slot | MarkPoint |
|---|---|---|
| 0 | Floor | (0, -1.77) |
| 1 | Wall | (0, 3.60) |
| 2 | Frigde | (0.09, 1.07) |
| 3 | Sink | (1.66, -0.58) |
| 4 | Stove | (3.48, -1.14) |
| 5 | Table_1 | (5.33, -2.37) |
| 6 | Table_2 | (-0.77, -2.66) |
| 7 | Window | (-3.68, 3.38) |
| 8 | Cabinet_1 | (-3.16, -0.67) |
| 9 | Cabinet_2 | (2.24, 3.24) |
| 10 | Carpet | (0.62, -1.26) |
| 11 | Chair | (-1.81, -4.19) |
| 12 | Plant | (-5.74, -1.95) |
| 13 | Shelf | (5.14, 2.30) |

Notes:
- The `_decorItems` order matches the config step order (checked).
- In the Room_1 prefab only the Floor MarkPoint is active; code resets all of them anyway.
- Slot transforms sit at (0,0), so a config `Position` is effectively room-local.

---------------------------------------------------------------------------------------------------
## 3. Classes

### DreamHouseController (MonoSingleton)
**Fields:**
- `_uiManager`, `_dreamHouseAsset`, `_dataDreamHouse`, `_currentRoomIndex`;
- `CurrentRoom` (RoomController);
- `DecorItemPanel` (= ScreenInGame._decorItemPanel);
- `IsCompletedAllRoom`.

**`Start()`:** the steps listed in §1.1, in this order:
1. FadeOut, camera size 13.5.
2. Get the asset and the save.
3. `ShowScreen<ScreenInGame>`. Its OnInit subscribes to `RoomController.OnInitialized`, which is a **static** event.
4. `DecorItemPanel = screen.DecorItemPanel`.
5. `IsCompletedAllRoom=false`, `_currentRoomIndex=save.CurrentRoomIndex`.
6. `StartRoom(idx)`.
7. First-time intro block.

**`StartRoom(i)`:**
- If `i<0 || i>=Rooms.Count`: LogError "Invalid room index: " and return.
- `_currentRoomIndex=i`.
- If `CurrentRoom` exists, destroy its GameObject.
- `CurrentRoom = Instantiate(Rooms[i].RoomPrefab, position (0,1,0), identity).GetComponent<RoomController>()`. There is no parent. The y=1 comes from the Instantiate call's arguments.
- `CurrentRoom.Initialize(Rooms[i], this)`.

**`CompletedRoom()`:** destroy the `CurrentRoom` GameObject, set it to null, then `StartRoom(_currentRoomIndex)`. By this point the index already points at the *next* room (set by `UnlockNextRoom`).

**`UnlockNextRoom()`:**
- `_currentRoomIndex++`.
- If `< Rooms.Count`: `data.UnlockRoom(idx)`.
- Otherwise: log "No more rooms to unlock.", `_currentRoomIndex=0`, `IsCompletedAllRoom=true`.
- Then `data.SetCurrentRoomIndex(_currentRoomIndex)` (saves) and `data.LoadCurrentRoomSteps()`.

**`SaveCurrentRoomStep(opt)`:** `data.AddCurrentRoomStep(CurrentRoom._currentStep, opt)`.

### RoomController (on the room prefab root)
**Fields:** `_decorItems` (List<DecorItem>, serialized, step order), `_roomConfig`, `_dreamHouseController`, `_currentStep`, `CurrentDecorItem`.

**Events:** static `OnInitialized()`; instance `OnStepChanged(int)` and `OnRoomCompleted()` (both cleared in OnDestroy).

**`Initialize(cfg, ctrl)`:**
  ```
  for i in 0.._decorItems.Count-1: _decorItems[i].OnInit(cfg.DecorItems[i], OnMarkPointButtonPressed)
  _currentStep = data.GetCurrentRoomStep()          // = save.CurrentRoomSteps.Count
  if _currentStep < _decorItems.Count: CurrentDecorItem = _decorItems[_currentStep]; CurrentDecorItem.SetActiveMarkPoint(true)
  for (step, opt) in save.CurrentRoomSteps: _decorItems[step].CreateDecorItemObject(opt)   // restore placed decor
  OnInitialized?.Invoke()   // static -> ScreenInGame, PopupListRoom, TutorialHandler
  ```
  A fully finished room ends up with no MarkPoint, and its Done button stays hidden.

**`NextStep()`:**
  ```
  if _currentStep < Count-1:
      CurrentDecorItem.SetActiveMarkPoint(false); _currentStep++; CurrentDecorItem=_decorItems[_currentStep]
      CurrentDecorItem.SetActiveMarkPoint(true); OnStepChanged?.Invoke(_currentStep)
  else:  // last step bought
      log "No more steps available."; CurrentDecorItem=null
      OnStepChanged?.Invoke(_decorItems.Count)      // bar -> full
      _dreamHouseController.UnlockNextRoom()
      OnRoomCompleted?.Invoke()                     // ScreenInGame shows Done
      if data.IsFirstTime: data.IsFirstTime=false; data.SaveData()
  ```

**`IsFirstStep()`:** `_currentStep==0`.

**`OnMarkPointButtonPressed(item)`:**
- If `CurrentDecorItem==null`, return.
- Play `click`.
- `CurrentDecorItem.SetActiveMarkPoint(false)`.
- `asset = cfg.DecorItems[_currentStep]`, then `DOVirtual.DelayedCall(0.1, () => ctrl.DecorItemPanel.OnShow(asset))`.
- `TutorialHandler.SetActiveHandTutorial(0,false)`.
- `DreamHouseFirstGameTutorial.HideTutorial()`.

### DecorItem (one slot)
**Fields:** `_markPointButton` (ButtonObject on the child MarkPoint), `_currentDecorObject`, `_currentItemIndex` (starts at -1), `_decorItemAsset`.

**`OnInit(asset, cb)`:**
- Store the asset.
- `markPoint.SetInteractable(false)` and deactivate the MarkPoint GO.
- Add a listener on `markPoint.OnButtonPressed` that calls `cb(this)`.

**`SetActiveMarkPoint(b)`:** set the MarkPoint GO active to `b` and call `SetInteractable(b)`.

**`CreateDecorItemObject(i)`:**
- If an object exists and its index equals `i`, return it.
- Otherwise `RemoveDecorItemObject()` (Destroy).
- `_currentItemIndex=i`; `cfg=asset.ItemList[i]`.
- `obj=Instantiate(cfg.ItemPrefab, parent=this.transform)`.
- `localPosition=cfg.Position` (x,y,z), `localRotation=identity`, `localScale=(1,1,1)`.
- **No tween.** The object pops in; the panel provides the particle and the sound.

**`GetMarkPointPos()`:** world position of the MarkPoint.

### ButtonObject (MarkPoint click handler)
IPointerDown/Up on a 2D collider, through the camera's Physics2DRaycaster.
- **`Awake`:** cache the Collider2D. `_isInteractable` defaults to true.
- **`OnPointerDown`:** if interactable and `!Touch.IsPointerOverUIObject()`: `IsPressed=true`, invoke `OnButtonPressed`. **The action fires on pointer-down.**
- **`OnPointerUp`:** same guards; `IsPressed=false`, invoke `OnButtonReleased` (unused here).
- **`SetInteractable(b)`:** `collider.enabled=b`, `_isInteractable=b`.

### MarkPointAnimation (on the MarkPoint)
Nothing is serialized, so the constructor defaults apply: `_duration=0.8`, `_yValue=0.35`.
- **`OnEnable → Play()`:**
  - `_moveTween = transform.DOLocalMoveY(0.35, 0.8).SetLoops(-1, Yoyo).SetEase(InOutSine).SetRelative(true)`: bobs up 0.35.
  - `_scaleTween = transform.DOScale(1.1, 0.8).SetLoops(-1, Yoyo).SetEase(InOutQuad)`: pulses to 1.1×.
- **`OnDisable`:** kill both tweens. They are not completed, so the JS port should reset the base local position and scale on the next enable.

### DecorItemPanel (Body/ItemPanel)
**Fields:** `_canvasGroup`, `_decorItemEffect` (Effects/DecorItemEffect), `_items` (the 3 DecorItemUI), `_decorItemAsset`, `_dreamHouseController`, `_selectedItem`.

**`OnInit()`** (called from ScreenInGame.OnInit):
- Store the controller.
- Hide instantly: `FrameWorkUtility.SetActive(cg,false,0)` sets alpha 0 and interactable/blocksRaycasts false.
- `_selectedItem=null`.
- On each item: `AddListeners(OnSelectButtonClicked, OnCoinButtonClicked, OnAdsButtonClicked)`.

**`OnShow(asset)`:**
- `_decorItemAsset=asset`.
- For i in 0..2: `_items[i].OnInit(asset.ItemList[i], this)`.
- Show the panel CanvasGroup instantly (alpha 1).
- `ShowAnim().Forget()`.

**`ShowAnim()`** (UniTask):
  ```
  foreach item: item.OnShow(); await WaitForSeconds(0.15)
  if data.IsFirstTime && CurrentRoom._currentStep == 0: TutorialHandler.SetActiveHandTutorial(1, true)
  ```

**`OnHide()`:** hide instantly, `_selectedItem=null`.

**`SetInteractableItems(b)`:** `item.SetInteractable(b)` on all items.

**`SetSelectedItem(ui)`:** if `ui` differs from `_selectedItem`, deactivate the old item's `Selected` GO, then set `_selectedItem=ui` and activate its `Selected` (box_item_pick).

**`CreateDecorItemObject(ui)`** (used by both preview and commit):
  ```
  idx = _items.IndexOf(ui)
  CurrentRoom.CurrentDecorItem.CreateDecorItemObject(idx)
  _decorItemEffect.transform.position = CurrentDecorItem.GetMarkPointPos(); _decorItemEffect.Play()
  TutorialHandler.SetActiveHandTutorial(1, false); TutorialHandler.DoneTutorial()   // IsDoneTutorial = true (saved)
  play SFX_Place (31)
  ```

**`OnSelectButtonClicked(ui)`** (tap on the card body):
- If `DataUser.IsUnlockedDreamHouse` is false: set it true and save.
- If `ui.IsUnlocked`: return. It is always false while the panel is open.
- Play `click`, then `CreateDecorItemObject(ui)` and `SetSelectedItem(ui)`.
- **This is only a preview. Nothing is saved.**

**`OnCoinButtonClicked(ui)`** (the Coin button and also the Free button):
  ```
  play click; set DataUser.IsUnlockedDreamHouse=true (save if changed)
  if ui.Price > DataUser.GetMoney(): UIManager.ShowPopup<NotEnoughMoneyPopup>() (inferred type); return
  MoneyManager.UpdateMoney(-ui.Price); play sfx_purchase_coin (47)
  commit(ui)
  ```

**`OnAdsButtonClicked(ui)`:**
- Play `click` and `sfx_purchase_coin` at once.
- `AdsManager.ShowRewarded("unlock_decor", onDone)`.
- `onDone`: set IsUnlockedDreamHouse (save if changed), then `commit(ui)`.

**`commit(ui)`** (inlined in both buy paths):
  ```
  SetInteractableItems(false); CreateDecorItemObject(ui)  // same index -> object kept; particle + Place sound replay
  ui.Unlocked(); SetSelectedItem(ui)
  OnHide()  (instant alpha 0); _selectedItem=null
  ctrl.SaveCurrentRoomStep(_items.IndexOf(ui))   // persist step -> option
  ctrl.CurrentRoom.NextStep()
  ```

### DecorItemUI (one card)
**Fields:**
- `_selectButton` (card Button), `_buttonCoin`, `_buttonAds`, `_buttonFree`;
- `_icon`, `_priceText` (ButtonCoin/'Text: Price'), `_selectedObject` (Selected);
- `_canvasGroup`, `_rectTransform`, `_initialYPosition`;
- `DecorItemConfig`, `IsUnlocked`, `Price`.

**`AddListeners` wiring:**

| button | handler |
|---|---|
| `_selectButton` | onSelected |
| `_buttonFree` | **onCoin** |
| `_buttonCoin` | onCoin |
| `_buttonAds` | onAds |

**`OnInit(cfg, panel)`:**
  ```
  _initialYPosition = rect.anchoredPosition.y; DecorItemConfig=cfg; IsUnlocked=false; SetInteractable(true)
  _icon.sprite = cfg.Icon; SetPrice(cfg)
  if DataUser.IsUnlockedDreamHouse:            // normal case
      Free hidden; Ads visible iff cfg.UnlockType==Ads(1); Coin visible iff cfg.UnlockType==Coin(2)
  else:                                        // very first visit, before any card was ever touched
      Free visible; Ads hidden; Coin hidden; Price = 0
  Selected hidden; CanvasGroup alpha 0 instantly
  ```

**`SetPrice(cfg)`:**
- `Price = cfg.Price`.
- If `DataDreamHouse.IsFirstTime && CurrentRoom.IsFirstStep()`: `Price = 0`. This makes the first step of the first room free.
- `_priceText = Price.ToString()` (format "{0}").

**`OnShow()`** (entry animation):
- `rect.DOKill()`, then set `anchoredY = initY - 100`.
- Fade the CanvasGroup to 1 over 0.5 s (`FrameWorkUtility.SetActive(cg,true,0.5)`, which uses DOFade).
- `rect.DOAnchorPosY(initY, 0.5)` with the default ease (DOTween's default, normally OutQuad).

**`Unlocked()`:** `IsUnlocked=true`; hide the Coin, Ads and Free buttons.

**`SetInteractable(b)`:** set `.interactable=b` on all 4 buttons.

**`SetSelected(b)`:** sets the Selected GO active. `SetFreeToBuy()` sets `Price=0` (unused).

### ProgressBar (Header/ProgressBar)
**Fields:** `_progressValue` (FillImage), `_progressText` (TextProgress), `_maxValue`.
- **`SetActive(b)`:** set the GO active. If `b`: `fill.DOKill()`, `fillAmount=0`.
- **`SetProgressValue(v)`:** `fillAmount = v/max`, text `"{v}/{max}"` (instant).
- **`DoProgressValue(v, dur)`:** `fill.DOKill()`, `fill.DOFillAmount(v/max, dur)` (default ease). The text updates instantly.

### ScreenInGame (ScreenBase)
**Fields:** `_backButton`, `_doneButton`, `_listHomeButton`, `_progressBar`, `_decorItemPanel`. Constant `PrefKey_RateUsShown="RateUsShown"`.

**`OnInit`:**
- Wire Back, Done and ListHome.
- Subscribe `RoomController.OnInitialized += OnRoomInitializedCallback` (static event).
- `_decorItemPanel.OnInit()`.

**`OnShow`:** ShowCollap ad (skip), then `CheckShowBtnBack()`. That method fetches DataUser and does nothing with it, so the back button is always visible.

**`OnRoomInitializedCallback()`:**
  ```
  Done GO inactive; DecorItemPanel.OnHide()
  bar._maxValue = CurrentRoom.RoomConfig.DecorItems.Count; bar.SetActive(true); bar.SetProgressValue(CurrentRoom._currentStep)
  CurrentRoom.OnStepChanged += OnStepChangedCallback; CurrentRoom.OnRoomCompleted += OnRoomCompletedCallback
  CheckShowButtonListHome()  // ListRoom button always active
  ```

**`OnStepChangedCallback(step)`:** `bar.DoProgressValue(step, 0.3)`.

**`OnRoomCompletedCallback()`:** activate the Done GO (its DOTweenAnimation makes it pulse).

**`OnBackButtonClicked()`:**
- Play `click`.
- `ShowInter("back_decor", noop)`.
- `FlashIn(HomeScene, true)` right away. Both RateUsShown branches do the same thing.

**`OnDoneButtonClicked()`:** play `click`, then `ShowInter("done_decor", cb)`. In `cb`:
- if `ctrl.IsCompletedAllRoom`: `FlashIn(HomeScene, true)`;
- otherwise `ShowPopup<PopupNewRoom>()`.

**`OnListHomeButtonClicked()`:** play `click`, then `ShowPopup<PopupListRoom>()`.

### PopupListRoom (PopupBase; standard PopupBase show/hide)
**`OnInit`:**
- Wire Close.
- Subscribe `OnInitialized += OnRoomInitializedCallback` (static).
- `_roomItems=[]`.
- For each RoomConfig: `Instantiate(_roomItemPrefab [sharedassets5.assets:60], _content).OnInit(cfg, OnSelectRoomCallback)` and add it to `_roomItems`.

**`OnShow`:**
- `Refresh()`: every item gets `SetUnlocked(true)`. `UnlockedRooms` is **not** consulted.
- ShowCollap (skip).

**`OnRoomInitializedCallback`:** `SetSelectedRoom(_roomItems[asset.Rooms.IndexOf(CurrentRoom.RoomConfig)])`.

**`SetSelectedRoom(it)`:** if `it` differs from the current one, deactivate the old item's `_selectedObject`, set `it` as current, and activate its `_selectedObject`.

**`OnSelectRoomCallback(it)`:**
- Play `click`.
- If `it == _selectedRoomItem`: return (the popup stays open).
- Otherwise:
  1. `idx = IndexOf(it)`.
  2. `data.SetCurrentRoomIndex(idx)` (saves).
  3. `data.LoadCurrentRoomSteps()`.
  4. `ctrl.StartRoom(idx)`.
  5. `SetSelectedRoom(it)`.
  6. Close the popup (virtual Hide).

**`OnButtonCloseClicked`:** play `click`, close.

### RoomItemUI (list cell prefab)
- **`OnInit(cfg, cb)`:**
  - `_selectButton` calls `cb(this)`;
  - `_iconImage.sprite = cfg.Icon` (`thumbnai_livingroom` / `thumbnai_bedroom`);
  - hide the selected frame.
- **`SetUnlocked(true)`:** hide the lock image, make the button interactable. `SetUnlocked(false)` does the reverse but is never called.
- **`SetSelected(b)`:** toggles the selected frame.

### PopupNewRoom (PopupBase)
- **`OnShow`:**
  - `panel.DOKill()`;
  - `panel.localScale=0`;
  - `panel.DOScale(1, 0.36).SetEase(OutBack)`.
  - The Icon is **not** updated by code and stays `kr1_wall_2_131310`.
- **`_backButton`** (CloseButton X): play `click`, then `ShowInter("dreamhouse_back_room", Hide)`.
- **`_decorateButton`:** play `click`, then `ShowInter("dreamhouse_decorate_room", () => { Hide(); ctrl.CompletedRoom(); })`.

### TutorialHandler (singleton on DreamHouseController/TutorialHandler)
**`Initiate`:** `_dataDreamHouse = DataManager.GetData<DataDreamHouse>()`. OnEnable/OnDisable subscribe/unsubscribe `OnRoomInitialized` on the static `RoomController.OnInitialized`.

**`OnRoomInitialized()`:** if `!IsDoneTutorial && IsFirstTime && GetCurrentRoomStep()==0`, call `SetActiveHandTutorial(0, true)`.

**`SetActiveHandTutorial(i, b)`:**
- If `IsDoneTutorial`: return.
- If the index is out of range: LogError "Invalid tutorial index: ".
- Otherwise `_handTutorials[i].SetActive(b)`, only when the state actually changes.
- Index 0 = `HandTutorial_1`, the world hand near the first MarkPoint. Positions:
  - Floor MarkPoint: room-local (0,-1.77); with the room's y+1 offset that is world (0,-0.77).
  - Hand: world (0.44,-1.64), rotZ 100.
- Index 1 = `ScreenInGame/HandTutorial_2`, the UI hand over the first card.

**`DoneTutorial()`:** `data.SetDoneTutorial(true)` (saves).

### DreamHouseFirstGameTutorial (same GO)
**Fields:**
- `_btnIntro` (UIManager/BtnIntro);
- `_goScreenInGame` (**not serialized in level5, so null**);
- `_tfHighlight` (Highlight);
- `_tfIntroContent` (BtnIntro/Content).

**`Initiate`:** deactivate BtnIntro and Highlight; set `introContent.localScale = 0`.

**`ShowIntro()`:**
1. `introContent.DOScale(1, 0.5).SetEase(OutBack)`.
2. `_goScreenInGame.SetActive(false)`.
3. Activate `_btnIntro`.

**`ShowHighlightAt(t)`:** `highlight.SetParent(t)`, `localPosition=0`, activate. The result is the mark sprite plus a 50×50 dim square sitting on the current MarkPoint.

**`ShowBackScreenInGame()`:** activates the highlight (unused).

**`HideTutorial()`** (called on every MarkPoint press):
1. `highlight.SetParent(this.transform)` and deactivate it.
2. Activate `_goScreenInGame`.
3. `introContent.DOScale(0, 0.5).SetEase(InBack).OnComplete(btnIntro inactive)`.

### TouchEffectTrigger
**`Update`:** if `Pointer.current.press.wasPressedThisFrame`:
- convert the screen position to canvas-local with `ScreenPointToLocalPointInRectangle(canvasRect, pos, canvas.worldCamera)`;
- set `FX_touch_UI.localPosition` to that point;
- `Play(true)`.

This runs on every tap, anywhere on screen.

### Data classes: DreamHouseAsset / RoomConfig / DecorItemAsset / DecorItemConfig
- **`DreamHouseAsset`:** `Rooms: List<RoomConfig>`; `GetRoomConfigByIndex(i)`, `GetRoomConfigIndex(cfg)` (IndexOf).
- **`RoomConfig`:** `{ Name, Icon, RoomPrefab, DecorItems: List<DecorItemAsset> }`; `GetDecorItemAssetByIndex(i)`, `GetDecorItemAssetCount()`.
- **`DecorItemAsset`:** `{ ItemList: List<DecorItemConfig> }`, always 3 options; `GetDecorItemConfigByIndex(i)`.
- **`DecorItemConfig`:** `{ Icon, ItemPrefab, Position (Vector3, room-local), UnlockType (Games.Common.EUnlockType: Unlocked0, Ads1, Coin2, Day3, Level4, IAP5), Price }`.
- `EDecorType` (Floor0..Plant11) is declared but runtime code never uses it.

---------------------------------------------------------------------------------------------------
## 4. Tutorial / first-time behaviour

**Flags involved:**

| flag | starts as | becomes |
|---|---|---|
| `DataDreamHouse.IsFirstTime` | **true** (new save) | false when the first room is completed |
| `DataDreamHouse.IsDoneTutorial` | false | true on the first card **preview or purchase** |
| `DataUser.IsUnlockedDreamHouse` | false | true on the first card interaction of any kind |
| PlayerPrefs `dream_house_play` | 0 | 1 on first entry |

**First session, step by step:**
1. Room 1 loads at step 0. `TutorialHandler.OnRoomInitialized` shows **HandTutorial_1**, the world hand pulsing near the Floor MarkPoint.
2. Because `dream_house_play==0`, `ShowIntro()` runs, and a 0.1 s DelayedCall should move the **Highlight** onto the Floor MarkPoint.
3. Tapping the MarkPoint hides HandTutorial_1 and calls HideTutorial. The panel opens; after the card stagger, **HandTutorial_2** appears over card 1 (condition: `IsFirstTime && step==0`).
4. The cards show the green **Free** button instead of Coin/Ads, because `IsUnlockedDreamHouse` is false. Price is 0, which the IsFirstTime + first-step rule also guarantees.
5. The first card tap or purchase sets IsDoneTutorial=true and hides HandTutorial_2. Every later hand call is ignored.
6. From step 1 on, normal prices apply, and the Coin/Ads buttons show on the *next* `OnShow`. The price-0 rule for step 0 only holds while `IsFirstTime` is true, which in practice means Room 1 only.

**Caveat for step 2.** `_goScreenInGame` is null in the shipped scene, so the original code throws inside `ShowIntro` right after the content DOScale starts. As a result:
- BtnIntro is never activated;
- the rest of `Start` is skipped, including the DelayedCall that places the highlight;
- the PlayerPrefs flag has already been written, so this never retries.

So the original player sees **no "Welcome Home!" overlay and no highlight, only the hand**. The intended design was an intro overlay ("Welcome Home! / Pick 1 of 3 items to decorate") with ScreenInGame hidden and the highlight on the MarkPoint, all hidden when the MarkPoint is tapped. Recommendation: implement the observable behaviour by default, and keep the intended version behind a flag.

---------------------------------------------------------------------------------------------------
## 5. Data / config

**Prices** are in global coins (`DataUser.Money`, deducted via `MoneyManager.UpdateMoney(-price)`).

**Pattern in every slot:** options 0 and 2 cost coins, option 1 is a free "Get" behind a rewarded ad.

**Coin cost per step:**
- Room 1: 300, 300, 600, 1000, 2000, 2000, 4000, 4000, 8000, 8000, 10000, 10000. Paying coins for every step totals 50,200 (49,900 on the first run, because step 0 is free).
- Room 2: 300, 300, 600, 600, 1000, 1000, 2000, 4000, 2000, 4000, 8000, 8000, 10000, 10000. Total 51,800.

**What a card uses:** it displays `cfg.Icon`; the placed object is `Instantiate(cfg.ItemPrefab)` under the slot, at `cfg.Position`.

**Table columns:**
- **step / opt** = `CurrentRoomSteps` key / value;
- **prefab** = ItemPrefab name [sharedassets0 pathId];
- **icon** = card sprite.

#### Room 1 (`Room_1`, prefab `Room_1` [sharedassets0.assets:3306], icon `thumbnai_livingroom`) — 12 steps

| step | opt | config | position (x,y,z) | unlock | price | prefab | icon |
|---|---|---|---|---|---|---|---|
| 0 | 0 | Room1_Floor_1 | (0.0, 0.0, -1.0) | Coin | 300 | FloorOption1 [2750] | lr1_ground_1_0202 |
| 0 | 1 | Room1_Floor_2 | (0.0, 0.0, -1.0) | Ads | 0 | FloorOption2 [3935] | lr2_ground_1_0202 |
| 0 | 2 | Room1_Floor_3 | (0.0, 0.0, -1.0) | Coin | 300 | FloorOption3 [5187] | lr3_ground_1_020201 |
| 1 | 0 | Room1_Wall_1 | (0.0, 0.0, 0.0) | Coin | 300 | WallOption1 [4705] | lr1_wall_1_131310 |
| 1 | 1 | Room1_Wall_2 | (0.0, 0.0, 0.0) | Ads | 0 | WallOption2 [6073] | lr2_wall1_2_131310 |
| 1 | 2 | Room1_Wall_3 | (0.0, 0.0, 0.0) | Coin | 300 | WallOption3 [4210] | lr3_wall_2_131310 |
| 2 | 0 | Room1_Sofa_1 | (2.67, -0.63, -4.0) | Coin | 600 | SofaOption1 [5873] | lr1_sofa_1_0306003 |
| 2 | 1 | Room1_Sofa_2 | (2.67, -0.63, -4.0) | Ads | 0 | SofaOption2 [4527] | lr2_sofa_1_030403 |
| 2 | 2 | Room1_Sofa_3 | (2.67, -0.63, -4.0) | Coin | 600 | SofaOption3 [3707] | lr3_sofa_2_050303 |
| 3 | 0 | Room1_Window_1 | (-3.43, 1.96, -2.0) | Coin | 1000 | WindowOption1 [3267] | lr1_window_1_100108 |
| 3 | 1 | Room1_Window_2 | (-3.43, 1.96, -2.0) | Ads | 0 | WindowOption2 [6031] | lr2_window_1_100108 |
| 3 | 2 | Room1_Window_3 | (-3.43, 1.96, -2.0) | Coin | 1000 | WindowOption3 [5355] | lr3_window_2_100108 |
| 4 | 0 | Room1_Television_1 | (-2.66, -3.68, -6.0) | Coin | 2000 | TelevisionOption1 [4349] | lr1_television_1_020603 |
| 4 | 1 | Room1_Television_2 | (-2.66, -3.68, -6.0) | Ads | 0 | TelevisionOption2 [5811] | lr2_television_1_020603 |
| 4 | 2 | Room1_Television_3 | (-2.57, -3.31, -6.0) | Coin | 2000 | TelevisionOption3 [3539] | lr3_television_2_050205 |
| 5 | 0 | Room1_Cabinet_1 | (5.63, -2.22, -5.0) | Coin | 2000 | CabinetOption1 [2596] | lr1_cabinet_1_020302 |
| 5 | 1 | Room1_Cabinet_2 | (5.63, -2.22, -5.0) | Ads | 0 | CabinetOption2 [3169] | lr2_cabinet_1_020303 |
| 5 | 2 | Room1_Cabinet_3 | (5.52, -1.93, -5.0) | Coin | 2000 | CabinetOption3 [4870] | lr3_cabinet_1_030203 |
| 6 | 0 | Room1_Table_1 | (-0.66, -2.01, -5.0) | Coin | 4000 | TableOption1 [6514] | lr1_table_1_030302 |
| 6 | 1 | Room1_Table_2 | (-0.66, -2.01, -5.0) | Ads | 0 | TableOption2 [5143] | lr2_teatable_1_040401 |
| 6 | 2 | Room1_Table_3 | (-0.66, -2.01, -5.0) | Coin | 4000 | TableOption3 [2685] | lr3_tea_table_1_030302 |
| 7 | 0 | Room1_Chair_1 | (2.31, -3.82, -5.0) | Coin | 4000 | ChairOption1 [4943] | lr1_chair_1_050402 |
| 7 | 1 | Room1_Chair_2 | (2.31, -3.82, -5.0) | Ads | 0 | ChairOption2 [5667] | lr2_chair_1_020201 |
| 7 | 2 | Room1_Chair_3 | (2.31, -3.82, -5.0) | Coin | 4000 | ChairOption3 [3224] | lr3_chair_1_020202 |
| 8 | 0 | Room1_Lamp_1 | (-0.01, 2.02, -3.0) | Coin | 8000 | LampOption1 [4589] | lr1_lamp_1_020205 |
| 8 | 1 | Room1_Lamp_2 | (-0.01, 2.02, -3.0) | Ads | 0 | LampOption2 [2861] | lr2_lamp_1_010104 |
| 8 | 2 | Room1_Lamp_3 | (-0.01, 2.02, -3.0) | Coin | 8000 | LampOption3 [5693] | lr3_standing_lamp_1_020205 |
| 9 | 0 | Room1_Picture_1 | (3.58, 2.77, -1.0) | Coin | 8000 | PictureOption1 [3924] | lr1_picture_1_010202 |
| 9 | 1 | Room1_Picture_2 | (3.58, 2.77, -1.0) | Ads | 0 | PictureOption2 [2858] | lr2_picture_1_010304 |
| 9 | 2 | Room1_Picture_3 | (3.44, 2.75, -1.0) | Coin | 8000 | PictureOption3 [4521] | lr3_book_case_1_010304 |
| 10 | 0 | Room1_Carpet_1 | (-0.58, -2.33, -2.0) | Coin | 10000 | CarpetOption1 [6234] | lr1_carpet_060601 |
| 10 | 1 | Room1_Carpet_2 | (-0.58, -2.33, -2.0) | Ads | 0 | CarpetOption2 [4513] | lr2_carpet_1_040801 |
| 10 | 2 | Room1_Carpet_3 | (-0.58, -2.33, -2.0) | Coin | 10000 | CarpetOption3 [1847] | lr3_carpet_1_050501 |
| 11 | 0 | Room1_Plant_1 | (-4.78, -0.88, -3.0) | Coin | 10000 | PlantOption1 [1800] | lr1_plant_1_020206 |
| 11 | 1 | Room1_Plant_2 | (-4.89, -1.4, -3.0) | Ads | 0 | PlantOption2 [5050] | lr2_plant_1_020204 |
| 11 | 2 | Room1_Plant_3 | (-4.89, -1.4, -3.0) | Coin | 10000 | PlantOption3 [5668] | btr2_tree_1_020205 |

#### Room 2 (`Room_2`, prefab `Room_2` [sharedassets0.assets:4934], icon `thumbnai_bedroom`) — 14 steps

| step | opt | config | position (x,y,z) | unlock | price | prefab | icon |
|---|---|---|---|---|---|---|---|
| 0 | 0 | Room_2_Floor_1 | (0.0, 0.0, -1.0) | Coin | 300 | Room_2_Floor_1 [4679] | kr1_ground_1_0202 |
| 0 | 1 | Room_2_Floor_2 | (0.0, 0.0, -1.0) | Ads | 0 | Room_2_Floor_2 [2935] | kr2_ground_1_020201 |
| 0 | 2 | Room_2_Floor_3 | (0.0, 0.0, -1.0) | Coin | 300 | Room_2_Floor_3 [2370] | kr3_ground_1_020200 |
| 1 | 0 | Room_2_Wall_1 | (0.0, 0.0, 0.0) | Coin | 300 | Room_2_Wall_1 [2621] | kr1_wall_2_131310 |
| 1 | 1 | Room_2_Wall_2 | (0.0, 0.0, 0.0) | Ads | 0 | Room_2_Wall_2 [5608] | kr2_wall_2_131310 |
| 1 | 2 | Room_2_Wall_3 | (0.0, 0.0, 0.0) | Coin | 300 | Room_2_Wall_3 [3826] | kr3_wall_2_131310 |
| 2 | 0 | Room_2_Frigde_1 | (0.019, 1.721, -2.0) | Coin | 600 | Room_2_Frigde_1 [5914] | kr1_fridge_1_030304 |
| 2 | 1 | Room_2_Frigde_2 | (0.019, 1.721, -2.0) | Ads | 0 | Room_2_Frigde_2 [6055] | kr2_fridge_1_040207 |
| 2 | 2 | Room_2_Frigde_3 | (0.019, 1.721, -2.0) | Coin | 600 | Room_2_Frigde_3 [5856] | kr3_fridge_1_030305 |
| 3 | 0 | Room_2_Sink_1 | (1.79, -0.17, -3.0) | Coin | 600 | Room_2_Sink_1 [6303] | kr1_sink_1_030302 |
| 3 | 1 | Room_2_Sink_2 | (1.79, 0.01, -3.0) | Ads | 0 | Room_2_Sink_2 [5604] | kr2_sink_1_030303 |
| 3 | 2 | Room_2_Sink_3 | (1.79, 0.01, -3.0) | Coin | 600 | Room_2_Sink_3 [4874] | kr3_sink_1_030302 |
| 4 | 0 | Room_2_Stove_1 | (3.561, -1.048, -4.0) | Coin | 1000 | Room_2_Stove_1 [5771] | kr1_gasstove_1_030302 |
| 4 | 1 | Room_2_Stove_2 | (3.561, -1.355, -4.0) | Ads | 0 | Room_2_Stove_2 [4596] | kr2_gasstove_1_030302 |
| 4 | 2 | Room_2_Stove_3 | (3.561, -1.048, -4.0) | Coin | 1000 | Room_2_Stove_3 [4728] | kr3_gasstove_1_030302 |
| 5 | 0 | Room_2_Table1_1 | (4.76, -2.75, -5.0) | Coin | 1000 | Room_2_Table1_1 [2183] | kr1_table_2_050302 |
| 5 | 1 | Room_2_Table1_2 | (5.25, -2.47, -5.0) | Ads | 0 | Room_2_Table1_2 [5085] | kr2_cabinet_1_030302 |
| 5 | 2 | Room_2_Table1_3 | (4.76, -2.75, -5.0) | Coin | 1000 | Room_2_Table1_3 [3347] | kr3_table_1_050302 |
| 6 | 0 | Room_2_Table2_1 | (-0.6, -3.28, -3.0) | Coin | 2000 | Room_2_Table2_1 [6474] | kr1_table_1_030602 |
| 6 | 1 | Room_2_Table2_2 | (-0.6, -3.28, -3.0) | Ads | 0 | Room_2_Table2_2 [2144] | kr2_table_1_030602 |
| 6 | 2 | Room_2_Table2_3 | (-0.6, -3.28, -3.0) | Coin | 2000 | Room_2_Table2_3 [1772] | kr3_table_1_020603 |
| 7 | 0 | Room_2_Window_1 | (-3.79, 2.94, -1.0) | Coin | 4000 | Room_2_Window_1 [6460] | kr1_window_1_010404 |
| 7 | 1 | Room_2_Window_2 | (-3.79, 2.94, -1.0) | Ads | 0 | Room_2_Window_2 [3755] | kr2_window_1_040104 |
| 7 | 2 | Room_2_Window_3 | (-3.79, 2.94, -1.0) | Coin | 4000 | Room_2_Window_3 [4393] | kr3_window_1_050104 |
| 8 | 0 | Room_2_Cabinet1_1 | (-3.577, -1.008, -2.0) | Coin | 2000 | Room_2_Cabinet1_1 [5732] | kr1_cabinet_1_030202 |
| 8 | 1 | Room_2_Cabinet1_2 | (-3.7, 0.17, -2.0) | Ads | 0 | Room_2_Cabinet1_2 [5729] | kr2_cabinet_2_020306 |
| 8 | 2 | Room_2_Cabinet1_3 | (-3.577, -1.008, -2.0) | Coin | 2000 | Room_2_Cabinet1_3 [3112] | kr3_cabinet_1_040202 |
| 9 | 0 | Room_2_Cabinet2_1 | (2.372, 3.087, -3.0) | Coin | 4000 | Room_2_Cabinet2_1 [2702] | kr1_kitchencabinets_1_020202 |
| 9 | 1 | Room_2_Cabinet2_2 | (2.86, 2.72, -3.0) | Ads | 0 | Room_2_Cabinet2_2 [3561] | kr2_wallcabinet_1_030201 |
| 9 | 2 | Room_2_Cabinet2_3 | (2.372, 3.087, -3.0) | Coin | 4000 | Room_2_Cabinet2_3 [3355] | kr3_kitchencabinets_1_020202 |
| 10 | 0 | Room_2_Carpet_1 | (0.38, -2.34, -2.0) | Coin | 8000 | Room_2_Carpet_1 [4347] | kr1_Carpet_1_030404 |
| 10 | 1 | Room_2_Carpet_2 | (0.75, -1.92, -2.0) | Ads | 0 | Room_2_Carpet_2 [4154] | kr2_carpet_1_030501 |
| 10 | 2 | Room_2_Carpet_3 | (0.582, -2.068, -2.0) | Coin | 8000 | Room_2_Carpet_3 [4496] | kr3_carpet_1_010501 |
| 11 | 0 | Room_2_Chair_1 | (-2.63, -3.67, -4.0) | Coin | 8000 | Room_2_Chair_1 [2084] | kr1_chair_2_020203 |
| 11 | 1 | Room_2_Chair_2 | (-2.47, -3.75, -4.0) | Ads | 0 | Room_2_Chair_2 [3516] | kr2_chair_2_020203 |
| 11 | 2 | Room_2_Chair_3 | (-2.387, -4.118, -4.0) | Coin | 8000 | Room_2_Chair_3 [5689] | kr3_chair_1_010102 |
| 12 | 0 | Room_2_Plant_1 | (-5.93, -1.76, -3.0) | Coin | 10000 | Room_2_Plant_1 [3597] | kr1_plant_1010102 |
| 12 | 1 | Room_2_Plant_2 | (-5.83, -1.45, -3.0) | Ads | 0 | Room_2_Plant_2 [1898] | br2_plant_2_020203 |
| 12 | 2 | Room_2_Plant_3 | (-5.95, -1.37, -3.0) | Coin | 10000 | Room_2_Plant_3 [4134] | kr3_plant_2_020205 |
| 13 | 0 | Room_2_Shelf_1 | (5.357, 2.07, -4.0) | Coin | 10000 | Room_2_Shelf_1 [6559] | kr1_wallshelves_1_010301 |
| 13 | 1 | Room_2_Shelf_2 | (5.0, 1.49, -4.0) | Ads | 0 | Room_2_Shelf_2 [5633] | kr2_wallshelf_1_030101 |
| 13 | 2 | Room_2_Shelf_3 | (5.357, 2.07, -4.0) | Coin | 10000 | Room_2_Shelf_3 [5245] | kr3_wallshelves_1_010301 |

### Save data

`DataDreamHouse` (GameData, JSON through `DataManager`; `SaveData()` = DataManager.SaveData):

| field | new-save value | written when |
|---|---|---|
| IsFirstTime (bool) | true | set false and saved in `RoomController.NextStep` on the first room completion |
| IsDoneTutorial (bool) | false | `SetDoneTutorial(true)` (saves, only if changed) on the first card preview or purchase |
| CurrentRoomIndex (int) | 0 | `SetCurrentRoomIndex` (saves): on room completion (next room, or 0 when all done) and on picking a room in the list |
| UnlockedRooms (List<int>) | [0,1,2] (LoadData re-adds 0,1,2 if missing) | `UnlockRoom(i)` adds i and saves; **not used for gating** |
| CurrentRoomSteps (Dict<int stepIndex,int optionIndex>) | {} | `AddCurrentRoomStep` on every purchase (saves) |
| RoomSaved (List<{RoomIndex, CurrentRoomSteps}>) | [] | per-room mirror; an entry is created by SetCurrentRoomIndex/AddCurrentRoomStep |

- `AddCurrentRoomStep(step,opt)`: add to CurrentRoomSteps. Find or create the RoomSaved entry for CurrentRoomIndex, copy the steps into it, then save.
- `LoadCurrentRoomSteps()`: `CurrentRoomSteps = copy of RoomSaved[CurrentRoomIndex].CurrentRoomSteps` (empty dict if none). `RefreshCurrentRoomSteps()` = new empty dict (unused).
- `GetCurrentRoomStep()` = `CurrentRoomSteps.Count`. This is the resume step, so progress per room survives switching rooms and restarting.
- On scene entry the controller uses the saved `CurrentRoomSteps` as they are (no Load call in Start).

Other saves/reads:
- `DataUser.dataSave.IsUnlockedDreamHouse`: set to true and saved on the first card interaction (select/coin/ads).
- `DataUser.Money`: coins are spent through `MoneyManager.UpdateMoney(-price)`; the Money widget sits in ScreenInGame.
- PlayerPrefs `"dream_house_play"`: set to 1 on first entry.
- PlayerPrefs `"RateUsShown"`: read on Back but has no effect.

Interstitial placements (skip): `back_decor`, `done_decor`, `dreamhouse_back_room`, `dreamhouse_decorate_room`. Rewarded: `unlock_decor`.

---------------------------------------------------------------------------------------------------
## 6. Edge cases worth reproducing
- **Re-entering a completed room** (e.g. after all rooms are done, the index wraps to 0): every decor object is restored, there is no mark point, the Done button stays hidden, and the bar shows `N/N`. Only List and Back do anything.
- **Closing PopupNewRoom with X after completing room k (not the last):** the saved `CurrentRoomIndex` is already k+1. Leaving and re-entering loads room k+1. While still in the scene, Done reopens the popup.
- **Picking a room in the list** starts it at its saved step. A never-touched room starts at step 0 with full prices, because IsFirstTime is already false.
- **Previewing without buying:** if the player previews a card and then hits Back, List, or the not-enough-coin popup, the preview object stays visible. It is not saved and disappears when the room is rebuilt.
- **MarkPoint input:** taps are ignored when the pointer is over UI (`Touch.IsPointerOverUIObject`). The action fires on pointer **down**.
- **Panel state:** the panel hides instantly (alpha 0, no tween). It is hidden again on every room init.

---------------------------------------------------------------------------------------------------
## 7. Implementation checklist
- [ ] **Load config:** DreamHouseAsset → 2 RoomConfigs → 12/14 slots × 3 options (table in §5).
- [ ] **Scene setup:** instantiate the room prefab at world (0,1,0). Camera ortho size 13.5.
- [ ] **Save model:** DataDreamHouse (§5) with defaults IsFirstTime=true, IsDoneTutorial=false, UnlockedRooms=[0,1,2]. Per-room steps live in RoomSaved; resume step = count.
- [ ] **RoomController.Initialize:**
  - init slots (mark points hidden and non-interactive);
  - restore placed objects from the saved steps;
  - activate the current step's MarkPoint;
  - fire the static OnInitialized (ScreenInGame / PopupListRoom / TutorialHandler).
- [ ] **MarkPoint:**
  - bob +0.35 local Y, 0.8 s InOutSine, yoyo, infinite;
  - scale 1.1, 0.8 s InOutQuad, yoyo, infinite;
  - on pointer-down: `click` sound, hide it, open the panel after 0.1 s.
- [ ] **Panel cards (re-initialised every step):**
  - set icon and price text;
  - show the Coin button for UnlockType 2 and the Ads ("Get") button for UnlockType 1;
  - show the Free button only while `IsUnlockedDreamHouse==false`;
  - price is 0 for step 0 while IsFirstTime;
  - entry anim: from y-100 with a 0.5 s fade and slide, staggered 0.15 s.
- [ ] **Card tap = preview:**
  - `click`;
  - place the prefab at cfg.Position under the slot, replacing the previous preview;
  - DecorItemEffect particle at the MarkPoint's world position;
  - `SFX_Place`;
  - show the Selected frame;
  - nothing is saved.
- [ ] **Buying:**
  - Coin/Free: `click`. If price > coins, show NotEnoughMoneyPopup. Otherwise deduct, play `sfx_purchase_coin`, commit.
  - Ads: `click` + `sfx_purchase_coin`, reward resolves instantly, commit.
- [ ] **Commit:**
  - lock the cards and place the item (particle + Place sound again);
  - hide the card's buy buttons and hide the panel instantly;
  - save step→option;
  - NextStep: next MarkPoint, bar `DOFillAmount(step/N, 0.3)`, text `step/N`.
- [ ] **Last step:**
  - bar full;
  - UnlockNextRoom (index+1, or wrap to 0 and set IsCompletedAllRoom);
  - IsFirstTime=false (saved);
  - show the Done button (pulse +0.05, 0.5 s OutCubic, yoyo).
- [ ] **Done:** if all rooms are done, go Home. Otherwise open PopupNewRoom (panel scale 0→1, 0.36 s OutBack):
  - Decorate → destroy the room, then StartRoom(next index);
  - X → close the popup.
- [ ] **List house popup:**
  - one cell per room, all unlocked, selected frame on the current room;
  - selecting the current room again does nothing;
  - selecting another: save the index, load its steps, StartRoom, close.
- [ ] **Back** → `click`, then FlashIn(Home). **Touch FX** particle at every tap position (UI canvas space).
- [ ] **Tutorial hands:**
  - HandTutorial_1 (world): shown on room init if !IsDoneTutorial && IsFirstTime && step 0; hidden on MarkPoint press.
  - HandTutorial_2 (UI, over card 1): shown after the card anim if IsFirstTime && step 0.
  - The first preview or purchase sets IsDoneTutorial, which blocks all further hands.
- [ ] **Tutorial intro/highlight:** off by default (the original throws on the null `_goScreenInGame`); offer the intended version behind a flag.
- [ ] **Ads/analytics:** ignore; interstitials and rewarded ads resolve immediately.
