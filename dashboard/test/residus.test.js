// Résidus dans le pilotage (cinquième contre-revue Astra, §9) : le dashboard
// évalue le registre du dépôt avec le MÊME code que la CI et le montre dans le
// readiness. Ces tests jouent le vrai dépôt (parent du dashboard) et des copies
// altérées : registre invalide, absent, incohérent avec le dépôt.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { residusSnapshot, residusDomaine } from "../server/residus.js";
import { computeReadiness } from "../server/readiness.js";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DEPOT = path.resolve(ICI, "..", "..");
const REGISTRE = ".passio/residus/registre-residus.json";

function copieDepot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "passio-dash-residus-"));
  for (const rel of ["scripts/lib/registre-residus.js", REGISTRE]) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(path.join(DEPOT, rel), path.join(dir, rel));
  }
  fs.mkdirSync(path.join(dir, "migrations"));
  for (const f of fs.readdirSync(path.join(DEPOT, "migrations")).filter((f) => f.endsWith(".sql"))) fs.copyFileSync(path.join(DEPOT, "migrations", f), path.join(dir, "migrations", f));
  return dir;
}
const ov = { health: { errors5m: 0 }, totals: { apiSuccessRate: 100 } };
const observationLive = { state: "LIVE", parts: {} };
const releaseLive = { state: "LIVE", detail: "chaîne complète" };
const ready = (residus) => computeReadiness({ overview: ov, checklist: [{ status: "reussi" }], bugs: [], authz: { pass: 9, total: 9 }, observation: observationLive, release: releaseLive, residus });

test("le vrai registre du dépôt : LIVE, aucun écart, RES-06 traitable → domaine AMBRE, santé globale au plus ambre (non critique)", () => {
  const snap = residusSnapshot(DEPOT, { aujourdhui: "2026-09-15" });
  assert.equal(snap.state, "LIVE", JSON.stringify(snap).slice(0, 300));
  assert.deepEqual(snap.ecarts, []);
  assert.ok(snap.traitables.includes("RES-06"));
  assert.ok(snap.lignes.every((l) => l.id && l.gravite && l.etats && l.condition));
  const d = residusDomaine(snap);
  assert.equal(d.etat, "ambre");
  assert.match(d.detail, /RES-06/);
  const r = ready(snap);
  const dom = r.domaines.find((x) => x.cle === "residus");
  assert.equal(dom.etat, "ambre");
  assert.equal(dom.critique, false);
  assert.equal(r.statut, "ambre");
  assert.equal(r.cause, null, "un domaine non critique n'est jamais LA cause");
});

test("registre absent → UNAVAILABLE → INCONNU (jamais « aucun résidu ») ; évaluateur absent → idem", () => {
  const dir = copieDepot();
  fs.rmSync(path.join(dir, REGISTRE));
  const s1 = residusSnapshot(dir);
  assert.equal(s1.state, "UNAVAILABLE");
  assert.equal(residusDomaine(s1).etat, "inconnu");
  fs.rmSync(path.join(dir, "scripts"), { recursive: true });
  assert.equal(residusSnapshot(dir).state, "UNAVAILABLE");
  assert.equal(residusDomaine(null).etat, "inconnu");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("registre invalide → INVALID → ROUGE avec les premières erreurs", () => {
  const dir = copieDepot();
  const reg = JSON.parse(fs.readFileSync(path.join(dir, REGISTRE), "utf8"));
  delete reg.residus[0].critere_de_fermeture;
  reg.residus[1].gravite = "P7";
  fs.writeFileSync(path.join(dir, REGISTRE), JSON.stringify(reg));
  const s = residusSnapshot(dir);
  assert.equal(s.state, "INVALID");
  assert.ok(s.erreurs.some((e) => /critere_de_fermeture/.test(e)) && s.erreurs.some((e) => /gravité/.test(e)));
  const d = residusDomaine(s);
  assert.equal(d.etat, "rouge");
  assert.match(d.detail, /registre invalide/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("résidu devenu traitable mais « en_attente » → INCONSISTENT → ROUGE, l'écart nommé ; réexaminé → LIVE", () => {
  const dir = copieDepot();
  const reg = JSON.parse(fs.readFileSync(path.join(dir, REGISTRE), "utf8"));
  const x = reg.residus.find((r) => r.id === "RES-06");
  x.reexamen = { statut: "en_attente", le: "2026-09-15", note: "oublié" };
  fs.writeFileSync(path.join(dir, REGISTRE), JSON.stringify(reg));
  const s = residusSnapshot(dir, { aujourdhui: "2026-09-15" });
  assert.equal(s.state, "INCONSISTENT");
  assert.match(s.ecarts[0], /RES-06 : devenu traitable/);
  assert.equal(residusDomaine(s).etat, "rouge");
  assert.equal(ready(s).domaines.find((d) => d.cle === "residus").etat, "rouge");
  x.reexamen = { statut: "planifie", le: "2026-09-15", note: "vu", chantier: "PR #472" };
  fs.writeFileSync(path.join(dir, REGISTRE), JSON.stringify(reg));
  assert.equal(residusSnapshot(dir, { aujourdhui: "2026-09-15" }).state, "LIVE");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("aucun résidu traitable → VERT, avec le décompte des conditions manuelles", () => {
  const dir = copieDepot();
  const reg = JSON.parse(fs.readFileSync(path.join(dir, REGISTRE), "utf8"));
  for (const r of reg.residus) if (r.reexamen.statut !== "en_attente") r.reexamen = { statut: "en_attente", le: "2026-09-15", note: "n" };
  for (const r of reg.residus) if (r.condition_de_reexamen.type === "objet_sql") r.condition_de_reexamen = { type: "date", le: "2027-01-01" };
  fs.writeFileSync(path.join(dir, REGISTRE), JSON.stringify(reg));
  const s = residusSnapshot(dir, { aujourdhui: "2026-09-15" });
  assert.equal(s.state, "LIVE");
  const d = residusDomaine(s);
  assert.equal(d.etat, "vert");
  assert.match(d.detail, /à condition manuelle/);
  fs.rmSync(dir, { recursive: true, force: true });
});
