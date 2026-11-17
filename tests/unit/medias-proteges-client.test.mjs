import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../js/app-02-state-utils.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('// PRIVATE MEDIA CLIENT v1'), source.indexOf('// END PRIVATE MEDIA CLIENT v1'));
const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002';
const reference = `https://media.passio.invalid/private-media/posts/source/${A}/original`;
const route = `https://app.invalid/private-media/posts/source/${A}/original`;
function element() {
  const attrs = new Map(); return { isConnected: true, pause() {}, load() {},
    getAttribute: n => attrs.get(n) || null, setAttribute: (n,v) => attrs.set(n,String(v)), removeAttribute: n => attrs.delete(n),
    get src() { return attrs.get('src'); }, set src(v) { attrs.set('src',v); } };
}
function fixture(options = {}) {
  const calls = [], nodes = [], revoked = [];
  const sandbox = { URL: class extends URL { static revokeObjectURL(value) { revoked.push(value); URL.revokeObjectURL(value); } }, Blob, AbortController, ReadableStream,
    setTimeout, clearTimeout, location: { origin: 'https://app.invalid' }, MY_UID: A, _supaReal: true,
    document: { querySelectorAll: () => nodes }, navigator: {},
    supa: { auth: {
      async getSession() { return options.getSession ? options.getSession() : { data: { session: { user: { id: sandbox.MY_UID }, access_token: 'synthetic.current.signature', expires_at: Date.now()/1000+3600 } } }; },
      async refreshSession() { return options.refreshSession(); },
    } },
    async fetch(input, init) { calls.push({ input, init }); return options.fetch ? options.fetch(input, init) : new Response(new Uint8Array([1,2,3]), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store' } }); },
  };
  sandbox.window = sandbox; vm.runInNewContext(code, sandbox);
  return { sandbox, api: sandbox.passioMediaProteges, calls, nodes, revoked };
}

test('URI reserve strict et contexte affichant sans mutation du snapshot', () => {
  const f = fixture(); assert.equal(f.api.route(reference), route);
  for (const bad of [reference+'?token=x', reference+'#x', reference.replace('https:', 'http:'), reference.replace('/posts/', '/posts/x/../'), reference.replace('media.passio.invalid','media.passio.invalid.evil'), reference.replace('/original','/original/'), reference.replace('/source/','/%73ource/')]) {
    assert.equal(f.api.parser(bad), null); assert.equal(f.api.route(bad), '');
  }
  const post = { image: reference, sharedReelData: { video: reference, overlays: [{ url: reference }] } };
  const copy = f.api.contextualiser(post,{type:'posts',id:'repost'});
  assert.equal(copy.image,route.replace('/source/','/repost/'));
  assert.equal(copy.sharedReelData.overlays[0].url,copy.image); assert.equal(post.image,reference);
  assert.equal(f.api.route(reference,{type:'events',id:'x'}),'');
});

test('getSession A retarde apres switch B : refus avant tout octet, puis JWT B frais', async () => {
  let release; const held = new Promise(resolve => release=resolve);
  const f=fixture({ getSession: () => held }); const pending=f.api.session();
  f.api.invalider(B); f.sandbox.MY_UID=B;
  release({ data:{session:{user:{id:A},access_token:'synthetic.A.signature'}} });
  await assert.rejects(pending); assert.equal(f.calls.length,0);
  f.sandbox.supa.auth.getSession=async()=>({data:{session:{user:{id:B},access_token:'synthetic.B.signature'}}});
  assert.equal((await f.api.session()).token,'synthetic.B.signature');
});

test('chemin APP : normalisation ambiguë et credentials refuses',()=>{
  const f=fixture();
  for(const bad of [route+'?x=1',route+'#x',route.replace('/source/','/x/../source/'),route.replace('https://app.invalid','https://user:password@app.invalid')])assert.equal(f.api.local(bad),null);
});
test('Blob en memoire refuse si UID change avant le callback Auth',async()=>{
  const f=fixture();
  await f.api.charger(reference,'image');const before=f.calls.length;
  f.sandbox.MY_UID=B;
  await assert.rejects(f.api.charger(reference,'image'));
  assert.equal(f.calls.length,before);
});

test('miniature video protegee sans poster : aucun src/preload natif',()=>{
  const f=fixture();f.sandbox.preferencesVideoPublique=()=>({dataEco:false});f.sandbox.safeUrlAttr=value=>f.api.route(value);
  const start=source.indexOf('function miniatureVideoPubliqueHTML('),end=source.indexOf('document.addEventListener("visibilitychange"',start);
  vm.runInNewContext(source.slice(start,end),f.sandbox);
  const html=f.sandbox.miniatureVideoPubliqueHTML(null,reference);
  assert.equal(html.includes('<video'),false);assert.equal(/\ssrc=/.test(html),false);
});

test('refresh A retarde apres logout : aucun repli anon pendant identite A stale', async () => {
  let release, started; const waiting=new Promise(r=>started=r);
  const f=fixture({ getSession:async()=>({data:{session:{user:{id:A},access_token:'synthetic.A.signature',expires_at:1}}}),
    refreshSession:()=>{started();return new Promise(r=>release=r);} });
  const pending=f.api.charger(reference,'image'); await waiting; f.api.invalider();
  release({data:{session:{user:{id:A},access_token:'synthetic.A.signature'}}});
  await assert.rejects(pending); await assert.rejects(f.api.session()); assert.equal(f.calls.length,0);
  f.sandbox.MY_UID=null; assert.equal((await f.api.session()).mode,'anon');
});

test('JWT absent/invalide sous compte connecte : jamais un fetch anon', async () => {
  for(const value of [{data:{session:null}},{error:{status:401}},{data:{session:{user:{id:B},access_token:'synthetic.B.signature'}}}]) {
    const f=fixture({getSession:async()=>value}); await assert.rejects(f.api.charger(reference,'image')); assert.equal(f.calls.length,0);
  }
});

test('Blob : headers seuls, no-store requis, plafond sur les octets reels et annulation', async () => {
  let canceled=false;
  const f=fixture({fetch:async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(27262976));c.enqueue(new Uint8Array(1));},cancel(){canceled=true;}}),{headers:{'Content-Type':'video/webm','Cache-Control':'no-store'}})});
  await assert.rejects(f.api.charger(reference,'media')); assert.equal(f.calls[0].init.signal.aborted,true);
  assert.equal(f.calls[0].input,route); assert.equal(new URL(f.calls[0].input).search,'');
  assert.equal(f.calls[0].init.headers.Authorization,'Bearer synthetic.current.signature');
  assert.equal(f.calls[0].init.cache,'no-store'); assert.equal(f.calls[0].init.credentials,'omit'); assert.equal(f.calls[0].init.redirect,'error');
  assert.equal(f.api.etat().mediaResident,false);
  // Le fetch fournisseur reçoit le signal abort ; la fermeture directe du reader est aussi requise.
  assert.equal(canceled,true);
  const cached=fixture({fetch:async()=>new Response(new Uint8Array([1]),{headers:{'Content-Type':'image/webp','Cache-Control':'public'}})});
  await assert.rejects(cached.api.charger(reference,'image'));
});

