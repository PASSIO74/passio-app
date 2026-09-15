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
// Le compte restauré porte-t-il la même suspension que l'archive ? On compare
// l'ÉTAT (suspendu ou non), jamais la milliseconde : GoTrue recalcule la borne.
function suspensionRestauree(attendu, obtenu, maintenant) {
  const a = etatSuspension(attendu), o = etatSuspension(obtenu);
  const aDoitEtreSuspendu = a.suspendu && Date.parse(a.jusqu) > (maintenant instanceof Date ? maintenant.getTime() : Number(maintenant));
  if (!aDoitEtreSuspendu) return { ok: !o.suspendu || Date.parse(o.jusqu) <= Date.now(), motif: o.suspendu ? "suspendu alors que l'archive ne l'était pas" : null };
  if (!o.suspendu) return { ok: false, motif: "l'archive portait une suspension jusqu'au " + a.jusqu + " ; le compte restauré N'EST PAS suspendu" };
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
function natureArchive({ schemaPresent, schemaDdl, schemaEmpreinte, empreinteAttendue, comptesExportes, mediasExportes }) {
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
  const complete = Boolean(ddlValide) && Boolean(comptesExportes) && Boolean(mediasExportes);
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
function comparerProprietaires(attendus, relus) {
  const divergents = [], absents = [];
  let conformes = 0, sansProprietaire = 0;
  const carte = relus instanceof Map ? relus : new Map(Object.entries(relus || {}));
  for (const [cle, att] of Object.entries(attendus || {})) {
    if (!att || (!att.owner && !att.owner_id)) { sansProprietaire++; continue; }
    const o = carte.get(cle);
    if (!o) { absents.push(cle); continue; }
    if (String(o.owner || "") === String(att.owner || "") && String(o.owner_id || "") === String(att.owner_id || "")) conformes++;
    else divergents.push(cle);
  }
  return { conformes, sansProprietaire, divergents, absents, ok: divergents.length === 0 && absents.length === 0 };
}

module.exports = { comparerProprietaires, pageComptes, paginationTerminee, etatSuspension, dureeBanResiduelle, suspensionRestauree, comparerMedias, verdictGlobalReprise, natureArchive };
