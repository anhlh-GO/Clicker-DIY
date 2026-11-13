# Lucky Scoop mode (scene level6 "ScoopGame"): implementation spec

Sources: `dis/ScoopGame.*.s`, `ScoopStarItem.s`, `PreviewListStar.s`, `dump/level6.txt`, `out/data/level6.json`, `so.json`.
Paths like `Bowl/Spoon/Collider` are level6 hierarchy paths. "(inferred)" marks a guess.
Part A (this part) covers the overview, ScoopGameController, the scoop phase (BowlController, Spoon, SpoonDragController,
ScoopStarItem, YellowBall, ScoopStarAsset, the scoop HUD) with its physics, and a global save/tutorial summary.
Parts B to E follow: B is customization, C is unboxing plus PreviewListStar plus the rest of ScreenInGame, D is box packing, E is delivery and rewards.

---------------------------------------------------------------------------------------------------
## 0. Overview and player flow

Entry: from Home, the Lucky Scoop button (HomeUnlockType.ModeScoop, GameModeEnum.Scoop=3) loads scene level6.
The scene starts with `SimpleSceneTransition.FadeOut`. Music volume is set to 0.4.
Exit: CompletedPopup sets `GameSession.BackFromGameMode = Scoop` and loads Home (level1) with a flash transition, about 4 s after a reward button is tapped (part E).
There is no replay inside the scene. ButtonHome opens BackHomePopup ("Quit game / Progress will be lost", plays click).

Steps:
1. **Scoop**: The world `Bowl` shows a penguin cup with 18 star charms and 18 yellow balls under physics, plus a spoon.
   The player holds anywhere (not over UI) and drags. The spoon follows inside an ellipse. Moving the pointer fills a progress bar over 3 s of *moving* time.
   When the bar is full the spoon lifts out holding 4..8 stars. The number is **pre-rolled**, not taken from physics.
   A "You've got N charms" preview plays (PreviewListStar). The player has 1 scoop; after the first scoop a "+1 Scoop" (rewarded ad) button can raise it to 2.
   The Decor button opens the customization panel (bowl / spoon / blind-bag skin) during this step (part B).
2. **Unbox**: `BG After Scoop` turns on and the Bowl turns off. `BlindBoxTray` shows N = total stars scooped blind bags (spine Scoop_Blind_Bag).
   Tap a bag to open it and reveal a random charm. A duplicate ("lucky") charm gives one extra bag (part C).
3. **Select box**: a carousel of gift boxes; unlock by coin or ad (part D).
4. **Sort/put**: the PutCharmToBox world scene. The lid opens and the player drags each opened charm into the box polygon (part D).
5. **Select card**: a carousel of cards; then the lid closes (part D).
6. **DoneBoxCharmPopup**: "Completed!" with confetti. Tapping Delivery shows the hamster/penguin delivery screen (part E).
7. **GiveBoxToCharacter**: drag the gift up to the Jelly_Character penguin. It plays a happy anim, then CompletedPopup opens with Earnings + Tips, a x2 (ad) button and No thanks. Coins fly in, then the game returns Home (part E).

---------------------------------------------------------------------------------------------------
## 1. ScoopGame.ScoopGameController (`ScoopGameController`, same GO also has SpoonDragController)

Serialized fields:
- `_bowlController` = Bowl
- `_spoonDragController` = ScoopGameController#SpoonDragController
- `_blindBoxPlate` = BlindBoxTray
- `_charmBlindBoxAsset` = CharmBlindBoxAsset (sharedassets1:847)
- `_putCharmToBox` = PutCharmToBox
- `_bgAfterScoop` = GO `BG After Scoop`
- `_giveBoxToCharacter` = GiveBoxToCharacter
- `_blindBagVisualAsset` = ConfigScoopBagSkin (sharedassets6:160: ID 0..5 → spine skin "defaults","penguin","pink","purple","red","green")
- `_physics2DRaycaster` = Main Camera's Physics2DRaycaster

Runtime fields: `_maxScoop` (ctor = **1**), `_currentScoop` (0), `_blindBagScooped`, `_blindBagSkinId`, `_boxPrice`, `_cardPrice`, `_screenInGame`, `_gameSession`.

- **Start()**:
  - `AudioManager.SetVolumeMusic(0.4)`.
  - `GameSession.SetActiveCharacter(false)` (hides the home character).
  - `Bowl.SetActive(true)`; `BlindBoxTray.SetActive(false)`; `_blindBagScooped = 0`.
  - `_screenInGame = UIManager.GetScreen<ScreenInGame>()`, then `_screenInGame.RegisterScoopGame(this)` (sets field 0x120).
  - Calls `SpoonDragController.Init(this)`, `GiveBoxToCharacter._scoopGameController = this` (direct field set) and `PutCharmToBox.Init(this)`.
  - `PutCharmToBox.SetActive(false)`.
  - `SetupScoopResult()`.
  - `SimpleSceneTransition.FadeOut()`; `StartScoopGame()`.
  - `_blindBagSkinId = DataScoopVisual.GetSelectedItem(2)`; `BlindBoxPlate.SetBlindBoxVisual(ScoopBagVisualAsset.GetData(id).SkinName)`.
  - `_physics2DRaycaster.enabled = false`, so world colliders get no UI-style pointer events during scooping.
- **OnEnable/OnDisable**: subscribe/unsubscribe the static `OptionPanel.OnOptionSelected`.
  - **OnOptionSelected(cat, id)**: if `cat==2` (blind bag), `_blindBagSkinId=id` and `SetBlindBoxVisual(skinName)`.
- **StartScoopGame()**: `Bowl.SpawnStars()`; `Bowl.ShowTutorial()`; `ScoopDataHolding.Instance.ClearScoopData()`.
- **HideScoopTutorial()**: `Bowl.HideTutorial()`; `ScreenInGame.ShowProcessBar(true)`.
- **SetupScoopResult()**:
  - `n = Random.Range(4, 9)` (int, so 4..8). `list = Bowl.GetScooped(n)` returns n random sprites from ScoopStarAsset; all are `charm_star`.
  - `_blindBagScooped += list.Count`; `SpoonDragController.SetupResult(list)`.
  - It is called once at Start and again before each additional scoop.
- **DoneOneScoop()**: `_currentScoop++`; if `_maxScoop == 1`, `ScreenInGame.ShowButtonAddScoop(true)` (shows `btnAddScoop`).
- **AddMoreScoop()**: `_maxScoop++`. It is called from ScreenInGame's rewarded-ad callback. That callback also hides btnAddScoop and calls `UpdateScoopStatus` (part C).
- **GoToStepBlindBox()**:
  - `BG After Scoop.SetActive(true)`; `Bowl.SetActive(false)`; `BlindBoxTray.SetActive(true)`; `_physics2DRaycaster.enabled = true`.
  - Then `SetupBlindBoxPlate()` and `ScreenInGame.ShowContentUnbox()`.
- **SetupBlindBoxPlate()**: `BlindBoxPlate.ClearPlate()`; `for i in 0.._blindBagScooped-1: BlindBoxPlate.SpawnBlindBox(CharmBlindBoxAsset.GetRandomData(0.6))`; then `BlindBoxPlate.PopOutBlindBox()`.
- **AddMoreBlindBox()**: `BlindBoxPlate.AddMoreRandomBox(CharmBlindBoxAsset.GetRandomData(0.6))`. The caller is the lucky charm (part C).
- **GotoStepSelectBox()**: `BlindBoxPlate.SetActive(false)`. **HideTrayResult()**: forwards to the plate.
- **GotoStepSort()**:
  - `UIManager.GetScreen<ScreenInGame>().<field 0x40 _goBlockScreen>.SetActive(true)`. This blocks input while the lid opens (inferred).
  - `PutCharmToBox.SetActive(true)`; `PutCharmToBox.OpenLid(cb)`.
  - `cb` = cached lambda `<GotoStepSort>b__34_0`, which turns the block screen off again.
- **CreateCharmDrag(sprite)**: `PutCharmToBox.SpawnCharm(sprite)`. **OnDonePutCharmStep()**: `ScreenInGame.ShowContentSortPart2()`.
- **OnDoneSelectCardStep()**:
  - Block screen on; `PutCharmToBox.CloseLid(cb)`.
  - `cb` = `<OnDoneSelectCardStep>b__41_0`: `UIManager.HideScreen<ScreenInGame>()`, then `UIManager.ShowPopup<DoneBoxCharmPopup>()` (types inferred from the flow).
- **GotoDelivery()**: `PutCharmToBox.PrepareFinalBox()`; `PutCharmToBox.SetActive(false)`; `GiveBoxToCharacter.SetActive(true)`; `_physics2DRaycaster.enabled=false`. Analytics follow and are ignored.
- **OnSelectGiftBox(sprite)**: `GiveBoxToCharacter.SetGiftBox(sprite)`; `SetSkinCharacter()`.
  - **SetBoxVisual(boxData)** / **SetCardVisual(cardData)**: forward to PutCharmToBox. **SetBoxPrice / SetCardPrice**: store the value.
- **GetIncome()**: `data_config_type==1 ? ScoopDataHolding._openedItems.Count*100 : 300`.
  - **GetTip()**: `ScoopDataHolding.HasOrderItem() ? (data_config_type==1 ? 300 : 200) : 0`. `data_config_type` is a RemoteConfig static int with default 0. `ShowEndGame()` is empty.

---------------------------------------------------------------------------------------------------
## 2. Scoop phase: scene setup and physics (exact data)

Cameras:
- `Main Camera`: ortho size 14.23, at (0,0,-10), depth -1, with a Physics2DRaycaster.
- `RenderCam` (-2.67,2.5): ortho 9, renders to the CompletedPopup RawImage.
- `CameraUi`: depth 100.
- Default Physics2D gravity is assumed to be (0,-9.81). The project settings were not exported (inferred).

### Static bowl walls: `Bowl/Collider` at local (0, 2.11); Bowl at the origin, no rotation or scale
There is no Rigidbody2D, so these are static colliders. None is a trigger. All points are in Collider-local space (add (0,2.11) for world).
- PolygonCollider2D #1 (the inner bowl floor and lower body, a closed shape):
  (3.338,-0.3994) (0.0988,-1.2739) (-3.2184,-0.3349) (-4.8861,2.7813) (-16.2219,1.9122) (-16.214,-11.5284) (15.9923,-11.5873) (16.0935,1.7601) (5.1688,2.3183).
  This is the solid mass under the cup. Its top edge from (-4.89,2.78) through (-3.22,-0.33), (0.10,-1.27) and (3.34,-0.40) to (5.17,2.32) is the curved bowl interior floor.
- BoxCollider2D: size (12.8143, 21.6728), offset (-9.8233, 8.3585). This is the left wall block.
- BoxCollider2D: size (12.3189, 21.6704), offset (9.9306, 8.4299). This is the right wall block.
- PolygonCollider2D #2: (12.0249,1.0171) (12.0606,19.2397) (-11.83,19.16) (-11.7751,1.1289) (-5.8109,1.1546) (-3.8208,5.3558) (0.1594,6.5309) (3.7238,5.382) (6.0162,0.9256).
  This is a big lid shape above the cup. Its lower edge arcs from (-5.81,1.15) up to (0.16,6.53) and down to (6.02,0.93).
  The interior space left for the stars is therefore the region between the floor arc of #1 and this arc. That makes a lens/oval about 11 wide in x (-5.8..6) and up to about 7.8 high.
  Stars can never leave the cup. Note that #1 and #2 overlap the boxes; this is fine for static colliders.

### Stars and balls (pool prefabs in sharedassets0; spawned by BowlController)
- **ScoopStar** (PoolType 106, class ScoopStarItem): root scale 1.5.
  - CircleCollider2D radius 0.3, offset 0, not a trigger (world radius 0.45).
  - Rigidbody2D Dynamic: gravityScale **5**, mass **5**, linear drag 0, angular drag 0.05, no constraints, freely rotating.
  - Child `Visual`: SpriteRenderer `charm_star`, order 4, scale 0.8.
- **YellowBall** (PoolType 107, class ScoopGame.YellowBall, empty PoolElement): root scale 1.5.
  - CircleCollider2D radius 0.2 (world 0.3).
  - Rigidbody2D Dynamic: gravityScale 5, mass 5, linear drag 0, angular drag 0.05.
  - Child `Visual` z -0.1: sprite `charm_round`, order 4, scale 0.75.
- Physics materials were not exported. Use the default friction 0.4 and bounciness 0 (inferred).

### Spoon: `Bowl/Spoon` at local (0.67, 4.96), rotation z = **65°**
- Rigidbody2D **Kinematic** (bodyType 1), gravityScale 1, mass 1, angular drag 0.05. It is moved only by `MovePosition`, so it pushes the dynamic stars with infinite mass.
- `Bowl/Spoon/Collider` (local 0,0) carries:
  - CircleCollider2D r 0.3 at offset (-3.0, 0.59); r 0.3 at (-0.5, -0.1); r 0.3 at (-1.9, -0.8). These are solid; they form the spoon's head and bowl lip that stir and push the stars.
  - BoxCollider2D trigger, size (5.1584, 1.2483), offset (1.2677, -0.3275). This is the handle; it is a trigger and does not collide.
  - Offsets are in the spoon's rotated frame. With rotation 65 the head (local x≈-3) points down-left into the bowl.
- `Visual`: SpriteRenderer `scoop_7` (spoon sprite from SpoonVisualAsset), order 3, local (-0.057,-0.107), rotation -100.
  - `VisualFront`: `scoop_7_front`, order 5, local (-2.0,-0.13), rotation -100. This is `_goScoopFront` (the field was not exported; inferred). It is hidden in Awake and shown while holding a scooped result, so the stars appear inside the spoon.
- `ScoopedStar` at local (-0.87,0.44) has 8 inactive `Visual` children (charm_star, order 4). These are `Spoon._scoopedList`, in the scene list order.
  Their local positions are (-1.31,-0.17) (-0.83,-0.55) (-0.61,-0.32) (-0.26,0.16) (-1.27,0.62) (-0.70,0.47) (-0.49,-0.04) (-1.22,0.31).
- Sorting: the bowl_1_behind cup is order 2; stars and balls are order 4, between the spoon at 3 and VisualFront at 5; bowl_1_front (cup_peugin_front) is order 6 and draws over everything; the shadow is 2 (inactive in the scene, so the shadow is shown by sprite only (inferred)); the carpet is 0 at (0,-1.27) scale 1.32.

### BowlController (`Bowl`)
Fields:
- `_starSpawn` = **18**; `_starHolder` = `Bowl/Stars` (local 0,-0.93).
- Spawn rect: `_tfTopLeft` = TopLeftSpawnStar (-2.15,6.19), `_tfBottomRight` = BottomRightSpawnStar (2.63,3.15).
- `_scoopStarAsset` = ScoopStarAsset (19 entries, all sprite `charm_star`).
- `_bowlVisualAsset` and `_spoonVisualAsset` (part B tables).
- `_srBowlFull` = bowl_1_behind, `_srBowlFront` = bowl_1_front, `_srShadow` = shadow; `_srSpoonFull` = Spoon/Visual, `_srSpoonFront` = Spoon/VisualFront.
- Tutorial: `_imageTransform` = `Bowl/Tutorial/hand` (hand_tap, scale 1.5, order 6). `_goLoop` = not exported; inferred to be `Bowl/Tutorial/icon_infinity`, the "infinity" sprite (order 5, scale 1.5, world (0,9.2)).
- `_waypoints` = the 15 children of `Bowl/Tutorial/TutorialPos`. TutorialPos world = (0, 14.10); each child's world = (x, 14.10+y).
  - World positions: (2.07,9.20) (1.60,9.96) (0.77,9.94) (-0.01,9.21) (-0.54,8.62) (-1.26,8.29) (-1.95,8.74) (-2.00,9.49) (-1.42,9.99) (-0.56,9.80) (-0.06,9.26) (0.42,8.68) (1.06,8.28) (1.64,8.50) (1.86,9.11).
  - Together they trace an ∞ (figure-eight) over the infinity icon.
- `_moveSpeed` 3, `_waitTimeAtPoint` 0.5 (unused), `_loop` true.

Methods:
- **Awake**:
  - Hand inactive; `_goLoop` inactive.
  - `_bowlSkinId = DataScoopVisual.GetSelectedItem(0)`; `_spoonSkinId = GetSelectedItem(1)`.
  - `UpdateBowlVisual()`: Full→bowl_1_behind, Front→bowl_1_front, Shadow→shadow, using BowlVisualAsset.GetData(id).
  - `UpdateSpoonVisual()`: Full→Spoon/Visual, Front→Spoon/VisualFront.
- **OnOptionSelected(cat,id)**: cat 0 sets the bowl skin and refreshes; cat 1 sets the spoon skin and refreshes (live preview while the panel is open).
- **SpawnStars()**:
  - Despawn every element of `_starList` and `_ballList` (PoolElement.DespawnSelf), then clear both lists.
  - Then `for i in 0..17`:
    1. Spawn a ScoopStar from the pool and parent it to Bowl/Stars. Set its world position to `(Random.Range(TL.x, BR.x), Random.Range(BR.y, TL.y))`, i.e. x∈[-2.15,2.63], y∈[3.15,6.19], z keeps the default. Call `SetVisual(ScoopStarAsset.GetData(i))` (GetData wraps with `i % count`) and add it to `_starList`.
    2. Spawn a YellowBall the same way, with a fresh random position, and add it to `_ballList`.
  - Total: 36 bodies dropped in overlapping random spots. They fall under gravity×5 and settle in the cup.
- **GetScooped(amount)**: returns a `List<Sprite>` with `amount` entries of `ScoopStarAsset.GetRandomData()` (uniform). It does NOT touch the physics objects; the stars in the bowl are never removed.
- **ShowTutorial()**:
  - If `DataSaveUser.ScoopPlayTime > 0`, return (only the first game ever shows it).
  - If there are no waypoints or no hand, return.
  - Hand active; `_goLoop` active; hand.position = waypoints[0].position; kill the old `_sequence`; `StartDOTweenLoop()`.
- **StartDOTweenLoop()**:
  - `_sequence = DOTween.Sequence()`.
  - `for k = 1..14: Append(hand.DOMove(wp[k].position, duration = |wp[k]-wp[k-1]| / 3, snapping=false).SetEase(Linear))`.
  - Then `SetLoops(-1)` (default LoopType Restart; when it restarts the hand jumps from wp14 back to wp0, which is close by) and `Play()`.
  - The whole lap is about 9.8 units, about 3.3 s.
- **HideTutorial()**: kill the sequence; hand and `_goLoop` inactive.

