import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url),R=require('../../scripts/restaurer-donnees.js');
const {insererGrandObjet,nettoyerGrandObjet}=R._phases;
// Double du seul transport HTTP. L'intégrité et les contraintes SQL sont
// également exercées par reprise-medias-runner.mjs sur PostgreSQL natif.
function monde(mode='normal') {
  const journal=mkdtempSync(join(tmpdir(),'reprise-lo-'));
  const ctx={ref:'dddddddddddddddddddd',jeton:'sbp_synthetic',cle:'NE_JAMAIS_UTILISER',man:{tables:{posts:{}}},journalGrandsObjets:journal};
  const etat={objet:null,creations:0,fragments:0,corps:[],sql:[],ligne:null,nettoyages:0};
  const response=x=>new Response(JSON.stringify(x),{status:200});
  const fetch=async(url,init)=>{
    assert.ok(String(url).endsWith('/database/query'),'aucun PostgREST');
    assert.equal(init.headers.Authorization,'Bearer sbp_synthetic');
    assert.ok(init.signal instanceof AbortSignal);
    const q=JSON.parse(init.body).query;etat.corps.push(Buffer.byteLength(init.body));etat.sql.push(q);
    assert.doesNotMatch(q,/set_config\('request\.jwt|set (?:local )?request\.jwt|lo_import/i);
    if(q.includes('perform lo_create(')) {
      etat.creations++;etat.objet={oid:Number(q.match(/lo_create\((\d+)::oid/)[1]),lie:true,prive:true};
      if(mode==='creation-ambigue')throw new Error('réponse perdue');return response([{passio_lo:{oid:etat.objet.oid}}]);
    }
    if(q.includes("'prive'"))return response(etat.objet?[{passio_lo:etat.objet}]:[]);
    if(q.includes('perform lo_put(')) {
      etat.fragments++;
      const [,offset,hex]=q.match(/lo_put\(\d+::oid,(\d+),decode\('([0-9a-f]+)'/);
      const fragment=Buffer.from(hex,'hex');
      assert.ok(fragment.length<=R.FRAGMENT_OCTETS);
      etat.ligne=Buffer.concat([etat.ligne||Buffer.alloc(0),fragment]);
      assert.equal(Number(offset),etat.ligne.length-fragment.length);
      if(mode==='fragment-ambigu')throw new Error('réponse perdue');return response([]);
    }
    if(q.includes("json_build_object('ok'"))return response([{passio_lo:{ok:true}}]);
    if(q.includes('insert into public.')) {
      assert.match(q,/begin;[\s\S]*disable trigger user;[\s\S]*insert into[\s\S]*enable trigger user;[\s\S]*lo_unlink[\s\S]*commit;/);
      assert.match(q,/octet_length\(lo_get/);assert.match(q,/encode\(sha256\(lo_get/);
      if(mode==='insertion-refusee')return new Response('{}',{status:400});
      etat.objet=null;return response([{passio_lo:{supprime:true}}]);
    }
    if(q.includes('perform lo_unlink(')) {
      etat.nettoyages++;
      if(mode==='nettoyage-refuse')return new Response('{}',{status:403});
      etat.objet=null;
      if(mode==='nettoyage-ambigu')throw new Error('réponse perdue');return response([]);
    }
    throw new Error('requête inattendue');
  };
  return {ctx,etat,fetch,dispose:()=>rmSync(journal,{recursive:true,force:true})};
}
async function avec(m,fn) {const vrai=globalThis.fetch;globalThis.fetch=m.fetch;try{return await fn();}finally{globalThis.fetch=vrai;m.dispose();}}
const ligne=()=>JSON.stringify({id:'synthetic',overlays:{fixture:'é'.repeat(400000)},rid:9007199254740991}).replace('9007199254740991','2906581903110193585');

for(const mode of ['normal','creation-ambigue','fragment-ambigu'])test('REPRISE-GO : SQL fragmenté exact et borné, '+mode,async()=>{
  const m=monde(mode),raw=ligne();
  await avec(m,async()=>{
    await insererGrandObjet(m.ctx,'posts',['id','overlays','rid'],raw,['id']);
    assert.equal(m.etat.creations,1,'aucun nouvel OID après réponse ambiguë');
    assert.equal(m.etat.ligne.toString(),'['+raw+']','UTF8 et grand entier intacts');
    assert.ok(m.etat.corps.every(n=>n<=R.LOT_OCTETS));
    assert.equal(m.etat.objet,null);
    const files=readdirSync(m.ctx.journalGrandsObjets);
    assert.equal(files.length,1);
    const journal=JSON.parse(readFileSync(join(m.ctx.journalGrandsObjets,files[0]),'utf8'));
    assert.equal(journal.etape,'nettoye');
    assert.deepEqual(Object.keys(journal).sort(),['version','ref','run','table','oid','octets','sha256','etape'].sort());
    assert.ok(JSON.stringify(journal).length<600,'aucun payload dans le journal');
  });
});

test('REPRISE-GO : INSERT refusé, LO nettoyé et erreur conservée',async()=>{
  const m=monde('insertion-refusee');await avec(m,async()=>{
    await assert.rejects(insererGrandObjet(m.ctx,'posts',['id'],ligne(),['id']),/LO_HTTP_400/);
    assert.equal(m.etat.objet,null);assert.equal(m.etat.nettoyages,1);
  });
});

test('REPRISE-GO : 429 repris sous le même OID, sans dépasser le budget de durée',async()=>{
  const m=monde(),fetch=m.fetch,temporiser=globalThis.setTimeout,maintenant=Date.now;
  let premier=true,temps=maintenant(),pauses=[];
  m.fetch=async(u,i)=>{if(premier){premier=false;return new Response('{}',{status:429});}return fetch(u,i);};
  globalThis.setTimeout=(fn,ms)=>{pauses.push(ms);temps+=ms;queueMicrotask(fn);return 0;};
  Date.now=()=>temps;
  try {await avec(m,async()=>{
    await insererGrandObjet(m.ctx,'posts',['id'],ligne(),['id']);
    assert.deepEqual(pauses,[30000]);assert.equal(m.etat.creations,1);assert.equal(m.etat.objet,null);
  });}finally{globalThis.setTimeout=temporiser;Date.now=maintenant;}
});

test('REPRISE-GO : nettoyage non prouvé bloque tout nouvel objet et garde le journal exact',async()=>{
  const m=monde('nettoyage-refuse');
  // Refuser la finalisation pour garder un objet à nettoyer.
  const fetch=m.fetch;m.fetch=async(u,i)=>JSON.parse(i.body).query.includes('insert into public.')?new Response('{}',{status:400}):fetch(u,i);
  await avec(m,async()=>{
    await assert.rejects(insererGrandObjet(m.ctx,'posts',['id'],ligne(),['id']),/LO_NETTOYAGE_NON_PROUVE/);
    const file=join(m.ctx.journalGrandsObjets,readdirSync(m.ctx.journalGrandsObjets)[0]);
    assert.equal(JSON.parse(readFileSync(file)).etape,'insertion');
    await assert.rejects(insererGrandObjet(m.ctx,'posts',['id'],ligne(),['id']),/LO_PRECEDENT_NON_NETTOYE/);
    assert.equal(m.etat.creations,1);
    await assert.rejects(nettoyerGrandObjet({...m.ctx,ref:'eeeeeeeeeeeeeeeeeeee'},file),/LO_JOURNAL_INVALIDE/);
  });
});

test('REPRISE-GO : table hors manifeste et ligne33Mio refusées avant réseau',async()=>{
  const m=monde();await avec(m,async()=>{
    await assert.rejects(insererGrandObjet(m.ctx,'autre',['id'],'{}',['id']),/LO_JOURNAL_INVALIDE/);
    await assert.rejects(insererGrandObjet(m.ctx,'posts',['id'],' '.repeat(33*1024*1024),['id']),/LO_LIGNE_SUPERIEURE_32_MIO/);
    assert.equal(m.etat.sql.length,0);
  });
});
