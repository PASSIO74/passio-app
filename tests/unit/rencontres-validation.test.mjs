import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const client=readFileSync(new URL('../../js/app-07-ia-explore-irl.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../../migrations/migration_rencontres_validation_2026-11-16.sql',import.meta.url),'utf8');
// Le parseur Node distingue accolades de code, chaînes, regex et templates.
// Chaque candidat doit être une expression de fonction COMPLÈTE et valide.
function extraireFonction(source,name){
 const declarations=[...source.matchAll(new RegExp('^(?:async )?function '+name+'\\(', 'gm'))];
 assert.equal(declarations.length,1,'déclaration unique : '+name);
 const debut=declarations[0].index;
 for(let fin=source.indexOf('\n}',debut);fin!==-1;fin=source.indexOf('\n}',fin+2)){
  const candidat=source.slice(debut,fin+2);
  try{new vm.Script('('+candidat+'\n)');return candidat;}catch(e){if(!(e instanceof SyntaxError))throw e;}
 }
 assert.fail('fonction complète introuvable : '+name);
}
function fn(name){return extraireFonction(client,name);}
function contexte(extra={}){let messages=[];let ouvert=0;const c=vm.createContext({toast:x=>messages.push(x),window:{_supaReal:true},_findCanonicalEvent:()=>({id:'e',convId:'evgrp_e'}),_canManageEvent:()=>true,openEventParticipantValidation:async()=>{ouvert++},...extra});return {c,messages,get ouvert(){return ouvert}};}
test('un refus ou zéro ligne de la RPC ne devient jamais un succès local',async()=>{
 for(const reponse of [{data:false},{data:null},{error:{code:'42501'}}]){const t=contexte({supa:{rpc:async()=>reponse}});vm.runInContext(fn('validerEventParticipant'),t.c);assert.equal(await t.c.validerEventParticipant('e','u',true),false);assert.equal(t.ouvert,0);assert.match(t.messages[0],/non confirmée/);}
});
test('une panne est rendue comme non confirmée',async()=>{const t=contexte({supa:{rpc:async()=>{throw Error('offline')}}});vm.runInContext(fn('validerEventParticipant'),t.c);assert.equal(await t.c.validerEventParticipant('e','u',false),false);assert.equal(t.ouvert,0);});
test('la validation attend le verdict vrai avant de rafraîchir',async()=>{let args;const t=contexte({supa:{rpc:async(n,a)=>{args={n,a};return {data:true}}}});vm.runInContext(fn('validerEventParticipant'),t.c);assert.equal(await t.c.validerEventParticipant('e','u',true),true);assert.equal(args.n,'valider_participant');assert.equal(args.a.p_user_id,'u');assert.equal(t.ouvert,1);});
test('une ancienne discussion locale ne contourne pas le refus serveur',async()=>{let sorties=0,entrees=0;const t=contexte({allEvents:()=>[],myRsvp:()=> 'going',getConversations:()=>[{id:'evgrp_e'}],_joinEventConversation:async()=>{entrees++;return false},closeEventDetail:()=>sorties++,goTo:()=>sorties++,setTimeout:()=>sorties++});vm.runInContext(fn('openEventChat'),t.c);await t.c.openEventChat('e');assert.equal(entrees,1);assert.equal(sorties,0);});
test('la coorganisation suspendue ne produit ni mutation ni notification',async()=>{const t=contexte();vm.runInContext(fn('openEventCoOrganizers')+'\n'+fn('toggleEventCoOrganizer'),t.c);await t.c.toggleEventCoOrganizer('e','u');assert.match(t.messages[0],/consentement/);});
test('contrat SQL : transaction, fermeture des droits et compteur indépendant du blocage',()=>{assert.match(sql,/begin;[\s\S]*commit;/);const corps=sql.split('function public.participants_compte')[1].split('$f$;')[0];assert.doesNotMatch(corps,/is_blocked_with|blocks/);assert.match(sql,/revoke all on schema rencontres_prive from public, anon, authenticated/);assert.match(sql,/revoke all on all functions in schema rencontres_prive/);assert.match(sql,/rencontres_prive.accords v using/);assert.match(sql,/identifiant_activite_reserve/);});

