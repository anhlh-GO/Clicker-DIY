# Blind Bag Shopping minigame (scene level3 `BlindbagMinigame`): implementation spec

Sources: `dis/Blindbag.*.s`, `dis/Jelly.ItemAnimator.s`, `dis/Supermarket.*.s`, `dis/ScoopGame.Blindbag*Asset.s`, `dump/level3.txt`,
`out/data/level3.json`, `out/data/so.json`, `out/data/sharedassets3.assets.json`. "(inferred)" means the value is a guess.
In this spec, "Linear", "OutQuad" and the other ease names are DOTween ease names. ESound ids come from `enums.json`.

---------------------------------------------------------------------------------------------------------------------
## 1. Overview and flow

The scene is a supermarket. The player taps shelf slots to put **blind bags** into a 5-slot cart, confirms the order, then drags each bag onto a
barcode scanner at the checkout (a penguin cashier). Each scan adds a line to the on-screen bill. When every bag is scanned, the total
is **deducted from coins**. The scene then flashes to scene **level4 `BlindBagCollection`**, where the bags are opened. **This scene does not open any bags.**
It only stores the bought bag ids in `BlindbagCollectionController.bagIdList`, a static list read by level4.

```
Home (PopupIntroBlindbag play) ─► level3 load
  Awake: Initialized()  → shelf items init, ScanMachine hidden, Door.Hide(0) (doors closed)
  Start: FadeOut transition, show DoorScreen ("Tap to open", music bgm_ingame_1), Door GO active
  [tap anywhere] → Door.Open(1s) (sound SPMK_Open_door_SPMK) → onComplete:
        hide DoorScreen, show StoreScreen, enable shelf input, tutorial hand on shelf (first time)
  SHOPPING: tap shelf slot → bag flies into cart (max 5, money check); tap cart → removes last bag
        counter "n/5", Total price, ✓ Confirm button enabled when n>0
  [✓ Confirm] → bottom panel hidden, StoreAndTable slides X -30 (1s) to the checkout table
        → bags jump from cart onto the counter, cart slides down & hides, tutorial hand on scanner (first time)
  CHECKOUT: drag each bag onto the scanner → scan-line sweep → bill line "<Name> xN  price", total updates
        → bag slides out right (+10) and is destroyed
  last bag scanned → ScanMachine.OnBuyCompleted (Thanks heart + shopping bag pop, penguin "happy_idle",
        ids pushed to BlindbagCollectionController.bagIdList)
        → coins -= total, sound sfx_purchase_coin, wait 2 s, hide scan machine + StoreScreen,
        → SimpleSceneTransition.FlashIn(GameConfig.BlindbagCollection = 'Assets/_Game/Scenes/BlindBagCollection.unity')
  Exit at any time: Home button (top-left CloseButton) → inter ad (treat as nothing) → BackHomePopup ("Quit game /
        Progress will be lost") → Confirm → back to Home (FlashIn, inferred Home scene). Nothing was paid yet.
```

The `CompletedPopup` in the scene (Reward / Income / Tip / x2 Tips / No, thanks) has **no caller** in the blind-bag code. It is a
leftover copy of the Scoop result popup and never shows in this flow. Section 2.14 documents it anyway. `OrderingFood` and the
`Supermarket.*` classes are also leftovers. `PopupWowBlindbag` is used by level4 only.

---------------------------------------------------------------------------------------------------------------------
## 2. Classes

