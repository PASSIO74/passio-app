// ═══════════════════════════════════════════════════════════════════════════
// TÉLÉMÉTRIE — LA CHAÎNE INSCRIPTION → CONFIRMATION → CONNEXION SE VOIT
//
// Carte télémétrie-client du 2026-09-18 (LOT E, G2) : rien n'était émis à
// « compte créé, confirme ton e-mail », à « e-mail déjà utilisé », au renvoi
// du lien, à la confirmation, ni à la connexion réussie. Le compteur `signups`
// du pilotage comptait `signup`/`account_created`, que PERSONNE n'émettait.
// Pire : « Email not confirmed » est un 400 sur /auth/v1/token, marqué
// `refus_attendu` par le hook fetch et EXCLU des problèmes — une vague de
// testeurs bloqués à la confirmation était strictement invisible.
//
// Aucun compte n'est créé, aucun e-mail n'est envoyé, rien ne part vers la
// production : `supa.auth` est remplacé par des doubles (même levier que
// confirmation-email.spec.js — on MUTE l'objet, on ne le remplace pas), et les
// POST telemetry_events sont servis en 201 par une route.
//
// (2026-11-21, trou T6 de l'audit de surveillance) Les IMPASSES ont rejoint la
// chaîne : un service de connexion en 5xx, un e-mail qui ne part pas, une
// exception, « Mot de passe oublié ? », le départ vers Google, le nouveau mot
// de passe et le renvoi du lien en panne. Chacune laisse un signal en code
// fermé, et le texte à l'écran dit vrai — et se lit : cas ③ ter, ③ quater,
// ④ bis, ④ ter et ⑧ à ⑭.
// (Contre-revue du même jour) Le SDK qui ne se charge pas (⑭), la réponse
// illisible jouée par le VRAI SDK (③ quater), « pas de connexion internet »
// réservé à l'appareil hors ligne, la sortie Google sous condition à la
// récupération, et les effets de bord qui ne se déclenchent plus sous une
// panne (⑧ quater).
//
// Chaque cas nomme la MUTATION qui le rend rouge (éprouvées à l'écriture).
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");
const { sansDonneesDistantes } = require("./app-helper");

const SOURCE_APP02 = path.join(__dirname, "..", "..", "js", "app-02-state-utils.js");
const SOURCE_APP08 = path.join(__dirname, "..", "..", "js", "app-08-ui-modals-tour.js");

// Ouvre l'écran d'auth réel (landing → « Créer un compte »), pose les doubles
// `supa.auth` et la capture de `tel.action` / `tel.flush`.
// `opts.sdkCoupe` : le script du SDK ne se charge pas (coupure à la première
// visite, fichier absent après un déploiement). `supa` reste alors le client de
// repli d'app-08, et on ne pose AUCUN double : c'est lui qu'on éprouve.
async function ouvrirAuth(page, doubles = {}, opts = {}) {
  await sansDonneesDistantes(page);
  if (opts.sdkCoupe) await page.route("**/js/vendor/supabase-js-*.js", (route) => route.abort());
  await page.route("**/rest/v1/telemetry_events*", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: "[]" }));
  await page.addInitScript(([k, t]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_first_run_experience_v1", "0");
  }, [GATE_KEY, GATE_TOKEN]);
  // `?telemetry=1` : seul opt-in local — sans lui `flowStart` rend null et
  // les hooks ne sont pas installés ; on mesurerait le vide en se croyant vert.
  await page.goto("/index.html?telemetry=1");
  await page.waitForSelector("#landing.active", { timeout: 25000 });
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  // ⚠️ `!!supa` NE DIT PAS que le SDK est là : le client de repli est un objet
  // lui aussi. On attend l'état qu'on veut éprouver — le vrai client, ou son
  // absence — sinon les cas « vrai client » passeraient sur le repli sans le dire.
  await page.waitForFunction((coupe) => typeof onbDoAuth === "function" && typeof supa !== "undefined" && !!supa
    && (coupe ? !window._supaReal : window._supaReal === true), !!opts.sdkCoupe, { timeout: 25000 });
  await expect(page.locator("#authTabSignup")).toHaveClass(/active/);
  await page.evaluate((d) => {
    window.__auth = { signUp: [], signIn: [], resend: [] };
    if (!d.sdkCoupe) {
      supa.auth.signUp = async (args) => { window.__auth.signUp.push(args); return d.signUp; };
      supa.auth.signInWithPassword = async (args) => { window.__auth.signIn.push(args); return d.signIn; };
      supa.auth.resend = async (args) => { window.__auth.resend.push(args); return d.resend; };
    }
    // `window.tel` EST l'objet Telemetry (même référence que `tel`) : muter ses
    // méthodes intercepte à la source, sans dépendre du transport.
    window.__telCap = [];
    window.__flushCap = [];
    window.tel.action = function (name, meta) { window.__telCap.push({ name: name, meta: meta || {} }); };
    window.tel.flush = function (opts) { window.__flushCap.push(opts || {}); };
    // Les ERREURS prioritaires (`tel.error`) : seul leur NOM est gardé.
    window.__telErr = [];
    window.tel.error = function (name) { window.__telErr.push(String(name)); };
  }, {
    sdkCoupe: !!opts.sdkCoupe,
    signUp: doubles.signUp || { data: { user: null, session: null }, error: null },
    signIn: doubles.signIn || { data: { session: null }, error: null },
    resend: doubles.resend || { data: {}, error: null },
  });
}

async function saisirInscription(page, email = "nouvelle@exemple.com") {
  await page.locator("#authTabSignup").click();
  await page.locator("#authName").fill("Camille");
  await page.locator("#authBirthYear").fill("1995");
  await page.locator("#authEmail").fill(email);
  await page.locator("#authPassword").fill("motdepasse123");
  await page.locator("#authConsent").click();
}

async function remplirInscription(page, email = "nouvelle@exemple.com") {
  await saisirInscription(page, email);
  await page.locator("#authSubmitBtn").click();
}

async function remplirConnexion(page, email = "bloque@exemple.com") {
  await page.locator("#authTabSignin").click();
  await page.locator("#authEmail").fill(email);
  await page.locator("#authPassword").fill("motdepasse123");
  await page.locator("#authSubmitBtn").click();
}

const capture = (page) => page.evaluate(() => window.__telCap);
const noms = (evs) => evs.map((e) => e.name);
// Aucune meta ne doit porter une adresse : la clé `email` est refusée par le
// filtre, mais un « rc » ou un « kind » qui la citerait passerait — on vérifie
// la VALEUR, pas seulement la clé.
function sansAdresse(evs) {
  for (const e of evs) for (const v of Object.values(e.meta || {})) expect(String(v)).not.toContain("@");
}

const HORS_LIGNE = "Pas de connexion internet — réessaie quand tu es en ligne.";
// Requête jamais arrivée alors que l'appareil se dit EN LIGNE : coupure locale
// ou service injoignable, le texte doit être vrai dans les deux cas.
const INJOIGNABLE = "Impossible de joindre PASSIO pour l'instant. Vérifie ta connexion, puis réessaie dans un instant.";
const viderCapture = (page) => page.evaluate(() => { window.__telCap = []; window.__flushCap = []; window.__telErr = []; });
const attendreSignal = (page, nom) => page.waitForFunction(
  (n) => window.__telCap.some((e) => e.name === n), nom, { timeout: 10000 });

// Le message d'un e-mail qui ne part pas nomme « Continuer avec Google », « un
// peu plus bas ». Il n'est vrai que si ce bouton est PEINT dans le formulaire,
// avec ce libellé, et SOUS le message — mesuré, pas lu dans le balisage.
async function googleSousLeMessage(page) {
  return page.evaluate(() => {
    const m = document.getElementById("authMsg").getBoundingClientRect();
    const b = document.getElementById("authGoogleBtn");
    const g = b.getBoundingClientRect();
    const s = getComputedStyle(b);
    return {
      peint: g.width > 0 && g.height > 0 && s.display !== "none" && s.visibility !== "hidden",
      sous: m.height > 0 && g.top >= m.bottom,
      libelle: b.textContent.trim(),
    };
  });
}
const GOOGLE_ATTENDU = { peint: true, sous: true, libelle: "Continuer avec Google" };

