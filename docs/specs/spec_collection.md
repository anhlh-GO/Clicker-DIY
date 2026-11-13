# Blind Bag Collection (level4 `BlindBagCollection.unity`) – implementation spec

Sources: `dis/BlindBagCollection.*.s`, `Home.PopupCollectionBlindbag`, `Blindbag.ScanMachine` (entry), `Blindbag.TutorialBlindBag`, `RarityVisualConfig`, `out/data/level4.json`, `so.json`
(`BlindbagCollectionAsset` = `sharedassets0.assets:14399`, `ConfigBlindBagVisual` = `:14493`, `DecorKeycapConfig` = `:14398`).
Notation: `T(x)` = tween; durations in s; ease ids as in brief (OutBack=27, InBack=26, OutQuad=6, InOutSine=4, Linear=1). If no ease is set the DOTween default (OutQuad) applies (inferred).
"Vibrate" is always `Vibration.Vibrate(60ms)`.

---------------------------------------------------------------------------------------------------
## 1. Overview / flow

**Entry.**
1. Home → `PopupIntroBlindBag/CollectionButton` ("My Collection") → `Home.PopupCollectionBlindbag` (a read-only viewer of the collection, section 2.15).
   Its `BtnPlay` ("Get Blind Bag") → `SimpleSceneTransition.FlashIn(GameConfig.BlindbagScene)` = level3 BlindbagMinigame (the shop).
   `PopupIntroBlindBag/MakeButton` ("Go shopping") also goes to level3 (other spec).
2. In level3 the player buys bags. `Blindbag.ScanMachine.OnBuyCompleted` does
   `BlindbagCollectionController.bagIdList.Clear(); bagIdList.AddRange(OrderBags.Select(b => b._id))`. The ids are the
   `ConfigBlindBagVisual` ids (bag skins). Level3 then loads **level4** (`GameConfig.BlindbagCollection = 'Assets/_Game/Scenes/BlindBagCollection.unity'`).
   `bagIdList` is a static `List<int>` that carries the purchase into level4.

**Level4 runs in 2 steps:**

* **Step A – Unbox** (`Gameplay/OpenBag` visible): one blind bag per purchased id is spawned below the screen and jumps onto the tray
  (`Gameplay/OpenBag/BlindBoxTray`). The player taps each bag → it flies to centre, bursts open (spine `bag_open`), reveals a
  charm on a rarity paper card + glow, a "Wow" popup, then the charm jumps onto the result tray. "Lucky" bags (≈30%) give
  one extra bag. The charm/item of every bag is decided **when the bag is spawned**, independently of the bag skin.
* **Step B – Collection** (`Gameplay/Collection` visible): if some pulled items are duplicates (already owned or pulled twice
  this session) the **AutoSellPopup** sells them for coins. All *new* items lie on the plate (`Collection/Plate`) as draggable charms.
  Picking one up auto-scrolls the collection selector to the item's collection box and blinks the target slot; dropping it
  within 1.8 units of the slot unlocks it (saved). When all are placed (or none existed) the **CollectionCompletePopup**
  pays 500 + 100 coins (x2 with "ad") and returns to Home.

Exit: CollectionCompletePopup buttons → `GameSession.BackFromGameMode = BlindBag(2)`, `FlashIn(GameConfig.HomeScene)`.
`ScreenInGame/TopLeftUI/ButtonHome` → click sound + `ShowPopup<BackHomePopup>` ("Quit game / Progress will be lost") – only
visible in step A and only after the blind-bag tutorial is done.

---------------------------------------------------------------------------------------------------
## 2. Classes

### 2.1 BlindbagCollectionController (`Gameplay`)
Fields: `_blindBoxPlate`=Gameplay/OpenBag/BlindBoxTray, `_openBagObject`=OpenBag, `_collectionObject`=Collection,
`_collectionBoxsetObject`=Collection/CollectionLayer, `_homeButtonObject`=ScreenInGame/TopLeftUI/ButtonHome,
`_dragController`=Gameplay(BlindbagDragController), `_collectionAsset`=BlindbagCollectionAsset, `_blindBagVisualAsset`=ConfigBlindBagVisual,
`_physics2DRaycaster`=GameHandle/CameraMain. Runtime lists:
`_cacheDataItems` List<(itemType, boxsetType, sprite)> – the *new* items to drag;
`_lockedItemTypes`, `_checkDuplicateItems` List<(itemType, boxsetType)>; `_unlockedItems` List<(sprite, price)> – items to sell;
`_cachedCaseID`, `_cachedDecorID` List<int> – clicker ids of every pull (also duplicates).

