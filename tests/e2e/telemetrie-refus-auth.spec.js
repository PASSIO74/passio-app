// ═══════════════════════════════════════════════════════════════════════════
// TÉLÉMÉTRIE — UN MOT DE PASSE FAUX N'EST PAS UN DÉFAUT DE L'APPLICATION
//
// Pilotage du 2026-09-18 : « POST /auth/v1/token (HTTP 400) », gravité warn,
// 12 occurrences, 0 utilisateur touché, 2 appareils, écran feed. Chronologie :
// clic #authSubmitBtn → 400 → clic #authTabSignin → clic #authSubmitBtn → 400.
// Quelqu'un retape son mot de passe. GoTrue répond 400 (`invalid_credentials`),
// `onbDoAuth` affiche « E-mail ou mot de passe incorrect. » — tout est normal,
// sauf le hook fetch de telemetry.js, qui peignait ce refus en `warn` et
// ouvrait un « problème » au centre de pilotage.
//
// Trois mesures, et la troisième garde la porte de l'autre côté :
//   1. 400 sur /auth/v1/token → severity `info` + meta.refus_attendu (le
//      status reste `error` : le refus a eu lieu, on n'efface pas le fait) ;
//   2. 422 sur /auth/v1/signup → même chose (e-mail déjà pris, mot de passe
//      refusé) ;
//   3. 429 (quota) sur la même porte, et 400 sur une table REST ordinaire :
//      toujours `warn`, sans marque — ceux-là doivent se voir.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SOURCE_TELEMETRIE = path.join(__dirname, "..", "..", "js", "telemetry.js");

async function mesurer(page, chemin, statut) {
  return page.evaluate(async ({ chemin, statut }) => {
    window.__evts = [];
    window.tel.api = function (f) { window.__evts.push(f); };
    try { await fetch("https://faux-hote.supabase.co" + chemin + "?s=" + statut, { method: "POST", body: "{}" }); } catch (e) {}
    await new Promise((r) => setTimeout(r, 60));
    var miens = window.__evts.filter((f) => /faux-hote/.test(f.endpoint || f.action || ""));
    return miens.pop() || null;
  }, { chemin, statut });
}

test.describe("Télémétrie — refus attendu d'une porte d'authentification", () => {
  test.beforeEach(async ({ page }) => {
    // `?telemetry=1` : seul opt-in local, sinon le hook fetch n'est pas installé.
    await bootOnboarded(page, null, 1, { query: "?telemetry=1" });
    await page.route("**/rest/v1/telemetry_events*", (route) =>
      route.fulfill({ status: 201, contentType: "application/json", body: "[]" }));
    // Le faux hôte rend le statut demandé dans la query : un seul intercepteur
    // pour tous les cas.
    await page.route("**/faux-hote.supabase.co/**", (route) => {
      const s = Number(new URL(route.request().url()).searchParams.get("s")) || 500;
      route.fulfill({ status: s, contentType: "application/json", body: "{}" });
    });
  });

  test("① 400 sur /auth/v1/token → info + refus_attendu, status error conservé", async ({ page }) => {
    const ev = await mesurer(page, "/auth/v1/token", 400);
    expect(ev).not.toBeNull();
    expect(ev.status).toBe("error");
    expect(ev.severity).toBe("info");
    expect(ev.http_status).toBe(400);
    expect(ev.meta && ev.meta.refus_attendu).toBe(true);
  });

  test("② 422 sur /auth/v1/signup → même traitement", async ({ page }) => {
    const ev = await mesurer(page, "/auth/v1/signup", 422);
    expect(ev).not.toBeNull();
    expect(ev.severity).toBe("info");
    expect(ev.meta && ev.meta.refus_attendu).toBe(true);
  });

  test("③ 429 sur la porte, et 400 sur une table REST : toujours warn, jamais marqués", async ({ page }) => {
    const quota = await mesurer(page, "/auth/v1/token", 429);
    expect(quota).not.toBeNull();
    expect(quota.severity).toBe("warn");
    expect(quota.meta && quota.meta.refus_attendu).toBeFalsy();

    const rest = await mesurer(page, "/rest/v1/posts", 400);
    expect(rest).not.toBeNull();
    expect(rest.severity).toBe("warn");
    expect(rest.meta && rest.meta.refus_attendu).toBeFalsy();

    // Et une porte voisine non couverte (/auth/v1/user) reste un problème :
    // un 401 là-bas est la signature d'un jeton mort, pas d'un mot de passe faux.
    const user = await mesurer(page, "/auth/v1/user", 401);
    expect(user).not.toBeNull();
    expect(user.severity).toBe("warn");
  });

  test("③bis 404 sur /rest/v1/rpc/fil_compteurs (fonction absente : attente de migration ou retour arrière) → info + refus_attendu ; un 500 reste un problème", async ({ page }) => {
    const absente = await mesurer(page, "/rest/v1/rpc/fil_compteurs", 404);
    expect(absente).not.toBeNull();
    expect(absente.status).toBe("error");
    expect(absente.severity).toBe("info");
    expect(absente.meta && absente.meta.refus_attendu).toBe(true);
    const panne = await mesurer(page, "/rest/v1/rpc/fil_compteurs", 500);
    expect(panne.severity).toBe("warn");
    expect(panne.meta && panne.meta.refus_attendu).toBeFalsy();
    const autreRpc = await mesurer(page, "/rest/v1/rpc/autre", 404);
    expect(autreRpc.severity).toBe("warn");
  });

  test("④ contrat de source : la marque existe dans le hook fetch de telemetry.js", async () => {
    const src = fs.readFileSync(SOURCE_TELEMETRIE, "utf8");
    expect(src).toMatch(/refus_attendu: true/);
    expect(src).toMatch(/\/auth\\\/v1\\\/\(token\|signup\)\$/);
  });
});
