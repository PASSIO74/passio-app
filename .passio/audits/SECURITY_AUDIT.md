# Audit de sécurité — PASSIO

> Daté du **2026-08-08**. Orienté OWASP + spécificités PASSIO. Statut par contrôle : ✅ en place · ⚠️ vigilance · ❌ à faire · ❔ non vérifié en prod.
> Modèle de menace : [`../context/SECURITY_MODEL.md`](../context/SECURITY_MODEL.md). Risques cotés : [`../context/KNOWN_RISKS.md`](../context/KNOWN_RISKS.md).

## Synthèse

PASSIO adopte un modèle de sécurité **cohérent et défendable pour son échelle** : front public/hostile, **RLS Postgres par propriétaire comme unique frontière** (ADR-003), échappement systématique du contenu tiers. Les faiblesses ne sont pas structurelles mais **opérationnelles** : deux P0 de confidentialité ouverts (SMTP, URLs signées) et une couverture de tests de sécurité à formaliser.

## Contrôles

| # | Contrôle | Statut | Preuve / Note |
|---|---|---|---|
| S1 | Autorisation lecture/écriture (RLS par propriétaire) | ✅ | RLS v2 en prod ; à auditer **par table** (`rls-audit`). UPDATE/DELETE 0-ligne = RLS manquante (invariant). |
| S2 | XSS stocké (contenu tiers) | ✅ | 3 helpers contextuels (`escapeHtml`/`escapeJsArg`/`safeUrlAttr`). XSS stockés corrigés 2026-07-02. Invariant maintenu par `xss-audit`. |
| S3 | Injection SQL | ✅ | Accès via SDK Supabase paramétré ; pas de SQL concaténé côté client. |
| S4 | Secrets / env | ✅ | Clé anon publique par conception ; **service_role côté serveur dashboard uniquement**, jamais au navigateur. Pas de secret commité. |
| S5 | Sessions / tokens | ✅ | Auth Supabase ; dashboard : sessions HMAC httpOnly, limitation des tentatives. |
| S6 | Ownership objet & frontières multi-profil | ⚠️ | Dépend de la granularité RLS par table (par compte vs par profil) — **à vérifier table par table** avant feature multi-profil sensible. |
| S7 | Permissions API (dashboard) | ✅ | Matrice de rôles (admin/developer/tester/observer), caps par route (`requireCap`). |
| S8 | Uploads / validation fichiers | ⚠️ | Downscale images à l'upload ; hygiène base64→Storage **en cours** (dette). |
| S9 | Rate limiting / anti-flood | ✅ | Anti-flood serveur en place. |
| S10 | Confidentialité médias privés | ❌ **P0** | Buckets publics → **URLs signées à mettre en place** (R2). |
| S11 | Confirmation e-mail / anti-usurpation | ❌ **P0** | SMTP non configuré ; réactiver « confirm email » sans SMTP = mailer 2/h bloquant (R1). |
| S12 | RGPD / suppression de compte | ✅/⚠️ | `migration_rgpd_delete_policies.sql` + Edge Function delete-account ; **parcours à tester bout-en-bout** (R9). |
| S13 | Modération (signalements/blocages) | ✅ | `reports`, `blocks`, skill `moderation`. |
| S14 | Blocage / accès cross-profil | ⚠️ | Couverture de test partielle (parcours sensibles). |
| S15 | Code d'accès beta en clair (`2125`) | ⚠️ accepté | Filtre beta, pas sécurité (R10, assumé). |
| S16 | Dépendances | ❔ | Pas d'audit de dépendances automatisé recensé ici → candidat (`npm audit` / Dependabot). |
| S17 | Vie privée télémétrie | ✅ | PII-safe (liste blanche `meta`, redaction) ; opt-out ; à mentionner en politique de confidentialité. |
| S18 | Sécurité du dashboard (mutations) | ✅ | Mutations code désactivées en prod ; patchs sur branche dédiée après confirmation ; audit complet. |

## Actions prioritaires
1. **[P0]** Configurer un SMTP puis réactiver la confirmation e-mail (S11 / R1).
2. **[P0]** Passer les médias privés en URLs signées (S10 / R2).
3. **[P1]** Formaliser des specs Playwright multi-comptes pour les parcours sensibles (S12, S14 / R9).
4. **[P1]** Auditer la RLS **par table** pour les frontières multi-profil (S6).
5. **[P2]** Automatiser l'audit de dépendances (S16).

## Périmètre non couvert par cet audit
Pentest externe, revue cryptographique approfondie, audit d'infrastructure Netlify/Supabase (relèvent des fournisseurs). Charge/DoS → `docs/SCALE_RUNBOOK.md`.
