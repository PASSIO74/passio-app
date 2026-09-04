const fs=require('fs'),path=require('path');const R='/home/user/passio-app';
const files=fs.readdirSync(path.join(R,'js')).filter(f=>f.endsWith('.js'));
const out={catchVides:[],catchReturnSansLog:[],ecrituresSansError:[],thenSansCatch:[],typeofGuards:0,typeofGuardsParFichier:{}};
for(const f of files){const src=fs.readFileSync(path.join(R,'js',f),'utf8');const lines=src.split('\n');
 // catch vides: catch (e) {} ou catch {} sur une ligne ; et catch(e){ return ...; } sans console/diagLog dans les 2 lignes
 lines.forEach((l,i)=>{
  if(/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(l)) out.catchVides.push(`${f}:${i+1}`);
  else if(/catch\s*(\([^)]*\))?\s*\{\s*return\b[^;]*;?\s*\}?\s*$/.test(l) && !/console\.|diagLog|tel\.|log\(/.test(l)) out.catchReturnSansLog.push(`${f}:${i+1} ${l.trim().slice(0,80)}`);
  if(/typeof\s+[\w$.]+\s*===\s*["']function["']\s*(&&|\?)/.test(l)){out.typeofGuards++;out.typeofGuardsParFichier[f]=(out.typeofGuardsParFichier[f]||0)+1;}
  if(/\.then\(/.test(l) && !/\.catch\(/.test(l) && !/\.catch\(/.test(lines[i+1]||'') && !/\.catch\(/.test(lines[i+2]||'') && !/await /.test(l) && !/return /.test(l)) out.thenSansCatch.push(`${f}:${i+1}`);
 });
 // écritures Supabase : .from("x").insert/update/delete/upsert dont le résultat n'est pas capté ({ error }, data, const r, await ... puis r.error)
 const re=/([^\n]*)\.from\(\s*["'][\w]+["']\s*\)[\s\S]{0,200}?\.(insert|update|delete|upsert)\(/g;let m;
 while((m=re.exec(src))){const start=m.index;const lineNo=src.slice(0,start).split('\n').length;const stmtStart=src.lastIndexOf('\n',start-1)+1;
  // remonter jusqu'au début de l'instruction (max 3 lignes)
  let ctx=src.slice(Math.max(0,stmtStart-300),start+400);
  const before=src.slice(Math.max(0,start-250),start);
  const captured=/(const|let|var)\s*\{[^}]*error[^}]*\}\s*=\s*(await\s+)?$/.test(before.trimEnd())||/(const|let|var)\s+\w+\s*=\s*(await\s+)?$/.test(before.trimEnd())||/=\s*(await\s+)?$/.test(before.trimEnd())||/return\s+(await\s+)?$/.test(before.trimEnd())||/\(\s*(await\s+)?$/.test(before.trimEnd())||/\.then\(/.test(src.slice(start,start+600).split(';')[0]);
  if(!captured) out.ecrituresSansError.push(`${f}:${lineNo} ${src.slice(stmtStart,start+60).trim().split('\n').slice(-1)[0].slice(0,100)}`);
 }
}
fs.writeFileSync(path.join(__dirname,'erreurs-silencieuses.json'),JSON.stringify(out,null,1));
console.log('catch vides:',out.catchVides.length,'| catch{return} sans log:',out.catchReturnSansLog.length,'| écritures supabase sans lecture du résultat (approx):',out.ecrituresSansError.length,'| .then sans catch (approx):',out.thenSansCatch.length,'| gardes typeof===function:',out.typeofGuards);
console.log('typeof par fichier:',JSON.stringify(out.typeofGuardsParFichier));
console.log('\nÉCRITURES SANS LECTURE DU RÉSULTAT:\n'+out.ecrituresSansError.join('\n'));
console.log('\nCATCH VIDES (20 premiers):\n'+out.catchVides.slice(0,20).join('\n'));
