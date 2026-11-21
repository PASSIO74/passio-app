#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// SENTINELLE AUTONOME — ÉTAPE 1 : TROUVER CE QUE SUBISSENT LES UTILISATEURS.
//
// Tourne dans GitHub Actions (pas sur un PC), lit en production `client_errors`,
// les erreurs JS et les appels refusés de `telemetry_events`, et rend UN
// verdict : y a-t-il un défaut qui mérite un correctif automatique ?
//
// ⚠️ IL NE CORRIGE RIEN ET N'ÉCRIT NULLE PART. Il lit, il classe, il rend du
// JSON. Séparer la DÉTECTION de la RÉPARATION est ce qui permet de le tester
// sans base et sans réseau : `classer()` est une fonction pure.
//
// ⚠️ « AUCUNE ERREUR » NE VEUT PAS DIRE « TOUT VA BIEN ». Ce détecteur ne voit
// que ce qui LÈVE une erreur JavaScript. Un bouton qui n'émet plus rien, un
// résultat faux en HTTP 200, une télémétrie interrompue : zéro ligne ici, et ça
// ressemble exactement au calme. C'est l'angle mort documenté en tête de
// `dashboard/server/sentinel.js`, et il ne disparaît pas en changeant de
// machine. Le silence de ce script n'est jamais une preuve de santé.
// ═══════════════════════════════════════════════════════════════════════════

// La quatrième famille (2026-11-06) juge les parcours avec le MÊME registre et
// la MÊME règle que le pilotage du nuage — jamais une copie.
import { CONTRATS, contratDe } from "../supabase/functions/_shared/contrats-actions.js";
import { regrouperFlux, issueFlux, melanger, TRAFIC_ECARTE } from "../supabase/functions/_shared/parcours.js";

// Messages qui ne portent AUCUNE information exploitable : les corriger est
// impossible, les compter fait du bruit qui masque le vrai signal.
//   · « Script error. » = erreur d'un script d'une autre origine, le navigateur
//     REFUSE d'en dire plus par sécurité. Il n'y a rien à lire, jamais.
//   · Les extensions de navigateur du visiteur ne sont pas notre code.
//   · `EmptyRanges` est un défaut des contrôles vidéo intégrés à Safari (bug
//     WebKit 318284). `js/platform.js` ne le remonte plus, mais une page restée
//     ouverte sur l'ancienne version l'enverra encore quelque temps.
export const BRUIT = [
  /^script error\.?$/i,
  /^resizeobserver loop/i,
  /extension:\/\//i,
  /^network ?error$/i,
  /^referenceerror: can't find variable: emptyranges$/i,
];

// Un seul compte qui rencontre une erreur peut être un appareil exotique ; le
// même défaut chez plusieurs comptes est un défaut du produit. On garde les
// deux, mais on les classe différemment.
const MIN_OCCURRENCES = Number(process.env.SENTINELLE_MIN_OCCURRENCES || 3);

// ═══════════════════════════════════════════════════════════════════════════
// VERSIONS ET OCCURRENCES PAR CANDIDAT (2026-09-18)
//
// ⚠️ POURQUOI. Le 2026-09-12, #355 a rouvert mot pour mot #350 : une occurrence
// 41 min après la FUSION du correctif, ~28 min après la fin du déploiement,
// venue d'un client qui gardait encore l'ancien app.js en cache (PWA). La dédup
// ne comparait qu'une date de fermeture d'issue : elle ne pouvait pas savoir
// que la ligne venait d'un vieux build. Depuis d6b54c3a, `telemetry_events.
// app_version` porte le commit déployé (8 hex) — c'est le discriminant qui
// manquait. Chaque candidat garde donc ses versions et ses occurrences
// récentes ; `client_errors` n'a pas la colonne, ses candidats portent
// `versions: {}` et des occurrences sans version (la règle par date s'applique).
// ═══════════════════════════════════════════════════════════════════════════
const MAX_OCCURRENCES = 200;

/** Une version de client vient du NAVIGATEUR : on la borne à une forme sûre. */
function versionSure(v) {
  const s = String(v || "").trim();
  return /^[a-f0-9]{8,40}$/i.test(s) ? s : "";
}

function dateDiagnostic(v) {
  const s = String(v || "");
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(s) ? s : "?";
}

/** Note une occurrence dans un groupe (versions + liste bornée des plus récentes). */
function noterOccurrence(g, at, appVersion) {
  const v = versionSure(appVersion);
  if (v) {
    const e = g.versions[v] || (g.versions[v] = { n: 0, dernier: null });
    e.n++;
    if (!e.dernier || at > e.dernier) e.dernier = at;
  }
  g.occurrences.push({ at, app_version: v || null });
}

/** Ne garde que les MAX_OCCURRENCES plus récentes : ce sont elles qui tranchent la récidive. */
function bornerOccurrences(occurrences) {
  return occurrences
    .slice()
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, MAX_OCCURRENCES);
}

