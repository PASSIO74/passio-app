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
//      etat · relancer · fusionner · fermer · pause · reprendre · signalement · reparer
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
  autorise, RELANCES, LABELS_SUIVIS, TITRE_PAUSE, STATUTS_SIGNALEMENT, estPause,
  erreursFrequentes, detailsErreurs, serieJours, jauges, resumerIssue, resumerRun, verdict, decideAlerte,
  aReparer, titreReparation, corpsReparation, estReparation, REPARATIONS_MAX, compterAudience,
  activation, compteMesurable, dateUtc, GESTES_ACTIVATION, COHORTE_ACTIVATION_JOURS,
} from "../_shared/pilotage.js";
import { envoyerRappels, MARQUE_UID } from "../_shared/rappels.js";

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
    default: return json({ error: "Action inconnue." }, 400);
  }
});

// ─── ① Veille ───────────────────────────────────────────────────────────────
async function veille(admin: Admin) {
  const plafond = await verifierPlafondEnBase(admin, "systeme:pilotage-veille", "pilotage-veille", { parMinute: 1, parHeure: 20 });
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
  // Les compteurs des rappels ne sortent PAS dans cette réponse : la veille est
  // appelable avec la seule clé anon (publique), et combien d'activités ont lieu
  // dans les 24 h ou combien de comptes sont abonnés ne regardent personne. Ils
  // se lisent dans `analytics_events` (marques `rappel_activite`, `rappels_echec`).
  return json({ ok: true, couleur: actuel.couleur, dispo: actuel.dispo, sonne: d.sonner, envoyes });
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

async function uidsPilotes(admin: Admin): Promise<string[]> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return ((data && data.users) || []).filter((u) => autorise(u, EXTRA)).map((u) => u.id);
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
    disponibilite: lireDisponibilite(admin), alertes: lireAlertes(admin),
  };
  const noms = Object.keys(parts) as (keyof typeof parts)[];
  const res = await Promise.allSettled(noms.map((k) => parts[k]));
  const out: Record<string, unknown> = { genereLe: new Date().toISOString() };
  const nonLus: string[] = [];
  res.forEach((r, i) => { if (r.status === "fulfilled") out[noms[i]] = r.value; else { out[noms[i]] = null; nonLus.push(noms[i]); } });
  out.nonLus = nonLus;
  out.relancesPossibles = JETON_GH ? Object.entries(RELANCES).map(([cle, v]) => ({ cle, libelle: v.libelle })) : [];
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
  const [evenements15, erreursJs15, api5xx15] = await Promise.all([
    compter(prod()), compter(prod().eq("type", "error")), compter(prod().eq("type", "api").gte("http_status", 500)),
  ]);
  const { data, error } = await admin.from("client_errors").select("message,uid,created_at").gte("created_at", ilYa(24 * 3600e3)).order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  return { evenements15, erreursJs15, api5xx15, erreurs24h: (data || []).length, principales: erreursFrequentes(data || []) };
}

async function lireErreurs7j(admin: Admin) {
  const { data, error } = await admin.from("client_errors").select("message,uid,created_at,ua,url").gte("created_at", ilYa(7 * 864e5)).order("created_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return { serie: serieJours((data || []).map((l) => l.created_at)), details: detailsErreurs(data || []) };
}

async function lireUtilisateurs(admin: Admin) {
  const { data: crees, error } = await admin.from("profiles").select("created_at").gte("created_at", ilYa(7 * 864e5)).limit(5000);
  if (error) throw error;
  const total = await compter(admin.from("profiles").select("id", { count: "exact", head: true }));
  const dates = (crees || []).map((r) => String(r.created_at).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(r.created_at)) ? "" : "Z"));
  const jour = dates.filter((d) => Date.now() - Date.parse(d) < 864e5).length;
  // Le PUBLIC seulement (2026-10-05) : robots, émulations et appareils de
  // l'équipe sortent de « en ligne » et « 24 h » (compterAudience, _shared).
  // `trafic` est lu par PostgREST (`meta->>trafic`) : la meta entière n'est
  // pas rapatriée pour 5 000 lignes.
  const actifs = async (ms: number) => {
    const { data, error } = await admin.from("telemetry_events").select("user_id,device_id,platform,connection,trafic:meta->>trafic").eq("env", "production").gte("received_at", ilYa(ms)).limit(5000);
    if (error) throw error;
    return compterAudience(data || []);
  };
  const [maintenant, aujourdhui] = await Promise.all([actifs(5 * 60e3), actifs(864e5)]);
  return { total, inscritsJour: jour, inscritsSemaine: dates.length, serieInscriptions: serieJours(dates), maintenant, aujourdhui };
}

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
  const ids = comptes.map((c) => c.id);
  const gestes: { uid: string; le: string; geste: string }[] = [];
  if (ids.length) {
    const lots = await Promise.all(GESTES_ACTIVATION.map(async (g) => {
      const { data, error } = await admin.from(g.table).select(`${g.uid},created_at`).in(g.uid, ids).order("created_at", { ascending: true }).limit(5000);
      if (error) throw error;
      return ((data || []) as Record<string, unknown>[]).map((r) => ({ uid: String(r[g.uid]), le: String(r.created_at), geste: g.table }));
    }));
    for (const l of lots) gestes.push(...l);
  }
  return activation(comptes, gestes, maintenant);
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
  const { data: act } = await admin.from("telemetry_events").select("device_id").eq("env", "production").not("user_id", "is", null).gte("received_at", ilYa(5 * 60e3)).limit(5000);
  const connexions = new Set((act || []).map((r) => r.device_id).filter(Boolean)).size;
  // E-mails : une inscription = un e-mail de confirmation (renvois non comptés).
  const emails = await compter(admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", ilYa(864e5)));
  let base: number | null = null, stockage: number | null = null;
  const { data: m, error } = await admin.rpc("pilotage_mesures");
  if (!error && m) {
    base = Number(m.base_octets) || null;
    stockage = Object.values((m.stockage || {}) as Record<string, number>).reduce((a, b) => a + Number(b || 0), 0);
  }
  return { jauges: jauges({ connexions, emails, base, stockage }), mesuresServeur: !error };
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
  return fetch("https://api.github.com" + chemin, { ...init, headers: { ...headers, ...(init.headers || {}) } });
}

let cacheGh: { at: number; val: unknown } | null = null;
async function lireGithub() {
  // Sans jeton, GitHub accorde 60 lectures/heure par adresse : réponse gardée
  // 2 min dans l'isolat (un bonus quand il survit, jamais une garantie).
  if (cacheGh && Date.now() - cacheGh.at < 120e3) return cacheGh.val;
  const res = await gh(`/repos/${DEPOT}/issues?state=open&per_page=50`);
  if (!res.ok) throw new Error("GitHub HTTP " + res.status);
  const brut = await res.json();
  const issues = (Array.isArray(brut) ? brut : []).map((i) => ({ ...resumerIssue(i), pause: estPause(i && i.title) }))
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
  const ouvertes = ((await res.json()) as { number: number; title: string; pull_request?: unknown }[]).filter((i) => !i.pull_request && estPause(i.title));
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
