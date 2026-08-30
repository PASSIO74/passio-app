# Modèle de sécurité & confidentialité PASSIO

## Modèle de menace (essentiel)
- **Front hostile** : `index.html` + `app-*.js` + clé anon Supabase + code d'accès `2125` sont **publics**. Aucun secret ni contrôle de sûreté ne peut vivre côté client.
- **Seule frontière de sûreté = RLS Postgres** (`auth.uid()::text`). Tout le reste (JS gate, UI) est du confort, pas de la sécurité.

## Surfaces & contrôles
| Surface | Contrôle | Statut |
|---|---|---|
| Autorisation lecture/écriture | RLS par propriétaire | En place (RLS v2) ; auditer par table (`rls-audit`). |
| XSS stocké | 3 helpers d'échappement, systématiques sur payloads tiers | Corrigé 2026-07-02 ; garder l'invariant (`xss-audit`). |
| Flood/abus | Anti-flood serveur | En place. |
| RGPD | `migration_rgpd_delete_policies.sql`, Edge Function delete-account | En place ; tester le parcours suppression. |
| Médias privés | URLs signées | **À faire (P0)** — cf. roadmap. |
| Confirmation e-mail / usurpation | SMTP Brevo + « Confirm email » ON | **En place depuis le 2026-08-30** (`docs/SETUP_SMTP_AUTH.md`). Reste : authentifier le domaine d'envoi (DKIM/DMARC, R11) — une confirmation en indésirables est une inscription perdue sans trace. |
| Modération | `reports`, `blocks`, skill `moderation` | En place. |

## Vie privée (privacy by design)
Télémétrie **PII-safe** (`js/telemetry.js` : liste blanche `meta`, redaction e-mail/JWT/hex, jamais de contenu ni base64) — tout nouveau champ passe par ce filtre. Minimisation, opt-out (`?telemetry=0`). Jamais de PII en URL/query.

## Multi-profil
Fuite cross-profil = risque de confidentialité de premier ordre → `context/MULTI_PROFILE.md`.

## Checklist audit (OWASP-orienté, cf. `.passio/audits/SECURITY_AUDIT.md`)
auth · autorisation · sessions/tokens · secrets/env · ownership objet · frontières multi-profil · permissions API · uploads/validation fichiers · rate limits · CORS · XSS/injection · dépendances · énumération d'utilisateurs · blocage · suppression de compte · accès admin.

Lié : [[PASSIO_SYSTEM_MODEL]], `DATABASE_MODEL.md`, `MULTI_PROFILE.md`.