### Spoon (ScoopGame.Spoon)
Fields: `_scoopedAngle` = 15, `_scoopingAngle` = 65 (ctor).
- **Awake**: `_goScoopFront` inactive.
- **ReleaseScoop()** (on press): `_goScoopFront` off; `transform.DOKill()`; `transform.DORotate((0,0,65), 0.3, RotateMode.Fast)`. The default ease is OutQuad (DOTween default).
- **ScoopUp()** (on success): `transform.DORotate((0,0,15), 0.3, Fast)`.
- **SetResult(List<Sprite> result)**:
  - All 8 `_scoopedList` renderers inactive.
  - `for i < result.Count`: renderer[i].sprite = result[i]; active; localScale = (0,0,0); `DOScale(1, 0.1)`.
  - Then `_goScoopFront` active.
  - Earlier stars stay visible until the next SetResult. ReleaseScoop only hides VisualFront (the PreviewListStar step also hides them; see part C).

### SpoonDragController (on `ScoopGameController`)
Fields:
- `_spoon` = Bowl/Spoon; `_tfCenter` = `Bowl/Center` (0.80, 5.50); `_radiusX` **2.3**, `_radiusY` **2.2**.
- `_dragDuration` **3.0** (ctor default 2, scene value 3); `_maxMoveSpeed` 5.
- `_rb` = Spoon Rigidbody2D; `_endPos` = (2, 8) (ctor); `_resultStars` list; `_soundLoop` SoundChannel.
- Reference rect objects `TopRightDragSpoon` (3.18,8) and `BottomLeftDragSpoon` (-1.21,3.14) exist but are unused by code.

- **Init(ctrl)**: stores the controller and `ScreenInGame`. **SetupResult(list)**: `_resultStars = copy of list`.
- **Update()** (every frame; Input System `Pointer.current`):
  1. If there is no pointer, or `Touch.IsPointerOverUIObject()`, return.
  2. If `!_isScoopDone && press.wasPressedThisFrame`:
     - `controller.HideScoopTutorial()`, which also shows the progress bar.
     - `spoon.ReleaseScoop()` (tilt to 65°).
     - `_isScooping = true`; `ScreenInGame._decorButton.interactable = false`.
     - `_dragOffset = spoon.position − ScreenToWorld(pointer)` (xy).
  3. If `press.wasReleasedThisFrame && !_isScoopDone`: `_soundLoop?.SetVolume(0)`; `_isScooping = false`; decorButton.interactable = true.
  4. If `_isScooping`:
     - `_targetPos = ClampToEllipse(ScreenToWorld(pointer) + _dragOffset)`.
     - Then `CheckDragDuration()`.
  Note: the press can be anywhere on screen. The spoon keeps its offset relative to the finger, so it does not jump to the finger.
- **ClampToEllipse(p)**:
  - `d = p − center; k = d.x²/rx² + d.y²/ry²`.
  - If `k > 1`, then `p = center + d / sqrt(k)`.
  - This keeps the spoon's pivot inside the ellipse centred at (0.8,5.5) with half-axes 2.3 × 2.2 (x∈[-1.5,3.1], y∈[3.3,7.7]).
- **FixedUpdate()**: if `_isScooping`, `_rb.MovePosition(_targetPos)`.
  - A `Vector2.MoveTowards(rb.position, target, maxMoveSpeed*fixedDeltaTime)` is computed, but the result is discarded. The spoon goes straight to the target each physics step.
  - The rotation is driven only by the DORotate tweens on the transform.
- **CheckDragDuration()** (only while `!_isScoopDone`):
  1. `w = ScreenToWorld(pointer)`; `moved = |w − _lastMousePosition|`; `_lastMousePosition = w`.
  2. If `moved < 0.01`: `_soundLoop?.SetVolume(0)` and return. The timer does not advance while the finger is still.
  3. If `_soundLoop` exists and is playing, `SetVolume(1)`. Otherwise `_soundLoop = AudioManager.PlaySound(ESound.sc_scoop=10, volume 1, loop=true)`.
  4. `_dragTimer += Time.deltaTime`.
     `_imgScoopProcess.DOKill(); _imgScoopProcess.DOFillAmount(_dragTimer/_dragDuration, 0.2)`. This is `ContentScoop/Process/Process` (progress_fill).
  5. If `_dragTimer >= _dragDuration` (3 s of moving):
     - `_soundLoop.SetVolume(0)`; `_isScoopDone = true`, `_isScooping = false`.
     - `spoon.transform.DOKill()`; `spoon.SetResult(_resultStars)`.
     - `ScreenInGame._goScoopProcess.SetActive(false)`. The field was not exported; inferred to be `ContentScoop/Process`.
     - `controller.DoneOneScoop()`; `ScreenInGame.UpdateScoopStatus()`; `spoon.ScoopUp()` (rotate to 15°).
     - `spoon.transform.DOMove((2,8,0), 0.5)` (default ease OutQuad). The spoon flies up out of the bowl to the upper right; no collision because MovePosition stops.
     - `OnComplete(b__26_0)`:
       - `Vibration.Vibrate(60 ms, amplitude -1)`.
       - `ScreenInGame.ShowPreviewAnimWithStars(spoon._scoopedList, onFlyToBasket = no-op, onCheckScoopDone = b__26_2)`. The decor button is set non-interactable, then PreviewListStar.ShowPreviewAnim runs (part C).
     - **b__26_2** (after the preview):
       - If `controller._currentScoop == controller._maxScoop`: stop `_soundLoop`, then `controller.GoToStepBlindBox()`.
       - Otherwise (the player bought +1 scoop during the first scoop or the preview): `_dragTimer = 0`, `_isScoopDone = _isScooping = false`, `controller.SetupScoopResult()` (rolls 4..8 again and adds them to the blind-bag total), decorButton.interactable = true.
         The spoon stays at (2,8) until the next press. Then it tilts back to 65° and snaps into the ellipse via MovePosition.
- **OnDestroy**: stop `_soundLoop`; `AudioManager.StopSound(sc_scoop)`.

**What counts as scooped:** nothing physical. Each scoop shows a pre-rolled `Random.Range(4,9)` = 4..8 star sprites in the spoon. The physics is pure feel: stars and balls get stirred by the 3 solid spoon circles.
The total number of blind bags = the sum of the rolls, either 4..8 with 1 scoop or 8..16 with the +1 scoop.
The "infinity" tutorial is a hand tracing a figure-eight over an ∞ icon. It means "drag in circles", and it disappears on the first press.

### Scoop HUD (ScreenInGame, ContentScoop)
- `ScoopStatus/txtScoopTime`: initially "0/1". `UpdateScoopStatus()` sets it to `string.Format("{0}/{1}", currentScoop, maxScoop)`.
- `btnAddScoop` ("+1 Scoop", ad icon, looping DOTweenAnimation): `ShowButtonAddScoop(isShow)` toggles it. It is hidden at start (inferred). It becomes visible after the first scoop because `_maxScoop` is 1.
  - Click → `AddMoreScoop()`: plays click (1), then rewarded ad "add_scoop", then `<AddMoreScoop>b__38_0`: hide the button, `controller._maxScoop += 1`, UpdateScoopStatus. It is available once, since max becomes 2 and the button is not shown again.
  - Window: the player must tap it before the PreviewListStar sequence (~3.05 s) ends. Otherwise b__26_2 sees current == max and moves to unboxing.
- `BtnDecor` → customization panel (part B). `ShowProcessBar(true)`: if the bar is not already active, `_imgScoopProcess.DOKill(); DOFillAmount(0, 0)` (reset; inferred) and set it active.
  - `UpdateScoopProcess(v)`: `DOFillAmount(v, 0.2)` (unused by the scoop code, which tweens directly).
- `ShowStepScoopButton(isShow, duration)` slides the HUD buttons, chat and money in or out and moves the camera Y (part B has the exact values).

---------------------------------------------------------------------------------------------------
## 3. Saves and persistent state (all parts)
- `DataSaveUser.ScoopPlayTime` (int): incremented once per finished round when CompletedPopup opens.
  - `== 0` means the first game, which enables the bowl ∞ tutorial.
  - The gift tutorial uses its own PlayerPrefs key `tutorial_gift_box` (part E).
- `DataSaveUser.Money`: coin unlocks (decor options, boxes, cards) subtract from it. Rewards are added when the flying coins land (part E).
- `DataSaveUser.OwnedGiftBox` (0x88) and `OwnedCard` (0x90): IDs unlocked by coin or ad (part D).
- `DataScoopVisual` (GameData): per-category selected item and unlocked items for bowl (0), spoon (1) and blind bag skin (2). The default is ID 0 selected and unlocked (part B).
- `ScoopDataHolding._openedItems`: charm IDs opened this round. It is runtime only, cleared at StartScoopGame, and used for lucky checks, income (AB variant) and the order tip (part C/E).
- RemoteConfig `data_config_type` (default 0) switches income/tip formulas and blind-bag market price lists (parts B/E).

---------------------------------------------------------------------------------------------------
## 4. Global implementation checklist (details in each part)
1. Build the level6 scene. Initially active: Bowl, BG, BG_black (glow), ScreenInGame/ContentScoop. Inactive: BlindBoxTray, PutCharmToBox, GiveBoxToCharacter, PreviewBag, BG After Scoop.
2. Physics world (planck.js/matter.js or a custom solver):
   - Static bowl colliders (2 polygons + 2 boxes, offset (0,2.11)).
   - 18 star circles (r 0.45 world) + 18 ball circles (r 0.3), mass 5, gravity 9.81×5, angular damping 0.05, friction about 0.4 (inferred).
   - A kinematic spoon with 3 circles (r 0.3 in the spoon frame; the spoon has no scale) at the scene rotation. The handle box is a trigger, so skip it.
   - Each physics step, set the spoon position directly to the target (kinematic, with velocity = delta/dt so it pushes).
3. Spoon control: press anywhere, keep the offset, clamp to the ellipse ((0.8,5.5), 2.3×2.2), tilt to 65° on press and 15° on success (0.3 s).
   The timer advances only while the pointer moves ≥0.01 world units per frame. Loop sc_scoop at volume 1 while moving and 0 while still. Fill the bar over 3 s.
4. On success:
   - Show 4..8 stars in the spoon (pop 0.1 s), hide the bar, update "{cur}/{max}", show "+1 Scoop" after the first scoop.
   - Spoon DOMove (2,8) 0.5 s, vibrate, run the PreviewListStar anim.
   - Then either continue (+1 scoop bought) or go to unbox with N = the sum of the rolls.
5. First-time ∞ tutorial: when ScoopPlayTime==0, a hand loops over 15 waypoints at 3 u/s (Linear). Hide it on the first press.
6. Implement parts B–E as specified below; the flow glue is in section 1.

</content>
</invoke>

---
# PART B
# Lucky Scoop: customization (Decor) panel: bowl / spoon / blind-bag skins

The player opens it with the Decor button during the scoop step. The panel slides up from the bottom. Its top row is 3 category tabs (Bowl, Spoon, Blind Bag). Below the tabs is a grid of options. Tapping an unlocked option equips it: the change shows at once and is saved. Locked options unlock with a rewarded ad (UnlockType 1) or with coins (UnlockType 2, `Price`).

Index convention used everywhere: **categoryIndex 0 = Bowl, 1 = Spoon, 2 = Blind Bag** (order of `ConfigScoopGameVisual.CategoryAssets`).
Option IDs equal their list index in every config. The code relies on this: it passes the saved option ID into `SelectedOptionItemByIndex`.

## Scene objects (level6)
- `UIManager/[Sceen]/ScreenInGame/ContentScoop/Panel Decor`: CanvasGroup + **ScoopPanel**. Full-screen stretch.
  - `btnClose`: invisible full-screen Button (Img None). It sits behind `Panel` and closes on a tap outside.
  - `Panel`: the sliding RectTransform. Anchors (0,0)-(1,0), pivot (0.5,0), anchoredPos (0,0), sizeDelta.y **1060.23**.
    - `BG` Img(tab)
    - `CategoryPanel`: horizontal ScrollRect + **CategoryPanel**. Top strip, height 194.17. Items spawn into `Viewport/Content` (HorizontalLayoutGroup).
    - `OptionPanel`: ScrollRect (vertical scrollbar) + **OptionPanel**. Items spawn into `Viewport/Content` (GridLayoutGroup + ContentSizeFitter).
    - `CloseButton` Img(button_v) Button
- `PreviewBag` (world root, **inactive** at start). Children `blind_bag_defaut`, `blind_bag_defaut (1)`, `blind_bag_defaut (2)` at (-3.15,1.00), (0.31,0.70), (3.28,1.00). Each has SR(blind_bag_defaut, order 3) and local scale **0.8**. These are `CategoryPanel._previewBagList`.
- `Bowl` (world root, ScoopGame.BowlController) is `CategoryPanel._goBowl`, and `PreviewBag` is `_goBagPreview`. (inferred) These two fields are missing from the exported MB data, but the code needs them non-null, and these are the only matching objects.
- `GameHandle/ScoopDataHolding`: **ScoopDataHolding** (`_openedItems` = []).

### Pool prefabs (sharedassets0)
**ScoopCategoryItem** (PoolType.ScoopCategoryItem = **12**), Img(tab_off 1) + Button + CategoryItem:
```
ScoopCategoryItem  [_button = own Button]
  Image            Img(tab_off)
  -SelectedGo      [_selected]  (children: Selected Img(tab_top), Selected (1) Img(tab_on))
  Icon             [_icon] Img(icon_skin_on)
  -NotiGo          [_iconNoti] Img(icon_notice)   (never enabled by scoop code)
```
**ScoopOptionItem** (PoolType.ScoopOptionItem = **13**), OptionItem:
```
ScoopOptionItem
  Panel            [_panel] (punch-scale target)
    NonSelected    Img(box_item)
    Selected       [_selected] Img(box_item_selected)
    SelectButton   [_btnSelected] Button
    Icon           [_icon] Img
    Check          [_checkOptional] Img(check)
  Full
    btnBuy         [_btnBuy] Button
      btnBuy       Img(panel_price)
        AdLock     [_optionByAds] Img(button_ads) > IconAds Img(ic_ads), TextCountAd Txt('0/1') (static, never written)
        CoinLock   [_optionByMoney] Img(button_coin) > IconCoin Img(ic_coin_full), TextCountAd [_txtPrice] Txt('100')
        -OtherLock [_optionByIAP] Img(ic_lock)
  -Bottom
    -txtStatus     [_txtStatus] Txt('Owned') LocalizeText
  -NotiGo          [_iconNoti] Img(icon_notice)
```
Note: `Bottom` is inactive in the prefab and code only toggles `txtStatus` itself. So the "Owned"/"Equipped" text never shows in practice (inferred; port it hidden).

## ScreenInGame (only the parts that drive the panel)
- `OnInit`: `_scoopPanel.OnInit(this)`, then `_decorButton.onClick += OnBtnDecorClick` (plus other, unrelated wiring).
- **OnBtnDecorClick()**:
  1. `PlaySound(ESound.click (1))`.
  2. `_scoopPanel.OnShow()`.
  3. `_scoopPanel.RegisterCloseAction(<OnBtnDecorClick>b__39_0)`, which stores the callback in `ScoopPanel._onClosePopupAction`.
  4. `ShowStepScoopButton(false, 0.5)`: the HUD slides away.
- **<OnBtnDecorClick>b__39_0()** (called when the panel closes) = `ShowStepScoopButton(true, 0.5)`.
- **ShowStepScoopButton(isShow, duration)**. Every tween is DOKill + tween with delay 0 and the given `duration`.
  Ease A = isShow ? OutBack(27) : InBack(26).

  | target (field) | tween | isShow=true | isShow=false | ease |
  |---|---|---|---|---|
  | `_rectBtnHome` | DOAnchorPosX | 140 | -150 | A |
  | `_rectScoopTime` | DOAnchorPosY | -455 | -1200 | A |
  | `_rectAddScoop` | DOAnchorPosY | -615 | -1300 | A |
  | `_rectBtnDecor` | DOAnchorPosX | 0 | 300 | Linear(1) |
  | `_rectChat` | DOAnchorPosX | 5 | -700 | A |
  | `_rectInputChat` | DOAnchorPosX | 5 | -700 | A |
  | `_rtMoney` | DOAnchorPosX | 225 | -170 | isShow ? InBack(26) : OutBack(27) (reversed) |
  | `_mainCamera.transform` | DOLocalMoveY | 0 | -5 | OutQuad(6) |

  (`OnChangeAnchorPositionX/Y(rt, delay, duration, pos, ease, cb)` = `rt.DOKill(); rt.DOAnchorPosX/Y(pos, duration).SetDelay(delay).SetEase(ease).OnComplete(cb)`.)
- `SetBtnDecorInteractable(b)` sets `_decorButton.interactable = b`. `ShowPreviewAnimWithStars` sets `_decorButton.interactable = false`, so the panel cannot open once scooping is finishing (owned by the scoop part).

## ScoopPanel (`Panel Decor`)
Fields: `_rectTransform`=Panel Decor, `_panel`=Panel, `_btnClose`=btnClose, `_btnClose2`=Panel/CloseButton, `_closeButton`=Panel/CloseButton (the **same** button as `_btnClose2`), `_canvasGroup`=Panel Decor CG, `_categoryPanel`, `_optionPanel`, `_yOffset`=**200** (ctor default 200 too).
Runtime fields: `_initialPosition`, `_hideYPosition`, `_onClosePopupAction`, `_screenInGame`. Public events `OnShowPanel(float)` and `OnHidePanel(float)` have no subscribers in this mode.

`FrameWorkUtility.SetActive(cg, active, fadeTime)` = `cg.DOKill(); cg.DOFade(active?1:0, fadeTime); cg.blocksRaycasts = active`. Every call here uses fadeTime 0, so the change is instant.

- **OnInit(screenInGame)**:
  1. `_screenInGame = screenInGame`.
  2. `_categoryPanel.OnInit(this)`, then `_optionPanel.OnInit(this)`.
  3. Add `OnButtonCloseClicked` to `_btnClose`, `_btnClose2` and `_closeButton`. CloseButton therefore gets **2 listeners**: one tap runs the close logic twice (sound x2, close callback x2, harmless). A port may wire it once.
  4. `_initialPosition = (panel.anchoredPosition.x, panel.anchoredPosition.y, 0)`, which is (0,0).
  5. `_hideYPosition = initY - (panel.sizeDelta.y + _yOffset)` = 0 - (1060.23 + 200) = **-1260.23**.
  6. `panel.anchoredY = _hideYPosition`.
  7. `SetActive(cg, false, 0)`: alpha 0, no raycasts.
  8. `cg.interactable = false`.
- **OnShow()**:
  1. `cg.interactable = false`.
  2. `SetActive(cg, true, 0)`: alpha 1, raycasts on.
  3. `panel.DOKill()`, then `panel.DOAnchorPosY(_initialPosition.y, 0.36).OnComplete(cg.interactable = true)`. No ease is set, so the DOTween default applies (OutQuad, inferred).
  4. `_categoryPanel.SelectDefaultCategory()`.
  5. `OnShowPanel?.Invoke(0.36)`.
