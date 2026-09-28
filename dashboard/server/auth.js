// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTIFICATION & AUTORISATION du tableau de bord.
// Sessions signées HMAC (aucune dépendance JWT), cookie httpOnly, rôles,
// limitation des tentatives, matrice de permissions. Pas de secret en clair
// côté client, comparaison en temps constant.
// ═══════════════════════════════════════════════════════════════════════════
import crypto from "node:crypto";
import os from "node:os";
import { config } from "./config.js";
import { audit } from "./audit.js";
import { liveFixAvailable, claudeCliState } from "./claudecli.js";

// ─── Utilisateurs (env) ──────────────────────────────────────────────────────
const USERS = new Map();
USERS.set(config.adminUser, { user: config.adminUser, password: config.adminPassword, role: "admin" });
for (const u of config.extraUsers) USERS.set(u.user, u);

// ─── Matrice de permissions ─────────────────────────────────────────────────
/** @type {Record<string,string[]>} rôle → capacités */
const CAPS = {
  admin: ["view", "sessions", "tests", "git_read", "git_mutate", "claude", "flags", "db", "test_users", "audit", "settings", "alerts"],
  developer: ["view", "sessions", "tests", "git_read", "claude", "flags", "db", "test_users", "alerts"],
  tester: ["view", "sessions", "alerts"],
  observer: ["view"],
};
export function can(role, cap) { return (CAPS[role] || []).includes(cap); }
export function capsFor(role) { return CAPS[role] || []; }

// ─── Signature de session ────────────────────────────────────────────────────
function b64url(buf) { return Buffer.from(buf).toString("base64url"); }
function sign(payloadStr) {
  return crypto.createHmac("sha256", config.sessionSecret).update(payloadStr).digest("base64url");
}
export function createToken(user, role, hours = config.sessionHours) {
  const payload = { u: user, role, exp: Date.now() + hours * 3600_000 };
  const body = b64url(JSON.stringify(payload));
  return body + "." + sign(body);
}
export function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = sign(body);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

// ─── Limitation des tentatives ───────────────────────────────────────────────
const attempts = new Map();  // ip -> { count, until }
function rateLimited(ip) {
  const a = attempts.get(ip);
  if (a && a.until > Date.now() && a.count >= 8) return true;
  return false;
}
function noteFail(ip) {
  const a = attempts.get(ip) || { count: 0, until: 0 };
  a.count++; a.until = Date.now() + 5 * 60_000;
  attempts.set(ip, a);
}
function noteSuccess(ip) { attempts.delete(ip); }

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ba.length !== bb.length) { crypto.timingSafeEqual(ba, ba); return false; }
  return crypto.timingSafeEqual(ba, bb);
}

// ─── Handlers ────────────────────────────────────────────────────────────────
export function login(req, res) {
  const ip = req.ip || req.socket.remoteAddress || "?";
  if (rateLimited(ip)) { audit("login_blocked", { ip }, null); return res.status(429).json({ error: "Trop de tentatives, réessaie dans 5 minutes." }); }
  const { user, password } = req.body || {};
  const u = USERS.get(user);
  const ok = u && timingSafeEqualStr(u.password, password || "");
  if (!ok) { noteFail(ip); audit("login_failed", { user, ip }, null); return res.status(401).json({ error: "Identifiants invalides." }); }
  noteSuccess(ip);
  const hours = dureeSessionHeures(req.body && req.body.remember);
  const token = createToken(u.user, u.role, hours);
  res.cookie("dash_session", token, { httpOnly: true, sameSite: "lax", secure: config.isProd, maxAge: hours * 3600_000 });
  audit("login", { user: u.user, role: u.role, ip }, u.user);
  res.json({ user: u.user, role: u.role, caps: capsFor(u.role) });
}

/**
 * Durée d'une session : `sessionHours` par défaut, `rememberDays` seulement sur
 * demande EXPLICITE (`remember === true`, jamais une chaîne ni un 1) et si
 * l'option n'est pas coupée côté serveur. La page ne choisit pas la durée,
 * elle ne peut que demander l'option que le serveur autorise.
 */
export function dureeSessionHeures(remember) {
  if (remember === true && config.rememberDays > 0) return config.rememberDays * 24;
  return config.sessionHours;
}

export function logout(req, res) {
  if (req.session) audit("logout", {}, req.session.u);
  res.clearCookie("dash_session");
  res.json({ ok: true });
}

export function me(req, res) {
  if (!req.session) return res.status(401).json({ error: "non authentifié" });
  res.json({ user: req.session.u, role: req.session.role, caps: capsFor(req.session.role), expiresAt: req.session.exp || null, rememberDays: config.rememberDays, adressesTelephone: adressesTelephone(), env: config.dashEnv, allowMutations: config.allowMutations, claudeLive: liveFixAvailable(), claudeVia: config.anthropicKey ? "api" : claudeCliState().available ? "cli" : "manuel", claudeInstalled: claudeCliState().installed });
}

/**
 * Adresses du poste joignables depuis un téléphone du même réseau (IPv4 privées
 * seulement : une adresse publique ou de lien local n'a rien à faire sur l'écran).
 * Réservé à une session authentifiée (servi par /me), jamais par /health.
 */
export function adressesTelephone(interfaces = os.networkInterfaces(), port = config.port) {
  const out = [];
  for (const liste of Object.values(interfaces || {})) {
    for (const i of liste || []) {
      const fam = i && (i.family === "IPv4" || i.family === 4);
      if (!fam || i.internal) continue;
      if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(i.address)) continue;
      out.push(`http://${i.address}:${port}/mobile.html`);
    }
  }
  return [...new Set(out)];
}

// Middleware : injecte req.session si cookie valide.
export function sessionMiddleware(req, res, next) {
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/(?:^|;\s*)dash_session=([^;]+)/);
  req.session = m ? verifyToken(decodeURIComponent(m[1])) : null;
  next();
}
export function requireAuth(req, res, next) {
  if (!req.session) return res.status(401).json({ error: "Authentification requise." });
  next();
}
export function requireCap(cap) {
  return (req, res, next) => {
    if (!req.session) return res.status(401).json({ error: "Authentification requise." });
    if (!can(req.session.role, cap)) { audit("forbidden", { cap, path: req.path }, req.session.u); return res.status(403).json({ error: "Permission insuffisante (" + cap + ")." }); }
    next();
  };
}
