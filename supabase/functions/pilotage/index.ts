// ═══════════════════════════════════════════════════════════════════════════
// PILOTAGE — le centre de pilotage sans PC (2026-09-28)
//
// POST, JWT de la personne dans Authorization. Réservé au compte de l'éditeur
// (`autorise`, échec fermé) : toute autre personne reçoit 403, un visiteur 401.
//   { action: "etat" }                      → état de la production (lecture)
//   { action: "relancer", cible: "..." }    → workflow_dispatch d'un workflow
//                                             de la liste blanche RELANCES
// Lecture de la base par service_role, CÔTÉ SERVEUR seulement : la clé ne
// quitte jamais cette fonction. GitHub : dépôt public, lu sans jeton ; le
// secret PILOTAGE_GITHUB_TOKEN (facultatif) relève la limite de lecture et
// permet les relances. Sans lui, « relancer » répond 501 et le dit.
// Plafonné (plafond.js) : 30/min, 600/h — le téléphone rafraîchit toutes les 60 s.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifierPlafondEnBase, reponsePlafond } from "../_shared/plafond.js";
import { REVISION } from "../_shared/revision.js";
import { autorise, RELANCES, LABELS_SUIVIS, erreursFrequentes, resumerIssue, resumerRun, verdict } from "../_shared/pilotage.js";

