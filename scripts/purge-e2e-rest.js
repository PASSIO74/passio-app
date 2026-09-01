#!/usr/bin/env node
/**
 * PURGE DES COMPTES e2e — chemin REST, pour la CI (2026-09-01)
 *
 * ⚠️ POURQUOI CE SECOND CHEMIN EXISTE, alors que le SQL fait déjà le travail.
 * `scripts/purge-e2e-accounts.js` passe par `supabase db query --linked`, donc
 * par la CLI Supabase LIÉE au projet. En CI, elle n'est ni installée ni liée :
 * la purge s'y solde par un avertissement, et le teardown Playwright ignore les
 * avertissements par conception. Résultat mesuré le 2026-09-01 : les comptes
 * créés par `authz-critical`, `blocage-acces` et `user-state-horodatage` — de
 * VRAIS comptes, sur la VRAIE prod — n'étaient JAMAIS supprimés. Ils se sont
 * accumulés jusqu'à ce que le post semé par les tests ne tombe plus dans les 20
 * premières cartes du fil ; `main` est passé au rouge et le déploiement
 * production a été sauté, sans que rien ne désigne la cause.
 *
 * `tests/e2e/compte-e2e.js` le confirme sans ambiguïté : il exporte
 * `creerCompteE2E` et AUCUNE fonction de suppression.
 *
 * ⚠️ CE CHEMIN N'EXIGE AUCUN NOUVEAU SECRET. Il réutilise `SUPABASE_SERVICE_ROLE_KEY`,
 * déjà présent en CI pour créer ces mêmes comptes. Installer et lier la CLI
 * aurait demandé deux secrets de plus (jeton d'accès + mot de passe de la base),
 * donc deux surfaces de plus, pour le même résultat.
 *
 * ⚠️ LE SQL RESTE LA SOURCE DE VÉRITÉ. Ce script en est un PORTAGE, et l'ordre
 * de suppression y est identique — les clés étrangères ne pardonnent pas. Un
 * test (`tests/e2e/purge-rest-parite.spec.js`) compare les deux listes et
 * échoue dès qu'elles divergent : sans lui, ajouter une table au SQL laisserait
 * ce script en arrière, en silence, et la purge redeviendrait partielle.
 *
 *   node scripts/purge-e2e-rest.js            # applique
 *   node scripts/purge-e2e-rest.js --simuler  # compte, n'efface rien
 */
"use strict";
const { configAdmin, DOMAINE_E2E } = require("../tests/e2e/compte-e2e.js");

const SIMULER = process.argv.indexOf("--simuler") >= 0;

// ⚠️ ORDRE REPRIS DU SQL, DES ENFANTS VERS LES PARENTS. Le remonter d'un cran
// suffit à faire échouer une suppression en 23503 — et PostgREST, lui, ne
// s'arrête pas : il rendrait un succès partiel qu'on prendrait pour un succès.
// `colonnes` : les colonnes qui portent l'identifiant du compte.
const TABLES = [
  { table: "conv_messages",        colonnes: ["from_id"] },
  { table: "conv_reads",           colonnes: ["user_id"] },
  { table: "conv_members",         colonnes: ["user_id"] },
  { table: "notifications",        colonnes: ["user_id", "from_id"] },
  { table: "comment_interactions", colonnes: ["user_id"] },
  { table: "post_comments",        colonnes: ["author_id"] },
  { table: "post_likes",           colonnes: ["user_id"] },
  { table: "follows",              colonnes: ["follower_id", "following_id"] },
  { table: "posts",                colonnes: ["author_id"] },
  { table: "stories",              colonnes: ["author_id"] },
  { table: "event_attendees",      colonnes: ["user_id"] },
  { table: "event_reactions",      colonnes: ["user_id"] },
  { table: "events",               colonnes: ["author_id"] },
  { table: "cdv_live_comments",    colonnes: ["author_id"] },
  { table: "cdv_live_reactions",   colonnes: ["user_id"] },
  { table: "cdv_live_followers",   colonnes: ["user_id"] },
  { table: "cdv_lives",            colonnes: ["author_id"] },
  { table: "blocks",               colonnes: ["blocker_id", "blocked_id"] },
  { table: "push_subscriptions",   colonnes: ["user_id"] },
  { table: "user_state",           colonnes: ["user_id"] },
  { table: "profiles",             colonnes: ["id"] },
];

// Une URL trop longue est refusée bien avant PostgREST. On découpe.
const PAQUET = 40;

