// ═══════════════════════════════════════════════════════════════════════════
// POLITIQUE D'AUTOMATISATION — ce que les machines font SEULES, sous forme de
// code (2026-11-06, consigne §15, §16, §20)
//
// Jusqu'ici, ce que la veille et la Sentinelle avaient le droit de faire était
// ÉPARPILLÉ : seuils du délestage dans reglages.js, réveil et retour arrière
// dans autonomie.js, périmètre et bornes de l'auto-fusion dans deploy.yml,
// relance et récidive dans sentinelle-autonome.yml. Aucun endroit ne disait
// « voici la liste fermée des gestes autonomes, et voici ceux qui ne le seront
// jamais ». Ce fichier est ce catalogue — et il ne décrit QUE ce que le code
// applique vraiment : `tests/unit/politique-autonomie.test.mjs` compare chaque
// valeur à la constante, ou à la ligne de workflow, qui l'impose. Une politique
// qui dirait 60 lignes quand deploy.yml en applique 80 rougit la CI.
//
// Trois circuits (consigne §15) :
//   A — reprise opérationnelle CONNUE : bornée, idempotente ou récupérable,
//       vérifiée après coup. Exécutée sans validation à chaque occurrence.
//   B — correctif logiciel à risque faible : reproduit, testé, borné en
//       périmètre et en taille, fusionné par la CI — jamais un patch opaque.
//   C — sensible : JAMAIS autonome (droits, RLS, migrations, restauration,
//       modération, retour arrière automatique, secrets, cette politique même).
//       Le système PROTÈGE (délestage, alerte, proposition) et PRÉPARE ; un
//       humain décide.
//
// `autoriser()` est consultée par la fonction `pilotage` AVANT chaque geste
// automatique de la VEILLE (banc : tests/unit/pilotage.test.mjs ㉿④). Les gestes
// exécutés par GitHub (correctif, relance) sont imposés par leurs workflows : la
// politique les DÉCRIT et le banc vérifie que le workflow applique ces bornes. Elle échoue FERMÉ : politique absente, invalide ou
// en mode observation → aucun geste, l'observation continue (voyant, alertes,
// battement). Une alerte n'est jamais un geste : observer n'est pas réparer.
// La politique ne change que par une PR (revue, CI) : aucune machine ne la
// modifie (runbook `modification_politique`, circuit C).
// Ce fichier ne fait AUCUN appel réseau ; tests/unit/politique-autonomie.test.mjs.
// ═══════════════════════════════════════════════════════════════════════════

export const CIRCUITS = Object.freeze({ A: "reprise connue", B: "correctif logiciel borné", C: "sensible — jamais autonome" });
export const MODES = Object.freeze(["applique", "observation"]);

const rb = (x) => Object.freeze({ suspenduParPause: false, ...x, limites: Object.freeze({ ...(x.limites || {}) }), preconditions: Object.freeze([...(x.preconditions || [])]) });

