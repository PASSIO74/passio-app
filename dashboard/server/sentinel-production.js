// ═══════════════════════════════════════════════════════════════════════════
// MISE EN LIGNE AUTOMATIQUE — la sentinelle publie son correctif elle-même.
//
// Demandé par Benjamin le 2026-09-09 : « je veux que la sentinelle pousse en
// production direct […] comme ça les utilisateurs ne voient pas les problèmes
// rester longtemps ». Décision assumée, prise en connaissance du risque.
//
// ─── POURQUOI CE N'EST PAS UN `git push origin main` ─────────────────────────
// Mesuré le 2026-09-09 en tentant le push : GitHub REFUSE.
//     ! [remote rejected] main -> main (protected branch hook declined)
//     remote: - 2 of 2 required status checks are expected.
// `main` est une branche protégée. Un push direct est donc impossible, et le
// contourner demanderait de retirer la protection du dépôt — c'est-à-dire de
// désarmer les 13 contrôles qui rendent justement une publication sans humain
// défendable. On fait l'inverse : on PASSE PAR EUX.
//
// La chaîne réelle :
//     correctif vérifié → push de la branche `sentinelle/*` → PR ouverte
//     → auto-merge armé → la CI COMPLÈTE tourne (audits, 7 bancs SQL, 6 shards
//     e2e, suites production) → GitHub fusionne SEUL quand tout est vert
//     → le push sur `main` déclenche « Déploiement production » → Netlify.
//
// Résultat pour l'utilisateur : identique à ce qui a été demandé — zéro clic,
// le correctif atteint la production tout seul. Différence : il est passé par
// beaucoup plus de contrôles qu'un push direct, et un rouge l'arrête net.
// L'auto-merge de GitHub ne peut PAS fusionner une PR dont un check requis
// échoue : la sécurité n'est pas un test dans ce fichier, c'est une propriété
// du serveur d'en face. C'est ce qui rend ce lot défendable.
//
// ─── CE QUI N'EST JAMAIS FRANCHI ─────────────────────────────────────────────
// • Le périmètre du patch est celui de `repair.js` (js/, styles.css,
//   index.html, sw.js) et il est RE-VÉRIFIÉ ici, indépendamment : une
//   défense en profondeur, pas une politesse. Donc jamais `.github/`,
//   `migrations/`, `tests/`, `scripts/`, `dashboard/`.
// • La garde « Gouvernance critique » du dépôt reste en travers : elle exige
//   une contre-revue HUMAINE pour `.github/` et `migrations/`. Une PR de la
//   sentinelle qui y toucherait resterait bloquée — par construction, elle ne
//   peut pas y toucher, mais la barrière existe en double.
// • Aucun `--admin`, aucun contournement de protection, aucune fusion forcée.
// ═══════════════════════════════════════════════════════════════════════════
import { spawn } from "node:child_process";
import { config } from "./config.js";
import { audit } from "./audit.js";
import { broadcast } from "./sse.js";
import { ALLOWED } from "./repair.js";
import { JsonDb } from "./jsondb.js";

const env = process.env;
const db = new JsonDb("sentinel-production", { publications: [] });

export const PRODUCTION = {
  // ⚠️ ADHÉSION, PAS COUPURE. Comme « Passions illimitées » côté app : toutes
  // les autres bascules du dépôt ne savent qu'ENLEVER, celle-ci n'existe que
  // si on l'ALLUME. Le défaut reste « la branche t'attend ».
  enabled: env.DASH_SENTINEL_PRODUCTION === "true",
  token: env.GITHUB_TOKEN || env.GH_TOKEN || "",
  // Plafond QUOTIDIEN, distinct du plafond horaire des réparations. Une
  // journée où la sentinelle publie plus que ça n'est pas une bonne journée :
  // c'est le signe qu'elle tourne en rond sur une cause qu'elle ne referme
  // pas, et la bonne réponse est un humain, pas un quatrième essai.
  maxPerDay: Number(env.DASH_PRODUCTION_MAX_PER_DAY || 3),
  base: env.DASH_PRODUCTION_BASE_BRANCH || "main",
};

