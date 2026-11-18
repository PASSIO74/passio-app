// Serveur loopback ENTIEREMENT synthetique. Vrai namespace/SW/handler HTTP ; aucune preuve Auth/RLS distante.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {Readable}=require('node:stream');
const ROOT=path.resolve(__dirname,'../..');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const GIF=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
async function localMediaServer({wrongClient=false,diagnosticSkip=false,diagnosticCalls=false,diagnosticSource=null,candidatePost=false,observeLegacyCache=false,legacyRelayProbe=false,legacyGetProbe=false,heritage=false}={}) {
  const {createPrivateMediaHandler}=await import(pathToFileURL(path.join(ROOT,'supabase/functions/_shared/medias-proteges.js')).href);
  const events=[];
  const heritageModel=heritage?heritageFixture(events):null;
  let revision=0;
  let holdNext=false,releaseHeld=null,held=false;
  // 36 images canvas 160x90 encodees VP9 localement ; aucun micro/camera/contenu utilisateur.
  const video=fs.readFileSync(path.join(__dirname,'fixtures/medias-proteges-video.webm'));
  const jwt=id=>heritageModel?heritageModel.token(id):'e30.'+Buffer.from(id).toString('base64url')+'.synthetic';
  const handler=createPrivateMediaHandler({
    createActor({mode,bearer}) {
      const subject=bearer===jwt(A)?'A':bearer===jwt(B)?'B':mode==='anon'?'anon':'invalid';
      return {verify:async()=>subject==='A'||subject==='B',sessionActive:async()=>true,enabled:async()=>true,
        async resolve(locator) {
          events.push({kind:'authorize',subject,category:locator.sourceType});
          if(heritageModel&&locator.displayId.startsWith('heritage_'))return heritageModel.resolve(subject,locator);
          if(locator.displayId!=='public'&&subject!==(locator.assetId===A?'A':'B'))return null;
          const isVideo=locator.displayId==='video', bytes=isVideo?video:GIF;
          return {bucket_id:'content-protected',object_key:`${locator.assetId}/${locator.assetId}/${locator.variant}.${isVideo?'webm':'gif'}`,mime_type:isVideo?'video/webm':'image/gif',byte_size:bytes.length};
        }};
    },
    async openObject({objectKey,method,range,signal}) {
      if(heritageModel&&heritageModel.isObject(objectKey)) {
        const data=heritageModel.png,body=range?data.subarray(range.start,range.end+1):data;
        events.push({kind:'heritage-bytes',bytes:method==='HEAD'?0:body.length});
        return new Response(method==='HEAD'?null:body,{status:range?206:200,headers:{'Content-Type':'image/png','Content-Length':String(body.length),...(range?{'Content-Range':range.contentRange}:{})}});
      }
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
  const html=`<!doctype html><meta charset="utf-8"><title>Medias synthetiques</title><main><h1>Medias synthetiques</h1><div id="content"></div></main>${heritage?'<section id="postDetailPage"><div id="postDetailContent"></div></section>':''}<script src="/client.js"></script>`;
  const client=`var MY_UID=null;window._supaReal=true;var hold=null;var holdRelease=null;var held=false;
  function syntheticSession(id){return {data:{session:id?{user:{id:id},access_token:'e30.'+btoa(id).replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_')+'.synthetic',expires_at:Date.now()/1000+3600}:null}};}
  var supa={auth:{async getSession(){var id=MY_UID;if(hold){held=true;await hold;}return syntheticSession(id);},async refreshSession(){return syntheticSession(MY_UID);}}};
  function lancerVideoPublique(el){return el.play().then(()=>true,()=>false);}function videoPubliqueBouton(){}
  ${namespace}
  ${routing}
  ${heritageModel?heritageClient(raw,heritageModel.rows,{[A]:jwt(A),[B]:jwt(B)}):''}
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
    if(heritageModel&&url.pathname.startsWith('/heritage/')) {await heritageModel.handle(req,res,url,jwt);return;}
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
  return {origin:fixtureOrigin,events,A,B,videoBytes:video.length,...(heritageModel?{heritageIds:heritageModel.rows.map(r=>r.id),setHeritageMode:mode=>heritageModel.setMode(mode),holdProjection:()=>heritageModel.hold(),releaseProjection:()=>heritageModel.release()}:{}),get projectionHeld(){return !!heritageModel?.held;},restartWorker(){revision++;},holdMedia(){holdNext=true;held=false;},get held(){return held;},releaseMedia(){if(releaseHeld){releaseHeld();releaseHeld=null;}},close(){
    this.releaseMedia();
    heritageModel?.release();
    // Les assertions sont terminées : fermer aussi les connexions du seul serveur
    // synthétique possédé, notamment celles que le SW garde encore ouvertes.
    return new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});
  }};
}

// Option heritage uniquement. SQL/RLS/SDK/Storage sont des DOUBLES documentes ;
// les fonctions produit de lecture, projection, presentation, namespace et relais
// ne sont pas remplacees. Aucun appel vers une vraie autorite Supabase.
function heritageFixture(events) {
  const {createHash}=require('node:crypto');
  const sha=s=>createHash('sha256').update(s).digest('hex');
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const expires=Math.floor(Date.now()/1000)+3600;
  const tokens=new Map([A,B].map(id=>[id,encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:id,role:'authenticated',aud:'authenticated',exp:expires})+'.synthetic']));
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQEBAAjVRQ0AAAAASUVORK5CYII=','base64');
  const rows=[1,2].map(i=>({id:'heritage_photo_'+i,author_id:A,content:'Photo synthetique '+i,
    media_url:'https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/'+A+'/heritage-synth-'+i+'.png',
    created_at:'2026-11-18T00:00:0'+i+'Z',shared_data:null,shared_from_post_id:null,vlog:null,is_reel:false,overlays:null,event_id:'heritage_event',
    profiles:{username:'Auteur synthetique',emoji:'●',color:'#888888',avatar_url:null,is_private:true}}));
  const assets=rows.map((r,i)=>({id:'30000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),post:r.id,sha:sha(r.media_url)}));
  const object=a=>({bucket_id:'content-protected',object_key:A+'/'+a.id+'/original.png',mime_type:'image/png',byte_size:png.length});
  let mode='ok',holdNext=false,held=false,release;
  const visible=subject=>subject==='A'||subject==='B'; // B est un abonne accepte synthetique, pas une preuve RLS.
  const subject=(authorization,jwt)=>authorization==='Bearer '+jwt(A)?'A':authorization==='Bearer '+jwt(B)?'B':'invalid';
  return {rows,png,token:id=>tokens.get(id),
    isObject:key=>assets.some(a=>object(a).object_key===key),
    resolve(who,locator){
      const a=assets.find(a=>a.id===locator.assetId&&a.post===locator.displayId);
      events.push({kind:'heritage-authorize',subject:who,matched:!!a});
      return visible(who)&&a&&locator.sourceType==='posts'&&locator.variant==='original'?object(a):null;
    },
    setMode(value){if(!['ok','error','missing','badHash','text'].includes(value))throw Error('fixture_mode_refused');mode=value;},
    hold(){holdNext=true;held=false;},get held(){return held;},
    release(){if(release){release();release=null;}},
    async handle(req,res,url,jwt){
      try {
        if(req.method!=='POST')throw Error('fixture_method_refused');
        let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>32768)throw Error('fixture_body_refused');chunks.push(c);}
        const body=JSON.parse(Buffer.concat(chunks).toString('utf8')),who=subject(req.headers.authorization,jwt);
        if(!visible(who)){res.writeHead(403);res.end();return;}
        res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
        if(url.pathname==='/heritage/posts') {
          events.push({kind:'heritage-posts',subject:who,event:body.event_id==='heritage_event'});
          let data=mode==='text'?rows.map(r=>({...r,media_url:null})):rows;
          if(body.event_id!==undefined&&body.event_id!=='heritage_event')data=[];
          if(body.author_id!==undefined&&body.author_id!==A)data=[];
          res.end(JSON.stringify({data,error:null,status:200}));return;
        }
        if(url.pathname==='/heritage/projection') {
          events.push({kind:'heritage-projection',subject:who});
          if(holdNext){holdNext=false;held=true;await new Promise(r=>release=r);}
          if(mode==='error'){res.writeHead(503);res.end();return;}
          const requested=body.p_references;
          if(!Array.isArray(requested)||requested.length<1||requested.length>100)throw Error('fixture_projection_shape');
          const result=[];
          for(const r of requested){
            const a=assets.find(a=>a.post===r.id),row=rows.find(row=>row.id===r.id);
            // Double de la comparaison SHA/parent/registre et de media_resoudre.
            const inscrit=mode==='badHash'?'0'.repeat(64):a?.sha;
            if(a&&row&&r.reference_sha256===inscrit&&inscrit===sha(row.media_url)&&mode!=='missing')
              result.push({post_id:r.id,reference:'https://media.passio.invalid/private-media/posts/'+r.id+'/'+a.id+'/original'});
          }
          res.end(JSON.stringify({data:result,error:null}));return;
        }
        throw Error('fixture_route_refused');
      } catch {if(!res.headersSent)res.writeHead(500);res.end();}
    }
  };
}

function heritageClient(raw,rows,tokens) {
  const source08=fs.readFileSync(path.join(ROOT,'js/app-08-ui-modals-tour.js'),'utf8');
  const source03=fs.readFileSync(path.join(ROOT,'js/app-03-posts-vlogs.js'),'utf8');
  function block(source,begin,end){const a=source.indexOf(begin),b=source.indexOf(end,a);if(a<0||b<=a)throw Error('fixture_source_marker_missing');return source.slice(a,b);}
  function fn(source,entry){const a=source.indexOf(entry),b=source.indexOf('\n}',a);if(a<0||b<a)throw Error('fixture_function_missing');return source.slice(a,b+2);}
  const projection=block(raw,'// HERITAGE MEDIA READ v1','// END HERITAGE MEDIA READ v1');
  const presentation=block(source08,'passioMediaProteges.presentation=function','// END PRIVATE MEDIA UPLOAD v1');
  const complements=block(source08,'const FIL_COMPTEURS_ABSENTE_CLE','// La copie précédente');
  const functions=[fn(source08,'async function supaLoadPosts('),fn(source08,'function _discussionChargee('),fn(source08,'async function _resolveProfilesByIds('),
    fn(source08,'async function supaLoadEventPosts('),fn(raw,'function findPostAnywhere('),fn(raw,'function allPostCopies('),fn(raw,'async function openPost('),fn(source03,'function closePost('),fn(raw,'function safeUrlAttr(')].join('\n');
  return `
  // Sessions ordinaires synthetiques, claims de forme JWT ; verification Auth doublee.
  syntheticSession=function(id){return {data:{session:id?{user:{id},access_token:${JSON.stringify(tokens)}[id],expires_at:Date.now()/1000+3600}:null}};};
  var state={user:{name:'Synthese',following:[${JSON.stringify(A)}],general:{}},seed:{posts:[]},userPosts:[],supabasePosts:[]};
  var FEED_SERVER_PAGE_SIZE=20,_feedPagination=null,_feedTeteSeq=0,_feedTeteDerniereServie=0,_feedRefreshGeneration=0,_profileCacheGeneration=0;
  var _activeFeedPassions=new Set(),_postDetailProjectionSequence=0;
  window._feedExtraPosts=[];
  // Decorations UI et likes sans rapport avec le media : doubles explicites.
  function diagLog(){}function noterLectureTeteFil(){}function estEchecReseau(){return false;}
  function _postLikeReadToken(){return null;}function _postLikeReconcileLoaded(p){return p;}function cacheRemoteProfile(){}
  function supaTs(v){return Date.parse(v);}function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function escapeJsArg(v){return String(v).replace(/'/g,"\\'");}function userById(){return {name:'Auteur synthetique',profileEmoji:'●',avatar:'#888'};}function currentProfile(){return userById();}
  function passionById(){return {emoji:'●',label:'Test'};}function postAimeParMoi(){return false;}function fmtTime(){return 'Test';}function avatarBg(){return '#888';}function avatarInner(){return '';}
  function renderPostCover(){return '';}function _boutonOptionsPost(){return '';}function _moodTagHTML(){return '';}function attrsLikePost(){return '';}function contenuLikePost(){return '0';}
  function attrsCommentairesPost(){return '';}function nbCommentairesPost(){return 0;}function contenuCommentairesPost(){return '0';}function contenuReagirPost(){return '';}
  function shareIconSvg(){return '';}function _postReactChipHtml(){return '';}function pushOverlayHistory(){}function _loadPostDetailComments(){}function arreterVideoPublique(){}
  function passioThumb(v){return passioMediaProteges.route(v);}
  async function metadata(route,body,signal){const r=await fetch('/heritage/'+route,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+syntheticSession(MY_UID).data.session.access_token},body:JSON.stringify(body),signal});return r.ok?r.json():{data:null,error:{code:'SYNTHETIC_REFUS'},status:r.status};}
  supa.rpc=function(name,body){
    if(name==='media_projeter_heritage')return {abortSignal:signal=>metadata('projection',body,signal)};
    if(name==='fil_compteurs')return Promise.resolve({data:body._post_ids.map(post_id=>({post_id,likes:0,aime:false,commentaires:0,apercus:[],reactions:[]})),error:null});
    throw Error('fixture_rpc_refused');
  };
  supa.from=function(table){
    if(table==='profiles')return {select:()=>({in:async()=>({data:[{id:${JSON.stringify(A)},username:'Auteur synthetique'}],error:null})})};
    if(table!=='posts')throw Error('fixture_table_refused');
    const filters={};const q={select:()=>q,eq:(key,value)=>{filters[key]=value;return q;},or:()=>q,order:()=>q,range:()=>metadata('posts',filters),limit:()=>metadata('posts',filters)};return q;
  };
  ${projection}
  ${presentation}
  ${complements}
  ${functions}
  window.heritageLoad=async function(kind){
    const loaded=kind==='event'?await supaLoadEventPosts('heritage_event'):await supaLoadPosts(0,null,{propagerErreur:true});
    state.supabasePosts=loaded;
    const root=document.querySelector('#content');root.replaceChildren();
    for(const p of loaded){if(!p.image)continue;const image=document.createElement('img');image.alt='Photo synthetique';passioMediaProteges.poserImage(image,p.image);root.appendChild(image);}
    return loaded.map(p=>({id:p.id,image:p.image,type:p.type,eventId:p.eventId}));
  };
  window.heritageCards=function(){const cards=${JSON.stringify(rows.map(r=>({id:r.id,authorId:A,type:'photo',image:r.media_url,text:r.content,comments:[],likes:0,createdAt:1})))};state.seed.posts=structuredClone(cards);state.userPosts=structuredClone(cards);state.supabasePosts=structuredClone(cards);};
  window.heritageCopies=function(id){return allPostCopies(id).map(p=>p.image);};
  `;
}
module.exports={localMediaServer};
