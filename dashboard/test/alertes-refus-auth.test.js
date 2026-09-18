// LOT E1 (E-M1/E-T1) — une vague de « Email not confirmed » (SMTP en panne) ou
// un captcha cassé bloquent les testeurs SANS qu'aucune alerte ne sorte : le
// hook fetch marque ces 400 `refus_attendu` (un mot de passe faux n'est pas un
// défaut) et les taisait tous. Le client émet désormais signin_refused /
// signup_refused {rc} depuis onbDoAuth ; ici, le pilotage doit lever un warn
// quand `non_confirme` ou `captcha` revient ≥ 3 fois depuis ≥ 2 appareils en
// 1 h — et se taire pour un appareil seul, pour `mdp`, ou pour des refus vieux.
// MUTATIONS : ignorer `rc` (`RC_REFUS_SIGNAL.has(rc)` → true) → ③ rouge ;
// ignorer les appareils (`appareils < REFUS_AUTH_APPAREILS` retiré) → ② rouge ;
// retirer le filtre d'1 h → ⑤ rouge ; retirer la règle entière → ① rouge.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// alerts.js persiste dans un JsonDb : jamais dans dashboard/data depuis un test.
const TMP = path.join(process.cwd(), "test", ".tmp-data-alertes-refus-auth");
process.env.DASH_DATA_DIR = TMP;
fs.rmSync(TMP, { recursive: true, force: true });

const { normalize } = await import("../server/store.js");
const alerts = await import("../server/alerts.js");

const recues = [];
alerts.onAlert((a) => recues.push(a));
const T = Date.now();
let n = 0;
function refus(rc, device, over = {}) {
  n++;
  return normalize({
    event_id: "ar" + n + "_" + Math.random(), received_at: new Date(T).toISOString(),
    type: "action", action: n % 2 ? "signin_refused" : "signup_refused",
    meta: { rc }, user_id: null, session_id: "s_ar_" + n, device_id: device,
    platform: "ios", browser: "safari", app_version: "1.0", screen: "feed",
    ...over,
  });
}
const alertesRefus = () => recues.filter((a) => /^authrefus:/.test(a.key));

test("① 3 « non_confirme » depuis 2 appareils en 1 h → un warn « Refus d'authentification en série »", () => {
  alerts._resetRefusAuth();
  recues.length = 0;
  alerts.onEvent(refus("non_confirme", "d1"));
  alerts.onEvent(refus("non_confirme", "d1"));
  assert.equal(alertesRefus().length, 0, "deux refus : pas encore une vague");
  alerts.onEvent(refus("non_confirme", "d2"));
  const a = alertesRefus();
  assert.equal(a.length, 1);
  assert.equal(a[0].level, "warn");
  assert.equal(a[0].key, "authrefus:non_confirme");
  assert.equal(a[0].meta.rc, "non_confirme");
  assert.equal(a[0].meta.n, 3);
  assert.equal(a[0].meta.appareils, 2);
  assert.match(a[0].message, /e-mail non confirmé/);
  // La vague est consommée : le refus suivant ne relève pas une 2e alerte.
  alerts.onEvent(refus("non_confirme", "d3"));
  assert.equal(alertesRefus().length, 1);
});

test("② 3 « captcha » depuis UN SEUL appareil → silence (un testeur qui insiste n'est pas une vague)", () => {
  alerts._resetRefusAuth();
  recues.length = 0;
  for (let i = 0; i < 4; i++) alerts.onEvent(refus("captcha", "d_seul"));
  assert.equal(alertesRefus().length, 0);
  assert.equal(alerts.serieRefusAuth([{ rc: "captcha", device: "x" }, { rc: "captcha", device: "x" }, { rc: "captcha", device: "x" }], "captcha"), null);
});

test("③ 3 « mdp » (mot de passe faux) depuis 2 appareils → silence : ce n'est pas un défaut", () => {
  alerts._resetRefusAuth();
  recues.length = 0;
  alerts.onEvent(refus("mdp", "d1"));
  alerts.onEvent(refus("mdp", "d2"));
  alerts.onEvent(refus("mdp", "d1"));
  alerts.onEvent(refus("deja_utilise", "d2"));
  alerts.onEvent(refus("autre", "d1"));
  assert.equal(alertesRefus().length, 0);
});

test("④ serieRefusAuth (pure) : seuil 3 ET 2 appareils, par motif", () => {
  const f = [{ rc: "captcha", device: "a" }, { rc: "captcha", device: "b" }, { rc: "non_confirme", device: "a" }, { rc: "captcha", device: "a" }];
  assert.deepEqual(alerts.serieRefusAuth(f, "captcha"), { n: 3, appareils: 2 });
  assert.equal(alerts.serieRefusAuth(f, "non_confirme"), null, "un seul non_confirme");
  assert.equal(alerts.serieRefusAuth(f.slice(0, 2), "captcha"), null, "deux refus seulement");
  assert.equal(alerts.serieRefusAuth([], "captcha"), null);
});

test("⑤ des refus vieux de plus d'une heure ne comptent pas", () => {
  alerts._resetRefusAuth();
  recues.length = 0;
  const vieux = new Date(T - 2 * 60 * 60_000).toISOString();
  alerts.onEvent(refus("captcha", "d1", { received_at: vieux }));
  alerts.onEvent(refus("captcha", "d2", { received_at: vieux }));
  alerts.onEvent(refus("captcha", "d1"));
  assert.equal(alertesRefus().length, 0, "un seul refus récent");
});
