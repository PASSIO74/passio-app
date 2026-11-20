import test from 'node:test';
import assert from 'node:assert/strict';
import {identites,cycle} from './cycle.mjs';
import {CIBLE} from './parcours.mjs';

const f=identites('12345678'), key='secret-synthetique';
function scenario({interrompre=false,fermeture=true,muterSujet=false,initial=false}={}){
  let ouvert=initial,dernierStatut;
  const users=new Map(),tokens=new Map(),events=[],suppressions=[];
  const h={apikey:'anon-fixture'},enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const rep=(status,v)=>({status,bytes:Buffer.from(JSON.stringify(v))});
  const admin=r=>assert.equal(r.headers.authorization,'Bearer '+key);
  async function request(r){
    const url=new URL(r.url);assert.equal(url.origin,CIBLE);
    const body=r.body?JSON.parse(r.body):{},p=url.pathname;
    if(p.startsWith('/auth/v1/admin/users/')){
      admin(r);const id=p.split('/').pop(),v=users.get(id);return rep(v?200:404,v??{code:'user_not_found'});
    }
    if(p==='/auth/v1/admin/users'){
      admin(r);assert.equal(r.method,'POST');const {password,...rest}=body;
      const user={...rest,email_confirmed_at:new Date().toISOString()};users.set(user.id,user);return rep(200,user);
    }
    if(p==='/auth/v1/token'){
      const user=[...users.values()].find(u=>u.email===body.email);const access=enc({alg:'none'})+'.'+enc({sub:user.id,role:'authenticated',
        aud:'authenticated',iss:CIBLE+'/auth/v1',session_id:f.run,exp:Math.floor(Date.now()/1000)+3600})+'.eA';
      tokens.set(access,user.id);return rep(200,{user,access_token:access,refresh_token:'i'});
    }
    const uid=tokens.get(r.headers.authorization?.slice(7));assert.ok(uid);assert.equal(r.headers.apikey,h.apikey);
    if(p==='/rest/v1/profiles'){assert.equal(uid,body.id);return rep(uid===f.owner?200:201,[{id:uid,is_private:body.is_private}]);}
    if(p==='/rest/v1/follows'){
      if(r.method==='POST'){assert.equal(uid,f.reader);dernierStatut='pending';}
      if(r.method==='PATCH'){assert.equal(uid,f.owner);dernierStatut='accepted';}
      return rep(r.method==='POST'?201:200,[{follower_id:f.reader,following_id:f.owner,status:dernierStatut}]);
    }
    if(p==='/functions/v1/delete-account'){
      assert.equal(ouvert,false);assert.equal(r.method,'POST');users.delete(uid);suppressions.push(uid);
      return rep(200,{ok:true,garantie:'barriere',marqueur:'supprimee'});
    }
    assert.fail('ROUTE');
  }
  const args={f,service:key,artefact:{anon:h.apikey},request,cap:async()=>ouvert,signaler:m=>events.push(m),
    budget:{nettoyage(){events.push('reserve');}},
    attendre:async(on,read)=>{ouvert=on;if(!fermeture&&!on)throw Error('CLOSE');assert.equal(await read(),on);},
    verifier:async sessions=>{assert.equal(sessions.size,2);assert.equal(dernierStatut,'accepted');events.push('pages');
      if(muterSujet) users.get(f.owner).app_metadata.passio_recette='autre';
      if(interrompre)throw Error('INTERROMPU');}};
  return {args,events,users,suppressions};
}
test('deux sessions ordinaires, cockpit fermé avant purge de chaque sujet',async()=>{
 const s=scenario();assert.equal(await cycle(s.args),true);assert.equal(s.users.size,0);
 assert.deepEqual(s.suppressions,[f.reader,f.owner]);assert.ok(s.events.includes('RANGEMENT_VERIFIE'));});
test('échec des pages, fermeture demandée et deux purges encore vérifiées',async()=>{
 const s=scenario({interrompre:true});await assert.rejects(cycle(s.args),/INTERROMPU/);
 assert.equal(s.users.size,0);assert.ok(s.events.includes('CAPACITES_FERMEES'));});
test('sujet divergent laissé en place et rangement rouge',async()=>{
 const s=scenario({muterSujet:true});await assert.rejects(cycle(s.args),/FIN_INCOMPLETE/);
 assert.deepEqual(s.suppressions,[f.reader]);assert.ok(s.users.has(f.owner));});
test('capacités déjà ouvertes, aucun compte créé',async()=>{
 const s=scenario({initial:true});await assert.rejects(cycle(s.args),/INITIAL_OUVERT/);assert.equal(s.users.size,0);
 assert.deepEqual(s.suppressions,[]);});
