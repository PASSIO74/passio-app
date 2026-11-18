// Contrat fermé de la clôture héritée. Aucun commentaire libre ni rôle arbitraire.
const crypto = require('node:crypto');
const MARQUE = 'PASSIO protected-media heritage fence v1 2026-11-16';
const fonctions = [
  ['public.media_heritage_stockage_public(text,text)','5fffeefbabb107c0724afd682331d7bb'],
  ['public.media_heritage_ref_categorie(text)','5efdfd83881c420de19ac9c558dc10a2'],
  ['public.media_heritage_refs(jsonb)','755aa2a97100d677a60f0b7050a5fd9c'],
  ['public.media_heritage_stockage()','3c0fd7dc87072e1b997423a9f71cccdb'],
  ['public.media_heritage_references()','f49cbb2b1a5e5b8bc7bd722d923841dc'],
];
const policies = [['media_heritage_insert','b63461b258283aa19bb3ea5f1aa01f5a'],['media_heritage_update','206de6743af1c940172428d941f39492']];
const triggers = [
  ['storage.objects','media_heritage_stockage','d3a91cb38d1af877ef2d734227594877'],
  ['public.posts','media_heritage_references','be8128742749f087291aa8abd1f27917'],
  ['public.stories','media_heritage_references','7b8048a59ac788218d20bba433dd04df'],
];
const litt = s => "'"+s.replaceAll("'","''")+"'";
const valeurs = lignes => lignes.map(l=>'('+l.map(litt).join(',')+')').join(',');
const hashes = new Map([
  ...fonctions.map(([id,h])=>['fonction:'+id,h]),
  ...policies.map(([id,h])=>['policy:'+id,h]),
  ...triggers.map(([t,n,h])=>['trigger:'+t+'.'+n,h]),
]);
const SQL = `select 'fonction:'||v.signature as identite,p.oid is not null as presente,
  pg_catalog.obj_description(p.oid,'pg_proc') as marque,
  pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) as empreinte,
  null::text as definition,null::text as etat,
  case when p.oid is null then false when v.signature in (${fonctions.slice(0,3).map(f=>litt(f[0])).join(',')}) then
    not exists(select 1 from pg_catalog.pg_class c
      where c.oid in (pg_catalog.to_regclass('storage.objects'),pg_catalog.to_regclass('public.posts'),pg_catalog.to_regclass('public.stories'))
        and not pg_catalog.has_function_privilege(pg_catalog.pg_get_userbyid(c.relowner),p.oid,'EXECUTE'))
    else true end as proprietaires_ok,true as roles_ok
from (values ${valeurs(fonctions)}) v(signature,attendue)
left join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(v.signature)
union all
select 'policy:'||v.nom,p.oid is not null,pg_catalog.obj_description(p.oid,'pg_policy'),
  pg_catalog.md5(coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'')||'|'||coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),'')||'|'||p.polcmd::text||'|'||p.polpermissive::text),
  null::text,null::text,true,p.polroles=array['authenticated'::pg_catalog.regrole::oid]
from (values ${valeurs(policies)}) v(nom,attendue)
left join pg_catalog.pg_policy p on p.polrelid=pg_catalog.to_regclass('storage.objects') and p.polname=v.nom
union all
select 'trigger:'||v.tableau||'.'||v.nom,t.oid is not null,pg_catalog.obj_description(t.oid,'pg_trigger'),
  pg_catalog.md5(pg_catalog.pg_get_triggerdef(t.oid)),pg_catalog.pg_get_triggerdef(t.oid),t.tgenabled::text,true,true
from (values ${valeurs(triggers)}) v(tableau,nom,attendue)
left join pg_catalog.pg_trigger t on t.tgrelid=pg_catalog.to_regclass(v.tableau) and t.tgname=v.nom and not t.tgisinternal`;

