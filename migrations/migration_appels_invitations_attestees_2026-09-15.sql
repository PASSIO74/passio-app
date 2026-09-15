-- ═════════════════════════════════════════════════
-- APPELS — l'invitation est ATTESTÉE par la base, plus déclarée par l'émetteur
-- (MSG-01 / SUP-06, résidu Astra « identité d'appelant encore issue de
-- payload.from, sans liaison au JWT de l'émetteur », 2026-09-15)
--
-- Depuis le 14/09, l'appelant dépose son invitation en REST broadcast sur
-- `ring:<pair>` ; la réception est bornée au destinataire, le nom affiché vient
-- du profil de `from`. Mais `from` lui-même restait ÉCRIT PAR L'ÉMETTEUR : tout
-- compte authentifié non bloqué pouvait faire sonner B « de la part de A ».
-- Un broadcast client ne porte pas l'identité du jeton ; une LIGNE, si.
--
-- CE QUE FAIT CETTE MIGRATION :
--   ① `public.call_invites` : l'invitation devient une ligne — `from_id` est
--      posé par la RLS (`= auth.uid()`), le destinataire doit partager une
--      conversation 1:1 avec l'appelant et ne pas être bloqué
--      (`appel_autorise`) ; chacun lit ses propres lignes ; une même invitation
--      se rejoue par UPDATE (`repete_le`) — l'appelant répète toutes les 2 s ;
--   ② un trigger APRÈS INSERT/UPDATE appelle `realtime.send(...)` sur le canal
--      privé `ring:<to_id>` avec un payload construit DEPUIS LA LIGNE
--      (`from` = `new.from_id`) : c'est le serveur qui dit qui appelle ;
--   ③ `passio_rt_emettre` ne laisse plus un CLIENT émettre sur `ring:%` — seule
--      la base y écrit désormais. Un ancien client (app.js en cache) verra son
--      REST broadcast refusé : la push `notify-call` reste, la sonnerie
--      temps réel revient au prochain rechargement ;
--   ④ purge quotidienne des invitations de plus d'un jour (pg_cron).
-- Rejouable ; verdict en fin. Retour arrière : recréer `passio_rt_emettre`
-- avec le membre `ring:%` (migration du 2026-09-11) et lâcher la table.
-- ═════════════════════════════════════════════════
begin;

create table if not exists public.call_invites (
  id         text primary key check (char_length(id) between 8 and 80),
  from_id    text not null,
  to_id      text not null check (to_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  kind       text not null default 'voice',
  created_at timestamptz not null default now(),
  repete_le  timestamptz not null default now()
);
-- Les deux genres du client (`startCall(conv, 'voice' | 'video')`), rejouable.
alter table public.call_invites drop constraint if exists call_invites_kind_check;
alter table public.call_invites add constraint call_invites_kind_check check (kind in ('voice', 'video'));
alter table public.call_invites alter column kind set default 'voice';
alter table public.call_invites enable row level security;
revoke all on public.call_invites from anon;
grant select, insert, update on public.call_invites to authenticated;
create index if not exists call_invites_to_idx on public.call_invites (to_id, created_at desc);

-- Le destinataire est joignable : une conversation 1:1 commune, aucun blocage.
create or replace function public.appel_autorise(_to text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and _to is distinct from (select auth.uid())::text
     and not public.is_blocked_with(_to)
     and exists (
       select 1 from public.conv_members a
       join public.conv_members b on b.conv_id = a.conv_id
       join public.conversations c on c.id = a.conv_id
       where a.user_id = (select auth.uid())::text
         and b.user_id = _to
         and coalesce(c.is_group, false) = false);
$$;
revoke all on function public.appel_autorise(text) from public, anon;
grant execute on function public.appel_autorise(text) to authenticated;

drop policy if exists call_invites_insert_propre on public.call_invites;
create policy call_invites_insert_propre on public.call_invites
  for insert to authenticated
  with check (from_id = (select auth.uid())::text and public.appel_autorise(to_id));
drop policy if exists call_invites_update_propre on public.call_invites;
create policy call_invites_update_propre on public.call_invites
  for update to authenticated
  using (from_id = (select auth.uid())::text)
  with check (from_id = (select auth.uid())::text and public.appel_autorise(to_id));
drop policy if exists call_invites_select_siennes on public.call_invites;
create policy call_invites_select_siennes on public.call_invites
  for select to authenticated
  using (from_id = (select auth.uid())::text or to_id = (select auth.uid())::text);

-- Les identifiants sont figés : une invitation ne se déplace pas vers un autre
-- destinataire ni ne change d'appelant par UPDATE (WITH CHECK ne voit que la
-- ligne finale — même leçon que `trg_identifiants_figes`).
create or replace function public.call_invites_figes()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.from_id is distinct from old.from_id or new.to_id is distinct from old.to_id then
    raise exception 'call_invites : from_id et to_id sont figés';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_call_invites_figes on public.call_invites;
create trigger trg_call_invites_figes before update on public.call_invites
  for each row execute function public.call_invites_figes();

-- La sonnerie part de la BASE : payload construit depuis la ligne, canal privé.
create or replace function public.call_invites_sonner()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('callId', new.id, 'from', new.from_id, 'kind', new.kind, 'atteste', true),
    'invite',
    'ring:' || new.to_id,
    true);
  return new;
end;
$$;
drop trigger if exists trg_call_invites_sonner on public.call_invites;
create trigger trg_call_invites_sonner after insert or update on public.call_invites
  for each row execute function public.call_invites_sonner();

-- ③ Un client n'émet plus sur `ring:%` : seule la base y écrit.
drop policy if exists passio_rt_emettre on realtime.messages;
create policy passio_rt_emettre on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() like 'call:%'
    or realtime.topic() like 'vlive:%'
    or (realtime.topic() like 'typing:%' and public.is_conv_member(substr(realtime.topic(), 8), (select auth.uid())::text))
    or (realtime.topic() like 'conv:%' and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text))
  );

