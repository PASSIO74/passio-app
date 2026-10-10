// ═══════════════════════════════════════════════════════════════════════════
// RAPPELS D'ACTIVITÉ PAR PUSH — même appli fermée (2026-10-05)
//
// LE DÉFAUT. `_checkEventReminders` (app-07) rappelait une activité rejointe à
// J-7 / J-1 / H-2… mais il tourne DANS LA PAGE : il ne sonnait que si
// l'application était OUVERTE au bon moment. Application fermée = aucun rappel,
// et le rappel de H-2 (« celui qui fait effectivement VENIR ») était le plus
// sûr de ne jamais partir. Même famille que la cloche des messages privés du
// 2026-09-09. Pour un lancement dans une ville, une activité où la moitié des
// inscrits oublie de venir est une activité ratée — et une ville ratée.
//
// LE CHEMIN. La veille de pilotage (pg_cron, toutes les 5 min, fonction
// `pilotage`, action « veille ») appelle `envoyerRappels` : AUCUNE migration,
// le minuteur serveur existe déjà et tient la minute (un cron GitHub est servi
// à 41 %, avec des trous de 4 à 5 h — inutilisable pour un rappel à H-2).
//
// LES RÈGLES, toutes tenues par `rappelsDus` (PURE, éprouvée en Node par
// tests/unit/rappels.test.mjs — le même fichier que Deno déploie) :
//   ① deux paliers poussés : la veille (J-1, entre H-24 et H-2) et H-2. Le J-7
//      reste dans la cloche de l'application : une push une semaine avant est
//      du bruit, et le bruit fait couper les notifications ;
//   ② on ne rappelle JAMAIS ce qu'on vient de faire : une inscription prise
//      APRÈS l'ouverture du palier ne reçoit pas ce palier (s'inscrire à H-20
//      ne doit pas faire sonner le téléphone dans la seconde) ;
//   ③ une fois, pas plus : la marque `<activité>:<palier>:<compte>` est écrite
//      dans `analytics_events` sous un `user_id` système AVANT l'envoi — aucun
//      client ne peut l'écrire ni l'effacer (policy `analytics_insert_own`),
//      donc ni la forger pour taire le rappel d'un autre, ni la supprimer pour
//      se le faire renvoyer. Au plus une fois : une push perdue n'est pas
//      rejouée, un doublon est pire qu'un oubli ;
//   ④ seuls les participants qui VIENNENT (`going`, `maybe` — la même liste que
//      `joinedEvents` côté client), plus l'organisateur ; jamais la liste
//      d'attente ni un refus ; jamais une activité annulée ;
//   ⑤ seul un compte RÉEL (uuid) reçoit une push ; l'identifiant d'activité est
//      vérifié avant d'entrer dans une URL (le service worker le revérifie) ;
//   ⑥ le texte vient de l'ORGANISATEUR : borné, purgé des caractères de
//      contrôle et des marques bidirectionnelles (une notification n'interprète
//      pas le HTML, mais un texte invisible y usurpe une identité) ;
//   ⑦ l'heure est dite en heure de Paris, absolue (« à 18:00 ») : une veille
//      reprise en retard ne dit jamais « dans 2 h » à 30 minutes du départ.
// ═══════════════════════════════════════════════════════════════════════════

export const FUSEAU = "Europe/Paris";
export const MARQUE_EVENEMENT = "rappel_activite";
export const MARQUE_UID = "systeme:rappels";
export const RSVP_RAPPELES = ["going", "maybe"];
/** Au plus tant de rappels par tour de veille : le reste part au tour suivant (5 min). */
export const MAX_PAR_TOUR = 300;

