#!/usr/bin/env node
"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// LA CLÉ DE SERVICE DE LA PRODUCTION N'EST JAMAIS À PORTÉE D'UNE PULL REQUEST
//
// LE DÉFAUT QUI MOTIVE CETTE GATE (EXP-11, mesuré le 2026-09-15). SUP-04 /
// TCI-04 avaient déplacé les suites à comptes réels vers le staging. DEUX
// étapes de `deploy.yml` étaient restées derrière avec
// `secrets.SUPABASE_SERVICE_ROLE_KEY` — la clé de PRODUCTION — et SANS aucune
// condition : elles partaient donc sur chaque pull request. L'une créait deux
// comptes réels en production à chaque poussée d'une branche.
//
// ⚠️ ASTRA-52 (cinquième contre-revue, 15/09/2026) — LA PREMIÈRE GATE LISAIT
// DES LIGNES, ET SIX FORMES LA CONTOURNAIENT : `on` en tableau ou en scalaire,
// une indentation de quatre espaces, `secrets['SUPABASE_SERVICE_ROLE_KEY']`,
// une condition contenant `|| true`, un commentaire ressemblant à une garde,
// `!= 'pull_request'` laissant passer `pull_request_target`. Les deux
// conditions qu'elle avait fait poser sont justes ; la GARANTIE GÉNÉRALE qu'elle
// annonçait était fausse. Désormais :
//   · les workflows sont LUS (scripts/lib/yaml-workflow.js, lecteur fermé :
//     toute forme YAML qu'il ne comprend pas est une ERREUR, donc un rouge) ;
//   · les déclencheurs viennent de `on` quelle que soit sa forme (mapping,
//     tableau, scalaire) ; un `on` illisible = concerné (fail-closed) ;
//   · une référence à la clé est cherchée dans TOUTE valeur du workflow
//     (`secrets.X`, `secrets['X']`, `secrets["X"]`), et le contexte `secrets`
//     ENTIER (`toJSON(secrets)`, `${{ secrets }}`, `secrets: inherit`) est une
//     référence aussi — on ne peut pas prouver qu'il n'emporte pas la clé ;
//   · une garde n'est acceptée que dans un ENSEMBLE FERMÉ de formes : une
//     conjonction (`&&`) d'atomes dont l'un est `github.event_name == 'push'`,
//     ou `github.event_name != 'pull_request'` ET, si le workflow écoute
//     `pull_request_target`, aussi `!= 'pull_request_target'`. Toute
//     disjonction, parenthèse, négation ou forme inconnue N'EST PAS une garde ;
//   · la garde se lit sur l'ÉTAPE, sinon sur le JOB — dans l'arbre, jamais
//     dans un commentaire.
//
// ⚠️ CE QUE CETTE GATE NE VOIT TOUJOURS PAS, et ça se dit : ce que GitHub
// EXÉCUTE. Un workflow appelé (`uses: …/.github/workflows/x.yml`) reçoit les
// secrets qu'on lui passe ; une action composite (`uses: ./.github/actions/…`)
// lit `${{ secrets }}` si on les lui donne ; `vars.` n'est pas un secret. Le
// rapport NOMME ces chemins (workflows appelés, actions composites, secrets
// hérités, secrets transmis) pour qu'un lecteur les suive — il ne les certifie
// pas. Une clé recomposée à partir de morceaux ou lue hors de GitHub lui échappe.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("node:fs");
const path = require("node:path");
const { lireYaml, ErreurYaml } = require("./lib/yaml-workflow.js");

const RACINE = path.join(__dirname, "..");
const DOSSIER = path.join(RACINE, ".github", "workflows");

/** Le nom du secret de PRODUCTION. `STAGING_SERVICE_ROLE_KEY` est un autre secret, un autre projet. */
const NOM_CLE = "SUPABASE_SERVICE_ROLE_KEY";
/** Les événements « pull request » : les deux exécutent du code proposé. */
const EVENEMENTS_PR = ["pull_request", "pull_request_target"];

