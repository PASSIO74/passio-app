const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");
const { onboardedState, sansDonneesDistantes } = require("./app-helper");

test.skip(process.env.PASSIO_CIBLE !== "dist", "contrat du bundle de production uniquement");

// ⚠️ ISOLÉE DU PROJET DE PRODUCTION (2026-11-10). Ce que la suite mesure — ce que
// le bundle ÉMET au changement de passion — se lit par l'espion posé sur
// `tel.track`, jamais au réseau. Sans isolation, chaque passage du job « Gates
// artefact production » écrivait pourtant en PRODUCTION la file de démarrage de
// ses deux pages (`?telemetry=1`) : 6 lots, 31 lignes `env = development` par
// passage, mesurés derrière un proxy local ; une session de 12 lignes par passage
// de la CI au canal ①. Le projet vide accepte la télémétrie comme le vrai (201).

test("le changement de profil émet uniquement la passion métier, jamais l'id local", async ({ page }) => {
  await sansDonneesDistantes(page);
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
  }, [GATE_KEY, GATE_TOKEN, onboardedState(2)]);

  await page.goto("/index.html?telemetry=1");
  await page.waitForFunction(() => Boolean(window.PassioPassionContext && window.tel));

  const result = await page.evaluate(() => {
    const events = [];
    const original = window.tel.track;
    window.tel.track = function (type, action, fields) {
      events.push({ type, action, fields });
      return undefined;
    };
    try {
      state.user.currentProfileId = "pp_1";
      window.PassioPassionContext.refresh();
    } finally {
      window.tel.track = original;
    }
    return { events, current: window.PassioPassionContext.current() };
  });

  expect(result.events).toHaveLength(1);
  expect(result.events[0].type).toBe("context");
  expect(result.events[0].action).toBe("passion_active");
  expect(result.events[0].fields.meta).toEqual({ persona_ctx: "sport" });

  const wire = JSON.stringify(result.events[0]);
  expect(wire).not.toContain("pp_1");
  expect(wire).not.toContain("Audit QA");
  expect(wire).not.toContain("Profil de test");

  expect(result.current).toEqual({ passionId: "sport" });
  expect(result.current).not.toHaveProperty("profileLocalId");
});

test("un refresh sans changement n'émet pas de doublon", async ({ page }) => {
  await sansDonneesDistantes(page);
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
  }, [GATE_KEY, GATE_TOKEN, onboardedState(1)]);
  await page.goto("/index.html?telemetry=1");
  await page.waitForFunction(() => Boolean(window.PassioPassionContext && window.tel));

  const result = await page.evaluate(() => {
    let n = 0;
    const original = window.tel.track;
    window.tel.track = function () { n++; };
    try {
      // Le helper peut démarrer avant la restauration asynchrone de l'état app.
      // On synchronise d'abord son snapshot interne avec le contexte courant ;
      // ce premier signal éventuel est légitime et n'entre pas dans la mesure.
      window.PassioPassionContext.refresh();
      n = 0;
      window.PassioPassionContext.refresh();
      window.PassioPassionContext.refresh();
    } finally { window.tel.track = original; }
    return n;
  });
  expect(result).toBe(0);
});