const corsHeaders = {
  "X-Passio-Revision": REVISION,
  "Access-Control-Expose-Headers": "X-Passio-Revision",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const DEPOT = Deno.env.get("PILOTAGE_DEPOT") || "PASSIO74/passio-app";
const JETON_GH = Deno.env.get("PILOTAGE_GITHUB_TOKEN") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Non authentifié" }, 401);
  const user = userData.user;
  if (!autorise(user, Deno.env.get("PILOTAGE_EMAILS") || "")) return json({ error: "Réservé au compte de l'éditeur." }, 403);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const plafond = await verifierPlafondEnBase(admin, user.id, "pilotage", { parMinute: 30, parHeure: 600 });
  if (!plafond.ok) return reponsePlafond(plafond, corsHeaders);

  let corps: Record<string, unknown> = {};
  try { corps = await req.json(); } catch { /* corps vide = état */ }
  const action = String(corps.action || "etat");

  if (action === "relancer") {
    const cible = String(corps.cible || "");
    const r = Object.hasOwn(RELANCES, cible) ? RELANCES[cible as keyof typeof RELANCES] : null;
    if (!r) return json({ error: "Relance inconnue." }, 400);
    if (!JETON_GH) return json({ error: "Relance indisponible : le secret PILOTAGE_GITHUB_TOKEN n'est pas posé sur la fonction." }, 501);
    const res = await gh(`/repos/${DEPOT}/actions/workflows/${r.fichier}/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main" }) });
    if (res.status !== 204) return json({ error: `GitHub a refusé la relance (HTTP ${res.status}).` }, 502);
    return json({ ok: true, lance: r.libelle });
  }
  if (action !== "etat") return json({ error: "Action inconnue." }, 400);

  const [sante, utilisateurs, signalements, github] = await Promise.allSettled([
    lireSante(admin), lireUtilisateurs(admin), lireSignalements(admin), lireGithub(),
  ]);
  const val = <T>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
  const etat = {
    genereLe: new Date().toISOString(),
    sante: val(sante), utilisateurs: val(utilisateurs), signalements: val(signalements), github: val(github),
    relancesPossibles: JETON_GH ? Object.entries(RELANCES).map(([cle, v]) => ({ cle, libelle: v.libelle })) : [],
    nonLus: [["sante", sante], ["utilisateurs", utilisateurs], ["signalements", signalements], ["github", github]]
      .filter(([, r]) => (r as PromiseSettledResult<unknown>).status === "rejected").map(([k]) => k),
  };
  return json({ ...etat, verdict: verdict(etat) });
});

const ilYa = (ms: number) => new Date(Date.now() - ms).toISOString();

async function compter(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function lireSante(admin: ReturnType<typeof createClient>) {
  const depuis = ilYa(15 * 60e3);
  const prod = () => admin.from("telemetry_events").select("id", { count: "exact", head: true }).eq("env", "production").gte("received_at", depuis);
  const [evenements15, erreursJs15, api5xx15] = await Promise.all([
    compter(prod()), compter(prod().eq("type", "error")), compter(prod().eq("type", "api").gte("http_status", 500)),
  ]);
  const { data, error } = await admin.from("client_errors").select("message,uid,created_at").gte("created_at", ilYa(24 * 3600e3)).order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  return { evenements15, erreursJs15, api5xx15, erreurs24h: (data || []).length, principales: erreursFrequentes(data || []) };
}

async function lireUtilisateurs(admin: ReturnType<typeof createClient>) {
  const [total, jour, semaine] = await Promise.all([
    compter(admin.from("profiles").select("id", { count: "exact", head: true })),
    compter(admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", ilYa(24 * 3600e3))),
    compter(admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", ilYa(7 * 24 * 3600e3))),
  ]);
  const actifs = async (ms: number) => {
    const { data, error } = await admin.from("telemetry_events").select("user_id,device_id").eq("env", "production").gte("received_at", ilYa(ms)).limit(5000);
    if (error) throw error;
    return { comptes: new Set((data || []).map((r) => r.user_id).filter(Boolean)).size, appareils: new Set((data || []).map((r) => r.device_id).filter(Boolean)).size };
  };
  const [maintenant, aujourdhui] = await Promise.all([actifs(5 * 60e3), actifs(24 * 3600e3)]);
  return { total, inscritsJour: jour, inscritsSemaine: semaine, maintenant, aujourdhui };
}

async function lireSignalements(admin: ReturnType<typeof createClient>) {
  const ouverts = await compter(admin.from("reports").select("id", { count: "exact", head: true }).or("status.is.null,status.eq.open"));
  return { ouverts };
}

function gh(chemin: string, init: RequestInit = {}) {
  const headers: Record<string, string> = { "Accept": "application/vnd.github+json", "User-Agent": "passio-pilotage", "X-GitHub-Api-Version": "2022-11-28" };
  if (JETON_GH) headers.Authorization = `Bearer ${JETON_GH}`;
  return fetch("https://api.github.com" + chemin, { ...init, headers: { ...headers, ...(init.headers || {}) } });
}

let cacheGh: { at: number; val: unknown } | null = null;
async function lireGithub() {
  // Sans jeton, GitHub accorde 60 lectures/heure par adresse : on garde la
  // réponse 2 min dans l'isolat (un bonus quand il survit, jamais une garantie).
  if (cacheGh && Date.now() - cacheGh.at < 120e3) return cacheGh.val;
  const res = await gh(`/repos/${DEPOT}/issues?state=open&per_page=50`);
  if (!res.ok) throw new Error("GitHub HTTP " + res.status);
  const brut = await res.json();
  const issues = (Array.isArray(brut) ? brut : []).map(resumerIssue)
    .filter((i) => i.pr || i.labels.some((l) => LABELS_SUIVIS.includes(l)));
  const run = async (f: string) => {
    const r = await gh(`/repos/${DEPOT}/actions/workflows/${f}/runs?per_page=1&branch=main&exclude_pull_requests=true`);
    if (!r.ok) return null;
    const j = await r.json();
    return resumerRun(j && j.workflow_runs && j.workflow_runs[0]);
  };
  const [sentinelle, veille, deploy] = await Promise.all([run("sentinelle-autonome.yml"), run("veille-production.yml"), run("deploy.yml")]);
  const val = { issues, runs: { sentinelle, veille, deploy } };
  cacheGh = { at: Date.now(), val };
  return val;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
