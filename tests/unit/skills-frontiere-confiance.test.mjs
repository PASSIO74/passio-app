// Audit 100K, D11-04 : un skill ne fait pas lire au connecteur de production
// du texte écrit par un inconnu. `client_errors` et `reports` acceptent
// l'insertion anonyme ; le connecteur lit hors RLS. Seuls des agrégats
// (empreinte md5 + compte) ou des colonnes de forme fermée sont permis.
// #951 n'avait corrigé que /prod-errors : quatre skills avaient survécu.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..");

function fichiers(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...fichiers(p));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

// Retire ce qui est une projection sûre, puis cherche une colonne brute.
function requetesFautives(texte) {
  const fautes = [];
  const blocs = texte.split("```").filter((_, i) => i % 2 === 1);
  for (const b of blocs) {
    const sql = b.toLowerCase();
    if (/\bfrom\s+client_errors\b/.test(sql)) {
      const reste = sql.replace(/md5\(\s*coalesce\(\s*message\s*,\s*''\s*\)\s*\)/g, "");
      if (/\b(message|stack|url)\b/.test(reste.split(/\bfrom\b/)[0])) fautes.push("client_errors : " + b.trim().slice(0, 80));
    }
    if (/\bfrom\s+(public\.)?reports\b/.test(sql)) {
      const reste = sql.replace(/char_length\(\s*coalesce\(\s*(r\.)?reason\s*,\s*''\s*\)\s*\)/g, "");
      if (/\b(r\.)?(reason|reporter_id)\b/.test(reste) || /\bselect\s+\*/.test(reste)) fautes.push("reports : " + b.trim().slice(0, 80));
    }
  }
  return fautes;
}

test("aucun skill ne lit le texte brut de client_errors ou de reports", () => {
  const fautes = [];
  for (const f of fichiers(path.join(RACINE, ".claude", "skills"))) {
    for (const x of requetesFautives(fs.readFileSync(f, "utf8"))) fautes.push(path.relative(RACINE, f) + " → " + x);
  }
  assert.deepEqual(fautes, []);
});

test("le détecteur voit les projections interdites (témoin positif)", () => {
  assert.equal(requetesFautives("```\nSELECT created_at, message, stack, url FROM client_errors LIMIT 3\n```").length, 1);
  assert.equal(requetesFautives("```\nselect message, count(*) n from client_errors group by 1\n```").length, 1);
  assert.equal(requetesFautives("```\nSELECT r.kind, r.reason, r.reporter_id FROM reports r\n```").length, 1);
  assert.equal(requetesFautives("```\nSELECT * FROM reports\n```").length, 1);
  assert.equal(requetesFautives("```\nSELECT md5(coalesce(message, '')) AS e, count(*) FROM client_errors\n```").length, 0);
  assert.equal(requetesFautives("```\nSELECT char_length(coalesce(r.reason, '')) FROM reports r\n```").length, 0);
});

test("les places de marché tierces ne se mettent pas à jour seules", () => {
  const s = JSON.parse(fs.readFileSync(path.join(RACINE, ".claude", "settings.json"), "utf8"));
  const auto = Object.entries(s.extraKnownMarketplaces || {}).filter(([, v]) => v.autoUpdate !== false).map(([k]) => k);
  assert.deepEqual(auto, []);
});
