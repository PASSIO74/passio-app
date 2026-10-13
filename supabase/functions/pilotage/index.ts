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
//      etat · relancer · fusionner · fermer · pause · reprendre · signalement · reparer · reglages
//    Les gestes GitHub exigent le secret PILOTAGE_GITHUB_TOKEN (sinon 501, dit).
//    Plafond 30/min, 600/h.
//
// La clé service_role ne quitte jamais cette fonction. Aucun corps d'issue ni
// auteur n'en sort (resumerIssue) ; aucun texte d'erreur client n'est jamais
// transmis à un agent (une erreur se confie en relançant la Sentinelle, qui
// applique ses propres désamorçages).
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { verifierPlafondEnBase, reponsePlafond } from "../_shared/plafond.js";
import { REVISION } from "../_shared/revision.js";
import {
  autorise, RELANCES, LABELS_SUIVIS, TITRE_PAUSE, STATUTS_SIGNALEMENT, estPauseDuPilote,
  erreursFrequentes, detailsErreurs, jauges, resumerIssue, resumerRun, verdict, decideAlerte,
  aReparer, titreReparation, corpsReparation, estReparation, REPARATIONS_MAX, compterAudience,
  activation, compteMesurable, dateUtc, GESTES_ACTIVATION, COHORTE_ACTIVATION_JOURS,
  PLAFONDS, bornesJours, estObjetAbsent, MAX_LIGNES_POSTGREST, COMPTE_PILOTE,
} from "../_shared/pilotage.js";
import { envoyerRappels, MARQUE_UID } from "../_shared/rappels.js";
import {
  CLES_REGLAGES, COUPURES_AUTORISEES, normaliserReglage, normaliserMotif, decideDelestage, resumerReglages,
} from "../_shared/reglages.js";
import {
  RETOUR, EVT, enquetesEnCours, doitReveillerSentinelle, decideRetour, deploiementsProduction, choisirPrecedent,
  continuerPagination, TITRE_PROPOSITION, corpsProposition, modeRetour, reveilsEpuises, idGeste, commitCourt,
} from "../_shared/autonomie.js";

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
type Admin = ReturnType<typeof createClient>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let corps: Record<string, unknown> = {};
  try { corps = await req.json(); } catch { /* corps vide = état */ }
  const action = String(corps.action || "etat");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (action === "veille") return veille(admin);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Non authentifié" }, 401);
  const user = userData.user;
  if (!autorise(user, EXTRA)) return json({ error: "Réservé au compte de l'éditeur." }, 403);

  const plafond = await verifierPlafondEnBase(admin, user.id, "pilotage", { parMinute: 30, parHeure: 600 });
  if (!plafond.ok) return reponsePlafond(plafond, corsHeaders);

  switch (action) {
    case "etat": return json(await etat(admin));
    case "relancer": return relancer(String(corps.cible || ""));
    case "fusionner": return fusionner(Number(corps.numero));
    case "fermer": return fermer(Number(corps.numero));
    case "pause": return pause(true);
    case "reprendre": return pause(false);
    case "signalement": return traiterSignalement(admin, String(corps.id || ""), String(corps.statut || ""));
    case "reparer": return reparer(corps);
    case "reglages": return poserReglage(admin, corps);
    case "retour_apercu": return retourApercu(admin);
    case "retour_arriere": return retourManuel(admin, corps);
    default: return json({ error: "Action inconnue." }, 400);
  }
});

