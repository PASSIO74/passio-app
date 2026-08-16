// ═══════════════════════════════════════════════════════════════════════════
// SAUVEGARDE DES DONNÉES — export complet du contenu métier, sans Docker.
//
// Pourquoi ce script existe : `supabase db dump` a besoin de Docker (il lance
// pg_dump dans un conteneur). Sur une machine sans Docker, il échoue — code de
// sortie 1, et un fichier de 0 octet laissé à destination. La seule voie de
// sauvegarde réellement exécutable ici passe donc par l'API REST.
//
// Ce que ce script sauvegarde, et ce qu'il NE sauvegarde PAS :
//   ✔ les DONNÉES de toutes les tables exposées (le contenu irremplaçable)
//   ✘ le schéma, les policies RLS, les triggers, les fonctions → ils vivent
//     dans `migrations/` et dans le dépôt, versionnés. Restaurer, c'est rejouer
//     les migrations PUIS recharger ces données.
//   ✘ les fichiers du Storage (médias) — hors périmètre, à traiter à part.
//
// Deux garde-fous, parce qu'une sauvegarde qui ment est pire que pas de
// sauvegarde : ① la liste des tables est DÉCOUVERTE auprès de PostgREST, jamais
// codée en dur (une table ajoutée demain serait sinon oubliée en silence) ;
// ② chaque table est recomptée côté serveur après export et l'écart fait
// échouer le script.
//
// ⚠ LES COMPTES NE SONT PAS DANS `public`. `auth.users` porte les e-mails, les
// fournisseurs d'identité et les identifiants auxquels TOUTES les autres tables
// se réfèrent. Sans eux, une archive du schéma public est un jeu de lignes
// orphelines : les posts existent, plus personne ne les a écrits. D'où
// `--avec-comptes`, qui les exporte via l'API d'administration. Cette option
// écrit des DONNÉES PERSONNELLES sur le disque — `.passio/sauvegardes/` est
// exclu de git pour cette raison précise.
//
//   node scripts/sauvegarde-donnees.js [--sortie <dossier>] [--avec-telemetrie] [--avec-comptes]
//   node scripts/sauvegarde-donnees.js --verifier <dossier>
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const fs = require("node:fs");
const path = require("node:path");

// Tables d'observabilité : volumineuses et REGÉNÉRABLES. Les inclure d'office
// ferait passer la sauvegarde de ~2 Mo à ~20 Mo pour zéro valeur de reprise.
const OBSERVABILITE = new Set(["telemetry_events", "analytics_events", "client_errors"]);

const PAGE = 1000;   // PostgREST plafonne les réponses ; on pagine explicitement.

function env() {
  // Chargement depuis dashboard/.env sans dépendance externe. Le secret ne
  // transite que dans ce processus : jamais journalisé, jamais dans la sortie.
  const f = path.join(__dirname, "..", "dashboard", ".env");
  const vals = { ...process.env };
  if (fs.existsSync(f)) {
    for (const ligne of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(ligne);
      if (m && !vals[m[1]]) vals[m[1]] = m[2].trim();
    }
  }
  const url = vals.SUPABASE_URL, cle = vals.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents (dashboard/.env).");
    process.exit(2);
  }
  return { url: url.replace(/\/+$/, ""), cle };
}

const entetes = (cle, extra = {}) => ({ apikey: cle, Authorization: `Bearer ${cle}`, ...extra });

/**
 * Tables exposées + leur clé de tri, lues dans le descripteur OpenAPI.
 * Le tri n'est pas cosmétique : sans ORDER BY, `offset` sur plusieurs pages
 * peut renvoyer deux fois la même ligne et en sauter une autre. On trie sur la
 * clé primaire (que PostgREST annonce dans la description de chaque colonne) ;
 * à défaut, sur la première colonne, ce qui reste déterministe.
 * @returns {Promise<Array<{nom:string, tri:string}>>}
 */
