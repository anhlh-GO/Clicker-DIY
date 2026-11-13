# Clicker DIY: ASMR Charm Master — HTML5 port

Web remake of the Android game *Clicker DIY: ASMR Charm Master* (v0.6), rebuilt from the original Unity build's assets
(sprites, Spine 4.2 animations, audio, scene/prefab layouts and configs). All 7 scenes are playable:
Loading, Home (+ daily login / tasks / online rewards / lucky wheel / decor / settings), Clicker DIY (case → 3D printer →
switches → keycaps → decor → keychain → assembly → livestream clicking), Blind Bag supermarket, Blind Bag collection,
Dream House and Lucky Scoop. Ads are replaced by instant rewards; IAP is disabled.

- **Play on the web:** https://anhlh-go.github.io/Clicker-DIY/
- **Android APK:** [Releases → latest](https://github.com/anhlh-GO/Clicker-DIY/releases/tag/latest) (`Clicker-DIY.apk`, built by GitHub Actions).
- Dev: serve the folder with any static server; `?scene=level1`..`level6` opens a scene directly.

Layout: `js/engine.js` `render.js` `input.js` `fx.js` = a small Unity-scene runtime on Canvas2D;
`js/game.js` core services; one file per mode; `data/` exported scenes/configs; `assets/` textures, Spine, audio, fonts;
`android/` WebView wrapper; `tools/` the Python exporters (UnityPy + IL2CPP metadata v39 readers) used to extract the data.
