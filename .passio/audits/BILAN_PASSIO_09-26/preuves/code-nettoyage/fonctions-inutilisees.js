// Inventaire des fonctions top-level et window.X = ... dans js/*.js et index.html (scripts inline),
// puis comptage des références (mot entier) dans js/, index.html, sw.js, tests/ — hors déclaration.
const fs = require('fs'), path = require('path');
const ROOT = '/home/user/passio-app';
const jsFiles = fs.readdirSync(path.join(ROOT,'js')).filter(f=>f.endsWith('.js')).map(f=>'js/'+f);
const inlineScripts = [];
const idx = fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
idx.replace(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g,(m,body)=>{inlineScripts.push(body);return m;});
const decls = new Map(); // name -> {file, kind}
function scan(src, file){
  const lines = src.split('\n');
  lines.forEach((l,i)=>{
    let m;
    if ((m = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(l))) add(m[1], file, i+1, 'function');
    if ((m = /^\s*window\.([A-Za-z_$][\w$]*)\s*=(?!=)/.exec(l))) add(m[1], file, i+1, 'window');
  });
}
function add(n,f,l,k){ if(!decls.has(n)) decls.set(n,{file:f,line:l,kind:k,dups:0}); else decls.get(n).dups++; }
jsFiles.forEach(f=>scan(fs.readFileSync(path.join(ROOT,f),'utf8'), f));
inlineScripts.forEach((s,i)=>scan(s, 'index.html(inline#'+i+')'));
// corpus de recherche
function walk(d, acc){ for (const e of fs.readdirSync(d,{withFileTypes:true})){ const p=path.join(d,e.name); if(e.isDirectory()){ if(e.name==='node_modules'||e.name==='test-results'||e.name==='playwright-report') continue; walk(p,acc);} else if(/\.(js|html|mjs|cjs|json)$/.test(e.name)) acc.push(p);} return acc; }
const corpusApp = [...jsFiles.map(f=>path.join(ROOT,f)), path.join(ROOT,'index.html'), path.join(ROOT,'sw.js')];
const corpusTests = walk(path.join(ROOT,'tests'), []);
const corpusOther = [...walk(path.join(ROOT,'scripts'),[]), ...walk(path.join(ROOT,'dashboard'),[]).filter(p=>!p.includes('node_modules'))];
const texts = {};
for (const f of [...corpusApp,...corpusTests,...corpusOther]) texts[f]=fs.readFileSync(f,'utf8');
function countRefs(name, files){ let n=0; const re=new RegExp('(?<![\\w$.])'+name.replace(/\$/g,'\\$')+'(?![\\w$])','g'); const reDot=new RegExp('window\\.'+name.replace(/\$/g,'\\$')+'(?![\\w$])','g');
  for (const f of files){ const t=texts[f]; if(!t) continue; const m=t.match(re); const md=t.match(reDot); n += (m?m.length:0) + (md?md.length:0);} return n; }
const rows=[];
for (const [name,d] of decls){
  const app = countRefs(name, corpusApp) - 1 - d.dups; // moins les déclarations
  const tst = countRefs(name, corpusTests);
  const oth = countRefs(name, corpusOther);
  rows.push({name, file:d.file, line:d.line, kind:d.kind, refsApp:app, refsTests:tst, refsOther:oth});
}
rows.sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line);
const zeroApp = rows.filter(r=>r.refsApp<=0);
const zeroAll = zeroApp.filter(r=>r.refsTests===0 && r.refsOther===0);
const byFile = {};
for (const r of zeroApp){ byFile[r.file]=(byFile[r.file]||0)+1; }
const out = { total: rows.length, zeroRefsHorsTests: zeroApp.length, zeroRefsToutCourt: zeroAll.length, parFichier_zeroHorsTests: byFile, zeroRefsHorsTests_liste: zeroApp.map(r=>`${r.file}:${r.line} ${r.name} (tests=${r.refsTests}, scripts/dashboard=${r.refsOther})`), zeroRefsToutCourt_liste: zeroAll.map(r=>`${r.file}:${r.line} ${r.name}`) };
fs.writeFileSync(path.join(__dirname,'fonctions-inutilisees.json'), JSON.stringify(out,null,1));
console.log('total déclarations:', out.total, '| 0 réf hors tests (app+index+sw):', out.zeroRefsHorsTests, '| 0 réf tout court:', out.zeroRefsToutCourt);
console.log('par fichier (0 réf hors tests):', JSON.stringify(byFile));
