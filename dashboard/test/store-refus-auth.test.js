// Un mot de passe faux n'est pas un défaut de l'application : GoTrue répond 400
// sur /auth/v1/token, l'écran de connexion le traduit, et le client marque
// l'événement `refus_attendu` (hook fetch de js/telemetry.js). Le centre de
// pilotage ne doit pas en faire un « problème » — mais un 429 (quota) ou un
// 400 sans la marque (client ancien) en reste un. Chronologie réelle du
// 2026-09-18 : 12 refus, 0 utilisateur, 2 appareils, écran feed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { store, normalize } from "../server/store.js";

let n = 0;
const T0 = Date.parse("2026-09-18T15:55:59.000Z");
function refus(over = {}) {
  n++;
  return normalize({
    event_id: "ra" + n + "_" + Math.random(), received_at: new Date(T0).toISOString(),
    client_ts: new Date(T0 + n).toISOString(),
    type: "api", action: "POST njkiyoklssvefstljemx.supabase.co/auth/v1/token",
    endpoint: "njkiyoklssvefstljemx.supabase.co/auth/v1/token",
    status: "error", severity: "info", http_status: 400, message: null,
    meta: { refus_attendu: true },
    user_id: null, session_id: "s_ra_" + n, device_id: "d_ra", platform: "ios", browser: "safari",
    app_version: "d6b54c3a", env: "production", screen: "feed",
    ...over,
  });
}
const compte = () => store.bugList()
  .filter((b) => (b.endpoint || "").includes("/auth/v1/token"))
  .reduce((a, b) => a + b.count, 0);

test("① deux mots de passe faux (400 refus_attendu) → aucun problème", () => {
  const avant = compte();
  store.add(refus()); store.add(refus());
  store._reglerAttente(true);
  assert.equal(compte(), avant, "un refus attendu n'ouvre pas de problème");
});

test("② le même 400 SANS la preuve reste un problème (client ancien)", () => {
  const avant = compte();
  store.add(refus({ meta: {}, severity: "warn" }));
  store._reglerAttente(true);
  assert.equal(compte(), avant + 1, "sans `refus_attendu`, rien n'excuse le 400");
});

test("③ un 429 (quota) sur la même porte n'est pas marqué par le client et reste visible", () => {
  const avant = compte();
  store.add(refus({ http_status: 429, severity: "warn", meta: {}, message: "Email rate limit exceeded" }));
  store._reglerAttente(true);
  assert.equal(compte(), avant + 1, "le quota doit se voir");
});
