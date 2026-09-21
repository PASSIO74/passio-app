"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// BARRIÈRE DES GESTES CRITIQUES — ASTRA-33 (quatrième contre-revue, 15/09/2026)
//
// Ce que la contre-revue a mesuré sur `scripts/appliquer-migration.mjs` :
//   ① la CIBLE était implicite — sans `SUPABASE_PROJECT_REF`, le script prenait
//      le projet LIÉ du poste (`supabase/.temp/project-ref`). Sur un poste lié à
//      la production, « appliquer une migration » visait la production sans que
//      personne ne l'ait écrit nulle part ;
//   ② AUCUN contrôle du contenu relu : rien ne reliait le fichier envoyé à un
//      fichier revu. Une retouche d'un octet après la revue partait sans bruit ;
//   ③ le JOURNAL était écrit APRÈS la migration, hors transaction, et son refus
//      n'était qu'un ⚠️ : la migration passait, le journal ne disait rien, et le
//      processus sortait VERT. Deux chemins sortaient même AVANT le journal
//      (verdict absent → exit 0 ; verdict en ECHEC → exit 1).
//
// La réponse tient en trois règles, toutes PURES et donc mesurables ici :
//   · `choisirCible` — la cible est ÉCRITE ou rien ne part. Le projet lié n'est
//     plus une source : il ne sert qu'à DIRE qu'on vise ailleurs que lui.
//   · `verifierAttestation` — sur une cible protégée, l'empreinte SHA-256 du
//     fichier tel qu'il est relu MAINTENANT doit être celle qu'une attestation
//     versionnée porte. Toute dérive (un octet, un CRLF near) est nommée et
//     refusée. Une attestation ne vaut que pour les cibles qu'elle nomme.
//   · `sqlAvecJournal` — l'écriture du journal entre DANS la transaction de la
//     migration, juste après son `begin;`. Elle ne peut donc plus « manquer »
//     une migration passée : soit les deux, soit aucune des deux. Ce qui reste
//     hors transaction (l'enrichissement du verdict) est explicitement facultatif
//     et ne peut pas rendre l'état indéterminé.
//
// ⚠️ On n'injecte JAMAIS en fin de transaction : l'API de gestion rend les
// lignes de la DERNIÈRE instruction qui en produit, et le tableau de verdict est
// la dernière. Une insertion glissée après lui volerait le verdict à l'écran.
// ═══════════════════════════════════════════════════════════════════════════
const crypto = require("node:crypto");

// Les projets sur lesquels une migration engage autre chose que soi-même. Une
// cible ABSENTE de cette liste reste soumise à la cible explicite (règle ①)
// mais peut se passer d'attestation : un PostgreSQL jetable de banc n'a pas de
// revue à produire. Ajouter un projet ici est un geste délibéré.
const CIBLES_PROTEGEES = {
  njkiyoklssvefstljemx: "production",
  fcksxofaelcdmmifnwjo: "staging (cible de la CI)",
};

const FORME_REF = /^[a-z]{20}$/;

function empreinte(sql) {
  // Même normalisation que le journal : un poste en CRLF et la CI en LF doivent
  // rendre la MÊME empreinte, sinon l'attestation dériverait sur rien.
  return crypto.createHash("sha256").update(String(sql).replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

class RefusBarriere extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "RefusBarriere";
    this.code = code;
    this.details = details || {};
  }
}

