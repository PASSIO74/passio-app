# Registre des risques connus

> Cotation : Prob (probabilité) × Impact × Détectabilité (D=facile à détecter, difficile=passe inaperçu). Mitigation existante notée.

| # | Risque | Catégorie | Prob | Impact | Détect. | Mitigation |
|---|---|---|---|---|---|---|
| R1 | ~~Réactivation « confirm email » sans SMTP~~ → **traité** le 2026-08-30 (SMTP Brevo + confirmation ON) | Produit/Conf. | — | — | — | Voir « Remédiations appliquées ». Reste ouvert : domaine d'envoi non authentifié (DKIM/DMARC) → **R11**. |
| R11 | Domaine d'envoi non authentifié (ni DKIM ni DMARC) → confirmations classées en spam, inscriptions perdues sans trace | Produit/Deliverab. | Élevée | Élevé | **Difficile** (rien ne remonte côté app) | Ajouter les enregistrements DNS Brevo (accès registrar requis). |
| R2 | Médias privés en bucket public (pas d'URL signée) | Confidentialité | Moyenne | Élevé | Difficile | URLs signées (P0). |
| R3 | Schéma prod diverge des migrations repo → 400 / RLS silencieuse | DB | Élevée | Moyen | Moyen | `migration-checker` en gate. |
| R4 | Collision de globals sur nouveau code | Archi | Moyenne | Moyen | Facile | `audit-globals` (CI). |
| R5 | XSS stocké via payload tiers non échappé | Sécurité | Faible | Élevé | Moyen | 3 helpers + `xss-audit`. |
| R6 | Catch large masquant une ReferenceError | Fiabilité | Moyenne | Moyen | Difficile | Revue `audit-passio`, interdiction. |
| R7 | Tout push `main` = déploiement prod | Ops | Moyenne | Élevé | Facile | Discipline commit, hook `stage-edited-file.js`, CI tests avant deploy. |
| R8 | base64 legacy en DB (vocaux) → coût/limites | DB/Perf | Faible | Moyen | Moyen | Migration Storage (P1). |
| R9 | Fuite de données cross-profil | Confidentialité | Faible | Élevé | Difficile | `MULTI_PROFILE.md`, tests cross-profil. |
| R10 | Deux sessions Claude parallèles mélangent des commits | Ops | Faible | Moyen | Facile | Committer au fil de l'eau, hook add ciblé. |

## Remédiations appliquées

- **2026-08-09 — 🔴 FUITE CRITIQUE de messages privés corrigée (prod).** `migrations/migration_rls_private_dms_stories.sql` : `conv_messages` / `conv_members` / `conversations` avaient une policy SELECT `USING true` → **tout compte authentifié pouvait lire TOUS les DM de tout le monde** (texte + URLs de vocaux) via une requête brute. Corrigé : lecture réservée aux membres (helper `is_conv_member` SECURITY DEFINER anti-récursion). Idem `stories` (fuite des stories de comptes privés) → alignées sur la policy « comptes privés » des posts. Non-régression prouvée : `confidentialite.spec.js` (tiers bloqué + membre OK) + `multi-comptes` messagerie/vocal vert. **Reste `follows`/`event_attendees` en lecture publique = choix assumé (graphe social / RSVP publics, façon IG).** `notifications` déjà scellé (`user_id=auth.uid()`).


- **2026-08-09 — Durcissement advisors (prod).** `migrations/migration_security_hardening.sql` : 3 vues SECURITY DEFINER (`telemetry_last24h`, `client_errors_top_24h`, `client_errors_par_heure`) passées en `security_invoker` (erreurs advisor corrigées) ; EXECUTE révoqué à `PUBLIC/anon/authenticated` sur les fonctions trigger/maintenance (`purge_telemetry`, `rate_limit_insert`, `broadcast_conv_message_to_users`, `posts_freeze_author`) — **`purge_telemetry` n'était appelable par n'importe qui** ; `search_path` épinglé. Non-régression : `multi-comptes` (messagerie + notifications) vert. Restent, **volontairement**, les WARN sur `post_is_visible`/`can_edit_post`/`comment_target_visible` (helpers de policies RLS → `authenticated` doit garder EXECUTE) et `auth_leaked_password_protection` (toggle Auth gratuit → `docs/SETUP_SMTP_AUTH.md`).

- **2026-08-30 — R1 fermé : confirmation d'e-mail réellement active (prod).** SMTP Brevo branché sur Supabase (587/STARTTLS, expéditeur « PASSIO »), « Confirm email » ON. Un compte ne peut donc plus être créé avec l'adresse de quelqu'un d'autre. Trois conséquences ont été traitées dans le code, parce qu'activer le réglage ne suffisait pas :
  ① `signUp` ne rend plus de session → les deux branches de `onbDoAuth` qui gèrent ce cas étaient **muettes** (`_showAuthMsg` puis `switchAuthTab`, qui vide `#authMsg`) : compte créé, écran basculé, aucune explication. Ordre inversé, vérifié par mutation ;
  ② aucune sortie si le lien n'arrive pas → ajout du renvoi (`supa.auth.resend`, lien `#authResendLink`, message anti-énumération) ;
  ③ les suites e2e qui écrivent en base créaient leurs comptes par `signUp` et attendaient une session — dont `authz-critical`, **barrière RLS du déploiement**. Elles passent par `tests/e2e/compte-e2e.js` (création pré-confirmée via `service_role`, aucun e-mail envoyé, quota Brevo intact). ⚠️ Demande le secret `SUPABASE_SERVICE_ROLE_KEY` dans le dépôt, sans quoi ces suites échouent **en nommant la cause** (choix délibéré : une barrière de sécurité ne doit pas se mettre en veille silencieuse). Non-régression : `tests/e2e/confirmation-email.spec.js` (7).

Revoir à chaque `/passio-audit` et `/passio-launch-review`.
