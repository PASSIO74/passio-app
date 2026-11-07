// ═══════════════════════════════════════════════════════════════════════════
// ACCUSÉS DE RÉCEPTION DES NOTIFICATIONS (2026-11-06)
//
// LE DÉFAUT. « 2 appareil(s) recevront les alertes » se déduisait des
// ABONNEMENTS. Un abonnement que le service push accepte n'est pas une
// notification affichée : appareil éteint des jours, permission retirée,
// navigateur purgé, service worker cassé. L'écran promettait une réception
// qu'il ne mesurait pas — la dernière marche de toute la chaîne d'alerte, et
// celle des rappels d'activité qu'un participant attend.
//
// LE CHEMIN.
//   ① Chaque envoi porte un identifiant ALÉATOIRE (`pid`, `crypto.randomUUID`)
//      et l'adresse où l'accuser (l'URL du projet et sa clé anon, publique).
//   ② Le service worker, APRÈS avoir affiché la notification, dépose un accusé
//      sans contenu dans `telemetry_events` (type `push`, action `recu`,
//      meta { pid, genre }, identité nulle). L'affichage ne dépend jamais de
//      l'accusé.
//   ③ Le serveur note chaque envoi (`push_envoye`, analytics_events : pid,
//      genre, nombre d'appareils acceptés — jamais le texte) et rapproche.
//
// CE QUI N'EST PAS UNE PREUVE.
//   · Un accusé dont le pid n'a pas été envoyé ne compte pour RIEN : la table
//     accepte des lignes anonymes, mais un pid ne voyage que dans la
//     notification, chiffrée de bout en bout vers l'appareil abonné.
//   · Une absence d'accusé n'est pas une non-réception avant le délai : elle est
//     « en attente ». Après, elle est « non reçue » — avec la seule cause qu'on
//     sait nommer : un appareil dont le service worker n'a pas encore la mise à
//     jour ne sait pas accuser (il suffit de rouvrir PASSIO dessus).
//   · « Reçue » veut dire affichée par le service worker, jamais « lue ».
//   · La télémétrie brute vit 3 jours : une alerte plus vieille n'est plus
//     jugée (« ancienne »), jamais déclarée perdue.
//
// REVUE ADVERSARIALE (même jour) — ce qu'un accusé anonyme permet, et ce qu'on
// en a fait :
//   · un compte qui reçoit SON rappel connaît SON pid, et peut en déposer des
//     milliers d'accusés : une lecture bornée par paquet de pid se remplissait
//     de ses lignes et faisait passer l'alerte du pilote pour « non reçue ». La
//     dernière alerte se lit désormais SEULE, par SES pid (inconnus de tout
//     autre) ; un paquet de rappels plein rend le taux « partiel », jamais faux ;
//   · un pid PAR APPAREIL pour l'alerte : « reçue sur 1 sur 2 » ne cache plus
//     lequel s'est tu (le service de notification dit la famille du navigateur,
//     jamais qui) ;
//   · une mesure qui s'éteint le DIT (« non mesurée » : adresse d'accusé
//     absente, abonnements illisibles), au lieu d'un écran « calme ».
//
// LES APPELS (2026-11-07). La fonction `notify-call` mesure aussi ses pushes
// d'APPEL, par `_shared/appels.js` : un appel sur ECHANTILLON_APPELS (leur
// volume suit l'audience), tiré par le serveur, un pid partagé par les
// appareils du destinataire, la note `push_envoye` sous `systeme:appels`
// (genre, pids, appareils acceptés — rien de l'appelant). Les notifications
// sociales que la même fonction envoie ne sont PAS mesurées.
//
// Ce fichier est PUR (sauf `pidNeuf`) : Deno l'importe tel quel dans les
// fonctions `pilotage` et `notify-call`, et `node --test
// tests/unit/reception.test.mjs` le charge.
// ═══════════════════════════════════════════════════════════════════════════

