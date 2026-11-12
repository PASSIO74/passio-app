// La purge courte d'analytics_events (migrations/migration_purge_analytics_courte_2026-11-07.sql)
// ne tient que parce que ses LECTEURS lisent moins loin qu'elle n'efface : le plafond
// des Edge Functions relit la dernière heure, un créneau de la veille sa minute et la
// suivante, le pilotage les notes `push_envoye` sur 24 à 48 h, et la dernière note du
// pilote pour `essaiDu` (7 jours). Ces nombres vivent dans le JS ; les rétentions et
// leurs planchers, dans la migration. Ce verrou relie les deux côtés : élargir une
// fenêtre de lecture au-delà d'un plancher, abaisser un plancher sous une lecture, ou
// ajouter un lecteur de ces lignes ailleurs, rougit la CI. Aucun réseau : les clients
// service_role sont des FAUX qui notent chaque appel ; les fichiers lus sont ceux que
// Deno déploie.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as RECEPTION from "../../supabase/functions/_shared/reception.js";
import { verifierPlafondEnBase } from "../../supabase/functions/_shared/plafond.js";
import { prendreCreneau } from "../../supabase/functions/_shared/autonomie.js";

const MIGRATION = fs.readFileSync("migrations/migration_purge_analytics_courte_2026-11-07.sql", "utf8");
const PILOTAGE = fs.readFileSync("supabase/functions/pilotage/index.ts", "utf8");

const UNITE = { minute: 60e3, minutes: 60e3, hour: 3600e3, hours: 3600e3, day: 864e5, days: 864e5 };
/** « 6 days 23 hours » → ms ; refuse tout ce qu'il ne sait pas lire (un intervalle mal lu ne prouve rien). */
function dureeMs(txt) {
  const parties = [...txt.matchAll(/(\d+) (minutes?|hours?|days?)/g)];
  assert.ok(parties.length && parties.map((p) => p[0]).join(" ") === txt.trim(), "intervalle illisible : « " + txt + " »");
  return parties.reduce((s, p) => s + Number(p[1]) * UNITE[p[2]], 0);
}
function capture(re, quoi) { const m = MIGRATION.match(re); assert.ok(m, quoi + " introuvable dans la migration"); return m; }

const PLANCHER_EDGE = dureeMs(capture(/p_edge is null or p_edge < interval '([^']+)'/, "plancher edge_*")[1]);
const PLANCHER_NOTES = dureeMs(capture(/p_notes is null or p_notes < interval '([^']+)'/, "plancher des notes")[1]);
const TACHE = capture(/cron\.schedule\('purge_analytics_courte', '([^']+)',\s*\$q\$select public\.purger_analytics_courte\(interval '([^']+)', interval '([^']+)'\)\$q\$\)/, "planification");
const RETENTION_EDGE = dureeMs(TACHE[2]);
const RETENTION_NOTES = dureeMs(TACHE[3]);

/**
 * Faux client supabase-js qui NOTE chaque maillon (`from`, `select`, `eq`, `gt`, …) ;
 * `limit` et `insert` terminent la chaîne avec la réponse donnée.
 */
function enregistreur(reponse = () => ({ data: [], error: null })) {
  const appels = [];
  const chaine = new Proxy({}, {
    get(_c, prop) {
      if (prop === "then") return undefined;
      return (...args) => {
        appels.push({ m: String(prop), args });
        return (prop === "limit" || prop === "insert") ? Promise.resolve(reponse(String(prop), args)) : chaine;
      };
    },
  });
  return { client: { from: (t) => { appels.push({ m: "from", args: [t] }); return chaine; } }, appels };
}
const FILTRES_TEMPS = new Set(["gt", "gte", "lt", "lte", "filter", "or", "range"]);

