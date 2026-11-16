// ═══════════════════════════════════════════════════════════════════════════
// ASSISTANT CLAUDE CODE — prépare un contexte de diagnostic à partir d'un bug
// réel et, si une clé API est configurée, demande une analyse à Claude.
// SANS clé : renvoie le prompt prêt à copier (aucune simulation d'intégration).
// L'assistant PROPOSE ; il ne modifie jamais la production directement.
// ═══════════════════════════════════════════════════════════════════════════
import { config } from "./config.js";
import { blocContexteAgentSur } from "./contexte-agent-sur.js";
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
  const lines = [];
  lines.push("Tu es Claude Code sur le projet PASSIO (PWA vanilla JS + Supabase).");
  lines.push("Analyse ce problème détecté en conditions réelles et propose un correctif SÛR.");
  lines.push("IMPORTANT : commence TOUJOURS ta réponse par une section « ## En clair » de 2-3 phrases");
  lines.push("expliquant le problème et la solution SANS jargon technique (le lecteur ne connaît rien au code).");
  if (deep) {
    lines.push("LIS les vrais fichiers du dépôt (Read/Grep) autour de la localisation indiquée pour donner un");
    lines.push("patch git EXACT et directement applicable (vrais noms de fonctions/variables/chemins). Ne modifie AUCUN fichier.");
  } else {
    lines.push("Sois RAPIDE et DIRECT : appuie-toi sur les seuls agrégats fournis ci-dessous.");
    lines.push("Ne parle JAMAIS de tes outils ni de leur absence ; commence directement par « ## En clair ».");
  }
  lines.push("");
  // Le contexte riche reste dans la vue propriétaire ; jamais dans la consigne.
  lines.push(blocContexteAgentSur(ctx, "BUG"));
  lines.push("\n## Attendu de ta réponse");
  lines.push("1. Cause probable  2. Fichiers à inspecter  3. Explication  4. Stratégie de correction");
  lines.push("5. Un patch au format `git diff`  6. Tests à lancer  7. Risques et non-régression");
  return lines.join("\n");
}

// Verdict lisible : les libellés de la vue propriétaire ne sont pas des entrées d'agent.

/**
 * Prompt Claude Code pour une chaîne de validation d'action (trace bout-en-bout).
 * Fournit les statuts fermés et compteurs des étapes, jamais leurs libellés.
 */
export function buildTracePrompt(t, suspectsBlock = "") {
  const lines = [];
  lines.push("Tu es Claude Code sur le projet PASSIO (PWA vanilla JS + Supabase).");
  lines.push("Une trace d'action a été agrégée par le centre de pilotage ; distingue les signaux d'une preuve indépendante.");
  lines.push("Diagnostique l'étape en échec et propose un correctif SÛR (aucune modification de fichier maintenant).");
  lines.push("Commence TOUJOURS par « ## En clair » : 2-3 phrases sans jargon.");
  lines.push("");
  lines.push(blocContexteAgentSur({ trace: t, suspects: suspectsBlock }, "TRACE"));
  lines.push("\n## Pistes projet (rappel des invariants)");
  lines.push("- UPDATE/DELETE Supabase touchant 0 ligne = RLS manquante · insert conv_messages exige from_id=auth.uid().");
  lines.push("- Jamais de base64 en DB (→ Storage) · supaTs() pour les timestamps · realtime = publication + canal.");
  lines.push("\n## Attendu de ta réponse");
  // « chemins réels » sans outil de lecture faisait tenter un Glob au modèle en
  // mode rapide (sentinel.json, 4 sorties tronquées) : la consigne suit le mode.
  lines.push("1. Cause probable  2. Fichiers à inspecter (uniquement s'ils apparaissent dans le contexte fourni, sinon INCONNU)  3. Explication  4. Correctif (git diff)");
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
  const L = [];
  L.push("Tu es Claude Code, ingénieur en chef du projet PASSIO (PWA vanilla JS + Supabase).");
  L.push("Voici des signaux de santé agrégés par le centre de pilotage ; ils ne constituent pas une reproduction indépendante.");
  L.push("Diagnostique en priorité ce qui casse un résultat métier, propose un plan d'action ORDONNÉ par risque/impact.");
  L.push("Commence par « ## En clair » (2-3 phrases sans jargon), puis « ## Priorités » (liste ordonnée), puis les détails.");
  L.push("Ne modifie aucun fichier ; pour chaque priorité, donne : cause probable, fichiers à inspecter, correctif, test.");
  L.push("");
  L.push(blocContexteAgentSur(d, "PLATEFORME"));
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
export async function liveAnalyze(prompt, { deep = false } = {}) {
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
  const prompt = buildPrompt(ctx) + (extra.note ? "\n\n" + blocContexteAgentSur({ note: extra.note }, "NOTE") : "");
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
  // Un bug sorti du tampon retombe sur l'événement, s'il y en a un.
  const ctx = (bugId && await buildContext(bugId)) || buildContextFromEvent(event);
  if (!ctx) return { error: "Problème introuvable." };
  const prompt = buildPrompt(ctx, { deep }) + (note ? "\n\n" + blocContexteAgentSur({ note }, "NOTE") : "");
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