test('la gestion distingue approuvé et attente, sans reproposer de valider un approuvé',async()=>{
 let html='';const t=contexte({MY_UID:'orga',userById:u=>({name:u}),escapeHtml:x=>x,escapeJsArg:x=>x,openModal:x=>html=x,supa:{rpc:async()=>({data:[{user_id:'attente',rsvp:'going',valide:false},{user_id:'confirme',rsvp:'going',valide:true}]})}});
 vm.runInContext(fn('openEventParticipantValidation'),t.c);await t.c.openEventParticipantValidation('e');
 assert.match(html,/attente<\/span> <span>En attente/);assert.match(html,/confirme<\/span> <span>Validé/);
 assert.equal((html.match(/>Valider<\/button>/g)||[]).length,1);assert.equal((html.match(/>Retirer<\/button>/g)||[]).length,2);
});
test('is_conv_member préserve la garde de production sur autrui et le cas sans session',()=>{
 const corps=sql.split('function public.is_conv_member')[1].split('$f$;')[0];
 assert.match(corps,/_uid = auth.uid\(\)::text or auth.uid\(\) is null/);
 assert.match(corps,/m.conv_id = _conv_id and m.user_id = _uid/);
 assert.match(corps,/auth.uid\(\) is null or public.can_join_event_conversation/);
 assert.match(sql,/insert into rencontres_prive.coorganisations_anterieures[\s\S]*on conflict\(event_id\) do nothing/);
 assert.match(sql,/new.co_organizers := coalesce\(new.co_organizers/);
});

test('le nettoyage rejoué conserve les appartenances déjà approuvées',()=>{
 const nettoyage=sql.split('-- Fermer les appartenances héritées')[1].split('-- Tous les droits')[0];
 assert.match(nettoyage,/rencontres_prive.accords v using/);assert.match(nettoyage,/a.rsvp = 'going'/);
});

const clientSupa=readFileSync(new URL('../../js/app-08-ui-modals-tour.js',import.meta.url),'utf8');
function fonctionSupa(name){return extraireFonction(clientSupa,name);}
function creation(reponses={}){
 const appels=[];let miroir=0,sauve=0;const ev={id:'e',title:'Sortie'};
 const valeurs=[{}, {data:{id:'evgrp_e',created_by:'orga',is_group:true}},
   {data:{id:'e',conv_id:'evgrp_e'}}, {}, {data:{conv_id:'evgrp_e',user_id:'orga'}}];
 let numero=0;
 const supa={from(table){let action;const q={insert(){action='insert';return q},update(){action='update';return q},select(){action=action||'select';return q},eq(){return q},single(){return q},then(ok,ko){const i=numero++;appels.push(table+':'+action);return Promise.resolve(i in reponses ? reponses[i] : valeurs[i]).then(ok,ko)}};return q}};
 const c=vm.createContext({supa,MY_UID:'orga',window:{_supaReal:true},supaEnsureProfileExists:async()=>true,optionalCanonicalPassion:()=>null,
  _canManageEvent:()=>true,_ensureLocalEventConv:()=>miroir++,saveState:()=>sauve++});
 vm.runInContext(fonctionSupa('supaCreateEventConversation')+'\n'+fn('_joinEventConversation'),c);
 return {c,ev,appels,get miroir(){return miroir},get sauve(){return sauve}};
}
test('création du groupe : conversation prouvée, lien confirmé, créateur prouvé, puis état local',async()=>{
 const t=creation();assert.equal(await t.c._joinEventConversation(t.ev),true);
 assert.deepEqual(t.appels,['conversations:insert','conversations:select','events:update','conv_members:insert','conv_members:select']);
 assert.equal(t.ev.convId,'evgrp_e');assert.equal(t.miroir,1);assert.equal(t.sauve,1);
});
test('chaque échec du chemin de création interdit le succès et le miroir local',async()=>{
 for(let i=0;i<5;i++)for(const r of [undefined,{error:{code:'42501'}}]){
  const t=creation({[i]:r});assert.equal(await t.c._joinEventConversation(t.ev),false,`étape ${i}`);
  assert.equal(t.miroir,0);assert.equal(t.sauve,0);assert.equal(t.ev.convId,undefined);
 }
 for(const i of [1,2,4])for(const data of [null,{},[]]){
  const t=creation({[i]:{data}});assert.equal(await t.c._joinEventConversation(t.ev),false);assert.equal(t.miroir,0);
 }
});
test('les conflits ne valent succès que si les lectures prouvent les lignes attendues',async()=>{
 const t=creation({0:{error:{code:'23505'}},3:{error:{code:'23505'}}});
 assert.equal(await t.c._joinEventConversation(t.ev),true);
 const autre=creation({0:{error:{code:'23505'}},1:{data:{id:'evgrp_e',created_by:'tiers',is_group:true}}});
 assert.equal(await autre.c._joinEventConversation(autre.ev),false);assert.equal(autre.appels.length,2);
});

test('la création attend aussi la preuve du profil',async()=>{
 const t=creation();t.c.supaEnsureProfileExists=async()=>false;
 assert.equal(await t.c._joinEventConversation(t.ev),false);assert.equal(t.appels.length,0);assert.equal(t.miroir,0);
});

test('extraction builtin : accolades dans les templates et regex, fonction async entière',async()=>{
 const source='async function exemple(){\n const texte=`ligne\n} et ${"}"}`;\n const re=/[}]/;\n return [texte,re.test("}")];\n}\nfunction suivante(){throw Error("hors fonction")}';
 const c=vm.createContext({});vm.runInContext(extraireFonction(source,'exemple'),c);
 assert.deepEqual(Array.from(await c.exemple()),['ligne\n} et }',true]);
 assert.throws(()=>extraireFonction('function x(){\n','x'),/introuvable/);
 assert.throws(()=>extraireFonction('function x(){}\nfunction x(){}','x'),/unique/);
});
