// ═══════════════════════════════════════════════════════════════════════════
// TÉLÉMÉTRIE — LA BOUCLE DE DÉMARRAGE NE COURT-CIRCUITE PAS LE BACKOFF
//
// `waitCfg` (js/telemetry.js) attend que la configuration d'envoi soit posée.
// Elle appelait `flush()` toutes les 500 ms tant que la file n'était pas vide,
// jusqu'à 60 s, sans égard pour le minuteur de réessai. Mesuré en test : 7 refus
// du jeton en 2,5 s au lieu de ~32 s, puis les lignes d'un vrai compte partaient
// désattribuées. Mesuré en production (edge logs, 7 jours) : 12 grappes de 2 à 6
// refus, aucun écart au-dessus de 726 ms au lieu des 1,5 s annoncées.
//
// Récit et mesures : docs/journal/telemetrie-pilotage-sentinelle.md, fiche du
// 2026-11-07 « ⏳ LA BOUCLE DE DÉMARRAGE ».
//
// Les écarts se mesurent à l'ARRIVÉE sur la route, côté Node, en temps réel —
// jamais par le code qui les arme : c'est ce qu'un serveur en panne subit.
//  ① un jeton refusé : 1,5 s, 3 s, 4,5 s entre deux tentatives ;
//  ② une panne réseau : 3 s, puis 6 s ;
//  ③ un réessai armé AVANT que la boucle voie la configuration n'est pas devancé ;
//  ④ le minuteur de lot, armé pendant un envoi en vol, ne le devance pas non plus ;
//  ⑤ ⑥ le rejeu du backlog au démarrage survit, même quand la configuration
//     arrive tard, même quand le premier lot échoue : c'est pour lui que la
//     boucle existe.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");
const { onboardedState, sansDonneesDistantes } = require("./app-helper");

const REF = "njkiyoklssvefstljemx";
const UID = "8a9e2c40-1b6d-4f0e-9c3a-2f7d5e6a1b23";

function jetonMort() {
  return JSON.stringify({
    access_token: "dead.dead.dead", refresh_token: "dead", token_type: "bearer",
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 3600,
    user: { id: UID, aud: "authenticated", role: "authenticated" },
  });
}

// Le SDK, lui, ne doit pas résoudre le scénario à notre place : son
// rafraîchissement reste en attente, le jeton mort reste dans le stockage.
async function sansRafraichissement(page) {
  await page.route("**/auth/v1/token*", () => { /* jamais de réponse */ });
}

function ecarts(instants) {
  return instants.slice(1).map((t, i) => t - instants[i]);
}

// Le code annonce un délai ; le réseau ne peut que l'allonger. Une tolérance de
// 300 ms couvre le temps entre la réponse à la route et le passage côté page,
// sans laisser passer le rythme de 500 ms de l'ancienne boucle.
function attendreAuMoins(mesures, attendus, quoi) {
  attendus.forEach((attendu, i) => {
    expect(mesures[i], `${quoi} n° ${i + 1} : ${attendu} ms annoncées, écarts mesurés ${JSON.stringify(mesures)}`)
      .toBeGreaterThanOrEqual(attendu - 300);
  });
}

const CFG = { url: "https://" + REF + ".supabase.co", anon: "anon-banc" };
const PAGE_SEULE = "/banc-telemetrie-demarrage.html";

function backlog(n) {
  const t = new Date().toISOString();
  return Array.from({ length: n }, (_, i) => ({ event_id: "banc_backlog_" + i, type: "action", action: "banc_backlog", client_ts: t, env: "development" }));
}

