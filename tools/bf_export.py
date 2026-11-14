# Export the Dumpling game (com.noc.dumpling.idol.livestream.ASMR, Unity 6000.0, Addressables) into one engine pack "bf".
# Unlike Clicker DIY's main data, the addressable bundles carry TypeTrees, so MonoBehaviours are read directly (no il2cpp layout).
# Usage (from a work dir W with the APK unzipped to W/apk):  python -I tools/bf_export.py W/apk <repo root>
# Writes: data/bf.json (prefab nodes, engine format), data/bf_pack.json (sprites, SOs, mats, names, spine meta, audio, localisation),
#         assets/tex/bf/*.webp (one image per sprite / texture), assets/spine/bf_*.{json,atlas,png}, assets/audio/bf_*.mp3
import UnityPy, sys, os, json, re, subprocess, tempfile
import numpy as np
from PIL import Image
APK, REPO = sys.argv[1], sys.argv[2]
AA = os.path.join(APK, 'assets/aa/Android')
env = UnityPy.load(AA)
FILE = 'bf'
OUT_TEX = os.path.join(REPO, 'assets/tex/bf'); os.makedirs(OUT_TEX, exist_ok=True)
OUT_SP = os.path.join(REPO, 'assets/spine'); OUT_AU = os.path.join(REPO, 'assets/audio')

# ---- object table and pathID remap (64-bit Addressables pathIDs do not fit a JS number)
objs = {}
for o in env.objects: objs[(o.assets_file.name, o.path_id)] = o
ids = {}
def nid(fn, pid):
    k = (fn, pid)
    if k not in ids: ids[k] = len(ids) + 1
    return ids[k]
for (fn, pid) in sorted(objs): nid(fn, pid)
def ext(af, fid):
    if fid == 0: return af.name
    return os.path.basename(af.externals[fid - 1].path)
def kref(af, r):
    if not isinstance(r, dict): return None
    f, p = r.get('m_FileID'), r.get('m_PathID')
    if not p: return None
    fn = ext(af, f)
    if (fn, p) not in objs: return None
    return '%s:%d' % (FILE, ids[(fn, p)])
def conv(v, af):  # typetree -> export.py style ({'$ref':[file,pid]})
    if isinstance(v, dict):
        if set(v.keys()) == {'m_FileID', 'm_PathID'}:
            k = kref(af, v); return {'$ref': k.split(':') if k else None} if k else None
        return {k: conv(x, af) for k, x in v.items() if k not in ('m_GameObject', 'm_CorrespondingSourceObject', 'm_PrefabInstance', 'm_PrefabAsset')}
    if isinstance(v, list): return [conv(x, af) for x in v]
    if isinstance(v, (bytes, bytearray)): return None
    return v

# ---- reuse export.py's component mapping (functions only; its module body expects Clicker's dump folder)
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'export.py')).read()
ns = {'math': __import__('math'), 'json': json, 'os': os}
exec(src[src.index('def key('):src.index('GO_FILES=')], ns)
def key(ref):
    if not ref or not isinstance(ref, dict) or not ref.get('$ref'): return None
    f, p = ref['$ref']; return '%s:%s' % (f, p)
ns['key'] = key
comp = ns['comp']

scripts = {}
for (fn, pid), o in objs.items():
    if o.type.name == 'MonoScript':
        d = o.read_typetree(); scripts[(fn, pid)] = (d['m_Namespace'] + '.' if d['m_Namespace'] else '') + d['m_ClassName']
def script_of(o, tt):
    s = tt.get('m_Script') or {}
    return scripts.get((ext(o.assets_file, s.get('m_FileID', 0)), s.get('m_PathID')), '?')

