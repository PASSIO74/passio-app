// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-29 / 30 / 31 / 32 — quatre verdicts qui disaient oui sans savoir.
//
// Chaque cas REPRODUIT d'abord le comportement d'AVANT (réécrit en une ou deux
// lignes, tel qu'il était au SHA examiné) et EXIGE que la décision corrigée en
// diverge. Un test qui ne mesurerait que le nouveau code resterait vert le jour
// où on le retirerait.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const V = require("../../scripts/lib/reprise-verdicts.js");

// ── ASTRA-31 ──────────────────────────────────────────────────────────────
test("ASTRA-31 ① un 503 d'Auth était lu comme « zéro compte »", () => {
  const reponse = { ok: false, status: 503, corps: { message: "service unavailable" } };
  // AVANT : `const d = await r.json(); const lot = d.users || [];`
  const avant = (reponse.corps.users) || [];
  assert.deepEqual(avant, [], "reproduction : l'ancien code voyait une liste vide");
  assert.throws(() => V.pageComptes(reponse, 1), /HTTP 503[\s\S]*INDÉTERMINÉ/, "un refus doit lever, jamais rendre zéro");
});

test("ASTRA-31 ② un corps JSON inattendu n'est pas une page vide", () => {
  for (const corps of [null, [], "erreur", { message: "Not Found" }, { users: null }, { users: "x" }]) {
    const rep = { ok: true, status: 200, corps };
    // AVANT : `const lot = d.users || []` — aucun contrôle. Le code ACCEPTAIT
    // tout : une liste vide pour un message d'erreur, et même une CHAÎNE pour
    // `{ users: "x" }`, qu'il aurait ensuite parcourue caractère par caractère.
    const avant = (corps && corps.users) || [];
    assert.doesNotThrow(() => avant, "reproduction : l'ancien code ne se plaignait de rien");
    assert.ok(!Array.isArray(avant) || avant.length === 0, "reproduction : et n'avait aucun compte à supprimer");
    assert.throws(() => V.pageComptes(rep, 1), /corps inattendu|`users` absent/);
  }
  // Le chemin nominal passe, et une page vraiment vide est un fait légitime.
  assert.deepEqual(V.pageComptes({ ok: true, status: 200, corps: { users: [] } }, 1), { users: [] });
});

test("ASTRA-31 ③ une page PLEINE ne termine pas la pagination", () => {
  assert.equal(V.paginationTerminee(new Array(200).fill({}), 200), false);
  assert.equal(V.paginationTerminee(new Array(199).fill({}), 200), true);
});

// ── ASTRA-30 ──────────────────────────────────────────────────────────────
const MAINTENANT = new Date("2026-09-15T12:00:00Z");
test("ASTRA-30 ① la suspension d'un compte archivé ne partait pas dans le POST", () => {
  const u = { id: "u1", email: "a@b.c", banned_until: "2099-01-01T00:00:00Z" };
  // AVANT : le corps du POST admin ne portait que id/email/email_confirm/password/metadata.
  const corpsAvant = { id: u.id, email: u.email, email_confirm: true, password: "x", user_metadata: {}, app_metadata: {} };
  assert.equal("ban_duration" in corpsAvant, false, "reproduction : aucune suspension n'était transmise");
  const duree = V.dureeBanResiduelle(u, MAINTENANT);
  assert.match(duree, /^\d+h$/, "la durée résiduelle doit être exprimée en heures pour GoTrue");
  assert.ok(Number(duree.replace("h", "")) > 600000, "et couvrir la peine restante");
});

test("ASTRA-30 ② on restitue la durée RÉSIDUELLE, jamais la durée d'origine", () => {
  const dansDeuxHeures = new Date(MAINTENANT.getTime() + 2 * 3600000).toISOString();
  assert.equal(V.dureeBanResiduelle({ banned_until: dansDeuxHeures }, MAINTENANT), "2h");
  // Arrondi AU-DESSUS : jamais libérer plus tôt que la décision ne le prévoyait.
  const dansUneHeureEtDemie = new Date(MAINTENANT.getTime() + 1.5 * 3600000).toISOString();
  assert.equal(V.dureeBanResiduelle({ banned_until: dansUneHeureEtDemie }, MAINTENANT), "2h");
  // Peine déjà purgée : on ne réapplique rien.
  const hier = new Date(MAINTENANT.getTime() - 3600000).toISOString();
  assert.equal(V.dureeBanResiduelle({ banned_until: hier }, MAINTENANT), null);
  assert.equal(V.dureeBanResiduelle({}, MAINTENANT), null);
  assert.equal(V.dureeBanResiduelle({ banned_until: "pas une date" }, MAINTENANT), null);
});

