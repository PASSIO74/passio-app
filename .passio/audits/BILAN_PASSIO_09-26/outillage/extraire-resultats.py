#!/usr/bin/env python3
# Extrait les résultats de domaine des journaux de workflow vers resultats/<slug>.json et prépare les args de vérification.
import json,os,sys
from collections import Counter
W='/root/.claude/projects/-home-user-passio-app/8e50efcd-cd50-5123-9eb7-687c6d323ca2/subagents/workflows'
S='/tmp/claude-0/-home-user-passio-app/8e50efcd-cd50-5123-9eb7-687c6d323ca2/scratchpad'
os.makedirs(f'{S}/resultats',exist_ok=True)
wfs=sys.argv[1:] or ['wf_88162f42-eea','wf_0e461f5d-cad','wf_fe3cb58d-070','wf_49c0dbab-166']
nouveaux=[]
for d in wfs:
    j=f'{W}/{d}/journal.jsonl'
    if not os.path.exists(j): continue
    for line in open(j):
        try: o=json.loads(line)
        except: continue
        if o.get('type')!='result': continue
        r=o['result']
        if not r or not isinstance(r,dict) or 'domaine' not in r: print(d,o.get('agentId'),'VIDE/INVALIDE'); continue
        dom=r['domaine']
        KEYS=['carto','ux-onboarding','contenu','messagerie-notifs','irl','profils-passions','moderation','auth-rgpd','supabase-isolation','code-nettoyage','perf-capacite-couts','pilotage-sentinelle','appareils-a11y','robustesse-pannes','exploitation-continuite','tests-ci']
        low=dom.lower(); key=next((k for k in KEYS if low.startswith(k) or k in low), None)
        slug=key or ''.join(c if c.isalnum() else '-' for c in low)[:40]
        if key: dom=key
        p=f"{S}/resultats/{slug}.json"
        if os.path.exists(p): continue
        json.dump(r,open(p,'w'),ensure_ascii=False,indent=1)
        nouveaux.append((dom,p,r))
for dom,p,r in nouveaux:
    print('==',dom,'| controles',len(r['controles']),'| findings',len(r['findings']),'| fichier',p)
    print('   statuts:',dict(Counter(c['statut'] for c in r['controles'])),'| prios:',dict(Counter(f['priorite'] for f in r['findings'])))
    for f in r['findings']: print(f"   [{f['priorite']}] {f['id']} — {f['titre'][:120]} ({f['confiance']})")
    args=[{'id':f['id'],'domaine':dom,'priorite':f['priorite'],'fichier':p} for f in r['findings']]
    a=f"{S}/args-verif-{os.path.basename(p)}"
    json.dump(args,open(a,'w'),ensure_ascii=False)
    print('   args:',a)
if not nouveaux: print('aucun nouveau résultat')
