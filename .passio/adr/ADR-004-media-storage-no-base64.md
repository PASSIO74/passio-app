# ADR-004 — Médias en Storage, jamais base64 en DB

- **Statut** : Accepté
- **Date** : (rétroactif)
- **Contexte** : Stocker des médias (images, vocaux, vidéos) en base64 dans Postgres gonfle les lignes, sature les quotas, ralentit les requêtes et coûte cher. Historiquement, des vocaux base64 ont été écrits en DB (dette).
- **Décision** : Tout média va dans **Supabase Storage** (buckets), jamais en base64 dans une colonne DB. Les conversations volumineuses (vocaux inclus) vivent en **IndexedDB** côté client (`js/idb-store.js`) + Supabase. Downscale des images à l'upload.
- **Conséquences** :
  - (+) DB légère, coûts maîtrisés, uploads robustes.
  - (−) Dette legacy à résorber (base64 → Storage, cf. `TECH_DEBT.md`, P1).
  - (−) Médias **privés** exposés si buckets publics → **URLs signées à mettre en place** (P0, `SECURITY_MODEL.md`).
  - Interdit désormais : écrire du base64 média en DB.
- **Alternatives écartées** : base64 en DB (simplicité apparente, coût réel prohibitif) ; CDN externe (pas nécessaire au stade actuel — trigger de scale).
- **Trigger de réexamen** : volume média > coût Storage acceptable → CDN/transcodage via ADR.
