# PASSIO à 100 000 utilisateurs — tenir debout seul, se réparer seul, et ce qui reste humain

> 2026-10-11. Réponse à la question de Benjamin : « comment perfectionner encore l'app, le centre de
> pilotage et la Sentinelle, et faire que si demain 100 000 personnes l'utilisent, tous les problèmes
> soient auto-réparés — je veux lancer sans trop gérer la partie technique ».
> Ce document distingue ce qui est **mesuré**, ce qui est **estimé** (et le dit), et ce qui est **livré**.

## En une page

**Ce qui tourne déjà seul, sans PC** : la veille (pg_cron, toutes les 5 min) sonne ton téléphone quand
le voyant passe au rouge ; la Sentinelle (GitHub) lit les erreurs, ouvre une enquête, Claude écrit le
correctif, la PR s'auto-fusionne si toute la CI passe, le déploiement suit (6 enquêtes sur 9 réparées
seules du 09 au 13/09, 25 à 79 min de l'alerte à la production) ; la veille de production, la sonde de
disponibilité, la sauvegarde quotidienne et le digest du matin te disent le reste par e-mail.

**Ce qui manquait pour 100 000 personnes, et qui est livré aujourd'hui** :

1. **La production sait RALENTIR au lieu de TOMBER** (délestage automatique). Quand les connexions
   temps réel approchent du mur des 500 (80 %) ou que des pannes serveur touchent au moins 10 comptes
   distincts en 15 min, la veille passe toute
   l'app en « économie » (rafraîchissements ×2 moins fréquents, temps réel endormi plus tôt, télémétrie
   plus échantillonnée), puis en « survie » (×4) à 95 % ; elle redescend d'un cran à la fois après
   30 min de calme. Rien ne casse pour l'utilisateur : il voit un « j'aime » d'un autre un peu plus tard.
   Tu es prévenu sur ton téléphone à chaque changement. **Ces deux mesures ne comptent que des comptes
   réels identifiés par le serveur, et les pannes seulement chez des comptes de plus de 7 jours** :
   n'importe qui peut écrire de fausses lignes de télémétrie, et des comptes se créent en une minute —
   la contre-revue du 13/10 a montré que dix comptes neufs suffisaient à ralentir toute l'app. Un
   délestage posé à tort se lève d'un toucher (« Normal » dans le pilotage).
2. **Un interrupteur distant** : depuis le pilotage (onglet Capacité → Protection automatique), tu
   éteins une fonctionnalité qui casse **chez tout le monde en 5 min**, sans déploiement, pendant que la
   Sentinelle répare — et tu peux afficher un message à tous (« les inscriptions par e-mail sont
   saturées, passe par Google »). C'était le trou EXP-03 noté le 14/09 : « écrit, pas réglé ».
3. **Un pilotage qui dit vrai à grande échelle** : cinq compteurs se seraient figés en silence au-delà
   de 1 000 comptes ou lignes (voir §3) — dont la recherche de TON compte pour les alertes : au 1 001ᵉ
   inscrit, les alertes pouvaient cesser d'arriver sur ton téléphone le jour où tu en as le plus besoin.

**Ce qu'aucun code ne fera à ta place** (§4) : relever les quotas payants avant qu'ils deviennent des
murs (connexions temps réel, e-mails, puissance de la base, bande passante), la contre-revue des
migrations, et les décisions de modération. Compte **~15 min par semaine** et **~60 à 150 € par mois**
de services en plus, à engager **au moment où les jauges passent à l'orange**, pas avant.

**Allumé le 2026-10-21** : les trois migrations du lot (`migration_reglages_distants_2026-10-11.sql`,
`migration_telemetrie_equitable_2026-10-16.sql`, `migration_purge_marqueurs_2026-10-16.sql`) sont
appliquées en production depuis ton poste (contre-revue de mainteneur unique sur #605, verdicts OK,
journal `migrations_appliquees`), et l'état a été relu en base le même jour (canal ①) : table
`reglages_distants` lisible colonne par colonne par les appareils, `pilotage_audience` réservée à
`service_role`, déclencheurs `trg_debit_avant` / `trg_debit_taille` / `trg_debit_lot` /
`trg_telemetry_identite` sur `telemetry_events` (plus de `trg_debit_global`), tâches
`purge_telemetrie_debit` et `purge_marqueurs_suppression` actives.

