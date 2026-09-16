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
const { exporterMedias, paginerProprietaires, PAGE_PROPRIETAIRES } = require("../../scripts/sauvegarde-donnees.js")._internes;

const URL = "https://zzzzzzzzzzzzzzzzzzzz.supabase.co";
const OWNER = "11111111-1111-4111-8111-111111111111";

/** Un Storage de `n` objets dans `content/photos/u/`, et PostgREST avec un plafond de lignes par réponse. */
function storage(n, { plafond = 1000, rpcAbsente = false, sansProprietaire = [], sansCompte = false, sansOrdre = false } = {}) {
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
    if (u.startsWith(URL + "/rest/v1/rpc/proprietaires_objets_stockage")) {
      const q = new URLSearchParams(u.split("?")[1] || "");
      const prefer = String((init.headers && init.headers.Prefer) || "");
      journal.push({ range: init.headers && init.headers.Range, limit: q.get("limit"), offset: q.get("offset"), order: q.get("order"), prefer });
      if (rpcAbsente) return json({ code: "PGRST202", message: "Could not find the function" }, 404);
      let tous = objets.map((o) => ({ bucket_id: "content", name: "photos/u/" + o.name, owner: sansProprietaire.includes(o.name) ? null : OWNER, owner_id: sansProprietaire.includes(o.name) ? null : OWNER }));
      // ⚠️ ASTRA-57 : PostgREST TEL QU'IL EST, pas tel qu'on l'imaginait.
      //   · `order=` : sans lui, l'ordre d'une RPC n'est pas garanti — le faux
      //     MÉLANGE les lignes à chaque appel (comme un plan d'exécution le peut) ;
      //   · `limit`/`offset` (paramètres) ou `Range` (en-tête) → la plage ;
      //   · `max-rows` PLAFONNE la page rendue, en silence ;
      //   · le statut est 206 SEULEMENT si le total est connu (`Prefer: count=exact`)
      //     et que la plage rendue est plus courte que lui ; sinon 200 — même
      //     quand il reste des lignes ;
      //   · `Content-Range: a-b/total` (ou `/*` sans compte, `*/total` page vide).
      if (!q.get("order") || sansOrdre) { for (let i = tous.length - 1; i > 0; i--) { const j = (i * 7919 + journal.length * 131) % (i + 1); [tous[i], tous[j]] = [tous[j], tous[i]]; } }
      else tous.sort((a, b) => (a.bucket_id + "/" + a.name).localeCompare(b.bucket_id + "/" + b.name));
      const rg = /^(\d+)-(\d+)$/.exec((init.headers && init.headers.Range) || "");
      const debut = q.has("offset") ? Number(q.get("offset")) : (rg ? Number(rg[1]) : 0);
      const demandees = q.has("limit") ? Number(q.get("limit")) : (rg ? Number(rg[2]) - Number(rg[1]) + 1 : Infinity);
      const page = tous.slice(debut, debut + Math.min(demandees, plafond));
      const compte = !sansCompte && /count=(exact|planned|estimated)/.test(prefer);
      const total = tous.length;
      const status = compte && page.length > 0 && page.length < total ? 206 : 200;
      const contentRange = page.length === 0 ? `*/${compte ? total : "*"}` : `${debut}-${debut + page.length - 1}/${compte ? total : "*"}`;
      return new Response(JSON.stringify(page), { status, headers: { "Content-Type": "application/json", "Content-Range": contentRange } });
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
  assert.ok(st.journal.length >= 2 && st.journal.every((j) => j.limit && j.offset !== null && j.order === "bucket_id.asc,name.asc" && /count=exact/.test(j.prefer)), "la RPC est appelée par limit/offset/order + count=exact, plusieurs fois : " + JSON.stringify(st.journal));
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

// ═══ ASTRA-57 (sixième contre-revue, 16/09) : la pagination telle que PostgREST la supporte ═══
test("ASTRA-57 ① REPRODUCTION (avant) : POST + Range, arrêt sur ≠ 206 — avec le statut réel de PostgREST (200 sans compte), UN appel, 1 000 sur 1 001", async () => {
  // Le protocole du 15/09, rejoué contre le faux fidèle : c'est ce qu'Astra a mesuré.
  const st = storage(1001, { plafond: 1000 });
  const lus = [];
  let appels = 0;
  for (let debut = 0; ; ) {
    const r = await st.fetch(URL + "/rest/v1/rpc/proprietaires_objets_stockage", { method: "POST", headers: { Range: `${debut}-${debut + 499}`, "Range-Unit": "items" }, body: "{}" });
    appels++;
    const lignes = JSON.parse(await r.text());
    lus.push(...lignes);
    if (lignes.length === 0 || r.status !== 206) break;
    debut += lignes.length;
  }
  assert.equal(appels, 1, "un seul appel : le 200 a terminé la boucle");
  assert.equal(lus.length, 500, "et l'inventaire est PARTIEL, sans erreur");
});

test("ASTRA-57 ② au-delà du plafond réel (2 501 objets, max-rows 1 000) : tout est lu, le total de Content-Range termine, aucune page en trop", async () => {
  const st = storage(2501, { plafond: 1000 });
  const m = await avec(st, () => exporterMedias({ url: URL, cle: "k" }, dossier(), []));
  assert.equal(m.proprietairesLus, 2501);
  assert.equal(m.couverture.explicites, 2501);
  assert.deepEqual(m.couverture.nonReleves, []);
  assert.equal(st.journal.length, 6, "6 pages de 500 (la dernière : 1 ligne), pas d'appel vide : le total termine");
  assert.deepEqual(st.journal.map((j) => Number(j.offset)), [0, 500, 1000, 1500, 2000, 2500], "on avance du nombre reçu");
});

test("ASTRA-57 ③ total INCONNU (le serveur ignore Prefer: count) : la page vide termine — un appel de plus, jamais un arrêt prématuré", async () => {
  const st = storage(1001, { plafond: 1000, sansCompte: true });
  const p = await avec(st, () => paginerProprietaires({ url: URL, cle: "k" }, st.fetch));
  assert.equal(p.total, null);
  assert.equal(p.lignes.length, 1001);
  assert.equal(p.appels, 4, "3 pages pleines/partielles + 1 page vide");
});

test("ASTRA-57 ④ max-rows plus petit que la page demandée (100 < 500) : on avance du nombre reçu, total vérifié", async () => {
  const st = storage(350, { plafond: 100 });
  const p = await avec(st, () => paginerProprietaires({ url: URL, cle: "k" }, st.fetch));
  assert.deepEqual([p.total, p.lignes.length, p.appels], [350, 350, 4]);
});

test("ASTRA-57 ⑤ NON-PROGRESSION : un serveur qui ignore l'ordre rend des doublons → ERREUR nommée, jamais un inventaire partiel silencieux", async () => {
  const st = storage(1200, { plafond: 1000, sansOrdre: true });
  await assert.rejects(avec(st, () => paginerProprietaires({ url: URL, cle: "k" }, st.fetch)), /non-progression|clé déjà vue/);
  // …et au point d'appel, l'archive se déclare PARTIELLE (inventaire indisponible), elle ne se tait pas.
  const journal = [];
  const m = await avec(storage(1200, { plafond: 1000, sansOrdre: true }), () => exporterMedias({ url: URL, cle: "k" }, dossier(), journal));
  assert.equal(m.proprietairesLus, null);
  assert.equal(m.couverture.indisponible, true);
  assert.ok(journal.some((j) => j.etape === "proprietaires" && /non-progression|déjà vue/.test(j.motif)));
});

test("ASTRA-57 ⑥ un total qui change pendant la lecture est une erreur (relancer), pas un inventaire approximatif", async () => {
  let n = 0;
  const st = storage(700, { plafond: 1000 });
  const fetchInstable = async (u, init) => { const r = await st.fetch(u, init); n++; if (n === 2) return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json", "Content-Range": "500-699/701" } }); return r; };
  await assert.rejects(paginerProprietaires({ url: URL, cle: "k" }, fetchInstable), /total a changé/);
});
