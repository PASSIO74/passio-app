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
const pidsDe = (e) => {
  const p = e && e.properties && typeof e.properties === "object" ? e.properties : {};
  if (Array.isArray(p.pids)) return p.pids.filter(pidValide);
  return pidValide(p.pid) ? [p.pid] : [];
};

/**
 * Le bilan, PUR.
 * @param {{ envois?: Array<{ created_at: string, properties: { genre: string, pid?: string, pids?: string[], acceptes?: number } }>,
 *           accuses?: Array<{ pid: string, received_at: string }>,
 *           maintenant?: number, tronque?: boolean }} e
 */
export function bilanReception({ envois = [], accuses = [], maintenant = Date.now(), tronque = false } = {}) {
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

  // ① La dernière alerte du pilotage.
  const alertes = envois.filter((e) => e && e.properties && e.properties.genre === "pilotage" && pidsDe(e).length && Number.isFinite(t(e.created_at)))
    .sort((a, b) => t(b.created_at) - t(a.created_at));
  let derniereAlerte = { etat: "aucune" };
  if (alertes.length) {
    const e = alertes[0];
    const le = t(e.created_at);
    const acceptes = Math.max(0, Number(e.properties.acceptes) || 0);
    const recus = parPid.get(pidsDe(e)[0]) || [];
    const premier = recus.filter(Number.isFinite).sort((a, b) => a - b)[0];
    const age = maintenant - le;
    const base = { le: new Date(le).toISOString(), acceptes, recus: Math.min(recus.length, acceptes || recus.length) };
    if (acceptes === 0) derniereAlerte = { ...base, etat: "aucun_appareil" };
    else if (recus.length) derniereAlerte = { ...base, etat: "recue", delaiMs: Number.isFinite(premier) ? Math.max(0, premier - le) : null };
    else if (age > JUGEMENT_MAX_MS) derniereAlerte = { ...base, etat: "ancienne" };
    else if (age < DELAI_ACCUSE_MS) derniereAlerte = { ...base, etat: "en_attente" };
    else derniereAlerte = { ...base, etat: "non_recue" };
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
  const rappels = jugeables < MIN_RAPPELS
    ? { etat: "insuffisant", envoyes: jugeables, recus: recusRappels, enAttente }
    : { etat: "mesure", envoyes: jugeables, recus: recusRappels, enAttente, taux: recusRappels / jugeables };

  return { derniereAlerte, rappels, accusesIgnores: ignores, tronque: !!tronque };
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
  if (a.etat === "non_recue") {
    return { titre: "Ta dernière alerte n'est arrivée sur aucun appareil",
      reference: `Envoyée le ${a.le.slice(0, 16).replace("T", " ")} UTC, acceptée par le service de notification pour ${a.acceptes} appareil(s), aucun accusé en ${Math.round(DELAI_ACCUSE_MS / 60e3)} min. Un appareil dont PASSIO n'a pas été rouvert depuis la mise à jour du 6 novembre ne sait pas encore accuser : ouvre PASSIO dessus, et vérifie que les notifications y sont autorisées.` };
  }
  if (a.etat === "aucun_appareil") {
    return { titre: "Ta dernière alerte n'a été acceptée pour aucun appareil",
      reference: "Aucun abonnement aux notifications n'a répondu : ouvre PASSIO avec le compte éditeur et active les notifications quand elles sont proposées." };
  }
  return null;
}
