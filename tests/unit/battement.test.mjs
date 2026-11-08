// Battement de la veille (2026-11-06) : une preuve de TRAVAIL, lue par le
// téléphone et par le chien de garde extérieur (veille-production, GitHub).
// Mutation éprouvée à la main : `resumerBattement` qui rend « vivant » sans
// regarder l'âge → ② rougit.
// ⑤ ⑥ (2026-11-08) : le seuil de fraîcheur se DÉDUIT de ce qui l'impose (voir
// plus bas). Mutations éprouvées : BATTEMENT_PERIME_MS de 35 à 60 min ou à
// 34 min, la veille planifiée en */10 sans revoir le seuil, la porte
// BATTEMENT_TOUTES_MS à 20 min → ⑤ et ⑥ rougissent ; 100 battements attendus
// en 24 h → ⑤ ; le lecteur qui arrondit l'âge à la minute → ⑥.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contenuBattement, resumerBattement, BATTEMENT_PERIME_MS, BATTEMENT_TOUTES_MS, BATTEMENTS_ATTENDUS_24H, LECTURES_BATTEMENT } from "../../supabase/functions/_shared/battement.js";

const T = Date.parse("2026-11-06T12:00:00Z");
const ok = { status: "fulfilled", value: {} };
const ko = { status: "rejected", reason: new Error("HTTP 401") };

test("① le contenu dit ce que la veille a lu et décidé, en codes fermés", () => {
  const c = contenuBattement({
    lectures: { sante: ok, signalements: ok, github: ko, parcours: ok },
    verdict: { couleur: "orange" }, sonne: false,
    gestes: { delestage: { niveau: 0 }, reveil: { raison: "politique:pause" }, retour: { inactif: true }, canari: { emis: true }, x: { erreur: "boom\nsecret" } },
    politique: { version: 1, mode: "applique", valide: true },
    parcours: { parcours: [{ etat: "panne", juges: 4 }, { etat: "sain", juges: 9 }], tronque: false },
    revision: "abc1234", dureeMs: 812.4,
  });
  assert.deepEqual(c.lectures, { sante: "ok", signalements: "ok", github: "ko", parcours: "ok" });
  assert.deepEqual(c.gestes, { delestage: "niveau:0", reveil: "politique:pause", retour: "inactif", canari: "fait", x: "erreur:boom secret" });
  assert.equal(c.voyant, "orange");
  assert.deepEqual(c.parcours, { panne: 1, degrade: 0, juges: 13, tronque: false });
  assert.equal(c.dureeMs, 812);
  assert.equal(JSON.stringify(c).includes("\n"), false, "aucun retour à la ligne : pas de texte libre recopié");
});

test("② absent, périmé, incomplet, vivant — jamais sain sans fraîcheur", () => {
  assert.equal(resumerBattement(null, 0, T).etat, "jamais");
  const vieux = resumerBattement({ created_at: new Date(T - BATTEMENT_PERIME_MS - 60e3).toISOString(), properties: { lectures: { sante: "ok", signalements: "ok", github: "ok", parcours: "ok" } } }, 3, T);
  assert.equal(vieux.etat, "arrete");
  assert.equal(vieux.frais, false);
  assert.match(vieux.raisons[0], /alertes du téléphone sont muettes/);
  const incomplet = resumerBattement({ created_at: new Date(T - 5 * 60e3).toISOString(), properties: { lectures: { sante: "ok", signalements: "ok", github: "ko", parcours: "ok" } } }, 90, T);
  assert.equal(incomplet.etat, "incomplet");
  assert.deepEqual(incomplet.lecturesKo, ["github"]);
  const polKo = resumerBattement({ created_at: new Date(T - 5 * 60e3).toISOString(), properties: { lectures: Object.fromEntries(LECTURES_BATTEMENT.map((k) => [k, "ok"])), politique: { valide: false } } }, 90, T);
  assert.equal(polKo.etat, "incomplet");
  const vivant = resumerBattement({ created_at: new Date(T - 5 * 60e3).toISOString(), properties: { lectures: Object.fromEntries(LECTURES_BATTEMENT.map((k) => [k, "ok"])) } }, 95, T);
  assert.equal(vivant.etat, "vivant");
  assert.equal(vivant.battements24h, 95);
  assert.equal(vivant.attendus24h, BATTEMENTS_ATTENDUS_24H);
});

test("③ une horodate sans fuseau (timestamp) est lue en UTC ; illisible = arrêtée", () => {
  const naif = new Date(T - 5 * 60e3).toISOString().replace("T", " ").replace("Z", "");
  const r = resumerBattement({ created_at: naif, properties: { lectures: Object.fromEntries(LECTURES_BATTEMENT.map((k) => [k, "ok"])) } }, null, T);
  assert.equal(r.etat, "vivant");
  assert.equal(Math.round(r.ageMs / 60e3), 5);
  assert.equal(resumerBattement({ created_at: "n'importe quoi", properties: {} }, null, T).etat, "arrete");
});

