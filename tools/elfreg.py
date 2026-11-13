# find Il2CppMetadataRegistration in libil2cpp.so (arm64) and dump types
import struct,sys,pickle
from elftools.elf.elffile import ELFFile
so=sys.argv[1]; ntd=int(sys.argv[2])
f=open(so,'rb'); data=bytearray(f.read()); f.seek(0); elf=ELFFile(f)
# apply RELATIVE relocs
rel={}
for s in elf.iter_sections():
    if s.header.sh_type=='SHT_RELA':
        for r in s.iter_relocations():
            if r['r_info_type']==1027: rel[r['r_offset']]=r['r_addend']
segs=[(p['p_vaddr'],p['p_offset'],p['p_filesz']) for p in elf.iter_segments() if p['p_type']=='PT_LOAD']
def v2o(v):
    for va,off,sz in segs:
        if va<=v<va+sz: return v-va+off
    return None
def o2v(o):
    for va,off,sz in segs:
        if off<=o<off+sz: return o-off+va
for va,a in rel.items():
    o=v2o(va)
    if o is not None: struct.pack_into('<Q',data,o,a)
print('relocs',len(rel))
def q(v): return struct.unpack_from('<Q',data,v2o(v))[0]
# search
cands=[]
for va,off,sz in segs:
    for o in range(off,off+sz-64,8):
        if struct.unpack_from('<Q',data,o)[0]==ntd and struct.unpack_from('<Q',data,o+16)[0]==ntd:
            cands.append(o2v(o))
print('cands',[hex(c) for c in cands])
mr=cands[0]-80
vals=[q(mr+8*i) for i in range(16)]
print([hex(x) for x in vals])
typesCount,types=vals[6],vals[7]
print('typesCount',typesCount)
out=[]
for i in range(typesCount):
    p=q(types+8*i); o=v2o(p)
    d,bits=struct.unpack_from('<QI',data,o)
    out.append((d,bits))
# resolve generic classes + insts lazily: store raw blob access
def readtype(p):
    d,bits=struct.unpack_from('<QI',data,v2o(p)); return d,bits
gen={}
for i,(d,bits) in enumerate(out):
    t=(bits>>16)&0xff
    if t==0x15:
        tp=q(d); ci=q(d+8)
        argc=q(ci); argv=q(ci+8)
        args=[q(argv+8*k) for k in range(argc)]
        gen[i]=(tp,args)
# map type pointers -> index
ptr2i={q(types+8*i):i for i in range(typesCount)}
def pidx(p):
    if p in ptr2i: return ptr2i[p]
    d,bits=readtype(p); out.append((d,bits)); ptr2i[p]=len(out)-1; return len(out)-1
G={}
for i,(tp,args) in gen.items(): G[i]=(pidx(tp),[pidx(a) for a in args])
# szarray elem
A={}
for i,(d,bits) in enumerate(list(out)):
    t=(bits>>16)&0xff
    if t==0x1d: A[i]=pidx(d)
for i,(d,bits) in enumerate(list(out)):
    t=(bits>>16)&0xff
    if t==0x1d and i not in A: A[i]=pidx(d)
    if t==0x15 and i not in G:
        tp=q(d); ci=q(d+8); argc=q(ci); argv=q(ci+8); G[i]=(pidx(tp),[pidx(q(argv+8*k)) for k in range(argc)])
pickle.dump({'types':out,'gen':G,'arr':A,'n':typesCount},open(sys.argv[3],'wb'))
print('done',len(out))