---

## 1. Ce qui est automatique aujourd'hui

| Fonction | Mécanisme | Cadence réelle | Ce qu'il fait seul |
|---|---|---|---|
| Voir | veille `pilotage` (pg_cron) | 5 min (tenu) | verdict, push téléphone sur passage au rouge, site injoignable, retour au vert |
| Voir | `veille-production.yml` | 2 à 5 h (cron GitHub servi à 4–25 %) | 8 signaux : flux de télémétrie, inscriptions, erreurs, API, déploiement bloqué, crons, base, jetons |
| Réparer | Sentinelle autonome | 4 à 8 fois/jour | enquête → Claude → PR → auto-fusion bornée (2 fichiers, 60 lignes) → déploiement → « déployé » sur l'issue |
| Réparer | bouton « Réparer » du pilotage | à la demande | ouvre une issue `[RÉPARER]` confiée à Claude (PR non auto-fusionnée) |
| Contenir | **délestage automatique** (nouveau) | 5 min | ralentit toute l'app avant le mur, redescend seul |
| Contenir | **coupure distante, bandeau** (nouveau) | à la demande, effet ≤ 5 min | éteint une fonctionnalité chez tous, prévient tous |
| Revenir | `npm run rollback:netlify` | à la main, 2 s | remet en ligne la version d'avant (mesuré le 14/09) |
| Revenir | **retour arrière proposé** (2026-10-12, s'allume avec le jeton Netlify) | 5 min | propose le retrait d'une version qui casse 5 comptes anciens avec une erreur nouvelle ; tu le fais d'un toucher (« Remettre la version précédente » dans le pilotage). Jamais seul : un retrait automatique pourrait annuler un correctif de sécurité |
| Réparer | **réveil de la Sentinelle par la veille** (2026-10-12) | 5 min | lance l'enquête dès 2 comptes en erreur, sans attendre le cron GitHub |
| Garder | sauvegarde quotidienne | 1/jour | archive vérifiée ; restauration prouvée sur base vide le 15/09 |
| Économiser | socket au repos, filets adaptatifs, compteurs en une lecture, images légères | permanent | 98 % des connexions temps réel inutiles supprimées (lots du 20–21/09) |

## 2. Ce qui est livré dans ce lot (2026-10-11)

| Pièce | Fichier | Verrou |
|---|---|---|
| Logique pure : validation, liste blanche des coupures, décision de délestage (montée immédiate, descente d'un cran après 30 min, hystérésis, la main du pilote gagne, l'aveugle ne lève rien, au plafond de télémétrie on ne descend pas avant 2 h) | `supabase/functions/_shared/reglages.js` | `tests/unit/reglages.test.mjs` (12, mutations nommées) |
| Client : lecture toutes les 5 min (±30 s d'étalement), cache appliqué AVANT l'app, 404 = aucun réglage (mémorisé 1 h), coupures posées/levées sans jamais toucher un « 0 » de l'appareil, bandeau en texte, inerte en local | `js/reglages-distants.js` | `tests/e2e/reglages-distants.spec.js` (9) |
| Câblage du facteur : filets du fil et des lives, compteurs visibles, repos du temps réel, échantillon de télémétrie | `delaiDeleste` (app-02), app-03/05/08, `telemetry.js` | `reglages.test.mjs` ⑪ |
| Fonction `pilotage` : geste `reglages` (revalidé, réservé à l'éditeur), délestage automatique dans la veille, état des réglages | `supabase/functions/pilotage/index.ts` | `tests/unit/pilotage.test.mjs` ⑳ ㉑ |
| Pilotage téléphone : panneau « Protection automatique » | `pilotage/` | `tests/e2e/pilotage-nuage.spec.js` ⑩ ⑪ |
| Table `reglages_distants` + `pilotage_audience()` + `pilotage_familles_erreurs()` | `migrations/migration_reglages_distants_2026-10-11.sql` (PR séparée, contre-revue) | `tests/sql/migration-reglages-distants.test.sh` (47 : confrontation avec `compterAudience`, comptes neufs / non confirmés / anonymes qui ne pèsent rien, familles nouvelles d'abord, verdict qui lève sur quatre mutants) |

## 3. Le pilotage à l'échelle : cinq compteurs qui auraient menti en silence

PostgREST ne rend **jamais plus de 1 000 lignes** (max-rows du projet), quoi que demande `.limit()`.
La fonction `pilotage` comptait plusieurs grandeurs en lisant des lignes « `.limit(5000)` » :

| Grandeur | Avant | Au-delà de… | Maintenant |
|---|---|---|---|
| Comptes qui reçoivent les alertes (`uidsPilotes`) | page 1 des comptes seulement | 1 000 inscrits : ton compte pouvait sortir de la page, **plus d'alerte sur ton téléphone** | parcours des pages jusqu'à trouver chaque adresse, gardé 10 min |
| Jauge « connexions » (celle qui annonce le mur des 500) | appareils distincts parmi 1 000 lignes | ~100 à 200 appareils : **la jauge se figeait sous le mur** | `pilotage_audience` (comptage distinct en base) ; repli qui se dit « borne basse » |
| Appareils en ligne / actifs 24 h | idem | quelques centaines | idem |
| Inscriptions jour / semaine / série | longueur d'une liste ≤ 1 000 | 1 000 inscriptions/semaine | comptées en base (`count exact`, 7 requêtes jour par jour) |
| Erreurs 24 h, série 7 j | longueur d'une liste ≤ 300 / 1 000 | 300 erreurs/jour | comptées en base |
| Activation | tous les identifiants dans une URL | ~200 comptes : requête trop longue, tuile « non lue » | paquets de 100 ; au-delà de 1 500 comptes, échantillon régulier **dit** à l'écran ; le digest reste exact (SQL) |

## 4. Les murs à 100 000 inscrits, et le geste qui les lève

**Hypothèse de calcul (estimée, pas mesurée)** : 100 000 inscrits ≈ 20 000 à 30 000 actifs par jour,
2 000 à 5 000 connectés au même moment aux heures de pointe. Les chiffres « aujourd'hui » sont mesurés
(sources dans `docs/CAPACITE_*.md`). **Les tarifs sont ceux affichés publiquement à ma connaissance :
les relire sur la page Pricing de chaque service le jour du geste.**

| Ressource | Aujourd'hui | Mur | Ce que le code fait déjà | Geste humain, quand, coût indicatif |
|---|---|---|---|---|
| **Connexions temps réel** (Supabase) | pic 84 (20/09) | **500** (spend cap actif = mur dur) | socket au repos ; **délestage auto à 80 / 95 %** | jauge orange (70 %) : couper le spend cap avec une alerte de budget, ou acheter des connexions (~10 $ / 1 000 de pic) |
| **E-mails d'inscription** | Brevo gratuit | **300/jour**, et **30/h** côté Supabase | Google en tête ; bandeau distant « passe par Google » | avant toute campagne : Brevo payant ou Resend (~10–25 €/mois pour 20 000–50 000 e-mails), relever « emails per hour » dans Supabase → Rate Limits ; ajouter Apple Sign-In (gratuit) |
| **Puissance de la base** | Micro : ~400 req/s, 60 connexions | latence > 1 s vers 2 000–4 000 connectés (déduit du banc 14/09) | compteurs en une lecture, cadences adaptatives, **délestage sur pannes 5xx** | p95 API > 1 s ou 5xx récurrents : passer en Small (~15 $/mois) puis Medium (~60 $/mois) — un clic, quelques minutes d'indisponibilité |
| **Bande passante de l'app** (Netlify) | gratuit, 100 Go/mois | **mesuré** : 0,75 Mo compressé par téléchargement complet (app.js 392 Ko + page ~250 Ko + styles ~110 Ko), re-téléchargé à **chaque déploiement** (~50/mois) | cache du service worker entre deux déploiements | **le mur le plus probable** : 25 000 appareils × 30 versions/mois × 0,75 Mo ≈ 560 Go/mois (estimé). Grouper les déploiements (voir §5), puis Netlify Pro (~19 $/mois, 1 To) ou Cloudflare Pages (bande passante sans plafond) |
| **Télémétrie reçue** (nouveau mur trouvé ce jour) | quelques dizaines de lignes/min | **3 000 insertions/min, toutes origines** (`trg_debit_global`, anti-abus du 11/09) — au-delà les lots sont REFUSÉS : le pilotage devient aveugle en pointe ; et chaque insertion recompte la dernière minute (coût CPU quadratique sous charge) | jauge « Télémétrie reçue » + voyant orange « les chiffres sous-estiment » (nouveau) | **P1 avant 10 000 actifs** : limiteur par compte/appareil compté par lot (déclencheur par instruction), plafond global relevé ; n'importe qui peut aujourd'hui saturer ce plafond et aveugler le pilotage |
| **Télémétrie dans la base** | 69 Mo de base au 19/09 | 8 Go (Pro) | échantillon des lectures (1/10), **÷2 / ÷4 sous délestage**, purge pg_cron | estimé : ~25 lignes × 470 o par session → 0,5 à 0,7 Go/jour à 30 000 actifs ; à 7 jours de rétention, ~4–5 Go + index : **réduire à 3 jours et agréger** (lot P1 §5) |
| Comptes actifs (MAU) | 10 | 100 000 inclus (Pro) | — | au-delà : ~0,003 $/MAU |
| Stockage médias | 0,14 Go | 100 Go (Pro) | compression vidéo aux trois portes, images légères, purge des orphelins | aucun avant longtemps |
| Signalements (modération) | 0–1/jour | **toi** | alerte quotidienne, traitement depuis le téléphone | au-delà de ~20/jour : pré-tri automatique (§5) et un·e modérateur·rice |

## 5. Ce qu'on peut encore perfectionner — par ordre de rendement

### Pour que l'app tienne (P1, avant le lancement large)
1. ✅ **Retour arrière depuis le téléphone, proposé par la veille — livré le 2026-10-12.** Dès que le
   secret `PILOTAGE_NETLIFY_TOKEN` (jeton Netlify) est posé sur la fonction `pilotage` (Supabase › Edge
   Functions › pilotage › Secrets) :
   - le pilotage gagne un bouton « Remettre la version précédente » (2 s, sans PC) qui te montre
     d'abord la version servie et celle qui sera remise ; tu confirmes en connaissance de cause ;
   - dans les 90 min d'une mise en ligne, un échec NOUVEAU (erreur ou appel refusé, vu chez moins de
     deux comptes anciens sur une autre version dans les 24 h) chez au moins 5 comptes distincts
     **créés plus de 7 jours avant** la mise en ligne déclenche une issue `humain` et une notification ;
     le pilotage affiche l'échec lui-même ;
   - jamais de retrait automatique : le signal vient des navigateurs, et quelques comptes malveillants
     pourraient sinon faire retirer un correctif de sécurité (deux revues du 12/10). Un double appui ne
     retire pas deux versions : le bouton se ferme 10 min après un geste réussi ; une version retirée
     dans les 24 h n'est jamais remise par ce bouton.
   Tout est compté EN BASE (`pilotage_familles_erreurs`), sur des comptes dont l'ancienneté est lue
   côté authentification : cinq comptes créés pour l'occasion, ou un seul appareil qui boucle, ne
   proposent rien et ne cachent rien (revues du 12 et du 13/10). C'est la seule panne que le délestage ne
   contient pas : un mauvais déploiement. Logique : `supabase/functions/_shared/autonomie.js`.
2. **Train de déploiement** : fusionner autant qu'on veut, mais ne déployer qu'une à deux fois par jour
   (sauf correctif Sentinelle). Divise la bande passante d'un facteur 10 à 20 et le risque d'autant.
3. ✅ **Télémétrie à l'échelle — en production depuis le 2026-10-21** (`migration_telemetrie_equitable_2026-10-16.sql` :
   un compteur par lot — comptes anciens 1 800/min à eux seuls, neufs + anonymes 2 400 partagés (1 600
   chacun), 150 par compte, refus en 429 que le client attend ; un flot anonyme n'aveugle plus les
   comptes réels, et la veille juge l'aveuglement sur les anciens). Reste : rétention et agrégats. Avant :
   remplacer le plafond global de 3 000 insertions/min (qui recompte la
   minute à CHAQUE ligne et refuse tout au-delà) par un compteur par lot et par compte/appareil ;
   rétention brute 3 jours + agrégats quotidiens — sinon la base se remplit de mesures avant de se
   remplir d'utilisateurs, et le pilotage devient aveugle au moment où il sert.
4. **Inscriptions** : fournisseur d'e-mails payant + Apple Sign-In ; la veille lit déjà le taux de
   confirmation (signal `inscriptions`).

### Pour que la Sentinelle répare plus, plus vite (P2)
5. ✅ **Réveil par la veille — livré le 2026-10-12, actif dès la migration.** Dès que 2 comptes réels
   (identité serveur, confirmés, créés depuis plus de 24 h) ont un échec en 30 min (erreur ou appel
   refusé, compté en base), sans enquête en cours, sans pause et sans run de moins de 45 min, la veille
   (pg_cron, 5 min) lance la Sentinelle par `workflow_dispatch` — 2 réveils par heure et 12 par jour au plus. Avant :
   un cron GitHub servi 4 à 8 fois par jour.
6. ✅ **Priorité par personnes touchées — c'était déjà le cas** : `classer()` et `classerApi()`
   (`scripts/sentinelle-detecter.mjs`) trient les candidats par comptes distincts, puis par occurrences.
   La première version de ce plan le comptait à tort comme « à faire ».
7. **Couper pendant qu'on répare** : quand une enquête vise un fichier d'un lot sous drapeau (liste
   blanche des coupures), la Sentinelle propose — ou pose si la règle est explicite — la coupure
   distante du lot, et la lève au déploiement du correctif.

### Pour que le pilotage décide pour toi (P2)
8. **Jauge de coût** : la facture projetée du mois (Supabase, Netlify) à côté des jauges de capacité, et
   une alerte quand une jauge passe 70 % avec **le geste et son prix** (le tableau du §4, vivant).
9. **Page de statut publique** générée par la veille (vert / dégradé / panne), que le bandeau distant
   peut citer.
10. **Pré-tri des signalements** : masquage automatique d'un contenu après N signalements de comptes
    distincts, en attendant ta décision (jamais une suppression automatique).

### À mesurer avant de le croire (P3)
11. Banc de charge à 1 000 comptes sur le staging, délestage 0/1/2, pour chiffrer le gain réel (le banc
    à 100 comptes du 21/09 a montré −7,5 % de lectures dans le pire cas ; le gain du régime calme n'a
    été mesuré qu'à l'horloge simulée).

## 6. Le lancement, sans trop gérer la technique

**J-7** : appliquer la migration des réglages ; activer les notifications du pilotage sur ton téléphone
(onglet Réglages) ; vérifier que les jauges sont lues (onglet Capacité) ; passer l'e-mail sur une offre
payante ; poser l'alerte de budget Supabase.
**J0** : regarder le voyant ; si une jauge passe à l'orange, faire le geste de la ligne du §4.
**Chaque semaine (15 min)** : digest du matin → les lignes « à toi » ; signalements ; jauges.
**Quand le téléphone sonne** : ouvrir le pilotage. Rouge « erreurs » → la Sentinelle est déjà dessus,
tu peux couper la fonctionnalité en attendant. Rouge « site » → `npm run rollback:netlify -- --restaurer
precedent` (ou, jeton Netlify posé, « Remettre la version précédente » dans le pilotage). « Délestage automatique » → rien à faire, sauf si
ça dure : c'est le signe qu'un quota du §4 doit monter.