export const EVT_ENVOI = "push_envoye";
export const TYPE_ACCUSE = "push";
export const ACTION_ACCUSE = "recu";
/** Au-delà, une alerte sans aucun accusé est « non reçue ». */
export const DELAI_ACCUSE_MS = 10 * 60e3;
/** Au-delà, l'alerte n'est plus jugée : la télémétrie brute ne vit que 3 jours. */
export const JUGEMENT_MAX_MS = 48 * 3600e3;
/** Fenêtre du taux de réception des rappels. */
export const FENETRE_RAPPELS_MS = 24 * 3600e3;
/** Sous ce nombre d'envois jugeables, pas de taux : « trop peu ». */
export const MIN_RAPPELS = 5;
/** Notes d'envoi des RAPPELS lues au plus sur 24 h (une par tour de veille qui a envoyé) : au-delà, le taux est « partiel ». */
export const NOTES_RAPPELS_MAX = 300;

// LES APPELS (notify-call, 2026-11-07). Un appel MESURÉ porte un accusé comme un
// rappel : un pid ALÉATOIRE partagé par les appareils du destinataire — la
// question est « la sonnerie s'est-elle affichée quelque part ? ». Leur volume
// suit l'audience : UN APPEL SUR ECHANTILLON_APPELS, tiré au sort par le SERVEUR
// (jamais dérivé de la requête : l'appelant ne choisit pas lesquels de ses appels
// sont jugés). Pourquoi 1 sur 10, chiffré : docs/AUTONOMIE_EXPLOITATION.md § 3.7 —
// à l'hypothèse de 100 000 inscrits (1 000 à 3 000 appels par jour), 100 à 300
// appels mesurés par jour, loin sous la lecture de NOTES_APPELS_MAX notes (« partiel »
// 2·10⁻⁹ des jours au haut de l'hypothèse) ; la contrepartie, un écran « trop peu »
// tant que moins de ~80 appels par jour sont passés (un taux 9 jours sur 10 dès 78).
// Les deux bornes sont recalculées en loi binomiale par reception.test.mjs ⑰.
export const GENRE_APPEL = "appel";
/** L'auteur des notes d'envoi des appels : hors d'atteinte d'un client (`analytics_insert_own` : user_id = auth.uid()). */
export const UID_APPELS = "systeme:appels";
/** Un appel sur tant porte un accusé. */
export const ECHANTILLON_APPELS = 10;
/** Fenêtre du taux de réception des appels. */
export const FENETRE_APPELS_MS = 24 * 3600e3;
/** Sous ce nombre d'appels mesurés et jugeables, pas de taux : « trop peu ». */
export const MIN_APPELS = 5;
/** Notes d'envoi des APPELS lues au plus sur 24 h (une par appel mesuré) : au-delà, le taux est « partiel ». */
export const NOTES_APPELS_MAX = 400;

/** L'appel est-il mesuré ? PUR. `tirage` ∈ [0, 1), tiré par le serveur (`tirer`, _shared/appels.js). */
export function appelMesure(tirage) {
  return typeof tirage === "number" && tirage >= 0 && tirage * ECHANTILLON_APPELS < 1;
}

// L'ESSAI DES ALERTES (2026-11-07). Sans panne, aucune alerte ne part, et rien
// ne prouve que le téléphone sonnerait le jour où il le faudrait : la mesure
// attendait l'incident. Quand le pilote n'a reçu AUCUNE note d'envoi depuis
// 7 jours, la veille lui envoie UNE notification d'essai, de jour (heure de
// Paris), notée comme une alerte (`essai: true`) et accusée par appareil.
// Borné au catalogue de la politique (`essai_alertes`, circuit A).
export const ESSAI_INTERVALLE_MS = 7 * 864e5;
/** Heures de Paris où un essai peut partir : [debut, fin). */
export const FENETRE_ESSAI = Object.freeze({ debut: 9, fin: 20 });
const fmtHeureParis = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" });
/** L'heure de Paris (0–23) d'un instant — la seule partie « heure » : en français, le format complet dit « 08 h ». */
export const heureParis = (ms) => {
  const h = fmtHeureParis.formatToParts(new Date(ms)).find((x) => x.type === "hour");
  return h ? Number(h.value) : NaN;
};

/**
 * L'essai est-il dû ? PUR. `derniereNote` = la note d'envoi la plus récente du
 * pilote (essai ou vraie alerte), ou null. Hors de la fenêtre de jour : jamais.
 */
