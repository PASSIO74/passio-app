const fs=require('fs'),zlib=require('zlib'),path=require('path');
const sets={ 'dist_brut (node scripts/build.js, avant minification CI)':'/home/user/passio-app/dist', 'dist_minifie (terser/clean-css/html-minifier-terser comme deploy.yml)':process.argv[2] };
const out={date:new Date().toISOString(),sha:'c8cb8e99',fichiers:{}};
for(const [k,d] of Object.entries(sets)){
  out.fichiers[k]={}; let tot={raw:0,gz:0,br:0};
  for(const f of ['index.html','app.js','styles.css','sw.js','data/passions-v1.json']){
    const b=fs.readFileSync(path.join(d,f));
    const gz=zlib.gzipSync(b,{level:9}).length, br=zlib.brotliCompressSync(b,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:11}}).length;
    out.fichiers[k][f]={raw:b.length,gzip9:gz,brotli11:br}; tot.raw+=b.length;tot.gz+=gz;tot.br+=br;
  }
  out.fichiers[k]['TOTAL (5 fichiers)']=tot;
  const boot=['index.html','app.js','styles.css'].reduce((a,f)=>{const x=out.fichiers[k][f];a.raw+=x.raw;a.gz+=x.gzip9;a.br+=x.brotli11;return a;},{raw:0,gz:0,br:0});
  out.fichiers[k]['BOOT (index+app+styles, sans JSON ni sw)']=boot;
}
fs.writeFileSync(process.argv[3],JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
