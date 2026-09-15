#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// MESURER LA CAPACITÉ — PERF-01 (contre-revue Astra) : « capacité jamais
// mesurée, aucun outil de test de charge dans le dépôt ».
//
//   node scripts/charge.mjs --projet <ref> --semer 300         # données SYNTHÉTIQUES sur le staging
//   node scripts/charge.mjs --projet <ref> --paliers 10,50,100,200 --duree 20
//   node scripts/charge.mjs --projet <ref> --purger              # retire les données synthétiques
//   node scripts/charge.mjs --projet <ref> --mode mixte --comptes 20 --paliers 5,10,20 --duree 30
//                                                          # lectures + écritures + envois + temps réel AUTHENTIFIÉS
//
// CE QU'IL MESURE : les requêtes que l'application émet RÉELLEMENT — le fil
// (`posts` avec l'embed `profiles!author_id`, 60 lignes, comme `supaLoadPosts`),
// les rencontres (`events`, colonnes publiques, 60 lignes, comme `supaLoadEvents`),
// la recherche de passions (`rpc/rechercher_passions`, comme `passions-flat.js`),
// un profil (`profiles?id=eq.`) — sous le rôle ANONYME (la clé anon, comme un
// visiteur), par paliers d'utilisateurs simultanés, chacun enchaînant les
// requêtes sans pause pendant `--duree` secondes. Sortie : par palier et par
// requête, débit, p50 / p95 / p99, taux d'erreur, avec le premier motif d'erreur.
//
// ⚠️ JAMAIS SUR LA PRODUCTION (refus en dur) : semer y écrirait des données
// fabriquées, et charger y ferait payer chaque vrai utilisateur. Le staging a
// la même structure (docs/STAGING.md) : la mesure vaut pour la production à
// données égales — et c'est `--semer` qui pose l'ordre de grandeur voulu
// (N comptes × 20 publications, N/4 rencontres, N/2 stories).
// ⚠️ ASTRA-20 (2026-09-15) : UN HTTP 200 VIDE N'EST PAS UN SUCCÈS. Chaque
// requête déclare ce qu'elle ATTEND (`scripts/charge-verdict.mjs`, pur, testé) :
// un tableau garni, les champs de l'app, l'embed profil, l'id demandé, un uuid
// d'auteur. Une réponse qui ne le porte pas est une erreur NOMMÉE (« vide »,
// « forme », « contenu »), comptée par motif dans le rapport. Les résultats
// bruts (chaque mesure) sont conservés dans le fichier `--sortie`.
// ⚠️ MODE MIXTE (point 9 du plan Astra) : des comptes RÉELS et jetables
// (`auth.users`, e-mail `charge_…@passio-e2e.test`, créés par service_role,
// purgés en fin de run) font ce que l'app fait connectée — lire le fil, les
// rencontres et les notifications avec leur jeton, PUBLIER (une publication
// toutes les ~8 s par compte : `trg_rate_limit` borne à 10/min), aimer, envoyer
// un média dans `content/posts/<uid>/`, et ÉCOUTER le temps réel (canal privé
// `realtime:db`, `postgres_changes` sur leurs propres publications) — la
// latence insert → événement reçu est mesurée par publication. Le mode anon
// (défaut) reste ce qu'il était : un visiteur qui lit.
// ⚠️ Les données semées portent le préfixe `charge_` : `--purger` ne retire que
// celles-là, jamais autre chose.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { verdictReponse, ligneRapport } from "./charge-verdict.mjs";

const PROD_REF = "njkiyoklssvefstljemx";
const args = process.argv.slice(2);
const arg = (n, d = null) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const drapeau = (n) => args.includes(n);
function echec(m) { console.error("❌ " + m); process.exit(2); }

const ref = arg("--projet");
if (!ref || !/^[a-z]{20}$/.test(ref)) echec("usage : --projet <ref> [--semer N | --paliers 10,50,100 --duree 20 | --purger]");
if (ref === PROD_REF) echec("jamais sur la production : cet outil sème des données fabriquées et sature l'API.");
if (process.env.GITHUB_ACTIONS) echec("geste de poste, pas de CI.");

function jeton() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const p = resolve(homedir(), ".supabase", "access-token");
  return existsSync(p) ? readFileSync(p, "utf8").trim() : null;
}
const TOK = jeton();
if (!TOK) echec("aucun jeton de l'API de gestion (`supabase login`).");

