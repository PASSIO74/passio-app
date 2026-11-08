-- ═══════════════════════════════════════════════════════════════════════════
-- « JAMAIS DE BASE64 EN BASE » DEVIENT UNE RÈGLE DU SERVEUR SUR `conv_messages` :
-- 20 000 CARACTÈRES AU PLUS, ET JAMAIS UNE DATA-URL DANS L'`url` D'UNE ENVELOPPE.
--
-- Une transaction, REJOUABLE, FERMÉE SUR ÉCHEC : tableau de verdict de 18 lignes
-- (17 contrôles OK/ECHEC, une information). Une seule ligne de contrôle en ECHEC
-- lève une exception avant `commit;` (SQLSTATE 55000) : RIEN n'est appliqué.
-- Rien de personnel dans ce fichier ni dans son verdict : des nombres, des codes
-- d'erreur, des définitions.
--
-- LE DÉFAUT. L'invariant « jamais de base64 en base (→ Storage) » n'était tenu
-- QUE par le client. `conv_messages.content` est un `text` NULLABLE, sans
-- contrainte CHECK jusqu'au lot 2 de sécurité (07/11 : 1 Mio en octets, qui
-- laisse passer une photo en base64) ; la policy d'insertion (`conv_messages_insert_member`) juge
-- l'auteur, l'appartenance, le blocage et la suppression du compte — jamais le
-- contenu ; « Update propre » laissait l'auteur RÉÉCRIRE le sien (retirée par le
-- lot 2 de sécurité le 07/11). Tout compte
-- connecté — une ancienne version de l'app, une requête forgée à la clé
-- publique — écrit donc un fichier entier en base64 dans un message. C'est ce
-- qu'a fait la bêta (« un seul message de 5 Mo a fait gonfler conv_messages à
-- 24 Mo », js/app-09-boot-pwa.js), et chaque ligne insérée part ENTIÈRE, en
-- direct, à chaque membre (`broadcast_conv_message_to_users` →
-- `realtime.broadcast_changes`, qui porte `NEW`). Et un chemin LÉGITIME le
-- faisait encore jusqu'au client de cette garde : transférer une photo qu'on
-- vient d'envoyer (`_forwardTo` écrivait la data-URL de la copie de l'auteur).
--
-- MESURÉ EN PRODUCTION au canal ① le 07/11 (execute_sql, lecture seule :
-- catalogue et agrégats, aucune ligne d'utilisateur) :
--   · 88 messages, du 2026-06-23 au 2026-10-23 ; TOUS des enveloppes JSON
--     valides : text 67, gif 10, location 3, react 3, media 3, audio 2 ;
--     longueur (char_length) médiane 267, p90 424, p99 551, max 551 (554
--     octets) ; 2 au-dessus de 500, 0 au-dessus de 1 000 ; 0 NULL, 0 vide ;
--   · dans les enveloppes : `text` 68 caractères au plus, `url` 164, `filename`
--     41, profil d'envoi `sp` 252 (dont la photo `sp.ph`, 156), réponse `rt` 65 ;
--   · 0 contenu qui contient « data: », 0 qui contient « base64 » ;
--   · colonnes : id text NOT NULL, conv_id text, from_id text, content text
--     (NULL admis), created_at timestamp ; contraintes : la clé primaire et deux
--     clés étrangères, AUCUNE CHECK ;
--   · policies (pg_policies, `public.` ôté, empreinte a39887ce…) :
--     conv_messages_insert_member, INSERT, authenticated, WITH CHECK (from_id =
--       auth.uid() ET is_conv_member ET NOT conv_1a1_bloquee ET NOT
--       suppression_de_mon_compte()) ; « Update propre », UPDATE, authenticated,
--       USING from_id = auth.uid(), WITH CHECK la même que l'insertion ;
--       « Suppression propre », DELETE ; conv_messages_select_member, SELECT ;
--   · déclencheurs (empreinte dca9578b…) : broadcast_conv_message_users_trigger
--     (AFTER INSERT), trg_identifiants_figes (BEFORE UPDATE, conv_id et from_id),
--     trg_rate_limit (BEFORE INSERT, 60 par minute et par from_id),
--     zz_barriere_suppression (BEFORE INSERT OR UPDATE) ;
--   · RLS active, identité de réplication DEFAULT, table publiée
--     (supabase_realtime) ; PostgreSQL 17.6.
--
-- REMESURÉ le 08/11, après les lots de sécurité 1 à 3 (#753, appliqués en
-- production le 07/11 à 16:49 UTC — contre-revue de cette PR, n° 5816974908) :
--   · deux CHECK posées par ces lots : `conv_messages_id_forme` (lot 1,
--     `id ~ '^[A-Za-z0-9_-]{1,120}$'` — R21 fermé) et `conv_messages_content_borne`
--     (lot 2, `octet_length(content) <= 1048576`) ;
--   · trois policies : « Update propre » est retirée (lot 2) — le client
--     n'écrit plus aucun UPDATE ; empreinte 8bf26134… ;
--   · cinq déclencheurs : `ab_debit_octets` (lot 3, BEFORE INSERT OR UPDATE,
--     `debit_octets_par_compte('4194304')` : 4 Mio par minute et par compte,
--     sous session seulement) s'ajoute ; empreinte fc9c5e60… ;
--     `trg_rate_limit` compte désormais dans `debit_ecritures`
--     (`debit_compter`, lot 2) ; `suppression_de_mon_compte` lit aussi
--     `auth.users.banned_until` ;
--   · données inchangées : 88 messages, 551 caractères au plus, 0 data-URL,
--     0 au-delà de 20 000 caractères.
--
-- CE QUE LE CLIENT ÉCRIT, chemin par chemin (audit du 07/11 ; js/app-02,
-- app-04, app-05, app-09) — la borne la plus large de chacun :
--   · texte (`sendMessageFp`, `_sendTextToSupa`, file de renvoi) : 5 000
--     caractères saisis au plus (MSG_TEXTE_MAX, client de cette garde ; AUCUNE
--     limite avant), plus le profil d'envoi et la réponse : moins de 11 000
--     caractères même entièrement échappés (guillemets, barres obliques) ;
--   · média, vocal, document (`sendMessageToSupabase`) : le nom du fichier deux
--     fois et dans l'URL Storage — un nom de 255 caractères donne 1 130
--     caractères (mesuré au banc), 1 700 avec le pire profil d'envoi ; une
--     data-URL n'y est JAMAIS écrite (retirée depuis la bêta) ;
--   · GIF, position, réaction, suppression, bienvenue de groupe (nom ≤ 50) :
--     moins de 1 000 ;
--   · transfert (`_forwardTo`) : les mêmes enveloppes ; un média encore local
--     est désormais TÉLÉVERSÉ avant (client de cette garde) — avant, sa
--     data-URL partait entière.
--
-- CE QUI CHANGE (et rien d'autre) — deux contraintes CHECK, qui valent pour
-- TOUS les chemins : client, administration, service_role, restauration. Elles
-- s'ajoutent à `conv_messages_content_borne` (lot 2, 1 Mio en octets) sans la
-- remplacer : c'est la borne générique du lot de sécurité, elle a son propre
-- retour arrière ; celle d'ici est plus serrée (20 000 caractères, 80 Ko au plus
-- en octets), et la règle de l'`url` n'existe nulle part ailleurs — la borne du
-- lot 2 laisse passer une photo d'environ 750 Ko en base64 :
--  ① `conv_messages_content_len_check` : `content` NULL, ou 20 000 caractères
--     au plus (`char_length` : des points de code). 36 fois le plus long message
--     mesuré, près de deux fois la pire enveloppe que le client écrit. Une
--     photo en base64 en fait des centaines de milliers : ce qui passe sous la
--     borne tient en moins de 15 Ko, une miniature au plus.
--  ② `conv_messages_content_url_data_check` : l'`url` d'une enveloppe — le seul
--     champ que le destinataire affiche comme média (`applyMsgContentData`,
--     app-04 : `m.img`, `m.video`, `m.gif`, `m.fileUrl`, `m.voiceData`) — n'est
--     jamais une data-URL :
--       · lue par jsonb quand PostgreSQL sait lire le contenu
--         (`pg_input_is_valid`, PostgreSQL 16+) : les échappements JSON
--         (`\u0064ata:`), les blancs et caractères de contrôle en tête, la
--         casse et la clé en double (la dernière l'emporte, comme pour le
--         client) sont résolus comme le client les résout ;
--       · ET reconnue dans le texte brut (« "url" : "data: », casse du schéma
--         ignorée) : un JSON que jsonb refuse mais que le client lit — une
--         surrogate isolée, `\u0000` — ne passe pas par là.
--     La lecture jsonb est GARDÉE (`case when pg_input_is_valid …`), jamais une
--     conversion directe : le client écrit des enveloppes que jsonb refuse
--     (l'aperçu d'une réponse, `.slice(0, 80)`, coupe un emoji en deux, et
--     `JSON.stringify` l'écrit `\ud83d`). Elles passent — la ligne 5 le mesure.
--     Un TEXTE qui cite « "url":"data: » passe aussi : dans une chaîne JSON, le
--     guillemet est échappé.
--
-- POURQUOI DES CONTRAINTES, ET NI UN DÉCLENCHEUR NI LA POLICY :
--   · une contrainte lie tout le monde, administration comprise, et rien ne la
--     contourne (un déclencheur se désactive, et `session_replication_role =
--     replica` — celui d'une restauration — le saute) : l'invariant porte sur
--     ce qui est EN BASE, pas sur qui l'écrit ;
--   · une WITH CHECK ne couvrirait ni l'administration, ni un UPDATE futur (la
--     policy d'UPDATE retirée le 07/11 peut revenir : la contrainte vaut déjà
--     pour elle) ;
--   · aucune fonction nouvelle : rien d'exposé à `/rest/v1/rpc`, et le rôle
--     client n'a besoin d'aucun droit de plus (une fonction appelée par une
--     CHECK s'exécute avec les droits de l'écrivain).
--
-- CE QUE VOIT LE CLIENT. Un refus est un 23514 que PostgREST rend en 400, avec
-- le nom de la contrainte dans `message` (les CHECK se jugent par ordre
-- alphabétique de nom : au-delà de 1 Mio, `conv_messages_content_borne` du lot 2
-- refuse la première ; en deçà, une photo en base64 est refusée par la longueur
-- avant de l'être par l'`url`) et SANS la ligne refusée (table sous RLS : pas
-- de « Failing row contains » — le banc le vérifie). Le client de cette garde le tient
-- pour DÉFINITIF (`_refusDefinitif`, plus de renvoi automatique) et le DIT
-- (`_motRefusContenu`) ; l'ancien client le rejoue jusqu'à MSG_ESSAIS_MAX (10)
-- puis s'arrête — borné, rien de perdu à l'écran.
--
-- ⚠️ PRÉREQUIS CLIENT. Appliquée avant son client, cette garde ferait ÉCHOUER
-- le transfert d'un média qu'on vient d'envoyer (l'ancien `_forwardTo` écrit sa
-- data-URL) au lieu de le passer par Storage. Le client porte la chaîne
-- ci-dessous (`CONTENU_MESSAGE_BORNE`, js/app-04-comments-shop.js, PR #751) ;
-- scripts/appliquer-migration.mjs refuse la production tant que le client SERVI
-- ne la porte pas (règle ④ de scripts/lib/barriere-migration.js).
-- PREREQUIS-CLIENT: conv_messages:contenu-borne
--
-- CE QUI N'EST PAS FERMÉ ICI, dit tel quel :
--   · un JSON que jsonb refuse ET dont l'`url` écrit « data: » par échappements
--     (`\u0064ata:`) passe la seconde contrainte — la première le borne à
--     20 000 caractères (moins de 15 Ko décodés) ;
--   · du base64 hors d'une `url` (dans un texte) n'est borné que par la
--     longueur ; le destinataire ne l'affiche jamais comme média ;
--   · le DÉBIT est celui des lots de sécurité (60 messages et 4 Mio par minute
--     et par compte) : la borne d'ici est par ligne, pas par compte ;
--   · les autres colonnes de texte libre (posts, post_comments, event_comments…)
--     ne sont pas bornées ici.
--
-- ORDRE : APRÈS le client de #751 (PREREQUIS-CLIENT ci-dessus) ET APRÈS les
-- lots de sécurité 1 à 3 (le verdict exige leurs deux CHECK et leurs
-- empreintes, lignes 16 et 17). Le staging d'abord — ses empreintes comparées à
-- celles de la production avant d'en croire le verdict —, la production
-- ensuite. Elle ne touche ni l'identité de réplication (R25), ni les policies,
-- ni la publication : une contrainte ne change pas la forme des lignes
-- décodées. Elle ne crée aucun objet : aucun droit à déclarer.
--
-- VERDICT : chaque affirmation est MESURÉE. Le comportement par un décor
-- SYNTHÉTIQUE (compte `00000000-0000-4000-8000-00000000cb01`, identifiants
-- `zz_cmb_…` : ni format réel, ni exemple), posé SANS session ; chaque écriture
-- part sous SON rôle — authenticated à identité simulée (membre, auteur), le
-- rôle de la migration, service_role — rôle et identité relevés à chaque fois.
-- Le bloc finit en levant `passio_verdict_annule` : tout ce qu'il a écrit
-- disparaît (une sous-transaction annulée n'est jamais décodée par le temps
-- réel, ni ses poussées `realtime.messages`). Les définitions par le catalogue.
--
-- Rejouable ; banc : tests/sql/migration-conv-messages-contenu-borne.test.sh.
-- RETOUR ARRIÈRE — exécutable tel quel en ôtant « --| » (le banc le rejoue). Il
-- rend l'état exact d'avant CETTE migration : seules ses deux contraintes
-- partent, celles du lot de sécurité (`conv_messages_content_borne`,
-- `conv_messages_id_forme`) restent. Rien n'est effacé (une contrainte ne
-- réécrit aucune ligne). Il se joue à l'éditeur SQL (canal ③), puis se MESURE
-- au canal ① : `select conname from pg_constraint where conrelid =
-- 'public.conv_messages'::regclass and contype = 'c'` ne rend plus que
-- conv_messages_content_borne et conv_messages_id_forme.
--| begin;
--| set local lock_timeout = '5s';
--| alter table public.conv_messages
--|   drop constraint if exists conv_messages_content_len_check,
--|   drop constraint if exists conv_messages_content_url_data_check;
--| commit;
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- Un verrou qui ne vient pas en 5 s fait ÉCHOUER la migration (rien n'est
-- appliqué, elle se relance) au lieu de mettre en file, derrière elle, toutes
-- les lectures et écritures de `conv_messages`.
set local lock_timeout = '5s';

-- ── ① et ② LES DEUX CONTRAINTES ──
-- Une instruction, un verrou ; la validation relit les lignes existantes : une
-- seule hors borne fait échouer l'instruction (23514), donc la migration.
alter table public.conv_messages
  drop constraint if exists conv_messages_content_len_check,
  add constraint conv_messages_content_len_check
    check (content is null or char_length(content) <= 20000),
  drop constraint if exists conv_messages_content_url_data_check,
  add constraint conv_messages_content_url_data_check
    check (content is null or (
      content !~ '"url"[[:space:]]*:[[:space:]]*"[[:space:][:cntrl:]]*[Dd][Aa][Tt][Aa]:'
      and case when pg_input_is_valid(content, 'jsonb')
               then coalesce((content::jsonb ->> 'url') !~* '^[[:space:][:cntrl:]]*data:', true)
               else true
          end));

-- Le verrou est PRIS : désormais, toute attente qui suit le PROLONGE — le
-- verdict écrit dans profiles, conversations, conv_members et realtime.messages
-- pendant que conv_messages reste fermée, et `realtime.send` AVALE ses erreurs,
-- 55P03 compris. 200 ms par attente au plus (contre-revue de C-02, 06/11 : sept
-- attentes de 3 s, 27 s de messagerie gelée ; banc § ⑥).
set local lock_timeout = '200ms';

-- ── ③ LE COMPORTEMENT, MESURÉ : un décor synthétique, une sous-transaction ANNULÉE ──
-- Décor (sans session) : A, SEUL membre d'une conversation 1-à-1 — un membre de
-- plus doublerait les poussées realtime de chaque écriture, donc les attentes
-- possibles sous verrou, sans rien mesurer de plus. Puis chaque écriture part sous SON rôle et SON identité
-- (`request.jwt.claim.sub` et `request.jwt.claims`, la lecture même
-- d'`auth.uid()`). Seules les mesures, tenues dans des variables, survivent à
-- l'annulation (réglage de transaction `passio.verdict_cmb`).
do $verdict$
declare
  sfx    constant text := left(md5(clock_timestamp()::text || random()::text), 10);
  a      constant text := '00000000-0000-4000-8000-00000000cb01';   -- A : écrit, seul membre
  conv   constant text := 'zz_cmb_c_' || sfx;
  role0  constant text := current_user;
  -- Le profil d'envoi ordinaire, et le PIRE que l'app pose (`_msgSenderMeta` :
  -- nom de 40 caractères — maxlength du champ — fait de guillemets, photo https longue).
  sp     constant text := '{"n":"Léa","e":"✨","c":"#8b5cf6","pid":"p_zz_cmb","ph":"https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/zz_cmb/a.jpg"}';
  sp_pire constant text := '{"n":"' || repeat('\"', 40) || '","e":"✨","c":"#8b5cf6","pid":"p_' || repeat('y', 30)
                           || '","ph":"https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/' || repeat('p', 400) || '.jpg"}';
  nom255 constant text := repeat('n', 251) || '.jpg';
  photo  constant text := 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  mes    jsonb := '{}'::jsonb;
  roles  jsonb := '{}'::jsonb;
  t      record;
  etat   text;
  cn     text;
  n_maj  bigint;
  id_maj text;
begin
  begin
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.profiles (id, username, is_private) values (a, 'zz_cmb_a_' || sfx, false);
    insert into public.conversations (id, is_group, created_by) values (conv, false, a);
    insert into public.conv_members (conv_id, user_id) values (conv, a);

    -- a. Les écritures. `qui` : « a » (authenticated, A), « admin » (le rôle de
    --    la migration, sans identité) ou « service » (service_role, sans identité).
    for t in
      select x.* from jsonb_to_recordset(jsonb_build_array(
        -- ce que le client écrit, chemin par chemin : ACCEPTÉ
        jsonb_build_object('cle', 'texte',        'qui', 'a', 'contenu', '{"type":"text","text":"Salut 👋","sp":' || sp || '}'),
        jsonb_build_object('cle', 'texte_pire',   'qui', 'a', 'contenu',
          '{"type":"text","text":"' || repeat('\"', 5000) || '","sp":' || sp_pire
          || ',"rt":{"id":"msg_' || repeat('x', 40) || '","t":"' || repeat('\\', 80) || '","n":"' || repeat('\"', 40) || '"}}'),
        jsonb_build_object('cle', 'media',        'qui', 'a', 'contenu',
          '{"type":"media","filename":"' || nom255 || '","fileType":"image/jpeg","url":"https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/attachments/attachments/'
          || conv || '/1762500000000_abc123def_' || nom255 || '","text":"[MEDIA] ' || nom255 || '","sp":' || sp || '}'),
        jsonb_build_object('cle', 'gif',          'qui', 'a', 'contenu', '{"type":"gif","url":"https://media.tenor.com/zz_cmb/tenor.gif","text":"🎬 GIF","sp":' || sp || '}'),
        jsonb_build_object('cle', 'position',     'qui', 'a', 'contenu',
          '{"type":"location","lat":45.89912,"lng":6.12943,"url":"https://maps.google.com/?q=45.89912,6.12943","text":"📍 Ma position : https://maps.google.com/?q=45.89912,6.12943","sp":' || sp || '}'),
        jsonb_build_object('cle', 'reaction',     'qui', 'a', 'contenu', '{"type":"react","target":"msg_zz_cmb","emoji":"😍","op":"add"}'),
        jsonb_build_object('cle', 'suppression',  'qui', 'a', 'contenu', '{"type":"del","target":"msg_zz_cmb","text":"🗑 Message supprimé"}'),
        jsonb_build_object('cle', 'brut',         'qui', 'a', 'contenu', 'Bonjour ! Mes data: 12 %, voir https://exemple.test/data:x'),
        jsonb_build_object('cle', 'nul',          'qui', 'a'),
        -- aucun faux positif
        jsonb_build_object('cle', 'texte_cite',   'qui', 'a', 'contenu', '{"type":"text","text":"Le champ \"url\":\"data:image/png;base64,AAAA\" ne passe plus"}'),
        jsonb_build_object('cle', 'url_https',    'qui', 'a', 'contenu', '{"type":"media","url":"https://exemple.test/data:photo.png","fileType":"image/png","filename":"x.png","text":"[MEDIA] x.png"}'),
        jsonb_build_object('cle', 'apercu_coupe', 'qui', 'a', 'contenu', '{"type":"text","text":"ok","rt":{"id":"msg_zz_cmb","t":"salut \ud83d","n":"Léa"}}'),
        -- la borne
        jsonb_build_object('cle', 'borne',        'qui', 'a', 'contenu', '{"type":"text","text":"' || repeat('a', 19975) || '"}'),
        jsonb_build_object('cle', 'trop_long',    'qui', 'a', 'contenu', repeat('a', 20001)),
        -- une data-URL dans l'url d'une enveloppe : REFUSÉE
        jsonb_build_object('cle', 'data_media',   'qui', 'a', 'contenu',
          '{"type":"media","filename":"photo.png","fileType":"image/png","url":"data:image/png;base64,' || photo || '","text":"[MEDIA] photo.png"}'),
        jsonb_build_object('cle', 'data_espaces', 'qui', 'a', 'contenu', '{"type":"media", "url" : "  data:image/png;base64,AAAA"}'),
        jsonb_build_object('cle', 'data_casse',   'qui', 'a', 'contenu', '{"type":"media","url":"DATA:image/png;base64,AAAA"}'),
        jsonb_build_object('cle', 'data_echappe', 'qui', 'a', 'contenu', '{"type":"media","url":"\u0064ata:image/png;base64,AAAA"}'),
        jsonb_build_object('cle', 'data_controle','qui', 'a', 'contenu', '{"type":"media","url":"\u0001data:image/png;base64,AAAA"}'),
        jsonb_build_object('cle', 'data_doublon', 'qui', 'a', 'contenu', '{"type":"media","url":"https://exemple.test/a.png","url":"data:image/png;base64,AAAA"}'),
        jsonb_build_object('cle', 'data_invalide','qui', 'a', 'contenu', '{"type":"media","url":"data:image/png;base64,AAAA","t":"\ud83d"}'),
        jsonb_build_object('cle', 'data_photo',   'qui', 'a', 'contenu',
          '{"type":"media","filename":"photo.jpg","fileType":"image/jpeg","url":"data:image/jpeg;base64,' || repeat('A', 150000) || '","text":"[MEDIA] photo.jpg"}'),
        -- l'administration : liée, elle aussi
        jsonb_build_object('cle', 'admin_ok',     'qui', 'admin',   'contenu', '{"type":"text","text":"écrit par l''administration"}'),
        jsonb_build_object('cle', 'admin_data',   'qui', 'admin',   'contenu', '{"type":"media","url":"data:image/png;base64,' || photo || '"}'),
        jsonb_build_object('cle', 'admin_long',   'qui', 'admin',   'contenu', repeat('a', 20001)),
        jsonb_build_object('cle', 'service_data', 'qui', 'service', 'contenu', '{"type":"media","url":"data:image/png;base64,' || photo || '"}'),
        jsonb_build_object('cle', 'service_long', 'qui', 'service', 'contenu', repeat('a', 20001))
      )) as x(cle text, qui text, contenu text)
    loop
      if t.qui = 'a' then
        execute 'set local role authenticated';
        perform set_config('request.jwt.claim.sub', a, true);
        perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
      elsif t.qui = 'service' then
        execute 'set local role service_role';
        perform set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
      end if;
      roles := roles || jsonb_build_object(t.cle, jsonb_build_array(current_user::text, (auth.uid())::text));
      begin
        execute 'insert into public.conv_messages (id, conv_id, from_id, content) values ($1, $2, $3, $4)'
          using 'zz_cmb_' || t.cle || '_' || sfx, conv, a, t.contenu;
        etat := 'ok';
      exception when others then
        get stacked diagnostics cn = constraint_name;
        etat := sqlstate || coalesce(':' || nullif(cn, ''), '');
      end;
      mes := mes || jsonb_build_object(t.cle, etat);
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', '', true);
      perform set_config('request.jwt.claims', '', true);
    end loop;

    -- b. L'UPDATE. Le client n'en a plus : « Update propre » est retirée (lot 2
    --    de sécurité, 07/11) — sous le rôle de l'auteur, sur SON message, 0 ligne.
    --    L'administration (purge, reprise, service_role) en garde le droit, et
    --    les contraintes la lient : vers une data-URL, vers 20 001 caractères,
    --    REFUSÉ ; vers un texte ordinaire, accepté (une ligne).
    id_maj := 'zz_cmb_texte_' || sfx;
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', a, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
    roles := roles || jsonb_build_object('maj', jsonb_build_array(current_user::text, (auth.uid())::text));
    begin
      execute 'update public.conv_messages set content = $1 where id = $2'
        using '{"type":"media","url":"data:image/png;base64,' || photo || '"}', id_maj;
      get diagnostics n_maj = row_count;
      etat := 'ok:' || n_maj;
    exception when others then
      get stacked diagnostics cn = constraint_name;
      etat := sqlstate || coalesce(':' || nullif(cn, ''), '');
    end;
    mes := mes || jsonb_build_object('maj_client', etat);
    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    roles := roles || jsonb_build_object('maj_admin', jsonb_build_array(current_user::text, (auth.uid())::text));
    for t in
      select x.* from jsonb_to_recordset(jsonb_build_array(
        jsonb_build_object('cle', 'maj_data', 'contenu', '{"type":"media","url":"data:image/png;base64,' || photo || '"}'),
        jsonb_build_object('cle', 'maj_long', 'contenu', repeat('a', 20001)),
        jsonb_build_object('cle', 'maj_ok',   'contenu', '{"type":"text","text":"modifié"}')
      )) as x(cle text, contenu text)
    loop
      begin
        execute 'update public.conv_messages set content = $1 where id = $2' using t.contenu, id_maj;
        get diagnostics n_maj = row_count;
        etat := 'ok:' || n_maj;
      exception when others then
        get stacked diagnostics cn = constraint_name;
        etat := sqlstate || coalesce(':' || nullif(cn, ''), '');
      end;
      mes := mes || jsonb_build_object(t.cle, etat);
    end loop;

    -- c. Ce que les cas MESURENT vraiment : la longueur de la pire enveloppe, et
    --    deux contenus que jsonb ne sait pas lire (le client, lui, les lit).
    mes := mes || jsonb_build_object(
      'longueur_pire', (select char_length(m.content) from public.conv_messages m where m.id = 'zz_cmb_texte_pire_' || sfx),
      'longueur_media', (select char_length(m.content) from public.conv_messages m where m.id = 'zz_cmb_media_' || sfx),
      'longueur_borne', (select char_length(m.content) from public.conv_messages m where m.id = 'zz_cmb_borne_' || sfx),
      'jsonb_apercu_coupe', pg_input_is_valid('{"type":"text","text":"ok","rt":{"id":"msg_zz_cmb","t":"salut \ud83d","n":"Léa"}}', 'jsonb'),
      'jsonb_data_invalide', pg_input_is_valid('{"type":"media","url":"data:image/png;base64,AAAA","t":"\ud83d"}', 'jsonb'),
      'nul_en_base', (select count(*) from public.conv_messages m where m.id = 'zz_cmb_nul_' || sfx and m.content is null));

    -- Le rôle et l'identité de la migration, rendus AVANT l'annulation (qui les
    -- rendrait aussi).
    perform set_config('role', role0, true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    raise exception using errcode = 'P0001', message = 'passio_verdict_annule';
  exception when others then
    if sqlerrm is distinct from 'passio_verdict_annule' then
      mes := mes || jsonb_build_object('erreur', left(sqlstate || ' ' || sqlerrm, 160));
    end if;
  end;
  mes := mes || jsonb_build_object('roles', roles);
  -- Après l'annulation : rien ne doit rester du décor — ni ses lignes, ni les
  -- poussées que broadcast_conv_message_to_users et trg_diffuser_ajout_membre
  -- ont écrites dans realtime.messages, ni les compteurs que les déclencheurs de
  -- débit des lots de sécurité ont posés pour A (`debit_ecritures`).
  begin
    if to_regclass('public.debit_ecritures') is not null then
      execute 'select count(*) from public.debit_ecritures d where d.source = $1' into n_maj using a;
      mes := mes || jsonb_build_object('restes_debit', n_maj);
    end if;
    mes := mes || jsonb_build_object('restes',
        (select count(*) from public.profiles p where p.id = a)
      + (select count(*) from public.conversations c where c.id = conv)
      + (select count(*) from public.conv_members m where m.conv_id = conv or m.user_id = a)
      + (select count(*) from public.conv_messages m where m.conv_id = conv or m.from_id = a or m.id like 'zz\_cmb\_%')
      + (select count(*) from realtime.messages r where r.topic = 'user:' || a));
  exception when others then
    mes := mes || jsonb_build_object('restes', 'illisible ' || sqlstate);
  end;
  perform set_config('passio.verdict_cmb', mes::text, true);
end
$verdict$;

-- ── ④ LE TABLEAU, relevé UNE fois dans une table temporaire détruite au commit,
-- lu par le garde-fou ⑤ et par le verdict. `bloquant` : toute ligne de contrôle
-- (1 à 17) ; la 18 est une information. Une valeur absente (hors de cette
-- transaction : « mesure absente ») n'est jamais un OK.
create temp table passio_cmb_verdict on commit drop as
with v as (select coalesce(nullif(current_setting('passio.verdict_cmb', true), ''), '{}')::jsonb as j),
     l as (select 'conv_messages_content_len_check'::text as len, 'conv_messages_content_url_data_check'::text as url)
select 1 as n, true as bloquant, 'mesure exécutée : décor synthétique, chaque écriture sous SON rôle (authenticated à identité simulée, rôle de la migration, service_role), sous-transaction ANNULÉE'::text as controle,
       (select case when j ? 'erreur' then 'ECHEC — ' || (j->>'erreur')
                    when j ? 'texte' and j ? 'service_long' and j ? 'maj_ok' and j ? 'longueur_pire'
                         and j->'roles'->'texte' = '["authenticated", "00000000-0000-4000-8000-00000000cb01"]'::jsonb
                         and j->'roles'->'data_media' = '["authenticated", "00000000-0000-4000-8000-00000000cb01"]'::jsonb
                         and j->'roles'->'maj' = '["authenticated", "00000000-0000-4000-8000-00000000cb01"]'::jsonb
                         and j->'roles'->'service_data' = '["service_role", null]'::jsonb
                         and j->'roles'->'admin_data'->>1 is null
                         and j->'roles'->'admin_data'->>0 not in ('anon', 'authenticated', 'service_role') then 'OK'
                    else 'ECHEC — mesure absente, ou écriture sous un autre rôle' end from v) as valeur
union all select 2, true, 'ACCEPTÉ sous le rôle client — l''enveloppe de chaque chemin d''écriture du client : texte, réaction, suppression, position, GIF, média (nom de fichier de 255 caractères, trois fois), texte brut d''une ancienne version, contenu NULL',
       (select case when (j->>'texte', j->>'reaction', j->>'suppression', j->>'position', j->>'gif', j->>'media', j->>'brut', j->>'nul')
                         = ('ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok') and j->>'nul_en_base' = '1' then 'OK' else 'ECHEC' end from v)
union all select 3, true, 'ACCEPTÉ — la pire enveloppe de texte du client : 5 000 guillemets échappés, réponse et profil d''envoi maximaux (plus de 10 000 caractères, sous la borne)',
       (select case when j->>'texte_pire' = 'ok' and (j->>'longueur_pire')::int between 10000 and 20000 then 'OK' else 'ECHEC' end from v)
union all select 4, true, 'AUCUN FAUX POSITIF : un texte qui CITE « "url":"data: » et une URL https qui contient « data: » sont acceptés',
       (select case when (j->>'texte_cite', j->>'url_https') = ('ok', 'ok') then 'OK' else 'ECHEC' end from v)
union all select 5, true, 'ACCEPTÉ — l''aperçu d''une réponse coupé au milieu d''un emoji (« \ud83d ») : le client l''écrit, jsonb ne sait pas le lire (pg_input_is_valid = faux) ; la lecture jsonb est gardée, jamais une erreur',
       (select case when j->>'apercu_coupe' = 'ok' and j->>'jsonb_apercu_coupe' = 'false' then 'OK' else 'ECHEC' end from v)
union all select 6, true, '20 000 caractères sont acceptés ; 20 001 sont REFUSÉS (23514, conv_messages_content_len_check)',
       (select case when j->>'borne' = 'ok' and j->>'longueur_borne' = '20000'
                         and j->>'trop_long' = '23514:' || (select len from l) then 'OK' else 'ECHEC' end from v)
union all select 7, true, 'REFUSÉ — l''enveloppe média que transférait l''ancien client, url en data: (23514, conv_messages_content_url_data_check)',
       (select case when j->>'data_media' = '23514:' || (select url from l) then 'OK' else 'ECHEC' end from v)
union all select 8, true, 'REFUSÉ — les variantes : blancs, casse, échappement JSON (\u0064ata:), caractère de contrôle en tête, clé en double (la dernière l''emporte, comme pour le client)',
       (select case when (j->>'data_espaces', j->>'data_casse', j->>'data_echappe', j->>'data_controle', j->>'data_doublon')
                         = ('23514:' || (select url from l), '23514:' || (select url from l), '23514:' || (select url from l),
                            '23514:' || (select url from l), '23514:' || (select url from l)) then 'OK' else 'ECHEC' end from v)
union all select 9, true, 'REFUSÉ — un JSON que jsonb ne sait pas lire (pg_input_is_valid = faux) mais qui porte « "url":"data: » en clair : la forme brute est gardée aussi',
       (select case when j->>'data_invalide' = '23514:' || (select url from l) and j->>'jsonb_data_invalide' = 'false' then 'OK' else 'ECHEC' end from v)
union all select 10, true, 'REFUSÉ — une photo en base64 (150 000 caractères) : 23514',
       (select case when j->>'data_photo' in ('23514:' || (select len from l), '23514:' || (select url from l)) then 'OK' else 'ECHEC' end from v)
union all select 11, true, 'UPDATE : le client n''en a plus (aucune policy d''UPDATE depuis le lot 2 : sous le rôle de l''auteur, sur SON message, 0 ligne) ; l''administration est liée : vers une data-URL REFUSÉ, vers 20 001 caractères REFUSÉ (23514), vers un texte ordinaire accepté, une ligne',
       (select case when (j->>'maj_client', j->>'maj_data', j->>'maj_long', j->>'maj_ok')
                         = ('ok:0', '23514:' || (select url from l), '23514:' || (select len from l), 'ok:1')
                         and j->'roles'->'maj_admin'->>1 is null
                         and j->'roles'->'maj_admin'->>0 not in ('anon', 'authenticated', 'service_role') then 'OK' else 'ECHEC' end from v)
union all select 12, true, 'les contraintes LIENT AUSSI L''ADMINISTRATION : rôle de la migration et service_role REFUSÉS (23514) sur une data-URL et sur 20 001 caractères ; une écriture ordinaire de l''administration passe',
       (select case when (j->>'admin_ok', j->>'admin_data', j->>'admin_long', j->>'service_data', j->>'service_long')
                         = ('ok', '23514:' || (select url from l), '23514:' || (select len from l),
                            '23514:' || (select url from l), '23514:' || (select len from l)) then 'OK' else 'ECHEC' end from v)
union all select 13, true, 'aucune trace du décor : profils, conversation, membres, messages, poussées dans realtime.messages, compteurs de débit',
       (select case when j->>'restes' = '0' and coalesce(j->>'restes_debit', '0') = '0' then 'OK'
                    else 'ECHEC — ' || coalesce(j->>'restes', 'absent') || ' / ' || coalesce(j->>'restes_debit', '-') end from v)
union all select 14, true, 'conv_messages_content_len_check : CHECK validée, définition exacte (blancs ramenés à un seul)',
       case when exists (select 1 from pg_catalog.pg_constraint c
                          where c.conrelid = 'public.conv_messages'::regclass and c.conname = 'conv_messages_content_len_check'
                            and c.contype = 'c' and c.convalidated
                            and regexp_replace(pg_catalog.pg_get_constraintdef(c.oid), '[[:space:]]+', ' ', 'g')
                                = 'CHECK (((content IS NULL) OR (char_length(content) <= 20000)))') then 'OK' else 'ECHEC' end
union all select 15, true, 'conv_messages_content_url_data_check : CHECK validée, définition exacte (blancs ramenés à un seul : le CASE se déparse sur plusieurs lignes)',
       case when exists (select 1 from pg_catalog.pg_constraint c
                          where c.conrelid = 'public.conv_messages'::regclass and c.conname = 'conv_messages_content_url_data_check'
                            and c.contype = 'c' and c.convalidated
                            and regexp_replace(pg_catalog.pg_get_constraintdef(c.oid), '[[:space:]]+', ' ', 'g')
                                = 'CHECK (((content IS NULL) OR ((content !~ ''"url"[[:space:]]*:[[:space:]]*"[[:space:][:cntrl:]]*[Dd][Aa][Tt][Aa]:''::text) AND CASE WHEN pg_input_is_valid(content, ''jsonb''::text) THEN COALESCE((((content)::jsonb ->> ''url''::text) !~* ''^[[:space:][:cntrl:]]*data:''::text), true) ELSE true END)))') then 'OK' else 'ECHEC' end
union all select 16, true, 'conv_messages porte exactement quatre CHECK : ces deux-ci et les deux du lot de sécurité, intactes (conv_messages_content_borne : 1 Mio en octets ; conv_messages_id_forme) ; content reste un text qui admet NULL ; RLS active ; identité DEFAULT ; toujours publiée (supabase_realtime)',
       case when (select string_agg(c.conname, ',' order by c.conname) from pg_catalog.pg_constraint c
                   where c.conrelid = 'public.conv_messages'::regclass and c.contype = 'c')
                 = 'conv_messages_content_borne,conv_messages_content_len_check,conv_messages_content_url_data_check,conv_messages_id_forme'
             and (select pg_catalog.pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
                   where c.conrelid = 'public.conv_messages'::regclass and c.conname = 'conv_messages_content_borne')
                 = 'CHECK ((octet_length(content) <= 1048576))'
             and (select pg_catalog.pg_get_constraintdef(c.oid) from pg_catalog.pg_constraint c
                   where c.conrelid = 'public.conv_messages'::regclass and c.conname = 'conv_messages_id_forme')
                 = 'CHECK ((id ~ ''^[A-Za-z0-9_-]{1,120}$''::text))'
             and exists (select 1 from pg_catalog.pg_attribute t
                          where t.attrelid = 'public.conv_messages'::regclass and t.attname = 'content'
                            and t.atttypid = 'text'::regtype and not t.attnotnull and not t.attisdropped)
             and (select c.relrowsecurity and c.relreplident = 'd' from pg_catalog.pg_class c where c.oid = 'public.conv_messages'::regclass)
             and exists (select 1 from pg_catalog.pg_publication_tables p
                          where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = 'conv_messages') then 'OK' else 'ECHEC' end
union all select 17, true, 'policies et déclencheurs de conv_messages : ceux mesurés le 08/11, après les lots de sécurité (empreintes 8bf26134…, fc9c5e60…, `public.` ôté) — rien d''autre ne change',
       case when (select md5(string_agg(p.policyname || '|' || p.cmd || '|' || p.permissive || '|' || array_to_string(p.roles, ',') || '|'
                                        || replace(coalesce(p.qual, ''), 'public.', '') || '|' || replace(coalesce(p.with_check, ''), 'public.', ''), '#' order by p.policyname))
                    from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = 'conv_messages') = '8bf26134d964e77fbb026cb835a55a36'
             and (select md5(string_agg(replace(pg_catalog.pg_get_triggerdef(t.oid), 'public.', '') || '|' || t.tgenabled::text, '#' order by t.tgname))
                    from pg_catalog.pg_trigger t where t.tgrelid = 'public.conv_messages'::regclass and not t.tgisinternal) = 'fc9c5e6003124899df79751fe836488e'
            then 'OK' else 'ECHEC' end
union all select 18, false, 'information — messages en base ; le plus long (caractères) ; enveloppes à data-URL (0 attendu : sinon l''ajout de la contrainte aurait échoué)',
       (select count(*) || ' ; ' || coalesce(max(char_length(m.content)), 0) || ' ; '
               || count(*) filter (where m.content ~* '"url"[[:space:]]*:[[:space:]]*"[[:space:][:cntrl:]]*data:')
          from public.conv_messages m);

-- ── ⑤ FERMÉ SUR ÉCHEC : une ligne de contrôle en ECHEC annule TOUT ──
-- Rien n'est alors appliqué — ni les contraintes, ni une trace du décor, ni la
-- ligne de journal de l'outil d'application (même transaction).
do $$
declare
  numeros text;
  details text;
begin
  select string_agg(c.n::text, ',' order by c.n), string_agg(c.n || '. ' || c.controle, ' ; ' order by c.n)
    into numeros, details
    from pg_temp.passio_cmb_verdict c
   where c.bloquant and c.valeur is distinct from 'OK';
  if numeros is not null then
    raise exception 'conv_messages, contenu borné : la base n''est pas celle que ce correctif suppose, ou il ne s''y comporte pas comme il le doit — RIEN n''est appliqué. Lignes en échec : %', numeros
      using errcode = 'object_not_in_prerequisite_state', detail = details;
  end if;
end $$;

-- ── Verdict ──
select controle, valeur from pg_temp.passio_cmb_verdict order by n;

commit;
