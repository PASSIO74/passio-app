import net from 'node:net';
import {APERCU,CIBLE,HEAD,fingerprint} from './parcours.mjs';

function ok(v,cat){if(!v)throw Error(cat);}
// Aucune sortie du processus navigateur. Seul le répartiteur révisé de l'opérateur peut servir une route via fulfill.
// Le proxy local rejette aussi les keepalive de départ qui échappent aux routes Playwright.
export async function navigateurConfine(chromium,{artifact,barrier,actor,token,budget,perform,observer=()=>{}}){
  ok(artifact?.head===HEAD && artifact.origin===APERCU && artifact.files instanceof Map && artifact.files.has('/'),'ARTEFACT');
  const sockets=new Set();
  const proxy=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.destroy();});
  await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen({host:'127.0.0.1',port:0},resolve);});
  let browser,ctx,closed=false,first=null;
  function signaler(observation){const o=Object.freeze({...observation});if(o.cause!=='OK'&&first===null)first=o;observer(o);}
  async function close(){
    if(closed)return;closed=true;
    try{await ctx?.close();}finally{
      try{await browser?.close();}finally{for(const s of sockets)s.destroy();await new Promise(resolve=>proxy.close(resolve));}
    }
  }
  try{
    const port=proxy.address().port;
    const env=Object.fromEntries(['SystemRoot','WINDIR','SystemDrive','COMSPEC','PATHEXT','TEMP','TMP','LOCALAPPDATA','HOME','TMPDIR','LANG','PLAYWRIGHT_BROWSERS_PATH','PROGRAMFILES','PROGRAMFILES(X86)']
      .filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]));
    browser=await chromium.launch({headless:true,env,proxy:{server:'http://127.0.0.1:'+port,bypass:'<-loopback>'},
      args:['--disable-background-networking','--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});
    ctx=await browser.newContext({serviceWorkers:'block',acceptDownloads:false,permissions:[],ignoreHTTPSErrors:false});
    await ctx.routeWebSocket('**/*',ws=>ws.close());
    await ctx.route('**/*',async route=>{
      const r=route.request(),u=new URL(r.url());
      const action=u.origin===APERCU&&/^\/private-media\/(posts|stories)\//.test(u.pathname)?'lecture_media':u.origin!==CIBLE?'autre':u.pathname==='/rest/v1/rpc/media_reserver'?'reservation':u.pathname.startsWith('/storage/v1/object/content-protected/')?'depot':u.pathname==='/rest/v1/posts'||u.pathname==='/rest/v1/stories'?'parent':'autre';
      let cause='TRANSPORT',http=null,cookie='INCONNU',cors='INCONNU',bodyLength=null,responseLength=null;
      const emit=(stage,why)=>{if(action!=='autre'&&r.method()==='POST')signaler({action,stage,cause:why,http,cookie,cors,octets_requete:bodyLength,octets_reponse:responseLength});};
      try{
        const item=artifact.files.get(u.pathname+u.search)||(u.search.match(/^\?v=[a-zA-Z0-9_.-]{1,85}$/)&&artifact.files.get(u.pathname));
        if(u.origin===APERCU&&r.method()==='GET'&&item&&!u.pathname.startsWith('/private-media/')){
          ok(Buffer.isBuffer(item.bytes)&&fingerprint(item.bytes)===item.sha,'ARTEFACT_OCTETS');
          return await route.fulfill({status:200,headers:{'Content-Type':item.mime,'Cache-Control':'no-store'},body:item.bytes});
        }
        // Oblige aussi les pages secondaires à passer par une liste fermée : aucune navigation libre.
        ok(!r.isNavigationRequest()&&[APERCU,CIBLE].includes(u.origin),'ORIGINE_FERMEE');
        const init={url:r.url(),method:r.method(),headers:await r.allHeaders(),body:r.postDataBuffer()||Buffer.alloc(0),actor,token};
        bodyLength=init.body.length;cause='GARDE_REQUETE';const p=barrier.prepare(init);
        if(p.action==='vide_local')return await route.fulfill({status:200,contentType:'application/json',body:'[]'});
        if(p.action==='fermer'){emit('REQUETE','GARDE_REQUETE');return await route.abort('blockedbyclient');}
        const time=budget.reserver(p.action==='depot'?init.body.length:0);
        // Pas de transmission des headers navigateur arbitraires (Cookie, schéma PostgREST, override, proxy).
        const h=new Headers(init.headers),headers={};
        cause='COOKIE_REQUETE';ok(!h.has('cookie'),'COOKIE_REQUETE');
        for(const name of ['content-type','x-passio-media-read','x-upsert','range','cache-control'])if(h.has(name))headers[name]=h.get(name);
        if(u.origin===CIBLE){headers.apikey=artifact.anon;headers.origin=APERCU;if(p.action==='parent')headers.prefer='return=representation';}
        if(token)headers.authorization='Bearer '+token;
        cause='TRANSPORT';const out=await perform({url:init.url,method:init.method,headers,body:init.body,timeout:time,kind:p.action});
        http=Number.isInteger(out.status)&&out.status>=100&&out.status<=599?out.status:null;cause='TAILLE_REPONSE';responseLength=Buffer.isBuffer(out.bytes)?out.bytes.length:null;
        ok(Buffer.isBuffer(out.bytes)&&out.bytes.length<=1048576,'REPONSE_BORNEE');
        // Ces actions ont déjà validé l’acteur, la route, les identités, le corps et, pour le dépôt, les octets.
        const restOmit=u.origin===CIBLE&&(
          (p.action==='reservation'&&init.method==='POST'&&u.pathname==='/rest/v1/rpc/media_reserver'&&!u.search)||
          ((p.action==='profil_possede'||p.action==='projection_parent')&&init.method==='GET')||
          (p.action==='parent'&&init.method==='POST'&&u.pathname==='/rest/v1/'+p.kind));
        const depot=u.origin===CIBLE&&p.action==='depot'&&init.method==='POST'&&u.pathname==='/storage/v1/object/content-protected/'+actor+'/'+p.asset+'/original.png'&&!u.search;
        const rh=new Headers(Object.fromEntries(Object.keys(out.headers).filter(name=>!['set-cookie','set-cookie2'].includes(name.toLowerCase())).map(name=>[name,out.headers[name]])));
        const noms=Object.keys(out.headers),vals=restOmit?[]:noms.filter(n=>n.toLowerCase()==='set-cookie').flatMap(n=>out.headers[n]);
        const cf=vals.length===1&&typeof vals[0]==='string'&&/^__cf_bm=[^;,\r\n]+;/.test(vals[0])&&!/,(?:\s*)[\w-]+=/.test(vals[0])&&/;\s*Secure(?:\s*;|\s*$)/i.test(vals[0])&&/;\s*HttpOnly(?:\s*;|\s*$)/i.test(vals[0]);
        cookie=restOmit?'NON_TRANSMIS':!vals.length?'ABSENT':depot&&cf?'NON_TRANSMIS':'REFUSE';
        cors=rh.get('access-control-allow-origin')==='*'?'ETOILE':rh.get('access-control-allow-origin')===APERCU?'APERCU':rh.has('access-control-allow-origin')?'AUTRE':'ABSENT';
        cause='REDIRECTION';ok(!rh.has('location')&&!(out.status>=300&&out.status<400),'REDIRECTION');
        cause='COOKIE_REFUSE';ok((cookie==='NON_TRANSMIS'||cookie==='ABSENT')&&(restOmit||!noms.some(n=>n.toLowerCase()==='set-cookie2')),'COOKIE_REFUSE');cause='CORS';
        if(u.origin===APERCU){
          cause='CACHE';const cc=(rh.get('cache-control')||'').toLowerCase().split(',').map(x=>x.trim()).sort();
          ok(cc.join(',')==='no-store,private'&&rh.get('cdn-cache-control')?.toLowerCase()==='no-store'&&(!rh.has('netlify-cdn-cache-control')||rh.get('netlify-cdn-cache-control').toLowerCase()==='no-store'),'CACHE');
        }
        if(u.origin===CIBLE)ok(['*',APERCU].includes(rh.get('access-control-allow-origin')),'CORS');
        if(['reservation','parent','depot','utilisateur_fixture'].includes(p.action)){
          cause='STATUT_HTTP';ok(p.action==='depot'?[200,201].includes(out.status):out.status===(p.action==='parent'?201:200),'STATUT_HTTP');
          cause='JSON_INVALIDE';const value=p.action==='depot'?null:JSON.parse(out.bytes.toString('utf8'));
          cause='REPONSE_NON_CONFORME';barrier.acknowledge(p,out.status,value);
        }
        const included={};
        for(const name of ['cache-control','content-type','content-length','accept-ranges','content-range','vary','cdn-cache-control','netlify-cdn-cache-control','access-control-allow-origin','access-control-expose-headers'])
          if(rh.has(name))included[name]=rh.get(name);
        cause='REMETTRE_AU_NAVIGATEUR';await route.fulfill({status:out.status,headers:included,body:out.bytes});emit('LIVREE','OK');
      }catch{emit('REFUSEE',cause);await route.abort('failed').catch(()=>{});}
    });
    return {page:await ctx.newPage(),close,premierRefus:()=>first};
  }catch{await close();throw Error('NAVIGATEUR_FERME');}
}
