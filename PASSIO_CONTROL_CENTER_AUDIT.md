# PASSIO — Audit du centre de pilotage (Claude Code + ChatGPT)

> Audit conjoint du 2026-08-15. ChatGPT a produit une revue critique des vues ; **chaque recommandation a été confrontée au code réel** et classée CONFIRMÉE / DÉJÀ EXISTANTE / PARTIELLEMENT APPLICABLE / NON APPLICABLE.
> Complète `PASSIO_INITIAL_JOINT_AUDIT.md`. Feuille de route historique : `PASSIO_CONTROL_CENTER_ROADMAP.md`.

## CURRENT STATE — mesuré, pas résumé

| Élément | Réalité |
|---|---|
| Architecture | Node/Express + SPA vanilla (modules ES natifs, sans bundler), flux SSE, thème violet. Hors build Netlify. |
| Routes API | **61** |
| Vues | **29**, déjà réparties en « L'essentiel » (14) et « Outils avancés » (15) |
| Tests backend | **89 passés, 0 échec** |
| Sécurité | Clé `service_role` côté serveur uniquement, lecture seule ; sessions signées HMAC httpOnly ; **capacités par vue** (`db`, `claude`, `git_read`, `flags`, `audit`) ; mutations de code désactivées en prod ; journal d'audit |
| Honnêteté des données | Principe `NON INSTRUMENTÉ` déjà tenu ; bandeau de provenance (source / fraîcheur / confiance) sur Accueil, KPI et Brief |

Le cockpit est **plus mûr que ne le supposait la revue externe**. C'est le point le plus important de cet audit : la majorité des recommandations « SIMPLIFY » et « SECURE » portaient sur des choses déjà faites.

## REVUE CHATGPT — confrontée au code

| Recommandation | Verdict après vérification |
|---|---|
| Sessions de test, Appareils, Performances, Tests, Git, Alertes → SIMPLIFY / demote | **DÉJÀ EXISTANT.** Toutes déjà dans « Outils avancés », hors du parcours principal. |
| Journal d'audit → SECURE + SIMPLIFY | **DÉJÀ EXISTANT.** Déjà en avancé **et** derrière la capacité `audit`. |
| Intégrité des données → KEEP, sous réserve de règles fiables | **CONFIRMÉ.** Gardée, derrière la capacité `db` (elle expose des identifiants de base). |
| Traçage des actions → KEEP | **CONFIRMÉ.** Brique la plus solide du cockpit. |
| « Réparer avec Claude » → REMOVE du cockpit fondateur | **NON APPLICABLE.** C'est le poste de réparation réel de Benjamin, déjà derrière la capacité `claude`. Le retirer supprimerait un outil utilisé, pas du bruit. |
| Liens partagés → REMOVE du cockpit principal | **PARTIELLEMENT APPLICABLE.** Vue produit délibérée. À déplacer en avancé le jour où l'accueil sépare produit et système — pas à supprimer. |
| Visiteurs → SIMPLIFY | **CONFIRMÉ, et plus urgent que prévu** : la métrique est structurellement dégradée (voir ci-dessous). |
| Séparer SANTÉ PRODUIT et SANTÉ TECHNIQUE | **CONFIRMÉ, non fait.** Aujourd'hui rétention, visiteurs et KPI cohabitent avec bugs, intégrité et déploiement. Une chute de rétention ne veut pas dire que PASSIO est cassé ; un contournement RLS avec une rétention excellente veut dire qu'il l'est gravement. |
| Score de santé : proscrire la moyenne pondérée | **CONFIRMÉ — et le défaut est dans le code.** Voir F7. |

## F7 — Le score de readiness est une moyenne pondérée sans composante d'autorisation · **P1**

`dashboard/server/readiness.js` calcule exactement le modèle que la revue externe dénonçait :

```
Stabilité (erreurs 5 min)            poids 20
Bugs critiques ouverts               poids 25
Réussite des tests fonctionnels      poids 25
Couverture checklist                 poids 15
Disponibilité API                    poids 15
score = Σ(score × poids) / Σ(poids)
```

Deux conséquences vérifiables :

1. **Trois bugs critiques ouverts font tomber leur facteur à 0 — et le score affiche encore 75/100** si les autres facteurs sont au vert. `max(0, 100 − 3×34) = 0`, puis `(0×25 + 100×75)/100 = 75`.
2. **Aucun facteur d'autorisation n'existe.** Une fuite cross-compte totale ne déplacerait pas ce score d'un seul point.