```
Start():
  AudioManager.SetVolumeMusic(0.4)
  GameSession.SetActiveCharacter(false)
  _blindBoxPlate.gameObject.SetActive(false); _physics2DRaycaster.enabled = false
  _collectionDataUser = DataManager.GetData<BlindbagCollectionData>()
  _screenInGame = UIManager.GetScreen<BlindbagGameScreen>(); show it (UIManager screen show, virtual call)
  SimpleSceneTransition.FadeOut()          // reveal scene
  GoToStepBlindBox()

GoToStepBlindBox():
  OpenBag.SetActive(true); BlindBoxTray.SetActive(true); raycaster.enabled = true; Collection.SetActive(false)
  SetupBlindBoxPlate(); _screenInGame.ShowContentUnbox()      // ContentBlindBox active (its Content has scale 0 → invisible)

SetupBlindBoxPlate():
  _blindBoxPlate.ClearPlate()
  for i in 0..bagIdList.Count-1: PickRandomItemAndSpawn(_blindBagVisualAsset.GetData(bagIdList[i]).SkinName)
  _blindBoxPlate.AutoSpawnBlindBox()

GetRandomItemData() -> (itemType, boxset, sprite, id, rarity):
  itemType = asset.GetRandomCollectionItemType(); boxset = asset.GetRandomCollectionBoxsetType()
  sprite = asset.GetItemSprite(itemType, boxset); id = asset.GetItemID(...); rarity = asset.GetRarity(...)

PickRandomItemAndSpawn(skinName):
  d = GetRandomItemData()
  isLuck = Random.Range(0,101) <= asset.LuckBagChance (30)        // 31/101 ≈ 30.7 %
  _blindBoxPlate.SpawnBlindBox(d.sprite, skinName, isLuck, d.rarity)
  AddItemToCacheIfNeeded(d.itemType, d.boxset, d.sprite)
  (d.itemType == FullKeycap ? _cachedCaseID : _cachedDecorID).Add(d.id)

AddMoreBlindBox():          // called by a lucky bag (ShowAtCenter) – same as above but random skin
  d = GetRandomItemData(); skin = _blindBagVisualAsset.GetRandomData()   // uniform over the 12 entries
  isLuck = Random.Range(0,101) <= 30                                     // lucky can chain
  _blindBoxPlate.AddMoreRandomBox(d.sprite, skin.SkinName, isLuck, d.rarity)
  AddItemToCacheIfNeeded(...); add id to _cachedCaseID / _cachedDecorID

AddItemToCacheIfNeeded(type, boxset, sprite):
  key = (type, boxset)
  if !_lockedItemTypes.Contains(key): _cacheDataItems.Add((type,boxset,sprite)); _lockedItemTypes.Add(key)
  price() = Random.Range(P.x, P.y+1)  with P = (type==FullKeycap ? FullKeycapPrice [200,300] : DecorItemPrice [50,100])
  if _checkDuplicateItems.Contains(key):  _unlockedItems.Add((sprite, price()))      // 2nd+ pull this session → sell
  else: _checkDuplicateItems.Add(key)
        if _collectionDataUser.IsUnlocked(boxset, type): _unlockedItems.Add((sprite, price()))   // already owned → sell
  // note: an already-owned item is still put in _cacheDataItems but InitalizeBlindbag skips owned items.

IsDoneUnbox() = _blindBoxPlate.DoneUnbox

GoToCollectionStep():  (called by BlindbagGameScreen after the last bag)  if DataUser save exists:
  raycaster.enabled = false; OnGoToCollectionStep()
OnGoToCollectionStep(): SimpleSceneTransition.Transition(onMiddle = b__28_0)   // fade cover → callback → uncover
b__28_0:
  if _unlockedItems.Count > 0: UIManager.ShowPopup<AutoSellPopup>().InitalizePrice(_unlockedItems, onComplete = no-op)
  BlindBoxTray.SetActive(false); OpenBag.SetActive(false); Collection.SetActive(true); ButtonHome.SetActive(false)
  _dragController.InitalizeBlindbag(_cacheDataItems)
  Camera.main.GetComponent<Physics2DRaycaster>().enabled = true
  if _dragController._itemLeft == 0: raycaster.enabled = false; OnCollectionComplete()
(`<GoToCollectionStep>b__27_0` = `Invoke("OnGoToCollectionStep",1.5)` exists but is unused.)

OnCollectionComplete():
  CollectionLayer.SetActive(false); _screenInGame._goBlockScreen.SetActive(true); _screenInGame.ShowChatContent(false)
  UIManager.ShowPopup<CollectionCompletePopup>()
```

### 2.2 BlindbagCollectionAsset (ScriptableObject `BlindbagCollectionAsset`)
Data: `FullKeycapPrice=[200,300]`, `DecorItemPrice=[50,100]`, `LuckBagChance=30`, `CurrentProbabilities=[21,79]`, `BaseProbabilities=[85,15]`,
`CollectionBoxsets` (12 sets, see §3), `_baseKeycapConfig`, `_decorKeycapConfig`=DecorKeycapConfig.

```
GetRandomCollectionItemType():   // weighted pick with "pity" rebalancing; mutates CurrentProbabilities in memory (never saved,
                                 // resets to [21,79] at app start)
  n = min(Current.Count, Base.Count); if n==0 return FullKeycap
  total = Σ max(0,Current[i]); if total < 1 return FullKeycap
  r = Random.Range(0,total); idx = first i with (r -= max(0,Current[i])) < 0 (else 0)
  d = RoundHalfEven(Base[idx]*0.1); if Base[idx] >= 1: d = max(d,1)
  take = min(d, Current[idx]); Current[idx] -= take
  if take >= 1:                       // give `take` back to the other entries proportionally to Base
     S = Σ_{j≠idx} max(0,Base[j]); if S >= 1:
        given = 0; for j≠idx: a = RoundHalfEven(Base[j]/S*take); Current[j] += a; given += a
        rem = take-given; for j≠idx while rem≠0: Current[j] += sign(rem); rem -= sign(rem)
  if idx == 1: return Random.Range(1,6)          // Decor1..Decor5 (uniform)  — Decor6+ can NEVER drop
  return idx < 13 ? idx : 0                       // idx 0 → FullKeycap
  // with 2 entries: picking FullKeycap moves 8 points (round(8.5)=8) from [0] to [1]; picking Decor moves 2 (round(1.5)=2) from [1] to [0].
GetRandomCollectionBoxsetType() = CollectionBoxsets[Random.Range(0, 12)].BoxsetType      // uniform
GetItemSprite(type, boxset): bs = boxset entry; type==FullKeycap ? bs.FullKeycap.ItemSprite : bs.DecorItems.Find(Type==type).ItemSprite
  (warning + null if missing)
GetItemID(type, boxset): item as above; RemoteConfig.data_config_type == 1 ? item.ID_Cached : item.ID_CachedAB
  (data_config_type default = 1 → use ID_Cached)
GetRarity(type, boxset): FullKeycap → Special(99); decor → DecorKeycapConfig.DataList.Find(d.Id == decor.ID_Cached).Rarity, Common(0) if not found
  (DataList = data_config_type==1 ? _dataList : _dataListAB)
GetRandomItemPrice(type) = Random.Range(P.x, P.y+1)   (P as above; unused here, same formula is inlined)
```

### 2.3 BlindbagCollectionData (GameData, save key = class name via GameData.GetName (inferred))
Save object `BlindbagCollectionDataSave { List<BoxsetData> BoxsetDataSave }`, `BoxsetData { CollectionBoxsetType BoxsetType; List<CollectionItemType> ItemTypes }`.
```
NewData(): _dataSave = new { BoxsetDataSave = [] }
Unlock(boxset, type): e = list.Find(BoxsetType==boxset) ?? add new {boxset, []}; if !e.ItemTypes.Contains(type) e.ItemTypes.Add(type)
   (does not save itself – caller calls SaveData())
IsUnlocked(boxset, type) = entry exists && entry.ItemTypes.Contains(type)
IsBoxsetCompleted(boxset) = entry.ItemTypes.Count >= Enum.GetValues(CollectionItemType).Length (=13)
   → never true in practice (only 6 types obtainable). Keep faithful: the "set complete" show (2.10) never triggers.
SaveData()/LoadData(): DataManager.SaveData/LoadData(GetName(), _dataSave)
```