async function gestion(chemin, options = {}) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}${chemin}`, { ...options, headers: { Authorization: `Bearer ${TOK}`, "Content-Type": "application/json" } });
  const t = await r.text();
  if (!r.ok) throw new Error(`API de gestion ${chemin} : HTTP ${r.status} ${t.slice(0, 300)}`);
  return JSON.parse(t);
}
const sql = (q) => gestion("/database/query", { method: "POST", body: JSON.stringify({ query: q }) });
const URL = `https://${ref}.supabase.co`;
const ref_projet = ref;
const cles = await gestion("/api-keys?reveal=true");
const ANON = (cles.find((k) => k.name === "anon") || {}).api_key;
if (!ANON) echec("clé anon introuvable.");

// ───────────────────────────── semer ─────────────────────────────
if (arg("--semer")) {
  const n = Number(arg("--semer"));
  if (!(n > 0 && n <= 5000)) echec("--semer attend un nombre de comptes entre 1 et 5000.");
  console.log(`semis de ${n} comptes synthétiques sur ${ref} (profils, ${n * 20} publications, ${Math.ceil(n / 4)} rencontres, ${Math.ceil(n / 2)} stories)…`);
  // Triggers utilisateur coupés le temps du semis (rate_limit, notifications) ;
  // les contraintes restent. Passions : les 3 premières du référentiel actif.
  await sql(`begin;
alter table public.profiles disable trigger user;
alter table public.posts disable trigger user;
alter table public.events disable trigger user;
alter table public.stories disable trigger user;
with p as (select id from public.passions where status='active' order by sort_order limit 3),
     pp as (select array_agg(id) ids from p)
insert into public.profiles (id, username, emoji, color, passion_id, bio, passions, is_private)
select 'charge_' || lpad(i::text, 5, '0'), 'Charge ' || i, '⚡', '#8b5cf6', (select ids[1 + (i % 3)] from pp), 'compte synthétique de charge',
       jsonb_build_array((select ids[1 + (i % 3)] from pp)), false
from generate_series(1, ${n}) i on conflict (id) do nothing;
with pp as (select array_agg(id) ids from (select id from public.passions where status='active' order by sort_order limit 3) x)
insert into public.posts (id, author_id, passion_id, mood, content, likes, created_at)
select 'charge_p_' || i || '_' || j, 'charge_' || lpad(i::text, 5, '0'), (select ids[1 + (i % 3)] from pp),
       (array['creation','learn','irl'])[1 + (j % 3)], 'Publication synthétique ' || i || '/' || j || ' — ' || repeat('lorem ', 20),
       (i * j) % 40, now() - ((i * 20 + j) || ' minutes')::interval
from generate_series(1, ${n}) i, generate_series(1, 20) j on conflict (id) do nothing;
with pp as (select array_agg(id) ids from (select id from public.passions where status='active' order by sort_order limit 3) x)
insert into public.events (id, author_id, title, passion_id, lat, lng, city, description, emoji, date_at, created_at, status)
select 'charge_e_' || i, 'charge_' || lpad(i::text, 5, '0'), 'Rencontre synthétique ' || i, (select ids[1 + (i % 3)] from pp),
       48.85 + (i % 100) / 1000.0, 2.35 + (i % 100) / 1000.0, 'Paris', 'rencontre de charge', '⚡',
       now() + (i || ' hours')::interval, now() - (i || ' minutes')::interval, 'active'
from generate_series(1, ${Math.ceil(n / 4)}) i on conflict (id) do nothing;
insert into public.stories (id, author_id, media_url, created_at)
select 'charge_s_' || i, 'charge_' || lpad(i::text, 5, '0'), 'https://passio-app.netlify.app/icon-192.png', now() - (i || ' minutes')::interval
from generate_series(1, ${Math.ceil(n / 2)}) i on conflict (id) do nothing;
alter table public.profiles enable trigger user;
alter table public.posts enable trigger user;
alter table public.events enable trigger user;
alter table public.stories enable trigger user;
select (select count(*) from public.profiles where id like 'charge_%') profils, (select count(*) from public.posts where id like 'charge_p_%') posts,
       (select count(*) from public.events where id like 'charge_e_%') events, (select count(*) from public.stories where id like 'charge_s_%') stories;
commit;`).then((r) => console.log("semé :", JSON.stringify(r[0])));
  process.exit(0);
}