test("ASTRA-30 ③ le verdict compare l'ÉTAT de suspension, pas seulement l'UUID", () => {
  const archive = { id: "u1", banned_until: "2099-01-01T00:00:00Z" };
  // AVANT : `ids.size === man.comptes && manquants.length === 0` — l'UUID existe, donc OK.
  const avantOk = new Set(["u1"]).has("u1");
  assert.equal(avantOk, true, "reproduction : l'UUID seul suffisait");
  const r = V.suspensionRestauree(archive, { id: "u1" }, MAINTENANT);
  assert.equal(r.ok, false);
  assert.match(r.motif, /N'EST PAS suspendu/);
  assert.equal(V.suspensionRestauree(archive, { id: "u1", banned_until: "2099-06-01T00:00:00Z" }, MAINTENANT).ok, true,
    "GoTrue recalcule la borne : on compare l'état, pas la milliseconde");
  // Une peine expirée dans l'archive ne doit pas être réappliquée.
  assert.equal(V.suspensionRestauree({ banned_until: "2020-01-01T00:00:00Z" }, {}, MAINTENANT).ok, true);
});

// ── ASTRA-29 ──────────────────────────────────────────────────────────────
const M = (name, taille, md5) => ({ name, taille, md5 });
test("ASTRA-29 ① même taille, contenu différent, eTag multipart : « divergents » restait VIDE", () => {
  const fichiers = [M("content/v.mp4", 20362027, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")];
  const objets = [{ name: "content/v.mp4", taille: 20362027, etag: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-4" }];
  const d = V.comparerMedias(fichiers, objets);
  assert.deepEqual(d.divergents, [], "l'eTag multipart n'est pas un MD5 : on ne peut pas conclure à la divergence");
  assert.equal(d.nonVerifies.length, 1, "…mais ce n'est pas « conforme » non plus : c'est NON VÉRIFIÉ");
  assert.match(d.nonVerifies[0].raison, /multipart/);
});

test("ASTRA-29 ② taille absente ET eTag absent : rien n'était comparé du tout", () => {
  const d = V.comparerMedias([M("a.bin", 10, "abc")], [{ name: "a.bin" }]);
  assert.deepEqual(d.divergents, []);
  assert.equal(d.nonVerifies.length, 1);
  assert.match(d.nonVerifies[0].raison, /ni taille ni empreinte/);
});

test("ASTRA-29 ③ une empreinte de secours (GET + hash) TRANCHE, y compris sur un multipart", () => {
  const fichiers = [M("content/v.mp4", 20362027, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")];
  const objets = [{ name: "content/v.mp4", taille: 20362027, etag: "bbbb-4" }];
  const identique = V.comparerMedias(fichiers, objets, { hashes: { "content/v.mp4": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" } });
  assert.deepEqual(identique.nonVerifies, [], "hachée, la comparaison est réelle");
  assert.deepEqual(identique.divergents, []);
  const differente = V.comparerMedias(fichiers, objets, { hashes: { "content/v.mp4": "cccccccccccccccccccccccccccccccc" } });
  assert.deepEqual(differente.divergents, ["content/v.mp4"], "et un contenu différent est DIVERGENT, pas non vérifié");
});

test("ASTRA-29 ④ les cas sains restent sains", () => {
  const d = V.comparerMedias([M("a.png", 10, "abc")], [{ name: "a.png", taille: 10, etag: '"ABC"' }]);
  assert.deepEqual([d.manquants, d.divergents, d.nonVerifies, d.enTrop], [[], [], [], []]);
  const taille = V.comparerMedias([M("a.png", 10, "abc")], [{ name: "a.png", taille: 11, etag: "abc" }]);
  assert.deepEqual(taille.divergents, ["a.png"], "une taille différente reste une divergence");
  const absent = V.comparerMedias([M("a.png", 10, "abc")], []);
  assert.deepEqual(absent.manquants, ["a.png"]);
  const enTrop = V.comparerMedias([], [{ name: "z.png" }]);
  assert.deepEqual(enTrop.enTrop, ["z.png"]);
});

test("ASTRA-29 ⑤ `prouvee` ne peut plus coexister avec un refus, une phase en échec ou un non-vérifié", () => {
  // AVANT : `preuve.prouvee = ecarts === 0` — rien d'autre n'entrait dedans.
  const avant = (ecarts) => ecarts === 0;
  assert.equal(avant(0), true, "reproduction : zéro écart suffisait, quels que soient les refus");
  assert.equal(V.verdictGlobalReprise({ ecarts: 0, refus: [], phases: {}, nonVerifies: 0 }).prouvee, true);
  assert.equal(V.verdictGlobalReprise({ ecarts: 0, refus: ["compte u1 : HTTP 500"], phases: {}, nonVerifies: 0 }).prouvee, false);
  assert.equal(V.verdictGlobalReprise({ ecarts: 0, refus: [], phases: { comptes: { ok: false, motif: "3 refus" } }, nonVerifies: 0 }).prouvee, false);
  assert.equal(V.verdictGlobalReprise({ ecarts: 0, refus: [], phases: { medias: { indetermine: true } }, nonVerifies: 0 }).prouvee, false);
  assert.equal(V.verdictGlobalReprise({ ecarts: 0, refus: [], phases: {}, nonVerifies: 2 }).prouvee, false);
  assert.equal(V.verdictGlobalReprise({ ecarts: 0, refus: [], phases: {}, nonVerifies: 0, limitesNonRestaurees: ["content 26 Mo"] }).prouvee, false);
  // Et le code de sortie SUIT le verdict.
  assert.equal(V.verdictGlobalReprise({ ecarts: 1, refus: [], phases: {}, nonVerifies: 0 }).code, 1);
  assert.equal(V.verdictGlobalReprise({ ecarts: 0, refus: [], phases: { t: { ok: true } }, nonVerifies: 0 }).code, 0);
});

// ── ASTRA-32 ──────────────────────────────────────────────────────────────
const DDL = "create table x();\n".repeat(25) + "create policy p on x;\n".repeat(25);
test("ASTRA-32 ① une archive sans schema.sql sortait « conforme »", () => {
  // AVANT : `if (!existsSync(schema)) console.log("⚠ …")` — aucun pb++, exit 0.
  let pbAvant = 0; if (!false) { /* avertissement seul */ }
  assert.equal(pbAvant, 0, "reproduction : l'absence de DDL ne comptait pas comme une anomalie");
  const n = V.natureArchive({ schemaPresent: false, comptesExportes: true, mediasExportes: true });
  assert.equal(n.complete, false);
  assert.equal(n.nature, "partielle");
  assert.equal(n.anomalies.length, 1);
  assert.match(n.anomalies[0], /PAS complète[\s\S]*--partielle/);
});

test("ASTRA-32 ② une archive complète est complète, et son DDL est éprouvé", () => {
  const n = V.natureArchive({ schemaPresent: true, schemaDdl: DDL, comptesExportes: true, mediasExportes: true });
  assert.equal(n.complete, true);
  assert.deepEqual(n.anomalies, []);
  const maigre = V.natureArchive({ schemaPresent: true, schemaDdl: "create table x();", comptesExportes: true, mediasExportes: true });
  assert.equal(maigre.complete, false);
  assert.match(maigre.anomalies[0], /ce n'est pas le DDL de PASSIO/);
});

test("ASTRA-32 ③ un DDL présent mais qui n'est pas CELUI de l'archive est pire qu'absent", () => {
  const n = V.natureArchive({ schemaPresent: true, schemaDdl: DDL, schemaEmpreinte: "aaaa", empreinteAttendue: "bbbb", comptesExportes: true, mediasExportes: true });
  assert.equal(n.complete, false);
  assert.match(n.anomalies[0], /empreinte aaaa ≠ bbbb/);
  // Empreinte absente du manifeste (archives d'avant) : note, pas anomalie.
  const ancienne = V.natureArchive({ schemaPresent: true, schemaDdl: DDL, comptesExportes: true, mediasExportes: true });
  assert.deepEqual(ancienne.anomalies, []);
});

test("ASTRA-32 ④ sans comptes ni médias : partielle, dit en clair, mais pas une anomalie", () => {
  const n = V.natureArchive({ schemaPresent: true, schemaDdl: DDL, comptesExportes: false, mediasExportes: false });
  assert.equal(n.complete, false);
  assert.deepEqual(n.anomalies, [], "l'absence VOULUE de comptes n'est pas un défaut de l'archive");
  assert.equal(n.notes.length, 2);
});