function entetes(cfg) {
  return {
    apikey: cfg.cle,
    Authorization: `Bearer ${cfg.cle}`,
    "Content-Type": "application/json",
  };
}

/** Tous les comptes du domaine de test. L'API d'administration pagine. */
async function comptesE2E(cfg) {
  const ids = [];
  for (let page = 1; page <= 50; page++) {
    const r = await fetch(`${cfg.url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: entetes(cfg) });
    if (!r.ok) throw new Error(`liste des comptes : ${r.status} ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    const lot = d.users || d || [];
    if (!lot.length) break;
    for (const u of lot) {
      // ⚠️ ON EXIGE LE SUFFIXE EXACT, jamais un `includes`. `DOMAINE_E2E` vaut
      // « passio-e2e.test » : un `includes` supprimerait aussi
      // « vrai@passio-e2e.test.example.com ». Le domaine est fictif, mais la
      // règle qui protège les comptes réels ne se relâche pas pour autant.
      if (typeof u.email === "string" && u.email.toLowerCase().endsWith("@" + DOMAINE_E2E)) ids.push(u.id);
    }
    if (lot.length < 200) break;
  }
  return ids;
}

/** Filtre PostgREST : `in.(…)` sur une colonne, `or=(…)` sur plusieurs. */
function filtre(colonnes, lot) {
  const liste = "(" + lot.join(",") + ")";
  if (colonnes.length === 1) return `${colonnes[0]}=in.${liste}`;
  return "or=(" + colonnes.map((c) => `${c}.in.${liste}`).join(",") + ")";
}

async function supprimer(cfg, table, colonnes, lot) {
  const url = `${cfg.url}/rest/v1/${table}?${filtre(colonnes, lot)}`;
  if (SIMULER) {
    const r = await fetch(url + "&select=1", { headers: Object.assign(entetes(cfg), { Prefer: "count=exact", Range: "0-0" }) });
    const cr = r.headers.get("content-range") || "";
    return Number((cr.split("/")[1] || "0")) || 0;
  }
  const r = await fetch(url, { method: "DELETE", headers: Object.assign(entetes(cfg), { Prefer: "return=representation" }) });
  if (!r.ok) {
    const t = await r.text();
    // Une table absente n'est pas une erreur : le schéma évolue (les tables
    // `cdv_*` sont conservées mais plus écrites depuis ADR-011).
    if (r.status === 404 || /does not exist|schema cache/i.test(t)) return 0;
    throw new Error(`${table} : ${r.status} ${t.slice(0, 200)}`);
  }
  const lignes = await r.json();
  return Array.isArray(lignes) ? lignes.length : 0;
}

async function supprimerCompte(cfg, id) {
  const r = await fetch(`${cfg.url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: entetes(cfg) });
  if (!r.ok && r.status !== 404) throw new Error(`compte ${id.slice(0, 8)}… : ${r.status}`);
}

(async function () {
  let cfg;
  try { cfg = configAdmin(); } catch (e) {
    // ⚠️ ÉCHEC BRUYANT, MAIS NON BLOQUANT — c'est l'appelant qui décide. Un
    // nettoyage manquant ne doit pas faire échouer une suite verte, mais il ne
    // doit pas non plus passer inaperçu : c'est le silence qui a coûté cher.
    console.warn(`[purge:rest] impossible : ${e && e.message}`);
    process.exitCode = 1;
    return;
  }

  const ids = await comptesE2E(cfg);
  if (!ids.length) { console.log("[purge:rest] aucun compte de test — rien à faire."); return; }
  console.log(`[purge:rest] ${ids.length} compte(s) de test${SIMULER ? " (simulation)" : ""}`);

  let total = 0;
  for (const { table, colonnes } of TABLES) {
    let n = 0;
    for (let i = 0; i < ids.length; i += PAQUET) {
      n += await supprimer(cfg, table, colonnes, ids.slice(i, i + PAQUET));
    }
    if (n) { console.log(`  ${String(n).padStart(5)}  ${table}`); total += n; }
  }

  if (!SIMULER) for (const id of ids) await supprimerCompte(cfg, id);

  const restants = SIMULER ? ids.length : (await comptesE2E(cfg)).length;
  console.log(`[purge:rest] ${total} ligne(s) ${SIMULER ? "concernées" : "supprimées"} · comptes restants : ${restants}`);
  // Comme pour le chemin SQL : un reliquat est un ÉCHEC, pas un détail.
  if (!SIMULER && restants !== 0) process.exitCode = 1;
})().catch((e) => { console.error("[purge:rest] ❌ " + (e && e.message)); process.exitCode = 1; });
