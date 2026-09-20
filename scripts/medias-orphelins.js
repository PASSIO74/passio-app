// ═══════════════════════════════════════════════════════════════════════════
// MÉDIAS ORPHELINS — ce que plus aucune ligne ne référence (2026-09-20)
//
// MESURE QUI MOTIVE L'OUTIL (canal ① d'ADR-012, production, 2026-09-20) :
//
//   seau `content` ....... 24 orphelins / 60 objets ....... 50 Mo sur 70
//   seau `attachments` .... 7 orphelins / 12 objets ...... 3,5 Mo sur 10
//                                                          ──────────────
//                                          53,5 Mo sur 80 Mo = 67 %
//
// Le forfait Supabase gratuit donne **1 Go de stockage**, et c'est le plafond
// le PLUS PROCHE du produit — bien avant le CPU, la base (500 Mo, remplie à
// 14 %) ou les 50 000 MAU. À 8 Mo par compte mesurés, on butait vers 125
// comptes ; purger ces 53,5 Mo fait passer le stockage de 80 à 26,5 Mo et
// multiplie la marge par trois.
//
// ⚠️ UN ORPHELIN EST UNE ABSENCE DE PREUVE, PAS UNE PREUVE D'ABSENCE.
// C'est tout le danger de cet outil, et ce qui dicte ses gardes : un objet est
// déclaré orphelin parce qu'on n'a trouvé son nom NULLE PART. Toute source de
// référence qu'on oublie de lire, ou qu'on lit mal, FABRIQUE des orphelins —
// et ici « orphelin » veut dire « supprimé ». La première mesure de ce lot
// annonçait 62 Mo ; elle ne lisait pas `user_state`, le blob qui porte les
// publications perso de chaque compte. Six objets (12 Mo) y étaient référencés.
// **Une mesure spectaculaire se re-vérifie avant d'y croire.**
//
// D'où QUATRE gardes, dont trois sont mécaniques :
//
//   ① RAPPORT PAR DÉFAUT. `--appliquer` est le seul chemin qui supprime.
//   ② ÂGE MINIMUM (30 j). Un média fraîchement déposé n'a pas encore sa ligne :
//      l'upload précède l'INSERT du post de quelques centaines de millisecondes,
//      et une publication hors ligne peut attendre des heures dans sa file.
//      Sans ce seuil, l'outil supprimerait ce que l'utilisateur vient d'envoyer.
//   ③ FAIL-CLOSED SUR LES RÉFÉRENCES. Si UNE des cinq sources ne répond pas,
//      on n'efface RIEN — on ne réduit pas la liste, on refuse. Une lecture
//      partielle ne rend pas « quelques orphelins de moins », elle rend « des
//      objets vivants classés orphelins ».
//   ④ PLAFOND PAR EXÉCUTION. Au-delà, on s'arrête et on le dit : un chiffre
//      inattendu est un signal, pas une quantité de travail.
//
// ⚠️ LES CINQ SOURCES DE RÉFÉRENCE, ET POURQUOI CHACUNE EST LÀ :
//   posts.media_url / shared_data / overlays ... publications serveur
//   profiles.avatar_url / cover_url / passions . avatars, couvertures, passions
//   stories.media_url / overlays ............... stories
//   conv_messages.content ...................... pièces jointes de messagerie
//   user_state.data ............................ **les publications PERSO**, qui
//       ne vivent que dans ce blob JSON — c'est la source qu'on oublie, et elle
//       porte à elle seule 12 Mo de médias bien vivants.
//
// ⚠️ ON COMPARE LE NOM DE FICHIER, ET LA RAISON N'EST PAS CELLE QUE J'AI
// D'ABORD ÉCRITE. Ma première rédaction disait « comparer l'URL entière
// classerait orphelin tout média publié avant le CDN » — c'est FAUX, et la
// réinjection l'a prouvé : le chemin de l'objet (`videos/u1/reel_x.mp4`) est
// une sous-chaîne de l'URL Supabase COMME de l'URL CDN, donc la comparaison
// sur le chemin entier aurait marché aussi. Le cas de test qui prétendait le
// mesurer restait vert sous la mutation. **Une justification qu'une mutation
// dément est pire qu'un oubli : elle décourage de regarder.**
//
// La VRAIE raison est le SENS DE L'ERREUR. Comparer le seul nom de fichier
// est plus PERMISSIF : toute référence qui porte ce nom, sous n'importe quelle
// forme — URL Supabase, URL CDN, miniature `render/image`, chemin ré-encodé,
// nom seul dans un `overlays` — fait classer l'objet « référencé ». Les rares
// faux positifs vont donc tous dans le sens « on garde », jamais « on
// supprime ». Le nom porte un aléa de 9 caractères : une collision qui
// sauverait un objet par erreur est improbable, et sans conséquence. Comparer
// le chemin entier serait plus strict, donc plus destructeur au premier format
// d'URL qu'on n'aurait pas prévu.
//
// ⚠️ SUPABASE INTERDIT LE `DELETE` SQL SUR `storage.objects` (trigger
// `storage.protect_delete`) : la suppression passe par l'API Storage, comme
// dans `purge-e2e-storage.js`.
//
//   npm run medias:orphelins                 (rapport seul, ne supprime rien)
//   npm run medias:orphelins -- --appliquer  (supprime, avec les quatre gardes)
//   npm run medias:orphelins -- --age 90     (durcit le seuil d'âge)
// ═══════════════════════════════════════════════════════════════════════════
"use strict";

