// Coupures « au départ » : la page part, ses requêtes tombent — ce n'est pas un
// problème (voir l'en-tête de server/store.js). Le banc rejoue la chronologie
// RÉELLE du 2026-09-16 (session end → 4 « Failed to fetch » → lifecycle hidden,
// la même seconde) dans les DEUX ordres d'arrivée, puis vérifie que tout ce qui
// n'est pas prouvé reste un problème.
import { test } from "node:test";
import assert from "node:assert/strict";
import { store, normalize } from "../server/store.js";

let n = 0;
const T0 = Date.parse("2026-09-16T07:01:59.000Z");
function ev(over = {}) {
  n++;
  const client = over.client_ms ?? 0;
  delete over.client_ms;
  return normalize({
    event_id: "cd" + n + "_" + Math.random(), received_at: new Date(T0).toISOString(),
    client_ts: new Date(T0 + client).toISOString(),
    type: "api", action: "GET njkiyoklssvefstljemx.supabase.co/rest/v1/passions",
    endpoint: "njkiyoklssvefstljemx.supabase.co/rest/v1/passions",
    status: "error", severity: "error", http_status: 0, message: "Failed to fetch",
    user_id: "u_cd", session_id: "s_cd_" + n, device_id: "d_cd", platform: "ios", browser: "safari",
    app_version: "2026.08.0", env: "production", screen: "feed",
    ...over,
  });
}
const bugsDe = (msg) => store.bugList().filter((b) => b.message === msg || b.title === msg);
const comptePour = (msg) => bugsDe(msg).reduce((a, b) => a + b.count, 0);

test("① chronologie réelle : `session end` PUIS quatre échecs la même seconde → aucun problème", () => {
  const s = "s_reel_1";
  const avant = comptePour("Failed to fetch");
  store.add(ev({ type: "session", action: "end", status: "ok", severity: "info", http_status: null, message: null, session_id: s, client_ms: 0 }));
  for (const chemin of ["rpc/declare_birth_year", "user_state", "passions"]) {
    store.add(ev({ action: "GET h/rest/v1/" + chemin, endpoint: "h/rest/v1/" + chemin, session_id: s, client_ms: 40 }));
  }
  store.add(ev({ action: "GET h/auth/v1/user", endpoint: "h/auth/v1/user", session_id: s, client_ms: 45 }));
  // L'erreur « admission » historique : type error, libellé réseau, gravité error.
  store.add(ev({ type: "error", action: "admission", http_status: null, session_id: s, client_ms: 50 }));
  store.add(ev({ type: "lifecycle", action: "hidden", status: "ok", severity: "info", http_status: null, message: null, session_id: s, client_ms: 120 }));
  store._reglerAttente(true);
  assert.equal(comptePour("Failed to fetch"), avant, "aucune des cinq lignes ne devient un problème");
  assert.equal(store.sessions.get(s).errorCount, 0, "la session ne compte aucun problème");
});

test("② ordre INVERSE d'ingestion (même received_at) : les échecs arrivent avant leur `session end`", () => {
  const s = "s_reel_2";
  const avant = comptePour("Failed to fetch");
  store.add(ev({ session_id: s, client_ms: 40 }));
  store.add(ev({ action: "GET h/rest/v1/user_state", endpoint: "h/rest/v1/user_state", session_id: s, client_ms: 41 }));
  // Pas encore classés : rien à compter tant que le contexte n'est pas là…
  assert.equal(comptePour("Failed to fetch"), avant);
  store.add(ev({ type: "session", action: "end", status: "ok", severity: "info", http_status: null, message: null, session_id: s, client_ms: 0 }));
  store._reglerAttente(true);
  assert.equal(comptePour("Failed to fetch"), avant, "le départ arrivé après explique rétroactivement");
  assert.equal(store.enAttente.filter((a) => a.ev.session_id === s).length, 0, "rien ne reste en attente");
});

