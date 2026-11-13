import UnityPy,collections,sys
env=UnityPy.load(sys.argv[1])
ms=collections.Counter()
names=[]
for o in env.objects:
    if o.type.name=='MonoScript':
        d=o.read_typetree(); ms[d['m_AssemblyName']]+=1
        if not any(d['m_AssemblyName'].startswith(p) for p in ('Unity','System','DOTween','Firebase','Google','Facebook','mscorlib','Newtonsoft','Demi')): names.append(d['m_AssemblyName']+':'+d['m_Namespace']+'.'+d['m_ClassName'])
print(ms.most_common(40))
print('\n'.join(sorted(names)))
for o in env.objects:
    if o.type.name=='TextAsset':
        d=o.read()
        s=d.m_Script if isinstance(d.m_Script,(bytes,bytearray)) else d.m_Script.encode('utf-8','surrogateescape')
        if d.m_Name in('cat','bear','Jelly_Character','blind_bag'): print(d.m_Name, s[:120])
