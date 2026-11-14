# HANDOFF — Clicker DIY: ASMR Charm Master (bản HTML5)

Tài liệu bàn giao để tiếp tục dự án trên máy khác / phiên Claude khác.
**Claude: đọc hết file này trước, rồi đọc file spec của mode liên quan trong `docs/specs/` trước khi sửa logic.**

## 1. Dự án là gì
- Port HTML5 của game Android *Clicker DIY: ASMR Charm Master* bản **0.6** (`com.hp.clicker.diy.asmr.charm.master`),
  làm từ file gốc `Clicker+DIY_+ASMR+Charm+Master_0.6_APKPure.xapk` (212 MB, **không nằm trong repo** — chủ dự án giữ file này).
- Game gốc: Unity **6000.3.9f1**, IL2CPP arm64, metadata **v39**, URP 2D, Spine **4.2.43**, DOTween, TextMeshPro, project dùng linear colour space.
- Mục tiêu của chủ dự án: bản web giống bản gốc nhất có thể, dùng asset gốc, đầy đủ các mode, chạy mượt trên điện thoại.
- Repo: https://github.com/anhlh-GO/Clicker-DIY (nhánh `main`)
  - Web (GitHub Pages, `.github/workflows/pages.yml`): https://anhlh-go.github.io/Clicker-DIY/
  - APK (`.github/workflows/apk.yml`, build trên GitHub Actions vì máy dev không có Android SDK): release tag `latest` →
    https://github.com/anhlh-GO/Clicker-DIY/releases/download/latest/Clicker-DIY.apk
  - Mỗi lần push lên `main` đều tự build lại cả web lẫn APK. Log Actions cần đăng nhập mới xem được; `apk.yml` in lỗi Gradle ra
    dạng `::error::` annotation để đọc được qua API công khai `/repos/anhlh-GO/Clicker-DIY/check-runs/<job id>/annotations`.

## 2. Chạy thử ở máy
- Server tĩnh bất kỳ trỏ vào thư mục repo (vd. `npx serve .` hoặc `python -m http.server 8830`), mở `http://localhost:8830/`.
- `?scene=level0`..`level6` mở thẳng một scene (bỏ qua màn loading 11 s):
  level0 Loading · level1 Home · level2 ModeClicker · level3 BlindbagMinigame (siêu thị túi mù) · level4 BlindBagCollection (mở túi + xếp bộ sưu tập) · level5 DreamHouse · level6 ScoopGame.
- Save nằm ở `localStorage['charm-master-save-v1']` (xoá key này = chơi lại từ đầu).
- Ở máy cũ, launch config tên `charm-master` (port 8830) nằm trong `gamepulse-pages/.claude/launch.json`; máy mới cần tự tạo lại nếu dùng preview của app Claude.

## 3. Cấu trúc repo
```
index.html            trang game (manifest PWA + meta iOS, banner hướng dẫn "Thêm vào MH chính", window.BUILD để cache-bust)
manifest.webmanifest  web app (display standalone) + icons/
js/engine.js          runtime kiểu Unity: GameObject, instantiate scene/prefab từ data, Behaviour lifecycle, tween, DOTweenAnimation,
                      audio, save, localisation (E.tr / E.setLanguage)
js/render.js          layout RectTransform/Canvas/CanvasScaler, sorting + SortingGroup + SpriteMask, Image (simple/sliced/tiled/filled),
                      TMP text (outline/underlay từ material), Spine qua spine-webgl (canvas WebGL phụ + cache bitmap khi đứng yên)
js/input.js           raycast UI (chỉ canvas có GraphicRaycaster) + collider 2D, Button, ScrollRect, sự kiện drag
js/fx.js              ParticleSystem (Shuriken) + AssetKits ParticleImage (UI)
js/game.js            dịch vụ chung (E.Game = G): save, tiền + coin bay, chuyển scene (SimpleSceneTransition), UIManager/ScreenBase/PopupBase,
                      Loading, comment livestream, số người xem, MoneyManager, NotEnoughMoneyPopup...
js/home.js js/ui.js   Home + popup meta (điểm danh, nhiệm vụ, quà online, vòng quay, trang trí, cài đặt, ngôn ngữ)
js/clicker.js         mode Clicker DIY (level2) + kệ bộ sưu tập clicker ở Home
js/blindbag.js        siêu thị túi mù (level3) + Clicker.BackHomePopup dùng chung
js/collection.js      mở túi + bộ sưu tập (level4)
js/dreamhouse.js      Dream House (level5)
js/scoop.js           Lucky Scoop (level6, có mô phỏng vật lý 2D riêng)
js/main.js            khởi động, nạp data, vòng lặp game
data/                 scene/prefab đã trích (levelN.json, sharedassetsN.assets.json, resources.assets.json), so.json (ScriptableObject config),
                      sprites.json, names.json, enums.json, mats.json (material TMP), ps.json (particle), localize.json (9 ngôn ngữ)
assets/tex            1447 texture (webp) · assets/spine 12 bộ Spine 4.2 (json+atlas+webp, đã bỏ premultiply) · assets/audio 65 mp3 · assets/fonts
vendor/spine-webgl.js spine-webgl 4.2.43 (vendored để chạy offline trong APK)
android/              wrapper WebView (WebViewAssetLoader phục vụ assets/www qua https), CI copy web vào app/src/main/assets/www
tools/                script Python đã dùng để trích dữ liệu từ XAPK (xem mục 5)
docs/specs/           spec logic từng mode viết từ mã dịch ngược — NGUỒN SỰ THẬT về "game gốc làm gì"
docs/reverse/         dữ liệu tham chiếu thô từ file gốc (mục 4)
docs/ENGINE_API.md    hướng dẫn viết script game trên engine này (API E.* / G.*)
```
Quy ước script: class JS đặt tên đúng tên class Unity, đăng ký `E.scripts['Namespace.Class'] = Class`; engine tạo instance cho mọi
MonoBehaviour tìm thấy trong scene/prefab; `this.d` = field serialized gốc, `this.ref('_field')` resolve tham chiếu. Chi tiết: `docs/ENGINE_API.md`.