// ─── ① Veille ───────────────────────────────────────────────────────────────
// Appelable par n'importe qui (clé anon) : elle ne fait jamais rien de plus que
// ce que ferait pg_cron, et au plus une fois par minute. Le plafond horaire
// vaut 60 (une par minute) : à 20, vingt appels anonymes en début d'heure
// affamaient la veille pendant les 40 minutes suivantes (contre-revue).
async function veille(admin: Admin) {
  const plafond = await verifierPlafondEnBase(admin, "systeme:pilotage-veille", "pilotage-veille", { parMinute: 1, parHeure: 60 });
  if (!plafond.ok) return json({ ok: true, ignore: "trop tôt" });
  const [sante, signalements, github, dispo, rap] = await Promise.allSettled([lireSante(admin), lireSignalements(admin), lireGithub(), sonder(), rappels(admin)]);
  const val = <T>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
  // Un rappel en panne ne doit ni casser la veille ni passer inaperçu : il
  // laisse une trace mesurable (analytics_events, user_id système).
  if (rap.status === "rejected") {
    const m = String((rap.reason && (rap.reason as { message?: string }).message) || rap.reason).slice(0, 200);
    try { await admin.from("analytics_events").insert({ user_id: MARQUE_UID, event: "rappels_echec", properties: { message: m } }); } catch { /* */ }
  }
  const e = { sante: val(sante), signalements: val(signalements), github: val(github) };
  // L'ALERTE D'ABORD : rien de ce qui suit (Netlify, GitHub, base) ne doit
  // pouvoir la retarder ni la faire taire.
  const v = verdict(e);
  const actuel = { couleur: v.couleur, raisons: v.raisons, dispo: val(dispo) !== false };
  const prec = await lireEtatMemorise(admin);
  const d = decideAlerte(prec, actuel);
  let envoyes = 0;
  if (d.sonner) envoyes = await sonnerPilote(admin, d.titre!, d.texte || "");
  const change = !prec || prec.couleur !== actuel.couleur || prec.dispo !== actuel.dispo || d.sonner;
  if (change) {
    await admin.from("analytics_events").insert({ user_id: "systeme:pilotage", event: "pilotage_etat", properties: {
      couleur: actuel.couleur, dispo: actuel.dispo, raisons: (actuel.raisons || []).slice(0, 4),
      alerteLe: d.sonner ? new Date().toISOString() : (prec && prec.alerteLe) || null,
      dispoDepuis: !prec || prec.dispo !== actuel.dispo ? new Date().toISOString() : prec.dispoDepuis || null,
    } });
  }
  // Puis ce qui agit seul (délestage 2026-10-11 ; réveil et proposition
  // 2026-10-12, _shared/autonomie.js). Chaque étape est isolée : une panne de
  // l'une ne casse ni les autres ni la veille. Les signaux sont lus UNE fois
  // (pilotage_audience, fenêtre de 5 min) ; absents (migration pas encore
  // appliquée), rien ne bouge.
  let signaux: Audience | null = null;
  try { signaux = await audience(admin, 300); } catch { /* signaux absents : chaque étape le sait */ }
  const etape = async (f: () => Promise<Record<string, unknown>>) => {
    try { return await f(); } catch (err) { return { erreur: String((err as { message?: string })?.message || err).slice(0, 120) }; }
  };
  const delestage = await etape(() => delestageAuto(admin, signaux));
  const reveil = await etape(() => reveillerSentinelle(admin, e.github as GhEtat | null, signaux));
  const retour = await etape(() => proposerRetour(admin));
  // Les compteurs des rappels ne sortent PAS dans cette réponse : la veille est
  // appelable avec la seule clé anon (publique), et combien d'activités ont lieu
  // dans les 24 h ou combien de comptes sont abonnés ne regardent personne. Ils
  // se lisent dans `analytics_events` (marques `rappel_activite`, `rappels_echec`).
  return json({ ok: true, couleur: actuel.couleur, dispo: actuel.dispo, sonne: d.sonner, envoyes,
    delestage: delestage && "niveau" in delestage ? delestage.niveau : null,
    sentinelleReveillee: !!(reveil && reveil.lance), retourPropose: !!(retour && retour.propose) });
}

