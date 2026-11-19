// Lecture critique bornée, sans GET média. URL/UID/clés/JSON restent en RAM.
// Le reçu n'autorise aucune mutation et ne constitue pas un inventaire de tous les textes.
// Risque critique ; implémentation Codex ; revues Root + distincte requises avant 1 appel.
// Pilotage : reçu local filtré seulement, aucune télémétrie ni action automatique.
// Provenance : socle-production-2026-11-06.sql + usages app02/04/06/07/08 main948.
// Passio JSON : photoUrl/coverUrl ; overlays : type gif/url ; shared TEXT : media,
// kind event/coverUrl ; candidat969 passio_media.poster seulement sous ses gardes.
// PUBLIC_OWNER décrit un usage déclaré lié à un propriétaire existant, pas son
// consentement ni la provenance d'upload. Aucun déplacement n'est permis par cette classe.
import {createHash} from 'node:crypto';

const REF='njkiyoklssvefstljemx',SITE='passio-app.netlify.app';
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const PRIVE=/^(?:https:\/\/media[.]passio[.]invalid|https:\/\/passio-app[.]netlify[.]app)?\/private-media\/(posts|stories)\/([A-Za-z0-9_-]{1,120})\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\/(original|v720|poster)$/;
const MAX_ROWS={objects:256,posts:1024,stories:1024,profiles:1024,events:1024};
const CLASSES=['PERSONNEL','PUBLIC_OWNER','MIXTE_RETENU','PASSIO_INDETERMINE','INDETERMINE'];
const sha=x=>createHash('sha256').update(x).digest('hex');
const definitions={
 objects:{table:'storage.objects',filter:" WHERE bucket_id OPERATOR(pg_catalog.=) 'content'",cols:[['id',2950],['bucket_id',25],['name',25],['version',25],['owner',2950],['owner_id',25],['metadata',3802]],
  projection:"'id',s.id::pg_catalog.text,'bucket',s.bucket_id,'name',s.name,'version',s.version,'owner',s.owner::pg_catalog.text,'owner_id',s.owner_id,'auth_presente',EXISTS(SELECT 1 FROM ONLY auth.users u WHERE u.id OPERATOR(pg_catalog.=) s.owner),'mime',s.metadata OPERATOR(pg_catalog.->>) 'mimetype','size',s.metadata OPERATOR(pg_catalog.->>) 'size','etag',s.metadata OPERATOR(pg_catalog.->>) 'eTag'"},
 posts:{table:'public.posts',cols:[['id',25],['author_id',25],['media_url',25],['shared_from_post_id',25],['shared_data',25],['overlays',3802]],
  projection:"'id',s.id,'owner',s.author_id,'media',s.media_url,'shared_from',s.shared_from_post_id,'shared',s.shared_data,'overlays',s.overlays"},
 stories:{table:'public.stories',cols:[['id',25],['author_id',25],['media_url',25],['media_type',25],['overlays',3802]],
  projection:"'id',s.id,'owner',s.author_id,'media',s.media_url,'media_type',s.media_type,'overlays',s.overlays"},
 profiles:{table:'public.profiles',cols:[['id',25],['avatar_url',25],['cover_url',25],['passions',3802]],
  projection:"'id',s.id,'avatar',s.avatar_url,'cover',s.cover_url,'passions',s.passions"},
 events:{table:'public.events',cols:[['id',25],['author_id',25],['organizer_id',25],['co_organizers',3802],['cover_url',25]],
  projection:"'id',s.id,'owner',s.author_id,'organizer',s.organizer_id,'coorganizers',s.co_organizers,'cover',s.cover_url"},
};
const relations=[...Object.values(definitions).map(d=>d.table),'auth.users'];
const valeurs=[...Object.values(definitions).flatMap(d=>d.cols.map(([c,t])=>`('${d.table}','${c}',${t})`)),"('auth.users','id',2950)"].join(',');
export const SQL=`WITH gardes AS (SELECT
 pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.=) 'on' AS lecture_seule,
 (SELECT rolsuper OR rolbypassrls FROM pg_catalog.pg_roles WHERE rolname OPERATOR(pg_catalog.=) current_user) AS role_bypass,
 NOT EXISTS(SELECT 1 FROM (VALUES ${relations.map(t=>`('${t}')`).join(',')}) v(nom)
   WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) pg_catalog.to_regclass(v.nom)
     AND c.relkind OPERATOR(pg_catalog.=) 'r' AND NOT c.relispartition AND NOT c.relhassubclass)) AS tables_ordinaires,
 NOT EXISTS(SELECT 1 FROM (VALUES ${valeurs}) v(tableau,colonne,typ)
   WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid OPERATOR(pg_catalog.=) pg_catalog.to_regclass(v.tableau)
     AND a.attname OPERATOR(pg_catalog.=) v.colonne AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped AND a.atttypid OPERATOR(pg_catalog.=) v.typ::pg_catalog.oid)) AS colonnes_builtin
), comptes AS MATERIALIZED (SELECT ${Object.entries(definitions).map(([k,d])=>`(SELECT pg_catalog.count(*) FROM ONLY ${d.table}${d.filter||''}) AS ${k}`).join(',')})
SELECT pg_catalog.jsonb_build_object('lecture_seule',g.lecture_seule,'role_bypass',g.role_bypass,
 'tables_ordinaires',g.tables_ordinaires,'colonnes_builtin',g.colonnes_builtin,
 'timeout_ms',(SELECT setting::pg_catalog.int8 FROM pg_catalog.pg_settings WHERE name OPERATOR(pg_catalog.=) 'statement_timeout'),
 'tables',CASE WHEN g.lecture_seule AND g.role_bypass AND g.tables_ordinaires AND g.colonnes_builtin THEN
 (SELECT pg_catalog.jsonb_build_object(${Object.entries(definitions).map(([k,d])=>`'${k}',pg_catalog.jsonb_build_object('count',c.${k},'rows',CASE WHEN c.${k} OPERATOR(pg_catalog.<=) ${MAX_ROWS[k]} THEN
   (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(${d.projection}) ORDER BY s.id),'[]'::pg_catalog.jsonb)
    FROM ONLY ${d.table} s${d.filter||''}) ELSE NULL END)`).join(',')}) FROM comptes c)
 ELSE NULL END) AS observation FROM gardes g`;

