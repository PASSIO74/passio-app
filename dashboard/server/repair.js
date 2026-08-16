// ═══════════════════════════════════════════════════════════════════════════
// RÉPARATION AUTOMATIQUE — la sentinelle ne se contente plus d'expliquer :
// elle écrit le correctif, le VÉRIFIE, et te le rend prêt à fusionner.
//
// Le trajet complet, sans aucun geste humain :
//   alerte → diagnostic → demande de patch → application dans un worktree
//   ISOLÉ → syntaxe + audits + tests e2e → branche prête (ou rejet motivé)
//
// ─── Trois décisions de conception qui font tenir l'ensemble ─────────────────
//
// 1. WORKTREE ISOLÉ, JAMAIS TON DOSSIER DE TRAVAIL. La réparation tourne pendant
//    que tu codes. Un `git checkout -b` dans le dépôt principal changerait de
//    branche sous tes pieds et mélangerait tes fichiers en cours — c'est
//    exactement l'incident du 2026-07-21 (trois commits mêlant deux travaux).
//    On crée donc `git worktree add` dans un dossier temporaire, avec une
//    jonction vers `node_modules` pour que les tests tournent sans réinstaller.
//    Ton dépôt n'est jamais ni modifié ni déplacé.
//
// 2. LE SERVEUR FOURNIT LES FICHIERS, PAS LE MODÈLE. Écrire un patch demande de
//    voir le code — mais donner un accès disque au modèle est justement ce qu'on
//    s'est interdit (le `cwd` n'est pas une frontière, cf. claudecli.js). Le
//    serveur lit donc lui-même les fichiers concernés, avec son garde de chemin
//    vérifiable, et les met dans le prompt. Le modèle reste sans outils.
//
// 3. LES TESTS SONT LE JUGE, ET ILS SONT INTOUCHABLES. Le patch ne peut pas
//    modifier `tests/`, sinon un correctif paresseux rendrait les tests verts en
//    les réécrivant. Même logique pour la CI, les migrations et la configuration.
//    Un patch qui échoue à la vérification est JETÉ avec son motif : on ne
//    conserve jamais un correctif « probablement bon ».
//
// Ce qui reste hors de portée : la fusion vers `main` et le déploiement. Ce sont
// des gestes d'un clic dans le dashboard, pas des effets de bord d'une alerte.
// ═══════════════════════════════════════════════════════════════════════════
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "./config.js";
import { audit } from "./audit.js";
import { broadcast } from "./sse.js";
import { runSuiteAwait } from "./tests.js";

const env = process.env;
export const REPAIR = {
  enabled: env.DASH_SENTINEL_REPAIR !== "off",
  // Un correctif automatique doit rester petit. Au-delà, ce n'est plus une
  // réparation, c'est une refonte — elle mérite un humain.
  maxChangedLines: Number(env.DASH_REPAIR_MAX_LINES || 120),
  maxFiles: Number(env.DASH_REPAIR_MAX_FILES || 3),
  maxPerHour: Number(env.DASH_REPAIR_MAX_PER_HOUR || 2),
  // Suites de vérification, dans l'ordre : les moins chères d'abord.
  suites: (env.DASH_REPAIR_SUITES || "globals,handlers,smoke").split(",").map((s) => s.trim()).filter(Boolean),
};

// Chemins que le correctif a le droit de toucher. Liste BLANCHE : tout le reste
// est refusé, y compris ce qui pourrait maquiller le verdict.
const ALLOWED = [/^js\/[\w.-]+\.js$/, /^styles\.css$/, /^index\.html$/, /^sw\.js$/];
// Explicité pour le message d'erreur (et pour qu'on lise l'intention d'un coup).
const FORBIDDEN_LABEL = "tests/, .github/, .claude/, migrations/, scripts/, dashboard/, package.json";

const runsWindow = [];
let busy = false;

export function repairState() {
  const now = Date.now();
  return {
    enabled: REPAIR.enabled,
    possible: REPAIR.enabled && config.allowMutations,
    raison: !REPAIR.enabled ? "désactivée (DASH_SENTINEL_REPAIR=off)"
      : !config.allowMutations ? "mutations de code désactivées (production ou DASH_ALLOW_MUTATIONS≠true)" : null,
    busy,
    runsLastHour: runsWindow.filter((t) => now - t < 3600_000).length,
    maxPerHour: REPAIR.maxPerHour,
    suites: REPAIR.suites,
  };
}

