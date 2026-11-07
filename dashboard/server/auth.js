// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTIFICATION & AUTORISATION du tableau de bord.
// Sessions signées HMAC (aucune dépendance JWT), cookie httpOnly, rôles,
// limitation des tentatives, matrice de permissions. Pas de secret en clair
// côté client, comparaison en temps constant.
// ═══════════════════════════════════════════════════════════════════════════
import crypto from "node:crypto";
import { config } from "./config.js";
import { audit } from "./audit.js";
import { JsonDb } from "./jsondb.js";
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
// Empreinte du compte dans le jeton (F-11) : changer le mot de passe ou le rôle, ou retirer le
// compte, invalide ses sessions. Avant, seul un changement de DASH_SESSION_SECRET le faisait.
function empreinte(u) {
  return crypto.createHmac("sha256", config.sessionSecret).update(`${u.user}|${u.role}|${u.password}`).digest("base64url").slice(0, 16);
}

// Déconnexion effective : un cookie rejoué après `logout` est refusé. Signature → expiration,
// sur disque pour survivre à un redémarrage, purgé à chaque ajout.
const revoquees = new JsonDb("sessions-revoquees", { items: {} });
function revoquer(sig, exp) {
  revoquees.update((d) => {
    const now = Date.now();
    for (const [k, v] of Object.entries(d.items)) if (v < now) delete d.items[k];
    d.items[sig] = exp;
  });
}
function jetonDuCookie(req) {
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)dash_session=([^;]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

export function createToken(user, role, hours = config.sessionHours) {
  const compte = USERS.get(user);
  const payload = { u: user, role, sv: compte ? empreinte(compte) : null, exp: Date.now() + hours * 3600_000 };
  const body = b64url(JSON.stringify(payload));
  return body + "." + sign(body);
}
export function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  // Longueurs comparées en OCTETS : une signature multioctet de même longueur en caractères
  // faisait lever timingSafeEqual, donc une erreur 500 avec sa pile (F-14).
  const attendu = Buffer.from(sign(body));
  const recu = Buffer.from(String(sig));
  if (recu.length !== attendu.length) return null;
  if (!crypto.timingSafeEqual(recu, attendu)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) return null;
    const compte = USERS.get(payload.u);
    if (!compte || compte.role !== payload.role || payload.sv !== empreinte(compte)) return null;
    if (Object.hasOwn(revoquees.get().items, sig)) return null;
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
function purgerTentatives() {
  if (attempts.size <= 10_000) return;
  const now = Date.now();
  for (const [k, a] of attempts) if (a.until < now) attempts.delete(k);
}

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ba.length !== bb.length) { crypto.timingSafeEqual(ba, ba); return false; }
  return crypto.timingSafeEqual(ba, bb);
}

// ─── Handlers ────────────────────────────────────────────────────────────────
export function login(req, res) {
  // Valeurs bornées (F-13) : le nom d'utilisateur et l'adresse finissent dans un journal
  // réécrit en entier à chaque entrée, et un corps de requête peut peser 1 Mo.
  const ip = String(req.ip || req.socket.remoteAddress || "?").slice(0, 64);
  purgerTentatives();
  if (rateLimited(ip)) { audit("login_blocked", { ip }, null); return res.status(429).json({ error: "Trop de tentatives, réessaie dans 5 minutes." }); }
  const { user, password } = req.body || {};
  const u = USERS.get(user);
  // Un mot de passe non textuel faisait lever String() et rendait 500 pour un compte existant,
  // 401 sinon : un oracle de nom d'utilisateur, hors du compteur d'échecs (F-14).
  const ok = u && typeof password === "string" && timingSafeEqualStr(u.password, password);
  if (!ok) { noteFail(ip); audit("login_failed", { user: String(user ?? "").slice(0, 80), ip }, null); return res.status(401).json({ error: "Identifiants invalides." }); }
  noteSuccess(ip);
  const hours = dureeSessionHeures(req.body && req.body.remember);
  const token = createToken(u.user, u.role, hours);
  res.cookie("dash_session", token, { httpOnly: true, sameSite: "strict", secure: config.isProd, maxAge: hours * 3600_000 });
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
  if (req.session) {
    audit("logout", {}, req.session.u);
    const sig = String(jetonDuCookie(req) || "").split(".")[1];
    if (sig) revoquer(sig, req.session.exp);
  }
  res.clearCookie("dash_session");
  res.json({ ok: true });
}

export function me(req, res) {
  if (!req.session) return res.status(401).json({ error: "non authentifié" });
  res.json({ user: req.session.u, role: req.session.role, caps: capsFor(req.session.role), expiresAt: req.session.exp || null, rememberDays: config.rememberDays, env: config.dashEnv, allowMutations: config.allowMutations, claudeLive: liveFixAvailable(), claudeVia: config.anthropicKey ? "api" : claudeCliState().available ? "cli" : "manuel", claudeInstalled: claudeCliState().installed });
}

// Middleware : injecte req.session si cookie valide.
export function sessionMiddleware(req, res, next) {
  req.session = verifyToken(jetonDuCookie(req));
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
