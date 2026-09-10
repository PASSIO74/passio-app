#!/usr/bin/env node
/**
 * MODÉRATION DES PASSIONS CRÉÉES — outil d'OPÉRATEUR (2026-09-09)
 *
 * Depuis le 2026-09-08, n'importe quel compte écrit un nom dans le référentiel
 * COMMUN (`creer_passion`). Trois choses manquaient : voir ce qui a été créé,
 * retirer ce qui n'a rien à y faire, et accorder un droit de création étendu.
 * Cet outil est les trois.
 *
 * ⚠️ IL N'EST PAS, ET NE DOIT JAMAIS DEVENIR, UNE INTERFACE DU NAVIGATEUR.
 * `public.passions` n'a NI policy UPDATE NI policy DELETE, et
 * `public.passion_quotas` n'a aucune policy d'écriture : ces gestes EXIGENT
 * `service_role`, qui vit ici, dans un processus local, jamais dans une page.
 * C'est le canal ② d'ADR-012 (écriture de DONNÉES par PostgREST), pas le ③.
 *
 * ⚠️ RETIRER, C'EST ARCHIVER — JAMAIS SUPPRIMER. `status = 'archived'` sort la
 * passion de la recherche et de ce qui est publiable, mais la LIGNE RESTE :
 *   · les publications qui la référencent gardent leur clé étrangère ;
 *   · son nom ne peut pas être recréé (`creer_passion` rend `nom_indisponible`),
 *     donc un retrait ne s'annule pas tout seul au prochain compte venu ;
 *   · le geste est réversible (`restaurer`).
 *
 * ⚠️ VIE PRIVÉE. `created_by` et `reporter_id` sont des identités. L'opérateur
 * a besoin de savoir COMBIEN de personnes distinctes ont signalé, pas QUI :
 * aucun identifiant de signaleur n'est affiché. Le `created_by` d'une passion
 * n'est montré qu'ABRÉGÉ, et seulement parce que retirer une passion sans voir
 * si un même compte en a créé douze reviendrait à modérer à l'aveugle.
 *
 *   node scripts/passions-moderation.js lister
 *   node scripts/passions-moderation.js signalees
 *   node scripts/passions-moderation.js archiver  --id sculpture-sur-glace
 *   node scripts/passions-moderation.js restaurer --id sculpture-sur-glace
 *   node scripts/passions-moderation.js quota --uid <uuid> --max illimite
 *   node scripts/passions-moderation.js quota --uid <uuid> --max 10
 *   node scripts/passions-moderation.js quota --uid <uuid> --max defaut
 *   node scripts/passions-moderation.js alias --id grs --ajouter "gymnastique rythmique,gym rythmique"
 *   node scripts/passions-moderation.js alias --id grs --retirer "gym rythmique"
 */
"use strict";
const { configAdmin } = require("../tests/e2e/compte-e2e.js");

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
function abrege(uuid) {
  const s = String(uuid || "");
  return s.length > 8 ? s.slice(0, 8) + "…" : (s || "—");
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
  if (!r.ok) {
    // Le cas le plus probable : la migration n'est pas appliquée. Le dire, au
    // lieu d'un 404 brut qui ferait chercher une panne là où il n'y a qu'une
    // étape non franchie.
    if (r.status === 404 || /schema cache|does not exist/i.test(texte)) {
      sortir(
        `❌ Objet absent de cette base (${chemin.split("?")[0]}).\n` +
        `   Migration non appliquée : migrations/migration_passion_moderation.sql\n` +
        `   (et, avant elle, migration_creation_passion_utilisateur.sql).`
      );
    }
    sortir(`❌ ${r.status} sur ${chemin}\n${texte.slice(0, 400)}`);
  }
  return texte ? JSON.parse(texte) : null;
}

// Combien de personnes DISTINCTES ont signalé chaque passion.
// ⚠️ L'index unique partiel garantit déjà une ligne par personne et par
// passion : compter les lignes SUFFIT, et évite de manipuler des identités.
async function signalementsParPassion(cfg) {
  const lignes = await rest(cfg, "reports?target_type=eq.passion&select=target_id,created_at&order=created_at.desc");
  const par = new Map();
  (lignes || []).forEach((l) => {
    const e = par.get(l.target_id) || { n: 0, dernier: null };
    e.n += 1;
    if (!e.dernier || l.created_at > e.dernier) e.dernier = l.created_at;
    par.set(l.target_id, e);
  });
  return par;
}

