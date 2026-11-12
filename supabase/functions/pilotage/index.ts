// ═══════════════════════════════════════════════════════════════════════════
// PILOTAGE — le centre de pilotage sans PC (2026-09-28)
//
// POST. Deux familles d'appels :
//
// ① VEILLE — { action: "veille" }, lancée toutes les 5 min par pg_cron
//    (migration_pilotage_veille). Aucun compte : elle ne LIT que des agrégats
//    et n'ÉCRIT qu'une notification vers les appareils de l'éditeur, et
//    seulement sur un CHANGEMENT (decideAlerte). Plafonnée à 1/min, 20/h :
//    l'appeler en boucle ne fait rien de plus que la laisser tourner.
//    Elle porte AUSSI les rappels d'activité par push (_shared/rappels.js,
//    2026-10-05) : le minuteur serveur existait, aucune migration n'est
//    nécessaire. Idempotents (une marque par rappel) : la rappeler ne renvoie rien.
//
// ② PILOTE — JWT de la personne, réservé au compte de l'éditeur (`autorise`,
//    échec fermé : 401 sans session, 403 pour tout autre compte).
//      etat · inscrits · relancer · fusionner · fermer · pause · reprendre · signalement · masquage · reparer · reglages
//    Les gestes GitHub exigent le secret PILOTAGE_GITHUB_TOKEN (sinon 501, dit).
//    Plafond 30/min, 600/h.
//
// La clé service_role ne quitte jamais cette fonction. Aucun corps d'issue ni
// auteur n'en sort (resumerIssue) ; aucun texte d'erreur client n'est jamais
// transmis à un agent (une erreur se confie en relançant la Sentinelle, qui
// applique ses propres désamorçages).
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";
import { avecDelai, endpointPushSur, envoyerPushBorne, MAX_ABONNEMENTS_LUS } from "../_shared/push-sur.js";
import { verifierPlafondEnBase, reponsePlafond } from "../_shared/plafond.js";
import { REVISION } from "../_shared/revision.js";
import { aalDuJeton, egaliteConstante, fusionAutorisee } from "../_shared/pilotage.js";
import {
  autorise, RELANCES, TITRE_PAUSE, STATUTS_SIGNALEMENT, estPauseDuPilote, estReparationDuPilote, reparationConfiee, issueSuivie,
  erreursFrequentes, detailsErreurs, jauges, resumerIssue, resumerRun, verdict, decideAlerte,
  aReparer, titreReparation, corpsReparation, estReparation, REPARATIONS_MAX, COMMENTAIRE_CONFIER, dejaConfiee, compterAudience,
  activation, compteMesurable, dateUtc, GESTES_ACTIVATION, COHORTE_ACTIVATION_JOURS,
  PLAFONDS, bornesJours, estObjetAbsent, MAX_LIGNES_POSTGREST, COMPTE_PILOTE, estAveugle, mesureAveugle,
  tenirVerdict, verdictAffiche, tendance, fenetreMiseEnLigne, aFaire, compteCree, comptesRecents, COMPTES_RECENTS_MAX,
  pageInscrits, INSCRITS_PAR_PAGE, canariDu, ligneCanari, bandePassanteEstimee, coutMensuel, resumerPr, croissanceInscrits,
  EVT_GESTE, RELANCE_SUIVIE_MS, seuilsLancement,
} from "../_shared/pilotage.js";
import { croissance } from "../_shared/croissance.js";
import { envoyerRappels, MARQUE_UID } from "../_shared/rappels.js";
import {
  CLES_REGLAGES, COUPURES_AUTORISEES, normaliserReglage, normaliserMotif, decideDelestage, resumerReglages,
} from "../_shared/reglages.js";
import {
  RETOUR, REVEIL, EVT, enquetesEnCours, doitReveillerSentinelle, decideRetour, deploiementsProduction, choisirPrecedent,
  continuerPagination, TITRE_PROPOSITION, corpsProposition, modeRetour, reveilsEpuises, idGeste, commitCourt, prendreCreneau,
} from "../_shared/autonomie.js";
// Parcours critiques, politique d'automatisation, battement (2026-11-06).
import { bilanParcours, couverture as couvertureParcours, confirmerPannes, comptesAVerifier, melanger } from "../_shared/parcours.js";
import { POLITIQUE, autoriser, resumerPolitique } from "../_shared/politique-autonomie.js";
import { BATTEMENT, AUTEUR_BATTEMENT, BATTEMENT_TOUTES_MS, contenuBattement, resumerBattement } from "../_shared/battement.js";
import { EVT_ENVOI, TYPE_ACCUSE, ACTION_ACCUSE, DELAI_ACCUSE_MS, JUGEMENT_MAX_MS, FENETRE_RAPPELS_MS, FENETRE_APPELS_MS, UID_APPELS, NOTES_RAPPELS_MAX, NOTES_APPELS_MAX, FENETRE_NOTIFS_MS, UID_NOTIFS, NOTES_NOTIFS_MAX, PAQUET_RAPPELS, PLAFOND_PAQUET, adresseAccuse, pidNeuf, avecAccuse, bilanReception, serviceDe, pidsEnvoi, essaiDu } from "../_shared/reception.js";
import { APPELS_ACTIFS } from "../_shared/appels.js";

const corsHeaders = {
  "X-Passio-Revision": REVISION,
  "Access-Control-Expose-Headers": "X-Passio-Revision",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const DEPOT = Deno.env.get("PILOTAGE_DEPOT") || "PASSIO74/passio-app";
const JETON_GH = Deno.env.get("PILOTAGE_GITHUB_TOKEN") || "";
const SITE = Deno.env.get("PILOTAGE_SITE") || "https://passio-app.netlify.app";
const EXTRA = Deno.env.get("PILOTAGE_EMAILS") || "";
// Retour arrière (_shared/autonomie.js, modeRetour) : sans jeton Netlify, rien ;
// avec, la veille PROPOSE et le pilote retire d'un toucher. Jamais de retrait
// automatique : le déclencheur est de la télémétrie écrite par des navigateurs,
// et un retrait automatique pourrait annuler un correctif de sécurité.
const JETON_NETLIFY = Deno.env.get("PILOTAGE_NETLIFY_TOKEN") || "";
const MODE_RETOUR = modeRetour(JETON_NETLIFY);
const SITE_NETLIFY = Deno.env.get("PILOTAGE_NETLIFY_SITE") || "eee53fe0-9fb2-41f4-ab70-0a4e2c3f01a1";
// Clé des marques de geste (idGeste) : un HMAC sous un secret que seule la
// fonction connaît. La clé service_role est posée sur toute fonction et ne
// sort jamais ; un HMAC ne la révèle pas.
const SECRET_GESTES = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// L'adresse des accusés de réception (_shared/reception.js) : l'URL du projet et
// sa clé anon, PUBLIQUE. Absente ou mal formée → les notifications partent sans.
// L'adresse d'accusé (2026-11-07, adresseAccuse) : l'ancienne clé anon OU la
// publiable, l'URL lue ou déduite du projet. Mesuré : le premier essai est parti
// « sans_adresse » — la fonction ne recevait pas la clé sous la forme attendue.
const ADRESSE = adresseAccuse((n) => Deno.env.get(n));
const ACCUSE = ADRESSE.accuse;
type Admin = ReturnType<typeof createClient>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let corps: Record<string, unknown> = {};
  try { corps = await req.json(); } catch { /* corps vide = état */ }
  const action = String(corps.action || "etat");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (action === "veille") {
    // Le secret, une fois posé (PILOTAGE_VEILLE_SECRET), ferme le déclencheur anonyme.
    // Sans lui, rien ne change pour pg_cron (audit 2026-11-06).
    const secret = Deno.env.get("PILOTAGE_VEILLE_SECRET") || "";
    const presente = req.headers.get("x-passio-veille") || "";
    const reconnu = !!secret && egaliteConstante(presente, secret);
    if (secret && !reconnu) return json({ error: "Non authentifié" }, 401);
    return veille(admin);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Non authentifié" }, 401);
  const user = userData.user;
  if (!autorise(user, EXTRA)) return json({ error: "Réservé au compte de l'éditeur." }, 403);
  // À poser (PILOTAGE_EXIGER_AAL2=1) APRÈS l'inscription d'un facteur TOTP, sinon le cockpit se ferme.
  if (Deno.env.get("PILOTAGE_EXIGER_AAL2") === "1" && aalDuJeton(authHeader) !== "aal2") return json({ error: "Second facteur requis." }, 403);

  const plafond = await verifierPlafondEnBase(admin, user.id, "pilotage", { parMinute: 30, parHeure: 600 });
  if (!plafond.ok) return reponsePlafond(plafond, corsHeaders);

  switch (action) {
    // `frais` (2026-11-07) : relu juste après un geste, l'écran ne doit pas sortir du
    // cache de GitHub d'un AUTRE isolat, qui ne l'a pas vidé (lireGithub).
    case "etat": return json(await etat(admin, corps.frais === true));
    case "relancer": return relancer(admin, String(corps.cible || ""));
    case "essai": return essaiManuel(admin);
    case "fusionner": return fusionner(Number(corps.numero));
    case "fermer": return fermer(Number(corps.numero));
    case "pause": return pause(true);
    case "reprendre": return pause(false);
    case "signalement": return traiterSignalement(admin, String(corps.id || ""), String(corps.statut || ""));
    case "masquage": return deciderMasquage(admin, String(corps.id || ""), String(corps.decision || ""));
    case "reparer": return reparer(corps);
    case "reglages": return poserReglage(admin, corps);
    case "retour_apercu": return retourApercu(admin);
    case "retour_arriere": return retourManuel(admin, corps);
    case "inscrits": return listerInscrits(admin, corps);
    default: return json({ error: "Action inconnue." }, 400);
  }
});

// ─── ① Veille ───────────────────────────────────────────────────────────────
// Appelable par n'importe qui (clé anon) : elle ne fait jamais rien de plus que
// ce que ferait pg_cron, et jamais deux fois à moins d'une minute. Un appel
// anonyme qui prend le créneau fait tourner la MÊME veille : il ne l'affame pas.
// Le créneau est ATOMIQUE (`prendreCreneau`, clé primaire sous HMAC) : l'ancien plafond
// « lire, puis écrire » laissait passer DEUX veilles en parallèle une fois sur
// deux depuis que deux ordonnanceurs l'appellent à la même seconde (2026-10-21)
// — rappel envoyé deux fois, voyant noté deux fois (mesuré le 2026-11-06).
async function veille(admin: Admin) {
  const creneau = await prendreCreneau(admin, "systeme:pilotage-veille", "pilotage-veille", SECRET_GESTES);
  if (!creneau.ok) {
    // Pris : une autre veille tourne ou vient de tourner — rien à dire. Erreur :
    // la veille ne tourne pas, et sans cette trace seul le battement périmé
    // (35 min) le dirait, sans sa cause. La réponse publique, elle, ne change pas.
    if (creneau.raison === "erreur") console.warn("veille : créneau refusé " + JSON.stringify({ code: (creneau as { code?: string }).code || "?" }));
    return json({ ok: true, ignore: "trop tôt" });
  }
  // Les signaux (pilotage_audience, 5 min) sont lus AVEC le reste : l'alerte
  // en a besoin (veille aveugle) et ne les attend pas plus que les autres.
  const t0 = Date.now();
  const [sante, signalements, github, dispo, rap, aud, parc] = await Promise.allSettled([lireSante(admin), lireSignalements(admin), lireGithub(), sonder(), avecDelai(rappels(admin), 20_000, { abandon: "delai" }), audience(admin, 300), lireParcoursVeille(admin)]);
  const val = <T>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
  // Un rappel en panne ne doit ni casser la veille ni passer inaperçu : il
  // laisse une trace mesurable (analytics_events, user_id système).
  if (rap.status === "rejected") {
    const m = String((rap.reason && (rap.reason as { message?: string }).message) || rap.reason).slice(0, 200);
    try { await admin.from("analytics_events").insert({ user_id: MARQUE_UID, event: "rappels_echec", properties: { message: m } }); } catch { /* */ }
  }
  const signaux: Audience | null = val(aud);
  // Les parcours critiques (2026-11-06) entrent dans le voyant : un parcours
  // CRITIQUE en panne (comptes serveur distincts, _shared/parcours.js) sonne.
  const parcoursVeille = val(parc);
  const e = { sante: val(sante), signalements: val(signalements), github: val(github), aveugle: signaux && signaux.exact ? mesureAveugle(signaux) : null, parcours: parcoursVeille };
  // L'ALERTE D'ABORD : rien de ce qui suit (Netlify, GitHub, base) ne doit
  // pouvoir la retarder ni la faire taire.
  const v = verdict(e);
  const prec = await lireEtatMemorise(admin);
  // Une source illisible n'est pas une source calme (2026-10-23, tenirVerdict) :
  // une lecture incomplète ne fait jamais BAISSER le voyant mémorisé — sinon
  // une lecture GitHub manquée sonne « Problème résolu », et la suivante
  // « Problème » de nouveau.
  // Une lecture des parcours TRONQUÉE (au-delà de 5 pages) ne prouve pas le calme :
  // un flot de lignes peut pousser l'heure réelle hors de la lecture (revue adversariale).
  const incomplet = [sante, signalements, github, parc].some((r) => r.status === "rejected") || !!(parcoursVeille && parcoursVeille.tronque);
  // Une lecture incomplète laisse sa raison dans les journaux de la fonction : sans elle, rien ne disait
  // pourquoi le voyant mémorisé restait figé. Des codes et des délais, jamais une donnée.
  if (incomplet) {
    const raison = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? String((r.reason && (r.reason as { message?: string }).message) || r.reason).slice(0, 120) : "ok");
    console.warn("veille : lecture incomplète " + JSON.stringify({ sante: raison(sante), signalements: raison(signalements), github: raison(github), parcours: raison(parc) }));
  }
  const vt = tenirVerdict(prec, v, incomplet);
  const actuel = { couleur: vt.couleur, raisons: vt.raisons, dispo: val(dispo) !== false, tenu: !!vt.tenu };
  const d = decideAlerte(prec, actuel);
  const change = !prec || prec.couleur !== actuel.couleur || prec.dispo !== actuel.dispo || d.sonner;
  // UNE transition par état mémorisé : son identifiant est un HMAC de l'état
  // qu'elle remplace (`prec.le`). Deux veilles qui se chevauchent (le créneau
  // espace les DÉPARTS, pas les durées : une veille de plus d'une minute, puis
  // un appel suivant) lisent le même état ; la seconde se heurte à la clé
  // primaire et ne sonne pas une seconde fois (revue adversariale du
  // 2026-11-06). Toute AUTRE erreur d'écriture laisse sonner : l'alerte d'abord.
  // Sans état LU, pas de clé déterministe : `lireEtatMemorise` rend null aussi
  // quand sa lecture échoue, et une clé fixe (« initial ») aurait fait passer la
  // deuxième lecture en échec pour un doublon — une vraie alerte tue. Sans état,
  // un doublon reste possible, un silence jamais.
  let dejaNotee = false;
  if (change) {
    const id = prec && prec.le ? await idGeste(`pilotage_etat:${prec.le}`, SECRET_GESTES).catch(() => null) : null;
    const { error: ee } = await admin.from("analytics_events").insert({ ...(id ? { id } : {}), user_id: "systeme:pilotage", event: "pilotage_etat", properties: {
      couleur: actuel.couleur, dispo: actuel.dispo, raisons: (actuel.raisons || []).slice(0, 4),
      alerteLe: d.sonner ? new Date().toISOString() : (prec && prec.alerteLe) || null,
      dispoDepuis: !prec || prec.dispo !== actuel.dispo ? new Date().toISOString() : prec.dispoDepuis || null,
    } });
    dejaNotee = !!ee && String((ee as { code?: string }).code || "") === "23505";
  }
  let envoyes = 0;
  if (d.sonner && !dejaNotee) envoyes = await sonnerPilote(admin, d.titre!, d.texte || "");
  // Puis ce qui agit seul (délestage 2026-10-11 ; réveil et proposition
  // 2026-10-12, _shared/autonomie.js). Chaque étape est isolée : une panne de
  // l'une ne casse ni les autres ni la veille. Les signaux ont été lus UNE fois,
  // plus haut (pilotage_audience, fenêtre de 5 min) ; absents (migration pas
  // encore appliquée), rien ne bouge.
  const etape = async (f: () => Promise<Record<string, unknown>>) => {
    try { return await f(); } catch (err) { return { erreur: String((err as { message?: string })?.message || err).slice(0, 120) }; }
  };
  // Chaque geste passe d'abord par la politique (_shared/politique-autonomie.js) :
  // invalide, en observation ou en pause → aucun geste, l'observation continue.
  const delestage = await etape(() => delestageAuto(admin, signaux));
  const reveil = await etape(() => reveillerSentinelle(admin, e.github as GhEtat | null, signaux, parcoursVeille));
  const retour = await etape(() => proposerRetour(admin));
  const canari = await etape(() => emettreCanari());
  // L'essai des alertes (2026-11-07) : sans note d'envoi depuis 7 jours, rien ne
  // prouve que le téléphone sonnerait ; un essai part, de jour, et s'accuse.
  const essai = await etape(() => essayerAlertes(admin));
  // Le battement EN DERNIER : il prouve que la veille est allée au bout, et dit
  // ce qu'elle a lu et décidé (_shared/battement.js). Son échec ne casse rien.
  const pol = resumerPolitique();
  const battement = await etape(() => battre(admin, contenuBattement({
    lectures: { sante, signalements, github, parcours: parc, disponibilite: dispo, rappels: rap, audience: aud },
    verdict: vt, sonne: d.sonner, gestes: { delestage, reveil, retour, canari, essai }, politique: pol, parcours: parcoursVeille,
    revision: REVISION, dureeMs: Date.now() - t0,
  })));
  // Les compteurs des rappels ne sortent PAS dans cette réponse : la veille est
  // appelable avec la seule clé anon (publique), et combien d'activités ont lieu
  // dans les 24 h ou combien de comptes sont abonnés ne regardent personne. Ils
  // se lisent dans `analytics_events` (marques `rappel_activite`, `rappels_echec`).
  // ⚠️ RÉPONSE PUBLIQUE MINIMALE (revue adversariale du 2026-11-06) : la veille
  // s'appelle avec la clé anon. Le voyant et les décisions renvoyés servaient
  // d'ORACLE pour régler une dilution des parcours. Tout se lit au pilotage, au
  // battement (analytics_events) et dans les journaux de la fonction.
  console.log("veille " + JSON.stringify({ couleur: actuel.couleur, sonne: d.sonner, envoyes, reveil: !!(reveil && reveil.lance), battement: !!(battement && battement.ecrit) }));
  return json({ ok: true });
}

