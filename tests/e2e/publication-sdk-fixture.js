// Injectée seulement par les suites qui exercent le vrai point de publication.
const UID_PUBLICATION = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
function preparerBootPublication(uid) {
  const ref = "aaaaaaaaaaaaaaaaaaaa";
  window.PASSIO_SUPABASE_CIBLE={url:"https://"+ref+".supabase.co",anon:"cle-de-banc"};
  const cle="sb-"+ref+"-auth-token";
  if(!localStorage.getItem(cle)) {
    const exp=Math.floor(Date.now()/1000)+3600;
    const b64 = objet=>btoa(JSON.stringify(objet)).replaceAll("=","").replaceAll("+","-").replaceAll("/","_");
    const jeton=[b64({alg:"HS256",typ:"JWT"}),b64({sub:uid,aud:"authenticated",role:"authenticated",exp}),"fixture"].join(".");
    localStorage.setItem(cle,JSON.stringify({access_token:jeton,refresh_token:"refresh-fixture-local",
      token_type:"bearer",expires_at:exp,expires_in:3600,user:{id:uid,aud:"authenticated",role:"authenticated"}}));
  }
}
function installerSessionPublication(uid) {
  const session = JSON.parse(localStorage.getItem("sb-aaaaaaaaaaaaaaaaaaaa-auth-token")||"null")
    || {user:{id:uid}, access_token:"fixture.publication.synthetic", expires_at:Math.floor(Date.now()/1000)+3600};
  if(session.user.id!==uid) throw Error("compte_fixture_divergent");
  // Même ordre que le callback Auth du client : émission SDK, puis adoption de l'acteur.
  passioMediaProteges.authChanged(session, "SIGNED_IN");
  MY_UID = uid;
  window.MY_UID = uid;
  const fixture = {
    uid, session,
    auth:{getSession:async () => ({data:{session:fixture.session},error:null})},
    ecriture(repondre) {
      let signal, reponse;
      return {
        select() { return this; },
        abortSignal(s) { signal=s; return this; },
        then(ok,ko) {
          if (!reponse) reponse=Promise.resolve().then(()=>{
            if (signal?.aborted) throw new DOMException("Annulé","AbortError");
            return repondre();
          });
          return reponse.then(ok,ko);
        },
      };
    },
  };
  window.__publicationSDK = fixture;
}

module.exports = {UID_PUBLICATION, preparerBootPublication, installerSessionPublication};
