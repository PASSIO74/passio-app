-- ═══════════════════════════════════════════════════════════
-- MÉNAGE DES PUBLICATIONS DE TEST MASQUÉES LE 04/11 (2026-11-12)
--
-- Une transaction, FERMÉE SUR ÉCHEC : une ligne de contrôle en ECHEC lève une
-- exception avant `commit;` (SQLSTATE 55000) et RIEN n'est effacé. Rien de
-- personnel dans ce fichier ni dans son verdict : des identifiants, des nombres.
--
-- LA DÉCISION. Le 04/11, à la demande de Benjamin, les 35 publications de ses trois
-- comptes de TEST (« ben test ordi », « Ben sur portable », « Ben test 1 sur
-- portable ») ont été MASQUÉES par 35 lignes `contenus_masques` (signaleurs = 0,
-- decision = 'garde', une seule instruction : masque_le = 2026-11-04 13:25:36.194882+00).
-- L'audit de stabilisation du 10/11 l'a relevé (STAB-05 / SRV-01) : 35 publications
-- sur 37 de la production, hors mécanisme, sans trace, qu'aucun geste du pilotage ne
-- rétablit. Le 12/11 Benjamin tranche : « on fait le ménage » — elles partent.
--
-- MESURÉ AU CANAL ① le 12/11 à 11:09 UTC (lecture seule) : 35 lignes de masquage,
-- 33 publications encore présentes (2 supprimées depuis par leur auteur), 3 auteurs,
-- 28 commentaires (dont 5 d'autres comptes), 29 « j'aime », 128 interactions,
-- 5 publications avec média, 1 partage d'un autre compte qui en cite une. Ces trois
-- auteurs n'ont AUCUNE autre publication.
--
-- SAUVEGARDE, AVANT : l'intégralité de ces lignes (publications, commentaires,
-- « j'aime », interactions, masquages, partage) est sur le poste de Benjamin, hors du
-- dépôt public : `.passio/sauvegardes/menage-publications-test-2026-11-12.json`
-- (dossier ignoré par git).
--
-- CE QUI CHANGE :
--  ① les publications visées sont SUPPRIMÉES. Les déclencheurs AFTER DELETE de
--    `posts` (migration_publications_supprimees_2026-11-04, R31) emportent leurs
--    commentaires, « j'aime », co-auteurs, réponses et réactions — par le même
--    chemin qu'une suppression faite par l'auteur dans l'application ;
--  ② les 35 lignes de masquage sont retirées (elles ne visent plus rien) ;
--  ③ une ligne par publication dans `moderation_actions` (action 'note') : le
--    déclencheur de journal de `contenus_masques` ne voit pas un DELETE.
-- CE QUI NE CHANGE PAS : les comptes de test (profils, messages, abonnements),
--  toute autre publication, le partage de l'autre compte (il garde son instantané,
--  comme tout partage dont la source a disparu). Les 5 MÉDIAS restent dans le seau
--  `content` : le stockage refuse un DELETE en SQL (`storage.protect_delete`) — ils
--  partent par l'API Storage (`npm run medias:orphelins`, clé de service).
--
-- L'ENSEMBLE EST FIGÉ : il est relevé une fois (table temporaire), sur le prédicat
-- EXACT du geste du 04/11, et la migration REFUSE si ce n'est plus 35 lignes de
-- masquage et au plus 35 publications — une base qui a bougé n'est pas celle que
-- cette migration suppose.
--
-- Canal ③ d'ADR-012 : `node scripts/appliquer-migration.mjs migrations/migration_menage_publications_test_2026-11-12.sql --projet njkiyoklssvefstljemx`
-- (après la contre-revue de la PR et son attestation, .passio/migrations/README.md).
-- RETOUR ARRIÈRE : il n'y en a pas en SQL — une suppression ne se défait que par la
-- SAUVEGARDE ci-dessus (réinsertion des lignes, `scripts/restaurer-donnees.js` sait
-- relire ce format table par table). Rejouer cette migration après application
-- échoue proprement (ligne 1 : l'ensemble n'est plus de 35) et n'efface rien.
-- ═══════════════════════════════════════════════════════════
begin;

-- ── ⓪ L'ENSEMBLE VISÉ, relevé une fois ──
create temp table passio_menage_masques on commit drop as
  select m.target_id
    from public.contenus_masques m
   where m.target_type = 'post'
     and m.signaleurs = 0
     and m.decision = 'garde'
     and m.masque_le = timestamptz '2026-11-04 13:25:36.194882+00';

create temp table passio_menage_posts on commit drop as
  select p.id from public.posts p where p.id in (select target_id from pg_temp.passio_menage_masques);