### 2.4 BlindBoxPlate (`Gameplay/OpenBag/BlindBoxTray`)
Fields: `_blindBoxItem`=BoxHolder/BlindBox (template, stays off-screen), `_tfHolder`=BoxHolder, `_tfPlateHoldResult`=PlateHoldResult,
spawn rect `_tfBottomLeft/_tfTopRight` = BoxHolder/BottomLeft (-3.57,-22.41)/TopRight (3.27,-19.29) (below screen),
open rect `_tfBottomLeftOpen/_tfTopRightOpen` = UnboxZone/BottomLeft (-4.15,-3.28)/TopRight (4.07,3.78) (UnboxZone at (0,-1)),
result rect `_tfBottomLeftPlate/_tfTopRightPlate` = FinalHoldZone/BottomLeft (-3.60,-1.20)/TopRight (3.58,1.27) (local positions),
`_collider` = tray BoxCollider2D. `_currentBoxHold` = bags spawned but not yet jumped in.
```
DoneUnbox = _spawnedBlindBox.FindAll(b => !b._opened).Count == 0
ClearPlate(): destroy all spawned; clear list; _currentBoxHold = 0
SpawnBlindBox(sprite, skin, isLuck, rarity):
  pos = (Random.Range(BL.x,TR.x), Random.Range(BL.y,TR.y), _spawnedBlindBox.Count*0.1)    // world pos of the corner transforms
  rot = Euler(0,0,Random.Range(0f,360f))
  b = Instantiate(_blindBoxItem, pos, rot, _tfHolder); b.SetSkinBag(skin); b.SetData(sprite,isLuck,rarity); b.DisableClick()
  _spawnedBlindBox.Add(b); _currentBoxHold++
AutoSpawnBlindBox():
  for i in 0..count-1: DOVirtual.DelayedCall(i*0.1, CheckPopOutBlindBox)
  DOVirtual.DelayedCall(1.0, () => TutorialBlindBag.ShowTutorialUnbox(_spawnedBlindBox[0].transform, true))
CheckPopOutBlindBox():
  if _currentBoxHold >= 1:
    PlaySound(CharmXucCharm1=17); Vibrate
    target = (Random.Range(BLopen.x,TRopen.x), Random.Range(BLopen.y,TRopen.y), box.z)
    idx = _currentBoxHold-1                     // last spawned jumps first
    _spawnedBlindBox[idx].transform.DOJump(target, power 3, jumps 1, 0.5).SetDelay(0.15)
        .OnComplete(Vibrate; box.EnableClick())
    _currentBoxHold--
  if _currentBoxHold == 0 (inferred): _collider.enabled = false
AddMoreRandomBox(sprite, skin, isLuck, rarity):        // extra bag from a lucky bag
  b = Instantiate(_blindBoxItem, _blindBoxItem.position, Euler(0,0,Random(0,360)), _tfHolder); SetData; SetSkinBag; DisableClick; add
  b.transform.DOJump((rand in open rect).xy, z = count*0.1, power 3, 1 jump, 1.0).SetDelay(1.5).OnComplete(Vibrate; EnableClick)
GetNewItem(itemTf):   // revealed charm goes onto the result tray
  local = (Random.Range(BLplate.local.x,TRplate.local.x), Random.Range(BLplate.local.y,TRplate.local.y), 0)
  itemTf.SetParent(PlateHoldResult); itemTf.DOLocalJump(local, power 2, 1 jump, 0.5)
OnPointerDown: no-op.
```

### 2.5 BlindbagCollectionBox (one bag; template `BoxHolder/BlindBox`)
Fields: `_srKeycap`=…/PaperCard/Keycap SR, `_tfKeycap`=Keycap, `_srPaper`=PaperCard SR, `_tfPaperPack`=PaperCard (scale 0.63),
`_goLuck`=PaperCard/Lucky ("Bonus_card"), `_paperCardData` = {Common: card_common/fx_glow_blue, Rare: card_rare/fx_glow_pink,
Epic: card_epic/fx_glow_yellow, Legendary: card_lengendary/fx_glow_purple}, `_collider` (BoxCollider2D), `_sortingGroup`,
`_srResult`=BlindBoxTray/HighlightEffect/BG (full-screen Square, dark overlay), `_srGlow`=HighlightEffect/Effect/glow_effect_1,
`_tfGlowEffect`=HighlightEffect/Effect (scale 0 initially; contains rotating fx_rotation + fx_glow DOTweenAnimations),
`_spineBag`=Spine GameObject (blind_bag) (skins = SkinName: nature, sweet, animal, ocean, space, adventure, fashion, fast_food,
fruit, gadget, kawaii, kitchen; anim `bag_open`). The PaperCard sits on a SkeletonFollower (BoneFollower) so it moves with the spine.
```
Start(): _screenInGame = UIManager.GetScreen<BlindbagGameScreen>()
SetSkinBag(skin): skeleton.SetSkin(skin); SetSlotsToSetupPose(); animationState.Apply(skeleton)
SetData(sprite, isLuck, rarity):
  _srKeycap.sprite = sprite; _tfKeycap.localScale = 1
  (w,h) = _srKeycap.bounds.size; k = min(1, 2/w, 2/h); _tfKeycap.localScale *= k      // fit into 2x2 world units
  _isLuck = isLuck; _goLuck.SetActive(isLuck)
  p = _paperCardData.Find(Rarity == rarity)
  if p: _srPaper.DOFade(1,0); _srPaper.sprite = p.CardSprite; _glowSprite = p.GlowSprite
  else (FullKeycap = Special): _srPaper.DOFade(0,0) (no card); _glowSprite = _paperCardData[0].GlowSprite (blue)
OnPointerDown(): if pointer over UI → ignore
  DisableClick(); TutorialBlindBag.ShowTutorialUnbox(_, false); AnimOpen(onComplete = no-op)
AnimOpen(onComplete):
  _sortingGroup.sortingOrder = 6; _timeDoneBGTween = _timeDoneGlowTween = Time.time + 2
  _srResult.DOKill(); _srResult.DOFade(0.95, 0.3)                       // darken screen
  transform.DOMove((0,-1.5,-5), 0.5); transform.DOScale(1.5, 0.5); transform.DORotate((0,0,0), 0.5)
    .OnComplete(b__0)
  b__0: PlaySound(Charmremove=16); PlaySound(sc_bag_crack=18); Vibrate
        spine.AnimationState.SetAnimation(0, "bag_open", false); DelayedCall(1.0, b__1)
  b__1: _srGlow.sprite = _glowSprite; _srResult.DOKill(); _srResult.DOFade(0.95, 0.1)
        _tfGlowEffect.DOKill(); _tfGlowEffect.DOScale(1, 1.0).SetEase(OutBack)
        if _tfKeycap.localScale.x <= 0.5:   // small charm → enlarge
            (w,h)=_srKeycap.bounds.size; _tfKeycap.DOScale(min(1, 1.6/w, 1.6/h), 0.5).SetEase(Linear)
        onComplete()
        AnimFade()                                          // FadeOutSpine(0.25): spine colour alpha 1→0
        UIManager.ShowPopup<PopupWowBlindbag>().ShowGetOneMore(_isLuck)
        _tfPaperPack.DOLocalMoveY(3, 0.3).SetEase(Linear).OnComplete(b__2)    // card pops up out of the bag
  b__2: if _isLuck: PlaySound(sc_SprayComplete=19)
        ShowAtCenter(onDone = () => _opened = true)
FadeOutSpine(d, cb): c = skeleton colour; DOTween.To(1→0, d, a => skeleton.SetColor(c.rgb, c.a*a)).OnComplete(cb)
ShowAtCenter(onDone):
  if _isLuck:
     _screenInGame._blindbagCollectionController.AddMoreBlindBox()
     _tfPaperPack.DOLocalMoveX(-1, 0.5); _goLuck.transform.DOLocalMoveX(3, 0.5)          // card and "Bonus" card separate
     _tfPaperPack.DORotate((0,0,6), 0.5); _goLuck.transform.DORotate((0,0,-12), 0.5).OnComplete(DelayedCall(1.5, finish))
  else DelayedCall(1.5, finish)
  finish: UIManager.HidePopup<PopupWowBlindbag>(); HideEffect(); FlyToTray(); onDone(); _tfPaperPack.DOScale(0, 0.3)
HideEffect(): if now > _timeDoneGlowTween: _tfGlowEffect.DOScale(0,0.5).SetEase(InBack)
              if now > _timeDoneBGTween: _srResult.DOFade(0,0.5).SetEase(Linear)
FlyToTray(): _blindBoxPlate.GetNewItem(_tfKeycap); _screenInGame.HandleCharmFlyToPlate(false)
EnableClick()/DisableClick(): _collider.enabled = true/false
```
Timeline of one normal bag (t = tap): 0–0.5 fly to centre/scale 1.5; 0.5 crack sounds + `bag_open`; 1.5 glow + Wow popup + spine fade 0.25 +
card up 0.3; 1.8 → wait 1.5; 3.3 popup hidden, overlay/glow fade 0.5, charm jumps to tray (0.5), card shrinks 0.3, `_opened=true`.
Lucky bag: at 1.8 extra bag is spawned (jumps in at 3.3–4.3), card/bonus split for 0.5 s, finish at 3.8.
Nothing prevents tapping a second bag while one is animating (both fly to the centre) – keep as is.

