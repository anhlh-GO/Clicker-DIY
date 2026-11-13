import UnityPy,sys,json
env=UnityPy.load(sys.argv[1]); res={}
for o in env.objects:
    if o.type.name in('Sprite','Texture2D','AudioClip','TextAsset','Material','Font','AnimationClip','GameObject','MonoBehaviour'):
        try:
            n=o.peek_name() if hasattr(o,'peek_name') else o.read().m_Name
        except Exception: n='?'
        res['%s:%d'%(o.assets_file.name,o.path_id)]=[o.type.name,n]
json.dump(res,open(sys.argv[2],'w'))