// Une page qui ne charge QUE js/telemetry.js. `arrivees` : un élément par POST,
// horodaté à l'arrivée sur la route. Par défaut le serveur accepte.
async function telemetrieSeule(page, { config, backlog: lignes = [], apres = "", repondre }) {
  await sansDonneesDistantes(page);
  const arrivees = [];
  await page.route("**/rest/v1/telemetry_events*", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    let rows = [];
    try { rows = JSON.parse(req.postData() || "[]"); } catch (e) { rows = []; }
    arrivees.push({ t: Date.now(), ids: rows.map((r) => r.event_id) });
    if (repondre) return repondre(route);
    return route.fulfill({ status: 201, contentType: "application/json", body: "" });
  });
  const avant = (config ? "window.PASSIO_SUPABASE = " + JSON.stringify(CFG) + ";" : "")
    + "localStorage.setItem('passio_tel_backlog', " + JSON.stringify(JSON.stringify(lignes)) + ");";
  const html = "<!doctype html><title>banc</title><script>" + avant + "</script>"
    + '<script src="/js/telemetry.js"></script><script>' + apres + "</script>";
  await page.route("**" + PAGE_SEULE + "*", (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto(PAGE_SEULE + "?telemetry=1");
  return { arrivees };
}

test.describe("Télémétrie — le démarrage respecte le backoff", () => {
  test("① un jeton refusé se réessaie à 1,5 s, 3 s puis 4,5 s, sans repli prématuré", async ({ page }) => {
    test.setTimeout(60000);
    await sansDonneesDistantes(page);
    await sansRafraichissement(page);
    const refus = [];
    const anonymes = [];
    await page.route("**/rest/v1/telemetry_events*", async (route) => {
      const req = route.request();
      if (req.method() !== "POST") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      const auth = (req.headers()["authorization"] || "").replace(/^Bearer\s+/i, "");
      if (auth === (req.headers()["apikey"] || "")) {
        anonymes.push({ t: Date.now(), actions: JSON.parse(req.postData() || "[]").map((r) => r.action) });
        return route.fulfill({ status: 201, contentType: "application/json", body: "" });
      }
      refus.push(Date.now());
      return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "PGRST301", message: "JWT expired" }) });
    });
    await page.addInitScript(([k, t, st, jeton, uid, ref]) => {
      sessionStorage.setItem(k, t);
      sessionStorage.setItem("passio_pwa_dismissed", "1");
      localStorage.setItem("sb-" + ref + "-auth-token", jeton);
      if (!localStorage.getItem("passio_mvp_state_v1")) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
      localStorage.setItem("passio_uid", uid);
    }, [GATE_KEY, GATE_TOKEN, onboardedState(1), jetonMort(), UID, REF]);
    await page.goto("/index.html?telemetry=1");

    // Le scénario est bien celui d'un compte : c'est sa grâce qu'on mesure.
    await page.waitForFunction((uid) => typeof getMyUserId === "function" && getMyUserId() === uid && window.MY_UID === uid, UID, { timeout: 15000 });

    // Quatre refus suffisent pour trois écarts (1,5 + 3 + 4,5 s = ~9 s).
    await expect.poll(() => refus.length, { timeout: 30000, intervals: [250] }).toBeGreaterThanOrEqual(4);
    const mesures = ecarts(refus.slice(0, 4));
    attendreAuMoins(mesures, [1500, 3000, 4500], "réessai du jeton");

    // Rien n'est désattribué avant la fin de la grâce : un repli ici voudrait dire
    // que le compte a perdu l'attribution pendant que le SDK rafraîchissait encore.
    expect(anonymes.flatMap((e) => e.actions), "aucun repli pendant la grâce").not.toContain("auth_desattribue");
  });

  test("② une panne réseau se réessaie à 3 s puis 6 s, pas toutes les 500 ms", async ({ page }) => {
    test.setTimeout(60000);
    await sansDonneesDistantes(page);
    const tentatives = [];
    await page.route("**/rest/v1/telemetry_events*", async (route) => {
      if (route.request().method() !== "POST") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      tentatives.push(Date.now());
      return route.abort("failed");
    });
    await page.addInitScript(([k, t]) => {
      sessionStorage.setItem(k, t);
      sessionStorage.setItem("passio_pwa_dismissed", "1");
    }, [GATE_KEY, GATE_TOKEN]);
    await page.goto("/index.html?telemetry=1");

    await expect.poll(() => tentatives.length, { timeout: 30000, intervals: [250] }).toBeGreaterThanOrEqual(3);
    attendreAuMoins(ecarts(tentatives.slice(0, 3)), [3000, 6000], "réessai après panne");
  });

  // ─── telemetry.js SEUL : aucune autre source d'événements, donc aucun minuteur
  // d'`enqueue` qui ferait partir la file à la place de ce qu'on mesure. ───────
  test("③ un réessai déjà armé quand la configuration est vue n'est pas devancé", async ({ page }) => {
    test.setTimeout(30000);
    // Configuration prête d'emblée, envoi forcé à t = 0 : la panne arme le réessai
    // de 3 s AVANT la première lecture de la configuration par la boucle (500 ms).
    const { arrivees } = await telemetrieSeule(page, { config: true, apres: "window.tel.flush();", repondre: (route) => route.abort("failed") });
    await expect.poll(() => arrivees.length, { timeout: 15000, intervals: [100] }).toBeGreaterThanOrEqual(2);
    attendreAuMoins(ecarts(arrivees.slice(0, 2).map((a) => a.t)), [3000], "réessai armé avant la boucle");
  });

  test("④ le minuteur d'un événement émis pendant un envoi en vol ne devance pas le réessai", async ({ page }) => {
    test.setTimeout(30000);
    // L'envoi reste en vol 1,5 s. L'événement émis à 0,7 s arme le minuteur de lot
    // (3 s) AVANT que la panne arme le réessai : sans garde, le minuteur repart à
    // ~3,7 s du premier envoi, au milieu d'un backoff qui court jusqu'à ~4,5 s.
    // ⚠️ Pas plus tôt que la tournée de la boucle (500 ms) : son `flush` annule le
    // minuteur, et le test restait vert sans la garde — vu par réinjection.
    let enVol;
    const repondu = new Promise((r) => { enVol = r; });
    let premier = true;
    const { arrivees } = await telemetrieSeule(page, {
      config: true,
      apres: "window.tel.flush();",
      repondre: async (route) => {
        if (premier) { premier = false; await repondu; }
        return route.abort("failed");
      },
    });
    await expect.poll(() => arrivees.length, { timeout: 15000, intervals: [50] }).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(700);
    await page.evaluate(() => { window.tel.action("banc_en_vol", {}); });
    await page.waitForTimeout(800);
    enVol();
    await expect.poll(() => arrivees.length, { timeout: 15000, intervals: [100] }).toBeGreaterThanOrEqual(2);
    attendreAuMoins(ecarts(arrivees.slice(0, 2).map((a) => a.t)), [4500], "réessai après un envoi resté en vol 1,5 s");
  });

  test("⑤ le backlog d'une visite précédente repart dès que la configuration arrive, même tard", async ({ page }) => {
    test.setTimeout(30000);
    const { arrivees } = await telemetrieSeule(page, { config: false, backlog: backlog(1) });
    // Le minuteur du premier événement a eu le temps de partir pour rien : sans
    // configuration, `flush` ne fait rien et ne réarme rien.
    await page.waitForTimeout(3500);
    expect(arrivees, "rien ne part sans configuration").toEqual([]);

    const pose = Date.now();
    await page.evaluate((cfg) => { window.PASSIO_SUPABASE = cfg; }, CFG);
    await expect.poll(() => arrivees.flatMap((a) => a.ids).filter((id) => id === "banc_backlog_0").length,
      { message: "l'événement du backlog repart une fois la configuration posée", timeout: 15000, intervals: [100] }).toBe(1);
    // Une tournée de boucle (500 ms) et un aller-retour : c'est elle qui le fait
    // partir, pas le prochain événement émis par la page.
    expect(arrivees[0].t - pose, "la boucle relance la file sans attendre un autre événement").toBeLessThan(2000);
  });

  test("⑥ un backlog de 130 lignes repart en entier, une seule fois, même si le premier lot échoue", async ({ page }) => {
    test.setTimeout(45000);
    let premier = true;
    const { arrivees } = await telemetrieSeule(page, {
      config: true,
      backlog: backlog(130),
      repondre: (route) => {
        if (premier) { premier = false; return route.fulfill({ status: 503, contentType: "application/json", body: "{}" }); }
        return route.fulfill({ status: 201, contentType: "application/json", body: "" });
      },
    });
    const recus = () => arrivees.slice(1).flatMap((a) => a.ids).filter((id) => id.startsWith("banc_backlog_"));
    await expect.poll(() => new Set(recus()).size,
      { message: "toutes les lignes du backlog sont reçues", timeout: 30000, intervals: [250] }).toBe(130);
    expect(recus().length, "aucune ligne en double").toBe(130);
    // Le lot refusé n'a pas été retenté par la boucle : le réessai de 3 s a tenu.
    attendreAuMoins(ecarts(arrivees.slice(0, 2).map((a) => a.t)), [3000], "réessai du backlog");
  });
});
