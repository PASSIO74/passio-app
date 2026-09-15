// Edge Function PASSIO — delete-account
// Supprime DÉFINITIVEMENT le compte auth de l'utilisateur appelant (auth.users),
// après une purge VÉRIFIÉE de ses données sous barrière (purge-compte.js).
// Le client ne peut pas le faire lui-même : auth.admin exige la clé service_role,
// qui ne doit JAMAIS être embarquée dans l'app. Voir docs/EDGE_FUNCTION_DELETE_ACCOUNT.md.
//
// Appel côté app : supa.functions.invoke("delete-account") avec la session active
// (le JWT de l'utilisateur part dans le header Authorization).
//
// ⚠️ LE CONTRAT DE RÉPONSE VIT DANS `_shared/suppression-compte.js` (ASTRA-42,
// cinquième contre-revue, 2026-09-15), testé par Node avec un faux client :
// `ok: true` n'est rendu qu'une fois le compte Auth supprimé après une purge
// vérifiée sous barrière ; sans infrastructure (migration non appliquée) la
// réponse est 503 `infrastructure_absente` et RIEN n'est purgé. La v1 purgeait
// « en le disant » et ce fichier jetait la note : HTTP 200 `ok:true`.
// Ici : authentifier, construire le client de service, déléguer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { traiterSuppression } from "../_shared/suppression-compte.js";

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

  // 3. Purge vérifiée sous barrière → suppression Auth → rétention du marqueur.
  const { status, body } = await traiterSuppression(admin, uid);
  return json(body, status);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
