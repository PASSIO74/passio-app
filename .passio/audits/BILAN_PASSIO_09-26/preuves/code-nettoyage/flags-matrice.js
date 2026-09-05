const fs=require('fs'),path=require('path'),cp=require('child_process');const R='/home/user/passio-app';
const flags={
 'passio_ui_v2':'PASSIO_UI_V2','passio_ui_3':'PASSIO_UI_3','passio_ui_4b':'PASSIO_UI_4B','passio_ui_4a0':'PASSIO_UI_4A0','passio_ui_4a1':'PASSIO_UI_4A1','passio_ui_4a2':'PASSIO_UI_4A2','passio_ui_4a3':'PASSIO_UI_4A3','passio_ui_4a4':'PASSIO_UI_4A4','passio_ui_4a5':'PASSIO_UI_4A5','passio_ui_5':'PASSIO_UI_5','passio_ui_6':'PASSIO_UI_6','passio_ui_6a':'PASSIO_UI_6A','passio_ui_6b':'PASSIO_UI_6B','passio_ui_6c':'PASSIO_UI_6C','passio_ui_7':'PASSIO_UI_7','passio_ui_8':'PASSIO_UI_8',
 'passio_feed_rank':null,'passio_feed_window_v1':'PASSIO_FEED_WINDOW_V1','passio_feed_intents_v1':'PASSIO_FEED_INTENTS_V1','passio_feed_irl_bridge_v1':'PASSIO_FEED_IRL_BRIDGE_V1','passio_irl_proposal_v1':'PASSIO_IRL_PROPOSAL_V1','passio_first_run_experience_v1':'PASSIO_FIRST_RUN_V1','flat_passions_v1':'PASSIO_FLAT_PASSIONS','passio_passions_illimitees_v1':'PASSIO_PASSIONS_ILLIMITEES','passio_realtime_v2':'PASSIO_REALTIME_V2','passio_realtime_v3':'PASSIO_REALTIME_V3','passio_telemetry':'PASSIO_TELEMETRY_DEFAULT_ON','passio_debug':'PASSIO_DEBUG',null:'PASSIO_ONBOARDING_V2','passio_irl_map_peek':null,'passio_logo_variant':null};
function grepFiles(dir,re,ext){const out=new Set();(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()){if(/node_modules|test-results|playwright-report/.test(e.name))continue;walk(p);}else if(ext.test(e.name)&&re.test(fs.readFileSync(p,'utf8')))out.add(path.relative(R,p));}})(dir);return [...out];}
const rows=[];
for(const [ls,win] of Object.entries(flags)){const parts=[ls!=='null'?ls:null,win].filter(Boolean);const re=new RegExp(parts.map(p=>p.replace(/[$]/g,'\\$')).join('|'));
 const js=grepFiles(path.join(R,'js'),re,/\.js$/);const idx=re.test(fs.readFileSync(path.join(R,'index.html'),'utf8'));const tests=grepFiles(path.join(R,'tests','e2e'),re,/\.js$/);const docs=grepFiles(path.join(R,'docs'),re,/\.md$/).length+(re.test(fs.readFileSync(path.join(R,'CLAUDE.md'),'utf8'))?1:0);
 // sens : "0" coupe (enlever) ou "1" active (adhésion)
 let sens='?';const src=js.map(f=>fs.readFileSync(path.join(R,f),'utf8')).join('\n');
 if(ls!=='null'){const m0=new RegExp(ls+'["\']\\)\\s*===\\s*["\']0["\']').test(src)||new RegExp('getItem\\(["\']'+ls+'["\']\\)\\s*===\\s*["\']0').test(src)||new RegExp(ls+'[^\\n]{0,60}"0"').test(src);const m1=new RegExp(ls+'[^\\n]{0,60}"1"').test(src);sens=(m0&&m1)?'"0" coupe, "1" force':m0?'"0" coupe (enlever)':m1?'"1" active (adhésion)':'lecture brute';}
 // date d'introduction : premier commit mentionnant le drapeau dans js/
 let since='';try{since=cp.execSync(`git log --diff-filter=A --format=%cs -S '${parts[0]}' -- js | tail -1`,{cwd:R}).toString().trim();}catch(e){}
 rows.push({flag:parts.join(' / '),sens,lus_dans:js,index_html:idx,tests:tests.length,docs,premier_commit:since});
}
fs.writeFileSync(__dirname+'/flags-matrice.json',JSON.stringify(rows,null,1));
for(const r of rows)console.log(`${r.flag.padEnd(58)} ${r.sens.padEnd(22)} js:${r.lus_dans.length} idx:${r.index_html?1:0} tests:${String(r.tests).padStart(3)} docs:${String(r.docs).padStart(3)} depuis:${r.premier_commit}`);
