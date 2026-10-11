// Réglages distants (2026-10-11) — la logique pure de `supabase/functions/_shared/reglages.js`
// (le fichier que Deno déploie) et sa copie client `js/reglages-distants.js`.
// Chaque verrou nomme la mutation qui le fait rougir.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CLES_REGLAGES, FACTEURS_DELESTAGE, COUPURES_AUTORISEES, BANDEAU_MAX,
  normaliserReglage, normaliserMotif, decideDelestage, SEUILS_DELESTAGE, resumerReglages,
} from "../../supabase/functions/_shared/reglages.js";

const CLIENT = fs.readFileSync("js/reglages-distants.js", "utf8");
const T0 = Date.parse("2026-10-11T12:00:00Z");
const ilYa = (min) => new Date(T0 - min * 60e3).toISOString();

test("① délestage : 0, 1 ou 2 — rien d'autre (mutation : accepter 3 ou \"1\")", () => {
  for (const n of [0, 1, 2]) assert.deepEqual(normaliserReglage("delestage", { niveau: n }), { valeur: { niveau: n } });
  for (const n of [3, -1, 1.5, "1", null, undefined]) assert.ok(normaliserReglage("delestage", { niveau: n }).erreur, String(n));
  assert.ok(normaliserReglage("inconnu", { niveau: 1 }).erreur, "clé hors liste");
  assert.ok(normaliserReglage("delestage", null).erreur);
  assert.ok(normaliserReglage("delestage", [1]).erreur, "un tableau n'est pas un objet");
});

test("② coupures : liste BLANCHE seulement, jamais une clé de données (mutation : filtrer par motif passio_*)", () => {
  assert.deepEqual(normaliserReglage("coupures", { cles: ["passio_ui_8", "passio_invitations_v1", "passio_ui_8"] }),
    { valeur: { cles: ["passio_invitations_v1", "passio_ui_8"] } }, "dédoublonné et trié");
  for (const k of ["passio_mvp_state_v1", "passio_conversations_v1", "passio_telemetry", "passio_realtime_v3", "passio_gate_actif", "__proto__"]) {
    assert.ok(normaliserReglage("coupures", { cles: [k] }).erreur, k + " ne doit JAMAIS être posable");
  }
  assert.deepEqual(normaliserReglage("coupures", { cles: [] }), { valeur: { cles: [] } }, "lever toutes les coupures");
  assert.ok(normaliserReglage("coupures", { cles: "passio_ui_8" }).erreur);
});