// Canari serveur (2026-10-31, VEILLE #627) : la veille ne s'éteint pas, le
// poste si. Clé ANON, comme un client public : un refus RLS ou de débit se lit
// dans `{ error }` (le SDK ne lève pas) et la veille le rapporte sans tomber.
async function emettreCanari(): Promise<Record<string, unknown>> {
  if (!canariDu(new Date().getUTCMinutes())) return { emis: false };
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await anon.from("telemetry_events").insert(ligneCanari("can_srv_" + crypto.randomUUID()));
  if (error) return { emis: false, erreur: String(error.message || error).slice(0, 120) };
  return { emis: true };
}

/** Rappels d'activité (J-1, H-2) sur les appareils des participants, appli fermée comprise. */
async function rappels(admin: Admin) {
  // Un geste de la veille comme les autres : il pousse ET oublie les abonnements
  // morts — sous la politique (revue adversariale du 2026-11-06).
  const pol = autoriser(POLITIQUE, "rappels_activite");
  if (!pol.ok) return { inactif: "politique:" + pol.raison };
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return { inactif: "VAPID absent" };
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:passioadmin@gmail.com", pub, priv);
  // deno-lint-ignore no-explicit-any
  return envoyerRappels(admin, (sub: any, charge: string, opts: any) => webpush.sendNotification(sub, charge, opts), Date.now(), SECRET_GESTES, ACCUSE);
}

/**
 * L'essai des alertes (_shared/reception.js, `essaiDu`) : un geste du catalogue
 * (`essai_alertes`), borné à une fois par 7 jours sans AUCUNE note d'envoi du
 * pilote, de jour à Paris. La note qu'il laisse (essai: true) le rend jugeable
 * comme une alerte : « reçu sur N appareils », ou sa ligne « À faire ».
 */
async function essayerAlertes(admin: Admin) {
  const pol = autoriser(POLITIQUE, "essai_alertes");
  if (!pol.ok) return { inactif: "politique:" + pol.raison };
  const { data, error } = await admin.from("analytics_events").select("created_at,properties")
    .eq("event", EVT_ENVOI).eq("user_id", "systeme:pilotage").order("created_at", { ascending: false }).limit(1);
  if (error) throw error;
  if (!essaiDu({ derniereNote: (data || [])[0] || null, maintenant: Date.now(), revision: REVISION })) return { essai: "pas_du" };
  const n = await sonnerPilote(admin, "Essai de tes alertes", "Rien à faire : sans alerte depuis 7 jours, PASSIO vérifie que ses alertes t'arrivent bien.", { essai: true });
  return { essai: "envoye", appareils: n };
}

// Un essai À LA DEMANDE (2026-11-07) : le « Régler » de la ligne des alertes. Il
// PROUVE, ou non, que le téléphone reçoit — au lieu d'ouvrir une page qui ne
// changeait rien à la ligne. Borné : un envoi au pilote toutes les 2 min au plus,
// essai ou alerte ; une lecture en échec n'envoie rien. 10 min d'abord : mesuré le
// 07/11, quatre touchers refusés en cinq minutes, juste après avoir mis à jour
// l'appareil qui devait accuser — le pilote est le seul destinataire.
const ESSAI_MANUEL_MIN_MS = 2 * 60e3;
async function essaiManuel(admin: Admin) {
  const { data, error } = await admin.from("analytics_events").select("created_at")
    .eq("event", EVT_ENVOI).eq("user_id", "systeme:pilotage").order("created_at", { ascending: false }).limit(1);
  if (error) return json({ error: "Lecture impossible : aucun essai n'est parti." }, 503);
  const dernier = dateUtc(data && data[0] ? data[0].created_at : null);
  if (Number.isFinite(dernier) && Date.now() - dernier < ESSAI_MANUEL_MIN_MS) {
    const reste = Math.max(1, Math.ceil((ESSAI_MANUEL_MIN_MS - (Date.now() - dernier)) / 1000));
    return json({ error: "Un envoi vient de partir : le suivant est possible dans " + reste + " s." }, 409);
  }
  const n = await sonnerPilote(admin, "Essai de tes alertes", "Tu l'as demandé depuis le pilotage : si tu lis ceci, tes alertes t'arrivent.", { essai: true, manuel: true });
  if (!n) return json({ error: "Aucun appareil n'a accepté l'essai : ouvre PASSIO avec le compte éditeur et autorise les notifications." }, 409);
  return json({ ok: true, message: "Essai envoyé à " + n + " appareil(s)" + (ACCUSE ? " : son accusé s'affiche dans Réglages › Alertes dans la minute." : ", sans adresse d'accusé : sa réception ne peut pas être mesurée.") });
}

/**
 * Les accusés de réception (_shared/reception.js). Revue adversariale du
 * 2026-11-06 : un compte qui reçoit SON rappel connaît SON pid et peut en
 * déposer des milliers d'accusés anonymes. Donc :
 *   ① la DERNIÈRE alerte se lit seule (sa note), et ses accusés par SES pid —
 *      inconnus de tout autre que les appareils du pilote : aucun flot ne la noie ;
 *   ② les rappels des 24 h se lisent par paquets de PAQUET_RAPPELS pid ; un
 *      paquet plein, ou une liste de notes au plafond, rend le taux « partiel » ;
 *   ③ les appels mesurés (2026-11-07, un sur dix) de même, à part : un appelé
 *      qui noie SON pid ne rend « partiel » que le taux des appels ;
 *   ④ les notifications sociales mesurées (même jour, une sur vingt) de même, à
 *      part — mais leurs notes au-delà de NOTES_NOTIFS_MAX ne rendent PAS le taux
 *      « partiel » : la lecture prend les plus récentes et le bilan dit depuis
 *      quand (`notifsLimitees`) ; seul un paquet d'accusés plein le fait.
 * L'index (type, received_at) de telemetry_events borne chaque lecture aux
 * lignes `push` (un index sur le pid serait une migration : § 8).
 */
async function lireReception(admin: Admin) {
  type Note = { created_at: string; properties: Record<string, unknown> };
  type Accuse = { pid: string; received_at: string };
  const maintenant = Date.now();
  const depuis = new Date(maintenant - JUGEMENT_MAX_MS).toISOString();
  const lirePush = (pids: string[], apres: string, plafond: number) => admin.from("telemetry_events").select("pid:meta->>pid,received_at")
    .eq("type", TYPE_ACCUSE).eq("action", ACTION_ACCUSE).gte("received_at", apres).in("meta->>pid", pids).limit(plafond);
  // Les notes d'un genre sur sa fenêtre, les plus récentes d'abord : `plafond`, et
  // UNE de plus — 300 notes lues ne disent pas s'il y en avait 301 (revue du 2026-11-07).
  const lireNotes = (auteur: string, fenetreMs: number, plafond: number) => admin.from("analytics_events").select("created_at,properties")
    .eq("event", EVT_ENVOI).eq("user_id", auteur).gte("created_at", new Date(maintenant - fenetreMs).toISOString())
    .order("created_at", { ascending: false }).limit(plafond + 1);
  // Les accusés d'une liste de pid, par paquets de PAQUET_RAPPELS : un paquet
  // plein (un pid noyé de faux accusés) rend la mesure « partielle », jamais fausse.
  const parPaquets = async (pids: string[]) => {
    let lus: Accuse[] = [];
    let plein = false;
    for (let i = 0; i < pids.length; i += PAQUET_RAPPELS) {
      const { data, error } = await lirePush(pids.slice(i, i + PAQUET_RAPPELS), depuis, PLAFOND_PAQUET);
      if (error) throw error;
      if ((data || []).length >= PLAFOND_PAQUET) plein = true;
      lus = lus.concat((data || []) as Accuse[]);
    }
    return { lus, plein };
  };
  const pidsDes = (notes: Note[]) => [...new Set(notes.flatMap((e) => pidsEnvoi(e)))];
  const { data: alertes, error: e1 } = await admin.from("analytics_events").select("created_at,properties")
    .eq("event", EVT_ENVOI).eq("user_id", "systeme:pilotage").gte("created_at", depuis)
    .order("created_at", { ascending: false }).limit(1);
  if (e1) throw e1;
  const { data: rappels, error: e2 } = await lireNotes(MARQUE_UID, FENETRE_RAPPELS_MS, NOTES_RAPPELS_MAX);
  if (e2) throw e2;
  // Les appels (notify-call, 2026-11-07, _shared/appels.js) : un sur dix porte un
  // accusé ; ses notes sous `systeme:appels`, que seule la fonction écrit.
  const { data: appels, error: e3 } = await lireNotes(UID_APPELS, FENETRE_APPELS_MS, NOTES_APPELS_MAX);
  if (e3) throw e3;
  // Les notifications sociales (même jour) : une sur vingt porte un accusé ; ses
  // notes sous `systeme:notifs`, que seule notify-call écrit.
  const { data: notifs, error: e4 } = await lireNotes(UID_NOTIFS, FENETRE_NOTIFS_MS, NOTES_NOTIFS_MAX);
  if (e4) throw e4;
  const notesRappels = ((rappels || []) as Note[]).slice(0, NOTES_RAPPELS_MAX);
  const notesAppels = ((appels || []) as Note[]).slice(0, NOTES_APPELS_MAX);
  const notesNotifs = ((notifs || []) as Note[]).slice(0, NOTES_NOTIFS_MAX);
  const envois = [...(alertes || []), ...notesRappels, ...notesAppels, ...notesNotifs] as Note[];
  let accuses: Accuse[] = [];
  const derniere = (alertes || [])[0] as Note | undefined;
  if (derniere) {
    const pids = pidsEnvoi(derniere);
    if (pids.length) {
      // La note est écrite APRÈS tous les envois : un appareil rapide accuse avant
      // elle. La borne basse recule donc du délai d'accusé — ces pid ne sont connus
      // que des appareils du pilote, aucun flot ne s'y glisse (revue du 2026-11-07).
      const le = Date.parse(derniere.created_at);
      const apres = Number.isFinite(le) ? new Date(le - DELAI_ACCUSE_MS).toISOString() : depuis;
      const { data, error } = await lirePush(pids, apres, 200);
      if (error) throw error;
      accuses = accuses.concat((data || []) as Accuse[]);
    }
  }
  const [r, a, n] = await Promise.all([parPaquets(pidsDes(notesRappels)), parPaquets(pidsDes(notesAppels)), parPaquets(pidsDes(notesNotifs))]);
  accuses = accuses.concat(r.lus, a.lus, n.lus);
  // Plus de notes que le plafond, ou un paquet plein : « partiel », genre par genre.
  const tronqueRappels = (rappels || []).length > NOTES_RAPPELS_MAX || r.plein;
  const tronqueAppels = (appels || []).length > NOTES_APPELS_MAX || a.plein;
  // Les notifications sociales : seul un paquet plein rend « partiel » ; plus de
  // notes que la lecture n'en prend raccourcit la fenêtre, et le bilan le dit.
  const tronqueNotifs = n.plein;
  const notifsLimitees = (notifs || []).length > NOTES_NOTIFS_MAX;
  // `appelsActifs` : appels coupés (pilote), l'écran le dit au lieu de « 0 appel mesuré ».
  return bilanReception({ envois, accuses, maintenant, tronqueRappels, tronqueAppels, appelsActifs: APPELS_ACTIFS, tronqueNotifs, notifsLimitees });
}

