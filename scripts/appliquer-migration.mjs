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
// `--journal [n]` n'envoie rien non plus : il LIT le journal du projet visé.
//
// ⚠️ BARRIÈRE DES GESTES CRITIQUES (ASTRA-33, quatrième contre-revue). Trois
// règles, toutes dans `scripts/lib/barriere-migration.js` (pures, 11 verrous
// dans `tests/unit/barriere-migration.test.mjs`) :
//   ① LA CIBLE EST ÉCRITE ou rien ne part — `--projet <ref>` ou
//      SUPABASE_PROJECT_REF. Le projet LIÉ du poste n'est plus une cible par
//      défaut : il ne sert qu'à dire « tu vises ailleurs que lui ». Avant, un
//      poste lié à la production visait la production sans que ce soit écrit.
//   ② SUR UNE CIBLE PROTÉGÉE, LE CONTENU ENVOYÉ EST CELUI QUI A ÉTÉ REVU —
//      l'empreinte SHA-256 du fichier relu MAINTENANT doit figurer dans
//      `.passio/migrations/attestations.json`, pour CETTE cible, avec sa PR,
//      son relecteur et sa date. Une modification après revue invalide
//      l'attestation du contenu précédent : la dérive est refusée, pas avertie.
//   ③ LE JOURNAL EST DANS LA TRANSACTION — l'insertion est injectée juste après
//      le `begin;` de la migration. Soit les deux passent, soit aucune. Le DDL
//      du journal part AVANT et son échec INTERDIT l'envoi : on ne s'autorise
//      plus à appliquer une migration qu'on ne saurait pas journaliser.
//   Et le processus ne sort JAMAIS vert sur une phase échouée ou indéterminée.
//
// ⚠️ JOURNAL (NET-07 / TCI-15, 2026-09-15). Chaque application réussie laisse
// une ligne dans `public.migrations_appliquees` du projet visé — fichier,
// empreinte SHA-256, verdict, date (`scripts/lib/journal-migrations.js`). La
// table est créée à la première écriture, RLS, sans droit client. C'est la
// mémoire de « ce qui a été appliqué, dans quel ordre » qui vit AVEC la base :
// le dépôt ne la connaît pas, une archive restaurée doit savoir d'où elle part.
// Un échec du journal est DIT (⚠️) et ne défait rien : la migration est passée.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";
const _req = createRequire(import.meta.url);
const { sqlCreation, sqlLecture } = _req("./lib/journal-migrations.js");
const BAR = _req("./lib/barriere-migration.js");

const args = process.argv.slice(2);
const verifierSeulement = args.includes("--verifier");
const sansAttestation = args.includes("--sans-attestation");
const iJournal = args.indexOf("--journal");
const iProjet = args.indexOf("--projet");
const argProjet = iProjet >= 0 ? args[iProjet + 1] : null;
const fichier = args.find((a, i) => !a.startsWith("--") && !(iJournal >= 0 && i === iJournal + 1) && !(iProjet >= 0 && i === iProjet + 1));