### 2.1 Scene layout (paths used below)
```
BlindbagController                       [BlindbagGameController, InputHandler]
  Scaler
    -Door (SortingGroup o20)             [Door]   left-door / right-door (transition_door) / Roof (0,8) (transition_roof_repeat-x)
         left-door/transition_open: DOTweenAnimation LocalRotate to (0,0,6) 1s InOutSine loop -1 Yoyo (autoplay)
    Basket (0,-6.3) BoxCollider2D 5.71x3.41 [Basket]
      basket [Jelly.ItemAnimator]  basket-back (cart_back o7) / basket-front (cart_front o13)
        points: 5 × "point" (SortingGroup o11): (-1.45,0.72 rot -4.33) (-0.67,0.51 rot -14.9) (0.09,0.22 rot 10.63)
                                                (1.13,0.61) (1.76,0.24 rot -7.82)       (in _point list order)
    StoreAndTable (0,0)                  (_tfShopAndTable)
      Store
        Scaler  [AxisDrag2D axis=Horizontal minValue=-4.5 maxValue=0, BoxCollider2D trigger 14.9x12.8]   ← shelf pan
          BG (37.66,0) BG_supermarket_scale + elements
          Items (0.70,1.61)              (_itemContainer)
            "item base id N" ×12 [ItemBase, BoxCollider2D 2.227x1.676 off(0.157,-0.079)]
               columns x = -1.92, 0.90, 3.69, 6.47 ; rows y = 1.77, -0.81, -3.37 ; id = col*3+row
               scaler (0.38,-0.19) scale 0.6 SortingGroup → 6 × Spine "blind_bag" (scale 0.4, sorting o1..o6) = _orderItems
               Canvas → BG(box_price) Coin(ic_coin_full) PriceText (set to price)
            -TutorialTouchBag (-1.59,-1.17) handtap o15: DOTweenAnimation LocalMove→(-0.65,-1.55) 1s OutSine loop -1 Yoyo
          Store (0.70,1.61)              (_storeGo)  shelf-bakery [Supermarket.Shelf] + 3 shelf fronts
      Table: table_slicing, Spine penguin_blind_bag (27.84,0.26) (_pinginCashier), -"turorial scan" (scan_area, unused),
             shoping_bag (30,-1) (_outroBag), -TutorialScanItem (29.84,-2.88) handtap: LocalMove→(29.84,1.75) 1s InOutSine Yoyo -1
      ScanMachine (30,-1.2) [ScanMachine]
         pay-machine (monitor), Canvas/Bill (TxtBill 'CHECKOUT', Scroll View/Viewport/Content = _billContainer (VerticalLayout spacing -47.4),
         TotalLine/Price = _totalText), -Intro ('Scan the barcode', DOTweenAnimation Scale→1.1 0.75s InOutQuad Yoyo -1),
         -Thanks (Heart = _outroHeart), scanPos (-0.26,2.98)/scan-line (_scanLineTf), BottomLeft (-3.51,-2.06), TopRight (3.10,0.02),
         Container (0,-4.26) SortingGroup o5 (_containerBag)
  Tutorial [TutorialBlindBag]
UIManager (Canvas 1080x1920)
  StoreScreen [StoreScreen]: SafeArea/CloseButton(button_home), -BuyButton(button_done, MarketButton, unused),
       BottomPanel/{ItemCounter(CounterText '0/5'), TotalPrice(PriceText '0'), ConfirmButton(button_v / off button_v_disabled)},
       Money (MoneyManager), CartFullNoti ('Cart is full !!!', CanvasGroup a=0) [NotiCanvas], BlockScreen (transparent blocker)
  DoorScreen [DoorScreen]: OpenDoorButton (full-screen transparent Button), TxtTitle 'Tap to open' (Scale→1.1 0.75s InOutQuad Yoyo -1)
  CompletedPopup (unused), BackHomePopup (Clicker.BackHomePopup), NotEnoughMoneyPopup ('Not enough coin', '+1000' ad button), PopupNoInternet
```
Prefabs (sharedassets3): `_orderBagPrefab` = `BlineBagAnimation` [BlindBagAnimation], child `Spine2D` (0,-0.9) scale 0.3, skin 'adventure'.
`_billLinePrefab` = `BillLineBlindbag` [BillLine] (Icon, SkeletonGraphic blind_bag, Price, Name).

Spine `blind_bag` skins (one per shelf slot id, matching `ConfigBlindBagVisual.SkinName`): 0 nature, 1 sweet, 2 animal, 3 ocean,
4 space, 5 adventure, 6 fashion, 7 fast_food, 8 fruit, 9 gadget, 10 kawaii, 11 kitchen. All 6 bags in one slot share that skin.
No animation is played on the bags (anim null, so they stay in setup pose).

### 2.2 BlindbagGameController (on `BlindbagController`)
Fields: `_inputHandler` (self), `_itemContainer` = Items, `_storeGo` = Store/Scaler/Store (shelves), `_basket`, `_basketCollider` (Basket
BoxCollider2D), `_orderBagPrefab`, `_scanMachine`, `_door`, `_tfShopAndTable` = StoreAndTable, `_asset` = ConfigBlindbagMarket, `UIManager`.
- **OnEnable/OnDisable**: `_inputHandler.OnClickedAction += / -= OnClickedHandler`.
- **Awake → Initialized()**:
  `foreach ItemBase in _itemContainer.GetComponentsInChildren<ItemBase>(): item.OnInit(this)`; `_basket._controller = this`;
  `_scanMachine.OnInitialized(this)`; `_scanMachine.SetActive(false)`; `_storeGo.SetActive(true)`; `_basket.gameObject.SetActive(true)`;
  `_door.Hide(0)`.
