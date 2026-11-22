// Chaîne locale réelle namespace -> relais ROOT -> handler Edge ; ACL/Auth synthétiques.
// Aucun réseau, clé réelle, Storage ou utilisateur distant.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {createPrivateMediaHandler} from '../../supabase/functions/_shared/medias-proteges.js';
const relayFile=process.env.PASSIO_MEDIA_RELAY_MODULE||fileURLToPath(new URL('../../netlify/lib/private-media-relay.js',import.meta.url));
const {createPrivateMediaRelay}=await import(pathToFileURL(relayFile).href);
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const payload=new Uint8Array([1,2,3,4,5,6,7,8]);
const reference=`https://media.passio.invalid/private-media/posts/synthetic/${A}/original`;
function fixture(){
  const calls=[];
  const broker=createPrivateMediaHandler({createActor({mode,bearer}){
    return {verify:async()=>bearer==='s.A.synthetic'||bearer==='s.B.synthetic',sessionActive:async()=>true,enabled:async()=>true,
      resolve:async()=>mode==='user'&&bearer==='s.A.synthetic'?{bucket_id:'content-protected',object_key:`${A}/${A}/original.gif`,mime_type:'image/gif',byte_size:8}:null};
  },openObject:async()=>new Response(payload,{headers:{'Content-Type':'image/gif','Content-Length':'8'}})});
  const relay=createPrivateMediaRelay({target:{url:'https://njkiyoklssvefstljemx.supabase.co',anon:'synthetic-public-key'},fetchImpl:async(url,init)=>{
    calls.push({layer:'broker',method:init.method,marker:init.headers.has('X-Passio-Media-Read'),body:init.body});
    assert.equal(new URL(url).search,'');return broker(new Request(url,init));
  }});
  const sandbox={URL,Blob,AbortController,ReadableStream,setTimeout,clearTimeout,location:{origin:'https://app.synthetic.invalid'},MY_UID:A,_supaReal:true,
    document:{querySelectorAll:()=>[]},navigator:{},supa:{auth:{getSession:async()=>({data:{session:{user:{id:sandbox.MY_UID},access_token:sandbox.MY_UID===A?'s.A.synthetic':'s.B.synthetic'}}})}},
    fetch:async(input,init)=>{assert.equal(new URL(input).origin,'https://app.synthetic.invalid');calls.push({layer:'app',method:init.method,marker:init.headers['X-Passio-Media-Read'],body:init.body});return relay(new Request(input,init));}};
  sandbox.window=sandbox;
  const raw=readFileSync(new URL('../../js/app-02-state-utils.js',import.meta.url),'utf8');
  let namespace=raw.slice(raw.indexOf('// PRIVATE MEDIA CLIENT v1'),raw.indexOf('// END PRIVATE MEDIA CLIENT v1'));
  if(process.env.PASSIO_MEDIA_POST_CANDIDATE==='1')namespace=namespace.replace('headers: auth.mode === "user" ? { Authorization: "Bearer " + auth.token } : {},',
    'method:"POST",headers:Object.assign({"X-Passio-Media-Read":"1"},auth.mode === "user" ? { Authorization: "Bearer " + auth.token } : {}),')
    .replace('fetch(location.origin+"/private-media/capabilities",{headers:contexte.headers,',
    'fetch(location.origin+"/private-media/capabilities",{method:"POST",headers:Object.assign({"X-Passio-Media-Read":"1"},contexte.headers),');
  vm.runInNewContext(namespace,sandbox);
  return {api:sandbox.passioMediaProteges,sandbox,calls,relay};
}
test('client POST vide marque -> vrai relais GET sans marqueur/body -> broker autorise',async()=>{
  const f=fixture();await f.api.capacites();
  const blob=await f.api.charger(reference,'image');
  assert.equal((await (await fetch(blob)).arrayBuffer()).byteLength,8);
  for(const c of f.calls.filter(c=>c.layer==='app')){assert.equal(c.method,'POST');assert.equal(c.marker,'1');assert.equal(c.body,undefined);}
  for(const c of f.calls.filter(c=>c.layer==='broker')){assert.equal(c.method,'GET');assert.equal(c.marker,false);assert.equal(c.body,undefined);}
  f.api.invalider(B);f.sandbox.MY_UID=B;await assert.rejects(f.api.charger(reference,'image'));
  f.api.invalider(null);f.sandbox.MY_UID=null;await assert.rejects(f.api.charger(reference,'image'));
});
test('relais reel : EOF vide accepte, tous GET refuses, corps POST refuse avant broker',async()=>{
  const f=fixture(),url='https://app.synthetic.invalid/private-media/capabilities',headers={'X-Passio-Media-Read':'1'};
  assert.equal((await f.relay(new Request(url,{method:'POST',headers,body:new ReadableStream({start(c){c.close();}}),duplex:'half'}))).status,200);
  const before=f.calls.length;
  assert.equal((await f.relay(new Request(url))).status,405);
  assert.equal((await f.relay(new Request(url,{headers}))).status,405);
  assert.equal((await f.relay(new Request(url,{method:'POST',headers,body:'x'}))).status,400);
  assert.equal(f.calls.length,before);
});
