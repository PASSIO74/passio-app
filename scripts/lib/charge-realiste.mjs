// Fonctions pures du banc : aucun accès réseau, aucune lecture de secret.
export const STAGING_REF = "fcksxofaelcdmmifnwjo";
// La CI purge tous les @passio-e2e.test du staging au teardown, sans seuil
// d'âge. Le banc local ne participe pas à son verrou GitHub : domaine séparé.
export const DOMAINE_CAPACITE = "passio-capacite.test";
export function emailCapacite(campagne, index) {
  if (!/^capacite_\d{13}_[a-f0-9]{8}$/.test(campagne)
      || !Number.isInteger(index) || index < 0 || index >= 200) throw new Error("IDENTITE_CAPACITE_INVALIDE");
  return `${campagne}_${index}@${DOMAINE_CAPACITE}`;
}
export const LIMITES = Object.freeze({ octets: 180_000_000, octetsNettoyage: 20_000_000,
  messagesRealtime: 150_000, requetes: 20_000, dureeCampagneMs: 45 * 60_000 });
export const PROFIL_REALTIME = "likes-visibles10";
export const LIKES_VISIBLES = Object.freeze({ maximum: 3, fraicheurMs: 15000, jitterMs: 1500,
  initialJitterMs: 15000, minimumDepartMs: 200, plafondMs: 60000 });
// Cadences que le banc sait modéliser : `fixe` = le produit d'avant le
// 2026-09-21 (15–16,5 s entre débuts, quoi qu'il se passe) ; `adaptative` = le
// produit depuis (×1,5 par cycle sans changement, plafond 60 s, retour à 15 s
// sur changement, erreur ou carte jamais relue). La comparaison avant/après se
// fait en lançant les deux sur le même scénario.
export const CADENCES_COMPTEURS = Object.freeze(["fixe", "adaptative"]);
export const CADENCE_COMPTEURS = "adaptative";
// Copie ESM de `compteursProchainPas` (js/app-03) : un verrou compare les deux
// suites, parce que deux copies d'une même politique divergent sur celle
// qu'on oublie.
export function compteursProchainPas(pasActuel, vivant) {
  let pas = Number(pasActuel);
  if (!Number.isFinite(pas) || pas < LIKES_VISIBLES.fraicheurMs) pas = LIKES_VISIBLES.fraicheurMs;
  if (vivant) return LIKES_VISIBLES.fraicheurMs;
  return Math.min(LIKES_VISIBLES.plafondMs, Math.round(pas * 1.5));
}

export function optionsBanc(args) {
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (["--executer", "--plan", "--prevol"].includes(name)) values[name] = true;
    else if (["--projet", "--paliers", "--duree", "--graine", "--sortie", "--scenario", "--pages", "--profil-realtime", "--compteurs-cadence"].includes(name)) {
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("VALEUR_MANQUANTE");
      values[name] = args[++i];
    } else throw new Error("OPTION_INCONNUE");
  }
  if (values["--projet"] !== STAGING_REF) throw new Error("CIBLE_HORS_STAGING_AUTORISE");
  if (values["--plan"] && values["--executer"]) throw new Error("MODES_INCOMPATIBLES");
  const paliers = (values["--paliers"] || "25,50,100,200").split(",").map(Number);
  if (!paliers.length || paliers.some((n, i) => ![25, 50, 100, 200].includes(n) || (i && n <= paliers[i - 1]))) throw new Error("PALIERS_INVALIDES");
  const duree = Number(values["--duree"] || 90);
  // Vingt secondes restent disponibles pour terminer les parcours déjà
  // engagés avant la coupure absolue des requêtes à trois minutes.
  if (!Number.isInteger(duree) || duree < 30 || duree > 160) throw new Error("DUREE_HORS_30_160");
  const graine = Number(values["--graine"] || 20260920);
  if (!Number.isSafeInteger(graine) || graine < 0) throw new Error("GRAINE_INVALIDE");
  const scenario = values["--scenario"] || "complet";
  if (!["lecture", "complet"].includes(scenario)) throw new Error("SCENARIO_INVALIDE");
  const pagesTexte = values["--pages"] || "60,20";
  if (!["20", "60,20"].includes(pagesTexte)) throw new Error("PAGES_INVALIDES");
  const profilRealtime = values["--profil-realtime"] || PROFIL_REALTIME;
  if (![PROFIL_REALTIME, "legacy12"].includes(profilRealtime)) throw new Error("PROFIL_REALTIME_INVALIDE");
  if (values["--executer"] && profilRealtime === "legacy12") throw new Error("LEGACY12_HORS_LIGNE_SEULEMENT");
  if (values["--executer"] && !values["--sortie"]) throw new Error("SORTIE_REQUISE");
  const compteursCadence = values["--compteurs-cadence"] || CADENCE_COMPTEURS;
  if (!CADENCES_COMPTEURS.includes(compteursCadence)) throw new Error("CADENCE_COMPTEURS_INVALIDE");
  return { projet: STAGING_REF, paliers, duree, graine, pages: pagesTexte.split(",").map(Number),
    executer: !!values["--executer"], sortie: values["--sortie"] || null, scenario, profilRealtime, compteursCadence,
    prevolSeulement: !!values["--prevol"],
    comptesDistincts: values["--prevol"] ? 2 : Math.max(...paliers), limites: LIMITES };
}