/** Rappels d'activité (J-1, H-2) sur les appareils des participants, appli fermée comprise. */
async function rappels(admin: Admin) {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return { inactif: "VAPID absent" };
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:passioadmin@gmail.com", pub, priv);
  // deno-lint-ignore no-explicit-any
  return envoyerRappels(admin, (sub: any, charge: string, opts: any) => webpush.sendNotification(sub, charge, opts));
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
async function sonnerPilote(admin: Admin, titre: string, texte: string): Promise<number> {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return 0;
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:passioadmin@gmail.com", pub, priv);
  const uids = await uidsPilotes(admin);
  if (!uids.length) return 0;
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, subscription").in("user_id", uids);
  const payload = JSON.stringify({ type: "pilotage", titre, texte });
  let n = 0; const morts: string[] = [];
  await Promise.all((subs || []).map(async (s) => {
    try { await webpush.sendNotification(s.subscription, payload, { TTL: 3600, urgency: "high" }); n++; }
    catch (e) { const c = (e as { statusCode?: number })?.statusCode; if (c === 404 || c === 410) morts.push(s.endpoint); }
  }));
  if (morts.length) { try { await admin.from("push_subscriptions").delete().in("endpoint", morts); } catch { /* */ } }
  return n;
}

// ─── ② État complet pour le téléphone ───────────────────────────────────────
async function etat(admin: Admin) {
  const parts = {
    sante: lireSante(admin), utilisateurs: lireUtilisateurs(admin), activation: lireActivation(admin), signalements: lireSignalements(admin),
    github: lireGithub(), erreurs: lireErreurs7j(admin), capacite: lireCapacite(admin),
    disponibilite: lireDisponibilite(admin), alertes: lireAlertes(admin), reglages: lireReglages(admin),
  };
  const noms = Object.keys(parts) as (keyof typeof parts)[];
  const res = await Promise.allSettled(noms.map((k) => parts[k]));
  const out: Record<string, unknown> = { genereLe: new Date().toISOString() };
  const nonLus: string[] = [];
  res.forEach((r, i) => { if (r.status === "fulfilled") out[noms[i]] = r.value; else { out[noms[i]] = null; nonLus.push(noms[i]); } });
  out.nonLus = nonLus;
  out.relancesPossibles = JETON_GH ? Object.entries(RELANCES).map(([cle, v]) => ({ cle, libelle: v.libelle })) : [];
  // Ce qui agit seul, et pourquoi c'est éteint quand ça l'est (_shared/autonomie.js).
  out.autonomie = { reveilSentinelle: !!JETON_GH, retour: { mode: MODE_RETOUR, jeton: !!JETON_NETLIFY, proposition: await lireProposition(admin) } };
  out.gestesGithub = !!JETON_GH;
  const v = verdict(out as Parameters<typeof verdict>[0]);
  const dispo = out.disponibilite as { repond?: boolean } | null;
  if (dispo && dispo.repond === false) { v.couleur = "rouge"; v.titre = "Problème en cours"; v.raisons = ["le site ne répond pas", ...v.raisons.filter((x: string) => !/^Aucune/.test(x))]; }
  out.verdict = v;
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
    compter(prod()), compter(prod().eq("type", "error")), compter(prod().eq("type", "api").gte("http_status", 500)),
    // Toutes origines confondues, comme le plafond global qu'elle mesure
    // (`trg_debit_global`, 3 000 insertions/min) : au-delà, les lots sont REFUSÉS
    // et chaque compteur ci-dessus sous-estime la réalité.
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
  return { evenements15, erreursJs15, api5xx15, telemetrieMinute, erreurs24h, principales: erreursFrequentes(data || []) };
}

async function lireErreurs7j(admin: Admin) {
  const [{ data, error }, serie] = await Promise.all([
    admin.from("client_errors").select("message,uid,created_at,ua,url").gte("created_at", ilYa(7 * 864e5)).order("created_at", { ascending: false }).limit(1000),
    serieComptee((debut, fin) => admin.from("client_errors").select("id", { count: "exact", head: true }).gte("created_at", debut).lt("created_at", fin)),
  ]);
  if (error) throw error;
  // Les DÉTAILS portent sur les 1 000 plus récentes (et le disent) ; la SÉRIE
  // est comptée jour par jour en base, jamais déduite d'une liste tronquée.
  return { serie, details: detailsErreurs(data || []), detailsPartiels: (data || []).length >= MAX_LIGNES_POSTGREST };
}

async function lireUtilisateurs(admin: Admin) {
  // ⚠️ À L'ÉCHELLE (2026-10-11) : tout se COMPTE en base. L'ancienne lecture
  // « limite 5 000 » rendait en réalité 1 000 lignes au plus (max-rows de
  // PostgREST) : au-delà de 1 000 inscriptions par semaine, le téléphone
  // affichait 1 000, et la série du jour en perdait — sans un mot.
  const profils = () => admin.from("profiles").select("id", { count: "exact", head: true });
  const [total, jour, semaine, serieInscriptions] = await Promise.all([
    compter(profils()),
    compter(profils().gte("created_at", ilYa(864e5))),
    compter(profils().gte("created_at", ilYa(7 * 864e5))),
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
  return { total, inscritsJour: jour, inscritsSemaine: semaine, serieInscriptions, maintenant, aujourdhui };
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
  echecs30: number | null; saturation: number | null; exact: boolean; tronque: boolean;
};
const nombre = (x: unknown) => (x == null || !Number.isFinite(Number(x)) ? null : Number(x));
async function audience(admin: Admin, secondes: number): Promise<Audience> {
  const { data, error } = await admin.rpc("pilotage_audience", { p_secondes: secondes });
  if (!error && data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    return { comptes: nombre(d.comptes) || 0, appareils: nombre(d.appareils) || 0, horsPublic: nombre(d.hors_public) || 0,
      connexions: nombre(d.comptes_connectes), comptes5xx15: nombre(d.comptes_5xx_15min), echecs30: nombre(d.comptes_echecs_30min),
      saturation: nombre(d.saturation_minute_max), exact: true, tronque: false };
  }
  if (error && !estObjetAbsent(error)) throw error;
  const { data: lignes, error: e2 } = await admin.from("telemetry_events").select("user_id,device_id,platform,connection,trafic:meta->>trafic")
    .eq("env", "production").gte("received_at", ilYa(secondes * 1000)).order("received_at", { ascending: false }).limit(MAX_LIGNES_POSTGREST);
  if (e2) throw e2;
  const l = lignes || [];
  const conn = new Set(l.filter((r) => r.user_id && r.device_id).map((r) => r.device_id)).size;
  return { ...compterAudience(l), connexions: conn, comptes5xx15: null, echecs30: null, saturation: null, exact: false, tronque: l.length >= MAX_LIGNES_POSTGREST };
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

// Au plafond global de télémétrie (3 000 lignes/min), les lots légitimes sont
// refusés : les mesures deviennent BASSES sans que la charge le soit. Au-delà
// de 90 % du plafond, la veille ne lève plus une protection (contre-revue).
const SATURATION_AVEUGLE = 0.9;
async function delestageAuto(admin: Admin, a: Audience | null) {
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
    aveugle = a.saturation != null && a.saturation >= SATURATION_AVEUGLE * PLAFONDS.telemetrie.plafond;
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
async function reveillerSentinelle(admin: Admin, etatGh: GhEtat | null, a: Audience | null) {
  if (!JETON_GH) return { inactif: true };
  if (!etatGh || !Array.isArray(etatGh.issues)) return { illisible: true };
  if (!a || !a.exact || a.echecs30 == null) return { raison: "mesure_absente" };
  const d = doitReveillerSentinelle({ pause: !!etatGh.pause, enquetes: enquetesEnCours(etatGh.issues), dernierRun: (etatGh.runs && etatGh.runs.sentinelle) || null, comptesErreurs: a.echecs30 });
  if (!d.reveiller) return { raison: d.raison };
  const plafond = await verifierPlafondEnBase(admin, "systeme:sentinelle-reveil", "sentinelle-reveil", { parMinute: 1, parHeure: 2 });
  if (!plafond.ok) return { raison: "plafond" };
  const { count: reveils24h, error: er } = await admin.from("analytics_events").select("id", { count: "exact", head: true })
    .eq("event", EVT.reveil).eq("user_id", "systeme:pilotage").gte("created_at", ilYa(864e5));
  if (er || reveilsEpuises(reveils24h ?? NaN)) return { raison: "quota_du_jour" };
  const r = await gh(`/repos/${DEPOT}/actions/workflows/${RELANCES.sentinelle.fichier}/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main" }) });
  if (r.status !== 204) return { raison: "refus_github_" + r.status };
  cacheGh = null;
  try { await admin.from("analytics_events").insert({ user_id: "systeme:pilotage", event: EVT.reveil, properties: { raison: d.raison } }); } catch { /* */ }
  return { lance: true };
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
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const lot = (data && data.users) || [];
    for (const u of lot) if (compteMesurable(u, EXTRA) && dateUtc(u.created_at) >= depuis) comptes.push({ id: u.id, cree: u.created_at });
    if (lot.length < 1000) break;
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
  return { ...activation(pris, gestes, maintenant), echantillon: sur > ECHANTILLON_MAX ? { sur, pris: pris.length } : null, partiel };
}

async function lireSignalements(admin: Admin) {
  const { data, error } = await admin.from("reports").select("id,target_type,reason,created_at").or("status.is.null,status.eq.open").order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  const liste = (data || []).map((r) => ({ id: String(r.id), type: String(r.target_type || "autre").slice(0, 40), motif: String(r.reason || "").slice(0, 200), le: r.created_at }));
  return { ouverts: liste.length, liste };
}

async function lireCapacite(admin: Admin) {
  // Connexions : depuis le 2026-09-20 seuls les COMPTES ouvrent le temps réel,
  // donc « appareils de comptes actifs sur 5 min » approche le compteur Supabase.
  const aud = await audience(admin, 300);
  const connexions = aud.connexions;
  const telemetrie = await compter(admin.from("telemetry_events").select("id", { count: "exact", head: true }).gte("received_at", ilYa(60e3)));
  // E-mails : une inscription = un e-mail de confirmation (renvois non comptés).
  const emails = await compter(admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", ilYa(864e5)));
  let base: number | null = null, stockage: number | null = null;
  const { data: m, error } = await admin.rpc("pilotage_mesures");
  if (!error && m) {
    base = Number(m.base_octets) || null;
    stockage = Object.values((m.stockage || {}) as Record<string, number>).reduce((a, b) => a + Number(b || 0), 0);
  }
  return { jauges: jauges({ connexions, emails, base, stockage, telemetrie }), mesuresServeur: !error, connexionsExactes: aud.exact, connexionsTronquees: aud.tronque };
}

async function lireDisponibilite(admin: Admin) {
  const [repond, mem] = await Promise.all([sonder(), lireEtatMemorise(admin)]);
  return { repond, depuis: mem && mem.dispo === repond ? (mem.dispoDepuis || null) : null, veilleLe: mem ? mem.le : null };
}

async function lireAlertes(admin: Admin) {
  const uids = await uidsPilotes(admin);
  if (!uids.length) return { appareils: 0 };
  const n = await compter(admin.from("push_subscriptions").select("endpoint", { count: "exact", head: true }).in("user_id", uids));
  return { appareils: n, vapid: !!Deno.env.get("VAPID_PUBLIC_KEY") };
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
  const res = await gh(`/repos/${DEPOT}/issues?state=open&per_page=50`);
  if (!res.ok) throw new Error("GitHub HTTP " + res.status);
  const brut = await res.json();
  // Seule une pause ouverte par le PILOTE compte (sentinelle-autonome.yml :
  // `--author PASSIO74`) : le dépôt est public, n'importe qui ouvre une issue.
  const issues = (Array.isArray(brut) ? brut : []).map((i) => ({ ...resumerIssue(i), pause: estPauseDuPilote(i) }))
    .filter((i) => i.pr || i.pause || i.labels.some((l: string) => LABELS_SUIVIS.includes(l)));
  const run = async (f: string) => {
    const r = await gh(`/repos/${DEPOT}/actions/workflows/${f}/runs?per_page=1&branch=main&exclude_pull_requests=true`);
    if (!r.ok) return null;
    const j = await r.json();
    return resumerRun(j && j.workflow_runs && j.workflow_runs[0]);
  };
  const [sentinelle, veille, deploy] = await Promise.all([run("sentinelle-autonome.yml"), run("veille-production.yml"), run("deploy.yml")]);
  const val: Record<string, unknown> = { issues, runs: { sentinelle, veille, deploy }, pause: issues.some((i) => i.pause) };
  val.aReparer = aReparer(val);
  cacheGh = { at: Date.now(), val };
  return val;
}

const sansJeton = () => json({ error: "Geste indisponible : le secret PILOTAGE_GITHUB_TOKEN n'est pas posé sur la fonction." }, 501);
const numeroValide = (n: number) => Number.isInteger(n) && n > 0 && n < 1e7;

async function relancer(cible: string) {
  const r = Object.hasOwn(RELANCES, cible) ? RELANCES[cible as keyof typeof RELANCES] : null;
  if (!r) return json({ error: "Relance inconnue." }, 400);
  if (!JETON_GH) return sansJeton();
  const res = await gh(`/repos/${DEPOT}/actions/workflows/${r.fichier}/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main" }) });
  if (res.status !== 204) return json({ error: `GitHub a refusé la relance (HTTP ${res.status}).` }, 502);
  return json({ ok: true, message: "Lancé : " + r.libelle });
}

async function fusionner(n: number) {
  if (!numeroValide(n)) return json({ error: "Numéro invalide." }, 400);
  if (!JETON_GH) return sansJeton();
  const pr = await gh(`/repos/${DEPOT}/pulls/${n}`);
  if (!pr.ok) return json({ error: "PR introuvable." }, 404);
  const p = await pr.json();
  if (p.state !== "open" || p.draft) return json({ error: "Cette PR n'est pas ouverte, ou elle est en brouillon." }, 409);
  const r = await gh(`/repos/${DEPOT}/pulls/${n}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "merge" }) });
  cacheGh = null;
  if (r.ok) return json({ ok: true, message: "Fusionnée. Le déploiement suit tout seul." });
  const j = await r.json().catch(() => ({}));
  return json({ error: r.status === 405 ? "Pas encore fusionnable : tests en cours ou contre-revue manquante." : `GitHub a refusé (HTTP ${r.status}) ${String(j.message || "").slice(0, 120)}` }, 409);
}

async function fermer(n: number) {
  if (!numeroValide(n)) return json({ error: "Numéro invalide." }, 400);
  if (!JETON_GH) return sansJeton();
  const r = await gh(`/repos/${DEPOT}/issues/${n}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "not_planned" }) });
  cacheGh = null;
  if (!r.ok) return json({ error: `GitHub a refusé (HTTP ${r.status}).` }, 502);
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
const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function reparer(corps: Record<string, unknown>) {
  if (!JETON_GH) return sansJeton();
  const cible = String(corps.cible || "");
  const demande = cible === "issue" ? { cible, numero: Number(corps.numero) }
    : cible === "run" ? { cible, cle: String(corps.cle || "") } : null;
  if (!demande || !titreReparation(demande)) return json({ error: "Cible de réparation invalide." }, 400);
  cacheGh = null;
  let etatGh: { aReparer: { cible: string; numero?: number; cle?: string; url: string | null; enCours: number | null }[]; issues: { titre: string; pr: boolean }[] };
  try { etatGh = await lireGithub() as typeof etatGh; } catch { return json({ error: "GitHub illisible." }, 502); }
  const c = etatGh.aReparer.find((x) => x.cible === demande.cible && (x.cible === "issue" ? x.numero === (demande as { numero: number }).numero : x.cle === (demande as { cle: string }).cle));
  if (!c) return json({ error: "Rien à réparer ici : le problème est déjà réglé, ou il est déjà entre les mains de la Sentinelle." }, 409);
  if (c.enCours) return json({ ok: true, message: "Réparation déjà en cours (#" + c.enCours + ")." });
  const ouvertes = etatGh.issues.filter((i) => !i.pr && estReparation(i.titre)).length;
  if (ouvertes >= REPARATIONS_MAX) return json({ error: `Déjà ${ouvertes} réparations en cours : attends qu'une se termine.` }, 429);
  // Le label doit exister AVANT d'être posé (un ajout sur un label absent échoue).
  await gh(`/repos/${DEPOT}/labels`, { method: "POST", body: JSON.stringify({ name: "reparation", color: "7C3AED", description: "Réparation demandée depuis le pilotage téléphone" }) }).catch(() => null);
  const r = await gh(`/repos/${DEPOT}/issues`, { method: "POST", body: JSON.stringify({ title: titreReparation(c), body: corpsReparation(c, DEPOT), labels: ["reparation"] }) });
  if (!r.ok) return json({ error: `GitHub a refusé l'ouverture (HTTP ${r.status}).` }, 502);
  const issue = await r.json();
  // `claude` APRÈS la création, seul dans son événement (course mesurée du 10 au 12/09).
  await attendre(8000);
  const l = await gh(`/repos/${DEPOT}/issues/${issue.number}/labels`, { method: "POST", body: JSON.stringify({ labels: ["claude"] }) });
  cacheGh = null;
  if (!l.ok) return json({ ok: true, message: `Issue #${issue.number} ouverte, mais le label « claude » a été refusé (HTTP ${l.status}) : pose-le à la main.` });
  return json({ ok: true, message: `Réparation lancée : #${issue.number}. Le correctif arrivera dans « Correctifs en attente ».` });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
