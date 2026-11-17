// Serveur loopback ENTIEREMENT synthetique. Vrai namespace/SW/handler HTTP ; aucune preuve Auth/RLS distante.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {Readable}=require('node:stream');
const ROOT=path.resolve(__dirname,'../..');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const GIF=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
async function localMediaServer({wrongClient=false,diagnosticSkip=false,diagnosticCalls=false,diagnosticSource=null,candidatePost=false,observeLegacyCache=false,legacyRelayProbe=false,legacyGetProbe=false}={}) {
  const {createPrivateMediaHandler}=await import(pathToFileURL(path.join(ROOT,'supabase/functions/_shared/medias-proteges.js')).href);
  const events=[];
  let revision=0;
  let holdNext=false,releaseHeld=null,held=false;
  // 36 images canvas 160x90 encodees VP9 localement ; aucun micro/camera/contenu utilisateur.
  const video=fs.readFileSync(path.join(__dirname,'fixtures/medias-proteges-video.webm'));
  const jwt=id=>'e30.'+Buffer.from(id).toString('base64url')+'.synthetic';
  const handler=createPrivateMediaHandler({
    createActor({mode,bearer}) {
      const subject=bearer===jwt(A)?'A':bearer===jwt(B)?'B':mode==='anon'?'anon':'invalid';
      return {verify:async()=>subject==='A'||subject==='B',sessionActive:async()=>true,enabled:async()=>true,
        async resolve(locator) {
          events.push({kind:'authorize',subject,category:locator.sourceType});
          if(locator.displayId!=='public'&&subject!==(locator.assetId===A?'A':'B'))return null;
          const isVideo=locator.displayId==='video', bytes=isVideo?video:GIF;
          return {bucket_id:'content-protected',object_key:`${locator.assetId}/${locator.assetId}/${locator.variant}.${isVideo?'webm':'gif'}`,mime_type:isVideo?'video/webm':'image/gif',byte_size:bytes.length};
        }};
    },
    async openObject({objectKey,method,range,signal}) {
      const isVideo=objectKey.endsWith('.webm'),data=isVideo?video:GIF,body=range?data.subarray(range.start,range.end+1):data;
      if(holdNext){holdNext=false;held=true;events.push({kind:'authorized-held',category:'image'});
        const gate=new Promise(r=>releaseHeld=r);
        return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(body.subarray(0,1)));events.push({kind:'held-first-byte',bytes:1});},async pull(controller){await gate;
          if(signal.aborted){events.push({kind:'held-aborted',bytes:0});controller.error(new Error('synthetic_abort'));return;}
          events.push({kind:'held-released',bytes:body.length-1});controller.enqueue(new Uint8Array(body.subarray(1)));controller.close();
        }}),{headers:{'Content-Type':'image/gif','Content-Length':String(body.length)}});
      }
      events.push({kind:'bytes',category:isVideo?'video':'image',bytes:method==='HEAD'?0:body.length});
      return new Response(method==='HEAD'?null:body,{status:range?206:200,headers:{'Content-Type':isVideo?'video/webm':'image/gif','Content-Length':String(body.length),...(range?{'Content-Range':range.contentRange}:{})}});
    }
  });
  // Vrai relais ROOT, dependance de livraison. L'amont est le vrai handler Edge
  // local via injection : AUCUN fetch vers le domaine de configuration.
  const relayPath=process.env.PASSIO_MEDIA_RELAY_MODULE||path.join(ROOT,'netlify/lib/private-media-relay.js');
  const {createPrivateMediaRelay}=await import(pathToFileURL(relayPath).href);
  const relay=createPrivateMediaRelay({target:{url:'https://njkiyoklssvefstljemx.supabase.co',anon:'synthetic-public-key'},fetchImpl:async(url,options)=>{
    if(new URL(url).origin!=='https://njkiyoklssvefstljemx.supabase.co')throw new Error('fixture_upstream_refused');
    return handler(new Request(url,options));
  }});
  const raw=fs.readFileSync(path.join(ROOT,'js/app-02-state-utils.js'),'utf8');
  let namespace=raw.slice(raw.indexOf('// PRIVATE MEDIA CLIENT v1'),raw.indexOf('// END PRIVATE MEDIA CLIENT v1'));
  // Candidat inerte compare AVANT changement du runtime/relais ; aucun code de droits remplace.
  if(candidatePost)namespace=namespace.replace('headers: auth.mode === "user" ? { Authorization: "Bearer " + auth.token } : {},',
    'method:"POST",headers:Object.assign({"X-Passio-Media-Read":"1"},auth.mode === "user" ? { Authorization: "Bearer " + auth.token } : {}),')
    .replace('fetch(location.origin+"/private-media/capabilities",{headers:contexte.headers,',
      'fetch(location.origin+"/private-media/capabilities",{method:"POST",headers:Object.assign({"X-Passio-Media-Read":"1"},contexte.headers),');
  // Reinjection HISTORIQUE explicite : bytes/capacites GET sous ancien SW.
  // Uniquement en diagnostic local, jamais le code livre au produit.
  if(legacyGetProbe)namespace=namespace.replaceAll('method:"POST", headers:','method:"GET", headers:').replaceAll('method:"POST",headers:','method:"GET",headers:');
  const routing=raw.slice(raw.indexOf('const MEDIA_RELAIS_HISTORIQUE'),raw.indexOf('window.urlMediaDirecte = urlMediaDirecte;')+'window.urlMediaDirecte = urlMediaDirecte;'.length);
  const html=`<!doctype html><meta charset="utf-8"><title>Medias synthetiques</title><main><h1>Medias synthetiques</h1><div id="content"></div></main><script src="/client.js"></script>`;
  const client=`var MY_UID=null;window._supaReal=true;var hold=null;var holdRelease=null;var held=false;
  function syntheticSession(id){return {data:{session:id?{user:{id:id},access_token:'e30.'+btoa(id).replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_')+'.synthetic',expires_at:Date.now()/1000+3600}:null}};}
  var supa={auth:{async getSession(){var id=MY_UID;if(hold){held=true;await hold;}return syntheticSession(id);},async refreshSession(){return syntheticSession(MY_UID);}}};
  function lancerVideoPublique(el){return el.play().then(()=>true,()=>false);}function videoPubliqueBouton(){}
  ${namespace}
  ${routing}
  passioMediaProteges.installer();
  window.login=function(id){passioMediaProteges.invalider(id);MY_UID=id;};
  window.suspendSession=function(){held=false;hold=new Promise(r=>holdRelease=r);};
  window.releaseSession=function(){holdRelease();hold=null;};
  window.startWorker=async function(){await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));};`;
  let sw=diagnosticSource||fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
  if(observeLegacyCache)sw=`// Observation seulement : le vrai Cache.put reste execute, meme corps/headers.
    const legacyNativePut=Cache.prototype.put,legacyPending=new Set();
    Cache.prototype.put=function(request,response){const operation=legacyNativePut.call(this,request,response);legacyPending.add(operation);operation.then(()=>legacyPending.delete(operation),()=>legacyPending.delete(operation));return operation;};
    self.addEventListener('message',event=>{if(!event.data||event.data.type!=='PASSIO_TEST_CACHE_DRAIN'||!event.ports[0])return;const port=event.ports[0];event.waitUntil(Promise.allSettled(Array.from(legacyPending)).then(()=>{port.postMessage({type:'PASSIO_TEST_CACHE_DRAINED',nonce:event.data.nonce});port.close();}));});\n`+sw;
  // Diagnostic LOCAL seulement : comparaison de duree de vie, runtime du depot intact.
  if(diagnosticSkip)sw=sw.replace('e.waitUntil(self.skipWaiting());','self.skipWaiting();').replace('.then(()=>self.skipWaiting())','.then(()=>{self.skipWaiting();})');
  if(diagnosticCalls)sw='self.__pmpSkip={calls:0,result:"none"};const nativeSkip=self.skipWaiting.bind(self);self.skipWaiting=function(){self.__pmpSkip.calls++;const p=nativeSkip();p.then(()=>self.__pmpSkip.result="fulfilled",()=>self.__pmpSkip.result="rejected");return p;};\n'+sw;
  if(wrongClient)sw=sw.replace('const client=await self.clients.get(clientId);', 'const client=(await self.clients.matchAll({type:"window"})).find(c=>new URL(c.url).searchParams.get("donor")==="1");').replace('client.id!==clientId||','');
  let fixtureOrigin;
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,fixtureOrigin);
    if(url.pathname.startsWith('/private-media/')) {
      const abort=new AbortController();res.on('close',()=>{abort.abort();if(!res.writableEnded)events.push({kind:'request-aborted',bytes:0});});
      const incoming=new Request(url,{method:req.method,headers:req.headers,signal:abort.signal,
        ...(req.method==='POST'?{body:Readable.toWeb(req),duplex:'half'}:{})});
      const response=await (legacyRelayProbe?handler(incoming):relay(incoming));
      if(res.destroyed){await response.body?.cancel();return;}
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.flushHeaders();
      if(response.body){const reader=response.body.getReader();res.on('close',()=>reader.cancel().catch(()=>{}));try{for(;;){const item=await reader.read();if(item.done)break;if(!res.write(Buffer.from(item.value)))await new Promise(r=>res.once('drain',r));}}catch(_){res.destroy();return;}}
      res.end();return;
    }
    if(url.pathname==='/sw.js'){events.push({kind:'worker-script',revision});res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store','Service-Worker-Allowed':'/'});
      // Comme scripts/build.js : une version de cache LITTERALE differente par build.
      res.end(sw.replace('const CACHE = "passio-v" + Date.now();','const CACHE = "passio-vsynthetic-'+revision+'";'));return;}
    if(url.pathname==='/client.js'){res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store'});res.end(client);return;}
    if(url.pathname==='/'||url.pathname==='/index.html'||url.pathname==='/frame.html'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return;}
    res.writeHead(404,{'Cache-Control':'no-store'});res.end();
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  fixtureOrigin=`http://127.0.0.1:${server.address().port}`;
  return {origin:fixtureOrigin,events,A,B,videoBytes:video.length,restartWorker(){revision++;},holdMedia(){holdNext=true;held=false;},get held(){return held;},releaseMedia(){if(releaseHeld){releaseHeld();releaseHeld=null;}},close(){this.releaseMedia();return new Promise(r=>server.close(r));}};
}
module.exports={localMediaServer};
