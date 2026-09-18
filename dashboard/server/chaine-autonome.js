// ═══════════════════════════════════════════════════════════════════════════
// CHAÎNE AUTONOME — le poste est le TÉMOIN EXTÉRIEUR de GitHub (2026-09-18).
//
// La seule chaîne qui répare vraiment est celle de GitHub (sentinelle-autonome
// → claude-code → auto-merge → deploy). Le pilotage ne la montrait pas : il ne
// lisait que les issues `disponibilite`. Et GitHub désactive ses crons après
// 60 jours sans commit, saute des créneaux (les crons tournent 4 à 23 fois
// moins souvent qu'annoncé) : un cron mort ressemblait à « sonde vieille de
// 6 h ». Ce module lit, en lecture seule et par le client commun :
//   · l'état de chaque workflow (`active` / `disabled_*`) — cache 60 min ;
//   · les derniers runs des six crons + de deploy sur main ;
//   · les issues ouvertes (labels sentinelle/humain/recidive/moderation/
//     disponibilite/veille/digest/poste, titres [SENTINELLE DISTANTE] et
//     [SENTINELLE PAUSE]) et les PR ouvertes (claude/issue-*, sentinelle/*, et
//     les autres non brouillon) — TITRES tronqués à 120, jamais un corps :
//     un corps d'issue est une donnée d'inconnu.
// Les verdicts (`verdictsChaine`) sont PURS : par cron vit | en_retard |
// morte | desactive | unknown, une synthèse `chaine.etat` (vit / degradee /
// morte / pause / unknown) et la liste `attente[]` de ce qui attend un humain.
// Le tour périodique (15 min) lève UNE alerte `warn` par cron qui passe
// vit→morte/désactivé, `info` au retour — jamais `high` : la sentinelle
// lancerait une analyse Claude sur une panne de GitHub, sans rien à patcher.
// ═══════════════════════════════════════════════════════════════════════════
import { lireGithub, quotaGithub } from "./github-lecture.js";
import { JsonDb } from "./jsondb.js";
import { broadcast } from "./sse.js";

const WATCH_MS = Math.max(0, Number(process.env.DASH_CHAINE_WATCH_MIN ?? 15)) * 60_000;
const MEMO_MS = 60_000;
const H = 3_600_000;

// Tolérances : au-delà de `retardH` sans run terminé = en retard ; de `morteH` = morte.
export const CRONS = {
  "sentinelle-autonome.yml": { label: "Sentinelle autonome (enquêtes)", retardH: 8, morteH: 24, coeur: true },
  "sentinelle-distante.yml": { label: "Sentinelle distante (santé staging)", retardH: 12, morteH: 36 },
  "disponibilite.yml": { label: "Disponibilité du site", retardH: 6, morteH: 24 },
  "sauvegarde.yml": { label: "Sauvegarde quotidienne", retardH: 30, morteH: 54 },
  "moderation-alerte.yml": { label: "Alerte modération", retardH: 30, morteH: 54 },
  "veille-production.yml": { label: "Veille production", retardH: 3, morteH: 12 },
};
export const LABELS_ATTENTE = ["humain", "recidive", "moderation", "disponibilite", "veille", "digest", "poste"];
const PR_ENQUETE_MAX_H = 2;
const ISSUE_ENQUETE_MAX_H = 6;

const db = new JsonDb("chaine-autonome", { crons: {}, chaine: null, deploy: null, attenteCles: [], updatedAt: null });
let _timer = null;
let _memo = { t: 0, valeur: null };

