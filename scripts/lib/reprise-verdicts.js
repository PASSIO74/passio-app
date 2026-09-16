"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// LES VERDICTS DE REPRISE — quatre constats de la quatrième contre-revue Astra
// (15/09/2026) qui ont la MÊME famille : **un verdict qui ne sait pas dit oui**.
//
//   ASTRA-29 · un média dont on n'a ni la taille ni un eTag comparable était
//              accepté SANS aucune comparaison de contenu, et `prouvee` ne
//              regardait que les écarts — jamais les refus ni les erreurs des
//              autres phases. Un JSON `prouvee: true` pouvait sortir d'un
//              processus qui se terminait en code 1.
//   ASTRA-30 · un compte SUSPENDU (`banned_until`) était recréé SANS sa
//              suspension, et le verdict ne comparait que des UUID : la
//              personne exclue par la modération revenait connectable.
//   ASTRA-31 · un HTTP 503 d'Auth était lu comme « zéro compte » (`.json()`
//              puis `users || []`), d'où « purge relue 0/0/0 » et code 0 sans
//              qu'un seul DELETE soit parti.
//   ASTRA-32 · une archive SANS `schema.sql` sortait « conforme », code 0.
//
// Toutes les décisions sont ici, PURES, et verrouillées par
// `tests/unit/reprise-verdicts.test.mjs`. La règle commune, écrite une fois :
// **illisible ou non vérifié ≠ conforme**. Un troisième état existe, il
// s'appelle INDÉTERMINÉ, et il bloque comme un échec.
// ═══════════════════════════════════════════════════════════════════════════

// ── ASTRA-31 : lire Auth, ou dire qu'on n'a pas su lire ───────────────────
// `reponse` = { ok, status, corps } déjà parsé par l'appelant (pour rester pur).
// Rend { users } ou lève : il n'y a PAS de repli « liste vide ».
function pageComptes(reponse, page) {
  const ou = "auth/v1/admin/users?page=" + page;
  if (!reponse || typeof reponse !== "object") throw new Error(ou + " : aucune réponse.");
  if (!reponse.ok) throw new Error(ou + " : HTTP " + reponse.status + " — illisible, donc INDÉTERMINÉ (jamais « zéro compte »).");
  const c = reponse.corps;
  if (c === null || typeof c !== "object" || Array.isArray(c)) throw new Error(ou + " : corps inattendu (" + (c === null ? "null" : Array.isArray(c) ? "tableau" : typeof c) + ") — l'API n'a pas rendu ce qu'on attend.");
  if (!Array.isArray(c.users)) throw new Error(ou + " : `users` absent ou non tableau — un message d'erreur JSON n'est pas une page vide.");
  return { users: c.users };
}

// Une page COMPLÈTE veut dire « il y en a peut-être d'autres ». Une page courte
// termine. On rend le verdict de pagination plutôt que de le deviner sur place.
function paginationTerminee(users, perPage) { return users.length < perPage; }

