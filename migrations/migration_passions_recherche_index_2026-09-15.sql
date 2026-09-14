-- ═════════════════════════════════════════════════
-- RECHERCHE DE PASSIONS : une colonne de recherche indexée au lieu d'un
-- balayage de 5 000 lignes × leurs alias (PERF-01, mesuré le 2026-09-14)
--
-- MESURÉ sur le staging (même structure et même calcul que la production —
-- Micro, 2 vCPU partagés, 5 003 passions) avec scripts/charge.mjs :
--   `rpc/rechercher_passions` seule → p50 430 ms à 10 utilisateurs simultanés,
--   et ~15 requêtes/s au plafond quel que soit le nombre d'utilisateurs ;
--   le fil, les rencontres et un profil, eux, tiennent ~200 req/s à p95 ≈ 500 ms.
-- La cause est dans la fonction : pour CHAQUE ligne, `unnest(aliases)` puis
-- `unaccent_immutable(a) like '%q%'` — un calcul par alias, par ligne, par
-- appel, que le GIN sur `aliases` ne sert pas (il indexe l'égalité de tableau,
-- pas un LIKE sur des valeurs transformées). Une frappe dans « Rechercher »
-- coûtait donc ~0,4 s de CPU au serveur : dix personnes qui tapent en même
-- temps saturent le projet.
--
-- CE QUE FAIT CETTE MIGRATION :
--   ① une colonne `recherche` = libellé normalisé + alias normalisés, tenue à
--      jour par trigger (un calcul à l'ÉCRITURE, jamais à la lecture) ;
--   ② un index GIN trigram dessus (`gin_trgm_ops`) : `like '%q%'` et
--      `similarity()` deviennent des lectures d'index ;
--   ③ `rechercher_passions` cherche dans cette colonne — même signature, même
--      classement (les six paliers de score sont conservés, calculés sur les
--      seules lignes retenues), même plafond 50.
-- Rejouable ; verdict en fin. Retour arrière : le bloc commenté tout en bas.
-- ⚠️ pg_trgm vit dans `public` en production : le chemin de la fonction reste
-- `public, extensions, pg_temp` (fiche « search_path figé »), et l'opérateur
-- de classe est nommé sans schéma pour la même raison.
-- ═════════════════════════════════════════════════
begin;

-- pg_trgm est déjà là en production (schéma public) : no-op. Sur une base neuve
-- (banc), il le faut pour `gin_trgm_ops` et l'opérateur `%`.
create extension if not exists pg_trgm;

-- ① colonne + fonction de calcul + trigger
alter table public.passions add column if not exists recherche text;

create or replace function public.passions_recherche_calculer(p_label text, p_aliases text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(
    public.unaccent_immutable(coalesce(p_label, '')) || ' ' ||
    coalesce((select string_agg(public.unaccent_immutable(a), ' ') from unnest(coalesce(p_aliases, '{}'::text[])) a), ''),
    '[^a-z0-9 ]+', ' ', 'g'));
$$;

create or replace function public.trg_passions_recherche()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.recherche := public.passions_recherche_calculer(new.label, new.aliases);
  return new;
end $$;

drop trigger if exists trg_passions_recherche on public.passions;
create trigger trg_passions_recherche
  before insert or update of label, aliases on public.passions
  for each row execute function public.trg_passions_recherche();

-- remplissage (idempotent : ne réécrit que ce qui diffère)
update public.passions p
   set recherche = public.passions_recherche_calculer(p.label, p.aliases)
 where p.recherche is distinct from public.passions_recherche_calculer(p.label, p.aliases);

-- ② index trigram
create index if not exists passions_recherche_trgm on public.passions using gin (recherche gin_trgm_ops);
-- et le flou (faute de frappe : « randonee ») reste mesuré sur le LIBELLÉ seul,
-- comme avant — la similarité contre libellé + alias concaténés tombait sous le
-- seuil pour des fautes que l'ancienne fonction rattrapait (mesuré : « randonee »
-- rendait 6 résultats, la colonne seule en rendait 3 et un intrus).
create index if not exists passions_normalized_trgm on public.passions using gin (normalized_label gin_trgm_ops);