test('une residence video/audio partagee et nettoyage au switch', async () => {
  const f=fixture(), first=element(), second=element(); f.nodes.push(first,second);
  const one=await f.api.charger(reference,'media',first); first.src=one;
  const two=await f.api.charger(reference.replace('/source/','/other/'),'media',second); second.src=two;
  assert.ok(f.revoked.includes(one)); assert.equal(first.src,undefined); assert.equal(f.api.etat().mediaResident,true);
  f.api.invalider(B); f.sandbox.MY_UID=B;
  assert.ok(f.revoked.includes(two)); assert.equal(second.src,undefined); assert.equal(f.api.etat().mediaResident,false);
});

test('LRU images borne 32MiB/24 objets et deux telechargements maximum', async () => {
  let active=0, peak=0;
  const f=fixture({fetch:async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--;return new Response(new Uint8Array(20000000),{headers:{'Content-Type':'image/webp','Cache-Control':'no-store'}});}});
  await Promise.all(Array.from({length:3},(_,i)=>f.api.charger(reference.replace('/source/',`/source${i}/`),'image')));
  assert.equal(peak,2); assert.equal(f.api.etat().images,1); assert.ok(f.api.etat().imageBytes<=33554432);
  f.api.invalider(); assert.equal(f.api.etat().imageBytes,0);
});

