// Contrat générique : aucune empreinte de cohorte, aucun secret ni effet de bord.
import {createHash} from 'node:crypto';

export const ACTION_COMMIT='ea165f8d65b6e75b540449e92b4886f43607fa02';
export const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
export const HEX=/^[0-9a-f]{64}$/;
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const refuser=code=>{throw Object.assign(new Error(code),{code});};
export const ACTIONS=Object.freeze(['CATALOGUE','PREFLIGHT','CREER_BUCKET','BUCKET_PRIVE','ETAT','GET_SOURCE','COPY','CAS','GET_DESTINATION','ETAT_FINAL','DELETE_COPIE','REPRISE']);
export const MUTATIONS=Object.freeze(['CREER_BUCKET','COPY','CAS','DELETE_COPIE']);
export const CATEGORIES=Object.freeze({BUCKET:['CREER_BUCKET'],COPIES:['COPY'],ASSOCIATIONS:['CAS'],FIN:[],COMPENSATION:['DELETE_COPIE'],ECHEC:[]});
const TYPES=['DEBUT','INTENTION','RETOUR','ECHO_COPY','VERIFIE','ECHEC','FIN','BLOQUE'];
const FIELDS=['type','action','phase','source_fp','dest_fp','identite_fp','echo_fp','sha256','md5','octets','objets','http','statut'];
const TRACES=['source_fp','dest_fp','identite_fp'];
export function exacte(o,fields){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).sort().join('|')!==[...fields].sort().join('|'))refuser('JOURNAL_FORME');
}
export function validerEvent(e){
 if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).some(k=>!FIELDS.includes(k))||!TYPES.includes(e.type))refuser('JOURNAL_FORME');
 if(e.action!==undefined&&!ACTIONS.includes(e.action))refuser('JOURNAL_FORME');
 if(e.phase!==undefined&&!['PRINCIPAL','NETTOYAGE'].includes(e.phase))refuser('JOURNAL_FORME');
 if(e.statut!==undefined&&!['OK','REFUSE','AMBIGU','RESIDU'].includes(e.statut))refuser('JOURNAL_FORME');
 for(const k of ['source_fp','dest_fp','identite_fp','echo_fp','sha256'])if(e[k]!==undefined&&(typeof e[k]!=='string'||!HEX.test(e[k])))refuser('JOURNAL_FORME');
 if(e.md5!==undefined&&(typeof e.md5!=='string'||!(/^[0-9a-f]{32}$/).test(e.md5)))refuser('JOURNAL_FORME');
 for(const k of ['octets','objets','http'])if(e[k]!==undefined&&(!Number.isSafeInteger(e[k])||e[k]<0))refuser('JOURNAL_FORME');
}
export function traceEvent(e){return Object.fromEntries(TRACES.filter(k=>e[k]!==undefined).map(k=>[k,e[k]]));}
export function cleIntention(action,trace={}){
 if(!ACTIONS.includes(action)||!trace||typeof trace!=='object'||Array.isArray(trace)||Object.keys(trace).some(k=>!TRACES.includes(k)))refuser('JOURNAL_INTENTION');
 for(const v of Object.values(trace))if(typeof v!=='string'||!HEX.test(v))refuser('JOURNAL_INTENTION');
 return JSON.stringify([action,...TRACES.map(k=>trace[k]??null)]);
}
export function validerAutorisations(categorie,liste){
 if(!Object.hasOwn(CATEGORIES,categorie)||!Array.isArray(liste)||liste.length>32)refuser('CHECKPOINT_FORME');
 const keys=new Set();
 const resultat=liste.map(a=>{
  if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>k!=='action'&&!TRACES.includes(k))||!CATEGORIES[categorie].includes(a.action))refuser('CHECKPOINT_FORME');
  const trace=traceEvent(a),attendus=a.action==='CREER_BUCKET'?[]:a.action==='CAS'?TRACES:a.action==='COPY'?['source_fp','dest_fp']:['dest_fp'];
  exacte(trace,attendus);const key=cleIntention(a.action,trace);if(keys.has(key))refuser('CHECKPOINT_DOUBLON');keys.add(key);
  return Object.freeze({action:a.action,...trace});
 });
 return resultat;
}

// setOutput de @actions/core : KEY=value ou ghadelimiter_UUID. Aucune sortie libre.
export function lireAck(brut,{run_id}){
 if(!Buffer.isBuffer(brut)||brut.length===0||brut.length>4096)refuser('ACK_FORME');
 const s=brut.toString('utf8');if(!Buffer.from(s).equals(brut)||/[\0\r]/.test(s.replaceAll('\r\n','\n')))refuser('ACK_FORME');
 const lines=s.replaceAll('\r\n','\n').split('\n');if(lines.at(-1)==='')lines.pop();
 const values={};
 for(let i=0;i<lines.length;i++){
  const line=lines[i];let name,value;
  const direct=/^(artifact-id|artifact-digest|artifact-url)=([^\n]+)$/.exec(line);
  const multi=/^(artifact-id|artifact-digest|artifact-url)<<(ghadelimiter_[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/.exec(line);
  if(direct){[,name,value]=direct;}
  else if(multi){[,name]=multi;value=lines[++i];if(value===undefined||lines[++i]!==multi[2])refuser('ACK_FORME');}
  else refuser('ACK_FORME');
  if(Object.hasOwn(values,name))refuser('ACK_FORME');values[name]=value;
 }
 if(!/^[1-9][0-9]{0,18}$/.test(values['artifact-id']||'')||!Number.isSafeInteger(Number(values['artifact-id']))||!HEX.test(values['artifact-digest']||''))refuser('ACK_FORME');
 const id=Number(values['artifact-id']);
 if(values['artifact-url']!==undefined&&values['artifact-url']!==`https://github.com/PASSIO74/passio-app/actions/runs/${run_id}/artifacts/${id}`)refuser('ACK_FORME');
 return Object.freeze({id,digest:values['artifact-digest']});
}
