-- ═══════════════════════════════════════════════════════════════════════════
-- TEST À VOLUME — les plans d'exécution tiennent-ils à 100 000 lignes ?
--
-- ⚠️ NE JAMAIS EXÉCUTER SUR LA PRODUCTION. Ce script fabrique des dizaines de
-- milliers de lignes ; sur la base réelle il polluerait le fil, les compteurs,
-- la télémétrie et le centre de pilotage, pour un bénéfice nul.
--
-- Où l'exécuter : sur une base CIBLE jetable — second projet Supabase, ou
-- Postgres local. C'est le MÊME prérequis que l'essai de restauration
-- (`docs/RECUPERATION.md`) : une base qui n'est pas la production. Les deux
-- derniers blancs de `PASSIO_PRODUCTION_READINESS.md` sont bloqués par cette
-- seule chose, et par aucun travail de développement.
--
-- Mode d'emploi :
--   1. restaurer une archive (npm run sauvegarde -- --complete) sur la cible ;
--   2. jouer ce script ;
--   3. comparer chaque plan à son équivalent en production.
--
-- Ce qu'on cherche : un `Seq Scan` là où la production fait un `Index Scan`.
-- Le temps absolu ne veut rien dire d'une machine à l'autre — c'est le CHOIX
-- du planificateur qui bascule, et il bascule d'un coup, pas progressivement.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── Volume ────────────────────────────────────────────────────────────────
-- 100 000 posts répartis sur 200 auteurs : de quoi sortir des plans « petite
-- table » sans attendre un quart d'heure. Les identifiants sont préfixés
-- `vol_` pour rester reconnaissables si le rollback n'a pas lieu.
insert into posts (id, user_id, author_name, text, created_at, likes)
select 'vol_p_' || g,
       'vol_u_' || (g % 200),
       'Auteur ' || (g % 200),
       'Publication de test à volume numéro ' || g,
       now() - (g || ' minutes')::interval,
       (g % 50)
from generate_series(1, 100000) g;

insert into post_likes (post_id, user_id, created_at)
select 'vol_p_' || (1 + (g % 100000)), 'vol_u_' || (g % 200), now()
from generate_series(1, 300000) g
on conflict do nothing;

insert into post_comments (id, post_id, user_id, author_name, text, created_at)
select 'vol_c_' || g, 'vol_p_' || (1 + (g % 100000)), 'vol_u_' || (g % 200),
       'Auteur ' || (g % 200), 'Commentaire ' || g, now()
from generate_series(1, 200000) g;

analyze posts; analyze post_likes; analyze post_comments;

-- ─── Les trois requêtes du chemin chaud ────────────────────────────────────
-- 1. Le fil : page la plus servie de l'application.
explain (analyze, buffers)
select * from posts order by created_at desc limit 30;

-- 2. Les likes d'un lot de posts (hydratation des compteurs du fil).
explain (analyze, buffers)
select post_id, count(*) from post_likes
where post_id in (select id from posts order by created_at desc limit 30)
group by post_id;

-- 3. Les commentaires d'un post ouvert.
explain (analyze, buffers)
select * from post_comments where post_id = 'vol_p_50000' order by created_at;

-- ─── Rien ne survit ────────────────────────────────────────────────────────
-- `rollback` et non `commit` : ce script mesure, il ne laisse pas de trace.
-- Si la session tombe avant cette ligne, tout est annulé de toute façon —
-- c'est précisément la raison d'être de la transaction.
rollback;
