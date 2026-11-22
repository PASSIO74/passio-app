// SQL de chargement uniquement. Les contraintes internes restent actives.
// Le verrou et le snapshot appartiennent à la même transaction que l'INSERT.
const ident = value => '"' + String(value).replaceAll('"', '""') + '"';
const litt = value => "'" + String(value).replaceAll("'", "''") + "'";

function suspendre(table) {
  const cible = 'public.' + ident(table);
  return `set local lock_timeout='5s';
lock table ${cible} in share row exclusive mode;
create temp table _passio_reprise_triggers on commit drop as
  select oid as identite, tgname::text as nom, tgenabled::text as etat
  from pg_catalog.pg_trigger where tgrelid=${litt(cible)}::pg_catalog.regclass and not tgisinternal;
alter table ${cible} disable trigger user;`;
}

function retablir(table) {
  const cible = 'public.' + ident(table);
  return `do $passio_reprise_triggers$
declare d record; action text;
begin
  if exists (
    select 1 from pg_temp._passio_reprise_triggers s full join
      (select oid, tgname, tgenabled from pg_catalog.pg_trigger
       where tgrelid=${litt(cible)}::pg_catalog.regclass and not tgisinternal) t
      on t.oid=s.identite and t.tgname::text=s.nom
    where s.identite is null or t.oid is null or t.tgenabled<>'D'
      or s.etat not in ('O','A','R','D')
  ) then raise exception 'reprise_declencheurs_inventaire_divergent'; end if;
  for d in select nom,etat from pg_temp._passio_reprise_triggers order by nom loop
    action := case d.etat when 'O' then 'enable' when 'A' then 'enable always'
              when 'R' then 'enable replica' when 'D' then 'disable' end;
    execute pg_catalog.format('alter table %I.%I %s trigger %I','public',${litt(table)},action,d.nom);
  end loop;
end $passio_reprise_triggers$;`;
}

module.exports = { suspendre, retablir };
