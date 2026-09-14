#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// MESURER LA CAPACITÉ — PERF-01 (contre-revue Astra) : « capacité jamais
// mesurée, aucun outil de test de charge dans le dépôt ».
//
//   node scripts/charge.mjs --projet <ref> --semer 300         # données SYNTHÉTIQUES sur le staging
//   node scripts/charge.mjs --projet <ref> --paliers 10,50,100,200 --duree 20
//   node scripts/charge.mjs --projet <ref> --purger              # retire les données synthétiques
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
// ⚠️ Un compte synthétique n'existe pas dans `auth.users` : les policies RLS de
// LECTURE publique n'en ont pas besoin, et on ne mesure ici que ce qu'un
// visiteur peut demander. Les écritures authentifiées (publier, RSVP) sont
// bornées par `trg_rate_limit` (10/min par compte) : leur charge est celle des
// comptes, pas des requêtes — on ne la simule pas ici.
// ⚠️ Les données semées portent le préfixe `charge_` : `--purger` ne retire que
// celles-là, jamais autre chose.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

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
  { nom: "fil (posts+profil, 60)", url: `${URL}/rest/v1/posts?select=${encodeURIComponent(COLS_POSTS)}&order=created_at.desc&offset=0&limit=60` },
  { nom: "rencontres (events, 60)", url: `${URL}/rest/v1/events?select=${encodeURIComponent(COLS_EVENTS)}&order=created_at.desc&limit=60` },
  { nom: "profil (1)", url: `${URL}/rest/v1/profiles?select=id,username,emoji,color,avatar_url,is_private&id=eq.charge_00001` },
  { nom: "recherche passions (rpc)", url: `${URL}/rest/v1/rpc/rechercher_passions`, method: "POST", body: JSON.stringify({ q: "rando", lim: 20 }) },
];
// `--requete <mot>` : ne charger qu'une famille (isoler un goulot).
const filtre = arg("--requete");
const REQS = filtre ? REQUETES.filter((r) => r.nom.includes(filtre)) : REQUETES;
if (!REQS.length) echec("--requete ne correspond à aucune requête connue.");
const entetes = { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" };
const pct = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null;

async function palier(vus) {
  const stats = new Map(REQS.map((r) => [r.nom, { t: [], err: 0, ok: 0, motif: null }]));
  const fin = Date.now() + duree * 1000;
  const vu = async (k) => {
    let i = k;
    while (Date.now() < fin) {
      const r = REQS[i++ % REQS.length];
      const s = stats.get(r.nom); const t0 = performance.now();
      try {
        const res = await fetch(r.url, { method: r.method || "GET", headers: entetes, body: r.body });
        await res.arrayBuffer();
        if (res.ok) { s.ok++; s.t.push(performance.now() - t0); }
        else { s.err++; if (!s.motif) s.motif = `HTTP ${res.status}`; }
      } catch (e) { s.err++; if (!s.motif) s.motif = e.message.slice(0, 80); }
    }
  };
  await Promise.all(Array.from({ length: vus }, (_, k) => vu(k)));
  const lignes = [];
  for (const [nom, s] of stats) {
    s.t.sort((a, b) => a - b);
    lignes.push({ palier: vus, requete: nom, ok: s.ok, erreurs: s.err, rps: +((s.ok + s.err) / duree).toFixed(1), p50: pct(s.t, 0.5)?.toFixed(0), p95: pct(s.t, 0.95)?.toFixed(0), p99: pct(s.t, 0.99)?.toFixed(0), motif: s.motif || "" });
  }
  return lignes;
}

const [{ posts, profils }] = await sql("select (select count(*) from public.posts) posts, (select count(*) from public.profiles) profils");
console.log(`charge sur ${ref} — ${profils} profils, ${posts} publications en base ; paliers ${paliers.join("/")} utilisateurs simultanés, ${duree} s chacun, rôle anon.\n`);
const tout = [];
for (const v of paliers) {
  process.stdout.write(`palier ${v}… `);
  const l = await palier(v); tout.push(...l);
  console.log("ok");
  for (const x of l) console.log(`   ${String(x.requete).padEnd(28)} ${String(x.rps).padStart(6)} req/s   p50 ${String(x.p50).padStart(5)} ms   p95 ${String(x.p95).padStart(5)} ms   p99 ${String(x.p99).padStart(5)} ms   erreurs ${x.erreurs}${x.motif ? " (" + x.motif + ")" : ""}`);
  await new Promise((r) => setTimeout(r, 3000));
}
const sortie = arg("--sortie");
if (sortie) { writeFileSync(sortie, JSON.stringify({ projet: ref, date: new Date().toISOString(), profils, posts, duree, resultats: tout }, null, 2)); console.log("\nécrit :", sortie); }
