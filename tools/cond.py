import sys,re
keep_ops=re.compile(r'^(movi|ldr s|ldr d|cmp|cmn|b\.|cbz|cbnz|tbz|tbnz|fmov|fcmp|csel|cset|fcsel|ret|b$|scvtf|fcvtzs|fadd|fsub|fmul|fdiv|add|sub|mul|sdiv)')
for path in sys.argv[1:]:
    out=[]
    for line in open(path,encoding='utf-8',errors='replace'):
        line=line.rstrip('\n')
        if line.startswith('#'):
            out.append(line); continue
        if line.startswith('----'): continue
        m=re.match(r'^([0-9a-f]{8}): (\S+)\s+(.*?)\s{2,}(.*)$',line) or re.match(r'^([0-9a-f]{8}): (\S+)\s*(.*?)()$',line)
        if not m: out.append(line); continue
        a,op,args,note=m.groups(); note=note.strip(); args=args.strip()
        if note.startswith('fn_'): 
            continue
        if op in('stp','ldp') and not note: continue
        if op=='adrp': continue
        if note and 'AdsManager::<OnApplicationPause>' in note: note='(Action type)'
        if note or keep_ops.match(op+' '+args[:2]) or (op=='mov' and ('#' in args or 'zr' in args)) or op=='movk':
            if op in('add','sub') and ('sp' in args) : continue
            if op in('add','sub','mul') and not note and '#' not in args: continue
            out.append(f"{a[-4:]} {op} {args}" + (f"  ;{note}" if note else ''))
    open('cond/'+path.split('/')[-1],'w',encoding='utf-8').write('\n'.join(out))
