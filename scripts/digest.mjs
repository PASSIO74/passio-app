#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// DIGEST DU MATIN — « ce qui t'attend, ce que les machines ont fait » (2026-09-18)
//
// Pendant les mois de test, tout ce qui exige Benjamin doit lui arriver PAR
// E-MAIL GITHUB, UNE FOIS, AVEC LE GESTE À FAIRE — et rien d'autre. Mesuré sur
// 10 jours : 3 enquêtes sentinelle perdues en silence, une PR de documentation
// en attente 2 jours, une contre-revue exigée par la gouvernance sans que rien
// ne la réclame, des résidus à échéance datée que personne ne relit. Ce script
// lit GitHub (PR, issues, runs), le registre des résidus et trois chiffres
// d'usage, puis `composerDigest()` — fonction PURE, testée seule — écrit le
// digest. Le workflow `.github/workflows/digest.yml` l'ouvre en issue
// `[DIGEST]` (label `digest`, jamais `claude`) chaque matin où il y a quelque
// chose à faire, et le lundi dans tous les cas.
//
// ⚠️ IL NE MODIFIE RIEN. Lecture seule, GitHub compris.
// ⚠️ VIE PRIVÉE : le dépôt est PUBLIC. Comptages, numéros de PR/issues, titres
// (neutralisés) — jamais un e-mail ni un identifiant de personne.
//
//   node scripts/digest.mjs            → digest lisible
//   node scripts/digest.mjs --json     → même digest en JSON (workflow)
//   variables : GH_TOKEN, GITHUB_REPOSITORY, SUPABASE_ACCESS_TOKEN (usage)
//   codes de sortie : 0 rien à émettre, 3 digest à émettre, autre = panne.
// ═══════════════════════════════════════════════════════════════════════════
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { heureParis, mesurerUsage } from "./veille-production.mjs";

const H = 3600_000;
const J = 24 * H;

// Périmètre critique de deploy.yml (job Gouvernance) : une PR qui y touche
// exige une revue GitHub de PASSIO74, ancrée sur le SHA de tête, dont le corps
// contient le marqueur. Même liste, même marqueur — deux constructions du même
// périmètre finiraient par diverger.
export const FICHIERS_CRITIQUES = [
  /^\.github\//, /^migrations\//,
  /^dashboard\/server\/(auth|config|repair|sentinel)\.js$/,
  /^scripts\/run_migrations\.js$/, /^scripts\/sauvegarde-donnees\.js$/,
];
export const MARQUEUR_CONTRE_REVUE = "Contre-revue technique indépendante";
export const RELECTEUR = "PASSIO74";
// Issues dont l'ouverture est, par construction, un geste humain en attente.
// `veille-muette` / `digest-muet` : un canal qui ne parle plus (jeton, API) ;
// ces issues ne portent PAS `disponibilite`, sinon la sonde du site les
// refermerait sous 2-5 h avec « le site répond de nouveau » (constat B-05).
export const LABELS_HUMAINS = ["humain", "recidive", "moderation", "disponibilite", "veille", "veille-muette", "digest-muet"];
export const SENTINELLE_ATTENTE_H = 6;
export const PR_SENTINELLE_ATTENTE_H = 2;
export const RESIDU_HORIZON_J = 7;

export const estCritique = (chemin) => FICHIERS_CRITIQUES.some((re) => re.test(String(chemin || "")));

/**
 * Une PR ouverte, non brouillon, qui touche le périmètre critique, sans
 * contre-revue de PASSIO74 sur son SHA de tête.
 */
export function contreRevueManquante(pr) {
  if (!pr || pr.isDraft || (pr.state && pr.state !== "open") || pr.mergedAt) return false;
  const critiques = (pr.files || []).filter(estCritique);
  if (!critiques.length) return false;
  const revue = (pr.reviews || []).some((r) => r && r.login === RELECTEUR && r.commit_id === pr.headRefOid
    && String(r.body || "").includes(MARQUEUR_CONTRE_REVUE));
  return !revue;
}

/**
 * La date d'échéance la plus proche portée par la condition d'un résidu (ou null).
 * Une condition datée s'écrit « échéance AAAA-MM-JJ » ; une condition manuelle
 * dit « au plus tard le … » ou « visé avant le … » (RES-13, RES-14). Le
 * « (aujourd'hui AAAA-MM-JJ) » qui suit n'est PAS une échéance.
 */
