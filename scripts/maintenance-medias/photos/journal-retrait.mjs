// Adaptation bornée du journal46d2cc57 gel30db, actions du retrait explicites.
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {sha,stop,UUID} from './contrat.mjs';
const RUNS=path.join(process.env.RUNNER_TEMP||path.dirname(fileURLToPath(import.meta.url)),'passio-retrait-journal');
const TYPES=['DEBUT','INTENTION','RETOUR','VERIFIE','BLOQUE','FIN'];
const ACTIONS=['PREVOL','CATALOGUE','SOURCE_ETAT','GET_SOURCE','GET_COPIE','LIAISON','GET_APPLICATIVE','DELETE_SOURCE','ABSENCE','PROBE_PUBLIC','ATTENTE_CDN','FIN'];
export const MAX_EVENEMENTS=700;
const KEYS=['type','action','phase','source_fp','dest_fp','identite_fp','sha256','md5','octets','objets','http','statut','duree_ms'];
function forme(e){if(!e||Object.keys(e).some(k=>!KEYS.includes(k))||!TYPES.includes(e.type)||!ACTIONS.includes(e.action)||!['PRINCIPAL','OBSERVATION'].includes(e.phase))stop('JOURNAL_FORME');
 for(const k of ['source_fp','dest_fp','identite_fp','sha256'])if(e[k]!==undefined&&!/^[0-9a-f]{64}$/.test(e[k]))stop('JOURNAL_FORME');
 if(e.md5!==undefined&&!/^[0-9a-f]{32}$/.test(e.md5))stop('JOURNAL_FORME');
 for(const k of ['octets','objets','http'])if(e[k]!==undefined&&(!Number.isSafeInteger(e[k])||e[k]<0))stop('JOURNAL_FORME');
 if(e.duree_ms!==undefined&&(e.type!=='RETOUR'||e.action!=='ATTENTE_CDN'||!Number.isSafeInteger(e.duree_ms)||e.duree_ms<60000))stop('JOURNAL_FORME');
 if(e.statut!==undefined&&!['OK','REFUSE','AMBIGU','NON_GO'].includes(e.statut))stop('JOURNAL_FORME');}
function ecrire(io,p,obj){const fd=io.openSync(p,'wx',0o600);let err;try{const b=Buffer.from(JSON.stringify(obj)+'\n');let i=0;while(i<b.length){const n=io.writeSync(fd,b,i,b.length-i);if(!Number.isInteger(n)||n<1||n>b.length-i)stop('JOURNAL_ECRITURE');i+=n;}io.fsyncSync(fd);}catch(e){err=e;}try{io.closeSync(fd);}catch(e){err??=e;}if(err)stop('JOURNAL_PERSISTANCE');}
function repertoire(dir){const r=path.relative(RUNS,dir);if(!UUID.test(r)||r.includes(path.sep)||fs.lstatSync(RUNS).isSymbolicLink()||fs.realpathSync(RUNS)!==RUNS||fs.lstatSync(dir).isSymbolicLink()||fs.realpathSync(dir)!==dir)stop('JOURNAL_CHEMIN');}
export function creerJournal({nonce=randomUUID(),io=fs}={}){
 if(!UUID.test(nonce))stop('JOURNAL_CHEMIN');if(!fs.existsSync(RUNS))fs.mkdirSync(RUNS);if(fs.realpathSync(RUNS)!==RUNS||fs.lstatSync(RUNS).isSymbolicLink())stop('JOURNAL_CHEMIN');
 const dir=path.join(RUNS,nonce);fs.mkdirSync(dir);repertoire(dir);let seq=0,precedent='0'.repeat(64),valide=true,intention=null,pret=null;
 try{ecrire(io,path.join(dir,'RUN.json'),{format:'passio-retrait-journal/1',nonce_fp:sha(nonce),anti_troncature:false});}catch{valide=false;stop('JOURNAL_PERSISTANCE');}
 return {repertoire:dir,valide:()=>valide,
  ajouter(e){if(!valide)stop('JOURNAL_EMPOISONNE');try{forme(e);if(seq>=MAX_EVENEMENTS)stop('JOURNAL_BORNE');repertoire(dir);
   const r={sequence:seq+1,precedent,nonce_fp:sha(nonce),...e};ecrire(io,path.join(dir,'event-'+String(seq+1).padStart(5,'0')+'.json'),r);seq++;precedent=sha(JSON.stringify(r)+'\n');intention=e.type==='INTENTION'?{...e,sequence:seq}:null;pret=null;return {durable:true,sequence:seq};
  }catch{valide=false;stop('JOURNAL_PERSISTANCE');}},
  consommer(action,trace={}){if(!valide||!intention||intention.action!==action||Object.entries(trace).some(([k,v])=>!['source_fp','dest_fp','identite_fp'].includes(k)||intention[k]!==v)){valide=false;stop('JOURNAL_INTENTION');}
   const ticket=Object.freeze({sequence:intention.sequence,nonce_fp:sha(nonce)});pret={ticket,action,trace:{...trace}};intention=null;return ticket;},
  autoriserIO(action,trace={},ticket){if(!valide||!pret||pret.action!==action||ticket!==undefined&&ticket!==pret.ticket||JSON.stringify(Object.entries(trace).sort())!==JSON.stringify(Object.entries(pret.trace).sort())){valide=false;stop('JOURNAL_INTENTION');}const t=pret.ticket;pret=null;return t;}
 };
}
