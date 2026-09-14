#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// RESTAURER UNE ARCHIVE DE SAUVEGARDE DANS UN PROJET SUPABASE — l'EXERCICE
// que `docs/RECUPERATION.md` décrivait sans l'avoir jamais fait (EXP-01,
// contre-revue Astra : « personne n'a jamais reconstruit la base de bout en
// bout »). Ce script est le chemin inverse de `sauvegarde-donnees.js`.
//
//   node scripts/restaurer-donnees.js --archive <dossier> --projet <ref>
//        [--schema <fichier.sql>] [--sans-comptes] [--sans-medias]
//        [--verifier] [--purger]
//
// CE QU'IL FAIT, dans l'ordre — et chaque étape rend un nombre qu'on compare :
//   ① le SCHÉMA : les tables du manifeste doivent exister sur la cible ; sinon,
//      `--schema` applique un fichier DDL (une transaction `begin; … commit;`)
//      par l'API de gestion, puis on re-mesure ;
//   ② les COMPTES (`_auth_users.ndjson`) par l'API d'administration, AVEC LEUR
//      IDENTIFIANT d'origine — toutes les autres tables s'y réfèrent en texte ;
//   ③ les TABLES, parents d'abord, par lots SQL `json_populate_recordset` sous
//      le rôle `postgres` de l'API de gestion, TRIGGERS UTILISATEUR COUPÉS le
//      temps du chargement (voir plus bas pourquoi c'est obligatoire) ;
//   ④ les MÉDIAS (`_storage/<seau>/<chemin>`) par l'API Storage, chemins
//      PRÉSERVÉS — les URL en base les référencent ;
//   ⑤ le VERDICT : chaque table recomptée sur la cible et confrontée au
//      manifeste, comptes recomptés, objets Storage recomptés en SQL.
//
// ⚠️ ON NE RESTAURE JAMAIS PAR-DESSUS LA SOURCE. Le projet cible ne peut être
// ni la production (`njkiyoklssvefstljemx`, en dur), ni le projet écrit dans
// le manifeste de l'archive. Une restauration est un geste vers une base
// VIDE ou jetable ; sur la production elle s'appelle un incident.
//
// ⚠️ POURQUOI PAS PostgREST POUR CHARGER LES LIGNES — mesuré sur le schéma
// réel : `trg_rate_limit` refuse la 11ᵉ publication de la minute, et
// `rate_limit_insert` RÉÉCRIT `created_at = now()` (anti-antidatage, fiche
// « ouverture publique »). Une restauration qui passe par la porte des
// clients se fait refuser à la onzième ligne et perd toutes les dates. Le
// chargement passe donc par le SQL, avec `ALTER TABLE … DISABLE TRIGGER USER`
// (droit du propriétaire, pas du superutilisateur) le temps du lot, puis
// `ENABLE`. Les contraintes (clés étrangères, CHECK) restent ACTIVES : elles
// sont ce qu'on vérifie, pas ce qu'on contourne.
//
// ⚠️ CE QU'UNE RESTAURATION NE REND PAS, et qui est écrit plutôt que tu :
//   · les MOTS DE PASSE (l'export ne porte pas `encrypted_password`) — chaque
//     compte restauré reçoit un mot de passe aléatoire et repasse par « mot de
//     passe oublié » ;
//   · les identités OAuth (Google) : l'export ne les porte pas ;
//   · `created_at` des comptes auth (l'API d'administration l'impose) ;
//   · les secrets du projet, les réglages d'authentification, les policies
//     Storage — ils vivent dans la configuration, pas dans l'archive.
//
// `--verifier` ne charge rien : il mesure la cible contre le manifeste.
// `--purger` VIDE la cible (tables publiques, comptes, seaux) — refusé sur la
// production par la même garde ; c'est ce qui rend l'exercice rejouable.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const PROD_REF = "njkiyoklssvefstljemx";
const API = "https://api.supabase.com/v1/projects";
// Un lot SQL reste sous ~700 Ko : l'API de gestion accepte des corps de
// quelques Mo, et un lot plus petit localise mieux une ligne refusée.
const LOT_OCTETS = 700 * 1024;

