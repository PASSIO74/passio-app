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

const RACINE = new URL("../..", import.meta.url).pathname;

// Rejoue la gate sur un dépôt FABRIQUÉ : même script, arborescence minimale.
// ⚠️ La gate résout ses racines depuis `__dirname` : il suffit de la COPIER dans
// le `scripts/` du faux dépôt. (Une première version y ajoutait un
// `gate.replace(/__dirname, "\.\."/g, ...)` — un remplacement IDENTIQUE, donc
// un no-op présenté comme un ajustement de racine : du code mort trompeur.)
function surDepotFabrique(fichiers) {
  const dossier = mkdtempSync(join(tmpdir(), "gate-rt-"));
  try {
    for (const d of ["js", "dashboard", "scripts", "supabase/functions", "tests/e2e"]) {
      mkdirSync(join(dossier, d), { recursive: true });
    }
    writeFileSync(
      join(dossier, "scripts", "audit-realtime-publication.js"),
      readFileSync(join(RACINE, "scripts/audit-realtime-publication.js"), "utf8"),
    );
    writeFileSync(
      join(dossier, "scripts", "realtime-publication.json"),
      readFileSync(join(RACINE, "scripts/realtime-publication.json"), "utf8"),
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
  // ⚠️ LE NOMBRE EST L'ASSERTION — « OK » seul resterait vrai le jour où la gate
  // cesserait de lire la moitié du dépôt, le défaut du 2026-09-20.
  // ⚠️ MAIS LE PLANCHER NE DOIT PAS ROUGIR SUR UN INNOCENT. Le compte du jour
  // est 28, dont UN FANTÔME : `js/app-08-ui-modals-tour.js:6264` est un
  // COMMENTAIRE qui contient le marqueur, et sa fenêtre de 400 caractères
  // attrape la table de la ligne 6267. Reformuler ce commentaire ferait tomber
  // le compte à 27 sans qu'aucune souscription n'ait bougé — et un verrou qui
  // rougit sur un innocent finit par être désarmé.
  // ⚠️ LE PLANCHER EST UN GARDE-FOU DE VOLUME, PAS LE VERROU DÉCISIF — c'est le
  // cas ② qui mesure exactement, sur un dépôt fabriqué. Ici on veut seulement
  // qu'un effondrement se voie, SANS rougir sur un innocent : le compte du jour
  // est 27, dont UN FANTÔME (`app-08:6264` est un commentaire qui contient le
  // marqueur et dont la fenêtre attrape la table de la ligne 6267), donc 26
  // réelles ; et il bouge à chaque souscription ajoutée ou retirée du produit —
  // `telemetry_events` vient d'en retirer une le 2026-09-20. 20 est sous tout
  // compte plausible et au-dessus de ce que laisserait la régression : si la
  // branche « bloc » cassait, `charge.mjs` retomberait de 12 liaisons à 1 et le
  // total à ~16.
  assert.ok(Number(m[1]) >= 20, `seulement ${m[1]} souscriptions scannées (attendu ≥ 20)`);
});

test("② la forme TABLEAU est lue en ENTIER — le compte est EXACTEMENT la taille du bloc", () => {
  // ⚠️ LA PREMIÈRE RÉDACTION DE CE CAS NE VERROUILLAIT RIEN : elle comptait les
  // `table:` du banc puis n'assertait que `code === 0` — c'est-à-dire ce que le
  // cas ① mesure déjà. Neutraliser la branche « bloc » l'aurait laissé VERT.
  // On mesure donc le compte sur un dépôt FABRIQUÉ dont on connaît la réponse :
  // un seul fichier, un seul bloc, toutes les tables publiées. Si la gate ne
  // lisait que la première entrée, elle en annoncerait 1 au lieu de N.
  const publiees = JSON.parse(
    readFileSync(join(RACINE, "scripts/realtime-publication.json"), "utf8"),
  );
  const tables = publiees.publiees.filter((x) => typeof x === "string");
  assert.ok(tables.length >= 5, "liste des tables publiées illisible : " + JSON.stringify(publiees).slice(0, 200));

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
  const publiees = JSON.parse(
    readFileSync(join(RACINE, "scripts/realtime-publication.json"), "utf8"),
  ).publiees;
  const bloc =
    "const postgres_changes = [\n" +
    publiees.map((t) => `  { event: "INSERT", schema: "public", table: "${t}" },`).join("\n") +
    '\n  { event: "INSERT", schema: "public", table: "table_qui_nexiste_pas" },\n];\n';
  const r = surDepotFabrique({ "js/faux.js": bloc });
  assert.notEqual(r.code, 0, "la gate a accepté une table inexistante en fin de bloc");
  assert.match(r.sortie, /table_qui_nexiste_pas/);
});
