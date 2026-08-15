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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));

// Cookies de session minimalistes (clearCookie/cookie helpers).
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

// ─── Santé (sans auth, pour les health-checks d'hébergeur) ─────────────────
api.get("/health", (req, res) => res.json({ ok: true, env: config.dashEnv, supabase: supabaseReady }));

// ─── Auth ────────────────────────────────────────────────────────────────
api.post("/login", asyncH(auth.login));
api.post("/logout", auth.logout);
api.get("/me", auth.me);

// ─── Flux temps réel (SSE) ─────────────────────────────────────────────────
api.get("/stream", auth.requireAuth, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive", "X-Accel-Buffering": "no",
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ ...ingestState(), clients: clientCount() })}\n\n`);
  addClient(res);
});

// ─── Vue d'ensemble / activité ──────────────────────────────────────────────
api.get("/overview", auth.requireAuth, (req, res) => res.json({ ...store.overview(), ingest: ingestState() }));
api.get("/timeseries", auth.requireAuth, (req, res) => res.json(store.timeseries(Number(req.query.minutes) || 30)));
api.get("/events", auth.requireAuth, (req, res) => {
  const { type, severity, user, device, session, env, screen, status, q, limit } = req.query;
  res.json(store.recent({ type, severity, user, device, session, env, screen, status, q }, Number(limit) || 200));
});

// ─── Interactions (vérification cross-device temps réel) ────────────────────
api.get("/interactions", auth.requireAuth, (req, res) => res.json(interactionsSnapshot(Number(req.query.limit) || 120)));

// ─── Traçage bout-en-bout (chaîne de validation par action) ─────────────────
api.get("/traces", auth.requireAuth, (req, res) => res.json(tracesSnapshot(Number(req.query.limit) || 100)));
api.get("/traces/:cid", auth.requireAuth, asyncH(async (req, res) => {
  const t = traceOne(req.params.cid);
  if (!t) return res.status(404).json({ error: "Trace introuvable (expirée ?)" });
  // Corrélation aux changements récents : réservée aux rôles qui peuvent déjà
  // lire le dépôt (elle expose sujets de commits, auteurs et chemins de fichiers).
  let suspects = null;
  if (auth.can(req.session.role, "git_read")) {
    try { suspects = await suspectsFor(t.startedAt, t.feature); } catch (e) { suspects = null; }
  }
  res.json({ trace: t, suspects, prompt: claude.buildTracePrompt(t, suspects ? suspectsPromptBlock(suspects) : "") });
}));

// ─── Couverture d'instrumentation (catalogue des contrats + dette) ──────────
api.get("/coverage", auth.requireAuth, (req, res) => res.json(tracesCoverage()));

// ─── Réconciliation (intégrité des données : échecs silencieux) ─────────────
api.get("/reconcile", auth.requireCap("db"), asyncH(async (req, res) => res.json(await reconcile({ force: req.query.force === "1" }))));
api.post("/reconcile/prompt", auth.requireCap("db"), (req, res) => {
  const c = req.body?.check;
  if (!c || !c.label) return res.status(400).json({ error: "check requis" });
  res.json({ prompt: buildReconcilePrompt(c) });
});

// ─── Diagnostic global : « Diagnostiquer toute la plateforme » (prompt prêt) ─
api.get("/diagnose", auth.requireAuth, asyncH(async (req, res) => {
  // L'intégrité des données fait partie du diagnostic, MAIS elle expose des
  // identifiants issus de la base : elle suit donc la même permission que
  // /reconcile (capacité `db`). Un rôle sans cette capacité reçoit un diagnostic
  // qui DIT que l'intégrité n'a pas été évaluée, au lieu de la passer sous
  // silence (un blanc lu comme « tout va bien » serait un mensonge).
  const mayReadDb = auth.can(req.session.role, "db");
  let integrity = null;
  if (mayReadDb) {
    // Si elle échoue (Supabase indisponible), on le DIT au lieu de prétendre que tout va bien.
    try { integrity = await reconcile(); } catch (e) { integrity = { error: e.message }; }
  } else {
    integrity = { error: "non évaluée : ce rôle n'a pas accès à la base (capacité `db`)" };
  }
  const bundle = {
    overview: store.overview(),
    traces: tracesSnapshot(200),
    interactions: interactionsSnapshot(200),
    coverage: tracesCoverage(),
    bugs: store.bugList().slice(0, 20),
    errors: store.recent({ type: "error" }, 40),
    integrity,
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

// ─── Liens partagés (cycle de vie création → partage → ouverture confirmée) ──
api.get("/links", auth.requireAuth, (req, res) => res.json({ funnel: store.linkFunnel(), links: store.linkList(Number(req.query.limit) || 300) }));
api.get("/links/:id", auth.requireAuth, (req, res) => { const l = store.link(req.params.id); l ? res.json(l) : res.status(404).json({ error: "Lien introuvable" }); });

// ─── Campagne QA (rapport de la campagne multi-comptes) ─────────────────────
api.get("/qa-report", auth.requireAuth, (req, res) => res.json(qaReport()));

// ─── KPI produit (utilisateurs actifs réels, calculés sur telemetry_events) ──
api.get("/kpi", auth.requireAuth, asyncH(async (req, res) => res.json(await kpi())));
api.get("/retention", auth.requireAuth, asyncH(async (req, res) => res.json(await retention())));

// ─── Appareils / sessions d'activité / parcours ─────────────────────────────
api.get("/names", auth.requireAuth, (req, res) => res.json(store.clientNames()));
api.get("/signups", auth.requireAuth, asyncH(async (req, res) => res.json(await signups())));
api.get("/accounts", auth.requireAuth, asyncH(async (req, res) => res.json(await accounts())));
api.get("/devices", auth.requireAuth, (req, res) => res.json(store.deviceList()));
api.get("/visitors", auth.requireAuth, (req, res) => res.json({ funnel: store.visitorFunnel(), visitors: store.visitorList() }));
api.get("/activity-sessions", auth.requireAuth, (req, res) => res.json(store.sessionList()));
api.get("/journey/:session", auth.requireAuth, (req, res) => res.json(store.userJourney(req.params.session)));

// ─── Bugs ────────────────────────────────────────────────────────────────
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

// ─── Performance / services / DB ─────────────────────────────────────────────
api.get("/performance", auth.requireAuth, (req, res) => res.json({ api: store.apiPerf(), health: store.health() }));
api.get("/services", auth.requireAuth, (req, res) => res.json(store.services()));
api.get("/database", auth.requireCap("db"), asyncH(async (req, res) => res.json(await dbwatch.overview())));

// ─── Sessions de test ────────────────────────────────────────────────────
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

// ─── Checklist / flags ───────────────────────────────────────────────────
api.get("/checklist", auth.requireAuth, (req, res) => res.json(checklist.listChecklist()));
api.patch("/checklist/:id", auth.requireCap("sessions"), (req, res) => { const it = checklist.updateChecklistItem(req.params.id, req.body || {}, req.session.u); it ? res.json(it) : res.status(404).json({ error: "introuvable" }); });
api.get("/flags", auth.requireAuth, (req, res) => res.json(checklist.listFlags()));
api.post("/flags", auth.requireCap("flags"), (req, res) => res.json(checklist.createFlag(req.body || {}, req.session.u)));
api.patch("/flags/:id", auth.requireCap("flags"), (req, res) => { const f = checklist.updateFlag(req.params.id, req.body || {}, req.session.u); f ? res.json(f) : res.status(404).json({ error: "introuvable" }); });

// ─── Tests ───────────────────────────────────────────────────────────────
api.get("/tests", auth.requireAuth, (req, res) => res.json({ suites: tests.listSuites(), current: tests.currentRun() }));
api.post("/tests/run", auth.requireCap("tests"), asyncH(async (req, res) => res.json(tests.runSuite(req.body?.id, req.session.u))));
api.post("/tests/stop", auth.requireCap("tests"), (req, res) => res.json(tests.stopRun(req.session.u)));

// ─── Git ─────────────────────────────────────────────────────────────────
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

// ─── Assistant Claude Code ──────────────────────────────────────────────────
api.post("/claude/context", auth.requireCap("claude"), asyncH(async (req, res) => {
  const ctx = await claude.buildContext(req.body?.bugId);
  if (!ctx) return res.status(404).json({ error: "Bug introuvable" });
  res.json({ prompt: claude.buildPrompt(ctx), context: ctx, apiConfigured: Boolean(config.anthropicKey) });
}));
api.post("/claude/analyze", auth.requireCap("claude"), asyncH(async (req, res) => res.json(await claude.analyze(req.body?.bugId, { note: req.body?.note }, req.session.u))));
// Réparation en un clic : depuis un bug groupé (bugId) ou un événement d'erreur brut (event).
api.post("/claude/quickfix", auth.requireCap("claude"), asyncH(async (req, res) => res.json(await claude.quickFix({ bugId: req.body?.bugId, event: req.body?.event, note: req.body?.note, deep: req.body?.deep === true }, req.session.u))));
// État de la source d'analyse + re-détection à la demande (après avoir connecté `claude`).
api.get("/claude/status", auth.requireAuth, (req, res) => res.json({ cli: claudeCliState(), apiKey: Boolean(config.anthropicKey) }));
api.post("/claude/recheck", auth.requireCap("claude"), asyncH(async (req, res) => { await detectClaudeCli(); res.json({ cli: claudeCliState(), apiKey: Boolean(config.anthropicKey) }); }));

// ─── Utilisateurs de test ───────────────────────────────────────────────────
api.get("/test-users", auth.requireCap("test_users"), asyncH(async (req, res) => res.json(await testusers.list())));
api.delete("/test-users/:id", auth.requireCap("test_users"), asyncH(async (req, res) => res.json(await testusers.remove(req.params.id, req.session.u))));

// ─── Alertes ───────────────────────────────────────────────────────────────
api.get("/alerts", auth.requireAuth, (req, res) => res.json(alerts.listAlerts()));
api.post("/alerts/:id/ack", auth.requireCap("alerts"), (req, res) => res.json({ ok: alerts.acknowledge(req.params.id) }));
api.post("/alerts/manual", auth.requireCap("alerts"), (req, res) => res.json(alerts.raiseManual(req.body || {})));

// ─── Audit ───────────────────────────────────────────────────────────────
api.get("/audit", auth.requireCap("audit"), (req, res) => res.json(listAudit(Number(req.query.limit) || 300, { action: req.query.action, actor: req.query.actor })));

// ─── Readiness score (section 25) ───────────────────────────────────────────
api.get("/readiness", auth.requireAuth, (req, res) => {
  // `authz` n'est PAS encore alimenté : il n'existe aucune ingestion des résultats
  // de tests/e2e/authz-critical.spec.js. On le passe donc explicitement à null,
  // ce qui rend le domaine « autorisation » INCONNU — et empêche la santé globale
  // d'afficher un vert franc. C'est délibéré : un domaine critique non mesuré ne
  // doit jamais être compté comme sain (cf. F7, analyse croisée du 2026-08-15).
  res.json(computeReadiness({
    overview: store.overview(),
    checklist: checklist.listChecklist(),
    bugs: store.bugList(),
    authz: null,
  }));
});

app.use("/api", api);

// ─── Statique (SPA) ─────────────────────────────────────────────────────────
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
  // Détection du `claude` local (analyse gratuite via l'abonnement Claude Code).
  detectClaudeCli().then(() => { const s = claudeCliState(); console.log(`  ▸ Claude Code local : ${s.loggedIn ? "connecté (analyse gratuite dispo)" : s.installed ? "installé mais NON connecté (lancer: claude auth login)" : "absent"}${config.anthropicKey ? " · clé API aussi configurée" : ""}`); });
  // Ouverture auto du navigateur quand lancé par le raccourci (une seule fois).
  if (process.env.DASH_OPEN_BROWSER === "1") {
    const url = `http://localhost:${config.port}`;
    const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
    import("node:child_process").then(({ exec }) => exec(cmd, () => {})).catch(() => {});
  }
});
