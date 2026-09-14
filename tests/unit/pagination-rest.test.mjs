// ASTRA-03 — la lecture paginée qui remplace `limit=500` + filtre en mémoire
// (scripts/lib/pagination-rest.js, utilisée par scripts/moderation.js).
//   ① une page pleine appelle la suivante ; une page courte arrête, `complet`
//   ② 1 201 lignes = 3 pages, toutes rendues, dans l'ordre
//   ③ la borne de pages arrête une lecture sans fin et le DIT (`complet: false`)
//   ④ une page vide dès le départ : zéro ligne, complet, un seul appel
//   ⑤ l'offset demandé progresse de `taille` en `taille`
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { lireToutesLesPages } = require("../../scripts/lib/pagination-rest.js");

function source(n) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
  const appels = [];
  return { appels, lirePage: async (offset, taille) => { appels.push([offset, taille]); return rows.slice(offset, offset + taille); } };
}

test("① page pleine → suivante ; page courte → stop, complet", async () => {
  const s = source(700);
  const r = await lireToutesLesPages(s.lirePage, { taille: 500 });
  assert.equal(r.lignes.length, 700);
  assert.equal(r.complet, true);
  assert.equal(r.pages, 2);
});

test("② 1 201 lignes = 3 pages, toutes rendues, dans l'ordre", async () => {
  const s = source(1201);
  const r = await lireToutesLesPages(s.lirePage, { taille: 500 });
  assert.equal(r.lignes.length, 1201);
  assert.equal(r.lignes[1200].id, 1200);
  assert.deepEqual(s.appels, [[0, 500], [500, 500], [1000, 500]]);
});

test("③ la borne de pages arrête et le dit", async () => {
  const s = source(100000);
  const r = await lireToutesLesPages(s.lirePage, { taille: 500, pagesMax: 3 });
  assert.equal(r.lignes.length, 1500);
  assert.equal(r.complet, false, "une lecture bornée n'est pas une lecture entière");
});

test("④ vide dès le départ", async () => {
  const s = source(0);
  const r = await lireToutesLesPages(s.lirePage, { taille: 500 });
  assert.deepEqual(r, { lignes: [], complet: true, pages: 1 });
});

test("⑤ exactement une page pleine : une seconde lecture vide confirme la fin", async () => {
  const s = source(500);
  const r = await lireToutesLesPages(s.lirePage, { taille: 500 });
  assert.equal(r.lignes.length, 500);
  assert.equal(r.complet, true);
  assert.deepEqual(s.appels, [[0, 500], [500, 500]]);
});
