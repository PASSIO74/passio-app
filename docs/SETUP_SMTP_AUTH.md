# E-mails d'authentification — SMTP Brevo, domaine `passio-app.fr`, gabarits français

**État au 2026-09-11.** PASSIO a désormais sa propre identité, distincte de toute autre
activité de l'éditeur : adresse de contact `passioadmin@gmail.com`, domaine d'envoi
`passio-app.fr`, comptes OVH et Brevo dédiés. Ce document est la référence de ce
montage ; il remplace la version historique qui décrivait le premier branchement SMTP
(2026-08-30).

> ⚠️ **Aucun secret dans ce fichier, ni dans le dépôt.** Les identifiants SMTP vivent dans
> la configuration Supabase (Authentication → Emails → SMTP Settings), et nulle part ailleurs.

---

## 1. Les trois pièces, et qui tient quoi

| Pièce | Où | Valeur |
|---|---|---|
| Adresse de contact publiée (mentions légales, CGU, politique, « À propos », feedback, suppression de compte) | `PASSIO_EDITEUR.email` (app-02), **source unique** | `passioadmin@gmail.com` |
| Domaine d'envoi | OVH, compte PASSIO (commande n° 258820573, 3 ans, DNSSEC, 1 boîte Zimbra Starter incluse) | `passio-app.fr` |
| Relais SMTP | Brevo, compte PASSIO (`passioadmin@gmail.com`), offre gratuite 300 e-mails/jour | `smtp-relay.brevo.com:587` |
| Expéditeur des e-mails d'authentification | Supabase → Authentication → Emails → SMTP | `contact@passio-app.fr` — nom « PASSIO » |
| Contact des notifications push (`VAPID_SUBJECT`) | secret Supabase de la fonction `notify-call` | `mailto:passioadmin@gmail.com` |

⚠️ **La modale « Supprimer mon compte » lisait l'adresse EN DUR** à côté de la source
unique : le jour du changement d'adresse elle serait restée sur l'ancienne. Elle lit
désormais `PASSIO_EDITEUR.email` ; verrou `tests/e2e/cgu-consentement.spec.js` ⑯, et un
`not.toContain` de l'ancien domaine sur les CGU.

---

## 2. Authentifier le domaine chez Brevo (DKIM + DMARC)

**Pourquoi c'est le geste qui décide de tout.** Sans DKIM aligné sur le domaine
d'expédition, les e-mails de confirmation partent en indésirables — et un compte non
confirmé est inutilisable. Personne ne se plaint : la personne abandonne.

Brevo → Senders, Domains & Dedicated IPs → **Domains** → `passio-app.fr` → configuration
**manuelle**. Quatre enregistrements, à poser dans **OVH → Noms de domaine →
`passio-app.fr` → Zone DNS → « Ajouter une entrée »**, TTL par défaut :

| # | Type | Sous-domaine | Valeur / cible |
|---|---|---|---|
| 1 | TXT | *(vide)* | `brevo-code:d6cd3a738248091f3341c59815171780` |
| 2 | CNAME | `brevo1._domainkey` | `b1.passio-app-fr.dkim.brevo.com.` |
| 3 | CNAME | `brevo2._domainkey` | `b2.passio-app-fr.dkim.brevo.com.` |
| 4 | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` |

- Le **point final** des deux CNAME n'est pas décoratif : sans lui, OVH complète la cible
  par `.passio-app.fr` et le DKIM ne résout jamais.
- `p=none` **observe sans rien rejeter**. Ne pas durcir (`quarantine`, `reject`) avant
  d'avoir lu au moins une semaine de rapports.
- Le SPF posé par OVH (`v=spf1 include:mx.ovh.com -all`) n'a pas besoin de Brevo : Brevo
  signe avec son propre domaine d'enveloppe, l'alignement se fait par DKIM.

Puis Brevo → **Vérifier les enregistrements** → **Authentifier le domaine**. Propagation
annoncée « jusqu'à 48 h », mesurée en général en quelques minutes chez OVH (TTL 0 sur la
zone neuve).

**Contrôle en ligne de commande** :

```
nslookup -type=TXT passio-app.fr 8.8.8.8
nslookup -type=CNAME brevo1._domainkey.passio-app.fr 8.8.8.8
nslookup -type=TXT _dmarc.passio-app.fr 8.8.8.8
```

---

## 3. Brancher Supabase sur le nouveau Brevo

⚠️ **Les trois champs changent ENSEMBLE**, jamais un par un : l'ancien relais refuserait
un expéditeur qu'il n'a pas validé, et le nouveau refuserait l'ancien mot de passe. Une
fenêtre où seul l'un des trois a changé = plus aucun e-mail d'inscription.

1. Brevo (compte PASSIO) → SMTP & API → **SMTP** → générer une clé SMTP. Le **login**
   est de la forme `xxxxxxx@smtp-brevo.com`, la **clé** n'est affichée qu'une fois.
2. Supabase → Authentication → Emails → SMTP Settings :
   - Sender email : `contact@passio-app.fr`
   - Sender name : `PASSIO`
   - Host : `smtp-relay.brevo.com` — Port : `587`
   - Username : le login Brevo ci-dessus — Password : la clé SMTP
   - Save.
3. **Preuve** : s'inscrire avec une adresse Gmail neuve, ouvrir « Afficher l'original »
   sur l'e-mail reçu : `dkim=pass header.d=passio-app.fr` doit apparaître, et le message
   doit arriver dans la boîte de réception, pas dans Indésirables.

Une fois le domaine authentifié, Brevo accepte **n'importe quel expéditeur** sur
`passio-app.fr` sans validation individuelle : `contact@passio-app.fr` n'a pas besoin
d'exister comme boîte pour ENVOYER. Pour RECEVOIR une réponse, il faut soit la boîte
Zimbra Starter incluse dans la commande OVH (Web Cloud → Zimbra → créer
`contact@passio-app.fr`, puis une redirection vers `passioadmin@gmail.com`), soit
accepter que les réponses rebondissent — les gabarits donnent de toute façon
`passioadmin@gmail.com` en pied.

---

## 4. Les gabarits sont en français (posés le 2026-09-11 par la Management API)

Les 13 sujets et 13 corps (`mailer_subjects_*`, `mailer_templates_*_content`) étaient les
gabarits **anglais** par défaut de Supabase — « Confirm your email address » pour un
public français, c'est un signal de spam à lui seul. Ils sont désormais en français, aux
couleurs PASSIO (`#6D32F4`), bouton + lien de secours en clair, et un pied
« Pour toute question : passioadmin@gmail.com ».

