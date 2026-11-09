-- ═══════════════════════════════════════════════════════════════════════════
-- 📴 LE CONTENU PUBLIC SORT DE LA RÉPLICATION CDC — LA PUBLICATION
-- `supabase_realtime` EST VIDÉE (lot du 2026-11-09)
--
-- CE QUI A ÉTÉ MESURÉ (canal ① d'ADR-012, production, 2026-11-09 12:40 UTC) :
--   · `extensions.pg_stat_statements` (compteurs remis à zéro le 2026-05-13) :
--     la requête de `realtime.list_changes` — le relevé du WAL que le serveur
--     Realtime refait toutes les 100 ms dès qu'UN client tient une liaison
--     `postgres_changes` — pèse 7 486 911 appels, 53 283 s, 7,1 ms en moyenne :
--     60,31 % du temps d'exécution cumulé de TOUTE la base (plus une seconde
--     forme, 2,37 %). Un seul compte avait été actif dans la semaine ;
--   · chaque changement d'une table publiée coûte en plus un tour de
--     `realtime.apply_rls` PAR ABONNÉ : O(changements × connectés), la forme qui
--     borne le nombre de connectés ;
--   · la publication portait 9 tables en production (comment_interactions,
--     conv_messages, conv_reads, event_comments, post_comments, post_likes,
--     posts, profiles, video_lives) et 23 au staging (des tables `cdv_*`,
--     `telemetry_events`… jamais retirées là-bas).
--
-- LE REMÈDE — LE SERVEUR POUSSE À QUI REGARDE, LE CLIENT N'ÉCOUTE PLUS DE TABLE :
--   ① une discussion À L'ÉCRAN (publication ou activité) écoute un sujet privé
--     `fil:<id>`. Trois triggers y poussent ce qu'elle montre : un commentaire de
--     publication (`post_comments:INSERT`), une interaction — ajout ET retrait,
--     la LIGNE ENTIÈRE (`comment_interactions:INSERT|DELETE`) —, un commentaire
--     d'activité (`event_comments:INSERT`). La policy `passio_rt_recevoir_fil`
--     n'ouvre ce sujet qu'à qui peut lire la discussion
--     (`fil_temps_reel_visible` : une publication réelle que `post_is_visible`
--     laisse lire, ou une activité réelle — publique comme `events`) ; aucune
--     policy ne laisse un client y ÉMETTRE ;
--   ② l'AUTEUR d'une publication reçoit commentaires et interactions sur
--     `user:<lui>` (la pastille et le compte de SES cartes bougent sans qu'il
--     ouvre rien), sauf blocage entre lui et l'auteur de la ligne ;
--   ③ un accusé de lecture (`conv_reads`, INSERT ou changement de
--     `last_read_at`) part aux AUTRES membres de la conversation, sur
--     `user:<membre>`, sauf blocage — au plus 50 membres (au-delà, le ✓✓ se relit
--     à l'ouverture ; la plus grande conversation en compte 2 aujourd'hui) ;
--   ④ la publication `supabase_realtime` est VIDÉE — toutes ses tables, quelle
--     que soit la liste du projet visé. Sans table publiée, une liaison
--     `postgres_changes` ne peut plus rien recevoir : plus de relevé du WAL pour
--     personne, plus d'`apply_rls` par abonné. Publications, profils et lives ne
--     sont plus poussés à personne : le client les relit (filets bornés à ce qui
--     est à l'écran, profils de plus de 2 min redemandés).
-- Le coût d'un changement suit donc ceux qui REGARDENT, jamais le nombre de
-- connectés.
--
-- ⚠️ LES NOMS D'ÉVÉNEMENT NE SONT JAMAIS « INSERT » (piège du lot R25) : le
-- client v3 traite toute charge `INSERT` reçue sur `user:` et porteuse d'un
-- `conv_id` comme un MESSAGE — une ligne `conv_reads` en porte un.
-- ⚠️ LES CHARGES SONT ÉCRITES COLONNE PAR COLONNE, jamais `to_jsonb(new)` : une
-- colonne ajoutée demain ne partira pas d'elle-même sur un canal ; un texte est
-- borné (2 000 caractères ; les tables le bornent à 5 000 ou 500, le plus long
-- mesuré est 164).
-- ⚠️ UN RETRAIT PART AVEC LA LIGNE ENTIÈRE, ET C'EST VOULU : seuls la reçoivent
-- ceux qui pouvaient LIRE la ligne quand elle existait (le sujet du fil, son
-- auteur) — c'est la RLS de `comment_interactions`. Avant, `postgres_changes`
-- livrait la clé d'un DELETE à TOUT abonné, sans RLS (R25), et le client devait
-- la retrouver dans un index (R37).
-- ⚠️ UN FIL QUI N'EXISTE PAS N'A PAS DE SUJET : une interaction sur un EXEMPLE
-- (aucune ligne `posts` ni `events`) ou sur une publication déjà supprimée (la
-- purge de ses cibles) ne pousse rien — personne ne peut ni ne doit l'écouter.
-- ⚠️ LA POUSSÉE NE PEUT PAS FAIRE ÉCHOUER L'ÉCRITURE : chaque trigger rattrape
-- l'absence ou le changement de signature de `realtime.send` (WARNING) ; une
-- poussée manquée se rattrape par les relectures du client, une écriture
-- refusée, non.
--
-- ⚠️ ORDRE D'APPLICATION — NON NÉGOCIABLE, EN TROIS TEMPS :
--   ① le client de TRANSITION est EN LIGNE (PASSIO74/passio-app#802, job
--     « Déploiement production » vert) : il écoute `fil:<id>` pour une
--     discussion à l'écran, reçoit `conv_reads:UPSERT`, `post_comments:INSERT`,
--     `comment_interactions:INSERT|DELETE` sur `user:<moi>`, et garde cinq
--     liaisons `postgres_changes` de transition qu'il rend au premier refus du
--     serveur (`_cdcRetire`) ;
--   ② SEULEMENT ENSUITE cette migration, staging puis production ;
--   ③ PUIS le client sans aucune liaison CDC (la PR de cette migration) : avant
--     ②, il priverait du direct une discussion ouverte — le serveur refuse
--     encore `fil:` (aucune policy) et lui n'écoute plus la table.
--   Lu dans le serveur Realtime (lot R25) : les liaisons `postgres_changes` d'un
--   canal sont créées dans UNE transaction, et une table hors publication
--   l'annule ENTIÈRE (le canal reste ouvert, son broadcast intact) — et le
--   serveur RÉESSAIE leur création toutes les 5 à 10 s tant que le canal reste
--   ouvert, en réveillant chaque fois le relevé du WAL (relecture `audit-passio`
--   du 2026-11-09 : elles ne se taisent PAS). Un client d'avant #802 perdrait à
--   son join suivant TOUT le direct de `realtime:db`, et ferait réessayer le
--   serveur jusqu'à sa mise à jour ; celui de #802 rend `realtime:db` au premier
--   refus (message `system` en erreur, `_cdcRetire`), et les mêmes lignes lui
--   arrivent par les sujets privés. La PWA recharge un onglet visible dans la
--   minute d'un déploiement (`js/pwa-detect.js`).
--   ⚠️ CET ORDRE EST TENU PAR L'OUTIL : sur la production,
--   `appliquer-migration.mjs` (règle ④) refuse ce fichier tant que le bundle
--   SERVI ne porte pas ces deux noms d'événement :
-- PREREQUIS-CLIENT: conv_reads:UPSERT
-- PREREQUIS-CLIENT: comment_interactions:DELETE
--
-- CE QUE CETTE MIGRATION NE FAIT PAS :
--   · aucune table, aucune colonne, aucune RLS de table, aucun GRANT de table ne
--     bouge ; les colonnes `rid` et leurs index d'identité (R25) RESTENT — ne
--     jamais supprimer un `*_rid_key` (gate `audit-identite-replication`) ;
--   · le canal des MESSAGES (`broadcast_conv_message_users_trigger`), les
--     poussées de R25 (notifications, ajouts) et la publication des messages
--     diffusés (`supabase_realtime_messages_publication`, qui porte
--     `realtime.messages`) sont intacts ;
--   · un sujet `fil:` déjà rejoint n'est pas réévalué si la publication devient
--     illisible pour son abonné (compte passé privé, publication masquée) : la
--     policy est jugée à l'adhésion, comme celle de `conv:` ou `vlive:`.
--
-- Rejouable ; verdict en fin. Banc : tests/sql/migration-realtime-public-hors-cdc.test.sh.
-- RETOUR ARRIÈRE — exact et rejouable, exécutable tel quel en ôtant « --| » (le
-- banc le rejoue). Il rend à la publication les NEUF tables de la production et
-- retire triggers, fonctions et policy. ⚠️ Retour arrière complet = revenir
-- au client de TRANSITION (#802 : revert de la PR de cette migration) ET ce
-- bloc, dans cet ordre si possible : le client de transition fonctionne dans les
-- deux états ; celui de cette PR, sans liaison CDC, perdrait le direct d'une
-- discussion ouverte dès que la policy de `fil:` serait retirée. Le client
-- d'avant #802 ne fonctionne qu'avec la publication pleine.
--| begin;
--| drop trigger if exists trg_diffuser_commentaire_publication on public.post_comments;
--| drop trigger if exists trg_diffuser_interaction on public.comment_interactions;
--| drop trigger if exists trg_diffuser_commentaire_activite on public.event_comments;
--| drop trigger if exists trg_diffuser_lecture on public.conv_reads;
--| drop policy if exists passio_rt_recevoir_fil on realtime.messages;
--| drop function if exists public.diffuser_commentaire_publication();
--| drop function if exists public.diffuser_interaction();
--| drop function if exists public.diffuser_commentaire_activite();
--| drop function if exists public.diffuser_lecture();
--| drop function if exists public.fil_temps_reel_visible(text);
--| do $r$ declare t text; begin
--|   foreach t in array array['comment_interactions', 'conv_messages', 'conv_reads', 'event_comments', 'post_comments',
--|                            'post_likes', 'posts', 'profiles', 'video_lives'] loop
--|     if to_regclass('public.' || t) is not null and not exists (
--|          select 1 from pg_publication_rel pr join pg_publication p on p.oid = pr.prpubid
--|           where p.pubname = 'supabase_realtime' and pr.prrelid = ('public.' || t)::regclass) then
--|       execute format('alter publication supabase_realtime add table public.%I', t);
--|     end if;
--|   end loop;
--| end $r$;
--| commit;
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- Un filet : `create trigger` et `create policy` n'attendent pas indéfiniment
-- derrière une écriture longue, avec les clients en file derrière eux. Dépassé :
-- rien n'est appliqué, la rejouer.
set local lock_timeout = '5s';

-- ── ⓪ Qui peut écouter la discussion `fil:<id>` ──────────────────────────────
-- Une publication RÉELLE que l'appelant peut lire (`post_is_visible` : compte
-- privé, abonnement accepté, blocage, masquage), ou une activité RÉELLE
-- (publique, comme `events` et `event_comments`). Un exemple, un identifiant
-- inconnu ou supprimé : personne.
create or replace function public.fil_temps_reel_visible(_fil text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and _fil is not null
     and char_length(_fil) between 1 and 120
     and (
       (exists (select 1 from public.posts p where p.id = _fil) and public.post_is_visible(_fil))
       or exists (select 1 from public.events e where e.id = _fil)
     )
$$;
-- La policy l'évalue sous le rôle de l'abonné : `authenticated` doit pouvoir
-- l'exécuter ; personne d'autre.
revoke all on function public.fil_temps_reel_visible(text) from public;
revoke all on function public.fil_temps_reel_visible(text) from anon;
grant execute on function public.fil_temps_reel_visible(text) to authenticated;

drop policy if exists passio_rt_recevoir_fil on realtime.messages;
create policy passio_rt_recevoir_fil on realtime.messages
  for select to authenticated
  using ((realtime.topic() ~~ 'fil:%') and public.fil_temps_reel_visible(substr(realtime.topic(), 5)));

-- ── ① Un commentaire de publication : au sujet du fil, et à son auteur ───────
create or replace function public.diffuser_commentaire_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auteur text;
  charge jsonb;
begin
  if new.post_id is null then return null; end if;
  select p.author_id into auteur from public.posts p where p.id = new.post_id;
  if not found then return null; end if;          -- pas une publication réelle : personne n'écoute
  charge := jsonb_build_object(
    'table', 'post_comments',
    'operation', 'INSERT',
    'record', jsonb_build_object(
      'id', new.id,
      'post_id', new.post_id,
      'author_id', new.author_id,
      'content', left(new.content, 2000),
      'created_at', new.created_at
    )
  );
  begin
    perform realtime.send(charge, 'post_comments:INSERT', 'fil:' || new.post_id, true);
    if auteur ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not public.blocage_entre(auteur, new.author_id) then
      perform realtime.send(charge, 'post_comments:INSERT', 'user:' || auteur, true);
    end if;
  exception when others then
    raise warning 'diffuser_commentaire_publication : poussee sautee (%)', sqlerrm;
  end;
  return null;
end;
$$;

-- ── ② Une interaction : ajout ET retrait, la ligne entière ───────────────────
create or replace function public.diffuser_interaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  auteur text;
  charge jsonb;
  evenement text;
begin
  if tg_op = 'DELETE' then r := old; evenement := 'comment_interactions:DELETE';
  else r := new; evenement := 'comment_interactions:INSERT';
  end if;
  if r.post_id is null then return null; end if;
  select p.author_id into auteur from public.posts p where p.id = r.post_id;
  if not found then
    -- Une activité a un sujet, mais pas d'« auteur de publication » à prévenir.
    if not exists (select 1 from public.events e where e.id = r.post_id) then return null; end if;
    auteur := null;
  end if;
  charge := jsonb_build_object(
    'table', 'comment_interactions',
    'operation', tg_op,
    'record', jsonb_build_object(
      'id', r.id,
      'comment_id', r.comment_id,
      'post_id', r.post_id,
      'user_id', r.user_id,
      'kind', r.kind,
      'payload', left(r.payload, 2000),
      'created_at', r.created_at
    )
  );
  begin
    perform realtime.send(charge, evenement, 'fil:' || r.post_id, true);
    if auteur ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not public.blocage_entre(auteur, r.user_id) then
      perform realtime.send(charge, evenement, 'user:' || auteur, true);
    end if;
  exception when others then
    raise warning 'diffuser_interaction : poussee sautee (%)', sqlerrm;
  end;
  return null;
end;
$$;

-- ── ③ Un commentaire d'activité : au sujet de la discussion de l'activité ────
-- Le client relit la discussion à sa réception (l'épingle, les réponses) : la
-- charge ne porte que ce qui la désigne.
create or replace function public.diffuser_commentaire_activite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_id is null or not exists (select 1 from public.events e where e.id = new.event_id) then
    return null;
  end if;
  begin
    perform realtime.send(
      jsonb_build_object(
        'table', 'event_comments',
        'operation', 'INSERT',
        'record', jsonb_build_object(
          'id', new.id,
          'event_id', new.event_id,
          'author_id', new.author_id,
          'created_at', new.created_at
        )
      ),
      'event_comments:INSERT',
      'fil:' || new.event_id,
      true
    );
  exception when others then
    raise warning 'diffuser_commentaire_activite : poussee sautee (%)', sqlerrm;
  end;
  return null;
end;
$$;

-- ── ④ Un accusé de lecture : aux AUTRES membres, sur leur sujet `user:` ──────
create or replace function public.diffuser_lecture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  charge jsonb;
begin
  if new.conv_id is null or new.user_id is null then return null; end if;
  if tg_op = 'UPDATE' and old.last_read_at is not distinct from new.last_read_at then return null; end if;
  if (select count(*) from public.conv_members cm where cm.conv_id = new.conv_id) > 50 then return null; end if;
  charge := jsonb_build_object(
    'table', 'conv_reads',
    'operation', tg_op,
    'record', jsonb_build_object('conv_id', new.conv_id, 'user_id', new.user_id, 'last_read_at', new.last_read_at)
  );
  begin
    for m in
      select cm.user_id from public.conv_members cm
       where cm.conv_id = new.conv_id
         and cm.user_id <> new.user_id
         and cm.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    loop
      if not public.blocage_entre(new.user_id, m.user_id) then
        perform realtime.send(charge, 'conv_reads:UPSERT', 'user:' || m.user_id, true);
      end if;
    end loop;
  exception when others then
    raise warning 'diffuser_lecture : poussee sautee (%)', sqlerrm;
  end;
  return null;
end;
$$;

-- Aucun client ne les appelle (fonctions de trigger) ; les droits par défaut de
-- Supabase accordent EXECUTE à `anon` et `authenticated` par des grants
-- NOMINATIFS qu'un `revoke ... from public` laisse entiers (mesuré le
-- 2026-09-08). Le trigger, lui, ne vérifie pas EXECUTE au déclenchement : le
-- banc l'éprouve en écrivant sous `authenticated`.
do $$
declare
  f text;
begin
  foreach f in array array['public.diffuser_commentaire_publication()', 'public.diffuser_interaction()',
                           'public.diffuser_commentaire_activite()', 'public.diffuser_lecture()'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('revoke all on function %s from authenticated', f);
  end loop;
end $$;

drop trigger if exists trg_diffuser_commentaire_publication on public.post_comments;
create trigger trg_diffuser_commentaire_publication
  after insert on public.post_comments
  for each row execute function public.diffuser_commentaire_publication();

drop trigger if exists trg_diffuser_interaction on public.comment_interactions;
create trigger trg_diffuser_interaction
  after insert or delete on public.comment_interactions
  for each row execute function public.diffuser_interaction();

drop trigger if exists trg_diffuser_commentaire_activite on public.event_comments;
create trigger trg_diffuser_commentaire_activite
  after insert on public.event_comments
  for each row execute function public.diffuser_commentaire_activite();

drop trigger if exists trg_diffuser_lecture on public.conv_reads;
create trigger trg_diffuser_lecture
  after insert or update of last_read_at on public.conv_reads
  for each row execute function public.diffuser_lecture();

-- ── ⑤ La publication est VIDÉE : plus aucun relevé du WAL pour personne ──────
-- Toutes ses tables, quelle que soit la liste du projet visé (9 en production,
-- 23 au staging), et un éventuel schéma entier. Lu dans `pg_publication_rel` et
-- `pg_publication_namespace`, qui n'ouvrent aucune table (piège du verdict R25 :
-- `pg_publication_tables` en ouvre chacune).
do $$
declare
  t record;
  n integer := 0;
begin
  for t in
    select c.oid::regclass as rel
      from pg_publication_rel pr
      join pg_publication p on p.oid = pr.prpubid
      join pg_class c on c.oid = pr.prrelid
     where p.pubname = 'supabase_realtime'
  loop
    execute format('alter publication supabase_realtime drop table %s', t.rel);
    n := n + 1;
  end loop;
  for t in
    select ns.nspname
      from pg_publication_namespace pn
      join pg_publication p on p.oid = pn.pnpubid
      join pg_namespace ns on ns.oid = pn.pnnspid
     where p.pubname = 'supabase_realtime'
  loop
    execute format('alter publication supabase_realtime drop tables in schema %I', t.nspname);
    n := n + 1;
  end loop;
  raise notice 'supabase_realtime : % entree(s) retiree(s)', n;
end $$;

-- ── VERDICT ────────────────────────────────────────────────────────────────
-- ⚠️ On mesure ensuite l'état en base au canal ①, jamais ce tableau seul.
-- La SONDE écrit dans une SOUS-TRANSACTION ANNULÉE (rien ne reste, rien n'est
-- diffusé : Realtime ne lit que ce qui est validé) et ne dépend que de lignes
-- RÉELLES du projet : la publication la plus récente lisible par un tiers, une
-- activité, une conversation à deux membres. Absente, la ligne dit « SANS OBJET »
-- — jamais OK sur rien.
do $$
declare
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  tiers constant text := '00000000-0000-4000-8000-00000000c109';   -- aucun compte
  suffixe constant text := replace(gen_random_uuid()::text, '-', '');
  ci_id text := 'ci_sonde_hors_cdc_' || suffixe;
  pc_id text := 'pc_sonde_hors_cdc_' || suffixe;
  ec_id text := 'ec_sonde_hors_cdc_' || suffixe;
  p record;
  ev record;
  cv record;
  res jsonb := '{}'::jsonb;
begin
  begin
    -- ① ② une publication réelle, lisible par un tiers (compte public, non masquée)
    select po.id, po.author_id into p
      from public.posts po
     where po.author_id ~ uuid_re
       and not public.post_masque(po.id)
       and not exists (select 1 from public.profiles pr where pr.id = po.author_id and pr.is_private)
     order by po.created_at desc nulls last
     limit 1;
    -- Chaque sonde dans son PROPRE bloc : une garde du projet qui refuserait l'une
    -- (débit d'un compte, compte en suppression) ne fait pas perdre les autres —
    -- son refus est nommé dans le verdict.
    if p.id is not null then
      begin
        insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload)
          values (ci_id, p.id, p.id, tiers, 'emoji', 'x');
        res := res || jsonb_build_object(
          'ci_ajout_fil', exists (select 1 from realtime.messages m where m.topic = 'fil:' || p.id
                                    and m.event = 'comment_interactions:INSERT' and m.payload -> 'record' ->> 'id' = ci_id),
          'ci_ajout_auteur', exists (select 1 from realtime.messages m where m.topic = 'user:' || p.author_id
                                    and m.event = 'comment_interactions:INSERT' and m.payload -> 'record' ->> 'id' = ci_id));
        delete from public.comment_interactions where id = ci_id;
        res := res || jsonb_build_object(
          'ci_retrait_ligne', exists (select 1 from realtime.messages m where m.topic = 'fil:' || p.id
                                    and m.event = 'comment_interactions:DELETE' and m.payload -> 'record' ->> 'id' = ci_id
                                    and m.payload -> 'record' ->> 'user_id' = tiers and m.payload -> 'record' ->> 'kind' = 'emoji'));
      exception when others then
        res := res || jsonb_build_object('erreur', coalesce((res ->> 'erreur') || ' | ', '') || 'interaction : ' || sqlerrm);
      end;
      begin
        insert into public.post_comments (id, post_id, author_id, content) values (pc_id, p.id, p.author_id, 'sonde');
        res := res || jsonb_build_object(
          'pc_fil', exists (select 1 from realtime.messages m where m.topic = 'fil:' || p.id
                              and m.event = 'post_comments:INSERT' and m.payload -> 'record' ->> 'id' = pc_id),
          'pc_auteur', exists (select 1 from realtime.messages m where m.topic = 'user:' || p.author_id
                              and m.event = 'post_comments:INSERT' and m.payload -> 'record' ->> 'id' = pc_id));
      exception when others then
        res := res || jsonb_build_object('erreur', coalesce((res ->> 'erreur') || ' | ', '') || 'commentaire : ' || sqlerrm);
      end;
    else
      res := res || jsonb_build_object('sans_publication', true);
    end if;

    -- ③ une activité réelle, commentée par son auteur
    select e.id, e.author_id into ev
      from public.events e
     where e.author_id ~ uuid_re
     order by e.created_at desc nulls last
     limit 1;
    if ev.id is not null then
      begin
        insert into public.event_comments (id, event_id, author_id, text) values (ec_id, ev.id, ev.author_id, 'sonde');
        res := res || jsonb_build_object(
          'ec_fil', exists (select 1 from realtime.messages m where m.topic = 'fil:' || ev.id
                              and m.event = 'event_comments:INSERT' and m.payload -> 'record' ->> 'id' = ec_id));
      exception when others then
        res := res || jsonb_build_object('erreur', coalesce((res ->> 'erreur') || ' | ', '') || 'commentaire d''activite : ' || sqlerrm);
      end;
    else
      res := res || jsonb_build_object('sans_activite', true);
    end if;

    -- ④ une conversation à deux membres, sans blocage entre eux : l'un lit, l'autre est prévenu
    select a.conv_id, a.user_id as lecteur, b.user_id as autre into cv
      from public.conv_members a
      join public.conv_members b on b.conv_id = a.conv_id and b.user_id <> a.user_id
     where a.user_id ~ uuid_re and b.user_id ~ uuid_re
       and (select count(*) from public.conv_members c where c.conv_id = a.conv_id) = 2
       and not public.blocage_entre(a.user_id, b.user_id)
     limit 1;
    if cv.conv_id is not null then
      begin
        insert into public.conv_reads (conv_id, user_id, last_read_at) values (cv.conv_id, cv.lecteur, now())
          on conflict (conv_id, user_id) do update set last_read_at = excluded.last_read_at;
        res := res || jsonb_build_object(
          'lu_autre', exists (select 1 from realtime.messages m where m.topic = 'user:' || cv.autre
                                and m.event = 'conv_reads:UPSERT' and m.payload -> 'record' ->> 'conv_id' = cv.conv_id),
          'lu_lecteur', exists (select 1 from realtime.messages m where m.topic = 'user:' || cv.lecteur
                                and m.event = 'conv_reads:UPSERT' and m.payload -> 'record' ->> 'conv_id' = cv.conv_id));
      exception when others then
        res := res || jsonb_build_object('erreur', coalesce((res ->> 'erreur') || ' | ', '') || 'accuse de lecture : ' || sqlerrm);
      end;
    else
      res := res || jsonb_build_object('sans_conversation', true);
    end if;

    -- ⑤ la policy du sujet, rejouée sous `authenticated` (EN DERNIER : le rôle ne
    -- revient pas). Des lignes TÉMOINS écrites par le propriétaire : une table vide
    -- rendrait « personne ne lit » à tort.
    insert into realtime.messages (topic, extension, payload, event, private)
      values ('fil:sonde_hors_cdc_inexistant', 'broadcast', '{}'::jsonb, 'sonde_hors_cdc', true);
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', tiers, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', tiers, 'role', 'authenticated')::text, true);
    perform set_config('realtime.topic', 'fil:sonde_hors_cdc_inexistant', true);
    res := res || jsonb_build_object('fil_inexistant_lu', exists (select 1 from realtime.messages));
    if p.id is not null then
      perform set_config('realtime.topic', 'fil:' || p.id, true);
      res := res || jsonb_build_object('fil_lu_par_tiers', exists (select 1 from realtime.messages));
      begin
        insert into realtime.messages (topic, extension, payload, event, private)
          values ('fil:' || p.id, 'broadcast', '{}'::jsonb, 'post_comments:INSERT', true);
        res := res || jsonb_build_object('fil_emis_par_tiers', true);
      exception when others then
        res := res || jsonb_build_object('fil_emis_par_tiers', false);
      end;
    end if;
    raise exception using errcode = 'P0001', message = 'sonde_hors_cdc_annulee';
  exception when others then
    if sqlerrm <> 'sonde_hors_cdc_annulee' then
      res := res || jsonb_build_object('erreur', coalesce((res ->> 'erreur') || ' | ', '') || sqlerrm);
    end if;
  end;
  perform set_config('passio.verdict_hors_cdc', res::text, true);
