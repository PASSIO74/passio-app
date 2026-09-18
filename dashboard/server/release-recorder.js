// RELEASE FLIGHT RECORDER — deterministic chronology around code/deploy health.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { lireRevision } from "./git-revision.js";
import { JsonDb } from "./jsondb.js";
import {
  publicReleaseSnapshot,
  publicReleaseConfigured,
  startPublicReleaseEvidence,
  publicEvidenceExpectationKey,
  MIN_COMMIT_PROOF,
} from "./public-release-evidence.js";
import { chaineState } from "./chaine-autonome.js";

const db = new JsonDb("release-recorder", { snapshots: [] });
const KEEP = Number(process.env.DASH_RELEASE_KEEP || 120);

function normalizeCommit(v) {
  const s = String(v || "").trim().toLowerCase();
  return /^[0-9a-f]{7,64}$/.test(s) ? s : null;
}

function sameCommit(a, b) {
  const x = normalizeCommit(a);
  const y = normalizeCommit(b);
  if (!x || !y) return false;
  const common = Math.min(x.length, y.length);
  return common >= MIN_COMMIT_PROOF && x.slice(0, common) === y.slice(0, common);
}

// La lecture de `.git` vit dans git-revision.js : elle sait lire un dépôt
// principal (dossier) ET un worktree (fichier `gitdir:`, références dans le
// dépôt commun). Avant, un worktree rendait branch/revision null — l'instantané
// disait « detached » ou rien, et la comparaison avec la preuve publique perdait
// son ancre.
function readRef() {
  const { branch, sha } = lireRevision(config.repoPath);
  return { branch, revision: sha ? sha.slice(0, 12) : null, fullRevision: sha || null };
}

function localReleaseManifest() {
  const candidates = [
    path.join(config.repoPath, "dist", "release.json"),
    path.join(config.repoPath, "release.json"),
  ];
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed && typeof parsed === "object" && parsed.buildId) return parsed;
    } catch {}
  }
  return null;
}

/** Le poste (aucune variable de build) : la preuve vient de GitHub, pas du checkout local. */
function surLePoste() { return !process.env.NETLIFY && !process.env.DEPLOY_PROVIDER; }

/** Dernier déploiement main réussi, tel que chaine-autonome.js l'a lu (persisté). */
function dernierDeployMain() {
  try { const c = chaineState(); return c && c.deploy && c.deploy.headSha ? c.deploy : null; } catch { return null; }
}

export function publicReleaseExpectations() {
  const local = localReleaseManifest();
  let expectedCommit;
  if (surLePoste()) {
    // ⚠️ Plus jamais le HEAD local : sur le poste, HEAD est une branche de
    // travail (mesuré : telemetrie-refus-auth-attendu), et comparer le site
    // public à un checkout de feature produisait MISMATCH en régime normal
    // (2026-09-18). L'attente est le head_sha du dernier deploy main réussi.
    const dep = dernierDeployMain();
    expectedCommit = dep ? dep.headSha : null;
  } else {
    const git = readRef();
    expectedCommit = process.env.COMMIT_REF || process.env.GITHUB_SHA || git.fullRevision || git.revision || null;
  }
  // Un buildId local ne vaut comme attente que si son manifeste est lui-même lié
  // au commit courant avec EXACTEMENT la même force de preuve que la sonde publique.
  const expectedBuildId = local?.commit && expectedCommit && sameCommit(local.commit, expectedCommit)
    ? local.buildId : null;
  return { expectedCommit, expectedBuildId };
}

/**
 * Verdict de release SUR LE POSTE, pur : preuve = release.json public comparé
 * au head_sha du dernier deploy main réussi (GitHub). LIVE quand ils
 * coïncident, DEGRADED (verdict MISMATCH) quand le site sert autre chose —
 * « déploiement en cours » si un run deploy tourne —, UNKNOWN tant que l'une
 * des deux sources n'est pas lue, NOT_CONFIGURED seulement si l'URL publique
 * manque. Jamais un NOT_CONFIGURED structurel pour des variables de build
 * Netlify qui n'existeront jamais sur le poste.
 */
export function verdictReleasePoste({ publicConfigured, publicEvidence, publicAligned, deploy }) {
  if (!publicConfigured) return { state: "NOT_CONFIGURED", verdict: "NOT_CONFIGURED", missing: ["PASSIO_PUBLIC_URL"], detail: "PASSIO_PUBLIC_URL absente de .env : la preuve publique (release.json) ne peut pas être lue" };
  if (!deploy || !deploy.headSha) return { state: "UNKNOWN", verdict: "UNKNOWN", missing: ["dernier deploy main (GitHub)"], detail: "dernier déploiement main non encore lu sur GitHub — preuve en attente" };
  const sha8 = String(deploy.headSha).slice(0, 8);
  if (publicEvidence && publicEvidence.state === "LIVE" && publicAligned) return { state: "LIVE", verdict: "LIVE", missing: [], detail: `release.json public = dernier deploy main ${sha8} (${deploy.quand || "?"})` };
  if (publicEvidence && publicEvidence.state === "MISMATCH" && publicAligned) {
    return { state: "DEGRADED", verdict: "MISMATCH", missing: ["public release:MISMATCH"], detail: deploy.enCours ? `le site public ne sert pas encore ${sha8} — déploiement en cours` : `le site public sert un autre commit que le dernier deploy main ${sha8} (CDN en retard ou déploiement bloqué)` };
  }
  return { state: "UNKNOWN", verdict: "UNKNOWN", missing: [`public release:${publicEvidence ? publicEvidence.state : "?"}${publicAligned ? "" : ":STALE_EXPECTATION"}`], detail: `preuve publique non concluante : ${publicEvidence && publicEvidence.error ? publicEvidence.error : (publicEvidence ? publicEvidence.state : "non lue")}` };
}