// ── ASTRA-30 : la suspension voyage, et se relit ──────────────────────────
// GoTrue rend `banned_until` (ISO) ; l'API d'administration ACCEPTE
// `ban_duration` en heures (« 24h ») ou « none ». On calcule la durée RÉSIDUELLE :
// restaurer « 30 jours » un mois après la suspension prolongerait la peine.
function etatSuspension(u) {
  const b = u && u.banned_until;
  if (!b) return { suspendu: false, jusqu: null };
  const t = Date.parse(b);
  if (!Number.isFinite(t)) return { suspendu: false, jusqu: null, illisible: String(b) };
  return { suspendu: true, jusqu: new Date(t).toISOString() };
}
function dureeBanResiduelle(u, maintenant) {
  const e = etatSuspension(u);
  if (!e.suspendu) return null;
  const restantMs = Date.parse(e.jusqu) - (maintenant instanceof Date ? maintenant.getTime() : Number(maintenant));
  if (!(restantMs > 0)) return null;                  // peine déjà purgée : ne rien réappliquer
  // GoTrue compte en heures entières ; on arrondit AU-DESSUS pour ne jamais
  // rendre la liberté plus tôt que la décision de modération ne le prévoyait.
  const heures = Math.ceil(restantMs / 3600000);
  return heures + "h";
}
// Le compte restauré porte-t-il la même suspension que l'archive ?
//
// ⚠️ ASTRA-47 (cinquième contre-revue, 15/09/2026) — « L'ÉTAT, PAS LA
// MILLISECONDE » ACCEPTAIT N'IMPORTE QUELLE BORNE. Reproduit : maintenant =
// 15/09/2026, fin attendue = 15/10/2026, borne cible = 01/01/2020 → ok:true ; une
// borne cible à UNE SECONDE de l'instant passait aussi. Une suspension déjà
// expirée sur la cible n'est pas une suspension : la personne exclue se
// connecte. On compare désormais la BORNE EFFECTIVE à la borne attendue, avec
// une tolérance JUSTIFIÉE : `ban_duration` est en heures entières, arrondie
// AU-DESSUS (`dureeBanResiduelle`) et appliquée par GoTrue à partir de SON
// horloge → la borne rendue est dans [attendu, attendu + 1 h] à la dérive
// d'horloge près (`toleranceMs`, 5 min par défaut). En dessous : la peine est
// raccourcie, écart ; au-dessus : elle est prolongée, écart aussi.
const TOLERANCE_SUSPENSION_MS = 5 * 60 * 1000;
function suspensionRestauree(attendu, obtenu, maintenant, toleranceMs) {
  const tol = Number.isFinite(toleranceMs) ? toleranceMs : TOLERANCE_SUSPENSION_MS;
  const now = maintenant instanceof Date ? maintenant.getTime() : Number(maintenant);
  const a = etatSuspension(attendu), o = etatSuspension(obtenu);
  const aDoitEtreSuspendu = a.suspendu && Date.parse(a.jusqu) > now;
  if (!aDoitEtreSuspendu) {
    // L'archive ne portait pas de suspension EN COURS : la cible ne doit pas en
    // porter une non plus (une borne passée sur la cible n'en est pas une).
    const oEnCours = o.suspendu && Date.parse(o.jusqu) > now;
    return { ok: !oEnCours, motif: oEnCours ? "suspendu jusqu'au " + o.jusqu + " alors que l'archive ne l'était pas" : null };
  }
  if (!o.suspendu) return { ok: false, motif: "l'archive portait une suspension jusqu'au " + a.jusqu + " ; le compte restauré N'EST PAS suspendu" };
  const tA = Date.parse(a.jusqu), tO = Date.parse(o.jusqu);
  if (tO <= now) return { ok: false, motif: "l'archive portait une suspension jusqu'au " + a.jusqu + " ; la borne de la cible (" + o.jusqu + ") est DÉJÀ PASSÉE — le compte est connectable" };
  if (tO < tA - tol) return { ok: false, motif: "suspension RACCOURCIE : attendu jusqu'au " + a.jusqu + ", cible " + o.jusqu + " (" + Math.round((tA - tO) / 60000) + " min de moins)" };
  if (tO > tA + 3600000 + tol) return { ok: false, motif: "suspension PROLONGÉE : attendu jusqu'au " + a.jusqu + ", cible " + o.jusqu + " (au-delà de l'arrondi à l'heure)" };
  return { ok: true, motif: null };
}

