// ═══════════════════════════════════════════════════════════════════════════
// TÉLÉMÉTRIE — UN JETON DE SESSION MORT NE DOIT PAS FAIRE PERDRE LES LOTS
//
// Mesuré en production le 2026-09-16 : « Lot de télémétrie rejeté (auth) après
// 6 essais (HTTP 401) », 4 fois, 1 appareil, 0 utilisateur. L'appareil n'avait
// PAS de compte joignable (toutes ses lignes en `user_id` NULL) mais portait
// encore un `sb-<ref>-auth-token` périmé que le SDK ne rafraîchissait pas ;
// telemetry.js l'envoyait quand même en `Authorization`, PostgREST refusait
// (401), et après la grâce le lot était JETÉ. Or ses lignes étaient toutes
// désattribuées : la clé anon suffisait.
//
// Deux règles, mesurées ici par OBSERVATION RÉSEAU (jamais par l'intention) :
//  ① sans compte reconnu par l'application, la clé anon part dès le premier
//     envoi — le jeton persisté n'est jamais joint ;
//  ② avec un compte mais un jeton refusé après la grâce, le lot repart
//     DÉSATTRIBUÉ sous la clé anon au lieu d'être perdu.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");
const { onboardedState, sansDonneesDistantes } = require("./app-helper");

const REF = "njkiyoklssvefstljemx";
const UID = "8a9e2c40-1b6d-4f0e-9c3a-2f7d5e6a1b23";

// Un jeton MORT : périmé depuis une heure, que personne ne rafraîchira (la
// route `auth/v1/token` est coupée, comme un rafraîchissement qui échoue).
function jetonMort() {
  return JSON.stringify({
    access_token: "dead.dead.dead", refresh_token: "dead", token_type: "bearer",
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 3600,
    user: { id: UID, aud: "authenticated", role: "authenticated" },
  });
}

async function preparer(page, { compte }) {
  await sansDonneesDistantes(page);
  await page.route("**/auth/v1/token*", (route) => route.abort("failed"));
  const envois = [];
  await page.route("**/rest/v1/telemetry_events*", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    const auth = (req.headers()["authorization"] || "").replace(/^Bearer\s+/i, "");
    const anon = req.headers()["apikey"] || "";
    let rows = [];
    try { rows = JSON.parse(req.postData() || "[]"); } catch (e) { rows = []; }
    const viaAnon = auth === anon;
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    envois.push({ viaAnon, userIds, actions: rows.map((r) => r.action) });
    // Le serveur, FIDÈLE à la policy réelle (`user_id IS NULL OR user_id =
    // auth.uid()`) : un jeton mort est refusé (401 PGRST301) ; sous la clé anon,
    // `auth.uid()` est NULL, donc une seule ligne portant un uuid fait refuser
    // le lot entier par la RLS (403, 42501).
    if (!viaAnon) return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "PGRST301", message: "JWT expired" }) });
    if (userIds.some((u) => u != null)) return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "42501", message: "new row violates row-level security policy" }) });
    return route.fulfill({ status: 201, contentType: "application/json", body: "" });
  });
  await page.addInitScript(([k, t, st, jeton, uid]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("sb-" + "njkiyoklssvefstljemx" + "-auth-token", jeton);
    if (st) {
      if (!localStorage.getItem("passio_mvp_state_v1")) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
      localStorage.setItem("passio_uid", uid);
    }
  }, [GATE_KEY, GATE_TOKEN, compte ? onboardedState(1) : null, jetonMort(), UID]);
  await page.goto("/index.html?telemetry=1");
  return envois;
}

