// Pas de vérification gateway universelle : la voie visiteur est contrôlée ici et par RLS.
// Déploiement futur avec verify_jwt=false, seulement après revue et preuves hébergées.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { createPrivateMediaHandler } from "../_shared/medias-proteges.js";
import { createSupabaseMediaDependencies } from "../_shared/medias-proteges-supabase.js";
import { REVISION } from "../_shared/revision.js";

const projectUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
let handler: ((request: Request) => Promise<Response>) | null = null;
if (projectUrl && anonKey && serviceKey) {
  try { handler = createPrivateMediaHandler(createSupabaseMediaDependencies({ projectUrl, anonKey, serviceKey, createClient })); }
  catch { console.warn(JSON.stringify({ event: "private_media_configuration", status: 503 })); }
}
Deno.serve(async (request: Request) => {
  const response = handler ? await handler(request) : new Response(null, { status: 503, headers: {
    "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "Netlify-CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'",
  } });
  response.headers.set("X-Passio-Revision", REVISION);
  // Catégorie/statut seuls, jamais URL, header, identité, erreur brute ou signature.
  if (response.status >= 500) console.warn(JSON.stringify({ event: "private_media_unavailable", status: response.status }));
  return response;
});
