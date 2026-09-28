// ═══════════════════════════════════════════════════════════════════════════
// PILOTAGE DANS LE NUAGE — logique PURE (2026-09-28)
//
// Le centre de pilotage vivait sur le PC : PC éteint = plus d'yeux. Cette
// fonction lit la production depuis Supabase (service_role, côté serveur
// seulement) et GitHub (la chaîne Sentinelle, qui tourne déjà sans PC), et
// rend au téléphone un état résumé. Ce fichier ne fait AUCUN appel réseau :
// il décide qui entre, résume, et tranche le verdict — éprouvé en Node par
// tests/unit/pilotage.test.mjs, le même fichier que Deno déploie.
// ═══════════════════════════════════════════════════════════════════════════

/** Le compte de l'éditeur (même adresse que PASSIO_EDITEUR.email, js/legal-textes.js). */
export const COMPTE_PILOTE = "passioadmin@gmail.com";

/**
 * Qui a le droit de piloter. ÉCHOUE FERMÉ : sans adresse CONFIRMÉE qui figure
 * dans la liste, refus. `extra` = PILOTAGE_EMAILS (secret de la fonction,
 * séparé par des virgules) pour ajouter un compte sans redéployer de code.
 */
export function autorise(user, extra = "") {
  if (!user || typeof user.email !== "string") return false;
  if (!user.email_confirmed_at && !user.confirmed_at) return false;
  const liste = [COMPTE_PILOTE, ...String(extra || "").split(",")]
    .map((s) => s.trim().toLowerCase()).filter(Boolean);
  return liste.includes(user.email.trim().toLowerCase());
}

/** Les workflows que le téléphone peut relancer — liste BLANCHE, rien d'autre. */
export const RELANCES = {
  sentinelle: { fichier: "sentinelle-autonome.yml", libelle: "Sentinelle (chercher les erreurs et ouvrir une enquête)" },
  veille: { fichier: "veille-production.yml", libelle: "Veille de production" },
  digest: { fichier: "digest.yml", libelle: "Digest (résumé du jour)" },
};

/** Les labels d'issues qui intéressent le pilote. */
export const LABELS_SUIVIS = ["sentinelle", "veille", "humain", "moderation", "digest", "recidive"];

const borne = (s, n) => { const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };

/** Regroupe les erreurs client par message (les 5 plus fréquentes, textes bornés). */
export function erreursFrequentes(lignes, max = 5) {
  const groupes = new Map();
  for (const l of lignes || []) {
    const cle = borne(l && l.message, 160) || "(sans message)";
    const g = groupes.get(cle) || { message: cle, n: 0, comptes: new Set(), dernier: null };
    g.n++;
    if (l.uid) g.comptes.add(String(l.uid));
    const t = Date.parse(l.created_at);
    if (Number.isFinite(t) && (!g.dernier || t > g.dernier)) g.dernier = t;
    groupes.set(cle, g);
  }
  return [...groupes.values()].sort((a, b) => b.n - a.n || (b.dernier || 0) - (a.dernier || 0)).slice(0, max)
    .map((g) => ({ message: g.message, n: g.n, comptes: g.comptes.size, dernier: g.dernier ? new Date(g.dernier).toISOString() : null }));
}

/** Résume une issue GitHub : aucun corps, aucun auteur — titre borné, labels, lien. */
export function resumerIssue(i) {
  return {
    numero: Number(i && i.number) || 0,
    titre: borne(i && i.title, 160),
    labels: ((i && i.labels) || []).map((l) => borne(typeof l === "string" ? l : l && l.name, 40)).filter(Boolean).slice(0, 6),
    url: /^https:\/\/github\.com\//.test(String(i && i.html_url)) ? i.html_url : null,
    depuis: (i && i.created_at) || null,
    pr: !!(i && i.pull_request),
  };
}

/** Résume la dernière exécution d'un workflow. */
export function resumerRun(r) {
  if (!r) return null;
  return {
    etat: r.status || null, conclusion: r.conclusion || null,
    le: r.updated_at || r.created_at || null,
    url: /^https:\/\/github\.com\//.test(String(r.html_url)) ? r.html_url : null,
  };
}

/**
 * Le verdict en une phrase et une couleur. Seuils volontairement simples :
 * ils se lisent, se contestent et se changent ici, pas dans l'écran.
 */
