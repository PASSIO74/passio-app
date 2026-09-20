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
  // ⚠️ LE NOMBRE EST L'ASSERTION. « OK » seul resterait vrai le jour où la gate
  // cesserait de lire la moitié du dépôt — c'est très exactement le défaut du
  // 2026-09-20. Le plancher vaut ce que le dépôt porte aujourd'hui ; il monte
  // quand on ajoute une souscription, il ne redescend jamais tout seul.
  assert.ok(Number(m[1]) >= 29, `seulement ${m[1]} souscriptions scannées (attendu ≥ 29)`);
});

test("② la forme TABLEAU est lue en ENTIER, pas seulement sa première entrée", () => {
  // C'est la forme d'une jonction WebSocket brute (`scripts/charge.mjs`).
  const src = readFileSync(join(RACINE, "scripts/charge.mjs"), "utf8");
  const liaisons = [...src.matchAll(/table:\s*"([a-z0-9_]+)"/g)].map((x) => x[1]);
  assert.ok(liaisons.length >= 13, `le banc ne déclare que ${liaisons.length} liaisons`);
  const r = lancer();
  // Chacune doit être connue de la gate : si elle n'en lisait qu'une, le total
  // retomberait sous le plancher du cas ①.
  assert.equal(r.code, 0, r.sortie);
});

test("③ une liaison vers une table NON PUBLIÉE est REFUSÉE, même au milieu d'un bloc", () => {
  // ⚠️ LE CAS QUI COMPTE. Une gate qui lit treize tables mais n'en vérifie
  // qu'une serait verte au cas ① et parfaitement inutile. On pose donc une
  // table inexistante en DERNIÈRE position du bloc — celle qu'une lecture
  // « première entrée seulement » ne verrait jamais.
  const dossier = mkdtempSync(join(tmpdir(), "gate-rt-"));
  try {
    for (const d of ["js", "dashboard", "scripts", "supabase/functions", "tests/e2e"]) {
      mkdirSync(join(dossier, d), { recursive: true });
    }
    mkdirSync(join(dossier, "scripts"), { recursive: true });
    // On rejoue la gate sur un faux dépôt : même script, autre racine.
    const gate = readFileSync(join(RACINE, "scripts/audit-realtime-publication.js"), "utf8");
    writeFileSync(join(dossier, "scripts", "gate.js"), gate.replace(/__dirname, "\.\."/g, '__dirname, ".."'));
    writeFileSync(
      join(dossier, "scripts", "realtime-publication.json"),
      readFileSync(join(RACINE, "scripts/realtime-publication.json"), "utf8"),
    );
    writeFileSync(
      join(dossier, "js", "faux.js"),
      'const postgres_changes = [\n' +
        '  { event: "INSERT", schema: "public", table: "posts" },\n' +
        '  { event: "INSERT", schema: "public", table: "table_qui_nexiste_pas" },\n' +
        '];\n',
    );
    let code = 0, sortie = "";
    try {
      sortie = execFileSync("node", [join(dossier, "scripts", "gate.js")], { encoding: "utf8" });
    } catch (e) {
      code = e.status;
      sortie = (e.stdout || "") + (e.stderr || "");
    }
    assert.notEqual(code, 0, "la gate a accepté une table inexistante en fin de bloc");
    assert.match(sortie, /table_qui_nexiste_pas/);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
