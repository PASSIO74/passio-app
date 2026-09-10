# Ouvrir PASSIO au public — gratuitement

**Mode d'emploi du 2026-09-10.** Décision : diffusion **gratuite** et large pendant
plusieurs mois, sans aucun encaissement.

> Chaque geste dit **où aller**, **quoi faire**, et **comment vérifier que c'est fait**.
> Aucun ne demande d'écrire du code. Compte **environ une heure** devant l'écran,
> plus l'attente DNS.

---

## Ce que la gratuité fait tomber, tout de suite

| Blocage de l'audit | Statut |
|---|---|
| Aucun chemin d'encaissement | **sans objet** — rien à faire |
| Aucune CGV, aucun droit de rétractation | **sans objet** — et surtout ne pas en écrire « au cas où » : un document qui décrit une vente inexistante affaiblit le régime éditeur |
| Régime éditeur « particulier » | **tient** — la LCEN art. 1-1 II vise le **non-professionnel**, pas le petit. Audience large et service gratuit y sont compatibles |
| CGU fondées sur la gratuité | **elles deviennent vraies** (réécrites le 2026-09-10) |
| Consentement aux CGU non enregistré | **reste entier** — corrigé dans le code le 2026-09-10 |

Ce qui ferait basculer le régime : **encaissement, publicité, dons organisés,
sponsoring, revente de données**. Tant que rien de tout cela n'existe, l'anonymat
de l'éditeur est légal — à la condition, **cumulative**, que Netlify détienne
l'identité civile complète.

---

## ⚠️ Avant tout : rien de ce qui a été réparé n'est en ligne

Deux commits attendent sur `claude/app-commercialisation-avis-y1ilpo`. Tant que le
job **« Déploiement production »** n'est pas vert, la friction du code redemandé à
chaque ouverture, le fil fabriqué à 94 % sans étiquette et les signalements qui
mentent sont **toujours ce que voient les utilisateurs**.

---

## GESTE 0 — Sauvegarder, avant d'écrire quoi que ce soit en base

*10 à 20 min (surtout du téléchargement).*

Dans un terminal, **dans le dossier du projet** :

```
npm run sauvegarde -- --complete
```

Les deux tirets après `sauvegarde` sont **obligatoires**. Le fichier `dashboard/.env`
doit contenir `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`, sinon le script s'arrête
en une seconde.

**Preuve que c'est fait** : la dernière ligne dit « Toutes les tables concordent avec
le décompte serveur. » Note le dossier affiché, puis relis l'archive :

```
npm run sauvegarde -- --verifier .passio/sauvegardes/<le dossier noté>
```

⚠️ **Copie ce dossier ailleurs** (clé USB, disque externe, cloud personnel). Une
archive posée sur le même ordinateur que rien ne sauvegarde n'est pas une sauvegarde.
Elle contient des e-mails et des messages privés : garde-la comme un document
confidentiel, et **jamais dans le dépôt** — il est public.

---

## GESTE 1 — Refermer la fuite du graphe social

