#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// APPLIQUER UNE MIGRATION EN PRODUCTION — canal ③ d'ADR-012, sans copier-coller
//
//   node scripts/appliquer-migration.mjs migrations/<fichier>.sql [--verifier]
//
// Ce script envoie le fichier à l'API de gestion Supabase
// (`POST /v1/projects/<ref>/database/query`) — c'est très exactement l'endpoint
// que l'éditeur SQL du tableau de bord appelle quand on clique « Run ». Même
// canal, même rôle (`postgres`), même transaction que le coller à la main ;
// seule la main change. Demandé par Benjamin le 2026-09-14 (« prend la main sur
// un max de choses ») après six migrations collées à la main en un jour.
//
// CE QU'IL EXIGE, et pourquoi :
//   · le jeton personnel de la CLI Supabase (`~/.supabase/access-token`, posé
//     par `supabase login`) ou `SUPABASE_ACCESS_TOKEN` — JAMAIS la clé
//     `service_role`, qui ne sait pas parler à l'API de gestion ;
//   · la référence du projet lié (`supabase/.temp/project-ref`) ou
//     `SUPABASE_PROJECT_REF` ;
//   · un fichier SOUS `migrations/`, qui commence par `begin;` et finit par
//     `commit;` — une migration de ce dépôt est UNE transaction, rejouable,
//     avec un tableau de verdict : c'est ce tableau que le script imprime, et
//     c'est lui qu'on lit, pas un « OK » du transport ;
//   · un poste, jamais la CI (`GITHUB_ACTIONS` posé → refus) : ADR-012
//     interdit le DDL depuis la CI, et le jeton personnel n'y existe pas.
//
// ⚠️ CE QUE LE VERDICT NE DIT PAS : il ne certifie que ce que SA version
// connaît (fiche « search_path figé » : un fichier miroir périmé imprime OK sur
// tout). Après application, MESURER l'état en base (canal ①), pas le tableau.
// `--verifier` n'envoie rien : il lit le fichier et dit s'il est envoyable.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { homedir } from "node:os";

const args = process.argv.slice(2);
const verifierSeulement = args.includes("--verifier");
const fichier = args.find((a) => !a.startsWith("--"));

function echec(msg) { console.error("❌ " + msg); process.exit(2); }

if (process.env.GITHUB_ACTIONS) echec("jamais depuis la CI (ADR-012, canal ③) — ce script s'exécute sur un poste.");
if (!fichier) echec("usage : node scripts/appliquer-migration.mjs migrations/<fichier>.sql [--verifier]");

const racine = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const chemin = resolve(fichier);
const rel = relative(racine, chemin).split(sep).join("/");
if (!rel.startsWith("migrations/") || !rel.endsWith(".sql")) echec("le fichier doit être un .sql sous migrations/ (reçu : " + rel + ")");
if (!existsSync(chemin)) echec("fichier introuvable : " + chemin);

const sql = readFileSync(chemin, "utf8");
const corps = sql.replace(/--[^\n]*/g, "").trim().toLowerCase();
if (!corps.startsWith("begin;")) echec("la migration doit commencer par `begin;` (une transaction, rejouable).");
if (!corps.endsWith("commit;")) echec("la migration doit finir par `commit;`.");
if (/\bvacuum\b/.test(corps)) echec("VACUUM ne vit pas dans une transaction : à passer en second coller, à part.");

function lireJeton() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const p = resolve(homedir(), ".supabase", "access-token");
  if (existsSync(p)) return readFileSync(p, "utf8").trim();
  return null;
}
function lireRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF.trim();
  const p = resolve(racine, "supabase", ".temp", "project-ref");
  if (existsSync(p)) return readFileSync(p, "utf8").trim();
  return null;
}
const jeton = lireJeton();
const ref = lireRef();
if (!jeton) echec("aucun jeton : `supabase login` sur ce poste, ou SUPABASE_ACCESS_TOKEN.");
if (!ref) echec("aucun projet lié : `supabase link`, ou SUPABASE_PROJECT_REF.");
if (!/^sbp_/.test(jeton)) echec("le jeton ne ressemble pas à un jeton personnel (`sbp_…`) — jamais la clé service_role ici.");

console.log("migration : " + rel + " (" + sql.length + " caractères) → projet " + ref);
if (verifierSeulement) { console.log("✅ envoyable (--verifier : rien n'a été envoyé)."); process.exit(0); }

const reponse = await fetch("https://api.supabase.com/v1/projects/" + ref + "/database/query", {
  method: "POST",
  headers: { Authorization: "Bearer " + jeton, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const texte = await reponse.text();
if (!reponse.ok) echec("l'API a refusé (" + reponse.status + ") : " + texte.slice(0, 600));

let lignes = [];
try { lignes = JSON.parse(texte); } catch (e) { echec("réponse illisible : " + texte.slice(0, 300)); }
if (!Array.isArray(lignes) || !lignes.length) {
  console.log("⚠️ aucune ligne de verdict rendue — la migration a-t-elle un tableau final ? Mesurer l'état en base.");
  process.exit(0);
}
console.log("\nVERDICT (" + lignes.length + " ligne" + (lignes.length > 1 ? "s" : "") + ") :");
const cles = Object.keys(lignes[0]);
for (const l of lignes) console.log("  " + cles.map((k) => String(l[k])).join("  |  "));
const rouges = lignes.filter((l) => Object.values(l).some((v) => /ECHEC|anomalie/i.test(String(v))));
if (rouges.length) { console.log("\n❌ " + rouges.length + " ligne(s) en ECHEC — la transaction a pourtant été validée : lire l'état en base."); process.exit(1); }
console.log("\n✅ appliquée. Maintenant : mesurer l'état en base (canal ①), pas ce tableau.");
