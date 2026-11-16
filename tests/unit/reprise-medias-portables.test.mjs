import {avecCibleFermee} from "./lib/reprise-cible-fermee.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {creerProjection,transformerJson}=require('../../scripts/lib/reprise-medias-portables.js');
const R=require('../../scripts/restaurer-donnees.js');
const {ETAPES}=require('../../scripts/schema-executable.js');
const source='https://ssssssssssssssssssss.supabase.co',cible='https://dddddddddddddddddddd.supabase.co';
const cle='content/photos/u/été image.png',pj='attachments/attachments/conversation/document.pdf';
const pub=source+'/storage/v1/object/public/'+cle.split('/').map(encodeURIComponent).join('/');
const dst=cible+pub.slice(source.length);
const configuration=[{id:'content',name:'content',public:true,file_size_limit:27262976,allowed_mime_types:null},
  {id:'attachments',name:'attachments',public:false,file_size_limit:27262976,allowed_mime_types:null}];
const projection=(options={})=>creerProjection({source,cible,lireIndex:()=>({objets:{[cle]:{},[pj]:{}}}),lireSeaux:()=>({ok:true,seaux:configuration}),...options});
const proj=(table,ligne,p=projection())=>JSON.parse(p.projeterLigne(table,JSON.stringify(ligne)));
const sha=x=>createHash('sha256').update(x).digest('hex');

