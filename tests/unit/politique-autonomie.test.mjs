// Politique d'automatisation (2026-11-06). Deux familles de verrous :
//   · la politique est VALIDÉE et `autoriser` échoue FERMÉ ;
//   · la politique DIT CE QUE LE CODE FAIT : chaque borne est comparée à la
//     constante, ou à la ligne de la fonction déployée, qui l'impose. Une
//     politique qui dériverait de l'exécutant serait un document, pas une politique.
// ⚠️ Ce fichier tourne AVANT `supabase functions deploy` (edge-functions.yml) :
// il n'éprouve que ce que la fonction emporte (les modules de `_shared/` et
// `pilotage/index.ts`). Les bornes appliquées par d'AUTRES exécutants — deploy.yml,
// sentinelle-autonome.yml, scripts/sentinelle-detecter.mjs, le client — sont dans
// politique-autonomie-executants.test.mjs (séparé le 2026-11-07) : ici, elles
// auraient retenu le déploiement d'une fonction pour une dérive de ces fichiers.
// Mutations éprouvées à la main avant livraison : passer `retour_arriere_automatique`
// à autonome:true → ② rougit ; `autoriser` sans test de validité → ③ rougit ;
// porter `correctifLignesMax` à 80 → ⑥ rougit.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { POLITIQUE, validerPolitique, autoriser, resumerPolitique, CIRCUITS } from "../../supabase/functions/_shared/politique-autonomie.js";
import { REVEIL, RETOUR, modeRetour } from "../../supabase/functions/_shared/autonomie.js";
import { SEUILS_DELESTAGE } from "../../supabase/functions/_shared/reglages.js";

const R = POLITIQUE.runbooks;
const avec = (patch) => ({ ...POLITIQUE, ...patch });
const avecRb = (id, patch) => avec({ runbooks: { ...R, [id]: { ...R[id], ...patch } } });

test("① la politique livrée est valide, versionnée, appliquée", () => {
  assert.deepEqual(validerPolitique(POLITIQUE), []);
  assert.equal(POLITIQUE.version, 1);
  assert.equal(POLITIQUE.mode, "applique");
  assert.deepEqual(Object.keys(CIRCUITS), ["A", "B", "C"]);
  const s = resumerPolitique();
  assert.equal(s.valide, true);
  assert.ok(s.circuits.C.length >= 6 && s.circuits.C.every((x) => !x.autonome), "les gestes sensibles sont listés, et aucun n'est autonome");
});

test("② un geste sensible ne peut pas devenir autonome ; un geste autonome est borné et dit qui l'impose", () => {
  assert.ok(validerPolitique(avecRb("retour_arriere_automatique", { autonome: true })).some((e) => /circuit C.*jamais autonome/.test(e)));
  assert.ok(validerPolitique(avecRb("migration_base", { autonome: true })).length);
  assert.ok(validerPolitique(avecRb("delestage_auto", { limites: {} })).some((e) => /borné/.test(e)));
  assert.ok(validerPolitique(avecRb("delestage_auto", { appliquePar: "" })).some((e) => /appliquePar/.test(e)));
  assert.ok(validerPolitique(avecRb("delestage_auto", { verification: "" })).some((e) => /verification/.test(e)));
  assert.ok(validerPolitique(avec({ mode: "auto" })).some((e) => /mode/.test(e)));
  assert.ok(validerPolitique(avec({ observation: { ...POLITIQUE.observation, inconnuEstSain: true } })).some((e) => /inconnu/.test(e)));
  assert.ok(validerPolitique(avec({ limites: { ...POLITIQUE.limites, correctifLignesMax: -1 } })).length);
  assert.deepEqual(validerPolitique(null), ["politique absente"]);
});

test("③ `autoriser` échoue FERMÉ : invalide, hors catalogue, sensible, observation, pause", () => {
  assert.deepEqual(autoriser(POLITIQUE, "delestage_auto"), { ok: true, raison: "autorise", circuit: "A" });
  assert.equal(autoriser(avec({ version: 0 }), "delestage_auto").raison, "politique_invalide");
  assert.equal(autoriser(undefined, "delestage_auto").raison, "politique_invalide");
  assert.equal(autoriser(POLITIQUE, "inventer_un_geste").raison, "hors_catalogue");
  assert.equal(autoriser(POLITIQUE, "__proto__").raison, "hors_catalogue");
  assert.equal(autoriser(POLITIQUE, "retour_arriere_automatique").raison, "sensible");
  assert.equal(autoriser(POLITIQUE, "modification_politique").raison, "sensible");
  assert.equal(autoriser(avec({ mode: "observation" }), "delestage_auto").raison, "observation");
  assert.equal(autoriser(POLITIQUE, "reveil_sentinelle", { pause: true }).raison, "pause");
  assert.equal(autoriser(POLITIQUE, "delestage_auto", { pause: true }).ok, true, "une protection n'est pas une réparation : la pause ne l'arrête pas");
});

