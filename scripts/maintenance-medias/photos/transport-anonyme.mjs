import {exigerAutorisation,engagerTransport,operationRetrait,refuser} from './contexte.mjs';
import {C,sha,empreintePhysique,identite} from './contrat.mjs';
import {CONTRAT} from './core/cadre.mjs';
import {sondes} from './sondes.mjs';
// Transport de sonde seulement. Ne prend ni PAT, ni service key. Les URL du
// manifeste restent en mémoire ; seules les trois familles canoniques passent.
export async function creerTransportAnonyme(cap,{plan,budget,journal}){
 const operation=operationRetrait(cap);exigerAutorisation(cap,operation);
 if(!Array.isArray(plan)||plan.length!==14||!journal||['valide','ajouter','consommer','autoriserIO'].some(k=>typeof journal[k]!=='function')||['reste','phase','appel','lire'].some(k=>typeof budget?.[k]!=='function'))refuser('PLAN_REFUSE');
 const fps=plan.map(x=>empreintePhysique(x.source)).sort();
 if(new Set(fps).size!==14||JSON.stringify(fps)!==JSON.stringify([...CONTRAT.empreintes_cohorte].sort()))refuser('PLAN_REFUSE');
 engagerTransport(cap,operation,'ANONYME');
 const permis=new Map();
 for(const x of plan){const m=sondes(x.source,x.variantes||[]);for(const d of m.demandes){permis.set(d.url,{...d,trace:{source_fp:empreintePhysique(x.source),identite_fp:identite(x.source)}});}}
 // Inclure les destinations de redirection canoniques de ces mêmes clés.
 for(const x of plan){const m=sondes(x.source);for(const d of m.demandes)if(!permis.has(d.url))permis.set(d.url,{...d,trace:{source_fp:empreintePhysique(x.source),identite_fp:identite(x.source)}});}
 const {default:https}=await import('node:https');let ferme=false;const actifs=new Set();
 const garde=()=>{exigerAutorisation(cap,operation);if(ferme||!journal.valide())refuser('TRANSPORT_FERME');const r=budget.reste();if(!Number.isFinite(r)||r<1)refuser('DELAI');return Math.floor(Math.min(15000,r));};
 return {
  fermer(){ferme=true;for(const x of actifs)x.destroy();actifs.clear();},
  async probe(d){
   const attendu=permis.get(d?.url);
   if(!attendu||d.method!=='GET'||d.anonyme!==true||d.empreinte!==sha(d.url)||!d.headers||Object.keys(d.headers).length||d.famille!==attendu.famille)refuser('SONDE_ROUTE');
   // Cette URL est exactement une chaîne créée par sondes(), jamais une URL
   // provenant d'un Location arbitraire normalisée avant comparaison.
   const u=new URL(d.url);if(![C.hote,C.netlify].includes(u.hostname)||u.protocol!=='https:'||u.port||u.username||u.password)refuser('SONDE_ROUTE');
   garde();
   // Ce transport est propriétaire du journal et du débit d'une sonde. Il
   // n'est pas encore injecté tel quel dans le noyau3e2f (qui les possède aussi).
   const trace={...attendu.trace,dest_fp:d.empreinte};
   if(journal.ajouter({type:'INTENTION',action:'PROBE_PUBLIC',phase:budget.phase(),...trace})?.durable!==true)refuser('JOURNAL_PERSISTANCE');
   garde();const ticket=journal.consommer('PROBE_PUBLIC',trace);
   if(!Number.isSafeInteger(ticket?.sequence)||ticket.sequence<1||!/^[0-9a-f]{64}$/.test(ticket?.nonce_fp||''))refuser('JOURNAL_INTENTION');
   journal.autoriserIO('PROBE_PUBLIC',trace,ticket);budget.appel();const timeout=garde();
   return await new Promise((resolve,reject)=>{
    const req=https.request({protocol:'https:',hostname:u.hostname,port:443,path:u.pathname+u.search,method:'GET',headers:{},agent:false,rejectUnauthorized:true,signal:AbortSignal.timeout(timeout)},res=>{
     actifs.add(res);res.once('close',()=>actifs.delete(res));res.on('error',()=>{});
     try{garde();}catch(e){res.destroy();reject(e);return;}
     const location=res.headers.location;if(location!==undefined&&(typeof location!=='string'||Buffer.byteLength(location)>16384)){res.destroy();reject(Object.assign(Error('SONDE_FORME'),{code:'SONDE_FORME'}));return;}
     let lu=false;
     resolve({status:res.statusCode,location,
      annuler(){res.destroy();req.destroy();},
      async lireErreurBornee(capOctets){
       if(lu||capOctets!==4096||![400,403].includes(res.statusCode)){res.destroy();refuser('SONDE_FORME');}lu=true;
       if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.destroy();refuser('SONDE_FORME');}
       const chunks=[];let n=0;try{for await(const b of res){garde();budget.lire(b.length);n+=b.length;if(n>capOctets)refuser('SONDE_BORNE');chunks.push(b);}garde();return Buffer.concat(chunks);}finally{res.destroy();req.destroy();}
      }});
    });actifs.add(req);req.once('close',()=>actifs.delete(req));req.on('error',()=>reject(Object.assign(Error('HTTP_IO'),{code:'HTTP_IO'})));req.end();
   });
  }
 };
}
