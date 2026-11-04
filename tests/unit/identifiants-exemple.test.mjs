// R31 (2026-11-04) — la liste des identifiants d'EXEMPLE de la base est celle du client.
//
// `migrations/migration_publications_supprimees_2026-11-04.sql` ne laisse publique une
// cible ABSENTE (aucune ligne `posts`, aucune activité) que si son identifiant est un
// exemple : `public.est_identifiant_exemple(id)`, une expression régulière FERMÉE. Si le
// client fabrique demain un exemple qui n'y entre pas, les commentaires qu'on y écrit ne
// sont plus lisibles que par leur auteur — en silence. Et si un identifiant de contenu RÉEL
// y entrait, une publication supprimée qui le porte redeviendrait publique : le défaut R31.
// Ce test confronte l'expression, lue dans la migration, aux deux sources :
//   ① tout ce que `buildSeed()` (app-01) et `SEED_REEL_VIDEOS` (app-05) fabriquent y entre
//      — publications, bobines, activités ;
//   ② rien de ce que les générateurs du contenu RÉEL fabriquent n'y entre — `uid()`
//      (app-02), `"reel_" + uid()`, `"post_" + Date.now() + "_" + …`, et les cibles
//      `c_`, `ci_`, `ec_`, `srep_` ;
//   ③ le format « réel » de la purge du passé (bloc ③ de la migration) couvre ces
//      générateurs et aucun exemple : la purge n'efface jamais un exemple ;
//   ④ les représentants que le verdict de la migration éprouve existent bien dans le seed
//      (un verdict sur des identifiants fantômes ne prouverait rien).
// Mutations éprouvées : un exemple de plus dans le seed (`px1`), une famille retirée de
// l'expression, `uid()` qui fabriquerait `p…` : chacune fait rougir ce test.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const MIGRATION = "migrations/migration_publications_supprimees_2026-11-04.sql";
const sql = fs.readFileSync(MIGRATION, "utf8");

/** L'expression d'`est_identifiant_exemple`, telle que la base l'appliquera (POSIX ⊂ JS ici). */
function expressionExemples() {
  const corps = sql.slice(sql.indexOf("create or replace function public.est_identifiant_exemple(_id text)"));
  const m = corps.match(/select coalesce\(_id ~ '([^']+)', false\)/);
  assert.ok(m, "expression d'est_identifiant_exemple introuvable dans la migration");
  return new RegExp(m[1]);
}
/** Le format « réel » de la purge du passé (bloc ③). */
function expressionReel() {
  const m = sql.match(/forme\s+constant text := '([^']+)';/);
  assert.ok(m, "format réel de la purge introuvable dans la migration");
  return new RegExp(m[1]);
}

/** `buildSeed()` d'app-01, exécuté dans un bac : le même code que le navigateur. */
function seed() {
  const src = fs.readFileSync("js/app-01-diag-seed.js", "utf8");
  const noop = () => {};
  const el = new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => "" : el), apply: () => el, set: () => true });
  const ctx = {
    console, Math, Date, JSON, Object, Array, String, Number, Set, Map, RegExp, Error, parseInt, parseFloat, isFinite, isNaN,
    encodeURIComponent, decodeURIComponent, setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    navigator: { userAgent: "node" }, location: { search: "", hash: "", href: "http://x/" },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, createElement: () => el, body: el, documentElement: el, readyState: "complete" },
    addEventListener: noop,
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: "app-01-diag-seed.js" });
  return vm.runInContext("buildSeed()", ctx);
}
/** Les bobines d'exemple d'app-05 (`SEED_REEL_VIDEOS`, un littéral), évaluées telles quelles. */
function bobinesExemple() {
  const src = fs.readFileSync("js/app-05-config-profil.js", "utf8");
  const debut = src.indexOf("const SEED_REEL_VIDEOS = [");
  assert.ok(debut > 0, "SEED_REEL_VIDEOS introuvable dans app-05");
  const ouvert = src.indexOf("[", debut);
  const fin = src.indexOf("\n];", ouvert);
  return vm.runInNewContext("(" + src.slice(ouvert, fin + 2) + ")", { Date });
}
/** `uid()` d'app-02, prise à la SOURCE (si elle change, ce test la suit). */
function uidDuClient() {
  const src = fs.readFileSync("js/app-02-state-utils.js", "utf8");
  const m = src.match(/function uid\(\) \{[^\n]*\}/);
  assert.ok(m, "function uid() introuvable dans app-02");
  return vm.runInNewContext("(" + m[0] + ")", { Math, Date });
}

