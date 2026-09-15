// UXO-02 — MODE « SESSION EXPIRÉE » : le compte est là, la session ne l'est pas.
//
// LE DÉFAUT (contre-revue Astra, fiche 18 § UXO-02) : un appareil qui PORTE un
// compte (état local complet, jeton SDK persisté) mais dont la session n'est
// pas retrouvée au démarrage (hors ligne, jeton impossible à rafraîchir)
// sortait de `boot()` par `showLanding()` — la landing par-dessus un fil
// pourtant complet, application inaccessible hors ligne. Entrer « comme si de
// rien » n'était pas possible : `MY_UID` porte l'uuid SANS jeton, chaque
// écriture repartirait en 401 (famille refermée le 13/09).
//
// Cette suite exige : ① le fil local s'ouvre, en lecture, avec le bandeau
// (RÉINJECTION : sur le code d'avant, la landing est active et il n'y a pas de
// bandeau) ; ② sans jeton persisté, RIEN ne change (la landing, comme avant —
// c'est aussi l'état de tout banc local) ; ③ l'état ne part pas et sa file est
// gardée ; ④ la file des messages est gardée intacte, jamais marquée « échec » ;
// ⑤ une action engageante est refusée et le DIT, avec la sortie ; ⑥ « Se
// reconnecter » ouvre le formulaire SANS purger l'état local ; ⑦ un jeton qui
// se rafraîchit rétablit la session ; ⑧ le câblage, à la source.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { bootOnboarded } = require("./app-helper");

const UID = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const REF = "njkiyoklssvefstljemx";
const CLE_JETON = "sb-" + REF + "-auth-token";

// Hors ligne : TOUT supabase.co échoue en réseau (le SDK réel de la CI garde
// alors le jeton — une erreur réseau n'est pas un jeton invalide).
async function banc(page, { jeton = true } = {}) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript(([u, cle, avecJeton]) => {
    localStorage.setItem("passio_uid", u);
    if (avecJeton && !localStorage.getItem(cle)) {
      localStorage.setItem(cle, JSON.stringify({
        access_token: "jeton-de-banc", refresh_token: "r", token_type: "bearer",
        expires_at: Math.floor(Date.now() / 1000) - 600, user: { id: u },
      }));
    }
  }, [UID, CLE_JETON, jeton]);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  // Hors ligne, le SDK réessaie le rafraîchissement ; `boot()` borne l'attente
  // à 8 s (DELAI_SESSION_BOOT_MS) avant d'entrer dans le mode.
  if (jeton) await page.waitForFunction(() => window._sessionExpiree === true, null, { timeout: 15000 }).catch(() => {});
  const premisse = await page.evaluate(() => ({
    url: String((window.PASSIO_SUPABASE && window.PASSIO_SUPABASE.url) || ""), uid: MY_UID,
  }));
  expect(premisse.url, "prémisse : la cible est le projet dont le jeton porte la clé").toContain(REF);
  expect(premisse.uid, "prémisse : le banc démarre sous le compte").toBe(UID);
}

function etat(page) {
  return page.evaluate(() => ({
    expiree: window._sessionExpiree === true,
    landing: !!document.querySelector("#landing.active"),
    feed: document.body.classList.contains("screen-feed-active"),
    bandeau: (function () { var b = document.getElementById("sessionExpireeBandeau"); return b ? getComputedStyle(b).display !== "none" : false; })(),
    classe: document.documentElement.classList.contains("passio-session-expiree"),
  }));
}

