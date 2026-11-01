// Croissance, coût et pré-tri (2026-11-01) — la logique pure de l'onglet
// Croissance (`_shared/croissance.js`) et ce que la capacité ajoute à « À faire »
// (`_shared/pilotage.js`). Les fichiers éprouvés sont CEUX que Deno déploie.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { croissance, retentionCohorte, parValeur, libelleSource } from "../../supabase/functions/_shared/croissance.js";
import { jauges, coutMensuel, bandePassanteEstimee, OCTETS_PAR_VERSION, VERSIONS_PAR_MOIS, aFaire, PLAFONDS } from "../../supabase/functions/_shared/pilotage.js";

const J = (s) => Date.parse(s + "T12:00:00Z");

test("① rétention : une fenêtre pas encore passée pour TOUS les comptes n'a pas de taux", () => {
  const c = { semaine: "2026-10-26", taille: 10, j1: 4, j7: 2, j30: 0, dernier: "2026-10-30" };
  // Le 31/10 à midi : le lendemain du plus jeune n'est pas fini.
  assert.deepEqual(retentionCohorte(c, J("2026-10-31")), { semaine: "2026-10-26", taille: 10, j1: null, j7: null, j30: null });
  // Le 01/11 : J1 mûr (fin du 31/10 passée), J7 non.
  const r = retentionCohorte(c, J("2026-11-01"));
  assert.equal(r.j1, 40); assert.equal(r.j7, null); assert.equal(r.j30, null);
  // J7 mûr après la fin de dernier + 13, J30 après dernier + 36.
  assert.equal(retentionCohorte(c, J("2026-11-12")).j7, null, "dernier + 13 (12/11) pas fini");
  assert.equal(retentionCohorte(c, J("2026-11-13")).j7, 20);
  assert.equal(retentionCohorte(c, J("2026-12-06")).j30, 0);
  assert.equal(retentionCohorte({ ...c, taille: 0 }, J("2027-01-01")).j1, null, "cohorte vide : pas de 0 %");
});

test("② sources : conversion par source, tri par inscriptions, libellés", () => {
  const cumul = [
    { mesure: "visite", valeur: "instagram", n: 200 }, { mesure: "visite", valeur: "direct", n: 50 },
    { mesure: "inscription", valeur: "instagram", n: 20 }, { mesure: "inscription", valeur: "lien", n: 5 },
    { mesure: "inscription_lien", valeur: "google", n: 3 }, { mesure: "inscription_lien", valeur: "email", n: 2 },
    { mesure: "lien_cree", valeur: "post", n: 30 }, { mesure: "lien_partage", valeur: "whatsapp", n: 12 },
    { mesure: "lien_ouvert", valeur: "external", n: 9 }, { mesure: "campagne", valeur: "lancement", n: 7 }, { mesure: "campagne", valeur: "?", n: 1 },
  ];
  const c = croissance({ jours: 30, cumul, actifs: [], cohortes: [] }, J("2026-11-01"));
  assert.equal(c.visites, 250); assert.equal(c.inscriptions, 25); assert.equal(c.conversion, 10);
  assert.deepEqual(c.sources.map((s) => s.source), ["instagram", "lien", "direct"]);
  assert.equal(c.sources[0].conversion, 10);
  assert.equal(c.sources[1].conversion, null, "aucune visite connue : pas de taux inventé");
  assert.equal(c.sources[0].libelle, "Instagram");
  assert.deepEqual(c.liens, { crees: 30, partages: 12, ouverts: 9, inscriptions: 5, canaux: [{ valeur: "whatsapp", n: 12 }] });
  assert.equal(c.viralite, 20, "5 inscriptions par lien sur 25");
  assert.deepEqual(c.campagnes, [{ valeur: "lancement", n: 7 }], "« ? » n'est pas une campagne");
  assert.equal(libelleSource("inconnue"), "inconnue");
});

test("③ actifs : hier et la moyenne des 7 jours pleins (aujourd'hui exclu)", () => {
  const actifs = [
    { jour: "2026-10-24", n: 100 }, { jour: "2026-10-25", n: 10 }, { jour: "2026-10-26", n: 10 }, { jour: "2026-10-27", n: 10 },
    { jour: "2026-10-28", n: 10 }, { jour: "2026-10-29", n: 10 }, { jour: "2026-10-30", n: 10 }, { jour: "2026-10-31", n: 17 }, { jour: "2026-11-01", n: 999 },
  ];
  const c = croissance({ cumul: [], actifs, cohortes: [] }, J("2026-11-01"));
  assert.equal(c.actifsHier, 17);
  assert.equal(c.moyenne7, 11, "25/10 → 31/10 : (6×10 + 17) / 7");
  assert.equal(croissance(null), null);
});

test("④ parValeur additionne une même valeur sur plusieurs jours", () => {
  assert.deepEqual(parValeur([{ mesure: "visite", valeur: "x", n: 2 }, { mesure: "visite", valeur: "x", n: 3 }, { mesure: "autre", valeur: "x", n: 9 }], "visite"), [{ valeur: "x", n: 5 }]);
});