end $$;

with s as (select coalesce(nullif(current_setting('passio.verdict_hors_cdc', true), ''), '{}')::jsonb as v)
select 'supabase_realtime est VIDE : aucune table ni aucun schéma publié (plus aucun relevé du WAL)' as controle,
       case when not exists (select 1 from pg_publication_rel pr join pg_publication p on p.oid = pr.prpubid
                              where p.pubname = 'supabase_realtime')
             and not exists (select 1 from pg_publication_namespace pn join pg_publication p on p.oid = pn.pnpubid
                              where p.pubname = 'supabase_realtime') then 'OK' else 'ECHEC' end as valeur
union all select 'la publication des messages diffusés porte toujours realtime.messages (poussées des triggers)',
       case when to_regclass('realtime.messages') is not null and exists (
              select 1 from pg_publication_rel pr join pg_publication p on p.oid = pr.prpubid
               where p.pubname = 'supabase_realtime_messages_publication' and pr.prrelid = 'realtime.messages'::regclass)
            then 'OK' else 'ECHEC' end
union all select 'les quatre triggers : AFTER, par ligne, actifs, sur leur table et leur fonction',
       case when (select count(*) from pg_trigger t
                   where not t.tgisinternal and t.tgenabled = 'O' and (
                         (t.tgrelid = 'public.post_comments'::regclass and t.tgname = 'trg_diffuser_commentaire_publication'
                          and t.tgtype = 5 and t.tgfoid = 'public.diffuser_commentaire_publication()'::regprocedure)
                      or (t.tgrelid = 'public.comment_interactions'::regclass and t.tgname = 'trg_diffuser_interaction'
                          and t.tgtype = 13 and t.tgfoid = 'public.diffuser_interaction()'::regprocedure)
                      or (t.tgrelid = 'public.event_comments'::regclass and t.tgname = 'trg_diffuser_commentaire_activite'
                          and t.tgtype = 5 and t.tgfoid = 'public.diffuser_commentaire_activite()'::regprocedure)
                      or (t.tgrelid = 'public.conv_reads'::regclass and t.tgname = 'trg_diffuser_lecture'
                          and t.tgtype = 21 and t.tgfoid = 'public.diffuser_lecture()'::regprocedure))) = 4
            then 'OK' else 'ECHEC' end
