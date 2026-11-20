import {createHash, randomBytes} from 'node:crypto';

import {APERCU, CIBLE, fixture, publierEtLire} from './parcours.mjs';
import {barriere} from './barriere.mjs';
import {navigateurConfine} from './navigateur.mjs';
import {accepterSuivi} from './suivi.mjs';
import {amorcerPage, demandeCreation, demandeSession, verifierProprieteAuth, verifierSession} from './session-synthetique.mjs';

function exige(test, code) { if (!test) throw new Error(code); }

export function identites(runId) {
  exige(/^[1-9][0-9]{0,18}$/.test(runId),'RUN_INVALIDE');
  const uid = label => {
    const b=createHash('sha256').update('PASSIO74/passio-app:recette-nominale:v1:'+runId+':'+label).digest().subarray(0,16);
    b[6]=(b[6]&15)|64; b[8]=(b[8]&63)|128;
    return b.toString('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  };
  return fixture(uid('run'),uid('proprietaire'),uid('destinataire'));
}
export async function lireCommeDestinataire(page, f, proof) {
  const lu=await page.evaluate(async ({origin,stage,reader,owner,kind,id,ref,sha,size})=>{
    if(location.origin!==origin||window.PASSIO_SUPABASE_CIBLE?.url!==stage||
       SUPABASE_URL!==stage||passioMediaProteges.capture().uid!==reader) return false;
    const {data,error}=await supa.from(kind).select('id,author_id,media_url').eq('id',id).eq('author_id',owner);
    if(error||data?.length!==1||data[0].id!==id||data[0].author_id!==owner||data[0].media_url!==ref)return false;
    const blobUrl=await passioMediaProteges.charger(data[0].media_url,'image',null,null);
    if(typeof blobUrl!=='string'||!blobUrl.startsWith('blob:'+origin+'/'))return false;
    const blob=await (await fetch(blobUrl)).blob();
    if(blob.type!=='image/png'||blob.size!==size)return false;
    const hash=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
    return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('')===sha;
  },{origin:APERCU,stage:CIBLE,reader:f.reader,owner:f.owner,kind:proof.kind,id:proof.id,
    ref:'https://media.passio.invalid'+proof.path,sha:proof.sha,size:proof.bytes});
  exige(lu,'LECTURE_DESTINATAIRE');
}

export async function verifierPages({chromium,artefact,f,sessions,perform,budget}) {
  const garde=barriere(f), contexts=[];
  try {
    for(const id of [f.owner,f.reader]) {
      const session=sessions.get(id);
      const c=await navigateurConfine(chromium,{artifact:artefact,barrier:garde,actor:id,token:session.access_token,budget,perform});
      contexts.push(c);
      await amorcerPage(c.page,session,id,f.run);
      await c.page.goto(APERCU+'/',{waitUntil:'domcontentloaded',timeout:15000});
      await c.page.waitForFunction(uid=>window._supaReal===true&&typeof passioMediaProteges!=='undefined'&&passioMediaProteges.capture().uid===uid,id,{timeout:15000});
    }
    for(const item of f.sources){
      const proof=await publierEtLire(contexts[0].page,f,item);
      await lireCommeDestinataire(contexts[1].page,f,proof);
    }
  } catch (err) {
    const diag=contexts.map(c=>c.premierRefus()).find(Boolean);
    if(diag)console.error(JSON.stringify({route:diag.action,phase:diag.stage,cause:diag.cause,http:diag.http}));
    throw err;
  } finally {
    const closed=await Promise.allSettled(contexts.map(c=>c.close()));
    exige(closed.every(x=>x.status==='fulfilled'),'FERMETURE_NAVIGATEUR');
  }
}

export async function cycle({f,service,artefact,request,cap,attendre,signaler,verifier,budget}) {
  const sessions=new Map(), candidats=[];
  const admin={apikey:service,authorization:'Bearer '+service};
  const ordinary=id=>({apikey:artefact.anon,authorization:'Bearer '+sessions.get(id).access_token});
  const json=async (url,method,headers,body,attendu)=>{
    const h={...headers,'content-type':'application/json'};
    if(url.startsWith(CIBLE+'/rest/v1/')&&method!=='GET')h.prefer=url.startsWith(CIBLE+'/rest/v1/profiles?')?'resolution=merge-duplicates,return=representation':'return=representation';
    const r=await request({url,method,headers:h,body:body===undefined?undefined:Buffer.from(JSON.stringify(body))});
    if(Array.isArray(attendu)) exige(attendu.includes(r.status),'STATUT_PROFIL');
    else exige(r.status===attendu,'STATUT_'+attendu);
    return JSON.parse(r.bytes.toString('utf8'));
  };
  async function connecter(id,password){
    const d=demandeSession(id,password,f.run),session=await json(d.url,d.method,{apikey:artefact.anon},d.body,200);
    verifierSession(session,id,f.run);sessions.set(id,session);
  }
  let principal=false,ferme=false,nettoye=true;
  function absent(r){
    if(r.status!==404)return false;
    const body=JSON.parse(r.bytes);return body.code==='user_not_found'||body.error_code==='user_not_found';
  }
  const ownedUrl=id=>CIBLE+'/auth/v1/admin/users/'+id;
  exige((await cap())===false,'INITIAL_OUVERT');
  try {
    for(const id of [f.owner,f.reader]){
      const password=randomBytes(32).toString('base64url');
      const d=demandeCreation(id,password,f.run);
      // Une observation Auth ciblée distingue une identité déjà présente avant l'intention.
      const avant=await request({url:ownedUrl(id),method:'GET',headers:admin});
      exige(absent(avant),'IDENTITE_OCCUPEE');
      candidats.push({id,password});
      const user=await json(d.url,d.method,admin,d.body,200);
      verifierProprieteAuth(user,id,f.run);
      await connecter(id,password);
      const rows=await json(CIBLE+'/rest/v1/profiles?on_conflict=id&select=id,is_private','POST',ordinary(id),
        {id,username:'qa_media_'+id.replaceAll('-','').slice(0,14),is_private:true},[200,201]);
      exige(rows.length===1&&rows[0].id===id&&rows[0].is_private===true,'PROFIL_PRIVE');
    }
    await accepterSuivi((id,method,url,body,status)=>json(url,method,ordinary(id),body,status),f.owner,f.reader);
    signaler('PRET_OUVERTURE_COCKPIT');
    await attendre(true,cap);
    await verifier(sessions);principal=true;
  } finally {
    signaler('REFERMER_DANS_LE_COCKPIT');
    budget.nettoyage();
    try { await attendre(false,cap);ferme=true; } catch { /* le rangement reste dû */ }
    for(const {id,password} of candidats.reverse()){
      try {
        const present=await request({url:ownedUrl(id),method:'GET',headers:admin});
        if(absent(present))continue;
        exige(present.status===200,'PROPRIETE');verifierProprieteAuth(JSON.parse(present.bytes),id,f.run);
        if(!sessions.has(id)) await connecter(id,password);
        const material=await json(CIBLE+'/functions/v1/delete-account','POST',ordinary(id),{},200);
        exige(material.ok===true&&material.garantie==='barriere'&&material.marqueur==='supprimee','PURGE');
        const after=await request({url:ownedUrl(id),method:'GET',headers:admin});
        exige(absent(after),'AUTH_RESTANTE');
      } catch { nettoye=false; }
    }
    signaler(ferme?'CAPACITES_FERMEES':'FERMETURE_NON_ETABLIE');
    signaler(nettoye?'RANGEMENT_VERIFIE':'RANGEMENT_INCOMPLET');
    exige(nettoye&&ferme,'FIN_INCOMPLETE');
  }
  return principal;
}