## 4. File gốc có gì (tóm tắt) và tra cứu ở đâu
- `docs/specs/spec_core.md` — boot/loading, chuyển scene, tiền (khởi đầu 200), coin bay, save model, âm thanh, comment livestream.
- `docs/specs/spec_home.md` — Home, nút/route, popup giới thiệu mode, điểm danh 7 ngày, nhiệm vụ ngày, quà online, vòng quay, trang trí.
- `docs/specs/spec_clicker.md` — Clicker: chọn khay → máy in 3D → switch → keycap+màu → charm → móc khoá → lắp ráp → livestream → thưởng.
- `docs/specs/spec_blindbag.md` — siêu thị túi mù (giá 12 loại túi, giỏ 5 ô, quét mã).
- `docs/specs/spec_collection.md` — mở túi (tỉ lệ, "lucky"), 12 bộ sưu tập, bán trùng, thưởng hoàn thành.
- `docs/specs/spec_dreamhouse.md` — 2 phòng (12/14 bước), 78 món đồ, giá.
- `docs/specs/spec_scoop.md` — Lucky Scoop (múc sao, hộp/thiệp, giao quà, thu nhập/tip).
- `docs/reverse/scene-trees/*.txt` — cây GameObject từng scene/prefab (dễ đọc: tên, vị trí, component, sprite, text).
- `docs/reverse/classes.json.gz` — mọi class C#: field, kiểu, attribute (đọc từ global-metadata v39).
- `docs/reverse/methods.json` — class → [tên method, địa chỉ trong libil2cpp.so, kiểu trả về, tham số].
- `docs/reverse/disasm.zip` — mã ARM64 đã chú thích của mọi class game (`dis/<Namespace.Class>.s`): sau `bl` là tên hàm được gọi,
  `.field` = field của class, `S:'...'` = chuỗi, `M:`/`T:`/`F:` = method/type/field metadata. Đầu mỗi file liệt kê field + offset.
- `docs/reverse/enums.json` (giá trị enum, vd. `Framework.ESound`), `scripts.txt` (danh sách MonoScript), `localize_full.csv` (bảng dịch gốc).
- `data/so.json` — toàn bộ config (giá, unlock, phần thưởng...) dạng JSON; tham chiếu là chuỗi `"file:pathId"`, `data/names.json` đổi sang tên asset.

