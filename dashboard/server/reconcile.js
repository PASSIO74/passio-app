// ═══════════════════════════════════════════════════════════════════════════
// RÉCONCILIATION — « ce qui devrait exister » vs « ce qui existe vraiment ».
//
// Le traçage (traces.js) prouve qu'UNE action a abouti. La réconciliation
// répond à l'autre moitié de la question : la base est-elle COHÉRENTE ?
// Elle cherche les données perdues, orphelines ou bloquées qu'aucune erreur
// n'a signalées — les échecs SILENCIEUX.
//
// Chaque règle est ancrée sur le schéma RÉEL de prod (vérifié via
// information_schema, le repo n'étant pas la source de vérité) et sur les
// invariants documentés du projet (jamais de base64 en DB, une bobine sans
// URL Storage est invisible, etc.).
//
// LECTURE SEULE, en service_role. Aucune écriture, aucune réparation
// automatique : on constate, on chiffre, on propose une action Claude Code.
// Aucun contenu privé n'est lu — uniquement des identifiants et des comptes.
// ═══════════════════════════════════════════════════════════════════════════
import { getAdmin } from "./ingest.js";

// Borne de sécurité : au-delà, l'analyse est déclarée PARTIELLE (on ne prétend
// jamais « 0 anomalie » sur un échantillon tronqué).
const MAX_ROWS = 5000;
const SAMPLE_IDS = 20;   // nb d'identifiants d'exemple remontés par anomalie

// ─── Contenu de démonstration (seed) : PAS une anomalie ────────────────────
// L'app embarque un jeu de démo LOCAL (app-01 : publications `p1`…/`pm1`/`pac_*`/
// `p_vlog_*`, personas `u_lea`…, événements `e1`… ; app-05 : bobines
// `reel_seed_*`). Ces contenus n'existent QUE côté client : un j'aime ou une
// notification qui les référence n'a, par construction, aucune ligne parente en
// base. `me` est de même le pseudo-identifiant local de l'utilisateur courant.
// Les compter comme « données perdues » ferait crier au loup (133 fausses
// anomalies mesurées avant ce filtre, contre 21 réelles) et rendrait le tableau
// de bord inutile. On les isole en « références de démo » : informatives, jamais
// un incident.
const SEED_ID = /^(u_[a-z]+|p\d+|pm\d+|e\d+|p_vlog_[a-z]+|pac_[a-z]+|reel_seed_[a-z0-9_]+|photo|podcast|me)$/i;
const isSeedRef = (v) => SEED_ID.test(String(v || ""));

/** Charge une colonne d'identifiants et signale si la borne a été atteinte. */
async function loadIds(admin, table, column) {
  const { data, error } = await admin.from(table).select(column).limit(MAX_ROWS);
  if (error) throw new Error(`${table}.${column} : ${error.message}`);
  const rows = data || [];
  return { values: rows.map((r) => r[column]).filter((v) => v != null), truncated: rows.length >= MAX_ROWS };
}

// Fenêtre au-delà de laquelle une anomalie sans nouvelle occurrence est
// considérée comme un RÉSIDU (le défaut a probablement déjà été corrigé) et
// non comme un incident actif. Cf. « un incident résolu quitte les actifs ».
const ACTIVE_WINDOW_MS = 7 * 24 * 3600_000;

/**
 * Datation d'un lot de lignes concernées : dernière occurrence + nombre récent.
 * Une anomalie ancienne et sans récidive ne doit pas être présentée avec la
 * même urgence qu'une anomalie qui se produit encore aujourd'hui.
 */
function agesOf(timestamps) {
  const ts = (timestamps || []).map((t) => new Date(t).getTime()).filter((n) => Number.isFinite(n));
  if (!ts.length) return { lastAt: null, recentCount: null, active: null };
  const lastAt = Math.max(...ts);
  const since = Date.now() - ACTIVE_WINDOW_MS;
  return { lastAt, recentCount: ts.filter((t) => t >= since).length, active: lastAt >= since };
}

/** Compte exact d'une requête filtrée (head:true → aucune donnée transférée). */
async function countWhere(admin, table, build) {
  let q = admin.from(table).select("*", { count: "exact", head: true });
  q = build(q);
  const { count, error } = await q;
  if (error) throw new Error(`${table} : ${error.message}`);
  return count || 0;
}

/**
 * Anti-jointure : enfants dont la clé étrangère ne pointe sur aucun parent.
 * (Les FK réelles étant absentes en prod sur plusieurs tables, on la calcule
 * en mémoire — volumétrie beta, quelques centaines de lignes.)
 */
