// ═══════════════════════════════════════════════════════════════════════════
// TÉLÉMÉTRIE À L'ÉCHELLE — LES SIGNAUX DE PANNE PASSENT D'ABORD, LA MESURE DE
// PERFORMANCE CESSE DE SE RÉPÉTER, UN CLIC LENT SE VOIT (2026-11-20)
//
// Audit « 100 000 utilisateurs » (AFF-02, CLIC-04, CLIC-03), mesuré sur 72 h de
// production : 77 % des lignes de télémétrie sont des `perf`, dont 83 % de
// photos `ios_stat_*` « periodic » — l'agrégat CUMULÉ de chaque métrique,
// réémis toutes les 3 min même inchangé, même onglet masqué. À 2 000–5 000
// onglets ouverts, ce flux seul dépasse le plafond de débit de la base
// (4 200 lignes/min), qui refuse les lots ENTIERS en 429 ; et la file de
// l'appareil jetait « les plus anciens » quel que soit leur type, puis
// recomposait le lot suivant dans l'ordre d'arrivée. Une erreur, la fin d'un
// flow, un clic mort partaient avec les photos — au moment exact où la
// Sentinelle et la veille en ont besoin.
//
// Ce banc garde :
//   ① une métrique `ios_stat_*` ne repart que si son `n` a bougé ;
//   ② le battement périodique ne photographie rien onglet masqué, ni sous
//      délestage — et photographie quand l'onglet est visible ;
//   ③ au débordement de la file, ce sont les non-critiques qui partent, pas
//      les erreurs ;
//   ④ le lot qui part porte les signaux de panne EN TÊTE ;
//   ⑤ un clic dont le gestionnaire bloque 1,5 s est mesuré (≥ 1,4 s, `warn`,
//      `lent`) au lieu de partir avec `ms: null` ; un clic vif reste `info`.
//
// ⚠️ AUCUN OCTET NE PART VERS LA TABLE DE PRODUCTION : tous les POST vers
// `telemetry_events` sont interceptés (201 simulé, ou retenus en vol), et le
// reste du démarrage vise le projet Supabase VIDE.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { poserGateSansPremiereVisite } = require("./gate-helper");
const { projetSupabaseVide } = require("./app-helper");

const MOTIF_TEL = "**/rest/v1/telemetry_events*";

// Intercepteur : « ok » répond 201, « retenu » garde la requête EN VOL jusqu'à
// ce que le banc la règle. Chaque lot est journalisé avec ses lignes.
async function intercepter(page) {
  await projetSupabaseVide(page);
  const etat = { mode: "ok", lots: [], retenus: [] };
  await page.route(MOTIF_TEL, (route) => {
    let rows = [];
    try { rows = JSON.parse(route.request().postData() || "[]"); } catch (e) { rows = []; }
    if (!Array.isArray(rows)) rows = [];
    const lot = { mode: etat.mode, rows };
    etat.lots.push(lot);
    if (etat.mode === "retenu") { etat.retenus.push(route); return undefined; }
    return route.fulfill({ status: 201, body: "" });
  });
  return etat;
}

async function charger(page, etat) {
  await poserGateSansPremiereVisite(page);
  await page.goto("/index.html?telemetry=1");
  await page.waitForSelector("#landing.active", { timeout: 30000 });
  expect(await page.evaluate(() => !!(window.tel && window.tel.enabled)), "télémétrie active").toBe(true);
  expect(await page.evaluate(() => !!window.PassioPerf), "perf-ios chargé").toBe(true);
  await expect.poll(() => etat.lots.length, { message: "aucun lot de télémétrie en 30 s", timeout: 30000 }).toBeGreaterThan(0);
  // Laisse partir ce que le démarrage a encore en file : chaque cas part d'une
  // file vide, sans envoi en vol.
  await page.waitForTimeout(3500);
  await page.evaluate(() => window.tel.flush());
  await page.waitForTimeout(500);
}

const lignes = (etat) => etat.lots.flatMap((l) => l.rows);
// Le client plafonne à 400 événements/minute/onglet (`overCap`, horloge
// `Date.now`). Pour faire DÉBORDER la file de 300 sans attendre une minute, le
// banc décale `Date.now` d'une minute par salve — chaque salve tombe dans son
// propre créneau. Sans ce décalage, le cas pourrait passer au vert faute de
// débordement, sans rien prouver : il vérifie donc aussi que la file est PLEINE.
// (Posé par `page.evaluate`, pas par une balise <script> : la CSP de l'app
// refuserait un script en ligne.)
function installerSalves() {
  window.__salves = function (salves) {
    const vrai = Date.now;
    try {
      salves.forEach(function (salve, k) {
        const decal = (k + 1) * 61000;
        Date.now = function () { return vrai.call(Date) + decal; };
        salve();
      });
    } finally { Date.now = vrai; }
  };
}
const prioritaire = (r) => ["error", "connectivity", "link", "flow", "rt_recv"].includes(r.type) || ["warn", "error", "critical"].includes(r.severity);
const statsDe = (etat, nom) => lignes(etat).filter((r) => r.type === "perf" && r.action === "ios_stat_" + nom);

