import struct,sys,json
b=open(sys.argv[1],'rb').read()
H=struct.unpack_from('<96i',b,8); sec=[(H[3*i],H[3*i+1],H[3*i+2]) for i in range(31)]
S_OFF=sec[2][0]
def s(i):
    e=b.index(b'\0',S_OFF+i); return b[S_OFF+i:e].decode('utf8','replace')
def rows(k,fmt):
    off,size,cnt=sec[k]; sz=struct.calcsize(fmt); return [struct.unpack_from(fmt,b,off+i*sz) for i in range(cnt)]
TD=rows(19,'<IIHHHHIIIIIIIIIHHHHHHHHII'); FD=rows(11,'<IHI'); FDV=rows(7,'<IHI')
DOFF=sec[8][0]
def cu(o):
    x=b[o]
    if x&0x80==0: return x
    if x&0xc0==0x80: return ((x&0x3f)<<8)|b[o+1]
    if x&0xe0==0xc0: return ((x&0x1f)<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3]
    if x==0xf0: return struct.unpack_from('<I',b,o+1)[0]
    return 0
def ci(o):
    v=cu(o); return (v>>1) if not v&1 else -(v>>1)-1
dv={f:(t,d) for f,t,d in FDV}
want=sys.argv[2].split(',')
for ti,t in enumerate(TD):
    nm=s(t[0])
    if nm in want:
        fs=t[7]; fc=t[17]
        print(nm,{s(FD[k][0]):ci(DOFF+dv[k][1]) for k in range(fs+1,fs+fc) if k in dv})
