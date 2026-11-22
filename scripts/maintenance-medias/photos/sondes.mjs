import {C,ERREUR400,chemin,sha,stop} from './contrat.mjs';
const LARGEURS=[192,352,360,400,600,700,720,880];
export function sondes(s,variantes=[]){
 const k=chemin(s.name),origine=`https://${C.hote}/storage/v1/object/public/content/${k}`,alias=`https://${C.netlify}/media/content/${k}`,render=`https://${C.hote}/storage/v1/render/image/public/content/${k}`;
 const possibles=new Map([[origine,'ORIGINE'],[alias,'ALIAS']]);
 for(const w of LARGEURS){possibles.set(alias+`?width=${w}&quality=75`,'ALIAS');possibles.set(render+`?width=${w}&quality=75`,'TRANSFORMATION');}
 const demandes=[origine,alias,render+'?width=720&quality=75'];
 if(!Array.isArray(variantes)||variantes.length>32)stop('VARIANTES_REFUSEES');
 for(const v of variantes){if(typeof v!=='string'||!possibles.has(v))stop('VARIANTES_REFUSEES');if(!demandes.includes(v))demandes.push(v);}
 const desc=url=>({url,method:'GET',headers:{},anonyme:true,famille:possibles.get(url),empreinte:sha(url)});
 return {demandes:demandes.map(desc),rediriger(current,location){
  if(typeof location!=='string'||location.length>16384||/[\s\x00-\x1f\\]/.test(location))return null;
  const url=location.startsWith('/')&&current.url.startsWith('https://'+C.netlify+'/')?'https://'+C.netlify+location:location;
  return possibles.has(url)?desc(url):null;
 }};
}
export async function observerChaine({descripteur,matrice,requete,body400Connus=[ERREUR400.sha256],body403Connus=[]}){
 let d=descripteur;const vus=new Set();
 for(let saut=0;saut<3;saut++){
  if(vus.has(d.url))return {categorie:'REDIRECTION_REFUSEE',absent:false};vus.add(d.url);
  const r=await requete(d);if(!r||!Number.isInteger(r.status))stop('SONDE_FORME');
  if(r.status===200||r.status===206){r.annuler();return {categorie:'REPONSE_MEDIA_POSSIBLE',absent:false,corps_non_consomme:true};}
  if(r.status===404){r.annuler();return {categorie:'ABSENCE_HTTP404',absent:true};}
  if([301,302,307,308].includes(r.status)){r.annuler();const suivant=matrice.rediriger(d,r.location);if(!suivant)return {categorie:'REDIRECTION_REFUSEE',absent:false};d=suivant;continue;}
  if(r.status===400||r.status===403){const b=await r.lireErreurBornee(4096);if(!Buffer.isBuffer(b)||b.length>4096){r.annuler();stop('SONDE_BORNE');}const fp=sha(b);
   if(r.status===400&&b.length===88&&fp===ERREUR400.sha256&&body400Connus.includes(fp)){let j;try{j=JSON.parse(b.toString('utf8'));}catch{return {categorie:'ERREUR_NON_QUALIFIEE',absent:false};}
    if(j&&!Array.isArray(j)&&Object.keys(j).sort().join('|')==='code|error|message|statusCode'&&j.statusCode==='404'&&j.error==='not_found'&&j.code==='NoSuchKey'&&j.message==='Object not found')return {categorie:'ABSENCE_HTTP400_CONNUE',absent:true};
   }
   if(r.status===403&&d.famille==='TRANSFORMATION'&&body403Connus.includes(fp))return {categorie:'TRANSFORMATION_REFUSEE_CONNUE',absent:true};
   return {categorie:'ERREUR_NON_QUALIFIEE',absent:false};
  }
  r.annuler();return {categorie:'STATUT_NON_QUALIFIE',absent:false};
 }
 return {categorie:'REDIRECTIONS_BORNEES',absent:false};
}

// Chaque appel couvre une seule source et une seule série. Un GET terminal
// de l'alias peut déjà avoir établi le refus direct de l'URL demandée.
export async function* observerSerie({matrice,demandes,requete,partager,body400Connus,body403Connus}){
 const terminaux=new Map();
 const ordre=partager?[...demandes.filter(d=>d.famille==='ALIAS'),
  ...demandes.filter(d=>d.famille!=='ALIAS')]:demandes;
 for(const d of ordre){
  if(terminaux.has(d.url)){
   yield {d,...terminaux.get(d.url)};
   continue;
  }
  let terminal,statut;
  const lire=async desc=>{
   const reponse=await requete(desc);
   terminal=desc;statut=reponse?.status;
   return reponse;
  };
  const r=await observerChaine({descripteur:d,matrice,requete:lire,body400Connus,body403Connus});
  const preuve={r,terminal,statut};
  if(partager&&r.absent&&d.famille==='ALIAS'&&terminal&&
     ['ORIGINE','TRANSFORMATION'].includes(terminal.famille)&&demandes.some(v=>v.url===terminal.url)){
   terminaux.set(terminal.url,preuve);
  }
  yield {d,...preuve};
 }
}
