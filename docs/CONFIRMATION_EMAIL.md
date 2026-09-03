# CONFIRMATION_EMAIL

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

## 📧 Confirmation d'e-mail ACTIVE depuis le 2026-08-30 (SMTP Brevo)

`signUp` ne rend **plus** de session : le compte existe, il est inutilisable tant que
l'adresse n'est pas confirmée. État complet de la configuration, procédure de
rétablissement et geste DNS restant : `docs/SETUP_SMTP_AUTH.md`.

⚠️ **Quatre conséquences, toutes déjà traitées — les connaître avant de toucher à l'auth.**

① **Deux chemins de `onbDoAuth` étaient morts, et muets.** Les branches « compte créé,
   va confirmer » et « e-mail déjà utilisé » (anti-énumération : Supabase rend un user
   aux `identities` VIDES, pas une erreur) écrivaient le message **puis** appelaient
   `switchAuthTab("signin")`, qui remet `#authMsg` à zéro. On créait son compte, l'écran
   basculait, rien ne s'affichait. **Règle : `switchAuthTab` d'abord, message ensuite** —
   et tout ce qu'on veut voir survivre à une bascule se pose APRÈS elle.

② **Sans renvoi, un lien perdu enferme le compte** (« déjà utilisé » à l'inscription,
   « confirme ton e-mail » à la connexion, aucune sortie). `onbResendConfirmation()`
   (`supa.auth.resend`, type `signup`) + `#authResendLink`, affiché seulement quand il
   sert. Le message de succès n'affirme JAMAIS que le compte existe.

③ **Les comptes de test ne se créent plus par `signUp`.** Passer par
   `tests/e2e/compte-e2e.js` : création **pré-confirmée** via `service_role`
   (`email_confirm: true`), aucun e-mail envoyé — donc ni quota Brevo consommé (300/j),
   ni rebond vers le domaine fictif `passio-e2e.test` qui abîmerait la réputation
   d'expéditeur. ⚠️ `authz-critical` est la **barrière RLS du déploiement** : elle en
   dépend, et sans le secret `SUPABASE_SERVICE_ROLE_KEY` elle échoue **en nommant la
   cause** plutôt que de se mettre en veille (un skip silencieux sur une barrière de
   sécurité serait pire qu'un rouge).

④ **Le domaine d'envoi n'est pas authentifié** (ni DKIM ni DMARC) : les confirmations
   peuvent partir en indésirables — inscription perdue, **sans aucune trace côté app**.
   Risque R11, remède DNS uniquement.

Verrou : `tests/e2e/confirmation-email.spec.js` (7, éprouvés par mutation — remettre
l'ordre d'origine ou retirer le renvoi fait rougir 6 des 7).
