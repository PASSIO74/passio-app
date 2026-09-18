// ═══════════════════════════════════════════════════════════════════════════
// LECTURE GITHUB — le client commun du pilotage (2026-09-18).
//
// Le dépôt est public : on lit l'API REST sans jeton, 60 requêtes/h par IP.
// exploitation.js en consommait jusqu'à 18 ; la chaîne autonome (workflows,
// runs, issues, PR) en ajoute ~9 par tour. Sans discipline commune, le quota
// tombe à 0, tout devient « unknown » et rien ne le dit. Ce module :
//   · met en cache CHAQUE URL (10 min par défaut, réglable par appel) ;
//   · envoie `If-None-Match` : un 304 ne coûte rien au quota GitHub et n'est
//     pas compté dans le budget local ;
//   · lit `X-RateLimit-Remaining`/`Reset` et les expose (`quotaGithub()`) ;
//   · BUDGÈTE sans jeton : au plus 40 requêtes comptées par heure glissante ;
//     au-delà, la réponse en cache (même périmée) est servie, sinon une erreur
//     nommée « budget » — jamais un faux vert ;
//   · accepte un jeton de LECTURE facultatif (GITHUB_READ_TOKEN, fine-grained,
//     lecture seule Actions/Issues/PR — distinct du GITHUB_TOKEN `repo` de la
//     publication) : 5 000/h ;
//   · ne fait AUCUN réseau à l'import, et rien du tout quand
//     DASH_GITHUB_READ=off (tests, serveur de test) — sauf si un `fetchImpl`
//     est injecté, ce qui est justement la façon de le tester.
// ═══════════════════════════════════════════════════════════════════════════
export const DEPOT = "PASSIO74/passio-app";
const CACHE_MS = 10 * 60_000;
const ERREUR_CACHE_MS = 5 * 60_000;
const BUDGET_SANS_JETON = 40;
const FENETRE_MS = 3_600_000;
const TIMEOUT_MS = 8000;

const ACTIF = process.env.DASH_GITHUB_READ !== "off";
const TOKEN = String(process.env.GITHUB_READ_TOKEN || "");

const cache = new Map();            // url -> { t, etag, data, erreur, ttl }
let requetes = [];                  // horodatages des requêtes comptées (heure glissante)
const quota = { remaining: null, reset: null, lastStatus: null, lastError: null, lastAt: null };

function url(chemin) {
  if (/^https?:\/\//.test(chemin)) return chemin;
  return `https://api.github.com/repos/${DEPOT}${chemin.startsWith("/") ? "" : "/"}${chemin}`;
}

function lireEntete(r, nom) {
  try { return r && r.headers && typeof r.headers.get === "function" ? r.headers.get(nom) : null; } catch { return null; }
}

/** Budget restant sur l'heure glissante (sans jeton). Pur sur `requetes`. */
export function budgetRestant(now = Date.now()) {
  requetes = requetes.filter((t) => now - t < FENETRE_MS);
  return TOKEN ? Infinity : Math.max(0, BUDGET_SANS_JETON - requetes.length);
}

/**
 * Lit un chemin de l'API du dépôt. Retourne toujours un objet : `{ data, luLe,
 * deCache }` ou `{ erreur, deCache? }`. N'importe quelle exception réseau
 * devient une erreur nommée, jamais une exception.
 */
export async function lireGithub(chemin, { fetchImpl = null, now = Date.now(), cacheMs = CACHE_MS, force = false } = {}) {
  const u = url(chemin);
  const c = cache.get(u);
  if (!force && c && now - c.t < (c.ttl ?? cacheMs)) return c.erreur ? { erreur: c.erreur, deCache: true } : { data: c.data, luLe: c.t, deCache: true };
  if (!fetchImpl && !ACTIF) return c && !c.erreur ? { data: c.data, luLe: c.t, deCache: true, perime: true } : { erreur: "lecture GitHub désactivée (DASH_GITHUB_READ=off)" };
  if (budgetRestant(now) <= 0) {
    quota.lastError = "budget";
    return c && !c.erreur ? { data: c.data, luLe: c.t, deCache: true, perime: true } : { erreur: `budget GitHub épuisé (${BUDGET_SANS_JETON}/h sans jeton)` };
  }
  const f = fetchImpl || globalThis.fetch;
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "passio-pilotage" };
  if (c && c.etag) headers["If-None-Match"] = c.etag;
  if (TOKEN && !fetchImpl) headers.Authorization = `Bearer ${TOKEN}`;
  let r;
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  try {
    r = await f(u, { headers, signal: ctrl ? ctrl.signal : undefined });
  } catch (e) {
    if (timer) clearTimeout(timer);
    const erreur = String(e && e.message || e).slice(0, 120);
    quota.lastError = erreur; quota.lastAt = now;
    cache.set(u, { t: now, etag: c?.etag || null, data: c?.data, erreur, ttl: ERREUR_CACHE_MS });
    return c && c.data !== undefined ? { data: c.data, luLe: c.t, deCache: true, perime: true, erreur } : { erreur };
  }
  if (timer) clearTimeout(timer);
  const status = Number(r && r.status) || (r && r.ok ? 200 : 0);
  quota.lastStatus = status; quota.lastAt = now;
  const remaining = lireEntete(r, "x-ratelimit-remaining");
  const reset = lireEntete(r, "x-ratelimit-reset");
  if (remaining != null) quota.remaining = Number(remaining);
  if (reset != null) quota.reset = Number(reset) * 1000;
  if (status === 304 && c) {
    cache.set(u, { ...c, t: now, erreur: null, ttl: cacheMs });
    return { data: c.data, luLe: now, deCache: true, revalide: true };
  }
  requetes.push(now);
  if (!(r && r.ok)) {
    const erreur = "HTTP " + status;
    quota.lastError = erreur;
    cache.set(u, { t: now, etag: c?.etag || null, data: c?.data, erreur, ttl: ERREUR_CACHE_MS });
    return { erreur };
  }
  let data;
  try { data = await r.json(); } catch (e) { const erreur = "JSON invalide"; cache.set(u, { t: now, etag: null, data: undefined, erreur, ttl: ERREUR_CACHE_MS }); return { erreur }; }
  quota.lastError = null;
  cache.set(u, { t: now, etag: lireEntete(r, "etag"), data, erreur: null, ttl: cacheMs });
  return { data, luLe: now, deCache: false };
}

/** État du quota, pour les écrans et les verdicts (jamais le jeton lui-même). */
export function quotaGithub(now = Date.now()) {
  return {
    actif: ACTIF, token: Boolean(TOKEN), remaining: quota.remaining, reset: quota.reset,
    lastStatus: quota.lastStatus, lastError: quota.lastError, lastAt: quota.lastAt,
    comptees1h: requetes.filter((t) => now - t < FENETRE_MS).length, budget: TOKEN ? null : BUDGET_SANS_JETON,
    enCache: cache.size,
  };
}

export function _viderCacheGithubPourTests() { cache.clear(); requetes = []; quota.remaining = null; quota.reset = null; quota.lastStatus = null; quota.lastError = null; }
