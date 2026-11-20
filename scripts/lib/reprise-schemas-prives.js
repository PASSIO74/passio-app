"use strict";

// Portée volontairement bornée : les décisions d'autorisation Rencontres.
// Aucun schéma privé n'est exposé à PostgREST ; lecture par le propriétaire,
// dans une transaction Management API explicitement en lecture seule.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const JE = require("./json-exact.js");
const TABLES = Object.freeze({
  coorganisations_anterieures: ["event_id"], identifiants_retires: ["event_id"],
  accords: ["event_id", "user_id"], inscriptions: ["id"], decisions: ["id"],
});
const SCHEMA = "rencontres_prive", BUDGET = "passio_realtime_budget", PAGE = 500;
// Tables ÉPHÉMÈRES du budget temps réel : jamais exportées, recréées VIDES à la
// restauration. `compteurs` (2026-11-16) est obligatoire dès que le schéma existe ;
// `accuses` (plafond des accusés de lecture, 2026-11-20) l'est dès qu'elle existe.
const BUDGET_TABLES = Object.freeze(["compteurs", "accuses"]);
const budgetSql = (nom) => { if (!BUDGET_TABLES.includes(nom)) throw new Error("Table éphémère hors périmètre"); return ident(BUDGET) + "." + ident(nom); };
const ident = (v) => '"' + v.replace(/"/g, '""') + '"';
const tableSql = (nom) => { if (!Object.hasOwn(TABLES, nom)) throw new Error("Table privée hors périmètre"); return ident(SCHEMA) + "." + ident(nom); };
const empreinte = (v) => crypto.createHash("sha256").update(v).digest("hex");
const fichier = (dossier, nom) => path.join(dossier, "_prive", SCHEMA, nom + ".ndjson");
const SQL_INVENTAIRE = `select current_setting('transaction_read_only') = 'on' as lecture_seule,
  exists(select 1 from pg_namespace where nspname=$1) as rencontres,
  exists(select 1 from pg_namespace where nspname=$2) as budget,
  coalesce((select json_agg(json_build_object('schema', n.nspname, 'nom', c.relname, 'genre', c.relkind,
    'lisible', has_table_privilege(current_user,c.oid,'SELECT') and not row_security_active(c.oid),
    'pk', coalesce((select json_agg(a.attname order by k.ordre) from pg_index i
      cross join lateral unnest(i.indkey) with ordinality k(attnum,ordre)
      join pg_attribute a on a.attrelid=c.oid and a.attnum=k.attnum
      where i.indrelid=c.oid and i.indisprimary),'[]'::json)))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ($1,$2) and c.relkind in ('r','p','f')),'[]'::json) as tables`;

function cible({ url, ref, jeton }) {
  const m = /^https:\/\/([a-z]{20})\.supabase\.co\/?$/.exec(String(url || ""));
  if (!m || !ref || m[1] !== ref) throw new Error("Sauvegarde privée : URL et projet explicite doivent coïncider");
  if (!/^sbp_/.test(String(jeton || ""))) throw new Error("Sauvegarde privée : jeton Management personnel requis");
  return ref;
}

function lecteur({ url, ref, jeton, fetchFn = globalThis.fetch }) {
  cible({ url, ref, jeton });
  return async (query, parameters = []) => {
    let r;
    try {
      r = await fetchFn(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, parameters, read_only: true }),
      });
    } catch { throw new Error("Lecture privée : requête indisponible ou interrompue"); }
    // Les erreurs du serveur peuvent contenir des valeurs : jamais les recopier.
    if (!r.ok) throw new Error(`Lecture privée : Management HTTP ${r.status}`);
    let lignes;
    try { lignes = await r.json(); } catch { throw new Error("Lecture privée : réponse JSON illisible"); }
    if (!Array.isArray(lignes) || lignes.length !== 1 || lignes[0].lecture_seule !== true) {
      throw new Error("Lecture privée : transaction en lecture seule non prouvée");
    }
    return lignes[0];
  };
}

