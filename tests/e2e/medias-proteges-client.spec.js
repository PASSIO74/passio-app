const {test,expect}=require('@playwright/test');
const {localMediaServer}=require('./medias-proteges-local.cjs');
// ISOLATION: fixture HTTP loopback dediee, aucune app complete ni Supabase distant ; vrai SW/namespace/handler.
test.describe('medias proteges client synthetique',()=>{
  let srv;
  test.beforeEach(async({context,page})=>{
    srv=await localMediaServer({wrongClient:process.env.PASSIO_MEDIA_MUTANT==='wrong-client'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===srv.origin?route.continue():route.abort());
    await page.goto(srv.origin);await page.evaluate(()=>startWorker());
    await page.evaluate(id=>login(id),srv.A);
  });
  test.afterEach(async()=>{await srv.close();});
  const path=(id,kind='private')=>`/private-media/posts/${kind}/${id}/original`;

  test('HEAD exact client, POST Range et image Blob, GET ferme sans cache',async({page})=>{
    const target=await page.evaluate(reference=>urlMediaDirecte(reference),'https://media.passio.invalid'+path(srv.A));
    expect(target).toBe(srv.origin+path(srv.A));
    const result=await page.evaluate(async url=>{
      const headers=await fetch(url,{method:'HEAD',headers:{'X-Passio-Media-Read':'1'}});
      async function range(value){return passioMediaProteges.avecSession(c=>fetch(url,{method:'POST',headers:{...c.headers,'X-Passio-Media-Read':'1',Range:value},signal:c.signal,cache:'no-store',credentials:'omit'}));}
      const partial=await range('bytes=1-3'),bad=await range('bytes=999-'),closed=await fetch(url);
      const image=document.createElement('img');
      const loaded=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture_image_timeout')),5000),observer=new MutationObserver(()=>{if(image.src.startsWith('blob:'))image.decode().then(()=>{clearTimeout(timer);observer.disconnect();resolve();},reject);});observer.observe(image,{attributes:true,attributeFilter:['src']});});
      passioMediaProteges.poserImage(image,url);document.querySelector('#content').append(image);await loaded;
      const keys=await caches.keys(),cached=[];for(const key of keys)cached.push(...(await (await caches.open(key)).keys()).map(r=>r.url));
      return {head:headers.status,headBytes:(await headers.arrayBuffer()).byteLength,range:partial.status,bytes:(await partial.arrayBuffer()).byteLength,bad:bad.status,image:image.naturalWidth,blob:image.src.startsWith('blob:'),get:closed.status,cached:cached.filter(u=>u.includes('/private-media/'))};
    },target);
    expect(result).toEqual({head:200,headBytes:0,range:206,bytes:3,bad:416,image:1,blob:true,get:405,cached:[]});
    expect(srv.events.filter(e=>e.kind==='authorize').every(e=>e.subject==='A')).toBe(true);
  });

  test('A retarde puis B, logout, iframe et navigation directe fermes',async({context,page})=>{
    await page.evaluate(url=>{suspendSession();window.pending=passioMediaProteges.charger(url,'image').then(()=>true,()=>false);},path(srv.A));
    await page.waitForFunction(()=>held);
    await page.evaluate(id=>{login(id);releaseSession();},srv.B);
    expect(await page.evaluate(()=>pending)).toBe(false);expect(srv.events.filter(e=>e.kind==='authorize'||e.kind==='bytes').length).toBe(0);
    expect(await page.evaluate(async url=>{try{await passioMediaProteges.charger(url,'image');return true;}catch(_){return false;}},path(srv.A))).toBe(false);
    await page.evaluate(()=>login(null));
    expect(await page.evaluate(async url=>{try{await passioMediaProteges.charger(url,'image');return true;}catch(_){return false;}},path(srv.A))).toBe(false);
    expect(await page.evaluate(async url=>{try{await passioMediaProteges.charger(url,'image');return true;}catch(_){return false;}},path(srv.A,'public'))).toBe(true);
    const frame=await page.evaluateHandle(()=>{const f=document.createElement('iframe');f.src='/?inside=1';document.body.append(f);return f;});
    const iframe=await (await frame.asElement()).contentFrame();await iframe.waitForLoadState();
    expect(await iframe.evaluate(async url=>(await fetch(url,{method:'HEAD',headers:{'X-Passio-Media-Read':'1'}})).status,path(srv.A))).toBe(401);
    const direct=await context.newPage();
    const [response]=await Promise.all([direct.waitForResponse(r=>r.url()===srv.origin+path(srv.A)),direct.goto(srv.origin+path(srv.A)).catch(error=>{if(!/Download is starting/.test(error.message))throw error;})]);
    expect(response.status()).toBe(405);
  });

  test('deux onglets epochs identiques restent isoles',async({context,page})=>{
    await page.goto(srv.origin+'/?donor=1');await page.evaluate(id=>login(id),srv.A);
    const other=await context.newPage();await other.goto(srv.origin);await other.evaluate(id=>login(id),srv.B);
    expect(await other.evaluate(async url=>(await fetch(url,{method:'HEAD',headers:{'X-Passio-Media-Read':'1'}})).status,path(srv.A))).toBe(404);
    expect(await page.evaluate(async url=>(await fetch(url,{method:'HEAD',headers:{'X-Passio-Media-Read':'1'}})).status,path(srv.A))).toBe(200);
    expect(await other.evaluate(async url=>(await fetch(url,{method:'HEAD',headers:{'X-Passio-Media-Read':'1'}})).status,path(srv.B))).toBe(200);
  });

  test('video passe par Blob authentifie et seule residence est revoquee',async({page,browserName})=>{
    const result=await page.evaluate(async({url,id,decode})=>{
      const video=document.createElement('video');video.controls=true;document.querySelector('#content').append(video);
      const blob=await passioMediaProteges.charger(url,'media',video);video.src=blob;
      const bytes=(await (await fetch(blob)).arrayBuffer()).byteLength;
      let dimensions=null;if(decode){video.muted=true;await video.play();dimensions=[video.videoWidth,video.videoHeight];video.pause();}
      const before=passioMediaProteges.etat();login(id);
      let revoked=false;try{await fetch(blob);}catch(_){revoked=true;}
      return {bytes,before:before.mediaResident,after:passioMediaProteges.etat().mediaResident,revoked,cleared:!video.getAttribute('src'),dimensions};
    },{url:path(srv.A,'video'),id:srv.B,decode:browserName==='chromium'});
    // WebKit Windows : transport teste, codec/iOS restent une reserve explicite.
    expect(result).toEqual({bytes:srv.videoBytes,before:true,after:false,revoked:true,cleared:true,dimensions:browserName==='chromium'?[160,90]:null});
  });

  test('image hors vue : zero requete avant intersection, puis Blob POST et purge',async({page})=>{
    await page.evaluate(url=>{const image=document.createElement('img');image.id='lazy-private';image.loading='lazy';image.style.cssText='position:absolute;top:4000px;width:100px;height:100px';passioMediaProteges.poserImage(image,url);document.querySelector('#content').append(image);},path(srv.A));
    await page.waitForFunction(()=>document.querySelector('#lazy-private').hasAttribute('data-pmp-epoch'));
    // Deux frames laissent IntersectionObserver decider, sans sleep reseau arbitraire.
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    expect(srv.events.filter(e=>e.kind==='authorize'||e.kind==='bytes')).toEqual([]);
    await page.locator('#lazy-private').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('#lazy-private').src.startsWith('blob:'));
    expect(await page.locator('#lazy-private').evaluate(image=>image.decode().then(()=>image.naturalWidth))).toBe(1);
    await page.evaluate(id=>login(id),srv.B);
    expect(await page.locator('#lazy-private').getAttribute('src')).toBeNull();
    expect(await page.evaluate(()=>passioMediaProteges.etat().imageBytes)).toBe(0);
  });

  test('meme image sur deux surfaces visibles : un seul flux et deux images conservees',async({page})=>{
    await page.evaluate(url=>{
      for(const id of ['image-fil','image-fiche']){
        const image=document.createElement('img');image.id=id;image.style.cssText='width:100px;height:100px';
        passioMediaProteges.poserImage(image,url);document.querySelector('#content').append(image);
      }
    },path(srv.A));
    await page.waitForFunction(()=>['image-fil','image-fiche'].every(id=>document.getElementById(id).src.startsWith('blob:')));
    const images=await page.evaluate(async()=>Promise.all(['image-fil','image-fiche'].map(async id=>{
      const image=document.getElementById(id);await image.decode();return {src:image.src,width:image.naturalWidth};
    })));
    expect(images[0].width).toBe(1);expect(images[1]).toEqual(images[0]);
    expect(srv.events.filter(e=>e.kind==='bytes').length).toBe(1);
    await page.evaluate(id=>login(id),srv.B);
    expect(await page.locator('#image-fil').getAttribute('src')).toBeNull();
    expect(await page.locator('#image-fiche').getAttribute('src')).toBeNull();
  });

  test('nouveau worker, client vivant : aucun ancien bearer partage ou rendu conserve',async({page})=>{
    expect(await page.evaluate(async url=>(await fetch(url,{method:'HEAD',headers:{'X-Passio-Media-Read':'1'}})).status,path(srv.A))).toBe(200);
    const before=await page.evaluate(()=>passioMediaProteges.etat().epoch);srv.restartWorker();
    await page.evaluate(async()=>{const changed=new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));await (await navigator.serviceWorker.getRegistration()).update();await changed;});
    expect(await page.evaluate(()=>passioMediaProteges.etat().epoch)).toBeGreaterThan(before);
    await page.evaluate(id=>login(id),srv.B);
    expect(await page.evaluate(async url=>(await fetch(url,{method:'HEAD',headers:{'X-Passio-Media-Read':'1'}})).status,path(srv.A))).toBe(404);
    expect(await page.evaluate(async url=>(await fetch(url,{method:'HEAD',headers:{'X-Passio-Media-Read':'1'}})).status,path(srv.B))).toBe(200);
  });

  test('image A deja rendue : nouveau Blob et references apres releve du worker au meme UID',async({page})=>{
    await page.evaluate(url=>{const image=document.createElement('img');image.id='same-uid-image';passioMediaProteges.poserImage(image,url);document.querySelector('#content').append(image);},path(srv.A));
    await page.waitForFunction(()=>{const image=document.querySelector('#same-uid-image');return image.src.startsWith('blob:')&&image.complete&&image.naturalWidth===1;});
    const before=await page.evaluate(()=>{const image=document.querySelector('#same-uid-image');return {blob:image.src,reference:image.getAttribute('data-pmp-src'),epoch:image.getAttribute('data-pmp-epoch'),images:passioMediaProteges.etat().images,bytes:passioMediaProteges.etat().imageBytes};});
    expect(before.images).toBe(1);expect(before.bytes).toBe(42);expect(before.reference).toBe(srv.origin+path(srv.A));
    const reads=srv.events.filter(event=>event.kind==='authorize').length;srv.restartWorker();
    await page.evaluate(async()=>{const changed=new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));await (await navigator.serviceWorker.getRegistration()).update();await changed;});
    await expect.poll(()=>page.evaluate(()=>{const image=document.querySelector('#same-uid-image');return {blob:image.src.startsWith('blob:'),width:image.naturalWidth,reference:image.getAttribute('data-pmp-src'),epoch:image.getAttribute('data-pmp-epoch')===String(passioMediaProteges.etat().epoch),images:passioMediaProteges.etat().images,bytes:passioMediaProteges.etat().imageBytes};})).toEqual({blob:true,width:1,reference:before.reference,epoch:true,images:1,bytes:42});
    expect(await page.locator('#same-uid-image').getAttribute('src')).not.toBe(before.blob);
    expect(await page.evaluate(async blob=>{try{await fetch(blob);return false;}catch(_){return true;}},before.blob)).toBe(true);
    expect(srv.events.filter(event=>event.kind==='authorize').length).toBeGreaterThan(reads);
    expect(srv.events.filter(event=>event.kind==='authorize').every(event=>event.subject==='A')).toBe(true);
    await page.evaluate(id=>login(id),srv.B);
    expect(await page.locator('#same-uid-image').getAttribute('src')).toBeNull();
    expect(await page.evaluate(()=>passioMediaProteges.etat().imageBytes)).toBe(0);
    expect(await page.evaluate(async url=>{try{await passioMediaProteges.charger(url,'image');return true;}catch(_){return false;}},path(srv.A))).toBe(false);
  });

  test('sans controle SW : image Blob explicite, offline sans ancien repli public',async({browser})=>{
    const context=await browser.newContext({serviceWorkers:'block'});
    try{
      await context.route('**/*',route=>new URL(route.request().url()).origin===srv.origin?route.continue():route.abort());
      const page=await context.newPage();await page.goto(srv.origin);await page.evaluate(id=>login(id),srv.A);
      const image=await page.evaluate(async url=>{const img=document.createElement('img');passioMediaProteges.poserImage(img,url);document.querySelector('#content').append(img);await new Promise((resolve,reject)=>{const until=setInterval(()=>{if(img.src.startsWith('blob:')&&img.complete&&img.naturalWidth){clearInterval(until);resolve();}},10);setTimeout(()=>{clearInterval(until);reject(new Error('fixture_image_timeout'));},5000);});return {blob:img.src.startsWith('blob:'),width:img.naturalWidth,controlled:!!navigator.serviceWorker.controller};},path(srv.A));
      expect(image).toEqual({blob:true,width:1,controlled:false});await context.setOffline(true);
      expect(await page.evaluate(async url=>{try{await passioMediaProteges.charger(url,'image');return false;}catch(_){return true;}},path(srv.A,'offline_unseen'))).toBe(true);
    }finally{await context.close();}
  });

  test('octets A deja autorises retardes, changement worker puis B : aucun rendu tardif',async({page})=>{
    srv.holdMedia();
    await page.evaluate(url=>{const img=document.createElement('img');img.id='held-image';passioMediaProteges.poserImage(img,url);document.querySelector('#content').append(img);},path(srv.A));
    await expect.poll(()=>srv.held).toBe(true);
    expect(srv.events.some(e=>e.kind==='authorized-held')).toBe(true);srv.restartWorker();
    const diagnostic=await page.evaluate(async id=>{
      const registration=await navigator.serviceWorker.getRegistration();
      window.workerHandoff=new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',()=>{login(id);r();},{once:true}));
      registration.update();
      registration.addEventListener('updatefound',()=>{const installing=registration.installing;if(installing)installing.addEventListener('statechange',()=>{if(installing.state==='installed'&&registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});});});
      return Promise.race([workerHandoff.then(()=>({changed:true})),new Promise(r=>setTimeout(()=>r({changed:false,installing:registration.installing&&registration.installing.state,waiting:registration.waiting&&registration.waiting.state,active:registration.active&&registration.active.state,client:passioMediaProteges.etat()}),3000))]);
    },srv.B);
    if(!diagnostic.changed){
      // Worker installed : emprunter le meme SKIP_WAITING explicite que l'UI de mise a jour.
      // L'annulation doit etre confirmee avant cette demande, sans inventer controllerchange.
      expect(diagnostic.waiting).toBe('installed');expect(diagnostic.active).toBe('activated');
      expect(diagnostic.client.canaux).toBe(0);
      await expect.poll(()=>srv.events.some(e=>e.kind==='request-aborted')).toBe(true);
      await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();reg.waiting.postMessage({type:'SKIP_WAITING'});await workerHandoff;});
      test.info().annotations.push({type:'runtime',description:'Activation explicite du worker installed après annulation confirmée du flux.'});
    }
    // POST ignore tous les workers : l'AbortController de la page coupe ce flux.
    expect(await page.evaluate(()=>passioMediaProteges.etat().canaux)).toBe(0);
    await expect.poll(()=>srv.events.some(e=>e.kind==='request-aborted')).toBe(true);
    srv.releaseMedia();
    await expect.poll(()=>srv.events.some(e=>e.kind==='held-aborted')).toBe(true);
    const result=await page.evaluate(async()=>{
      const img=document.querySelector('#held-image'),cached=[];
      for(const name of await caches.keys())cached.push(...(await (await caches.open(name)).keys()).map(r=>r.url));
      return {src:img.getAttribute('src'),width:img.naturalWidth,blobs:passioMediaProteges.etat().imageBytes,cached:cached.filter(u=>u.includes('/private-media/'))};
    });
    expect(result).toEqual({src:null,width:0,blobs:0,cached:[]});
    expect(srv.events.some(e=>e.kind==='held-released')).toBe(false);
  });
});

