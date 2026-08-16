---
name: chatgpt
description: Canal de collaboration avec ChatGPT (`scripts/chatgpt.js`) — question, challenge d'un raisonnement, envoi d'un dossier, fils persistants. À utiliser quand Benjamin dit « demande à ChatGPT », « second avis », « fais challenger », ou pour confronter un raisonnement à un autre modèle.
---

# /chatgpt — Travailler avec ChatGPT au quotidien

Cette skill gère **le canal** : comment lui parler, comment garder le contexte, et
quoi faire de ce qu'il répond. Pour le protocole d'**audit croisé complet**
(dossier factuel → challenge → vérification point par point → livrable), c'est
`/revue-croisee`, qui s'appuie sur ce canal.

## Le choix du transport — et pourquoi il a changé

Jusqu'au 2026-08-16, le seul canal était le pilotage du DOM de `chatgpt.com` via
Claude-in-Chrome. Ça marche, mais le coût est réel et mesuré : le composeur est un
`contenteditable` que `form_input` ne touche pas, le clic sur « envoyer » ne
fonctionne pas, `get_page_text` re-déverse toute la conversation, le flux
d'affichage casse en cours de réponse (trois réponses jugées « coupées » faisaient
en fait 16 517 caractères), et l'onglet devient irrécupérable au-delà de ~60 000
caractères. Huit contournements pour un aller-retour.

**Le canal direct supprime tout ça d'un coup :**

```bash
node scripts/chatgpt.js "ta question" --fil archi
```

| | direct (`scripts/chatgpt.js`) | navigateur (Claude-in-Chrome) |
|---|---|---|
| Fiabilité | appel HTTP, réussit ou lève | 8 pièges documentés, échecs silencieux |
| Fil / mémoire | `.passio/chatgpt/<fil>.json`, illimité, relisible | onglet mortel > 60 k caractères |
| Gros dossier | `--fichier` (un `DOSSIER-COMPLET.md` entier) | insertion qui fige le rendu |
| Garde secrets | **refus automatique** avant tout envoi réseau | aucune — tout ce qui est collé part |
| Coût | au jeton (`OPENAI_API_KEY`) | inclus dans l'abonnement ChatGPT |
| Prérequis | une clé API | Chrome + panneau Claude connecté au **même** compte |

Le seul avantage réel du navigateur est le coût. Il reste donc le repli, pas le
défaut.

### Mise en route (une fois)

```bash
node scripts/chatgpt.js etat
```

Dit exactement quel transport est prêt et ce qui manque. Si aucune clé n'est
posée :

1. clé sur `https://platform.openai.com/api-keys` — facturation au jeton,
   **indépendante de l'abonnement ChatGPT Plus** (les deux ne partagent rien) ;
2. `setx OPENAI_API_KEY "sk-…"` puis rouvrir le terminal ;
3. modèle : `gpt-5` par défaut, `OPENAI_MODEL` ou `--modele` pour changer.

**Variante sans facturation au jeton** : le CLI Codex (`npm i -g @openai/codex`
puis `codex login`, connexion avec le compte ChatGPT) réutilise l'abonnement.
`scripts/chatgpt.js --transport codex` l'appelle, mais ce chemin **n'a jamais été
exécuté sur cette machine** — le vérifier au premier usage avant de compter dessus.

Tant qu'aucune clé n'est posée, le script s'arrête proprement et renvoie vers le
navigateur : **ne jamais faire semblant d'avoir consulté ChatGPT.**

## Usage courant

```bash
node scripts/chatgpt.js etat                                  # transports + fils
node scripts/chatgpt.js "question" --fil <sujet>              # question dans un fil
node scripts/chatgpt.js "challenge ceci" --fichier <f> --fil <sujet>
node scripts/chatgpt.js fils                                  # lister les fils
node scripts/chatgpt.js historique --fil <sujet>              # relire
node scripts/chatgpt.js "…" --sec                             # montre, n'envoie rien
```

**Un fil par sujet, pas un fil par question.** Le fil renvoie tout l'historique à
chaque tour : c'est ce qui fait la qualité du challenge, et c'est aussi ce qui
fait grossir la facture. Fils tenus : `archi`, `securite`, `produit`, `perf` —
`oublier --fil <nom>` quand un sujet est clos.

