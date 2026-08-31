#!/usr/bin/env node
/**
 * MESURE — état réel de `passion_id` dans les cinq tables qui le portent.
 *
 * ⚠️ CE QUE CE SCRIPT EST, ET N'EST PAS.
 *   · LECTURE SEULE, strictement : uniquement des requêtes `HEAD` de comptage.
 *     Aucun INSERT, UPDATE, DELETE ; aucune ligne n'est rapatriée, donc aucun
 *     identifiant de compte, aucun contenu, aucune donnée personnelle ne peut
 *     atteindre le journal de CI — seulement des NOMBRES.
 *   · Il n'ajoute AUCUN mécanisme : il réutilise la connexion déjà prévue en CI
 *     (`configAdmin()`, tests/e2e/compte-e2e.js — URL du projet + secret
 *     `SUPABASE_SERVICE_ROLE_KEY` du dépôt). La clé ne sort jamais du processus :
 *     elle n'est ni affichée, ni écrite dans un artefact.
 *   · Il ne crée AUCUNE fonction RPC. Interroger le catalogue PostgreSQL
 *     (`pg_constraint`) exigerait soit une RPC publique — une porte ouverte sur
 *     la structure de la base pour tout client — soit une connexion psql directe
 *     que la CI n'a pas. La réponse à cette question est donc ailleurs, et elle
 *     est déjà établie : `migrations/SCHEMA_PROD_REFERENCE.sql`, photographié
 *     depuis la VRAIE base par `scripts/schema-baseline.js`, inventorie les
 *     contraintes. Il liste les cinq `*_passion_fk` et AUCUNE contrainte CHECK
 *     dans tout le schéma. Autrement dit : `passion_id` est un `text` nullable,
 *     la base accepte `NULL` partout, et seule la clé étrangère mord — sur un
 *     identifiant inexistant. La politique « obligatoire » de `posts`/`events`
 *     est un invariant PRODUIT tenu par le client, pas une contrainte serveur.
 *
 * Sortie : un tableau de comptes. Le script ne fait PAS échouer la CI — c'est une
 * mesure, pas une barrière ; un rouge ici ne dirait rien sur le code du commit.
 *
 *   node scripts/mesure-passions.js
 */
"use strict";
const { configAdmin } = require("../tests/e2e/compte-e2e.js");

const TABLES = ["posts", "events", "profiles", "stories", "conversations"];

/** Compte les lignes correspondant au filtre PostgREST, sans en rapatrier aucune. */
async function compter(cfg, table, filtre) {
  const url = `${cfg.url}/rest/v1/${table}?select=id${filtre ? "&" + filtre : ""}`;
  const r = await fetch(url, {
    method: "HEAD",
    headers: {
      apikey: cfg.cle,
      Authorization: `Bearer ${cfg.cle}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  if (!r.ok && r.status !== 206) return { erreur: `HTTP ${r.status}` };
  // `content-range: 0-0/1234` — seul le total nous intéresse.
  const cr = r.headers.get("content-range") || "";
  const n = /\/(\d+)$/.exec(cr);
  return n ? { n: Number(n[1]) } : { erreur: "en-tête content-range absent" };
}

(async () => {
  const cfg = configAdmin();
  if (!cfg) {
    // Une mesure absente est dite, pas déguisée en « tout va bien ».
    console.log("MESURE PASSIONS — non exécutée : SUPABASE_SERVICE_ROLE_KEY absent de l'environnement.");
    console.log("  (attendu hors CI et sur une PR d'un dépôt forké ; aucune conclusion n'en découle)");
    process.exit(0);
  }

  // Le référentiel : la liste blanche contre laquelle on mesure. On ne lit que
  // la colonne `id` — la table est publique et ne contient aucune donnée de compte.
  let ids = [];
  try {
    const r = await fetch(`${cfg.url}/rest/v1/passions?select=id`, {
      headers: { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}` },
    });
    if (r.ok) ids = (await r.json()).map((x) => x.id).filter(Boolean);
  } catch (e) {}

  console.log("═══ MESURE `passion_id` — lecture seule, agrégats uniquement ═══");
  console.log("Référentiel `passions` : " + ids.length + " identifiant(s).");
  if (!ids.length) {
    console.log("Référentiel illisible : la mesure des valeurs hors référentiel est impossible.");
  }
  console.log("");
  console.log("table            total     NULL   hors référentiel");
  console.log("───────────────────────────────────────────────────");

  const listeIn = ids.map((i) => `"${i}"`).join(",");
  for (const t of TABLES) {
    const total = await compter(cfg, t, "");
    const nuls = await compter(cfg, t, "passion_id=is.null");
    const hors = ids.length
      ? await compter(cfg, t, `passion_id=not.is.null&passion_id=not.in.(${listeIn})`)
      : { erreur: "—" };
    const c = (x) => (x.erreur ? x.erreur.padStart(8) : String(x.n).padStart(8));
    console.log(`${t.padEnd(15)}${c(total)} ${c(nuls)} ${c(hors)}`);
  }

  console.log("───────────────────────────────────────────────────");
  console.log("Attendu pour « hors référentiel » : 0 partout — la clé étrangère");
  console.log("`*_passion_fk` l'impose depuis son application (~2026-08-17).");
  console.log("« NULL » n'est PAS une anomalie serveur : la colonne est nullable et");
  console.log("aucune contrainte CHECK n'existe (cf. SCHEMA_PROD_REFERENCE.sql).");
  console.log("C'est une mesure de la DETTE de classement, pas d'une violation.");
  process.exit(0);
})().catch((e) => {
  // Un échec de mesure ne casse pas la CI, mais il se voit.
  console.log("MESURE PASSIONS — échec :", (e && e.message) || e);
  process.exit(0);
});
