#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// RÉINJECTIONS du banc pilotage-chemins (2026-11-12).
//
// Un test qui reste vert quand on remet le défaut ne garde rien. Chaque correctif du
// lot « vérité affichée » est retiré tour à tour — dans la copie de travail, restaurée
// aussitôt (try/finally) — et l'exercice nommé de tests/unit/pilotage-chemins.test.mjs
// doit ROUGIR. Sortie 0 si toutes rougissent, 1 sinon (une cible introuvable compte
// comme un échec : la réinjection ne décrit plus le code).
//
//   node scripts/reinjections-pilotage.mjs          # ~1 min 30
//
// ⚠️ DANS UN WORKTREE ISOLÉ, JAMAIS dans un checkout partagé avec une autre session :
// pendant quelques secondes, le fichier muté est sur le disque. Le script refuse de
// partir si l'un des fichiers qu'il mute porte un changement non commité (il le
// restaurerait à l'identique, mais une interruption le laisserait muté sans trace).
// Jamais en production : rien ici ne touche un réseau.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const FN = "supabase/functions/pilotage/index.ts";
const PJ = "supabase/functions/_shared/pilotage.js";
const BT = "supabase/functions/_shared/battement.js";
const BANC = "tests/unit/pilotage-chemins.test.mjs";
const M = [
  ["R01 une seule exécution lue (per_page=1)", FN, "runs?per_page=5&branch=main", "runs?per_page=1&branch=main", BANC, "⑫"],
  ["R02 seule « failure » est un échec", PJ, `Object.freeze(["failure", "timed_out", "startup_failure"])`, `Object.freeze(["failure"])`, BANC, "⑪"],
  ["R03 une exécution annulée ne dit rien", PJ, `return enCours ? null : { nature: "inabouti", run: fini };`, `return null;`, BANC, "⑪"],
  ["R04 une lecture d'exécutions refusée n'est pas notée", FN, `if (!j || !Array.isArray(j.workflow_runs)) { runsNonLus.push(cle); return null; }`, `if (!j || !Array.isArray(j.workflow_runs)) { return null; }`, BANC, "⑩"],
  ["R05 les issues tronquées ne se disent pas", FN, `const issuesTronquees = Array.isArray(brut) && brut.length >= ISSUES_LUES_MAX;`, `const issuesTronquees = false;`, BANC, "⑩"],
  ["R06 l'écran ignore ce que GitHub n'a pas rendu", FN, `out.verdict = verdictAffiche(v, nonLus, ((out.github as { partiel?: string[] } | null)?.partiel) || []);`, `out.verdict = verdictAffiche(v, nonLus);`, BANC, "⑩"],
  ["R07 la veille baisse son voyant sur un GitHub lu en partie", FN, ` || !!(parcoursVeille && parcoursVeille.tronque) || partielGh.length > 0;`, ` || !!(parcoursVeille && parcoursVeille.tronque);`, BANC, "㉚"],
  ["R08 une lecture en partie est gardée 2 min", FN, `if (!(val.partiel as string[]).length) cacheGh = { at: Date.now(), val };`, `cacheGh = { at: Date.now(), val };`, BANC, "⑩"],
  ["R09 la tête de la PR n'est pas comparée à la version vue", FN, `if (p.head.sha !== shaVu) return json(`, `if (false) return json(`, BANC, "⑱"],
  ["R10 la version vue n'est pas exigée", FN, `if (!shaValide(shaVu)) return json(`, `if (false) return json(`, BANC, "⑱"],
  ["R11 le geste ne porte pas la version vue", PJ, `const fusionner = shaValide(i.sha) ? { corps: { action: "fusionner", numero: i.numero, sha: i.sha } } : null;`, `const fusionner = { corps: { action: "fusionner", numero: i.numero } };`, BANC, "⑱"],
  ["R12 l'auto-fusion s'arme sans tête attendue", FN, `mergeMethod: SQUASH, expectedHeadOid: $tete }`, `mergeMethod: SQUASH }`, BANC, "⑱"],
  ["R13 deux relances simultanées partent toutes deux", FN, `if (!creneau.ok && creneau.raison === "pris") return json({ error: "Cette relance vient de partir`, `if (false) return json({ error: "Cette relance vient de partir`, BANC, "⑯"],
  ["R14 deux réparations simultanées s'ouvrent toutes deux", FN, `  const verrou = await verrouReparation(admin, cleVerrou);\n  if (verrou.refus) return verrou.refus;\n  const r = await gh(`, `  const verrou = await verrouReparation(admin, cleVerrou);\n  const r = await gh(`, BANC, "㉒"],
  ["R15 un refus de GitHub garde le verrou de la réparation", FN, `    await rendreCreneau(admin, verrou.creneau);\n    return json({ error: \`GitHub a refusé l'ouverture`, `    return json({ error: \`GitHub a refusé l'ouverture`, BANC, "㉒"],
  ["R16 une mémoire illisible est prise pour « aucun état »", FN, `const change = memoire.illisible ? d.sonner : (!prec ||`, `const change = (!prec ||`, BANC, "㉛"],
  ["R17 la lecture en échec de la mémoire ne se dit pas", FN, `if (error) return { etat: null, illisible: true, code: String((error as { code?: string }).code || "lecture") };`, `if (error) return { etat: null, illisible: false };`, BANC, "㉛"],
  ["R18 la pause se cherche parmi toutes les issues", FN, "issues?state=open&creator=${PILOTE_GITHUB}&per_page=100", "issues?state=open&per_page=100", BANC, "⑲"],
  ["R19 un essai parti se note « rien » au battement", BT, `    else if (typeof v.essai === "string") g[k] = court(v.essai, 60);\n`, ``, BANC, "㉟ bis"],
  ["R20 un déploiement en échec n'est plus rouge", PJ, `if (ed && ed.nature === "echec") rouge.push(`, `if (false) rouge.push(`, BANC, "㉙"],
  ["R21 la porte laisse entrer un compte non éditeur", FN, `if (!autorise(user, EXTRA)) return json({ error: "Réservé au compte de l'éditeur." }, 403);`, ``, BANC, "②"],
  ["R22 le plafond ne ferme plus rien", FN, `if (!plafond.ok) return reponsePlafond(plafond, corsHeaders);`, ``, BANC, "④"],
  ["R23 la veille répond son voyant (oracle)", FN, `  return json({ ok: true });\n}\n\n// Canari serveur`, `  return json({ ok: true, couleur: actuel.couleur });\n}\n\n// Canari serveur`, BANC, "㉗"],
  ["R24 une variable jamais déclarée dans un geste (le défaut de #753)", FN, `  if (!r) return json({ error: "Relance inconnue." }, 400);`, `  if (!r) return json({ error: "Relance inconnue." + cibleInconnue }, 400);`, BANC, "⑮"],
  ["R25 la veille ignore la marque du pilote et parcourt tous les comptes", FN, `const uids: string[] = await pilotesMarques(admin);`, `const uids: string[] = [];`, BANC, "㊳"],
  ["R26 une marque est crue sans relire le compte", FN, `if (error ? !introuvable : !!(data && data.user && autorise(data.user, EXTRA))) verifies.push(uid);`, `verifies.push(uid);`, BANC, "㊳"],
  ["R27 une réponse PERDUE de GitHub rend le verrou de la réparation", FN, `  if (!r) return json({ error: "GitHub n'a pas répondu : la réparation est peut-être partie.`, `  if (!r) await rendreCreneau(admin, verrou.creneau);\n  if (!r) return json({ error: "GitHub n'a pas répondu : la réparation est peut-être partie.`, BANC, "㉒"],
  ["R28 une réponse perdue de GitHub rend le verrou de la relance", FN, `  if (!res) return json({ error: "GitHub n'a pas répondu : la relance est peut-être partie.`, `  if (!res) await rendreCreneau(admin, creneau);\n  if (!res) return json({ error: "GitHub n'a pas répondu : la relance est peut-être partie.`, BANC, "㉒"],
];

