import json,os,sys,glob,math
W=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
D=os.path.join(W,'dump'); OUT=os.path.join(W,'out','data'); os.makedirs(OUT,exist_ok=True)
N=json.load(open(os.path.join(D,'names.json')))
TM=json.load(open(os.path.join(W,'out','texmeta.json')))
def key(ref):
    if not ref or not isinstance(ref,dict) or not ref.get('$ref'): return None
    f,p=ref['$ref']; return '%s:%d'%(f,p)
def col(c):
    if not c: return None
    if isinstance(c,list): v=[round(x,3) for x in c]
    else: v=[round(c['r'],3),round(c['g'],3),round(c['b'],3),round(c['a'],3)]
    return None if v==[1,1,1,1] else v
def colf(c):
    if c is None: return None
    if isinstance(c,list): return [round(x,3) for x in c]
    return [round(c[k],3) for k in 'rgba']
def v2(v):
    if isinstance(v,list): return [round(v[0],4),round(v[1],4)]
    return [round(v['x'],4),round(v['y'],4)]
def v3(v): return [round(v['x'],4),round(v['y'],4),round(v['z'],4)]
def rotz(q):
    x,y,z,w=q['x'],q['y'],q['z'],q['w']
    return round(math.degrees(math.atan2(2*(w*z+x*y),1-2*(y*y+z*z))),3)
def refs(v):
    if isinstance(v,dict):
        if '$ref' in v: return key(v)
        return {k:refs(x) for k,x in v.items() if not k.startswith('_go')}
    if isinstance(v,list): return [refs(x) for x in v]
    if isinstance(v,float): return round(v,5)
    return v