test('vrai ancien SW453 : zero cache media/capacites, aucun octet A apres logout ou B',async({browser})=>{
  const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
  const legacy=fs.readFileSync(path.join(__dirname,'fixtures/medias-proteges-sw-legacy-45362dc.js'));
  expect(crypto.createHash('sha256').update(legacy).digest('hex')).toBe('11339b9c2a59d92ff466850f9a6a8927948363bfee1539e52b1a594e3a3274cf');
  const srv=await localMediaServer({diagnosticSource:legacy.toString('utf8'),observeLegacyCache:true,candidatePost:process.env.PASSIO_MEDIA_POST_CANDIDATE==='1',legacyRelayProbe:process.env.PASSIO_MEDIA_LEGACY_RELAY_PROBE==='1',legacyGetProbe:process.env.PASSIO_MEDIA_LEGACY_GET_PROBE==='1'});
  const context=await browser.newContext();
  try{
    await context.route('**/*',route=>new URL(route.request().url()).origin===srv.origin?route.continue():route.abort());
    const page=await context.newPage();await page.goto(srv.origin);await page.evaluate(()=>startWorker());
    const result=await page.evaluate(async({a,b})=>{
      login(a);await passioMediaProteges.capacites();
      const uri=`https://media.passio.invalid/private-media/posts/private/${a}/original`;
      const first=await passioMediaProteges.charger(uri,'image'),aBytes=(await (await fetch(first)).arrayBuffer()).byteLength;
      const marked=await passioMediaProteges.avecSession(c=>fetch(passioMediaProteges.route(uri),{headers:{...c.headers,'X-Passio-Media-Read':'1'},cache:'no-store',credentials:'omit',signal:c.signal}));
      await new Promise((resolve,reject)=>{const channel=new MessageChannel(),nonce=crypto.randomUUID(),timer=setTimeout(()=>reject(new Error('fixture_cache_drain_timeout')),2000);
        channel.port1.onmessage=event=>{if(event.data&&event.data.type==='PASSIO_TEST_CACHE_DRAINED'&&event.data.nonce===nonce){clearTimeout(timer);channel.port1.close();resolve();}};
        navigator.serviceWorker.controller.postMessage({type:'PASSIO_TEST_CACHE_DRAIN',nonce},[channel.port2]);});
      let cacheCount=0;for(const key of await caches.keys())cacheCount+=(await (await caches.open(key)).keys()).filter(r=>new URL(r.url).pathname.startsWith('/private-media/')).length;
      async function lire(){try{await passioMediaProteges.charger(uri,'image');return true;}catch(_){return false;}}
      login(null);const logoutSuccess=await lire();login(b);const bSuccess=await lire();
      return {aBytes,get:marked.status,getBytes:(await marked.arrayBuffer()).byteLength,cacheCount,logoutSuccess,bSuccess};
    },{a:srv.A,b:srv.B});
    expect(result).toEqual({aBytes:42,get:405,getBytes:0,cacheCount:0,logoutSuccess:false,bSuccess:false});
  }finally{await context.close();await srv.close();}
});