const titre = (s) => String(s || "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 120);

function runsDe(r) {
  if (r.erreur && !r.data) return { erreur: r.erreur };
  const runs = (r.data && r.data.workflow_runs) || [];
  const termine = runs.find((x) => x.status === "completed") || null;
  const succes = runs.find((x) => x.conclusion === "success") || null;
  const enCours = runs.some((x) => x.status === "in_progress" || x.status === "queued");
  return {
    dernier: termine ? { conclusion: termine.conclusion, quand: termine.updated_at, url: termine.html_url, sha: termine.head_sha || null } : null,
    dernierSucces: succes ? { quand: succes.updated_at, url: succes.html_url, sha: succes.head_sha || null } : null,
    enCours, perime: Boolean(r.perime),
  };
}

/** Les mesures brutes. Aucun corps d'issue ou de PR n'est conservé. */
export async function mesurerChaine({ fetchImpl = null, now = Date.now() } = {}) {
  const get = (chemin, opts = {}) => lireGithub(chemin, { fetchImpl, now, ...opts });
  const depuis7j = new Date(now - 7 * 24 * H).toISOString().slice(0, 13) + ":00:00Z";
  const [wf, issues, pulls, deploy, fermees, ...runs] = await Promise.all([
    get("/actions/workflows?per_page=50", { cacheMs: 60 * 60_000 }),
    get("/issues?state=open&per_page=50"),
    get("/pulls?state=open&per_page=20"),
    get("/actions/workflows/deploy.yml/runs?branch=main&event=push&per_page=5&exclude_pull_requests=true"),
    // Ce que la chaîne a fait sur 7 jours (bilan « machines ») : lu moins souvent.
    get(`/issues?state=closed&labels=sentinelle&since=${encodeURIComponent(depuis7j)}&per_page=50`, { cacheMs: 30 * 60_000 }),
    ...Object.keys(CRONS).map((f) => get(`/actions/workflows/${f}/runs?per_page=5&exclude_pull_requests=true`)),
  ]);
  const workflows = wf.erreur && !wf.data ? { erreur: wf.erreur } : Object.fromEntries(((wf.data && wf.data.workflows) || []).map((w) => [String(w.path || "").split("/").pop(), w.state]));
  const parCron = {};
  Object.keys(CRONS).forEach((f, i) => { parCron[f] = runsDe(runs[i]); });
  const dep = runsDe(deploy);
  return {
    luLe: new Date(now).toISOString(),
    workflows,
    runs: parCron,
    deploy: dep,
    issues: issues.erreur && !issues.data ? { erreur: issues.erreur } : (issues.data || []).filter((i) => !i.pull_request).map((i) => ({
      numero: i.number, titre: titre(i.title), labels: (i.labels || []).map((l) => String(l.name || l)).slice(0, 10), depuis: i.created_at, url: i.html_url,
    })),
    pulls: pulls.erreur && !pulls.data ? { erreur: pulls.erreur } : (pulls.data || []).map((p) => ({
      numero: p.number, titre: titre(p.title), branche: String(p.head?.ref || "").slice(0, 120), brouillon: Boolean(p.draft), depuis: p.created_at, url: p.html_url, autoMerge: Boolean(p.auto_merge),
    })),
    fermees7j: fermees.erreur && !fermees.data ? { erreur: fermees.erreur } : (fermees.data || []).filter((i) => !i.pull_request).map((i) => ({
      numero: i.number, titre: titre(i.title), labels: (i.labels || []).map((l) => String(l.name || l)).slice(0, 10), fermeeLe: i.closed_at, url: i.html_url,
    })),
    quota: quotaGithub(now),
  };
}

const heures = (iso, now) => (iso ? (now - Date.parse(iso)) / H : null);

/** Verdicts purs : par cron, synthèse de la chaîne, ce qui attend un humain. */
export function verdictsChaine(m, now = Date.now()) {
  const crons = {};
  for (const [f, spec] of Object.entries(CRONS)) {
    const r = m.runs && m.runs[f];
    const state = m.workflows && !m.workflows.erreur ? m.workflows[f] : null;
    let etat, texte, ageH = null;
    if (state && state !== "active") { etat = "desactive"; texte = `workflow ${state} sur GitHub — à réactiver (Actions → ${f} → Enable)`; }
    else if (!r || r.erreur) { etat = "unknown"; texte = "runs non lus" + (r && r.erreur ? ` (${r.erreur})` : ""); }
    else if (!r.dernier) { etat = "unknown"; texte = "aucun run terminé trouvé"; }
    else {
      ageH = heures(r.dernier.quand, now);
      etat = ageH >= spec.morteH ? "morte" : ageH >= spec.retardH ? "en_retard" : "vit";
      texte = `dernier run ${r.dernier.conclusion} il y a ${Math.round(ageH)} h` + (r.dernier.conclusion !== "success" ? " — rouge" : "") + (r.perime ? " (lecture périmée)" : "");
    }
    crons[f] = { label: spec.label, etat, texte, ageH: ageH == null ? null : Math.round(ageH * 10) / 10, conclusion: r && r.dernier ? r.dernier.conclusion : null, url: r && r.dernier ? r.dernier.url : null, state: state || null };
  }

  const issues = Array.isArray(m.issues) ? m.issues : [];
  const pulls = Array.isArray(m.pulls) ? m.pulls : [];
  const pause = issues.some((i) => /^\[SENTINELLE PAUSE\]/i.test(i.titre));
  const etats = Object.values(crons).map((c) => c.etat);
  const coeur = crons["sentinelle-autonome.yml"];
  let chaine;
  if (pause) chaine = { etat: "pause", cause: "coupe-circuit [SENTINELLE PAUSE] ouvert : aucune enquête ne part" };
  else if (coeur.etat === "morte" || coeur.etat === "desactive") chaine = { etat: "morte", cause: `sentinelle autonome ${coeur.etat === "desactive" ? "désactivée" : "sans run depuis " + Math.round(coeur.ageH || 0) + " h"}` };
  else if (etats.some((e) => e === "morte" || e === "desactive" || e === "en_retard")) {
    const mauvais = Object.entries(crons).filter(([, c]) => c.etat !== "vit" && c.etat !== "unknown").map(([f, c]) => `${f} ${c.etat}`);
    chaine = { etat: "degradee", cause: mauvais.join(", ") };
  } else if (etats.every((e) => e === "unknown")) chaine = { etat: "unknown", cause: m.issues && m.issues.erreur ? `GitHub non lu (${m.issues.erreur})` : "GitHub non lu" };
  else chaine = { etat: "vit", cause: null };

  const attente = [];
  for (const i of issues) {
    const labels = i.labels || [];
    const age = heures(i.depuis, now);
    if (/^\[SENTINELLE PAUSE\]/i.test(i.titre)) attente.push({ type: "pause", numero: i.numero, titre: i.titre, depuis: i.depuis, url: i.url });
    else if (/^\[SENTINELLE DISTANTE\]/i.test(i.titre)) attente.push({ type: "sante_rouge", numero: i.numero, titre: i.titre, depuis: i.depuis, url: i.url });
    else {
      const label = LABELS_ATTENTE.find((l) => labels.includes(l));
      if (label) attente.push({ type: label, numero: i.numero, titre: i.titre, depuis: i.depuis, url: i.url });
      else if (labels.includes("sentinelle") && age != null && age > ISSUE_ENQUETE_MAX_H) attente.push({ type: "enquete_longue", numero: i.numero, titre: i.titre, depuis: i.depuis, url: i.url });
    }
  }
  for (const p of pulls) {
    if (p.brouillon) continue;
    const age = heures(p.depuis, now);
    if (/^claude\/issue-/.test(p.branche)) { if (age != null && age > PR_ENQUETE_MAX_H) attente.push({ type: "correctif_pr", numero: p.numero, titre: p.titre, depuis: p.depuis, url: p.url, autoMerge: p.autoMerge }); }
    else if (/^sentinelle\//.test(p.branche)) attente.push({ type: "correctif_pr", numero: p.numero, titre: p.titre, depuis: p.depuis, url: p.url, autoMerge: p.autoMerge });
    else attente.push({ type: "pr_ouverte", numero: p.numero, titre: p.titre, depuis: p.depuis, url: p.url, critique: null });
  }

  const d = m.deploy || {};
  const deploy = d.erreur ? { etat: "unknown", erreur: d.erreur } : {
    etat: d.dernier ? (d.dernier.conclusion === "success" ? "ok" : "rouge") : "unknown",
    headSha: d.dernierSucces ? d.dernierSucces.sha : null, quand: d.dernierSucces ? d.dernierSucces.quand : null,
    url: d.dernier ? d.dernier.url : null, enCours: Boolean(d.enCours), dernierConclusion: d.dernier ? d.dernier.conclusion : null,
  };

  return { crons, chaine, attente, deploy, enquetesOuvertes: issues.filter((i) => (i.labels || []).includes("sentinelle") && !(i.labels || []).includes("humain")).length };
}

/** Un tour : mesure, verdicts, alertes à la bascule (jamais high), persistance. Injectable. */
export async function chaineTick({ now = Date.now(), mesure = null, notify = null } = {}) {
  const m = await (mesure ? mesure() : mesurerChaine({ now }));
  const v = verdictsChaine(m, now);
  const prev = db.get();
  const alertes = [];
  const MORT = new Set(["morte", "desactive"]);
  for (const [f, c] of Object.entries(v.crons)) {
    const avant = prev.crons[f];
    if (!avant || c.etat === "unknown" || avant === "unknown") continue;
    if (!MORT.has(avant) && MORT.has(c.etat)) alertes.push({ key: "chaine:" + f, level: "warn", title: `Chaîne GitHub : ${c.label} ${c.etat === "desactive" ? "désactivée" : "morte"}`, message: c.texte, meta: { view: "exploitation", kind: "chaine", workflow: f }, source: "chaine-autonome", cooldownMs: 0 });
    else if (MORT.has(avant) && c.etat === "vit") alertes.push({ key: "chaine:" + f, level: "info", title: `Chaîne GitHub : ${c.label} de nouveau vivante`, message: c.texte, meta: { view: "exploitation", kind: "chaine", workflow: f }, source: "chaine-autonome", cooldownMs: 0 });
  }
  const cles = v.attente.map((a) => `${a.type}#${a.numero}`).sort();
  const changement = JSON.stringify(cles) !== JSON.stringify(prev.attenteCles || []);
  db.update((d) => { for (const [f, c] of Object.entries(v.crons)) if (c.etat !== "unknown") d.crons[f] = c.etat; d.chaine = v.chaine; if (v.deploy && v.deploy.etat !== "unknown") d.deploy = { ...v.deploy, luLe: now }; d.attenteCles = cles; d.updatedAt = now; });
  _memo = { t: now, valeur: { ...m, ...v } };
  if (alertes.length) {
    try {
      const raise = notify || (await import("./alerts.js")).raise;
      for (const a of alertes) { try { raise(a); } catch {} }
    } catch {}
  }
  if (changement) { try { broadcast("attente", { source: "chaine", n: cles.length }); } catch {} }
  return { mesures: m, verdicts: v, alertes, changement };
}

/** Instantané pour la route et pour attente.js — mémo 60 s (l'Accueil rejoue toutes les 10 s). */
export async function chaineAutonome({ now = Date.now(), force = false } = {}) {
  if (!force && _memo.valeur && now - _memo.t < MEMO_MS) return _memo.valeur;
  const m = await mesurerChaine({ now });
  const v = verdictsChaine(m, now);
  _memo = { t: now, valeur: { ...m, ...v } };
  return _memo.valeur;
}

/** Ce que le tour a persisté (sans réseau) : pour release-recorder et les tests. */
/** Ce que le tour a persisté (sans réseau) : `deploy` (dernier deploy main réussi) sert de preuve à release-recorder. */
export function chaineState() { return { ...db.get(), dernier: _memo.valeur ? { deploy: _memo.valeur.deploy, chaine: _memo.valeur.chaine, luLe: _memo.valeur.luLe } : null }; }

export function startChaineAutonome(everyMs = WATCH_MS, { immediate = false } = {}) {
  if (_timer || !everyMs) return _timer;
  if (immediate) chaineTick().catch(() => {});
  _timer = setInterval(() => { chaineTick().catch(() => {}); }, everyMs);
  if (typeof _timer.unref === "function") _timer.unref();
  return _timer;
}
export function stopChaineAutonome() { if (_timer) { clearInterval(_timer); _timer = null; } }

/** RÉSERVÉ AUX TESTS. */
export function _setStateForTests(next = {}) { db.update((d) => { d.crons = next.crons || {}; d.chaine = next.chaine || null; d.attenteCles = next.attenteCles || []; }); _memo = { t: 0, valeur: null }; return db.get(); }