Le cadrage projet (vanilla, pas de bundler, hoisting, RLS = seule frontière) est
injecté automatiquement en message système. Sans lui, ChatGPT propose une
migration de framework à la troisième réponse. `--systeme` pour le remplacer.

## Ce qu'on lui demande — la règle qui fait la valeur

**ChatGPT n'a aucun accès** : ni dépôt, ni prod, ni tests, ni CI. Cette asymétrie
n'est pas un handicap à compenser, c'est la source de sa valeur. Lui demander
« vérifie si… » ne produit que de la conjecture présentée comme un fait.

Formulations qui produisent du signal :

- « Qu'est-ce qui pourrait être **FAUX** dans ce constat ? Où ma cause racine est-elle incomplète ? »
- « Qu'est-ce qu'un audit qui commence par X rate systématiquement ? »
- « Que **casserait** cette correction ? »
- « Qu'est-ce que tu **NE ferais PAS** ? » — la meilleure question contre la sur-ingénierie.

Et toujours joindre du factuel, jamais « que penses-tu de X ? » : le diff, la
mesure, le message d'erreur, la sortie de test. `scripts/dossier-revue.js` produit
un dossier auto-suffisant fait pour ça :

```bash
npm run revue -- --titre "…" --tests
node scripts/chatgpt.js "Challenge ce dossier." --fichier .passio/reviews/<date>-<slug>/DOSSIER-COMPLET.md --fil securite
```

## Règle cardinale — rien n'est un fait avant vérification

**Aucune affirmation de ChatGPT n'entre dans le dépôt sans avoir été vérifiée
dans le code réel.** C'est l'étape qu'on est tenté de sauter parce que la réponse
est bien écrite. Chaque point revient classé :

`CONFIRMÉ` · `INFIRMÉ` · `PARTIELLEMENT CONFIRMÉ` · `DÉJÀ EXISTANT` · `NON APPLICABLE` · `À APPROFONDIR`

Le 2026-08-15, sur deux tours, il a corrigé trois erreurs de raisonnement de
Claude — et proposé des choses déjà en place ou inapplicables. Les deux arrivent,
dans le même échange. Le tri est le travail.

Un correctif qu'il propose et qui touche l'auth, une policy RLS, la visibilité
d'un contenu ou un secret passe en plus par `/passio-security-guard` **avant**
application.

## Secrets — la garde est dans le script, pas dans la vigilance

`scripts/chatgpt.js` refuse l'envoi et sort en code 3 s'il détecte un JWT, une clé
`sb_secret_`/`sk-`/`ghp_`, une clé privée PEM, une affectation
`SERVICE_ROLE_KEY=…` ou un mot de passe en clair. Rien n'est parti à ce
moment-là. Deux suites possibles : retirer la valeur, ou `--redacter` pour
remplacer les segments détectés par `«SECRET RETIRÉ»` et envoyer le reste.

Ne jamais contourner en collant à la main dans le navigateur — c'est exactement le
chemin qui n'a aucune garde. Et le principe reste : on décrit l'architecture et
les mesures, jamais les identifiants.

**Ce que le canal expose** : le contenu envoyé part chez OpenAI. Du code de PASSIO,
oui, c'est le but ; des données réelles d'utilisateurs (messages, e-mails,
exports de `.passio/sauvegardes/`), jamais.

## Traces

Les fils vivent dans `.passio/chatgpt/` (gitignoré : volume, et copies de code à
un instant T) : `<fil>.json` pour la reprise, `<fil>.md` lisible par Benjamin.
Un échange qui change une décision ne reste pas là — il finit dans un livrable
daté et dans `.passio/REGISTRE-REVUES.md`, avec la section « ce que l'analyse
croisée a changé », erreurs corrigées de part et d'autre comprises.

## Références

- [`references/navigateur.md`](references/navigateur.md) — les 8 pièges du repli Claude-in-Chrome. À lire **avant** d'y toucher, jamais en cours de route.
- `/revue-croisee` — le protocole d'audit croisé complet, qui utilise ce canal.