test("③ un échec réseau que RIEN n'explique reste un problème (après le délai d'attente)", () => {
  const s = "s_inexplique";
  const avant = comptePour("Failed to fetch");
  store.add(ev({ session_id: s, client_ms: 0 }));
  // Un départ trop loin (12 s) n'explique rien.
  store.add(ev({ type: "session", action: "end", status: "ok", severity: "info", http_status: null, message: null, session_id: s, client_ms: 12_000 }));
  store._reglerAttente(true);
  assert.equal(comptePour("Failed to fetch"), avant + 1, "un échec inexpliqué est compté, une fois");
  assert.equal(store.sessions.get(s).errorCount, 1);
});

test("④ la preuve du CLIENT suffit, sans départ : meta.fermeture / masquee / hors_ligne", () => {
  const avant = comptePour("Failed to fetch");
  store.add(ev({ session_id: "s_meta_1", severity: "warn", meta: { masquee: false, hors_ligne: false, fermeture: true } }));
  store.add(ev({ session_id: "s_meta_2", severity: "warn", meta: { masquee: true, hors_ligne: false, fermeture: false } }));
  store.add(ev({ session_id: "s_meta_3", severity: "warn", meta: { masquee: false, hors_ligne: true, fermeture: false } }));
  store._reglerAttente(true);
  assert.equal(comptePour("Failed to fetch"), avant);
  // …et un `meta` qui dit le contraire n'est pas une preuve : reste un candidat, puis un problème.
  store.add(ev({ session_id: "s_meta_4", meta: { masquee: false, hors_ligne: false, fermeture: false } }));
  store._reglerAttente(true);
  assert.equal(comptePour("Failed to fetch"), avant + 1);
});

test("⑤ un REFUS du serveur au moment du départ reste un problème : ce n'est pas une coupure", () => {
  const s = "s_refus";
  const avant = comptePour("permission denied for table events");
  store.add(ev({ type: "session", action: "end", status: "ok", severity: "info", http_status: null, message: null, session_id: s, client_ms: 0 }));
  store.add(ev({ action: "POST h/rest/v1/events", endpoint: "h/rest/v1/events", http_status: 401, message: "permission denied for table events", session_id: s, client_ms: 30 }));
  store._reglerAttente(true);
  assert.equal(comptePour("permission denied for table events"), avant + 1);
});

test("⑥ une erreur JS ordinaire au moment du départ reste un problème : seul le libellé réseau est candidat", () => {
  const s = "s_js";
  const avant = comptePour("x is not a function");
  store.add(ev({ type: "session", action: "end", status: "ok", severity: "info", http_status: null, message: null, session_id: s, client_ms: 0 }));
  store.add(ev({ type: "error", action: "window_error", http_status: null, message: "x is not a function", session_id: s, client_ms: 30 }));
  store._reglerAttente(true);
  assert.equal(comptePour("x is not a function"), avant + 1);
});

test("⑦ une erreur rétrogradée en `warn` par son émetteur (admission, coupure réseau) n'est pas un problème", () => {
  const avant = comptePour("Failed to fetch");
  store.add(ev({ type: "error", action: "admission", severity: "warn", http_status: null, session_id: "s_adm_warn", meta: { v: "v1", statut: "reseau", ctx: "declare" } }));
  store._reglerAttente(true);
  assert.equal(comptePour("Failed to fetch"), avant);
});

test("⑧ sans session_id, un échec réseau n'a aucun contexte possible : compté tout de suite", () => {
  const avant = comptePour("Failed to fetch");
  store.add(ev({ session_id: null }));
  assert.equal(comptePour("Failed to fetch"), avant + 1, "compté sans attendre");
});

test("⑨ le délai d'attente est borné : un candidat non réglé finit compté (bugList le règle)", () => {
  const s = "s_delai";
  const avant = comptePour("Failed to fetch");
  store.add(ev({ session_id: s, client_ms: 0 }));
  assert.equal(comptePour("Failed to fetch"), avant, "pas encore : le délai court");
  // On vieillit artificiellement l'entrée au lieu d'attendre 10 s.
  for (const a of store.enAttente) if (a.ev.session_id === s) a.depuis -= 60_000;
  assert.equal(comptePour("Failed to fetch"), avant + 1, "bugList() règle et compte");
});
