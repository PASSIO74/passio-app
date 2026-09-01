-- Ce que la PLATEFORME Supabase fournit et qu'un PostgreSQL nu n'a pas.
-- Recréé ici pour que le test exerce le VRAI chemin de la migration : sans ces
-- objets, les policies et le `grant` prendraient une branche de repli qui
-- n'existe nulle part en production.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