### 2.6 BlindbagGameScreen (`UIManager/[Sceen]/ScreenInGame`, ScreenBase)
Fields: `_goBlockScreen`=ScreenInGame/BlockScreen, `_closeButton`=TopLeftUI/ButtonHome, `_blindbagCollectionController`, `_livestreamPanel`=TopLeftUI/LivePanel,
`_contentUnbox`=ContentBlindBox, `_charmFlyToBasket`=ContentBlindBox (CharmFlyToBasketBB – not used in this scene), `_contentChat`=CommentChat,
`_commentHandler`, `_chatInput`, `_fxEmoji`=CommentChat/Emoji.
```
OnInit: ChatInput.OnInit(); _goBlockScreen off; _closeButton.onClick += { PlaySound(click=1); ShowPopup<BackHomePopup>() }
OnShow: FadeOut transition; chatInput active; commentHandler.enabled(flag @0x20)=true; _fxEmoji.Play(); livestreamPanel.OnShow()
        if !DataUser.IsDoneTutorialBlindBag: _closeButton.gameObject.SetActive(false)
OnHide: commentHandler flag=false; livestreamPanel.OnHide()
ShowContentUnbox(): _contentUnbox.SetActive(true)
ShowContentSelectBox(): _goBlockScreen off; ShowChatContent(false); _contentUnbox off; livestreamPanel.gameObject off
ShowChatContent(b): _contentChat.SetActive(b); _fxEmoji.gameObject.SetActive(b); b ? Play : Stop
HandleCharmFlyToPlate(isLuck): _goBlockScreen off; DelayedCall(2.0):
   if controller._blindBoxPlate.DoneUnbox && !_doneFlag:
      (interstitial 'done_unbox' – skip); _doneFlag = true
      ShowContentSelectBox(); UpdateUnlockedItemData(); controller.GoToCollectionStep()
UpdateUnlockedItemData(): for id in controller._cachedCaseID: if !DataUser.HasUnlockedClickerBase(id) DataUser.UnlockClickerBase(id)
                          for id in _cachedDecorID: if !HasUnlockedKeycapDecor(id) UnlockClickerDecor(id)
   // every pulled charm (incl. duplicates) is unlocked for the Clicker mode (case = base, decor = keycap decor)
RemoteCallAddMoreBag(): controller.AddMoreBlindBox()
```