-- Ce qui doit survivre : toute autre publication, par identifiant.
create temp table passio_menage_garder on commit drop as
  select p.id from public.posts p where p.id not in (select id from pg_temp.passio_menage_posts);

create temp table passio_menage_avant on commit drop as
  select (select count(*) from pg_temp.passio_menage_masques) as masques,
         (select count(*) from pg_temp.passio_menage_posts) as posts,
         (select count(*) from public.post_comments c where c.post_id in (select id from pg_temp.passio_menage_posts)) as commentaires,
         (select count(*) from public.post_likes l where l.post_id in (select id from pg_temp.passio_menage_posts)) as likes,
         (select count(*) from public.comment_interactions i where i.post_id in (select id from pg_temp.passio_menage_posts)) as interactions;

-- ── ① ② ③ LE GESTE (seulement si l'ensemble est celui du 04/11) ──
do $$
declare a record;
begin
  select * into a from pg_temp.passio_menage_avant;
  if a.masques <> 35 or a.posts > 35 then
    raise exception 'ménage : l''ensemble n''est plus celui du 04/11 (% masquages, % publications) — RIEN n''est effacé', a.masques, a.posts
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  insert into public.moderation_actions (action, target_type, target_id, note)
    select 'note', 'post', t.target_id,
           'ménage du 2026-11-12 : publication de test supprimée sur décision de l''éditeur (audit de stabilisation, STAB-05)'
      from pg_temp.passio_menage_masques t;
  delete from public.posts p where p.id in (select id from pg_temp.passio_menage_posts);
  delete from public.contenus_masques m
   where m.target_type = 'post' and m.target_id in (select target_id from pg_temp.passio_menage_masques)
     and m.signaleurs = 0 and m.decision = 'garde';
end $$;

-- ── VERDICT ──
create temp table passio_menage_verdict (n int, bloquant boolean, controle text, valeur text) on commit drop;
insert into pg_temp.passio_menage_verdict
select 1, true, 'l''ensemble est celui du 04/11 : 35 masquages, au plus 35 publications',
       (select case when masques = 35 and posts <= 35 then 'OK' else 'ECHEC — ' || masques || ' / ' || posts end from pg_temp.passio_menage_avant)
union all select 2, true, 'plus aucune des publications visées',
       (select case when count(*) = 0 then 'OK' else 'ECHEC — ' || count(*) || ' restante(s)' end
          from public.posts p where p.id in (select id from pg_temp.passio_menage_posts))
union all select 3, true, 'plus aucun commentaire, « j''aime » ni interaction sur elles (déclencheurs R31)',
       (select case when c + l + i = 0 then 'OK' else 'ECHEC — ' || c || ' / ' || l || ' / ' || i end
          from (select (select count(*) from public.post_comments x where x.post_id in (select id from pg_temp.passio_menage_posts)) c,
                       (select count(*) from public.post_likes x where x.post_id in (select id from pg_temp.passio_menage_posts)) l,
                       (select count(*) from public.comment_interactions x where x.post_id in (select id from pg_temp.passio_menage_posts)) i) s)
union all select 4, true, 'plus aucun masquage du 04/11',
       (select case when count(*) = 0 then 'OK' else 'ECHEC — ' || count(*) end
          from public.contenus_masques m where m.target_id in (select target_id from pg_temp.passio_menage_masques) and m.signaleurs = 0)
union all select 5, true, 'aucune AUTRE publication n''a disparu (par identifiant)',
       (select case when count(*) = 0 then 'OK' else 'ECHEC — ' || count(*) || ' disparue(s)' end
          from pg_temp.passio_menage_garder g where not exists (select 1 from public.posts p where p.id = g.id))
union all select 6, true, 'une ligne de journal de modération par masquage retiré',
       (select case when count(*) = (select masques from pg_temp.passio_menage_avant) then 'OK' else 'ECHEC — ' || count(*) end
          from public.moderation_actions a
         where a.note like 'ménage du 2026-11-12 :%' and a.target_id in (select target_id from pg_temp.passio_menage_masques))
union all select 7, false, 'information — effacé',
       (select posts || ' publications, ' || commentaires || ' commentaires, ' || likes || ' « j''aime », ' || interactions || ' interactions ; restent '
               || (select count(*) from public.posts) || ' publications' from pg_temp.passio_menage_avant);

do $$
declare details text;
begin
  select string_agg(n || '. ' || controle || ' → ' || coalesce(valeur, 'NULL'), ' ; ' order by n) into details
    from pg_temp.passio_menage_verdict where bloquant and valeur is distinct from 'OK';
  if details is not null then
    raise exception 'ménage des publications de test : RIEN n''est appliqué — %', details
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end $$;

select controle, valeur from pg_temp.passio_menage_verdict order by n;

commit;
