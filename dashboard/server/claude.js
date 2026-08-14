// ═══════════════════════════════════════════════════════════════════════════
// ASSISTANT CLAUDE CODE — prépare un contexte de diagnostic à partir d'un bug
// réel et, si une clé API est configurée, demande une analyse à Claude.
// SANS clé : renvoie le prompt prêt à copier (aucune simulation d'intégration).
// L'assistant PROPOSE ; il ne modifie jamais la production directement.
// ═══════════════════════════════════════════════════════════════════════════
import { config } from "./config.js";
import { store } from "./store.js";
import { readSnippet, blameFile } from "./git.js";
import { audit } from "./audit.js";
import { runClaudeCli, claudeCliState, liveFixAvailable } from "./claudecli.js";

/** Construit le contexte complet d'un bug (fiche + code + chronologie). */
export async function buildContext(bugId, sessionEvents = []) {
  const bug = store.bug(bugId);
  if (!bug) return null;
  const snippet = bug.codeRef?.file ? readSnippet(bug.codeRef.file, bug.codeRef.line) : null;
  const commits = bug.codeRef?.file ? await blameFile(bug.codeRef.file, 5) : [];
  // Chronologie : les derniers événements de la session qui a produit le bug.
  const sample = bug.samples?.[0];
  const timeline = sample?.session
    ? store.userJourney(sample.session).slice(-25).map((e) => ({ ts: e.ts, type: e.type, action: e.action, screen: e.screen, status: e.status }))
    : [];
  return { bug, snippet, commits, timeline };
}

