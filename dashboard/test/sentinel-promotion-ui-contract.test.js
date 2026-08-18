import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

test("promotion route reste strictement GET et authentifiée", () => {
  const src = read("server/sentinel-promotion-routes.js");
  assert.match(src, /api\.get\("\/sentinel\/promotions",\s*auth\.requireAuth/);
  assert.doesNotMatch(src, /api\.(post|patch|delete|put)\("\/sentinel\/promotions/);
  assert.match(src, /mutation:\s*false/);
  assert.match(src, /productionDeploy:\s*false/);
});

test("Command Center ne doit jamais appeler une mutation promotion Sentinel", () => {
  const js = read("public/js/command.js");
  assert.doesNotMatch(js, /fetch\([^\n]*sentinel\/promotions[^\n]*method\s*:\s*["'](?:POST|PATCH|DELETE|PUT)/i);
  assert.doesNotMatch(js, /api\([^\n]*sentinel\/promotions[^\n]*,(?:.|\n)*method/i);
});