function erreur(code='FORMAT'){return Error(code);}
function exact(v,cles){if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).sort().join('|')!==[...cles].sort().join('|'))throw erreur();}
function texte(v,max=8192,nullable=true){if(v===null&&nullable)return;if(typeof v!=='string'||Buffer.byteLength(v)>max)throw erreur();}
function nombre(v){if(!Number.isSafeInteger(v)||v<0)throw erreur();}
function identite(v){texte(v,256,false);if(!v)throw erreur();}
function formeJSON(v,depth=0,etat={n:0}){
 if(++etat.n>65536||depth>12)throw erreur('JSON_BORNE');
 if(typeof v==='string'){texte(v,131072,false);return;}
 if(v===null||typeof v==='boolean'||typeof v==='number')return;
 if(typeof v!=='object')throw erreur();
 if(Array.isArray(v)){if(v.length>1024)throw erreur('JSON_BORNE');for(const x of v)formeJSON(x,depth+1,etat);}
 else {const ks=Object.keys(v);if(ks.length>128)throw erreur('JSON_BORNE');for(const k of ks){texte(k,256,false);formeJSON(v[k],depth+1,etat);}}
}

// Analyse le RAW avant tout décodage. Aucun new URL susceptible de masquer '..'.
export function reference(v){
 if(v===null||v==='')return {type:'ABSENTE'};
 if(typeof v!=='string'||Buffer.byteLength(v)>8192||/[\s\x00-\x1f\x7f\\]/u.test(v))return {type:'AMBIGUE'};
 if(PRIVE.test(v))return {type:'LOGIQUE_PRIVEE'};
 let brut=v,site=false;
 if(v.startsWith('/media/content/'))site=true;
 else {
  const m=/^(https?):\/\/([^/?#]*)([^?#]*)(?:\?[^#]*)?(?:#.*)?$/i.exec(v);
  if(!m||!m[2]||!/^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(m[2]))return {type:'AMBIGUE'};
  const a=m[2].toLowerCase(),h=a.replace(/:[0-9]+$/,''),port=a.slice(h.length);
  if(h.length>253||!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(h)||h.includes('xn--')||(port&&Number(port.slice(1))>65535))return {type:'AMBIGUE'};
  const projet=h===REF+'.supabase.co';site=h===SITE;
  if(!projet&&!site){if(/supabase[.]co|passio-app[.]netlify[.]app|media[.]passio[.]invalid/.test(h))return {type:'AMBIGUE'};return {type:'TIERS'};}
  if(m[1].toLowerCase()!=='https'||port&&port!==':443')return {type:'AMBIGUE'};brut=m[3];
 }
 brut=brut.split('?')[0].split('#')[0];
 const prefixe=site?'/media/content/':/^\/storage\/v1\/(?:object\/(?:public|sign|authenticated)|render\/image\/public)\/content\//.exec(brut)?.[0];
 if(!prefixe||!brut.startsWith(prefixe))return {type:'AMBIGUE'};
 const raw=brut.slice(prefixe.length);
 if(!raw||raw.startsWith('/')||raw.endsWith('/')||raw.includes('//')||raw.split('/').some(x=>x==='.'||x==='..')||/%(?:2f|5c|2e|25|00|0[1-9a-f]|1[0-9a-f]|7f)/i.test(raw))return {type:'AMBIGUE'};
 let key;try{key=decodeURIComponent(raw);}catch{return {type:'AMBIGUE'};}
 if(/[\x00-\x1f\x7f\\]/.test(key)||key.split('/').some(x=>!x||x==='.'||x==='..'))return {type:'AMBIGUE'};
 return {type:'CONTENT',key};
}

export function empreinteObjet(o){
 // Ni last_accessed_at, ni xmin : une lecture ne doit pas changer cette clé.
 return sha(JSON.stringify(['content-reference/1',o.id,o.bucket,o.name,o.version,o.owner,o.owner_id,o.mime,o.size,o.etag]));
}

export function analyser(payload){
 exact(payload,['lecture_seule','role_bypass','tables_ordinaires','colonnes_builtin','timeout_ms','tables']);
 for(const k of ['lecture_seule','role_bypass','tables_ordinaires','colonnes_builtin'])if(payload[k]!==true)throw erreur('GARDE');
 nombre(payload.timeout_ms);if(payload.timeout_ms<1||payload.timeout_ms>120000)throw erreur('GARDE');exact(payload.tables,Object.keys(definitions));
 const data={},rows={};
 for(const [k,d]of Object.entries(definitions)){
  const x=payload.tables[k];exact(x,['count','rows']);nombre(x.count);
  if(x.count>MAX_ROWS[k]||!Array.isArray(x.rows)||x.rows.length!==x.count)throw erreur('ROWS_BORNE');
  data[k]=x.rows;rows[k]=x.count;
 }
 const reasons={},refs={ABSENTE:0,CONTENT:0,TIERS:0,LOGIQUE_PRIVEE:0,AMBIGUE:0,SANS_OBJET:0},contextes=[];
 let coverage=true;
 const inconnu=code=>{coverage=false;reasons[code]=(reasons[code]||0)+1;};
 const maps={};
 for(const k of ['posts','stories','profiles','events']){
  maps[k]=new Map();for(const row of data[k]){identite(row.id);if(maps[k].has(row.id))throw erreur();maps[k].set(row.id,row);}
 }
 const objects=new Map(),ids=new Set();
 for(const o of data.objects){
  exact(o,['id','bucket','name','version','owner','owner_id','auth_presente','mime','size','etag']);
  if(!UUID.test(o.id)||o.bucket!=='content'||typeof o.auth_presente!=='boolean')throw erreur();texte(o.name,8192,false);if(!o.name||objects.has(o.name)||ids.has(o.id))throw erreur();ids.add(o.id);
  for(const k of ['version','owner','owner_id','mime','size','etag'])texte(o[k],k==='owner_id'?256:1024);
  const complet=typeof o.version==='string'&&o.version.length>0&&typeof o.mime==='string'&&o.mime.length>0&&typeof o.size==='string'&&/^[0-9]{1,12}$/.test(o.size);
  if(!complet)inconnu('PHYSIQUE_INCOMPLET');
  objects.set(o.name,{o,fp:empreinteObjet(o),complet,personnel:0,publique:0,passio:0,invalide:0});
 }
 const ownerValide=(x,owners)=>UUID.test(x.o.owner||'')&&x.o.owner===x.o.owner_id&&x.o.auth_presente&&maps.profiles.has(x.o.owner)&&owners.includes(x.o.owner);
 function ajouter(v,usage,owners,contexte){
  const p=reference(v);refs[p.type]++;contextes.push(sha(JSON.stringify([contexte,usage,[...new Set(owners)].sort(),v])));
  if(p.type==='AMBIGUE'){inconnu('REFERENCE_AMBIGUE');return;}
  if(p.type!=='CONTENT')return;
  const x=objects.get(p.key);if(!x){refs.SANS_OBJET++;inconnu('REFERENCE_SANS_OBJET');return;}
  if(usage==='PERSONNEL')x.personnel++;
  else if(usage==='PASSIO')x.passio++;
  else if(ownerValide(x,owners))x.publique++;
  else {x.invalide++;inconnu('LIEN_OWNER_NON_ETABLI');}
 }
 function overlays(v,owner,contexte){
  if(v===null)return;
  if(!Array.isArray(v)||v.length>128){inconnu('OVERLAYS_INDETERMINES');return;}
  try{formeJSON(v);}catch{inconnu('OVERLAYS_INDETERMINES');return;}
  for(let i=0;i<v.length;i++){const e=v[i];if(!e||typeof e!=='object'||Array.isArray(e)){inconnu('OVERLAYS_INDETERMINES');continue;}if(e.type==='gif')ajouter(Object.hasOwn(e,'url')?e.url:undefined,'PERSONNEL',[owner],contexte+':'+i);}
 }
 for(const p of data.posts){
  exact(p,['id','owner','media','shared_from','shared','overlays']);texte(p.owner,256);texte(p.shared_from,256);texte(p.shared,131072);
  ajouter(p.media,'PERSONNEL',[p.owner],'POST:'+p.id);overlays(p.overlays,p.owner,'POST_OVERLAY:'+p.id);
  if(p.shared!==null&&p.shared!==''){
   let d;try{d=JSON.parse(p.shared);formeJSON(d);}catch{inconnu('SHARED_DATA_INDETERMINE');continue;}
   if(d===null)continue;
   if(typeof d!=='object'||Array.isArray(d)){inconnu('SHARED_DATA_INDETERMINE');continue;}
   if(Object.hasOwn(d,'media')){const original=maps.posts.get(p.shared_from);ajouter(d.media,'PERSONNEL',[original?.owner??null],'PARTAGE:'+p.id);}
   if(d.kind==='event'&&Object.hasOwn(d,'coverUrl')){const ev=maps.events.get(d.id);ajouter(d.coverUrl,'PERSONNEL',[ev?.owner??null,ev?.organizer??null],'PARTAGE_EVENT:'+p.id);}
   if(d.passio_media!==undefined){
    const q=d.passio_media,r=typeof p.media==='string'?PRIVE.exec(p.media):null;
    if(!q||typeof q!=='object'||Array.isArray(q)||q.protocol!==1||!['photo','video','audio'].includes(q.type)||!r||r[1]!=='posts'||r[2]!==p.id)inconnu('PRESENTATION_INDETERMINEE');
    else if(q.poster!==null&&q.poster!==undefined){const s=typeof q.poster==='string'?PRIVE.exec(q.poster):null;
     if(!s||s[1]!==r[1]||s[2]!==r[2]||s[3]!==r[3]||s[4]!=='poster')inconnu('PRESENTATION_INDETERMINEE');
     else ajouter(q.poster,'PERSONNEL',[p.owner],'POSTER_CANDIDAT969:'+p.id);
    }
   }
  }
 }
 for(const s of data.stories){exact(s,['id','owner','media','media_type','overlays']);texte(s.owner,256);texte(s.media_type,64);ajouter(s.media,'PERSONNEL',[s.owner],'STORY:'+s.id);overlays(s.overlays,s.owner,'STORY_OVERLAY:'+s.id);}
 for(const p of data.profiles){
  exact(p,['id','avatar','cover','passions']);ajouter(p.avatar,'PUBLIC',[p.id],'AVATAR:'+p.id);ajouter(p.cover,'PUBLIC',[p.id],'COUVERTURE:'+p.id);
  if(p.passions===null)continue;
  if(!Array.isArray(p.passions)||p.passions.length>128){inconnu('PASSIONS_INDETERMINEES');continue;}
  try{formeJSON(p.passions);}catch{inconnu('PASSIONS_INDETERMINEES');continue;}
  for(let i=0;i<p.passions.length;i++){const q=p.passions[i];if(!q||typeof q!=='object'||Array.isArray(q)){inconnu('PASSIONS_INDETERMINEES');continue;}
   for(const k of ['photoUrl','coverUrl'])if(Object.hasOwn(q,k))ajouter(q[k],'PASSIO',[p.id],'PASSIO:'+p.id+':'+i+':'+k);
   if(Object.hasOwn(q,'photo')||Object.hasOwn(q,'coverPhoto'))inconnu('PASSIO_ANCIENNE_FORME');
  }
 }
 for(const e of data.events){
  exact(e,['id','owner','organizer','coorganizers','cover']);texte(e.owner,256);texte(e.organizer,256);
  const owners=[e.owner,e.organizer];
  if(e.coorganizers!==null){if(!Array.isArray(e.coorganizers)||e.coorganizers.length>128||e.coorganizers.some(x=>typeof x!=='string'||Buffer.byteLength(x)>256))inconnu('COORGANISATEURS_INDETERMINES');else owners.push(...e.coorganizers);}
  ajouter(e.cover,'PUBLIC',owners,'ACTIVITE:'+e.id);
 }
 const classes=Object.fromEntries(CLASSES.map(k=>[k,0]));
 const sorties=[...objects.values()].map(x=>{
  let classe=x.personnel?(x.publique?'MIXTE_RETENU':'PERSONNEL'):x.publique&&x.passio?'MIXTE_RETENU':x.passio?'PASSIO_INDETERMINE':coverage&&x.complet&&x.publique&&!x.invalide?'PUBLIC_OWNER':'INDETERMINE';
  classes[classe]++;
  return {empreinte:x.fp,classe,usages:{personnel:x.personnel,public_owner:x.publique,passio:x.passio,owner_non_etabli:x.invalide},sans_usage_dans_perimetre:!(x.personnel+x.publique+x.passio+x.invalide)};
 }).sort((a,b)=>a.empreinte.localeCompare(b.empreinte));
 return {format:'passio-references-content-analyse/1',couverture_liste_fermee:coverage,lignes:rows,objets:sorties.length,classes,references:refs,inconnus:reasons,
  empreinte_contexte:sha(JSON.stringify(contextes.sort())),objets_classes:sorties,
  usages_personnels_independants_visibilite:true,passions_personnalisees_public_non_etabli:true,
  usage_public_declare_sans_preuve_consentement:true,
  hors_perimetre:['AUTRES_TEXTES_LIBRES','AUTRES_CHAMPS_JSON','USER_STATE_LOCAL','COPIES_HORS_CONTENT','ILLUSTRATIONS_CATALOGUE'],
  empreinte_octets_verifiee:false,autorisation_mutation:false};
}

