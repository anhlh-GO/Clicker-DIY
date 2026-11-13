import UnityPy,sys,collections,os
sys.path.insert(0,os.path.dirname(__file__))
import mbread
env=UnityPy.load(sys.argv[1])
scripts={}
for o in env.objects:
    if o.type.name=='MonoScript':
        d=o.read_typetree(); scripts[(o.assets_file.name,o.path_id)]=(d['m_AssemblyName'],(d['m_Namespace']+'.' if d['m_Namespace'] else '')+d['m_ClassName'])
ok=collections.Counter(); bad=collections.Counter(); ex={}
for o in env.objects:
    if o.type.name!='MonoBehaviour': continue
    raw=o.get_raw_data(); r=mbread.R(raw); r.u('iq'); r.u('B'); r.al(); fid,pid=r.u('iq')
    # resolve script ptr
    try:
        sobj=o.assets_file.externals[fid-1].name if fid else o.assets_file.name
    except Exception: sobj='?'
    key=None
    for (fn,p),v in scripts.items():
        if p==pid: key=v;break
    if not key or key[0] not in ('Assembly-CSharp','Assembly-CSharp.dll'): continue
    try:
        d,p,n=mbread.read_mb(o,key[1])
        if p==n: ok[key[1]]+=1
        else: bad[key[1]]+=1; ex.setdefault(key[1],(p,n))
    except Exception as e:
        bad[key[1]]+=1; ex.setdefault(key[1],str(e)[:80])
print('ok',sum(ok.values()),'bad',sum(bad.values()))
for k,v in bad.most_common(60): print(v,k,ex[k])
