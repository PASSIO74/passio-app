// Serveur HTTP local exclusif, proxy navigateur refusant toute destination libre. Aucune session fournisseur.
import http from 'node:http';
import assert from 'node:assert/strict';
import {APERCU,CIBLE} from './parcours.mjs';
import {email} from './session-synthetique.mjs';
import {lireArtefact} from './apercu.mjs';
import {identites,verifierPages} from './cycle.mjs';
import {chromium} from 'playwright';
const artefact=lireArtefact(process.argv[2],'e59be1b8c52b733739d263817d8a3aeb94f0a4ae6f9e4a36f0533dae95f8726c');
const f=identites('12345678'), {owner:A,reader:B,run:RUN}=f;
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function sessionPour(id){
const exp=Math.floor(Date.now()/1000)+3600,token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:id,aud:'authenticated',role:'authenticated',iss:CIBLE+'/auth/v1',exp,session_id:RUN})+'.ZmFrZQ';
const user={id,email:email(id,RUN),email_confirmed_at:new Date().toISOString(),aud:'authenticated',role:'authenticated',app_metadata:{passio_recette:RUN,provider:'email',providers:['email']},user_metadata:{},identities:[]};
return {user,access_token:token,expires_at:exp,expires_in:3600,token_type:'bearer',refresh_token:'simulation'};
}
const sessions=new Map([A,B].map(id=>[id,sessionPour(id)]));
const token=sessions.get(A).access_token;
const chromeLocal={launch:o=>chromium.launch({...o,...(process.env.PASSIO_CHROME_LOCAL?{executablePath:process.env.PASSIO_CHROME_LOCAL}:{})})};
async function unCas(mode){
 let lecturesB=0,reservations=0,depots=0,parents=0,compteur=0,octets=0,defautServeur=false;
 const medias=new Map();
 const serveur=http.createServer(async(req,res)=>{
   try{
    assert.equal(req.socket.remoteAddress,'127.0.0.1');assert.equal(req.headers.cookie,undefined);
    const u=new URL(req.url,'http://127.0.0.1'),parts=[];let n=0;
    for await(const chunk of req){n+=chunk.length;assert.ok(n<=8192);parts.push(chunk);}
    const body=Buffer.concat(parts),h={'Access-Control-Allow-Origin':APERCU,'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'};
    let v,status=200,buffer;
    if(u.pathname==='/auth/v1/user'){const id=req.headers.authorization==='Bearer '+token?A:B;assert.equal(req.headers.authorization,'Bearer '+sessions.get(id).access_token);v=sessions.get(id).user;}
    else if(u.pathname==='/private-media/capabilities'){v={protocol:1,uploads_enabled:true,reads_enabled:true,min_client:1,max_bytes:27262976};}
    else if(u.pathname==='/rest/v1/rpc/media_reserver'){
      assert.equal(req.method,'POST');assert.equal(req.headers.authorization,'Bearer '+token);
      const q=JSON.parse(body),s=f.sources.find(x=>x.kind===q.p_type);assert.equal(q.p_source_id,s.id);
      const [variant]=q.p_variantes;assert.equal(variant.byte_size,s.bytes.length);assert.equal(variant.mime_type,'image/png');
      const id=q.p_cle_idempotence,key=A+'/'+id+'/original.png',p='/private-media/'+s.kind+'/'+s.id+'/'+id+'/original';
      reservations++;medias.set(s.kind,{id,key,p,s});v={asset_id:id,bucket_id:'content-protected',linked:false,expires_at:new Date(Date.now()+900000).toISOString(),objects:[{variant:'original',mime_type:'image/png',byte_size:s.bytes.length,object_key:key,reference:'https://media.passio.invalid'+p}]};
      if(mode==='cf_tout')h['Set-Cookie']='__cf_bm=simulation; Path=/; Secure; HttpOnly; SameSite=None';
    }else if(u.pathname.startsWith('/storage/v1/object/content-protected/')){
      const m=[...medias.values()].find(x=>u.pathname==='/storage/v1/object/content-protected/'+x.key);
      assert.ok(m);assert.equal(req.method,'POST');assert.equal(req.headers['x-upsert'],'false');assert.equal(req.headers['content-type'],'image/png');
      if(mode==='cookie_depot'){h['Set-Cookie']='sim=valeur; Secure; HttpOnly';}
      if(mode==='cf_tout')h['Set-Cookie']='__cf_bm=simulation; Secure; HttpOnly';
      assert.deepEqual(body,m.s.bytes);depots++;octets+=body.length;status=200;v={Id:m.id,Key:'content-protected/'+m.key};
    }else if(u.pathname==='/rest/v1/posts'||u.pathname==='/rest/v1/stories'){
      if(req.method==='GET'){
      assert.equal(req.headers.authorization,'Bearer '+sessions.get(B).access_token);
      const m=medias.get(u.pathname.split('/').pop());assert.equal(u.searchParams.get('author_id'),'eq.'+A);assert.equal(u.searchParams.get('id'),'eq.'+m.s.id);
      v=[{id:m.s.id,author_id:A,media_url:'https://media.passio.invalid'+m.p}];
      }else{const p=JSON.parse(body),row=Array.isArray(p)?p[0]:p;parents++;status=201;v=[{id:row.id,author_id:A,media_url:row.media_url}];
      if(mode==='cf_tout')h['Set-Cookie']='__cf_bm=simulation; Secure; HttpOnly';}
    }else if(u.pathname.startsWith('/private-media/')){
      const id=req.headers.authorization==='Bearer '+token?A:B;assert.equal(req.headers.authorization,'Bearer '+sessions.get(id).access_token);if(id===B)lecturesB++;const m=[...medias.values()].find(x=>u.pathname===x.p);if(mode==='cookie_relais')h['Set-Cookie']='sim=valeur; Secure; HttpOnly';assert.ok(m);buffer=(id===B&&mode==='octets_B_incorrects')?Buffer.alloc(m.s.bytes.length):m.s.bytes;h['Content-Type']='image/png';
    }else if(u.pathname==='/rest/v1/profiles'){v=[{id:A}];}else throw Error('ROUTE');
    const result=buffer??Buffer.from(JSON.stringify(v));h['Content-Length']=result.length;res.writeHead(status,h);res.end(result);
   }catch{defautServeur=true;res.writeHead(500);res.end();}
 });
 await new Promise((yes,no)=>{serveur.once('error',no);serveur.listen(0,'127.0.0.1',yes);});
 const port=serveur.address().port;
 async function perform(r){const u=new URL(r.url);assert.ok([CIBLE,APERCU].includes(u.origin));
   return new Promise((yes,no)=>{const q=http.request({host:'127.0.0.1',port,path:u.pathname+u.search,method:r.method,agent:false,signal:AbortSignal.timeout(4000),headers:r.headers},res=>{
     const parts=[];let n=0;res.on('data',v=>{n+=v.length;if(n>8192)return res.destroy(Error('TAILLE'));parts.push(v);});
     res.on('error',no);res.on('end',()=>yes({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(parts)}));});q.on('error',no);q.end(r.body);});
 }
 try{
  const pages=verifierPages({chromium:chromeLocal,artefact,f,sessions,perform,budget:{reserver(){assert.ok(++compteur<=64);return 4000;}}});
  if(mode==='cf_tout'){await pages;assert.deepEqual([reservations,depots,parents,lecturesB,octets],[2,2,2,2,138]);}
  else if(mode==='octets_B_incorrects'){await assert.rejects(pages,/LECTURE_DESTINATAIRE/);assert.equal(lecturesB,1);}
  else {await assert.rejects(pages);assert.deepEqual([reservations,depots,parents],[1,1,mode==='cookie_relais'?1:0]);}
  assert.equal(defautServeur,false);
 } finally {serveur.closeAllConnections();await new Promise(resolve=>serveur.close(resolve));}
}
for(const mode of ['cf_tout','octets_B_incorrects','cookie_depot','cookie_relais'])await unCas(mode);
console.log('DEUX_SESSIONS_DEUX_PUBLICATIONS_QUATRE_BLOBS_VERIFIES');