Le fichier se protège honnêtement (« aide à la décision, PAS une garantie de livrabilité »), mais un chiffre affiché est lu comme un verdict. C'est le défaut le plus net du cockpit.

**Correctif retenu** : `santé = pire domaine critique` (disponibilité, parcours critiques, autorisation, intégrité, convergence) ; la performance ne peut produire qu'un AMBER, l'autorisation un ROUGE immédiat. Les propriétés binaires (0 fuite cross-compte, 0 usurpation, 0 corruption wallet) ne se moyennent jamais : 11 canaris sur 12 = ROUGE, pas 92 %.

## AUCUNE PRÉCISION FICTIVE — l'extension du principe maison

Le cockpit tient déjà « aucune donnée fictive ». Il doit maintenant tenir **« aucune précision fictive »** : une valeur issue de vraies lignes SQL peut être une métrique fausse.

Cas avéré, mesuré ce jour : les événements `session` sont anonymes à **99 %** et `perf` à **100 %** (voir `PASSIO_INITIAL_JOINT_AUDIT.md`, F2). Or l'entonnoir « Visiteurs → lien → compte » repose sur `session`. La vue Visiteurs affiche donc un nombre exact dérivé d'un dénominateur inconnu.

Affichage cible tant que F2 n'est pas corrigé :

```
Visiteurs observés      1 284
Couverture identité     51 %
Fiabilité pré-auth      NON VÉRIFIÉE
Statut métrique         DÉGRADÉ
```

## À CRÉER — ce qui manque vraiment

Après confrontation au code, deux des quatre créations proposées sont déjà partiellement couvertes (`Vérif. interactions` couvre la convergence cross-device ; `Campagne QA` + `Tests fonctionnels` couvrent les parcours). Restent deux manques réels :

**1. Panneau AUTORISATION** — le pendant direct de F1. Aujourd'hui, rien dans le cockpit ne dit si la séparation entre comptes tient.

```
Canari RLS                    PASS
Fuite cross-compte            PASS
Propriété du profil           PASS
Autorisation Storage          NON INSTRUMENTÉ
Dernière vérification         il y a 4 min
```

**2. Vue RELEASES** — une seule ligne disant *ce que l'utilisateur exécute réellement* : commit → CI → build → déploiement Netlify → version frontend → version DB. C'est aussi le support naturel du test de version skew (F5). Aujourd'hui `Modifications Git` et `Services` existent séparément, sans jamais se rejoindre en « version en production ».

## SÉCURITÉ DU COCKPIT

Solide, et une leçon déjà payée : l'intégrité des données expose des identifiants de base, et une route (`/api/diagnose`) avait fuité par cette bande avant d'être remise derrière la capacité `db`. **Invariant à tenir : toute route qui embarque l'intégrité vérifie `db`.**

Point restant : le cockpit n'a pas de test qui prouve qu'un rôle sans capacité ne reçoit jamais la donnée correspondante. Les 89 tests couvrent la logique ; la matrice de permissions mérite ses propres tests.

## PLAN D'IMPLÉMENTATION

| # | Action | Priorité |
|---|---|---|
| 1 | Remplacer la moyenne de `readiness.js` par `min(domaines critiques)` + second chiffre CONFIANCE | P1 |
| 2 | Marquer DÉGRADÉES les métriques dépendant de `session` et `perf` | P1 |
| 3 | Créer le panneau AUTORISATION, alimenté par le noyau AUTHZ-CRITICAL | P1 |
| 4 | Séparer SANTÉ PRODUIT / SANTÉ TECHNIQUE sur l'accueil | P2 |
| 5 | Créer la vue RELEASES (version réellement servie) | P2 |
| 6 | Tests de la matrice de permissions par rôle | P2 |
| 7 | Déplacer Liens partagés en avancé, une fois (4) fait | P3 |

## CE QU'IL NE FAUT PAS FAIRE

Ne pas ajouter de métriques : le cockpit est déjà **plus riche que la qualité de certaines de ses sources**. F2 en est la démonstration. Le travail n'est pas d'ajouter des écrans, c'est de rendre fiables ceux qui existent — puis de réduire.
