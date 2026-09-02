---
name: chatgpt
description: "Canal ChatGPT (scripts/chatgpt.js) : question, challenge, dossier. Dire : demande à ChatGPT, second avis."
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
| Coût | **crédits d'espace de travail** — voir l'avertissement ci-dessous | 0 € |
| Prérequis | `codex login` une fois | Chrome + panneau Claude connecté au **même** compte |

### Le transport retenu : `codex` — et ce qu'il coûte réellement

Décidé le 2026-08-16, `transportDisponible()` le préfère automatiquement à l'API.

```bash
codex login              # « Sign in with ChatGPT » — Benjamin uniquement
node scripts/chatgpt.js etat
```

⚠️ **Rectifié le 2026-08-23 : ce paragraphe affirmait « aucun frais
supplémentaire ». C'est faux.**

La chaîne a été menée jusqu'au bout ce jour-là : `codex login` réussi
(« Successfully logged in »), `node scripts/chatgpt.js etat` affichant `codex ✅
prêt`, puis une vraie question envoyée dans le fil `produit`. Réponse du CLI :

```
ERROR: Your workspace is out of credits. Add credits to continue.
```

L'usage tire donc sur un **pool de crédits d'espace de travail**, distinct de
l'abonnement ChatGPT, et ce pool peut être vide. Deux conséquences à retenir :

- **`codex login` n'était pas la dernière pièce manquante.** L'ancienne version de
  ce fichier le disait, parce que la chaîne s'arrêtait sur `401 Unauthorized` et
  que personne n'était allé plus loin. Un échec d'authentification masquait un
  problème de facturation.
- **`etat` au vert ne prouve pas que le canal fonctionne.** Il ne teste que la
  connexion, pas les crédits. Le seul test qui vaut est une question réelle.

Sans crédits, le repli praticable n'est pas le pilotage du navigateur (huit pièges,
aucune garde secrets) mais **Benjamin qui colle l'invite dans un onglet ChatGPT** :
c'est pour ça que les invites de cette skill doivent rester auto-suffisantes.

L'API (`OPENAI_API_KEY`) reste implémentée en repli, mais elle est **facturée au
jeton** : ne pas la poser sans décision explicite de Benjamin.

Tant qu'aucun transport n'est connecté, le script s'arrête proprement et renvoie
vers le navigateur : **ne jamais faire semblant d'avoir consulté ChatGPT.**

### ⚠️ Codex n'est pas ChatGPT dans un onglet

C'est un **agent doté d'outils de lecture**, et cette phrase est à prendre au pied
de la lettre. Test canari du 2026-08-17, à retenir tel quel :

> Lancé avec `--sandbox read-only` dans un dossier temporaire vide, il a lu un
> fichier canari placé dans `C:\Users\BENJAMIN\`, **puis** `package.json` dans le
> dépôt. Interrogé, il a répondu que son premier échec venait de **son propre
> refus, pas du bac à sable**.

Donc : **`read-only` n'interdit que l'écriture, pas la lecture du disque, et le
`cwd` n'est une frontière pour rien.** Même leçon que la Sentinelle, re-mesurée
sur un autre outil. `dashboard/.env` et sa clé `service_role` sont à sa portée
s'il décide de regarder.

Ce que les garde-fous font réellement :

| Garde-fou | Ce qu'il apporte | Ce qu'il n'apporte PAS |
|---|---|---|
| `-C <bac vide>` | supprime la *raison* d'aller lire, préserve l'asymétrie du croisement | aucun confinement |
| `--sandbox read-only` | aucune écriture, aucune commande mutante | ne bloque aucune lecture |
| `--ignore-user-config` `--ignore-rules` | coupe MCP, hooks et instructions globales (aucun MCP configuré aujourd'hui, mais demain ?) | — |
| env filtré (`envFiltre`) | un secret en variable d'environnement ne fuit plus | — |
| `detecterSecrets` | refuse l'envoi d'un secret **dans l'invite** | ne voit pas ce que l'agent va chercher lui-même |

**La règle qui protège vraiment : lui donner une invite auto-suffisante et ne
jamais lui demander d'aller explorer le dépôt.** S'il faut du code dans le
dossier, c'est `--fichier` qui le fournit — ça passe alors par la garde secrets.

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
