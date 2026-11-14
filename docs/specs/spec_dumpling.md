# Spec: Dumpling Idol Livestream / Unbox gameplay

Source: `com.noc.dumpling.idol.livestream.ASMR` (Unity 6000.0.59, IL2CPP metadata v31). Everything below was read from the arm64 disassembly of `libil2cpp.so` plus serialized prefab / ScriptableObject data.

**Where things are**
- Annotated condensed disassembly: `docs/reverse/bf/disasm_livestream.txt`.
- Prefab trees: `docs/reverse/bf/LivestreamView.txt`, `PayView.txt`, `MainShopView.txt`.
- Data: `data/bf_pack.json` (`so`, `db`, `strings`, `audio`).

**Conventions**
- **Tweens are DOTween.** "OutQuad" etc. are DOTween `Ease` values. A tween with no `SetEase` uses the DOTween default ease (OutQuad).
- **Positions** are `anchoredPosition` in canvas units of a 1080-wide reference canvas, unless stated otherwise.
- **Notation:**
  - `Seq{ A ; B | C }`: `;` = Append, `|` = Join (runs together with the previous step), `@t` = Insert at time t.
  - `Punch(v, d, vib, el)` = DOPunchX(punch, duration, vibrato, elasticity).
  - `Shake(d, s, vib, rnd)` = DOShakeX(duration, strength, vibrato, randomness).
- **Confidence marks:**
  - **[≈]** = value or flow read with some register ambiguity. It is a best reading, not 100% certain.
  - **[?]** = not determined.

---

## 0. Data that drives the feature

### LivestreamConfig (bf:3584)

| field | value | used by |
|---|---|---|
| `_missingRates` | [20,25,30,40,50,55,60,70] | Roll: % chance to force an unowned dumpling, **indexed by ChestType** |
| `_tearDistance` | 120 | px of horizontal drag needed to tear the label |
| `_tapBeats` | 3 | taps before reveal |
| `_revealDismissDelay` | 0.3 s | wait after reveal before "tap to continue" is accepted |
| `_reactionTime` | 2.0 s | streamer face returns to idle after this |
| `_idleQuestionDelay` | 5 s | no input → streamer "curious" anim |
| `_completeLiveReward` | 200 | end-of-live coin reward (× ad multiplier) |
| `_newDumplingRewards` | [444,666,888,1111] | coins per **new** dumpling by rarity (Common, Rare, Epic, Legendary) |
| `_donateRewards` | [500,700,1000] | donate amount = random element |
| `_donateFirstDelay` | 3 s | |
| `_donateInterval` | (30,45) | `Random.Range(x,y)` s between donates |
| `_donateDuration` | 8 s | banner timer |
| `_donateMaxPerLive` | 2 | |
| `_adsMultipliers` | [2,3,4,5,4,3,2] | end popup pointer sweep |
| `_multiplierSweepTime` | 1.0 | |
| `_startViewers` | (300,600) | `Random.Range(x,y)` (int, upper bound exclusive) |
| `_viewersPerTick` | (5,60) | added each tick |
| `_viewerTickInterval` | 2.1 s | |
| `_countdownStep` | 0.75 s | 3-2-1-LIVE countdown |

### LivestreamArtLibrary (bf:2709)

**Boxes:** `_boxes[ChestType] = {Closed, ClosedNoLabel, Opened, Skin}`. Skins: Box_1, Box_2, Box_4, Box_5, Box_3, Box_6, Box_8, Box_7 for ChestType 0..7.

**Rooms and dumplings:**
- `_rooms`: Room → name and background.
- `_dumplings`: (Room, Id) → Sprite, spine skin (`BG_x/y` on spine `bf_Dumpling`), and shelf `Position` (normalized 0..1 in the room background).

**Sound clips** (bf_pack `audio`):

| field | clip |
|---|---|
| `_sfxTear` | **null** (no sound) |
| `_sfxTap` | **bf_button_click** |
| `_sfxOpen` | **bf_open_box** |
| `_sfxRare` | **bf_win** |
| `_sfxLand` | **bf_collect_coin** |

**Rarity tables:**

| | Common | Rare | Epic | Legendary |
|---|---|---|---|---|
| `_rarityNames` | Common | Rare | Epic | Mythic |
| `_rarityColors` (glow/rays tint) | (1,.84,.89) | (.56,.83,1) | (.76,.66,.96) | (1,.89,.48) |
| `_revealColors` | white | (.55,.8,1) | (1,.87,.35) | white |
| `_rarityTextColors` | (.44,.16,.16) | (.13,.35,.63) | (.82,.41,.22) | (.35,.19,.56) |

**FX sprites:** `_fxRays`, `_fxRaysMythic`, `_fxLight`, `_fxSparkle`, `_fxStar`, `_boxLid`, `_fxConfetti`.

**Getters with fallbacks** in UnboxStageView:
- Sparkle sprite = `_fxSparkle`, else the box image sprite.
- Star sprite = `_fxStar`, else the sparkle sprite.
- Light sprite = `_fxLight`, else the label sprite.

**Other fields:**
- `_handSkeleton` = Hand_Ctrl spine, plus `_handMaterial`.
- `_emotes` = **[] (empty)**, so `BurstEmotes` shows nothing in this build.
- `_donate` = DonateArt (Phone, Bar, TimerRing, Close, Coin, ClaimButton, AdsIcon, Font, materials, Avatars[2]).

### Enums
- **RarityType:** None -1, Common 0, Rare 1, Epic 2, Legendary 3 (shown as "Mythic").
- **ChestType:** 0 Common, 1 Silver, 2 Gold, 3 Platinum, 4 Diamond, 5 Epic, 6 Legendary, 7 Mythic.
- **RoomType:** 0 CuteDumpling, 1 RibbonPrincess, 2 Mermaid, 3 Glitter, 4 Flower, 5 Dog, 6 Fruit, 7 Rainbow, 8 MushroomForest, 9..12 …
- **CommentCategory** (live chat): OnBegin 0, OpenCommon 1, OpenRare 2, OpenEpic 3, OpenMythic 4, OpenDuplicate 5.
- **UnboxStageView.InputMode:** None 0, Tear 1, Tap 2.

### Strings
| key | text |
|---|---|
| `livestream.hint_swipe` | "Swipe to tear" |
| `livestream.hint_tap` | "Tap Tap Tap" |
| `livestream.countdown_go` | "LIVE!" |
| `livestream.start_live` | "Start Live" |
| `livestream.mythic_banner` | "MYTHIC!!!" |
| `livestream.duplicate` | "{0} - Duplicate" |
| `livestream.gift` | "I have a gift" |

### Haptics
`IHapticManager` slots: 0 Light, 1 Medium, 2 Heavy.

---

## 1. NK.UnboxStageView (the full-screen unbox overlay)

### 1.1 Prefab layout
Node `UnboxStage` (CanvasGroup + Image) sits in LivestreamView and stretches full screen. `_dimAlpha` = 0.88.

| child | anchoredPos | size | notes |
|---|---|---|---|
| Image (`_dim`) | stretch | | black dim |
| Glow (`_glow`) | (0,125) | 900×900 | rays |
| Box (`_boxRoot`) | (0,60) | 640×640 | contains Body (`_boxImage`), Label (`_labelImage`, full-rect overlay), BoxSkeleton (spine `bf_Dumpling_Box`) |
| Dumpling (`_dumplingImage`) | (0,125) | 420×372 | child Skeleton (DumplingSkeletonView, `bf_Dumpling`, idle `idle_1`, happy `idle_3`); child NewTag (195,−15) 140×140 |
| NameCard | (0,−190) | 495×150 | Name text (fs46, y 22), Rarity text (fs32, y −32) |
| Banner | (0,640) | 1000×180 | "MYTHIC!!!" fs120 |
| Hint | (0,−205) | 490×88 | Text "Swipe to tear" fs50; Hand (−205,170) 110×110 |

