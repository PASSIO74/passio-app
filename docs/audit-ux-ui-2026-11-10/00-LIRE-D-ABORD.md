# Audit UX/UI de PASSIO — notice d'ouverture

> Version auditée : `main` au commit `4e1d8ed1` (PR #820, 10 novembre 2026, 14:08 UTC), identique à
> la production servie ce jour-là (`release.json` : `buildId 3d8e98bb12ad`). Branche du dossier :
> `docs/audit-ux-ui-2026-11-10`. Aucun fichier de l'application n'a été modifié.

## Par où commencer

| Je veux… | J'ouvre |
|---|---|
| Comprendre l'essentiel en 5 minutes | [01-SYNTHESE.md](01-SYNTHESE.md) |
| Parcourir toute l'application, comparer avant / après | **[galerie/index.html](galerie/index.html)** — double-clic : s'ouvre dans le navigateur, sans serveur ni connexion |
| Vivre les parcours proposés | onglet « Prototypes » de la galerie, ou les fichiers de [prototypes/](prototypes/) |
| Savoir ce qui a été vu, simulé ou non vérifié | [02-REGISTRE-DE-COUVERTURE.md](02-REGISTRE-DE-COUVERTURE.md) (aussi en tableur : `donnees/registre.csv`) |
| Lire le détail d'un domaine | [rapports/](rapports/) — un rapport par domaine |
| Planifier les corrections | [04-BACKLOG.md](04-BACKLOG.md) (tableur : `donnees/backlog.csv`) et [03-LOTS.md](03-LOTS.md) |
| Vérifier les mesures (44 px, 16 px, contrastes…) | [05-MESURES.md](05-MESURES.md) |
| Connaître les limites de l'audit | [06-LIMITES.md](06-LIMITES.md) |
| Comprendre comment tout a été produit, ou refaire une capture | [outils/GUIDE-AUDIT.md](outils/GUIDE-AUDIT.md) |

## Dans la galerie

- **Vue d'ensemble** : compteurs de couverture, constats P0/P1, couverture par domaine.
- **Surfaces** : une tuile par écran, sous-onglet, menu ou état. Filtres à gauche (statut
  d'observation, verdict, priorité, « avec maquette »). Recherche par identifiant ou par mot.
- **Fiche d'une surface** : capture AVANT (réelle), maquette APRÈS (proposition), en **côte à côte**,
  **bascule** (barre d'espace) ou **curseur** ; annotations numérotées ; gros plans ; un clic agrandit
  (touches + et − pour zoomer, Échap pour fermer) ; mesures automatiques ; constats liés.
- **Constats** : tableau triable ; chaque constat donne preuve, conséquence, proposition, priorité,
  gravité, effort, risque, dépendances et critère d'acceptation observable.
- **Lots**, **Prototypes**, **Dossier** (tous les documents lisibles dans la galerie).

« Avant non capturé » signifie qu'aucune capture de l'existant n'a pu être faite : aucune image n'est
jamais inventée à sa place.

## Refaire ou compléter l'audit

Depuis la racine du worktree (Node et Playwright déjà installés) :

```bash
node docs/audit-ux-ui-2026-11-10/outils/capturer.js <domaine>
```

```bash
node docs/audit-ux-ui-2026-11-10/outils/construire-galerie.js --avertissements
```

```bash
node docs/audit-ux-ui-2026-11-10/outils/synthese-mesures.js
```

Le banc ouvre l'application servie depuis le dépôt dans un navigateur isolé : tout appel à Supabase
est servi par un faux serveur en mémoire ou un projet vide, le temps réel et le service worker sont
coupés, les données sont fictives. Rien n'est écrit en base, aucun message ni notification ne part.