async function tables({ url, cle }) {
  const r = await fetch(`${url}/rest/v1/`, { headers: entetes(cle, { Accept: "application/openapi+json" }) });
  if (!r.ok) throw new Error(`découverte des tables : HTTP ${r.status}`);
  const doc = await r.json();
  const defs = doc.definitions || doc.components?.schemas || {};
  return Object.keys(defs).sort().map((nom) => {
    const props = defs[nom].properties || {};
    const cles = Object.keys(props);
    const pk = cles.filter((c) => /<pk\/>/.test(props[c].description || ""));
    // PostgREST expose aussi les VUES. Les sauvegarder n'a aucun sens : elles
    // sont dérivées, et les recharger échouerait. Discriminant vérifié contre
    // pg_class le 2026-08-16 : les 35 tables de base ont toutes une clé
    // primaire, les 3 vues n'en ont aucune. Une future table sans clé primaire
    // serait donc écartée à tort — d'où l'avertissement à l'exécution.
    return { nom, tri: (pk.length ? pk : cles).join(","), vue: pk.length === 0 };
  });
}

/** Nombre de lignes vu par le serveur — la référence de vérification. */
async function compter({ url, cle }, table) {
  const r = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    method: "HEAD", headers: entetes(cle, { Prefer: "count=exact" }),
  });
  const cr = r.headers.get("content-range") || "";
  const m = /\/(\d+)$/.exec(cr);
  return m ? Number(m[1]) : null;
}

async function exporter(cfg, table, tri, flux) {
  let debut = 0, total = 0;
  for (;;) {
    const r = await fetch(`${cfg.url}/rest/v1/${table}?select=*&order=${encodeURIComponent(tri)}&limit=${PAGE}&offset=${debut}`, {
      headers: entetes(cfg.cle),
    });
    if (!r.ok) throw new Error(`${table} : HTTP ${r.status} ${await r.text()}`);
    const lignes = await r.json();
    for (const l of lignes) flux.write(JSON.stringify(l) + "\n");
    total += lignes.length;
    if (lignes.length < PAGE) break;
    debut += PAGE;
  }
  return total;
}

/**
 * Comptes d'authentification, via l'API d'administration (service_role).
 * Ils ne passent pas par PostgREST : le schéma `auth` n'est pas exposé.
 */