export const POLITIQUE = Object.freeze({
  version: 1,
  environnement: "production",
  // `observation` : la veille décide et le DIT (battement), sans agir. Les
  // gestes de circuit A tournent en production depuis octobre 2026 (délestage
  // le 2026-10-21, réveil et proposition le 2026-10-12) : les déclarer en
  // observation mentirait sur ce que fait la production.
  mode: "applique",
  pause: "issue « [SENTINELLE PAUSE] » ouverte par PASSIO74 (bouton Pause du pilotage) : suspend les gestes marqués suspenduParPause",
  observation: Object.freeze({ inconnuEstSain: false, perimeEstSain: false, succesMetierExige: true, chienDeGardeExterieur: "veille-production.yml (GitHub) lit le battement de la veille Supabase" }),
  limites: Object.freeze({
    enquetesSimultanees: 3,          // MAX_ENQUETES (scripts/sentinelle-detecter.mjs)
    enquetesParZone: 1,              // zoneCible : jamais deux enquêtes sur la même zone
    recidiveVersHumainApres: 2,      // RECIDIVE_SEUIL : deux correctifs déployés puis récidive → humain
    correctifFichiersMax: 2,         // deploy.yml, ASTRA-34
    correctifLignesMax: 60,          // deploy.yml, ASTRA-34
    relancesEnqueteMax: 1,           // le veilleur relance UNE fois une enquête sans run
  }),
  runbooks: Object.freeze({
    // ── Circuit A : reprises connues, exécutées seules ───────────────────────
    delestage_auto: rb({
      libelle: "Ralentir l'app avant le mur, puis la rendre", circuit: "A", autonome: true,
      symptome: "connexions temps réel ≥ 80 % du plafond, ou pannes serveur chez ≥ 10 comptes de plus de 7 jours en 15 min",
      action: "réglage distant `delestage` niveau 1 (×2) puis 2 (×4) ; descente d'un cran après 30 min sous les seuils",
      preconditions: ["mesure exacte (pilotage_audience)", "réglage non posé à la main par le pilote", "veille non aveugle pour descendre"],
      limites: { pctMonter1: 80, pctMonter2: 95, comptes5xxMonter1: 10, comptes5xxMonter2: 40, tenueMin: 30 },
      verification: "niveau relu au tour suivant ; les compteurs redescendent", retour: "« Normal » d'un toucher dans le pilotage ; la veille redescend seule",
      escalade: "si le délestage dure, un quota doit monter (geste humain, docs/PASSIO_100K_AUTONOMIE.md §4)",
      appliquePar: "supabase/functions/_shared/reglages.js (decideDelestage)",
    }),
    reveil_sentinelle: rb({
      libelle: "Lancer la Sentinelle dès que des comptes échouent", circuit: "A", autonome: true, suspenduParPause: true,
      symptome: "échecs chez ≥ 2 comptes réels créés depuis plus de 24 h en 30 min (erreurs et refus comptés en base), ou un parcours en panne CONFIRMÉE sur la dernière heure",
      action: "workflow_dispatch de sentinelle-autonome.yml (lecture, classement, enquête : la détection garde ses propres filtres)",
      preconditions: ["jeton GitHub posé", "pas de pause", "place libre parmi les enquêtes", "pas de run en cours ni de moins de 45 min"],
      limites: { comptesMin: 2, fenetreMin: 30, parHeure: 2, parJour: 12, runRecentMin: 45, enquetesMax: 3 },
      verification: "un run démarre (204), puis une enquête ou un « rien de nouveau »", retour: "aucun : lancer une lecture ne change rien en production",
      escalade: "quota du jour épuisé : la ligne « À faire » le dit", appliquePar: "supabase/functions/_shared/autonomie.js (doitReveillerSentinelle)",
    }),
    proposition_retour: rb({
      libelle: "Proposer de retirer une mise en ligne qui casse", circuit: "A", autonome: true,
      symptome: "dans les 90 min d'une mise en ligne, un échec NOUVEAU chez ≥ 5 comptes de plus de 7 jours",
      action: "issue `humain` + notification + bouton « Remettre la version précédente » — la machine PROPOSE, elle ne retire rien",
      preconditions: ["jeton Netlify posé", "version et date de mise en ligne lisibles", "pas déjà proposée pour cette version"],
      limites: { comptesMin: 5, apresDeploiementMaxMin: 90, ancienneteMinJours: 7, recuperationH: 6 },
      verification: "le pilote voit la version servie et celle qui sera remise", retour: "fermer l'issue",
      escalade: "c'est déjà une escalade : un humain décide", appliquePar: "supabase/functions/_shared/autonomie.js (decideRetour)",
    }),
    purge_abonnements_morts: rb({
      libelle: "Oublier un abonnement push refusé pour toujours", circuit: "A", autonome: true,
      symptome: "le fournisseur répond 404 ou 410 à une notification", action: "supprimer CET abonnement (ligne push_subscriptions de son endpoint)",
      preconditions: ["refus permanent (404/410) — jamais un 429 ni un 5xx"], limites: { codes: "404,410" },
      verification: "les envois suivants ne le visent plus", retour: "l'appareil se réabonne à sa prochaine ouverture",
      escalade: "aucun appareil ne reçoit les alertes : ligne « À faire »", appliquePar: "supabase/functions/pilotage/index.ts (sonnerPilote)",
    }),
    relance_enquete: rb({
      libelle: "Relancer une enquête dont le run s'est perdu", circuit: "A", autonome: true, suspenduParPause: true,
      symptome: "enquête [SENTINELLE] sans PR ni run après 20 min", action: "retirer puis reposer le label `claude`, UNE fois ; après 6 h, label `humain`",
      preconditions: ["aucun run en attente d'un runner"], limites: { relancesMax: 1, attenteMin: 20, versHumainH: 6 },
      verification: "un run Claude démarre", retour: "aucun", escalade: "label `humain` après 6 h", appliquePar: ".github/workflows/sentinelle-autonome.yml (veilleur)",
    }),
    reprise_file_messages: rb({
      libelle: "Renvoyer un message resté en file, sans doublon ni changement d'auteur", circuit: "A", autonome: true,
      symptome: "message en file locale (hors ligne, panne transitoire)", action: "renvoi du MÊME identifiant ; 23505 sur la clé primaire prouvé + auteur relu = déjà envoyé",
      preconditions: ["l'entrée appartient au compte courant (AUTH-06)", "génération de file courante (ASTRA-43)", "pas déjà en vol (ROB-06)"],
      limites: { essaisMax: 10 }, verification: "statut « envoyé » seulement sur verdict de la base", retour: "le message reste à l'écran, renvoyable à la main",
      escalade: "plafond atteint : le message reste en échec, visible", appliquePar: "js/app-04-comments-shop.js (_sendTextToSupa, _flushOutbox)",
    }),
    rappels_activite: rb({
      libelle: "Rappeler une activité aux participants (J-1, H-2)", circuit: "A", autonome: true,
      symptome: "une activité commence dans 24 h ou 2 h", action: "un push par participant inscrit (going, maybe), une marque par rappel ; oubli d'un abonnement refusé pour toujours (404/410)",
      preconditions: ["clés VAPID posées", "marque posée AVANT l'envoi (idempotent)"], limites: { parTour: 300, codesOubli: "404,410" },
      verification: "la marque `rappel_activite` existe ; un second tour ne renvoie rien", retour: "aucun nécessaire : un rappel ne modifie aucune donnée de l'utilisateur",
      escalade: "panne : marque `rappels_echec` (analytics_events)", appliquePar: "supabase/functions/_shared/rappels.js (envoyerRappels)",
    }),
    essai_alertes: rb({
      libelle: "Essayer les alertes du pilote quand rien ne les a prouvées depuis 7 jours", circuit: "A", autonome: true,
      symptome: "aucune note d'envoi du pilote depuis 7 jours : rien ne prouve que le téléphone sonnerait",
      action: "UNE notification d'essai aux appareils du pilote, de jour (heure de Paris), notée comme une alerte (essai) et accusée par appareil",
      preconditions: ["aucune note `push_envoye` du pilote depuis 7 jours", "heure de Paris dans la fenêtre de jour"],
      limites: { intervalleJours: 7, heureDebut: 9, heureFin: 20 },
      verification: "la carte « Dernier essai » dit sur quels appareils il est arrivé", retour: "aucun nécessaire : une notification, aucune donnée modifiée",
      escalade: "essai sans accusé en 10 min : ligne « À faire » (alertes:reception)", appliquePar: "supabase/functions/pilotage/index.ts (essayerAlertes)",
    }),
    purge_battements: rb({
      libelle: "Effacer les battements de la veille de plus de 7 jours", circuit: "A", autonome: true,
      symptome: "battements accumulés dans analytics_events", action: "delete des SEULES lignes `pilotage_battement` de `systeme:pilotage` de plus de 7 jours",
      preconditions: ["filtre sur l'événement ET l'auteur système"], limites: { retentionJours: 7 },
      verification: "le dernier battement reste lisible", retour: "aucun nécessaire : ce sont des marques techniques", escalade: "aucune",
      appliquePar: "supabase/functions/pilotage/index.ts (battre)",
    }),
    // ── Circuit B : correctif logiciel borné ─────────────────────────────────
    correctif_sentinelle: rb({
      libelle: "Corriger un défaut détecté, tester, fusionner si tout est vert", circuit: "B", autonome: true, suspenduParPause: true,
      symptome: "enquête [SENTINELLE] ouverte par la chaîne (erreur JS, appel refusé, bouton mort, parcours en échec)",
      action: "Claude écrit le correctif dans une branche, la CI complète tourne, l'auto-fusion n'est armée que si le périmètre et la taille sont tenus",
      preconditions: ["label `sentinelle`, auteur OWNER/MEMBER, titre [SENTINELLE]", "fichiers dans le périmètre", "CI entièrement verte", "pas de récidive après 2 correctifs déployés"],
      limites: { fichiersMax: 2, lignesMax: 60, enquetesMax: 3, recidiveApres: 2 },
      perimetre: Object.freeze(["js/*.js", "styles.css", "index.html", "sw.js", "tests/e2e/*.spec.js", "docs/sentinelle/*.md"]),
      verification: "le job « retour-issue » commente « déployé » ou ROUVRE l'issue avec `humain`", retour: "rollback Netlify (geste humain) ; la PR suivante corrige",
      escalade: "périmètre ou taille dépassés : refus écrit sur l'issue, label `humain`", appliquePar: ".github/workflows/deploy.yml (Gouvernance critique, ASTRA-34)",
    }),
    // ── Circuit C : jamais autonome ───────────────────────────────────────────
    retour_arriere_automatique: rb({ libelle: "Retirer seule une mise en ligne", circuit: "C", autonome: false,
      raison: "le déclencheur est une télémétrie de navigateurs : quelques comptes pourraient faire retirer un correctif de sécurité (revues du 2026-10-12)", appliquePar: "supabase/functions/_shared/autonomie.js (modeRetour : jamais « automatique »)" }),
    coupure_automatique: rb({ libelle: "Éteindre seule une fonctionnalité chez tous", circuit: "C", autonome: false,
      raison: "même risque : la coupure se pose d'un toucher par le pilote, la veille la PROPOSE (ligne « À faire »)", appliquePar: "supabase/functions/pilotage/index.ts (poserReglage réservé au pilote)" }),
    migration_base: rb({ libelle: "Changer la structure de la base", circuit: "C", autonome: false,
      raison: "aucun filet automatique : canal ③ d'ADR-012 et contre-revue du mainteneur", appliquePar: "scripts/appliquer-migration.mjs (refuse la CI)" }),
    restauration_production: rb({ libelle: "Restaurer la production depuis une sauvegarde", circuit: "C", autonome: false,
      raison: "écraserait des écritures légitimes et réintroduirait des données effacées", appliquePar: "scripts/restaurer-donnees.js (geste humain)" }),
    decision_moderation: rb({ libelle: "Trancher un signalement", circuit: "C", autonome: false,
      raison: "le pré-tri MASQUE, il ne supprime jamais ; la décision reste humaine", appliquePar: "migrations/migration_moderation_pretri_2026-11-01.sql" }),
    modification_droits: rb({ libelle: "Modifier RLS, authentification, règle d'âge, secrets ou permissions", circuit: "C", autonome: false,
      raison: "frontière de sécurité : jamais élargie pour réparer", appliquePar: ".github/workflows/deploy.yml (périmètre critique : contre-revue obligatoire)" }),
    modification_politique: rb({ libelle: "Modifier cette politique ou ses garde-fous", circuit: "C", autonome: false,
      raison: "un agent ne s'accorde pas de droits : la politique change par PR, revue et CI", appliquePar: "tests/unit/politique-autonomie.test.mjs" }),
  }),
});

