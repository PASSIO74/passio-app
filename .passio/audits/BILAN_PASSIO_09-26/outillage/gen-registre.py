import json, glob, os
from collections import Counter, defaultdict
SP=os.path.dirname(os.path.abspath(__file__)); OUT='/home/user/passio-app/.passio/audits/BILAN_PASSIO_09-26'
reg=json.load(open(os.path.join(SP,'registre-problemes.json'),encoding='utf-8'))
ordre={'P0':0,'P1':1,'P2':2,'P3':3}
def rel(r):
    s=r['relecture']
    return 'Réfuté' if 'RÉFUTÉ' in s else ('Confirmé' if 'CONFIRMÉ' in s else ('Incertain' if 'INCERTAIN' in s else 'Non relu'))
reg.sort(key=lambda r:(ordre[r['priorite_retenue']], r['domaine'], r['id']))
retenus=[r for r in reg if rel(r)!='Réfuté']
cnt=Counter(r['priorite_retenue'] for r in retenus); relc=Counter(rel(r) for r in reg)
nonrelus_dom=sorted({r['domaine'] for r in reg if rel(r)=='Non relu'})
cell=lambda s: str(s or '').replace('|','\\|').replace('\n',' ').strip()
RAP={'carto':'02','ux-onboarding':'03','contenu':'04','messagerie-notifs':'04','irl':'04','profils-passions':'04','robustesse-pannes':'04','tests-ci':'04','code-nettoyage':'05','supabase-isolation':'06','auth-rgpd':'06','perf-capacite-couts':'07','pilotage-sentinelle':'08','appareils-a11y':'09','moderation':'10','exploitation-continuite':'10'}
L=["# Registre complet des risques — BILAN PASSIO 09/26\n",
"> SHA audité : `c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf` (main, 2026-09-04). Modèle : Claude Fable 5.1. Ce registre consolide TOUS les problèmes rapportés par les 16 domaines, avec la priorité RETENUE après relecture adversariale (angles reproduction / impact) quand elle a pu avoir lieu. Les problèmes réfutés par la relecture sont conservés, marqués « Réfuté », jamais effacés. Le détail de chaque problème (attendu, observé, reproduction, preuve, impact, visibilité Pilotage, détection Sentinelle, correction, risque de régression, effort, votes des relecteurs) est dans le rapport de domaine indiqué (colonne « Rapport »).\n",
"## 1. Comptage\n","| Priorité | Définition | Nombre retenu |\n|---|---|---|",
f"| **P0** | bloque la commercialisation | **{cnt['P0']}** |", f"| **P1** | à corriger avant tout lancement public | **{cnt['P1']}** |",
f"| **P2** | amélioration importante | **{cnt['P2']}** |", f"| **P3** | optimisation future | **{cnt['P3']}** |",
f"| Réfutés par la relecture | conservés pour mémoire | {relc['Réfuté']} |", f"| **Total rapporté** | | **{len(reg)}** |\n",
f"Relecture adversariale : {relc['Confirmé']} confirmés · {relc['Incertain']} incertains · {relc['Réfuté']} réfutés · **{relc['Non relu']} non relus** (crédits de session épuisés : domaines {', '.join(nonrelus_dom)}). Les problèmes non relus sont à traiter en priorité par la contre-revue GPT-6 Astra.\n",
"## 2. Par domaine\n","| Domaine | Rapport | P0 | P1 | P2 | P3 | Réfutés | Relecture |\n|---|---|---|---|---|---|---|---|"]
bd=defaultdict(Counter)
for r in reg:
    k=r['domaine']
    if rel(r)=='Réfuté': bd[k]['ref']+=1
    else: bd[k][r['priorite_retenue']]+=1
    bd[k]['relu' if rel(r)!='Non relu' else 'nonrelu']+=1
for k in sorted(bd):
    v=bd[k]; L.append(f"| {k} | {RAP.get(k,'?')} | {v['P0']} | {v['P1']} | {v['P2']} | {v['P3']} | {v['ref']} | {'oui' if v['relu'] and not v['nonrelu'] else ('partielle' if v['relu'] else 'NON (crédits)')} |")
L+=["","## 3. Registre (trié par priorité retenue)\n","Colonnes : priorité retenue (initiale de l'auditeur entre parenthèses si différente) · relecture · effort estimé · correction proposée (résumé).\n"]
for p in ['P0','P1','P2','P3']:
    rows=[r for r in reg if r['priorite_retenue']==p]
    L.append(f"### {p} — {len([r for r in rows if rel(r)!='Réfuté'])} retenus\n")
    L.append("| Id | Domaine | Rapport | Relecture | Titre | Effort | Correction (résumé) |\n|---|---|---|---|---|---|---|")
    for r in rows:
        pri = p if r['priorite']==p else f"{p} (init. {r['priorite']})"
        L.append(f"| **{cell(r['id'])}** | {cell(r['domaine'])} | {RAP.get(r['domaine'],'?')} | {rel(r)} | {cell(r['titre'])} | {cell(r.get('effort'))[:80]} | {cell(r.get('correction'))[:220]} |")
    L.append("")
