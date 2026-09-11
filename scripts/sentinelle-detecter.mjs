#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// SENTINELLE AUTONOME — ÉTAPE 1 : TROUVER CE QUE SUBISSENT LES UTILISATEURS.
//
// Tourne dans GitHub Actions (pas sur un PC), lit `client_errors` en production
// et rend UN verdict : y a-t-il un défaut qui mérite un correctif automatique ?
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

// Messages qui ne portent AUCUNE information exploitable : les corriger est
// impossible, les compter fait du bruit qui masque le vrai signal.
//   · « Script error. » = erreur d'un script d'une autre origine, le navigateur
//     REFUSE d'en dire plus par sécurité. Il n'y a rien à lire, jamais.
//   · Les extensions de navigateur du visiteur ne sont pas notre code.
export const BRUIT = [
  /^script error\.?$/i,
  /^resizeobserver loop/i,
  /extension:\/\//i,
  /^network ?error$/i,
];

// Un seul compte qui rencontre une erreur peut être un appareil exotique ; le
// même défaut chez plusieurs comptes est un défaut du produit. On garde les
// deux, mais on les classe différemment.
const MIN_OCCURRENCES = Number(process.env.SENTINELLE_MIN_OCCURRENCES || 3);

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
  const min = options.min ?? MIN_OCCURRENCES;
  const groupes = new Map();
  let ecartees = 0;

  for (const l of lignes) {
    if (estDuBruit(l.message)) { ecartees++; continue; }
    const cle = empreinte(l.message);
    if (!groupes.has(cle)) {
      groupes.set(cle, { cle, message: String(l.message).slice(0, 300), n: 0, comptes: new Set(), dernier: null, exemple: null });
    }
    const g = groupes.get(cle);
    g.n++;
    if (l.uid) g.comptes.add(String(l.uid));
    if (!g.dernier || String(l.created_at) > g.dernier) g.dernier = String(l.created_at);
    // On garde UN exemple complet : c'est lui qui porte la pile d'appel, donc
    // le seul contexte qui permette d'établir une cause dans le code.
    if (!g.exemple && (l.stack || l.source)) {
      g.exemple = { stack: String(l.stack || "").slice(0, 2000), source: l.source || null, line: l.line || null, url: l.url || null };
    }
  }

  const candidates = [...groupes.values()]
    .map((g) => ({ ...g, comptes: g.comptes.size }))
    // ⚠️ LE TRI EST PAR NOMBRE DE COMPTES D'ABORD. Une erreur vue 200 fois par
    // UNE personne est souvent un appareil ou une extension ; vue 3 fois par
    // 3 personnes, c'est le produit. Trier par volume brut ferait travailler la
    // sentinelle sur le cas le moins représentatif.
    .sort((a, b) => (b.comptes - a.comptes) || (b.n - a.n))
    .filter((g) => g.n >= min || g.comptes >= 2);

  return { candidates, ecartees };
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
export function estDuBruitApi(ligne) {
  const code = Number(ligne?.http_status || 0);
  if (!code) return true;
  const e = String(ligne?.endpoint || "");
  if (/\/auth\/v1\/token/.test(e) && code >= 400 && code < 500) return true;
  return false;
}

const MIN_OCCURRENCES_API = Number(process.env.SENTINELLE_MIN_API || 5);

/** Nomme un refus en une phrase lisible, sans jamais inventer de cause. */
export function libelleApi(methode, chemin, code) {
  const quoi = {
    401: "refusé — jeton absent ou expiré",
    403: "refusé — la règle d'accès (RLS) dit non",
    404: "introuvable",
    409: "conflit — la ligne existe déjà",
    500: "erreur du serveur",
  }[Number(code)] || "en échec";
  return `HTTP ${code} sur ${methode} ${chemin} : ${quoi}`;
}

/**
 * Classe des lignes `telemetry_events` (type=api, status=error) en causes.
 * FONCTION PURE, comme `classer()` — éprouvée sans base et sans réseau.
 */
