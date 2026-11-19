import {CONTRAT as COPIE,empreintePhysique,identite,sha,UUID,cle,chemin} from './core/cadre.mjs';
import {sqlEtats,routeManagement} from './core/requetes.mjs';
export {empreintePhysique,identite,sha,UUID,cle,chemin};
export const C=Object.freeze({source:'content',copie:'content-heritage-prive',hote:'njkiyoklssvefstljemx.supabase.co',netlify:'passio-app.netlify.app',
 fence_sha256:'31f28ee35922ec2d8bd48ddee09ca1768ac38b2759d8b225f8e5c07b20112435',sources_max:14,requete_max:160,octets_max:41943040,principal_ms:600000,observation_ms:300000,attente_cdn_ms:60000});
export const ERREUR400=Object.freeze({sha256:'9d2505709301f205e4135106c7c92c66a58d85a1009b5b823475c6a047de1a9c',octets:88,
 projection_sha256:'b6ea4318e9c248f9e52f2a3e809100d3a33a0e5e278ffe4cbb692ce2503bde87',controle_sha256:'608e7287a8f0adc1579b45ec558360c86841248a29fdf0c670937c4e97fa8e59'});
export class Refus extends Error{constructor(code){super(code);this.code=code;}}
export const stop=code=>{throw new Refus(code);};
export function admission(){return {autorisee:false,stage_sha256:null,copies_qualifiees_sha256:null,mandat_sha256:null,maintenance_exclusive_sha256:null,transport_anonyme_absent:true};}
export async function retraitProduction(cles){stop('OUVERTURE_NON_AUTORISEE');}
export function descriptorDelete(s){if(s.bucket!=='content'||!UUID.test(s.id)||!UUID.test(s.owner)||s.owner!==s.owner_id)stop('SOURCE_REFUSEE');return {host:C.hote,method:'DELETE',path:'/storage/v1/object/content',body:{prefixes:[cle(s.name)]},anonyme:false};}
export function descriptorEtat(s){return {host:'api.supabase.com',method:'POST',path:routeManagement,body:{query:sqlEtats([s]),read_only:true},anonyme:false};}
export function planCanonique(selection,copies,preuves){
 if(selection?.sources?.length!==14||copies.length!==14||preuves.length!==14)stop('PLAN_REFUSE');
 const fps=selection.sources.map(empreintePhysique).sort();if(JSON.stringify(fps)!==JSON.stringify([...COPIE.empreintes_cohorte].sort())||selection.contexte!==COPIE.empreinte_contexte)stop('PLAN_REFUSE');
 return selection.sources.map(s=>{const cp=copies.find(x=>x.name===s.name&&x.bucket===C.copie),p=preuves.find(x=>x.source_fp===empreintePhysique(s));
  if(!cp||!p||p.echo_uuid_fp!==sha(cp.id)||p.copie_identite_fp!==identite(cp)||cp.owner!==s.owner||cp.owner_id!==s.owner_id||!/^[0-9a-f]{64}$/.test(p.sha256||'')||!/^[0-9a-f]{32}$/.test(p.md5||'')||p.octets!==Number(s.size))stop('PREUVE_COPIE_REFUSEE');
  return {source:{...s},copie:{...cp},preuve:{...p}};});
}
export function budget(horloge=()=>({wall:Date.now(),mono:performance.now()}),sourcesMax=14){
 if(![2,12,14].includes(sourcesMax))stop('BUDGET_DELETE');
 const t0=horloge();let debutObs=null,debutAttente=null,phase='PRINCIPAL',appels=0,octets=0,deletes=0,attentes=0;
 const reste=()=>{const t=horloge(),s=debutObs||t0,lim=debutObs?C.observation_ms:C.principal_ms,w=t.wall-s.wall,m=t.mono-s.mono;if(!Number.isFinite(w)||!Number.isFinite(m)||w<0||m<0||w>=lim||m>=lim)stop('DELAI');return Math.min(lim-w,lim-m);};
 return {reste,phase:()=>phase,appel(){reste();if(++appels>C.requete_max)stop('BUDGET_REQUETES');},lire(n){if(!Number.isSafeInteger(n)||n<0)stop('FORME');octets+=n;if(octets>C.octets_max)stop('BUDGET_OCTETS');reste();},
  supprimer(){reste();if(phase!=='PRINCIPAL'||++deletes>sourcesMax)stop('BUDGET_DELETE');},observer(){if(debutObs)stop('OBSERVATION_DEJA_ENGAGEE');debutObs=horloge();phase='OBSERVATION';reste();},attendre(){if(++attentes>1)stop('ATTENTE_DEJA_ENGAGEE');debutAttente=horloge();},attenteEcoulee(){const t=horloge();if(!debutAttente||t.wall-debutAttente.wall<60000||t.mono-debutAttente.mono<60000)stop('ATTENTE_NON_ECOULEE');reste();},compteurs:()=>({appels,octets,deletes_demandes:deletes,attentes})};
}
