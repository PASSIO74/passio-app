const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");
const { onboardedState } = require("./app-helper");

test.skip(process.env.PASSIO_CIBLE !== "dist", "contrat du bundle de production uniquement");

test("le changement de profil émet uniquement la passion métier, jamais l'id local", async ({ page }) => {
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
  }, [GATE_KEY, GATE_TOKEN, onboardedState(2)]);

  await page.goto("/index.html?telemetry=1");
  await page.waitForFunction(() => Boolean(window.PassioPassionContext && window.tel));

  const emitted = await page.evaluate(() => {
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
    return events;
  });

  expect(emitted).toHaveLength(1);
  expect(emitted[0].type).toBe("context");
  expect(emitted[0].action).toBe("passion_active");
  expect(emitted[0].fields.meta).toEqual({ passion_ctx: "sport" });

  const wire = JSON.stringify(emitted[0]);
  expect(wire).not.toContain("pp_1");
  expect(wire).not.toContain("Audit QA");
  expect(wire).not.toContain("Profil de test");
});

test("un refresh sans changement n'émet pas de doublon", async ({ page }) => {
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
  }, [GATE_KEY, GATE_TOKEN, onboardedState(1)]);
  await page.goto("/index.html?telemetry=1");
  await page.waitForFunction(() => Boolean(window.PassioPassionContext && window.tel));

  const count = await page.evaluate(() => {
    let n = 0;
    const original = window.tel.track;
    window.tel.track = function () { n++; };
    try {
      window.PassioPassionContext.refresh();
      window.PassioPassionContext.refresh();
    } finally { window.tel.track = original; }
    return n;
  });
  expect(count).toBe(0);
});
