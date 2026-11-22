// Fonction pure pour Root après déchiffrement : ne lit ni clé, ni disque, ni réseau.
// Le résultat contient des empreintes privées ; ne jamais l'envoyer aux logs publics.
import {sha,refuser} from './contexte.mjs';import {validerEvent} from './journal/contrat.mjs';
const HEX=/^[0-9a-f]{64}$/;
export function extrairePreuveCopies({journalClair,plan,depot}){
 if(!Buffer.isBuffer(journalClair)||journalClair.length>1048576)refuser('PREUVE_FORME');
 if(!depot||depot.run_conclusion!=='success'||depot.run_id!==plan.execution.run_id||!Number.isSafeInteger(depot.artifact_id)||depot.artifact_id<1||!HEX.test(depot.digest_zip||'')||!HEX.test(depot.cipher_sha256||'')||typeof depot.completed_utc!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(depot.completed_utc)||new Date(Date.parse(depot.completed_utc)).toISOString()!==depot.completed_utc)refuser('DEPOT_NON_ETABLI');
 let j;try{j=JSON.parse(journalClair);}catch{refuser('PREUVE_FORME');}
 if(j.format!=='passio-checkpoint-chiffre/1'||j.mode!=='production'||j.nonce_fp!==sha(plan.nonce)||!j.execution||Object.keys(j.execution).sort().join('|')!=='head|job|run_attempt|run_id|workflow_ref'||['run_id','run_attempt','job','head','workflow_ref'].some(k=>j.execution[k]!==plan.execution[k])||j.intention?.categorie!=='FIN'||!Array.isArray(j.intention.autorisations)||j.intention.autorisations.length!==0||!Array.isArray(j.evenements)||j.evenements.length>1000)refuser('PREUVE_FORME');
 let precedent='0'.repeat(64),sequence=0;for(const e of j.evenements){const {sequence:s,precedent:p,nonce_fp,...event}=e;validerEvent(event);if(s!==++sequence||p!==precedent||nonce_fp!==j.nonce_fp)refuser('JOURNAL_DERIVE');precedent=sha(JSON.stringify(e)+'\n');}
 if(j.intention.sequence!==sequence||j.intention.chaine!==precedent)refuser('JOURNAL_DERIVE');
 const fin=j.evenements.at(-1);if(fin?.type!=='FIN'||fin.action!=='ETAT_FINAL'||fin.statut!=='OK'||fin.objets!==14||j.evenements.some(e=>e.type==='BLOQUE'||e.type==='ECHEC'))refuser('COPIES_NON_TERMINEES');
 const liaison=sha(JSON.stringify([plan.instruction_humaine_sha256,plan.revue_root_sha256,plan.revue_distincte_sha256,plan.code_manifest_sha256,['run_id','run_attempt','job','head','workflow_ref'].map(k=>plan.execution[k])]));
 if(!j.evenements.some(e=>e.type==='DEBUT'&&e.action==='REPRISE'&&e.sha256===liaison)||!j.evenements.some(e=>e.type==='DEBUT'&&e.action==='CATALOGUE'&&e.sha256===plan.cohorte.recu_cohorte_sha256)||!j.evenements.some(e=>e.type==='DEBUT'&&e.action==='PREFLIGHT'&&e.sha256===plan.cohorte.empreinte_contexte))refuser('PLAN_NON_LIE');
 const termines=j.evenements.filter(e=>e.type==='VERIFIE'&&e.action==='GET_DESTINATION');
 if(termines.length!==14||new Set(termines.map(e=>e.source_fp)).size!==14||JSON.stringify(termines.map(e=>e.source_fp).sort())!==JSON.stringify([...plan.cohorte.empreintes_cohorte].sort()))refuser('COHORTE_DERIVEE');
 const copies=termines.map(e=>{for(const k of ['source_fp','echo_fp','identite_fp','sha256'])if(!HEX.test(e[k]||''))refuser('PREUVE_FORME');if(!/^[0-9a-f]{32}$/.test(e.md5||'')||!Number.isSafeInteger(e.octets)||e.octets<0)refuser('PREUVE_FORME');return {source_fp:e.source_fp,echo_uuid_fp:e.echo_fp,copie_identite_fp:e.identite_fp,sha256:e.sha256,md5:e.md5,octets:e.octets};});
 if(copies.reduce((n,c)=>n+c.octets,0)>25165824)refuser('PREUVE_FORME');
 return {format:'passio-preuve-copies-privees/1',cible:plan.cible,cohorte_sha256:plan.cohorte.recu_cohorte_sha256,contexte_sha256:plan.cohorte.empreinte_contexte,journal_gel_sha256:sha(journalClair),copies,owners_verifies:true,sources_non_modifiees:true,completed_utc:depot.completed_utc,commercial_go:false};
}