- **OnHide()**:
  1. `cg.interactable = false`.
  2. `panel.DOKill()`, then `panel.DOAnchorPosY(_hideYPosition, 0.36).OnComplete(SetActive(cg, false, 0))`.
  3. `OnHidePanel?.Invoke(0.36)`.
  4. `_categoryPanel.OnHideDecorPanel()`.
- **OnButtonCloseClicked()**:
  1. `PlaySound(click)`.
  2. `OnHide()`.
  3. `_onClosePopupAction?.Invoke()`, which brings the HUD back with ShowStepScoopButton(true, 0.5).
- `RegisterCloseAction(a)` sets `_onClosePopupAction = a` and returns this.

## CategoryPanel
Fields:
- `_contentParent` = CategoryPanel/Viewport/Content
- `_categoryItems` (starts empty)
- `_goBowl` = Bowl
- `_goBagPreview` = PreviewBag
- `_previewBagList` = the 3 PreviewBag SRs
- `_blindBagCategoryAsset` = ConfigBlindBagCategoryAsset
- runtime: `_selectedCategoryItem`, `_scoopPanel`, `_blindBagSkinId`

- **OnInit(scoopPanel)**:
  1. `_scoopPanel = scoopPanel`.
  2. `Setup()`.
  3. `OptionPanel.OnOptionSelected += this.OnOptionSelected`. This is a **static** event. OnDestroy removes the subscription.
- **Setup()**:
  1. Clear `_categoryItems`.
  2. `asset = DataManager.GetAsset<ScoopGameVisualAsset>()` (ConfigScoopGameVisual).
  3. `i = 0`. For each `cat` in `asset.CategoryAssets`:
     - `item = CreateCategoryItem()`
     - `item.OnInit(OnCategoryItemClicked)`
     - `item.SetIcon(cat.OnIcon, cat.OffIcon)`
     - `item._index = i++`
- **CreateCategoryItem()**:
  1. `PoolManager.SpawnObject(12 ScoopCategoryItem, pos Vector3.zero, Quaternion.identity, parent _contentParent)`.
  2. `GetComponent<CategoryItem>()`, then set localScale = Vector3.one.
  3. Add the item to `_categoryItems` and return it.
- **SelectDefaultCategory()** = `SelectedCategory(_categoryItems[0])` (Bowl). It does **not** go through OnCategoryItemClicked, so there is no sound and Bowl/PreviewBag are not toggled.
- **SelectedCategory(item)**:
  1. If `_selectedCategoryItem != null`, call `_selectedCategoryItem.SetSelected(false)`.
  2. `_selectedCategoryItem = item`, then `item.SetSelected(true)`.
  3. `idx = _categoryItems.IndexOf(item)`.
  4. `sel = DataManager.GetData<DataScoopVisual>().GetSelectedItem(idx)`.
  5. `_scoopPanel.OptionPanel.Setup(idx).SelectedOptionItemByIndex(sel)`.
- **OnCategoryItemClicked(item)**:
  1. `PlaySound(click)`, then `VibrationManager.Haptic(LightImpact 4)`.
  2. `item.StartClickEffect()`.
  3. `SelectedCategory(item)`.
  4. `_goBowl.SetActive(item.Index != 2)` and `_goBagPreview.SetActive(item.Index == 2)`. The Blind Bag tab hides the bowl and shows the 3 preview bags.
- **OnOptionSelected(categoryIndex, optionID)** (static event listener). Only when categoryIndex == 2:
  1. `_blindBagSkinId = optionID`.
  2. `opt = _blindBagCategoryAsset.GetOptionDataByID(optionID)`. If null, return.
  3. For i, sr in `_previewBagList`:
     - `sr.sprite = opt.Icon`
     - `sr.transform.DOKill()`
     - `sr.transform.DOScale(0.9, 0.1).SetDelay(i * 0.1).OnComplete(sr.transform.DOScale(0.8, 0.2))`
  This is a staggered pulse; base scale is 0.8.
- `GetBlindbagVisual()` = `_blindBagCategoryAsset.GetOptionDataByID(_blindBagSkinId)`.
- **OnHideDecorPanel()**: `_goBowl.SetActive(true)`, `_goBagPreview.SetActive(false)`.

## CategoryItem (PoolElement)
- `OnInit(onClick)`: `_button.onClick += () => onClick(this)`, then `SetSelected(false)`. The listener is added without RemoveAll. Items are spawned only once per OnInit, so this is fine.
- `SetIcon(on, off)`: store both, then `_icon.sprite = off`.
- `SetSelected(b)`: `_selected(SelectedGo).SetActive(b)`, then `_icon.sprite = b ? _onSprite : _offSprite`. The config gives the same sprite for both: ic_cup, ic_scoop, ic_blind_bag.
- `SetIndex`, `Index`, `SetActiveNotification(b)` (`NotiGo.SetActive`, unused here).
- **StartClickEffect()**: `_icon.rectTransform.localScale = 1`, DOKill, then `DOPunchScale(Vector3.one * 0.1, 0.2, vibrato 10, elasticity 1)`.

## OptionPanel
Fields:
- `_contentParent` = OptionPanel/Viewport/Content
- `_scrollRect`
- `_optionItems` (starts empty)
- runtime: `_decorPanel`, `_selectedOptionItem`, `_categoryAsset`, `_dataDecor` (DataScoopVisual), `_selectedCategoryIndex`
- **static** `event UnityAction<int,int> OnOptionSelected(categoryIndex, optionID)`

**Listeners of OnOptionSelected**
- `CategoryPanel.OnOptionSelected`: preview-bag pulse.
- `BowlController.OnOptionSelected`:
  - cat 0: `_bowlSkinId = id`, then `UpdateBowlVisual()`. This sets `_srBowlFull/_srBowlFront/_srShadow` to BowlVisualDataItem `Full/Front/Shadow`.
  - cat 1: `_spoonSkinId = id`, then `UpdateSpoonVisual()`. This sets `_srSpoonFull/_srSpoonFront` to `Full/Front`.
- `ScoopGameController.OnOptionSelected`: cat 2: `_blindBagSkinId = id`, then `BlindBoxPlate.SetBlindBoxVisual(ScoopBagVisualAsset.GetData(id).SkinName)`. These are spine skin names: defaults/penguin/pink/purple/red/green.

At scene start, BowlController reads `GetSelectedItem(0)` and `(1)`, then applies UpdateBowlVisual/UpdateSpoonVisual. ScoopGameController reads `GetSelectedItem(2)`, then `SetBlindBoxVisual(skin)`. So saved skins are applied without opening the panel.

Methods:
- **OnInit(scoopPanel)**: `_decorPanel = scoopPanel`, `_dataDecor = DataManager.GetData<DataScoopVisual>()`.
- **OnEnable / OnDisable**: `MoneyManager.OnMoneyChanged += / -= Refresh`.
- **Setup(categoryIndex)** returns this:
  1. `_selectedCategoryIndex = categoryIndex`.
  2. `_categoryAsset = GetAsset<ScoopGameVisualAsset>().GetCategoryAssetByIndex(categoryIndex)`.
  3. `AdjustOptionItemSize()`.
  4. For i in 0..`_optionItems.Count`-1:
     - `opt = _categoryAsset.GetOptionDataByIndex(i)`
     - `unlocked = _dataDecor.HasUnlockedItem(cat, opt.ID)`
     - `money = DataUser.GetMoney()`
     - `coinReady = !(money < opt.Price || unlocked) && opt.UnlockType == 2`
     - `item.OnInit(OnOptionItemClicked, OnOptionItemBuyClicked)`. This removes all listeners from both buttons, re-adds them, and calls SetSelected(false).
     - `item._icon.sprite = opt.Icon`, `item._id = opt.ID`
     - `item.SetPrice(opt.Price)`: `_txtPrice.text = Price.ToString()`
     - `item.SetUnlockType(opt.UnlockType)`: CoinLock active iff 2, AdLock iff 1, OtherLock iff 5
     - `item._btnSelected.interactable = unlocked || coinReady || opt.UnlockType == 1`
     - `item.SetActiveStatus(unlocked)`: txtStatus GO
     - `item.SetActiveBuyButton(!unlocked)`: btnBuy GO
     - `item._btnBuy.interactable = true`
     - `item._iconNoti(NotiGo).SetActive(coinReady)`. The badge shows when the player can afford this coin item.
- **AdjustOptionItemSize()**:
  1. While `_optionItems.Count < _categoryAsset.GetOptionDataCount()`: `CreateOptionItem()`.
  2. While Count > needed: `_optionItems[last].DespawnSelf()`, then remove it.
  3. `_scrollRect.horizontalNormalizedPosition = 0`.
- **CreateOptionItem()**: `SpawnObject(13 ScoopOptionItem, Vector3.zero, identity, parent _contentParent)`, `GetComponent<OptionItem>`, localScale = one, add to list.
- **SelectedOptionItemByIndex(i)**: if `0 <= i < _optionItems.Count`, then `SelectedOptionItem(_optionItems[i])`.
- **SelectedOptionItem(item)**:
  1. `_selectedOptionItem?.SetSelected(false)`.
  2. `_selectedOptionItem = item`, then `item.SetSelected(true)`.
  3. `_dataDecor.SetSelectedItem(_selectedCategoryIndex, item.id)`. This saves.
  4. `OnOptionSelected?.Invoke(_selectedCategoryIndex, item.id)`.
  This also fires on every panel open and every tab switch, re-applying (and re-saving) the current skin.
- **OnOptionItemClicked(item)** (SelectButton):
  1. `PlaySound(click)`, then `Haptic(LightImpact)`.
  2. `HandleClickOptionItem(item)`.
- **HandleClickOptionItem(item)**:
  1. `item.StartClickEffect()`.
  2. If `_dataDecor.HasUnlockedItem(cat, item.id)`: `SelectedOptionItem(item)`.
  3. Else: `OnOptionItemBuyClicked(item)`. A locked tap therefore plays click + haptic twice.
- **OnOptionItemBuyClicked(item)** (btnBuy, or a locked SelectButton tap):
  1. `PlaySound(click)`, then `Haptic(LightImpact)`.
  2. `opt = _categoryAsset.GetOptionDataByID(item.id)`.
  3. If `opt.UnlockType == 1` (Ads): rewarded ad (placement "unlock_scoop_decor"), then `UnlockOptionItem(item)`. **One ad per unlock**. `Price` (=1) is not read for ads, and the prefab text "0/1" is static.
  4. Else if `opt.UnlockType == 5` (IAP): nothing.
  5. Else (Coin):
     - If `opt.Price > money`: `item.StartClickEffect()`, then `UIManager.ShowPopup<T>()`. This is the same generic popup that SelectBox/SelectCard open when coins are short (not-enough-coins/shop popup, inferred).
     - Else:
       - `PlaySound(ESound.sfx_purchase_coin (47))`
       - `MoneyManager.UpdateMoney(-opt.Price)`
       - `UnlockOptionItem(item)`
- **UnlockOptionItem(item)**:
  1. `_dataDecor.UnlockItem(cat, item.id)`. This saves.
  2. `item._btnSelected.interactable = true`.
  3. `item.SetActiveStatus(true)`, `item.SetActiveBuyButton(false)`.
  4. `item.NotiGo.SetActive(false)`.
  5. `SelectedOptionItem(item)`. The item is equipped immediately; a null item only logs an error.
- **Refresh()** (on money change). For each item in `_optionItems` that is **not** unlocked:
  - `opt = GetOptionDataByID(item.id)`
  - `ok = money >= opt.Price && opt.UnlockType == 2`
  - `item.NotiGo.SetActive(ok)`
  - `item._btnSelected.interactable = ok`

  Quirk: after any money change, locked **ad** items' SelectButton becomes non-interactable. Their btnBuy still works.
- `UpdateDefaultOption()` is empty.

## OptionItem (PoolElement)
- `OnInit(onSelected, onBuy)`:
  1. `_btnSelected.onClick.RemoveAllListeners()` and `_btnBuy.onClick.RemoveAllListeners()`.
  2. Add `() => onSelected(this)` and `() => onBuy(this)`.
  3. `SetSelected(false)`.
- **SetSelected(b)**:
  1. `_selected(Panel/Selected).SetActive(b)`, and if present `_checkOptional(Panel/Check).SetActive(b)`.
  2. `_txtStatus.text = Localize(b ? "Equipped" : "Owned")`.
  3. `_txtStatus.color = b ? (0,0,1,1) : (0,0,0,1)` (blue / black).
- `SetUnlockType(t)`: CoinLock.SetActive(t==2), AdLock.SetActive(t==1), OtherLock.SetActive(t==5) if present.
- `SetPrice(p)`: `_txtPrice.text = p.ToString()`.
- `SetActiveStatus(b)`: `_txtStatus.gameObject.SetActive(b)`.
- `SetActiveBuyButton(b)`: `_btnBuy.gameObject.SetActive(b)`.
- Also: `SetIcon`, `SetID`, `GetID`, `SetStatus`, `SetColorStatus`, `SetInteractableBtnSelected/Buy`, `SetActiveNotification` (NotiGo).
- **StartClickEffect()**: `_panel.localScale = 1`, DOKill, then `DOPunchScale(one * 0.1, 0.2, 10, 1)`.

## DataScoopVisual (GameData; save of selected/unlocked skins)
Saved object `_dataSave: DataSaveScoopVisual { List<CategoryData> CategoryDataList }`, where `CategoryData { int ID; int SelectedItemID; List<int> UnlockedItems }`.
Saved through `DataManager.SaveData(GetName(), _dataSave)`. The key is `GameData.GetName()` = the runtime type's name, i.e. "DataScoopVisual" (inferred). The format is whatever DataManager uses (JSON). For the port, save as localStorage JSON under `DataScoopVisual`.
- **NewData()** (first run). For i in 0..categoryCount-1 (3):
  - `cd = {ID: i, SelectedItemID: 0, UnlockedItems: []}`
  - Add the ID of every option of category i with `UnlockType == 0` to `UnlockedItems`
  - Add `cd` to the list

  Defaults: bowl [0], spoon [0], bag [0]; all selected 0.
- `GetSelectedItem(cat)` = `CategoryDataList.Find(c => c.ID == cat).SelectedItemID`.
- `HasUnlockedItem(cat, id)` = `Find(cat).UnlockedItems.Contains(id)`.
- `UnlockItem(cat, id)`: if not already contained, add id, then `SaveData()`. Returns true if newly added (inferred).
- `SetSelectedItem(cat, id)`: `Find(cat).SelectedItemID = id`, then `SaveData()`.
- `LoadData()`: `_dataSave = DataManager.LoadData<DataSaveScoopVisual>(GetName())`.

## ScoopDataHolding (MonoSingleton, `GameHandle/ScoopDataHolding`): per-round opened charms
- `_openedItems: List<int>` holds the charm IDs opened from blind boxes this round. `OpenedItems` getter.
- `ClearScoopData()` clears it. Called from `ScoopGameController.StartScoopGame`.
- `RegisterItem(id)` adds the id.
- `ThisItemMakePair(id)` = `_openedItems.FindAll(x => x == id).Count % 2 == 1`.
  `BlindBox.CheckPairAndRegisterData` calls it **before** RegisterItem. If true, `_isLuck = true` and `_goLuck` is shown (a duplicate makes a pair).
- `HasOrderItem()` = `_openedItems.Contains(<some MonoSingleton>.intField@0x48)`. This is the customer's ordered charm id (inferred). Used by CompletedPopup and ScoopGameController.GetTip: tip 200 (A/B: 300) if true.
- Income from the main context: `data_config_type==1 ? _openedItems.Count*100 : 300`.

## Config assets (so.json; sprite names via names.json)
`ScoopGameVisualAsset` "ConfigScoopGameVisual" (sharedassets0:14491) holds `CategoryAssets` = [0 ConfigBowlCategoryAsset, 1 ConfigSpoonCategoryAsset, 2 ConfigBlindBagCategoryAsset].
Methods: `GetCategoryAssetByIndex`, `GetCategoryAssetCount`, `GetCategoryAssetIndex`, `GetCategoryAssetByName` (by `Name`), `GetCategoryIndexByName`.
`CategoryAsset { string Name; Sprite OnIcon, OffIcon; List<OptionData> OptionDatas }` with `GetOptionDataByID/ByIndex/Count/Index`.
`OptionData { int ID; Sprite Icon; EUnlockType UnlockType; int Price }`. EUnlockType: 0 Unlocked, 1 Ads, 2 Coin, 3 Day, 4 Level, 5 IAP.

#### Bowl: ConfigBowlCategoryAsset (sharedassets0:14490) Name='Bowl' OnIcon=OffIcon=ic_cup
| ID | Icon | UnlockType | Price |
|---|---|---|---|
| 0 | cup_strawberry | 0 Unlocked | 2 |
| 1 | cup_peugin | 1 Ads | 1 |
| 2 | cup_black | 1 Ads | 1 |
| 3 | cup_cat | 1 Ads | 1 |
| 4 | cup_watermelon | 2 Coin | 850 |
| 5 | cup_honey | 1 Ads | 1 |
| 6 | cup_bowl | 2 Coin | 1000 |

#### Spoon: ConfigSpoonCategoryAsset (sharedassets0:14492) Name='Spoon' OnIcon=OffIcon=ic_scoop
| ID | Icon | UnlockType | Price |
|---|---|---|---|
| 0 | scoop_1 | 0 Unlocked | 0 |
| 1 | scoop_2 | 2 Coin | 500 |
| 2 | scoop_6 | 2 Coin | 500 |
| 3 | scoop_3 | 1 Ads | 1 |
| 4 | scoop_7 | 1 Ads | 1 |
| 5 | scoop_4 | 2 Coin | 500 |
| 6 | scoop_5 | 1 Ads | 1 |

#### Blind Bag: ConfigBlindBagCategoryAsset (sharedassets0:14489) Name='Blind Bag' OnIcon=OffIcon=ic_blind_bag
| ID | Icon | UnlockType | Price |
|---|---|---|---|
| 0 | blind_bag_defaut | 0 Unlocked | 0 |
| 1 | blind_bag_peguin | 1 Ads | 1 |
| 2 | blind_bag_pink | 1 Ads | 1 |
| 3 | blind_bag_purple | 1 Ads | 1 |
| 4 | blind_bag_red | 2 Coin | 700 |
| 5 | blind_bag_grteen | 2 Coin | 700 |

