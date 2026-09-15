// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-33 — la barrière des gestes critiques, éprouvée.
//
// Chaque cas ① à ⑧ REPRODUIT d'abord le comportement d'AVANT (la décision que
// `scripts/appliquer-migration.mjs` prenait au SHA 872e30e, réécrite ici en
// trois lignes) et EXIGE qu'il diverge de la barrière. Un test qui ne mesurerait
// que le nouveau code resterait vert le jour où on le retirerait.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const B = require("../../scripts/lib/barriere-migration.js");

const PROD = "njkiyoklssvefstljemx";
const STAGING = "fcksxofaelcdmmifnwjo";
const JETABLE = "abcdefghijklmnopqrst";

// Le choix de cible d'AVANT, à l'octet près (appliquer-migration.mjs:93-97).
const cibleAvant = ({ envRef, refLie }) => (envRef || refLie || "").trim();

const SQL = "-- une migration\nbegin;\ncreate table t(i int);\nselect 'contrôle' as quoi, 'OK' as verdict;\ncommit;\n";

test("① la cible implicite visait la production, la barrière la refuse", () => {
  // AVANT : aucune variable, poste lié à la production → la production.
  assert.equal(cibleAvant({ envRef: "", refLie: PROD }), PROD, "reproduction : l'ancien code visait bien le projet lié");
  // APRÈS : refus nommé, et le refus DIT quel projet est lié pour qu'on l'écrive.
  assert.throws(
    () => B.choisirCible({ envRef: "", refLie: PROD }),
    (e) => e.code === "cible_implicite" && e.message.includes(PROD),
    "la barrière doit refuser une cible non écrite"
  );
});

test("① bis une cible écrite passe, et la divergence avec le projet lié est DITE", () => {
  const c = B.choisirCible({ argProjet: STAGING, refLie: PROD });
  assert.equal(c.ref, STAGING);
  assert.equal(c.protegee, true);
  assert.equal(c.divergeDuProjetLie, true, "viser ailleurs que le projet lié doit se voir");
  assert.throws(() => B.choisirCible({ argProjet: "PROD-1" }), (e) => e.code === "cible_mal_formee");
});

test("② sans attestation, rien ne part vers une cible protégée", () => {
  const cible = B.choisirCible({ argProjet: PROD });
  assert.throws(
    () => B.verifierAttestation({ fichier: "migrations/m.sql", sql: SQL, cible, attestations: [] }),
    (e) => e.code === "attestation_absente" && e.message.includes(B.empreinte(SQL)),
    "le refus doit donner l'empreinte à faire revoir"
  );
});

test("③ une modification APRÈS revue invalide l'attestation (dérive nommée)", () => {
  const cible = B.choisirCible({ argProjet: PROD });
  const att = [{ fichier: "migrations/m.sql", empreinte: B.empreinte(SQL), cibles: [PROD], pr: "#451", relecteur: "codex", revue_le: "2026-09-15", source: "PR #451" }];
  // Le contenu exact revu passe.
  const ok = B.verifierAttestation({ fichier: "migrations/m.sql", sql: SQL, cible, attestations: att });
  assert.equal(ok.attestation.pr, "#451");
  // Un octet de plus : la revue ne vaut plus.
  const modifie = SQL.replace("create table t(i int);", "create table t(i int);\ndrop table u;");
  assert.throws(
    () => B.verifierAttestation({ fichier: "migrations/m.sql", sql: modifie, cible, attestations: att }),
    (e) => e.code === "derive_de_contenu",
    "une retouche après revue doit être refusée, pas avertie"
  );
});

test("③ bis CRLF n'est pas une dérive", () => {
  const cible = B.choisirCible({ argProjet: PROD });
  const att = [{ fichier: "migrations/m.sql", empreinte: B.empreinte(SQL), cibles: [PROD], pr: "#451", relecteur: "codex", revue_le: "2026-09-15", source: "PR #451" }];
  const crlf = SQL.replace(/\n/g, "\r\n");
  assert.equal(B.verifierAttestation({ fichier: "migrations/m.sql", sql: crlf, cible, attestations: att }).derive, false);
});