export function essaiDu({ derniereNote = null, maintenant = Date.now(), revision = null } = {}) {
  const h = heureParis(maintenant);
  if (!(h >= FENETRE_ESSAI.debut && h < FENETRE_ESSAI.fin)) return false;
  if (!derniereNote) return true;
  const le = Date.parse(derniereNote.created_at);
  if (!Number.isFinite(le) || maintenant - le >= ESSAI_INTERVALLE_MS) return true;
  // Une mesure IMPOSSIBLE (2026-11-07 : le premier essai est parti « sans_adresse »)
  // ne prouve rien pendant 7 jours : l'essai repart UNE fois par révision servie,
  // c'est-à-dire après le déploiement qui a pu la réparer — jamais en boucle.
  const p = derniereNote.properties && typeof derniereNote.properties === "object" ? derniereNote.properties : {};
  return !!revision && p.mesure !== "ok" && p.revision !== revision;
}

/** Paquets de pid de rappels lus ensemble : un pid noyé n'aveugle que les siens. */
export const PAQUET_RAPPELS = 20;
/** Lignes lues au plus par paquet de rappels : au-delà, le taux est « partiel ». */
export const PLAFOND_PAQUET = 1000;

/** Les familles de services de notification, et ce qu'elles disent à l'écran. */
export const SERVICES = Object.freeze({
  chrome: "Chrome (Android ou ordinateur)",
  edge: "Edge (Windows)",
  apple: "Safari (iPhone, iPad, Mac)",
  firefox: "Firefox",
  autre: "autre navigateur",
});

/** La famille du service d'un abonnement, lue dans l'hôte de son adresse — jamais qui. */
export function serviceDe(endpoint) {
  let h = "";
  try { h = new URL(String(endpoint)).hostname.toLowerCase(); } catch (_e) { return "autre"; }
  if (h === "fcm.googleapis.com" || h === "android.googleapis.com") return "chrome";
  if (h.endsWith(".notify.windows.com")) return "edge";
  if (h === "web.push.apple.com" || h.endsWith(".push.apple.com")) return "apple";
  if (h.endsWith(".push.services.mozilla.com")) return "firefox";
  return "autre";
}

const RE_PID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RE_BASE = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;
// La clé anon : l'ancienne forme (un JWT, envoyée en `apikey` ET en `Authorization`)
// ou la nouvelle, publiable (`sb_publishable_…`, en `apikey` SEULEMENT — en Bearer,
// la plateforme la lit comme un JWT et refuse). Mesuré le 07/11 : le premier essai
// est parti « sans_adresse » — la fonction ne recevait pas un JWT (sw.js suit).
const RE_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const RE_PUBLIABLE = /^sb_publishable_[A-Za-z0-9_-]{8,200}$/;
const RE_CLE = { test: (k) => RE_JWT.test(k) || RE_PUBLIABLE.test(k) };
const RE_REF = /^[a-z0-9]{20}$/;

export const pidValide = (p) => typeof p === "string" && RE_PID.test(p);

/** Un pid neuf : aléatoire, jamais dérivable d'autre chose. */
export function pidNeuf() { return crypto.randomUUID(); }

/**
 * L'adresse de l'accusé, ou null si l'une des deux pièces n'a pas sa forme —
 * alors l'envoi part sans accusé (on n'invente jamais une adresse).
 * @param {string} url      SUPABASE_URL de la fonction
 * @param {string} cleAnon  SUPABASE_ANON_KEY (publique)
 */
// Le diagnostic d'adresse relu d'une note : des formes connues, rien d'autre ne passe.
const FORMES_ADRESSE = Object.freeze({ url: ["ok", "deduite", "forme", "absente"], anon: ["jwt", "publiable", "absente", "forme"], publiables: ["ok", "forme", "absente"], cle: ["jwt", "publiable", "absente", "forme"] });
export function diagAdresse(d) {
  if (!d || typeof d !== "object") return null;
  const out = {};
  for (const [k, ok] of Object.entries(FORMES_ADRESSE)) if (ok.includes(d[k])) out[k] = d[k];
  return Object.keys(out).length ? out : null;
}

/** La forme d'une clé, jamais sa valeur : « jwt », « publiable », « absente », « forme ». */
export function formeCle(k) {
  const v = String(k || "");
  return !v ? "absente" : RE_JWT.test(v) && v.length < 2000 ? "jwt" : RE_PUBLIABLE.test(v) ? "publiable" : "forme";
}

