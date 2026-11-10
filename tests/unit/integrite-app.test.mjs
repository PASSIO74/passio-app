// L'EMPREINTE `integrity` QUE LA PAGE DÉCLARE EST CELLE DES OCTETS SERVIS (2026-11-10).
//
// Depuis le 2026-11-10, chacun des 9 scripts du bloc app porte l'empreinte sha384 de
// ses octets (scripts/build.js, étape 1) : après un retour arrière, le script d'une
// autre version resté en cache sous la même adresse est refusé, puis redemandé
// (tests/e2e/app-scripts-par-fichier.spec.js ⑦ ⑧). Le revers : une empreinte qui ne
// désigne pas le fichier servi, et toute la production s'arrête sur son premier
// script. Les 9 scripts sont donc minifiés PAR le build (étape 1 bis,
// `PASSIO_MINIFIER_APP=1`), qui remplace chaque empreinte par celle des octets
// minifiés ; et le déploiement relit la page minifiée avant de partir
// (scripts/verifier-integrite-app.js).
//   ① un vrai build : 9 paires (adresse, empreinte), chaque empreinte est celle du
//     fichier écrit, et le contrôle ne trouve rien ;
//   ② le contrôle refuse : un octet changé, un fichier absent, un fichier de trop,
//     une adresse sans empreinte, une page sans chargeur ; il lit les deux guillemets ;
//   ③ la minification du build : chaque empreinte devient celle des octets minifiés,
//     à sa place, et ni le buildId ni les `?v=` ne bougent (un build local rend ceux
//     de la production) — mutation : ne pas remplacer l'empreinte → ③ rouge ;
//   ④ un script que le minifieur n'arrive pas à traiter part brut, avec l'empreinte
//     du brut — l'ancienne règle du workflow, sans casser la page.
// Le banc construit dans un arbre jetable, avec un FAUX terser
// (`node_modules/terser/bin/terser`) : le job « Audits » de la CI n'a pas de
// node_modules. Le vrai terser est éprouvé par la passe « Gates artefact » (le build y
// minifie, et scripts/servir-dist.js refuse un artefact incohérent) et par le
// déploiement.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { controler, lirePaires } = require(path.join(RACINE, "scripts", "verifier-integrite-app.js"));
const sri = (octets) => "sha384-" + crypto.createHash("sha384").update(octets).digest("base64");

// Le faux minifieur : même interface que la commande du build (`<f> -o <sortie>
// --compress --mangle`). Il retire les lignes de commentaire `//` en tête de ligne —
// des octets différents, un script toujours valide — et échoue sur le fichier que
// nomme FAUX_TERSER_ECHEC.
const FAUX_TERSER = `#!/usr/bin/env node
const fs = require("fs");
const [entree, , sortie] = process.argv.slice(2);
if (process.env.FAUX_TERSER_ECHEC && entree.endsWith(process.env.FAUX_TERSER_ECHEC)) { console.error("refus du faux terser"); process.exit(1); }
fs.writeFileSync(sortie, fs.readFileSync(entree, "utf8").split("\\n").filter((l) => !/^\\s*\\/\\//.test(l)).join("\\n"));
`;

let arbre;
before(() => {
  arbre = fs.mkdtempSync(path.join(os.tmpdir(), "passio-integrite-"));
  fs.mkdirSync(path.join(arbre, "scripts"));
  for (const d of ["js", "data"]) fs.cpSync(path.join(RACINE, d), path.join(arbre, d), { recursive: true });
  for (const f of ["index.html", "styles.css", "sw.js", "scripts/build.js"]) fs.copyFileSync(path.join(RACINE, f), path.join(arbre, f));
  const terser = path.join(arbre, "node_modules", "terser");
  fs.mkdirSync(path.join(terser, "bin"), { recursive: true });
  fs.writeFileSync(path.join(terser, "package.json"), JSON.stringify({ name: "terser", version: "0.0.0-banc" }));
  fs.writeFileSync(path.join(terser, "bin", "terser"), FAUX_TERSER);
});
after(() => { if (arbre) fs.rmSync(arbre, { recursive: true, force: true }); });

function construire(sortie, variables = {}) {
  const env = { ...process.env, ...variables };
  for (const k of ["COMMIT_REF", "GITHUB_SHA", "PASSIO_BUILD_TIME", "PASSIO_SUPABASE_URL", "PASSIO_SUPABASE_ANON"]) delete env[k];
  if (!("PASSIO_MINIFIER_APP" in variables)) delete env.PASSIO_MINIFIER_APP;
  const dossier = path.join(arbre, sortie);
  execFileSync(process.execPath, ["scripts/build.js", path.join(dossier, "index.html")], { cwd: arbre, env, stdio: "pipe", timeout: 120000 });
  const html = fs.readFileSync(path.join(dossier, "index.html"), "utf8");
  return { dossier, html, paires: lirePaires(html), release: JSON.parse(fs.readFileSync(path.join(dossier, "release.json"), "utf8")) };
}

// Une copie d'artefact qu'un cas peut abîmer sans toucher aux autres.
function copie(source, nom) {
  const d = path.join(arbre, nom);
  fs.cpSync(source.dossier, d, { recursive: true });
  return d;
}

let brut;
before(() => { brut = construire("dist-brut"); });

