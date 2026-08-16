# Sentinelle du centre de pilotage — analyse croisée Claude Code ↔ ChatGPT

**Date** : 2026-08-16 · **Objet** : `dashboard/server/sentinel.js` — un automate qui
lance Claude Code tout seul sur les alertes de production.
**Commits** : `99156b9` (construction), `fe30cb3` (sandbox), `e7a5316` (fail-closed).
**Répartition** : Claude Code détient le dépôt, la prod, les tests — il mesure et
vérifie. ChatGPT n'a aucun accès — il challenge. Deux tours d'échange réels
(fil « Analyse croisée PASSIO sécurité »).

---

## 1. Ce que l'analyse croisée a changé

Elle a trouvé un trou **critique** que j'avais moi-même documenté comme fermé.
J'écrivais « lecture seule, sans exception ». C'était faux.

### Le trou : une liste noire d'outils, contournée par défaut

`claudecli.js` restreignait le processus Claude enfant par `--disallowedTools`
(`Bash`, `Edit`, `Write`, `Task`, `WebFetch`…). ChatGPT : *« ta politique de
sécurité est une denylist attachée à un binaire mutable — c'est plus dangereux
que la prompt injection elle-même »*.

Vérification : j'ai lancé le CLI avec les arguments **exacts** du code et lui ai
demandé la liste de ses outils. Il disposait de :

| Ce qu'il avait | Pourquoi la liste noire ne le voyait pas |
|---|---|
| **`PowerShell`** | la liste interdisait « Bash » — l'outil shell s'appelle PowerShell sous Windows |
| **`mcp__…__execute_sql`, `apply_migration`, `delete_branch`, `pause_project`, `restore_project`** | les outils MCP ne sont pas des intégrés : aucune liste noire d'intégrés ne les couvre |
| `CronCreate`, `RemoteTrigger`, `TaskCreate`, `SendMessage`, `Artifact` | idem, hors périmètre de la liste |

Et `.claude/settings.json` du projet pose `defaultMode: bypassPermissions` :
ces outils **s'auto-approuvent**. Chaîne complète : stack trace fabriquée dans un
navigateur → télémétrie → prompt → écriture en base de **production**.

Ce trou **préexistait** à la sentinelle : le bouton « Analyse approfondie » a la
même exposition depuis sa création. Ce que la sentinelle changeait, c'est qu'elle
le rendait **automatique et sans personne devant l'écran**. C'est ce qui le fait
passer de théorique à réel.

### Le second trou : le dossier de travail n'est pas une frontière

Après correction, ChatGPT relance : *« Read/Grep/Glob ne veut pas forcément dire
dépôt uniquement — c'est le premier test que je ferais »*. Mesuré :

| Tentative | Résultat |
|---|---|
| chemin **absolu** hors dépôt | refusé |
| chemin **relatif** `../../AppData/Local/Temp/canari.txt` | **lu, contenu recopié** |

Trois formes de règles de permission par `--settings` essayées : aucune ne tient.
Avec `defaultMode: manual` en `-p`, tout est refusé, dépôt compris (inutilisable) ;
avec les règles `deny` seules, la remontée passe toujours.

**Décision assumée plutôt que contournée** : tant qu'on ne sait pas confiner, un
automate sans surveillance n'a pas de disque. L'analyse approfondie automatique
passe en opt-in (`DASH_SENTINEL_DEEP=true`). Ce n'est pas une perte : l'extrait de
code est déjà dans le prompt, lu par le **serveur**, dont le confinement est
vérifiable — et qui a lui aussi été corrigé (voir ci-dessous).

### Ce qu'il a corrigé dans mon propre texte

L'état vide de la page Sentinelle disait *« Aucun diagnostic pour l'instant.
C'est bon signe »*. C'est exactement l'inférence fausse qu'il décrit en Q2 : un
débogueur déclenché par alertes est aveugle à tout ce qui n'en produit pas
(bouton qui n'émet plus rien, résultat faux en HTTP 200, télémétrie interrompue —
ces pannes ressemblent au calme). Réécrit, et l'angle mort est documenté en tête
de module.

---

## 2. Verdicts, point par point