-- ③ la fonction cherche dans la colonne ; le score reste celui d'avant
create or replace function public.rechercher_passions(q text, lim integer default 20)
returns table(id text, label text, emoji text, color text, popularity integer, score integer)
language plpgsql
stable
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  n text := trim(regexp_replace(public.unaccent_immutable(coalesce(q, '')), '[^a-z0-9]+', ' ', 'g'));
begin
  if n = '' then
    return query
      select p.id, p.label, p.emoji, p.color, p.popularity, 0
        from public.passions p
       where p.status = 'active'
       order by p.popularity desc, p.sort_order
       limit least(greatest(coalesce(lim, 20), 1), 50);
    return;
  end if;
  return query
    select p.id, p.label, p.emoji, p.color, p.popularity,
           (case
              when p.normalized_label = n then 0
              when p.normalized_label like n || '%' then 10
              when exists (select 1 from unnest(p.aliases) a
                            where public.unaccent_immutable(a) = n) then 20
              when exists (select 1 from unnest(p.aliases) a
                            where public.unaccent_immutable(a) like n || '%') then 30
              when p.normalized_label like '%' || n || '%' then 40
              else 60
            end + case when p.is_broad then 5 else 0 end)::int as score
      from public.passions p
     where p.status = 'active'
       -- `%` = l'opérateur de similarité de pg_trgm (seuil 0,3 par défaut, le même
       -- que l'ancien `similarity() > 0.3`) : lui SEUL lit l'index, la fonction non.
       and (p.recherche like '%' || n || '%' or p.normalized_label % n)
     order by score, p.popularity desc, p.sort_order
     limit least(greatest(coalesce(lim, 20), 1), 50);
end $function$;

-- Les privilèges d'EXECUTE ne changent pas : CREATE OR REPLACE conserve ceux de
-- la fonction existante (anon et authenticated cherchent des passions).

-- ═══ VERDICT ═══
select 'colonne recherche' as controle,
       case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='passions' and column_name='recherche') then 'OK' else 'ECHEC' end as etat
union all
select 'remplie sur toutes les passions',
       case when not exists (select 1 from public.passions where recherche is null) then 'OK' else 'ECHEC' end
union all
select 'index trigram (colonne recherche + libellé)',
       case when exists (select 1 from pg_indexes where indexname='passions_recherche_trgm') and exists (select 1 from pg_indexes where indexname='passions_normalized_trgm') then 'OK' else 'ECHEC' end
union all
select 'trigger de mise à jour',
       case when exists (select 1 from pg_trigger where tgname='trg_passions_recherche') then 'OK' else 'ECHEC' end
union all
select 'la recherche répond (« randonee »)',
       case when (select count(*) from public.rechercher_passions('randonee', 5)) > 0 then 'OK' else 'ECHEC' end
union all
select 'un alias est trouvé (« jogging » → running)',
       case when exists (select 1 from public.rechercher_passions('jogging', 10) r where r.id = 'running') then 'OK'
            when not exists (select 1 from public.passions where id = 'running') then 'OK (pas de passion running dans cette base)'
            else 'ECHEC' end;

commit;

-- ═══ RETOUR ARRIÈRE (à coller séparément si besoin) ═══
-- begin;
-- drop index if exists public.passions_recherche_trgm;
-- drop index if exists public.passions_normalized_trgm;
-- drop trigger if exists trg_passions_recherche on public.passions;
-- drop function if exists public.trg_passions_recherche();
-- drop function if exists public.passions_recherche_calculer(text, text[]);
-- alter table public.passions drop column if exists recherche;
-- -- puis recréer rechercher_passions dans sa version d'avant
-- -- (migrations/migration_search_path_fonctions.sql en porte le corps).
-- commit;
