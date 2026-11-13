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
// LA FEUILLE DE STYLE, LE MÊME JOUR (scripts/build.js, étapes 2 et 2 bis ;
// tests/e2e/app-scripts-par-fichier.spec.js ⑨ ⑩) : ① son <link> porte l'empreinte du
// fichier écrit, et sa reprise est posée AVANT lui ; ② le contrôle refuse un octet
// changé, un <link> sans empreinte, une page sans feuille, une page sans la reprise ;
// ③ minifiée par le build,
// elle porte l'empreinte des octets minifiés, sans que son `?v=` ni le buildId ne
// bougent ; ⑤ si le minifieur la refuse, elle part brute avec l'empreinte du brut.
// Le banc construit dans un arbre jetable, avec un FAUX terser
// (`node_modules/terser/bin/terser`) et un FAUX clean-css
// (`node_modules/clean-css-cli/bin/cleancss`) : le job « Audits » de la CI n'a pas de
// node_modules. Les vrais sont éprouvés par la passe « Gates artefact » (le build y
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
const { controler, lirePaires, lireFeuilles } = require(path.join(RACINE, "scripts", "verifier-integrite-app.js"));
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
// Le faux clean-css : même interface que la commande du build (`-o <sortie> <entrée>`).
// Il retire les lignes vides — des octets différents, une feuille toujours valide — et
// échoue quand FAUX_CLEANCSS_ECHEC est posée.
const FAUX_CLEANCSS = `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const i = args.indexOf("-o");
const sortie = args[i + 1];
const entree = args.filter((a, j) => j !== i && j !== i + 1)[0];
if (process.env.FAUX_CLEANCSS_ECHEC) { console.error("refus du faux clean-css"); process.exit(1); }
fs.writeFileSync(sortie, fs.readFileSync(entree, "utf8").split("\\n").filter((l) => l.trim() !== "").join("\\n"));
`;

// Le faux minifieur de PAGE (STAB-10, 2026-11-12) : même interface que la commande du
// build (`--collapse-whitespace … -o <sortie> <entrée>`, `cli.js` à la racine du paquet).
// Il retire l'indentation et les lignes vides — `fauxPage`, la même transformation, dit
// ce qu'il doit rendre — et échoue quand FAUX_HTMLMIN_ECHEC est posée.
const fauxPage = (s) => s.split("\n").map((l) => l.trimStart()).filter((l) => l !== "").join("\n");
const FAUX_HTMLMIN = `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const i = args.indexOf("-o");
const sortie = args[i + 1];
const entree = args[args.length - 1];
if (process.env.FAUX_HTMLMIN_ECHEC) { console.error("refus du faux html-minifier-terser"); process.exit(1); }
fs.writeFileSync(sortie, (${fauxPage.toString()})(fs.readFileSync(entree, "utf8")));
`;

let arbre;
before(() => {
  arbre = fs.mkdtempSync(path.join(os.tmpdir(), "passio-integrite-"));
  fs.mkdirSync(path.join(arbre, "scripts"));
  for (const d of ["js", "data"]) fs.cpSync(path.join(RACINE, d), path.join(arbre, d), { recursive: true });
  for (const f of ["index.html", "styles.css", "sw.js", "scripts/build.js"]) fs.copyFileSync(path.join(RACINE, f), path.join(arbre, f));
  for (const [nom, bin, source] of [["terser", "terser", FAUX_TERSER], ["clean-css-cli", "cleancss", FAUX_CLEANCSS]]) {
    const paquet = path.join(arbre, "node_modules", nom);
    fs.mkdirSync(path.join(paquet, "bin"), { recursive: true });
    fs.writeFileSync(path.join(paquet, "package.json"), JSON.stringify({ name: nom, version: "0.0.0-banc" }));
    fs.writeFileSync(path.join(paquet, "bin", bin), source);
  }
  const paquetPage = path.join(arbre, "node_modules", "html-minifier-terser");
  fs.mkdirSync(paquetPage, { recursive: true });
  // Comme le vrai : `cli.js` n'est pas exporté, seul `package.json` l'est.
  fs.writeFileSync(path.join(paquetPage, "package.json"), JSON.stringify({ name: "html-minifier-terser", version: "0.0.0-banc", exports: { "./package.json": "./package.json" } }));
  fs.writeFileSync(path.join(paquetPage, "cli.js"), FAUX_HTMLMIN);
});
after(() => { if (arbre) fs.rmSync(arbre, { recursive: true, force: true }); });