L+=["## 4. Doublons et recoupements entre domaines\n","Plusieurs domaines ont rapporté le même fait sous des angles différents. Ils sont conservés séparément (chacun porte sa preuve et sa reproduction), mais comptent pour UN chantier :\n",
"- **Pièces jointes et médias publics, listables par anon** : SUP-01, MSG-03, CONT-11 (P0) — un seul chantier (bucket `attachments` privé + URL signées, retrait du listing anon).",
"- **Staging inexistant** : SUP-04 (P0), EXP-11, TCI-04 (P1).",
"- **Restauration jamais prouvée** : EXP-01 (P0), TCI-03, EXP-02, EXP-04, NET-07, SUP-08.",
"- **conv_reads public** : SUP-02, MSG-05 (P1), SUP-15 (P3).",
"- **Aucun rate-limit sur posts/commentaires/messages/notifications** : CONT-08, MOD-06, SUP-07, MSG-04 (P1), MSG-12 (P3).",
"- **Suppression de compte incomplète** : SUP-10, AUTH-05 (P1), AUTH-12 (P3).",
"- **Âge / mineurs / allégation « contrôle d'âge IA »** : UXO-07, AUTH-02, MOD-08, IRL-02 (P1), EXP-14 (P2).",
"- **CGU, mentions légales, DSA, support, RGPD** : MOD-09, AUTH-03, AUTH-09, AUTH-11, EXP-07, EXP-08, EXP-09 (P1) ; AUTH-10 (P2).",
"- **Gate 2125 sans valeur, code en clair dans un dépôt public** : AUTH-01 (P1), EXP-10 (P1).",
"- **Télémétrie sans consentement, non bornée, jamais purgée** : PIL-03, AUTH-04 (P1), PERF-04, EXP-15 (P2).",
"- **UPDATE sans WITH CHECK (events, post_comments, conv_messages)** : SUP-03 (P1), SUP-09, IRL-08 (P2).",
"- **Publication non renvoyée (« Sync… » à vie)** : CONT-02 (P1), ROB-01 (P2), CONT-03.",
"- **Canaux Realtime broadcast publics** : SUP-06 (P1), MSG-01 (P0, XSS par ce canal), MSG-15.",
"- **Identité affichée choisie par le client** : PRO-02 (P1), MSG-15 (indicateur de frappe).",
"- **Isolation inter-comptes sur l'appareil** : AUTH-06 (file de messages rejouée sous l'identité du compte suivant, P1), MSG-14 (base64 conservé).",
"- **Migrations non reconstructibles** : NET-07 (P1), SUP-08 (P2), EXP-04 (P1).",
"- **Landing / pitch / docs périmés (carnets, économie)** : UXO-06, NET-01, NET-11, CARTO-01, CARTO-07, TCI-13.\n",
"## 5. Lecture croisée avec les critères d'interdiction du GO grande échelle\n","| Critère | État | Problèmes |\n|---|---|---|",
"| Un P0 ouvert | **8 P0 ouverts** | CONT-11, EXP-01, MSG-01, MSG-03, MOD-01, PERF-01, SUP-01, SUP-04 |",
"| Isolation des comptes non prouvée | Isolation par RLS **conforme par inspection** (128 policies relues, toutes par propriétaire) mais **non prouvée sous rôle** (SET ROLE refusé, REST bloqué) ; fuites transverses prouvées sur conv_reads, event_attendees, Storage, et sur l'appareil (file de messages rejouée sous un autre compte) | SUP-02, MSG-05, IRL-03, SUP-01/MSG-03/CONT-11, AUTH-06 |",
"| Restauration non prouvée | **Jamais exécutée** | EXP-01, EXP-02, TCI-03 |",
"| Capacité non mesurée | **Aucune mesure** | PERF-01 |",
"| Fonction critique invisible du Pilotage ET de la Sentinelle | Confirmation e-mail, push, suppression de compte, Storage, modération, sauvegardes : **invisibles** | PIL-04, PIL-10, MOD-11, PIL-01 |",
"| Sécurité IRL ou modération insuffisante | **Insuffisantes** | MOD-01, MOD-02, IRL-01, IRL-02, IRL-03 |",
"| Staging et prod non séparés | **Non séparés** | SUP-04, EXP-11, TCI-04 |"]
open(os.path.join(OUT,'11-REGISTRE-DES-RISQUES.md'),'w',encoding='utf-8').write('\n'.join(L))
json.dump({'cnt':dict(cnt),'rel':dict(relc),'total':len(reg),'nonrelus_dom':nonrelus_dom},open(os.path.join(SP,'compteurs.json'),'w'))
print('registre écrit', len(reg), dict(cnt), dict(relc), nonrelus_dom)
