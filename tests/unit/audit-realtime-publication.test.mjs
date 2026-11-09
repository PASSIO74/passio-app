// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LA GATE REALTIME SAIT-ELLE LIRE CE QU'ELLE PRÉTEND GARDER ?
//
// ⚠️ POURQUOI CE BANC EXISTE. `audit-realtime-publication.js` garde un défaut
// MUET : un `postgres_changes` sur une table absente de la publication passe
// `SUBSCRIBED` et ne reçoit JAMAIS rien — indiscernable de « il ne s'est rien
// passé ». Une gate qui garde un défaut muet ne peut pas, elle, échouer en
// silence : si elle cesse de LIRE une forme d'écriture, elle rend « OK » sur un
// dépôt qu'elle n'a pas vérifié, et c'est pire que pas de gate du tout.
//
// Mesuré le 2026-09-20 : elle ne lisait QU'UNE table par occurrence du
// marqueur. `scripts/charge.mjs` passe ses liaisons en BLOC (une jonction
// WebSocket brute, un seul marqueur pour treize liaisons) : douze sur treize
// étaient donc hors garde, et la gate annonçait « 16 souscriptions scannées »
// pour un dépôt qui en porte 29.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL("../..", import.meta.url));

// Rejoue la gate sur un dépôt FABRIQUÉ : même script, arborescence minimale.
// ⚠️ La gate résout ses racines depuis `__dirname` : il suffit de la COPIER dans
// le `scripts/` du faux dépôt. (Une première version y ajoutait un
// `gate.replace(/__dirname, "\.\."/g, ...)` — un remplacement IDENTIQUE, donc
// un no-op présenté comme un ajustement de racine : du code mort trompeur.)
// ⚠️ Les sondes du vrai dépôt nomment un fichier qui n'existe pas ici : un dépôt fabriqué
// ne porte que celles qu'on lui donne.
// ⚠️ LES TABLES PUBLIÉES D'UN DÉPÔT FABRIQUÉ SONT FABRIQUÉES AUSSI (2026-11-09).
// La liste réelle est VIDE depuis la migration « 📴 » : les cas qui mesurent la
// LECTURE de la gate (un bloc lu en entier, une table refusée en fin de bloc,
// une sonde) n'en dépendent plus — ils portent une liste dont on connaît la
// réponse, de la taille d'avant (neuf).
const TABLES_FABRIQUEES = ["fab_un", "fab_deux", "fab_trois", "fab_quatre", "fab_cinq", "fab_six", "fab_sept", "fab_huit", "fab_neuf"];
function surDepotFabrique(fichiers, sondes = {}, publiees = TABLES_FABRIQUEES) {
  const dossier = mkdtempSync(join(tmpdir(), "gate-rt-"));
  try {
    for (const d of ["js", "dashboard", "scripts", "supabase/functions", "tests/e2e"]) {
      mkdirSync(join(dossier, d), { recursive: true });
    }
    writeFileSync(
      join(dossier, "scripts", "audit-realtime-publication.js"),
      readFileSync(join(RACINE, "scripts/audit-realtime-publication.js"), "utf8"),
    );
    const declare = JSON.parse(readFileSync(join(RACINE, "scripts/realtime-publication.json"), "utf8"));
    writeFileSync(
      join(dossier, "scripts", "realtime-publication.json"),
      JSON.stringify({ ...declare, publiees, publieesSansAbonne: {}, sondesHorsPublication: sondes }),
    );
    for (const [chemin, contenu] of Object.entries(fichiers)) {
      writeFileSync(join(dossier, chemin), contenu);
    }
    try {
      return {
        code: 0,
        sortie: execFileSync("node", [join(dossier, "scripts", "audit-realtime-publication.js")], { encoding: "utf8" }),
      };
    } catch (e) {
      return { code: e.status, sortie: (e.stdout || "") + (e.stderr || "") };
    }
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

function lancer() {
  try {
    return { code: 0, sortie: execFileSync("node", [join(RACINE, "scripts/audit-realtime-publication.js")], { encoding: "utf8" }) };
  } catch (e) {
    return { code: e.status, sortie: (e.stdout || "") + (e.stderr || "") };
  }
}

test("① le dépôt est sain, et la gate le dit avec un COMPTE — pas un simple « OK »", () => {
  const r = lancer();
  assert.equal(r.code, 0, r.sortie);
  const m = /(\d+) souscriptions scannées/.exec(r.sortie);
  assert.ok(m, "la gate ne dit plus combien elle a scanné : " + r.sortie);
  // ⚠️ DEPUIS LE 2026-11-09 (« 📴 »), LE COMPTE QUI COMPTE EST ZÉRO. La
  // publication `supabase_realtime` est VIDE et le produit n'a plus AUCUNE
  // liaison `postgres_changes` : la gate doit le dire en toutes lettres. Une
  // liaison du produit qui reviendrait vers une table non republiée la ferait
  // rougir (cas ③) ; une table republiée sans abonné aussi.
  // L'ancien plancher (« ≥ 25 souscriptions scannées ») gardait le VOLUME de la
  // lecture ; il n'a plus d'objet — c'est le cas ② qui mesure la lecture d'un
  // bloc, sur un dépôt fabriqué dont on connaît la réponse.
  assert.match(r.sortie, /: 0 tables publiées, 0 écoutées,/, "la publication est vide et le produit n'écoute plus aucune table");
  // Restent les sondes VOULUES du verrou de R25 (cas ⑦) : la gate les a lues.
  assert.ok(Number(m[1]) >= 2, `seulement ${m[1]} souscriptions scannées (attendu : au moins les deux sondes de R25)`);
});

test("② la forme TABLEAU est lue en ENTIER — le compte est EXACTEMENT la taille du bloc", () => {
  // ⚠️ LA PREMIÈRE RÉDACTION DE CE CAS NE VERROUILLAIT RIEN : elle comptait les
  // `table:` du banc puis n'assertait que `code === 0` — c'est-à-dire ce que le
  // cas ① mesure déjà. Neutraliser la branche « bloc » l'aurait laissé VERT.
  // On mesure donc le compte sur un dépôt FABRIQUÉ dont on connaît la réponse :
  // un seul fichier, un seul bloc, toutes les tables publiées. Si la gate ne
  // lisait que la première entrée, elle en annoncerait 1 au lieu de N.
  const tables = TABLES_FABRIQUEES;

  const bloc =
    "const postgres_changes = [\n" +
    tables.map((t) => `  { event: "INSERT", schema: "public", table: "${t}" },`).join("\n") +
    "\n];\n";
  const r = surDepotFabrique({ "js/faux.js": bloc });
  assert.equal(r.code, 0, r.sortie);
  const m = /(\d+) souscriptions scannées/.exec(r.sortie);
  assert.ok(m, r.sortie);
  assert.equal(
    Number(m[1]),
    tables.length,
    `bloc de ${tables.length} liaisons lu comme ${m[1]} — la gate n'en lit pas le tout`,
  );
});

test("③ une liaison vers une table NON PUBLIÉE est REFUSÉE, même au milieu d'un bloc", () => {
  // ⚠️ LE CAS QUI COMPTE. Une gate qui LIT treize tables mais n'en VÉRIFIE
  // qu'une serait verte au cas ② et parfaitement inutile. On pose donc la table
  // inexistante en DERNIÈRE position du bloc — celle qu'une lecture
  // « première entrée seulement » ne verrait jamais.
  const publiees = TABLES_FABRIQUEES;
  const bloc =
    "const postgres_changes = [\n" +
    publiees.map((t) => `  { event: "INSERT", schema: "public", table: "${t}" },`).join("\n") +
    '\n  { event: "INSERT", schema: "public", table: "table_qui_nexiste_pas" },\n];\n';
  const r = surDepotFabrique({ "js/faux.js": bloc });
  assert.notEqual(r.code, 0, "la gate a accepté une table inexistante en fin de bloc");
  assert.match(r.sortie, /table_qui_nexiste_pas/);
});

// ── Une sonde : une souscription VOULUE vers une table retirée (R25, cas ④) ─────
const toutesPubliees = () => TABLES_FABRIQUEES;
const blocDesPubliees = () =>
  "const postgres_changes = [\n" +
  toutesPubliees().map((t) => `  { event: "INSERT", schema: "public", table: "${t}" },`).join("\n") +
  "\n];\n";
const liaison = (table) => `canal.on("postgres_changes", { event: "*", schema: "public", table: "${table}" }, cb);\n`;

test("④ une sonde déclarée passe dans SON fichier, et la même table reste refusée ailleurs", () => {
  const sondes = { "tests/e2e/sonde.spec.js": { table_retiree: "prouve que plus rien n'en sort" } };
  const seule = surDepotFabrique({ "js/faux.js": blocDesPubliees(), "tests/e2e/sonde.spec.js": liaison("table_retiree") }, sondes);
  assert.equal(seule.code, 0, seule.sortie);
  assert.match(seule.sortie, /1 sonde\(s\) hors publication/);

  const ailleurs = surDepotFabrique(
    { "js/faux.js": blocDesPubliees() + liaison("table_retiree"), "tests/e2e/sonde.spec.js": liaison("table_retiree") },
    sondes,
  );
  assert.notEqual(ailleurs.code, 0, "la sonde d'une suite a ouvert la même table au produit");
  assert.match(ailleurs.sortie, /table_retiree/);
  assert.match(ailleurs.sortie, /js\/faux\.js/);
  assert.doesNotMatch(ailleurs.sortie, /sonde\.spec\.js/, "le fichier qui déclare sa sonde n'est pas en cause");
});

test("⑤ une sonde sur une AUTRE table du même fichier reste refusée", () => {
  const r = surDepotFabrique(
    { "js/faux.js": blocDesPubliees(), "tests/e2e/sonde.spec.js": liaison("table_retiree") + liaison("autre_table") },
    { "tests/e2e/sonde.spec.js": { table_retiree: "raison" } },
  );
  assert.notEqual(r.code, 0);
  assert.match(r.sortie, /autre_table/);
});

test("⑥ une sonde qui n'existe plus, sans raison, ou sur une table publiée est refusée", () => {
  const disparue = surDepotFabrique({ "js/faux.js": blocDesPubliees() }, { "tests/e2e/sonde.spec.js": { table_retiree: "raison" } });
  assert.notEqual(disparue.code, 0, "une sonde retirée laisse sa déclaration ouverte");
  assert.match(disparue.sortie, /n'existe plus/);

  const muette = surDepotFabrique(
    { "js/faux.js": blocDesPubliees(), "tests/e2e/sonde.spec.js": liaison("table_retiree") },
    { "tests/e2e/sonde.spec.js": { table_retiree: "  " } },
  );
  assert.notEqual(muette.code, 0, "une sonde sans raison passe");
  assert.match(muette.sortie, /ne dit pas sa raison/);

  const publiee = toutesPubliees()[0];
  const revenue = surDepotFabrique(
    { "js/faux.js": blocDesPubliees(), "tests/e2e/sonde.spec.js": liaison(publiee) },
    { "tests/e2e/sonde.spec.js": { [publiee]: "raison" } },
  );
  assert.notEqual(revenue.code, 0, "une sonde sur une table publiée passe : son silence n'est plus prouvé");
  assert.match(revenue.sortie, /vise une table PUBLIÉE/);
});

test("⑦ le vrai dépôt déclare la sonde du verrou de R25, et ces deux tables restent hors publication", () => {
  const declare = JSON.parse(readFileSync(join(RACINE, "scripts/realtime-publication.json"), "utf8"));
  assert.deepEqual(
    Object.keys(declare.sondesHorsPublication["tests/e2e/realtime-poussee-reelle.spec.js"]).sort(),
    ["conv_members", "notifications"],
  );
  for (const t of ["conv_members", "notifications"]) assert.ok(!declare.publiees.includes(t), t + " est republiée");
  const r = lancer();
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /2 sonde\(s\) hors publication/);
});
