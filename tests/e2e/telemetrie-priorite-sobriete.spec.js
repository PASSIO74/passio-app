// ═══════════════════════════════════════════════════════════════════════════
// TÉLÉMÉTRIE À L'ÉCHELLE — LES SIGNAUX DE PANNE PASSENT D'ABORD, LA MESURE DE
// PERFORMANCE CESSE DE SE RÉPÉTER ET CÈDE SOUS LA PRESSION, UN CLIC LENT SE
// VOIT (2026-11-20)
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
//   ①  une métrique `ios_stat_*` ne repart que si elle a reçu un enregistrement ;
//   ①b fenêtre pleine (120) : elle repart quand même, avec sa nouvelle valeur ;
//   ②  le battement périodique ne photographie rien onglet masqué ; sous
//      délestage, AUCUNE photo automatique ; la cadence s'espace ;
//   ②b un refus de débit (429) reçu par l'appareil fait taire les photos, et
//      rien n'est perdu : la pression passée, tout ce qui a bougé repart ;
//   ②c le passage en arrière-plan prend sa photo (après 45 s), sans répétition ;
//   ③  au débordement de la file, ce sont les non-critiques qui partent, pas
//      les erreurs ni la requête corrélée d'un flow ;
//   ③b l'éviction, cas par cas (fonction pure), et le backlog rechargé ;
//   ④  le lot qui part porte les signaux de panne EN TÊTE ;
//   ⑤  un clic dont le gestionnaire bloque 1,5 s est mesuré (≥ 1,4 s, `warn`,
//      `lent`) ; un clic vif reste `info` ;
//   ⑥  sans peinture : durée réelle si le fil était bloqué, rien onglet masqué ;
//   ⑦  une page occultée entre le toucher et la peinture, ou une durée
//      invraisemblable, ne fabriquent pas un clic lent.
//
// ⚠️ AUCUN OCTET NE PART VERS LA TABLE DE PRODUCTION : tous les POST vers
// `telemetry_events` sont interceptés (201 ou 429 simulés, ou retenus en vol),
// et le reste du démarrage vise le projet Supabase VIDE.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { poserGateSansPremiereVisite } = require("./gate-helper");
const { projetSupabaseVide } = require("./app-helper");

const MOTIF_TEL = "**/rest/v1/telemetry_events*";

