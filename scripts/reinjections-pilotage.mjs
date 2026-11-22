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
//   node scripts/reinjections-pilotage.mjs          # ~2 min 30 pour 76 sur le poste (12/11) ; 36 s pour 123 sous Linux (21/11), 142 depuis le rebase sur #1003 et la seconde relecture du lot T2, 192 avec T3 (lot B1 et sa contre-revue, 40 s)
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
const PG = "pilotage/pilotage.js";
const MG = "migrations/migration_telemetrie_classes_2026-11-21.sql";
const BANC = "tests/unit/pilotage-chemins.test.mjs";
const PUR = "tests/unit/pilotage.test.mjs";
// T3 (2026-11-21) : le prédicat des parcours rouges, la veille GitHub, et leurs suites.
const PAR = "supabase/functions/_shared/parcours.js";
const VP = "scripts/veille-production.mjs";
const EC = "supabase/functions/_shared/echelle.js";
const BT_SUITE = "tests/unit/battement.test.mjs";
const VP_SUITE = "tests/unit/veille-production.test.mjs";
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
  ["R39 des issues qui débordent tiennent le voyant de la veille (un tiers la fige)", FN, `const partielGh = partielGithub({ runsNonLus: runsNonLusVoyant }) as string[];`, `const partielGh = (((e.github as { partiel?: string[] } | null)?.partiel) || []) as string[];`, BANC, "㉚ bis"],
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
  ["R60 le scan illisible ne se dit pas", PJ, `, securite: "le scan de sécurité", fonctions:`, `, fonctions:`, BANC, "㊸"],
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

  // P1-15 (2026-11-13) : les cinq trous de tests relevés par la relecture de #866.
  ["R71 le scan annulé (« n'a pas abouti ») ne se dit plus", PJ, `  if (sc) {\n`, `  if (sc && sc.nature === "echec") {\n`, BANC, "㊸"],
  ["R72 le seuil du scan muet ramené à quatre jours", PJ, `export const SCAN_MUET_MS = 8 * 864e5;`, `export const SCAN_MUET_MS = 4 * 864e5;`, BANC, "㊸"],
  ["R73 au-delà de trois cents PR, les lues sont jetées", FN, `return { ok: true, lignes, raison: Array.isArray(reste)`, `return { ok: true, lignes: [], raison: Array.isArray(reste)`, BANC, "㊵"],
  ["R74 une page ILLISIBLE jette les pages lues", FN, `if (!Array.isArray(lot)) return { ok: false, lignes, raison:`, `if (!Array.isArray(lot)) return { ok: false, lignes: [], raison:`, BANC, "㊵"],
  ["R75 verdict lit runs[\"veille\"] sans que la liste du voyant le sache", PJ, `  const runs = gh.runs || {};\n`, `  const runs = gh.runs || {};\n  if (runs["veille"] && false) orange.push("x");\n`, "tests/unit/pilotage.test.mjs", "㊴ bis"],
  ["R76 verdict déstructure runs (le relevé ne la voit pas)", PJ, `  const runs = gh.runs || {};\n`, `  const runs = gh.runs || {};\n  const { veille: _v } = runs;\n`, "tests/unit/pilotage.test.mjs", "㊴ bis"],

  // T4 de l'audit « 100 000 » (2026-11-21) : l'état « la Sentinelle n'a pas tout traité ». Numérotées à partir de R120.
  ["R120 l'état « pas tout traité » tient le voyant de la veille (un tiers la fige en gonflant un volume)", FN, `|| !!(parcoursVeille && parcoursVeille.tronque) || partielGh.length > 0;`, `|| !!(parcoursVeille && parcoursVeille.tronque) || partielGh.length > 0 || (((e.github as { issues?: { labels: string[] }[] } | null)?.issues) || []).some((i) => i.labels.includes("sentinelle-partielle"));`, BANC, "T4-k"],
  ["R121 le label de l'état n'est pas suivi : l'issue n'atteint jamais l'écran", PJ, `"recidive", "reparation", LABEL_SENTINELLE_PARTIELLE];`, `"recidive", "reparation"];`, BANC, "T4-k"],
  ["R122 l'état ne colore pas le voyant : « rien à corriger » sur fond vert", PJ, `  if (sentinellePartielle(issues)) orange.push("la Sentinelle n'a pas tout traité : le calme n'est pas prouvé");\n`, ``, BANC, "T4-k"],
  ["R123 l'état tombe dans « Une note ouverte », avec un bouton Fermer", PJ, `    if (labels.includes(LABEL_SENTINELLE_PARTIELLE)) {`, `    if (false) {`, BANC, "T4-k"],
  ["R124 l'état passe le voyant au rouge (le téléphone sonne pour un volume)", PJ, `  if (sentinellePartielle(issues)) orange.push("la Sentinelle n'a pas tout traité`, `  if (sentinellePartielle(issues)) rouge.push("la Sentinelle n'a pas tout traité`, "tests/unit/pilotage.test.mjs", "T4-b"],
  ["R125 relue et encore ouverte : un « Régler » principal qui ne règle rien", PJ, `      else if (srE && srE.etat === "faite") ajoute(`, `      else if (false) ajoute(`, "tests/unit/pilotage.test.mjs", "T4-c"],
  ["R126 en pause, la ligne de l'état garde un bouton qui ne lit rien", PJ, `      if (gh && gh.pause) ajoute({ ...ligne, prio: 2, quoi: "En pause : elle ne relit rien." });\n      else if (enVol(srE))`, `      if (enVol(srE))`, "tests/unit/pilotage.test.mjs", "T4-c"],
  ["R127 « rien à corriger » revient alors que la Sentinelle n'a pas tout traité", PJ, `quoi: partielle ? "La Sentinelle n'a pas tout traité : voir sa ligne."`, `quoi: false ? "La Sentinelle n'a pas tout traité : voir sa ligne."`, "tests/unit/pilotage.test.mjs", "T4-d"],
  // La table de télémétrie se ferme, et personne ne le voit (2026-11-21, audit du 20/11, trou T2).
  // Logique pure (pilotage.test.mjs, T2-a à T2-g), fonction exécutée (ce banc, T2-h à T2-n), battement (⑧).
  // R96, R98 et R119 sont des épingles de TEXTE (l'ordre d'un appel, la valeur d'un dépassement de délai) : le banc
  // exécuté ne sait pas faire durer un compte 4 s, ni voir qu'une marque est écrite trop tôt.
  ["R77 les marques du canari se comptent, pas les quarts d'heure distincts", PJ, `const quart = (m) => Math.floor(m.t / (CANARI_TOUTES_MIN * 60e3));`, `const quart = (m) => m.t;`, PUR, "T2-a"],
  ["R78 un seul refus du canari fait déjà une ligne", PJ, `export const CANARI_SUITE_MIN = 2;`, `export const CANARI_SUITE_MIN = 1;`, PUR, "T2-a"],
  ["R79 le débit saturé rougit (tout porteur de la clé publique ferait sonner)", PJ, `if (classeCanari(m.p.classe) === "debit") debit = debit || m;`, `if (false) debit = debit || m;`, PUR, "T2-a"],
  ["R80 le débit saturé fait sonner la veille", PJ, `if (classeCanari(m.p.classe) === "debit") debit = debit || m;`, `if (false) debit = debit || m;`, BANC, "T2-l"],
  ["R81 un refus de 40 min tient encore la ligne", PJ, ` || maintenant - derniere.t > CANARI_MEMOIRE_MS) return rien;`, `) return rien;`, PUR, "T2-b"],
  ["R82 le succès qui clôt une suite de refus ne se note plus", PJ, `  if (resultat.emis === true && bilan && bilan.enCours) return { ok: true };\n`, ``, BANC, "T2-h"],
  ["R83 les statistiques vivantes seules (0 après un arrêt brutal)", PJ, `const lus = [compte(s.vivantes), compte(s.estimees)].filter((x) => x !== null);`, `const lus = [compte(s.vivantes)].filter((x) => x !== null);`, PUR, "T2-d"],
  ["R84 les seuils de classe ne sont plus validés", PJ, `const classes = !!(cv && rv && cc && rc && cv < rv && rv <= borne && cc < rc && rc <= borneComptes);`, `const classes = !!(cv && rv && cc && rc);`, PUR, "T2-d"],
  ["R85 la jauge rougit après migration (sur un point de consigne)", PJ, `const seuilRouge = classes ? Infinity : REMPLISSAGE_SANS_SEUILS.rouge * borne;`, `const seuilRouge = classes ? rv : REMPLISSAGE_SANS_SEUILS.rouge * borne;`, PUR, "T2-d"],
  ["R86 après migration, la jauge fait sonner la veille", PJ, `const seuilRouge = classes ? Infinity : REMPLISSAGE_SANS_SEUILS.rouge * borne;`, `const seuilRouge = classes ? rv : REMPLISSAGE_SANS_SEUILS.rouge * borne;`, BANC, "T2-i"],
  ["R87 le motif du serveur part dans une raison du voyant (donc dans la sonnerie)", PJ, `(cn.rouge ? rouge : orange).push(RAISONS_CANARI[classeCanari(cn.classe)]);`, `(cn.rouge ? rouge : orange).push(RAISONS_CANARI[classeCanari(cn.classe)] + " : " + cn.motif);`, PUR, "T2-e"],
  ["R88 le remplissage et la sonde non lus laissent l'écran vert", PJ, `  remplissage: "remplissage de la télémétrie", canari: "sonde de télémétrie",\n`, ``, PUR, "T2-e"],
  ["R89 le motif du serveur dans le titre de la ligne", PJ, `titre: TITRES_CANARI[classe],`, `titre: TITRES_CANARI[classe] + " " + cn.motif,`, PUR, "T2-f"],
  ["R90 deux lignes pour une même table pleine", PJ, ` && !(cn && cn.refuse && cn.classe === "table_pleine")) {`, `) {`, PUR, "T2-f"],
  ["R91 la ligne tait que le ralentissement reste posé", PJ, `, averti: RALENTI_RESTE }`, `, averti: "" }`, PUR, "T2-f"],
  ["R92 la jauge de la table dans la boucle des jauges : un problème sans bouton", PJ, `x.cle !== "emails" && x.cle !== "tableTelemetrie" && (x.couleur`, `x.cle !== "emails" && (x.couleur`, PUR, "㊴"],
  ["R93 ralentir l'app entre dans « Tout régler »", PJ, `valeur: { niveau: niveau + 1 } }, false)], averti:`, `valeur: { niveau: niveau + 1 } }, true)], averti:`, PUR, "㊽"],
  ["R94 le canari part sous la clé de service (le refus fait aux visiteurs ne se voit plus)", FN, `const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });`, `const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });`, BANC, "T2-h"],
  ["R95 la marque du canari n'est jamais écrite", FN, `  await etape(() => noterCanari(admin, canari, e.canari));\n`, ``, BANC, "T2-h"],
  ["R96 la marque du canari s'écrit avant l'alerte (épingle de texte)", FN, `  const d = decideAlerte(prec, actuel);\n`, `  await noterCanari(admin, { emis: false }, null).catch(() => null);\n  const d = decideAlerte(prec, actuel);\n`, PUR, "T2-g"],
  ["R97 le repli sans migration ne nomme plus le fichier à appliquer", FN, `r = remplissage({ vivantes: n }, { migration: MIGRATION_TELEMETRIE_CLASSES });`, `r = remplissage({ vivantes: n });`, BANC, "T2-i"],
  ["R98 un compte abandonné après 4 s se lit « 0 ligne » (épingle de texte)", FN, `REMPLISSAGE_DELAI_MS, null);`, `REMPLISSAGE_DELAI_MS, 0);`, PUR, "T2-g"],
  ["R99 une erreur de la fonction SQL est avalée par le repli", FN, `    if (error && !fonctionSqlAbsente(error)) throw error;\n    const n = await avecDelai(`, `    const n = await avecDelai(`, BANC, "T2-j"],
  ["R100 le remplissage illisible ne tient plus le voyant de la veille", FN, `[sante, signalements, github, parc, rempl, can].some(`, `[sante, signalements, github, parc, can].some(`, BANC, "T2-j"],
  ["R101 la mémoire du canari illisible ne tient plus le voyant de la veille", FN, `[sante, signalements, github, parc, rempl, can].some(`, `[sante, signalements, github, parc, rempl].some(`, BANC, "T2-j"],
  ["R102 la mémoire du canari illisible se lit « aucun refus »", FN, `  if (error) throw error;\n  return bilanCanari(data || []);`, `  return bilanCanari(data || []);`, BANC, "T2-j"],
  ["R103 la veille lève son délestage quand la table écarte les battements des comptes", FN, `  if (remplissageAveugle(rp)) aveugle = true;\n`, ``, BANC, "T2-k"],
  ["R104 le délestage ne reçoit plus le remplissage", FN, `delestageAuto(admin, signaux, e.remplissage)`, `delestageAuto(admin, signaux)`, BANC, "T2-k"],
  ["R105 la jauge de la table n'est plus dans la capacité", FN, `    if (rp) cap.jauges.push(jaugeRemplissage(rp));\n`, ``, BANC, "T2-i"],
  ["R106 le voyant de la veille ne reçoit ni le remplissage ni la mémoire du canari", FN, `    remplissage: val(rempl), canari: val(can) };`, `    remplissage: null, canari: null };`, BANC, "T2-h"],
  ["R107 une lecture manquée du remplissage ne se dit pas au battement", BT, `  if (telemetrieKo.length) raisons.push(`, `  if (false) raisons.push(`, "tests/unit/battement.test.mjs", "⑧"],
  ["R108 la page ne nomme plus la migration qui manque", PG, `if (d.remplissage && d.remplissage.migration) ja.append(`, `if (false) ja.append(`, PUR, "T2-g"],
  ["R109 la classe d'une marque sort telle qu'elle est écrite (liste ouverte)", PJ, `const classeCanari = (c) => (CLASSES_REFUS_CANARI.includes(c) ? c : "autre");`, `const classeCanari = (c) => c;`, PUR, "T2-a"],
  ["R110 le motif du serveur n'est ni borné ni nettoyé", PJ, `  const motif = sansControle(erreur, 120);\n`, `  const motif = String(erreur == null ? "" : erreur);\n`, PUR, "T2-c"],
  ["R111 un remplissage non mesuré se lit 0 ligne", PJ, `const compte = (x) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);`, `const compte = (x) => Number(x) || 0;`, PUR, "T2-d"],
  ["R112 le voyant dit deux fois la même table pleine", PJ, `const pleineDite = !!(cn && cn.refuse && cn.classe === "table_pleine");`, `const pleineDite = false;`, PUR, "T2-e"],
  ["R113 « Télémétrie pleine à 137,5 % » (rapporté aux visiteurs quand les comptes écrivent encore)", PJ, `(Number(r.pct) > 100 ? "Télémétrie pleine" : "Télémétrie pleine à " + pctRemplissage(r));`, `("Télémétrie pleine à " + pctRemplissage(r));`, PUR, "T2-e"],
  ["R114 un refus qui n'est ni la borne ni le débit propose de ralentir l'app", PJ, `const geste = classe === "autre" ? `, `const geste = false ? `, PUR, "T2-f"],
  ["R115 « Régler » propose un niveau de délestage qui n'existe pas, ou sans table des réglages", PJ, `const peutRalentir = !!(d && d.reglages && !d.reglages.absente) && niveau < 2;`, `const peutRalentir = true;`, PUR, "T2-f"],
  ["R116 l'écran ne lit ni le remplissage ni la mémoire du canari", FN, `    remplissage: lireRemplissage(admin), canari: lireCanari(admin),\n`, ``, BANC, "T2-h"],
  ["R117 le remplissage devient une lecture EXIGÉE du battement (les battements d'avant ce lot passent « incomplets »)", BT, `export const LECTURES_BATTEMENT = Object.freeze(["sante", "signalements", "github", "parcours"]);`, `export const LECTURES_BATTEMENT = Object.freeze(["sante", "signalements", "github", "parcours", "remplissage"]);`, "tests/unit/battement.test.mjs", "⑧"],
  ["R118 chaque canari réussi laisse une marque (96 lignes par jour pour rien)", PJ, `if (resultat.emis === true && bilan && bilan.enCours) return { ok: true };`, `if (resultat.emis === true) return { ok: true };`, BANC, "T2-h"],
  ["R119 le motif du serveur part aux journaux de la fonction (épingle de texte)", FN, `console.warn("veille : marque du canari refusée " + JSON.stringify({ code: String((error as { code?: string }).code || "?") }));`, `console.warn("veille : marque du canari refusée " + JSON.stringify({ code: String((error as { code?: string }).code || "?"), motif: m.motif }));`, PUR, "T2-g"],
  ["R132 un remplissage non mesuré passe pour une table vide (la veille lâche son voyant)", FN, `  if (r.vivantes === null) throw new Error("remplissage de la télémétrie non mesuré`, `  if (false) throw new Error("remplissage de la télémétrie non mesuré`, BANC, "T2-j"],
  // Temps 2 : la migration et le code se tiennent (la migration elle-même a ses 19 mutants : tests/sql/migration-telemetrie-classes.test.sh).
  ["R133 la base ne protège plus un type que le client ne jette jamais", MG, `'flow', 'link', 'rt_recv', 'push'`, `'flow', 'link', 'push'`, PUR, "T2-m"],
  ["R134 la lecture SQL rend une clé que le pilotage ne lit pas", MG, `    'vivantes', pg_catalog.pg_stat_get_live_tuples(`, `    'lignes', pg_catalog.pg_stat_get_live_tuples(`, PUR, "T2-m"],
  ["R135 un seuil de classe n'est plus 60 % de sa borne", MG, `telemetrie_classe_bornee('480000', '720000', '720000', '1080000');`, `telemetrie_classe_bornee('500000', '720000', '720000', '1080000');`, PUR, "T2-m"],
  // Contre-revue du lot (2026-11-21) : les suites de refus mêlées, la lecture des marques, la fonction SQL qui lève.
  ["R136 le rouge se décide sur la classe du DERNIER refus (un délai isolé après des refus de débit sonne ; un refus de débit sonne « résolu »)", PJ, `const rouge = graves.size >= CANARI_SUITE_MIN && maintenant - grave.t <= CANARI_MEMOIRE_MS;`, `const rouge = refuse && classeCanari(derniere.p.classe) !== "debit";`, PUR, "T2-a"],
  ["R137 de vieux refus graves tiennent le rouge sous des refus de débit", PJ, `const rouge = graves.size >= CANARI_SUITE_MIN && maintenant - grave.t <= CANARI_MEMOIRE_MS;`, `const rouge = graves.size >= CANARI_SUITE_MIN;`, PUR, "T2-a"],
  ["R138 la ligne montre la classe du dernier refus (une ligne orange au titre d'une urgence, un rouge au titre du débit)", PJ, `const montree = rouge ? grave : (refuse && debit) || derniere;`, `const montree = derniere;`, PUR, "T2-a"],
  ["R139 les marques du canari se lisent des plus vieilles aux plus récentes (au-delà de 12, les refus récents ne sont plus lus)", FN, `.gte("created_at", ilYa(CANARI_LECTURE_MS)).order("created_at", { ascending: false }).limit(CANARI_MARQUES_MAX);`, `.gte("created_at", ilYa(CANARI_LECTURE_MS)).order("created_at", { ascending: true }).limit(CANARI_MARQUES_MAX);`, BANC, "T2-n"],
  ["R140 les marques du canari se lisent sans tri", FN, `.gte("created_at", ilYa(CANARI_LECTURE_MS)).order("created_at", { ascending: false }).limit(CANARI_MARQUES_MAX);`, `.gte("created_at", ilYa(CANARI_LECTURE_MS)).limit(CANARI_MARQUES_MAX);`, BANC, "T2-n"],
  ["R141 les marques du canari se lisent sans fenêtre (un refus de la veille allonge la suite)", FN, `\n    .gte("created_at", ilYa(CANARI_LECTURE_MS)).order("created_at", { ascending: false }).limit(CANARI_MARQUES_MAX);`, `\n    .order("created_at", { ascending: false }).limit(CANARI_MARQUES_MAX);`, BANC, "T2-n"],
  ["R142 une marque du canari écrite par un compte est crue (tout compte ferait sonner)", FN, `.eq("event", EVT_CANARI).eq("user_id", "systeme:pilotage")`, `.eq("event", EVT_CANARI)`, BANC, "T2-n"],
  ["R143 un 42883 levé depuis la fonction SQL ouvre le repli (seuils d'avant migration sur une table protégée)", FN, `    if (error && !fonctionSqlAbsente(error)) throw error;\n    const n = await avecDelai(`, `    if (error && !estObjetAbsent(error)) throw error;\n    const n = await avecDelai(`, BANC, "T2-j"],
  // Seconde relecture du lot (2026-11-21, B-1 et B-2) : deux refus ne sont « de suite » que séparés de 35 min au plus ;
  // et le manifeste du déploiement laisse partir `pilotage` avant la migration.
  ["R144 un trou de plus de 35 min entre deux refus ne clôt plus la suite (une veille muette fait « deux fois de suite » de deux refus isolés)", PJ, `    if (precedent - m.t > CANARI_MEMOIRE_MS) break;\n`, ``, PUR, "T2-a"],
  ["R145 des refus de débit relient deux refus graves éloignés en « deux fois de suite »", PJ, `if (precedentGrave !== null && precedentGrave - m.t > CANARI_MEMOIRE_MS) { gravesClos = true; continue; }`, `if (false) { gravesClos = true; continue; }`, PUR, "T2-a"],
  ["R146 telemetrie_remplissage() devient obligatoire : `pilotage` retenue tant que la migration n'est pas appliquée", ".passio/deploiement/prerequis-fonctions.json", `"obligatoire": false,\n      "sans": "aucun prérequis SQL propre : lit des tables de base`, `"obligatoire": true,\n      "sans": "aucun prérequis SQL propre : lit des tables de base`, "tests/unit/deploiement-fonctions.test.mjs", "T2-p"],
  // T3 de l'audit « 100 000 » (2026-11-21, lot B1) : un NOUVEAU problème sonne sous un rouge qui dure ; la mesure d'échelle
  // (battement, écran, veille GitHub) sans changer AUCUNE couleur du voyant. Logique pure (pilotage.test.mjs T3-a à T3-h),
  // fonction exécutée (ce banc, T3-i à T3-o), battement (T3-l), veille GitHub (T3-m). R171, R176 et R179 sont des épingles de TEXTE.
  ["R150 plus de sonnerie pour une raison rouge NEUVE sous un rouge qui dure", PJ, `  if (a.couleur === "rouge" && p.couleur === "rouge" && Array.isArray(p.codes)) {`, `  if (false) {`, BANC, "T3-i"],
  ["R151 un code hors de la liste fermée sonne", PJ, `const codesValides = (x) => (x && Array.isArray(x.codes) ? x.codes.filter(estCodeRouge) : []);`, `const codesValides = (x) => (x && Array.isArray(x.codes) ? x.codes : []);`, PUR, "T3-d"],
  ["R152 une raison qui clignote re-sonne avant la période de rappel", PJ, `.filter((c) => !deja.includes(c) && !recente(c));`, `.filter((c) => !deja.includes(c));`, BANC, "T3-i"],
  ["R153 une lecture incomplète fait taire une raison neuve venue d'une source lue", PJ, `  if (a.couleur === "rouge" && p.couleur === "rouge" && Array.isArray(p.codes)) {`, `  if (a.couleur === "rouge" && p.couleur === "rouge" && Array.isArray(p.codes) && !a.tenu) {`, PUR, "T3-d"],
  ["R154 un état d'avant ce lot (sans codes) invente une nouveauté à chaque passage", PJ, `  if (a.couleur === "rouge" && p.couleur === "rouge" && Array.isArray(p.codes)) {\n    let neufs = [];\n    try {\n      const deja = p.codes.filter(`, `  if (a.couleur === "rouge" && p.couleur === "rouge") {\n    let neufs = [];\n    try {\n      const deja = (Array.isArray(p.codes) ? p.codes : []).filter(`, BANC, "T3-j"],
  ["R155 un état hostile fait lever decideAlerte (plus aucune sonnerie, résolu compris)", PJ, `    } catch (_e) { neufs = []; }`, `    } catch (_e) { throw _e; }`, PUR, "T3-e"],
  ["R156 des annonces illisibles (null) font taire la raison neuve", PJ, `const ann = objetSimple(p.annonces) ? p.annonces : {};`, `const ann = p.annonces;`, PUR, "T3-e"],
  ["R157 un voyant tenu oublie les codes d'avant (ils re-sonneraient à la lecture suivante)", PJ, `    if (actuel.tenu && precRouge) codes = codes.concat(codesValides(p));\n`, ``, PUR, "T3-f"],
  ["R158 un état hostile fait lever memoireAlerte", PJ, `  } catch (_e) { return { codes: [], annonces: {} }; }`, `  } catch (_e) { throw _e; }`, PUR, "T3-e"],
  ["R159 des annonces mémorisées nulles vident la mémoire des codes", PJ, `if (precRouge && objetSimple(p.annonces)) {`, `if (precRouge) {`, BANC, "T3-j"],
  ["R160 la raison « déploiement » perd son code (une autre la porte)", PJ, `  coder("deploiement");\n`, ``, PUR, "T3-b"],
  ["R161 tous les parcours portent le même code (une seconde panne ne sonne plus)", PJ, `? "parcours:" + idsRouges[i] : "parcours"));`, `? "parcours" : "parcours"));`, PUR, "T3-b"],
  ["R162 un identifiant de parcours est recopié tel quel dans un code", PJ, `/^[a-z][a-z0-9_]{1,39}$/.test(String(idsRouges[i]))`, `true`, PUR, "T3-b"],
  ["R163 le verdict ne rend plus ses codes", PJ, `raisons: rouge.concat(orange), codes: [...new Set(codes)], rouges:`, `raisons: rouge.concat(orange), rouges:`, BANC, "T3-i"],
  ["R164 la table de télémétrie pleine n'a pas de code de la liste", PJ, `"deploiement", "veille", "telemetrie", "humain"]);`, `"deploiement", "veille", "humain"]);`, PUR, "T3-b"],
  ["R165 l'écran lit un nombre de connectés sans le valider", PJ, `const d = typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;`, `const d = n == null ? null : Number(n);`, PUR, "T3-g"],
  ["R166 la veille passe les codes du voyant TENU (aucun) au lieu du verdict mesuré", FN, `const mesuree = { codes: v.couleur === "rouge" ? v.codes : [], rouges: v.couleur === "rouge" ? v.rouges : [] };`, `const mesuree = { codes: [] as string[], rouges: [] as unknown[] };`, BANC, "T3-i"],
  ["R167 l'état mémorisé n'écrit ni codes ni annonces", FN, `      codes: memo.codes, annonces: memo.annonces,\n`, ``, BANC, "T3-i"],
  ["R168 l'état n'est pas réécrit quand l'ensemble des raisons change", FN, ` || d.sonner || codesChange);`, ` || d.sonner);`, BANC, "T3-i"],
  ["R169 une mémoire qui lève fait taire l'alerte", FN, `  catch { memo = { codes:`, `  catch (err) { throw err; memo = { codes:`, BANC, "T3-o"],
  ["R170 la veille ne note plus les connectés au battement", FN, `connectes5: connectes5(signaux) },`, `connectes5: null },`, BANC, "T3-k"],
  ["R171 lireSante rappelle pilotage_audience à 900 s avant le verdict (le calcul lourd refait) — épingle de texte", FN, `  const erreurs24h = await compter(`, `  await admin.rpc("pilotage_audience", { p_secondes: 900 });\n  const erreurs24h = await compter(`, PUR, "T3-h"],
  ["R172 le battement ne porte plus la mesure d'échelle", FN, `    echelle: { ...(e.sante || {}), connectes5: connectes5(signaux) },\n`, ``, BANC, "T3-k"],
  ["R173 l'écran ne dit plus les seuils du voyant", FN, `  out.echelle = resumeEchelle(connectes5(maintenant));\n`, ``, BANC, "T3-k"],
  ["R174 l'historique garde chaque réécriture d'un rouge qui dure (les vraies transitions sont chassées)", FN, `  return lignes.filter((l, i) => { const avant = lignes[i + 1]; return !avant || avant.couleur !== l.couleur || avant.dispo !== l.dispo; }).slice(0, 12);`, `  return lignes.slice(0, 12);`, BANC, "T3-i"],
  ["R175 l'écran ne reçoit plus les connectés", FN, `out.echelle = resumeEchelle(connectes5(maintenant));`, `out.echelle = resumeEchelle(null);`, BANC, "T3-k"],
  ["R176 le classement mort des 300 lignes revient dans lireSante — épingle de texte", FN, `  const erreurs24h = await compter(`, `  await admin.from("client_errors").select("message,uid,created_at").limit(300);\n  const erreurs24h = await compter(`, PUR, "T3-h"],
  ["R177 le battement ne porte plus l'échelle", BT, `    echelle: echelle && typeof echelle === "object" ? Object.fromEntries(CLES_ECHELLE.map((k) => [k, nombreFini(echelle[k])])) : null,\n`, ``, BT_SUITE, "T3-l"],
  ["R178 le battement recopie la mesure sans filtre (une chaîne passe)", BT, `const nombreFini = (x) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : null);`, `const nombreFini = (x) => x;`, BT_SUITE, "T3-l"],
  ["R179 la page rend les phrases d'échelle en HTML — épingle de texte", PG, `ze.append(el("p", "discret", String(t)))`, `ze.insertAdjacentHTML("beforeend", String(t))`, PUR, "T3-h"],
  ["R180 une panne de parcours NON confirmée devient rouge (et porte un code)", PAR, `export const estPanneRouge = (p) => !!p && p.etat === "panne" && p.panneConfirmee === true && p.criticite === "critique";`, `export const estPanneRouge = (p) => !!p && p.etat === "panne" && p.criticite === "critique";`, PUR, "T3-b"],
  ["R181 la veille GitHub alerte sur du bruit de fond à 23 000 comptes (retenue retirée)", VP, `  if (n("n5xx") >= 5 && n("app5xx") >= 2 && retenue5xx(m)) {`, `  if (false) {`, VP_SUITE, "T3-m"],
  ["R182 sans compte ancien touché, l'alerte est quand même retenue (une panne des seuls comptes neufs se tait)", VP, `return autresSousPlanchers && seuil > 2 && t >= 1 && t < seuil;`, `return autresSousPlanchers && t < seuil;`, VP_SUITE, "T3-m"],
  ["R183 la veille GitHub lit un dénominateur sans le valider (une chaîne relève le seuil)", VP, `const compteLu = (x) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);`, `const compteLu = (x) => Number(x);`, VP_SUITE, "T3-m"],
  ["R184 le dénominateur de la veille GitHub compte des appareils (device_id écrits par le navigateur)", VP, `(select count(distinct t.auth_uid) from telemetry_events t join auth.users u on u.id = t.auth_uid`, `(select count(distinct t.device_id) from telemetry_events t join auth.users u on u.id = t.auth_uid`, VP_SUITE, "T3-m"],
  ["R185 les refus sont retenus à grande échelle (une attention devient « rien »)", VP, `  } else if (n("nRefus") >= 20 && n("appRefus") >= 3) {`, `  } else if (n("nRefus") >= 20 && n("appRefus") >= 3 && !(m.anciensActifs > 1000)) {`, VP_SUITE, "T3-m"],
  ["R186 le plancher est perdu : à petite échelle, le taux seul décide (un seuil à 0 ou 1 compte)", EC, `return Math.max(plancher, Math.ceil(`, `return (Math.ceil(`, PUR, "T3-a"],
  ["R187 le taux s'écrit en fraction (0.07 × 100 = 7.000000000000001, le seuil passe à 8)", EC, `Math.ceil((Math.floor(denominateur) * pourMille) / POUR_MILLE)`, `Math.ceil(Math.floor(denominateur) * (pourMille / POUR_MILLE))`, PUR, "T3-a"],
  ["R188 un dénominateur illisible (NaN, chaîne, négatif) relève le seuil", EC, `  if (typeof denominateur !== "number" || !Number.isFinite(denominateur) || denominateur <= 0) return plancher;\n`, ``, PUR, "T3-a"],
  ["R189 un taux non entier ou nul passe", EC, `  if (!Number.isInteger(pourMille) || pourMille <= 0) return plancher;\n`, ``, PUR, "T3-a"],
  // Contre-revue de B1 (2026-11-21) : B-1 (veille GitHub), B-2 (historique), B-3 (raison arrivée avec le site injoignable),
  // B-4 (annonce future ; la mesure des connectés vient de l'appel à 300 s déjà fait, exact seulement).
  ["R190 5 000 réponses 5xx hors comptes anciens se taisent derrière un compte ancien touché", VP, `const autresSousPlanchers = !(n >= 5 && d >= 2);`, `const autresSousPlanchers = true;`, VP_SUITE, "T3-m"],
  ["R191 une alerte retenue devient « rien » au lieu d'une attention", VP, `    etat = "warn";\n    lignes.push("réponses ≥ 500 chez`, `    etat = "ok";\n    lignes.push("réponses ≥ 500 chez`, VP_SUITE, "T3-m"],
  ["R192 les lignes hors comptes anciens non mesurées n'empêchent plus la retenue", VP, `if (t === null || a === null || n === null || d === null || a <= 0) return false;`, `if (t === null || a === null || a <= 0) return false;`, VP_SUITE, "T3-m"],
  ["R193 les réécritures pour les seuls codes ne sont plus marquées", FN, `      ...(seulCodes ? { motif: "codes" } : {}),\n`, ``, BANC, "T3-q"],
  ["R194 l'historique ne les écarte plus (un code qui clignote chasse les vraies transitions)", FN, `.eq("user_id", "systeme:pilotage").or("properties->>motif.is.null,properties->>motif.neq.codes")\n`, `.eq("user_id", "systeme:pilotage")\n`, BANC, "T3-q"],
  ["R195 une réécriture qui a SONNÉ est marquée « pour les seuls codes »", FN, `prec.dispo === actuel.dispo && !d.sonner && codesChange;`, `prec.dispo === actuel.dispo && codesChange;`, BANC, "T3-q"],
  ["R196 l'historique fond deux lignes de même couleur et d'autre disponibilité", FN, ` || avant.dispo !== l.dispo; }).slice(0, 12)`, `; }).slice(0, 12)`, BANC, "T3-q"],
  ["R197 une raison arrivée avec « ne répond plus » se mémorise sans annonce (jamais annoncée)", PJ, `      codes = codes.filter((c) => avant.includes(c));\n`, ``, PUR, "T3-p"],
  ["R198 une annonce datée dans le futur tait la raison", PJ, ` && t <= maintenant + 60e3;`, `;`, PUR, "T3-p"],
  ["R199 le repli par appareils (device_id du navigateur) fait un dénominateur", FN, `(a && a.exact ? a.connexions ?? null : null)`, `(a ? a.connexions ?? null : null)`, BANC, "T3-o"],
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
    // Le rapporteur est NOMMÉ (2026-11-21) : sans TTY, Node 22 (celui de la CI) rend du TAP (« # fail 1 ») et non
    // « ℹ fail 1 » — le verdict ci-dessous ne reconnaissait alors aucun rouge, et tout sortait « VERT (? test joué) ».
    const r = spawnSync(process.execPath, ["--test", "--test-reporter=spec", "--test-name-pattern", "^" + motif + " ", suite], { encoding: "utf8", timeout: 300_000 });
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
