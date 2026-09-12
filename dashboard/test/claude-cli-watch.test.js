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

// ── Sonde non concluante ≠ déconnexion (2026-09-12) ──────────────────────────
// Défaut mesuré : `installed:false, loggedIn:false` en production alors que
// `claude auth status` répondait en 0,5 s à côté — un seul dépassement du délai
// (12 s, poste saturé, disque plein) affichait « CLI absente » et rendait la
// sentinelle sourde jusqu'au tour suivant. Mutations éprouvées : rabattre l'état
// dès le premier échec (rougit « garde l'état »), ou ne jamais le rabattre
// (rougit « N échecs »), ou poser reason:"logged_out" au lieu de "probe".
const CONNECTE = { checked: true, installed: true, loggedIn: true, available: true, version: "test", reason: null, probeFailures: 0 };
const sondeMuette = async () => ({ ran: false, reason: "timeout", err: "aucune réponse en 45 s" });
const sondeDeconnectee = async (args) => ({ ran: true, code: 1, out: args[0] === "--version" ? "9.9.9 (Claude Code)" : JSON.stringify({ loggedIn: false, authMethod: "none" }), err: "" });
const sondeConnectee = async (args) => ({ ran: true, code: 0, out: args[0] === "--version" ? "9.9.9 (Claude Code)" : JSON.stringify({ loggedIn: true, authMethod: "oauth" }), err: "" });

test("une sonde sans réponse GARDE l'état connu et compte, au lieu de déclarer le CLI absent", async () => {
  cli._setStateForTests({ ...CONNECTE });
  await cli.detectClaudeCli({ probe: sondeMuette });
  const s = cli.claudeCliState();
  assert.equal(s.installed, true, "le binaire n'a pas disparu parce qu'une sonde a traîné");
  assert.equal(s.loggedIn, true);
  assert.equal(s.available, true, "un délai dépassé n'est pas une déconnexion");
  assert.equal(s.probeFailures, 1);
  assert.equal(s.lastProbeError, "timeout");
});

test("après N sondes muettes de suite, indisponible avec la raison « probe » — et le retour remet tout à zéro", async () => {
  cli._setStateForTests({ ...CONNECTE });
  await cli.detectClaudeCli({ probe: sondeMuette });
  await cli.detectClaudeCli({ probe: sondeMuette });
  assert.equal(cli.claudeCliState().available, true, "deux échecs ne suffisent pas (défaut : 3)");
  await cli.detectClaudeCli({ probe: sondeMuette });
  const s = cli.claudeCliState();
  assert.equal(s.available, false);
  assert.equal(s.reason, "probe", "la raison dit « sonde muette », pas « session expirée » : le geste n'est pas le même");
  assert.equal(s.installed, true, "toujours pas « absent »");
  assert.equal(s.probeFailures, 3);
  // Le CLI répond de nouveau : disponible, compteur remis à zéro, raison effacée.
  await cli.detectClaudeCli({ probe: sondeConnectee });
  const r = cli.claudeCliState();
  assert.equal(r.available, true);
  assert.equal(r.probeFailures, 0);
  assert.equal(r.reason, null);
});

test("une réponse « loggedIn:false » est une VRAIE déconnexion : raison « logged_out », CLI toujours installé", async () => {
  cli._setStateForTests({ ...CONNECTE });
  await cli.detectClaudeCli({ probe: sondeDeconnectee });
  const s = cli.claudeCliState();
  assert.equal(s.installed, true);
  assert.equal(s.loggedIn, false);
  assert.equal(s.available, false);
  assert.equal(s.reason, "logged_out");
  assert.equal(s.probeFailures, 0, "la sonde a répondu : ce n'est pas un échec de sonde");
});

test("une sortie sans JSON (commande inconnue) = CLI absent, pas « déconnecté »", async () => {
  cli._setStateForTests({ ...CONNECTE, version: "" });
  await cli.detectClaudeCli({ probe: async () => ({ ran: true, code: 9009, out: "", err: "'claude' n'est pas reconnu" }) });
  const s = cli.claudeCliState();
  assert.equal(s.installed, false);
  assert.equal(s.reason, "not_installed");
});

test("« since » date le changement de disponibilité, pas chaque sonde", async () => {
  cli._setStateForTests({ ...CONNECTE, since: 1000 });
  await cli.detectClaudeCli({ probe: sondeConnectee });
  assert.equal(cli.claudeCliState().since, 1000, "toujours disponible : la date ne bouge pas");
  await cli.detectClaudeCli({ probe: sondeDeconnectee });
  assert.ok(cli.claudeCliState().since > 1000, "bascule : la date avance");
});

