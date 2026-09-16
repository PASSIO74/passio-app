// ═══════════════════════════════════════════════════════════════════════════
// LES PHASES DE RESTAURATION, AUX VRAIS POINTS D'APPEL (cinquième contre-revue
// Astra, 15/09/2026 — ASTRA-45 / 46 / 47 / 48 / 55, et la mutation « ban non
// transmis » qu'aucune suite ne voyait).
//
// Ce qu'on exerce : les VRAIES fonctions `comptes`, `medias`, `verdict` et
// `integriteArchive` de scripts/restaurer-donnees.js, avec une VRAIE archive
// sur disque. Ce qu'on double : `fetch` — GoTrue (admin/users), le Storage
// (bucket, object) et l'API de gestion (`/database/query`, routée par le TEXTE
// de la requête SQL). Le faux tient un état (comptes, seaux, objets, limites)
// et rend ce que ces API rendent ; il ne refait aucun verdict.
// ═══════════════════════════════════════════════════════════════════════════
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const R = require("../../scripts/restaurer-donnees.js");
const { comptes, medias, verdict, integriteArchive } = R._phases;

const REF = "abcdefghijabcdefghij";
const URL_CIBLE = `https://${REF}.supabase.co`;
const md5 = (b) => createHash("md5").update(b).digest("hex");
const sha = (t) => createHash("sha256").update(t, "utf8").digest("hex");
const heures = (n) => new Date(Date.now() + n * 3600000).toISOString();

/** Une archive réelle sur disque : médias + index + inventaire + comptes, manifeste cohérent. */
function archive({ fichiers = { "content/photos/u/a.jpg": "AAA" }, inventaire, inventaireTexte, index = true, comptes = [], sansFichierSurDisque = [] } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "passio-reprise-"));
  const idx = {};
  for (const [k, contenu] of Object.entries(fichiers)) {
    idx[k] = { taille: Buffer.byteLength(contenu), md5: md5(contenu) };
    if (!sansFichierSurDisque.includes(k)) { const p = path.join(d, "_storage", ...k.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, contenu); }
  }
  const man = { genere_le: "2026-09-15T10:00:00Z", projet: "https://zzzzzzzzzzzzzzzzzzzz.supabase.co", tables: {}, ecarts: [], comptes: comptes.length, medias: { fichiers: Object.keys(fichiers).length, octets: 0, echecs: 0, proprietaires_lus: 0 } };
  if (index) { const t = JSON.stringify({ format: "passio-index-medias/1", total: Object.keys(idx).length, objets: idx }); fs.writeFileSync(path.join(d, "_storage_index.json"), t); man.medias.index_sha256 = sha(t); }
  const inv = inventaire === undefined ? Object.fromEntries(Object.keys(fichiers).map((k) => [k, { owner: "11111111-1111-4111-8111-111111111111", owner_id: "11111111-1111-4111-8111-111111111111" }])) : inventaire;
  if (inventaireTexte !== undefined) fs.writeFileSync(path.join(d, "_storage_proprietaires.json"), inventaireTexte);
  else if (inv !== null) { const t = JSON.stringify({ format: "passio-proprietaires/1", total: Object.keys(inv).length, objets: inv }); fs.writeFileSync(path.join(d, "_storage_proprietaires.json"), t); man.medias.proprietaires_sha256 = sha(t); man.medias.proprietaires_lus = Object.keys(inv).length; }
  fs.writeFileSync(path.join(d, "_auth_users.ndjson"), comptes.map((u) => JSON.stringify(u)).join("\n") + (comptes.length ? "\n" : ""));
  fs.writeFileSync(path.join(d, "manifeste.json"), JSON.stringify(man));
  return { dossier: d, man };
}

