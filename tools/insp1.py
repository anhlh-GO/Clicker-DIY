import UnityPy,collections,sys
env=UnityPy.load(sys.argv[1])
for o in env.objects:
    if o.type.name=='BuildSettings':
        d=o.read_typetree(); print('scenes',d.get('scenes'), d.get('m_Version', d.get('version')))
ms=collections.Counter()
for o in env.objects:
    if o.type.name=='MonoScript':
        d=o.read_typetree()
        if d['m_AssemblyName']=='Assembly-CSharp.dll': ms[d['m_Namespace']+'.'+d['m_ClassName']]+=1
print(len(ms)); print(sorted(ms))
for o in env.objects:
    if o.type.name=='TextAsset':
        d=o.read(); print('TA',d.m_Name,len(d.m_Script))
# typetree availability
mb=[o for o in env.objects if o.type.name=='MonoBehaviour'][:3]
for o in mb:
    try: print(list(o.read_typetree().keys())[:20])
    except Exception as e: print('err',e)
print(env.objects[0].assets_file.unity_version)
