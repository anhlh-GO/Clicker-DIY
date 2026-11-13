import UnityPy,sys,os,json
env=UnityPy.load(sys.argv[1],sys.argv[1].replace('data.unity3d','sharedassets0.resource')); out=sys.argv[2]; res={}
for o in env.objects:
    if o.type.name=='AudioClip':
        a=o.read()
        try:
            for nm,data in a.samples.items():
                fn=a.m_Name.replace(' ','_')+'.wav'
                open(os.path.join(out,fn),'wb').write(data); break
            res['%s:%d'%(o.assets_file.name,o.path_id)]=[a.m_Name.replace(' ','_'),round(a.m_Length,2)]
        except Exception as e: print('ERR',a.m_Name,e)
json.dump(res,open(os.path.join(out,'audio.json'),'w'),indent=0); print(len(res))