async function orphans(admin, { child, childKey, parent, parentKey = "id", ts = null }) {
  // `ts` (colonne de date de l'enfant, quand elle existe) permet de dater
  // l'anomalie : résidu ancien ou défaut encore actif ?
  const cols = ts ? `${childKey},${ts}` : childKey;
  const [{ data: cRows, error: cErr }, p] = await Promise.all([
    admin.from(child).select(cols).limit(MAX_ROWS),
    loadIds(admin, parent, parentKey),
  ]);
  if (cErr) throw new Error(`${child} : ${cErr.message}`);
  const rows = cRows || [];
  const known = new Set(p.values);
  const missing = rows.filter((r) => r[childKey] != null && !known.has(r[childKey]));
  // Sépare les références au contenu de DÉMO (normales) des VRAIS orphelins
  // (données réellement perdues : parent supprimé ou jamais créé).
  const real = missing.filter((r) => !isSeedRef(r[childKey]));
  const uniq = [...new Set(real.map((r) => r[childKey]))];
  return {
    count: real.length,
    distinct: uniq.length,
    samples: uniq.slice(0, SAMPLE_IDS),
    seedRefs: missing.length - real.length,
    partial: rows.length >= MAX_ROWS || p.truncated,
    ...(ts ? agesOf(real.map((r) => r[ts])) : {}),
  };
}

// ─── Catalogue des règles d'intégrité ──────────────────────────────────────
// Chaque règle : id, libellé lisible, gravité si violée, explication d'impact,
// et la fonction de mesure. `severity` n'est appliquée QUE si count > 0.
const RULES = [
  {
    id: "likes_orphelins", label: "J'aime sans publication", severity: "warn",
    impact: "Un j'aime pointe sur une publication supprimée ou jamais créée : compteurs faussés.",
    run: (a) => orphans(a, { child: "post_likes", childKey: "post_id", parent: "posts" }),
  },
  {
    id: "commentaires_orphelins", label: "Commentaires sans publication", severity: "warn",
    impact: "Le commentaire existe mais sa publication n'existe pas : contenu invisible et irrécupérable.",
    run: (a) => orphans(a, { child: "post_comments", childKey: "post_id", parent: "posts", ts: "created_at" }),
  },
  {
    id: "messages_orphelins", label: "Messages sans conversation", severity: "error",
    impact: "Le message est enregistré mais rattaché à une conversation inexistante : il n'atteindra jamais son destinataire.",
    run: (a) => orphans(a, { child: "conv_messages", childKey: "conv_id", parent: "conversations", ts: "created_at" }),
  },
  {
    id: "participations_orphelines", label: "Participations sans événement", severity: "warn",
    impact: "Un RSVP pointe sur un événement supprimé : le participant ne verra rien.",
    run: (a) => orphans(a, { child: "event_attendees", childKey: "event_id", parent: "events", ts: "created_at" }),
  },
  {
    id: "notifs_sans_destinataire", label: "Notifications sans destinataire valide", severity: "error",
    impact: "La notification a été créée pour un compte qui n'existe pas (ou plus) : signal perdu en silence.",
    run: (a) => orphans(a, { child: "notifications", childKey: "user_id", parent: "profiles", ts: "created_at" }),
  },
  {
    id: "base64_messages", label: "Base64 stocké en base (messages)", severity: "error",
    impact: "Invariant projet violé : un média doit aller sur Storage. Le base64 fait exploser la table (24 Mo pour un seul message en beta).",
    run: async (a) => {
      const count = await countWhere(a, "conv_messages", (q) => q.like("content", "%data:%"));
      return { count, distinct: count, samples: [], partial: false };
    },
  },
  {
    id: "base64_posts", label: "Base64 stocké en base (publications)", severity: "error",
    impact: "Invariant projet violé : media_url doit être une URL Storage, jamais un data: URI.",
    run: async (a) => {
      const count = await countWhere(a, "posts", (q) => q.like("media_url", "data:%"));
      return { count, distinct: count, samples: [], partial: false };
    },
  },
  {
    id: "bobines_sans_media", label: "Bobines sans média", severity: "error",
    impact: "Une bobine sans URL Storage est INVISIBLE et irréparable côté app (bug constaté en prod : upload échoué mais ligne créée).",
    run: async (a) => {
      const { data, error } = await a.from("posts").select("id,created_at").eq("is_reel", true).is("media_url", null).limit(MAX_ROWS);
      if (error) throw new Error("posts : " + error.message);
      const rows = data || [];
      return {
        count: rows.length, distinct: rows.length,
        samples: rows.map((r) => r.id).slice(0, SAMPLE_IDS),
        partial: rows.length >= MAX_ROWS,
        ...agesOf(rows.map((r) => r.created_at)),
      };
    },
  },
  {
    id: "posts_sans_auteur", label: "Publications sans auteur valide", severity: "warn",
    impact: "L'auteur n'existe pas dans profiles : la publication s'affiche sans nom (embed profiles renvoie null).",
    run: (a) => orphans(a, { child: "posts", childKey: "author_id", parent: "profiles", ts: "created_at" }),
  },
];

/**
 * Lance toutes les règles. Une règle en erreur n'interrompt pas les autres :
 * elle est remontée telle quelle (une règle qu'on n'a PAS pu vérifier n'est
 * jamais présentée comme « conforme »).
 */
