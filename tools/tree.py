import json,sys,os
D=sys.argv[1]; fn=sys.argv[2]
N=json.load(open(os.path.join(D,'names.json')))
G=json.load(open(os.path.join(D,fn+'.json')))
tr={}  # transform pid -> go pid
for gp,g in G.items():
    for c in g['c']:
        if c['type'] in('Transform','RectTransform'): tr[c['pid']]=gp; g['tr']=c
def rn(r):
    if not r or not r.get('$ref'): return None
    f,p=r['$ref']; return N.get('%s:%d'%(f,p),[None,'#%d'%p])[1]
def info(g):
    out=[]
    for c in g['c']:
        t=c['type']
        if t in('Transform','RectTransform'): continue
        d=c.get('d') or {}
        if t=='SpriteRenderer': out.append('SR(%s o%s)'%(rn(d.get('m_Sprite')),d.get('m_SortingOrder')))
        elif t=='MonoBehaviour':
            s=c.get('script','?')
            if s=='UnityEngine.UI.Image': out.append('Img(%s)'%rn(d.get('m_Sprite')))
            elif 'TextMeshPro' in s: out.append('Txt(%r)'%(d.get('m_text','')[:30]))
            elif s.startswith('UnityEngine.UI.'): out.append(s.split('.')[-1])
            else: out.append(s)
        else: out.append(t)
    return ' '.join(out)
def walk(gp,dep):
    g=G[gp]; t=g['tr']['d']
    pos=t.get('m_LocalPosition',{}); 
    p='(%.2f,%.2f)'%(pos.get('x',0),pos.get('y',0)) if pos else ''
    print('  '*dep+('' if g['active'] else '-')+g['name'],p,info(g))
    for ch in t.get('m_Children',[]):
        f,pid=ch['$ref'] if ch.get('$ref') else (None,None)
        if pid in tr: walk(tr[pid],dep+1)
roots=[gp for gp,g in G.items() if 'tr' in g and not (g['tr']['d'].get('m_Father') or {}).get('$ref')]
for r in roots: walk(r,0)
