// ═══════════════════════════════════════════════════════════════════════════
// REGISTRE DES RÉSIDUS — verrous (cinquième contre-revue Astra, mandat §9).
//
// Ce que ces tests prouvent : (1) le registre RÉEL du dépôt est valide et la
// gate est verte dessus ; (2) chaque champ manquant ou valeur hors liste est
// refusé, toutes les erreurs à la fois ; (3) une condition de réexamen
// satisfaite par le dépôt (table déclarée, fichier présent, échéance, résidu
// fermé) rend la gate ROUGE tant que le registre dit « en_attente » — le
// signal demandé (« une PR créant cette dépendance doit déclencher un réexamen
// explicite ») ; (4) aucune fermeture sans les quatre états à oui ; (5) la
// lecture SQL voit ALTER TABLE ADD COLUMN et "public" entre guillemets
// (ASTRA-54) ; (6) réinjections sur le VRAI script, en sous-processus, sur une
// copie du dépôt : RES-06 remis « en_attente » → code 1 ; un fichier attendu
// par RES-11 posé → code 1.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const R = require("../../scripts/lib/registre-residus.js");
const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
const SCRIPT = path.join(RACINE, "scripts/audit-registre-residus.js");

const texteReel = () => fs.readFileSync(path.join(RACINE, R.CHEMIN_REGISTRE), "utf8");

/** Un résidu valide, à retoucher. */
function residu(sur = {}) {
  return Object.assign({
    id: "RES-01", titre: "t", gravite: "P2", proprietaire: "Claude", origine: ["ASTRA-49"],
    scenario_residuel: "s", raison_du_maintien: "r", dependances: [],
    condition_de_reexamen: { type: "date", le: "2026-10-01" },
    critere_de_fermeture: "c", preuve_attendue: "p", prochaine_etape: "n",
    etats: { corrige: "oui", teste: "oui", deploye: "non", relu_sur_cible: "non mesuré" },
    reexamen: { statut: "en_attente", le: "2026-09-15", note: "n" },
  }, sur);
}
const registre = (...residus) => JSON.stringify({ format: R.FORMAT, mis_a_jour_le: "2026-09-15", residus });
const sonde = (sur = {}) => Object.assign({ aujourdhui: "2026-09-15", fichierPresent: () => false, objetSql: () => false }, sur);

