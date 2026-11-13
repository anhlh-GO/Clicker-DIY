import UnityPy,sys,os,json
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import mbread
from PIL import Image
env=UnityPy.load(sys.argv[1]); out=sys.argv[2]; os.makedirs(out,exist_ok=True)
objs={}
for o in env.objects: objs[(o.assets_file.name,o.path_id)]=o
def ext(af,fid):
    if fid==0: return af.name
    return os.path.basename(af.externals[fid-1].path)
scripts={}
for o in env.objects:
    if o.type.name=='MonoScript':
        d=o.read_typetree(); scripts[(o.assets_file.name,o.path_id)]=(d['m_Namespace']+'.' if d['m_Namespace'] else '')+d['m_ClassName']
def R(af,r):
    if not r: return None
    return objs.get((ext(af,r['f']),r['p']))
res={}
for o in env.objects:
    if o.type.name!='MonoBehaviour': continue
    raw=o.get_raw_data(); r=mbread.R(raw); r.u('iq'); r.u('B'); r.al(); sf,sp=r.u('iq')
    cls=scripts.get((ext(o.assets_file,sf),sp))
    if cls!='Spine.Unity.SkeletonDataAsset': continue
    d,_,_=mbread.read_mb(o,cls)
    js=R(o.assets_file,d['skeletonJSON']).read()
    name=js.m_Name
    txt=js.m_Script if isinstance(js.m_Script,str) else js.m_Script.decode('utf8','surrogateescape')
    open(os.path.join(out,name+'.json'),'w',encoding='utf8',errors='surrogateescape').write(txt)
    pages=[]
    for aref in d['atlasAssets']:
        ao=R(o.assets_file,aref); ad,_,_=mbread.read_mb(ao,'Spine.Unity.SpineAtlasAsset')
        at=R(ao.assets_file,ad['atlasFile']).read()
        atxt=at.m_Script if isinstance(at.m_Script,str) else at.m_Script.decode('utf8','surrogateescape')
        texs=[]
        for mref in ad['materials']:
            mo=R(ao.assets_file,mref); mt=mo.read_typetree()
            pma=None
            for k,v in mt['m_SavedProperties']['m_Floats']:
                if k=='_StraightAlphaInput': pma=(v==0)
            for k,v in mt['m_SavedProperties']['m_TexEnvs']:
                if k=='_MainTex':
                    to=objs.get((ext(mo.assets_file,v['m_Texture']['m_FileID']),v['m_Texture']['m_PathID']))
                    if to: texs.append((to,pma))
        # map atlas page names to textures by name
        lines=atxt.replace('\r','').split('\n'); newl=[]
        pi=0
        for i,l in enumerate(lines):
            if l.strip().endswith('.png') or l.strip().endswith('.jpg'):
                pn=l.strip()
                base=os.path.splitext(pn)[0]
                tex=None;pma=None
                for to,pm in texs:
                    if to.read().m_Name==base: tex=to;pma=pm
                if tex is None and pi<len(texs): tex,pma=texs[pi]
                pi+=1
                fn=name+'_'+base+'.png'
                if tex:
                    im=tex.read().image.convert('RGBA')
                    if pma:
                        px=im.load(); w,h=im.size
                        import numpy as np
                        a=np.array(im).astype('float32'); al=a[...,3:4]/255.0
                        a[...,:3]=np.where(al>0,np.clip(a[...,:3]/np.maximum(al,1e-6),0,255),0)
                        im=Image.fromarray(a.astype('uint8'),'RGBA')
                    im.save(os.path.join(out,fn))
                newl.append(fn)
            else: newl.append(l)
        open(os.path.join(out,name+'.atlas'),'w').write('\n'.join(newl))
        pages.append(name+'.atlas')
    res['%s:%d'%(o.assets_file.name,o.path_id)]={'name':name,'atlas':pages,'scale':d.get('scale'),'mix':d.get('defaultMix')}
json.dump(res,open(os.path.join(out,'spine.json'),'w'),indent=1)
print(json.dumps(res,indent=0)[:3000])