#### BowlVisualAsset "ConfigBowlVisual" (sharedassets6:163): `BowlVisualDataItem {ID, Full, Front, Shadow}`, GetData(id) by ID
| ID | Full | Front | Shadow |
|---|---|---|---|
| 0 | cup_strawberry | cup_strawberry_front | Shadow6 |
| 1 | cup_peugin | cup_peugin_front | Shadow5 |
| 2 | cup_black | cup_black_front | Shadow1 |
| 3 | cup_cat | cup_cat_front | Shadow3 |
| 4 | cup_watermelon | cup_watermelon_front | Shadow7 |
| 5 | cup_honey | cup_honey_front | Shadow4 |
| 6 | cup_bowl | cup_bowl_front | Shadow2 |

#### SpoonVisualAsset "ConfigSpoonVisual" (sharedassets6:164): `SpoonVisualDataItem {ID, Full, Front}`
| ID | Full | Front |
|---|---|---|
| 0 | scoop_1 | scoop_1_front |
| 1 | scoop_2 | scoop_2_front |
| 2 | scoop_6 | scoop_6_front |
| 3 | scoop_3 | scoop_3_front |
| 4 | scoop_7 | scoop_7_front |
| 5 | scoop_4 | scoop_4_front |
| 6 | scoop_5 | scoop_5_front |

#### ScoopBagVisualAsset "ConfigScoopBagSkin" (sharedassets6:160): `ScoopBagSkinDataItem {ID, SkinName}`, `_ref` = ConfigBlindBagCategoryAsset
GetData(id) by ID. GetRandomData() = `_dataList[Random.Range(0, Count)]`. The SkinName is the spine skin for the scoop blind bags (BlindBoxPlate.SetBlindBoxVisual).
| ID | SkinName |
|---|---|
| 0 | defaults |
| 1 | penguin |
| 2 | pink |
| 3 | purple |
| 4 | red |
| 5 | green |

#### BlindBagVisualAsset "ConfigBlindBagVisual" (sharedassets0:14493): `BlindBagVisualDataItem {ID, SkinName, Full, Half1, Half2}`
Not used by the decor panel; it serves the Blindbag market/series art. GetData(id), GetRandomData() = random element, GetAllData().
| ID | SkinName | Full | Half1 | Half2 |
|---|---|---|---|---|
| 0 | nature | blind_bag | blind_bag_1 | blind_bag_2 |
| 1 | sweet | blind_bag2 | blind_bag2_1 | blind_bag2_2 |
| 2 | animal | blind_bag3 | blind_bag3_1 | blind_bag3_2 |
| 3 | ocean | blind_bag4 | blind_bag4_1 | blind_bag4_2 |
| 4 | space | blind_bag5 | blind_bag5_1 | blind_bag5_2 |
| 5 | adventure | blind_bag6 | blind_bag6_1 | blind_bag6_2 |
| 6 | fashion | blind_bag6 | blind_bag6_1 | blind_bag6_2 |
| 7 | fast_food | blind_bag6 | blind_bag6_1 | blind_bag6_2 |
| 8 | fruit | blind_bag6 | blind_bag6_1 | blind_bag6_2 |
| 9 | gadget | blind_bag6 | blind_bag6_1 | blind_bag6_2 |
| 10 | kawaii | blind_bag6 | blind_bag6_1 | blind_bag6_2 |
| 11 | kitchen | blind_bag6 | blind_bag6_1 | blind_bag6_2 |

#### BlindbagMarketAsset "ConfigBlindbagMarket" (sharedassets3:107): `BlindBagMarketDataItem {ID, BuyType, Price, Name}`
Used by Blindbag.ItemBase (market in another mode), not by the decor panel.
`GetData(id)` / `GetAllData()` select the list by `RemoteConfigManager.data_config_type`: **`== 1` → `_dataList`, otherwise (default 0) → `_dataListAB`**. Note the naming is inverted: the default build uses the "AB" prices.
| ID | Name | BuyType | `_dataList` Price (config_type 1) | `_dataListAB` Price (default 0) |
|---|---|---|---|---|
| 0 | Nature Fan | 2 Coin | 225 | 375 |
| 1 | Sweet World | 2 Coin | 295 | 445 |
| 2 | Animal Friends | 2 Coin | 205 | 325 |
| 3 | Ocean Friends | 2 Coin | 220 | 370 |
| 4 | Space Time | 2 Coin | 390 | 550 |
| 5 | Adventure Now | 2 Coin | 215 | 365 |
| 6 | Fashion Pop | 2 Coin | 345 | 495 |
| 7 | Fast Food | 2 Coin | 230 | 380 |
| 8 | Fruit Party | 2 Coin | 205 | 315 |
| 9 | Gadget Box | 2 Coin | 425 | 575 |
| 10 | Kawaii Land | 2 Coin | 375 | 525 |
| 11 | Cozy Kitchen | 2 Coin | 275 | 425 |

## Sounds / haptics summary
- Decor button, close (x2 on CloseButton), category tab tap, option tap, buy tap: `ESound.click (1)`.
- Category, option and buy taps also fire `Haptic(LightImpact)`.
- Coin purchase success: `ESound.sfx_purchase_coin (47)`.
- Not enough coins: punch effect + shop/not-enough popup (inferred).

## First-time behaviour
NewData unlocks and selects ID 0 in all 3 categories: cup_strawberry, scoop_1, blind_bag_defaut / skin "defaults". There is no tutorial for the decor panel.

## Implementation checklist
- [ ] HUD Decor button: click sound, slide Panel up (0 over 0.36s), run ShowStepScoopButton(false, 0.5) with the table values, open the Bowl tab (no sound).
- [ ] Close (btnClose full-screen backdrop or CloseButton): click sound, slide down to -(1060.23+200) over 0.36s, then alpha 0 / no raycasts. Show Bowl, hide PreviewBag. Run ShowStepScoopButton(true, 0.5).
- [ ] Panel is non-interactable until the show tween completes, and during hide.
- [ ] 3 tabs (ic_cup / ic_scoop / ic_blind_bag), SelectedGo on the active one. Tab tap: click + haptic + punch 0.1/0.2s. Blind Bag tab hides Bowl and shows the 3 PreviewBag sprites (scale 0.8).
- [ ] Option grid per category: icon, Selected frame + Check on the equipped one, buy button with AdLock or CoinLock (price text) while locked, NotiGo badge when a coin item is affordable. Re-evaluate on every money change (with the ad-item SelectButton quirk).
- [ ] Unlocked tap: equip, save, fire OnOptionSelected(cat, id). Bowl: Full/Front/Shadow sprites. Spoon: Full/Front sprites. Bag: BlindBoxPlate spine skin, plus the preview-bag sprite pulse (0.9 over 0.1s, delay i*0.1, then 0.8 over 0.2s).
- [ ] Locked Ads item: rewarded ad, then unlock and equip. Locked Coin item: if money >= price, deduct, play sfx_purchase_coin, unlock and equip; else punch + not-enough-coins popup.
- [ ] Save `{CategoryDataList:[{ID,SelectedItemID,UnlockedItems[]}]}` under "DataScoopVisual" after every select and unlock. Apply the saved skins at scene start.
- [ ] Re-equipping on panel open and tab switch re-fires OnOptionSelected. That is harmless; keep it.

---
# PART C
# Part: Blind-box opening step + scoop-result preview (Lucky Scoop, scene level6)

Conventions: world units for SpriteRenderer objects, UI units (anchoredPosition, reference canvas) for UI. "DelayedCall(t, f)" = DOVirtual.DelayedCall with ignoreTimeScale=true unless stated. Sound = `AudioManager.PlaySound(ESound, volume 1, delay 0, loop false)`. Vibrate = `Vibration.Vibrate(60 ms, amplitude -1 (default), cancel false)` (skip/`navigator.vibrate(60)` in HTML).

## 0. Step flow summary (unbox step)

```
ScoopGameController.GoToStepBlindBox():
  BG After Scoop.SetActive(true); Bowl.SetActive(false); BlindBoxTray.SetActive(true)
  Physics2DRaycaster.enabled = true            // makes 2D colliders receive pointer events
  SetupBlindBoxPlate()
  ScreenInGame.ShowContentUnbox()

SetupBlindBoxPlate():
  plate.ClearPlate()
  for i in 0 .. _blindBagScooped-1:
      d = CharmBlindBoxAsset.GetRandomData(0.6)   // arg ignored, uniform random (see §5)
      plate.SpawnBlindBox(d.Id, d.Sprite)
  plate.PopOutBlindBox()
```
`_blindBagScooped` = number of stars collected during the scoop phase (summed in SetupScoopResult; other agent).
Bags auto-pop one by one into the unbox zone; player TAPS each bag once to open it (no drag/tear, 1 tap = open).
Charm reveal -> charm flies to screen centre -> parks on the result tray. A charm whose id was already
opened an odd number of times this session ("makes a pair") is LUCKY: star icon, "Get one more!" banner,
dark BG + glow, and one extra bag is spawned for free (no ad). When every bag has been opened the tray slides
away and the game transitions to the Select-Box step.

Who calls `ScoopGameController.AddMoreBlindBox`: only `ScreenInGame.ShowCharmFlyToBasket` when `isLuck==true`.
`ScoopGameController.IsDoneUnbox()` (= plate.DoneUnbox) has no callers; DoneUnbox is read directly by the
ShowCharmFlyToBasket lambda. There is no "Get one more" ad button in this step.

## 1. Scene objects (level6)

`BlindBoxTray` (inactive at start, pos (0,0)) — `ScoopGame.BlindBoxPlate` + BoxCollider2D trigger size (11.2895, 7.4014) offset (-0.0085,-4.3197)
(world rect x∈[-5.653,5.636], y∈[-8.020,-0.619]); this is the tray tap area.
```
BlindBoxTray
  Plate(Hidden at low pos) (0,-20)       -> _tfPlate (pulses/shrinks; off-screen, essentially invisible)
    tray_F (0.03,0)
  Black_BG (0,0) SR Square, color black alpha 0, drawMode tiled size 25x30; SortingGroup order 5  -> CharmFlyToBasket._spriteBG
    Glow_Fx (0,2) scale (0,1)            -> CharmFlyToBasket._tfContent2D
      fx_glow_purple (0.29,0) scale 1.2  SR o1; DOTweenAnimation Scale->1.1 0.25s InOutSine Yoyo inf
        fx_rotation (-0.2417,0)          SR o2; DOTweenAnimation Rotate->(0,0,30) 0.6s InOutSine Yoyo inf
  PlateHoldResult (0,5)                  -> _tfPlateResult (tray where opened charms rest)
    tray_topview SR o2
    TopRight (3.01,1.44)  BottomLeft (-3.00,-0.92)   -> _tfTopRightPlate/_tfBottomLeftPlate AND _tfComplimentTopRight/BottomLeft
                                                        (world x∈[-3.00,3.01], y∈[4.08,6.44])
  BoxHolder (0,-20)                      -> _tfHolder (parent of spawned bags)
    BlindBox (2.75,-26.12)  TEMPLATE (_blindBoxItem), world (2.75,-46.12)
      ScoopGame.BlindBox; SortingGroup order 4; BoxCollider2D trigger 2.71x3.3 offset 0, DISABLED
      charm (0,0) scale 0.19  SR clicker_16 o3             -> _srCharm / _tfCharm
        lucky (0,0.14) scale 1.3 SR charm_star o3          -> intended _goLuck (field not present in export; see note)
      Spine GameObject (Scoop_Blind_Bag) (0,-2.13)          -> _bagSkeleton (skins defaults/green/penguin/pink/purple/red;
                                                              anims "animation" (static idle), "bag_open" 0.833s)
    TopRight (3.27,1.69)  BottomLeft (-3.57,-1.43)          -> _tfTopRight/_tfBottomLeft (spawn area, world x∈[-3.57,3.27], y∈[-21.43,-18.31], off-screen)
  UnboxZone (0,0)
    TopRight (4.07,0.50)  BottomLeft (-4.15,-5.00)          -> _tfTopRightOpen/_tfBottomLeftOpen (bags land here: x∈[-4.15,4.07], y∈[-5,0.5])
```
Note `_goLuck`: the exported BlindBox MB has no `_goLuck` entry; code dereferences it unconditionally
(SetCharm / CheckPair / ShowAtCenter), so in the real build it must be `charm/lucky`. Use that (inferred).
Template `lucky` is active in the scene but SetCharm hides it on every spawn.

UI `UIManager/[Sceen]/ScreenInGame/ContentBlindBox` (inactive; `ScoopGame.CharmFlyToBasket`), rt = stretch:
```
  BasketBehind  scale 0  Img basket  anchor (1,1) pos (-145.9,-188.5) size 213x214     (vestigial, never shown in Scoop mode)
  Basket        scale 0  Img basket  anchor (1,1) pos (-145.6,-188.6); children TopRight(49.8,27.5) BottomLeft(-46,1.3), Image basket_F
  Content       scale 0  stretch, pivot (0.5074,0.5704)       -> _tfContent ("Get one more!" banner)
    Message  Txt 'Get one more!' (localized) anchor y 0.5 pos (0,699.9) size(-300,160) font 98.6
  CharmHolder/CharmImage (inactive) Img                       -> _imgCharm (unused in this mode)
  Star (inactive) Img charm_star anchor center pos (-2,494) size 125x120 rotZ -6   -> _imgLucky
       DOTweenAnimation Rotate->(0,0,12) 0.25s InOutSine Yoyo inf
```
`ScreenInGame/ContentScoop/PreviewListStar` (CanvasGroup alpha 0, blocksRaycasts false; Img black alpha 0.902 full-screen) — see §7.

## 2. ScoopGame.BlindBoxPlate (on BlindBoxTray)

Fields: `_spawnedBlindBox` List<BlindBox>; `_currentBoxHold` int (bags still on the hidden plate); `_cachedSkinName`; x,y (compliment pos);
`_complimentSprites` = [AWESOME!, GREAT JOB!, LOVELY!, Perfect]; `_complimentSoundEnum` = [30 sc_Awesome, 27 sc_Greatjob, 29 sc_Lovely, 28 sc_Perfect] (same index).

Properties
- `RareCharmCount` = count(spawned where IsLuck) — unused.
- `DoneUnbox` = count(spawned where !OpenDone) == 0.

`SetBlindBoxVisual(skin)`: `_cachedSkinName = skin; _blindBoxItem.SetVisual(skin)` (template). Called from ScoopGameController.Start
and OnOptionSelected(category 2) with `ScoopBagSkinDataItem` skin name (the bag skin chosen in the decor panel).

`ClearPlate()`: Destroy every spawned bag GameObject; list.Clear(); `_currentBoxHold = 0`.

`SpawnBlindBox(id, sprite)`:
```
n   = _spawnedBlindBox.Count
pos = (rand(BL.x,TR.x), rand(BL.y,TR.y), n*0.1)        // BoxHolder TopRight/BottomLeft world pos (off-screen y≈-20)
rot = Euler(0,0, rand(0,360))
box = Instantiate(_blindBoxItem, pos, rot, parent=_tfHolder)
box.SetVisual(_cachedSkinName); box.SetCharm(id, sprite); box.DisableBagClick()
box._tfPlate = _tfPlateResult; box._onPlatePos = GetRandomPositionBetweenPlate(); box._blindBoxPlate = this
box.name = "BlindBox_" + siblingIndex
_spawnedBlindBox.Add(box); _currentBoxHold++
```
`GetRandomPositionBetweenPlate()` = (rand(BLp.x,TRp.x), rand(BLp.y,TRp.y), rand(BLp.z,TRp.z)) using PlateHoldResult corners (world x∈[-3,3.01], y∈[4.08,6.44]).
Random.Range(float) is inclusive uniform.

`PopOutBlindBox()`: `DelayedCall(0.1, () => for i in 0..Count-1: Invoke("CheckPopOutBlindBox", i*0.1))` (MonoBehaviour.Invoke, scaled time).
So bag k pops at t = 0.1 + k*0.1 s.

`OnPointerDown` (tray collider): if pointer over UI -> return; else `CheckPopOutBlindBox()` (lets the player speed up popping; surplus Invokes later do nothing).

`CheckPopOutBlindBox()`:
```
if _currentBoxHold < 1: return
Sound Charmremove(16); Vibrate
target = (rand(BLo.x,TRo.x), rand(BLo.y,TRo.y))          // UnboxZone
_tfPlate.DOKill(); _tfPlate.localScale = (1,1,1)
_tfPlate.DOScaleX(1.1, 0.05).SetLoops(2, Yoyo)
_tfPlate.DOScaleY(1.1, 0.05).SetLoops(2, Yoyo).SetDelay(0.05)
idx = _currentBoxHold-1;  box = _spawnedBlindBox[idx]          // pops LAST spawned first
box.transform.DOJump((target.x, target.y, box.position.z), jumpPower 3, numJumps 1, duration 0.5)
   .SetDelay(0.15).OnComplete(() => { Vibrate; box.EnableClick() })   // collider on -> tappable
_currentBoxHold--
if _currentBoxHold == 0:
    _collider.enabled = false                                   // tray no longer tappable
    _tfPlate.DOScale(0, 0.5).SetEase(InBack)
```

`AddMoreRandomBox(id, sprite)` (lucky bonus bag):
```
target = rand point in UnboxZone (x,y);  n = _spawnedBlindBox.Count
box = Instantiate(_blindBoxItem, _blindBoxItem.position /*template world (2.75,-46.12)*/, Euler(0,0,rand(0,360)), _tfHolder)
SetVisual(cachedSkin); SetCharm(id,sprite); DisableBagClick(); _tfPlate=_tfPlateResult; _onPlatePos=GetRandomPositionBetweenPlate(); plate=this
name "BlindBox_{sibling}"; _spawnedBlindBox.Add(box)            // _currentBoxHold NOT changed
box.transform.DOJump((target.x, target.y, n*0.1), power 3, 1 jump, duration 1.0)
   .OnComplete(() => { Vibrate; box.EnableClick() })
```
No sound here (sc_Get1More is played by CharmFlyToBasket).

`SpawnCompliment()` (called by a bag 0.4 s after it is tapped):
```
x = rand(BLc.x, TRc.x); y = rand(BLc.y, TRc.y)            // PlateHoldResult rect (world x∈[-3,3.01], y∈[4.08,6.44])
item = PoolManager.SpawnPoolElement(PoolType.Compliment=108).GetComponent<ComplimentItem>()
r = Random.Range(0, 4)                                     // int, exclusive
item.ShowEffect(_complimentSprites[r], (x, y, 0))
AudioHelper.PlaySound(_complimentSoundEnum[r])             // 30/27/29/28
```

`HideTrayResult()`: `_tfPlateResult.DOLocalMoveY(-20, 0.8).SetDelay(0.3).SetEase(InBack)` (opened bags are children of it and go along).

## 3. ScoopGame.BlindBox (one bag)

Fields: `_srCharm`, `_tfCharm` (charm child, local scale 0.19), `_goLuck` (charm/lucky), `_collider` (BoxCollider2D 2.71x3.3 trigger),
`_sortingGroup` (order 4), `_bagSkeleton` (Scoop_Blind_Bag), runtime `_screenInGame`, `_fadeTween`, `_isLuck`, `_onPlatePos`,
`_tfPlate` (=PlateHoldResult), `_blindBoxPlate`, `_openDone`, `_dataId`.