test("④ une attestation ne vaut que pour la cible qu'elle nomme, et pas sans origine", () => {
  const prod = B.choisirCible({ argProjet: PROD });
  const pourStaging = [{ fichier: "migrations/m.sql", empreinte: B.empreinte(SQL), cibles: [STAGING], pr: "#451", relecteur: "codex", revue_le: "2026-09-15", source: "PR #451" }];
  assert.throws(() => B.verifierAttestation({ fichier: "migrations/m.sql", sql: SQL, cible: prod, attestations: pourStaging }), (e) => e.code === "cible_non_attestee");
  const sansRelecteur = [{ fichier: "migrations/m.sql", empreinte: B.empreinte(SQL), cibles: [PROD], pr: "#451", revue_le: "2026-09-15", source: "PR #451" }];
  assert.throws(() => B.verifierAttestation({ fichier: "migrations/m.sql", sql: SQL, cible: prod, attestations: sansRelecteur }), (e) => e.code === "attestation_incomplete");
});

test("④ bis `--sans-attestation` ne contourne pas une cible protégée", () => {
  const prod = B.choisirCible({ argProjet: PROD });
  assert.throws(() => B.verifierAttestation({ fichier: "migrations/m.sql", sql: SQL, cible: prod, attestations: [], sansAttestation: true }), (e) => e.code === "attestation_non_contournable");
  // Une cible NON protégée (PostgreSQL jetable de banc) n'a pas de revue à produire.
  const jetable = B.choisirCible({ argProjet: JETABLE });
  assert.equal(B.verifierAttestation({ fichier: "migrations/m.sql", sql: SQL, cible: jetable, attestations: [] }).exigee, false);
});

test("⑤ le journal entre DANS la transaction, après `begin;` et jamais après le verdict", () => {
  const avecJournal = B.sqlAvecJournal(SQL, { fichier: "migrations/m.sql", cible: PROD, attestation: { pr: "#451" } });
  const iBegin = avecJournal.toLowerCase().indexOf("begin;");
  const iInsert = avecJournal.indexOf("insert into public.migrations_appliquees");
  const iVerdict = avecJournal.indexOf("select 'contrôle'");
  const iCommit = avecJournal.toLowerCase().lastIndexOf("commit;");
  assert.ok(iInsert > iBegin, "le journal est après begin;");
  assert.ok(iInsert < iVerdict, "le journal est AVANT le verdict — sinon il volerait les lignes rendues par l'API");
  assert.ok(iVerdict < iCommit, "le verdict reste la dernière instruction à rendre des lignes");
  // L'empreinte journalisée est celle du fichier REVU, pas du texte injecté.
  assert.ok(avecJournal.includes(B.empreinte(SQL)), "on journalise l'empreinte du contenu attesté");
});

test("⑤ bis un `begin;` en commentaire ne trompe pas l'injection", () => {
  const piege = "-- begin; (ceci est un commentaire)\nbegin;\nselect 1;\ncommit;\n";
  const out = B.sqlAvecJournal(piege, { fichier: "migrations/m.sql", cible: PROD });
  const iCom = out.indexOf("-- begin;");
  const iInsert = out.indexOf("insert into public.migrations_appliquees");
  assert.ok(iInsert > iCom, "l'insertion ne se glisse pas dans le commentaire");
  assert.ok(/\nbegin;\ninsert into public\.migrations_appliquees/.test(out), "elle suit le begin; réel");
});

test("⑥ le verdict global refuse de sortir vert si une phase a échoué ou est indéterminée", () => {
  assert.equal(B.verdictGlobal({ journal: { ok: true }, envoi: { ok: true }, verdict: { ok: true } }).ok, true);
  const echec = B.verdictGlobal({ journal: { ok: true }, envoi: { ok: true }, verdict: { ok: false, motif: "2 lignes ECHEC" } });
  assert.equal(echec.ok, false);
  assert.equal(echec.code, 1);
  const indet = B.verdictGlobal({ journal: { ok: true, indetermine: true, motif: "relecture impossible" }, envoi: { ok: true } });
  assert.equal(indet.ok, false, "un état indéterminé n'est pas un succès");
  assert.match(indet.echecs.join(" "), /INDÉTERMINÉ/);
  // AVANT : la sortie ne regardait QUE les lignes du verdict.
  const avant = (lignes) => (lignes.filter((l) => /ECHEC/.test(String(l.v))).length ? 1 : 0);
  assert.equal(avant([{ v: "OK" }]), 0, "reproduction : l'ancien code sortait 0 quel que soit l'état du journal");
});

test("⑦ les colonnes du journal se posent sans casser un journal existant", () => {
  const ddl = B.sqlColonnesJournal();
  assert.equal((ddl.match(/add column if not exists/g) || []).length, 3);
  assert.ok(!/drop /i.test(ddl), "la barrière ne détruit rien du journal existant");
});