async function lireEtatMemorise(admin: Admin) {
  const { data } = await admin.from("analytics_events").select("properties,created_at").eq("event", "pilotage_etat")
    .eq("user_id", "systeme:pilotage").order("created_at", { ascending: false }).limit(1);
  const r = data && data[0];
  return r ? { ...(r.properties || {}), le: r.created_at } : null;
}

/** La page répond-elle ? Deux essais de 8 s sur release.json (léger, jamais en cache). */
async function sonder(): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(SITE + "/release.json", { signal: AbortSignal.timeout(8000), headers: { "Cache-Control": "no-cache" } });
      if (r.ok) return true;
    } catch { /* second essai */ }
  }
  return false;
}

// ⚠️ À L'ÉCHELLE (2026-10-11) : la première version ne lisait que la PAGE 1 des
// comptes (1 000). Au 1 001ᵉ inscrit, le compte de l'éditeur pouvait sortir de
// cette page et les alertes cesser d'arriver sur son téléphone — EN SILENCE,
// le jour même où le trafic les rend indispensables. On parcourt donc les
// pages jusqu'à avoir trouvé chaque adresse autorisée (ou la fin de la liste),
// et on garde le résultat 10 min dans l'isolat (un bonus, jamais une garantie).
let cacheUidsPilotes: { at: number; uids: string[] } | null = null;
async function uidsPilotes(admin: Admin): Promise<string[]> {
  if (cacheUidsPilotes && cacheUidsPilotes.uids.length && Date.now() - cacheUidsPilotes.at < 600e3) return cacheUidsPilotes.uids;
  const attendus = new Set([COMPTE_PILOTE, ...EXTRA.split(",")].map((x) => x.trim().toLowerCase()).filter(Boolean));
  const uids: string[] = [];
  const trouves = new Set<string>();
  for (let page = 1; page <= 300; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    const lot = (data && data.users) || [];
    for (const u of lot) if (autorise(u, EXTRA)) { uids.push(u.id); trouves.add(String(u.email).trim().toLowerCase()); }
    if (lot.length < 1000 || trouves.size >= attendus.size) break;
  }
  cacheUidsPilotes = { at: Date.now(), uids };
  return uids;
}

/** Notification sur les appareils de l'éditeur où PASSIO a les notifications activées. */
async function sonnerPilote(admin: Admin, titre: string, texte: string, opts: { essai?: boolean; manuel?: boolean } = {}): Promise<number> {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return 0;
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:passioadmin@gmail.com", pub, priv);
  const uids = await uidsPilotes(admin);
  if (!uids.length) return 0;
  const { data: toutes, error: es } = await admin.from("push_subscriptions").select("endpoint, subscription").in("user_id", uids).limit(MAX_ABONNEMENTS_LUS);
  if (es) console.warn("pilotage : abonnements illisibles " + String((es as { code?: string }).code || ""));
  const subs = (toutes || []).filter((l) => endpointPushSur(l.subscription));
  // Un pid ALÉATOIRE PAR APPAREIL : le service worker l'accuse après l'affichage
  // (_shared/reception.js) ; l'écran dit lequel a reçu, pas « envoyée ».
  const appareils: { pid: string | null; service: string; accepte: boolean }[] = [];
  let n = 0; const morts: string[] = [];
  await Promise.all(subs.map(async (s) => {
    const app = { pid: ACCUSE ? pidNeuf() : null, service: serviceDe(s.endpoint), accepte: false };
    appareils.push(app);
    const payload = JSON.stringify(avecAccuse({ type: "pilotage", titre, texte }, app.pid, ACCUSE));
    try { await envoyerPushBorne((a: unknown, b: unknown, c: unknown) => webpush.sendNotification(a as never, b as never, c as never), s.subscription, payload, { TTL: 3600, urgency: "high" }); n++; app.accepte = true; }
    catch (e) { const c = (e as { statusCode?: number })?.statusCode; if (c === 404 || c === 410) morts.push(s.endpoint); }
  }));
  // La note d'envoi part TOUJOURS — une mesure impossible se dit (« non
  // mesurée »), elle ne laisse pas l'écran « calme ». Elle ne retarde ni ne casse
  // l'alerte : elle est partie. Ni le titre ni le texte n'y entrent.
  const mesure = es ? "abonnements_illisibles" : ACCUSE ? "ok" : "sans_adresse";
  try {
    // `revision` : une mesure impossible se réessaie après le déploiement suivant
    // (essaiDu) ; `adresse` : pourquoi, en FORMES (jamais une clé).
    const { error: en } = await admin.from("analytics_events").insert({ user_id: "systeme:pilotage", event: EVT_ENVOI, properties: { genre: "pilotage", mesure, acceptes: n, appareils, revision: REVISION,
      ...(mesure === "sans_adresse" ? { adresse: ADRESSE.diag } : {}), ...(opts.essai ? { essai: true } : {}), ...(opts.manuel ? { manuel: true } : {}) } });
    if (en) console.warn("pilotage : note d'envoi refusée " + String((en as { code?: string }).code || ""));
  } catch { console.warn("pilotage : note d'envoi injoignable"); }
  // Un refus PERMANENT (404/410) oublie l'abonnement — geste du catalogue (politique).
  if (morts.length && autoriser(POLITIQUE, "purge_abonnements_morts").ok) { try { await admin.from("push_subscriptions").delete().in("endpoint", morts); } catch { /* */ } }
  return n;
}

// ─── ② État complet pour le téléphone ───────────────────────────────────────
async function etat(admin: Admin, frais = false) {
  if (frais && JETON_GH) cacheGh = null;
  const parts = {
    sante: lireSante(admin), utilisateurs: lireUtilisateurs(admin), activation: lireActivation(admin), signalements: lireSignalements(admin),
    github: lireGithub(), erreurs: lireErreurs7j(admin), capacite: lireCapacite(admin),
    disponibilite: lireDisponibilite(admin), alertes: lireAlertes(admin), reglages: lireReglages(admin),
    historique: lireHistorique(admin), croissance: lireCroissance(admin), seuils: lireSeuils(admin),
    parcours: lireParcours(admin), battement: lireBattement(admin), reception: lireReception(admin),
    relances: lireRelances(admin),
  };
  const noms = Object.keys(parts) as (keyof typeof parts)[];
  const res = await Promise.allSettled(noms.map((k) => parts[k]));
  const out: Record<string, unknown> = { genereLe: new Date().toISOString() };
  const nonLus: string[] = [];
  // Pourquoi une partie n'a pas été lue, en une ligne bornée (codes HTTP,
  // délais) : « Non lu » sans raison laissait le pilote deviner.
  const erreursLecture: Record<string, string> = {};
  res.forEach((r, i) => {
    if (r.status === "fulfilled") out[noms[i]] = r.value;
    else { out[noms[i]] = null; nonLus.push(noms[i]); erreursLecture[noms[i]] = String((r.reason && (r.reason as { message?: string }).message) || r.reason || "erreur").slice(0, 120); }
  });
  out.nonLus = nonLus;
  out.erreursLecture = erreursLecture;
  out.relancesPossibles = JETON_GH ? Object.entries(RELANCES).map(([cle, v]) => ({ cle, libelle: v.libelle })) : [];
  // Ce qui agit seul, et pourquoi c'est éteint quand ça l'est (_shared/autonomie.js).
  out.autonomie = { reveilSentinelle: !!JETON_GH, retour: { mode: MODE_RETOUR, jeton: !!JETON_NETLIFY, proposition: await lireProposition(admin) } };
  out.gestesGithub = !!JETON_GH;
  // La politique d'automatisation en vigueur (2026-11-06) : ce que les machines font seules.
  out.politique = resumerPolitique();
  const maintenant = (out.utilisateurs as { maintenant?: Audience | null } | null)?.maintenant || null;
  out.aveugle = maintenant && maintenant.exact ? mesureAveugle(maintenant) : null;
  // Les tendances (2026-10-23) : chaque chiffre contre sa période précédente,
  // et les erreurs depuis la dernière mise en ligne contre la même durée avant.
  const u = out.utilisateurs as { inscritsSemaine?: number; inscritsSemainePrec?: number } | null;
  const er = out.erreurs as { total7?: number; total7Prec?: number } | null;
  out.tendances = {
    inscriptions: u ? tendance(u.inscritsSemaine, u.inscritsSemainePrec, true) : null,
    erreurs: er ? tendance(er.total7, er.total7Prec, false) : null,
  };
  // La bande passante estimée et la facture (2026-11-01) : les appareils de
  // 24 h viennent de `utilisateurs`, lus en parallèle de la capacité.
  const cap = out.capacite as { jauges?: Record<string, unknown>[]; cout?: unknown } | null;
  if (cap && Array.isArray(cap.jauges)) {
    const j24 = (out.utilisateurs as { aujourdhui?: Audience | null } | null)?.aujourdhui || null;
    const bp = j24 ? bandePassanteEstimee(j24.appareils) : null;
    if (bp != null) cap.jauges.push(...jauges({ bandePassante: bp }).filter((j) => j.cle === "bandePassante"));
    cap.cout = coutMensuel(cap.jauges);
  }
  try { out.miseEnLigne = await lireMiseEnLigne(admin, out.github as { runs?: { deploy?: RunResume | null } } | null); }
  catch (err) { out.miseEnLigne = null; nonLus.push("miseEnLigne"); erreursLecture.miseEnLigne = String((err as { message?: string })?.message || err).slice(0, 120); }
  const v = verdict(out as Parameters<typeof verdict>[0]);
  const dispo = out.disponibilite as { repond?: boolean } | null;
  if (dispo && dispo.repond === false) { v.couleur = "rouge"; v.titre = "Problème en cours"; v.raisons = ["le site ne répond pas", ...v.raisons.filter((x: string) => !/^Aucune/.test(x))]; }
  // Jamais de vert sans avoir tout lu : ce qui manque est dit (verdictAffiche).
  out.verdict = verdictAffiche(v, nonLus);
  // Ce qui attend le pilote, en UNE liste triée par urgence (_shared/pilotage.js).
  // Une liste qui ne se construit pas n'emporte pas le reste : la page dit alors
  // « Liste indisponible », jamais « Rien à faire ».
  try { out.aFaire = aFaire(out); }
  catch (err) { out.aFaire = null; nonLus.push("aFaire"); erreursLecture.aFaire = String((err as { message?: string })?.message || err).slice(0, 120); }
  return out;
}

