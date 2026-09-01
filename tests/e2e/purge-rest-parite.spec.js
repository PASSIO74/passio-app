// ══════════════════════════════════════════════════════════════════════════
// PARITÉ ENTRE LES DEUX CHEMINS DE PURGE (2026-09-01)
//
// Il existe deux façons de supprimer les comptes de test :
//   · `scripts/purge_e2e_accounts.sql`  — la SOURCE DE VÉRITÉ, exécutée par la
//     CLI Supabase liée (poste de développement) ;
//   · `scripts/purge-e2e-rest.js`       — son PORTAGE en REST + API
//     d'administration, le seul utilisable en CI, où la CLI n'est ni installée
//     ni liée.
//
// ⚠️ POURQUOI CE TEST EXISTE. Ajouter une table au SQL sans l'ajouter au portage
// laisserait la purge de CI PARTIELLE — et une purge partielle est exactement ce
// qui a mis `main` au rouge le 2026-09-01 : des comptes de test se sont
// accumulés en production jusqu'à pousser le post semé par les tests hors des
// vingt premières cartes du fil, et rien, nulle part, ne désignait la cause.
//
// La dérive serait SILENCIEUSE : les deux scripts continueraient de rendre un
// succès. C'est pour ce genre de défaut muet qu'un test vaut mieux qu'un
// commentaire.
//
// ⚠️ CE TEST NE TOUCHE NI LA BASE NI LE RÉSEAU. Il ne lit que deux fichiers.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..", "..");
const SQL = fs.readFileSync(path.join(RACINE, "scripts", "purge_e2e_accounts.sql"), "utf8");
const REST = fs.readFileSync(path.join(RACINE, "scripts", "purge-e2e-rest.js"), "utf8");

// `delete from auth.users` est traité par l'API d'administration, pas par REST :
// PostgREST n'expose pas le schéma `auth`. C'est la seule exception légitime.
const tablesSql = [...SQL.matchAll(/^delete from ([\w.]+)/gm)]
  .map((m) => m[1])
  .filter((t) => !t.startsWith("auth."));
const tablesRest = [...REST.matchAll(/\{ table: "(\w+)"/g)].map((m) => m[1]);

test.describe("purge e2e : les deux chemins doivent rester jumeaux", () => {
  test("aucune table du SQL n'est oubliée par le portage REST", () => {
    const oubliees = tablesSql.filter((t) => !tablesRest.includes(t));
    expect(oubliees,
      "ces tables sont purgées par le SQL mais PAS en CI — la purge y serait partielle").toEqual([]);
  });

  test("le portage REST n'invente aucune table absente du SQL", () => {
    // Une table en trop supprimerait en CI ce que le chemin de référence
    // épargne : la CI ne doit jamais être plus destructrice que le SQL relu.
    const inventees = tablesRest.filter((t) => !tablesSql.includes(t));
    expect(inventees, "ces tables sont supprimées en CI sans exister dans le SQL").toEqual([]);
  });

  test("l'ordre de suppression est identique — les clés étrangères l'exigent", () => {
    // ⚠️ L'ORDRE N'EST PAS COSMÉTIQUE. Le SQL va des enfants vers les parents ;
    // remonter une table d'un cran suffit à faire échouer sa suppression en
    // 23503. Et PostgREST, lui, ne s'arrête pas : il rendrait un succès partiel
    // qu'on prendrait pour un succès.
    expect(tablesRest).toEqual(tablesSql);
  });

  test("le portage exige le suffixe exact du domaine de test", () => {
    // ⚠️ Un `includes` au lieu d'un `endsWith` supprimerait aussi un compte
    // « quelqu'un@passio-e2e.test.example.com ». Le domaine est fictif, mais la
    // règle qui protège les comptes réels ne se relâche pas pour autant.
    expect(REST).toContain('endsWith("@" + DOMAINE_E2E)');
    expect(REST).not.toMatch(/email\.(?:toLowerCase\(\))?\s*\.?includes\(/);
  });
});