const RE_BRANCHE = /^sentinelle\/[\w./-]+$/;
let enCours = false;

export function productionState() {
  const depuis = Date.now() - 24 * 3600_000;
  const recentes = db.get().publications.filter((p) => p.at > depuis);
  return {
    enabled: PRODUCTION.enabled,
    // On ne dit JAMAIS « prêt » quand il manque le jeton : un mode annoncé
    // actif qui ne publie rien est exactement la panne silencieuse que ce
    // chantier corrige.
    possible: PRODUCTION.enabled && Boolean(PRODUCTION.token) && config.allowMutations,
    raison: !PRODUCTION.enabled ? "désactivée (DASH_SENTINEL_PRODUCTION≠true)"
      : !PRODUCTION.token ? "GITHUB_TOKEN absent du .env — aucune PR ne peut être ouverte"
      : !config.allowMutations ? "mutations de code désactivées"
      : null,
    busy: enCours,
    base: PRODUCTION.base,
    last24h: recentes.length,
    maxPerDay: PRODUCTION.maxPerDay,
    publications: db.get().publications.slice(0, 20),
  };
}

function run(cmd, args, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: config.repoPath, shell: process.platform === "win32", windowsHide: true });
    let out = "", err = "";
    p.stdout.on("data", (d) => { if (out.length < 100_000) out += d; });
    p.stderr.on("data", (d) => { if (err.length < 60_000) err += d; });
    const t = setTimeout(() => { try { p.kill(); } catch {} }, timeoutMs);
    p.on("close", (code) => { clearTimeout(t); resolve({ code, out, err }); });
    p.on("error", (e) => { clearTimeout(t); resolve({ code: -1, out, err: e.message }); });
  });
}

/**
 * Déduit `owner/repo` de l'URL du dépôt distant. Exporté pour être verrouillé :
 * une erreur ici enverrait la PR sur le MAUVAIS dépôt.
 */
