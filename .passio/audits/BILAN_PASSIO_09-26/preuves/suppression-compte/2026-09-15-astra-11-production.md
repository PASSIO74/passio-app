# ASTRA-11 / ASTRA-12 — preuve après déploiement en production (2026-09-15)

Script : `preuve-astra11-staging.mjs` (scratchpad de la session), joué contre la production par `configAdmin()` (clé service_role du poste), avec des comptes jetables `e2e_*@passio-e2e.test` et des objets de quelques octets, tout nettoyé en fin de script. Aucun compte ni fichier réel touché.

Scénario : B dépose une pièce jointe (`owner = B`) dans une conversation commune ; A dépose sa propre pièce jointe et une photo ; A écrit un message dont l'URL vise le fichier de B (la contre-épreuve d'Astra) ; A supprime son compte par `delete-account`.

## Production, fonction `delete-account` version 7 (déployée par la CI à 08:24:30 UTC, `edge-functions.yml`, après la migration `migration_objets_stockage_compte_2026-09-15.sql` appliquée à 08:18 UTC — verdict 5 OK, mesuré : anon false, authenticated false, service_role true)

```
cible : https://njkiyoklssvefstljemx.supabase.co
A 44c8a96a-c9cf-452f-9735-ef851dc92a99 B e8f0cf3d-80b7-44b4-b393-21379e27b9be
avant : { pjB: true, pjA: true, photoA: true }
delete-account → 200 {"ok":true,"objets":2}
après : { pjB: true, pjA: false, photoA: false } compte A (HTTP) : 404
✅ PREUVE : le fichier de B est intact, ceux de A sont partis, le compte A est supprimé
```

## Staging, même scénario, fonction du 14/09 (reproduction du défaut, 08:12 UTC)

```
avant : { pjB: true, pjA: true, photoA: true }
delete-account → 200 {"ok":true,"piecesJointes":1}
après : { pjB: false, pjA: true, photoA: false } compte A (HTTP) : 404
❌ PREUVE ROUGE
```

Le fichier de B supprimé, celui de A oublié, `ok: true` — pire que le constat d'Astra, qui ne relevait que le premier point.

## Staging, fonction corrigée (08:11 UTC, puis 08:13 après redéploiement)

```
avant : { pjB: true, pjA: true, photoA: true }
delete-account → 200 {"ok":true,"objets":2}
après : { pjB: true, pjA: false, photoA: false } compte A (HTTP) : 404
✅ PREUVE
```
