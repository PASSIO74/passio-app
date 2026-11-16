import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url),R=require('../../scripts/restaurer-donnees.js');
const {insererGrandObjet,nettoyerGrandObjet}=R._phases;
// Double du seul transport HTTP. L'intégrité et les contraintes SQL sont
// également exercées par reprise-medias-runner.mjs sur PostgreSQL natif.
function monde(mode='normal') {
  const journal=mkdtempSync(join(tmpdir(),'reprise-lo-'));
  const ctx={ref:'dddddddddddddddddddd',jeton:'sbp_synthetic',cle:'NE_JAMAIS_UTILISER',man:{tables:{posts:{}}},journalGrandsObjets:journal};
  const etat={objet:null,objets:new Map(),creations:0,fragments:0,corps:[],sql:[],ligne:null,nettoyages:0,absences:0};
  const response=x=>new Response(JSON.stringify(x),{status:200});
  const fetch=async(url,init)=>{
    assert.ok(String(url).endsWith('/database/query'),'aucun PostgREST');
    assert.equal(init.headers.Authorization,'Bearer sbp_synthetic');
    assert.ok(init.signal instanceof AbortSignal);
    const q=JSON.parse(init.body).query;etat.corps.push(Buffer.byteLength(init.body));etat.sql.push(q);
    assert.doesNotMatch(q,/set_config\('request\.jwt|set (?:local )?request\.jwt|lo_import/i);
    if(q.includes('perform lo_create(')) {
      etat.creations++;const objet={oid:Number(q.match(/lo_create\((\d+)::oid/)[1]),lie:true,prive:true};
      if(mode==='creation-tardive'&&etat.creations===1){
        etat.completerCreation=()=>{etat.objet=objet;etat.objets.set(objet.oid,objet);};
        throw new Error('création toujours en attente côté serveur');
      }
      etat.objet=objet;etat.objets.set(objet.oid,objet);
      if(mode==='creation-ambigue')throw new Error('réponse perdue');return response([{passio_lo:{oid:etat.objet.oid}}]);
    }
    if(q.includes("'prive'")){
      const objet=etat.objets.get(Number(q.match(/where m\.oid=(\d+)::oid/)[1]));
      if(!objet)etat.absences++;
      return response(objet?[{passio_lo:objet}]:[]);
    }
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
      etat.objets.delete(Number(q.match(/lo_unlink\((\d+)::oid/)[1]));etat.objet=null;return response([{passio_lo:{supprime:true}}]);
    }
    if(q.includes('perform lo_unlink(')) {
      etat.nettoyages++;
      if(mode==='nettoyage-refuse')return new Response('{}',{status:403});
      etat.objets.delete(Number(q.match(/lo_unlink\((\d+)::oid/)[1]));etat.objet=null;
      if(mode==='nettoyage-ambigu')throw new Error('réponse perdue');return response([]);
    }
    throw new Error('requête inattendue');
  };
  return {ctx,etat,fetch,dispose:()=>rmSync(journal,{recursive:true,force:true})};
}
async function avec(m,fn) {const vrai=globalThis.fetch;globalThis.fetch=m.fetch;try{return await fn();}finally{globalThis.fetch=vrai;m.dispose();}}
const ligne=()=>JSON.stringify({id:'synthetic',overlays:{fixture:'é'.repeat(400000)},rid:9007199254740991}).replace('9007199254740991','2906581903110193585');

test('P1 REPRISE-LO-01 : deux absences avant une création tardive ne libèrent jamais un nouvel OID',async()=>{
  const m=monde('creation-tardive');await avec(m,async()=>{
    let premierRefuse=false;
    try{await insererGrandObjet(m.ctx,'posts',['id'],ligne(),['id']);}catch{premierRefuse=true;}
    const file=join(m.ctx.journalGrandsObjets,readdirSync(m.ctx.journalGrandsObjets)[0]);
    let absenceRefusee=false;try{await nettoyerGrandObjet(m.ctx,file);}catch{absenceRefusee=true;}
    const journalAvant=JSON.parse(readFileSync(file));
    // Le POST initial aboutit APRÈS les lectures vides et le retour du client.
    m.etat.completerCreation();
    const contexteRedemarre={...m.ctx,_grandObjetActif:false};
    let suivantRefuse=false;
    try{await insererGrandObjet(contexteRedemarre,'posts',['id'],ligne(),['id']);}catch{suivantRefuse=true;}
    const constat={premierRefuse,auMoinsDeuxAbsences:m.etat.absences>=2,absenceRefusee,
      journalNettoye:journalAvant.etape==='nettoye',suivantRefuse,creations:m.etat.creations,
      premierObjetTardifPresent:m.etat.objets.has(journalAvant.oid)};
    assert.deepEqual(constat,{premierRefuse:true,auMoinsDeuxAbsences:true,absenceRefusee:true,
      journalNettoye:false,suivantRefuse:true,creations:1,premierObjetTardifPresent:true});
    assert.equal(m.etat.fragments,0,'aucun import poursuivi après création ambiguë');
    // L'objet maintenant visible peut être supprimé exactement ; le dossier
    // reste indéterminé, aucune quiescence serveur n'est inventée par le test.
    await assert.rejects(nettoyerGrandObjet(contexteRedemarre,file),/LO_CREATION_QUIESCENCE_NON_PROUVEE/);
    assert.equal(m.etat.objets.size,0);
    assert.equal(JSON.parse(readFileSync(file)).etape,'creation_ambigue');
    await assert.rejects(nettoyerGrandObjet(contexteRedemarre,file),/LO_CREATION_QUIESCENCE_NON_PROUVEE/);
    await assert.rejects(insererGrandObjet({...m.ctx,_grandObjetActif:false},'posts',['id'],ligne(),['id']),/LO_JOURNAL_EN_ATTENTE_NETTOYAGE/);
    assert.equal(m.etat.creations,1);
  });
});

for(const mode of ['normal','fragment-ambigu'])test('REPRISE-GO : SQL fragmenté exact et borné, '+mode,async()=>{
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

test('P1 REPRISE-LO-01 : réponse de création perdue après commit, nettoyage exact mais dossier toujours bloquant',async()=>{
  const m=monde('creation-ambigue');await avec(m,async()=>{
    await assert.rejects(insererGrandObjet(m.ctx,'posts',['id'],ligne(),['id']),/LO_CREATION_AMBIGUE_JOURNAL_/);
    assert.equal(m.etat.creations,1);assert.equal(m.etat.fragments,0);assert.equal(m.etat.objets.size,0);
    const file=join(m.ctx.journalGrandsObjets,readdirSync(m.ctx.journalGrandsObjets)[0]);
    assert.equal(JSON.parse(readFileSync(file)).etape,'creation_ambigue');
    await assert.rejects(insererGrandObjet({...m.ctx,_grandObjetActif:false},'posts',['id'],ligne(),['id']),/LO_JOURNAL_EN_ATTENTE_NETTOYAGE/);
    assert.equal(m.etat.creations,1);
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
  m.fetch=async(u,i)=>{if(premier&&JSON.parse(i.body).query.includes('perform lo_put(')){premier=false;return new Response('{}',{status:429});}return fetch(u,i);};
  globalThis.setTimeout=(fn,ms)=>{pauses.push(ms);temps+=ms;queueMicrotask(fn);return 0;};
  Date.now=()=>temps;
  try {await avec(m,async()=>{
    await insererGrandObjet(m.ctx,'posts',['id'],ligne(),['id']);
    assert.deepEqual(pauses,[30000]);assert.equal(m.etat.creations,1);assert.equal(m.etat.objet,null);
  });}finally{globalThis.setTimeout=temporiser;Date.now=maintenant;}
});

test('P1 REPRISE-LO-01 : création429 envoyée une fois, journal durable et aucun retry automatique',async()=>{
  const m=monde(),fetch=m.fetch,temporiser=globalThis.setTimeout;
  let envois=0,pauses=0;
  m.fetch=async(u,i)=>{if(JSON.parse(i.body).query.includes('perform lo_create(')){envois++;return new Response('{}',{status:429});}return fetch(u,i);};
  globalThis.setTimeout=()=>{pauses++;throw new Error('aucune pause de reprise sur création');};
  try {await avec(m,async()=>{
    await assert.rejects(insererGrandObjet(m.ctx,'posts',['id'],ligne(),['id']),/LO_CREATION_AMBIGUE_JOURNAL_/);
    assert.equal(envois,1);assert.equal(pauses,0);assert.equal(m.etat.fragments,0);
    const file=join(m.ctx.journalGrandsObjets,readdirSync(m.ctx.journalGrandsObjets)[0]);
    assert.equal(JSON.parse(readFileSync(file)).etape,'creation_ambigue');
  });}finally{globalThis.setTimeout=temporiser;}
});

test('P1 REPRISE-LO-01 : bilan indéterminé et arrêt avant le paquet ou la phase d’écriture suivante',async()=>{
  const m=monde('creation-tardive');await avec(m,async()=>{
    m.ctx.archive=m.ctx.journalGrandsObjets;
    m.ctx._cols=new Map([['posts',['id','overlays','rid']]]);m.ctx._pk=new Map([['posts',['id']]]);
    writeFileSync(join(m.ctx.archive,'posts.ndjson'),ligne()+'\n'+JSON.stringify({id:'packet_suivant'})+'\n');
    const bilan={refus:[],notes:[]};
    await assert.rejects(R._phases.chargerTable(m.ctx,'posts',bilan),/LO_CREATION_AMBIGUE_JOURNAL_/);
    assert.equal(bilan.refus.length,1);assert.equal(bilan.phases.tables.ok,false);assert.equal(bilan.phases.tables.indetermine,true);
    assert.equal(m.etat.creations,1);assert.equal(m.etat.fragments,0);
    assert.ok(!m.etat.sql.some(q=>/insert into public\./i.test(q)));
    const fresh={...m.ctx,_grandObjetActif:false};
    assert.throws(()=>R._phases.exigerAucunJournalGrandObjetEnAttente(fresh),/LO_JOURNAL_EN_ATTENTE_NETTOYAGE/);
    assert.equal(fresh._grandObjetActif,true);
    writeFileSync(join(m.ctx.archive,'posts.ndjson'),JSON.stringify({id:'petite_ligne'})+'\n');
    const bilanSuivant={refus:[],notes:[]},appelsAvant=m.etat.sql.length;
    await assert.rejects(R._phases.chargerTable({...m.ctx,_grandObjetActif:false},'posts',bilanSuivant),/LO_JOURNAL_EN_ATTENTE_NETTOYAGE/);
    assert.equal(m.etat.sql.length,appelsAvant,'pas même une écriture SQL du petit paquet suivant');
    assert.equal(bilanSuivant.phases.tables.ok,false);assert.equal(bilanSuivant.phases.tables.indetermine,true);
  });
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