- **Start**: `SimpleSceneTransition.FadeOut()`; `UIManager.ShowScreen<DoorScreen>().OnOpenDoorAction += OnOpenDoorHandler`;
  `GameSession.CharacterContainer.transform.localY = -0.38`; `GameSession.SetActiveCharacter(false)` (hides the shared avatar);
  `_door.gameObject.SetActive(true)`.
- **OnOpenDoorHandler**: `_door.Open(1.0, onCompleted)`. onCompleted:
  `HideScreen<DoorScreen>()`; `s = ShowScreen<StoreScreen>()`; `s.OnOrderButtonClicked += OrderItemsHandler`;
  `s.OnBuyButtonClicked += BuyItemsCompletedHandler`; `_tfShopAndTable.SetActive(true)`; `_door.gameObject.SetActive(false)`;
  `_inputHandler._draggable = true`; `TutorialBlindBag.ShowTutorialClickBagOnShelf(true)`.
- **OnClickedHandler** (a tap from InputHandler): `world = Camera.main.ScreenToWorldPoint(Pointer.current.position)`;
  `hit = Physics2D.Raycast(world, Vector2.zero, 100)`. If hit.collider exists and has an `IClickable`, call `clickable.OnMouseButtonDown()`.
  Clickables in shopping are `ItemBase` (shelf slots) and `Basket`.
- **FullBasketTrigger**: `GetScreen<StoreScreen>().ShowCartFullNotification(1.0)`.
- **UpdateBasket**: `n = basket.GetTotalItem()` (Placed only), `p = basket.GetTotalPrice()`;
  `StoreScreen.SetItemCounter(n)` sets the text to `n + "/5"`. `StoreScreen.SetPrice(p)`. `StoreScreen._confirmOrderButton.EnableState(n > 0)`.
- **EnableConfirmOrderButton(b)**: `StoreScreen._confirmOrderButton.EnableState(b)`.
- **OrderItemsHandler** (✓ pressed):
  `StoreScreen._blockScreen.SetActive(true)`; `_basketCollider.enabled = false`; `_scanMachine.SetActive(true)` (shows the Intro text);
  `_tfShopAndTable.DOLocalMoveX(-30, 1.0).SetEase(Linear).OnComplete(A)`.
  A: `Tutorial.ShowTutorialScanItem(true)`; `_itemContainer.gameObject.SetActive(false)`; `_storeGo.SetActive(false)`;
  `_scanMachine.SetData(_basket.GetOrderingBags())`; `StoreScreen._blockScreen.SetActive(false)`;
  `_basket.transform.DOLocalMoveY(-12.5, 1.0).OnComplete(() => _basket.gameObject.SetActive(false))` (default ease).
- **OrderingCompletedHandler** (called by ScanMachine when the last bag is scanned): `_scanMachine.OnBuyCompleted()` then `BuyItemsCompletedHandler()`.
- **BuyItemsCompletedHandler** (async):
  `MoneyManager.UpdateMoney(-basket.GetTotalPrice())`. This is the only coin change, and it is saved through DataUser.Money.
  `PlaySound(sfx_purchase_coin 47)`. `await WaitForSeconds(2.0)`. `_scanMachine.SetActive(false)`. `HideScreen<StoreScreen>()`.
  `SimpleSceneTransition.FlashIn(GameConfig.BlindbagCollection)` loads level4. Analytics DevTrack calls are ignored.
  The basket total is still valid at this point, because bags stay Placed in the point data after they are reparented.

### 2.3 InputHandler (on `BlindbagController`) — tap detector
Scene values: `_draggable` false (it is set true after the door opens), `_target` = StoreAndTable/Store, `_minX = _maxX = 0`, `_dragSpeed` 0.5,
`_friction` 0.9. Because min = max = 0, its own panning does nothing. Its real job is to tell a tap from a drag.
- Update (only when `_draggable`):
  - press this frame: `_isOverUi = Touch.IsPointerOverUIObject()`. If over UI, return. Otherwise `_isClicking = true` and `_lastX = pointer.x`.
  - held, clicking and not over UI: if `|pointer.x - _lastX| > 5` px, set `_isDragging = true`. Then `_velocity = dx * _dragSpeed * dt`,
    `_lastX = x`, move the target, and clamp its localX to [min, max].
  - not held: `_velocity *= _friction`, and the velocity is zeroed below 0.01.
  - released this frame and not over UI: if `_isDragging`, set `_isDragging = false`. **Otherwise invoke `OnClickedAction`** (this is the tap).
  - `CheckButtons()` (left/right arrow buttons are unused, because SetButtons is never called).
