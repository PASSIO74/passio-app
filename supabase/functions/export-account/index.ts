// ═══════════════════════════════════════════════════════════════════════════
// EXPORT DES DONNÉES DU COMPTE — portabilité RGPD (EXP-08, 2026-09-14)
//
// POST, JWT de la personne dans Authorization : on n'exporte QU'ELLE.
// Réponse : le JSON de `exporterCompte` (tables, médias listés, identité Auth).
// Aucune écriture. Plafonné par `plafond.js` (2/min, 10/h) : un export lit
// toutes les tables du compte, c'est coûteux, et il n'y a aucune raison d'en
// faire plusieurs par minute.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exporterCompte } from "../_shared/export-compte.js";
import { verifierPlafondEnBase, reponsePlafond } from "../_shared/plafond.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Non authentifié" }, 401);
  const user = userData.user;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const verdict = await verifierPlafondEnBase(admin, user.id, "export-account", { parMinute: 2, parHeure: 10 });
  if (!verdict.ok) return reponsePlafond(verdict, corsHeaders);

  const identite = { id: user.id, email: user.email ?? null, cree_le: user.created_at ?? null, derniere_connexion: user.last_sign_in_at ?? null,
    metadonnees: user.user_metadata ?? null };
  const dossier = await exporterCompte(admin, user.id, identite);
  return json(dossier, 200, { "Content-Disposition": `attachment; filename="passio-export-${user.id.slice(0, 8)}.json"` });
});

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", ...extra } });
}