const uploadSource=readFileSync(new URL('../../js/app-08-ui-modals-tour.js',import.meta.url),'utf8');
const uploadCode=uploadSource.slice(uploadSource.indexOf('// PRIVATE MEDIA UPLOAD v1'),uploadSource.indexOf('// END PRIVATE MEDIA UPLOAD v1'));
const publishCode=uploadSource.slice(uploadSource.indexOf('async function _publierAvecEssais('),uploadSource.indexOf('// Redimensionne une image base64 AVANT upload'));
const storyCode=uploadSource.slice(uploadSource.indexOf('async function _envoyerStory('),uploadSource.indexOf('async function supaLoadStories('));
const image='data:image/webp;base64,AQIDBA==';
function uploadFixture(options={}) {
  const events=[],reservations=[],inserts=[];let uploadCalls=0;
  const f=fixture({fetch:async(input,init)=>{
    const url=new URL(input);
    assert.equal(url.search,'');assert.ok(init.signal instanceof AbortSignal);
    if(url.pathname==='/private-media/capabilities')return Response.json({protocol:1,min_client:1,max_bytes:27262976,uploads_enabled:options.enabled!==false,reads_enabled:true},{headers:{'Cache-Control':'no-store'}});
    assert.equal(url.origin,'https://storage.synthetic.invalid');assert.equal(init.headers.apikey,'synthetic-public');
    assert.equal(init.headers.Authorization,'Bearer synthetic.current.signature');
    if(url.pathname==='/rest/v1/rpc/media_reserver'){
      const spec=JSON.parse(init.body);reservations.push(spec);events.push('reserve');
      const ext={'image/webp':'webp','video/webm':'webm','audio/ogg':'ogg'};
      const objects=spec.p_variantes.map(v=>({...v,object_key:`${A}/${spec.p_cle_idempotence}/${v.variant}.${ext[v.mime_type]}`,
        reference:`https://media.passio.invalid/private-media/${spec.p_type}/${spec.p_source_id}/${spec.p_cle_idempotence}/${v.variant}`}));
      if(options.badPath)objects[0].object_key='../foreign';
      return Response.json({asset_id:spec.p_cle_idempotence,bucket_id:'content-protected',objects});
    }
    assert.ok(url.pathname.startsWith('/storage/v1/object/content-protected/'+A+'/'));
    events.push('upload');uploadCalls++;assert.equal(init.headers['x-upsert'],'false');assert.equal(init.headers['cache-control'],'max-age=0');
    assert.ok(init.body instanceof Blob);
    return new Response(null,{status:options.firstUploadFails&&uploadCalls===1?503:200});
  }});
  Object.assign(f.sandbox,{crypto:globalThis.crypto,SUPABASE_URL:'https://storage.synthetic.invalid',SUPABASE_KEY:'synthetic-public',
    uid:()=> 'generated_local_id',_blobDepuisDataUrl:data=>new Blob([Buffer.from(data.slice(data.indexOf(';base64,')+8),'base64')],{type:data.slice(5,data.indexOf(';'))}),
    _downscaleImageForUpload:async data=>data,_imageLegerePourFil:async()=>options.thumbnail?{dataUrl:image}:null,
    supaEnsureProfileExists:async()=>{}, requiredCanonicalPassion:()=>({ok:true,valeur:'art'}),
    _verdictPublication:(post,ok)=>{post.testVerdict=ok;},optionalCanonicalPassion:()=>null,_writeVerdict:r=>({ok:!r.error}),saveState(){},renderStories(){},console:{warn(){},log(){}}});
  f.sandbox.supa.from=table=>{
    let payload=null;
    const q={insert(value){payload=Array.isArray(value)?value[0]:value;inserts.push({table,payload});events.push('insert');return q;},select(){return q;},eq(){return q;},maybeSingle(){return q;},
      async abortSignal(signal){assert.ok(signal instanceof AbortSignal);if(options.insert)return options.insert(payload,signal);
        if(!payload)return {data:options.existing||null,error:null};
        return options.rejected?{error:{code:'42501'},data:null}:options.duplicate?{error:{code:'23505'}}:options.empty?{data:[],error:null}:{data:[{id:payload.id,author_id:payload.author_id,media_url:payload.media_url}],error:null};}};
    return q;
  };
  vm.runInNewContext(uploadCode+'\n'+publishCode+'\n'+storyCode,f.sandbox);
  return {...f,events,reservations,inserts};
}
const post=()=>({id:'new_post',authorId:A,type:'photo',image,passion:'art',createdAt:Date.now(),text:'synthetique'});