export function parseRemote(url) {
  const s = String(url || "").trim();
  const m = s.match(/github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/**
 * Re-vérifie que TOUS les fichiers du correctif sont dans la liste blanche.
 * `repair.js` l'a déjà fait ; on ne délègue pas une frontière de sécurité à un
 * appelant, fût-il de la maison. Exporté pour être verrouillé par un test.
 */
export function perimetreSur(files) {
  if (!Array.isArray(files) || files.length === 0) return false;
  return files.every((f) => ALLOWED.some((re) => re.test(String(f))));
}

async function api(token, method, chemin, corps) {
  const r = await fetch("https://api.github.com" + chemin, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, data };
}

/**
 * Publie un correctif VÉRIFIÉ : push de sa branche, PR, auto-merge armé.
 * Ne fusionne rien elle-même — c'est GitHub qui fusionnera, et seulement si
 * tous les contrôles requis passent.
 *
 * @returns {{published:boolean, reason?:string, pr?:number, url?:string}}
 */
export async function publishRepair(repair = {}, options = {}) {
  const fetchApi = options.api || api;
  const exec = options.run || run;
  const st = productionState();
  if (!st.possible) return { published: false, reason: st.raison || "indisponible" };
  if (enCours) return { published: false, reason: "publication_en_cours" };
  if (repair.ok !== true || !repair.branch || !repair.sha) return { published: false, reason: "correctif_non_verifie" };
  if (!RE_BRANCHE.test(repair.branch)) return { published: false, reason: "branche_hors_perimetre" };
  if (!perimetreSur(repair.files)) return { published: false, reason: "fichiers_hors_perimetre" };
  if (st.last24h >= PRODUCTION.maxPerDay) return { published: false, reason: "plafond_quotidien" };

  enCours = true;
  try {
    const rem = await exec("git", ["remote", "get-url", "origin"]);
    const cible = parseRemote(rem.out);
    if (!cible) return { published: false, reason: "depot_distant_illisible" };

    const push = await exec("git", ["push", "origin", repair.branch], 180_000);
    if (push.code !== 0) return { published: false, reason: "push_echoue", detail: String(push.err || push.out).slice(-500) };

    const titre = `Sentinelle : ${String(repair.title || repair.key || "correctif automatique").slice(0, 90)}`;
    const corps = [
      "Correctif écrit et **vérifié automatiquement** par la sentinelle du centre de pilotage.",
      "",
      `- Diagnostic : \`${repair.diagnosisId || repair.key || "—"}\``,
      `- Fichiers : ${(repair.files || []).map((f) => "`" + f + "`").join(", ")}`,
      `- Lignes modifiées : ${repair.changedLines ?? repair.lines ?? "—"}`,
      "",
      "Vérifications déjà passées en local avant l'ouverture : syntaxe, audits statiques,",
      "suites e2e du réparateur. **La CI complète du dépôt reste seule juge** : cette PR",
      "porte l'auto-merge, donc elle ne sera fusionnée que si TOUS les contrôles requis",
      "sont verts. Un rouge l'arrête et elle attend un humain.",
      "",
      "Périmètre garanti par la liste blanche de `repair.js`, re-vérifiée à la publication :",
      "`js/*.js`, `styles.css`, `index.html`, `sw.js`. Jamais `tests/`, `.github/`,",
      "`migrations/`, `scripts/` ni `dashboard/`.",
      "",
      "---",
      "_Generated by [Claude Code](https://claude.ai/code)_",
    ].join("\n");

    const pr = await fetchApi(PRODUCTION.token, "POST", `/repos/${cible.owner}/${cible.repo}/pulls`, {
      title: titre, head: repair.branch, base: PRODUCTION.base, body: corps,
    });
    if (!pr.ok) return { published: false, reason: "pr_refusee", status: pr.status, detail: String(pr.data?.message || "").slice(0, 300) };

    const numero = pr.data?.number;
    const url = pr.data?.html_url;

    // ⚠️ L'AUTO-MERGE EST LE CŒUR DU LOT, et il peut être REFUSÉ (fonction
    // désactivée sur le dépôt, protection absente). Un refus ici n'est PAS un
    // échec de la publication : la PR existe, elle est juste en attente d'un
    // humain. On le dit, on ne le tait pas.
    // ⚠️ ON N'APPELLE JAMAIS `PUT /pulls/:n/merge` ICI. Un premier jet de ce
    // fichier le faisait : c'est la fusion IMMÉDIATE, qui court-circuite
    // exactement les contrôles qui rendent ce lot défendable. La seule chose
    // qu'on arme est l'auto-merge NATIF, que GitHub n'honore qu'une fois tous
    // les checks requis verts.
    let autoMerge = { armed: false, reason: "numero_absent" };
    if (numero) autoMerge = await armerAutoMerge(fetchApi, cible, pr.data);

    const ligne = {
      at: Date.now(), pr: numero, url, branch: repair.branch, sha: repair.sha,
      files: repair.files || [], diagnosisId: repair.diagnosisId || null,
      autoMerge: autoMerge.armed, autoMergeReason: autoMerge.reason,
    };
    db.update((d) => { d.publications.unshift(ligne); d.publications = d.publications.slice(0, 200); });
    audit("sentinel_production_published", ligne, "sentinelle");
    broadcast("sentinel_production", ligne);
    return { published: true, pr: numero, url, autoMerge };
  } finally {
    enCours = false;
  }
}

/**
 * Arme l'auto-merge natif de GitHub (GraphQL — l'API REST n'expose pas
 * `enablePullRequestAutoMerge`). Séparé et exporté pour être verrouillé.
 */
export async function armerAutoMerge(fetchApi, cible, prData) {
  const id = prData?.node_id;
  if (!id) return { armed: false, reason: "node_id_absent" };
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + PRODUCTION.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){clientMutationId}}`,
      variables: { id },
    }),
  }).catch((e) => ({ ok: false, _err: e.message }));
  if (!r || !r.ok) return { armed: false, reason: "requete_echouee" };
  let j = null;
  try { j = await r.json(); } catch {}
  if (j?.errors?.length) return { armed: false, reason: String(j.errors[0]?.message || "refus").slice(0, 200) };
  return { armed: true, reason: null };
}