const ilYa = (ms: number) => new Date(Date.now() - ms).toISOString();
async function compter(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function lireSante(admin: Admin) {
  const depuis = ilYa(15 * 60e3);
  const prod = () => admin.from("telemetry_events").select("id", { count: "exact", head: true }).eq("env", "production").gte("received_at", depuis);
  const [evenements15, erreursJs15, api5xx15, telemetrieMinute] = await Promise.all([
    // Le voyant et sa sourdine ne se pilotent plus avec des lignes écrites sans compte (audit 2026-11-06) :
    // `auth_uid` est posé par le serveur. Les erreurs d'un visiteur restent lisibles dans le pilotage et la Sentinelle.
    compter(prod()), compter(prod().eq("type", "error").not("auth_uid", "is", null)), compter(prod().eq("type", "api").gte("http_status", 500).not("auth_uid", "is", null)),
    // Toutes origines confondues : sous `trg_debit_global` (3 000 lignes/min),
    // au-delà, les lots sont REFUSÉS et chaque compteur ci-dessus sous-estime
    // la réalité. Sous `trg_debit_lot`, c'est un repère de charge ; ce qui rend
    // la veille aveugle se lit dans pilotage_audience (`estAveugle`).
    compter(admin.from("telemetry_events").select("id", { count: "exact", head: true }).gte("received_at", ilYa(60e3))),
  ]);
  const depuis24 = ilYa(24 * 3600e3);
  const [{ data, error }, erreurs24h] = await Promise.all([
    admin.from("client_errors").select("message,uid,created_at").gte("created_at", depuis24).order("created_at", { ascending: false }).limit(300),
    // Le NOMBRE se compte en base : la liste ci-dessus est bornée (300, et
    // PostgREST ne rend jamais plus de 1 000 lignes) — sa longueur plafonnait
    // l'affichage à 300 erreurs par jour, quelle que soit la réalité.
    compter(admin.from("client_errors").select("id", { count: "exact", head: true }).gte("created_at", depuis24)),
  ]);
  if (error) throw error;
  // Les COMPTES serveur derrière ces lignes (2026-11-07) : une erreur et une
  // panne 5xx se remontent avec la clé anon, publique — dix lignes forgées
  // faisaient sonner rouge. Seule l'identité posée par le serveur (`auth_uid`)
  // compte ; une lecture en échec laisse le compte absent, et le rouge jouer.
  // Une liste TRONQUÉE ne prouve pas qu'il y a peu de comptes : inconnu, et l'alerte joue.
  type LigneCompte = { auth_uid: string; severity: string | null };
  const lignes = async (type: string, cinqCents: boolean): Promise<LigneCompte[] | null> => {
    let q = admin.from("telemetry_events").select("auth_uid,severity").eq("env", "production").eq("type", type).gte("received_at", depuis).not("auth_uid", "is", null);
    if (cinqCents) q = q.gte("http_status", 500);
    const { data: l, error: ec } = await q.limit(MAX_LIGNES_POSTGREST);
    return ec || (l || []).length >= MAX_LIGNES_POSTGREST ? null : (l || []) as LigneCompte[];
  };
  const distincts = (l: LigneCompte[] | null, garder: (x: LigneCompte) => boolean = () => true) => (l === null ? null : new Set(l.filter(garder).map((x) => x.auth_uid)).size);
  // Les AVERTISSEMENTS (2026-11-07) : ce que l'app a classé `warn` elle-même (une
  // coupure réseau, un repli) ; seuls et d'un seul compte, ils ne colorent plus l'écran (verdict).
  const [lErreurs, l5xx, avertJs15] = await Promise.all([lignes("error", false), lignes("api", true), compter(prod().eq("type", "error").eq("severity", "warn"))]);
  const comptesErreurs15 = distincts(lErreurs), comptes5xx15 = distincts(l5xx), comptesAvert15 = distincts(lErreurs, (x) => x.severity === "warn");
  return { evenements15, erreursJs15, avertJs15, api5xx15, comptesErreurs15, comptesAvert15, comptes5xx15, telemetrieMinute, erreurs24h, principales: erreursFrequentes(data || []) };
}

async function lireErreurs7j(admin: Admin) {
  const erreurs = () => admin.from("client_errors").select("id", { count: "exact", head: true });
  const [{ data, error }, serie, total7, total7Prec] = await Promise.all([
    admin.from("client_errors").select("message,uid,created_at,ua,url").gte("created_at", ilYa(7 * 864e5)).order("created_at", { ascending: false }).limit(1000),
    serieComptee((debut, fin) => erreurs().gte("created_at", debut).lt("created_at", fin)),
    // La tendance (2026-10-23) : 7 jours glissants contre les 7 d'avant, comptés
    // en base (`purge_client_errors` garde 30 jours : les deux fenêtres existent).
    compter(erreurs().gte("created_at", ilYa(7 * 864e5))),
    compter(erreurs().gte("created_at", ilYa(14 * 864e5)).lt("created_at", ilYa(7 * 864e5))),
  ]);
  if (error) throw error;
  // Les DÉTAILS portent sur les 1 000 plus récentes (et le disent) ; la SÉRIE
  // est comptée jour par jour en base, jamais déduite d'une liste tronquée.
  return { serie, total7, total7Prec, details: detailsErreurs(data || []), detailsPartiels: (data || []).length >= MAX_LIGNES_POSTGREST };
}

// Les erreurs depuis la dernière mise en ligne RÉUSSIE, contre la même durée
// juste avant (fenetreMiseEnLigne, bornée à 7 jours). Sans GitHub lisible, la
// date de mise en ligne est inconnue : rien n'est compté, et c'est dit.
type RunResume = { etat?: string | null; conclusion?: string | null; le?: string | null };
async function lireMiseEnLigne(admin: Admin, etatGh: { runs?: { deploy?: RunResume | null } } | null) {
  const run = etatGh && etatGh.runs ? etatGh.runs.deploy || null : null;
  const f = fenetreMiseEnLigne(run);
  if (!f) return { le: null, etat: run ? (run.etat !== "completed" ? "en_cours" : run.conclusion || "inconnu") : "inconnu" };
  const erreurs = () => admin.from("client_errors").select("id", { count: "exact", head: true });
  const [apres, avant] = await Promise.all([
    compter(erreurs().gte("created_at", f.depuis)),
    compter(erreurs().gte("created_at", f.avantDebut).lt("created_at", f.depuis)),
  ]);
  return { le: f.le, etat: "ok", dureeMs: f.dureeMs, apres, avant, tendance: tendance(apres, avant, false) };
}

// Ce qui s'est passé (2026-10-23) : les derniers CHANGEMENTS du voyant notés par
// la veille (7 jours). Des raisons écrites par cette fonction, jamais un texte
// de tiers ; bornées quand même.
async function lireHistorique(admin: Admin) {
  const { data, error } = await admin.from("analytics_events").select("properties,created_at").eq("event", "pilotage_etat")
    .eq("user_id", "systeme:pilotage").gte("created_at", ilYa(7 * 864e5)).order("created_at", { ascending: false }).limit(12);
  if (error) throw error;
  return (data || []).map((r) => {
    const p = (r.properties || {}) as { couleur?: unknown; dispo?: unknown; raisons?: unknown };
    const couleur = ["vert", "orange", "rouge", "gris"].includes(String(p.couleur)) ? String(p.couleur) : "gris";
    return { le: r.created_at, couleur, dispo: p.dispo !== false, raisons: (Array.isArray(p.raisons) ? p.raisons : []).slice(0, 3).map((x) => String(x).slice(0, 160)) };
  });
}

async function lireUtilisateurs(admin: Admin) {
  // ⚠️ À L'ÉCHELLE (2026-10-11) : tout se COMPTE en base. L'ancienne lecture
  // « limite 5 000 » rendait en réalité 1 000 lignes au plus (max-rows de
  // PostgREST) : au-delà de 1 000 inscriptions par semaine, le téléphone
  // affichait 1 000, et la série du jour en perdait — sans un mot.
  const profils = () => admin.from("profiles").select("id", { count: "exact", head: true });
  const [total, jour, semaine, semainePrec, serieInscriptions] = await Promise.all([
    compter(profils()),
    compter(profils().gte("created_at", ilYa(864e5))),
    compter(profils().gte("created_at", ilYa(7 * 864e5))),
    // La semaine d'avant (2026-10-23) : la tendance des inscriptions.
    compter(profils().gte("created_at", ilYa(14 * 864e5)).lt("created_at", ilYa(7 * 864e5))),
    serieComptee((debut, fin) => profils().gte("created_at", debut).lt("created_at", fin)),
  ]);
  // Le PUBLIC seulement (2026-10-05) : robots, émulations et appareils de
  // l'équipe sortent de « en ligne » et « 24 h » (compterAudience, _shared).
  // `trafic` est lu par PostgREST (`meta->>trafic`) : la meta entière n'est
  // pas rapatriée pour 5 000 lignes.
  // Isolées (contre-revue) : à l'échelle, la passe de 24 h peut dépasser le
  // statement_timeout ; elle devient « non mesurée » sans emporter le total,
  // les inscriptions et la fenêtre de 5 min.
  const [m5, j24] = await Promise.allSettled([audience(admin, 300), audience(admin, 86400)]);
  const maintenant = m5.status === "fulfilled" ? m5.value : null, aujourdhui = j24.status === "fulfilled" ? j24.value : null;
  return { total, inscritsJour: jour, inscritsSemaine: semaine, inscritsSemainePrec: semainePrec, serieInscriptions, maintenant, aujourdhui };
}

// Série « par jour » COMPTÉE en base (7 requêtes HEAD), mêmes jours que
// `serieJours` : jamais déduite d'une liste que max-rows a pu tronquer.
async function serieComptee(q: (debut: string, fin: string) => PromiseLike<{ count: number | null; error: unknown }>) {
  const jours = bornesJours(7);
  const n = await Promise.all(jours.map((j) => compter(q(j.debut, j.fin))));
  return jours.map((j, i) => ({ jour: j.jour, n: n[i] }));
}

// Audience d'une fenêtre (2026-10-11). D'abord `pilotage_audience` (comptage
// DISTINCT en base, exact à toute échelle) ; tant que la migration n'est pas
// appliquée, repli sur l'ancienne lecture de lignes — qui ne voit que les
// 1 000 dernières (max-rows) et le DIT (`tronque`), au lieu d'afficher un
// plafond comme une mesure. `connexions` = COMPTES distincts par `auth_uid`
// (seuls les comptes ouvrent le temps réel depuis le 2026-09-20 ; public ou
// non : un robot connecté consomme une connexion comme un autre).
// `comptes5xx15` = comptes distincts touchés par une réponse ≥ 500 en 15 min.
// Ces deux-là pilotent le délestage : ils ne comptent que l'identité posée par
// le SERVEUR, jamais un `user_id` ou un `device_id` écrits par le client.
type Audience = {
  comptes: number; appareils: number; horsPublic: number; connexions: number | null; comptes5xx15: number | null;
  echecs30: number | null; saturation: number | null; saturationAveugle: number | null; saturationPlafond: number | null;
  exact: boolean; tronque: boolean;
};
const nombre = (x: unknown) => (x == null || !Number.isFinite(Number(x)) ? null : Number(x));
async function audience(admin: Admin, secondes: number): Promise<Audience> {
  const { data, error } = await admin.rpc("pilotage_audience", { p_secondes: secondes });
  if (!error && data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    return { comptes: nombre(d.comptes) || 0, appareils: nombre(d.appareils) || 0, horsPublic: nombre(d.hors_public) || 0,
      connexions: nombre(d.comptes_connectes), comptes5xx15: nombre(d.comptes_5xx_15min), echecs30: nombre(d.comptes_echecs_30min),
      saturation: nombre(d.saturation_minute_max), saturationAveugle: nombre(d.saturation_aveugle),
      saturationPlafond: nombre(d.saturation_plafond), exact: true, tronque: false };
  }
  if (error && !estObjetAbsent(error)) throw error;
  const { data: lignes, error: e2 } = await admin.from("telemetry_events").select("user_id,device_id,platform,connection,trafic:meta->>trafic")
    .eq("env", "production").gte("received_at", ilYa(secondes * 1000)).order("received_at", { ascending: false }).limit(MAX_LIGNES_POSTGREST);
  if (e2) throw e2;
  const l = lignes || [];
  const conn = new Set(l.filter((r) => r.user_id && r.device_id).map((r) => r.device_id)).size;
  return { ...compterAudience(l), connexions: conn, comptes5xx15: null, echecs30: null, saturation: null, saturationAveugle: null, saturationPlafond: null, exact: false, tronque: l.length >= MAX_LIGNES_POSTGREST };
}

// ─── Réglages distants (2026-10-11) ─────────────────────────────────────────
// `public.reglages_distants` : lisible par tous (les appareils le relisent
// toutes les 5 min), écrite ICI seulement (service_role). Logique et bornes :
// _shared/reglages.js. Table absente (migration pas encore appliquée) : la
// lecture rend `absente: true`, l'écriture le dit, la veille n'y touche pas.
const MIGRATION_REGLAGES = "migrations/migration_reglages_distants_2026-10-11.sql";
async function lireLignesReglages(admin: Admin) {
  const { data, error } = await admin.from("reglages_distants").select("cle,valeur,pose_par,motif,maj");
  if (error) { if (estObjetAbsent(error)) return null; throw error; }
  return data || [];
}
async function lireReglages(admin: Admin) {
  const lignes = await lireLignesReglages(admin);
  if (!lignes) return { absente: true, migration: MIGRATION_REGLAGES, coupuresPossibles: COUPURES_AUTORISEES };
  return { absente: false, ...resumerReglages(lignes), coupuresPossibles: COUPURES_AUTORISEES };
}

async function delestageAuto(admin: Admin, a: Audience | null) {
  const pol = autoriser(POLITIQUE, "delestage_auto");
  if (!pol.ok) return { raison: "politique:" + pol.raison };
  const lignes = await lireLignesReglages(admin);
  if (!lignes) return { absente: true };
  const ligne = lignes.find((l) => l.cle === "delestage") || null;
  const actuel = ligne ? { niveau: (ligne.valeur as { niveau?: number })?.niveau, pose_par: ligne.pose_par, maj: ligne.maj } : null;
  // ⚠️ SEULE la mesure EXACTE (pilotage_audience) pilote : le repli par lignes
  // compte des `device_id` écrits par le client — un levier qu'un seul compte
  // pourrait tenir pour ralentir toute la production. Pas de mesure = rien ne
  // bouge (decideDelestage le garantit).
  let pctConnexions: number | null = null, comptes5xx15: number | null = null, aveugle = false;
  if (a && a.exact) {
    pctConnexions = a.connexions == null ? null : Math.round((a.connexions / PLAFONDS.connexions.plafond) * 1000) / 10;
    comptes5xx15 = a.comptes5xx15;
    aveugle = estAveugle(a);
  }
  const d = decideDelestage(actuel, { pctConnexions, comptes5xx15, aveugle });
  if (!d.changer) return { niveau: d.niveau };
  const { error } = await admin.from("reglages_distants").upsert({
    cle: "delestage", valeur: { niveau: d.niveau }, pose_par: "veille", motif: normaliserMotif(d.motif), maj: new Date().toISOString(),
  }, { onConflict: "cle" });
  if (error) throw error;
  try { await admin.from("analytics_events").insert({ user_id: "systeme:pilotage", event: "delestage_auto", properties: { niveau: d.niveau, pctConnexions, comptes5xx15, aveugle } }); } catch { /* */ }
  await sonnerPilote(admin, d.niveau > (actuel?.niveau || 0) ? `🛡️ Délestage automatique : niveau ${d.niveau}` : `✅ Délestage ${d.niveau ? "allégé : niveau " + d.niveau : "levé"}`, d.motif || "");
  return { niveau: d.niveau, change: true };
}

// Geste du pilote. `valeur: null` LÈVE le réglage (pour le délestage : rend la
// main à la veille). La valeur est revalidée ici, jamais crue du téléphone.
async function poserReglage(admin: Admin, corps: Record<string, unknown>) {
  const cle = String(corps.cle || "");
  if (!CLES_REGLAGES.includes(cle)) return json({ error: "Réglage inconnu." }, 400);
  const motif = normaliserMotif(corps.motif) || "Posé depuis le pilotage téléphone";
  const lignes = await lireLignesReglages(admin).catch(() => undefined);
  if (lignes === undefined) return json({ error: "Réglages illisibles." }, 502);
  if (lignes === null) return json({ error: `La table des réglages n'existe pas encore : appliquer ${MIGRATION_REGLAGES}.` }, 503);
  if (corps.valeur === null) {
    const { error } = await admin.from("reglages_distants").delete().eq("cle", cle);
    if (error) return json({ error: "Écriture refusée." }, 502);
    await journaliserReglage(admin, cle, null);
    return json({ ok: true, message: cle === "delestage" ? "Délestage rendu à la veille automatique." : "Réglage levé : les appareils le verront sous 5 min." });
  }
  const n = normaliserReglage(cle, corps.valeur);
  if (n.erreur) return json({ error: n.erreur }, 400);
  const { error } = await admin.from("reglages_distants").upsert({ cle, valeur: n.valeur, pose_par: "pilote", motif, maj: new Date().toISOString() }, { onConflict: "cle" });
  if (error) return json({ error: "Écriture refusée." }, 502);
  await journaliserReglage(admin, cle, n.valeur);
  return json({ ok: true, message: "Réglage posé : les appareils le verront sous 5 min." });
}
// Journal des gestes : QUOI a été posé, jamais l'adresse de qui (un seul pilote).
async function journaliserReglage(admin: Admin, cle: string, valeur: unknown) {
  try { await admin.from("analytics_events").insert({ user_id: "systeme:pilotage", event: "reglage_pilote", properties: { cle, valeur } }); } catch { /* */ }
}

// ─── Réveil de la Sentinelle (_shared/autonomie.js) ─────────────────────────
// La veille tient la minute ; le cron GitHub de la Sentinelle est servi 4 à 8
// fois par jour. Des échecs chez ≥ 2 comptes de plus de 24 h en 30 min
// (comptés EN BASE : `comptes_echecs_30min` de pilotage_audience), aucune
// enquête en cours, pas de pause, pas de run récent → workflow_dispatch.
// Plafonné à 2 réveils par heure et 12 par jour EN BASE.
type GhEtat = { issues?: { pr: boolean; labels: string[] }[]; runs?: { sentinelle?: { etat?: string; le?: string } | null }; pause?: boolean };
// ⚠️ Le paramètre ne s'appelle PAS `gh` : il masquerait la fonction `gh()`
// qui parle à GitHub, et le dispatch lèverait « gh is not a function ».
type ParcoursVeille = { parcours?: { id: string; etat: string; panneConfirmee?: boolean; comptesEchecAnciens?: number }[] } | null;
async function reveillerSentinelle(admin: Admin, etatGh: GhEtat | null, a: Audience | null, pc: ParcoursVeille = null) {
  if (!JETON_GH) return { inactif: true };
  if (!etatGh || !Array.isArray(etatGh.issues)) return { illisible: true };
  const pol = autoriser(POLITIQUE, "reveil_sentinelle", { pause: !!etatGh.pause });
  if (!pol.ok) return { raison: "politique:" + pol.raison };
  // Deux sources d'échecs, et la plus forte décide (2026-11-06) :
  //  · erreurs et refus comptés en BASE (pilotage_audience, comptes de > 24 h) ;
  //  · un parcours en PANNE CONFIRMÉE (_shared/parcours.js, confirmerPannes dans
  //    lireParcoursVeille) — un refus en HTTP 200 n'est ni une erreur JS ni un
  //    appel en échec : sans cette source, il ne réveillait personne. Ses
  //    comptes ont été relus dans l'authentification (même règle que
  //    pilotage_audience : confirmés, créés depuis plus de 24 h) — dix comptes
  //    neufs ne lancent rien.
  const enPanne = pc && Array.isArray(pc.parcours) ? pc.parcours.filter((p) => p && p.etat === "panne" && p.panneConfirmee === true) : [];
  const comptesParcours = enPanne.reduce((m, p) => Math.max(m, Number(p.comptesEchecAnciens) || 0), 0);
  const mesure = a && a.exact && a.echecs30 != null ? a.echecs30 : null;
  if (mesure == null && !comptesParcours) return { raison: "mesure_absente" };
  const d = doitReveillerSentinelle({ pause: !!etatGh.pause, enquetes: enquetesEnCours(etatGh.issues), dernierRun: (etatGh.runs && etatGh.runs.sentinelle) || null, comptesErreurs: Math.max(mesure || 0, comptesParcours) });
  if (!d.reveiller) return { raison: d.raison };
  const plafond = await verifierPlafondEnBase(admin, "systeme:sentinelle-reveil", "sentinelle-reveil", { parMinute: 1, parHeure: 2 });
  if (!plafond.ok) return { raison: "plafond" };
  const { count: reveils24h, error: er } = await admin.from("analytics_events").select("id", { count: "exact", head: true })
    .eq("event", EVT.reveil).eq("user_id", "systeme:pilotage").gte("created_at", ilYa(864e5));
  if (er || reveilsEpuises(reveils24h ?? NaN)) return { raison: "quota_du_jour" };
  const r = await gh(`/repos/${DEPOT}/actions/workflows/${RELANCES.sentinelle.fichier}/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main" }) });
  if (r.status !== 204) return { raison: "refus_github_" + r.status };
  cacheGh = null;
  const parcoursEnPanne = comptesParcours >= REVEIL.comptesMin ? enPanne.map((p) => p.id).slice(0, 5) : [];
  try { await admin.from("analytics_events").insert({ user_id: "systeme:pilotage", event: EVT.reveil, properties: { raison: d.raison, parcours: parcoursEnPanne } }); } catch { /* */ }
  return { lance: true };
}

/** Ce compte est-il confirmé et créé depuis au moins `ancienneteMs` ? Illisible = non. */
async function estCompteAncien(admin: Admin, uid: string, ancienneteMs: number): Promise<boolean> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(uid);
    const u = !error && data ? data.user : null;
    return !!(u && u.email_confirmed_at && Date.now() - dateUtc(u.created_at) >= ancienneteMs);
  } catch { return false; }
}

// ─── Parcours critiques (2026-11-06, _shared/parcours.js) ───────────────────
// Les lignes `flow` de la télémétrie, lues PAR PAGES (max-rows = 1 000) et
// bornées : au-delà de PARCOURS_PAGES_MAX pages, le bilan porte sur les plus
// récentes et le DIT (`tronque`). Le voyant juge l'heure écoulée ; l'écran
// montre aussi la journée. Ce qui sort vers le téléphone : des NOMBRES et des
// codes fermés — jamais une identité, jamais un texte écrit par un client.
const PARCOURS_PAGES_MAX = 5;
const PARCOURS_VOYANT_MS = 60 * 60e3;
async function lireLignesFlux(admin: Admin, fenetreMs: number) {
  const depuis = ilYa(fenetreMs);
  const lignes: Record<string, unknown>[] = [];
  for (let page = 0; page < PARCOURS_PAGES_MAX; page++) {
    const { data, error } = await admin.from("telemetry_events")
      // Les SEULES clés utiles de `meta`, à plat : un `meta` hostile peut peser des
      // mégaoctets (revue adversariale). Et jamais une ligne sans identité serveur :
      // elle ne pèse rien, et un flot anonyme repoussait l'heure réelle hors des pages.
      .select("event_id,correlation_id,action,status,auth_uid,received_at,client_ts,app_version,flow_action:meta->>flow_action,step:meta->>step,rc:meta->>rc,synthetic:meta->>synthetic,trafic:meta->>trafic")
      .eq("type", "flow").eq("env", "production").gte("received_at", depuis).not("auth_uid", "is", null)
      .order("received_at", { ascending: false }).order("id", { ascending: false })
      .range(page * MAX_LIGNES_POSTGREST, (page + 1) * MAX_LIGNES_POSTGREST - 1);
    if (error) throw error;
    const lot = (data || []) as Record<string, unknown>[];
    lignes.push(...lot);
    if (lot.length < MAX_LIGNES_POSTGREST) return { lignes, tronque: false };
  }
  return { lignes, tronque: true };
}
// Une panne ne sonne que CONFIRMÉE (revues du 2026-11-06). Pour chaque parcours
// CANDIDAT (assez d'échecs chez assez de comptes, quel que soit son taux), on
// relit dans l'authentification un échantillon TIRÉ AU HASARD (`melanger`) des
// comptes en échec ET des comptes sans échec : la part des comptes ANCIENS
// (confirmés, > 24 h, comme le réveil) se juge des deux côtés, et une nuée de
// comptes neufs qui réussissent ne cache plus une panne (`confirmerPannes`).
// Lectures par lots de 10, chacune bornée à 3 s, budget commun par passage ; un
// compte que le budget n'a pas permis de relire est « non relu », jamais « neuf ».
// `confirmerPannes` retire ensuite les identités : rien de nominatif ne sort.
const RELECTURES_PAR_COTE = 20;
const RELECTURES_PAR_PASSAGE = 120;
const delaiBorne = <T,>(p: Promise<T>, ms: number, sinon: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(sinon), ms))]);
async function confirmer(admin: Admin, ...bilans: Record<string, unknown>[]) {
  const vus = new Map<string, boolean>();
  const nonLus = new Set<string>();
  let budget = RELECTURES_PAR_PASSAGE;
  const aLire: string[] = [];
  for (const b of bilans) {
    for (const c of comptesAVerifier(b)) {
      for (const cote of [c.F, c.N]) {
        const tires = melanger(cote).filter((u: string) => !vus.has(u) && !aLire.includes(u));
        for (const [i, uid] of tires.entries()) {
          if (i < RELECTURES_PAR_COTE && budget > 0) { aLire.push(uid); budget--; } else nonLus.add(uid);
        }
      }
    }
  }
  for (let i = 0; i < aLire.length; i += 10) {
    const lot = aLire.slice(i, i + 10);
    const r = await Promise.all(lot.map((uid) => delaiBorne(estCompteAncien(admin, uid, REVEIL.ancienneteMinMs), 3000, null as boolean | null)));
    lot.forEach((uid, k) => { if (r[k] === null) nonLus.add(uid); else vus.set(uid, r[k] as boolean); });
  }
  const anciens = new Set([...vus].filter(([, ok]) => ok).map(([uid]) => uid));
  const verifies = new Set(vus.keys());
  return bilans.map((b) => confirmerPannes(b, { anciens, verifies, nonLus }));
}
async function lireParcours(admin: Admin) {
  const { lignes, tronque } = await lireLignesFlux(admin, 864e5);
  const maintenant = Date.now();
  const [jour, recent] = await confirmer(admin,
    bilanParcours(lignes, { maintenant, fenetreMs: 864e5, garderComptes: true }),
    bilanParcours(lignes, { maintenant, fenetreMs: PARCOURS_VOYANT_MS, depuisMs: maintenant - PARCOURS_VOYANT_MS, garderComptes: true }));
  return { ...jour, tronque, couverture: couvertureParcours(jour), recent: { fenetreMs: PARCOURS_VOYANT_MS, parcours: recent.parcours } };
}
async function lireParcoursVeille(admin: Admin) {
  const { lignes, tronque } = await lireLignesFlux(admin, PARCOURS_VOYANT_MS);
  const [b] = await confirmer(admin, bilanParcours(lignes, { maintenant: Date.now(), fenetreMs: PARCOURS_VOYANT_MS, garderComptes: true }));
  return { ...b, tronque };
}

// ─── Battement de la veille (2026-11-06, _shared/battement.js) ──────────────
async function battre(admin: Admin, contenu: Record<string, unknown>) {
  const { data, error } = await admin.from("analytics_events").select("created_at").eq("event", BATTEMENT)
    .eq("user_id", AUTEUR_BATTEMENT).order("created_at", { ascending: false }).limit(1);
  if (error) return { ecrit: false, erreur: String(error.message || error).slice(0, 120) };
  const dernier = data && data[0] ? dateUtc(data[0].created_at) : NaN;
  if (Number.isFinite(dernier) && Date.now() - dernier < BATTEMENT_TOUTES_MS) return { ecrit: false, raison: "recent" };
  const { error: ei } = await admin.from("analytics_events").insert({ user_id: AUTEUR_BATTEMENT, event: BATTEMENT, properties: contenu });
  if (ei) return { ecrit: false, erreur: String(ei.message || ei).slice(0, 120) };
  // Ses propres marques seulement : l'événement ET l'auteur système (runbook purge_battements).
  if (autoriser(POLITIQUE, "purge_battements").ok) {
    try { await admin.from("analytics_events").delete().eq("event", BATTEMENT).eq("user_id", AUTEUR_BATTEMENT).lt("created_at", ilYa(7 * 864e5)); } catch { /* */ }
  }
  return { ecrit: true };
}
async function lireBattement(admin: Admin) {
  const [{ data, error }, n24] = await Promise.all([
    admin.from("analytics_events").select("properties,created_at").eq("event", BATTEMENT).eq("user_id", AUTEUR_BATTEMENT)
      .order("created_at", { ascending: false }).limit(1),
    compter(admin.from("analytics_events").select("id", { count: "exact", head: true }).eq("event", BATTEMENT).eq("user_id", AUTEUR_BATTEMENT).gte("created_at", ilYa(864e5))),
  ]);
  if (error) throw error;
  return resumerBattement(data && data[0] ? data[0] : null, n24);
}
// ─── fin réveil

// ─── Retour arrière (_shared/autonomie.js) ──────────────────────────────────
// Jeton Netlify posé : dans les 90 min d'une mise en ligne, un échec NOUVEAU
// chez ≥ 5 comptes de plus de 7 jours (compté en base) ouvre une issue et sonne
// le téléphone. Le pilote demande un APERÇU (version servie → version qui sera
// remise), confirme, et la fonction remet CETTE version-là — revalidée ici.
// JAMAIS de retrait automatique. Le geste est JOURNALISÉ AVANT d'être fait ; le
// verdict est ce que le SITE sert ensuite, pas ce que l'API répond (contrat de
// scripts/rollback-netlify.mjs).
function netlify(chemin: string, init: RequestInit = {}) {
  // Un délai TOUJOURS : une API qui accepte la connexion sans répondre ne doit
  // ni suspendre la veille ni laisser le pilote devant un bouton muet.
  return fetch("https://api.netlify.com/api/v1" + chemin, { signal: AbortSignal.timeout(10000), ...init,
    headers: { Authorization: `Bearer ${JETON_NETLIFY}`, "Content-Type": "application/json", ...(init.headers || {}) } });
}
async function releaseDe(base: string): Promise<{ commit?: string } | null> {
  try {
    const r = await fetch(base + "/release.json", { signal: AbortSignal.timeout(8000), headers: { "Cache-Control": "no-cache" } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
type Deploiement = { id: string; context?: string; state?: string; deploy_ssl_url?: string; published_at?: string; created_at?: string };
// La version qui SERAIT remise, sans rien toucher : partagée par l'aperçu et le
// geste. Pagine comme scripts/rollback-netlify.mjs (les aperçus de PR occupent
// la liste) et saute les versions retirées dans les 24 h (`de_deploy` des
// marques) : un retour puis un redéploiement ne remet pas la version cassée.
async function lirePrecedent(admin: Admin) {
  const rs = await netlify(`/sites/${SITE_NETLIFY}`);
  if (!rs.ok) return { erreur: "netlify_" + rs.status };
  const site = await rs.json();
  const courant = site && site.published_deploy as Deploiement | undefined;
  if (!courant || !courant.id) return { erreur: "courant_inconnu" };
  const { data: marques, error } = await admin.from("analytics_events").select("properties").eq("event", EVT.manuel)
    .eq("user_id", "systeme:pilotage").gte("created_at", ilYa(RETOUR.exclusionMs)).limit(100);
  if (error) return { erreur: "journal_illisible" };
  const exclus = new Set((marques || []).map((m) => m.properties && (m.properties as { de_deploy?: unknown }).de_deploy).filter((x): x is string => typeof x === "string"));
  const prods: Deploiement[] = [];
  for (let page = 1; page <= RETOUR.pagesMax; page++) {
    const rd = await netlify(`/sites/${SITE_NETLIFY}/deploys?per_page=${RETOUR.parPage}&page=${page}`);
    if (!rd.ok) return { erreur: "netlify_deploys_" + rd.status };
    const l = await rd.json();
    prods.push(...deploiementsProduction(l));
    if (!continuerPagination(l, RETOUR.parPage, prods, courant.id, exclus)) break;
  }
  const choix = choisirPrecedent(prods, courant.id, exclus);
  if (!choix.cible) return { erreur: "precedent_" + choix.erreur };
  const cible = prods.find((d) => d.id === choix.cible)!;
  const base = /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(String(cible.deploy_ssl_url || "")) ? cible.deploy_ssl_url! : `https://${cible.id}--passio-app.netlify.app`;
  const [avant, remise] = await Promise.all([releaseDe(SITE), releaseDe(base)]);
  const versionRemise = remise && typeof remise.commit === "string" && /^[0-9a-f]{7,40}$/.test(remise.commit) ? remise.commit : null;
  if (!versionRemise) return { erreur: "precedent_illisible" };   // on ne restaure pas ce qu'on ne sait pas vérifier
  if (avant && avant.commit === versionRemise) return { erreur: "precedent_identique" };
  return {
    courant: { id: courant.id, commit: avant && typeof avant.commit === "string" ? avant.commit : null, publie: courant.published_at || courant.created_at || null },
    cible: { id: cible.id, commit: versionRemise, publie: cible.published_at || cible.created_at || null },
  };
}
// L'aperçu du pilote : ce qui tourne, ce qui serait remis. Rien n'est touché.
async function retourApercu(admin: Admin) {
  if (!JETON_NETLIFY) return json({ error: "Geste indisponible : le secret PILOTAGE_NETLIFY_TOKEN n'est pas posé sur la fonction." }, 501);
  const p = await lirePrecedent(admin);
  if ("erreur" in p) return json({ error: "Aucune version à remettre : " + p.erreur }, 409);
  return json({ ok: true,
    courant: { commit: commitCourt(p.courant.commit), publie: p.courant.publie },
    cible: { id: p.cible.id, commit: commitCourt(p.cible.commit), publie: p.cible.publie } });
}
// Le geste lui-même. ⚠️ CONCURRENCE (revues du 2026-10-12 et 13) : un double
// appui retirerait DEUX versions — le second lirait la version remise comme
// « courante ». Verrous : un geste réussi ferme le bouton 10 min ; la cible
// doit être celle de l'APERÇU que le pilote a confirmé ; deux appels
// SIMULTANÉS écrivent la même clé primaire (idGeste, HMAC sous secret serveur)
// et la base refuse le second ; la version servie est relue juste avant la
// restauration. Un geste qui échoue avant la restauration efface sa marque.
async function remettrePrecedent(admin: Admin, cibleDemandee: string) {
  const { data: recents, error: er } = await admin.from("analytics_events").select("id").eq("event", EVT.manuel)
    .eq("user_id", "systeme:pilotage").gte("created_at", ilYa(RETOUR.entreDeuxGestesMs)).limit(1);
  if (er) return { erreur: "journal_illisible" };
  if (recents && recents.length) return { erreur: "retour_recent" };
  const p = await lirePrecedent(admin);
  if ("erreur" in p) return p;
  if (p.cible.id !== cibleDemandee) return { erreur: "cible_changee" };
  const id = await idGeste(`${EVT.manuel}:${p.courant.id}:${Math.floor(Date.now() / 3600e3)}`, SECRET_GESTES);
  const { error: ej } = await admin.from("analytics_events").insert({ id, user_id: "systeme:pilotage", event: EVT.manuel,
    properties: { vers: commitCourt(p.cible.commit), cible: p.cible.id, de: commitCourt(p.courant.commit), de_deploy: p.courant.id } });
  // Sans marque, pas de geste : rien ne garantirait qu'il ne se rejoue pas.
  if (ej) return { erreur: (ej as { code?: string }).code === "23505" ? "retour_en_cours" : "journal_refuse" };
  const annuler = async (raison: string) => {
    try { await admin.from("analytics_events").delete().eq("id", id); } catch { /* */ }
    try { await admin.from("analytics_events").insert({ user_id: "systeme:pilotage", event: EVT.echec, properties: { raison } }); } catch { /* */ }
    return { erreur: raison };
  };
  try {
    const rs2 = await netlify(`/sites/${SITE_NETLIFY}`);
    const encore = rs2.ok ? await rs2.json() : null;
    if (!encore || !encore.published_deploy || encore.published_deploy.id !== p.courant.id) return await annuler("courant_change");
  } catch { return await annuler("netlify_injoignable"); }
  let rr: Response;
  try { rr = await netlify(`/sites/${SITE_NETLIFY}/deploys/${p.cible.id}/restore`, { method: "POST" }); }
  catch {
    // La demande est peut-être partie : la marque reste (bouton fermé 10 min),
    // et le pilote est prévenu qu'il doit regarder ce que le site sert.
    try { await admin.from("analytics_events").insert({ user_id: "systeme:pilotage", event: EVT.incertain, properties: { cible: p.cible.id } }); } catch { /* */ }
    return { erreur: "restore_incertain" };
  }
  if (!rr.ok) return await annuler("restore_" + rr.status);
  let confirme = false;
  for (let i = 0; i < 10 && !confirme; i++) {
    const s2 = await releaseDe(SITE);
    confirme = !!(s2 && s2.commit === p.cible.commit);
    if (!confirme) await attendre(2000);
  }
  return { cible: p.cible.id, versionRemise: p.cible.commit, confirme };
}
async function proposerRetour(admin: Admin) {
  const pol = autoriser(POLITIQUE, "proposition_retour");
  if (!pol.ok) return { raison: "politique:" + pol.raison };
  if (MODE_RETOUR === "inactif") return { inactif: true };
  const rs = await netlify(`/sites/${SITE_NETLIFY}`);
  if (!rs.ok) return { raison: "netlify_" + rs.status };
  const site = await rs.json();
  const courant = site && site.published_deploy;
  const deployeA = courant && (courant.published_at || courant.created_at);
  // Hors fenêtre : rien à lire, rien à décider (le cas de 99 % des passages).
  if (!courant || !deployeA || Date.now() - Date.parse(deployeA) > RETOUR.apresDeploiementMaxMs) return { raison: "hors_fenetre" };
  const servie = await releaseDe(SITE);
  const commit = servie && typeof servie.commit === "string" && /^[0-9a-f]{7,40}$/.test(servie.commit) ? servie.commit : null;
  if (!commit) return { raison: "version_inconnue" };
  const version = commit.slice(0, 8);
  const { data: mem } = await admin.from("analytics_events").select("properties,created_at").eq("event", EVT.propose)
    .eq("user_id", "systeme:pilotage").order("created_at", { ascending: false }).limit(1);
  const dernier = mem && mem[0] ? { version: (mem[0].properties || {}).version, le: mem[0].created_at } : null;
  // Familles d'échec comptées EN BASE, comptes anciens seulement (migration).
  const { data: familles, error } = await admin.rpc("pilotage_familles_erreurs", { p_version: version, p_depuis: new Date(Date.parse(deployeA)).toISOString() });
  if (error) { if (estObjetAbsent(error)) return { raison: "migration_absente" }; throw error; }
  const d = decideRetour({ actif: true, version, deployeA, familles: familles || [], dernier });
  if (!d.retour) return { raison: d.raison };
  // Clé HMAC : deux veilles concurrentes ne proposent pas deux fois, et aucun
  // client ne peut pré-occuper la clé d'une version.
  const id = await idGeste(`${EVT.propose}:${version}`, SECRET_GESTES);
  // Le texte de la famille est pour le PILOTE (rendu en texte) ; il ne sort
  // jamais vers GitHub ni dans la notification.
  const { error: ej } = await admin.from("analytics_events").insert({ id, user_id: "systeme:pilotage", event: EVT.propose,
    properties: { version, deployeA, empreinte: d.famille.empreinte, comptes: d.famille.comptes, n: d.famille.n, famille: String(d.cle).slice(0, 300) } });
  if (ej) return { raison: (ej as { code?: string }).code === "23505" ? "deja_proposee" : "journal_refuse" };
  let issue = false;
  if (JETON_GH) {
    await gh(`/repos/${DEPOT}/labels`, { method: "POST", body: JSON.stringify({ name: "humain", color: "B60205" }) }).catch(() => null);
    const ri = await gh(`/repos/${DEPOT}/issues`, { method: "POST", body: JSON.stringify({
      title: `${TITRE_PROPOSITION} version ${version}`, labels: ["humain"], body: corpsProposition({ version: commit, famille: d.famille, deployeA }),
    }) }).catch(() => null);
    issue = !!(ri && ri.ok);
    cacheGh = null;
  }
  const envoyes = await sonnerPilote(admin, "⏪ Une version casse", `La version ${version} provoque un échec nouveau chez ${d.famille.comptes} comptes. Pilotage › Capacité : « Remettre la version précédente ».`).catch(() => 0);
  if (!issue && !envoyes) {
    // Personne n'est prévenu : la marque s'efface, la veille suivante réessaie.
    try { await admin.from("analytics_events").delete().eq("id", id); } catch { /* */ }
    return { raison: "personne_prevenu" };
  }
  return { propose: true, issue, envoyes };
}
// La dernière proposition (24 h), pour que le pilote VOIE ce qu'il confirme.
// Derrière la porte d'authentification (etat) ; le texte est rendu en texte.
async function lireProposition(admin: Admin) {
  if (MODE_RETOUR === "inactif") return null;
  try {
    const { data } = await admin.from("analytics_events").select("properties,created_at").eq("event", EVT.propose)
      .eq("user_id", "systeme:pilotage").gte("created_at", ilYa(864e5)).order("created_at", { ascending: false }).limit(1);
    const x = data && data[0];
    if (!x) return null;
    const pr = (x.properties || {}) as Record<string, unknown>;
    return { le: x.created_at, version: commitCourt(String(pr.version || "")), comptes: Number(pr.comptes) || 0,
      empreinte: String(pr.empreinte || "").replace(/[^0-9a-f]/g, "").slice(0, 8), famille: String(pr.famille || "").slice(0, 300) };
  } catch { return null; }
}
// Le bouton du pilote : remettre la version de l'APERÇU, à tout moment, sans PC.
// Réservé à l'éditeur (porte d'authentification + plafond, comme tout geste).
const MESSAGES_RETOUR: Record<string, string> = {
  retour_recent: "Un retour arrière vient d'être fait : attends 10 min avant d'en refaire un (sinon deux versions partiraient).",
  retour_en_cours: "Un retour arrière est déjà en cours : attends 10 min avant d'en refaire un.",
  cible_changee: "La version en ligne a changé depuis l'aperçu : rouvre le geste pour voir la nouvelle cible.",
  restore_incertain: "Netlify n'a pas répondu : regarde dans une minute quelle version le site sert. Le bouton est fermé 10 min.",
};
async function retourManuel(admin: Admin, corps: Record<string, unknown>) {
  if (!JETON_NETLIFY) return json({ error: "Geste indisponible : le secret PILOTAGE_NETLIFY_TOKEN n'est pas posé sur la fonction." }, 501);
  const cible = String(corps.cible || "");
  if (!/^[0-9a-f]{24}$/.test(cible)) return json({ error: "Ouvre d'abord l'aperçu : la version à remettre doit être confirmée." }, 400);
  const g = await remettrePrecedent(admin, cible);
  if ("erreur" in g) return json({ error: MESSAGES_RETOUR[g.erreur] || "Retour arrière refusé : " + g.erreur }, 409);
  return json({ ok: true, message: g.confirme ? `Version précédente en ligne (${commitCourt(g.versionRemise)}).` : "Retour demandé : le site ne la sert pas encore, vérifie dans une minute." });
}
// ─── fin retour

// Activation (2026-10-06) : un nouveau compte a-t-il fait un GESTE SOCIAL dans
// ses 7 premiers jours ? Définition, exclusions et décision : `_shared/pilotage.js`
// (GESTES_ACTIVATION, compteMesurable, activation) — les mêmes que le digest.
async function lireActivation(admin: Admin) {
  const maintenant = Date.now();
  const depuis = maintenant - COHORTE_ACTIVATION_JOURS * 864e5;
  const comptes: { id: string; cree: string }[] = [];
  // L'entonnoir (2026-10-23) : comptes CRÉÉS sur la même fenêtre, confirmés ou
  // non (compteCree) — l'écart avec la cohorte est ce que la confirmation perd.
  // Les mêmes comptes, par leur NOM, sont la liste « Nouveaux comptes ».
  let crees = 0;
  const recents: { id: string; cree: string; confirme: boolean; voie: string }[] = [];
  // Le TOTAL des inscrits (2026-10-24, tuile de l'accueil) : la même boucle,
  // sans borne de date — aucune lecture des comptes en plus. Au-delà de 20 pages
  // (20 000 comptes), le total est une borne basse et il le DIT (`tronque`).
  let inscrits = 0, inscritsTronque = false;
  // La marche des utilisateurs (2026-11-04, croissanceInscrits) : les mêmes comptes, par date d'arrivée.
  const arrivees: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const lot = (data && data.users) || [];
    for (const u of lot) {
      // compteMesurable ⊂ compteCree : un compte hors entonnoir n'est jamais mesuré.
      if (!compteCree(u, EXTRA)) continue;
      inscrits++;
      arrivees.push(u.created_at);
      if (dateUtc(u.created_at) < depuis) continue;
      crees++;
      recents.push({ id: u.id, cree: u.created_at, confirme: !!(u.email_confirmed_at || u.confirmed_at), voie: String((u.app_metadata && u.app_metadata.provider) || "") });
      if (compteMesurable(u, EXTRA)) comptes.push({ id: u.id, cree: u.created_at });
    }
    if (lot.length < 1000) break;
    if (page === 20) inscritsTronque = true;
  }
  // ⚠️ À L'ÉCHELLE (2026-10-11) : `.in(uid, ids)` met chaque identifiant dans
  // l'URL — au-delà de ~200 comptes la requête dépasse la taille admise et
  // échoue ; et chaque lecture rend 1 000 lignes au plus (max-rows). Les
  // comptes partent donc par paquets de 100, et au-delà de 1 500 comptes dans
  // la cohorte le téléphone en mesure un ÉCHANTILLON régulier (un sur k, par
  // date de création) et le dit. Le digest du matin, lui, reste exact (SQL).
  const ECHANTILLON_MAX = 1500, PAQUET = 100;
  const sur = comptes.length;
  let pris = comptes;
  if (sur > ECHANTILLON_MAX) {
    const tries = [...comptes].sort((x, y) => dateUtc(x.cree) - dateUtc(y.cree));
    const pas = sur / ECHANTILLON_MAX;
    pris = Array.from({ length: ECHANTILLON_MAX }, (_, i) => tries[Math.floor(i * pas)]);
  }
  const ids = pris.map((c) => c.id);
  const gestes: { uid: string; le: string; geste: string }[] = [];
  let partiel = false;
  for (let i = 0; i < ids.length; i += PAQUET) {
    const paquet = ids.slice(i, i + PAQUET);
    const lots = await Promise.all(GESTES_ACTIVATION.map(async (g) => {
      const { data, error } = await admin.from(g.table).select(`${g.uid},created_at`).in(g.uid, paquet).order("created_at", { ascending: true }).limit(MAX_LIGNES_POSTGREST);
      if (error) throw error;
      if ((data || []).length >= MAX_LIGNES_POSTGREST) partiel = true;
      return ((data || []) as Record<string, unknown>[]).map((r) => ({ uid: String(r[g.uid]), le: String(r.created_at), geste: g.table }));
    }));
    for (const l of lots) gestes.push(...l);
  }
  // Les noms des derniers comptes créés (30 au plus, donc 30 identifiants dans
  // l'URL) : `username` seulement — jamais l'e-mail. Lecture ratée : la liste
  // part sans les noms et le DIT (`nomLu: false`), elle n'emporte pas le reste.
  const derniers = [...recents].sort((x, y) => dateUtc(y.cree) - dateUtc(x.cree)).slice(0, COMPTES_RECENTS_MAX);
  let profils: { id: string; username: string | null }[] = [], nomsLus = true;
  if (derniers.length) {
    const { data: pr, error: ep } = await admin.from("profiles").select("id,username").in("id", derniers.map((c) => c.id));
    if (ep) nomsLus = false; else profils = (pr || []) as { id: string; username: string | null }[];
  }
  const nouveaux = comptesRecents(derniers, profils, { nomsLus, avecGeste: new Set(gestes.map((g) => g.uid)), mesures: new Set(pris.map((c) => String(c.id))) });
  return { ...activation(pris, gestes, maintenant), echantillon: sur > ECHANTILLON_MAX ? { sur, pris: pris.length } : null, partiel, crees, nouveaux,
    // Tronquée, la liste ne dirait plus la vérité sur le passé : pas de courbe, plutôt qu'une fausse.
    inscrits: { total: inscrits, tronque: inscritsTronque, ...(inscritsTronque ? {} : croissanceInscrits(arrivees, maintenant)) } };
}

// ─── Tous les inscrits, par leur NOM (2026-10-24) ───────────────────────────
// Le toucher sur « inscrits au total » : une page de 100, les plus récents
// d'abord (pageInscrits), le nom choisi dans l'app et rien d'autre
// (comptesRecents : jamais l'e-mail ni l'identifiant). Lue À LA DEMANDE,
// jamais à chaque relecture de l'état. Au-delà de 50 000 comptes, la liste
// est tronquée et le dit.
const INSCRITS_PAGES_COMPTES_MAX = 50;
async function listerInscrits(admin: Admin, corps: Record<string, unknown>) {
  try {
    const tous: { id: string; cree: string; confirme: boolean; voie: string }[] = [];
    let tronque = false;
    for (let p = 1; p <= INSCRITS_PAGES_COMPTES_MAX; p++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: p, perPage: 1000 });
      if (error) throw error;
      const lot = (data && data.users) || [];
      for (const u of lot) {
        if (compteCree(u, EXTRA)) tous.push({ id: u.id, cree: u.created_at, confirme: !!(u.email_confirmed_at || u.confirmed_at), voie: String((u.app_metadata && u.app_metadata.provider) || "") });
      }
      if (lot.length < 1000) break;
      if (p === INSCRITS_PAGES_COMPTES_MAX) tronque = true;
    }
    const tranche = pageInscrits(tous, Number(corps.page) || 1, INSCRITS_PAR_PAGE);
    let profils: { id: string; username: string | null }[] = [], nomsLus = true;
    if (tranche.ids.length) {
      const { data: pr, error: ep } = await admin.from("profiles").select("id,username").in("id", tranche.ids);
      if (ep) nomsLus = false; else profils = (pr || []) as { id: string; username: string | null }[];
    }
    return json({ total: tranche.total, tronque, page: tranche.page, pages: tranche.pages, parPage: tranche.parPage,
      comptes: comptesRecents(tranche.comptes, profils, { nomsLus, max: tranche.parPage }) });
  } catch (err) {
    return json({ error: "Comptes illisibles : " + String((err as { message?: string })?.message || err).slice(0, 120) }, 502);
  }
}

