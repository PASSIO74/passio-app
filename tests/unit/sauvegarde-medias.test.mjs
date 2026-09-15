// ═══════════════════════════════════════════════════════════════════════════
// LA SAUVEGARDE DES MÉDIAS, AU VRAI POINT D'APPEL (ASTRA-45 / ASTRA-55,
// cinquième contre-revue Astra, 15/09/2026).
//
// On exerce la VRAIE `exporterMedias` de scripts/sauvegarde-donnees.js avec un
// faux `fetch` qui joue le Storage (seaux, listing, GET) et PostgREST pour la
// RPC des propriétaires — AVEC un plafond `max-rows` de 1 000, comme la
// reproduction d'Astra. Le faux rend des pages ; il ne décide de rien.
// ═══════════════════════════════════════════════════════════════════════════
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { exporterMedias, PAGE_PROPRIETAIRES } = require("../../scripts/sauvegarde-donnees.js")._internes;

const URL = "https://zzzzzzzzzzzzzzzzzzzz.supabase.co";
const OWNER = "11111111-1111-4111-8111-111111111111";

/** Un Storage de `n` objets dans `content/photos/u/`, et PostgREST avec un plafond de lignes par réponse. */
function storage(n, { plafond = 1000, rpcAbsente = false, sansProprietaire = [] } = {}) {
  const objets = Array.from({ length: n }, (_, i) => ({ name: String(i).padStart(4, "0") + ".jpg", id: "id" + i, contenu: "octets-" + i }));
  const json = (c, status = 200) => new Response(JSON.stringify(c), { status, headers: { "Content-Type": "application/json" } });
  const journal = [];
  const fetchFaux = async (url, init = {}) => {
    const u = String(url); const m = (init.method || "GET").toUpperCase();
    if (u === URL + "/storage/v1/bucket") return json([{ name: "content" }]);
    if (u === URL + "/storage/v1/object/list/content") {
      const b = JSON.parse(init.body);
      if (b.prefix === "") return json([{ name: "photos" }]);              // un dossier : pas d'`id`
      if (b.prefix === "photos") return json([{ name: "u" }]);
      if (b.prefix === "photos/u") return json(objets.slice(b.offset, b.offset + b.limit).map((o) => ({ name: o.name, id: o.id })));
      return json([]);
    }
    if (u.startsWith(URL + "/storage/v1/object/content/")) {
      const nom = decodeURI(u.slice((URL + "/storage/v1/object/content/photos/u/").length));
      const o = objets.find((x) => x.name === nom); return new Response(o ? o.contenu : "", { status: o ? 200 : 404 });
    }
    if (u === URL + "/rest/v1/rpc/proprietaires_objets_stockage") {
      journal.push({ range: init.headers && init.headers.Range });
      if (rpcAbsente) return json({ code: "PGRST202", message: "Could not find the function" }, 404);
      const tous = objets.map((o) => ({ bucket_id: "content", name: "photos/u/" + o.name, owner: sansProprietaire.includes(o.name) ? null : OWNER, owner_id: sansProprietaire.includes(o.name) ? null : OWNER }));
      // PostgREST : `Range: a-b` → lignes a..b, bornées par max-rows ; sans Range → max-rows premières lignes.
      const r = /^(\d+)-(\d+)$/.exec((init.headers && init.headers.Range) || "");
      const debut = r ? Number(r[1]) : 0;
      const fin = r ? Math.min(Number(r[2]), debut + plafond - 1) : plafond - 1;
      const page = tous.slice(debut, fin + 1);
      // 206 tant qu'il reste des lignes AU-DELÀ de la plage rendue, 200 sur la dernière.
      return json(page, r && debut + page.length < tous.length ? 206 : 200);
    }
    throw new Error("URL non routée : " + m + " " + u);
  };
  return { fetch: fetchFaux, journal, objets };
}
async function avec(st, fn) { const vrai = globalThis.fetch; globalThis.fetch = st.fetch; try { return await fn(); } finally { globalThis.fetch = vrai; } }
const dossier = () => fs.mkdtempSync(path.join(os.tmpdir(), "passio-sauv-"));

test("ASTRA-45 ⑤ REPRODUCTION : 1 001 fichiers, plafond 1 000, un seul appel (avant) → 1 000 propriétaires, zéro erreur, dernier objet orphelin ; désormais PAGINÉ et COMPLET", async () => {
  const st = storage(1001, { plafond: 1000 });
  const d = dossier();
  const m = await avec(st, () => exporterMedias({ url: URL, cle: "k" }, d, []));
  assert.equal(m.fichiers, 1001);
  assert.equal(m.proprietairesLus, 1001, "tous les propriétaires sont lus, par pages");
  assert.ok(st.journal.length >= 2 && st.journal.every((j) => /^\d+-\d+$/.test(j.range)), "la RPC est appelée par Range, plusieurs fois : " + JSON.stringify(st.journal));
  assert.equal(m.couverture.indisponible, false);
  assert.deepEqual(m.couverture.nonReleves, [], "aucun objet archivé non relevé");
  assert.equal(m.couverture.explicites, 1001);
  // L'index porte chaque fichier avec sa taille et son empreinte (ASTRA-55).
  assert.equal(Object.keys(m.index).length, 1001);
  const idx = m.index["content/photos/u/0000.jpg"];
  assert.deepEqual(idx, { taille: Buffer.byteLength("octets-0"), md5: createHash("md5").update("octets-0").digest("hex") });
  assert.equal(fs.readFileSync(path.join(d, "_storage", "content", "photos", "u", "0000.jpg"), "utf8"), "octets-0");
});

test("ASTRA-45 ⑥ quel que soit le plafond configuré (ici 100), la pagination le franchit", async () => {
  const st = storage(350, { plafond: 100 });
  const m = await avec(st, () => exporterMedias({ url: URL, cle: "k" }, dossier(), []));
  assert.equal(m.proprietairesLus, 350);
  assert.deepEqual(m.couverture.nonReleves, []);
  assert.ok(st.journal.length >= 4, "au moins quatre pages de 100 sous un plafond de 100 (la page demandée en fait " + PAGE_PROPRIETAIRES + ")");
});

test("ASTRA-45 ⑦ trois états : propriétaire explicite, propriétaire NUL en base, inventaire INDISPONIBLE — jamais confondus", async () => {
  const st = storage(3, { sansProprietaire: ["0001.jpg"] });
  const m = await avec(st, () => exporterMedias({ url: URL, cle: "k" }, dossier(), []));
  assert.deepEqual([m.couverture.explicites, m.couverture.nuls, m.couverture.nonReleves.length], [2, 1, 0]);
  assert.deepEqual(m.proprietaires["content/photos/u/0001.jpg"], { owner: null, owner_id: null }, "nul EXPLICITE : l'objet est relevé, sans propriétaire");
  const journal = [];
  const abs = await avec(storage(2, { rpcAbsente: true }), () => exporterMedias({ url: URL, cle: "k" }, dossier(), journal));
  assert.equal(abs.proprietairesLus, null, "indisponible = null, pas 0");
  assert.equal(abs.couverture.indisponible, true);
  assert.equal(abs.couverture.nonReleves.length, 2, "tout objet archivé est non relevé quand l'inventaire est indisponible");
  assert.ok(journal.some((j) => j.etape === "proprietaires"), "et c'est journalisé");
});
