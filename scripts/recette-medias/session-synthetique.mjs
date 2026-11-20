import {CIBLE} from './parcours.mjs';
function ok(v){if(!v)throw Error('COMPTE_NON_POSSEDE');}
export const email=(id,run)=>'media_'+id+'_'+run+'@passio-e2e.test';
export function demandeCreation(id,password,RUN){
  ok(typeof password==='string'&&/^[A-Za-z0-9_-]{43}$/.test(password));
  return {url:CIBLE+'/auth/v1/admin/users',method:'POST',body:{id,email:email(id,RUN),password,email_confirm:true,app_metadata:{passio_recette:RUN}}};
}
export function verifierProprieteAuth(user,id,RUN){
  ok(user?.id===id&&user.email===email(id,RUN)&&user.app_metadata?.passio_recette===RUN&&typeof user.email_confirmed_at==='string'
    &&Number.isFinite(Date.parse(user.email_confirmed_at)));
}
export function demandeSession(id,password,RUN){
  return {url:CIBLE+'/auth/v1/token?grant_type=password',method:'POST',body:{email:email(id,RUN),password}};
}
export function verifierSession(session,id,RUN){
  verifierProprieteAuth(session?.user,id,RUN);
  ok(typeof session.access_token==='string'&&session.access_token.length<=8192&&typeof session.refresh_token==='string'
    &&session.refresh_token.length>0&&session.refresh_token.length<2048);
  const pieces=session.access_token.split('.');ok(pieces.length===3&&pieces.every(p=>/^[\w-]+$/.test(p)));
  let p;try{p=JSON.parse(Buffer.from(pieces[1],'base64url'));}catch{ok(false);}
  ok(p.sub===id&&p.role==='authenticated'&&p.aud==='authenticated'&&p.iss===CIBLE+'/auth/v1'&&typeof p.session_id==='string'
    &&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(p.session_id)&&Number.isSafeInteger(p.exp)&&p.exp>Date.now()/1000+300);
}
export async function amorcerPage(page,session,id,RUN){
  verifierSession(session,id,RUN);
  // Contexte Chromium éphémère, injection limitée au seul stockage SDK du sujet synthétique.
  // Ne pas appeler authChanged, forcer MY_UID ou remplacer le SDK : l’application doit adopter l’identité.
  await page.addInitScript(s=>{
    if(location.origin==='https://6afd9a462a4c24bdded6b1b7--passio-app.netlify.app')
      localStorage.setItem('sb-fcksxofaelcdmmifnwjo-auth-token',JSON.stringify(s));
  },session);
}