test("① le registre réel est valide, et la gate est verte sur le dépôt réel", () => {
  const reg = R.lireRegistre(texteReel());
  assert.ok(reg.residus.length >= 10);
  const bilan = R.evaluer(reg, R.sondeDepot(RACINE, { aujourdhui: "2026-09-15" }));
  assert.deepEqual(bilan.ecarts, []);
  // Le résidu-exemple du mandat : call_invites est déclarée → RES-06 traitable, et DIT traitable.
  const res06 = bilan.lignes.find((l) => l.id === "RES-06");
  assert.equal(res06.condition.satisfaite, true);
  assert.equal(res06.statut, "traitable");
  const r = spawnSync(process.execPath, [SCRIPT, "--aujourdhui", "2026-09-15"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /registre cohérent/);
});

test("② chaque champ manquant ou valeur hors liste est refusé — toutes les erreurs d'un coup", () => {
  const mauvais = residu({
    gravite: "P9", scenario_residuel: "", etats: { corrige: "peut-être", teste: "oui", deploye: "non", relu_sur_cible: "non mesuré", autre: "x" },
    dependances: ["RES-42"], condition_de_reexamen: { type: "souhait" },
    reexamen: { statut: "ferme", le: "hier", note: "" },
  });
  let e = null;
  try { R.lireRegistre(registre(mauvais, residu({ id: "RES-01" }))); } catch (x) { e = x; }
  assert.ok(e instanceof R.ErreurRegistre, "ErreurRegistre attendue");
  const attendus = ["gravité hors", "scenario_residuel manquant", "etats.corrige hors", "etats.autre inconnu", "résidu inconnu RES-42", "type de condition inconnu", "reexamen.le absent", "reexamen.note manquante", "reexamen.chantier", "id en double"];
  for (const a of attendus) assert.ok(e.erreurs.some((x) => x.includes(a)), a + " — " + JSON.stringify(e.erreurs));
  const erreurs = (texte) => { try { R.lireRegistre(texte); return []; } catch (x) { return x.erreurs || [x.message]; } };
  assert.match(erreurs("{").join(" | "), /illisible/);
  assert.match(erreurs(JSON.stringify({ format: "autre/9", residus: [] })).join(" | "), /format attendu/);
  // Une condition composée exige au moins deux sous-conditions, et un résidu ne se cite pas lui-même.
  assert.match(erreurs(registre(residu({ condition_de_reexamen: { type: "une", de: [{ type: "date", le: "2026-10-01" }] } }))).join(" | "), /au moins deux/);
  assert.match(erreurs(registre(residu({ condition_de_reexamen: { type: "residu_ferme", id: "RES-01" } }))).join(" | "), /sur lui-même/);
});

test("③ une condition satisfaite par le dépôt + statut « en_attente » = écart ; déclarée traitable/planifiée = aucun écart", () => {
  const cond = { type: "objet_sql", genre: "table", nom: "public.call_invites" };
  const attend = R.lireRegistre(registre(residu({ condition_de_reexamen: cond })));
  const s = sonde({ objetSql: (g, n) => g === "table" && n === "public.call_invites" });
  const b1 = R.evaluer(attend, s);
  assert.equal(b1.ecarts.length, 1);
  assert.match(b1.ecarts[0], /RES-01 : devenu traitable \(table public\.call_invites déclaré dans le dépôt\)/);
  assert.deepEqual(b1.traitables, ["RES-01"]);
  // Le dépôt ne déclare pas la table : rien à signaler.
  assert.deepEqual(R.evaluer(attend, sonde()).ecarts, []);
  // Déclaré traitable (ou planifié avec chantier) : le réexamen a eu lieu, pas d'écart.
  const traitable = R.lireRegistre(registre(residu({ condition_de_reexamen: cond, reexamen: { statut: "traitable", le: "2026-09-15", note: "vu" } })));
  assert.deepEqual(R.evaluer(traitable, s).ecarts, []);
  const planifie = R.lireRegistre(registre(residu({ condition_de_reexamen: cond, reexamen: { statut: "planifie", le: "2026-09-15", note: "vu", chantier: "PR #999" } })));
  assert.deepEqual(R.evaluer(planifie, s).ecarts, []);
});

test("④ les autres formes de condition : échéance, fichier présent/absent, résidu fermé, toutes/une, manuel (jamais un écart)", () => {
  const ev = (cond, so, statut = "en_attente") => R.evaluer(R.lireRegistre(registre(
    residu({ condition_de_reexamen: cond, reexamen: { statut, le: "2026-09-15", note: "n" } }),
    residu({ id: "RES-02", reexamen: { statut: "ferme", le: "2026-09-15", note: "n", chantier: "PR #1" }, etats: { corrige: "oui", teste: "oui", deploye: "oui", relu_sur_cible: "oui" } }),
  )), so).lignes[0];
  assert.equal(ev({ type: "date", le: "2026-10-01" }, sonde()).condition.satisfaite, false);
  assert.equal(ev({ type: "date", le: "2026-10-01" }, sonde({ aujourdhui: "2026-10-01" })).condition.satisfaite, true);
  assert.equal(ev({ type: "date", le: "2026-10-01" }, sonde({ aujourdhui: "2026-10-01" })).ecarts.length, 1);
  assert.equal(ev({ type: "fichier_present", chemin: "js/x.js" }, sonde({ fichierPresent: (c) => c === "js/x.js" })).condition.satisfaite, true);
  assert.equal(ev({ type: "fichier_absent", chemin: "js/x.js" }, sonde({ fichierPresent: (c) => c === "js/x.js" })).condition.satisfaite, false);
  assert.equal(ev({ type: "residu_ferme", id: "RES-02" }, sonde()).condition.satisfaite, true);
  assert.equal(ev({ type: "toutes", de: [{ type: "residu_ferme", id: "RES-02" }, { type: "date", le: "2026-12-01" }] }, sonde()).condition.satisfaite, false);
  assert.equal(ev({ type: "une", de: [{ type: "residu_ferme", id: "RES-02" }, { type: "date", le: "2026-12-01" }] }, sonde()).condition.satisfaite, true);
  // Manuel + sous-condition fausse dans « une » : indéterminé, pas satisfait, pas d'écart.
  const m = ev({ type: "une", de: [{ type: "manuel", quand: "lire la cible" }, { type: "date", le: "2026-12-01" }] }, sonde());
  assert.equal(m.condition.satisfaite, null);
  assert.deepEqual(m.ecarts, []);
  assert.equal(ev({ type: "manuel", quand: "lire la cible" }, sonde()).condition.satisfaite, null);
});

test("⑤ aucune fermeture sans les quatre états à oui, ni par-dessus une dépendance ouverte", () => {
  const ferme = (etats, deps = []) => R.evaluer(R.lireRegistre(registre(
    residu({ etats, dependances: deps, reexamen: { statut: "ferme", le: "2026-09-15", note: "n", chantier: "PR #1" } }),
    residu({ id: "RES-02" }),
  )), sonde()).ecarts;
  const e1 = ferme({ corrige: "oui", teste: "oui", deploye: "oui", relu_sur_cible: "non mesuré" });
  assert.equal(e1.length, 1);
  assert.match(e1[0], /relu_sur_cible=non mesuré — aucune fermeture sans déploiement et relecture de la cible/);
  assert.deepEqual(ferme({ corrige: "oui", teste: "oui", deploye: "oui", relu_sur_cible: "oui" }), []);
  assert.deepEqual(ferme({ corrige: "sans objet", teste: "oui", deploye: "oui", relu_sur_cible: "oui" }), []);
  const e2 = ferme({ corrige: "oui", teste: "oui", deploye: "oui", relu_sur_cible: "oui" }, ["RES-02", "PR #5"]);
  assert.equal(e2.length, 1);
  assert.match(e2[0], /fermé avec des dépendances ouvertes : RES-02/);
});

test("⑥ la lecture SQL voit le schéma résultant : ALTER TABLE ADD COLUMN, \"public\" entre guillemets, fonctions, policies, triggers ; jamais un commentaire", () => {
  const objets = R.objetsSqlDeclares([
    `create table if not exists "public"."call_invites" (id uuid primary key, from_id uuid not null, constraint c check (true));`,
    `alter table public.call_invites add column if not exists to_id uuid;`,
    `create or replace function public.call_partie_prenante(p uuid) returns boolean language sql as $$ select true $$;`,
    `create policy "Insert erreurs" on public.client_errors for insert to public with check (true);`,
    `create trigger trg_notifications_origine before insert on public.notifications for each row execute function public.notifications_origine();`,
    `create unique index if not exists idx_x on public.call_invites(id);`,
    `-- create table public.fantome(id int);\n/* create function public.fantome() */`,
  ]);
  const a = (k) => assert.ok(objets.has(k), k + " — " + [...objets].join(", "));
  a("table:call_invites"); a("column:call_invites.from_id"); a("column:call_invites.to_id"); a("column:call_invites.id");
  a("function:call_partie_prenante"); a("policy:insert erreurs"); a("trigger:trg_notifications_origine"); a("index:idx_x");
  assert.ok(!objets.has("table:fantome") && !objets.has("function:fantome"), "un commentaire ne déclare rien");
  assert.ok(!objets.has("column:call_invites.constraint"));
  const s = R.sondeDepot(RACINE);
  assert.equal(s.objetSql("table", "public.call_invites"), true, "le dépôt réel déclare call_invites");
  assert.equal(s.objetSql("table", "call_invites"), true);
  assert.equal(s.objetSql("function", "public.notifier_suivi"), false);
});

// ── Réinjections sur le VRAI script, sur une copie du dépôt ────────────────
function copieDepot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "passio-residus-"));
  for (const rel of ["scripts/audit-registre-residus.js", "scripts/lib/registre-residus.js", R.CHEMIN_REGISTRE]) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(path.join(RACINE, rel), path.join(dir, rel));
  }
  fs.mkdirSync(path.join(dir, "migrations"));
  for (const f of fs.readdirSync(path.join(RACINE, "migrations")).filter((f) => f.endsWith(".sql"))) fs.copyFileSync(path.join(RACINE, "migrations", f), path.join(dir, "migrations", f));
  return dir;
}
const lancer = (dir) => spawnSync(process.execPath, [path.join(dir, "scripts/audit-registre-residus.js"), "--aujourdhui", "2026-09-15"], { encoding: "utf8" });

