import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {prevol} from './serveur.mjs';

const ok={lecture_seule:true,cloture_exacte:true,journal_cible:true};
function scenario(operation,controle){
 const p={operation,lecture_catalogue_sha256:createHash('sha256').update('{}').digest('hex'),catalogue_attendu_sha256:'catalogue'};
 const v={lecture:{},fence:ok,base:{ro:true,bypass:true,structure_ok:true,privacy_catalogue:true,catalogue_fp:'catalogue',bucket:{nombre:1,prive:true,objets:14}}};
 if(controle!==undefined)v.profils_evenements=controle;
 let requete;
 const http={async lire(sql){requete=sql;return [{observation:v}];}};
 return {executer:()=>prevol(p,http),requete:()=>requete};
}
test('les deux lots exigent la clôture profiles/events et son inscription exacte au journal',async()=>{
 for(const op of ['RETRAIT_SANS_USAGE','RETRAIT_PHOTOS_RESTANTES']){
  const valide=scenario(op,ok);await valide.executer();assert.match(valide.requete(),/media_heritage_profils_evenements/);
  for(const champ of Object.keys(ok)){
   await assert.rejects(scenario(op,{...ok,[champ]:false}).executer(),/CLOTURE_PROFILS_EVENEMENTS/);
   await assert.rejects(scenario(op,{...ok,[champ]:null}).executer(),/CLOTURE_PROFILS_EVENEMENTS/);
  }
  await assert.rejects(scenario(op).executer(),/CLOTURE_PROFILS_EVENEMENTS/);
 }
});
test('les voies historiques gardent leur prévol propre',async()=>{
 for(const op of ['DEUX_COPIES','RETRAIT_PUBLIC']){
  const s=scenario(op);await s.executer();assert.doesNotMatch(s.requete(),/profils_evenements/);
 }
});
test('le prévol attend les octets de la migration canonique dans le journal de production',async()=>{
 const fichier='migrations/migration_cloture_references_profils_evenements_2026-11-19.sql';
 const ddl=readFileSync(new URL('../../../'+fichier,import.meta.url),'utf8').replaceAll('\r\n','\n');
 const empreinte=createHash('sha256').update(ddl).digest('hex');
 const s=scenario('RETRAIT_SANS_USAGE',ok);await s.executer();
 assert.ok(s.requete().includes("j.empreinte = '"+empreinte+"'"));
 assert.ok(s.requete().includes("j.fichier = '"+fichier+"'"));
});
