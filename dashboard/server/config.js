// Configuration centralisée — lue une seule fois au démarrage.
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/** Résout un chemin de dépôt relatif par rapport à la racine du dashboard. */
function resolveRepo(p) {
  if (!p) return path.resolve(ROOT, "..");
  return path.isAbsolute(p) ? p : path.resolve(ROOT, p);
}

/** @type {("admin"|"developer"|"tester"|"observer")[]} */
export const ROLES = ["admin", "developer", "tester", "observer"];

function parseExtraUsers(str) {
  if (!str) return [];
  return str.split(",").map((chunk) => {
    const [user, password, role] = chunk.split(":");
    return { user: (user || "").trim(), password: (password || "").trim(), role: ROLES.includes((role || "").trim()) ? role.trim() : "observer" };
  }).filter((u) => u.user && u.password);
}

const env = process.env;

export const config = {
  root: ROOT,
  port: Number(env.PORT || 4610),
  dashEnv: env.DASH_ENV || "development",
  isProd: (env.DASH_ENV || "development") === "production",

  sessionSecret: env.DASH_SESSION_SECRET || "dev-insecure-secret-change-me",
  sessionHours: Number(env.DASH_SESSION_HOURS || 12),
  adminUser: env.DASH_ADMIN_USER || "admin",
  adminPassword: env.DASH_ADMIN_PASSWORD || "admin",
  extraUsers: parseExtraUsers(env.DASH_EXTRA_USERS),

  supabaseUrl: env.SUPABASE_URL || "",
  supabaseServiceKey: env.SUPABASE_SERVICE_ROLE_KEY || "",
  supabaseAnonKey: env.SUPABASE_ANON_KEY || "",

  repoPath: resolveRepo(env.PASSIO_REPO_PATH),
  passioPublicUrl: env.PASSIO_PUBLIC_URL || "",
  // Les mutations de code sont TOUJOURS refusées en production (sécurité).
  allowMutations: env.DASH_ALLOW_MUTATIONS === "true" && (env.DASH_ENV || "development") !== "production",

  anthropicKey: env.ANTHROPIC_API_KEY || "",
  anthropicModel: env.ANTHROPIC_MODEL || "claude-opus-4-8",
  // Modèle du `claude` local pour la réparation en 1 clic. Sonnet = rapide (le
  // bouton doit répondre vite) ; surchargeable via CLAUDE_CLI_MODEL (ex. "opus").
  claudeCliModel: env.CLAUDE_CLI_MODEL || "sonnet",
  // Modèle du mode « Analyse approfondie » (lit le vrai code) : qualité max.
  claudeCliModelDeep: env.CLAUDE_CLI_MODEL_DEEP || "opus",

  eventBuffer: Number(env.DASH_EVENT_BUFFER || 5000),
  // Dossier des petites bases JSON. Surchargeable pour que les TESTS n'écrasent
  // pas les données réelles du dashboard (alertes, diagnostics, sessions).
  dataDir: env.DASH_DATA_DIR ? path.resolve(ROOT, env.DASH_DATA_DIR) : path.join(ROOT, "data"),

  // ── Ne montrer que les VRAIS testeurs ────────────────────────────────────
  // N'ingérer que les événements de PRODUCTION : les runs e2e et le dev local
  // émettent en env=development (des milliers de faux appareils jetables) et
  // sont écartés d'office. Mettre DASH_ONLY_PROD_EVENTS=false pour tout voir.
  onlyProdEvents: env.DASH_ONLY_PROD_EVENTS !== "false",
  // Exclusion interne OPTIONNELLE : vide par défaut → tes propres comptes
  // comptent comme des testeurs (choix explicite). Ne renseigner DASH_INTERNAL_UIDS
  // (dans .env, hors git) que si tu veux un jour retirer des comptes des métriques.
  internalUids: (env.DASH_INTERNAL_UIDS || "")
    .split(",").map((s) => s.trim()).filter(Boolean),
};

// ⚠️ PIL-02 (contre-revue Astra, 2026-09-15) : LE PILOTAGE NE DÉMARRE PAS EN
// PRODUCTION AVEC SES IDENTIFIANTS PAR DÉFAUT. Sans .env, `admin`/`admin`
// donnait le rôle admin et le secret HMAC par défaut rendait le cookie de
// session forgeable — un facteur unique, connu de quiconque lit ce fichier.
// En production (`DASH_ENV=production`), chacun des trois défauts est une
// ERREUR au démarrage ; en développement, un avertissement lisible.
// `verifierSecrets` est exportée pour être éprouvée sans démarrer le serveur.
export const DEFAUTS_INTERDITS = {
  sessionSecret: "dev-insecure-secret-change-me",
  adminUser: "admin",
  adminPassword: "admin",
};
export function verifierSecrets(cfg = config) {
  const fautes = [];
  if (cfg.sessionSecret === DEFAUTS_INTERDITS.sessionSecret || String(cfg.sessionSecret || "").length < 32) fautes.push("DASH_SESSION_SECRET absent ou trop court (32 caractères minimum)");
  if (cfg.adminPassword === DEFAUTS_INTERDITS.adminPassword || String(cfg.adminPassword || "").length < 12) fautes.push("DASH_ADMIN_PASSWORD absent, par défaut ou trop court (12 caractères minimum)");
  if (cfg.adminUser === DEFAUTS_INTERDITS.adminUser) fautes.push("DASH_ADMIN_USER laissé à « admin »");
  return fautes;
}
{
  const fautes = verifierSecrets(config);
  if (fautes.length && config.isProd) {
    throw new Error("Pilotage refusé en production — identifiants par défaut : " + fautes.join(" ; ") + ". Poser DASH_SESSION_SECRET, DASH_ADMIN_USER et DASH_ADMIN_PASSWORD dans dashboard/.env.");
  }
  if (fautes.length && !process.env.DASH_SILENCE_SECRETS) {
    console.warn("⚠️  pilotage : identifiants par défaut (" + fautes.join(" ; ") + ") — refusés en production, tolérés ici.");
  }
}

/** Indique si la collecte Supabase est configurée (sinon mode démo/local). */
export const supabaseReady = Boolean(config.supabaseUrl && config.supabaseServiceKey);
