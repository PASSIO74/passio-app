import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const client=readFileSync(new URL('../../js/app-08-ui-modals-tour.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../../migrations/migration_realtime_budget_2026-11-16.sql',import.meta.url),'utf8');
function extraire(name){
 const re=new RegExp('^(?:async )?function '+name+'\\(', 'gm');
 const declarations=[...client.matchAll(re)];assert.equal(declarations.length,1,name);
 const debut=declarations[0].index;
 for(let fin=client.indexOf('\n}',debut);fin!==-1;fin=client.indexOf('\n}',fin+2)){
  const f=client.slice(debut,fin+2);try{new vm.Script('('+f+'\n)');return f;}catch(e){if(!(e instanceof SyntaxError))throw e;}
 }
 assert.fail('fonction incomplete : '+name);
}
const noms=['_rtLectureBudgetTrace','_rtLectureBudgetDelai','_rtLectureBudgetFile',
 '_rtLectureBudgetArmer','_rtLectureBudgetReporter','_rtLectureBudgetFin','supaMarkRead'];
const BUDGET={error:{code:'P0001',details:JSON.stringify({budget:'realtime',reessai_ms:1000})}};
function banc(reponses=[]){
 let temps=Date.parse('2026-11-16T12:00:00Z'),next=0;
 const timers=new Map(),requetes=[],traces=[];
 class DateBanc extends Date{constructor(...a){super(...(a.length?a:[temps]));}static now(){return temps;}}
 const c=vm.createContext({window:{_supaReal:true},MY_UID:'A',Date:DateBanc,diagLog:m=>traces.push(m),
  _compteAuthReel:()=>true,_identiteDivergeDeLaSession:()=>false,_convBrouillon:()=>false,
  _accuseLectureReparable:()=>false,estEchecReseau:e=>e?.code==='RESEAU',
  setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
  supa:{from:table=>({upsert:async payload=>{requetes.push({table,payload});const r=reponses.shift();return typeof r==='function'?await r():r||{error:null};}})}
 });
 vm.runInContext(noms.map(extraire).join('\n'),c);
 return {c,timers,requetes,traces,avancer:ms=>temps+=ms,async suite(){
  const [id,t]=timers.entries().next().value||[];assert.ok(t,'reprise planifiee');timers.delete(id);temps+=t.ms;
  t.fn();for(let i=0;i<8;i++)await Promise.resolve();
 }};
}
test('une lecture normale garde un seul upsert et aucune reprise',async()=>{
 const b=banc();await b.c.supaMarkRead('g');assert.equal(b.requetes.length,1);assert.equal(b.timers.size,0);assert.equal(b.traces.length,0);
});
test('le dernier instant vraiment lu est coalesce, jamais remplace par l’heure de reprise',async()=>{
 const b=banc([BUDGET]);await b.c.supaMarkRead('g');b.avancer(200);await b.c.supaMarkRead('g');
 assert.equal(b.requetes.length,1);assert.equal(b.timers.size,1);
 await b.suite();assert.equal(b.requetes.length,2);
 assert.equal(b.requetes[1].payload.last_read_at,'2026-11-16T12:00:00.200Z');
 assert.equal(b.requetes[1].payload.user_id,'A');assert.equal(b.timers.size,0);
});
test('une limite de diffusion ne tente jamais une reparation d’appartenance',async()=>{
 let reparations=0;const b=banc([BUDGET]);b.c._accuseLectureReparable=()=>{reparations++;return true;};
 await b.c.supaMarkRead('g');assert.equal(reparations,0);assert.equal(b.timers.size,1);
});
test('quatre reprises automatiques au plus puis une trace, sans rafale au prochain appel',async()=>{
 const b=banc(Array(6).fill(BUDGET));await b.c.supaMarkRead('g');
 for(let i=0;i<4;i++)await b.suite();
 assert.equal(b.requetes.length,5);assert.equal(b.timers.size,0);assert.ok(b.traces.some(x=>/reprise epuisee/.test(x)));
 await b.c.supaMarkRead('g');assert.equal(b.requetes.length,5);
 b.avancer(1001);await b.c.supaMarkRead('g');assert.equal(b.requetes.length,6);
});
test('changer de compte detruit la reprise avant toute requete',async()=>{
 const b=banc([BUDGET]);await b.c.supaMarkRead('g');b.c.MY_UID='B';await b.suite();
 assert.equal(b.requetes.length,1);assert.equal(Object.keys(b.c.window._rtLecturesBudget).length,0);
});
test('une identite divergente au moment de reprendre n’envoie rien',async()=>{
 const b=banc([BUDGET]);await b.c.supaMarkRead('g');b.c._identiteDivergeDeLaSession=()=>true;await b.suite();
 assert.equal(b.requetes.length,1);assert.equal(Object.keys(b.c.window._rtLecturesBudget).length,0);
});
test('une reponse ancienne ne supprime pas un dernier accuse deja en attente',async()=>{
 let rendreAncien;const b=banc([()=>new Promise(r=>rendreAncien=r),BUDGET]);
 const ancien=b.c.supaMarkRead('g');b.avancer(200);await b.c.supaMarkRead('g');
 rendreAncien({error:{code:'RESEAU'}});await ancien;assert.equal(b.timers.size,1);
 await b.suite();assert.equal(b.requetes.at(-1).payload.last_read_at,'2026-11-16T12:00:00.200Z');
});
test('une lecture plus recente pendant la reprise est envoyee apres le premier succes',async()=>{
 let rendre;const b=banc([BUDGET,()=>new Promise(r=>rendre=r)]);
 await b.c.supaMarkRead('g');await b.suite();b.avancer(300);await b.c.supaMarkRead('g');
 rendre({error:null});for(let i=0;i<8;i++)await Promise.resolve();assert.equal(b.timers.size,1);
 await b.suite();assert.equal(b.requetes.at(-1).payload.last_read_at,'2026-11-16T12:00:01.300Z');assert.equal(b.timers.size,0);
});
test('une panne pendant une reprise en vol ne bloque pas les prochaines lectures',async()=>{
 for(const leve of [false,true]){
  let rendre,rejeter;const b=banc([BUDGET,()=>new Promise((r,j)=>{rendre=r;rejeter=j;})]);
  await b.c.supaMarkRead('g');await b.suite();b.avancer(300);await b.c.supaMarkRead('g');
  if(leve)rejeter(Object.assign(new Error('reseau'),{code:'RESEAU'}));else rendre({error:{code:'RESEAU'}});
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(b.timers.size,0);await b.c.supaMarkRead('g');
  assert.equal(b.requetes.length,3);assert.equal(Object.keys(b.c.window._rtLecturesBudget).length,0);
 }
});
test('seule l’erreur budget structurée donne un temporisateur borne',async()=>{
 for(const erreur of [{code:'P0001',details:'pas du json'},{code:'P0001',details:'{"budget":"autre","reessai_ms":1000}'},
  {code:'42501',details:BUDGET.error.details},{code:'P0001',details:'{"budget":"realtime","reessai_ms":86400001}'}]){
  const b=banc([{error:erreur}]);await b.c.supaMarkRead('g');assert.equal(b.timers.size,0);
 }
});
test('le nombre de conversations en attente est borne et le refus de file est trace',async()=>{
 const b=banc(Array(65).fill(BUDGET));for(let i=0;i<65;i++)await b.c.supaMarkRead('g'+i);
 assert.equal(Object.keys(b.c.window._rtLecturesBudget).length,64);assert.equal(b.timers.size,64);
 assert.ok(b.traces.some(x=>/file pleine/.test(x)));
});
test('la migration ferme les droits internes et refuse le quota avant le savepoint de diffusion',()=>{
 assert.match(sql,/begin;[\s\S]*commit;/);assert.doesNotMatch(sql,/MESSAGE_AVANT|LECTURE_AVANT|MESSAGE_APRES|LECTURE_APRES/);
 assert.match(sql,/primary key\(compte,fenetre\)/);assert.match(sql,/references public\.profiles\(id\) on delete cascade/);
 assert.match(sql,/debut=greatest\(c.debut,excluded.debut\)/);
 assert.match(sql,/else interval '24 hours' end/);
 const lecture=sql.split('function public.diffuser_lecture()')[1].split('end $f$;')[0];
 assert.ok(lecture.indexOf('passio_realtime_budget.consommer')<lecture.indexOf('\n begin\n'));
 assert.match(sql,/revoke all on all functions in schema passio_realtime_budget from public,anon,authenticated,service_role/);
 assert.doesNotMatch(sql,/create policy|drop policy|disable row level security/i);
});