union all select 'les cinq fonctions : SECURITY DEFINER, search_path vide',
       case when (select count(*) from pg_proc
                   where oid in ('public.diffuser_commentaire_publication()'::regprocedure, 'public.diffuser_interaction()'::regprocedure,
                                 'public.diffuser_commentaire_activite()'::regprocedure, 'public.diffuser_lecture()'::regprocedure,
                                 'public.fil_temps_reel_visible(text)'::regprocedure)
                     and prosecdef and array_to_string(proconfig, ';') = 'search_path=""') = 5 then 'OK' else 'ECHEC' end
union all select 'aucun client (anon, authenticated) n''exécute les fonctions de trigger ; la visibilité du fil : authenticated seul',
       case when not exists (select 1 from unnest(array['public.diffuser_commentaire_publication()', 'public.diffuser_interaction()',
                                                         'public.diffuser_commentaire_activite()', 'public.diffuser_lecture()']) f
                              where has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE'))
             and has_function_privilege('authenticated', 'public.fil_temps_reel_visible(text)', 'EXECUTE')
             and not has_function_privilege('anon', 'public.fil_temps_reel_visible(text)', 'EXECUTE') then 'OK' else 'ECHEC' end
union all select 'chaque poussée porte un nom distinct de « INSERT » et vise fil:<id> ou user:<destinataire>',
       case when (select prosrc from pg_proc where oid = 'public.diffuser_commentaire_publication()'::regprocedure)
                 like '%''post_comments:INSERT'', ''fil:'' || new.post_id%''post_comments:INSERT'', ''user:'' || auteur%'
             and (select prosrc from pg_proc where oid = 'public.diffuser_interaction()'::regprocedure)
                 like '%''comment_interactions:DELETE''%''comment_interactions:INSERT''%evenement, ''fil:'' || r.post_id%evenement, ''user:'' || auteur%'
             and (select prosrc from pg_proc where oid = 'public.diffuser_commentaire_activite()'::regprocedure)
                 like '%''event_comments:INSERT'',%''fil:'' || new.event_id%'
             and (select prosrc from pg_proc where oid = 'public.diffuser_lecture()'::regprocedure)
                 like '%''conv_reads:UPSERT'', ''user:'' || m.user_id%' then 'OK' else 'ECHEC' end
union all select 'la policy passio_rt_recevoir_fil : SELECT, authenticated seul',
       case when exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                          and policyname = 'passio_rt_recevoir_fil' and cmd = 'SELECT' and roles = '{authenticated}')
            then 'OK' else 'ECHEC' end
