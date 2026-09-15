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
  assert.match(sql, /insert into public\."follows" \("follower_id", "following_id"\) select "follower_id", "following_id" from json_populate_recordset/);
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
  // Sans eTag (dépôt multi-parts) : la taille tranche seule ; nom absent : manquant.
  assert.deepEqual(comparerMedias([{ name: "a", taille: 5, md5: "z" }, { name: "b", taille: 1, md5: "q" }], [{ name: "a", taille: "5", etag: null }]), { manquants: ["b"], divergents: [], enTrop: [] });
});

test("④ quater une colonne née après l'archive n'est pas une divergence ; une colonne de l'archive absente de la cible, si", () => {
  assert.deepEqual(comparerLignes([{ id: 1, label: "Ski" }], [{ id: 1, label: "Ski", recherche: "ski" }], "id"), { manquantes: [], divergentes: [], enTrop: [] });
  assert.deepEqual(comparerLignes([{ id: 1, label: "Ski", aliases: ["ski"] }], [{ id: 1, label: "Ski" }], "id").divergentes, ["1"]);
});
