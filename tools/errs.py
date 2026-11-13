import json,collections,glob,sys
c=collections.Counter()
for f in glob.glob(sys.argv[1]+'/*.json'):
  try: d=json.load(open(f))
  except: continue
  if not isinstance(d,dict) or 'nodes' not in d: continue
  for n in d['nodes'].values():
    for x in n.get('c',[]):
      if x['t']=='ERR': c[str(x['ty'])+str(x.get('s'))+x['e']]+=1
print(c.most_common(10))
