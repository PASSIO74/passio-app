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
const { lots, litteral, ordreInsert, ordreLigneALigne, PROD_REF, LOT_OCTETS } = require("../../scripts/restaurer-donnees.js");

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