async function inventaire(lire) {
  const i = await lire(SQL_INVENTAIRE, [SCHEMA, BUDGET]);
  if (typeof i.rencontres !== "boolean" || typeof i.budget !== "boolean" || !Array.isArray(i.tables)) throw new Error("Inventaire privé illisible");
  const r = i.tables.filter((t) => t.schema === SCHEMA);
  if (i.tables.some((t) => t.genre !== "r" || ![SCHEMA, BUDGET].includes(t.schema)
    || (t.schema === BUDGET && !BUDGET_TABLES.includes(t.nom)))) throw new Error("Inventaire privé hors périmètre");
  const b = i.tables.filter((t) => t.schema === BUDGET).map((t) => t.nom);
  if (new Set(b).size !== b.length || (i.budget ? !b.includes("compteurs") : b.length)) throw new Error("Inventaire du compteur éphémère incomplet");
  i.budgetTables = BUDGET_TABLES.filter((nom) => b.includes(nom));
  if (i.rencontres && (r.length !== Object.keys(TABLES).length || r.some((t) => !Object.hasOwn(TABLES, t.nom)))) throw new Error("Inventaire Rencontres incomplet ou inconnu");
  if (!i.rencontres && r.length) throw new Error("Inventaire Rencontres incohérent");
  for (const t of r) if (t.lisible !== true || JSON.stringify(t.pk) !== JSON.stringify(TABLES[t.nom])) {
    throw new Error(`Lecture intégrale / clé primaire non prouvée : ${SCHEMA}.${t.nom}`);
  }
  return i;
}

async function page(lire, nom, curseur) {
  const t = tableSql(nom), ordre = TABLES[nom].map(ident).join(",");
  const suite = curseur ? `where ROW(${ordre}) > ROW(${curseur.map((_, i) => "$" + (i + 2)).join(",")})` : "";
  const r = await lire(`select current_setting('transaction_read_only') = 'on' as lecture_seule,
    has_table_privilege(current_user,'${t}','SELECT') and not row_security_active('${t}'::regclass) as lisible,
    (select count(*)::text from ${t}) as total,
    coalesce((select json_agg(row_to_json(p)::text) from
      (select * from ${t} ${suite} order by ${ordre} limit $1) p),'[]'::json) as lignes`, [PAGE, ...(curseur || [])]);
  const total = Number(r.total);
  if (r.lisible !== true || !Number.isSafeInteger(total) || total < 0 || !Array.isArray(r.lignes)
    || r.lignes.length > PAGE || r.lignes.some((l) => typeof l !== "string")) throw new Error(`Lecture intégrale non prouvée : ${SCHEMA}.${nom}`);
  return { total, lignes: r.lignes };
}

async function lignes(lire, nom) {
  const out = []; let total = null, curseur = null;
  for (;;) {
    const p = await page(lire, nom, curseur);
    if (total === null) total = p.total;
    if (p.total !== total || out.length + p.lignes.length > total) throw new Error(`Comptage privé instable : ${nom}`);
    out.push(...p.lignes);
    if (out.length === total) return out;
    if (p.lignes.length === 0) throw new Error(`Pagination privée incomplète : ${nom}`);
    let derniere;
    try { derniere = JSON.parse(p.lignes.at(-1)); } catch { throw new Error(`Curseur privé illisible : ${nom}`); }
    const suivant = TABLES[nom].map((k) => derniere[k]);
    if (suivant.some((v) => typeof v !== "string") || JSON.stringify(suivant) === JSON.stringify(curseur)) throw new Error(`Curseur privé sans progression : ${nom}`);
    curseur = suivant;
  }
}