test("① la migration se lit : planchers ≤ rétentions ; la commande planifiée, le verdict et le relevé des survivants disent les MÊMES rétentions", () => {
  assert.equal(TACHE[1], "23 * * * *", "chaque heure à :23");
  assert.ok(PLANCHER_EDGE <= RETENTION_EDGE, "rétention edge_* sous son plancher : la tâche échouerait chaque heure");
  assert.ok(PLANCHER_NOTES <= RETENTION_NOTES, "rétention des notes sous son plancher : la tâche échouerait chaque heure");
  const ligne2 = capture(/t\.command = 'select public\.purger_analytics_courte\(interval ''([^']+)'', interval ''([^']+)''\)'/, "ligne 2 du verdict");
  assert.deepEqual([dureeMs(ligne2[1]), dureeMs(ligne2[2])], [RETENTION_EDGE, RETENTION_NOTES], "le verdict attend la commande planifiée");
  // Le relevé des survivants (⓪) et la ligne 6 bornent à la MÊME rétention que la commande.
  const edge = [...MIGRATION.matchAll(/starts_with\(a\.event, 'edge_'\) and a\.created_at (?:>=|<) pg_catalog\.now\(\) - interval '([^']+)'/g)];
  const notes = [...MIGRATION.matchAll(/a\.event = 'push_envoye' and a\.created_at (?:>=|<) pg_catalog\.now\(\) - interval '([^']+)'/g)];
  assert.equal(edge.length, 2, "relevé ⓪ et ligne 6, pour edge_*");
  assert.equal(notes.length, 2, "relevé ⓪ et ligne 6, pour les notes");
  for (const m of edge) assert.equal(dureeMs(m[1]), RETENTION_EDGE);
  for (const m of notes) assert.equal(dureeMs(m[1]), RETENTION_NOTES);
  // Les deux familles, et elles seules : `starts_with` (pas un LIKE où `_` est un joker), une égalité pour les notes.
  assert.match(MIGRATION, /delete from public\.analytics_events\n   where starts_with\(event, 'edge_'\) and created_at < pg_catalog\.now\(\) - p_edge;/);
  assert.match(MIGRATION, /delete from public\.analytics_events\n   where event = 'push_envoye' and created_at < pg_catalog\.now\(\) - p_notes;/);
  assert.equal((MIGRATION.match(/delete from public\.analytics_events/g) || []).length, 2, "aucune autre suppression");
});

test("② le plafond des Edge Functions relit AU PLUS le plancher des lignes edge_* (mutation : élargir sa fenêtre à 3 h)", async () => {
  const T0 = Date.parse("2026-11-07T12:00:00Z");
  const { client, appels } = enregistreur();
  const v = await verifierPlafondEnBase(client, "u1", "notify-call", { parMinute: 20, parHeure: 200 }, T0);
  assert.equal(v.ok, true);
  const temps = appels.filter((a) => FILTRES_TEMPS.has(a.m));
  assert.equal(temps.length, 1, "un seul filtre de temps");
  assert.deepEqual(temps[0].args.slice(0, 1), ["created_at"]);
  assert.equal(temps[0].m, "gt");
  const fenetre = T0 - Date.parse(temps[0].args[1]);
  assert.equal(fenetre, 3600e3, "la dernière heure");
  assert.ok(fenetre <= PLANCHER_EDGE, "le plafond lirait des lignes que la purge peut avoir effacées");
  const ecrit = appels.find((a) => a.m === "insert");
  assert.ok(ecrit && /^edge_/.test(ecrit.args[0].event), "la ligne écrite est de la famille purgée");
});

test("③ un créneau de la veille ne se relit que par IDENTIFIANT (sa minute, la suivante), et s'écrit en edge_* (mutation : le relire par date)", async () => {
  const M0 = Date.parse("2026-11-07T12:05:00Z");
  const { client, appels } = enregistreur();
  const r = await prendreCreneau(client, "systeme:pilotage-veille", "pilotage-veille", "secret-serveur-de-test-0123456789", M0);
  assert.equal(r.ok, true);
  assert.equal(r.ids.length, 2, "les deux lignes du créneau : ce que rend un geste que GitHub a refusé (rendreCreneau)");
  assert.equal(appels.filter((a) => FILTRES_TEMPS.has(a.m)).length, 0, "aucun filtre de date : rien ne relit un vieux créneau");
  const lecture = appels.find((a) => a.m === "in");
  assert.ok(lecture && lecture.args[0] === "id" && lecture.args[1].length === 2, "lecture par identifiant, deux créneaux");
  const lignes = appels.find((a) => a.m === "insert").args[0];
  assert.ok(lignes.every((l) => /^edge_/.test(l.event)), "les créneaux sont de la famille purgée");
  const m = Math.floor(M0 / 60e3);
  assert.deepEqual(lignes.map((l) => l.properties.minute), [m, m + 1], "sa minute et la suivante : un créneau de plus de 2 min n'est plus jamais lu");
  assert.ok(2 * 60e3 <= PLANCHER_EDGE);
});