export function abonnements(uid, profil = PROFIL_REALTIME) {
  if (![PROFIL_REALTIME, "legacy12"].includes(profil)) throw new Error("PROFIL_REALTIME_INVALIDE");
  // Même tableau littéral que le chemin Realtime V3 de l'app. Le canal privé
  // user:<uuid> s'ajoute sur la même socket ; conv_messages n'est pas écoutée
  // en postgres_changes lorsque V3 est actif.
  const postgres_changes = [
    { event: "*", schema: "public", table: "conv_reads" },
    { event: "INSERT", schema: "public", table: "comment_interactions" },
    { event: "DELETE", schema: "public", table: "comment_interactions" },
    { event: "INSERT", schema: "public", table: "conv_members", filter: "user_id=eq." + uid },
    { event: "UPDATE", schema: "public", table: "profiles" },
    { event: "INSERT", schema: "public", table: "posts" },
    { event: "INSERT", schema: "public", table: "post_likes" },
    { event: "DELETE", schema: "public", table: "post_likes" },
    { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + uid },
    { event: "INSERT", schema: "public", table: "post_comments" },
    { event: "INSERT", schema: "public", table: "event_comments" },
    { event: "*", schema: "public", table: "video_lives" },
  ];
  return profil === "legacy12" ? postgres_changes : postgres_changes.filter(a => a.table !== "post_likes");
}

export function compteurHead(status, contentRange) {
  if (![200, 206].includes(status)) throw new Error(`HTTP_${status}`);
  const match = typeof contentRange === "string" && /^(?:\*|\d+-\d+)\/(\d+)$/.exec(contentRange);
  if (!match || !Number.isSafeInteger(Number(match[1]))) throw new Error("HEAD_COMPTE_INVALIDE");
  return Number(match[1]);
}

export const pauseCompteurs = (graine, utilisateur, tour) => LIKES_VISIBLES.fraicheurMs
  + entierDeterministe(graine, utilisateur, tour + 40000) % LIKES_VISIBLES.jitterMs;
// Même jitter déterministe que la cadence fixe, appliqué au pas courant.
export const pauseCompteursAdaptative = (graine, utilisateur, tour, pas) => pas
  + entierDeterministe(graine, utilisateur, tour + 40000) % LIKES_VISIBLES.jitterMs;
export const decalageInitialCompteurs = (graine, utilisateur) => Math.max(LIKES_VISIBLES.minimumDepartMs,
  entierDeterministe(graine, utilisateur, 50000) % LIKES_VISIBLES.initialJitterMs);

export function familleFrameRealtime(m) {
  if (m.event === "postgres_changes") {
    const d = m.payload?.data || {};
    const table = /^[a-z_]{1,63}$/.test(d.table || "") ? d.table : "inconnue";
    const operation = ["INSERT", "UPDATE", "DELETE"].includes(d.type) ? d.type : "autre";
    return `postgres_changes:${table}:${operation}`;
  }
  if (m.event === "broadcast") return `broadcast:${["INSERT", "UPDATE", "DELETE"].includes(m.payload?.event) ? m.payload.event : "autre"}`;
  return `protocole:${["phx_reply", "phx_close", "phx_error", "system", "presence_state", "presence_diff"].includes(m.event) ? m.event : "autre"}`;
}

