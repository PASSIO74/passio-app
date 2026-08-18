// RELEASE FLIGHT RECORDER — deterministic chronology around code/deploy health.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { JsonDb } from "./jsondb.js";
import { publicReleaseSnapshot, startPublicReleaseEvidence } from "./public-release-evidence.js";

const db = new JsonDb("release-recorder", { snapshots: [] });
const KEEP = Number(process.env.DASH_RELEASE_KEEP || 120);

function readRef() {
  try {
    const gitDir = path.join(config.repoPath, ".git");
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref:")) return { branch: "detached", revision: head.slice(0, 12) };
    const ref = head.slice(4).trim();
    let sha = null;
    try { sha = fs.readFileSync(path.join(gitDir, ref), "utf8").trim(); }
    catch {
      const packed = fs.readFileSync(path.join(gitDir, "packed-refs"), "utf8");
      const line = packed.split("\n").find((l) => l.endsWith(" " + ref));
      sha = line ? line.split(" ")[0] : null;
    }
    return { branch: ref.replace(/^refs\/heads\//, ""), revision: sha ? sha.slice(0, 12) : null };
  } catch { return { branch: null, revision: null }; }
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
  const publicEvidence = publicReleaseSnapshot();
  const missing = [];
  if (!current.revision) missing.push("commit");
  if (!current.appVersion) missing.push("frontend version");
  if (!current.dbVersion) missing.push("DB version");
  if (!current.deployId) missing.push("deploy id");

  // En production, le navigateur public fait partie de la preuve critique :
  // NOT_CONFIGURED/UNKNOWN/UNAVAILABLE/MISMATCH ne peuvent jamais produire LIVE.
  const publicRequired = config.isProd;
  const publicOk = publicEvidence.state === "LIVE";
  if (publicRequired && !publicOk) missing.push(`public release:${publicEvidence.state}`);

  const state = missing.length === 0 ? "LIVE"
    : publicRequired && !publicOk ? "DEGRADED"
    : missing.length <= 2 ? "DEGRADED" : "NOT_CONFIGURED";
  return {
    state,
    current,
    public: publicEvidence,
    publicRequired,
    missing,
    detail: missing.length ? `preuves manquantes/incompatibles: ${missing.join(", ")}` : "commit → deploy → navigateur public → app → DB corrélés",
  };
}

export function startReleaseRecorder() {
  recordRelease({ source: "dashboard_boot" });
  startPublicReleaseEvidence();
  setInterval(() => recordRelease({ source: "periodic" }), 60_000).unref();
}