export function classerApi(lignes = [], options = {}) {
  const min = options.min ?? MIN_OCCURRENCES_API;
  const groupes = new Map();
  let ecartees = 0;

  for (const l of lignes) {
    if (estDuBruitApi(l)) { ecartees++; continue; }
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
        n: 0, comptes: new Set(), dernier: null, exemple: null,
      });
    }
    const g = groupes.get(cle);
    g.n++;
    if (l.user_id) g.comptes.add(String(l.user_id));
    if (!g.dernier || String(l.received_at) > g.dernier) g.dernier = String(l.received_at);
  }

  const candidates = [...groupes.values()].map((g) => {
    const comptes = g.comptes.size;
    return {
      ...g, comptes,
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
    .filter((g) => g.n >= min || g.comptes >= 2);

  return { candidates, ecartees };
}

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

  // Index par session : sans lui, chaque clic balaierait TOUS les effets.
  const parSession = new Map();
  for (const e of effets) {
    const k = String(e.session_id || "");
    if (!k) continue;
    if (!parSession.has(k)) parSession.set(k, []);
    parSession.get(k).push(Date.parse(e.client_ts));
  }
  for (const liste of parSession.values()) liste.sort((a, b) => a - b);

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
    if (suite.some((te) => te > t && te <= t + fenetre)) g.avecEffet++;
  }

  return [...groupes.values()]
    .filter((g) => g.clics >= min)
    .map((g) => ({ ...g, tauxEffet: Math.round((100 * g.avecEffet) / g.clics) }))
    .sort((a, b) => (a.tauxEffet - b.tauxEffet) || (b.clics - a.clics));
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
  const lisible = desamorcer(cle, 1).replace(/[\n\r]/g, " ").slice(0, 60).trim();
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

/**
 * Ce défaut a-t-il déjà été traité ? `fermees` = les issues [SENTINELLE] closes,
 * telles que `gh issue list --label sentinelle --state closed` les rend.
 *
 * ⚠️ On filtre par LABEL, jamais par `--search "[SENTINELLE]" in:title` :
 * l'index de recherche de GitHub retarde (mesuré le 2026-09-10, #316 absente de
 * l'index plusieurs heures après sa création). Une dédup qui interroge un index
 * en retard laisse passer très exactement le doublon qu'elle devait arrêter.
 */
export function dejaCorrige(cible, fermees) {
  if (!cible || !Array.isArray(fermees)) return false;
  const titre = titreIssue(cible);
  const dernier = Date.parse(cible.dernier);
  // Une cible sans date d'occurrence lisible ne se compare à rien : on ne peut
  // pas prouver qu'elle est ancienne, donc on laisse l'enquête s'ouvrir. Se
  // taire sur un doute ferait manquer un vrai défaut ; ouvrir en trop coûte une
  // issue qu'un humain referme.
  if (!Number.isFinite(dernier)) return false;
  return fermees.some((f) => {
    if (String(f?.title || "") !== titre) return false;
    const clos = Date.parse(f?.closedAt || f?.closed_at);
    return Number.isFinite(clos) && clos > dernier;
  });
}

/** Lit les erreurs récentes via PostgREST. Isolé pour rester testable. */

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
async function lireErreurs({ url, cle, heures }) {
  const depuis = new Date(Date.now() - heures * 3600_000).toISOString();
  const entetes = { headers: { apikey: cle, Authorization: "Bearer " + cle } };
  const base = `${url}/rest/v1/client_errors?select=message,source,line,stack,url,uid,created_at`;

  // Chemin nominal : identité vérifiée par le serveur exigée.
  const rAuth = await fetch(
    `${base},auth_uid&auth_uid=not.is.null&created_at=gt.${depuis}&order=created_at.desc&limit=1000`,
    entetes);
  if (rAuth.ok) return rAuth.json();
  // 400 = colonne absente : la migration n'est pas encore appliquée.
  if (rAuth.status !== 400) throw new Error(`client_errors: HTTP ${rAuth.status}`);

  const r = await fetch(`${base}&created_at=gt.${depuis}&order=created_at.desc&limit=1000`, entetes);
  if (!r.ok) throw new Error(`client_errors: HTTP ${r.status}`);
  const lignes = await r.json();
  // Le repli est SIGNALÉ : sans cette marque, on ne saurait pas que la chaîne
  // travaille encore sur des lignes d'origine non vérifiée.
  for (const l of lignes) l._origineNonVerifiee = true;
  return lignes;
}

/** Lit les appels réseau refusés. Isolé pour rester testable, comme ci-dessus. */
async function lireApi({ url, cle, heures }) {
  const depuis = new Date(Date.now() - heures * 3600_000).toISOString();
  const r = await fetch(
    `${url}/rest/v1/telemetry_events?select=endpoint,http_status,action,user_id,received_at` +
    `&type=eq.api&status=eq.error&received_at=gt.${depuis}&order=received_at.desc&limit=2000`,
    { headers: { apikey: cle, Authorization: "Bearer " + cle } });
  // ⚠️ On N'AVALE PAS cet échec : une source muette rendrait « rien à signaler »
  // alors que c'est l'accès qui manque — la panne silencieuse, encore.
  if (!r.ok) throw new Error(`telemetry_events: HTTP ${r.status}`);
  return r.json();
}

/**
 * Lit une table de télémétrie EN ENTIER sur la fenêtre, page par page.
 *
 * ⚠️ UNE LECTURE PARTIELLE FABRIQUE DE FAUX BOUTONS MORTS : il manquerait des
 * EFFETS, donc des clics paraîtraient sans suite alors qu'ils en avaient une.
 * On rend donc `{ lignes, complet }`, et l'appelant REFUSE de publier un
 * classement incomplet. Mieux vaut ne rien dire que désigner un innocent.
 */
async function lirePagine({ url, cle, chemin, heures, pagesMax = 10 }) {
  const depuis = new Date(Date.now() - heures * 3600_000).toISOString();
  const taille = 1000;
  const lignes = [];
  for (let page = 0; page < pagesMax; page++) {
    const r = await fetch(`${url}/rest/v1/${chemin}&received_at=gt.${depuis}` +
      `&order=received_at.asc&limit=${taille}&offset=${page * taille}`,
      { headers: { apikey: cle, Authorization: "Bearer " + cle } });
    if (!r.ok) throw new Error(`${chemin}: HTTP ${r.status}`);
    const lot = await r.json();
    lignes.push(...lot);
    if (lot.length < taille) return { lignes, complet: true };
  }
  return { lignes, complet: false };
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
  const [lignes, appels] = await Promise.all([
    lireErreurs({ url, cle, heures }),
    lireApi({ url, cle, heures }),
  ]);

  // ⚠️ LA TROISIÈME FAMILLE NE DOIT JAMAIS FAIRE ÉCHOUER LA DÉTECTION. Elle est
  // un CONFORT (un classement de suspects) ; les deux autres sont le devoir.
  // Si sa lecture échoue ou revient incomplète, on se tait sur elle et le reste
  // du verdict part quand même.
  let boutonsSuspects = null;
  try {
    const [clics, effets] = await Promise.all([
      lirePagine({ url, cle, heures, chemin: "telemetry_events?select=action,screen,session_id,client_ts&type=eq.click" }),
      lirePagine({ url, cle, heures, chemin: "telemetry_events?select=session_id,client_ts&type=in.(action,nav,api,flow)" }),
    ]);
    boutonsSuspects = (clics.complet && effets.complet)
      ? classerBoutons(clics.lignes, effets.lignes).slice(0, 5)
      : { incomplet: true, note: "Lecture tronquée : un classement partiel désignerait des innocents." };
  } catch (e) {
    boutonsSuspects = { erreur: String(e.message || e) };
  }
  const js = classer(lignes);
  const api = classerApi(appels);
  // ⚠️ LES DEUX FAMILLES SONT MISES EN CONCURRENCE SUR LA MÊME RÈGLE — comptes
  // touchés d'abord, volume ensuite — et JAMAIS l'une avant l'autre par
  // principe : une erreur JavaScript n'est pas plus grave qu'un envoi de
  // message refusé 798 fois. C'est ce que subissent les gens qui tranche.
  const candidates = [...js.candidates, ...api.candidates]
    .sort((a, b) => (b.comptes - a.comptes) || (b.n - a.n));
  const verdict = {
    fenetreHeures: heures,
    lues: lignes.length + appels.length,
    ecartees: js.ecartees + api.ecartees,
    retenues: candidates.length,
    parFamille: { js: js.candidates.length, api: api.candidates.length },
    // ⚠️ HORS `cible`, DÉLIBÉRÉMENT : ce classement n'ouvre aucune issue et ne
    // déclenche aucun correctif. Il paraît dans le résumé du run pour qu'un
    // humain aille VÉRIFIER — un taux bas peut être un bouton mort comme un
    // effet non instrumenté, et rien ici ne sait les distinguer.
    boutonsSuspects,
    cible: candidates[0] || null,
  };
  console.log(JSON.stringify(verdict, null, 2));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  principal().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}
