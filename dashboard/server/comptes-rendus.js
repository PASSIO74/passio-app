// ═══════════════════════════════════════════════════════════════════════════
// COMPTES RENDUS — les tableaux `[TABLEAU]` de GitHub lus par le pilotage (2026-09-18).
//
// Benjamin ne lit pas ses mails : la veille de production et le digest du
// matin doivent se voir dans le centre de pilotage. Chaque canal GitHub
// réécrit le corps d'UNE issue permanente `[TABLEAU] …` (label `tableau`,
// jamais `claude`) à chaque passage — éditer un corps n'envoie aucune
// notification — et ce module lit ces corps :
//   · `parserTableau(corps)` est PUR : marqueur `<!-- tableau:<kind> v1 -->`
//     en tête, en-tête « Mis à jour / Run / Alerte|Émis », puis les lignes de
//     signaux `[ok] cle — texte` (veille) ou le titre `# …` et le texte
//     (digest). TOUT texte est DONNÉE : corps borné à 20 000 caractères, ligne
//     à 400, URL et dates validées par motif strict, jamais interprété ; les
//     symboles sont cherchés par `Object.hasOwn` (`[constructor]` → unknown) ;
//   · `lireTableaux()` passe par le client commun `github-lecture.js` (cache
//     par URL, ETag, budget) : une seule requête `/issues?labels=tableau` ;
//   · `comptesRendus()` est mémorisé 5 min et joint `sentinelle` (enquêtes
//     ouvertes, fermées sur 7 j) depuis `chaineAutonome()` — mémo 60 s et cache
//     d'URL déjà en place : aucun appel GitHub supplémentaire.
// Une lecture en échec rend `erreur` et des valeurs null, jamais un faux vert.
// ═══════════════════════════════════════════════════════════════════════════
import { lireGithub } from "./github-lecture.js";
import { chaineAutonome } from "./chaine-autonome.js";

export const MEMO_MS = 5 * 60_000;
export const CORPS_MAX = 20_000;
export const LIGNE_MAX = 400;
const LIGNES_MAX = 40;
const TITRE_MAX = 200;
const EN_TETE_MAX = 8;

