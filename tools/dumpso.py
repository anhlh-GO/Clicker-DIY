import UnityPy,sys,os,json
sys.path.insert(0,os.path.dirname(__file__))
import mbread
env=UnityPy.load(sys.argv[1])
def ext(af,fid):
    if fid==0: return af.name
    return os.path.basename(af.externals[fid-1].path)
scripts={}
for o in env.objects:
    if o.type.name=='MonoScript':
        d=o.read_typetree(); scripts[(o.assets_file.name,o.path_id)]=(d['m_AssemblyName'],(d['m_Namespace']+'.' if d['m_Namespace'] else '')+d['m_ClassName'])
def js(v,af):
    if isinstance(v,dict):
        if set(v.keys())=={'f','p'}: return {'$ref':[ext(af,v['f']),v['p']]}
        return {k:js(x,af) for k,x in v.items()}
    if isinstance(v,list): return [js(x,af) for x in v]
    return v
res={}
for o in env.objects:
    if o.type.name!='MonoBehaviour': continue
    raw=o.get_raw_data(); r=mbread.R(raw); go=r.u('iq'); r.u('B'); r.al(); sf,sp=r.u('iq')
    if go[1]!=0: continue
    key=scripts.get((ext(o.assets_file,sf),sp))
    if not key or key[0]!='Assembly-CSharp': continue
    try: d,_,_=mbread.read_mb(o,key[1])
    except Exception as e: d={'err':str(e)}
    res['%s:%d'%(o.assets_file.name,o.path_id)]={'cls':key[1],'d':js(d,o.assets_file)}
json.dump(res,open(sys.argv[2],'w'),indent=1)
import collections; print(collections.Counter(v['cls'] for v in res.values()))
