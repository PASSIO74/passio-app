# P0 — Confirmation e-mail + durcissement Auth (100 % gratuit)

> Objectif : fermer **R1** (usurpation d'e-mail parce que « Confirm email » est OFF faute de SMTP) et deux réglages Auth signalés par les advisors. **Aucune dépense.** Tout est préparé ci-dessous ; il te reste **une seule action manuelle** (créer un compte SMTP gratuit + copier une clé), que je ne peux pas faire à ta place.

## Pourquoi c'est P0
Aujourd'hui l'inscription se fait par e-mail/mot de passe **sans confirmation** (le mailer Supabase par défaut est bridé à ~2-3/h, donc « Confirm email » a été désactivé). Conséquence : n'importe qui peut s'inscrire avec **l'e-mail d'un autre**. C'est le vrai bloquant avant d'ouvrir à de vrais utilisateurs. La solution = brancher un **SMTP gratuit** (débit suffisant) puis réactiver la confirmation.

---

## Étape 1 — Créer un expéditeur SMTP gratuit (ton unique geste manuel)

Deux options gratuites, largement suffisantes pour une beta :

| Fournisseur | Gratuit | Notes |
|---|---|---|
| **Brevo** (ex-Sendinblue) | **300 e-mails/jour** | Le plus généreux en volume/jour. SMTP direct. |
| **Resend** | 100/jour, 3 000/mois | Très simple, bon si petit volume. |

**Recommandé : Brevo** (marge confortable pour les pics d'inscription).

1. Crée un compte sur le fournisseur (gratuit).
2. Récupère les identifiants **SMTP** : `host`, `port` (587), `login`, `master password / API key`.
3. (Brevo) valide un **expéditeur** (une adresse que tu possèdes, ex. `contact@ladamemetallerie.com`) — un simple clic de confirmation dans ta boîte.

> C'est la seule étape que je ne peux pas exécuter (création de compte + secret). ~2 minutes.

---

## Étape 2 — Configurer le SMTP dans Supabase (Dashboard → Authentication → Emails → SMTP Settings)

Renseigne :
- **Enable Custom SMTP** : ON
- **Sender email** : `contact@ladamemetallerie.com` (ou l'expéditeur validé)
- **Sender name** : `PASSIO`
- **Host** : celui du fournisseur (Brevo : `smtp-relay.brevo.com`)
- **Port** : `587`
- **Username** : ton login SMTP
- **Password** : la clé SMTP
- **Minimum interval** : laisser par défaut

> ⚠️ Ne jamais committer ces identifiants. Ils vivent dans la config Supabase, pas dans le repo.

## Étape 3 — Réactiver la confirmation d'e-mail

Dashboard → Authentication → Providers → **Email** :
- **Confirm email** : ON

Puis vérifier les **templates** (Authentication → Emails) : le mail « Confirm signup » doit avoir un sujet FR clair et un lien vers l'app.

## Étape 4 — Durcissements Auth gratuits (advisors)

Dashboard → Authentication → **Policies / Password** :
- **Leaked password protection** : ON *(advisor `auth_leaked_password_protection` — vérifie les mots de passe contre HaveIBeenPwned, gratuit).*
- **Minimum password length** : 8+ (idéalement 10).
- **Password requirements** : au moins lettres + chiffres.

---

## Étape 5 — Tester le flux (je peux automatiser une partie)

Le parcours de test d'inscription réel (`tests/e2e/qa-helper.js`) suppose aujourd'hui que `signUp` renvoie une **session immédiate** (confirmation OFF). **Une fois la confirmation activée**, `signUp` ne renvoie plus de session tant que l'e-mail n'est pas confirmé → les tests e2e multi-comptes et la campagne QA devront basculer sur la **création via `admin.createUser({ email_confirm: true })`** (service_role, dispo dans `dashboard/.env`) au lieu du parcours e-mail public.

👉 Dis-moi quand le SMTP est en place : **je bascule l'inscription des tests sur `admin.createUser`** (comptes de test pré-confirmés) pour que toute la suite reste verte, et je vérifie de bout en bout qu'un vrai utilisateur reçoit bien le mail de confirmation.

---

## Récapitulatif de qui fait quoi
- **Toi (2 min, gratuit)** : créer le compte SMTP, valider l'expéditeur, coller les identifiants dans Supabase, activer « Confirm email » + « Leaked password protection ».
- **Moi (déjà prêt / à ta demande)** : cette doc, l'adaptation des tests à `admin.createUser`, la vérification du flux, la mise à jour de `.passio/KNOWN_RISKS.md` (R1 → mitigé).