test("⑦ réinjection : RES-06 remis « en_attente » alors que call_invites est déclarée → la gate est rouge, et dit lequel", () => {
  const dir = copieDepot();
  const reg = JSON.parse(fs.readFileSync(path.join(dir, R.CHEMIN_REGISTRE), "utf8"));
  reg.residus.find((x) => x.id === "RES-06").reexamen = { statut: "en_attente", le: "2026-09-15", note: "oublié" };
  fs.writeFileSync(path.join(dir, R.CHEMIN_REGISTRE), JSON.stringify(reg));
  const r = lancer(dir);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /RES-06[\s\S]*devenu traitable \(table public\.call_invites déclaré dans le dépôt\)/);
  assert.match(r.stderr, /1 écart/);
  const j = spawnSync(process.execPath, [path.join(dir, "scripts/audit-registre-residus.js"), "--json", "--aujourdhui", "2026-09-15"], { encoding: "utf8" });
  assert.equal(j.status, 1);
  assert.equal(JSON.parse(j.stdout).ok, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("⑧ réinjection : une PR pose le fichier attendu par RES-11 (scripts/lib/yaml-workflow.js) → rouge tant que le registre n'est pas réexaminé", () => {
  const dir = copieDepot();
  fs.writeFileSync(path.join(dir, "scripts/lib/yaml-workflow.js"), "// livré\n");
  const r = lancer(dir);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /RES-11[\s\S]*scripts\/lib\/yaml-workflow\.js présent/);
  // Le réexamen écrit (planifié, avec le chantier) rend la gate verte.
  const reg = JSON.parse(fs.readFileSync(path.join(dir, R.CHEMIN_REGISTRE), "utf8"));
  reg.residus.find((x) => x.id === "RES-11").reexamen = { statut: "planifie", le: "2026-09-15", note: "#473 présent", chantier: "PR #473" };
  fs.writeFileSync(path.join(dir, R.CHEMIN_REGISTRE), JSON.stringify(reg));
  assert.equal(lancer(dir).status, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("⑨ réinjection : un résidu « fermé » avec relu_sur_cible = non mesuré → rouge ; registre illisible → rouge et code 1 en --json", () => {
  const dir = copieDepot();
  const reg = JSON.parse(fs.readFileSync(path.join(dir, R.CHEMIN_REGISTRE), "utf8"));
  const x = reg.residus.find((x) => x.id === "RES-01");
  x.reexamen = { statut: "ferme", le: "2026-09-15", note: "fait", chantier: "PR #469" };
  x.etats = { corrige: "oui", teste: "oui", deploye: "oui", relu_sur_cible: "non mesuré" };
  fs.writeFileSync(path.join(dir, R.CHEMIN_REGISTRE), JSON.stringify(reg));
  const r = lancer(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /RES-01[\s\S]*déclaré fermé alors que relu_sur_cible=non mesuré/);
  fs.writeFileSync(path.join(dir, R.CHEMIN_REGISTRE), "{ pas du json");
  const j = spawnSync(process.execPath, [path.join(dir, "scripts/audit-registre-residus.js"), "--json"], { encoding: "utf8" });
  assert.equal(j.status, 1);
  assert.match(JSON.parse(j.stdout).erreurs[0], /illisible/);
  fs.rmSync(dir, { recursive: true, force: true });
});