async function lireSignalements(admin: Admin) {
  const { data, error } = await admin.from("reports").select("id,target_type,target_id,reason,created_at").or("status.is.null,status.eq.open").order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  // Les publications masquées par le pré-tri (2026-11-01) se décident en UNE
  // fois : leurs signalements ne sont pas listés un par un.
  const masques = await lireMasques(admin);
  const cibles = new Set(masques.map((m) => m.id));
  const liste = (data || []).filter((r) => !(r.target_type === "post" && cibles.has(String(r.target_id))))
    .map((r) => ({ id: String(r.id), type: String(r.target_type || "autre").slice(0, 40), motif: String(r.reason || "").slice(0, 200), le: r.created_at }));
  return { ouverts: liste.length, liste, masques };
}

// Pré-tri (migration_moderation_pretri_2026-11-01) : table absente = rien de masqué.
// L'extrait est écrit par l'auteur : la page le rend en TEXTE.
async function lireMasques(admin: Admin) {
  const { data, error } = await admin.from("contenus_masques").select("target_id,signaleurs,masque_le")
    .eq("target_type", "post").is("decision", null).order("masque_le", { ascending: false }).limit(20);
  if (error) { if (estObjetAbsent(error)) return []; throw error; }
  const ids = (data || []).map((m) => String(m.target_id));
  const extraits = new Map<string, string>();
  if (ids.length) {
    const { data: posts } = await admin.from("posts").select("id,content").in("id", ids);
    for (const p of posts || []) extraits.set(String(p.id), String(p.content || "").slice(0, 160));
  }
  return (data || []).map((m) => ({ id: String(m.target_id), signaleurs: Number(m.signaleurs) || 0, le: m.masque_le, extrait: extraits.get(String(m.target_id)) || "" }));
}