export function verdict(e) {
  const rouge = [], orange = [];
  const s = (e && e.sante) || {};
  const gh = (e && e.github) || {};
  const issues = Array.isArray(gh.issues) ? gh.issues : [];
  const runs = gh.runs || {};
  if (s.erreursJs15 >= 10) rouge.push(`${s.erreursJs15} erreurs dans l'app en 15 min`);
  else if (s.erreursJs15 > 0) orange.push(`${s.erreursJs15} erreur(s) dans l'app en 15 min`);
  if (s.api5xx15 >= 5) rouge.push(`${s.api5xx15} pannes serveur en 15 min`);
  else if (s.api5xx15 > 0) orange.push(`${s.api5xx15} panne(s) serveur en 15 min`);
  if (runs.deploy && runs.deploy.conclusion === "failure") rouge.push("dernier déploiement en échec");
  const humain = issues.filter((i) => !i.pr && i.labels.includes("humain")).length;
  if (humain) rouge.push(`${humain} sujet(s) qui t'attendent`);
  const enquetes = issues.filter((i) => !i.pr && i.labels.includes("sentinelle")).length;
  if (enquetes) orange.push(`${enquetes} enquête(s) Sentinelle en cours`);
  const veille = issues.filter((i) => !i.pr && i.labels.includes("veille")).length;
  if (veille) orange.push("la veille signale un problème");
  const signal = Number(e && e.signalements && e.signalements.ouverts) || 0;
  if (signal) orange.push(`${signal} signalement(s) à traiter`);
  if (runs.sentinelle && runs.sentinelle.le && Date.now() - Date.parse(runs.sentinelle.le) > 8 * 3600e3) orange.push("la Sentinelle n'a pas tourné depuis plus de 8 h");
  if (rouge.length) return { couleur: "rouge", titre: "Problème en cours", raisons: rouge.concat(orange) };
  if (orange.length) return { couleur: "orange", titre: "À surveiller", raisons: orange };
  if (!e || !e.sante) return { couleur: "gris", titre: "Pas de nouvelles", raisons: ["La production n'a pas pu être lue."] };
  return { couleur: "vert", titre: "Tout va bien", raisons: ["Aucune erreur récente, rien d'urgent."] };
}

// ─── Lot 2 (2026-09-28) : alertes, détails, capacité, disponibilité ──────────

/** Titre de l'issue qui met la Sentinelle en pause (convention de sentinelle-autonome.yml). */
export const TITRE_PAUSE = "[SENTINELLE PAUSE] depuis le pilotage";
export const estPause = (titre) => /\[SENTINELLE PAUSE\]/.test(String(titre || ""));

/** Famille d'appareil lisible depuis un user-agent (rien d'autre n'en sort). */
export function plateforme(ua) {
  const u = String(ua || "");
  if (/iPhone|iPad|iPod/i.test(u)) return "iPhone/iPad";
  if (/Android/i.test(u)) return "Android";
  if (/Windows/i.test(u)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(u)) return "Mac";
  if (/Linux/i.test(u)) return "Linux";
  return "Autre";
}

/** Le chemin d'une URL de page (sans requête ni fragment : ils portent parfois des jetons). */
export function cheminPage(url) {
  try { const p = new URL(String(url)).pathname; return p.length > 60 ? p.slice(0, 60) + "…" : p; } catch { return null; }
}

/** Compte par jour (UTC) sur les `jours` derniers jours, du plus ancien au plus récent. */
export function serieJours(dates, jours = 7, maintenant = Date.now()) {
  const out = [];
  const debut = new Date(maintenant); debut.setUTCHours(0, 0, 0, 0);
  for (let i = jours - 1; i >= 0; i--) {
    const j = new Date(debut.getTime() - i * 864e5);
    out.push({ jour: j.toISOString().slice(0, 10), n: 0 });
  }
  const index = new Map(out.map((x, i) => [x.jour, i]));
  for (const d of dates || []) {
    const t = Date.parse(d);
    if (!Number.isFinite(t)) continue;
    const i = index.get(new Date(t).toISOString().slice(0, 10));
    if (i != null) out[i].n++;
  }
  return out;
}

