import test from "node:test";
import assert from "node:assert/strict";
import { routeTask } from "../server/orchestrator.js";

test("route video generation to Gemini Veo", () => {
  const r = routeTask({ title: "Créer le teaser vidéo Passio", instruction: "Générer une vidéo verticale avec Veo pour les réseaux sociaux." });
  assert.equal(r.category, "video_generation");
  assert.equal(r.primary, "gemini_veo");
  assert.deepEqual(r.agents, ["gemini_veo", "chatgpt"]);
  assert.ok(r.pipeline.includes("Veo 3.1"));
});

test("route UI/UX recommends Lovable then production agents", () => {
  const r = routeTask({ title: "Refondre l'onboarding mobile", instruction: "Améliorer le design et le parcours UX." });
  assert.equal(r.category, "ui_ux");
  assert.equal(r.primary, "lovable");
  assert.equal(r.lovableRecommended, true);
  assert.deepEqual(r.agents, ["lovable", "claude_code", "codex", "chatgpt"]);
});

test("route security work to Claude Code and Codex", () => {
  const r = routeTask({ title: "Audit sécurité RLS", instruction: "Vérifier les permissions Supabase et l'auth." });
  assert.equal(r.category, "security");
  assert.equal(r.primary, "claude_code");
  assert.equal(r.lovableRecommended, false);
  assert.ok(r.agents.includes("codex"));
});

test("route backend work to Claude Code and Codex", () => {
  const r = routeTask({ title: "Ajouter un endpoint API", instruction: "Créer la logique serveur et les tests." });
  assert.equal(r.category, "backend");
  assert.equal(r.primary, "claude_code");
  assert.ok(r.pipeline.includes("Codex"));
});

test("route pure review to Codex first", () => {
  const r = routeTask({ title: "Revue architecture", instruction: "Analyse seulement, challenge cette architecture sans coder." });
  assert.equal(r.category, "review");
  assert.equal(r.primary, "codex");
  assert.deepEqual(r.agents, ["codex", "chatgpt"]);
});

test("route generic engineering to safe default", () => {
  const r = routeTask({ title: "Nettoyer une fonction", instruction: "Refactorer le code et vérifier les tests." });
  assert.equal(r.primary, "claude_code");
  assert.equal(r.lovableRecommended, false);
  assert.ok(r.agents.includes("chatgpt"));
});
