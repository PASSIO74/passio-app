// Politique d'automatisation — LES AUTRES EXÉCUTANTS (séparé de
// politique-autonomie.test.mjs le 2026-11-07).
//
// La politique (`supabase/functions/_shared/politique-autonomie.js`) décrit aussi
// des gestes que la fonction `pilotage` n'exécute pas : l'auto-fusion bornée de
// deploy.yml, la relance d'enquête de sentinelle-autonome.yml, le plafond de la
// Sentinelle (scripts/sentinelle-detecter.mjs), la file des messages du client
// (js/app-04). Ce fichier vérifie que ces exécutants appliquent les bornes que la
// politique déclare, et que chaque « appliquePar » désigne un fichier qui existe.
//
// ⚠️ POURQUOI UN FICHIER À PART. politique-autonomie.test.mjs tourne AVANT
// `supabase functions deploy` (edge-functions.yml) : il éprouve le module que la
// fonction emporte. Ces verrous-ci éprouvent la forme d'AUTRES fichiers, que le
// déploiement d'une fonction ne change pas. Dans la même suite, ils auraient lié
// le déploiement des fonctions à deploy.yml, à sentinelle-autonome.yml et au
// client : un correctif de fonction retenu pour une dérive qu'il ne touche pas.
// Ils tournent dans deploy.yml (tests/unit/*.test.mjs, à chaque PR et sur main)
// et dans npm run verif ; l'écart est déclaré dans edge-functions-verrous.test.mjs.
// Mutation éprouvée : porter la borne ASTRA-34 de deploy.yml de 60 à 80 lignes
// → ⑥ rougit.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { POLITIQUE } from "../../supabase/functions/_shared/politique-autonomie.js";
import { MAX_ENQUETES, RECIDIVE_SEUIL } from "../../scripts/sentinelle-detecter.mjs";

const R = POLITIQUE.runbooks;

test("⑥ le correctif autonome : la politique dit ce que deploy.yml et la Sentinelle appliquent", () => {
  const y = fs.readFileSync(".github/workflows/deploy.yml", "utf8");
  const c = R.correctif_sentinelle;
  const borne = /if \[ "\$\{nb_fichiers\}" -gt (\d+) \] \|\| \[ "\$\{nb_lignes\}" -gt (\d+) \]; then/.exec(y);
  assert.ok(borne, "bornes ASTRA-34 introuvables dans deploy.yml");
  assert.equal(Number(borne[1]), c.limites.fichiersMax);
  assert.equal(Number(borne[2]), c.limites.lignesMax);
  const cas = /\n\s+(js\/\*\.js\|[^)]+)\) ;;/.exec(y);
  assert.ok(cas, "périmètre de la Sentinelle introuvable dans deploy.yml");
  assert.deepEqual(cas[1].split("|"), [...c.perimetre]);
  assert.equal(c.limites.enquetesMax, MAX_ENQUETES);
  assert.equal(POLITIQUE.limites.enquetesSimultanees, MAX_ENQUETES);
  assert.equal(c.limites.recidiveApres, RECIDIVE_SEUIL);
  assert.equal(POLITIQUE.limites.recidiveVersHumainApres, RECIDIVE_SEUIL);
});

test("⑦ la relance d'enquête et la file des messages : les bornes sont celles de sentinelle-autonome.yml et du client", () => {
  const w = fs.readFileSync(".github/workflows/sentinelle-autonome.yml", "utf8");
  const r = R.relance_enquete.limites;
  assert.match(w, new RegExp(`\\[ "\\$\\{age\\}" -gt ${r.attenteMin * 60} \\] && \\[ "\\$\\{prs\\}" -eq 0 \\]`), "relance après 20 min");
  assert.match(w, new RegExp(`\\[ "\\$\\{age\\}" -gt ${r.versHumainH * 3600} \\]`), "humain après 6 h");
  const app04 = fs.readFileSync("js/app-04-comments-shop.js", "utf8");
  assert.match(app04, new RegExp(`var MSG_ESSAIS_MAX = ${R.reprise_file_messages.limites.essaisMax};`));
});

test("⑧ chaque « appliquePar » désigne un fichier qui existe", () => {
  for (const [id, r] of Object.entries(R)) {
    const f = r.appliquePar.split(" ")[0];
    assert.ok(fs.existsSync(f), `${id} : ${f} n'existe pas`);
  }
});