test("④ chaque fenêtre de lecture des notes (FENETRE_*_MS, JUGEMENT_MAX_MS) et le seuil d'essaiDu tiennent sous le plancher des notes (mutation : JUGEMENT_MAX_MS à 10 jours)", () => {
  const fenetres = Object.entries(RECEPTION).filter(([k, v]) => typeof v === "number" && (/^FENETRE_[A-Z_]+_MS$/.test(k) || k === "JUGEMENT_MAX_MS"));
  assert.ok(fenetres.length >= 3, "rappels, appels, jugement — au moins");
  for (const [k, v] of fenetres) assert.ok(v > 0 && v <= PLANCHER_NOTES, k + " = " + v + " ms lit plus loin que le plancher des notes (" + PLANCHER_NOTES + " ms)");
  assert.ok(RECEPTION.ESSAI_INTERVALLE_MS <= PLANCHER_NOTES, "essaiDu distinguerait des notes que la purge peut avoir effacées");
  // L'essai manuel lit la dernière note du pilote : 2 minutes entre deux envois.
  const m = PILOTAGE.match(/const ESSAI_MANUEL_MIN_MS = (\d+) \* 60e3;/);
  assert.ok(m, "ESSAI_MANUEL_MIN_MS lisible");
  assert.ok(Number(m[1]) * 60e3 <= PLANCHER_NOTES);
});

test("⑤ essaiDu : une dernière note plus vieille que le plancher, ou AUCUNE note, c'est la même décision — et plus en deçà (mutation : plancher des notes à 6 jours)", () => {
  const instants = [
    Date.parse("2026-11-07T11:00:00Z"),   // 12 h à Paris : fenêtre de jour
    Date.parse("2026-11-07T02:00:00Z"),   // 3 h à Paris : hors fenêtre
    Date.parse("2026-07-14T17:30:00Z"),   // 19 h 30 à Paris, heure d'été
  ];
  const variantes = [{ mesure: "ok", revision: "r1" }, { mesure: "sans_adresse", revision: "r1" }, { mesure: "sans_adresse", revision: "r0" }, {}];
  const note = (maintenant, ageMs, p) => ({ created_at: new Date(maintenant - ageMs).toISOString(), properties: p });
  for (const maintenant of instants) {
    const sansNote = RECEPTION.essaiDu({ derniereNote: null, maintenant, revision: "r1" });
    for (const p of variantes) {
      for (const age of [PLANCHER_NOTES, PLANCHER_NOTES + 1, RETENTION_NOTES, RETENTION_NOTES + 3600e3, 40 * 864e5]) {
        assert.equal(RECEPTION.essaiDu({ derniereNote: note(maintenant, age, p), maintenant, revision: "r1" }), sansNote,
          "une note de " + age + " ms (" + JSON.stringify(p) + ") ne décide pas comme son absence, à " + new Date(maintenant).toISOString());
      }
    }
  }
  // Sensibilité : sous le plancher, une note MESURÉE décide autrement que son absence.
  const midi = instants[0];
  assert.equal(RECEPTION.essaiDu({ derniereNote: null, maintenant: midi, revision: "r1" }), true);
  assert.equal(RECEPTION.essaiDu({ derniereNote: note(midi, PLANCHER_NOTES - 3600e3, { mesure: "ok", revision: "r1" }), maintenant: midi, revision: "r1" }), false,
    "à 6 j 23 h, la note retient l'essai : une purge sous 7 jours le ferait partir trop tôt");
});

