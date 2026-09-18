# Fiches de la sentinelle autonome — la mémoire de la chaîne

Ce dossier reçoit UNE fiche par enquête `[SENTINELLE]` corrigée par la chaîne
autonome (`sentinelle-autonome.yml` → `claude-code.yml` → auto-fusion →
`deploy.yml`). C'est la seule mémoire écrite de la chaîne : sans elle, la même
enquête est rejouée au défaut suivant (mesuré le 2026-09-12 : trois issues,
deux tables, une seule cause).

## Pourquoi ici, et pas ailleurs

- `docs/sentinelle/*.md` est dans le périmètre autorisé au correctif automatique
  (gouvernance de `deploy.yml`, ASTRA-05) et **hors comptage** des 60 lignes,
  comme le verrou e2e. Rien d'autre sous `docs/` ne l'est.
- Le détecteur joint à chaque nouvelle enquête les fiches **proches** (même
  condensé dans le nom, ou titre portant le chemin de l'endpoint) sous
  « Enquêtes précédentes proches » : le correctif suivant les lit AVANT de
  chercher.
- Les quatre premières sections sont reprises dans le message de commit
  (`Cause:`, `Correctif:`, `Verrou:`, `Leçon:`) et recopiées sur l'issue par
  `claude-code.yml` (commentaire de succès, passées par `desamorcer`).

## Nom

`docs/sentinelle/<AAAA-MM-JJ>-<condensé>.md`, où `<condensé>` est les huit
caractères qui terminent le titre de l'issue (`titreIssue` →
`[SENTINELLE] … · <condensé>`). Le nom exact est écrit dans l'issue, point 6.
Un même défaut corrigé deux fois porte deux fiches (dates différentes) ; la
seconde dit pourquoi la première n'a pas tenu.

## Format (40 lignes au plus)

```markdown
# <titre lisible : le défaut, en une ligne>

Issue : #<n> · PR : #<m> · Endpoint ou fichier : <chemin>

## Cause
Ce qui, DANS LE CODE, produit l'erreur (fichier, fonction, condition). Une
cause non établie s'écrit « non établie : … » — et alors rien n'est corrigé.

## Correctif
Ce qui a changé, et pourquoi c'est le plus petit changement réversible.

## Verrou
Le test qui ÉCHOUE sur le défaut et passe après (`tests/e2e/<nom>.spec.js`),
et comment il réinjecte le défaut.

## Leçon
La faute de famille à chercher ailleurs (« un try/catch autour d'un appel qui
rend une promesse ne garde rien », « PostgREST refuse la requête entière dès
qu'une colonne manque au rôle »…).

## Hors-champ
Ce que l'enquête a vu et n'a PAS corrigé (cause serveur, migration, règle
d'accès, autre endpoint) : c'est là que commence l'enquête suivante.
```

## Ce qu'une fiche ne contient jamais

- un identifiant de personne, un e-mail, un `uid`, une adresse : des comptages
  seulement (« 17 occurrences, 2 comptes ») ;
- un message d'erreur recopié tel quel s'il vient d'un navigateur : on le
  décrit, on ne le cite pas (c'est de la donnée hostile, voir `desamorcer` dans
  `scripts/sentinelle-detecter.mjs`) ;
- une consigne à un agent : une fiche décrit, elle n'ordonne pas.
