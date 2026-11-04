// Verrous du chemin de restauration (EXP-01, 2026-09-14) — les parties PURES
// de scripts/restaurer-donnees.js : le découpage en lots, la mise en chaîne
// SQL, la liste de colonnes explicite. Le reste (API de gestion, Storage,
// comptes) s'éprouve sur le projet de staging, pas ici.
import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const R = require("../../scripts/restaurer-donnees.js");
const { lots, litteral, ordreInsert, ordreLigneALigne, PROD_REF, LOT_OCTETS } = R;

const dossier = mkdtempSync(join(tmpdir(), "passio-restaure-"));
const fichier = (nom, contenu) => { const f = join(dossier, nom); writeFileSync(f, contenu); return f; };

test("① un lot ne coupe JAMAIS une ligne, et reste sous le plafond quand les lignes le permettent", () => {
  const ligne = JSON.stringify({ id: "x", blob: "a".repeat(200 * 1024) });
  const f = fichier("t.ndjson", [ligne, ligne, ligne, ligne, ligne].join("\n") + "\n");
  const r = lots(f);
  assert.equal(r.lignes, 5);
  for (const paquet of r.lots) {
    for (const l of paquet) assert.doesNotThrow(() => JSON.parse(l), "une ligne coupée ne se parse plus");
    assert.ok(paquet.join(",").length <= LOT_OCTETS + ligne.length, "un lot dépasse le plafond de plus d'une ligne");
  }
  assert.equal(r.lots.flat().length, 5, "aucune ligne perdue au découpage");
  assert.ok(r.lots.length >= 2, "cinq lignes de 200 Ko tiennent en au moins deux lots de 700 Ko");
});

test("① bis une ligne plus grosse que le plafond fait un lot À ELLE SEULE (c'est elle que PostgREST reprend)", () => {
  const grosse = JSON.stringify({ id: "g", blob: "b".repeat(LOT_OCTETS + 10) });
  const petite = JSON.stringify({ id: "p" });
  const f = fichier("g.ndjson", [petite, grosse, petite].join("\n") + "\n");
  const r = lots(f);
  const seule = r.lots.find((p) => p.length === 1 && p[0] === grosse);
  assert.ok(seule, "la grosse ligne doit être isolée dans son lot");
});

test("① ter fichier vide ou absent = zéro ligne, zéro lot, pas d'exception", () => {
  assert.deepEqual(lots(fichier("v.ndjson", "")), { lignes: 0, lots: [] });
  assert.deepEqual(lots(join(dossier, "absent.ndjson")), { lignes: 0, lots: [] });
});

test("② le dollar-quoting choisit une étiquette que le contenu ne porte pas", () => {
  assert.equal(litteral("abc"), "$r$abc$r$");
  const piege = "x $r$ y";
  const q = litteral(piege);
  assert.ok(q.startsWith("$r") && q.endsWith("$"), q);
  const tag = q.slice(0, q.indexOf("$", 1) + 1);
  assert.notEqual(tag, "$r$", "l'étiquette par défaut est présente dans le contenu : il en faut une autre");
  assert.equal(q, `${tag}${piege}${tag}`);
});

test("③ l'INSERT ne nomme QUE les colonnes reçues — les autres prennent leur DEFAULT (follows.created_at, reports.status)", () => {
  const sql = ordreInsert("follows", ["follower_id", "following_id"], "[]");
  // `overriding system value` (2026-09-15) : une colonne d'identité GENERATED ALWAYS
  // refuse toute valeur explicite — le journal des migrations tombait entier.
  assert.match(sql, /insert into public\."follows" \("follower_id", "following_id"\) overriding system value select "follower_id", "following_id" from json_populate_recordset/);
  assert.doesNotMatch(sql, /created_at/, "une colonne absente de l'archive ne doit pas être nommée (elle serait posée à NULL)");
  assert.match(sql, /on conflict do nothing/);
  assert.match(sql, /disable trigger user[\s\S]*enable trigger user/, "triggers utilisateur coupés puis rendus");
  assert.doesNotMatch(sql, /disable trigger all/i, "les contraintes (FK, CHECK) restent actives : jamais TRIGGER ALL");
});

test("③ bis le rejeu ligne à ligne isole chaque refus DANS la base, en un seul aller-retour", () => {
  const sql = ordreLigneALigne("event_attendees", ["event_id", "user_id"], "[{\"event_id\":\"e1\"}]");
  assert.match(sql, /json_array_elements/);
  assert.match(sql, /exception when others then insert into _refus/);
  assert.match(sql, /select motif, count\(\*\)::int n from _refus/);
  assert.match(sql, /enable trigger user/);
});

