#!/usr/bin/env node
/**
 * SIGNALEMENTS — la file que personne ne lisait (2026-09-10)
 *
 * Défaut mesuré par l'audit go/no-go : un signalement n'arrivait NULLE PART.
 * La table `reports` porte six colonnes — id, reporter_id, target_type,
 * target_id, reason, created_at — et AUCUN statut : il était structurellement
 * impossible de savoir si un signalement avait été vu. Le seul outil du dépôt,
 * `passions-moderation.js`, ne lit que `target_type = 'passion'` : les
 * signalements de PERSONNES, de publications, de commentaires et de rencontres
 * n'avaient aucun lecteur. Le Centre de pilotage ne surveille pas la table.
 * Aucune alerte, aucun e-mail.
 *
 * Concrètement, dans une application qui organise des RENCONTRES PHYSIQUES :
 * quelqu'un signale un comportement inquiétant, lit « notre équipe va
 * vérifier », et personne n'est prévenu. Les deux signalements de production
 * avaient 21 et 74 jours quand on les a trouvés.
 *
 * Cet outil est le destinataire manquant. Il ne prétend pas être un back-office :
 * il rend la file LISIBLE, et c'est déjà tout ce qui manquait.
 *
 * ⚠️ LE STATUT VIT EN BASE DEPUIS LE 2026-09-11 (`reports.status`, migration
 * `migration_ouverture_publique_2026-09-11.sql`) : `traiter` le pose, `lister`
 * ne montre que les signalements OUVERTS, et `.github/workflows/moderation-alerte.yml`
 * ouvre une issue quand l'un d'eux attend plus de 24 h. Le journal LOCAL
 * (`.passio/moderation-vus.json`, non versionné) reste un pense-bête d'opérateur
 * pour la fenêtre AVANT la migration : sans colonne, l'outil se comporte comme
 * avant, et le dit.
 *
 * ⚠️ VIE PRIVÉE. `reporter_id` est une identité. On affiche COMBIEN de personnes
 * distinctes ont signalé une même cible, jamais QUI — même règle que
 * `passions-moderation.js`. La cible, elle, est montrée : on ne peut pas modérer
 * ce qu'on ne voit pas.
 *
 * ⚠️ CANAL ② d'ADR-012 : écriture/lecture de DONNÉES par PostgREST avec
 * `service_role`, dans un processus local. Jamais dans le navigateur : `reports`
 * n'est lisible par personne côté client (aucune policy SELECT).
 *
 *   node scripts/moderation.js                    (= lister)
 *   node scripts/moderation.js lister --tous      inclut les signalements déjà vus
 *   node scripts/moderation.js voir --id r_xxx    le détail, avec le contenu visé
 *   node scripts/moderation.js vu --id r_xxx      marque « vu » dans le journal local
 *   node scripts/moderation.js traiter --id r_xxx --statut handled|dismissed [--note "…"]
 *                                                 ferme le signalement EN BASE (statut serveur),
 *                                                 journalise la décision, prévient le signalant
 *   node scripts/moderation.js retirer --id r_xxx [--note "…"]
 *                                                 RETIRE le contenu visé (publication, commentaire,
 *                                                 story, message supprimés ; rencontre annulée),
 *                                                 ferme le signalement, journalise, prévient
 *   node scripts/moderation.js compte             un seul nombre, pour un contrôle rapide
 *
 * ⚠️ RETIRER SANS SQL MANUEL (MOD-01, 2026-09-14). Jusqu'ici « retirer un
 * contenu » renvoyait à l'éditeur SQL : un modérateur qui n'a pas la main sur
 * la base ne pouvait rien faire. `retirer` exécute le plan de
 * `scripts/lib/moderation-decision.js` (pur, verrouillé en unitaire) avec
 * `service_role`, écrit le journal `moderation_actions` (table sans policy
 * client, migration_moderation_journal_2026-09-14.sql) et prévient le
 * signalant par une notification `moderation` — la décision motivée que le
 * DSA (art. 16-17) demande. Un compte ne se suspend pas ici (aucune colonne) :
 * l'outil le dit au lieu de faire semblant.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { configAdmin } = require("../tests/e2e/compte-e2e.js");
const { lireToutesLesPages } = require("./lib/pagination-rest.js");
const { planRetrait, planSuspension, planLevee, notificationPourCible, texteDecision, notificationPourSignalant, statutApresAction, verdictRelectureSuspension } = require("./lib/moderation-decision.js");

const argv = process.argv.slice(2);
const commande = argv[0] && !argv[0].startsWith("--") ? argv[0] : "lister";
const TOUS = argv.includes("--tous");

function opt(nom) {
  const i = argv.indexOf("--" + nom);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
}
function sortir(msg, code) {
  console.error(msg);
  process.exit(code === undefined ? 1 : code);
}
function abrege(uuid) {
  const s = String(uuid || "");
  return s.length > 8 ? s.slice(0, 8) + "…" : (s || "—");
}
function age(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms)) return "?";
  const j = Math.floor(ms / 86400000);
  if (j >= 1) return j + " j";
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return h + " h";
  return Math.max(1, Math.floor(ms / 60000)) + " min";
}

// ── Journal LOCAL des signalements déjà regardés ───────────────────────────
// ⚠️ Ce n'est PAS un statut serveur. Voir l'avertissement en tête de fichier.
const JOURNAL = path.join(__dirname, "..", ".passio", "moderation-vus.json");
function lireVus() {
  try { return JSON.parse(fs.readFileSync(JOURNAL, "utf8")); } catch (e) { return {}; }
}
function ecrireVus(v) {
  try {
    fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
    fs.writeFileSync(JOURNAL, JSON.stringify(v, null, 2));
  } catch (e) {
    console.error("⚠️  journal local non écrit : " + (e && e.message));
  }
}

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
  if (!r.ok) sortir(`❌ ${r.status} sur ${chemin}\n${texte.slice(0, 400)}`);
  return texte ? JSON.parse(texte) : null;
}

const LIBELLE = {
  user: "compte", post: "publication", comment: "commentaire",
  event: "rencontre", passion: "passion", message: "message",
};
function typeLisible(t) { return LIBELLE[t] || String(t || "?"); }

// Regroupe par cible : trois personnes qui signalent le même compte, c'est UN
// sujet à traiter, pas trois. Et le nombre de signaleurs distincts est le seul
// chiffre qui compte pour décider.
function grouper(lignes) {
  const par = new Map();
  for (const l of lignes) {
    const cle = l.target_type + " " + l.target_id;
    if (!par.has(cle)) {
      par.set(cle, {
        type: l.target_type, cible: l.target_id,
        ids: [], signaleurs: new Set(), motifs: [], dernier: l.created_at, premier: l.created_at,
      });
    }
    const g = par.get(cle);
    g.ids.push(l.id);
    if (l.reporter_id) g.signaleurs.add(String(l.reporter_id));
    const m = String(l.reason || "").trim();
    if (m) g.motifs.push(m);
    if (String(l.created_at) > g.dernier) g.dernier = l.created_at;
    if (String(l.created_at) < g.premier) g.premier = l.created_at;
  }
  return [...par.values()]
    .map((g) => Object.assign(g, { signaleurs: g.signaleurs.size }))
    // Le plus de signaleurs distincts d'abord, puis le plus ancien non traité :
    // un signalement qui attend depuis 74 jours est un reproche à lui tout seul.
    .sort((a, b) => (b.signaleurs - a.signaleurs) || (a.premier < b.premier ? -1 : 1));
}

// Avec le statut quand la colonne existe ; sans (400) on prend tout, comme avant,
// et `lister` le dit. Une seule sonde par processus.
let _sansStatut = false;
let _listeIncomplete = false;
// ⚠️ LE FILTRE EST SERVEUR ET LA LECTURE EST PAGINÉE (ASTRA-03, 2026-09-14).
// L'ancienne lecture prenait les 500 signalements les plus récents PUIS
// filtrait les ouverts en mémoire : dès 501 lignes en base, les ouverts les
// plus anciens — ceux qui attendent depuis le plus longtemps — sortaient de la
// fenêtre et disparaissaient de la liste, sans un mot. Désormais `status=eq.open`
// part dans la requête (sauf `--tous`), et on lit page après page tant qu'une
// page est pleine ; une lecture bornée se DIT (`_listeIncomplete`).
const COLS_AVEC_STATUT = "id,reporter_id,target_type,target_id,reason,created_at,status,handled_at,handled_note";
const COLS_SANS_STATUT = "id,reporter_id,target_type,target_id,reason,created_at";
function urlReports(cfg, { avecStatut, ouvertsSeulement, offset, taille }) {
  return `${cfg.url}/rest/v1/reports?select=${avecStatut ? COLS_AVEC_STATUT : COLS_SANS_STATUT}`
    + (avecStatut && ouvertsSeulement ? "&status=eq.open" : "")
    + `&order=created_at.desc&offset=${offset}&limit=${taille}`;
}
async function charger(cfg) {
  const entetes = { headers: { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}` } };
  if (!_sansStatut) {
    // Sonde : la première page dit si la colonne existe.
    const r = await fetch(urlReports(cfg, { avecStatut: true, ouvertsSeulement: !TOUS, offset: 0, taille: 1 }), entetes);
    if (!r.ok && r.status !== 400) sortir(`❌ ${r.status} sur reports\n${(await r.text()).slice(0, 400)}`);
    if (!r.ok) {
      _sansStatut = true;
      console.log("ℹ️  La base n'a pas encore de colonne `status` (migration du 2026-09-11 non appliquée) : tout est considéré ouvert.\n");
    }
  }
  const lirePage = async (offset, taille) => {
    const r = await fetch(urlReports(cfg, { avecStatut: !_sansStatut, ouvertsSeulement: !TOUS, offset, taille }), entetes);
    if (!r.ok) sortir(`❌ ${r.status} sur reports (page ${offset / taille + 1})\n${(await r.text()).slice(0, 400)}`);
    return await r.json();
  };
  const { lignes, complet } = await lireToutesLesPages(lirePage, { taille: 500, pagesMax: 20 });
  _listeIncomplete = !complet;
  if (!complet) console.log("⚠️  Plus de 10 000 signalements : la liste ci-dessous est TRONQUÉE aux 10 000 plus récents.\n");
  return lignes;
}
const estOuvert = (l) => _sansStatut || l.status === undefined || l.status === null || l.status === "open";

async function lister(cfg) {
  const toutes = await charger(cfg);
  const lignes = TOUS ? toutes : toutes.filter(estOuvert);
  const vus = lireVus();
  const groupes = grouper(lignes).filter((g) => TOUS || g.ids.some((id) => !vus[id]));

  if (!groupes.length) {
    console.log(lignes.length
      ? `✅ Rien de nouveau. ${lignes.length} signalement(s) au total, tous déjà regardés.`
      : "✅ Aucun signalement.");
    console.log("   (« --tous » pour revoir la file entière.)");
    return;
  }

  console.log(`\n🚩 ${groupes.length} sujet(s) à regarder — ${lignes.length} signalement(s) au total\n`);
  for (const g of groupes) {
    const neufs = g.ids.filter((id) => !vus[id]).length;
    console.log(`  ${typeLisible(g.type).toUpperCase()} ${g.cible}`);
    console.log(`    ${g.signaleurs} personne(s) distincte(s) · ${g.ids.length} signalement(s)`
      + (neufs && neufs !== g.ids.length ? ` (dont ${neufs} nouveau(x))` : "")
      + ` · le plus ancien : il y a ${age(g.premier)}`);
    if (g.motifs.length) {
      for (const m of g.motifs.slice(0, 3)) console.log(`    « ${m.slice(0, 160)} »`);
    } else {
      // Vrai des 2 signalements de production : les portes ne demandaient pas
      // de motif avant le 2026-09-10.
      console.log(`    (aucun motif écrit — signalement antérieur au 2026-09-10)`);
    }
    console.log(`    → node scripts/moderation.js voir --id ${g.ids[0]}`);
    console.log("");
  }
  console.log(_sansStatut
    ? `Marquer comme regardé (journal LOCAL) : node scripts/moderation.js vu --id <id>\n`
    : `Fermer en base : node scripts/moderation.js traiter --id <id> --statut handled|dismissed --note "…"\n`);
}

// Pose le statut EN BASE (PATCH, service_role). Le client, lui, ne peut ni lire ni
// écrire cette colonne : `trg_reports_statut_initial` force 'open' à l'insertion.
async function traiter(cfg) {
  const id = opt("id"), statut = opt("statut"), note = opt("note");
  if (!id) sortir("Il faut --id <identifiant de signalement>");
  if (!["handled", "dismissed", "open"].includes(statut || "")) sortir("Il faut --statut handled | dismissed | open");
  const corps = { status: statut, handled_at: statut === "open" ? null : new Date().toISOString(), handled_note: note || null };
  const r = await fetch(`${cfg.url}/rest/v1/reports?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(corps),
  });
  const texte = await r.text();
  if (r.status === 400 && /status|handled/.test(texte)) sortir("❌ La colonne `status` n'existe pas encore : appliquer migrations/migration_ouverture_publique_2026-09-11.sql (canal ③).");
  if (!r.ok) sortir(`❌ ${r.status} sur reports\n${texte.slice(0, 400)}`);
  const lignes = texte ? JSON.parse(texte) : [];
  // ⚠️ 0 ligne = l'identifiant n'existe pas ; un PATCH « réussi » sans ligne n'a rien fait.
  if (!lignes.length) sortir(`❌ Aucun signalement ${id} — rien n'a été modifié.`);
  console.log(`✅ ${id} → ${statut}${note ? ` (« ${note.slice(0, 80)} »)` : ""} — statut SERVEUR, visible de tout opérateur.`);
  if (statut !== "open") await journaliserEtPrevenir(cfg, lignes[0], statut === "dismissed" ? "rejet" : "note", note);
}

// Écrit la trace de la décision et prévient le signalant. Ni l'un ni l'autre ne
// conditionne le statut déjà posé : un échec ici est DIT, pas caché.
async function journaliserEtPrevenir(cfg, report, action, note) {
  const entetes = { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}`, "Content-Type": "application/json", Prefer: "return=minimal" };
  const j = await fetch(`${cfg.url}/rest/v1/moderation_actions`, { method: "POST", headers: entetes,
    body: JSON.stringify({ report_id: report.id, action, target_type: report.target_type || null, target_id: report.target_id || null, note: note ? String(note).slice(0, 500) : null }) });
  if (j.ok) console.log(`   📒 journal : ${action} consigné.`);
  else if (j.status === 404 || j.status === 400) console.log("   ⚠️  journal absent : appliquer migrations/migration_moderation_journal_2026-09-14.sql — la décision n'est PAS consignée.");
  else console.log(`   ⚠️  journal : ${j.status} ${(await j.text()).slice(0, 200)}`);
  const notif = notificationPourSignalant(report, action, note);
  if (!notif) { console.log("   ℹ️  signalant sans compte : personne à prévenir."); return; }
  const n = await fetch(`${cfg.url}/rest/v1/notifications`, { method: "POST", headers: { ...entetes, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(notif) });
  if (n.ok) console.log(`   🔔 signalant prévenu : « ${notif.content} »`);
  else console.log(`   ⚠️  signalant NON prévenu : ${n.status} ${(await n.text()).slice(0, 200)}`);
}

// RETIRE le contenu visé, puis ferme, journalise et prévient — sans SQL manuel.
async function retirer(cfg) {
  const id = opt("id"), note = opt("note");
  if (!id) sortir("Il faut --id <identifiant de signalement>");
  const l = (await rest(cfg, `reports?id=eq.${encodeURIComponent(id)}&select=*`) || [])[0];
  if (!l) sortir(`❌ Signalement introuvable : ${id}`);
  const { plan, raison } = planRetrait(l.target_type, l.target_id);
  if (!plan) sortir(`❌ Impossible de retirer cette cible (${typeLisible(l.target_type)}) : ${raison}`);
  const corps = plan.corps ? JSON.stringify(Object.fromEntries(Object.entries(plan.corps).map(([k, v]) => [k, v === "__now__" ? new Date().toISOString() : v]))) : undefined;
  const r = await fetch(`${cfg.url}/rest/v1/${plan.chemin}`, { method: plan.methode, headers: { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: corps });
  const texte = await r.text();
  if (!r.ok) sortir(`❌ ${r.status} en retirant (${plan.methode} ${plan.chemin})\n${texte.slice(0, 400)}`);
  const touchees = texte ? JSON.parse(texte) : [];
  // ⚠️ 0 ligne = la cible n'existe plus : rien n'a été retiré, on le dit, et on
  // ferme quand même (il n'y a plus rien à modérer).
  console.log(touchees.length ? `✅ ${plan.libelle} (${l.target_id}).` : `ℹ️  Cible déjà absente (${l.target_id}) : rien à retirer.`);
  const f = await fetch(`${cfg.url}/rest/v1/reports?id=eq.${encodeURIComponent(id)}`, { method: "PATCH",
    headers: { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ status: statutApresAction("retrait"), handled_at: new Date().toISOString(), handled_note: note || plan.libelle }) });
  if (!f.ok) sortir(`❌ ${f.status} en fermant le signalement\n${(await f.text()).slice(0, 400)}`);
  console.log(`✅ ${id} → handled.`);
  // Les autres signalements OUVERTS de la même cible sont fermés avec : la cible n'est plus là.
  const freres = (await rest(cfg, `reports?target_type=eq.${encodeURIComponent(l.target_type)}&target_id=eq.${encodeURIComponent(l.target_id)}&status=eq.open&select=*`) || []).filter((x) => x.id !== id);
  for (const fr of freres) {
    await fetch(`${cfg.url}/rest/v1/reports?id=eq.${encodeURIComponent(fr.id)}`, { method: "PATCH",
      headers: { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: "handled", handled_at: new Date().toISOString(), handled_note: "retrait (via " + id + ")" }) });
    await journaliserEtPrevenir(cfg, fr, "retrait", note);
  }
  if (freres.length) console.log(`✅ ${freres.length} autre(s) signalement(s) de la même cible fermé(s).`);
  await journaliserEtPrevenir(cfg, l, "retrait", note);
}

// SUSPEND un compte (MOD-01, 2026-09-15) : `--id <signalement de type user>`
// ou `--uid <compte>`, `--jours N`, `--note`. GoTrue pose `banned_until` ;
// le signalement est fermé, la décision journalisée (`suspension`), le
// signalant ET la personne suspendue prévenus (DSA art. 16 et 17).
async function suspendre(cfg) {
  const id = opt("id"), note = opt("note"), jours = opt("jours");
  let uid = opt("uid"), report = null;
  if (id) {
    report = (await rest(cfg, `reports?id=eq.${encodeURIComponent(id)}&select=*`) || [])[0];
    if (!report) sortir(`❌ Signalement introuvable : ${id}`);
    if (report.target_type !== "user") sortir(`❌ Ce signalement vise ${typeLisible(report.target_type)}, pas un compte : \`retirer\` ou \`traiter\`.`);
    uid = uid || report.target_id;
  }
  if (!uid) sortir("Il faut --uid <compte> ou --id <signalement de type user>, et --jours N");
  const { plan, raison } = planSuspension(uid, jours);
  if (!plan) sortir("❌ " + raison);
  const r = await fetch(`${cfg.url}/${plan.chemin}`, { method: plan.methode, headers: { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}`, "Content-Type": "application/json" }, body: JSON.stringify(plan.corps) });
  const corps = await r.text();
  if (!r.ok) sortir(`❌ ${r.status} en suspendant (${plan.methode} ${plan.chemin})\n${corps.slice(0, 400)}`);
  let jusqua = null; try { jusqua = JSON.parse(corps).banned_until || null; } catch (e) {}
  // ⚠️ On RELIT : le verdict est ce que GoTrue a écrit, pas ce qu'on a demandé.
  // Ce chemin-ci échouait déjà FERMÉ (`if (!banni) sortir`) — mais par DIRECTION,
  // pas par contrôle : il ne lisait ni `r.ok` ni l'identité du compte relu.
  // Les deux gestes partagent désormais la même décision (ASTRA-38).
  const vs = verdictRelectureSuspension(await relireCompte(cfg, uid), uid, "suspendu", new Date());
  if (!vs.verifie) sortir(`❌ MODIFICATION NON VÉRIFIÉE — ${vs.motif}.\n   Ne pas annoncer une suspension qu'on n'a pas constatée.`);
  if (!vs.conforme) sortir(`❌ Relecture : ${vs.motif}.`);
  const relu = { banned_until: vs.jusqu };
  console.log(`✅ ${plan.libelle} (${abrege(uid)}), jusqu'au ${relu.banned_until}.`);
  const H = { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}`, "Content-Type": "application/json", Prefer: "return=minimal" };
  const j = await fetch(`${cfg.url}/rest/v1/moderation_actions`, { method: "POST", headers: H, body: JSON.stringify({ report_id: report ? report.id : null, action: "suspension", target_type: "user", target_id: uid, note: (note ? String(note) + " · " : "") + plan.jours + " j, jusqu'au " + relu.banned_until }) });
  if (j.ok) console.log("   📒 journal : suspension consignée.");
  else console.log(`   ⚠️  journal : ${j.status} ${(await j.text()).slice(0, 200)} — appliquer migrations/migration_moderation_suspension_2026-09-15.sql`);
  const nc = notificationPourCible(uid, plan.jours, note);
  const n = await fetch(`${cfg.url}/rest/v1/notifications`, { method: "POST", headers: H, body: JSON.stringify(nc) });
  if (n.ok) console.log(`   🔔 la personne suspendue est prévenue : « ${nc.content} »`);
  else console.log(`   ⚠️  personne suspendue NON prévenue : ${n.status} ${(await n.text()).slice(0, 200)}`);
  if (report) {
    const f = await fetch(`${cfg.url}/rest/v1/reports?id=eq.${encodeURIComponent(report.id)}`, { method: "PATCH", headers: H,
      body: JSON.stringify({ status: statutApresAction("suspension"), handled_at: new Date().toISOString(), handled_note: note || plan.libelle }) });
    if (!f.ok) sortir(`❌ ${f.status} en fermant le signalement\n${(await f.text()).slice(0, 400)}`);
    console.log(`✅ ${report.id} → handled.`);
    const notif = notificationPourSignalant(report, "suspension", note);
    if (notif) {
      const ns = await fetch(`${cfg.url}/rest/v1/notifications`, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(notif) });
      console.log(ns.ok ? `   🔔 signalant prévenu : « ${notif.content} »` : `   ⚠️  signalant NON prévenu : ${ns.status}`);
    }
  }
}

// ⚠️ ASTRA-38 — RELIRE, OU DIRE QU'ON N'A PAS PU. Cette fonction ne masque rien :
// une panne réseau, un refus HTTP et un corps illisible sont TROIS faits
// distincts, et aucun n'est un succès. La décision est dans
// `scripts/lib/moderation-decision.js` (`verdictRelectureSuspension`).
async function relireCompte(cfg, uid) {
  try {
    const r = await fetch(`${cfg.url}/auth/v1/admin/users/${uid}`, { headers: { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}` } });
    let corps = null; try { corps = JSON.parse(await r.text()); } catch (e) { corps = undefined; }
    return { ok: r.ok, status: r.status, corps };
  } catch (e) { return { reseau: e && e.message ? e.message : String(e) }; }
}

// LÈVE une suspension avant terme : `--uid <compte>` [--note].
async function lever(cfg) {
  const uid = opt("uid"), note = opt("note");
  const { plan, raison } = planLevee(uid);
  if (!plan) sortir("❌ " + raison);
  const r = await fetch(`${cfg.url}/${plan.chemin}`, { method: plan.methode, headers: { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}`, "Content-Type": "application/json" }, body: JSON.stringify(plan.corps) });
  if (!r.ok) sortir(`❌ ${r.status} en levant la suspension\n${(await r.text()).slice(0, 400)}`);
  const v = verdictRelectureSuspension(await relireCompte(cfg, uid), uid, "levee", new Date());
  // ⚠️ AVANT : tout ce qui n'était pas « encore suspendu » valait « levée ». Une
  // panne réseau, un 403 et un corps d'erreur JSON annonçaient donc tous trois
  // un succès. Désormais : non vérifié ≠ levé, et ça sort en erreur.
  if (!v.verifie) sortir(`❌ MODIFICATION NON VÉRIFIÉE — ${v.motif}.\n   Le PUT a été accepté, mais l'état du compte ${abrege(uid)} n'a pas pu être relu : ne pas annoncer une levée qu'on n'a pas constatée.`);
  if (!v.conforme) sortir(`❌ Relecture : ${v.motif}.`);
  console.log(`✅ ${plan.libelle} (${abrege(uid)}) — relu : aucune suspension active.`);
  // ⚠️ LE JOURNAL DIT LE RÉSULTAT RÉEL, pas l'intention : il n'est écrit que
  // sur un verdict CONSTATÉ (les deux sorties ci-dessus l'ont déjà empêché).
  const j = await fetch(`${cfg.url}/rest/v1/moderation_actions`, { method: "POST", headers: { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ action: "levee", target_type: "user", target_id: uid, note: (note ? String(note).slice(0, 460) + " · " : "") + "levée relue et constatée" }) });
  console.log(j.ok ? "   📒 journal : levée consignée." : `   ⚠️  journal : ${j.status} ${(await j.text()).slice(0, 200)}`);
}

// Va chercher CE QUI EST VISÉ, pas seulement l'identifiant : modérer sur un
// identifiant nu, c'est décider à l'aveugle.
async function voir(cfg) {
  const id = opt("id");
  if (!id) sortir("Il faut --id <identifiant de signalement>");
  const l = (await rest(cfg, `reports?id=eq.${encodeURIComponent(id)}&select=*`) || [])[0];
  if (!l) sortir(`❌ Signalement introuvable : ${id}`);

  console.log(`\n🚩 Signalement ${l.id}`);
  console.log(`   Type    : ${typeLisible(l.target_type)}`);
  console.log(`   Cible   : ${l.target_id}`);
  console.log(`   Motif   : ${String(l.reason || "").trim() || "(aucun)"}`);
  console.log(`   Envoyé  : il y a ${age(l.created_at)} (${l.created_at})`);
  if (l.status !== undefined) console.log(`   Statut  : ${l.status}${l.handled_at ? ` (le ${l.handled_at}${l.handled_note ? ` — ${l.handled_note}` : ""})` : ""}`);
  console.log(`   Par     : ${abrege(l.reporter_id)}  (identité volontairement abrégée)\n`);

  const t = l.target_type;
  const cible = encodeURIComponent(l.target_id);
  try {
    if (t === "user") {
      const p = (await rest(cfg, `profiles?id=eq.${cible}&select=id,username,bio,passions,created_at`) || [])[0];
      if (p) {
        console.log(`   ── Le compte visé ──`);
        console.log(`   Pseudo : ${p.username || "(sans nom)"}`);
        console.log(`   Bio    : ${String(p.bio || "").slice(0, 300) || "(vide)"}`);
        const n = (await rest(cfg, `posts?author_id=eq.${cible}&select=id&limit=200`) || []).length;
        console.log(`   ${n} publication(s)\n`);
      } else console.log(`   (compte introuvable — déjà supprimé ?)\n`);
    } else if (t === "post") {
      const p = (await rest(cfg, `posts?id=eq.${cible}&select=id,author_id,content,passion_id,created_at`) || [])[0];
      if (p) {
        console.log(`   ── La publication visée ──`);
        console.log(`   Auteur  : ${abrege(p.author_id)}`);
        console.log(`   Passion : ${p.passion_id || "—"}`);
        console.log(`   Texte   : ${String(p.content || "").slice(0, 600)}\n`);
      } else console.log(`   (publication introuvable — déjà supprimée ?)\n`);
    } else if (t === "comment") {
      // ⚠️ DEUX TABLES, DEUX COLONNES (mesuré le 2026-09-12) : un identifiant
      // `ec_…` est un commentaire de RENCONTRE (event_comments, colonne `text`),
      // les autres sont des commentaires de publication (post_comments, colonne
      // `content`). La première version interrogeait post_comments.text : 400
      // sur le seul signalement de commentaire en base, à l'instant où l'outil
      // devait servir.
      const surRencontre = String(l.target_id).startsWith("ec_");
      const c = surRencontre
        ? (await rest(cfg, `event_comments?id=eq.${cible}&select=id,author_id,author_name,text,event_id,created_at`) || [])[0]
        : (await rest(cfg, `post_comments?id=eq.${cible}&select=id,author_id,content,post_id,created_at`) || [])[0];
      if (c) {
        console.log(`   ── Le commentaire visé (${surRencontre ? "sur une rencontre" : "sous une publication"}) ──`);
        console.log(`   Auteur : ${abrege(c.author_id)}`);
        console.log(`   Texte  : ${String(surRencontre ? c.text : c.content || "").slice(0, 600)}\n`);
      } else console.log(`   (commentaire introuvable — déjà supprimé ?)\n`);
    } else if (t === "event") {
      const e = (await rest(cfg, `events?id=eq.${cible}&select=id,title,description,author_id,city,date_at`) || [])[0];
      if (e) {
        console.log(`   ── La rencontre visée ──`);
        console.log(`   Titre : ${e.title || "—"}`);
        console.log(`   Ville : ${e.city || "—"}   Date : ${e.date_at || "—"}`);
        console.log(`   Texte : ${String(e.description || "").slice(0, 600)}\n`);
      } else console.log(`   (rencontre introuvable)\n`);
    } else if (t === "passion") {
      console.log(`   → Cette file-là a son outil : node scripts/passions-moderation.js signalees\n`);
    }
  } catch (e) {
    console.log(`   (contenu visé illisible : ${(e && e.message) || "?"})\n`);
  }

  console.log(`   Ce que tu peux faire :`);
  console.log(`     · RETIRER le contenu (et fermer, journaliser, prévenir) : node scripts/moderation.js retirer --id ${l.id} --note "…"`);
  console.log(`     · rejeter (aucune infraction) : node scripts/moderation.js traiter --id ${l.id} --statut dismissed --note "…"`);
  console.log(`     · fermer sans retrait : node scripts/moderation.js traiter --id ${l.id} --statut handled --note "…"`);
  console.log(`     · (avant la migration) le marquer comme regardé : node scripts/moderation.js vu --id ${l.id}\n`);
}

function vu() {
  const id = opt("id");
  if (!id) sortir("Il faut --id <identifiant de signalement>");
  const vus = lireVus();
  vus[id] = new Date().toISOString();
  ecrireVus(vus);
  console.log(`✅ ${id} marqué comme regardé (journal LOCAL, pas un statut serveur).`);
}

async function compter(cfg) {
  const toutes = await charger(cfg);
  const lignes = toutes.filter(estOuvert);
  const vus = lireVus();
  const neufs = lignes.filter((l) => !vus[l.id]).length;
  console.log(`${lignes.length} signalement(s) ouvert(s) sur ${toutes.length}, dont ${neufs} non regardé(s) ici.`);
  // Code de sortie utilisable dans un contrôle quotidien.
  process.exit(neufs ? 2 : 0);
}

// ══════════════════════════════════════════════════════════════════════════
(async function () {
  // ⚠️ `configAdmin()` REND `null`, elle ne lève pas : sans ce contrôle, l'outil
  // meurt dix lignes plus loin sur « Cannot read properties of null », un
  // message qui n'apprend rien à qui vient d'oublier sa clé.
  if (commande === "vu") return vu();
  let cfg = null;
  try { cfg = configAdmin(); } catch (e) { cfg = null; }
  if (!cfg || !cfg.url || !cfg.cle) {
    sortir(`❌ Accès opérateur indisponible.\n` +
           `   Ces commandes exigent SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY\n` +
           `   (dashboard/.env en local) — jamais dans le navigateur, jamais committées.`);
  }
  if (commande === "lister") return lister(cfg);
  if (commande === "voir") return voir(cfg);
  if (commande === "compte") return compter(cfg);
  if (commande === "traiter") return traiter(cfg);
  if (commande === "retirer") return retirer(cfg);
  if (commande === "suspendre") return suspendre(cfg);
  if (commande === "lever") return lever(cfg);
  sortir(`Commande inconnue : ${commande}\nAttendu : lister | voir | vu | traiter | retirer | suspendre | lever | compte`);
})().catch((e) => sortir("❌ " + (e && e.message)));
