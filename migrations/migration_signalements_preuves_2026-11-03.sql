-- ═══════════════════════════════════════════════════════════════════════════
-- MODÉRATION — LA PREUVE D'UN MESSAGE SIGNALÉ SURVIT À SON AUTEUR (E-08, 2026-11-03)
--
-- Une transaction, REJOUABLE, tableau de verdict en fin (8 lignes).
--
-- LE DÉFAUT (relevé par une revue indépendante, mesuré en production le
-- 2026-11-03 au canal ①, pg_policy) : depuis E-08 on peut « Signaler ce
-- message ». Le signalement (`reports`) ne garde volontairement QUE la cible
-- (`target_type = 'message'`, `target_id` = identifiant du message) — jamais le
-- contenu. Or `conv_messages` porte deux policies de l'AUTEUR :
--   · « Suppression propre » (DELETE, `from_id = auth.uid()`) ;
--   · « Update propre »     (UPDATE, `from_id = auth.uid()` + appartenance).
-- L'auteur d'un message harcelant peut donc l'EFFACER ou le RÉÉCRIRE entre le
-- signalement et sa lecture par un modérateur : `scripts/moderation.js voir`
-- trouvait une cible absente (ou anodine), et la décision se prenait sans
-- preuve. Rien, côté serveur, ne retenait ce qui avait été signalé.
--
-- CE QUI CHANGE, et rien d'autre :
--   · `public.signalements_preuves` : UNE copie par signalement de message —
--     identifiant, conversation, auteur, contenu et date d'envoi, AUX TYPES de
--     `conv_messages` (text / timestamp sans fuseau), plus `copie_le`. RLS
--     active, AUCUNE policy, aucun droit pour `anon` ni `authenticated` ;
--     `service_role` (l'outil `scripts/moderation.js`, canal ② d'ADR-012) la
--     LIT et l'EFFACE, il ne l'écrit ni ne la réécrit : une preuve n'est posée
--     que par le serveur, et personne ne la retouche.
--   · `trg_reports_preuve_message` : AFTER INSERT sur `reports`, ligne à ligne,
--     `when (new.target_type = 'message')`, SECURITY DEFINER, search_path vide.
--     Il copie la ligne visée de `conv_messages` SI ET SEULEMENT SI le signalant
--     (`reporter_id`, que la policy `reports_insert` lie à `auth.uid()`) est
--     MEMBRE de la conversation selon l'autorité même de la policy SELECT de
--     `conv_messages` : `public.is_conv_member(conv_id, <signalant>)`. Message
--     introuvable ou signalant non membre : rien n'est copié — on ne fait pas
--     entrer dans la file de modération le message d'une conversation où le
--     signalant n'est pas (un identifiant deviné ne doit rien exfiltrer, même
--     vers l'équipe).
--     ⚠️ La clause `not is_blocked_with(from_id)` de cette même policy n'est
--     PAS reprise, délibérément : « bloquer puis signaler » est LE parcours
--     d'un harcèlement, et le signalant a reçu ce message en tant que membre.
--     Exiger l'absence de blocage effacerait la preuve dans le cas même où
--     elle compte le plus.
--   · LA COPIE NE BLOQUE JAMAIS LE SIGNALEMENT : toute erreur est rattrapée,
--     et LEVÉE en avertissement (`raise warning`, SQLSTATE et message) — jamais
--     avalée en silence. Le signalement est enregistré, la preuve manque, et
--     le journal PostgreSQL le dit.
--
-- ⚠️ DONNÉES PERSONNELLES — RÉTENTION. Une preuve contient le TEXTE d'un
-- message privé et l'identifiant de son auteur. Elle vit EXACTEMENT aussi
-- longtemps que son signalement (`report_id` → `reports(id) on delete
-- cascade`) : supprimer le signalement supprime la preuve. Elle ne dépend PAS
-- du message (aucune clé étrangère vers `conv_messages`, c'est tout son objet) :
-- ni l'effacement du message ni celui du compte de son auteur ne l'emportent.
-- Même régime que `reports` (trace de modération d'un tiers, purge-compte.js) —
-- durée de conservation des signalements traités : À DÉCIDER côté juridique.
--
-- Prérequis : `public.reports`, `public.conv_messages`, `public.is_conv_member`
-- (en production depuis le 2026-09-11). Indépendante des autres migrations du
-- 2026-11-03.
--
-- RETOUR ARRIÈRE (⚠️ détruit les preuves déjà copiées) :
--   drop trigger if exists trg_reports_preuve_message on public.reports;
--   drop function if exists public.trg_reports_preuve_message();
--   drop table if exists public.signalements_preuves;
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create table if not exists public.signalements_preuves (
  report_id  text primary key references public.reports(id) on delete cascade,
  message_id text not null,
  conv_id    text,
  auteur_id  text,
  contenu    text,
  envoye_le  timestamp without time zone,
  copie_le   timestamptz not null default now()
);
alter table public.signalements_preuves enable row level security;
-- Les privilèges par défaut du projet accordent TOUT à anon, authenticated et
-- service_role sur chaque nouvelle table de public (pg_default_acl, mesuré) :
-- on retire tout, puis on rend à service_role le strict nécessaire.
revoke all on public.signalements_preuves from public, anon, authenticated, service_role;
grant select, delete on public.signalements_preuves to service_role;

create or replace function public.trg_reports_preuve_message()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  begin
    insert into public.signalements_preuves (report_id, message_id, conv_id, auteur_id, contenu, envoye_le)
    select new.id, m.id, m.conv_id, m.from_id, m.content, m.created_at
      from public.conv_messages m
     where m.id = new.target_id
       and new.reporter_id is not null
       and public.is_conv_member(m.conv_id, new.reporter_id)
    on conflict (report_id) do nothing;
  exception when others then
    -- Le signalement passe quoi qu'il arrive ; l'absence de preuve, elle, se DIT.
    raise warning 'signalements_preuves : preuve non copiée pour le signalement % (SQLSTATE %, %)', new.id, sqlstate, sqlerrm;
  end;
  return null;
end
$fn$;
-- Une fonction de déclencheur ne s'appelle pas par RPC ; on retire quand même
-- l'EXECUTE que les privilèges par défaut donnent aux rôles clients.
revoke all on function public.trg_reports_preuve_message() from public, anon, authenticated;

drop trigger if exists trg_reports_preuve_message on public.reports;
create trigger trg_reports_preuve_message
  after insert on public.reports
  for each row
  when (new.target_type = 'message')
  execute function public.trg_reports_preuve_message();

-- ── Verdict ──
select 'signalements_preuves : existe, RLS active, AUCUNE policy' as controle,
       case when (select relrowsecurity from pg_class where oid = to_regclass('public.signalements_preuves'))
             and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'signalements_preuves')
            then 'OK' else 'ECHEC' end as valeur
-- Droits de TABLE, droits de COLONNE (un GRANT de colonne posé par un autre
-- concédant survit au REVOKE ci-dessus, qui ne retire que ceux de l'appelant —
-- revue du 2026-11-03), et MAINTAIN à partir de PostgreSQL 17 (le CASE n'évalue
-- pas ce privilège, inconnu en 16, sur le banc).
union all select 'signalements_preuves : aucun droit pour anon ni authenticated (table, colonne, MAINTAIN en 17)',
       case when not exists (
         select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
          where has_table_privilege(r, 'public.signalements_preuves', p))
             and not exists (select 1 from unnest(array['anon', 'authenticated']) r
                              where has_any_column_privilege(r, 'public.signalements_preuves', 'SELECT,INSERT,UPDATE,REFERENCES'))
             and case when current_setting('server_version_num')::int >= 170000
                      then not exists (select 1 from unnest(array['anon', 'authenticated']) r
                                        where has_table_privilege(r, 'public.signalements_preuves', 'MAINTAIN'))
                      else true end then 'OK' else 'ECHEC' end
union all select 'signalements_preuves : service_role lit et efface, n''écrit ni ne réécrit (pas même une colonne)',
       case when has_table_privilege('service_role', 'public.signalements_preuves', 'SELECT')
             and has_table_privilege('service_role', 'public.signalements_preuves', 'DELETE')
             and not has_any_column_privilege('service_role', 'public.signalements_preuves', 'INSERT,UPDATE') then 'OK' else 'ECHEC' end
union all select 'report_id : clé primaire, référence reports(id) ON DELETE CASCADE (la preuve vit autant que le signalement)',
       case when exists (select 1 from pg_constraint where conrelid = 'public.signalements_preuves'::regclass and contype = 'p')
             and exists (select 1 from pg_constraint where conrelid = 'public.signalements_preuves'::regclass and contype = 'f'
                          and confrelid = 'public.reports'::regclass and confdeltype = 'c') then 'OK' else 'ECHEC' end
union all select 'colonnes copiées aux types de conv_messages (id, conv_id, from_id, content, created_at)',
       case when (select count(*) from (values ('message_id', 'id'), ('conv_id', 'conv_id'), ('auteur_id', 'from_id'), ('contenu', 'content'), ('envoye_le', 'created_at')) v(preuve, source)
                    join pg_attribute a on a.attrelid = 'public.signalements_preuves'::regclass and a.attname = v.preuve
                    join pg_attribute b on b.attrelid = 'public.conv_messages'::regclass and b.attname = v.source
                   where a.atttypid = b.atttypid) = 5 then 'OK' else 'ECHEC' end
union all select 'déclencheur AFTER INSERT ligne à ligne sur reports, limité aux messages, actif',
       case when exists (select 1 from pg_trigger t where t.tgrelid = 'public.reports'::regclass and t.tgname = 'trg_reports_preuve_message'
                          and t.tgenabled = 'O' and not t.tgisinternal
                          and pg_get_triggerdef(t.oid) like 'CREATE TRIGGER trg_reports_preuve_message AFTER INSERT ON public.reports FOR EACH ROW WHEN %''message''%')
            then 'OK' else 'ECHEC' end
union all select 'fonction : SECURITY DEFINER, search_path vide, non exécutable par anon ni authenticated',
       case when (select p.prosecdef and array_to_string(p.proconfig, ';') = 'search_path=""' from pg_proc p where p.oid = 'public.trg_reports_preuve_message()'::regprocedure)
             and not has_function_privilege('anon', 'public.trg_reports_preuve_message()', 'execute')
             and not has_function_privilege('authenticated', 'public.trg_reports_preuve_message()', 'execute') then 'OK' else 'ECHEC' end
union all select 'fonction : copie conditionnée à is_conv_member(conversation, signalant), erreurs levées en avertissement',
       case when (select prosrc from pg_proc where oid = 'public.trg_reports_preuve_message()'::regprocedure) like '%public.is_conv_member(m.conv_id, new.reporter_id)%'
             and (select prosrc from pg_proc where oid = 'public.trg_reports_preuve_message()'::regprocedure) like '%raise warning%' then 'OK' else 'ECHEC' end;

commit;
