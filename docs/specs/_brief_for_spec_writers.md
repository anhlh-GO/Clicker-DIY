# Reverse-engineering brief: "Clicker DIY: ASMR Charm Master" (Unity 6, IL2CPP arm64)

We are porting this Android game to HTML5 so it plays the same as the original. The rendering engine is done
(it loads the exported Unity scenes/prefabs and draws them faithfully). What we need from you is the GAME LOGIC
of one area, written as an implementation spec that a JS developer can follow without reading assembly.

Root folder (call it S): C:/Users/Anhle/AppData/Local/Temp/claude/b2178cc500e86cee/330525c1-2deb-45c6-aa8c-2a193c14e422/scratchpad

## Inputs
- `S/dis/<Namespace.Class>.s` — ARM64 disassembly of every method of that class (nested/compiler classes such as
  `<Method>d__12` (coroutines / async UniTask state machines) and `<>c__DisplayClass` (lambdas) are in the same file
  as their root class). Each file starts with the field list (`#   field name type off=0x..`).
  Annotations at line ends:
  - after `bl`/`b`: callee `Class::Method` (e.g. `DG.Tweening.ShortcutExtensions::DOScale`, `UnityEngine.GameObject::SetActive`).
    `fn_xxxx` = unnamed runtime helper (allocation, write barrier, null-check throw) — ignore.
  - `.fieldName` = instance field accessed at that offset for this class (only for x0/x19/x20/x21-based loads, may be wrong
    when the register holds another object — use judgement).
  - `T:Type` = class metadata (often for `new`/static access), `M:Class::Method` = method ref (delegate / lambda target),
    `MS:...` = generic method instance, `F:Class.field` = static field ref, `S:'text'` = string literal.
  - float constants: `fmov s0, #1.0` or `ldr s1, [x8, #..]` with note `[addr]=... f=a,b` (first f is the float).
  - Calling convention: x0 = this / first arg, x1.. = args, s0.. = float args; `w1 = #0x22` → int 34 etc.
  - Enum int values: `S/enums.json` (Assembly-CSharp enums incl. `Framework.ESound` sound ids).
  - DOTween Ease ids: Linear=1, InSine 2, OutSine 3, InOutSine 4, InQuad 5, OutQuad 6, InOutQuad 7, InCubic 8, OutCubic 9,
    InOutCubic 10, ..., InBack 26, OutBack 27, InOutBack 28, InBounce 29, OutBounce 30. LoopType Restart 0, Yoyo 1.
- `S/dump/levelN.txt` — scene hierarchy (indent = child; leading `-` = inactive; `(x,y)` local position;
  components listed; `SR(sprite oN)` = SpriteRenderer with sprite name and sorting order; `Img(sprite)` UI Image;
  `Txt('...')` TMP text). Scenes: level0 Loading, level1 Home, level2 ModeClicker, level3 BlindbagMinigame,
  level4 BlindBagCollection, level5 DreamHouse, level6 ScoopGame. `S/dump/sharedassets0.assets.txt` and
  `S/dump/resources.assets.txt` = prefabs.
- `S/out/data/levelN.json` / `sharedassets0.assets.json` — full exported data incl. each MonoBehaviour's serialized fields
  (`{"t":"MB","cls":"Clicker.PrinterMachine","d":{...}}`); references are strings "file:pathId". `S/out/data/so.json` =
  ScriptableObject configs (prices, item lists, rewards...). `S/out/data/names.json` maps "file:pathId" → asset name.
  Use python/grep to query these JSONs rather than reading them whole (they are MBs).
- `S/classes.json` (all classes, fields, types) and `S/methods.json` (class → [name, addr, return, params]).

## How to work
- Do NOT read whole big .s files top to bottom; grep for `^## ` to list methods, then read the gameplay-relevant ones
  (Awake/Start/OnEnable/Init/Show/Update/OnClick*/On*Drag/coroutines). Skip ads (AdsManager/ShowInter/ShowReward just
  means "an ad would play here" → treat reward-ad buttons as free rewards), analytics, Firebase, tracking, IAP.
- Cross-check with the scene data: which GameObjects the fields point to, initial active states, positions, configured
  numbers. Name GameObjects by their hierarchy path so the JS dev can find them.
- When something is a guess say "(inferred)". Prefer exact numbers (durations, offsets, eases, prices, counts, sound ids).

## Output
Write ONE markdown file (path given in your task) with:
1. Overview of the mode/feature and how the player moves through it (entry → steps → exit), including which scene loads.
2. Per class: responsibility, serialized fields that matter (with what they point to), and method-by-method behaviour
   in plain pseudo-code: conditions, state changes, tweens (target, end value, duration, ease, delay, loops), spine
   animation names, sounds (ESound name), vibration, particles, which UI shows/hides, events fired/listened.
3. Data/config: numbers from so.json/scene data that drive the mode (prices, unlock rules, reward amounts, counts),
   and what is saved (PlayerPrefs keys / save fields) and when.
4. Tutorial / first-time behaviour.
5. A short "implementation checklist" at the end.
Keep it dense and precise; aim for completeness of gameplay behaviour over prose. Final message: just the output path
and a 5-line summary.
