// LA RÉVISION SERVIE — l'identifiant vérifiable des Edge Functions (dossier de
// livraison §6, 2026-09-16). Chaque réponse (OPTIONS comprise) porte l'en-tête
// `X-Passio-Revision: <valeur>` ; la CI ÉCRIT ici le SHA du commit déployé
// (`.github/workflows/edge-functions.yml`, étape « Révision ») juste avant
// `supabase functions deploy`, puis le RELIT sur la fonction servie (fumée).
// Dans le dépôt, la valeur reste `dev` : un déploiement fait à la main depuis un
// poste se reconnaît à ça, et ne se fait pas passer pour un SHA.
//   curl -sI -X OPTIONS https://<ref>.supabase.co/functions/v1/delete-account | grep -i x-passio-revision
export const REVISION = "dev";