WANT = {'Transform', 'RectTransform', 'Canvas', 'CanvasGroup', 'Animator', 'AudioSource', 'ParticleSystemRenderer', 'Camera', 'SpriteRenderer', 'SortingGroup'}
nodes, c2g, so = {}, {}, {}
for (fn, pid), o in objs.items():
    if o.type.name != 'GameObject': continue
    g = o.read_typetree(); gid = ids[(fn, pid)]
    n = {'n': g['m_Name']}
    if not g['m_IsActive']: n['off'] = 1
    if g.get('m_Layer'): n['ly'] = g['m_Layer']
    cs = []
    for c in g['m_Component']:
        r = c['component']; co = objs.get((ext(o.assets_file, r['m_FileID']), r['m_PathID']))
        if not co: continue
        cid = ids[(co.assets_file.name, co.path_id)]; c2g[cid] = gid
        tn = co.type.name
        if tn in ('Transform', 'RectTransform'):
            d = co.read_typetree()
            p = [round(d['m_LocalPosition'][k], 4) for k in 'xyz']; n['p'] = p[:2] if p[2] == 0 else p
            rz = ns['rotz'](d['m_LocalRotation'])
            if rz: n['r'] = rz
            s = [round(d['m_LocalScale'][k], 4) for k in 'xyz']
            if s != [1, 1, 1]: n['s'] = s[:2]
            ch = []
            for x in d.get('m_Children', []):
                to = objs.get((ext(co.assets_file, x['m_FileID']), x['m_PathID']))
                if to:
                    gg = to.read_typetree()['m_GameObject']; ch.append(ids[(ext(to.assets_file, gg['m_FileID']), gg['m_PathID'])])
            if ch: n['ch'] = ch
            fa = d.get('m_Father') or {}
            if fa.get('m_PathID'):
                fo = objs.get((ext(co.assets_file, fa['m_FileID']), fa['m_PathID']))
                if fo:
                    gg = fo.read_typetree()['m_GameObject']; n['par'] = ids[(ext(fo.assets_file, gg['m_FileID']), gg['m_PathID'])]
            if tn == 'RectTransform':
                v2 = ns['v2']; n['rt'] = v2(d['m_AnchorMin']) + v2(d['m_AnchorMax']) + v2(d['m_AnchoredPosition']) + v2(d['m_SizeDelta']) + v2(d['m_Pivot'])
            n['tid'] = cid
            continue
        e = {'type': tn, 'pid': cid}
        try:
            if tn == 'MonoBehaviour':
                tt = co.read_typetree(); e['script'] = script_of(co, tt); e['d'] = conv(tt, co.assets_file)
            elif tn in WANT: e['d'] = conv(co.read_typetree(), co.assets_file)
            elif tn == 'ParticleSystem': e['d'] = {}
            else: continue
            x = comp(e, FILE)
            d0 = e.get('d') or {}
            if x and x.get('t') == 'Spine' and d0.get('layoutScaleMode'):  # spine 4.2 SkeletonGraphic layout (FitInParent etc.)
                rs, po = d0.get('referenceSize') or {}, d0.get('pivotOffset') or {}
                x.update({'lsm': d0['layoutScaleMode'], 'ref': [rs.get('x', 100), rs.get('y', 100)], 'po': [po.get('x', 0), po.get('y', 0)], 'rsc': d0.get('referenceScale', 1)})
        except Exception as ex: x = {'t': 'ERR', 'e': str(ex)[:60], 'ty': tn, 's': e.get('script')}
        if x:
            if 'id' not in x: x['id'] = cid
            cs.append(x)
    if cs: n['c'] = cs
    nodes[gid] = n
# ScriptableObjects (MonoBehaviours without a GameObject)
for (fn, pid), o in objs.items():
    if o.type.name != 'MonoBehaviour': continue
    try:
        tt = o.read_typetree()
        if (tt.get('m_GameObject') or {}).get('m_PathID'): continue
        so['%s:%d' % (FILE, ids[(fn, pid)])] = {'cls': script_of(o, tt), 'd': ns['refs'](conv(tt, o.assets_file))}
    except Exception: pass

# ---- sprites / textures: one webp per sprite (atlas-packed sprites are cut out of their atlas page)
spr, tex, names = {}, {}, {}
def save(im, name):
    p = os.path.join(OUT_TEX, name)
    if not os.path.exists(p): im.save(p, 'WEBP', quality=88, method=4)
for (fn, pid), o in objs.items():
    t = o.type.name; k = '%s:%d' % (FILE, ids[(fn, pid)])
    try:
        if t == 'Sprite':
            s = o.read(); im = s.image; f = 'bf_%d.webp' % ids[(fn, pid)]; save(im, f)
            rd = s.m_RD; off = rd.textureRectOffset
            w, h = im.size
            ox, oy = (off.x, off.y) if (round(rd.textureRect.width) == w and round(rd.textureRect.height) == h) else (0, 0)
            spr[k] = ['bf/' + f, 0, 0, w, h, round(s.m_Pivot.x, 4), round(s.m_Pivot.y, 4), s.m_PixelsToUnits, [round(b, 2) for b in (s.m_Border.x, s.m_Border.y, s.m_Border.z, s.m_Border.w)],
                      s.m_Name, round(s.m_Rect.width, 2), round(s.m_Rect.height, 2), round(ox, 2), round(oy, 2)]
            tex['bf/' + f] = ['bf/' + f, w, h, s.m_Name]; names[k] = s.m_Name
        elif t == 'Texture2D':
            x = o.read(); f = 'bft_%d.webp' % ids[(fn, pid)]
            if x.m_Width * x.m_Height <= 4096 * 4096:
                save(x.image, f); tex[k] = ['bf/' + f, x.m_Width, x.m_Height, x.m_Name]
            names[k] = x.m_Name
        elif t in ('AudioClip', 'TextAsset', 'GameObject', 'Material'):
            names[k] = o.read().m_Name
    except Exception as ex: print('skip', t, k, str(ex)[:60])

