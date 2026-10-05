# Journal technique — par domaine

Depuis le 2026-10-05, les fiches de lot (récit, mesures, enquêtes, pièges, verrous) vivent ici,
et `CLAUDE.md` ne garde que les règles qui valent partout. Raison, mesurée : `CLAUDE.md` est
rechargé dans CHAQUE session de Claude Code ; ramené à 18 Ko le 2026-08-07, il avait regrossi
jusqu'à 410 000 caractères en deux mois — une fiche par lot — alors que Claude Code alerte dès
40 000. Les 69 sections ont été déplacées TELLES QUELLES (contrôle de conservation à l'octet).

| Domaine | Fichier | À lire avant de toucher |
|---|---|---|
| Comptes, inscription, légal, majorité, première visite | [`comptes-inscription-legal.md`](comptes-inscription-legal.md) | auth et onboarding (app-02, app-08), `js/first-run.js`, `js/legal-textes.js`, `js/access-gate.js` |
| Sécurité serveur, RLS, migrations, Edge Functions | [`serveur-securite-base.md`](serveur-securite-base.md) | `migrations/`, `supabase/`, `tests/sql/`, droits et colonnes de `events` |
| Social : suivre, messagerie, notifications | [`social-messagerie.md`](social-messagerie.md) | suivi, conversations, notifications, suppression de publication |
| Partage, liens courts, invitation | [`partage-liens-invitation.md`](partage-liens-invitation.md) | `_ouvrirLienPartage`, `netlify/`, `?plk`, invitation |
| Passions, référentiel, fil | [`passions-fil.md`](passions-fil.md) | `js/passions-flat*.js`, `data/passions/`, `setFeedPassions`, `creer_passion` |
| Capacité, performance, temps réel, stockage | [`capacite-perf-realtime.md`](capacite-perf-realtime.md) | filets de polling, canaux temps réel, compression, `scripts/charge*.mjs` |
| Télémétrie, pilotage, Sentinelle, veille | [`telemetrie-pilotage-sentinelle.md`](telemetrie-pilotage-sentinelle.md) | `js/telemetry.js`, `dashboard/`, `pilotage/`, `scripts/veille-production.mjs`, workflows `sentinelle-*` |

Les invariants des lots d'INTERFACE ont leur propre index : [`../lots-ui/INDEX.md`](../lots-ui/INDEX.md).

## Écrire une fiche

1. À la FIN du fichier de son domaine, titre `## <emoji> <TITRE> (AAAA-MM-JJ)`, et une ligne de
   plus au sommaire en tête du fichier.
2. Si une règle de la fiche vaut pour TOUTE modification future, UNE ligne dans la section
   « 🧭 Journal par domaine » de `CLAUDE.md` — jamais la fiche elle-même.
3. Un domaine nouveau = un fichier nouveau ici, une ligne dans ce tableau, et son entrée dans
   `CLAUDE.md` : `scripts/audit-claude-md.js` refuse un fichier du journal que `CLAUDE.md` ne cite pas,
   et un `CLAUDE.md` de plus de 40 000 caractères.
