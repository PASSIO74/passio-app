// ═════════════════════════════════════════════════
// PASSIO · ENVOI PUSH — une adresse fournie par un client n'est jamais une destination
// libre (audit de sécurité 2026-11-06).
//
// `push_subscriptions.endpoint` et `.subscription` sont écrits par le client sur sa propre
// ligne. `web-push` ne contrôle qu'une chaîne non vide, part en `https.request`, sans délai
// si on n'en donne pas : le serveur POSTait donc vers n'importe quelle URL HTTPS choisie
// par un compte (requête aveugle vers une cible de son choix, relais depuis l'infrastructure
// PASSIO) et ATTENDAIT sa réponse. Un seul hôte qui accepte la connexion sans répondre
// figeait la veille avant son alerte.
//
// Deux bornes, ici, pures et testées (tests/unit/push-sur.test.mjs) :
//   · `endpointPushSur` : seuls les services push des navigateurs ;
//   · `envoyerPushBorne` : un envoi rend TOUJOURS la main sous un délai.
// La contrainte de base (migration du 2026-11-06) refuse ces lignes à l'écriture ; ce filet
// couvre les lignes antérieures et le temps qui sépare les deux déploiements.
// ═════════════════════════════════════════════════

const SERVICES = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/;

/** Délai laissé au service push (option `timeout` de web-push), en ms. */
export const DELAI_PUSH_MS = 8000;
/** Au-delà, l'envoi est abandonné même si la bibliothèque n'a pas rendu la main. */
const MARGE_MS = 1000;
/** Abonnements lus pour un compte : aucun compte réel n'a plus d'appareils que cela. */
export const MAX_ABONNEMENTS_LUS = 10;

/** Vrai si l'abonnement vise un service push connu, sans port ni identifiants. */
export function endpointPushSur(sub) {
  if (!sub || typeof sub.endpoint !== "string" || sub.endpoint.length > 1024) return false;
  let u;
  try { u = new URL(sub.endpoint); } catch (_e) { return false; }
  return u.protocol === "https:" && !u.port && !u.username && !u.password && SERVICES.test(u.hostname);
}

/**
 * Envoie une push, ou rejette. Une adresse hors liste n'est pas contactée et sa ligne n'est
 * pas effacée (pas de `statusCode` : ce n'est pas un 404/410 du service).
 */
export function envoyerPushBorne(envoyer, sub, charge, opts = {}, delaiMs = DELAI_PUSH_MS) {
  if (!endpointPushSur(sub)) return Promise.reject(new Error("service push non admis"));
  let minuterie;
  const delai = new Promise((_ok, ko) => {
    minuterie = setTimeout(() => ko(new Error("service push muet")), delaiMs + MARGE_MS);
  });
  const envoi = Promise.resolve().then(() => envoyer(sub, charge, { ...opts, timeout: delaiMs }));
  return Promise.race([envoi, delai]).finally(() => clearTimeout(minuterie));
}

/** Une promesse qui rend la main sous `ms` : ce qui suit n'attend pas ce qui traîne. */
export function avecDelai(promesse, ms, valeurSiDepasse) {
  let minuterie;
  const delai = new Promise((ok) => { minuterie = setTimeout(() => ok(valeurSiDepasse), ms); });
  return Promise.race([Promise.resolve(promesse), delai]).finally(() => clearTimeout(minuterie));
}