const LIMITE_OK = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0) || (typeof v === "string" && v.length > 0 && v.length <= 80);

/** Valide une politique. Rend la liste des erreurs (vide = valide). */
export function validerPolitique(p) {
  const e = [];
  if (!p || typeof p !== "object") return ["politique absente"];
  if (!Number.isInteger(p.version) || p.version < 1) e.push("version absente ou invalide");
  if (p.environnement !== "production") e.push("environnement inconnu");
  if (!MODES.includes(p.mode)) e.push(`mode inconnu « ${p.mode} »`);
  if (!p.observation || p.observation.inconnuEstSain !== false || p.observation.perimeEstSain !== false) e.push("observation : l'inconnu et le périmé ne sont jamais sains");
  if (!p.limites || typeof p.limites !== "object") e.push("limites absentes");
  else for (const [k, v] of Object.entries(p.limites)) if (!(typeof v === "number" && Number.isInteger(v) && v >= 0)) e.push(`limite ${k} invalide`);
  const rbs = p.runbooks;
  if (!rbs || typeof rbs !== "object" || !Object.keys(rbs).length) { e.push("catalogue de runbooks vide"); return e; }
  for (const [id, r] of Object.entries(rbs)) {
    const ou = `runbook ${id}`;
    if (!/^[a-z][a-z0-9_]{2,40}$/.test(id)) e.push(`${ou} : identifiant hors format`);
    if (!r || typeof r !== "object") { e.push(`${ou} : absent`); continue; }
    if (!Object.hasOwn(CIRCUITS, r.circuit)) e.push(`${ou} : circuit inconnu`);
    if (typeof r.autonome !== "boolean") e.push(`${ou} : autonome doit être vrai ou faux`);
    if (r.circuit === "C" && r.autonome !== false) e.push(`${ou} : un geste sensible (circuit C) n'est jamais autonome`);
    if (typeof r.libelle !== "string" || !r.libelle) e.push(`${ou} : libellé manquant`);
    if (typeof r.appliquePar !== "string" || !r.appliquePar) e.push(`${ou} : « appliquePar » manquant (qui l'impose ?)`);
    if (r.circuit === "C") { if (typeof r.raison !== "string" || !r.raison) e.push(`${ou} : la raison d'un refus permanent doit être écrite`); continue; }
    for (const ch of ["symptome", "action", "verification", "retour", "escalade"]) if (typeof r[ch] !== "string" || !r[ch]) e.push(`${ou} : champ « ${ch} » manquant`);
    if (!r.limites || typeof r.limites !== "object" || !Object.keys(r.limites).length) e.push(`${ou} : un geste autonome est borné (limites)`);
    else for (const [k, v] of Object.entries(r.limites)) if (!LIMITE_OK(v)) e.push(`${ou} : limite ${k} invalide`);
  }
  return e;
}

