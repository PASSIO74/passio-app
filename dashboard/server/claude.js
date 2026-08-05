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

/** Assemble le PROMPT texte destiné à Claude Code. */
export function buildPrompt(ctx) {
  const { bug, snippet, commits, timeline } = ctx;
  const lines = [];
  lines.push("Tu es Claude Code sur le projet PASSIO (PWA vanilla JS + Supabase).");
  lines.push("Analyse ce bug détecté en conditions réelles et propose un correctif SÛR.\n");
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

/** Appelle l'API Anthropic si configurée. Sinon indique le mode manuel. */
export async function analyze(bugId, extra = {}, actor = null) {
  const ctx = await buildContext(bugId);
  if (!ctx) return { error: "Bug introuvable." };
  const prompt = buildPrompt(ctx) + (extra.note ? `\n\n## Note du testeur\n${extra.note}` : "");
  audit("claude_context", { bugId, apiUsed: Boolean(config.anthropicKey) }, actor);

  if (!config.anthropicKey) {
    return { configured: false, prompt,
      hint: "ANTHROPIC_API_KEY non configurée : copie ce prompt dans Claude Code, ou renseigne la clé dans .env pour l'analyse en direct." };
  }
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": config.anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: config.anthropicModel, max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
    });
    if (!resp.ok) { const t = await resp.text(); return { configured: true, error: `API ${resp.status}: ${t.slice(0, 300)}`, prompt }; }
    const data = await resp.json();
    const text = (data.content || []).map((c) => c.text).join("\n");
    return { configured: true, prompt, analysis: text, model: config.anthropicModel };
  } catch (e) {
    return { configured: true, error: e.message, prompt };
  }
}