### 2.7 BlindbagDragController (`Gameplay`)
Fields: `_itemPrefab`=CollectionItem prefab (`sharedassets4:49`; same as Collection/Plate/ItemHolder/CollectionItem: CircleCollider2D,
scale 0.7, child Visual SR), `_holder`=Collection/Plate/ItemHolder, `_focus`=Collection/FocusLayer, `_collectionSelector`=Collection,
`_showCompleteBoxset`=Gameplay/ShowCompleteBoxset, `_randomPositions`=Collection/Plate/PointPool/Point (1..12) (local pos:
(-4.38,-1.01) (-4.56,0.39) (-2.61,-0.44) (-1.10,-0.90) (-1.60,0.82) (-0.38,0.17) (0.22,0.91) (1.38,0.78) (0.73,-0.25) (2.03,-0.59) (2.76,0.57) (4.38,-0.51)),
`_complimentSprites`=[AWESOME!, LOVELY!, Perfect, GREAT JOB!], `_complimentSoundEnum`=[sc_Awesome 30, sc_Lovely 29, sc_Perfect 28, sc_Greatjob 27],
`_dragOffsetBonus`=(0,2,0). Static events `OnDragStart(ItemDraggable)`, `OnDragEnd()`.
```
Awake: _mainCamera = Camera.main; OnDragStart += OnDragStartHandler     (OnDestroy removes)
Start: _collectionDataUser = DataManager.GetData<BlindbagCollectionData>()
InitalizeBlindbag(all):
  pts = PickRandom(_randomPositions, all.Count)       // distinct random points (inferred); max 12 – more items would overflow
  for i: (type, boxset, sprite) = all[i]
     if _collectionDataUser.IsUnlocked(boxset, type): continue     // owned → not draggable (it was sold)
     it = Instantiate(_itemPrefab, pts[i].position, Euler(0,0,Random.Range(-45,45) /*int*/), _holder)
     it.SetData(type, boxset, sprite); _spawnedItems.Add(it.gameObject); _itemLeft++
Update():
  if _currentItem: w = cam.ScreenToWorldPoint(pointer.position) (z 0); _currentItem.position = (w.x+_dragOffset.x, w.y+_dragOffset.y, z + _dragOffset.z)
     if pointer.press.wasReleasedThisFrame: OnDragEnded()
OnDragStartHandler(item):
  if _currentItem: OnDragEnded()
  _currentItem = item; item.transform.SetParent(_focus)
  _dragOffset = item.position - mouseWorld + _dragOffsetBonus     // charm floats 2 units above the finger
  PlaySound(Charmremove=16)
OnDragEnded():
  p = _currentItem.position; t = _collectionSelector._currentBox.GetCurrentItemPosition()
  if |p.xy - t| < 1.8:                      // success
     Vibrate; SpawnCompliment(Vector2.zero)
     completed = UnlockCurrentItemInCollection()
     _currentItem.gameObject.SetActive(false); _itemLeft--
     if _itemLeft <= 0: Invoke("Complete", completed ? 6 : 2)
  else: OnDragEnd?.Invoke()                 // only on a miss! (selector re-enables nav + disables highlight)
  _currentItem.OnDragEnded(); _currentItem.transform.SetParent(_holder); _currentItem = null
UnlockCurrentItemInCollection():
  PlaySound(Charmremove=16)
  data.Unlock(item.BoxsetType, item.CollectionItemType); data.SaveData()
  _collectionSelector._currentBox.UnlockCurrentBox()
  completed = data.IsBoxsetCompleted(item.BoxsetType)              // always false (see 2.3)
  if completed: DelayedCall(0.5, () => _showCompleteBoxset.Show(currentBox.transform))
  return completed
Complete(): foreach go in _spawnedItems: go.SetActive(true)    // all placed charms re-appear on the plate
            _collectionController.OnCollectionComplete()
SpawnCompliment(pos): c = PoolManager.SpawnPoolElement(108).GetComponent<ScoopGame.ComplimentItem>()
  i = Random.Range(0, 4); c.ShowEffect(pos + (Random(-4,4), Random(-4,4)), _complimentSprites[i]); AudioHelper.PlaySound(_complimentSoundEnum[i])
IsDragging() = _currentItem != null; GetTotalItem() = _itemLeft
```
Quirk to keep (or fix consciously): after a *successful* drop `OnDragEnd` is not raised, so the collection Prev/Next buttons stay
disabled (`_canPress=false`) until the next missed drop.

### 2.8 ItemDraggable (draggable charm)
Fields `_collectionItemType`, `_collectionBoxsetType`, `_spriteRenderer`=Visual, `_collider` (GetComponent in Awake).
```
Start: _initialPosition/_initialRotation/_initialScale = transform values (after spawn: point pos, random Z rot, scale 0.7)
SetData(type, boxset, sprite): store; Visual.sprite = sprite; Visual.localScale=1; k=min(1, 4/w, 4/h) (bounds size); Visual.localScale *= k
OnPointerDown: _collider.enabled=false; BlindbagDragController.OnDragStart(this); kill tweens
   _tween1 = transform.DORotate((0,0,0), 0.1).SetEase(OutQuad); _tween2 = transform.DOScale(1, 0.1).SetEase(OutQuad)
OnDragEnded: kill tweens; _collider.enabled=true; SetPositionAndRotation(_initialPosition, _initialRotation)
   _tween1 = transform.DOScale(_initialScale, 0.1).From(_initialScale*0.5).SetEase(OutBack)     // snaps back to its spot
CompareData(boxset) = boxset == _collectionBoxsetType
```

### 2.9 CollectionSelector (`Gameplay/Collection`; also `CollectionBlindBag` in Home)
Fields: `_boxSpacing`=17, `_moveSpeed`=60 (scene; ctor default 20), `_collectionBoxes` = 12 CollectionBoxes under CollectionLayer/Pivot
(Collection_NatureFan x=0, SweetWorld 17, AnimalFriends 34, OceanFriends 51, SpaceTime 68, AdventureNow 85, FashionPop 102, FastFood 119,
FruitParty 136, GadgetBox 153, KawaiiLand 170, CozyKitchen 187), `_previousButton`=CollectionLayer/Previous (-6.5,0; inactive),
`_nextButton`=CollectionLayer/Next (6.5,0), `_pivot`=CollectionLayer/Pivot, `_pagesScrollVisual`=Collection/Pages (dots "circle", 20 slots, 5 active).
```
Awake: prev.AddListener(OnPreviousButtonClicked); next.AddListener(OnNextButtonClicked)
       BlindbagDragController.OnDragStart += OnDragStartHandler; OnDragEnd += OnDragEndHandler
       _currentBox = boxes[_currentBoxIndex=0]; _pagesScrollVisual.SetPages(12); HighlightPage(0)
OnPreviousButtonClicked: AudioHelper.PlaySound(click=1); if idx-1 >= 0: idx--; HighlightPage(idx); UpdateCurrentBox()
OnNextButtonClicked:     PlaySound(click); if idx < 11: idx++; HighlightPage; UpdateCurrentBox()
UpdateCurrentBox(): _currentBox = boxes[idx]; prev.gameObject.SetActive(idx>0); next.gameObject.SetActive(idx<11)
   _moveTween.Kill(); _moveTween = _pivot.DOLocalMoveX(-idx*17, 60).SetSpeedBased(true).SetEase(OutQuad)
OnDragStartHandler(item): idx = index of box with _boxsetType == item.BoxsetType; HighlightPage(idx)
   boxes[idx].SetHighlight(item.CollectionItemType); UpdateCurrentBox(); prev._canPress = next._canPress = false
OnDragEndHandler(): _currentBox.DisableHighlight(); prev/next _canPress = true
GetCurrentItemPosition() = _currentBox.GetCurrentItemPosition(); UnlockCurrentItemInBoxset() = _currentBox.UnlockCurrentBox()
```
CollectionNaviagationButton (SR arrow + BoxCollider2D): `OnPointerDown: if _canPress && _onClick: _onClick()`; `_canPress` default true.
Needs the Physics2DRaycaster on the camera to receive clicks.

