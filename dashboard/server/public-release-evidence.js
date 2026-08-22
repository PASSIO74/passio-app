// PUBLIC RELEASE EVIDENCE — prouve ce que le navigateur public reçoit réellement.
// Le Release Recorder décrit l'environnement du dashboard; ce module vérifie en
// plus le contrat `release.json` servi par l'application publique. Une panne réseau,
// un cache CDN ou une mauvaise URL ne doit jamais être transformé en preuve positive.
import { config } from "./config.js";

const CACHE_MS = Number(process.env.DASH_PUBLIC_RELEASE_CACHE_S || 30) * 1000;
const TIMEOUT_MS = Number(process.env.DASH_PUBLIC_RELEASE_TIMEOUT_MS || 3500);
// 12 caractères est un PLANCHER de sécurité, jamais un réglage abaissable.
// L'environnement peut demander davantage de preuve, pas en demander moins.
export const MIN_COMMIT_PROOF = Math.max(12, Number(process.env.DASH_PUBLIC_RELEASE_MIN_COMMIT_CHARS || 12) || 12);
let cached = null;
let cachedAt = 0;
let cachedKey = null;
let inflight = null;
let inflightKey = null;

function normalizeBase(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = ""; u.search = "";
    u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString().replace(/\/$/, "");
  } catch { return null; }
}

function normalizeCommit(v) {
  const s = String(v || "").trim().toLowerCase();
  return /^[0-9a-f]{7,64}$/.test(s) ? s : null;
}

function sameCommit(a, b) {
  const x = normalizeCommit(a);
  const y = normalizeCommit(b);
  if (!x || !y) return false;
  const common = Math.min(x.length, y.length);
  if (common < MIN_COMMIT_PROOF) return false;
  return x.slice(0, common) === y.slice(0, common);
}

export function publicEvidenceExpectationKey({ expectedCommit = null, expectedBuildId = null } = {}) {
  return JSON.stringify([String(expectedCommit || "").trim().toLowerCase(), String(expectedBuildId || "").trim()]);
}

export function publicReleaseConfigured() {
  return Boolean(normalizeBase(config.passioPublicUrl));
}

export function publicReleaseSnapshot() {
  return cached || {
    state: publicReleaseConfigured() ? "UNKNOWN" : "NOT_CONFIGURED",
    checkedAt: null,
    url: normalizeBase(config.passioPublicUrl),
    release: null,
    expected: null,
    error: publicReleaseConfigured() ? "preuve publique pas encore collectée" : "PASSIO_PUBLIC_URL non configurée",
  };
}

export function evaluatePublicRelease({ release, expectedCommit = null, expectedBuildId = null, checkedAt = new Date().toISOString(), url = null, error = null }) {
  const expected = { commit: expectedCommit || null, buildId: expectedBuildId || null };
  if (error) return { state: "UNAVAILABLE", checkedAt, url, release: null, expected, error: String(error).slice(0, 300), matches: null };
  if (!release || typeof release !== "object" || !release.buildId) {
    return { state: "UNAVAILABLE", checkedAt, url, release: release || null, expected, error: "release.json invalide ou sans buildId", matches: null };
  }

  const commitMatch = expectedCommit ? (release.commit ? sameCommit(release.commit, expectedCommit) : false) : null;
  const buildMatch = expectedBuildId ? release.buildId === expectedBuildId : null;
  const mismatches = [];
  if (commitMatch === false) mismatches.push(release.commit ? "commit" : "commit_missing");
  if (buildMatch === false) mismatches.push("buildId");
  return {
    state: mismatches.length ? "MISMATCH" : "LIVE",
    checkedAt, url, release, expected,
    matches: { commit: commitMatch, buildId: buildMatch },
    error: mismatches.length ? `preuve publique incompatible: ${mismatches.join(", ")}` : null,
  };
}

export async function refreshPublicReleaseEvidence({ force = false, expectedCommit = null, expectedBuildId = null } = {}) {
  const now = Date.now();
  const key = publicEvidenceExpectationKey({ expectedCommit, expectedBuildId });
  if (!force && cached && cachedKey === key && now - cachedAt < CACHE_MS) return cached;

  if (inflight) {
    if (inflightKey === key) return inflight;
    // Les attentes ont changé pendant une requête en vol. On ne lance pas deux
    // probes concurrentes, mais on ne réutilise JAMAIS le verdict de l'ancienne
    // révision : attendre sa fin puis sonder explicitement les nouvelles attentes.
    try { await inflight; } catch {}
    return refreshPublicReleaseEvidence({ force: true, expectedCommit, expectedBuildId });
  }

  const base = normalizeBase(config.passioPublicUrl);
  if (!base) {
    cached = {
      state: "NOT_CONFIGURED", checkedAt: null, url: null, release: null,
      expected: { commit: expectedCommit || null, buildId: expectedBuildId || null },
      error: "PASSIO_PUBLIC_URL non configurée",
    };
    cachedKey = key; cachedAt = now;
    return cached;
  }

  const probe = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(base + "/release.json", {
        cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const release = await res.json();
      cached = evaluatePublicRelease({ release, expectedCommit, expectedBuildId, checkedAt: new Date().toISOString(), url: base + "/release.json" });
    } catch (e) {
      cached = evaluatePublicRelease({
        error: e?.name === "AbortError" ? "timeout" : (e?.message || String(e)),
        expectedCommit, expectedBuildId,
        checkedAt: new Date().toISOString(), url: base + "/release.json",
      });
    } finally {
      clearTimeout(timer);
    }
    cachedKey = key;
    cachedAt = Date.now();
    return cached;
  })();

  inflight = probe;
  inflightKey = key;
  try { return await probe; }
  finally {
    if (inflight === probe) { inflight = null; inflightKey = null; }
  }
}

// Le provider est ré-évalué à CHAQUE cycle : une promotion locale ou un nouveau
// checkout ne doit pas laisser la sonde comparer le public à un ancien commit.
export function startPublicReleaseEvidence(expectationProvider = () => ({})) {
  const tick = () => {
    let expected = {};
    try { expected = expectationProvider() || {}; } catch { expected = {}; }
    return refreshPublicReleaseEvidence({
      force: true,
      expectedCommit: expected.expectedCommit || null,
      expectedBuildId: expected.expectedBuildId || null,
    }).catch(() => {});
  };
  tick();
  setInterval(tick, Math.max(CACHE_MS, 30_000)).unref();
}
