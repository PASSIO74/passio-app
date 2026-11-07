-- ═══════════════════════════════════════════════════════════════════════════
-- PURGE COURTE D'analytics_events (2026-11-07) : LES LIGNES DU PLAFOND ET DES
-- CRÉNEAUX (`edge_*`) PARTENT APRÈS 2 HEURES, LES NOTES D'ENVOI (`push_envoye`)
-- APRÈS 8 JOURS — CHAQUE HEURE, PAR pg_cron.
--
-- Une transaction, REJOUABLE, FERMÉE SUR ÉCHEC : tableau de verdict de 10 lignes
-- (8 contrôles OK/ECHEC, 2 informations). Une ligne de contrôle en ECHEC lève une
-- exception avant `commit;` (SQLSTATE 55000) : RIEN n'est appliqué — ni la
-- fonction, ni la tâche, ni l'index, ni une seule ligne effacée.
-- Rien de personnel dans ce fichier ni dans son verdict : des nombres, des noms
-- d'événements techniques, des définitions.
--
-- LE DÉFAUT. Deux familles de lignes d'`analytics_events` ne servent que
-- quelques heures ou quelques jours, et vivaient 13 mois — la seule purge de la
-- table est `passio_purge_analytics` (migration_ouverture_publique_2026-09-11) :
--   · `edge_<fonction>` : UNE ligne par appel ACCEPTÉ d'une Edge Function
--     plafonnée (`verifierPlafondEnBase`, supabase/functions/_shared/plafond.js :
--     ask-ai, notify-call, export-account, pilotage, sentinelle-reveil), qui ne
--     relit que la DERNIÈRE HEURE ; et les créneaux de la veille
--     (`prendreCreneau`, _shared/autonomie.js : `edge_pilotage-veille`, deux
--     lignes par passage, relues par IDENTIFIANT pour la minute courante et la
--     suivante, jamais au-delà) ;
--   · `push_envoye` : la note de chaque envoi mesuré (alertes `systeme:pilotage`,
--     rappels `systeme:rappels`, appels `systeme:appels`, notifications sociales
--     `systeme:notifs` du lot #749). Le pilotage les relit sur 24 h (rappels,
--     appels, sociales) ou 48 h (`JUGEMENT_MAX_MS`, la dernière alerte) ; et il lit
--     la DERNIÈRE note du pilote sans borne de temps pour deux décisions :
--     l'essai des alertes (`essaiDu`, dû après 7 jours sans note) et l'essai
--     manuel (2 min entre deux envois).
--
-- LES LECTEURS, INVENTORIÉS LE 07/11 (dépôt entier + catalogue de production) :
--   · dépôt : les seuls lecteurs de ces lignes sont ceux ci-dessus
--     (plafond.js, autonomie.js, pilotage/index.ts : `lireReception`,
--     `essayerAlertes`, `essaiManuel`). Le digest, la veille de production, le
--     centre de pilotage (`dashboard/`, qui ne fait que COMPTER les lignes de la
--     table), `pilotage/` et la sauvegarde (qui exclut la table : observabilité
--     régénérable) n'en lisent aucune. L'export RGPD (`export-compte.js`) rend
--     les lignes d'un compte : il en rendra moins, sans rien perdre d'utile ;
--   · production : aucune fonction ni vue ne lit `analytics_events`
--     (pg_proc, pg_rewrite) ; la table n'est pas publiée (Realtime) ; ses seuls
--     déclencheurs sont BEFORE INSERT/UPDATE (trg_rate_limit,
--     zz_barriere_suppression) — rien ne réagit à un DELETE.
--
-- MESURÉ EN PRODUCTION au canal ① (execute_sql, lecture seule, 07/11 à 12:10 UTC) :
--   · 19 587 lignes, 4 376 Ko (tas 2,4 Mo, index 2,0 Mo : ≈ 229 octets par
--     ligne, index compris ; 222 mesurés le matin sur 19 534) ;
--   · `edge_pilotage-veille` : 13 322 lignes (68 % de la table), ≈ 400 par
--     jour depuis le 29/09 — 13 274 de plus de 2 h ; `edge_pilotage` : 455
--     (449) ; `edge_notify-call` : 33, la dernière le 23/10 ; `push_envoye` : 5
--     notes du pilote, toutes du jour ; le reste (5 772) : screen_view 5 230,
--     pilotage_etat 248, like_post 175, pilotage_battement 73, publish_post 39,
--     rappel_activite 7 ;
--   · le rôle des tâches pg_cron, `postgres`, est PROPRIÉTAIRE de la table et
--     BYPASSRLS (la RLS n'y est pas forcée) : sans cela, la table n'ayant aucune
--     policy DELETE, la purge effacerait 0 ligne SANS ERREUR (la ligne 3 du
--     verdict le refuse, la ligne 6 le mesure) ;
--   · pg_cron 1.6.4 (cron.timezone = GMT), PostgreSQL 17.6, collation de la base
--     en_US.UTF-8 (ICU) : un `like 'edge_%'` n'y emprunte aucun index btree ;
--   · à l'hypothèse de 100 000 inscrits (docs/AUTONOMIE_EXPLOITATION.md, ≥ 72 000
--     appels de notify-call par jour), le seul plafond de notify-call pèserait
--     ≈ 6 Go en 13 mois (le forfait Pro en inclut 8), les notes sociales ≈ 0,32 Go.
--
-- CE QUI CHANGE (et rien d'autre) :
--  ① `public.purger_analytics_courte(p_edge interval, p_notes interval)` :
--     efface les lignes `edge_*` plus vieilles que `p_edge` et les notes
--     `push_envoye` plus vieilles que `p_notes`, rend leurs nombres (jsonb).
--     SECURITY INVOKER, search_path vide, que ni PUBLIC, ni anon, ni
--     authenticated n'exécutent. PLANCHERS : sous 1 heure (`p_edge`) ou 7 jours
--     (`p_notes`), ou NULL, elle REFUSE (22023) sans rien effacer — elle ne
--     descend jamais sous ce que relisent ses lecteurs ;
--  ② la tâche `purge_analytics_courte`, chaque heure à :23 (UTC) :
--     `select public.purger_analytics_courte(interval '2 hours', interval '8 days')` ;
--  ③ la première purge, ICI : la commande planifiée est exécutée telle quelle
--     dans la transaction (pg_cron ne valide rien à la planification : une
--     commande cassée échouerait chaque heure dans cron.job_run_details, que rien
--     ne lit) — ≈ 13 750 lignes `edge_*` le jour de l'application ;
--  ④ l'index partiel `idx_analytics_edge_created` : (created_at) WHERE
--     starts_with(event, 'edge_'). Sans lui, chaque passage parcourrait TOUTE la
--     table (13 mois de screen_view à grande échelle) pour en trouver 3 heures ;
--     avec lui, il lit ce qu'il efface. Il reste petit : la purge borne les
--     lignes qu'il indexe.
--
-- POURQUOI `starts_with(event, 'edge_')` ET PAS `event like 'edge_%'` : dans un
-- LIKE, `_` est un JOKER — `edgeX…` y passerait — et son échappement (`\_`)
-- dépend de `standard_conforming_strings`. `starts_with` dit exactement « commence
-- par edge_ », et l'index partiel porte la même expression (le planificateur ne
-- l'emprunte que pour une condition identique).
--
-- POURQUOI 2 HEURES ET 8 JOURS :
--   · `edge_*` : le plafond relit la dernière heure (`gt created_at, now − 1 h`) ;
--     2 heures doublent sa fenêtre (dérive d'horloge entre la fonction et la
--     base comprise). Un créneau n'est relu qu'à sa minute et la suivante : les
--     minutes ne reviennent pas, une ligne de plus de 2 minutes n'est plus jamais
--     lue ;
--   · `push_envoye` : la lecture la plus longue est de 48 h. Et `essaiDu`
--     (_shared/reception.js) rend la MÊME décision pour une dernière note de plus
--     de 7 jours et pour aucune note (« dû », de jour) : toute purge au-delà de
--     7 jours lui est indifférente ; en deçà, un essai partirait trop tôt. D'où
--     le plancher de 7 jours et la marge d'un jour. `tests/unit/purge-analytics-
--     courte.test.mjs` rougit si une fenêtre de lecture (FENETRE_*_MS,
--     JUGEMENT_MAX_MS, ESSAI_INTERVALLE_MS, l'heure du plafond) dépasse un
--     plancher, ou si les deux décisions d'`essaiDu` cessent de coïncider ;
--   · la cadence horaire borne ce qui reste : au plus 3 h de lignes `edge_*`
--     (≈ 9 000 au haut de l'hypothèse, ≈ 2 Mo) et 8 jours et une heure de notes
--     (≈ 29 000 notes sociales, quelques Mo) — au lieu de 6,3 Go.
--
-- CE QUE LA PURGE COÛTE, dit tel quel : les lignes `edge_*` étaient, par
-- accident, la seule HISTOIRE d'usage des Edge Functions dans la base (le lot
-- #749 y a lu « 33 appels de notify-call depuis le 22/09 »). Après 2 heures,
-- cette histoire n'est plus lisible dans `analytics_events` ; les nombres
-- d'invocations du tableau de bord Supabase (Edge Functions) restent. Les notes
-- `push_envoye` d'un genre se comptent sur 8 jours (×10 pour les appels, ×20 pour
-- les sociales, qui sont échantillonnés). Les requêtes de vérification à la main
-- (docs/AUTONOMIE_EXPLOITATION.md § 10) ne montrent plus que 8 jours de notes.
-- Le texte de confidentialité (« 13 mois au maximum ») reste vrai.
--
-- ORDRE : indépendante du client et des fonctions (aucun PREREQUIS-CLIENT) :
-- aucune ligne qu'un lecteur relit ne disparaît. Compatible avec #749 (notes
-- sociales relues 24 h). Elle ne touche ni les policies, ni la publication, ni
-- l'identité de réplication, ni la purge des 13 mois (ligne 9 du verdict).
--
-- VERDICT : chaque affirmation est MESURÉE. Les lignes `edge_*` des 2 dernières
-- heures et les notes des 8 derniers jours sont relevées par IDENTIFIANT avant la
-- purge, et retrouvées après (ligne 7). Les essais des planchers (ligne 5) partent
-- dans une sous-transaction ANNULÉE : une fonction sans plancher n'effacerait
-- rien de vrai en le révélant. Le reste par le catalogue.
-- ⚠️ La ligne 7 peut rougir si, pendant la transaction, un compte est supprimé
-- (purge-compte efface ses lignes) : rien n'est alors appliqué, il suffit de
-- relancer.
--
-- Canal ③ d'ADR-012 : `node scripts/appliquer-migration.mjs migrations/migration_purge_analytics_courte_2026-11-07.sql --projet njkiyoklssvefstljemx`
-- (après la contre-revue de la PR et son attestation, .passio/migrations/README.md).
-- Rejouable ; banc : tests/sql/migration-purge-analytics-courte.test.sh.
-- RETOUR ARRIÈRE — exécutable tel quel en ôtant « --| » (le banc le rejoue). Il
-- arrête les purges FUTURES : les lignes déjà effacées ne reviennent pas (aucun
-- lecteur ne les relisait ; la sauvegarde n'emporte pas cette table). Il se joue
-- à l'éditeur SQL (canal ③), puis se MESURE au canal ① :
-- `select count(*) from cron.job where jobname = 'purge_analytics_courte'` rend 0,
-- `to_regprocedure('public.purger_analytics_courte(interval,interval)')` et
-- `to_regclass('public.idx_analytics_edge_created')` rendent NULL.
--| begin;
--| set local lock_timeout = '5s';
--| select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'purge_analytics_courte';
--| drop index if exists public.idx_analytics_edge_created;
--| drop function if exists public.purger_analytics_courte(interval, interval);
--| commit;
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- Un verrou qui ne vient pas en 5 s fait ÉCHOUER la migration (rien n'est
-- appliqué, elle se relance) au lieu de mettre en file, derrière elle, les
-- écritures d'analytics_events (le plafond de chaque Edge Function y écrit).
set local lock_timeout = '5s';

-- ── ⓪ CE QUI DOIT SURVIVRE, relevé par identifiant AVANT toute écriture ──
create temp table passio_pac_garder on commit drop as
select a.id
  from public.analytics_events a
 where (starts_with(a.event, 'edge_') and a.created_at >= pg_catalog.now() - interval '2 hours')
    or (a.event = 'push_envoye' and a.created_at >= pg_catalog.now() - interval '8 days');

-- ── ① LA PURGE : deux familles, deux rétentions, deux planchers ──
create or replace function public.purger_analytics_courte(p_edge interval, p_notes interval)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  n_edge  bigint;
  n_notes bigint;
begin
  -- Les planchers : jamais sous ce que relisent les lecteurs (le plafond relit
  -- la dernière heure ; essaiDu, la dernière note du pilote sur 7 jours).
  if p_edge is null or p_edge < interval '1 hour' then
    raise exception 'purger_analytics_courte : rétention des lignes edge_* sous 1 heure refusée (%)', p_edge
      using errcode = 'invalid_parameter_value',
            hint = 'le plafond des Edge Functions relit la dernière heure';
  end if;
  if p_notes is null or p_notes < interval '7 days' then
    raise exception 'purger_analytics_courte : rétention des notes push_envoye sous 7 jours refusée (%)', p_notes
      using errcode = 'invalid_parameter_value',
            hint = 'essaiDu relit la dernière note du pilote sur 7 jours';
  end if;
  delete from public.analytics_events
   where starts_with(event, 'edge_') and created_at < pg_catalog.now() - p_edge;
  get diagnostics n_edge = row_count;
  delete from public.analytics_events
   where event = 'push_envoye' and created_at < pg_catalog.now() - p_notes;
  get diagnostics n_notes = row_count;
  return pg_catalog.jsonb_build_object('edge', n_edge, 'notes', n_notes);
end
$fn$;
revoke all on function public.purger_analytics_courte(interval, interval) from public, anon, authenticated;

-- ── ② LA TÂCHE : chaque heure à :23 (UTC) ──
do $plan$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'purge_analytics_courte';
  perform cron.schedule('purge_analytics_courte', '23 * * * *',
    $q$select public.purger_analytics_courte(interval '2 hours', interval '8 days')$q$);
end
$plan$;

-- ── ③ LA PREMIÈRE PURGE : la commande PLANIFIÉE, exécutée ici telle quelle ──
do $exec$
declare
  cmd text;
  r   jsonb;
begin
  select j.command into cmd from cron.job j where j.jobname = 'purge_analytics_courte';
  execute cmd into r;
  perform pg_catalog.set_config('passio.purge_courte', coalesce(r::text, '{}'), true);
exception when others then
  perform pg_catalog.set_config('passio.purge_courte',
    pg_catalog.jsonb_build_object('erreur', left(sqlstate || ' ' || sqlerrm, 160))::text, true);
end
$exec$;

-- ── ④ L'INDEX PARTIEL : la purge lit ce qu'elle efface, jamais toute la table ──
-- Posé APRÈS la première purge : il se construit sur ce qui reste.
create index if not exists idx_analytics_edge_created
  on public.analytics_events (created_at)
  where starts_with(event, 'edge_');

-- ── ⑤ LES PLANCHERS, ESSAYÉS dans une sous-transaction ANNULÉE ──
do $essais$
declare
  e1 text := 'non essayé';
  e2 text := 'non essayé';
  e3 text := 'non essayé';
  e4 text := 'non essayé';
begin
  begin
    begin
      perform public.purger_analytics_courte(interval '59 minutes', interval '8 days');
      e1 := 'accepte';
    exception when invalid_parameter_value then e1 := '22023';
    end;
    begin
      perform public.purger_analytics_courte(interval '2 hours', interval '6 days 23 hours');
      e2 := 'accepte';
    exception when invalid_parameter_value then e2 := '22023';
    end;
    begin
      perform public.purger_analytics_courte(null, interval '8 days');
      e3 := 'accepte';
    exception when invalid_parameter_value then e3 := '22023';
    end;
    begin
      perform public.purger_analytics_courte(interval '2 hours', null);
      e4 := 'accepte';
    exception when invalid_parameter_value then e4 := '22023';
    end;
    -- Une fonction SANS plancher aurait effacé : tout ce bloc est annulé.
    raise exception using errcode = 'P0001', message = 'passio_essais_annules';
  exception when others then
    if sqlerrm is distinct from 'passio_essais_annules' then
      e1 := 'erreur ' || sqlstate;
    end if;
  end;
  perform pg_catalog.set_config('passio.purge_courte_planchers',
    pg_catalog.jsonb_build_object('edge_59min', e1, 'notes_6j23h', e2, 'edge_null', e3, 'notes_null', e4)::text, true);
end
$essais$;

-- ── ⑥ LE TABLEAU, relevé UNE fois dans une table temporaire détruite au commit,
-- lu par le garde-fou ⑦ et par le verdict. `bloquant` : les lignes 1 à 8 ; les
-- lignes 9 et 10 sont des informations.
create temp table passio_pac_verdict on commit drop as
with p as (select coalesce(nullif(current_setting('passio.purge_courte', true), ''), '{}')::jsonb as j),
     e as (select coalesce(nullif(current_setting('passio.purge_courte_planchers', true), ''), '{}')::jsonb as j),
     tache as (select j.jobname, j.schedule, j.command, j.active, j.username, j.database
                 from cron.job j where j.jobname = 'purge_analytics_courte')
select 1 as n, true as bloquant,
       'purge_analytics_courte : planifiée UNE fois, chaque heure à :23 (UTC), active, dans cette base'::text as controle,
       (select case when count(*) = 1 and bool_and(t.schedule = '23 * * * *' and t.active and t.database = current_database())
                    then 'OK' else 'ECHEC — ' || count(*) || ' tâche(s) de ce nom, ou horaire, état ou base inattendus' end
          from tache t) as valeur
union all select 2, true,
       'sa commande, à l''octet : select public.purger_analytics_courte(interval ''2 hours'', interval ''8 days'')',
       (select case when count(*) = 1 and bool_and(t.command = 'select public.purger_analytics_courte(interval ''2 hours'', interval ''8 days'')')
                    then 'OK' else 'ECHEC' end
          from tache t)
union all select 3, true,
       'le rôle qui l''exécute (cron.job.username) efface VRAIMENT : DELETE sur analytics_events, et la RLS ne l''arrête pas (superutilisateur, BYPASSRLS, ou propriétaire sans FORCE) — la table n''a aucune policy DELETE : sinon, 0 ligne effacée sans erreur',
       (select case when count(*) = 1 and bool_and(
                      r.oid is not null
                      and has_table_privilege(r.oid, 'public.analytics_events'::regclass, 'DELETE')
                      and (r.rolsuper or r.rolbypassrls
                           or not c.relrowsecurity
                           or (c.relowner = r.oid and not c.relforcerowsecurity)))
                    then 'OK' else 'ECHEC — rôle ' || coalesce(string_agg(coalesce(t.username, '?'), ','), 'aucune tâche') end
          from tache t
          left join pg_catalog.pg_roles r on r.rolname = t.username
          cross join pg_catalog.pg_class c
         where c.oid = 'public.analytics_events'::regclass)
union all select 4, true,
       'purger_analytics_courte(interval, interval) : SECURITY INVOKER, search_path vide, rend du jsonb, corps de cette migration à l''octet (md5, fins de ligne normalisées) ; ni PUBLIC, ni anon, ni authenticated ne l''exécutent',
       case when exists (select 1 from pg_catalog.pg_proc p
                          where p.oid = to_regprocedure('public.purger_analytics_courte(interval,interval)')
                            and not p.prosecdef
                            and array_to_string(p.proconfig, ';') = 'search_path=""'
                            and p.prorettype = 'jsonb'::regtype
                            and p.prolang = (select l.oid from pg_catalog.pg_language l where l.lanname = 'plpgsql')
                            and md5(replace(p.prosrc, chr(13) || chr(10), chr(10))) = '771cfb58a832efe34cafed97bc99fd0f'
                            and p.proacl is not null
                            and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)
                            and not has_function_privilege('anon', p.oid, 'EXECUTE')
                            and not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
            then 'OK' else 'ECHEC' end
union all select 5, true,
       'planchers : sous 1 heure pour edge_*, sous 7 jours pour les notes, ou NULL — refusés en 22023 (essais annulés, rien d''effacé)',
       (select case when (e.j->>'edge_59min', e.j->>'notes_6j23h', e.j->>'edge_null', e.j->>'notes_null') = ('22023', '22023', '22023', '22023')
                    then 'OK' else 'ECHEC — ' || e.j::text end
          from e)
union all select 6, true,
       'la commande planifiée, exécutée ici : plus AUCUNE ligne edge_* de plus de 2 heures, plus AUCUNE note push_envoye de plus de 8 jours',
       (select case when not (p.j ? 'erreur') and p.j ? 'edge' and p.j ? 'notes'
                         and not exists (select 1 from public.analytics_events a
                                          where starts_with(a.event, 'edge_') and a.created_at < pg_catalog.now() - interval '2 hours')
                         and not exists (select 1 from public.analytics_events a
                                          where a.event = 'push_envoye' and a.created_at < pg_catalog.now() - interval '8 days')
                    then 'OK' else 'ECHEC — ' || p.j::text end
          from p)
union all select 7, true,
       'rien de ce que relisent les lecteurs n''a disparu : chaque ligne edge_* des 2 dernières heures et chaque note des 8 derniers jours, relevée AVANT la purge, est toujours là (par identifiant)',
       (select case when count(*) = 0 then 'OK' else 'ECHEC — ' || count(*) || ' ligne(s) récente(s) effacée(s)' end
          from pg_temp.passio_pac_garder g
         where not exists (select 1 from public.analytics_events a where a.id = g.id))
union all select 8, true,
       'idx_analytics_edge_created : (created_at) WHERE starts_with(event, ''edge_''), valide',
       case when exists (select 1 from pg_catalog.pg_index i
                           join pg_catalog.pg_class ic on ic.oid = i.indexrelid
                          where i.indrelid = 'public.analytics_events'::regclass
                            and ic.relname = 'idx_analytics_edge_created'
                            and i.indisvalid and i.indisready
                            and pg_catalog.pg_get_indexdef(i.indexrelid)
                                = 'CREATE INDEX idx_analytics_edge_created ON public.analytics_events USING btree (created_at) WHERE starts_with(event, ''edge_''::text)')
            then 'OK' else 'ECHEC' end
union all select 9, false,
       'information — la purge des 13 mois (passio_purge_analytics) n''est pas touchée',
       coalesce((select 'présente : ' || j.schedule || ' · ' || btrim(j.command)
                   from cron.job j where j.jobname = 'passio_purge_analytics' limit 1), 'absente de cette base')
union all select 10, false,
       'information — effacé à l''application (lignes edge_*, notes), et ce qui reste dans analytics_events',
       (select 'edge_* : ' || coalesce(p.j->>'edge', '?') || ' · notes : ' || coalesce(p.j->>'notes', '?')
               || ' · restent ' || (select count(*) from public.analytics_events) || ' lignes ('
               || pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size('public.analytics_events'::regclass)) || ' sur disque)'
          from p);

-- ── ⑦ FERMÉ SUR ÉCHEC : une ligne de contrôle en ECHEC annule TOUT ──
-- Rien n'est alors appliqué — ni la fonction, ni la tâche, ni l'index, ni les
-- lignes effacées, ni la ligne de journal de l'outil d'application (même
-- transaction).
do $$
declare
  numeros text;
  details text;
begin
  select string_agg(c.n::text, ',' order by c.n), string_agg(c.n || '. ' || c.controle || ' → ' || coalesce(c.valeur, 'NULL'), ' ; ' order by c.n)
    into numeros, details
    from pg_temp.passio_pac_verdict c
   where c.bloquant and c.valeur is distinct from 'OK';
  if numeros is not null then
    raise exception 'purge courte d''analytics_events : la base n''est pas celle que cette migration suppose, ou la purge ne s''y comporte pas comme elle le doit — RIEN n''est appliqué. Lignes en échec : %', numeros
      using errcode = 'object_not_in_prerequisite_state', detail = details;
  end if;
end $$;

-- ── Verdict ──
select controle, valeur from pg_temp.passio_pac_verdict order by n;

commit;