export async function reconcile() {
  const admin = getAdmin();
  if (!admin) return { configured: false, updatedAt: Date.now(), checks: [], totals: { anomalies: 0, rules: RULES.length, failed: 0 } };

  const checks = await Promise.all(RULES.map(async (rule) => {
    try {
      const r = await rule.run(admin);
      // Une anomalie datée dont la dernière occurrence est ancienne est un
      // RÉSIDU (défaut vraisemblablement déjà corrigé), pas un incident actif :
      // on la rétrograde d'un cran pour ne pas la mêler aux problèmes du jour.
      // `active === null` = non datable → on ne présume rien, gravité inchangée.
      let status = r.count > 0 ? rule.severity : "ok";
      if (status !== "ok" && r.active === false) status = "residue";
      return {
        id: rule.id, label: rule.label, impact: rule.impact,
        status,
        count: r.count, distinct: r.distinct, samples: r.samples || [],
        seedRefs: r.seedRefs || 0,      // références au contenu de démo (informatif)
        lastAt: r.lastAt ?? null,       // dernière occurrence (null = non datable)
        recentCount: r.recentCount ?? null,  // occurrences des 7 derniers jours
        partial: !!r.partial, error: null,
      };
    } catch (e) {
      return {
        id: rule.id, label: rule.label, impact: rule.impact,
        status: "unknown", count: null, distinct: null, samples: [], partial: false,
        error: e.message || String(e),
      };
    }
  }));

  // « Anomalies » = ce qui demande une action MAINTENANT (les résidus sont
  // comptés à part : réels, consultables, mais sans récidive récente).
  const anomalies = checks.filter((c) => c.status === "error" || c.status === "warn");
  const residues = checks.filter((c) => c.status === "residue");
  const failed = checks.filter((c) => c.status === "unknown");
  return {
    configured: true,
    updatedAt: Date.now(),
    checks,
    totals: {
      rules: checks.length,
      anomalies: anomalies.length,
      affectedRows: anomalies.reduce((n, c) => n + (c.count || 0), 0),
      residues: residues.length,
      residueRows: residues.reduce((n, c) => n + (c.count || 0), 0),
      seedRefs: checks.reduce((n, c) => n + (c.seedRefs || 0), 0),
      failed: failed.length,
      critical: checks.filter((c) => c.status === "error").length,
    },
  };
}

/** Prompt Claude Code pour une anomalie d'intégrité précise. */
export function buildReconcilePrompt(check) {
  const L = [];
  L.push("Tu es Claude Code sur le projet PASSIO (PWA vanilla JS + Supabase).");
  L.push("Le centre de pilotage a détecté une INCOHÉRENCE DE DONNÉES en production (échec silencieux).");
  L.push("Commence par « ## En clair » (2-3 phrases sans jargon).");
  L.push("");
  L.push("## Anomalie");
  L.push(`- Règle : ${check.label}`);
  L.push(`- Lignes concernées : ${check.count}${check.distinct != null ? ` (${check.distinct} clé(s) distincte(s))` : ""}`);
  L.push(`- Impact : ${check.impact}`);
  if (check.lastAt) {
    const days = Math.floor((Date.now() - check.lastAt) / 86400_000);
    L.push(`- Dernière occurrence : il y a ${days} jour(s)${check.recentCount != null ? ` · ${check.recentCount} sur les 7 derniers jours` : ""}`);
    if (check.status === "residue") {
      L.push("- ⚠️ AUCUNE récidive récente : il s'agit très probablement d'un RÉSIDU d'un défaut DÉJÀ corrigé.");
      L.push("  Vérifie d'ABORD dans l'historique git si le correctif existe (git log -S) AVANT de proposer un correctif de code.");
      L.push("  Si le code est déjà sain, le travail utile est uniquement le nettoyage des données résiduelles.");
    }
  }
  if (check.partial) L.push("- ⚠️ Analyse PARTIELLE (borne de lecture atteinte) : le chiffre est un minorant.");
  if (check.samples?.length) L.push(`- Exemples d'identifiants : ${check.samples.join(", ")}`);
  L.push("");
  L.push("## Attendu");
  L.push("1. Cause probable (code applicatif ET/OU policy RLS) — un UPDATE/DELETE qui touche 0 ligne = policy manquante.");
  L.push("2. Fichiers à inspecter (chemins réels du dépôt).");
  L.push("3. Correctif du CODE pour que l'anomalie ne se reproduise plus (git diff).");
  L.push("4. Script de RÉPARATION des données existantes, en mode simulation d'abord (SELECT avant DELETE/UPDATE), idempotent.");
  L.push("5. Test de non-régression.");
  L.push("6. Risques et effets de bord (ne jamais supprimer une donnée récupérable).");
  return L.join("\n");
}

// Exportés pour les tests : source UNIQUE de la règle de classification
// (dupliquer ce motif ailleurs le ferait dériver en silence).
export { RULES, SEED_ID, isSeedRef };