function tableau(rows, signalements) {
  if (!rows.length) { console.log("   (aucune)"); return; }
  rows.forEach((p) => {
    const sig = signalements.get(p.id);
    const marque = p.status === "active" ? " " : "🗄";
    const drapeau = sig ? `  🚩 ${sig.n}` : "";
    console.log(
      `  ${marque} ${p.id.padEnd(38)} ${String(p.label).slice(0, 28).padEnd(30)}` +
      ` ${String(p.created_at || "").slice(0, 10)}  par ${abrege(p.created_by)}${drapeau}`
    );
  });
}

async function lister(cfg) {
  const rows = await rest(cfg,
    "passions?source=eq.user_suggested&select=id,label,status,created_at,created_by,popularity&order=created_at.desc&limit=200");
  const sig = await signalementsParPassion(cfg);
  const actives = (rows || []).filter((p) => p.status === "active");
  const archivees = (rows || []).filter((p) => p.status !== "active");
  console.log(`\n── Passions créées depuis l'application ─────────────────────`);
  console.log(`\n  ACTIVES (${actives.length})`);
  tableau(actives, sig);
  console.log(`\n  ARCHIVÉES (${archivees.length}) — retirées, jamais supprimées`);
  tableau(archivees, sig);
  // Combien de comptes distincts, pour repérer un compte qui en crée beaucoup.
  const parCompte = new Map();
  (rows || []).forEach((p) => parCompte.set(p.created_by, (parCompte.get(p.created_by) || 0) + 1));
  const gros = [...parCompte.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  if (gros.length) {
    console.log(`\n  Comptes ayant créé 3 passions ou plus :`);
    gros.forEach(([u, n]) => console.log(`    ${abrege(u)} : ${n}`));
  }
  console.log("");
}

async function signalees(cfg) {
  const sig = await signalementsParPassion(cfg);
  if (!sig.size) { console.log("\n  Aucun signalement de passion.\n"); return; }
  const ids = [...sig.keys()];
  const rows = await rest(cfg,
    `passions?id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,label,status,created_at,created_by`);
  const parId = new Map((rows || []).map((p) => [p.id, p]));
  console.log(`\n── Passions signalées ───────────────────────────────────────\n`);
  [...sig.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([id, e]) => {
    const p = parId.get(id);
    // ⚠️ Un signalement peut viser un identifiant qui n'existe pas (ou plus) :
    // le dire, plutôt que d'afficher une ligne vide.
    if (!p) { console.log(`  🚩 ${e.n}  ${id}  — introuvable dans le référentiel`); return; }
    console.log(`  🚩 ${String(e.n).padStart(2)}  ${p.id.padEnd(38)} ${String(p.label).slice(0, 28).padEnd(30)}` +
                ` ${p.status === "active" ? "active" : "archivée"}  dernier : ${String(e.dernier).slice(0, 10)}`);
  });
  console.log(`\n  Retirer : node scripts/passions-moderation.js archiver --id <identifiant>\n`);
}

async function changerStatut(cfg, statut) {
  const id = opt("id");
  if (!id) sortir("❌ Il faut --id <identifiant de passion>.");
  const avant = await rest(cfg, `passions?id=eq.${encodeURIComponent(id)}&select=id,label,status,source`);
  if (!avant || !avant.length) sortir(`❌ Aucune passion « ${id} » dans le référentiel.`);
  const p = avant[0];
  // ⚠️ GARDE-FOU : les 19 historiques et les entrées curées ne se retirent pas
  // par cet outil. Elles sont référencées par des milliers de publications, et
  // leur retrait n'est pas un geste de modération mais une décision de produit.
  if (statut === "archived" && p.source !== "user_suggested") {
    sortir(`❌ « ${id} » n'a pas été créée depuis l'application (source : ${p.source}).\n` +
           `   Cet outil ne retire que ce que des comptes ont créé.`);
  }
  const maj = await rest(cfg, `passions?id=eq.${encodeURIComponent(id)}&select=id,status`, {
    method: "PATCH",
    body: JSON.stringify({ status: statut, updated_at: new Date().toISOString() }),
  });
  // ⚠️ ON LIT CE QUE L'ÉCRITURE A TOUCHÉ : zéro ligne = refus silencieux.
  if (!maj || !maj.length) sortir(`❌ Aucune ligne modifiée pour « ${id} » — droits insuffisants ?`);
  console.log(`✅ « ${p.label} » (${id}) → ${statut === "active" ? "ACTIVE" : "ARCHIVÉE"}.`);
  if (statut === "archived") {
    console.log(`   Elle sort de la recherche et de ce qui est publiable ; son nom ne peut pas être recréé.`);
    console.log(`   Les publications qui la référencent ne sont pas touchées.`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ALIAS D'UNE PASSION CRÉÉE (2026-09-10)
//
// Depuis ce jour, `creer_passion` accepte des alias — mais les passions déjà
// créées n'en ont pas, et personne ne va rouvrir son compte pour en ajouter.
// « GRS », créée le 2026-09-09, reste introuvable en tapant « gymnastique
// rythmique » tant qu'un opérateur ne le fait pas.
//
// ⚠️ MÊME RÈGLE QUE LE SERVEUR, ET C'EST LE POINT : un alias qui est déjà le
// LIBELLÉ ou l'ALIAS d'une autre passion fait remonter DEUX entrées pour le
// même mot, et le classement de `rechercher_passions` départage alors sur un
// critère que personne n'a choisi. L'outil REFUSE — il ne se contente pas
// d'écarter en silence comme le fait la fonction serveur : ici il y a un
// humain devant, il peut corriger, et un retrait muet le laisserait croire
// que son alias a été posé.
//
// ⚠️ RÉSERVÉ AUX PASSIONS CRÉÉES DEPUIS L'APPLICATION, comme `archiver` : les
// alias des 2 088 entrées curées vivent dans `data/passions/`, sous
// `passions:valider`, et une retouche en base y serait ÉCRASÉE au prochain
// delta — un correctif qui disparaît tout seul est pire qu'aucun correctif.
async function alias(cfg) {
  const id = opt("id");
  if (!id) sortir("❌ Il faut --id <identifiant de passion>.");
  const ajouter = opt("ajouter");
  const retirer = opt("retirer");
  if (!ajouter && !retirer) sortir("❌ Il faut --ajouter \"a,b\" ou --retirer \"a\".");

  const avant = await rest(cfg, `passions?id=eq.${encodeURIComponent(id)}&select=id,label,status,source,aliases`);
  if (!avant || !avant.length) sortir(`❌ Aucune passion « ${id} » dans le référentiel.`);
  const p = avant[0];
  if (p.source !== "user_suggested") {
    sortir(`❌ « ${id} » n'a pas été créée depuis l'application (source : ${p.source}).\n` +
           `   Ses alias vivent dans data/passions/ : les modifier ici serait écrasé au prochain delta.`);
  }

  const plier = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  let liste = Array.isArray(p.aliases) ? p.aliases.slice() : [];

  if (retirer) {
    const cibles = retirer.split(",").map((x) => plier(x)).filter(Boolean);
    const avantN = liste.length;
    liste = liste.filter((a) => !cibles.includes(plier(a)));
    if (liste.length === avantN) sortir(`❌ Aucun de ces alias n'est posé sur « ${id} ».`);
  }

  if (ajouter) {
    // Tout le référentiel, pour le contrôle de collision. 2 000 lignes de deux
    // colonnes : une seule requête, pas 2 000.
    const tout = await rest(cfg, "passions?select=id,normalized_label,aliases&limit=20000");
    const pris = new Map();
    for (const q of tout || []) {
      if (q.normalized_label) pris.set(plier(q.normalized_label), q.id);
      for (const a of q.aliases || []) pris.set(plier(a), q.id);
    }
    for (const brut of ajouter.split(",")) {
      const a = brut.trim().replace(/\s+/g, " ").slice(0, 60);
      const n = plier(a);
      if (n.length < 2 || !/[a-z]/.test(n)) sortir(`❌ Alias inutilisable : « ${brut.trim()} ».`);
      if (/[<>&"\\`]/.test(a)) sortir(`❌ Alias refusé (balisage) : « ${a} ».`);
      const proprietaire = pris.get(n);
      if (proprietaire && proprietaire !== id) {
        sortir(`❌ « ${a} » est déjà le nom ou l'alias de « ${proprietaire} ».\n` +
               `   Deux entrées pour le même mot, c'est le classement qui tranche au hasard.`);
      }
      if (!liste.some((x) => plier(x) === n)) liste.push(a);
    }
    if (liste.length > 8) sortir(`❌ ${liste.length} alias : au-delà de huit, ce n'est plus un synonyme.`);
  }

  const maj = await rest(cfg, `passions?id=eq.${encodeURIComponent(id)}&select=id,aliases`, {
    method: "PATCH",
    body: JSON.stringify({ aliases: liste, updated_at: new Date().toISOString() }),
  });
  // ⚠️ ON LIT CE QUE L'ÉCRITURE A TOUCHÉ : zéro ligne = refus silencieux.
  if (!maj || !maj.length) sortir(`❌ Aucune ligne modifiée pour « ${id} » — droits insuffisants ?`);
  console.log(`✅ « ${p.label} » (${id}) → alias : ${liste.length ? liste.join(", ") : "(aucun)"}`);
}

async function quota(cfg) {
  const uid = opt("uid");
  const max = opt("max");
  if (!uid) sortir("❌ Il faut --uid <uuid du compte>.");
  if (!max) sortir("❌ Il faut --max illimite | <nombre> | defaut.");
  if (max === "defaut") {
    await rest(cfg, `passion_quotas?user_id=eq.${encodeURIComponent(uid)}`, { method: "DELETE" });
    console.log(`✅ ${abrege(uid)} revient au défaut du produit (3 créations).`);
    return;
  }
  const valeur = max === "illimite" ? null : Number(max);
  if (valeur !== null && (!Number.isInteger(valeur) || valeur < 0)) {
    sortir("❌ --max attend « illimite », « defaut », ou un entier positif.");
  }
  const maj = await rest(cfg, "passion_quotas?on_conflict=user_id&select=user_id,creations_max", {
    method: "POST",
    headers: {
      apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}`, "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({ user_id: uid, creations_max: valeur, note: opt("note") || "accordé par l'opérateur" }),
  });
  if (!maj || !maj.length) sortir(`❌ Aucune ligne écrite pour ${abrege(uid)}.`);
  console.log(`✅ ${abrege(uid)} : ${valeur === null ? "créations ILLIMITÉES" : valeur + " créations"}.`);
}

// ══════════════════════════════════════════════════════════════════════════
(async function () {
  // ⚠️ `configAdmin()` REND `null`, ELLE NE LÈVE PAS quand le secret manque :
  // un `try/catch` seul laissait passer un `cfg` nul et l'outil mourait dix
  // lignes plus loin sur « Cannot read properties of null », un message qui
  // n'apprend rien à qui vient juste d'oublier sa clé.
  let cfg = null;
  try { cfg = configAdmin(); } catch (e) { cfg = null; }
  if (!cfg || !cfg.url || !cfg.cle) {
    sortir(`❌ Accès opérateur indisponible.\n` +
           `   Ces commandes exigent SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY\n` +
           `   (dashboard/.env en local) — jamais dans le navigateur, jamais committées.`);
  }
  if (commande === "lister") return lister(cfg);
  if (commande === "signalees") return signalees(cfg);
  if (commande === "archiver") return changerStatut(cfg, "archived");
  if (commande === "restaurer") return changerStatut(cfg, "active");
  if (commande === "quota") return quota(cfg);
  if (commande === "alias") return alias(cfg);
  sortir(`Commande inconnue : ${commande}\nAttendu : lister | signalees | archiver | restaurer | quota | alias`);
})().catch((e) => sortir("❌ " + (e && e.message)));
