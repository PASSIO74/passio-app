-- ═══════════════════════════════════════════════════════════════════════════
-- DISCUSSIONS D'ACTIVITÉ — L'APPARTENANCE NE SE LIT PLUS SUR AUTRUI (C-02, R41),
-- ET LE CRÉATEUR D'UNE DISCUSSION EN VOIT — DONC EN RETIRE — TOUS LES MEMBRES
-- (RV-44) (2026-11-06)
--
-- MESURÉ EN PRODUCTION le 2026-11-06, de 10:15 à 10:25 UTC, au canal ① (lecture
-- seule : catalogue et agrégats, aucune ligne d'utilisateur lue) — PostgreSQL 17.6 :
--   · `public.is_conv_member(_conv_id text, _uid text)` : boolean, language sql,
--     STABLE, SECURITY DEFINER, search_path vide, PARALLEL UNSAFE, coût 100, ni
--     STRICT ni LEAKPROOF, propriétaire postgres, sans commentaire ; EXECUTE pour
--     postgres, authenticated et service_role — ni anon, ni PUBLIC ;
--     md5(prosrc) da6bf4bb1054d608cbb0f246d70ddb39 (101 octets, sans CR — le
--     corps commence et finit par UNE espace). Elle répond pour N'IMPORTE QUEL
--     `_uid` : `POST /rest/v1/rpc/is_conv_member` dit à tout compte connecté si
--     un autre compte est membre d'une conversation donnée (C-02).
--   · SES APPELANTS, cherchés par trois chemins (pg_depend ; le corps de TOUTES
--     les fonctions de tous les schémas ; les expressions de TOUTES les policies
--     de tous les schémas) :
--       – 11 policies, 14 appels, TOUS avec `(( SELECT auth.uid() AS uid))::text`
--         pour second argument (expression régulière sur le déparsage : 14 sur
--         14, aucun autre appel) — conv_members_select_member ; conv_messages
--         « Update propre », conv_messages_insert_member,
--         conv_messages_select_member ; conv_reads reads_select, reads_update,
--         reads_upsert ; conversations_select_member ; realtime.messages
--         passio_rt_emettre (typing:, conv:) et passio_rt_recevoir (typing:,
--         conv:, conv_specific:) ; storage.objects passio_attachments_read_membre ;
--       – `storage_chemin_autorise` (SECURITY INVOKER, md5 0ab32680…), appelée
--         par passio_media_insert_cloisonne et passio_media_update_cloisonne,
--         passe `(select auth.uid())::text` ;
--       – `trg_reports_preuve_message` (AFTER INSERT sur reports, WHEN
--         target_type = 'message', md5 816c7ac7…) passe `new.reporter_id`, que la
--         WITH CHECK de `reports_insert` lie à `(select auth.uid())::text` — elle
--         est évaluée AVANT les déclencheurs AFTER ; aucune fonction n'écrit dans
--         reports (seul le client y insère ; la modération y met à jour en
--         service_role, sans identité) ;
--       – aucune vue, aucun défaut, aucune contrainte (pg_depend) ; dans le dépôt,
--         aucun appel du client (js/), d'une fonction Edge (supabase/functions),
--         du pilotage (dashboard/, pilotage/) ni de netlify/.
--   · `conv_members_select_member` : la policy posée par C-04 (06/11, 09:17
--     UTC), FOR SELECT TO authenticated, md5 du déparsage de15394b… ;
--     conv_members porte trois policies (« Ecriture propre » INSERT, « Suppression
--     admin » DELETE TO public, celle-ci), trois déclencheurs
--     (trg_diffuser_ajout_membre AFTER INSERT → realtime.send vers user:<uid> ;
--     trg_rid_opaque ; zz_barriere_suppression) et n'est plus publiée en temps
--     réel (seconde couche de R25).
--   · agrégats : 2 discussions d'activité, 2 membres, chacun son créateur ;
--     0 blocage ; 0 activité à venir ; 169 conversations, 22 appartenances ;
--     `events.conv_id` lisible par authenticated — l'identifiant est de toute
--     façon déterministe (`evgrp_<activité>`, exigé par
--     can_join_event_conversation).
--   · le lecteur du canal ① (supabase_read_only_user) n'a ni EXECUTE sur
--     is_conv_member ni SET ROLE authenticated : le comportement ne se mesure PAS
--     au canal ① — seul le verdict ci-dessous le mesure, dans la transaction même
--     de la migration (d'où un verdict fermé sur échec jusqu'à sa ligne 1).
--   · relevé le 2026-11-06 vers 15:00 UTC (canal ①, catalogue) : conv_messages porte
--     trg_rate_limit (BEFORE INSERT, rate_limit_insert('from_id', '60'), SECURITY
--     DEFINER : un comptage), zz_barriere_suppression (BEFORE INSERT OR UPDATE),
--     trg_identifiants_figes (BEFORE UPDATE, conv_id et from_id seulement) et
--     broadcast_conv_message_users_trigger (AFTER INSERT) ; conv_messages_insert_member
--     est sa SEULE policy d'INSERT ; conversations et profiles n'ont aucun déclencheur
--     d'INSERT hors la barrière de suppression.
--
-- MODÈLE DE MENACE : un compte adulte connecté quelconque, qui parle à PostgREST
-- en direct, veut savoir QUI vient à une activité. Depuis C-04 (bloc ⑥), la
-- discussion `evgrp_<activité>` ne contient plus que les venants et
-- l'organisation, et le client y inscrit d'office chaque « je viens »
-- (`_joinEventConversation`) ; `profiles` se lit par tous. Profil par profil,
-- `rpc/is_conv_member` rendait donc la liste des venants de toute activité qui a
-- une discussion — passées comprises —, la voie même que C-04 ⑥ dit fermer (R41).
-- Hors activités, la même RPC disait qui parle avec qui dans un groupe ou une
-- conversation dont on connaît l'identifiant (C-02).
--
-- RV-44 (régression de C-04) : dans une discussion d'activité, la policy SELECT
-- de C-04 masque les membres bloqués avec l'appelant — y compris pour le
-- CRÉATEUR de la discussion. Un DELETE dont le WHERE lit des colonnes applique
-- AUSSI les policies SELECT : « Suppression admin » touchait alors 0 ligne, et
-- le membre bloqué restait membre (il lit et écrit).
--
-- CE QUI CHANGE :
--  ① `is_conv_member` : MÊME signature, mêmes attributs (sql, STABLE, SECURITY
--     DEFINER, search_path vide), mêmes droits (réaffirmés) ; avec une session,
--     l'appartenance n'est rendue QUE pour l'appelant connecté —
--     `(_uid = (auth.uid())::text or auth.uid() is null) and exists(…)`. Pour un
--     autre uid, la réponse est « faux », celle d'un non-membre : plus d'oracle
--     logique. Sans session (postgres, service_role, déclencheur hors requête
--     cliente, tâche planifiée) : inchangée. Chacun des appelants inventoriés lui
--     passe l'appelant (ou un uid égal à l'appelant) : leur résultat ne change pas.
--     L'ORDRE est voulu, et c'est de l'hygiène, pas la fermeture d'un canal : la
--     table de vérité est celle de `exists(…) and (auth.uid() is null or _uid = …)`
--     (`exists` n'est jamais NULL ; `_uid` NULL rend faux dans les deux ordres),
--     mais l'appelant est contrôlé AVANT la lecture — sur autrui, conv_members
--     n'est pas lu du tout (le banc le compte : pg_stat_xact_user_tables), et
--     `_uid = auth.uid()` vient en tête : les policies, qui passent l'appelant,
--     n'évaluent auth.uid() — donc n'analysent le jeton — qu'une fois au lieu de
--     deux. COÛT MESURÉ (banc jetable, PostgreSQL 16.15, 22 appartenances comme en
--     production, identité sous `request.jwt.claims` seul comme PostgREST 12,
--     charge utile d'un jeton Supabase Auth de 578 octets, deux séries de 5 tours) :
--       – un appel sur SOI, la forme des policies : 28 µs au corps de production,
--         85 à 87 µs au lot d'avant (auth.uid() évaluée deux fois), 76 à 82 µs ici ;
--       – une lecture de 40 messages par un membre (la policy de conv_messages
--         appelle la fonction à chaque ligne) : 1 286 à 1 309 µs au corps de
--         production, 1 912 à 1 921 µs (+46 %) au lot d'avant, 1 623 à 1 671 µs
--         (+26 à +28 %) ici — l'analyse du jeton évitée vaut environ 6 µs par ligne.
--     Une fonction SECURITY DEFINER n'est jamais inlinée : son corps se planifie à
--     chaque requête, et ce coût fixe fait l'essentiel de l'écart qui reste avec le
--     corps de production.
--  ② `conv_members_select_member` : le texte de C-04, plus le créateur de la
--     discussion dans la disjonction propre aux discussions d'activité
--     (`or public.is_conversation_creator(conv_id)`), pour authenticated. Le
--     créateur voit tous ses membres, bloqués compris — comme l'organisation voit
--     toute la liste dans `event_attendees_select_lien` (C-04 ①) —, et peut donc
--     les retirer, ce que « Suppression admin » lui accordait déjà. Il doit
--     rester membre : la branche est DANS la conjonction avec is_conv_member (le
--     verdict le mesure, ligne 17 : le créateur qui s'est retiré ne voit plus rien).
--  Rien d'autre ne bouge : les dix autres policies, « Ecriture propre »,
--  « Suppression admin », is_conversation_creator, is_blocked_with,
--  can_join_event_conversation, les droits de table, les déclencheurs.
--
-- RÉSIDU, dit tel quel :
--  · dans `conv_members`, les membres d'une discussion se voient entre eux, sauf
--    blocage (C-04 : « les venants se voient entre eux ») — un venant connaît la
--    liste. HORS de conv_members, le masquage des blocages de C-04 ne vaut PAS : à
--    un membre d'une discussion d'activité, `conv_reads` (reads_select :
--    is_conv_member seul — l'accusé de lecture de chaque membre, user_id compris),
--    les pièces jointes (storage.objects, chemin `<uid de l'auteur>/<conversation>/…`,
--    passio_attachments_read_membre) et la diffusion `typing:` (identifiant de
--    l'émetteur) montrent encore les membres bloqués avec lui. Résidu de C-04,
--    préexistant, hors de ce lot (RV-49) : aligner reads_select sur la disjonction
--    de ② (`and (left(conv_id, 6) <> 'evgrp_' or user_id = (select auth.uid())::text
--    or not public.is_blocked_with(user_id) or public.is_conversation_creator(conv_id))`),
--    avec un banc sur postgres_changes (apply_rls) ;
--  · le créateur d'une discussion d'activité, MÊME s'il n'organise plus
--    (co-organisateur retiré de `co_organizers`), peut y revenir à tout moment
--    (« Ecriture propre » admet le créateur, et is_blocked_with sur soi-même est
--    faux), y voit alors tous les membres — ceux qui l'ont bloqué compris, alors
--    qu'`event_attendees_select_lien` les lui cache —, en ajoute (tout compte non
--    bloqué avec lui) et en retire (« Suppression admin »). Avant ce lot, il
--    pouvait déjà y revenir, ajouter et retirer ; ce lot lui montre en plus les
--    membres bloqués. Remède préféré, HORS de ce lot (RV-50) : une branche qui suit
--    l'organisation plutôt que l'auteur de la ligne conversations —
--    `or (public.is_conversation_creator(conv_id) and public.organise_activite(substr(conv_id, 7)))`
--    —, qui rend exactement la visibilité d'event_attendees ; écartée ici parce que
--    son verdict devrait écrire une activité synthétique en production (events
--    porte trg_events_secret_pointage AFTER INSERT et trg_rate_limit) que le banc
--    ne modélise pas ;
--  · LE TEMPS DE LECTURE d'une ligne de conv_members sous RLS dit si cette ligne
--    existe : `texteq` est leakproof (canal ① : proleakproof vrai), le filtre de
--    l'appelant (`conv_id = … and user_id = …`) passe donc AVANT la policy, qui ne
--    s'évalue que si la ligne existe. Mesuré (même banc jetable ; X, non-membre, lit
--    la ligne d'un membre puis une ligne absente) : +41 à +43 µs au corps de
--    production, +82 à +90 µs au lot d'avant, +88 à +92 µs ici, pour un bruit de 3
--    à 14 µs d'un tour à l'autre. Antérieur au lot et indépendant de l'ordre des
--    conjonctions de ① (aucun ordre ne le ferme ; le corps neuf, plus lent, l'élargit
--    un peu) : c'est une propriété de la RLS de PostgreSQL (canaux cachés), pas de
--    ce corps ; rien n'a été mesuré à travers PostgREST ni en production ;
--  · un rôle client SANS identité (jeton `authenticated` sans `sub` : Supabase
--    Auth n'en émet pas ; `anon` n'a pas EXECUTE) lirait encore toute
--    appartenance par la RPC ; par les policies, `_uid` vaut alors NULL et la
--    réponse est fausse ;
--  · `conv_1a1_bloquee(conv)` (EXECUTE authenticated) dit encore si un compte
--    BLOQUÉ avec l'appelant est membre d'une conversation 1-à-1 donnée
--    (identifiants aléatoires `conv_…` ; jamais une discussion d'activité, qui est
--    un groupe), et `is_blocked_with` reste interrogeable sur tout uid (R40) —
--    hors de ce lot ;
--  · `notifier_mentions` (genre 'message', SECURITY DEFINER) lit conv_members pour
--    chaque compte mentionné et rend le NOMBRE notifié : il suffit d'un message
--    « récent » de l'appelant dans la conversation, sans exiger qu'il en soit
--    encore membre — et un ancien membre peut en avoir un, puisque created_at reste
--    modifiable par son auteur tant qu'il est membre (trg_identifiants_figes ne fige
--    que conv_id et from_id). Mention par mention, il apprendrait donc qui en est
--    membre. MUET aujourd'hui : la fonction lève 42703 (`c.name`, R36) avant cette
--    boucle. À la correction de R36 (`c.group_name`), exiger
--    `public.is_conv_member(p_ref_id, moi)` dans la branche 'message' (appartenance
--    ACTUELLE, qui ne parle que de l'appelant) et figer created_at à l'UPDATE
--    (`identifiants_figes('conv_id', 'from_id', 'created_at')`, ou REVOKE UPDATE
--    (created_at)) ; son banc éprouve un ancien membre (RV-51) ;
--  · is_conv_member reste exécutable par authenticated — les policies
--    s'évaluent sous le rôle de l'appelant et en ont besoin : la RPC ne répond
--    plus qu'à « suis-je membre ? » ;
--  · ce qu'un compte a lu par la RPC avant cette migration, il le garde.
--
-- ORDRE D'APPLICATION : APRÈS `participants_visibilite` (C-04, appliquée le
-- 06/11 à 09:17 UTC) — la ligne 10 du verdict refuse une base où
-- conv_members_select_member n'est pas celle de C-04 (le staging aujourd'hui :
-- y appliquer C-04 D'ABORD, puis ce lot). ⚠️ NE JAMAIS REJOUER
-- `participants_visibilite` EN PRODUCTION APRÈS CE LOT : son bloc ⑥ réécrit
-- conv_members_select_member avec son propre texte (« Rejouable »), et son verdict
-- ne contrôle la policy que par motifs LIKE — RV-44 reviendrait en silence, et sa
-- purge repasserait sur les discussions. Après TOUT geste sur conv_members, mesurer
-- au canal ① le déparsage de la policy (md5 ff0689d9…). Sinon indépendante des
-- autres migrations. INDÉPENDANTE DU CLIENT : aucun client n'appelle
-- is_conv_member, et le correctif de `removeGroupMember`
-- (js/app-05-config-profil.js, même lot) ne dit que ce que le serveur lui a rendu
-- — avant cette migration, un créateur qui retire un membre que C-04 lui cache lit
-- « le retrait n'a pas été confirmé » ; après, le retrait passe. Pas de
-- PREREQUIS-CLIENT.
-- `lock_timeout` de 3 s (RV-42) : la policy prend un verrou ACCESS EXCLUSIVE sur
-- conv_members ; si le rechargement du cache de PostgREST la tient, la migration
-- échoue EN ENTIER au bout de 3 s, sans rien appliquer : la relancer.
--
-- FERMÉ SUR ÉCHEC, JUSQU'À SA PROPRE MESURE, sur le modèle de
-- migration_passion_requests_recursion_2026-11-04.sql. Le tableau a 17 lignes,
-- TOUTES bloquantes. Le COMPORTEMENT (lignes 1 à 9, 16 et 17) se mesure sur un
-- décor SYNTHÉTIQUE dans une sous-transaction ANNULÉE : trois profils de comptes
-- inventés (`00000000-0000-4000-8000-00000000c2a1` à `…c2a3`, plus `…c2a4` qui
-- n'est membre de rien), une discussion `evgrp_zz-verdict-c02-<aléa>` créée par
-- K (membres K, A, W), un groupe ordinaire `zz-verdict-c02-<aléa>` créé par A
-- (membres A, W ; K n'en est PAS : le témoin négatif), une conversation 1-à-1
-- `conv_zz-verdict-c02-<aléa>` (A et W), deux blocages (K a bloqué W, W a bloqué
-- A) ; puis `set local role authenticated` et l'identité de chacun
-- (`request.jwt.claim.sub` ET `request.jwt.claims` ; puis `request.jwt.claims`
-- seul, claim.sub vide et relevé — la forme de PostgREST 12). CHAQUE mesure faite
-- sous authenticated a son propre bloc : une erreur — celle du correctif
-- compris (42P17 d'une policy récursive, 54001 d'une fonction qui se rappelle) —
-- s'écrit en SQLSTATE dans SA clé, et sa ligne passe en ECHEC. Le décor pose
-- `decor = ok` et le bloc la `phase` en cours : la ligne 1 exige un décor
-- construit, toutes les mesures présentes, ni erreur ni rôle inattendu — et elle
-- BLOQUE aussi : un décor en panne fait relancer la migration après diagnostic,
-- jamais l'appliquer à l'aveugle (personne ne pourra mesurer après coup). Le
-- CATALOGUE (lignes 10 à 15) dit si la base est celle que ce correctif suppose.
-- Une ligne en ECHEC LÈVE une exception avant `commit;` (SQLSTATE 55000, lignes
-- nommées) : RIEN n'est appliqué, ni le correctif, ni une trace du décor, ni la
-- ligne de journal de l'outil.
-- ⚠️ LES DÉCLENCHEURS DU DÉCOR, dits tels quels : `trg_diffuser_ajout_membre`
-- appelle `realtime.send` pour chaque appartenance synthétique (topic
-- `user:<uuid inventé>`) — l'insertion dans realtime.messages est annulée avec
-- la sous-transaction, et le décodage logique — par lequel Realtime lit
-- realtime.messages et la publication dont profiles fait partie — ne rend jamais
-- une sous-transaction annulée : RIEN n'est livré, à personne (aucun compte n'a
-- ces uuid ; le banc le prouve sur un slot logique, témoin positif compris) ;
-- `realtime.send` y pose aussi `realtime.topic` en local, rendu par l'annulation.
-- `zz_barriere_suppression` (profiles, conv_members, blocks, conv_messages) ne
-- refuse rien : aucun compte synthétique n'est en suppression.
-- `trg_rid_opaque` tire un `rid`, annulé avec le reste. Le message que K tente
-- d'écrire dans le groupe dont il n'est pas membre passe par trg_rate_limit (un
-- comptage) et la barrière, puis la WITH CHECK le refuse (42501) AVANT tout
-- déclencheur AFTER : rien n'est diffusé.
--
-- APRÈS APPLICATION — mesurer au canal ①, jamais ce tableau : md5(prosrc)
-- d'is_conv_member = celui de la ligne 11, attributs et ACL ; déparsage de
-- conv_members_select_member (md5 ff0689d9…, `public.` ôté) ; pg_depend (11
-- policies dépendent toujours d'is_conv_member) ; aucune ligne `%zz-verdict-c02%`
-- dans conversations ni conv_messages, aucun profil `00000000-0000-4000-8000-00000000c2a_` ;
-- postgres_logs sans erreur nouvelle sur conv_members, conv_messages, conv_reads,
-- realtime.messages ou storage.objects ; la « Barrière RLS de la production »
-- (authz-critical) du prochain run de `main` verte.
--
-- Rejouable ; banc : tests/sql/migration-discussions-activite.test.sh.
-- RETOUR ARRIÈRE — exécutable tel quel en ôtant « --| » (le banc le rejoue et
-- contrôle les empreintes) : il rend À L'OCTET le corps de production
-- d'is_conv_member (md5 da6bf4bb…, une espace en tête et une en fin de corps,
-- entre les `$function$`) et la policy telle que C-04 l'a laissée (déparsage
-- md5 de15394b…). Il rend AUSSI les deux défauts (C-02 / R41, RV-44). Par
-- scripts/appliquer-migration.mjs, il demande un fichier sous migrations/
-- attesté ; dans l'éditeur SQL, il se colle tel quel et rend deux lignes OK.
--| begin;
--| set local lock_timeout = '3s';
--| create or replace function public.is_conv_member(_conv_id text, _uid text)
--|  returns boolean
--|  language sql
--|  stable security definer
--|  set search_path to ''
--| as $function$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $function$;
--| revoke all on function public.is_conv_member(text, text) from public, anon;
--| grant execute on function public.is_conv_member(text, text) to authenticated, service_role;
--| drop policy if exists conv_members_select_member on public.conv_members;
--| create policy conv_members_select_member on public.conv_members
--|   for select to authenticated
--|   using (
--|     public.is_conv_member(conv_id, (select auth.uid())::text)
--|     and (
--|       left(conv_id, 6) <> 'evgrp_'
--|       or user_id = (select auth.uid())::text
--|       or not public.is_blocked_with(conv_members.user_id)
--|     )
--|   );
--| select 'is_conv_member : corps de production à l''octet' as controle,
--|        case when (select md5(p.prosrc) from pg_catalog.pg_proc p where p.oid = to_regprocedure('public.is_conv_member(text,text)'))
--|                  = 'da6bf4bb1054d608cbb0f246d70ddb39' then 'OK' else 'ECHEC' end as valeur
--| union all select 'conv_members_select_member : texte de C-04',
--|        case when (select md5(regexp_replace(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '\mpublic\.', '', 'g')) from pg_catalog.pg_policy p
--|                    where p.polrelid = 'public.conv_members'::regclass and p.polname = 'conv_members_select_member')
--|                  = 'de15394b190609eb2ae3302f7710dd18' then 'OK' else 'ECHEC' end;
--| commit;
-- ═══════════════════════════════════════════════════════════════════════════
begin;

set local lock_timeout = '3s';

-- ── ⓪ L'ÉTAT D'AVANT, relevé AVANT toute écriture (ligne 10 du verdict) ──
create temp table passio_c02_avant on commit drop as
select (select md5(replace(p.prosrc, chr(13) || chr(10), chr(10)))
          from pg_catalog.pg_proc p
         where p.oid = to_regprocedure('public.is_conv_member(text,text)')) as md5_fonction,
       (select md5(regexp_replace(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '\mpublic\.', '', 'g'))
          from pg_catalog.pg_policy p
         where p.polrelid = 'public.conv_members'::regclass and p.polname = 'conv_members_select_member') as md5_policy;

-- ── ① L'APPARTENANCE NE SE LIT PLUS SUR AUTRUI (C-02, R41) ──
create or replace function public.is_conv_member(_conv_id text, _uid text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $fn$
  -- C-02 / R41 (2026-11-06) : avec une session, l'appartenance ne se lit que
  -- sur l'appelant ; sans session (postgres, service_role, déclencheur hors
  -- requête cliente), inchangée. L'appelant est contrôlé AVANT la lecture : sur
  -- autrui, conv_members n'est pas lu ; et l'égalité vient en tête : les
  -- policies, qui passent l'appelant, n'évaluent auth.uid() qu'une fois.
  -- migrations/migration_discussions_activite_2026-11-06.sql
  select (_uid = (auth.uid())::text or auth.uid() is null)
     and exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid)
$fn$;
revoke all on function public.is_conv_member(text, text) from public, anon;
grant execute on function public.is_conv_member(text, text) to authenticated, service_role;

-- ── ② LE CRÉATEUR D'UNE DISCUSSION EN VOIT — DONC EN RETIRE — TOUS LES MEMBRES (RV-44) ──
drop policy if exists conv_members_select_member on public.conv_members;
create policy conv_members_select_member on public.conv_members
  for select to authenticated
  using (
    public.is_conv_member(conv_id, (select auth.uid())::text)
    and (
      left(conv_id, 6) <> 'evgrp_'
      or user_id = (select auth.uid())::text
      or not public.is_blocked_with(conv_members.user_id)
      -- RV-44 : le créateur voit tous ses membres, bloqués compris — il peut les
      -- retirer (« Suppression admin »), comme l'organisation voit toute la liste.
      or public.is_conversation_creator(conv_id)
    )
  );

-- ── ③ LE COMPORTEMENT, MESURÉ : un décor synthétique, une sous-transaction ANNULÉE ──
-- Le décor s'écrit SANS session ; puis le rôle CLIENT, aux identités simulées,
-- lit, écrit et retire — chaque mesure dans SON bloc : une erreur (celle du
-- correctif comprise) s'écrit en SQLSTATE dans sa clé au lieu d'interrompre les
-- autres mesures. Le bloc finit en levant `passio_verdict_annule` : la
-- sous-transaction est annulée — rôle, réglages de session (`realtime.topic`
-- compris) et écritures des déclencheurs avec elle. Seules les mesures, tenues
-- dans des variables, survivent : posées en réglage de transaction
-- (`passio.verdict_discussions_activite`), elles nourrissent le tableau. Une
-- erreur qui échappe aux blocs de mesure (le décor lui-même, le changement
-- d'identité) s'écrit en `erreur`, avec la `phase` où elle est survenue : la
-- ligne 1 passe en ECHEC, et elle BLOQUE.
do $verdict$
declare
  k     constant text := '00000000-0000-4000-8000-00000000c2a1';   -- crée la discussion d'activité ; a bloqué W ; membre d'elle seule
  a     constant text := '00000000-0000-4000-8000-00000000c2a2';   -- membre des trois ; W l'a bloqué ; crée le groupe et la 1-à-1
  w     constant text := '00000000-0000-4000-8000-00000000c2a3';   -- membre des trois ; bloqué par K, a bloqué A
  n     constant text := '00000000-0000-4000-8000-00000000c2a4';   -- membre de rien (aucune ligne, aucun profil)
  role0 constant text := current_user;                            -- le rôle de la migration
  sel   constant text := left(md5(clock_timestamp()::text || random()::text), 10);
  ga    constant text := 'evgrp_zz-verdict-c02-' || sel;           -- « discussion d'activité » : la policy ne lit que le préfixe
  go    constant text := 'zz-verdict-c02-' || sel;                 -- groupe ordinaire (K n'en est pas membre)
  gu    constant text := 'conv_zz-verdict-c02-' || sel;            -- conversation 1-à-1 (is_group faux)
  roles jsonb := '{}'::jsonb;
  mes   jsonb := '{}'::jsonb;
  n_ret integer;
begin
  begin
    mes := mes || jsonb_build_object('phase', 'décor');
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.profiles (id, username)
      values (k, 'zz-verdict-c02-k-' || sel), (a, 'zz-verdict-c02-a-' || sel), (w, 'zz-verdict-c02-w-' || sel);
    insert into public.conversations (id, is_group, group_name, created_by)
      values (ga, true, 'zz verdict C-02', k), (go, true, 'zz verdict C-02', a), (gu, false, null, a);
    insert into public.conv_members (conv_id, user_id)
      values (ga, k), (ga, a), (ga, w), (go, a), (go, w), (gu, a), (gu, w);
    insert into public.blocks (blocker_id, blocked_id) values (k, w), (w, a);
    mes := mes || jsonb_build_object('decor', 'ok', 'phase', 'sans session');

    -- s. SANS session : la réponse porte sur tout uid, comme avant.
    roles := roles || jsonb_build_object('s', jsonb_build_array(current_user::text, (auth.uid())::text));
    begin
      mes := mes || jsonb_build_object('sans_session', jsonb_build_array(public.is_conv_member(ga, w),
        public.is_conv_member(go, w), public.is_conv_member(gu, w), public.is_conv_member(ga, n)));
    exception when others then mes := mes || jsonb_build_object('sans_session', left(sqlstate || ' ' || sqlerrm, 120));
    end;

    -- a. A, connecté (claim.sub ET claims) : sur lui-même, sur autrui ; ce qu'il lit.
    mes := mes || jsonb_build_object('phase', 'client A');
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', a, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
    roles := roles || jsonb_build_object('a', jsonb_build_array(current_user::text, (auth.uid())::text));
    begin
      mes := mes || jsonb_build_object('a_soi', jsonb_build_array(public.is_conv_member(ga, a),
        public.is_conv_member(go, a), public.is_conv_member(gu, a)));
    exception when others then mes := mes || jsonb_build_object('a_soi', left(sqlstate || ' ' || sqlerrm, 120));
    end;
    begin
      mes := mes || jsonb_build_object('a_autrui', jsonb_build_array(public.is_conv_member(ga, w), public.is_conv_member(ga, k),
        public.is_conv_member(go, w), public.is_conv_member(gu, w), public.is_conv_member(ga, n)));
    exception when others then mes := mes || jsonb_build_object('a_autrui', left(sqlstate || ' ' || sqlerrm, 120));
    end;
    begin
      mes := mes || jsonb_build_object('a_conversations', (select count(*) from public.conversations c where c.id in (ga, go, gu)));
    exception when others then mes := mes || jsonb_build_object('a_conversations', left(sqlstate || ' ' || sqlerrm, 120));
    end;
    begin
      mes := mes || jsonb_build_object('a_voit_ga', (select coalesce(string_agg(x.l, ',' order by x.l), '') from (
                     select case m.user_id when k then 'K' when a then 'A' when w then 'W' else '?' end as l
                       from public.conv_members m where m.conv_id = ga) x));
    exception when others then mes := mes || jsonb_build_object('a_voit_ga', left(sqlstate || ' ' || sqlerrm, 120));
    end;
    begin
      mes := mes || jsonb_build_object('a_voit_go', (select coalesce(string_agg(x.l, ',' order by x.l), '') from (
                     select case m.user_id when k then 'K' when a then 'A' when w then 'W' else '?' end as l
                       from public.conv_members m where m.conv_id = go) x));
    exception when others then mes := mes || jsonb_build_object('a_voit_go', left(sqlstate || ' ' || sqlerrm, 120));
    end;

    -- a2. A sous `request.jwt.claims` SEUL (claim.sub vide, relevé) : la forme de PostgREST 12.
    perform set_config('request.jwt.claim.sub', '', true);
    roles := roles || jsonb_build_object('a2', jsonb_build_array(current_user::text, (auth.uid())::text,
               coalesce(current_setting('request.jwt.claim.sub', true), '(absent)')));
    begin
      mes := mes || jsonb_build_object('a2', jsonb_build_array(public.is_conv_member(ga, a), public.is_conv_member(ga, w)));
    exception when others then mes := mes || jsonb_build_object('a2', left(sqlstate || ' ' || sqlerrm, 120));
    end;

    -- w. W, bloqué par K, qui a bloqué A : ce qu'il lit de la discussion et du groupe.
    mes := mes || jsonb_build_object('phase', 'client W');
    perform set_config('request.jwt.claim.sub', w, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', w, 'role', 'authenticated')::text, true);
    roles := roles || jsonb_build_object('w', jsonb_build_array(current_user::text, (auth.uid())::text));
    begin
      mes := mes || jsonb_build_object('w_voit_ga', (select coalesce(string_agg(x.l, ',' order by x.l), '') from (
                     select case m.user_id when k then 'K' when a then 'A' when w then 'W' else '?' end as l
                       from public.conv_members m where m.conv_id = ga) x));
    exception when others then mes := mes || jsonb_build_object('w_voit_ga', left(sqlstate || ' ' || sqlerrm, 120));
    end;
    begin
      mes := mes || jsonb_build_object('w_voit_go', (select coalesce(string_agg(x.l, ',' order by x.l), '') from (
                     select case m.user_id when k then 'K' when a then 'A' when w then 'W' else '?' end as l
                       from public.conv_members m where m.conv_id = go) x));
    exception when others then mes := mes || jsonb_build_object('w_voit_go', left(sqlstate || ' ' || sqlerrm, 120));
    end;

    -- k. K, le créateur : ce qu'il voit de sa discussion ; le TÉMOIN NÉGATIF (le
    -- groupe dont il n'est pas membre : ni appartenance, ni conversation, ni
    -- membres, ni écriture) ; le retrait de W par la requête même de
    -- `removeGroupMember` (DELETE … RETURNING user_id) ; puis il se retire
    -- lui-même (« Quitter ») et ne voit plus rien.
    mes := mes || jsonb_build_object('phase', 'client K');
    perform set_config('request.jwt.claim.sub', k, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', k, 'role', 'authenticated')::text, true);
    roles := roles || jsonb_build_object('k', jsonb_build_array(current_user::text, (auth.uid())::text));
    begin
      mes := mes || jsonb_build_object('k_voit_ga', (select coalesce(string_agg(x.l, ',' order by x.l), '') from (
                     select case m.user_id when k then 'K' when a then 'A' when w then 'W' else '?' end as l
                       from public.conv_members m where m.conv_id = ga) x));
    exception when others then mes := mes || jsonb_build_object('k_voit_ga', left(sqlstate || ' ' || sqlerrm, 120));
    end;
    begin
      mes := mes || jsonb_build_object('k_icm_go', public.is_conv_member(go, k));
    exception when others then mes := mes || jsonb_build_object('k_icm_go', left(sqlstate || ' ' || sqlerrm, 120));
    end;
    begin
      mes := mes || jsonb_build_object('k_conv_go', (select count(*) from public.conversations c where c.id = go));
    exception when others then mes := mes || jsonb_build_object('k_conv_go', left(sqlstate || ' ' || sqlerrm, 120));
    end;
    begin
      mes := mes || jsonb_build_object('k_membres_go', (select count(*) from public.conv_members m where m.conv_id = go));
    exception when others then mes := mes || jsonb_build_object('k_membres_go', left(sqlstate || ' ' || sqlerrm, 120));
    end;
    begin
      insert into public.conv_messages (id, conv_id, from_id, content) values ('zz-verdict-c02-' || sel, go, k, 'zz verdict C-02');
      mes := mes || jsonb_build_object('k_ecrit_go', 'accepté');
    exception when others then mes := mes || jsonb_build_object('k_ecrit_go', left(sqlstate || ' ' || sqlerrm, 120));
    end;
    begin
      with retrait as (delete from public.conv_members m where m.conv_id = ga and m.user_id = w returning m.user_id)
      select count(*) into n_ret from retrait;
      mes := mes || jsonb_build_object('k_retire', n_ret);
    exception when others then mes := mes || jsonb_build_object('k_retire', left(sqlstate || ' ' || sqlerrm, 120));
    end;
    begin
      with sortie as (delete from public.conv_members m where m.conv_id = ga and m.user_id = k returning m.user_id)
      select count(*) into n_ret from sortie;
      mes := mes || jsonb_build_object('k_sort', n_ret);
    exception when others then mes := mes || jsonb_build_object('k_sort', left(sqlstate || ' ' || sqlerrm, 120));
    end;
    begin
      mes := mes || jsonb_build_object('k_voit_apres', (select coalesce(string_agg(x.l, ',' order by x.l), '') from (
                     select case m.user_id when k then 'K' when a then 'A' when w then 'W' else '?' end as l
                       from public.conv_members m where m.conv_id = ga) x));
    exception when others then mes := mes || jsonb_build_object('k_voit_apres', left(sqlstate || ' ' || sqlerrm, 120));
    end;

    -- Le rôle et l'identité de la migration, rendus AVANT l'annulation (qui les
    -- rendrait aussi) ; puis, sans session, ce qui reste de W dans la discussion.
    mes := mes || jsonb_build_object('phase', 'relevé final');
    perform set_config('role', role0, true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    begin
      mes := mes || jsonb_build_object('w_reste_membre',
        (select count(*) from public.conv_members m where m.conv_id = ga and m.user_id = w));
    exception when others then mes := mes || jsonb_build_object('w_reste_membre', left(sqlstate || ' ' || sqlerrm, 120));
    end;
    raise exception using errcode = 'P0001', message = 'passio_verdict_annule';
  exception when others then
    if sqlerrm is distinct from 'passio_verdict_annule' then
      mes := mes || jsonb_build_object('erreur', left(sqlstate || ' ' || sqlerrm, 160));
    end if;
  end;
  mes := mes || jsonb_build_object('roles', roles);
  -- Après l'annulation (rôle de la migration rendu) : rien ne doit rester du
  -- décor — ni ses lignes, ni le message refusé, ni les poussées que
  -- trg_diffuser_ajout_membre a écrites dans realtime.messages.
  begin
    mes := mes || jsonb_build_object('restes',
        (select count(*) from public.profiles p where p.id in (k, a, w, n))
      + (select count(*) from public.conversations c where c.id in (ga, go, gu))
      + (select count(*) from public.conv_members m where m.conv_id in (ga, go, gu) or m.user_id in (k, a, w, n))
      + (select count(*) from public.conv_messages m where m.conv_id in (ga, go, gu) or m.from_id in (k, a, w, n))
      + (select count(*) from public.blocks b where b.blocker_id in (k, a, w, n) or b.blocked_id in (k, a, w, n))
      + (select count(*) from realtime.messages r where r.topic in ('user:' || k, 'user:' || a, 'user:' || w, 'user:' || n)));
  exception when others then
    mes := mes || jsonb_build_object('restes', 'illisible ' || sqlstate);
  end;
  perform set_config('passio.verdict_discussions_activite', mes::text, true);
end
$verdict$;

-- ── ④ LE TABLEAU, relevé UNE fois : 17 lignes dans une table temporaire détruite
-- au commit, lues par le garde-fou ⑤ et par le verdict. Les lignes 1 à 9, 16 et
-- 17 lisent les mesures du bloc ③ (hors de cette transaction : « mesure absente »,
-- aucun OK sans mesure) ; les lignes 10 à 15, le catalogue. Toutes sont
-- bloquantes (`bloquant` = « oui ») : la mesure elle-même (1) comprise. Une ligne
-- en ECHEC dit ce qu'elle a lu (valeurs synthétiques, SQLSTATE).
-- ⚠️ `pg_get_expr` ouvre la table qu'il déparse (verrou de lecture) : il n'est
-- appelé que sur conv_members, reports et les policies qui dépendent
-- d'is_conv_member (pg_depend), jamais sur tout le catalogue.
create temp table passio_c02_verdict on commit drop as
with v as (select coalesce(nullif(current_setting('passio.verdict_discussions_activite', true), ''), '{}')::jsonb as j),
     dep as materialized (
       select n.nspname || '.' || c.relname || '·' || pol.polname as nom,
              coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
              coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '') as expr
         from pg_catalog.pg_depend d
         join pg_catalog.pg_policy pol on pol.oid = d.objid
         join pg_catalog.pg_class c on c.oid = pol.polrelid
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where d.classid = 'pg_catalog.pg_policy'::regclass
          and d.refclassid = 'pg_catalog.pg_proc'::regclass
          and d.refobjid = to_regprocedure('public.is_conv_member(text,text)'))
select 1 as n, 'oui'::text as bloquant,
       'mesure exécutée : le décor sans identité, puis A, W et K sous authenticated (rôle et identité relevés), A une seconde fois sous request.jwt.claims seul (claim.sub vide, relevé) — chaque mesure dans son bloc, sous-transaction ANNULÉE ; un décor en panne BLOQUE (relancer après diagnostic, jamais appliquer sans mesure)'::text as controle,
       (select case when j ? 'erreur' then 'ECHEC — ' || coalesce(j->>'phase', '?') || ' : ' || (j->>'erreur')
                    when j->>'decor' is distinct from 'ok' then 'ECHEC — décor non construit, mesure absente'
                    when not (j ?& array['sans_session', 'a_soi', 'a_autrui', 'a_conversations', 'a_voit_ga', 'a_voit_go', 'a2',
                                         'w_voit_ga', 'w_voit_go', 'k_voit_ga', 'k_icm_go', 'k_conv_go', 'k_membres_go', 'k_ecrit_go',
                                         'k_retire', 'k_sort', 'k_voit_apres', 'w_reste_membre', 'restes'])
                         then 'ECHEC — mesure incomplète'
                    when coalesce(j->'roles'->'s'->>1 is null and j->'roles'->'s'->>0 not in ('anon', 'authenticated')
                         and j->'roles'->'a' = '["authenticated", "00000000-0000-4000-8000-00000000c2a2"]'::jsonb
                         and j->'roles'->'a2' = '["authenticated", "00000000-0000-4000-8000-00000000c2a2", ""]'::jsonb
                         and j->'roles'->'w' = '["authenticated", "00000000-0000-4000-8000-00000000c2a3"]'::jsonb
                         and j->'roles'->'k' = '["authenticated", "00000000-0000-4000-8000-00000000c2a1"]'::jsonb, false) then 'OK'
                    else 'ECHEC — mesure sous un autre rôle ou une autre identité : ' || coalesce((j->'roles')::text, '?') end from v) as valeur
union all select 2, 'oui', 'L''ORACLE EST FERMÉ (C-02, R41) : A, connecté, interroge W et K (membres de la discussion d''activité), W (membre du groupe ordinaire et de leur conversation 1-à-1), N (membre de rien) — faux cinq fois, la réponse d''un non-membre',
       (select case when j->'a_autrui' = '[false, false, false, false, false]'::jsonb then 'OK'
                    else 'ECHEC — ' || coalesce((j->'a_autrui')::text, 'mesure absente') end from v)
union all select 3, 'oui', 'sa PROPRE appartenance se lit toujours : A, vrai sur les trois conversations — et les policies qui la lui demandent tiennent (il lit les trois conversations)',
       (select case when j->'a_soi' = '[true, true, true]'::jsonb and j->>'a_conversations' = '3' then 'OK'
                    else 'ECHEC — ' || coalesce((j->'a_soi')::text, 'mesure absente') || ' ; ' || coalesce(j->>'a_conversations', 'mesure absente') end from v)
union all select 4, 'oui', 'même réponse sous request.jwt.claims SEUL (claim.sub vide, la forme de PostgREST 12) : A sur lui-même vrai, sur W faux',
       (select case when j->'a2' = '[true, false]'::jsonb then 'OK'
                    else 'ECHEC — ' || coalesce((j->'a2')::text, 'mesure absente') end from v)
union all select 5, 'oui', 'SANS session (le rôle de la migration : déclencheurs, service_role, administration) : inchangée — W membre de la discussion, du groupe et de la 1-à-1 vrai, N faux',
       (select case when j->'sans_session' = '[true, true, true, false]'::jsonb then 'OK'
                    else 'ECHEC — ' || coalesce((j->'sans_session')::text, 'mesure absente') end from v)
union all select 6, 'oui', 'RV-44 : le créateur K voit les trois membres de sa discussion d''activité, W — qu''il a bloqué — compris',
       (select case when j->>'k_voit_ga' = 'A,K,W' then 'OK'
                    else 'ECHEC — ' || coalesce(j->>'k_voit_ga', 'mesure absente') end from v)
union all select 7, 'oui', '…et le RETIRE : son DELETE … RETURNING user_id (la requête de removeGroupMember) touche 1 ligne, W n''est plus membre',
       (select case when j->>'k_retire' = '1' and j->>'w_reste_membre' = '0' then 'OK'
                    else 'ECHEC — ' || coalesce(j->>'k_retire', 'mesure absente') || ' ; ' || coalesce(j->>'w_reste_membre', 'mesure absente') end from v)
union all select 8, 'oui', 'C-04 tient pour les autres membres : A (que W a bloqué) ne voit pas W, W ne voit que lui-même ; dans le groupe ordinaire, A et W se voient',
       (select case when j->>'a_voit_ga' = 'A,K' and j->>'w_voit_ga' = 'W'
                         and j->>'a_voit_go' = 'A,W' and j->>'w_voit_go' = 'A,W' then 'OK'
                    else 'ECHEC — ' || concat_ws(' ; ', coalesce(j->>'a_voit_ga', 'absente'), coalesce(j->>'w_voit_ga', 'absente'),
                                                       coalesce(j->>'a_voit_go', 'absente'), coalesce(j->>'w_voit_go', 'absente')) end from v)
union all select 9, 'oui', 'aucune trace du décor : profils, conversations, appartenances, message refusé, blocages, et les poussées de trg_diffuser_ajout_membre dans realtime.messages (sous-transaction annulée)',
       (select case when j->>'restes' = '0' then 'OK'
                    else 'ECHEC — ' || coalesce(j->>'restes', 'mesure absente') end from v)
union all select 10, 'oui', 'la base était celle que ce correctif suppose : AVANT la migration, is_conv_member portait le corps de production (md5 da6bf4bb…) ou déjà celui-ci, conv_members_select_member le texte de C-04 (md5 de15394b…) ou déjà celui-ci',
       case when (select a.md5_fonction from pg_temp.passio_c02_avant a) in ('da6bf4bb1054d608cbb0f246d70ddb39', '814ad66c9ba408db34f3435b2a559788')
             and (select a.md5_policy from pg_temp.passio_c02_avant a) in ('de15394b190609eb2ae3302f7710dd18', 'ff0689d95ce3bf5fe1a987763b088f32')
            then 'OK' else 'ECHEC' end
union all select 11, 'oui', 'is_conv_member(text, text) : boolean, language sql, STABLE, SECURITY DEFINER, search_path vide, ni STRICT ni LEAKPROOF, PARALLEL UNSAFE, corps de cette migration à l''octet (md5, fins de ligne normalisées)',
       case when exists (select 1 from pg_catalog.pg_proc p
                          where p.oid = to_regprocedure('public.is_conv_member(text,text)')
                            and p.prorettype = 'boolean'::regtype and not p.proretset
                            and p.prolang = (select l.oid from pg_catalog.pg_language l where l.lanname = 'sql')
                            and p.provolatile = 's' and p.prosecdef and not p.proisstrict and not p.proleakproof
                            and p.proparallel = 'u'
                            and array_to_string(p.proconfig, ';') = 'search_path=""'
                            and md5(replace(p.prosrc, chr(13) || chr(10), chr(10))) = '814ad66c9ba408db34f3435b2a559788')
            then 'OK' else 'ECHEC' end
union all select 12, 'oui', 'is_conv_member : EXECUTE pour postgres, authenticated et service_role exactement — ni PUBLIC, ni anon',
       case when (select string_agg(x.d, ',' order by x.d collate "C") from (
                    select case when a.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end || ':' || a.privilege_type as d
                      from pg_catalog.pg_proc p cross join lateral aclexplode(p.proacl) a
                     where p.oid = to_regprocedure('public.is_conv_member(text,text)')) x)
                 = 'authenticated:EXECUTE,postgres:EXECUTE,service_role:EXECUTE'
             and not has_function_privilege('anon', 'public.is_conv_member(text,text)', 'EXECUTE')
            then 'OK' else 'ECHEC' end
union all select 13, 'oui', 'conv_members_select_member : FOR SELECT TO authenticated, permissive, le texte de C-04 plus le créateur (déparsage exact) ; seule policy de lecture de conv_members, qui en porte trois — « Ecriture propre » et « Suppression admin » à l''empreinte de production ; RLS active ; et les fonctions que la policy appelle — is_blocked_with et is_conversation_creator (SECURITY DEFINER), auth.uid() — au corps de production (md5)',
       case when exists (select 1 from pg_catalog.pg_policy p
                          where p.polrelid = 'public.conv_members'::regclass and p.polname = 'conv_members_select_member'
                            and p.polcmd = 'r' and p.polpermissive and p.polwithcheck is null
                            and p.polroles = array[(select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')]
                            and regexp_replace(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '\mpublic\.', '', 'g')
                                = '(is_conv_member(conv_id, (( SELECT auth.uid() AS uid))::text) AND (("left"(conv_id, 6) <> ''evgrp_''::text) OR (user_id = (( SELECT auth.uid() AS uid))::text) OR (NOT is_blocked_with(user_id)) OR is_conversation_creator(conv_id)))')
             and (select count(*) from pg_catalog.pg_policy p where p.polrelid = 'public.conv_members'::regclass) = 3
             and (select count(*) from pg_catalog.pg_policy p where p.polrelid = 'public.conv_members'::regclass and p.polcmd in ('r', '*')) = 1
             and (select md5(regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') || '#' || coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''), '\mpublic\.', '', 'g'))
                    from pg_catalog.pg_policy p where p.polrelid = 'public.conv_members'::regclass and p.polname = 'Suppression admin' and p.polcmd = 'd')
                 = 'bb42c1faff2d67c91d4a543a2ff792cc'
             and (select md5(regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') || '#' || coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''), '\mpublic\.', '', 'g'))
                    from pg_catalog.pg_policy p where p.polrelid = 'public.conv_members'::regclass and p.polname = 'Ecriture propre' and p.polcmd = 'a')
                 = '794401e094cc31423de0c9cf746fdf77'
             and (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.conv_members'::regclass)
             and (select md5(replace(p.prosrc, chr(13) || chr(10), chr(10))) from pg_catalog.pg_proc p
                   where p.oid = to_regprocedure('public.is_blocked_with(text)') and p.prosecdef) = '25b7ca8e81031951cb241316f7cfdd64'
             and (select md5(replace(p.prosrc, chr(13) || chr(10), chr(10))) from pg_catalog.pg_proc p
                   where p.oid = to_regprocedure('public.is_conversation_creator(text)') and p.prosecdef) = '04b54df0075ee2131a307795ca92d31c'
             and (select md5(replace(p.prosrc, chr(13) || chr(10), chr(10))) from pg_catalog.pg_proc p
                   where p.oid = to_regprocedure('auth.uid()')) = 'cdef18c69c4f4cbbced2eaf81e628b49'
            then 'OK' else 'ECHEC' end
union all select 14, 'oui', 'ses appelants lui passent l''appelant : les 11 policies qui dépendent d''is_conv_member (pg_depend) sont celles de production et ne lui donnent pour second argument que (select auth.uid())::text ; les deux seules fonctions qui la citent, storage_chemin_autorise et trg_reports_preuve_message, ont leur corps de production (md5)',
       case when (select string_agg(dep.nom, ',' order by dep.nom collate "C") from dep)
                 = 'public.conv_members·conv_members_select_member,public.conv_messages·Update propre,public.conv_messages·conv_messages_insert_member,public.conv_messages·conv_messages_select_member,public.conv_reads·reads_select,public.conv_reads·reads_update,public.conv_reads·reads_upsert,public.conversations·conversations_select_member,realtime.messages·passio_rt_emettre,realtime.messages·passio_rt_recevoir,storage.objects·passio_attachments_read_membre'
             and not exists (select 1 from dep
                              where regexp_replace(dep.expr,
                                      'is_conv_member\((conv_id|id|substr\(realtime\.topic\(\), [0-9]+\)|\(storage\.foldername\(name\)\)\[2\]), \(\( SELECT auth\.uid\(\) AS uid\)\)::text\)',
                                      '', 'g') ~ 'is_conv_member\(')
             and (select count(*) from pg_catalog.pg_proc p where p.prosrc ilike '%is\_conv\_member%') = 2
             and (select md5(replace(p.prosrc, chr(13) || chr(10), chr(10))) from pg_catalog.pg_proc p
                   where p.oid = to_regprocedure('public.storage_chemin_autorise(text,text)')) = '0ab32680a710a7f4f04783459337386f'
             and (select md5(replace(p.prosrc, chr(13) || chr(10), chr(10))) from pg_catalog.pg_proc p
                   where p.oid = to_regprocedure('public.trg_reports_preuve_message()')) = '816c7ac73b5a948c99ee15c212e34810'
            then 'OK' else 'ECHEC' end
union all select 15, 'oui', 'trg_reports_preuve_message est AFTER INSERT sur reports, par ligne, actif ; reports_insert, seule policy d''écriture de reports (RLS active), lie reporter_id à l''appelant — c''est ce qui rend juste son appel sur new.reporter_id',
       case when exists (select 1 from pg_catalog.pg_trigger t
                          where t.tgrelid = 'public.reports'::regclass and t.tgname = 'trg_reports_preuve_message'
                            and not t.tgisinternal and t.tgenabled in ('O', 'A') and t.tgtype = 5
                            and t.tgfoid = to_regprocedure('public.trg_reports_preuve_message()'))
             and exists (select 1 from pg_catalog.pg_policy p
                          where p.polrelid = 'public.reports'::regclass and p.polname = 'reports_insert'
                            and p.polcmd = 'a' and p.polpermissive and p.polqual is null
                            and regexp_replace(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '\mpublic\.', '', 'g')
                                = '(reporter_id = (( SELECT auth.uid() AS uid))::text)')
             and (select count(*) from pg_catalog.pg_policy p where p.polrelid = 'public.reports'::regclass and p.polcmd in ('a', '*')) = 1
             and (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.reports'::regclass)
            then 'OK' else 'ECHEC' end
union all select 16, 'oui', 'TÉMOIN NÉGATIF : K, connecté, n''est PAS membre du groupe ordinaire — is_conv_member faux sur lui-même, 0 conversation, 0 appartenance lue, et son message y est REFUSÉ par la RLS (42501) : un corps qui ferait de tout compte connecté le membre de tout ne passe pas',
       (select case when j->>'k_icm_go' = 'false' and j->>'k_conv_go' = '0' and j->>'k_membres_go' = '0'
                         and j->>'k_ecrit_go' like '42501 new row violates row-level security policy%' then 'OK'
                    else 'ECHEC — ' || concat_ws(' ; ', coalesce(j->>'k_icm_go', 'absente'), coalesce(j->>'k_conv_go', 'absente'),
                                                       coalesce(j->>'k_membres_go', 'absente'), coalesce(j->>'k_ecrit_go', 'absente')) end from v)
union all select 17, 'oui', 'le créateur doit RESTER membre : K se retire lui-même (« Suppression admin », user_id = lui), puis ne voit plus rien de sa discussion — la branche créateur est DANS la conjonction avec is_conv_member',
       (select case when j->>'k_sort' = '1' and j->>'k_voit_apres' = '' then 'OK'
                    else 'ECHEC — ' || coalesce(j->>'k_sort', 'mesure absente') || ' ; « ' || coalesce(j->>'k_voit_apres', 'mesure absente') || ' »' end from v);

-- ── ⑤ FERMÉ SUR ÉCHEC : une ligne en ECHEC annule TOUT ──
-- Rien n'est alors appliqué — ni le correctif, ni une trace du décor, ni la
-- ligne de journal de l'outil d'application (même transaction) — et la base
-- reste dans son état d'avant.
do $$
declare
  numeros text;
  details text;
begin
  select string_agg(c.n::text, ',' order by c.n), string_agg(c.n || '. ' || c.controle || ' → ' || coalesce(c.valeur, 'NULL'), ' ; ' order by c.n)
    into numeros, details
    from pg_temp.passio_c02_verdict c
   where c.valeur is distinct from 'OK'
     and c.bloquant = 'oui';
  if numeros is not null then
    raise exception 'discussions d''activité : la base n''est pas celle que ce correctif suppose, ou il ne s''y comporte pas comme il le doit — RIEN n''est appliqué. Lignes en échec : %', numeros
      using errcode = 'object_not_in_prerequisite_state', detail = details;
  end if;
end $$;

-- ── Verdict ──
select controle, valeur from pg_temp.passio_c02_verdict order by n;

commit;