SKIPMB={'UnityEngine.EventSystems.EventSystem','UnityEngine.InputSystem.UI.InputSystemUIInputModule','UnityEngine.Rendering.Universal.UniversalAdditionalCameraData','UnityEngine.Rendering.Universal.UniversalAdditionalLightData','UnityEngine.EventSystems.Physics2DRaycaster'}
def en(d): return 0 if d.get('m_Enabled',1) else 1
def comp(c,fn):
    t=c['type']; d=c.get('d') or {}
    if t=='SpriteRenderer':
        o={'t':'SR','sp':key(d.get('m_Sprite')),'o':d.get('m_SortingOrder',0),'L':d.get('m_SortingLayer',0)}
        cc=col(d.get('m_Color'))
        if cc: o['col']=cc
        if d.get('m_FlipX'): o['fx']=1
        if d.get('m_FlipY'): o['fy']=1
        if d.get('m_DrawMode'): o['dm']=d['m_DrawMode']; o['sz']=v2(d['m_Size'])
        if d.get('m_MaskInteraction'): o['mi']=d['m_MaskInteraction']
        if en(d): o['off']=1
        return o
    if t=='SpriteMask':
        return {'t':'SM','sp':key(d.get('m_Sprite')),'L':d.get('m_SortingLayer',0),'off':en(d),'cut':d.get('m_MaskAlphaCutoff'),
                'range':[d.get('m_FrontSortingOrder'),d.get('m_BackSortingOrder'),d.get('m_IsCustomRangeActive')]}
    if t=='SortingGroup': return {'t':'SG','o':d.get('m_SortingOrder',0),'L':d.get('m_SortingLayer',0),'off':en(d)}
    if t=='Canvas': return {'t':'Canvas','mode':d.get('m_RenderMode'),'ov':d.get('m_OverrideSorting'),'o':d.get('m_SortingOrder'),'L':d.get('m_SortingLayerID'),'cam':key(d.get('m_Camera')),'pd':d.get('m_PlaneDistance')}
    if t=='CanvasGroup': return {'t':'CG','a':round(d.get('m_Alpha',1),3),'ia':d.get('m_Interactable'),'br':d.get('m_BlocksRaycasts')}
    if t=='BoxCollider2D': return {'t':'Box','sz':v2(d['m_Size']),'of':v2(d['m_Offset']),'trig':d.get('m_IsTrigger'),'off':en(d)}
    if t=='CircleCollider2D': return {'t':'Circle','r':d['m_Radius'],'of':v2(d['m_Offset']),'trig':d.get('m_IsTrigger'),'off':en(d)}
    if t=='PolygonCollider2D': return {'t':'Poly','pts':[[v2(p) for p in path] for path in d['m_Points']['m_Paths']],'of':v2(d['m_Offset']),'trig':d.get('m_IsTrigger'),'off':en(d)}
    if t=='Rigidbody2D': return {'t':'RB','bt':d.get('m_BodyType'),'g':d.get('m_GravityScale'),'m':d.get('m_Mass'),'ld':d.get('m_LinearDamping',d.get('m_LinearDrag')),'ad':d.get('m_AngularDamping',d.get('m_AngularDrag')),'c':d.get('m_Constraints')}
    if t=='Camera': return {'t':'Cam','sz':d.get('orthographic size'),'ortho':d.get('orthographic'),'depth':d.get('m_Depth'),'bg':colf(d.get('m_BackGroundColor')),'mask':(d.get('m_CullingMask') or {}).get('m_Bits'),'off':en(d)}
    if t=='AudioSource': return {'t':'AS','clip':key(d.get('m_audioClip')),'loop':d.get('Loop'),'vol':d.get('m_Volume'),'paw':d.get('m_PlayOnAwake')}
    if t=='ParticleSystem': return {'t':'PS'}
    if t=='ParticleSystemRenderer':
        m=d.get('m_Materials') or []
        return {'t':'PSR','mat':key(m[0]) if m else None,'o':d.get('m_SortingOrder'),'L':d.get('m_SortingLayer')}
    if t=='MeshRenderer': return {'t':'MR','o':d.get('m_SortingOrder',0),'L':d.get('m_SortingLayer',0),'off':en(d)}
    if t=='Animator': return {'t':'Anim','ctrl':key(d.get('m_Controller'))}
    if t=='MonoBehaviour':
        s=c.get('script','?')
        if s in SKIPMB: return None
        o={'t':'MB','cls':s,'id':c['pid']}
        if s=='UnityEngine.UI.Image':
            o={'t':'Img','sp':key(d.get('m_Sprite')),'it':d.get('m_Type',0),'id':c['pid']}
            cc=col(d.get('m_Color'))
            if cc: o['col']=cc
            if d.get('m_Type')==3: o['fm']=d.get('m_FillMethod'); o['fa']=round(d.get('m_FillAmount',1),4); o['fo']=d.get('m_FillOrigin'); o['fcw']=d.get('m_FillClockwise')
            if d.get('m_PreserveAspect'): o['pa']=1
            if not d.get('m_RaycastTarget',1): o['nr']=1
            if en(d): o['off']=1
            if d.get('m_PixelsPerUnitMultiplier',1)!=1: o['ppm']=d['m_PixelsPerUnitMultiplier']
            if d.get('m_FillCenter',1)==0: o['nfc']=1
            return o
        if s=='UnityEngine.UI.RawImage':
            uv=d.get('m_UVRect')
            o={'t':'Raw','tex':key(d.get('m_Texture')),'uv':uv if isinstance(uv,list) else ([uv[k] for k in ('x','y','width','height')] if uv else None),'id':c['pid']}
            cc=col(d.get('m_Color'))
            if cc: o['col']=cc
            if en(d): o['off']=1
            return o
        if s in('TMPro.TextMeshProUGUI','TMPro.TextMeshPro'):
            o={'t':'Txt','s':d.get('m_text',''),'fs':d.get('m_fontSize'),'font':key(d.get('m_fontAsset')),'mat':key(d.get('m_sharedMaterial')),
               'col':colf(d.get('m_fontColor')),
               'ha':d.get('m_HorizontalAlignment'),'va':d.get('m_VerticalAlignment'),'auto':d.get('m_enableAutoSizing'),'fmin':d.get('m_fontSizeMin'),'fmax':d.get('m_fontSizeMax'),
               'st':d.get('m_fontStyle'),'wrap':d.get('m_TextWrappingMode',d.get('m_enableWordWrapping')),'cs':d.get('m_characterSpacing'),'ls':d.get('m_lineSpacing'),
               'world':1 if s=='TMPro.TextMeshPro' else 0,'id':c['pid'],'ow':d.get('m_outlineWidth'),'oc':colf(d.get('m_outlineColor')) if isinstance(d.get('m_outlineColor'),(dict,list)) else None,
               'mg':d.get('m_margin')}
            if d.get('m_enableVertexGradient'): o['grad']=refs(d.get('m_fontColorGradient'))
            if en(d): o['off']=1
            return o
        if s=='UnityEngine.UI.Button': return {'t':'Btn','id':c['pid'],'tr':d.get('m_Transition'),'ia':d.get('m_Interactable',1),'ss':refs(d.get('m_SpriteState')),'cb':refs(d.get('m_OnClick'))}
        if s=='UnityEngine.UI.Toggle': return {'t':'Toggle','id':c['pid'],'on':d.get('m_IsOn'),'gfx':key(d.get('graphic'))}
        if s=='UnityEngine.UI.GraphicRaycaster': return {'t':'GR'}
        if s=='UnityEngine.UI.Mask': return {'t':'Mask','show':d.get('m_ShowMaskGraphic'),'off':en(d)}
        if s=='UnityEngine.UI.RectMask2D': return {'t':'RMask','off':en(d)}
        if s=='UnityEngine.UI.CanvasScaler': return {'t':'Scaler','ref':v2(d['m_ReferenceResolution']) if d.get('m_ReferenceResolution') else None,'match':d.get('m_MatchWidthOrHeight'),'mode':d.get('m_UiScaleMode'),'sm':d.get('m_ScreenMatchMode')}
        if s in('UnityEngine.UI.HorizontalLayoutGroup','UnityEngine.UI.VerticalLayoutGroup','UnityEngine.UI.GridLayoutGroup'):
            pad=d.get('m_Padding')
            o={'t':'Layout','k':s.split('.')[-1][0],'pad':[pad[k] for k in('m_Left','m_Right','m_Top','m_Bottom')] if isinstance(pad,dict) else pad,
               'sp':d.get('m_Spacing'),'al':d.get('m_ChildAlignment'),'cw':d.get('m_ChildControlWidth'),'ch':d.get('m_ChildControlHeight'),'ew':d.get('m_ChildForceExpandWidth'),'eh':d.get('m_ChildForceExpandHeight'),
               'rev':d.get('m_ReverseArrangement'),'csw':d.get('m_ChildScaleWidth'),'csh':d.get('m_ChildScaleHeight'),'off':en(d)}
            if o['k']=='G': o.update({'cell':v2(d['m_CellSize']),'gsp':v2(d['m_Spacing']),'con':d.get('m_Constraint'),'cc':d.get('m_ConstraintCount'),'sc':d.get('m_StartCorner'),'sa':d.get('m_StartAxis')})
            return o
        if s=='UnityEngine.UI.ContentSizeFitter': return {'t':'Fit','h':d.get('m_HorizontalFit'),'v':d.get('m_VerticalFit')}
        if s=='UnityEngine.UI.LayoutElement': return {'t':'LE','ig':d.get('m_IgnoreLayout'),'mw':d.get('m_MinWidth'),'mh':d.get('m_MinHeight'),'pw':d.get('m_PreferredWidth'),'ph':d.get('m_PreferredHeight'),'fw':d.get('m_FlexibleWidth'),'fh':d.get('m_FlexibleHeight')}
        if s=='UnityEngine.UI.ScrollRect': return {'t':'Scroll','content':key(d.get('m_Content')),'h':d.get('m_Horizontal'),'v':d.get('m_Vertical'),'vp':key(d.get('m_Viewport')),'mt':d.get('m_MovementType'),'id':c['pid']}
        if s in('Spine.Unity.SkeletonAnimation','Spine.Unity.SkeletonGraphic'):
            return {'t':'Spine','ui':1 if s.endswith('Graphic') else 0,'data':key(d.get('skeletonDataAsset')),'skin':d.get('initialSkinName'),'anim':d.get('AnimationName',d.get('startingAnimation')),'loop':d.get('loop',d.get('startingLoop')),'ts':d.get('timeScale'),
                    'fx':d.get('initialFlipX'),'fy':d.get('initialFlipY'),'id':c['pid'],'col':col(d.get('m_Color')) if s.endswith('Graphic') else None,'off':en(d)}
        o['d']=refs(d)
        return o
    return None