/** Construit un contexte léger à partir d'UN événement d'erreur (pas d'un bug groupé). */
export function buildContextFromEvent(ev) {
  if (!ev) return null;
  // Tente de localiser le fichier:ligne dans la stack (js/app-0X.js, etc.).
  let codeRef = null;
  const m = String(ev.stack || ev.message || "").match(/((?:js\/)?[\w.-]+\.js):(\d+)/);
  if (m) codeRef = { file: m[1].replace(/^\//, ""), line: Number(m[2]) };
  const snippet = codeRef?.file ? readSnippet(codeRef.file, codeRef.line) : null;
  const bug = {
    title: ev.message || (ev.action ? "Problème : " + ev.action : "Erreur observée"),
    severity: ev.severity || (ev.type === "error" ? "error" : "warn"),
    status: "nouveau", count: 1, users: ev.user_id ? 1 : 0, devices: ev.device_id ? 1 : 0,
    versions: ev.app_version ? [ev.app_version] : [], screens: ev.screen ? [ev.screen] : [],
    endpoint: ev.endpoint, httpStatus: ev.http_status, message: ev.message, stack: ev.stack, codeRef,
  };
  const timeline = ev.session_id
    ? store.userJourney(ev.session_id).slice(-25).map((e) => ({ ts: e.ts, type: e.type, action: e.action, screen: e.screen, status: e.status }))
    : [];
  return { bug, snippet, commits: [], timeline };
}

/** Assemble le PROMPT texte destiné à Claude Code. deep = Claude peut lire le vrai code. */
export function buildPrompt(ctx, { deep = false } = {}) {
  const { bug, snippet, commits, timeline } = ctx;
  const lines = [];
  lines.push("Tu es Claude Code sur le projet PASSIO (PWA vanilla JS + Supabase).");
  lines.push("Analyse ce problème détecté en conditions réelles et propose un correctif SÛR.");
  lines.push("IMPORTANT : commence TOUJOURS ta réponse par une section « ## En clair » de 2-3 phrases");
  lines.push("expliquant le problème et la solution SANS jargon technique (le lecteur ne connaît rien au code).");
  if (deep) {
    lines.push("LIS les vrais fichiers du dépôt (Read/Grep) autour de la localisation indiquée pour donner un");
    lines.push("patch git EXACT et directement applicable (vrais noms de fonctions/variables/chemins). Ne modifie AUCUN fichier.");
  } else {
    lines.push("Sois RAPIDE et DIRECT : appuie-toi sur le contexte fourni ci-dessous (code, stack, chronologie).");
    lines.push("Ne parle JAMAIS de tes outils ni de leur absence ; commence directement par « ## En clair ».");
  }
  lines.push("");
  lines.push("## Bug");
  lines.push(`- Titre : ${bug.title}`);
  lines.push(`- Gravité : ${bug.severity} · Statut : ${bug.status}`);
  lines.push(`- Occurrences : ${bug.count} · Utilisateurs touchés : ${bug.users} · Appareils : ${bug.devices}`);
  lines.push(`- Versions : ${(bug.versions || []).join(", ") || "?"}`);
  lines.push(`- Écrans : ${(bug.screens || []).join(", ") || "?"}`);
  if (bug.endpoint) lines.push(`- Endpoint : ${bug.endpoint} (HTTP ${bug.httpStatus ?? "?"})`);
  lines.push(`- Message : ${bug.message || "(aucun)"}`);
  if (bug.stack) { lines.push("\n## Stack trace"); lines.push("```\n" + String(bug.stack).slice(0, 2500) + "\n```"); }
  if (bug.codeRef) lines.push(`\n## Localisation probable\n- Fichier : ${bug.codeRef.file}${bug.codeRef.line ? ":" + bug.codeRef.line : ""}${bug.codeRef.fn ? " · fonction " + bug.codeRef.fn : ""}`);
  if (snippet) {
    lines.push("\n## Extrait de code");
    lines.push("```javascript");
    for (const l of snippet.lines) lines.push(`${l.n}${l.hot ? " →" : "  "}\t${l.code}`);
    lines.push("```");
  }
  if (commits?.length) { lines.push("\n## Commits récents sur ce fichier"); commits.forEach((c) => lines.push(`- ${c.hash} (${c.date}) ${c.subject}`)); }
  if (timeline?.length) {
    lines.push("\n## Chronologie avant l'erreur (dernière session concernée)");
    timeline.forEach((e) => lines.push(`- ${new Date(e.ts).toISOString().slice(11, 19)} [${e.type}] ${e.action || ""} ${e.screen ? "@" + e.screen : ""} ${e.status !== "ok" ? "(" + e.status + ")" : ""}`));
  }
  lines.push("\n## Attendu de ta réponse");
  lines.push("1. Cause probable  2. Fichiers à inspecter  3. Explication  4. Stratégie de correction");
  lines.push("5. Un patch au format `git diff`  6. Tests à lancer  7. Risques et non-régression");
  return lines.join("\n");
}

// Verdict lisible d'une trace bout-en-bout.
const TRACE_FINAL_FR = {
  success: "SUCCÈS", slow: "SUCCÈS (lent)", partial: "PARTIEL", failed: "ÉCHEC",
  dead_click: "CLIC MORT (sans effet)", unconfirmed: "NON CONFIRMÉ", running: "EN COURS",
};
const STEP_STATUS_FR = { ok: "OK", fail: "ÉCHEC", slow: "LENT", pending: "en attente", unconfirmed: "non confirmé", missing: "NON ATTEINTE" };

/**
 * Prompt Claude Code pour une chaîne de validation d'action (trace bout-en-bout).
 * Fournit l'étape EXACTE en échec + la chaîne complète, sans PII.
 */
export function buildTracePrompt(t) {
  const lines = [];
  lines.push("Tu es Claude Code sur le projet PASSIO (PWA vanilla JS + Supabase).");
  lines.push("Une action utilisateur a été tracée de bout en bout dans le centre de pilotage et n'a PAS abouti.");
  lines.push("Diagnostique l'étape en échec et propose un correctif SÛR (aucune modification de fichier maintenant).");
  lines.push("Commence TOUJOURS par « ## En clair » : 2-3 phrases sans jargon.");
  lines.push("");
  lines.push("## Action tracée");
  lines.push(`- Action : ${t.actionLabel} (\`${t.action}\`) · fonctionnalité : ${t.feature}`);
  lines.push(`- Écran : ${t.screen || "?"} · cible : ${t.target || "?"}`);
  lines.push(`- Verdict final : ${TRACE_FINAL_FR[t.final] || t.final}${t.duplicate ? " · DOUBLON détecté" : ""}`);
  if (t.durationMs != null) lines.push(`- Durée observée : ${t.durationMs} ms`);
  lines.push("");
  lines.push("## Chaîne de validation (étape par étape)");
  for (const s of t.steps) {
    const st = STEP_STATUS_FR[s.status] || s.status;
    const extra = s.http_status ? ` (HTTP ${s.http_status})` : "";
    lines.push(`- ${s.label} : ${st}${extra}`);
  }
  const failStep = t.steps.find((s) => s.status === "fail") || t.steps.find((s) => s.status === "missing");
  if (failStep) lines.push(`\n→ Première étape défaillante : « ${failStep.label} ».`);
  lines.push("\n## Pistes projet (rappel des invariants)");
  lines.push("- UPDATE/DELETE Supabase touchant 0 ligne = RLS manquante · insert conv_messages exige from_id=auth.uid().");
  lines.push("- Jamais de base64 en DB (→ Storage) · supaTs() pour les timestamps · realtime = publication + canal.");
  lines.push("\n## Attendu de ta réponse");
  lines.push("1. Cause probable  2. Fichiers à inspecter (chemins réels)  3. Explication  4. Correctif (git diff)");
  lines.push("5. Tests / vérifications à relancer  6. Risques et non-régression");
  return lines.join("\n");
}

/**
 * Prompt « Diagnostiquer toute la plateforme » : assemble un état de santé
 * synthétique (santé globale, incidents, chaînes d'actions en échec, livraison
 * cross-device, erreurs récentes, dette d'instrumentation) en UN prompt actionnable.
 * Ne contient que des métadonnées agrégées (aucun PII, aucun contenu privé).
 */
export function buildPlatformDiagnosis(d = {}) {
  const { overview = {}, traces = {}, interactions = {}, coverage = {}, bugs = [], errors = [], integrity = null } = d;
  const L = [];
  L.push("Tu es Claude Code, ingénieur en chef du projet PASSIO (PWA vanilla JS + Supabase).");
  L.push("Voici l'état de santé RÉEL de la plateforme, agrégé par le centre de pilotage.");
  L.push("Diagnostique en priorité ce qui casse un résultat métier, propose un plan d'action ORDONNÉ par risque/impact.");
  L.push("Commence par « ## En clair » (2-3 phrases sans jargon), puis « ## Priorités » (liste ordonnée), puis les détails.");
  L.push("Ne modifie aucun fichier ; pour chaque priorité, donne : cause probable, fichiers à inspecter, correctif, test.");
  L.push("");
  const tt = traces.totals || {};
  const it = interactions.totals || {};
  L.push("## Santé globale");
  if (overview.health) L.push(`- Santé : ${overview.health}`);
  if (typeof tt.successRate === "number") L.push(`- Actions abouties (bout en bout) : ${tt.successRate}% · ${tt.failed || 0} échecs · ${tt.partial || 0} partiels · ${tt.dead_click || 0} clics sans effet · ${tt.duplicate || 0} doublons`);
  if (typeof it.deliveryRate === "number") L.push(`- Livraison cross-device (temps réel) : ${it.deliveryRate}% · ${it.unconfirmed || 0} non reçues`);
  L.push(`- Bugs actifs : ${bugs.length} · erreurs récentes distinctes : ${errors.length}`);
  L.push("");
  if ((traces.incidents || []).length) {
    L.push("## Actions dont la chaîne casse (déduplication par action + étape)");
    traces.incidents.slice(0, 12).forEach((g) => L.push(`- ${g.actionLabel} — étape « ${g.stepLabel || g.final} » : ${g.count} occ. · ${g.users} utilisateur(s)`));
    L.push("");
  }
  const badInter = (interactions.stats || []).filter((s) => s.verifiable && s.deliveryRate != null && s.deliveryRate < 90);
  if (badInter.length) {
    L.push("## Interactions mal livrées en temps réel");
    badInter.forEach((s) => L.push(`- ${s.label} : ${s.deliveryRate}% livrées (${s.unconfirmed} non reçues)`));
    L.push("");
  }
  if (integrity && integrity.checks) {
    const bad = integrity.checks.filter((c) => c.status === "error" || c.status === "warn");
    const residue = integrity.checks.filter((c) => c.status === "residue");
    const unknown = integrity.checks.filter((c) => c.status === "unknown");
    const days = (t) => Math.floor((Date.now() - t) / 86400_000);
    L.push("## Intégrité des données (réconciliation — échecs silencieux)");
    if (!bad.length && !unknown.length && !residue.length) L.push(`- Aucune incohérence sur ${integrity.checks.length} règles vérifiées.`);
    bad.forEach((c) => L.push(`- [${c.status}] ${c.label} : ${c.count} ligne(s)${c.partial ? " (analyse partielle, minorant)" : ""}${c.lastAt ? `, dernière il y a ${days(c.lastAt)} j` : ""} — ${c.impact}${c.samples?.length ? " · ex. " + c.samples.slice(0, 5).join(", ") : ""}`));
    residue.forEach((c) => L.push(`- [résidu] ${c.label} : ${c.count} ligne(s), dernière il y a ${c.lastAt ? days(c.lastAt) : "?"} j, AUCUNE récidive récente → défaut probablement déjà corrigé, ne proposer qu'un nettoyage de données (vérifier l'historique git avant tout correctif de code).`));
    unknown.forEach((c) => L.push(`- [non vérifiée] ${c.label} : ${c.error}`));
    L.push("");
  } else if (integrity && integrity.error) {
    L.push(`## Intégrité des données\n- ⚠️ NON VÉRIFIÉE : ${integrity.error}\n`);
  }
  if (bugs.length) {
    L.push("## Bugs actifs (top gravité)");
    bugs.slice(0, 10).forEach((b) => L.push(`- [${b.severity}] ${b.title} — ${b.count}× · ${b.users} utilisateur(s)${b.codeRef ? " · " + b.codeRef.file + (b.codeRef.line ? ":" + b.codeRef.line : "") : ""}`));
    L.push("");
  }
  if ((coverage.uninstrumented || []).length) {
    L.push("## Dette d'instrumentation (actions SANS contrat de résultat)");
    L.push("Ces actions se produisent mais ne sont pas tracées bout en bout — angle mort :");
    coverage.uninstrumented.slice(0, 15).forEach((u) => L.push(`- ${u.action} (${u.count}×)`));
    L.push("");
  }
  L.push("## Attendu");
  L.push("1. « ## En clair »  2. « ## Priorités » (ordonnées)  3. Pour chaque priorité : cause, fichiers, correctif (git diff si possible), tests, risques.");
  L.push("Rappels d'invariants : RLS par propriétaire (UPDATE/DELETE 0 ligne = policy manquante), jamais de base64 en DB, supaTs() pour les dates, escapeHtml/escapeJsArg/safeUrlAttr selon le contexte.");
  return L.join("\n");
}

/** Appelle l'API Anthropic (clé) à partir d'un prompt déjà assemblé. */
async function callClaudeApi(prompt) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": config.anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: config.anthropicModel, max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!resp.ok) { const t = await resp.text(); throw new Error(`API ${resp.status}: ${t.slice(0, 300)}`); }
  const data = await resp.json();
  return (data.content || []).map((c) => c.text).join("\n");
}

/**
 * Analyse « en direct » un prompt en choisissant la source disponible :
 *  1. clé API Anthropic (si configurée) ;
 *  2. sinon le `claude` local GRATUIT (abonnement Claude Code).
 * Retourne { analysis, via } ou { error, authNeeded, via }.
 */
async function liveAnalyze(prompt, { deep = false } = {}) {
  if (config.anthropicKey) {
    try { return { analysis: await callClaudeApi(prompt), via: "api" }; }
    catch (e) { return { error: e.message, via: "api" }; }
  }
  if (claudeCliState().available) {
    return { ...(await runClaudeCli(prompt, { deep })), via: "cli" };
  }
  return { error: "Aucune source d'analyse disponible.", via: "none" };
}

/** Appelle la source d'analyse disponible (rétro-compat pour analyze()). */
async function callClaude(prompt) {
  const r = await liveAnalyze(prompt);
  if (r.error) throw new Error(r.error);
  return r.analysis;
}

/** Analyse un bug. Utilise la clé API OU le `claude` local gratuit. Sinon mode manuel. */
export async function analyze(bugId, extra = {}, actor = null) {
  const ctx = await buildContext(bugId);
  if (!ctx) return { error: "Bug introuvable." };
  const prompt = buildPrompt(ctx) + (extra.note ? `\n\n## Note du testeur\n${extra.note}` : "");
  audit("claude_context", { bugId, via: config.anthropicKey ? "api" : claudeCliState().available ? "cli" : "manuel" }, actor);

  if (!liveFixAvailable()) {
    return { configured: false, prompt,
      hint: "Copie ce prompt dans Claude Code. Pour une analyse automatique ici : soit connecte le `claude` local (gratuit), soit ajoute ANTHROPIC_API_KEY dans .env." };
  }
  const r = await liveAnalyze(prompt);
  if (r.error) return { configured: true, error: r.error, authNeeded: r.authNeeded, via: r.via, prompt };
  return { configured: true, prompt, analysis: r.analysis, via: r.via };
}

/**
 * Réparation « en un clic » : accepte un bug groupé (bugId) OU un événement d'erreur
 * brut (event). Retourne un prompt prêt à copier + l'analyse en direct si une source
 * est disponible (clé API OU `claude` local GRATUIT). Point d'entrée du bouton « Réparer ».
 */
export async function quickFix({ bugId, event, note, deep = false } = {}, actor = null) {
  const ctx = bugId ? await buildContext(bugId) : buildContextFromEvent(event);
  if (!ctx) return { error: "Problème introuvable." };
  const prompt = buildPrompt(ctx, { deep }) + (note ? `\n\n## Note du testeur\n${note}` : "");
  const via = config.anthropicKey ? "api" : claudeCliState().available ? "cli" : "manuel";
  audit("claude_quickfix", { bugId: bugId || null, via, deep }, actor);
  const base = { prompt, apiConfigured: liveFixAvailable(), via, deep, title: ctx.bug.title };
  if (!liveFixAvailable()) {
    return { ...base, hint: "Copie ce texte et colle-le dans Claude Code : il corrigera le problème. Pour une réponse automatique ici, connecte le `claude` local (gratuit) ou ajoute une clé API." };
  }
  const r = await liveAnalyze(prompt, { deep });
  if (r.error) return { ...base, error: r.error, authNeeded: r.authNeeded };
  return { ...base, analysis: r.analysis };
}
