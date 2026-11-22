import {createHash} from 'node:crypto';
import {CONTRAT,verifierCohorte,empreintePhysique,preparerCasDestination} from './noyau.mjs';
export {CONTRAT,empreintePhysique,preparerCasDestination};
export const sha=v=>createHash('sha256').update(v).digest('hex');
export const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export const DEST=CONTRAT.destination_bucket,REF=CONTRAT.cible;
export const HOST_STORAGE=REF+'.supabase.co',HOST_MANAGEMENT='api.supabase.com';
export class Refus extends Error{constructor(code){super(code);this.code=code;}}
export const refuser=code=>{throw new Refus(code);};
export function ouvertureReelle(){return {autorisee:false,preuve_hebergee_sha256:null,mandat_gel_sha256:null,grant_reprise_sha256:null,exclusivite_ecrivain_sha256:null};}
export function exigerOuverture(){refuser('OUVERTURE_NON_AUTORISEE');}
export function cle(v){if(typeof v!=='string'||!v||Buffer.byteLength(v)>8192||/[\x00-\x1f\x7f\\]/.test(v)||v.split('/').some(x=>!x||x==='.'||x==='..'))refuser('CLE_REFUSEE');return v;}
export function chemin(v){return cle(v).split('/').map(encodeURIComponent).join('/');}
export function proprietaireVivant(x){return x?.auth===true&&x.profil===true&&x.suppression_active===false;}
export function identite(o){if(!o||!UUID.test(o.id)||typeof o.version!=='string'||!o.version)refuser('IDENTITE_REFUSEE');return sha(JSON.stringify([o.id.toLowerCase(),o.bucket,o.name,o.version]));}
export const tracerSource=s=>({source_fp:empreintePhysique(s),dest_fp:sha(JSON.stringify([DEST,s.name]))});
export const empreinteLot=cs=>sha(JSON.stringify(cs.map(c=>[DEST,c.source.name,c.destination.id,c.destination.version]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))));
export function verifierEchoCopy(json,key){
 if(!json||typeof json!=='object'||Array.isArray(json)||json.Key!==DEST+'/'+cle(key))refuser('COPY_ECHO_AMBIGU');
 const valeurs=[json.Id,json.id].filter(x=>x!==undefined);
 if(!valeurs.length||valeurs.some(x=>typeof x!=='string'||!UUID.test(x))||new Set(valeurs.map(x=>x.toLowerCase())).size!==1)refuser('COPY_ECHO_AMBIGU');
 return {id:valeurs[0].toLowerCase(),echo_fp:sha(JSON.stringify([json.Key,valeurs[0].toLowerCase()]))};
}
export function selectionFigee(payload,base,projeter){
 const projection=projeter(payload,base);verifierCohorte(projection);
 const selection=new Set(projection.objets_cohorte.map(x=>x.empreinte));
 const sources=payload.tables.objects.rows.filter(x=>selection.has(base.empreinteObjet(x))).map(x=>({...x}));
 if(sources.length!==14||sources.some(x=>x.bucket!=='content'||!UUID.test(x.owner||'')||x.owner!==x.owner_id||x.auth_presente!==true))refuser('COHORTE_REFUSEE');
 for(const o of sources)cle(o.name);
 return {sources,contexte:projection.analyse_reference.empreinte_contexte,couverture_liste_fermee:false};
}
export function creerBudget(horloge=()=>({wall:Date.now(),mono:performance.now()})){
 const t0=horloge();let phase='PRINCIPAL',debutNettoyage=null,appels=0,nettoyage=0,lus=0,copies=0,nombreCopies=0;
 const reste=()=>{const t=horloge(),s=phase==='PRINCIPAL'?t0:debutNettoyage,lim=phase==='PRINCIPAL'?600000:300000,w=t.wall-s.wall,m=t.mono-s.mono;
  if(!Number.isFinite(w)||!Number.isFinite(m)||w<0||m<0||w>=lim||m>=lim)refuser('DELAI');return Math.floor(Math.min(lim-w,lim-m));};
 return {reste,phase:()=>phase,nettoyer(){if(debutNettoyage)refuser('RESERVE_DEJA_ENGAGEE');debutNettoyage=horloge();phase='NETTOYAGE';reste();},
  appel(){reste();if(phase==='PRINCIPAL'){if(++appels>200)refuser('BUDGET_APPELS');}else if(++nettoyage>40)refuser('BUDGET_NETTOYAGE');},
  lecture(n){if(!Number.isSafeInteger(n)||n<0)refuser('FORME');lus+=n;if(lus>41943040)refuser('BUDGET_LECTURE');reste();},
  copie(n){if(phase!=='PRINCIPAL'||!Number.isSafeInteger(n)||n<0||++nombreCopies>14||(copies+=n)>25165824)refuser('BUDGET_COPIE');reste();},
  compteurs:()=>({appels,appels_nettoyage:nettoyage,octets_lus:lus,octets_copies:copies,copies_demandees:nombreCopies})};
}