// Parents d'abord. Ce qui n'est pas nommé ici passe APRÈS, par ordre
// alphabétique, puis un second tour rejoue ce que les clés étrangères ont
// refusé au premier — l'ordre exact du schéma n'a pas à être connu du script.
const PARENTS = ["passions", "passion_relations", "profiles", "access_policies", "user_safety",
  "passion_quotas", "user_passions", "posts", "events", "conversations", "video_lives", "cdv_lives",
  "conv_members", "conv_messages", "cdv_live_steps"];

function echec(msg) { console.error("❌ " + msg); process.exit(2); }
function arg(nom) { const i = process.argv.indexOf(nom); return i === -1 ? null : process.argv[i + 1]; }
const drapeau = (nom) => process.argv.includes(nom);

function lireJeton() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const p = path.join(os.homedir(), ".supabase", "access-token");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim() : null;
}

async function gestion(jeton, ref, chemin, options = {}) {
  const r = await fetch(`${API}/${ref}${chemin}`, {
    ...options, headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`API de gestion ${chemin} : HTTP ${r.status} ${texte.slice(0, 400)}`);
  try { return JSON.parse(texte); } catch { return texte; }
}

/** SQL sous le rôle `postgres`, même endpoint que le bouton « Run » du tableau de bord. */
async function sql(ctx, query) {
  // L'API de gestion plafonne les appels (429 « ThrottlerException », mesuré
  // à la première restauration) : on attend la fenêtre suivante, une fois.
  for (let essai = 0; ; essai++) {
    try { return await gestion(ctx.jeton, ctx.ref, "/database/query", { method: "POST", body: JSON.stringify({ query }) }); }
    catch (e) {
      if (essai < 2 && /HTTP 429/.test(e.message)) { process.stdout.write("   (429 : pause 61 s)\n"); await new Promise((r) => setTimeout(r, 61000)); continue; }
      throw e;
    }
  }
}

/** Chaîne SQL par dollar-quoting, avec une étiquette que le contenu ne porte pas. */
function litteral(texte) {
  let tag = "$r$";
  while (texte.includes(tag)) tag = `$r${crypto.randomBytes(3).toString("hex")}$`;
  return `${tag}${texte}${tag}`;
}

const entetes = (cle, extra = {}) => ({ apikey: cle, Authorization: `Bearer ${cle}`, ...extra });

// ───────────────────────────── contexte ─────────────────────────────
async function contexte() {
  if (process.env.GITHUB_ACTIONS) echec("jamais depuis la CI — une restauration est un geste de poste (ADR-012, canal ③).");
  const archive = arg("--archive"), ref = arg("--projet");
  if (!ref || !/^[a-z]{20}$/.test(ref)) echec("usage : --archive <dossier> --projet <ref de 20 lettres>");
  if (ref === PROD_REF) echec("le projet cible est la PRODUCTION. On ne restaure jamais par-dessus la source.");
  const jeton = lireJeton();
  if (!jeton) echec("aucun jeton : `supabase login` sur ce poste, ou SUPABASE_ACCESS_TOKEN.");
  if (!/^sbp_/.test(jeton)) echec("le jeton ne ressemble pas à un jeton personnel (`sbp_…`).");

  let man = null;
  if (archive) {
    const f = path.join(archive, "manifeste.json");
    if (!fs.existsSync(f)) echec("manifeste.json absent de " + archive);
    man = JSON.parse(fs.readFileSync(f, "utf8"));
    const src = /https?:\/\/([a-z]{20})\./.exec(man.projet || "");
    if (src && src[1] === ref) echec(`le projet cible ${ref} est celui de l'archive : on ne restaure pas par-dessus la source.`);
  } else if (!drapeau("--purger")) echec("--archive <dossier> est obligatoire (sauf --purger).");

  const projet = await gestion(jeton, ref, "");
  if (projet.status !== "ACTIVE_HEALTHY") echec(`projet ${ref} en état ${projet.status} — attendre ACTIVE_HEALTHY.`);
  const cles = await gestion(jeton, ref, "/api-keys?reveal=true");
  const sr = (cles || []).find((k) => k.name === "service_role");
  if (!sr || !sr.api_key) echec("clé service_role introuvable sur la cible (API de gestion /api-keys).");
  return { jeton, ref, url: `https://${ref}.supabase.co`, cle: sr.api_key, archive, man, nom: projet.name };
}

// ───────────────────────────── ① schéma ─────────────────────────────
async function tablesCible(ctx) {
  const l = await sql(ctx, "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1");
  return new Set(l.map((x) => x.table_name));
}

async function schema(ctx) {
  const attendues = Object.keys(ctx.man.tables);
  let presentes = await tablesCible(ctx);
  let manquantes = attendues.filter((t) => !presentes.has(t));
  const fichier = arg("--schema");
  if (manquantes.length && fichier) {
    const ddl = fs.readFileSync(fichier, "utf8");
    const corps = ddl.replace(/--[^\n]*/g, "").trim().toLowerCase();
    if (!corps.startsWith("begin;") || !corps.endsWith("commit;")) echec("--schema doit être UNE transaction (`begin; … commit;`).");
    console.log(`① schéma : ${manquantes.length} table(s) manquante(s) → application de ${fichier} (${ddl.length} caractères)…`);
    await sql(ctx, ddl);
    presentes = await tablesCible(ctx);
    manquantes = attendues.filter((t) => !presentes.has(t));
  }
  if (manquantes.length) echec(`① schéma : ${manquantes.length} table(s) du manifeste absentes de la cible : ${manquantes.join(", ")}\n   → passer --schema <fichier.sql> (DDL exécutable, une transaction).`);
  console.log(`① schéma : ${attendues.length} tables du manifeste présentes sur ${ctx.ref} (${presentes.size} tables publiques).`);
}

// ───────────────────────────── ② comptes ─────────────────────────────
function lireNdjson(f) {
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

async function comptes(ctx) {
  const f = path.join(ctx.archive, "_auth_users.ndjson");
  if (drapeau("--sans-comptes") || !fs.existsSync(f)) { console.log("② comptes : ignorés."); return; }
  const users = lireNdjson(f);
  let crees = 0, presents = 0, refus = [];
  for (const u of users) {
    const corps = {
      id: u.id, email: u.email, email_confirm: !!u.email_confirmed_at,
      // Mot de passe ALÉATOIRE, jamais journalisé : l'archive ne porte pas
      // le hachage d'origine, la personne repassera par « mot de passe oublié ».
      password: crypto.randomBytes(24).toString("base64url"),
      user_metadata: u.user_metadata || {}, app_metadata: u.app_metadata || {},
    };
    if (u.phone) { corps.phone = u.phone; corps.phone_confirm = !!u.phone_confirmed_at; }
    const r = await fetch(`${ctx.url}/auth/v1/admin/users`, {
      method: "POST", headers: entetes(ctx.cle, { "Content-Type": "application/json" }), body: JSON.stringify(corps),
    });
    if (r.ok) { crees++; continue; }
    const t = await r.text();
    if (r.status === 422 && /already|exist|registered/i.test(t)) { presents++; continue; }
    refus.push(`${u.id} : HTTP ${r.status} ${t.slice(0, 160)}`);
  }
  console.log(`② comptes : ${crees} créé(s), ${presents} déjà présent(s), ${refus.length} refus, sur ${users.length}.`);
  for (const x of refus) console.log("   ✗ " + x);
}

// ───────────────────────────── ③ tables ─────────────────────────────
function lots(f) {
  // Des lots de lignes ENTIÈRES sous LOT_OCTETS : on ne coupe jamais un JSON.
  const contenu = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
  const lignes = contenu.split("\n").filter(Boolean);
  const out = []; let cur = [], taille = 0;
  for (const l of lignes) {
    if (taille + l.length > LOT_OCTETS && cur.length) { out.push(cur); cur = []; taille = 0; }
    cur.push(l); taille += l.length + 1;
  }
  if (cur.length) out.push(cur);
  return { lignes: lignes.length, lots: out };
}

/** Colonnes RÉELLES de chaque table sur la cible — UNE requête pour toutes (l'API plafonne). */
async function colonnes(ctx) {
  if (ctx._cols) return ctx._cols;
  const l = await sql(ctx, "select table_name t, column_name c from information_schema.columns where table_schema='public' order by table_name, ordinal_position");
  ctx._cols = new Map();
  for (const x of l) { if (!ctx._cols.has(x.t)) ctx._cols.set(x.t, []); ctx._cols.get(x.t).push(x.c); }
  return ctx._cols;
}

function ordreInsert(t, cols, json) {
  // ⚠️ LA LISTE DE COLONNES EST EXPLICITE, et c'est une leçon de l'exercice
  // (2026-09-14) : `insert … select * from json_populate_recordset` pose NULL
  // sur toute colonne ABSENTE du JSON — donc une colonne ajoutée APRÈS
  // l'archive (`follows.created_at`, `reports.status`, toutes deux du 11/09)
  // n'obtient jamais son DEFAULT et l'insertion tombe sur NOT NULL. On ne
  // nomme que les colonnes que l'archive porte ET que la cible connaît : les
  // autres prennent leur défaut, comme à l'écriture d'origine.
  // `on conflict do nothing` : rejouable (toute table du manifeste a une clé
  // primaire — c'est le discriminant qui l'a fait entrer dans l'archive).
  const c = cols.map((x) => `"${x}"`).join(", ");
  return `begin;
alter table public."${t}" disable trigger user;
insert into public."${t}" (${c}) select ${c} from json_populate_recordset(null::public."${t}", ${litteral(json)}::json) on conflict do nothing;
alter table public."${t}" enable trigger user;
commit;`;
}

function ordreLigneALigne(t, cols, json) {
  const c = cols.map((x) => `"${x}"`).join(", ");
  return `begin;
alter table public."${t}" disable trigger user;
create temp table _refus (motif text) on commit drop;
do $$ declare e json; begin
  for e in select * from json_array_elements(${litteral(json)}::json) loop
    begin
      insert into public."${t}" (${c}) select ${c} from json_populate_record(null::public."${t}", e) on conflict do nothing;
    exception when others then insert into _refus values (left(sqlerrm, 160)); end;
  end loop;
end $$;
alter table public."${t}" enable trigger user;
select motif, count(*)::int n from _refus group by 1 order by 2 desc;
commit;`;
}

/** Une ligne trop grosse pour l'API de gestion (413) passe par PostgREST, clé primaire en garde. */
async function insererParRest(ctx, t, ligne) {
  const r = await fetch(`${ctx.url}/rest/v1/${t}`, {
    method: "POST", headers: entetes(ctx.cle, { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" }), body: ligne,
  });
  if (!r.ok) throw new Error(`PostgREST ${t} : HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}

async function chargerTable(ctx, t, bilan) {
  const { lignes, lots: paquets } = lots(path.join(ctx.archive, `${t}.ndjson`));
  if (!lignes) return { lignes: 0 };
  const presentes = new Set((await colonnes(ctx)).get(t) || []);
  const cles = new Set();
  for (const paquet of paquets) for (const l of paquet) for (const k of Object.keys(JSON.parse(l))) cles.add(k);
  const cols = [...cles].filter((k) => presentes.has(k));
  const ignorees = [...cles].filter((k) => !presentes.has(k));
  if (ignorees.length) bilan.notes.push(`${t} : colonne(s) de l'archive inconnue(s) de la cible, ignorée(s) : ${ignorees.join(", ")}`);
  for (const paquet of paquets) {
    // Un lot d'UNE ligne plus grosse que le plafond de l'API de gestion
    // (mesuré : 4,8 Mo pour un seul `user_state`) part par PostgREST —
    // triggers ACTIFS sur ce chemin-là, c'est écrit dans le bilan.
    if (paquet.length === 1 && paquet[0].length > LOT_OCTETS) {
      try { await insererParRest(ctx, t, paquet[0]); bilan.notes.push(`${t} : 1 ligne de ${Math.round(paquet[0].length / 1024)} Ko passée par PostgREST (trop grosse pour l'API de gestion)`); }
      catch (e) { bilan.refus.push(`${t} : ${e.message}`); }
      continue;
    }
    try { await sql(ctx, ordreInsert(t, cols, "[" + paquet.join(",") + "]")); }
    catch (e) {
      // Le lot est atomique : UNE ligne refusée (clé étrangère vers une ligne
      // absente, contrainte ajoutée après l'archive) faisait tomber tout le
      // lot. On le rejoue ligne à ligne DANS LA BASE (un seul aller-retour :
      // l'API de gestion plafonne les appels) pour poser ce qui se pose et
      // NOMMER ce qui ne se pose pas — c'est le refus qui est l'information.
      const motifs = await sql(ctx, ordreLigneALigne(t, cols, "[" + paquet.join(",") + "]"));
      for (const m of motifs) bilan.refus.push(`${t} : ${m.n} ligne(s) refusée(s) — ${m.motif}`);
    }
  }
  return { lignes };
}

async function tables(ctx) {
  const noms = Object.keys(ctx.man.tables);
  const ordre = [...PARENTS.filter((p) => noms.includes(p)), ...noms.filter((n) => !PARENTS.includes(n)).sort()];
  const bilan = { refus: [], notes: [] };
  for (const t of ordre) {
    const avant = bilan.refus.length;
    const r = await chargerTable(ctx, t, bilan);
    console.log(`   ${t} : ${r.lignes} ligne(s)${bilan.refus.length > avant ? " — des refus, voir le bilan" : ""}`);
  }
  // Second tour sur les tables qui ont eu des refus : une clé étrangère vers
  // un parent chargé plus tard se résout ici. Ce qui reste refusé est un vrai
  // défaut de l'archive face au schéma, et il est nommé.
  const aRejouer = [...new Set(bilan.refus.map((x) => x.split(" : ")[0]))];
  if (aRejouer.length) {
    bilan.refus = [];
    for (const t of aRejouer) await chargerTable(ctx, t, bilan);
  }
  // Séquences : une colonne `serial`/identity chargée avec ses valeurs laisse
  // sa séquence à zéro — la prochaine insertion percuterait une clé existante.
  await sql(ctx, `do $$ declare r record; m bigint; begin
  for r in select c.table_name t, c.column_name col, pg_get_serial_sequence(quote_ident(c.table_schema)||'.'||quote_ident(c.table_name), c.column_name) seq
           from information_schema.columns c where c.table_schema='public' and (c.column_default like 'nextval%' or c.is_identity='YES') loop
    if r.seq is not null then
      execute format('select coalesce(max(%I),0) from public.%I', r.col, r.t) into m;
      if m > 0 then perform setval(r.seq, m); end if;
    end if;
  end loop; end $$;`);
  console.log(`③ tables : ${ordre.length} chargées${bilan.refus.length ? ", " + bilan.refus.length + " REFUS à lire" : ", aucun refus"}.`);
  for (const x of bilan.notes) console.log("   ℹ " + x);
  for (const x of bilan.refus) console.log("   ✗ " + x);
  return bilan.refus.length === 0;
}

// ───────────────────────────── ④ médias ─────────────────────────────
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", webm: "audio/webm",
  mp4: "video/mp4", mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", pdf: "application/pdf", txt: "text/plain", json: "application/json" };
// Visibilité des seaux : elle n'est pas dans l'archive (c'est de la
// configuration). `attachments` est PRIVÉ depuis le 2026-09-11 ; tout seau
// inconnu est créé privé — on n'ouvre rien par défaut.
const SEAUX_PUBLICS = new Set(["content"]);

function fichiersSous(d, base = d) {
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory()
    ? fichiersSous(path.join(d, e.name), base) : [path.relative(base, path.join(d, e.name)).split(path.sep).join("/")]);
}

async function medias(ctx) {
  const base = path.join(ctx.archive, "_storage");
  if (drapeau("--sans-medias") || !fs.existsSync(base)) { console.log("④ médias : ignorés."); return true; }
  const existants = new Set((await (await fetch(`${ctx.url}/storage/v1/bucket`, { headers: entetes(ctx.cle) })).json()).map((b) => b.name));
  let envoyes = 0, refus = [];
  // ⚠️ LA LIMITE DE TAILLE D'UN SEAU N'EST PAS CELLE DE SON CONTENU (mesuré
  // le 2026-09-14) : `content` plafonne à 26 Mo en production et porte une
  // vidéo de 30,9 Mo, déposée avant que la limite ne baisse. Un dépôt à la
  // limite du seau refuse donc un objet que la production a. Le temps de la
  // restauration, les seaux prennent la limite du PROJET (null), puis on
  // remet celle du schéma — l'archive ne doit rien desserrer derrière elle.
  const limites = await sql(ctx, "select id, file_size_limit from storage.buckets");
  await sql(ctx, "update storage.buckets set file_size_limit = null");
  for (const seau of fs.readdirSync(base)) {
    if (!existants.has(seau)) {
      const r = await fetch(`${ctx.url}/storage/v1/bucket`, { method: "POST", headers: entetes(ctx.cle, { "Content-Type": "application/json" }),
        body: JSON.stringify({ id: seau, name: seau, public: SEAUX_PUBLICS.has(seau) }) });
      if (!r.ok) { refus.push(`seau ${seau} : HTTP ${r.status} ${(await r.text()).slice(0, 120)}`); continue; }
      console.log(`   seau ${seau} créé (${SEAUX_PUBLICS.has(seau) ? "public" : "privé"})`);
    }
    for (const rel of fichiersSous(path.join(base, seau))) {
      const buf = fs.readFileSync(path.join(base, seau, rel));
      const ext = path.extname(rel).slice(1).toLowerCase();
      const r = await fetch(`${ctx.url}/storage/v1/object/${seau}/${rel.split("/").map(encodeURIComponent).join("/")}`, {
        method: "POST", headers: entetes(ctx.cle, { "Content-Type": MIME[ext] || "application/octet-stream", "x-upsert": "true" }), body: buf,
      });
      if (r.ok) envoyes++; else refus.push(`${seau}/${rel} : HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
    }
  }
  for (const b of limites) await sql(ctx, `update storage.buckets set file_size_limit = ${b.file_size_limit === null ? "null" : Number(b.file_size_limit)} where id = ${litteral(b.id)}`);
  console.log(`④ médias : ${envoyes} fichier(s) déposé(s), ${refus.length} refus.`);
  for (const x of refus.slice(0, 20)) console.log("   ✗ " + x);
  return refus.length === 0;
}

// ───────────────────────────── ⑤ verdict ─────────────────────────────
async function verdict(ctx) {
  const noms = Object.keys(ctx.man.tables);
  const presentes = await tablesCible(ctx);
  const q = noms.filter((t) => presentes.has(t)).map((t) => `select '${t}' t, count(*)::int n from public."${t}"`).join(" union all ");
  const comptes = new Map((q ? await sql(ctx, q) : []).map((r) => [r.t, r.n]));
  let ecarts = 0;
  console.log("\n⑤ VERDICT — table | manifeste | cible");
  for (const t of noms) {
    const att = ctx.man.tables[t].exporte, obt = comptes.has(t) ? comptes.get(t) : "ABSENTE";
    const ok = obt === att;
    if (!ok) ecarts++;
    console.log(`   ${ok ? "OK   " : "ECART"} ${t} | ${att} | ${obt}`);
  }
  if (ctx.man.comptes != null && !drapeau("--sans-comptes")) {
    let n = 0;
    for (let page = 1; ; page++) {
      const d = await (await fetch(`${ctx.url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: entetes(ctx.cle) })).json();
      n += (d.users || []).length; if ((d.users || []).length < 200) break;
    }
    const ok = n === ctx.man.comptes; if (!ok) ecarts++;
    console.log(`   ${ok ? "OK   " : "ECART"} _auth_users | ${ctx.man.comptes} | ${n}`);
  }
  if (ctx.man.medias && !drapeau("--sans-medias")) {
    const [{ n }] = await sql(ctx, "select count(*)::int n from storage.objects where metadata is not null");
    const ok = n === ctx.man.medias.fichiers; if (!ok) ecarts++;
    console.log(`   ${ok ? "OK   " : "ECART"} _storage | ${ctx.man.medias.fichiers} | ${n}`);
  }
  console.log(ecarts ? `\n❌ ${ecarts} écart(s) : la restauration n'est PAS prouvée.` : `\n✅ restauration prouvée sur ${ctx.ref} (${ctx.nom}) : chaque compte de l'archive est retrouvé sur la cible.`);
  return ecarts === 0;
}

// ───────────────────────────── purge ─────────────────────────────
async function purger(ctx) {
  const presentes = [...await tablesCible(ctx)];
  if (presentes.length) await sql(ctx, `truncate ${presentes.map((t) => `public."${t}"`).join(", ")} cascade;`);
  let supprimes = 0;
  for (;;) {
    const d = await (await fetch(`${ctx.url}/auth/v1/admin/users?page=1&per_page=200`, { headers: entetes(ctx.cle) })).json();
    const lot = d.users || []; if (!lot.length) break;
    for (const u of lot) { const r = await fetch(`${ctx.url}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: entetes(ctx.cle) }); if (r.ok) supprimes++; }
    if (lot.length < 200) break;
  }
  // Le Storage refuse un DELETE SQL direct (`storage.protect_delete`, mesuré) :
  // on lit la liste en SQL et on retire par l'API, seau par seau.
  const objets = await sql(ctx, "select bucket_id b, name from storage.objects where metadata is not null");
  const parSeau = new Map();
  for (const o of objets) { if (!parSeau.has(o.b)) parSeau.set(o.b, []); parSeau.get(o.b).push(o.name); }
  let retires = 0;
  for (const [seau, noms] of parSeau) for (let i = 0; i < noms.length; i += 100) {
    const r = await fetch(`${ctx.url}/storage/v1/object/${seau}`, { method: "DELETE", headers: entetes(ctx.cle, { "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: noms.slice(i, i + 100) }) });
    if (r.ok) retires += (await r.json()).length; else console.log(`   ✗ ${seau} : HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
  }
  console.log(`purge de ${ctx.ref} : ${presentes.length} table(s) vidée(s), ${supprimes} compte(s) supprimé(s), ${retires} objet(s) Storage retiré(s).`);
}

// ───────────────────────────── main ─────────────────────────────
module.exports = { lots, litteral, ordreInsert, ordreLigneALigne, PROD_REF, LOT_OCTETS };
if (require.main === module) (async () => {
  const ctx = await contexte();
  console.log(`cible : ${ctx.ref} (« ${ctx.nom} »)${ctx.archive ? ` ← archive ${ctx.archive}` : ""}`);
  if (drapeau("--purger")) { await purger(ctx); return; }
  if (drapeau("--verifier")) { process.exit((await verdict(ctx)) ? 0 : 1); }
  await schema(ctx);
  await comptes(ctx);
  const t = await tables(ctx);
  const m = await medias(ctx);
  const v = await verdict(ctx);
  process.exit(t && m && v ? 0 : 1);
})().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); });
