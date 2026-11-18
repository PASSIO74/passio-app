const {test,expect}=require('@playwright/test');
const {localMediaServer}=require('./medias-proteges-local.cjs');
const {sansDonneesDistantes}=require('./app-helper');

// ISOLATION : serveur loopback possede, vrais lecteurs/mapping/detail du produit.
// SQL de projection, RLS, SDK metadata et stockage sont doubles synthetiques.
// Cette suite ne qualifie ni PostgreSQL, ni Auth/RLS ou octets heberges.
test.beforeEach(async({page})=>{await sansDonneesDistantes(page);});

test.describe('projection des photos heritees aux points de lecture reels',()=>{
  let srv,sorties;
  test.beforeEach(async({context,page})=>{
    sorties=0;srv=await localMediaServer({heritage:true});
    const fermerExterieur=route=>{
      const u=route.request().url();
      if(u.startsWith(srv.origin+'/')||u.startsWith('blob:')||u.startsWith('data:'))return route.continue();
      sorties++;return route.abort();
    };
    await context.route('**/*',fermerExterieur);
    // Prioritaire aussi sur les pixels de secours du helper : une ancienne
    // image publique doit echouer au compteur, pas etre remplacee par un pixel.
    await page.route('**/*',fermerExterieur);
    await page.goto(srv.origin);await page.evaluate(id=>login(id),srv.A);
  });
  test.afterEach(async()=>{try{expect(sorties).toBe(0);}finally{await srv?.close();}});

  async function imagesDecodees(page,selector,nombre){
    await expect.poll(()=>page.locator(selector).count()).toBe(nombre);
    await page.waitForFunction(({selector,nombre})=>{
      const images=[...document.querySelectorAll(selector)];
      return images.length===nombre&&images.every(image=>image.src.startsWith('blob:')&&image.complete&&image.naturalWidth===1);
    },{selector,nombre});
  }

  for(const lecteur of ['proprietaire','destinataire']){
    test(lecteur+' : vrais fil, evenement et fiche ; deux photos Blob sans URL publique',async({page})=>{
      const subject=lecteur==='proprietaire'?'A':'B';
      await page.evaluate(id=>login(id),subject==='A'?srv.A:srv.B);
      const fil=await page.evaluate(()=>heritageLoad('feed'));
      expect(fil.map(p=>p.id).sort()).toEqual(srv.heritageIds.slice().sort());
      expect(fil.every(p=>p.type==='photo'&&p.image.startsWith('https://media.passio.invalid/private-media/posts/'))).toBe(true);
      expect(fil.every(p=>p.eventId==='heritage_event')).toBe(true);
      await imagesDecodees(page,'#content img',2);

      const evenement=await page.evaluate(()=>heritageLoad('event'));
      expect(evenement.map(p=>p.id).sort()).toEqual(srv.heritageIds.slice().sort());
      expect(evenement.every(p=>p.eventId==='heritage_event'&&p.image.startsWith('https://media.passio.invalid/private-media/posts/'))).toBe(true);
      await imagesDecodees(page,'#content img',2);

      await page.evaluate(async id=>{heritageCards();await openPost(id);},srv.heritageIds[0]);
      await imagesDecodees(page,'#postDetailContent img',1);
      const copies=await page.evaluate(id=>heritageCopies(id),srv.heritageIds[0]);
      expect(copies).toHaveLength(3);expect(new Set(copies).size).toBe(1);
      expect(copies.every(value=>value.startsWith('https://media.passio.invalid/private-media/posts/'))).toBe(true);
      const autorisations=srv.events.filter(e=>e.kind==='heritage-authorize');
      expect(autorisations.length).toBeGreaterThanOrEqual(2);
      expect(autorisations.every(e=>e.subject===subject&&e.matched)).toBe(true);
      expect(srv.events.some(e=>e.kind==='heritage-posts'&&e.event&&e.subject===subject)).toBe(true);
      const lectures=srv.events.filter(e=>e.kind==='heritage-bytes');
      expect(lectures.length).toBeGreaterThanOrEqual(2);expect(lectures.every(e=>e.bytes>0)).toBe(true);
    });
  }

  test('texte sans candidat : aucun RPC de projection ni lecture media',async({page})=>{
    srv.setHeritageMode('text');
    const fil=await page.evaluate(()=>heritageLoad('feed'));
    expect(fil).toHaveLength(2);expect(fil.every(p=>p.type==='text'&&p.image===null)).toBe(true);
    expect(await page.locator('#content img').count()).toBe(0);
    expect(srv.events.filter(e=>e.kind==='heritage-projection'||e.kind==='heritage-authorize'||e.kind==='heritage-bytes')).toEqual([]);
    expect(await page.evaluate(()=>passioMediaProteges.etatHeritage())).toEqual({candidats:0,projetes:0,refuses:0});
  });

  for(const mode of ['error','missing','badHash']){
    test('refus '+mode+' : lignes presentes mais aucun repli public dans fil/evenement/fiche',async({page})=>{
      srv.setHeritageMode(mode);
      for(const lecteur of ['feed','event']){
        const cartes=await page.evaluate(kind=>heritageLoad(kind),lecteur);
        expect(cartes).toHaveLength(2);expect(cartes.every(p=>p.image===null)).toBe(true);
        expect(await page.locator('#content img').count()).toBe(0);
      }
      await page.evaluate(async id=>{heritageCards();await openPost(id);},srv.heritageIds[0]);
      expect(await page.locator('#postDetailContent img').count()).toBe(0);
      expect(await page.evaluate(id=>heritageCopies(id),srv.heritageIds[0])).toEqual([null,null,null]);
      expect(srv.events.filter(e=>e.kind==='heritage-projection').length).toBeGreaterThanOrEqual(3);
      expect(srv.events.filter(e=>e.kind==='heritage-authorize'||e.kind==='heritage-bytes')).toEqual([]);
    });
  }

  test('changement de compte pendant projection : ancien fil et fiche non adoptes',async({page})=>{
    srv.holdProjection();
    await page.evaluate(()=>{window.lectureEnVol=supaLoadPosts(0,null,{propagerErreur:true});});
    await expect.poll(()=>srv.projectionHeld).toBe(true);
    await page.evaluate(id=>login(id),srv.B);srv.releaseProjection();
    expect(await page.evaluate(()=>lectureEnVol)).toEqual([]);
    expect(srv.events.filter(e=>e.kind==='heritage-authorize'||e.kind==='heritage-bytes')).toEqual([]);

    await page.evaluate(id=>login(id),srv.A);srv.holdProjection();
    await page.evaluate(id=>{heritageCards();window.ficheEnVol=openPost(id);},srv.heritageIds[0]);
    await expect.poll(()=>srv.projectionHeld).toBe(true);
    await page.evaluate(id=>login(id),srv.B);srv.releaseProjection();
    await page.evaluate(()=>ficheEnVol);
    expect(await page.evaluate(id=>heritageCopies(id),srv.heritageIds[0])).toEqual([null,null,null]);
    expect(await page.locator('#postDetailContent img').count()).toBe(0);
    expect(srv.events.filter(e=>e.kind==='heritage-authorize'||e.kind==='heritage-bytes')).toEqual([]);
  });

  test('fermeture pendant projection : la reponse tardive ne rouvre pas la fiche',async({page})=>{
    srv.holdProjection();
    await page.evaluate(id=>{heritageCards();window.ficheEnVol=openPost(id);},srv.heritageIds[0]);
    await expect.poll(()=>srv.projectionHeld).toBe(true);
    await page.evaluate(()=>closePost());srv.releaseProjection();
    await page.evaluate(()=>ficheEnVol);
    expect(await page.locator('#postDetailPage').evaluate(el=>el.style.display)).toBe('none');
    expect(await page.locator('#postDetailContent img').count()).toBe(0);
    expect(srv.events.filter(e=>e.kind==='heritage-authorize'||e.kind==='heritage-bytes')).toEqual([]);
  });

  test('remplacement de la copie prioritaire pendant projection : aucun ancien src public',async({page})=>{
    srv.holdProjection();
    await page.evaluate(id=>{
      heritageCards();state.seed.posts=[]; // Publication serveur : userPosts est alors la copie prioritaire.
      window.ancienneImage=state.userPosts.find(p=>p.id===id).image;
      window.ficheEnVol=openPost(id);
    },srv.heritageIds[0]);
    await expect.poll(()=>srv.projectionHeld).toBe(true);
    await page.evaluate(id=>{
      const index=state.userPosts.findIndex(p=>p.id===id);
      state.userPosts[index]={...state.userPosts[index],image:ancienneImage};
    },srv.heritageIds[0]);
    srv.releaseProjection();await page.evaluate(()=>ficheEnVol);
    const anciens=await page.locator('#postDetailContent img').evaluateAll(images=>images.filter(image=>{
      const src=image.getAttribute('src')||'';
      return src.includes('/storage/v1/object/public/content/')||src.includes('/media/content/');
    }).length);
    expect(anciens).toBe(0);
    expect(sorties).toBe(0);
  });
});
