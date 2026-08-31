// ═══════════════════════════════════════════════════════════════════════════
// SESSIONS DE TEST — la campagne (« Benjamin + testeur 2 ») et son rapport.
//
// Ce module ne touche ni la production ni le dépôt : ce qu'il peut abîmer, c'est
// la CONFIANCE dans ce qu'on lit après une session de test à deux appareils.
// Son rapport croise une fenêtre temporelle avec le flux d'événements ; une
// borne fausse et l'on attribue à la session ce qui s'est passé avant ou après,
// sans que rien ne le signale.
//
// Trois choses sont figées ici : la machine à états (dont `startedAt` qui ne
// doit jamais être réécrit par une reprise — sinon la fenêtre se déplace et le
// début de la session disparaît du rapport), les bornes de la fenêtre, et les
// troncatures des notes et bugs saisis à la main.
//
// ⚠️ Les données du module vivent dans un fichier JSON : le test détourne
// `DASH_DATA_DIR` vers un dossier temporaire AVANT tout import — sinon il
// écrirait dans les vraies sessions de Benjamin.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "passio-sessions-test-"));
process.env.DASH_DATA_DIR = TMP;
process.on("exit", () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

// Import dynamique : `import` est hissé, l'environnement doit être posé avant
// que `config.js` ne le lise (même piège que git.test.js).
const sessions = await import("../server/sessions.js");
const { store, normalize } = await import("../server/store.js");
const { config } = await import("../server/config.js");

assert.equal(config.dataDir, TMP, "les sessions de test doivent être isolées");

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

let n = 0;
function evenement(ts, extra = {}) {
  store.add(normalize({
    event_id: `ev_${ts}_${n++}`, env: "production", type: "action",
    received_at: new Date(ts).toISOString(), ...extra,
  }));
}

test("création : valeurs par défaut et état initial", () => {
  const s = sessions.create({ name: "Deux appareils" }, "benjamin");
  assert.match(s.id, /^ts_/);
  assert.equal(s.status, "created");
  assert.equal(s.startedAt, null);
  assert.deepEqual(s.notes, []);
  assert.deepEqual(s.bugs, []);
  assert.equal(s.environment, "production");
  assert.ok(sessions.list().some((x) => x.id === s.id));
  assert.equal(sessions.get(s.id).name, "Deux appareils");
});

test("machine à états : une REPRISE ne réécrit pas le début de la session", async () => {
  const s = sessions.create({ name: "Cycle" }, "b");
  const demarree = sessions.control(s.id, "start", "b");
  assert.equal(demarree.status, "running");
  assert.equal(demarree.live, true);
  const debut = demarree.startedAt;
  assert.ok(debut);

  sessions.control(s.id, "pause", "b");
  assert.equal(sessions.get(s.id).status, "paused");

  // ⚠️ Deux corrections apportées à ce test après l'avoir muté. ① Sans attente
  // RÉELLE, tout tombe dans la même milliseconde et l'assertion passerait même
  // si `startedAt` était réécrit. ② C'est un SECOND « Démarrer » qu'il faut
  // envoyer, pas une reprise : `resume` ne touche pas `startedAt`, seul
  // `start` porte le garde `startedAt || now`. Le geste réel est celui-ci —
  // on met en pause, on hésite, on reclique sur Démarrer.
  await pause(20);
  const redemarree = sessions.control(s.id, "start", "b");
  assert.equal(redemarree.startedAt, debut,
    "réécrire startedAt déplacerait la fenêtre du rapport : tout ce qui précède " +
    "le second clic sortirait de la session, en silence.");

  const reprise = sessions.control(s.id, "resume", "b");
  assert.equal(reprise.status, "running");
  assert.equal(reprise.startedAt, debut);

  const finie = sessions.control(s.id, "end", "b");
  assert.equal(finie.status, "ended");
  assert.equal(finie.live, false);
  assert.ok(finie.endedAt >= debut);
});

test("un identifiant inconnu rend null, jamais une exception", () => {
  assert.equal(sessions.control("ts_inconnu", "start", "b"), null);
  assert.equal(sessions.addNote("ts_inconnu", { text: "x" }, "b"), null);
  assert.equal(sessions.addBug("ts_inconnu", { title: "x" }, "b"), null);
  assert.equal(sessions.get("ts_inconnu"), null);
  assert.equal(sessions.report("ts_inconnu"), null);
});

test("notes et bugs : saisie bornée, auteur conservé", () => {
  const s = sessions.create({ name: "Saisie" }, "b");
  sessions.addNote(s.id, { text: "x".repeat(5000) }, "benjamin");
  sessions.addBug(s.id, {
    title: "t".repeat(500), description: "d".repeat(5000), severity: "critical",
  }, "benjamin");

  const apres = sessions.get(s.id);
  assert.equal(apres.notes[0].text.length, 2000);
  assert.equal(apres.notes[0].author, "benjamin");
  assert.equal(apres.notes[0].type, "note");
  assert.equal(apres.bugs[0].title.length, 200);
  assert.equal(apres.bugs[0].description.length, 2000);
  assert.equal(apres.bugs[0].severity, "critical");
});

test("rapport : la fenêtre borne DES DEUX CÔTÉS", async () => {
  const s = sessions.create({ name: "Fenêtre" }, "b");
  const t0 = Date.now();

  // Avant la session : ne doit pas y entrer.
  evenement(t0 - 600_000, { action: "avant", user_label: "fantome" });

  sessions.control(s.id, "start", "b");
  const debut = sessions.get(s.id).startedAt;
  // ⚠️ `control` horodate avec `Date.now()` : sans attente réelle, « démarrer »
  // et « terminer » tombent dans la même milliseconde et la fenêtre est VIDE.
  // Le test échouait alors pour une raison qui n'a rien à voir avec le module.
  await pause(20);

  evenement(debut + 10, { action: "pendant", screen: "feed", user_label: "ben" });
  evenement(debut + 20, { type: "error", message: "boum", user_label: "ben" });
  evenement(debut + 30, { type: "api", endpoint: "/rest/v1/posts", duration_ms: 100, user_label: "lea" });
  evenement(debut + 40, { type: "api", endpoint: "/rest/v1/posts", duration_ms: 300, user_label: "lea" });

  await pause(20);
  sessions.control(s.id, "end", "b");
  const fin = sessions.get(s.id).endedAt;
  assert.ok(fin > debut, "la fenêtre doit avoir une durée réelle");

  // Après la fin : la session est close, l'événement lui est étranger.
  evenement(fin + 600_000, { action: "apres", user_label: "fantome" });

  const r = sessions.report(s.id);
  assert.equal(r.window.from, debut);
  assert.equal(r.window.to, fin);
  assert.equal(r.summary.totalEvents, 4, "seuls les 4 événements de la fenêtre comptent");
  assert.equal(r.summary.errors, 1);
  assert.equal(r.summary.apiCalls, 2);
  assert.equal(r.summary.avgLatency, 200, "moyenne des seules requêtes chronométrées");
  assert.deepEqual(r.summary.participants.sort(), ["ben", "lea"]);
  assert.ok(!r.summary.participants.includes("fantome"),
    "un participant venu d'un événement hors fenêtre fausserait le compte rendu");
  assert.equal(r.byScreen.feed, 1);
  assert.equal(r.summary.bugsManual, 0);
});

test("rapport : une session jamais démarrée part de sa création", () => {
  // `startedAt` est nul tant qu'on n'a pas cliqué « Démarrer » : sans le repli
  // sur `createdAt`, la fenêtre commencerait à l'époque Unix et le rapport
  // ramasserait TOUT le tampon d'événements.
  const s = sessions.create({ name: "Jamais démarrée" }, "b");
  const r = sessions.report(s.id);
  assert.equal(r.window.from, sessions.get(s.id).createdAt);
  assert.ok(r.window.to >= r.window.from);
  assert.equal(r.summary.totalEvents, 0);
});

test("rapport : la chronologie est bornée à 200 lignes", async () => {
  const s = sessions.create({ name: "Volume" }, "b");
  sessions.control(s.id, "start", "b");
  const debut = sessions.get(s.id).startedAt;
  await pause(5);
  // Tous au même instant, DANS la fenêtre : dater `debut + i` placerait les
  // derniers dans le futur du rapport, qui les exclurait à juste titre.
  for (let i = 0; i < 250; i++) evenement(debut + 1, { action: "clic" });
  const r = sessions.report(s.id);
  assert.ok(r.summary.totalEvents >= 250);
  assert.equal(r.timeline.length, 200, "une chronologie non bornée ferait enfler la réponse");
});