- MoveLeft/MoveRight (unused): DOLocalMoveX(x ± 10 clamped, 0.5).

### 2.4 AxisDrag2D (on Store/Scaler): horizontal shelf pan
`axis = Horizontal`, `minValue = -4.5`, `maxValue = 0`, cam = Main Camera.
On press (not over UI): the drag starts when `Physics2D.OverlapPoint(worldPointer)` hits this object's collider, and it stores the grab offset.
While dragging, `x = clamp(pointerWorld.x - grabOffset, -4.5, 0)`. On release, `isDragging = false`. (Details inferred, because this class is
outside the area.) A drag longer than 5 px per frame also suppresses the tap through InputHandler.

### 2.5 ItemBase (12 shelf slots) — implements IClickable
Fields: `_id` 0..11, `_priceText`, `_collider`, `_orderItems` (6 shelf Spine bags), `_offSetTouch` (0,-0.5,0), `Controller`, `_data`.
- **OnInit(controller)**: `Controller = c`; `_data = asset.GetData(_id)`; `_priceText.text = _data.Price`.
- **OnMouseButtonDown** (async):
  1. `PlaySound(CharmXucCharm1 17)`.
  2. `selected = GetNearestItemToClick() ?? _orderItems[0]`. The search point is `pointerWorld + _offSetTouch`. The best candidate starts as
     `_orderItems[0]`, even when that bag is inactive. Each later item that is **active** and closer (squared 3D distance) replaces it.
  3. If `basket.IsFull()` (all 5 points are not Free): `Shake(selected)`, then `Controller.FullBasketTrigger()`, then return.
  4. If `_data.Price + basket.GetReviewPrice() > DataUser.GetMoney()` (review price = sum of Moving + Placed bags; equal is allowed):
     `Shake(selected)`, `Vibration.Vibrate(100)`, `UIManager.ShowPopup<NotEnoughMoneyPopup>()`, then return.
  5. `Tutorial.ShowTutorialClickBagOnShelf(false)`; `_isCountdown = true` (never read).
     `point = basket.GetPointData()` gives the first point whose State is Free.
     `bag = CreateItem<BlindBagAnimation>(_orderBagPrefab, point.Point)` (instantiate, parented to the point); `bag.transform.parent = point.Point`;
     `bag.localScale = (1.2, 1.2, 1.2)`; `bag.SetSkinBag(selected)` copies the shelf bag's skin;
     `bag._bagName = Localize(_data.Name)`; `bag._price = _data.Price`; `bag._id = _id`;
     `selected.gameObject.SetActive(false)`; `point.Bag = bag`; `bag.position = selected.position` (world);
     `bag.DOLocalMove(Vector3.zero, 1.0).SetEase(InBack)`; `bag.DOLocalRotate(Vector3.zero, 1.0).SetEase(Linear)`;
     `point.State = Moving`; `Controller.UpdateBasket()`.
  6. `await 1.0 s`, then `point.State = Placed`; `PlaySound(Charmremove 16)`; `Vibrate(60)`; `Controller.UpdateBasket()`.
     Restock: `selected.localScale = 0`, `selected.SetActive(true)`, `selected.DOScale((0.4, 0.4, 0.4), 0.35)`. `await 0.35`. `_isCountdown = false`.
  Stock is infinite. The tapped shelf bag disappears and pops back after 1 s. Taps are not locked, so the player can tap quickly several times.
- **Shake(item)**: `item.eulerAngles = (0,0,-5)`; `item.DORotate((0,0,5), 0.15).SetEase(Linear).SetLoops(4, Yoyo).OnComplete(item.eulerAngles = (0,0,0))`.
  The bag loses its authored tilt afterwards.
- OnMouseButtonDrag / OnMouseButtonUp: empty. `SetEnableBoxCollider(b)` is unused.

### 2.6 Basket (cart) — implements IClickable
`_point` = 5 × PointData {Point transform, State Free/Moving/Placed (0/1/2), Bag}. `_animator` = basket/ItemAnimator.
- `IsFull()` = all points have State ≠ Free. `GetPointData()` = first point with State Free.
- `GetTotalItem()` = number of Placed points. `GetTotalPrice()` = sum of `Bag.Price` over Placed points. `GetReviewPrice()` = the same sum over Moving and Placed points.
- `GetOrderingBags()` = the non-null Bags, in point order.
- **OnMouseButtonDown** (tap on cart): `_animator.ShowUp()`, then `RemoveLastPoint()`.
- **RemoveLastPoint**: `Controller.EnableConfirmOrderButton(false)`. Go through the points from last to first and take the first one with State Placed.
  Set its `State = Moving`, `PlaySound(Charmremove 16)`, and run `Bag.FadeOut(1.0, () => { point.Bag = null; point.State = Free; Controller.UpdateBasket(); })`.
  The faded bag GameObject is not destroyed (inferred: it stays invisible under the point, and the alpha tween ends at 0).
  The ✓ button stays disabled until UpdateBasket runs again. If no point is Placed, nothing happens apart from the ✓ button being disabled.
  **No coins are involved** in removing a bag.

