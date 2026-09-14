// AUTH-03 — aucun consentement n'est fabriqué sur le chemin Google « connexion ».
//
// LE DÉFAUT (contre-revue Astra, reproduit localement par le relecteur).
// L'écran d'authentification s'ouvre en mode CONNEXION ; la case de consentement
// n'est affichée qu'en mode INSCRIPTION ; or le bouton Google est le même dans
// les deux modes, et `onbGoogleAuth` mémorisait l'accord (`passio_oauth_cgu`,
// horodaté) dans les deux cas. Google crée le compte s'il n'existe pas : depuis
// l'écran de connexion, un compte NEUF naissait, et le retour posait sur lui
// (`_poserConsentementOAuth` → `user_metadata`) un consentement que personne
// n'avait donné.
//
// Ce que cette suite exige :
//   ① en mode connexion, rien n'est mémorisé (RÉINJECTION) ; en inscription
//      avec la case cochée, l'accord est mémorisé ;
//   ② au retour sans accord, un compte NEUF sans trace se voit DEMANDER le sien
//      (modale), rien n'est écrit sur le compte (RÉINJECTION : avant, rien
//      n'était demandé) ;
//   ③ un compte ANCIEN sans trace n'est pas sollicité (autre lot) ; un compte
//      qui a déjà une trace non plus ;
//   ④ accepter écrit la trace (version, date) et lève le rappel ; sans case
//      cochée, rien ne part ;
//   ⑤ UXO-07 : la promesse d'un « contrôle d'âge IA » a quitté le HTML.
// Aucune requête ne part : `supa.auth` est MUTÉ par `defineProperty`.
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const RACINE = path.join(__dirname, "..", "..");

const FAUX_AUTH = `
window.__updates = []; window.__toasts = []; window._supaReal = true;
window.toast = function (t) { window.__toasts.push(String(t)); };
window.__user = null;
Object.defineProperty(window.supa, "auth", { configurable: true, writable: true, value: {
  getUser: function () { return Promise.resolve({ data: { user: window.__user }, error: null }); },
  updateUser: function (o) { window.__updates.push(o); if (window.__user) window.__user.user_metadata = Object.assign({}, window.__user.user_metadata, o.data); return Promise.resolve({ data: { user: window.__user }, error: null }); },
  signInWithOAuth: function (o) { window.__oauth = o; return Promise.resolve({ error: { message: "banc : pas de départ" } }); },
  signOut: function () { return Promise.resolve({ error: null }); },
  getSession: function () { return Promise.resolve({ data: { session: null } }); },
  onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
} });
`;

async function banc(page) {
  await bootOnboarded(page);
  await page.evaluate((s) => { eval(s); }, FAUX_AUTH);
}

test.describe("AUTH-03 — consentement Google", () => {
  test("① connexion : rien n'est mémorisé ; inscription cochée : l'accord l'est", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      localStorage.setItem("passio_oauth_cgu", JSON.stringify({ cgu_version: "périmé" })); // une trace d'avant traîne
      switchAuthTab("signin");
      await onbGoogleAuth();
      const enConnexion = localStorage.getItem("passio_oauth_cgu");
      switchAuthTab("signup");
      document.getElementById("authConsent").checked = true;
      await onbGoogleAuth();
      const enInscription = localStorage.getItem("passio_oauth_cgu");
      return { enConnexion, enInscription: enInscription ? JSON.parse(enInscription) : null };
    });
    // RÉINJECTION : sur le code d'avant, enConnexion porte un accord horodaté.
    expect(r.enConnexion, "en connexion, aucun accord n'est mémorisé — même une trace ancienne est effacée").toBeNull();
    expect(r.enInscription && r.enInscription.cgu_version, "en inscription cochée, l'accord est mémorisé").toBeTruthy();
    expect(r.enInscription.cgu_accepted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("② retour sans accord, compte NEUF sans trace : on DEMANDE, on n'écrit rien", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      localStorage.removeItem("passio_oauth_cgu");
      localStorage.removeItem("passio_consentement_requis_v1");
      window.__user = { id: "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31", created_at: new Date(Date.now() - 20000).toISOString(), user_metadata: {} };
      const pose = await _poserConsentementOAuth();
      await new Promise((r) => setTimeout(r, 900));
      return { pose, updates: window.__updates.length, requis: localStorage.getItem("passio_consentement_requis_v1"),
               modale: !!document.getElementById("consentRequisCase") && document.getElementById("modalBackdrop").classList.contains("active") };
    });
    expect(r.pose).toBe(false);
    // RÉINJECTION : sur le code d'avant, rien n'est demandé (requis = null, aucune modale).
    expect(r.updates, "rien n'est écrit sur le compte sans réponse").toBe(0);
    expect(r.requis).toBe("1");
    expect(r.modale, "la modale de consentement est à l'écran").toBe(true);
  });

  test("③ compte ancien sans trace, ou compte déjà tracé : pas de sollicitation", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      localStorage.removeItem("passio_oauth_cgu"); localStorage.removeItem("passio_consentement_requis_v1");
      window.__user = { id: "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31", created_at: "2026-09-01T10:00:00Z", user_metadata: {} };
      await _poserConsentementOAuth();
      const ancien = localStorage.getItem("passio_consentement_requis_v1");
      window.__user = { id: "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31", created_at: new Date().toISOString(), user_metadata: { cgu_accepted_at: "2026-09-14T08:00:00Z" } };
      await _poserConsentementOAuth();
      const trace = localStorage.getItem("passio_consentement_requis_v1");
      return { ancien, trace, updates: window.__updates.length };
    });
    expect(r.ancien).toBeNull();
    expect(r.trace).toBeNull();
    expect(r.updates).toBe(0);
  });

  test("④ accepter écrit la trace et lève le rappel ; sans case, rien ne part", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      localStorage.setItem("passio_consentement_requis_v1", "1");
      window.__user = { id: "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31", created_at: new Date().toISOString(), user_metadata: {} };
      ouvrirConsentementRequis();
      const sansCase = await accepterConsentementRequis();
      const msgSansCase = document.getElementById("consentRequisMsg").textContent;
      const updatesSansCase = window.__updates.length;
      document.getElementById("consentRequisCase").checked = true;
      const avecCase = await accepterConsentementRequis();
      return { sansCase, msgSansCase, updatesSansCase, avecCase, updates: window.__updates,
               requis: localStorage.getItem("passio_consentement_requis_v1"), local: state.user.cgu,
               ferme: !document.getElementById("modalBackdrop").classList.contains("active") };
    });
    expect(r.sansCase).toBe(false);
    expect(r.msgSansCase).toMatch(/Coche la case/);
    expect(r.updatesSansCase).toBe(0);
    expect(r.avecCase).toBe(true);
    expect(r.updates).toHaveLength(1);
    expect(r.updates[0].data.cgu_version).toBeTruthy();
    expect(r.updates[0].data.cgu_accepted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.requis).toBeNull();
    expect(r.local && r.local.version).toBe(r.updates[0].data.cgu_version);
    expect(r.ferme).toBe(true);
  });

  test("⑤ UXO-07 : plus de « contrôle d'âge IA » promis dans le HTML", async () => {
    const html = fs.readFileSync(path.join(RACINE, "index.html"), "utf8");
    const sansCommentaires = html.replace(/<!--[\s\S]*?-->/g, "");
    expect(sansCommentaires).not.toMatch(/contrôle d['’]âge IA/);
    expect(sansCommentaires).toMatch(/année de naissance est déclarative/);
  });
});