### 2.10 CollectionBox (one collection page, e.g. `Collection_NatureFan`)
Fields: `_boxsetType` (20..31), `_collectionItems` = 10 BoxItems {IsUnlocked, ItemType, Icon}: ItemType 0 → `Items/CaseBig` (with child
`CaseBigFront`), ItemType 1..9 → `Items/Keycap_1..9`. All Icons start inactive; background SR = collection_xxx; `Items/Cover` = front cover sprite.
```
Start: data = BlindbagCollectionData
  foreach it: it.IsUnlocked = data.IsUnlocked(_boxsetType, it.ItemType); it.Icon.gameObject.SetActive(it.IsUnlocked)
     if it.ItemType == FullKeycap && it.IsUnlocked: all child SRs (CaseBigFront) SetActive(true)
GetCurrentItemPosition() = _currentBoxItem ? _currentBoxItem.Icon.position.xy : (999,999)
SetHighlight(type): _currentBoxItem = item with ItemType==type; Icon.gameObject.SetActive(true)
   _highlightTween.Kill(); _highlightTween = Icon.DOFade(0.8, 0.5).SetLoops(-1, Yoyo).SetEase(InOutSine).From(0)   // ghost slot blinks 0↔0.8
DisableHighlight(): _highlightTween.Kill(); if !_currentBoxItem.IsUnlocked: Icon.gameObject.SetActive(false); _currentBoxItem = null
UnlockCurrentBox(): if _currentBoxItem && !_currentBoxItem.IsUnlocked:
   for items with same ItemType: IsUnlocked=true; Icon.color = white(1,1,1,1); if FullKeycap: child SRs SetActive(true)
   _highlightTween.Kill(); _currentBoxItem = null
SetupData(): editor helper (builds BoxItems from _setupData) – not needed.
```
Slot sprites in the scene are the real item sprites (e.g. NatureFan Keycap_1 = keycap_E_6), identical to the asset's DecorItems order.

### 2.11 ShowCompleteBoxset (`Gameplay/ShowCompleteBoxset`) – "Awesome!" set-complete showcase (unreachable, see 2.3)
Fields: `_screenCanvasGroup`=ScreenInGame CanvasGroup, `_overlay`=Root/Overlay, `_headerAnimation`=Root/Header DOTweenAnimation
(scale From (0,0,1)→1.5, 0.35, OutBack, autoPlay off), `_confettiParticle`=[Sceen]/ConfettiFullscreen, `_root`=Root (scale 0.9).
```
Start: _2dRaycaster = Camera.main Physics2DRaycaster; _root.SetActive(false)
Show(boxTf): remember parent and world pos; boxTf.SetParent(_root); boxTf.localPosition = 0; OnShow()
  seq: Append(boxTf.DOScale(1,0.35).SetEase(OutBack).From(0.3)); AppendCallback(header play forward (inferred));
       AppendInterval(2); AppendCallback(header play backwards (inferred)); AppendInterval(0.35)
       Append(boxTf.DOMoveY(startPos.y,0.5).SetEase(OutBack).OnComplete(SetBoxsetToNormal))
       Join(_screenCanvasGroup.DOFade(1,0.25)); Join(_overlay.DOFade(0,0.25)); AppendCallback(OnComplete)
OnShow: _root active; confetti active+Play; PlaySound(jelly_end_jelly=11); raycaster off; screen CanvasGroup.interactable=false
        screenCG.DOFade(0,0.25); _overlay.DOFade(0.8,0.25).From(0)
SetBoxsetToNormal: boxTf.SetParent(oldParent); boxTf.position = (startPos.x, startPos.y, 0)
OnComplete: confetti off (inferred); screenCG.interactable = true; _root off; raycaster on
```

### 2.12 AutoSellPopup (`[Popup]/AutoSellPopup`, "You already own this item" / "Trade")
Fields: `_tradeAdButton`=Panel/TradeAdButton (**inactive** in scene), `_tradeNormalButton`=Panel/TradeNormalButton ("Trade"),
`_sellItemInstance`=Panel/ScrollView/Viewport/Content/SellIItem (inactive template, GridLayoutGroup), `_txtTradeAdPrice`=TradeAdButton/CoinText,
`_txtTradeNormalPrice`=Panel/CoinText (next to ic_coin_full), `_normalTradeScale`=0.2.
```
OnShow: (MREC ad – skip)
InitalizePrice(items, onComplete): _onComplete = onComplete; _totalPrice = 0; _sellItems = []
  foreach (sprite, price): s = _sellItems.Find(x.ItemSprite == sprite)
     if s: s.AddDuplicate()       // "x2", "x3"… (row keeps first price text)
     else: s = Instantiate(_sellItemInstance, sameParent); s.SetItem(sprite, price); active; _sellItems.Add(s)
     _totalPrice += price
  _txtTradeAdPrice.text = _totalPrice; _txtTradeNormalPrice.text = (int)(_totalPrice * 0.2)
TradeAd click:     AudioHelper.PlaySound(click); MoneyManager.CollectMoney(_totalPrice, 10 coins fx); Hide()
TradeNormal click: PlaySound(click); CollectMoney((int)(_totalPrice*0.2), 10); Hide()      // the only visible option → 20 %
OnHide: _onComplete(); destroy all _sellItems; (hide MREC)
```
SellItem: `SetItem(sprite,price)`: Icon.sprite, Price text = price, `_count=1`, Count text "x1". `AddDuplicate()`: `_count++`, "x"+count.
(The `=>` arrow and Price objects are inactive in the template, so rows show icon + "xN".)
Example: duplicate FullKeycap (200–300) + 2 decor (50–100 each) → total 300–500 → Trade pays 60–100.

