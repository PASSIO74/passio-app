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
//   node scripts/reinjections-pilotage.mjs          # ~2 min 30
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
  ["R01 une seule exécution lue (per_page=1)", FN, "&event=${ev}&per_page=10", "&event=${ev}&per_page=1", BANC, "⑫"],
  ["R02 seule « failure » est un échec", PJ, `Object.freeze(["failure", "timed_out", "startup_failure"])`, `Object.freeze(["failure"])`, BANC, "⑪"],
  ["R03 une exécution annulée ne dit rien", PJ, `return termine && r.conclusion ? { nature: "inabouti", run: r } : null;`, `return null;`, BANC, "⑪"],
  ["R04 une lecture d'exécutions refusée n'est pas notée", FN, `if (lectures.some((l) => !l)) { runsNonLus.push(cle); return null; }`, `if (lectures.some((l) => !l)) { return null; }`, BANC, "⑩"],
  ["R05 des issues suivies qui débordent leur filtre ne se disent pas", FN, `issuesTronquees = lots.some((l) => l.tronque);`, `issuesTronquees = false;`, BANC, "⑩"],
  ["R06 l'écran ignore ce que GitHub n'a pas rendu", FN, `out.verdict = verdictAffiche(v, nonLus, ((out.github as { partiel?: string[] } | null)?.partiel) || []);`, `out.verdict = verdictAffiche(v, nonLus);`, BANC, "⑩"],
  ["R07 la veille baisse son voyant sur des exécutions non lues", FN, ` || !!(parcoursVeille && parcoursVeille.tronque) || partielGh.length > 0;`, ` || !!(parcoursVeille && parcoursVeille.tronque);`, BANC, "㉚"],
  ["R08 une lecture en partie est gardée 2 min", FN, `if (!(val.partiel as string[]).length) cacheGh = { at: Date.now(), val };`, `cacheGh = { at: Date.now(), val };`, BANC, "⑩"],
  ["R09 la tête de la PR n'est pas comparée à la version vue", FN, `if (p.head.sha !== shaVu) return json(`, `if (false) return json(`, BANC, "⑱"],
  ["R10 la version vue n'est pas exigée", FN, `if (!shaValide(shaVu)) return json(`, `if (false) return json(`, BANC, "⑱"],
  ["R11 le geste ne porte pas la version vue", PJ, `const fusionner = shaValide(i.sha) ? { corps: { action: "fusionner", numero: i.numero, sha: i.sha } } : null;`, `const fusionner = { corps: { action: "fusionner", numero: i.numero } };`, BANC, "⑱"],
  ["R12 l'auto-fusion s'arme sans tête attendue", FN, `mergeMethod: SQUASH, expectedHeadOid: $tete }`, `mergeMethod: SQUASH }`, BANC, "⑱ bis"],
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
  ["R25 la veille ignore la marque du pilote et parcourt tous les comptes", FN, `const marques = await pilotesMarques(admin);`, `const marques = { uids: [] as string[], adresses: new Set<string>() };`, BANC, "㊳"],
  ["R26 une marque est crue sans relire le compte", FN, `if (u && autorise(u, EXTRA)) { uids.push(uid); adresses.add(`, `if (u) { uids.push(uid); adresses.add(`, BANC, "㊳"],
  ["R27 une réponse PERDUE de GitHub rend le verrou de la réparation", FN, `  if (!r || r.status >= 500) return json({ error: "GitHub n'a pas répondu" + (r ? `, `  if (!r || r.status >= 500) await rendreCreneau(admin, verrou.creneau);\n  if (!r || r.status >= 500) return json({ error: "GitHub n'a pas répondu" + (r ? `, BANC, "㉒"],
  ["R28 une réponse perdue de GitHub rend le verrou de la relance", FN, `  if (!res || res.status >= 500) return json({ error: "GitHub n'a pas répondu" + (res ? `, `  if (!res || res.status >= 500) await rendreCreneau(admin, creneau);\n  if (!res || res.status >= 500) return json({ error: "GitHub n'a pas répondu" + (res ? `, BANC, "㉒"],
  // ── Contre-revue du 12/11 ────────────────────────────────────────────────────
  ["R29 les exécutions d'un tiers comptent (ni événement ni dépôt filtrés)", FN, `const opts = { evenements: EVENEMENTS_RUNS[cle], depot: DEPOT };`, `const opts = {};`, BANC, "⑪ bis"],
  ["R30 la tentative d'avant d'une relance n'est pas relue", FN, `let tentative = aRelire.get(brutRun.id as number) || 0;`, `let tentative = 0;`, BANC, "⑫ bis"],
  ["R31 au-delà de cent issues ouvertes, on ne lit plus ce qui est suivi", FN, `if (Array.isArray(brut) && brut.length >= 100) {`, `if (false) {`, BANC, "⑩"],
  ["R32 un 5xx de GitHub rend le verrou de la réparation", FN, `  if (!r || r.status >= 500) return json({ error: "GitHub n'a pas répondu" + (r ? `, `  if (!r) return json({ error: "GitHub n'a pas répondu" + (r ? `, BANC, "㉒ bis"],
  ["R33 un 5xx de GitHub rend le verrou de la relance", FN, `  if (!res || res.status >= 500) return json({ error: "GitHub n'a pas répondu" + (res ? `, `  if (!res) return json({ error: "GitHub n'a pas répondu" + (res ? `, BANC, "㉒ bis"],
  ["R34 confier tente la seconde voie après un 5xx (second agent possible)", FN, `const ambigu = (r: Response) => { if (r.status >= 500) throw new Error("GitHub HTTP " + r.status); return r; };`, `const ambigu = (r: Response) => r;`, BANC, "㉒ bis"],
  ["R35 un geste interrompu sort en exception nue", FN, `  try { return await geste(); }\n  catch (err) {`, `  if (Date.now()) return await geste();\n  try { /* */ }\n  catch (err) {`, BANC, "㉒ bis"],
  ["R36 la version armée n'est pas notée", FN, `const { error } = await admin.from("analytics_events").insert({ user_id: "systeme:pilotage", event: EVT_GESTE, properties: { geste: "fusion_armee", numero: n, sha: shaVu } });`, `const error = null;`, BANC, "⑱ bis"],
  ["R37 l'écran ne compare pas la tête à la version armée", PJ, `if (i.autoFusion && fusionner && shaValide(armee) && armee !== i.sha) {`, `if (false) {`, BANC, "⑱ bis"],
  ["R38 une fusion déjà armée est réarmée au lieu d'être validée", FN, `(!!p.auto_merge || await armerAutoFusion(`, `(await armerAutoFusion(`, BANC, "⑱ bis"],
  ["R39 des issues qui débordent tiennent le voyant de la veille (un tiers la fige)", FN, `const partielGh = partielGithub({ runsNonLus: ((e.github as { runsNonLus?: string[] } | null)?.runsNonLus) || [] }) as string[];`, `const partielGh = (((e.github as { partiel?: string[] } | null)?.partiel) || []) as string[];`, BANC, "㉚ bis"],
  ["R40 « la dernière terminée » : une exécution annulée blanchit l'échec d'avant", PJ, `const tranche = tries.slice(1).find(runATranche);`, `const tranche = tries.slice(1).find((r) => r.status === "completed");`, BANC, "⑫"],
  ["R41 les marques se comptent en nombre, pas en adresses prouvées", FN, `if (marques.adresses.size < attendus.size) {`, `if (uids.length < attendus.size) {`, BANC, "㊳ bis"],
  ["R42 au-delà de cent issues, les issues du pilote sans label ne sont plus lues", FN, `.map((l) => "labels=" + encodeURIComponent(l)), "creator=" + PILOTE_GITHUB];`, `.map((l) => "labels=" + encodeURIComponent(l))];`, BANC, "⑩"],
  ["R43 au-delà de cent issues, les correctifs ne sont plus lus", FN, `    for (const p of listePr) if (!vues.has(p.number)) vues.set(p.number, { ...p, pull_request: {} });\n`, ``, BANC, "⑩"],
  ["R44 une tentative illisible ne se dit pas", FN, `if (!ja || typeof ja !== "object") { nonLu(); break; }`, `if (!ja || typeof ja !== "object") { break; }`, BANC, "⑫ bis"],
  ["R45 relancer un échec sonne « résolu » au départ de la relance", PJ, `    if (Number(r.run_attempt) > 1 && Number.isInteger(r.id) && r.id > 0) out.push({ id: r.id, tentative: Number(r.run_attempt) - 1 });\n`, ``, BANC, "㉙ bis"],
  ["R46 la mise en ligne se lit sans filtre d'événement côté GitHub", FN, "&event=${ev}&per_page=10", "&per_page=10", BANC, "⑪ bis"],
  // Suites de #848 (2026-11-12, seconde relecture) : les trous côté écran.
  ["R47 la Sentinelle se lit sans filtre d'événement : dix exécutions d'un fork la chassent", FN, "&event=${ev}&per_page=10", "&per_page=10", BANC, "㊴"],
  ["R48 une lecture d'exécutions refusée passe si l'autre répond", FN, `if (lectures.some((l) => !l))`, `if (lectures.every((l) => !l))`, BANC, "㊴"],
  ["R49 les PR se lisent sur une seule page", FN, `const PR_PAGES_MAX = 3;`, `const PR_PAGES_MAX = 1;`, BANC, "㊵"],
  ["R50 une liste de PR illisible passe pour vide", FN, `if (!Array.isArray(lot)) return { ok: false, lignes, raison: "GitHub : liste des PR illisible" };`, `if (!Array.isArray(lot)) return { ok: true, lignes, raison: null };`, BANC, "㊵"],
  ["R51 au-delà de trois pages, rien n'est dit", FN, `? "plus de " + PR_PAGES_MAX * 100 + " PR ouvertes : les plus anciennes ne sont pas lues"`, `? null`, BANC, "㊵"],
  ["R52 un défaut du code passe pour une panne de GitHub", FN, `|| "") === "ReferenceError";`, `|| "") === "AucuneErreur";`, BANC, "㊶"],
  ["R53 une TypeError (un fetch qui ne joint pas GitHub) passe pour un défaut du code", FN, `const defaut = String((err as { name?: string })?.name || "") === "ReferenceError";`, `const defaut = ["ReferenceError", "TypeError"].includes(String((err as { name?: string })?.name || ""));`, BANC, "㊶"],
  ["R54 un défaut du code n'est qu'un avertissement dans les journaux", FN, `console.error("pilotage : défaut du code dans un geste "`, `console.warn("pilotage : défaut du code dans un geste "`, BANC, "㊶"],
  ["R55 la note armée illisible laisse dire « part en ligne »", PJ, `if (i.autoFusion && fusionner && nonLus.includes("fusionsArmees")) {`, `if (false) {`, BANC, "㊷"],
  ["R56 sept jours de notes armées : une auto-fusion plus ancienne n'est plus comparée", FN, `.gte("created_at", ilYa(30 * 864e5))`, `.gte("created_at", ilYa(7 * 864e5))`, BANC, "㊷"],
  // Le scan de sécurité du lundi (contre-revue de #863) : dit, à trier par Benjamin, jamais réparé.
  ["R57 le scan en échec ne se dit pas", PJ, `  if (sc) {\n`, `  if (false) {\n`, BANC, "㊸"],
  ["R58 le scan devient réparable (un agent trierait les secrets)", PJ, `  veille: { fichier: "veille-production.yml", libelle: "Veille de production" },\n};`, `  veille: { fichier: "veille-production.yml", libelle: "Veille de production" },\n  securite: { fichier: "securite.yml", libelle: "Scan de sécurité" },\n};`, BANC, "㊸"],
  ["R59 les exécutions de PR du scan comptent", PJ, `securite: Object.freeze(["schedule", "workflow_dispatch"]),`, `securite: Object.freeze(["schedule", "workflow_dispatch", "pull_request"]),`, BANC, "㊸"],
  ["R60 le scan illisible ne se dit pas", PJ, `, securite: "le scan de sécurité" });`, ` });`, BANC, "㊸"],
  // Relecture indépendante de #866 (2026-11-13).
  ["R61 une SyntaxError (un corps qui n'est pas du JSON) passe pour un défaut du code", FN, `const defaut = String((err as { name?: string })?.name || "") === "ReferenceError";`, `const defaut = ["ReferenceError", "SyntaxError"].includes(String((err as { name?: string })?.name || ""));`, BANC, "㊶"],
  ["R62 une RangeError (une date illisible) passe pour un défaut du code", FN, `const defaut = String((err as { name?: string })?.name || "") === "ReferenceError";`, `const defaut = ["ReferenceError", "RangeError"].includes(String((err as { name?: string })?.name || ""));`, BANC, "㊶"],
  ["R63 les passages manuels du scan ne comptent plus : un tri relancé et vert garde la ligne", PJ, `securite: Object.freeze(["schedule", "workflow_dispatch"]),`, `securite: Object.freeze(["schedule"]),`, BANC, "㊸"],
  ["R64 toute exécution non lue tient la veille (un scan illisible la fige)", FN, `.filter((c) => (RUNS_DU_VOYANT as readonly string[]).includes(c));`, `.filter(() => true);`, BANC, "㊹"],
  ["R65 la Sentinelle illisible ne tient plus la veille", PJ, `export const RUNS_DU_VOYANT = Object.freeze(["deploy", "sentinelle"]);`, `export const RUNS_DU_VOYANT = Object.freeze(["deploy"]);`, BANC, "㊹"],
  ["R66 la liste du voyant et ce que lit verdict divergent", PJ, `export const RUNS_DU_VOYANT = Object.freeze(["deploy", "sentinelle"]);`, `export const RUNS_DU_VOYANT = Object.freeze(["deploy", "sentinelle", "securite"]);`, "tests/unit/pilotage.test.mjs", "㊴ bis"],
  ["R67 trois cents PR tout juste se disent « plus de trois cents »", FN, `    if (Array.isArray(reste) && reste.length === 0) return { ok: true, lignes, raison: null };\n`, ``, BANC, "㊵"],
  ["R68 une lecture d'au-delà illisible passe pour « tout est lu »", FN, `if (Array.isArray(reste) && reste.length === 0)`, `if (!Array.isArray(reste) || reste.length === 0)`, BANC, "㊵"],
  ["R69 une page en échec jette les pages lues (le correctif récent disparaît)", FN, `if (!r || !r.ok) return { ok: false, lignes, raison: r ? "GitHub HTTP " + r.status : "GitHub muet" };`, `if (!r || !r.ok) return { ok: false, lignes: [], raison: r ? "GitHub HTTP " + r.status : "GitHub muet" };`, BANC, "㊵"],
  ["R70 le scan dit tout sur une ligne de téléphone (son détail hors du repli)", PJ, `quoi: "À trier par toi, jamais par une machine.",`, `quoi: "À trier par toi, jamais par une machine. Son journal dit quel job : les secrets, npm audit ou la gate des workflows.",`, "tests/unit/pilotage.test.mjs", "㊴"],
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
    const r = spawnSync(process.execPath, ["--test", "--test-name-pattern", "^" + motif + " ", suite], { encoding: "utf8", timeout: 300_000 });
    code = r.status; sortie = (r.stdout || "") + (r.stderr || "");
    if (r.error || r.signal) sortie = "BLOQUÉ (" + ((r.error && r.error.code) || r.signal) + ")\n" + sortie;
  } finally { fs.writeFileSync(fichier, origine); }
  const joues = /ℹ tests (\d+)/.exec(sortie);
  const rouge = code !== 0 && /ℹ fail [1-9]/.test(sortie);
  if (rouge) rouges++;
  lignes.push(`${rouge ? "ROUGE" : sortie.startsWith("BLOQUÉ") ? "BLOQUÉ" : "VERT "} ${nom} → ${motif} (${joues ? joues[1] : "?"} test joué)`);
}
console.log(lignes.join("\n"));
console.log(`\n${rouges}/${M.length} réinjections rougissent leur test.`);
process.exit(rouges === M.length ? 0 : 1);
