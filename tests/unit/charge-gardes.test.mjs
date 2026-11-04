// ═══════════════════════════════════════════════════════════════════════════
// AUDIT F (2026-11-02) — LES GARDES DES DEUX BANCS DE CHARGE, MESURÉES.
//
// `scripts/charge.mjs` exécute du code au niveau module (il lit un jeton et parle
// à l'API de gestion) : on ne peut pas l'importer dans un test. On le lance
// donc comme un PROCESSUS, sans réseau nécessaire, et on mesure ses refus :
//   ⓪ le socle de tout le reste : cet enfant ne peut pas voir le jeton du poste ;
//   ① la production est refusée EN DUR, avant tout accès réseau ou jeton ;
//   ② `CI=true` sans `GITHUB_ACTIONS` est refusé (parité avec charge-realiste) ;
//   ③ une référence de projet mal formée est refusée ;
// puis, à la SOURCE (le seul endroit où l'on puisse le voir sans staging) :
//   ④ la montée en paliers lit `verdictPalierSimple` et S'ARRÊTE sur un rouge,
//      sauf `--forcer-paliers`, et le rapport porte les verdicts ;
//   ⑤ les effets externes : aucun des deux bancs n'envoie d'e-mail
//      (`email_confirm: true` sur chaque création de compte, jamais d'invite /
//      magiclink / otp) ni de push (aucun appel à `notify-call` ou aux
//      fonctions Edge), et le semis coupe les déclencheurs de notification.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHARGE = resolve(racine, "scripts", "charge.mjs");
const REALISTE = resolve(racine, "scripts", "charge-realiste.mjs");
const PROD = "njkiyoklssvefstljemx";

// ⚠️ UN DOSSIER PERSONNEL SE NEUTRALISE EN LE POSANT, JAMAIS EN LE RETIRANT.
// `os.homedir()` lit HOME sous POSIX et USERPROFILE sous Windows (HOMEDRIVE et
// HOMEPATH n'y jouent aucun rôle), et si la variable manque, il retombe sans
// erreur sur le VRAI dossier du compte. Avec HOME seul, ce banc trouvait donc
// sous Windows le vrai `~/.supabase/access-token` : charge.mjs tournait 20 s
// contre le staging, le `timeout` le tuait, et `npm run verif` s'arrêtait là.
const DOSSIER_INEXISTANT = "/nonexistent-home-audit-f";
const ENV_SANS_JETON = { PATH: process.env.PATH, HOME: DOSSIER_INEXISTANT, USERPROFILE: DOSSIER_INEXISTANT };