function construire(sortie, variables = {}) {
  const env = { ...process.env, ...variables };
  for (const k of ["COMMIT_REF", "GITHUB_SHA", "PASSIO_BUILD_TIME", "PASSIO_SUPABASE_URL", "PASSIO_SUPABASE_ANON"]) delete env[k];
  if (!("PASSIO_MINIFIER_APP" in variables)) delete env.PASSIO_MINIFIER_APP;
  const dossier = path.join(arbre, sortie);
  execFileSync(process.execPath, ["scripts/build.js", path.join(dossier, "index.html")], { cwd: arbre, env, stdio: "pipe", timeout: 120000 });
  const html = fs.readFileSync(path.join(dossier, "index.html"), "utf8");
  return { dossier, html, paires: lirePaires(html), feuilles: lireFeuilles(html), release: JSON.parse(fs.readFileSync(path.join(dossier, "release.json"), "utf8")) };
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

test("① la feuille de style : UN <link> avec l'empreinte du fichier écrit, et sa reprise posée AVANT lui", () => {
  assert.equal(brut.feuilles.length, 1, JSON.stringify(brut.feuilles));
  const [f] = brut.feuilles;
  assert.equal(f.adresse, "styles.css?v=" + brut.release.cssHash, "l'adresse reste l'empreinte de la source");
  assert.equal(f.integrite, sri(fs.readFileSync(path.join(brut.dossier, "styles.css"))));
  // La reprise écoute `error` en capture sur le document, et elle est posée AVANT le
  // <link> : son échec part avant les scripts du <body> (qui attendent la feuille), un
  // écouteur posé après lui ne le verrait jamais (tests/e2e/app-scripts-par-fichier.spec.js ⑨ ⑩).
  const reprise = brut.html.indexOf('document.addEventListener("error"');
  const lien = brut.html.indexOf('<link rel="stylesheet" href="styles.css?v=');
  assert.ok(reprise > 0 && lien > reprise, `reprise à ${reprise}, <link> à ${lien}`);
  assert.equal(brut.html.slice(reprise, lien).includes("<script"), false, "rien d'autre ne s'exécute entre la reprise et le <link>");
  assert.match(brut.html.slice(reprise, lien), /fetch\(adresse, \{ cache: "reload" \}\)/);
  assert.match(brut.html.slice(reprise, lien), /replaceChild\(secours, l\)/, "le secours prend la place du <link> refusé (la cascade)");
  assert.match(brut.html.slice(reprise, lien), /insertBefore\(n, secours\.nextSibling\)/, "le <link> avec empreinte se pose juste après le secours");
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

test("② le contrôle refuse une feuille changée d'un octet, un <link> sans empreinte, une page sans feuille", () => {
  const unOctet = copie(brut, "abime-feuille-octet");
  fs.appendFileSync(path.join(unOctet, "styles.css"), "\n");
  const r1 = controler(unOctet).problemes;
  assert.equal(r1.length, 1, JSON.stringify(r1));
  assert.match(r1[0], /^styles\.css\?v=[0-9a-f]+ : la page déclare sha384-.*le fichier servi est sha384-/);

  const page = (d) => path.join(d, "index.html");
  const sansEmpreinte = copie(brut, "abime-feuille-sans-empreinte");
  fs.writeFileSync(page(sansEmpreinte), fs.readFileSync(page(sansEmpreinte), "utf8").replace(/(<link rel="stylesheet" href="styles\.css\?v=[0-9a-f]+") integrity="[^"]+"/, "$1"));
  assert.deepEqual(controler(sansEmpreinte).problemes, [`styles.css?v=${brut.release.cssHash} : citée par la page sans empreinte`]);

  const sansFeuille = copie(brut, "abime-sans-feuille");
  fs.writeFileSync(page(sansFeuille), fs.readFileSync(page(sansFeuille), "utf8").replace(/<link rel="stylesheet" href="styles\.css\?v=[^>]+>/, ""));
  assert.match(controler(sansFeuille).problemes.join("\n"), /la page cite 0 feuille\(s\) de style versionnée\(s\)/);

  const sansFichier = copie(brut, "abime-feuille-absente");
  fs.rmSync(path.join(sansFichier, "styles.css"));
  assert.match(controler(sansFichier).problemes.join("\n"), /styles\.css introuvable/);

  // L'empreinte SANS la reprise : le moindre refus laisserait la page sans styles.
  const sansReprise = copie(brut, "abime-sans-reprise");
  const avant = fs.readFileSync(page(sansReprise), "utf8");
  const sansElle = avant.replace(/<script>\n\/\* Reprise de la feuille de style[\s\S]*?<\/script>\n/, "");
  assert.ok(sansElle.length < avant.length, "prémisse : la reprise a bien été retirée de la page");
  fs.writeFileSync(page(sansReprise), sansElle);
  assert.deepEqual(controler(sansReprise).problemes, [`styles.css?v=${brut.release.cssHash} : sa reprise (scripts/build.js, étape 2) manque AVANT son <link> — un refus laisserait la page sans styles`]);
});

test("② il lit le <link> de la page minifiée : attributs dans tout ordre, guillemets doubles, simples ou absents", () => {
  const html = '<head><link rel=icon href=icon-192.png><link integrity=\'sha384-AAAA+/9=\' rel=stylesheet href=styles.css?v=0123456789abc><link rel="stylesheet" href="js/vendor/maplibre.css"></head>';
  assert.deepEqual(lireFeuilles(html), [{ adresse: "styles.css?v=0123456789abc", integrite: "sha384-AAAA+/9=" }]);
  assert.deepEqual(lireFeuilles('<link rel="stylesheet" href="styles.css?v=0123456789">'), [{ adresse: "styles.css?v=0123456789", integrite: null }]);
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
  // La feuille de style : minifiée, avec l'empreinte des octets minifiés, sous la même adresse.
  assert.ok(!fs.readFileSync(path.join(mini.dossier, "styles.css")).equals(fs.readFileSync(path.join(brut.dossier, "styles.css"))), "prémisse : le faux minifieur a bien changé la feuille");
  assert.equal(mini.feuilles[0].integrite, sri(fs.readFileSync(path.join(mini.dossier, "styles.css"))), "l'empreinte du <link> est celle de la feuille minifiée");
  assert.notEqual(mini.feuilles[0].integrite, brut.feuilles[0].integrite);
  assert.equal(mini.feuilles[0].adresse, brut.feuilles[0].adresse, "même adresse (le ?v= reste l'empreinte de la source)");
  assert.equal(mini.release.cssHash, brut.release.cssHash);
  // Rien d'autre n'a bougé dans la page que les empreintes — et la minification de la
  // page elle-même (étape 6 ter, le faux minifieur : `fauxPage`).
  const sansEmpreintes = (h) => h.replace(/"sha384-[A-Za-z0-9+/]+={0,2}"/g, '"…"');
  assert.equal(sansEmpreintes(mini.html), sansEmpreintes(fauxPage(brut.html)));
});

// STAB-10 (2026-11-12) : la PAGE est minifiée par le build, plus par le seul job de
// déploiement après tous les tests — la passe « Gates artefact » joue donc ses suites
// sur les octets qui partent. Mutation : retirer l'étape 6 ter → ⑥ rouge.
test("⑥ la page est minifiée par le build, ses empreintes restent celles des fichiers servis", () => {
  const mini = construire("dist-page", { PASSIO_MINIFIER_APP: "1" });
  assert.notEqual(mini.html, brut.html, "la page servie n'est plus la page brute");
  assert.equal(mini.html, fauxPage(mini.html), "la page a bien traversé le minifieur");
  assert.ok(!fs.existsSync(path.join(mini.dossier, "index.html.min")), "aucun reste du minifieur");
  assert.deepEqual(controler(mini.dossier).problemes, [], "chaque empreinte de la page minifiée est celle de son fichier");
  // Sans le drapeau (développement, passe des suites sur le dev) : page brute.
  assert.notEqual(brut.html, fauxPage(brut.html), "prémisse : la page brute porte de l'indentation");
});

test("⑦ une page que le minifieur refuse part brute, et le build réussit", () => {
  const r = construire("dist-echec-page", { PASSIO_MINIFIER_APP: "1", FAUX_HTMLMIN_ECHEC: "1" });
  const sansEmpreintes = (h) => h.replace(/"sha384-[A-Za-z0-9+/]+={0,2}"/g, '"…"');
  assert.equal(sansEmpreintes(r.html), sansEmpreintes(brut.html), "la page servie est la brute");
  assert.ok(!fs.existsSync(path.join(r.dossier, "index.html.min")), "aucun reste du minifieur");
  assert.deepEqual(controler(r.dossier).problemes, []);
});

test("④ un script que le minifieur refuse part brut, avec l'empreinte du brut", () => {
  const r = construire("dist-echec", { PASSIO_MINIFIER_APP: "1", FAUX_TERSER_ECHEC: "app-03-posts-vlogs.js" });
  assert.deepEqual(controler(r.dossier).problemes, []);
  const p = r.paires.find((x) => x.nom === "app-03-posts-vlogs.js");
  assert.equal(p.integrite, brut.paires.find((x) => x.nom === "app-03-posts-vlogs.js").integrite, "le brut garde son empreinte");
  assert.ok(fs.readFileSync(path.join(r.dossier, "app", p.nom)).equals(fs.readFileSync(path.join(brut.dossier, "app", p.nom))), "le fichier servi est le brut");
  assert.ok(!fs.existsSync(path.join(r.dossier, "app", p.nom + ".min")), "aucun reste du minifieur");
});

test("⑤ une feuille que le minifieur refuse part brute, avec l'empreinte du brut", () => {
  const r = construire("dist-echec-feuille", { PASSIO_MINIFIER_APP: "1", FAUX_CLEANCSS_ECHEC: "1" });
  assert.deepEqual(controler(r.dossier).problemes, []);
  assert.equal(r.feuilles[0].integrite, brut.feuilles[0].integrite, "la brute garde son empreinte");
  assert.ok(fs.readFileSync(path.join(r.dossier, "styles.css")).equals(fs.readFileSync(path.join(brut.dossier, "styles.css"))), "la feuille servie est la brute");
  assert.ok(!fs.existsSync(path.join(r.dossier, "styles.css.min")), "aucun reste du minifieur");
  // Les 9 scripts, eux, sont minifiés quand même : l'échec de l'un ne touche pas l'autre.
  assert.notEqual(r.paires[0].integrite, brut.paires[0].integrite);
});
