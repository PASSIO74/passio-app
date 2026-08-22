// ═══════════════════════════════════════════════════════════════════════════
// PERF-IOS — phase 1 : l'instrumentation de fluidité existe et dit vrai.
//
// Ce test ne mesure PAS la vitesse de PASSIO : un chiffre relevé dans un
// Chromium headless sans réseau ni données ne dirait rien de l'iPhone. Il
// vérifie que l'APPAREIL DE MESURE est en place et honnête, car c'est lui qui
// servira de juge aux phases suivantes (Feed P0, médias, chemin critique, IRL) :
//
//   ① le module se charge sans erreur et n'expose qu'un seul global ;
//   ② les percentiles sont JUSTES (un p95 faux validerait n'importe quelle
//      optimisation, ou en condamnerait une bonne) ;
//   ③ ce qui n'est pas mesurable sur l'appareil est déclaré non supporté, jamais
//      rapporté à zéro — un zéro se lit « tout va bien » ;
//   ④ la baseline franchit le filtre PII de telemetry.js et arrive au centre de
//      pilotage avec ses p50/p95/p99 intacts ;
//   ⑤ sans télémétrie (opt-out, localhost), la mesure locale continue et RIEN
//      n'est envoyé.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

// Intercepte les lots de télémétrie AVANT la base : il n'existe qu'une seule
// base Supabase, et `?telemetry=1` y déposerait sinon des lignes de test.
// Répondre 201 plutôt qu'échouer (un refus relancerait la file de reprise).
async function interceptePayloads(page) {
  const lignes = [];
  await page.route("**/rest/v1/telemetry_events*", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      try { lignes.push(...JSON.parse(req.postData() || "[]")); } catch (e) { /* payload illisible */ }
    }
    await route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
  });
  return lignes;
}

