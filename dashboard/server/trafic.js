// ═══════════════════════════════════════════════════════════════════════════
// TRAFIC HORS PUBLIC — robots, émulations, équipe (2026-10-05)
//
// Mesuré en production du 28/09 au 04/10 : 19 appareils sans compte, dont 15
// qui n'étaient personne — dix « iPhone » 390 × 844 déclarant une connexion
// « 4g », arrivés 13 à 16 min après chaque fusion sur `main`, zéro clic. Les
// visiteurs et l'entonnoir des liens les comptaient : le taux de conversion
// mesurait nos propres vérifications d'après déploiement.
//
// Le CLIENT décide (js/telemetry.js pose `meta.trafic` sur chaque événement
// d'un tel appareil). Ce module ne fait que LIRE, plus un rattrapage :
// ⚠️ un événement iOS qui porte une connexion (`navigator.connection`) vient
// d'un moteur Chromium — aucun navigateur iOS n'expose cette API. C'est ce qui
// classe les lignes d'AVANT ce lot, et celles d'un ancien client gardé en cache
// par une PWA, qui n'estampille rien.
//
// ⚠️ ON N'EXCLUT QUE DES CHIFFRES D'AUDIENCE (visiteurs, liens, appareils en
// ligne). Les événements restent dans le flux : une erreur vue par un robot est
// une erreur de la production, et « Problèmes » doit continuer de la montrer.
//
// ⚠️ MÊME CONTRAT que `traficHorsPublic` dans supabase/functions/_shared/
// pilotage.js (téléphone) et que `filtrePublic()` de scripts/veille-production.mjs
// (veille, digest) : trois lecteurs, une définition. Le banc
// tests/unit/trafic-hors-public.test.mjs les confronte cas par cas — le
// dashboard n'importe rien hors de son dossier (Render le déploie seul).
// ═══════════════════════════════════════════════════════════════════════════

/** Valeurs que le client sait poser. Toute autre valeur est ignorée (public). */
export const TRAFICS_HORS_PUBLIC = Object.freeze(["robot", "emulation", "equipe"]);

/**
 * Classe un événement de télémétrie : `"robot" | "emulation" | "equipe"` s'il
 * ne vient pas du public, `null` sinon. Accepte la ligne de la base comme
 * l'événement normalisé (`meta.trafic`), ou une ligne aplatie (`trafic`).
 */
export function traficHorsPublic(ev) {
  if (!ev || typeof ev !== "object") return null;
  const m = ev.meta && typeof ev.meta === "object" ? ev.meta : null;
  const t = m && m.trafic != null ? m.trafic : ev.trafic;
  if (typeof t === "string" && TRAFICS_HORS_PUBLIC.includes(t)) return t;
  if (ev.platform === "ios" && typeof ev.connection === "string" && ev.connection !== "") return "emulation";
  return null;
}

/** Ventile une liste de classes (`null` = public) en compteurs lisibles. */
export function ventilerTrafic(classes) {
  const out = { total: 0, robot: 0, emulation: 0, equipe: 0 };
  for (const c of classes || []) {
    if (!c || !Object.prototype.hasOwnProperty.call(out, c) || c === "total") continue;
    out[c]++; out.total++;
  }
  return out;
}
