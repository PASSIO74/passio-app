-- BANC LOCAL UNIQUEMENT, base vide passio_volume_go_<suffixe>, propriétaire local.
-- Aucun export de données. Réutilise les définitions cataloguées du banc social natif.
-- Auth est un bouchon JWT ; net/cron/Realtime sont muets ou écrivent localement.
-- Les fonctions de lecture, policies, contraintes et triggers métier sont les vrais SQL
-- ci-dessous, pas des remplacements permissifs. Les autres domaines ne sont pas mesurés.
-- Ce bootstrap est séparé de la transaction de volume ; rejouer sur une DB neuve.
\set ON_ERROR_STOP on
do $local$
begin
  if host(inet_server_addr()) is distinct from '127.0.0.1'
     or host(inet_client_addr()) is distinct from '127.0.0.1'
     or current_database() !~ '^passio_volume_go_[a-z0-9_]{1,32}$'
     or exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname in ('public','auth') and c.relkind in ('r','p')) then
    raise exception 'VOLUME GO bootstrap : base TCP loopback dédiée vide requise';
  end if;
end $local$;
set statement_timeout = '120s';
set lock_timeout = '3s';
\ir socle-production-2026-11-06.sql
\ir cas-social-visibilite-definitions.sql
\ir ../../../migrations/migration_story_interactions_2026-11-14.sql
\ir cas-social-visibilite-socle-recent.sql
\ir ../../../migrations/migration_social_visibilite_2026-11-16.sql
\ir ../../../migrations/migration_securite_lot1_2026-11-06.sql
\ir ../../../migrations/migration_securite_lot4_plafonds_2026-11-15.sql
\ir ../../../migrations/migration_securite_lot4_lectures_2026-11-15.sql