union all select 'sonde : une interaction ajoutée part au sujet du fil ET à l''auteur de la publication'
                 || coalesce(' — ' || (s.v ->> 'erreur'), ''),
       case when s.v ? 'sans_publication' then 'SANS OBJET (aucune publication lisible par un tiers)'
            when (s.v ->> 'ci_ajout_fil') = 'true' and (s.v ->> 'ci_ajout_auteur') = 'true' then 'OK' else 'ECHEC' end
from s
union all select 'sonde : un retrait part avec la LIGNE ENTIÈRE (compte et genre), sur le sujet du fil',
       case when s.v ? 'sans_publication' then 'SANS OBJET (aucune publication lisible par un tiers)'
            when (s.v ->> 'ci_retrait_ligne') = 'true' then 'OK' else 'ECHEC' end
from s
union all select 'sonde : un commentaire part au sujet du fil ET à l''auteur de la publication',
       case when s.v ? 'sans_publication' then 'SANS OBJET (aucune publication lisible par un tiers)'
            when (s.v ->> 'pc_fil') = 'true' and (s.v ->> 'pc_auteur') = 'true' then 'OK' else 'ECHEC' end
from s
union all select 'sonde : un commentaire d''activité part au sujet de l''activité',
       case when s.v ? 'sans_activite' then 'SANS OBJET (aucune activité)'
            when (s.v ->> 'ec_fil') = 'true' then 'OK' else 'ECHEC' end