test.describe("PERF-IOS — instrumentation phase 1", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
  });

  test("le module se charge, sans erreur JS et sans global parasite", async ({ page }) => {
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    await page.goto("/index.html");
    await page.waitForSelector("#landing.active", { timeout: 30000 });

    const api = await page.evaluate(() => {
      const p = window.PassioPerf;
      if (!p) return null;
      return Object.keys(p).sort();
    });
    expect(api, "window.PassioPerf doit exister").not.toBeNull();
    for (const f of ["record", "stats", "mark", "measure", "journey", "report", "snapshot", "baseline"]) {
      expect(api, `PassioPerf.${f} manquant`).toContain(f);
    }

    // Le fichier est un IIFE : aucune fonction top-level ne doit fuir sur window
    // (`audit:globals` couvre les js/app-*.js, pas ce chemin-ci).
    const fuites = await page.evaluate(() =>
      ["record", "stats", "journey", "snapshot", "domContext", "observe", "whenIdle", "frameTick"]
        .filter((n) => typeof window[n] !== "undefined"));
    expect(fuites, "globals fuités par perf-ios.js : " + fuites.join(", ")).toHaveLength(0);

    const fatal = erreurs.filter((m) => !/Failed to fetch|NetworkError|load failed/i.test(m));
    expect(fatal, "Erreurs JS : " + fatal.join(" | ")).toHaveLength(0);
  });

  test("les percentiles sont exacts (p50/p95/p99 sur une série connue)", async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForSelector("#landing.active", { timeout: 30000 });

    const s = await page.evaluate(() => {
      const p = window.PassioPerf;
      for (let i = 1; i <= 100; i++) p.record("_t_verif", i);
      return p.stats("_t_verif");
    });
    // Série 1..100 : le p95 est 95, pas « à peu près 95 ». Une erreur d'indice
    // d'une seule position se paie en décisions d'optimisation.
    expect(s).toMatchObject({ n: 100, mn: 1, p50: 50, p95: 95, p99: 99, mx: 100 });

    // Anneau borné : 300 échantillons ne doivent pas faire grossir la mémoire du
    // mesureur (qui fausserait ce qu'il mesure).
    const borne = await page.evaluate(() => {
      const p = window.PassioPerf;
      for (let i = 0; i < 300; i++) p.record("_t_borne", i);
      return p.stats("_t_borne").n;
    });
    expect(borne).toBeLessThanOrEqual(120);

    // Une métrique jamais alimentée renvoie null — surtout pas un zéro.
    const vide = await page.evaluate(() => window.PassioPerf.stats("_t_jamais"));
    expect(vide, "une métrique non mesurée doit être absente, jamais à 0").toBeNull();
  });

  test("le rapport déclare ce que l'appareil ne sait pas mesurer", async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForSelector("#landing.active", { timeout: 30000 });
    const r = await page.evaluate(() => window.PassioPerf.report());

    expect(r.phase).toBe("perf-ios-1");
    expect(typeof r.support.longtask, "le support doit être un booléen explicite").toBe("boolean");
    expect(typeof r.support.event_timing).toBe("boolean");
    expect(typeof r.support.mark).toBe("boolean");
    expect(typeof r.context.dom_nodes).toBe("number");
    console.log("[perf-ios] support =", JSON.stringify(r.support), "contexte =", JSON.stringify(r.context));

    // La navigation doit être instrumentée dès que goTo existe (le fil, les
    // onglets et le parcours Feed → IRL en dépendent entièrement).
    await page.waitForFunction(() => typeof window.goTo === "function" && window.goTo.__perf === true,
      null, { timeout: 15000 });
  });

  test("la baseline atteint le centre de pilotage avec ses percentiles", async ({ page }) => {
    test.setTimeout(90000);
    const lignes = await interceptePayloads(page);
    await page.goto("/index.html?telemetry=1");
    await page.waitForSelector("#landing.active", { timeout: 30000 });

    await page.evaluate(() => {
      const p = window.PassioPerf;
      for (let i = 1; i <= 20; i++) p.record("tap_like", i * 10);
      p.snapshot("test");
    });
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.PassioTelemetry && window.PassioTelemetry.flush && window.PassioTelemetry.flush());
    await page.waitForTimeout(2000);

    const perfs = lignes.filter((l) => l.type === "perf" && String(l.action || "").indexOf("ios_") === 0);
    console.log(`[perf-ios] ${lignes.length} ligne(s), dont ${perfs.length} événement(s) perf ios_`);
    expect(perfs.length, "la baseline doit être publiée").toBeGreaterThan(0);

    const stat = perfs.find((p) => p.action === "ios_stat_tap_like");
    expect(stat, "la statistique par action doit être publiée").toBeTruthy();
    expect(stat.duration_ms, "duration_ms porte le p95").toBe(190);
    // Les percentiles voyagent dans `meta` : ils doivent franchir scrubMeta
    // (liste noire de clés + primitives seules). Un renommage malheureux les
    // ferait disparaître en silence et le dashboard afficherait un p95 orphelin.
    expect(stat.meta.p50).toBe(100);
    expect(stat.meta.p99).toBe(200);
    expect(stat.meta.n).toBe(20);
    expect(stat.meta.phase).toBe("test");

    const ctx = perfs.find((p) => p.action === "ios_context");
    expect(ctx, "le contexte (DOM, mémoire, supports) doit être publié").toBeTruthy();
    expect(typeof ctx.meta.dom_nodes, "le volume DOM est la métrique de référence de la phase 2").toBe("number");
    expect(ctx.meta.dom_nodes).toBeGreaterThan(0);
  });

  test("sans télémétrie, la mesure locale continue et rien n'est envoyé", async ({ page }) => {
    const lignes = await interceptePayloads(page);
    // `?telemetry=0` = opt-out durable, le cas d'un utilisateur qui a refusé.
    await page.goto("/index.html?telemetry=0");
    await page.waitForSelector("#landing.active", { timeout: 30000 });

    const s = await page.evaluate(() => {
      const p = window.PassioPerf;
      p.record("_t_local", 42);
      p.snapshot("optout");
      return p.stats("_t_local");
    });
    expect(s.n, "la mesure locale doit rester disponible pour un diagnostic").toBe(1);
    await page.waitForTimeout(3000);
    expect(lignes, "aucun envoi ne doit avoir lieu après un opt-out").toHaveLength(0);
  });
});