### 2.13 CollectionCompletePopup (`[Popup]/CollectionCompletePopup`, "Completed!")
Fields: `_btnAdReward`=BtnAdReward ("x2 Reward", Holder pulses scale 1.1, 1s InOutQuad yoyo), `_btnReward`=BtnNoThanls ("No thanks"),
`_imgCustomer`=Compliment/Avatar, `_txtEarnings`=RewardInfo/TxtEarnings, `_txtTips`=RewardInfo/TxtTips, `_fxConfetti`, `_tfTitle`=Title,
`_tfCompliment`, `_tfRewardInfo`, `_tfBtnAdReward`, `_tfBtnReward`; `Money` = MoneyManager coin counter inside the popup.
```
OnInit: wire buttons; confetti off; _moneyReward = (data_config_type==1 ? 500 : 300) → 500; _moneyBonus = 100
OnShow: PlaySound(sfx_result_confetti=48); confetti on
  Title: scale 0 → DOScale(1,0.3).SetEase(OutBack)
  RewardInfo: scale 0 → DOScale(1,0.3) OutBack, delay 0.75
  BtnAdReward: scale 0 → 1, 0.3 OutBack, delay 1.0;  BtnNoThanls: scale 0 → 1, 0.3 OutBack, delay 1.5
  TxtEarnings = "+500"; TxtTips = "+100"
  DataUser.BlindbagPlayTime++ ; save
  if GameSession.OrderAvatar: _imgCustomer.sprite = it;  ProfileManager.ObtainExperiencePoint()
OnBtnRewardClick ("No thanks"): PlaySound(click); both buttons interactable=false
  DataUser.ClickerRewardClaimCount = min(+1, 4); save
  MoneyManager.CollectMoney(600, 10, then: (interstitial 'no_thanks' – skip); finish)
OnBtnAdRewardClick ("x2"): PlaySound(click); (rewarded 'x2_reward' → treat as success) buttons off;
  CollectMoney(1200, 10, then: finish)
finish: if !IsDoneTutorialBlindBag: IsDoneTutorialBlindBag = true; save
        GameSession.BackFromGameMode = BlindBag(2); SimpleSceneTransition.FlashIn(GameConfig.HomeScene)
OnHide: confetti Stop + off
```

### 2.14 Other popups used
* `PopupWowBlindbag` ([Popup]/PopupWowBlindbag): `ShowGetOneMore(isLuck)`: Normal.SetActive(!isLuck), GetOneMore.SetActive(isLuck)
  ("Get 1 more !"), both DOScale(1,0.3) OutBack, confetti Play, TxtReaction = localized random of
  [Unbelievable!, Incredible!, Amazing!, Jackpot!, Insane!, Mind-blowing!, What a pull!, No way!, Wow!]. Hidden by HidePopup.
* `BackHomePopup`, `NotEnoughMoneyPopup`, `PopupNoInternet`, `DoneBoxCharmPopup` (inactive) – shared, not driven by this scene's logic.

### 2.15 Home.PopupCollectionBlindbag (level1 `UIManager/Popup/PopupCollectionBlindbag`)
Fields: `_backButton`=BtnBack, `_playButton`=BtnPlay ("+ Get Blind Bag"), `_blindBagCollection`=`CollectionBlindBag` (inactive root at (0,-0.7):
an identical CollectionSelector + 12 CollectionBoxes, no drag controller), `_homeController`, `_physics2DRaycaster`=GameHandle/MainCamera.
```
Opened from PopupIntroBlindbag.OnButtonCollectionClicked: PlaySound(click); GameSession.SetActiveCharacter(false);
   PopupIntroBlindbag.ShowVisual(false) (CanvasGroup alpha 0, no raycasts); ShowPopup<PopupCollectionBlindbag>()
OnInit: CollectionBlindBag.SetActive(false); wire buttons
OnShow: CollectionBlindBag.SetActive(true) (CollectionBox.Start shows owned items); HomeController.SetActive(false); raycaster.enabled = true
Back: click; (inter 'blind_bag_back_click'); SetActiveCharacter(true); HomeController on; Hide(); raycaster off;
      CollectionBlindBag off; PopupIntroBlindbag.ShowVisual(true)
Play: PlaySound(click); Haptic(4); (inter 'blind_bag_play_click') → buttons non-interactable; FlashIn(GameConfig.BlindbagScene) (level3)
```
Navigation Prev/Next works the same as in level4 (2.9).

### 2.16 RarityVisualConfig / RarityType / CharmUnlockData
* `RarityType`: Common 0, Rare 1, Epic 2, Legendary 3, Special 99. In this scene rarity only selects the paper card + glow (2.5).
  FullKeycap (the case) is always Special → no card, blue glow.
* `RarityVisualConfig.GetDataByRarity(r)` = `DataList.Find(x.Rarity == r)` (CircleGlow, Star, Panel sprites). The only instance is
  `ConfigLuckyWheel` (sharedassets1:846, rarities 0–3); not referenced by level4 code.
* `CharmUnlockData {id, unlockType (EUnlockType), unlockValue, isLocked=true}` – plain data class, not used by this scene.
* `CharmFlyToBasketBB`: subclass of ScoopGame.CharmFlyToBasket, only overrides `Initialize(): _imageScale=0.8, _imageScaleOnBasket=0.2`
  (ctor 0.6/0.1). Not called in level4 (its Content has scale 0).

---------------------------------------------------------------------------------------------------
## 3. Data / config

**Collection sets (BoxsetType value → scene page, case sprite, Decor1..5 that can drop [rarity with data_config_type=1]).**
Decor6+ exist in the scene/asset but cannot drop (GetRandomCollectionItemType returns only 0..5).

| type | page | FullKeycap (Special) id | D1 | D2 | D3 | D4 | D5 |
|---|---|---|---|---|---|---|---|
| 20 NatureFan | Collection_NatureFan | case_solid 45 | keycap_E_6 E | keycap_E_12 R | keycap_E_3 R | keycap_C_4 C | charm_wreath E |
| 21 SweetWorld | Collection_SweetWorld | case_boxcake 38 | keycap_C_7 S | keycap_R_3 S | keycap_C_8 C | keycap_R_4 R | gummy_1 R |
| 22 AnimalFriends | Collection_AnimalFriends | ic_case_carton 39 | keycap_cat S | keycap_E_10 S | keycap_E_4 R | keycap_R_5 S | charm_dragon E |
| 23 OceanFriends | Collection_OceanFriends | case_turtle 47 | keycap_turtle C | keycap_R_12 C | keycap_E_14 S | keycap_L_2 R | charm_snaill E |
| 24 SpaceTime | Collection_SpaceTime | case_ufo 48 | keycap_ufo E | keycap_E_7 C | keycap_L_23 C | keycap_R_11 R | keycap_ufo L |
| 25 AdventureNow | Collection_AdventureNow | case_chest 46 | keycap_E_1 E | keycap_R_13 S | keycap_R_14 R | keycap_E_2 R | charm_wheel E |
| 26 FashionPop | Collection_FashionPop | case_shoebox 44 | keycap_R_19 E | keycap_R_29 R | charm_cap E | charm_glasses R | charm_socks E |
| 27 FastFood | Collection_FastFood | case_fishbox 42 | keycap_meatball S | keycap_fish S | keycap_C_12 C | keycap_C_11 S | charm_sauce E |
| 28 FruitParty | Collection_FruitParty | case_durian 41 | keycap_durian L | keycap_E_18 R | keycap_E_16 R | keycap_E_17 L | charm_cherry R |
| 29 GadgetBox | Collection_GadgetBox | case_laptop 43 | keycap_C_18 R | keycap_C_19 R | keycap_R_22 E | keycap_R_21 E | charm_headset E |
| 30 KawaiiLand | Collection_KawaiiLand | case_bento 12 | keycap_R_17 E | keycap_R_16 C | keycap_C_15 R | keycap_R_18 S | charm_lucky_cat L |
| 31 CozyKitchen | Collection_CozyKitchen | case_cooker 40 | keycap_rice R | keycap_R_25 E | keycap_R_24 E | keycap_R_23 E | charm_sponge R |