export function entierDeterministe(graine, utilisateur, tour) {
  let x = (graine ^ Math.imul(utilisateur + 1, 2654435761) ^ Math.imul(tour + 1, 1597334677)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 2246822507); x ^= x >>> 13;
  return x >>> 0;
}

export function actionPrevue(utilisateur, tour, scenario = "complet") {
  const phase = (utilisateur * 7 + tour) % 12;
  if (scenario === "lecture") return ["fil", "notifications", "evenements", "fil", "profil", "fil", "fil", "profil", "fil", "evenements", "fil", "profil"][phase];
  if (phase === 4 && utilisateur % 5 === 0) return "message";
  if (phase === 5 && utilisateur % 4 === 0) return "aimer";
  if (phase === 7 && utilisateur % 5 === 0) return "historique";
  if (phase === 8 && utilisateur % 10 === 0) return "publier";
  return ["fil", "notifications", "evenements", "fil", "profil", "fil", "fil", "profil", "fil", "evenements", "fil", "profil"][phase];
}
export const pausePrevue = (graine, utilisateur, tour) => 5000 + entierDeterministe(graine, utilisateur, tour) % 5001;
export const decalageInitial = (graine, utilisateur) => entierDeterministe(graine, utilisateur, 99999) % 5001;

export function postPourLike(posts, index, tour, nombreComptes) {
  let position = (index + tour) % posts.length;
  if ((position + 1) % nombreComptes === index) position = (position + 1) % posts.length;
  return posts[position].id;
}
export async function aimerEtRetirer(cle, journal, inserer, retirer) {
  const key = `${cle.post_id}:${cle.user_id}`;
  journal.set(key, cle); // Avant POST : sa réponse peut être perdue.
  await inserer(cle);
  await retirer(cle);
  journal.delete(key); // Seulement après confirmation de la suppression.
}

// Préparation <=20 lignes/s. Pour une table écoutée : prévoir jusqu'à deux
// générations encore présentes côté serveur et viser <=80 livraisons/s.
// C'est une marge de banc, pas une preuve que le serveur a purgé ses sockets.
export function delaiFixture(table, methode, connexions) {
  const events = methode === "DELETE" ? ["DELETE"] : ["INSERT", "UPDATE"];
  // Conserver la marge legacy au nettoyage : d'autres clients encore ouverts
  // peuvent écouter les likes, même si cette campagne ne les écoute plus.
  const observe = abonnements("fixture", "legacy12").some(a => a.table === table && (a.event === "*" || events.includes(a.event)));
  return Math.max(50, observe ? Math.ceil(2 * connexions * 1000 / 80) : 0);
}

export class DisponibiliteRealtime {
  constructor(uid, profil = PROFIL_REALTIME) {
    this.uid = uid; this.attendus = abonnements(uid, profil); this.db = false; this.user = false; this.cdc = false;
    this.erreur = null; this.handlers = 0; this.systemes = { ok: 0, error: 0, autres: 0 };
  }
  get pret() { return !this.erreur && this.db && this.user && this.cdc; }
  observer(m) {
    const topicDB = "realtime:realtime:db", topicUser = `realtime:user:${this.uid}`;
    if (m.event === "phx_reply" && ((String(m.ref) === "1" && m.topic === topicDB) || (String(m.ref) === "2" && m.topic === topicUser))) {
      if (m.payload?.status !== "ok") this.erreur ||= "REALTIME_JOIN_REFUSE";
      else if (String(m.ref) === "1") {
        const bindings = m.payload.response?.postgres_changes;
        const key = a => JSON.stringify([a.event, a.schema, a.table, a.filter || ""]);
        const attendus = new Set(this.attendus.map(key));
        if (!Array.isArray(bindings) || bindings.length !== attendus.size || new Set(bindings.map(key)).size !== attendus.size
            || bindings.some(b => b.id == null || !attendus.has(key(b)))) this.erreur ||= "REALTIME_HANDLERS_NON_CONFIRMES";
        else { this.db = true; this.handlers = bindings.length; }
      } else this.user = true;
    }
    if (m.event === "system" && m.topic === topicDB && m.payload?.extension === "postgres_changes") {
      const status = m.payload.status;
      this.systemes[status === "ok" || status === "error" ? status : "autres"]++;
      if (status === "ok") this.cdc = true;
      else { this.cdc = false; this.erreur ||= "REALTIME_CDC_ERREUR"; }
    }
    return this.pret;
  }
  expirer() {
    this.erreur ||= this.db && this.user ? "REALTIME_CDC_NON_PRET" : "REALTIME_JOIN_TIMEOUT";
    return this.erreur;
  }
}

