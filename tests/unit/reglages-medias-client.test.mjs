import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const SOURCE=fs.readFileSync('js/reglages-distants.js','utf8');
function client() {
  const cache=new Map([['passio_reglages_distants_v1',JSON.stringify({recuLe:Date.now(),reglages:{mediasProteges:true}})]]);
  let lines=[], status=200, now=Date.now();const events=[];
  const window={PASSIO_REGLAGES_DISTANTS:true,PASSIO_SUPABASE:{url:'https://stage.test',anon:'public'},addEventListener(){},dispatchEvent(e){events.push(e);}};
  const document={readyState:'loading',hidden:false,addEventListener(){},getElementById(){return null;}};
  const storage={getItem(k){return cache.get(k) ?? null;},setItem(k,v){cache.set(k,String(v));},removeItem(k){cache.delete(k);}};
  const sandbox={window,document,location:{hostname:'stage.test',protocol:'https:'},localStorage:storage,sessionStorage:storage,Date:class extends Date{static now(){return now;}},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail;}},setTimeout(){return 1;},clearTimeout(){},fetch:async()=>({status,ok:status===200,json:async()=>lines})};
  vm.runInNewContext(SOURCE,sandbox);
  return {api:window.PassioReglages,events,cache,lines(v,s=200){lines=v;status=s;},advance(ms){now+=ms;}};
}
test('réglage médias client : seul le dernier résultat réseau valide compte, jamais le cache local',async()=>{
  const c=client();assert.equal(c.api.mediasProtegesActifs(),false);
  c.lines([{cle:'medias_proteges',valeur:{actif:true}}]);assert.equal(await c.api.rafraichir(true),true);assert.equal(c.api.mediasProtegesActifs(),true);
  assert.equal(c.events.at(-1).type,'passio:medias-proteges');assert.equal(c.events.at(-1).detail.actif,true);
  for(const value of c.cache.values()) assert.doesNotMatch(value,/mediasProteges/);
  c.advance(6*60*1000);assert.equal(c.api.mediasProtegesActifs(),false);
  c.lines([{cle:'medias_proteges',valeur:{actif:false}}]);await c.api.rafraichir(true);assert.equal(c.api.mediasProtegesActifs(),false);assert.equal(c.events.at(-1).detail.actif,false);
});
test('réglage médias malformé/absent ne réactive jamais une lecture',async()=>{
  for(const valeur of [{actif:'true'},{actif:true,extra:1},[],null]) {
    const c=client();c.lines([{cle:'medias_proteges',valeur}]);await c.api.rafraichir(true);assert.equal(c.api.mediasProtegesActifs(),false);
  }
  const c=client();c.lines([{cle:'medias_proteges',valeur:{actif:true}}]);await c.api.rafraichir(true);c.lines([],404);await c.api.rafraichir(true);assert.equal(c.api.mediasProtegesActifs(),false);assert.equal(c.events.at(-1).detail.actif,false);
});
test('pilotage mobile : absence bloque activation ; ligne validée propose le geste serveur exact',()=>{
  const source=fs.readFileSync('pilotage/pilotage.js','utf8');
  const begin=source.indexOf('  const NIVEAUX =');const end=source.indexOf('  // Un geste qui tombe PENDANT',begin);
  assert.ok(begin>=0&&end>begin);
  const cards=[];const document={createElement(){return {setAttribute(){},append(){}};}};
  const context={document,carte(title,label,text,colour){const card={title,label,text,colour,buttons:[]};cards.push(card);return card;},bouton(card,label,payload){card.buttons.push({label,payload});},actions(){return {append(){}};},ilYA(){return '';},erreur(){}};
  vm.runInNewContext(source.slice(begin,end)+';this.render=rendreProtection;',context);
  for(const mp of [undefined,{actif:true,disponible:false},{actif:false,disponible:true},{actif:true,disponible:true}]) {
    cards.length=0;context.render({append(){}},{medias_proteges:mp});const card=cards.find(x=>x.title==='Médias protégés');assert.ok(card);
    const available=mp?.disponible===true;assert.equal(card.buttons.length,available?1:0);
    if(available){const p=card.buttons[0].payload;assert.equal(p.action,'reglages');assert.equal(p.cle,'medias_proteges');assert.equal(p.valeur.actif,!mp.actif);}
  }
});
