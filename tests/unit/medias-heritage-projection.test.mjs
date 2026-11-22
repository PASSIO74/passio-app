import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHash} from 'node:crypto';
const source=fs.readFileSync(new URL('../../js/app-02-state-utils.js',import.meta.url),'utf8');
const extrait=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
const namespace=extrait('// PRIVATE MEDIA CLIENT v1','// END PRIVATE MEDIA CLIENT v1');
const projection=extrait('// HERITAGE MEDIA READ v1','// END HERITAGE MEDIA READ v1');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',ASSET='00000000-0000-4000-8000-000000000100';
const ancien='https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/'+A+'/synth.png';
const reference='https://media.passio.invalid/private-media/posts/synth/'+ASSET+'/original';
const sha=v=>createHash('sha256').update(v).digest('hex');
function fixture(rpc){const calls=[],diagnostics=[];
 const s={URL,Blob,AbortController,ReadableStream,TextEncoder,Uint8Array,crypto:webcrypto,setTimeout,clearTimeout,location:{origin:'https://app.invalid'},MY_UID:A,_supaReal:true,document:{querySelectorAll:()=>[]},navigator:{},diagLog:(...e)=>diagnostics.push(e),
  supa:{auth:{getSession:async()=>({data:{session:{user:{id:s.MY_UID},access_token:'synthetic.current.signature'}}})},rpc(n,p){calls.push({n,p});return {abortSignal:signal=>rpc?rpc(n,p,signal):Promise.resolve({data:[{post_id:'synth',reference}],error:null})};}}};
 s.window=s;vm.runInNewContext(namespace+'\n'+projection,s);return {s,api:s.passioMediaProteges,calls,diagnostics};
}
const tour=()=>new Promise(r=>setTimeout(r,0));
test('lecture réelle : SHA de la référence, URI canonique et présentation photo RAM',async()=>{
 const f=fixture(),row={id:'synth',media_url:ancien,shared_data:'{"autre":"conservé"}',author_id:A};const attente=f.api.projeterHeritageLignes([row]);assert.equal(row.media_url,null);await attente;
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].n,'media_projeter_heritage');assert.equal(f.calls[0].p.p_references[0].reference_sha256,sha(ancien));assert.equal(row.media_url,reference);assert.equal(row.shared_data.autre,'conservé');assert.deepEqual(JSON.parse(JSON.stringify(row.shared_data.passio_media)),{protocol:1,type:'photo',poster:null});assert.equal(row.author_id,A);
});
test('aucune requête supplémentaire sans candidat, ou pour URI déjà protégée',async()=>{
 const f=fixture(),rows=[{id:'texte',media_url:null},{id:'public',media_url:'/media/content/avatars/u/a.png'},{id:'synth',media_url:reference}];await f.api.projeterHeritageLignes(rows);assert.equal(f.calls.length,0);assert.equal(rows[1].media_url,'/media/content/avatars/u/a.png');
});
test('échec, absence et réponse homonyme : aucune ancienne URL publique en repli',async()=>{
 for(const rep of [{error:{message:'texte non conservé'},data:null},{data:[],error:null},{data:[{post_id:'autre',reference}],error:null},{data:[{post_id:'synth',reference:ancien}],error:null}]){
  const f=fixture(async()=>rep),r={id:'synth',media_url:ancien};await f.api.projeterHeritageLignes([r]);assert.equal(r.media_url,null);assert.deepEqual(f.diagnostics,[['heritage_projection','heritage_projection_refusee']]);assert.equal(f.api.etatHeritage().refuses,1);
 }
});
test('ambiguïtés PASSIO fermées avant les exemptions de chemins publics',async()=>{
 for(const url of ['/media/content/avatars/../photos/u/a.png','/media/content/avatars/%2e%2e/photos/u/a.png','https://NJkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/u/a.png','https://njkiyoklssvefstljemx.supabase.co/storage/v1/render/image/public/content/photos/u/a.png?width=720&quality=75','//passio-app.netlify.app/media/content/photos/u/a.png','./media/content/photos/u/a.png','/x/../media/content/photos/u/a.png','https://passio-app.netlify.app/%2e/media/content/photos/u/a.png']){
  const f=fixture(async()=>({data:[],error:null})),r={id:'synth',media_url:url},p=f.api.projeterHeritageLignes([r]);assert.equal(r.media_url,null);await p;assert.equal(r.media_url,null);
 }
});
test('changement de compte pendant le RPC : signal annulé et aucun locator appliqué',async()=>{
 let release,signal;const f=fixture((n,p,s)=>{signal=s;return new Promise(r=>release=r);}),row={id:'synth',media_url:ancien};const p=f.api.projeterHeritageLignes([row]);while(!release)await tour();f.api.invalider(B);f.s.MY_UID=B;assert.equal(signal.aborted,true);release({data:[{post_id:'synth',reference}],error:null});await p;assert.equal(row.media_url,null);
});
test('les backslashes et espaces ne passent pas avant la garde des routes PASSIO',async()=>{
 for(const url of ['https://njkiyoklssvefstljemx.supabase.co/storage\\v1\\object\\public\\content\\photos/u/a.png','https://passio-app.netlify.app/media\\content\\photos/u/a.png','/media\\content\\photos/u/a.png','https://njkiyoklssvefstljemx.supabase.co/ storage/v1/object/public/content/photos/u/a.png',' https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/u/a.png']){
  const f=fixture(async()=>({data:[],error:null})),r={id:'synth',media_url:url},p=f.api.projeterHeritageLignes([r]);assert.equal(r.media_url,null);await p;assert.equal(r.media_url,null);
 }
});
test('un retour obsolète ne remplace pas la nouvelle image de la même copie',async()=>{
 let release;const f=fixture(()=>new Promise(r=>release=r)),r={id:'synth',image:ancien};const p=f.api.projeterHeritageCartes([r]);while(!release)await tour();r.image='https://tiers.invalid/nouveau.png';release({data:[{post_id:'synth',reference}],error:null});await p;assert.equal(r.image,'https://tiers.invalid/nouveau.png');
});
test('toutes les copies d’une fiche partagent une seule projection bornée',async()=>{
 const f=fixture(),copies=Array.from({length:3},()=>({id:'synth',image:ancien}));await f.api.projeterHeritageCartes(copies);assert.equal(f.calls.length,1);assert.equal(f.calls[0].p.p_references.length,1);for(const p of copies)assert.equal(p.image,reference);
});
