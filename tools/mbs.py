import json,sys
f=sys.argv[1]; pat=sys.argv[2]
d=json.load(open(f)); n=d['nodes']; c2g=d['c2g']
try: names=json.load(open('out/data/names.json'))
except: names={}
def path(i):
    p=[]; 
    while i is not None and str(i) in n:
        p.append(n[str(i)]['n']); i=n[str(i)].get('par')
    return '/'.join(reversed(p))
def res(v):
    if isinstance(v,str) and ':' in v:
        if v.startswith('level') or v.split(':')[0].isdigit() or True:
            pid=v.split(':')[-1]
            if pid in c2g: return v+'=>'+path(c2g[pid])
            return v+('=>'+names[v] if v in names else '')
    if isinstance(v,list): return [res(x) for x in v]
    if isinstance(v,dict): return {k:res(x) for k,x in v.items()}
    return v
for k,v in n.items():
    for c in v.get('c',[]):
        if c.get('t')=='MB' and pat in c.get('cls',''):
            print('##',path(k),c['cls']); print(json.dumps(res(c.get('d')),ensure_ascii=False)[:6000])