**BoxSkeletonView**

| field | value |
|---|---|
| `_closedAnimation` | `CloseIdle_full` |
| `_tearAnimation` | `unbox_tag` |
| `_tearScrubTime` | 0.3 |
| `_idleAnimation` | `Close_box` |
| `_openAnimation` | `Open` |
| `_openEvent` | `"Open"` |
| `_openedIdleAnimation` | `OpenIdle` |

**Hand defaults** (prefab matches ctor):
- `_handTapAnimation` = "Click", `_handIdleAnimation` = "idle".
- `_handTapSpot` = (170,−70), `_handSwipeFrom` = (−230,−100), `_handSwipeTo` = (210,−100).

**Statics** (`.cctor`):
- `ShredColors` = [white, (1,.95,.85), (1,.78,.86), (.95,.36,.42), (1,.86,.45)].
- `ConfettiColors` = [(1,.85,.48), (1,.56,.72), (.56,.83,1), (.76,.66,.96), (.56,.9,.71), 6th entry copied from a stack temp, probably white [≈]].
- `HandSize` = (223.59, 235.39), `HandOrigin` = (38.76, 171.89).
- `ConfettiHalfHeight` is a compile-time const [?].

### 1.2 Awake (built in code)
1. Cache the root canvas.
2. Cache the rest positions `_boxPosition`, `_dumplingPosition`, `_cardPosition`, `_labelPosition`, and `_newTagRotation`. NewTag is moved to last sibling.
3. Create the extra images:
   - "Light" 1100×1100 at Glow's sibling index (`_light`).
   - 2× "Confetti" images 1064×801 (`_confetti[2]`).
   - "Fx" rect (an `UnboxFx` pool root) at the Dumpling's sibling index.
   - "Flash", a full-stretch image on top (`_flash`).
4. `Hide()`.

### 1.3 Setup(art, haptic, audio)
- Store the refs and call `DOTween.SetTweensCapacity`.
- `glow.sprite = art._fxRays`, preserveAspect.
- `EnsureHandSkeleton()`:
  - Under `_hand`, create a SkeletonGraphic "HandSkeleton" from `art._handSkeleton` / `_handMaterial`.
  - Anchors 0.5, `sizeDelta = HandSize`, `pivot = HandOrigin / HandSize`, so the fingertip is the pivot.
  - Disable the placeholder Image.
- `light.sprite` = LightSprite. Each confetti image sprite = `art._fxConfetti`.

### 1.4 Hide()
1. KillTweens, `fx.Clear()`, cancel any pending input, `inputMode = None`.
2. Stage: `canvasGroup.alpha = 0`, `blocksRaycasts = false`, `SetDim(0)`.
3. Box: back to `_boxPosition`, scale 1, rotation 0. `boxImage` color white and enabled. `animatedBox = false`, `BoxSkeleton.Hide()`.
4. Label: back to `_labelPosition`, rotation 0, scale 1, `Image.type = Simple`, fill 1, color white, active.
5. Dumpling: at `_dumplingPosition`, rotation 0, scale 1, inactive.
6. Glow (inactive, rotation 0), light (white, scale 1, inactive), flash (white, alpha 0) and both confetti images: reset and inactive.
7. NameCard: inactive, at `_cardPosition`, scale 1.
8. NewTag: rotation `_newTagRotation`, scale 1, inactive. Banner inactive.

### 1.5 OpenAsync(closed, closedNoLabel, boxSkin, from, token)
1. `Hide()`, then gameObject active, `canvasGroup.alpha = 1`, `blocksRaycasts = true`.
2. **Choose the box renderer:**
   - If `_boxSkeleton` exists and `BoxSkeletonView.Show(boxSkin)` succeeds, set `animatedBox = true`.
     - Show = set the skin, `ClearTracks`, `SetToSetupPose`, then `SetAnimation(0, "CloseIdle_full", loop)`.
   - Otherwise log a warning and use sprites.
   - `boxImage.enabled = !animatedBox`.
   - Sprites [≈]: `boxImage.sprite = closedNoLabel` (body without the label) and `labelImage.sprite = closed` (the full labelled box, overlaid). The label rect stretches over the body.
   - `labelImage` is active only when not animated.
3. **Dim:** `SetDim(0)`, then `dim.DOFade(0.88, 0.35)`.
4. **Fly in from the tray box.** If `from != null`, set `boxRoot.position = from.position`. Then `boxRoot.localScale = 0.45`, `localRotation = (0,0,−10°)`.
5. **Fly-in sequence** (linked to the box GO, then awaited):

   | step | target | tween | dur | ease |
   |---|---|---|---|---|
   | 1 | box | DOScale (0.52, 0.36, 1) | 0.08 | OutQuad |
   | 2 | box | DOJumpAnchorPos(`_boxPosition`, power 320, 1 jump) | 0.5 | OutQuad |
   | 2 \| | box | DOScale (0.92, 1.08, 1) | 0.5 | OutQuad |
   | 2 \| | box | DOLocalRotate (0,0,0) | 0.5 | OutBack |
   | 3 | box | DOScale (1.14, 0.86, 1) | 0.07 | OutQuad |
   | 4 | box | DOScale 1 | 0.45 | OutElastic |

6. **Landing:**
   - `fx.Burst(StarSprite, center = _boxPosition + (0,−230), count 8, dist 120..260, size 26..44, colors [white], 0.5 s)`.
   - **Haptic Light**.
   - `StartIdle()`.

