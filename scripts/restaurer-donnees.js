#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// RESTAURER UNE ARCHIVE DE SAUVEGARDE DANS UN PROJET SUPABASE — l'EXERCICE
// que `docs/RECUPERATION.md` décrivait sans l'avoir jamais fait (EXP-01,
// contre-revue Astra : « personne n'a jamais reconstruit la base de bout en
// bout »). Ce script est le chemin inverse de `sauvegarde-donnees.js`.
//
//   node scripts/restaurer-donnees.js --archive <dossier> --projet <ref>
//        [--schema <fichier.sql>] [--sans-comptes] [--sans-medias]
//        [--verifier] [--purger] [--preuve <fichier.json>]
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
const RV = require("./lib/reprise-verdicts.js");
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
// `--tables a,b,c` : ne reverser que ces tables (référentiels, réglages) —
// ni comptes ni médias. Sert à SEMER un staging vide sans données personnelles
// (`passions`, `passion_relations`, `access_policies`), SUP-04.
const TABLES_VOULUES = (() => { const v = arg("--tables"); return v ? new Set(v.split(",").map((t) => t.trim()).filter(Boolean)) : null; })();
const tablesRetenues = (noms) => TABLES_VOULUES ? noms.filter((t) => TABLES_VOULUES.has(t)) : noms;
const sansComptes = () => drapeau("--sans-comptes") || !!TABLES_VOULUES;
const sansMedias = () => drapeau("--sans-medias") || !!TABLES_VOULUES;

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

// ───────────────────────────── bilan partagé ─────────────────────────────
// ⚠️ ASTRA-46 (cinquième contre-revue, 15/09/2026) — TOUTES LES PHASES ÉCRIVENT
// ICI, ET LE VERDICT NE LIT QUE ÇA. `medias()` gardait ses refus dans un
// tableau local : un upload refusé, une limite de seau non remise donnaient
// `medias:false` au terminal, `preuve.prouvee:true` dans le JSON, et le main
// calculait ENSUITE une sortie 1 — trois résultats pour une restauration.
function bilan(ctx) { return ctx.bilan || (ctx.bilan = { refus: [], notes: [], phases: {}, limitesNonRestaurees: [] }); }

// ⚠️ ASTRA-55 / ASTRA-48 : l'index des médias et l'inventaire des propriétaires
// sont lus STRICTEMENT (forme, total, empreinte du manifeste) — jamais `{}`.
function lireIndex(ctx) {
  if (ctx._index !== undefined) return ctx._index;
  const fi = path.join(ctx.archive, "_storage_index.json");
  const texte = fs.existsSync(fi) ? fs.readFileSync(fi, "utf8") : null;
  const att = (ctx.man.medias && ctx.man.medias.index_sha256) || null;
  ctx._index = RV.lireIndexMedias(texte, att, texte === null ? null : crypto.createHash("sha256").update(texte, "utf8").digest("hex"));
  return ctx._index;
}
function lireInventaire(ctx) {
  if (ctx._inventaire !== undefined) return ctx._inventaire;
  const fp = path.join(ctx.archive, "_storage_proprietaires.json");
  const texte = fs.existsSync(fp) ? fs.readFileSync(fp, "utf8") : null;
  const att = (ctx.man.medias && ctx.man.medias.proprietaires_sha256) || null;
  ctx._inventaire = RV.lireInventaireProprietaires(texte, att, texte === null ? null : crypto.createHash("sha256").update(texte, "utf8").digest("hex"));
  return ctx._inventaire;
}
function fichiersMediasDisque(ctx) {
  const base = path.join(ctx.archive, "_storage");
  const out = [];
  if (!fs.existsSync(base)) return out;
  for (const seau of fs.readdirSync(base)) for (const rel of fichiersSous(path.join(base, seau))) {
    const buf = fs.readFileSync(path.join(base, seau, rel));
    out.push({ name: seau + "/" + rel, taille: buf.length, md5: crypto.createHash("md5").update(buf).digest("hex") });
  }
  return out;
}
// L'INTÉGRITÉ DE L'ARCHIVE, AU MOMENT DE LA RESTAURATION (ASTRA-55) : une
// vérification passée d'une archive depuis endommagée ne suffit pas. Rend
// { ok, indetermine, motif } et l'écrit au bilan ; on n'arrête pas la reprise
// des lignes pour un média manquant, mais la phase médias est en échec et le
// verdict ne peut plus être prouvé.
function integriteArchive(ctx) {
  if (!ctx.man.medias || sansMedias()) return { ok: true };
  const idx = lireIndex(ctx);
  const b = bilan(ctx);
  if (idx.erreur) {
    b.phases["intégrité de l'archive (médias)"] = { ok: false, indetermine: true, motif: idx.erreur };
    console.log("   ⚠ intégrité des médias NON vérifiable : " + idx.erreur);
    return { ok: false, indetermine: true, motif: idx.erreur };
  }
  const integ = RV.integriteArchiveMedias(idx.objets, fichiersMediasDisque(ctx));
  if (!integ.ok) {
    const motif = `archive ENDOMMAGÉE : ${integ.manquants.length} fichier(s) de l'index absent(s), ${integ.divergents.length} modifié(s), ${integ.enTrop.length} hors index` + (integ.manquants[0] ? ` (ex. ${integ.manquants[0]})` : "");
    b.phases["intégrité de l'archive (médias)"] = { ok: false, motif };
    console.log("   ✗ " + motif);
    return { ok: false, motif };
  }
  b.phases["intégrité de l'archive (médias)"] = { ok: true };
  return { ok: true };
}