export function partenaire(index, taille) {
  if (!Number.isInteger(index) || index < 0 || index >= taille || taille < 2) throw new Error("PARTENAIRE_INVALIDE");
  return taille % 2 && index === taille - 1 ? 0 : index ^ 1;
}
export const clePaire = (a, b) => [a, b].sort((x, y) => x - y).join("_");

export function comptesPourPalier(comptes, nombre) {
  const selection = comptes.slice(0, nombre);
  if (selection.length !== nombre || new Set(selection.map(c => c.id)).size !== nombre) throw new Error("COMPTES_NON_DISTINCTS");
  return selection;
}

export class Budget {
  constructor(limites = LIMITES, maintenant = Date.now) {
    this.limites = limites; this.maintenant = maintenant; this.debut = maintenant();
    this.octets = 0; this.messagesRealtime = 0; this.requetes = 0; this.motif = null;
  }
  verifier() {
    if (!this.motif && this.maintenant() - this.debut >= this.limites.dureeCampagneMs) this.motif = "BUDGET_DUREE";
    if (this.motif) throw new Error(this.motif);
  }
  compter({ octets = 0, messagesRealtime = 0, requetes = 0 } = {}) {
    this.octets += octets; this.messagesRealtime += messagesRealtime; this.requetes += requetes;
    if (this.octets >= this.limites.octets) this.motif ||= "BUDGET_OCTETS";
    if (this.messagesRealtime >= this.limites.messagesRealtime) this.motif ||= "BUDGET_REALTIME";
    if (this.requetes >= this.limites.requetes) this.motif ||= "BUDGET_REQUETES";
    this.verifier();
  }
  resume() { return { octets: this.octets, messagesRealtime: this.messagesRealtime, requetes: this.requetes, motif: this.motif }; }
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? Math.round(sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]) : null;
}
export function statistiques(mesures) {
  const succes = mesures.filter(m => m.ok), erreurs = mesures.length - succes.length;
  const motifs = {};
  for (const m of mesures) if (!m.ok) motifs[m.motif] = (motifs[m.motif] || 0) + 1;
  return { tentatives: mesures.length, succes: succes.length, erreurs,
    tauxErreur: mesures.length ? erreurs / mesures.length : null,
    p50Ms: percentile(mesures.map(m => m.ms), .5), p95Ms: percentile(mesures.map(m => m.ms), .95),
    p95SuccesMs: percentile(succes.map(m => m.ms), .95),
    octets: mesures.reduce((s, m) => s + (m.octets || 0), 0), motifs };
}

export function verdictPalier({ http, parcours, realtime, messages, posts, connectes, attendus, termine, fatal, scenario = "complet" }) {
  const motifs = [];
  if (fatal) motifs.push(fatal);
  if (!termine) motifs.push("PALIER_INCOMPLET");
  if (connectes !== attendus) motifs.push("CONNEXIONS_INCOMPLETES");
  if (!http.tentatives || http.tauxErreur > .01) motifs.push("ERREURS_HTTP_SUP_1_PCT");
  if (http.p95Ms > 1000) motifs.push("P95_HTTP_SUP_1000_MS");
  if (!parcours.tentatives || parcours.tauxErreur > .01) motifs.push("ERREURS_PARCOURS_SUP_1_PCT");
  if (parcours.p95Ms > 1000) motifs.push("P95_PARCOURS_SUP_1000_MS");
  if (scenario === "complet" && (!realtime.tentatives || realtime.erreurs > 0)) motifs.push("REALTIME_NON_VALIDE");
  if (scenario === "complet" && (!messages?.tentatives || messages.erreurs > 0)) motifs.push("MESSAGERIE_SOUS_CHARGE_NON_VALIDEE");
  if (scenario === "complet" && messages?.p95Ms > 2000) motifs.push("P95_MESSAGES_SUP_2000_MS");
  if (scenario === "complet" && posts && (!posts.tentatives || posts.erreurs > 0)) motifs.push("PUBLICATIONS_SOUS_CHARGE_NON_VALIDEES");
  if (posts?.p95Ms > 2000) motifs.push("P95_PUBLICATIONS_SUP_2000_MS");
  if (realtime.p95Ms > 2000) motifs.push("P95_REALTIME_SUP_2000_MS");
  return { ok: motifs.length === 0, motifs };
}