### 2.7 Jelly.ItemAnimator (cart squash)
- `ShowUp()`: `scale = 1`; DOKill; `DOScaleY(0.9, 0.15)`, `DOScaleX(1.1, 0.15)`; `await 0.15`; `DOScale(1, 0.15)`.
- `Shake()`: `cache = localScale`; `DOScaleY(cache.y * 1.2, 0.15)`, `DOScaleX(cache.x * 0.8, 0.15)`; `await 0.15`; `DOScale(cache, 0.15)`. Unused here.

### 2.8 BlindBagAnimation (the bag bought into the cart / dragged at checkout) — IClickable, PoolElement
Fields: `_spineBag` (child Spine2D), `OnScanItem` Action<bag>, `_id`, `_bagName`, `_price`, `_target`, `_cachedEuler/_cachedPosition`,
`_dragSpeed = 20`, `_isTriggered`.
- `SetSkinBag(src)`: `spine.Skeleton.SetSkin(src.Skeleton.Skin)`; `SetSlotsToSetupPose()`; `AnimationState.Apply(skeleton)`.
- `FadeOut(d, cb)`: DOKill the spine, then `FadeOutSpine(d, cb)`, which runs `DOTween.To(() => 1, a => skeleton.color = orig * alpha a, 0, d).OnComplete(cb)`.
- `InitializedBuying(target)`: `localEuler = (0, 0, Random.Range(-70, 70))` (an int from -70 to 69); cache the euler and localPosition; `_target = target`.
- `AddCollider()` adds a collider component (BoxCollider2D, inferred). `RemoveCollider()` destroys it. `OnDespawned` removes the collider and clears OnScanItem.
- OnMouseButtonDown: `localEulerAngles = 0`.
- OnMouseButtonDrag (when not triggered and the target is set): `p = ScreenToWorld(pointer)`, `t = clamp(dt * 20, 0, 1)`; `pos = lerp(pos, p, t)` (z also lerped toward 0).
  If `|pos.x - target.x| < 1.0 && |pos.y - target.y| < 0.5`, then `_isTriggered = true` and `OnScanItem(this)`.
- OnMouseButtonUp: if not triggered, snap back to the cached localEuler and localPosition (instantly, without a tween).

### 2.9 ScanMachine (checkout)
Fields as in 2.1, plus `_bagsDictionary` (name → BillLine), `OrderBags`, `_scanLineDoneTime`.
- `OnInitialized(ctrl)`: cache Camera.main and the controller; new dictionary; `_outroHeart.DOScale(0, 0)`; `_outroBag.DOScale(0, 0)` (both hidden).
- `SetActive(v)`: `gameObject.SetActive(v)`; `_introGo.SetActive(v)`. `OnEnable`: `_draggable = true`.
- **SetData(bags)**: `OrderBags = bags`. For bag index i = 1..n with `d = 0.1 * i` and `delay = 0.2 * i`:
  `bag.DOKill`; `bag.SetParent(_containerBag)` (keeps world position); `bag.DOScale(1.4, 0.5).SetEase(Linear).SetDelay(delay).OnStart(PlaySound(CharmXucCharm1 17))`;
  `target = (Random.Range(BL.x, TR.x), Random.Range(BL.y, TR.y), z = d)` (world, between BottomLeft and TopRight);
  `bag.DOJump(target, jumpPower 1.0, numJumps 1, 0.5).SetDelay(delay).OnComplete(bag.InitializedBuying(_scanPos))`;
  `bag.OnScanItem += OnScanItemHandler`; `bag.AddCollider()`.
- **Update** (unless `_isProgressCompleted`, which is never set; requires `_draggable`). Pointer handling:
  - press, not over UI: `OnMousePressed`, which raycasts at the pointer world position. If the collider has an IClickable, store it, set `_hitItemStatus = true`, and call `OnMouseButtonDown()`. Then `_isDown = true`.
  - held, down and hit: `_clickable.OnMouseButtonDrag()`.
  - released, not over UI and hit: `_isDown = false`; `_clickable.OnMouseButtonUp()`.
