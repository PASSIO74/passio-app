// ═══════════════════════════════════════════════════════════════════════════
// ENREGISTREUR DE VOL DES RELEASES — la chronologie « quel code tourne où ».
//
// Il écrit un instantané au démarrage puis toutes les minutes. Deux invariants
// portent tout le reste :
//
//   1. DÉDUPLICATION. Tant que rien ne change, l'instantané périodique doit
//      seulement rafraîchir `lastSeenAt`, pas empiler une ligne de plus. Sans
//      ça, un serveur laissé allumé une nuit écrit 480 lignes identiques : le
//      fichier enfle et l'historique — dont le seul intérêt est de montrer les
//      CHANGEMENTS — devient illisible.
//   2. AUCUN FAUX VERT. `releaseHealth` doit nommer ce qui manque. Une release
//      dont on ignore la version de base ou l'identifiant de déploiement n'est
//      pas « LIVE » : c'est exactement le moment où l'on croit savoir ce qui
//      tourne en production alors qu'on l'ignore.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "passio-release-test-"));
process.env.DASH_DATA_DIR = TMP;
process.env.DASH_RELEASE_KEEP = "5";        // plafond réduit : on le teste pour de vrai
process.env.DASH_ENV = "development";       // la preuve publique n'est exigée qu'en prod
delete process.env.PASSIO_APP_VERSION;
delete process.env.PASSIO_DB_VERSION;
delete process.env.DEPLOY_ID;
process.on("exit", () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

const { recordRelease, releaseHistory, releaseHealth, releaseSnapshot } =
  await import("../server/release-recorder.js");

test("l'instantané lit la révision réelle du dépôt", () => {
  const s = releaseSnapshot();
  assert.ok(s.at, "un instantané est daté");
  assert.ok(s.revision, "la révision git doit être lue");
  assert.match(s.revision, /^[0-9a-f]{7,40}$/, "…et ressembler à un sha");
});

test("déduplication : un instantané identique ne crée pas de ligne", () => {
  const avant = releaseHistory(100).length;
  recordRelease({ source: "essai" });
  const apres1 = releaseHistory(100).length;
  recordRelease({ source: "essai" });
  recordRelease({ source: "essai" });
  const apres2 = releaseHistory(100).length;

  assert.equal(apres1, avant + 1, "le premier instantané entre dans l'historique");
  assert.equal(apres2, apres1,
    "les suivants, identiques, ne doivent pas empiler : une nuit allumée = 480 lignes.");
  assert.ok(releaseHistory(1)[0].lastSeenAt, "…mais la dernière observation est datée");
});

test("un CHANGEMENT crée bien une ligne, et l'historique reste borné", () => {
  for (let i = 0; i < 12; i++) recordRelease({ source: "essai", appVersion: "v" + i });
  const h = releaseHistory(100);
  assert.equal(h.length, 5, "le plafond DASH_RELEASE_KEEP doit être respecté");
  assert.equal(h[0].appVersion, "v11", "…et c'est le plus RÉCENT qui est conservé");
});

test("santé : ce qui manque est nommé, jamais tu", () => {
  const r = releaseHealth();
  assert.notEqual(r.state, "LIVE",
    "sans version d'app ni de base ni identifiant de déploiement, ce n'est pas LIVE");
  assert.ok(r.missing.includes("frontend version"));
  assert.ok(r.missing.includes("DB version"));
  assert.ok(r.missing.includes("deploy id"));
  assert.match(r.detail, /manquantes/, "le détail doit dire ce qui manque");
  assert.equal(r.publicRequired, false, "hors production, la preuve publique n'est pas exigée");
});