const lire = (f) => fs.readFileSync(f, "utf8");
if (!process.argv.includes("--sans-garde")) {
  const sales = spawnSync("git", ["status", "--porcelain", "--", ...new Set(M.map((m) => m[1]))], { encoding: "utf8" }).stdout.trim();
  if (sales) {
    console.error(["REFUS — des fichiers à muter portent des changements non commités :", sales, "Commite d'abord (ou passe --sans-garde, à tes risques)."].join("\n"));
    process.exit(2);
  }
}
let rouges = 0;
const lignes = [];
for (const [nom, fichier, de, vers, suite, motif] of M) {
  const origine = lire(fichier);
  const n = origine.split(de).length - 1;
  if (n !== 1) { lignes.push(`??  ${nom} — la cible apparaît ${n} fois dans ${fichier} : réinjection impossible`); continue; }
  let code = null, sortie = "";
  try {
    fs.writeFileSync(fichier, origine.replace(de, () => vers));
    const r = spawnSync(process.execPath, ["--test", "--test-name-pattern", "^" + motif + " ", suite], { encoding: "utf8" });
    code = r.status; sortie = (r.stdout || "") + (r.stderr || "");
  } finally { fs.writeFileSync(fichier, origine); }
  const joues = /ℹ tests (\d+)/.exec(sortie);
  const rouge = code !== 0 && /ℹ fail [1-9]/.test(sortie);
  if (rouge) rouges++;
  lignes.push(`${rouge ? "ROUGE" : "VERT "} ${nom} → ${motif} (${joues ? joues[1] : "?"} test joué)`);
}
console.log(lignes.join("\n"));
console.log(`\n${rouges}/${M.length} réinjections rougissent leur test.`);
process.exit(rouges === M.length ? 0 : 1);
