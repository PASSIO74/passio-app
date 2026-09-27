const R="/home/user/passio-app/";
const fs=require("fs"), path=require("path");
const { chromium } = require(R+"node_modules/@playwright/test");
const { bootOnboarded } = require(R+"tests/e2e/app-helper.js");
const POOL=fs.readdirSync(__dirname+"/pool").sort((a,b)=>parseInt(a.slice(1))-parseInt(b.slice(1))).map(f=>fs.readFileSync(__dirname+"/pool/"+f));
function h(s){let x=0;for(const c of s)x=(x*31+c.charCodeAt(0))>>>0;return x;}
const ETAT={onboarded:true,landingSeen:true,tourSeen:true,user:{name:"Léa",birthYear:1996,isMinor:false,currentProfileId:"pp_0",
  profiles:[{id:"pp_0",name:"Léa",passion:"musique",emoji:"🎸",bio:"Guitare le soir, concerts le week-end",color:"#7c3aed",createdAt:1},
            {id:"pp_1",name:"Léa",passion:"photo",emoji:"📷",bio:"",color:"#7c3aed",createdAt:2},
            {id:"pp_2",name:"Léa",passion:"cuisine",emoji:"🍳",bio:"",color:"#7c3aed",createdAt:3}],
  drafts:[],likedPosts:[],joinedEvents:[],seenStories:[],customPassions:[],following:[],savedCarnets:[],general:{username:"Léa"},
  hintsSeen:{}},
  userPosts:[],userEvents:[],notifications:[],currentMood:"all",selectedFeedPassions:["musique","photo","cuisine"],feedFollowingOn:true};
const CSS=`.fr-tip,.hint-bubble,.passio-hint,#toastWrap,.toast,.toast-container,#pwaInstallBanner{display:none!important}
*{scrollbar-width:none!important} ::-webkit-scrollbar{display:none!important}
#__tap{position:fixed;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(124,58,237,.28);border:2px solid rgba(124,58,237,.7);pointer-events:none;z-index:2147483647;transform:scale(.4);opacity:0}`;
async function start(){
  const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const ctx=await b.newContext({baseURL:"http://localhost:8080",viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:"fr-FR",timezoneId:"Europe/Paris"});
  const page=await ctx.newPage();
  await page.route(/images\.unsplash\.com|pravatar|picsum/,r=>r.fulfill({status:200,contentType:"image/jpeg",body:(m=>m?POOL[+m[1]%POOL.length]:POOL[h(r.request().url())%POOL.length])(r.request().url().match(/__p(\d+)/))}));
  await page.addInitScript(()=>{localStorage.setItem("passio_first_run_experience_v1","0");});
  await bootOnboarded(page,null,1,{state:JSON.parse(JSON.stringify(ETAT))});
  await page.addStyleTag({content:CSS});
  await page.evaluate(()=>{
    const M={musique:[2,3,9,10],photo:[0,1,11,12],voyage:[0,11,12],sport:[0,1],art:[4,5,6,7,13],danse:[4,8],_:[9,10,11,12,0,2]};
    let k=0;const fix=(o,pas)=>{for(const key in o){const v=o[key];if(typeof v==="string"&&/unsplash/.test(v)){const l=M[pas]||M._;o[key]="https://images.unsplash.com/__p"+l[(k++)%l.length];}else if(v&&typeof v==="object"&&key!=="author")fix(v,pas);}};
    (state.seed.posts||[]).forEach(p=>fix(p,p.passion));(state.seed.events||[]).forEach(e=>fix(e,e.passion));(state.seed.stories||[]).forEach(e=>fix(e,e.passion));
    try{_lastHtml=null}catch(e){} try{_feedDomSig=null}catch(e){} try{renderFeed()}catch(e){}
  });
  await page.evaluate(()=>{window.toast=()=>{};window.supaSetEventRsvp=async()=>true;window.supaJoinEventConversation=async()=>true;window._estConvDemo=()=>false;window._sendTextToSupa=(c,m)=>{try{_setMsgStatus(c,m,'sent')}catch(e){}};window.admissionCanalPret=()=>false;const t=document.createElement("div");t.id="__tap";document.body.appendChild(t);document.querySelectorAll('.fr-tip').forEach(e=>e.remove());});
  return {b,page};
}
class Rec{
  constructor(page,dir){this.page=page;this.dir=dir;fs.mkdirSync(dir,{recursive:true});this.n=0;this.frames=[];this.last=null;}
  async shot(){const f=path.join(this.dir,String(this.n++).padStart(5,"0")+".jpg");await this.page.screenshot({path:f,type:"jpeg",quality:92});this.last=f;return f;}
  async hold(sec){const f=await this.shot();for(let i=0;i<Math.round(sec*30);i++)this.frames.push(f);}
  async still(sec){for(let i=0;i<Math.round(sec*30);i++)this.frames.push(this.last);}
  async anim(sec,fn){const N=Math.round(sec*30);for(let i=1;i<=N;i++){const t=i/N;const e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;await this.page.evaluate(fn,e);this.frames.push(await this.shot());}}
  async scroll(sel,dy,sec){const y0=await this.page.evaluate(s=>document.querySelector(s).scrollTop,sel);
    await this.anim(sec,new Function("e",`document.querySelector(${JSON.stringify(sel)}).scrollTop=${y0}+${dy}*e`));}
  async tap(x,y,after){ // x,y in CSS px
    for(const [s,o] of [[.4,.0],[.8,.9],[1,.9],[1.15,.6],[1.3,.0]]){
      await this.page.evaluate(([x,y,s,o])=>{const t=document.getElementById("__tap");t.style.left=x+"px";t.style.top=y+"px";t.style.transform=`scale(${s})`;t.style.opacity=o;},[x,y,s,o]);
      if(s===1&&after){await after();await this.page.waitForTimeout(700);}
      const f=await this.shot();this.frames.push(f,f);}
  }
  async tapEl(sel,after,dx=0,dy=0){const bb=await this.page.locator(sel).first().boundingBox();if(!bb)throw new Error("absent "+sel);await this.tap(bb.x+bb.width/2+dx,bb.y+bb.height/2+dy,after);}
  async type(sel,text,cps=18){for(let i=1;i<=text.length;i++){await this.page.evaluate(([s,v])=>{const el=document.querySelector(s);el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));},[sel,text.slice(0,i)]);const f=await this.shot();const k=Math.max(1,Math.round(30/cps));for(let j=0;j<k;j++)this.frames.push(f);}}
  save(name){fs.writeFileSync(path.join(__dirname,name+".json"),JSON.stringify(this.frames));return this.frames.length/30;}
}
module.exports={start,Rec};