test("⑥ aucun autre lecteur (une HEURISTIQUE, dite comme telle : elle attrape les formes qu'elle connaît) — hors des fichiers connus, nul ne nomme `edge_`, `push_envoye` ni `EVT_ENVOI` ; dans les fichiers connus, chaque mention est classée", () => {
  // Revue `passio-red-team` du 07/11 : la première version ne reconnaissait que
  // `.eq("event", EVT_ENVOI)` hors de pilotage/index.ts ; `.filter(…)`, `.match({…})`,
  // `.in("event", […])` ou un nouveau fichier passaient, et `migrations/` n'était pas
  // balayé. Désormais toute MENTION compte, et chaque fichier qui en porte une a sa
  // raison ci-dessous. Ce qui lui échappe encore, dit tel quel : un alias d'import, ou
  // une vue SQL qui lirait ces lignes sans les nommer.
  const racines = ["supabase/functions", "scripts", "dashboard/server", "dashboard/public", "pilotage", "js", "netlify", ".github/workflows", "migrations"];
  const fichiers = [];
  const parcourir = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "parties") parcourir(p); }
      else if (/\.(m?js|ts|ya?ml|sh|sql)$/.test(e.name)) fichiers.push(p);
    }
  };
  racines.forEach(parcourir);
  assert.ok(fichiers.length > 50, "le balayage a trouvé le code");
  const rel = (f) => f.split(path.sep).join("/");
  // Le code seul : une ligne de commentaire (//, *, /*, #, --) ne lit rien.
  const lignesCode = (f) => fs.readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|#|--)/.test(l));
  const EDGE = {
    "supabase/functions/_shared/plafond.js": "le plafond : écrit, et relit la dernière heure (②)",
    "supabase/functions/_shared/autonomie.js": "les créneaux de la veille : relus par identifiant (③)",
    "migrations/migration_purge_analytics_courte_2026-11-07.sql": "la purge elle-même",
    // PR #753 (ouverte le 07/11) : le plafond passe en SQL, `plafond_consommer` — sa fenêtre est vérifiée ci-dessous.
    "migrations/migration_securite_lot1_2026-11-06.sql": "plafond_consommer : relit la dernière heure",
  };
  const NOTE = {
    "supabase/functions/_shared/reception.js": "la définition de EVT_ENVOI",
    "supabase/functions/pilotage/index.ts": "le seul lecteur : chaque mention est classée ci-dessous",
    "supabase/functions/_shared/rappels.js": "écrit les notes des rappels",
    "supabase/functions/_shared/appels.js": "écrit les notes des appels (et des notifications sociales, #749)",
    "supabase/functions/_shared/politique-autonomie.js": "le TEXTE du catalogue (précondition d'essai_alertes), pas une requête",
    "migrations/migration_purge_analytics_courte_2026-11-07.sql": "la purge elle-même",
  };
  const nommentEdge = [], nommentNote = [];
  for (const f of fichiers) {
    const code = lignesCode(f).join("\n");
    if (/edge_/.test(code)) nommentEdge.push(rel(f));
    if (/\bpush_envoye\b|\bEVT_ENVOI\b/.test(code)) nommentNote.push(rel(f));
  }
  for (const f of nommentEdge) assert.ok(EDGE[f], f + " nomme `edge_` : un nouveau lecteur ou écrivain de ces lignes — vérifier sa fenêtre contre la rétention de la purge (2 h), puis l'inscrire ici avec sa raison");
  for (const f of nommentNote) assert.ok(NOTE[f], f + " nomme `push_envoye` / EVT_ENVOI : un nouveau lecteur des notes — vérifier sa fenêtre contre la rétention (8 jours), puis l'inscrire ici avec sa raison");
  for (const f of ["supabase/functions/_shared/plafond.js", "supabase/functions/_shared/autonomie.js"]) assert.ok(nommentEdge.includes(f), f + " ne nomme plus `edge_` : relire ce verrou");
  assert.ok(nommentNote.includes("supabase/functions/pilotage/index.ts"));

  // Les écrivains n'écrivent que : chaque mention est l'import, ou `event: EVT_ENVOI` dans un `.insert(`.
  for (const f of ["supabase/functions/_shared/rappels.js", "supabase/functions/_shared/appels.js"]) {
    for (const l of lignesCode(f).filter((x) => /\bEVT_ENVOI\b/.test(x))) {
      assert.ok(/^\s*import\b/.test(l) || (/\bevent:\s*EVT_ENVOI\b/.test(l) && /\.insert\(/.test(l)), f + " : une mention qui n'est ni l'import ni une écriture : " + l.trim().slice(0, 140));
    }
  }
  // Le lecteur : l'import, une écriture (sonnerPilote), ou une lecture `.eq("event", EVT_ENVOI)` — aucune autre forme.
  const lignesPilotage = lignesCode("supabase/functions/pilotage/index.ts").filter((x) => /\bEVT_ENVOI\b/.test(x));
  for (const l of lignesPilotage) {
    assert.ok(/^\s*import\b/.test(l) || (/\bevent:\s*EVT_ENVOI\b/.test(l) && /\.insert\(/.test(l)) || /\.eq\(\s*["']event["']\s*,\s*EVT_ENVOI\s*\)/.test(l),
      "pilotage : une forme de lecture des notes que ce verrou ne sait pas juger : " + l.trim().slice(0, 140));
  }
  // Chaque lecture des notes : une fenêtre, ou la seule dernière note — et la dernière note
  // ne décide que dans les deux fonctions dont ④ et ⑤ jugent la fenêtre.
  const lectures = [...PILOTAGE.matchAll(/\.eq\(\s*["']event["']\s*,\s*EVT_ENVOI\s*\)[^;]*;/g)];
  assert.ok(lectures.length >= 4);
  for (const m of lectures) {
    const l = m[0];
    const fonctions = [...PILOTAGE.slice(0, m.index).matchAll(/async function (\w+)\(/g)];
    const dans = fonctions.length ? fonctions[fonctions.length - 1][1] : "?";
    if (/\.gte\("created_at", /.test(l)) continue;
    assert.ok(/\.order\("created_at", \{ ascending: false \}\)\.limit\(1\)/.test(l), "lecture des notes sans borne : " + l.slice(0, 160));
    assert.ok(["essayerAlertes", "essaiManuel"].includes(dans), "la dernière note du pilote lue par " + dans + " : une décision que ce verrou ne juge pas — vérifier qu'elle ne distingue rien au-delà de 7 jours");
  }
  // Les fenêtres employées sont celles du ④ : `lireNotes(…, FENETRE_*_MS, …)` et la dernière alerte sur JUGEMENT_MAX_MS.
  const appelsLireNotes = [...PILOTAGE.matchAll(/lireNotes\(\s*[A-Z_]+\s*,\s*([A-Za-z_]+)\s*,/g)].map((m) => m[1]);
  assert.ok(appelsLireNotes.length >= 2);
  for (const f of appelsLireNotes) assert.match(f, /^FENETRE_[A-Z_]+_MS$/, "lireNotes lit sur une fenêtre de reception.js");
  assert.match(PILOTAGE, /const depuis = new Date\(maintenant - JUGEMENT_MAX_MS\)\.toISOString\(\);/);

  // Le plafond en SQL de #753, s'il est là : aucune de ses fenêtres ne dépasse le plancher des lignes edge_*.
  const lot1 = "migrations/migration_securite_lot1_2026-11-06.sql";
  if (fs.existsSync(lot1)) {
    const sql = fs.readFileSync(lot1, "utf8");
    const corps = sql.match(/create or replace function public\.plafond_consommer\([\s\S]*?\$fn\$;/);
    assert.ok(corps, lot1 + " nomme `edge_` hors de plafond_consommer : relire ce verrou");
    const fenetres = [...corps[0].matchAll(/interval '([^']+)'/g)].map((m) => dureeMs(m[1]));
    assert.ok(fenetres.length >= 2);
    for (const ms of fenetres) assert.ok(ms <= PLANCHER_EDGE, "plafond_consommer lit " + ms + " ms en arrière, plus que le plancher des lignes edge_*");
  }
});
