// Plafond d'appels par compte, partagé par les Edge Functions PASSIO.
// En .js et non .ts : Deno l'importe tel quel dans l'Edge Function, et
// `node --test tests/unit/plafond.test.mjs` le charge sans transpileur — le
// verrou mesure le fichier déployé, pas une copie.
//
// Un compte confirmé pouvait appeler `ask-ai` et `notify-call` sans aucune
// borne : l'un facture l'API Anthropic à chaque requête, l'autre réveille le
// téléphone de n'importe quel membre. Une boucle depuis un seul compte suffisait
// à vider le crédit IA ou à harceler tout le monde par push (audit du 2026-09-12).
//
// ⚠️ LE COMPTE VIT EN BASE, PAS EN MÉMOIRE. Le premier jet gardait une Map au
// niveau du module : mesuré en production le 2026-09-12, 23 appels consécutifs
// sont TOUS passés — le runtime Supabase ne garantit aucune mémoire entre deux
// requêtes, et une garde qui n'existe que dans un isolat froid n'existe pas.
// Le compte s'écrit donc dans `analytics_events` (table existante, purgée à
// 13 mois, index sur user_id/event/created_at, écrite ici par service_role),
// un événement `edge_<fonction>` par appel ACCEPTÉ. Aucun DDL à coller.
//
// Un appel REFUSÉ n'écrit rien : sinon un client qui insiste repousserait
// lui-même sa fenêtre indéfiniment. Deux requêtes parallèles peuvent dépasser
// le plafond d'une salve — chaque passage écrit une ligne, la fenêtre se
// referme dès la salve suivante ; ce n'est pas l'illimité d'avant.
//
// Le refus rend 429 avec `retry_after_s` : le client (app-07 `sendAIQuery`)
// retombe déjà sur son moteur local sur toute erreur, et les appelants de
// notify-call avalent l'échec — aucun écran ne casse.

const UNE_MINUTE_MS = 60_000;
const UNE_HEURE_MS = 3_600_000;

/**
 * Verdict PUR depuis les comptes déjà mesurés. `plusAncienMinuteMs` /
 * `plusAncienHeureMs` = horodatage (ms) du plus ancien appel de la fenêtre,
 * pour dire au client quand réessayer ; absents → 60 s / 3600 s.
 * @param {{ minute: number, heure: number, plusAncienMinuteMs?: number, plusAncienHeureMs?: number }} comptes
 * @param {{ parMinute: number, parHeure: number }} plafond
 * @param {number} [maintenant]
 * @returns {{ ok: true } | { ok: false, retryAfterS: number }}
 */
export function verdictDepuisComptes(comptes, plafond, maintenant = Date.now()) {
  if (comptes.heure >= plafond.parHeure) {
    const fin = (comptes.plusAncienHeureMs ?? maintenant) + UNE_HEURE_MS;
    return { ok: false, retryAfterS: Math.max(1, Math.ceil((fin - maintenant) / 1000)) };
  }
  if (comptes.minute >= plafond.parMinute) {
    const fin = (comptes.plusAncienMinuteMs ?? maintenant) + UNE_MINUTE_MS;
    return { ok: false, retryAfterS: Math.max(1, Math.ceil((fin - maintenant) / 1000)) };
  }
  return { ok: true };
}

/**
 * Compte les appels acceptés de `uid` pour `fonction` sur l'heure écoulée,
 * rend le verdict, et n'ÉCRIT la ligne de cet appel que s'il passe.
 *
 * `admin` est un client supabase-js en service_role (la table n'a pas de
 * policy SELECT pour les comptes). Une erreur de lecture ou d'écriture
 * REFUSE l'appel (fail-closed) : on préfère une réponse IA manquée ou une push
 * en retard à une garde qui s'efface en silence quand la base tousse.
 *
 * @param {{ from: (t: string) => any }} admin
 * @param {string} uid
 * @param {string} fonction  ex. "ask-ai" → événement "edge_ask-ai"
 * @param {{ parMinute: number, parHeure: number }} plafond
 * @param {number} [maintenant]
 * @returns {Promise<{ ok: true } | { ok: false, retryAfterS: number }>}
 */
export async function verifierPlafondEnBase(admin, uid, fonction, plafond, maintenant = Date.now()) {
  const evenement = "edge_" + fonction;
  const depuis = new Date(maintenant - UNE_HEURE_MS).toISOString();
  const { data, error } = await admin
    .from("analytics_events")
    .select("created_at")
    .eq("user_id", uid)
    .eq("event", evenement)
    .gt("created_at", depuis)
    .order("created_at", { ascending: true })
    .limit(Math.max(plafond.parHeure, plafond.parMinute) + 1);
  if (error) return { ok: false, retryAfterS: 60 };

  const lignes = (data || []).map((l) => Date.parse(l.created_at)).filter((t) => Number.isFinite(t));
  const dansLaMinute = lignes.filter((t) => maintenant - t < UNE_MINUTE_MS);
  const verdict = verdictDepuisComptes({
    minute: dansLaMinute.length,
    heure: lignes.length,
    plusAncienMinuteMs: dansLaMinute[0],
    plusAncienHeureMs: lignes[0],
  }, plafond, maintenant);
  if (!verdict.ok) return verdict;

  const { error: errInsert } = await admin
    .from("analytics_events")
    .insert({ user_id: uid, event: evenement, properties: {} });
  if (errInsert) return { ok: false, retryAfterS: 60 };
  return { ok: true };
}

/**
 * Réponse 429 uniforme, avec l'en-tête standard et le délai en clair.
 * @param {{ retryAfterS: number }} verdict
 * @param {Record<string, string>} corsHeaders
 */
export function reponsePlafond(verdict, corsHeaders) {
  return new Response(JSON.stringify({ error: "Trop d'appels, réessaie dans un instant", retry_after_s: verdict.retryAfterS }), {
    status: 429,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(verdict.retryAfterS) },
  });
}
