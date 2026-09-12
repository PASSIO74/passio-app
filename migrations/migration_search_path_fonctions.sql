-- ═══════════════════════════════════════════════════════════════════════════
-- SEARCH_PATH FIGÉ SUR LES TROIS FONCTIONS MAISON QUI N'EN AVAIENT PAS
-- (2026-09-12)
--
-- Un seul copier-coller dans l'éditeur SQL de Supabase (canal ③ d'ADR-012),
-- UNE transaction, REJOUABLE, tableau de verdict à quatre lignes.
--
-- ⚠️ AUCUNE de ces trois fonctions n'est `SECURITY DEFINER` : elles s'exécutent
-- avec les droits de l'appelant. Ce lot est donc de la DÉFENSE EN PROFONDEUR,
-- pas la fermeture d'une porte ouverte — ne pas le présenter comme une faille.
-- Ce qu'il ferme : une fonction sans `search_path` résout ses appels NON
-- QUALIFIÉS dans le chemin de la SESSION APPELANTE. `storage_chemin_autorise`
-- est évaluée par les policies RLS de `storage.objects` : la faire dépendre
-- d'un réglage que l'appelant contrôle est exactement ce qu'on ne veut pas
-- d'un prédicat d'autorisation, même quand rien ne permet de l'exploiter
-- aujourd'hui.
--
-- ── CE QUI A ÉTÉ MESURÉ EN PRODUCTION LE 2026-09-12 (canal ① d'ADR-012) ──
--
-- `get_advisors` signale « Function Search Path Mutable » sur trois fonctions,
-- et 34 fonctions de `public` ont `proconfig IS NULL`. Les deux nombres ne se
-- contredisent pas : **31 de ces 34 appartiennent à l'extension `pg_trgm`**
-- (gin_*, gtrgm_*, similarity*, word_similarity*, set_limit, show_limit,
-- show_trgm, strict_word_similarity*). On n'y touche PAS : elles sont la
-- propriété de l'extension, un `ALTER` serait perdu à sa prochaine mise à jour,
-- et ce n'est pas notre code. Les trois qui restent sont les nôtres, et ce sont
-- exactement les trois que le linter nomme.
--
-- ── LE PIÈGE, ET IL EST SÉRIEUX ──
--
-- ⚠️ **`rechercher_passions` APPELLE `similarity()` SANS LE QUALIFIER.** C'est
-- une fonction de `pg_trgm`, installée dans `public` (mesuré). Le réglage que
-- Supabase recommande partout — `set search_path = ''` — CASSERAIT donc la
-- recherche de passions en production : « function similarity(text, text) does
-- not exist », sur le chemin le plus fréquenté du produit (5 001 passions, la
-- page Rechercher). Un correctif d'hygiène qui casse la recherche est pire que
-- le constat qu'il referme. Le banc le PROUVE par mutation.
--
-- ⚠️ **ET LES DEUX CONSTATS DU LINTER SONT COUPLÉS.** Le même rapport demande
-- aussi de sortir `pg_trgm` du schéma `public` (« Extension in Public »).
-- Appliquer CE conseil-là, plus tard, casserait `rechercher_passions` si son
-- chemin ne nommait que `public`. D'où `public, extensions, pg_temp` : le
-- schéma `extensions` EXISTE déjà dans ce projet (mesuré) et c'est là que
-- Supabase range les extensions. La fonction survit donc aux DEUX états, avant
-- comme après un déplacement de `pg_trgm`. Ne pas « simplifier » ce chemin.
--
-- ⚠️ **`pg_temp` EST NOMMÉ EN DERNIER, ET C'EST TOUT L'INTÉRÊT.** Quand il
-- n'est pas nommé, PostgreSQL le place IMPLICITEMENT EN TÊTE : n'importe quel
-- appelant peut alors créer une fonction temporaire qui masque la nôtre. Le
-- nommer à la fin le relègue derrière les vrais schémas. Ne jamais le retirer
-- en croyant durcir : son absence le remet devant.
--
-- ── POURQUOI DEUX RÉGLAGES DIFFÉRENTS, ET NON UN SEUL PAR SOUCI DE SYMÉTRIE ──
--
-- `unaccent_immutable` et `storage_chemin_autorise` n'appellent QUE des choses
-- déjà qualifiées ou du `pg_catalog` (toujours résolu, quel que soit le
-- chemin) : elles prennent le réglage le PLUS STRICT, `''`. Seule
-- `rechercher_passions` a besoin d'un chemin, et seulement à cause de
-- `similarity`. Harmoniser les trois sur `public, extensions, pg_temp`
-- affaiblirait les deux premières ; harmoniser sur `''` casserait la
-- troisième. Le commentaire de chaque ligne dit ce qu'elle résout.
--
-- ⚠️ `unaccent_immutable` N'UTILISE PAS l'extension `unaccent`, malgré son nom :
-- c'est un `translate()` écrit à la main (mesuré). Son chemin vide est donc sûr
-- — et le resterait même si `unaccent` était installé un jour.
--
-- ── CE FICHIER SE PROTÈGE LUI-MÊME, ET C'EST DÉLIBÉRÉ ──
--
-- ⚠️ La ligne ④ du verdict n'est PAS un rapport : elle APPELLE réellement
-- `rechercher_passions`. Sur une base où le chemin choisi ne résoudrait pas
-- `similarity`, elle LÈVE — la transaction est alors annulée et les trois
-- `ALTER` sont DÉFAITS. Autrement dit : ce fichier ne peut pas laisser la
-- recherche de passions muette derrière lui. Il échoue bruyamment plutôt que
-- de s'appliquer à moitié. Ne pas « assainir » cette ligne en un test de
-- présence : c'est une GARDE, pas une case à cocher. Le banc le prouve en
-- retirant pg_trgm (contrôle ⑧).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ① Ne dépend que de `pg_catalog` (`translate`, `lower`) → chemin VIDE.
alter function public.unaccent_immutable(text) set search_path = '';

-- ② Tout est déjà qualifié (`storage.foldername`, `public.is_conv_member`,
--    `auth.uid`) → chemin VIDE. C'est la fonction qui compte le plus ici :
--    elle est évaluée par les policies d'écriture de `storage.objects`.
alter function public.storage_chemin_autorise(text, text) set search_path = '';

-- ③ Appelle `similarity()` de pg_trgm SANS qualification. `public` pour l'état
--    d'aujourd'hui, `extensions` pour le jour où pg_trgm en sortira, `pg_temp`
--    nommé en dernier pour qu'il cesse d'être implicitement premier.
alter function public.rechercher_passions(text, integer)
  set search_path = public, extensions, pg_temp;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERDICT — tout doit dire OK.
-- ⚠️ `set search_path = ''` se RELIT `search_path=""` dans `pg_proc.proconfig`
-- (PostgreSQL réécrit la chaîne vide entre guillemets) : un verdict qui
-- comparerait à `search_path=` dirait ECHEC sur une migration pourtant
-- appliquée. Mesuré sur PostgreSQL 16.
-- ═══════════════════════════════════════════════════════════════════════════
with v(ordre, correctif, ok) as (
  select 1, '① unaccent_immutable : chemin vide',
         coalesce((select 'search_path=""' = any(p.proconfig) from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'unaccent_immutable'), false)
  union all select 2, '② storage_chemin_autorise : chemin vide',
         coalesce((select 'search_path=""' = any(p.proconfig) from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'storage_chemin_autorise'), false)
  union all select 3, '③ rechercher_passions : public, extensions, pg_temp',
         coalesce((select 'search_path=public, extensions, pg_temp' = any(p.proconfig) from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'rechercher_passions'), false)
  -- ⚠️ Le contrôle qui compte vraiment : la recherche de passions RÉPOND
  -- ENCORE. Un chemin figé qui casserait `similarity` rendrait les trois
  -- lignes ci-dessus vertes et le produit muet.
  union all select 4, '④ la recherche de passions répond toujours',
         (select count(*) >= 0 from public.rechercher_passions('a', 5))
)
select ordre, correctif, case when ok then 'OK' else 'ECHEC' end as verdict
from v order by ordre;

commit;