// ───────────────────────────── purger ─────────────────────────────
if (drapeau("--purger")) {
  const r = await sql(`begin;
delete from public.stories where id like 'charge_s_%';
delete from public.events where id like 'charge_e_%';
delete from public.posts where id like 'charge_p_%';
delete from public.profiles where id like 'charge_%';
select (select count(*) from public.profiles where id like 'charge_%') restants;
commit;`);
  console.log("purgé — profils synthétiques restants :", r[0].restants);
  process.exit(0);
}

// ───────────────────────────── charger ─────────────────────────────
const paliers = String(arg("--paliers", "10,50,100")).split(",").map(Number).filter((x) => x > 0);
const duree = Number(arg("--duree", 20));
const COLS_POSTS = "id,author_id,passion_id,mood,content,media_url,created_at,is_reel,overlays,vlog,shared_from_post_id,shared_data,event_id,profiles!author_id(username,emoji,color,avatar_url,is_private)";
const COLS_EVENTS = "id,author_id,title,passion_id,lat,lng,city,description,emoji,max_attendees,date_at,created_at,venue,postal_code,price,external_link,event_type,cover_url,organizer_id,end_at,status,updated_at,co_organizers,series_id,recurrence";
const REQUETES = [
  { nom: "fil (posts+profil, 60)", url: `${URL}/rest/v1/posts?select=${encodeURIComponent(COLS_POSTS)}&order=created_at.desc&offset=0&limit=60`, attentes: { tableau: true, min: 1, champs: ["id", "author_id", "created_at"], imbrique: "profiles" } },
  { nom: "rencontres (events, 60)", url: `${URL}/rest/v1/events?select=${encodeURIComponent(COLS_EVENTS)}&order=created_at.desc&limit=60`, attentes: { tableau: true, min: 1, champs: ["id", "title", "date_at"] } },
  { nom: "profil (1)", url: `${URL}/rest/v1/profiles?select=id,username,emoji,color,avatar_url,is_private&id=eq.charge_00001`, attentes: { tableau: true, id: "charge_00001", champs: ["username"] } },
  { nom: "recherche passions (rpc)", url: `${URL}/rest/v1/rpc/rechercher_passions`, method: "POST", body: JSON.stringify({ q: "rando", lim: 20 }), attentes: { tableau: true, min: 1, champs: ["id", "label"] } },
];
// `--requete <mot>` : ne charger qu'une famille (isoler un goulot).
const filtre = arg("--requete");
const REQS = filtre ? REQUETES.filter((r) => r.nom.includes(filtre)) : REQUETES;
if (!REQS.length) echec("--requete ne correspond à aucune requête connue.");
const entetes = { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" };
const brut = [];   // chaque mesure, conservée telle quelle dans --sortie

// Une requête mesurée : statut ET contenu (ASTRA-20). Rend { ok, motif, ms }.
async function mesurer(nom, palier, url, options, attentes) {
  const t0 = performance.now();
  let v;
  try {
    const res = await fetch(url, options);
    const corps = await res.text();
    v = verdictReponse(res.status, corps, attentes);
  } catch (e) { v = { ok: false, motif: "réseau : " + String(e.message || e).slice(0, 60) }; }
  const m = { palier, requete: nom, ok: v.ok, motif: v.motif, ms: performance.now() - t0, t: Date.now() };
  brut.push(m);
  return m;
}

async function palier(vus) {
  const mesures = new Map(REQS.map((r) => [r.nom, []]));
  const fin = Date.now() + duree * 1000;
  const vu = async (k) => {
    let i = k;
    while (Date.now() < fin) {
      const r = REQS[i++ % REQS.length];
      mesures.get(r.nom).push(await mesurer(r.nom, vus, r.url, { method: r.method || "GET", headers: entetes, body: r.body }, r.attentes));
    }
  };
  await Promise.all(Array.from({ length: vus }, (_, k) => vu(k)));
  return [...mesures].map(([nom, m]) => ligneRapport(vus, nom, m, duree));
}

// ───────────────────────────── mode mixte (authentifié) ─────────────────────────────
// Comptes RÉELS jetables. `service_role` vient de la même API de gestion que la
// clé anon ; il ne sert qu'à créer/purger les comptes et leurs profils.
const SERVICE = (cles.find((k) => k.name === "service_role") || {}).api_key;
const stamp = Date.now().toString(36);
const RE_UUID_STR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function creerComptes(n) {
  if (!SERVICE) echec("clé service_role introuvable (mode mixte).");
  const comptes = [];
  for (let i = 1; i <= n; i++) {
    const email = `charge_${stamp}_${i}@passio-e2e.test`, mdp = "Charge-" + stamp + "-" + i;
    const r = await fetch(`${URL}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: mdp, email_confirm: true }) });
    const u = await r.json();
    if (!u.id) echec("création du compte " + i + " : " + JSON.stringify(u).slice(0, 200));
    // Un jeton par compte, par mot de passe — l'API d'auth borne les connexions par IP : on espace.
    let jwt = null;
    for (let essai = 0; essai < 5 && !jwt; essai++) {
      const t = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: mdp }) });
      const j = await t.json();
      if (j.access_token) jwt = j.access_token; else await new Promise((r) => setTimeout(r, 1500 * (essai + 1)));
    }
    if (!jwt) echec("jeton du compte " + i + " introuvable (limite de connexions ?)");
    comptes.push({ uid: u.id, email, jwt, n: 0 });
  }
  // Profils (identité publique) par service_role, triggers utilisateur intacts.
  const r = await fetch(`${URL}/rest/v1/profiles`, { method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(comptes.map((c, i) => ({ id: c.uid, username: "Charge auth " + (i + 1), emoji: "⚡", color: "#8b5cf6", is_private: false }))) });
  if (r.status >= 300) echec("profils : HTTP " + r.status + " " + (await r.text()).slice(0, 200));
  return comptes;
}

async function purgerComptes(comptes) {
  const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
  const ids = comptes.map((c) => c.uid);
  const restes = {};
  for (const c of comptes) {
    // Objets Storage du compte (par préfixe de dossier : `content/posts/<uid>/`).
    const l = await fetch(`${URL}/storage/v1/object/list/content`, { method: "POST", headers: H, body: JSON.stringify({ prefix: "posts/" + c.uid, limit: 1000 }) }).then((r) => r.json()).catch(() => []);
    const noms = (Array.isArray(l) ? l : []).map((o) => "posts/" + c.uid + "/" + o.name);
    if (noms.length) await fetch(`${URL}/storage/v1/object/content`, { method: "DELETE", headers: H, body: JSON.stringify({ prefixes: noms }) });
  }
  const filtre = "in.(" + ids.join(",") + ")";
  for (const [table, col] of [["post_likes", "user_id"], ["posts", "author_id"], ["notifications", "user_id"], ["user_state", "user_id"], ["profiles", "id"]]) {
    const r = await fetch(`${URL}/rest/v1/${table}?${col}=${filtre}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
    if (r.status >= 300) restes[table] = "HTTP " + r.status;
  }
  for (const c of comptes) {
    const r = await fetch(`${URL}/auth/v1/admin/users/${c.uid}`, { method: "DELETE", headers: H });
    if (r.status >= 300) restes[c.uid] = "HTTP " + r.status;
  }
  // Relecture : ce qui reste est dit, jamais supposé.
  const [{ posts, profils, comptes: n }] = await sql(`select (select count(*) from public.posts where author_id in ('${ids.join("','")}')) posts, (select count(*) from public.profiles where id in ('${ids.join("','")}')) profils, (select count(*) from auth.users where email like 'charge_${stamp}_%') comptes`);
  return { restes, posts, profils, comptes: n };
}

// Écoute temps réel d'un compte : canal privé `realtime:db`, INSERT sur ses publications.
// Rend { attendre(postId) → Promise<ms|null>, fermer() }. Sans WebSocket global (Node < 22) : inactif, dit.
// ⚠️ Le serveur PRÉFIXE chaque topic de « realtime: » et la policy compare
// `realtime.topic()` à « realtime:db » : supabase-js envoie donc
// « realtime:realtime:db » pour le canal que l'app nomme « realtime:db ». En
// brut, il faut le faire soi-même — sinon « Unauthorized … topic: db » (mesuré).
const TOPIC_DB = "realtime:realtime:db";
function ecouter(c) {
  if (typeof WebSocket !== "function") return { pret: Promise.resolve(false), attendre: async () => null, fermer() {} };
  const attentes = new Map();
  let ouvert = false, ref = 0;
  const ws = new WebSocket(`wss://${ref_projet}.supabase.co/realtime/v1/websocket?apikey=${ANON}&vsn=1.0.0`);
  const envoyer = (o) => { try { ws.send(JSON.stringify(o)); } catch (e) {} };
  const pret = new Promise((res) => {
    const minuteur = setTimeout(() => res(false), 15000);
    ws.onopen = () => {
      envoyer({ topic: TOPIC_DB, event: "phx_join", ref: String(++ref), join_ref: "1", payload: { config: { broadcast: { self: false }, presence: { key: "" }, private: true, postgres_changes: [{ event: "INSERT", schema: "public", table: "posts", filter: "author_id=eq." + c.uid }] }, access_token: c.jwt } });
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.event === "phx_reply" && m.topic === TOPIC_DB) { ouvert = m.payload && m.payload.status === "ok"; clearTimeout(minuteur); res(ouvert); }
      if (m.event === "postgres_changes") {
        const rec = m.payload && m.payload.data && m.payload.data.record;
        const a = rec && attentes.get(rec.id);
        if (a) { attentes.delete(rec.id); a(performance.now()); }
      }
    };
    ws.onerror = () => { clearTimeout(minuteur); res(false); };
    ws.onclose = () => { ouvert = false; };
  });
  const battement = setInterval(() => envoyer({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++ref) }), 25000);
  return {
    pret,
    attendre(postId, t0) {
      if (!ouvert) return Promise.resolve(null);
      return new Promise((res) => {
        const minuteur = setTimeout(() => { attentes.delete(postId); res(null); }, 10000);
        attentes.set(postId, (t1) => { clearTimeout(minuteur); res(t1 - t0); });
      });
    },
    fermer() { clearInterval(battement); try { ws.close(); } catch (e) {} },
  };
}