- `Start`: `_screenInGame = UIManager.GetScreen<ScreenInGame>()`.  `Init(plate)`: `_blindBoxPlate = plate` (unused). OnEnable empty.
- `SetVisual(skin)`: `skin = skeletonData.FindSkin(skin)`; if found: `SetSkin; SetSlotsToSetupPose; AnimationState.SetAnimation(0, "animation", loop=true)`; else warn.
- `SetCharm(id, sprite)`: `_dataId=id; _srCharm.sprite=sprite; _isLuck=false; _goLuck.SetActive(false)`.
- `EnableClick()/DisableBagClick()`: `_collider.enabled = true/false`.
- `SetDestination(tfPlate, landingPos)`: stores both (unused; spawn writes fields directly).

`OnPointerDown` (bag tap; works only while collider enabled):
```
if pointer over UI: return
CheckPairAndRegisterData()
DisableBagClick()                      // single tap, cannot re-tap
AnimOpen(() => {})                     // empty callback
```
`CheckPairAndRegisterData()`:
```
if ScoopDataHolding.ThisItemMakePair(_dataId):   // count(_openedItems == id) is odd, BEFORE registering
    _isLuck = true; _goLuck.SetActive(true)       // star appears on the charm
ScoopDataHolding.RegisterItem(_dataId)            // _openedItems.Add(id)
```
So the 2nd, 4th, 6th... copy of the same charm in one session is lucky.

`AnimOpen(onComplete)`  (t = 0 at tap):
```
Sound Charmremove(16); Sound sc_bag_crack(18); Vibrate
_sortingGroup.sortingOrder += 3                 // 4 -> 7, above Black_BG (5)
_bagSkeleton.AnimationState.SetAnimation(0, "bag_open", loop=false)   // 0.833 s
DelayedCall(0.4, A)
A:  if _blindBoxPlate != null: _blindBoxPlate.SpawnCompliment()
    onComplete?.Invoke()
    _tfCharm.DOScale(0.8, 0.3).SetEase(Linear).OnComplete(B)            // charm grows out of the bag 0.19 -> 0.8
    AnimFade()
B:  (t=0.7) if _isLuck: Sound sc_SprayComplete(19)
    ShowAtCenter()
```
`AnimFade()`: kill `_fadeTween`; `color = skeleton color`; `_fadeTween = DOTween.To(() => color.a, a => skeleton.SetColor(color with a), 0, 0.5)` (bag fades out 0.5 s, t=0.4..0.9).

`ShowAtCenter()` (t=0.7): `transform.DOMove((0,2,0), 0.5)`; `transform.DORotate((0,0,0), 0.5).OnComplete(C)` (whole bag object; the charm ends upright at the Glow_Fx position).
`C` (t=1.2): `_goLuck.SetActive(false); _screenInGame.ShowCharmFlyToBasket(_srCharm.sprite, _isLuck, MoveToTray)`.

`MoveToTray()` (called as onDone, t = 1.2+1.0 normal / +2.5 lucky):
```
if _tfPlate == null: return
_sortingGroup.sortingOrder -= 3
transform.SetParent(_tfPlate)               // PlateHoldResult, world pos kept
transform.DOKill()
transform.DOScale(0.45, 0.5)
transform.DOJump(_onPlatePos, power 1, 1 jump, 0.5).OnStart(() => _openDone = true)
```

## 4. ScoopGame.CharmFlyToBasket (on ContentBlindBox)

Fields: `_imgLucky` (Star), `_spriteBG` (BlindBoxTray/Black_BG SR), `_tfContent` (ContentBlindBox/Content "Get one more!"),
`_tfContent2D` (Black_BG/Glow_Fx), basket/charm-image fields unused here, `x,y` (random point in Basket rect, computed but unused),
`_imageScale` 0.6 / `_imageScaleOnBasket` 0.1 (unused), `_animatingTime`.
Awake -> Initialize() (empty).

`ShowNewCharm(sprite, isLuck, onDone)` (sprite unused):
```
if isLuck:
    Sound sc_Get1More(24)
    _imgLucky.rectTransform.DOAnchorPosY(170, 0)          // snap
    _imgLucky.gameObject.SetActive(true)
    _imgLucky.rectTransform.DOAnchorPosY(500, 0.3)        // star rises 170 -> 500 (default ease OutQuad)
    _animatingTime = Time.time + 2
    _spriteBG.DOFade(0.95, 0.3)                            // dim world behind
    _tfContent.DOScale(1, 0.5).SetEase(OutBack)            // "Get one more!" pops in
    _tfContent2D.DOScale(1, 0.5).SetEase(OutBack)          // glow behind the charm at (0,2)
x,y = random in basket rect (unused)
DelayedCall(isLuck ? 2.5 : 1.0, () => onDone?.Invoke())
DelayedCall(isLuck ? 2.0 : 0.5, H)
H:  _imgLucky.gameObject.SetActive(false)
    if Time.time > _animatingTime:                        // skip if another lucky reveal extended it
        _spriteBG.DOFade(0, 0.5)
        _tfContent.DOScale(0, 0.3).SetEase(InBack)
        _tfContent2D.DOScale(0, 0.3).SetEase(InBack)
```
Note: for non-lucky charms nothing visible happens in this UI (no dim, no glow); the charm just waits 1.0 s at centre.
Edge (inferred): H fires at exactly time+2.0 of a lucky reveal, so `Time.time > _animatingTime` is true on that frame (frame later); in JS use `>=`.

## 5. ScoopGame.CharmBlindBoxAsset / CharmBlindBoxDataItem (sharedassets1.assets:847)

`CharmBlindBoxDataItem {Id, Rarity (CharmRarity Normal1/Rare2), Sprite, OrderLocalize}`.
DataList = 18 items, Id 0..17, all Rarity 1 (Normal), sprites clicker_1 .. clicker_18 (Id n -> clicker_{n+1}).
OrderLocalize (non-empty for ids 2,6..17): 2 "I want a Cat paw clicker", 6 Sandworms, 7 Avocado, 8 Rose, 9 Fried eggs, 10 Kitten,
11 Sushi, 12 Cake, 13 Rice, 14 Laptop, 15 Game console, 16 Heart, 17 Clouds ("I want a X clicker"); ids 0,1,3,4,5 empty.
(`_packs` = same 18 sprites, `_orders` = same strings; unused by code.)
- `GetData(id)` = DataList.Find(x => x.Id == id).
- `GetRandomData(float normalRate)` = `DataList[Random.Range(0, DataList.Count)]` — **normalRate (0.6) is ignored; uniform over 18, rarity unused.**
- `GetOrder()` = random element of DataList.FindAll(x => x.OrderLocalize.Trim() != "") — used by Home.PopupIntroScoop: shows the
  localized order as a livestream comment and stores the order Id in a global singleton (+0x48) that ScoopDataHolding.HasOrderItem reads.
- `GetAllData()` = DataList.

## 6. ScoopGame.ComplimentItem (prefab "Compliment", sharedassets0, PoolType Compliment=108)

Prefab: root scale (0,0); children (all SR order 10):
`AWESOME!` (0,0) rotZ 3 scale 1.2 = `_srMainCompliment` (DOTweenAnimation LocalRotate->(0,0,-3) 0.45s Linear Yoyo inf);
`effectbling_awessome_1` (-2.63,1.36) Scale->1.1 0.25s OutQuad Yoyo inf; `(1)` (3.15,-0.64) Scale->1.1 0.2s OutQuad Yoyo inf;
`(2)` (-1.50,-1.23) scale 1.5 LocalRotate->(0,0,-360) 1s Linear Restart inf; `(3)` (1.96,0.98) scale 1.5 same rotate.
`_srSubEffect` = the 4 bling SRs (inferred: list of children 1-4).

`ShowEffect(sprite, pos)`:
```
_srMainCompliment.sprite = sprite; transform.DOKill()
_srMainCompliment.DOFade(1, 0); each sub.DOFade(1, 0)
transform.position = pos; transform.localScale = 0
transform.DOScale(1, 0.5).SetEase(OutBack).OnComplete(F)
F: each sub.DOFade(0, 0.9).SetDelay(0.5)
   _srMainCompliment.DOFade(0, 1.0).SetDelay(0.5).OnComplete(DespawnSelf)
```
Total life ≈ 2.0 s.

## 7. PreviewListStar (ScreenInGame/ContentScoop/PreviewListStar) — "You've got N charms"

Called once per scoop via `ScreenInGame.ShowPreviewAnimWithStars(starSRs, onFlyToBasket, onCheckScoopDone)`:
`_decorButton.interactable = false; _previewListStar.ShowPreviewAnim(starSRs, onFlyToBasket, () => onCheckScoopDone?.Invoke())`.
`inputSprite` = the scoop's star SpriteRenderers (world objects in the spoon; caller is SpoonDragController, other part).

Fields: `_cvGroup` (own CanvasGroup), `_tfContent` (ContentScoop/Content: glow images + Message; scale 0, pivot (0.5062,0.6305)),
`_previewPos` 12 RectTransforms, `_previewImages` 12 Images (star_green, rotZ 10, 160x160), `_canvas` (UIManager Canvas), `_txtMessage` (Content/Message).
Mapping index i: `_previewPos[i]` = (i even ? RectHolder1 : RectHolder2).Rect[i/2]; `_previewImages[i]` = Images child (i even ? i/2 : 6+i/2).
RectHolder1: anchor y 0.5, pos y +400, HorizontalLayoutGroup spacing 5 MiddleCenter; RectHolder2 same at y +200; each Rect 160x100, all Rects start inactive
=> active stars are laid out as two centred rows (even indices top row y=400, odd bottom row y=200).
Content/Message pos (0,600) "You've got $ charms"; Content/Image glow (22,314) 980x957 Scale->0.9 0.5s InOutSine Yoyo inf,
its child fx_rotation Rotate->(0,0,30) 0.8s InOutSine Yoyo inf.

`Awake`: `_cvGroup.DOFade(0,0)`; `blocksRaycasts=false`; `_tfContent.localScale = 0`.

`ShowPreviewAnim(inputSprite, onHalfTimeEvent, onComplete)`:
```
sequence?.Kill()
Sound sc_ConnectVongTay(13)
n = count(inputSprite where gameObject.activeSelf)
_txtMessage.text = Localize("You've got $ charms").Replace("$", n)
for i in 0 .. inputSprite.Count-1:
    act = inputSprite[i].gameObject.activeSelf
    _previewImages[i].gameObject.SetActive(act); _previewPos[i].gameObject.SetActive(act)   // layout groups re-flow
    img = _previewImages[i]; img.localScale = 0
    img.anchoredPosition = WorldToCanvasPosition(inputSprite[i].position)    // start on top of the world star
    img.sprite = inputSprite[i].sprite
    DelayedCall(0.02, S_i)
S_i: img.transform.DOScale(1, 0.3).SetDelay(i*0.05).OnStart(() => inputSprite[i].gameObject.SetActive(false))  // world star hidden as UI copy appears
     img.rectTransform.DOAnchorPos(GetAnchoredPositionInCanvas(_previewPos[i]), 0.5).SetDelay(i*0.05).OnComplete(T_i)
T_i: img.transform.DOScale(0, 0.5).SetEase(InBack).SetDelay(2.0).OnComplete(() => img.gameObject.SetActive(false))
sequence = DOTween.Sequence():
   _cvGroup.blocksRaycasts = true
   Append  _cvGroup.DOFade(1, 0.3)                          // t 0.0-0.3 dark overlay (Image alpha 0.902)
   Append  _tfContent.DOScale(1, 0.5).SetEase(OutBack)      // t 0.3-0.8 message + glow pop
   Append  _tfContent.DOScale(1, 0.5)                       // t 0.8-1.3 hold
   AppendCallback onHalfTimeEvent                           // t 1.3 (onFlyToBasket)
   AppendInterval 0.5                                       // t 1.3-1.8
   Append  _tfContent.DOScale(0, 0.5).SetDelay(0.5).SetEase(InBack)   // t 2.3-2.8
   Join    _cvGroup.DOFade(0, 0.5).SetDelay(0.75)                     // t 2.55-3.05
   AppendCallback { _cvGroup.blocksRaycasts = false; onComplete?.Invoke() }   // t ≈3.05
```
WorldToCanvasPosition(world) = ScreenPointToLocalPointInRectangle(canvasRect, Camera.main.WorldToScreenPoint(world), canvas.worldCamera).
GetAnchoredPositionInCanvas(rt) = same but from RectTransformUtility.WorldToScreenPoint(canvas.worldCamera, rt.position) — i.e. convert both to the
canvas root's local space (images are children of a centred 100x100 "Images" rect at canvas centre, so canvas-local == anchoredPosition).
Star icons: start at world star, scale 0->1 (0.3 s) while flying to their row slot (0.5 s), staggered 0.05 s, then shrink away after 2 s.

## 8. ScreenInGame methods (unbox -> select box -> sort)

`ShowContentUnbox()`: ContentSort off, ContentSelectBox off, ContentBlindBox on, ContentScoop off; (analytics); `ShowChatContent(true)`.

`ShowCharmFlyToBasket(sprite, isLuck, onDone)` (from BlindBox.C):
```
if isLuck: _scoopGameController.AddMoreBlindBox()   // = plate.AddMoreRandomBox(d.Id, d.Sprite), d = GetRandomData(0.6)
_charmFlyToBasket.ShowNewCharm(sprite, isLuck, L0)
L0 (after 1.0 s / 2.5 s lucky):
    onDone?.Invoke()                                 // BlindBox.MoveToTray -> _openDone = true immediately (OnStart)
    _scoopGameController._putCharmToBox.SpawnCharm(sprite)   // pre-creates the draggable charm for the Sort step
    DelayedCall(0.1, L1)
L1: if _scoopGameController._blindBoxPlate.DoneUnbox:
        plate.HideTrayResult()
        DelayedCall(0.5, L2)
L2: SimpleSceneTransition.Instance.Transition(L3)   // screen transition; L3 runs at the covered moment (inferred)
L3: ShowContentSelectBox(); _scoopGameController.GotoStepSelectBox()   // BlindBoxTray.SetActive(false)
```
`ShowContentSelectBox()`: ContentSort off, ContentSelectBox on, ContentBlindBox off, ContentScoop off; (analytics); ShowChatContent(false);
`MoneyManager.ShowUp()` (coin counter appears); collapsible-banner ad (skip).

`OnSelectGiftBoxDone(boxData)` (SelectBox confirm):
```
ShowContentSort()
controller.OnSelectGiftBox(boxData.SpriteFull); controller.GotoStepSort()
controller._putCharmToBox.SetBoxVisual(boxData)
controller._boxPrice = (boxData.UnlockType == Coin(2)) ? boxData.Price : 100
```
`ShowContentSort()`: `MoneyManager.BackToParent()` (coin counter back/hidden, inferred); ContentSort/SelectBox/BlindBox/Scoop all off; (analytics); ShowChatContent(true).

`ShowContentSortPart2()` (after all charms put in box): `MoneyManager.ShowUp()`; ContentSort on; `_selectCard._canvasGroup.DOFade(1, 0.5)`;
(analytics); ShowChatContent(false); `_selectCard.ShowCardOnPosition(true)`.

`OnSelectCard(card)`: `controller._putCharmToBox.SetCardVisual(card)` (live preview).
`OnSelectCardDone(card)`: `MoneyManager.BackToParent()`; ContentSort off; `controller.OnDoneSelectCardStep()`;
`controller._cardPrice = (card.UnlockType == Coin(2)) ? card.Price : 100`; `_fxEmoji.Stop(); _fxEmoji.gameObject.SetActive(false)`.
`OnSetupGiftBoxDone()`: `controller.GotoDelivery()`.
`ShowChatContent(show)`: CommentChat.SetActive(show); Emoji particle GO SetActive(show); show ? Play() : Stop().
`<AddMoreScoop>b__38_0` (rewarded ad -> then): btnAddScoop hidden; `controller._maxScoop += 1`; `UpdateScoopStatus()`.

## 9. Timeline of one normal bag tap (t=0 at tap)
0.0 sounds 16+18, vibrate, bag_open anim, sorting 7 · 0.4 compliment (+its sound), charm 0.19->0.8 (0.3 s), bag alpha->0 (0.5 s) ·
0.7 move bag object to (0,2,0) + rotate to 0 (0.5 s) [+sc_SprayComplete if lucky] · 1.2 ShowCharmFlyToBasket (lucky: extra bag, star, banner, dim) ·
2.2 (lucky 3.7) MoveToTray: parent tray, scale 0.45, jump to random tray point (0.5 s); SpawnCharm for sort step ·
2.3 if all opened: tray DOLocalMoveY(-20) delay 0.3 dur 0.8 InBack · 2.8 scene transition -> Select Box step.
Several bags can be opened concurrently (each runs its own chain); the tray-hide check runs after each charm lands, only the last one triggers.

## 10. Data / save
- `ScoopDataHolding` (MonoSingleton, runtime only, NOT persisted): `_openedItems` List<int> of opened charm ids, in tap order.
  `ClearScoopData()` at ScoopGameController.StartScoopGame. `RegisterItem(id)` on every tap. `ThisItemMakePair(id)` = count(id) odd.
  `HasOrderItem()` = `_openedItems.Contains(orderId)` (order from Home intro popup) -> tip (200 / 300 in config variant 1).
  Income (variant 1) = `_openedItems.Count * 100`, default 300 (other part).
- Nothing in this step writes PlayerPrefs/DataSaveUser.

## 11. Implementation checklist
1. BlindBoxTray active, raycaster on; spawn `_blindBagScooped` bags off-screen (BoxHolder rect y≈-20), z=i*0.1, random Z-rotation, skin = selected bag skin, charm = uniform random of 18.
2. Pop bags (last first) every 0.1 s starting at 0.1 s; tray tap pops sooner. Each: sound 16, vibrate, DOJump to random UnboxZone point (power 3, 0.5 s, delay 0.15) then enable tap. After last: tray collider off.
3. Bag tap (once): register id (lucky if odd prior count, show star), sounds 16+18, `bag_open`, sorting +3; at 0.4 s compliment + charm grow + bag fade; at 0.7 s move to (0,2) & unrotate; at 1.2 s fly-to-basket logic.
4. Lucky: extra bag jumps from template pos to unbox zone (1.0 s), sc_Get1More, star 170->500, Black_BG alpha 0.95, banner + glow OutBack; hide after 2 s; wait 2.5 s total.
5. Charm parks on PlateHoldResult (scale 0.45, jump 0.5 s), PutCharmToBox.SpawnCharm(sprite).
6. When no un-opened bags remain: tray slides to localY -20, then transition to Select Box (BlindBoxTray off, ContentSelectBox on, coins shown).
7. Compliment pool item: scale 0->1 OutBack 0.5, fade out after 0.5 s (1.0 s main / 0.9 s blings), random of 4 sprites with matching sound 30/27/29/28.
8. Scoop preview: overlay fade, "You've got N charms", star icons fly from world stars to two centred rows, sequence ≈3.05 s, onHalfTime at 1.3 s.

