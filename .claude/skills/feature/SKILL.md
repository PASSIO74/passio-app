---
name: feature
description: "Développe une nouvelle fonctionnalité ou un écran de A à Z : archi app-01..09, local + Supabase + realtime + tests."
---

# /feature — Nouvelle fonctionnalité PASSIO

## Où mettre le code (ordre de chargement = dépendances par hoisting, NE PAS réordonner)
- 01=diag/seed · 02=state/utils/goTo/helpers · 03=posts/carnets/CDV · 04=commentaires/conversations · 05=config/profils/reels/appels · 06=profil principal/studio/partage · 07=IA/explore/IRL · 08=modals/boot/client Supabase · 09=PWA/emoji/pièces jointes.
- Markup dans `index.html` (`#screen-<nom>` ou modal). Styles en fin de `styles.css`.
- ⚠️ Fonctions globales (scripts classiques, pas de modules). Un nom déjà pris est écrasé en silence → `npm run audit:globals` AVANT de committer. Ne pas nommer un Set d'état comme une fonction.

## Le pattern complet (à suivre pour tout contenu partagé)
1. **Modèle local** dans `state` + `saveState()` (débouncé). Rendu via une fonction `render*` idempotente (guard `_lastHtml` si ré-appelée souvent).
2. **Persistance Supabase** : fonctions `supa*` dans app-08. Migration si nouvelle table/colonne → skill `/migration` (RLS, FK profiles, realtime, timestamptz, `information_schema` d'abord).
3. **Cross-compte** : lecture via loaders qui fusionnent (pas remplacent) le seed ; recherche de post via `findPostAnywhere`. Embed `profiles(...)` seulement si FK réelle.
4. **Realtime** : brancher sur le canal unique `realtime:db` (pas un nouveau canal).
5. **Notifications** : `supaInsertNotif(toUserId, kind, refId, content)` + emoji dans `_notifEmoji` + routage dans `openNotifTarget`.
6. **Sécurité** : `escapeHtml`/`escapeJsArg`/`safeUrlAttr` sur tout contenu utilisateur (skill `/xss-audit`). Médias → Storage, jamais base64 en DB. Modération : `isBlocked(id)`.
7. **Timestamps** : `supaTs`. **onclick** : fonctions existantes (`audit:handlers`).

## Boucler
- Lire la fiche voisine dans `docs/PIEGES_CONNUS.md` (le domaine a sûrement des invariants).
- Test e2e (skill `/new-test`), vérif navigateur (skill `/preview`), et cross-compte si pertinent (`/e2e-multi`).
- Livrer via `/ship`. Documenter le nouvel invariant dans `docs/PIEGES_CONNUS.md` s'il y en a un.
