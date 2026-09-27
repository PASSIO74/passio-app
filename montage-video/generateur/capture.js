const {start,Rec}=require("./lib");
const which=process.argv[2];
(async()=>{const {b,page}=await start();const O=__dirname+"/frames/";
const wait=ms=>page.waitForTimeout(ms);
const byText=async(scope,re)=>page.evaluateHandle(([sc,src])=>{const r=new RegExp(src);return [...document.querySelectorAll(sc)].find(e=>r.test(e.textContent)&&e.offsetParent)},[scope,re.source]);
const tapHandle=async(r,hnd,after)=>{const bb=await hnd.asElement().boundingBox();await r.tap(bb.x+bb.width/2,bb.y+bb.height/2,after);};
try{
if(!which||which==="share"){
  const r=new Rec(page,O+"share");
  await r.hold(0.8);
  await r.tap(195,812,()=>page.mouse.click(195,815));
  await wait(500);await r.hold(0.7);
  await r.tapEl('[data-v2-create="post"]',()=>page.click('[data-v2-create="post"]'));
  const sel=await page.evaluate(()=>{const t=[...document.querySelectorAll('#screen-studio textarea')].find(e=>e.offsetParent);if(t&&!t.id)t.id="__ta";return t?"#"+t.id:null});
  console.log("textarea",sel);
  await r.hold(0.3);
  await r.type(sel,"Première jam avec le groupe ce soir 🎸 Qui connaît un bon spot pour jouer en plein air à Lyon ?",22);
  await r.hold(0.6);
  const addp=await byText('#screen-studio button','Ajouter une photo');
  await tapHandle(r,addp,()=>page.setInputFiles('#photoInput',__dirname+'/pool/p3.jpg'));
  await wait(800);await page.evaluate(()=>document.querySelector('#appMain').scrollTop=0);
  await r.hold(0.8);
  const pub=await byText('#screen-studio button','^\\s*Publier\\s*$');
  const bb=await pub.asElement().boundingBox();console.log("pub",JSON.stringify(bb));
  const pb=await page.evaluate(()=>{const b=[...document.querySelectorAll('#screen-studio button')].filter(e=>/^\s*Publier\s*$/.test(e.textContent)&&e.offsetParent).pop();if(!b)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return r.y+r.height/2});
  await r.hold(0.5);
  await r.tap(195,pb||600,()=>page.evaluate(()=>publishPost()));
  await page.evaluate(()=>document.querySelector('#appMain').scrollTop=0);await wait(600);
  await r.hold(1.6);
  console.log("share",r.save("share"));
}
if(!which||which==="discover"){
  const r=new Rec(page,O+"discover");
  await page.evaluate(()=>goTo('feed'));await page.evaluate(()=>document.querySelector('#appMain').scrollTop=0);await wait(500);
  await r.hold(0.4);
  await r.scroll('#appMain',520,1.6);
  await r.hold(0.3);
  const like=await page.evaluateHandle(()=>[...document.querySelectorAll('.post-actions button, .post-actions [onclick]')].find(e=>{const b=e.getBoundingClientRect();return b.top>250&&b.top<700}));
  if(like.asElement()) await tapHandle(r,like,()=>like.evaluate(e=>e.click()));
  await r.hold(0.4);
  await r.scroll('#appMain',1300,3.2);
  await r.hold(0.5);
  console.log("discover",r.save("discover"));
}
if(!which||which==="irl"){
  const r=new Rec(page,O+"irl");
  await page.evaluate(()=>{goTo('irl');document.querySelector('#appMain').scrollTop=0});await wait(900);
  await r.hold(0.8);
  await r.scroll('#appMain',260,1.2);await r.hold(0.3);
  const det=await page.evaluateHandle(()=>{const c=[...document.querySelectorAll('#screen-irl *')].find(e=>/Jam session guitaristes/.test(e.textContent)&&e.children.length===0);let n=c;for(let i=0;i<8&&n;i++){n=n.parentElement;const d=n&&[...n.querySelectorAll('button')].find(b=>/Détails/.test(b.textContent));if(d)return d;}return null});
  await tapHandle(r,det,()=>det.evaluate(e=>e.click()));
  await r.hold(1.0);
  const pr=await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].filter(e=>/Je participe/.test(e.textContent)&&e.getBoundingClientRect().top>600&&e.getBoundingClientRect().width>100)[0];if(!b)return null;b.id="__part";const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]});
  console.log("part",pr);
  await r.tap(pr[0],pr[1],()=>page.evaluate(()=>document.getElementById('__part').click()));
  await wait(500);await r.hold(1.2);
  await page.evaluate(()=>{try{closeCurrentOverlay()}catch(e){}});await wait(400);
  await page.evaluate(()=>{goTo('irl');document.querySelector('#appMain').scrollTop=0});await wait(600);
  await r.hold(0.5);
  await r.tap(195,812,()=>page.mouse.click(195,815));await wait(500);await r.hold(0.6);
  await r.tapEl('[data-v2-create="irl"]',()=>page.click('[data-v2-create="irl"]'));
  await wait(600);await r.hold(0.5);
  const ti=await page.evaluate(()=>{const t=[...document.querySelectorAll('.modal input[type=text], .modal input:not([type])')].find(e=>e.offsetParent&&/Jam|Ex/.test(e.placeholder||""));if(t&&!t.id)t.id="__ti";return t?"#"+t.id:null});
  console.log("title",ti);
  const bb=await page.locator(ti).boundingBox();await r.tap(bb.x+60,bb.y+bb.height/2);
  await r.type(ti,"Pique-nique guitare au parc de la Tête d'Or",20);
  await r.hold(1.2);
  console.log("irl",r.save("irl"));
  await page.evaluate(()=>{try{closeModal()}catch(e){}});
}
if(!which||which==="msg"){
  const r=new Rec(page,O+"msg");
  await page.evaluate(()=>{try{closeModal()}catch(e){};goTo('messages')});await wait(800);
  await r.hold(0.7);
  const c=await page.evaluateHandle(()=>[...document.querySelectorAll('#screen-messages *')].find(e=>e.children.length===0&&/^Léa Moreau$/.test(e.textContent.trim())&&e.offsetParent));
  await tapHandle(r,c,()=>c.evaluate(e=>e.click()));
  await wait(900);await r.hold(0.8);
  await r.tapEl('#convFpInput');
  await r.type('#convFpInput',"Carrément ! Samedi 18h au parc ?",20);
  await r.hold(0.3);
  await r.tapEl('#convFpSendBtn',()=>page.evaluate(()=>document.getElementById('convFpSendBtn').click()));
  await wait(800);await r.hold(1.8);
  console.log("msg",r.save("msg"));
}
}catch(e){console.log("ERR",e.message);await page.screenshot({path:"err.png"});}
await b.close();})();