# ---- TMP materials (face / outline / underlay) for the text renderer
mats = {}
for (fn, pid), o in objs.items():
    if o.type.name != 'Material': continue
    try:
        m = o.read_typetree(); P = m['m_SavedProperties']
        mats['%s:%d' % (FILE, ids[(fn, pid)])] = {'n': m['m_Name'], 'f': {k: v for k, v in P['m_Floats']}, 'c': {k: [v['r'], v['g'], v['b'], v['a']] for k, v in P['m_Colors']}, 'kw': m.get('m_ValidKeywords')}
    except Exception: pass

# ---- Spine (SkeletonDataAsset -> json + atlas + straight-alpha png)
spine = {}
def tref(o, r): return objs.get((ext(o.assets_file, r['m_FileID']), r['m_PathID'])) if r and r.get('m_PathID') else None
def text_of(o):
    s = o.read().m_Script
    return s if isinstance(s, str) else s.decode('utf8', 'surrogateescape')
for (fn, pid), o in objs.items():
    if o.type.name != 'MonoBehaviour': continue
    try: tt = o.read_typetree()
    except Exception: continue
    if script_of(o, tt) != 'Spine.Unity.SkeletonDataAsset': continue
    js = tref(o, tt['skeletonJSON']); name = 'bf_' + re.sub(r'[^A-Za-z0-9_]+', '_', js.read().m_Name)
    open(os.path.join(OUT_SP, name + '.json'), 'w', encoding='utf8', errors='surrogateescape').write(text_of(js))
    pages = []
    for ar in tt['atlasAssets']:
        ao = tref(o, ar); ad = ao.read_typetree()
        atxt = text_of(tref(ao, ad['atlasFile'])).replace('\r', '').split('\n')
        texs = []
        for mr in ad['materials']:
            mo = tref(ao, mr); mt = mo.read_typetree(); pma = None
            for k, v in mt['m_SavedProperties']['m_Floats']:
                if k == '_StraightAlphaInput': pma = (v == 0)
            for k, v in mt['m_SavedProperties']['m_TexEnvs']:
                if k == '_MainTex':
                    to = tref(mo, v['m_Texture'])
                    if to: texs.append((to, pma))
        out, pi = [], 0
        for l in atxt:
            if re.search(r'\.(png|jpg)\s*$', l.strip()):
                base = os.path.splitext(l.strip())[0]
                hit = [x for x in texs if x[0].read().m_Name == base] or ([texs[pi]] if pi < len(texs) else [])
                pi += 1; fname = name + '_' + re.sub(r'[^A-Za-z0-9_]+', '_', base) + '.webp'
                if hit:
                    im = hit[0][0].read().image.convert('RGBA')
                    if hit[0][1] is not False:  # premultiplied on device -> straight alpha for spine-webgl
                        a = np.array(im).astype('float32'); al = a[..., 3:4] / 255.0
                        a[..., :3] = np.where(al > 0, np.clip(a[..., :3] / np.maximum(al, 1e-6), 0, 255), 0)
                        im = Image.fromarray(a.astype('uint8'), 'RGBA')
                    im.save(os.path.join(OUT_SP, fname), 'WEBP', quality=90, method=4)
                out.append(fname)
            else: out.append(l)
        open(os.path.join(OUT_SP, name + '.atlas'), 'w').write('\n'.join(out)); pages.append(name + '.atlas')
    spine['%s:%d' % (FILE, ids[(fn, pid)])] = {'name': name, 'atlas': pages, 'scale': tt.get('scale'), 'mix': tt.get('defaultMix')}

