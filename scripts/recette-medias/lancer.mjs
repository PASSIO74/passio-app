import {performance} from 'node:perf_hooks';
import {setTimeout as sleep} from 'node:timers/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {APERCU,CIBLE} from './parcours.mjs';
import {lireArtefact} from './apercu.mjs';
import {cycle,identites,verifierPages} from './cycle.mjs';

const cockpit='https://pr-970--passio-app.netlify.app';
const tree='e59be1b8c52b733739d263817d8a3aeb94f0a4ae6f9e4a36f0533dae95f8726c';
function exige(x,cat){if(!x)throw Error(cat);}

async function main(){
  exige(process.argv.length===3&&process.argv[2]==='--fenetre-supervisee','INVOCATION');
  exige(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY==='PASSIO74/passio-app'&&
    process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_RUN_ATTEMPT==='1'&&
    process.env.GITHUB_ACTOR==='PASSIO74'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch','RUNNER');
  const f=identites(process.env.GITHUB_RUN_ID),artefact=lireArtefact(path.resolve('artefact-recette-969'),tree);
  const start=performance.now(),absolute=start+600000;let end=start+300000,phase='principal',principal=0,nettoyage=0,octets=0;
  const budget={
    reserver(n=0){
      if(phase==='principal'){principal++;octets+=n;}else{nettoyage++;exige(n===0,'OCTETS');}
      const reste=Math.floor(end-performance.now());
      exige(principal<=200&&nettoyage<=40&&octets<=1048576&&reste>0,'BUDGET');
      return Math.min(reste,15000);
    },
    nettoyage(){exige(phase==='principal','PHASE');phase='nettoyage';end=Math.min(absolute,performance.now()+300000);}
  };
  async function transport({url,method,headers,body,timeout},max){
    const u=new URL(url);
    exige([APERCU,CIBLE,cockpit].includes(u.origin)&&!u.username&&!u.password&&!u.hash,'CIBLE');
    const res=await fetch(u,{method,headers:{...headers,'accept-encoding':'identity'},body:body?.length?body:undefined,redirect:'error',credentials:'omit',signal:AbortSignal.timeout(timeout)});
    let total=0;const chunks=[];
    for await(const chunk of res.body??[]){total+=chunk.length;exige(total<=max,'TAILLE');chunks.push(chunk);}
    const h=Object.fromEntries(res.headers);if(res.headers.has('set-cookie'))h['set-cookie']=res.headers.getSetCookie();
    // fetch décompresse le corps quand le fournisseur a compressé malgré la préférence.
    if(h['content-encoding']&&h['content-encoding']!=='identity')delete h['content-length'];
    return {status:res.status,headers:h,bytes:Buffer.concat(chunks)};
  }
  const request=r=>transport({...r,timeout:budget.reserver()},65536);
  const operator=await request({url:cockpit+'/pilotage/config.js',method:'GET'});
  const config=/^window\.PILOTAGE_SUPABASE=(\{[^\r\n]+\});\s*$/.exec(operator.bytes.toString('utf8'));
  exige(operator.status===200&&config,'CONFIG_COCKPIT');
  const c=JSON.parse(config[1]);exige(Object.keys(c).sort().join(',')==='anon,url'&&c.url===CIBLE&&c.anon===artefact.anon,'CIBLE_COCKPIT');
  const cap=async()=>{
    const r=await request({url:APERCU+'/private-media/capabilities',method:'POST',headers:{'x-passio-media-read':'1'}});
    const controls=(r.headers['cache-control']||'').toLowerCase().split(',').map(x=>x.trim());
    exige(r.status===200&&controls.includes('private')&&controls.includes('no-store')&&!r.headers['set-cookie'],'CAPACITES');
    const p=JSON.parse(r.bytes);exige(p.protocol===1&&p.min_client===1&&typeof p.uploads_enabled==='boolean'&&p.reads_enabled===p.uploads_enabled,'CAPACITES');
    return p.uploads_enabled;
  };
  const attendre=async(on,read)=>{
    const until=Math.min(end-5000,performance.now()+(on?120000:75000));
    for(;;){if(await read()===on)return;exige(performance.now()+5000<until,'ATTENTE_COCKPIT');await sleep(5000);}
  };
  const service=process.env.STAGING_SERVICE_ROLE_KEY;delete process.env.STAGING_SERVICE_ROLE_KEY;
  exige(typeof service==='string'&&service.length<8192,'CREDENTIAL_STAGING');
  const claims=JSON.parse(Buffer.from(service.split('.')[1],'base64url'));
  exige(claims.ref==='fcksxofaelcdmmifnwjo'&&claims.role==='service_role'&&claims.exp>Date.now()/1000+600,'CREDENTIAL_STAGING');
  try {
    await cycle({f,service,artefact,request,cap,attendre,budget,signaler:m=>console.log(m),
      verifier:sessions=>verifierPages({chromium,artefact,f,sessions,budget,perform:r=>transport(r,1048576)})});
    console.log('PARCOURS_A_B_VERIFIE');
  }finally{console.log(JSON.stringify({principal,nettoyage,octets}));}
}
main().catch(err=>{
  const known=new Set(['INVOCATION','RUNNER','BUDGET','CIBLE','CONFIG_COCKPIT','CIBLE_COCKPIT','CAPACITES','ATTENTE_COCKPIT','CREDENTIAL_STAGING','INITIAL_OUVERT','IDENTITE_OCCUPEE','PROFIL_PRIVE','SUIVI_CARDINALITE','SUIVI_STATUT','FIN_INCOMPLETE','LECTURE_DESTINATAIRE','STATUT_200','STATUT_201']);
  console.error(known.has(err?.message)?err.message:'RECETTE_RETENUE');process.exitCode=1;
});
