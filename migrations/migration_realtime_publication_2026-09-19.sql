-- ═══════════════════════════════════════════════════════════════════════════
-- PUBLICATION REALTIME — retirer les 13 tables que PERSONNE n'écoute
-- (2026-09-19)
--
-- POURQUOI. Avec `postgres_changes`, Realtime décode le WAL de CHAQUE table
-- publiée puis évalue la RLS **par changement et par client abonné** : le coût
-- est en O(changements × clients connectés). Il ne grandit pas avec le nombre
-- d'utilisateurs, il grandit avec leur PRODUIT — c'est lui qui casse vers
-- quelques centaines de connectés, pas le pooler (dont la limite de 200,
-- mesurée le 2026-06-15 sur la compute Nano, est citée à tort depuis).
--
-- MESURÉ le 2026-09-19 : 25 tables publiées, **12 abonnées**. Les 13 autres
-- sont répliquées pour zéro destinataire, dont SIX tables `cdv_*` du Carnet de
-- voyage, RETIRÉ par ADR-011 le 2026-08-31.
--
-- ⚠️ `telemetry_events` RESTE PUBLIÉE, ET C'EST UNE CORRECTION D'UNE ANALYSE
-- FAUSSE. Elle avait été classée « aucun abonné » sur la seule lecture de
-- `js/` : le Centre de pilotage s'y abonne depuis son backend
-- (`dashboard/server/ingest.js:217`, clé service_role) et en tire tout son flux
-- SSE. La retirer aurait éteint le tableau de bord en direct, **sans une
-- erreur** — il serait retombé sur son polling de secours, donc le symptôme
-- aurait été « c'est un peu en retard », jamais « c'est cassé ».
-- Leçon : l'inventaire des abonnés se fait sur TOUT le dépôt, backend compris,
-- jamais sur le seul client. C'est ce que la gate `audit:realtime` fige.
--
-- ⚠️ CE QUI NE CHANGE PAS : les canaux `broadcast` (sonnerie, frappe, lives,
-- `broadcast_conv_message_to_users`) ne passent PAS par la publication — ils
-- vivent dans `realtime.messages` et ne sont pas concernés. Les tables gardent
-- leurs données, leurs policies et leurs GRANT : seule la réplication logique
-- cesse.
--
-- RETOUR ARRIÈRE : `alter publication supabase_realtime add table public.<t>;`
-- pour la table voulue. Aucune donnée n'est touchée, la reprise est immédiate.
--
-- BANC : `tests/sql/migration-realtime-publication.test.sh` (10 contrôles) —
-- reconstitue la publication RÉELLE de la production sur un PostgreSQL jetable,
-- APPLIQUE ce fichier, et éprouve la garde par RÉINJECTION : une variante qui
-- retirerait aussi `telemetry_events` doit LEVER et ne RIEN appliquer. Ramassé
-- automatiquement par `scripts/bancs-sql-restants.sh` en CI (rien à toucher
-- dans `.github/`).
--
-- ⚠️ AVANT DE S'ABONNER À UNE NOUVELLE TABLE, la republier ici ET l'inscrire
-- dans `scripts/realtime-publication.json` — la gate `npm run audit:realtime`
-- (dans `npm run verif`, donc en CI) refuse une souscription à une table non
-- publiée. Un `postgres_changes` sur une table absente de la publication ne
-- lève RIEN : il ne reçoit simplement jamais d'événement.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── Carnet de voyage : fonctionnalité RETIRÉE (ADR-011 §6, 2026-08-31) ──
alter publication supabase_realtime drop table public.cdv_lives;
alter publication supabase_realtime drop table public.cdv_live_steps;
alter publication supabase_realtime drop table public.cdv_live_comments;
alter publication supabase_realtime drop table public.cdv_live_reactions;
alter publication supabase_realtime drop table public.cdv_live_followers;
alter publication supabase_realtime drop table public.cdv_live_collaborators;
alter publication supabase_realtime drop table public.step_interactions;

-- ── Tables vivantes, mais aucune souscription `postgres_changes` nulle part ──
alter publication supabase_realtime drop table public.comment_likes;
alter publication supabase_realtime drop table public.conversations;
alter publication supabase_realtime drop table public.event_reactions;
alter publication supabase_realtime drop table public.events;
alter publication supabase_realtime drop table public.post_collaborators;
alter publication supabase_realtime drop table public.stories;

-- ── VERDICT ─────────────────────────────────────────────────────────────────
-- ⚠️ Ce tableau ne certifie que ce que SA version connaît : il ne dira jamais
-- « il manque quelque chose que j'ignore » (leçon du 2026-09-12, où un miroir
-- périmé avait imprimé OK sur trois `ALTER` au lieu de cinq). Après le coller,
-- on mesure l'ÉTAT en base (canal ① d'ADR-012), jamais ce tableau.
do $$
declare
  n_pub int;
  n_cdv int;
  n_tel int;
begin
  select count(*) into n_pub
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    join pg_class c on c.oid = pr.prrelid
   where p.pubname = 'supabase_realtime';

  select count(*) into n_cdv
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    join pg_class c on c.oid = pr.prrelid
   where p.pubname = 'supabase_realtime' and c.relname like 'cdv\_%';

  select count(*) into n_tel
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    join pg_class c on c.oid = pr.prrelid
   where p.pubname = 'supabase_realtime' and c.relname = 'telemetry_events';

  raise notice '① tables publiées : % (attendu 12) -> %', n_pub, case when n_pub = 12 then 'OK' else 'ECHEC' end;
  raise notice '② tables cdv_* restantes : % (attendu 0) -> %', n_cdv, case when n_cdv = 0 then 'OK' else 'ECHEC' end;
  raise notice '③ telemetry_events TOUJOURS publiée (pilotage) : % (attendu 1) -> %', n_tel, case when n_tel = 1 then 'OK' else 'ECHEC' end;

  -- Une garde, pas un rapport : si le pilotage perdait sa source, la
  -- transaction est annulée et rien n'est appliqué.
  if n_tel <> 1 then
    raise exception 'telemetry_events a disparu de la publication — le Centre de pilotage perdrait son flux SSE';
  end if;
  if n_pub <> 12 then
    raise exception 'publication à % tables au lieu de 12 — état inattendu, rien n''est appliqué', n_pub;
  end if;
end $$;

commit;