// ⚠️ ASTRA-59 (sixième contre-revue, 16/09) — L'ARCHIVE SE VALIDE AVANT TOUTE
// MUTATION, ET UNE ARCHIVE INVALIDE ARRÊTE TOUT. Le précontrôle d'intégrité
// (ASTRA-55) DÉTECTAIT un fichier modifié sur disque… puis la phase médias
// l'envoyait quand même, avec `x-upsert` : index AAA, disque BAD, cible AAA →
// la cible devenait BAD avant le verdict rouge. Ici, dans l'ordre, sans avoir
// encore touché la cible :
//   ① le manifeste et, pour chaque table, le nombre de lignes NDJSON = celui
//      annoncé (un fichier tronqué ne charge pas une table à moitié) ;
//   ② l'index des médias : lisible, et chaque fichier du disque conforme
//      (taille, md5) — un fichier modifié, absent ou en trop = archive
//      ENDOMMAGÉE ; index absent (archive d'avant) = NON VÉRIFIABLE ;
//   ③ l'inventaire des propriétaires : lisible (forme, total, empreinte,
//      chaque entrée — ASTRA-58) quand le manifeste annonce qu'il existe.
// Rend { ok, bloquants, indetermine }. Le main REFUSE (code 2) sur `ok:false` ;
// « non vérifiable » ne passe qu'avec `--accepter-archive-non-verifiable`,
// jamais une corruption DÉTECTÉE. Et `medias()` garde son propre filet : elle
// ne dépose JAMAIS un fichier qui diffère de l'index (défense en profondeur,
// pour les appels de phase hors main).
function validerArchive(ctx) {
  const bloquants = [], nonVerifiables = [];
  const b = bilan(ctx);
  if (!ctx.man || typeof ctx.man !== "object") return { ok: false, bloquants: ["manifeste absent ou illisible"], indetermine: false };
  // ① tables
  for (const [t, info] of Object.entries(ctx.man.tables || {})) {
    const f = path.join(ctx.archive, t + ".ndjson");
    if (!fs.existsSync(f)) { bloquants.push(`table ${t} : fichier absent (manifeste : ${info.exporte} ligne(s))`); continue; }
    let n;
    try { n = lireNdjson(f).length; } catch (e) { bloquants.push(`table ${t} : NDJSON illisible (${String(e.message).slice(0, 60)}) — fichier tronqué ou corrompu`); continue; }
    if (n !== info.exporte) bloquants.push(`table ${t} : ${n} ligne(s) sur disque, ${info.exporte} au manifeste — fichier tronqué ou étranger`);
  }
  // ② médias
  if (ctx.man.medias && !sansMedias()) {
    const integ = integriteArchive(ctx);
    if (!integ.ok) (integ.indetermine ? nonVerifiables : bloquants).push("médias : " + integ.motif);
    // ③ propriétaires
    if (ctx.man.medias.proprietaires_lus !== null && ctx.man.medias.proprietaires_lus !== undefined) {
      const inv = lireInventaire(ctx);
      if (inv.erreur) bloquants.push("inventaire des propriétaires : " + inv.erreur);
    }
  }
  const ok = bloquants.length === 0 && nonVerifiables.length === 0;
  b.phases["validation de l'archive"] = ok ? { ok: true } : { ok: false, indetermine: bloquants.length === 0, motif: [...bloquants, ...nonVerifiables].join(" ; ") };
  return { ok, bloquants, nonVerifiables, indetermine: bloquants.length === 0 && nonVerifiables.length > 0 };
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

// ⚠️ ASTRA-31 — LIRE AUTH, OU DIRE QU'ON N'A PAS SU LIRE. `.json()` puis
// `users || []` faisait passer un HTTP 503 (corps JSON d'erreur) pour « zéro
// compte » : la purge annonçait « 0/0/0 » et sortait 0 sans qu'un seul DELETE
// soit parti. Ce lecteur VALIDE le statut ET la forme, et LÈVE sinon — il n'y a
// pas de repli « liste vide ». La pagination est tranchée par `paginationTerminee`,
// pas devinée sur place. Verrous : tests/unit/reprise-verdicts.test.mjs.
async function pageComptesAuth(ctx, page, perPage) {
  const r = await fetch(`${ctx.url}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, { headers: entetes(ctx.cle) });
  let corps = null;
  try { corps = JSON.parse(await r.text()); } catch (e) { corps = undefined; }
  return RV.pageComptes({ ok: r.ok, status: r.status, corps }, page).users;
}
async function tousLesComptesAuth(ctx, perPage) {
  const pp = perPage || 200, tout = [];
  for (let page = 1; ; page++) {
    const lot = await pageComptesAuth(ctx, page, pp);
    tout.push(...lot);
    if (RV.paginationTerminee(lot, pp)) return tout;
    if (page > 200) throw new Error("pagination Auth : plus de 200 pages — arrêt de sécurité, état INDÉTERMINÉ.");
  }
}

async function comptes(ctx) {
  const f = path.join(ctx.archive, "_auth_users.ndjson");
  if (sansComptes() || !fs.existsSync(f)) { console.log("② comptes : ignorés."); return; }
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
    // ⚠️ ASTRA-30 — LA SUSPENSION VOYAGE, SINON LA REPRISE LIBÈRE. Un compte
    // archivé avec `banned_until` dans le futur était recréé SANS sa suspension :
    // la personne exclue par la modération revenait connectable, et le verdict ne
    // comparait que des UUID, donc personne ne le voyait. On restitue la durée
    // RÉSIDUELLE (jamais la durée d'origine : restaurer « 30 jours » un mois plus
    // tard prolongerait la peine), arrondie AU-DESSUS.
    const banDuree = RV.dureeBanResiduelle(u, new Date());
    if (banDuree) corps.ban_duration = banDuree;
    const r = await fetch(`${ctx.url}/auth/v1/admin/users`, {
      method: "POST", headers: entetes(ctx.cle, { "Content-Type": "application/json" }), body: JSON.stringify(corps),
    });
    if (r.ok) {
      crees++;
      // ⚠️ ON RELIT : `ban_duration` accepté à la création n'est pas une preuve
      // qu'il a été écrit (le journal de modération seul ne rétablit pas un ban
      // GoTrue). Si la relecture dit « pas suspendu », c'est un REFUS, pas un
      // détail — et il compte dans le verdict global.
      if (banDuree) {
        const rel = await fetch(`${ctx.url}/auth/v1/admin/users/${u.id}`, { headers: entetes(ctx.cle) });
        let relu = null; try { relu = JSON.parse(await rel.text()); } catch (e) { relu = null; }
        if (!rel.ok || !relu) refus.push(`${u.id} : suspension NON RELUE (HTTP ${rel.status}) — état indéterminé`);
        else { const v = RV.suspensionRestauree(u, relu, new Date()); if (!v.ok) refus.push(`${u.id} : ${v.motif}`); }
      }
      continue;
    }
    const t = await r.text();
    if (r.status === 422 && /already|exist|registered/i.test(t)) {
      presents++;
      // ⚠️ ASTRA-47 (cinquième contre-revue) : « déjà présent » n'est pas « conforme ».
      // Un compte déjà sur la cible (rejeu, conflit) peut y être SANS sa suspension,
      // ou avec une borne expirée. On le RELIT ; si l'archive porte une suspension
      // en cours que la cible n'a pas, on la POSE (durée résiduelle) puis on relit
      // encore ; ce qui ne correspond pas à la borne attendue (tolérance GoTrue :
      // l'heure d'arrondi) est un REFUS.
      const relire = async () => { const rel = await fetch(`${ctx.url}/auth/v1/admin/users/${u.id}`, { headers: entetes(ctx.cle) }); let relu = null; try { relu = JSON.parse(await rel.text()); } catch (e) { relu = null; } return rel.ok && relu ? relu : null; };
      let relu = await relire();
      if (!relu) { refus.push(`${u.id} : déjà présent mais NON RELU — état indéterminé`); continue; }
      let v = RV.suspensionRestauree(u, relu, new Date());
      if (!v.ok && banDuree) {
        const p = await fetch(`${ctx.url}/auth/v1/admin/users/${u.id}`, { method: "PUT", headers: entetes(ctx.cle, { "Content-Type": "application/json" }), body: JSON.stringify({ ban_duration: banDuree }) });
        if (!p.ok) refus.push(`${u.id} : déjà présent, suspension NON POSÉE (HTTP ${p.status})`);
        relu = await relire();
        v = relu ? RV.suspensionRestauree(u, relu, new Date()) : { ok: false, motif: "suspension non relue après pose" };
      }
      if (!v.ok) refus.push(`${u.id} : déjà présent, ${v.motif}`);
      continue;
    }
    refus.push(`${u.id} : HTTP ${r.status} ${t.slice(0, 160)}`);
  }
  console.log(`② comptes : ${crees} créé(s), ${presents} déjà présent(s), ${refus.length} refus, sur ${users.length}.`);
  for (const x of refus) console.log("   ✗ " + x);
  const b = bilan(ctx);
  for (const x of refus) b.refus.push("comptes : " + x);
  b.phases.comptes = { ok: refus.length === 0, motif: refus.length ? refus.length + " refus (création ou suspension non relue)" : null };
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
  // ⚠️ `overriding system value` (exercice du 2026-09-15) : une colonne
  // d'identité `generated always` (`migrations_appliquees.id`) REFUSE toute
  // valeur explicite — les quatre lignes du journal tombaient, nommées dans le
  // bilan mais absentes de la cible. Sans identité, la clause est inerte.
  const c = cols.map((x) => `"${x}"`).join(", ");
  return `begin;
alter table public."${t}" disable trigger user;
insert into public."${t}" (${c}) overriding system value select ${c} from json_populate_recordset(null::public."${t}", ${litteral(json)}::json) on conflict do nothing;
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
      insert into public."${t}" (${c}) overriding system value select ${c} from json_populate_record(null::public."${t}", e) on conflict do nothing;
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
  const noms = tablesRetenues(Object.keys(ctx.man.tables));
  const ordre = [...PARENTS.filter((p) => noms.includes(p)), ...noms.filter((n) => !PARENTS.includes(n)).sort()];
  // ⚠️ ASTRA-29 : le bilan est PARTAGÉ par toutes les phases (il en portait une
  // seule). Le verdict final le lit : un refus de la phase « comptes » ne peut
  // plus être invisible dans un JSON `prouvee: true`.
  const bl = bilan(ctx);
  for (const t of ordre) {
    const avant = bl.refus.length;
    const r = await chargerTable(ctx, t, bl);
    console.log(`   ${t} : ${r.lignes} ligne(s)${bl.refus.length > avant ? " — des refus, voir le bilan" : ""}`);
  }
  // Second tour sur les tables qui ont eu des refus : une clé étrangère vers
  // un parent chargé plus tard se résout ici. Ce qui reste refusé est un vrai
  // défaut de l'archive face au schéma, et il est nommé.
  const aRejouer = [...new Set(bl.refus.filter((x) => !x.startsWith("comptes : ")).map((x) => x.split(" : ")[0]))];
  if (aRejouer.length) {
    // Seuls les refus de TABLES sont rejoués ; ceux des comptes restent.
    bl.refus = bl.refus.filter((x) => x.startsWith("comptes : "));
    for (const t of aRejouer) await chargerTable(ctx, t, bl);
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
  const refusTables = bl.refus.filter((x) => !x.startsWith("comptes : "));
  console.log(`③ tables : ${ordre.length} chargées${refusTables.length ? ", " + refusTables.length + " REFUS à lire" : ", aucun refus"}.`);
  for (const x of bl.notes) console.log("   ℹ " + x);
  for (const x of refusTables) console.log("   ✗ " + x);
  // Le bilan sort avec le verdict : la preuve JSON portait le compte par table
  // mais pas le MOTIF des refus (exercice du 2026-09-15 : `migrations_appliquees`
  // 4 | 0, détail vide — l'information était au terminal, pas dans la preuve).
  bl.phases.tables = { ok: refusTables.length === 0, motif: refusTables.length ? refusTables.length + " refus de chargement" : null };
  return refusTables.length === 0;
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
  if (sansMedias() || !fs.existsSync(base)) { console.log("④ médias : ignorés."); return true; }
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
  // ⚠️ ASTRA-18 (contre-revue Astra, 2026-09-15) : le rétablissement était
  // APRÈS la boucle, hors de tout `finally` — une exception d'upload laissait
  // tous les seaux sans limite. Il est garanti ici, borné aux seaux lus, et un
  // rétablissement refusé est un ÉCHEC nommé (la restauration ne rend pas OK).
  const retablir = async () => {
    const ratés = [];
    for (const b of limites) {
      try { await sql(ctx, `update storage.buckets set file_size_limit = ${b.file_size_limit === null ? "null" : Number(b.file_size_limit)} where id = ${litteral(b.id)}`); }
      catch (e) { ratés.push(`limite du seau ${b.id} non rétablie : ${(e && e.message) || e}`); bilan(ctx).limitesNonRestaurees.push(b.id); }
    }
    return ratés;
  };
  // ⚠️ ASTRA-59 : LE FILET DE LA PHASE. L'index (ASTRA-55) dit ce que l'archive
  // DOIT contenir ; un fichier du disque qui n'y est pas, ou qui n'a pas la
  // taille et l'empreinte annoncées, N'EST PAS DÉPOSÉ — avec `x-upsert`, il
  // remplacerait un objet sain de la cible par un octet altéré. Sans index
  // lisible, aucun dépôt (indéterminé) : la phase est en refus, pas en silence.
  const idxMedias = lireIndex(ctx);
  if (idxMedias.erreur) {
    refus.push(`index des médias : ${idxMedias.erreur} — aucun fichier n'est déposé (on ne remplace pas la cible par un contenu non vérifiable)`);
  }
  try {
  for (const seau of fs.readdirSync(base)) {
    if (idxMedias.erreur) break;
    if (!existants.has(seau)) {
      const r = await fetch(`${ctx.url}/storage/v1/bucket`, { method: "POST", headers: entetes(ctx.cle, { "Content-Type": "application/json" }),
        body: JSON.stringify({ id: seau, name: seau, public: SEAUX_PUBLICS.has(seau) }) });
      if (!r.ok) { refus.push(`seau ${seau} : HTTP ${r.status} ${(await r.text()).slice(0, 120)}`); continue; }
      console.log(`   seau ${seau} créé (${SEAUX_PUBLICS.has(seau) ? "public" : "privé"})`);
    }
    for (const rel of fichiersSous(path.join(base, seau))) {
      const buf = fs.readFileSync(path.join(base, seau, rel));
      const attendu = idxMedias.objets[seau + "/" + rel];
      if (!attendu) { refus.push(`${seau}/${rel} : hors index — NON déposé`); continue; }
      const md5 = crypto.createHash("md5").update(buf).digest("hex");
      if (Number(attendu.taille) !== buf.length || String(attendu.md5).toLowerCase() !== md5) {
        refus.push(`${seau}/${rel} : diffère de l'index (taille ${buf.length} vs ${attendu.taille}, md5 ${md5.slice(0, 8)}… vs ${String(attendu.md5).slice(0, 8)}…) — NON déposé, la cible n'est pas écrasée`);
        continue;
      }
      const ext = path.extname(rel).slice(1).toLowerCase();
      const r = await fetch(`${ctx.url}/storage/v1/object/${seau}/${rel.split("/").map(encodeURIComponent).join("/")}`, {
        method: "POST", headers: entetes(ctx.cle, { "Content-Type": MIME[ext] || "application/octet-stream", "x-upsert": "true" }), body: buf,
      });
      if (r.ok) envoyes++; else refus.push(`${seau}/${rel} : HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
    }
  }
  // ⚠️ ASTRA-26 — RENDRE LE PROPRIÉTAIRE, SINON LA REPRISE REND DES ORPHELINS.
  // Les objets viennent d'être envoyés sous `service_role` : leur `owner` est
  // donc celui du service, pas celui de la personne. Conséquences mesurées dans
  // la migration du 15/09 : `objets_stockage_du_compte(uid)` — l'autorité de
  // purge de `delete-account` — ne retrouve plus les PIÈCES JOINTES (rangées par
  // conversation, qu'aucun chemin ne rattache à un compte), et les policies
  // d'écriture de `storage.objects`, qui comparent `owner` à `auth.uid()`,
  // rendent l'objet ingérable par celui qui l'a déposé.
  // On écrit la colonne DOCUMENTÉE de la propriété, par le même canal privilégié
  // que le reste de la reprise — jamais en déduisant le propriétaire d'une URL
  // ou d'un texte de message (faute d'ASTRA-12).
  const inv = lireInventaire(ctx);
  if (inv.erreur) {
    // ⚠️ « Pas de fichier », fichier tronqué, empreinte étrangère : ce n'est
    // JAMAIS « pas de propriétaire à rendre » (ASTRA-48 : `catch → {}` faisait
    // d'un fichier tronqué un inventaire vide et conforme). État INDÉTERMINÉ.
    bilan(ctx).phases["propriétaires Storage"] = { ok: false, indetermine: true, motif: "inventaire des propriétaires : " + inv.erreur + " — les objets restent la propriété de service_role" };
    console.log("   ✗ propriétaires Storage : " + inv.erreur + " — les objets restaurés n'auront pas de propriétaire (purge par compte et édition cassées).");
  } else {
    let rendus = 0, inconnus = 0, echouesProp = 0;
    const table = inv.objets;
    // ⚠️ ASTRA-45 : chaque objet ARCHIVÉ doit être relevé par l'inventaire. Un
    // objet non relevé est un refus nommé, pas un silence.
    const idx = lireIndex(ctx);
    if (!idx.erreur) {
      const c = RV.couvertureProprietaires(Object.keys(idx.objets), table);
      if (!c.ok) refus.push(`propriétaires : ${c.nonReleves.length} objet(s) archivé(s) NON RELEVÉ(S) par l'inventaire (ex. ${c.nonReleves[0]})`);
    }
    const parProprietaire = new Map();
    for (const [cle, p] of Object.entries(table)) {
      // ⚠️ ASTRA-58 : UN NUL EXPLICITE SE RESTAURE AUSSI. L'objet a été déposé
      // par service_role, ou avant le suivi : la base portait NULL, et l'archive
      // le dit (`owner:null, owner_id:null`, les deux champs présents). Ne pas
      // l'écrire laissait la cible à qui l'avait (B, ou le service qui vient de
      // déposer) — et le verdict passait. On n'INVENTE toujours rien : on écrit
      // ce que l'archive porte, NULL compris. (`{}`/`null` ne passent pas
      // `lireInventaire` : indéterminé.)
      const nul = !p.owner && !p.owner_id;
      if (nul) inconnus++;
      const k = (p.owner || "") + "|" + (p.owner_id || "");
      if (!parProprietaire.has(k)) parProprietaire.set(k, { owner: p.owner || null, owner_id: p.owner_id || null, cles: [] });
      parProprietaire.get(k).cles.push(cle);
    }
    // Un UPDATE par propriétaire, par lots : la reprise fait déjà ses écritures
    // par l'API de gestion, on n'ouvre pas un canal de plus.
    for (const { owner, owner_id, cles } of parProprietaire.values()) {
      for (let i = 0; i < cles.length; i += 200) {
        const lot = cles.slice(i, i + 200);
        const paires = lot.map((c) => { const j = c.indexOf("/"); return { b: c.slice(0, j), n: c.slice(j + 1) }; })
          .map((x) => `(${litteral(x.b)}, ${litteral(x.n)})`).join(", ");
        try {
          await sql(ctx, `update storage.objects o set owner = ${owner ? litteral(owner) + "::uuid" : "null"}, owner_id = ${owner_id ? litteral(owner_id) : "null"}
                          where (o.bucket_id, o.name) in (${paires});`);
          rendus += lot.length;
        } catch (e) { echouesProp += lot.length; refus.push(`propriétaires (${lot.length} objet(s)) : ${String(e.message).slice(0, 140)}`); }
      }
    }
    console.log(`   propriétaires Storage : ${rendus} rendu(s)${inconnus ? `, ${inconnus} sans propriétaire dans l'archive (NULL rendu explicitement)` : ""}${echouesProp ? `, ${echouesProp} EN ÉCHEC` : ""}.`);
    bilan(ctx).phases["propriétaires Storage"] = echouesProp
      ? { ok: false, motif: echouesProp + " objet(s) sans propriétaire rendu" }
      : { ok: true };
    if (inconnus) bilan(ctx).notes.push(`${inconnus} objet(s) sans propriétaire dans l'archive : déposés par service_role ou avant le suivi — NULL rendu, aucun n'est inventé`);
  }
  } finally {
    for (const x of await retablir()) refus.push(x);
  }
  console.log(`④ médias : ${envoyes} fichier(s) déposé(s), ${refus.length} refus.`);
  for (const x of refus.slice(0, 20)) console.log("   ✗ " + x);
  // ⚠️ ASTRA-46 : les refus de CETTE phase entrent dans le bilan partagé, que le
  // verdict lit — JSON, affichage et code de sortie suivent le même résultat.
  const b = bilan(ctx);
  for (const x of refus) b.refus.push("médias : " + x);
  b.phases.medias = { ok: refus.length === 0, motif: refus.length ? refus.length + " refus (upload, seau, limite ou propriétaires)" : null };
  return refus.length === 0;
}

// ───────────────────────────── ⑤ verdict ─────────────────────────────
// ⚠️ ASTRA-16 (contre-revue Astra, 2026-09-15) : « mêmes quantités » n'est
// pas « mêmes données ». Le verdict comptait les lignes, les comptes et les
// objets : huit AUTRES comptes, un contenu différent, un objet vide de même
// nom passaient pour une restauration prouvée — et `on conflict do nothing`
// laisse en place une ligne divergente sans rien dire. On compare désormais :
//   · les LIGNES : clé par clé (le tri du manifeste = la clé primaire), et le
//     CONTENU de chaque ligne, relu par PostgREST — la même sérialisation que
//     l'export — et canonisé (clés triées) ;
//   · les COMPTES : les identifiants de l'archive, pas leur nombre ;
//   · les MÉDIAS : nom, taille et empreinte (le `eTag` du Storage est le md5
//     d'un dépôt en une passe) contre le fichier de l'archive.
// Les deux fonctions de comparaison sont PURES et éprouvées dans
// tests/unit/restaurer-donnees.test.mjs.
function canoniser(v) {
  if (Array.isArray(v)) return v.map(canoniser);
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v).sort()) o[k] = canoniser(v[k]); return o; }
  return v;
}
function cleDe(ligne, tri) { return tri.split(",").map((c) => String(ligne[c.trim()])).join("\u0001"); }
/** Compare deux jeux de lignes par clé et par contenu. Rend { manquantes, divergentes, enTrop }. */
function comparerLignes(archive, cible, tri) {
  const a = new Map(), c = new Map();
  for (const l of archive || []) a.set(cleDe(l, tri), JSON.stringify(canoniser(l)));
  // Une colonne ajoutée à la cible APRÈS l'archive (migration, colonne
  // calculée) n'est pas une divergence : on compare la cible sur les colonnes
  // que l'archive porte. Une colonne de l'archive absente de la cible, si.
  const colonnes = new Set(); for (const l of archive || []) for (const k of Object.keys(l)) colonnes.add(k);
  for (const l of cible || []) { const r = {}; for (const k of colonnes) if (k in l) r[k] = l[k]; c.set(cleDe(l, tri), JSON.stringify(canoniser(r))); }
  const manquantes = [], divergentes = [], enTrop = [];
  for (const [k, v] of a) { if (!c.has(k)) manquantes.push(k); else if (c.get(k) !== v) divergentes.push(k); }
  for (const k of c.keys()) if (!a.has(k)) enTrop.push(k);
  return { manquantes, divergentes, enTrop };
}
/** Compare les médias de l'archive aux objets de la cible ({ name, taille, etag }).
 *
 * ⚠️ ASTRA-29 — « JE N'AI RIEN PU COMPARER » N'EST PAS « C'EST CONFORME ».
 * L'ancienne version rendait `etagOk = true` dès que l'eTag était absent, que
 * l'empreinte manquait dans l'archive, ou que l'eTag venait d'un envoi MULTIPART
 * (« <hex>-<n> », objets > 5 Mo : ce n'est pas le MD5). Combinée à une taille
 * elle aussi absente, elle acceptait un objet SANS avoir comparé quoi que ce
 * soit — et `divergents` restait vide. Deux fichiers de même taille et de
 * contenu différent passaient donc pour identiques.
 * La décision vit désormais dans `scripts/lib/reprise-verdicts.js` : un
 * troisième état, `nonVerifies`, qui BLOQUE le verdict au lieu de le verdir.
 * `--hash-medias` relit et hache les objets concernés : l'empreinte de secours
 * tranche, y compris sur un multipart.
 */
function comparerMedias(fichiers, objets, options) { return RV.comparerMedias(fichiers, objets, options); }

async function lignesCible(ctx, t, tri) {
  const out = [];
  for (let debut = 0; ; debut += 1000) {
    const r = await fetch(`${ctx.url}/rest/v1/${t}?select=*&order=${encodeURIComponent(tri)}&limit=1000&offset=${debut}`, { headers: entetes(ctx.cle) });
    if (!r.ok) throw new Error(`${t} : relecture HTTP ${r.status}`);
    const l = await r.json(); out.push(...l);
    if (l.length < 1000) return out;
  }
}
async function verdict(ctx) {
  // --preuve <fichier> : le verdict détaillé, écrit en JSON — la preuve DURABLE
  // que la contre-revue réclamait (commande, cible, résultats par table).
  const preuve = { genere_le: new Date().toISOString(), cible: ctx.ref, nom: ctx.nom, archive: ctx.archive, manifeste_genere_le: ctx.man.genere_le, commande: process.argv.slice(2).join(" "), tables: [], comptes: null, medias: null, refus: (ctx.bilan && ctx.bilan.refus) || [], notes: (ctx.bilan && ctx.bilan.notes) || [] };
  const noms = tablesRetenues(Object.keys(ctx.man.tables));
  const presentes = await tablesCible(ctx);
  const q = noms.filter((t) => presentes.has(t)).map((t) => `select '${t}' t, count(*)::int n from public."${t}"`).join(" union all ");
  const comptes = new Map((q ? await sql(ctx, q) : []).map((r) => [r.t, r.n]));
  let ecarts = 0, nonVerifies = 0;
  console.log("\n⑤ VERDICT — table | manifeste | cible");
  for (const t of noms) {
    const att = ctx.man.tables[t].exporte, obt = comptes.has(t) ? comptes.get(t) : "ABSENTE";
    let ok = obt === att, detail = "";
    if (ok && obt > 0) {
      // Même nombre : on compare les DONNÉES (ASTRA-16).
      const tri = ctx.man.tables[t].tri || "id";
      const d = comparerLignes(lireNdjson(path.join(ctx.archive, t + ".ndjson")), await lignesCible(ctx, t, tri), tri);
      if (d.manquantes.length || d.divergentes.length || d.enTrop.length) {
        ok = false;
        detail = ` — ${d.manquantes.length} manquante(s), ${d.divergentes.length} divergente(s), ${d.enTrop.length} en trop` + (d.divergentes.length ? ` (ex. ${d.divergentes[0]})` : "");
      } else detail = " — contenu identique";
    }
    if (!ok) ecarts++;
    preuve.tables.push({ table: t, attendu: att, obtenu: obt, ok, detail: detail.replace(/^ — /, "") });
    console.log(`   ${ok ? "OK   " : "ECART"} ${t} | ${att} | ${obt}${detail}`);
  }
  if (ctx.man.comptes != null && !sansComptes()) {
    // Les IDENTIFIANTS des comptes, pas leur nombre (ASTRA-16).
    const surLaCible = await tousLesComptesAuth(ctx, 200);
    const ids = new Set(surLaCible.map((u) => u.id));
    const parId = new Map(surLaCible.map((u) => [u.id, u]));
    const archives = lireNdjson(path.join(ctx.archive, "_auth_users.ndjson"));
    const manquants = archives.map((u) => u.id).filter((id) => !ids.has(id));
    // ⚠️ ASTRA-30 — ON COMPARE AUSSI LES ATTRIBUTS DE SÉCURITÉ, pas seulement
    // l'existence de l'UUID. Un compte présent mais DÉSUSPENDU est un écart.
    const maintenant = new Date();
    const suspensionsPerdues = [];
    for (const a of archives) {
      const o = parId.get(a.id); if (!o) continue;
      const v = RV.suspensionRestauree(a, o, maintenant);
      if (!v.ok) suspensionsPerdues.push(a.id + " : " + v.motif);
    }
    const ok = ids.size === ctx.man.comptes && manquants.length === 0 && suspensionsPerdues.length === 0; if (!ok) ecarts++;
    preuve.comptes = { attendu: ctx.man.comptes, obtenu: ids.size, identifiants_absents: manquants.length, suspensions_perdues: suspensionsPerdues.length, noms: { suspensions_perdues: suspensionsPerdues.slice(0, 50) }, ok };
    console.log(`   ${ok ? "OK   " : "ECART"} _auth_users | ${ctx.man.comptes} | ${ids.size}${manquants.length ? ` — ${manquants.length} identifiant(s) de l'archive absent(s)` : " — mêmes identifiants"}${suspensionsPerdues.length ? ` — ${suspensionsPerdues.length} SUSPENSION(S) PERDUE(S)` : ""}`);
  }
  if (ctx.man.medias && !sansMedias()) {
    // Nom, taille et empreinte de chaque média (ASTRA-16).
    // ⚠️ ASTRA-55 : l'ensemble ATTENDU est l'INDEX de l'archive, jamais les
    // fichiers encore présents sur disque ; l'intégrité du disque est
    // confrontée à l'index ; et `en_trop` entre dans `ok`.
    const objets = (await sql(ctx, "select bucket_id || '/' || name as name, metadata->>'size' as taille, metadata->>'eTag' as etag from storage.objects where metadata is not null"));
    const idx = lireIndex(ctx);
    const v = RV.verdictMedias({ index: idx.erreur ? null : idx.objets, fichiersDisque: fichiersMediasDisque(ctx), objets, attenduManifeste: ctx.man.medias.fichiers });
    if (v.indetermine) {
      ecarts++;
      preuve.medias = { ok: false, indetermine: true, motif: (idx.erreur ? "index : " + idx.erreur + " — " : "") + v.motif, obtenu: objets.length };
      console.log(`   ECART _storage | attendu NON VÉRIFIABLE (${idx.erreur || v.motif}) | ${objets.length} — état INDÉTERMINÉ`);
    } else {
      const ok = v.ok; if (!ok) ecarts++;
      nonVerifies += v.nonVerifies.length;
      // Les NOMS des objets manquants, divergents ou en trop (bornés) : un compte
      // seul ne dit pas quoi regarder (exercice du 2026-09-15 : « 2 divergents »).
      preuve.medias = { attendu: v.attendus, attendu_manifeste: ctx.man.medias.fichiers, obtenu: objets.length, manquants: v.manquants.length, divergents: v.divergents.length, non_verifies: v.nonVerifies.length, en_trop: v.enTrop.length,
        archive_intacte: v.integrite.ok, archive: { manquants: v.integrite.manquants.length, modifies: v.integrite.divergents.length, hors_index: v.integrite.enTrop.length }, ok,
        noms: { manquants: v.manquants.slice(0, 50), divergents: v.divergents.slice(0, 50), non_verifies: v.nonVerifies.slice(0, 50), en_trop: v.enTrop.slice(0, 50), archive_manquants: v.integrite.manquants.slice(0, 50) } };
      console.log(`   ${ok ? "OK   " : "ECART"} _storage | ${v.attendus} | ${objets.length} — ${v.manquants.length} manquant(s), ${v.divergents.length} divergent(s), ${v.nonVerifies.length} NON VÉRIFIÉ(S), ${v.enTrop.length} en trop${v.integrite.ok ? "" : ` — ARCHIVE ENDOMMAGÉE (${v.integrite.manquants.length} absent(s), ${v.integrite.divergents.length} modifié(s))`}`);
      for (const nv of v.nonVerifies.slice(0, 10)) console.log(`      ? ${nv.name} — ${nv.raison}`);
    }
  }
  // ⚠️ ASTRA-26 — ON RELIT LES PROPRIÉTAIRES. Les avoir ÉCRITS n'est pas les
  // avoir RENDUS : c'est la règle déjà posée pour la suspension (ASTRA-30) et
  // pour le journal des migrations. Un objet dont le propriétaire n'est pas
  // celui de l'archive est un ÉCART — la purge par compte et l'édition en
  // dépendent.
  const inv2 = !sansMedias() && ctx.man.medias ? lireInventaire(ctx) : { erreur: "sans médias" };
  if (!sansMedias() && ctx.man.medias && inv2.erreur) {
    // ⚠️ ASTRA-48 : illisible, tronqué, étranger ou absent → INDÉTERMINÉ, jamais « vide et conforme ».
    ecarts++;
    preuve.proprietaires = { ok: false, indetermine: true, motif: "inventaire des propriétaires : " + inv2.erreur };
    console.log("   ECART _storage.owner | inventaire : " + inv2.erreur + " — état INDÉTERMINÉ");
  } else if (!sansMedias() && ctx.man.medias) {
    const attendus = inv2.objets;
    // ⚠️ ASTRA-45 : la couverture, objet par objet — un objet archivé que
    // l'inventaire ne relève pas est un écart nommé.
    const idx2 = lireIndex(ctx);
    const couv = idx2.erreur ? null : RV.couvertureProprietaires(Object.keys(idx2.objets), attendus);
    const relus = new Map();
    let illisible = false;
    try {
      for (const l of await sql(ctx, "select bucket_id || '/' || name as cle, owner::text as owner, owner_id from storage.objects where metadata is not null")) {
        relus.set(l.cle, { owner: l.owner || null, owner_id: l.owner_id || null });
      }
    } catch (e) { illisible = true; }
    if (illisible) {
      ecarts++;
      preuve.proprietaires = { ok: false, motif: "relecture impossible — état INDÉTERMINÉ" };
      console.log("   ECART _storage.owner | relecture impossible : état INDÉTERMINÉ");
    } else {
      // ⚠️ ASTRA-58 : la comparaison est celle de la bibliothèque (verrouillée
      // par tests/unit/reprise-verdicts.test.mjs) — champ par champ, NULL
      // explicite COMPRIS : un objet archivé sans propriétaire dont la cible
      // appartient à B est un ÉCART, pas un « fait compté à part ».
      const cmp = RV.comparerProprietaires(attendus, relus);
      const { divergents, absents, conformes, sansProprietaire } = cmp;
      const nonReleves = couv ? couv.nonReleves : [];
      const okProp = divergents.length === 0 && absents.length === 0 && nonReleves.length === 0 && couv !== null; if (!okProp) ecarts++;
      preuve.proprietaires = { attendus: Object.keys(attendus).length, conformes, sans_proprietaire_dans_l_archive: sansProprietaire,
        divergents: divergents.length, absents: absents.length, non_releves: couv ? nonReleves.length : null, couverture_verifiable: couv !== null, ok: okProp,
        noms: { divergents: divergents.slice(0, 50), absents: absents.slice(0, 50), non_releves: nonReleves.slice(0, 50) } };
      console.log(`   ${okProp ? "OK   " : "ECART"} _storage.owner | ${conformes} conforme(s), ${sansProprietaire} sans propriétaire dans l'archive, ${divergents.length} divergent(s), ${absents.length} absent(s), ${couv ? nonReleves.length + " non relevé(s)" : "couverture NON VÉRIFIABLE (sans index)"}`);
    }
  }

  // ⚠️ ASTRA-29 (second volet) — UN SEUL VERDICT, ET IL COUVRE TOUT.
  // `prouvee = ecarts === 0` ne regardait ni les refus des phases précédentes,
  // ni les éléments non vérifiés, ni les limites Storage non restaurées. Un
  // JSON `prouvee: true` pouvait donc être écrit par un processus qui sortait
  // en code 1 — personne ne doit plus recevoir ça.
  const g = RV.verdictGlobalReprise({
    ecarts, nonVerifies,
    refus: (ctx.bilan && ctx.bilan.refus) || [],
    phases: (ctx.bilan && ctx.bilan.phases) || {},
    limitesNonRestaurees: (ctx.bilan && ctx.bilan.limitesNonRestaurees) || [],
  });
  preuve.ecarts = ecarts; preuve.non_verifies = nonVerifies; preuve.bloquants = g.bloquants; preuve.prouvee = g.prouvee;
  const fichierPreuve = arg("--preuve");
  if (fichierPreuve) { fs.writeFileSync(fichierPreuve, JSON.stringify(preuve, null, 2) + "\n"); console.log(`   preuve écrite : ${fichierPreuve}`); }
  if (g.prouvee) console.log(`\n✅ restauration prouvée sur ${ctx.ref} (${ctx.nom}) : lignes, comptes et médias de l'archive retrouvés à l'identique sur la cible.`);
  else { console.log(`\n❌ la restauration n'est PAS prouvée :`); for (const b of g.bloquants) console.log("   · " + b); }
  return g.prouvee;
}

// ───────────────────────────── purge ─────────────────────────────
// ⚠️ ASTRA-17 (contre-revue Astra, 2026-09-15) : une suppression refusée
// (HTTP 500 sur un compte ou un objet) laissait la purge « terminer
// normalement ». Chaque refus est compté, puis on RELIT — tables, comptes,
// objets — et tout reste est un échec (code 1). Une copie de données
// personnelles qui reste sur le staging n'est pas une purge.
async function purger(ctx) {
  const refus = [];
  const presentes = [...await tablesCible(ctx)];
  if (presentes.length) await sql(ctx, `truncate ${presentes.map((t) => `public."${t}"`).join(", ")} cascade;`);
  let supprimes = 0;
  for (;;) {
    // ⚠️ ASTRA-31 : un refus d'Auth LÈVE, il ne rend plus « zéro compte ».
    const lot = await pageComptesAuth(ctx, 1, 200); if (!lot.length) break;
    for (const u of lot) { const r = await fetch(`${ctx.url}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: entetes(ctx.cle) }); if (r.ok) supprimes++; else refus.push(`compte ${u.id} : HTTP ${r.status}`); }
    // Une page entière refusée : on ne boucle pas sur le même refus.
    if (lot.length < 200 || lot.every((u) => refus.some((x) => x.startsWith("compte " + u.id)))) break;
  }
  // Le Storage refuse un DELETE SQL direct (`storage.protect_delete`, mesuré) :
  // on lit la liste en SQL et on retire par l'API, seau par seau.
  const objets = await sql(ctx, "select bucket_id b, name from storage.objects where metadata is not null");
  const parSeau = new Map();
  for (const o of objets) { if (!parSeau.has(o.b)) parSeau.set(o.b, []); parSeau.get(o.b).push(o.name); }
  let retires = 0;
  for (const [seau, noms] of parSeau) for (let i = 0; i < noms.length; i += 100) {
    const r = await fetch(`${ctx.url}/storage/v1/object/${seau}`, { method: "DELETE", headers: entetes(ctx.cle, { "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: noms.slice(i, i + 100) }) });
    if (r.ok) retires += (await r.json()).length; else { const m = `${seau} : HTTP ${r.status} ${(await r.text()).slice(0, 120)}`; console.log("   ✗ " + m); refus.push(m); }
  }
  console.log(`purge de ${ctx.ref} : ${presentes.length} table(s) vidée(s), ${supprimes} compte(s) supprimé(s), ${retires} objet(s) Storage retiré(s)${refus.length ? `, ${refus.length} REFUS` : ""}.`);
  // Relecture indépendante : ce qui reste est nommé, et c'est un échec.
  const restes = [];
  if (presentes.length) for (const r of await sql(ctx, presentes.map((t) => `select '${t}' t, count(*)::int n from public."${t}"`).join(" union all "))) if (r.n) restes.push(`${r.t}=${r.n}`);
  // La relecture aussi : « je n'ai pas pu lire » n'est pas « il ne reste rien ».
  if ((await pageComptesAuth(ctx, 1, 1)).length) restes.push("comptes>0");
  const [{ n }] = await sql(ctx, "select count(*)::int n from storage.objects where metadata is not null");
  if (n) restes.push(`objets=${n}`);
  if (refus.length || restes.length) { console.log(`❌ purge INCOMPLÈTE — refus : ${refus.length}, restes : ${restes.join(" ") || "aucun"}`); process.exitCode = 1; }
  else console.log("✅ purge relue : 0 ligne, 0 compte, 0 objet.");
}

// ───────────────────────────── main ─────────────────────────────
// `_phases` : les VRAIES fonctions de phase, pour les tests d'intégration
// (tests/unit/restaurer-phases.test.mjs) qui les exercent avec un faux `fetch`
// — seules les interfaces EXTERNES (GoTrue, Storage, API de gestion) sont doublées.
module.exports = { lots, litteral, ordreInsert, ordreLigneALigne, canoniser, comparerLignes, comparerMedias, PROD_REF, LOT_OCTETS,
  _phases: { comptes, tables, medias, verdict, integriteArchive, validerArchive, bilan, lireIndex, lireInventaire } };
if (require.main === module) (async () => {
  const ctx = await contexte();
  console.log(`cible : ${ctx.ref} (« ${ctx.nom} »)${ctx.archive ? ` ← archive ${ctx.archive}` : ""}`);
  if (drapeau("--purger")) { await purger(ctx); return; }
  // ⚠️ ASTRA-59 : L'ARCHIVE SE VALIDE AVANT TOUTE MUTATION (tables, index et
  // fichiers, inventaire). Invalide → code 2, la cible n'a pas été touchée.
  // --verifier ne mute rien : on laisse le verdict dire l'écart.
  const val = validerArchive(ctx);
  if (!val.ok) {
    console.log(`⓪ validation de l'archive : ${val.indetermine ? "NON VÉRIFIABLE" : "INVALIDE"}`);
    for (const x of [...val.bloquants, ...val.nonVerifiables]) console.log("   ✗ " + x);
  } else console.log("⓪ validation de l'archive : conforme au manifeste (tables, médias, propriétaires).");
  if (drapeau("--verifier")) { process.exit((await verdict(ctx)) ? 0 : 1); }
  if (!val.ok && !(val.indetermine && drapeau("--accepter-archive-non-verifiable"))) {
    echec(val.indetermine
      ? "archive NON VÉRIFIABLE : rien n'a été écrit sur la cible. Refaire la sauvegarde (index des médias), ou passer --accepter-archive-non-verifiable en connaissance de cause."
      : "archive INVALIDE : rien n'a été écrit sur la cible. Cette archive ne doit pas servir à une restauration.");
  }
  await schema(ctx);
  await comptes(ctx);
  const t = await tables(ctx);
  const m = await medias(ctx);
  const v = await verdict(ctx);
  // ⚠️ ASTRA-46 : UN SEUL RÉSULTAT. Le verdict lit le bilan de toutes les phases ;
  // si une phase disait faux alors que le verdict dit prouvé, c'est une
  // incohérence interne — on la NOMME et on sort en échec plutôt que de choisir.
  if (v && !(t && m)) { console.log("❌ incohérence interne : une phase a échoué (tables " + t + ", médias " + m + ") mais le verdict était prouvé — sortie en échec."); process.exit(1); }
  process.exit(v ? 0 : 1);
})().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); });
