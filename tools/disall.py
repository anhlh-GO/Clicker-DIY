import sys,os,io,json,contextlib
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import dis64
W=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
meth=json.load(open(os.path.join(W,'methods.json')))
C=json.load(open(os.path.join(W,'classes.json')))
skip=('AudienceNetwork','E7.','Redcode','PimDeWitte','PathologicalGames','NFramework','Maniac','GoogleMobileAds','Coffee','EasyTransition','AYellowpaper','WejoyService')
out=os.path.join(W,'dis')
n=0
for cls,ms in meth.items():
    if cls.startswith(skip) or cls.startswith('<') : continue
    root=cls.split('/')[0]
    fn=os.path.join(out,root.replace('/','+')+'.s')
    buf=io.StringIO()
    with contextlib.redirect_stdout(buf):
        c=C.get(cls,{})
        print('#### CLASS',cls,'parent=',c.get('parent'))
        fo={n_:o for n_,o in dis64.FO.get(cls,[])}
        for f in c.get('fields',[]): print('#   field %-30s %-50s off=%s attr=%x %s'%(f['n'],f['t'],hex(fo.get(f['n'],-1)) if f['n'] in fo else '-',f['a'],','.join(f['ca'])))
        for name,addr,ret,ps in ms:
            a=int(addr,16)
            if not a: print('## ',name,'(no body)'); continue
            print('## %s(%s) -> %s'%(name,', '.join('%s %s'%(t,p) for p,t in ps),ret))
            try: dis64.dis(a,cls)
            except Exception as e: print('ERR',e)
    with open(fn,'a',encoding='utf8') as f: f.write(buf.getvalue())
    n+=1
print('classes',n)
