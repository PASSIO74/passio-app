// Règles CSS dupliquées dans styles.css : même sélecteur déclaré plusieurs fois (hors @media distincts),
// et blocs de déclarations strictement identiques partagés par ≥3 sélecteurs différents.
const fs=require('fs');const css=fs.readFileSync('/home/user/passio-app/styles.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const rules=[];let i=0,ctx=[];
function norm(s){return s.replace(/\s+/g,' ').trim();}
while(i<css.length){const o=css.indexOf('{',i);if(o<0)break;const sel=norm(css.slice(i,o));
 if(sel.startsWith('@media')||sel.startsWith('@supports')||sel.startsWith('@keyframes')||sel.startsWith('@container')){ctx.push(sel);i=o+1;continue;}
 // trouver la fermeture
 const c=css.indexOf('}',o);const body=norm(css.slice(o+1,c));rules.push({sel,body,ctx:ctx.join(' ')});i=c+1;
 // fermer les @ contexts
 while(true){const rest=css.slice(i).match(/^\s*\}/);if(rest&&ctx.length){ctx.pop();i+=rest[0].length;}else break;}
}
const bySel={};for(const r of rules){const k=r.ctx+'|'+r.sel;(bySel[k]=bySel[k]||[]).push(r.body);}
const dupSel=Object.entries(bySel).filter(([k,v])=>v.length>1);
const identical=dupSel.filter(([k,v])=>new Set(v).size<v.length);
const byBody={};for(const r of rules){if(r.body.length<40)continue;(byBody[r.body]=byBody[r.body]||new Set()).add(r.ctx+'|'+r.sel);}
const sharedBodies=Object.entries(byBody).filter(([b,s])=>s.size>=3).sort((a,b)=>b[1].size-a[1].size);
const out={regles:rules.length,selecteursRedeclares:dupSel.length,selecteursRedeclaresCorpsIdentique:identical.length,exemplesCorpsIdentique:identical.slice(0,15).map(([k,v])=>k+' ×'+v.length),corpsPartagesPar3SelecteursOuPlus:sharedBodies.length,exemplesCorpsPartages:sharedBodies.slice(0,10).map(([b,s])=>({corps:b.slice(0,90),selecteurs:[...s].slice(0,6)})),top20Redeclares:dupSel.sort((a,b)=>b[1].length-a[1].length).slice(0,20).map(([k,v])=>k+' ×'+v.length)};
fs.writeFileSync(__dirname+'/css-doublons.json',JSON.stringify(out,null,1));
console.log(JSON.stringify({regles:out.regles,selecteursRedeclares:out.selecteursRedeclares,corpsIdentique:out.selecteursRedeclaresCorpsIdentique,corpsPartages3plus:out.corpsPartagesPar3SelecteursOuPlus}));
console.log('top redéclarés:\n'+out.top20Redeclares.join('\n'));console.log('corps identiques:\n'+out.exemplesCorpsIdentique.join('\n'));