## 5. Trích lại dữ liệu từ XAPK (chỉ khi cần)
Cần Python 3.12 với `UnityPy`, `capstone`, `pyelftools`, `Pillow`, `numpy`; `ffmpeg` cho âm thanh. Il2CppDumper **không** đọc được metadata v39 —
dùng các script tự viết trong `tools/`. Các script giả định thư mục làm việc `W/` có: `W/tools/` (copy từ repo), `W/charm/` (XAPK đã giải nén),
và ghi kết quả vào `W/` (`classes.json`, `methods.json`, `dump/`, `out/`). Từ `W/`:
```
mkdir -p charm/xapk && unzip <file.xapk> -d charm/xapk
unzip charm/xapk/com.hp.clicker.diy.asmr.charm.master.apk -d charm/base     # assets/bin/Data/data.unity3d, global-metadata.dat
unzip charm/xapk/config.arm64_v8a.apk -d charm/lib                          # lib/arm64-v8a/libil2cpp.so
python -I tools/elfreg.py charm/lib/lib/arm64-v8a/libil2cpp.so 17399 types.pkl   # 17399 = số TypeDefinition
python -I tools/codereg.py charm/lib/lib/arm64-v8a/libil2cpp.so mptrs.json
python -I tools/meta.py charm/base/assets/bin/Data/Managed/Metadata/global-metadata.dat types.pkl classes.json  # + methods.json, lits.json
python -I tools/il2prep.py <global-metadata.dat> <libil2cpp.so> sym.pkl
python -I tools/disall.py                                   # -> dis/*.s ; tools/dis64.py "Class::Method" để xem 1 hàm
D=charm/base/assets/bin/Data/data.unity3d
python -I tools/dump.py $D dump && python -I tools/names.py $D dump/names.json && python -I tools/dumpso.py $D dump/so.json
mkdir -p out/tex && python -I tools/extex.py $D out        # texture webp + texmeta.json
python -I tools/export.py                                   # -> out/data/*.json (định dạng engine dùng)
python -I tools/exspine.py $D out/spine ; python -I tools/exps.py $D out/data/ps.json ; python -I tools/exmat.py $D out/data/mats.json
python -I tools/enums.py <global-metadata.dat> enums.json ; python -I tools/exaudio.py $D wav   # rồi ffmpeg wav -> mp3
```
Ghi chú định dạng v39 (đã giải trong `meta.py`): TypeDefinition 76 byte, TypeIndex 2 byte, thứ tự byval, declaring, parent;
Image 36 byte `<IIHIHIiIII`; Field 10 byte. MonoBehaviour không có typetree → `mbread.py` đọc theo class layout
(bool căn 4 byte, Keyframe `ffffiff`, có đọc `m_Enabled`).

## 6. Quyết định & chỗ khác bản gốc (cố ý)
- Quảng cáo = nhận thưởng ngay; IAP tắt; rung = `navigator.vibrate` nhẹ.
- Home hiện **mọi** mode ngay từ đầu (bản gốc khoá sau 2 bước hướng dẫn) — theo yêu cầu chủ dự án.
- Nút Home luôn hiện trong mọi màn gameplay (bản gốc ẩn trong tutorial); Confirm "Quit game" về thẳng Home, không tự mở lại popup giới thiệu.
- Lớp phủ tối màu trơn được trộn theo công thức linear colour space (`1-(1-a)^(1/2.2)`) để giống độ tối bản gốc.
- Ngôn ngữ: 9 ngôn ngữ từ bảng gốc, mặc định theo ngôn ngữ máy; dịch lúc render text (`E.tr`). Ô cấp độ vẫn ghi "Level".
- Màn chào "Welcome Home!" của DreamHouse không hiện (bản gốc cũng không hiện do lỗi tham chiếu trong scene).

## 7. Lỗi engine đã sửa (đừng làm hỏng lại)
- Canvas lồng nhau mang render mode cũ → chỉ canvas world gốc không có camera mới bỏ qua raycast.
- World-space canvas: vị trí nằm ở `rt[4..5]`; viewport ScrollRect xuất ra 0×0 → tự kéo giãn.
- Graphic scale 0 không được nhận raycast; ref từ object scene bị nhân bản phải tra tiếp `E.sceneMap` qua `c2g`.
- Image Tiled vẽ lặp pattern (nền màn chuyển cảnh); 9-slice có viền phủ hết ảnh kéo giãn dải 1 px (không còn khe tối).
- Spine vẽ bằng WebGL (Home 12.6 → 0.9 ms/khung; siêu thị 33 → 2 ms) — đừng quay lại spine-canvas triangle rendering.

## 7b. Mode thêm: Dumpling (level7, `js/dumpling.js` + `js/dumpling_live.js`)
- Lấy **gameplay chính** của game NOC *Dumpling Idol Livestream ASMR* (`com.noc.dumpling.idol.livestream.ASMR`, file `BF_v3_*.apk`, Unity 6000.0,
  IL2CPP metadata v31, Addressables có TypeTree). Không lấy tính năng ngoài home của game đó (điểm danh, quà, shop trang phục, xoá QC, trang trí, gacha).