test.describe("Télémétrie — inscription, confirmation, connexion", () => {

  // MUTATION : retirer `tel.action("auth_submitted", …)` ou
  // `tel.action("signup_pending_confirmation")` de onbDoAuth → rouge.
  test("① compte créé sans session : auth_submitted {kind:signup} puis signup_pending_confirmation, marqueur posé", async ({ page }) => {
    await ouvrirAuth(page, {
      signUp: { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null },
    });
    const avant = Date.now();
    await remplirInscription(page);
    await expect(page.locator("#authMsg")).toContainText("Compte créé");

    const evs = await capture(page);
    expect(noms(evs)).toEqual(["auth_submitted", "signup_pending_confirmation"]);
    expect(evs[0].meta).toEqual({ kind: "signup" });
    sansAdresse(evs);
    // Le marqueur est un HORODATAGE, rien d'autre — relu par boot/SIGNED_IN.
    const marqueur = await page.evaluate(() => localStorage.getItem("passio_signup_pending"));
    expect(Number(marqueur)).toBeGreaterThanOrEqual(avant);
    expect(Number(marqueur)).toBeLessThanOrEqual(Date.now());
  });

  // MUTATION : retirer `tel.action("signup_refused", { rc: "deja_utilise" })` → rouge.
  test("② e-mail déjà utilisé (identities vides, aucune erreur GoTrue) : signup_refused {rc:deja_utilise}", async ({ page }) => {
    await ouvrirAuth(page, {
      signUp: { data: { user: { id: "u1", identities: [] }, session: null }, error: null },
    });
    await remplirInscription(page, "deja@exemple.com");
    await expect(page.locator("#authMsg")).toContainText("déjà utilisé");

    const evs = await capture(page);
    expect(noms(evs)).toEqual(["auth_submitted", "signup_refused"]);
    expect(evs[1].meta).toEqual({ rc: "deja_utilise" });
    sansAdresse(evs);
    // Pas de marqueur : aucun compte n'a été créé.
    expect(await page.evaluate(() => localStorage.getItem("passio_signup_pending"))).toBeNull();
  });

  // MUTATION : retirer l'émission `signin_refused` dans la branche `if (error)`,
  // ou faire rendre "autre" à rcRefusAuth pour « Email not confirmed » → rouge.
  test("③ connexion refusée « Email not confirmed » : signin_refused {rc:non_confirme}, jamais le message", async ({ page }) => {
    await ouvrirAuth(page, {
      signIn: { data: { session: null }, error: { message: "Email not confirmed" } },
    });
    await remplirConnexion(page);
    await expect(page.locator("#authMsg")).toContainText("Confirme ton e-mail");

    const evs = await capture(page);
    expect(noms(evs)).toEqual(["auth_submitted", "signin_refused"]);
    expect(evs[0].meta).toEqual({ kind: "signin" });
    expect(evs[1].meta).toEqual({ rc: "non_confirme" });
    sansAdresse(evs);
  });

  test("③ bis rcRefusAuth : table des raisons fermée, déduite du message OU du code, sans le recopier", async ({ page }) => {
    await ouvrirAuth(page);
    const r = await page.evaluate(() => ({
      captcha: rcRefusAuth({ message: "captcha verification process failed" }),
      captchaCode: rcRefusAuth({ message: "x", code: "captcha_failed" }),
      banni: rcRefusAuth({ message: "User is banned" }),
      banniCode: rcRefusAuth({ message: "x", code: "user_banned" }),
      nonConfirme: rcRefusAuth({ message: "Email not confirmed" }),
      nonConfirmeCode: rcRefusAuth({ code: "email_not_confirmed" }),
      deja: rcRefusAuth({ message: "User already registered" }),
      dejaCode: rcRefusAuth({ code: "user_already_exists" }),
      quota: rcRefusAuth({ message: "Email rate limit exceeded" }),
      quotaCode: rcRefusAuth({ code: "over_email_send_rate_limit" }),
      mdp: rcRefusAuth({ message: "Invalid login credentials" }),
      mdpCode: rcRefusAuth({ code: "invalid_credentials" }),
      faible: rcRefusAuth({ message: "Password should contain at least one character of each", code: "weak_password" }),
      autre: rcRefusAuth({ message: "Database error saving new user" }),
      vide: rcRefusAuth(null),
      // Un message qui cite une adresse ne doit JAMAIS ressortir.
      adresse: rcRefusAuth({ message: "Unexpected failure for jean@exemple.com" }),
    }));
    expect(r).toEqual({
      captcha: "captcha", captchaCode: "captcha", banni: "banni", banniCode: "banni",
      nonConfirme: "non_confirme", nonConfirmeCode: "non_confirme",
      deja: "deja_utilise", dejaCode: "deja_utilise", quota: "quota", quotaCode: "quota",
      mdp: "mdp", mdpCode: "mdp", faible: "mdp", autre: "autre", vide: "autre", adresse: "autre",
    });
  });

  // Le SDK rend une `AuthRetryableFetchError` de statut 0 (requête jamais
  // arrivée) ou du statut HTTP (500…504, 520…530), dont le message est celui du
  // corps de la réponse. Les seize cas de ③ bis, sans statut, ne bougent pas.
  // MUTATIONS : retirer la ligne « serveur » → rouge ; retirer la ligne
  // « reseau » → rouge (chacune de ses deux moitiés a son cas) ; retirer la
  // ligne « envoi » → rouge ; déplacer les lignes de statut APRÈS le test
  // « mdp » → `serveurAvantTexte` rouge ; retirer la ligne `AuthUnknownError`
  // → `illisible` rouge ; retirer la ligne « sdk » → `sdk` rouge ; remettre
  // `AUTH_HORS_LIGNE` sans condition dans messagePanneAuth → rouge ; rendre
  // `AUTH_ENVOI_KO` sur la porte « recover » → rouge.
  test("③ ter rcRefusAuth lit le STATUT avant le texte : reseau, envoi, serveur — et captcha reste premier", async ({ page }) => {
    await ouvrirAuth(page);
    const r = await page.evaluate(() => ({
      reseauStatut0: rcRefusAuth({ name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 }),
      // Le statut 0 SUFFIT : le message n'a pas à ressembler à une coupure.
      reseauStatut0Muet: rcRefusAuth({ name: "AuthRetryableFetchError", message: "{}", status: 0 }),
      reseauSansStatut: rcRefusAuth({ message: "signal timed out" }),
      serveur500: rcRefusAuth({ message: "Database error saving new user", status: 500, code: "unexpected_failure" }),
      serveur503: rcRefusAuth({ name: "AuthRetryableFetchError", message: "Service Unavailable", status: 503 }),
      serveur504: rcRefusAuth({ name: "AuthRetryableFetchError", message: "HTTP 504", status: 504 }),
      serveurAvantTexte: rcRefusAuth({ message: "Password update failed", status: 500 }),
      captchaAvantStatut: rcRefusAuth({ message: "captcha protection: request disallowed", status: 500 }),
      mdp400: rcRefusAuth({ message: "Invalid login credentials", status: 400 }),
      quota429: rcRefusAuth({ message: "Email rate limit exceeded", status: 429 }),
      // L'e-mail qui ne part pas : les trois libellés connus de GoTrue.
      envoi: rcRefusAuth({ message: "Error sending confirmation email", status: 500 }),
      envoiAncien: rcRefusAuth({ message: "Error sending confirmation mail", status: 500 }),
      envoiRecuperation: rcRefusAuth({ message: "Error sending recovery email", status: 500 }),
      envoiAdresse: rcRefusAuth({ message: "Error sending confirmation email to jean@exemple.com", status: 500 }),
      // Le statut ET le texte : l'un sans l'autre n'est pas « envoi ».
      envoiSansStatut: rcRefusAuth({ message: "Error sending confirmation email" }),
      envoi400: rcRefusAuth({ message: "Error sending confirmation email", status: 400 }),
      // Réponse illisible hors de la liste du SDK (page HTML d'un pare-feu en
      // 403, 5xx hors liste) : `AuthUnknownError` SANS statut, message anglais.
      illisible: rcRefusAuth({ name: "AuthUnknownError", message: "Unexpected token '<', \"<html>Atte\"... is not valid JSON" }),
      // TÉMOIN : le même texte sous une autre classe reste un refus inconnu.
      illisibleTemoin: rcRefusAuth({ name: "AuthApiError", status: 400, message: "Unexpected token '<', \"<html>Atte\"... is not valid JSON" }),
    }));
    // SDK non chargé : lu sur l'ÉTAT, quel que soit le texte du client de repli —
    // et « captcha » reste premier.
    const sdk = await page.evaluate(() => {
      window._supaReal = false;
      const r = {
        repli: rcRefusAuth({ message: "Supabase non disponible" }),
        autreTexte: rcRefusAuth({ message: "x", status: 503 }),
        vide: rcRefusAuth(null),
        captcha: rcRefusAuth({ message: "captcha verification process failed" }),
      };
      window._supaReal = true;
      r.temoin = rcRefusAuth({ message: "Supabase non disponible" });
      return r;
    });
    expect(sdk).toEqual({ repli: "sdk", autreTexte: "sdk", vide: "sdk", captcha: "captcha", temoin: "autre" });
    expect(r).toEqual({
      reseauStatut0: "reseau", reseauStatut0Muet: "reseau", reseauSansStatut: "reseau",
      serveur500: "serveur", serveur503: "serveur", serveur504: "serveur", serveurAvantTexte: "serveur",
      captchaAvantStatut: "captcha", mdp400: "mdp", quota429: "quota",
      envoi: "envoi", envoiAncien: "envoi", envoiRecuperation: "envoi", envoiAdresse: "envoi",
      envoiSansStatut: "autre", envoi400: "autre",
      illisible: "serveur", illisibleTemoin: "autre",
    });
    // Un message n'existe que pour une PANNE : un refus garde sa traduction.
    // (`.map((rc) => …)` : la porte est le second argument, pas l'indice.)
    const m = await page.evaluate(() => ["serveur", "envoi", "reseau", "mdp", "quota", "autre", undefined].map((rc) => messagePanneAuth(rc)));
    expect(m[0]).toContain("ne répond pas");
    expect(m[1]).toContain("Continuer avec Google");
    // Le texte dit OÙ est la sortie, et la géométrie le vérifie (④ bis, ⑧ bis,
    // ⑧ ter, ⑩) : le bouton est SOUS le message. « au-dessus » serait faux.
    expect(m[1]).toContain("plus bas");
    expect(m[1]).not.toMatch(/au-dessus|ci-dessus/);
    // « reseau » sur un appareil qui se dit EN LIGNE : jamais « pas de
    // connexion internet » — c'est aussi la forme d'un service injoignable.
    expect(m[2]).toBe(INJOIGNABLE);
    expect(m.slice(3)).toEqual([null, null, null, null]);

    const p = await page.evaluate(() => {
      const r = {
        sdk: messagePanneAuth("sdk"),
        envoiRecup: messagePanneAuth("envoi", "recover"),
        envoiGoogle: messagePanneAuth("envoi", "google"),
        exReseau: messageExceptionAuth("reseau"),
        exCode: messageExceptionAuth("code"),
        exAutre: messageExceptionAuth("autre"),
      };
      // L'appareil se dit hors ligne : là, et là seulement, on le lui dit.
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      r.reseauHorsLigne = messagePanneAuth("reseau");
      r.exReseauHorsLigne = messageExceptionAuth("reseau");
      delete navigator.onLine;
      r.enLigneApres = navigator.onLine;
      return r;
    });
    expect(p.sdk).toContain("Recharge la page");
    // À la récupération, Google est une sortie SOUS CONDITION : sans elle, un
    // compte ouvert avec une autre adresse était envoyé vers un compte neuf.
    expect(p.envoiRecup).toContain("Si ton compte PASSIO porte ton adresse Google");
    expect(p.envoiRecup).toContain("plus bas");
    expect(p.envoiRecup).not.toContain("ou passe par");
    expect(p.envoiRecup).not.toMatch(/au-dessus|ci-dessus|\d/);
    // On ne propose pas Google à qui vient de le toucher.
    expect(p.envoiGoogle).not.toContain("Google");
    expect(p.exReseau).toBe(INJOIGNABLE);
    expect(p.exCode).toContain("Recharge la page");
    expect(p.exAutre).toBe(p.exCode);
    expect(p.reseauHorsLigne).toBe(HORS_LIGNE);
    expect(p.exReseauHorsLigne).toBe(HORS_LIGNE);
    expect(p.enLigneApres).toBe(true);
  });

  // Le VRAI SDK, face à de vraies réponses HTTP (servies par une route, vers un
  // hôte de banc : rien ne part en production). Les doubles des autres cas
  // IMITENT ce que le SDK rend ; celui-ci le MESURE — c'est ici qu'une montée de
  // version du SDK qui changerait la forme de ses erreurs se verrait.
  // MUTATION : retirer la ligne `AuthUnknownError` de rcRefusAuth → les deux
  // volets HTML rendent « autre » et `panne: null`, rouge.
  test("③ quater vrai SDK : une réponse illisible est une panne (403 ou 540 en HTML), une requête sans réponse lisible est « reseau »", async ({ page }) => {
    await ouvrirAuth(page);
    let reponse = null;
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    await page.route("https://illisible.exemple.test/**", (route) => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (reponse === "coupe") return route.abort();
      return route.fulfill({ status: reponse.status, contentType: reponse.type, headers: cors, body: reponse.body });
    });
    const jouer = async (r) => {
      reponse = r;
      return page.evaluate(async () => {
        const c = window.__sdkNu || (window.__sdkNu = supabase.createClient("https://illisible.exemple.test", "cle-de-banc",
          { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "banc-illisible" } }));
        const { error } = await c.auth.signInWithPassword({ email: "a@exemple.com", password: "motdepasse123" });
        const rc = rcRefusAuth(error);
        return { nom: error && error.name, statut: (error && typeof error.status === "number") ? error.status : null, rc: rc, panne: messagePanneAuth(rc) };
      });
    };
    const HTML = "<html>Attention Required! | pare-feu</html>";
    const SERVICE_KO = await page.evaluate(() => messagePanneAuth("serveur"));

    expect(await jouer({ status: 403, type: "text/html", body: HTML }))
      .toEqual({ nom: "AuthUnknownError", statut: null, rc: "serveur", panne: SERVICE_KO });
    expect(await jouer({ status: 540, type: "text/html", body: HTML }))
      .toEqual({ nom: "AuthUnknownError", statut: null, rc: "serveur", panne: SERVICE_KO });
    // 5xx de la liste du SDK, corps illisible : la classe « rejouable », avec son statut.
    expect(await jouer({ status: 503, type: "text/html", body: HTML }))
      .toEqual({ nom: "AuthRetryableFetchError", statut: 503, rc: "serveur", panne: SERVICE_KO });
    // TÉMOIN : un refus en JSON reste un refus, sans message de panne.
    expect(await jouer({ status: 400, type: "application/json", body: JSON.stringify({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }) }))
      .toEqual({ nom: "AuthApiError", statut: 400, rc: "mdp", panne: null });
    // Aucune réponse lisible : statut 0, que la requête soit coupée ou qu'un
    // 2xx ne soit pas du JSON. L'appareil est en ligne : le texte ne dit pas
    // « pas de connexion internet ».
    expect(await jouer("coupe")).toEqual({ nom: "AuthRetryableFetchError", statut: 0, rc: "reseau", panne: INJOIGNABLE });
    expect(await jouer({ status: 200, type: "text/html", body: HTML }))
      .toEqual({ nom: "AuthRetryableFetchError", statut: 0, rc: "reseau", panne: INJOIGNABLE });
  });

  // MUTATION : retirer `tel.action("confirmation_resent", { ok: !error })` → rouge.
  test("④ renvoi du lien : confirmation_resent {ok:true} puis {ok:false} sur refus", async ({ page }) => {
    await ouvrirAuth(page, {
      signUp: { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null },
    });
    await remplirInscription(page, "aconfirmer@exemple.com");
    await expect(page.locator("#authResendLink")).toBeVisible();
    await page.locator("#authResendLink").click();
    await expect(page.locator("#authMsg")).toContainText("renvoyé");

    // Second renvoi refusé (délai anti-abus) : l'issue est dite, pas l'adresse.
    await page.evaluate(() => {
      supa.auth.resend = async () => ({ data: null, error: { message: "For security purposes, you can only request this after 47 seconds." } });
    });
    await page.locator("#authResendLink").click();
    await expect(page.locator("#authMsg")).toContainText("Patiente");

    const evs = (await capture(page)).filter((e) => e.name === "confirmation_resent");
    expect(evs.map((e) => e.meta)).toEqual([{ ok: true }, { ok: false }]);
    sansAdresse(evs);
  });

  // « Renvoyer le lien » EST la sortie promise à qui est bloqué à la
  // confirmation : en panne, elle affichait de l'anglais ou « {} », et son
  // `catch` répondait « pas de connexion internet » à un défaut de code.
  // MUTATIONS : afficher `m` même quand `panne` existe → rouge (« {} »
  // s'affiche) ; retirer `signalerExceptionAuth("resend", e)` → rouge ; dire
  // « hors ligne » sans condition dans le catch (`_showPanneAuth(AUTH_HORS_LIGNE)`)
  // → rouge (« Recharge la page » attendu).
  test("④ bis renvoi du lien en panne : un message vrai avec sa sortie, auth_exception {kind:resend} si ça lève", async ({ page }) => {
    await ouvrirAuth(page, {
      signUp: { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null },
    });
    await remplirInscription(page, "aconfirmer@exemple.com");
    await expect(page.locator("#authResendLink")).toBeVisible();
    await viderCapture(page);
    const msg = page.locator("#authMsg");

    // Service en 5xx dont le corps JSON est vide : le SDK rend « {} » (pour un
    // corps illisible : `statusText`, ou « HTTP <statut> »).
    await page.evaluate(() => {
      supa.auth.resend = async () => ({ data: null, error: { name: "AuthRetryableFetchError", status: 503, message: "{}" } });
    });
    await page.locator("#authResendLink").click();
    await expect(msg).toContainText("ne répond pas");
    await expect(msg).not.toContainText("{}");

    // L'e-mail ne part pas : la sortie nommée existe, sous le message, même avec
    // le bloc de renvoi du haut intercalé.
    await page.evaluate(() => {
      supa.auth.resend = async () => ({ data: null, error: { name: "AuthRetryableFetchError", status: 500, message: "Error sending confirmation email" } });
    });
    await page.locator("#authResendLink").click();
    await expect(msg).toContainText("Continuer avec Google");
    await expect(page.locator("#authResendTop")).toBeVisible();
    expect(await googleSousLeMessage(page)).toEqual(GOOGLE_ATTENDU);

    // Le renvoi LÈVE sur un défaut de code : ce n'est pas une coupure.
    await page.evaluate(() => { supa.auth.resend = async () => { throw new TypeError("x is not a function"); }; });
    await page.locator("#authResendLink").click();
    await expect(msg).toContainText("Recharge la page");
    await expect(msg).not.toContainText("Pas de connexion internet");

    // Le renvoi lève sur une vraie coupure (libellé de WebKit).
    await page.evaluate(() => { supa.auth.resend = async () => { throw new TypeError("Load failed"); }; });
    await page.locator("#authResendLink").click();
    await expect(msg).toHaveText(INJOIGNABLE);

    const evs = await capture(page);
    // `confirmation_resent` garde sa forme exacte : une ligne par tentative.
    expect(evs.filter((e) => e.name === "confirmation_resent").map((e) => e.meta))
      .toEqual([{ ok: false }, { ok: false }, { ok: false }, { ok: false }]);
    expect(evs.filter((e) => e.name === "auth_exception").map((e) => e.meta))
      .toEqual([{ kind: "resend", rc: "code" }, { kind: "resend", rc: "reseau" }]);
    sansAdresse(evs);
  });

  // Le lien de renvoi du BAS est le point le plus éloigné du message. Mesuré
  // avant ce lot à 320 × 568 : le haut du message de panne sortait de l'écran
  // (−20 px). `_showPanneAuth` le ramène entier.
  // MUTATIONS : afficher la panne du renvoi par `_showAuthMsg(panne, "error")`
  // → rouge ; afficher par `_showAuthMsg` dans son catch → le volet
  // « exception » rougit.
  test("④ ter le renvoi en panne se LIT à 320 × 568 : depuis le lien du bas, le message revient entier à l'écran", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await ouvrirAuth(page, {
      signUp: { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null },
    });
    await remplirInscription(page, "aconfirmer@exemple.com");
    const lien = page.locator("#authResendLink");
    const msg = page.locator("#authMsg");
    await expect(lien).toBeVisible();
    const entier = () => page.evaluate(() => {
      const r = document.getElementById("authMsg").getBoundingClientRect();
      return r.height > 0 && r.top >= -1 && r.bottom <= innerHeight + 1;
    });
    // Un défilement doux est peut-être en cours (`_showResendConfirmation`,
    // `_showPanneAuth`) : on attend qu'il soit posé avant de placer le doigt.
    const auRepos = () => page.waitForFunction(() => new Promise((fin) => {
      const el = document.getElementById("authMsg");
      const avant = el.getBoundingClientRect().top;
      setTimeout(() => fin(Math.abs(el.getBoundingClientRect().top - avant) < 0.5), 200);
    }), null, { timeout: 8000 });
    // Le point de départ : le lien du bas au bord de l'écran, et le message,
    // tout en haut du formulaire, entamé ou sorti.
    const doigtSurLeLienDuBas = async () => {
      await auRepos();
      await page.evaluate(() => document.getElementById("authResendLink").scrollIntoView({ block: "end", behavior: "instant" }));
      expect(await page.evaluate(() => document.getElementById("authMsg").getBoundingClientRect().top)).toBeLessThan(-1);
    };

    await page.evaluate(() => {
      supa.auth.resend = async () => ({ data: null, error: { name: "AuthRetryableFetchError", status: 500, message: "Error sending confirmation email" } });
    });
    await doigtSurLeLienDuBas();
    await lien.click();
    await expect(msg).toContainText("Continuer avec Google");
    await expect.poll(entier, { timeout: 8000 }).toBe(true);

    await page.evaluate(() => { supa.auth.resend = async () => { throw new TypeError("x is not a function"); }; });
    await doigtSurLeLienDuBas();
    await lien.click();
    await expect(msg).toContainText("Recharge la page");
    await expect.poll(entier, { timeout: 8000 }).toBe(true);
  });

  // MUTATION : retirer `tel.action("signin_ok")` ou le `tel.flush({ keepalive: true })`
  // qui le suit → rouge. Sans le flush, l'événement attendrait le minuteur de 3 s
  // et serait emporté par le `location.reload()` qui suit immédiatement.
  test("⑤ connexion réussie : signin_ok puis flush keepalive AVANT le rechargement", async ({ page }) => {
    await ouvrirAuth(page, {
      signIn: { data: { session: { user: { id: "11111111-1111-4111-8111-111111111111" } } }, error: null },
    });
    // On arrête le parcours JUSTE APRÈS l'émission : `adopterCompteConnecte`
    // est le premier geste qui suit, et il mène au rechargement (qui perdrait
    // la capture). Une promesse jamais résolue fige onbDoAuth là, sans reload.
    await page.evaluate(() => { window.adopterCompteConnecte = () => new Promise(() => {}); });
    await remplirConnexion(page, "ok@exemple.com");
    await page.waitForFunction(() => window.__telCap.some((e) => e.name === "signin_ok"), null, { timeout: 10000 });

    const evs = await capture(page);
    expect(noms(evs)).toEqual(["auth_submitted", "signin_ok"]);
    const flushes = await page.evaluate(() => window.__flushCap);
    expect(flushes.length).toBeGreaterThanOrEqual(1);
    expect(flushes[flushes.length - 1]).toEqual({ keepalive: true });
    sansAdresse(evs);
  });

  // MUTATION : retirer `localStorage.removeItem("passio_signup_pending")` de
  // signalerInscriptionConfirmee → le second appel ré-émet (doublon) ; retirer
  // l'émission → aucun signup_confirmed.
  test("⑥ signup_confirmed : première session vue avec le marqueur, délai en secondes, UNE seule émission", async ({ page }) => {
    await ouvrirAuth(page);
    const r = await page.evaluate(() => {
      localStorage.setItem("passio_signup_pending", String(Date.now() - 90 * 1000));
      const session = { user: { id: "11111111-1111-4111-8111-111111111111" } };
      const premier = signalerInscriptionConfirmee(session);
      const marqueurApres = localStorage.getItem("passio_signup_pending");
      const second = signalerInscriptionConfirmee(session);        // plus de marqueur
      const sansSession = (localStorage.setItem("passio_signup_pending", String(Date.now())), signalerInscriptionConfirmee(null));
      const marqueurSansSession = localStorage.getItem("passio_signup_pending");
      localStorage.removeItem("passio_signup_pending");
      return { premier, second, sansSession, marqueurApres, marqueurSansSession, evs: window.__telCap };
    });
    expect(r.premier).toBe(true);
    expect(r.marqueurApres).toBeNull();
    expect(r.second).toBe(false);
    // Sans session, le marqueur RESTE : la confirmation n'a pas encore eu lieu.
    expect(r.sansSession).toBe(false);
    expect(r.marqueurSansSession).not.toBeNull();
    const confirmes = r.evs.filter((e) => e.name === "signup_confirmed");
    expect(confirmes).toHaveLength(1);
    expect(confirmes[0].meta.delai_s).toBeGreaterThanOrEqual(90);
    expect(confirmes[0].meta.delai_s).toBeLessThan(120);
    expect(Object.keys(confirmes[0].meta)).toEqual(["delai_s"]);
  });

  // MUTATION : retirer l'un des deux appels (boot ou SIGNED_IN) → rouge. Sans
  // ce cas, la fonction pourrait rester vivante et n'être appelée par PERSONNE.
  test("⑦ contrat de source : signalerInscriptionConfirmee est câblée au boot ET au SIGNED_IN, le marqueur posé à « compte créé »", async () => {
    const app08 = fs.readFileSync(SOURCE_APP08, "utf8");
    // Les APPELS (`…(session);`), pas la déclaration (`…(session) {`).
    expect((app08.match(/signalerInscriptionConfirmee\(session\);/g) || []).length).toBe(2);
    expect(app08).toMatch(/^function signalerInscriptionConfirmee\(session\) \{/m);
    // Le premier appel est dans `boot` (branche session), le second dans le
    // handler onAuthStateChange — dans cet ordre dans le fichier.
    const iBoot = app08.indexOf("async function boot() {");
    const iHandler = app08.indexOf("onAuthStateChange");
    const appels = [];
    let k = -1;
    while ((k = app08.indexOf("signalerInscriptionConfirmee(session);", k + 1)) !== -1) appels.push(k);
    expect(appels[0]).toBeGreaterThan(iBoot);
    expect(appels[1]).toBeGreaterThan(iHandler);

    const app02 = fs.readFileSync(SOURCE_APP02, "utf8");
    expect(app02).toMatch(/localStorage\.setItem\("passio_signup_pending", String\(Date\.now\(\)\)\)/);
    // Le marqueur n'est PAS de portée compte : il doit SURVIVRE à la purge
    // d'adoption qui précède le premier boot avec session.
    const bloc = app02.slice(app02.indexOf("var ACCOUNT_SCOPED_KEYS = ["), app02.indexOf("];", app02.indexOf("var ACCOUNT_SCOPED_KEYS = [")));
    expect(bloc).not.toContain("passio_signup_pending");
  });

  // ─── LES IMPASSES (2026-11-21) ────────────────────────────────────────────

  // MUTATION : dans onbDoAuth, afficher `msg` même quand `_panne` existe
  // (`_showAuthMsg(msg, "error")` seul) → le message brut du serveur s'affiche
  // (avec son adresse), rouge sur les deux volets.
  test("⑧ service de connexion en panne : signin_refused {rc:serveur}, un message vrai, jamais le texte brut", async ({ page }) => {
    await ouvrirAuth(page, {
      signIn: { data: { session: null }, error: { name: "AuthRetryableFetchError", status: 503,
        message: "upstream connect error for jean@exemple.com at https://abc.supabase.co/auth/v1/token (503)" } },
    });
    await remplirConnexion(page);
    const msg = page.locator("#authMsg");
    await expect(msg).toContainText("ne répond pas");
    const texte = await msg.textContent();
    for (const brut of ["503", "jean@", "supabase", "upstream"]) expect(texte).not.toContain(brut);
    // Le formulaire reste utilisable : la sortie annoncée est « réessaie ».
    await expect(page.locator("#authSubmitBtn")).toBeEnabled();
    await expect(page.locator("#authSubmitBtn")).toHaveText("Se connecter");

    let evs = await capture(page);
    expect(noms(evs)).toEqual(["auth_submitted", "signin_refused"]);
    expect(evs[1].meta).toEqual({ rc: "serveur" });
    sansAdresse(evs);

    // Requête jamais arrivée, RENDUE par le SDK (statut 0) avec un message que
    // la table de traduction ne connaît pas : il partait tel quel, en anglais.
    await viderCapture(page);
    await page.evaluate(() => {
      supa.auth.signInWithPassword = async () => ({ data: { session: null }, error: { name: "AuthRetryableFetchError", status: 0, message: "signal timed out" } });
    });
    await page.locator("#authSubmitBtn").click();
    // L'appareil est EN LIGNE : c'est la forme d'un service injoignable autant
    // que d'une coupure — le texte ne tranche pas à la place de la personne.
    await expect(msg).toHaveText(INJOIGNABLE);
    evs = await capture(page);
    expect(noms(evs)).toEqual(["auth_submitted", "signin_refused"]);
    expect(evs[1].meta).toEqual({ rc: "reseau" });
  });

  // Les branches d'onbDoAuth qui se décident sur le TEXTE du refus ne valent
  // que pour un refus. Sous une panne, ce texte est un corps d'erreur quelconque.
  // MUTATIONS : retirer `!_panne &&` de la branche « Email not confirmed » → le
  // bloc de renvoi s'ouvre sous la panne, rouge ; le retirer de la branche du
  // quota → `signup_quota_email` part pour une saturation du service, rouge.
  test("⑧ quater sous une panne, ni bloc de renvoi ni signal de quota d'e-mails — et leurs témoins les montrent sur un vrai refus", async ({ page }) => {
    await ouvrirAuth(page, {
      signIn: { data: { session: null }, error: { name: "AuthRetryableFetchError", status: 502, message: "Email not confirmed (upstream)" } },
    });
    const msg = page.locator("#authMsg");
    await remplirConnexion(page);
    await expect(msg).toContainText("ne répond pas");
    await expect(page.locator("#authResendTop")).toBeHidden();
    await expect(page.locator("#authResendLink")).toBeHidden();
    expect((await capture(page))[1]).toEqual({ name: "signin_refused", meta: { rc: "serveur" } });

    // TÉMOIN : le même texte en 400 est le vrai refus — la sortie se montre.
    await viderCapture(page);
    await page.evaluate(() => {
      supa.auth.signInWithPassword = async () => ({ data: { session: null }, error: { status: 400, code: "email_not_confirmed", message: "Email not confirmed" } });
    });
    await page.locator("#authSubmitBtn").click();
    await expect(msg).toContainText("Confirme ton e-mail");
    await expect(page.locator("#authResendTop")).toBeVisible();

    // Saturation du SERVICE dont le texte contient « too many » : ce n'est pas
    // le quota d'e-mails, et l'erreur prioritaire qui le nomme ne part pas.
    await viderCapture(page);
    await page.evaluate(() => {
      supa.auth.signUp = async () => ({ data: { user: null, session: null }, error: { name: "AuthRetryableFetchError", status: 503, message: "remaining connection slots are reserved: too many connections" } });
    });
    await remplirInscription(page);
    await attendreSignal(page, "signup_refused");
    await expect(msg).toContainText("ne répond pas");
    await expect(msg).not.toContainText("Beaucoup de monde");
    expect((await capture(page))[1]).toEqual({ name: "signup_refused", meta: { rc: "serveur" } });
    expect(await page.evaluate(() => window.__telErr)).toEqual([]);

    // TÉMOIN : le vrai quota (429) garde son message et son signal.
    await viderCapture(page);
    await page.evaluate(() => {
      supa.auth.signUp = async () => ({ data: { user: null, session: null }, error: { status: 429, code: "over_email_send_rate_limit", message: "Email rate limit exceeded" } });
    });
    await page.locator("#authSubmitBtn").click();
    await expect(msg).toContainText("Beaucoup de monde");
    expect((await capture(page))[1]).toEqual({ name: "signup_refused", meta: { rc: "quota" } });
    expect(await page.evaluate(() => window.__telErr)).toEqual(["signup_quota_email"]);
  });

  // MUTATIONS : afficher `msg` même quand `_panne` existe → rouge ; retirer la
  // ligne « envoi » de rcRefusAuth → `rc: "serveur"` et plus de Google, rouge ; retirer
  // `!_panne` de la garde de majAideMotDePasse → « Proposer un mot de passe »
  // s'affiche sous une panne, rouge. Le témoin (un VRAI refus de mot de passe)
  // prouve que l'aide se montre quand elle le doit.
  test("⑧ bis inscription en panne : serveur, e-mail qui ne part pas (sortie Google mesurée), et pas d'aide au mot de passe sous une panne", async ({ page }) => {
    await ouvrirAuth(page, {
      signUp: { data: { user: null, session: null }, error: { message: "Database error saving new user", status: 500, code: "unexpected_failure" } },
    });
    await remplirInscription(page);
    const msg = page.locator("#authMsg");
    await expect(msg).toContainText("ne répond pas");
    await expect(msg).not.toContainText("Database");
    let evs = await capture(page);
    expect(noms(evs)).toEqual(["auth_submitted", "signup_refused"]);
    expect(evs[1].meta).toEqual({ rc: "serveur" });

    // L'e-mail de confirmation ne part pas (relais en panne, quota du jour).
    await viderCapture(page);
    await page.evaluate(() => {
      supa.auth.signUp = async () => ({ data: { user: null, session: null }, error: { name: "AuthRetryableFetchError", status: 500, message: "Error sending confirmation email" } });
    });
    await page.locator("#authSubmitBtn").click();
    await expect(msg).toContainText("Continuer avec Google");
    const texte = await msg.textContent();
    expect(texte).not.toContain("Error sending");
    // Aucune durée chiffrée : le texte ne sait pas combien de temps dure la panne.
    expect(texte).not.toMatch(/\d/);
    // La sortie nommée est à l'écran, sous le message, avec ce libellé.
    expect(await googleSousLeMessage(page)).toEqual(GOOGLE_ATTENDU);
    evs = await capture(page);
    expect(evs[1]).toEqual({ name: "signup_refused", meta: { rc: "envoi" } });
    await expect(page.locator("#authSubmitBtn")).toHaveText("Créer mon compte");

    // Un 5xx dont le texte cite « password » : c'est une panne, pas un refus de
    // mot de passe — l'aide « Proposer un mot de passe » ne se montre pas.
    await viderCapture(page);
    await page.evaluate(() => {
      supa.auth.signUp = async () => ({ data: { user: null, session: null }, error: { status: 500, message: "Password is known to be weak and easy to guess" } });
    });
    await page.locator("#authSubmitBtn").click();
    await attendreSignal(page, "signup_refused");
    await expect(msg).toContainText("ne répond pas");
    await expect(page.locator("#authPwdRefus")).toBeHidden();
    expect((await capture(page))[1].meta).toEqual({ rc: "serveur" });

    // TÉMOIN : le même texte en 422 est un vrai refus — l'aide se montre.
    await viderCapture(page);
    await page.evaluate(() => {
      supa.auth.signUp = async () => ({ data: { user: null, session: null }, error: { status: 422, code: "weak_password", message: "Password is known to be weak and easy to guess" } });
    });
    await page.locator("#authSubmitBtn").click();
    await expect(page.locator("#authPwdRefus")).toContainText("Proposer un mot de passe");
    expect((await capture(page))[1].meta).toEqual({ rc: "mdp" });
  });

  // Aux hauteurs utiles d'un iPhone sous Safari, « Créer mon compte » est tout
  // en bas du formulaire et `#authMsg` tout en haut : mesuré avant ce lot à
  // −165…−87 px (390 × 664) et −338…−245 px (320 × 568), hors de l'écran. Un
  // message vrai que personne ne lit ne dit rien.
  // MUTATIONS : retirer le `scrollIntoView` de `_showPanneAuth` → rouge aux deux
  // tailles ; afficher la panne par `_showAuthMsg(_panne, "error")` dans
  // onbDoAuth → rouge ; afficher par `_showAuthMsg` dans son catch → le volet
  // « exception » rougit.
  for (const vue of [{ width: 390, height: 664 }, { width: 320, height: 568 }]) {
    test(`⑧ ter une panne se LIT : à ${vue.width} × ${vue.height}, le message et « Continuer avec Google » sont à l'écran`, async ({ page }) => {
      await page.setViewportSize(vue);
      await ouvrirAuth(page, {
        signUp: { data: { user: null, session: null }, error: { name: "AuthRetryableFetchError", status: 500, message: "Error sending confirmation email" } },
      });
      await saisirInscription(page);
      const bouton = page.locator("#authSubmitBtn");
      // À l'écran = dans la fenêtre ET sous le doigt (`elementFromPoint`) : un
      // élément recouvert n'est pas plus lisible qu'un élément hors champ.
      const aLEcran = () => page.evaluate(() => {
        const vu = (id) => {
          const el = document.getElementById(id);
          const r = el.getBoundingClientRect();
          if (!(r.height > 0) || r.top < -1 || r.bottom > innerHeight + 1) return false;
          const touche = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!touche && el.contains(touche);
        };
        const m = document.getElementById("authMsg").getBoundingClientRect();
        const g = document.getElementById("authGoogleBtn").getBoundingClientRect();
        return { message: vu("authMsg"), google: vu("authGoogleBtn"), googleSous: g.top >= m.bottom };
      });

      // Le point de départ du scénario : le doigt est sur « Créer mon compte »,
      // et le haut du formulaire (les onglets, juste au-dessus du message) est
      // sorti de l'écran.
      await bouton.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.getElementById("authTabSignup").getBoundingClientRect().bottom)).toBeLessThan(0);

      await bouton.click();
      await expect(page.locator("#authMsg")).toContainText("Continuer avec Google");
      await expect.poll(aLEcran, { timeout: 8000 }).toEqual({ message: true, google: true, googleSous: true });

      // Même règle pour une exception : le texte « Recharge la page » se lit.
      await page.evaluate(() => { supa.auth.signUp = async () => { throw new Error("boom"); }; });
      await bouton.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.getElementById("authTabSignup").getBoundingClientRect().bottom)).toBeLessThan(0);
      await bouton.click();
      await expect(page.locator("#authMsg")).toContainText("Recharge la page");
      await expect.poll(async () => (await aLEcran()).message, { timeout: 8000 }).toBe(true);
    });
  }

  // MUTATIONS : retirer `signalerExceptionAuth(_authMode, e)` du catch
  // d'onbDoAuth → rouge ; y remettre `_showAuthMsg(AUTH_HORS_LIGNE, "error")`
  // pour toute exception → volets (a) et (c) rouges ; retirer le
  // `console.warn` de signalerExceptionAuth → volet (a) rouge (plus aucune trace
  // locale d'un défaut de code) ; passer `_authMode` au lieu de `_mode` à
  // signalerExceptionAuth → volet (d) rouge (`kind: "signin"`).
  test("⑨ une exception laisse une trace et ne dit plus « pas de connexion » à tout : auth_exception {kind, rc}", async ({ page }) => {
    await ouvrirAuth(page);
    const msg = page.locator("#authMsg");
    // PAS DE CATCH MUET : hors coupure, l'exception s'écrit dans la console.
    const avertis = [];
    page.on("console", (m) => { if (m.type() === "warning" && m.text().startsWith("auth (")) avertis.push(m.text()); });

    // (a) Défaut de code, dont le message cite une adresse.
    await page.evaluate(() => {
      supa.auth.signInWithPassword = async () => { throw new TypeError("Cannot read properties of undefined (reading 'jean@exemple.com')"); };
    });
    await remplirConnexion(page);
    await expect(msg).toContainText("Recharge la page");
    await expect(msg).not.toContainText("Pas de connexion internet");
    let evs = await capture(page);
    expect(noms(evs)).toEqual(["auth_submitted", "auth_exception"]);
    expect(evs[1].meta).toEqual({ kind: "signin", rc: "code" });
    expect(Object.keys(evs[1].meta).sort()).toEqual(["kind", "rc"]);
    sansAdresse(evs);
    await expect(page.locator("#authSubmitBtn")).toBeEnabled();
    await expect(page.locator("#authSubmitBtn")).toHaveText("Se connecter");
    await expect.poll(() => avertis.length).toBe(1);
    expect(avertis[0]).toMatch(/^auth \(signin\):/);

    // (b) Vraie coupure : un `fetch` coupé est AUSSI un TypeError.
    await viderCapture(page);
    await page.evaluate(() => { supa.auth.signInWithPassword = async () => { throw new TypeError("Failed to fetch"); }; });
    await page.locator("#authSubmitBtn").click();
    await expect(msg).toHaveText(INJOIGNABLE);
    evs = await capture(page);
    expect(evs[1]).toEqual({ name: "auth_exception", meta: { kind: "signin", rc: "reseau" } });
    // Une coupure n'est pas un défaut à corriger : rien de plus dans la console.
    expect(avertis).toHaveLength(1);

    // (c) En création de compte, une exception quelconque.
    await viderCapture(page);
    await page.evaluate(() => { supa.auth.signUp = async () => { throw new Error("boom"); }; });
    await remplirInscription(page);
    await expect(msg).toContainText("Recharge la page");
    evs = await capture(page);
    expect(noms(evs)).toEqual(["auth_submitted", "auth_exception"]);
    expect(evs[1].meta).toEqual({ kind: "signup", rc: "autre" });
    await expect(page.locator("#authSubmitBtn")).toHaveText("Créer mon compte");

    // (d) Une exception APRÈS la création du compte : onbDoAuth a déjà basculé
    // sur l'onglet « Se connecter » (`_authMode` a changé dans le même `try`).
    // La porte poussée reste « signup » ; le bouton suit l'onglet affiché.
    await viderCapture(page);
    await page.evaluate(() => {
      supa.auth.signUp = async () => ({ data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null });
      const vrai = window._showResendConfirmation;
      // `switchAuthTab` l'appelle avec "" (on laisse passer) ; l'appel qui suit
      // « Compte créé » porte l'adresse : c'est lui qui lève.
      window._showResendConfirmation = function (email) { if (email) throw new Error("boom après création"); return vrai.apply(this, arguments); };
    });
    await page.locator("#authSubmitBtn").click();
    await attendreSignal(page, "auth_exception");
    evs = await capture(page);
    expect(noms(evs)).toEqual(["auth_submitted", "signup_pending_confirmation", "auth_exception"]);
    expect(evs[2].meta).toEqual({ kind: "signup", rc: "autre" });
    await expect(page.locator("#authTabSignin")).toHaveClass(/active/);
    await expect(page.locator("#authSubmitBtn")).toHaveText("Se connecter");
  });

  // MUTATIONS : tester le NOM avant `estEchecReseau` dans rcExceptionAuth →
  // `fetchCoupe` rend "code", rouge (et ⑨ (b) avec lui) ; faire rendre le
  // message → la liste fermée et l'adresse rougissent ; retirer le `e &&` de la
  // lecture du nom → `nul` lève, rouge ; retirer le filtre de porte de
  // signalerExceptionAuth → la valeur libre voyage, rouge.
  test("⑨ bis rcExceptionAuth : réseau d'abord, liste fermée, jamais le message — et la porte est une liste fermée aussi", async ({ page }) => {
    await ouvrirAuth(page);
    const r = await page.evaluate(() => ({
      abandon: rcExceptionAuth(new DOMException("The operation was aborted.", "AbortError")),
      fetchCoupe: rcExceptionAuth(new TypeError("Failed to fetch")),
      chaine: rcExceptionAuth("Load failed"),
      reference: rcExceptionAuth(new ReferenceError("x is not defined")),
      type: rcExceptionAuth(new TypeError("x is not a function")),
      intervalle: rcExceptionAuth(new RangeError("Maximum call stack size exceeded")),
      syntaxe: rcExceptionAuth(new SyntaxError("Unexpected token")),
      refusServeur: rcExceptionAuth({ message: "x", code: "42501" }),
      adresse: rcExceptionAuth(new Error("boom pour jean@exemple.com")),
      nul: rcExceptionAuth(null),
      indefini: rcExceptionAuth(undefined),
    }));
    expect(r).toEqual({
      abandon: "reseau", fetchCoupe: "reseau", chaine: "reseau",
      reference: "code", type: "code", intervalle: "code", syntaxe: "code",
      refusServeur: "autre", adresse: "autre", nul: "autre", indefini: "autre",
    });
    for (const v of Object.values(r)) expect(["reseau", "code", "autre"]).toContain(v);

    const s = await page.evaluate(() => {
      window.__telCap = [];
      const rendu = [
        signalerExceptionAuth("jean_dupont_0612345678", new Error("x")),
        signalerExceptionAuth("resend", new TypeError("Failed to fetch")),
      ];
      return { rendu, evs: window.__telCap };
    });
    // La fonction rend `rc` (l'appelant choisit son message), et n'émet qu'une
    // porte connue.
    expect(s.rendu).toEqual(["autre", "reseau"]);
    expect(s.evs).toEqual([
      { name: "auth_exception", meta: { kind: "autre", rc: "autre" } },
      { name: "auth_exception", meta: { kind: "resend", rc: "reseau" } },
    ]);
  });

  // MUTATIONS : retirer l'une des deux émissions `password_reset_requested` →
  // rouge ; retirer `messagePanneAuth(rc) ||` d'onbForgotPassword → rouge (le
  // texte brut s'affiche) ; remettre `_showAuthMsg(AUTH_HORS_LIGNE, "error")`
  // sans condition dans son catch → rouge (« Recharge la page » attendu) ;
  // rendre `AUTH_ENVOI_KO` (Google sans condition) sur cette porte → rouge.
  test("⑩ « Mot de passe oublié ? » : password_reset_requested {ok, rc}, un message vrai en panne, auth_exception {kind:recover} si ça lève", async ({ page }) => {
    await ouvrirAuth(page);
    const msg = page.locator("#authMsg");
    const repondre = (reponse) => page.evaluate((r) => {
      window.__telCap = [];
      supa.auth.resetPasswordForEmail = async () => r;
    }, reponse);
    const lever = (texte) => page.evaluate((t) => {
      window.__telCap = [];
      supa.auth.resetPasswordForEmail = async () => { throw new TypeError(t); };
    }, texte);
    await page.locator("#authTabSignin").click();
    await page.locator("#authEmail").fill("oubli@exemple.com");

    await repondre({ data: {}, error: null });
    await page.locator("#authForgotLink").click();
    await expect(msg).toContainText("réinitialisation envoyé");
    expect(await capture(page)).toEqual([{ name: "password_reset_requested", meta: { ok: true } }]);

    // Refus (délai anti-abus) : l'issue et sa raison, jamais l'adresse.
    await repondre({ data: null, error: { status: 429, message: "For security purposes, you can only request this after 47 seconds." } });
    await page.locator("#authForgotLink").click();
    await attendreSignal(page, "password_reset_requested");
    expect(await capture(page)).toEqual([{ name: "password_reset_requested", meta: { ok: false, rc: "quota" } }]);

    // Service en panne : un message vrai, pas le texte du serveur.
    await repondre({ data: null, error: { name: "AuthRetryableFetchError", status: 503, message: "Service Unavailable" } });
    await page.locator("#authForgotLink").click();
    await expect(msg).toContainText("ne répond pas");
    await expect(msg).not.toContainText("Service Unavailable");
    expect(await capture(page)).toEqual([{ name: "password_reset_requested", meta: { ok: false, rc: "serveur" } }]);

    // L'e-mail ne part pas : la sortie nommée existe sous le message, en connexion.
    // ⚠️ SOUS CONDITION : la personne a déjà un compte, et Google n'ouvre que
    // celui qui porte son adresse Google — il en CRÉE un autre sinon.
    await repondre({ data: null, error: { name: "AuthRetryableFetchError", status: 500, message: "Error sending recovery email" } });
    await page.locator("#authForgotLink").click();
    await expect(msg).toContainText("Continuer avec Google");
    await expect(msg).toContainText("Si ton compte PASSIO porte ton adresse Google");
    await expect(msg).not.toContainText("ou passe par");
    expect(await googleSousLeMessage(page)).toEqual(GOOGLE_ATTENDU);
    expect(await capture(page)).toEqual([{ name: "password_reset_requested", meta: { ok: false, rc: "envoi" } }]);

    // Exception sur un défaut de code : ce n'est pas une coupure.
    await lever("x is not a function");
    await page.locator("#authForgotLink").click();
    await expect(msg).toContainText("Recharge la page");
    await expect(msg).not.toContainText("Pas de connexion internet");
    expect(await capture(page)).toEqual([{ name: "auth_exception", meta: { kind: "recover", rc: "code" } }]);

    // Exception sur une vraie coupure.
    await lever("Failed to fetch");
    await page.locator("#authForgotLink").click();
    await expect(msg).toHaveText(INJOIGNABLE);
    const evs = await capture(page);
    expect(evs).toEqual([{ name: "auth_exception", meta: { kind: "recover", rc: "reseau" } }]);
    sansAdresse(evs);
  });

  // MUTATIONS : retirer `tel.action("google_refused", …)` → rouge ; retirer
  // `signalerExceptionAuth("google", e)` du catch → rouge ; retirer
  // `messagePanneAuth(rc, "google") ||` → le texte brut du 5xx s'affiche, rouge ;
  // retirer l'argument de porte (`messagePanneAuth(rc) ||`) → le volet « envoi »
  // propose « Continuer avec Google » à qui vient de le toucher, rouge.
  test("⑪ départ vers Google : google_refused {rc} sur refus, auth_exception {kind:google} si ça lève, le drapeau retiré", async ({ page }) => {
    await ouvrirAuth(page);
    // En CONNEXION : le bouton n'exige pas la case de consentement.
    await page.locator("#authTabSignin").click();
    await page.evaluate(() => {
      supa.auth.signInWithOAuth = async () => ({ data: null, error: { status: 400, message: "Unsupported provider: provider is not enabled" } });
    });
    await page.locator("#authGoogleBtn").click();
    await attendreSignal(page, "google_refused");
    let evs = await capture(page);
    expect(evs).toEqual([{ name: "google_refused", meta: { rc: "autre" } }]);
    expect(await page.evaluate(() => localStorage.getItem("passio_oauth_pending"))).toBeNull();
    // TÉMOIN : un refus garde son propre texte.
    await expect(page.locator("#authMsg")).toContainText("Unsupported provider");

    // Une PANNE au départ vers Google a son message, comme aux autres portes.
    await viderCapture(page);
    await page.evaluate(() => {
      supa.auth.signInWithOAuth = async () => ({ data: null, error: { name: "AuthRetryableFetchError", status: 503, message: "upstream connect error (503)" } });
    });
    await page.locator("#authGoogleBtn").click();
    await attendreSignal(page, "google_refused");
    expect(await capture(page)).toEqual([{ name: "google_refused", meta: { rc: "serveur" } }]);
    await expect(page.locator("#authMsg")).toContainText("ne répond pas");
    await expect(page.locator("#authMsg")).not.toContainText("upstream");

    // La PORTE compte : sur un code « envoi », les autres portes désignent
    // « Continuer avec Google » comme sortie. Ici, la personne vient de le
    // toucher — on ne le lui propose pas. (signInWithOAuth ne rend pas ce
    // texte aujourd'hui : le volet verrouille l'argument au point d'appel.)
    await viderCapture(page);
    await page.evaluate(() => {
      supa.auth.signInWithOAuth = async () => ({ data: null, error: { status: 500, message: "Error sending confirmation email" } });
    });
    await page.locator("#authGoogleBtn").click();
    await attendreSignal(page, "google_refused");
    expect(await capture(page)).toEqual([{ name: "google_refused", meta: { rc: "envoi" } }]);
    await expect(page.locator("#authMsg")).toHaveText(await page.evaluate(() => messagePanneAuth("serveur")));
    await expect(page.locator("#authMsg")).toContainText("ne répond pas");
    await expect(page.locator("#authMsg")).not.toContainText("Continuer avec Google");
    await expect(page.locator("#authMsg")).not.toContainText("Error sending");

    await viderCapture(page);
    await page.evaluate(() => {
      supa.auth.signInWithOAuth = async () => { throw new TypeError("Cannot read properties of undefined (reading 'origin')"); };
    });
    await page.locator("#authGoogleBtn").click();
    await attendreSignal(page, "auth_exception");
    evs = await capture(page);
    expect(evs).toEqual([{ name: "auth_exception", meta: { kind: "google", rc: "code" } }]);
    await expect(page.locator("#authMsg")).toContainText("Connexion Google indisponible");
    // Le drapeau ne survit pas à un départ raté : au prochain démarrage il
    // ferait prendre une arrivée ordinaire pour un retour de Google.
    expect(await page.evaluate(() => localStorage.getItem("passio_oauth_pending"))).toBeNull();
    sansAdresse(evs);
  });

  // MUTATIONS : retirer l'une des deux émissions `password_reset_done` → rouge ;
  // retirer le `tel.flush({ keepalive: true })` qui suit la réussite → rouge (la
  // page recharge 900 ms plus loin, l'événement resterait en file) ; retirer
  // `signalerExceptionAuth("reset", e)` → rouge ; afficher `AUTH_IMPREVU` dans
  // ce catch → rouge (« Recharge la page » condamnerait le lien à usage unique).
  test("⑫ nouveau mot de passe : password_reset_done {ok, rc}, flush keepalive à la réussite, auth_exception {kind:reset} si ça lève", async ({ page }) => {
    await ouvrirAuth(page);
    await page.evaluate(() => {
      // La réussite mène à l'adoption puis au rechargement, qui perdrait la
      // capture : une promesse jamais réglée fige le parcours là, comme au cas ⑤.
      window.adopterCompteConnecte = () => new Promise(() => {});
      supa.auth.updateUser = async () => ({ data: null, error: { status: 422, code: "weak_password", message: "Password should be at least 8 characters." } });
      window.__telCap = []; window.__flushCap = [];
      _showPasswordRecoveryUI();
    });
    const bouton = page.locator("#pwdRecoveryBtn");
    await page.locator("#pwdRecoveryInput").fill("motdepasse123");

    // Refus du serveur.
    await bouton.click();
    await attendreSignal(page, "password_reset_done");
    await expect(bouton).toBeEnabled();
    expect(await capture(page)).toEqual([{ name: "password_reset_done", meta: { ok: false, rc: "mdp" } }]);
    // Rien ne recharge après un refus : aucun envoi forcé.
    expect(await page.evaluate(() => window.__flushCap)).toEqual([]);

    // Exception.
    await viderCapture(page);
    await page.evaluate(() => { supa.auth.updateUser = async () => { throw new TypeError("Failed to fetch"); }; });
    await bouton.click();
    await attendreSignal(page, "auth_exception");
    await expect(bouton).toBeEnabled();
    expect(await capture(page)).toEqual([{ name: "auth_exception", meta: { kind: "reset", rc: "reseau" } }]);
    // Ce formulaire ne propose JAMAIS de recharger : le lien qui l'a ouvert ne
    // sert qu'une fois, et un rechargement le condamne.
    await expect(page.locator("#pwdRecoveryMsg")).toHaveText("Erreur réseau.");
    await expect(page.locator("#pwdRecoveryMsg")).not.toContainText("Recharge");

    // Réussite : le signal, puis son envoi AVANT le rechargement.
    await viderCapture(page);
    await page.evaluate(() => { supa.auth.updateUser = async () => ({ data: { user: { id: "u1" } }, error: null }); });
    await bouton.click();
    await expect(page.locator("#pwdRecoveryMsg")).toHaveText("Mot de passe mis à jour.");
    const evs = await capture(page);
    expect(evs).toEqual([{ name: "password_reset_done", meta: { ok: true } }]);
    expect(await page.evaluate(() => window.__flushCap)).toEqual([{ keepalive: true }]);
    sansAdresse(evs);
  });

  // MUTATION : retirer l'un des cinq appels → rouge. Sans ce cas, la fonction
  // pourrait rester vivante et n'être appelée par PERSONNE — ou une sixième
  // porte naître avec un `kind` hors liste, que le filtre rendrait « autre ».
  test("⑬ contrat de source : les cinq portes appellent signalerExceptionAuth, chacune sous son nom, et « pas de connexion » ne se dit plus sans condition", async () => {
    const app02 = fs.readFileSync(SOURCE_APP02, "utf8");
    // Les APPELS (`…(x, e)`), pas la déclaration (`function …(kind, e) {`).
    const appels = [...app02.matchAll(/(?<!function )signalerExceptionAuth\(([^,()]+), e\)/g)].map((m) => m[1].trim());
    expect(appels.slice().sort()).toEqual(['"google"', '"recover"', '"resend"', '"reset"', "_mode"]);

    // Chaque porte porte SON nom : un `kind` recopié d'une porte à l'autre
    // fausserait le décompte sans rien casser.
    const corps = (debut, suivant) => {
      const i = app02.indexOf(debut);
      expect(i, debut).toBeGreaterThan(-1);
      const j = app02.indexOf(suivant, i);
      expect(j, suivant).toBeGreaterThan(i);
      return app02.slice(i, j);
    };
    const doAuth = corps("async function onbDoAuth() {", "async function onbSkipAuth() {");
    expect(doAuth).toContain("signalerExceptionAuth(_mode, e)");
    // La porte est figée AVANT le premier `await` : après, `switchAuthTab` a pu
    // changer `_authMode` (éprouvé en ⑨ (d)).
    const iFige = doAuth.indexOf("const _mode = _authMode;");
    expect(iFige).toBeGreaterThan(-1);
    expect(iFige).toBeLessThan(doAuth.indexOf("await "));
    expect(corps("async function onbForgotPassword() {", "function _showResendConfirmation(")).toContain('signalerExceptionAuth("recover", e)');
    expect(corps("async function onbResendConfirmation() {", "async function onbGoogleAuth() {")).toContain('signalerExceptionAuth("resend", e)');
    expect(corps("async function onbGoogleAuth() {", "async function _poserConsentementOAuth() {")).toContain('signalerExceptionAuth("google", e)');
    expect(corps("function _showPasswordRecoveryUI() {", "function _showAuthMsg(")).toContain('signalerExceptionAuth("reset", e)');

    // Les noms écrits aux portes sont ceux de la liste fermée, sans reste.
    const liste = JSON.parse(app02.match(/const PORTES_EXCEPTION_AUTH = (\[[^\]]*\]);/)[1]);
    expect(liste.slice().sort()).toEqual(["google", "recover", "resend", "reset", "signin", "signup"]);

    // « Pas de connexion internet » ne s'affiche qu'à un appareil qui se dit
    // hors ligne : par `authHorsLigne()` avant l'envoi, et par `messagePanneAuth`
    // — qui lit `navigator.onLine` lui aussi — pour un code « reseau ». Aucun
    // `catch` ne choisit plus ce texte lui-même (comportement : ③ ter).
    // `traduireRefusCaptcha` était le TROISIÈME chemin : il rendait ce texte à
    // tout échec réseau sans rien lire. Il passe par `messagePanneAuth` aussi
    // (comportement : lot13-entree ⑥), et la constante n'est plus RENDUE qu'à
    // un seul endroit.
    expect((app02.match(/return AUTH_HORS_LIGNE;/g) || []).length).toBe(0);
    expect((app02.match(/\bAUTH_HORS_LIGNE\b/g) || []).length).toBe(3);
    expect(corps("function traduireRefusCaptcha(m) {", "function authHorsLigne() {")).toContain('return messagePanneAuth("reseau");');
    expect((app02.match(/_showAuthMsg\(AUTH_HORS_LIGNE, "error"\)/g) || []).length).toBe(1);
    expect(app02).not.toMatch(/_showPanneAuth\(AUTH_HORS_LIGNE\)/);
    expect(app02).not.toMatch(/\? AUTH_HORS_LIGNE : AUTH_IMPREVU/);
    expect(app02).toContain('navigator.onLine === false) ? AUTH_HORS_LIGNE : AUTH_INJOIGNABLE');
  });

  // Le scénario T6 lui-même : le script du SDK ne se charge pas, `supa` reste
  // le client de repli, et AUCUNE requête d'authentification ne part — le
  // crochet réseau ne voit rien. Le signal en code fermé est la seule trace, et
  // « Recharge la page » la seule sortie (le SDK ne se recharge pas tout seul).
  // MUTATION : retirer la ligne « sdk » de rcRefusAuth → « Supabase non
  // disponible » s'affiche aux cinq portes et tout part en `rc: "autre"`, rouge.
  test("⑭ SDK non chargé : aux cinq portes, « Recharge la page » et rc « sdk » — jamais « Supabase non disponible »", async ({ page }) => {
    await ouvrirAuth(page, {}, { sdkCoupe: true });
    expect(await page.evaluate(() => ({ reel: !!window._supaReal, enLigne: navigator.onLine }))).toEqual({ reel: false, enLigne: true });
    const msg = page.locator("#authMsg");
    // Le même texte est attendu à chaque porte : on vide l'écran entre deux
    // gestes, sinon le message de la porte précédente ferait passer la suivante.
    const repartir = () => page.evaluate(() => {
      window.__telCap = [];
      document.getElementById("authMsg").textContent = "";
    });
    const verdict = async () => {
      await expect(msg).toContainText("Recharge la page");
      await expect(msg).not.toContainText("Supabase");
      await expect(msg).not.toContainText("Pas de connexion internet");
    };

    await remplirConnexion(page);
    await verdict();
    expect(await capture(page)).toEqual([
      { name: "auth_submitted", meta: { kind: "signin" } },
      { name: "signin_refused", meta: { rc: "sdk" } },
    ]);

    await repartir();
    await page.locator("#authForgotLink").click();
    await verdict();
    expect(await capture(page)).toEqual([{ name: "password_reset_requested", meta: { ok: false, rc: "sdk" } }]);

    await repartir();
    await page.locator("#authGoogleBtn").click();
    await verdict();
    expect(await capture(page)).toEqual([{ name: "google_refused", meta: { rc: "sdk" } }]);
    expect(await page.evaluate(() => localStorage.getItem("passio_oauth_pending"))).toBeNull();

    await repartir();
    await page.evaluate(() => _showResendConfirmation("bloque@exemple.com"));
    await page.locator("#authResendTop button").first().click();
    await verdict();
    expect(await capture(page)).toEqual([{ name: "confirmation_resent", meta: { ok: false } }]);

    await repartir();
    await remplirInscription(page);
    await verdict();
    const evs = await capture(page);
    expect(evs).toEqual([
      { name: "auth_submitted", meta: { kind: "signup" } },
      { name: "signup_refused", meta: { rc: "sdk" } },
    ]);
    sansAdresse(evs);
  });
});
