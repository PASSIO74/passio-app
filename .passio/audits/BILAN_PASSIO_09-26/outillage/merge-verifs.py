import json, glob, os, re
SP = os.path.dirname(os.path.abspath(__file__))
tasks = os.path.join(SP, '..', 'tasks')
out = {}
src = {}
for f in sorted(glob.glob(os.path.join(tasks, '*.output')), key=os.path.getmtime):
    try:
        txt = open(f, encoding='utf-8').read()
    except Exception:
        continue
    if 'vérification adversariale' not in txt[:400]:
        continue
    try:
        j = json.loads(txt)
    except Exception as e:
        # try to locate the result array
        m = re.search(r'"result":\s*(\[.*\])\s*,\s*"(diagnostics|failures|usage)', txt, re.S)
        if not m:
            print('illisible', f, e); continue
        try: res = json.loads(m.group(1))
        except Exception as e2: print('illisible2', f, e2); continue
    else:
        res = j.get('result') or []
    for r in res or []:
        if not r or not r.get('id'): continue
        votes = [v for v in (r.get('votes') or []) if v and v.get('verdict')]
        if not votes: continue
        # keep the most recent set per id (later files override), but merge lenses
        cur = out.setdefault(r['id'], {})
        for v in votes:
            cur[v['lens']] = v
        src[r['id']] = os.path.basename(f)
final = {k: list(v.values()) for k, v in out.items()}
json.dump(final, open(os.path.join(SP, 'verifs-partiel.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('ids vérifiés :', len(final))
# which findings lack verification?
ids_all = []
for f in glob.glob(os.path.join(SP, 'resultats', '*.json')):
    if os.path.basename(f).startswith('carto---'): continue
    d = json.load(open(f, encoding='utf-8'))
    for x in d.get('findings') or []: ids_all.append((os.path.basename(f)[:-5], x['id'], x['priorite']))
manq = [t for t in ids_all if t[1] not in final]
print('findings totaux :', len(ids_all), 'sans relecture :', len(manq))
for t in manq: print('  ', t)