const CADENCE_PUBLICATION_MS = 8000;   // 7,5/min < trg_rate_limit (10/min)
const CADENCE_ENVOI_MS = 20000;

async function palierMixte(vus, comptes, cibles) {
  const familles = ["fil (auth)", "rencontres (auth)", "notifications (auth)", "publier", "aimer", "envoyer un média", "temps réel (insert → reçu)"];
  const mesures = new Map(familles.map((f) => [f, []]));
  const fin = Date.now() + duree * 1000;
  const vu = async (k) => {
    const c = comptes[k % comptes.length];
    const H = { apikey: ANON, Authorization: `Bearer ${c.jwt}`, "Content-Type": "application/json" };
    const ecoute = ecouter(c);
    const rt = await ecoute.pret;
    if (!rt) mesures.get("temps réel (insert → reçu)").push({ ok: false, motif: "canal non joint", ms: 0 });
    let prochainePub = Date.now() + (k * 300) % CADENCE_PUBLICATION_MS, prochainEnvoi = Date.now() + 2000 + (k * 700) % CADENCE_ENVOI_MS, i = k;
    while (Date.now() < fin) {
      const maintenant = Date.now();
      if (maintenant >= prochainePub) {
        prochainePub = maintenant + CADENCE_PUBLICATION_MS;
        const id = `charge_a_${stamp}_${c.uid.slice(0, 8)}_${++c.n}`;
        const t0 = performance.now();
        const m = await mesurer("publier", vus, `${URL}/rest/v1/posts`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ id, author_id: c.uid, passion_id: cibles.passion, mood: "creation", content: "Publication de charge " + c.n }) }, { tableau: true, id, champs: ["author_id", "created_at"] });
        mesures.get("publier").push(m);
        if (m.ok && rt) {
          const ms = await ecoute.attendre(id, t0);
          const r = ms == null ? { ok: false, motif: "événement non reçu en 10 s", ms: 0 } : { ok: true, motif: null, ms };
          brut.push({ palier: vus, requete: "temps réel (insert → reçu)", ...r, t: Date.now() });
          mesures.get("temps réel (insert → reçu)").push(r);
        }
        continue;
      }
      if (maintenant >= prochainEnvoi) {
        prochainEnvoi = maintenant + CADENCE_ENVOI_MS;
        const chemin = `posts/${c.uid}/charge_${c.n}_${maintenant}.png`;
        mesures.get("envoyer un média").push(await mesurer("envoyer un média", vus, `${URL}/storage/v1/object/content/${chemin}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${c.jwt}`, "Content-Type": "image/png", "x-upsert": "false" }, body: PNG_1PX }, { objet: true, champs: ["Key"] }));
        continue;
      }
      const tour = i++ % 4;
      if (tour === 0) mesures.get("fil (auth)").push(await mesurer("fil (auth)", vus, `${URL}/rest/v1/posts?select=${encodeURIComponent(COLS_POSTS)}&order=created_at.desc&offset=0&limit=60`, { headers: H }, { tableau: true, min: 1, champs: ["id", "author_id"], imbrique: "profiles" }));
      else if (tour === 1) mesures.get("rencontres (auth)").push(await mesurer("rencontres (auth)", vus, `${URL}/rest/v1/events?select=${encodeURIComponent(COLS_EVENTS + ",address,contact,conv_id")}&order=created_at.desc&limit=60`, { headers: H }, { tableau: true, min: 1, champs: ["id", "title"] }));
      else if (tour === 2) mesures.get("notifications (auth)").push(await mesurer("notifications (auth)", vus, `${URL}/rest/v1/notifications?select=id,kind,created_at&user_id=eq.${c.uid}&order=created_at.desc&limit=30`, { headers: H }, { tableau: true, min: 0 }));
      else {
        const cible = cibles.posts[(i + k) % cibles.posts.length];
        // Aimer puis retirer : l'état revient, la mesure porte sur l'écriture.
        const m = await mesurer("aimer", vus, `${URL}/rest/v1/post_likes`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ post_id: cible, user_id: c.uid }) }, { tableau: true, min: 1, champs: ["post_id"] });
        mesures.get("aimer").push(m);
        if (m.ok) await fetch(`${URL}/rest/v1/post_likes?post_id=eq.${encodeURIComponent(cible)}&user_id=eq.${c.uid}`, { method: "DELETE", headers: H }).catch(() => {});
      }
    }
    ecoute.fermer();
  };
  await Promise.all(Array.from({ length: vus }, (_, k) => vu(k)));
  return [...mesures].map(([nom, m]) => ligneRapport(vus, nom, m, duree));
}