---
# PART D
# Part: gift-box packing step (SelectBox, SelectCard, PutCharmToBox, CharmDrag, BoxComplete)

Conventions: sounds are `AudioManager.PlaySound(ESound, volume 1)`. "Vibrate" means `Vibration.Vibrate(60 ms, amplitude -1)`.
When an ease is not set, DOTween's default applies (OutQuad). Positions are Unity world units unless they are UI anchoredPosition.

## 0. Where these classes sit in the flow

1. `ScreenInGame.OnInit` calls `SelectBox.Init(screen)`, then `SelectBox.SpawnBox()`, then `SelectCard.Init(screen)`, then `SelectCard.SpawnCard()`. This happens once per scene load and builds both carousels up front.
2. `ScoopGameController.Start` calls `PutCharmToBox.Init(controller)`.
3. During the unbox step, every charm that flies to the basket calls `PutCharmToBox.SpawnCharm(sprite)` (from `ScreenInGame.ShowCharmFlyToBasket` b__0). The `PutCharmToBox` root is still inactive at that point, so the spawned charms stay hidden until it turns on.
4. `GotoStepSelectBox` leads to `ScreenInGame.ShowContentSelectBox`. That turns `ContentSelectBox` on and `ContentSort`/`ContentUnbox`/`ContentScoop` off, hides chat and shows Money.
5. When the player picks a box (select, coin or ad), `ScreenInGame.OnSelectGiftBoxDone(boxData)` runs these steps in order:
   - `ShowContentSort()`: all of `ContentSort`/`ContentSelectBox`/`ContentUnbox`/`ContentScoop` go off, chat goes on, and `MoneyManager.BackToParent` runs.
   - `controller.OnSelectGiftBox(boxData.SpriteFull)`, which calls `GiveBoxToCharacter.SetGiftBox` and `SetSkinCharacter`.
   - `controller.GotoStepSort()`, which turns `ScreenInGame._goBlockScreen` on and the `PutCharmToBox` GameObject on. It then calls `PutCharmToBox.OpenLid(onDone: _goBlockScreen off)`.
   - `controller._putCharmToBox.SetBoxVisual(boxData)`.
   - `controller._boxPrice = boxData.UnlockType == Coin ? boxData.Price : 100`.
6. The player drags every charm into the box. `CheckDoneStep` then slides the tray away, and its tween's OnComplete calls `ScreenInGame.ShowContentSortPart2()`. That call turns `ContentSort` on (the SelectCard UI), fades `SelectCard._canvasGroup` to 1 over 0.5 s, hides chat, shows Money, and calls `SelectCard.ShowCardOnPosition(true)`.
7. Each carousel move calls `ScreenInGame.OnSelectCard(cardData)`, which calls `PutCharmToBox.SetCardVisual(cardData)` to preview the card on the box.
8. When the player picks a card, `ScreenInGame.OnSelectCardDone(cardData)` runs these steps in order:
   - `MoneyManager.BackToParent`, and `ContentSort` goes off.
   - `controller.OnDoneSelectCardStep()`, which turns `_goBlockScreen` on. It then calls `PutCharmToBox.CloseLid(onDone: UIManager.HideScreen<ScreenInGame> + ShowPopup<DoneBoxCharmPopup>)`.
   - `controller._cardPrice = cardData.UnlockType == Coin ? cardData.Price : 100`.
   - `_fxEmoji.Stop()`, and the `_fxEmoji` GameObject goes off.
9. The DoneBoxCharmPopup Delivery button leads to `controller.GotoDelivery()`. That calls `PutCharmToBox.PrepareFinalBox()`, turns `PutCharmToBox` off and turns `GiveBoxToCharacter` on.

---

## 1. Shared carousel logic (SelectBox and SelectCard are near-identical)

Scene (level6, UI canvas):
```
UIManager/[Sceen]/ScreenInGame/ContentSelectBox (inactive)            SelectBox
  BoxHolder            rt anchors(0,.5)-(1,.5) pos(0,301) size(0,100)
    -BoxUIItem         (template, inactive) rt size 100x100 ; Image child Img(icon_box_1) 638.5x590.4
  BtnLeft  (anchor left,  pos(100,301))  arrow_left
  BtnRight (anchor right, pos(-100,301)) arrow_right
  BtnNext  (pos(0,-176) 250x250, button_v)       = _btnSelect
  -BtnAdsUnlock (pos(0,-176) 400x200, button_ads, text '0/1')
  -BtnCoinUnlock(pos(0,-176) 400x200, button_coin) / TxtPrice ('1000')
  PreviewPosition      rt anchors(0,.5)-(1,.5) pos(0,301)
    1 pos(-2000,0) scale 0     2 pos(-1000,0) scale 0.7     3 pos(0,0) scale 1
    4 pos(1000,0) scale 0.7    5 pos(2000,0) scale 0
  -TxtBoxName  (pos(0,718), 'Square Box', fs 67.8)
UIManager/[Sceen]/ScreenInGame/ContentSort (inactive)                 SelectCard
  CanvasGroup (CG alpha 1)
    CardHolder  pos(0,-306) ; -CardUIItem template, Image child Img(card_1) 550x500
    BtnLeft (100,-306) / BtnRight (-100,-306)
    BtnNext (0,-640) 250x250 ; -BtnAdsUnlock (0,-640) ; -BtnCoinUnlock (0,-640) / TxtPrice
    PreviewPosition pos(0,-306): children 1..5 same x/scale as above
    -TxtCardName (not referenced by code)
```
The holders and the PreviewPosition parents share the same anchors and Y, so a JS port can tween anchoredPosition directly. In Unity the code tweens world `position`.

Idle button animation (DOTweenAnimation, autoplay): `BtnNext`, `BtnAdsUnlock` and `BtnCoinUnlock` in ContentSelectBox loop uniform scale between 1 and 1.15 (0.5 s, Linear, Yoyo, infinite). `ContentSort/CanvasGroup/BtnNext` does the same toward 0.9. The card Ads/Coin buttons have no idle animation.

### Init(screenInGame)
- Stores `_screenInGame`.
- Wires the listeners: `_btnLeft` → OnLeftButtonClick, `_btnRight` → OnRightButtonClick, `_btnSelect` → OnSelectBox / OnSelectCard, `_btnAdsUnlock` → OnBtnAdUnlockClick, `_btnCoinUnlock` → OnBtnCoinUnlockClick.

### SpawnBox / SpawnCard
```
data = asset.DataList                       // all entries, config order
while list.Count < data.Count: list.Add(Instantiate(templateItem, holder))   // instantiated at template pos (0,0), template scale
for i in 0..data.Count-1: list[i].SetData(data[i])   // Image.sprite = SpriteFull / CardSprite; gameObject.SetActive(true)
ShiftRight(); ShiftRight();                 // so data[0] ends at list index 2 (= centre)
ShowOnPosition()                            // SelectBox: ShowBoxOnPosition(); SelectCard: ShowCardOnPosition(false)
```
Resulting start order:
- Boxes (7): list = data[5,6,0,1,2,3,4]. The centre is Carton Box, left is Orange, right is Blue.
- Cards (6): list = data[4,5,0,1,2,3]. The centre is Card 1, left is Card 3 (id5), right is Card 4 (id1).

### ShiftRight() / ShiftLeft()
- `ShiftRight`: if Count ≥ 2, move the last element to index 0.
- `ShiftLeft`: if Count ≥ 2, move element 0 to the end.
- `OnLeftButtonClick`: click sound, then `ShiftRight()`, then show. The previous item comes to the centre.
- `OnRightButtonClick`: click sound, then `ShiftLeft()`, then show. The next item comes to the centre.
- The carousel wraps around and has no bounds.

### ShowBoxOnPosition() / ShowCardOnPosition(bool showCard)
```
_btnSelect, _btnAdsUnlock, _btnCoinUnlock gameObjects -> SetActive(false)
(SelectBox only) _txtBoxName.gameObject.SetActive(false)
for i in 0 .. previewPositions.Count-1 (=5):
    t = list[i].transform; t.DOKill()
    t.DOMove(previewPositions[i].position, 0.3)                        // default ease
    t.DOScale(previewPositions[i].localScale, 0.3).OnComplete(cb)      // cb runs for EVERY item
for i in previewPositions.Count .. list.Count-1:
    list[i].transform.DOKill(); list[i].transform.localScale = Vector3.zero   // position untouched
(SelectBox only) _txtBoxName.text = list[2].Data.Name           // set immediately; shown in cb
(SelectCard only) if showCard: _screenInGame.OnSelectCard(list[2].Data)  // preview card on the box at once
cb (SelectBox, b__18_0): _txtBoxName.gameObject.SetActive(true); CheckShowButton()
cb (SelectCard, b__21_0): CheckShowButton()
```
- The unlock and select buttons are hidden for the 0.3 s of each move.
- Clicking quickly calls DOKill, which kills the pending OnComplete, so only the last move's callback fires.
- Items beyond index 4 collapse to scale 0 on the spot. When they come back they tween from wherever they collapsed (index 0 or 4 end at ±2000 with scale 0 anyway).
- `SelectCard.ShowCardFirstTime()` is `ShowCardOnPosition(true)`, but nothing calls it.
- `SelectCard.Show()` is `_canvasGroup.DOFade(1, 0.5)` and `Hide()` is `DOFade(0, 0)`. Neither is called; ScreenInGame inlines the Show fade.

### CheckShowButton()
```
d = list[2].Data
owned = DataManager.GetData<DataUser>().dataSave.OwnedGiftBox (0x88)   // SelectCard: OwnedCard (0x90)
if d.UnlockType == Unlocked(0) || owned.Contains(d.Id): _btnSelect.SetActive(true)
else if d.UnlockType == Coin(2): _txtCoinPrice.text = d.Price.ToString(); _btnCoinUnlock.SetActive(true)
else: _btnAdsUnlock.SetActive(true)          // Ads(1) (or any other type)
```

### OnSelectBox / OnSelectCard (BtnNext)
- Click sound, then `_screenInGame.OnSelectGiftBoxDone(list[2].Data)` (box) or `_screenInGame.OnSelectCardDone(list[2].Data)` (card).

### OnBtnCoinUnlockClick
```
d = list[2].Data; PlaySound(click)
if dataSave.Money (0x48) < d.Price:
    UIManager.ShowPopup<NotEnoughMoneyPopup>()   (placement 'unlock_gift_box_scoop' / 'unlock_gift_card_scoop'); return
DataUser.AddUnlockGiftBox(d.Id)      // card: AddUnlockCard(d.Id)
PlaySound(sfx_purchase_coin = 47)
MoneyManager.UpdateMoney(-d.Price)
_screenInGame.OnSelectGiftBoxDone(d)   // card: OnSelectCardDone(d)  -> proceeds immediately (no button refresh)
```

### OnBtnAdUnlockClick
- Plays the click sound. A rewarded ad would play here (placement 'unlock_gift_box_scoop' / 'unlock_card_scoop'), so treat it as a free reward.
- On success: `AddUnlockGiftBox(d.Id)` (card: `AddUnlockCard(d.Id)`), then `OnSelectGiftBoxDone(d)` (card: `OnSelectCardDone(d)`). No purchase sound.

### Ownership save (DataUser.AddUnlockGiftBox / AddUnlockCard)
- If the Id is not already in `dataSave.OwnedGiftBox` (0x88) or `dataSave.OwnedCard` (0x90), it is added.
- No explicit save call appears there; DataManager persists it later (inferred).
- Once an item is owned, CheckShowButton shows BtnNext for it next time. That only matters after a scene reload, because the step runs once per scene.

### BoxUIItem / CardUIItem
- Fields: `_previewImage` (child `Image`) and `_data`.
- `SetData(d)`: stores `d`, sets `_previewImage.sprite = d.SpriteFull` (card: `d.CardSprite`), and activates the GameObject.
- `Data` returns `_data`.

---

## 2. Config tables (so.json)

GiftBoxAsset `sharedassets6:161`, DataList in carousel order. `BoxCompletePrefab` is null for every entry (obsolete). The parallel lists `_spriteFull/_spriteLid/_spriteBody/_spriteBodyFront/_prefabCollider` are editor helpers only; runtime reads only DataList.

| Id | Name | UnlockType | Price | SpriteFull (UI icon, gift) | Body (`Box` SR) | Front | Lid | ColliderPrefab |
|---|---|---|---|---|---|---|---|---|
| 0 | Carton Box | Unlocked | 0 | box_defaut_full | box_defaut | box_defaut_front | box_defaut_lid | CustomCollider_square |
| 1 | Blue Box | Ads | 1 | box_blue_full | box_blue | box_blue_front | box_blue_lid | CustomCollider_circle |
| 2 | Yellow Box | Ads | 1 | box_yellow_full | box_yellow | box_yellow_front | box_yellow_lid | CustomCollider_hexagon |
| 3 | Pink Box | Coin | 300 | box_pink_full | box_pink | box_pink_front | box_pink_lid | CustomCollider_square |
| 4 | Cookie Box | Coin | 1000 | box_cookies_full | box_cookies | box_cookies_front | box_cookies_lid | CustomCollider_circle |
| 5 | Green Box | Coin | 600 | box_green_full | box_green | box_green_front | box_green_lid | CustomCollider_square |
| 6 | Orange Box | Coin | 400 | box_orange_full | box_orange | box_orange_front | box_orange_lid | CustomCollider_square |

GiftCardAsset `sharedassets6:159` (ConfigGiftCard):

| Id | Name | UnlockType | Price | CardSprite |
|---|---|---|---|---|
| 0 | Card 1 | Unlocked | 0 | card_1 |
| 1 | Card 4 | Ads | 1 | card_4 |
| 2 | Card 5 | Coin | 500 | card_6 |
| 3 | Card 6 | Ads | 1 | **null** |
| 4 | Card 2 | Coin | 400 | card_2 |
| 5 | Card 3 | Coin | 600 | card_3 |

- Card Id 3 has no sprite. In Unity its UI Image shows a plain white rectangle and the box card SR shows nothing. Replicate this or hide the card (port decision).
- `GetData(id)` returns the first DataList entry whose `Id == id`.

Collider prefabs (sharedassets6, root GO `p (0,0)`, one PolygonCollider2D trigger each; points are local to the prefab):
- **CustomCollider_square**: (0.0223,1.732) (2.3591,1.7429) (2.4111,-2.1436) (0.0076,-2.1842) (-2.3654,-2.1688) (-2.3086,1.7182)
- **CustomCollider_hexagon**: (1.6438,1.9277) (2.9182,-0.3259) (1.6563,-2.507) (-1.558,-2.4917) (-2.8966,-0.3236) (-1.6935,1.9139)
- **CustomCollider_circle**: (-1.6716,-2.1715) (-2.6311,-0.9244) (-2.4485,0.3759) (-1.5547,1.478) (-0.0264,2.0566) (1.3685,1.572) (2.311,0.4439) (2.4896,-0.9854) (1.667,-2.2241) (0.0315,-2.755)
- Scene `BaseCollider` (fallback, used only if a box had no prefab, which never happens): (2.9739,1.5948) (-2.6667,1.6129) (-2.4865,-2.7992) (2.6924,-2.8221).

---

## 3. PutCharmToBox (world space, scene root `PutCharmToBox`, initially inactive)

Scene:
```
-PutCharmToBox (0,0)
  BoxHolder (0,0)                                  = _tfBoxHolder (squash target)
    Box (0,5)  SR box_defaut o2, SortingGroup o3 (disabled by Init)   = _tfBox, _srBox, _boxSortingGroup
      LimitTopRight (2.33,2.60) / LimitBottomLeft (-2.37,-2.46)   -- NOT referenced by code (unused)
      card_1 (0,-1.47) rot z 12°, SR card_1 o4, alpha 0           = _srCard
      Lid (0,0.83) SR box_defaut_lid o7                           = _srLid   (world y 5.83)
      LidTop (0,9)                                                -- not referenced
      front (0,-1.86) SR box_defaut_front o5                      = _srBoxFront
      BaseCollider (0,0) PolygonCollider2D trigger                = _basePolygonCollider
  LidClosePos (0,5.83) = _tfLidClosePos      LidOpenPos (0,14) = _tfLidOpenPos
  Tray-Plate (0,-5.5) SR tray_topview o2     = _tfTrayBelow
  SpawnTopRight (3.10,-4.18) / SpawnBottomLeft (-3.07,-6.40)
  CharmHolder (0,0)                          = _tfCharmDragHolder
    -CharmDrag (template) SortingGroup o3, BoxCollider2D trigger size 3.18x2.69 offset 0
      Visual (0,0) scale 0.35, SR o3         = CharmDrag._srVisual
  ComplimentHolder: BottomLeft (-3.75,6.20) / TopRight (3.77,11.00)
_tfBoxFinal = GiveBoxToCharacter/Gift (0,-9) (SR icon_box_1 o3 alpha 0, GiftDraggable)
```

Other serialized values:
- Colors: `_wrongColor` (1, 0.647, 0.647, 1), `_rightColor` (0.647, 1, 0.647, 1), `_normalColor` (1, 1, 1, 1).
- Compliments: `_complimentSprites` = [AWESOME!, GREAT JOB!, LOVELY!, Perfect], paired index-for-index with `_complimentSoundEnum` = [sc_Awesome 30, sc_Greatjob 27, sc_Lovely 29, sc_Perfect 28].

Sorting while packing:
- The box SortingGroup is off, so the parts sort individually: body 2 < charm 3 < card 4 < front 5 < dragged charm 6 < lid 7. Charms render inside the box, in front of the body and behind the front panel and card.
- `PrepareFinalBox` turns the SortingGroup on (order 3), so the packed box renders as one unit.

Runtime fields:
- `x`, `y`: scratch floats.
- `_offset`: Vector2, pointer-to-charm offset.
- `_charmDragStatus`: Normal 0, Wrong 1, Right 2.
- `_currentCharmDrag`, `_listCharmDrag`, `_boxImportedPolygonCollider`.

### Init(controller)
- Stores `_scoopGameController` and sets `_boxSortingGroup.enabled = false`.

### `_boxPolygon` getter
- Returns `_boxImportedPolygonCollider` if it is not null, otherwise `_basePolygonCollider`.