/**
 * Le geste `id` peut-il s'exécuter maintenant ? Échec FERMÉ. `contexte.pause` :
 * la pause de la Sentinelle est-elle posée ? Rend { ok, raison, circuit }.
 */
export function autoriser(p, id, contexte = {}) {
  if (validerPolitique(p).length) return { ok: false, raison: "politique_invalide", circuit: null };
  const r = Object.hasOwn(p.runbooks, id) ? p.runbooks[id] : null;
  if (!r) return { ok: false, raison: "hors_catalogue", circuit: null };
  if (!r.autonome) return { ok: false, raison: "sensible", circuit: r.circuit };
  if (p.mode !== "applique") return { ok: false, raison: "observation", circuit: r.circuit };
  if (contexte && contexte.pause && r.suspenduParPause) return { ok: false, raison: "pause", circuit: r.circuit };
  return { ok: true, raison: "autorise", circuit: r.circuit };
}

/** Ce que le téléphone affiche de la politique (aucun secret, aucune donnée). */
export function resumerPolitique(p = POLITIQUE) {
  const erreurs = validerPolitique(p);
  const rbs = p && p.runbooks ? Object.entries(p.runbooks) : [];
  const parCircuit = (c) => rbs.filter(([, r]) => r && r.circuit === c).map(([id, r]) => ({ id, libelle: r.libelle, autonome: !!r.autonome, suspenduParPause: !!r.suspenduParPause }));
  return {
    version: p && p.version, mode: p && p.mode, valide: !erreurs.length, erreurs: erreurs.slice(0, 5),
    autonomes: rbs.filter(([, r]) => r && r.autonome).length, sensibles: rbs.filter(([, r]) => r && r.circuit === "C").length,
    circuits: { A: parCircuit("A"), B: parCircuit("B"), C: parCircuit("C") }, pause: p && p.pause,
  };
}
