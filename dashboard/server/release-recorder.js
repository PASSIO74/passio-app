// RELEASE FLIGHT RECORDER — deterministic chronology around code/deploy health.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { JsonDb } from "./jsondb.js";
import { publicReleaseSnapshot, startPublicReleaseEvidence, publicEvidenceExpectationKey } from "./public-release-evidence.js";

const db = new JsonDb("release-recorder", { snapshots: [] });
const KEEP = Number(process.env.DASH_RELEASE_KEEP || 120);
const MIN_COMMIT_PROOF = Number(process.env.DASH_PUBLIC_RELEASE_MIN_COMMIT_CHARS || 12);

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

function readRef() {
  try {
    const gitDir = path.join(config.repoPath, ".git");
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref:")) return { branch: "detached", revision: head.slice(0, 12), fullRevision: head };
    const ref = head.slice(4).trim();
    let sha = null;
    try { sha = fs.readFileSync(path.join(gitDir, ref), "utf8").trim(); }
    catch {
      const packed = fs.readFileSync(path.join(gitDir, "packed-refs"), "utf8");
      const line = packed.split("\n").find((l) => l.endsWith(" " + ref));
      sha = line ? line.split(" ")[0] : null;
    }
    return { branch: ref.replace(/^refs\/heads\//, ""), revision: sha ? sha.slice(0, 12) : null, fullRevision: sha || null };
  } catch { return { branch: null, revision: null, fullRevision: null }; }
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

export function publicReleaseExpectations() {
  const git = readRef();
  const local = localReleaseManifest();
  const expectedCommit = process.env.COMMIT_REF || process.env.GITHUB_SHA || git.fullRevision || git.revision || null;
  // Un buildId local ne vaut comme attente que si son manifeste est lui-même lié
  // au commit courant avec la même force de preuve que la sonde publique.
  const expectedBuildId = local?.commit && expectedCommit && sameCommit(local.commit, expectedCommit)
    ? local.buildId : null;
  return { expectedCommit, expectedBuildId };
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
  recordRelease({ source: "dashboard_boot" });
  startPublicReleaseEvidence(publicReleaseExpectations);
  setInterval(() => recordRelease({ source: "periodic" }), 60_000).unref();
}
