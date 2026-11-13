# Writing game scripts for the Charm Master HTML port

Project: `C:/Users/Anhle/Claude-trợ lí/GamePulse Design System/export/gamepulse-pages/charm-master/`
(index.html loads js/engine.js, render.js, input.js, fx.js, game.js, ui.js, home.js, clicker.js, blindbag.js,
collection.js, dreamhouse.js, scoop.js, main.js). Served at http://localhost:8830 (`?scene=levelN` loads a scene directly,
bypassing the 11 s loading screen; no URL param = normal boot level0 → Home).

The engine instantiates the ORIGINAL Unity scenes/prefabs (data/levelN.json, data/sharedassetsN.assets.json) and renders
them like Unity (RectTransform layout, sorting, SortingGroup, SpriteMask, TMP text, Spine, particles). Your job is only
the GAME LOGIC: write JS classes named exactly like the Unity MonoBehaviour classes; the engine creates one instance per
component found in the scene/prefab and calls the lifecycle methods.

**Read these two finished files first — they are the reference patterns:** `js/dreamhouse.js` and `js/blindbag.js`,
plus `js/game.js` (core services). Don't edit engine.js/render.js/input.js/fx.js/game.js; if you truly need an engine
helper, add it at the top of YOUR file (e.g. `E.myHelper = ...`) and mention it in your final report.

## Script classes
```js
class Foo extends E.Behaviour {            // or E.ScreenBase / E.PopupBase (see game.js)
  awake() {} onEnable() {} start() {} update(dt) {} lateUpdate(dt) {} onDisable() {} onDestroy() {}
  // pointer handlers (UI graphics, or world colliders via Physics2DRaycaster-like dispatch):
  onPointerDown(ev) onPointerUp(ev) onPointerClick(ev) onBeginDrag(ev) onDrag(ev) onEndDrag(ev)
  // ev = {x,y (screen px, origin centre, y up), wx,wy (world), dx,dy, target}
}
E.scripts['Namespace.Foo'] = Foo;          // exact Unity full name
```
- `this.go` = the GameObject; `this.d` = serialized fields exactly as in the export (e.g. `this.d._price`).
- `this.ref('_field')` resolves a reference field → GameObject / component instance (for component refs: the script instance
  or a built-in component object like `{t:'Img'}`), sprite → `{sprite:key}`, SO → its data object, prefab → `{prefab:key}`.
  `this.refs('_list')` maps a list. `G.goOf(x)` → GameObject of a ref; `E.txtOf(x)` → Txt component; `G.btn(x)` → Btn.
- Other components' methods: whatever names YOU give them (other script classes are JS too). Unknown/unimplemented script
  classes are stubs `{t:'MB', cls, d}`.
- Lifecycle: awake/onEnable run when the object first becomes active in hierarchy (instantiate or setActive(true));
  start runs before the first update; onDisable when it goes inactive; destroy via `E.destroy(go)`.

## GameObject (E.GO)
`name, activeSelf, activeInHierarchy, setActive(b), parent, children, find('a/b'), findDeep(name), comp('Img'|'Txt'|'SR'|'Btn'|'CG'|'Spine'|'Box'|'Namespace.Class'), compInChildren(t), compsInChildren(t), setParent(p, worldStays), setSiblingIndex(i), setAsLastSibling()`.
- World objects: local `x, y, z, rot (deg), sx, sy`; `worldPos()`, `setWorldPos(x,y)`, `worldMatrix()`.
- UI objects: `rt = [aminX,aminY,amaxX,amaxY, anchoredX, anchoredY, sizeDeltaX, sizeDeltaY, pivotX, pivotY]` (mutate rt[4]/rt[5] for anchoredPosition), `rect.w/h` after layout, `rot, sx, sy`.
- Built-in components (plain objects): `Img {sp: spriteKey, color:[r,g,b,a], fa (fill amount), it (type), enabled}`,
  `SR {sp, color, o (sorting order), fx, fy, enabled}`, `Txt {text, color, fs}`, `CG {alpha, ia, br}`, `Btn {onClick: [fns], interactable}`,
  `Spine {ready, skeleton, state, color, skin}`, colliders `Box {sz, of, enabled}`, `Circle {r,of}`, `Poly {pts}`, `SG {o}`, `Raw {tex, uv}`.
- Sprites are keys `"file:pathId"`; `E.spriteByName('name')` → key. `E.D.names[key]` → asset name.