/** Normalise un message pour regrouper les variantes d'une même cause. */
export function empreinte(message) {
  return String(message || "")
    .slice(0, 300)
    .replace(/\d+/g, "#")                      // indices, ids, tailles
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ═══════════════════════════════════════════════════════════════════════════
// DÉSAMORÇAGE DU TEXTE D'UN INCONNU  (2026-09-10)
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ `client_errors` ACCEPTE UN INSERT DE TOUT VISITEUR NON AUTHENTIFIÉ (policy
// « Insert erreurs », rôle `public`, `with_check = true`), et la clé anon est
// dans le JavaScript livré. Le `message` et la `stack` de cette table étaient
// recopiés TELS QUELS dans le corps ET LE TITRE d'une issue `[SENTINELLE]`,
// ouverte au nom du propriétaire avec le label `sentinelle` — c'est-à-dire les
// trois conditions exactes qui arment l'auto-fusion en aval. Un texte choisi par
// un inconnu devenait donc le prompt d'un agent dont la PR part en production.
//
// Déclencher était trivial : `classer()` retient un groupe dès 2 comptes
// distincts, `uid` est une colonne libre, et la production ne porte que
// ~22 erreurs — aucune concurrence pour prendre la première place.
//
// Trois barrières, du plus dur au plus mou :
//   ① le TITRE ne porte plus une ligne de ce texte : il porte l'empreinte
//     normalisée (chiffres et URL déjà remplacés), donc rien de librement
//     choisi ;
//   ② le corps passe par `desamorcer()` : les marqueurs de structure et les
//     lignes en forme d'INSTRUCTION sont neutralisés, la longueur est bornée ;
//   ③ le bloc reste clôturé et annoncé comme de la donnée (barrière molle,
//     conservée mais jamais la seule).
//
// ⚠️ CECI NE REMPLACE PAS LE VRAI CORRECTIF, qui est en base : tant que
// `client_errors` accepte une écriture anonyme avec un `uid` librement choisi,
// la porte reste entrouverte. Voir `migrations/migration_fuites_2026-09-10.sql`.

/** Formes de phrases qui n'ont RIEN à faire dans un message d'erreur de navigateur. */
const FORMES_INSTRUCTION = [
  /\b(ignore|oublie|disregard)\b[^\n]{0,40}\b(instructions?|consignes?|ce qui précède|above|previous)\b/i,
  /\b(nouvelle|new)\b[^\n]{0,20}\b(instructions?|consignes?|t[âa]che|task|r[èe]gles?|rules?)\b/i,
  /\b(system|assistant|user)\s*:/i,
  /\byou are\b|\btu es (un|une)\b|\bagis comme\b|\bact as\b/i,
  /<\/?(system|instructions?|prompt)[^>]*>/i,
  /\b(exfiltr|curl\s|wget\s|process\.env|service_role|SUPABASE_SERVICE|GITHUB_TOKEN|secrets\.)/i,
  /\b(commit|push|merge|fusionne|d[ée]ploie)\b[^\n]{0,30}\b(main|production|prod)\b/i,
];

/**
 * Rend un texte d'origine inconnue inoffensif dans un corps d'issue Markdown.
 * On ne cherche pas à « comprendre » l'attaque : on retire ce qui donne à un
 * texte le POUVOIR d'une instruction (structure Markdown, balises, clôture de
 * bloc) et on remplace les lignes en forme d'ordre par une marque visible.
 */
export function desamorcer(texte, maxLignes = 40) {
  const lignes = String(texte || "")
    .replace(/\r/g, "")
    .split("\n")
    .slice(0, maxLignes);
  return lignes
    .map((ligne) => {
      let l = ligne.slice(0, 300);
      if (FORMES_INSTRUCTION.some((re) => re.test(l))) return "[ligne en forme d'instruction — retirée]";
      // Clôture de bloc, balises et titres Markdown : ce sont les outils qui
      // permettent à un texte de SORTIR de son cadre et de parler en son nom.
      l = l.replace(/`/g, "\u02cb").replace(/[<>]/g, "\u2039");
      l = l.replace(/^\s{0,3}#{1,6}\s/, "");
      // Une MENTION est un d\u00e9clencheur : `claude-code.yml` matche
      // `contains(body/title, '@claude')` sur l'\u00e9v\u00e9nement `issues` \u2014 un texte
      // d'erreur contenant `@claude` (\u00e9crit par n'importe quel client) relan\u00e7ait
      // un second run avant le label, la course A1 que le lot existe pour
      // \u00e9viter (audit 2026-11-02, G-02). Et `@quelqu'un` notifierait une vraie
      // personne depuis une pile d'erreur. Le signe reste lisible, mais ce
      // n'est plus un `@` pour GitHub (\uff20 pleine chasse, U+FF20).
      l = l.replace(/@(?=[A-Za-z0-9_])/g, "\uff20");
      return l;
    })
    .join("\n")
    .trim();
}

export function estDuBruit(message) {
  const m = String(message || "").trim();
  if (!m) return true;
  return BRUIT.some((re) => re.test(m));
}

/**
 * Classe des lignes brutes de `client_errors` en causes candidates.
 * FONCTION PURE — c'est elle que les tests éprouvent, sans base ni réseau.
 *
 * @returns {{candidates: Array, ecartees: number}}
 */
export function classer(lignes = [], options = {}) {
  let nonVerifiees = 0;
  const min = options.min ?? MIN_OCCURRENCES;
  const groupes = new Map();
  let ecartees = 0;

  for (const l of lignes) {
    if (estDuBruit(l.message)) { ecartees++; continue; }
    // ⚠️ ASTRA-06 (2026-09-15) : une ligne dont l'identité n'est PAS posée par le
    // serveur (repli HTTP 400, colonne `auth_uid` absente) ne peut pas peser
    // dans la sélection d'une enquête — `uid` y est écrit par le client, donc
    // fabricable. Elle est écartée et COMPTÉE, jamais classée.
    if (l._origineNonVerifiee) { ecartees++; nonVerifiees++; continue; }
    const cle = empreinte(l.message);
    if (!groupes.has(cle)) {
      groupes.set(cle, { cle, famille: "js", message: String(l.message).slice(0, 300), n: 0, comptes: new Set(), dernier: null, exemple: null, versions: {}, occurrences: [] });
    }
    const g = groupes.get(cle);
    g.n++;
    if (l.uid) g.comptes.add(String(l.uid));
    const at = String(l.created_at);
    if (!g.dernier || at > g.dernier) g.dernier = at;
    noterOccurrence(g, at, l.app_version);
    // On garde UN exemple complet : c'est lui qui porte la pile d'appel, donc
    // le seul contexte qui permette d'établir une cause dans le code.
    if (!g.exemple && (l.stack || l.source)) {
      g.exemple = { stack: String(l.stack || "").slice(0, 2000), source: l.source || null, line: l.line || null, url: l.url || null };
    }
  }

  const candidates = [...groupes.values()]
    .map((g) => ({ ...g, comptes: g.comptes.size, _uids: [...g.comptes], occurrences: bornerOccurrences(g.occurrences) }))
    // ⚠️ LE TRI EST PAR NOMBRE DE COMPTES D'ABORD. Une erreur vue 200 fois par
    // UNE personne est souvent un appareil ou une extension ; vue 3 fois par
    // 3 personnes, c'est le produit. Trier par volume brut ferait travailler la
    // sentinelle sur le cas le moins représentatif.
    .sort((a, b) => (b.comptes - a.comptes) || (b.n - a.n))
    .filter((g) => g.n >= min || g.comptes >= 2);

  return { candidates, ecartees, nonVerifiees };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECONDE FAMILLE — LES APPELS RÉSEAU REFUSÉS (2026-09-09)
//
// ⚠️ POURQUOI ELLE EXISTE. `client_errors` ne porte QUE ce qui LÈVE une erreur
// JavaScript. Or le SDK Supabase NE LÈVE PAS sur un refus : un 401, un 403 ou
// un 500 revient dans `{ error }`, que le code peut ignorer — et il l'ignore
// souvent. Mesuré en production le 2026-09-09 : `client_errors` portait
// 2 lignes sur 7 jours, `telemetry_events` en portait 1 346 de type `api`
// status `error` sur la même fenêtre. Dont 798 refus HTTP 403 sur l'envoi d'un
// message privé, six jours d'affilée, pour QUATRE messages réellement partis.
// La sentinelle regardait la fenêtre où il n'y avait rien.
//
// ⚠️ CE N'EST PAS « TOUT VOIR » POUR AUTANT. Cette famille voit ce que le
// client a DEMANDÉ au serveur et ce que le serveur a RÉPONDU. Un bouton qui
// n'appelle rien, un résultat faux en HTTP 200, une mise en page cassée :
// toujours zéro ligne. L'angle mort recule, il ne disparaît pas.
// ═══════════════════════════════════════════════════════════════════════════

// Un appel qui n'a jamais atteint le serveur (statut 0 : hors ligne, onglet
// fermé, requête annulée) parle de la CONNEXION de l'appareil, pas de notre
// code — et il n'y a rien à corriger. Un refus d'identifiants sur /auth/v1/token
// est un mot de passe faux : le produit fonctionne, c'est la personne qui s'est
// trompée. Les compter noierait le vrai signal.
//
// ⚠️ SAUF QUAND LE CLIENT A PROUVÉ LE CONTRAIRE (2026-09-18). Depuis les
// 13-16/09, `js/telemetry.js` distingue un statut 0 TRANSITOIRE (page masquée,
// hors ligne, fermeture : severity `warn`, meta {masquee|hors_ligne|fermeture})
// d'un statut 0 subi PAGE VISIBLE ET EN LIGNE (severity `error`, sans cause
// transitoire) — une panne CORS, DNS, service worker ou Netlify partielle ne
// produit QUE des statuts 0, et le détecteur les jetait tous. Le second cas
// reste une cause, sous une garde de plus : au moins DEUX comptes (voir
// `classerApi`), parce qu'un seul appareil derrière un réseau d'entreprise ou
// un bloqueur produit exactement le même signal.
//
// Et un refus ATTENDU (`meta.refus_attendu`, posé par le client sur
// /auth/v1/signup 400/401/403/422 : e-mail déjà pris, mot de passe trop court)
// n'est pas plus un défaut qu'un mot de passe faux — la regex sur
// /auth/v1/token est conservée pour les clients d'avant ce marquage.
export function estDuBruitApi(ligne) {
  const code = Number(ligne?.http_status || 0);
  const meta = lireMeta(ligne?.meta);
  if (!code) {
    if (String(ligne?.severity || "") !== "error") return true;
    if (meta.masquee || meta.hors_ligne || meta.fermeture) return true;
    return false;
  }
  if (code >= 400 && code < 500 && meta.refus_attendu === true) return true;
  const e = String(ligne?.endpoint || "");
  if (/\/auth\/v1\/token/.test(e) && code >= 400 && code < 500) return true;
  return false;
}

/**
 * Une cause en TEXTE LIBRE (erreur JS, appel refusé) n'ouvre une enquête confiée à un agent que
 * chez au moins `min` comptes ANCIENS et distincts, comme les boutons morts. Audit de sécurité du
 * 2026-11-06 (E-01) : trois lignes d'un compte créé pour l'occasion suffisaient à écrire la
 * spécification d'un agent, au nom de PASSIO74. FONCTION PURE. `_uids` ne sort jamais d'ici.
 */
export function retenirPreuves(candidats, anciens, min = BOUTON_MORT.comptesMin) {
  const retenus = [];
  let sousLeSeuil = 0;
  for (const { _uids, ...c } of candidats) {
    const nb = (_uids || []).filter((u) => anciens.has(u)).length;
    if (nb >= min) retenus.push(c); else sousLeSeuil++;
  }
  return { retenus, sousLeSeuil };
}

/** `meta` est un jsonb : PostgREST rend un objet, mais on tolère une chaîne. */
function lireMeta(meta) {
  if (!meta) return {};
  if (typeof meta === "string") { try { const o = JSON.parse(meta); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } }
  return typeof meta === "object" ? meta : {};
}

const MIN_OCCURRENCES_API = Number(process.env.SENTINELLE_MIN_API || 5);
// Un statut 0 « page visible, en ligne » n'est une cause qu'à partir de DEUX
// comptes : un seul appareil qui n'atteint pas le serveur, c'est son réseau.
const MIN_COMPTES_STATUT_0 = 2;

/** Nomme un refus en une phrase lisible, sans jamais inventer de cause. */
export function libelleApi(methode, chemin, code) {
  const quoi = {
    0: "aucune réponse reçue — page visible et en ligne, le serveur n'a pas été atteint",
    401: "refusé — jeton absent ou expiré",
    403: "refusé — la règle d'accès (RLS) dit non",
    404: "introuvable",
    409: "conflit — la ligne existe déjà",
    429: "plafond de débit atteint",
    500: "erreur du serveur",
  }[Number(code)] || "en échec";
  return `HTTP ${code} sur ${methode} ${chemin} : ${quoi}`;
}

/**
 * Classe des lignes `telemetry_events` (type=api, status=error) en causes.
 * FONCTION PURE, comme `classer()` — éprouvée sans base et sans réseau.
 */
// ⚠️ LA FAMILLE API N'ENQUÊTE QUE SUR CE QU'UN COMPTE A RENCONTRÉ (ASTRA-06,
// 2026-09-14). `telemetry_events` accepte une écriture ANONYME et `user_id` y
// est écrit par le client : cinq lignes fictives sans compte suffisaient à
// désigner la cible d'une enquête dont la PR est fusionnée automatiquement.
// Une ligne sans `user_id` en forme d'uuid est ÉCARTÉE. Résidu, écrit : un
// client hostile peut recopier des uuid publics (`profiles` est lisible) — la
// fermeture complète est une colonne `auth_uid` posée par le serveur sur
// `telemetry_events`, comme `client_errors` l'a depuis le 2026-09-10
// (migration, lot « périmètre critique »).
const RE_COMPTE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function estSansCompte(ligne) {
  return !RE_COMPTE.test(String((ligne && ligne.user_id) || ""));
}

export function classerApi(lignes = [], options = {}) {
  const min = options.min ?? MIN_OCCURRENCES_API;
  let nonVerifiees = 0;
  const groupes = new Map();
  let ecartees = 0;

  for (const l of lignes) {
    if (estDuBruitApi(l)) { ecartees++; continue; }
    if (l._origineNonVerifiee) { ecartees++; nonVerifiees++; continue; }   // ASTRA-06 : voir classer()
    if (estSansCompte(l)) { ecartees++; continue; }
    const code = Number(l.http_status);
    // `endpoint` porte l'hôte ; le CHEMIN suffit à nommer la cause, et il ne
    // change pas d'un projet Supabase à l'autre.
    const chemin = String(l.endpoint || "").replace(/^[^/]*/, "").replace(/\?.*$/, "") || "/";
    const methode = (String(l.action || "").match(/^([A-Z]+) /) || [, "?"])[1];
    const cle = `${methode} ${chemin} ${code}`;
    if (!groupes.has(cle)) {
      groupes.set(cle, {
        cle, famille: "api", methode, chemin, code,
        message: libelleApi(methode, chemin, code),
        n: 0, comptes: new Set(), dernier: null, exemple: null, versions: {}, occurrences: [],
      });
    }
    const g = groupes.get(cle);
    g.n++;
    if (l.user_id) g.comptes.add(String(l.user_id));
    const at = String(l.received_at);
    if (!g.dernier || at > g.dernier) g.dernier = at;
    noterOccurrence(g, at, l.app_version);
  }

  const candidates = [...groupes.values()].map((g) => {
    const comptes = g.comptes.size;
    return {
      ...g, comptes, _uids: [...g.comptes], occurrences: bornerOccurrences(g.occurrences),
      // Ce texte remplace la pile d'appel : c'est le seul contexte dont
      // disposera l'enquête, puisqu'aucune erreur JS n'a été levée.
      exemple: {
        stack: [
          `${g.methode} ${g.chemin} → HTTP ${g.code}`,
          `${g.n} appel(s) refusé(s), ${comptes} compte(s) identifié(s).`,
          "",
          "Aucune erreur JavaScript n'a été levée : le SDK Supabase rend le refus",
          "dans { error } au lieu de lever. Chercher l'appelant de ce chemin et",
          "vérifier qu'il LIT { error } — un refus non lu laisse l'action affichée",
          "comme réussie, et une file d'envoi le rejoue indéfiniment.",
          "",
          "Si la cause est une règle d'accès (RLS) ou une migration, elle est HORS",
          "du périmètre autorisé : décrire la cause et laisser la main.",
        ].join("\n"),
        source: null, line: null, url: null,
      },
    };
  })
    // Même doctrine de tri que la famille JS : les comptes d'abord.
    .sort((a, b) => (b.comptes - a.comptes) || (b.n - a.n))
    .filter((g) => (g.n >= min || g.comptes >= 2) && (g.code !== 0 || g.comptes >= MIN_COMPTES_STATUT_0));

  return { candidates, ecartees, nonVerifiees };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUATRIÈME FAMILLE — LES PARCOURS QUI ÉCHOUENT (2026-11-06)
//
// C'est l'angle mort écrit en tête de ce fichier : « un résultat faux en HTTP
// 200 » ne lève aucune erreur JS et aucun appel en échec. Les flux d'action
// (`tel.flowStart` → `step "saved"`) disent, eux, si la SOURCE DE VÉRITÉ a
// accepté. Une action dont la confirmation est un échec (hors refus légitime
// et hors file locale, contrats-actions.js) devient un candidat, groupé par
// action et par code fermé. Règles, une par piège :
//  · identité SERVEUR seulement (`auth_uid`, posée par le trigger) — une
//    ligne sans compte ou au format douteux est écartée et comptée ;
//  · comptes ANCIENS seulement, comme les boutons (revue de sécurité du
//    2026-11-06) : une enquête peut finir en PR fusionnée seule, et des
//    comptes se créent en une minute. Deux passages : le premier désigne les
//    comptes à vérifier (`comptesAnciens: "tous"`, `avecUids`), le second ne
//    compte que ceux que `lireComptesAnciens` a relus. Sans cet ensemble, RIEN
//    n'est retenu : l'absence de preuve n'est jamais une preuve ;
//  · une action sans verdict n'est PAS un échec (télémétrie perdue possible) :
//    elle se lit au pilotage (« sans verdict »), elle n'ouvre pas d'enquête ;
//  · le titre ne porte QUE l'identifiant du contrat (revue adversariale du
//    2026-11-06) : un code de refus dans le titre laissait un navigateur choisir
//    des mots, et chaque nouveau code contournait la dédup (titre neuf). Un
//    candidat par ACTION ; les codes, FERMÉS (`codeFerme`), vont dans le corps ;
//  · au moins DEUX comptes anciens distincts — jamais « assez d'occurrences »
//    d'un seul compte ;
//  · UNE zone pour toute la famille (`zoneCible`), comme les boutons : un flot
//    de parcours forgés ne prend jamais les places d'un défaut réel.
// Cette famille est un CONFORT comme les boutons : sa lecture qui échoue ne
// fait jamais échouer la détection.
// ═══════════════════════════════════════════════════════════════════════════
export function classerParcours(lignes = [], options = {}) {
  const anciens = options.comptesAnciens;
  const contrats = options.contrats || CONTRATS;
  const maintenant = Number.isFinite(options.maintenant) ? options.maintenant : Date.now();
  const { flux } = regrouperFlux(lignes, contrats);
  const groupes = new Map();
  let ecartees = 0, nonVerifiees = 0;
  for (const f of flux.values()) {
    const contrat = f.action ? contratDe(f.action, contrats) : null;
    if (!contrat) continue;
    if (f.synthetique) { ecartees++; continue; }
    if (issueFlux(f, contrat, maintenant) !== "echoue") continue;
    if (!RE_COMPTE.test(String(f.compte || ""))) { ecartees++; nonVerifiees++; continue; }
    if (anciens !== "tous" && !(anciens instanceof Set && anciens.has(String(f.compte)))) { ecartees++; nonVerifiees++; continue; }
    const rc = f.rc || "sans_code";
    const cle = `parcours ${contrat.id}`;
    if (!groupes.has(cle)) {
      groupes.set(cle, { cle, famille: "parcours", action: contrat.id, message: `Parcours « ${contrat.libelle} » : refus de la source de vérité`,
        n: 0, comptes: new Set(), codes: new Map(), dernier: null, exemple: null, versions: {}, occurrences: [] });
    }
    const g = groupes.get(cle);
    g.n++;
    g.comptes.add(String(f.compte));
    g.codes.set(rc, (g.codes.get(rc) || 0) + 1);
    const at = Number.isFinite(f.debutRecu) ? new Date(f.debutRecu).toISOString() : "";
    if (at && (!g.dernier || at > g.dernier)) g.dernier = at;
    noterOccurrence(g, at, f.version);
  }
  const candidates = [...groupes.values()].map((g) => {
    const comptes = g.comptes.size;
    const c = contrats[g.action];
    const { comptes: ensemble, codes: lesCodes, ...reste } = g;
    const codes = [...lesCodes.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5);
    return {
      ...reste, comptes, codes: codes.map(([code, n]) => ({ code, n })), occurrences: bornerOccurrences(g.occurrences),
      // Le premier passage seulement : les identités ne partent jamais dans le verdict (résumé PUBLIC).
      ...(options.avecUids ? { _uids: [...ensemble] } : {}),
      // Le contexte que l'enquête n'aurait pas autrement : le contrat lui-même.
      exemple: {
        stack: [
          `Contrat ${c.id} (supabase/functions/_shared/contrats-actions.js) — ${c.libelle}`,
          `Source de vérité : ${c.verite}`,
          `Confirmation attendue : étape « ${c.confirmation} » au verdict de l'écriture.`,
          `Codes des refus (fermés : SQLSTATE, PostgREST ou codes de l'app) : ${codes.map(([c, n]) => c + " ×" + n).join(", ")} — ${g.n} échec(s), ${comptes} compte(s) ancien(s).`,
          `Émetteur(s) : ${c.emetteurs.join(", ")} ; verrou(x) : ${c.verrous.join(", ")}.`,
          "",
          "Aucune erreur JavaScript n'a pu être levée : l'écriture a rendu un refus que",
          "l'app a LU et rapporté. Établir pourquoi la source de vérité refuse (code",
          "PostgreSQL ou PostgREST) et si l'app envoie ce qu'elle doit. Un refus qui",
          "vient d'une règle d'accès (RLS) ou d'une migration est HORS du périmètre",
          "autorisé : décrire la cause et laisser la main.",
        ].join("\n"),
        source: null, line: null, url: null,
      },
    };
  })
    .sort((a, b) => (b.comptes - a.comptes) || (b.n - a.n))
    // Deux comptes ANCIENS distincts au moins : jamais un seul compte, même en boucle.
    .filter((g) => g.comptes >= 2);
  return { candidates, ecartees, nonVerifiees };
}

/**
 * Quels comptes relire, et combien : PAR ACTION, au HASARD, sous un budget total.
 * ⚠️ Jamais « les n premiers » d'une liste dont l'ordre est celui que les émetteurs
 * choisissent : une nuée de comptes neufs y repousserait les anciens au-delà du
 * plafond de lecture et tairait une vraie panne (revue de sécurité du 2026-11-06).
 * Ce que le budget n'a pas permis de relire est COMPTÉ (`nonVerifies`), et dit.
 * FONCTION PURE (`aleatoire` injectable pour les bancs).
 */
export const PARCOURS_VERIFICATION = Object.freeze({ parAction: 30, total: 150 });
export function uidsAVerifier(candidats, { parAction = PARCOURS_VERIFICATION.parAction, total = PARCOURS_VERIFICATION.total, aleatoire = null } = {}) {
  const parA = new Map();
  for (const c of Array.isArray(candidats) ? candidats : []) {
    // Un parcours se range par ACTION ; une erreur JS, un appel refusé ou un bouton n'en ont pas
    // et se rangent par leur clé (2026-11-21) — sans elle, ces trois familles n'avaient aucun lot.
    const cle = c && (c.action || c.cle);
    if (!cle) continue;
    const e = parA.get(cle) || new Set();
    for (const u of c._uids || []) e.add(u);
    parA.set(cle, e);
  }
  const lots = [];
  let reste = total, nonVerifies = 0;
  for (const [action, e] of parA) {
    const tous = melanger([...e], aleatoire);
    const n = Math.max(0, Math.min(parAction, reste, tous.length));
    lots.push({ action, uids: tous.slice(0, n) });
    nonVerifies += tous.length - n;
    reste -= n;
  }
  return { lots, nonVerifies };
}

/** Les flux de la fenêtre : la seule colonne d'identité retenue est `auth_uid` (serveur). */
// Les SEULES clés utiles de `meta`, à plat (un `meta` hostile peut peser des
// mégaoctets), et jamais une ligne sans identité serveur (elle ne pèse rien, et
// un flot anonyme poussait les vraies lignes hors des pages : « incomplet »).
export const CHEMIN_FLUX = "telemetry_events?select=event_id,correlation_id,action,status,auth_uid,received_at,client_ts,app_version,flow_action:meta->>flow_action,step:meta->>step,rc:meta->>rc,synthetic:meta->>synthetic,trafic:meta->>trafic&type=eq.flow&auth_uid=not.is.null";

// ═══════════════════════════════════════════════════════════════════════════
// TROISIÈME FAMILLE — LES BOUTONS QUI N'ONT AUCUN EFFET MESURÉ (2026-09-10)
//
// ⚠️ CETTE FAMILLE NE DÉCLENCHE JAMAIS DE CORRECTION AUTOMATIQUE, ET C'EST SA
// DÉFINITION MÊME. Elle ne prouve RIEN : elle range des SUSPECTS.
//
// Le raisonnement : un clic est enregistré (`type=click`) ; si aucun événement
// `action` / `nav` / `api` / `flow` ne suit dans la même session en 3 secondes,
// le geste n'a produit aucun effet OBSERVABLE. Un bouton mort donne ça.
//
// ⚠️ MAIS UN BOUTON PARFAITEMENT VIVANT AUSSI, et c'est mesuré : « Chercher »
// de l'écran Rencontrer sort à 8 % de suivi (13 clics, 1 effet) — il ouvre une
// fenêtre de recherche de passion qui n'émet AUCUNE télémétrie. Le clic n'a pas
// d'effet ABSENT, il a un effet NON INSTRUMENTÉ. Les deux sont indiscernables
// ici, et aucune requête plus fine ne les distinguera : la seule vraie réponse
// est d'instrumenter les effets.
//
// D'où la règle : ce classement paraît dans le RÉSUMÉ DU RUN, pour qu'un humain
// aille regarder. Il n'entre jamais dans `cible`, donc il n'ouvre aucune issue,
// donc il ne peut pas produire un correctif écrit à l'aveugle sur un bouton qui
// marche. Le jour où les ouvertures de panneau seront instrumentées, ce signal
// deviendra fiable — pas avant.
// ═══════════════════════════════════════════════════════════════════════════

const BOUTON_FENETRE_MS = Number(process.env.SENTINELLE_BOUTON_MS || 3000);
const BOUTON_MIN_CLICS = Number(process.env.SENTINELLE_BOUTON_MIN || 10);
// ⚠️ LE CLIC EST HORODATÉ APRÈS LA PEINTURE (2026-11-01). js/telemetry.js
// n'émet l'événement `click` qu'après deux requestAnimationFrame, avec un
// secours à 1 000 ms : son `client_ts` suit le toucher réel de 16 ms à 1 s.
// Un effet émis DANS le handler (nav, action, appel réseau) porte donc un
// horodatage ANTÉRIEUR à celui du clic — et la règle « effet strictement
// après » comptait mort tout bouton dont l'effet est immédiat. On accepte un
// effet jusqu'à `BOUTON_AVANCE_MS` avant l'horodatage du clic.
const BOUTON_AVANCE_MS = 1100;
const aSonEffet = (suite, t, fenetre) => suite.some((te) => te > t - BOUTON_AVANCE_MS && te <= t + fenetre);

// ═══════════════════════════════════════════════════════════════════════════
// CE QUI N'EST PAS L'EFFET D'UN CLIC, ET CE QUI N'EST PAS UN CLIC DU PUBLIC
// (2026-11-21, audit « la surveillance tient-elle à 100 000 ? », T4)
//
// ① LES MARQUEURS DE POSE. Six lots d'interface émettent une `action` quand ils
// se POSENT sur la page (`if (apply()) track("ui_v…")`), deux fois par
// chargement, jamais sur un geste. Mesuré le 21/11 sur 72 h : 984 des 1 909
// « effets » lus (52 %). Un marqueur tombé dans les 3 s d'un clic le sauvait
// donc à tort, et la moitié du budget de lecture partait dans du bruit.
// ⚠️ LISTE FERMÉE, PAS LE MOTIF « ui_v* » : `ui_v2_nav`, `ui_v4a5_ouvre` ou
// `ui_v7_profil_onglet` sont de VRAIS effets d'un clic. Le banc confronte cette
// liste au code (`js/*.js`) : un marqueur de pose ajouté sans l'inscrire ici le
// fait rougir, et c'est voulu — l'inscrire touche `scripts/`, donc la contre-revue.
// ⚠️ C'EST LE SEUL CHANGEMENT DU LOT QUI PEUT AJOUTER UN CLIC MORT. Les autres
// gardes (identité serveur, comptes anciens, libellé du code, écran réel, clics
// rageurs, une seule enquête bouton) sont intactes.
// L'exclusion ne vit QUE dans `indexEffets` : un filtre côté serveur
// (`or=(…)`) n'aurait pu être éprouvé qu'en production, le jour où la famille
// aurait enfin eu quelque chose à juger.
//
// ② LE TRAFIC HORS PUBLIC. Un robot ou une émulation (`meta.trafic`, posé par
// js/telemetry.js) ne pèse pas : même règle et MÊME ensemble que la famille
// parcours (`TRAFIC_ECARTE`, parcours.js). L'équipe RESTE — ses clics sont de
// vrais clics, et une panne vue par l'équipe est une panne. Ce sont les CLICS
// qui sortent, jamais les seuls « effets » : retirer les effets d'un appareil en
// gardant ses clics ferait de chacun d'eux un clic mort.
// ═══════════════════════════════════════════════════════════════════════════
export const MARQUEURS_POSE = Object.freeze(["ui_v4a4_pose", "ui_v6_composer", "ui_v6a_inbox", "ui_v6b_profil", "ui_v6c_pose", "ui_v7_lot"]);
const ENSEMBLE_MARQUEURS = new Set(MARQUEURS_POSE);
/** Un marqueur de pose : émis par le chargement de la page, jamais par un geste. */
export const estEffetAmbiant = (e) => ENSEMBLE_MARQUEURS.has(String((e && e.action) || ""));
/** Le clic vient-il d'un robot ou d'une émulation ? (`trafic` à plat dans la lecture, `meta.trafic` sinon.) */
export const estHorsPublic = (c) => TRAFIC_ECARTE.has(String((c && (c.trafic || lireMeta(c.meta).trafic)) || ""));

/**
 * Index session → instants des effets, triés. Sans lui, chaque clic balaierait
 * TOUS les effets. Les marqueurs de pose n'y entrent pas. FONCTION PURE, seule
 * source des deux classements (`classerBoutons`, `classerBoutonsMorts`).
 */
export function indexEffets(effets = []) {
  const parSession = new Map();
  for (const e of Array.isArray(effets) ? effets : []) {
    const k = String((e && e.session_id) || "");
    if (!k || estEffetAmbiant(e)) continue;
    if (!parSession.has(k)) parSession.set(k, []);
    parSession.get(k).push(Date.parse(e.client_ts));
  }
  for (const liste of parSession.values()) liste.sort((a, b) => a - b);
  return parSession;
}

// Un identifiant de session part dans une URL (`session_id=in.(…)`) : il est
// écrit par le NAVIGATEUR, donc borné à une forme sûre — ni virgule, ni
// parenthèse, ni longueur libre. Mesuré le 21/11 : 27 caractères au plus,
// aucune ligne hors de cette forme. Un clic dont la session n'a pas cette forme
// ne pèse rien : son effet ne pourrait pas être relu.
const RE_SESSION = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * La lecture de la famille bouton, en deux temps (voir `lireFamilleBoutons`).
 *  · sessionsMax : sessions relues par passage, tous groupes suspects confondus ;
 *  · sessionsParRequete × 65 caractères = 2 600 au plus dans le filtre d'une URL ;
 *  · pagesParRequete : au-delà, le lot est dit « non lu » (jamais lu à moitié) ;
 *  · margeMs : un effet encore en route ne doit pas faire passer un clic récent
 *    pour mort — les clics s'arrêtent deux minutes avant l'instant du passage,
 *    les effets commencent deux minutes plus tôt et vont jusqu'à l'instant ;
 *  · dureeMaxMs : le job a 15 minutes, et un job tué par son délai ne laisse ni
 *    verdict ni alerte. Passé ce délai, on ne lit plus de nouveau lot.
 */
export const BOUTONS_LECTURE = Object.freeze({ sessionsMax: 2000, sessionsParRequete: 40, pagesParRequete: 5, margeMs: 120_000, dureeMaxMs: 120_000 });
/** Ce que le classement du résumé couvre désormais — écrit DANS le classement, pour qu'il ne soit pas lu pour plus. */
export const PORTEE_SUSPECTS = "groupes jugés, comptes seulement";
/** La clé de groupe d'un clic — une seule composition, pour le classement et pour ceux qui le filtrent. */
const cleBouton = (c) => `bouton ${String((c && c.screen) || "")} · ${String((c && c.action) || "").trim().slice(0, 60)}`;

/**
 * Range les libellés de clic par TAUX D'EFFET OBSERVÉ, du plus suspect au moins.
 * FONCTION PURE — éprouvée sans base et sans réseau, comme ses deux sœurs.
 *
 * @param clics   [{action, screen, session_id, client_ts}]
 * @param effets  [{session_id, client_ts}]  (type action|nav|api|flow)
 */
export function classerBoutons(clics = [], effets = [], options = {}) {
  const fenetre = options.fenetreMs ?? BOUTON_FENETRE_MS;
  const min = options.min ?? BOUTON_MIN_CLICS;

  const parSession = indexEffets(effets);

  const groupes = new Map();
  for (const c of clics) {
    const t = Date.parse(c.client_ts);
    if (!Number.isFinite(t)) continue;
    // ⚠️ Le libellé PORTE le texte du bouton, donc potentiellement le nom d'une
    // passion écrite par la personne. On le tronque et on ne le sort qu'ici,
    // dans un résumé de run — jamais dans une issue publique.
    const cle = `${String(c.screen || "?")} · ${String(c.action || "?").slice(0, 60)}`;
    if (!groupes.has(cle)) groupes.set(cle, { cle, ecran: c.screen || "?", libelle: String(c.action || "?").slice(0, 60), clics: 0, avecEffet: 0 });
    const g = groupes.get(cle);
    g.clics++;
    const suite = parSession.get(String(c.session_id || "")) || [];
    if (aSonEffet(suite, t, fenetre)) g.avecEffet++;
  }

  return [...groupes.values()]
    .filter((g) => g.clics >= min)
    .map((g) => ({ ...g, tauxEffet: Math.round((100 * g.avecEffet) / g.clics) }))
    .sort((a, b) => (a.tauxEffet - b.tauxEffet) || (b.clics - a.clics));
}

// ═══════════════════════════════════════════════════════════════════════════
// BOUTONS MORTS → ENQUÊTE (2026-11-01, demande de Benjamin : « la Sentinelle
// doit aussi régler les clics sans effet, automatiquement »)
//
// `classerBoutons` ne faisait qu'un classement pour le résumé du run, et
// l'écrivait : un taux bas peut être un bouton mort comme un effet non
// instrumenté (ouvrir un menu, fermer une fenêtre n'émettent rien). Pour
// qu'un bouton devienne une ENQUÊTE confiée à Claude, il faut davantage que
// « peu d'effets » — preuves cumulées :
//
//   ① des CLICS RAGEURS : la même personne retape le même bouton dans la même
//      session, sans effet, dans la fenêtre. Un bouton « fermer » est tapé
//      une fois ; un bouton mort est tapé deux, trois fois ;
//   ② chez des comptes DISTINCTS à identité SERVEUR (`auth_uid`), ANCIENS
//      (créés depuis `BOUTON_MORT.ancienneteMinMs`, lu côté authentification,
//      jamais dans `profiles` qu'un client écrit) — même doctrine que le retour
//      arrière (revues du 2026-10-12) : trois comptes créés pour l'occasion ne
//      lancent rien ;
//   ③ un taux d'effet bas sur un volume suffisant ;
//   ④ un ÉCRAN RÉEL (`id="screen-…"` d'index.html) et un libellé ÉGAL à un
//      libellé écrit dans le code (`libellesDuCode`).
//
// ⚠️ CONTRE-REVUE DU 2026-11-03 (PR #677) — la première version cherchait le
// libellé comme SOUS-CHAÎNE des 4 Mo d'index.html + js/*.js : 84 % des paires
// de lettres, « Marie », « Julie », « Annecy », « gmail.com » passaient. Le
// dépôt est PUBLIC et l'issue arme l'auto-fusion : un pseudo ou une passion lus
// sur le texte d'un bouton finissaient dans le titre d'une issue publique. La
// garde est désormais une ÉGALITÉ EXACTE avec un ensemble fermé extrait des
// ATTRIBUTS (`data-tel`, `data-screen`, `aria-label`, `id`) et des textes de
// `<button>` littéraux — jamais une valeur qui porte une interpolation.
// ⚠️ Et l'horodatage d'une occurrence est celui du SERVEUR (`received_at`) :
// avec `client_ts`, une horloge en avance (ou choisie) rendait chaque
// occurrence « postérieure au correctif », et la dédup datée ne taisait plus
// jamais le défaut. `client_ts` ne sert qu'à apparier un clic et son effet
// DANS UNE MÊME SESSION.
// ⚠️ Écrans inventés (`x1`, `x2`…) = zones infinies : refusés. Et une seule
// enquête bouton à la fois (`zoneCible`, `choisirCibles`), pour qu'un flot de
// boutons ne prenne jamais les places d'un défaut réel.
//
// Seuls les clics SANS effet sont des occurrences : ce sont eux que la dédup
// datée (`dejaCorrige`) compare au déploiement du correctif.
// ═══════════════════════════════════════════════════════════════════════════
export const BOUTON_MORT = Object.freeze({ clicsMin: 10, comptesMin: 3, rageursMin: 2, tauxEffetMax: 20, ancienneteMinMs: 7 * 864e5, comptesLusMax: 60 });
const RE_LIBELLE_SUR = /^[^\x00-\x1f<>`${}\\]{3,60}$/u;

/** Libellés écrits dans le code : valeurs d'attributs et textes de bouton LITTÉRAUX (≥ 3 caractères). */
export function libellesDuCode(code) {
  const ensemble = new Set();
  if (typeof code !== "string") return ensemble;
  const garder = (v, prefixe = "") => {
    const s = String(v || "").trim();
    if (RE_LIBELLE_SUR.test(s) && !s.includes("${") && !/['"+]\s*\+|\+\s*['"]/.test(s)) ensemble.add(prefixe + s);
  };
  for (const m of code.matchAll(/\b(?:data-tel|data-screen|aria-label)=["']([^"'\n]{3,60})["']/g)) garder(m[1]);
  for (const m of code.matchAll(/\bid=["']([A-Za-z][\w-]{1,58})["']/g)) garder(m[1], "#");
  for (const m of code.matchAll(/<button\b[^>]*>([^<>\n]{3,40})<\/button>/g)) garder(m[1]);
  return ensemble;
}

/** Écrans réels de l'app : `id="screen-<nom>"` d'index.html. */
export function ecransDuCode(code) {
  const ensemble = new Set();
  if (typeof code !== "string") return ensemble;
  for (const m of code.matchAll(/\bid=["']screen-([a-z0-9_-]{1,30})["']/g)) ensemble.add(m[1]);
  return ensemble;
}

/** Le libellé est-il EXACTEMENT un libellé du code (donc ni une donnée personnelle, ni un choix d'inconnu) ? */
export function libelleDuCode(libelle, libelles) {
  const l = String(libelle || "").trim();
  return RE_LIBELLE_SUR.test(l) && libelles instanceof Set && libelles.has(l);
}

/**
 * Candidats « bouton mort », de la même forme que ceux de `classer`/`classerApi`.
 * FONCTION PURE. `clics` : [{action, screen, session_id, client_ts, received_at, auth_uid, app_version, trafic}].
 * `options` : { libelles: Set, ecrans: Set, comptesAnciens: Set | "tous", avecUids }.
 * Sans `libelles`, `ecrans` ou `comptesAnciens`, rien n'est retenu : l'absence
 * de preuve n'est jamais une preuve. `comptesAnciens: "tous"` ne sert qu'aux
 * premiers passages de `lireFamilleBoutons`, qui désignent les sessions puis
 * les comptes à relire ; `avecUids` y ajoute `_uids` et `_sessions`, qui ne
 * sortent jamais du détecteur.
 * Rend aussi `horsPublic` (clics de robots et d'émulations, écartés) et
 * `sessionsInvalides` (clics dont la session ne peut pas être relue).
 */
export function classerBoutonsMorts(clics = [], effets = [], options = {}) {
  const fenetre = options.fenetreMs ?? BOUTON_FENETRE_MS;
  const seuils = { ...BOUTON_MORT, ...(options.seuils || {}) };
  const libelles = options.libelles instanceof Set ? options.libelles : new Set();
  const ecrans = options.ecrans instanceof Set ? options.ecrans : new Set();
  const anciens = options.comptesAnciens;
  const estAncien = (uid) => anciens === "tous" || (anciens instanceof Set && anciens.has(uid));
  const parSession = indexEffets(effets);
  const groupes = new Map();
  let nonVerifiees = 0;
  let recents = 0;
  let horsPublic = 0;
  let sessionsInvalides = 0;
  for (const c of clics) {
    const t = Date.parse(c.client_ts);
    const recu = Date.parse(c.received_at);
    if (!Number.isFinite(t) || !Number.isFinite(recu)) continue;
    const uid = String(c.auth_uid || "");
    if (!RE_COMPTE.test(uid)) { nonVerifiees++; continue; }
    // Robot ou émulation : le clic ne pèse pas, et il est compté (voir l'en-tête « hors public »).
    if (estHorsPublic(c)) { horsPublic++; continue; }
    if (!estAncien(uid)) { recents++; continue; }
    const ecran = String(c.screen || "");
    const libelle = String(c.action || "").trim().slice(0, 60);
    if (!ecrans.has(ecran) || !libelleDuCode(libelle, libelles)) continue;
    // Une session dont l'identifiant ne peut pas partir dans une URL ne peut pas être relue : le
    // clic ne pèse rien. Compté À PART des identités (`nonVerifiees` compte des COMPTES).
    const sess = String(c.session_id || "");
    if (!RE_SESSION.test(sess)) { sessionsInvalides++; continue; }
    const cle = cleBouton(c);
    if (!groupes.has(cle)) {
      groupes.set(cle, { cle, famille: "bouton", ecran, libelle, message: `Clic sans effet : « ${libelle} » (écran ${ecran})`,
        n: 0, clics: 0, avecEffet: 0, comptes: new Set(), rageurs: new Set(), morts: new Map(), sessions: new Set(), dernier: null, exemple: null, versions: {}, occurrences: [] });
    }
    const g = groupes.get(cle);
    // TOUTES les sessions du groupe, effet ou non : ce sont elles qu'il faut relire pour le juger.
    g.sessions.add(sess);
    g.clics++;
    if (aSonEffet(parSession.get(sess) || [], t, fenetre)) { g.avecEffet++; continue; }
    g.comptes.add(uid);
    // L'instant d'une occurrence est celui du SERVEUR (voir l'en-tête).
    const at = new Date(recu).toISOString();
    g.n++;
    if (!g.dernier || at > g.dernier) g.dernier = at;
    noterOccurrence(g, at, c.app_version);
    // Clic rageur : un AUTRE clic mort, même session, même bouton, dans la fenêtre.
    const precedents = g.morts.get(sess) || [];
    if (precedents.some((tp) => Math.abs(t - tp) <= fenetre)) g.rageurs.add(uid);
    precedents.push(t);
    g.morts.set(sess, precedents);
  }
  const candidates = [...groupes.values()]
    .map(({ morts, sessions, ...g }) => ({ ...g, comptes: g.comptes.size, rageurs: g.rageurs.size, _uids: [...g.comptes], _sessions: [...sessions],
      tauxEffet: Math.round((100 * g.avecEffet) / g.clics), occurrences: bornerOccurrences(g.occurrences) }))
    .filter((g) => g.clics >= seuils.clicsMin && g.comptes >= seuils.comptesMin
      && g.rageurs >= seuils.rageursMin && g.tauxEffet <= seuils.tauxEffetMax)
    .sort((a, b) => (b.comptes - a.comptes) || (b.n - a.n))
    // Les identifiants — comptes ET sessions — ne sortent JAMAIS du détecteur (le verdict paraît dans un résumé public).
    .map(({ _uids, _sessions, ...g }) => (options.avecUids ? { ...g, _uids, _sessions } : g));
  return { candidates, nonVerifiees, recents, horsPublic, sessionsInvalides };
}

/**
 * Le classement `classerBoutons` paraît dans le RÉSUMÉ du run, lisible par tous
 * (dépôt public) : un libellé ou un écran qui n'est pas un texte du code y est
 * remplacé par un marqueur. FONCTION PURE. (Contre-revue du 2026-11-03 : le
 * commentaire « jamais dans une issue publique » ne protégeait rien — le
 * résumé l'est tout autant.)
 */
export function masquerSuspects(liste, { libelles, ecrans } = {}) {
  return (Array.isArray(liste) ? liste : []).map((g) => {
    const libelle = libelleDuCode(g.libelle, libelles) ? g.libelle : "(texte hors code)";
    const ecran = ecrans instanceof Set && ecrans.has(String(g.ecran)) ? g.ecran : "?";
    return { ...g, cle: `${ecran} · ${libelle}`, ecran, libelle };
  });
}

/**
 * Comptes créés depuis au moins `ancienneteMinMs`, lus sur l'API d'administration
 * de l'authentification (`auth.users.created_at`, jamais `profiles`). Bornés à
 * `comptesLusMax` lectures ; un compte illisible n'est pas ancien.
 *
 * ⚠️ UN REFUS N'EST PLUS UN « COMPTE RÉCENT » MUET (2026-11-21). La garde se ferme
 * toujours — illisible = pas ancien — mais chaque lecture refusée (429, 5xx,
 * délai, réseau) est COMPTÉE dans `echecs.n`, que le verdict publie. Un 404
 * n'en est pas un : le compte a été supprimé, la réponse est lue.
 * ⚠️ COUPE-CIRCUIT : un paquet ENTIER de dix lectures refusées dit que le service
 * ne répond plus ; `echecs.coupe` se lève, et plus rien n'est lu avec ce même
 * compteur — le reste est compté refusé. Sans lui : jusqu'à 450 lectures par
 * paquets de dix, dix secondes de délai chacun, soit sept minutes et demie dans
 * un job de 15 minutes dont le dépassement ne laisse aucun verdict.
 */
export async function lireComptesAnciens({ url, cle, uids, maintenant = Date.now(), echecs = { n: 0 } }) {
  const anciens = new Set();
  const liste = [...new Set(uids)].filter((u) => RE_COMPTE.test(u)).slice(0, BOUTON_MORT.comptesLusMax);
  for (let i = 0; i < liste.length; i += 10) {
    const paquet = liste.slice(i, i + 10);
    if (echecs.coupe) { echecs.n += paquet.length; continue; }
    const avant = echecs.n;
    await Promise.all(paquet.map(async (uid) => {
      try {
        // Délai borné : la famille bouton est un confort, elle ne bloque jamais la détection.
        const r = await fetch(`${url}/auth/v1/admin/users/${uid}`, { headers: { apikey: cle, Authorization: "Bearer " + cle }, signal: AbortSignal.timeout(10_000) });
        if (!r.ok) { if (r.status !== 404) echecs.n++; return; }
        const u = await r.json();
        const cree = Date.parse(u && u.created_at);
        if (Number.isFinite(cree) && maintenant - cree >= BOUTON_MORT.ancienneteMinMs) anciens.add(uid);
      } catch (e) { echecs.n++; /* illisible = pas ancien : la garde se ferme, elle ne s'ouvre jamais */ }
    }));
    if (paquet.length === 10 && echecs.n - avant === 10) echecs.coupe = true;
  }
  return anciens;
}

// ═══════════════════════════════════════════════════════════════════════════
// L'ANCIENNETÉ SE RELIT PAR CANDIDAT, AVEC UNE MÉMOIRE (2026-11-21, T4)
//
// Avant : les comptes de TOUS les candidats mis bout à bout, puis les 60
// premiers relus. Dès qu'un défaut touchait 60 comptes, les suivants n'étaient
// plus relus du tout — donc jamais retenus — et rien ne le disait.
// Désormais : un tirage par candidat (`uidsAVerifier`), un budget compté en
// comptes DISTINCTS réellement lus (un compte déjà relu dans ce passage ne
// coûte rien), et ce qui manque est rendu à l'appelant, qui le publie.
// ═══════════════════════════════════════════════════════════════════════════
export const ANCIENNETE = Object.freeze({ parCandidat: 30, total: 150 });

/**
 * Rend `anciensDe(candidats, { parAction })` → `{ anciens, lus, illisibles }` :
 * `anciens` et `lus` sont la mémoire PARTAGÉE du passage (les trois familles en
 * texte libre et les boutons s'y servent), `illisibles` les lectures refusées
 * pendant cet appel. `echecs` est le compteur commun au passage : c'est lui qui
 * porte le coupe-circuit de `lireComptesAnciens`.
 */
export function relecteurAnciennete({ url, cle, maintenant = Date.now(), lire = lireComptesAnciens, total = ANCIENNETE.total, aleatoire = null, echecs = { n: 0 } } = {}) {
  const lus = new Set();
  const anciens = new Set();
  return async function anciensDe(candidats, { parAction = ANCIENNETE.parCandidat } = {}) {
    // L'échantillon se tire PAR candidat, sans budget ici : le budget se compte plus bas,
    // en comptes distincts, une fois la mémoire consultée.
    const choix = uidsAVerifier(candidats, { parAction, total: Infinity, aleatoire });
    const aLire = [];
    const pris = new Set();
    for (const lot of choix.lots) for (const u of lot.uids) {
      if (lus.has(u) || pris.has(u)) continue;
      // Un identifiant qui n'a pas la forme d'un compte ne sera jamais ancien : inutile de le lire.
      if (!RE_COMPTE.test(String(u))) { lus.add(u); continue; }
      if (aLire.length >= total) continue;
      pris.add(u);
      aLire.push(u);
    }
    const avant = echecs.n;
    for (let i = 0; i < aLire.length; i += 10) {
      const paquet = aLire.slice(i, i + 10);
      for (const u of await lire({ url, cle, uids: paquet, maintenant, echecs })) anciens.add(u);
      // Lu, ou refusé et COMPTÉ : dans les deux cas le compte n'est pas relu une seconde fois.
      for (const u of paquet) lus.add(u);
    }
    return { anciens, lus, illisibles: echecs.n - avant };
  };
}

/**
 * Combien de candidats NON retenus gardent au moins un compte jamais relu ?
 * Ce sont les seuls pour qui « l'ancienneté n'a pas été lue en entier » change
 * quelque chose : un défaut RETENU sur un échantillon est jugé (trois comptes
 * anciens suffisent), il n'est pas « lu en partie ». Compter tout compte non
 * relu aurait passé l'écran à l'orange à chaque vrai incident. FONCTION PURE.
 */
export function nonRetenusNonRelus(premiers, retenus, lus) {
  const cles = new Set((Array.isArray(retenus) ? retenus : []).map((c) => c && c.cle));
  const relus = lus instanceof Set ? lus : new Set();
  return (Array.isArray(premiers) ? premiers : []).filter((c) => c && !cles.has(c.cle) && (c._uids || []).some((u) => !relus.has(u))).length;
}

/** Découpe des sessions en lots sûrs pour une URL : dédoublonnées, de forme bornée, 40 au plus. FONCTION PURE. */
export function lotsSessions(sessions, parLot = BOUTONS_LECTURE.sessionsParRequete) {
  const valides = [...new Set([...(sessions || [])].map(String))].filter((s) => RE_SESSION.test(s));
  const lots = [];
  for (let i = 0; i < valides.length; i += parLot) lots.push(valides.slice(i, i + parLot));
  return lots;
}

/**
 * Quelles sessions relire, sous un budget : un groupe est pris EN ENTIER ou pas
 * du tout, dans l'ordre reçu (les comptes d'abord). Un groupe coupé au budget
 * serait jugé sur une partie de ses sessions — des effets manqueraient, et un
 * bouton vivant passerait pour mort. FONCTION PURE.
 */
export function sessionsALire(groupes, { total = BOUTONS_LECTURE.sessionsMax } = {}) {
  const choisies = new Set();
  const juges = [];
  let nonJuges = 0;
  for (const g of Array.isArray(groupes) ? groupes : []) {
    const nouvelles = [...new Set((g && g._sessions) || [])].filter((s) => !choisies.has(s));
    if (nouvelles.length > total - choisies.size) { nonJuges++; continue; }
    for (const s of nouvelles) choisies.add(s);
    juges.push(g.cle);
  }
  return { sessions: [...choisies], juges, nonJuges };
}

// ═══════════════════════════════════════════════════════════════════════════
// NE PAS ROUVRIR UNE ENQUÊTE SUR UN DÉFAUT DÉJÀ CORRIGÉ (2026-09-10)
//
// ⚠️ MESURÉ, PAS SUPPOSÉ. Le 2026-09-09 à 23h22 la sentinelle ouvre #312
// (« HTTP 409 sur POST /rest/v1/profiles »), le canal produit la PR #313, elle
// est fusionnée et DÉPLOYÉE à 23h47, l'issue est fermée à 04h43. À 06h05 la
// sentinelle rouvre EXACTEMENT le même défaut (#316) — parce que sa fenêtre de
// 24 h porte encore les 9 occurrences d'AVANT le correctif (la dernière à
// 14h31). Le détecteur ne connaît pas la date du correctif : pour lui, des
// lignes anciennes et un défaut vivant se ressemblent trait pour trait.
//
// ⚠️ CE N'EST PAS UN DÉSAGRÉMENT, C'EST UN ARRÊT DU CANAL. La garde « une
// enquête à la fois » compte les issues [SENTINELLE] OUVERTES : tant que ce
// faux doublon est là, AUCUN autre défaut ne peut être détecté ni corrigé.
// Un défaut réel survenu ce matin-là serait resté invisible — et le canal
// aurait eu l'air de fonctionner, puisqu'il travaillait.
//
// ⚠️ LA COMPARAISON PORTE SUR LA DERNIÈRE OCCURRENCE, JAMAIS SUR LE TITRE SEUL.
// Taire un titre pendant N heures suppose que le défaut ne récidive pas, ce que
// personne ne sait. Ici la règle est exacte : si TOUTES les occurrences
// précèdent la fermeture d'une enquête identique, ce sont des lignes d'avant le
// correctif, on se tait. Qu'UNE SEULE occurrence lui soit postérieure et le
// défaut est vivant — on rouvre, c'est même à ça que sert la récidive.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Titre de l'issue d'une cible.
 * ⚠️ SEULE SOURCE DU TITRE. Le workflow l'écrivait en toutes lettres de son
 * côté ; deux constructions du même titre finissent toujours par diverger, et
 * une dédup qui compare des titres divergents ne dédoublonne RIEN, en silence.
 *
 * ⚠️ ET IL NE PORTE PLUS UNE LIGNE ÉCRITE PAR UN INCONNU (2026-09-10).
 * `client_errors` accepte un INSERT non authentifié, et ce titre part dans une
 * issue étiquetée `sentinelle` — donc dans les trois conditions qui arment
 * l'auto-fusion. C'était la SEULE partie de l'issue qu'aucune clôture de bloc ne
 * protégeait. Il porte désormais l'EMPREINTE (chiffres et URL normalisés),
 * passée par `desamorcer()` comme le corps, plus un condensé qui distingue deux
 * familles voisines. Rien de librement choisi ne subsiste.
 *
 * ⚠️ CONSÉQUENCE À CONNAÎTRE, ET ELLE EST BORNÉE : le format du titre a changé,
 * donc une enquête CLOSE AVANT le 2026-09-10 ne se reconnaît plus dans le
 * nouveau. `dejaCorrige` peut donc laisser rouvrir UNE fois chaque défaut déjà
 * corrigé d'avant — une issue qu'un humain referme, jamais un défaut manqué.
 * Le mécanisme reprend tout son effet dès la première enquête close au nouveau
 * format. On ne compare pas « à peu près » pour éviter cette bosse : une dédup
 * approximative rate les vrais doublons, ce qui est bien pire.
 */
export function titreIssue(cible) {
  const cle = String(cible?.cle || cible?.message || "");
  const lisible = ["api", "bouton", "parcours"].includes(cible?.famille) ? cible.famille : "defaut de production";
  return "[SENTINELLE] " + (lisible || "defaut de production") + " · " + condense(cle);
}

/**
 * Condensé stable d'une empreinte, pour distinguer deux familles dont le début
 * lisible se ressemble. Huit caractères suffisent ici : on distingue, on
 * n'authentifie rien.
 */
export function condense(texte) {
  let h = 5381;
  const s = String(texte || "");
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

// ═══════════════════════════════════════════════════════════════════════════
// LA DÉDUP EST DATÉE SUR LE DÉPLOIEMENT ET LA VERSION DU CLIENT (2026-09-18)
//
// ⚠️ MESURÉ LE 2026-09-12. L'issue se ferme à la FUSION de la PR (`Closes #n`),
// le déploiement dure encore 11 à 62 min, et une page déjà chargée garde son
// app.js jusqu'au prochain démarrage complet de la PWA. #350 fermée 14:31:53Z ;
// occurrence à 15:12:57Z venue d'un client encore sur l'ancien build ; #355
// ouverte, PR #356 fusionnée et déployée « pour rien » (son titre : « la cause
// est déjà refermée »). La règle par date de fermeture était EXACTE et mesurait
// le mauvais instant.
//
// La règle nouvelle, quand le workflow a pu retrouver le correctif (PR fusionnée
// + run deploy.yml vert) : une occurrence est VIVANTE si
//   · son `app_version` est l'un des builds qui CONTIENNENT le correctif
//     (le commit de fusion et tout commit de main postérieur) — le build corrigé
//     montre encore l'erreur, c'est une vraie récidive, immédiate ;
//   · sinon, si elle est postérieure à la fin du déploiement + une marge de
//     grâce (2 h par défaut, `SENTINELLE_GRACE_H`) — passé ce délai, un client
//     qui n'a pas rechargé n'est plus une explication suffisante.
// Sinon elle est MORTE : un vieux client en cache, pas un défaut du produit.
// Sans `deployeA` (pas de PR ou de déploiement retrouvé), la règle historique
// par `closedAt` s'applique telle quelle — les enquêtes d'avant ce lot et les
// correctifs faits à la main restent traités comme avant.
// ═══════════════════════════════════════════════════════════════════════════
export const GRACE_MS_DEFAUT = Number(process.env.SENTINELLE_GRACE_H || 2) * 3600_000;

/** Forme comparable d'une version de build : 8 hex, minuscules. */
function normVersion(v) {
  return String(v || "").trim().toLowerCase().slice(0, 8);
}

/**
 * Cette occurrence prouve-t-elle que le défaut a survécu au correctif ?
 * FONCTION PURE. `correctif` = une issue fermée enrichie par le workflow :
 * `{ closedAt, deployeA, versions: [sha8, ...] }`.
 */
export function estVivante(occurrence, correctif, options = {}) {
  const grace = options.graceMs ?? GRACE_MS_DEFAUT;
  const at = Date.parse(occurrence?.at);
  // Une occurrence sans date lisible ne prouve pas son ancienneté : on la tient
  // pour vivante (même doctrine que dejaCorrige : le doute ouvre, il ne tait pas).
  if (!Number.isFinite(at)) return true;
  const versions = (Array.isArray(correctif?.versions) ? correctif.versions : []).map(normVersion).filter(Boolean);
  const v = normVersion(occurrence?.app_version);
  if (v && versions.includes(v)) return true;
  const deployeA = Date.parse(correctif?.deployeA);
  if (!Number.isFinite(deployeA)) {
    const clos = Date.parse(correctif?.closedAt || correctif?.closed_at);
    return !(Number.isFinite(clos) && clos > at);
  }
  return at > deployeA + grace;
}

/**
 * Ce défaut a-t-il déjà été traité ? `fermees` = les issues [SENTINELLE] closes,
 * telles que `gh issue list --label sentinelle --state closed` les rend, le cas
 * échéant enrichies par le workflow (`deployeA`, `versions`).
 *
 * ⚠️ On filtre par LABEL, jamais par `--search "[SENTINELLE]" in:title` :
 * l'index de recherche de GitHub retarde (mesuré le 2026-09-10, #316 absente de
 * l'index plusieurs heures après sa création). Une dédup qui interroge un index
 * en retard laisse passer très exactement le doublon qu'elle devait arrêter.
 */
export function dejaCorrige(cible, fermees, options = {}) {
  if (!cible || !Array.isArray(fermees)) return false;
  const titre = titreIssue(cible);
  const dernier = Date.parse(cible.dernier);
  // Une cible sans date d'occurrence lisible ne se compare à rien : on ne peut
  // pas prouver qu'elle est ancienne, donc on laisse l'enquête s'ouvrir. Se
  // taire sur un doute ferait manquer un vrai défaut ; ouvrir en trop coûte une
  // issue qu'un humain referme.
  if (!Number.isFinite(dernier)) return false;
  // Sans liste d'occurrences (verdict d'avant ce lot), la dernière en tient lieu.
  const occurrences = Array.isArray(cible.occurrences) && cible.occurrences.length
    ? cible.occurrences
    : [{ at: cible.dernier, app_version: null }];
  const memes = fermees.filter((f) => String(f?.title || "") === titre);
  const datee = (f) => Number.isFinite(Date.parse(f?.deployeA));
  // ⚠️ UNE FERMETURE À LA MAIN POSTÉRIEURE À TOUTES LES OCCURRENCES TAIT, MÊME
  // FACE À UN CORRECTIF DATÉ (relecture du lot, 2026-09-18). Sans cette règle,
  // une issue de RÉCIDIVE (`humain`, sans PR donc sans `deployeA`) fermée par
  // Benjamin était recréée à CHAQUE run tant que des occurrences restaient dans
  // la fenêtre de 24 h — jusqu'à huit e-mails par jour pour une décision déjà
  // prise, indéfiniment si la cause est serveur (le cas même que la récidive
  // désigne). C'est la règle historique, rendue ADDITIVE : elle tait ce qui
  // précède la fermeture ; une occurrence postérieure rouvre — c'est la
  // récidive, et c'est voulu.
  if (memes.some((f) => {
    if (datee(f)) return false;
    const clos = Date.parse(f?.closedAt || f?.closed_at);
    return Number.isFinite(clos) && clos > dernier;
  })) return true;
  const datees = memes.filter(datee);
  if (datees.length) {
    // ⚠️ LE DERNIER CORRECTIF DÉPLOYÉ JUGE, PAS LE PREMIER. Deux correctifs sur
    // le même titre (#350 puis #355) : une occurrence venue du build du PREMIER
    // est vivante pour lui (il y figure) mais ne prouve rien contre le SECOND,
    // fait précisément parce que le premier n'a pas tenu. Juger sur le premier
    // rouvrirait une enquête que le second a déjà réglée ; juger sur « n'importe
    // lequel se tait » (some) ferait l'inverse : taire un défaut qui survit au
    // second parce qu'il est mort pour le premier. On se tait seulement si
    // AUCUNE occurrence n'est vivante face au correctif le plus récent.
    const dernierCorrectif = datees.reduce((a, b) => (Date.parse(b.deployeA) > Date.parse(a.deployeA) ? b : a));
    return !occurrences.some((o) => estVivante(o, dernierCorrectif, options));
  }
  // Sans correctif daté ni fermeture postérieure : le défaut est vivant.
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// OÙ EN EST LE DÉPLOIEMENT D'UN CORRECTIF FUSIONNÉ ? (relecture du lot, 2026-09-18)
//
// ⚠️ LE TROU MESURÉ : #355 (fermée 14:31:53Z, occurrence 15:12:57Z, déploiement
// vert 15:33:46Z, cron à :23). Entre la fusion et le run vert (11 à 62 min), une
// enquête fermée n'a pas encore de `deployeA` : la dédup retombait sur la date
// de fermeture et rouvrait sur la première occurrence d'un vieux client. Le
// correctif est « EN VOL » : ni déployé, ni absent — et le bon geste est
// d'ATTENDRE (le titre est traité comme encore ouvert), pas de rouvrir.
//   · un run `success` → déployé, `deployeA` = fin du dernier run vert ;
//   · un run en file ou en cours (queued, in_progress, pending, waiting,
//     requested) → en vol ;
//   · aucun run listé et fusion depuis moins de 3 h → en vol (le run n'est pas
//     encore créé, ou la liste retarde) ;
//   · sinon (run rouge ou annulé, ou plus rien après 3 h) → inconnu : la règle
//     historique par `closedAt` s'applique, et `retour-issue` (deploy.yml) a
//     rouvert l'issue avec `humain` si le déploiement a échoué.
// ═══════════════════════════════════════════════════════════════════════════
export const ATTENTE_DEPLOIEMENT_MS = 3 * 3600_000;
const STATUTS_EN_VOL = new Set(["queued", "in_progress", "pending", "waiting", "requested"]);

/**
 * FONCTION PURE. `runs` = `gh run list --json status,conclusion,updatedAt` du commit de fusion.
 * @returns {{etat: "deploye", deployeA: string} | {etat: "en_vol", raison: string} | {etat: "inconnu", raison: string}}
 */
export function etatDeploiement(runs, mergedAt, options = {}) {
  const liste = Array.isArray(runs) ? runs : [];
  const verts = liste
    .filter((r) => r && r.conclusion === "success")
    .map((r) => String(r.updatedAt || ""))
    .filter((s) => Number.isFinite(Date.parse(s)))
    .sort();
  if (verts.length) return { etat: "deploye", deployeA: verts[verts.length - 1] };
  if (liste.some((r) => STATUTS_EN_VOL.has(String(r?.status || "")))) {
    return { etat: "en_vol", raison: "un run deploy.yml est en file ou en cours" };
  }
  const now = options.now ?? Date.now();
  const attente = options.attenteMs ?? ATTENTE_DEPLOIEMENT_MS;
  const fusion = Date.parse(mergedAt);
  if (!liste.length && Number.isFinite(fusion) && now - fusion < attente) {
    return { etat: "en_vol", raison: "fusionnée il y a moins de 3 h, aucun run deploy.yml encore listé" };
  }
  const dernier = liste[0] ? String(liste[0].conclusion || liste[0].status || "?") : null;
  return { etat: "inconnu", raison: dernier ? `dernier run deploy.yml : ${dernier}` : "aucun run deploy.yml" };
}

/**
 * La cible à ouvrir : le PREMIER candidat, dans l'ordre du classement, dont
 * l'enquête n'est ni OUVERTE (y compris confiée à un humain) ni déjà fermée
 * après sa dernière occurrence.
 *
 * ⚠️ AVANT (ASTRA-08) le verdict ne portait que `candidates[0]`, et le workflow
 * ne dédupliquait que lui : si ce premier était déjà corrigé, le run s'arrêtait
 * là — « aucune enquête ouverte » — et le SUIVANT, encore actif, restait
 * invisible tant que le premier continuait de dominer le classement. La
 * dédup doit AVANCER dans la liste, pas s'arrêter au premier.
 *
 * ⚠️ `ouvertes` (2026-09-18) : une issue de même titre encore ouverte — en
 * cours, relancée, ou remise à un humain (label `humain`) — ne doit pas être
 * doublée. Sans ce paramètre, l'escalade « humain » (qui ne compte plus dans
 * « une enquête à la fois ») aurait rouvert la même enquête au run suivant.
 */
export function choisirCible(candidats, fermees, ouvertes) {
  return choisirCibles(candidats, fermees, ouvertes, 1)[0] || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENQUÊTES EN PARALLÈLE (2026-11-01)
//
// « Une enquête à la fois » faisait de la chaîne une FILE D'ATTENTE : un défaut
// en cours de correction (Claude + CI + déploiement, 30 à 60 min) gelait la
// détection de tous les autres. Plus l'app a d'utilisateurs, plus les défauts
// arrivent ensemble — et le deuxième attendait le premier, le troisième les
// deux. Le canal ouvre désormais jusqu'à `MAX_ENQUETES` enquêtes à la fois,
// chacune avec son run Claude et sa PR (concurrence par numéro d'issue dans
// claude-code.yml : elles ne se bloquent pas entre elles).
//
// ⚠️ Deux candidats sur le MÊME appel réseau (méthode + chemin, codes
// différents) ont presque toujours la même cause : deux PR concurrentes sur la
// même ligne de code finiraient en conflit, la seconde remise à un humain au
// bout de 6 h. Un seul par appel ; l'autre attend le run suivant.
//
// ⚠️ La valeur DOIT rester égale à `REVEIL.enquetesMax`
// (supabase/functions/_shared/autonomie.js) : la veille ne réveille pas une
// Sentinelle saturée, et réveille une Sentinelle qui a une place libre
// (verrou : tests/unit/sentinelle-detecter.test.mjs).
// ═══════════════════════════════════════════════════════════════════════════
export const MAX_ENQUETES = 3;

/** Plafond effectif (variable `SENTINELLE_MAX_ENQUETES`, bornée à [1, 5] ; illisible = défaut). */
export function maxEnquetes(valeur) {
  const n = Number(valeur);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : MAX_ENQUETES;
}

/** Zone de code d'un candidat : deux candidats de même zone ne partent pas ensemble. */
export function zoneCible(c) {
  if (c && c.famille === "api" && c.chemin) return "api " + String(c.methode || "").toUpperCase() + " " + String(c.chemin);
  // Boutons : UNE zone pour toute la famille — une seule enquête bouton à la fois
  // (contre-revue du 2026-11-03 : un flot de boutons ne prend jamais les places d'un défaut réel).
  if (c && c.famille === "bouton") return "bouton";
  // Parcours : UNE zone pour toute la famille, comme les boutons (revue adversariale
  // du 2026-11-06) — trois parcours forgés prenaient les trois places de MAX_ENQUETES.
  if (c && c.famille === "parcours") return "parcours";
  // Erreurs JS : le FICHIER source — deux PR auto-fusionnées sur le même fichier
  // ne sont jamais testées ensemble (`main` n'exige pas une branche à jour).
  const source = c && c.exemple && c.exemple.source;
  if (c && c.famille === "js" && source) {
    const fichier = String(source).split(/[?#]/)[0].split("/").pop();
    if (fichier) return "js " + fichier;
  }
  return null;
}

/**
 * Jusqu'à `places` cibles VIVANTES, dans l'ordre du classement (comptes
 * distincts d'abord) : ni ouvertes, ni déjà corrigées, ni deux fois le même
 * titre, ni deux fois la même zone. FONCTION PURE.
 */
export function choisirCibles(candidats, fermees, ouvertes, places = 1) {
  const n = Number.isInteger(places) && places > 0 ? places : 0;
  const liste = Array.isArray(ouvertes) ? ouvertes : [];
  const titres = new Set(liste.map((o) => String(o?.title || "")));
  const zones = new Set();
  // Une enquête bouton OUVERTE et encore confiée à la machine occupe la zone « bouton » ;
  // remise à un humain (label `humain`), elle ne gèle plus la famille (contre-revue du 2026-11-03).
  const nomsLabels = (o) => (Array.isArray(o?.labels) ? o.labels : []).map((l) => String(l?.name ?? l));
  if (liste.some((o) => String(o?.title || "").startsWith("[SENTINELLE] bouton ") && !nomsLabels(o).includes("humain"))) zones.add("bouton");
  if (liste.some((o) => String(o?.title || "").startsWith("[SENTINELLE] parcours ") && !nomsLabels(o).includes("humain"))) zones.add("parcours");
  const choisies = [];
  for (const c of candidats || []) {
    if (choisies.length >= n) break;
    const titre = titreIssue(c);
    if (titres.has(titre)) continue;
    const zone = zoneCible(c);
    if (zone && zones.has(zone)) continue;
    if (dejaCorrige(c, fermees)) continue;
    choisies.push(c);
    titres.add(titre);
    if (zone) zones.add(zone);
  }
  return choisies;
}

// ═══════════════════════════════════════════════════════════════════════════
// RÉCIDIVE = ESCALADE, PAS BOUCLE (2026-09-18)
//
// Une cible encore vivante alors que DEUX enquêtes fermées de même titre ont
// déjà eu leur correctif déployé n'est pas un défaut que ce canal sait
// corriger : soit la cause est ailleurs (serveur, migration, règle d'accès),
// soit les correctifs se contredisent. Rejouer Claude une troisième fois
// coûterait un cycle Claude + CI + déploiement pour le même résultat. L'issue
// s'ouvre alors SANS le label `claude`, avec `recidive` + `humain`, et le corps
// dit quoi décider.
// ═══════════════════════════════════════════════════════════════════════════
export const RECIDIVE_SEUIL = 2;

/**
 * Combien d'enquêtes fermées de même titre ont eu un correctif DÉPLOYÉ ?
 * FONCTION PURE. Rend `{ recidive, n, enquetes: [{number, url, closedAt, deployeA}] }`.
 */
export function escaladeRecidive(cible, fermees, options = {}) {
  const seuil = options.seuil ?? RECIDIVE_SEUIL;
  if (!cible || !Array.isArray(fermees)) return { recidive: false, n: 0, enquetes: [] };
  const titre = titreIssue(cible);
  const enquetes = fermees
    .filter((f) => String(f?.title || "") === titre && Number.isFinite(Date.parse(f?.deployeA)))
    .map((f) => ({
      number: Number.isInteger(f.number) ? f.number : null,
      url: /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+$/.test(String(f.url || "")) ? String(f.url) : null,
      closedAt: f.closedAt || f.closed_at || null,
      deployeA: f.deployeA,
    }));
  return { recidive: enquetes.length >= seuil, n: enquetes.length, enquetes };
}

// ═══════════════════════════════════════════════════════════════════════════
// LE CORPS DE L'ISSUE, ET LA FICHE QU'IL EXIGE (2026-09-18)
//
// Le corps vivait dans le workflow ; il est ici pour être ÉPROUVÉ (ce qui doit
// y figurer, ce qui ne doit jamais y passer intact). ⚠️ Tout texte venu d'un
// navigateur — message, pile, source, version — passe par `desamorcer` ou par
// une forme sûre : c'est de la DONNÉE, jamais une instruction, et l'issue
// porte le label qui arme l'auto-fusion.
//
// ⚠️ LA FICHE EST LA MÉMOIRE DE LA CHAÎNE. Mesuré : sans fiche, « la même
// enquête trois fois dans la journée » (12/09). Le correctif doit écrire
// `docs/sentinelle/<date>-<condense>.md` (Cause / Correctif / Verrou / Leçon /
// Hors-champ) ; la gouvernance de deploy.yml l'autorise hors comptage, et le
// run suivant joint les fiches proches à l'enquête.
// ═══════════════════════════════════════════════════════════════════════════

/** Nom canonique de la fiche d'une cible, à une date donnée (AAAA-MM-JJ). */
export function nomFiche(cible, date) {
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? String(date) : new Date().toISOString().slice(0, 10);
  return `docs/sentinelle/${jour}-${condense(String(cible?.cle || cible?.message || ""))}.md`;
}

const RE_CHEMIN_FICHE = /^docs\/sentinelle\/[\w.-]+\.md$/;

/**
 * Les fiches existantes qui parlent de cette cible : même condensé dans le nom,
 * ou titre portant le chemin de l'endpoint (famille API). FONCTION PURE.
 * `fiches` = [{ chemin, titre }], tel que `lireFiches` les rend.
 */
export function fichesProches(cible, fiches, options = {}) {
  const max = options.max ?? 5;
  if (!cible || !Array.isArray(fiches)) return [];
  const cond = condense(String(cible.cle || cible.message || ""));
  // `classerApi` nomme « / » un endpoint vide : ce « chemin » est dans le titre
  // de toute fiche qui cite une URL, il ne rapproche rien.
  const brut = String(cible.chemin || "").trim();
  const chemin = brut.length > 1 ? brut : "";
  return fiches
    .filter((f) => RE_CHEMIN_FICHE.test(String(f?.chemin || "")))
    .filter((f) => {
      const nom = String(f.chemin).split("/").pop();
      if (nom.includes(cond)) return true;
      return Boolean(chemin) && String(f.titre || "").includes(chemin);
    })
    .map((f) => f.chemin)
    .slice(0, max);
}

/** Lit les fiches d'un dossier : `[{ chemin, titre }]`, README exclu. I/O minimale, testable sur un dossier temporaire. */
export async function lireFiches(dossier) {
  const fs = await import("node:fs");
  let noms = [];
  try { noms = fs.readdirSync(dossier); } catch (e) { return []; }
  return noms
    .filter((n) => n.endsWith(".md") && n.toLowerCase() !== "readme.md")
    .sort()
    .map((n) => {
      let titre = "";
      try {
        const premiere = fs.readFileSync(`${dossier}/${n}`, "utf8").split("\n").find((l) => l.startsWith("# "));
        titre = premiere ? premiere.slice(2).trim().slice(0, 200) : "";
      } catch (e) { titre = ""; }
      return { chemin: `docs/sentinelle/${n}`, titre };
    });
}

/** Résumé sûr des versions d'un candidat : les cinq plus fréquentes, formes bornées. */
function lignesVersions(c) {
  const versions = c && c.versions && typeof c.versions === "object" ? c.versions : {};
  const rangees = Object.entries(versions)
    .map(([v, e]) => [versionSure(v) || "?", Number(e?.n) || 0, String(e?.dernier || "")])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (!rangees.length) return ["| Versions du client | (non renseignées par cette source) |"];
  return rangees.map(([v, n, d]) => `| Version ${v} | ${n} occurrence(s), dernière ${dateDiagnostic(d)} |`);
}

/**
 * Corps Markdown de l'issue d'enquête. FONCTION PURE.
 * @param v        le verdict (fenetreHeures)
 * @param c        la cible (candidat)
 * @param options  { fichesProches: [chemins], recidive: escaladeRecidive()|null, date: AAAA-MM-JJ }
 */
export function corpsIssue(v, c, options = {}) {
  const fiches = (Array.isArray(options.fichesProches) ? options.fichesProches : []).filter((f) => RE_CHEMIN_FICHE.test(String(f)));
  const recidive = options.recidive && options.recidive.recidive ? options.recidive : null;
  const heures = Number(v?.fenetreHeures) || 24;
  const L = [];
  if (recidive) {
    L.push(`Ce défaut a déjà été corrigé ${recidive.n} fois par la chaîne autonome, correctif déployé à chaque fois — et il est de nouveau observé APRÈS le déploiement. Ce n'est plus une réparation bornée : décision humaine.`);
    L.push("");
    L.push("Enquêtes précédentes (correctif déployé) :");
    for (const e of recidive.enquetes) {
      const ref = e.url ? e.url : (e.number ? `#${e.number}` : "(référence inconnue)");
      L.push(`- ${ref} — fermée ${desamorcer(String(e.closedAt || "?"), 1).slice(0, 40)}, déployée ${desamorcer(String(e.deployeA || "?"), 1).slice(0, 40)}`);
    }
  } else {
    L.push("La sentinelle autonome a relevé un défaut que subissent de vrais utilisateurs.");
  }
  L.push("");
  L.push("| | |");
  L.push("|---|---|");
  L.push(`| Occurrences (${heures} h) | ${Number(c?.n) || 0} |`);
  L.push(`| Comptes touchés | ${Number(c?.comptes) || 0} |`);
  L.push(`| Dernière | ${dateDiagnostic(c?.dernier)} |`);
  L.push(...lignesVersions(c));
  L.push("");
  L.push("### Diagnostic structuré");
  L.push("");
  L.push("Le texte libre du navigateur (message, pile, source) est exclu de cette consigne.");
  L.push("Empreinte de regroupement : " + condense(String(c?.cle || c?.message || "")));
  L.push("Reproduire le défaut dans le code avant toute correction ; sans cause établie, laisser la main.");
  L.push("");
  if (fiches.length) {
    L.push("### Enquêtes précédentes proches");
    L.push("");
    L.push("Lire ces fiches AVANT de chercher : elles portent la cause, le correctif et la leçon d’un défaut voisin.");
    L.push("");
    for (const f of fiches) L.push(`- \`${f}\``);
    L.push("");
  }
  if (recidive) {
    L.push("### Ce qui est demandé à un humain");
    L.push("");
    L.push("1. Lire les fiches des enquêtes précédentes et le correctif déployé : le défaut a survécu, la cause est ailleurs (serveur, migration, règle d’accès) ou les correctifs se contredisent.");
    L.push("2. Décider : correctif à la main (avec contre-revue si le périmètre est critique), ou fermeture motivée de cette issue.");
    L.push("3. Cette issue ne porte PAS le label `claude` et ne compte pas dans les enquêtes en cours (plafond `MAX_ENQUETES`) : le canal continue sur les autres défauts.");
    return L.join("\n");
  }
  L.push("### Ce qui est demandé");
  L.push("");
  if (c?.famille === "bouton") {
    L.push(`> Bouton sans effet : ${Number(c.clics) || 0} clics, ${Number(c.tauxEffet) || 0} % suivis d’un effet mesuré en 3 s, ${Number(c.rageurs) || 0} compte(s) l’ont retapé sans résultat. Le libellé est un texte du code : le retrouver par \`grep\` dans \`index.html\` et \`js/\`.`);
    L.push("> Deux causes possibles, à départager AVANT d’écrire : (a) le handler est cassé, absent, masqué par un autre élément ou bloqué par une garde — corriger pour que le geste aboutisse ; (b) le geste aboutit mais n’émet aucun événement mesurable — ne PAS toucher au comportement, ajouter seulement `Telemetry.action(...)` sans donnée personnelle. Jamais retirer le bouton pour faire taire la mesure.");
    L.push("");
  }
  if (c?.famille === "parcours") {
    L.push("> Parcours en échec : l’app a LU un refus de la source de vérité et l’a rapporté (étape « saved » en erreur). Le contrat du parcours, ses émetteurs et ses verrous sont dans `supabase/functions/_shared/contrats-actions.js`.");
    L.push("> Deux causes possibles, à départager AVANT d’écrire : (a) l’app envoie une écriture invalide (colonne, identifiant, garde absente) — corriger l’émetteur ; (b) la règle serveur refuse à raison ou par défaut de migration — HORS périmètre : décrire et laisser la main. Jamais transformer l’échec en succès, jamais retirer l’étape « saved » pour faire taire la mesure.");
    L.push("");
  }
  L.push("1. Établir la CAUSE dans le code. Sans cause établie, ne rien corriger : commenter ce qui manque et s’arrêter. Un correctif supprime la cause, JAMAIS la mesure : ni `try/catch` large autour du défaut, ni filtre ou interrupteur de télémétrie, ni redéfinition de `window.tel` ou de `fetch` pour faire disparaître le signal.");
  L.push("2. Corriger UNIQUEMENT dans `js/*.js` (hors `js/vendor/` et hors instruments de mesure : `js/telemetry.js`, `js/platform.js`, `js/perf-ios.js`, `js/release-guard.js`, `js/reglages-distants.js`, `js/identity-transition.js` — si la cause est là : HORS périmètre, la décrire et laisser la main), `styles.css`, `index.html` ; le verrou du point 3 UNIQUEMENT dans `tests/e2e/sentinelle-*.spec.js` ; la fiche du point 6 UNIQUEMENT dans `docs/sentinelle/`. Jamais `.github/`, `migrations/`, `scripts/`, `dashboard/`, ni le reste de `tests/`. La gouvernance de `deploy.yml` REFUSE la PR au-delà (ASTRA-05).");
  L.push("3. Ajouter un verrou qui ÉCHOUE sur le défaut et passe après (réinjection).");
  L.push("4. `npm run verif` vert, suites e2e concernées vertes, avant toute PR.");
  L.push("5. Au-delà de ~60 lignes ou 2 fichiers de code (verrou et fiche non comptés), ce n’est plus une réparation : décrire la cause et laisser la main.");
  L.push(`6. Écrire la fiche \`${nomFiche(c, options.date)}\` : sections Cause / Correctif / Verrou / Leçon / Hors-champ (≤ 40 lignes, format dans \`docs/sentinelle/README.md\`). C’est la mémoire de la chaîne : sans elle, la même enquête est rejouée au défaut suivant. Reprendre les quatre premières sections dans le message de commit (\`Cause:\`, \`Correctif:\`, \`Verrou:\`, \`Leçon:\`).`);
  return L.join("\n");
}

// ⚠️ LES TROIS LECTURES « DEVOIR » DISENT SI ELLES ONT TOUT LU (2026-11-21, T4).
// Elles demandaient les 1 000 (ou « 2 000 », servis 1 000) lignes les plus
// récentes et s'arrêtaient là, sans drapeau : au-delà, le classement portait
// sur une fraction de la fenêtre et le verdict n'en disait rien. Elles lisent
// désormais dix pages, du PLUS RÉCENT au plus ancien, et rendent
// `{ lignes, complet }`. Tronquée, la lecture reste classée : ses compteurs sont
// un PLANCHER (jamais un faux positif), et le verdict le dit (`lecture`).
// Le repli « colonne absente » ne joue que sur un 400 de la PREMIÈRE requête
// (`e.premiere`) : c'est là seulement qu'une colonne manquante se manifeste.
const estColonneAbsente = (e) => !!e && e.status === 400 && e.premiere === true;

/**
 * Lit les erreurs récentes via PostgREST. Isolé pour rester testable.
 *
 * ⚠️ N'ENQUÊTE QUE SUR CE QU'UN COMPTE RÉEL A RENCONTRÉ, DÈS QUE LA BASE LE
 * PERMET (2026-09-10). `client_errors` accepte une écriture ANONYME, et le
 * texte inséré finit dans une issue dont la PR est fusionnée automatiquement :
 * un inconnu pouvait donc choisir ce que la chaîne allait « réparer ».
 * `migrations/migration_fuites_2026-09-10.sql` ajoute `auth_uid`, posée par le
 * SERVEUR (`default auth.uid()`) et non écrivable par le client — NULL pour un
 * visiteur, l'identité réelle pour un compte.
 *
 * ⚠️ DÉPLOYABLE AVANT SA MIGRATION, et c'est la raison de la double requête :
 * tant que la colonne n'existe pas, PostgREST rend 400 sur le `select`, et la
 * sentinelle deviendrait MUETTE — une panne silencieuse, exactement ce que ce
 * canal est censé éviter. On retombe alors sur l'ancienne requête, en le disant
 * dans le verdict. La colonne `uid`, elle, ne prouve rien : elle est écrite par
 * le client, et les uuid des comptes sont publics (`profiles` est en lecture
 * publique) — la recopier est à la portée de quiconque.
 */
export async function lireErreurs({ url, cle, heures, maintenant = Date.now() }) {
  const base = "client_errors?select=message,source,line,stack,url,uid,created_at";
  const commun = { url, cle, heures, maintenant, colonne: "created_at", ordre: "desc" };

  // Chemin nominal : identité vérifiée par le serveur exigée.
  let r = null;
  try { r = await lirePagine({ ...commun, chemin: `${base},auth_uid&auth_uid=not.is.null` }); }
  // 400 = colonne absente : la migration n'est pas encore appliquée. Toute autre erreur remonte.
  catch (e) { if (!estColonneAbsente(e)) throw e; }
  if (r) {
    // ⚠️ LES COMPTES SE COMPTENT SUR L'IDENTITÉ POSÉE PAR LE SERVEUR (2026-09-18),
    // comme `lireApi` le fait déjà pour `user_id`. `uid` est écrit par le client
    // (`window.MY_UID || null`) : fabricable, et souvent vide pour un compte
    // réel — une erreur authentifiée sortait avec `comptes = 0` et perdait sa
    // place dans le classement.
    for (const l of r.lignes) l.uid = l.auth_uid;
    return { lignes: r.lignes, complet: r.complet };
  }

  const repli = await lirePagine({ ...commun, chemin: base });
  // Le repli est SIGNALÉ : sans cette marque, on ne saurait pas que la chaîne
  // travaille encore sur des lignes d'origine non vérifiée.
  for (const l of repli.lignes) l._origineNonVerifiee = true;
  return { lignes: repli.lignes, complet: repli.complet };
}

// ⚠️ LA TÉLÉMÉTRIE N'EST PAS QUE DE LA PRODUCTION. Les suites e2e écrivent dans
// la MÊME table (env = development, opt-in `?telemetry=1`), et la sentinelle
// lisait sans filtre : libérée le 2026-09-11 au soir (issue #327 fermée), elle a
// aussitôt ouvert #337 sur 38 « POST /rest/v1/user_state → 401 » qui étaient
// TOUS du bruit de test — mesuré le 2026-09-12 : 56 lignes sur 48 h, 100 %
// env = development, 0 compte, 28 sessions e2e, 0 en production. Une enquête
// ouverte sur du bruit bloque « une enquête à la fois » exactement comme un vrai
// défaut : le canal était donc aveugle une seconde fois, pour une raison qu'il
// avait fabriquée lui-même. Le filtre vit dans UNE constante, posée sur les
// TROIS lectures de telemetry_events (refus réseau, clics, effets) : en oublier
// une rendrait un classement mêlant tests et utilisateurs.
export const FILTRE_PRODUCTION = "&env=eq.production";

/**
 * Chemins des deux lectures « boutons morts » — exportés pour être vérifiés.
 * Clics (2026-11-21) : identité SERVEUR exigée dès la requête — un clic sans
 * compte ne pesait déjà rien, et il occupait des pages — et `meta.trafic` à
 * plat (jamais `meta` entier). Effets : le nom de l'action, pour écarter les
 * marqueurs de pose (`indexEffets`) ; AUCUN filtre de marqueur ici.
 */
export const CHEMINS_BOUTONS = {
  clics: "telemetry_events?select=action,screen,session_id,client_ts,received_at,auth_uid,app_version,trafic:meta->>trafic&auth_uid=not.is.null&type=eq.click" + FILTRE_PRODUCTION,
  effets: "telemetry_events?select=session_id,client_ts,action&type=in.(action,nav,api,flow)" + FILTRE_PRODUCTION,
};

// ═══════════════════════════════════════════════════════════════════════════
// QUATRIÈME SOURCE — LES ERREURS JS DE LA TÉLÉMÉTRIE (2026-09-18)
//
// `window_error`, `unhandled_rejection` et `Telemetry.error` partent dans
// `telemetry_events` (type=error) AVEC app_version, session_id, env et une
// identité serveur (`auth_uid`) ; `client_errors` (js/platform.js) est le canal
// le plus pauvre — plafond 5 par session, pas de version, pas de filtre env.
// Le détecteur ne lisait que le pauvre. Cette lecture rend des lignes de la
// MÊME forme que `client_errors` (message, stack, uid, created_at, plus
// app_version) : aucun classement nouveau, `classer()` les prend telles
// quelles. La fusion avec `client_errors` se fait par EMPREINTE
// (`fusionnerErreursJs`) pour ne pas compter deux fois la même erreur remontée
// par les deux moniteurs, avec un plafond par session : la télémétrie n'en a
// pas, et une boucle d'erreurs sur un appareil pèserait comme cent défauts.
// ═══════════════════════════════════════════════════════════════════════════
export const CHEMIN_ERREURS_TELEMETRIE =
  "telemetry_events?select=message,stack,action,screen,app_version,session_id,received_at&type=eq.error" + FILTRE_PRODUCTION;

/** Lit les erreurs JS de la télémétrie — EN PRODUCTION SEULEMENT, comptes réels d'abord. Exporté pour le verrou. */
export async function lireErreursTelemetrie({ url, cle, heures, maintenant = Date.now() }) {
  const commun = { url, cle, heures, maintenant, ordre: "desc" };
  const versLigne = (l, uid) => ({
    message: l.message, stack: l.stack,
    source: l.screen ? `écran ${String(l.screen).slice(0, 60)}` : null, line: null, url: null,
    uid, created_at: l.received_at, app_version: l.app_version, session_id: l.session_id,
  });

  // Même double requête que `lireApi` : identité serveur d'abord, repli SIGNALÉ.
  let r = null;
  try { r = await lirePagine({ ...commun, chemin: `${CHEMIN_ERREURS_TELEMETRIE.replace("select=", "select=auth_uid,")}&auth_uid=not.is.null` }); }
  catch (e) { if (!estColonneAbsente(e)) throw e; }
  if (r) return { lignes: r.lignes.map((l) => versLigne(l, l.auth_uid)), complet: r.complet };
  const repli = await lirePagine({ ...commun, chemin: CHEMIN_ERREURS_TELEMETRIE.replace("select=", "select=user_id,") });
  return { lignes: repli.lignes.map((l) => ({ ...versLigne(l, l.user_id), _origineNonVerifiee: true })), complet: repli.complet };
}

/**
 * Fusionne les deux sources d'erreurs JS. FONCTION PURE.
 *
 * ⚠️ LA TÉLÉMÉTRIE EST LA SOURCE RICHE, `client_errors` LE REPLI (relecture du
 * lot, 2026-09-18). Chaque erreur JS est remontée par les DEUX moniteurs
 * (js/platform.js → client_errors ; js/telemetry.js → telemetry_events). La
 * première version gardait `client_errors` et jetait la télémétrie en doublon :
 * comme `client_errors` n'a ni `app_version` ni `session_id`, tout candidat JS
 * sortait avec `versions: {}` — la dédup datée sur le build (A3) était morte
 * pour toute la famille, et les comptes vus seulement par la télémétrie
 * disparaissaient du tri. Désormais : la télémétrie passe (bornée à
 * `maxParSession` occurrences d'une même empreinte par session, car elle n'a
 * pas de plafond côté client), et une ligne de `client_errors` dont
 * l'empreinte est déjà connue de la télémétrie est le doublon.
 */
export function fusionnerErreursJs(clientErrors = [], telemetrie = [], options = {}) {
  const max = options.maxParSession ?? 5;
  const connues = new Set();
  const parSession = new Map();
  const retenues = [];
  let doublons = 0, plafonnees = 0;
  for (const l of telemetrie) {
    const e = empreinte(l.message);
    connues.add(e);
    const k = `${String(l.session_id || "")}|${e}`;
    const n = (parSession.get(k) || 0) + 1;
    parSession.set(k, n);
    if (n > max) { plafonnees++; continue; }
    retenues.push(l);
  }
  const repli = [];
  for (const l of clientErrors) {
    if (connues.has(empreinte(l.message))) { doublons++; continue; }
    repli.push(l);
  }
  return { lignes: [...retenues, ...repli], doublons, plafonnees };
}

/** Lit les appels réseau refusés — EN PRODUCTION SEULEMENT. Exporté pour le verrou. */
export async function lireApi({ url, cle, heures, maintenant = Date.now() }) {
  const commun = { url, cle, heures, maintenant, ordre: "desc" };
  // `app_version` : le build du client (dédup datée sur le déploiement) ;
  // `severity` et `meta` : ce que le client a prouvé sur un statut 0 ou un refus
  // attendu (voir `estDuBruitApi`). Sans ces trois colonnes, le détecteur
  // jugeait sur la cause supposée, jamais sur ce que le client avait mesuré.
  const base = "telemetry_events?select=endpoint,http_status,action,user_id,received_at,app_version,severity,meta";
  const filtre = `&type=eq.api${FILTRE_PRODUCTION}&status=eq.error`;
  // ⚠️ IDENTITÉ POSÉE PAR LE SERVEUR D'ABORD (ASTRA-06, 2026-09-14) : `auth_uid`
  // (migration_debit_et_identite_serveur) — `user_id` est écrit par le client.
  // Même double requête que `lireErreurs` : tant que la colonne n'existe pas,
  // PostgREST rend 400 et l'on retombe sur `user_id`, en le SIGNALANT sur chaque
  // ligne — jamais en silence. Une fois la colonne là, `user_id` prend la valeur
  // de `auth_uid` : `classerApi` continue de compter sur `user_id`.
  let r = null;
  try { r = await lirePagine({ ...commun, chemin: `${base},auth_uid&auth_uid=not.is.null${filtre}` }); }
  catch (e) { if (!estColonneAbsente(e)) throw e; }
  if (r) {
    for (const l of r.lignes) l.user_id = l.auth_uid;
    return { lignes: r.lignes, complet: r.complet };
  }
  // ⚠️ On N'AVALE PAS l'échec du repli : une source muette rendrait « rien à signaler »
  // alors que c'est l'accès qui manque — la panne silencieuse, encore. `lirePagine`
  // lève sur sa première requête.
  const repli = await lirePagine({ ...commun, chemin: `${base}${filtre}` });
  for (const l of repli.lignes) l._origineNonVerifiee = true;
  return { lignes: repli.lignes, complet: repli.complet };
}

/**
 * Lit une table SUR LA FENÊTRE, page par page, et dit si elle a tout lu.
 *
 * ⚠️ UNE LECTURE PARTIELLE FABRIQUE DE FAUX BOUTONS MORTS : il manquerait des
 * EFFETS, donc des clics paraîtraient sans suite alors qu'ils en avaient une.
 * On rend donc `{ lignes, complet }`, et l'appelant décide de ce qu'il a le
 * droit de conclure d'une lecture incomplète.
 *
 * Quatre règles, une par piège (2026-11-21, T4) :
 *  · LA FIN SE LIT SUR UNE PAGE VIDE, jamais sur « une page plus courte que
 *    demandé » : `complet` ne doit dépendre d'aucun réglage du serveur. L'ancien
 *    test (« moins que la taille demandée = fini ») était toujours vrai dès que
 *    le serveur servait moins que la demande — `lireApi` demandait 2 000, la
 *    base en sert 1 000. L'`offset` avance du nombre de lignes REÇUES. Coût :
 *    une requête de plus par lecture. Un 416 sur une page suivante dit la même
 *    chose qu'une page vide (l'offset dépasse la fin) : fini aussi.
 *  · DEUX BORNES ET UN TRI STABLE : `> depuis` ET `<= fin`, `fin` figé avant la
 *    première page, tri sur (colonne, id). Un lot de télémétrie partage le même
 *    `received_at`, et une lecture du plus récent au plus ancien glisse quand
 *    des lignes arrivent pendant la pagination.
 *  · SEULE LA PREMIÈRE REQUÊTE LÈVE. Une page suivante refusée, expirée
 *    (`statement_timeout` de 8 s côté base) ou coupée rend ce qui est lu avec
 *    `complet: false` — la même chose qu'un plafond atteint : des compteurs
 *    plancher, et un drapeau qui le dit. Dix pages par lecture au lieu d'une :
 *    faire échouer tout le passage sur la neuvième ouvrirait [SENTINELLE MUETTE]
 *    pour une lecture aux neuf dixièmes réussie.
 *  · LE MESSAGE D'UNE ERREUR NE PORTE QUE LA TABLE, jamais la requête : elle
 *    porte des identifiants de session, et le message paraît dans le résumé
 *    PUBLIC du passage.
 * Chaque requête a son délai (`LECTURE.delaiMs`). Au plafond exact, la lecture
 * se dit incomplète sans sonder plus loin : dire « partiel » à tort pendant un
 * passage ne coûte rien.
 */
export const LECTURE = Object.freeze({ page: 1000, pagesMax: 10, delaiMs: 20_000 });

export async function lirePagine({ url, cle, chemin, heures, pagesMax = LECTURE.pagesMax, page = LECTURE.page, ordre = "asc", colonne = "received_at", jusqua = null, avanceMs = 0, maintenant = Date.now() }) {
  const depuis = new Date(maintenant - heures * 3600_000 - avanceMs).toISOString();
  const fin = jusqua || new Date(maintenant).toISOString();
  const sens = ordre === "desc" ? "desc" : "asc";
  const table = String(chemin).split("?")[0];
  const plafond = pagesMax * page;
  const lignes = [];
  // Garde-fou : un serveur qui rendrait des pages minuscules ne fait pas tourner la boucle sans fin.
  const requetesMax = pagesMax * 4 + 2;
  for (let requetes = 0; lignes.length < plafond && requetes < requetesMax; requetes++) {
    let lot = null, statut = 0, panne = null;
    try {
      const r = await fetch(`${url}/rest/v1/${chemin}&${colonne}=gt.${depuis}&${colonne}=lte.${fin}` +
        `&order=${colonne}.${sens},id.${sens}&limit=${Math.min(page, plafond - lignes.length)}&offset=${lignes.length}`,
        { headers: { apikey: cle, Authorization: "Bearer " + cle }, signal: AbortSignal.timeout(LECTURE.delaiMs) });
      statut = Number(r.status) || 0;
      if (r.ok) lot = await r.json();
    } catch (e) { panne = e; }
    // 416 = « l'offset demandé dépasse la fin » (PostgREST, PGRST103) : une page vide, dite autrement.
    // Sans en-tête de comptage PostgREST rend d'ordinaire 200 et une liste vide — non vérifiable
    // d'un bac sans accès à l'API. Les DEUX formes valent « fini » : lire un 416 comme une lecture
    // interrompue rendrait « partielle » toute lecture d'au moins une ligne.
    if (statut === 416 && requetes > 0 && !panne) return { lignes, complet: true };
    if (!Array.isArray(lot)) {
      if (requetes > 0) return { lignes, complet: false, interrompue: statut };
      const quoi = panne ? `lecture impossible (${String(panne.name || "Error").slice(0, 40)})` : lot === null ? `HTTP ${statut}` : "réponse illisible";
      const e = new Error(`${table}: ${quoi}`);
      e.status = panne ? 0 : statut;
      e.premiere = true;
      throw e;
    }
    if (lot.length === 0) return { lignes, complet: true };
    lignes.push(...lot);
  }
  return { lignes, complet: false };
}

/**
 * Second temps de la famille bouton : les effets des SEULES sessions suspectes,
 * par lots de sessions. Un lot refusé, tronqué (plus de `pagesParRequete`
 * pages) ou arrivé après `dureeMaxMs` ne rend NI ses effets NI ses sessions :
 * un groupe n'est jugé que si toutes ses sessions sont dans `lues`.
 * `horloge` mesure la durée réelle ; `maintenant` est l'instant figé du passage.
 */
export async function lireEffetsSessions({ url, cle, heures, sessions, maintenant = Date.now(), horloge = Date.now }) {
  const effets = [];
  const lues = new Set();
  let lotsNonLus = 0;
  const depart = horloge();
  for (const lot of lotsSessions(sessions)) {
    if (horloge() - depart > BOUTONS_LECTURE.dureeMaxMs) { lotsNonLus++; continue; }
    let r = null;
    try {
      r = await lirePagine({ url, cle, heures, maintenant, avanceMs: BOUTONS_LECTURE.margeMs, pagesMax: BOUTONS_LECTURE.pagesParRequete,
        chemin: CHEMINS_BOUTONS.effets + "&session_id=in.(" + lot.join(",") + ")" });
    } catch (e) { r = null; }
    if (!r || !r.complet) { lotsNonLus++; continue; }
    effets.push(...r.lignes);
    for (const s of lot) lues.add(s);
  }
  return { effets, lues, lotsNonLus };
}

/**
 * LA FAMILLE BOUTON SE LIT EN DEUX TEMPS (2026-11-21, T4).
 *
 * Avant : tous les clics ET tous les effets de la fenêtre, dix pages chacun.
 * Mesuré le 21/11 : 22,7 effets par session — le plafond de 10 000 mordait vers
 * 435 sessions par jour, et la famille entière ne désignait alors plus rien,
 * sans le dire.
 *
 * ① Les clics seuls, puis le classement existant rejoué SANS AUCUN EFFET : c'est
 *   le pire cas. Tout effet ajouté ne peut que retirer un clic mort, donc un
 *   groupe qui ne passe pas ce filtre ne peut pas devenir une enquête (propriété
 *   tenue par le banc). Aucune règle d'éligibilité n'est recopiée.
 * ② Les effets des seules sessions de ces groupes. Un groupe est relu EN ENTIER
 *   ou pas du tout, et n'est jugé que si toutes ses sessions ont été relues
 *   complètement : un échantillon ne désigne jamais (il laisserait un tirage
 *   choisir une enquête).
 *
 * Le seuil passe ainsi d'environ 435 à environ 2 000 sessions par jour
 * (`sessionsMax`, pour l'UNION des groupes suspects). Au-delà, les boutons les
 * plus cliqués ne sont plus jugés : c'est COMPTÉ (`groupesNonJuges`) et dit au
 * pilote. Seul un agrégat SQL fermera ce trou.
 *
 * ⚠️ LECTURE TÉMOIN. Tant qu'aucun bouton ne réunit trois comptes, le second
 * temps n'envoie aucune requête : sa syntaxe (`session_id=in.(…)`, deux bornes,
 * tri) ne serait éprouvée que le jour où la famille a enfin quelque chose à
 * juger. Dès qu'un clic est lu, UNE ligne est donc demandée sous cette forme
 * exacte ; son échec se dit (`temoin: "echec"`).
 *
 * Des clics tronqués laissent juger les plus récents : c'est une fenêtre plus
 * courte, pas un échantillon (`clicsComplets: false`).
 */
export async function lireFamilleBoutons({ url, cle, heures, opts, anciensDe, maintenant = Date.now(), horloge = Date.now }) {
  // Les clics s'arrêtent `margeMs` AVANT l'instant du passage ; les effets vont jusqu'à lui.
  const clics = await lirePagine({ url, cle, heures, maintenant, ordre: "desc", chemin: CHEMINS_BOUTONS.clics,
    jusqua: new Date(maintenant - BOUTONS_LECTURE.margeMs).toISOString() });
  let temoin = "sans_objet";
  const recent = clics.lignes.find((c) => RE_SESSION.test(String((c && c.session_id) || "")));
  if (recent) {
    try {
      await lirePagine({ url, cle, heures, maintenant, avanceMs: BOUTONS_LECTURE.margeMs, page: 1, pagesMax: 1,
        chemin: CHEMINS_BOUTONS.effets + "&session_id=in.(" + String(recent.session_id) + ")" });
      temoin = "ok";
    } catch (e) { temoin = "echec"; }
  }
  // ① Le pire cas : aucun effet.
  const pre = classerBoutonsMorts(clics.lignes, [], { ...opts, comptesAnciens: "tous", avecUids: true });
  const choix = sessionsALire(pre.candidates);
  // ② Les effets des sessions suspectes, et rien d'autre.
  const lu = choix.sessions.length
    ? await lireEffetsSessions({ url, cle, heures, sessions: choix.sessions, maintenant, horloge })
    : { effets: [], lues: new Set(), lotsNonLus: 0 };
  const juges = new Set(pre.candidates.filter((g) => choix.juges.includes(g.cle) && g._sessions.every((s) => lu.lues.has(s))).map((g) => g.cle));
  const estJuge = (c) => juges.has(c.cle);
  // Deux passages, comme avant : le premier désigne les comptes à relire, le second ne compte que les ANCIENS.
  const premier = classerBoutonsMorts(clics.lignes, lu.effets, { ...opts, comptesAnciens: "tous", avecUids: true }).candidates.filter(estJuge);
  const relus = premier.length
    ? await anciensDe(premier, { parAction: BOUTON_MORT.comptesLusMax })
    : { anciens: new Set(), lus: new Set(), illisibles: 0 };
  const second = classerBoutonsMorts(clics.lignes, lu.effets, { ...opts, comptesAnciens: relus.anciens });
  const candidates = second.candidates.filter(estJuge);
  // ⚠️ Le résumé du run est PUBLIC (dépôt public) : un libellé hors code y est masqué (contre-revue du 2026-11-03).
  const clicsJuges = clics.lignes.filter((c) => juges.has(cleBouton(c)) && !estHorsPublic(c));
  return {
    morts: { candidates, nonVerifiees: second.nonVerifiees, recents: second.recents },
    suspects: { portee: PORTEE_SUSPECTS, classement: masquerSuspects(classerBoutons(clicsJuges, lu.effets).slice(0, 5), opts) },
    // Des NOMBRES et des mots fixes seulement : ce bloc part dans le résumé public du passage.
    lecture: {
      clicsLus: clics.lignes.length, clicsComplets: clics.complet, temoin,
      groupesSuspects: pre.candidates.length, groupesJuges: juges.size, groupesNonJuges: pre.candidates.length - juges.size,
      sessionsLues: lu.lues.size, lotsNonLus: lu.lotsNonLus, sessionsInvalides: pre.sessionsInvalides, horsPublic: pre.horsPublic,
      ancienneteNonRelus: nonRetenusNonRelus(premier, candidates, relus.lus), ancienneteIllisibles: relus.illisibles,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LE PASSAGE N'A PAS LU, EN CODES FERMÉS (2026-11-21, T4)
//
// « Rien à corriger » mentait de trois façons : une lecture tronquée, une
// famille qui ne juge plus, une ancienneté relue en partie. `bilanLecture` en
// fait une liste de CODES ; `etatPartiel` en fait le titre et le corps de
// l'issue d'état que le pilote lit (label `sentinelle-partielle`).
// ⚠️ DES CODES ET DES NOMBRES, JAMAIS UN TEXTE VENU D'AILLEURS. L'issue est
// publique : chaque phrase est écrite ICI, un code inconnu est ignoré, un nombre
// est forcé en entier. Rien de ce qu'un navigateur a envoyé n'y entre.
// ═══════════════════════════════════════════════════════════════════════════
const entier = (x) => { const n = Math.trunc(Number(x)); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * Les correspondances, une par code :
 *  · js_client_errors, js_telemetrie, api : la lecture n'est pas complète (`lues` = lignes lues) ;
 *  · boutons_clics : les clics ne sont pas complets ; boutons_non_juges : des groupes suspects
 *    n'ont pas été jugés ; boutons_illisibles : la famille a levé, ou la lecture témoin a échoué ;
 *  · parcours_tronques : le flux n'est pas complet ; parcours_illisibles : la famille a levé ;
 *  · anciennete : `n` candidats NON retenus gardent des comptes jamais relus (un candidat
 *    retenu ne compte jamais) ; anciennete_illisible : lectures refusées par l'authentification.
 * FONCTION PURE.
 */
export function bilanLecture({ clientErrors, telemetrieErreurs, api, boutons, parcours, anciennete } = {}) {
  const partiel = [];
  const tronquee = (code, s) => { if (s && s.complet === false) partiel.push({ code, lues: entier(s.lues) }); };
  tronquee("js_client_errors", clientErrors);
  tronquee("js_telemetrie", telemetrieErreurs);
  tronquee("api", api);
  if (boutons) {
    if (boutons.erreur || boutons.temoin === "echec") partiel.push({ code: "boutons_illisibles", n: 1 });
    if (boutons.clicsComplets === false) partiel.push({ code: "boutons_clics", lues: entier(boutons.clicsLus) });
    if (entier(boutons.groupesNonJuges) > 0) partiel.push({ code: "boutons_non_juges", n: entier(boutons.groupesNonJuges) });
  }
  if (parcours) {
    if (parcours.erreur) partiel.push({ code: "parcours_illisibles", n: 1 });
    else tronquee("parcours_tronques", parcours);
  }
  if (anciennete) {
    if (entier(anciennete.nonRelus) > 0) partiel.push({ code: "anciennete", n: entier(anciennete.nonRelus) });
    if (entier(anciennete.illisibles) > 0) partiel.push({ code: "anciennete_illisible", n: entier(anciennete.illisibles) });
  }
  return { complet: partiel.length === 0, partiel };
}

/** Préfixe du titre de l'issue d'état : le workflow la retrouve par son label PUIS par ce préfixe. */
export const PREFIXE_PARTIELLE = "[SENTINELLE PARTIELLE]";
// Une phrase FIXE et un nom court par code. `x` ne porte que des nombres déjà forcés.
const PHRASES_PARTIEL = Object.freeze({
  js_client_errors: { nom: "erreurs JS", phrase: (x) => `Erreurs JavaScript (client_errors) : seules les ${x.lues} lignes les plus récentes ont été lues.` },
  js_telemetrie: { nom: "erreurs JS", phrase: (x) => `Erreurs JavaScript (télémétrie) : seules les ${x.lues} lignes les plus récentes ont été lues.` },
  api: { nom: "appels refusés", phrase: (x) => `Appels refusés : seuls les ${x.lues} plus récents ont été lus.` },
  boutons_clics: { nom: "boutons", phrase: (x) => `Boutons : seuls les ${x.lues} clics les plus récents ont été lus.` },
  boutons_non_juges: { nom: "boutons", phrase: (x) => `Boutons : ${x.n} bouton(s) suspect(s) non jugé(s) — trop de sessions à relire, ou une lecture incomplète.` },
  boutons_illisibles: { nom: "boutons", phrase: () => "Boutons : la lecture a échoué, la famille n'a pas pu juger." },
  parcours_tronques: { nom: "parcours", phrase: (x) => `Parcours : trop d'étapes sur la fenêtre (${x.lues} lues), la famille n'a rien jugé.` },
  parcours_illisibles: { nom: "parcours", phrase: () => "Parcours : la lecture a échoué, la famille n'a rien jugé." },
  anciennete: { nom: "ancienneté des comptes", phrase: (x) => `Ancienneté des comptes : ${x.n} défaut(s) écarté(s) sans que tous leurs comptes aient été relus.` },
  anciennete_illisible: { nom: "ancienneté des comptes", phrase: (x) => `Ancienneté des comptes : ${x.n} lecture(s) refusée(s) par le service d'authentification.` },
});

/**
 * L'issue d'état « la Sentinelle n'a pas tout traité » : `{ partiel, titre, corps }`.
 * « En attente » n'est dit que si le budget d'enquêtes du jour est ATTEINT et
 * qu'il reste des défauts vivants : c'est le seul cas où « rien à corriger »
 * mentirait (la file ordinaire, trois enquêtes en cours, se vide seule).
 * FONCTION PURE : ni horloge, ni réseau, ni texte reçu.
 */
export function etatPartiel(verdict, { attente = 0, budgetAtteint = false } = {}) {
  const lecture = verdict && verdict.lecture && Array.isArray(verdict.lecture.partiel) ? verdict.lecture.partiel : [];
  const lignes = [], noms = [];
  for (const p of lecture) {
    const code = p && typeof p.code === "string" ? p.code : "";
    if (!Object.hasOwn(PHRASES_PARTIEL, code)) continue;
    lignes.push(PHRASES_PARTIEL[code].phrase({ lues: entier(p.lues), n: entier(p.n) }));
    if (!noms.includes(PHRASES_PARTIEL[code].nom)) noms.push(PHRASES_PARTIEL[code].nom);
  }
  const enAttente = budgetAtteint === true ? entier(attente) : 0;
  if (enAttente > 0) {
    lignes.push(`${enAttente} défaut(s) retenu(s) attendent : le budget d'enquêtes par 24 h est atteint.`);
    noms.push("défauts en attente");
  }
  // Aucune coupe : `noms` ne porte que des noms fixes, dédoublonnés — le plus long titre possible est tenu par le banc (T4-18).
  const titre = PREFIXE_PARTIELLE + " pas tout traité : " + noms.join(", ");
  const corps = [
    "La Sentinelle a lu la production, mais elle n'a pas pu tout lire ou tout confier :",
    "",
    ...lignes.map((l) => "- " + l),
    "",
    "Tant que cette note est ouverte, « rien à corriger » ne prouve pas le calme : un défaut peut se trouver dans ce qui n'a pas été lu.",
    "Elle se met à jour à chaque passage et se referme seule quand tout est de nouveau lu. Elle ne déclenche aucune correction automatique.",
  ].join("\n");
  return { partiel: lignes.length > 0, titre, corps };
}

/** L'attente avant de refermer l'issue d'état : chaque passage partiel la réécrit, donc la repousse. */
export const ETAT_FERMETURE_MS = 90 * 60_000;
const RE_MIS_A_JOUR = /^- Mis à jour : (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)$/;

/**
 * Quelles issues d'état refermer, tout étant de nouveau lu ? Celles qu'aucun
 * passage n'a réécrites depuis `ETAT_FERMETURE_MS`.
 * ⚠️ L'HEURE SE LIT DANS LE CORPS (« - Mis à jour : <ISO> », écrite par l'étape
 * « État de lecture »), JAMAIS dans `updatedAt` : GitHub avance `updatedAt` à
 * chaque commentaire, et le dépôt est public — un compte quelconque qui
 * commentait toutes les heures tenait l'issue ouverte, donc le voyant orange.
 * Le corps, lui, ne se modifie qu'avec le droit d'écrire. Plusieurs lignes : la
 * plus récente. Un corps SANS date lisible (retouché à la main) : `updatedAt`
 * décide, faute de mieux — la conversation est verrouillée à la création — et
 * une issue dont ni l'un ni l'autre ne se lit reste ouverte. FONCTION PURE.
 */
export function etatsAFermer(issues, maintenant = Date.now()) {
  const limite = maintenant - ETAT_FERMETURE_MS;
  const numeros = [];
  for (const i of Array.isArray(issues) ? issues : []) {
    if (!i || typeof i.title !== "string" || !i.title.startsWith(PREFIXE_PARTIELLE)) continue;
    if (!Number.isInteger(i.number) || i.number <= 0) continue;
    const dates = String(typeof i.body === "string" ? i.body : "").split("\n")
      .map((l) => RE_MIS_A_JOUR.exec(l.replace(/\r$/, ""))).filter(Boolean).map((m) => Date.parse(m[1])).filter(Number.isFinite);
    const reference = dates.length ? Math.max(...dates) : Date.parse(String(i.updatedAt || ""));
    if (Number.isFinite(reference) && reference < limite) numeros.push(i.number);
  }
  return numeros;
}

/** Le texte de l'interface (index.html + js/*.js) : le seul où un libellé de bouton peut être retrouvé. */
export async function lireCodeInterface(racine = ".") {
  const { readFile, readdir } = await import("node:fs/promises");
  const morceaux = [await readFile(racine + "/index.html", "utf8")];
  for (const nom of (await readdir(racine + "/js")).filter((n) => n.endsWith(".js")).sort()) {
    morceaux.push(await readFile(racine + "/js/" + nom, "utf8"));
  }
  return morceaux.join("\n");
}

/**
 * UN PASSAGE DE DÉTECTION : lit, classe, et rend le verdict. Rien d'autre.
 *
 * Exporté (2026-11-21) pour être EXÉCUTÉ par le banc de bout en bout : tant que
 * ce corps vivait dans `principal()`, sa première exécution après une retouche
 * avait lieu en production, à la minute 23 — et une faute de câblage y donnait
 * un passage rouge, donc [SENTINELLE MUETTE].
 * `maintenant` est fixé UNE fois et passé à toutes les lectures : leurs bornes
 * désignent le même instant. `horloge` mesure les durées ; `lireCode` rend le
 * texte de l'interface (doublé par le banc).
 */
export async function detecter({ url, cle, heures = 24, maintenant = Date.now(), horloge = Date.now, lireCode = lireCodeInterface } = {}) {
  // ⚠️ Les TROIS lectures sont un devoir : l'échec de l'une fait échouer le run
  // (bruyamment — le workflow ouvre alors [SENTINELLE MUETTE]). Une source
  // muette qui rendrait « rien à signaler » serait la panne silencieuse.
  // Tronquée, une lecture reste classée et se dit (`lecture`, plus bas).
  const [rClient, rApi, rTelemetrie] = await Promise.all([
    lireErreurs({ url, cle, heures, maintenant }),
    lireApi({ url, cle, heures, maintenant }),
    lireErreursTelemetrie({ url, cle, heures, maintenant }),
  ]);
  const erreursClient = rClient.lignes, appels = rApi.lignes, erreursTelemetrie = rTelemetrie.lignes;
  const fusion = fusionnerErreursJs(erreursClient, erreursTelemetrie);
  const lignes = fusion.lignes;
  // L'ancienneté : une mémoire et un compteur de refus pour TOUT le passage.
  const echecs = { n: 0 };
  const anciensDe = relecteurAnciennete({ url, cle, maintenant, echecs });

  // ⚠️ LA TROISIÈME FAMILLE NE DOIT JAMAIS FAIRE ÉCHOUER LA DÉTECTION. Elle est
  // un CONFORT (un classement de suspects) ; les deux autres sont le devoir.
  // Si sa lecture échoue, on se tait sur elle, on le DIT (`lecture`), et le
  // reste du verdict part quand même.
  let boutonsSuspects = null;
  let boutonsLecture = null;
  let morts = { candidates: [], nonVerifiees: 0 };
  try {
    const code = await lireCode();
    const opts = { libelles: libellesDuCode(code), ecrans: ecransDuCode(code) };
    const b = await lireFamilleBoutons({ url, cle, heures, opts, anciensDe, maintenant, horloge });
    morts = b.morts;
    boutonsSuspects = b.suspects;
    boutonsLecture = b.lecture;
  } catch (e) {
    boutonsSuspects = { erreur: String(e.message || e).slice(0, 160) };
    boutonsLecture = { erreur: true };
  }
  // Quatrième famille (2026-11-06) : les parcours en échec. Un confort, comme
  // les boutons — sa lecture qui échoue ou se tronque ne fait rien échouer et
  // ne désigne rien (une page manquante pourrait porter la confirmation).
  let parcours = { candidates: [], ecartees: 0, nonVerifiees: 0 };
  let parcoursSource = null;
  let parcoursNonRelus = 0;
  try {
    const fl = await lirePagine({ url, cle, heures, maintenant, chemin: CHEMIN_FLUX + FILTRE_PRODUCTION });
    parcoursSource = { lues: fl.lignes.length, complet: fl.complet };
    if (fl.complet) {
      // Deux passages, comme les boutons : seuls les comptes ANCIENS décident.
      const premier = classerParcours(fl.lignes, { comptesAnciens: "tous", avecUids: true });
      const choix = uidsAVerifier(premier.candidates);
      const anciens = new Set();
      for (const lot of choix.lots) for (const u of await lireComptesAnciens({ url, cle, uids: lot.uids, maintenant, echecs })) anciens.add(u);
      parcours = classerParcours(fl.lignes, { comptesAnciens: anciens });
      parcoursSource.verificationsIncompletes = choix.nonVerifies;
      parcoursNonRelus = nonRetenusNonRelus(premier.candidates, parcours.candidates, new Set(choix.lots.flatMap((l) => l.uids)));
    }
  } catch (e) {
    parcoursSource = { erreur: String(e.message || e).slice(0, 160) };
  }
  const js = classer(lignes);
  const api = classerApi(appels);
  // ⚠️ LES DEUX FAMILLES SONT MISES EN CONCURRENCE SUR LA MÊME RÈGLE — comptes
  // touchés d'abord, volume ensuite — et JAMAIS l'une avant l'autre par
  // principe : une erreur JavaScript n'est pas plus grave qu'un envoi de
  // message refusé 798 fois. C'est ce que subissent les gens qui tranche.
  // Les boutons morts (2026-11-01) entrent dans la MÊME concurrence.
  // Triées AVANT la relecture d'ancienneté : si le budget manque, c'est le défaut
  // le moins répandu qui reste non relu, pas celui que le hasard a mis en queue.
  const libres = [...js.candidates, ...api.candidates].sort((a, b) => (b.comptes - a.comptes) || (b.n - a.n));
  const relus = libres.length ? await anciensDe(libres) : { anciens: new Set(), lus: new Set(), illisibles: 0 };
  const preuves = retenirPreuves(libres, relus.anciens);
  const candidates = [...preuves.retenus, ...morts.candidates, ...parcours.candidates]
    .sort((a, b) => (b.comptes - a.comptes) || (b.n - a.n));
  const verdict = {
    fenetreHeures: heures,
    lues: erreursClient.length + erreursTelemetrie.length + appels.length,
    ecartees: js.ecartees + api.ecartees + fusion.doublons + fusion.plafonnees + parcours.ecartees,
    retenues: candidates.length,
      parFamille: { js: js.candidates.length, api: api.candidates.length, bouton: morts.candidates.length, parcours: parcours.candidates.length },
      // Écartées faute de comptes anciens : un humain les voit au résumé, aucun agent ne les reçoit.
      sousLeSeuil: preuves.sousLeSeuil,
    // Ce que chaque source a fourni : un zéro durable sur l'une d'elles se lit
    // ici, pas dans le silence du verdict (les champs existants ne changent pas).
    sources: {
      clientErrors: erreursClient.length,
      telemetrieErreurs: erreursTelemetrie.length,
      api: appels.length,
      doublonsJs: fusion.doublons,
      plafonneesJs: fusion.plafonnees,
      parcours: parcoursSource,
      boutons: boutonsLecture,
    },
    // ⚠️ HORS `cible`, DÉLIBÉRÉMENT : ce classement-ci n'ouvre aucune issue — un
    // taux bas seul peut être un bouton mort comme un effet non instrumenté.
    // Ce qui devient une enquête passe par `classerBoutonsMorts` (clics rageurs,
    // comptes serveur, libellé du code) et figure dans `candidats`.
    // Il ne porte plus que les groupes JUGÉS, clics de comptes seulement (`portee`).
    boutonsSuspects,
    cible: candidates[0] || null,
    // ASTRA-08 : les suivants, pour que la dédup du workflow puisse AVANCER
    // (`choisirCible`) au lieu de s'arrêter sur un premier déjà corrigé.
    // ⚠️ ASTRA-08 (2026-09-15) : TOUS les candidats, pas cinq — cinq déjà fermés
    // masquaient le sixième, actif. La liste reste bornée par le classement lui-même.
    candidats: candidates.slice(),
    identitesNonVerifiees: (js.nonVerifiees || 0) + (api.nonVerifiees || 0) + (morts.nonVerifiees || 0) + (parcours.nonVerifiees || 0),
    // Ce que ce passage n'a PAS lu ou pas pu juger, en codes fermés : c'est ce que
    // l'étape « État de lecture » du workflow dit au pilote (`etatPartiel`).
    lecture: bilanLecture({
      clientErrors: { lues: erreursClient.length, complet: rClient.complet },
      telemetrieErreurs: { lues: erreursTelemetrie.length, complet: rTelemetrie.complet },
      api: { lues: appels.length, complet: rApi.complet },
      boutons: boutonsLecture,
      parcours: parcoursSource,
      anciennete: {
        nonRelus: nonRetenusNonRelus(libres, preuves.retenus, relus.lus) + ((boutonsLecture && boutonsLecture.ancienneteNonRelus) || 0) + parcoursNonRelus,
        illisibles: echecs.n,
      },
    }),
  };
  return verdict;
}

async function principal() {
  const url = process.env.SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const heures = Number(process.env.SENTINELLE_FENETRE_H || 24);
  if (!url || !cle) {
    // ⚠️ On ÉCHOUE, on ne rend pas « rien à signaler ». Une sentinelle sans
    // accès qui rend un verdict vide est indiscernable d'une prod saine —
    // c'est la panne silencieuse que tout ce chantier corrige.
    console.error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant : la détection ne peut pas s'exécuter.");
    process.exit(2);
  }
  console.log(JSON.stringify(await detecter({ url, cle, heures }), null, 2));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  principal().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}