// Une veille peut retarder aussi bien les requêtes que leurs timeouts. Le
// résultat ne devient pas une mesure de 90 s parce que tout finit par répondre.
// Garder les deux horloges : selon l'OS, la monotone peut ignorer la suspension.
export const MARGE_FIN_MESURE_MS = 15000;
export function verifierDureeMesure({ dureeAttendueMs, dureeMs, dureeMuraleMs }) {
  const maximaleMs = dureeAttendueMs + MARGE_FIN_MESURE_MS;
  const ok = Number.isFinite(dureeAttendueMs) && dureeAttendueMs > 0
    && Number.isFinite(dureeMs) && Number.isFinite(dureeMuraleMs)
    && dureeMs >= dureeAttendueMs && dureeMs <= maximaleMs
    // Date.now est entier, performance.now est arrondi : tolérer 1 ms de quantification.
    && dureeMuraleMs >= dureeAttendueMs - 1 && dureeMuraleMs <= maximaleMs;
  return { ok, motif: ok ? null : "DUREE_MESURE_INVALIDE", attendueMs: dureeAttendueMs,
    maximaleMs, monotoneMs: dureeMs, muraleMs: dureeMuraleMs, margeFinMs: MARGE_FIN_MESURE_MS };
}

export function verdictAvecCompteurs(principal, httpCompteurs, parcoursCompteurs) {
  const verdict = verdictPalier(principal);
  verdict.validiteMesure = verifierDureeMesure(principal);
  if (!verdict.validiteMesure.ok) verdict.motifs.push(verdict.validiteMesure.motif);
  if (!httpCompteurs.tentatives || !parcoursCompteurs.tentatives) verdict.motifs.push("COMPTEURS_VISIBLES_NON_EXERCES");
  if (httpCompteurs.tauxErreur > .01 || parcoursCompteurs.tauxErreur > .01) verdict.motifs.push("ERREURS_COMPTEURS_SUP_1_PCT");
  if (httpCompteurs.p95Ms > 1000 || parcoursCompteurs.p95Ms > 1000) verdict.motifs.push("P95_COMPTEURS_SUP_1000_MS");
  verdict.ok = verdict.motifs.length === 0;
  return verdict;
}

// Une sonde est armée AVANT l'écriture ; les messages reçus pour d'autres
// comptes sont comptés ailleurs sans stockage d'une collection sans borne.
export class Sondes {
  constructor({ delai = 10000, maintenant = () => performance.now() } = {}) {
    this.delai = delai; this.maintenant = maintenant; this.attentes = new Map();
  }
  armer(cle) {
    if (this.attentes.has(cle)) throw new Error("SONDE_DUPLIQUEE");
    const debut = this.maintenant();
    let terminer;
    const promise = new Promise(resolve => { terminer = (ok, motif) => {
      const attente = this.attentes.get(cle);
      if (!attente) return;
      clearTimeout(attente.timer); this.attentes.delete(cle);
      resolve({ ok, motif, ms: this.maintenant() - debut });
    }; });
    const timer = setTimeout(() => terminer(false, "REALTIME_TIMEOUT"), this.delai);
    this.attentes.set(cle, { terminer, timer });
    return { promise, annuler: () => terminer(false, "ECRITURE_ECHOUEE") };
  }
  recevoir(cle) { this.attentes.get(cle)?.terminer(true, null); }
  fermer() { for (const attente of [...this.attentes.values()]) attente.terminer(false, "REALTIME_FERME"); }
}
