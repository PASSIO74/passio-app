// Verrous de la surveillance de connexion Claude Code et de l'interrupteur
// d'autopilote. Les deux corrigent la même famille de défaut : une chaîne
// d'auto-réparation dont une marche est éteinte SANS QUE RIEN NE LE DISE.
import test from "node:test";
import assert from "node:assert/strict";
import { appliquer, CLES } from "../scripts/autopilote.mjs";

const cli = await import("../server/claudecli.js");

test("noteAuthFailure rabat l'état sans prétendre que le binaire a disparu", () => {
  const apres = cli.noteAuthFailure();
  assert.equal(apres.loggedIn, false);
  assert.equal(apres.available, false);
  assert.equal(apres.checked, true);
  // `installed` n'est pas touché : c'est la SESSION qui tombe, pas le CLI.
  assert.equal("installed" in apres, true);
});

test("liveFixAvailable devient faux après un refus d'authentification", () => {
  cli.noteAuthFailure();
  // Sans clé API configurée dans l'environnement de test, l'analyse gratuite
  // est le seul canal : elle doit se déclarer indisponible.
  if (!process.env.ANTHROPIC_API_KEY) assert.equal(cli.liveFixAvailable(), false);
});

test("startClaudeCliWatch est idempotent et ne retient pas le processus", () => {
  const a = cli.startClaudeCliWatch(600000);
  const b = cli.startClaudeCliWatch(600000);
  assert.equal(a, b, "un second appel ne doit pas créer un second minuteur");
  cli.stopClaudeCliWatch();
  assert.notEqual(cli.startClaudeCliWatch(600000), null);
  cli.stopClaudeCliWatch();
});

test("la bascule connecté → déconnecté lève une alerte, une seule fois", async () => {
  const vues = [];
  // On force l'état « connecté » puis on laisse la détection réelle échouer
  // (aucun `claude` dans l'environnement de test) : c'est exactement la
  // transition à signaler.
  cli._setStateForTests({ checked: true, installed: true, loggedIn: true, available: true, version: "test" });
  // La détection est INJECTÉE : sonder le vrai `claude auth status` rendrait ce
  // verrou dépendant de la machine (il est vert sur un poste connecté, rouge en
  // CI — la divergence d'environnement que le dépôt paie régulièrement).
  const chute = () => { cli._setStateForTests({ loggedIn: false, available: false }); };
  const r1 = await cli.claudeCliWatchTick({ notify: (a) => vues.push(a), detect: chute });
  assert.equal(r1.avant, true);
  assert.equal(r1.apres, false);
  assert.equal(vues.length, 1, "la chute doit être signalée");
  assert.match(vues[0].message, /auth login/);
  assert.equal(vues[0].level, "warn", "warn : la sentinelle n'analyse que critical/high, et une analyse échouerait faute d'auth");

  // Toujours déconnecté au tour suivant : pas de nouvelle alerte (sinon le
  // flux se remplirait d'une alerte toutes les 10 minutes indéfiniment).
  const r2 = await cli.claudeCliWatchTick({ notify: (a) => vues.push(a), detect: chute });
  assert.equal(r2.changed, false);
  assert.equal(vues.length, 1);
});

test("l'interrupteur d'autopilote pose les trois clés sans toucher au reste", () => {
  const avant = "PORT=4610\nDASH_ADMIN_PASSWORD=secret\nDASH_ALLOW_MUTATIONS=true\n";
  const apres = appliquer(avant, true);
  assert.match(apres, /^DASH_SENTINEL_AUTOPILOT=true$/m);
  assert.match(apres, /^DASH_SENTINEL_LOCAL_GATE_V2=true$/m);
  assert.match(apres, /^DASH_ALLOW_MUTATIONS=true$/m);
  assert.match(apres, /^DASH_ADMIN_PASSWORD=secret$/m, "aucune autre clé ne bouge");
  assert.match(apres, /^PORT=4610$/m);
});

test("éteindre l'autopilote ne recoupe PAS le droit d'écrire le correctif", () => {
  const on = appliquer("DASH_ALLOW_MUTATIONS=true\n", true);
  const off = appliquer(on, false);
  assert.match(off, /^DASH_SENTINEL_AUTOPILOT=false$/m);
  assert.match(off, /^DASH_SENTINEL_LOCAL_GATE_V2=false$/m);
  // ⚠️ Le défaut à éviter : « autopilote off » doit vouloir dire « propose un
  // correctif prêt », pas « redevient un observateur muet ».
  assert.match(off, /^DASH_ALLOW_MUTATIONS=true$/m);
  assert.equal(CLES.find((c) => c.cle === "DASH_ALLOW_MUTATIONS").bascule, false);
});

test("une clé absente est ajoutée, une clé présente est remplacée (jamais dupliquée)", () => {
  const apres = appliquer("PORT=4610\nDASH_SENTINEL_AUTOPILOT=false\n", true);
  assert.equal((apres.match(/^DASH_SENTINEL_AUTOPILOT=/gm) || []).length, 1);
  assert.equal((apres.match(/^DASH_SENTINEL_LOCAL_GATE_V2=/gm) || []).length, 1);
  assert.match(apres, /^DASH_SENTINEL_AUTOPILOT=true$/m);
});
