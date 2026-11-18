import {createHash, randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const migrationFile = 'migrations/migration_cloture_medias_herites_go_2026-11-16.sql';
const migrationSha = '3d4d21649239b18222b908d65184c9431313e703c278152850e374ea2d186e4d';
const garde = `do $garde$ begin
  if not coalesce(current_database() ~ '^passio_fence_heritage_go_20261116_[0-9a-f]{12}$'
    and current_user = 'postgres' and inet_server_addr() = inet '127.0.0.1'
    and (select shobj_description(oid,'pg_database') from pg_database where datname=current_database())
      ~ '^PASSIO heritage synthetic [0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$',false)
    then raise exception 'banc_cloture_cible'; end if;
end $garde$;`;
const fonctions = ['media_heritage_stockage_public(text,text)', 'media_heritage_ref_categorie(text)',
  'media_heritage_refs(jsonb)', 'media_heritage_stockage()', 'media_heritage_references()'].map(s=>'public.'+s);
const noms = new Set(fonctions.map(f=>f.split('(')[0]));
const etats = {o:'enable', a:'enable always', r:'enable replica', d:'disable'};
const agreger = s => `select coalesce(json_agg(q),'[]'::json) from (${s}) q;`;
const exige = (expr, code) => `do $oracle$ begin if (${expr}) is not true then raise exception '${code}'; end if; end $oracle$;`;

function ecritureSousProprietaire(role, mode) {
  return `set local session_replication_role = ${mode};
set local role ${role};
do $ecriture$ begin
  begin
    insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values
      ('content','photos/00000000-0000-4000-8000-000000000001/qualification-${mode}.webp',
       '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','{"size":8}');
    raise exception 'banc_cloture_ecriture_acceptee';
  exception when insufficient_privilege then
    if sqlerrm <> 'medias_heritage_ecriture_fermee' then raise; end if;
  end;
end $ecriture$;
reset role;
set local session_replication_role = origin;`;
}

export function verifierRepriseCloture({root,sql}) {
  const checks = [];
  let categorie = 'sources_canoniques_du_banc';
  function verifier(ok) {
    if (ok !== true) throw Error('oracle_refuse');
    checks.push({categorie,ok:true});
  }
  try {
    const repo = path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
    if (!path.isAbsolute(root) || path.resolve(root)!==repo || typeof sql!=='function') throw Error('racine_refusee');
    const require = createRequire(import.meta.url);
    const R = require(path.join(repo,'scripts/restaurer-donnees.js'));
    const {ETAPES} = require(path.join(repo,'scripts/schema-executable.js'));
    const C = require(path.join(repo,'scripts/lib/reprise-cloture-medias.js'));
    const source = readFileSync(path.join(repo,migrationFile),'utf8').replaceAll('\r\n','\n');
    const corps = /^(?:--[^\n]*\n)*begin;\n([\s\S]*)\ncommit;\s*$/i.exec(source)?.[1];
    verifier(createHash('sha256').update(source).digest('hex')===migrationSha && !!corps
      && !/^\s*(?:begin|commit|rollback);\s*$/im.test(corps));
    const lancer = (s,options) => {
      const r=sql(garde+'\n'+s,options);
      if(!r || !Number.isInteger(r.status) || typeof r.text!=='string' || typeof r.error!=='string'
        || (r.status!==0 && options?.failure!==true)) throw Error('transport_refuse');
      return r;
    };
    const nonce = randomUUID().replaceAll('-','').slice(0,12);
    const parent = 'banc_parent_'+nonce, enfant = 'banc_enfant_'+nonce, role='banc_storage_'+nonce;
    const fonction = 'public.banc_declenche_'+nonce;
    const fk = 'banc_fk_'+nonce;
    const declencheurs = Object.keys(etats);
    const modes = `(select string_agg(tgname||':'||tgenabled::text,',' order by tgname) from pg_trigger
      where tgrelid='public.${enfant}'::regclass and not tgisinternal)='etat_a:A,etat_d:D,etat_o:O,etat_r:R'`;
    const ri = `(select count(*)=4 and bool_and(t.tgenabled='O') from pg_trigger t
      join pg_constraint c on c.oid=t.tgconstraint where t.tgisinternal and c.conrelid='public.${enfant}'::regclass
      and c.contype='f' and c.conname='${fk}')`;
    categorie='fixture_quatre_etats_et_fk';
    lancer(`begin; create table public.${parent}(id integer primary key);
create table public.${enfant}(id integer primary key,parent_id integer not null constraint ${fk} references public.${parent}(id));
insert into public.${parent} values(1);
create function ${fonction}() returns trigger language plpgsql as $$ begin raise exception 'declencheur_non_suspendu'; end $$;
${declencheurs.map(k=>`create trigger etat_${k} before insert on public.${enfant} for each row execute function ${fonction}();
alter table public.${enfant} ${etats[k]} trigger etat_${k};`).join('\n')}
${exige(modes+' and '+ri,'fixture_etats')} commit;`);
    verifier(true);
    const genere = (fn, paires) => fn(enfant,['id','parent_id'],JSON.stringify(paires.map(([id,parent_id])=>({id,parent_id}))),['id']);
    const etatExact = attendu => lancer(`select ${modes} and ${ri} and
      (select jsonb_agg(jsonb_build_array(id,parent_id) order by id) from public.${enfant})='${JSON.stringify(attendu)}'::jsonb;`).text==='t';
    categorie='lot_valide_donnees_et_quatre_etats';
    const initial = [[1,1],[2,1]];
    lancer(genere(R.ordreInsert,initial));
    verifier(etatExact(initial));
    categorie='lot_fk_refuse_transaction_annulee';
    const echec = lancer(genere(R.ordreInsert,[[3,1],[4,99]]),{failure:true});
    verifier(echec.status!==0 && /\b23503\b/.test(echec.error) && etatExact(initial));
    categorie='ligne_a_ligne_un_refus_quatre_etats';
    const ligne = lancer(genere(R.ordreLigneALigne,[[3,1],[4,99],[5,1]]));
    verifier(ligne.text.trim().split(/\r?\n/).length===1 && ligne.text.includes(fk) && ligne.text.endsWith('|1')
      && etatExact([...initial,[3,1],[5,1]]));

    categorie='cinq_sections_capturees_apres_cloture';
    function capturer(prefixe,filtrer,n) {
      const sections=ETAPES.filter(e=>e.titre.startsWith(prefixe));
      if(sections.length!==1) throw Error('section_inconnue');
      const [{sql:requete,rendu}]=sections;
      const rows=JSON.parse(lancer(agreger(requete)).text).filter(filtrer);
      if(rows.length!==n) throw Error('cardinalite_section');
      return {rows,ddl:rendu(rows).join('\n')};
    }
    const f = capturer('Fonctions (',r=>noms.has(/^CREATE OR REPLACE FUNCTION ([^(]+)\(/i.exec(r.def)?.[1]),5);
    const t = capturer('Déclencheurs',r=>r.sch==='public' && (
      r.table_name===enfant && declencheurs.some(k=>r.tgname==='etat_'+k) ||
      ['posts','stories'].includes(r.table_name) && r.tgname==='media_heritage_references'),6);
    const p = capturer('Policies RLS',r=>r.schemaname==='storage' && r.tablename==='objects' &&
      ['media_heritage_insert','media_heritage_update'].includes(r.policyname),2);
    const a = capturer('EXECUTE sur les fonctions',r=>noms.has(r.sig.split('(')[0]),20);
    const cloture = capturer('Clôture médias',()=>true,10);
    verifier(cloture.rows.every(r=>r.presente && r.marque===C.MARQUE && r.roles_ok===true));

    categorie='policy_public_refusee_source_et_cible';
    // Le changement de rôle est réel, sa transaction est annulée avant l'appel JS au rendu.
    const derive = JSON.parse(lancer(`begin; alter policy media_heritage_insert on storage.objects to public;
do $test$ begin
  begin execute $controle$${C.preconditions()}$controle$;
    raise exception 'banc_precondition_acceptee';
  exception when raise_exception then
    if sqlerrm<>'reprise_cloture_catalogue_incompatible' then raise; end if;
  end;
end $test$;
${agreger(C.SQL)} rollback;`).text);
    const parId = new Map(derive.map(r=>[r.identite,r]));
    const deriveIsolee = cloture.rows.every(r=>{
      const cible=parId.get(r.identite);
      return cible && Object.entries(r).every(([k,v])=>cible[k]===(
        k==='roles_ok' && r.identite==='policy:media_heritage_insert' ? false : v));
    });
    let sourceRefusee=false;
    try { C.rendre(derive); }
    catch(e) { sourceRefusee=e.message==='reprise_cloture_source_partielle_ou_derivee'; }
    verifier(derive.length===10 && deriveIsolee && sourceRefusee);

    categorie='restauration_du_catalogue_dans_une_transaction';
    const droits = fonctions.slice(0,3).map(s=>`has_function_privilege('${role}','${s}'::regprocedure,'EXECUTE')`);
    const exact = `select count(*)=10 and count(*) filter(where presente and marque='${C.MARQUE}'
      and roles_ok and proprietaires_ok)=10 and count(*) filter(where identite like 'trigger:%' and etat='A')=3
      from (${C.SQL}) q`;
    const preuves = [];
    function passage(nom) {
      preuves.push(nom);
      return `select 'banc_ok_${nom}';`;
    }
    const clone = lancer(`begin; create role ${role} nologin nosuperuser noinherit nobypassrls;
grant usage on schema storage,public to ${role};
alter table storage.objects owner to ${role};
drop trigger media_heritage_stockage on storage.objects;
drop trigger media_heritage_references on public.posts;
drop trigger media_heritage_references on public.stories;
${declencheurs.map(k=>`drop trigger etat_${k} on public.${enfant};`).join('\n')}
drop policy media_heritage_insert on storage.objects;
drop policy media_heritage_update on storage.objects;
drop function ${fonctions.join(',')} restrict;
${C.preconditions()}
${f.ddl}
${t.ddl}
${p.ddl}
${a.ddl}
${exige(droits.map(d=>'not '+d).join(' and '),'banc_grant_deja_present')}
${cloture.ddl}
${exige(exact,'banc_catalogue_inexact')}
${passage('dix_marques_trois_always')}
${exige(modes+' and '+ri,'banc_etats_differents')}
${passage('quatre_etats_et_fk_reconstruits')}
${exige(droits.join(' and '),'banc_droits_absents')}
${passage('trois_execute_proprietaire_storage')}
${ecritureSousProprietaire(role,'origin')}
${passage('refus_metier_proprietaire_origin')}
${ecritureSousProprietaire(role,'replica')}
${passage('refus_metier_proprietaire_replica')}
${corps}
${C.preconditions()}
${exige(exact,'banc_rejeu_inexact')}
${passage('rejeu_du_corps_original')}
rollback;`);
    const sorties = clone.text.split(/\r?\n/);
    verifier(sorties.includes('heritage ferme sur nouveaux ecrits sans exception BYPASSRLS; contenu existant conserve|OK'));
    for(const nom of preuves) {
      categorie=nom;
      verifier(sorties.filter(s=>s==='banc_ok_'+nom).length===1);
    }
    categorie='rollback_role_catalogue_et_etats';
    verifier(lancer(`select not exists(select from pg_roles where rolname='${role}') and (${exact}) and ${modes} and ${ri};`).text==='t');
    return {ok:true,checks};
  } catch {
    checks.push({categorie,ok:false});
    return {ok:false,checks};
  }
}
