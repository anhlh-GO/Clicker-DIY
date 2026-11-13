import json,struct,re,os
C=json.load(open(os.path.join(os.path.dirname(__file__),'..','classes.json')))
BUILTIN={'UnityEngine.Vector2':'ff','UnityEngine.Vector3':'fff','UnityEngine.Vector4':'ffff','UnityEngine.Quaternion':'ffff',
 'UnityEngine.Color':'ffff','UnityEngine.Rect':'ffff','UnityEngine.Color32':'BBBB','UnityEngine.Vector2Int':'ii','UnityEngine.Vector3Int':'iii',
 'UnityEngine.LayerMask':'I','UnityEngine.Bounds':'ffffff','UnityEngine.Matrix4x4':'f'*16,'UnityEngine.RectOffset':'iiii','UnityEngine.BoundsInt':'iiiiii'}
PRIM={'bool':'?','byte':'B','sbyte':'b','char':'H','short':'h','ushort':'H','int':'i','uint':'I','long':'q','ulong':'Q','float':'f','double':'d'}
def isobj(t):
    seen=0
    while t and seen<30:
        if t in('UnityEngine.Object',): return True
        c=C.get(t) or C.get(generic_split(t)[0])
        if not c: return False
        t=c['parent']; seen+=1
    return False
def generic_split(t):
    m=re.match(r'^([^<]+)<(.*)>$',t)
    if not m: return t,[]
    base,inner=m.groups(); args=[];d=0;cur=''
    for ch in inner:
        if ch=='<':d+=1
        if ch=='>':d-=1
        if ch==',' and d==0: args.append(cur);cur=''
        else: cur+=ch
    args.append(cur); return base,args
def ser_fields(cls,subst=None):
    # returns list of (name,type) serialized fields incl. parents
    base,args=generic_split(cls)
    c=C.get(base) or C.get(cls)
    if not c: return []
    out=[]
    if c['parent'] and not c['parent'].startswith('MonoSingleton') and not c['parent'].startswith('Singleton') and c['parent'] not in('UnityEngine.MonoBehaviour','UnityEngine.ScriptableObject','object','System.ValueType','UnityEngine.Behaviour'):
        out+=ser_fields(c['parent'])
    for f in c['fields']:
        a=f['a']
        if a&0x10 or a&0x40 or a&0x80 or a&0x20: continue
        if 'NonSerializedAttribute' in f['ca'] or 'SerializeReference' in f['ca']: continue
        if (a&7)!=6 and 'SerializeField' not in f['ca']: continue
        t=f['t']
        if t=='T' and args: t=args[0]
        if not serializable(t): continue
        out.append((f['n'],t))
    return out
def enum_under(t):
    c=C.get(t)
    if c:
        for f in c['fields']:
            if f['n']=='value__': return f['t']
    return None
def serializable(t):
    if t in PRIM or t=='string' or t in BUILTIN: return True
    if t in('UnityEngine.AnimationCurve','UnityEngine.Gradient'): return True
    if t.endswith('[]'):
        e=t[:-2]; return not e.endswith('[]') and not e.startswith('System.Collections.Generic.List`1') and serializable(e)
    base,args=generic_split(t)
    if base=='System.Collections.Generic.List`1':
        e=args[0]; return not e.endswith('[]') and not e.startswith('System.Collections.Generic.List`1') and serializable(e)
    if enum_under(t): return True
    if isobj(base): return True
    c=C.get(base)
    if not c: return False
    if c['flags']&0x2000 and not (c['flags']&0x80 and c['flags']&0x100 and False):  # Serializable
        if base.startswith('System.') : return False
        return True
    return False
class R:
    def __init__(s,b,p=0): s.b=b; s.p=p
    def u(s,f):
        v=struct.unpack_from('<'+f,s.b,s.p); s.p+=struct.calcsize('<'+f); return v
    def al(s): s.p=(s.p+3)&~3
    def str(s):
        n=s.u('i')[0]; v=s.b[s.p:s.p+n].decode('utf8','replace'); s.p+=n; s.al(); return v
def readval(r,t,depth=0):
    if t in PRIM:
        v=r.u(PRIM[t])[0]
        if struct.calcsize(PRIM[t])<4: r.al()
        return v
    if t=='string': return r.str()
    if t in BUILTIN:
        v=list(r.u(BUILTIN[t])); return v
    if t=='UnityEngine.AnimationCurve':
        n=r.u('i')[0]; keys=[r.u('ffffiff') for _ in range(n)]; r.u('iii'); return {'curve':keys}
    if t=='UnityEngine.Gradient':
        v=r.u('f'*32+'H'*16+'BBBB'); r.al(); return {'gradient':v}
    if t.endswith('[]') or t.startswith('System.Collections.Generic.List`1<'):
        e=t[:-2] if t.endswith('[]') else generic_split(t)[1][0]
        n=r.u('i')[0]
        if n<0 or n>1000000: raise ValueError('bad array len %d for %s'%(n,t))
        if e in('byte','bool','sbyte'):
            v=list(r.b[r.p:r.p+n]); r.p+=n; r.al(); return v
        v=[readval(r,e,depth+1) for _ in range(n)]; r.al(); return v
    eu=enum_under(t)
    if eu: return readval(r,eu)
    base,_=generic_split(t)
    if isobj(base):
        fid,pid=r.u('iq'); return {'f':fid,'p':pid} if (fid or pid) else None
    if depth>10: return None
    d={}
    for n,ft in ser_fields(t): d[n]=readval(r,ft,depth+1)
    return d
def read_mb(obj,cls):
    raw=obj.get_raw_data()
    r=R(raw)
    go=r.u('iq'); en=r.u('B'); r.al(); sc=r.u('iq'); name=r.str()
    d={'_name':name,'_go':go[1],'m_Enabled':en[0]}
    for n,ft in ser_fields(cls): d[n]=readval(r,ft)
    return d, r.p, len(raw)