test("⑧ une attestation RÉTROACTIVE est utilisable mais ne se dit jamais préalable", () => {
  const prod = B.choisirCible({ argProjet: PROD });
  const att = [{ fichier: "migrations/m.sql", empreinte: B.empreinte(SQL), cibles: [PROD], pr: "#440", relecteur: "PASSIO74", revue_le: "2026-09-14", consigne_le: "2026-09-15", retroactif: true, source: "dossier d'écart #440" }];
  const v = B.verifierAttestation({ fichier: "migrations/m.sql", sql: SQL, cible: prod, attestations: att });
  assert.equal(v.retroactive, true, "la reconstruction doit se voir, pas se fondre");
  assert.notEqual(v.attestation.revue_le, v.attestation.consigne_le, "date revendiquée et date de consignation restent séparées");
});

test("⑨ le CLI refuse réellement une cible implicite et une cible protégée non attestée", async () => {
  const { execFileSync } = await import("node:child_process");
  const run = (args) => {
    try { return { code: 0, out: execFileSync(process.execPath, ["scripts/appliquer-migration.mjs", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; }
    catch (e) { return { code: e.status, out: String(e.stdout || "") + String(e.stderr || "") }; }
  };
  const f = "migrations/migration_appels_invitations_attestees_2026-09-15.sql";
  const sansCible = run([f, "--verifier"]);
  assert.equal(sansCible.code, 2, "aucune cible écrite doit refuser");
  assert.match(sansCible.out, /aucune cible ÉCRITE/);
  const prodNonAtteste = run([f, "--verifier", "--projet", PROD]);
  assert.equal(prodNonAtteste.code, 2, "production sans attestation doit refuser");
  assert.match(prodNonAtteste.out, /aucune revue préalable attestée/);
  const contournement = run([f, "--verifier", "--projet", PROD, "--sans-attestation"]);
  assert.equal(contournement.code, 2, "`--sans-attestation` ne contourne pas une cible protégée");
});

// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-51 (cinquième contre-revue, 15/09/2026) — l'attestation déclarative
// ne prouvait rien : PR fictive, auteur relecteur, source « aucune revue » →
// `--verifier` sortait 0, « envoyable ». La preuve est désormais une REVUE
// GITHUB désignée (pr, commit, revue_id) et LUE ; ces cas la jouent avec un
// faux `gh` qui sert des fixtures (PASSIO_GH_BIN) — le vrai CLI, la vraie
// décision, seul le transport vers GitHub est doublé.
// ═══════════════════════════════════════════════════════════════════════════
const BAR = B;
const SHA = "0123456789abcdef0123456789abcdef01234567";
const FICHIER_51 = "migrations/migration_appels_invitations_attestees_2026-09-15.sql";
const MARQUEUR = "Contre-revue technique indépendante";

test("ASTRA-51 ① REPRODUCTION : une attestation TAPÉE (PR fictive, auteur relecteur, « aucune revue ») ne rend plus « envoyable »", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const d = mkdtempSync(join(tmpdir(), "astra51-"));
  const sql = readFileSync(FICHIER_51, "utf8");
  // La forme d'AVANT, complète au sens de l'ancienne barrière : quatre champs, tous présents.
  writeFileSync(join(d, "att.json"), JSON.stringify([{ fichier: FICHIER_51, empreinte: BAR.empreinte(sql), cibles: [PROD], pr: "#9999", relecteur: "moi-même", revue_le: "2026-09-15", consigne_le: "2026-09-15", source: "aucune revue" }]));
  // AVANT : `verifierAttestation` seule → exigee:true, attestation acceptée (reproduction pure).
  const avant = BAR.verifierAttestation({ fichier: FICHIER_51, sql, cible: BAR.choisirCible({ argProjet: PROD }), attestations: JSON.parse(readFileSync(join(d, "att.json"), "utf8")) });
  assert.equal(avant.exigee, true); assert.ok(avant.attestation, "reproduction : l'ancienne barrière acceptait cette attestation");
  let r;
  try { r = { code: 0, out: execFileSync(process.execPath, ["scripts/appliquer-migration.mjs", FICHIER_51, "--verifier", "--projet", PROD], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PASSIO_ATTESTATIONS: join(d, "att.json") } }) }; }
  catch (e) { r = { code: e.status, out: String(e.stdout || "") + String(e.stderr || "") }; }
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /ne désigne pas le COMMIT revu/);
  assert.doesNotMatch(r.out, /envoyable/);
});