async function vider(page, etat, attendu, message) {
  await page.evaluate(() => window.tel.flush());
  await expect.poll(() => attendu(), { message, timeout: 10000 }).toBe(true);
}

test.describe("Télémétrie à l'échelle — priorité aux pannes, mesure sans répétition", () => {
  test("① une métrique ne repart que si son n a bougé", async ({ page }) => {
    const etat = await intercepter(page);
    await charger(page, etat);

    await page.evaluate(() => {
      const p = window.PassioPerf;
      p.record("banc_a", 10); p.record("banc_b", 20);
      p.snapshot("t1");
    });
    await vider(page, etat, () => statsDe(etat, "banc_a").length === 1 && statsDe(etat, "banc_b").length === 1,
      "la première photo n'a pas émis banc_a et banc_b");

    // Rien de neuf : la photo suivante ne répète AUCUNE des deux.
    await page.evaluate(() => window.PassioPerf.snapshot("t2"));
    await page.evaluate(() => window.tel.flush());
    await page.waitForTimeout(1200);
    expect(statsDe(etat, "banc_a").length, "banc_a réémise sans nouvel échantillon").toBe(1);
    expect(statsDe(etat, "banc_b").length, "banc_b réémise sans nouvel échantillon").toBe(1);

    // Un nouvel échantillon de banc_a : SEULE banc_a repart, avec son n à jour.
    await page.evaluate(() => { window.PassioPerf.record("banc_a", 30); window.PassioPerf.snapshot("t3"); });
    await vider(page, etat, () => statsDe(etat, "banc_a").length === 2, "banc_a n'est pas repartie après un échantillon");
    const derniere = statsDe(etat, "banc_a")[1];
    expect(derniere.meta && derniere.meta.n, "n à jour sur la ligne réémise").toBe(2);
    expect(statsDe(etat, "banc_b").length, "banc_b repartie alors qu'elle n'a pas bougé").toBe(1);
  });

  test("② la photo périodique : rien onglet masqué ni sous délestage, une photo onglet visible", async ({ page }) => {
    const etat = await intercepter(page);
    await charger(page, etat);
    await page.evaluate(() => {
      window.__masque = false; window.__facteur = 1;
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (window.__masque ? "hidden" : "visible") });
      window.delestageFacteur = () => window.__facteur;
    });

    // Onglet masqué : le battement ne photographie pas, même avec du neuf.
    const masque = await page.evaluate(() => {
      window.__masque = true;
      window.PassioPerf.record("banc_masque", 5);
      return window.PassioPerf._tickPeriodique();
    });
    expect(masque, "battement accepté onglet masqué").toBe(false);

    // Sous délestage (×2 puis ×4) : pas de photo périodique non plus.
    for (const f of [2, 4]) {
      const deleste = await page.evaluate((fac) => { window.__masque = false; window.__facteur = fac; return window.PassioPerf._tickPeriodique(); }, f);
      expect(deleste, `battement accepté sous délestage ×${f}`).toBe(false);
    }
    await page.evaluate(() => window.tel.flush());
    await page.waitForTimeout(5000);   // whenIdle peut attendre jusqu'à 4 s
    expect(statsDe(etat, "banc_masque").length, "photo périodique émise onglet masqué ou sous délestage").toBe(0);

    // Visible et sans délestage : la photo part, avec la métrique restée en attente.
    const visible = await page.evaluate(() => { window.__facteur = 1; return window.PassioPerf._tickPeriodique(); });
    expect(visible, "battement refusé onglet visible").toBe(true);
    await expect.poll(async () => { await page.evaluate(() => window.tel.flush()); return statsDe(etat, "banc_masque").length; },
      { message: "la photo périodique n'est pas partie onglet visible", timeout: 10000 }).toBe(1);
    expect(statsDe(etat, "banc_masque")[0].meta.phase).toBe("periodic");
  });

  test("③ au débordement de la file, les erreurs restent — les non-critiques partent", async ({ page }) => {
    const etat = await intercepter(page);
    await charger(page, etat);
    // Un envoi reste EN VOL : la file s'accumule sans partir (`sending`).
    etat.mode = "retenu";
    await page.evaluate(() => { window.tel.action("banc_amorce"); window.tel.flush(); });
    await expect.poll(() => etat.retenus.length, { message: "l'envoi d'amorce n'est pas parti", timeout: 10000 }).toBe(1);

    // Les erreurs d'abord (les PLUS ANCIENNES de la file), puis de quoi déborder.
    await page.evaluate(installerSalves);
    const file = await page.evaluate(() => {
      for (let i = 0; i < 5; i++) window.tel.track("error", "banc_erreur_" + i, { severity: "error", status: "error" });
      window.__salves([0, 1].map((k) => () => { for (let i = 0; i < 180; i++) window.tel.action("banc_bruit_" + k + "_" + i); }));
      return window.tel._queue().map((e) => ({ type: e.type, action: e.action }));
    });
    // 5 erreurs + 360 bruits + l'amorce > 300 : la file a DÛ déborder.
    expect(file.length, "la file n'a pas débordé : le cas ne prouverait rien").toBe(300);
    const erreurs = file.filter((e) => e.type === "error" && /^banc_erreur_/.test(e.action));
    expect(erreurs.length, "des erreurs ont été jetées au débordement").toBe(5);

    etat.mode = "ok";
    for (const r of etat.retenus) await r.fulfill({ status: 201, body: "" }).catch(() => {});
  });

  test("④ le lot qui part porte les signaux de panne en tête", async ({ page }) => {
    const etat = await intercepter(page);
    await charger(page, etat);
    etat.mode = "retenu";
    await page.evaluate(() => { window.tel.action("banc_amorce"); window.tel.flush(); });
    await expect.poll(() => etat.retenus.length, { message: "l'envoi d'amorce n'est pas parti", timeout: 10000 }).toBe(1);

    // Du bruit ANCIEN, puis les erreurs, puis encore du bruit : sans priorité, le
    // lot suivant partait avec les 60 plus anciens — que du bruit.
    await page.evaluate(installerSalves);
    await page.evaluate(() => {
      window.__salves([() => {
        for (let i = 0; i < 100; i++) window.tel.action("banc_avant_" + i);
        for (let i = 0; i < 4; i++) window.tel.track("error", "banc_tete_" + i, { severity: "error", status: "error" });
        for (let i = 0; i < 50; i++) window.tel.action("banc_apres_" + i);
      }]);
    });
    const enFile = await page.evaluate(() => window.tel._queue().filter((e) => /^banc_(avant|apres)_/.test(e.action || "")).length);
    expect(enFile, "le bruit n'est pas entier en file : le cas ne prouverait rien").toBe(150);
    const avant = etat.lots.length;
    etat.mode = "ok";
    await etat.retenus[0].fulfill({ status: 201, body: "" });
    await expect.poll(async () => { await page.evaluate(() => window.tel.flush()); return etat.lots.length > avant; },
      { message: "aucun lot n'est reparti après l'envoi retenu", timeout: 10000 }).toBe(true);
    const suivant = etat.lots[avant].rows;
    const idx = ["banc_tete_0", "banc_tete_1", "banc_tete_2", "banc_tete_3"].map((a) => suivant.findIndex((r) => r.action === a));
    expect(idx.every((i) => i >= 0), "les erreurs ne sont pas dans le premier lot reparti").toBe(true);
    expect(idx, "l'ordre relatif des erreurs n'est pas conservé").toEqual([...idx].sort((a, b) => a - b));
    // Tout ce qui les précède est un signal de panne : aucun bruit devant elles.
    const devant = suivant.slice(0, Math.max(...idx)).filter((r) => !prioritaire(r));
    expect(devant.map((r) => r.action), "du bruit est parti AVANT les erreurs").toEqual([]);
  });

  test("⑤ un clic qui bloque 1,5 s est mesuré et marqué lent ; un clic vif reste ordinaire", async ({ page }) => {
    const etat = await intercepter(page);
    await charger(page, etat);
    await page.evaluate(() => {
      const lent = document.createElement("button");
      lent.id = "bancClicLent"; lent.textContent = "Banc clic lent";
      lent.style.cssText = "position:fixed;top:10px;left:10px;z-index:2147483647";
      lent.addEventListener("click", () => { const t = performance.now(); while (performance.now() - t < 1500) { /* fil bloqué */ } });
      const vif = document.createElement("button");
      vif.id = "bancClicVif"; vif.textContent = "Banc clic vif";
      vif.style.cssText = "position:fixed;top:60px;left:10px;z-index:2147483647";
      document.body.appendChild(lent); document.body.appendChild(vif);
    });
    await page.click("#bancClicLent");
    await page.click("#bancClicVif");
    // Un bouton à `id` est nommé `#<id>` (`_libelleClic`).
    const clic = (lib) => lignes(etat).find((r) => r.type === "click" && r.action === lib);
    await expect.poll(async () => { await page.evaluate(() => window.tel.flush()); return !!clic("#bancClicLent") && !!clic("#bancClicVif"); },
      { message: "les deux clics ne sont pas arrivés", timeout: 15000 }).toBe(true);

    const l = clic("#bancClicLent");
    expect(typeof (l.meta && l.meta.ms), "clic lent parti sans durée (ms null)").toBe("number");
    expect(l.meta.ms, "durée du clic lent sous-estimée").toBeGreaterThanOrEqual(1400);
    expect(l.severity, "clic lent non marqué warn").toBe("warn");
    expect(l.meta.lent, "clic lent sans marque lent").toBe(1);
    expect(l.status, "un clic n'est pas une étape réseau : pas de status slow").not.toBe("slow");

    const v = clic("#bancClicVif");
    expect(typeof v.meta.ms, "clic vif sans durée").toBe("number");
    expect(v.meta.ms).toBeLessThan(500);
    expect(v.severity).toBe("info");
    expect(v.meta.lent).toBeUndefined();
  });

  // Dans Chromium, après un blocage, la double peinture gagne la course contre
  // le minuteur de secours — le cas ⑤ ne passe donc PAS par lui (vérifié par
  // réinjection : remettre `emettre(null)` laisse ⑤ vert). Ce cas-ci affame
  // `requestAnimationFrame`, pour forcer le chemin du secours :
  //   · fil BLOQUÉ 1,5 s (le minuteur se déclenche en retard) : le secours rend
  //     le temps réellement vécu ;
  //   · onglet MASQUÉ : `null`, et AUSSITÔT (l'onglet peut être tué).
  // Le troisième chemin — page visible, fil libre, aucune peinture — doit partir
  // SANS durée : c'est `latence-percue.spec.js` ② qui le garde (on n'invente
  // pas un délai qui ne correspond à aucun rendu).
  test("⑥ sans peinture : durée réelle si le fil était bloqué, null aussitôt onglet masqué", async ({ page }) => {
    const etat = await intercepter(page);
    await charger(page, etat);
    await page.evaluate(() => {
      window.requestAnimationFrame = () => 0;   // la peinture ne vient jamais
      window.__masque = false;
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (window.__masque ? "hidden" : "visible") });
      const b = document.createElement("button");
      b.id = "bancSecoursLent"; b.textContent = "bancSecoursLent";
      b.style.cssText = "position:fixed;top:10px;left:10px;z-index:2147483647";
      b.addEventListener("click", () => { const t = performance.now(); while (performance.now() - t < 1500) { /* fil bloqué */ } });
      document.body.appendChild(b);
    });
    await page.click("#bancSecoursLent");
    // Onglet masqué : un clic sans peinture garde `null` (rAF n'y vient jamais).
    await page.evaluate(() => {
      document.getElementById("bancSecoursLent").remove();
      const b = document.createElement("button");
      b.id = "bancSecoursMasque"; b.textContent = "bancSecoursMasque";
      b.style.cssText = "position:fixed;top:10px;left:10px;z-index:2147483647";
      document.body.appendChild(b);
      window.__masque = true;
      b.click();
    });
    const clic = (lib) => lignes(etat).find((r) => r.type === "click" && r.action === lib);
    // Onglet masqué : le clic part dès le premier secours (1 s), sans attendre
    // la limite de 5 s réservée à la page visible.
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.tel.flush());
    await expect.poll(() => !!clic("#bancSecoursLent") && !!clic("#bancSecoursMasque"),
      { message: "les deux clics ne sont pas arrivés dans les 2 s (le masqué doit partir aussitôt)", timeout: 1500 }).toBe(true);

    const l = clic("#bancSecoursLent");
    // `scrubMeta` retire un `null` : « pas de durée » arrive comme une clé ABSENTE.
    expect(typeof l.meta.ms, "le secours n'a rendu aucune durée page visible").toBe("number");
    expect(l.meta.ms, "durée rendue par le secours sous-estimée").toBeGreaterThanOrEqual(1400);
    expect(l.severity).toBe("warn");

    const m = clic("#bancSecoursMasque");
    expect(m.meta.ms == null, "onglet masqué : aucune durée ne doit partir").toBe(true);
    expect(m.severity).toBe("info");
  });
});
