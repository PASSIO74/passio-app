// CONTROL HISTORY — flight recorder décisionnel du cockpit.
// Capture des snapshots bornés et compare le présent au dernier état réellement
// différent. Pas de pourcentage inventé : si aucune référence n'existe, on dit UNKNOWN.
import { JsonDb } from "./jsondb.js";
import { controlCommand } from "./control-intelligence.js";

const db = new JsonDb("control-history", { snapshots: [] });
const KEEP = Number(process.env.DASH_CONTROL_HISTORY_KEEP || 240);
const MIN_GAP_MS = Number(process.env.DASH_CONTROL_HISTORY_MIN_S || 60) * 1000;
let capturing = null;

function compact(command) {
  return {
    at: command.generatedAt,
    global: command.global,
    domains: Object.fromEntries(Object.entries(command.domains || {}).map(([k, d]) => [k, { state: d.state, detail: d.detail }])),
    product: command.product,
    counts: command.counts,
    risks: (command.risks || []).slice(0, 6).map((r) => ({ key: r.key, priority: r.priority, title: r.title, source: r.source })),
  };
}

function signature(s) {
  return JSON.stringify({
    global: s.global,
    domains: s.domains,
    product: s.product,
    counts: s.counts,
    risks: s.risks,
  });
}

export async function captureControlSnapshot(force = false) {
  if (capturing) return capturing;
  capturing = (async () => {
    const current = compact(await controlCommand());
    const list = db.get().snapshots || [];
    const last = list[0];
    const now = Date.parse(current.at) || Date.now();
    if (!force && last && now - (Date.parse(last.at) || 0) < MIN_GAP_MS) return last;
    if (last && signature(last) === signature(current)) return last; // pas de bruit : état identique
    db.update((d) => {
      d.snapshots = d.snapshots || [];
      d.snapshots.unshift(current);
      if (d.snapshots.length > KEEP) d.snapshots.length = KEEP;
    });
    return current;
  })();
  try { return await capturing; } finally { capturing = null; }
}

function metricChanges(now, before) {
  const out = [];
  const keys = ["dau", "wau", "mau", "stickiness", "returnRate7"];
  for (const key of keys) {
    const a = now?.product?.[key];
    const b = before?.product?.[key];
    if (typeof a !== "number" || typeof b !== "number" || a === b) continue;
    out.push({ type: "product_metric", key, before: b, now: a, delta: a - b });
  }
  return out;
}

export function compareSnapshots(now, before) {
  if (!now || !before) return { comparable: false, reason: "Aucun snapshot de référence distinct n'est encore disponible.", changes: [] };
  const changes = [];
  for (const key of new Set([...Object.keys(now.domains || {}), ...Object.keys(before.domains || {})])) {
    const a = now.domains?.[key];
    const b = before.domains?.[key];
    if (!a || !b || a.state === b.state) continue;
    changes.push({ type: "domain_state", key, before: b.state, now: a.state, detail: a.detail });
  }
  changes.push(...metricChanges(now, before));
  const beforeRisks = new Map((before.risks || []).map((r) => [r.key, r]));
  const nowRisks = new Map((now.risks || []).map((r) => [r.key, r]));
  for (const [key, risk] of nowRisks) if (!beforeRisks.has(key)) changes.push({ type: "risk_opened", key, priority: risk.priority, title: risk.title });
  for (const [key, risk] of beforeRisks) if (!nowRisks.has(key)) changes.push({ type: "risk_cleared", key, priority: risk.priority, title: risk.title });
  return { comparable: true, from: before.at, to: now.at, changes };
}

export async function whatChanged() {
  const now = await captureControlSnapshot(true);
  const list = db.get().snapshots || [];
  // Le premier est le snapshot courant ; chercher une référence au contenu différent.
  const sig = signature(now);
  const before = list.find((s, i) => i > 0 && signature(s) !== sig) || null;
  return { current: now, previous: before, ...compareSnapshots(now, before) };
}

export function listControlSnapshots(limit = 30) { return (db.get().snapshots || []).slice(0, Math.max(1, Math.min(Number(limit) || 30, 240))); }

let started = false;
export function startControlHistory() {
  if (started) return;
  started = true;
  setTimeout(() => captureControlSnapshot().catch(() => {}), 5000).unref?.();
  setInterval(() => captureControlSnapshot().catch(() => {}), 5 * 60_000).unref();
}