function fauxGh(fixtures) {
  // Un `gh` qui ne sait faire que `api <chemin>` et répond depuis des fixtures
  // (revues d'une PR, PR elle-même, contenu d'un fichier à un commit).
  const { mkdtempSync, writeFileSync, chmodSync, mkdirSync } = require("node:fs");
  const { tmpdir } = require("node:os");
  const { join } = require("node:path");
  const d = mkdtempSync(join(tmpdir(), "faux-gh-"));
  mkdirSync(join(d, "bin"));
  writeFileSync(join(d, "fixtures.json"), JSON.stringify(fixtures));
  writeFileSync(join(d, "gh.mjs"), [
    'import { readFileSync } from "node:fs";',
    'const fx = JSON.parse(readFileSync(process.env.FAUX_GH_FIXTURES, "utf8"));',
    'const [cmd, chemin] = process.argv.slice(2);',
    'if (cmd !== "api" || typeof chemin !== "string") { process.stderr.write("faux gh : " + JSON.stringify(process.argv.slice(2)) + "\\n"); process.exit(2); }',
    'const cle = Object.keys(fx).find((k) => chemin.startsWith(k));',
    'if (!cle) { process.stderr.write("gh: Not Found (HTTP 404) " + chemin + "\\n"); process.exit(1); }',
    'process.stdout.write(JSON.stringify(fx[cle]));',
  ].join("\n"));
  // Le chemin du script node : `github-revue.js` le lance avec node (portable) ;
  // les fixtures sont désignées par l'environnement, hérité par le CLI.
  process.env.FAUX_GH_FIXTURES = join(d, "fixtures.json");
  return join(d, "gh.mjs");
}