test.describe("UXO-02 — session expirée : le fil local, en lecture", () => {
  test("① compte + jeton persisté, session absente : le fil s'ouvre, bandeau posé, pas de landing", async ({ page }) => {
    await banc(page);
    const e = await etat(page);
    // RÉINJECTION : sur le code d'avant, `landing` est true et `bandeau` false.
    expect(e.expiree, "le mode est posé").toBe(true);
    expect(e.landing, "la landing ne recouvre pas le fil").toBe(false);
    expect(e.feed).toBe(true);
    expect(e.bandeau, "le bandeau « Session expirée » est à l'écran").toBe(true);
    expect(e.classe).toBe(true);
    await expect(page.locator("#sessionExpireeBandeau")).toContainText(/Session expirée/);
    await expect(page.locator("#sessionExpireeReconnecter")).toHaveText(/Se reconnecter/);
  });

  test("② sans jeton persisté : rien ne change — la landing, comme avant", async ({ page }) => {
    await banc(page, { jeton: false });
    // `bootOnboarded` retire `#landing.active` lui-même : on mesure le mode et le bandeau.
    const e = await etat(page);
    expect(e.expiree, "aucune session n'a jamais existé : pas de mode").toBe(false);
    expect(e.bandeau).toBe(false);
    expect(e.classe).toBe(false);
    expect(await page.evaluate(() => _peutPousserEtat()), "les écritures d'état restent ouvertes hors du mode").toBe(true);
  });

  test("③ l'état ne part pas, et sa file de secours est GARDÉE", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window._supaReal = true;
      window.__ops = [];
      const vrai = window.supa;
      window.supa = { ...vrai, from: (t) => { window.__ops.push(t); const q = { select: () => q, eq: () => q, upsert: () => q, insert: () => q, update: () => q, maybeSingle: async () => ({ data: null, error: null }), then: (f) => f({ data: null, error: null }) }; return q; } };
      // Une file laissée par une session précédente coupée en plein vol.
      const cle = "passio_pending_user_state_" + MY_UID;
      localStorage.setItem(cle, JSON.stringify({ user_id: MY_UID, state: { onboarded: true }, updated_at: new Date().toISOString() }));
      const peut = _peutPousserEtat();
      saveState();                                   // arme le debounce de 2,5 s
      await supaSaveUserState();                      // l'envoi direct
      await _flushPendingUserState();                 // le rejeu
      await new Promise((r) => setTimeout(r, 3000));  // le debounce a eu le temps de tirer
      return { peut, ops: window.__ops.filter((t) => t === "user_state").length, file: localStorage.getItem(cle) !== null };
    });
    expect(r.peut, "_peutPousserEtat refuse en mode expiré").toBe(false);
    expect(r.ops, "aucune écriture user_state n'est partie").toBe(0);
    expect(r.file, "la file de secours est conservée pour la reconnexion").toBe(true);
  });

  test("④ la file des messages est gardée intacte — ni envoyée, ni jetée, ni marquée « échec »", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window._supaReal = true;
      window.__ops = [];
      const vrai = window.supa;
      window.supa = { ...vrai, from: (t) => { window.__ops.push(t); const q = { insert: () => q, select: () => q, eq: () => q, then: (f) => f({ data: [], error: null }) }; return q; } };
      const entree = { convId: "conv_x", msgId: "m_exp_1", content: "texte écrit hors ligne", at: Date.now(), essais: 0, owner: MY_UID };
      localStorage.setItem("passio_outbox_v1", JSON.stringify([entree]));
      _flushOutbox();
      await new Promise((r) => setTimeout(r, 300));
      const file = JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]");
      return { n: file.length, owner: file[0] && file[0].owner, essais: file[0] && file[0].essais, ops: window.__ops.length };
    });
    expect(r.n, "l'entrée est toujours en file").toBe(1);
    expect(r.owner).toBe(UID);
    expect(r.essais, "aucun essai consommé").toBe(0);
    expect(r.ops, "rien n'est parti").toBe(0);
  });

  test("⑤ une action engageante est refusée, et la fenêtre dit pourquoi et par où sortir", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(() => {
      const ok = requireAuthentication("aimer");
      const m = document.querySelector("#modal, .modal.active, .modal-sheet.active") || document.body;
      return { ok, texte: document.body.innerText };
    });
    expect(r.ok, "l'action ne part pas").toBe(false);
    expect(r.texte).toMatch(/Reconnecte-toi pour aimer/);
    expect(r.texte).toMatch(/Ta session a expiré/);
    await expect(page.locator("button", { hasText: "Se reconnecter" }).first()).toBeVisible();
  });

  test("⑥ « Se reconnecter » ouvre le formulaire de connexion SANS purger l'état local", async ({ page }) => {
    await banc(page);
    const avant = await page.evaluate(() => ({ st: localStorage.getItem("passio_mvp_state_v1") !== null, uid: localStorage.getItem("passio_uid") }));
    await page.click("#sessionExpireeReconnecter");
    // Hors ligne : la tentative de rafraîchissement est bornée à 4 s (DELAI_RECONNEXION_MS), puis le formulaire.
    await page.waitForFunction(() => !!document.querySelector("#onboarding.active"), null, { timeout: 8000 });
    const apres = await page.evaluate(() => ({ st: localStorage.getItem("passio_mvp_state_v1") !== null, uid: localStorage.getItem("passio_uid"), auth: !!document.querySelector("#onboarding.active") }));
    expect(apres.auth).toBe(true);
    expect(avant.st && apres.st, "l'état local du compte survit").toBe(true);
    expect(apres.uid, "passio_uid survit").toBe(UID);
  });

  test("⑦ un jeton qui se rafraîchit rétablit la session (et le dit)", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window._supaReal = true;
      window.__toasts = []; window.toast = (t) => window.__toasts.push(String(t));
      window.__reload = 0;
      // `supa` est un `let` de portée script : on MUTE le client, on ne remplace pas le binding.
      Object.defineProperty(window.supa.auth, "refreshSession", { configurable: true, value: async () => ({ data: { session: { user: { id: MY_UID }, access_token: "neuf" } }, error: null }) });
      const ok = await reconnecterSession();
      return { ok, toasts: window.__toasts.slice(), form: !!document.querySelector("#onboarding.active") };
    });
    expect(r.ok).toBe(true);
    expect(r.toasts.some((t) => /Session rétablie/.test(t))).toBe(true);
    expect(r.form, "pas de formulaire quand la session revient d'elle-même").toBe(false);
  });

  test("⑧ le câblage, à la source : boot() entre dans le mode avant la landing, et la session revenue recharge", async () => {
    const app08 = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-08-ui-modals-tour.js"), "utf8");
    const iEntree = app08.indexOf("if (entrerEnSessionExpiree()) return;");
    expect(iEntree, "boot() appelle entrerEnSessionExpiree").toBeGreaterThan(0);
    expect(app08.slice(iEntree, iEntree + 90), "…juste avant showLanding()").toMatch(/entrerEnSessionExpiree\(\)\) return;\r?\n\r?\n  showLanding\(\);\r?\n\}/);
    expect(app08, "l'attente de session au démarrage est bornée").toMatch(/Promise\.race\(\[\s*supa\.auth\.getSession\(\)/);
    expect(app08).toMatch(/session\?\.user && window\._sessionExpiree === true/);
    const app02 = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-02-state-utils.js"), "utf8");
    expect(app02).toMatch(/function _peutPousserEtat\(\) \{\s*\/\/[^\r\n]*\r?\n\s*if \(sessionExpiree\(\)\) return false;/);
  });
});
