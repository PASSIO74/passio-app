#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// LA SÉLECTION DES EDGE FUNCTIONS À DÉPLOYER (2026-11-21) — un push ne vérifie
// et ne déploie que les fonctions dont le code SERVI n'est plus celui du commit.
//
// CE QUI S'EST PASSÉ. `edge-functions.yml` déployait les six fonctions à chaque
// push qui touchait `supabase/functions/**`, et vérifiait d'abord les prérequis
// SQL des six. Du 19 au 21 novembre, le prérequis de `private-media` (« réglage
// désactivé », un contrôle de la phase de préparation) n'était plus vrai en
// production : le push c6efb27 du 20/11, qui ne changeait qu'un module emporté
// par `pilotage`, a été RETENU EN ENTIER (run 44831711346) — cinq fonctions
// retenues pour une sixième que le changement ne concernait pas.
//
// LA FUMÉE ÉPROUVE TOUT CE QUI EST SERVI, PAS SEULEMENT CE QUI PART (relecture
// adverse du 21/11). Une fonction déployée dont la fumée échoue sert bien « ce
// commit » : au run suivant elle est « à jour », et un run relancé verdissait sans
// rien rééprouver. Ce script rend donc aussi `servies` — la révision de chaque
// fonction dont elle se lit — et le workflow éprouve à chaque passage celles qu'il
// ne redéploie pas (à jour, ou retenues), comme celles qu'il vient de déployer :
// un contrat cassé reste rouge tant qu'il est cassé.
//
// CE QUE FAIT CE SCRIPT. Pour chaque fonction, il lit la révision qu'elle SERT
// (l'en-tête `X-Passio-Revision`, posé sur toute réponse : le SHA de son dernier
// déploiement) et demande à git ce qui a changé sous `supabase/` entre ce
// commit-là et celui-ci. La fonction est concernée par :
//   · son dossier ;
//   · un module de la clôture des imports de son `index.ts`
//     (scripts/lib/lecteur-imports.mjs, le lecteur du banc des verrous) ;
//   · tout ce qui n'est attribuable à personne : `supabase/config.toml`, un
//     fichier à la racine des fonctions (carte d'imports, `deno.json`), une donnée
//     de `_shared/` — on ne sait pas qui le lit, donc toutes les fonctions ;
//   · le workflow lui-même (`.github/workflows/edge-functions.yml`) : il porte la
//     FAÇON de déployer (`--no-verify-jwt`, la version de la CLI). Le changer
//     redéploie les six, comme avant — sinon un drapeau retiré ne partirait qu'au
//     prochain changement de code de la fonction.
// Elle ne l'est PAS par le dossier d'une autre fonction, par un module partagé
// qu'elle n'emporte pas, ni par de la documentation (`.md`).
//   · rien ne la concerne      → à jour : ni vérifiée, ni déployée ;
//   · quelque chose la concerne → à déployer ;
//   · on ne sait pas           → à déployer (révision illisible, « dev », commit
//     absent de l'historique, clôture incalculable) : le doute déploie.
//
// POURQUOI L'ÉTAT SERVI, ET PAS LE DIFF DU PUSH. Un diff ne connaît que SON push :
// un run retenu, cassé ou évincé de la file (la concurrence du workflow ne garde
// qu'UN run en attente) emportait son changement avec lui — la fonction restait
// en retard jusqu'au prochain push qui la touche. L'état servi, lui, se relit :
// le run suivant rattrape ce que le précédent n'a pas livré.
//
// ⚠️ UN VIEUX RUN DE PUSH RELANCÉ NE FAIT PAS RECULER UNE FONCTION DONT LA
// RÉVISION SE LIT. Relancer un vieux run rouge (`gh run rerun --failed`)
// redéployait l'ancien code par-dessus le nouveau. Si la révision servie DESCEND
// de ce commit, la fonction est tenue pour à jour. Un retour arrière voulu passe
// par un commit de `main`, puis ce workflow.
// CE QUE CETTE RÈGLE NE COUVRE PAS (relecture adverse du 21/11) : une révision
// illisible sur un vieux run (le doute déploie CE commit, donc l'ancien code), et
// un vieux passage MANUEL relancé (il ne lit pas l'état servi). Les deux
// déployaient déjà l'ancien code avant ce script ; savoir qu'un run n'est plus la
// tête de `main` demande de lire GitHub au moment du run (le clone seul ne le dit
// pas de façon sûre) — reste à faire, consigné dans la fiche du journal.
//
//   node scripts/fonctions-a-deployer.mjs --cible https://<ref>.supabase.co   # un push : par l'état servi
//   node scripts/fonctions-a-deployer.mjs --toutes                            # à la demande : toutes
//   node scripts/fonctions-a-deployer.mjs --fonction pilotage                 # à la demande : une seule
//
// Ce que ça ne fait PAS : écrire quoi que ce soit, ni dans le dépôt ni sur la
// cible (une requête OPTIONS par fonction, sans jeton). Les prérequis SQL de ce
// qui est sélectionné se vérifient ensuite : scripts/verifier-prerequis-fonctions.mjs.
// Banc : tests/unit/deploiement-fonctions.test.mjs.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, appendFileSync, realpathSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { clotureFonctions } from "./lib/lecteur-imports.mjs";

