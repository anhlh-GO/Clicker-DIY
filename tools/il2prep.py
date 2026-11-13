# build symbol cache: addr->method name (all images), field offsets, usage tables
import struct,sys,pickle,json,os
sys.argv=[sys.argv[0],sys.argv[1],sys.argv[2],sys.argv[3]]
META,SO,OUT=sys.argv[1:4]
b=open(META,'rb').read()
H=struct.unpack_from('<96i',b,8); sec=[(H[3*i],H[3*i+1],H[3*i+2]) for i in range(31)]
S_OFF=sec[2][0]
def s(i):
    e=b.index(b'\0',S_OFF+i); return b[S_OFF+i:e].decode('utf8','replace')
def rows(k,fmt):
    off,size,cnt=sec[k]; sz=struct.calcsize(fmt); return [struct.unpack_from(fmt,b,off+i*sz) for i in range(cnt)]
TD=rows(19,'<IIHHHHIIIIIIIIIHHHHHHHHII'); FD=rows(11,'<IHI'); MD=rows(5,'<IHHIIHIHHHH')
IM=rows(20,'<IIHIHIiIII'); NT=rows(15,'<I'); FR=rows(22,'<HI')
T=pickle.load(open(os.path.join(os.path.dirname(OUT),'types.pkl'),'rb'))
types=T['types']
tdn=[]
for t in TD:
    ns=s(t[1]); tdn.append((ns+'.' if ns else '')+s(t[0]))
decl={}
for i,t in enumerate(TD):
    for k in range(t[11],t[11]+t[19]): decl[NT[k][0]]=i
def full(i): return full(decl[i])+'/'+s(TD[i][0]) if i in decl else tdn[i]
tdn=[full(i) for i in range(len(TD))]
mdecl={}
for i,t in enumerate(TD):
    for k in range(t[8],t[8]+t[15]): mdecl[k]=i
fdecl={}
for i,t in enumerate(TD):
    for k in range(t[7],t[7]+t[17]): fdecl[k]=(i,k-t[7])
# ELF
from elftools.elf.elffile import ELFFile
f=open(SO,'rb'); data=bytearray(f.read()); f.seek(0); elf=ELFFile(f)
rel={}
for sct in elf.iter_sections():
    if sct.header.sh_type=='SHT_RELA':
        for r in sct.iter_relocations():
            if r['r_info_type']==1027: rel[r['r_offset']]=r['r_addend']
segs=[(p['p_vaddr'],p['p_offset'],p['p_filesz']) for p in elf.iter_segments() if p['p_type']=='PT_LOAD']
def v2o(v):
    for va,off,sz in segs:
        if va<=v<va+sz: return v-va+off
def o2v(o):
    for va,off,sz in segs:
        if off<=o<off+sz: return o-off+va
orig=bytes(data)
for va,a in rel.items():
    o=v2o(va)
    if o is not None: struct.pack_into('<Q',data,o,a)
def q(v): return struct.unpack_from('<Q',data,v2o(v))[0]
addr={}
radd={}
for va,a in rel.items(): radd.setdefault(a,[]).append(va)
for img in IM:
    nm=s(img[0]).encode()+b'\0'
    i=data.find(nm)
    while i!=-1 and data[i-1]!=0: i=data.find(nm,i+1)
    if i<0: continue
    sva=o2v(i)
    for m in radd.get(sva,[]):
        cnt=q(m+8)
        if not (0<cnt<300000): continue
        ptrs=q(m+16)
        # map rid -> method index within image
        rid2m={}
        for ti in range(img[2],img[2]+img[3]):
            t=TD[ti]
            for k in range(t[8],t[8]+t[15]): rid2m[MD[k][6]&0xffffff]=k
        for r in range(cnt):
            a=q(ptrs+8*r)
            if a and (r+1) in rid2m:
                k=rid2m[r+1]; addr.setdefault(a,tdn[mdecl[k]]+'::'+s(MD[k][0]))
        break
print('methods',len(addr))
# field offsets
mr=0x610ba60-80
fo_cnt=q(mr+80); fo_ptr=q(mr+88)
foffs={}
for ti in range(min(fo_cnt,len(TD))):
    p=q(fo_ptr+8*ti)
    if not p: continue
    t=TD[ti]; o=v2o(p)
    foffs[tdn[ti]]=[(s(FD[t[7]+j][0]),struct.unpack_from('<i',data,o+4*j)[0]) for j in range(t[17])]
# usage tables
def tname_simple(ti):
    d,bits=types[ti]; k=(bits>>16)&0xff
    if k in(0x11,0x12) and d<len(tdn): return tdn[d]
    return 'type%d(k%x)'%(ti,k)
SL=rows(0,'<I'); sld=sec[1][0]
lits=[]
for k,(di,) in enumerate(SL):
    nxt=SL[k+1][0] if k+1<len(SL) else sec[1][1]
    lits.append(b[sld+di:sld+nxt].decode('utf8','replace'))
mnames=[tdn[mdecl[k]]+'::'+s(MD[k][0]) if k in mdecl else '?' for k in range(len(MD))]
frn=[]
for ti,fi in FR:
    d,bits=types[ti]; k=(bits>>16)&0xff
    if k in(0x11,0x12) and d<len(TD): frn.append(tdn[d]+'.'+s(FD[TD[d][7]+fi][0]))
    else: frn.append('fr?')
# methodSpecs for usage type 6
ms_cnt=q(mr+64); ms_ptr=q(mr+72)
mspec=[]
for i in range(ms_cnt):
    mi=struct.unpack_from('<i',data,v2o(ms_ptr+12*i))[0]
    mspec.append(mnames[mi] if 0<=mi<len(mnames) else '?')
pickle.dump({'addr':addr,'foffs':foffs,'tn':[tname_simple(i) for i in range(T['n'])],'lits':lits,'mn':mnames,'fr':frn,'ms':mspec},open(OUT,'wb'))
print('ok')
