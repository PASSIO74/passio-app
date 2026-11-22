import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import {verdictReponse} from '../../scripts/charge-verdict.mjs';
import {compteurHead, LIKES_VISIBLES} from '../../scripts/lib/charge-realiste.mjs';

const source = fs.readFileSync(new URL('../../scripts/charge-realiste.mjs', import.meta.url), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
const between = (s, start, end) => {
  assert.equal(s.split(start).length, 2, 'unique start');
  const i = s.indexOf(start), j = s.indexOf(end, i + start.length);
  assert.ok(j > i, 'end after start');
  return s.slice(i, j);
};

// Compile the exact nested request/stop implementations. No source substitutions,
// actual executor call, file credentials, sockets, global fetch or timers are used.
function requests(fetchImpl = async () => new Response('[{"id":"synthetic"}]')) {
  const timers = new Map(), measurements = [], activeControllers = new Set(), budget = [];
  let timerId = 0, now = 0, called = 0, lastSignal;
  const context = vm.createContext({
    AbortController, Buffer, verdictReponse, compteurHead,
    performance: {now: () => now},
    fetch: (...args) => { called++; lastSignal = args[1].signal; return fetchImpl(...args); },
    setTimeout: (fn, ms) => {const id = ++timerId; timers.set(id, {fn, ms}); return id;},
    clearTimeout: id => timers.delete(id),
    measurements, activeControllers, budget,
  });
  const motif = between(source, 'const motifSur =', 'export async function verifierPublicationLue');
  const stop = between(source, '  function stop(motif) {', '  const interruption =');
  const request = between(source, '  async function requete(', '  const rest =');
  vm.runInContext(`${motif}
    const base = 'https://synthetic.invalid', cleService = 'synthetic_service', cleAnon = 'synthetic_anon';
    const debut = Date.now(), actifs = new Set(), controleurs = activeControllers;
    const originesInterruption = new WeakMap(), mesures = measurements;
    let phase = 'mesure', arret = null, stage = {taille: 100, page: 20};
    const octets = x => Buffer.byteLength(x, 'utf8');
    function compter(q) { budget.push(q); }
    ${stop}
    ${request}
    globalThis.api = {requete, stop, setPhase: x => {phase = x;}, getArret: () => arret};
  `, context, {filename: 'exact-nested-charge-realiste.mjs'});
  return {
    ...context.api, measurements, budget,
    signal: () => lastSignal,
    calls: () => called,
    timers: () => [...timers.values()].map(t => t.ms),
    active: () => activeControllers.size,
    fire(ms = 12000) {
      now += ms;
      for (const [id, t] of [...timers]) if (t.ms === ms && timers.delete(id)) t.fn();
    },
  };
}
const pendingRequest = (h, options) => h.requete('fixture', '/synthetic', options)
  .then(value => ({value: plain(value)}), error => ({error: error.message}));
const abortingFetch = (_url, {signal}) => new Promise((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(new DOMException('synthetic PRIVATE example@example.test', 'AbortError')), {once:true});
});
function completed(h) {assert.equal(h.active(), 0); assert.deepEqual(h.timers(), []); assert.equal(h.measurements.length, 1); return plain(h.measurements[0]);}

test('deadline before headers is explicit; 12s and abort() reason are preserved', async () => {
  const h = requests( abortingFetch), p = pendingRequest(h);
  assert.deepEqual(h.timers(), [12000]); h.fire();
  assert.deepEqual(await p, {error: 'ERREUR_INTERNE_OU_RESEAU'});
  const m = completed(h);
  assert.equal(m.status, null); assert.equal(m.ms, 12000);
  assert.deepEqual(m.diagnosticTransport, {etape:'ATTENTE_ENTETES', interruption:'ECHEANCE_12_S', signalInterrompu:true});
  assert.equal(h.signal().reason.name, 'AbortError');
  assert.ok(!JSON.stringify(m).includes('example@example.test'));
});

