"use strict";
const ident = x => '"' + String(x).replace(/"/g, '""') + '"';

// Ce bloc vit DANS la transaction de chargement. La mémoire est locale au DO,
// jamais une table durable ni une lecture de catalogue séparée du verrou.
function encadrerTriggers(nom, corps, litteral) {
  const table = 'public.' + ident(nom);
  const relations = `with recursive r(oid) as (
    select _reprise_tg_racine union select i.inhrelid from pg_inherits i join r on i.inhparent=r.oid
  ) select coalesce(jsonb_agg(jsonb_build_object('oid',c.oid,'schema',n.nspname,'nom',c.relname) order by c.oid),'[]'::jsonb)
    from r join pg_class c using(oid) join pg_namespace n on n.oid=c.relnamespace`;
  const etats = `select coalesce(jsonb_agg(jsonb_build_object('oid',t.oid,'relation',t.tgrelid,'nom',t.tgname,
    'etat',t.tgenabled::text,'interne',t.tgisinternal) order by t.oid),'[]'::jsonb)
    from pg_trigger t where t.tgrelid in (select (x->>'oid')::oid from jsonb_array_elements(_reprise_tg_relations) x)`;
  const identites = `select coalesce(jsonb_agg(x-'etat' order by (x->>'oid')::oid),'[]'::jsonb) from jsonb_array_elements`;
  const bloc = `declare
  _reprise_tg_racine oid;
  _reprise_tg_relations jsonb; _reprise_tg_apres_relations jsonb;
  _reprise_tg_etats jsonb; _reprise_tg_apres_etats jsonb;
  _reprise_tg_avant_identites jsonb; _reprise_tg_apres_identites jsonb;
  _reprise_tg_r record; _reprise_tg_t record; _reprise_tg_action text;
begin
  lock table ${table} in access exclusive mode;
  _reprise_tg_racine := ${litteral(table)}::regclass::oid;
  ${relations} into _reprise_tg_relations;
  ${etats} into _reprise_tg_etats;
  if exists(select 1 from jsonb_array_elements(_reprise_tg_etats) x where x->>'etat' not in ('A','O','D','R'))
    then raise exception 'REPRISE_TRIGGER_ETAT_INCONNU'; end if;
  for _reprise_tg_r in select * from jsonb_to_recordset(_reprise_tg_relations) as r(oid oid,schema text,nom text) order by oid loop
    execute format('alter table only %I.%I disable trigger user',_reprise_tg_r.schema,_reprise_tg_r.nom);
  end loop;
  ${corps}
  ${relations} into _reprise_tg_apres_relations;
  if _reprise_tg_apres_relations is distinct from _reprise_tg_relations then raise exception 'REPRISE_TRIGGER_RELATIONS_MODIFIEES'; end if;
  ${etats} into _reprise_tg_apres_etats;
  ${identites}(_reprise_tg_etats) x into _reprise_tg_avant_identites;
  ${identites}(_reprise_tg_apres_etats) x into _reprise_tg_apres_identites;
  if _reprise_tg_avant_identites is distinct from _reprise_tg_apres_identites then raise exception 'REPRISE_TRIGGER_STRUCTURE_MODIFIEE'; end if;
  for _reprise_tg_t in
    select t.*,r.schema,r.nom as relation_nom
      from jsonb_to_recordset(_reprise_tg_etats) as t(oid oid,relation oid,nom text,etat text,interne boolean)
      join jsonb_to_recordset(_reprise_tg_relations) as r(oid oid,schema text,nom text) on r.oid=t.relation
      where not t.interne order by t.oid loop
    _reprise_tg_action := case _reprise_tg_t.etat when 'A' then 'enable always' when 'O' then 'enable'
      when 'D' then 'disable' when 'R' then 'enable replica' end;
    execute format('alter table only %I.%I %s trigger %I',_reprise_tg_t.schema,_reprise_tg_t.relation_nom,_reprise_tg_action,_reprise_tg_t.nom);
  end loop;
  ${etats} into _reprise_tg_apres_etats;
  if _reprise_tg_apres_etats is distinct from _reprise_tg_etats then raise exception 'REPRISE_TRIGGER_ETATS_NON_RESTAURES'; end if;
end`;
  return "set local lock_timeout='5s';\ndo " + litteral(bloc) + ";";
}
module.exports = { ident, encadrerTriggers };
