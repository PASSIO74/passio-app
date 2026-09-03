#!/usr/bin/env node

/**
 * Pointeur — ce script n'applique AUCUNE migration, et n'en a jamais appliqué.
 *
 * Sa version d'origine annonçait « No need for dashboard or psql, just Node.js »,
 * puis constatait qu'elle tenait la clé ANON — laquelle ne peut ni ALTER TABLE ni
 * CREATE POLICY — et sortait en 1. Elle promettait donc exactement ce qu'elle ne
 * faisait pas : un leurre coûteux, puisqu'on ne découvrait l'impasse qu'après
 * l'avoir lancée, au moment précis où l'on cherchait à appliquer une migration.
 *
 * Le DDL ne passe pas par le SDK. ADR-012 fixe les canaux : la lecture par le
 * connecteur claude.ai (`read_only=true`), l'écriture de DONNÉES par PostgREST
 * via `configAdmin()`, et l'écriture de STRUCTURE — les migrations — par psql ou
 * par le SQL Editor. Ce fichier ne fait que renvoyer vers les deux derniers.
 *
 * Voir .passio/adr/ADR-012-canal-acces-base-de-donnees.md
 *      docs/APPLIQUER_MIGRATION_PASSIONS.md (chemins A et B)
 */

const fichier = process.argv[2];

console.error("Ce script n'applique aucune migration : le DDL ne passe pas par le SDK Supabase.");
console.error("");
console.error("  Chemin A — depuis un ordinateur (recommandé)");
console.error(`      psql "$DATABASE_URL" -f migrations/${fichier || "<migration>.sql"}`);
console.error("");
console.error("  Chemin B — depuis un téléphone");
console.error("      Tableau de bord Supabase → Project → SQL Editor → New query,");
console.error("      coller le contenu du fichier, puis Run.");
console.error("");
console.error("  Chemin C — un secret SUPABASE_DB_URL en CI : REFUSÉ délibérément.");
console.error("      Il donnerait à la CI le pouvoir d'écrire la structure de la production.");
console.error("");
console.error("Détail et retour arrière : docs/APPLIQUER_MIGRATION_PASSIONS.md");
console.error("Décision et interdits    : .passio/adr/ADR-012-canal-acces-base-de-donnees.md");

// Sortie non nulle : rien ne doit prendre ce pointeur pour une migration appliquée.
process.exit(1);