/** Le faux monde : GoTrue, Storage, API de gestion. */
function monde(opts = {}) {
  const etat = {
    users: new Map(Object.entries(opts.users || {})),          // id → { id, email, banned_until }
    buckets: new Map([["content", { id: "content", file_size_limit: 26000000 }]]),
    objets: new Map(Object.entries(opts.objets || {})),        // "seau/chemin" → { taille, etag, owner, owner_id }
    journal: [],
    refusUpload: new Set(opts.refusUpload || []),
    refusLimite: !!opts.refusLimite,
    refusPutBan: !!opts.refusPutBan,
  };
  const json = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });
  const texte = (t, status = 200) => new Response(t, { status });
  etat.fetch = async (url, init = {}) => {
    const u = String(url); const m = (init.method || "GET").toUpperCase();
    etat.journal.push(m + " " + u.replace(URL_CIBLE, "").replace("https://api.supabase.com/v1/projects/" + REF, "<gestion>"));
    // ── GoTrue ──
    if (u.startsWith(URL_CIBLE + "/auth/v1/admin/users")) {
      const reste = u.slice((URL_CIBLE + "/auth/v1/admin/users").length);
      if (m === "GET" && reste.startsWith("?")) { const page = Number(/page=(\d+)/.exec(reste)[1]); const pp = Number(/per_page=(\d+)/.exec(reste)[1]); const tous = [...etat.users.values()]; return json({ users: tous.slice((page - 1) * pp, page * pp) }); }
      if (m === "POST" && reste === "") {
        const b = JSON.parse(init.body);
        if (etat.users.has(b.id)) return texte("A user with this email address has already been registered", 422);
        const user = { id: b.id, email: b.email, banned_until: null };
        if (b.ban_duration && b.ban_duration !== "none") user.banned_until = heures(Number(String(b.ban_duration).replace("h", "")));
        etat.users.set(b.id, user); return json(user);
      }
      const id = reste.slice(1);
      if (m === "GET") return etat.users.has(id) ? json(etat.users.get(id)) : json({ message: "not found" }, 404);
      if (m === "PUT") { if (etat.refusPutBan) return json({ message: "refus" }, 500); const b = JSON.parse(init.body); const user = etat.users.get(id); if (b.ban_duration) user.banned_until = b.ban_duration === "none" ? null : heures(Number(String(b.ban_duration).replace("h", ""))); return json(user); }
    }
    // ── Storage ──
    if (u === URL_CIBLE + "/storage/v1/bucket") {
      if (m === "GET") return json([...etat.buckets.values()].map((b) => ({ name: b.id })));
      if (m === "POST") { const b = JSON.parse(init.body); etat.buckets.set(b.id, { id: b.id, file_size_limit: null }); return json({ name: b.id }); }
    }
    if (u.startsWith(URL_CIBLE + "/storage/v1/object/") && m === "POST") {
      const cle = decodeURIComponent(u.slice((URL_CIBLE + "/storage/v1/object/").length));
      if (etat.refusUpload.has(cle)) return texte("Payload too large", 413);
      const buf = Buffer.from(init.body); etat.objets.set(cle, { taille: buf.length, etag: md5(buf), owner: null, owner_id: null }); return json({ Key: cle });
    }
    // ── API de gestion : routée par le SQL ──
    if (u.startsWith("https://api.supabase.com/v1/projects/" + REF)) {
      const chemin = u.slice(("https://api.supabase.com/v1/projects/" + REF).length);
      if (chemin === "") return json({ status: "ACTIVE_HEALTHY", name: "jetable" });
      if (chemin === "/database/query") {
        const q = JSON.parse(init.body).query.trim();
        if (/^select id, file_size_limit from storage\.buckets/.test(q)) return json([...etat.buckets.values()]);
        if (/^update storage\.buckets set file_size_limit = null$/.test(q)) { for (const b of etat.buckets.values()) b.file_size_limit = null; return json([]); }
        if (/^update storage\.buckets set file_size_limit = /.test(q)) { if (etat.refusLimite) return texte("permission denied", 500); const mm = /file_size_limit = (\S+) where id = \$\w+\$(\w+)\$/.exec(q); etat.buckets.get(mm[2]).file_size_limit = mm[1] === "null" ? null : Number(mm[1]); return json([]); }
        if (/^update storage\.objects o set owner = /.test(q)) {
          const owner = /set owner = \$\w+\$([^$]*)\$\w+\$::uuid/.exec(q); const ownerId = /owner_id = \$\w+\$([^$]*)\$\w+\$/.exec(q);
          for (const p of q.matchAll(/\(\$\w+\$([^$]+)\$\w+\$, \$\w+\$([^$]+)\$\w+\$\)/g)) { const o = etat.objets.get(p[1] + "/" + p[2]); if (o) { o.owner = owner ? owner[1] : null; o.owner_id = ownerId ? ownerId[1] : null; } }
          return json([]);
        }
        if (/as name, metadata->>'size' as taille/.test(q)) return json([...etat.objets].map(([name, o]) => ({ name, taille: String(o.taille), etag: o.etag })));
        if (/as cle, owner::text as owner, owner_id from storage\.objects/.test(q)) return json([...etat.objets].map(([cle, o]) => ({ cle, owner: o.owner, owner_id: o.owner_id })));
        if (/^select table_name from information_schema\.tables/.test(q)) return json([]);
        throw new Error("SQL non routé par le faux : " + q.slice(0, 80));
      }
    }
    throw new Error("URL non routée par le faux : " + m + " " + u);
  };
  return etat;
}