export function echeanceResidu(ligne) {
  const detail = String((ligne && ligne.condition && ligne.condition.detail) || "");
  const dates = [...detail.matchAll(/(?:échéance|au plus tard le|avant le) (\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  return dates.length ? dates.sort()[0] : null;
}

// Un titre d'issue ou de PR est du texte d'un tiers (ou d'un script) qui finit
// dans une issue publique : une ligne, bornée, sans outil Markdown (balise,
// bloc de code, image `![](…)` qui ferait charger une URL chez qui la lit),
// sans `@mention` (une notification chez un inconnu) ni `#n` (un renvoi dans
// la chronologie d'une autre issue).
export function propre(texte, max = 110) {
  return String(texte || "").replace(/[\r\n\t]+/g, " ").replace(/[`<>[\]]/g, "'").replace(/@/g, "(a)").replace(/#/g, "n°").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

const ageH = (iso, now) => (Number.isFinite(Date.parse(iso)) ? Math.floor((now - Date.parse(iso)) / H) : null);
const dureeTxt = (h) => (h === null ? "?" : h >= 48 ? `${Math.floor(h / 24)} j` : `${h} h`);
const labelsDe = (issue) => (issue.labels || []).map((l) => (typeof l === "string" ? l : l && l.name)).filter(Boolean);

/**
 * Fonction PURE : données lues → digest. Testée seule (tests/unit/digest.test.mjs).
 * @param {{prs:Array, issues:Array, runs:Record<string,Array>, residus:{lignes:Array}|{erreur:string}, usage:object, depuis:string}} d
 * @returns {{aFaire:Array<{cle:string,titre:string,geste:string,lien:string}>, machines:object, usage:object, emettre:boolean, lundi:boolean, titre:string, texte:string}}
 */
export function composerDigest(d, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  const p = heureParis(t);
  const prs = (d && d.prs) || [];
  const issues = (d && d.issues) || [];
  const runs = (d && d.runs) || {};
  const depuisMs = d && Number.isFinite(Date.parse(d.depuis)) ? Date.parse(d.depuis) : t - J;
  const depuis = new Date(depuisMs).toISOString();
  const aFaire = [];

  // 1. Contre-revues : le geste exact, celui que la gouvernance vérifie.
  for (const pr of prs.filter(contreRevueManquante)) {
    const n = (pr.files || []).filter(estCritique).length;
    aFaire.push({
      cle: `contre-revue:${pr.number}`,
      titre: `PR #${pr.number} « ${propre(pr.title)} » touche ${n} fichier(s) du périmètre critique sans contre-revue sur son SHA de tête`,
      geste: `relis-la, puis \`gh pr review ${pr.number} --comment --body "${MARQUEUR_CONTRE_REVUE} — <ce que tu as vérifié>"\` (ou le bouton Review dans GitHub) ; chaque nouveau commit sur la PR la redemande`,
      lien: pr.url || "",
    });
  }

  // 2. Issues qui attendent un humain par construction.
  const ouvertes = issues.filter((i) => !i.state || i.state === "open");
  for (const i of ouvertes) {
    const labels = labelsDe(i);
    const humains = labels.filter((l) => LABELS_HUMAINS.includes(l));
    const distante = /\[SENTINELLE DISTANTE\]/.test(String(i.title || ""));
    if (!humains.length && !distante) continue;
    const quoi = humains[0] || "sentinelle-distante";
    const geste = {
      humain: "lis le bilan dans l'issue, décide (corriger à la main, fermer, ou relancer le label claude une fois), puis ferme-la",
      recidive: "le même défaut revient après un correctif déployé : une décision humaine, pas une troisième enquête automatique",
      moderation: "en local : `npm run moderation` puis `traiter --id … --statut handled|dismissed`",
      disponibilite: "regarde app.netlify.com et status.supabase.com ; l'issue se referme seule au retour",
      veille: "lis « Ce que tu fais » dans l'issue ; elle se referme seule quand le signal revient",
      "veille-muette": "ouvre le run lié dans l'issue : jeton expiré (SUPABASE_ACCESS_TOKEN, SENTINELLE_TOKEN → Settings > Secrets) ou API en panne ; l'issue se referme au prochain verdict rendu",
      "digest-muet": "ouvre le run lié dans l'issue : API GitHub, SUPABASE_ACCESS_TOKEN ou registre des résidus ; l'issue se referme au prochain digest composé",
      "sentinelle-distante": "ouvre le run lié dans l'issue : audit rouge, page publique ou canari staging",
    }[quoi];
    aFaire.push({
      cle: `issue:${i.number}`,
      titre: `Issue #${i.number} « ${propre(i.title)} » (${[...humains, distante ? "[SENTINELLE DISTANTE]" : ""].filter(Boolean).join(", ")}) ouverte depuis ${dureeTxt(ageH(i.createdAt, t))}`,
      geste, lien: i.url || "",
    });
  }

  // 3. Enquêtes sentinelle qui traînent (sans label humain : déjà listées).
  for (const i of ouvertes) {
    const labels = labelsDe(i);
    if (!labels.includes("sentinelle") || labels.some((l) => LABELS_HUMAINS.includes(l))) continue;
    const age = ageH(i.createdAt, t);
    if (age === null || age < SENTINELLE_ATTENTE_H) continue;
    aFaire.push({
      cle: `sentinelle:${i.number}`,
      titre: `Enquête [SENTINELLE] #${i.number} ouverte depuis ${dureeTxt(age)} sans correctif fusionné`,
      geste: "ouvre l'issue : run claude-code perdu, PR bloquée par la gouvernance ou canal en panne ? Sinon ferme-la (« not planned ») pour libérer le canal",
      lien: i.url || "",
    });
  }

  // 4. PR de réparation ouvertes trop longtemps.
  for (const pr of prs) {
    if (pr.isDraft || (pr.state && pr.state !== "open") || pr.mergedAt) continue;
    if (!/^claude\/issue-\d+-/.test(String(pr.headRefName || ""))) continue;
    const age = ageH(pr.createdAt, t);
    if (age === null || age < PR_SENTINELLE_ATTENTE_H) continue;
    aFaire.push({
      cle: `pr-sentinelle:${pr.number}`,
      titre: `PR de réparation #${pr.number} « ${propre(pr.title)} » ouverte depuis ${dureeTxt(age)} sans fusion`,
      geste: "CI rouge ou gouvernance (périmètre, taille) : relis et fusionne à la main, ou ferme-la avec un mot",
      lien: pr.url || "",
    });
  }

  // 5. Résidus dont l'échéance approche (ou est passée).
  const residus = (d && d.residus) || {};
  for (const l of residus.lignes || []) {
    if (l.statut === "ferme") continue;
    const ech = echeanceResidu(l);
    if (!ech) continue;
    const jours = Math.ceil((Date.parse(ech + "T00:00:00Z") - t) / J);
    if (jours > RESIDU_HORIZON_J) continue;
    aFaire.push({
      cle: `residu:${l.id}`,
      titre: `${l.id} « ${propre(l.titre, 80)} » : échéance ${ech} (${jours < 0 ? `dépassée de ${-jours} j` : `dans ${jours} j`})`,
      geste: "décide (faire, reporter avec une date, fermer avec preuve) et écris-le dans .passio/residus/registre-residus.json — la CI refuse un résidu traitable laissé « en_attente »",
      lien: "",
    });
  }

  // Ce que les machines ont fait depuis le dernier digest.
  const fermees = issues.filter((i) => i.state === "closed" && labelsDe(i).includes("sentinelle") && Date.parse(i.closedAt) >= depuisMs);
  const prsFusionnees = prs.filter((pr) => pr.mergedAt && Date.parse(pr.mergedAt) >= depuisMs && /^claude\/issue-\d+-/.test(String(pr.headRefName || "")));
  // Des runs NON LUS (403 sans `actions: read`, API en panne) ne sont pas
  // « 0 run » : le digest le dit avec le code HTTP (constat B-01).
  const compte = (nom) => {
    const source = runs[nom];
    if (source && !Array.isArray(source) && source.erreur) return { runs: null, ok: 0, echecs: 0, erreur: String(source.erreur).slice(0, 120) };
    const liste = (Array.isArray(source) ? source : []).filter((r) => Date.parse(r.updatedAt || r.updated_at) >= depuisMs);
    const ok = liste.filter((r) => r.conclusion === "success").length;
    return { runs: liste.length, ok, echecs: liste.filter((r) => r.conclusion === "failure").length };
  };
  const nonLus = (c) => `non lus (${c.erreur})`;
  const machines = {
    sentinelle: { fermees: fermees.map((i) => i.number), prsFusionnees: prsFusionnees.map((pr) => pr.number) },
    sauvegarde: compte("sauvegarde"),
    disponibilite: compte("disponibilite"),
    veille: { ...compte("veille-production"), issueOuverte: ouvertes.some((i) => labelsDe(i).includes("veille")) },
    deploiements: compte("deploy"),
  };

  const usage = (d && d.usage) || {};
  const lundi = p.jour === 1;
  const emettre = aFaire.length > 0 || lundi;
  const titre = `[DIGEST] ${p.date} — ${aFaire.length} à faire`;
  const u = usage.inscriptions && !usage.inscriptions.erreur ? usage.inscriptions : null;
  const texte = [
    `Digest du ${p.date} (depuis le ${depuis.slice(0, 16).replace("T", " ")} UTC).`,
    "",
    `## Ce qui t'attend (${aFaire.length})`,
    ...(aFaire.length ? aFaire.map((a) => `- **${a.titre}** → ${a.geste}${a.lien ? ` — ${a.lien}` : ""}`) : ["Rien ne t'attend."]),
    "",
    "## Ce que les machines ont fait",
    `- Sentinelle autonome : ${fermees.length} enquête(s) fermée(s)${fermees.length ? ` (${fermees.map((i) => `#${i.number}`).join(", ")})` : ""}, ${prsFusionnees.length} PR de réparation fusionnée(s)`,
    `- Sauvegarde : ${machines.sauvegarde.erreur ? nonLus(machines.sauvegarde) : `${machines.sauvegarde.ok} ok / ${machines.sauvegarde.runs} run(s)${machines.sauvegarde.echecs ? `, ${machines.sauvegarde.echecs} en échec` : ""}`}`,
    `- Disponibilité : ${machines.disponibilite.erreur ? nonLus(machines.disponibilite) : `${machines.disponibilite.runs} sonde(s)${machines.disponibilite.echecs ? `, ${machines.disponibilite.echecs} en échec` : ""}`}`,
    `- Veille de production : ${machines.veille.erreur ? nonLus(machines.veille) : `${machines.veille.runs} passage(s)${machines.veille.echecs ? `, ${machines.veille.echecs} en échec` : ""}`} ; issue [VEILLE] ouverte : ${machines.veille.issueOuverte ? "oui" : "non"}`,
    `- Déploiements main : ${machines.deploiements.erreur ? nonLus(machines.deploiements) : `${machines.deploiements.ok} succès, ${machines.deploiements.echecs} échec(s)`}`,
    "",
    "## Usage",
    u ? `- Inscriptions : 24 h ${u.crees24h ?? "?"} créée(s) / ${u.confirmes24h ?? "?"} confirmée(s) ; 7 j ${u.crees7j ?? "?"} / ${u.confirmes7j ?? "?"}` : "- Inscriptions : non lues",
    `- Appareils actifs 7 j : ${Number.isFinite(usage.appareils7j) ? usage.appareils7j : "non lu"}`,
    `- Erreurs client 24 h : ${Number.isFinite(usage.erreurs24h) ? usage.erreurs24h : "non lu"}`,
    "",
    "Ce digest est écrit par `.github/workflows/digest.yml` (label `digest`, jamais `claude`). Le geste à faire est dans chaque ligne ;",
    "le mode d'emploi complet est dans docs/RUNBOOK_MOIS_DE_TEST.md. Aucun identifiant, aucun e-mail : le dépôt est public.",
  ].join("\n");
  return { aFaire, machines, usage, emettre, lundi, titre, texte, depuis };
}

// ── Lectures GitHub (fetch, jeton en en-tête, jamais dans une URL) ───────────
async function gh(env, chemin) {
  const r = await fetch(`https://api.github.com/${chemin}`, {
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "passio-digest" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur api.github.com/${chemin.split("?")[0]}`);
  return r.json();
}
const sur = async (f, repli) => { try { return await f(); } catch (e) { return repli(e); } };

export async function lireDonnees(env, now = Date.now()) {
  const repo = env.GITHUB_REPOSITORY;
  // Depuis le dernier digest (borné à 14 j), sinon 24 h.
  const dernier = await sur(() => gh(env, `repos/${repo}/issues?labels=digest&state=all&per_page=1&sort=created&direction=desc`), () => []);
  let depuisMs = dernier[0] && Number.isFinite(Date.parse(dernier[0].created_at)) ? Date.parse(dernier[0].created_at) : now - J;
  if (now - depuisMs > 14 * J) depuisMs = now - 14 * J;
  const depuis = new Date(depuisMs).toISOString();

  const prs = [];
  const ouvertes = await gh(env, `repos/${repo}/pulls?state=open&per_page=50`);
  let lues = 0;
  for (const pr of ouvertes) {
    const base = { number: pr.number, title: pr.title, isDraft: !!pr.draft, state: pr.state, headRefOid: pr.head && pr.head.sha,
      headRefName: pr.head && pr.head.ref, createdAt: pr.created_at, updatedAt: pr.updated_at, url: pr.html_url, mergedAt: pr.merged_at, files: [], reviews: [] };
    // Fichiers et revues : seulement pour les PR non brouillon, 20 au plus (quota).
    if (!pr.draft && lues < 20) {
      lues++;
      base.files = await sur(async () => (await gh(env, `repos/${repo}/pulls/${pr.number}/files?per_page=100`)).map((f) => f.filename), () => []);
      base.reviews = await sur(async () => (await gh(env, `repos/${repo}/pulls/${pr.number}/reviews?per_page=100`)).map((r) => ({ login: r.user && r.user.login, commit_id: r.commit_id, body: r.body })), () => []);
    }
    prs.push(base);
  }
  const fermeesPr = await sur(() => gh(env, `repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`), () => []);
  for (const pr of fermeesPr) {
    if (pr.merged_at && Date.parse(pr.merged_at) >= depuisMs) {
      prs.push({ number: pr.number, title: pr.title, isDraft: !!pr.draft, state: pr.state, headRefName: pr.head && pr.head.ref, createdAt: pr.created_at, url: pr.html_url, mergedAt: pr.merged_at, files: [], reviews: [] });
    }
  }

  const issues = [];
  const versIssue = (i) => ({ number: i.number, title: i.title, labels: (i.labels || []).map((l) => l.name), state: i.state, createdAt: i.created_at, closedAt: i.closed_at, url: i.html_url });
  for (const i of await gh(env, `repos/${repo}/issues?state=open&per_page=100`)) if (!i.pull_request) issues.push(versIssue(i));
  for (const i of await sur(() => gh(env, `repos/${repo}/issues?state=closed&labels=sentinelle&since=${encodeURIComponent(depuis)}&per_page=50`), () => [])) if (!i.pull_request) issues.push(versIssue(i));

  const runs = {};
  // Pas de repli silencieux en `[]` : une lecture refusée rend `{ erreur }` et
  // composerDigest écrit « non lus (HTTP n) » plutôt que « 0 run » (constat B-01).
  const lireRuns = async (fichier, extra = "") => {
    const r = await sur(() => gh(env, `repos/${repo}/actions/workflows/${fichier}/runs?per_page=50&created=${encodeURIComponent(">=" + depuis.slice(0, 10))}${extra}`), (e) => ({ erreur: String((e && e.message) || e).slice(0, 160) }));
    if (r.erreur) return { erreur: r.erreur };
    return (r.workflow_runs || []).map((x) => ({ conclusion: x.conclusion, status: x.status, updatedAt: x.updated_at, url: x.html_url, event: x.event }));
  };
  runs.sauvegarde = await lireRuns("sauvegarde.yml", "&exclude_pull_requests=true");
  runs.disponibilite = await lireRuns("disponibilite.yml", "&exclude_pull_requests=true");
  runs["veille-production"] = await lireRuns("veille-production.yml", "&exclude_pull_requests=true");
  runs.deploy = await lireRuns("deploy.yml", "&branch=main&event=push");

  // Résidus : la même évaluation que `scripts/audit-registre-residus.js --json`,
  // par la bibliothèque, sans sous-processus.
  const residus = await sur(async () => {
    const require = createRequire(import.meta.url);
    const R = require("./lib/registre-residus.js");
    const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    return R.evaluer(R.lireRegistreDepot(racine), R.sondeDepot(racine, {}));
  }, (e) => ({ erreur: String(e && e.message).slice(0, 160), lignes: [] }));

  const usage = env.SUPABASE_ACCESS_TOKEN ? await mesurerUsage(env) : { erreur: "SUPABASE_ACCESS_TOKEN absent" };
  return { prs, issues, runs, residus, usage, depuis };
}

const estPrincipal = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (estPrincipal) {
  const env = process.env;
  const manquants = ["GH_TOKEN", "GITHUB_REPOSITORY"].filter((k) => !env[k]);
  if (manquants.length) {
    console.error(`Variables absentes : ${manquants.join(", ")}.`);
    process.exit(2);
  }
  lireDonnees(env).then((d) => {
    const v = composerDigest(d, Date.now());
    if (process.argv.includes("--json")) console.log(JSON.stringify(v));
    else console.log(v.titre + "\n\n" + v.texte);
    process.exit(v.emettre ? 3 : 0);
  }).catch((e) => { console.error("Panne du lecteur : " + (e && e.message)); process.exit(2); });
}