### SetBoxVisual(boxData)
```
_srBox.sprite = boxData.SpriteBody; _srBoxFront.sprite = boxData.SpriteBodyFront; _srLid.sprite = boxData.SpriteLid
if _boxImportedPolygonCollider != null: DestroyImmediate(_boxImportedPolygonCollider.gameObject)
if boxData.ColliderPrefab != null:
    go = Instantiate(boxData.ColliderPrefab, parent = _basePolygonCollider.transform.parent /* = Box */)
    go.transform.localPosition = Vector3.zero
    _boxImportedPolygonCollider = go.GetComponent<PolygonCollider2D>()
```
The containment area is the prefab polygon in Box-local space, so world = polygon + Box position (0,5).

### SetCardVisual(cardData)
This is the preview on the box, called on every card carousel move.
```
_srCard.sprite = cardData.CardSprite
_srCard.DOKill(); _srCard.transform.DOKill()
_srCard.DOFade(0, 0)                         // alpha 0 instantly
_srCard.transform.localScale = Vector3.one * 1.3
_srCard.DOFade(1, 0.2)
_srCard.transform.DOScale(1, 0.3).SetEase(OutBack)
```

### SpawnCharm(sprite)
```
c = Instantiate(_charmDrag, _tfCharmDragHolder); c.SetVisual(sprite)      // Visual SR sprite
x = Random.Range(SpawnBottomLeft.x, SpawnTopRight.x)    // -3.07..3.10
y = Random.Range(SpawnBottomLeft.y, SpawnTopRight.y)    // -6.40..-4.18   (on the tray)
c.transform.position = (x, y, 0); c.SetBackPosition()   // remembers spawn pos as "home"
c.gameObject.SetActive(true); _listCharmDrag.Add(c)
```
There is one charm per opened blind-box charm, in the order they flew to the basket.

### Update(): drag input (pointer = mouse or touch, `Pointer.current`)
```
if Pointer.current == null or Touch.IsPointerOverUIObject(): return     // whole update skipped over UI
if press.wasPressedThisFrame:
    wp = Camera.main.ScreenToWorldPoint(pointer.position, z 0)
    hit = Physics2D.Raycast(wp.xy, Vector2.zero)          // point pick; triggers included
    if hit.collider != null and (cd = hit.transform.GetComponent<CharmDrag>()) != null:
        if _currentCharmDrag != null: CheckDragOnPos()    // safety: drop previous
        PlaySound(Charmremove = 16); Vibrate
        _currentCharmDrag = cd
        _offset = cd.position.xy - wp.xy
        cd.OnDrag()
if _currentCharmDrag != null and press.isPressed:
    wp = ScreenToWorldPoint(pointer.position)
    _currentCharmDrag.transform.position = (wp.x + _offset.x, wp.y + _offset.y, 0)
    CheckDragStatus()
if press.wasReleasedThisFrame and _currentCharmDrag != null:
    CheckDragOnPos(); CheckDoneStep()
    _currentCharmDrag = null; _charmDragStatus = Normal
```
- Charms that are already in the box can be picked up again until the step ends.
- Picking only works if the raycast's first hit is a charm. Charms carry a BoxCollider2D (3.18x2.69 at Visual scale 0.35). The box polygon is also a trigger collider, so a hit on it returns no CharmDrag and nothing is picked.
- Port suggestion (inferred): hit-test the charms' boxes topmost-first (last spawned or highest z) and ignore the box polygon.
- No position clamping is applied.

### CheckDragStatus(): live tint while dragging
```
if _currentCharmDrag == null: return
inside = _boxPolygon.OverlapPoint(_currentCharmDrag.transform.position)   // charm pivot point only
st = inside ? Right(2) : Wrong(1)
if st == _charmDragStatus: return
_charmDragStatus = st; _currentCharmDrag.SetColor(inside ? _rightColor : _wrongColor)   // Visual SR color
```

### CheckDragOnPos(): on release
```
if _currentCharmDrag == null: return
inside = _boxPolygon.OverlapPoint(charm.position)
charm._isOnRightPos = inside
charm.SetColor(_normalColor); charm.OnRelease()
if inside:
    PlaySound(sc_DatDay = 20); Vibrate; SpawnCompliment()
    n = _listCharmDrag.Count(c => !c._isOnRightPos)            // charms still outside
    charm.transform.position += Vector3.forward * (n * 0.1)    // z only (z = 0.1*n); no visible effect in 2D
else:
    charm.BackToPosition()          // DOMove(spawnPos, 0.75), default ease; no sound
```
A charm dropped outside always returns to its original tray spawn point, even if it was previously inside the box.

### SpawnCompliment()
```
x = Random.Range(ComplimentBottomLeft.x, ComplimentTopRight.x)   // -3.75..3.77
y = Random.Range(ComplimentBottomLeft.y, ComplimentTopRight.y)   // 6.20..11.00
item = PoolManager.SpawnPoolElement(PoolType.Compliment = 108).GetComponent<ComplimentItem>()
i = Random.Range(0, _complimentSprites.Count)           // 0..3
item.ShowEffect(_complimentSprites[i], (x, y, 0))       // see ComplimentItem part
AudioHelper.PlaySound(_complimentSoundEnum[i])          // same index: AWESOME->sc_Awesome, GREAT JOB->sc_Greatjob, LOVELY->sc_Lovely, Perfect->sc_Perfect
```
This runs on every successful drop, including re-drops of charms already in the box.

### CheckDoneStep(): after each release
```
if _listCharmDrag.Count(c => !c._isOnRightPos) != 0: return
ScreenInGame._goBlockScreen.SetActive(true)
_listCharmDrag.ForEach(c => c.SetDraggable(false))         // disables each BoxCollider2D
_tfTrayBelow.DOLocalMoveY(-20, 1.0).SetEase(InBack).OnComplete(() => {
    _scoopGameController._screenInGame.ShowContentSortPart2()    // SelectCard step
    ScreenInGame._goBlockScreen.SetActive(false)
})
```
The tray slides off-screen; the charms are not children of the tray and stay put. If the charm list is empty (no charms spawned) the step completes on the first release.

### OpenLid(onLidOpenDone): called from GotoStepSort
```
Vibrate
_tfBoxHolder.DOScaleY(0.9, 0.3).SetLoops(2, Yoyo)                 // squash 0.6 s total
_srLid.DOFade(0, 0.3).SetDelay(0.6)
_srLid.transform.DOMove(LidOpenPos.position /*(0,14)*/, 0.5).SetDelay(0.3).SetEase(OutQuart).OnComplete(onLidOpenDone)
```
The lid flies up from y=5.83 to 14 between t=0.3 and 0.8 s and fades out between 0.6 and 0.9 s. `onLidOpenDone` hides the block screen, so input unlocks at about t=0.8 s.

### CloseLid(onLidCloseDone): called from OnDoneSelectCardStep
```
_tfCharmDragHolder.SetParent(_tfBox)                    // worldPositionStays: charms now ride with the box
_srLid.DOFade(1, 0.3)
_srLid.transform.DOMove(LidClosePos.position /*(0,5.83)*/, 0.5).SetEase(InQuart).OnComplete(b__0)
b__0:
    PlaySound(sc_close_box = 21); Vibrate
    _tfBoxHolder.DOScaleY(0.9, 0.3).SetLoops(2, Yoyo).OnComplete(() => _tfBox.DOLocalMoveY(2.0, 0.3))   // Box y 5 -> 2
    DOVirtual.DelayedCall(1.0, () => onLidCloseDone?.Invoke(), ignoreTimeScale true)
```
Timeline: the lid lands at 0.5 s, the squash runs 0.5 to 1.1 s, the box drops 1.1 to 1.4 s, and the callback fires at 1.5 s (hide ScreenInGame, show DoneBoxCharmPopup).

### PrepareFinalBox(): called from GotoDelivery
```
_tfBox.SetParent(_tfBoxFinal /*GiveBoxToCharacter/Gift*/)   // worldPositionStays
_tfBox.localScale = Vector3.one * 0.8
_tfBox.localPosition = Vector3.zero
_boxSortingGroup.enabled = true                              // order 3
```
The packed box (body, charms, card, front, closed lid) becomes the gift the player drags to the character.

---

## 4. CharmDrag (template `PutCharmToBox/CharmHolder/CharmDrag`)

Fields:
- `_sortingGroup`: own SortingGroup, order 3.
- `_srVisual`: child `Visual` SR, scale 0.35.
- `_isOnRightPos`: bool, readable through `IsRightPos`.
- `_backPosition`: Vector3.
- `_collider`: BoxCollider2D 3.18x2.69, trigger; fetched in Awake via GetComponent.

Methods:
- `SetVisual(s)`: `_srVisual.sprite = s`.
- `SetColor(c)`: `_srVisual.color = c`.
- `SetOnRightPos(b)`: sets `_isOnRightPos`. PutCharmToBox writes the field inline.
- `SetDraggable(b)`: re-fetches `_collider` if it is null, then `_collider.enabled = b`.
- `OnDrag()`: `_sortingGroup.sortingOrder = 6`, `transform.DOKill()`, `transform.DOScale(1.1, 0.3)`.
- `OnRelease()`: `transform.DOKill()`, then `transform.DOScale(1.0, 0.3).OnComplete(sortingOrder = 3)`.
- `SetBackPosition()`: `_backPosition = transform.position`. Only SpawnCharm calls it.
- `BackToPosition()`: `transform.DOKill()`, then `transform.DOMove(_backPosition, 0.75)`.

CharmDragStatus enum: Normal 0, Wrong 1, Right 2.

## 5. BoxComplete
- An empty `PoolElement` subclass with only a constructor. `GiftBoxDataItem.BoxCompletePrefab` is `[Obsolete, HideInInspector]` and null in every entry. Ignore it.

---

## 6. Implementation checklist
- [ ] Build both carousels at screen init: centre index 2, five preview slots at x = -2000/-1000/0/1000/2000 with scale 0/0.7/1/0.7/0, extra items at scale 0. Tweens are 0.3 s move+scale; buttons are hidden during each move, then the right button appears (owned/free → BtnNext, Coin → coin button with price, Ads → ad button).
- [ ] Left button rotates the list right (previous item), right button rotates it left (next item); both play the click sound and wrap around.
- [ ] Box name text shows on tween complete. Card carousel moves preview the card on the box (fade 0→1 in 0.2 s, scale 1.3→1 in 0.3 s OutBack).
- [ ] Coin unlock: Money < Price → NotEnoughMoney popup. Otherwise add Id to OwnedGiftBox/OwnedCard, play sfx_purchase_coin, Money -= Price, proceed. Ad unlock: grant ownership, proceed.
- [ ] Price stored for results: Coin ? Price : 100 (box and card separately).
- [ ] SetBoxVisual: body/front/lid sprites, plus the box's collider polygon (square/hexagon/circle) at Box local (0,0) as the containment area.
- [ ] Charms spawn at random positions in x∈[-3.07,3.10], y∈[-6.40,-4.18], z 0, sorting 3.
- [ ] Drag: ignore pointer-over-UI; pick a charm under the pointer (Charmremove sound, vibrate, scale 1.1, sort 6); follow with offset; tint green (0.647,1,0.647) when the pivot is inside the polygon, red (1,0.647,0.647) when outside.
- [ ] Release: tint white, scale back to 1 then sort 3. Inside → mark placed, sc_DatDay, vibrate, compliment (random of 4 with its own sound, at x∈[-3.75,3.77], y∈[6.2,11]). Outside → mark not placed, tween to spawn point over 0.75 s.
- [ ] When all charms are placed: block input, disable dragging, tray localY → -20 over 1 s InBack, then show the card step.
- [ ] OpenLid / CloseLid / PrepareFinalBox timelines exactly as in section 3. CloseLid reparents the charm holder to Box first.
- [ ] Card Id 3 has a null sprite; decide how to render it.

---
# PART E
# Lucky Scoop – END of mode (DoneBoxCharmPopup → GiveBoxToCharacter → CompletedPopup → Home)

## Flow summary
1. `ScoopGameController.OnDoneSelectCardStep` → `PutCharmToBox.CloseLid` → its callback hides ScreenInGame and `UIManager.ShowPopup<DoneBoxCharmPopup>()` (covered in another part).
2. **DoneBoxCharmPopup** shows "Completed!" with confetti + rotating/scaling yellow particles and a pulsing **Delivery** button. A black world-space overlay `BG_black` fades to 0.95 alpha and a glow `BG_black/FxHolder` pops in.
3. Tap **Delivery** → "Delivering..." full-screen layer (`DeliveryBG`) fades in, a penguin courier spine (`Scoop_Penguin` / anim `Penguin_Delivery`) slides in from the left, waits, slides out to the right. At t=2.7s the layer fades out; on that fade's **start**, `BackContent` is hidden and `ScreenInGame.OnSetupGiftBoxDone()` → `ScoopGameController.GotoDelivery()`; on its **complete** the popup closes.
4. **GotoDelivery**: `PutCharmToBox.PrepareFinalBox()` (real decorated box `PutCharmToBox/BoxHolder/Box` is re-parented under `GiveBoxToCharacter/Gift`, localScale 0.8, localPosition 0, its SortingGroup enabled) → `PutCharmToBox` GO off → `GiveBoxToCharacter` GO on → `Main Camera`'s Physics2DRaycaster disabled.
5. **GiveBoxToCharacter**: Jelly character (random skin) idles; player drags the gift up into the drop rectangle. Wrong place → gift snaps back. Right place → box snaps to `DropRightPos`, shrinks to 0.5, character plays a random *happy* anim, then idle; 1 s later CompletedPopup opens.
6. **CompletedPopup**: Earnings / Tips texts, customer avatar, compliment (positive if the order item was obtained, else negative), image of the box (RawImage from RenderCam). Buttons: **x2 Reward** (rewarded ad → income + 2×tip) or **No thanks** (income + tip). Coins fly to the money bar, Money is added, 4 s later scene transition to **Home**.

There is no "replay" path: both buttons end in `SimpleSceneTransition.FlashIn(GameConfig.HomeScene="Assets/_Game/Scenes/Home.unity", true)` (SceneNames.Home = 1, level1).

---

## ScoopGame.DoneBoxCharmPopup (PopupBase) — `UIManager/[Popup]/DoneBoxCharmPopup`
Fields:
- `_tfBox` → `.../BackContent/Panel/Body/ImgBox` (Img icon_box_1; scene DOTweenAnimation: LocalRotate to z=2°, 1.0s, InOutSine, loops -1 Yoyo, autoplay → gentle wobble)
- `_fxComplete` → `.../BackContent/Panel/ConfettiFullscreen` (inactive in scene; ParticleImage confetti with Left/Right emitters + trails)
- `_backContent` → `.../BackContent` (BG + Panel)
- `_btnDelivery` → `.../BackContent/Panel/DeliveryButton` (Img button_green, text "Delivery"; DOTweenAnimation Scale → 1.025, 0.3s, Ease 18 OutExpo, loops -1 Yoyo)
- `_tfEffect` → `.../BackContent/Panel/Body/Effect` (children: `Scale`, `Scale (1)`, `Scale (2)` = Img fx_particle_yellow, DOTween Scale → 1.2, 0.25s, OutQuad, Yoyo ∞, delays 0 / 0.1 / 0.2; `Rotate`, `Rotate (1)`, `Rotate (2)` = LocalRotate z → -360, Linear, Restart ∞, durations 3.0 / 2.0 / 2.5)
- `_imgDeliveryBG` → `UIManager/[Popup]/DoneBoxCharmPopup/DeliveryBG` (Img BG_loading_repeat-x; full screen "loading" layer, sibling of BackContent)
- `_imgStarList` → 5 × `DeliveryBG/Star/Image..Image (4)` (Img BG_loading_element; DOTween Scale → 1.0, 0.5s, InOutQuad, Yoyo ∞, delays Image 0, (1) 0.4, (2) 0.3, (3) 0.2, (4) 0.1)
- `_txtDelivery` → `DeliveryBG/TxtDelivering` ("Delivering...")
- `_rtMascot` → `DeliveryBG/SkeletonGraphic (hamster_shipber)` — despite the name it is a SkeletonGraphic of **Scoop_Penguin** (sharedassets4:48), skin `default`, anim **`Penguin_Delivery` loop**, timeScale 1. RectTransform anchors (0.5,1), anchoredPos (-1000,-827), size 508×432, pivot (0.548,0.0095).
- `_2dBg` → `BG_black#SR` (world sprite Square 25×30, color (0,0,0,**0**), order 0, SortingGroup)
- `_tfGlow` → `BG_black/FxHolder` (pos (0,2); child `fx_glow_blue` SR fx_glow_yellow: DOTween Scale → 1.1, 0.5s, InOutQuad, Yoyo ∞; its child `fx_rotation`: Rotate to z=-35°, 1.0s, delay 0.2, InOutSine, Yoyo ∞)
- `_boxComplete` (runtime, BoxComplete) — only used by `SetBox`, which is **never called** in the game (dead code). Ignore.

### OnInit(uiManager)
- base.OnInit; `_btnDelivery.onClick += OnBtnDeliveryClick`.
- Instant reset: `_imgDeliveryBG` alpha 0 (DOFade(0,0)), `_txtDelivery` alpha 0, `_rtMascot.anchoredPosition.x = -1000` (DOAnchorPosX(-1000, 0)), `_tfEffect.localScale = (0,0,0)`.
- NOTE: star images are NOT reset here — their alpha must start at 0 in the prefab (inferred; they are faded 0→1 later). Treat them as alpha 0 initially.

### OnShow()
- base.OnShow; `_fxComplete.SetActive(true)` (confetti burst), `_backContent.SetActive(true)`.
- `PlaySound(ESound.jelly_end_jelly = 11)`.
- `_tfEffect.DOKill(); _tfEffect.localScale = 0; _tfEffect.DOScale(1, 0.5).SetEase(OutBack)`.
- `_2dBg.DOFade(0.95, 0.2)` (Linear/default ease) — black overlay behind the popup.
- `_tfGlow.DOScale(1, 0.5).SetEase(OutBack)` (start scale = whatever it is in scene; scene default 1 → set it to 0 on enter for the pop effect, inferred).
- (analytics skipped)

### OnHide()
- base.OnHide; `_fxComplete.SetActive(false)`.