/** Détail d'une famille d'erreurs : appareils, pages, premiers/derniers vus, série 7 j. */
export function detailsErreurs(lignes, max = 8, maintenant = Date.now()) {
  const groupes = new Map();
  for (const l of lignes || []) {
    const cle = borne(l && l.message, 160) || "(sans message)";
    const g = groupes.get(cle) || { message: cle, n: 0, comptes: new Set(), plateformes: {}, pages: {}, dates: [], premier: null, dernier: null };
    g.n++;
    if (l.uid) g.comptes.add(String(l.uid));
    const p = plateforme(l.ua); g.plateformes[p] = (g.plateformes[p] || 0) + 1;
    const c = cheminPage(l.url); if (c) g.pages[c] = (g.pages[c] || 0) + 1;
    const t = Date.parse(l.created_at);
    if (Number.isFinite(t)) { g.dates.push(l.created_at); if (!g.premier || t < g.premier) g.premier = t; if (!g.dernier || t > g.dernier) g.dernier = t; }
    groupes.set(cle, g);
  }
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => ({ nom: k, n }));
  return [...groupes.values()].sort((a, b) => (b.dernier || 0) - (a.dernier || 0) || b.n - a.n).slice(0, max).map((g) => ({
    message: g.message, n: g.n, comptes: g.comptes.size,
    plateformes: top(g.plateformes), pages: top(g.pages),
    premier: g.premier ? new Date(g.premier).toISOString() : null,
    dernier: g.dernier ? new Date(g.dernier).toISOString() : null,
    serie: serieJours(g.dates, 7, maintenant),
  }));
}

/**
 * Les jauges de capacité. `mesure` = valeur, `plafond` = limite du forfait
 * (mesurée le 2026-09-20, CLAUDE.md « LE MUR EST UNE CONNEXION WEBSOCKET »).
 * `estimation` = la valeur est un indicateur approché, et l'écran le dit.
 */
export const PLAFONDS = {
  connexions: { libelle: "Connexions en direct (comptes)", plafond: 500, unite: "" },
  emails: { libelle: "E-mails d'inscription (24 h)", plafond: 300, unite: "" },
  base: { libelle: "Base de données", plafond: 8 * 1024 ** 3, unite: "octets" },
  stockage: { libelle: "Stockage des médias", plafond: 100 * 1024 ** 3, unite: "octets" },
};
export function jauges(m) {
  const out = [];
  const ajoute = (cle, valeur, estimation) => {
    const p = PLAFONDS[cle];
    if (valeur == null || !Number.isFinite(Number(valeur))) { out.push({ cle, libelle: p.libelle, valeur: null, plafond: p.plafond, unite: p.unite, pct: null, couleur: "gris", estimation }); return; }
    const pct = Math.round((Number(valeur) / p.plafond) * 1000) / 10;
    out.push({ cle, libelle: p.libelle, valeur: Number(valeur), plafond: p.plafond, unite: p.unite, pct, couleur: pct >= 90 ? "rouge" : pct >= 70 ? "orange" : "vert", estimation });
  };
  ajoute("connexions", m && m.connexions, true);
  ajoute("emails", m && m.emails, true);
  ajoute("base", m && m.base, false);
  ajoute("stockage", m && m.stockage, false);
  return out;
}

/**
 * Faut-il sonner le téléphone ? On ne sonne QUE sur un changement qui compte :
 * passage au rouge, site injoignable, retour à la normale — et un rappel toutes
 * les 6 h si le rouge dure. L'orange ne sonne jamais (il se lit à l'ouverture).
 * `prec` = dernier état mémorisé { couleur, dispo, alerteLe } ou null.
 */
export function decideAlerte(prec, actuel, maintenant = Date.now(), rappelMs = 6 * 3600e3) {
  const p = prec || { couleur: "vert", dispo: true, alerteLe: null };
  const a = actuel || {};
  if (a.dispo === false && p.dispo !== false) return { sonner: true, titre: "🔴 PASSIO ne répond plus", texte: "Le site ne répond pas à la sonde. Ouvre le pilotage." };
  if (a.dispo !== false && p.dispo === false) return { sonner: true, titre: "✅ PASSIO répond de nouveau", texte: "Le site est revenu." };
  if (a.couleur === "rouge" && p.couleur !== "rouge") return { sonner: true, titre: "🔴 Problème sur PASSIO", texte: (a.raisons || []).slice(0, 2).join(" · ") || "Ouvre le pilotage." };
  if (a.couleur === "rouge" && p.alerteLe && maintenant - Date.parse(p.alerteLe) >= rappelMs) return { sonner: true, titre: "🔴 Toujours un problème sur PASSIO", texte: (a.raisons || []).slice(0, 2).join(" · ") };
  if (a.couleur !== "rouge" && p.couleur === "rouge") return { sonner: true, titre: "✅ Problème résolu", texte: a.couleur === "orange" ? "Plus d'urgence, quelques points à surveiller." : "Tout va bien de nouveau." };
  return { sonner: false };
}

/** Statuts qu'un signalement peut prendre depuis le téléphone. */
export const STATUTS_SIGNALEMENT = ["handled", "dismissed"];