// ── Les références à la clé, dans une chaîne ──────────────────────────────
// Rend la liste des références trouvées : { forme, texte }.
function referencesCle(chaine) {
  const s = String(chaine);
  const out = [];
  // ⚠️ ASTRA-62 : les noms de secrets sont INSENSIBLES À LA CASSE pour GitHub
  // (`secrets.supabase_service_role_key` rend la même valeur) — la gate aussi.
  const re = new RegExp("secrets\\s*(?:\\.\\s*" + NOM_CLE + "\\b|\\[\\s*['\"]" + NOM_CLE + "['\"]\\s*\\])", "gi");
  let m;
  while ((m = re.exec(s))) out.push({ forme: "directe", texte: m[0] });
  // Le contexte secrets ENTIER, sous toutes ses formes connues.
  if (/toJSON\s*\(\s*secrets\s*\)/i.test(s)) out.push({ forme: "contexte entier", texte: "toJSON(secrets)" });
  if (/\$\{\{\s*secrets\s*\}\}/.test(s)) out.push({ forme: "contexte entier", texte: "${{ secrets }}" });
  if (/\bsecrets\s*\[\s*[^'"\]\s][^\]]*\]/.test(s)) out.push({ forme: "indexation dynamique", texte: "secrets[<expression>]" });
  return out;
}

// ── Les déclencheurs, quelle que soit la forme de `on` ────────────────────
function declencheurs(doc) {
  const on = doc && doc.on;
  if (on === undefined) return { evenements: [], lisible: false, motif: "aucun `on`" };
  if (typeof on === "string") return { evenements: on.split(/[\s,]+/).filter(Boolean), lisible: true };
  if (Array.isArray(on)) return { evenements: on.map(String), lisible: on.every((x) => typeof x === "string") };
  if (on && typeof on === "object") return { evenements: Object.keys(on), lisible: true };
  return { evenements: [], lisible: false, motif: "forme de `on` inconnue" };
}
// ⚠️ ASTRA-62 : un déclencheur que la gate NE CONNAÎT PAS n'est pas « pas une
// pull request » — c'est un nom qu'elle ne sait pas lire (échappement,
// variante, faute) et que GitHub lira peut-être autrement. Fail-closed : un
// événement hors de la liste des événements GitHub rend le workflow CONCERNÉ.
const EVENEMENTS_GITHUB = new Set([
  "branch_protection_rule", "check_run", "check_suite", "create", "delete", "deployment", "deployment_status", "discussion",
  "discussion_comment", "fork", "gollum", "issue_comment", "issues", "label", "merge_group", "milestone", "page_build", "public",
  "pull_request", "pull_request_comment", "pull_request_review", "pull_request_review_comment", "pull_request_target", "push",
  "registry_package", "release", "repository_dispatch", "schedule", "status", "watch", "workflow_call", "workflow_dispatch", "workflow_run",
]);
function concerneParPullRequest(doc) {
  const d = declencheurs(doc);
  if (!d.lisible) return { concerne: true, motif: "déclencheurs illisibles (" + (d.motif || "?") + ") : traité comme concerné", evenements: d.evenements };
  const inconnus = d.evenements.filter((e) => !EVENEMENTS_GITHUB.has(String(e)));
  if (inconnus.length) return { concerne: true, motif: "déclencheur(s) inconnu(s) de la gate (" + inconnus.join(", ") + ") : traité comme concerné (fail-closed)", evenements: d.evenements };
  return { concerne: d.evenements.some((e) => EVENEMENTS_PR.includes(e)), evenements: d.evenements };
}

// ── La garde : un ensemble FERMÉ de formes acceptées ──────────────────────
// Rend { acceptee: bool, motif }.
function gardeAcceptee(expression, evenements) {
  if (expression == null) return { acceptee: false, motif: "aucune condition" };
  let e = String(expression).trim();
  const enveloppe = /^\$\{\{([\s\S]*)\}\}$/.exec(e);
  if (enveloppe) e = enveloppe[1].trim();
  if (e === "") return { acceptee: false, motif: "condition vide" };
  if (/\|\||\(|\)|!(?!=)|\bnot\b/i.test(e)) return { acceptee: false, motif: "forme hors de l'ensemble accepté (disjonction, parenthèse ou négation) : " + e };
  const atomes = e.split("&&").map((a) => a.trim().replace(/"/g, "'").replace(/\s+/g, " "));
  const ecoutePrTarget = (evenements || []).includes("pull_request_target");
  const aPush = atomes.includes("github.event_name == 'push'");
  const excluPr = atomes.includes("github.event_name != 'pull_request'");
  const excluPrTarget = atomes.includes("github.event_name != 'pull_request_target'");
  if (aPush) return { acceptee: true, motif: "github.event_name == 'push'" };
  if (excluPr && (!ecoutePrTarget || excluPrTarget)) return { acceptee: true, motif: "exclusion explicite des pull requests" };
  if (excluPr && ecoutePrTarget) return { acceptee: false, motif: "`!= 'pull_request'` n'exclut pas `pull_request_target`, que ce workflow écoute" };
  return { acceptee: false, motif: "aucun atome accepté dans : " + e };
}

// ── Parcours d'un workflow lu ─────────────────────────────────────────────
function chaines(valeur, chemin, out) {
  if (valeur == null) return out;
  if (typeof valeur === "string") { out.push({ chemin, texte: valeur }); return out; }
  if (Array.isArray(valeur)) { valeur.forEach((v, i) => chaines(v, chemin + "[" + i + "]", out)); return out; }
  if (typeof valeur === "object") { for (const [k, v] of Object.entries(valeur)) chaines(v, chemin ? chemin + "." + k : k, out); return out; }
  out.push({ chemin, texte: String(valeur) }); return out;
}

/** Audite UN workflow (texte). Rend { concerne, evenements, occurrences, manques, erreurs, chemins }. */
function auditerTexte(nom, texte) {
  const r = { nom, concerne: false, evenements: [], occurrences: [], manques: [], erreurs: [], chemins: { workflowsAppeles: [], actionsComposites: [], secretsHerites: [], secretsTransmis: [] } };
  let doc;
  try { doc = lireYaml(texte); } catch (e) { r.erreurs.push((e instanceof ErreurYaml ? "YAML illisible : " : "lecture impossible : ") + e.message); r.concerne = true; return r; }
  if (!doc || typeof doc !== "object") { r.erreurs.push("document vide ou non structuré"); r.concerne = true; return r; }
  const c = concerneParPullRequest(doc);
  r.concerne = c.concerne; r.evenements = c.evenements;
  if (c.motif) r.erreurs.push(c.motif);

  const jobs = doc.jobs && typeof doc.jobs === "object" ? doc.jobs : {};
  // Les chemins que la gate ne certifie pas, nommés.
  for (const [jn, job] of Object.entries(jobs)) {
    if (!job || typeof job !== "object") continue;
    if (typeof job.uses === "string") {
      r.chemins.workflowsAppeles.push({ job: jn, uses: job.uses });
      if (job.secrets === "inherit") r.chemins.secretsHerites.push({ job: jn });
      else if (job.secrets && typeof job.secrets === "object") for (const [k, v] of Object.entries(job.secrets)) r.chemins.secretsTransmis.push({ job: jn, nom: k, valeur: String(v) });
    }
    for (const [si, step] of (Array.isArray(job.steps) ? job.steps : []).entries()) {
      if (step && typeof step.uses === "string" && /^\.\//.test(step.uses)) r.chemins.actionsComposites.push({ job: jn, etape: si, uses: step.uses });
    }
  }
  // Les occurrences de la clé : au niveau du workflow, du job, de l'étape.
  const niveau = (portee, valeur, chemin, ifJob, ifEtape) => {
    for (const { chemin: ch, texte: t } of chaines(valeur, chemin, [])) {
      for (const ref of referencesCle(t)) {
        const occ = { portee, chemin: ch, forme: ref.forme, texte: ref.texte, extrait: t.trim().slice(0, 100) };
        const gEtape = ifEtape !== undefined ? gardeAcceptee(ifEtape, r.evenements) : { acceptee: false, motif: "pas d'étape" };
        const gJob = ifJob !== undefined ? gardeAcceptee(ifJob, r.evenements) : { acceptee: false, motif: "aucune condition de job" };
        occ.garde = gEtape.acceptee ? "étape : " + gEtape.motif : gJob.acceptee ? "job : " + gJob.motif : null;
        occ.motif = occ.garde ? null : (ifEtape !== undefined ? "étape : " + gEtape.motif + " ; " : "") + "job : " + gJob.motif;
        r.occurrences.push(occ);
        if (r.concerne && !occ.garde) r.manques.push(occ);
      }
    }
  };
  // Niveau workflow : env, defaults, concurrency… tout sauf `jobs`.
  const horsJobs = Object.fromEntries(Object.entries(doc).filter(([k]) => k !== "jobs"));
  niveau("workflow", horsJobs, "", undefined, undefined);
  for (const [jn, job] of Object.entries(jobs)) {
    if (!job || typeof job !== "object") continue;
    const ifJob = "if" in job ? job.if : undefined;
    const horsSteps = Object.fromEntries(Object.entries(job).filter(([k]) => k !== "steps"));
    niveau("job", horsSteps, "jobs." + jn, ifJob, undefined);
    // ⚠️ ASTRA-62 : `secrets: inherit` vers un workflow appelé transmet le contexte
    // ENTIER — la clé de production comprise. C'est une référence, gardée ou non.
    if (typeof job.uses === "string" && job.secrets === "inherit") {
      const g = ifJob !== undefined ? gardeAcceptee(ifJob, r.evenements) : { acceptee: false, motif: "aucune condition de job" };
      const occ = { portee: "job", chemin: "jobs." + jn + ".secrets", forme: "contexte entier", texte: "secrets: inherit", extrait: "uses: " + job.uses, garde: g.acceptee ? "job : " + g.motif : null, motif: g.acceptee ? null : "job : " + g.motif };
      r.occurrences.push(occ);
      if (r.concerne && !occ.garde) r.manques.push(occ);
    }
    for (const [si, step] of (Array.isArray(job.steps) ? job.steps : []).entries()) {
      if (!step || typeof step !== "object") continue;
      const ifEtape = "if" in step ? step.if : undefined;
      niveau("étape", Object.fromEntries(Object.entries(step).filter(([k]) => k !== "if")), "jobs." + jn + ".steps[" + si + "]" + (step.name ? " « " + String(step.name).slice(0, 40) + " »" : ""), ifJob, ifEtape);
    }
  }
  return r;
}

function workflows() {
  if (!fs.existsSync(DOSSIER)) return [];
  return fs.readdirSync(DOSSIER).filter((f) => /\.ya?ml$/.test(f)).map((f) => ({ nom: f, texte: fs.readFileSync(path.join(DOSSIER, f), "utf8") }));
}

function auditer(liste) {
  const rapports = (liste || workflows()).map(({ nom, texte }) => auditerTexte(nom, texte));
  const manques = rapports.flatMap((r) => r.manques.map((m) => ({ nom: r.nom, ...m })));
  const erreurs = rapports.flatMap((r) => r.erreurs.map((e) => ({ nom: r.nom, erreur: e })));
  return { rapports, manques, erreurs, occurrences: rapports.reduce((n, r) => n + (r.concerne ? r.occurrences.length : 0), 0), fichiersPr: rapports.filter((r) => r.concerne).length };
}

module.exports = { auditer, auditerTexte, gardeAcceptee, referencesCle, declencheurs, concerneParPullRequest, NOM_CLE };

if (require.main === module) {
  const { rapports, manques, erreurs, occurrences, fichiersPr } = auditer();
  console.log(`clé de service PRODUCTION : ${occurrences} emploi(s) dans ${fichiersPr} workflow(s) déclenché(s) par pull request`);
  for (const e of erreurs) console.error(`❌ ${e.nom} : ${e.erreur} — une forme que la gate ne lit pas n'est pas certifiée sûre.`);
  for (const m of manques) {
    console.error(`❌ ${m.nom} · ${m.chemin} emporte la clé de PRODUCTION (${m.forme} : ${m.texte}) sans garde acceptée.`);
    console.error(`   ${m.extrait}`);
    console.error(`   ${m.motif}`);
    console.error(`   Poser « if: github.event_name == 'push' » sur l'étape (ou sur le job).`);
  }
  // Les chemins non certifiés, nommés pour être suivis.
  for (const r of rapports) {
    const c = r.chemins;
    if (c.workflowsAppeles.length || c.actionsComposites.length || c.secretsHerites.length || c.secretsTransmis.length) {
      console.log(`ℹ ${r.nom}${r.concerne ? " (pull request)" : ""} :` +
        (c.workflowsAppeles.length ? ` ${c.workflowsAppeles.length} workflow(s) appelé(s) [${c.workflowsAppeles.map((x) => x.uses).join(", ")}]` : "") +
        (c.secretsHerites.length ? ` ; secrets HÉRITÉS par ${c.secretsHerites.map((x) => x.job).join(", ")}` : "") +
        (c.secretsTransmis.length ? ` ; secrets transmis : ${c.secretsTransmis.map((x) => x.nom).join(", ")}` : "") +
        (c.actionsComposites.length ? ` ; ${c.actionsComposites.length} action(s) composite(s) [${[...new Set(c.actionsComposites.map((x) => x.uses))].join(", ")}]` : ""));
    }
  }
  if (manques.length || erreurs.length) process.exit(1);
  console.log("✅ aucun emploi de la clé de production n'est atteignable depuis une pull request (dans le texte lu des workflows).");
  console.log("ℹ Portée : les workflows tels qu'ils sont ÉCRITS. Ce que GitHub exécute au-delà (workflow appelé, action composite, clé recomposée) est nommé ci-dessus, pas certifié.");
}