const RACINE = resolve(fileURLToPath(new URL("..", import.meta.url)));
// Ce que git compare : tout ce qui peut entrer dans un déploiement, et le workflow qui dit COMMENT déployer.
const COMPARES = ["supabase/", ".github/workflows/edge-functions.yml"];
const DOSSIER = "supabase/functions";
const PARTAGE = DOSSIER + "/_shared/";
const CODE = /\.(ts|js|mjs)$/;
const SHA = /^[0-9a-f]{40}$/;
const CIBLE = /^https:\/\/[a-z]{20}\.supabase\.co$/;
const DELAI_LECTURE_MS = 15000;
const court = (sha) => String(sha).slice(0, 7);
/** Les premiers fichiers changés, puis leur nombre : une révision servie très ancienne ne noie pas le résumé. */
const enBref = (fichiers, max = 4) => fichiers.slice(0, max).join(", ") + (fichiers.length > max ? ` … (${fichiers.length} fichiers)` : "");

/**
 * Ce que chaque fonction emporte, lu dans le dépôt : `noms` (triés), `clotures`
 * (nom → les fichiers de la clôture de ses imports, entrée comprise) et
 * `incertaines` (nom → raisons : la clôture ne se calcule pas).
 */
export function lireFonctions(racine = RACINE) {
  const sources = {};
  const parcourir = (dir) => {
    for (const e of readdirSync(join(racine, dir), { withFileTypes: true })) {
      const p = dir + "/" + e.name;
      if (e.isDirectory()) parcourir(p);
      else if (CODE.test(e.name)) sources[p] = readFileSync(join(racine, p), "utf8");
    }
  };
  parcourir(DOSSIER);
  const { parFonction, incertaines } = clotureFonctions(sources);
  return { noms: [...parFonction.keys()].sort(), clotures: parFonction, incertaines };
}

/**
 * Parmi les fichiers changés (sous `supabase/`, ou le workflow), ceux qui CONCERNENT une fonction.
 * Tout ce qui n'est attribuable ni à elle, ni sûrement à une autre, la concerne : le doute déploie.
 */
export function changementsQuiConcernent(fonction, changes, { noms, clotures }) {
  const dossier = `${DOSSIER}/${fonction}/`;
  const cloture = new Set(clotures.get(fonction) || []);
  const autres = noms.filter((n) => n !== fonction).map((n) => `${DOSSIER}/${n}/`);
  return changes.filter((f) => {
    if (/\.md$/i.test(f)) return false;                              // de la documentation : dans aucun bundle
    if (f.startsWith(dossier) || cloture.has(f)) return true;        // son dossier, ou un module qu'elle emporte
    if (autres.some((d) => f.startsWith(d))) return false;           // le dossier d'une AUTRE fonction
    if (f.startsWith(PARTAGE) && CODE.test(f)) return false;         // un module partagé qu'elle n'emporte pas
    return true;                                                     // commun : config, carte d'imports, donnée, workflow
  });
}

/**
 * La décision, PURE. `servies` : nom → { revision, raison } ; `comparer(revision)` →
 * { relation: "absente" | "descendante" | "comparable", changes } — `changes` : les
 * fichiers changés sous `supabase/` entre la révision servie et ce commit.
 * Rend, par fonction : { fonction, etat: "a_jour" | "a_deployer", revision, motif, changes }.
 */
