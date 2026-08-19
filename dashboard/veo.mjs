#!/usr/bin/env node
// PASSIO — lance une génération Veo depuis le Control Center.
// Exemple : npm run veo -- --prompt "A cinematic Passio meetup..." --vertical --fast
import { generate, operation, status } from "./server/veo.js";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}
function has(name) { return process.argv.includes(`--${name}`); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

const current = status();
if (has("status")) {
  console.log(JSON.stringify(current, null, 2));
  process.exit(current.configured ? 0 : 2);
}

const prompt = arg("prompt");
if (!prompt) {
  console.error("Usage: npm run veo -- --prompt \"English prompt\" [--vertical] [--fast] [--duration 8] [--resolution 1080p]");
  process.exit(2);
}

const request = {
  prompt,
  fast: has("fast"),
  aspectRatio: has("vertical") ? "9:16" : (arg("aspect") || "16:9"),
  durationSeconds: Number(arg("duration") || 8),
  resolution: arg("resolution") || "720p",
  sampleCount: Number(arg("count") || 1),
  negativePrompt: arg("negative") || "",
  generateAudio: !has("no-audio"),
  enhancePrompt: !has("no-enhance"),
  personGeneration: has("no-people") ? "disallow" : "allow_adult",
};

try {
  console.log(`Veo: démarrage (${request.aspectRatio}, ${request.durationSeconds}s, ${request.resolution}${request.fast ? ", fast" : ""})...`);
  const started = await generate(request, "passio-veo-cli");
  console.log(`Opération: ${started.operationName}`);

  if (has("no-wait")) process.exit(0);
  while (true) {
    await sleep(15_000);
    const polled = await operation({ operationName: started.operationName }, "passio-veo-cli");
    if (!polled.done) {
      console.log("Veo: génération en cours...");
      continue;
    }
    if (polled.state === "failed") {
      console.error("Veo: échec", JSON.stringify(polled.error || {}, null, 2));
      process.exit(1);
    }
    console.log("Veo: terminé.");
    for (const video of polled.videos) console.log(video.gcsUri || "vidéo sans URI");
    process.exit(0);
  }
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
}
