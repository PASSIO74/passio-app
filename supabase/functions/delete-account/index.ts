// Edge Function PASSIO — delete-account
// Supprime DÉFINITIVEMENT le compte auth de l'utilisateur appelant (auth.users),
// après un dernier nettoyage best-effort des données restantes.
// Le client ne peut pas le faire lui-même : auth.admin exige la clé service_role,
// qui ne doit JAMAIS être embarquée dans l'app. Voir docs/EDGE_FUNCTION_DELETE_ACCOUNT.md.
//
// Appel côté app : supa.functions.invoke("delete-account") avec la session active
// (le JWT de l'utilisateur part dans le header Authorization).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // la sécurité repose sur le JWT, pas sur l'origine
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // 1. Identifier l'appelant via son propre JWT — on ne supprime QUE lui.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: "Non authentifié" }, 401);
  }
  const uid = userData.user.id;

  // 2. Client admin (service_role) — injecté automatiquement par Supabase.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 3. Dernier nettoyage des données (le client l'a déjà fait via RLS,
  //    ceci rattrape ce qui aurait échoué côté client).
  const jobs: Array<[string, string]> = [
    ["posts", "author_id"],
    ["post_likes", "user_id"],
    ["post_comments", "author_id"],
    ["stories", "author_id"],
    ["events", "author_id"],
    ["event_attendees", "user_id"],
    ["conv_messages", "from_id"],
    ["conv_members", "user_id"],
    ["notifications", "user_id"],
    ["client_errors", "uid"],
    ["follows", "follower_id"],
    ["follows", "following_id"],
    ["profiles", "id"],
  ];
  for (const [table, col] of jobs) {
    try {
      await admin.from(table).delete().eq(col, uid);
    } catch (_e) { /* best-effort : on ne bloque pas la suppression du compte */ }
  }

  // 4. Suppression du compte auth (e-mail compris) — l'objet de cette fonction.
  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) {
    return json({ error: "Échec de la suppression du compte : " + delErr.message }, 500);
  }

  return json({ ok: true });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
