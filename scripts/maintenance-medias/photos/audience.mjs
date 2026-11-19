const fail=()=>{throw new Error('ADMISSION_RETRAIT_REFUSEE');};
function ok(v){if(!v)fail();}
function keys(v,names){ok(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...names].sort().join('|'));}
function rows(a,n){ok(Array.isArray(a)&&a.length===n);return a;}
function unique(a,n){ok(new Set(a).size===n);}
function same(a,b){ok(a.length===b.length&&[...a].sort().every((v,i)=>v===[...b].sort()[i]));}
function utc(v){ok(typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v));const t=Date.parse(v);ok(Number.isFinite(t)&&new Date(t).toISOString()===v);return t;}
export function verifierAudience({refus,target,head,pins,a,u,routes,photos,start,end}){
  keys(refus,['cible','head','association_sha256','debut','fin','medias_ouverts','relais','anonymes','temoin_autorise']);
  const t0=utc(refus.debut),t1=utc(refus.fin);
  ok(refus.cible===target&&refus.head===head&&refus.association_sha256===pins.association&&refus.medias_ouverts===true&&refus.relais==='private-media'&&t0>=utc(a.completed_utc)&&t1>=t0&&t1-t0<=300000&&t1<=utc(u.completed_utc));
  const controles=rows(refus.anonymes,2);same(controles.map(x=>x.route_sha256),routes);
  for(const item of controles){keys(item,['route_sha256','utc','methode','statut','octets','anonyme']);ok(utc(item.utc)>=t0&&utc(item.utc)<=t1&&item.methode==='GET'&&item.statut===404&&item.octets===0&&item.anonyme===true);}
  const temoin=refus.temoin_autorise;keys(temoin,['route_sha256','utc','methode','statut','mime','sha256','session_ordinaire']);
  const photo=photos.find(p=>p.route_sha256===temoin.route_sha256);
  ok(photo&&temoin.session_ordinaire===true&&utc(temoin.utc)>=t0&&utc(temoin.utc)<=t1&&temoin.methode==='GET'&&temoin.statut===200&&['image/jpeg','image/png','image/webp','image/gif'].includes(temoin.mime)&&temoin.sha256===photo.sha256);
  // Cette lecture active de contrôle ne doit pas fabriquer un succès dans le relevé passif.
  ok(t1<start||t0>end);
}