### 1.6 Idle and tremble
- **StartIdle()** (box): `DOScale((1.03, 0.97, 1), 0.75).SetLoops(-1, Yoyo)`, InOutSine.
- **StopIdle()**: kill the tween and reset scale to 1.
- **StartTremble(power)** (between taps, called from the beat's OnComplete):

  ```
  p = clamp01(power)
  boxRoot.DOShakeAnchorPos(duration 1, strength = p*5 + 2, vibrato 40, randomness 90, snapping false, fadeOut false)
  SetLoops(-1)
  ```

### 1.7 Hints and hand

**ShowHint(text, swipe)**
1. Hint active, `DOKill`, `scale = 0.6`, then `DOScale(1, 0.35)` OutBack. `hintText.text = text`.
2. Kill `_handTween`. Hand active, scale 1, `PlayHand(swipe ? "idle" : "Click")`.
   - PlayHand = `SetAnimation(0, anim, loop=true)` on the hand spine.
3. **Swipe** (OpenBox uses text "Swipe to tear"):
   - Hand at `_boxPosition + (−230,−100)`.
   - Loop forever: `Seq{ interval 0.2 ; DOAnchorPos(_boxPosition + (210,−100), 0.7) InOutCubic ; interval 0.2 ; DOAnchorPos(back to from, 0.01) }`.
4. **Tap** ("Tap Tap Tap"):
   - Hand at `_boxPosition + (170,−70)`.
   - Loop forever: `Seq{ DOScale(0.75, 0.12) OutQuad ; DOScale(1, 0.25) OutBack ; interval 0.2 }`.

**HideHint()** kills the hand tween, hides the hand, `DOKill`s the hint and hides it.

### 1.8 Input (pointer handlers on the stage)
- **WaitForInput(mode, token):**
  - New UniTaskCompletionSource, `inputMode = mode`, `canvasGroup.blocksRaycasts = true`. Await, with external cancellation.
  - `WaitForTearAsync(distance)` sets `tearDirection = 0`, `tearDistance = max(distance, 1)` [≈], then `WaitForInput(Tear)`.
  - `WaitForTapAsync()` = `WaitForInput(Tap)`.
- **OnPointerDown:** stores `_lastPointer = ToLocal(position)`. In Tap mode it calls `CompleteInput()`, so a **tap completes on pointer down**.
- **CompleteInput():** `inputMode = None` and resolve the source.
- **OnDrag** (Tear mode only):

  ```
  dx = eventData.delta.x / canvas.scaleFactor;  ad = |dx|
  if ad > 0.01:
      if tearDirection == 0:                    // first real movement
          StopIdle(); boxRoot.DOKill()
          tearDirection = dx > 0 ? +1 : -1
          label.type = Filled, fillMethod = Horizontal,
              fillOrigin = (dir > 0 ? Left : Right) [≈], fillAmount = 1
          HideHint()
      tearProgress = min(1, tearProgress + ad / tearDistance)
      e = 1 - (1 - tearProgress)^2                // OutQuad
      if !animatedBox:
          label.fillAmount = 1 - 0.8*e
          label.color = (1,1,1, 1 - 0.55*e)
          label.anchoredPosition = _labelPosition + (0, 14*e)
          label.localRotation = Z(dir*3*e) degrees
      boxRoot.localRotation = Z(dir*4*e) degrees
      if tearProgress - lastCrackle >= 0.12:      // "crackle"
          lastCrackle = tearProgress
          w = boxRoot.rect.width * 0.85
          x = _boxPosition.x + dir*(w*0.8*e - 0.5*w)    // moves along the tear edge
          y = _boxPosition.y + Random.Range(80, 230)
          fx.Debris(null sprite, (x,y), count 3, size 14..24, ShredColors,
                    spread 160, jumpPower 200)
          fx.Burst(SparkleSprite, (x,y), 2, dist 30..100, size 30..50, [white], 0.4)
          Haptic Light
  if tearProgress >= 1: CompleteInput()
  ```

  - No sound plays while tearing: there is no PlaySfx on drag, and `_sfxTear` is null.
  - `BoxSkeletonView.SetTearProgress` (scrubbing `unbox_tag` with timeScale 0 at `trackTime = p * min(0.3, duration)`) exists but **is never called** in this build. When the box is animated, the drag only rotates the box.
- **OnEndDrag** (Tear mode, not complete, direction ≠ 0): `boxRoot.DOKill`, restore the label pose, then `boxRoot.DOPunchRotation((0,0,dir*8), 0.35, 8, 1)`. Progress is kept.

### 1.9 TearOffLabel() → returns seconds to wait
`dir = tearDirection == 0 ? +1 : tearDirection`.

**If animated:**
- `d = BoxSkeletonView.PlayTear()`:
  - `SetAnimation(0, "unbox_tag", false)` (or reuse it if it is current), `timeScale = 1`, then `AddAnimation(0, "Close_box", loop, 0)`.
  - Returns `animDuration − trackTime`.
- Clamp to `[0.3, 2.0]`.

**Otherwise (sprite label)**, the label flies off in a sequence linked to the label:
- `DOJumpAnchorPos(labelPos + (dir*650, −700), jumpPower 380, 1 jump, 0.8)` Linear
- `| DOLocalRotate((0,0,dir*240), 0.8, LocalAxisAdd)`
- `| label.DOFade(0, 0.8)` InQuad
- OnComplete: label inactive.
- `d = 0.5`.

**Then, in both cases:**
1. **Shred particles:** `fx.Debris(null, center = _boxPosition + (dir*160, 150), count 14, size 18..34, ShredColors, spread 380, jumpPower 420)`.
2. **Sparkles:** `fx.Burst(SparkleSprite, same center, 8, dist 80..220, size 40..70, [white, (1,.95,.7)], 0.55)`.
3. **Box recoil** (sequence; OnComplete = `StartIdle()` if not animated):
   - `DOScale((1.1, 0.9, 1), 0.07)`
   - `; DOScale(1, 0.4)` OutElastic
   - `| DOLocalRotate(0, 0.5)` OutElastic
4. **Haptic Medium**, then `PlaySfx(_sfxTear)` (null, so silent).
5. Return `d`.

### 1.10 PlayBeat(beat, beats): one per tap
```
p = clamp01(beat / max(beats,1))        // 1/3, 2/3, 1
StopIdle(); kill tremble; boxRoot.DOKill(); box → _boxPosition, rotation 0
angle = p*8 + 6   (deg);  sign = beat odd ? + : -      // alternates
hop   = p*80 + 50 (px)
```

**Sequence** (linked; OnComplete → `StartTremble(p)`):

| step | tween | dur | ease |
|---|---|---|---|
| 1 | DOScale (1.18, 0.8, 1) | 0.06 | OutQuad |
| 2 | DOAnchorPosY(boxPos.y + hop) | 0.16 | OutQuad |
| 2 \| | DOScale (0.9, 1.12, 1) | 0.16 | (default) |
| 2 \| | DOLocalRotate (0,0,sign*angle) | 0.16 | (default) |
| 3 | DOAnchorPosY(boxPos.y) | 0.13 | InQuad |
| 3 \| | DOLocalRotate 0 | 0.13 | |
| 3 \| | DOScale 1 | 0.13 | |
| 4 | DOScale (1.12, 0.88, 1) | 0.06 | |
| 5 | DOScale 1 | 0.3 | OutElastic |

**FX, sound and haptics in the same call:**
- `fx.Ring(LightSprite, _lastPointer, color (1,1,1,0.9) [≈], size 260, 0.45)`, a ring at the tap point.
- `fx.Burst(StarSprite, _boxPosition + (0,120), count 3*beat + 4, dist 160..320, size 24..48, [white, (1,.9,.6)], 0.6)`.
- **Light:** active at `_boxPosition`, then `DOFade(0.25 + 0.4p, 0.2)` and `light.rect.DOScale(0.55 + 0.35p, 0.3)` OutBack.
- If `beat >= beats`: `Shake(stage transform, 0.3, 16)`, i.e. `DOShakeAnchorPos(0.3, 16, vibrato 30, randomness 90, fadeOut true)`.
- **Haptic:** p ≥ 0.9 → Heavy, p ≥ 0.5 → Medium, otherwise Light. With 3 beats that gives Light, Medium, Heavy.
- **Sound:** `PlaySfx(_sfxTap)` = **bf_button_click** on every beat.

### 1.11 RevealAsync(opened, dumpling, dumplingSkin, dumplingTint, rarityColor, dumplingName, rarityName, isNew, rarityLevel)
- `hype = isNew ? rarityLevel : 0` [≈].
- At the start: StopIdle, kill tremble, reset the box pose.

**A. Open the box**

*Animated box:*
1. `light.DOFade(0.9, 0.4)`.
2. Await `BoxSkeletonView.PlayOpenAsync`:
   - `SetAnimation(0, "Open", false)`, `AddAnimation(0, "OpenIdle", loop)`.
   - Wait until the spine event named "Open" fires, or the track completes.
3. Then:
   - `Flash(alpha = rarityLevel > 1 ? 1.0 : 0.75, 0.4)`.
     - Flash = flash color (1,1,1,a), then `DOFade(0, d)` OutQuad.
   - **Haptic Heavy**, `PlaySfx(_sfxOpen)` = **bf_open_box**.
   - Sequence: `@0 box DOAnchorPosY(boxPos.y − 70, 0.6)` InOutSine, and `@0 BoxSkeleton.DOFade(0, 0.6)`.

*Sprite box:*
1. Awaited sequence:
   - `box DOShakeAnchorPos(0.4, 14, vibrato 40, rnd 90)`
   - `| DOScale(1.12, 0.4)` InQuad
   - `| light.DOFade(0.9, 0.4)`
2. Then the same `Flash` / Heavy haptic / **bf_open_box**.
3. `fx.FlyingLid(art._boxLid, pos = _boxPosition + (0,150), size 560×560, direction = Random.value < 0.5 ? −1 : +1)`.
4. `boxImage.sprite = opened`.
5. Sequence:
   - `DOScale((1.22, ?, 1), 0.07)`
   - `; DOScale(1, 0.5)` OutElastic
   - `@0.25 DOAnchorPosY(boxPos.y − 70, 0.6)` InOutSine
   - `@0.25 boxImage.DOFade(0, 0.6)`

**B. Glow rays**
- Sprite = `rarityLevel >= 3 ? _fxRaysMythic : _fxRays`. Color = rarityColor.
- Active, `scale 0.2`, `DOFade(isNew ? 0.6 : 0.3, 0.35)`, `DOScale(1 + 0.1*hype, 0.55)` OutBack.
- `_glowTween` = `DORotate((0,0,−360), 8 − hype seconds, FastBeyond360).SetLoops(-1)` Linear.

**C. Light**
- At `_dumplingPosition`. Tinted from rarityColor (lerp toward white) [≈], alpha `isNew ? 0.85 : ~0.5` [≈].
- Scale 0.9, then `_lightTween = DOScale(1.12, 0.7).SetLoops(-1, Yoyo)` InOutSine.

**D. Dumpling pop**
1. Dumpling image active with sprite and tint. If `_dumplingSkeleton.Show(skin)` succeeds: hide the Image, set the skeleton color to the tint, and `PlayHappy()` (anim `idle_3`).
2. Start at `_boxPosition + (0,60)`, scale 0.2, rotation 0.
3. **Sparkles:** `fx.Burst(SparkleSprite, _dumplingPosition, count = isNew ? 8*hype + 12 : 6, dist 180..(60*hype + 420), size 40..80, [white, rarityColor?, (1,.95,.7)], ~0.8 s)` [≈].
4. **Stars:** `fx.Burst(StarSprite, _dumplingPosition, count = isNew ? 4*hype + 8 : 3, dist 220..480, size 30..55, 1.0 s)`.
5. `BurstConfetti()` (see 1.12).
6. `fx.Confetti(count = isNew ? 20*rarityLevel + 20 : 15, ConfettiColors, 2.2 s)`.
7. If `isNew && rarityLevel >= 2` (Epic or Legendary): `Shake(stage, 0.25 + 0.12*r, 10 + 6*r)` and `PlaySfx(_sfxRare)` = **bf_win**.

**E. Mythic banner** (isNew and rarityLevel ≥ 3)
- Banner active, scale 0, rotation −8°.
- `Seq{ DOScale(1.15, ~0.3) OutBack | DOLocalRotate(0, ~0.3) ; DOScale(1, ~0.6) }` [≈ durations].
- `MythicEchoes(colors).Forget()`, which repeats 3 times:
  1. Delay 260 ms.
  2. If the dumpling is active: `Flash(0.5, 0.3)`.
  3. `fx.Burst(Sparkle, _dumplingPosition, 14, dist ?..520, size 40.., colors, 0.8)`.
  4. Haptic Medium.

**F. Name card**
- Active at `_cardPosition + (0,−140)`, scale 0.6.
- `nameText = dumplingName`.
- `rarityText = isNew ? rarityName : string.Format(Loc("livestream.duplicate"), rarityName)` ("Rare - Duplicate").
- Rarity text color = `GetRarityTextColor(rarity)`. Name text color = the same color lerped 45% toward black [≈].
- NewTag active = isNew.

**G. Main awaited sequence** (linked):

| step | target | tween | dur | ease |
|---|---|---|---|---|
| 1 | dumpling | DOAnchorPos(dumplingPos + (0,50)) | ≈0.3 | OutQuad |
| 1 \| | dumpling | DOScale (0.75, 1.3, 1) | ≈0.3 | OutQuad |
| 2 | dumpling | DOAnchorPos(dumplingPos) | 0.16 | InQuad |
| 2 \| | dumpling | DOScale (1.25, 0.78, 1) | 0.16 | |
| 3 | dumpling | DOScale 1 | ≈0.6 | OutElastic |
| @0.45 | name card | DOAnchorPos(_cardPosition) | 0.4 | OutBack |
| @0.45 | name card | DOScale 1 | 0.4 | OutBack |
| @t [?] | NEW tag (if isNew) | callback: tag active, scale 2.4, rotation = rest·Z(−25°); DOScale(1, 0.25) InQuad; DOLocalRotateQuaternion(rest, 0.25); **Haptic Light** | | |
| 4 | dumpling (duplicate only [≈]) | DOPunchRotation((0,0,12), 0.5, 6, 1) | | |

- After the await, if the NEW tag is active: `_dumplingIdleTween = newTag DOScale((1.04, 0.96, 1), 0.55).SetLoops(-1, Yoyo)` InOutSine.
- The method returns. The dumpling, card and rays stay on screen and wait for the player's tap (see 2.4).

### 1.12 BurstConfetti()
For each of the 2 confetti images, i = 0, 1 with `side = −1 / +1`:
1. DOKill, active, color white with alpha 0, at `_dumplingPosition`, scale 0.3, rotation 0.
2. Sequence:

   | step | tween | dur | ease |
   |---|---|---|---|
   | 1 | DOFade 1 | ≈0.15 | |
   | 1 \| | DOAnchorPos(dumplingPos + (side*?, +?)) | 0.45 | OutCubic |
   | 1 \| | DOScale(±1 mirrored by side) | 0.45 | OutBack |
   | 2 | DOAnchorPos(+(side*20, −ConfettiHalfHeight?)) | 2.6 | OutSine |
   | 2 \| | DOLocalRotate(Z ±4°) | 2.6 | InOutSine |
   | @1.6 | DOFade 0 | ≈1.4 | InQuad |

The exact offsets are [≈]. Visually, two big confetti sheets burst out left and right from the dumpling, then drift and fade for about 3 s.

### 1.13 FlyToAsync(target slot RectTransform, isNew)
1. HideHint. Kill the dumpling-idle, glow and light tweens.
2. Fade out over 0.25: glow, light and both confetti images.
3. `nameCard.DOScale(0, 0.2)` InBack. `newTag.DOScale(0, 0.15)` InBack. Banner hidden.
4. `dim.DOFade(0, 0.35)`. `boxImage.DOFade(0, 0.3)` (and BoxSkeleton DOFade(0, 0.3) if animated). `canvasGroup.blocksRaycasts = false`.
5. **Target scale** = slot world height / dumpling world height (`rect.height × lossyScale`, divided by localScale, guarded ≥ 0.01). `targetLocal` = slot position in fx-root space.
6. **Path:** `start` = dumpling world pos, `end` = slot world pos, `mid = lerp(start, end, 0.5) + up * 220 * canvas.scaleFactor` (a hump 220 px up).
7. **Sequence** (awaited):

   | step | tween | dur | ease |
   |---|---|---|---|
   | 1 | DOScale (1.2, 0.8, 1) | 0.1 | OutQuad |
   | 2 | DOPath([mid, end], CatmullRom, Full3D, resolution 10) | 0.62 | InOutQuad |
   | 2 \| | DOScale(targetScale) | 0.62 | InQuad |
   | 2 \| | DOLocalRotate((0,0, start.x > end.x ? −360 : +360), LocalAxisAdd) | 0.62 | InOutQuad |
   | 2 \| (if not new [≈]) | dumpling image / skeleton DOFade(≈0.35) | 0.62 | |

   - OnUpdate is a **star trail**: every 0.05 s, `fx.Burst(StarSprite, dumpling pos, 1, dist 0..40, size 22..36, [white], 0.4)`.
8. **Arrival:**
   1. Dumpling image hidden.
   2. `fx.Ring(LightSprite, targetLocal, (1,1,1,0.9), size = slot.rect.height * 2.2, 0.4)`.
   3. `fx.Burst(Sparkle, targetLocal, isNew ? 10 : 4, dist 0..160, size 26..48, [white, (1,.92,.6)], 0.5)`.
   4. **Haptic Light**, `PlaySfx(_sfxLand)` = **bf_collect_coin**.
   5. `Delay(350 ms)`, then `Hide()`.
   6. The presenter then calls `slot.SetOwned(true, tint)` and `PlayNew()` or `PlayDuplicate()` (2.4).

### 1.14 Order of interaction (confirmed)
**Open, then tear the label (swipe), then tap 3 times, then reveal, then tap to dismiss, then fly to the shelf.** The label is torn first, then the taps. See 2.4.

### 1.15 UnboxFx (pooled UI images under the "Fx" rect)
`Burst`, `Debris`, `Confetti`, `Ring`, `Float` and `FlyingLid` spawn Images from a pool and despawn them OnComplete. The signatures are as used above:
- `Burst(sprite, center, count, minDist, maxDist, sizeRange, colors, duration)`: radial burst.
- `Debris(sprite, center, count, sizeRange, colors, spread, jumpPower)`: DOJump shards.
- `Confetti(count, colors, duration)`: full-screen fall.
- `Ring(sprite, pos, color, size, duration)`: expanding fading ring.
- `Float(sprites, origin, count, size, height, interval)`: rising emotes.
- `FlyingLid(sprite, pos, size, direction)`.

The internal per-particle randomization (angles, rotations, eases) is in `disasm_livestream.txt` and was not fully transcribed [≈]. A faithful-looking approach:
- **Burst:** each particle moves to `center + dir * Random(min, max)` over `duration` with OutCubic, scales up then down, and fades.
- **Debris:** DOJump to `center + (Random(−spread, spread), −Random(…))` with `jumpPower`, spinning, and fades.

---

## 2. NK.LivestreamPresenter

### 2.1 Lifecycle
- **`StartLivestream(LivestreamDataSource(chestTypes))`** is called from Pay after checkout (see 5). It shows the Livestream modal.
- **`ViewWillEnter`:**
  1. `_rooms = unbox.GetPlayableRooms()`, `_room = GetDefaultRoom()`.
  2. `BuildRoom(view)`, `BuildTray(view)`.
  3. Reset `_results`, `_ended`, `_claimed`, HUD and coins.
  4. Stop the streamer question.
- **`ViewDidEnter`** → `ChooseRoomThenGoLive(view, token)`:
  1. Show the RoomSwitcher (arrows only if more than one room).
  2. Wait for **Start Live**.
  3. Persist `SelectedRoom = _room`, then `GoLive`.
- **BuildRoom:** shelf `Clear`, `SetBackground(art.GetBackground(room))`. For each dumpling of the room: `AddSlot(art.GetDumplingPosition)` and `slot.Setup(id, sprite, skin, tint, owned)`. Unowned slots are silhouettes (`_unknownColor` black, alpha 0.93).
- **BuildTray:**
  - `view.ClearBoxes()`, then for each ChestType in the data source: `view.AddBox(type, art.GetBox(type).Closed, OnBoxClicked)`.
  - AddBox instantiates `BoxTemplate` (100×100) into `Tray/Boxes`. Tray is the bottom 33% of the screen; Boxes has −60 padding. The layout group is in the prefab (its parameters were not exported) [?]. There are **no grid sizes in code**.
  - LivestreamBoxItem `SetInteractable(true)`:
    - `button.interactable = !IsOpened`.
    - Idle pulse `DOScale(1.06, 0.5).SetLoops(-1, Yoyo)` InOutSine, with `SetDelay(siblingIndex * 0.15)` (staggered).
  - `SetOpened(openedSprite)`: `IsOpened = true`, sprite = opened, color `_openedColor` (white), transition none.

### 2.2 GoLive(view, token)
1. `await view.PlayCountdownAsync(_countdownStep = 0.75)`:
   - Countdown text active. For each of "3", "2", "1", "LIVE!" (Loc `livestream.countdown_go`): set the text, `scale = 1.6`, `DOScale(1, 0.3)` OutBack.
   - Wait `step` seconds, or `step × 1.2` for "LIVE!". Then hide the text.
2. HUD `SetLive(true)`: the LIVE badge pulses `DOScale(1.1, 0.6).SetLoops(-1, Yoyo)` InOutSine.
3. `_viewers = Random.Range(300, 600)`, then `HUD.SetViewers` (format "N0" with ',' replaced by '.').
4. `emotion.PlayIdle()`.
5. `view.PlayStreamerHello()`: streamer spine `SetAnimation(0, "hello", false)` with mix 0.1, then `AddAnimation(0, "idle", loop, 0)`.
6. `view.PunchStreamer()`: `streamer.DOKill(true)`, then `DOPunchScale((0.05, 0.08, 0), 0.5, 5, 1)`.
7. `LoopBeginChat()`: `LiveChat.SendMessagesCategoryWithAction(OnBegin = 0, onDone = LoopBeginChat, delay 0)`. It loops "begin" chatter until replaced.
8. Dispatch `LivestreamStartedEvent(room, boxes)`.
9. `_liveCts` = linked token. Start `LiveLoop`, `IdleLoop` and `DonateLoop` (all with `.Forget()`).
10. `view.BurstEmotes(5)`. This is `UnboxFx.Float(art._emotes, …, interval 0.12)`; `_emotes` is empty, so nothing shows.
11. If the tray has boxes: `SetBoxesInteractable(true)`, then `CaptureScreenshotAsync().Forget()` (the screenshot is used by the end popup). Otherwise `EndLive()`.

### 2.3 Background loops
- **LiveLoop:** until cancelled, `viewers += Random.Range(5, 60)`, `HUD.SetViewers`, then `Delay(2.1 s)`.
- **IdleLoop:** `question = view.StreamerQuestion`, `lastInput = Time.unscaledTime`. Every frame (Yield):
  - If `Input.GetMouseButton(0)` or `touchCount >= 1`: `lastInput = now`, `question.StopAsking()`.
  - Else if not asking and `now − lastInput >= 5`: `question.Ask()`.
- **StreamerQuestionView:**
  - `Ask()`: `IsAsking = true`, streamer spine `SetAnimation(track 2, "curious", loop = true)` with mix `_mixDuration` (0).
  - `StopAsking()`: `SetEmptyAnimation(2, mix)`.
  - Awake adds a `CharacterTapCurious` component, gated on `IsAsking`.
  - No emotion or audio calls.
- **DonateLoop** (if `_donateMaxPerLive > 0`):
  ```
  await Delay(3)
  for i in 0..<2:
      await WaitUntil(!_busy && !_ended)                  // not while unboxing
      amount = _donateRewards[Random.Range(0, len)]       // 500 / 700 / 1000
      view.Donate.Show(amount, 8, onClaim: () => ClaimDonate(amount))
      await WaitUntil(!donate.IsShowing)
      await Delay(Random.Range(30, 45))
  ```
- **ClaimDonate(amount):**
  1. A rewarded ad (placement "LivestreamDonate"), skipped here.
  2. On reward, if not ended:
     - `donate.Complete()`.
     - `GrantCoins(amount, "live_donate")`.
     - `BurstEmotes(6)`.
     - `emotion.Play(HeartEyes = 1, phase FlyIn = 4)`.
     - `ReturnToIdleLater(2.0)`.
- **OnBoxClicked(item):** ignored while `_busy` or `_ended`. Otherwise `view.Donate.Hide()` (an active donate banner is dismissed) and `OpenBox(item, liveToken).Forget()`.

### 2.4 OpenBox(item, token): exact order
1. `_busy = true`, `view.SetBoxesInteractable(false)`.
2. `result = unbox.Roll(_room, item.Box)`. `boxArt = art.GetBox(item.Box)`.
   - If invalid: mark the item opened and end (see step 22).
3. `item.enabled = false` (the tray button).
4. `_emotionVersion++` (cancels a pending return-to-idle). `emotion.PlayOpenStart()` sets the face to **Happy**.
5. `view.PunchStreamer()`.
6. `await stage.OpenAsync(boxArt.Closed, boxArt.ClosedNoLabel, boxArt.Skin, item.Rect)` (1.5).
7. `stage.ShowHint(Loc("livestream.hint_swipe"), swipe: true)`.
8. `await stage.WaitForTearAsync(_tearDistance = 120)` (1.8).
9. `d = stage.TearOffLabel()`, `view.BurstEmotes(2)`, `await Delay(d)`.
10. `stage.ShowHint(Loc("livestream.hint_tap"), swipe: false)`.
11. **Tap loop:**
    ```
    for beat = 1..3: { await stage.WaitForTapAsync(); stage.PlayBeat(beat, 3); emotion.PlayBeat(beat) }
    ```
    Faces per beat: 1 unchanged (Happy), 2 Happy, 3 Sparkling.
12. `stage.HideHint()`.
13. `await stage.RevealAsync(boxArt.Opened, GetDumplingSprite(room, id), GetDumplingSkin, GetDumplingTint, GetRevealColor(rarity), GetDumplingName, GetRarityName(rarity), result.IsNew, result.Rarity)`.
14. `PlayRevealChat(rarity, isNew)`:
    - `LiveChat.StopMessages()`.
    - `SendMessagesCategoryWithAction(category, onDone = LoopBeginChat)`, where `category = isNew ? (Common 1, Rare 2, Epic 3, Legendary 4) : OpenDuplicate 5`.
15. `view.BurstEmotes(3)`.
16. `unbox.Commit(result)` (saves the dumpling as owned; also called for duplicates). `_results.Add(result)`. Dispatch `DumplingUnboxedEvent`.
17. `await Delay(_revealDismissDelay = 0.3)`, then **`await stage.WaitForTapAsync()`**: the player taps to continue.
18. `emotion.PlayReveal(result.Rarity, result.IsNew)`. This rolls a random face from EmotionTable (see 4).
19. `GrantCoins(GetNewDumplingReward(result), "live_new_dumpling")`:
    - 444 / 666 / 888 / 1111 if new, 0 if duplicate (nothing happens when the amount is 0).
    - `HUD.AddCoins(from, to)`:
      - DOVirtual.Float 0→1 over 0.8 OutCubic, counting the text up.
      - Coin parent `DOPunchScale(0.18, 0.6, 6, 1)`.
      - A "+{amount}" clone ("CoinGain", `_gainColor`) at 20 px right of the coin text, scale 0.5. Sequence: `DOScale(1.25, 0.15)` OutBack, then `DOScale(1, 0.1)`, joined with `DOAnchorPosY(+?, 1.0)` OutQuad, and `@0.7 DOFade(0, 0.4)`. Destroyed on complete.
20. If new: `view.PunchStreamer()`.
21. Fly to the shelf:
    - `item.enabled = true`, `item.SetOpened(boxArt.Opened)` (the tray box shows its opened sprite).
    - `slot = shelf.GetSlot(id)`. `await stage.FlyToAsync(slot.Rect, isNew)` (1.13).
    - `slot.SetOwned(true, tint)`, then:
      - `PlayNew()` = `DOPunchScale(0.35, 0.5, 6, 1)`;
      - `PlayDuplicate()` = `DOShakeAnchorPos(0.4, 12, 20, 90, false, true)`.
    - `ReturnToIdleLater(_reactionTime = 2.0).Forget()`: after 2 s, if no newer emotion, call `PlayIdle()`.
22. `finally`: `_busy = false`.
    - If every tray item `IsOpened`: `await Delay(0.7)`, then `EndLive()`.
    - Otherwise boxes are interactable again.

**Sounds in the presenter:** none. `_audioManager` is injected but never used for SFX. All unbox sounds come from UnboxStageView (§1). Coins, chat and countdown are silent.

### 2.5 EndLive / Claim
- **`EndLive()`:**
  1. `_ended = true`, StopLive (cancel `_liveCts`), stop chat, boxes not interactable, `Donate.Hide`, `StreamerQuestion.StopAsking`.
  2. Achievement check: `LivestreamCount` before vs after → a new achievement (or none).
  3. `newLevel = AddProfileExp()`.
  4. `_levelUp = LevelUpDataSource(newLevel, achievement)`.
  5. Show `EndLivestreamPopup(screenshot, coins, reward = 200, adsMultipliers, sweepTime 1.0)`.
- **`AddProfileExp()`:**
  - `before = Level`, `ProfileRuntime.AddLivestreamExp()` (+`PlayerLevelTable._expPerLivestream` = **3000 per finished live**, flat), save, `after = Level`.
  - Returns `after > before ? after : null`.
  - Exp is granted before claiming.
- **EndLivestreamPopup intro:**
  - `canvasGroup.alpha 0 → DOFade(1, 0.25)`.
  - Content `scale 0.85 → DOScale(1, 0.4)` OutBack.
  - Title `scale 0 → DOScale(1, 0.45)` OutBack, delay 0.15.
  - Ads button pulse `DOScale(1.06, 0.5)` yoyo InOutSine.
  - Aura: scale 0.6 → 1 over 0.5 OutBack, then `DORotate` loop over 14 s, Linear.
  - Aura glow: scale 0.92, `DOScale((1.08, 1.1), …)` yoyo InOutSine.
  - The pointer sweeps over `_multiplierLabels` x2…x6, range ±355, sweep time 1.0.
- **`Claim(reward, mult)`** (once):
  1. `GrantCoins(reward × mult, mult > 1 ? "live_end_ads" : "live_end")`, HUD coins.
  2. Dispatch `LivestreamEndedEvent{Room, OpenedCount, NewCount, Reward, Multiplier}`.
  3. `CloseAfterClaim`:
     - `await popup.PlayClaimAsync(from, to)`: pointer paused; coin text DOVirtual.Float over 0.7 OutCubic; coin icon `DOPunchScale(0.3, 0.7, 6, 1)`; Delay 1.1 s.
     - Hide the Livestream modal.
     - Hide the ShopMain view if it is open.
     - If `_levelUp.HasContent`, show `LevelUpPresenter`.
  - `ClaimWithAds` = rewarded ad, then `Claim(reward, multiplier at pointer)`.

### 2.6 Room switch (pre-live)
Built by `RoomSwitcherView.Create`:

| element | position | size |
|---|---|---|
| `Arrow_left` | (−470, 165) | 84×120 |
| `Arrow_right` | (475, 165) | 84×120 |
| `StartButton` | (0, −635) | 440×200 |

- The start button's text "Start Live" is fs72, white.
- There is no room-name label, and locked rooms are never listed.
- **Start button** pulses `DOScale(1.05, 0.6)` yoyo InOutSine while interactable.
- **Arrow press:** `DOKill(true)`, then `DOPunchScale(0.2, 0.25, 6, 1)`.
- **`SwitchRoom(step)`:**
  1. Ignored if there are fewer than 2 rooms or a switch is already running. Start is not interactable during the switch.
  2. `_room = rooms[(idx + step + n) % n]`.
  3. `await shelf.SlideAsync(step, rebuild: BuildRoom, RoomSlideTime = 0.35)`:
     - A clone of the shelf Background ("RoomLeaving") is put behind.
     - The room is rebuilt, and the real background is offset by `±width` (+ for Next).
     - The ghost moves to `rest ∓ width` while the background moves to `rest`, both 0.35 s InOutCubic.
  4. Re-enabling Start, destroying the ghost and resetting the flag are in finally blocks I could not see [≈].
- **Sounds:** none in code. Buttons may play a click through the UI framework [?].

### 2.7 Donate banner (NK.DonateBannerView, built in code by `Create(parent, DonateArt)`)
**Hierarchy** (exact rect values only partly transcribed):

```
Donate (1080 wide)
├── Phone (Phone sprite, rotated −10°)
│   └── Alert badge "!"
└── Banner (Bar sprite, ~870 wide)
    ├── Avatar (random of DonateArt.Avatars)
    ├── Timer (TimerRing, radial fill)
    ├── Text "I have a gift" (livestream.gift)
    ├── Coin icon + Amount text ("{0:0}", e.g. "700")
    ├── ClaimButton (ClaimButton sprite, ~582 wide, at y −80 [≈]; "Claim" text + AdsIcon)
    └── CloseButton
```

Colors: Pink (0.97,0.50,0.66), Red (0.91,0.23,0.29). `_ringTime` = 1.2.

**Show(amount, duration = 8, onClaim):**
1. Initialize, KillTweens, `IsShowing = true`. Active, alpha 1, raycasts on, claim not interactable.
2. Amount text set. Avatar = random of the Avatars list. `timer.fillAmount = 1`.
3. Phone active, scale 0, rotation 0. Banner hidden.
4. Sequence:
   1. `phone DOScale(1, 0.3)` OutBack.
   2. `phone DOShakeRotation(1.2, (0,0,18), vibrato 18, rnd 0)`. The phone "rings".
   3. Callback: banner active at `bannerPos + (−1100, 0)`.
   4. `banner DOAnchorPos(bannerPos, 0.45)` OutBack.
   5. Callback:
      - claim interactable;
      - claim pulse `DOScale(1.06, 0.5)` yoyo InOutSine;
      - `timer.DOFillAmount(0, max(duration, 0.1))` Linear, OnComplete → `Close(false)`.

**Other actions:**
- **OnClaimClicked:**
  1. Claim not interactable, pause the timer.
  2. `_resumeTween = DOVirtual.DelayedCall(2 s, resume timer + re-enable claim)`. This is a fallback if the ad never returns.
  3. Invoke onClaim.
- **Complete()** = `Close(true)`.
- **Close(claimed):**
  1. KillTweens, claim off, raycasts off.
  2. Sequence: `banner DOPunchScale(0.12, 0.35, 6, 1)`, then `canvasGroup DOFade(0, 0.3)` joined with `banner DOAnchorPos(bannerPos + (dx, 60), 0.3)` InQuad.
  3. OnComplete → `Hide()` (inactive, `IsShowing = false`).
- **CloseButton** → `Close(false)`.
- **Sounds:** none.

---

## 3. Room progression (DumplingUnboxService, levels)

### 3.1 Data meaning
- **RoomNameTable rows:** `roomType`, `sortIndex`, `turnUnlockLevel`, `exp`, `milestone`, `stats[[room, id, rarity, ratio]]`. The `exp` and `milestone` columns are unused by this feature.
- **ChestTable:** `rewards.type 5` is a RandomBag. The string `"(Common,0.8)_(Rare,0.2)_(Epic,0)_(Legendary,0)"` is the rarity weight list.
  - Chest1 has weights .8 / .2 / 0 / 0.
  - Chest2 to Chest8 have .5 / .2 / .3 / .1.

**Effective rooms.** A room counts only if it has a table row with dumplings and also has art; a dumpling needs an art sprite.

| Room | Unlock level | Dumplings (id:rarity:ratio) |
|---|---|---|
| 0 CuteDumpling | 1 (table 0, clamped to 1) | 0:R:.25, 1:C:.3, 2:C:.3, 3:E:.18, 4:R:.25, 5:L:.18, 7:E:.18 (id 6 has no art) |
| 1 RibbonPrincess | 1 | 0:L:.3, 1:C:.3, 2:L:.08, 3:E:.18, 4:C:.3, 5:R:.25, 6:R:.25, 7:E:.18 |
| 4 FlowerDumpling | 3 | 0:C:.3, 1:L:.25, 2:L:.08, 3:E:.15, 4:C:.3, 5:R:.25 |
| 6 FruitDumpling | 3 | 0:L:.3, 1:E:.15, 2:R:.25, 3:R:.25, 4:C:.3, 5:C:.3, 6:E:.15 (id 7 has no art) |

### 3.2 API
- **`GetRooms()`**: table rooms ordered by `sortIndex`, filtered to `HasRoomArt && dumplings > 0`. Result: [0, 1, 4, 6].
- **`GetUnlockLevel(r)`** = `max(turnUnlockLevel, 1)`.
- **`IsUnlocked(r)`** = `ProfileRuntime.Level >= GetUnlockLevel(r)`.
- **`IsOwned(r, id)`**: RoomRuntime has a character with that id.
- **`IsComplete(r)`**: all dumplings are owned.
- **`GetCurrentRoom()`**: the first unlocked room in sort order that is not complete. Otherwise the last unlocked room. Otherwise -1 (logs an error).
- **`GetPlayableRooms()`** = unlocked and not complete. If that is empty, `[GetCurrentRoom()]`.
- **`SelectedRoom`** = `PlayerPrefs "NK_SelectedRoom"` (default -1), saved when Start Live is pressed.
- **`GetDefaultRoom()`** = SelectedRoom if it is playable, else `GetCurrentRoom()`.
- **`Roll(room, box)`**:
  ```
  all = GetDumplings(room); if empty → Invalid
  rates  = ChestTable RandomBag weights for box (fallback [{Common,1}])
  rarity = weightedPick(rates).Rarity
  unowned = all.Where(!IsOwned)
  pool = (unowned.Count >= 1 && Random.value*100 < _missingRates[(int)box]) ? unowned : all
  pick = Pick(pool, rarity, rates)
  return UnboxResult(room, box, pick.id, pick.rarity, isNew: !IsOwned(room, pick.id))

  Pick(c, rarity, rates):
      m = c.Where(d.rarity == rarity)
      if m empty:
          total = Σ rates.weight
          fb = distinct rarities present in c, weight = max(weight(r), total*0.01)
          rarity = weightedPick(fb); m = c.Where(rarity)
      return Σ m.ratio > 0 ? weightedPick(m by ratio) : m[Random.Range(0, n)]
  ```
  - There is no separate "missing" outcome. A result is either **new** (unowned) or a **duplicate**.
  - `weightedPick` is assumed to be the standard cumulative pick [≈].
- **`GetNewDumplingReward(r)`** = `IsNew ? _newDumplingRewards[rarity] : 0`.
- **`GrantCoins(amount, source)`**: if `amount > 0`, add coins (material 0, location "Livestream") and save.
- **`UnboxResult`** = {Room, Box, CharacterId, Rarity, IsNew}. `IsValid` = `CharacterId >= 0`.

### 3.3 Player level
- **PlayerLevelTable** [lvl, exp]: [1,0], [2,3000], [3,9000], [4,18000], [5,27000], [6,36000], [7,45000], [8,57000], [9,69000], [10,81000], [11,96000], [12,111000], [13,126000], [14,141000], [15,159000].
- Each finished live gives +3000 exp. That means lv2 after 1 live, lv3 after 3 lives (unlocks Flower and Fruit), lv4 after 6.
- **LevelUp popup** (`Views.LevelUp`):
  - Title sprite = level-up or achievement title.
  - "Level {0}" (`common.level`).
  - Optional achievement group (title, icon, background).
  - The Next button closes it.
  - Its open and close animations come from the ktgame ModalView framework [?].

### 3.4 Room completion
- **No "room complete" or "new room unlocked" popup exists, and there is no auto-switch animation.**
- Rooms are recomputed in `ViewWillEnter` on the next live:
  - A completed room leaves the switcher list.
  - Rooms newly unlocked by a level-up appear.
  - If the saved room is complete, the default falls back to the next incomplete unlocked room.
- Within a live, remaining boxes keep rolling in the same room and give duplicates only.
- The only notice is the LevelUp popup after claiming.

---

## 4. Emotions

### 4.1 Enum and face animations
**EmotionType → face anim on track 1 of `Character_main`** (from `StreamerEmotionController._emotions`; every entry is Loop = true):

| id | name | face anim |
|---|---|---|
| -1 | None | (no change) |
| 0 | Idle | (clear face: `SetEmptyAnimation(1, 0.1)`) |
| 1 | HeartEyes | `happy_heart` |
| 2 | Sparkling | `eye_blinks` |
| 3 | Happy | `happy` |
| 4 | Teary | `tear_up` |
| 5 | Pouting | `phung_phiu` |
| 6 | CryingWaterfall | `cry` |
| 7 | AngryFire | `angry` |

### 4.2 Tracks and controller rules
- **Track 0 (body):** `idle` loop. GoLive plays `hello` once, then `idle`.
- **Track 1:** the face overlay, mix 0.1. It loops until the next emotion or Idle; there is no timer in the controller.
- **Track 2:** `curious` loop while the streamer "asks" after 5 s idle.
- `_phases` (body animations per phase) is **empty**, so emotions are face-only.
- `happy2` is unused.
- There is no separate eye-blink timer.

### 4.3 EmotionManager (dispatches `EmotionEvent{Phase, Emotion, Rarity, IsFirstOpen, Beat}`)

| call | result |
|---|---|
| `PlayIdle()` | Idle(0) |
| `PlayOpenStart()` | Happy(3) |
| `PlayBeat(b)` | `_beatEmotions[b−1]` = [None, Happy, Sparkling] |
| `PlayReveal(rarity, isNew)` | uniform random from EmotionTable |
| `Play(e, phase)` | e |
| `PlayFlyIn` | exists, unused |

**EmotionTable** (rarity → firstOpen = new dumpling / repeatOpen = duplicate):

| rarity | new dumpling | duplicate |
|---|---|---|
| Common | HeartEyes, Sparkling | Teary, Pouting, Crying, Angry |
| Rare | Happy, Sparkling | Teary, Happy, Crying, Pouting, Angry |
| Epic | HeartEyes, Happy, Sparkling | Crying, Teary, Pouting, Angry |
| Legendary (Mythic) | Happy, Sparkling, HeartEyes | Teary, Pouting, Crying, Happy |

### 4.4 Game event → emotion

| event | emotion |
|---|---|
| GoLive | Idle face + body `hello`→`idle` |
| Box opening starts | Happy |
| Tap beat 1 / 2 / 3 | (unchanged) / Happy / Sparkling |
| Reveal dismissed (player tap) | random from table (new vs duplicate, by rarity) |
| Donate claimed | HeartEyes |
| 2.0 s after the fly-in or the donate | Idle (cancelled if a newer emotion started: `_emotionVersion`) |
| 5 s without input | `curious` on track 2, until the next touch |

---

## 5. Sounds: complete list

| moment | clip | haptic |
|---|---|---|
| Box lands on stage (OpenAsync) | none | Light |
| Tearing (crackle shreds) | none | Light per crackle |
| Label torn off | `_sfxTear` = null (none) | Medium |
| Each tap beat | **bf_button_click** | Light / Medium / Heavy (beats 1 / 2 / 3) |
| Box opens (reveal) | **bf_open_box** | Heavy |
| NEW tag pops | none | Light |
| New Epic or Legendary dumpling | **bf_win** | (shake) |
| Mythic echoes ×3 | none | Medium ×3 |
| Dumpling lands on shelf | **bf_collect_coin** | Light |
| Countdown, chat, coins, donate, room switch, end popup | none in code | |
| Shop opens / closes | bf_HideView / bf_HideView (the open uses PlayExitClip, a quirk) | |
| Shop Back button | bf_button_click | |
| Bag lands in cart / cart revert | bf_button_click | |
| Pay opens / closes | bf_OpenView / bf_HideView | |
| Each box scanned (Pay) | **bf_scan** | Heavy |
| Pay confirm button | **bf_buydone** | Light |

`bf_opendoor` and `bf_transition` are not used by these classes. They belong to the LoadingGoShop transition, which was not analysed [?].

### Shop / Pay summary (Views.Shop, Views.ShopMain, Views.Pay)

**Shop**
- **Intro:** 8 blind-bag items, then Room, then Cart, then the Buy/labels. Each pops from scale 0 with an overshoot curve (≈OutBack) and alpha 0→1 over 0.4 s, staggered 0.05 s starting at 0.25 s.
- **Random idle shake:** every 3–6 s, 1–3 random bags do `DOPunchRotation((0,0,15), 0.5, 6, 0.5)`.
- **Tap a bag** (max 6 in the cart; toast `toast.cart_full`):
  1. A BagFlyItem copy jumps to the cart: `DOJump(power = max(3, dist*0.5), 1 jump, 0.6)` InQuad, scale 1→1.25 over 0.24 OutQuad, then →0.2 over 0.36 InBack, rotating −360 over 0.6.
  2. On landing, the cart slot appears: scale 1.2→1 over 0.4 OutBounce plus `PunchRotation(20°, 0.4, 7, 1)`.
  3. The cart does `PunchScale((0.08, −0.05), 0.35, 4, .5)` plus `ShakeRotation(0.35, 8°, 10)`, a UIStunExplosion2 FX plays, and **button_click** sounds.
- **Buy** is enabled at 4 or more bags.
- **Tap the cart** reverts the last bag: it flies back, the cart punches `(−0.06, 0.04)`, and **button_click** sounds.

**Pay**
- Opens by sliding up from the bottom (0.3 s QuarticOut) with **OpenView**.
- Drag each box onto the scanner: on begin drag `DOScale(1.15, 0.15)`.
- The laser `DOAnchorPosY` −260 → −390 over 0.9, yoyo InOutSine.
- **Entering the zone triggers the scan:** the box moves to the scanner centre in 0.3 s InQuad, scales 1.2 → 0.05, and rotates ±25°.
- **On scan:**
  - The receipt row pops 1.15→1 over 0.22 OutBack, and the total pops 1.25→1 over 0.22 OutBack.
  - Haptic Heavy and **scan**.
  - The machine squash/stretch: (1.04, .96) 0.08 → (.97, 1.04) 0.10 → 1 over 0.18 OutBounce, with the Y position −6 / +12 / 0.
- **After all boxes:** wait 0.45 s, then the green Next button appears.
- **Confirm:** **buydone**. Coins are subtracted, the Thank-you step shows, then 0.5 s later the Pay view hides (**HideView**) and `LivestreamPresenter.StartLivestream(chestTypes)` is called.

---

## 6. Not determined / caveats
- **Some UnboxStageView numbers are register-ambiguous** (marked [≈]):
  - durations reused from callee-saved registers in RevealAsync (dumpling pop ≈0.3 / 0.6, banner);
  - exact sparkle colors;
  - light tint;
  - BurstConfetti offsets;
  - the NEW-tag callback time;
  - whether the 12° punch-rotation is duplicate-only;
  - the dumpling fade value during the fly when the dumpling is not new.
- **UnboxFx internals** (per-particle randomization) were not transcribed. See `disasm_livestream.txt` (`NK.UnboxFx`).
- **Unused tear scrub:** `BoxSkeletonView.SetTearProgress` (scrubbing `unbox_tag`) is unused in this build. The animated box only rotates while dragging, and the tear animation plays at TearOffLabel.
- **Not exported:** the tray LayoutGroup parameters, and the LevelUp/End popups' framework transitions.
- **Not analysed:** the LoadingGoShop door transition (opendoor / transition sounds).
- **Finally-block cleanup** of `ChooseRoomThenGoLive`, `SwitchRoom` and `SlideAsync` is not visible in the disassembly. Re-enable the Start button and destroy the ghost background after the slide.
