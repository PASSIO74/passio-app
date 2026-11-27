-- Cas du banc tests/sql/migration-story-sondage-score-auteur.test.sh.
-- Joués APRÈS cas-story-sondage-2026-11-26.sql, dont ils reprennent les aides (`banc.*`) et l'état :
-- sur la story publique sA de A, B a voté Plage (0), M Montagne (1) ; A a bloqué M.
-- Tout passe par anon / authenticated : un test sous un compte administrateur ne prouve rien.
set client_min_messages = warning;

-- ── Le score est celui de l'AUTEUR, le même pour tous ────────────────────────────────────────────
select banc.cas('B (spectateur) lit le score de l''AUTEUR : le vote de M, que A a bloqué, n''y est plus pour personne', banc.val(banc.id('B'), $s$select public.story_sondage_resultats('sA')::text$s$), '{"a": 1, "b": 0, "a_vote": true, "mon_choix": 0}');
select banc.cas('A lit le même score', banc.val(banc.id('A'), $s$select (public.story_sondage_resultats('sA') ->> 'a') || '/' || (public.story_sondage_resultats('sA') ->> 'b')$s$), '1/0');
select banc.cas('M, bloqué par A, ne lit plus rien', banc.val(banc.id('M'), $s$select coalesce(public.story_sondage_resultats('sA')::text, 'nul')$s$), 'nul');
delete from public.blocks where blocker_id = banc.id('A') and blocked_id = banc.id('M');
select banc.cas('A débloque M : son vote revient dans le score de tous', banc.val(banc.id('B'), $s$select public.story_sondage_resultats('sA')::text$s$), '{"a": 1, "b": 1, "a_vote": true, "mon_choix": 0}');

-- ── L'oracle par blocage est fermé (red team du 2026-11-27, P1) ──────────────────────────────────
-- Un spectateur qui bloque un votant, relit, puis débloque, n'apprend rien.
insert into public.blocks (blocker_id, blocked_id) values (banc.id('B'), banc.id('M'));
select banc.cas('oracle : B bloque M — le score que lit B ne bouge pas', banc.val(banc.id('B'), $s$select public.story_sondage_resultats('sA')::text$s$), '{"a": 1, "b": 1, "a_vote": true, "mon_choix": 0}');
delete from public.blocks where blocker_id = banc.id('B') and blocked_id = banc.id('M');
insert into public.blocks (blocker_id, blocked_id) values (banc.id('M'), banc.id('B'));
select banc.cas('oracle : M bloque B (l''autre sens) — le score que lit B ne bouge pas', banc.val(banc.id('B'), $s$select public.story_sondage_resultats('sA')::text$s$), '{"a": 1, "b": 1, "a_vote": true, "mon_choix": 0}');
select banc.cas('oracle : … ni celui que lit M', banc.val(banc.id('M'), $s$select public.story_sondage_resultats('sA')::text$s$), '{"a": 1, "b": 1, "a_vote": true, "mon_choix": 1}');
delete from public.blocks where blocker_id = banc.id('M') and blocked_id = banc.id('B');

-- ── Ce qui ne change pas ─────────────────────────────────────────────────────────────────────────
select banc.cas('B ne voit toujours pas la tendance d''une story où il n''a pas voté', banc.val(banc.id('B'), $s$select coalesce(public.story_sondage_resultats('sN')::text, 'nul')$s$), '{"a_vote": false}');
select banc.cas('l''auteur d''une story SANS vote lit 0 / 0 (agrégat sur zéro ligne)', banc.val(banc.id('A'), $s$select public.story_sondage_resultats('sN')::text$s$), '{"a": 0, "b": 0, "a_vote": true, "mon_choix": null}');
select banc.cas('l''auteur PRIVÉ lit le vote de son abonné accepté', banc.val(banc.id('P'), $s$select public.story_sondage_resultats('sP')::text$s$), '{"a": 0, "b": 1, "a_vote": true, "mon_choix": null}');
select banc.cas('un inconnu ne lit toujours pas les résultats d''une story privée', banc.val(banc.id('B'), $s$select coalesce(public.story_sondage_resultats('sP')::text, 'nul')$s$), 'nul');
select banc.cas('le compte bloqué par A ne lit toujours pas les résultats', banc.val(banc.id('K'), $s$select coalesce(public.story_sondage_resultats('sA')::text, 'nul')$s$), 'nul');
select banc.cas('anon n''appelle toujours pas la fonction', banc.val(null, $s$select public.story_sondage_resultats('sA')::text$s$), 'err:42501');
select banc.cas('identifiant nul : rien', banc.val(banc.id('B'), $s$select coalesce(public.story_sondage_resultats(null)::text, 'nul')$s$), 'nul');
