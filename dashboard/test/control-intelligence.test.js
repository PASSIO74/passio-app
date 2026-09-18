// ═══════════════════════════════════════════════════════════════════════════
// POSTE DE COMMANDE — l'écran qu'on regarde quand on ne sait pas quoi regarder.
//
// `controlCommand()` agrège tout le reste (sécurité, release, santé technique,
// santé produit, alertes, incidents) et en tire des priorités P0→P3. Il n'y a
// aucune IA dedans, et c'est le point : il doit continuer de fonctionner quand
// Supabase n'est pas branché, quand les crédits Claude sont épuisés, quand la
// campagne QA n'a jamais tourné. Un poste de commande qui tombe faute de données
// est un poste de commande inutile — précisément les jours où l'on en a besoin.
//
// Ce fichier ne re-teste pas chaque sous-module : il vérifie que l'agrégation
// TIENT dans le pire cas (rien de configuré) et qu'elle ne rend jamais un vert
// par défaut d'information.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "passio-ci-test-"));
process.env.DASH_DATA_DIR = TMP;
process.env.DASH_ENV = "development";
process.on("exit", () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

const { controlCommand } = await import("../server/control-intelligence.js");
const { _setAdminForTests } = await import("../server/ingest.js");

test("le poste de commande se construit sans Supabase et sans crédits", async () => {
  _setAdminForTests(null);
  const c = await controlCommand();
  assert.ok(c.generatedAt, "un état de commande est daté");
  assert.deepEqual(Object.keys(c.domains).sort(),
    ["observation", "product", "release", "security", "technical"],
    "les cinq domaines doivent toujours être décrits, même vides");
  assert.ok(c.global?.state, "un état global doit être rendu");
  assert.ok(Array.isArray(c.risks) && Array.isArray(c.actions));
  assert.ok(c.actions.length <= 3, "le poste de commande propose au plus trois actions");
  assert.ok(c.counts && typeof c.counts.p0p1 === "number");
});

test("aucun domaine ne se déclare LIVE par défaut d'information", async () => {
  _setAdminForTests(null);
  const c = await controlCommand();
  const domaines = Object.values(c.domains);
  assert.equal(domaines.length, 5);
  for (const d of domaines) {
    assert.ok(["LIVE", "DEGRADED", "NOT_CONFIGURED", "UNAVAILABLE"].includes(d.state),
      `état inconnu : ${d.state}`);
    assert.ok(d.detail, `${d.label} : un état sans explication n'aide personne`);
  }
  // Sans Supabase, sans campagne QA et sans preuve AUTHZ dans cette session, un
  // « tout va bien » serait un mensonge : au moins un domaine doit le dire.
  assert.ok(domaines.some((d) => d.state !== "LIVE"),
    "tout au vert alors que rien n'est branché = faux vert");
});

test("les priorités restent dans l'échelle annoncée", async () => {
  const c = await controlCommand();
  const c2 = c;
  for (const r of c2.risks) {
    assert.match(String(r.priority), /^P[0-3]$/, `priorité hors échelle : ${r.priority}`);
    assert.ok(r.key, "un risque sans clé n'est pas dédupliquable");
  }
  // Les actions reprennent les risques les plus prioritaires, dans l'ordre.
  c2.actions.forEach((a, i) => {
    assert.equal(a.rank, i + 1);
    assert.equal(a.priority, c2.risks[i].priority);
    assert.equal(a.riskKey, c2.risks[i].key);
    assert.ok(a.action, "une priorité sans action à faire n'aide personne");
  });
  // ⚠️ Limite assumée de ce fichier. La règle « la santé produit ne fabrique
  // jamais un rouge système » — celle qui empêche de confondre « moins
  // d'utilisateurs aujourd'hui » et « panne » — n'est vérifiée ici que dans son
  // ÉNONCÉ, pas dans son effet : l'exercer demanderait de forcer `kpi()` dans un
  // état pire que les domaines critiques, et ce module n'expose aucun point
  // d'injection pour ça. Mesuré : ajouter `domains.product` aux domaines
  // critiques ne fait PAS rougir ce fichier. À reprendre le jour où `kpi()`
  // devient injectable.
  assert.match(c2.global.rule, /technique\/sécurité\/observation/);
});

// ─── D1-TM-05 : domaines purs Release et Observation ────────────────────────
// Sur le poste de test (sans PASSIO_PUBLIC_URL) le verdict de release est
// NOT_CONFIGURED : la conversion UNKNOWN → DEGRADED et la priorité de
// `observation.core` n'étaient jamais exercées. Mutations éprouvées :
//   · `r.state === "UNKNOWN" ? "DEGRADED"` → `? "LIVE"`      → « release UNKNOWN »
//   · `o.core || o.state` → `o.state || o.core`               → « observation.core prime »
const { releaseDomain, observationDomain } = await import("../server/control-intelligence.js");

test("release UNKNOWN (preuve pas encore lue) = DEGRADED, jamais LIVE ni NOT_CONFIGURED ; sans snapshot = NOT_CONFIGURED", () => {
  const inconnu = releaseDomain({ current: {}, state: "UNKNOWN", detail: "preuve en attente" });
  assert.equal(inconnu.state, "DEGRADED");
  assert.notEqual(inconnu.state, "LIVE", "un faux vert sur le domaine Release alimenterait un GO");
  assert.equal(inconnu.detail, "preuve en attente");
  assert.equal(releaseDomain({ current: {}, state: "LIVE", detail: "ok" }).state, "LIVE");
  assert.equal(releaseDomain({ current: {}, state: "DEGRADED" }).state, "DEGRADED");
  assert.equal(releaseDomain({ current: {} }).state, "DEGRADED", "sans état : dégradé, pas vert");
  assert.equal(releaseDomain(null).state, "NOT_CONFIGURED");
  assert.equal(releaseDomain({ state: "LIVE" }).state, "NOT_CONFIGURED", "sans snapshot courant, un LIVE n'a pas de preuve");
});

test("observation.core prime sur state : DEGRADED avec cœur LIVE = LIVE ; LIVE avec cœur UNAVAILABLE = UNAVAILABLE ; les parts restent dans le détail", () => {
  const parts = { dbRead: { state: "LIVE" }, canary: { state: "LIVE" }, sse: { state: "IDLE" } };
  const coeurBien = observationDomain({ state: "DEGRADED", core: "LIVE", parts });
  assert.equal(coeurBien.state, "LIVE", "le seam SSE IDLE (aucun navigateur) ne dégrade pas le domaine");
  assert.match(coeurBien.detail, /dbRead:LIVE · canary:LIVE · sse:IDLE/);
  assert.equal(observationDomain({ state: "LIVE", core: "UNAVAILABLE", parts }).state, "UNAVAILABLE");
  assert.equal(observationDomain({ state: "DEGRADED", parts }).state, "DEGRADED", "sans core, state fait foi");
  assert.equal(observationDomain(null).state, "NOT_CONFIGURED");
  assert.equal(observationDomain({ state: "LIVE" }).detail, "Aucun seam");
});