test('upload : reservation exacte avant original/v720, aucune URL publique et preview intacte avant INSERT',async()=>{
  const f=uploadFixture({thumbnail:true}),p=post();
  const pending=await f.api.envoyer('posts',p);
  assert.deepEqual(f.events,['reserve','upload','upload']);assert.equal(f.inserts.length,0);assert.equal(p.image,image);
  assert.equal(f.reservations[0].p_source_id,p.id);assert.equal(f.reservations[0].p_variantes.length,2);
  assert.ok(pending.reference.endsWith('/v720'));
  assert.equal(await f.sandbox._publierAvecEssais(p,1),true);
  assert.equal(p.testVerdict,true);assert.equal(p.image,pending.reference);assert.equal(f.inserts[0].payload.media_url,pending.reference);
});

test('retry upload : meme cle et memes variantes, sans upsert ni nouvelle reservation logique',async()=>{
  const f=uploadFixture({firstUploadFails:true}),p=post();
  await assert.rejects(f.api.envoyer('posts',p));const result=await f.api.envoyer('posts',p);
  assert.equal(f.reservations.length,2);assert.deepEqual(f.reservations[0],f.reservations[1]);
  assert.ok(f.api.parser(result.reference));assert.equal(f.inserts.length,0);
});

test('capability false, chemin forge, autre parent et faux SDK offline refusent avant INSERT',async()=>{
  for(const options of [{enabled:false},{badPath:true}]){
    const f=uploadFixture(options),p=post();assert.equal(await f.sandbox._publierAvecEssais(p,1),false);assert.equal(p.testVerdict,false);assert.equal(f.inserts.length,0);
  }
  const f=uploadFixture();await assert.rejects(f.api.envoyer('posts',{...post(),image:reference}));
  f.sandbox._supaReal=false;await assert.rejects(f.api.envoyer('posts',post()));assert.equal(f.calls.length,0);
});

test('refus INSERT ou retour vide ne publie pas, ne remplace pas la preview et garde le prive',async()=>{
  for(const options of [{rejected:true},{empty:true}]){
    const f=uploadFixture(options),p=post();assert.equal(await f.sandbox._publierAvecEssais(p,1),false);
    assert.equal(p.testVerdict,false);assert.equal(p.image,image);assert.equal(f.inserts.length,1);assert.ok(f.api.parser(p._pmpReference));
    assert.equal(f.events.filter(v=>v==='upload').length,1);
  }
});

test('23505 : relecture du parent exact, collision etranger = false',async()=>{
  const bad=uploadFixture({duplicate:true,existing:{id:'new_post',author_id:B,media_url:null}}),p=post();
  assert.equal(await bad.sandbox._publierAvecEssais(p,1),false);
  const good=uploadFixture({duplicate:true});const row=post();
  await good.api.envoyer('posts',row);
  let read=0;
  good.sandbox.supa.from=()=>({insertion:false,select(){return this;},eq(){return this;},maybeSingle(){return this;},insert(){this.insertion=true;return this;},async abortSignal(){if(this.insertion)return {error:{code:'23505'}};read++;return {data:{id:row.id,author_id:A,media_url:row._pmpReference},error:null};}});
  assert.equal(await good.sandbox._publierAvecEssais(row,1),true);
  assert.equal(read,1);
});

test('switch pendant INSERT : signal annule et aucun verdict de succes tardif',async()=>{
  let release,ready;const started=new Promise(r=>ready=r);let signal;
  const f=uploadFixture({insert:(payload,s)=>{signal=s;ready();return new Promise(r=>release=()=>r({data:[payload],error:null}));}}),p=post();
  const pending=f.sandbox._publierAvecEssais(p,1);await started;f.api.invalider(B);f.sandbox.MY_UID=B;release();
  assert.equal(await pending,false);assert.equal(signal.aborted,true);assert.equal(p.testVerdict,undefined);assert.equal(p.image,image);
});

test('repost : lien SQL conserve, aucun nouvel asset ni duplication de media',async()=>{
  const f=uploadFixture(),p={...post(),sharedReel:'source',image:reference};
  assert.equal(await f.sandbox._publierAvecEssais(p,1),true);
  assert.equal(f.inserts[0].payload.shared_from_post_id,'source');assert.equal(f.inserts[0].payload.media_url,null);
  assert.equal(f.reservations.length,0);assert.equal(f.calls.length,0);
});

