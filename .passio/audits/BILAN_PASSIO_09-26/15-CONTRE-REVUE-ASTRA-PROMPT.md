# Prompt de contre-revue — GPT-6 Astra (Codex) — BILAN PASSIO 09/26

> Bloc à coller tel quel dans Codex. Il fixe l'ordre de mission de la contre-revue, la version exacte à analyser, l'emplacement des rapports et des preuves, le message final de Claude Code, les huit P0 et les priorités de vérification.

```text
CONTRE-REVUE INDÉPENDANTE — BILAN PASSIO 09/26
Point de départ : message final de Claude Code (Claude Fable 5.1), audit terminé le 2026-09-04.

═══════════════════════════════════════════════════════════════════
0. ORDRE DE MISSION DE LA CONTRE-REVUE (Benjamin)
═══════════════════════════════════════════════════════════════════
Tu es GPT-6 Astra, relecteur INDÉPENDANT. Tu n'as participé à aucune étape de l'audit de Claude Code.
L'ordre prévu, à suivre dans cet ordre, une étape à la fois :

  1. VÉRIFIER l'analyse de Claude Code sur exactement la même version du code
     (SHA c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf) : contrôler les preuves, les problèmes signalés
     et les points oubliés. Pour chaque problème : CONFIRMÉ / RÉFUTÉ / INCERTAIN, avec ta propre preuve
     (fichier:ligne, requête, commande et son résultat). Pour chaque contrôle BLOQUÉ : le débloquer si tu
     le peux (voir §5), sinon le laisser BLOQUÉ. Les points oubliés reçoivent un identifiant ASTRA-xx.
  2. CONSOLIDER le bilan : ce qui fonctionne (prouvé), ce qui bloque la commercialisation (P0 et
     critères d'interdiction), ce qui reste à tester (preuves manquantes, appareils réels, production).
     Verdict maintenu ou amendé, avec la raison.
  3. PRÉSENTER À BENJAMIN le plan de correction, en commençant par les problèmes critiques (P0, puis
     P1 sécurité IRL / modération / juridique, puis le reste), avec pour chaque chantier : problèmes
     couverts, correction proposée, risque de régression, effort, ordre recommandé.
  4. APRÈS SON ACCORD SEULEMENT : corriger puis vérifier les résultats (tests, réinjection du défaut,
     non-régression, re-vérification des critères d'interdiction), avant de décider du lancement.

Règles absolues pendant les étapes 1 à 3 : lecture seule. Ne rien corriger, ne rien fusionner, ne rien
déployer, ne rien écrire en base de production, ne pas charger la production, ne recopier aucun secret ni
contenu privé. GitHub est la seule source de vérité. Ne pas s'appuyer sur les anciens rapports du dépôt
sans les confronter au code de ce SHA. Aucune correction avant l'accord explicite de Benjamin.

═══════════════════════════════════════════════════════════════════
1. VERSION ANALYSÉE (à utiliser EXACTEMENT, sans autre commit)
═══════════════════════════════════════════════════════════════════
Dépôt            : https://github.com/PASSIO74/passio-app (public)
SHA audité       : c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf
                   branche main, commit du 2026-09-04 12:07 +0200 (PR #278)
                   « Clôture des sessions parallèles : la spécialité choisie entre dans le fil, et le registre du 2026-09-04 (#278) »
En production    : oui — run CI 2494 (id 33861671142), 13 jobs verts, déploiement Netlify 10:44 UTC
                   https://github.com/PASSIO74/passio-app/actions/runs/33861671142
Audit différentiel : main n'a reçu AUCUN commit pendant l'audit (git rev-list --count c8cb8e9..origin/main = 0).
                   Si main a bougé depuis, l'écart est à traiter en audit différentiel séparé : la contre-revue
                   porte sur c8cb8e9.

═══════════════════════════════════════════════════════════════════
2. OÙ SONT LES RAPPORTS ET LES PREUVES
═══════════════════════════════════════════════════════════════════
Issue            : https://github.com/PASSIO74/passio-app/issues/279  « [AUDIT] BILAN PASSIO 09/26 »
PR brouillon     : https://github.com/PASSIO74/passio-app/pull/280   (documentation seule, commits [skip ci])
Branche          : audit/bilan-passio-09-26-fable51
HEAD de la branche : babf09f6a98f10d1d4818cf1f5848527113b7e09
                   (= c8cb8e9 + commits qui n'ajoutent QUE .passio/audits/ ; git diff --stat c8cb8e9 -- . ':!.passio/audits' est vide)

Pour l'ouvrir dans Codex :
  git fetch origin audit/bilan-passio-09-26-fable51
  git checkout audit/bilan-passio-09-26-fable51
  # le code applicatif est strictement celui de c8cb8e9 ; vérifie-le :
  git diff --stat c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf -- . ':!.passio/audits'   # doit être vide

Dossier : .passio/audits/BILAN_PASSIO_09-26/
  00-MANIFESTE.md                      modèle vérifié, SHA, environnement, méthode, interruptions, différentiel
  01-SYNTHESE-BENJAMIN.md              synthèse, cinq risques, chiffres, suite complète
  02-CARTOGRAPHIE.md
  03-AUDIT-UX-ONGLETS-ONBOARDING.md
  04-AUDIT-FONCTIONNEL.md              contenu, messagerie/notifs, IRL, profils/passions, robustesse, tests/CI
  05-AUDIT-CODE-ET-NETTOYAGE.md
  06-AUDIT-SECURITE-DONNEES.md         Supabase/isolation, auth/RGPD
  07-AUDIT-PERFORMANCE-CAPACITE-COUTS.md
  08-AUDIT-PILOTAGE-SENTINELLE.md
  09-AUDIT-APPAREILS-ACCESSIBILITE.md
  10-AUDIT-MODERATION-IRL-SUPPORT-EXPLOITATION.md
  11-REGISTRE-DES-RISQUES.md           les 192 problèmes, priorité retenue, relecture, doublons, critères du GO
  12-VERDICT-COMMERCIAL.md
  13-PREUVES-NECESSAIRES.md            tout ce qui est BLOQUÉ / non réalisé, et ce qu'il faudrait
  14-COUVERTURE-DU-MANDAT.md           les 37 points + Pilotage + Sentinelle + sécurité admin
  15-CONTRE-REVUE-ASTRA-PROMPT.md      ce prompt
  preuves/<domaine>/                   ~400 fichiers : scripts, journaux, captures, requêtes, preuves/suite-complete/
  donnees/resultats-domaines/*.json    sortie structurée brute des 16 domaines (contrôles + problèmes, tous champs)
  donnees/verifs-partiel.json          votes des relecteurs adversariaux par problème
  donnees/registre-problemes.json      registre consolidé (priorité retenue, relecture)
  donnees/resultats-orchestrateur-*.json  reconstitutions provisoires (auth-rgpd, exploitation) — NE COMPTENT PAS
  outillage/                           scripts d'orchestration (workflows, générateurs) pour rejouer l'audit

═══════════════════════════════════════════════════════════════════
3. MESSAGE FINAL DE CLAUDE CODE (verbatim)
═══════════════════════════════════════════════════════════════════
Modèle réellement utilisé. Claude Fable 5.1, identifiant claude-fable-5-1, vérifié par get_session comme modèle
configuré et modèle servi, effort xhigh. Les 16 auditeurs de domaine et les relecteurs adversariaux ont été lancés
explicitement sur ce même modèle. Aucune substitution observée.

SHA audité. c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf, branche main, commit du 2026-09-04 à 12:07 (PR #278),
déployé en production par le run CI 2494. main n'a reçu aucun commit pendant l'audit, donc aucun audit
différentiel n'est nécessaire.

Verdict. BÊTA FERMÉE UNIQUEMENT, soit un NO-GO pour la commercialisation à grande échelle. Les sept critères
d'interdiction de l'ordre de mission sont tous vrais au SHA audité.

Compteurs. 8 P0, 57 P1, 66 P2, 58 P3. 192 problèmes rapportés, dont 3 réfutés par la relecture et conservés
pour mémoire. 462 contrôles statués.

Les cinq risques principaux.
- Messagerie non privée. Les vocaux et fichiers échangés sont dans un bucket public, listables et lisibles avec la
  seule clé publique, jamais purgés. Sur un même appareil, la file d'envoi d'un compte est rejouée sous l'identité
  du compte suivant.
- Rencontres physiques exposées. Adresse exacte, coordonnées, téléphone et liste nominative des participants sont
  lisibles sans compte. Un mineur de 13 ans crée ou rejoint une rencontre sans qu'aucune garde ne s'applique.
- Ni modération ni base légale. Rien ne traite les signalements, rien ne retire un contenu illicite, une
  publication ne peut pas être signalée. Pas de CGU, pas de mentions légales complètes, pas de consentement à
  l'inscription, et le bouton « Support » n'envoie rien.
- Aucun filet. Restauration jamais exercée, pas de staging, capacité jamais mesurée, alertes sans canal hors page,
  console d'administration à identifiants par défaut.
- Dépôt public. Le dossier investisseur, les finances, les documents internes et le code d'accès de la beta sont
  lisibles par tous.

Contrôles bloqués. Le rapport 13 les liste tous. Les principaux : le fichier servi en production (réseau bloqué),
l'isolation sous rôle (SET ROLE refusé), les plans et quotas Supabase, Netlify et Brevo, les réglages Auth, les
appareils et navigateurs réels (tout est émulé sous Chromium), la carte. Les crédits de session se sont épuisés
trois fois. Cinq domaines ont été reconstitués par l'orchestrateur à partir des preuves de leurs sous-agents
interrompus, et 81 problèmes sur 192 n'ont pas eu de relecture adversariale. Chaque rapport concerné le dit en
tête de domaine.

Suite complète locale. 1 094 réussis, 1 échec environnemental (carte injoignable, vert en CI sur ce SHA),
8 ignorés, en 1 h 38.

Ce qui n'a pas été fait, volontairement. Aucun code de l'application n'a été modifié. Rien n'a été déployé,
aucune PR fusionnée, aucune donnée réelle touchée, aucun test de charge sur la production, aucun secret recopié.
Les commits portent [skip ci] pour qu'aucune preview Netlify ni aucun compte de test ne soient créés.

Audit Fable 5.1 terminé, prêt pour la contre-revue indépendante GPT-6 Astra dans Codex.

═══════════════════════════════════════════════════════════════════
4. LES 8 P0 (à vérifier en premier)
═══════════════════════════════════════════════════════════════════
SUP-01 / MSG-03 / CONT-11  bucket attachments public, listable par anon, jamais purgé (rapports 06, 04)
MSG-01                     XSS DOM par invitation d'appel forgée sur un canal Realtime public (rapport 04)
MOD-01                     aucune chaîne de traitement des signalements, aucun retrait de contenu (rapport 10)
SUP-04                     un seul projet Supabase pour dev, previews, CI à comptes réels et prod (rapport 06)
EXP-01                     restauration jamais exécutée, schéma non reconstructible (rapport 10)
PERF-01                    capacité non prouvée : aucune mesure, aucun staging (rapport 07)

Les sept critères d'interdiction du GO grande échelle (rapport 12 §2) : un P0 ouvert ; isolation des comptes
non prouvée ; restauration non prouvée ; capacité non mesurée ; fonction critique invisible du Pilotage ET de la
Sentinelle ; sécurité IRL ou modération insuffisante ; staging et prod non séparés. Claude Code les déclare tous
vrais : vérifie chacun.

═══════════════════════════════════════════════════════════════════
5. PRIORITÉS DE VÉRIFICATION (étape 1)
═══════════════════════════════════════════════════════════════════
- Priorité 1 : les 81 problèmes marqués « NON VÉRIFIÉ (pas de relecture) » dans le rapport 11 (domaines irl,
  profils-passions, robustesse-pannes, perf-capacite-couts, appareils-a11y = reconstitués par l'orchestrateur ;
  auth-rgpd, exploitation-continuite, tests-ci = rendus par leur sous-agent mais non relus).
- Priorité 2 : les 8 P0 et les 7 critères d'interdiction — le verdict en dépend.
- Priorité 3 : les contrôles BLOQUÉS (rapport 13) que Codex peut débloquer avec un réseau ouvert :
    curl -sI https://passio-app.netlify.app/release.json            (SHA réellement servi)
    requêtes REST anon vers https://njkiyoklssvefstljemx.supabase.co avec la clé anon
    (elle est publique, dans js/app-08-ui-modals-tour.js) : count=exact par table, listing
    /storage/v1/object/list/attachments, oracles RPC — LECTURE SEULE, aucune écriture.
    journaux GitHub Actions du run 33861671142.
- Priorité 4 : les points oubliés — rapport 14 (couverture des 37 points ; 2 NON : capacité, navigateurs).
  Numérote tout problème nouveau ASTRA-xx, au même format que les autres.

Format d'un problème (à respecter pour tout ajout ou amendement) : identifiant, priorité (P0 bloque la
commercialisation · P1 avant lancement public · P2 amélioration importante · P3 optimisation future),
fonctionnalité, attendu, observé, reproduction, preuve, impact utilisateur/commercial, visibilité Pilotage,
détection Sentinelle, correction, risque de régression, effort, confiance.
Statuts des contrôles : PROUVÉ · CONFORME PAR INSPECTION · PROBABLE · DÉFAILLANT · BLOQUÉ · NON APPLICABLE.
Méthodes : appareil réel · émulation · inspection code · requête base · test exécuté · non réalisé.

Attendu en sortie de l'étape 1 : pour chaque problème de Claude Code, un verdict et ta preuve ; la liste des
ASTRA-xx ; les contrôles débloqués avec leur résultat.
Attendu en sortie de l'étape 2 : bilan consolidé en trois listes (fonctionne / bloque / reste à tester) et
verdict motivé.
Attendu en sortie de l'étape 3 : plan de correction ordonné, P0 d'abord, soumis à Benjamin. STOP ensuite,
jusqu'à son accord.
```
