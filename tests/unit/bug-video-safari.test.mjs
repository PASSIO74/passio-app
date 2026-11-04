// BUG DES CONTRÔLES VIDÉO DE SAFARI — ni une panne de PASSIO, ni une raison de
// perdre les vraies erreurs.
//
// Les piles et le message viennent de la production (2026-11-03, Safari 26.6.2).
// Les vrais blocs de js/platform.js et js/telemetry.js tournent dans une VM.
//
// MUTATIONS qui le font rougir : retirer le test d'adresse (②) ; retirer le test
// du nom de variable ou de l'accesseur (②) ; appeler report() avant la signature
// (③, quota) ; retirer le verrou « une trace par session » (④) ; garder le type
// « error » pour le bug Safari (④).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const MESSAGE = "ReferenceError: Can't find variable: EmptyRanges";
const PILE_PLAYED = "played@\nsyncControl@\nhandleEvent@";
const PILE_BUFFERED = "buffered@\nendTimeForBufferedRangeContainingCurrentTime@\nsyncControl@\nhandleEvent@";
const bugSafari = (pile = PILE_PLAYED) => ({ message: MESSAGE, filename: "undefined", lineno: 1705, colno: 1, error: { stack: pile } });
const vraie = (n = 1) => ({ message: "TypeError: vraie " + n, filename: "https://passio-app.netlify.app/js/app-02.js", lineno: 12, colno: 3, error: { stack: "f@https://passio-app.netlify.app/js/app-02.js:12:3" } });

function bloc(fichier, debut, fin) {
  const source = fs.readFileSync(new URL("../../js/" + fichier, import.meta.url), "utf8");
  const a = source.indexOf(debut), b = source.indexOf(fin, a);
  assert.ok(a >= 0 && b > a, "bloc introuvable dans " + fichier);
  return source.slice(a, b);
}

function chargerMoniteur() {
  const ecouteurs = {}, envois = [];
  const ctx = {
    location: { hostname: "passio-app.netlify.app", search: "", pathname: "/" },
    navigator: { userAgent: "Safari" }, URLSearchParams,
    setInterval: () => 0, clearInterval() {},
    addEventListener: (type, fn) => { ecouteurs[type] = fn; },
    _supaReal: true,
    supa: { from: () => ({ insert: (p) => { envois.push(p); return { then() {} }; } }) },
  };
  ctx.window = ctx;
  vm.runInNewContext(bloc("platform.js", "// ═══ MONITORING", "var _ua "), ctx);
  return { ecouteurs, envois, signature: ctx.passioBugVideoSafari };
}

function chargerTelemetrie(signature) {
  const ecouteurs = {}, traces = [];
  const ctx = {
    addEventListener: (type, fn) => { ecouteurs[type] = fn; },
    track: (type, action, champs) => traces.push({ type, action, ...champs }),
    flush() {},
  };
  ctx.window = ctx;
  if (signature) ctx.passioBugVideoSafari = signature;
  vm.runInNewContext(bloc("telemetry.js", "// 3) Erreurs JS", "// 4) Navigation"), ctx);
  return { ecouteurs, traces };
}

test("① les piles réelles de la production sont reconnues, source vide ou « undefined »", () => {
  const { signature } = chargerMoniteur();
  assert.equal(signature(MESSAGE, "undefined", PILE_PLAYED), true);
  assert.equal(signature(MESSAGE, "undefined", PILE_BUFFERED), true);
  assert.equal(signature(MESSAGE, "", "seekable@\nsyncControl@\nhandleEvent@"), true);
  assert.equal(signature(MESSAGE, "undefined", "played@[native code]\nhandleEvent@"), true);
});

test("② rien d'autre n'est écarté : une erreur de notre code reste une erreur", () => {
  const { signature } = chargerMoniteur();
  const adresse = "https://passio-app.netlify.app/js/app-02.js:12:3";
  assert.equal(signature(MESSAGE, "undefined", "played@" + adresse), false, "adresse en tête de pile");
  assert.equal(signature(MESSAGE, "undefined", "played@\nsyncControl@" + adresse), false, "adresse plus bas dans la pile");
  assert.equal(signature(MESSAGE, "https://passio-app.netlify.app/js/app-02.js", PILE_PLAYED), false, "source réelle");
  assert.equal(signature("ReferenceError: Can't find variable: autre", "undefined", PILE_PLAYED), false, "autre variable");
  assert.equal(signature(MESSAGE, "undefined", "autreChose@\nsyncControl@"), false, "autre accesseur");
  assert.equal(signature(MESSAGE, "undefined", ""), false, "pile absente : on ne sait pas, on remonte");
  assert.equal(signature(MESSAGE, "undefined", undefined), false);
  assert.equal(signature(undefined, undefined, undefined), false);
});

test("③ client_errors : le bug Safari ne part pas et ne consomme pas les 5 remontées de la session", () => {
  const { ecouteurs, envois } = chargerMoniteur();
  for (let i = 0; i < 10; i++) ecouteurs.error(bugSafari(i % 2 ? PILE_PLAYED : PILE_BUFFERED));
  assert.equal(envois.length, 0);
  for (let i = 1; i <= 6; i++) ecouteurs.error(vraie(i));
  assert.deepEqual(envois.map((p) => p.message), [1, 2, 3, 4, 5].map((n) => "TypeError: vraie " + n), "le quota de 5 reste entier pour les vraies erreurs");
  assert.equal(envois[0].stack, vraie().error.stack);
});

test("④ télémétrie : une seule trace hors du type error, et les vraies erreurs inchangées", () => {
  const { signature } = chargerMoniteur();
  const { ecouteurs, traces } = chargerTelemetrie(signature);
  for (let i = 0; i < 10; i++) ecouteurs.error(bugSafari());
  assert.equal(traces.length, 1);
  assert.equal(traces[0].type, "context");
  assert.equal(traces[0].action, "safari_video_controls_bug");
  ecouteurs.error(vraie());
  assert.equal(traces.length, 2);
  assert.equal(traces[1].type, "error");
  assert.equal(traces[1].action, "window_error");
  assert.equal(traces[1].severity, "error");
  assert.equal(traces[1].stack, vraie().error.stack);
  assert.equal(traces[1].endpoint, vraie().filename);
});

test("⑤ sans platform.js, la télémétrie remonte tout : le doute ne cache jamais une erreur", () => {
  const { ecouteurs, traces } = chargerTelemetrie(null);
  ecouteurs.error(bugSafari());
  assert.equal(traces.length, 1);
  assert.equal(traces[0].type, "error");
});