test("③ chaque coupure autorisée est un vrai kill switch du dépôt, lu comme \"0\" (mutation : une clé inventée)", () => {
  const fichiers = fs.readdirSync("js").filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync("js/" + f, "utf8"));
  for (const k of COUPURES_AUTORISEES) {
    const lecteurs = fichiers.filter((src) => src.includes(`"${k}"`) || src.includes(`'${k}'`));
    assert.ok(lecteurs.length, `${k} n'est lu par aucun fichier de js/`);
    assert.ok(lecteurs.some((src) => /===?\s*["']0["']/.test(src)), `${k} : aucun lecteur ne compare à "0"`);
  }
});

test("④ le client porte la MÊME liste blanche et les MÊMES facteurs (mutation : diverger d'une clé)", () => {
  const m = CLIENT.match(/COUPURES_AUTORISEES\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(m, "liste blanche introuvable dans js/reglages-distants.js");
  const client = [...m[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]).sort();
  assert.deepEqual(client, [...COUPURES_AUTORISEES].sort());
  const f = CLIENT.match(/FACTEURS_DELESTAGE\s*=\s*\{([^}]*)\}/);
  assert.ok(f, "facteurs introuvables dans le client");
  const facteurs = Object.fromEntries([...f[1].matchAll(/(\d)\s*:\s*(\d+)/g)].map((x) => [x[1], Number(x[2])]));
  assert.deepEqual(facteurs, Object.fromEntries(Object.entries(FACTEURS_DELESTAGE).map(([k, v]) => [k, v])));
  assert.match(CLIENT, new RegExp(`BANDEAU_MAX\\s*=\\s*${BANDEAU_MAX}\\b`));
});

test("⑤ bandeau : texte nettoyé, borné, niveau info|alerte (mutation : laisser passer un retour à la ligne ou un RLO)", () => {
  assert.deepEqual(normaliserReglage("bandeau", { texte: "  Inscriptions\npar e-mail‮ saturées  ", niveau: "alerte" }),
    { valeur: { texte: "Inscriptions par e-mail saturées", niveau: "alerte" } });
  assert.deepEqual(normaliserReglage("bandeau", { texte: "ok", niveau: "rouge" }), { valeur: { texte: "ok", niveau: "info" } });
  assert.ok(normaliserReglage("bandeau", { texte: "   " }).erreur, "vide");
  assert.ok(normaliserReglage("bandeau", { texte: "x".repeat(BANDEAU_MAX + 1) }).erreur, "trop long");
  assert.ok(normaliserReglage("bandeau", { texte: 42 }).erreur);
  assert.equal(normaliserMotif("  a\u0000b  "), "a b");
  assert.equal(normaliserMotif(""), null);
  assert.equal(normaliserMotif("y".repeat(500)).length, 300);
});

test("⑥ délestage auto : on MONTE tout de suite, au bon cran (mutation : seuil de montée 1 inversé avec 2)", () => {
  assert.deepEqual(decideDelestage(null, { pctConnexions: 50, comptes5xx15: 0 }, T0), { niveau: 0, changer: false, motif: null });
  const d1 = decideDelestage(null, { pctConnexions: 82, comptes5xx15: 0 }, T0);
  assert.equal(d1.niveau, 1); assert.equal(d1.changer, true); assert.match(d1.motif, /82 %/);
  const d2 = decideDelestage({ niveau: 1, pose_par: "veille", maj: ilYa(1) }, { pctConnexions: 96, comptes5xx15: 0 }, T0);
  assert.equal(d2.niveau, 2); assert.equal(d2.changer, true);
  const p = decideDelestage(null, { pctConnexions: null, comptes5xx15: 12 }, T0);
  assert.equal(p.niveau, 1, "des pannes serveur chez assez de comptes suffisent"); assert.match(p.motif, /12 comptes touchés/);
  assert.equal(decideDelestage(null, { pctConnexions: 0, comptes5xx15: 45 }, T0).niveau, 2);
  assert.equal(decideDelestage(null, { pctConnexions: 0, comptes5xx15: 9 }, T0).changer, false, "9 comptes : sous le seuil");
});

test("⑦ on ne descend qu'APRÈS 30 min, d'UN cran, sous le seuil BAS (mutation : retirer la tenue ou l'hystérésis)", () => {
  const n2 = { niveau: 2, pose_par: "veille", maj: ilYa(10) };
  assert.equal(decideDelestage(n2, { pctConnexions: 10, comptes5xx15: 0 }, T0).changer, false, "tenue de 30 min");
  const n2v = { ...n2, maj: ilYa(31) };
  const d = decideDelestage(n2v, { pctConnexions: 10, comptes5xx15: 0 }, T0);
  assert.deepEqual([d.niveau, d.changer], [1, true], "un cran, pas deux");
  const n1 = { niveau: 1, pose_par: "veille", maj: ilYa(45) };
  assert.equal(decideDelestage(n1, { pctConnexions: 75, comptes5xx15: 0 }, T0).changer, false, "75 % : sous la montée (80) mais au-dessus de la descente (70)");
  const fin = decideDelestage(n1, { pctConnexions: 60, comptes5xx15: 2 }, T0);
  assert.deepEqual([fin.niveau, fin.changer], [0, true]); assert.match(fin.motif, /Fin du délestage/);
  assert.ok(SEUILS_DELESTAGE.descendre[1].pctConnexions < SEUILS_DELESTAGE.monter[1].pctConnexions, "hystérésis");
  assert.ok(SEUILS_DELESTAGE.descendre[2].pctConnexions < SEUILS_DELESTAGE.monter[2].pctConnexions, "hystérésis");
});

test("⑧ la main du pilote gagne, et l'aveugle ne lève rien (mutation : ignorer pose_par, ou descendre sans mesure)", () => {
  const pilote = { niveau: 2, pose_par: "pilote", maj: ilYa(600) };
  assert.equal(decideDelestage(pilote, { pctConnexions: 0, comptes5xx15: 0 }, T0).changer, false, "jamais abaissé par la machine");
  assert.equal(decideDelestage({ niveau: 0, pose_par: "pilote", maj: ilYa(1) }, { pctConnexions: 99, comptes5xx15: 500 }, T0).changer, false, "ni monté");
  const veille = { niveau: 2, pose_par: "veille", maj: ilYa(600) };
  assert.equal(decideDelestage(veille, { pctConnexions: null, comptes5xx15: null }, T0).changer, false, "toutes mesures absentes : on garde");
  assert.equal(decideDelestage(veille, {}, T0).changer, false);
  assert.equal(decideDelestage({ niveau: 1, pose_par: "veille", maj: "pas une date" }, { pctConnexions: 0, comptes5xx15: 0 }, T0).changer, false, "date illisible = pas de tenue prouvée");
});

test("⑨ resumerReglages : une ligne invalide en base ne fabrique pas un réglage", () => {
  const r = resumerReglages([
    { cle: "delestage", valeur: { niveau: 2 }, pose_par: "veille", maj: "2026-10-11T10:00:00Z", motif: "x" },
    { cle: "coupures", valeur: { cles: ["passio_ui_8", "passio_mvp_state_v1"] }, maj: null },
    { cle: "bandeau", valeur: { texte: "Maintenance", niveau: "info" }, maj: "2026-10-11T10:00:00Z" },
    { cle: "autre", valeur: {} },
  ]);
  assert.equal(r.delestage.niveau, 2);
  assert.deepEqual(r.coupures.cles, [], "une clé hors liste invalide toute la ligne : rien n'est posé");
  assert.equal(r.bandeau.texte, "Maintenance");
  assert.deepEqual(resumerReglages(null).delestage.niveau, 0);
  assert.deepEqual(CLES_REGLAGES, ["delestage", "coupures", "bandeau"]);
});

test("⑩ le module est chargé AVANT la télémétrie et toute l'app (mutation : le déplacer après app-01)", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]);
  const i = scripts.indexOf("js/reglages-distants.js");
  assert.ok(i > 0, "js/reglages-distants.js absent d'index.html");
  assert.deepEqual(scripts.slice(0, i), ["js/access-gate.js", "js/legal-textes.js", "js/platform.js"],
    "seuls le rideau, les textes légaux et la plateforme le précèdent");
  assert.ok(i < scripts.indexOf("js/telemetry.js"));
  assert.ok(i < scripts.indexOf("js/app-01-diag-seed.js"));
});

test("⑪ chaque point d'armement des filets passe par delaiDeleste (mutation : en oublier un)", () => {
  const src = (f) => fs.readFileSync("js/" + f, "utf8");
  assert.match(src("app-08-ui-modals-tour.js"), /setTimeout\(tour, delaiDeleste\(_feedFiletPas\)\)/);
  assert.doesNotMatch(src("app-08-ui-modals-tour.js"), /setTimeout\(tour, _feedFiletPas\)/);
  assert.doesNotMatch(src("app-05-config-profil.js"), /setTimeout\(_vliveFiletTour, _vliveFiletPas\)/);
  assert.doesNotMatch(src("app-03-posts-vlogs.js"), /debutTour \+ _postLikeRefreshPas \+/);
  assert.match(src("app-08-ui-modals-tour.js"), /\(now - r\.dernierGeste\) \* f/);
  assert.match(src("telemetry.js"), /_taux = _taux \/ _fDel/);
  assert.match(src("telemetry.js"), /reglages_distants\$\/i\.test\(path\) && res\.status === 404/);
});