async function exporter({ dossier, url, ref, jeton, lire = lecteur({ url, ref, jeton }) }) {
  cible({ url, ref, jeton });
  const i = await inventaire(lire);
  const man = { version: 1, projet: ref, schemas: {
    [SCHEMA]: { present: i.rencontres, tables: {} },
    [BUDGET]: { present: i.budget, ephemere: true, restauration: "vide" },
  } };
  for (const nom of i.rencontres ? Object.keys(TABLES) : []) {
    const l = await lignes(lire, nom), texte = l.length ? l.join("\n") + "\n" : "";
    fs.mkdirSync(path.dirname(fichier(dossier, nom)), { recursive: true });
    fs.writeFileSync(fichier(dossier, nom), texte, "utf8");
    man.schemas[SCHEMA].tables[nom] = { pk: TABLES[nom], attendu: l.length, exporte: l.length,
      octets: Buffer.byteLength(texte), sha256: empreinte(texte) };
  }
  const v = valider(dossier, man, { ddl: false });
  if (!v.ok) throw new Error("Archive privée exportée invalide : " + v.erreurs.join(" ; "));
  return man;
}

function valider(dossier, man, { ddl = true } = {}) {
  if (man == null) return { ok: true, historique: true, erreurs: [], notes: ["Archive historique : périmètre privé non attesté"] };
  const erreurs = [], notes = [];
  if (man.version !== 1 || !/^[a-z]{20}$/.test(man.projet || "") || !man.schemas
    || Object.keys(man.schemas).sort().join(",") !== [BUDGET, SCHEMA].sort().join(",")) return { ok: false, erreurs: ["Manifeste privé inconnu ou incomplet"], notes };
  const r = man.schemas[SCHEMA], b = man.schemas[BUDGET];
  if (typeof r?.present !== "boolean" || !r.tables || typeof b?.present !== "boolean" || b.ephemere !== true || b.restauration !== "vide") return { ok: false, erreurs: ["Portée privée ou exclusion éphémère invalide"], notes };
  if (Object.keys(r.tables).sort().join(",") !== (r.present ? Object.keys(TABLES).sort().join(",") : "")) erreurs.push("Inventaire des cinq tables Rencontres incomplet");
  let schema = "";
  if (ddl && (r.present || b.present)) {
    try { schema = fs.readFileSync(path.join(dossier, "schema.sql"), "utf8"); } catch { erreurs.push("DDL privé absent"); }
  }
  for (const nom of Object.keys(TABLES)) {
    if (!r.present || !Object.hasOwn(r.tables, nom)) continue;
    const info = r.tables[nom];
    try {
      const buf = fs.readFileSync(fichier(dossier, nom)), texte = buf.toString("utf8");
      const l = texte.split("\n").filter(Boolean), ids = new Set();
      if (JSON.stringify(info.pk) !== JSON.stringify(TABLES[nom]) || !Number.isSafeInteger(info.exporte)
        || info.exporte < 0 || info.attendu !== info.exporte || info.exporte !== l.length
        || info.octets !== buf.length || info.sha256 !== empreinte(buf)) throw new Error("empreinte, taille ou comptage divergent");
      for (const ligne of l) {
        const o = JSON.parse(ligne);
        if (!o || Array.isArray(o) || typeof o !== "object" || TABLES[nom].some((k) => typeof o[k] !== "string")) throw new Error("ligne / clé invalide");
        const cle = JSON.stringify(TABLES[nom].map((k) => o[k]));
        if (ids.has(cle)) throw new Error("clé dupliquée"); ids.add(cle);
      }
    } catch { erreurs.push(`${SCHEMA}.${nom} : fichier, empreinte ou lignes invalides`); }
    if (ddl && !new RegExp('create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+"?' + SCHEMA + '"?\\s*\\.\\s*"?' + nom + '"?\\s*\\(', "i").test(schema)) erreurs.push(`${SCHEMA}.${nom} : DDL absent`);
  }
  if (ddl && b.present && !/create\s+table(?:\s+if\s+not\s+exists)?\s+"?passio_realtime_budget"?\s*\.\s*"?compteurs"?\s*\(/i.test(schema)) erreurs.push("DDL du compteur éphémère absent");
  notes.push("Compteurs Realtime éphémères : structure restaurée, fenêtres recréées vides");
  return { ok: erreurs.length === 0, historique: false, erreurs, notes };
}

async function restaurer({ dossier, man, lire, ecrire }) {
  const v = valider(dossier, man); if (!v.ok) throw new Error(v.erreurs.join(" ; "));
  const i = await inventaire(lire);
  if (v.historique) {
    if (i.rencontres || i.budget) throw new Error("Archive historique : état privé non couvert, restauration refusée");
    return { ok: true, historique: true };
  }
  const r = man.schemas[SCHEMA];
  if (r.present !== i.rencontres || man.schemas[BUDGET].present !== i.budget) throw new Error("Schémas privés de la cible différents de l'archive");
  for (const nom of r.present ? Object.keys(TABLES) : []) {
    const texte = fs.readFileSync(fichier(dossier, nom), "utf8").trimEnd();
    const l = texte ? texte.split("\n") : [];
    for (let debut = 0; debut < l.length; debut += PAGE) {
      await ecrire(`insert into ${tableSql(nom)} select * from json_populate_recordset(null::${tableSql(nom)}, $1::json)
        on conflict (${TABLES[nom].map(ident).join(",")}) do nothing`, ["[" + l.slice(debut, debut + PAGE).join(",") + "]"]);
    }
  }
  for (const nom of i.budgetTables) await ecrire("truncate table " + budgetSql(nom));
  return { ok: true, historique: false };
}

async function verifier({ dossier, man, lire, comparer }) {
  const v = valider(dossier, man);
  if (!v.ok) return { ok: false, erreurs: v.erreurs };
  const i = await inventaire(lire), erreurs = [], tables = [];
  if (v.historique) return { ok: !i.rencontres && !i.budget, historique: true, notes: v.notes,
    erreurs: i.rencontres || i.budget ? ["Archive historique : schémas privés de la cible non couverts"] : [] };
  if (i.rencontres !== man.schemas[SCHEMA].present || i.budget !== man.schemas[BUDGET].present) erreurs.push("Schémas privés différents du manifeste");
  if (i.rencontres && man.schemas[SCHEMA].present) for (const nom of Object.keys(TABLES)) {
    const texte = fs.readFileSync(fichier(dossier, nom), "utf8").trimEnd();
    const archive = JE.lireJsonExact("[" + (texte ? texte.split("\n").join(",") : "") + "]");
    const cible = JE.lireJsonExact("[" + (await lignes(lire, nom)).join(",") + "]");
    const c = comparer(archive, cible, TABLES[nom].join(","));
    const ok = !c.manquantes.length && !c.divergentes.length && !c.enTrop.length;
    tables.push({ table: SCHEMA + "." + nom, attendu: archive.length, obtenu: cible.length, ok });
    if (!ok) erreurs.push(`${SCHEMA}.${nom} : contenu différent`);
  }
  for (const nom of i.budgetTables) {
    const q = "passio_realtime_budget." + nom;
    const b = await lire(`select current_setting('transaction_read_only') = 'on' as lecture_seule,
      has_table_privilege(current_user,'${q}','SELECT')
        and not row_security_active('${q}'::regclass) as lisible,
      (select count(*)::text from ${q}) as total`);
    if (b.lisible !== true || b.total !== "0") erreurs.push(`Table éphémère ${nom} non relue vide`);
  }
  return { ok: erreurs.length === 0, historique: false, tables, erreurs, notes: v.notes };
}

module.exports = { TABLES, SCHEMA, BUDGET, BUDGET_TABLES, PAGE, SQL_INVENTAIRE, cible, lecteur, inventaire, exporter, valider, restaurer, verifier };