export function selectionner({ noms, clotures, incertaines = new Map(), servies, comparer }) {
  return noms.map((fonction) => {
    const s = servies.get(fonction) || { revision: null, raison: "révision servie non lue" };
    const base = { fonction, revision: s.revision || null, changes: [] };
    const incertaine = incertaines.has(fonction) ? "ce qu'elle emporte ne se calcule pas (" + incertaines.get(fonction)[0] + ")" : null;
    if (!s.revision) return { ...base, etat: "a_deployer", motif: incertaine || s.raison || "révision servie illisible" };
    const c = comparer(s.revision);
    if (c.relation === "absente") return { ...base, etat: "a_deployer", motif: incertaine || `sert ${court(s.revision)}, un commit absent de l'historique de celui-ci` };
    // Une clôture INCALCULABLE n'est jamais lue « rien d'autre n'est emporté » : TOUT ce qui a changé la concerne
    // (hors documentation). Mais elle se compare quand même à ce qu'elle sert : sans cela elle repartait à CHAQUE
    // passage, pour toujours, même sur un push qui ne touchait qu'un test (seconde contre-revue du 21/11).
    // ⚠️ Git ne compare que supabase/ et le workflow : une incertaine qui importerait HORS de supabase/ ne verrait
    // pas ce code-là changer (relecture du delta). Le banc des verrous refuse un tel import sur main ; limite consignée.
    const changes = incertaine ? (c.changes || []).filter((f) => !/\.md$/i.test(f)) : changementsQuiConcernent(fonction, c.changes || [], { noms, clotures });
    if (incertaine && changes.length && c.relation !== "descendante") return { ...base, etat: "a_deployer", changes, motif: `${incertaine} ; changé depuis ${court(s.revision)} : ${enBref(changes)}` };
    if (!changes.length) return { ...base, etat: "a_jour", motif: incertaine ? `sert ${court(s.revision)} : rien n'a changé depuis sous supabase/ ni dans le workflow (${incertaine})` : `sert ${court(s.revision)} : rien de ce qu'elle emporte n'a changé depuis` };
    if (c.relation === "descendante") return { ...base, etat: "a_jour", changes, motif: `sert ${court(s.revision)}, plus récent que ce commit : un run ancien ne la fait pas reculer` };
    return { ...base, etat: "a_deployer", changes, motif: `sert ${court(s.revision)} ; changé depuis : ${enBref(changes)}` };
  });
}

/**
 * La révision que sert une fonction : OPTIONS, sans jeton — toute réponse porte l'en-tête.
 * Une lecture qui n'aboutit pas (réseau, délai, 5xx sans en-tête) se RETENTE une fois : « le doute déploie »,
 * et une panne passagère redéployait une fonction en production sur un push qui ne la concernait pas.
 */
export async function lireRevisionServie(cible, fonction, fetchFn = globalThis.fetch, essais = 2) {
  let dernier = { revision: null, raison: "fonction injoignable : révision servie non lue" };
  for (let n = 0; n < essais; n++) {
    try {
      const r = await fetchFn(`${cible}/functions/v1/${fonction}`, { method: "OPTIONS", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(DELAI_LECTURE_MS) });
      const rev = String(r.headers.get("x-passio-revision") || "").trim();
      if (SHA.test(rev)) return { revision: rev, raison: null };
      // « dev » : un déploiement fait à la main depuis un poste (_shared/revision.js) — on ne sait pas quel code tourne.
      dernier = { revision: null, raison: rev ? "révision servie illisible (un déploiement fait hors de ce workflow)" : `aucune révision servie (HTTP ${r.status})` };
      if (rev || (r.status < 500 && r.status !== 429 && r.status !== 408)) return dernier;   // une réponse nette : la relire ne changerait rien
    } catch (_e) {
      dernier = { revision: null, raison: "fonction injoignable : révision servie non lue" };
    }
  }
  return dernier;
}

/**
 * La comparaison réelle : git, dans le dépôt cloné AVEC son historique (`fetch-depth: 0`).
 * `tete` : le commit auquel comparer ce qui est servi — celui que ce run déploie (HEAD), ou un SHA
 * candidat (scripts/controle-cible-pilote.mjs --attendu).
 */