### OnBtnDeliveryClick()
All tweens start at the same moment (t=0):
- `PlaySound(click = 1)`; (ShowMREC ad – skip)
- `_btnDelivery.gameObject.SetActive(false)`.
- Fade IN: `_imgDeliveryBG.DOFade(1, 0.3)`; each star `DOFade(1, 0.3)`; `_txtDelivery.DOFade(1, 0.3)`.
- Mascot: `_rtMascot.DOAnchorPosX(0, 1.0).SetEase(Linear)`; and in parallel `_rtMascot.DOAnchorPosX(1000, 1.0).SetDelay(2.0).SetEase(InBack (26))` → enters 0–1s, idles 1–2s, exits right 2–3s.
- `PlaySound(sc_Delivery = 25)`.
- `_2dBg.DOFade(0, 0.3)`; `_tfGlow.DOScale(0, 0.3)`.
- Fade OUT (delay 2.7): `_imgDeliveryBG.DOFade(0, 0.3).SetDelay(2.7)`; each star `DOFade(0, 0.3).SetDelay(2.7)`; `_txtDelivery.DOFade(0, 0.3).SetDelay(2.7).OnStart(b__16_2).OnComplete(b__16_3)`.
- `b__16_2` (t=2.7): `_backContent.SetActive(false)`; (HideMREC) ; `UIManager.GetScreen<ScreenInGame>().OnSetupGiftBoxDone()` → `ScoopGameController.GotoDelivery()`. So the gift scene appears underneath while the loading layer fades out.
- `b__16_3` (t=3.0): virtual PopupBase method at vtable 0x198 → close this popup (`Hide()`, inferred).

---

## ScoopGameController.GotoDelivery() / ShowEndGame()
```
GotoDelivery():
  _putCharmToBox.PrepareFinalBox()     // Box -> parent GiveBoxToCharacter/Gift, localScale=(0.8,0.8,0.8), localPosition=0, boxSortingGroup.enabled=true
  _putCharmToBox.gameObject.SetActive(false)
  _giveBoxToCharacter.gameObject.SetActive(true)   // triggers GiveBoxToCharacter.OnEnable
  _physics2DRaycaster.enabled = false               // Main Camera; UI raycasts only from now on
  (analytics)
ShowEndGame(): empty (ret).
```
`GiveBoxToCharacter.Init(controller)` is inlined in `ScoopGameController.Start` (`_giveBoxToCharacter._scoopGameController = this`).
`OnSelectGiftBox(sprite)` (earlier step) → `GiveBoxToCharacter.SetGiftBox(sprite)` + `SetSkinCharacter()`.

---

## ScoopGame.GiveBoxToCharacter — root GO `GiveBoxToCharacter` (inactive in scene, world space)
Scene (local positions, world units):
```
-GiveBoxToCharacter (0,0)
  BG Delivery (0,0) SR BG_complete o1
  Spine GameObject (Jelly_Character) (0,0.94)  SkeletonAnimation(Jelly_Character, initial skin "Lily", no start anim) + MotionStateMachine + SpineAnimationHandler, MeshRenderer order 2
    Pointer (-0.11,3.63)          = _tfCharacter (tutorial hand target)
  DropTopRight (5,10)             = _tfCheckTopRight
  DropBottomLeft (-5,-1)          = _tfCheckBottomLeft
  DropRightPos (-3.6,3.54)        = _tfRightPos (where the gift snaps on success)
  BackPos (0,-7.8)                = _tfBackPos (snap back target)
  Gift (0,-9) SR icon_box_1 o3, color alpha 0   = _gift(GiftDraggable) / _srGift / _tfBox
  hand_L (-3.6,-12.1) SR peguin_hand_L o2      (static decoration, no code)
  hand_R (3.6,-12.1)  SR peguin_hand_R o2      (static decoration, no code)
  Tutorial (0,0)
    HandStart (2.68,-5.76)        = _tfHandAppear
    hand (1) (0,-9) scale 1.5 SR hand_tap o6 alpha 0     = _tfHand / _srHand
      Gift (1) (0,0) scale 0.6667 SR icon_box_1 o4 alpha 0 = _srBoxDemo
```
`_boxScale` → `PutCharmToBox/BoxHolder/Box` (the real decorated box, re-parented under Gift by PrepareFinalBox, so it is what the player sees/drags; `_srGift` stays alpha 0 – only a placeholder).
`_characterEndgame` → MotionStateMachine on the Jelly_Character. `_characterSkinName` = ["noel_1","thanksgiving","Lily","skin_haloween1","skin_2"].
Runtime: `_dragOffset` Vector2, `_isDragging`, `_allowDrag`, `_scoopGameController`, `_sequenceTutorial`.
`GiftDraggable` is an empty MonoBehaviour (marker only).

### SetGiftBox(sprite)
`_srGift.sprite = sprite; _srBoxDemo.sprite = sprite` (tutorial demo box shows the chosen box).

### SetSkinCharacter()
```
mainSkin = GameSession.Instance._mainCharacter.GetComponentInChildren<SkeletonAnimation>() string field @0x28  (inferred: the home main character's current skin name)
skel = _characterEndgame._animator.GetComponent<SkeletonAnimation>()
do skin = _characterSkinName[Random.Range(0, count)] while (skin == mainSkin)
skel.Skeleton.SetSkin(skin); skel.Skeleton.SetSlotsToSetupPose(); skel.AnimationState.Apply(skel.Skeleton)
```
→ customer is a random one of the 5 skins, different from the player's own character skin.

### OnEnable()
```
_characterEndgame.ChangeState(IdleState, loop=true)     // anim "idle"
_allowDrag = true
if (!PlayerPrefs.HasKey("tutorial_gift_box")) { ShowTutorial(); PlayerPrefs.SetInt("tutorial_gift_box", 1) }
```

### ShowTutorial() (first time only)
```
_sequenceTutorial = DOTween.Sequence()
_srHand.DOKill(); _srHand alpha = 0 (DOFade(0,0)); _tfHand.position = _tfHandAppear.position
seq.Append(_srHand.DOFade(1, 0.3))
seq.Append(_tfHand.DOMove(_tfHandAppear.position, 0))
seq.Append(_tfHand.DOMove(_tfBox.position, 0.3))           // hand goes to the gift
seq.Append(_srBoxDemo.DOFade(0.7, 0.3))                     // ghost box appears in the hand
seq.Append(_tfHand.DOMove(_tfCharacter.position, 1.0).SetEase(Linear))   // drag to character's Pointer
seq.Append(_srHand.DOFade(0, 0.3)); seq.Join(_srBoxDemo.DOFade(0, 0.3))
seq.AppendInterval(0.3)
seq.SetLoops(-1, Restart)
```
(Loop length 3.3 s.) Default ease of DOMove/DOFade = DOTween default (OutQuad) except the one marked Linear.

### HideTutorial()
`_sequenceTutorial.Kill(); _srHand.DOKill(); _srHand alpha=0; _srBoxDemo.DOKill(); _srBoxDemo alpha=0.`

### Update()
```
if (Touch.IsPointerOverUIObject()) return
if (!_allowDrag) return
if (pointer pressed this frame):            // InputSystem Pointer.current.press.wasPressedThisFrame
    PlaySound(Charmremove = 16); Vibrate(60ms, amplitude -1)
    HideTutorial()
    w = Camera.main.ScreenToWorldPoint(pointer.position)   // z = 0
    _dragOffset = gift.position.xy - w.xy
    _isDragging = true
if (pointer released this frame): _isDragging = false; CheckOnRightPos()
if (_isDragging) DragGift()
```
Note: no hit-test on the gift — a press anywhere on the screen (not over UI) picks up the gift with an offset.

### DragGift()
`w = Camera.main.ScreenToWorldPoint(pointer.position); gift.position = (w.x + _dragOffset.x, w.y + _dragOffset.y, 0)`.

### CheckOnRightPos()
```
p = gift.position
inside = p.x <= TopRight.x && p.x >= BottomLeft.x && p.y <= TopRight.y && p.y >= BottomLeft.y
         // world rect x∈[-5,5], y∈[-1,10]
if (!inside):
    _allowDrag = false
    gift.DOMove(_tfBackPos.position, 0.1).OnComplete(() => _allowDrag = true)   // (0,-7.8); default ease
    // (note: snaps to BackPos (y -7.8), not the initial y -9)
else:
    _allowDrag = false                              // permanently
    gift.position = _tfRightPos.position            // instant (-3.6,3.54) — box lands in the character's hand
    _boxScale.localScale = (0.5,0.5,0.5)            // decorated box shrinks
    CharacterReceiveGift()
    PlaySound(sc_Get1More = 24)
    Vibrate(60ms, -1)
```

### CharacterReceiveGift()
```
Vibrate(60, -1); PlaySound(sc_happy = 23)
_characterEndgame.ChangeState(HappyState, loop=false, onStart=null, onComplete=b__24_0)
b__24_0: _characterEndgame.ChangeState(IdleState, loop=true)
         DOVirtual.DelayedCall(1.0, b__24_1, ignoreTimeScale=true)
b__24_1: _scoopGameController.ShowEndGame()      // empty
         UIManager.ShowPopup<CompletedPopup>().SetMoneyResult(controller.GetIncome(), controller.GetTip())
```
So CompletedPopup appears 1 s after the happy animation finishes (happy anims are 1.333 s → ≈2.33 s after drop).

### Character.MotionStateMachine (state → Jelly_Character anim, EAnimationSpineType)
- IdleState = `idle` (4 s) · WaitState = `ready_to_eat` · DrinkState = `drink` · SpicyState = `spicy` · SurpriseState = `suprise` · SourState = `sour` · CoolState = `cold`
- HappyState (RandomAnimationState) = random of [`happy`,`happy2`,`happy3`,`happy4`] (each 1.333 s)
- CuteState = random of [`cute`,`cute2`,`cute3`,`cute4`]; EatFoodState = random of eat list (`eat`…`eat10`)
- `ChangeState(state, loop)`: exit current, enter new (plays anim on track 0 with loop flag). `ChangeState(state, loop, onStart, onComplete)`: same, with onStart at start and onComplete when the (non-looping) anim completes; a newer ChangeState cancels the pending onComplete (CancellationTokenSource).
- Spine mix 0.2 s (skeleton data default mix). Only idle + happy* are used in this mode.
- Jelly_Character skins available: default, char_default, char_default2, char_gugugaga, clicker_01, clicker_02, Lily, Mira, noel_1, noel_2, Rumi, skin_1, skin_2, skin_default, skin_haloween1, thanksgiving, Zoey.

---

## ScoopGame.CompletedPopup (PopupBase) — `UIManager/[Popup]/CompletedPopup`
Fields:
- `_adsButton` → `Panel/AdButton` (Img button_green; child `Scaler` has DOTweenAnimation Scale → 1.05, 0.5s, InOutSine, Yoyo ∞; texts `AdsImage` ic_ads + `MoneyAdText` "x2 Reward" (static, never set by code although `_adsMoneyText` points to it))
- `_rewardButton` → `Panel/RewardButton (No thanks)` (Img button_normal, text "No thanks")
- `_imgCustomer` → `Panel/Compliment/Avatar` (Img viewer_3 default)
- `_incomeMoneyText` → `Panel/RewardInfo/TxtEarnings` ; `_tipMoneyText` → `Panel/RewardInfo/TxtTips` (labels "Earnings:" / "Tips:", each followed by ic_coin_full)
- `_rewardImage` → `Panel/Body/ImagePanel/Mask/RawImage` — texture sharedassets3:49 = RenderTexture fed by camera `GameHandle/RenderCam` (pos (-2.67,2.5,-10), ortho size 9, culling mask 471). It shows the live render of the game world (the character holding the box). In the port: render the GiveBoxToCharacter world view (centered (-2.67,2.5), ortho half-height 9) into this rect (inferred). Sibling `Mask/Image` = complete_peguin overlay frame.
- `_positiveCommentAsset` = CommentAsset_PositiveCompliment (sharedassets6:166), `_negativeCommentAsset` = CommentAsset_NegativeCompliment (165) — 10 lines each (see so.json `ChatContents`), e.g. "Wow, this is exactly what I was looking for!" / "Wait, I don't think this is what I ordered."
- `_txtCompliment` → `Panel/Compliment/Message`
- `_income` (0x88), `_tip` (0x8c).

### OnInit
`_adsButton.onClick += OnAdsButtonClicked; _rewardButton.onClick += OnRewardButtonClicked`.

### SetMoneyResult(income, tip)  (called right after ShowPopup, i.e. after OnShow)
`_income = income; _tip = tip; _incomeMoneyText.text = income.ToString(); _tipMoneyText.text = tip.ToString()` (plain number, no "+"; scene placeholder is "+500").
Values: income = data_config_type==1 ? openedItems.Count*100 : **300**; tip = HasOrderItem ? (data_config_type==1 ? 300 : **200**) : **0**.

### OnShow()
```
MoneyManager(singleton, inferred).gameObject.GetComponent<RectTransform>()?.DOAnchorPosX(-170, 0)   // money bar `UIManager/[Popup]/Money` placed at x=-170 instantly (inferred owner)
UpdateResult()
ProfileManager.Instance.ObtainExperiencePoint()     // profile XP +1 step (profile system, see other docs)
if (GameSession.Instance.OrderAvatar != null) _imgCustomer.sprite = GameSession.OrderAvatar
base.OnShow()
PlaySound(jelly_endgame_sound = 9)
SetInteractButtons(true)
StartAdsButtonAnim()
DataSaveUser.ScoopPlayTime += 1 ; DataSaveUser.Save()     // GetData<DataSaveUser>() + virtual save
(analytics)
```

### UpdateResult()
`_txtCompliment.text = (ScoopDataHolding.HasOrderItem() ? positive : negative).PickRandomLiveComment()` — random line from ChatContents, localized.
`HasOrderItem() = ScoopDataHolding._openedItems.Contains(GameSession.ScoopOrderId)` — i.e. did the player get (open) the charm the customer ordered (ScoopOrderId is set by the Home order flow before entering the mode).

### StartAdsButtonAnim()
`_adsButton.transform.DOKill(); _adsButton.transform.DOScale((1.1,1.1,1.1), 0.5).SetLoops(-1, Yoyo).SetDelay(2.0).SetEase(InOutSine)` (stacked on top of the Scaler child's own 1.05 pulse).
### StopAdsButtonAnim()
`if (_adsButton) _adsButton.transform.DOKill(); _adsButton.transform.localScale = (1,1,1)`.
### SetInteractButtons(b)
`_adsButton.interactable = b; _rewardButton.interactable = b`.

### OnAdsButtonClicked()  ("x2 Reward")
```
PlaySound(click = 1); Haptic(LightImpact = 4)
SetInteractButtons(false)
rewarded ad -> then OnRewardMoney(_income + _tip * 2, showInter=false)   // ONLY the tip is doubled
```
(If the ad fails the original keeps buttons disabled — for the port, treat it as always succeeding.)

### OnRewardButtonClicked()  ("No thanks")
```
PlaySound(click = 1); Haptic(LightImpact = 4)
(interstitial ad, callback empty – skip)
SetInteractButtons(false)
OnRewardMoney(_income + _tip, showInter=true)
```

### OnRewardMoney(money, showInter)
```
StopAdsButtonAnim()
MoneyManager.Instance.CollectMoney(money, coinObjAmount = 10, onCompleted = null)
HandleAfterRewardMoney(false)
```
MoneyManager.CollectMoney: re-parents the money bar to the front, `CollectingCoin.CollectCoins(10 coins)` (coins spawn at `Money/SpawnPos`/random offsets and fly to the money icon, shared component documented with the other modes); when coins are collected → `MoneyManager.UpdateMoney(money)` (adds `money` to DataSaveUser.Money, saves, counts the label up) and after `DOVirtual.DelayedCall(2.0)` the money bar returns to its default parent.

### HandleAfterRewardMoney(showInter) (async)
```
DataManager.GetData<...>().Save()          // save again
await UniTask.WaitForSeconds(4.0)
GameSession.IsPlayAGame = true
(analytics: GameModeStepComplete / GameModeComplete)
GameSession.BackFromGameMode = GameModeEnum.Scoop (3)   // Home uses it to play a "back from mode" animation
SimpleSceneTransition.FlashIn(GameConfig.HomeScene /* "Assets/_Game/Scenes/Home.unity" */, true)
```
`showInter` is unused.

### OnDestroy: `_adsButton.transform.DOKill()`. OnHide: base only.

---

## Saved data / persistence (end of mode)
| When | What |
|---|---|
| GiveBoxToCharacter.OnEnable, first time | PlayerPrefs `tutorial_gift_box` = 1 |
| CompletedPopup.OnShow | DataSaveUser.ScoopPlayTime += 1, save |
| CompletedPopup.OnShow | ProfileManager.ObtainExperiencePoint() |
| coin fly complete (MoneyManager.UpdateMoney) | DataSaveUser.Money += income + tip (or income + 2·tip) |
| HandleAfterRewardMoney | save; GameSession.IsPlayAGame = true; BackFromGameMode = Scoop(3) |
Nothing else (no item/box saving here).

## Sounds / haptics used
- jelly_end_jelly (11): DoneBoxCharmPopup show
- click (1): Delivery button, x2 button, No thanks button
- sc_Delivery (25): Delivery start
- Charmremove (16) + Vibrate 60ms: gift picked up
- sc_Get1More (24) + Vibrate 60ms: gift dropped in zone; sc_happy (23) + Vibrate 60ms: character receives
- jelly_endgame_sound (9): CompletedPopup show
- Haptic LightImpact (4): CompletedPopup buttons

## Tutorial
- Only the gift-give tutorial (`tutorial_gift_box` PlayerPrefs): looping hand Sequence (above), killed on first press anywhere.

## Implementation checklist
- [ ] DoneBoxCharmPopup: init alpha 0 for DeliveryBG/stars/text, mascot x=-1000, Effect scale 0; OnShow confetti on, sfx 11, Effect 0→1 OutBack 0.5, BG_black alpha →0.95 in 0.2, glow scale →1 OutBack 0.5; scene loop tweens (ImgBox wobble, Effect scale/rotate, Delivery pulse, star pulses, glow scale/rotate).
- [ ] Delivery click: sfx 1 + 25, hide button, fade in 0.3, penguin `Penguin_Delivery` X -1000→0 (1s Linear) then →1000 (delay 2, 1s InBack), BG_black→0 & glow→0 in 0.3, fade out at 2.7 (0.3): on start hide BackContent + GotoDelivery, on complete close popup.
- [ ] GotoDelivery: reparent decorated box under Gift (scale 0.8, pos 0), hide PutCharmToBox, show GiveBoxToCharacter, disable world raycasts.
- [ ] Character: random skin from 5 (≠ player skin), idle loop; tutorial once.
- [ ] Drag: press anywhere (not on UI) grabs the gift with offset; release: inside x∈[-5,5] y∈[-1,10] → snap to (-3.6,3.54), box scale 0.5, happy random (no loop) → idle, +1s CompletedPopup; outside → DOMove to (0,-7.8) 0.1s, then drag allowed again.
- [ ] CompletedPopup: texts income/tip, avatar = order avatar, compliment positive iff ordered charm was opened, RawImage = render of world at RenderCam view, sfx 9, ScoopPlayTime++ save, x2 button pulse 1.1 (delay 2, 0.5 InOutSine Yoyo).
- [ ] Buttons: x2 → income+2·tip ; No thanks → income+tip; disable both, coin fly (10 coins) → Money += amount; after 4 s → BackFromGameMode=Scoop, load Home.
