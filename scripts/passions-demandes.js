#!/usr/bin/env node
/**
 * DEMANDES D'AJOUT DE PASSION — outil d'OPÉRATEUR (lot flat_passions_v1)
 *
 * « Ajouter « X » à mes passions » dépose une ligne dans `passion_requests`.
 * Rien ne la traitait : les demandes s'accumulaient sans destinataire. Cet outil
 * est ce destinataire.
 *
 * ⚠️ IL N'EST PAS, ET NE DOIT JAMAIS DEVENIR, UNE INTERFACE DU NAVIGATEUR.
 * La spécification est explicite : « l'utilisateur n'a aucun droit pour valider
 * ou modifier le référentiel canonique ; validation uniquement via un rôle
 * opérateur sécurisé ; aucune clé privilégiée dans le navigateur ». La migration
 * applique cette règle en base — `passion_requests` n'a NI policy UPDATE NI
 * policy DELETE — donc changer un statut EXIGE `service_role`, qui vit ici, dans
 * un processus local, jamais dans une page.
 *
 * ⚠️ IL N'ÉCRIT PAS LE RÉFÉRENTIEL NON PLUS. Le référentiel est du code versionné
 * (`data/passions/*.js`) dont le JSON et le SQL sont des miroirs générés : une
 * écriture directe en base divergerait de la source au premier
 * `npm run passions:verifier`. L'outil PROPOSE la ligne à coller, vérifie qu'elle
 * n'entre pas en conflit, et ne marque les demandes résolues qu'APRÈS que la
 * passion existe réellement dans la source.
 *
 * ⚠️ VIE PRIVÉE. Une demande est du TEXTE LIBRE tapé par une personne, et la
 * table porte son `user_id`. L'opérateur a besoin du libellé pour décider ; il
 * n'a aucun besoin de savoir QUI l'a demandé. Aucun `user_id` n'est donc affiché
 * ni écrit — seulement des libellés et des DÉCOMPTES.
 *
 *   node scripts/passions-demandes.js lister
 *   node scripts/passions-demandes.js proposer --label "Aquaponie"
 *   node scripts/passions-demandes.js resoudre --label "Aquaponie" --passion jardinage-aquaponie
 *   node scripts/passions-demandes.js refuser  --label "azerty"
 */
"use strict";
const { configAdmin } = require("../tests/e2e/compte-e2e.js");
const { charger, norme, normeIdentite } = require("./referentiel-passions.js");

const TABLE = "passion_requests";

// ── Lecture des arguments ──────────────────────────────────────────────────
const argv = process.argv.slice(2);
const commande = argv[0] || "lister";
function opt(nom) {
  const i = argv.indexOf("--" + nom);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
}

function sortir(msg, code) {
  console.error(msg);
  process.exit(code === undefined ? 1 : code);
}

