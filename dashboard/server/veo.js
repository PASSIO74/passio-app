// PASSIO Control Center — Google Vertex AI / Veo 3.1 integration.
// Server-side only: no Google credential is ever exposed to the browser or Git.
// Authentication uses the locally authenticated gcloud CLI access token.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";
import { audit } from "./audit.js";

const exec = promisify(execFile);
const ALLOWED_MODELS = new Set([config.veoModel, config.veoFastModel]);
const ALLOWED_ASPECTS = new Set(["16:9", "9:16"]);
const ALLOWED_DURATIONS = new Set([4, 6, 8]);
const ALLOWED_RESOLUTIONS = new Set(["720p", "1080p"]);
const ALLOWED_PERSON_GENERATION = new Set(["allow_adult", "disallow"]);

function problem(message, code = 400) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function configured() {
  return Boolean(config.googleCloudProject && config.veoOutputGcsUri);
}

function endpoint(model, action) {
  const location = config.googleCloudLocation;
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(config.googleCloudProject)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:${action}`;
}

async function accessToken() {
  const command = process.platform === "win32" ? "gcloud.cmd" : "gcloud";
  try {
    const { stdout } = await exec(command, ["auth", "print-access-token"], {
      timeout: 20_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    const token = String(stdout || "").trim();
    if (!token) throw new Error("jeton vide");
    return token;
  } catch (cause) {
    throw problem(
      "Google Cloud n'est pas authentifié localement. Installer/configurer gcloud puis exécuter `gcloud auth login` avant d'utiliser Veo.",
      503,
    );
  }
}

async function vertexPost(url, body) {
  const token = await accessToken();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = { error: { message: `HTTP ${response.status}` } }; }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Vertex AI HTTP ${response.status}`;
    throw problem(`Veo / Vertex AI : ${message}`, response.status >= 500 ? 502 : response.status);
  }
  return payload;
}

function cleanInput(input = {}) {
  if (!configured()) {
    throw problem("Veo n'est pas encore configuré : GOOGLE_CLOUD_PROJECT et PASSIO_VEO_OUTPUT_GCS_URI sont requis.", 503);
  }

  const prompt = String(input.prompt || "").trim();
  if (!prompt) throw problem("prompt requis");
  if (prompt.length > 6000) throw problem("prompt trop long (6000 caractères maximum)");

  const model = input.fast === true ? config.veoFastModel : String(input.model || config.veoModel);
  if (!ALLOWED_MODELS.has(model)) throw problem("modèle Veo non autorisé");

  const aspectRatio = String(input.aspectRatio || "16:9");
  if (!ALLOWED_ASPECTS.has(aspectRatio)) throw problem("aspectRatio doit être 16:9 ou 9:16");

  const durationSeconds = Number(input.durationSeconds || 8);
  if (!ALLOWED_DURATIONS.has(durationSeconds)) throw problem("durationSeconds doit être 4, 6 ou 8");

  const resolution = String(input.resolution || "720p");
  if (!ALLOWED_RESOLUTIONS.has(resolution)) throw problem("resolution doit être 720p ou 1080p");

  const sampleCount = Number(input.sampleCount || 1);
  if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 4) throw problem("sampleCount doit être compris entre 1 et 4");

  const personGeneration = String(input.personGeneration || "allow_adult");
  if (!ALLOWED_PERSON_GENERATION.has(personGeneration)) throw problem("personGeneration doit être allow_adult ou disallow");

  const parameters = {
    storageUri: config.veoOutputGcsUri,
    sampleCount,
    durationSeconds,
    aspectRatio,
    resolution,
    generateAudio: input.generateAudio !== false,
    enhancePrompt: input.enhancePrompt !== false,
    personGeneration,
  };
  const negativePrompt = String(input.negativePrompt || "").trim();
  if (negativePrompt) parameters.negativePrompt = negativePrompt.slice(0, 2000);
  if (input.seed !== undefined && input.seed !== null && input.seed !== "") {
    const seed = Number(input.seed);
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw problem("seed invalide");
    parameters.seed = seed;
  }

  return { prompt, model, parameters };
}

export function status() {
  return {
    provider: "Google Vertex AI",
    capability: "Veo 3.1 video generation",
    configured: configured(),
    projectConfigured: Boolean(config.googleCloudProject),
    outputConfigured: Boolean(config.veoOutputGcsUri),
    location: config.googleCloudLocation,
    model: config.veoModel,
    fastModel: config.veoFastModel,
    auth: "gcloud-local",
    output: config.veoOutputGcsUri ? "gcs" : "unconfigured",
  };
}

export async function generate(input = {}, actor = "unknown") {
  const { prompt, model, parameters } = cleanInput(input);
  const result = await vertexPost(endpoint(model, "predictLongRunning"), {
    instances: [{ prompt }],
    parameters,
  });
  if (!result?.name) throw problem("Veo n'a pas renvoyé de nom d'opération.", 502);
  audit("veo_generate", {
    operation: result.name,
    model,
    aspectRatio: parameters.aspectRatio,
    durationSeconds: parameters.durationSeconds,
    resolution: parameters.resolution,
    sampleCount: parameters.sampleCount,
  }, actor);
  return {
    ok: true,
    operationName: result.name,
    model,
    state: "running",
  };
}

export async function operation(input = {}, actor = "unknown") {
  if (!configured()) throw problem("Veo n'est pas configuré.", 503);
  const operationName = String(input.operationName || "").trim();
  if (!operationName) throw problem("operationName requis");
  const match = operationName.match(/\/models\/([^/]+)\/operations\//);
  if (!match) throw problem("operationName Veo invalide");
  const model = match[1];
  if (!ALLOWED_MODELS.has(model)) throw problem("opération d'un modèle Veo non autorisé");

  const result = await vertexPost(endpoint(model, "fetchPredictOperation"), { operationName });
  const videos = Array.isArray(result?.response?.videos)
    ? result.response.videos.map((v) => ({ gcsUri: v.gcsUri || null, mimeType: v.mimeType || "video/mp4" }))
    : [];
  const done = result?.done === true;
  if (done) audit("veo_operation_complete", { operation: operationName, model, videos: videos.length }, actor);
  return {
    ok: true,
    operationName,
    model,
    done,
    state: done ? (result?.error ? "failed" : "done") : "running",
    error: result?.error || null,
    videos,
    filteredCount: result?.response?.raiMediaFilteredCount ?? null,
  };
}

export const _test = { cleanInput, configured };