// La décision du pilote : « retablir » remet la publication dans le fil (la
// machine ne la remasquera plus), « garder » la laisse masquée. Jamais de
// suppression. Les signalements de la publication suivent la décision.
async function deciderMasquage(admin: Admin, id: string, decision: string) {
  if (!id || !["retablir", "garder"].includes(decision)) return json({ error: "Décision inconnue." }, 400);
  const { data, error } = await admin.from("contenus_masques").update({ decision: decision === "retablir" ? "retabli" : "garde", decide_le: new Date().toISOString() })
    .eq("target_type", "post").eq("target_id", id).is("decision", null).select("target_id");
  if (error) return json({ error: "Écriture refusée : " + String(error.message || error).slice(0, 120) }, 502);
  if (!data || !data.length) return json({ error: "Déjà décidé, ou rien de masqué." }, 409);
  const { error: e2 } = await admin.from("reports").update({ status: decision === "retablir" ? "dismissed" : "handled", handled_at: new Date().toISOString() })
    .eq("target_type", "post").eq("target_id", id).or("status.is.null,status.eq.open");
  return json({ ok: true, message: (decision === "retablir" ? "Publication rétablie." : "Publication laissée masquée.")
    + (e2 ? " Signalements non classés : " + String(e2.message || e2).slice(0, 80) : "") });
}