const MARQUEUR = /^<!--\s*tableau:([a-z]+)\s+v1\s*-->\s*$/;
const KINDS = new Set(["veille", "digest"]);
const SYMBOLES = { "ok": "ok", "ATTENTION": "warn", "ALERTE": "alert", "?": "unknown" };
const POIDS = { alert: 3, warn: 2, unknown: 1, ok: 0 };
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const URL_GITHUB = /^https:\/\/github\.com\/[A-Za-z0-9._~\/#?=&%-]{1,300}$/;

const propre = (s) => String(s || "").replace(/\r/g, "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ");
const isoOuNull = (s) => { const v = String(s || "").trim().slice(0, 40); return ISO.test(v) && Number.isFinite(Date.parse(v)) ? v : null; };
const urlOuNull = (s) => { const v = String(s || "").trim().slice(0, 320); return URL_GITHUB.test(v) ? v : null; };
const ouiNon = (s) => { const v = String(s || "").trim().toLowerCase(); return v === "oui" ? true : v === "non" ? false : null; };

/** Jetons lus dans le texte de la ligne `jetons` : jours du SENTINELLE_TOKEN, validité des deux autres. */
function lireJetons(texte) {
  const t = String(texte || "");
  const s = /SENTINELLE_TOKEN\s*(?::\s*(\d{1,4})\s*j\b|expire dans\s*(\d{1,4})\s*j\b|(refusé))/.exec(t);
  const etatDe = (nom) => { const m = new RegExp(nom + "\\s*(?::\\s*(ok|non lisible)|(refusé))").exec(t); return m ? (m[1] || m[2]) : null; };
  return {
    SENTINELLE_TOKEN: s ? (s[3] ? 0 : Number(s[1] ?? s[2])) : null,
    SUPABASE_ACCESS_TOKEN: etatDe("SUPABASE_ACCESS_TOKEN"),
    NETLIFY_AUTH_TOKEN: etatDe("NETLIFY_AUTH_TOKEN"),
  };
}

/**
 * PUR. Corps d'issue → tableau structuré, ou null si le marqueur manque (ou
 * si le kind n'est ni veille ni digest). Rien n'est interprété : chaque champ
 * est validé par motif ou gardé comme texte borné.
 */
export function parserTableau(corps) {
  const lignes = propre(corps).slice(0, CORPS_MAX).split("\n").map((l) => l.slice(0, LIGNE_MAX));
  const m = MARQUEUR.exec((lignes[0] || "").trim());
  if (!m || !KINDS.has(m[1])) return null;
  const kind = m[1];
  const enTete = { majLe: null, run: null, alerte: null, emis: null };
  let i = 1;
  for (; i < lignes.length && i <= EN_TETE_MAX; i++) {
    const l = lignes[i].trim();
    if (l === "") { i++; break; }
    const c = /^([^:]{1,20}?)\s*:\s*(.*)$/.exec(l);
    if (!c) continue;
    const champ = c[1].trim().toLowerCase();
    if (champ === "mis à jour") enTete.majLe = isoOuNull(c[2]);
    else if (champ === "run") enTete.run = urlOuNull(c[2]);
    else if (champ === "alerte") enTete.alerte = ouiNon(c[2]);
    else if (champ === "émis" || champ === "emis") enTete.emis = ouiNon(c[2]);
  }
  const contenu = lignes.slice(i);
  if (kind === "veille") {
    const signaux = [];
    for (const l of contenu) {
      if (signaux.length >= LIGNES_MAX) break;
      const s = /^\[([^\]]{1,12})\]\s+(\S{1,40})\s+—\s?(.*)$/.exec(l.trim());
      if (!s) continue;
      signaux.push({ etat: Object.hasOwn(SYMBOLES, s[1]) ? SYMBOLES[s[1]] : "unknown", cle: s[2], texte: s[3] });
    }
    const jetonsLigne = signaux.find((s) => s.cle === "jetons");
    return { kind, majLe: enTete.majLe, run: enTete.run, alerte: enTete.alerte, lignes: signaux, jetons: lireJetons(jetonsLigne ? jetonsLigne.texte : "") };
  }
  let titre = null;
  let debut = 0;
  for (; debut < contenu.length; debut++) {
    const l = contenu[debut].trim();
    if (l === "") continue;
    if (l.startsWith("# ")) { titre = l.slice(2).trim().slice(0, TITRE_MAX); debut++; }
    break;
  }
  return { kind, majLe: enTete.majLe, run: enTete.run, emis: enTete.emis, titre, texte: contenu.slice(debut).join("\n").trim() };
}

/** Le pire état des lignes : alert > warn > unknown > ok ; sans ligne, unknown. Un état hors des quatre (y compris `constructor`) vaut unknown. */
export function etatGlobal(lignes) {
  if (!Array.isArray(lignes) || !lignes.length) return "unknown";
  const connu = (e) => (Object.hasOwn(POIDS, e) ? e : "unknown");
  return lignes.reduce((pire, l) => { const e = connu(l && l.etat); return POIDS[e] > POIDS[pire] ? e : pire; }, "ok");
}

const ageMinDe = (iso, now) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 60_000)) : null; };

/**
 * Lit les issues ouvertes `tableau` par le client commun ; ignore les pull
 * requests et les corps sans marqueur. Rend `{ veille, digest, luLe, erreur? }` ;
 * à deux tableaux du même kind, le plus récemment mis à jour l'emporte.
 */
