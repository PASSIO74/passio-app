import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {cadreGitHub,installerPlan,verifierManifest,planPrive,exigerContexte,fermerContexte,sha,refuser} from './contexte.mjs';
import {verifierReferencePrivee,projeterPrevol,SQL_PREVOL} from './prevol.mjs';
import {ouvrirAutorisation,fermerAutorisation} from './autorisation.mjs';
import {creerBudget,selectionFigee} from './core/cadre.mjs';
import {creerTransportProduction} from './transport-copie.mjs';
import {executerCampagne} from './campagne.mjs';
import {creerJournal} from './journal/journal.mjs';
function ecrireUnique(n,b){let fd,erreur;try{fd=fs.openSync(n,'wx',0o600);let i=0;while(i<b.length){const q=fs.writeSync(fd,b,i,b.length-i);if(!Number.isInteger(q)||q<1||q>b.length-i)refuser('CONSOMMATION_PERSISTANCE');i+=q;}fs.fsyncSync(fd);}catch(e){erreur=e;}finally{try{if(fd!==undefined)fs.closeSync(fd);}catch(e){erreur??=e;}}if(erreur)refuser('PLAN_DEJA_CONSOMME_OU_IO');}
export async function copieServeur(){
 const execution=cadreGitHub();let brut=process.env.PASSIO_COPIE_PLAN_PRIVE;delete process.env.PASSIO_COPIE_PLAN_PRIVE;
 let io=null,cap=null,cles=null,journal=null;
 try{
  const p=installerPlan(brut,execution);brut=null;verifierManifest();const reference=verifierReferencePrivee(p),budget=creerBudget();
  const temp=process.env.RUNNER_TEMP;if(typeof temp!=='string'||!path.isAbsolute(temp)||fs.lstatSync(temp).isSymbolicLink()||fs.realpathSync(temp)!==temp)refuser('TEMP_REFUSE');
  ecrireUnique(path.join(temp,'passio-copie-consommee.json'),Buffer.from(JSON.stringify({format:'passio-copie-consommation/1',nonce_fp:sha(p.nonce),execution,instruction_sha256:p.instruction_humaine_sha256})+'\n'));
  journal=creerJournal({repertoire:path.join(temp,'passio-copie-'+p.nonce),nonce:p.nonce,recipient:process.env.SAUVEGARDE_AGE_PUBLIC,actionRoot:path.join(temp,'passio-upload-artifact'),agePath:'/usr/bin/age',execution,delaiRestant:()=>{exigerContexte();return budget.reste();}});
  journal.ajouter({type:'DEBUT',action:'REPRISE',phase:'PRINCIPAL',sha256:sha(JSON.stringify([p.instruction_humaine_sha256,p.revue_root_sha256,p.revue_distincte_sha256,p.code_manifest_sha256,['run_id','run_attempt','job','head','workflow_ref'].map(k=>p.execution[k])]))});
  journal.ajouter({type:'DEBUT',action:'CATALOGUE',phase:'PRINCIPAL',sha256:p.cohorte.recu_cohorte_sha256});
  journal.ajouter({type:'DEBUT',action:'PREFLIGHT',phase:'PRINCIPAL',sha256:p.cohorte.empreinte_contexte});
  exigerContexte();let pat=process.env.SUPABASE_ACCESS_TOKEN,service=process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.SUPABASE_ACCESS_TOKEN;delete process.env.SUPABASE_SERVICE_ROLE_KEY;exigerContexte();
  if(typeof pat!=='string'||!/^sbp_[A-Za-z0-9_-]+$/.test(pat)||typeof service!=='string'||service.length<32||service.length>16384||/[\r\n\0]/.test(service)||pat===service)refuser('CREDENTIAL_FORME');
  cles={pat,service};pat=null;service=null;cap=ouvrirAutorisation();
  const base=await import('./core/classificateur.mjs'),{projeter}=await import('./core/cohorte.mjs');
  io=await creerTransportProduction(cap,cles,{budget,journal,sqlCatalogue:base.SQL,sqlPrevol:SQL_PREVOL,projeterPrevol});cles=null;
  const r=await executerCampagne({io,journal,budget,preparerPlan:x=>selectionFigee(x,base,projeter),catalogueAttendu:reference.catalogueAttendu,nettoyageAutorise:p.nettoyage_copies_autorise});
  return {...r,journal:journal.rapportPublic()};
 }finally{io?.fermer();cles=null;cap&&fermerAutorisation(cap);fermerContexte();brut=null;}
}
export async function qualificationServeur({journalFactory=creerJournal,env=process.env,horloge=()=>performance.now()}={}){
 // Entrée JS native ; aucun accès au plan ou aux variables Supabase dans ce mode.
 const event=env.GITHUB_EVENT_NAME,ref=env.GITHUB_REF;
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!=='PASSIO74/passio-app'||env.GITHUB_ACTOR!=='PASSIO74'||env.GITHUB_RUN_ATTEMPT!=='1'||env.GITHUB_JOB!=='copie_heritage'||!(event==='pull_request'&&/^refs\/pull\/[1-9][0-9]*\/merge$/.test(ref||'')||event==='workflow_dispatch'&&ref==='refs/heads/main'))refuser('QUALIFICATION_CONTEXTE');
 const execution={run_id:env.GITHUB_RUN_ID,run_attempt:env.GITHUB_RUN_ATTEMPT,job:env.GITHUB_JOB,workflow_ref:env.GITHUB_WORKFLOW_REF,head:env.GITHUB_SHA};
 const nonce=randomUUID(),debut=horloge(),j=journalFactory({mode:'qualification',repertoire:path.join(env.RUNNER_TEMP,'passio-qualification-'+nonce),nonce,recipient:env.SAUVEGARDE_AGE_PUBLIC,actionRoot:path.join(env.RUNNER_TEMP,'passio-upload-artifact'),agePath:'/usr/bin/age',execution,delaiRestant:()=>90000-(horloge()-debut)});
 j.ajouter({type:'DEBUT',action:'CATALOGUE',phase:'PRINCIPAL',objets:0});j.ajouter({type:'FIN',action:'ETAT_FINAL',phase:'PRINCIPAL',objets:0,statut:'OK'});
 const a=await j.checkpoint('FIN',[]);
 return {format:'passio-qualification-checkpoint/1',synthetique:true,nom:a.nom,id:a.id,digest:a.digest,cipher_octets_locaux:a.cipher_octets_locaux,appels_supabase:0,mutation_supabase:0,commercial_go:false};
}
