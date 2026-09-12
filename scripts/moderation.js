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
 *                                                 ferme le signalement EN BASE (statut serveur)
 *   node scripts/moderation.js compte             un seul nombre, pour un contrôle rapide
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { configAdmin } = require("../tests/e2e/compte-e2e.js");

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
async function charger(cfg) {
  if (!_sansStatut) {
    const r = await fetch(`${cfg.url}/rest/v1/reports?select=id,reporter_id,target_type,target_id,reason,created_at,status,handled_at,handled_note&order=created_at.desc&limit=500`,
      { headers: { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}` } });
    if (r.ok) return await r.json();
    if (r.status !== 400) sortir(`❌ ${r.status} sur reports\n${(await r.text()).slice(0, 400)}`);
    _sansStatut = true;
    console.log("ℹ️  La base n'a pas encore de colonne `status` (migration du 2026-09-11 non appliquée) : tout est considéré ouvert.\n");
  }
  return await rest(cfg,
    "reports?select=id,reporter_id,target_type,target_id,reason,created_at&order=created_at.desc&limit=500");
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
  console.log(`     · retirer un contenu ou suspendre un compte : éditeur SQL Supabase (canal ③)`);
  console.log(`     · le fermer en base : node scripts/moderation.js traiter --id ${l.id} --statut handled --note "…"`);
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
  sortir(`Commande inconnue : ${commande}\nAttendu : lister | voir | vu | traiter | compte`);
})().catch((e) => sortir("❌ " + (e && e.message)));
