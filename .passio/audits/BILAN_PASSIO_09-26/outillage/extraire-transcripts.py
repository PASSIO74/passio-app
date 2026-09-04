import json, glob, os, re, sys
WF = '/root/.claude/projects/-home-user-passio-app/8e50efcd-cd50-5123-9eb7-687c6d323ca2/subagents/workflows'
SP = os.path.dirname(os.path.abspath(__file__))
DOMS = ['irl','profils-passions','auth-rgpd','robustesse-pannes','perf-capacite-couts','appareils-a11y','exploitation-continuite']
rows = []
for f in glob.glob(os.path.join(WF, 'wf_*', 'agent-*.jsonl')):
    try:
        first = open(f, encoding='utf-8').readline()
    except Exception: continue
    m = re.search(r'Ton domaine : « ([^»]+) »', first)
    if not m: continue
    dom = m.group(1).strip()
    if dom not in DOMS: continue
    texts = []; ntool = 0; last_ts = ''
    for line in open(f, encoding='utf-8'):
        try: j = json.loads(line)
        except Exception: continue
        last_ts = j.get('timestamp', last_ts) or last_ts
        if j.get('type') != 'assistant': continue
        for c in (j.get('message') or {}).get('content') or []:
            if c.get('type') == 'text' and c.get('text','').strip(): texts.append(c['text'].strip())
            elif c.get('type') == 'tool_use': ntool += 1
    out = os.path.join(SP, 'transcripts', f'{dom}__{os.path.basename(os.path.dirname(f))}.md')
    open(out, 'w', encoding='utf-8').write(f'# {dom} — {f}\n\n' + '\n\n---\n\n'.join(texts))
    rows.append((dom, os.path.basename(os.path.dirname(f)), os.path.getsize(f), ntool, len(texts), sum(len(t) for t in texts), last_ts[:19]))
for r in sorted(rows): print(r)
