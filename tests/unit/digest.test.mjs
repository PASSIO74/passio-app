// Verrous de `composerDigest` et de ses règles (scripts/digest.mjs) — fonctions
// PURES : aucun réseau. Les fixtures reprennent l'historique réel du dépôt du
// 09-09 au 09-18 (carte github-historique) : PR #479 doc seule en attente, #281
// brouillon, enquêtes #327/#337 perdues, PR #305 fusionnée à la main, RES-14 au
// 23/09. Chaque verrou nomme la MUTATION qui le fait rougir (éprouvée à la main).
import test from "node:test";
import assert from "node:assert/strict";
import {
  composerDigest, contreRevueManquante, estCritique, echeanceResidu, propre,
  MARQUEUR_CONTRE_REVUE, RELECTEUR, SENTINELLE_ATTENTE_H, PR_SENTINELLE_ATTENTE_H, RESIDU_HORIZON_J,
} from "../../scripts/digest.mjs";

const H = 3600_000;
// Vendredi 2026-09-18 08:30 Paris (06:30 UTC) : l'heure du digest.
const VENDREDI = Date.parse("2026-09-18T06:30:00Z");
// Lundi 2026-09-21 08:30 Paris.
const LUNDI = Date.parse("2026-09-21T06:30:00Z");
const il_y_a = (h, now = VENDREDI) => new Date(now - h * H).toISOString();
const SHA = "3b946245aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const prCritique = (extra = {}) => ({
  number: 490, title: "Veille production + digest (chaîne GitHub)", isDraft: false, state: "open", headRefOid: SHA,
  headRefName: "veille-production", createdAt: il_y_a(5), url: "https://github.com/PASSIO74/passio-app/pull/490",
  files: [".github/workflows/veille-production.yml", "scripts/veille-production.mjs", "docs/VEILLE_PRODUCTION.md"],
  reviews: [], ...extra,
});
const VIDE = { prs: [], issues: [], runs: {}, residus: { lignes: [] }, usage: {}, depuis: il_y_a(24) };

test("estCritique : le périmètre est celui de deploy.yml, ni plus ni moins", () => {
  // Mutation : retirer `/^migrations\//` de FICHIERS_CRITIQUES → rougit.
  for (const f of [".github/workflows/deploy.yml", "migrations/x.sql", "dashboard/server/auth.js", "dashboard/server/sentinel.js", "scripts/run_migrations.js", "scripts/sauvegarde-donnees.js"]) assert.equal(estCritique(f), true, f);
  for (const f of ["scripts/veille-production.mjs", "dashboard/server/alerts.js", "docs/x.md", "js/app-01.js", "tests/unit/digest.test.mjs", "github/x"]) assert.equal(estCritique(f), false, f);
});