test('presentation rechargee : video/audio/poster meme asset, JSON non autoritaire et references etrangeres refusees',()=>{
  const f=uploadFixture(),media=`https://media.passio.invalid/private-media/posts/new_post/${A}/original`;
  for(const type of ['photo','video','audio']) {
    const poster=media.replace('/original','/poster'),r={id:'new_post',media_url:media,shared_data:JSON.stringify({passio_media:{protocol:1,type,poster}})};
    const loaded=f.api.presentation(r);assert.equal(loaded.type,type);assert.equal(loaded[type==='photo'?'image':type],media);assert.equal(loaded.poster,poster);
    r.shared_data={passio_media:{protocol:1,type,poster:poster.replace(A,B)}};
    assert.equal(f.api.presentation(r).poster,null);
  }
  assert.equal(f.api.presentation({id:'new_post',media_url:media,shared_data:'{bad'}),null);
  assert.equal(f.api.presentation({id:'new_post',media_url:media,shared_data:{passio_media:{protocol:1,type:'html'}}}),null);
});

test('stories : ID genere avant reservation, type conserve, vrai INSERT avant publication locale',async()=>{
  const f=uploadFixture(),story={authorId:A,media:image,mediaType:'photo',text:'story synthetique'};
  assert.equal(await f.sandbox._envoyerStory(story),true);
  assert.equal(f.reservations[0].p_type,'stories');assert.equal(f.reservations[0].p_source_id,story.id);
  assert.deepEqual(f.events,['reserve','upload','insert']);assert.ok(f.api.parser(story.media));
  assert.equal(f.inserts[0].payload.media_type,'photo');assert.equal(f.inserts[0].payload.id,story.id);
  const refused=uploadFixture({rejected:true}),draft={id:'story_denied',authorId:A,media:image,mediaType:'photo'};
  assert.equal(await refused.sandbox._envoyerStory(draft),false);assert.equal(draft.media,image);
  assert.equal(refused.events.filter(e=>e==='insert').length,1);
});

test('video et poster reserves ensemble avant flux ; helper public refuse les dossiers sensibles',async()=>{
  const f=uploadFixture(),p={...post(),type:'video',video:'data:video/webm;base64,AQIDBA==',image};
  const result=await f.api.envoyer('posts',p);
  assert.deepEqual(f.reservations[0].p_variantes.map(v=>v.variant),['original','poster']);
  assert.ok(result.poster.endsWith('/poster'));assert.equal(p.image,image);
  const legacy=uploadSource.slice(uploadSource.indexOf('async function supaUploadMedia('),uploadSource.indexOf('// Version legacy (fallback)'));
  vm.runInNewContext(legacy,f.sandbox);
  const before=f.calls.length;
  for(const folder of ['photos','videos','audios'])assert.equal(await f.sandbox.supaUploadMedia('x',folder,image,'image'),null);
  assert.equal(f.calls.length,before);
  let publicCalls=0;f.sandbox.atob=value=>Buffer.from(value,'base64').toString('binary');f.sandbox.cdnUrl=value=>value;
  f.sandbox.supa.storage={from(bucket){assert.equal(bucket,'content');return {async upload(key){assert.ok(key.startsWith('avatars/'+A+'/'));publicCalls++;return {error:null};},getPublicUrl(){return {data:{publicUrl:'https://public.synthetic.invalid/avatar.gif'}};}};}};
  assert.equal(await f.sandbox.supaUploadMedia('avatar','avatars','data:image/gif;base64,AQIDBA==','image'),'https://public.synthetic.invalid/avatar.gif');
  assert.equal(publicCalls,1);
});

test('purge CacheStorage : seules les references privees de cette origine sont retirees, avant session',async()=>{
  const f=fixture(),entries=new Set(['https://app.invalid/private-media/capabilities',route,'https://app.invalid/client.js','https://other.invalid/private-media/posts/x']);
  f.sandbox.caches={keys:async()=>['legacy'],open:async()=>({keys:async()=>Array.from(entries).map(url=>new Request(url)),delete:async r=>entries.delete(r.url)})};
  await f.api.purgerCaches();
  assert.deepEqual(Array.from(entries),['https://app.invalid/client.js','https://other.invalid/private-media/posts/x']);
  let sdk=0;f.sandbox.supa.auth.getSession=async()=>{sdk++;throw new Error('should_not_reach');};
  f.sandbox.caches.keys=async()=>{throw new Error('synthetic_cache_failure');};
  await assert.rejects(f.api.purgerCaches());await assert.rejects(f.api.session());assert.equal(sdk,0);
});

