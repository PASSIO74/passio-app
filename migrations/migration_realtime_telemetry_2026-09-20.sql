-- ═══════════════════════════════════════════════════════════════════════════
-- LA TÉLÉMÉTRIE SORT DU TEMPS RÉEL — 91 % DU TRAVAIL DE RÉPLICATION DISPARAÎT
-- (2026-09-20)
--
-- MESURE (canal ① d'ADR-012, cumul 129 jours, production) :
--
--   décodage WAL (Realtime) ......... 6 839 636 appels, 48 763 s, 66,04 % du CPU
--   + seconde forme de décodage ........ 354 568 appels,  2 096 s,  2,84 %
--                                                        ───────   ──────
--                                                        50 859 s   68,9 %
--
-- Et le VOLUME qui alimente ce décodage, table par table (`pg_stat_user_tables`,
-- somme insert+update+delete sur les 12 tables publiées) :
--
--   telemetry_events ....... 481 554   (277 359 insert + 204 195 delete)  91,4 %
--   profiles ................ 20 748
--   posts .................... 6 934
--   video_lives .............. 6 583
--   notifications ............ 5 901
--   conv_messages ............ 1 901
--   les six autres ........... 3 135
--                             ───────
--   TOTAL ................... 526 756
--
-- **Une seule table fait 91,4 % de tout ce que la base réplique.** Et son unique
-- abonné est le Centre de pilotage (`dashboard/server/ingest.js`), c'est-à-dire
-- UN client, sur le poste de l'éditeur — pas les utilisateurs.
--
-- ⚠️ CE N'EST PAS UN DÉSAVEU DE LA MIGRATION DU 2026-09-19, QUI AVAIT RAISON.
-- Elle écrit noir sur blanc que retirer cette table « aurait éteint le tableau
-- de bord en direct, SANS une erreur » — il serait retombé sur son polling de
-- secours, donc le symptôme aurait été « c'est un peu en retard », jamais
-- « c'est cassé ». Ce raisonnement reste JUSTE. Ce qui change, c'est qu'on ne
-- se contente plus de retirer la table : le lot qui porte cette migration fait
-- du polling le chemin NOMINAL du pilotage (2 s au lieu de 5), retire la
-- souscription `postgres_changes` de son backend et retire l'alerte
-- « Realtime décroché » qui, sinon, crierait pour toujours sur un canal qu'on a
-- fermé exprès. On ne dégrade pas en silence : on change de mécanisme.
--
-- ⚠️ ORDRE D'APPLICATION, ET IL N'EST PAS NÉGOCIABLE :
--   ① le lot `dashboard/` est déployé sur le poste (polling nominal) ;
--   ② SEULEMENT ENSUITE cette migration.
-- Dans l'autre sens, le pilotage garderait une souscription qui reçoit
-- `SUBSCRIBED` et ne livre plus jamais rien — le défaut muet que la gate
-- `audit:realtime` existe pour empêcher. Le polling rattraperait tout, mais
-- personne ne saurait pourquoi le direct a disparu.
--
-- ⚠️ CE QUE CETTE MIGRATION NE PEUT PAS FAIRE, ET IL FAUT LE SAVOIR AVANT DE
-- L'ESPÉRER : restreindre les OPÉRATIONS publiées table par table. Mesuré le
-- 2026-09-20 — 229 613 changements (43,6 %) concernent des opérations que
-- PERSONNE n'écoute (le DELETE de la purge de télémétrie, l'INSERT et le DELETE
-- de `profiles`, le DELETE de `posts`…). Mais `pubinsert` / `pubupdate` /
-- `pubdelete` sont des colonnes de **`pg_publication`**, pas de
-- `pg_publication_rel` : le paramètre `publish` est réglable PAR PUBLICATION,
-- jamais par table. Seuls un filtre de lignes (`prqual`) et une liste de
-- colonnes (`prattrs`) sont par table. Ce gaspillage est donc réel et
-- inatteignable par ce chemin ; il disparaît ici parce que la table qui en
-- porte 89 % sort entièrement.
--
-- CE QUI NE CHANGE PAS : les données, les policies, les GRANT, la purge à 7
-- jours (`purge_telemetry_7j`), l'écriture depuis le client. Seule la
-- réplication logique de cette table cesse. Les canaux `broadcast` ne passent
-- pas par la publication et ne sont pas concernés.
--
-- REJOUABLE : oui. Un second passage ne trouve plus la table membre et le
-- `if exists` du bloc le dit sans lever — contrairement à la migration du
-- 2026-09-19, ce fichier peut être recollé sans annuler quoi que ce soit.
--
-- RETOUR ARRIÈRE (immédiat, aucune donnée touchée) :
--   alter publication supabase_realtime add table public.telemetry_events;
--   -- puis redéployer le pilotage d'avant ce lot, ou laisser le polling.
--
-- BANC : `tests/sql/migration-realtime-telemetry.test.sh`, qui EXÉCUTE ce
-- fichier sur un PostgreSQL jetable et éprouve trois mutations.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

do $$
declare
  membre boolean;
begin
  select exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'telemetry_events'
  ) into membre;

  if membre then
    execute 'alter publication supabase_realtime drop table public.telemetry_events';
    raise notice 'telemetry_events retirée de supabase_realtime';
  else
    raise notice 'telemetry_events n''était plus membre — rien à faire';
  end if;
end $$;

-- ── VERDICT ────────────────────────────────────────────────────────────────
-- ⚠️ IL NE SE CONTENTE PAS DE DIRE « OK » : il REFUSE de laisser passer un état
-- où une table que quelqu'un écoute encore aurait disparu. Un tableau de verdict
-- qui dirait OK quoi qu'il arrive est pire que pas de verdict — on croirait
-- avoir appliqué.
do $$
declare
  restantes int;
  telemetrie boolean;
  attendues constant text[] := array[
    'comment_interactions','conv_members','conv_messages','conv_reads',
    'event_comments','notifications','post_comments','post_likes',
    'posts','profiles','video_lives'
  ];
  manquante text;
begin
  select count(*) into restantes
    from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public';

  select exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'telemetry_events'
  ) into telemetrie;

  if telemetrie then
    raise exception 'ECHEC : telemetry_events est TOUJOURS publiée.';
  end if;

  -- Les onze autres doivent être intactes : ce lot ne touche qu'une table.
  foreach manquante in array attendues loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = manquante
    ) then
      raise exception 'ECHEC : % a disparu de la publication — ce lot ne devait retirer que telemetry_events.', manquante;
    end if;
  end loop;

  raise notice '① telemetry_events retirée ............................ OK';
  raise notice '② les 11 tables du produit sont intactes .............. OK (% publiées)', restantes;
  raise notice '③ à vérifier ENSUITE en base, pas sur ce tableau :';
  raise notice '   select count(*) from pg_publication_tables';
  raise notice '    where pubname = ''supabase_realtime'' and schemaname = ''public'';';
end $$;

commit;
