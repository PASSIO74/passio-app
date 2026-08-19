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
  // Les mutations de code sont TOUJOURS refusées en production (sécurité).
  allowMutations: env.DASH_ALLOW_MUTATIONS === "true" && (env.DASH_ENV || "development") !== "production",

  anthropicKey: env.ANTHROPIC_API_KEY || "",
  anthropicModel: env.ANTHROPIC_MODEL || "claude-opus-4-8",
  // Modèle du `claude` local pour la réparation en 1 clic. Sonnet = rapide (le
  // bouton doit répondre vite) ; surchargeable via CLAUDE_CLI_MODEL (ex. "opus").
  claudeCliModel: env.CLAUDE_CLI_MODEL || "sonnet",
  // Modèle du mode « Analyse approfondie » (lit le vrai code) : qualité max.
  claudeCliModelDeep: env.CLAUDE_CLI_MODEL_DEEP || "opus",

  // ── Google Vertex AI / Gemini / Veo ───────────────────────────────────────
  // Aucun secret Google n'est stocké ici : Veo utilise l'authentification locale
  // gcloud. La région REST par défaut suit les exemples officiels Veo.
  googleCloudProject: env.GOOGLE_CLOUD_PROJECT || "",
  googleCloudLocation: env.GOOGLE_CLOUD_LOCATION || "us-central1",
  veoModel: env.PASSIO_VEO_MODEL || "veo-3.1-generate-001",
  veoFastModel: env.PASSIO_VEO_FAST_MODEL || "veo-3.1-fast-generate-001",
  veoOutputGcsUri: env.PASSIO_VEO_OUTPUT_GCS_URI || "",

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

/** Indique si la collecte Supabase est configurée (sinon mode démo/local). */
export const supabaseReady = Boolean(config.supabaseUrl && config.supabaseServiceKey);