const HEURE = 3600e3;
/** Du plus proche au plus lointain. `ouvreMs` : distance au départ où le palier s'ouvre. */
export const PALIERS = [
  { cle: "h2", ouvreMs: 2 * HEURE },
  { cle: "j1", ouvreMs: 24 * HEURE },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ID_ACTIVITE_RE = /^[\w-]{1,64}$/;

/** Un horodatage de la base. `date_at`/`created_at` d'`events` sont en UTC SANS fuseau (même règle que `supaTs`). */
export function dateUtc(s) {
  if (s == null || s === "") return NaN;
  if (typeof s === "number") return s;
  let t = String(s).trim().replace(" ", "T");
  if (!/[zZ]$|[+-]\d\d:?\d\d$/.test(t)) t += "Z";
  return Date.parse(t);
}

/** Le palier dû à `diff` ms du départ, ou null (passé, ou plus de 24 h). */
export function palierDu(diff) {
  if (!(diff > 0)) return null;
  for (const p of PALIERS) if (diff <= p.ouvreMs) return p;
  return null;
}

export function cleRappel(idActivite, palier, uid) {
  return idActivite + ":" + palier + ":" + uid;
}

// Caractères de contrôle, de format (marques bidirectionnelles, espaces sans
// chasse) et séparateurs de ligne — le liant U+200D (émojis composés) excepté.
const INVISIBLES_RE = /(?!‍)[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/** Texte affichable dans une notification : propre, une ligne, borné en points de code. */
export function texteSur(s, max) {
  const t = String(s == null ? "" : s).replace(INVISIBLES_RE, " ").replace(/\s+/g, " ").trim();
  const pts = Array.from(t);
  return pts.length > max ? pts.slice(0, max - 1).join("") + "…" : t;
}

const fmtHeure = new Intl.DateTimeFormat("fr-FR", { timeZone: FUSEAU, hour: "2-digit", minute: "2-digit", hour12: false });
const fmtJour = new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtJourSemaine = new Intl.DateTimeFormat("fr-FR", { timeZone: FUSEAU, weekday: "long" });

/** « aujourd'hui » / « demain » / « samedi », jugé sur le calendrier de Paris. */
export function jourRelatif(debut, maintenant) {
  const ecart = Math.round((Date.parse(fmtJour.format(debut)) - Date.parse(fmtJour.format(maintenant))) / 864e5);
  if (ecart === 0) return "aujourd'hui";
  if (ecart === 1) return "demain";
  return fmtJourSemaine.format(debut);
}

/** « 45 min », « 2 h », « 1 h 50 ». */
export function duree(ms) {
  const min = Math.max(1, Math.round(ms / 60e3));
  if (min < 60) return min + " min";
  const h = Math.floor(min / 60), m = min % 60;
  return m ? h + " h " + String(m).padStart(2, "0") : h + " h";
}

/** Titre et corps de la notification. */
export function textesRappel(activite, debut, maintenant, palier) {
  const titre = texteSur(activite && activite.title, 60) || "Ton activité";
  const ville = texteSur(activite && activite.city, 40);
  const heure = fmtHeure.format(debut);
  const ou = ville ? " · " + ville : "";
  const jour = jourRelatif(debut, maintenant);
  const texte = palier === "h2"
    ? "Ça commence dans " + duree(debut - maintenant) + " (à " + heure + ")" + ou
    : "C'est " + jour + " à " + heure + ou;
  return { titre, texte };
}

/**
 * Les rappels à envoyer maintenant. PURE.
 * @param {{ maintenant: number,
 *           activites: Array<{id, title, city, date_at, status, author_id, created_at}>,
 *           participants: Array<{event_id, user_id, rsvp, created_at}>,
 *           dejaEnvoyes: Set<string> | string[] }} e
 */
export function rappelsDus({ maintenant, activites, participants, dejaEnvoyes }) {
  const deja = dejaEnvoyes instanceof Set ? dejaEnvoyes : new Set(dejaEnvoyes || []);
  const parActivite = new Map();
  for (const p of participants || []) {
    if (!p || RSVP_RAPPELES.indexOf(p.rsvp) < 0) continue;
    const l = parActivite.get(p.event_id) || [];
    l.push({ uid: String(p.user_id || ""), inscrit: dateUtc(p.created_at) });
    parActivite.set(p.event_id, l);
  }
  const dus = [];
  for (const a of activites || []) {
    if (!a || !ID_ACTIVITE_RE.test(String(a.id || ""))) continue;
    if (a.status === "cancelled") continue;
    const debut = dateUtc(a.date_at);
    const palier = palierDu(debut - maintenant);
    if (!palier) continue;
    const ouverture = debut - palier.ouvreMs;
    const destinataires = (parActivite.get(a.id) || []).slice();
    if (a.author_id) destinataires.push({ uid: String(a.author_id), inscrit: dateUtc(a.created_at) });
    const vus = new Set();
    for (const d of destinataires) {
      if (!UUID_RE.test(d.uid) || vus.has(d.uid)) continue;
      vus.add(d.uid);
      // Inscrit APRÈS l'ouverture du palier : il vient de le faire, on se tait.
      // (Une date illisible est traitée comme ancienne : mieux vaut rappeler.)
      if (d.inscrit > ouverture) continue;
      const cle = cleRappel(a.id, palier.cle, d.uid);
      if (deja.has(cle)) continue;
      const { titre, texte } = textesRappel(a, debut, maintenant, palier.cle);
      const reste = debut - maintenant;
      dus.push({
        cle, uid: d.uid, idActivite: a.id, palier: palier.cle, titre, texte,
        // Le rappel de la veille n'a plus de sens une fois celui de H-2 dû.
        ttl: Math.max(60, Math.floor((palier.cle === "h2" ? reste : Math.min(reste - 2 * HEURE, 6 * HEURE)) / 1000)),
        urgence: palier.cle === "h2" ? "high" : "normal",
      });
      if (dus.length >= MAX_PAR_TOUR) return dus;
    }
  }
  return dus;
}

/** `date_at` est un `timestamp` SANS fuseau, stocké en UTC : on compare sans le « Z ». */
function isoNaif(ms) { return new Date(ms).toISOString().slice(0, 23); }

/**
 * L'enveloppe : lit, décide (rappelsDus), MARQUE puis envoie. Les dépendances
 * sont injectées (`admin` = client service_role, `envoyer` = web-push) pour
 * qu'un banc Node l'exerce avec un faux PostgREST.
 * Lève sur une lecture ou une marque refusée : rien n'est envoyé sans marque.
 */
export async function envoyerRappels(admin, envoyer, maintenant = Date.now()) {
  const { data: activites, error: e1 } = await admin.from("events")
    .select("id,title,city,date_at,status,author_id,created_at")
    .gte("date_at", isoNaif(maintenant)).lte("date_at", isoNaif(maintenant + 24 * HEURE + 60e3))
    .neq("status", "cancelled").limit(500);
  if (e1) throw e1;
  if (!activites || !activites.length) return { activites: 0, dus: 0, envoyes: 0 };

  const ids = activites.map((a) => a.id);
  const { data: participants, error: e2 } = await admin.from("event_attendees")
    .select("event_id,user_id,rsvp,created_at").in("event_id", ids).in("rsvp", RSVP_RAPPELES).limit(5000);
  if (e2) throw e2;

  const { data: marques, error: e3 } = await admin.from("analytics_events")
    .select("properties").eq("event", MARQUE_EVENEMENT).eq("user_id", MARQUE_UID)
    .gte("created_at", new Date(maintenant - 3 * 864e5).toISOString()).limit(20000);
  if (e3) throw e3;
  const dejaEnvoyes = new Set((marques || []).map((m) => m && m.properties && m.properties.cle).filter(Boolean));

  const dus = rappelsDus({ maintenant, activites, participants: participants || [], dejaEnvoyes });
  if (!dus.length) return { activites: activites.length, dus: 0, envoyes: 0 };

  // ③ La marque AVANT l'envoi : refusée → on lève et RIEN ne part.
  const { error: e4 } = await admin.from("analytics_events").insert(dus.map((r) => ({
    user_id: MARQUE_UID, event: MARQUE_EVENEMENT, properties: { cle: r.cle, palier: r.palier },
  })));
  if (e4) throw e4;

  const uids = [...new Set(dus.map((r) => r.uid))];
  const { data: abonnements, error: e5 } = await admin.from("push_subscriptions")
    .select("endpoint,user_id,subscription").in("user_id", uids);
  if (e5) throw e5;
  const parCompte = new Map();
  for (const s of abonnements || []) {
    const l = parCompte.get(s.user_id) || [];
    l.push(s);
    parCompte.set(s.user_id, l);
  }

  let envoyes = 0, sansAppareil = 0;
  const morts = [];
  await Promise.all(dus.map(async (r) => {
    const subs = parCompte.get(r.uid) || [];
    if (!subs.length) { sansAppareil++; return; }
    const charge = JSON.stringify({ type: "rappel", titre: r.titre, texte: r.texte, eventId: r.idActivite });
    await Promise.all(subs.map(async (s) => {
      try { await envoyer(s.subscription, charge, { TTL: r.ttl, urgency: r.urgence }); envoyes++; }
      catch (e) {
        const c = e && e.statusCode;
        if (c === 404 || c === 410) morts.push(s.endpoint);
      }
    }));
  }));
  // Un abonnement expiré (404/410) se retire, comme notify-call et la veille le font.
  if (morts.length) { try { await admin.from("push_subscriptions").delete().in("endpoint", morts); } catch (_e) { /* au tour suivant */ } }
  return { activites: activites.length, dus: dus.length, envoyes, sansAppareil, expires: morts.length };
}
