// ═══════════════════════════════════════════════════════════════════════════
// PURGE STORAGE — les fichiers laissés par les comptes e2e jetables.
//
// `purge_e2e_accounts.sql` nettoie 23 tables puis supprime les comptes. Il ne
// touche PAS aux fichiers, et il ne le peut pas : Supabase interdit le DELETE
// direct sur `storage.objects` (trigger `storage.protect_delete`, message
// « Direct deletion from storage tables is not allowed »). Le nettoyage doit
// donc passer par l'API Storage — d'où ce script séparé.
//
// Conséquence mesurée le 2026-08-16 avant correction : 172 fichiers de test
// (des GIF de 37 octets, le 1×1 transparent) traînaient dans le seau PUBLIC
// `content`, rangés sous des dossiers de comptes supprimés depuis longtemps.
// Chaque exécution de la suite multi-comptes en ajoutait une douzaine.
//
// ⚠️ GARDE-FOU CENTRAL — le seuil de taille.
// On ne supprime QUE des fichiers de moins de 1 Ko appartenant à un compte qui
// n'existe plus. Une vraie photo ne pèse jamais 37 octets ; ce seuil rend
// mécaniquement impossible d'effacer du contenu d'utilisateur par erreur. Les
// fichiers volumineux de comptes disparus sont COMPTÉS et affichés, jamais
// touchés : ce sont potentiellement de vraies données, et leur sort est une
// décision humaine, pas une conséquence d'un script de test.
//
//   node scripts/purge-e2e-storage.js            (rapport seul, ne supprime rien)
//   node scripts/purge-e2e-storage.js --appliquer
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const TAILLE_MAX = 1024;   // au-delà, on ne touche à rien

function env() {
  const f = path.join(__dirname, "..", "dashboard", ".env");
  const vals = { ...process.env };
  if (fs.existsSync(f)) {
    for (const ligne of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(ligne);
      if (m && !vals[m[1]]) vals[m[1]] = m[2].trim();
    }
  }
  if (!vals.SUPABASE_URL || !vals.SUPABASE_SERVICE_ROLE_KEY) return null;
  return { url: vals.SUPABASE_URL.replace(/\/+$/, ""), cle: vals.SUPABASE_SERVICE_ROLE_KEY };
}

const entetes = (cle, extra = {}) => ({ apikey: cle, Authorization: `Bearer ${cle}`, ...extra });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifiants des comptes existants. Tout dossier hors de cette liste est orphelin. */
async function comptesExistants(cfg) {
  const vus = new Set();
  for (let page = 1; ; page++) {
    const r = await fetch(`${cfg.url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: entetes(cfg.cle) });
    if (!r.ok) throw new Error(`comptes : HTTP ${r.status}`);
    const lot = (await r.json()).users || [];
    for (const u of lot) vus.add(u.id);
    if (lot.length < 200) break;
  }
  return vus;
}

/** Parcours récursif d'un seau — l'API ne liste qu'un niveau à la fois. */
async function objets(cfg, seau) {
  const trouves = [];
  const aVisiter = [""];
  while (aVisiter.length) {
    const prefixe = aVisiter.shift();
    let debut = 0;
    for (;;) {
      const r = await fetch(`${cfg.url}/storage/v1/object/list/${seau}`, {
        method: "POST", headers: entetes(cfg.cle, { "Content-Type": "application/json" }),
        body: JSON.stringify({ prefix: prefixe, limit: 100, offset: debut, sortBy: { column: "name", order: "asc" } }),
      });
      if (!r.ok) throw new Error(`list ${seau} : HTTP ${r.status}`);
      const lot = await r.json();
      for (const o of lot) {
        const chemin = prefixe ? `${prefixe}/${o.name}` : o.name;
        if (!o.id) { aVisiter.push(chemin); continue; }   // dossier
        trouves.push({ chemin, taille: (o.metadata && o.metadata.size) || 0 });
      }
      if (lot.length < 100) break;
      debut += 100;
    }
  }
  return trouves;
}

async function supprimer(cfg, seau, chemins) {
  let n = 0;
  for (let i = 0; i < chemins.length; i += 100) {
    const lot = chemins.slice(i, i + 100);
    const r = await fetch(`${cfg.url}/storage/v1/object/${seau}`, {
      method: "DELETE", headers: entetes(cfg.cle, { "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: lot }),
    });
    if (!r.ok) throw new Error(`suppression ${seau} : HTTP ${r.status} ${await r.text()}`);
    n += lot.length;
  }
  return n;
}

(async () => {
  const cfg = env();
  if (!cfg) {
    // Best-effort, comme la purge des comptes : jamais bloquant en CI.
    console.log("[purge:storage] clés Supabase absentes — ignoré.");
    return;
  }
  const appliquer = process.argv.includes("--appliquer");
  const vivants = await comptesExistants(cfg);

  let totalSupprimes = 0, gardes = 0, poidsGarde = 0;
  for (const seau of ["content", "attachments"]) {
    const liste = await objets(cfg, seau);
    const orphelins = liste.filter((o) => {
      const proprio = o.chemin.split("/")[1];
      return proprio && UUID.test(proprio) && !vivants.has(proprio);
    });
    const aSupprimer = orphelins.filter((o) => o.taille > 0 && o.taille <= TAILLE_MAX).map((o) => o.chemin);
    const tropGros = orphelins.filter((o) => o.taille > TAILLE_MAX);
    gardes += tropGros.length;
    poidsGarde += tropGros.reduce((s, o) => s + o.taille, 0);

    console.log(`[purge:storage] ${seau} : ${liste.length} fichiers, ${orphelins.length} sans compte, `
      + `${aSupprimer.length} éligibles (≤ ${TAILLE_MAX} o)`);
    if (aSupprimer.length && appliquer) {
      totalSupprimes += await supprimer(cfg, seau, aSupprimer);
    }
  }

  if (!appliquer) console.log("[purge:storage] rapport seul — relancer avec --appliquer pour supprimer.");
  else console.log(`[purge:storage] ${totalSupprimes} fichier(s) de test supprimé(s).`);

  if (gardes) {
    console.log(`[purge:storage] ⚠ ${gardes} fichier(s) volumineux (${(poidsGarde / 1048576).toFixed(1)} Mo) `
      + `appartiennent à des comptes supprimés et sont CONSERVÉS.`);
    console.log("[purge:storage]   Ce ne sont pas des fichiers de test : leur sort est une décision humaine.");
  }
})().catch((e) => { console.warn("[purge:storage] échec (non bloquant) :", e.message); });
