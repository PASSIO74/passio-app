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
    try { return { code: 0, out: execFileSync(process.execPath, ["scripts/appliquer-migration.mjs", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GITHUB_ACTIONS: "" } }) }; }
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
  try { r = { code: 0, out: execFileSync(process.execPath, ["scripts/appliquer-migration.mjs", FICHIER_51, "--verifier", "--projet", PROD], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GITHUB_ACTIONS: "", PASSIO_ATTESTATIONS: join(d, "att.json") } }) }; }
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


// ⚠️ ASTRA-61 (sixième contre-revue, 16/09/2026) : le CLI sur une cible
// PROTÉGÉE n'accepte plus un fournisseur de preuve FICTIF (`PASSIO_GH_BIN`,
// `PASSIO_DEPOT`) — le banc ne peut donc plus faire dire « envoyable » au
// chemin qui certifie. La DÉCISION (approbation positive, indépendante, par
// un relecteur autorisé, liée au SHA, au contenu et à la cible) se mesure sur
// la fonction pure ; le CLI se mesure sur ses REFUS.
test("ASTRA-61 ① le CLI refuse un fournisseur de preuve FICTIF sur une cible protégée — le banc ne certifie rien", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const sql = readFileSync(FICHIER_51, "utf8");
  const emp = BAR.empreinte(sql);
  const corpsOk = MARQUEUR + " — " + FICHIER_51 + " relu ligne à ligne ; cible: " + PROD + " ; SHA " + SHA;
  const revueOk = { id: 4242, commit_id: SHA, state: "APPROVED", submitted_at: "2026-09-15T20:00:00Z", user: { login: "relecteur-tiers" }, body: corpsOk };
  const fixtures = {
    "repos/PASSIO74/passio-app/pulls/469/reviews": [revueOk],
    "repos/PASSIO74/passio-app/pulls/469": { user: { login: "PASSIO74" } },
    ["repos/PASSIO74/passio-app/contents/" + FICHIER_51 + "?ref=" + SHA]: { content: Buffer.from(sql, "utf8").toString("base64") },
  };
  const d = mkdtempSync(join(tmpdir(), "astra61-"));
  writeFileSync(join(d, "att.json"), JSON.stringify([{ fichier: FICHIER_51, empreinte: emp, cibles: [PROD], pr: "#469", commit: SHA, revue_id: 4242, relecteur: "relecteur-tiers", revue_le: "2026-09-15", consigne_le: "2026-09-15", source: "https://github.com/PASSIO74/passio-app/pull/469#pullrequestreview-4242" }]));
  writeFileSync(join(d, "relecteurs.json"), JSON.stringify({ relecteurs: ["relecteur-tiers"] }));
  const gh = fauxGh(fixtures);
  // Une preuve PARFAITE dans sa forme, servie par un faux gh : le CLI refuse quand même, en nommant le fournisseur.
  let r;
  try { r = { code: 0, out: execFileSync(process.execPath, ["scripts/appliquer-migration.mjs", FICHIER_51, "--verifier", "--projet", PROD], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GITHUB_ACTIONS: "", PASSIO_ATTESTATIONS: join(d, "att.json"), PASSIO_RELECTEURS: join(d, "relecteurs.json"), PASSIO_GH_BIN: gh, PASSIO_DEPOT: "PASSIO74/passio-app" } }) }; }
  catch (e) { r = { code: e.status, out: String(e.stdout || "") + String(e.stderr || "") }; }
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /fournisseur FICTIF \(PASSIO_GH_BIN=/);
  assert.doesNotMatch(r.out, /envoyable/);
  // Même chose pour `attester-migration.mjs` : rien n'est inscrit.
  let a;
  try { a = { code: 0, out: execFileSync(process.execPath, ["scripts/attester-migration.mjs", FICHIER_51, "--cible", PROD, "--pr", "#469", "--relecteur", "relecteur-tiers", "--source", "x", "--commit", SHA, "--revue", "4242"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GITHUB_ACTIONS: "", PASSIO_GH_BIN: gh, PASSIO_DEPOT: "PASSIO74/passio-app", PASSIO_RELECTEURS: join(d, "relecteurs.json") } }) }; }
  catch (e) { a = { code: e.status, out: String(e.stdout || "") + String(e.stderr || "") }; }
  assert.equal(a.code, 2, a.out);
  assert.match(a.out, /fournisseur FICTIF/);
  assert.doesNotMatch(a.out, /attestation inscrite/);
});

test("ASTRA-51 ③ sans `gh` joignable la preuve est NON VÉRIFIABLE : refus, jamais « envoyable »", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const d = mkdtempSync(join(tmpdir(), "astra51-"));
  writeFileSync(join(d, "att.json"), JSON.stringify([{ fichier: FICHIER_51, empreinte: BAR.empreinte(readFileSync(FICHIER_51, "utf8")), cibles: [PROD], pr: "#469", commit: SHA, revue_id: 4242, relecteur: "PASSIO74", revue_le: "2026-09-15", consigne_le: "2026-09-15", source: "x" }]));
  writeFileSync(join(d, "relecteurs.json"), JSON.stringify({ relecteurs: ["PASSIO74"] }));
  let r;
  // Sans override (fournisseur réel) mais sans `gh` dans le PATH : NON VÉRIFIABLE, jamais envoyable.
  try { r = { code: 0, out: execFileSync(process.execPath, ["scripts/appliquer-migration.mjs", FICHIER_51, "--verifier", "--projet", PROD], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GITHUB_ACTIONS: "", PASSIO_ATTESTATIONS: join(d, "att.json"), PASSIO_RELECTEURS: join(d, "relecteurs.json"), PASSIO_GH_BIN: "", PASSIO_DEPOT: "", PATH: "/chemin/inexistant", Path: "/chemin/inexistant" } }) }; }
  catch (e) { r = { code: e.status, out: String(e.stdout || "") + String(e.stderr || "") }; }
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /NON VÉRIFIABLE/);
  assert.doesNotMatch(r.out, /envoyable/);
});