const { configAdmin } = require("../tests/e2e/compte-e2e.js");

const SEAUX = ["content", "attachments"];
const AGE_MIN_JOURS = 30;
const PLAFOND_SUPPRESSIONS = 200;

/**
 * Les cinq sources de référence. `colonnes` est ce que PostgREST doit rendre ;
 * chacune est concaténée telle quelle, on ne cherche qu'une sous-chaîne.
 * ⚠️ Ajouter une colonne qui peut porter une URL de média ICI, et nulle part
 * ailleurs : une source oubliée fabrique des orphelins, donc des suppressions.
 */
const SOURCES = [
  { table: "posts", colonnes: "media_url,shared_data,overlays" },
  { table: "profiles", colonnes: "avatar_url,cover_url,passions" },
  { table: "stories", colonnes: "media_url,overlays" },
  { table: "conv_messages", colonnes: "content" },
  { table: "user_state", colonnes: "data" },
];

/**
 * ⚠️ CŒUR PUR — c'est lui que le banc éprouve, sans réseau ni base.
 * Rend { orphelins, gardes } : un objet n'est orphelin QUE si son nom de
 * fichier n'apparaît dans aucune référence ET qu'il a passé le seuil d'âge.
 *
 * @param {{name:string,size:number,created_at:string}[]} objets
 * @param {string} referencesTexte  toutes les références, concaténées
 * @param {{maintenant:number, ageMinJours:number}} opts
 */
function classerOrphelins(objets, referencesTexte, opts = {}) {
  const maintenant = opts.maintenant || Date.now();
  const ageMin = (opts.ageMinJours == null ? AGE_MIN_JOURS : opts.ageMinJours) * 86400000;
  const hay = String(referencesTexte || "");
  const orphelins = [];
  const tropJeunes = [];
  const references = [];
  for (const o of objets || []) {
    const fichier = String(o.name || "").replace(/^.*\//, "");
    // ⚠️ Un nom VIDE ne se cherche pas : `hay.includes("")` rend toujours true,
    // donc l'objet serait classé « référencé » — la garde échouerait du bon
    // côté ici, mais par accident. On le range explicitement en « référencé »
    // pour que rien d'anonyme ne parte jamais à la suppression.
    if (!fichier) { references.push(o); continue; }
    if (hay.includes(fichier)) { references.push(o); continue; }
    const age = maintenant - Date.parse(o.created_at || 0);
    if (!(age >= ageMin)) { tropJeunes.push(o); continue; }
    orphelins.push(o);
  }
  return { orphelins, tropJeunes, references };
}

const entetes = (cle, extra = {}) => ({ apikey: cle, Authorization: `Bearer ${cle}`, ...extra });
const mo = (o) => (o / 1024 / 1024).toFixed(2) + " Mo";

/** Liste RÉCURSIVE d'un seau : l'API Storage ne rend qu'un niveau à la fois. */
async function lister(cfg, seau, prefixe = "") {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const r = await fetch(`${cfg.url}/storage/v1/object/list/${seau}`, {
      method: "POST",
      headers: entetes(cfg.cle, { "Content-Type": "application/json" }),
      body: JSON.stringify({ prefix: prefixe, limit: 100, offset }),
    });
    if (!r.ok) throw new Error(`liste ${seau}/${prefixe} : HTTP ${r.status}`);
    const lot = await r.json();
    for (const e of lot) {
      const chemin = prefixe ? `${prefixe}/${e.name}` : e.name;
      // Un « dossier » n'a pas de métadonnées : on descend dedans.
      if (!e.metadata) out.push(...(await lister(cfg, seau, chemin)));
      else out.push({ name: chemin, size: Number(e.metadata.size) || 0, created_at: e.created_at });
    }
    if (lot.length < 100) break;
  }
  return out;
}

/**
 * ⚠️ FAIL-CLOSED : la moindre source illisible fait LEVER. Rendre une liste
 * partielle transformerait des médias vivants en orphelins — et l'outil
 * supprime. Mieux vaut ne rien dire que dire faux.
 */
