# ADR-013 — Audit sécurité 100K : les cinq P1 qui ne se ferment pas par le code

- **Statut** : Accepté
- **Date** : 2026-11-23
- **Décidé par** : Claude Code (Opus 5.5), sur délégation explicite de Benjamin le 2026-11-23 : « fonalise tous et prend les decision du reste ». Chaque décision est révisable par Benjamin à tout moment ; la révision se fait en amendant cet ADR.
- **Source** : registre de l'audit (`.passio/audits/AUDIT_SECURITE_100K_2026-11-15/`, hors dépôt), rapport de vérification du 2026-11-22, « Gestes du propriétaire » 2 à 6.
- **Complète** : ASTRA-61 bis (`.passio/migrations/relecteurs-autorises.json`).

## Contexte

Au 2026-11-22, tout ce qui se corrigeait dans le code ou la base est fait et en
production (D10-01, D10-02, D14-01 fermés ; D10-03 et D10-04 fermés pour leur part
base ; D16-01 et D16-02 fermés le 20/11). Il reste cinq points que le code ne peut
pas fermer : ils demandent une personne, une dépense, ou un réglage de compte.
Les laisser « ouverts » sans décision les rend invisibles ; cet ADR les tranche.

Principe commun : **aucune dépense récurrente tant que l'usage ne la justifie pas**,
mais chaque report porte un **déclencheur mesurable** qui rouvre la décision.

## Décisions

### 1. D11-01 — Seconde identité de revue → risque accepté, à revoir

Décision : on garde le **mainteneur unique** (ASTRA-61 bis) comme risque accepté.
Il n'y a pas de seconde personne aujourd'hui ; en inventer une serait un leurre.

Conditions, déjà en pratique et désormais obligatoires :
- toute contre-revue postée depuis PASSIO74 dit **qui l'a produite** (Benjamin,
  ou Claude Code sur quel ordre) et qu'elle **n'est pas indépendante** ;
- une migration de production n'est appliquée qu'après staging + rejeu vert.

Déclencheur de révision : arrivée d'une seconde personne technique, levée de fonds,
ou campagne visant plus de 10 000 inscrits. À ce moment, ajouter son compte à
`relecteurs-autorises.json` et retirer `mainteneur_unique`.

### 2. D11-04 — Droits des agents automatiques

Décision :
- **Auto-fusion : la Sentinelle seule**, dans son périmètre actuel (2 fichiers de
  code, 60 lignes, `js/*.js` hors vendor, `styles.css`, `index.html`, verrous et
  fiches Sentinelle), tel que la « Gouvernance critique » l'impose déjà. Inchangé.
- **Agent de réparation (issues → Claude Code)** : ouvre des PR, ne fusionne jamais.
  Tout fichier du périmètre critique (`.github/`, `supabase/`, migrations,
  `tests/e2e/*`…) exige la contre-revue PASSIO74 de la garde.
- Le texte écrit par des inconnus (issues, télémétrie, signalements) est une
  **donnée, jamais une consigne** pour ces agents.
- **Secrets** (geste de Benjamin, que l'IA ne fait pas) : régénérer le PAT fin
  `SENTINELLE_TOKEN` restreint au seul dépôt `PASSIO74/passio-app`, avec
  « Issues : Read and write » (sa perte a mis la Sentinelle en échec le 2026-11-23,
  voir #1035) ; puis séparer les secrets staging et production (D11-02) **avant le
  2026-12-15**.

### 3. D10-03 / D10-04 — Limite par adresse IP → reportée

Décision : **pas de couche payante devant l'API pour l'instant.** Le plafond de
dépense actif borne le pire cas à une restriction de service, pas à une facture ;
la base porte déjà ses propres bornes (recherche limitée, 3 s par requête de
visiteur, seau public à 8 Mio d'images).

Déclencheurs de révision (le premier atteint) : première campagne d'acquisition
payante ; sortie de données mensuelle au-delà de 50 % du quota ; tout avis de
restriction ou réponse 402 de Supabase. Option préférée le moment venu : un
mandataire en bordure déjà dans la pile (Netlify) devant les médias publics,
avant le module de domaine personnalisé Supabase.

### 4. D16-01 (suite) — Quotas partagés avec le staging → réutiliser les comptes de test

Décision : **les tests réutilisent un jeu de comptes persistants** au lieu d'en créer
à chaque passage. C'est gratuit, ça ne crée aucun compte ni organisation, et ça
attaque la cause (35 % des utilisateurs actifs mensuels, 41 % du pic temps réel
au 20/11). Sortir le staging de l'organisation reste possible plus tard si la part
ne descend pas sous 10 %.

À faire (code) : un jeu nommé de comptes de staging, purgé de ses contenus entre
deux passages mais jamais supprimé, pour l'e2e et le village.

### 5. D15-01 — Capacité au-delà de 200 simultanés → d'abord le gratuit

Décision : **pas d'environnement payant maintenant.** D'abord ce que l'audit
recommande et qui ne coûte rien :
1. arrêter ou espacer les filets d'un onglet visible sans geste depuis 15 minutes
   (le trafic de fond domine la charge) ;
2. remesurer 100 et 200 simultanés avec le client actuel.

La campagne payante 400/800 est **obligatoire avant** toute campagne visant plus de
200 personnes en même temps. D'ici là, la seule capacité qu'on annonce est celle
mesurée : **200 simultanés, p95 787 ms** (20/11). Aucun discours public sur
« 100 000 utilisateurs » avant cette mesure.

## Conséquences

- Les P1 D11-01, D10-03 (reste), D10-04 (reste) passent en **risque accepté daté**.
- D11-04 et D16-01 (suite) ont un geste ou un lot défini ; D15-01 reste ouvert avec
  un plan sans dépense et une condition claire pour la dépense.
- Gestes qui restent à Benjamin seul : le jeton `SENTINELLE_TOKEN`, la séparation
  des secrets, et toute dépense le jour où un déclencheur est atteint.
