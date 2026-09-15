// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-50 (cinquième contre-revue Astra, 2026-09-15) — le classement des
// réponses du SDK quand l'invitation d'appel est déposée.
//
// Deux vérités mesurées, pas supposées :
//   · les RÉPONSES viennent du SDK EMBARQUÉ (js/vendor/supabase-js-2.116.0.js),
//     chargé dans un contexte Node avec un `fetch` scripté — transport en
//     échec, 403/42501, 404/PGRST205, 503 HTML, 429, 401/PGRST301, 201 ;
//   · la FONCTION testée est `_callClasserReponseInvite` extraite TELLE QUELLE
//     de js/app-05-config-profil.js (marqueurs PASSIO_TESTABLE) : c'est le code
//     déployé, pas une copie.
// Le défaut : tout `error` qui n'était pas « table absente » devenait « refus »,
// donc « Appel impossible vers cette personne » sur un simple `Failed to fetch`.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app05 = fs.readFileSync(new URL("../../js/app-05-config-profil.js", import.meta.url), "utf8");
const debut = app05.indexOf("// >>> PASSIO_TESTABLE _callClasserReponseInvite");
const fin = app05.indexOf("// <<< PASSIO_TESTABLE", debut);
assert.ok(debut > 0 && fin > debut, "les marqueurs PASSIO_TESTABLE encadrent la fonction dans app-05");
const classer = new Function(app05.slice(debut, fin) + "\nreturn _callClasserReponseInvite;")();

// Le SDK embarqué, dans un bac à sable Node.
function sdk() {
  const code = fs.readFileSync(new URL("../../js/vendor/supabase-js-2.116.0.js", import.meta.url), "utf8");
  const bac = { Headers, Response, Request, URL, URLSearchParams, WebSocket: globalThis.WebSocket, setTimeout, clearTimeout, setInterval, clearInterval, console, TextEncoder, TextDecoder, crypto: globalThis.crypto, AbortController, navigator: { onLine: true, userAgent: "node" } };
  bac.globalThis = bac; bac.self = bac;
  vm.createContext(bac);
  vm.runInContext(code + "\n;globalThis.__supabase = supabase;", bac);
  return bac.__supabase.createClient;
}
const createClient = sdk();
const json = (status, corps) => async () => new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });
async function reponse(fetchFaux) {
  const client = createClient("https://xyz.supabase.co", "anon", { global: { fetch: fetchFaux } });
  return client.from("call_invites").upsert({ id: "x", from_id: "a", to_id: "b", kind: "voice" }, { onConflict: "id" });
}

test("ASTRA-50 ① REPRODUCTION : transport en échec → le SDK rend status 0, code vide, « TypeError: Failed to fetch » ; c'était « refus », c'est « echec »", async () => {
  const r = await reponse(async () => { throw new TypeError("Failed to fetch"); });
  assert.equal(r.status, 0); assert.equal(r.error.code, ""); assert.match(r.error.message, /Failed to fetch/);
  // AVANT : `if (code === "PGRST205" || …) repli; sinon "refus"` → refus.
  const avant = (r.error.code === "PGRST205" || r.error.code === "42P01") ? "repli" : "refus";
  assert.equal(avant, "refus", "reproduction : l'ancien classement disait refus");
  assert.equal(classer(r), "echec");
});

test("ASTRA-50 ② les formes réelles du SDK, chacune à sa place", async () => {
  assert.equal(classer(await reponse(json(403, { code: "42501", message: "new row violates row-level security policy for table \"call_invites\"" }))), "refus");
  assert.equal(classer(await reponse(json(404, { code: "PGRST205", message: "Could not find the table 'public.call_invites' in the schema cache" }))), "repli");
  assert.equal(classer(await reponse(async () => new Response("<html>503 Service Unavailable</html>", { status: 503, headers: { "Content-Type": "text/html" } }))), "echec", "503 : pas de code, message HTML — transitoire");
  assert.equal(classer(await reponse(json(429, { code: "PGRST000", message: "rate limited" }))), "echec");
  assert.equal(classer(await reponse(json(401, { code: "PGRST301", message: "JWT expired" }))), "session");
  assert.equal(classer(await reponse(async () => new Response("", { status: 201 }))), "ok");
  assert.equal(classer(await reponse(json(409, { code: "23505", message: "duplicate key value violates unique constraint" }))), "refus", "une contrainte ne passera jamais : refus, pas répétition");
});

test("ASTRA-50 ③ le code prime sur le statut ; l'inconnu est transitoire ; l'absurde n'est jamais « ok »", () => {
  assert.equal(classer({ error: { code: "42501", message: "rls" } }), "refus", "un double sans statut reste un refus");
  assert.equal(classer({ status: 0, error: { code: "", message: "TypeError: Failed to fetch" } }), "echec");
  assert.equal(classer({ status: 500, error: { message: "boom" } }), "echec");
  assert.equal(classer({ status: 418, error: { code: "XX000", message: "théière" } }), "echec", "inconnu : la répétition continue, le délai de sonnerie borne");
  assert.equal(classer(null), "echec");
  assert.equal(classer({ error: null }), "ok");
});
