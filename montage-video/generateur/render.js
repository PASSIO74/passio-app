const R="/home/user/passio-app/";const fs=require("fs");const {chromium}=require(R+"node_modules/@playwright/test");
const V=process.argv[2]==="v";const only=process.argv[3];
const W=V?1080:1920,H=V?1920:1080;
const load=n=>JSON.parse(fs.readFileSync(__dirname+"/"+n+".json"));
const shots={share:load("share"),discover:load("discover"),irl:load("irl"),msg:load("msg")};
const T={logo:3.4,phone:5.6};let t=T.phone;const segs=[];
for(const k of ["share","discover","irl","msg"]){const d=shots[k].length/30;segs.push({name:k,start:t,end:t+d,frames:shots[k].map(f=>"file://"+f)});t+=d;}
T.real=t;T.end=t+4.0;const DUR=T.end+4.0;
const S=Object.fromEntries(segs.map(s=>[s.name,s]));
const irlSplit=S.irl.start+5.3;
const texts=[
 {lab:"01 · Le fil",tit:"Partage tes passions.",sub:"Une photo, une vidéo, quelques mots : publie en quelques secondes, dans la bonne passion.",t0:S.share.start+0.2,t1:S.share.end-0.3},
 {lab:"01 · Le fil",tit:"Découvre celles des autres.",sub:"Ton fil réunit tes passions et les personnes que tu suis.",t0:S.discover.start+0.1,t1:S.discover.end-0.3},
 {lab:"02 · Rencontrer",tit:"Trouve des activités près de chez toi.",sub:"Jam, rando, atelier photo… rejoins-les en un geste.",t0:S.irl.start+0.1,t1:irlSplit},
 {lab:"02 · Rencontrer",tit:"Organise tes propres rencontres.",sub:"Choisis la passion, le lieu et l'heure : les passionnés viennent à toi.",t0:irlSplit+0.45,t1:S.irl.end-0.3},
 {lab:"03 · Messages",tit:"Échange avant de te retrouver.",sub:"Messages privés et groupes pour préparer la sortie.",t0:S.msg.start+0.1,t1:S.msg.end-0.4},
];
if(V)texts.forEach(x=>{x.tit=x.tit.replace(" près de chez toi","<br>près de chez toi")});
(async()=>{const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const page=await b.newPage({viewport:{width:W,height:H}});
await page.goto("file://"+__dirname+"/comp.html");await page.evaluate(async()=>{await Promise.all(["600","700","800"].map(w=>document.fonts.load(w+" 40px Manrope")));await document.fonts.ready;});
await page.evaluate(c=>window.setup(c),{W,H,vertical:V,T,segs,texts});
const out=__dirname+"/out_"+(V?"v":"h");fs.mkdirSync(out,{recursive:true});
const N=Math.round(DUR*30);console.log("duree",DUR.toFixed(2),"frames",N,JSON.stringify(T));
const list=only?only.split(",").map(Number):[...Array(N).keys()];
for(const i of list){await page.evaluate(t=>window.render(t),i/30);await page.screenshot({path:out+"/"+String(i).padStart(5,"0")+".jpg",type:"jpeg",quality:93});if(i%150==0)console.log(i);}
await b.close();})();
