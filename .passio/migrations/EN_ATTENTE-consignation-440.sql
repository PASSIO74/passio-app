-- ═══════════════════════════════════════════════════════════════════════════
-- EN ATTENTE D'AUTORISATION — NE PAS APPLIQUER SANS ACCORD EXPLICITE
--
-- Consignation RÉTROACTIVE de la migration de la PR #440 dans le journal de la
-- PRODUCTION (`njkiyoklssvefstljemx`). Mesuré le 2026-09-15 : son effet est en
-- base (`moderation_actions_action_check` admet `suspension` et `levee`), mais
-- elle n'a AUCUNE ligne de journal — pas même parmi les quatre reconstructions
-- `retroactif-2026-09-15`. Voir le dossier d'écart :
-- .passio/audits/BILAN_PASSIO_09-26/preuves/migrations/2026-09-15-ecart-440-migration-production.md
--
-- ⚠️ CE QUE CETTE LIGNE DIT, ET CE QU'ELLE NE DIT PAS.
--   · `applique_le` porte la date du JOUR DES FAITS, sans heure crédible :
--     l'heure « 13 h 30 » du corps de #440 n'est datée par aucune trace, et ses
--     deux lectures possibles (locale ou UTC) contredisent toutes deux le texte.
--     On écrit donc 2026-09-15 00:00 UTC, valeur manifestement conventionnelle,
--     ET la note le dit. Inventer 11:30 serait fabriquer une chronologie.
--   · `outil = 'retroactif-2026-09-15'` : même marquage que les quatre
--     reconstructions déjà présentes. Une reconstruction ne se déguise pas en
--     application par l'outil.
--   · `attestation` porte l'ÉTAT RÉEL de la revue : deux reviews COMMENTED de
--     PASSIO74, dont l'antériorité sur l'application n'est PAS établie. Ce champ
--     n'atteste pas une revue préalable ; il dit qu'il n'y en a pas de prouvée.
--   · `statut = 'consigne_retroactivement'` : distinct d'`applique`, pour qu'un
--     comptage ne confonde jamais les deux.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

insert into public.migrations_appliquees (fichier, empreinte, cible, attestation, outil, statut, applique_le)
values (
  'migrations/migration_moderation_suspension_2026-09-15.sql',
  '9d31f11aed00e9d8899abac021f591e9fb535a486d7d66c52fa16f99c174c723',
  'njkiyoklssvefstljemx',
  jsonb_build_object(
    'reconstruction', true,
    'pr', '#440',
    'revue', 'deux reviews COMMENTED de PASSIO74 (10:42:44Z sur f4d3c6c, 11:05:38Z sur f756041) — COMMENTED n''est pas une validation',
    'anteriorite_revue_prouvee', false,
    'heure_application', 'NON MESURÉE — « 13 h 30 » rapporté par le corps de #440, non daté par une trace ; applique_le est conventionnel',
    'cause', 'cible implicite (sans SUPABASE_PROJECT_REF) — ASTRA-33 ①, corrigé depuis',
    'consigne_le', '2026-09-15',
    'source', '.passio/audits/BILAN_PASSIO_09-26/preuves/migrations/2026-09-15-ecart-440-migration-production.md'
  ),
  'retroactif-2026-09-15',
  'consigne_retroactivement',
  timestamptz '2026-09-15 00:00:00+00'
);

select 'ligne de consignation #440 présente' as controle,
       case when exists (select 1 from public.migrations_appliquees
                          where fichier = 'migrations/migration_moderation_suspension_2026-09-15.sql'
                            and statut = 'consigne_retroactivement') then 'OK' else 'ECHEC' end as verdict
union all
select 'elle ne se fait pas passer pour une application par l''outil',
       case when not exists (select 1 from public.migrations_appliquees
                              where fichier = 'migrations/migration_moderation_suspension_2026-09-15.sql'
                                and outil = 'appliquer-migration.mjs') then 'OK' else 'ECHEC' end;

commit;
