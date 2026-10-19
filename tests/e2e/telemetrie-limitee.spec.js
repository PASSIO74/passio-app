// ═══════════════════════════════════════════════════════════════════════════
// TÉLÉMÉTRIE — UN REFUS DE DÉBIT (429) GARDE LE LOT ET ATTEND LA MINUTE
//
// Contre-revue du 2026-10-16 (limiteur `trg_debit_lot`) : le refus de débit
// était un 400. Le client jetait le lot, émettait `server_reject` et relançait
// aussitôt — refusé à son tour, et ainsi de suite au rythme du réseau jusqu'à
// la minute suivante, en perdant tout ce qui était émis entre-temps. La base
// répond désormais PT429 (HTTP 429) ; ici, par OBSERVATION RÉSEAU :
//  ① après un 429, rien ne repart avant la minute suivante ;
//  ② le lot refusé n'est pas perdu : il repart, avec UNE trace `throttled` ;
//  ③ aucun `server_reject`, aucun `send_failed` (« appareil peut-être hors
//     ligne ») : l'appareil est joignable, il est seulement limité.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");
const { sansDonneesDistantes } = require("./app-helper");

test("un 429 garde le lot, attend la minute suivante, et ne déclare ni rejet ni panne", async ({ page }) => {
  test.setTimeout(60000);
  await sansDonneesDistantes(page);
  const envois = [];
  let refuser = true;
  await page.route("**/rest/v1/telemetry_events*", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    let rows = [];
    try { rows = JSON.parse(req.postData() || "[]"); } catch (e) { rows = []; }
    envois.push({ refuse: refuser, actions: rows.map((r) => r.action), types: rows.map((r) => r.type) });
    if (refuser) {
      return route.fulfill({ status: 429, contentType: "application/json",
        body: JSON.stringify({ code: "PT429", message: "rate limit: anonymes plein (1600 lignes/minute)", hint: "30" }) });
    }
    return route.fulfill({ status: 201, contentType: "application/json", body: "" });
  });
  await page.clock.install();
  await page.addInitScript(([k, t]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
  }, [GATE_KEY, GATE_TOKEN]);
  await page.goto("/index.html?telemetry=1");
  // L'application a démarré : identité résolue (app-08) et configuration d'envoi posée.
  await page.waitForFunction(() => window.tel && window.PASSIO_SUPABASE && typeof getMyUserId === "function" && !!getMyUserId(), null, { timeout: 15000 });

  // Le premier lot refusé peut être celui du démarrage ou celui-ci : dans les
  // deux cas `banc_limite` doit arriver, une fois la minute passée.
  await page.evaluate(() => { window.tel.action("banc_limite", {}); window.tel.flush(); });
  await expect.poll(() => envois.length, { timeout: 10000 }).toBeGreaterThanOrEqual(1);
  const apresRefus = envois.length;

  // ① jusqu'à la minute suivante (horloge de la page), avec des événements émis
  // entre-temps — dont une erreur, qui appelle flush() DIRECTEMENT — et un retour
  // au premier plan, qui retire le minuteur : rien n'est reparti.
  const avantMinute = await page.evaluate(() => 60000 - (Date.now() % 60000) - 500);
  await page.evaluate(() => {
    for (let i = 0; i < 15; i++) window.tel.action("banc_pendant", { i });
    window.tel.error(new Error("banc pendant l'attente"), {});
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(avantMinute);
  expect(envois.length, "un 429 relance avant la minute suivante : la boucle de refus est revenue").toBe(apresRefus);

  // ② la minute passe : le lot repart, rien n'est perdu, une seule trace `throttled`.
  refuser = false;
  await page.clock.fastForward(75000);
  await expect.poll(() => envois.filter((e) => !e.refuse).flatMap((e) => e.actions).includes("banc_limite"), { timeout: 10000 }).toBe(true);
  const acceptees = envois.filter((e) => !e.refuse).flatMap((e) => e.actions);
  expect(acceptees.filter((a) => a === "banc_pendant").length, "les événements émis pendant l'attente sont perdus").toBe(15);
  expect(acceptees.filter((a) => a === "throttled").length, "une trace par épisode").toBe(1);
  expect(envois.filter((e) => !e.refuse).flatMap((e) => e.types), "l'erreur émise pendant l'attente est perdue").toContain("error");

  // ③ ni rejet ni panne déclarés
  const toutes = envois.flatMap((e) => e.actions);
  expect(toutes).not.toContain("server_reject");
  expect(toutes).not.toContain("send_failed");
});