// Croissance (2026-11-01, _shared/croissance.js) : une lecture agrégée.
const MIGRATION_CROISSANCE = "migrations/migration_croissance_2026-11-01.sql";
// Les seuils d'usage du lancement (2026-11-12, seuilsLancement, ADR-013) : par
// ville, ce qui décide d'ouvrir une offre — jamais un nombre d'inscrits. Lecture
// seule. Chaque lecture est bornée et le DIT (`partiel`) : un nombre tronqué est
// un minimum, jamais présenté comme exact.
const SEUILS_FENETRE_JOURS = 60, SEUILS_PAGES_MAX = 20, SEUILS_PAQUET = 100;
async function lireSeuils(admin: Admin) {
  const maintenant = Date.now();
  let partiel = false;
  // Les comptes comptés : les mêmes exclusions que l'activation (tests e2e, éditeur, supprimés).
  const mesurables = new Set<string>();
  for (let page = 1; page <= SEUILS_PAGES_MAX; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const lot = (data && data.users) || [];
    for (const u of lot) if (compteCree(u, EXTRA)) mesurables.add(String(u.id));
    if (lot.length < 1000) break;
    if (page === SEUILS_PAGES_MAX) partiel = true;
  }
  // Une ligne par compte et par jour actif : paginée, max-rows rend 1 000 lignes au plus.
  const jour7 = new Date(maintenant - 6 * 864e5).toISOString().slice(0, 10);
  const actifs: { uid: string }[] = [];
  for (let page = 0; page < SEUILS_PAGES_MAX; page++) {
    const { data, error } = await admin.from("activite_jour").select("uid").gte("jour", jour7)
      .order("jour", { ascending: true }).order("uid", { ascending: true })
      .range(page * MAX_LIGNES_POSTGREST, (page + 1) * MAX_LIGNES_POSTGREST - 1);
    if (error) { if (estObjetAbsent(error)) return { absente: true }; throw error; }
    const lot = (data || []) as { uid: string }[];
    actifs.push(...lot);
    if (lot.length < MAX_LIGNES_POSTGREST) break;
    if (page === SEUILS_PAGES_MAX - 1) partiel = true;
  }
  // Les rencontres de la fenêtre : 60 jours en arrière, 60 en avant (colonnes `timestamp` en UTC).
  const iso = (t: number) => new Date(t).toISOString().slice(0, 19);
  const { data: rs, error: er } = await admin.from("events").select("id,city,date_at,end_at,status,author_id,organizer_id")
    .gte("date_at", iso(maintenant - SEUILS_FENETRE_JOURS * 864e5)).lte("date_at", iso(maintenant + SEUILS_FENETRE_JOURS * 864e5))
    .order("date_at", { ascending: false }).limit(MAX_LIGNES_POSTGREST);
  if (er) throw er;
  const rencontres = (rs || []) as Record<string, unknown>[];
  if (rencontres.length >= MAX_LIGNES_POSTGREST) partiel = true;
  // Les participations des rencontres déjà commencées, par paquets d'identifiants (taille de l'URL).
  const passees = rencontres.filter((r) => dateUtc(r.date_at as string) < maintenant).map((r) => String(r.id));
  const participations: Record<string, unknown>[] = [];
  for (let i = 0; i < passees.length; i += SEUILS_PAQUET) {
    const { data, error } = await admin.from("event_attendees").select("event_id,user_id,rsvp,checked_in_at")
      .in("event_id", passees.slice(i, i + SEUILS_PAQUET)).limit(MAX_LIGNES_POSTGREST);
    if (error) throw error;
    if ((data || []).length >= MAX_LIGNES_POSTGREST) partiel = true;
    participations.push(...((data || []) as Record<string, unknown>[]));
  }
  return seuilsLancement({ actifs, rencontres, participations, mesurables, partiel }, maintenant);
}

async function lireCroissance(admin: Admin) {
  const { data, error } = await admin.rpc("pilotage_croissance", { p_jours: 30 });
  if (error) { if (estObjetAbsent(error)) return { absente: true, migration: MIGRATION_CROISSANCE }; throw error; }
  return croissance(data);
}