| # | Point de ChatGPT | Verdict | Suite |
|---|---|---|---|
| Q5 | Liste noire attachée à un binaire mutable | **CONFIRMÉ** (pire que l'hypothèse) | liste blanche `--tools`, `--safe-mode`, `--strict-mcp-config`, `--no-session-persistence`, `--no-chrome` ; 3 tests verrouillent le profil |
| R1.1 | `Read` sort du dossier de travail | **CONFIRMÉ** | approfondi automatique désactivé par défaut |
| Q1 | Chemin extrait de la stack → traversée | **CONFIRMÉ** | le garde comparait un **préfixe nu** : un dossier voisin passait (`…/PASSIO-autre/x.js` commence par `…/PASSIO`). `resolve` + séparateur |
| Q3 | `spawn` hérite de `process.env`, secrets inclus | **CONFIRMÉ** | env de l'enfant filtré nommément |
| Q3 | Sémantique de `kill` sous Windows | **CONFIRMÉ** | `taskkill /T` : sinon un `claude` orphelin survit et consomme le quota |
| Q3 | Cooldown 6 h masque une régression post-commit | **CONFIRMÉ** | la clé de cooldown porte la révision du dépôt (lue dans `.git`, sans processus) |
| Q3 | Famine de quota (56 min/h possibles) | **PARTIELLEMENT CONFIRMÉ** | sous-plafond 3 approfondies/h, puis **dégradation** en rapide plutôt que renoncement |
| R1.4 | Sortie non bornée | **CONFIRMÉ** | CLI coupé à 400 Ko, diagnostic persisté à 60 Ko |
| Q2 | Angle mort : l'absence d'alerte n'est pas la santé | **CONFIRMÉ** | état vide réécrit, angle mort documenté, renvoi vers l'Accueil |
| Q2 | Séparer preuves / hypothèse / confiance | **CONFIRMÉ** | format de réponse imposé + mise en garde contre le biais « le dernier commit est le coupable » |
| Q1 | XSS stocké par le diagnostic rendu en HTML | **INFIRMÉ** | le rendu passe par `mdToHtml`, qui échappe **avant** de styliser. Un `onclick` a tout de même cédé la place à un attribut de donnée (piège maison) |
| R1.5 | Donnée hostile dans un chemin de fichier | **DÉJÀ SÛR** | fichier unique, identifiants générés côté serveur |
| Q3 | « Lecture seule Supabase » = convention, pas capacité | **CONFIRMÉ — OUVERT** | `service_role` contourne RLS et peut écrire. Non corrigé (il faut un rôle DB restreint) ; je cesse de l'appeler propriété de sécurité |
| Q4 | Supprimer le mode approfondi ? | **PARTIELLEMENT RETENU** | pas supprimé, mais désactivé par défaut pour l'automate — pour une raison de sécurité mesurée, pas d'économie |
| R2 | Canari synthétique + DB_READ + heartbeat SSE | **RETENU, NON IMPLÉMENTÉ** | voir §4 |

---

## 3. Deux pièges de plateforme, mesurés

Ils ne sont pas devinables et méritent d'être retenus :

1. **`--tools ""` ouvre au lieu de fermer.** Documenté « aucun outil », il rend en
   fait la liste **complète** (Bash, Edit, Write inclus). Un nom d'outil invalide
   produit le même effet. Une liste blanche n'est fiable qu'avec des noms
   **valides** — le mode rapide n'obtient donc qu'un outil inerte.
2. **`--bare` n'est pas `--safe-mode`.** `--bare` coupe l'authentification OAuth :
   l'analyse gratuite par abonnement cesserait de fonctionner. C'est `--safe-mode`
   qu'il faut pour neutraliser les personnalisations.

Preuve comportementale, pas déclarative : le mode rapide répond `IMPOSSIBLE`
quand on lui demande de lire un fichier ; le mode approfondi, quand on lui demande
d'exécuter une commande.

---

## 4. Ce qui reste ouvert

- **Santé de l'observation** (recommandation R2, non implémentée). Avec quelques
  testeurs et des heures légitimement silencieuses, « zéro événement = alerte »
  ne marche pas. Mesurer les **coutures**, pas l'activité : ① lecture Supabase
  réussie (0 ligne = succès) ; ② heartbeat SSE (Node → dashboard) ; ③ **canari
  synthétique** émis toutes les 15 min par le chemin public de la télémétrie
  (clé anon, pas `service_role`), que le backend doit retrouver sous 90 s. Trois
  états — `DB_READ`, `CANARY_INGESTION`, `SSE` — et un état `QUIET` qui n'est
  **jamais** une santé. Le canari doit être exclu des analytics, du comptage
  utilisateurs et surtout du déclenchement de la sentinelle, sinon le système de
  santé alimente son propre système de diagnostic.
- **`service_role` peut écrire.** Un rôle DB en lecture seule ferait de « lecture
  seule » une capacité et non une convention.
- **Injection de l'opérateur.** Le principal actionneur restant, c'est le lecteur :
  fabriquer un incident qui pousse le diagnostic vers une conclusion dangereuse
  mais plausible. La séparation Preuves / Hypothèse est une première réponse ;
  la règle à garder en tête est qu'un diagnostic est une analyse **issue de
  données adversariales**, jamais un ordre.
