---
name: xss-audit
description: "Audit XSS stockées et des 3 helpers escapeHtml/escapeJsArg/safeUrlAttr. Dire : sécurité, injection, échappement."
---

# /xss-audit — Audit XSS PASSIO

Tout contenu inséré par un compte authentifié (`comment_interactions`, `event_reactions`, messages média, pseudos, noms de lieux Nominatim/BAN, payloads CDV/IRL) est affiché en `innerHTML` via template literals → **doit être échappé selon le CONTEXTE**.

## Les 3 helpers (app-02) — choisir le bon
- `escapeHtml(x)` — texte dans du HTML.
- `escapeJsArg(x)` — argument de chaîne JS simple-quotée DANS un `onclick` (le HTML décode `&#39;` AVANT le parse JS → un pseudo à apostrophe casse le bouton avec escapeHtml seul).
- `safeUrlAttr(x)` — attribut `src`/`href` d'une URL fournie par un autre utilisateur (bloque `javascript:` + sortie d'attribut ; n'accepte que http(s)/data:image|audio|video/blob).

## Méthode
1. Grep les points d'injection sans échappement — chercher les `innerHTML` et les template literals `${...}` qui insèrent des champs de contenu utilisateur (`.name`, `.text`, `.content`, `.venue`, `.photos`, `.emoji`, `.reactions`, `.bio`…) sans passer par un helper. Ex. : `Grep pattern="\$\{[^}]*\.(name|text|content|venue|title|bio)[^}]*\}" glob="js/*.js"` puis vérifier que chaque hit est enveloppé d'un `escapeHtml`/`escapeJsArg`/`safeUrlAttr`.
2. Vérifier les surfaces à risque documentées : notifications (`_notifListHtml` — pseudo échappé à l'insertion dans `supaInsertNotif`), commentaires/réponses, réactions, boutons de suggestion de lieu (`_evPlacePick` — apostrophe casse le bouton), photos d'étape CDV et covers (contenu d'autres comptes → `safeUrlAttr`).
3. Vérifier qu'aucun `data:` base64 média ne contredit `safeUrlAttr` (les vocaux/vidéos passent par des URLs Storage ou blob).

## Rappels
- Ne jamais injecter de contenu utilisateur brut dans une notif.
- Un nouveau parseur de data URL doit découper sur `;base64,`, jamais sur la 1ʳᵉ virgule (RFC 2397).
- Le durcissement CSP est dans `netlify.toml` + `_headers` (Nominatim retiré, tenor/giphy/tiles autorisés). Ne pas ajouter d'host d'images tiers sans mettre à jour la CSP.

## Rapport
Liste priorisée : fichier:ligne, helper manquant/erroné, payload d'attaque concret, correctif.