// ── ASTRA-29 : un média non vérifié n'est pas un média conforme ───────────
// Trois catégories, plus deux : `nonVerifies` est le troisième état. Un eTag
// multipart (« <hex>-<n> ») n'est pas un MD5 ; une taille absente ne compare
// rien. Dans ces cas on ne dit NI conforme NI divergent : on dit « je ne sais
// pas », et ça bloque — sauf si l'appelant a pu hacher le contenu (`--hash-medias`).
function comparerMedias(fichiers, objets, options) {
  const opt = options || {};
  const hashes = opt.hashes || {};                      // { name: md5 } obtenus par GET
  const c = new Map((objets || []).map((o) => [o.name, o]));
  const manquants = [], divergents = [], nonVerifies = [];
  for (const f of fichiers || []) {
    const o = c.get(f.name);
    if (!o) { manquants.push(f.name); continue; }
    const tailleConnue = o.taille != null && f.taille != null;
    const tailleOk = !tailleConnue || Number(o.taille) === Number(f.taille);
    if (tailleConnue && !tailleOk) { divergents.push(f.name); continue; }

    const etagCible = String(o.etag || "").replace(/"/g, "").toLowerCase();
    const multipart = /-\d+$/.test(etagCible);
    // L'empreinte de secours : si l'appelant a relu l'objet et haché son
    // contenu, elle tranche — y compris pour un multipart.
    const md5Relu = hashes[f.name] ? String(hashes[f.name]).toLowerCase() : null;
    if (md5Relu && f.md5) { if (md5Relu !== String(f.md5).toLowerCase()) divergents.push(f.name); continue; }

    const etagComparable = Boolean(etagCible) && !multipart && Boolean(f.md5);
    if (etagComparable) { if (etagCible !== String(f.md5).toLowerCase()) divergents.push(f.name); continue; }

    // ⚠️ ICI ÉTAIT LE DÉFAUT. Sans taille comparable ET sans empreinte
    // comparable, on n'a RIEN comparé : deux fichiers de même taille et de
    // contenu différent passaient pour identiques, et un objet sans taille ni
    // eTag aussi. Ce n'est pas « conforme », c'est « non vérifié ».
    if (!tailleConnue) { nonVerifies.push({ name: f.name, raison: "ni taille ni empreinte comparables sur la cible" }); continue; }
    if (multipart) { nonVerifies.push({ name: f.name, raison: "eTag multipart (envoi > 5 Mo) : ce n'est pas le MD5 — taille identique seulement" }); continue; }
    if (!f.md5) { nonVerifies.push({ name: f.name, raison: "aucune empreinte dans l'archive — taille identique seulement" }); continue; }
    nonVerifies.push({ name: f.name, raison: "aucun eTag sur la cible — taille identique seulement" });
  }
  return { manquants, divergents, nonVerifies, enTrop: [...c.keys()].filter((n) => !(fichiers || []).some((f) => f.name === n)) };
}

// ── ASTRA-29 (second volet) : UN verdict, TOUTES les phases ───────────────
// `prouvee` ne peut pas être vraie s'il reste un écart, un refus, une phase en
// échec ou un élément non vérifié. Et le code de sortie SUIT le verdict : plus
// de JSON `prouvee: true` rendu par un processus qui sort en 1.
function verdictGlobalReprise({ ecarts, refus, phases, nonVerifies, limitesNonRestaurees }) {
  const bloquants = [];
  if (Number(ecarts) > 0) bloquants.push(ecarts + " écart(s)");
  if (refus && refus.length) bloquants.push(refus.length + " refus pendant les phases");
  if (Number(nonVerifies) > 0) bloquants.push(nonVerifies + " élément(s) NON VÉRIFIÉ(S) — ni taille ni empreinte comparables");
  if (limitesNonRestaurees && limitesNonRestaurees.length) bloquants.push("limites Storage non restaurées : " + limitesNonRestaurees.join(", "));
  for (const [nom, p] of Object.entries(phases || {})) {
    if (p === false) bloquants.push("phase « " + nom + " » en échec");
    else if (p && p.ok === false) bloquants.push("phase « " + nom + " » : " + (p.motif || "échec"));
    else if (p && p.indetermine) bloquants.push("phase « " + nom + " » : ÉTAT INDÉTERMINÉ — " + (p.motif || "non relu"));
  }
  return { prouvee: bloquants.length === 0, bloquants, code: bloquants.length ? 1 : 0 };
}

// ── ASTRA-32 : complète, partielle, ou rien du tout ───────────────────────
// Une archive est COMPLÈTE quand elle porte de quoi repartir d'une base VIDE :
// le DDL, les lignes, et (si les comptes ont été exportés) les identités. Sans
// DDL elle est PARTIELLE — utilisable, mais elle ne doit pas s'annoncer conforme.
function natureArchive({ schemaPresent, schemaDdl, schemaEmpreinte, empreinteAttendue, comptesExportes, mediasExportes, proprietairesComplets }) {
  const anomalies = [], notes = [];
  let ddlValide = false;
  if (schemaPresent) {
    const tables = (String(schemaDdl || "").match(/create table/gi) || []).length;
    const policies = (String(schemaDdl || "").match(/create policy/gi) || []).length;
    ddlValide = tables >= 20 && policies >= 20;
    if (!ddlValide) anomalies.push(`schema.sql : ${tables} create table, ${policies} create policy — ce n'est pas le DDL de PASSIO`);
    // ⚠️ L'EMPREINTE : un DDL présent mais qui n'est pas CELUI que la sauvegarde
    // a écrit (tronqué, remplacé, copié d'une autre archive) est pire qu'absent.
    if (empreinteAttendue && schemaEmpreinte && schemaEmpreinte !== empreinteAttendue) {
      anomalies.push(`schema.sql : empreinte ${schemaEmpreinte} ≠ ${empreinteAttendue} du manifeste — ce n'est pas le DDL de cette archive`);
      ddlValide = false;
    }
    if (empreinteAttendue && !schemaEmpreinte) notes.push("schema.sql présent mais non haché : empreinte non vérifiée");
  }
  // ASTRA-45 : des médias sans inventaire COMPLET de leurs propriétaires ne
  // permettent pas de repartir d'une base vide avec des objets qui appartiennent
  // à quelqu'un — l'archive est PARTIELLE sur ce point, et le dit.
  const propOk = proprietairesComplets !== false;
  if (mediasExportes && !propOk) notes.push("archive avec médias mais SANS inventaire complet des propriétaires : partielle (purge par compte et édition cassées après reprise)");
  const complete = Boolean(ddlValide) && Boolean(comptesExportes) && Boolean(mediasExportes) && propOk;
  if (!schemaPresent) {
    // ⚠️ AVANT : simple avertissement, `pb` inchangé, sortie 0 « conforme ».
    anomalies.push("archive SANS schema.sql : elle n'est PAS complète — restaurable sur une base qui a déjà la structure, jamais sur une base vide. Passer --partielle pour l'accepter sciemment.");
  }
  if (!comptesExportes) notes.push("archive sans les comptes : restaurable en données, pas en identités");
  if (!mediasExportes) notes.push("archive sans les médias");
  return { complete, ddlValide, anomalies, notes, nature: complete ? "complète" : "partielle" };
}


// ── ASTRA-26 : le propriétaire d'un objet Storage ────────────────────────
// Écrire un propriétaire n'est pas l'avoir rendu : on RELIT, et on compare.
// ⚠️ TROIS ÉTATS, PAS DEUX. « sans propriétaire dans l'archive » n'est ni un
// succès ni un écart : c'est un objet déposé par `service_role` ou avant le
// suivi — on ne lui en INVENTE pas, et on le compte à part. Déduire un
// propriétaire d'une URL ou d'un texte de message serait refaire ASTRA-12.
// ⚠️ ASTRA-58 (sixième contre-revue, 16/09) : « sans propriétaire dans
// l'archive » se COMPARE AUSSI. Un objet archivé `owner:null, owner_id:null`
// est un NUL EXPLICITE (lu en base à la sauvegarde) : la cible doit porter
// NULL, et une cible qui appartient à B est un ÉCART — la v précédente sautait
// ces entrées (`continue`) et déclarait la reprise prouvée avec l'objet de A
// devenu celui de B. Chaque champ est comparé à part (`null` ≠ `""` ≠ valeur).
// Une entrée qu'on ne sait pas lire (`{}`, `null`, champ absent) n'arrive pas
// ici : `lireInventaireProprietaires` la REFUSE (état indéterminé).
const champ = (o, k) => (o && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined && o[k] !== "" ? o[k] : null);
function comparerProprietaires(attendus, relus) {
  const divergents = [], absents = [];
  let conformes = 0, sansProprietaire = 0;
  const carte = relus instanceof Map ? relus : new Map(Object.entries(relus || {}));
  for (const [cle, att] of Object.entries(attendus || {})) {
    const nul = champ(att, "owner") === null && champ(att, "owner_id") === null;
    const o = carte.get(cle);
    if (!o) { absents.push(cle); continue; }
    if (String(champ(o, "owner") ?? "") === String(champ(att, "owner") ?? "") && String(champ(o, "owner_id") ?? "") === String(champ(att, "owner_id") ?? "")) { conformes++; if (nul) sansProprietaire++; }
    else divergents.push(cle);
  }
  return { conformes, sansProprietaire, divergents, absents, ok: divergents.length === 0 && absents.length === 0 };
}

/**
 * Une entrée d'inventaire est-elle LISIBLE ? Trois états, distingués :
 *   · `{ owner: "<id>", owner_id: "<id>" }` (au moins un non nul) → explicite ;
 *   · `{ owner: null, owner_id: null }` → NUL explicite (les deux champs PRÉSENTS) ;
 *   · tout le reste (`{}`, `null`, champ absent, `undefined`, type inattendu)
 *     → INCONNU : on ne sait pas ce que la base portait. Rend null si lisible,
 *     sinon le motif.
 */
function entreeProprietaireInvalide(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return "entrée " + (v === null ? "null" : Array.isArray(v) ? "tableau" : typeof v) + " (propriétaire INCONNU, pas nul)";
  for (const k of ["owner", "owner_id"]) {
    if (!Object.prototype.hasOwnProperty.call(v, k)) return "champ `" + k + "` absent (propriétaire INCONNU, pas nul)";
    if (v[k] !== null && (typeof v[k] !== "string" || v[k] === "")) return "champ `" + k + "` ni nul ni texte non vide";
  }
  return null;
}

// ── ASTRA-45 / ASTRA-48 : l'inventaire des propriétaires, lu STRICTEMENT ──
// Le fichier `_storage_proprietaires.json` porte une VERSION, un TOTAL et les
// objets ; le manifeste porte son empreinte. Un fichier illisible, tronqué,
// d'une autre forme, ou dont l'empreinte diverge n'est pas « vide » : il est
// INDÉTERMINÉ, et ça bloque. (ASTRA-48 : `catch → {}` faisait d'un fichier
// tronqué un inventaire vide et conforme : attendus 0, conformes 0, ok:true.)
// Rend { objets, total, version } ou { erreur }. Accepte aussi la forme v0
// (une table plate), en le DISANT (`version: 0`) — les archives d'avant.
const FORMAT_PROPRIETAIRES = "passio-proprietaires/1";
function lireInventaireProprietaires(texte, empreinteAttendue, empreinteCalculee) {
  if (texte == null) return { erreur: "fichier absent" };
  if (empreinteAttendue && empreinteCalculee && empreinteAttendue !== empreinteCalculee) {
    return { erreur: "empreinte " + empreinteCalculee.slice(0, 12) + "… ≠ " + empreinteAttendue.slice(0, 12) + "… du manifeste : ce n'est pas l'inventaire de cette archive" };
  }
  let d;
  try { d = JSON.parse(texte); } catch (e) { return { erreur: "JSON illisible (" + String(e.message).slice(0, 80) + ") — fichier tronqué ou corrompu" }; }
  if (!d || typeof d !== "object" || Array.isArray(d)) return { erreur: "forme inattendue (" + (Array.isArray(d) ? "tableau" : typeof d) + ")" };
  let objets, version, total;
  if (d.format === FORMAT_PROPRIETAIRES) {
    if (!d.objets || typeof d.objets !== "object" || Array.isArray(d.objets)) return { erreur: "champ `objets` absent ou non objet" };
    if (typeof d.total !== "number") return { erreur: "champ `total` absent" };
    objets = d.objets; version = 1; total = d.total;
    if (Object.keys(objets).length !== total) return { erreur: "total " + total + " annoncé, " + Object.keys(objets).length + " objet(s) présent(s) — inventaire tronqué" };
  } else if (d.format) {
    return { erreur: "format " + String(d.format) + " inconnu" };
  } else {
    objets = d; version = 0; total = Object.keys(d).length;
  }
  for (const [k, v] of Object.entries(objets)) {
    if (typeof k !== "string" || k.indexOf("/") < 1) return { erreur: "clé d'objet invalide : " + String(k).slice(0, 60) };
    // ⚠️ ASTRA-58 : `{}` ou `null` n'est pas « sans propriétaire » — c'est une
    // donnée INCONNUE. Un inventaire qui en porte est INDÉTERMINÉ : rien n'est
    // rendu, la reprise ne peut pas se dire prouvée.
    const motif = entreeProprietaireInvalide(v);
    if (motif) return { erreur: "entrée invalide pour " + k + " : " + motif };
  }
  return { objets, version, total };
}

// ── ASTRA-45 : chaque objet archivé est-il COUVERT par l'inventaire ? ─────
// Trois états, distingués : `explicites` (propriétaire connu), `nuls`
// (propriétaire explicitement nul en base : déposé par service_role ou avant
// le suivi), `nonReleves` (l'objet est dans l'archive, l'inventaire ne le
// mentionne PAS — plafond de page, RPC partielle). Un inventaire absent est
// `indisponible`, jamais « zéro objet ».
function couvertureProprietaires(clesArchivees, inventaire) {
  if (!inventaire) return { indisponible: true, explicites: 0, nuls: 0, nonReleves: [...(clesArchivees || [])], ok: false };
  const explicites = [], nuls = [], nonReleves = [];
  for (const k of clesArchivees || []) {
    if (!(k in inventaire)) { nonReleves.push(k); continue; }
    const p = inventaire[k];
    if (champ(p, "owner") !== null || champ(p, "owner_id") !== null) explicites.push(k); else nuls.push(k);
  }
  return { indisponible: false, explicites: explicites.length, nuls: nuls.length, nonReleves, ok: nonReleves.length === 0 };
}

// ── ASTRA-55 : l'ensemble attendu vient de l'ARCHIVE, pas du disque ────────
// Le verdict reconstruisait la liste attendue depuis les fichiers ENCORE
// présents sur disque : un média disparu de l'archive (manifeste : 1 fichier,
// disque : 0, cible : 1) donnait en_trop:1, medias.ok:true, prouvee:true.
// Désormais : l'ensemble attendu est l'INDEX écrit par la sauvegarde
// (`_storage_index.json` : nom, taille, md5 de chaque objet, empreinte de
// l'index dans le manifeste) ; le disque est confronté à l'index (archive
// intacte ?) ; la cible est confrontée à l'index ; et `enTrop` entre dans `ok`.
// Sans index (archive d'avant), l'attendu n'est pas VÉRIFIABLE : indéterminé.
const FORMAT_INDEX = "passio-index-medias/1";
function lireIndexMedias(texte, empreinteAttendue, empreinteCalculee) {
  if (texte == null) return { erreur: "index absent" };
  if (empreinteAttendue && empreinteCalculee && empreinteAttendue !== empreinteCalculee) return { erreur: "empreinte de l'index ≠ manifeste : ce n'est pas l'index de cette archive" };
  let d;
  try { d = JSON.parse(texte); } catch (e) { return { erreur: "index JSON illisible — fichier tronqué ou corrompu" }; }
  if (!d || d.format !== FORMAT_INDEX || !d.objets || typeof d.objets !== "object" || typeof d.total !== "number") return { erreur: "index de forme inattendue" };
  if (Object.keys(d.objets).length !== d.total) return { erreur: "index tronqué : total " + d.total + ", " + Object.keys(d.objets).length + " entrée(s)" };
  for (const [k, v] of Object.entries(d.objets)) {
    if (!v || typeof v.taille !== "number" || typeof v.md5 !== "string" || !/^[0-9a-f]{32}$/.test(v.md5)) return { erreur: "entrée d'index invalide : " + k };
  }
  return { objets: d.objets, total: d.total };
}
// L'archive sur disque est-elle celle de l'index ? Rend ce qui manque, diverge, ou est en trop.
function integriteArchiveMedias(index, fichiersDisque) {
  const disque = new Map((fichiersDisque || []).map((f) => [f.name, f]));
  const manquants = [], divergents = [], enTrop = [];
  for (const [k, att] of Object.entries(index || {})) {
    const f = disque.get(k);
    if (!f) { manquants.push(k); continue; }
    if (Number(f.taille) !== att.taille || String(f.md5).toLowerCase() !== att.md5) divergents.push(k);
  }
  for (const k of disque.keys()) if (!(k in (index || {}))) enTrop.push(k);
  return { manquants, divergents, enTrop, ok: manquants.length === 0 && divergents.length === 0 && enTrop.length === 0 };
}
// Le verdict médias complet : index → cible, en passant par l'intégrité de l'archive.
function verdictMedias({ index, fichiersDisque, objets, hashes, attenduManifeste }) {
  if (!index) return { indetermine: true, motif: "aucun index de médias vérifiable : l'ensemble attendu ne peut pas être établi (archive d'avant l'index, ou index illisible)", ok: false };
  const integrite = integriteArchiveMedias(index, fichiersDisque);
  // Ce qu'on compare à la cible, c'est l'INDEX (l'archive telle qu'elle a été
  // écrite), pas ce qui reste sur disque.
  const attendus = Object.entries(index).map(([name, v]) => ({ name, taille: v.taille, md5: v.md5 }));
  const d = comparerMedias(attendus, objets, { hashes });
  const compteOk = attenduManifeste == null || Number(attenduManifeste) === attendus.length;
  const ok = integrite.ok && compteOk && d.manquants.length === 0 && d.divergents.length === 0 && d.nonVerifies.length === 0 && d.enTrop.length === 0;
  return { indetermine: false, ok, integrite, attendus: attendus.length, ...d, compteOk };
}

module.exports = { lireInventaireProprietaires, couvertureProprietaires, entreeProprietaireInvalide, lireIndexMedias, integriteArchiveMedias, verdictMedias, FORMAT_PROPRIETAIRES, FORMAT_INDEX, TOLERANCE_SUSPENSION_MS, comparerProprietaires, pageComptes, paginationTerminee, etatSuspension, dureeBanResiduelle, suspensionRestauree, comparerMedias, verdictGlobalReprise, natureArchive };