- **OnScanItemHandler(bag)**: `_introGo` off, `_billGo` on; `PlaySound(sfx_scan_payment 59)`; `Tutorial.ShowTutorialScanItem(false)`;
  `ScanAnimation(onTrigger, onDone)`.
  - onTrigger: if the dictionary has `bag.BagName`, call `line.UpdatePrice(bag.Price)`. Otherwise `line = Instantiate(_billLinePrefab, _billContainer)`,
    `line.SetData(bag.BagName, bag.Price)`, and add it to the dictionary. Then `UpdateTotalText()` and `Vibrate(50)`.
  - onDone: `_draggable = true`; `bag.DOLocalMoveX(bag.localX + 10, 0.5).OnComplete(bag.DespawnSelf(); CheckOrderingCompleted())`.
    DespawnSelf calls Destroy, because the bag has no pool.
- **ScanAnimation**: `scanLine.localPosition = (0, -0.4, 0)`; `scanLine.localScale = 0.5`; `_scanLineDoneTime = time + 1.0`;
  `scanLine.DOLocalMoveY(0.6, 0.5).SetEase(Linear)`, then `onTrigger()`, then `scanLine.DOLocalMoveY(-0.6, 0.5).SetEase(Linear)`.
  After that: if `time > _scanLineDoneTime`, set `scanLine.localScale = 0`. Then `onDone()`.
- **CheckOrderingCompleted**: if `_containerBag.childCount == 1`, call `controller.OrderingCompletedHandler()`. The destroyed bag is still counted
  this frame, so the check means "the last bag was just scanned". In JS, use the condition "all bags scanned".
- **UpdateTotalText**: `_totalText = Σ line.TotalPrice`.
- **OnBuyCompleted**: `_introGo` off, `_billGo` off, `_outroGo` (Thanks) on;
  `_outroHeart.DOScale(1, 0.5).SetEase(OutBack).SetDelay(0.5)`; `_outroBag.DOScale(1, 0.5).SetEase(OutBack)`;
  `BlindbagCollectionController.bagIdList.AddRange(OrderBags.Select(b => b.Id))` (shelf slot ids 0..11, one per bag; duplicates allowed);
  `_pinginCashier.AnimationState.SetAnimation(0, "happy_idle", loop = true)` (the penguin has no animation before this).

### 2.10 BillLine (prefab BillLineBlindbag)
- `SetData(name, price)`: `_time = 1`; `_itemName = Localize(name)`; `_totalPrice = price`; Name text = `_itemName + " x1"`; Price text = `price`.
- `UpdatePrice(price)`: `_totalPrice += price`; Price text = `_totalPrice`; `_time++`; Name text = `_itemName + " x" + _time`.
  The prefab's SkeletonGraphic stays at the 'adventure' skin.

### 2.11 Door
- `Hide(d)`: left, right and roof GameObjects active; left and right `DOLocalMoveX(0, d)`; roof `DOLocalMoveY(8, d)`. Ease Linear, and d = 0 at Awake.
- `Open(d = 1.0, cb)`: `PlaySound(SPMK_Open_door_SPMK 22)`. Left `DOLocalMoveX(-10, d).SetEase(OutQuad)`.
  Right `DOLocalMoveX(10, d).SetEase(OutQuad).OnComplete(left, right and roof GameObjects off; cb())`. Roof `DOLocalMoveY(13.5, d).SetEase(OutQuad)`.

### 2.12 DoorScreen (ScreenBase)
- OnInit: when OpenDoorButton is clicked, `_openDoorButton.gameObject.SetActive(false)` and `OnOpenDoorAction?.Invoke()`.
- OnShow: `PlayMusic(bgm_ingame_1 = 4, 1.0)`. Ads and analytics are ignored.

### 2.13 StoreScreen (ScreenBase), MarketButton, NotiCanvas
- OnInit: listeners are added for ConfirmButton.onClick (order), BuyButton.onClick (buy) and CloseButton (home). `_blockScreen` off. `OnHideButtons(0.1)`.
- OnShow: `_confirmOrderButton.EnableState(false)`; `OnShowButtons(0.35)`. **If `!DataUser.IsDoneTutorialBlindBag`, hide CloseButton**,
  so a first-time player cannot quit.
- OnHideButtons(d) (ease InBack): ItemCounter anchorX −400, TotalPrice anchorX −400, CloseButton anchorY 150, Money anchorY 100, ConfirmButton anchorX 200.
- OnShowButtons(d) (ease OutBack): ItemCounter X 40, TotalPrice X 40, CloseButton Y −40, Money Y −100, ConfirmButton X −140.
- Order click: `PlaySound(click 1)`; `_bottomPanel.SetActive(false)`; `OnOrderButtonClicked()`.
- Buy click (BuyButton is never shown, because SetActiveBuyButton has no caller): `PlaySound(47)`, hide the button, `OnBuyButtonClicked()`.
  SetActiveBuyButton(a) would set the button active, set scale to 0, run `DOScale(1, 0.35)`, and enable the button.