test("ASTRA-61 ② la décision pure : APPROBATION positive, relecteur ≠ auteur, relecteur AUTORISÉ, liée au SHA, au contenu et à la cible — chaque condition retirée refuse", () => {
  const sql = "begin;\nselect 1;\ncommit;\n";
  const emp = BAR.empreinte(sql);
  const cible = { ref: PROD };
  const att = { pr: "#1", commit: SHA, revue_id: 7, relecteur: "tiers", empreinte: emp };
  const corps = MARQUEUR + " migrations/m.sql cible: " + PROD;
  const revue = { id: 7, commit_id: SHA, state: "APPROVED", user: { login: "tiers" }, body: corps };
  const base = { attestation: att, fichier: "migrations/m.sql", empreinteAttendue: emp, cible, revues: [revue], contenuAuCommit: sql, auteurPr: "PASSIO74", relecteursAutorises: ["tiers", "autre"] };
  const r = BAR.verifierPreuveRevue(base);
  assert.deepEqual([r.ok, r.revue.etat, r.revue.login, r.auteurPr, r.memeAuteurQueLaPr], [true, "APPROVED", "tiers", "PASSIO74", false]);
  // REPRODUCTION ASTRA-61 : une revue COMMENTED — y compris un REFUS qui porte tous les marqueurs — passait. Désormais : refus.
  const refusCommente = { ...revue, state: "COMMENTED", body: "REFUS — ne pas appliquer. " + corps };
  assert.throws(() => BAR.verifierPreuveRevue({ ...base, revues: [refusCommente] }), /seule une APPROBATION \(APPROVED\) vaut preuve/);
  assert.throws(() => BAR.verifierPreuveRevue({ ...base, revues: [{ ...revue, state: "COMMENTED" }] }), /un commentaire, même conforme, n'approuve rien/);
  assert.throws(() => BAR.verifierPreuveRevue({ ...base, revues: [{ ...revue, state: "CHANGES_REQUESTED" }] }), /APPROVED/);
  assert.throws(() => BAR.verifierPreuveRevue({ ...base, revues: [{ ...revue, state: "DISMISSED" }] }), /APPROVED/);
  // Auto-revue : l'auteur de la PR approuve lui-même (même si l'API le rendait) → refus.
  assert.throws(() => BAR.verifierPreuveRevue({ ...base, attestation: { ...att, relecteur: "PASSIO74" }, revues: [{ ...revue, user: { login: "PASSIO74" } }], relecteursAutorises: ["PASSIO74", "tiers"] }), /auto-revue|AUTEUR de la PR/);
  // Auteur de la PR inconnu → l'indépendance n'est pas vérifiable → refus.
  assert.throws(() => BAR.verifierPreuveRevue({ ...base, auteurPr: null }), /indépendance du relecteur est NON VÉRIFIABLE/);
  // Relecteur hors liste, ou liste absente/vide → refus.
  assert.throws(() => BAR.verifierPreuveRevue({ ...base, relecteursAutorises: ["autre"] }), /n'est pas dans la liste des relecteurs autorisés/);
  assert.throws(() => BAR.verifierPreuveRevue({ ...base, relecteursAutorises: [] }), /personne n'est autorisé/);
  assert.throws(() => BAR.verifierPreuveRevue({ ...base, relecteursAutorises: null }), /personne n'est autorisé/);
  // Liens au SHA, au contenu, à la cible, au fichier : inchangés.
  assert.throws(() => BAR.verifierPreuveRevue({ ...base, revues: [{ ...revue, commit_id: "f".repeat(40) }] }), /ancrée sur ffffffffffff/);
  assert.throws(() => BAR.verifierPreuveRevue({ ...base, contenuAuCommit: sql + "x" }), /a regardé un autre contenu/);
  assert.throws(() => BAR.verifierPreuveRevue({ ...base, empreinteAttendue: BAR.empreinte(sql + "x") }), /n'est pas celui du commit revu/);
  assert.throws(() => BAR.verifierPreuveRevue({ ...base, revues: [{ ...revue, body: MARQUEUR + " migrations/m.sql cible: zzzzzzzzzzzzzzzzzzzz" }] }), /ne nomme pas la cible/);
  assert.throws(() => BAR.verifierPreuveRevue({ ...base, revues: [{ ...revue, body: "LGTM migrations/m.sql cible: " + PROD }] }), /marqueur/);
  assert.throws(() => BAR.verifierPreuveRevue({ ...base, revues: null }), /NON VÉRIFIABLE/);
  // Le fournisseur : réel sans override, fictif avec ; refusé sur cible protégée seulement.
  assert.throws(() => BAR.exigerFournisseurReel({ reel: false, motifs: ["PASSIO_GH_BIN=x"] }, BAR.choisirCible({ argProjet: PROD })), /fournisseur FICTIF/);
  assert.doesNotThrow(() => BAR.exigerFournisseurReel({ reel: false, motifs: ["PASSIO_GH_BIN=x"] }, BAR.choisirCible({ argProjet: "abcdefghijabcdefghij" })));
  assert.doesNotThrow(() => BAR.exigerFournisseurReel({ reel: true, motifs: [] }, BAR.choisirCible({ argProjet: PROD })));
});
