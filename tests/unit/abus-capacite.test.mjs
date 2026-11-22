
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { verifierPublicationLue } from "../../scripts/charge-realiste.mjs";
test("sans CDC : publication prouvée par lecture après écriture, refus et absence restent rouges", async () => {
  const appels = [];
  const r = await verifierPublicationLue("p", async () => appels.push("ecrire"),
    async () => { appels.push("lire"); return [{ id: "p" }]; });
  assert.deepEqual(appels, ["ecrire", "lire"]);
  assert.equal(r.preuve, "lecture_jwt_destinataire");
  await assert.rejects(verifierPublicationLue("p", async () => {}, async () => []), /PUBLICATION_NON_VISIBLE/);
  await assert.rejects(verifierPublicationLue("p", async () => { throw Error("REFUS"); },
    async () => { throw Error("LECTURE_INTERDITE"); }), /REFUS/);
});
const source = readFileSync(new URL("../../js/app-02-state-utils.js", import.meta.url), "utf8");
const debut = source.indexOf("const RECUL_ERREUR_MAX_MS");
const fin = source.indexOf("window.reculSurErreur = reculSurErreur;", debut);
const { reculSurErreur } = runInNewContext(source.slice(debut, fin) + ";({ reculSurErreur });");
test("panne : recul exponentiel borné, jitter aux deux extrêmes et entrées invalides", () => {
  assert.equal(reculSurErreur(15000, 1, 0), 24000);
  assert.equal(reculSurErreur(15000, 2, 1), 72000);
  assert.equal(reculSurErreur(60000, 20, 0), 480000);
  assert.equal(reculSurErreur(60000, 20, 1), 720000);
  assert.equal(reculSurErreur(NaN, NaN, NaN), 2000);
});
const app = readFileSync(new URL("../../js/app-08-ui-modals-tour.js", import.meta.url), "utf8");
const recherche = app.slice(app.indexOf("var RECHERCHE_PERSONNES_MIN"), app.indexOf("async function supaSearchUsers"));
const { recherchePersonnesAssezLongue } = runInNewContext(recherche + ";({recherchePersonnesAssezLongue});",
  { plierRecherche: s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() });
test("recherche : ni ponctuation ni terme court ne déclenche de lecture", () => {
  for (const q of ["", "éà", "a _ b", null]) assert.equal(recherchePersonnesAssezLongue(q), false);
  for (const q of ["Éric", "abc"]) assert.equal(recherchePersonnesAssezLongue(q), true);
});

const charge = readFileSync(new URL("../../scripts/charge-realiste.mjs", import.meta.url), "utf8");
test("le chemin réel sans CDC publie puis lit avec le JWT destinataire, sans armer de sonde", async () => {
  const debut = charge.indexOf("async function livraison(compte, taille, type)");
  const fin = charge.indexOf("const sonde = sondes.armer", debut);
  const appels = [], mesures = [], mutationsPosts = new Set();
  let visible = true;
  const livraison = runInNewContext(charge.slice(debut, fin) + "throw Error('SONDE_INTERDITE'); } livraison;", {
    o: { profilRealtime: "sans-cdc" }, prefix: "test", randomUUID: () => "id",
    comptes: [{ id: "a", jwt: "jwt-a" }, { id: "b", jwt: "jwt-b" }], partenaire: () => 1,
    performance: { now: () => 10 }, mutationsPosts, sauvegarder() {}, verifierPublicationLue,
    postsFixture: [{ passion_id: "p" }], attendreTableau: () => ({}), phase: "prevol", stage: null,
    mesures, motifSur: e => e.message,
    inserer: async (nom, table, row, options) => { appels.push(["ecriture", options.jwt]); },
    rest: async (nom, table, filtre, options) => {
      appels.push(["lecture", options.jwt]); return visible ? [{ id: "test_mesure_id" }] : [];
    }
  });
  const compte = { id: "a", index: 0, jwt: "jwt-a" };
  assert.equal((await livraison(compte, 2, "post")).preuve, "lecture_jwt_destinataire");
  assert.deepEqual(appels, [["ecriture", "jwt-a"], ["lecture", "jwt-b"]]);
  assert.equal(mesures[0].type, "lecture");
  assert.equal(mutationsPosts.has("test_mesure_id"), true);
  visible = false;
  await assert.rejects(livraison(compte, 2, "post"), /PUBLICATION_NON_VISIBLE/);
  assert.equal(mesures.at(-1).ok, false);
});
const bornes = source.slice(source.indexOf("const FILET_SEUL_CHEMIN_MAX_MS"), source.indexOf("window.filetBorneSeulChemin"));
const borner = runInNewContext(bornes + ";filetBorneSeulChemin;", { FILET_PAS_MIN: 60000 });
test("le seul chemin plafonne à trois minutes et conserve la cadence vive", () => {
  assert.equal(borner(60000, true), 60000);
  assert.equal(borner(300000, true), 180000);
  assert.equal(borner(300000, false), 300000);
  assert.equal(borner(NaN, true), 60000);
});