# ---- audio
audio = {}
for (fn, pid), o in objs.items():
    if o.type.name != 'AudioClip': continue
    c = o.read(); nm = 'bf_' + re.sub(r'[^A-Za-z0-9_]+', '_', c.m_Name)
    try:
        for _, wav in c.samples.items():
            mp3 = os.path.join(OUT_AU, nm + '.mp3')
            if not os.path.exists(mp3):
                with tempfile.NamedTemporaryFile(suffix='.wav') as tf:
                    tf.write(wav); tf.flush()
                    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tf.name, '-b:a', '96k', mp3], check=True)
            audio['%s:%d' % (FILE, ids[(fn, pid)])] = [nm, round(getattr(c, 'm_Length', 0) or 0, 2)]
            break
    except Exception as ex: print('audio skip', nm, str(ex)[:60])

# ---- localisation: English text -> [en, vi, fr, de, es, pt, ru, ja(none), ko] (engine column order)
LANGS = ['en', 'vi', 'fr', 'de', 'es', 'pt', 'ru', 'ja', 'ko']
tables = {}
for (fn, pid), o in objs.items():
    if o.type.name != 'MonoBehaviour': continue
    try: tt = o.read_typetree()
    except Exception: continue
    if 'm_TableData' not in tt or 'm_LocaleId' not in tt: continue
    code = tt['m_LocaleId'].get('m_Code', '')
    lang = code.split('-')[0]
    t = tables.setdefault(lang, {})
    for e in tt['m_TableData']: t[e['m_Id']] = e['m_Localized']
loc = {}
for i, en_ in (tables.get('en') or {}).items():
    if not en_: continue
    loc[en_] = [(tables.get(l) or {}).get(i) or en_ for l in LANGS]
# string keys (SharedTableData) -> English, so texts driven by LocalizeStringEvent show their entry (render translates it)
keys = {}
for v in so.values():
    if v['cls'] == 'UnityEngine.Localization.Tables.SharedTableData':
        for e in v['d'].get('m_Entries') or []: keys[e['m_Key']] = (tables.get('en') or {}).get(e['m_Id'])
for n in nodes.values():
    cs = n.get('c') or []
    ev = next((c for c in cs if c.get('t') == 'MB' and c.get('cls') == 'UnityEngine.Localization.Components.LocalizeStringEvent'), None)
    tx = next((c for c in cs if c.get('t') == 'Txt'), None)
    if ev and tx:
        k = (((ev.get('d') or {}).get('m_StringReference') or {}).get('m_TableEntryReference') or {}).get('m_Key')
        if keys.get(k): tx['s'] = keys[k]; tx['lk'] = k
for k, v in so.items():
    if v['cls'] == 'TMPro.TMP_FontAsset': names[k] = v['d'].get('m_Name')

# ---- database tables (Shared.Databases.*Table in bin/Data/sharedassets1.assets; no TypeTree -> fixed layouts read from the metadata field lists)
class RD:
    def __init__(s, b): s.b, s.o = b, 28  # PPtr GameObject, m_Enabled(+align), PPtr Script
    def i(s): v = struct.unpack_from('<i', s.b, s.o)[0]; s.o += 4; return v
    def f(s): v = struct.unpack_from('<f', s.b, s.o)[0]; s.o += 4; return v
    def d(s): v = struct.unpack_from('<d', s.b, s.o)[0]; s.o += 8; return v
    def s(s_): n = s_.i(); v = s_.b[s_.o:s_.o + n].decode('utf8', 'replace'); s_.o = (s_.o + n + 3) & ~3; return v
import struct
db = {}
for o in UnityPy.load(os.path.join(APK, 'assets/bin/Data')).objects:
    if o.assets_file.name != 'sharedassets1.assets' or o.type.name != 'MonoBehaviour': continue
    r = RD(o.get_raw_data()); name = r.s()
    if name == 'ChestTable':  # ChestData: _id, _chestName, _rewards{type, params[]}, _price, _adsUnlock, _unlockType
        db[name] = []
        for _ in range(r.i()):
            row = {'id': r.i(), 'name': r.s()}; rt = r.i(); row['rewards'] = {'type': rt, 'params': [r.s() for _ in range(r.i())]}
            row['price'] = r.d(); row['adsUnlock'] = r.i(); row['unlockType'] = r.i(); db[name].append(row)
    elif name == 'PlayerLevelTable': db[name] = [[r.i(), r.i()] for _ in range(r.i())]
    elif name == 'RoomNameTable':  # RoomNameData: _roomType, _sortIndex, _turnUnlockLevel, _experiencePoints, _milestone, _statPackDatas[{room,id,rarity,weight}]
        db[name] = []
        for _ in range(r.i()):
            row = {'room': r.i(), 'sort': r.i(), 'unlockLevel': r.i(), 'exp': r.d(), 'milestone': [r.i(), r.i()]}
            row['dumplings'] = [{'id': (r.i(), r.i())[1], 'rarity': r.i(), 'weight': round(r.f(), 4)} for _ in range(r.i())]
            db[name].append(row)