- Close click: `PlaySound(click)`, then `ShowInter("blind_bag_back_click")` (ignore the ad), then `ShowPopup<BackHomePopup>()`.
  The popup's Confirm button plays click, shows an inter ad (ignore it) and calls FlashIn to go home. Cancel closes the popup.
- `ShowCartFullNotification(d)`: `noti.ResetItem()`, then `noti.Show(d)`.
- MarketButton: `EnableState(v)` sets `_enableToClick = v` and the sprite to `_onSprite` or `_offSprite` (ConfirmButton off sprite = `button_v_disabled`).
  Clicks are ignored while disabled. The Button component itself stays interactable.
- NotiCanvas: Awake caches anchoredPosition. `Show(d)`: ignored if already showing. Otherwise alpha = 1, `DOFade(0, d)` and `DOAnchorPosY(cachedY + 150, d)`.
  OnComplete: alpha 0, position reset, cb. `ResetItem()` kills the tweens, sets alpha 0, resets the position and sets `_isShowing = false`.
  Showing is only reset by ResetItem, which ShowCartFullNotification always calls first.

### 2.14 CompletedPopup (present in the scene, never shown by blind-bag code)
OnShow: sound jelly_endgame_sound (9); buttons interactable; AdButton pulse `DOScale(1.1, 0.5).SetLoops(-1, Yoyo)`; MoneyManager.ShowUp.
`SetMoneyResult(income, tip)` fills the texts. AdButton ('x2 Tips') pays `income + 2 * tip`. RewardButton ('No, thanks') pays `income + tip` and shows an inter ad.
Both buttons play click and Haptic(4), disable the buttons, stop the pulse, run `MoneyManager.CollectMoney(money, 10)`, wait 4 s, then FlashIn(HomeScene).
**Do not wire it into the flow.**

### 2.15 TutorialBlindBag (MonoSingleton)
`_tutorialClickBagOnShelf` = Items/TutorialTouchBag, `_tutorialScanItem` = Table/TutorialScanItem, `_tutorialUnbox` = null.
`canTutorial = !DataUser.IsDoneTutorialBlindBag`. `ShowX(b)`: always set the object inactive first, then set it active if `canTutorial && b`. Initiate calls HideAllTutorial.
- The shelf hand shows after the door opens and hides on the first successful pick.
- The scanner hand shows when the counter is reached (after the slide) and hides on the first scan.

### 2.16 Leftovers (no gameplay)
`OrderingFood` is a sprite-food copy of BlindBagAnimation (FadeOut = move Y +5 and fade). `Supermarket.Shelf.SortItem` is never called.
The other `Supermarket.*` classes (Card, PhoneStep, Recipe*, Signal, QuitPopup, Compartment) are not in this scene.

---------------------------------------------------------------------------------------------------------------------
## 3. Data and config

`ConfigBlindbagMarket` (`ScoopGame.BlindbagMarketAsset`, sharedassets3:107). `GetData(id)` uses `_dataList` when
`RemoteConfigManager.data_config_type == 1` (the default, set in `.cctor`), otherwise `_dataListAB`. BuyType = 2 (Coin) for all.

| id | Name | skin | Price (default) | Price (AB) |
|---:|---|---|---:|---:|
| 0 | Nature Fan | nature | 225 | 375 |
| 1 | Sweet World | sweet | 295 | 445 |
| 2 | Animal Friends | animal | 205 | 325 |
| 3 | Ocean Friends | ocean | 220 | 370 |
| 4 | Space Time | space | 390 | 550 |
| 5 | Adventure Now | adventure | 215 | 365 |
| 6 | Fashion Pop | fashion | 345 | 495 |
| 7 | Fast Food | fast_food | 230 | 380 |
| 8 | Fruit Party | fruit | 205 | 315 |
| 9 | Gadget Box | gadget | 425 | 575 |
| 10 | Kawaii Land | kawaii | 375 | 525 |
| 11 | Cozy Kitchen | kitchen | 275 | 425 |

The bag name is shown through `LocalizationManager.Localize(Name)`. The shelf price label shows the Price.
`ConfigBlindBagVisual` (`ScoopGame.BlindBagVisualAsset`) maps ID to SkinName plus Full, Half1 and Half2 sprites (used by level4 for opened halves).
`GetRandomData()` = `Random.Range(0, count)`, which this scene does not use.