// ── ① LA CIBLE EST ÉCRITE, OU RIEN NE PART ────────────────────────────────
// `argProjet` = `--projet <ref>` ; `envRef` = SUPABASE_PROJECT_REF ; `refLie` =
// le projet lié du poste, qui n'est PLUS une source de cible.
function choisirCible({ argProjet, envRef, refLie } = {}) {
  const explicite = (argProjet || envRef || "").trim();
  const lie = (refLie || "").trim();
  if (!explicite) {
    throw new RefusBarriere(
      "cible_implicite",
      "aucune cible ÉCRITE : passer `--projet <ref>` ou poser SUPABASE_PROJECT_REF." +
        (lie ? " Le poste est lié à `" + lie + "`" + (CIBLES_PROTEGEES[lie] ? " (" + CIBLES_PROTEGEES[lie] + ")" : "") + " — s'il s'agit bien de la cible voulue, l'écrire." : "") +
        " Le projet lié n'est plus une cible par défaut (ASTRA-33).",
      { refLie: lie }
    );
  }
  if (!FORME_REF.test(explicite)) {
    throw new RefusBarriere("cible_mal_formee", "la référence de projet `" + explicite + "` n'a pas la forme attendue (20 lettres minuscules).", { ref: explicite });
  }
  return {
    ref: explicite,
    protegee: Object.prototype.hasOwnProperty.call(CIBLES_PROTEGEES, explicite),
    role: CIBLES_PROTEGEES[explicite] || null,
    // On ne refuse pas une cible différente du projet lié — c'est même le cas
    // normal d'un exercice de reprise. On le DIT, pour qu'un écart se voie.
    divergeDuProjetLie: Boolean(lie) && lie !== explicite,
    refLie: lie || null,
  };
}

// ── ② LE CONTENU ENVOYÉ EST CELUI QUI A ÉTÉ REVU ──────────────────────────
// `attestations` = le contenu de `.passio/migrations/attestations.json`, un
// tableau d'entrées { fichier, empreinte, cibles[], pr, relecteur, revue_le,
// source }. Une entrée n'atteste QUE le couple (contenu exact, cible nommée).
function verifierAttestation({ fichier, sql, cible, attestations, sansAttestation } = {}) {
  const emp = empreinte(sql);
  const protegee = Boolean(cible && cible.protegee);
  const liste = Array.isArray(attestations) ? attestations : [];
  const pourLeFichier = liste.filter((a) => a && a.fichier === fichier);
  const exactes = pourLeFichier.filter((a) => a.empreinte === emp);

  if (!protegee) {
    // Cible non protégée : l'attestation n'est pas exigée, mais si une existe
    // et qu'elle DIVERGE, on le dit — un banc qui exerce autre chose que ce qui
    // a été revu est une information, pas un détail.
    return { empreinte: emp, exigee: false, attestation: exactes[0] || null, derive: pourLeFichier.length > 0 && exactes.length === 0 };
  }
  if (sansAttestation) {
    throw new RefusBarriere("attestation_non_contournable", "`--sans-attestation` ne vaut pas sur une cible protégée (" + cible.ref + " — " + cible.role + ").", { ref: cible.ref });
  }
  if (!pourLeFichier.length) {
    throw new RefusBarriere(
      "attestation_absente",
      "aucune revue préalable attestée pour `" + fichier + "` sur une cible protégée (" + cible.ref + " — " + cible.role + ").\n" +
        "   Empreinte du fichier relu : " + emp + "\n" +
        "   Inscrire l'attestation dans .passio/migrations/attestations.json APRÈS la revue du contenu exact.",
      { empreinte: emp, fichier }
    );
  }
  if (!exactes.length) {
    throw new RefusBarriere(
      "derive_de_contenu",
      "DÉRIVE : `" + fichier + "` a changé depuis sa revue. Une modification après revue invalide l'attestation du contenu précédent.\n" +
        "   Empreinte revue   : " + pourLeFichier.map((a) => a.empreinte).join(", ") + "\n" +
        "   Empreinte relue   : " + emp + "\n" +
        "   Refaire revoir le contenu exact, puis réinscrire l'attestation.",
      { empreinte: emp, attendues: pourLeFichier.map((a) => a.empreinte) }
    );
  }
  const bonneCible = exactes.filter((a) => Array.isArray(a.cibles) && a.cibles.includes(cible.ref));
  if (!bonneCible.length) {
    throw new RefusBarriere(
      "cible_non_attestee",
      "le contenu est attesté, mais PAS pour la cible `" + cible.ref + "` (" + cible.role + ").\n" +
        "   Cibles attestées : " + exactes.map((a) => (a.cibles || []).join(", ")).join(" | "),
      { ref: cible.ref }
    );
  }
  const a = bonneCible[0];
  for (const champ of ["pr", "relecteur", "revue_le", "source"]) {
    if (!a[champ]) throw new RefusBarriere("attestation_incomplete", "l'attestation de `" + fichier + "` n'a pas de `" + champ + "` — une attestation sans origine n'atteste rien.", { champ });
  }
  // Une attestation RECONSTRUITE après coup reste utilisable — elle dit ce qui a
  // été revu, et sur quel contenu — mais elle ne se fait jamais passer pour
  // préalable : l'appelant la DIT à l'écran à chaque envoi.
  return { empreinte: emp, exigee: true, attestation: a, derive: false, retroactive: Boolean(a.retroactif) };
}