async function lireCapacite(admin: Admin) {
  // Connexions : depuis le 2026-09-20 seuls les COMPTES ouvrent le temps réel,
  // donc « appareils de comptes actifs sur 5 min » approche le compteur Supabase.
  const aud = await audience(admin, 300);
  const connexions = aud.connexions;
  // La jauge de télémétrie montre le mur qui AVEUGLE la veille quand
  // pilotage_audience le rend (réservoir des anciens sous trg_debit_lot) ;
  // sinon le total reçu sur 60 s contre 3 000, comme avant.
  const mur = aud.exact ? mesureAveugle(aud) : null;
  const telemetrie = mur ? mur.mesure : await compter(admin.from("telemetry_events").select("id", { count: "exact", head: true }).gte("received_at", ilYa(60e3)));
  // E-mails : une inscription = un e-mail de confirmation (renvois non comptés).
  const emails = await compter(admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", ilYa(864e5)));
  let base: number | null = null, stockage: number | null = null;
  const { data: m, error } = await admin.rpc("pilotage_mesures");
  if (!error && m) {
    base = Number(m.base_octets) || null;
    stockage = Object.values((m.stockage || {}) as Record<string, number>).reduce((a, b) => a + Number(b || 0), 0);
  }
  return { jauges: jauges({ connexions, emails, base, stockage, telemetrie, telemetriePlafond: mur ? mur.plafond : null }), mesuresServeur: !error, connexionsExactes: aud.exact, connexionsTronquees: aud.tronque };
}

async function lireDisponibilite(admin: Admin) {
  const [repond, mem] = await Promise.all([sonder(), lireEtatMemorise(admin)]);
  return { repond, depuis: mem && mem.dispo === repond ? (mem.dispoDepuis || null) : null, veilleLe: mem ? mem.le : null };
}

async function lireAlertes(admin: Admin) {
  const uids = await uidsPilotes(admin);
  if (!uids.length) return { appareils: 0 };
  const n = await compter(admin.from("push_subscriptions").select("endpoint", { count: "exact", head: true }).in("user_id", uids));
  // `accuse` : l'adresse d'accusé est-elle là, et sous quelle FORME (jamais une valeur).
  return { appareils: n, vapid: !!Deno.env.get("VAPID_PUBLIC_KEY"), accuse: { mesurable: !!ACCUSE, ...ADRESSE.diag } };
}

// ─── GitHub ─────────────────────────────────────────────────────────────────
function gh(chemin: string, init: RequestInit = {}) {
  const headers: Record<string, string> = { "Accept": "application/vnd.github+json", "User-Agent": "passio-pilotage", "X-GitHub-Api-Version": "2022-11-28" };
  if (JETON_GH) headers.Authorization = `Bearer ${JETON_GH}`;
  if (init.body) headers["Content-Type"] = "application/json";
  return fetch("https://api.github.com" + chemin, { signal: AbortSignal.timeout(10000), ...init, headers: { ...headers, ...(init.headers || {}) } });
}

let cacheGh: { at: number; val: unknown } | null = null;
async function lireGithub() {
  // Sans jeton, GitHub accorde 60 lectures/heure par adresse : réponse gardée
  // 2 min dans l'isolat (un bonus quand il survit, jamais une garantie).
  if (cacheGh && Date.now() - cacheGh.at < 120e3) return cacheGh.val;
  // N'importe quel compte GitHub peut ouvrir des issues : les 50 plus récentes ne suffisaient pas à
  // voir `humain` ni la pause (D-18). Jusqu'à cinq pages de 100.
  const res = await gh(`/repos/${DEPOT}/issues?state=open&per_page=100`);
  // La raison d'un refus est dite au pilote (erreursLecture) : sans jeton,
  // GitHub accorde 60 lectures par heure à une adresse PARTAGÉE avec d'autres
  // projets — c'est ce qui rendait la veille aveugle par moments.
  if (!res.ok) throw new Error("GitHub HTTP " + res.status + (res.headers.get("x-ratelimit-remaining") === "0" ? " (limite de lecture atteinte" + (JETON_GH ? ")" : ", pas de jeton)") : ""));
  // La fin du jeton, annoncée par GitHub à chaque réponse : dite une semaine avant (aFaire).
  const finJeton = Date.parse(res.headers.get("github-authentication-token-expiration") || "");
  const brut = await res.json();
  for (let page = 2; page <= 5 && brut.length === 100 * (page - 1); page++) {
    const suite = await gh(`/repos/${DEPOT}/issues?state=open&per_page=100&page=${page}`);
    if (!suite.ok) throw new Error("GitHub HTTP " + suite.status);
    brut.push(...await suite.json());
  }
  // Seule une pause ouverte par le PILOTE compte (sentinelle-autonome.yml :
  // `--author PASSIO74`) : le dépôt est public, n'importe qui ouvre une issue.
  // Une réparation du PILOTE reste suivie SANS label : un jeton sans « Issues:
  // write » le fait tomber en silence, et la filtrer sur le label la rendait
  // invisible — 16 « [RÉPARER] #627 » ouvertes du 24 au 25/10, une par toucher.
  const issues = (Array.isArray(brut) ? brut : []).map((i) => ({ ...resumerIssue(i), pause: estPauseDuPilote(i), reparation: estReparationDuPilote(i), confiee: reparationConfiee(i) }))
    .filter(issueSuivie);
  const run = async (f: string) => {
    const r = await gh(`/repos/${DEPOT}/actions/workflows/${f}/runs?per_page=1&branch=main&exclude_pull_requests=true`);
    if (!r.ok) return null;
    const j = await r.json();
    return resumerRun(j && j.workflow_runs && j.workflow_runs[0]);
  };
  const [sentinelle, veille, deploy, pulls] = await Promise.all([run("sentinelle-autonome.yml"), run("veille-production.yml"), run("deploy.yml"), gh(`/repos/${DEPOT}/pulls?state=open&per_page=50`)]);
  // Correctif de la chaîne ou chantier en cours (resumerPr) ? Illisible, la PR reste
  // un chantier — jamais un bouton qui met en ligne à l'aveugle — et c'est dit (`prNonLues`).
  const infosPr = new Map(pulls.ok ? ((await pulls.json()) as { number: number }[]).map((p) => [p.number, resumerPr(p, DEPOT)]) : []);
  const suivies = issues.map((i) => (i.pr ? { ...i, ...(infosPr.get(i.numero) || { externe: true, correctif: false, autoFusion: false, brouillon: false }) } : i));
  // `luLe` : l'heure de CETTE lecture — la réponse peut sortir du cache (2 min).
  const val: Record<string, unknown> = { issues: suivies, runs: { sentinelle, veille, deploy }, pause: issues.some((i) => i.pause), luLe: new Date().toISOString(), prNonLues: pulls.ok ? null : "GitHub HTTP " + pulls.status, jetonExpire: Number.isFinite(finJeton) ? new Date(finJeton).toISOString() : null };
  val.aReparer = aReparer(val);
  cacheGh = { at: Date.now(), val };
  return val;
}

const sansJeton = () => json({ error: "Geste indisponible : le secret PILOTAGE_GITHUB_TOKEN n'est pas posé sur la fonction." }, 501);
// Un refus de droit dit QUEL droit donner : « HTTP 403 » seul ne mène nulle part.
const refusDroit = (statut: number, droit: string) => (statut === 401 ? " Le jeton du pilotage a expiré : renouvelle-le sur GitHub, puis dans les secrets de la fonction." : statut === 403 ? ` Le jeton du pilotage n'a pas ce droit : donne-lui « ${droit} » en lecture et écriture (page du jeton sur GitHub, Edit).` : "");
const numeroValide = (n: number) => Number.isInteger(n) && n > 0 && n < 1e7;

async function relancer(admin: Admin, cible: string) {
  const r = Object.hasOwn(RELANCES, cible) ? RELANCES[cible as keyof typeof RELANCES] : null;
  if (!r) return json({ error: "Relance inconnue." }, 400);
  if (!JETON_GH) return sansJeton();
  // L'heure AVANT l'envoi : le run que GitHub crée ensuite part après elle (suiviRelance).
  const demande = new Date().toISOString();
  const res = await gh(`/repos/${DEPOT}/actions/workflows/${r.fichier}/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main" }) });
  if (res.status !== 204) return json({ error: `GitHub a refusé la relance (HTTP ${res.status}).` + refusDroit(res.status, "Actions") }, 502);
  cacheGh = null; // pour que l'écran voie l'exécution partir, sans attendre le cache de 2 min
  // La relance est NOTÉE (2026-11-07) : chaque ligne qui relance la suit jusqu'au
  // résultat, quel que soit l'isolat qui sert l'écran. Le geste est parti même si
  // la note échoue : on le dit, sans le défaire.
  let suivie = true;
  try {
    const { error } = await admin.from("analytics_events").insert({ user_id: "systeme:pilotage", event: EVT_GESTE, properties: { geste: "relancer", cible, demande } });
    if (error) { suivie = false; console.warn("pilotage : relance non notée " + String((error as { code?: string }).code || "")); }
  } catch { suivie = false; console.warn("pilotage : relance non notée (base injoignable)"); }
  return json({ ok: true, suivie, message: "Lancé : " + r.libelle + (suivie ? ". Le résultat s'affiche sur sa ligne dans la minute." : ". Le suivi n'a pas pu être noté : relis dans une minute.") });
}

// Les relances demandées depuis le téléphone (2026-11-07) : la plus récente par
// cible, sur la fenêtre où l'écran la suit. Seule la fonction écrit sous
// « systeme:pilotage » (analytics_insert_own : user_id = auth.uid()) ; l'heure est
// celle d'AVANT l'envoi, sinon celle de la note.
async function lireRelances(admin: Admin) {
  const { data, error } = await admin.from("analytics_events").select("properties,created_at").eq("event", EVT_GESTE).eq("user_id", "systeme:pilotage")
    .gte("created_at", ilYa(RELANCE_SUIVIE_MS)).order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const l of (data || []) as { properties: { geste?: unknown; cible?: unknown; demande?: unknown } | null; created_at: string }[]) {
    const p = l.properties || {};
    if (p.geste !== "relancer" || typeof p.cible !== "string" || !Object.hasOwn(RELANCES, p.cible) || out[p.cible]) continue;
    out[p.cible] = Number.isFinite(dateUtc(p.demande)) ? String(p.demande) : String(l.created_at);
  }
  return out;
}

async function fusionner(n: number) {
  if (!numeroValide(n)) return json({ error: "Numéro invalide." }, 400);
  if (!JETON_GH) return sansJeton();
  const pr = await gh(`/repos/${DEPOT}/pulls/${n}`);
  if (!pr.ok) return json({ error: "PR introuvable." }, 404);
  const p = await pr.json();
  if (p.state !== "open" || p.draft) return json({ error: "Cette PR n'est pas ouverte, ou elle est en brouillon." }, 409);
  // La règle d'écran (« une PR de fork ne se fusionne pas d'ici ») devient une règle serveur (audit 2026-11-06),
  // et le SHA relu est celui qu'on fusionne : un commit poussé entre-temps fait échouer le geste.
  if (!fusionAutorisee(p, DEPOT)) return json({ error: "Cette PR ne se fusionne pas d'ici (dépôt tiers)." }, 403);
  const r = await gh(`/repos/${DEPOT}/pulls/${n}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "merge", sha: p.head.sha }) });
  cacheGh = null;
  if (r.ok) return json({ ok: true, message: "C'est parti : la mise en ligne suit toute seule." });
  const j = await r.json().catch(() => ({}));
  // Les tests tournent encore : un seul geste quand même. GitHub fusionnera SEUL
  // quand tout sera vert, et rien d'autre : un rouge arrête la PR, la protection
  // de `main` (CI, contre-revue) reste entière. C'est le geste du pilote qui arme,
  // jamais la machine : une réparation n'est jamais fusionnée sans lui.
  if (r.status === 405 && p.mergeable !== false && await armerAutoFusion(String(p.node_id || ""))) {
    cacheGh = null;
    return json({ ok: true, message: "Les tests tournent encore : il partira en ligne tout seul dès qu'ils sont verts." });
  }
  if (p.mergeable === false) return json({ error: "Ce correctif est en conflit avec la version en ligne : refuse-le, puis relance la réparation." }, 409);
  return json({ error: r.status === 405 ? "Pas encore fusionnable : tests en échec ou contre-revue manquante." : `GitHub a refusé (HTTP ${r.status}) ${String(j.message || "").slice(0, 120)}` + refusDroit(r.status, "Pull requests » et « Contents") }, 409);
}

// L'auto-fusion native de GitHub, celle que `gh pr merge --auto --squash` arme pour la Sentinelle.
async function armerAutoFusion(idPr: string): Promise<boolean> {
  if (!idPr) return false;
  const r = await gh("/graphql", { method: "POST", body: JSON.stringify({
    query: "mutation($id: ID!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) { clientMutationId } }",
    variables: { id: idPr },
  }) });
  if (!r.ok) return false;
  const j = await r.json().catch(() => null);
  return !!j && !(Array.isArray(j.errors) && j.errors.length);
}

async function fermer(n: number) {
  if (!numeroValide(n)) return json({ error: "Numéro invalide." }, 400);
  if (!JETON_GH) return sansJeton();
  const r = await gh(`/repos/${DEPOT}/issues/${n}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "not_planned" }) });
  cacheGh = null;
  if (!r.ok) return json({ error: `GitHub a refusé (HTTP ${r.status}).` + refusDroit(r.status, "Issues") }, 502);
  return json({ ok: true, message: "Fermé." });
}

async function pause(activer: boolean) {
  if (!JETON_GH) return sansJeton();
  cacheGh = null;
  const res = await gh(`/repos/${DEPOT}/issues?state=open&per_page=100`);
  if (!res.ok) return json({ error: "GitHub illisible." }, 502);
  const ouvertes = ((await res.json()) as { number: number; title: string; pull_request?: unknown; user?: { login?: string } }[]).filter((i) => !i.pull_request && estPauseDuPilote(i));
  if (activer) {
    if (ouvertes.length) return json({ ok: true, message: "La Sentinelle était déjà en pause." });
    const r = await gh(`/repos/${DEPOT}/issues`, { method: "POST", body: JSON.stringify({ title: TITRE_PAUSE, body: "Pause demandée depuis le pilotage téléphone. Fermer cette issue (ou « Reprendre » dans le pilotage) relance la Sentinelle." }) });
    if (!r.ok) return json({ error: `GitHub a refusé (HTTP ${r.status}).` }, 502);
    return json({ ok: true, message: "Sentinelle en pause." });
  }
  for (const i of ouvertes) await gh(`/repos/${DEPOT}/issues/${i.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
  return json({ ok: true, message: ouvertes.length ? "Sentinelle relancée." : "La Sentinelle n'était pas en pause." });
}

async function traiterSignalement(admin: Admin, id: string, statut: string) {
  if (!id || id.length > 100) return json({ error: "Signalement invalide." }, 400);
  if (!STATUTS_SIGNALEMENT.includes(statut)) return json({ error: "Statut invalide." }, 400);
  const { data, error } = await admin.from("reports").update({ status: statut, handled_at: new Date().toISOString(), handled_note: "pilotage téléphone" })
    .eq("id", id).or("status.is.null,status.eq.open").select("id");
  if (error) return json({ error: "Écriture refusée." }, 502);
  if (!data || !data.length) return json({ error: "Déjà traité, ou introuvable." }, 404);
  return json({ ok: true, message: statut === "handled" ? "Signalement traité." : "Signalement rejeté." });
}

// ─── Réparer : une issue `[RÉPARER] …` confiée à Claude (claude-code.yml) ──────
// La cible est RE-VÉRIFIÉE ici depuis GitHub (jamais crue du téléphone) : une
// issue doit être ouverte et réparable, une exécution doit être en échec.
// L'issue est confiée PAR SON OUVERTURE (2026-10-25) : son corps commence par
// l'ordre fixe `@claude …` (corpsReparation), que claude-code.yml accepte sur
// l'événement `opened` d'une issue de PASSIO74. Ouvrir est le seul geste que
// GitHub accorde au jeton sans « Issues: write » (label et commentaire refusés,
// #653 et #657). Et c'est UN SEUL événement : AUCUN label à la création — le
// corps portant la mention, chaque `labeled` lancerait un agent de plus, et
// plusieurs événements dans la même seconde rejouent la course du 10 au 12/09
// (le run qui travaille évincé de la file de concurrence).
const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms)); // sert au retour arrière (version servie)
async function reparer(corps: Record<string, unknown>) {
  if (!JETON_GH) return sansJeton();
  const cible = String(corps.cible || "");
  const demande = cible === "issue" ? { cible, numero: Number(corps.numero) }
    : cible === "run" ? { cible, cle: String(corps.cle || "") } : null;
  if (!demande || !titreReparation(demande)) return json({ error: "Cible de réparation invalide." }, 400);
  cacheGh = null;
  let etatGh: { aReparer: { cible: string; numero?: number; cle?: string; url: string | null; enCours: number | null }[]; issues: { numero: number; titre: string; pr: boolean; labels?: string[]; confiee?: boolean }[] };
  try { etatGh = await lireGithub() as typeof etatGh; } catch { return json({ error: "GitHub illisible." }, 502); }
  const c = etatGh.aReparer.find((x) => x.cible === demande.cible && (x.cible === "issue" ? x.numero === (demande as { numero: number }).numero : x.cle === (demande as { cle: string }).cle));
  if (!c) return json({ error: "Rien à réparer ici : le problème est déjà réglé, ou il est déjà entre les mains de la Sentinelle." }, 409);
  if (c.enCours) return reconfier(c.enCours, etatGh.issues);
  const ouvertes = etatGh.issues.filter((i) => !i.pr && estReparation(i.titre)).length;
  if (ouvertes >= REPARATIONS_MAX) return json({ error: `Déjà ${ouvertes} réparations en cours : attends qu'une se termine.` }, 429);
  const r = await gh(`/repos/${DEPOT}/issues`, { method: "POST", body: JSON.stringify({ title: titreReparation(c), body: corpsReparation(c, DEPOT) }) });
  cacheGh = null;
  if (!r.ok) return json({ error: `GitHub a refusé l'ouverture (HTTP ${r.status}).` + refusDroit(r.status, "Issues") }, 502);
  const issue = await r.json().catch(() => ({}));
  return json({ ok: true, message: `Réparation lancée (#${Number(issue.number) || "?"}) : Claude prépare le correctif, il apparaîtra ici, prêt à mettre en ligne.` });
}

// Confier APRÈS COUP une réparation qui ne porte pas la mention d'ouverture (une
// issue d'avant le 2026-10-25) : le label `claude`, puis en repli un commentaire
// `@claude` du même compte (PASSIO74), voie que le workflow accepte déjà.
// ⚠️ Les deux exigent « Issues: write » : #653 (24/10) a vu le label refusé (403),
// #657 (25/10) le label ET le commentaire (403, 403) — ouvrir passe, commenter
// non. D'où la mention à l'ouverture (reparer) ; ce chemin ne sert plus que
// « Relancer », et la réparation reste visible (estReparationDuPilote).
async function confier(n: number, refusLabel = 0) {
  if (!refusLabel) {
    const l = await gh(`/repos/${DEPOT}/issues/${n}/labels`, { method: "POST", body: JSON.stringify({ labels: ["claude"] }) });
    cacheGh = null;
    if (l.ok) return json({ ok: true, message: `Réparation lancée (#${n}) : Claude prépare le correctif, il apparaîtra ici, prêt à mettre en ligne.` });
    refusLabel = l.status;
  }
  const c = await gh(`/repos/${DEPOT}/issues/${n}/comments`, { method: "POST", body: JSON.stringify({ body: COMMENTAIRE_CONFIER }) });
  cacheGh = null;
  if (c.ok) return json({ ok: true, message: `Réparation lancée (#${n}, confiée par commentaire, label « claude » refusé : HTTP ${refusLabel}) : le correctif apparaîtra ici, prêt à mettre en ligne.` });
  return json({ error: `#${n} ouverte, mais GitHub refuse de la confier à Claude (label HTTP ${refusLabel}, commentaire HTTP ${c.status}). Donne au jeton PILOTAGE_GITHUB_TOKEN le droit « Issues: Read and write », puis touche « Régler ».` }, 502);
}

// Une réparation déjà ouverte : si elle n'a jamais été confiée (ni mention
// `@claude` à l'ouverture, ni label `claude`, ni commentaire `@claude` du
// pilote), on la confie maintenant — jamais deux fois, un second ordre
// lancerait un second agent.
async function reconfier(n: number, issues: { numero: number; labels?: string[]; confiee?: boolean }[]) {
  const i = issues.find((x) => x.numero === n);
  if (i && (i.confiee || (i.labels || []).includes("claude"))) return json({ ok: true, message: "Réparation déjà en cours (#" + n + ")." });
  const r = await gh(`/repos/${DEPOT}/issues/${n}/comments?per_page=100`);
  if (!r.ok) return json({ error: "GitHub illisible." }, 502);
  if (dejaConfiee(await r.json())) return json({ ok: true, message: "Réparation déjà confiée à Claude (#" + n + ")." });
  return confier(n);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
