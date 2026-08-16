# ADR-008 — Une suppression de message peut être annulée par la fusion au boot

- **Statut** : Proposé — arbitrage produit requis
- **Date** : 2026-08-16
- **Origine** : scénario multi-appareil n° 2 de l'analyse croisée (« résurrection IndexedDB »)

## Ce qui a été reproduit

Test exécuté sur le vrai code, résultat brut :

```
{"convs":["conv_1","conv_2"], "messagesConv1":["m1","m2"],
 "secretRevenu":true, "conv2Revenue":true}
```

Une conversation supprimée **et** un message privé supprimé reviennent tous les deux après un redémarrage.

## Le mécanisme

Les conversations vivent dans deux stores. `saveConversations()` écrit dans les deux :

- `localStorage` — écriture **synchrone**, aboutit immédiatement ;
- IndexedDB via `idbConvSave` — écriture **asynchrone et best-effort**, dont personne ne lit le résultat.

Au démarrage, `hydrateConvsFromIDB()` fait `_unionConvsById(idbConvs, current)` : une **union par identifiant, sans pierre tombale**. Tout ce qui existe dans l'un des deux stores est conservé.

Donc : si l'onglet se ferme (ou si IndexedDB échoue, ou sature) entre l'écriture localStorage et la fin de l'écriture IndexedDB, la suppression n'existe que d'un côté — et l'union la défait au boot suivant.

## Pourquoi le code est comme ça, et pourquoi ce n'est pas une erreur

L'union a été introduite pour corriger l'inverse, et le commentaire du code le dit : un message écrit dans localStorage mais pas dans IndexedDB **disparaissait définitivement** au démarrage suivant. Entre « on perd des messages » et « une suppression peut être annulée », le choix fait était le bon — perdre le message de quelqu'un est pire.

Le défaut n'est donc pas la fusion : c'est qu'**aucun des deux stores ne sait distinguer « jamais existé » de « supprimé »**.

## Options

**A — Ne rien changer.** La fenêtre est étroite (fermeture pendant l'écriture asynchrone). Mais la conséquence est un message privé effacé qui réapparaît : c'est précisément ce qui détruit la confiance dans une messagerie.

**B — Journal de suppressions (pierres tombales).** À la suppression, écrire l'identifiant dans une liste persistée ; à la fusion, exclure tout identifiant présent dans ce journal. Purge du journal après un délai (30 jours suffisent — au-delà, le store distant fait autorité).

**C — Rendre l'écriture IndexedDB fiable.** Attendre son acquittement avant de considérer la suppression effectuée, et retenter. Réduit la fenêtre sans la fermer : une fermeture d'onglet reste plus rapide que n'importe quel acquittement.

## Recommandation

**B.** C'est la seule option qui ferme le trou plutôt que de le rétrécir, et elle préserve la propriété qu'on ne veut surtout pas perdre : la fusion continue de ne jamais faire disparaître un message qui n'a pas été explicitement supprimé.

Le journal doit être **borné** (identifiants seuls, TTL) pour ne pas devenir le prochain blob de 4,7 Mo — cf. `SYNC-B64-005`.

## Pourquoi ce n'est pas implémenté cette nuit

C'est le store des **messages privés**, la donnée la plus sensible de l'app, et le correctif précédent dans cette même zone corrigeait une perte de messages restée invisible six jours. Une pierre tombale mal posée ne fait pas réapparaître un message : elle le fait disparaître. Le rapport risque/bénéfice d'une modification non supervisée y est mauvais, quelle que soit la qualité du test qui l'accompagne.

## Trigger

À traiter avant toute ouverture publique de la messagerie, et immédiatement si un utilisateur signale un message supprimé revenu.