test("④ des rappels en échec rendent la veille « incomplète » — ils dormaient dans rappels_echec, que rien ne lisait ; un battement d'avant, sans la clé, n'en dit rien", () => {
  const ok = Object.fromEntries(LECTURES_BATTEMENT.map((k) => [k, "ok"]));
  const ko = resumerBattement({ created_at: new Date(T - 5 * 60e3).toISOString(), properties: { lectures: { ...ok, rappels: "ko" } } }, 96, T);
  assert.equal(ko.etat, "incomplet");
  assert.ok(ko.raisons.some((r) => /rappels d'activité ont échoué/.test(r)));
  assert.equal(resumerBattement({ created_at: new Date(T - 5 * 60e3).toISOString(), properties: { lectures: { ...ok, rappels: "ok" } } }, 96, T).etat, "vivant");
  assert.equal(resumerBattement({ created_at: new Date(T - 5 * 60e3).toISOString(), properties: { lectures: ok } }, 96, T).etat, "vivant");
});

// ─── ⑤ ⑥ Le seuil de fraîcheur se DÉDUIT de ce qui l'impose (2026-11-08) ─────
// ② calcule ses âges à partir de BATTEMENT_PERIME_MS : il emploie la constante
// sans en épingler la valeur, et la passer de 35 à 60 min ne rougissait aucune
// suite (AUTONOMIE_EXPLOITATION.md § 3.9). Le seuil se relit donc là où il
// s'impose, sans recopier 35 :
//   · la CADENCE de la veille : pg_cron, la planification `pilotage_veille` la
//     plus récente de migrations/ (5 min). Le secours GitHub (*/10, servi quand
//     GitHub a de la place) n'est pas une cadence : il ne fait pas le seuil ;
//   · la PORTE de l'émetteur : `battre` (pilotage/index.ts), appelé en fin de
//     veille, n'écrit rien tant que le dernier battement a moins de
//     BATTEMENT_TOUTES_MS (14 min) ;
//   · la PÉRIODE : le premier passage qui franchit la porte, 15 min. Mesuré en
//     production du 06/11 18:35 au 08/11 16:35 : 187 battements, 184 écarts de
//     14 min 33 s à 15 min 28 s, aucun au-delà, 96 sur les dernières 24 h ;
//   · la RÈGLE, « deux battements manqués et une marge » : 2 × 15 min, plus UN
//     passage (5 min) — la gigue d'une veille, et un battement écrit hors des
//     passages de pg_cron (secours, appel anonyme), qui décale la série de moins
//     d'un passage. 35 min.
// La vérité de production reste `cron.job` (canal ①) : ce banc lit ce que le
// dépôt déclare, et rougit dès que la déclaration et le seuil divergent.
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8").split("\r\n").join("\n");
const MIN = 60e3;

/** La cadence de pg_cron pour la veille : la planification `pilotage_veille` la plus récente de migrations/. */
function cadenceVeille() {
  const plans = [];
  for (const f of fs.readdirSync(path.join(RACINE, "migrations")).filter((n) => n.endsWith(".sql"))) {
    const brut = lire(path.join("migrations", f));
    if (!brut.includes("pilotage_veille")) continue;
    // Un RETOUR ARRIÈRE écrit en commentaire (`--   select cron.schedule(…)`) ne planifie rien.
    const sql = brut.replace(/--[^\n]*/g, "");
    assert.doesNotMatch(sql, /cron\.alter_job/, `migrations/${f} : cron.alter_job dans un fichier qui nomme pilotage_veille — la cadence ne se lit plus dans cron.schedule`);
    for (const m of sql.matchAll(/cron\.schedule\(\s*'pilotage_veille'\s*,\s*'([^']*)'/g)) {
      const suite = sql.slice(m.index + m[0].length);
      const fin = suite.search(/cron\.schedule\(/);
      plans.push({ fichier: "migrations/" + f, expr: m[1].trim(), commande: fin < 0 ? suite : suite.slice(0, fin), date: (f.match(/\d{4}-\d{2}-\d{2}/) || [""])[0] });
    }
  }
  assert.ok(plans.length > 0, "aucune migration ne planifie pilotage_veille : la cadence de la veille ne se lit plus");
  // La plus récente par la date du fichier ; une planification sans date, ou du
  // même jour, doit dire la même cadence — sinon rien ne dit laquelle est en vigueur.
  const datees = plans.filter((p) => p.date).sort((a, b) => a.date.localeCompare(b.date));
  const plan = datees.length ? datees[datees.length - 1] : plans[0];
  const rivales = plans.filter((p) => p !== plan && (!p.date || p.date === plan.date));
  assert.ok(rivales.every((p) => p.expr === plan.expr), "pilotage_veille planifiée à deux cadences, sans date qui les départage : " + [plan, ...rivales].map((p) => `${p.fichier} « ${p.expr} »`).join(", "));
  // C'est bien l'émetteur qu'elle cadence : la fonction `pilotage`, action « veille ».
  assert.match(plan.commande, /\/functions\/v1\/pilotage'/, plan.fichier + " : la tâche pilotage_veille n'appelle plus la fonction pilotage");
  assert.match(plan.commande, /'{1,2}action'{1,2}\s*,\s*'{1,2}veille'{1,2}/, plan.fichier + " : la tâche pilotage_veille n'appelle plus l'action veille");
  const m = /^\*(?:\/([1-9]\d*))? \* \* \* \*$/.exec(plan.expr);
  assert.ok(m, `${plan.fichier} : cadence « ${plan.expr} » illisible ici — relier BATTEMENT_PERIME_MS à cette planification`);
  const n = m[1] ? Number(m[1]) : 1;
  assert.equal(60 % n, 0, `${plan.fichier} : « ${plan.expr} » ne divise pas l'heure, les passages ne sont plus réguliers`);
  return { fichier: plan.fichier, cadenceMs: n * MIN };
}

/** La porte de l'émetteur : à chaque veille, `battre` n'écrit rien tant que le dernier battement est plus jeune qu'elle. */
function porteEmetteur() {
  const fn = lire("supabase/functions/pilotage/index.ts");
  const corps = (nom) => {
    const i = fn.indexOf(`async function ${nom}(`);
    assert.ok(i >= 0, `pilotage/index.ts : async function ${nom} introuvable`);
    return fn.slice(i, fn.indexOf("\n}\n", i));
  };
  assert.match(corps("veille"), /battre\(admin, contenuBattement\(/, "la veille n'écrit plus son battement par battre()");
  assert.match(corps("battre"), /Date\.now\(\) - \w+ < BATTEMENT_TOUTES_MS\) return \{ ecrit: false/,
    "battre() n'a plus BATTEMENT_TOUTES_MS pour porte : la période du battement ne se déduit plus d'ici");
  return BATTEMENT_TOUTES_MS;
}

/** Ce que la cadence et la porte imposent au seuil (calculé une fois). */
let SEUIL_IMPOSE = null;
function seuilImpose() {
  if (SEUIL_IMPOSE) return SEUIL_IMPOSE;
  const { fichier, cadenceMs } = cadenceVeille();
  const porteMs = porteEmetteur();
  // La porte tombe ENTRE deux passages : posée sur un passage, une veille un peu
  // plus rapide que la précédente le sauterait (15 ou 20 min, au gré de la gigue).
  assert.notEqual(porteMs % cadenceMs, 0, `la porte (${porteMs / MIN} min) tombe sur un passage de la veille (${cadenceMs / MIN} min) : la période du battement n'est plus déterminée`);
  const periodeMs = Math.ceil(porteMs / cadenceMs) * cadenceMs;
  SEUIL_IMPOSE = { fichier, cadenceMs, porteMs, periodeMs, seuilMs: 2 * periodeMs + cadenceMs };
  return SEUIL_IMPOSE;
}

test("⑤ BATTEMENT_PERIME_MS se déduit de la cadence réelle de la veille : deux battements manqués et un passage de marge", () => {
  const s = seuilImpose();
  assert.equal(BATTEMENT_PERIME_MS, s.seuilMs,
    `la veille passe toutes les ${s.cadenceMs / MIN} min (${s.fichier}) et bat au premier passage après ${s.porteMs / MIN} min, soit toutes les ${s.periodeMs / MIN} min : deux battements manqués et un passage de marge font ${s.seuilMs / MIN} min, pas ${BATTEMENT_PERIME_MS / MIN}`);
  // La même période fait la régularité affichée (« 95/96 battements en 24 h ») ;
  // seul un littéral de veille-production.test.mjs la tenait, hors de l'étape d'avant déploiement.
  assert.equal(BATTEMENTS_ATTENDUS_24H, Math.floor(864e5 / s.periodeMs),
    `un battement toutes les ${s.periodeMs / MIN} min en fait ${Math.floor(864e5 / s.periodeMs)} en 24 h, pas ${BATTEMENTS_ATTENDUS_24H}`);
});

test("⑥ au seuil déduit : une milliseconde avant, le battement est frais ; une milliseconde après, il est périmé", () => {
  const { seuilMs } = seuilImpose();
  const lectures = Object.fromEntries(LECTURES_BATTEMENT.map((k) => [k, "ok"]));
  const age = (ms) => resumerBattement({ created_at: new Date(T - ms).toISOString(), properties: { lectures } }, null, T);
  const avant = age(seuilMs - 1);
  assert.equal(avant.etat, "vivant", `à ${seuilMs / MIN} min moins 1 ms, la veille n'a pas encore manqué deux battements et sa marge`);
  assert.equal(avant.frais, true);
  const apres = age(seuilMs + 1);
  assert.equal(apres.etat, "arrete", `à ${seuilMs / MIN} min et 1 ms, la veille a manqué deux battements et sa marge : le téléphone ne sonnera plus`);
  assert.equal(apres.frais, false);
});
