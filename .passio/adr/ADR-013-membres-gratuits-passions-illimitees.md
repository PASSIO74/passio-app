# ADR-013 — Les membres ne paient jamais, les passions sont illimitées, une offre s'ouvre sur l'usage

- **Statut** : Accepté
- **Date** : 2026-11-12
- **Décidé par** : Benjamin, fondateur, à la remise du plan de monétisation du 10/11/2026 (« mets en place ce qu'il y a à faire dans le code et sur l'app, je fais venir les utilisateurs »).
- **Complète** : [ADR-009](ADR-009-core-feed-irl-sans-wallet.md) (aucune monnaie interne ; un paiement futur est direct, en euros). Cet ADR dit **qui** paierait et **quand** une offre peut s'ouvrir.
- **Remplace** : la section « PASSIO+ » de `docs/PLAN_MONETISATION_2026-11-01.md` et le commentaire d'app-06 qui réservait le plafond de passions comme « premier avantage de PASSIO+ ».

## Contexte

Deux promesses du dépôt se contredisaient :

- le plan du 01/11 écrivait « on ne fait jamais payer une fonction qui est gratuite aujourd'hui », et le kit de lancement promettait aux associations « rien à payer, ni maintenant ni plus tard » ;
- le même plan, et le code qui a levé le plafond de trois passions le 01/11 (`PLAFOND_PASSIONS_EN_VIGUEUR = false`, app-06), prévoyaient de le **rétablir** comme avantage payant.

Les fenêtres de limite de passions (`openPassionPaywall`) disaient en outre, à tout compte qui créait plus de trois noms absents du catalogue : « En créer d'autres fera partie d'une formule payante. »

Le 10/11/2026, mesuré en production : 13 comptes, 2 actifs sur 28 jours, 0 rencontre à venir, 0 présence pointée. Ce qui manque n'est pas une offre : c'est la densité.

## Décision

1. **Un membre ne paie jamais.** Suivre, publier, commenter, écrire, rejoindre une rencontre, organiser une rencontre gratuite : gratuit, sans limite de durée. Aucune offre grand public n'est prévue.
2. **Les passions sont illimitées, définitivement.** Le plafond de trois passions et le quota de changements ne seront pas vendus. Le mécanisme reste dans le code, armable sur un appareil (les suites qui l'éprouvent), comme limite de secours ; le réarmer pour tous demande de **rouvrir cet ADR**, jamais de basculer une constante.
3. **Aucune fenêtre n'annonce d'offre payante.** La seule limite qui s'applique encore en production, les trois **créations** de noms absents du catalogue (tenues par le serveur, `creer_passion`), est présentée pour ce qu'elle est : l'anti-abus du catalogue, chaque nom neuf étant relu.
4. **Ceux qui paieraient sont les organisateurs** qui vendent déjà leurs séances, et plus tard les lieux. Le détail des offres et des prix vit dans le dossier d'affaires, **hors de ce dépôt public**.
5. **Une offre ne s'ouvre que sur l'usage, mesuré par ville** — jamais sur une date ni sur un nombre d'inscrits. Les quatre seuils du pilote (`SEUILS_LANCEMENT`, `_shared/pilotage.js`) : actifs de la ville sur 7 jours, rencontres réelles sur 7 jours (au moins 3 présents pointés au QR), taux de présence sur 30 jours, organisateurs réguliers sur 30 jours. Ils doivent tenir **huit semaines**, dont les quatre dernières au-dessus. Le centre de pilotage (`/pilotage/`) les affiche et prévient quand ils tiennent.

## Conséquences

- `openPassionPaywall` (app-06) : plus de « formule payante », plus d'encadré « cette formule n'est pas encore ouverte ». Titres : « Trois passions à la fois », « Trois créations de passion ». Verrous : `passions-plates.spec.js`, `creation-passion.spec.js` (la fenêtre ne contient pas « payante »).
- Les paliers de croissance du pilotage (`PALIERS_CROISSANCE`) n'annoncent plus PASSIO+.
- Le centre de pilotage lit les seuils (`lireSeuils`, fonction `pilotage`) en lecture seule, sans migration. Une lecture ratée ne colore pas le voyant (`seuils` n'est pas dans `SOURCES_VERDICT`).
- Ce qui ne se mesure pas encore est dit, jamais remplacé par un zéro : les organisateurs **professionnels** (aucun champ ne les distingue) et la ville de rattachement d'un compte (un compte est rattaché à une ville par les rencontres qu'il a organisées, rejointes ou pointées).
- **Interdit désormais** : un abonnement membre, un plafond d'usage social vendu, des frais de service facturés au participant, une publicité programmatique.

## Alternatives écartées

- **PASSIO+ avec le plafond de passions comme premier avantage** : il faisait payer une liberté donnée gratuitement le 01/11, contredisait la promesse du kit de lancement, et réduisait le nombre de croisements dont dépendent les rencontres. Sur un réseau social hors rencontre amoureuse, la conversion attendue (1 à 3 %) ne finance rien avant plusieurs milliers d'actifs.
- **Ouvrir une offre à une date fixe** : une date ne dit rien de la densité ; une offre ouverte sur un réseau vide fait fuir les premiers organisateurs.
- **Un palier d'inscrits** : un pic de presse gonfle les inscrits sans créer une seule rencontre.

## Trigger de réexamen

- Huit semaines de seuils du pilote tenus dans une ville sans qu'aucun organisateur n'accepte de payer : revoir le modèle (commission seule, ou paiement au résultat), **sans** rouvrir l'idée d'un abonnement membre.
- Un abus massif de création ou de rotation de passions mesuré en production : réarmer une limite **technique**, sans jamais la vendre.
