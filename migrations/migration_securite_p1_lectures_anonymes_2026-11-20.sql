-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ P1 2026-11-20 — D10-03 / D10-04 : LES LECTURES SANS COMPTE LES PLUS CHÈRES SONT BORNÉES
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Se joue APRÈS
-- migration_securite_lot4_lectures_2026-11-15.sql. Aucun PREREQUIS-CLIENT : le client ne lit
-- jamais `passion_relations` (relu le 2026-11-20 : aucune occurrence dans js/ ni index.html), et
-- `rechercher_passions` garde sa signature, ses colonnes et ses bornes.
-- Banc : tests/sql/migration-securite-p1-2026-11-20.test.sh.
--
-- CE QUI COÛTAIT (contre-vérification du 2026-11-20, production, appels anonymes) :
--   ① `passion_relations` (10 012 lignes, deux clés étrangères vers `passions`) est lisible par
--     `anon` : l'imbrication `passions → passion_relations → passions → …` n'a pas de profondeur
--     maximale. Une seule requête anonyme d'UNE ligne à 5 niveaux a coûté 598 ms de base et 1,1 Mo.
--     La table ne sert qu'au référentiel généré hors ligne (scripts, rôle de service).
--   ② `rechercher_passions` note CHAQUE passion retenue (deux `unnest(aliases)` +
--     `unaccent_immutable` par ligne) avant de trier : un terme de trois lettres courant en retient
--     plus de mille (« ion » : 1 119 sur 5 007). La recherche reste utile aux visiteurs (premier
--     parcours, `first-run.js`) : on la garde ouverte, on borne son travail.
--
-- CE QUI CHANGE :
--   ① `passion_relations` : plus aucun droit pour `anon` ni `authenticated` (le rôle de service garde
--     les siens). Une imbrication qui la traverse est refusée en entier (42501).
--   ② `rechercher_passions` ne note plus que 300 candidats au plus : d'abord le libellé exact, puis
--     les libellés qui commencent par le terme, puis les plus populaires. Le client fusionne déjà ce
--     résultat avec sa recherche locale (le référentiel complet est sur l'appareil).
--
-- RESTE HORS BASE (voir le rapport du lot) : limite par adresse IP devant l'API, cache de bord,
-- `count=exact` servi aux visiteurs, recherche de personnes (`profiles`, lue en direct).
--
-- RETOUR ARRIÈRE (éditeur SQL) : corps de `rechercher_passions` de
-- migration_securite_lot4_lectures_2026-11-15.sql, puis
--| grant select, insert, update, delete on public.passion_relations to anon, authenticated;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $g$ declare h text; begin
 if to_regclass('public.passion_relations') is null
 or to_regprocedure('public.rechercher_passions(text,integer)') is null
 or to_regprocedure('public.unaccent_immutable(text)') is null then
  raise exception 'referentiel des passions absent : relire le schema';
 end if;
 select md5(btrim(regexp_replace(p.prosrc,'[[:space:]]+',' ','g'))) into h
  from pg_proc p where p.oid='public.rechercher_passions(text,integer)'::regprocedure;
 if h not in ('bde17cd2e07e04186fdd12f3c4eb9318','4b06867ec09051e379894c8e365c4040') then
  raise exception 'rechercher_passions different du catalogue relu';
 end if;
end $g$;

-- ── ① Aucune imbrication anonyme à travers les liens du référentiel ────────────────────────────
revoke all on public.passion_relations from anon, authenticated;

-- ── ② Une recherche note 300 candidats au plus ─────────────────────────────────────────────────
create or replace function public.rechercher_passions(q text, lim integer default 20)
 returns table(id text, label text, emoji text, color text, popularity integer, score integer)
 language plpgsql stable
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  n text := trim(regexp_replace(public.unaccent_immutable(left(coalesce(q, ''), 100)), '[^a-z0-9]+', ' ', 'g'));
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
  -- Sous trois caractères, le terme retient presque tout le référentiel : le client cherche
  -- localement ces frappes-là, le serveur ne répond rien.
  if char_length(n) < 3 then
    return;
  end if;
  -- La note (deux parcours d'alias par ligne) ne se calcule que sur 300 candidats au plus,
  -- choisis sans elle : libellé exact, puis préfixe, puis popularité (D10-03, 2026-11-20).
  return query
    with candidats as (
      select p.id as cid, p.label as clabel, p.emoji as cemoji, p.color as ccolor,
             p.popularity as cpop, p.sort_order as cordre, p.normalized_label as cnorm,
             p.aliases as calias, p.is_broad as clarge
        from public.passions p
       where p.status = 'active'
         -- `%` = l'opérateur de similarité de pg_trgm : lui SEUL lit l'index, la fonction non.
         and (p.recherche like '%' || n || '%' or p.normalized_label % n)
       order by (p.normalized_label = n) desc, (p.normalized_label like n || '%') desc,
                p.popularity desc, p.sort_order
       limit 300
    )
    select c.cid, c.clabel, c.cemoji, c.ccolor, c.cpop,
           (case
              when c.cnorm = n then 0
              when c.cnorm like n || '%' then 10
              when exists (select 1 from unnest(c.calias) a
                            where public.unaccent_immutable(a) = n) then 20
              when exists (select 1 from unnest(c.calias) a
                            where public.unaccent_immutable(a) like n || '%') then 30
              when c.cnorm like '%' || n || '%' then 40
              else 60
            end + case when c.clarge then 5 else 0 end)::int as score
      from candidats c
     order by score, c.cpop desc, c.cordre
     limit least(greatest(coalesce(lim, 20), 1), 50);
end $function$;

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'passion_relations : fermée aux visiteurs et aux comptes' as controle,
       case when not has_table_privilege('anon','public.passion_relations','select')
             and not has_table_privilege('authenticated','public.passion_relations','select')
             and has_table_privilege('service_role','public.passion_relations','select') then 'OK' else 'ECHEC' end as valeur
union all select 'rechercher_passions : 300 candidats notés au plus',
       case when (select prosrc from pg_proc where oid='public.rechercher_passions(text,integer)'::regprocedure) like '%limit 300%'
             and (select prosrc from pg_proc where oid='public.rechercher_passions(text,integer)'::regprocedure) like '%char_length(n) < 3%'
             and (select count(*) from public.rechercher_passions('ab', 20)) = 0 then 'OK' else 'ECHEC' end
union all select 'rechercher_passions : toujours ouverte aux visiteurs',
       case when has_function_privilege('anon','public.rechercher_passions(text,integer)','execute') then 'OK' else 'ECHEC' end;

commit;