GO_FILES=[os.path.basename(f)[:-5] for f in glob.glob(os.path.join(D,'*.json')) if not os.path.basename(f) in('names.json','so.json')]
for fn in GO_FILES:
    G=json.load(open(os.path.join(D,fn+'.json')))
    nodes={}; c2g={}; trmap={}
    for gp,g in G.items():
        for c in g['c']:
            c2g[c['pid']]=int(gp)
            if c['type'] in('Transform','RectTransform'): trmap[c['pid']]=int(gp)
    for gp,g in G.items():
        n={'n':g['name']}
        if not g['active']: n['off']=1
        if g['layer']: n['ly']=g['layer']
        cs=[]
        for c in g['c']:
            t=c['type']; d=c.get('d') or {}
            if t in('Transform','RectTransform'):
                p=v3(d['m_LocalPosition']); r=rotz(d['m_LocalRotation']); s=v3(d['m_LocalScale'])
                n['p']=p[:2] if p[2]==0 else p
                if r: n['r']=r
                if s!=[1,1,1]: n['s']=s[:2]
                ch=[]
                for x in d.get('m_Children',[]):
                    k=key(x)
                    if k:
                        pid=int(k.rsplit(':',1)[1])
                        if pid in trmap: ch.append(trmap[pid])
                if ch: n['ch']=ch
                fk=key(d.get('m_Father'))
                if fk:
                    pid=int(fk.rsplit(':',1)[1])
                    if pid in trmap: n['par']=trmap[pid]
                if t=='RectTransform':
                    n['rt']=v2(d['m_AnchorMin'])+v2(d['m_AnchorMax'])+v2(d['m_AnchoredPosition'])+v2(d['m_SizeDelta'])+v2(d['m_Pivot'])
                n['tid']=c['pid']
                continue
            try: o=comp(c,fn)
            except Exception as e: o={'t':'ERR','e':str(e)[:60],'ty':t,'s':c.get('script')}
            if o:
                if 'id' not in o: o['id']=c['pid']
                cs.append(o)
        if cs: n['c']=cs
        nodes[int(gp)]=n
    json.dump({'nodes':nodes,'c2g':c2g},open(os.path.join(OUT,fn+'.json'),'w'),separators=(',',':'))
    print(fn,len(nodes),os.path.getsize(os.path.join(OUT,fn+'.json'))//1024,'KB')
spr={}
for k,s in TM['spr'].items():
    t=TM['tex'].get(s['t'])
    if not t or 'f' not in t: continue
    x,y,w,h=s['r']
    spr[k]=[t['f'],round(x,2),round(t['h']-y-h,2),round(w,2),round(h,2),round(s['pv'][0],4),round(s['pv'][1],4),s['ppu'],[round(b,2) for b in s['b']],s['n'],
            round(s['rect'][2],2),round(s['rect'][3],2),round(s['off'][0],2),round(s['off'][1],2)]
tex={k:[v['f'],v['w'],v['h'],v['n']] for k,v in TM['tex'].items() if 'f' in v}
json.dump({'spr':spr,'tex':tex},open(os.path.join(OUT,'sprites.json'),'w'),separators=(',',':'))
SO=json.load(open(os.path.join(D,'so.json')))
json.dump({k:{'cls':v['cls'],'d':refs(v['d'])} for k,v in SO.items()},open(os.path.join(OUT,'so.json'),'w'),separators=(',',':'))
names={k:v[1] for k,v in N.items() if v[0] in('Sprite','AudioClip','TextAsset','GameObject','Material','Texture2D')}
json.dump(names,open(os.path.join(OUT,'names.json'),'w'),separators=(',',':'))
