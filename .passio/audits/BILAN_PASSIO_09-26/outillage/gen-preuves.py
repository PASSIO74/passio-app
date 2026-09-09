import json, glob, os
SP=os.path.dirname(os.path.abspath(__file__)); OUT='/home/user/passio-app/.passio/audits/BILAN_PASSIO_09-26'
cell=lambda s: str(s or '').replace('|','\\|').replace('\n',' ').strip()
reg=json.load(open(os.path.join(SP,'registre-problemes.json'),encoding='utf-8'))
nonrelus=len([r for r in reg if 'NON VÉRIFIÉ' in r['relecture']]); total=len(reg)
L=["# Preuves nécessaires — contrôles BLOQUÉS et non réalisés — BILAN PASSIO 09/26\n",
"> SHA audité : `c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf`. Ce rapport liste tout ce que l'audit N'A PAS PU prouver, avec la raison et ce qu'il faudrait pour trancher. Un contrôle BLOQUÉ n'est ni vert ni rouge : la contre-revue et Benjamin ne doivent pas le lire comme un succès. Les mesures faites en émulation Chromium ne valent jamais pour un appareil réel.\n",
"## 1. Les sept preuves qui pèsent sur le verdict\n","| # | Preuve manquante | Pourquoi bloquée ici | Ce qu'il faut | Qui peut le faire |\n|---|---|---|---|---|",
"| 1 | **Restauration complète** (base + auth + Storage + schéma) exercée, avec RTO/RPO | Aucune restauration jamais faite ; plan Supabase non lisible ; aucun projet cible | Créer un projet Supabase jetable, y restaurer la dernière sauvegarde (ou une sauvegarde Supabase), rejouer les migrations, mesurer le temps, documenter | Benjamin (Dashboard Supabase + `npm run sauvegarde`) |",
"| 2 | **Capacité mesurée** à 1 000 / 10 000 / 100 000 | Aucun staging ; charge sur la production interdite | Staging + campagne k6 (fil, publication, messagerie, Realtime) à 100 / 1 000 / 5 000 clients virtuels | Benjamin + un agent sur staging |",
"| 3 | **Isolation des comptes prouvée sous rôle** (anon, authenticated) | `SET LOCAL ROLE` refusé au rôle du connecteur (42501) ; REST direct vers supabase.co bloqué par le proxy | Un poste hors proxy : `curl` avec la clé anon sur chaque table (count=exact attendu 0 ou public), et le job « Suites production » (authz-critical) lu en détail | Benjamin ou GPT-6 Astra depuis Codex (réseau ouvert) |",
"| 4 | **Fichier réellement servi en production** = SHA c8cb8e99 | `netlify.app` refusé par le proxy (403) | `curl -sI https://passio-app.netlify.app/release.json` et comparaison du hash d'app.js | N'importe quel poste |",
"| 5 | **Plans et quotas** Supabase (compute, connexions, Realtime, sauvegardes, PITR), Netlify (bande passante), Brevo (e-mails/jour) | Non lisibles par le connecteur en lecture seule | Captures d'écran des pages Billing / Backups / Auth Rate limits / Attack protection | Benjamin |",
"| 6 | **Appareils et navigateurs réels** (iPhone Safari, Android Chrome, Samsung Internet, iPad, PWA installée, Firefox, Edge) | Chromium seul dans l'environnement | Session de recette sur 1 iPhone + 1 Android + 1 tablette avec la grille du rapport 09 | Benjamin ou testeur |",
"| 7 | **Réglages Auth** (captcha, limites de tentatives, longueur de mot de passe, provider anonyme et Google, HIBP, MFA, durée de session) | Non exposés en SQL | Captures Dashboard → Authentication → Providers / Rate limits / Attack protection / Sessions | Benjamin |\n",
"## 2. Tous les contrôles BLOQUÉS ou non réalisés, par domaine\n"]
for f in sorted(glob.glob(os.path.join(SP,'resultats','*.json'))):
    if os.path.basename(f).startswith('carto---'): continue
    d=json.load(open(f,encoding='utf-8'))
    bl=[c for c in d['controles'] if c['statut']=='BLOQUÉ' or c['methode']=='non réalisé']
    if not bl: continue
    L.append(f"### {os.path.basename(f)[:-5]}\n"); L.append("| Id | Contrôle | Statut / méthode | Raison et ce qu'il faudrait |\n|---|---|---|---|")
    for c in bl: L.append(f"| {cell(c['id'])} | {cell(c['controle'])} | {cell(c['statut'])} / {cell(c['methode'])} | {cell(c['preuve'])} |")
    L.append("")
L.append("## 3. Ce que chaque domaine déclare n'avoir pas vérifié\n")
for f in sorted(glob.glob(os.path.join(SP,'resultats','*.json'))):
    if os.path.basename(f).startswith('carto---'): continue
    d=json.load(open(f,encoding='utf-8'))
    if not d.get('non_verifie'): continue
    L.append(f"### {os.path.basename(f)[:-5]}\n")
    for s in d['non_verifie']: L.append(f"- {cell(s)}")
    L.append("")
L+=["## 4. Interruptions de l'audit lui-même\n",
"- Les crédits de session ont été épuisés trois fois (limites à 14:40 UTC et 19:40 UTC, puis « out of usage credits » vers 19:55 UTC). Les sous-agents des domaines irl, profils-passions, robustesse-pannes, perf-capacite-couts et appareils-a11y ont été interrompus à chaque tentative (trois par domaine) avant de rendre leur sortie structurée ; leurs preuves déposées ont été reprises par l'orchestrateur (rapports 04, 07, 09 : encadrés « Domaine reconstitué par l'orchestrateur »). Les domaines exploitation-continuite (20:33 UTC) et auth-rgpd (20:41 UTC) ont fini à la troisième tentative ; les reconstitutions provisoires de l'orchestrateur pour ces deux domaines sont conservées dans `donnees/resultats-orchestrateur-*.json` pour comparaison, mais ne comptent pas.",
f"- La relecture adversariale n'a pas pu couvrir les problèmes de ces domaines ni ceux de tests-ci ({nonrelus} problèmes « non relus » sur {total}).",
"- Le plugin GitHub (`plugin:github:github`) n'a jamais pu se connecter (hôte `api.githubcopilot.com` hors liste blanche) ; les outils GitHub de la plateforme ont servi à la place. Les journaux de jobs GitHub Actions sont restés inaccessibles (403).",
"- Chromium : l'environnement ne portait que la révision 1194 alors que `@playwright/test` 1.60 attend la 1223 ; jusqu'à 14:50 UTC les sous-agents ont utilisé une configuration d'enveloppe (`executablePath`), ensuite un pont a rendu `npx playwright test` utilisable sans surcharge. Quelques mesures faites pendant la saturation CPU de l'environnement ont planté (perf, seconde passe) et sont écartées."]
open(os.path.join(OUT,'13-PREUVES-NECESSAIRES.md'),'w',encoding='utf-8').write('\n'.join(L))
print('preuves nécessaires écrit', nonrelus, total)
