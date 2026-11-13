import UnityPy,sys,os,json
env=UnityPy.load(sys.argv[1]); out=sys.argv[2]
tex={}; spr={}
for o in env.objects:
    if o.type.name=='Texture2D':
        t=o.read(); key='%s:%d'%(o.assets_file.name,o.path_id)
        fn='%s_%d.webp'%(o.assets_file.name.replace('.assets','').replace('sharedassets','s').replace('resources','r'),o.path_id)
        try:
            im=t.image
            if not os.path.exists(os.path.join(out,'tex',fn)):
                im.save(os.path.join(out,'tex',fn),'WEBP',quality=88,method=4)
            tex[key]={'f':fn,'w':t.m_Width,'h':t.m_Height,'n':t.m_Name}
        except Exception as e: tex[key]={'err':str(e)[:80],'n':t.m_Name}
for o in env.objects:
    if o.type.name=='Sprite':
        s=o.read(); key='%s:%d'%(o.assets_file.name,o.path_id)
        rd=s.m_RD; tp=rd.texture
        tk='%s:%d'%(os.path.basename(o.assets_file.externals[tp.file_id-1].path) if tp.file_id else o.assets_file.name, tp.path_id)
        r=rd.textureRect
        spr[key]={'n':s.m_Name,'t':tk,'r':[r.x,r.y,r.width,r.height],'rect':[s.m_Rect.x,s.m_Rect.y,s.m_Rect.width,s.m_Rect.height],
          'off':[rd.textureRectOffset.x,rd.textureRectOffset.y],'pv':[s.m_Pivot.x,s.m_Pivot.y],'ppu':s.m_PixelsToUnits,
          'b':[s.m_Border.x,s.m_Border.y,s.m_Border.z,s.m_Border.w],'pk':rd.settingsRaw}
json.dump({'tex':tex,'spr':spr},open(os.path.join(out,'texmeta.json'),'w'))
print(len(tex),len(spr),sum(1 for v in tex.values() if 'err' in v))
