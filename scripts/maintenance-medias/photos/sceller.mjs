import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {cadre,contexte,pinPlan,sha,refuser} from './contexte.mjs';
const ok=(v,c)=>{if(!v)refuser(c);};
function dossier(){
 const temp=process.env.RUNNER_TEMP,e=cadre();ok(process.platform==='linux'&&typeof temp==='string'&&path.isAbsolute(temp)&&path.resolve(temp)===temp&&fs.realpathSync(temp)===temp,'DOSSIER');
 return path.join(temp,'passio-'+e.job+'-'+e.run_id);
}
export function ouvrirDossier(){const d=dossier();fs.mkdirSync(d,{mode:0o700});}
export function local(n){ok(['preparation','checkpoint.age','resultat.age','intention-copie-1','intention-copie-2','intention-owner-1','intention-owner-2'].includes(n),'NOM');
 const d=dossier();ok(fs.realpathSync(d)===d&&fs.lstatSync(d).isDirectory(),'DOSSIER');return path.join(d,n);}
export function exclusivement(file,b){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,b);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
export function sceller(n,objet){
 contexte();ok(n==='checkpoint.age'||n==='resultat.age','NOM');
 const rec=process.env.PASSIO_AGE_PUBLIC;ok(typeof rec==='string'&&/^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$/.test(rec),'AGE');
 const clear=Buffer.from(JSON.stringify({format:'passio-photos-chiffre/1',execution:cadre(),plan_sha256:pinPlan(),objet}));ok(clear.length<=4194304,'TAILLE');
 let r;try{r=spawnSync('/usr/bin/age',['--encrypt','--recipient',rec],{input:clear,cwd:dossier(),env:{PATH:'/usr/bin:/bin',HOME:dossier(),TMPDIR:dossier()},maxBuffer:5242880,timeout:30000,windowsHide:true});}finally{clear.fill(0);}
 ok(!r.error&&r.status===0&&r.stdout.length>=80&&r.stdout.subarray(0,22).equals(Buffer.from('age-encryption.org/v1\n')),'AGE');
 exclusivement(local(n),r.stdout);return sha(r.stdout);
}
export function verifierAck(){const id=process.env.PASSIO_ACK_ID,d=process.env.PASSIO_ACK_DIGEST;ok(typeof id==='string'&&/^[1-9]\d{0,17}$/.test(id)&&Number.isSafeInteger(Number(id))&&typeof d==='string'&&/^[a-f0-9]{64}$/.test(d),'CHECKPOINT_ACK');
 const file=local('preparation');ok(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file&&fs.statSync(file).size<=4194304,'PREPARATION');const raw=fs.readFileSync(file);ok(sha(raw)===process.env.PASSIO_PREPARATION_SHA,'PREPARATION');const s=JSON.parse(raw);
 ok(s.plan_sha256===pinPlan()&&s.execution.run_id===cadre().run_id&&sha(fs.readFileSync(local('checkpoint.age')))===s.cipher_sha256,'PREPARATION');return s;
}