test("contreRevueManquante : PR critique sans revue → oui ; revue de PASSIO74 sur le SHA de tête avec le marqueur → non ; sur un ANCIEN SHA → oui", () => {
  // Mutation : retirer `r.commit_id === pr.headRefOid` → la revue périmée suffit → rougit.
  assert.equal(contreRevueManquante(prCritique()), true);
  const bonne = { login: RELECTEUR, commit_id: SHA, body: `${MARQUEUR_CONTRE_REVUE} — workflows relus, secrets jamais imprimés.` };
  assert.equal(contreRevueManquante(prCritique({ reviews: [bonne] })), false);
  assert.equal(contreRevueManquante(prCritique({ reviews: [{ ...bonne, commit_id: "c2f30689bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }] })), true);
  assert.equal(contreRevueManquante(prCritique({ reviews: [{ ...bonne, body: "LGTM" }] })), true);
  assert.equal(contreRevueManquante(prCritique({ reviews: [{ ...bonne, login: "autre" }] })), true);
});

test("contreRevueManquante : brouillon, fermée, ou sans fichier critique → jamais", () => {
  // Mutation : retirer `pr.isDraft ||` → #281 (brouillon) réclame une contre-revue → rougit.
  assert.equal(contreRevueManquante(prCritique({ number: 281, isDraft: true })), false);
  assert.equal(contreRevueManquante(prCritique({ state: "closed", mergedAt: il_y_a(1) })), false);
  assert.equal(contreRevueManquante(prCritique({ number: 479, files: ["docs/fiche-26.md"] })), false);
  assert.equal(contreRevueManquante(null), false);
});

test("echeanceResidu : « échéance », « au plus tard le », « visé avant le » ; jamais la date « aujourd'hui » ; la plus proche gagne", () => {
  // Mutation : regex réduite à /échéance (…)/ → RES-14 n'a plus d'échéance → rougit.
  assert.equal(echeanceResidu({ condition: { detail: "échéance 2026-10-15 (aujourd'hui 2026-09-18)" } }), "2026-10-15");
  assert.equal(echeanceResidu({ condition: { detail: "à observer : Dès qu'un projet jetable est fourni — visé avant le 2026-09-23 : sauvegarde complète" } }), "2026-09-23");
  assert.equal(echeanceResidu({ condition: { detail: "à observer : … — au plus tard le 2026-09-30 : décider entre correction bornée et maintien" } }), "2026-09-30");
  assert.equal(echeanceResidu({ condition: { detail: "une : échéance 2026-10-31 ; échéance 2026-10-01 (aujourd'hui 2026-09-18)" } }), "2026-10-01");
  assert.equal(echeanceResidu({ condition: { detail: "à observer : Avant la première application de migration" } }), null);
  assert.equal(echeanceResidu({}), null);
});

test("propre : un titre est une ligne bornée, sans outil Markdown, sans @mention ni #renvoi", () => {
  // Mutation : retirer `.replace(/[`<>]/g, "'")` → rougit.
  assert.equal(propre("Titre `code` <img> ![x](u)\nligne 2"), "Titre 'code' 'img' !'x'(u) ligne 2");
  assert.equal(propre("x".repeat(200)).length, 110);
  assert.equal(propre(null), "");
  // `@quelquun` notifierait un inconnu, `#12` écrirait dans la chronologie de l'issue 12 (constat mineur).
  // Mutation : `.replace(/@/g, "(a)").replace(/#/g, "n°")` retiré → rougit.
  assert.equal(propre("cc @quelquun, corrige #12"), "cc (a)quelquun, corrige n°12");
});

test("composerDigest : une PR critique sans contre-revue donne le geste exact `gh pr review <n> --comment --body \"Contre-revue technique indépendante — …\"`", () => {
  // Mutation : le geste sans le numéro de PR, ou sans le marqueur → rougit.
  const v = composerDigest({ ...VIDE, prs: [prCritique()] }, VENDREDI);
  assert.equal(v.aFaire.length, 1);
  assert.equal(v.aFaire[0].cle, "contre-revue:490");
  assert.match(v.aFaire[0].geste, /gh pr review 490 --comment --body "Contre-revue technique indépendante — /);
  assert.match(v.aFaire[0].titre, /1 fichier\(s\) du périmètre critique/); // .github/* seulement : scripts/ et docs/ ne sont pas critiques
  assert.equal(v.emettre, true);
  assert.equal(v.titre, "[DIGEST] 2026-09-18 — 1 à faire");
  assert.match(v.texte, /## Ce qui t'attend \(1\)/);
  assert.match(v.texte, /pull\/490/);
});

test("composerDigest : issues à geste humain (humain, recidive, moderation, disponibilite, veille, veille-muette, digest-muet, [SENTINELLE DISTANTE]) sont listées, une simple issue non", () => {
  // Mutation : LABELS_HUMAINS sans `recidive` → rougit.
  const issues = [
    // #500 a 30 h (> 6 h) : sans la garde « déjà listée par son label humain », elle serait AUSSI une enquête qui traîne (constat B-T04).
    { number: 500, title: "[SENTINELLE] TypeError · x", labels: ["sentinelle", "recidive", "humain"], state: "open", createdAt: il_y_a(30), url: "u500" },
    { number: 501, title: "[MODÉRATION] 1 signalement(s)", labels: ["moderation"], state: "open", createdAt: il_y_a(30), url: "u501" },
    { number: 502, title: "[SENTINELLE DISTANTE] Santé rouge", labels: [], state: "open", createdAt: il_y_a(2), url: "u502" },
    { number: 503, title: "[VEILLE] 1 alerte(s) : crons", labels: ["veille"], state: "open", createdAt: il_y_a(1), url: "u503" },
    { number: 504, title: "Idée de fonctionnalité", labels: ["enhancement"], state: "open", createdAt: il_y_a(100), url: "u504" },
    { number: 505, title: "[SENTINELLE PAUSE]", labels: [], state: "open", createdAt: il_y_a(1), url: "u505" },
    { number: 506, title: "[VEILLE MUETTE] la veille de production n'a pas rendu de verdict", labels: ["veille-muette"], state: "open", createdAt: il_y_a(4), url: "u506" },
    { number: 507, title: "[DIGEST MUET] le digest du matin n'a pas été composé", labels: ["digest-muet"], state: "open", createdAt: il_y_a(20), url: "u507" },
  ];
  const v = composerDigest({ ...VIDE, issues }, VENDREDI);
  assert.deepEqual(v.aFaire.map((a) => a.cle), ["issue:500", "issue:501", "issue:502", "issue:503", "issue:506", "issue:507"]);
  assert.match(v.aFaire[0].titre, /recidive, humain/);
  assert.match(v.aFaire[0].geste, /décision humaine/);
  assert.match(v.aFaire[1].geste, /npm run moderation/);
  assert.match(v.aFaire[1].titre, /ouverte depuis 30 h/);
  assert.equal(v.machines.veille.issueOuverte, true);
  // #500 porte `humain` : elle n'est pas AUSSI comptée comme enquête qui traîne.
  // Mutation : `|| labels.some((l) => LABELS_HUMAINS.includes(l))` retiré de l'étape 3 → #500 (30 h) apparaît deux fois → rougit.
  assert.ok(!v.aFaire.some((a) => a.cle === "sentinelle:500"));
  // Une issue MUETTE porte le geste du canal (run lié, jeton), pas celui de la panne Netlify (constat B-05).
  // Mutation : `veille-muette` retiré de LABELS_HUMAINS, ou son geste remplacé par celui de `disponibilite` → rougit.
  const muette = v.aFaire.find((a) => a.cle === "issue:506");
  assert.match(muette.geste, /ouvre le run lié.*SUPABASE_ACCESS_TOKEN/);
  assert.doesNotMatch(muette.geste, /netlify/);
  assert.match(v.aFaire.find((a) => a.cle === "issue:507").geste, /prochain digest composé/);
});

test("composerDigest : une enquête [SENTINELLE] ouverte > 6 h sans label humain est à débloquer ; à 3 h elle ne l'est pas encore", () => {
  // Mutation : `age < SENTINELLE_ATTENTE_H` → `age < 0` → l'enquête de 3 h est listée → rougit.
  const enquete = (n, h) => ({ number: n, title: "[SENTINELLE] HTTP 409 sur POST /rest/v1/profiles", labels: ["sentinelle", "claude"], state: "open", createdAt: il_y_a(h), url: `u${n}` });
  const v = composerDigest({ ...VIDE, issues: [enquete(327, 28), enquete(337, 3)] }, VENDREDI);
  assert.deepEqual(v.aFaire.map((a) => a.cle), ["sentinelle:327"]);
  assert.match(v.aFaire[0].titre, /28 h sans correctif fusionné/);
  assert.match(v.aFaire[0].geste, /not planned/);
  assert.equal(SENTINELLE_ATTENTE_H, 6);
});

test("composerDigest : une PR claude/issue-* ouverte > 2 h est à regarder ; une PR humaine ordinaire n'est pas un geste", () => {
  // Mutation : test de branche `/^claude\/issue-\d+-/` retiré → #479 (doc seule) devient un geste → rougit.
  const prs = [
    { number: 305, title: "[SENTINELLE] Correctif", isDraft: false, state: "open", headRefOid: SHA, headRefName: "claude/issue-304-34389583744", createdAt: il_y_a(10), url: "u305", files: ["js/app-05.js"], reviews: [] },
    { number: 479, title: "Fiche 26 — prompt Astra", isDraft: false, state: "open", headRefOid: SHA, headRefName: "astra/fiche-26", createdAt: il_y_a(48), url: "u479", files: ["docs/fiche-26.md"], reviews: [] },
    { number: 306, title: "[SENTINELLE] Autre", isDraft: false, state: "open", headRefOid: SHA, headRefName: "claude/issue-306-1", createdAt: il_y_a(1), url: "u306", files: ["js/app-05.js"], reviews: [] },
  ];
  const v = composerDigest({ ...VIDE, prs }, VENDREDI);
  assert.deepEqual(v.aFaire.map((a) => a.cle), ["pr-sentinelle:305"]);
  assert.match(v.aFaire[0].titre, /ouverte depuis 10 h sans fusion/);
  assert.equal(PR_SENTINELLE_ATTENTE_H, 2);
});

test("composerDigest : les résidus à échéance < 7 j (RES-14 au 23/09, RES-13 au 30/09 vu le 25/09) sont listés, RES-02 (15/10) non, les fermés jamais", () => {
  // Mutation : `jours > RESIDU_HORIZON_J` → `jours > 60` → RES-02 apparaît → rougit.
  const residus = { lignes: [
    { id: "RES-14", titre: "Cycle réel de restauration non rejoué", statut: "en_attente", condition: { detail: "à observer : Dès qu'un projet jetable est fourni — visé avant le 2026-09-23 : sauvegarde complète" } },
    { id: "RES-13", titre: "Appels : décision", statut: "en_attente", condition: { detail: "à observer : … — au plus tard le 2026-09-30 : décider" } },
    { id: "RES-02", titre: "Purge des marqueurs", statut: "en_attente", condition: { detail: "une : échéance 2026-10-15 (aujourd'hui 2026-09-18) ; function x non déclaré" } },
    { id: "RES-01", titre: "Fermé", statut: "ferme", condition: { detail: "échéance 2026-09-01 atteinte (2026-09-18)" } },
  ] };
  const v = composerDigest({ ...VIDE, residus }, VENDREDI);
  assert.deepEqual(v.aFaire.map((a) => a.cle), ["residu:RES-14"]);
  assert.match(v.aFaire[0].titre, /échéance 2026-09-23 \(dans 5 j\)/);
  assert.match(v.aFaire[0].geste, /registre-residus\.json/);
  const plusTard = composerDigest({ ...VIDE, residus }, Date.parse("2026-09-25T06:30:00Z"));
  assert.deepEqual(plusTard.aFaire.map((a) => a.cle), ["residu:RES-14", "residu:RES-13"]);
  assert.match(plusTard.aFaire[0].titre, /dépassée de 2 j/);
  assert.equal(RESIDU_HORIZON_J, 7);
});

test("composerDigest : rien à faire un vendredi → pas d'émission ; rien à faire un LUNDI → émission quand même", () => {
  // Mutation : `emettre = aFaire.length > 0 || lundi` → sans `|| lundi` → rougit.
  const vendredi = composerDigest(VIDE, VENDREDI);
  assert.equal(vendredi.emettre, false);
  assert.equal(vendredi.lundi, false);
  assert.match(vendredi.texte, /Rien ne t'attend\./);
  const lundi = composerDigest({ ...VIDE, depuis: il_y_a(72, LUNDI) }, LUNDI);
  assert.equal(lundi.emettre, true);
  assert.equal(lundi.lundi, true);
  assert.equal(lundi.titre, "[DIGEST] 2026-09-21 — 0 à faire");
});

test("composerDigest : « ce que les machines ont fait » ne compte que depuis le dernier digest, et l'usage est repris tel quel", () => {
  // Mutation : retirer le filtre `>= depuisMs` sur les issues fermées → #304 (fermée avant) est comptée → rougit.
  const depuis = il_y_a(24);
  const d = {
    ...VIDE, depuis,
    prs: [{ number: 371, title: "[SENTINELLE] x", isDraft: false, state: "closed", headRefName: "claude/issue-370-1", createdAt: il_y_a(30), mergedAt: il_y_a(20), url: "u", files: [], reviews: [] }],
    issues: [
      { number: 370, title: "[SENTINELLE] x", labels: ["sentinelle", "claude"], state: "closed", createdAt: il_y_a(30), closedAt: il_y_a(20), url: "u" },
      { number: 304, title: "[SENTINELLE] y", labels: ["sentinelle", "claude"], state: "closed", createdAt: il_y_a(200), closedAt: il_y_a(190), url: "u" },
    ],
    runs: {
      sauvegarde: [{ conclusion: "success", updatedAt: il_y_a(2) }, { conclusion: "success", updatedAt: il_y_a(40) }],
      disponibilite: [{ conclusion: "success", updatedAt: il_y_a(3) }, { conclusion: "failure", updatedAt: il_y_a(6) }],
      "veille-production": [{ conclusion: "success", updatedAt: il_y_a(1) }],
      deploy: [{ conclusion: "success", updatedAt: il_y_a(5) }, { conclusion: "failure", updatedAt: il_y_a(9) }, { conclusion: "cancelled", updatedAt: il_y_a(9) }],
    },
    usage: { inscriptions: { crees24h: 2, confirmes24h: 1, crees7j: 5, confirmes7j: 4, nonConfirmesAnciens: 1 }, appareils7j: 95, erreurs24h: 3 },
  };
  const v = composerDigest(d, VENDREDI);
  // Les enquêtes FERMÉES injectées pour ce bloc ne sont jamais « ce qui t'attend » (constat B-T03).
  // Mutation : `issues.filter((i) => !i.state || i.state === "open")` → `issues` → #370 (30 h) et #304 (200 h) deviennent des enquêtes qui traînent → rougit.
  assert.deepEqual(v.aFaire, []);
  assert.equal(v.emettre, false);
  assert.deepEqual(v.machines.sentinelle, { fermees: [370], prsFusionnees: [371] });
  assert.deepEqual(v.machines.sauvegarde, { runs: 1, ok: 1, echecs: 0 });
  assert.deepEqual(v.machines.disponibilite, { runs: 2, ok: 1, echecs: 1 });
  assert.deepEqual(v.machines.deploiements, { runs: 3, ok: 1, echecs: 1 });
  assert.match(v.texte, /1 enquête\(s\) fermée\(s\) \(#370\), 1 PR de réparation fusionnée\(s\)/);
  assert.match(v.texte, /Inscriptions : 24 h 2 créée\(s\) \/ 1 confirmée\(s\) ; 7 j 5 \/ 4/);
  assert.match(v.texte, /Appareils actifs 7 j : 95/);
  assert.match(v.texte, /Erreurs client 24 h : 3/);
  assert.match(v.texte, /Déploiements main : 1 succès, 1 échec\(s\)/);
});

test("composerDigest : des runs NON LUS (403 sans `actions: read`) s'écrivent « non lus (HTTP 403 …) », jamais « 0 run »", () => {
  // Mutation : `if (source && !Array.isArray(source) && source.erreur) return { … erreur }` retiré → « Sauvegarde : 0 ok / 0 run(s) » → rougit.
  const runs = {
    sauvegarde: { erreur: "HTTP 403 sur api.github.com/repos/x/y/actions/workflows/sauvegarde.yml/runs" },
    disponibilite: { erreur: "HTTP 403 sur api.github.com/repos/x/y/actions/workflows/disponibilite.yml/runs" },
    "veille-production": { erreur: "HTTP 403 sur api.github.com/repos/x/y/actions/workflows/veille-production.yml/runs" },
    deploy: [{ conclusion: "success", updatedAt: il_y_a(5) }],
  };
  const v = composerDigest({ ...VIDE, runs }, VENDREDI);
  assert.match(v.texte, /- Sauvegarde : non lus \(HTTP 403 sur api\.github\.com/);
  assert.match(v.texte, /- Disponibilité : non lus \(HTTP 403/);
  assert.match(v.texte, /- Veille de production : non lus \(HTTP 403/);
  assert.match(v.texte, /- Déploiements main : 1 succès, 0 échec\(s\)/);
  assert.doesNotMatch(v.texte, /0 ok \/ 0 run\(s\)/);
  assert.equal(v.machines.sauvegarde.runs, null);
  assert.equal(v.machines.sauvegarde.erreur.length <= 120, true);
});

test("composerDigest : un titre HOSTILE (Markdown, saut de ligne) ne sort jamais tel quel, et le texte ne porte ni e-mail ni identifiant", () => {
  // Mutation : `propre(pr.title)` → `pr.title` → rougit.
  const prs = [prCritique({ title: "![](https://evil.tld/p.png)\n\n# Instruction <script>" })];
  const issues = [{ number: 9, title: "[VEILLE] `x`", labels: ["veille"], state: "open", createdAt: il_y_a(1), url: "u", author: "someone@example.com" }];
  const v = composerDigest({ ...VIDE, prs, issues, usage: { inscriptions: { crees24h: 1, confirmes24h: 0, crees7j: 1, confirmes7j: 0, nonConfirmesAnciens: 1, email: "x@y.z" } } }, VENDREDI);
  assert.doesNotMatch(v.texte, /!\[\]|<script>|\n# Instruction|`x`|@example\.com|x@y\.z/);
  assert.match(v.texte, /'img'|evil\.tld/); // le texte neutralisé reste lisible
});