test("④ le réveil et le retour arrière : la politique dit ce qu'autonomie.js applique", () => {
  const rv = R.reveil_sentinelle.limites;
  assert.equal(rv.comptesMin, REVEIL.comptesMin);
  assert.equal(rv.fenetreMin * 60e3, REVEIL.fenetreMs);
  assert.equal(rv.parJour, REVEIL.parJour);
  assert.equal(rv.runRecentMin * 60e3, REVEIL.runRecentMs);
  assert.equal(rv.enquetesMax, REVEIL.enquetesMax);
  const idx = fs.readFileSync("supabase/functions/pilotage/index.ts", "utf8");
  assert.match(idx, new RegExp(`"sentinelle-reveil", \\{ parMinute: 1, parHeure: ${rv.parHeure} \\}`), "plafond horaire du réveil");
  const rt = R.proposition_retour.limites;
  assert.equal(rt.comptesMin, RETOUR.comptesMin);
  assert.equal(rt.apresDeploiementMaxMin * 60e3, RETOUR.apresDeploiementMaxMs);
  assert.equal(rt.ancienneteMinJours * 864e5, RETOUR.ancienneteMinMs);
  assert.equal(rt.recuperationH * 3600e3, RETOUR.recuperationMs);
  assert.equal(modeRetour("jeton"), "proposer", "aucun mode automatique n'existe");
  assert.equal(modeRetour(""), "inactif");
  assert.equal(R.retour_arriere_automatique.autonome, false);
});

test("⑤ le délestage : la politique dit ce que reglages.js applique", () => {
  const d = R.delestage_auto.limites;
  assert.equal(d.pctMonter1, SEUILS_DELESTAGE.monter[1].pctConnexions);
  assert.equal(d.pctMonter2, SEUILS_DELESTAGE.monter[2].pctConnexions);
  assert.equal(d.comptes5xxMonter1, SEUILS_DELESTAGE.monter[1].comptes5xx15);
  assert.equal(d.comptes5xxMonter2, SEUILS_DELESTAGE.monter[2].comptes5xx15);
  assert.equal(d.tenueMin * 60e3, SEUILS_DELESTAGE.tenueMs);
});

// ⑥ ⑦ ⑧ : la part du module. Ce que deploy.yml, sentinelle-autonome.yml, la
// Sentinelle et le client appliquent, et l'existence de chaque « appliquePar » :
// politique-autonomie-executants.test.mjs.
test("⑥ le correctif autonome : les limites générales répètent celles du runbook", () => {
  const c = R.correctif_sentinelle;
  assert.equal(POLITIQUE.limites.correctifFichiersMax, c.limites.fichiersMax);
  assert.equal(POLITIQUE.limites.correctifLignesMax, c.limites.lignesMax);
  assert.equal(POLITIQUE.limites.enquetesSimultanees, c.limites.enquetesMax);
  assert.equal(POLITIQUE.limites.recidiveVersHumainApres, c.limites.recidiveApres);
});

test("⑦ la purge des abonnements : la fonction déployée n'oublie un abonnement que sur 404/410", () => {
  const idx = fs.readFileSync("supabase/functions/pilotage/index.ts", "utf8");
  assert.match(idx, /c === 404 \|\| c === 410\) morts\.push/, "purge des abonnements : 404/410 seulement");
});

// L'essai des alertes (2026-11-07) : ses bornes déclarées SONT celles du code.
import { ESSAI_INTERVALLE_MS, FENETRE_ESSAI } from "../../supabase/functions/_shared/reception.js";
test("⑨ essai des alertes : intervalle et fenêtre de jour déclarés = ceux que le code applique ; un geste autonome de circuit A, appliqué par la fonction", () => {
  const r = POLITIQUE.runbooks.essai_alertes;
  assert.ok(r, "au catalogue");
  assert.equal(r.circuit, "A");
  assert.equal(r.autonome, true);
  assert.equal(r.limites.intervalleJours * 864e5, ESSAI_INTERVALLE_MS);
  assert.equal(r.limites.heureDebut, FENETRE_ESSAI.debut);
  assert.equal(r.limites.heureFin, FENETRE_ESSAI.fin);
  assert.match(r.appliquePar, /essayerAlertes/);
  assert.equal(autoriser(POLITIQUE, "essai_alertes").ok, true);
});
