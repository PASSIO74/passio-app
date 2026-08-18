// ═══════════════════════════════════════════════════════════════════════════
// PASSIO — Centre de pilotage : serveur (Express).
// Sert le SPA, expose l'API REST + le flux SSE, et démarre l'ingestion Supabase.
// ═══════════════════════════════════════════════════════════════════════════
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, supabaseReady } from "./config.js";
import { store } from "./store.js";
import { startIngest, ingestState } from "./ingest.js";
import { addClient, clientCount } from "./sse.js";
import * as auth from "./auth.js";
import { audit, listAudit } from "./audit.js";
import * as git from "./git.js";
import * as tests from "./tests.js";
import * as claude from "./claude.js";
import * as sessions from "./sessions.js";
import * as checklist from "./checklist.js";
import * as dbwatch from "./dbwatch.js";
import { signups } from "./signups.js";
import { accounts } from "./accounts.js";
import { detectClaudeCli, claudeCliState } from "./claudecli.js";
import * as testusers from "./testusers.js";
import * as alerts from "./alerts.js";
import { snapshot as interactionsSnapshot } from "./interactions.js";
import { snapshot as tracesSnapshot, trace as traceOne, coverage as tracesCoverage } from "./traces.js";
import { reconcile, buildReconcilePrompt } from "./reconcile.js";
import { suspectsFor, suspectsPromptBlock } from "./correlate.js";
import { kpi } from "./kpi.js";
import { retention } from "./retention.js";
import { computeReadiness } from "./readiness.js";
import { qaReport } from "./qa.js";
import * as sentinel from "./sentinel.js";
import { mergeRepair } from "./repair.js";
import { observationSnapshot, acknowledgeSseHeartbeat } from "./observation.js";
import { releaseHealth, releaseHistory } from "./release-recorder.js";
import { listIncidentPackets, transitionIncident } from "./incident-packets.js";
import { controlCommand } from "./control-intelligence.js";
import { whatChanged, listControlSnapshots, startControlHistory } from "./control-history.js";
import { anomalySnapshot } from "./anomaly-engine.js";
import { releaseGuardianSnapshot } from "./release-guardian.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  res.cookie = (name, val, opts = {}) => {
    const parts = [`${name}=${encodeURIComponent(val)}`, "Path=/"];
    if (opts.httpOnly) parts.push("HttpOnly");
    if (opts.sameSite) parts.push("SameSite=" + opts.sameSite);
    if (opts.secure) parts.push("Secure");
    if (opts.maxAge) parts.push("Max-Age=" + Math.round(opts.maxAge / 1000));
    res.append("Set-Cookie", parts.join("; "));
    return res;
  };
  res.clearCookie = (name) => { res.append("Set-Cookie", `${name}=; Path=/; Max-Age=0`); return res; };
  next();
});
app.use(auth.sessionMiddleware);

const api = express.Router();
const asyncH = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  res.status(e.code || 500).json({ error: e.message || "Erreur serveur" });
});

api.get("/health", (req, res) => res.json({ ok: true, env: config.dashEnv, supabase: supabaseReady }));
api.post("/login", asyncH(auth.login));
api.post("/logout", auth.logout);
api.get("/me", auth.me);

