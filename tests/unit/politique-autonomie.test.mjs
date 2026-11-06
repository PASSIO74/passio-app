// Politique d'automatisation (2026-11-06). Deux familles de verrous :
//   · la politique est VALIDÉE et `autoriser` échoue FERMÉ ;
//   · la politique DIT CE QUE LE CODE FAIT : chaque borne est comparée à la
//     constante, ou à la ligne de workflow, qui l'impose. Une politique qui
//     dériverait de l'exécutant serait un document, pas une politique.
// Mutations éprouvées à la main avant livraison : passer `retour_arriere_automatique`
// à autonome:true → ② rougit ; `autoriser` sans test de validité → ③ rougit ;
// porter `correctifLignesMax` à 80 → ⑥ rougit.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { POLITIQUE, validerPolitique, autoriser, resumerPolitique, CIRCUITS } from "../../supabase/functions/_shared/politique-autonomie.js";
import { REVEIL, RETOUR, modeRetour } from "../../supabase/functions/_shared/autonomie.js";
import { SEUILS_DELESTAGE } from "../../supabase/functions/_shared/reglages.js";
import { MAX_ENQUETES, RECIDIVE_SEUIL } from "../../scripts/sentinelle-detecter.mjs";

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

test("⑥ le correctif autonome : la politique dit ce que deploy.yml et la Sentinelle appliquent", () => {
  const y = fs.readFileSync(".github/workflows/deploy.yml", "utf8");
  const c = R.correctif_sentinelle;
  const borne = /if \[ "\$\{nb_fichiers\}" -gt (\d+) \] \|\| \[ "\$\{nb_lignes\}" -gt (\d+) \]; then/.exec(y);
  assert.ok(borne, "bornes ASTRA-34 introuvables dans deploy.yml");
  assert.equal(Number(borne[1]), c.limites.fichiersMax);
  assert.equal(Number(borne[2]), c.limites.lignesMax);
  assert.equal(POLITIQUE.limites.correctifFichiersMax, c.limites.fichiersMax);
  assert.equal(POLITIQUE.limites.correctifLignesMax, c.limites.lignesMax);
  const cas = /\n\s+(js\/\*\.js\|[^)]+)\) ;;/.exec(y);
  assert.ok(cas, "périmètre de la Sentinelle introuvable dans deploy.yml");
  assert.deepEqual(cas[1].split("|"), [...c.perimetre]);
  assert.equal(c.limites.enquetesMax, MAX_ENQUETES);
  assert.equal(POLITIQUE.limites.enquetesSimultanees, MAX_ENQUETES);
  assert.equal(c.limites.recidiveApres, RECIDIVE_SEUIL);
  assert.equal(POLITIQUE.limites.recidiveVersHumainApres, RECIDIVE_SEUIL);
});

test("⑦ la relance d'enquête et la file des messages : les bornes sont celles du code", () => {
  const w = fs.readFileSync(".github/workflows/sentinelle-autonome.yml", "utf8");
  const r = R.relance_enquete.limites;
  assert.match(w, new RegExp(`\\[ "\\$\\{age\\}" -gt ${r.attenteMin * 60} \\] && \\[ "\\$\\{prs\\}" -eq 0 \\]`), "relance après 20 min");
  assert.match(w, new RegExp(`\\[ "\\$\\{age\\}" -gt ${r.versHumainH * 3600} \\]`), "humain après 6 h");
  const app04 = fs.readFileSync("js/app-04-comments-shop.js", "utf8");
  assert.match(app04, new RegExp(`var MSG_ESSAIS_MAX = ${R.reprise_file_messages.limites.essaisMax};`));
  const idx = fs.readFileSync("supabase/functions/pilotage/index.ts", "utf8");
  assert.match(idx, /c === 404 \|\| c === 410\) morts\.push/, "purge des abonnements : 404/410 seulement");
});

test("⑧ chaque « appliquePar » désigne un fichier qui existe", () => {
  for (const [id, r] of Object.entries(R)) {
    const f = r.appliquePar.split(" ")[0];
    assert.ok(fs.existsSync(f), `${id} : ${f} n'existe pas`);
  }
});
