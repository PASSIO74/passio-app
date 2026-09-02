---
name: passio-exhaustive-qa
description: Inventorie la surface fonctionnelle réelle de PASSIO, génère les scénarios de test, tient la matrice de couverture à jour et désigne ce qui n'est PAS testé. À utiliser pour mesurer la couverture, décider quoi tester ensuite, vérifier qu'une fonctionnalité n'a pas été oubliée, ou quand Benjamin demande « qu'est-ce qui n'est pas couvert ? ».
---

# /passio-exhaustive-qa — Ce qui n'est pas mesuré n'est pas couvert

## Le chiffre de référence, et ce qu'il vaut

**66 interactions sur 435 s'exécutent pendant la suite complète : 15,2 %** (mesuré le 2026-08-16).

**Plafond, pas plancher** : une interaction compte comme couverte dès que sa fonction s'exécute — **même appelée depuis une autre fonction plutôt que par un clic**, et même sans qu'aucune assertion ne porte sur son effet. Le taux réellement *vérifié* est nécessairement plus bas. Ne jamais présenter 15,2 % comme une borne prudente : c'est la définition la plus généreuse possible.

## Mesurer (ne jamais estimer)

```bash
node scripts/couverture-interactions.js   # dénominateur : 435 interactions
npm run couverture:mesure                 # exécute la suite avec l'enregistreur
npm run couverture                        # rapport
```

Fonctionnement de l'enregistreur, **trois pièges de mesure** déjà rencontrés, répartition des 435 par fichier et commandes d'inventaire de la surface : [`references/mesure-couverture.md`](references/mesure-couverture.md).

## Décider quoi tester ensuite — par le risque, pas par le pourcentage

1. **Mutations cross-compte** — fuites et usurpations.
2. **Écritures qui peuvent échouer en silence** — `{ error }` non lu.
3. **Chemins secondaires** d'une fonctionnalité par ailleurs bien traitée.
4. **Reprises d'erreur** — hors-ligne, token expiré, quota, réponse tardive.
5. Le reste : options, panneaux, éditeurs.

Justification de cet ordre, et comment écrire un scénario qui garde vraiment quelque chose (**contre-épreuve obligatoire**, mutation-testing) : [`references/scenarios.md`](references/scenarios.md).

## Commandes

```bash
npx playwright test                                                  # suite par défaut
PASSIO_E2E_MULTI=1 npx playwright test multi-comptes confidentialite # cross-compte réel
PASSIO_QA_CAMPAIGN=1 npx playwright test qa-campaign                 # campagne
npx playwright test tests/e2e/authz-critical.spec.js                 # gate d'autorisation
npm run audit:tests                                                  # tests creux
npm run purge:e2e                                                    # nettoyer les comptes de test
```

⚠️ La suite écrit **dans la base de production** — il n'existe pas de base de test. Vérifier le nettoyage après toute campagne cross-compte (0 compte e2e résiduel).

## Réussite / échec

✅ Dénominateur issu d'un script versionné, pas d'un comptage à la main · chaque nouveau scénario mutation-testé · matrice distinguant « exécuté » de « vérifié par assertion » · tout `NON TESTÉ` porte une **justification explicite**.

🛑 Un pourcentage annoncé sans commande pour le reproduire · un scénario sans contre-épreuve sur un correctif de suppression ou de filtrage · une couverture améliorée en modifiant `tests/` pour flatter la mesure.

Format du rapport de couverture : [`references/mesure-couverture.md`](references/mesure-couverture.md).
