import UnityPy,sys,json,os
env=UnityPy.load(sys.argv[1]); out=sys.argv[2]
objs={(o.assets_file.name,o.path_id):o for o in env.objects}
def ext(af,fid):
    if fid==0: return af.name
    return os.path.basename(af.externals[fid-1].path)
def evcurve(c,t):
    ks=c['m_Curve']
    if not ks: return 1.0
    if t<=ks[0]['time']: return ks[0]['value']
    for a,b in zip(ks,ks[1:]):
        if a['time']<=t<=b['time']:
            dt=b['time']-a['time'] or 1e-6; u=(t-a['time'])/dt
            m0=a['outSlope']*dt; m1=b['inSlope']*dt
            h00=2*u**3-3*u**2+1; h10=u**3-2*u**2+u; h01=-2*u**3+3*u**2; h11=u**3-u**2
            return h00*a['value']+h10*m0+h01*b['value']+h11*m1
    return ks[-1]['value']
def mm(v):
    if v is None: return None
    st=v['minMaxState']; s=v['scalar']
    if st==0: return ['c',round(s,4)]
    if st==3: return ['r',round(v['minScalar'],4),round(s,4)]
    if st==1: return ['k',round(s,4),[round(evcurve(v['maxCurve'],i/8),4) for i in range(9)]]
    if st==2: return ['rk',round(s,4),[round(evcurve(v['minCurve'],i/8),4) for i in range(9)],[round(evcurve(v['maxCurve'],i/8),4) for i in range(9)]]
    return ['c',round(s,4)]
def col(c): return [round(c['r'],3),round(c['g'],3),round(c['b'],3),round(c['a'],3)]
def grad(g):
    n=g.get('m_NumColorKeys',2); na=g.get('m_NumAlphaKeys',2)
    ck=[(g['ctime%d'%i]/65535, col(g['key%d'%i])[:3]) for i in range(n)]
    ak=[(g['atime%d'%i]/65535, round(g['key%d'%i]['a'],3)) for i in range(na)]
    return {'c':ck,'a':ak}
def mmcol(v):
    st=v['minMaxState']
    if st==0: return ['c',col(v['maxColor'])]
    if st==2: return ['r',col(v['minColor']),col(v['maxColor'])]
    if st==1: return ['g',grad(v['maxGradient'])]
    if st==3: return ['rg',grad(v['minGradient']),grad(v['maxGradient'])]
    return ['rg',grad(v['minGradient']),grad(v['maxGradient'])]
res={}
for o in env.objects:
    if o.type.name!='ParticleSystem': continue
    d=o.read_typetree(); I=d['InitialModule']; S=d['ShapeModule']; Em=d['EmissionModule']
    # renderer on same GO
    go=objs.get((ext(o.assets_file,d['m_GameObject']['m_FileID']),d['m_GameObject']['m_PathID']))
    tex=None; rmode=None; tiles=None; sortO=0
    if go:
        g=go.read_typetree()
        for c in g['m_Component']:
            co=objs.get((o.assets_file.name,c['component']['m_PathID']))
            if co and co.type.name=='ParticleSystemRenderer':
                r=co.read_typetree(); rmode=r.get('m_RenderMode'); sortO=r.get('m_SortingOrder',0)
                mats=r.get('m_Materials') or []
                if mats:
                    mo=objs.get((ext(co.assets_file,mats[0]['m_FileID']),mats[0]['m_PathID']))
                    if mo:
                        md=mo.read_typetree()
                        for k,v in md['m_SavedProperties']['m_TexEnvs']:
                            if k in('_MainTex','_BaseMap') and v['m_Texture']['m_PathID']:
                                tex='%s:%d'%(ext(mo.assets_file,v['m_Texture']['m_FileID']),v['m_Texture']['m_PathID']); break
    U=d['UVModule']
    if U['enabled']: tiles=[U.get('tilesX',1),U.get('tilesY',1),mm(U['frameOverTime']),mm(U['startFrame']),U.get('mode'),U.get('cycles',1)]
    e={'dur':d['lengthInSec'],'loop':d['looping'],'paw':d['playOnAwake'],'delay':mm(d['startDelay']) if isinstance(d['startDelay'],dict) else d['startDelay'],'sim':d.get('simulationSpeed',1),
       'space':I.get('simulationSpace',d.get('moveWithTransform')),
       'life':mm(I['startLifetime']),'speed':mm(I['startSpeed']),'size':mm(I['startSize']),'rot':mm(I['startRotation']),'color':mmcol(I['startColor']),
       'grav':mm(I['gravityModifier']) if isinstance(I['gravityModifier'],dict) else I['gravityModifier'],'max':I['maxNumParticles'],
       'rate':mm(Em['rateOverTime']) if Em['enabled'] else None,'bursts':[[b['time'],mm(b['countCurve']) if 'countCurve' in b else b.get('minCount'),b.get('cycleCount',1),b.get('repeatInterval',0.01)] for b in Em['m_Bursts']] if Em['enabled'] else [],
       'shape':{'en':S['enabled'],'type':S['type'],'r':S.get('radius',{}).get('value',S.get('radius')) if isinstance(S.get('radius'),dict) else S.get('radius'),'angle':S['angle'],'arc':S.get('arc',{}).get('value',360) if isinstance(S.get('arc'),dict) else S.get('arc',360),'scale':[S['m_Scale']['x'],S['m_Scale']['y']],'pos':[S['m_Position']['x'],S['m_Position']['y']],'rotz':S['m_Rotation']['z'],'rt':S.get('radiusThickness',1)},
       'colLife':mmcol(d['ColorModule']['gradient']) if d['ColorModule']['enabled'] else None,
       'sizeLife':mm(d['SizeModule']['curve']) if d['SizeModule']['enabled'] else None,
       'rotLife':mm(d['RotationModule']['curve']) if d['RotationModule']['enabled'] else None,
       'vel':[mm(d['VelocityModule']['x']),mm(d['VelocityModule']['y'])] if d['VelocityModule']['enabled'] else None,
       'force':[mm(d['ForceModule']['x']),mm(d['ForceModule']['y'])] if d['ForceModule']['enabled'] else None,
       'tex':tex,'rmode':rmode,'tiles':tiles,'o':sortO,'scaling':d.get('scalingMode')}
    res['%s:%d'%(o.assets_file.name,o.path_id)]=e
json.dump(res,open(out,'w'),separators=(',',':'))
print(len(res))
for k,v in list(res.items())[:3]: print(k,json.dumps(v)[:400])