test("ASTRA-51 ② avec une revue GitHub réelle dans sa forme (ancrée, marquée, nommant fichier et cible, contenu identique) : envoyable ; chaque condition manquante refuse", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const sql = readFileSync(FICHIER_51, "utf8");
  const emp = BAR.empreinte(sql);
  const corpsOk = MARQUEUR + " — " + FICHIER_51 + " relu ligne à ligne ; cible: " + PROD + " ; SHA " + SHA;
  const revueOk = { id: 4242, commit_id: SHA, state: "COMMENTED", submitted_at: "2026-09-15T20:00:00Z", user: { login: "PASSIO74" }, body: corpsOk };
  const fixtures = (revue, contenu) => ({
    "repos/PASSIO74/passio-app/pulls/469/reviews": [revue],
    "repos/PASSIO74/passio-app/pulls/469": { user: { login: "PASSIO74" } },
    ["repos/PASSIO74/passio-app/contents/" + FICHIER_51 + "?ref=" + SHA]: { content: Buffer.from(contenu, "utf8").toString("base64") },
  });
  const jouer = (revue, contenu, att) => {
    const d = mkdtempSync(join(tmpdir(), "astra51-"));
    writeFileSync(join(d, "att.json"), JSON.stringify([{ fichier: FICHIER_51, empreinte: emp, cibles: [PROD], pr: "#469", commit: SHA, revue_id: 4242, relecteur: "PASSIO74", revue_le: "2026-09-15", consigne_le: "2026-09-15", source: "https://github.com/PASSIO74/passio-app/pull/469#pullrequestreview-4242", ...(att || {}) }]));
    const gh = fauxGh(fixtures(revue, contenu));
    try { return { code: 0, out: execFileSync(process.execPath, ["scripts/appliquer-migration.mjs", FICHIER_51, "--verifier", "--projet", PROD], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PASSIO_ATTESTATIONS: join(d, "att.json"), PASSIO_GH_BIN: gh, PASSIO_DEPOT: "PASSIO74/passio-app" } }) }; }
    catch (e) { return { code: e.status, out: String(e.stdout || "") + String(e.stderr || "") }; }
  };
  const ok = jouer(revueOk, sql);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /envoyable/);
  assert.match(ok.out, /preuve\s+: revue GitHub n°4242 \(COMMENTED/);
  assert.match(ok.out, /relecteur = auteur de la PR/, "le mono-mainteneur est DIT, pas caché");
  // Chaque condition, retirée, refuse — et nomme ce qui manque.
  const autreCommit = jouer({ ...revueOk, commit_id: "f".repeat(40) }, sql);
  assert.equal(autreCommit.code, 2); assert.match(autreCommit.out, /ancrée sur ffffffffffff/);
  const sansMarqueur = jouer({ ...revueOk, body: "LGTM " + FICHIER_51 + " cible: " + PROD }, sql);
  assert.equal(sansMarqueur.code, 2); assert.match(sansMarqueur.out, /marqueur/);
  const sansFichier = jouer({ ...revueOk, body: MARQUEUR + " cible: " + PROD }, sql);
  assert.equal(sansFichier.code, 2); assert.match(sansFichier.out, /ne nomme pas `migrations/);
  const autreCible = jouer({ ...revueOk, body: MARQUEUR + " " + FICHIER_51 + " cible: zzzzzzzzzzzzzzzzzzzz" }, sql);
  assert.equal(autreCible.code, 2); assert.match(autreCible.out, /ne nomme pas la cible/);
  const autreRelecteur = jouer({ ...revueOk, user: { login: "quelquun" } }, sql);
  assert.equal(autreRelecteur.code, 2); assert.match(autreRelecteur.out, /n'est pas le relecteur attesté/);
  const autreContenu = jouer(revueOk, sql + "\n-- retouché après revue\n");
  assert.equal(autreContenu.code, 2); assert.match(autreContenu.out, /a regardé un autre contenu/);
  const revueInconnue = jouer({ ...revueOk, id: 1 }, sql);
  assert.equal(revueInconnue.code, 2); assert.match(revueInconnue.out, /aucune revue n°4242/);
  const changesRequested = jouer({ ...revueOk, state: "CHANGES_REQUESTED" }, sql);
  assert.equal(changesRequested.code, 2); assert.match(changesRequested.out, /ni approuvée ni commentée/);
});

test("ASTRA-51 ③ sans `gh` joignable la preuve est NON VÉRIFIABLE : refus, jamais « envoyable »", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const d = mkdtempSync(join(tmpdir(), "astra51-"));
  writeFileSync(join(d, "att.json"), JSON.stringify([{ fichier: FICHIER_51, empreinte: BAR.empreinte(readFileSync(FICHIER_51, "utf8")), cibles: [PROD], pr: "#469", commit: SHA, revue_id: 4242, relecteur: "PASSIO74", revue_le: "2026-09-15", consigne_le: "2026-09-15", source: "x" }]));
  let r;
  try { r = { code: 0, out: execFileSync(process.execPath, ["scripts/appliquer-migration.mjs", FICHIER_51, "--verifier", "--projet", PROD], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PASSIO_ATTESTATIONS: join(d, "att.json"), PASSIO_GH_BIN: "/chemin/inexistant/gh", PASSIO_DEPOT: "PASSIO74/passio-app" } }) }; }
  catch (e) { r = { code: e.status, out: String(e.stdout || "") + String(e.stderr || "") }; }
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /NON VÉRIFIABLE/);
  assert.doesNotMatch(r.out, /envoyable/);
});

test("ASTRA-51 ④ la décision pure : un même auteur est dit, une approbation vaut, le contenu envoyé doit être celui du commit", () => {
  const sql = "begin;\nselect 1;\ncommit;\n";
  const emp = BAR.empreinte(sql);
  const cible = { ref: PROD };
  const att = { pr: "#1", commit: SHA, revue_id: 7, relecteur: "tiers", empreinte: emp };
  const revue = { id: 7, commit_id: SHA, state: "APPROVED", user: { login: "tiers" }, body: MARQUEUR + " migrations/m.sql cible: " + PROD };
  const r = BAR.verifierPreuveRevue({ attestation: att, fichier: "migrations/m.sql", empreinteAttendue: emp, cible, revues: [revue], contenuAuCommit: sql, auteurPr: "PASSIO74" });
  assert.equal(r.ok, true); assert.equal(r.memeAuteurQueLaPr, false);
  assert.throws(() => BAR.verifierPreuveRevue({ attestation: att, fichier: "migrations/m.sql", empreinteAttendue: BAR.empreinte(sql + "x"), cible, revues: [revue], contenuAuCommit: sql }), /n'est pas celui du commit revu/);
  assert.throws(() => BAR.verifierPreuveRevue({ attestation: att, fichier: "migrations/m.sql", empreinteAttendue: emp, cible, revues: null, contenuAuCommit: sql }), /NON VÉRIFIABLE/);
});