// Ce que verrait un enfant lancé avec cet environnement : le même calcul que `jeton()` dans charge.mjs.
function sonder(env) {
  const code = `const { homedir } = require("node:os"), { resolve } = require("node:path"), { existsSync } = require("node:fs");
console.log(JSON.stringify({ home: homedir(), jeton: existsSync(resolve(homedir(), ".supabase", "access-token")) }));`;
  const r = spawnSync(process.execPath, ["-e", code], { cwd: racine, encoding: "utf8", timeout: 20000, env });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

function lancer(args, env = {}) {
  // AVANT le processus : une isolation rompue échoue ici, au lieu de lancer une vraie charge contre le staging.
  const vu = sonder(ENV_SANS_JETON);
  assert.deepEqual(vu, { home: DOSSIER_INEXISTANT, jeton: false }, `isolation rompue, charge.mjs n'est pas lancé : ${JSON.stringify(vu)}`);
  const r = spawnSync(process.execPath, [CHARGE, ...args], {
    cwd: racine, encoding: "utf8", timeout: 20000,
    // Aucun jeton, aucun réseau : un refus qui arrive APRÈS la lecture du jeton
    // échouerait ici sur « aucun jeton », ce qui prouverait l'inverse.
    env: { ...ENV_SANS_JETON, ...env },
  });
  return { code: r.status, sortie: (r.stdout || "") + (r.stderr || "") };
}

test("⓪ l'enfant ne voit pas le jeton du poste, et la sonde saurait en voir un", () => {
  // Témoin positif : sans lui, « jeton: false » pourrait venir d'une sonde aveugle.
  const leurre = mkdtempSync(resolve(tmpdir(), "charge-gardes-"));
  try {
    mkdirSync(resolve(leurre, ".supabase"));
    writeFileSync(resolve(leurre, ".supabase", "access-token"), "sbp_leurre\n");
    assert.deepEqual(sonder({ PATH: process.env.PATH, HOME: leurre, USERPROFILE: leurre }), { home: leurre, jeton: true });
  } finally { rmSync(leurre, { recursive: true, force: true }); }
  assert.deepEqual(sonder(ENV_SANS_JETON), { home: DOSSIER_INEXISTANT, jeton: false });
  // La CI tourne sous Linux et n'y lit que HOME : sans cette ligne, y retirer USERPROFILE resterait vert.
  assert.deepEqual([ENV_SANS_JETON.HOME, ENV_SANS_JETON.USERPROFILE], [DOSSIER_INEXISTANT, DOSSIER_INEXISTANT]);
  // La sonde ne vaut que tant que charge.mjs lit le jeton de cette façon.
  assert.match(readFileSync(CHARGE, "utf8"), /resolve\(homedir\(\), "\.supabase", "access-token"\)/);
});

test("① charge.mjs refuse la PRODUCTION en dur, avant toute lecture de jeton", () => {
  const r = lancer(["--projet", PROD, "--paliers", "10", "--duree", "20"]);
  assert.equal(r.code, 2);
  assert.match(r.sortie, /jamais sur la production/);
  assert.doesNotMatch(r.sortie, /aucun jeton/, "le refus doit précéder la lecture du jeton");
});

test("② charge.mjs refuse la CI : GITHUB_ACTIONS, et aussi CI=true (parité avec charge-realiste)", () => {
  const staging = ["--projet", "fcksxofaelcdmmifnwjo", "--paliers", "10"];
  for (const env of [{ GITHUB_ACTIONS: "true" }, { CI: "true" }, { CI: "1" }]) {
    const r = lancer(staging, env);
    assert.equal(r.code, 2, JSON.stringify(env));
    assert.match(r.sortie, /pas de CI/, JSON.stringify(env));
  }
});

test("③ une référence de projet mal formée est refusée ; sans jeton, le staging s'arrête AVANT le réseau", () => {
  assert.match(lancer(["--projet", "PROD!", "--paliers", "10"]).sortie, /usage/);
  const r = lancer(["--projet", "fcksxofaelcdmmifnwjo", "--paliers", "10"]);
  assert.equal(r.code, 2);
  assert.match(r.sortie, /aucun jeton/);
});

test("④ à la source : la montée en paliers lit verdictPalierSimple, s'arrête sur un rouge sauf --forcer-paliers, et le rapport porte les verdicts", () => {
  const src = readFileSync(CHARGE, "utf8");
  assert.match(src, /import \{[^}]*verdictPalierSimple[^}]*\} from "\.\/charge-verdict\.mjs"/);
  const boucle = src.slice(src.indexOf("for (const v of paliers)"), src.indexOf("} finally {"));
  assert.ok(boucle.length > 100, "la boucle des paliers doit exister");
  assert.match(boucle, /const verdict = verdictPalierSimple\(l\)/);
  assert.match(boucle, /if \(!verdict\.ok\)/);
  assert.match(boucle, /drapeau\("--forcer-paliers"\)/);
  assert.match(boucle, /\bbreak;/, "un palier rouge interrompt la montée");
  assert.match(src, /paliersMesures: verdicts\.map/, "le rapport dit quels paliers ont réellement tourné");
  assert.match(src, /verdicts,\s*resultats: tout/);
});

test("⑤ effets externes neutralisés : comptes confirmés sans e-mail, aucune fonction Edge ni push, déclencheurs coupés au semis", () => {
  for (const f of [CHARGE, REALISTE]) {
    const src = readFileSync(f, "utf8");
    const creations = [...src.matchAll(/\/auth\/v1\/admin\/users["`]/g)].length;
    assert.ok(creations >= 1, f + " crée des comptes par l'API admin");
    const confirmes = [...src.matchAll(/email_confirm:\s*true/g)].length;
    assert.ok(confirmes >= 1, f + " confirme les comptes sans envoyer d'e-mail");
    assert.doesNotMatch(src, /\/auth\/v1\/(invite|magiclink|otp|recover|signup)/, f + " n'emprunte aucun chemin qui envoie un e-mail");
    assert.doesNotMatch(src, /functions\/v1\//, f + " n'appelle aucune fonction Edge (notify-call, pilotage…)");
    assert.doesNotMatch(src, /push_subscriptions|notify-call|web-push/, f + " n'émet aucune push");
  }
  const charge = readFileSync(CHARGE, "utf8");
  for (const t of ["profiles", "posts", "events", "stories"]) {
    assert.match(charge, new RegExp(`alter table public\\.${t} disable trigger user`), "semis : déclencheurs coupés sur " + t);
    assert.match(charge, new RegExp(`alter table public\\.${t} enable trigger user`), "semis : déclencheurs rétablis sur " + t);
  }
});
