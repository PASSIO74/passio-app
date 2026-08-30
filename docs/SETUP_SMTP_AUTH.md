# Confirmation d'e-mail + SMTP — **configuré le 2026-08-30**

> Ce document décrivait une procédure à faire. Elle a été faite : le SMTP Brevo est
> branché sur Supabase et « Confirm email » est actif en production. Il est conservé
> comme **état de la configuration** et procédure de rétablissement — plus comme une
> liste de choses à faire. Une seule chose reste ouverte : l'authentification DNS du
> domaine d'envoi (§4).

## 1. Ce qui est en place

| Réglage | Valeur |
|---|---|
| Fournisseur SMTP | **Brevo** (offre gratuite, 300 e-mails/jour) |
| Hôte / port | relais SMTP Brevo · **587**, STARTTLS |
| Expéditeur | nom « **PASSIO** » |
| Clé SMTP | dédiée à ce projet, **expire le 30 août 2027** |
| Supabase → Authentication → SMTP | **activé** |
| Supabase → Providers → Email → *Confirm email* | **ON** (vérifié après rechargement) |
| URL de production, redirections, modèle `ConfirmationURL` | valides |

Vérifications faites à la configuration : connexion TLS et authentification SMTP
testées avec succès, **sans envoyer d'e-mail ni créer d'utilisateur**.

> ⚠️ **Aucun identifiant ne figure dans ce dépôt et ne doit y figurer.** Ils vivent
> dans la configuration Supabase. La clé `service_role` vit dans `dashboard/.env`
> (gitignoré) et dans les secrets du dépôt.

## 2. Ce que l'activation a changé dans le code

Activer le réglage ne suffisait pas : `signUp` ne rend **plus** de session tant que
l'adresse n'est pas confirmée, ce qui rendait atteignables des chemins jusque-là
morts. Trois corrections, toutes verrouillées par `tests/e2e/confirmation-email.spec.js` :

1. **Les messages de l'écran d'auth étaient effacés.** Les deux branches sans session
   (« compte créé, va confirmer » et « e-mail déjà utilisé ») appelaient
   `_showAuthMsg(...)` **puis** `switchAuthTab("signin")` — or `switchAuthTab` remet
   `#authMsg` à zéro. La personne créait son compte et voyait l'écran basculer sans un
   mot. Ordre inversé.
2. **Il n'existait aucune sortie si le lien n'arrivait pas** (spam, lien expiré) :
   « déjà utilisé » à l'inscription, « confirme ton e-mail » à la connexion, et rien
   d'autre — le compte était perdu. Ajout de `onbResendConfirmation()`
   (`supa.auth.resend`, type `signup`) et du lien `#authResendLink`, affiché
   uniquement quand il sert. Le message de succès n'affirme jamais que le compte
   existe (anti-énumération), et le délai anti-abus de Supabase est traduit.
3. **Les comptes de test ne pouvaient plus être créés.** Voir §3.

## 3. Comptes de test : `tests/e2e/compte-e2e.js`

Cinq points d'appel créaient leurs comptes par `supa.auth.signUp()` et lisaient la
session dans la réponse — dont **`authz-critical`, la barrière RLS du déploiement**
(`.github/workflows/deploy.yml`) et du canari de la sentinelle distante. Ils passent
tous par le helper, qui crée le compte **pré-confirmé** via
`POST /auth/v1/admin/users` (`email_confirm: true`) puis ouvre sa session dans la
page. Deux effets voulus : aucun e-mail n'est envoyé (le quota Brevo n'est pas
consommé par les tests, et aucun rebond vers le domaine fictif `passio-e2e.test` ne
vient abîmer la réputation d'expéditeur), et la clé `service_role` devient nécessaire.

> ### 🔑 Geste manuel restant : le secret du dépôt
> Ajouter **`SUPABASE_SERVICE_ROLE_KEY`** dans *Settings → Secrets and variables →
> Actions* du dépôt (la valeur est celle de `dashboard/.env`). Les workflows le
> passent déjà aux tests. **Tant qu'il est absent, ces suites échouent** avec un
> message qui nomme la cause — c'est délibéré : une barrière de sécurité qui se met
> en veille silencieuse est pire qu'un rouge.

En local, rien à faire : le helper lit `dashboard/.env`.

## 4. Reste ouvert — authentifier le domaine d'envoi (DKIM/DMARC)

Le domaine d'envoi **n'est pas encore authentifié dans Brevo** et **DMARC est absent**.
Conséquence : les confirmations partent, mais peuvent être classées en indésirables —
une inscription perdue, sans la moindre trace côté application. C'est le risque **R11**
de `.passio/context/KNOWN_RISKS.md`.

Le remède demande un accès au gestionnaire DNS du domaine (ajout des enregistrements
Brevo : code de vérification, DKIM, puis DMARC) —
[guide Brevo](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC).
Rien à changer dans le code ni dans Supabase.

## 5. Durcissements Auth restants (gratuits, dashboard Supabase)

Authentication → Policies / Password :
- **Leaked password protection** : ON *(advisor `auth_leaked_password_protection` —
  vérifie les mots de passe contre HaveIBeenPwned).*
- **Minimum password length** : 8+ (idéalement 10). ⚠️ L'app valide aujourd'hui à
  **6** (`onbDoAuth`, `doChangePassword`) : remonter le réglage Supabase **sans**
  aligner ces deux contrôles ferait refuser côté serveur un mot de passe que l'écran
  vient d'accepter.
- **Password requirements** : au moins lettres + chiffres (même remarque).

## 6. Si le SMTP tombe

Symptômes : plus aucune inscription ne se finalise, et « Mot de passe oublié » ne
délivre rien. Vérifier dans l'ordre : quota Brevo du jour (300), validité de la clé
SMTP (expire le **30 août 2027**), état de l'expéditeur, puis Supabase →
Authentication → Emails. Repli d'urgence : désactiver « Confirm email » rétablit les
inscriptions **au prix de R1** (usurpation d'adresse) — à ne faire que sciemment, et
les suites e2e repartent alors d'elles-mêmes sur le chemin `signUp` (le helper le
prévoit).
