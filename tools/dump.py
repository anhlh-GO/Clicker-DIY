# dump all GameObjects + components to JSON (per assets file), with MB fields decoded
import UnityPy,sys,os,json,collections
sys.path.insert(0,os.path.dirname(__file__))
import mbread
env=UnityPy.load(sys.argv[1]); out=sys.argv[2]; os.makedirs(out,exist_ok=True)
files={}
for o in env.objects: files.setdefault(o.assets_file.name,{})[o.path_id]=o
# global script map by (file,pid)
def ext(af,fid):
    if fid==0: return af.name
    return os.path.basename(af.externals[fid-1].path)
scripts={}
for fn,objs in files.items():
    for pid,o in objs.items():
        if o.type.name=='MonoScript':
            d=o.read_typetree(); scripts[(fn,pid)]=(d['m_AssemblyName'],(d['m_Namespace']+'.' if d['m_Namespace'] else '')+d['m_ClassName'])
names={}
def pp(af,ptr):
    if not ptr: return None
    if isinstance(ptr,dict):
        f=ptr.get('m_FileID',ptr.get('f')); p=ptr.get('m_PathID',ptr.get('p'))
    else: f,p=ptr.file_id,ptr.path_id
    if not p: return None
    return [ext(af,f),p]
def jsonable(v,af):
    if isinstance(v,dict):
        if set(v.keys())=={'f','p'}: return {'$ref':pp(af,v)}
        return {k:jsonable(x,af) for k,x in v.items()}
    if isinstance(v,list): return [jsonable(x,af) for x in v]
    if isinstance(v,(bytes,bytearray)): return None
    return v
SKIP={'m_GameObject','m_CorrespondingSourceObject','m_PrefabInstance','m_PrefabAsset'}
def tt(o,af):
    d=o.read_typetree()
    def conv(v):
        if isinstance(v,dict):
            if set(v.keys())>={'m_FileID','m_PathID'} and len(v)==2: return {'$ref':pp(af,v)}
            return {k:conv(x) for k,x in v.items() if k not in SKIP}
        if isinstance(v,list): return [conv(x) for x in v]
        if isinstance(v,(bytes,bytearray)): return None
        return v
    return conv(d)
WANT={'Transform','RectTransform','SpriteRenderer','SpriteMask','SortingGroup','Canvas','CanvasGroup','BoxCollider2D','CircleCollider2D','PolygonCollider2D','ParticleSystemRenderer','MeshRenderer','Camera','Animator','AudioSource','Rigidbody2D'}
for fn,objs in files.items():
    res={}
    for pid,o in objs.items():
        if o.type.name!='GameObject': continue
        g=o.read_typetree()
        comps=[]
        for c in g['m_Component']:
            ptr=c['component']; f,p=ptr['m_FileID'],ptr['m_PathID']
            co=objs.get(p) if f==0 else None
            if not co: continue
            tn=co.type.name; e={'type':tn,'pid':p}
            try:
                if tn=='MonoBehaviour':
                    raw=co.get_raw_data(); r=mbread.R(raw); r.u('iq'); r.u('B'); r.al(); sf,sp=r.u('iq')
                    key=scripts.get((ext(co.assets_file,sf),sp))
                    e['script']=key[1] if key else '?'
                    if key:
                        d,q,n=mbread.read_mb(co,key[1]); e['d']=jsonable(d,co.assets_file)
                        if q!=n: e['err']='len %d/%d'%(q,n)
                elif tn in WANT: e['d']=tt(co,co.assets_file)
            except Exception as ex: e['err']=str(ex)[:80]
            comps.append(e)
        res[pid]={'name':g['m_Name'],'active':g['m_IsActive'],'layer':g['m_Layer'],'tag':g.get('m_Tag'),'c':comps}
    if res: json.dump(res,open(os.path.join(out,fn+'.json'),'w'))
    print(fn,len(res))