test("le retour connecté est signalé (info), une seule fois, jamais au tout premier démarrage", async () => {
  const vues = [];
  // Démarrage : jamais sondé → la première détection « connecté » n'est pas un retour.
  cli._setStateForTests({ checked: false, installed: false, loggedIn: false, available: false, reason: null });
  await cli.claudeCliWatchTick({ notify: (a) => vues.push(a), detect: () => cli.detectClaudeCli({ probe: sondeConnectee }) });
  assert.equal(vues.length, 0, "pas d'alerte « reconnecté » au démarrage");
  // Chute puis retour : warn puis info.
  await cli.claudeCliWatchTick({ notify: (a) => vues.push(a), detect: () => cli.detectClaudeCli({ probe: sondeDeconnectee }) });
  assert.equal(vues.length, 1);
  assert.equal(vues[0].level, "warn");
  assert.match(vues[0].message, /Connecter-Claude\.cmd|auth login/);
  await cli.claudeCliWatchTick({ notify: (a) => vues.push(a), detect: () => cli.detectClaudeCli({ probe: sondeConnectee }) });
  assert.equal(vues.length, 2, "le retour est signalé");
  assert.equal(vues[1].level, "info");
  assert.match(vues[1].title, /reconnecté/);
  await cli.claudeCliWatchTick({ notify: (a) => vues.push(a), detect: () => cli.detectClaudeCli({ probe: sondeConnectee }) });
  assert.equal(vues.length, 2, "toujours connecté : rien de neuf");
});

test("la chute par sonde muette porte SA raison dans l'alerte (disque, CLI bloqué), pas « auth login »", async () => {
  const vues = [];
  cli._setStateForTests({ ...CONNECTE, probeFailures: 2 });
  await cli.claudeCliWatchTick({ notify: (a) => vues.push(a), detect: () => cli.detectClaudeCli({ probe: sondeMuette }) });
  assert.equal(vues.length, 1);
  assert.match(vues[0].message, /sonde/i);
  assert.match(vues[0].message, /disque/i);
  assert.match(vues[0].message, /3 essais/);
});

test("noteAuthFailure SIGNALE la chute (une fois) : avant, cette chute-là était muette", async () => {
  const vues = [];
  cli._setStateForTests({ ...CONNECTE });
  cli.noteAuthFailure({ notify: (a) => vues.push(a) });
  await new Promise((r) => setImmediate(r));
  assert.equal(vues.length, 1, "un refus d'authentification pendant une analyse doit apparaître dans le flux");
  assert.equal(vues[0].level, "warn");
  assert.equal(cli.claudeCliState().reason, "auth_refused");
  cli.noteAuthFailure({ notify: (a) => vues.push(a) });
  await new Promise((r) => setImmediate(r));
  assert.equal(vues.length, 1, "déjà déconnecté : pas de doublon");
  // Et le tour de surveillance suivant, partant d'un état déjà déconnecté, ne
  // re-signale pas non plus.
  await cli.claudeCliWatchTick({ notify: (a) => vues.push(a), detect: () => cli.detectClaudeCli({ probe: sondeDeconnectee }) });
  assert.equal(vues.length, 1);
});

test("cadence adaptative : 10 min connecté, 1 min dès que la connexion manque", () => {
  assert.equal(cli.nextWatchDelay({ available: true }, 600_000, 60_000), 600_000);
  assert.equal(cli.nextWatchDelay({ available: false }, 600_000, 60_000), 60_000, "la reconnexion doit être vue vite");
  // Une cadence normale plus courte que la reprise ne rallonge jamais l'attente.
  assert.equal(cli.nextWatchDelay({ available: false }, 30_000, 60_000), 30_000);
});

// ── Connecter-Claude.cmd : la porte unique de reconnexion ────────────────────
// Si `DASH_CLAUDE_CONFIG_DIR` isole les identifiants du pilotage, un `claude
// auth login` dans un terminal ordinaire ne le reconnecte PAS : le script doit
// poser le même dossier que le serveur, et rien quand il n'est pas configuré.
const { lireCle, envCli } = await import("../scripts/connecter-claude.mjs");

test("connecter-claude pose CLAUDE_CONFIG_DIR exactement comme le serveur, et l'efface sinon", () => {
  const isole = envCli("PORT=4610\nDASH_CLAUDE_CONFIG_DIR=.claude-cli\n", { PATH: "x", CLAUDECODE: "1", CLAUDE_CONFIG_DIR: "ailleurs" });
  assert.match(isole.CLAUDE_CONFIG_DIR.replace(/\\/g, "/"), /dashboard\/\.claude-cli$/, "relatif à la racine du dashboard");
  assert.equal("CLAUDECODE" in isole, false, "la session Claude Code parente n'est pas héritée");
  const partage = envCli("PORT=4610\n", { PATH: "x", CLAUDE_CONFIG_DIR: "ailleurs" });
  assert.equal("CLAUDE_CONFIG_DIR" in partage, false, "sans isolation, on se connecte là où le serveur lit : ~/.claude");
  assert.equal(lireCle('A=1\nDASH_CLAUDE_CONFIG_DIR="C:/x/y"\n', "DASH_CLAUDE_CONFIG_DIR"), "C:/x/y");
  assert.equal(lireCle("A=1\n", "DASH_CLAUDE_CONFIG_DIR"), "");
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