/**
 * L'adresse d'accusé depuis l'environnement de la fonction (2026-11-07), et son
 * diagnostic — des FORMES, jamais une valeur. L'URL : SUPABASE_URL, sinon le
 * projet lu dans DENO_DEPLOYMENT_ID (`<ref>_<fonction>_<version>`, documenté pour
 * l'hébergé). La clé : l'ancienne anon (JWT) si la fonction l'a — les service
 * workers d'avant ce lot ne savent accuser qu'avec elle —, sinon la publiable
 * (`SUPABASE_PUBLISHABLE_KEYS`, JSON par nom, `default` d'abord), sinon
 * SUPABASE_ANON_KEY si c'est elle qui porte la publiable.
 * @param {(nom: string) => string | undefined} lire  Deno.env.get, ou un banc
 */
export function adresseAccuse(lire) {
  const env = (n) => { try { return String(lire(n) || "").trim(); } catch (_e) { return ""; } };
  const brute = env("SUPABASE_URL").replace(/\/+$/, "");
  const ref = env("DENO_DEPLOYMENT_ID").split("_")[0];
  const u = RE_BASE.test(brute) ? brute : RE_REF.test(ref) ? "https://" + ref + ".supabase.co" : "";
  const anon = env("SUPABASE_ANON_KEY");
  let publiables = [];
  try {
    const j = JSON.parse(env("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    if (j && typeof j === "object") publiables = [j.default, ...Object.values(j)].map((x) => String(x || ""));
  } catch (_e) { /* illisible : la forme le dit */ }
  const publiable = publiables.find((x) => RE_PUBLIABLE.test(x)) || "";
  const k = formeCle(anon) === "jwt" ? anon : publiable || (formeCle(anon) === "publiable" ? anon : "");
  const diag = {
    url: RE_BASE.test(brute) ? "ok" : u ? "deduite" : brute ? "forme" : "absente",
    anon: formeCle(anon),
    publiables: env("SUPABASE_PUBLISHABLE_KEYS") ? (publiable ? "ok" : "forme") : "absente",
    cle: formeCle(k),
  };
  return { accuse: descripteurAccuse(u, k), diag };
}

export function descripteurAccuse(url, cleAnon) {
  const u = String(url || "").replace(/\/+$/, "");
  const k = String(cleAnon || "");
  return RE_BASE.test(u) && RE_CLE.test(k) && k.length < 2000 ? { u, k } : null;
}

/** La charge d'une notification, avec son pid et son adresse d'accusé quand on en a une. */
export function avecAccuse(charge, pid, accuse) {
  return accuse && pidValide(pid) ? { ...charge, pid, ack: accuse } : charge;
}

const t = (x) => { const v = Date.parse(x); return Number.isFinite(v) ? v : NaN; };
const proprietes = (e) => (e && e.properties && typeof e.properties === "object" ? e.properties : {});
/** Les appareils d'une alerte : { pid, service, accepte } — une note d'un seul pid est un appareil. */
const appareilsDe = (e) => {
  const p = proprietes(e);
  if (Array.isArray(p.appareils)) {
    return p.appareils.filter((a) => a && pidValide(a.pid))
      .map((a) => ({ pid: a.pid, service: Object.hasOwn(SERVICES, a.service) ? a.service : "autre", accepte: a.accepte === true }));
  }
  return pidValide(p.pid) ? [{ pid: p.pid, service: "autre", accepte: (Number(p.acceptes) || 0) > 0 }] : [];
};
/** Les pid d'une note d'envoi (alerte : un par appareil ; rappels : un par rappel). */
export function pidsEnvoi(e) {
  const p = proprietes(e);
  if (Array.isArray(p.appareils)) return appareilsDe(e).map((a) => a.pid);
  if (Array.isArray(p.pids)) return p.pids.filter(pidValide);
  return pidValide(p.pid) ? [p.pid] : [];
}
const pidsDe = pidsEnvoi;

/**
 * Le taux de réception d'un GENRE (rappels, appels) sur sa fenêtre, PUR. Seuls
 * les envois dont le délai d'accusé est passé sont jugés ; les autres attendent,
 * hors du dénominateur. Sous `min` envois jugeables : « trop peu ». Une lecture
 * qui a touché un plafond : « partiel », jamais un taux — un accusé réel a pu
 * rester hors de la lecture (un pid noyé de faux accusés).
 */
function tauxGenre({ envois, parPid, genre, fenetreMs, min, maintenant, tronque }) {
  let jugeables = 0, recus = 0, enAttente = 0;
  for (const e of envois) {
    if (!e || !e.properties || e.properties.genre !== genre) continue;
    const le = t(e.created_at);
    if (!Number.isFinite(le) || maintenant - le > fenetreMs) continue;
    for (const p of pidsDe(e)) {
      if (parPid.has(p)) { jugeables++; recus++; }
      else if (maintenant - le < DELAI_ACCUSE_MS) enAttente++;
      else jugeables++;
    }
  }
  if (tronque) return { etat: "partiel", envoyes: jugeables, recus, enAttente };
  if (jugeables < min) return { etat: "insuffisant", envoyes: jugeables, recus, enAttente };
  return { etat: "mesure", envoyes: jugeables, recus, enAttente, taux: recus / jugeables };
}

/**
 * Le bilan, PUR.
 * @param {{ envois?: Array<{ created_at: string, properties: { genre: string, pid?: string, pids?: string[], acceptes?: number } }>,
 *           accuses?: Array<{ pid: string, received_at: string }>,
 *           maintenant?: number, tronque?: boolean, tronqueRappels?: boolean, tronqueAppels?: boolean,
 *           appelsActifs?: boolean }} e  `appelsActifs` : l'interrupteur serveur des appels (_shared/appels.js).
 */
export function bilanReception({ envois = [], accuses = [], maintenant = Date.now(), tronque = false, tronqueRappels = false, tronqueAppels = false, appelsActifs = true } = {}) {
  // Les accusés par pid, horodatés par le SERVEUR (received_at) ; un pid
  // inconnu de nos envois ne compte pour rien.
  const envoyes = new Set();
  for (const e of envois) for (const p of pidsDe(e)) envoyes.add(p);
  const parPid = new Map();
  let ignores = 0;
  for (const a of accuses) {
    if (!a || !pidValide(a.pid) || !envoyes.has(a.pid)) { ignores++; continue; }
    const l = parPid.get(a.pid) || [];
    l.push(t(a.received_at));
    parPid.set(a.pid, l);
  }

  // ① La dernière alerte du pilotage — par APPAREIL (un pid chacun).
  const alertes = envois.filter((e) => e && proprietes(e).genre === "pilotage" && Number.isFinite(t(e.created_at)))
    .sort((a, b) => t(b.created_at) - t(a.created_at));
  let derniereAlerte = { etat: "aucune" };
  if (alertes.length) {
    const e = alertes[0];
    const p = proprietes(e);
    const le = t(e.created_at);
    const age = maintenant - le;
    const base = { le: new Date(le).toISOString(), ...(p.essai === true ? { essai: true } : {}) };
    if (p.mesure && p.mesure !== "ok") {
      // Une alerte partie sans mesure possible n'est ni reçue ni perdue : on le dit.
      derniereAlerte = { ...base, etat: "non_mesuree", raison: String(p.mesure).slice(0, 40), ...(diagAdresse(p.adresse) ? { adresse: diagAdresse(p.adresse) } : {}) };
    } else {
      const acceptes = appareilsDe(e).filter((a) => a.accepte);
      const appareils = acceptes.map((a) => {
        const l = (parPid.get(a.pid) || []).filter(Number.isFinite).sort((x, y) => x - y);
        return { service: a.service, recu: parPid.has(a.pid), delaiMs: l.length ? Math.max(0, l[0] - le) : null };
      });
      const recus = appareils.filter((a) => a.recu);
      const premier = recus.map((a) => a.delaiMs).filter((x) => x != null).sort((x, y) => x - y)[0];
      const b = { ...base, acceptes: acceptes.length, recus: recus.length, appareils };
      if (!acceptes.length) derniereAlerte = { ...b, etat: "aucun_appareil" };
      else if (recus.length) derniereAlerte = { ...b, etat: "recue", delaiMs: premier == null ? null : premier };
      else if (age > JUGEMENT_MAX_MS) derniereAlerte = { ...b, etat: "ancienne" };
      else if (age < DELAI_ACCUSE_MS) derniereAlerte = { ...b, etat: "en_attente" };
      else derniereAlerte = { ...b, etat: "non_recue" };
    }
  }

  // ② Les rappels d'activité, sur 24 h.
  const rappels = tauxGenre({ envois, parPid, genre: "rappel", fenetreMs: FENETRE_RAPPELS_MS, min: MIN_RAPPELS, maintenant, tronque: tronqueRappels });
  // ③ Les appels (notify-call), sur 24 h, même règle — et l'écran dit que c'est
  // un échantillon (un appel sur ECHANTILLON_APPELS), et si les appels sont COUPÉS :
  // sans cela, « 0 appel mesuré » ne disait pas pourquoi (revue du 2026-11-07).
  const appels = { ...tauxGenre({ envois, parPid, genre: GENRE_APPEL, fenetreMs: FENETRE_APPELS_MS, min: MIN_APPELS, maintenant, tronque: tronqueAppels }),
    echantillon: ECHANTILLON_APPELS, actifs: appelsActifs !== false };

  return { derniereAlerte, rappels, appels, accusesIgnores: ignores, tronque: !!(tronque || tronqueRappels || tronqueAppels) };
}

/**
 * La ligne « À faire » d'une alerte qui n'arrive pas, ou null. Jamais une
 * urgence (prio 1) : l'absence d'accusé a une cause bénigne connue (un
 * appareil pas encore mis à jour), et une alerte sur l'alerte qui sonnerait
 * elle-même ne prouverait rien.
 */
export function ligneReception(b) {
  const a = b && b.derniereAlerte;
  if (!a) return null;
  if (a.etat === "non_recue" && a.essai) {
    return { titre: "L'essai de tes alertes n'est arrivé sur aucun appareil",
      reference: `Essai envoyé le ${a.le.slice(0, 16).replace("T", " ")} UTC, accepté par le service de notification pour ${a.acceptes} appareil(s), aucun accusé en ${Math.round(DELAI_ACCUSE_MS / 60e3)} min : une vraie alerte ne te parviendrait pas non plus. Ouvre PASSIO sur ton téléphone (la mise à jour lui apprend à accuser) et vérifie que les notifications y sont autorisées.` };
  }
  if (a.etat === "non_recue") {
    return { titre: "Ta dernière alerte n'est arrivée sur aucun appareil",
      reference: `Envoyée le ${a.le.slice(0, 16).replace("T", " ")} UTC, acceptée par le service de notification pour ${a.acceptes} appareil(s), aucun accusé en ${Math.round(DELAI_ACCUSE_MS / 60e3)} min. Un appareil dont PASSIO n'a pas été rouvert depuis la mise à jour du 6 novembre ne sait pas encore accuser : ouvre PASSIO dessus, et vérifie que les notifications y sont autorisées.` };
  }
  if (a.etat === "aucun_appareil") {
    return { titre: "Ta dernière alerte n'a été acceptée pour aucun appareil",
      reference: "Aucun abonnement aux notifications n'a répondu : ouvre PASSIO avec le compte éditeur et active les notifications quand elles sont proposées." };
  }
  if (a.etat === "non_mesuree") {
    const ad = a.adresse ? " — URL : " + (a.adresse.url || "?") + ", clé anon : " + (a.adresse.anon || "?") + ", clés publiables : " + (a.adresse.publiables || "?") : "";
    const pourquoi = a.raison === "sans_adresse"
      ? "la fonction pilotage n'avait pas d'adresse d'accusé utilisable" + ad + " ; la version du 07/11 lit aussi la clé publiable, et un essai repart après chaque mise en ligne tant que la mesure est impossible"
      : a.raison === "abonnements_illisibles" ? "les abonnements aux notifications n'ont pas pu être lus au moment de l'alerte" : "la mesure n'a pas pu être faite";
    return { titre: "La réception de ta dernière alerte n'a pas pu être mesurée", reference: `Envoyée le ${String(a.le || "").slice(0, 16).replace("T", " ")} UTC : ${pourquoi}. On ne sait donc pas si elle est arrivée.` };
  }
  return null;
}
