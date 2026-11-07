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
// Ce fichier est PUR (sauf `pidNeuf`) : Deno l'importe tel quel dans la
// fonction `pilotage`, et `node --test tests/unit/reception.test.mjs` le charge.
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
export function essaiDu({ derniereNote = null, maintenant = Date.now() } = {}) {
  const h = heureParis(maintenant);
  if (!(h >= FENETRE_ESSAI.debut && h < FENETRE_ESSAI.fin)) return false;
  if (!derniereNote) return true;
  const le = Date.parse(derniereNote.created_at);
  return !Number.isFinite(le) || maintenant - le >= ESSAI_INTERVALLE_MS;
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
const RE_CLE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export const pidValide = (p) => typeof p === "string" && RE_PID.test(p);

/** Un pid neuf : aléatoire, jamais dérivable d'autre chose. */
export function pidNeuf() { return crypto.randomUUID(); }

/**
 * L'adresse de l'accusé, ou null si l'une des deux pièces n'a pas sa forme —
 * alors l'envoi part sans accusé (on n'invente jamais une adresse).
 * @param {string} url      SUPABASE_URL de la fonction
 * @param {string} cleAnon  SUPABASE_ANON_KEY (publique)
 */
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
 * Le bilan, PUR.
 * @param {{ envois?: Array<{ created_at: string, properties: { genre: string, pid?: string, pids?: string[], acceptes?: number } }>,
 *           accuses?: Array<{ pid: string, received_at: string }>,
 *           maintenant?: number, tronque?: boolean }} e
 */
export function bilanReception({ envois = [], accuses = [], maintenant = Date.now(), tronque = false, tronqueRappels = false } = {}) {
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
      derniereAlerte = { ...base, etat: "non_mesuree", raison: String(p.mesure).slice(0, 40) };
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

  // ② Les rappels d'activité, sur 24 h : seuls les envois dont le délai
  // d'accusé est passé sont jugés ; les autres attendent.
  let jugeables = 0, recusRappels = 0, enAttente = 0;
  for (const e of envois) {
    if (!e || !e.properties || e.properties.genre !== "rappel") continue;
    const le = t(e.created_at);
    if (!Number.isFinite(le) || maintenant - le > FENETRE_RAPPELS_MS) continue;
    for (const p of pidsDe(e)) {
      if (parPid.has(p)) { jugeables++; recusRappels++; }
      else if (maintenant - le < DELAI_ACCUSE_MS) enAttente++;
      else jugeables++;
    }
  }
  // Une lecture des rappels qui a touché un plafond ne donne pas de taux : un
  // accusé réel a pu rester hors de la lecture (un pid noyé de faux accusés).
  const rappels = tronqueRappels
    ? { etat: "partiel", envoyes: jugeables, recus: recusRappels, enAttente }
    : jugeables < MIN_RAPPELS
      ? { etat: "insuffisant", envoyes: jugeables, recus: recusRappels, enAttente }
      : { etat: "mesure", envoyes: jugeables, recus: recusRappels, enAttente, taux: recusRappels / jugeables };

  return { derniereAlerte, rappels, accusesIgnores: ignores, tronque: !!(tronque || tronqueRappels) };
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
    const pourquoi = a.raison === "sans_adresse"
      ? "la fonction pilotage n'a pas d'adresse d'accusé (SUPABASE_URL ou SUPABASE_ANON_KEY absente ou mal formée)"
      : a.raison === "abonnements_illisibles" ? "les abonnements aux notifications n'ont pas pu être lus au moment de l'alerte" : "la mesure n'a pas pu être faite";
    return { titre: "La réception de ta dernière alerte n'a pas pu être mesurée", reference: `Envoyée le ${String(a.le || "").slice(0, 16).replace("T", " ")} UTC : ${pourquoi}. On ne sait donc pas si elle est arrivée.` };
  }
  return null;
}
