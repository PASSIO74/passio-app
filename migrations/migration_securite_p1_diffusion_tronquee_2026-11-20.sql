-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ P1 2026-11-20 — D10-01 : UN LONG MESSAGE N'EST PLUS RECOPIÉ ENTIER POUR CHAQUE MEMBRE
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Se joue APRÈS
-- migration_securite_p1_budget_realtime_2026-11-20.sql (même budget, même acteur).
-- PREREQUIS-CLIENT: contenu_tronque
-- Banc : tests/sql/migration-securite-p1-2026-11-20.test.sh.
--
-- CE QUI COÛTAIT : `broadcast_conv_message_to_users` pousse la ligne ENTIÈRE à chaque membre
-- (`realtime.broadcast_changes`) : un message de 20 000 caractères dans un groupe de N membres
-- écrivait N copies de ~20 Ko dans `realtime.messages` (mesuré : 4 × 20 538 octets).
--
-- CE QUI CHANGE : au-delà de 2 048 octets de contenu, la charge poussée garde la même enveloppe
-- (`record`, `old_record`, `operation`, `table`, `schema`, même événement `INSERT`, même sujet
-- `user:<membre>`) mais `record.content` est réduit — 500 premiers caractères pour un texte simple,
-- chaîne vide pour une enveloppe JSON (qu'un extrait rendrait invalide) — et `record` porte
-- `"contenu_tronque": true`. Le message en base reste intact. En dessous de 2 048 octets, rien ne
-- change (même appel `broadcast_changes`). Une copie coûte donc au plus ~3 Ko au lieu de ~20 Ko.
--
-- CONTRAT CLIENT (d'où le PREREQUIS-CLIENT, motif littéral `contenu_tronque`) : sur `user:<moi>`,
-- événement `INSERT`, `payload.table === "conv_messages"`, si `payload.record.contenu_tronque ===
-- true`, le client N'UTILISE PAS `record.content` : il relit la ligne par l'API —
--   supa.from("conv_messages").select("id, conv_id, from_id, content, created_at")
--       .eq("id", record.id).maybeSingle()
-- — et passe CETTE ligne à `_handleIncomingConvMessage`. Relecture vide ou en échec : rien n'est
-- peint (le prochain `supaLoadMessages` apporte le message). Un client sans ce contrat afficherait
-- l'extrait (texte) ou une bulle vide (enveloppe) : ne pas appliquer avant que le client servi
-- porte le motif.
--
-- RETOUR ARRIÈRE (éditeur SQL) : remettre le corps de `broadcast_conv_message_to_users` de
-- migration_realtime_budget_2026-11-16.sql. Le client relecteur peut rester en place.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $g$ declare h text; begin
 if to_regprocedure('public.broadcast_conv_message_to_users()') is null
 or to_regprocedure('passio_realtime_budget.accuse_autorise(text,text)') is null then
  raise exception 'migration_securite_p1_budget_realtime_2026-11-20.sql requise avant ce lot';
 end if;
 select md5(btrim(regexp_replace(p.prosrc,'[[:space:]]+',' ','g'))) into h
  from pg_proc p where p.oid='public.broadcast_conv_message_to_users()'::regprocedure;
 if h not in ('d9b5e155ae80c1de96b61143395df6a7','6c8af6a13460903f10c160002a8407bb') then
  raise exception 'diffuseur different du catalogue relu';
 end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.conv_messages'::regclass
   and tgname='broadcast_conv_message_users_trigger'
   and tgfoid='public.broadcast_conv_message_to_users()'::regprocedure and not tgisinternal
   and tgenabled='O' and tgtype=5) then
  raise exception 'liaison de diffusion differente du catalogue relu';
 end if;
end $g$;

create or replace function public.broadcast_conv_message_to_users()
returns trigger language plpgsql security definer set search_path = '' as $f$
declare destinataires text[]; destinataire text; acteur text; octets bigint; charge jsonb; tronque boolean;
begin
 acteur := coalesce(auth.uid()::text,new.from_id);
 if auth.uid() is not null and new.from_id is distinct from acteur then
  raise exception 'identite de message invalide' using errcode='42501';
 end if;
 -- Liste capturée : un membre arrivé ensuite n'échappe pas au décompte.
 select coalesce(array_agg(cm.user_id order by cm.user_id),array[]::text[]) into destinataires
 from public.conv_members cm where cm.conv_id=new.conv_id
  and not public.blocage_entre(new.from_id,cm.user_id);
 -- Même enveloppe que realtime.broadcast_changes ; au-delà de 2 048 octets, le contenu
 -- n'est plus recopié : le client relit la ligne (contrat contenu_tronque).
 charge := jsonb_build_object('old_record',to_jsonb(old),'record',to_jsonb(new),
  'operation',tg_op,'table',tg_table_name,'schema',tg_table_schema);
 tronque := coalesce(octet_length(new.content),0) > 2048;
 if tronque then
  charge := jsonb_set(charge,'{record}',(charge->'record')||jsonb_build_object(
   'content',case when new.content ~ '^[[:space:]]*[\[{]' then '' else left(new.content,500) end,
   'contenu_tronque',true));
 end if;
 octets := octet_length(charge::text)+1024;
 perform passio_realtime_budget.consommer(acteur,cardinality(destinataires)::bigint,
  cardinality(destinataires)::bigint*octets);
 foreach destinataire in array destinataires loop
  if not public.blocage_entre(new.from_id,destinataire) then
   if tronque then
    perform realtime.send(charge,tg_op,'user:'||destinataire,true);
   else
    perform realtime.broadcast_changes('user:'||destinataire,tg_op,tg_op,tg_table_name,tg_table_schema,new,old);
   end if;
  end if;
 end loop;
 return new;
end $f$;
revoke all on function public.broadcast_conv_message_to_users() from public,anon,authenticated,service_role;

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'diffusion : contenu long non recopié par membre' as controle,
       case when (select prosrc from pg_proc where oid='public.broadcast_conv_message_to_users()'::regprocedure) like '%contenu_tronque%'
             and (select prosrc from pg_proc where oid='public.broadcast_conv_message_to_users()'::regprocedure) like '%> 2048%'
            then 'OK' else 'ECHEC' end as valeur
union all select 'diffusion : budget compté avant la première émission',
       case when (select prosrc from pg_proc where oid='public.broadcast_conv_message_to_users()'::regprocedure) like '%passio_realtime_budget.consommer(acteur%'
            then 'OK' else 'ECHEC' end
union all select 'diffusion : fonction interne fermée',
       case when not has_function_privilege('authenticated','public.broadcast_conv_message_to_users()','execute')
             and not has_function_privilege('anon','public.broadcast_conv_message_to_users()','execute') then 'OK' else 'ECHEC' end;

commit;
