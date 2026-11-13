import struct,sys,pickle,json,os
b=open(sys.argv[1],'rb').read(); T=pickle.load(open(sys.argv[2],'rb'))
H=struct.unpack_from('<96i',b,8)
sec=[(H[3*i],H[3*i+1],H[3*i+2]) for i in range(31)]
S_OFF=sec[2][0]
def s(i):
    e=b.index(b'\0',S_OFF+i); return b[S_OFF+i:e].decode('utf8','replace')
def rows(k,fmt):
    off,size,cnt=sec[k]; sz=struct.calcsize(fmt); return [struct.unpack_from(fmt,b,off+i*sz) for i in range(cnt)]
TD=rows(19,'<IIHHHHIIIIIIIIIHHHHHHHHII')
FD=rows(11,'<IHI')
MD=rows(5,'<IHHIIHIHHHH')
IM=rows(20,'<IIHIHIiIII')
NT=rows(15,'<I')
types=T['types']; gen=T['gen']; arr=T['arr']
tdname=[]
for t in TD:
    ns=s(t[1]); n=s(t[0]); tdname.append((ns+'.' if ns else '')+n)
# declaring type for nested names
decl={}
for i,t in enumerate(TD):
    for k in range(t[11],t[11]+t[19]): decl[NT[k][0]]=i
def full(i):
    if i in decl: return full(decl[i])+'/'+s(TD[i][0])
    return tdname[i]
tdname=[full(i) for i in range(len(TD))]
PRIM={1:'void',2:'bool',3:'char',4:'sbyte',5:'byte',6:'short',7:'ushort',8:'int',9:'uint',0xa:'long',0xb:'ulong',0xc:'float',0xd:'double',0xe:'string',0x18:'IntPtr',0x19:'UIntPtr',0x1c:'object'}
def tname(ti,depth=0):
    d,bits=types[ti]; t=(bits>>16)&0xff
    if t in PRIM: return PRIM[t]
    if t in (0x11,0x12): return tdname[d] if d<len(tdname) else '?td%d'%d
    if t==0x1d: return tname(arr[ti],depth+1)+'[]'
    if t==0x15:
        g,args=gen[ti]; return tname(g)+'<'+','.join(tname(a) for a in args)+'>'
    if t in (0x13,0x1e): return 'T'
    return '?t%x'%t
def tkind(ti):
    d,bits=types[ti]; return (bits>>16)&0xff, bits&0xffff, (bits>>29)&1 if False else None
# custom attrs: attributeDataRange
ADR=rows(25,'<II'); AD_OFF=sec[24][0]
def cu(o):
    x=b[o]
    if x&0x80==0: return x,1
    if x&0xc0==0x80: return ((x&0x3f)<<8)|b[o+1],2
    if x&0xe0==0xc0: return ((x&0x1f)<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3],4
    return struct.unpack_from('<I',b,o+1)[0],5
ADI={}
for img in IM:
    for k in range(img[8],img[8]+img[9]): ADI[(img[0],ADR[k][0])]=k
def attrs_for(img,token):
    k=ADI.get((img[0],token))
    if k is not None:
        if True:
            o=AD_OFF+ADR[k][1]; n,l=cu(o); o+=l
            res=[]
            for j in range(n):
                mi=struct.unpack_from('<I',b,o+4*j)[0]
                if mi<len(MD): res.append(tdname[MD[mi][1]])
            return res
    return []
# image per typedef
tdimg={}
for img in IM:
    for k in range(img[2],img[2]+img[3]): tdimg[k]=img
out={}
for i,t in enumerate(TD):
    img=tdimg.get(i); asm=s(img[0]) if img else ''
    fs=t[7]; fc=t[17]
    fields=[]
    for k in range(fs,fs+fc):
        n,ti,tok=FD[k]
        d,bits=types[ti]; at=bits&0xffff
        ca=attrs_for(img,tok) if img else []
        fields.append({'n':s(n),'t':tname(ti),'a':at,'ca':[c.split('.')[-1] for c in ca],'k':(bits>>16)&0xff})
    par=tname(t[4]) if t[4]!=0xffff else None
    out[tdname[i]]={'asm':asm,'parent':par,'flags':t[6],'fields':fields,'vt':(types[t[2]][1]>>31)&1}
json.dump(out,open(sys.argv[3],'w'),indent=0)
for k in ['Clicker.KeycapConfig','Clicker.GameConfig','ScoopGame.ScoopGameController','DreamHouse.RoomConfig']:
    print(k,out.get(k))
if len(sys.argv)>4:
    for i,t in enumerate(TD):
        if tdname[i] in ('Clicker.KeycapConfig','ScoopGame.ScoopGameController','System.Enum','System.Object','Clicker.KeycapItemData'):
            print(tdname[i],t[:8],[tname(x) if x!=0xffff else None for x in t[2:5]])
# methods
MP=json.load(open(os.path.join(os.path.dirname(sys.argv[3]),'mptrs.json')))
PD=rows(10,'<IIH')
meth={}
for i,t in enumerate(TD):
    img=tdimg.get(i)
    if not img or s(img[0])!='Assembly-CSharp.dll': continue
    ms=[]
    for k in range(t[8],t[8]+t[15]):
        m=MD[k]; rid=m[6]&0xffffff
        ps=[(s(PD[m[4]+j][0]),tname(PD[m[4]+j][2])) for j in range(m[10])]
        addr=MP[rid-1] if rid-1<len(MP) else 0
        ms.append([s(m[0]),hex(addr),tname(m[2]),ps])
    meth[tdname[i]]=ms
json.dump(meth,open(os.path.join(os.path.dirname(sys.argv[3]),'methods.json'),'w'),indent=0)
# string literals
SL=rows(0,'<I'); sld=sec[1][0]
lits=[]
for k,(di,) in enumerate(SL):
    nxt=SL[k+1][0] if k+1<len(SL) else sec[1][1]
    lits.append(b[sld+di:sld+nxt].decode('utf8','replace'))
json.dump(lits,open(os.path.join(os.path.dirname(sys.argv[3]),'lits.json'),'w'))