function contexte(a) { return { jeton: "sbp_x", ref: REF, url: URL_CIBLE, cle: "service", archive: a.dossier, man: a.man, nom: "jetable" }; }
async function avec(m, fn) { const vrai = globalThis.fetch; globalThis.fetch = m.fetch; try { return await fn(); } finally { globalThis.fetch = vrai; } }
function preuveDe(ctx) { return ctx._preuve; }
// `--preuve` écrit un fichier : on le lit pour vérifier le JSON.
async function verdictAvecPreuve(ctx) {
  const f = path.join(ctx.archive, "preuve.json");
  const i = process.argv.indexOf("--preuve"); if (i !== -1) process.argv.splice(i, 2);
  process.argv.push("--preuve", f);
  try { const ok = await verdict(ctx); return { ok, preuve: JSON.parse(fs.readFileSync(f, "utf8")) }; }
  finally { const j = process.argv.indexOf("--preuve"); if (j !== -1) process.argv.splice(j, 2); }
}
const sansComptes = async (fn) => { process.argv.push("--sans-comptes"); try { return await fn(); } finally { process.argv.splice(process.argv.indexOf("--sans-comptes"), 1); } };

test("ASTRA-46 ① REPRODUCTION : un upload refusé → medias:false, mais preuve.prouvee:true et refus:[] (avant) ; désormais un seul résultat", async () => {
  const a = archive();
  const m = monde({ refusUpload: ["content/photos/u/a.jpg"], objets: { "content/photos/u/a.jpg": { taille: 3, etag: md5("AAA"), owner: "11111111-1111-4111-8111-111111111111", owner_id: "11111111-1111-4111-8111-111111111111" } } });
  const ctx = contexte(a);
  await avec(m, async () => {
    integriteArchive(ctx);
    const okMedias = await medias(ctx);
    assert.equal(okMedias, false, "la phase médias dit faux (l'upload a été refusé)");
    // La cible est pourtant DÉJÀ conforme (objet identique présent) : c'est la reproduction d'Astra.
    const { ok, preuve } = await sansComptes(() => verdictAvecPreuve(ctx));
    assert.equal(ok, false, "le verdict global doit suivre la phase : pas prouvé");
    assert.equal(preuve.prouvee, false);
    assert.ok(preuve.refus.some((r) => /^médias : content\/photos\/u\/a\.jpg : HTTP 413/.test(r)), JSON.stringify(preuve.refus));
    assert.ok(preuve.bloquants.some((b) => /refus pendant les phases/.test(b)) && preuve.bloquants.some((b) => /phase « medias »/.test(b)), JSON.stringify(preuve.bloquants));
  });
});

