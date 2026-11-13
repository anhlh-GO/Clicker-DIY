import UnityPy,sys,json
env=UnityPy.load(sys.argv[1]); res={}
KEEP={'_OutlineWidth','_OutlineSoftness','_FaceDilate','_UnderlayOffsetX','_UnderlayOffsetY','_UnderlayDilate','_UnderlaySoftness','_GlowPower','_GlowOuter','_ScaleRatioA','_ScaleRatioB','_WeightBold','_WeightNormal','_GradientScale'}
for o in env.objects:
    if o.type.name=='Material':
        d=o.read_typetree(); sh=d['m_Shader']
        f={k:round(v,4) for k,v in d['m_SavedProperties']['m_Floats'] if k in KEEP}
        c={k:[round(v[x],3) for x in 'rgba'] for k,v in d['m_SavedProperties']['m_Colors'] if k in('_OutlineColor','_FaceColor','_UnderlayColor','_GlowColor','_Color')}
        kw=d.get('m_ValidKeywords') or d.get('m_ShaderKeywords')
        res['%s:%d'%(o.assets_file.name,o.path_id)]={'n':d['m_Name'],'f':f,'c':c,'kw':kw}
json.dump(res,open(sys.argv[2],'w'))
print(len(res))