test.describe("Télémétrie — jeton de session mort", () => {
  test("① sans compte reconnu, la clé anon part dès le premier lot : aucun 401, rien de jeté", async ({ page }) => {
    test.setTimeout(60000);
    const envois = await preparer(page, { compte: false });
    await page.waitForFunction(() => (window.MY_UID || "").length > 0, null, { timeout: 15000 });
    // Deux lots au moins : celui du démarrage et un forcé.
    await page.waitForTimeout(4000);
    await page.evaluate(() => { window.tel.action("banc_jeton_mort", {}); window.tel.flush(); });
    await page.waitForTimeout(1500);
    expect(envois.length).toBeGreaterThanOrEqual(1);
    // L'appareil n'a pas de compte : l'identité que l'app se fabrique
    // (`getMyUserId`, app-08) est un `u_…`, et c'est ce que la télémétrie lit.
    const uid = await page.evaluate(() => [getMyUserId(), window.MY_UID]);
    expect(uid[0]).toMatch(/^u_/);
    expect(uid[1]).toBe(uid[0]);
    for (const e of envois) {
      expect(e.viaAnon, "chaque lot part sous la clé anon, jamais sous le jeton mort").toBe(true);
      expect(e.userIds).toEqual([null]);
      expect(e.actions).not.toContain("server_reject");
    }
  });

  test("② avec un compte et un jeton refusé après la grâce, le lot repart DÉSATTRIBUÉ sous la clé anon — jamais perdu", async ({ page }) => {
    test.setTimeout(150000);
    const envois = await preparer(page, { compte: true });
    await page.waitForFunction(() => window.MY_UID === "8a9e2c40-1b6d-4f0e-9c3a-2f7d5e6a1b23", null, { timeout: 15000 });
    // Grâce : 1,5 + 3 + 4,5 + 6 + 7,5 + 9 s de reprise = ~32 s, puis le repli.
    // ⚠️ Le SDK peut aussi RETIRER lui-même le jeton mort en cours de route
    // (rafraîchissement définitivement refusé) : le repli arrive alors plus tôt,
    // par « pas de session persistée » — les deux chemins doivent converger.
    // ⚠️ SEUL COMPTE UN LOT ANONYME APRÈS UN REFUS DU JETON (2026-11-07). Le lot
    // `start` part AVANT que `window.MY_UID` soit posé : anonyme et désattribué lui
    // aussi, il satisfaisait l'ancienne attente dès la première lecture. Le test
    // concluait alors en ~1 s, sans avoir vu la grâce ni le repli (28 fois sur 32),
    // et rougissait quand le premier lot sous jeton n'était pas encore arrivé.
    const repliApresRefus = () => {
      const i = envois.findIndex((e) => !e.viaAnon);
      return i >= 0 && envois.slice(i + 1).some((e) => e.viaAnon && e.userIds.length === 1 && e.userIds[0] === null);
    };
    await expect.poll(repliApresRefus, { message: "un lot sous le jeton mort, puis un lot désattribué sous la clé anon", timeout: 90000, intervals: [1000] }).toBe(true);
    const refuses = envois.filter((e) => !e.viaAnon);
    const acceptes = envois.filter((e) => e.viaAnon);
    // Le jeton mort a bien été tenté (le scénario est exercé), avec l'identité du compte.
    expect(refuses.some((e) => e.userIds.includes(UID)), "le jeton mort est tenté sous l'identité du compte").toBe(true);
    // « Jamais perdu » : tout ce que le jeton n'a pas fait passer repart sous la clé anon.
    const parties = acceptes.flatMap((e) => e.actions);
    expect(refuses[0].actions.filter((a) => !parties.includes(a)), "le lot refusé n'est pas jeté").toEqual([]);
    // INVARIANT : sous la clé anon, jamais un uuid — sinon la RLS refuse le lot entier.
    for (const e of acceptes) expect(e.userIds, "clé anon ⇒ lignes désattribuées").toEqual([null]);
    // Rien n'est jeté : aucun `server_reject`, et le repli après la grâce est
    // tracé comme information (présent si c'est ce chemin-là qui a été pris).
    expect(envois.flatMap((e) => e.actions)).not.toContain("server_reject");
    // (`auth_desattribue` est enfilé en FIN de file : il peut n'être que dans un
    // lot accepté SUIVANT — on attend qu'il paraisse, on ne l'exige pas du premier.)
    if (refuses.length > 6) {
      await expect.poll(() => envois.filter((e) => e.viaAnon).flatMap((e) => e.actions).includes("auth_desattribue"),
        { timeout: 30000, intervals: [1000] }).toBe(true);
    }
  });
});