test("④ la production est nommée en dur comme cible INTERDITE", () => {
  assert.equal(PROD_REF, "njkiyoklssvefstljemx");
});

// ── ASTRA-16 (contre-revue Astra, 2026-09-15) : « mêmes quantités » ≠ « mêmes
// données ». Le verdict comparait des COMPTEURS : huit autres comptes, un
// contenu différent, un objet vide de même nom passaient. Les comparaisons
// sont pures ; le verdict les appelle sur les lignes relues par PostgREST.
const { canoniser, comparerLignes, comparerMedias } = R;

test("④ ASTRA-16 (RÉINJECTION) : même nombre de lignes, contenu différent → divergente, jamais OK", () => {
  const archive = [{ id: "a", nom: "Alice", prefs: { b: 1, a: 2 } }, { id: "b", nom: "Bob", prefs: null }];
  const cible   = [{ id: "a", nom: "Alice", prefs: { a: 2, b: 1 } }, { id: "b", nom: "Bobby", prefs: null }];
  // Sur le code d'avant : 2 = 2, « restauration prouvée ».
  const d = comparerLignes(archive, cible, "id");
  assert.deepEqual(d, { manquantes: [], divergentes: ["b"], enTrop: [] });
  // Ordre des clés indifférent, ordre des lignes indifférent, clé composite.
  assert.deepEqual(comparerLignes([{ x: 1, y: 2, v: "u" }, { x: 1, y: 3, v: "w" }], [{ y: 3, x: 1, v: "w" }, { v: "u", y: 2, x: 1 }], "x,y"), { manquantes: [], divergentes: [], enTrop: [] });
  assert.deepEqual(canoniser({ b: [{ z: 1, a: 2 }], a: 1 }), { a: 1, b: [{ a: 2, z: 1 }] });
});

test("④ bis huit autres identités : manquantes ET en trop, jamais un échange pour un autre", () => {
  const archive = [{ id: "u1", e: "a@x" }, { id: "u2", e: "b@x" }];
  const cible   = [{ id: "u9", e: "a@x" }, { id: "u8", e: "b@x" }];
  assert.deepEqual(comparerLignes(archive, cible, "id"), { manquantes: ["u1", "u2"], divergentes: [], enTrop: ["u9", "u8"] });
  // `on conflict do nothing` garde une ligne existante différente : divergente.
  assert.deepEqual(comparerLignes([{ id: 1, v: "archive" }], [{ id: 1, v: "déjà là" }], "id").divergentes, ["1"]);
});

test("④ ter médias : nom, taille et empreinte — un objet vide de même nom est divergent", () => {
  const fichiers = [{ name: "content/photos/u/a.jpg", taille: 3, md5: "900150983cd24fb0d6963f7d28e17f72" }, { name: "attachments/c/v.webm", taille: 10, md5: "x" }];
  const objets = [{ name: "content/photos/u/a.jpg", taille: "0", etag: '"d41d8cd98f00b204e9800998ecf8427e"' }, { name: "attachments/c/v.webm", taille: "10", etag: '"x"' }, { name: "content/inconnu.jpg", taille: "1", etag: null }];
  const d = comparerMedias(fichiers, objets);
  assert.deepEqual(d.divergents, ["content/photos/u/a.jpg"]);
  assert.deepEqual(d.manquants, []);
  assert.deepEqual(d.enTrop, ["content/inconnu.jpg"]);
  // ⚠️ ASTRA-32/29 (contre-revue du 15/09) — CETTE LIGNE ENCODAIT LE DÉFAUT.
  // Elle disait « sans eTag, la taille tranche SEULE » et exigeait
  // `divergents: []`. Or une taille identique ne prouve rien sur le contenu :
  // deux fichiers de 5 octets peuvent différer. Ce n'est ni conforme ni
  // divergent — c'est NON VÉRIFIÉ, et ça doit bloquer le verdict. Le cas est
  // réécrit : on ne réduit pas une propriété attendue, on retire une attente
  // qui affirmait plus que la mesure ne permettait.
  const sansEtag = comparerMedias([{ name: "a", taille: 5, md5: "z" }, { name: "b", taille: 1, md5: "q" }], [{ name: "a", taille: "5", etag: null }]);
  assert.deepEqual(sansEtag.manquants, ["b"], "un nom absent reste manquant");
  assert.deepEqual(sansEtag.divergents, [], "sans empreinte comparable, on ne peut pas conclure à la divergence");
  assert.equal(sansEtag.nonVerifies.length, 1, "…mais « a » n'est PAS vérifié, et le verdict doit le dire");
  assert.match(sansEtag.nonVerifies[0].raison, /aucun eTag sur la cible/);
});

