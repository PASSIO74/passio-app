import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {APERCU,CIBLE,HEAD,fingerprint} from './parcours.mjs';
function ok(v){if(!v)throw Error('PREVIEW_NON_ATTESTEE');}
const mimes=new Map([['.html','text/html; charset=utf-8'],['.js','text/javascript; charset=utf-8'],['.css','text/css; charset=utf-8'],
  ['.png','image/png'],['.svg','image/svg+xml'],['.webp','image/webp'],['.ico','image/x-icon'],['.json','application/json'],
  ['.woff2','font/woff2'],['.woff','font/woff']]);
// L’empreinte attendue doit provenir du job GitHub protégé et figurer dans le gel de la tentative.
export function lireArtefact(dir,expected){
  ok(/^[a-f0-9]{64}$/.test(expected));const root=fs.realpathSync(dir);
  let total=0;const all=new Map();
  function read(rel){
    const p=path.join(root,rel);const st=fs.lstatSync(p);ok(!st.isSymbolicLink()&&fs.realpathSync(p)===p);
    if(st.isDirectory()){for(const name of fs.readdirSync(p))read(rel?rel+'/'+name:name);return;}
    ok(st.isFile()&&st.nlink===1&&st.size<=16*1048576&&all.size<2000);
    total+=st.size;ok(total<=128*1048576);
    const bytes=fs.readFileSync(p);all.set(rel,{bytes,sha:fingerprint(bytes),mime:mimes.get(path.extname(p))});
  }
  read('');
  const h=createHash('sha256');
  for(const name of [...all.keys()].sort())h.update(name).update('\0').update(all.get(name).sha).update('\n');
  ok(h.digest('hex')===expected);
  const release=JSON.parse(all.get('release.json').bytes);
  ok(release.commit===HEAD&&release.schema===1&&/^[a-f0-9]{12}$/.test(release.buildId));
  const index=all.get('index.html').bytes.toString('utf8');
  const cfg=[...index.matchAll(/window\.PASSIO_SUPABASE_CIBLE\s*=\s*(\{[^}]+\})/g)];
  ok(cfg.length===1);
  // Le minifieur canonique retire les guillemets des deux noms de propriétés. N'accepter
  // qu'un littéral de configuration avec deux chaînes simples dans l'ordre émis par le build.
  const literal=/^\{\s*(?:"url"|url)\s*:\s*"([^"\\]+)"\s*,\s*(?:"anon"|anon)\s*:\s*"([A-Za-z0-9_.-]+)"\s*\}$/.exec(cfg[0][1]);
  ok(literal);const [,url,anon]=literal;
  ok(url===CIBLE&&typeof anon==='string'&&anon.length>20&&anon.length<4096);
  const jwt=JSON.parse(Buffer.from(anon.split('.')[1],'base64url'));
  ok(jwt.ref==='fcksxofaelcdmmifnwjo'&&jwt.role==='anon');
  const files=new Map([['/',all.get('index.html')],['/release.json',all.get('release.json')]]);
  for(const [name,entry] of all)if(entry.mime&&!name.startsWith('pilotage/')&&name[0]!=='.'&&name!=='sw.js')files.set('/'+name,entry);
  const probes=new Set(['/','/release.json']);
  for(const m of index.matchAll(/["'](app\/(app-0\d[\w-]*\.js)\?v=[0-9a-f]+)["']\s*,\s*["'](sha384-[A-Za-z0-9+/]+={0,2})["']/g)){
    const u=new URL(m[1],APERCU);const entry=files.get(u.pathname);ok(entry&&'sha384-'+createHash('sha384').update(entry.bytes).digest('base64')===m[3]);
    const key=u.pathname+u.search;files.set(key,entry);probes.add(key);
  }
  ok(probes.size===11);
  return {head:HEAD,origin:APERCU,files,probes:[...probes],anon,empreinte:expected};
}