export function releaseSnapshot(extra = {}) {
  const git = readRef();
  return {
    at: new Date().toISOString(),
    branch: git.branch,
    revision: git.revision,
    appVersion: process.env.PASSIO_APP_VERSION || null,
    dbVersion: process.env.PASSIO_DB_VERSION || null,
    deployId: process.env.DEPLOY_ID || process.env.COMMIT_REF || null,
    deployUrl: process.env.DEPLOY_PRIME_URL || process.env.URL || null,
    provider: process.env.NETLIFY ? "netlify" : (process.env.DEPLOY_PROVIDER || null),
    ...extra,
  };
}

export function recordRelease(extra = {}) {
  const snap = releaseSnapshot(extra);
  db.update((d) => {
    const prev = d.snapshots[0];
    if (prev && prev.revision === snap.revision && prev.deployId === snap.deployId && prev.appVersion === snap.appVersion && prev.dbVersion === snap.dbVersion) {
      prev.lastSeenAt = snap.at;
      return;
    }
    d.snapshots.unshift(snap);
    if (d.snapshots.length > KEEP) d.snapshots.length = KEEP;
  });
  return snap;
}

export function releaseHistory(limit = 30) { return db.get().snapshots.slice(0, limit); }

export function releaseHealth() {
  const current = releaseSnapshot();
  const expectations = publicReleaseExpectations();
  const publicEvidence = publicReleaseSnapshot();
  const evidenceKey = publicEvidenceExpectationKey({
    expectedCommit: publicEvidence?.expected?.commit || null,
    expectedBuildId: publicEvidence?.expected?.buildId || null,
  });
  const currentKey = publicEvidenceExpectationKey(expectations);
  const publicAligned = evidenceKey === currentKey;
  if (surLePoste()) {
    const v = verdictReleasePoste({ publicConfigured: publicReleaseConfigured(), publicEvidence, publicAligned, deploy: dernierDeployMain() });
    return { ...v, current, public: publicEvidence, publicExpected: expectations, publicAligned, publicRequired: false, source: "github_deploy+release_json" };
  }
  const missing = [];
  if (!current.revision) missing.push("commit");
  if (!current.appVersion) missing.push("frontend version");
  if (!current.dbVersion) missing.push("DB version");
  if (!current.deployId) missing.push("deploy id");

  // En production, une preuve LIVE calculée pour une ancienne révision est STALE,
  // même si le prochain probe périodique n'a pas encore démarré.
  const publicRequired = config.isProd;
  const publicOk = publicEvidence.state === "LIVE" && publicAligned;
  if (publicRequired && !publicOk) {
    missing.push(`public release:${publicEvidence.state}${publicAligned ? "" : ":STALE_EXPECTATION"}`);
  }

  const state = missing.length === 0 ? "LIVE"
    : publicRequired && !publicOk ? "DEGRADED"
    : missing.length <= 2 ? "DEGRADED" : "NOT_CONFIGURED";
  return {
    state,
    current,
    public: publicEvidence,
    publicExpected: expectations,
    publicAligned,
    publicRequired,
    missing,
    detail: missing.length ? `preuves manquantes/incompatibles: ${missing.join(", ")}` : "commit → deploy → navigateur public → app → DB corrélés",
  };
}

export function startReleaseRecorder() {
  // Les DEUX appels sont protégés (revue du 2026-09-13) : `recordRelease` lit le
  // dépôt et écrit un JsonDb ; une exception au boot remontait dans `startIngest()`
  // — lancée sans `.catch` — et tuait le serveur avant toute ingestion ; une
  // exception dans le minuteur le tuait une minute plus tard. L'enregistrement
  // de révision est une preuve, pas une condition de vie du pilotage.
  const sur = (source) => {
    try { recordRelease({ source }); }
    catch (e) { console.error(`[release-recorder] enregistrement ${source} échoué :`, e && (e.code || e.message)); }
  };
  sur("dashboard_boot");
  try { startPublicReleaseEvidence(publicReleaseExpectations); }
  catch (e) { console.error("[release-recorder] preuve publique non démarrée :", e && (e.code || e.message)); }
  setInterval(() => sur("periodic"), 60_000).unref();
}