test('campaign stop first wins over the pending deadline; no string abort reason', async () => {
  const h = requests( abortingFetch), p = pendingRequest(h);
  h.stop('INTERRUPTION'); h.fire(); await p;
  const m = completed(h);
  assert.equal(h.getArret(), 'INTERRUPTION');
  assert.deepEqual(m.diagnosticTransport, {etape:'ATTENTE_ENTETES', interruption:'ARRET_CAMPAGNE', signalInterrompu:true});
  assert.equal(h.signal().reason.name, 'AbortError');
});

test('deadline first remains the origin if campaign stop occurs before catch', async () => {
  const h = requests( abortingFetch), p = pendingRequest(h);
  h.fire(); h.stop('INTERRUPTION'); await p;
  assert.equal(completed(h).diagnosticTransport.interruption, 'ECHEANCE_12_S');
});

test('already stopped campaign refuses before fetch and identifies preparation', async () => {
  const h = requests(); h.stop('INTERRUPTION');
  assert.deepEqual(await pendingRequest(h), {error:'INTERRUPTION'});
  const m = completed(h); assert.equal(h.calls(), 0); assert.equal(h.budget.length, 0);
  assert.deepEqual(m.diagnosticTransport, {etape:'PREPARATION', interruption:'ARRET_CAMPAGNE', signalInterrompu:false});
});

test('body transport failure preserves received status and the body stage', async () => {
  const h = requests( async () => ({status:200,ok:true,body:{getReader:()=>({read:async()=>{throw new TypeError('synthetic PRIVATE raw error');}})}}));
  assert.deepEqual(await pendingRequest(h), {error:'ERREUR_INTERNE_OU_RESEAU'});
  const m = completed(h); assert.equal(m.status,200);
  assert.deepEqual(m.diagnosticTransport,{etape:'LECTURE_CORPS',interruption:'AUCUNE',signalInterrompu:false});
});

test('deadline during body read remains distinguishable from missing headers', async () => {
  let entered;
  const reading = new Promise(resolve=>{entered=resolve;});
  const h = requests( async (_url,{signal})=>({status:200,ok:true,body:{getReader:()=>({read:()=>{
    entered(); return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('synthetic','AbortError')),{once:true}));
  }})}}));
  const p = pendingRequest(h); await reading; h.fire(); await p;
  const m = completed(h); assert.equal(m.status,200);
  assert.deepEqual(m.diagnosticTransport,{etape:'LECTURE_CORPS',interruption:'ECHEANCE_12_S',signalInterrompu:true});
});

test('semantic validation and HTTP429 keep their old failure motives', async () => {
  for (const [status,body,motive] of [[200,'[]','CONTENU_INATTENDU'],[200,'not-json','CONTENU_INATTENDU'],[429,'{"message":"synthetic"}','HTTP_429']]) {
    const h = requests( async()=>new Response(body,{status}));
    assert.deepEqual(await pendingRequest(h),{error:motive}); const m=completed(h);
    assert.equal(m.status,status); assert.equal(m.motif,motive);
    assert.deepEqual(m.diagnosticTransport,{etape:'VALIDATION',interruption:'AUCUNE',signalInterrompu:false});
  }
});

test('HEAD and normal JSON success retain outcomes and do not acquire an error diagnostic', async () => {
  const head=requests(async()=>new Response(null,{status:200,headers:{'content-range':'0-0/3'}}));
  assert.deepEqual(await pendingRequest(head,{methode:'HEAD'}),{value:3});
  const hm=completed(head); assert.equal(hm.ok,true); assert.equal(hm.compteur,3); assert.ok(!Object.hasOwn(hm,'diagnosticTransport'));
  const get=requests(); assert.deepEqual(await pendingRequest(get),{value:[{id:'synthetic'}]});
  assert.ok(!Object.hasOwn(completed(get),'diagnosticTransport'));
});