// ── ②' LA PREUVE DE REVUE, VÉRIFIABLE — ASTRA-51 (cinquième contre-revue, 15/09/2026)
// L'attestation d'avant était DÉCLARATIVE : quatre champs libres (pr, relecteur,
// revue_le, source) validés par leur seule présence. Reproduit par la
// contre-revue : une attestation non versionnée, PR fictive, l'auteur comme
// relecteur, source « aucune revue » → `--verifier` rend 0, « envoyable ». Un
// auteur pouvait fabriquer seul la validation en tapant des champs.
// LA PREUVE, désormais, vit HORS du poste : une REVUE GITHUB sur la PR — un
// événement daté, signé par un compte, ancré sur un COMMIT, que le dépôt ne
// peut pas réécrire. L'attestation locale ne fait que la DÉSIGNER
// (`pr`, `commit`, `revue_id`) ; c'est la vérification qui atteste :
//   · la revue existe sur cette PR, avec cet identifiant ;
//   · elle est ancrée sur `commit` (le SHA que la revue a regardé) ;
//   · son corps porte le marqueur « Contre-revue technique indépendante » (la
//     même convention que le job « Gouvernance critique »), le CHEMIN du
//     fichier et la CIBLE (`cible: <ref>`) — la revue dit ce qu'elle a revu ;
//   · le contenu du fichier À CE COMMIT a l'empreinte attestée, qui est celle
//     du fichier envoyé — le SHA revu et le contenu envoyé coïncident ;
//   · l'auteur de la revue est celui que l'attestation nomme.
// ⚠️ CE QUE CETTE PREUVE NE FAIT PAS, et qui se dit : elle n'établit pas que
// la revue a été ATTENTIVE, ni qu'elle vient d'une autre personne quand le
// dépôt n'a qu'un mainteneur (GitHub interdit d'APPROUVER sa propre PR ; un
// commentaire de revue reste possible). Elle établit qu'un geste public,
// daté, ancré sur un SHA, a eu lieu sur ce contenu exact — et qu'on ne peut
// plus le fabriquer en tapant des champs dans un fichier local.
// `revues` et `contenuAuCommit` sont FOURNIS par l'appelant (lus par `gh api`) :
// la décision reste pure et testable.
// ⚠️ ASTRA-61 (sixième contre-revue, 16/09/2026) — UNE APPROBATION POSITIVE,
// INDÉPENDANTE, PAR UN RELECTEUR AUTORISÉ. La règle du 15/09 acceptait une
// revue COMMENTED — y compris un commentaire de REFUS qui portait les
// marqueurs attendus — et une auto-revue (l'auteur de la PR), en le « disant »
// (`memeAuteurQueLaPr`) sans refuser. Désormais :
//   · l'état est `APPROVED`, rien d'autre : un commentaire, même conforme, ne
//     vaut pas approbation ; un `CHANGES_REQUESTED` ou un `DISMISSED` non plus ;
//   · le relecteur n'est PAS l'auteur de la PR — et l'auteur doit être CONNU :
//     inconnu = non vérifiable = refus ;
//   · le relecteur figure dans la liste des RELECTEURS AUTORISÉS
//     (`.passio/migrations/relecteurs-autorises.json`, versionnée), qui doit
//     exister et ne pas être vide — sans liste, personne n'est autorisé ;
//   · le lien au SHA (`commit_id`), au contenu (empreinte au commit = envoyée)
//     et à la cible (`cible: <ref>` dans le corps) est inchangé.
// ⚠️ Ce que cette preuve ne fait toujours pas : établir que la revue a été
// attentive. Elle établit qu'un compte autorisé, distinct de l'auteur, a
// APPROUVÉ ce contenu exact pour cette cible, sur GitHub, à une date.
//
// ⚠️ ASTRA-61 bis — MAINTENEUR UNIQUE (décision de Benjamin, 21/09/2026).
// PASSIO n'a qu'un compte GitHub humain : l'exigence « relecteur distinct de
// l'auteur » ne pouvait être satisfaite par personne, et la liste des
// relecteurs autorisés était vide (RES-15). Plutôt que de contourner la
// barrière (SQL direct, attestation tapée), la règle est AMENDÉE, versionnée
// et dite : `relecteurs-autorises.json` peut déclarer `mainteneur_unique`.
// Pour CE compte seulement, et seulement s'il est aussi l'auteur de la PR :
//   · l'auto-revue est acceptée — GitHub interdit d'approuver sa propre PR,
//     donc l'état `COMMENTED` est admis EN PLUS d'`APPROVED` ;
//   · le corps doit porter, en plus du marqueur, la PHRASE D'ASSOMPTION
//     ci-dessous — un commentaire ordinaire, même conforme, n'engage pas ;
//   · tout le reste est inchangé : relecteur dans la liste, SHA, contenu,
//     fichier, cible ; et le journal consigne `memeAuteurQueLaPr: true`.
// Ce que cela ne fait pas : rendre la revue indépendante. Cela rend la
// décision TRAÇABLE — qui a assumé quoi, sur quel contenu, pour quelle cible.
const MARQUEUR_REVUE = "Contre-revue technique indépendante";
const PHRASE_MAINTENEUR_UNIQUE = "revue de mainteneur unique : j'assume l'application de cette migration";
const FORME_SHA = /^[0-9a-f]{40}$/;
function verifierPreuveRevue({ attestation, fichier, empreinteAttendue, cible, revues, contenuAuCommit, auteurPr, relecteursAutorises, mainteneurUnique } = {}) {
  const a = attestation || {};
  const refus = (code, m, d) => { throw new RefusBarriere(code, m, d); };
  const prNum = String(a.pr || "").replace(/^#/, "");
  if (!/^\d+$/.test(prNum)) refus("preuve_incomplete", "l'attestation de `" + fichier + "` ne désigne pas une PR (`pr`).");
  if (!FORME_SHA.test(String(a.commit || ""))) refus("preuve_incomplete", "l'attestation de `" + fichier + "` ne désigne pas le COMMIT revu (`commit`, 40 hex) — sans lui, aucune revue n'est ancrée.");
  if (!/^\d+$/.test(String(a.revue_id || ""))) refus("preuve_incomplete", "l'attestation de `" + fichier + "` ne désigne pas la REVUE GitHub (`revue_id`) — une revue non désignée n'est pas vérifiable.");
  if (!Array.isArray(relecteursAutorises) || relecteursAutorises.length === 0) refus("relecteurs_non_definis", "aucune liste de relecteurs autorisés (`.passio/migrations/relecteurs-autorises.json`) : personne n'est autorisé à approuver une migration, la preuve est refusée.");
  if (!Array.isArray(revues)) refus("preuve_non_verifiable", "les revues de la PR #" + prNum + " n'ont pas pu être lues : la preuve est NON VÉRIFIABLE, donc absente.");
  const r = revues.find((x) => x && String(x.id) === String(a.revue_id));
  if (!r) refus("preuve_absente", "aucune revue n°" + a.revue_id + " sur la PR #" + prNum + ".");
  if (String(r.commit_id || "") !== String(a.commit)) refus("preuve_divergente", "la revue n°" + a.revue_id + " est ancrée sur " + String(r.commit_id || "?").slice(0, 12) + "…, pas sur le commit attesté " + String(a.commit).slice(0, 12) + "….");
  const loginRevue = r.user && r.user.login;
  const mainteneur = (typeof mainteneurUnique === "string" && mainteneurUnique) ? mainteneurUnique : null;
  // Auto-revue de mainteneur unique : déclarée, par le compte déclaré, sur SA PR.
  const autoRevueDeclaree = Boolean(mainteneur && loginRevue && String(loginRevue) === mainteneur && typeof auteurPr === "string" && String(auteurPr) === mainteneur);
  const etat = String(r.state || "").toUpperCase();
  if (etat !== "APPROVED" && !(autoRevueDeclaree && etat === "COMMENTED")) refus("preuve_non_approuvee", "la revue n°" + a.revue_id + " est à l'état " + (r.state || "?") + " — seule une APPROBATION (APPROVED) vaut preuve ; un commentaire, même conforme, n'approuve rien (ASTRA-61)" + (mainteneur ? " ; l'état COMMENTED n'est admis que pour l'auto-revue du mainteneur unique déclaré (" + mainteneur + ") sur sa propre PR" : "") + ".");
  const corps = String(r.body || "");
  if (autoRevueDeclaree && !corps.includes(PHRASE_MAINTENEUR_UNIQUE)) refus("preuve_divergente", "la revue n°" + a.revue_id + " est une auto-revue du mainteneur unique mais ne porte pas la phrase d'assomption « " + PHRASE_MAINTENEUR_UNIQUE + " » : un commentaire ordinaire n'engage pas (ASTRA-61 bis).");
  if (!corps.includes(MARQUEUR_REVUE)) refus("preuve_divergente", "la revue n°" + a.revue_id + " ne porte pas le marqueur « " + MARQUEUR_REVUE + " ».");
  if (!corps.includes(fichier)) refus("preuve_divergente", "la revue n°" + a.revue_id + " ne nomme pas `" + fichier + "` : elle ne dit pas avoir revu ce fichier.");
  const ref = cible && cible.ref;
  if (!ref || !new RegExp("cible\\s*:\\s*" + ref + "\\b").test(corps)) refus("preuve_divergente", "la revue n°" + a.revue_id + " ne nomme pas la cible `cible: " + (ref || "?") + "` : une revue pour une autre cible n'atteste pas celle-ci.");
  const login = r.user && r.user.login;
  if (!login || String(a.relecteur || "") !== String(login)) refus("preuve_divergente", "l'auteur de la revue (" + (login || "?") + ") n'est pas le relecteur attesté (" + (a.relecteur || "?") + ").");
  if (!relecteursAutorises.map(String).includes(String(login))) refus("relecteur_non_autorise", "le relecteur " + login + " n'est pas dans la liste des relecteurs autorisés (" + relecteursAutorises.join(", ") + ") : son approbation ne vaut pas pour une migration.");
  if (typeof auteurPr !== "string" || !auteurPr) refus("preuve_non_verifiable", "l'auteur de la PR #" + prNum + " n'a pas pu être lu : l'indépendance du relecteur est NON VÉRIFIABLE, la preuve est refusée.");
  if (String(auteurPr) === String(login) && !autoRevueDeclaree) refus("auto_revue", "le relecteur " + login + " est l'AUTEUR de la PR #" + prNum + " : une auto-revue n'est pas une revue indépendante (ASTRA-61)" + (mainteneur ? " — seul le mainteneur unique déclaré (" + mainteneur + ") peut l'assumer" : " — aucun mainteneur unique n'est déclaré") + ".");
  if (typeof contenuAuCommit !== "string") refus("preuve_non_verifiable", "le contenu de `" + fichier + "` au commit " + String(a.commit).slice(0, 12) + "… n'a pas pu être lu : preuve NON VÉRIFIABLE.");
  const empCommit = empreinte(contenuAuCommit);
  if (empCommit !== a.empreinte) refus("preuve_divergente", "au commit revu, `" + fichier + "` a l'empreinte " + empCommit.slice(0, 12) + "…, pas celle attestée " + String(a.empreinte).slice(0, 12) + "… : la revue a regardé un autre contenu.");
  if (empreinteAttendue && empCommit !== empreinteAttendue) refus("derive_de_contenu", "le fichier envoyé (" + empreinteAttendue.slice(0, 12) + "…) n'est pas celui du commit revu (" + empCommit.slice(0, 12) + "…).");
  return { ok: true, revue: { id: r.id, login, etat: r.state, soumise_le: r.submitted_at || null, commit: r.commit_id }, auteurPr, memeAuteurQueLaPr: autoRevueDeclaree, mainteneurUnique: autoRevueDeclaree ? mainteneur : null };
}

// ── ②'' LE FOURNISSEUR DE LA PREUVE : RÉEL OU FICTIF ─────────────────────
// Les tests posent un faux `gh` (`PASSIO_GH_BIN`) et un dépôt forcé
// (`PASSIO_DEPOT`). Ces fixtures ne certifient RIEN : sur une cible protégée,
// une preuve lue par un fournisseur fictif est REFUSÉE — c'est la séparation
// qu'ASTRA-61 exige entre le banc et le chemin qui certifie. `fournisseur` =
// { reel, motifs[] } rendu par github-revue.js.
function exigerFournisseurReel(fournisseur, cible) {
  if (!cible || !cible.protegee) return;
  if (!fournisseur || fournisseur.reel !== true) {
    throw new RefusBarriere("preuve_fournisseur_fictif", "la preuve de revue serait lue par un fournisseur FICTIF (" + ((fournisseur && fournisseur.motifs) || ["inconnu"]).join(", ") + ") : sur une cible protégée (" + cible.ref + " — " + cible.role + "), seule une lecture GitHub réelle (`gh` du PATH, dépôt `origin`) certifie.", { fournisseur });
  }
}

// ── ③ LE JOURNAL ENTRE DANS LA TRANSACTION ────────────────────────────────
// Le fait « ce fichier, cette empreinte, cette cible, cette attestation » est
// écrit DANS la transaction de la migration, juste après son `begin;`. Plus de
// fenêtre entre « la migration est passée » et « le journal le sait ».
function litteral(v) { return v === null || v === undefined ? "null" : "'" + String(v).replace(/'/g, "''") + "'"; }

function sqlColonnesJournal() {
  // Rejouable, et il COMPLÈTE le journal existant (NET-07) au lieu de le
  // remplacer : une base qui porte déjà la table gagne les trois colonnes.
  return [
    "alter table public.migrations_appliquees add column if not exists cible text;",
    "alter table public.migrations_appliquees add column if not exists attestation jsonb;",
    "alter table public.migrations_appliquees add column if not exists statut text not null default 'applique';",
  ].join("\n");
}

function sqlAvecJournal(sql, { fichier, cible, attestation, outil } = {}) {
  const texte = String(sql);
  // On vise le PREMIER `begin;` réel (hors commentaire) : la migration est
  // déjà validée comme commençant par lui côté appelant.
  const m = /(^|\n)[ \t]*begin[ \t]*;/i.exec(texte.replace(/--[^\n]*/g, (c) => " ".repeat(c.length)));
  if (!m) throw new RefusBarriere("transaction_introuvable", "aucun `begin;` : impossible de journaliser dans la transaction.");
  const pos = m.index + m[0].length;
  const ligne =
    "\ninsert into public.migrations_appliquees (fichier, empreinte, cible, attestation, outil, statut) values (" +
    [litteral(fichier), litteral(empreinte(texte)), litteral(cible), attestation ? litteral(JSON.stringify(attestation)) + "::jsonb" : "null", litteral(outil || "appliquer-migration.mjs"), litteral("applique")].join(", ") +
    ");\n";
  return texte.slice(0, pos) + ligne + texte.slice(pos);
}

// ── LE VERDICT EST UNIQUE, ET IL COUVRE TOUTES LES PHASES ─────────────────
// Un JSON `prouvee:true` ne doit jamais coexister avec une phase en échec
// (même famille qu'ASTRA-29). Ici : préparation du journal, envoi, verdict.
function verdictGlobal(phases) {
  const echecs = [];
  for (const [nom, p] of Object.entries(phases || {})) {
    if (!p) { echecs.push(nom + " : non exécutée"); continue; }
    if (p.ok === false) echecs.push(nom + " : " + (p.motif || "échec"));
    if (p.indetermine) echecs.push(nom + " : ÉTAT INDÉTERMINÉ — " + (p.motif || "non relu"));
  }
  return { ok: echecs.length === 0, echecs, code: echecs.length ? 1 : 0 };
}

module.exports = { CIBLES_PROTEGEES, RefusBarriere, empreinte, choisirCible, verifierAttestation, verifierPreuveRevue, exigerFournisseurReel, MARQUEUR_REVUE, PHRASE_MAINTENEUR_UNIQUE, sqlColonnesJournal, sqlAvecJournal, verdictGlobal };
