// Approximation : classes CSS déclarées dans styles.css (sélecteurs .foo) jamais mentionnées
// (mot entier) dans index.html, js/*.js, sw.js. Faux positifs possibles : classes construites
// dynamiquement ("v8-" + x), classes de bibliothèques (maplibregl-*, emoji-*), pseudo-états.
const fs=require('fs'),path=require('path');const R='/home/user/passio-app';
const css=fs.readFileSync(path.join(R,'styles.css'),'utf8');
// retirer les commentaires et le contenu des blocs { } pour ne garder que les sélecteurs
const noCom=css.replace(/\/\*[\s\S]*?\*\//g,'');
let sel='';let depth=0;for(const ch of noCom){if(ch==='{'){depth++;continue;}if(ch==='}'){depth--;continue;}if(depth===0)sel+=ch;else if(depth===1&&/[@]/.test(ch))sel+=ch;}
// dans les @media, les sélecteurs sont à depth 1 : on refait un passage en gardant depth<=1 hors déclarations
let sel2='';depth=0;let inDecl=false;
for(let i=0;i<noCom.length;i++){const ch=noCom[i];if(ch==='{'){depth++;continue;}if(ch==='}'){depth--;continue;}
 if(depth===0)sel2+=ch; else if(depth===1){ // soit déclarations d'une règle, soit sélecteurs dans @media
   sel2+=ch; } }
const classes=new Set();for(const m of sel2.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)){ if(!/^\d/.test(m[1])) classes.add(m[1]); }
// retirer les faux (nombres décimaux: "0.5" capturés comme ".5"? déjà filtré; propriétés dans @media: on tolère)
const corpus=[path.join(R,'index.html'),path.join(R,'sw.js'),...fs.readdirSync(path.join(R,'js')).map(f=>path.join(R,'js',f))].map(f=>fs.readFileSync(f,'utf8')).join('\n');
const unused=[];for(const c of classes){const re=new RegExp('(?<![\\w-])'+c.replace(/[-]/g,'\\-')+'(?![\\w-])');if(!re.test(corpus))unused.push(c);}
unused.sort();
// regroupement par préfixe
const pref={};for(const c of unused){const p=c.split('-')[0];pref[p]=(pref[p]||0)+1;}
const top=Object.entries(pref).sort((a,b)=>b[1]-a[1]).slice(0,40);
fs.writeFileSync(path.join(__dirname,'css-classes-sans-emetteur.json'),JSON.stringify({totalClasses:classes.size,sansEmetteur:unused.length,parPrefixe:top,liste:unused},null,1));
console.log('classes déclarées dans styles.css:',classes.size,'| jamais mentionnées dans index.html/js/sw.js:',unused.length);
console.log('préfixes les plus fréquents:',JSON.stringify(top.slice(0,25)));