function echec(msg) { console.error("❌ " + msg); process.exit(2); }
async function requeter(ref, jeton, query) {
  const r = await fetch("https://api.supabase.com/v1/projects/" + ref + "/database/query", { method: "POST", headers: { Authorization: "Bearer " + jeton, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const t = await r.text();
  if (!r.ok) throw new Error("API " + r.status + " : " + t.slice(0, 300));
  try { return JSON.parse(t); } catch (e) { return []; }
}

if (process.env.GITHUB_ACTIONS) echec("jamais depuis la CI (ADR-012, canal ③) — ce script s'exécute sur un poste.");
if (!fichier && iJournal < 0) echec("usage : node scripts/appliquer-migration.mjs migrations/<fichier>.sql [--verifier] | --journal [n]");

const racine = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
if (iJournal >= 0) {
  // Lecture seule du journal du projet visé (jeton + ref lus plus bas : on les prend ici).
  const j = lireJeton();
  if (!j) echec("aucun jeton pour lire le journal.");
  const r = cibleOuRefus({ argProjet, envRef: process.env.SUPABASE_PROJECT_REF, refLie: lireProjetLie() }).ref;
  const lignes = await requeter(r, j, sqlLecture(Number(args[iJournal + 1]) || 50)).catch((e) => { if (/does not exist/.test(String(e.message))) return null; throw e; });
  if (lignes === null) { console.log("journal absent sur " + r + " : aucune migration n'a encore été appliquée par cet outil."); process.exit(0); }
  console.log("journal des migrations appliquées sur " + r + " (" + lignes.length + ") :");
  for (const l of lignes) console.log("  " + String(l.applique_le).slice(0, 19).replace("T", " ") + "  " + l.fichier + "  " + l.empreinte + "  (" + l.outil + ")");
  process.exit(0);
}
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
// ⚠️ NE REND PLUS UNE CIBLE : seulement le projet LIÉ du poste, que la barrière
// utilise pour dire « tu vises ailleurs » — jamais pour décider où écrire.
function lireProjetLie() {
  const p = resolve(racine, "supabase", ".temp", "project-ref");
  if (existsSync(p)) return readFileSync(p, "utf8").trim();
  return null;
}
function lireAttestations() {
  // `PASSIO_ATTESTATIONS` : un autre fichier (le test unitaire y pose des
  // attestations fabriquées pour prouver qu'elles sont REFUSÉES).
  const p = process.env.PASSIO_ATTESTATIONS ? resolve(process.env.PASSIO_ATTESTATIONS) : resolve(racine, ".passio", "migrations", "attestations.json");
  if (!existsSync(p)) return [];
  try { const j = JSON.parse(readFileSync(p, "utf8")); return Array.isArray(j) ? j : (j.attestations || []); }
  catch (e) { echec("`.passio/migrations/attestations.json` est illisible (" + e.message + ") — une attestation qu'on ne sait pas lire n'atteste rien."); }
}
function cibleOuRefus(opts) {
  try { return BAR.choisirCible(opts); } catch (e) { echec(e.message); }
}
// ⚠️ LA BARRIÈRE PASSE AVANT LE JETON, et c'est délibéré : `--verifier` n'envoie
// rien, il doit donc pouvoir s'exécuter partout (revue, CI, poste sans accès)
// pour dire si un fichier est envoyable. Le jeton n'est exigé qu'à l'envoi.

// ── ① LA CIBLE EST ÉCRITE ──────────────────────────────────────────────────
const cible = cibleOuRefus({ argProjet, envRef: process.env.SUPABASE_PROJECT_REF, refLie: lireProjetLie() });
const ref = cible.ref;

// ── ② LE CONTENU ENVOYÉ EST CELUI QUI A ÉTÉ REVU ──────────────────────────
let att;
try { att = BAR.verifierAttestation({ fichier: rel, sql, cible, attestations: lireAttestations(), sansAttestation }); }
catch (e) { echec(e.message); }
// ── ②' LA PREUVE DE REVUE EST VÉRIFIÉE SUR GITHUB (ASTRA-51) ────────────────
// Sur une cible protégée, l'attestation locale ne suffit pas : la revue qu'elle
// désigne est LUE (`gh api`) — présente, ancrée sur le commit attesté, portant
// le marqueur, le fichier et la cible, signée par le relecteur, et le fichier
// à ce commit identique à celui qu'on envoie. Y compris pour `--verifier` :
// « envoyable » ne se dit pas sans elle, et « non vérifiable » (pas de `gh`,
// pas de réseau) REFUSE, il ne devine pas.
let preuve = null;
if (att.exigee) {
  const GH = createRequire(import.meta.url)("./lib/github-revue.js");
  const a = att.attestation;
  // ASTRA-61 : sur une cible protégée, seul un fournisseur RÉEL (gh du PATH,
  // dépôt origin) certifie ; les fixtures des bancs sont refusées ici.
  try { BAR.exigerFournisseurReel(GH.fournisseur(), cible); } catch (e) { echec(e.message); }
  const revues = GH.lireRevues(a.pr, racine);
  const contenuCommit = a.commit ? GH.lireContenuAuCommit(rel, a.commit, racine) : null;
  try {
    preuve = BAR.verifierPreuveRevue({ attestation: a, fichier: rel, empreinteAttendue: att.empreinte, cible, revues, contenuAuCommit: contenuCommit, auteurPr: GH.lireAuteurPr(a.pr, racine), relecteursAutorises: GH.lireRelecteursAutorises(racine) });
  } catch (e) { echec(e.message + "\n   (revues lues : " + (revues ? revues.length : "NON LISIBLES") + " · dépôt : " + (GH.depot(racine) || "inconnu") + ")"); }
}

console.log("migration : " + rel + " (" + sql.length + " caractères)");
console.log("empreinte : " + att.empreinte);
console.log("cible     : " + ref + (cible.role ? " — " + cible.role + " (PROTÉGÉE)" : " — non protégée"));
if (cible.divergeDuProjetLie) console.log("           ⚠️ le poste est lié à `" + cible.refLie + "` : la cible écrite prime, et elle diffère.");
if (att.attestation) {
  console.log("revue     : " + att.attestation.pr + " · " + att.attestation.relecteur + " · revendiquée le " + att.attestation.revue_le +
    (att.attestation.consigne_le && att.attestation.consigne_le !== att.attestation.revue_le ? " · CONSIGNÉE le " + att.attestation.consigne_le : "") +
    " (" + att.attestation.source + ")");
  if (att.retroactive) console.log("           ⚠️ attestation RÉTROACTIVE : reconstruction après coup, jamais une revue préalable.");
  if (preuve) console.log("preuve    : revue GitHub n°" + preuve.revue.id + " (" + preuve.revue.etat + ", " + (preuve.revue.soumise_le || "?") + ") par " + preuve.revue.login + ", ancrée sur " + String(preuve.revue.commit).slice(0, 12) + "… — contenu au commit = contenu envoyé" + " · approbation indépendante (auteur de la PR : " + preuve.auteurPr + ")");
}
else if (att.derive) console.log("           ⚠️ une attestation existe pour ce fichier mais PAS pour ce contenu (cible non protégée : on passe, on le dit).");
else console.log("revue     : aucune attestation exigée sur une cible non protégée.");

if (verifierSeulement) { console.log("\n✅ envoyable — la barrière est franchie (--verifier : rien n'a été envoyé, aucun jeton requis)."); process.exit(0); }

const jeton = lireJeton();
if (!jeton) echec("aucun jeton : `supabase login` sur ce poste, ou SUPABASE_ACCESS_TOKEN.");
if (!/^sbp_/.test(jeton)) echec("le jeton ne ressemble pas à un jeton personnel (`sbp_…`) — jamais la clé service_role ici.");

// ── ③ LE JOURNAL D'ABORD : ne pas savoir journaliser INTERDIT d'appliquer ──
const phases = {};
try {
  await requeter(ref, jeton, sqlCreation());
  await requeter(ref, jeton, BAR.sqlColonnesJournal());
  phases["journal (préparation)"] = { ok: true };
} catch (e) {
  echec("le journal des migrations n'a pas pu être préparé sur " + ref + " (" + String(e.message).slice(0, 220) + ").\n" +
        "   RIEN n'a été appliqué : on ne s'autorise pas une migration qu'on ne saurait pas journaliser (ASTRA-33 ③).");
}

// L'insertion du journal est injectée DANS la transaction de la migration :
// soit les deux passent, soit aucune. Plus de fenêtre entre les deux.
const envoye = BAR.sqlAvecJournal(sql, { fichier: rel, cible: ref, attestation: att.attestation, outil: "appliquer-migration.mjs" });

const reponse = await fetch("https://api.supabase.com/v1/projects/" + ref + "/database/query", {
  method: "POST",
  headers: { Authorization: "Bearer " + jeton, "Content-Type": "application/json" },
  body: JSON.stringify({ query: envoye }),
});
const texte = await reponse.text();
if (!reponse.ok) echec("l'API a refusé (" + reponse.status + ") : " + texte.slice(0, 600) + "\n   La transaction n'a pas été validée : ni la migration ni sa ligne de journal.");
phases["envoi"] = { ok: true };

let lignes = [];
try { lignes = JSON.parse(texte); } catch (e) { lignes = null; }
if (!Array.isArray(lignes)) { lignes = []; }

if (!lignes.length) {
  // AVANT : sortie 0, sans journal. Le journal est maintenant DANS la
  // transaction, donc il existe — mais l'absence de verdict reste un défaut du
  // fichier, et elle ne sort pas verte.
  phases["verdict"] = { ok: false, motif: "aucune ligne de verdict rendue — la migration n'a pas de tableau final" };
} else {
  console.log("\nVERDICT (" + lignes.length + " ligne" + (lignes.length > 1 ? "s" : "") + ") :");
  const cles = Object.keys(lignes[0]);
  for (const l of lignes) console.log("  " + cles.map((k) => String(l[k])).join("  |  "));
  const rouges = lignes.filter((l) => Object.values(l).some((v) => /ECHEC|anomalie/i.test(String(v))));
  phases["verdict"] = rouges.length ? { ok: false, motif: rouges.length + " ligne(s) en ECHEC — la transaction a pourtant été validée : lire l'état en base" } : { ok: true };
}

// Enrichissement FACULTATIF : le verdict imprimé, ajouté à la ligne déjà
// committée. Son échec n'est pas un état indéterminé — le fait est journalisé.
try {
  await requeter(ref, jeton, "update public.migrations_appliquees set verdict = " +
    "'" + JSON.stringify(lignes.slice(0, 50)).replace(/'/g, "''") + "'::jsonb " +
    "where id = (select max(id) from public.migrations_appliquees where empreinte = '" + att.empreinte + "');");
  console.log("\n📒 journal : " + rel + " consignée sur " + ref + " DANS la transaction — `--journal` pour relire.");
} catch (e) {
  console.log("\n📒 journal : la LIGNE est écrite (transaction commune). Le verdict n'a pas pu y être ajouté (" + String(e.message).slice(0, 160) + ") — enrichissement seul, pas un état indéterminé.");
}

const global = BAR.verdictGlobal(phases);
if (!global.ok) { console.log("\n❌ " + global.echecs.join("\n❌ ")); process.exit(global.code); }
console.log("\n✅ appliquée et journalisée. Maintenant : mesurer l'état en base (canal ①), pas ce tableau.");