test("① un vrai build : 9 paires (adresse, empreinte), chacune celle du fichier écrit", () => {
  assert.equal(brut.paires.length, 9);
  const adresses = [...brut.html.matchAll(/"(app\/app-0\d[\w-]*\.js\?v=[0-9a-f]+)"/g)].map((m) => m[1]);
  assert.deepEqual(brut.paires.map((p) => p.adresse), adresses, "chaque adresse du chargeur porte son empreinte, dans l'ordre du bloc");
  for (const p of brut.paires) assert.equal(p.integrite, sri(fs.readFileSync(path.join(brut.dossier, "app", p.nom))), p.nom);
  assert.deepEqual(controler(brut.dossier).problemes, []);
  // Le chargeur pose l'empreinte sur le preload ET sur le <script>.
  assert.match(brut.html, /if \(integrite\) l\.integrity = integrite;/);
  assert.match(brut.html, /s\.integrity = scripts\[i\]\[1\];/);
});

test("② le contrôle refuse un octet changé, un fichier absent ou de trop, une adresse sans empreinte", () => {
  const unOctet = copie(brut, "abime-octet");
  fs.appendFileSync(path.join(unOctet, "app", "app-04-comments-shop.js"), "\n");
  const r1 = controler(unOctet).problemes;
  assert.equal(r1.length, 1, JSON.stringify(r1));
  assert.match(r1[0], /app-04-comments-shop\.js\?v=.* : la page déclare sha384-/);

  const absent = copie(brut, "abime-absent");
  fs.rmSync(path.join(absent, "app", "app-07-ia-explore-irl.js"));
  assert.match(controler(absent).problemes.join("\n"), /dist\/app\/ contient .*la page cite/);

  const deTrop = copie(brut, "abime-de-trop");
  fs.writeFileSync(path.join(deTrop, "app", "app-10-intrus.js"), "1;");
  assert.match(controler(deTrop).problemes.join("\n"), /app-10-intrus\.js/);

  // L'ancienne forme du chargeur (des adresses seules) : refusée, pas ignorée.
  const sansEmpreinte = copie(brut, "abime-sans-empreinte");
  const page = path.join(sansEmpreinte, "index.html");
  fs.writeFileSync(page, fs.readFileSync(page, "utf8").replace(/\[("app\/app-0\d[\w-]*\.js\?v=[0-9a-f]+"), "sha384-[^"]+"\]/g, "$1"));
  const r4 = controler(sansEmpreinte).problemes;
  assert.match(r4.join("\n"), /0 paire\(s\)/);
  assert.equal(r4.filter((p) => /cité par la page sans empreinte/.test(p)).length, 9);

  const sansPage = path.join(arbre, "abime-sans-page");
  fs.mkdirSync(sansPage, { recursive: true });
  assert.match(controler(sansPage).problemes.join("\n"), /introuvable/);
});

test("② il lit la page minifiée, guillemets simples ou doubles", () => {
  const html = '<script>!function(){var e=[["app/app-01-diag-seed.js?v=0123456789","sha384-AAAA+/9="],[\'app/app-09-boot-pwa.js?v=abcdef0123\',\'sha384-BBBB\']];}()</script>';
  assert.deepEqual(lirePaires(html), [
    { adresse: "app/app-01-diag-seed.js?v=0123456789", nom: "app-01-diag-seed.js", integrite: "sha384-AAAA+/9=" },
    { adresse: "app/app-09-boot-pwa.js?v=abcdef0123", nom: "app-09-boot-pwa.js", integrite: "sha384-BBBB" },
  ]);
});

test("③ la minification du build : chaque empreinte devient celle des octets minifiés, ni le buildId ni les ?v= ne bougent", () => {
  const mini = construire("dist-mini", { PASSIO_MINIFIER_APP: "1" });
  assert.deepEqual(controler(mini.dossier).problemes, [], "chaque empreinte de la page est celle du fichier minifié");
  let changes = 0;
  for (const [i, p] of mini.paires.entries()) {
    const octets = fs.readFileSync(path.join(mini.dossier, "app", p.nom));
    const source = fs.readFileSync(path.join(brut.dossier, "app", p.nom));
    if (!octets.equals(source)) changes++;
    assert.equal(p.adresse, brut.paires[i].adresse, p.nom + " : même adresse (le ?v= reste l'empreinte de la source)");
  }
  assert.ok(changes >= 8, `prémisse : le faux minifieur a bien changé les octets (${changes} fichiers sur 9)`);
  assert.equal(mini.release.buildId, brut.release.buildId, "même buildId : un build local rend celui de la production");
  assert.equal(mini.release.appHash, brut.release.appHash);
  // Rien d'autre n'a bougé dans la page que les empreintes.
  const sansEmpreintes = (h) => h.replace(/"sha384-[A-Za-z0-9+/]+={0,2}"/g, '"…"');
  assert.equal(sansEmpreintes(mini.html), sansEmpreintes(brut.html));
});

test("④ un script que le minifieur refuse part brut, avec l'empreinte du brut", () => {
  const r = construire("dist-echec", { PASSIO_MINIFIER_APP: "1", FAUX_TERSER_ECHEC: "app-03-posts-vlogs.js" });
  assert.deepEqual(controler(r.dossier).problemes, []);
  const p = r.paires.find((x) => x.nom === "app-03-posts-vlogs.js");
  assert.equal(p.integrite, brut.paires.find((x) => x.nom === "app-03-posts-vlogs.js").integrite, "le brut garde son empreinte");
  assert.ok(fs.readFileSync(path.join(r.dossier, "app", p.nom)).equals(fs.readFileSync(path.join(brut.dossier, "app", p.nom))), "le fichier servi est le brut");
  assert.ok(!fs.existsSync(path.join(r.dossier, "app", p.nom + ".min")), "aucun reste du minifieur");
});