test("ASTRA-46 ② une limite de seau non remise est un bloquant du verdict, pas un refus local", async () => {
  const a = archive();
  const m = monde({ refusLimite: true });
  const ctx = contexte(a);
  await avec(m, async () => {
    integriteArchive(ctx);
    assert.equal(await medias(ctx), false);
    assert.deepEqual(ctx.bilan.limitesNonRestaurees, ["content"]);
    const { ok, preuve } = await sansComptes(() => verdictAvecPreuve(ctx));
    assert.equal(ok, false);
    assert.ok(preuve.bloquants.some((b) => /limites Storage non restaurées : content/.test(b)), JSON.stringify(preuve.bloquants));
  });
});

test("ASTRA-46 ③ le chemin nominal reste prouvé : upload, propriétaires rendus, limite remise, relectures conformes", async () => {
  const a = archive();
  const m = monde();
  const ctx = contexte(a);
  await avec(m, async () => {
    assert.equal(integriteArchive(ctx).ok, true);
    assert.equal(await medias(ctx), true, JSON.stringify(ctx.bilan));
    assert.equal(m.buckets.get("content").file_size_limit, 26000000, "la limite est remise");
    assert.equal(m.objets.get("content/photos/u/a.jpg").owner, "11111111-1111-4111-8111-111111111111", "le propriétaire est rendu");
    const { ok, preuve } = await sansComptes(() => verdictAvecPreuve(ctx));
    assert.equal(ok, true, JSON.stringify(preuve.bloquants));
    assert.equal(preuve.medias.ok, true); assert.equal(preuve.proprietaires.ok, true); assert.equal(preuve.medias.archive_intacte, true);
  });
});