test('added fields omit exception properties; the legacy motive remains unchanged', async () => {
  const poison={message:'SYNTHETIC_LEGACY_UPPERCASE', get name(){throw Error('NAME_READ');},get stack(){throw Error('STACK_READ');},url:'https://private.invalid/synthetic'};
  const h=requests(async()=>{throw poison;}); await pendingRequest(h); const m=completed(h);
  assert.equal(m.motif,'SYNTHETIC_LEGACY_UPPERCASE','legacy uppercase behavior is explicitly preserved');
  assert.deepEqual(m.diagnosticTransport,{etape:'ATTENTE_ENTETES',interruption:'AUCUNE',signalInterrompu:false});
  assert.deepEqual(Object.keys(m.diagnosticTransport).sort(),['etape','interruption','signalInterrompu']);
  assert.ok(!JSON.stringify(m.diagnosticTransport).includes('SYNTHETIC'));
});

// Exercise the real whole palier function with zero-duration local doubles.
// No parser/executor or operator resource action is invoked in this VM.
async function initialState(accounts,{warm=async()=>{}}={}) {
  const timers=new Map();let next=0;
  const context=vm.createContext({
    accounts,LIKES_VISIBLES,performance:{now:()=>0},
    setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;}, clearTimeout:id=>timers.delete(id),
    console:{log(){}},warm,
  });
  vm.runInContext(`
    const comptes=accounts,postsFixture=[{id:'post-a'},{id:'post-b'},{id:'post-c'}];
    const o={duree:0,graine:1,scenario:'lecture',profilRealtime:'sans-cdc',compteursCadence:'adaptative'};
    const controleurs=new Set(),mesures=[],rapport={paliers:[],framesRealtime:{}};
    let stage=null,phase='preparation',arret=null;
    const comptesPourPalier=(x,n)=>x.slice(0,n),reinitialiser=async()=>'synthetic_fingerprint';
    const connecter=async()=>{},fermerSockets=async()=>{},fil=warm;
    const changerPhase=x=>{phase=x;},sauvegarder=()=>{},sleep=async()=>{},decalageInitial=()=>0;
    const action=async()=>{throw Error('NO_MEASURED_ACTION_EXPECTED');},surveillerCompteurs=async()=>{};
    const statistiques=()=>({tentatives:0,succes:0,erreurs:0,p95Ms:null,p99Ms:null});
    const verdictAvecCompteurs=()=>({ok:true,validiteMesure:{ok:true}}),abonnements=()=>['a','b'],mixObserve=()=>({});
    ${between(source,'  async function palier(', '  async function nettoyer()')}
    globalThis.run=()=>palier(accounts.length,20,null);
  `,context,{filename:'exact-palier-charge-realiste.mjs'});
  const result=plain(await context.run()); assert.equal(timers.size,0);return result.compteursVisibles.etatInitial;
}

test('whole palier reports cold/partial/warm without reading or mutating Map values',async()=>{
  const makeMap=keys=>new Map(keys.map(k=>[k,{syntheticPrivate:'do not export'}]));
  const accounts=[{id:'actor-a'},{id:'actor-b',derniersComptes:makeMap(['post-a','post-b','post-c'])},
    {id:'actor-c',derniersComptes:makeMap(['post-a'])},{id:'actor-d',derniersComptes:makeMap(['old-card'])}];
  const before=accounts.map(c=>c.derniersComptes?[c.derniersComptes,[...c.derniersComptes]]:null);
  const state=await initialState(accounts);
  assert.deepEqual(state,{conservationEntrePaliers:true,froids:2,partiels:1,chauds:1});
  accounts.forEach((c,i)=>{if(before[i]){assert.equal(c.derniersComptes,before[i][0]);assert.deepEqual([...c.derniersComptes],before[i][1]);}else assert.ok(!Object.hasOwn(c,'derniersComptes'));});
  assert.ok(!JSON.stringify(state).includes('post-'));assert.ok(!JSON.stringify(state).includes('actor-'));assert.ok(!JSON.stringify(state).includes('syntheticPrivate'));
});

test('initial state is photographed after warmup, before counter loops',async()=>{
  const accounts=[{id:'actor',derniersComptes:new Map(['post-a','post-b','post-c'].map(k=>[k,1]))}];
  const state=await initialState(accounts,{warm:async c=>{c.postsVisibles=['different-a','different-b','different-c'];}});
  assert.equal(state.froids,1);assert.equal(state.chauds,0);assert.equal(accounts[0].derniersComptes.size,3);
});
