# Print an exported bf prefab as an indented tree with component summaries:  python3 -I tools/bf_tree.py ViewName [maxDepth]
import json, sys, os
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
B = json.load(open(os.path.join(R, 'data/bf.json'))); P = json.load(open(os.path.join(R, 'data/bf_pack.json')))
roots = json.load(open(os.path.join(R, 'data/bf_roots.json')))
N = P['names']
def short(v):
    if isinstance(v, str) and v.startswith('bf:'):
        n = B['nodes'].get(v[3:]); g = B['c2g'].get(v[3:])
        if n: return '@' + n['n']
        if g is not None: return '@' + B['nodes'][str(g)]['n'] + '#' + v[3:]
        return N.get(v, v)
    if isinstance(v, dict): return {k: short(x) for k, x in v.items() if k not in ('m_Enabled', 'm_Script', 'm_Name', 'm_EditorHideFlags', 'm_EditorClassIdentifier')}
    if isinstance(v, list): return [short(x) for x in v]
    return v
def comp(c):
    t = c['t']
    if t == 'Img': return 'Img(%s%s)' % (N.get(c.get('sp'), '-'), ',t%d' % c['it'] if c.get('it') else '')
    if t == 'Txt': return 'Txt(%r fs%s)' % ((c.get('s') or '')[:30], c.get('fs'))
    if t == 'MB': return '%s %s' % (c['cls'].split('.')[-1], json.dumps(short(c.get('d') or {}), ensure_ascii=False)[:600])
    if t == 'Spine': return 'Spine(%s skin=%s anim=%s)' % (P['spine'].get(c.get('data'), {}).get('name'), c.get('skin'), c.get('anim'))
    return t
def walk(g, d, md):
    n = B['nodes'][str(g)]
    rt = n.get('rt'); pos = ' rt=%s' % [round(x) if abs(x) > 1.5 else x for x in rt] if rt else ''
    print('  ' * d + ('-' if n.get('off') else '') + n['n'] + pos + '  ' + ' | '.join(comp(c) for c in n.get('c', [])))
    if d < md:
        for ch in n.get('ch', []): walk(ch, d + 1, md)
walk(roots[sys.argv[1]], 0, int(sys.argv[2]) if len(sys.argv) > 2 else 99)