- Vào từ nút **Dumpling** ở Home (cột trái, dưới Dream House; `G.addDumplingHomeButton`). Xu dùng chung ví Clicker DIY; cấp/EXP riêng của mode.
- **Logic theo spec dịch ngược `docs/specs/spec_dumpling.md`** (disasm rút gọn: `docs/reverse/bf/disasm_livestream.txt`):
  - Shop: mua tối đa 6 túi, chỉ được thanh toán khi có ít nhất 4.
  - Pay: kéo hộp vào máy quét.
  - Livestream:
    - Chọn phòng, có hiệu ứng trượt khi đổi phòng.
    - Đếm ngược, người xem tăng dần, chat theo bộ câu CommentBot, câu hỏi "curious" sau 5 s không chạm.
    - Donate: tối đa 2 lần mỗi live, 500/700/1000 xu.
  - Mở hộp: hộp bay vào → **vuốt xé tem** → **chạm 3 nhịp** (nhảy, nghiêng, rung) → lộ dumpling (tia sáng, light, flash, confetti, banner Mythic)
    → chạm để tiếp → bay theo đường cong vào kệ phòng.
  - Biểu cảm streamer theo EmotionTable gốc (mới / trùng × độ hiếm). Âm thanh đúng clip gốc.
  - Kết thúc: popup thưởng 200 × x2..x5, +3000 EXP mỗi live, LevelUp.
- **Tiến trình phòng:** 4 phòng chơi được 0, 1, 4, 6. Phòng 4 và 6 mở ở cấp 3. Phòng đã sưu tập đủ thì rời danh sách ở lần live sau.
  Tỉ lệ ra con chưa có = `_missingRates[loại túi]`.
- Engine: `E.loadPack` / `E.scenePacks` (gói `bf` chỉ tải khi vào mode). SkeletonGraphic `layoutScaleMode` (FitInParent…) đã hỗ trợ trong `render.js`.
- Trích lại: `python -I tools/bf_export.py <apk giải nén> <repo>` (cần UnityPy, numpy, Pillow, ffmpeg). Ra `data/bf.json`, `data/bf_pack.json`,
  `data/bf_roots.json`, `assets/tex/bf/`, `assets/spine/bf_*`, `assets/audio/bf_*` (chỉ giữ asset các màn gameplay). `tools/bf_tree.py <View>` in cây prefab.
- Còn ước lượng (spec đánh dấu ≈):
  - một số thời lượng trong RevealAsync;
  - cách hạt hiệu ứng của UnboxFx bay và xoay;
  - lưới tray (theo ảnh máy thật);
  - vị trí các thành phần của banner donate;
  - gradient nền popup kết thúc (thay bằng màu trung bình).

## 8. Việc còn dở / chưa kiểm
- Chưa test trên iPhone/Android thật. Chủ dự án test trên iPhone Safari + "Thêm vào MH chính".
- Đã chơi trên trình duyệt (khung 375×812): Loading, Home, Clicker trọn vòng, siêu thị trọn vòng, mở túi + kéo charm, popup điểm danh,
  ngôn ngữ, nút Home các mode; (14/11/2026) vòng quay (cả hộp quà), nhiệm vụ ngày + hộp thưởng, quà online, trang trí Home,
  cài đặt, Scoop trọn vòng (múc → mở túi → hộp → xếp → thiệp → giao → nhận), bán trùng + popup hoàn thành, DreamHouse hết phòng 1 → phòng 2.
- Lỗi đã sửa đợt 14/11/2026: hộp quà vòng quay thiếu bước rơi xuống (bị mask cắt); dòng quà online không bấm được (CanvasGroup
  chưa bật lại sau AnimShow); nhãn "$ mins" / "You've got $ charms" / "Level $" / "Day $" không dịch (E.tr thêm tra khoá có số);
  ô ngôn ngữ trong Cài đặt cứng "English" + mũi tên không đổi ngôn ngữ; icon xu phình to sau khi coin bay về; thú cưng đã chọn
  bị đổi lại thành mặc định khi khởi động (spineInit cũ ghi đè); chữ "Nhấn vào chỗ trống" chặn chạm ở hướng dẫn nhiệm vụ.
- Còn ngờ: chữ khen "PERFECT!" ở màn mở túi vẽ dưới thẻ bộ sưu tập (theo sorting gốc của prefab, chưa đối chiếu được).
  Bản trích không có cờ raycastTarget của chữ TMP → mọi chữ đều chặn chạm (khác gốc nếu gốc tắt cờ này).
- Nhỏ: một số nhãn dài xuống 2 dòng so với bản gốc ("Bỏ Qua", "1 Trang phục" đè "Ngẫu nhiên").
- Máy Mac có ổ SSD ngoài: macOS chặn Python đọc ổ này (`http.server` trả 404) → dùng `npx serve .` hoặc server Node.