test("① tout exemple que le client fabrique entre dans est_identifiant_exemple — publications, bobines, activités", () => {
  const re = expressionExemples();
  const s = seed();
  const bobines = bobinesExemple();
  assert.ok(s.posts.length > 400, "buildSeed() rend ses publications (" + s.posts.length + ")");
  assert.ok(s.events.length > 30, "…et ses activités (" + s.events.length + ")");
  assert.ok(bobines.length >= 20, "…et SEED_REEL_VIDEOS ses bobines (" + bobines.length + ")");
  const ids = [...s.posts.map((p) => p.id), ...s.events.map((e) => e.id), ...bobines.map((r) => r.id)];
  const hors = ids.filter((id) => !re.test(id));
  assert.deepEqual(hors, [], "exemples dont les commentaires deviendraient illisibles pour les autres");
});

test("② aucun identifiant de contenu RÉEL n'est un exemple — uid(), bobines, partages, cibles de commentaires", () => {
  const re = expressionExemples();
  const uid = uidDuClient();
  // Les générateurs, vérifiés à la SOURCE : ce test échantillonne ce que le client fabrique vraiment.
  const sources = ["js/app-03-posts-vlogs.js", "js/app-04-comments-shop.js", "js/app-05-config-profil.js", "js/app-07-ia-explore-irl.js", "js/app-08-ui-modals-tour.js"]
    .map((f) => fs.readFileSync(f, "utf8")).join("\n");
  assert.match(sources, /id: "reel_" \+ uid\(\)/, "bobine réelle : \"reel_\" + uid()");
  assert.match(sources, /"post_" \+ Date\.now\(\) \+ "_" \+ Math\.random\(\)\.toString\(36\)\.substr\(2, 9\)/, "partage : post_<ms>_<9>");
  assert.match(sources, /"ec_" \+ uid\(\)/, "commentaire d'activité : ec_ + uid()");
  assert.match(sources, /"c_" \+ uid\(\)/, "commentaire : c_ + uid()");
  const reels = [];
  for (let i = 0; i < 3000; i++) {
    const u = uid();
    reels.push(u, "reel_" + u, "post_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9), "c_" + u, "ci_" + u, "ec_" + u, "srep_" + new Date().toISOString());
  }
  // Les formes mesurées en production (canal ①, 2026-11-04) : 17, 22 et 28 caractères.
  reels.push("xioabgjyemqvdht01", "reel_xagp0123456789abcd", "post_1730000000000_abc123def");
  const pris = [...new Set(reels.filter((id) => re.test(id)))];
  assert.deepEqual(pris, [], "un contenu réel supprimé redeviendrait public par la branche des exemples");
});

test("③ le format « réel » de la purge couvre les générateurs du client et AUCUN exemple", () => {
  const reel = expressionReel();
  const uid = uidDuClient();
  const s = seed();
  const exemples = [...s.posts.map((p) => p.id), ...s.events.map((e) => e.id), ...bobinesExemple().map((r) => r.id)];
  assert.deepEqual(exemples.filter((id) => reel.test(id)), [], "la purge du passé effacerait des commentaires d'exemples");
  const manques = [];
  for (let i = 0; i < 3000; i++) {
    const u = uid();
    for (const id of [u, "reel_" + u, "post_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)]) if (!reel.test(id)) manques.push(id);
  }
  assert.deepEqual([...new Set(manques)].slice(0, 5), [], "un orphelin de ce format échapperait à la purge du passé");
  // Ni un live, ni une étape de carnet, ni l'ancien exemple p_vlog_ : la purge ne les touche pas.
  for (const id of ["live_xr31banclive0001", "carnetstep:xr31:1", "p_vlog_lisbonne"]) assert.equal(reel.test(id), false, id);
});

test("④ les représentants que le verdict éprouve existent dans le seed — et l'ancien p_vlog_ n'en est plus un", () => {
  const re = expressionExemples();
  const s = seed();
  const posts = new Set(s.posts.map((p) => p.id));
  const events = new Set(s.events.map((e) => e.id));
  const bobines = new Set(bobinesExemple().map((r) => r.id));
  for (const id of ["p1", "pm1", "pn_trail_1", "pac_music", "p_ev_jam", "p_ev2_e9"]) assert.ok(posts.has(id), id + " absent de buildSeed()");
  assert.ok(events.has("e1"), "e1 absent de buildSeed()");
  assert.ok(bobines.has("reel_seed_cuisine_1"), "reel_seed_cuisine_1 absent de SEED_REEL_VIDEOS");
  // Les représentants sont bien dans le bloc ④ du verdict.
  for (const id of ["'p1'", "'pm1'", "'pn_trail_1'", "'pac_music'", "'p_ev_jam'", "'p_ev2_e9'", "'reel_seed_cuisine_1'", "'e1'"]) {
    assert.ok(sql.includes("public.post_is_visible(" + id + ")"), "le verdict n'éprouve plus " + id);
  }
  // L'ancien carnet d'exemple n'est plus fabriqué : il n'est plus un exemple (ses lignes ne sont lisibles que par leur auteur).
  assert.equal([...posts].some((id) => id.startsWith("p_vlog_")), false, "le client fabrique de nouveau des p_vlog_ : les rendre exemples");
  assert.equal(re.test("p_vlog_marrakech"), false);
});