test("⑤ jauges : chaque jauge porte son geste et son prix ; la bande passante est estimée", () => {
  const js = jauges({ connexions: 400, emails: 10, base: null, stockage: 0, telemetrie: 0 });
  const co = js.find((j) => j.cle === "connexions");
  assert.equal(co.couleur, "orange"); assert.match(co.geste, /spend cap/); assert.equal(co.prix, PLAFONDS.connexions.prix);
  assert.equal(js.find((j) => j.cle === "base").geste, PLAFONDS.base.geste, "même non mesurée, le geste est connu");
  assert.equal(js.some((j) => j.cle === "bandePassante"), false, "sans appareils lus, pas de jauge inventée");
  assert.equal(bandePassanteEstimee(1000), Math.round(1000 * VERSIONS_PAR_MOIS * OCTETS_PAR_VERSION));
  assert.equal(bandePassanteEstimee(null), null); assert.equal(bandePassanteEstimee(-1), null);
  // 3 000 appareils/jour × 40 versions × 0,75 Mo ≈ 88 Go : orange sur 100 Go.
  const bp = jauges({ bandePassante: bandePassanteEstimee(3000) }).find((j) => j.cle === "bandePassante");
  assert.equal(bp.couleur, "orange"); assert.equal(bp.estimation, true);
});

test("⑥ coût : forfaits payés + gestes des jauges orange ou rouges seulement", () => {
  const c = coutMensuel([
    { libelle: "A", couleur: "orange", prix: 10, geste: "g" }, { libelle: "B", couleur: "rouge", prix: 15 },
    { libelle: "C", couleur: "vert", prix: 99 }, { libelle: "D", couleur: "orange", prix: 0 },
  ]);
  assert.equal(c.actuel, 25); assert.equal(c.aPrevoir, 25);
  assert.deepEqual(c.lignes.filter((l) => l.aPrevoir).map((l) => l.libelle), ["A", "B"]);
  assert.equal(coutMensuel(null).aPrevoir, 0);
});

test("⑦ « À faire » : une jauge orange dit le geste et le prix ; une publication masquée attend une décision", () => {
  const d = {
    capacite: { jauges: jauges({ emails: 250 }) },
    signalements: { liste: [], masques: [{ id: "p_1", signaleurs: 3, le: "2026-11-01T10:00:00Z", extrait: "texte de l'auteur" }] },
  };
  const l = aFaire(d, J("2026-11-01"));
  const cap = l.find((x) => x.id === "capacite:emails");
  assert.match(cap.detail, /Brevo/); assert.match(cap.detail, /€\/mois/);
  const m = l.find((x) => x.id === "masque:p_1");
  assert.equal(m.prio, 1);
  assert.deepEqual(m.gestes.map((g) => g.corps), [{ action: "masquage", id: "p_1", decision: "retablir" }, { action: "masquage", id: "p_1", decision: "garder" }]);
  assert.match(m.detail, /Rien n'est supprimé/);
});

test("⑧ la fonction déployée lit la croissance et décide du masquage", () => {
  const src = fs.readFileSync("supabase/functions/pilotage/index.ts", "utf8");
  assert.match(src, /croissance: lireCroissance\(admin\)/);
  assert.match(src, /case "masquage": return deciderMasquage/);
  assert.match(src, /\.is\("decision", null\)/, "une décision ne s'écrase jamais");
  assert.match(src, /estObjetAbsent\(error\)\) return \{ absente: true/, "migration pas appliquée : « Pas encore allumée », jamais une panne");
});

test("⑨ les migrations : pré-tri borné (3 anciens, restrictive, jamais de suppression), paliers après agrégation", () => {
  const mig = fs.readFileSync("migrations/migration_moderation_pretri_2026-11-01.sql", "utf8");
  assert.match(mig, /interval '7 days'/, "ancienneté des signaleurs");
  assert.match(mig, /n >= 3/);
  assert.match(mig, /as restrictive for select/);
  assert.match(mig, /where public\.contenus_masques\.decision is null/, "une décision du pilote n'est jamais écrasée");
  assert.doesNotMatch(mig, /delete from public\.posts/i, "le pré-tri ne supprime jamais");
  const cr = fs.readFileSync("migrations/migration_croissance_2026-11-01.sql", "utf8");
  const corps = cr.slice(cr.indexOf("function public.purge_telemetrie_paliers"));
  assert.ok(corps.indexOf("perform public.agreger_croissance") < corps.indexOf("delete from public.telemetry_events"), "agréger AVANT de purger");
  assert.match(cr, /references auth\.users \(id\) on delete cascade/, "l'activité part avec le compte");
  for (const f of ["pilotage_croissance(integer)", "purge_telemetrie_paliers()", "agreger_croissance(date)"]) {
    assert.ok(cr.includes("revoke execute on function public." + f + " from public, anon, authenticated"), f + " fermée aux clients");
  }
});
