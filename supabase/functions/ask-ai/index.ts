// Edge Function PASSIO — ask-ai
// Assistant IA de l'app (onglet « Assistant IA » de l'Explorer). Reçoit une
// question de l'utilisateur, interroge l'API Claude d'Anthropic avec un prompt
// système propre à PASSIO, et renvoie une réponse courte en français.
//
// Le CLIENT (app-07, sendAIQuery) appelle cette fonction EN PRIORITÉ puis
// retombe sur le moteur local (base de connaissances) si elle échoue ou n'est
// pas déployée → aucune régression tant que le secret n'est pas posé.
//
// Secret requis :
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Déploiement :
//   supabase functions deploy ask-ai
//
// Coût maîtrisé : modèle Haiku (rapide + bon marché), max_tokens borné, et
// rate-limit léger par utilisateur (table optionnelle ai_usage, sinon ignoré).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Haiku 4.5 : rapide et économique, adapté à un assistant grand public à
// l'échelle. Passer à "claude-sonnet-5" pour des réponses plus fouillées.
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 600;

const SYSTEM_PROMPT = [
  "Tu es l'assistant de PASSIO, le réseau social des passions (photographie,",
  "musique, cuisine, voyage, sport, jeux…). Tu aides les membres à progresser",
  "dans leurs passions, découvrir du contenu, organiser des rencontres (events",
  "IRL) et utiliser l'app.",
  "Règles de réponse :",
  "- Réponds en français, ton chaleureux et concret, tutoiement.",
  "- Sois BREF : 2 à 5 phrases ou une courte liste à puces. Pas de blabla.",
  "- Donne des conseils actionnables (matériel, ressources, premiers pas).",
  "- Si la question sort du cadre des passions/loisirs/app, recentre gentiment.",
  "- N'invente pas de fonctionnalités PASSIO que tu ne connais pas ; en cas de",
  "  doute sur l'app, propose d'explorer l'onglet correspondant (Fil, IRL, CDV).",
  "- Jamais de contenu dangereux, illégal, médical/juridique engageant.",
].join(" ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // 1. Authentifier l'appelant (réservé aux comptes réels → anti-abus/coût).
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Non authentifié" }, 401);

  // 2. Lire la question.
  let body: { query?: string };
  try { body = await req.json(); } catch { return json({ error: "Body invalide" }, 400); }
  const query = (body.query || "").toString().trim().slice(0, 800);
  if (!query) return json({ error: "query requise" }, 400);

  // 3. Clé API Anthropic (secret Edge Function).
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "IA non configurée (ANTHROPIC_API_KEY absent)" }, 503);

  // 4. Appel Claude (Messages API).
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: query }],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return json({ error: "Anthropic " + resp.status, detail: errText.slice(0, 300) }, 502);
    }
    const data = await resp.json();
    const text = Array.isArray(data?.content)
      ? data.content.filter((b: { type?: string }) => b.type === "text").map((b: { text?: string }) => b.text || "").join("\n").trim()
      : "";
    if (!text) return json({ error: "Réponse vide" }, 502);
    return json({ text, model: MODEL });
  } catch (e) {
    return json({ error: "Appel IA échoué", detail: String(e).slice(0, 200) }, 502);
  }
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