async function referencesCompletes(cfg) {
  const morceaux = [];
  for (const src of SOURCES) {
    for (let offset = 0; ; offset += 1000) {
      const u = `${cfg.url}/rest/v1/${src.table}?select=${src.colonnes}&limit=1000&offset=${offset}`;
      const r = await fetch(u, { headers: entetes(cfg.cle) });
      if (!r.ok) {
        throw new Error(
          `source « ${src.table} » illisible (HTTP ${r.status}). AUCUNE suppression : ` +
          "un orphelin est une ABSENCE de référence, donc une source manquante en fabrique.",
        );
      }
      const lignes = await r.json();
      for (const l of lignes) morceaux.push(Object.values(l).map((v) => (v == null ? "" : typeof v === "string" ? v : JSON.stringify(v))).join(" "));
      if (lignes.length < 1000) break;
    }
  }
  return morceaux.join("\n");
}

async function supprimer(cfg, seau, noms) {
  const r = await fetch(`${cfg.url}/storage/v1/object/${seau}`, {
    method: "DELETE",
    headers: entetes(cfg.cle, { "Content-Type": "application/json" }),
    body: JSON.stringify({ prefixes: noms }),
  });
  if (!r.ok) throw new Error(`suppression ${seau} : HTTP ${r.status} ${await r.text()}`);
}

async function main() {
  const args = process.argv.slice(2);
  const appliquer = args.includes("--appliquer");
  const iAge = args.indexOf("--age");
  const ageMinJours = iAge >= 0 ? Number(args[iAge + 1]) : AGE_MIN_JOURS;
  if (!Number.isFinite(ageMinJours) || ageMinJours < 1) {
    console.error("--age attend un nombre de jours ≥ 1 (défaut : " + AGE_MIN_JOURS + ").");
    process.exit(2);
  }

  const cfg = configAdmin();
  if (!cfg) {
    console.error(
      "SUPABASE_SERVICE_ROLE_KEY absente (dashboard/.env en local). Cet outil lit et\n" +
      "supprime des médias : il refuse de tourner sans la clé d'administration.",
    );
    process.exit(2);
  }

  console.log("Lecture des cinq sources de référence…");
  const refs = await referencesCompletes(cfg);
  console.log(`  ${(refs.length / 1024).toFixed(0)} ko de références lues.\n`);

  let totalOrph = 0, poidsOrph = 0;
  const aSupprimer = [];
  for (const seau of SEAUX) {
    const objets = await lister(cfg, seau);
    const { orphelins, tropJeunes, references } = classerOrphelins(objets, refs, { ageMinJours });
    const poids = orphelins.reduce((s, o) => s + o.size, 0);
    totalOrph += orphelins.length;
    poidsOrph += poids;
    console.log(`Seau « ${seau} » : ${objets.length} objets`);
    console.log(`  référencés ......... ${references.length}`);
    console.log(`  trop récents ....... ${tropJeunes.length}  (< ${ageMinJours} j, jamais touchés)`);
    console.log(`  ORPHELINS .......... ${orphelins.length}  ${mo(poids)}`);
    for (const o of orphelins.slice().sort((a, b) => b.size - a.size).slice(0, 10)) {
      console.log(`      ${mo(o.size).padStart(10)}  ${String(o.created_at).slice(0, 10)}  ${o.name}`);
    }
    if (orphelins.length > 10) console.log(`      … et ${orphelins.length - 10} autres`);
    console.log("");
    if (orphelins.length) aSupprimer.push({ seau, noms: orphelins.map((o) => o.name) });
  }

  console.log(`TOTAL : ${totalOrph} orphelins, ${mo(poidsOrph)}.`);
  if (!appliquer) {
    console.log("\nRapport seul — rien n'a été supprimé. Ajouter `-- --appliquer` pour purger.");
    return;
  }
  if (totalOrph > PLAFOND_SUPPRESSIONS) {
    console.error(
      `\nARRÊT : ${totalOrph} orphelins dépasse le plafond de ${PLAFOND_SUPPRESSIONS}.\n` +
      "Un chiffre inattendu est un SIGNAL, pas une quantité de travail : une source de\n" +
      "référence a peut-être cessé de répondre comme avant. Vérifier avant de forcer.",
    );
    process.exit(1);
  }
  for (const { seau, noms } of aSupprimer) {
    for (let i = 0; i < noms.length; i += 50) {
      await supprimer(cfg, seau, noms.slice(i, i + 50));
      console.log(`  ${seau} : ${Math.min(i + 50, noms.length)}/${noms.length} supprimés`);
    }
  }
  console.log(`\n${totalOrph} objets supprimés, ${mo(poidsOrph)} libérés.`);
  console.log("⚠️ Mesurer l'état en base ensuite (canal ①), jamais ce tableau :");
  console.log("   select bucket_id, count(*), pg_size_pretty(sum((metadata->>'size')::bigint))");
  console.log("     from storage.objects group by 1;");
}

module.exports = { classerOrphelins, SOURCES, AGE_MIN_JOURS, PLAFOND_SUPPRESSIONS };

if (require.main === module) {
  main().catch((e) => { console.error(String((e && e.message) || e)); process.exit(1); });
}