api.get("/stream", auth.requireAuth, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive", "X-Accel-Buffering": "no",
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ ...ingestState(), clients: clientCount() })}\n\n`);
  addClient(res);
});

api.get("/overview", auth.requireAuth, (req, res) => res.json({ ...store.overview(), ingest: ingestState() }));
api.get("/timeseries", auth.requireAuth, (req, res) => res.json(store.timeseries(Number(req.query.minutes) || 30)));
api.get("/events", auth.requireAuth, (req, res) => {
  const { type, severity, user, device, session, env, screen, status, q, limit } = req.query;
  res.json(store.recent({ type, severity, user, device, session, env, screen, status, q }, Number(limit) || 200));
});

// ─── Command Center / Sentinel 3 ────────────────────────────────────────────
api.get("/control/command", auth.requireAuth, asyncH(async (req, res) => res.json(await controlCommand())));
api.get("/control/changes", auth.requireAuth, asyncH(async (req, res) => res.json(await whatChanged())));
api.get("/control/history", auth.requireAuth, (req, res) => res.json(listControlSnapshots(Number(req.query.limit) || 30)));
api.get("/observation", auth.requireAuth, (req, res) => res.json(observationSnapshot()));
api.post("/observation/sse-ack", auth.requireAuth, (req, res) => res.json({ ok: acknowledgeSseHeartbeat(req.body?.id || null) }));
api.get("/releases", auth.requireAuth, (req, res) => res.json({ health: releaseHealth(), history: releaseHistory(Number(req.query.limit) || 30) }));
api.get("/release-guardian", auth.requireAuth, (req, res) => res.json(releaseGuardianSnapshot()));
api.get("/anomalies", auth.requireAuth, (req, res) => res.json(anomalySnapshot()));
api.get("/incidents", auth.requireAuth, (req, res) => res.json(listIncidentPackets(Number(req.query.limit) || 50)));
api.post("/incidents/:id/transition", auth.requireCap("alerts"), (req, res) => {
  const incident = transitionIncident(req.params.id, req.body?.phase, {
    evidence: req.body?.evidence,
    note: req.body?.note,
    resolution: req.body?.resolution,
    actor: req.session.u,
  });
  incident ? res.json(incident) : res.status(404).json({ error: "Incident introuvable" });
});

api.get("/interactions", auth.requireAuth, (req, res) => res.json(interactionsSnapshot(Number(req.query.limit) || 120)));
api.get("/traces", auth.requireAuth, (req, res) => res.json(tracesSnapshot(Number(req.query.limit) || 100)));
api.get("/traces/:cid", auth.requireAuth, asyncH(async (req, res) => {
  const t = traceOne(req.params.cid);
  if (!t) return res.status(404).json({ error: "Trace introuvable (expirée ?)" });
  let suspects = null;
  if (auth.can(req.session.role, "git_read")) {
    try { suspects = await suspectsFor(t.startedAt, t.feature); } catch (e) { suspects = null; }
  }
  res.json({ trace: t, suspects, prompt: claude.buildTracePrompt(t, suspects ? suspectsPromptBlock(suspects) : "") });
}));
api.get("/coverage", auth.requireAuth, (req, res) => res.json(tracesCoverage()));

api.get("/reconcile", auth.requireCap("db"), asyncH(async (req, res) => res.json(await reconcile({ force: req.query.force === "1" }))));
api.post("/reconcile/prompt", auth.requireCap("db"), (req, res) => {
  const c = req.body?.check;
  if (!c || !c.label) return res.status(400).json({ error: "check requis" });
  res.json({ prompt: buildReconcilePrompt(c) });
});

api.get("/diagnose", auth.requireAuth, asyncH(async (req, res) => {
  const mayReadDb = auth.can(req.session.role, "db");
  let integrity = null;
  if (mayReadDb) {
    try { integrity = await reconcile(); } catch (e) { integrity = { error: e.message }; }
  } else {
    integrity = { error: "non évaluée : ce rôle n'a pas accès à la base (capacité `db`)" };
  }
  const bundle = {
    overview: store.overview(), traces: tracesSnapshot(200), interactions: interactionsSnapshot(200),
    coverage: tracesCoverage(), bugs: store.bugList().slice(0, 20), errors: store.recent({ type: "error" }, 40), integrity,
  };
  res.json({ prompt: claude.buildPlatformDiagnosis(bundle), summary: {
    successRate: bundle.traces.totals.successRate,
    deliveryRate: bundle.interactions.totals.deliveryRate,
    incidents: (bundle.traces.incidents || []).length,
    bugs: bundle.bugs.length,
    uninstrumented: bundle.coverage.totals.uninstrumented,
    integrityAnomalies: integrity?.totals?.anomalies ?? null,
    integrityEvaluated: mayReadDb,
  }, apiConfigured: Boolean(config.anthropicKey) });
}));

api.get("/links", auth.requireAuth, (req, res) => res.json({ funnel: store.linkFunnel(), links: store.linkList(Number(req.query.limit) || 300) }));
api.get("/links/:id", auth.requireAuth, (req, res) => { const l = store.link(req.params.id); l ? res.json(l) : res.status(404).json({ error: "Lien introuvable" }); });
api.get("/qa-report", auth.requireAuth, (req, res) => res.json(qaReport()));
api.get("/kpi", auth.requireAuth, asyncH(async (req, res) => res.json(await kpi())));
api.get("/retention", auth.requireAuth, asyncH(async (req, res) => res.json(await retention())));
api.get("/names", auth.requireAuth, (req, res) => res.json(store.clientNames()));
api.get("/signups", auth.requireAuth, asyncH(async (req, res) => res.json(await signups())));
api.get("/accounts", auth.requireAuth, asyncH(async (req, res) => res.json(await accounts())));
api.get("/devices", auth.requireAuth, (req, res) => res.json(store.deviceList()));
api.get("/visitors", auth.requireAuth, (req, res) => res.json({ funnel: store.visitorFunnel(), visitors: store.visitorList() }));
api.get("/activity-sessions", auth.requireAuth, (req, res) => res.json(store.sessionList()));
api.get("/journey/:session", auth.requireAuth, (req, res) => res.json(store.userJourney(req.params.session)));

api.get("/bugs", auth.requireAuth, (req, res) => res.json(store.bugList()));
api.get("/bugs/:id", auth.requireAuth, (req, res) => {
  const b = store.bug(req.params.id); if (!b) return res.status(404).json({ error: "Bug introuvable" });
  if (b.codeRef?.file) b.snippet = git.readSnippet(b.codeRef.file, b.codeRef.line);
  res.json(b);
});
api.patch("/bugs/:id", auth.requireCap("sessions"), (req, res) => {
  const b = store.updateBug(req.params.id, req.body || {});
  if (!b) return res.status(404).json({ error: "Bug introuvable" });
  audit("bug_update", { id: req.params.id, patch: req.body }, req.session.u);
  res.json(b);
});

api.get("/performance", auth.requireAuth, (req, res) => res.json({ api: store.apiPerf(), health: store.health() }));
api.get("/services", auth.requireAuth, (req, res) => res.json(store.services()));
api.get("/database", auth.requireCap("db"), asyncH(async (req, res) => res.json(await dbwatch.overview())));

api.get("/test-sessions", auth.requireAuth, (req, res) => res.json(sessions.list()));
api.post("/test-sessions", auth.requireCap("sessions"), (req, res) => res.json(sessions.create(req.body || {}, req.session.u)));
api.get("/test-sessions/:id", auth.requireAuth, (req, res) => { const s = sessions.get(req.params.id); s ? res.json(s) : res.status(404).json({ error: "introuvable" }); });
api.post("/test-sessions/:id/:action", auth.requireCap("sessions"), (req, res) => {
  const { id, action } = req.params;
  if (["start", "pause", "resume", "end"].includes(action)) return res.json(sessions.control(id, action, req.session.u));
  if (action === "note") return res.json(sessions.addNote(id, req.body || {}, req.session.u));
  if (action === "bug") return res.json(sessions.addBug(id, req.body || {}, req.session.u));
  res.status(400).json({ error: "action inconnue" });
});
api.get("/test-sessions/:id/report", auth.requireAuth, (req, res) => { const r = sessions.report(req.params.id); r ? res.json(r) : res.status(404).json({ error: "introuvable" }); });

api.get("/checklist", auth.requireAuth, (req, res) => res.json(checklist.listChecklist()));
api.patch("/checklist/:id", auth.requireCap("sessions"), (req, res) => { const it = checklist.updateChecklistItem(req.params.id, req.body || {}, req.session.u); it ? res.json(it) : res.status(404).json({ error: "introuvable" }); });
api.get("/flags", auth.requireAuth, (req, res) => res.json(checklist.listFlags()));
api.post("/flags", auth.requireCap("flags"), (req, res) => res.json(checklist.createFlag(req.body || {}, req.session.u)));
api.patch("/flags/:id", auth.requireCap("flags"), (req, res) => { const f = checklist.updateFlag(req.params.id, req.body || {}, req.session.u); f ? res.json(f) : res.status(404).json({ error: "introuvable" }); });

api.get("/tests", auth.requireAuth, (req, res) => res.json({ suites: tests.listSuites(), current: tests.currentRun() }));
api.post("/tests/run", auth.requireCap("tests"), asyncH(async (req, res) => res.json(tests.runSuite(req.body?.id, req.session.u))));
api.post("/tests/stop", auth.requireCap("tests"), (req, res) => res.json(tests.stopRun(req.session.u)));

api.get("/git/status", auth.requireCap("git_read"), asyncH(async (req, res) => res.json(await git.status())));
api.get("/git/branches", auth.requireCap("git_read"), asyncH(async (req, res) => res.json(await git.branches())));
api.get("/git/log", auth.requireCap("git_read"), asyncH(async (req, res) => res.json(await git.log(Number(req.query.n) || 20))));
api.get("/git/diff", auth.requireCap("git_read"), asyncH(async (req, res) => res.json({ diff: await git.diff(req.query.file) })));
api.post("/git/branch", auth.requireCap("git_mutate"), asyncH(async (req, res) => {
  if (!req.body?.confirm) return res.status(400).json({ error: "Confirmation explicite requise (confirm:true)." });
  res.json(await git.createBranch(req.body.name, req.session.u));
}));
api.post("/git/apply", auth.requireCap("git_mutate"), asyncH(async (req, res) => {
  if (!req.body?.confirm) return res.status(400).json({ error: "Confirmation explicite requise (confirm:true)." });
  res.json(await git.applyPatch({ branch: req.body.branch, patch: req.body.patch }, req.session.u));
}));

api.post("/claude/context", auth.requireCap("claude"), asyncH(async (req, res) => {
  const ctx = await claude.buildContext(req.body?.bugId);
  if (!ctx) return res.status(404).json({ error: "Bug introuvable" });
  res.json({ prompt: claude.buildPrompt(ctx), context: ctx, apiConfigured: Boolean(config.anthropicKey) });
}));
api.post("/claude/analyze", auth.requireCap("claude"), asyncH(async (req, res) => res.json(await claude.analyze(req.body?.bugId, { note: req.body?.note }, req.session.u))));
api.post("/claude/quickfix", auth.requireCap("claude"), asyncH(async (req, res) => res.json(await claude.quickFix({ bugId: req.body?.bugId, event: req.body?.event, note: req.body?.note, deep: req.body?.deep === true }, req.session.u))));
api.get("/claude/status", auth.requireAuth, (req, res) => res.json({ cli: claudeCliState(), apiKey: Boolean(config.anthropicKey) }));
api.post("/claude/recheck", auth.requireCap("claude"), asyncH(async (req, res) => { await detectClaudeCli(); res.json({ cli: claudeCliState(), apiKey: Boolean(config.anthropicKey) }); }));

api.get("/test-users", auth.requireCap("test_users"), asyncH(async (req, res) => res.json(await testusers.list())));
api.delete("/test-users/:id", auth.requireCap("test_users"), asyncH(async (req, res) => res.json(await testusers.remove(req.params.id, req.session.u))));
api.get("/alerts", auth.requireAuth, (req, res) => res.json(alerts.listAlerts()));
api.post("/alerts/:id/ack", auth.requireCap("alerts"), (req, res) => res.json({ ok: alerts.acknowledge(req.params.id) }));
api.post("/alerts/manual", auth.requireCap("alerts"), (req, res) => res.json(alerts.raiseManual(req.body || {})));

api.get("/sentinel", auth.requireCap("claude"), (req, res) =>
  res.json({ state: sentinel.sentinelState(), diagnoses: sentinel.listDiagnoses(Number(req.query.limit) || 50) }));
api.get("/sentinel/:id", auth.requireCap("claude"), (req, res) => {
  const d = sentinel.getDiagnosis(req.params.id);
  d ? res.json(d) : res.status(404).json({ error: "Diagnostic introuvable" });
});
api.post("/sentinel/toggle", auth.requireCap("settings"), (req, res) =>
  res.json({ enabled: sentinel.setEnabled(req.body?.enabled !== false, req.session.u), state: sentinel.sentinelState() }));
api.post("/sentinel/:id/merge", auth.requireCap("git_mutate"), asyncH(async (req, res) => {
  if (!req.body?.confirm) return res.status(400).json({ error: "Confirmation explicite requise (confirm:true)." });
  const d = sentinel.getDiagnosis(req.params.id);
  if (!d || !d.repair?.ok) return res.status(404).json({ error: "Aucun correctif vérifié pour ce diagnostic." });
  res.json(await mergeRepair(d.repair.branch, req.session.u));
}));
api.get("/audit", auth.requireCap("audit"), (req, res) => res.json(listAudit(Number(req.query.limit) || 300, { action: req.query.action, actor: req.query.actor })));

api.get("/readiness", auth.requireAuth, (req, res) => {
  res.json(computeReadiness({
    overview: store.overview(), checklist: checklist.listChecklist(), bugs: store.bugList(), authz: tests.authzSnapshot(),
    observation: observationSnapshot(), release: releaseHealth(),
  }));
});

app.use("/api", api);
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));
app.get("*", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.listen(config.port, () => {
  console.log(`\n  PASSIO — Centre de pilotage`);
  console.log(`  ▸ http://localhost:${config.port}`);
  console.log(`  ▸ Environnement dashboard : ${config.dashEnv}${config.isProd ? " (mutations code DÉSACTIVÉES)" : ""}`);
  console.log(`  ▸ Supabase : ${supabaseReady ? "connecté (service_role)" : "NON configuré → mode local (voir .env)"}`);
  console.log(`  ▸ Mutations git : ${config.allowMutations ? "autorisées (hors prod)" : "désactivées"}\n`);
  startIngest();
  startControlHistory();
  detectClaudeCli().then(() => {
    const s = claudeCliState();
    console.log(`  ▸ Claude Code local : ${s.loggedIn ? "connecté (analyse gratuite dispo)" : s.installed ? "installé mais NON connecté (lancer: claude auth login)" : "absent"}${config.anthropicKey ? " · clé API aussi configurée" : ""}`);
    sentinel.startSentinel();
  });
  if (process.env.DASH_OPEN_BROWSER === "1") {
    const url = `http://localhost:${config.port}`;
    const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
    import("node:child_process").then(({ exec }) => exec(cmd, () => {})).catch(() => {});
  }
});