async function exporterComptes(cfg, dossier) {
  const tout = [];
  for (let page = 1; ; page++) {
    const r = await fetch(`${cfg.url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: entetes(cfg.cle) });
    if (!r.ok) throw new Error(`comptes : HTTP ${r.status} ${await r.text()}`);
    const d = await r.json();
    const lot = d.users || [];
    tout.push(...lot);
    if (lot.length < 200) break;
  }
  const f = path.join(dossier, "_auth_users.ndjson");
  fs.writeFileSync(f, tout.map((u) => JSON.stringify(u)).join("\n") + (tout.length ? "\n" : ""));
  return { comptes: tout.length, octets: fs.statSync(f).size };
}

/**
 * Fichiers du Storage. En volume, c'est l'essentiel du contenu réel : les
 * lignes de base pèsent quelques mégaoctets, les photos et vocaux plusieurs
 * centaines. Une archive qui les laisse derrière n'est pas une sauvegarde.
 * La liste n'est pas récursive côté API : on descend les dossiers à la main.
 */
async function exporterMedias(cfg, dossier, journal) {
  const base = path.join(dossier, "_storage");
  const seaux = await (await fetch(`${cfg.url}/storage/v1/bucket`, { headers: entetes(cfg.cle) })).json();
  let fichiers = 0, octets = 0, echecs = 0;

  for (const seau of seaux) {
    const aVisiter = [""];
    while (aVisiter.length) {
      const prefixe = aVisiter.shift();
      let debut = 0;
      for (;;) {
        const r = await fetch(`${cfg.url}/storage/v1/object/list/${seau.name}`, {
          method: "POST", headers: entetes(cfg.cle, { "Content-Type": "application/json" }),
          body: JSON.stringify({ prefix: prefixe, limit: 100, offset: debut, sortBy: { column: "name", order: "asc" } }),
        });
        if (!r.ok) throw new Error(`storage ${seau.name} : HTTP ${r.status}`);
        const lot = await r.json();
        for (const o of lot) {
          const chemin = prefixe ? `${prefixe}/${o.name}` : o.name;
          // Un « dossier » se reconnaît à l'absence de métadonnées d'objet.
          if (!o.id) { aVisiter.push(chemin); continue; }
          const g = await fetch(`${cfg.url}/storage/v1/object/${seau.name}/${encodeURI(chemin)}`, { headers: entetes(cfg.cle) });
          if (!g.ok) { echecs++; journal.push({ seau: seau.name, chemin, http: g.status }); continue; }
          const buf = Buffer.from(await g.arrayBuffer());
          const dest = path.join(base, seau.name, chemin);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, buf);
          fichiers++; octets += buf.length;
        }
        if (lot.length < 100) break;
        debut += 100;
      }
    }
  }
  return { fichiers, octets, echecs };
}

async function sauvegarder(dossier, avecTelemetrie, avecComptes, avecMedias) {
  const cfg = env();
  fs.mkdirSync(dossier, { recursive: true });
  const toutes = await tables(cfg);
  const vues = toutes.filter((t) => t.vue).map((t) => t.nom);
  const retenues = toutes.filter((t) => !t.vue && (avecTelemetrie || !OBSERVABILITE.has(t.nom)));

  console.log(`Relations exposées : ${toutes.length} — tables sauvegardées : ${retenues.length}`);
  if (vues.length) console.log(`  vues écartées (dérivées) : ${vues.join(", ")}`);
  if (!avecTelemetrie) console.log(`  observabilité écartée (regénérable) : ${toutes.filter((t) => !t.vue && OBSERVABILITE.has(t.nom)).map((t) => t.nom).join(", ") || "aucune"}`);

  const manifeste = {
    genere_le: new Date().toISOString(), projet: cfg.url,
    vues_ecartees: vues, observabilite_incluse: !!avecTelemetrie,
    tables: {}, ecarts: [],
  };
  for (const { nom: t, tri } of retenues) {
    const attendu = await compter(cfg, t);
    const fichier = path.join(dossier, `${t}.ndjson`);
    const flux = fs.createWriteStream(fichier);
    const ecrit = await exporter(cfg, t, tri, flux);
    await new Promise((res) => flux.end(res));

    manifeste.tables[t] = { attendu, exporte: ecrit, tri, octets: fs.statSync(fichier).size };
    // Un export incomplet DOIT se voir. Sans ce contrôle, une pagination ratée
    // produirait une archive plausible et amputée — le pire cas.
    if (attendu !== null && attendu !== ecrit) manifeste.ecarts.push({ table: t, attendu, exporte: ecrit });
    console.log(`  ${t.padEnd(26)} ${String(ecrit).padStart(6)} lignes` +
      (attendu !== null && attendu !== ecrit ? `  ⚠ serveur en annonce ${attendu}` : ""));
  }

  if (avecMedias) {
    const journal = [];
    const m = await exporterMedias(cfg, dossier, journal);
    manifeste.medias = { fichiers: m.fichiers, octets: m.octets, echecs: m.echecs, detail_echecs: journal };
    console.log(`  ${"_storage".padEnd(26)} ${String(m.fichiers).padStart(6)} fichiers, ${(m.octets / 1048576).toFixed(1)} Mo` +
      (m.echecs ? `  ⚠ ${m.echecs} échec(s)` : ""));
    if (m.echecs) manifeste.ecarts.push({ table: "_storage", attendu: m.fichiers + m.echecs, exporte: m.fichiers });
  } else {
    manifeste.medias = null;
    console.log("\n⚠ Médias NON sauvegardés (Storage). En volume, c'est l'essentiel");
    console.log("  du contenu utilisateur. Ajouter --avec-medias.");
  }

  if (avecComptes) {
    const c = await exporterComptes(cfg, dossier);
    manifeste.comptes = c.comptes;
    console.log(`  ${"_auth_users".padEnd(26)} ${String(c.comptes).padStart(6)} comptes  (DONNÉES PERSONNELLES)`);
  } else {
    manifeste.comptes = null;
    console.log("\n⚠ Comptes NON sauvegardés (auth.users). Sans eux, les lignes exportées");
    console.log("  n'ont plus d'auteur identifiable. Ajouter --avec-comptes.");
  }

  fs.writeFileSync(path.join(dossier, "manifeste.json"), JSON.stringify(manifeste, null, 1));
  const lignes = Object.values(manifeste.tables).reduce((s, x) => s + x.exporte, 0);
  const octets = Object.values(manifeste.tables).reduce((s, x) => s + x.octets, 0);
  console.log(`\nArchive : ${dossier}\n${lignes} lignes, ${(octets / 1048576).toFixed(2)} Mo`);
  if (manifeste.ecarts.length) {
    console.error(`\nÉCHEC : ${manifeste.ecarts.length} table(s) incomplète(s). Archive NON fiable.`);
    process.exit(1);
  }
  console.log("Toutes les tables concordent avec le décompte serveur.");
}

/** Relit une archive et confronte son contenu à son manifeste. */
function verifier(dossier) {
  const man = JSON.parse(fs.readFileSync(path.join(dossier, "manifeste.json"), "utf8"));
  let pb = 0;
  for (const [t, info] of Object.entries(man.tables)) {
    const f = path.join(dossier, `${t}.ndjson`);
    if (!fs.existsSync(f)) { console.error(`  ${t} : fichier absent`); pb++; continue; }
    const contenu = fs.readFileSync(f, "utf8");
    const lignes = contenu ? contenu.trimEnd().split("\n") : [];
    if (contenu && lignes.length !== info.exporte) { console.error(`  ${t} : ${lignes.length} lignes, manifeste ${info.exporte}`); pb++; continue; }
    for (const l of lignes) { try { JSON.parse(l); } catch { console.error(`  ${t} : ligne JSON illisible`); pb++; break; } }
  }
  if (man.medias == null) console.log("  ⚠ archive SANS les médias (Storage).");
  else {
    // Recompter les fichiers sur le disque : le manifeste dit ce que le script
    // croit avoir écrit, l'arborescence dit ce qui est réellement là.
    const base = path.join(dossier, "_storage");
    const compter = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true })
      .reduce((s, e) => s + (e.isDirectory() ? compter(path.join(d, e.name)) : 1), 0) : 0;
    const n = compter(base);
    if (n !== man.medias.fichiers) { console.error(`  _storage : ${n} fichiers sur disque, manifeste ${man.medias.fichiers}`); pb++; }
  }
  if (man.comptes == null) {
    console.log("  ⚠ archive SANS les comptes : restaurable en données, pas en identités.");
  } else {
    const f = path.join(dossier, "_auth_users.ndjson");
    const n = fs.existsSync(f) ? fs.readFileSync(f, "utf8").trimEnd().split("\n").filter(Boolean).length : -1;
    if (n !== man.comptes) { console.error(`  _auth_users : ${n} lignes, manifeste ${man.comptes}`); pb++; }
  }
  console.log(pb ? `\n${pb} anomalie(s).` : `\nArchive relue : ${Object.keys(man.tables).length} tables${man.comptes != null ? ` + ${man.comptes} comptes` : ""}, toutes lisibles et conformes au manifeste.`);
  process.exit(pb ? 1 : 0);
}

const args = process.argv.slice(2);
const iv = args.indexOf("--verifier");
if (iv !== -1) verifier(args[iv + 1]);
else {
  const is = args.indexOf("--sortie");
  const dossier = is !== -1 ? args[is + 1]
    : path.join(__dirname, "..", ".passio", "sauvegardes", new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-"));
  const tout = args.includes("--complete");
  sauvegarder(dossier, args.includes("--avec-telemetrie"),
    tout || args.includes("--avec-comptes"), tout || args.includes("--avec-medias"))
    .catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); });
}