-- ④ Purge quotidienne : une invitation n'a de sens que quelques minutes.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge_call_invites';
    perform cron.schedule('purge_call_invites', '17 4 * * *', $j$delete from public.call_invites where created_at < now() - interval '1 day'$j$);
  end if;
end $$;

select 'call_invites : table RLS, anon sans droit' as controle,
       case when (select relrowsecurity from pg_class where relname = 'call_invites')
             and not has_table_privilege('anon', 'public.call_invites', 'SELECT') then 'OK' else 'ECHEC' end as valeur
union all select 'INSERT : from_id = moi ET destinataire joignable',
       case when (select with_check from pg_policies where tablename = 'call_invites' and policyname = 'call_invites_insert_propre') like '%appel_autorise%' then 'OK' else 'ECHEC' end
union all select 'trigger : la sonnerie part de la base (realtime.send)',
       case when exists (select 1 from pg_trigger where tgname = 'trg_call_invites_sonner' and not tgisinternal)
             and (select prosrc from pg_proc where proname = 'call_invites_sonner') like '%realtime.send%' then 'OK' else 'ECHEC' end
union all select 'identifiants figés par trigger',
       case when exists (select 1 from pg_trigger where tgname = 'trg_call_invites_figes' and not tgisinternal) then 'OK' else 'ECHEC' end
union all select 'un client n''émet plus sur ring:',
       case when (select with_check from pg_policies where schemaname = 'realtime' and policyname = 'passio_rt_emettre') not like '%ring:%' then 'OK' else 'ECHEC' end
union all select 'réception ring: toujours bornée au destinataire',
       case when (select qual from pg_policies where schemaname = 'realtime' and policyname = 'passio_rt_recevoir') like '%ring:%' then 'OK' else 'ECHEC' end
union all select 'appel_autorise : SECURITY DEFINER, search_path vide, anon sans EXECUTE',
       case when (select prosecdef and array_to_string(proconfig, ';') = 'search_path=""' from pg_proc where proname = 'appel_autorise')
             and not has_function_privilege('anon', 'public.appel_autorise(text)', 'EXECUTE') then 'OK' else 'ECHEC' end;

commit;