Constants: cart capacity 5 (the number of points); there is no other cap on the number of bags. The money check is `price + (Moving + Placed total) <= coins`.
Payment happens once, after the last scan. The scene has no rewards or income. "What you get" is decided in level4 from `bagIdList`.

Randomness in this scene: the counter jump position of each bag (uniform in the BottomLeft–TopRight rectangle) and the bag tilt
(`Random.Range(-70, 70)` deg). Bag contents are not rolled here.

Saves: `DataUser.Money` changes once, through `MoneyManager.UpdateMoney(-total)`. `BlindbagCollectionController.bagIdList` is static
and kept in memory, not saved (inferred). `IsDoneTutorialBlindBag` is only read here. It is set true in level4
(`BlindBagCollection.CollectionCompletePopup`). Leaving before checkout loses the cart and costs nothing.

Sounds: CharmXucCharm1 17 (pick, bag pop at counter), Charmremove 16 (bag lands in cart, removed from cart), SPMK_Open_door_SPMK 22,
sfx_scan_payment 59, sfx_purchase_coin 47 (payment), click 1. Music: bgm_ingame_1. Vibration (ms): 100 (not enough money), 60 (bag placed), 50 (scan).

---------------------------------------------------------------------------------------------------------------------
## 4. Tutorial and first time

While `IsDoneTutorialBlindBag == false`:
- The Home button on StoreScreen is hidden.
- After the door opens, the hand `TutorialTouchBag` loops over the first shelf column (local (-1.59,-1.17) to (-0.65,-1.55), 1 s OutSine yoyo). It hides after the first successful pick.
- After the slide to the counter, the hand `TutorialScanItem` loops upward from the counter to the scanner ((29.84,-2.88) to (29.84,1.75), 1 s InOutSine yoyo). It hides on the first scan.

There is no forced pick. After the flag is set, the tutorial never shows again.

---------------------------------------------------------------------------------------------------------------------
## 5. Implementation checklist
1. Awake: init the 12 slots (price labels from the config, default list); door closed (left/right x 0, roof y 8); scan machine hidden; heart and shopping bag scale 0.
2. Start: fade in, show DoorScreen ('Tap to open' pulse), hide the shared avatar. A full-screen tap runs Door.Open(1 s, OutQuad, ±10 / roof 13.5) and plays sound 22.
3. On open: show StoreScreen (slide in its buttons with OutBack 0.35 s; hide Home while the tutorial is pending), enable taps, show the shelf hand.
4. Tap vs drag: a release without more than 5 px per-frame movement is a tap. Raycast at the pointer and dispatch to ItemBase or Basket. The shelf pans in X between −4.5 and 0 (AxisDrag2D).
5. Slot tap: pick the nearest active shelf bag. If the cart is full, shake the bag and show the 'Cart is full' toast (fade up 150 px over 1 s). If coins are short, shake, vibrate and open the NotEnoughMoney popup.
   Otherwise spawn the cart bag (scale 1.2, skin copied) at the shelf bag's position, then tween it to the point (1 s InBack plus rotate to 0). After 1 s it is Placed: sound 16, counter and total update. The shelf bag re-pops (0 to 0.4, 0.35 s).
6. Cart tap: squash animation. The last Placed bag fades out over 1 s and its slot is freed. The ✓ button is disabled until the update.
7. ✓ Confirm (enabled when count > 0): hide the bottom panel, block input, slide StoreAndTable X to −30 (1 s Linear).
   Then hide the shelves, jump the bags to random counter spots (0.5 s, power 1, staggered 0.2 s each, scale 1.4, sound 17 each), slide the cart down 12.5 and hide it, show the scanner hand.
8. Each bag gets a random tilt (−70..70). Dragging follows the pointer with lerp 20·dt; releasing early snaps the bag back. Within (1, 0.5) of scanPos, the scan triggers: sound 59, scan-line sweep (0.6 up, then −0.6 down, 0.5 s each).
   At the top of the sweep the bill line is added or incremented (" xN", summed price) and the total updates. The bag then slides right by 10 and is removed.
9. After the last scan: show Thanks (heart pops after 0.5 s, shopping bag pops, both OutBack 0.5 s), penguin plays 'happy_idle' (loop), push the slot ids to bagIdList.
   Deduct the total from coins, play sound 47, wait 2 s, hide the UI, flash-transition to BlindBagCollection (level4).
10. Home button: BackHomePopup. Confirm returns Home and nothing is charged.