(C/R/E/L/S = Common/Rare/Epic/Legendary/Special; S → no paper card. Full id lists incl. ID_CachedAB and Decor6–9 are in so.json `:14399`.
Ids are clicker ids: case → `DataUser.UnlockClickerBase(id)`, decor → `UnlockClickerDecor(id)`.)

**Probabilities per bag:** item type: FullKeycap vs Decor with weights Current=[21,79] (rebalanced each pull, 2.2); decor slot uniform 1..5;
collection uniform over 12; lucky 31/101. Bag skin (`ConfigBlindBagVisual` ids 0..11: nature, sweet, animal, ocean, space, adventure,
fashion, fast_food, fruit, gadget, kawaii, kitchen) is cosmetic only.

**Money:** duplicate sell price FullKeycap 200–300, Decor 50–100 (inclusive), paid at 20 % via "Trade" (100 % via hidden ad button).
Session reward: Earnings 500 + Tips 100 = 600 coins ("No thanks"), 1200 with "x2 Reward" (free in the port).

**Saves (when):**
* `BlindbagCollectionData` (`{BoxsetDataSave:[{BoxsetType, ItemTypes[]}]}`): `Unlock` + `SaveData()` on every successful drop.
* `DataUser.UnlockedClickerBase / UnlockedClickerDecor`: all pulled ids, when the unbox step ends (UpdateUnlockedItemData).
* `DataUser.Money` via MoneyManager.CollectMoney (AutoSell, completion popup).
* `DataSaveUser.BlindbagPlayTime++` on completion popup show; `ClickerRewardClaimCount = min(+1,4)` on "No thanks";
  `IsDoneTutorialBlindBag = true` on either completion button.
* `BlindbagCollectionAsset.CurrentProbabilities` – in-memory only.

---------------------------------------------------------------------------------------------------
## 4. Tutorial / first time
`TutorialBlindBag` (`Tutorial`, `_tutorialUnbox` = Gameplay/OpenBag/BlindBoxTray/TutorialUnbox; child hand `handtap` with DOTweenAnimation:
local move to (2.5,-0.62), 1 s OutSine, Yoyo infinite). `_canTutorial = !DataSaveUser.IsDoneTutorialBlindBag`.
* `ShowTutorialUnbox(target, show)`: hide; if `_canTutorial && show`: move hand root to `target.position` and activate.
  Called 1.0 s after AutoSpawnBlindBox with the first spawned bag (index 0 – note: that bag is the *last* one to jump in, so the hand
  is placed where it lands only if it already landed; original behaviour), hidden on any bag tap.
* While the tutorial is not done the Home button in ScreenInGame is hidden (2.6). The flag is set when the completion popup is closed.
* No other first-time logic in this scene.

---------------------------------------------------------------------------------------------------
## 5. Implementation checklist
1. Static `bagIdList` filled by level3 purchase; level4 Start → FadeOut, hide character, music volume 0.4, step A.
2. Per bag id: roll item (pity weights [21,79]/[85,15], Decor1–5 only, uniform set, rarity lookup), roll lucky (≤30 of 0..100), spawn
   bag below screen at random pos/rot with skin, register item in cache/duplicate lists and in case/decor id lists.
3. Pop bags in: every 0.1 s last-spawned-first DOJump into UnboxZone (power 3, 0.5 s, delay 0.15), sound 17 + vibrate, enable click on land.
   Tutorial hand on bag 0 after 1 s.
4. Bag tap: centre (0,-1.5,-5)/scale 1.5/rot 0 in 0.5 s, overlay to 0.95; crack sounds 16+18, spine `bag_open`; +1 s glow (rarity sprite,
   scale 0→1 OutBack 1 s), Wow popup (lucky variant), spine alpha →0 in 0.25 s, paper card up to local y 3 (0.3 s); lucky → sound 19,
   extra bag (jumps in after 1.5 s), card split; +1.5 s hide popup/overlay/glow, charm DOLocalJump onto PlateHoldResult, card scale 0.
5. 2 s after each charm lands: if all bags opened (once) → unlock clicker ids, hide unbox UI/chat/live, transition to step B.
6. Step B: AutoSellPopup if any duplicates (rows grouped by sprite with xN, total, Trade = 20 %); hide Home button; spawn one draggable per
   new item on 12 plate points (rot −45..44, scale 0.7, sprite fitted to 4×4); if none → completion popup immediately.
7. Drag: pick → rotate 0/scale 1 (0.1 s), sound 16, parent FocusLayer, offset +2 Y, selector jumps to the item's set (pivot −idx·17 at 60 u/s
   OutQuad), target slot blinks alpha 0↔0.8 (0.5 s yoyo); nav arrows disabled. Drop < 1.8 units from slot → vibrate, compliment
   (random of 4 sprites + voice) , sound 16, save unlock, slot shown opaque (case also shows CaseBigFront), item hidden; else
   OnDragEnd (stop blink, arrows on). Item always snaps back with scale pop From 0.5× (0.1 s OutBack).
8. Last item placed → 2 s → show all plate items again → completion popup (hide CollectionLayer, block screen, chat off).
9. Completion popup: confetti + sound 48, staggered OutBack pops (0, 0.75, 1.0, 1.5 s), +500/+100, BlindbagPlayTime++, XP;
   buttons → +600 / +1200 coins, tutorial done, BackFromGameMode=2, FlashIn Home.
10. Prev/Next arrows (click sound, clamp 0..11, arrows hidden at ends, page dots); Home viewer popup reuses the same selector read-only.
11. Set-complete showcase (ShowCompleteBoxset) and 6 s delay are unreachable with the original data (IsBoxsetCompleted needs 13 types);
    implement only if desired.
