---
name: storage
description: "Audit Supabase Storage : médias, downscale, orphelins, URLs signées. Dire : la vidéo uploadée ne s'affiche pas, upload."
---

# /storage — Audit Supabase Storage PASSIO

## Règles d'or
- **JAMAIS de base64 en DB** : tout média passe par `supaUploadMedia(...)` (bucket `content`) → seule l'URL Storage est stockée. Vaut pour posts, bobines, stories, covers d'événements, photos d'étape CDV, vocaux.
- **Downscale avant upload** : `_downscaleImageForUpload` (images max 1600px, JPEG 0.85), vidéos compressées (>8 Mo bobines), mp4/H.264 prioritaire (lisible iOS).
- **Data URL** : découper sur `;base64,`, JAMAIS sur la 1re virgule (un mime à 2 codecs `video/mp4;codecs=avc1,mp4a` cassait le parse → media_url NULL).

## Pannes médias typiques (cf. docs/PIEGES_CONNUS.md « Bobines »)
- **Vidéo publiée mais invisible** = ligne `posts` avec `media_url NULL` ou vidéo orpheline sur Storage sans ligne. Garde `hadMedia` : un post média sans URL Storage n'est JAMAIS inséré. Timeout d'upload proportionnel à la taille.
- **Cadre noir figé** : `muted` doit être une PROPRIÉTÉ (pas l'attribut innerHTML) ; preview construit en DOM.
- **Son perdu** : audio routé via WebAudio à la compression ; capture micro **mono** (le stéréo casse l'anti-écho).

## Requêtes de diagnostic
- Posts médias sans URL (orphelins DB) :
  ```
  supabase db query --linked "SELECT id, media_type, created_at FROM posts WHERE media_type IS NOT NULL AND (media_url IS NULL OR media_url='') ORDER BY created_at DESC LIMIT 20"
  ```
- Lister via CLI Storage / API si besoin de repérer les fichiers orphelins (Storage sans ligne).

## Roadmap sécurité (P0 connu)
Les médias sont des **URLs publiques** → le durcissement confidentialité (contenu de comptes privés) passe par des **URLs signées** (refacto plus lourde, notée dans la roadmap). Un compte privé protège la DB via RLS mais pas l'URL Storage devinée.

## Rapport
Orphelins DB/Storage, uploads en échec récents (`client_errors`), et état de la robustesse (timeouts, garde hadMedia). Réparer les données prod avec prudence (UPDATE ciblé, lecture d'abord).