export function comparateurGit(racine = RACINE, tete = "HEAD") {
  const git = (...a) => spawnSync("git", a, { cwd: racine, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  let shaTete = null;   // lu une fois : le commit que ce run déploie
  const lues = new Map();   // plusieurs fonctions servent souvent la même révision : une comparaison chacune
  return (revision) => {
    if (lues.has(revision)) return lues.get(revision);
    const rendre = (r) => { lues.set(revision, r); return r; };
    // Seul un SHA entre dans une commande git, et seul un COMMIT présent se compare : le reste est « absent ».
    if (!SHA.test(revision) || git("cat-file", "-e", revision + "^{commit}").status !== 0) return rendre({ relation: "absente", changes: [] });
    // `-z` : des chemins bruts, séparés par NUL — un nom de fichier hors ASCII n'est ni cité ni échappé.
    const d = git("diff", "--name-only", "--no-renames", "-z", revision, tete, "--", ...COMPARES);
    if (d.status !== 0) return rendre({ relation: "absente", changes: [] });
    const changes = d.stdout.split("\0").filter(Boolean).sort();
    // HEAD est un ancêtre de la révision servie (code 0), et ce n'est pas elle : la fonction est EN AVANCE sur ce commit.
    if (shaTete === null) shaTete = git("rev-parse", "--verify", "-q", tete + "^{commit}").stdout.trim();
    const descendante = shaTete !== revision && git("merge-base", "--is-ancestor", tete, revision).status === 0;
    return rendre({ relation: descendante ? "descendante" : "comparable", changes });
  };
}

/**
 * La sélection complète : { titre, lignes }. `mode` : "etat" (un push : la révision servie par `cible`),
 * "toutes" ou "fonction" (à la demande). Lève sur une demande illisible.
 */
export async function etablirSelection({ mode, fonction = null, cible = null, racine = RACINE, fetchFn = globalThis.fetch }) {
  const { noms, clotures, incertaines } = lireFonctions(racine);
  if (!noms.length) throw new Error(`aucune fonction sous ${DOSSIER}/ : rien à sélectionner.`);
  const demandee = (f, motif) => ({ fonction: f, etat: "a_deployer", revision: null, changes: [], motif });
  if (mode === "toutes") return { titre: "à la demande : toutes les fonctions", lignes: noms.map((f) => demandee(f, "demandé à la main (toutes)")) };
  if (mode === "fonction") {
    if (!noms.includes(fonction)) throw new Error(`fonction inconnue : ${fonction} — connues : ${noms.join(", ")}.`);
    return { titre: "à la demande : " + fonction, lignes: [demandee(fonction, "demandé à la main")] };
  }
  if (mode !== "etat" || !cible || !CIBLE.test(cible)) throw new Error("cible : --cible https://<ref>.supabase.co (ou --toutes, ou --fonction <nom>).");
  const lues = await Promise.all(noms.map(async (f) => [f, await lireRevisionServie(cible, f, fetchFn)]));
  return { titre: "ce que sert " + cible + ", contre ce commit", lignes: selectionner({ noms, clotures, incertaines, servies: new Map(lues), comparer: comparateurGit(racine) }) };
}

async function principal(args) {
  const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  let selection;
  try {
    selection = await etablirSelection(args.includes("--toutes") ? { mode: "toutes" }
      : args.includes("--fonction") ? { mode: "fonction", fonction: val("--fonction") }
      : { mode: "etat", cible: val("--cible") });
  } catch (e) { console.error("❌ " + e.message); process.exit(2); }
  const { titre, lignes } = selection;

  const concernees = lignes.filter((l) => l.etat === "a_deployer").map((l) => l.fonction);
  const aJour = lignes.filter((l) => l.etat === "a_jour").map((l) => l.fonction);
  // Ce que la fumée éprouvera si ce run ne le redéploie pas : toute fonction dont la révision se lit, à cette
  // révision — à jour, ou concernée puis RETENUE (elle sert alors sa version d'avant, éprouvée elle aussi).
  const servies = lignes.filter((l) => SHA.test(l.revision || "")).map((l) => `${l.fonction}=${l.revision}`);
  console.log(`── Sélection (${titre}) ──`);
  for (const l of lignes) console.log(`  ${l.etat === "a_deployer" ? "🚀" : "⏭ "} ${l.fonction} : ${l.etat === "a_deployer" ? "à déployer" : "à jour"} — ${l.motif}`);
  console.log(concernees.length ? `\n→ ${concernees.length} fonction(s) à vérifier puis déployer : ${concernees.join(", ")}` : "\n→ aucune fonction en retard sur ce commit : rien à déployer.");

  // `selection=faite` : le témoin que l'étape suivante exige — un script qui ne ferait rien ne passe pas pour « rien à faire ».
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `selection=faite\nconcernees=${concernees.join(" ")}\na_jour=${aJour.join(" ")}\nservies=${servies.join(" ")}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Sélection des Edge Functions (${titre})\n\n`
      + lignes.map((l) => `- ${l.etat === "a_deployer" ? "🚀" : "⏭️"} **${l.fonction}** : ${l.etat === "a_deployer" ? "à déployer" : "à jour"} — ${l.motif}`).join("\n") + "\n\n");
  }
}

// Lancé en direct, par son chemin RÉEL : appelé à travers un lien symbolique, l'ancienne garde (comparer deux
// URL) ne se reconnaissait pas, ne faisait rien et sortait en 0 — un silence que le job lirait « rien à faire ».
const lanceEnDirect = () => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch (_e) { return false; } };
if (lanceEnDirect()) await principal(process.argv.slice(2));
