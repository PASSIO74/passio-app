// ═══════════════════════════════════════════════════════════════════════════
// CROISSANCE — l'onglet commerce du pilotage (2026-11-01)
//
// Question du pilote : « d'où viennent les inscrits, et lesquels restent ? ».
// La base agrège (migration_croissance_2026-11-01.sql) : `croissance_jour`
// (visites par source, liens créés / partagés / ouverts, inscriptions par
// source et par campagne) et `activite_jour` (un compte actif un jour donné,
// identité posée par le SERVEUR). `pilotage_croissance(p_jours)` rend le tout
// en une lecture ; ce module en fait ce que l'écran affiche. Pur : éprouvé par
// tests/unit/croissance.test.mjs.
//
// Rétention : un compte « revenu à J1 » a été actif le lendemain de sa
// création ; à J7, entre J7 et J13 ; à J30, entre J30 et J36. Une cohorte
// dont la fenêtre n'est pas encore ENTIÈREMENT passée n'a pas de taux : un
// compte d'hier n'est pas un compte perdu (même règle que l'activation).
// ═══════════════════════════════════════════════════════════════════════════

export const FENETRES_RETENTION = Object.freeze([
  Object.freeze({ cle: "j1", libelle: "J1", fin: 1 }),
  Object.freeze({ cle: "j7", libelle: "J7", fin: 13 }),
  Object.freeze({ cle: "j30", libelle: "J30", fin: 36 }),
]);

/** Libellés des sources (`src` posé par telemetry.js : une famille, jamais une adresse). */
export const LIBELLES_SOURCES = Object.freeze({
  direct: "Accès direct", lien: "Lien partagé dans PASSIO", instagram: "Instagram", facebook: "Facebook",
  tiktok: "TikTok", google: "Google", whatsapp: "WhatsApp", x: "X (Twitter)", linkedin: "LinkedIn",
  snapchat: "Snapchat", youtube: "YouTube", reddit: "Reddit", autre: "Autre site", external: "Autre site", qr: "Affiche (QR)",
});
export const libelleSource = (s) => LIBELLES_SOURCES[s] || String(s || "?");

const jourMs = (j) => Date.parse(String(j) + "T00:00:00Z");
const pct = (n, d) => (d > 0 ? Math.round((100 * n) / d) : null);

/** Somme des `n` d'une mesure, par valeur, triée du plus grand au plus petit. */
export function parValeur(cumul, mesure) {
  const m = new Map();
  for (const l of Array.isArray(cumul) ? cumul : []) {
    if (!l || l.mesure !== mesure) continue;
    const v = String(l.valeur || "?");
    m.set(v, (m.get(v) || 0) + (Number(l.n) || 0));
  }
  return [...m.entries()].map(([valeur, n]) => ({ valeur, n })).sort((a, b) => b.n - a.n || a.valeur.localeCompare(b.valeur));
}
const total = (l) => l.reduce((s, x) => s + x.n, 0);

/**
 * Une cohorte (comptes créés une même semaine) → ses taux, et `null` pour une
 * fenêtre pas encore passée pour TOUS ses comptes (le plus jeune, `dernier`).
 */
export function retentionCohorte(c, maintenant = Date.now()) {
  const dernier = jourMs(c && c.dernier);
  const taille = Number(c && c.taille) || 0;
  const out = { semaine: String((c && c.semaine) || ""), taille };
  for (const f of FENETRES_RETENTION) {
    // La fenêtre se termine à la FIN du jour dernier + f.fin.
    const mure = Number.isFinite(dernier) && maintenant >= dernier + (f.fin + 1) * 864e5;
    out[f.cle] = mure && taille ? pct(Number(c[f.cle]) || 0, taille) : null;
  }
  return out;
}

/** Ce que l'onglet Croissance affiche, depuis la réponse de `pilotage_croissance`. */
export function croissance(d, maintenant = Date.now()) {
  if (!d || typeof d !== "object") return null;
  const cumul = Array.isArray(d.cumul) ? d.cumul : [];
  const visites = parValeur(cumul, "visite");
  const inscriptions = parValeur(cumul, "inscription");
  const campagnes = parValeur(cumul, "campagne").filter((x) => x.valeur !== "?");
  const liens = {
    crees: total(parValeur(cumul, "lien_cree")), partages: total(parValeur(cumul, "lien_partage")),
    ouverts: total(parValeur(cumul, "lien_ouvert")), inscriptions: total(parValeur(cumul, "inscription_lien")),
    canaux: parValeur(cumul, "lien_partage"),
  };
  const nbInscriptions = total(inscriptions);
  // Conversion par source : inscriptions ÷ visites de la même source.
  const vis = new Map(visites.map((x) => [x.valeur, x.n]));
  const sources = [...new Set([...visites.map((x) => x.valeur), ...inscriptions.map((x) => x.valeur)])].map((s) => {
    const v = vis.get(s) || 0, i = (inscriptions.find((x) => x.valeur === s) || { n: 0 }).n;
    return { source: s, libelle: libelleSource(s), visites: v, inscriptions: i, conversion: pct(i, v) };
  }).sort((a, b) => b.inscriptions - a.inscriptions || b.visites - a.visites);
  const actifs = (Array.isArray(d.actifs) ? d.actifs : []).map((x) => ({ jour: String(x.jour), n: Number(x.n) || 0 }));
  const hier = new Date(maintenant - 864e5).toISOString().slice(0, 10);
  const actifsHier = (actifs.find((x) => x.jour === hier) || { n: null }).n;
  const sur7 = actifs.filter((x) => jourMs(x.jour) > maintenant - 8 * 864e5 && x.jour <= hier);
  const moyenne7 = sur7.length ? Math.round(sur7.reduce((s, x) => s + x.n, 0) / sur7.length) : null;
  const cohortes = (Array.isArray(d.cohortes) ? d.cohortes : []).map((c) => retentionCohorte(c, maintenant));
  return {
    jours: Number(d.jours) || 30,
    agregeLe: d.agrege_le || null,
    visites: total(visites), inscriptions: nbInscriptions, conversion: pct(nbInscriptions, total(visites)),
    sources, campagnes, liens,
    // Part des inscriptions venues d'un lien partagé par un membre : la boucle virale.
    viralite: pct(liens.inscriptions, nbInscriptions),
    actifs, actifsHier, moyenne7, cohortes,
  };
}