from s
union all select 'sonde : un accusé de lecture part à l''AUTRE membre, jamais au lecteur',
       case when s.v ? 'sans_conversation' then 'SANS OBJET (aucune conversation à deux membres)'
            when (s.v ->> 'lu_autre') = 'true' and (s.v ->> 'lu_lecteur') = 'false' then 'OK' else 'ECHEC' end
from s
union all select 'sonde : un tiers LIT le sujet d''une publication lisible, et pas celui d''un fil inexistant',
       case when s.v ? 'sans_publication' then 'SANS OBJET (aucune publication lisible par un tiers)'
            when (s.v ->> 'fil_lu_par_tiers') = 'true' and (s.v ->> 'fil_inexistant_lu') = 'false' then 'OK' else 'ECHEC' end
from s
union all select 'sonde : un tiers ne peut pas ÉMETTRE sur un sujet fil: (la charge reçue vient du serveur)',
       case when s.v ? 'sans_publication' then 'SANS OBJET (aucune publication lisible par un tiers)'
            when (s.v ->> 'fil_emis_par_tiers') = 'false' then 'OK' else 'ECHEC' end
from s
union all select 'realtime.send(jsonb, text, text, boolean) existe (sans elle, chaque poussée serait sautée)',
       case when to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then 'OK' else 'ECHEC' end
union all select 'le canal des messages et les poussées de R25 sont intacts',
       case when (select count(*) from pg_trigger
                   where not tgisinternal and tgenabled = 'O'
                     and ((tgrelid = 'public.conv_messages'::regclass and tgname = 'broadcast_conv_message_users_trigger')
                       or (tgrelid = 'public.notifications'::regclass and tgname = 'trg_diffuser_notification')
                       or (tgrelid = 'public.conv_members'::regclass and tgname = 'trg_diffuser_ajout_membre'))) = 3
            then 'OK' else 'ECHEC' end;

commit;
