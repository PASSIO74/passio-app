-- ═══════════════════════════════════════════════════════════════════════════
-- SAUVEGARDE / REPRISE — le PROPRIÉTAIRE d'un objet Storage doit voyager
-- (ASTRA-26, quatrième contre-revue indépendante, 2026-09-15 · EXP-01/AUTH-05/SUP-10)
--
-- LE DÉFAUT. `scripts/sauvegarde-donnees.js` archive les objets par leur CHEMIN
-- et leurs OCTETS ; il ne capture pas `storage.objects.owner`, que la
-- plateforme pose à l'upload depuis le JWT de l'appelant. `restaurer-donnees.js`
-- les renvoie sous `service_role` : après une reprise, les objets n'ont donc
-- PLUS DE PROPRIÉTAIRE.
--
-- CE QUE ÇA CASSE, et ce n'est pas théorique : `objets_stockage_du_compte(uid)`
-- — l'autorité de purge de `delete-account` depuis ASTRA-11 — ne retrouve les
-- fichiers QUE par `owner`/`owner_id`. Une base restaurée rend donc
-- « supprimer mon compte » incapable de retrouver les PIÈCES JOINTES, qui sont
-- rangées par CONVERSATION (`attachments/<conv>/<fichier>`) et qu'aucun chemin
-- ne rattache à un compte. Le filet des huit dossiers `content/<dossier>/<uid>/`
-- ne les couvre pas : il est indexé par uid, elles ne le sont pas.
--
-- ⚠️ L'ÉDITION PAR LE PROPRIÉTAIRE TOMBE AUSSI. Les policies d'écriture de
-- `storage.objects` comparent `owner` à `auth.uid()` : un objet restauré sans
-- propriétaire n'est plus modifiable ni supprimable par la personne qui l'a
-- déposé. La reprise rendrait donc des fichiers ORPHELINS, lisibles mais
-- ingérables.
--
-- CE QUE FAIT CETTE MIGRATION, et rien d'autre : elle expose la LECTURE des
-- propriétaires à `service_role` seul, pour que la sauvegarde puisse les
-- archiver et la reprise les vérifier. Elle n'écrit rien, ne change aucune
-- policy, n'ajoute aucune colonne. Même patron que
-- `objets_stockage_du_compte` (ASTRA-11) : SECURITY DEFINER, `search_path`
-- vide, révoquée NOMMÉMENT à `anon` et `authenticated` — les privilèges par
-- défaut de Supabase accordent EXECUTE par des grants nominatifs qu'un
-- `revoke … from public` laisse entiers (mesuré le 2026-09-08).
--
-- ⚠️ CE N'EST PAS UN ORACLE : elle ne répond qu'à `service_role`, qui voit déjà
-- toute la table `storage.objects`. Elle ne donne donc AUCUN renseignement
-- nouveau à qui que ce soit — elle évite seulement à la sauvegarde d'avoir
-- besoin d'un accès SQL, qu'elle n'a pas (elle ne porte que la clé
-- `service_role`, jamais le jeton de l'API de gestion).
--
-- Rejouable ; verdict en fin. Retour arrière :
--   drop function if exists public.proprietaires_objets_stockage();
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create or replace function public.proprietaires_objets_stockage()
returns table (bucket_id text, name text, owner uuid, owner_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name, o.owner, o.owner_id
  from storage.objects o
  where o.metadata is not null
  order by o.bucket_id, o.name
$$;

comment on function public.proprietaires_objets_stockage() is
  'Propriétaire de chaque objet Storage (owner posé à l''upload). Service_role seulement : la sauvegarde les archive, la reprise les rétablit et les relit (ASTRA-26).';

revoke execute on function public.proprietaires_objets_stockage() from public;
revoke execute on function public.proprietaires_objets_stockage() from anon;
revoke execute on function public.proprietaires_objets_stockage() from authenticated;
grant execute on function public.proprietaires_objets_stockage() to service_role;

-- ── VERDICT ────────────────────────────────────────────────────────────────
select 'fonction posée' as controle,
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'proprietaires_objets_stockage') then 'OK' else 'ECHEC' end as valeur
union all select 'SECURITY DEFINER, search_path vide',
       case when (select prosecdef and array_to_string(proconfig, ';') = 'search_path=""'
                    from pg_proc where proname = 'proprietaires_objets_stockage') then 'OK' else 'ECHEC' end
union all select 'aucun droit pour anon ni authenticated',
       case when not has_function_privilege('anon', 'public.proprietaires_objets_stockage()', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.proprietaires_objets_stockage()', 'EXECUTE')
            then 'OK' else 'ECHEC' end
union all select 'service_role peut l''appeler',
       case when has_function_privilege('service_role', 'public.proprietaires_objets_stockage()', 'EXECUTE') then 'OK' else 'ECHEC' end
union all select 'elle rend bien les quatre colonnes',
       case when (select count(*) from unnest(array['bucket_id','name','owner','owner_id']) c
                   where c = any (select unnest(proargnames) from pg_proc where proname = 'proprietaires_objets_stockage')) = 4
            then 'OK' else 'ECHEC' end
union all select 'l''autorité de purge par propriétaire est intacte (ASTRA-11)',
       case when exists (select 1 from pg_proc where proname = 'objets_stockage_du_compte') then 'OK' else 'ECHEC' end;

commit;
