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

module.exports = { CIBLES_PROTEGEES, RefusBarriere, empreinte, choisirCible, verifierAttestation, sqlColonnesJournal, sqlAvecJournal, verdictGlobal };
