import * as z from "zod/v4";

const DEFAULT_BASE_URL = "http://127.0.0.1:4610";
const READ_TIMEOUT_MS = 4000;
const WRITE_TIMEOUT_MS = 8000;
const SESSION_CACHE_MS = 10 * 60_000;

let cachedSession = { cookie: null, expiresAt: 0 };

function textResult(value, isError = false) {
  return {
    isError,
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }]
  };
}

function pilotageConfig() {
  const raw = process.env.PASSIO_DASHBOARD_URL || DEFAULT_BASE_URL;
  let url;
  try { url = new URL(raw); } catch { throw new Error("PASSIO_DASHBOARD_URL invalide."); }
  const host = url.hostname.toLowerCase();
  const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
  if (!loopback) throw new Error("Connexion Centre de pilotage refusee: PASSIO_DASHBOARD_URL doit rester sur localhost/loopback.");
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Protocole Centre de pilotage non autorise.");
  if (url.username || url.password) throw new Error("Les identifiants ne doivent jamais etre places dans PASSIO_DASHBOARD_URL.");
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return {
    baseUrl: url,
    user: process.env.PASSIO_DASHBOARD_USER || "",
    password: process.env.PASSIO_DASHBOARD_PASSWORD || ""
  };
}

function credentialsConfigured(cfg = pilotageConfig()) {
  return Boolean(cfg.user && cfg.password);
}