test('images hors vue ou document cache : aucun fetch Blob demarre',async()=>{
  const f=fixture(),el=element();f.sandbox.innerWidth=400;f.sandbox.innerHeight=800;
  el.getBoundingClientRect=()=>({left:0,right:100,top:1600,bottom:1700,width:100,height:100});
  await assert.rejects(f.api.charger(reference,'image',el));assert.equal(f.calls.length,0);
  el.getBoundingClientRect=()=>({left:0,right:100,top:0,bottom:100,width:100,height:100});f.sandbox.document.hidden=true;
  await assert.rejects(f.api.charger(reference,'image',el));assert.equal(f.calls.length,0);
  f.sandbox.document.hidden=false;await f.api.charger(reference,'image',el);assert.equal(f.calls.length,1);f.api.invalider();
});

test('annulation fournisseur sans fin : refus client immediat et file images liberee',async()=>{
  let canceled=false;
  const f=fixture({fetch:async()=>new Response(new ReadableStream({cancel(){canceled=true;return new Promise(()=>{});}}),{headers:{'Content-Type':'image/svg+xml','Cache-Control':'no-store'}})});
  const result=await Promise.race([f.api.charger(reference,'image').then(()=>false,()=>true),new Promise(r=>setTimeout(()=>r('timeout'),100))]);
  assert.equal(result,true);assert.equal(canceled,true);await new Promise(r=>setImmediate(r));assert.equal(f.api.etat().activeImages,0);
});

test('vrai listener du demarrage connecte : SIGNED_OUT et changement de compte revoquent avant tout differe',async()=>{
  const bootSource=readFileSync(new URL('../../js/app-08-ui-modals-tour.js',import.meta.url),'utf8');
  const start=bootSource.indexOf('function _ecouterFinDeSession()');
  const listener=bootSource.slice(start,bootSource.indexOf('// Le bandeau vit',start));
  for(const [event,session] of [['SIGNED_OUT',null],['SIGNED_IN',{user:{id:B}}]]) {
    let callback,release,started;
    const pendingFetch=new Promise(r=>release=r),fetchStarted=new Promise(r=>started=r);
    const f=fixture({fetch:async input=>{
      if(input.includes('/pending/')){started();return pendingFetch;}
      return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/webp','Cache-Control':'no-store'}});
    }}),el=element(),deferred=[];
    f.nodes.push(el);el.src=await f.api.charger(reference,'image',el);
    f.sandbox.supa.auth.onAuthStateChange=handler=>{callback=handler;};
    f.sandbox._compteAuthReel=()=>true;
    f.sandbox.poserSessionExpiree=()=>{f.sandbox.expired=true;};
    f.sandbox._poserBandeauSessionExpiree=()=>{};
    vm.runInNewContext(listener,f.sandbox);f.sandbox._ecouterFinDeSession();
    const pending=f.api.charger(reference.replace('/source/','/pending/'),'image');
    const rejected=assert.rejects(pending);await fetchStarted;
    f.sandbox.setTimeout=fn=>deferred.push(fn);
    callback(event,session);
    assert.equal(f.api.etat().images,0);assert.equal(el.src,undefined);assert.equal(f.revoked.length,1);
    assert.equal(f.calls[1].init.signal.aborted,true);assert.equal(f.sandbox.expired,undefined);
    const before=f.calls.length;await assert.rejects(f.api.charger(reference,'image'));assert.equal(f.calls.length,before);
    release(new Response(new Uint8Array([1]),{headers:{'Content-Type':'image/webp','Cache-Control':'no-store'}}));await rejected;
    for(const fn of deferred)fn();assert.equal(f.sandbox.expired,event==='SIGNED_OUT'?true:undefined);
  }
});

test('meme image sur deux surfaces : un seul flux et les deux Blob restent affiches jusqu a invalidation',async()=>{
  let release,started;const held=new Promise(r=>release=r),ready=new Promise(r=>started=r);
  const f=fixture({fetch:async()=>{started();return held;}}),a=element(),b=element();
  f.nodes.push(a,b);
  const first=f.api.charger(reference,'image',a).then(url=>(a.src=url,url));
  const second=f.api.charger(reference,'image',b).then(url=>(b.src=url,url));
  await ready;assert.equal(f.calls.length,1);
  release(new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/webp','Cache-Control':'no-store'}}));
  const [one,two]=await Promise.all([first,second]);
  assert.match(one,/^blob:/);assert.equal(one,two);assert.equal(a.src,one);assert.equal(b.src,one);
  assert.equal(f.revoked.length,0);assert.equal(f.api.etat().images,1);assert.equal(f.api.etat().imageBytes,3);
  f.api.invalider();assert.equal(a.src,undefined);assert.equal(b.src,undefined);assert.deepEqual(f.revoked,[one]);
});