*5 min.* → [SQL Editor du projet](https://supabase.com/dashboard/project/njkiyoklssvefstljemx/sql/new)

En ce moment, **n'importe qui, sans compte**, peut lire `conv_reads` : qui parle à
qui, et quand. Le contenu des messages est bien protégé — c'est le **graphe social**
qui fuit, souvent l'information la plus sensible d'une messagerie.

1. Ouvre `migrations/migration_fuites_2026-09-10.sql`, sélectionne tout, colle dans
   l'éditeur SQL, **Run**. Attendu : *Success. No rows returned*.
   En cas d'erreur : **ne relance pas**, copie l'erreur et arrête-toi.
2. **Preuve que c'est fait** — nouvelle requête :

```sql
select relrowsecurity as rls_active from pg_class where oid='public.conv_reads'::regclass;
select policyname, qual from pg_policies
  where schemaname='public' and tablename='conv_reads' and cmd='SELECT';
select tgname, tgenabled from pg_trigger
  where tgrelid='public.client_errors'::regclass and not tgisinternal;
```

Attendu : `true` · une ligne `reads_select` dont `qual` contient `is_conv_member`
(et **plus jamais** `true` tout seul) · `trg_client_errors_identite` avec `tgenabled = O`.

---

## GESTE 2 — Effacer les numéros de téléphone déjà collectés

*3 min.* Le champ a été retiré de l'inscription : il était obligatoire et **lu nulle
part**. Reste à effacer ce qui est en base — à **deux** endroits, pas un.

```sql
update auth.users set raw_user_meta_data = raw_user_meta_data - 'phone'
 where jsonb_exists(raw_user_meta_data,'phone');
update public.user_state set data = data #- '{user,general,phone}'
 where jsonb_exists(data->'user'->'general','phone');
```

Attendu : `UPDATE 3` puis `UPDATE 1`. Personne n'est déconnecté.

⚠️ **Le numéro peut revenir tout seul** : un appareil qui garde l'ancien état le
repousse au prochain enregistrement. Relance la deuxième requête dans une semaine.

---

## GESTE 3 — Brancher la purge de la télémétrie

*2 min.* **C'est le mur le plus proche.** Sur l'offre gratuite, Supabase bascule la
base en **lecture seule à 500 Mo** : plus une inscription, plus un message. La base
est à 105 Mo, dont **62 Mo (59 %) pour la seule table `telemetry_events`**. Le
`README` du dashboard annonce une purge à 30 jours : la **fonction** existe, **aucun
cron ne l'appelle** — la plus vieille ligne a 36 jours. Et cette table grossit
proportionnellement au nombre d'utilisateurs.

```sql
select cron.schedule('purge_telemetry_30j', '0 4 * * *', $$select public.purge_telemetry(30)$$);
select public.purge_telemetry(30);
vacuum (analyze) public.telemetry_events;
select pg_size_pretty(pg_total_relation_size('public.telemetry_events'));
```

Sans le `vacuum`, les lignes supprimées ne rendent pas les octets. Attendu : nettement
sous 62 Mo, et `select * from cron.job;` montre la ligne avec `active = true`.

---

## GESTE 4 — Supprimer les deux gros médias qui mangent ton quota

*15 min.* → [Storage du projet](https://supabase.com/dashboard/project/njkiyoklssvefstljemx/storage/buckets/content)

**Ta bande passante est déjà dépassée, avec six utilisateurs.** Mesuré sur 24 h :
1,12 Go d'egress, dont **1,06 Go pour un seul fichier** — un avatar de 2,59 Mo demandé
**399 fois par ta propre suite de tests**. Le plan gratuit donne 10 Go/mois. Extrapolé :
33 Go, soit 6,7× le quota. Le même compte a un avatar récent de 89 Ko : la compression
marche aujourd'hui, ces fichiers sont des résidus d'avant.

1. Dans le seau `content`, dossier `avatars/` du compte `d59aaaa3…` : supprime l'avatar
   de 2,59 Mo et la couverture de 4,34 Mo.
2. Abaisse le plafond serveur : `content` → Settings → **File size limit : 26 Mo**
   (juste au-dessus du repli client de 25 Mo, pour que le refus vienne du client avec
   un message, pas du serveur avec un 413 muet). Idem pour `attachments`.
3. Contrôle mensuel :

```sql
select bucket_id, name, pg_size_pretty((metadata->>'size')::bigint)
  from storage.objects where (metadata->>'size')::bigint > 1048576 order by 3 desc;
```

---

## GESTE 5 — Monter le plafond d'e-mails

*2 min.* → [Rate Limits](https://supabase.com/dashboard/project/njkiyoklssvefstljemx/auth/rate-limits)

**Le chiffre qui compte n'est pas 300/jour, c'est 30/heure.** Supabase impose 30
e-mails d'authentification par heure à tout projet avec un SMTP externe, et ce seau
est **partagé** entre inscription, renvoi de lien et mot de passe oublié — soit
~21 inscriptions abouties par heure.

Passe « Rate limit for sending emails » de **30 à 150** par heure (reste sous les
300/jour de Brevo si tu comptes deux heures de pointe).

*Le refus, lui, s'affichait en anglais dans une interface française : c'est corrigé
dans le code, et il remonte maintenant au centre de pilotage.*

---

## GESTE 6 — Protection des mots de passe compromis

*2 min.* Supabase → **Authentication** → l'écran qui porte « Minimum password length »
→ active **« Prevent use of leaked passwords »** (HaveIBeenPwned) → Save.

⚠️ **Ne touche à rien d'autre** sur cet écran. Preuve : l'avis *Leaked Password
Protection Disabled* disparaît de Advisors → Security le lendemain.

---

## GESTE 7 — Authentifier le domaine d'envoi chez Brevo

*20 à 30 min, puis jusqu'à 48 h de propagation.*
→ [Guide Brevo](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)

**C'est le geste qui décide si l'ouverture fonctionne ou pas.** Sans DKIM/DMARC, les
e-mails de confirmation partent en spam — et un compte non confirmé est inutilisable.
Personne ne te dira qu'il n'a rien reçu : il abandonnera.

1. **D'abord, LIS quel domaine tu utilises**, ne le devine pas : Supabase →
   Authentication → Emails → réglages SMTP, champ « Sender email ». Ou ouvre un
   e-mail PASSIO déjà reçu et regarde la ligne « De : ».
2. Si c'est un domaine que tu ne possèdes pas (gmail.com…), **stop** : on ne peut pas
   authentifier un domaine qu'on ne contrôle pas. Bascule d'abord l'expédition sur un
   domaine à toi.
3. Brevo → menu du compte → **Senders, Domains & Dedicated IPs** → onglet **Domains**
   → ajoute le domaine, lance l'authentification. Brevo affiche trois enregistrements
   DNS : un TXT de vérification, un TXT DKIM, un TXT DMARC.
4. Chez ton hébergeur DNS : crée les trois **exactement** tels qu'affichés
   (copier-coller, jamais à la main). Pour DMARC, commence par `p=none` — il observe
   sans rien faire rejeter.
5. Reviens dans Brevo et clique **Verify**.

**Preuve que c'est fait** : envoie-toi une inscription sur une adresse Gmail neuve et
regarde l'en-tête du message — `dkim=pass` doit apparaître.

---

## LA VÉRIFICATION FINALE — un seul copier-coller

```sql
select 'A. RLS active sur conv_reads (attendu true)' as controle,
       (select relrowsecurity from pg_class where oid='public.conv_reads'::regclass)::text as valeur
union all select 'B. conv_reads encore ouverte a tous (attendu false)',
       (select bool_or(qual='true') from pg_policies
         where schemaname='public' and tablename='conv_reads' and cmd='SELECT')::text
union all select 'C. colonne client_errors.auth_uid (attendu 1)',
       (select count(*) from information_schema.columns
         where table_schema='public' and table_name='client_errors' and column_name='auth_uid')::text
union all select 'D. trigger d identite (attendu 1)',
       (select count(*) from pg_trigger where tgrelid='public.client_errors'::regclass
         and not tgisinternal and tgname='trg_client_errors_identite')::text
union all select 'E. comptes avec un telephone (attendu 0)',
       (select count(*) from auth.users where jsonb_exists(raw_user_meta_data,'phone'))::text
union all select 'F. telephones dans user_state (attendu 0)',
       (select count(*) from public.user_state
         where jsonb_exists(data->'user'->'general','phone'))::text
union all select 'G. purge telemetrie planifiee (attendu 1)',
       (select count(*) from cron.job where jobname='purge_telemetry_30j')::text;
```

**A = true · B = false · C = 1 · D = 1 · E = 0 · F = 0 · G = 1.**

Si **B rend `true`**, la fuite du graphe social est encore ouverte : le geste 1 n'a
pas porté.

---

## Le message d'invitation

> Salut ! Je t'envoie **PASSIO**, l'app sur laquelle je travaille : un réseau où on se
> retrouve par passion, et où on peut se voir en vrai.
>
> 👉 https://passio-app.netlify.app — code d'accès : **2125**
>
> C'est **gratuit**, et c'est encore une jeune version : il y aura des trucs qui
> coincent, c'est justement ce qui m'intéresse. Réservé aux **majeurs**.
>
> ⚠️ À l'inscription tu recevras un e-mail de confirmation — **regarde dans tes spams**,
> il s'y cache souvent pour l'instant. Sans lui, le compte ne s'ouvre pas.
>
> Pour me dire ce qui va et ce qui ne va pas : **Paramètres → Feedback & aide**, ça
> m'arrive directement. Merci 🙏

---

## Les cinq signaux des premiers jours

```sql
-- 1. Des gens arrivent-ils au bout de l'inscription ?
select count(*) as comptes, count(*) filter (where email_confirmed_at is not null) as confirmes
  from auth.users where created_at > now() - interval '7 days';
-- 2. Publient-ils, ou regardent-ils seulement ?
select count(*) from public.posts where created_at > now() - interval '7 days';
-- 3. Se parlent-ils ?
select count(*) from public.conv_messages where created_at > now() - interval '7 days';
-- 4. Quelque chose casse-t-il ?
select message, count(*) from public.client_errors
  where created_at > now() - interval '7 days' group by 1 order by 2 desc;
-- 5. La base grossit-elle vite ?
select pg_size_pretty(pg_database_size(current_database()));
```

Le rapport **confirmés / comptes** est le plus important : s'il tombe sous ~70 %, ce
sont les e-mails qui partent en spam — geste 7.

Et chaque jour, une commande :

```
npm run moderation
```

C'est la file des signalements. Dans une app qui organise des rencontres physiques,
c'est la seule chose qui ne peut pas attendre.

---

## Ce qui reste ouvert, et que tu dois savoir

- **Les canaux d'appel sont publics.** N'importe qui peut voir qui appelle qui, faire
  sonner un téléphone sous une fausse identité, ou couper un appel. Le correctif exige
  client **et** policies serveur ensemble — les poser seules couperait les appels.
  Tant que ce n'est pas fait : ne pas mettre les appels en avant.
- **Les pièces jointes restent lisibles à vie par leur URL exacte** (l'énumération,
  elle, est fermée). Refermer demande des URL signées aux deux points de dépôt et à
  l'affichage : c'est un lot entier.
- **`reports` n'a aucune colonne de statut.** `npm run moderation` tient un journal
  **local** — un pense-bête, pas une vérité partagée.
- **L'art. 13 des CGU promet de notifier les changements**, et rien ne sait le faire.
  Avec six comptes, c'est tolérable ; à trois cents, non.
- **La restauration d'une sauvegarde n'a jamais été exercée.** Une sauvegarde jamais
  restaurée est une intention, pas une sauvegarde.
- **Le code d'accès 2125 n'est pas une sécurité** : son hash est dans le JavaScript
  livré. C'est un rideau qui dit « ce n'est pas encore public ». ⚠️ Tant qu'il est là,
  les mentions légales ne sont **pas accessibles au public** — la LCEN impose de les
  mettre à disposition. Le jour où tu ouvres vraiment : retire le rideau (et les mots
  « Beta privée » de `js/access-gate.js`), ou pose les liens légaux sur son écran.
