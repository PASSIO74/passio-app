import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateMediaRelay,MAX_MEDIA_BYTES} from '../../netlify/lib/private-media-relay.js';
import {cibleMedias} from '../../netlify/lib/cibles-medias.js';
import {config} from '../../netlify/edge-functions/private-media.js';
const target=cibleMedias({deploy:{context:'production',published:true}});
const route='/private-media/posts/post_123/00000000-0000-0000-0000-000000000001/original';
function marked(url,options={}) {const headers=new Headers(options.headers);if(!headers.has('X-Passio-Media-Read'))headers.set('X-Passio-Media-Read','1');return new Request(url,{...options,headers});}
const req=(suffix='',options={})=>marked('https://app.test'+route+suffix,options);
const capreq=(options={})=>marked('https://app.test/private-media/capabilities',options);
const media=(body='abc',status=200,headers={})=>new Response(body,{status,headers:{'Content-Type':'image/png','Content-Length':'3',...headers}});
const caps={protocol:1,uploads_enabled:false,reads_enabled:false,min_client:1,max_bytes:MAX_MEDIA_BYTES};
test('route privée réellement déclarée sans cache ni bypass de la frontière',()=>{
  assert.equal(config.path,'/private-media/*');assert.equal(config.onError,'fail');assert.equal(Object.hasOwn(config,'cache'),false);assert.equal(Object.hasOwn(config,'method'),false);
});
function safe(response) { for(const key of ['Cache-Control','Netlify-CDN-Cache-Control','CDN-Cache-Control']) assert.match(response.headers.get(key),/no-store/); for(const key of ['Location','Set-Cookie','ETag','Access-Control-Allow-Origin']) assert.equal(response.headers.get(key),null); assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff'); }
test('cible fixée par contexte natif, aucun brouillon vers production',()=>{
  assert.match(target.url,/njkiyoklssvefstljemx/);
  for(const t of [target,cibleMedias({deploy:{context:'deploy-preview',published:false}})]) {
    const claims=JSON.parse(Buffer.from(t.anon.split('.')[1],'base64url'));
    assert.equal(claims.role,'anon');assert.equal(t.url,'https://'+claims.ref+'.supabase.co');
  }
  for(const context of ['production','deploy-preview','branch-deploy','dev']) assert.match(cibleMedias({deploy:{context,published:false}}).url,/fcksxofaelcdmmifnwjo/);
  for(const context of [null,{}, {deploy:{published:true,context:'dev'}},{deploy:{context:'production'}}]) assert.equal(cibleMedias(context),null);
  for(const published of [false,true]) assert.equal(cibleMedias({deploy:{published,context:'inconnu'}}),null);
});
test('chemins, verbes, JWT et Range invalides ne font aucun appel amont',async()=>{
  let calls=0; const relay=createPrivateMediaRelay({target,fetchImpl:async()=>{calls++;return media();}});
  for(const suffix of ['?width=720','?url=https://example.test','/extra']) safe(await relay(req(suffix)));
  for(const path of ['/private-media/content/x','/private-media/posts/%2f/x/original','/private-media/capabilities/']) assert.equal((await relay(marked('https://app.test'+path))).status,404);
  assert.equal((await relay(req('',{method:'PUT'}))).status,405);
  for(const auth of ['Bearer bad','Basic a','Bearer a.b.c.d','Bearer '+'a'.repeat(8193)+'.b.c']) assert.equal((await relay(req('',{headers:{Authorization:auth}}))).status,401);
  for(const range of ['bytes=1-2,4-5','bytes=-','bytes=8-2','bytes=0-9999999999']) assert.equal((await relay(req('',{headers:{Range:range}}))).status,416);
  assert.equal(calls,0);
});
test('transmet seulement JWT/clé publique/Range et filtre tous les en-têtes amont',async()=>{
  const relay=createPrivateMediaRelay({target,fetchImpl:async(url,options)=>{
    assert.equal(url,target.url+'/functions/v1'+route);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
    assert.deepEqual([...options.headers.keys()],['accept','apikey','authorization']);assert.equal(options.headers.get('authorization'),'Bearer a.b.c');assert.equal(options.headers.get('apikey'),target.anon);
    return media('abc',200,{'Set-Cookie':'session=secret',Location:'https://bad.test',ETag:'x','Cache-Control':'public,max-age=31536000'});
  }});
  const response=await relay(req('',{headers:{Authorization:'Bearer a.b.c',Cookie:'session=secret','If-None-Match':'x','X-Forwarded-Host':'bad.test'}}));safe(response);assert.equal(await response.text(),'abc');
});
test('visiteur sans JWT reste visiteur, refus et redirections ne révèlent aucun corps',async()=>{
  for(const status of [401,403,404,429,302,304,500]) {
    const relay=createPrivateMediaRelay({target,fetchImpl:async(_,options)=>{assert.equal(options.headers.has('Authorization'),false);return new Response([304].includes(status)?null:'UPSTREAM_SECRET',{status,headers:{Location:'https://bad.test'}});}});
    const response=await relay(req());safe(response);assert.equal(await response.text(),'');assert.equal(response.status,[302,304,500].includes(status)?502:status);
  }
});
test('capacités publiques projetées, taille et forme fermées, HEAD sans corps',async()=>{
  for(const method of ['GET','HEAD']) {
    const relay=createPrivateMediaRelay({target,fetchImpl:async(_,options)=>{assert.equal(options.method,'GET');assert.equal(options.headers.has('Authorization'),false);return Response.json(caps);}});
    const r=await relay(capreq({method}));safe(r);assert.equal(r.status,200);assert.equal(method==='HEAD'?await r.text():JSON.stringify(await r.json()),method==='HEAD'?'':JSON.stringify(caps));
  }
  for(const value of [{...caps,secret:'x'},{...caps,protocol:2},{...caps,max_bytes:MAX_MEDIA_BYTES+1},{...caps,reads_enabled:'true'},'x'.repeat(513)]) {
    const r=await createPrivateMediaRelay({target,fetchImpl:async()=>Response.json(value)})(capreq());safe(r);assert.equal(r.status,503);
  }
});
test('MIME actif, encodage, taille annoncée et Range incohérents refusés',async()=>{
  for(const headers of [{'Content-Type':'image/svg+xml'},{'Content-Type':'text/html'},{'Content-Length':String(MAX_MEDIA_BYTES+1)},{'Content-Length':'0'},{'Content-Encoding':'gzip'},{'Content-Range':'bytes 0-2/3'}]) assert.equal((await createPrivateMediaRelay({target,fetchImpl:async()=>media('abc',200,headers)})(req())).status,502);
  const relay=createPrivateMediaRelay({target,fetchImpl:async(_,options)=>{assert.equal(options.headers.get('Range'),'bytes=0-2');return media('abc',206,{'Content-Range':'bytes 0-2/8'});}});
  const r=await relay(req('',{headers:{Range:'bytes=0-2'}}));assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 0-2/8');assert.equal(await r.text(),'abc');
  assert.equal((await createPrivateMediaRelay({target,fetchImpl:async()=>media('abc',206,{'Content-Range':'bytes 0-2/2'})})(req('',{headers:{Range:'bytes=0-2'}}))).status,502);
  assert.equal((await createPrivateMediaRelay({target,fetchImpl:async()=>media('abc',206,{'Content-Range':'bytes 4-6/8'})})(req('',{headers:{Range:'bytes=0-2'}}))).status,502);
});
test('HEAD relaie sans charger le corps ; 416 ne reprend que Content-Range borné',async()=>{
  let cancelled=0;
  const relay=createPrivateMediaRelay({target,fetchImpl:async()=>media(new ReadableStream({cancel(){cancelled++;}}))});
  const r=await relay(req('',{method:'HEAD'}));assert.equal(await r.text(),'');assert.equal(r.headers.get('Content-Length'),'3');assert.equal(cancelled,1);safe(r);
  const denied=await createPrivateMediaRelay({target,fetchImpl:async()=>new Response('SECRET',{status:416,headers:{'Content-Range':'bytes */8'}})})(req('',{headers:{Range:'bytes=99-'}}));assert.equal(denied.status,416);assert.equal(await denied.text(),'');assert.equal(denied.headers.get('Content-Range'),'bytes */8');
});
test('stream réel borné : corps court, long ou invalide ne termine jamais en succès',async()=>{
  for(const body of ['ab','abcd']) {
    const r=await createPrivateMediaRelay({target,fetchImpl:async()=>media(body)})(req());await assert.rejects(r.text(),/media_unavailable/);safe(r);
  }
});
test('annulation lecteur et requête interrompent aussi le fetch et le lecteur amont',async()=>{
  for(const mode of ['reader','request']) {
    let signal,cancelled=0;const ctrl=new AbortController();
    const r=await createPrivateMediaRelay({target,fetchImpl:async(_,o)=>{signal=o.signal;return media(new ReadableStream({pull(){},cancel(){cancelled++;}}));}})(req('',{signal:ctrl.signal}));
    if(mode==='reader') await r.body.cancel();else {ctrl.abort();await assert.rejects(r.text(),/media_unavailable/);}
    assert.equal(signal.aborted,true);assert.equal(cancelled,1);
  }
});
test('annuler vide immédiatement un chunk déjà en file, même sans nouveau pull du consommateur',async()=>{
  const ctrl=new AbortController();let cancelled=0;
  const upstream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('abc'));},cancel(){cancelled++;}});
  const r=await createPrivateMediaRelay({target,fetchImpl:async()=>media(upstream)})(req('',{signal:ctrl.signal}));
  await new Promise(setImmediate);ctrl.abort();
  await assert.rejects(r.body.getReader().read(),/media_unavailable/);assert.equal(cancelled,1);
});
test('cible absente ou hors liste ferme le relais avant réseau',async()=>{
  for(const value of [null,{url:'https://evil.test',anon:'x'}]) assert.equal((await createPrivateMediaRelay({target:value,fetchImpl:()=>assert.fail('NETWORK')})(req())).status,503);
});
test('échéance ferme aussi un corps de capacités suspendu, sans lire de réponse libre',async()=>{
  let cancelled=0;const keepAlive=setTimeout(()=>{},1000);
  try {
    const relay=createPrivateMediaRelay({target,deadlineMs:10,fetchImpl:async()=>new Response(new ReadableStream({cancel(){cancelled++;}}),{headers:{'Content-Type':'application/json'}})});
    const r=await relay(capreq());assert.equal(r.status,503);assert.equal(cancelled,1);safe(r);
  } finally {clearTimeout(keepAlive);}
});
test('ancien SW : GET natif sans marqueur refusé ; POST vide lu en GET sans transmettre marqueur/corps',async()=>{
  let calls=0;
  const relay=createPrivateMediaRelay({target,fetchImpl:async(_,options)=>{calls++;assert.equal(options.method,'GET');assert.equal(options.headers.has('X-Passio-Media-Read'),false);assert.equal(options.headers.get('Authorization'),'Bearer a.b.c');assert.equal(options.body,undefined);return media();}});
  for(const method of ['GET','HEAD','POST']) {const r=await relay(new Request('https://app.test'+route,{method}));assert.equal(r.status,400);safe(r);}
  assert.equal((await relay(req('',{method:'POST',headers:{'X-Passio-Media-Read':'0'}}))).status,400);
  assert.equal((await relay(req('',{method:'POST',body:'INTERDIT'}))).status,400);assert.equal(calls,0);
  const r=await relay(req('',{method:'POST',headers:{Authorization:'Bearer a.b.c'}}));assert.equal(r.status,200);assert.equal(await r.text(),'abc');assert.equal(calls,1);safe(r);
  const cap=await createPrivateMediaRelay({target,fetchImpl:async(_,o)=>{assert.equal(o.method,'GET');return Response.json(caps);}})(capreq({method:'POST'}));assert.equal(cap.status,200);assert.deepEqual(await cap.json(),caps);safe(cap);
});
test('en-têtes bornés séparément : refus avant réponse lente, corps autorisé reste lisible ensuite',async()=>{
  const keepAlive=setTimeout(()=>{},2000);
  let intermediate;
  try {
    const slow=createPrivateMediaRelay({target,deadlineMs:1000,headersDeadlineMs:10,fetchImpl:async(_,o)=>new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(new Error('ABORT')),{once:true}))});
    const denied=await Promise.race([slow(req()),new Promise(resolve=>{intermediate=setTimeout(()=>resolve(null),300);})]);
    clearTimeout(intermediate);assert.notEqual(denied,null,'la borne des en-têtes doit précéder le délai global');assert.equal(denied.status,503);safe(denied);
    let source,signal;
    const streamed=createPrivateMediaRelay({target,deadlineMs:1000,headersDeadlineMs:50,fetchImpl:async(_,o)=>{signal=o.signal;return media(new ReadableStream({start(c){source=c;}}));}});
    const r=await streamed(req());await new Promise(ok=>setTimeout(ok,100));assert.equal(signal.aborted,false);source.enqueue(new TextEncoder().encode('abc'));source.close();assert.equal(await r.text(),'abc');
    const bodyTimedOut=createPrivateMediaRelay({target,deadlineMs:30,headersDeadlineMs:10,fetchImpl:async()=>media(new ReadableStream({}))});
    const pending=await bodyTimedOut(req());await assert.rejects(pending.text(),/media_unavailable/);
  } finally {clearTimeout(intermediate);clearTimeout(keepAlive);}
});
