import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {parse}=require('acorn');
const client=readFileSync(new URL('../../js/app-07-ia-explore-irl.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../../migrations/migration_rencontres_validation_2026-11-16.sql',import.meta.url),'utf8');
const ast=parse(client,{ecmaVersion:'latest'});
function fn(name){const n=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert.ok(n,name);return client.slice(n.start,n.end);}
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