Les variables Supabase sont inchangées : `{{ .ConfirmationURL }}`, `{{ .Token }}`,
`{{ .Email }}`, `{{ .NewEmail }}`, `{{ .OldEmail }}`, `{{ .Provider }}`,
`{{ .FactorType }}`. Pour les relire ou les modifier sans le tableau de bord :

```
GET  https://api.supabase.com/v1/projects/<ref>/config/auth      (jeton CLI ~/.supabase/access-token)
PATCH … avec { "mailer_subjects_confirmation": "…", "mailer_templates_confirmation_content": "<h2>…" }
```

---

## 5. Autres réglages Auth en place (2026-09-11)

| Réglage | Valeur | Pourquoi |
|---|---|---|
| `rate_limit_email_sent` | 150 / heure (était 30) | le seau est partagé inscription + renvoi + mot de passe oublié ; à 30, ~21 inscriptions/heure avant le mur |
| `password_hibp_enabled` | true | refuse les mots de passe présents dans des fuites connues (HaveIBeenPwned) |
| `mailer_autoconfirm` | false | la confirmation d'e-mail reste obligatoire |
| `password_min_length` | 6 | inchangé — à remonter à 8 quand l'écran d'inscription le dira |

---

## 6. Ce qui reste rattaché à l'ancienne identité

- L'e-mail des **comptes** Netlify, Supabase et GitHub : à changer dans chaque service
  (Netlify → User settings ; Supabase → Account ; GitHub → Settings → Emails). Chaque
  changement demande un clic sur un lien de confirmation.
- L'**historique git** : les commits passés gardent leur auteur. On ne réécrit pas un
  historique public — ce serait casser toutes les PR, les liens et les clones.
- Rien dans le code, les tests, les documents et les preuves versionnées : vérifié par
  `grep -rI ladamemetallerie` sur le dépôt (hors `.git`, `node_modules`, `dist`).

---

## 7. Ce que l'activation de « Confirm email » a changé dans le code (2026-08-30, inchangé)

`signUp` ne rend **plus** de session tant que l'adresse n'est pas confirmée, ce qui
rendait atteignables des chemins jusque-là morts. Trois corrections, toutes verrouillées
par `tests/e2e/confirmation-email.spec.js` :

1. **Les messages de l'écran d'auth étaient effacés.** Les deux branches sans session
   (« compte créé, va confirmer » et « e-mail déjà utilisé ») appelaient
   `_showAuthMsg(...)` **puis** `switchAuthTab("signin")` — or `switchAuthTab` remet
   `#authMsg` à zéro. Ordre inversé : la bascule d'abord, le message ensuite.
2. **Il n'existait aucune sortie si le lien n'arrivait pas** (spam, lien expiré).
   `onbResendConfirmation()` (`supa.auth.resend`, type `signup`) + `#authResendLink`,
   affiché uniquement quand il sert. Le message de succès n'affirme jamais que le compte
   existe (anti-énumération).
3. **Les comptes de test ne se créent plus par `signUp`.** Voir §8.

## 8. Comptes de test : `tests/e2e/compte-e2e.js`

Cinq points d'appel créaient leurs comptes par `supa.auth.signUp()` — dont
**`authz-critical`, la barrière RLS du déploiement**. Ils passent tous par le helper, qui
crée le compte **pré-confirmé** via `POST /auth/v1/admin/users` (`email_confirm: true`)
puis ouvre sa session dans la page. Deux effets voulus : aucun e-mail n'est envoyé (le
quota Brevo n'est pas consommé par les tests, et aucun rebond vers le domaine fictif
`passio-e2e.test` ne vient abîmer la réputation d'expéditeur), et la clé `service_role`
devient nécessaire — secret `SUPABASE_SERVICE_ROLE_KEY` du dépôt, posé. En local, le
helper lit `dashboard/.env`.

## 9. Si le SMTP tombe

Symptômes : plus aucune inscription ne se finalise, et « Mot de passe oublié » ne délivre
rien. Vérifier dans l'ordre : quota Brevo du jour (300), validité de la clé SMTP, état du
domaine `passio-app.fr` dans Brevo (authentifié ?), puis Supabase → Authentication →
Emails. Repli d'urgence : désactiver « Confirm email » rétablit les inscriptions **au
prix de R1** (usurpation d'adresse) — à ne faire que sciemment ; les suites e2e
repartent alors d'elles-mêmes sur le chemin `signUp` (le helper le prévoit).