// Intercepteur : « ok » répond 201, « retenu » garde la requête EN VOL jusqu'à
// ce que le banc la règle, « refuse » répond comme la base quand un réservoir
// de débit est plein (PT429). Chaque lot est journalisé avec ses lignes.
async function intercepter(page, modeInitial) {
  await projetSupabaseVide(page);
  const etat = { mode: modeInitial || "ok", lots: [], retenus: [] };
  await page.route(MOTIF_TEL, (route) => {
    const corps = route.request().postData() || "[]";
    let rows = [];
    try { rows = JSON.parse(corps); } catch (e) { rows = []; }
    if (!Array.isArray(rows)) rows = [];
    etat.lots.push({ mode: etat.mode, rows });
    if (etat.mode === "retenu") { etat.retenus.push(route); return undefined; }
    if (etat.mode === "refuse") {
      return route.fulfill({ status: 429, contentType: "application/json",
        body: JSON.stringify({ code: "PT429", message: "rate limit: anciens plein (1800 lignes/minute)", hint: "30" }) });
    }
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
// `visibilityState` piloté par le banc (`window.__masque`).
function piloterVisibilite() {
  window.__masque = false;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (window.__masque ? "hidden" : "visible") });
}
const prioritaire = (r) => ["error", "connectivity", "link", "flow", "rt_recv"].includes(r.type)
  || ["warn", "error", "critical"].includes(r.severity) || (r.correlation_id != null && r.correlation_id !== "");
const statsDe = (etat, nom) => lignes(etat).filter((r) => r.type === "perf" && r.action === "ios_stat_" + nom);
const enFile = (page, nom) => page.evaluate((n) => window.tel._queue().filter((e) => e.type === "perf" && e.action === "ios_stat_" + n).length, nom);

async function vider(page, etat, attendu, message) {
  await page.evaluate(() => window.tel.flush());
  await expect.poll(() => attendu(), { message, timeout: 10000 }).toBe(true);
}
// Garde un envoi EN VOL : la file s'accumule sans partir (`sending`).
async function amorcerEnVol(page, etat) {
  etat.mode = "retenu";
  await page.evaluate(() => { window.tel.action("banc_amorce"); window.tel.flush(); });
  await expect.poll(() => etat.retenus.length, { message: "l'envoi d'amorce n'est pas parti", timeout: 10000 }).toBe(1);
}

test.describe("Télémétrie à l'échelle — priorité aux pannes, mesure sans répétition", () => {
  test("① une métrique ne repart que si elle a reçu un enregistrement", async ({ page }) => {
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

    // `reset()` oublie aussi ce qui a été émis : la même métrique, revenue au
    // même compte, repart.
    await page.evaluate(() => { const p = window.PassioPerf; p.reset(); p.record("banc_b", 7); p.snapshot("t4"); });
    await vider(page, etat, () => statsDe(etat, "banc_b").length === 2, "après reset(), banc_b revenue au même compte est restée tue");
  });

  // Contre-revue du 20/11 (B1) : la fenêtre d'une métrique est un anneau de 120
  // échantillons. Une fois pleine, son `n` ne bouge plus alors que ses valeurs
  // changent — dédoublonner sur `n` figeait les métriques les plus actives
  // (image par image, touchers) à leur valeur du 120ᵉ échantillon, photo de
  // sortie comprise : une dégradation en cours de longue session devenait
  // invisible. Le dédoublonnage porte sur le nombre d'enregistrements REÇUS.
  test("①b fenêtre pleine (120) : une métrique qui change repart, avec sa nouvelle valeur", async ({ page }) => {
    const etat = await intercepter(page);
    await charger(page, etat);
    await page.evaluate(() => {
      const p = window.PassioPerf;
      for (let i = 0; i < 120; i++) p.record("banc_plein", 10);
      p.snapshot("a");
    });
    await vider(page, etat, () => statsDe(etat, "banc_plein").length === 1, "la première photo n'a pas émis banc_plein");
    expect(statsDe(etat, "banc_plein")[0].meta.n).toBe(120);
    await page.evaluate(() => {
      const p = window.PassioPerf;
      for (let i = 0; i < 120; i++) p.record("banc_plein", 5000);
      p.snapshot("b");
    });
    await vider(page, etat, () => statsDe(etat, "banc_plein").length === 2, "fenêtre pleine : la métrique n'est pas repartie alors que ses valeurs ont changé");
    const apres = statsDe(etat, "banc_plein")[1];
    expect(apres.meta.n, "la fenêtre reste bornée à 120").toBe(120);
    expect(apres.duration_ms, "le p95 émis n'est pas celui des nouvelles valeurs").toBe(5000);
    // Et sans nouvel enregistrement, toujours aucune répétition.
    await page.evaluate(() => window.PassioPerf.snapshot("c"));
    await page.evaluate(() => window.tel.flush());
    await page.waitForTimeout(1200);
    expect(statsDe(etat, "banc_plein").length, "répétée sans nouvel enregistrement").toBe(2);
  });

  test("② photos automatiques : rien de périodique onglet masqué, AUCUNE sous délestage, cadence qui s'espace", async ({ page }) => {
    const etat = await intercepter(page);
    await charger(page, etat);
    await page.evaluate(piloterVisibilite);
    await page.evaluate(() => { window.__facteur = 1; window.delestageFacteur = () => window.__facteur; });

    // Onglet masqué : le battement ne photographie pas, même avec du neuf.
    const masque = await page.evaluate(() => {
      window.__masque = true;
      window.PassioPerf.record("banc_masque", 5);
      return window.PassioPerf._tickPeriodique();
    });
    expect(masque, "battement accepté onglet masqué").toBe(false);

    // Sous délestage (×2 puis ×4) : ni battement, ni t45, ni sortie.
    for (const f of [2, 4]) {
      const r = await page.evaluate((fac) => {
        window.__masque = false; window.__facteur = fac;
        const p = window.PassioPerf;
        return { tick: p._tickPeriodique(), t45: p._photo("t45"), sortie: p._photo("exit") };
      }, f);
      expect(r, `photo acceptée sous délestage ×${f}`).toEqual({ tick: false, t45: false, sortie: false });
    }
    await page.evaluate(() => window.tel.flush());
    await page.waitForTimeout(5000);   // whenIdle peut attendre jusqu'à 4 s
    expect(statsDe(etat, "banc_masque").length, "photo émise onglet masqué ou sous délestage").toBe(0);

    // Visible et sans délestage : la photo part, avec la métrique restée en attente.
    const visible = await page.evaluate(() => { window.__facteur = 1; return window.PassioPerf._tickPeriodique(); });
    expect(visible, "battement refusé onglet visible").toBe(true);
    await expect.poll(async () => { await page.evaluate(() => window.tel.flush()); return statsDe(etat, "banc_masque").length; },
      { message: "la photo périodique n'est pas partie onglet visible", timeout: 10000 }).toBe(1);
    expect(statsDe(etat, "banc_masque")[0].meta.phase).toBe("periodic");

    // La cadence s'espace : 3, 6, 12, 24 min, puis 30 min pour toujours.
    const delais = await page.evaluate(() => [0, 1, 2, 3, 4, 5, 9, 40].map((k) => window.PassioPerf._delaiPeriodique(k) / 60000));
    expect(delais, "cadence périodique").toEqual([3, 6, 12, 24, 30, 30, 30, 30]);
  });

  test("②b un refus de débit (429) fait taire les photos ; la pression passée, ce qui a bougé repart", async ({ page }) => {
    const etat = await intercepter(page);
    await charger(page, etat);
    expect(await page.evaluate(() => window.tel.sousPression()), "sous pression sans aucun refus").toBe(false);
    expect(await page.evaluate(() => { window.PassioPerf.record("banc_avant", 3); return window.PassioPerf._photo("t45"); }),
      "photo refusée sans pression").toBe(true);

    // La base refuse un lot pour débit : l'appareil se sait sous pression.
    etat.mode = "refuse";
    const refus = etat.lots.length;
    await page.evaluate(() => { window.tel.action("banc_declencheur"); window.tel.flush(); });
    await expect.poll(() => etat.lots.slice(refus).some((l) => l.mode === "refuse"), { message: "aucun lot n'a été refusé", timeout: 10000 }).toBe(true);
    await expect.poll(() => page.evaluate(() => window.tel.sousPression()), { message: "le 429 n'a pas mis l'appareil sous pression", timeout: 5000 }).toBe(true);

    const sous = await page.evaluate(() => {
      const p = window.PassioPerf;
      p.record("banc_pression", 42);
      return { tick: p._tickPeriodique(), t45: p._photo("t45"), cache: p._photo("hidden"), sortie: p._photo("exit") };
    });
    expect(sous, "photo acceptée sous pression").toEqual({ tick: false, t45: false, cache: false, sortie: false });
    await page.waitForTimeout(4500);   // un battement accepté à tort photographierait dans les 4 s
    expect(await enFile(page, "banc_pression"), "une photo est entrée en file sous pression").toBe(0);

    // Rien n'a été marqué « émis » pendant le silence : la pression passée, la
    // première photo emporte ce qui a bougé entre-temps.
    await page.evaluate(() => { window.tel.sousPression = () => false; });
    expect(await page.evaluate(() => window.PassioPerf._photo("periodic")), "photo refusée une fois la pression passée").toBe(true);
    expect(await enFile(page, "banc_pression"), "la métrique enregistrée sous pression n'est pas repartie").toBe(1);
  });

  // Sur mobile, le système tue souvent un onglet masqué sans `pagehide` : le
  // passage en arrière-plan est la dernière occasion d'emporter l'état. Éprouvé
  // par l'ÉVÉNEMENT lui-même — c'est l'écouteur qui est gardé, pas une fonction.
  test("②c passage en arrière-plan : une photo après 45 s, pas avant, et sans répétition", async ({ page }) => {
    const etat = await intercepter(page);
    await charger(page, etat);
    await page.evaluate(piloterVisibilite);
    const cacher = () => page.evaluate(() => { window.__masque = true; document.dispatchEvent(new Event("visibilitychange")); window.__masque = false; });

    // Session de moins de 45 s : rien (elle n'a encore rien de stable à dire).
    await page.evaluate(() => { const p = window.PassioPerf; p.reset(); p.record("banc_fond", 9); });
    await cacher();
    await page.evaluate(() => window.tel.flush());
    await page.waitForTimeout(1200);
    expect(statsDe(etat, "banc_fond").length, "photo d'arrière-plan prise avant 45 s").toBe(0);

    // Au-delà de 45 s : la photo part, étiquetée « hidden ».
    await page.evaluate(() => { const vrai = Date.now; Date.now = () => vrai.call(Date) + 60000; });
    await cacher();
    await vider(page, etat, () => statsDe(etat, "banc_fond").length === 1, "aucune photo au passage en arrière-plan");
    expect(statsDe(etat, "banc_fond")[0].meta.phase).toBe("hidden");

    // Un second passage sans rien de neuf ne répète rien.
    await cacher();
    await page.evaluate(() => window.tel.flush());
    await page.waitForTimeout(1200);
    expect(statsDe(etat, "banc_fond").length, "photo d'arrière-plan répétée sans nouvel enregistrement").toBe(1);
  });

  test("③ au débordement de la file, les erreurs et la requête d'un flow restent — les non-critiques partent", async ({ page }) => {
    const etat = await intercepter(page);
    await charger(page, etat);
    await amorcerEnVol(page, etat);

    // Les prioritaires d'abord (les PLUS ANCIENS de la file), puis de quoi déborder.
    await page.evaluate(installerSalves);
    const file = await page.evaluate(() => {
      for (let i = 0; i < 5; i++) window.tel.track("error", "banc_erreur_" + i, { severity: "error", status: "error" });
      // La requête d'un flow : un `api` en 200, ni critique ni grave, mais corrélé.
      window.tel.track("api", "banc_requete_flow", { http_status: 200, correlation_id: "fl_banc-eviction" });
      window.__salves([0, 1].map((k) => () => { for (let i = 0; i < 180; i++) window.tel.action("banc_bruit_" + k + "_" + i); }));
      return window.tel._queue().map((e) => ({ type: e.type, action: e.action }));
    });
    // 5 erreurs + 1 requête + 360 bruits + l'amorce > 300 : la file a DÛ déborder.
    expect(file.length, "la file n'a pas débordé : le cas ne prouverait rien").toBe(300);
    const erreurs = file.filter((e) => e.type === "error" && /^banc_erreur_/.test(e.action));
    expect(erreurs.length, "des erreurs ont été jetées au débordement").toBe(5);
    expect(file.filter((e) => e.action === "banc_requete_flow").length, "la requête corrélée d'un flow a été jetée au débordement").toBe(1);

    etat.mode = "ok";
    for (const r of etat.retenus) await r.fulfill({ status: 201, body: "" }).catch(() => {});
  });

  test("③b l'éviction cas par cas, et le backlog rechargé garde ses erreurs", async ({ page }) => {
    // Le backlog d'une visite précédente : 5 erreurs, les plus ANCIENNES, puis
    // 345 lignes ordinaires. Posé AVANT les scripts de la page.
    await page.addInitScript(() => {
      try {
        if (sessionStorage.getItem("__banc_backlog")) return;
        sessionStorage.setItem("__banc_backlog", "1");
        const ev = (i, type, severity) => ({ event_id: "bancbl" + String(i).padStart(10, "0"), client_ts: new Date().toISOString(), env: "development",
          type, action: "banc_backlog_" + i, status: type === "error" ? "error" : "ok", severity, user_id: null });
        const arr = [];
        for (let i = 0; i < 5; i++) arr.push(ev(i, "error", "error"));
        for (let i = 5; i < 350; i++) arr.push(ev(i, "action", "info"));
        localStorage.setItem("passio_tel_backlog", JSON.stringify(arr));
      } catch (e) { /* stockage indisponible : le cas échouera sur ses attentes */ }
    });
    // Rien ne part : la file reste entière le temps de la lire.
    const etat = await intercepter(page, "retenu");
    await poserGateSansPremiereVisite(page);
    await page.goto("/index.html?telemetry=1");
    await page.waitForFunction(() => !!(window.tel && window.tel.enabled && window.tel._queue), null, { timeout: 30000 });
    const file = await page.evaluate(() => window.tel._queue().map((e) => ({ type: e.type, action: e.action })));
    const duBacklog = file.filter((e) => /^banc_backlog_/.test(e.action || ""));
    expect(file.length, "file rechargée non bornée").toBeLessThanOrEqual(300);
    expect(duBacklog.length, "le backlog n'a pas été rechargé : le cas ne prouverait rien").toBeGreaterThan(200);
    expect(duBacklog.filter((e) => e.type === "error").map((e) => e.action), "les erreurs du backlog ont été jetées au rechargement")
      .toEqual([0, 1, 2, 3, 4].map((i) => "banc_backlog_" + i));

    // La fonction pure, cas par cas.
    const r = await page.evaluate(() => {
      const t = window.tel;
      const e = (id, type, severity, cid) => ({ id, type, severity: severity || "info", correlation_id: cid || null });
      const ids = (q) => q.map((x) => x.id);
      return {
        sousLaBorne: ids(t._bornerFile([e(1, "action"), e(2, "error", "error")], 5)),
        melange: ids(t._bornerFile([e(1, "action"), e(2, "error", "error"), e(3, "perf"), e(4, "flow"), e(5, "action"), e(6, "click", "warn")], 4)),
        toutPrioritaire: ids(t._bornerFile([e(1, "error", "error"), e(2, "flow"), e(3, "connectivity"), e(4, "error", "error")], 2)),
        pasAssezDeBruit: ids(t._bornerFile([e(1, "error", "error"), e(2, "action"), e(3, "flow"), e(4, "error", "error")], 2)),
        classes: [e(1, "action"), e(2, "perf"), e(3, "api"), e(4, "api", "info", "fl_x"), e(5, "click", "warn"), e(6, "rt_recv"), e(7, "link"), e(8, "api", "error"), null]
          .map((x) => t._estPrioritaire(x)),
      };
    });
    expect(r.sousLaBorne, "sous la borne : rien ne bouge").toEqual([1, 2]);
    expect(r.melange, "les non-prioritaires les plus anciens partent d'abord, l'ordre est conservé").toEqual([2, 4, 5, 6]);
    expect(r.toutPrioritaire, "tout prioritaire : les plus anciens partent").toEqual([3, 4]);
    expect(r.pasAssezDeBruit, "le bruit d'abord, puis le plus ancien prioritaire").toEqual([3, 4]);
    expect(r.classes, "classement prioritaire").toEqual([false, false, false, true, true, true, true, true, false]);

    for (const route of etat.retenus) await route.fulfill({ status: 201, body: "" }).catch(() => {});
  });

  test("④ le lot qui part porte les signaux de panne en tête", async ({ page }) => {
    const etat = await intercepter(page);
    await charger(page, etat);
    await amorcerEnVol(page, etat);

    // Du bruit ANCIEN, puis les erreurs et la requête d'un flow, puis encore du
    // bruit : sans priorité, le lot suivant partait avec les 60 plus anciens —
    // que du bruit.
    await page.evaluate(installerSalves);
    await page.evaluate(() => {
      window.__salves([() => {
        for (let i = 0; i < 100; i++) window.tel.action("banc_avant_" + i);
        for (let i = 0; i < 4; i++) window.tel.track("error", "banc_tete_" + i, { severity: "error", status: "error" });
        window.tel.track("api", "banc_tete_requete", { http_status: 200, correlation_id: "fl_banc-lot" });
        for (let i = 0; i < 50; i++) window.tel.action("banc_apres_" + i);
      }]);
    });
    const bruit = await page.evaluate(() => window.tel._queue().filter((e) => /^banc_(avant|apres)_/.test(e.action || "")).length);
    expect(bruit, "le bruit n'est pas entier en file : le cas ne prouverait rien").toBe(150);
    const avant = etat.lots.length;
    etat.mode = "ok";
    await etat.retenus[0].fulfill({ status: 201, body: "" });
    await expect.poll(async () => { await page.evaluate(() => window.tel.flush()); return etat.lots.length > avant; },
      { message: "aucun lot n'est reparti après l'envoi retenu", timeout: 10000 }).toBe(true);
    const suivant = etat.lots[avant].rows;
    const attendus = ["banc_tete_0", "banc_tete_1", "banc_tete_2", "banc_tete_3", "banc_tete_requete"];
    const idx = attendus.map((a) => suivant.findIndex((r) => r.action === a));
    expect(idx.every((i) => i >= 0), "les erreurs et la requête du flow ne sont pas dans le premier lot reparti").toBe(true);
    expect(idx, "l'ordre relatif des prioritaires n'est pas conservé").toEqual([...idx].sort((a, b) => a - b));
    // Tout ce qui les précède est un signal de panne : aucun bruit devant eux.
    const devant = suivant.slice(0, Math.max(...idx)).filter((r) => !prioritaire(r));
    expect(devant.map((r) => r.action), "du bruit est parti AVANT les signaux de panne").toEqual([]);
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
  //   · onglet MASQUÉ : aucune durée.
  // Le troisième chemin — page visible, fil libre, aucune peinture — doit partir
  // SANS durée, et à 1 s comme avant : c'est `latence-percue.spec.js` ② qui le
  // garde (on n'invente pas un délai qui ne correspond à aucun rendu).
  test("⑥ sans peinture : durée réelle si le fil était bloqué, aucune durée onglet masqué — et toujours dans la seconde", async ({ page }) => {
    const etat = await intercepter(page);
    await charger(page, etat);
    await page.evaluate(piloterVisibilite);
    await page.evaluate(() => {
      window.requestAnimationFrame = () => 0;   // la peinture ne vient jamais
      const b = document.createElement("button");
      b.id = "bancSecoursLent"; b.textContent = "bancSecoursLent";
      b.style.cssText = "position:fixed;top:10px;left:10px;z-index:2147483647";
      b.addEventListener("click", () => { const t = performance.now(); while (performance.now() - t < 1500) { /* fil bloqué */ } });
      document.body.appendChild(b);
    });
    await page.click("#bancSecoursLent");
    // Onglet masqué (et fil bloqué lui aussi : un minuteur en retard ne doit
    // RIEN prouver quand personne ne regarde), puis page visible à fil libre.
    await page.evaluate(() => {
      document.getElementById("bancSecoursLent").remove();
      const mk = (id) => { const b = document.createElement("button"); b.id = id; b.textContent = id; document.body.appendChild(b); return b; };
      const masque = mk("bancSecoursMasque");
      masque.addEventListener("click", () => { const t = performance.now(); while (performance.now() - t < 1500) { /* fil bloqué */ } });
      window.__masque = true;
      masque.click();
    });
    await page.waitForTimeout(300);   // le secours du clic masqué passe (en retard) pendant qu'il est encore masqué
    await page.evaluate(() => {
      window.__masque = false;
      const b = document.createElement("button"); b.id = "bancSecoursLibre"; b.textContent = "bancSecoursLibre"; document.body.appendChild(b);
      b.click();
    });
    const clic = (lib) => lignes(etat).find((r) => r.type === "click" && r.action === lib);
    // ⚠️ Le secours tient en UN minuteur d'une seconde : la Sentinelle apparie un
    // clic à son effet en supposant qu'il est horodaté au plus ~1 s après le
    // toucher (`BOUTON_AVANCE_MS`). Les trois clics sont donc là sous 2,5 s.
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.tel.flush());
    await expect.poll(() => !!clic("#bancSecoursLent") && !!clic("#bancSecoursMasque") && !!clic("#bancSecoursLibre"),
      { message: "un clic sans peinture n'est pas parti dans la seconde qui suit le toucher", timeout: 1500 }).toBe(true);

    const l = clic("#bancSecoursLent");
    // `scrubMeta` retire un `null` : « pas de durée » arrive comme une clé ABSENTE.
    expect(typeof l.meta.ms, "le secours n'a rendu aucune durée après un fil bloqué").toBe("number");
    expect(l.meta.ms, "durée rendue par le secours sous-estimée").toBeGreaterThanOrEqual(1400);
    expect(l.severity).toBe("warn");

    for (const id of ["#bancSecoursMasque", "#bancSecoursLibre"]) {
      const c = clic(id);
      expect(c.meta.ms == null, `${id} : aucune durée ne doit partir sans peinture`).toBe(true);
      expect(c.severity, `${id} : pas un clic lent`).toBe("info");
    }
  });

  // Contre-revue du 20/11 (R2) : depuis ce lot un clic « lent » sonne. Une
  // durée gonflée par une page partie en arrière-plan entre le toucher et la
  // peinture (suspension iOS, veille) fabriquerait de faux clics lents. Les
  // peintures sont RETENUES 600 ms par le banc ; le témoin, resté visible, est
  // bien lent — le second, occulté entre-temps, part sans durée.
  test("⑦ une page occultée entre le toucher et la peinture, ou une durée invraisemblable, ne fabriquent pas un clic lent", async ({ page }) => {
    const etat = await intercepter(page);
    await charger(page, etat);
    await page.evaluate(() => new Promise((fin) => {
      const mk = (id) => { const b = document.createElement("button"); b.id = id; b.textContent = id; document.body.appendChild(b); return b; };
      const temoin = mk("bancTemoinVisible"), occulte = mk("bancOcculte"), folle = mk("bancDureeFolle");
      const vraie = window.requestAnimationFrame;
      const tenues = [];
      window.requestAnimationFrame = (cb) => { tenues.push(cb); return 0; };
      // Deux tours, pas plus : la double peinture du clic, sans suivre une
      // éventuelle boucle d'animation de la page.
      const peindre = () => { for (let k = 0; k < 2; k++) tenues.splice(0).forEach((cb) => { try { cb(performance.now()); } catch (e) { /* hors sujet */ } }); };
      temoin.click();
      setTimeout(() => {
        peindre();
        occulte.click();
        setTimeout(() => {
          document.dispatchEvent(new Event("visibilitychange"));   // la page part, puis revient
          setTimeout(() => {
            peindre();
            // Troisième clic : la page s'est endormie sans le dire (ni arrière-plan
            // ni gel signalés) — l'horloge saute de 40 s avant la peinture.
            folle.click();
            const vraiNow = performance.now.bind(performance);
            performance.now = () => vraiNow() + 40000;
            peindre();
            performance.now = vraiNow;
            window.requestAnimationFrame = vraie;
            fin();
          }, 400);
        }, 200);
      }, 600);
    }));
    const clic = (lib) => lignes(etat).find((r) => r.type === "click" && r.action === lib);
    await expect.poll(async () => { await page.evaluate(() => window.tel.flush()); return !!clic("#bancTemoinVisible") && !!clic("#bancOcculte") && !!clic("#bancDureeFolle"); },
      { message: "les trois clics ne sont pas arrivés", timeout: 15000 }).toBe(true);

    const t = clic("#bancTemoinVisible");
    expect(typeof t.meta.ms, "témoin : la peinture retenue doit être mesurée (sinon le cas ne prouve rien)").toBe("number");
    expect(t.meta.ms).toBeGreaterThanOrEqual(500);
    expect(t.severity, "témoin : un clic peint en 600 ms page visible est lent").toBe("warn");

    const o = clic("#bancOcculte");
    expect(o.meta.ms == null, "page occultée entre le toucher et la peinture : aucune durée").toBe(true);
    expect(o.severity, "page occultée : pas un clic lent").toBe("info");
    expect(o.meta.lent).toBeUndefined();

    const f = clic("#bancDureeFolle");
    expect(f.meta.ms == null, "40 s entre le toucher et la peinture n'est pas une latence : aucune durée").toBe(true);
    expect(f.severity, "durée invraisemblable : pas un clic lent").toBe("info");
  });
});