## Engine services
- `E.instantiate(key, parent)` / `E.spawn(refOrKey, parent)` (returns the component when the ref pointed at a component) / `E.destroy(go)` / `E.newGO(name, parent, ui)`.
- Tweens: `E.tween({dur, delay, ease, loops(-1), yoyo, owner, update(v), done})`, `E.moveTo(go,x,y,dur,o)` (anchored pos for UI, local for world),
  `E.moveWorld`, `E.scaleTo(go, s|[sx,sy], dur, o)`, `E.rotTo`, `E.fadeTo(comp, a, dur)`, `E.punchScale(go, amt, dur)`, `E.jumpWorld(go,x,y,power,dur,o)`,
  `E.after(sec, fn, owner)`, `await E.wait(sec, owner)`, `E.killOwner(obj)`; in a Behaviour `this.tween(...)`, `this.after(...)`, `this.kill()`.
  Eases: `E.ease.outBack/inBack/outQuad/inQuad/inOutQuad/inOutSine/outSine/linear/outCubic/inOutQuint/outBounce/...`; numeric DOTween ids also accepted.
- DOTweenAnimation components with autoPlay run automatically on enable.
- Spine: `E.spinePlay(spineComp, 'anim', loop, track=0, onDone)`, `E.spineAdd(c, anim, loop, delay)`, `E.spineSkin(c, 'skin')`, `E.spineAnims(c)`.
- Particles: `E.psPlay(go)` / `E.psStop(go)`; UI ParticleImage instances have `play()/stop()`.
- Input: `E.input.on((type, ev) => ...)` type ∈ down/move/up (returns handle, `E.input.off(h)`); `E.uiRaycast(x,y)` (non-null = pointer over UI);
  `E.overlapPointAll(wx,wy)` → [{c: collider, g: go}], `E.ptInCollider(c, go, wx, wy)`, `E.screenToWorld(x,y)`, `E.worldToScreen`.
- Camera: `E.mainCam.sz` (ortho size), `G.camCtl.setSize(size, clamp)`.
- Random: `E.rand(a,b)`, `E.randInt(a,b)` (b exclusive, like Unity Random.Range int), `E.pick(arr)`, `E.shuffle`.
- Sprite preloading: set `E.scenePreload.levelN = () => E.prefabSprites([prefabKeys...])` (returns Set; add icon sprite keys too)
  so prefab sprites are loaded before the scene shows.

## Game services (js/game.js, `const G = E.Game`)
- Save: `G.data()` → persistent object; `G.data().user` = DataUser fields (money, IsFirstGame, IsDoneTutorialBlindBag, Unlocked* lists, ...).
  Add your own sub-objects (e.g. `G.data().clicker = {...}`) and call `G.save()` after changes. `G.pref(k, def)` / `G.setPref(k, v)` = PlayerPrefs.
- Money: `G.money()`, `G.addMoney(delta)` (UpdateMoney), `G.collectMoney(amount, coinCount, cb, spawnScreenXY)` (coin-fly), `G.notEnough()`.
  `G.moneyMgr` = current MoneyManager (`showUp()`, `backToParent()`, `showMoneyAddOn(v,d)`, `refresh()`).
- Sound: `G.sound(id)` (ESound int or name; returns handle with `.stop()`), `G.click()`, `E.playSound(id, {loop:true, vol})`, `G.music('bgm_home_1')`, `E.vibrate(ms)`.
- Scenes: `G.goto('Home'|'ModeClicker'|'BlindbagMinigame'|'BlindBagCollection'|'DreamHouse'|'ScoopGame')` (FlashIn transition),
  `G.transition.transition(cb)` (flash without scene change). `G.SCENES`.
- UI: `E.ui` = scene UIManager: `showScreen(cls)`, `getScreen(cls)`, `showPopup(cls)`, `hidePopup(cls)`, `getPopup(cls)`.
  Screens/popups: extend `E.ScreenBase` / `E.PopupBase` (onInit called once on first show; onShow/onHide; PopupBase animates `this.d._panel` 0→1 OutBack 0.36 s
  — override `panel()` / set `this.panelDur` / `this.noPanelAnim`). `G.onClick(ref, fn)` adds a button listener.
- Already implemented common classes: UIManager, MoneyManager, JobGame.CollectingCoin, Home.MoneyItem, CommentHandler (+`IsEnableToSpawnComment`, `userComment`),
  CommentControl, Livestream.LivestreamPanel, Livestream.ChatInput, NotEnoughMoneyPopup, Clicker.BackHomePopup, Scroller, CameraController,
  SimpleSceneTransition, KeycapEffect, LoadingControl, DDOL, AxisDrag2D, Jelly.ItemAnimator, all Blindbag.* and DreamHouse.* classes.
- Cross-scene state: `G.bagIdList` (bought blind-bag shelf ids, level3 → level4).

## Testing
You may load the page in the browser pane only if asked; otherwise just make sure the code is syntactically valid
(`node --check js/yourfile.js`) and consistent with the data (query data/*.json with python/node to confirm field names).