// ── Accès REST, avec un message utile quand la migration n'est pas passée ───
async function rest(cfg, chemin, init) {
  const r = await fetch(`${cfg.url}/rest/v1/${chemin}`, Object.assign({
    headers: {
      apikey: cfg.cle,
      Authorization: `Bearer ${cfg.cle}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  }, init || {}));
  const texte = await r.text();
  if (!r.ok) {
    // ⚠️ LE CAS LE PLUS PROBABLE AUJOURD'HUI : la migration n'est pas appliquée.
    // Le dire explicitement vaut mieux qu'un 404 brut, qui ferait chercher une
    // panne là où il n'y a qu'une étape non franchie.
    if (r.status === 404 || /schema cache|does not exist/i.test(texte)) {
      sortir(
        `❌ La table « ${TABLE} » n'existe pas encore dans cette base.\n` +
        `   La migration n'a pas été appliquée : migrations/migration_passions_plat.sql\n` +
        `   Tant qu'elle n'est pas passée, aucune demande ne peut être déposée ni traitée.`
      );
    }
    sortir(`❌ ${r.status} sur ${chemin}\n${texte.slice(0, 400)}`);
  }
  return texte ? JSON.parse(texte) : null;
}

// ── Regroupement : une même passion demandée par dix personnes est UNE ligne ─
// C'est le décompte qui décide, pas l'ordre d'arrivée.
function grouper(lignes) {
  const par = new Map();
  for (const l of lignes) {
    const cle = l.normalized_label || norme(l.label || "");
    if (!par.has(cle)) par.set(cle, { cle, label: l.label, n: 0, premiere: l.created_at, derniere: l.created_at });
    const g = par.get(cle);
    g.n++;
    if (l.created_at < g.premiere) g.premiere = l.created_at;
    if (l.created_at > g.derniere) g.derniere = l.created_at;
  }
  return Array.from(par.values()).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

// ── Le référentiel local, indexé pour la détection de doublon ───────────────
// ⚠️ DEUX PLIAGES, ET ILS NE SONT PAS INTERCHANGEABLES. `norme` sert à CHERCHER
// (elle jette la ponctuation, donc « C », « C++ » et « C# » s'y confondent) ;
// `normeIdentite` sert à l'UNICITÉ (elle garde `+`, `#`, `&`). Utiliser `norme`
// pour l'unicité refuserait « C++ » à côté de « C# ».
function indexReferentiel() {
  const ref = charger();
  const parIdentite = new Map();
  const parRecherche = new Map();
  for (const p of ref.passions) {
    parIdentite.set(normeIdentite(p.label), p);
    parRecherche.set(norme(p.label), p);
    for (const a of p.aliases) {
      parIdentite.set(normeIdentite(a), p);
      parRecherche.set(norme(a), p);
    }
  }
  return { ref, parIdentite, parRecherche };
}

// ══════════════════════════════════════════════════════════════════════════
async function lister(cfg) {
  // On ne sélectionne PAS `user_id` : ce qu'on ne rapatrie pas ne peut pas fuir.
  const lignes = await rest(cfg, `${TABLE}?select=label,normalized_label,created_at&status=eq.pending&order=created_at.desc&limit=500`);
  if (!lignes.length) { console.log("Aucune demande en attente."); return; }
  const { parIdentite, parRecherche } = indexReferentiel();
  const groupes = grouper(lignes);
  console.log(`${groupes.length} libellé(s) distinct(s), ${lignes.length} demande(s) en attente.\n`);
  for (const g of groupes) {
    const exact = parIdentite.get(normeIdentite(g.label));
    const proche = exact || parRecherche.get(norme(g.label));
    let note = "";
    if (exact) note = `  ⚠️ EXISTE DÉJÀ → ${exact.id} (« ${exact.label} ») — à résoudre, pas à créer`;
    else if (proche) note = `  ~ proche de ${proche.id} (« ${proche.label} ») — vérifier avant de créer`;
    console.log(`  ${String(g.n).padStart(3)} ×  ${g.label}${note}`);
  }
  console.log(`\nEnsuite : « proposer --label "…" » pour obtenir la ligne à coller,`);
  console.log(`          « resoudre --label "…" --passion <id> » une fois la passion créée,`);
  console.log(`          « refuser  --label "…" » pour une frappe sans objet.`);
}

// ══════════════════════════════════════════════════════════════════════════
async function proposer() {
  const label = opt("label");
  if (!label) sortir('Usage : proposer --label "Aquaponie" [--fichier data/passions/60-maison.js] [--emoji 🌱] [--broader jardinage]');
  const { parIdentite, parRecherche } = indexReferentiel();

  const exact = parIdentite.get(normeIdentite(label));
  if (exact) {
    sortir(`❌ « ${label} » existe déjà : ${exact.id} (« ${exact.label} »).\n` +
           `   Ne pas créer de doublon — résoudre les demandes vers cet identifiant :\n` +
           `   node scripts/passions-demandes.js resoudre --label "${label}" --passion ${exact.id}`);
  }
  const proche = parRecherche.get(norme(label));
  if (proche) {
    console.log(`⚠️  Attention : « ${label} » se replie sur la même recherche que ${proche.id} (« ${proche.label} »).`);
    console.log(`    Si c'est la même chose, en faire un ALIAS plutôt qu'une passion.\n`);
  }

  const base = norme(label).replace(/\s+/g, "-");
  const broader = opt("broader") || "";
  const id = opt("id") || (broader ? broader + "-" + base : base);
  if (parIdentite.has(normeIdentite(id))) sortir(`❌ L'identifiant « ${id} » est déjà pris.`);

  console.log("Ligne à ajouter dans " + (opt("fichier") || "le fichier de domaine adapté (data/passions/*.js)") + " :\n");
  console.log(`  [ ${JSON.stringify(id)}, ${JSON.stringify(label)}, ${JSON.stringify(opt("alias") || "")}, ${broader ? JSON.stringify(broader) : "null"}, { emoji: ${JSON.stringify(opt("emoji") || "✨")}${opt("pop") ? ", pop: " + Number(opt("pop")) : ""} } ],`);
  console.log(`
Puis, dans l'ordre :
  1. npm run passions:valider        (unicité, alias, relations)
  2. npm run passions:construire     (régénère le JSON et la migration)
  3. appliquer la migration en base  (sinon la passion reste NON PUBLIABLE)
  4. node scripts/passions-demandes.js resoudre --label ${JSON.stringify(label)} --passion ${id}`);
}

// ══════════════════════════════════════════════════════════════════════════
async function resoudre(cfg) {
  const label = opt("label");
  const passion = opt("passion");
  if (!label || !passion) sortir('Usage : resoudre --label "Aquaponie" --passion jardinage-aquaponie');

  // ⚠️ ON NE FAIT PAS CONFIANCE À L'IDENTIFIANT TAPÉ. Le marquer résolu vers une
  // passion inexistante ferait rejeter l'écriture par la clé étrangère — ou,
  // pire, refermerait la demande en désignant le vide.
  const { ref } = indexReferentiel();
  if (!ref.passions.some((p) => p.id === passion)) {
    sortir(`❌ « ${passion} » n'est pas dans le référentiel versionné.\n` +
           `   Créer la passion d'abord (voir « proposer »), régénérer, puis revenir ici.`);
  }
  const cle = encodeURIComponent(norme(label));
  const maj = await rest(cfg, `${TABLE}?status=eq.pending&normalized_label=eq.${cle}&select=id`, {
    method: "PATCH",
    body: JSON.stringify({ status: "approved", resolved_passion_id: passion, updated_at: new Date().toISOString() }),
  });
  console.log(`✅ ${(maj || []).length} demande(s) « ${label} » résolue(s) vers ${passion}.`);
}

// ══════════════════════════════════════════════════════════════════════════
async function refuser(cfg) {
  const label = opt("label");
  if (!label) sortir('Usage : refuser --label "azerty"');
  const cle = encodeURIComponent(norme(label));
  const maj = await rest(cfg, `${TABLE}?status=eq.pending&normalized_label=eq.${cle}&select=id`, {
    method: "PATCH",
    body: JSON.stringify({ status: "rejected", updated_at: new Date().toISOString() }),
  });
  console.log(`✅ ${(maj || []).length} demande(s) « ${label} » refusée(s).`);
}

// ══════════════════════════════════════════════════════════════════════════
(async function () {
  if (commande === "proposer") return proposer();      // hors ligne : aucun secret requis

  let cfg;
  try { cfg = configAdmin(); } catch (e) {
    sortir(`❌ Accès opérateur indisponible : ${e && e.message}\n` +
           `   Cette commande exige SUPABASE_SERVICE_ROLE_KEY — jamais dans le navigateur,\n` +
           `   jamais committée. « proposer » fonctionne sans, il est hors ligne.`);
  }
  if (commande === "lister") return lister(cfg);
  if (commande === "resoudre") return resoudre(cfg);
  if (commande === "refuser") return refuser(cfg);
  sortir(`Commande inconnue : ${commande}\nAttendu : lister | proposer | resoudre | refuser`);
})().catch((e) => sortir("❌ " + (e && e.message)));