test('les cinq champs directs et passions sont portables ; textes et tiers demeurent exacts',()=>{
  for(const [table,champ] of [['posts','media_url'],['stories','media_url'],['profiles','avatar_url'],['profiles','cover_url'],['events','cover_url']]) {
    const r=proj(table,{[champ]:pub,content:pub,desc:'texte '+pub,tiers:'https://tiers.invalid/a'});
    assert.equal(r[champ],dst);assert.equal(r.content,pub);assert.equal(r.desc,'texte '+pub);assert.equal(r.tiers,'https://tiers.invalid/a');
  }
  const r=proj('profiles',{passions:[{photoUrl:pub,coverUrl:pub,description:pub}]});
  assert.deepEqual(r.passions,[{photoUrl:dst,coverUrl:dst,description:pub}]);
});
test('partage TEXT JSON et JSONB : champs de présentation seulement, nombres exacts',()=>{
  const partage='{ "media":'+JSON.stringify(pub)+', "coverUrl":'+JSON.stringify(pub)+', "text":'+JSON.stringify(pub)+', "n":2906581903110193585 }';
  const texte='{ "id":"p", "shared_data":'+JSON.stringify(partage)+', "numeric":1e400, "__proto__":{"url":'+JSON.stringify(pub)+'} }';
  const r=projection().projeterLigne('posts',texte);
  assert.ok(r.includes('"numeric":1e400'));assert.ok(r.includes('"__proto__"'));
  const dedans=JSON.parse(r).shared_data;
  assert.ok(dedans.includes('"n":2906581903110193585'));assert.equal(JSON.parse(dedans).media,dst);assert.equal(JSON.parse(dedans).text,pub);
  assert.equal(proj('posts',{shared_data:{media:pub,text:pub}}).shared_data.media,dst);
});
test('les overlays GIF sont typés ; le champ url d’un texte reste intact',()=>{
  for(const table of ['posts','stories']) {
    const r=proj(table,{overlays:[{type:'gif',url:pub},{type:'text',url:pub,text:pub}]});
    assert.equal(r.overlays[0].url,dst);assert.equal(r.overlays[1].url,pub);
  }
});
test('user_state : profils et médias des publications, sans réécrire CDV retiré ou texte',()=>{
  const r=proj('user_state',{data:{user:{general:{photoUrl:pub},profiles:[{photoUrl:pub,coverUrl:pub,passions:[{photoUrl:pub,coverUrl:pub}]}]},
    userPosts:[{image:pub,video:pub,audio:pub,cover:pub,steps:[{photo:pub,video:pub,audio:pub,text:pub}],sharedReelData:{media:pub},overlays:[{type:'gif',url:pub}]}],
    cdv:[{image:pub}],libre:pub}});
  assert.equal(r.data.user.general.photoUrl,dst);assert.equal(r.data.user.profiles[0].photoUrl,dst);assert.equal(r.data.user.profiles[0].passions[0].coverUrl,dst);
  const p=r.data.userPosts[0];for(const k of ['image','video','audio','cover'])assert.equal(p[k],dst);
  assert.deepEqual(p.steps,[{photo:dst,video:dst,audio:dst,text:pub}]);assert.equal(p.sharedReelData.media,dst);assert.equal(p.overlays[0].url,dst);
  assert.equal(r.data.cdv[0].image,pub);assert.equal(r.data.libre,pub);
});
test('pièces jointes : trois formes historiques deviennent authenticated cible sans bearer source',async()=>{
  const code=readFileSync(new URL('../../js/app-02-state-utils.js',import.meta.url),'utf8');
  const extrait=code.slice(code.indexOf('function pieceJointeChemin('),code.indexOf('\nfunction attrMediaSrc('));
  assert.ok(extrait.includes('function urlPieceJointeSignee'));
  let demande;
  const ctx=vm.createContext({Map,Date,Promise,decodeURIComponent,PJ_SIGNATURE_TTL_S:3600,PJ_SIGNATURE_MARGE_S:600,_pjSignees:new Map(),
    supa:{storage:{from:seau=>({createSignedUrl:async chemin=>{demande={seau,chemin};return{data:{signedUrl:cible+'/signature-courante'}};}})}}});
  vm.runInContext(extrait,ctx);
  for(const type of ['media','audio','doc'])for(const mode of ['public','sign','authenticated']) {
    const entree=source+'/storage/v1/object/'+mode+'/'+pj+'?token=PORTEUR_SOURCE&download=ancien';
    const r=proj('conv_messages',{content:JSON.stringify({type,url:entree,text:entree})});
    const contenu=JSON.parse(r.content);assert.equal(contenu.url,cible+'/storage/v1/object/authenticated/'+pj);assert.equal(contenu.text,entree);
    assert.equal(ctx.pieceJointeChemin(contenu.url),pj.slice('attachments/'.length));
    assert.equal(await ctx.urlPieceJointeSignee(contenu.url),cible+'/signature-courante');
    assert.deepEqual(demande,{seau:'attachments',chemin:pj.slice('attachments/'.length)});
  }
});
test('un lecteur src direct ou un seau privé inconnu n’obtient pas de lien public',()=>{
  const prive=source+'/storage/v1/object/sign/'+pj+'?token=secret';
  assert.throws(()=>proj('posts',{media_url:prive}),/LECTEUR_PRIVE_NON_PRIS_EN_CHARGE/);
  assert.throws(()=>proj('conv_messages',{content:JSON.stringify({type:'gif',url:prive})}),/LECTEUR_PRIVE_NON_PRIS_EN_CHARGE/);
  const p=projection({lireSeaux:()=>({ok:true,seaux:[{id:'content',public:false}]})});
  assert.throws(()=>proj('posts',{media_url:pub},p),/LECTEUR_PRIVE_NON_PRIS_EN_CHARGE/);
});
test('les nouvelles références logiques et les enveloppes non actives restent identiques',()=>{
  const logique='https://media.passio.invalid/private-media/posts/p/11111111-1111-4111-8111-111111111111/original';
  for(const champ of ['media_url','shared_data'])assert.equal(proj('posts',{[champ]:logique})[champ],logique);
  for(const content of [pub,'{cassé',JSON.stringify({type:'text',url:pub,text:pub}),JSON.stringify({type:'inconnu',url:pub})])assert.equal(proj('conv_messages',{content}).content,content);
});
test('index et visibilité attestés obligatoires ; aucune source HTTP sollicitée',()=>{
  assert.throws(()=>proj('posts',{media_url:pub},projection({lireIndex:()=>({erreur:'invalide'})})),/INDEX_NON_ATTESTE/);
  assert.throws(()=>proj('posts',{media_url:pub},projection({lireIndex:()=>({objets:{}})})),/OBJET_HORS_INDEX/);
  assert.throws(()=>proj('posts',{media_url:pub},projection({lireSeaux:()=>({ok:false})})),/SEAUX_NON_ATTESTES/);
  assert.throws(()=>proj('posts',{media_url:pub.replace('/public/','/sign/')+'?token=secret'}),/VISIBILITE_INCOHERENTE/);
});
test('chemins ambigus, endpoint interne inconnu, source ou cible mélangée : refus catégoriel sans URL',()=>{
  for(const suffixe of ['/storage/v1/object/public/content/a/../image.png','/storage/v1/object/public/content/%2e%2e/image.png',
    '/storage/v1/object/public/content/a%2fb.png','/storage/v1/object/public/content/a%5cb.png','/storage/v1/object/public/content/a%00.png',
    '/storage/v1/object/public/content/%zz','/rest/v1/profiles','/storage/v1/object/public/content//image.png']) {
    assert.throws(()=>proj('posts',{media_url:source+suffixe}),e=>/^Projection médias : [A-Z_]+$/.test(e.message));
  }
  assert.throws(()=>proj('posts',{media_url:'/storage/v1/object/public/'+cle}),/FORME_RELATIVE_INCONNUE/);
  assert.throws(()=>proj('posts',{media_url:pub},projection({source:undefined})),/SOURCE_INCONNUE/);
  assert.throws(()=>proj('posts',{media_url:pub},projection({cible:source})),/PROJETS_INVALIDES/);
  assert.throws(()=>proj('posts',{media_url:pub},projection({cible:'http://dddddddddddddddddddd.supabase.co'})),/PROJETS_INVALIDES/);
});
test('ancien relais production et render/image : objet indexé public seulement, aucun paramètre conservé',()=>{
  const p=projection({source:'https://njkiyoklssvefstljemx.supabase.co'});
  for(const prefixe of ['', 'https://passio-app.netlify.app']) {
    const url=prefixe+'/media/'+cle.split('/').map(encodeURIComponent).join('/')+'?width=720&quality=80';
    assert.equal(proj('posts',{media_url:url},p).media_url,dst);
    assert.throws(()=>proj('posts',{media_url:url}),/ALIAS_PRODUCTION_AMBIGU/);
  }
  assert.equal(proj('posts',{media_url:pub.replace('/object/','/render/image/')+'?width=720&quality=80'}).media_url,dst);
  const tiers='https://autre.invalid/media/'+cle;assert.equal(proj('posts',{media_url:tiers}).media_url,tiers);
});
test('balayage itératif : profondeur hostile et nombres hors limites ne sont jamais arrondis',()=>{
  const profond='['.repeat(6000)+'2906581903110193585'+']'.repeat(6000);
  const texte='{ "media_url":'+JSON.stringify(pub)+',"arbitraire":'+profond+',"n":1e400 }';
  const attendu=texte.replace(JSON.stringify(pub),JSON.stringify(dst));
  assert.equal(projection().projeterLigne('posts',texte),attendu);
  assert.equal(transformerJson('{"x":"a\\\"b","y":["ok",{"z":"non"}]}',(v,p)=>p.join('.')==='y.0'?'oui':v),'{"x":"a\\\"b","y":["oui",{"z":"non"}]}');
});

