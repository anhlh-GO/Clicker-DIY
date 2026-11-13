import sys,struct,pickle,re,bisect,os,json
from capstone import *
W=os.path.join(os.path.dirname(__file__),'..')
SYM=pickle.load(open(os.path.join(W,'sym.pkl'),'rb'))
so=open(os.path.join(W,'charm/lib/lib/arm64-v8a/libil2cpp.so'),'rb').read()
from elftools.elf.elffile import ELFFile
import io
segs=[]
e=ELFFile(io.BytesIO(so))
for p in e.iter_segments():
    if p['p_type']=='PT_LOAD': segs.append((p['p_vaddr'],p['p_offset'],p['p_filesz']))
def rd(va,n):
    for sva,off,fs in segs:
        if sva<=va<sva+fs: return so[off+va-sva:off+va-sva+n]
addr=SYM['addr']; A=sorted(addr)
REL={}
for sc in e.iter_sections():
    if sc.name=='.rela.dyn':
        raw=so[sc['sh_offset']:sc['sh_offset']+sc['sh_size']]
        for off,info,add in struct.iter_unpack('<QQq',raw):
            if info&0xffffffff==1027: REL[off]=add
byname={}
for a,n in addr.items(): byname.setdefault(n,[]).append(a)
# field offset name lookup per class
FO=SYM['foffs']
def decode_slot(v):
    if not v&1: return None
    t=(v>>29)&7; i=(v&0x1ffffffe)>>1
    try:
        if t==1 or t==2: return 'T:'+SYM['tn'][i]
        if t==3: return 'M:'+SYM['mn'][i]
        if t==4: return 'F:'+SYM['fr'][i]
        if t==5: return 'S:'+repr(SYM['lits'][i][:70])
        if t==6: return 'MS:'+SYM['ms'][i]
    except IndexError: return None
md=Cs(CS_ARCH_ARM64,CS_MODE_ARM)
def fields_of(cls):
    return {o:n for n,o in FO.get(cls,[])}
def dis(start,cls=None,maxn=0x4000):
    i=bisect.bisect_right(A,start); end=A[i] if i<len(A) else start+0x800
    end=min(end,start+maxn)
    code=rd(start,end-start); pages={}
    fm=fields_of(cls) if cls else {}
    print('----',addr.get(start,hex(start)),hex(start))
    for ins in md.disasm(code,start):
        ops=ins.op_str; note=''
        mn=ins.mnemonic
        if mn=='adrp':
            r,imm=ops.split(', '); pages[r]=int(imm.lstrip('#'),0)
        elif mn in('ldr','add') and pages:
            m=re.match(r'(\w+), \[?(\w+)(?:, #(0x[0-9a-f]+|\d+))?\]?',ops)
            if m and m.group(2) in pages:
                a=pages[m.group(2)]+(int(m.group(3),0) if m.group(3) else 0)
                if mn=='ldr':
                    if a in REL:
                        tgt=REL[a]; raw=rd(tgt,8)
                        v=struct.unpack('<Q',raw)[0] if raw else 0
                        d=decode_slot(v)
                        note=d or ('&%x(=%x)'%(tgt,v))
                    else:
                        raw=rd(a,8)
                        if raw:
                            v=struct.unpack('<Q',raw)[0]
                            f1,f2=struct.unpack('<ff',raw)
                            note='[%x]=%x f=%g,%g'%(a,v,f1,f2)
                else:
                    note='&%x'%a
                    raw=rd(a,8)
        if mn in('bl','b') and ops.startswith('#'):
            t=int(ops[1:],0); note=addr.get(t,'')
            if not note and mn=='bl':
                # thunk?
                c=rd(t,4)
                note='fn_%x'%t
        if mn in('ldr','str','ldrb','strb','ldur','stur','ldp','stp','ldrsw','ldr','str') and 'x0, #' in ops or (cls and re.search(r'\[x(19|20|21|0), #0x',ops)):
            m=re.search(r'\[x(\d+), #(0x[0-9a-f]+)\]',ops)
            if m and fm:
                o=int(m.group(2),16)
                if o in fm: note=(note+' ' if note else '')+'.'+fm[o]
        if mn in('fmov',) and '#' in ops: pass
        print('%08x: %-7s %-42s %s'%(ins.address,mn,ops,note))
        if mn=='ret' and ins.address>start+8 and False: break
if __name__=='__main__':
    for a in sys.argv[1:]:
        if a.startswith('0x'): dis(int(a,16))
        else:
            cls=a.split('::')[0]
            for ad in byname.get(a,[]): dis(ad,cls)
            if a not in byname: print('NF',a)