export async function lireTableaux({ fetchImpl = null, now = Date.now() } = {}) {
  const r = await lireGithub("/issues?state=open&labels=tableau&per_page=10", { fetchImpl, now });
  const luLe = new Date(now).toISOString();
  if (r.erreur && !r.data) return { veille: null, digest: null, luLe, erreur: r.erreur };
  const out = { veille: null, digest: null, luLe };
  if (r.erreur) out.erreur = r.erreur;
  if (r.perime) out.perime = true;
  for (const i of Array.isArray(r.data) ? r.data : []) {
    if (!i || i.pull_request) continue;
    const p = parserTableau(i.body);
    if (!p) continue;
    const entree = { ...p, numero: Number(i.number) || null, url: urlOuNull(i.html_url) };
    const actuel = out[p.kind];
    if (!actuel || (Date.parse(p.majLe || 0) || 0) > (Date.parse(actuel.majLe || 0) || 0)) out[p.kind] = entree;
  }
  return out;
}

/** Enquêtes de la sentinelle GitHub, depuis la mesure déjà mémorisée de la chaîne (titres seulement). */
function sentinelleDe(ch) {
  if (!ch) return { ouvertes: null, fermees7j: null, erreur: "chaîne GitHub non lue" };
  const issues = Array.isArray(ch.issues) ? ch.issues : null;
  const fermees = Array.isArray(ch.fermees7j) ? ch.fermees7j : null;
  const s = {
    ouvertes: issues ? issues.filter((i) => (i.labels || []).includes("sentinelle")).map((i) => ({ numero: i.numero, titre: i.titre, url: urlOuNull(i.url), labels: i.labels || [], depuis: i.depuis })) : null,
    fermees7j: fermees ? fermees.map((i) => ({ numero: i.numero, titre: i.titre, url: urlOuNull(i.url), fermeeLe: i.fermeeLe })) : null,
  };
  const erreurs = [issues ? null : `ouvertes : ${(ch.issues && ch.issues.erreur) || "non lues"}`, fermees ? null : `fermées : ${(ch.fermees7j && ch.fermees7j.erreur) || "non lues"}`].filter(Boolean);
  if (erreurs.length) s.erreur = erreurs.join(" ; ");
  return s;
}

let _memo = { t: 0, valeur: null };
let _deps = { chaineAutonome };

/** Instantané pour la route, l'Accueil, le Pilot mobile et attente.js — mémo 5 min. */
export async function comptesRendus({ now = Date.now(), force = false, fetchImpl = null } = {}) {
  if (!force && _memo.valeur && now - _memo.t < MEMO_MS) return _memo.valeur;
  const [t, ch] = await Promise.all([
    lireTableaux({ fetchImpl, now }).catch((e) => ({ veille: null, digest: null, luLe: new Date(now).toISOString(), erreur: String(e && e.message || e).slice(0, 120) })),
    Promise.resolve().then(() => _deps.chaineAutonome({ now })).catch(() => null),
  ]);
  const v = t.veille;
  const d = t.digest;
  const valeur = {
    luLe: t.luLe,
    veille: v ? { numero: v.numero, url: v.url, majLe: v.majLe, run: v.run, alerte: v.alerte, etat: etatGlobal(v.lignes), lignes: v.lignes, jetons: v.jetons, ageMin: ageMinDe(v.majLe, now) } : null,
    digest: d ? { numero: d.numero, url: d.url, majLe: d.majLe, run: d.run, emis: d.emis, titre: d.titre, texte: d.texte, ageMin: ageMinDe(d.majLe, now) } : null,
    sentinelle: sentinelleDe(ch),
  };
  if (t.erreur) valeur.erreur = t.erreur;
  if (t.perime) valeur.perime = true;
  _memo = { t: now, valeur };
  return valeur;
}

/** RÉSERVÉ AUX TESTS. */
export function _resetComptesRendusForTests() { _memo = { t: 0, valeur: null }; _deps = { chaineAutonome }; }
export function _setDepsForTests({ chaineAutonome: c = null } = {}) { _deps = { chaineAutonome: c || chaineAutonome }; }