import math as _m
def clean(v):  # JSON has no Infinity/NaN (TMP/particle fields use them)
    if isinstance(v, float): return 0.0 if _m.isnan(v) else (3.4e38 if v > 0 else -3.4e38) if _m.isinf(v) else v
    if isinstance(v, dict): return {k: clean(x) for k, x in v.items()}
    if isinstance(v, list): return [clean(x) for x in v]
    return v
nodes, so = clean(nodes), clean(so)

# ---- keep only what the ported gameplay uses (Dumpling mode = these views + art/config SOs); home features of that game are dropped
KEEP_VIEWS = ['LoadingGoShopView', 'MainShopView', 'PayView', 'LivestreamView', 'LevelUpView', 'UIStunExplosion2']
KEEP_SO = ('NK.LivestreamArtLibrary', 'NK.LivestreamConfig', 'TMPro.TMP_FontAsset', 'UnityEngine.Localization.Tables.SharedTableData')
KEEP_SPRITES = {'glow1', 'Common', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Epic', 'Legendary', 'Mythic'}
KEEP_SPINE = {'bf_Dumpling', 'bf_Dumpling_Box', 'bf_Character_main', 'bf_Hand_Ctrl', 'bf_Level_up'}
byname = {n['n']: int(k) for k, n in nodes.items() if 'par' not in n}
used = set()
def refs_in(v):
    if isinstance(v, str) and v.startswith(FILE + ':'): used.add(v)
    elif isinstance(v, dict): [refs_in(x) for x in v.values()]
    elif isinstance(v, list): [refs_in(x) for x in v]
def walk(g):
    n = nodes[g]; refs_in(n.get('c'))
    for ch in n.get('ch', []): walk(ch)
for v in KEEP_VIEWS: walk(byname[v])
for k, v in so.items():
    if v['cls'] in KEEP_SO: refs_in(v['d'])
used |= {k for k, s in spr.items() if s[9] in KEEP_SPRITES}
spr = {k: s for k, s in spr.items() if k in used}
tex = {k: t for k, t in tex.items() if k in used or t[0] in {s[0] for s in spr.values()}}
keep_files = {os.path.basename(t[0]) for t in tex.values()} | {os.path.basename(s[0]) for s in spr.values()}
for f in os.listdir(OUT_TEX):
    if f not in keep_files: os.remove(os.path.join(OUT_TEX, f))
for k in [k for k, m in spine.items() if m['name'] not in KEEP_SPINE]:
    for f in os.listdir(OUT_SP):
        if f.startswith(spine[k]['name'] + '.') or f.startswith(spine[k]['name'] + '_'): os.remove(os.path.join(OUT_SP, f))
    del spine[k]
# SOs the code reads (fonts are referenced by name only: their glyph tables are dropped; string tables live in loc/strings)
so = {k: v for k, v in so.items() if v['cls'] in ('NK.LivestreamArtLibrary', 'NK.LivestreamConfig', 'NK.SkinCatalog')}
json.dump({'nodes': nodes, 'c2g': c2g}, open(os.path.join(REPO, 'data/bf.json'), 'w'), separators=(',', ':'))
json.dump(clean({'spr': spr, 'tex': tex, 'so': so, 'names': names, 'mats': mats, 'spine': spine, 'audio': audio, 'loc': loc, 'db': db, 'strings': {k: v for k, v in keys.items() if v}}),
          open(os.path.join(REPO, 'data/bf_pack.json'), 'w'), separators=(',', ':'), default=str)
roots = {n['n']: k for k, n in nodes.items() if 'par' not in n}
json.dump(roots, open(os.path.join(REPO, 'data/bf_roots.json'), 'w'), indent=0, ensure_ascii=False)
print('nodes', len(nodes), 'so', len(so), 'spr', len(spr), 'mats', len(mats), 'spine', len(spine), 'audio', len(audio), 'loc', len(loc), 'tables', list(tables))