async function fetchJson(url, options = {}, timeoutMs = READ_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data, headers: res.headers };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Centre de pilotage: delai depasse apres ${timeoutMs} ms.`);
    throw new Error(`Centre de pilotage inaccessible: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function login(cfg, force = false) {
  if (!force && cachedSession.cookie && cachedSession.expiresAt > Date.now()) return cachedSession.cookie;
  if (!credentialsConfigured(cfg)) {
    throw new Error("Authentification Centre de pilotage non configuree. Definir PASSIO_DASHBOARD_USER et PASSIO_DASHBOARD_PASSWORD dans l'environnement du Bridge, jamais dans le prompt ni dans le depot.");
  }
  const url = new URL("/api/login", cfg.baseUrl);
  const res = await fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify({ user: cfg.user, password: cfg.password })
  }, WRITE_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Authentification Centre de pilotage refusee (${res.status}).`);
  const setCookie = res.headers.get("set-cookie") || "";
  const match = setCookie.match(/(?:^|,\s*)(dash_session=[^;]+)/i);
  if (!match) throw new Error("Le Centre de pilotage n'a pas retourne de session utilisable.");
  cachedSession = { cookie: match[1], expiresAt: Date.now() + SESSION_CACHE_MS };
  return cachedSession.cookie;
}

function buildUrl(cfg, pathname, params = {}) {
  if (!pathname.startsWith("/api/")) throw new Error("Chemin API Centre de pilotage refuse.");
  const url = new URL(pathname, cfg.baseUrl);
  if (url.origin !== cfg.baseUrl.origin) throw new Error("Origine Centre de pilotage refusee.");
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function pilotageRequest(pathname, { method = "GET", params = {}, body, auth = true, timeoutMs } = {}) {
  const cfg = pilotageConfig();
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (auth) headers.cookie = await login(cfg);
  const run = () => fetchJson(buildUrl(cfg, pathname, params), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  }, timeoutMs || (method === "GET" ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS));
  let res = await run();
  if (auth && res.status === 401) {
    cachedSession = { cookie: null, expiresAt: 0 };
    headers.cookie = await login(cfg, true);
    res = await run();
  }
  if (!res.ok) {
    const detail = res.data && typeof res.data === "object" ? res.data.error : res.data;
    throw new Error(`Centre de pilotage ${method} ${pathname}: ${res.status}${detail ? ` - ${String(detail).slice(0, 500)}` : ""}`);
  }
  return res.data;
}

function encodeId(value, label = "id") {
  const s = String(value || "").trim();
  if (!s) throw new Error(`${label} requis.`);
  return encodeURIComponent(s);
}

const READ_RESOURCES = [
  "health", "overview", "timeseries", "events", "interactions", "traces", "trace", "coverage",
  "reconcile", "diagnose", "links", "qa_report", "kpi", "retention", "devices", "visitors",
  "activity_sessions", "journey", "bugs", "bug", "performance", "services", "database",
  "test_sessions", "test_session", "test_report", "checklist", "flags", "tests", "git_status",
  "git_branches", "git_log", "git_diff", "claude_status", "alerts", "sentinel", "sentinel_diagnosis",
  "audit", "readiness"
];

async function readResource({ resource, id, limit, minutes, file, force, filters = {} }) {
  switch (resource) {
    case "health": return pilotageRequest("/api/health", { auth: false });
    case "overview": return pilotageRequest("/api/overview");
    case "timeseries": return pilotageRequest("/api/timeseries", { params: { minutes: minutes || 30 } });
    case "events": return pilotageRequest("/api/events", { params: { ...filters, limit: limit || 200 } });
    case "interactions": return pilotageRequest("/api/interactions", { params: { limit: limit || 120 } });
    case "traces": return pilotageRequest("/api/traces", { params: { limit: limit || 100 } });
    case "trace": return pilotageRequest(`/api/traces/${encodeId(id, "cid")}`);
    case "coverage": return pilotageRequest("/api/coverage");
    case "reconcile": return pilotageRequest("/api/reconcile", { params: { force: force ? 1 : undefined }, timeoutMs: WRITE_TIMEOUT_MS });
    case "diagnose": return pilotageRequest("/api/diagnose", { timeoutMs: WRITE_TIMEOUT_MS });
    case "links": return pilotageRequest("/api/links", { params: { limit: limit || 300 } });
    case "qa_report": return pilotageRequest("/api/qa-report");
    case "kpi": return pilotageRequest("/api/kpi", { timeoutMs: WRITE_TIMEOUT_MS });
    case "retention": return pilotageRequest("/api/retention", { timeoutMs: WRITE_TIMEOUT_MS });
    case "devices": return pilotageRequest("/api/devices");
    case "visitors": return pilotageRequest("/api/visitors");
    case "activity_sessions": return pilotageRequest("/api/activity-sessions");
    case "journey": return pilotageRequest(`/api/journey/${encodeId(id, "session")}`);
    case "bugs": return pilotageRequest("/api/bugs");
    case "bug": return pilotageRequest(`/api/bugs/${encodeId(id)}`);
    case "performance": return pilotageRequest("/api/performance");
    case "services": return pilotageRequest("/api/services");
    case "database": return pilotageRequest("/api/database", { timeoutMs: WRITE_TIMEOUT_MS });
    case "test_sessions": return pilotageRequest("/api/test-sessions");
    case "test_session": return pilotageRequest(`/api/test-sessions/${encodeId(id)}`);
    case "test_report": return pilotageRequest(`/api/test-sessions/${encodeId(id)}/report`);
    case "checklist": return pilotageRequest("/api/checklist");
    case "flags": return pilotageRequest("/api/flags");
    case "tests": return pilotageRequest("/api/tests");
    case "git_status": return pilotageRequest("/api/git/status");
    case "git_branches": return pilotageRequest("/api/git/branches");
    case "git_log": return pilotageRequest("/api/git/log", { params: { n: limit || 20 } });
    case "git_diff": return pilotageRequest("/api/git/diff", { params: { file } });
    case "claude_status": return pilotageRequest("/api/claude/status");
    case "alerts": return pilotageRequest("/api/alerts");
    case "sentinel": return pilotageRequest("/api/sentinel", { params: { limit: limit || 50 } });
    case "sentinel_diagnosis": return pilotageRequest(`/api/sentinel/${encodeId(id)}`);
    case "audit": return pilotageRequest("/api/audit", { params: { limit: limit || 300, ...filters } });
    case "readiness": return pilotageRequest("/api/readiness");
    default: throw new Error(`Ressource Centre de pilotage non autorisee: ${resource}`);
  }
}

const SENSITIVE_RESOURCES = ["signups", "accounts", "test_users"];
async function readSensitive({ resource }) {
  if (resource === "signups") return pilotageRequest("/api/signups", { timeoutMs: WRITE_TIMEOUT_MS });
  if (resource === "accounts") return pilotageRequest("/api/accounts", { timeoutMs: WRITE_TIMEOUT_MS });
  if (resource === "test_users") return pilotageRequest("/api/test-users", { timeoutMs: WRITE_TIMEOUT_MS });
  throw new Error(`Ressource sensible non autorisee: ${resource}`);
}

const ACTIONS = [
  "alert_ack", "alert_manual", "sentinel_enable", "sentinel_disable", "sentinel_merge",
  "tests_run", "tests_stop", "test_session_create", "test_session_start", "test_session_pause",
  "test_session_resume", "test_session_end", "test_session_note", "test_session_bug",
  "checklist_update", "flag_create", "flag_update", "bug_update", "claude_recheck",
  "claude_analyze", "claude_quickfix", "git_branch"
];

async function performAction({ action, id, payload = {} }) {
  switch (action) {
    case "alert_ack": return pilotageRequest(`/api/alerts/${encodeId(id)}/ack`, { method: "POST", body: {} });
    case "alert_manual": return pilotageRequest("/api/alerts/manual", { method: "POST", body: payload });
    case "sentinel_enable": return pilotageRequest("/api/sentinel/toggle", { method: "POST", body: { enabled: true } });
    case "sentinel_disable": return pilotageRequest("/api/sentinel/toggle", { method: "POST", body: { enabled: false } });
    case "sentinel_merge": return pilotageRequest(`/api/sentinel/${encodeId(id)}/merge`, { method: "POST", body: { confirm: true } });
    case "tests_run": return pilotageRequest("/api/tests/run", { method: "POST", body: { id: payload.id || id } });
    case "tests_stop": return pilotageRequest("/api/tests/stop", { method: "POST", body: {} });
    case "test_session_create": return pilotageRequest("/api/test-sessions", { method: "POST", body: payload });
    case "test_session_start": return pilotageRequest(`/api/test-sessions/${encodeId(id)}/start`, { method: "POST", body: payload });
    case "test_session_pause": return pilotageRequest(`/api/test-sessions/${encodeId(id)}/pause`, { method: "POST", body: payload });
    case "test_session_resume": return pilotageRequest(`/api/test-sessions/${encodeId(id)}/resume`, { method: "POST", body: payload });
    case "test_session_end": return pilotageRequest(`/api/test-sessions/${encodeId(id)}/end`, { method: "POST", body: payload });
    case "test_session_note": return pilotageRequest(`/api/test-sessions/${encodeId(id)}/note`, { method: "POST", body: payload });
    case "test_session_bug": return pilotageRequest(`/api/test-sessions/${encodeId(id)}/bug`, { method: "POST", body: payload });
    case "checklist_update": return pilotageRequest(`/api/checklist/${encodeId(id)}`, { method: "PATCH", body: payload });
    case "flag_create": return pilotageRequest("/api/flags", { method: "POST", body: payload });
    case "flag_update": return pilotageRequest(`/api/flags/${encodeId(id)}`, { method: "PATCH", body: payload });
    case "bug_update": return pilotageRequest(`/api/bugs/${encodeId(id)}`, { method: "PATCH", body: payload });
    case "claude_recheck": return pilotageRequest("/api/claude/recheck", { method: "POST", body: {} });
    case "claude_analyze": return pilotageRequest("/api/claude/analyze", { method: "POST", body: { bugId: id || payload.bugId, note: payload.note }, timeoutMs: 120_000 });
    case "claude_quickfix": return pilotageRequest("/api/claude/quickfix", { method: "POST", body: { bugId: id || payload.bugId, event: payload.event, note: payload.note, deep: payload.deep === true }, timeoutMs: 180_000 });
    case "git_branch": return pilotageRequest("/api/git/branch", { method: "POST", body: { name: payload.name || id, confirm: true } });
    default: throw new Error(`Action Centre de pilotage non autorisee: ${action}`);
  }
}

async function snapshot() {
  const queries = {
    overview: () => readResource({ resource: "overview" }),
    readiness: () => readResource({ resource: "readiness" }),
    performance: () => readResource({ resource: "performance" }),
    services: () => readResource({ resource: "services" }),
    kpi: () => readResource({ resource: "kpi" }),
    alerts: () => readResource({ resource: "alerts" }),
    sentinel: () => readResource({ resource: "sentinel", limit: 20 }),
    git: () => readResource({ resource: "git_status" }),
    claude: () => readResource({ resource: "claude_status" })
  };
  const entries = await Promise.all(Object.entries(queries).map(async ([key, fn]) => {
    try { return [key, { ok: true, data: await fn() }]; }
    catch (error) { return [key, { ok: false, error: error.message }]; }
  }));
  return { capturedAt: new Date().toISOString(), sections: Object.fromEntries(entries) };
}

export function registerPilotageTools(server) {
  server.registerTool(
    "passio_pilotage_status",
    {
      description: "Verifier la connexion reelle au Centre de pilotage local PASSIO et son authentification, sans exposer aucun secret.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async () => {
      try {
        const cfg = pilotageConfig();
        const health = await pilotageRequest("/api/health", { auth: false });
        let me = null;
        let authError = null;
        if (credentialsConfigured(cfg)) {
          try { me = await pilotageRequest("/api/me"); } catch (error) { authError = error.message; }
        }
        return textResult({
          connected: Boolean(health?.ok),
          endpoint: cfg.baseUrl.origin,
          credentialsConfigured: credentialsConfigured(cfg),
          health,
          authenticated: Boolean(me),
          identity: me ? { user: me.user, role: me.role, caps: me.caps, env: me.env, allowMutations: me.allowMutations, claudeLive: me.claudeLive, claudeVia: me.claudeVia } : null,
          authError
        });
      } catch (error) { return textResult({ connected: false, error: error.message }, true); }
    }
  );

  server.registerTool(
    "passio_pilotage_snapshot",
    {
      description: "Lire un instantane consolide en temps reel du Centre de pilotage: vue d'ensemble, readiness, performances, services, KPI, alertes, Sentinelle, Git et Claude.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async () => {
      try { return textResult(await snapshot()); }
      catch (error) { return textResult({ error: error.message }, true); }
    }
  );

  server.registerTool(
    "passio_pilotage_read",
    {
      description: "Lire une ressource autorisee du Centre de pilotage PASSIO. Aucun chemin ou URL libre n'est accepte.",
      inputSchema: z.object({
        resource: z.enum(READ_RESOURCES),
        id: z.string().max(500).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
        minutes: z.number().int().min(1).max(1440).optional(),
        file: z.string().max(500).optional(),
        force: z.boolean().default(false),
        filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      try { return textResult(await readResource(args)); }
      catch (error) { return textResult({ error: error.message }, true); }
    }
  );

  server.registerTool(
    "passio_pilotage_sensitive_read",
    {
      description: "Lire des donnees sensibles du Centre de pilotage (inscriptions, comptes, utilisateurs de test). Exige une reconnaissance explicite du caractere sensible.",
      inputSchema: z.object({
        resource: z.enum(SENSITIVE_RESOURCES),
        acknowledgeSensitive: z.literal(true)
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      try { return textResult(await readSensitive(args)); }
      catch (error) { return textResult({ error: error.message }, true); }
    }
  );

  server.registerTool(
    "passio_pilotage_action",
    {
      description: "Executer une action explicitement autorisee dans le Centre de pilotage. Confirmation confirm:true obligatoire. Aucun push/deploiement ni patch Git arbitraire n'est expose.",
      inputSchema: z.object({
        action: z.enum(ACTIONS),
        confirm: z.literal(true),
        id: z.string().max(500).optional(),
        payload: z.record(z.string(), z.unknown()).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    },
    async ({ action, id, payload }) => {
      try { return textResult(await performAction({ action, id, payload: payload || {} })); }
      catch (error) { return textResult({ error: error.message }, true); }
    }
  );
}