// ─── Utilitaires git (sans dépendance) ───────────────────────────────────────
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: opts.cwd || config.repoPath, shell: process.platform === "win32", windowsHide: true, env: { ...process.env, ...(opts.env || {}) } });
    let out = "", err = "";
    p.stdout.on("data", (d) => { if (out.length < 200_000) out += d; });
    p.stderr.on("data", (d) => { if (err.length < 60_000) err += d; });
    const timer = setTimeout(() => { try { p.kill(); } catch {} }, opts.timeoutMs || 120_000);
    p.on("close", (code) => { clearTimeout(timer); resolve({ code, out, err }); });
    p.on("error", (e) => { clearTimeout(timer); resolve({ code: -1, out, err: e.message }); });
  });
}
const git = (args, opts) => run("git", args, opts);

// ─── Extraction et validation du patch ───────────────────────────────────────

/** Récupère le diff unifié d'une réponse de modèle (bloc clôturé ou brut). */
export function extractPatch(text) {
  if (!text) return null;
  const s = String(text);
  const fence = s.match(/```(?:diff|patch)?\s*\n(diff --git[\s\S]*?)```/);
  if (fence) return fence[1].trimEnd() + "\n";
  const i = s.indexOf("diff --git ");
  if (i >= 0) return s.slice(i).replace(/```[\s\S]*$/, "").trimEnd() + "\n";
  return null;
}

/**
 * Vérifie qu'un patch est acceptable AVANT de le laisser approcher du dépôt.
 * @returns {{ok:true, files:string[], lines:number} | {ok:false, raison:string}}
 */
export function validatePatch(patch) {
  if (!patch || patch.length < 20) return { ok: false, raison: "aucun patch dans la réponse" };
  if (patch.length > 200_000) return { ok: false, raison: "patch trop volumineux" };

  const files = [...patch.matchAll(/^diff --git a\/(.+?) b\/(.+?)$/gm)].flatMap((m) => [m[1], m[2]]);
  if (!files.length) return { ok: false, raison: "patch illisible (aucun fichier)" };
  const uniques = [...new Set(files)];
  if (uniques.length > REPAIR.maxFiles) return { ok: false, raison: `${uniques.length} fichiers touchés (maximum ${REPAIR.maxFiles})` };

  for (const f of uniques) {
    const norm = f.replace(/\\/g, "/");
    if (norm.includes("..") || norm.startsWith("/")) return { ok: false, raison: `chemin suspect : ${norm}` };
    if (!ALLOWED.some((re) => re.test(norm))) {
      return { ok: false, raison: `fichier hors périmètre : ${norm} (interdits : ${FORBIDDEN_LABEL})` };
    }
  }
  // Nouveau fichier, suppression, renommage, changement de droits : un correctif
  // automatique modifie du code existant, il ne réorganise pas le dépôt.
  if (/^(new file mode|deleted file mode|rename from|old mode)/m.test(patch)) {
    return { ok: false, raison: "création, suppression ou renommage de fichier — hors périmètre automatique" };
  }
  const lines = (patch.match(/^[+-](?![+-])/gm) || []).length;
  if (lines > REPAIR.maxChangedLines) return { ok: false, raison: `${lines} lignes modifiées (maximum ${REPAIR.maxChangedLines})` };

  return { ok: true, files: uniques, lines };
}

// ─── Prompt de correctif ─────────────────────────────────────────────────────

/** Lit un fichier du dépôt, confiné à la racine, taille bornée. */
export function readRepoFile(rel, maxBytes = 160_000) {
  const root = path.resolve(config.repoPath);
  const abs = path.resolve(root, rel.replace(/^\/+/, ""));
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  try {
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size > maxBytes) return null;
    return fs.readFileSync(abs, "utf8");
  } catch { return null; }
}

export function buildPatchPrompt(diagnosis, fichiers) {
  const L = [];
  L.push("Tu écris un CORRECTIF pour le projet PASSIO (PWA vanilla JS + Supabase).");
  L.push("Un diagnostic automatique a identifié un défaut. Produis le patch minimal qui le corrige.");
  L.push("");
  L.push("RÈGLES ABSOLUES :");
  L.push("• Réponds par UN SEUL bloc ```diff contenant un diff unifié `git diff` applicable tel quel.");
  L.push("  En-têtes `diff --git a/<chemin> b/<chemin>`, chemins relatifs à la racine du dépôt.");
  L.push("• Le correctif doit être MINIMAL : ne reformate rien, ne renomme rien, ne réorganise rien.");
  L.push(`• Tu ne peux modifier QUE : js/*.js, styles.css, index.html, sw.js. Jamais ${FORBIDDEN_LABEL}.`);
  L.push("• Ne touche JAMAIS aux tests pour les faire passer. Si le défaut est dans un test, ne corrige rien.");
  L.push("• Si tu n'es pas sûr de la cause, ou si la correction dépasse quelques dizaines de lignes,");
  L.push("  réponds exactement : PAS DE CORRECTIF SÛR — et explique pourquoi en deux phrases.");
  L.push("  Un patch approximatif appliqué sans surveillance est pire que pas de patch.");
  L.push("");
  L.push("Invariants du projet à respecter (les enfreindre casse ailleurs) :");
  L.push("• `findPostAnywhere(id)` pour chercher un post · `supaTs(s)` pour toute date Supabase.");
  L.push("• Échappement selon le CONTEXTE : escapeHtml (texte), escapeJsArg (argument dans onclick),");
  L.push("  safeUrlAttr (URL d'autrui).");
  L.push("• Scripts classiques partageant `window` : ne redéclare pas une fonction globale existante.");
  L.push("• Toujours lire `{ error }` d'une écriture Supabase : le SDK ne lève pas sur un refus RLS.");
  L.push("• Garder les gardes `if (!el) return;`.");
  L.push("");
  L.push("## Diagnostic");
  L.push(String(diagnosis.analysis || "").slice(0, 12_000));
  L.push("");
  for (const f of fichiers) {
    L.push(`## Fichier actuel — ${f.rel}`);
    L.push("```javascript");
    L.push(f.content);
    L.push("```");
    L.push("");
  }
  L.push("Rappel : un seul bloc ```diff, ou la mention PAS DE CORRECTIF SÛR.");
  return L.join("\n");
}

/** Déduit les fichiers à fournir au modèle, depuis le diagnostic. */
export function filesForDiagnosis(diagnosis) {
  const out = [];
  const seen = new Set();
  const candidats = [];
  const cr = diagnosis?.meta?.codeRef?.file;
  if (cr) candidats.push(cr);
  // Chemins cités dans l'analyse (« js/app-04.js »).
  for (const m of String(diagnosis?.analysis || "").matchAll(/\b(js\/[\w.-]+\.js|styles\.css|index\.html|sw\.js)\b/g)) {
    candidats.push(m[1]);
  }
  for (const rel of candidats) {
    if (seen.has(rel) || out.length >= REPAIR.maxFiles) continue;
    seen.add(rel);
    const content = readRepoFile(rel);
    if (content) out.push({ rel, content });
  }
  return out;
}

// ─── Worktree isolé ──────────────────────────────────────────────────────────

async function createWorktree(branch) {
  const dir = path.join(os.tmpdir(), "passio-sentinelle", branch.replace(/[^\w.-]/g, "_"));
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.rmSync(dir, { recursive: true, force: true });
  const r = await git(["worktree", "add", "-b", branch, dir, "HEAD"]);
  if (r.code !== 0) throw new Error("worktree: " + (r.err || r.out).slice(0, 300));
  // `node_modules` par jonction : les tests doivent tourner sans réinstaller
  // (et sans dupliquer 300 Mo à chaque réparation).
  const src = path.join(config.repoPath, "node_modules");
  const dst = path.join(dir, "node_modules");
  if (fs.existsSync(src) && !fs.existsSync(dst)) {
    if (process.platform === "win32") await run("cmd", ["/c", "mklink", "/J", `"${dst}"`, `"${src}"`], { cwd: dir });
    else { try { fs.symlinkSync(src, dst, "dir"); } catch {} }
  }
  return dir;
}

async function removeWorktree(dir, branch, { keepBranch }) {
  await git(["worktree", "remove", "--force", dir]).catch(() => {});
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  await git(["worktree", "prune"]).catch(() => {});
  if (!keepBranch && branch) await git(["branch", "-D", branch]).catch(() => {});
}

// ─── Boucle de réparation ────────────────────────────────────────────────────

/**
 * Tente de réparer le défaut décrit par un diagnostic.
 * @param {object} diagnosis  enregistrement produit par la sentinelle
 * @param {(prompt:object)=>Promise<{analysis?:string,error?:string}>} analyzer
 * @returns {Promise<object>} compte rendu (jamais d'exception)
 */
export async function attemptRepair(diagnosis, analyzer) {
  const now = Date.now();
  const etat = repairState();
  if (!etat.possible) return { attempted: false, raison: etat.raison };
  if (busy) return { attempted: false, raison: "une réparation est déjà en cours" };
  if (etat.runsLastHour >= REPAIR.maxPerHour) return { attempted: false, raison: "plafond horaire de réparations atteint" };

  // Ne jamais partir d'un dépôt en cours d'édition : le worktree est créé depuis
  // HEAD, donc un travail non committé ne serait PAS dans le correctif testé —
  // on croirait vérifier ton code alors qu'on en vérifie une autre version.
  // `--untracked-files=no` à dessein : seuls les fichiers SUIVIS et modifiés
  // posent problème (ils ne sont pas dans HEAD, donc pas dans ce qu'on teste).
  // Un fichier non suivi — journal, dossier de données, brouillon — ne change
  // rien à la version vérifiée et ne doit pas bloquer la réparation pour toujours.
  const st = await git(["status", "--porcelain", "--untracked-files=no"]);
  if (st.out.trim()) return { attempted: false, raison: "des modifications non committées sont en cours dans le dépôt" };

  const fichiers = filesForDiagnosis(diagnosis);
  if (!fichiers.length) return { attempted: false, raison: "aucun fichier source identifiable dans le diagnostic" };

  busy = true;
  runsWindow.push(now);
  const branch = `sentinelle/${new Date(now).toISOString().slice(0, 10)}-${diagnosis.id}`;
  const rapport = { attempted: true, branch, files: fichiers.map((f) => f.rel), startedAt: now, steps: [] };
  broadcast("sentinel_repair", { phase: "start", id: diagnosis.id, branch });

  let dir = null;
  try {
    // 1. Demander le patch (modèle sans aucun outil : le code est dans le prompt).
    const r = await analyzer(buildPatchPrompt(diagnosis, fichiers), { deep: false });
    if (r.error) { rapport.raison = "génération du correctif en échec : " + r.error; return finish(rapport); }
    if (/PAS DE CORRECTIF S[ÛU]R/i.test(r.analysis || "")) {
      rapport.raison = "le modèle a refusé de proposer un correctif sûr";
      rapport.explication = String(r.analysis).slice(0, 1200);
      return finish(rapport);
    }
    const patch = extractPatch(r.analysis);
    const v = validatePatch(patch);
    if (!v.ok) { rapport.raison = "correctif refusé : " + v.raison; return finish(rapport); }
    rapport.patch = patch;
    rapport.changedLines = v.lines;
    rapport.files = v.files;
    rapport.steps.push({ key: "patch", ok: true, detail: `${v.files.length} fichier(s), ${v.lines} lignes` });

    // 2. Appliquer dans un worktree isolé.
    dir = await createWorktree(branch);
    const tmpPatch = path.join(dir, ".sentinelle.patch");
    fs.writeFileSync(tmpPatch, patch);
    const check = await git(["apply", "--check", ".sentinelle.patch"], { cwd: dir });
    if (check.code !== 0) {
      rapport.raison = "le correctif ne s'applique pas au code actuel";
      rapport.detail = (check.err || check.out).slice(0, 800);
      rapport.steps.push({ key: "apply", ok: false, detail: rapport.detail });
      return finish(rapport, dir, branch);
    }
    await git(["apply", ".sentinelle.patch"], { cwd: dir });
    fs.rmSync(tmpPatch, { force: true });
    rapport.steps.push({ key: "apply", ok: true });

    // 3. Vérifier. Syntaxe d'abord (instantané), puis les suites déclarées.
    for (const rel of v.files.filter((f) => f.endsWith(".js"))) {
      const c = await run(process.execPath, ["--check", rel], { cwd: dir, timeoutMs: 30_000 });
      if (c.code !== 0) {
        rapport.raison = `syntaxe invalide dans ${rel}`;
        rapport.detail = (c.err || c.out).slice(0, 600);
        rapport.steps.push({ key: "syntaxe", ok: false, detail: rapport.detail });
        return finish(rapport, dir, branch);
      }
    }
    rapport.steps.push({ key: "syntaxe", ok: true });

    for (const suite of REPAIR.suites) {
      broadcast("sentinel_repair", { phase: "verify", id: diagnosis.id, suite });
      let res;
      try { res = await runSuiteAwait(suite, dir, "sentinelle"); }
      catch (e) { rapport.raison = "vérification impossible : " + e.message; return finish(rapport, dir, branch); }
      const ok = res.code === 0;
      rapport.steps.push({ key: suite, ok, detail: ok ? null : tail(res.output) });
      if (!ok) {
        rapport.raison = `le correctif casse la vérification « ${suite} »`;
        rapport.detail = tail(res.output);
        return finish(rapport, dir, branch);
      }
    }

    // 4. Tout est vert : on committe sur la branche dédiée et on la GARDE.
    await git(["add", "-A"], { cwd: dir });
    const msg = `fix(sentinelle): ${String(diagnosis.title || "correctif automatique").slice(0, 90)}\n\n`
      + `Correctif propose et VERIFIE automatiquement par la sentinelle du centre de\n`
      + `pilotage, a partir du diagnostic ${diagnosis.id}.\n\n`
      + `Verifications passees : syntaxe, ${REPAIR.suites.join(", ")}.\n`
      + `A RELIRE avant fusion : ce patch a ete ecrit par un modele en reaction a des\n`
      + `donnees d observation, il n a pas ete relu par un humain.\n`;
    const msgFile = path.join(dir, ".sentinelle-msg.txt");
    fs.writeFileSync(msgFile, msg);
    const commit = await git(["commit", "-F", ".sentinelle-msg.txt"], { cwd: dir });
    fs.rmSync(msgFile, { force: true });
    if (commit.code !== 0) {
      rapport.raison = "commit impossible : " + (commit.err || commit.out).slice(0, 300);
      return finish(rapport, dir, branch);
    }
    const sha = (await git(["rev-parse", "--short", "HEAD"], { cwd: dir })).out.trim();
    rapport.ok = true;
    rapport.sha = sha;
    audit("sentinel_repair_ready", { id: diagnosis.id, branch, sha, files: v.files }, "sentinelle");
    // La branche survit au worktree : elle t'attend, prête à fusionner.
    return finish(rapport, dir, branch, { keepBranch: true });
  } catch (e) {
    rapport.raison = "erreur pendant la réparation : " + (e.message || String(e));
    return finish(rapport, dir, branch);
  }
}

function tail(s, n = 1400) { const t = String(s || ""); return t.length > n ? "…" + t.slice(-n) : t; }

function finish(rapport, dir, branch, { keepBranch = false } = {}) {
  busy = false;
  rapport.durationMs = Date.now() - rapport.startedAt;
  const done = () => {
    broadcast("sentinel_repair", { phase: "end", branch: rapport.branch, ok: Boolean(rapport.ok), raison: rapport.raison || null });
  };
  if (dir) { removeWorktree(dir, branch, { keepBranch }).then(done, done); } else done();
  if (!rapport.ok && rapport.attempted) audit("sentinel_repair_rejected", { branch: rapport.branch, raison: rapport.raison }, "sentinelle");
  return rapport;
}

/**
 * Fusionne une branche de réparation dans `main`. Geste HUMAIN : appelé par une
 * route qui exige une confirmation explicite. Ne pousse pas (le déploiement est
 * une décision distincte, prise en connaissance de cause).
 */
export async function mergeRepair(branch, actor) {
  if (!/^sentinelle\/[\w.\-/]+$/.test(branch)) { const e = new Error("Branche hors périmètre."); e.code = 400; throw e; }
  const st = await git(["status", "--porcelain"]);
  if (st.out.trim()) { const e = new Error("Dépôt non propre : committe ou range tes modifications d'abord."); e.code = 409; throw e; }
  const cur = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).out.trim();
  if (cur !== "main") { const e = new Error(`Le dépôt est sur « ${cur} », pas sur main.`); e.code = 409; throw e; }
  const m = await git(["merge", "--no-ff", branch, "-m", `merge(sentinelle): ${branch}`]);
  if (m.code !== 0) {
    await git(["merge", "--abort"]).catch(() => {});
    const e = new Error("Fusion impossible (conflit) : " + (m.err || m.out).slice(0, 300)); e.code = 409; throw e;
  }
  audit("sentinel_repair_merged", { branch }, actor);
  return { merged: branch, pushed: false };
}