function archive() {
  const dossier=mkdtempSync(join(tmpdir(),'passio-reprise-urls-'));
  const media='AAA',md5=createHash('md5').update(media).digest('hex');
  const index=JSON.stringify({format:'passio-index-medias/1',total:1,objets:{[cle]:{taille:3,md5}}});
  const proprietaires=JSON.stringify({format:'passio-proprietaires/1',total:1,objets:{[cle]:{owner:null,owner_id:null}}});
  const ddl='begin;\n'+ETAPES.find(e=>e.titre==='Seaux de stockage').rendu(configuration).join('\n')+'\ncommit;\n';
  const ligne=JSON.stringify({id:'p',media_url:pub,content:pub})+'\n';
  writeFileSync(join(dossier,'posts.ndjson'),ligne);writeFileSync(join(dossier,'schema.sql'),ddl);writeFileSync(join(dossier,'_storage_index.json'),index);
  writeFileSync(join(dossier,'_storage_proprietaires.json'),proprietaires);
  mkdirSync(join(dossier,'_storage','content','photos','u'),{recursive:true});writeFileSync(join(dossier,'_storage',...cle.split('/')),media);
  return {archive:dossier,url:cible,ref:'dddddddddddddddddddd',jeton:'sbp_synthetic',cle:'synthetic',
    man:{projet:source,schema_sha256:sha(ddl),tables:{posts:{exporte:1,tri:'id'}},medias:{fichiers:1,index_sha256:sha(index),proprietaires_sha256:sha(proprietaires),proprietaires_lus:1}},
    _cols:new Map([['posts',['id','media_url','content']]]),_pk:new Map([['posts',['id']]])};
}
test('précontrôle : référence interne hors index bloque avant mutation, sans altérer archive',()=>{
  const ctx=archive();
  try {
    const fichier=join(ctx.archive,'posts.ndjson'),texte=readFileSync(fichier,'utf8');
    writeFileSync(fichier,texte.replace(/été/g,'introuvable'));
    // Le nom est encodé dans l’URL : changer uniquement le chemin du champ actif.
    writeFileSync(fichier,JSON.stringify({id:'p',media_url:pub+'-absent'})+'\n');
    const avant=readFileSync(fichier);const v=R._phases.validerArchive(ctx);
    assert.equal(v.ok,false);assert.equal(v.indetermine,false);assert.ok(v.bloquants.some(x=>x.includes('OBJET_HORS_INDEX')));
    assert.deepEqual(readFileSync(fichier),avant);
  } finally {rmSync(ctx.archive,{recursive:true,force:true});}
});
test('un index ancien sans empreinte manifeste ne permet pas de projeter une référence source',()=>{
  const ctx=archive();delete ctx.man.medias.index_sha256;
  try {
    const v=R._phases.validerArchive(ctx);
    assert.equal(v.ok,false);assert.equal(v.indetermine,false);
    assert.ok(v.bloquants.some(x=>x.includes('INDEX_NON_ATTESTE')));
  } finally {rmSync(ctx.archive,{recursive:true,force:true});}
});
test('vrai chargeur ET verdict attendent les mêmes URL projetées ; source conservée échoue',async()=>{
  const ctx=archive(),fichier=join(ctx.archive,'posts.ndjson'),avant=readFileSync(fichier),vraiFetch=globalThis.fetch;
  let ligneCible={id:'p',media_url:dst,content:pub},inserts=0;
  const json=x=>new Response(JSON.stringify(x),{status:200});
  globalThis.fetch=async(url,init={})=>{
    if(String(url).includes('/rest/v1/posts?'))return json([ligneCible]);
    assert.equal(url,'https://api.supabase.com/v1/projects/dddddddddddddddddddd/database/query');
    const q=JSON.parse(init.body).query;
    if(q.includes('json_populate_recordset')){inserts++;assert.ok(q.includes(dst));assert.ok(q.includes(pub));return json([]);}
    if(q.includes('pg_namespace'))return json([{lecture_seule:true,rencontres:false,budget:false,tables:[]}]);
    if(q.includes('information_schema.tables'))return json([{table_name:'posts'}]);
    if(q.includes('count(*)::int n from public.'))return json([{t:'posts',n:1}]);
    if(q.includes("name as cle"))return json([{cle,owner:null,owner_id:null}]);
    if(q.includes("bucket_id || '/' || name"))return json([{name:cle,taille:'3',etag:createHash('md5').update('AAA').digest('hex')}]);
    if(q.includes('from storage.buckets'))return json(configuration);
    throw new Error('unexpected_query');
  };
  globalThis.fetch=avecCibleFermee(globalThis.fetch);
  try {
    assert.equal(R._phases.validerArchive(ctx).ok,true);
    await R._phases.chargerTable(ctx,'posts',{notes:[],refus:[]});assert.equal(inserts,1);
    assert.equal(await R._phases.verdict(ctx),true);
    ligneCible={...ligneCible,media_url:pub};assert.equal(await R._phases.verdict(ctx),false);
    assert.deepEqual(readFileSync(fichier),avant);
  } finally {globalThis.fetch=vraiFetch;rmSync(ctx.archive,{recursive:true,force:true});}
});