const mode = arg("--mode", "anon");
if (!["anon", "mixte"].includes(mode)) echec("--mode attend anon ou mixte.");
const [{ posts, profils }] = await sql("select (select count(*) from public.posts) posts, (select count(*) from public.profiles) profils");
console.log(`charge sur ${ref} — ${profils} profils, ${posts} publications en base ; paliers ${paliers.join("/")} utilisateurs simultanés, ${duree} s chacun, mode ${mode}.\n`);
const tout = [];
let comptes = [], purge = null;
if (mode === "mixte") {
  const n = Math.min(Number(arg("--comptes", Math.max(...paliers))), 100);
  process.stdout.write(`comptes jetables : ${n}… `);
  comptes = await creerComptes(n);
  console.log("ok");
}
const cibles = mode === "mixte" ? {
  passion: (await sql("select id from public.passions where status='active' order by sort_order limit 1"))[0].id,
  posts: (await sql("select id from public.posts where id like 'charge_p_%' order by id limit 50")).map((x) => x.id),
} : null;
if (cibles && !cibles.posts.length) echec("mode mixte : aucune publication semée à aimer — lancer --semer d'abord.");
try {
  for (const v of paliers) {
    process.stdout.write(`palier ${v}… `);
    const l = mode === "mixte" ? await palierMixte(v, comptes, cibles) : await palier(v); tout.push(...l);
    console.log("ok");
    for (const x of l) console.log(`   ${String(x.requete).padEnd(28)} ${String(x.rps).padStart(6)} req/s   p50 ${String(x.p50).padStart(5)} ms   p95 ${String(x.p95).padStart(5)} ms   p99 ${String(x.p99).padStart(5)} ms   ok ${x.ok}   erreurs ${x.erreurs}${x.motifs ? " (" + x.motifs + ")" : ""}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
} finally {
  if (comptes.length) {
    process.stdout.write("purge des comptes jetables… ");
    purge = await purgerComptes(comptes);
    console.log(JSON.stringify(purge));
  }
}
const sortie = arg("--sortie");
if (sortie) { writeFileSync(sortie, JSON.stringify({ projet: ref, date: new Date().toISOString(), mode, profils, posts, duree, paliers, resultats: tout, purge, brut }, null, 2)); console.log("\nécrit :", sortie, "(" + brut.length + " mesures brutes)"); }
