# find CodeGenModules -> method pointers for Assembly-CSharp; dump class methods with addresses
import struct,sys,json,pickle
from elftools.elf.elffile import ELFFile
so=sys.argv[1]
f=open(so,'rb'); data=bytearray(f.read()); f.seek(0); elf=ELFFile(f)
rel={}
for s in elf.iter_sections():
    if s.header.sh_type=='SHT_RELA':
        for r in s.iter_relocations():
            if r['r_info_type']==1027: rel[r['r_offset']]=r['r_addend']
segs=[(p['p_vaddr'],p['p_offset'],p['p_filesz']) for p in elf.iter_segments() if p['p_type']=='PT_LOAD']
def v2o(v):
    for va,off,sz in segs:
        if va<=v<va+sz: return v-va+off
def o2v(o):
    for va,off,sz in segs:
        if off<=o<off+sz: return o-off+va
for va,a in rel.items():
    o=v2o(va)
    if o is not None: struct.pack_into('<Q',data,o,a)
def q(v): return struct.unpack_from('<Q',data,v2o(v))[0]
def cstr(v):
    o=v2o(v); e=data.index(b'\0',o); return data[o:e].decode('latin1')
# find string "Assembly-CSharp.dll\0"
target=b'Assembly-CSharp.dll\0'
i=data.find(target)
while i!=-1 and data[i-1]!=0: i=data.find(target,i+1)
sva=o2v(i); print('str',hex(sva))
# find pointer to it
mods=[]
for va in rel:
    if rel[va]==sva: mods.append(va)
print('refs',[hex(m) for m in mods])
res={}
for m in mods:
    cnt=q(m+8); ptrs=q(m+16)
    if 0<cnt<200000:
        res=[q(ptrs+8*k) for k in range(cnt)]
        print('module',hex(m),cnt); break
json.dump(res,open(sys.argv[2],'w'))
