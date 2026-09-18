// ═══════════════════════════════════════════════════════════════════════════
// ENREGISTREUR DE VOL DES RELEASES — la chronologie « quel code tourne où ».
//
// Il écrit un instantané au démarrage puis toutes les minutes. Trois invariants
// portent tout le reste :
//
//   1. DÉDUPLICATION. Tant que rien ne change, l'instantané périodique doit
//      seulement rafraîchir `lastSeenAt`, pas empiler une ligne de plus. Sans
//      ça, un serveur laissé allumé une nuit écrit 480 lignes identiques : le
//      fichier enfle et l'historique — dont le seul intérêt est de montrer les
//      CHANGEMENTS — devient illisible.
//   2. AUCUN FAUX VERT. `releaseHealth` doit nommer ce qui manque. Une release
//      dont on ignore ce que sert le site public n'est pas « LIVE ».
//   3. HONNÊTE SUR LE POSTE (2026-09-18). Le poste n'a pas de variables de
//      build Netlify (PASSIO_APP_VERSION, DEPLOY_ID) : les exiger rendait le
//      domaine NOT_CONFIGURED à vie, le NO_GO structurel et un risque P1
//      factice. La preuve sur le poste = release.json public comparé au
//      dernier deploy main réussi lu sur GitHub — jamais au HEAD local, qui
//      est une branche de travail.
//
// Mutations éprouvées : reprendre COMMIT_REF / le HEAD local comme attente sur le poste
// rougit « jamais le HEAD local » ; rendre LIVE sans deploy connu rougit
// « sans deploy » ; ignorer publicAligned rougit « attente périmée ».
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
process.env.PASSIO_PUBLIC_URL = "";          // le poste sans URL : NOT_CONFIGURED nommé
// Une variable de build qui traînerait dans l'environnement du poste ne doit pas
// non plus servir d'attente : seul le deploy main lu sur GitHub compte.
process.env.COMMIT_REF = "abcdef1234567890abcdef1234567890abcdef12";
delete process.env.PASSIO_APP_VERSION;
delete process.env.PASSIO_DB_VERSION;
delete process.env.DEPLOY_ID;
delete process.env.NETLIFY;
delete process.env.DEPLOY_PROVIDER;
process.on("exit", () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

const { recordRelease, releaseHistory, releaseHealth, releaseSnapshot, publicReleaseExpectations, verdictReleasePoste } =
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

test("santé sur le poste sans URL publique : NOT_CONFIGURED nommé (PASSIO_PUBLIC_URL), jamais LIVE, jamais « frontend version »", () => {
  const r = releaseHealth();
  assert.notEqual(r.state, "LIVE");
  assert.equal(r.state, "NOT_CONFIGURED");
  assert.deepEqual(r.missing, ["PASSIO_PUBLIC_URL"], "ce qui manque est la variable à poser, pas des variables de build Netlify");
  assert.match(r.detail, /PASSIO_PUBLIC_URL/);
  assert.equal(r.publicRequired, false, "hors production, la preuve publique n'est pas exigée");
  assert.equal(r.source, "github_deploy+release_json");
});

test("sur le poste, l'attente publique n'est JAMAIS le HEAD local : sans deploy main connu, aucune attente", () => {
  const e = publicReleaseExpectations();
  assert.equal(e.expectedCommit, null, "ni COMMIT_REF ni le checkout du poste (branche de travail) ne prouvent quoi que ce soit sur le site public");
});

test("verdict pur : LIVE si release.json = dernier deploy main ; MISMATCH → DEGRADED (« déploiement en cours » si un run tourne) ; sans deploy → UNKNOWN", () => {
  const deploy = { headSha: "abcdef1234567890abcdef1234567890abcdef12", quand: "2026-09-18T10:00:00Z", enCours: false };
  const live = verdictReleasePoste({ publicConfigured: true, publicEvidence: { state: "LIVE" }, publicAligned: true, deploy });
  assert.equal(live.state, "LIVE"); assert.equal(live.verdict, "LIVE"); assert.match(live.detail, /abcdef12/);
  const mis = verdictReleasePoste({ publicConfigured: true, publicEvidence: { state: "MISMATCH", error: "commit" }, publicAligned: true, deploy });
  assert.equal(mis.state, "DEGRADED"); assert.equal(mis.verdict, "MISMATCH"); assert.match(mis.detail, /autre commit/);
  const enCours = verdictReleasePoste({ publicConfigured: true, publicEvidence: { state: "MISMATCH" }, publicAligned: true, deploy: { ...deploy, enCours: true } });
  assert.match(enCours.detail, /déploiement en cours/);
  const sans = verdictReleasePoste({ publicConfigured: true, publicEvidence: { state: "LIVE" }, publicAligned: true, deploy: null });
  assert.equal(sans.state, "UNKNOWN", "sans deploy : un release.json valide ne prouve rien tout seul");
  const perime = verdictReleasePoste({ publicConfigured: true, publicEvidence: { state: "LIVE" }, publicAligned: false, deploy });
  assert.equal(perime.state, "UNKNOWN", "attente périmée : une preuve calculée pour une autre attente n'est pas LIVE");
  const indispo = verdictReleasePoste({ publicConfigured: true, publicEvidence: { state: "UNAVAILABLE", error: "timeout" }, publicAligned: true, deploy });
  assert.equal(indispo.state, "UNKNOWN"); assert.match(indispo.detail, /timeout/);
});