test("ASTRA-55 ⑤ un média disparu de l'archive après sa vérification : l'archive est ENDOMMAGÉE, la reprise n'est pas prouvée même si la cible a l'objet", async () => {
  const a = archive({ sansFichierSurDisque: ["content/photos/u/a.jpg"] });
  const m = monde({ objets: { "content/photos/u/a.jpg": { taille: 3, etag: md5("AAA"), owner: "11111111-1111-4111-8111-111111111111", owner_id: "11111111-1111-4111-8111-111111111111" } } });
  const ctx = contexte(a);
  await avec(m, async () => {
    const i = integriteArchive(ctx);
    assert.equal(i.ok, false); assert.match(i.motif, /ENDOMMAGÉE : 1 fichier\(s\) de l'index absent/);
    await medias(ctx);
    const { ok, preuve } = await sansComptes(() => verdictAvecPreuve(ctx));
    assert.equal(ok, false, "AVANT : en_trop:1, medias.ok:true, prouvee:true");
    assert.equal(preuve.medias.ok, false); assert.equal(preuve.medias.archive_intacte, false);
    assert.ok(preuve.bloquants.some((b) => /intégrité de l'archive/.test(b)), JSON.stringify(preuve.bloquants));
  });
});

test("ASTRA-55 ⑥ un objet EN TROP sur la cible est un écart ; sans index l'attendu est INDÉTERMINÉ", async () => {
  const a = archive();
  const m = monde({ objets: { "content/photos/u/z.jpg": { taille: 1, etag: md5("Z"), owner: null, owner_id: null } } });
  const ctx = contexte(a);
  await avec(m, async () => {
    integriteArchive(ctx); await medias(ctx);
    const { ok, preuve } = await sansComptes(() => verdictAvecPreuve(ctx));
    assert.equal(ok, false); assert.equal(preuve.medias.en_trop, 1); assert.equal(preuve.medias.ok, false);
  });
  const b = archive({ index: false });
  const ctx2 = contexte(b);
  await avec(monde(), async () => {
    integriteArchive(ctx2); await medias(ctx2);
    const { ok, preuve } = await sansComptes(() => verdictAvecPreuve(ctx2));
    assert.equal(ok, false); assert.equal(preuve.medias.indetermine, true);
  });
});

test("ASTRA-48 ⑤ un inventaire des propriétaires tronqué : phase INDÉTERMINÉE, verdict ÉCART — jamais « attendus 0, conformes 0, ok »", async () => {
  const a = archive({ inventaireTexte: '{"format":"passio-proprietaires/1","total":1,"objets":{"content/photos/u/a.jpg":{"owner":"1111' });
  const ctx = contexte(a);
  await avec(monde(), async () => {
    integriteArchive(ctx);
    assert.equal(await medias(ctx), true, "aucun refus d'upload : la phase médias passe…");
    assert.equal(ctx.bilan.phases["propriétaires Storage"].indetermine, true, "…mais les propriétaires sont INDÉTERMINÉS");
    const { ok, preuve } = await sansComptes(() => verdictAvecPreuve(ctx));
    assert.equal(ok, false);
    assert.equal(preuve.proprietaires.indetermine, true);
    assert.match(preuve.proprietaires.motif, /JSON illisible/);
  });
});

test("ASTRA-45 ④ un objet archivé que l'inventaire ne relève pas : refus nommé et écart (deux fichiers, un seul propriétaire)", async () => {
  const a = archive({ fichiers: { "content/photos/u/a.jpg": "AAA", "content/photos/u/b.jpg": "BBB" }, inventaire: { "content/photos/u/a.jpg": { owner: "11111111-1111-4111-8111-111111111111", owner_id: "11111111-1111-4111-8111-111111111111" } } });
  const ctx = contexte(a);
  await avec(monde(), async () => {
    integriteArchive(ctx);
    assert.equal(await medias(ctx), false);
    assert.ok(ctx.bilan.refus.some((r) => /NON RELEVÉ\(S\) par l'inventaire \(ex\. content\/photos\/u\/b\.jpg\)/.test(r)), JSON.stringify(ctx.bilan.refus));
    const { ok, preuve } = await sansComptes(() => verdictAvecPreuve(ctx));
    assert.equal(ok, false); assert.equal(preuve.proprietaires.non_releves, 1); assert.equal(preuve.proprietaires.ok, false);
  });
});

test("ASTRA-30/47 ⑦ INTÉGRATION : la suspension est TRANSMISE au POST, RELUE, et un ban perdu est un refus (la mutation « ban non transmis » rougit ici)", async () => {
  const U = "22222222-2222-4222-8222-222222222222";
  const a = archive({ comptes: [{ id: U, email: "u@x.fr", banned_until: heures(48) }] });
  const m = monde();
  const ctx = contexte(a);
  await avec(m, async () => {
    await comptes(ctx);
    assert.equal(ctx.bilan.phases.comptes.ok, true, JSON.stringify(ctx.bilan.refus));
    assert.ok(m.users.get(U).banned_until, "GoTrue a reçu ban_duration : le compte est suspendu sur la cible");
    // Le verdict relit le compte et confronte la BORNE (ASTRA-47).
    const { ok, preuve } = await verdictAvecPreuve(ctx);
    assert.equal(ok, false, "le verdict échoue… sur les médias absents de la cible (rien n'a été déposé) — pas sur les comptes");
    assert.equal(preuve.comptes.ok, true, JSON.stringify(preuve.comptes));
  });
});

test("ASTRA-47 ③ compte DÉJÀ PRÉSENT sur la cible sans sa suspension : relu, suspension POSÉE, relue ; si la pose est refusée, c'est un refus", async () => {
  const U = "33333333-3333-4333-8333-333333333333";
  const a = archive({ comptes: [{ id: U, email: "u@x.fr", banned_until: heures(48) }] });
  const m = monde({ users: { [U]: { id: U, email: "u@x.fr", banned_until: null } } });
  const ctx = contexte(a);
  await avec(m, async () => {
    await comptes(ctx);
    assert.equal(ctx.bilan.phases.comptes.ok, true, JSON.stringify(ctx.bilan.refus));
    assert.ok(m.journal.some((l) => l === "PUT /auth/v1/admin/users/" + U), "la suspension a été posée sur le compte existant");
    assert.ok(m.users.get(U).banned_until, "…et elle est effective");
  });
  const m2 = monde({ users: { [U]: { id: U, email: "u@x.fr", banned_until: "2020-01-01T00:00:00Z" } }, refusPutBan: true });
  const ctx2 = contexte(a);
  await avec(m2, async () => {
    await comptes(ctx2);
    assert.equal(ctx2.bilan.phases.comptes.ok, false);
    assert.ok(ctx2.bilan.refus.some((r) => /suspension NON POSÉE/.test(r)) && ctx2.bilan.refus.some((r) => /DÉJÀ PASSÉE|N'EST PAS suspendu/.test(r)), JSON.stringify(ctx2.bilan.refus));
  });
});

// ═══ SIXIÈME CONTRE-REVUE (16/09/2026) — ASTRA-58 / ASTRA-59 ═══
const { validerArchive } = R._phases;
const OWN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("ASTRA-59 ① REPRODUCTION : index AAA, disque BAD, cible AAA → la cible devenait BAD avant le verdict rouge ; désormais RIEN n'est déposé", async () => {
  const a = archive({ fichiers: { "content/photos/u/a.jpg": "AAA" } });
  // L'archive est ALTÉRÉE après sa sauvegarde : le fichier sur disque diffère de l'index.
  fs.writeFileSync(path.join(a.dossier, "_storage", "content", "photos", "u", "a.jpg"), "BAD");
  const m = monde({ objets: { "content/photos/u/a.jpg": { taille: 3, etag: md5("AAA"), owner: "11111111-1111-4111-8111-111111111111", owner_id: "11111111-1111-4111-8111-111111111111" } } });
  const ctx = contexte(a);
  await avec(m, async () => {
    // ⓪ la validation, AVANT toute mutation : invalide, et pas « non vérifiable ».
    const v = validerArchive(ctx);
    assert.equal(v.ok, false);
    assert.equal(v.indetermine, false, "une corruption DÉTECTÉE n'est pas « non vérifiable »");
    assert.ok(v.bloquants.some((b) => /ENDOMMAGÉE.*1 modifié/.test(b)), JSON.stringify(v.bloquants));
    // Et même si la phase médias était appelée quand même (hors main) : le filet refuse le dépôt.
    const okMedias = await medias(ctx);
    assert.equal(okMedias, false);
    assert.equal(m.objets.get("content/photos/u/a.jpg").etag, md5("AAA"), "la cible est INTACTE : AAA, pas BAD");
    assert.ok(!m.journal.some((l) => /^POST \/storage\/v1\/object\/content/.test(l)), "aucun upload n'est parti : " + m.journal.filter((l) => /object/.test(l)).join(" | "));
    const { ok, preuve } = await sansComptes(() => verdictAvecPreuve(ctx));
    assert.equal(ok, false);
    assert.ok(preuve.refus.some((r) => /diffère de l'index.*NON déposé/.test(r)), JSON.stringify(preuve.refus));
  });
});

test("ASTRA-59 ② une table NDJSON tronquée ou un fichier hors index invalident l'archive avant toute écriture ; sans index c'est « non vérifiable », distinct", async () => {
  const a = archive({ fichiers: { "content/photos/u/a.jpg": "AAA" } });
  // Une table annoncée à 2 lignes, présente avec 1.
  a.man.tables = { posts: { exporte: 2, octets: 10 } };
  fs.writeFileSync(path.join(a.dossier, "posts.ndjson"), JSON.stringify({ id: 1 }) + "\n");
  fs.writeFileSync(path.join(a.dossier, "manifeste.json"), JSON.stringify(a.man));
  const v = validerArchive(contexte(a));
  assert.equal(v.ok, false);
  assert.ok(v.bloquants.some((b) => /table posts : 1 ligne\(s\) sur disque, 2 au manifeste/.test(b)), JSON.stringify(v.bloquants));
  // Fichier en trop sur disque (hors index) : endommagée.
  const b2 = archive({ fichiers: { "content/photos/u/a.jpg": "AAA" } });
  fs.writeFileSync(path.join(b2.dossier, "_storage", "content", "photos", "u", "z.jpg"), "ZZZ");
  const v2 = validerArchive(contexte(b2));
  assert.equal(v2.ok, false); assert.ok(v2.bloquants.some((b) => /1 hors index/.test(b)));
  // Sans index (archive d'avant) : NON VÉRIFIABLE, pas « invalide » — et la phase médias ne dépose rien non plus.
  const c = archive({ fichiers: { "content/photos/u/a.jpg": "AAA" }, index: false });
  const v3 = validerArchive(contexte(c));
  assert.deepEqual([v3.ok, v3.indetermine], [false, true]);
  const m = monde();
  await avec(m, async () => { assert.equal(await medias(contexte(c)), false); assert.ok(!m.objets.has("content/photos/u/a.jpg"), "sans index lisible, rien n'est déposé"); });
  // Archive saine : conforme.
  const d = archive({ fichiers: { "content/photos/u/a.jpg": "AAA" } });
  assert.equal(validerArchive(contexte(d)).ok, true);
});

test("ASTRA-58 ③ REPRODUCTION : archive owner:null/owner_id:null, cible appartenant à B → « restaurée » (avant) ; désormais NULL est RENDU et VÉRIFIÉ", async () => {
  const a = archive({ fichiers: { "content/systeme.png": "AAA" }, inventaire: { "content/systeme.png": { owner: null, owner_id: null } } });
  // La cible porte déjà l'objet, propriété de B.
  const m = monde({ objets: { "content/systeme.png": { taille: 3, etag: md5("AAA"), owner: OWN_B, owner_id: OWN_B } } });
  const ctx = contexte(a);
  await avec(m, async () => {
    assert.equal(validerArchive(ctx).ok, true);
    const okMedias = await medias(ctx);
    assert.equal(okMedias, true);
    assert.deepEqual([m.objets.get("content/systeme.png").owner, m.objets.get("content/systeme.png").owner_id], [null, null], "le NUL explicite est écrit sur la cible");
    assert.ok(m.journal.some((l) => /<gestion>\/database\/query/.test(l)));
    const { ok, preuve } = await sansComptes(() => verdictAvecPreuve(ctx));
    assert.equal(ok, true);
    assert.equal(preuve.proprietaires.conformes, 1);
    assert.equal(preuve.proprietaires.sans_proprietaire_dans_l_archive, 1);
  });
  // Et si la cible RESTE à B (l'UPDATE n'a pas eu lieu — ici : verdict seul, sans phase médias) : DIVERGENT, pas prouvé.
  const m2 = monde({ objets: { "content/systeme.png": { taille: 3, etag: md5("AAA"), owner: OWN_B, owner_id: OWN_B } } });
  const ctx2 = contexte(archive({ fichiers: { "content/systeme.png": "AAA" }, inventaire: { "content/systeme.png": { owner: null, owner_id: null } } }));
  await avec(m2, async () => {
    integriteArchive(ctx2);
    const { ok, preuve } = await sansComptes(() => verdictAvecPreuve(ctx2));
    assert.equal(ok, false, "la cible appartient à B, l'archive dit NULL : écart");
    assert.deepEqual(preuve.proprietaires.noms.divergents, ["content/systeme.png"]);
    assert.equal(preuve.prouvee, false);
  });
});

test("ASTRA-58 ④ une entrée `{}` dans l'inventaire : archive INVALIDE (propriétaire inconnu), rien n'est écrit, verdict INDÉTERMINÉ", async () => {
  const a = archive({ fichiers: { "content/systeme.png": "AAA" }, inventaire: { "content/systeme.png": {} } });
  const m = monde({ objets: { "content/systeme.png": { taille: 3, etag: md5("AAA"), owner: OWN_B, owner_id: OWN_B } } });
  const ctx = contexte(a);
  await avec(m, async () => {
    const v = validerArchive(ctx);
    assert.equal(v.ok, false);
    assert.ok(v.bloquants.some((b) => /inventaire des propriétaires.*INCONNU/.test(b)), JSON.stringify(v.bloquants));
    const { ok, preuve } = await sansComptes(() => verdictAvecPreuve(ctx));
    assert.equal(ok, false);
    assert.equal(preuve.proprietaires.indetermine, true);
    assert.equal(m.objets.get("content/systeme.png").owner, OWN_B, "rien n'a été écrit");
  });
});