test("④ quater une colonne née après l'archive n'est pas une divergence ; une colonne de l'archive absente de la cible, si", () => {
  assert.deepEqual(comparerLignes([{ id: 1, label: "Ski" }], [{ id: 1, label: "Ski", recherche: "ski" }], "id"), { manquantes: [], divergentes: [], enTrop: [] });
  assert.deepEqual(comparerLignes([{ id: 1, label: "Ski", aliases: ["ski"] }], [{ id: 1, label: "Ski" }], "id").divergentes, ["1"]);
});

test("④ quinquies médias multipart : un eTag « <hex>-<n> » n'est pas un MD5 — même taille = identique, taille différente = divergent (exercice du 2026-09-15 : deux vidéos identiques dites divergentes)", () => {
  const fichiers = [{ name: "content/videos/u/reel_a.mp4", taille: 20362027, md5: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, { name: "content/videos/u/reel_b.mp4", taille: 25489650, md5: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }];
  const memes = [{ name: "content/videos/u/reel_a.mp4", taille: "20362027", etag: '"0401bff7b39f376a87aca51f96e0f17e-2"' }, { name: "content/videos/u/reel_b.mp4", taille: "25489650", etag: '"8e971866949fa0acf292eacc489fc72f-2"' }];
  const surMemes = comparerMedias(fichiers, memes);
  assert.deepEqual(surMemes.divergents, [], "un eTag multipart ne peut pas prouver une divergence");
  // ⚠️ ASTRA-29 : …et il ne prouve pas l'identité non plus. Deux vidéos de même
  // taille et de contenu différent passaient ici pour conformes.
  assert.equal(surMemes.nonVerifies.length, 2, "les deux sont NON VÉRIFIÉES tant qu'on ne les a pas hachées");
  // Avec l'empreinte de secours (GET + hash), la comparaison redevient réelle.
  const hachees = comparerMedias(fichiers, memes, { hashes: { "content/videos/u/reel_a.mp4": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "content/videos/u/reel_b.mp4": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } });
  assert.deepEqual([hachees.divergents, hachees.nonVerifies], [[], []]);
  const tronque = [{ ...memes[0], taille: "1024" }, memes[1]];
  assert.deepEqual(comparerMedias(fichiers, tronque).divergents, ["content/videos/u/reel_a.mp4"]);
  // Un eTag simple (pas de « -n ») reste un MD5 et se compare.
  assert.deepEqual(comparerMedias([{ name: "x", taille: 3, md5: "900150983cd24fb0d6963f7d28e17f72" }], [{ name: "x", taille: "3", etag: '"d41d8cd98f00b204e9800998ecf8427e"' }]).divergents, ["x"]);
});

// ─────────────────────────────────────────────────────────────────────────
// ⑤ R25 (2026-11-04) — UN NOMBRE DE L'ARCHIVE EST CELUI DE LA BASE, AU CHIFFRE
// PRÈS. `r.json()` puis `JSON.stringify` arrondissait tout entier au-delà de
// 2^53 : 2906581903110193585 et 2906581903110193586 s'écrivaient tous deux
// 2906581903110193700. Deux lignes distinctes se confondaient alors sur une
// clé unique (`<table>_rid_key`), et `on conflict do nothing` en jetait une à
// la restauration. La vérification, qui arrondissait les deux côtés pareil,
// disait « conforme ». Lecture exacte : scripts/lib/json-exact.js.
// ─────────────────────────────────────────────────────────────────────────
const JE = require("../../scripts/lib/json-exact.js");
const { _internes: SAUV } = require("../../scripts/sauvegarde-donnees.js");
const GRAND_A = "2906581903110193585", GRAND_B = "2906581903110193586";

test("⑤ la sauvegarde écrit les chiffres EXACTS d'un entier au-delà de 2^53 — deux valeurs voisines restent deux (RÉINJECTION : r.json() les confond)", async () => {
  assert.equal(JSON.parse(GRAND_A), JSON.parse(GRAND_B), "prémisse : JSON.parse confond les deux valeurs");
  const page = `[{"id":"a","rid":${GRAND_A},"prix":10.00},{"id":"b","rid":${GRAND_B},"prix":1.5}]`;
  const ecrit = [];
  const vrai = globalThis.fetch;
  globalThis.fetch = async () => new Response(page, { status: 200 });
  try {
    const n = await SAUV.exporter({ url: "https://exemple.invalid", cle: "k" }, "post_likes", "id", { write: (x) => ecrit.push(x) });
    assert.equal(n, 2);
  } finally { globalThis.fetch = vrai; }
  assert.deepEqual(ecrit, [`{"id":"a","rid":${GRAND_A},"prix":10}\n`, `{"id":"b","rid":${GRAND_B},"prix":1.5}\n`],
    "les rid gardent leurs chiffres ; un nombre que JavaScript lit sans perte reste un nombre ordinaire");
});

test("⑤ bis la vérification compare au chiffre près : un rid faux est DIVERGENT, un rid juste est conforme (RÉINJECTION : JSON.parse dit « conforme »)", () => {
  const archive = [JE.lireJsonExact(`{"id":"a","rid":${GRAND_A}}`)];
  const fausse = [JE.lireJsonExact(`{"id":"a","rid":${GRAND_B}}`)];
  const juste = [JE.lireJsonExact(`{"id":"a","rid":${GRAND_A}}`)];
  assert.deepEqual(comparerLignes(archive, fausse, "id").divergentes, ["a"]);
  assert.deepEqual(comparerLignes(archive, juste, "id"), { manquantes: [], divergentes: [], enTrop: [] });
  // La même comparaison sur une lecture ordinaire ne voit rien : c'est le défaut corrigé.
  assert.deepEqual(comparerLignes([JSON.parse(`{"id":"a","rid":${GRAND_A}}`)], [JSON.parse(`{"id":"a","rid":${GRAND_B}}`)], "id").divergentes, []);
  // Un grand entier en CLÉ de tri : deux valeurs voisines font deux clés.
  const parRid = comparerLignes([JE.lireJsonExact(`{"rid":${GRAND_A}}`)], [JE.lireJsonExact(`{"rid":${GRAND_B}}`)], "rid");
  assert.deepEqual([parRid.manquantes, parRid.enTrop], [[GRAND_A], [GRAND_B]]);
});

test("⑤ ter rien ne change pour ce que JavaScript lit sans perte — une archive d'avant le correctif se vérifie toujours", () => {
  const v = JE.lireJsonExact("[10.00, 1e-07, 0.1, 12, -3.5, 1e+20, 9007199254740991, 2906581903110193700]");
  assert.ok(v.every((x) => typeof x === "number"), "aucun de ces nombres ne perd sa valeur : tous restent des nombres");
  // Une archive ancienne porte la valeur DÉJÀ arrondie ; la cible restaurée
  // depuis elle porte les mêmes chiffres : conforme, comme avant.
  const ancienne = [JSON.parse('{"id":"a","rid":2906581903110193700,"prix":10}')];
  const cible = [JE.lireJsonExact('{"id":"a","rid":2906581903110193700,"prix":10.00}')];
  assert.deepEqual(comparerLignes(ancienne, cible, "id").divergentes, []);
  // Un numeric à 20 chiffres significatifs, lui, se garde tel quel.
  assert.equal(JSON.stringify(JE.lireJsonExact('{"n":1.2345678901234567890}')), '{"n":1.2345678901234567890}');
  assert.equal(JE.canonique("10.00"), JE.canonique("10"));
  assert.equal(JE.canonique("1e-07"), JE.canonique("0.0000001"));
  assert.notEqual(JE.canonique(GRAND_A), JE.canonique(String(JSON.parse(GRAND_A))));
});

test("⑤ quater sans JSON.rawJSON (Node < 21), un entier au-delà de 2^53 fait ÉCHOUER la lecture — jamais un arrondi silencieux", () => {
  const vrai = JSON.rawJSON;
  JSON.rawJSON = undefined;
  try {
    assert.throws(() => JE.lireJsonExact(`[${GRAND_A}]`), /2\^53/);
    assert.deepEqual(JE.lireJsonExact("[12, 1.5]"), [12, 1.5], "ce qui se lit sans perte passe toujours");
  } finally { JSON.rawJSON = vrai; }
});

test("⑤ quinquies la relecture de la cible et la lecture de l'archive sont exactes toutes les deux", async () => {
  const { lireNdjson, lignesCible } = R._phases;
  const f = fichier("post_likes.ndjson", `{"id":"a","rid":${GRAND_A}}\n{"id":"b","rid":${GRAND_B}}\n`);
  assert.deepEqual(lireNdjson(f).map((l) => JE.texteValeur(l.rid)), [GRAND_A, GRAND_B]);
  const vrai = globalThis.fetch;
  globalThis.fetch = async () => new Response(`[{"id":"a","rid":${GRAND_A}},{"id":"b","rid":${GRAND_B}}]`, { status: 200 });
  try {
    const l = await lignesCible({ url: "https://exemple.invalid", cle: "k" }, "post_likes", "id");
    assert.deepEqual(l.map((x) => JE.texteValeur(x.rid)), [GRAND_A, GRAND_B]);
  } finally { globalThis.fetch = vrai; }
});
