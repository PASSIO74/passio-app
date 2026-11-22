// Transport synthétique du processus CLI enfant. Tout hôte et toute opération
// hors de ce contrat lèvent, sans transmettre la requête au réseau.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const dossier = process.env.ARCHIVE_SYNTHETIQUE, mode = process.env.TYPE_SYNTHETIQUE;
const ref = "abcdefghijabcdefghij", projet = "https://" + ref + ".supabase.co";
const gestion = "https://api.supabase.com/v1/projects/" + ref;
const owner = "11111111-1111-4111-8111-111111111111", id = "44444444-4444-4444-8444-444444444444";
const lire = t => JSON.parse(fs.readFileSync(path.join(dossier, t + ".ndjson"), "utf8"));
const objet = lire("media_objects"), cle = objet.bucket_id + "/" + objet.object_key;
const attendu = createHash("md5").update("ABC").digest("hex");
let lectures = 0;
globalThis.fetch = async (url, init = {}) => {
  const method = init.method || "GET", u = new URL(url);
  if (url === gestion) return Response.json({ status: "ACTIVE_HEALTHY", name: "fixture" });
  if (url === gestion + "/api-keys?reveal=true") return Response.json([{ name: "service_role", api_key: "service_factice" }]);
  if (u.origin === projet && u.pathname.startsWith("/rest/v1/")) {
    const table = u.pathname.split("/").pop();
    assert.ok(["media_assets", "media_reservations", "media_objects"].includes(table));
    return Response.json([table === "media_objects" ? { ...objet, storage_object_id: id } : lire(table)]);
  }
  if (u.origin === projet && u.pathname === "/storage/v1/object/" + cle) {
    assert.equal(method, "GET"); assert.equal(init.redirect, "error"); assert.ok(init.signal);
    assert.equal(init.headers.Authorization, "Bearer service_factice"); assert.ok(u.searchParams.get("reprise"));
    fs.appendFileSync(path.join(dossier, "compteur-get"), "1");
    return new Response(mode === "different" ? "XYZ" : mode === "long" ? "ABCD" : "ABC");
  }
  if (url === gestion + "/database/query") {
    const { query, parameters, read_only } = JSON.parse(init.body);
    assert.doesNotMatch(query, /\b(?:update|delete|insert|alter)\b/i);
    if (query.includes("as rencontres") && query.includes("as budget")) return Response.json([{ lecture_seule: true, rencontres: false, budget: false, tables: [] }]);
    if (query.includes("as name, metadata->>'size'")) {
      lectures++;
      const etag = mode === "absent" ? null : mode === "fort" ? attendu : "a".repeat(32) + "-2";
      return Response.json([{ name: cle, taille: "3", etag, identite: id, version: mode === "instable" ? "v" + lectures : "v1", vivant: true }]);
    }
    if (query.includes("as cle, owner::text")) return Response.json([{ cle, owner, owner_id: owner }]);
    if (query.includes("information_schema.tables")) return Response.json(["media_reservations", "media_assets", "media_objects"].map(table_name => ({ table_name })));
    if (query.includes("count(*)::int n from public.")) return Response.json(["media_reservations", "media_assets", "media_objects"].map(t => ({ t, n: 1 })));
    if (query.includes("from conformes")) {
      assert.equal(read_only, true);
      const [x] = JSON.parse(parameters[0]);
      const ok = mode === "fort" || (x.relu_id === id && x.relu_version === "v1" && x.relu_md5 === attendu);
      return Response.json([{ lecture_seule: true, objets: ok ? [{ source: objet.storage_object_id, cible: id, inscrit: id }] : [] }]);
    }
  }
  throw new Error("transport_synthetique_refuse");
};