const attenduSQL = '(case d.identite '+[...hashes].map(([k,v])=>'when '+litt(k)+' then '+litt(v)).join(' ')+' end)';
function verifierSQL({avant=false}={}) {
  return `do $passio_cloture_reprise$
declare d record; n integer:=0;
begin
  for d in ${SQL} loop
    if d.presente then
      n:=n+1;
      if d.empreinte is distinct from ${attenduSQL}
        or d.roles_ok is distinct from true
        or (d.identite like 'trigger:%' and d.etat is distinct from 'A')
        ${avant?`or d.marque is distinct from ${litt(MARQUE)} or not d.proprietaires_ok`:''}
      then raise exception 'reprise_cloture_catalogue_incompatible'; end if;
    ${avant?'':"else raise exception 'reprise_cloture_objet_absent';"}
    end if;
  end loop;
  if n not in (${avant?'0,10':'10'}) then raise exception 'reprise_cloture_partielle'; end if;
end $passio_cloture_reprise$;`;
}

function preconditions() { return verifierSQL({avant:true}); }
function rendre(rows) {
  if(!Array.isArray(rows)||rows.length!==10||new Set(rows.map(r=>r.identite)).size!==10
    ||rows.some(r=>!hashes.has(r.identite)||typeof r.presente!=='boolean')) throw Error('reprise_cloture_source_inconnue');
  if(rows.every(r=>!r.presente)) return [];
  if(rows.some(r=>!r.presente||r.marque!==MARQUE||r.empreinte!==hashes.get(r.identite)||r.proprietaires_ok!==true||r.roles_ok!==true
    ||r.identite.startsWith('trigger:')&&r.etat!=='A')) throw Error('reprise_cloture_source_partielle_ou_derivee');
  const stockage=rows.find(r=>r.identite==='trigger:storage.objects.media_heritage_stockage');
  if(typeof stockage.definition!=='string'||crypto.createHash('md5').update(stockage.definition).digest('hex')!==hashes.get(stockage.identite)) throw Error('reprise_cloture_definition_divergente');
  return [
    `do $passio_stockage_reprise$ begin ${stockage.definition}; exception when duplicate_object then null; end $passio_stockage_reprise$;
alter table storage.objects enable always trigger media_heritage_stockage;`,
    verifierSQL(),
    ...fonctions.map(([f])=>`comment on function ${f} is ${litt(MARQUE)};`),
    ...policies.map(([p])=>`comment on policy ${p} on storage.objects is ${litt(MARQUE)};`),
    ...triggers.map(([t,n])=>`comment on trigger ${n} on ${t} is ${litt(MARQUE)};`),
    `do $passio_proprietaires_reprise$
declare nom text;
begin
  for nom in select distinct pg_catalog.pg_get_userbyid(relowner) from pg_catalog.pg_class
    where oid in ('storage.objects'::pg_catalog.regclass,'public.posts'::pg_catalog.regclass,'public.stories'::pg_catalog.regclass) loop
    execute pg_catalog.format('grant execute on function ${fonctions.slice(0,3).map(f=>f[0]).join(',')} to %I',nom);
  end loop;
end $passio_proprietaires_reprise$;`,
    preconditions(),
  ];
}

function rendreDeclencheurs(rows) {
  const ident=s=>'"'+String(s).replaceAll('"','""')+'"';
  const actions={O:'enable',A:'enable always',R:'enable replica',D:'disable'};
  return rows.map(r=>{
    if(!r||!Object.hasOwn(actions,r.etat)||typeof r.def!=='string'||!r.def.trim()||typeof r.sch!=='string'||typeof r.table_name!=='string'||typeof r.tgname!=='string') throw Error('reprise_declencheur_source_inconnu');
    return `do $$ begin\n  ${r.def};\nexception when duplicate_object then null; end $$;\nalter table ${ident(r.sch)}.${ident(r.table_name)} ${actions[r.etat]} trigger ${ident(r.tgname)};`;
  });
}
module.exports={SQL,MARQUE,preconditions,rendre,rendreDeclencheurs};
