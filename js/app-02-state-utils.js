// Icône de partage UNIFIÉE (« share » à nœuds reliés) — utilisée partout :
// posts, bobines, lives, profils, événements. Remplace l'ancien mélange
// 📤 / 🔁 / 🔗 / boîte+flèche. Hérite de la couleur via currentColor.
function shareIconSvg(size) {
  var s = size || 18;
  return '<svg class="share-ico" viewBox="0 0 24 24" width="' + escapeHtml(s) + '" height="' + escapeHtml(s) + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>'
    + '<line x1="8.6" y1="10.7" x2="15.4" y2="6.3"/><line x1="8.6" y1="13.3" x2="15.4" y2="17.7"/></svg>';
}

function defaultState() {
  const seed = buildSeed();

  // ✅ Enrichir les posts SEED avec le vrai nom de l'auteur
  const userMap = {};
  seed.users.forEach(u => { userMap[u.id] = u.name; });
  seed.posts.forEach(p => {
    if (!p.authorName && userMap[p.authorId]) {
      p.authorName = userMap[p.authorId];
    }
  });

  // Ajouter les bobines avec commentaires d'exemple
  const seedReels = getSeedReelPostsWithComments(seed.users);
  seed.posts = [...seed.posts, ...seedReels];

  return {
    onboarded: false,
    landingSeen: false,
    tourSeen: false,
    user: {
      name: "",
      birthYear: null,
      isMinor: false,
      currentProfileId: null,
      profiles: [],
      drafts: [],
      likedPosts: [],
      joinedEvents: [],
      seenStories: [],
      customPassions: [],
      following: [],
      savedCarnets: [],
      blocked: [],             // ids des utilisateurs bloqués (modération)
      seenNotifIds: [],        // mémoire locale des notifs déjà vues (anti-réapparition)
      // Lot UI-5 (§7) : « Ça m'intrigue » sur une bobine. Map passion → horodatage.
      // ⚠️ Le signal porte sur la PASSION, jamais sur la seule bobine : c'est la
      // seule granularité que les moteurs existants savent déjà consommer
      // (feedPostScore par _myPassionSet, irlPassionFilters par renderIRL,
      // openPassionExplorer). Un signal par publication ne servirait qu'une fois.
      // ⚠️ Borné à PASSION_SIGNALS_MAX : le blob `user_state` part EN ENTIER à
      // chaque synchronisation, un journal non borné dégraderait tout le compte.
      // 100 % LOCAL : aucune table, aucune policy, aucune écriture réseau — ce
      // que la direction autorise explicitement (« simple, locale et explicable »).
      passionSignals: {},
      general: {},
    },
    seed,                    // fake accounts / posts / events / stories / notifs (SEED DE DÉMO SEULEMENT)
    supabasePosts: [],       // ✅ POSTS VRAIS UTILISATEURS chargés depuis Supabase
    userPosts: [],           // posts published by the user
    userEvents: [],          // events created by the user
    notifications: [],       // user-specific notifications (seed copied at init)
    // Publications supprimées par l'utilisateur (ids). Persistée ET synchronisée
    // (elle voyage dans le blob `user_state`) : sans elle, une page serveur, un
    // événement temps réel ou un blob périmé faisaient RÉAPPARAÎTRE le contenu
    // supprimé. Voir le bloc « SUPPRESSIONS DURABLES ». Bornée à
    // POSTS_SUPPRIMES_MAX, fusionnée en UNION, jamais remplacée.
    deletedPostIds: [],
    currentMood: "all",
    // ── SÉLECTIONS DU FIL (refonte multi-passion) ──────────────────────────
    // Trois familles de critères, toutes ADDITIVES entre elles (OU inclusif) :
    // « Suivis », les passions, les envies du moment. Voir `feedSourcesSelected`.
    feedFollowingOn: true,    // « Suivis » est-il coché ? (remplace state.feedView)
    feedView: "accueil",      // LEGACY, lu une fois pour migrer vers feedFollowingOn
    selectedFeedPassions: [], // passion IDs actifs dans le fil
    feedIntents: [],          // envies du moment cochées (discover|learn|create|meet)
    feedMoodsTouched: false,  // l'utilisateur a-t-il déjà réglé le filtre mood lui-même ?
    feedInterestsMigrated: false, // le compte vit-il dans le modèle selectedFeedPassions ?
    hintsVus: {},             // aides contextuelles déjà montrées (spec §8)
  };
}

// ════════════════════════════════════════════════════════════════════════
// ADR-009 — ÉCONOMIE INTERNE RETIRÉE : normaliseur d'état legacy
// ════════════════════════════════════════════════════════════════════════
// Un état écrit par un client d'avant le retrait (localStorage OU blob
// `user_state` synchronisé depuis un autre appareil) contient encore
// `user.score`, `user.passia`, `user.likesReceived`, `user.activePass`,
// `transactions` et `quests`. Rien ne doit lever à la lecture, et rien ne doit
// réapparaître à l'écran.
//
// ⚠️ Ce normaliseur est appelé aux TROIS frontières, pas seulement au
// chargement local : sans la frontière d'hydratation, un ancien appareil encore
// en service repousserait les clés à chaque synchronisation et le nouveau client
// les réécrirait en boucle dans son propre blob (« last write wins » joue dans
// les deux sens). Sans la frontière d'envoi, ce client propagerait à son tour
// les clés qu'il vient de lire.
const LEGACY_ECONOMY_USER_KEYS = ["score", "passia", "likesReceived", "activePass"];
const LEGACY_ECONOMY_ROOT_KEYS = ["transactions", "quests"];

// ⚠️ Les NOTIFICATIONS déjà stockées promettaient encore des points. Le contenu
// de démonstration est COPIÉ dans l'état à la première ouverture
// (`parsed.notifications = def.seed.notifications.map(…)`) puis persisté : ADR-009
// a bien réécrit la graine, mais un compte ouvert AVANT le retrait garde sa copie
// pour toujours. Deux textes concernés, mesurés dans la graine d'avant :
//   n5  « Nouvelle quête du jour : publie ton premier post 🎨 +15 pts »  (kind "quest")
//   n6  « Bienvenue sur PASSIO 🎉 Tu as gagné 10 💎 Passia de bienvenue. »
// Ils voyagent aussi par le blob `user_state` (`_leanState` recopie
// `notifications`), d'où le passage par `stripLegacyEconomy`, appelé aux TROIS
// frontières — sans quoi un ancien appareil les repousserait à chaque sync.
// ⚠️ DEUX bornes, parce qu'un filtre par texte se trompe vite.
// ① Il ne s'applique qu'aux notifications ÉCRITES PAR L'APP (`fromId` absent ou
//    "me"). Une notification qui rapporte le contenu d'un AUTRE compte le CITE :
//    le post d'actualité du contenu de démonstration contient « +4 pts » (une
//    hausse de participation électorale) et un commentaire peut contenir « 💎 ».
// ② Le motif ne retient que des tournures que l'app seule produisait. Le « 💎 »
//    nu en est EXCLU délibérément : `pushNotification` interpole des titres
//    d'activité et des destinations de carnet, où l'emoji est parfaitement
//    légitime — « 🤝 Tu rejoins <b>Atelier 💎</b> » aurait disparu.
const LEGACY_ECONOMY_NOTIF_RE = /\+\s*\d+\s*pts\b|\bPassia\b|^\s*🎉 Nouveau rang\b/i;
const LEGACY_ECONOMY_NOTIF_KINDS = ["quest", "reward", "rank"];

function _estNotifEconomieLegacy(n) {
  if (!n || typeof n !== "object") return false;
  if (LEGACY_ECONOMY_NOTIF_KINDS.indexOf(n.kind) > -1) return true;
  var ecriteParLApp = !n.fromId || n.fromId === "me";
  return ecriteParLApp && LEGACY_ECONOMY_NOTIF_RE.test(String(n.text || ""));
}

function stripLegacyEconomy(obj) {
  if (!obj || typeof obj !== "object") return obj;
  LEGACY_ECONOMY_ROOT_KEYS.forEach(function (k) { delete obj[k]; });
  if (Array.isArray(obj.notifications)) {
    // Réaffectation (et non splice) : sur la copie d'ENVOI, `notifications` est
    // encore le tableau vivant de l'application — le filtrer en place ferait de
    // cette fonction de lecture un effet de bord sur l'état affiché.
    var gardees = obj.notifications.filter(function (n) { return !_estNotifEconomieLegacy(n); });
    if (gardees.length !== obj.notifications.length) obj.notifications = gardees;
  }
  if (obj.user && typeof obj.user === "object") {
    LEGACY_ECONOMY_USER_KEYS.forEach(function (k) { delete obj.user[k]; });
    if (Array.isArray(obj.user.profiles)) {
      // `paid` marquait un profil débloqué contre 150 💎 : la notion n'existe plus.
      obj.user.profiles.forEach(function (p) { if (p && typeof p === "object") delete p.paid; });
    }
  }
  return obj;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return defaultState();
    const parsed = stripLegacyEconomy(JSON.parse(raw));
    // Always refresh seed (in case we update it between versions)
    const def = defaultState();
    parsed.seed = def.seed;
    // Migrate for upgraded schema
    if (!parsed.user.seenStories) parsed.user.seenStories = [];
    if (!Array.isArray(parsed.notifications) || !parsed.notifications.length) {
      parsed.notifications = def.seed.notifications.map(n => ({ ...n }));
    }
    if (typeof parsed.landingSeen === "undefined") parsed.landingSeen = false;
    if (!Array.isArray(parsed.user.customPassions)) parsed.user.customPassions = [];
    if (!Array.isArray(parsed.user.following)) parsed.user.following = [];
    if (!Array.isArray(parsed.user.seenNotifIds)) parsed.user.seenNotifIds = [];
    if (!parsed.user.passionSignals || typeof parsed.user.passionSignals !== "object"
        || Array.isArray(parsed.user.passionSignals)) parsed.user.passionSignals = {};
    // Journal des changements de passion (quota, 2026-09-02). Normalisé ICI en
    // plus de `journalPassions()` (app-06) : un état antérieur au lot, un blob
    // `user_state` tronqué ou un tableau là où on attend un objet sont des
    // entrées NORMALES. Un objet vide vaut « aucun changement consommé » — un
    // compte existant ne se voit donc pas facturer un quota rétroactif.
    if (!parsed.user.passionChanges || typeof parsed.user.passionChanges !== "object"
        || Array.isArray(parsed.user.passionChanges)) parsed.user.passionChanges = { entries: [] };
    if (!Array.isArray(parsed.user.passionChanges.entries)) parsed.user.passionChanges.entries = [];
    if (!Array.isArray(parsed.selectedFeedPassions)) parsed.selectedFeedPassions = [];
    // Vue du Fil (ADR-010). Toute valeur inconnue — et tout état antérieur, qui
    // n'a pas cette clé — retombe sur « accueil » : c'est la vue par défaut, et
    // celle qui montre le plus de contenu. Elle remplace l'ancienne bascule
    // `_showFollowingFeed`, qui n'était persistée nulle part et repartait donc à
    // `false` à chaque ouverture : suivre quelqu'un n'avait aucun effet durable.
    if (parsed.feedView !== "accueil" && parsed.feedView !== "suivis") parsed.feedView = "accueil";
    // ⚠️ MIGRATION de la vue exclusive vers la sélection additive.
    // Les deux anciennes vues incluaient les comptes suivis — « Accueil » comme
    // union, « Suivis » comme seule source. Les deux se migrent donc en
    // « Suivis coché », et c'est ce qui préserve l'acquis d'ADR-010 : suivre
    // quelqu'un garde un effet observable et durable, sans bascule à réarmer.
    // Ce qui change : les passions ne sont plus éteintes par « Suivis ».
    if (typeof parsed.feedFollowingOn !== "boolean") parsed.feedFollowingOn = true;
    if (!Array.isArray(parsed.feedIntents)) parsed.feedIntents = [];
    parsed.feedIntents = parsed.feedIntents.filter(function (i) {
      return FEED_INTENT_SOURCES.indexOf(i) > -1;
    });
    if (typeof parsed.feedMoodsTouched !== "boolean") parsed.feedMoodsTouched = false;
    if (typeof parsed.feedInterestsMigrated !== "boolean") parsed.feedInterestsMigrated = false;
    if (!parsed.hintsVus || typeof parsed.hintsVus !== "object") parsed.hintsVus = {};
    // ✅ SÉCURITÉ: Initialiser supabasePosts s'il n'existe pas
    if (!Array.isArray(parsed.supabasePosts)) parsed.supabasePosts = [];
    // Même garde pour userPosts, qui manquait à cette liste : renderMainProfile
    // lit `state.userPosts.length` SANS garde, et l'écran Profil entier explose
    // sur un état qui aurait perdu cette clé. Rencontré le 2026-08-23 sur un état
    // de test partiel ; un état réel la porte toujours, mais rien ne le garantit.
    if (!Array.isArray(parsed.userPosts)) parsed.userPosts = [];
    // Suppressions déjà faites : même garde. Un état ancien n'a pas la clé, et
    // `postsSupprimes()` la recrée — mais la poser ici évite qu'un chemin de
    // lecture pure (rendu) ait à muter l'état pour exister.
    if (!Array.isArray(parsed.deletedPostIds)) parsed.deletedPostIds = [];
    // Dédup inconditionnelle des profils-passion par passion (clé métier).
    // Nettoie tout état corrompu accumulé avant le fix, quel que soit le chemin
    // de sync (merge ou non). Un utilisateur ne peut avoir qu'un profil par passion.
    if (Array.isArray(parsed.user && parsed.user.profiles)) {
      const seenP = new Set();
      parsed.user.profiles = parsed.user.profiles.filter(function(p) {
        if (!p || !p.passion || seenP.has(p.passion)) return false;
        seenP.add(p.passion);
        // Répare les photoUrl corrompues par l'ancien bug supaUploadMedia
        // (la chaîne "photo" au lieu d'une URL) : seul http(s) est valide.
        if (p.photoUrl && String(p.photoUrl).indexOf("http") !== 0) p.photoUrl = null;
        return true;
      });
    }
    return parsed;
  } catch (e) {
    return defaultState();
  }
}

// Construit une copie « allégée » de l'état : sans le seed (reconstruit au load)
// ni le base64 média (les médias vivent dans Supabase Storage, on ne garde que
// les URLs). Partagé par la sauvegarde locale ET la sync cross-appareil.
function _leanState() {
  const lean = { ...state };
  lean.seed = null; // rebuilt at load
  const stripData = (v) => (typeof v === "string" && v.indexOf("data:") === 0) ? null : v;
  if (Array.isArray(lean.userPosts)) {
    lean.userPosts = lean.userPosts.map((p) => {
      const c = { ...p, image: stripData(p.image), video: stripData(p.video), audio: stripData(p.audio), cover: stripData(p.cover) };
      if (Array.isArray(p.steps)) {
        c.steps = p.steps.map((s) => ({ ...s, photo: stripData(s.photo), video: stripData(s.video), audio: stripData(s.audio) }));
      }
      return c;
    });
  }
  return lean;
}

let _saveStateTimer = null;
function _writeStateNow() {
  _saveStateTimer = null;
  try {
    // ⚠️ Ne JAMAIS persister de base64 média dans localStorage (quota ~5 Mo).
    localStorage.setItem(STATE_KEY, JSON.stringify(_leanState()));
  } catch (e) {
    console.warn("Save failed:", e);
  }
}

// Débouncé (250 ms) : saveState() est appelé en rafale (~80 sites — like, réaction,
// navigation…) et chaque appel refaisait un JSON.stringify SYNCHRONE de tout l'état
// → jank sur mobile. Le flush est garanti par pagehide/beforeunload (saveStateNow),
// qui couvrent aussi tous les location.reload().
// Verrou de déconnexion. Entre la purge et le location.reload() il s'écoule 1,2 s
// pendant lesquelles l'application TOURNE ENCORE avec l'état du compte sortant en
// mémoire : n'importe quel saveState(), n'importe quel flush pagehide, réécrivait
// ce que la purge venait d'effacer. discardPendingStateSave() ne désamorçait que le
// timer déjà armé — il ne pouvait rien contre une NOUVELLE écriture, ni contre le
// beacon d'état ajouté depuis. Une fois ce verrou posé, plus rien ne s'écrit.
let _accountPurged = false;

function saveState() {
  if (_accountPurged) return;
  clearTimeout(_saveStateTimer);
  _saveStateTimer = setTimeout(_writeStateNow, 250);
  // Réplique l'état personnel vers Supabase (debounced) → retrouvable sur tout
  // appareil. Ignoré pendant l'hydratation (évite la boucle) et hors session.
  try { if (!window._hydratingState) _scheduleStateSync(); } catch (e) {}
}

// Sauvegarde immédiate (fermeture/rechargement de page, actions critiques).
function saveStateNow() {
  if (_accountPurged) return;
  clearTimeout(_saveStateTimer);
  _writeStateNow();
  try { if (!window._hydratingState) _scheduleStateSync(); } catch (e) {}
}
window.addEventListener("pagehide", function () { if (!_accountPurged && _saveStateTimer) _writeStateNow(); });
window.addEventListener("beforeunload", function () { if (!_accountPurged && _saveStateTimer) _writeStateNow(); });

// ⚠️ À appeler AVANT tout removeItem(STATE_KEY) volontaire (logout, reset,
// suppression de compte) : sinon le flush pagehide/beforeunload ressusciterait
// l'état qu'on vient d'effacer au moment du location.reload().
function discardPendingStateSave() {
  clearTimeout(_saveStateTimer);
  _saveStateTimer = null;
}

// ════════════════════════════════════════════════════════════════════════
// SYNCHRONISATION CROSS-APPAREIL — état personnel du compte (table user_state)
// Personas, carnets, passions custom, réglages, brouillons, listes (suivis,
// likés, bloqués, events rejoints…) : tout ce qui n'est PAS déjà dans une table
// partagée (posts/stories/events/messages/notifs). Un blob JSON par compte,
// RLS owner-only. « Last write wins » via updated_at.
// ════════════════════════════════════════════════════════════════════════

// Tranche d'état à répliquer : l'état allégé SAUF ce qui est rechargé du serveur
// (le seed local et les posts réseau supabasePosts).
function _syncableState() {
  const s = _leanState();
  delete s.seed;
  delete s.supabasePosts;
  // ADR-009 : ne jamais REPROPAGER une clé d'économie interne lue d'un ancien
  // état — sinon ce client remettrait en circulation ce qu'il vient de retirer.
  // ⚠️ `_leanState()` est une copie SUPERFICIELLE : `s.user` est le MÊME objet
  // que `state.user`. On le dédouble avant de filtrer, sinon cette fonction
  // d'ENVOI muterait l'état vivant de l'application — un effet de bord qu'un
  // lecteur de `_syncableState` n'a aucune raison d'attendre.
  if (s.user && typeof s.user === "object") s.user = Object.assign({}, s.user);
  if (Array.isArray(s.user && s.user.profiles)) s.user.profiles = s.user.profiles.map(function (p) {
    return (p && typeof p === "object") ? Object.assign({}, p) : p;
  });
  stripLegacyEconomy(s);
  // Strip base64 photos from passion profiles : les images base64 peuvent dépasser
  // la limite de payload Supabase (~1 Mo) et bloquer TOUS les appels supaSaveUserState.
  // La photo reste dans localStorage (s.user n'est pas modifié en mémoire) ; seule
  // la copie envoyée au serveur est expurgée. L'URL Storage (prof.photoUrl) elle,
  // est conservée pour la synchronisation cross-appareil.
  const _isB64 = function (v) { return v && typeof v === "string" && v.indexOf("data:") === 0; };

  // ⚠️ Le même traitement pour les photos du COMPTE (s.user.general), qui étaient
  // passées au travers : l'expurgation ci-dessous ne couvrait que les profils
  // passion. Mesuré en prod le 2026-08-16 — un compte portait 4 705 kB de base64
  // dans son état (avatarPhoto 2 352 kB + coverPhoto 2 352 kB), soit 99,7 % du
  // blob, renvoyé à CHAQUE synchronisation. Conséquence sur `user_state`, le
  // 2ᵉ endpoint le plus appelé : p95 = 2 844 ms et un maximum à 43 secondes.
  //
  // La photo reste intacte en mémoire et dans localStorage : seule la copie
  // envoyée au serveur est expurgée. L'URL Storage, elle, part normalement —
  // c'est elle qui porte la synchronisation cross-appareil (profiles.avatar_url).
  if (s.user && s.user.general && (_isB64(s.user.general.avatarPhoto) || _isB64(s.user.general.coverPhoto))) {
    const g = Object.assign({}, s.user.general);
    if (_isB64(g.avatarPhoto)) g.avatarPhoto = null;
    if (_isB64(g.coverPhoto)) g.coverPhoto = null;
    s.user = Object.assign({}, s.user, { general: g });
  }

  if (s.user && Array.isArray(s.user.profiles)) {
    s.user = {
      ...s.user,
      profiles: s.user.profiles.map(function(p) {
        // Idem pour la photo de FOND du profil passion (p.coverPhoto) : seule
        // l'URL Storage (p.coverUrl) part au serveur.
        if (_isB64(p.photo) || _isB64(p.coverPhoto)) {
          const c = Object.assign({}, p);
          if (_isB64(c.photo)) c.photo = null;
          if (_isB64(c.coverPhoto)) c.coverPhoto = null;
          return c;
        }
        return p;
      })
    };
  }
  return s;
}

// ---- VERDICT D'UNE ÉCRITURE SUPABASE ----
// Deux pièges se cumulent et se ressemblent à l'œil nu :
//  ① le SDK ne LÈVE PAS sur un refus RLS — il renvoie { error }. Un `await` dont
//    personne ne lit le retour rend l'échec invisible ;
//  ② un UPDATE/DELETE que la policy filtre renvoie { data: [], error: null }.
//    « Aucune erreur » n'est donc PAS « c'est fait » : la ligne peut exister et
//    être restée intacte. Il faut demander `.select()` et COMPTER les lignes.
// `expectRows` : mettre à true quand zéro ligne touchée signifie l'échec (on
// modifie une ligne censée exister). `dupOk` : un 23505 signifie que l'état voulu
// est déjà atteint — succès, sauf si l'intention portait sur le CONTENU de la ligne.
function _writeVerdict(res, opts) {
  opts = opts || {};
  const label = opts.label || "écriture";
  const err = res && res.error;
  if (err) {
    if (opts.dupOk && String(err.code) === "23505") return { ok: true, error: null, rows: 0 };
    const msg = err.message || String(err);
    console.warn(label + " : " + msg);
    try { if (typeof diagLog === "function") diagLog(label + " KO: " + msg); } catch (_e) {}
    return { ok: false, error: err, rows: 0 };
  }
  const rows = (res && Array.isArray(res.data)) ? res.data.length : null;
  if (opts.expectRows && rows === 0) {
    const m = label + " : 0 ligne touchée (policy RLS, ou ligne déjà absente)";
    console.warn(m);
    try { if (typeof diagLog === "function") diagLog(m); } catch (_e) {}
    return { ok: false, error: { message: "0 ligne touchée" }, rows: 0 };
  }
  return { ok: true, error: null, rows: rows };
}

let _stateSyncTimer = null;
// Drapeau « l'état a changé depuis la dernière sauvegarde aboutie ». saveState() est
// l'entonnoir unique des mutations (il appelle _scheduleStateSync), donc c'est ici
// qu'on le lève. Sans lui, le beacon de passage en arrière-plan re-sérialise et
// re-poste TOUT l'état à chaque bascule d'application sur mobile — pour rien.
let _stateDirty = false;
function _scheduleStateSync() {
  if (_accountPurged) return;
  _stateDirty = true;
  if (typeof MY_UID === "undefined" || !MY_UID) return;
  if (_stateSyncTimer) clearTimeout(_stateSyncTimer);
  _stateSyncTimer = setTimeout(() => { _stateSyncTimer = null; supaSaveUserState(); }, 2500);
}

// File de secours : dernière sauvegarde d'état qui N'A PAS abouti (réseau coupé,
// onglet passé en arrière-plan pile pendant le POST → « Failed to fetch » / HTTP 0).
// On la persiste verbatim (avec son updated_at d'origine) pour la rejouer au prochain
// boot sans jamais écraser une version serveur plus récente (garde par timestamp).
//
// ⚠️ La clé est SUFFIXÉE PAR COMPTE. Avec une clé unique partagée, deux comptes de la
// même origine se marchaient dessus : à la connexion de B, le rejeu constatait
// `pending.user_id !== MY_UID` et SUPPRIMAIT la file de A — la sauvegarde de A était
// détruite par le simple fait qu'un autre compte se connecte.
const PENDING_USER_STATE_PREFIX = "passio_pending_user_state";
function _pendingUserStateKey(uid) {
  return PENDING_USER_STATE_PREFIX + (uid ? "_" + uid : "");
}

// Renvoie true SEULEMENT si la mise en file a réellement abouti. L'appelant en a
// besoin : baisser le drapeau « état sale » alors que le stockage a échoué (quota
// dépassé) fabrique un faux état propre, où plus personne ne retentera l'envoi.
function _queuePendingUserState(payload) {
  if (_accountPurged) return false;   // déconnexion en cours : ne rien remettre en file
  try {
    localStorage.setItem(_pendingUserStateKey(payload && payload.user_id), JSON.stringify(payload));
    return true;
  } catch (_e) { return false; }
}

// N'efface QUE le payload qu'on a soi-même acquitté. Sans cette comparaison, la
// réponse tardive d'un ancien envoi supprimait une sauvegarde PLUS RÉCENTE mise en
// file entre-temps (page revenue au premier plan, état modifié, re-beacon) : le
// serveur restait à l'ancien blob, la file était vide, et l'état se croyait propre.
function _clearPendingUserState(uid, onlyIfTs) {
  try {
    const key = _pendingUserStateKey(uid || (typeof MY_UID !== "undefined" ? MY_UID : null));
    if (onlyIfTs) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const cur = JSON.parse(raw);
        if (cur && cur.updated_at && cur.updated_at !== onlyIfTs) return;  // file plus récente : on n'y touche pas
      }
    }
    localStorage.removeItem(key);
  } catch (_e) {}
}

// Marque _stateSyncedAt (mémoire + snapshot localStorage) : évite la fenêtre où le
// serveur a updated_at=T_sync mais localStorage croit encore être à T_old, ce qui
// déclencherait une restauration serveur au prochain boot.
// ⚠️ Ne RECULE jamais le marqueur : l'acquittement tardif d'un envoi ancien ne doit
// pas rétrograder la synchro déjà constatée par un envoi plus récent.
function _markStateSynced(ts) {
  const prev = state._stateSyncedAt ? new Date(state._stateSyncedAt).getTime() : 0;
  if (ts && new Date(ts).getTime() < prev) return;
  state._stateSyncedAt = ts;
  _stateDirty = false;
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const snap = JSON.parse(raw);
      snap._stateSyncedAt = ts;
      localStorage.setItem(STATE_KEY, JSON.stringify(snap));
    }
  } catch (_e) {}
}

// Sérialisation des sauvegardes — incident SYNC-CLOCK-012.
// 17 points d'appel déclenchent `supaSaveUserState`, et la plupart sont des
// « flush immédiat » qui court-circuitent le debounce. Le garde `!_stateDirty`
// ne protège PAS de la concurrence : le drapeau ne retombe qu'APRÈS l'await, si
// bien que deux upserts aveugles peuvent voler en même temps. Rien ne garantit
// alors leur ordre de commit — le plus ANCIEN peut écraser le plus RÉCENT, sur
// un seul appareil, sans le moindre décalage d'horloge.
// On chaîne donc au lieu de paralléliser, et on rejoue une fois à la fin si
// l'état a encore bougé pendant l'envoi (sinon la dernière modification, celle
// qui a justement déclenché l'appel bloqué, ne partirait jamais).
let _savingUserState = null;
let _saveUserStateAgain = false;

async function supaSaveUserState() {
  if (_savingUserState) { _saveUserStateAgain = true; return _savingUserState; }
  _savingUserState = _supaSaveUserStateOnce();
  try { await _savingUserState; }
  finally {
    _savingUserState = null;
    if (_saveUserStateAgain) {
      _saveUserStateAgain = false;
      if (_stateDirty) await supaSaveUserState();
    }
  }
}

async function _supaSaveUserStateOnce() {
  try {
    if (typeof supa === "undefined" || !supa || !window._supaReal) return;
    if (typeof MY_UID === "undefined" || !MY_UID) return;
    // Le beacon de passage en arrière-plan a pu envoyer cette même génération d'état
    // juste avant que le timer de debounce n'arrive à échéance : sans cette garde, le
    // retour du bfcache déclenchait un SECOND upsert du MÊME état, mais horodaté
    // maintenant — capable d'écraser ce qu'un autre appareil a écrit entre-temps.
    if (!_stateDirty) return;
    // ⚠️ `updated_at` N'EST PLUS ENVOYÉ. C'est la base qui horodate
    // (trigger trg_user_state_horodatage). Le client n'a pas à être cru sur
    // l'heure : c'est cette valeur qui arbitre la fusion au démarrage, et un
    // appareil en avance gagnait donc définitivement contre tous les autres.
    // On relit la valeur serveur pour marquer la synchro sur elle.
    const payload = { user_id: MY_UID, data: _syncableState() };
    const { data: ligne, error } = await supa.from("user_state")
      .upsert(payload, { onConflict: "user_id" })
      .select("updated_at")
      .maybeSingle();
    if (!error) {
      // Repli sur l'horloge locale UNIQUEMENT si la relecture n'a rien rendu
      // (ancienne base sans trigger, ou `return=minimal` imposé) : mieux vaut un
      // marqueur approximatif que pas de marqueur du tout, qui relancerait une
      // restauration serveur à chaque démarrage.
      const tsServeur = (ligne && ligne.updated_at) || new Date().toISOString();
      _markStateSynced(tsServeur);
      _clearPendingUserState(MY_UID);   // la sauvegarde a abouti : plus rien à rejouer
    } else {
      // Échec serveur (réseau/RLS) : on garde le blob pour un rejeu au prochain boot.
      // ⚠️ `updated_at` est REMIS ICI, et seulement ici : la file est un objet
      // LOCAL, dont l'horodatage ne sert qu'à l'ordonner et à l'acquitter
      // (`_clearPendingUserState`). Il ne fait plus autorité côté serveur — au
      // rejeu, le trigger l'écrase. C'est la distinction qui manquait : une heure
      // locale peut servir de repère local, jamais d'arbitre partagé.
      _queuePendingUserState(Object.assign({ updated_at: new Date().toISOString() }, payload));
    }
  } catch (e) {
    // « Failed to fetch » (requête avortée par le passage en arrière-plan) atterrit ici.
    try {
      if (typeof MY_UID !== "undefined" && MY_UID) {
        _queuePendingUserState({ user_id: MY_UID, data: _syncableState(), updated_at: new Date().toISOString() });
      }
    } catch (_e2) {}
    console.warn("supaSaveUserState:", e && e.message);
  }
}

// Jeton d'accès lu SANS le SDK (synchrone) — nécessaire dans un handler pagehide où
// l'on ne peut pas attendre une promesse. Même source que telemetry.js : la session
// persistée par le SDK dans localStorage (« sb-<ref>-auth-token »), formats v1/v2.
function _readStoredAccessToken() {
  try {
    const cfg = window.PASSIO_SUPABASE;
    if (!cfg || !cfg.url) return null;
    const ref = (String(cfg.url).match(/https?:\/\/([^.]+)\./) || [])[1];
    const raw = ref && localStorage.getItem("sb-" + ref + "-auth-token");
    if (!raw) return null;
    const j = JSON.parse(raw);
    const s = (j && j.currentSession) ? j.currentSession : j;   // v1 vs v2
    return (s && s.access_token) || null;
  } catch (_e) { return null; }
}

// Sauvegarde de DERNIÈRE CHANCE au passage en arrière-plan / fermeture d'onglet.
// POST REST direct avec keepalive:true → la requête SURVIT au déchargement de la page
// (contrairement au client SDK, dont la socket est tuée → « Failed to fetch » / HTTP 0).
// On persiste aussi le blob en file de secours : si le keepalive échoue (payload
// > ~64 Ko, réseau réellement coupé), le rejeu au boot le récupère.
function supaSaveUserStateBeacon() {
  // Le location.reload() de la déconnexion déclenche pagehide : sans ce garde, le
  // beacon repartait avec l'état du compte SORTANT et recréait sa file en
  // localStorage, juste après la purge.
  if (_accountPurged) return;
  try {
    const cfg = window.PASSIO_SUPABASE;
    if (!cfg || !cfg.url || !cfg.anon) return;
    if (typeof MY_UID === "undefined" || !MY_UID) return;
    if (typeof state === "undefined" || !state || !state.onboarded) return;
    // Rien n'a bougé depuis la dernière sauvegarde aboutie → rien à envoyer. Cette
    // garde sert aussi de dédoublonnage : pagehide ET visibilitychange(hidden) tirent
    // tous les deux à la fermeture, le second trouve le drapeau déjà retombé.
    if (!_stateDirty) return;
    // `updated_at` sert ICI de repère LOCAL (ordonnancement de la file,
    // acquittement ciblé) mais n'est PAS envoyé : la base horodate. Deux objets
    // distincts, donc, là où il n'y en avait qu'un — c'est toute la correction.
    const marqueurLocal = new Date().toISOString();
    const payload = { user_id: MY_UID, data: _syncableState() };
    const queued = _queuePendingUserState(Object.assign({ updated_at: marqueurLocal }, payload));   // filet : rejoué au boot si le keepalive rate
    // Le timer de debounce déjà armé porte la MÊME génération d'état : le laisser
    // courir produirait un second upsert, ré-horodaté, au retour du bfcache.
    if (_stateSyncTimer) { clearTimeout(_stateSyncTimer); _stateSyncTimer = null; }
    // Retombée du drapeau : seulement si le filet a réellement pris. On ne peut pas
    // attendre la confirmation réseau (le .then ne s'exécute pas quand la page est
    // déchargée), mais baisser le drapeau alors que la mise en file a échoué (quota
    // dépassé) fabriquerait un faux état propre — plus personne ne retenterait.
    if (queued) _stateDirty = false;
    const token = _readStoredAccessToken() || cfg.anon;
    const body = JSON.stringify(payload);
    // Au-delà de la limite keepalive (~64 Ko), le navigateur rejetterait la requête :
    // on ne la tente pas (le blob reste en file, rejoué au boot).
    // ⚠️ La limite porte sur des OCTETS, pas sur des caractères : body.length compte
    // des unités UTF-16, et un état riche en emoji/accents dépasse 64 Ko d'octets bien
    // avant 60 000 caractères — la garde laissait alors passer une requête vouée au rejet.
    let bodyBytes;
    try { bodyBytes = new TextEncoder().encode(body).length; }
    catch (_e) { bodyBytes = body.length * 3; }   // majorant sûr si TextEncoder manque
    if (bodyBytes > 60000) return;
    fetch(cfg.url + "/rest/v1/user_state?on_conflict=user_id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.anon,
        Authorization: "Bearer " + token,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: body,
      keepalive: true,
    }).then(function (res) {
      // Acquittement CIBLÉ : si l'utilisateur est revenu et a re-sauvegardé entre-temps,
      // la file contient déjà un blob plus récent — cette réponse tardive ne doit pas
      // l'effacer.
      // ⚠️ On efface la file — l'écriture a abouti — mais on NE marque PAS la
      // synchro : la réponse est `return=minimal`, on ne connaît donc pas la
      // valeur retenue par la base, et inscrire une heure locale à sa place
      // remettrait exactement l'autorité qu'on vient de lui retirer.
      // Conséquence assumée : au prochain démarrage, le serveur paraîtra plus
      // récent et son état sera restauré. C'est sans perte — il contient
      // précisément ce que ce beacon vient d'envoyer.
      if (res && res.ok) { _clearPendingUserState(payload.user_id, marqueurLocal); }
    }, function () {}).catch(function () {});
  } catch (e) { console.warn("supaSaveUserStateBeacon:", e && e.message); }
}

// Rejeu au boot d'une sauvegarde restée en file (session précédente coupée en plein
// vol). Garde anti-écrasement : on ne pousse QUE si le blob en attente est plus récent
// que la ligne serveur — sinon un autre appareil (ou le keepalive qui a fini par
// aboutir) a déjà écrit une version au moins aussi neuve, on jette la file.
let _flushingPendingState = false;
async function _flushPendingUserState() {
  // Le rejeu est branché sur deux chemins (boot et supaInit/SIGNED_IN) qui peuvent se
  // chevaucher : sans ce verrou, deux SELECT puis deux upserts concurrents du même blob.
  if (_flushingPendingState) return;
  try {
    if (typeof MY_UID === "undefined" || !MY_UID) return;
    // Clé suffixée par compte : on ne lit QUE sa propre file et on ne détruit jamais
    // celle d'un autre compte de la même origine.
    const raw = localStorage.getItem(_pendingUserStateKey(MY_UID));
    if (!raw) return;
    _flushingPendingState = true;
    if (typeof supa === "undefined" || !supa || !window._supaReal) return;
    let pending;
    try { pending = JSON.parse(raw); } catch (_e) { _clearPendingUserState(MY_UID); return; }
    if (!pending || pending.user_id !== MY_UID || !pending.data) { _clearPendingUserState(MY_UID); return; }

    // ÉCRITURE CONDITIONNELLE (compare-et-remplace), pas un upsert aveugle. Un SELECT
    // suivi d'un upsert laisse la place à une écriture concurrente entre les deux : le
    // temps de l'aller-retour, un autre appareil peut poser un état plus récent, que
    // l'upsert écraserait ensuite sans le voir. Ici la comparaison est faite PAR LA
    // BASE, dans la requête d'écriture elle-même : la ligne n'est remplacée que si son
    // updated_at est encore antérieur au nôtre. Elle protège aussi du décalage
    // d'horloge dans le sens dangereux — un client en retard ne peut plus rien écraser.
    // ⚠️ La comparaison se fait entre DEUX VALEURS SERVEUR, jamais entre une heure
    // client et une heure serveur. `_stateSyncedAt` est désormais la dernière
    // valeur relue de la base : « la ligne n'a pas bougé depuis que je l'ai vue »
    // est un test vérifiable ; « ma montre est plus récente que la ligne » ne
    // l'est pas. Sans ça, l'horodatage serveur aurait FAIT PERDRE ses reprises
    // hors-ligne à tout appareil dont l'horloge retarde de quelques secondes.
    //
    // ⚠️⚠️ CE N'EST PAS UNE GARANTIE D'ORDRE, et il ne faut pas la lire comme
    // telle (correction apportée par la revue croisée du 2026-08-16, vérifiée
    // sur la base : `now()` renvoie l'heure de DÉBUT DE TRANSACTION, pas celle
    // du commit — mesuré identique de part et d'autre d'un pg_sleep(0.3) pendant
    // que clock_timestamp() avançait de 306 ms). Une transaction démarrée avant
    // mais committée après en portera donc un `updated_at` ANTÉRIEUR.
    // `updated_at` est une métadonnée temporelle autoritaire, pas une horloge
    // logique. Le seul ordre réellement fiable serait une révision monotone
    // portée par la ligne (compare-et-remplace) — voir le risque résiduel de
    // SYNC-CLOCK-012 dans passio_qa_registry.json.
    const baseServeur = (typeof state !== "undefined" && state && state._stateSyncedAt) || pending.updated_at;
    const { data: upd, error: upErr } = await supa.from("user_state")
      .update({ data: pending.data })       // le trigger horodate : rien à imposer
      .eq("user_id", MY_UID)
      .lte("updated_at", baseServeur)
      .select("updated_at");
    if (upErr) return;   // réseau/RLS encore KO : on garde la file pour un prochain essai

    if (!upd || upd.length === 0) {
      // Zéro ligne touchée : soit le serveur est déjà au moins aussi récent (rien à
      // rejouer), soit la ligne n'existe pas encore (premier appareil du compte).
      const { data: row, error: selErr } = await supa.from("user_state").select("user_id").eq("user_id", MY_UID).maybeSingle();
      if (selErr) return;
      if (row) { _clearPendingUserState(MY_UID, pending.updated_at); return; }  // serveur plus récent : file obsolète
      // Insertion sans `updated_at` : la base horodate. Envoyer la valeur de la
      // file reviendrait à réintroduire l'autorité client par la porte de secours.
      const { error: insErr } = await supa.from("user_state").insert({ user_id: pending.user_id, data: pending.data });
      if (insErr) return;
    }

    // ⚠️ Le rejeu vient de rendre le SERVEUR plus récent que l'état VIVANT : sans
    // réappliquer le blob ici, l'application continue avec l'état chargé au boot tout
    // en se croyant synchronisée — et la prochaine sauvegarde réécrase le rejeu (les
    // follows tout juste restaurés disparaissaient à la modification suivante).
    try { _applyUserState(pending.data); } catch (_e) {}
    // Marquer sur la valeur RENDUE PAR LA BASE quand on l'a : c'est elle qui sera
    // comparée au prochain démarrage. Repli sur l'heure de la file si le chemin
    // « insert » est passé (pas de RETURNING lu) — approximatif mais local.
    _markStateSynced((upd && upd[0] && upd[0].updated_at) || pending.updated_at);
    _clearPendingUserState(MY_UID, pending.updated_at);
    try { if (typeof renderEverything === "function") renderEverything(); } catch (_e) {}
  } catch (e) { console.warn("_flushPendingUserState:", e && e.message); }
  finally { _flushingPendingState = false; }
}

// Applique un blob serveur sur l'état local (sans toucher au seed ni aux posts
// réseau, qui sont rechargés séparément).
function _applyUserState(data) {
  if (!data || typeof data !== "object") return;
  // ADR-009 : un blob poussé par un ancien client porte encore score/passia/
  // transactions/quests. On les jette AVANT de les recopier dans `state`.
  stripLegacyEconomy(data);
  const keepSeed = state.seed, keepSupa = state.supabasePosts;
  window._hydratingState = true;
  try {
    // Les suppressions ne se remplacent pas, elles s'UNISSENT : le blob peut
    // avoir été écrit AVANT une suppression faite ici, et la recopie brute de
    // ses clés ressusciterait le contenu au rafraîchissement suivant.
    const suppressionsLocales = Array.isArray(state.deletedPostIds) ? state.deletedPostIds.slice() : [];
    Object.keys(data).forEach((k) => { if (k !== "seed" && k !== "supabasePosts") state[k] = data[k]; });
    state.seed = keepSeed;
    state.supabasePosts = keepSupa;
    if (!Array.isArray(state.deletedPostIds)) state.deletedPostIds = [];
    fusionnerPostsSupprimes(suppressionsLocales);
    // Le blob peut porter des `userPosts` antérieurs à une suppression (la
    // sienne ou celle d'un autre appareil) : on les évacue tout de suite,
    // avant que quoi que ce soit ne les rende.
    purgerPostsSupprimes();
    state.user = state.user || {};
    if (!Array.isArray(state.user.profiles)) state.user.profiles = [];
    // Dédup par passion dès l'application du blob serveur — nettoie l'état
    // corrompu quelle que soit l'origine (file://, localhost, production).
    (function() {
      const seen = new Set();
      state.user.profiles = state.user.profiles.filter(function(p) {
        if (!p || !p.passion || seen.has(p.passion)) return false;
        seen.add(p.passion);
        // Même réparation que loadState : photoUrl non-http (bug historique) → null.
        if (p.photoUrl && String(p.photoUrl).indexOf("http") !== 0) p.photoUrl = null;
        return true;
      });
    })();
  } finally { window._hydratingState = false; }
}

// Charge l'état du compte depuis Supabase au boot/connexion. Si le serveur a une
// version plus récente (ou si l'appareil est vierge), on l'applique → le profil
// et toutes les données suivent l'utilisateur. Sinon on pousse le local.
// Après une fusion serveur, la passion ACTIVE doit rester vivante.
//
// ⚠️ « Toujours dans la liste fusionnée » ne suffit pas : une passion ARCHIVÉE
// sur un autre appareil reste dans `profiles`, avec `archived:true`. Le test
// d'existence seul rendait donc active une passion rangée. Mesuré avant
// correctif : l'écran affichait « Passion active : 🍳 Cuisine » pendant que le
// Fil, qui ne rend que `passionsVivantes()`, ne la connaissait plus — et le
// Studio publiait dedans.
//
// C'est l'état que tout le lot UI-8 suppose impossible. `currentProfile()`
// (app-06) rend `null` pour une passion archivée, et son commentaire dit
// pourquoi il ne réécrit rien : le nettoyage appartient aux points d'ÉCRITURE.
// `archiverPassion` et `deleteProfile` le font déjà ; la synchronisation était
// le dernier à ne pas le faire.
//
// Fonction NOMMÉE et non bloc en ligne, pour qu'un test puisse exercer le code
// réel plutôt qu'une copie — une copie ne prouverait que sa propre cohérence.
function restaurerPassionActiveApresFusion(localCurrentId) {
  if (!state || !state.user) return;
  var profils = Array.isArray(state.user.profiles) ? state.user.profiles : [];
  var archivee = function (id) {
    var pr = profils.find(function (p) { return p.id === id; });
    return !!(pr && pr.archived);
  };
  if (localCurrentId && profils.some(function (p) { return p.id === localCurrentId; })
      && !archivee(localCurrentId)) {
    state.user.currentProfileId = localCurrentId;
  }
  // Filet commun : quelle que soit la provenance de la valeur — locale
  // restaurée ci-dessus, ou reçue du serveur — on retombe sur la première
  // VIVANTE, jamais sur `profiles[0]` qui peut être archivée.
  if (archivee(state.user.currentProfileId)) {
    var vivantes = profils.filter(function (p) { return !p.archived; });
    if (vivantes.length) state.user.currentProfileId = vivantes[0].id;
  }
}

async function supaLoadUserState() {
  try {
    if (typeof supa === "undefined" || !supa || !window._supaReal) return false;
    if (typeof MY_UID === "undefined" || !MY_UID) return false;
    const { data, error } = await supa.from("user_state").select("data,updated_at").eq("user_id", MY_UID).maybeSingle();
    if (error) { console.warn("supaLoadUserState:", error.message); return false; }
    if (!data) {
      // Aucune sauvegarde serveur → on pousse l'état local (création de la ligne).
      await supaSaveUserState();
      return false;
    }
    const serverTs = data.updated_at ? new Date(data.updated_at).getTime() : 0;
    const localTs = state._stateSyncedAt ? new Date(state._stateSyncedAt).getTime() : 0;
    // Appareil vierge (pas onboardé) OU serveur plus récent → on restaure.
    if (!state.onboarded || serverTs > localTs) {
      // ⚠️ Ne PAS écraser des profils locaux par un état serveur VIDE (compte
      // fraîchement créé / purgé, sync pas encore poussée) — sinon le profil par
      // défaut tout juste créé au boot disparaît. On pousse plutôt le bon état local.
      const incoming = data.data || {};
      const incomingProfiles = (incoming.user && Array.isArray(incoming.user.profiles)) ? incoming.user.profiles : [];
      const localProfiles = (state.user && Array.isArray(state.user.profiles)) ? state.user.profiles : [];
      if (incomingProfiles.length === 0 && localProfiles.length > 0) {
        state.onboarded = true; // session active = compte onboardé
        await supaSaveUserState();
        return false;
      }
      // Mémorise le currentProfileId local AVANT l'écrasement (pour le restaurer si valide).
      const localCurrentId = state.user && state.user.currentProfileId;
      // ⚠️ ET LE JOURNAL DES CHANGEMENTS DE PASSION. Il porte un QUOTA : la
      // règle de fusion « le serveur plus récent gagne » y serait une porte
      // dérobée — vider `localStorage`, ou arriver avec un blob serveur écrit
      // avant les derniers archivages, rendrait des changements déjà consommés.
      // On garde donc le journal QUI EN COMPTE LE PLUS, jamais le plus récent.
      const localJournal = (state.user && state.user.passionChanges
        && Array.isArray(state.user.passionChanges.entries))
        ? state.user.passionChanges.entries : [];
      _applyUserState(data.data);
      try {
        const _nbArchives = function (l) {
          // Même prédicat qu'`_estChangementFacturable` (app-06) : une entrée
          // faite en démo (`compte: false`) ne compte NULLE PART, fusion incluse.
          return (Array.isArray(l) ? l : [])
            .filter(function (e) { return e && e.type === "archive" && e.compte !== false; }).length;
        };
        const srvJournal = (state.user && state.user.passionChanges
          && Array.isArray(state.user.passionChanges.entries))
          ? state.user.passionChanges.entries : [];
        if (_nbArchives(localJournal) > _nbArchives(srvJournal)) {
          state.user.passionChanges = { entries: localJournal };
        } else {
          state.user.passionChanges = { entries: srvJournal };
        }
      } catch (e) { console.warn("passionChanges (fusion) :", e && e.message); }
      // Fusion défensive : ré-injecte les profils locaux ABSENTS du serveur (créés
      // entre la dernière sync et la fermeture) ET les versions locales des profils
      // MODIFIÉS (contenu plus récent — photo, bio, photoUrl…).
      // ⚠️ Comparaison par PASSION (pas par ID) : le fallback de reconstruction crée
      // des uid() neufs → les IDs locaux et serveur peuvent diverger pour la même
      // passion, causant des doublons si on compare par id.
      if (localProfiles.length > 0) {
        const serverPassions = new Set((state.user.profiles || []).map(p => p.passion).filter(Boolean));
        const missing = localProfiles.filter(p => p.passion && !serverPassions.has(p.passion));
        if (missing.length > 0) {
          state.user.profiles = (state.user.profiles || []).concat(missing);
        }
        // Pour les profils présents des deux côtés : si la version locale porte une
        // photo (base64 ou URL Storage) absente côté serveur, on la réinjecte.
        // Matching par passion (pas par id) pour la même raison.
        state.user.profiles = state.user.profiles.map(function(sp) {
          const lp = localProfiles.find(function(p) { return p.passion && p.passion === sp.passion; });
          if (!lp) return sp;
          const merged = Object.assign({}, sp);
          if (!merged.photo && lp.photo) merged.photo = lp.photo;
          if (!merged.photoUrl && lp.photoUrl) merged.photoUrl = lp.photoUrl;
          if (!merged.bio && lp.bio) merged.bio = lp.bio;
          // Lot UI-8 : l'état « archivée » est une donnée locale récente que le
          // serveur peut ignorer (blob écrit avant l'archivage). On ne la
          // réinjecte QUE s'il n'en a aucune — sinon une restauration serveur
          // serait annulée par un vieil état local.
          if (merged.archived === undefined && lp.archived !== undefined) merged.archived = lp.archived;
          return merged;
        });
        // Dédup final : s'il reste deux profils pour la même passion (ne devrait
        // plus arriver avec la correction ci-dessus, mais garde de sécurité),
        // on ne garde que le premier.
        const seenPassions = new Set();
        state.user.profiles = state.user.profiles.filter(function(p) {
          if (!p.passion || seenPassions.has(p.passion)) return false;
          seenPassions.add(p.passion);
          return true;
        });
        // Re-pousse immédiatement si des différences ont été fusionnées.
        setTimeout(function() { try { supaSaveUserState(); } catch(_e) {} }, 0);
      }
      // Restaure le profil actif local, et garantit qu'il est VIVANT.
      restaurerPassionActiveApresFusion(localCurrentId);
      state._stateSyncedAt = data.updated_at;
      // supaLoadUserState n'est appelée qu'avec une session active → l'utilisateur
      // est connecté, donc onboardé (évite de retomber sur la landing).
      state.onboarded = true;
      window._hydratingState = true;
      try { saveState(); } finally { window._hydratingState = false; }
      return true;
    }
    // Local plus récent → on pousse vers le serveur.
    await supaSaveUserState();
    return false;
  } catch (e) { console.warn("supaLoadUserState:", e && e.message); return false; }
}

// Miniature CDN : transforme une URL Supabase Storage publique en version
// redimensionnée (transformation d'image Supabase) pour le fil — beaucoup plus
// légère. Laisse les autres URLs (base64, externes) intactes. Pleine résolution
// conservée pour le visualiseur plein écran.
function passioThumb(url, width) {
  if (!url || typeof url !== "string") return url;
  if (url.indexOf("/storage/v1/object/public/") === -1) return url;
  return url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") + "?width=" + (width || 600) + "&quality=75";
}

// ======== UTILS ========
function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function uid() { return "x" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

// Parse un timestamp Supabase (REST ou realtime) en millisecondes.
// ⚠️ La prod mélange DEUX types de colonnes : timestamp SANS fuseau
// ("2026-06-26T12:15:10.389", stocké en UTC → il FAUT ajouter "Z") et
// timestamptz ("2026-06-25T16:21:51.387+00:00" → ajouter "Z" donne une
// Invalid Date/NaN : c'était le bug « Invalid Date » sur les réponses de
// commentaires, réactions, CDV…). On n'ajoute "Z" que si la chaîne n'a
// PAS déjà d'indication de fuseau.
function supaTs(s) {
  if (s == null || s === "") return Date.now();
  if (typeof s === "number") return s;
  var str = String(s).replace(" ", "T")
    .replace(/([+\-]\d{2})$/, "$1:00"); // offset court "+00" (realtime) → "+00:00"
  var hasTz = /(Z|[+\-]\d{2}(:?\d{2})?)$/.test(str);
  var t = Date.parse(hasTz ? str : str + "Z");
  if (isNaN(t)) t = Date.parse(str);
  return isNaN(t) ? Date.now() : t;
}

function fmtTime(ts) {
  if (!ts) return "";

  // Normalise (chaîne ISO avec ou sans fuseau, ou ms) en ms via supaTs.
  if (typeof ts === "string") ts = supaTs(ts);
  const d = new Date(ts);

  // ✅ JavaScript gère automatiquement le fuseau horaire!
  // getHours() retourne l'heure locale, pas UTC
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");

  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return Math.floor(diff / 60) + " min";
  if (diff < 86400) return `${h}:${m}`;
  if (diff < 2592000) return Math.floor(diff / 86400) + " j";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function fmtEventDate(ts) {
  const d = new Date(ts);
  var h = d.getHours();
  var m = d.getMinutes();
  return {
    day: d.getDate(),
    month: d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""),
    time: (h < 10 ? "0" : "") + h + "h" + (m > 0 ? (m < 10 ? "0" : "") + m : ""),
  };
}

// Échappe une valeur injectée dans une chaîne JS simple-quotée D'UN ATTRIBUT
// onclick. Contexte double : le parser HTML décode les entités AVANT le parse JS
// — escapeHtml seul transforme ' en &#39; que le HTML re-décode en ' → SyntaxError
// (bouton mort) dès qu'un pseudo contient une apostrophe (« L'ami »). On échappe
// donc l'apostrophe côté JS (\') et le reste côté HTML.
function escapeJsArg(s) {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r|\n/g, " ");
}

// URL sûre pour un attribut src/href : n'accepte que http(s) et data:image
// (bloque javascript: & co), et échappe les quotes pour rester dans l'attribut.
function safeUrlAttr(u) {
  var s = String(u == null ? "" : u).trim();
  if (!/^(https?:\/\/|data:image\/|data:audio\/|data:video\/|blob:)/i.test(s)) return "#";
  return escapeHtml(s);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
}

// Tronque une chaîne à `max` unités UTF-16 SANS couper une paire de substitution.
// slice(0,max) brut peut laisser un demi-surrogate (high sans low) quand la coupe
// tombe au milieu d'un emoji (😍 = 2 unités, 👨‍👩‍👧 = plusieurs) → caractère « ￿ ».
// On retire ce demi-caractère orphelin en fin de chaîne. Préserve l'intégrité des
// emojis stockés (payloads de commentaires/réactions bornés serveur).
function _truncU16Safe(str, max) {
  var s = String(str == null ? "" : str);
  if (s.length <= max) return s;
  var cut = s.slice(0, max);
  var last = cut.charCodeAt(cut.length - 1);
  // High surrogate seul en fin (0xD800–0xDBFF) → on le retire (sa moitié basse est hors coupe).
  if (last >= 0xD800 && last <= 0xDBFF) cut = cut.slice(0, -1);
  return cut;
}
window._truncU16Safe = _truncU16Safe;

// Compte unifié des commentaires d'un fil (fil / IRL / CDV) : commentaires de
// premier niveau + TOUTES les réponses, mais SANS les réactions emoji/GIF (qui
// ne sont pas des commentaires — elles s'affichent en pastille « 😍 N »). Utilisé
// par toutes les pastilles « 💬 N » pour une cohérence totale entre les surfaces.
function commentThreadCount(comments) {
  var arr = comments || [];
  var n = 0;
  arr.forEach(function(c){
    if (!c) return;
    n++; // le commentaire lui-même
    (c.replies || []).forEach(function(r){
      if (r && r.type !== "emoji_reaction") n++; // les réponses comptent, pas les réactions
    });
  });
  return n;
}

function allPassions() {
  const custom = (state && state.user && state.user.customPassions) || [];
  return [...PASSIONS, ...custom];
}
function passionById(id) {
  var trouve = allPassions().find(p => p.id === id);
  if (trouve) return trouve;
  // ── Lot flat_passions_v1 : le référentiel plat sert de REPLI D'AFFICHAGE ──
  // ⚠️ SANS CE REPLI, TOUTE PASSION DU RÉFÉRENTIEL S'AFFICHE « ✨ Passion ».
  // `allPassions()` ne connaît que les 19 du socle embarqué plus les passions
  // personnelles : un identifiant venu de la recherche (« moto-enduro ») lui est
  // inconnu, et le générique prenait sa place — dans la bulle du Fil, dans le
  // rail du Profil, dans le Studio. Mesuré à l'écran par Benjamin sur la
  // preview du 2026-09-01.
  //
  // ⚠️ C'est un défaut DÉJÀ trouvé et corrigé par le lot TAXO-1, et que ce lot
  // avait laissé revenir en reprenant ses données sans son correctif. Pire que
  // l'affichage : `ajouterPassionAuCompte` RECOPIE `emoji` et `color` dans
  // l'entrée qu'elle crée, donc la valeur générique était PERSISTÉE.
  //
  // ⚠️ C'est un ajout d'AFFICHAGE, et rien d'autre. `estPassionCanonique` n'est
  // pas touchée : le serveur reste seul juge de ce qui est publiable, et aucune
  // passion ne devient publiable parce qu'elle sait s'afficher.
  try {
    if (window.PassioPassions && PassioPassions.actif()) {
      var pl = PassioPassions.parId(id);
      if (pl) return { id: pl.id, emoji: pl.emoji, label: pl.label, color: pl.color };
    }
  } catch (e) {}
  return { emoji: "✨", label: "Passion", color: "#8b5cf6" };
}

// Filtre d'AFFICHAGE de la colonne jsonb `profiles.passions` (la liste des
// passions d'un compte, publiée par `supaUpsertProfile`).
//
// ⚠️ Cette colonne a DEUX rôles, et c'est ce qui a causé un défaut le 2026-08-30 :
// (a) la liste des passions montrée aux visiteurs, et (b) la sauvegarde serveur de
// MES propres passions, relue par la reconstruction du boot quand un appareil neuf
// n'a ni état local ni `user_state`. Le lot UI-8 retirait les passions archivées à
// la SOURCE pour servir (a) — ce qui vidait (b) et rendait une passion rangée
// définitivement irrécupérable après un changement de téléphone.
//
// La règle est donc : on publie TOUT (marqué `archived`), et on filtre ICI, à
// chaque endroit qui MONTRE les passions de quelqu'un. Une entrée sans marqueur
// vient d'un client antérieur au correctif : elle est considérée vivante.
// ══════════════════════════════════════════════════════════════════════════
// CLASSIFICATION DES PASSIONS (ADR-010)
// ──────────────────────────────────────────────────────────────────────────
// Une seule question — « cet identifiant existe-t-il dans le référentiel ? » —
// et des POLITIQUES distinctes par type d'objet. La clé étrangère est la même
// sur les cinq tables ; l'invariant PRODUIT, lui, ne l'est pas.
//
// AUTORITÉ. La table Supabase `passions` fait foi. Elle est en lecture publique
// (policy `passions_select_all`) et tient 19 lignes : on la charge UNE fois, en
// arrière-plan, et on la garde en cache. `PASSIONS` (app-01) sert de REPLI —
// jamais d'autorité — pour que le chargement puisse échouer sans bloquer les 19
// passions existantes.
//
// ⚠️ NI le drapeau `custom: true`, NI le préfixe `custom_` ne servent de
// discriminant. Le drapeau ne vit que dans `state.user.customPassions` et
// disparaît sur un appareil neuf (la reconstruction du boot rebâtit les profils
// depuis le jsonb `profiles.passions` sans le restaurer) : s'y fier échouerait
// précisément dans le cas qu'on cherche à traiter. Le préfixe est une liste
// NOIRE, qui ne couvre ni la sentinelle « autre », ni « test », ni la chaîne
// vide. La liste blanche rejette les quatre d'un coup.
let _referentielPassions = null;   // Set des ids réels, ou null tant qu'inconnu

// Chargement en arrière-plan. N'est JAMAIS attendu par le démarrage : tant qu'il
// n'a pas répondu, `estPassionCanonique` utilise le repli local.
function chargerReferentielPassions() {
  try {
    if (_referentielPassions) return;                       // déjà en cache
    if (typeof supa === "undefined" || !supa || !window._supaReal) return;
    supa.from("passions").select("id").then(function (r) {
      try {
        if (r && !r.error && Array.isArray(r.data) && r.data.length) {
          _referentielPassions = new Set(r.data.map(function (x) { return x && x.id; }).filter(Boolean));
        }
      } catch (e) {}
    }).catch(function () {});                                // un échec laisse le repli en place
  } catch (e) {}
}

// L'identifiant existe-t-il réellement dans le référentiel ?
// ⚠️ LE RÉFÉRENTIEL SERVEUR AJOUTE, IL NE RETRANCHE PAS. Corrigé le 2026-08-31.
//
// La première version rendait `_referentielPassions.has(id)` DÈS que le cache
// était rempli — le serveur pouvait donc RÉTRÉCIR la liste. Or `_referentielPassions`
// est un cache à UN SEUL COUP (`if (_referentielPassions) return;` ci-dessus) :
// une réponse serveur partielle — plafond `max-rows` de PostgREST, réponse
// tronquée, panne à mi-parcours — s'installait pour toute la session et
// interdisait DÉFINITIVEMENT de publier dans une passion parfaitement légitime.
// Un incident serveur passager devenait un blocage client permanent.
//
// La liste locale est donc un PLANCHER, pas un repli : la migration du
// 2026-08-15 a vérifié que ces identifiants existent réellement en production,
// et la clé étrangère empêche d'en supprimer un qui soit référencé. Le serveur
// ne peut qu'en AJOUTER — c'est le cas d'une liste locale en retard, que ce
// mécanisme sert précisément à couvrir.
//
// Et si l'un des 19 était malgré tout supprimé côté serveur (aucune ligne ne le
// référençant), l'union le laisserait passer : l'insert repartirait alors en
// 23503, que `supaPublishPostWithRetry` traite déjà comme une erreur définitive
// avec un message honnête. Un faux négatif bloque une publication vraie ; un
// faux positif ne coûte qu'un aller-retour et un message juste. L'asymétrie
// tranche.
function estPassionCanonique(id) {
  if (!id || typeof id !== "string") return false;
  try {
    if (_referentielPassions && _referentielPassions.has(id)) return true;
    if (typeof PASSIONS === "undefined" || !Array.isArray(PASSIONS)) return false;
    for (var i = 0; i < PASSIONS.length; i++) if (PASSIONS[i] && PASSIONS[i].id === id) return true;
  } catch (e) {}
  return false;
}

// Les trois états possibles, nommés une fois pour toutes.
function classerPassion(id) {
  if (id === null || id === undefined || id === "") return "null";
  return estPassionCanonique(id) ? "canonique" : "non_canonique";
}

// ── POLITIQUE : la passion est OBLIGATOIRE (posts, events) ────────────────
// `null` ET `non_canonique` sont refusés. Rend `{ ok, motif }` — l'appelant
// décide du message, car il seul sait quel geste l'utilisateur vient de faire.
function requiredCanonicalPassion(id) {
  var c = classerPassion(id);
  if (c === "canonique") return { ok: true, valeur: id };
  return { ok: false, motif: c };   // "null" | "non_canonique"
}

// ── POLITIQUE : la passion est FACULTATIVE (profiles, stories, conversations) ──
// `null` est accepté ; tout identifiant non nul DOIT être canonique, sinon il est
// normalisé en `null`. On ne bloque jamais l'écriture pour ça : l'objet a une
// raison d'exister indépendante de son classement.
function optionalCanonicalPassion(id) {
  return estPassionCanonique(id) ? id : null;
}

// ── CATALOGUE PUBLIABLE (sortie A du 2026-08-30) ──────────────────────────
// `docs/PASSION_PERSONNALISEE_FK_2026-08-30.md` : une passion absente du
// référentiel ne PEUT PAS être écrite dans `posts`/`events` — la clé étrangère
// est infranchissable côté client, la table `passions` n'exposant qu'une policy
// SELECT. On cesse donc de la PROPOSER là où elle ne peut pas aboutir.
//
// ⚠️ On ne supprime ni ne transforme AUCUNE passion personnalisée existante :
// elle reste dans `state.user.customPassions`, reste un centre d'intérêt du fil
// (le filtre de lecture est 100 % local, il fonctionne parfaitement) et reste
// affichée partout où elle est déjà posée. Seule la porte d'ÉCRITURE se ferme.
function passionsPubliables() {
  var l = (typeof allPassions === "function") ? allPassions() : [];
  return l.filter(function (p) { return p && estPassionCanonique(p.id); });
}

// La passion sous laquelle CE compte publie par défaut : l'active si elle est
// publiable, sinon la première passion vivante qui l'est. Rend `null` quand le
// compte n'en a AUCUNE — l'appelant renonce alors, il n'invente jamais.
function passionParDefautPourPublier() {
  try {
    var cp = (typeof currentProfile === "function") ? currentProfile() : null;
    if (cp && estPassionCanonique(cp.passion)) return cp.passion;
    var vivantes = (typeof passionsVivantes === "function")
      ? passionsVivantes()
      : ((state && state.user && state.user.profiles) || []);
    for (var i = 0; i < vivantes.length; i++) {
      if (vivantes[i] && estPassionCanonique(vivantes[i].passion)) return vivantes[i].passion;
    }
  } catch (e) {}
  return null;
}

// Classement d'une REPUBLICATION. Le partage est MA publication : il hérite du
// classement de la source quand celui-ci peut partir, et retombe sur le mien
// sinon (source locale rangée dans une passion personnelle, ou source sans
// passion). Il ne recopie jamais un classement qui ferait refuser l'insert.
function passionDeRepartage(source) {
  return estPassionCanonique(source) ? source : passionParDefautPourPublier();
}

// Un échec de publication n'est pas toujours un échec de RÉSEAU. Quand la cause
// est le classement, le dire — l'ancien message « connexion lente » invitait à
// retenter une opération qui ne pouvait pas aboutir (cf. le document ci-dessus).
// Rend `null` si le dernier échec n'était pas de cette nature.
// ⚠️ GARDE COMMUNE AUX PRODUCTEURS DE PUBLICATION (2026-08-31).
// À appeler AVANT toute mutation locale. Rend `true` quand la publication ne
// peut PAS aboutir, après avoir dit pourquoi et quoi faire.
//
// LE DÉFAUT QU'ELLE FERME. Les quatre producteurs — bobine, partage de bobine,
// partage de post, partage d'événement — créaient l'objet dans `state.userPosts`
// puis appelaient `supaPublishPostWithRetry`. Le garde central refusait ensuite
// la passion non canonique… mais le post était déjà là : visible chez son
// auteur, jamais arrivé au serveur, perdu au changement d'appareil. C'est
// exactement le motif de perte silencieuse que ce chantier ferme.
//
// L'invariant : si aucune passion canonique n'est disponible, AUCUNE publication
// locale optimiste n'est créée. Le refus précède la mutation, pas seulement la
// requête réseau.
function publicationRefuseeFautePassion(passion) {
  if (estPassionCanonique(passion)) return false;
  var mienne = passionParDefautPourPublier();
  toast(mienne
    ? "Choisis une passion pour publier."
    : "⚠️ Ajoute une passion du catalogue pour publier — tes passions personnelles rangent ton fil, mais on ne peut pas encore y publier.");
  return true;
}

function messageEchecPassion() {
  var c = window._passioEchecPublication;
  if (c === "passion_absente") return "⚠️ Choisis une passion avant de publier.";
  if (c === "passion_inconnue") return "⚠️ Cette passion n'existe que chez toi : elle range ton fil, mais on ne peut pas encore y publier. Choisis une passion du catalogue.";
  return null;
}

function passionsPubliques(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(function (p) { return p && p.id && !p.archived; });
}

// ══════════════════════════════════════════════════════════════════════════
// L'IDENTITÉ AFFICHÉE — un pseudo, et les passions dessous
// ──────────────────────────────────────────────────────────────────────────
// Refonte multi-passion §2 : partout où quelqu'un apparaît, on montre SON
// profil principal, et ses passions sous son pseudo :
//
//     Benjamin
//     Moto · Podcast · Voyage
//
// Un seul rendu, ici, pour toutes les surfaces (cartes de publication,
// commentaires et réponses, messages, notifications, activités, aperçus de
// profil, résultats de recherche, réactions). Chaque surface avait sa propre
// façon d'écrire un nom : c'est exactement ce qui avait fait diverger les deux
// tables de libellés de mood et les deux écrans de profil.
//
// ⚠️ TROIS RÈGLES, chacune payée par un défaut réel de ce dépôt.
//
// ① `passionsPubliques()` et JAMAIS la liste brute. Le jsonb `profiles.passions`
//    contient AUSSI les passions archivées, marquées `archived: true` — c'est
//    délibéré, la colonne sert de sauvegarde relue au démarrage d'un appareil
//    neuf. Les afficher telles quelles ferait réapparaître chez tout le monde
//    ce qu'un utilisateur a rangé (porte dérobée ② du lot UI-8).
// ② Ces libellés sont DU CONTENU D'AUTRUI : toute session authentifiée écrit
//    librement sa propre ligne `profiles`. Ils passent par `escapeHtml`.
// ③ Le rendu est BORNÉ (3 passions + « +N ») et tient sur une ligne tronquée :
//    une identité qui déborde pousse l'action à côté d'elle hors de l'écran.
var IDENT_PASSIONS_MAX = 3;

// Les passions d'un compte, telles qu'un VISITEUR a le droit de les voir.
// Trois sources, dans l'ordre de fiabilité : la liste publiée (jsonb), la
// passion principale, et — pour moi seulement — mes passions vivantes locales.
function passionsAffichables(u) {
  if (!u) return [];
  var brut = null;
  try {
    var estMoi = (u.id === "me")
      || (typeof MY_UID !== "undefined" && MY_UID && u.id === MY_UID);
    if (estMoi && typeof passionsVivantes === "function") {
      brut = passionsVivantes().map(function (p) {
        var meta = {};
        try { meta = passionById(p.passion) || {}; } catch (e) {}
        return { id: p.passion, emoji: p.emoji || meta.emoji, label: meta.label || p.passion };
      });
    }
  } catch (e) {}
  if (!brut) {
    var liste = Array.isArray(u.passions) ? u.passions : null;
    if (liste) brut = passionsPubliques(liste);
    else if (u.passion) brut = [{ id: u.passion }];
    else brut = [];
  }
  return brut.map(function (p) {
    var meta = {};
    try { meta = passionById(p.id) || {}; } catch (e) {}
    // ⚠️ L'ORDRE compte : `passionById` ne rend jamais null et retombe sur
    // `{ label: "Passion" }`. Un libellé publié par l'auteur (passion hors
    // catalogue) serait sinon définitivement inatteignable.
    var duCatalogue = (meta.label && meta.label !== "Passion") ? meta.label : "";
    return {
      id: p.id,
      emoji: p.emoji || meta.emoji || "✨",
      label: duCatalogue || p.label || "Passion",
    };
  }).filter(function (p) { return !!p.id; });
}

// « Moto · Podcast · Voyage », borné. Rend "" quand il n'y a rien à dire —
// et l'appelant ne doit alors rien peindre du tout (une ligne vide sous un
// pseudo se lit comme un chargement qui n'arrive jamais).
function identitePassionsTexte(u, max) {
  var liste = passionsAffichables(u);
  if (!liste.length) return "";
  var n = max || IDENT_PASSIONS_MAX;
  var noms = liste.slice(0, n).map(function (p) { return _passionCourteIdent(p.label); });
  if (liste.length > n) noms.push("+" + (liste.length - n));
  return noms.join(" · ");
}

// « Yoga / Bien-être » → « Yoga ». Affichage seul ; la clé métier ne bouge pas.
// (Jumelle de `_passionCourte`, app-06, qui n'est pas encore chargée ici.)
function _passionCourteIdent(label) {
  var s = String(label || "");
  var i = s.search(/\s*[\/&·]\s*/);
  return (i > 0 ? s.slice(0, i) : s).trim() || s;
}

// La ligne à poser SOUS le pseudo, ou "" s'il n'y a rien à montrer.
// `cls` permet à une surface d'ajuster sa taille sans dupliquer le rendu.
function identitePassionsHTML(u, cls) {
  var t = identitePassionsTexte(u);
  if (!t) return "";
  return '<div class="ident-passions' + (cls ? " " + escapeHtml(cls) : "") + '" title="'
    + escapeHtml(t) + '">' + escapeHtml(t) + '</div>';
}

// ══════════════════════════════════════════════════════════════════════════
// L'IDENTITÉ CLIQUABLE A ÉTÉ RETIRÉE DES DEUX EN-TÊTES DE PROFIL (2026-09-02)
// ──────────────────────────────────────────────────────────────────────────
// `identitePassionsChipsHTML`, `identitePassionsLiensHTML`, `_identPassionOnclick`
// et `IDENT_PASSIONS_MAX_PROFIL` vivaient ici. Elles rendaient, sous le pseudo,
// une rangée de pastilles ouvrant chacune `openPassionExplorer` — demande de
// Benjamin du 2026-09-01.
//
// Le 2026-09-02, le rail de passions du profil est devenu lui aussi une rangée
// de pastilles de texte (« les onglets ronds violets, c'est trop gros trop
// visible ») : le profil nommait alors les mêmes passions DEUX fois, à 5 px
// d'écart. Arbitrage de Benjamin, même jour : « on va supprimer les titres de
// passion dans le profil sous le pseudo et garder seulement les bulles
// dessous. » Les quatre fonctions n'avaient plus d'appelant : elles sont
// parties avec leurs règles CSS (`.ident-passions-links`, `.ident-passion-*`),
// plutôt que de survivre à leur cible — le piège le plus fréquent de ce dépôt.
//
// ⚠️ CE QUI RESTE, ET QU'IL NE FAUT PAS CONFONDRE : `identitePassionsHTML` /
// `identitePassionsTexte` (ci-dessus) rendent la ligne de TEXTE INERTE des
// surfaces denses — cartes de commentaire, listes de personnes, recherche,
// inbox, notifications. Elles sont toujours vivantes, et ADR-011 §3 avec elles.
//
// ⚠️ `openPassionExplorer(pid, retourUserId)` (app-07) garde son second argument
// et son lien « ← Retour au profil » alors qu'AUCUN appelant ne le passe plus.
// C'est délibéré : le jour où une porte vers la page d'une passion réapparaît
// dans une modale, l'oublier rendrait la personne introuvable (`openModal`
// n'empile pas). Le chemin est couvert par un test qui l'appelle directement,
// et il ne peut rien peindre tant que personne ne passe l'argument.
// ══════════════════════════════════════════════════════════════════════════

function userById(id) {
  if (id === "me" || (typeof MY_UID !== "undefined" && MY_UID && id === MY_UID)) {
    const p = currentProfile ? currentProfile() : null;
    const g = state.user.general || {};
    return { id, name: (g.username || p?.name || state.user.name || "Moi"), avatar: (p?.color || "#8b5cf6"), profileEmoji: (p?.emoji || "✨"), photoUrl: g.avatarPhoto || null };
  }
  return state.seed.users.find(u => u.id === id);
}

// ===== AVATARS (photo de profil partagée) =====
// Un profil peut désormais avoir une vraie photo (URL Storage, colonne
// profiles.avatar_url) en plus de l'emoji+couleur. Ces helpers centralisent le
// rendu pour que la photo se propage PARTOUT (fil, commentaires, messages,
// profils) dès qu'elle est connue. `u` = objet user/profil.
function _userPhoto(u) {
  if (!u) return null;
  return u.photoUrl || u.avatarPhoto || u.avatar_url || null;
}
// Style `background:` d'un avatar : la photo si dispo, sinon la couleur.
// URL destinée à `url('…')` DANS un attribut style. Le contenu vient de `profiles`
// d'un AUTRE utilisateur : une apostrophe suffisait à refermer l'url(), puis
// l'attribut style, puis à ouvrir un gestionnaire d'événement. Politique de schéma
// (comme safeUrlAttr) + neutralisation de tout ce qui peut refermer quoi que ce soit.
function _cssUrl(u) {
  const s = String(u || "").trim();
  // data:image en base64 : l'alphabet est clos, rien à neutraliser — mais on exige
  // la forme exacte, sinon on refuse (un « data:image/x;… » libre serait un vecteur).
  if (/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(s)) return s;
  if (!/^(https?:\/\/|blob:)/i.test(s)) return null;
  return s.replace(/[()'"\\<>;\s]/g, function (c) {
    return "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
  });
}
// Couleur/dégradé posé dans un attribut style. Même origine, même exigence : on
// refuse tout ce qui permettrait de sortir de la déclaration ou d'aller chercher
// une ressource externe.
function _cssColor(c) {
  const s = String(c || "").trim();
  if (!s || /["'<>;{}]|url\s*\(|expression\s*\(|@import/i.test(s)) return "#8b5cf6";
  return s;
}
// Style `background:` d'un avatar : la photo si dispo, sinon la couleur.
function avatarBg(u) {
  const ph = _userPhoto(u);
  const safe = ph ? _cssUrl(ph) : null;
  if (safe) return "url('" + safe + "') center/cover";
  return _cssColor((u && (u.avatar || u.color)) || "#8b5cf6");
}
// Contenu interne d'un avatar : rien si photo (elle remplit le fond), sinon emoji.
// ⚠️ La valeur est insérée telle quelle en HTML par ses 38 appelants : c'est ICI
// qu'il faut échapper. `profiles.emoji` est un champ libre — un utilisateur pouvait
// y placer `<img src=x onerror=…>` et le faire exécuter chez quiconque le croisait.
function avatarInner(u) {
  if (_userPhoto(u)) return "";
  const raw = (u && (u.profileEmoji || u.emoji)) || ((u && u.name && u.name[0]) || "?");
  return escapeHtml(raw);
}

// Met en cache / rafraîchit un profil DISTANT dans state.seed.users à partir
// d'une ligne `profiles` Supabase (id, username, emoji, color, avatar_url…).
// → userById() renvoie alors les infos fraîches (photo comprise) et toute modif
// d'un autre utilisateur se propage à l'écran au prochain rendu.
function cacheRemoteProfile(p) {
  if (!p || !p.id) return;
  if (typeof MY_UID !== "undefined" && p.id === MY_UID) return; // « moi » = currentProfile
  state.seed.users = state.seed.users || [];
  const entry = {
    id: p.id,
    name: p.username || "Passionné",
    avatar: p.color || "#8b5cf6",
    profileEmoji: p.emoji || "✨",
    photoUrl: p.avatar_url || null,
    passion: p.passion_id || undefined,
    // ⚠️ Sans cette ligne, l'identité partagée (§2) n'aurait de passions à
    // montrer que sur le profil visité — la seule surface qui les chargeait.
    // Elles sont filtrées ici, à l'entrée : `passionsPubliques` retire les
    // passions archivées, qui vivent dans ce jsonb comme sauvegarde.
    passions: Array.isArray(p.passions) ? passionsPubliques(p.passions) : undefined,
    bio: p.bio || "",
  };
  const i = state.seed.users.findIndex(u => u.id === p.id);
  if (i >= 0) state.seed.users[i] = { ...state.seed.users[i], ...entry };
  else state.seed.users.push(entry);
}

function currentProfile() {
  return state.user.profiles.find(p => p.id === state.user.currentProfileId) || state.user.profiles[0];
}

// ===== IDENTITÉ D'EXPÉDITEUR PAR MESSAGE =====
// La table `profiles` n'a qu'UNE ligne par compte (id = MY_UID) : le destinataire
// dérive le nom de l'expéditeur de cette ligne. Or l'utilisateur peut écrire
// depuis plusieurs profils/personas locaux (ex. « ben123 » alors que le compte
// s'appelle « benjamin »). On attache donc l'identité du PROFIL ACTIF à chaque
// message sortant pour que le destinataire voie le bon profil, sans dépendre de
// la ligne `profiles` partagée. Champs courts pour limiter la taille en DB.
function _msgSenderMeta() {
  try {
    var prof = currentProfile() || {};
    var g = (state.user && state.user.general) || {};
    // Identité d'expéditeur CENTRALISÉE : on envoie le pseudo général (un seul
    // nom public pour toutes les passions), pas le nom du profil-passion actif.
    var _isDefaultName = function(n) { return !n || n === "Passionné" || n === "Profil"; };
    var _n = [g.username, (state.user && state.user.name), prof.name].find(function(x){ return !_isDefaultName(x); }) || "Profil";
    return {
      n: _n,
      e: prof.emoji || "✨",
      c: prof.color || "#8b5cf6",
      pid: (state.user && state.user.currentProfileId) || null,
      ph: (typeof g.avatarPhoto === "string" && /^https?:\/\//.test(g.avatarPhoto)) ? g.avatarPhoto : null,
    };
  } catch (e) { return null; }
}

// Injecte l'identité de l'expéditeur dans le `content` d'un message sortant.
// - content déjà JSON (média/gif/doc/location) → ajoute le champ `sp`
// - texte brut → enveloppe en {type:"text", text, sp}
// Décodé côté réception par applyMsgContentData() (champ `sp`).
function _withSenderMeta(content) {
  var sp = _msgSenderMeta();
  if (!sp) return content;
  if (typeof content === "string" && content.trim().charAt(0) === "{") {
    try { var d = JSON.parse(content); if (d && d.type) { d.sp = sp; return JSON.stringify(d); } } catch (e) {}
  }
  return JSON.stringify({ type: "text", text: (content == null ? "" : String(content)), sp: sp });
}

// Prix d'une activité, en euros. Seule fonction autorisée à écrire un prix à
// l'écran : elle tient le cas « gratuit » (0, vide, absent, non numérique) et
// évite les décimales inutiles — « 12 € », mais « 12,50 € » quand il y en a.
// ⚠️ ADR-009 : les prix étaient libellés en Passia (💎) tant que l'économie
// interne existait. Un prix est désormais une somme RÉELLE en euros ; ne jamais
// y remettre de jeton interne, et ne jamais concaténer « + " €" » à la main —
// c'est ce qui laissait passer « 12.5 € » et « NaN € ».
function fmtEventPrice(price) {
  const n = Number(price);
  if (price === null || price === undefined || price === "" || !isFinite(n) || n <= 0) return "Gratuit 🎉";
  const txt = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
  return txt + "\u00a0€";
}

// ======== TOAST ========
function toast(msg, type = "info", onClick = null) {
  const stack = $("#toastStack");
  const t = document.createElement("div");
  t.className = "toast " + (type || "");
  t.textContent = msg;
  if (typeof onClick === "function") {
    t.classList.add("clickable");
    t.setAttribute("role", "button");
    t.addEventListener("click", () => { t.remove(); try { onClick(); } catch (e) {} });
  }
  stack.appendChild(t);
  // Les toasts cliquables restent un peu plus longtemps pour laisser le temps de cliquer.
  setTimeout(() => t.remove(), onClick ? 6000 : 3000);
}

// ======== RÉCOMPENSES — RETIRÉES (ADR-009) ========
// Le Wallet, les points, les rangs et les Passia sont sortis du cœur produit.
// `grantReward`, `awardLikeReceived`, `rewardToast`, `rankOf` et `checkRankUp`
// ont été supprimés avec l'intégralité de leurs sites d'appel : publier,
// commenter, aimer, rejoindre un événement ou créer un profil ne rapporte plus
// rien. Ne PAS réintroduire d'économie interne sans rouvrir l'ADR-009.

// ======== NAVIGATION ========
// Historique de navigation pour le bouton back du téléphone
let navigationHistory = ["feed"];
let isNavigatingBack = false;

// ═══════════════════════════════════════════════════════════════════════════
// HISTORIQUE : écriture SÛRE et BORNÉE (correctif iPhone, 2026-09-02)
// ---------------------------------------------------------------------------
// Deux défauts distincts, tous deux invisibles sur Android, tous deux vécus par
// le testeur iPhone (« les écrans se figent », « les retours ne marchent pas ») :
//
// ① WebKit PLAFONNE les écritures d'historique — environ 100 `pushState` /
//    `replaceState` par tranche de 30 s — et, au-delà, il LÈVE une
//    `SecurityError`. Chrome, lui, se contente d'ignorer. Or `goTo()` écrivait
//    l'historique en TÊTE de fonction, sans `try` : passé le plafond, l'appel
//    levait et TOUT le reste de `goTo` était sauté — bascule d'écran, classes
//    `.nav-item`, remise à zéro du défilement, rendu. L'écran restait donc
//    figé sur son contenu précédent, et chaque tap suivant levait à son tour.
//    C'est exactement le symptôme « l'écran se fige » — et il n'existe QUE sur
//    iPhone. On enveloppe donc toute écriture, et on s'arrête AVANT le plafond
//    (l'entrée d'historique est un confort ; `navigationHistory` reste, lui, la
//    vraie mémoire de navigation de l'application).
//
// ② Chaque overlay (modale, bobines, story, panneau d'outils) POUSSAIT une
//    entrée à l'ouverture, mais AUCUN ne la retirait à la fermeture au doigt
//    (× , fond, Échap). Ouvrir puis fermer cinq modales laissait cinq entrées
//    mortes : il fallait cinq retours pour que quoi que ce soit bouge. Sur
//    iPhone le geste de retour depuis le bord est le chemin principal, d'où
//    « les retours de page ne fonctionnent pas ». `releaseOverlayHistory()`
//    consomme l'entrée quand l'overlay est fermé autrement que par un retour.
// ═══════════════════════════════════════════════════════════════════════════

// Horodatages des écritures d'historique récentes (fenêtre glissante de 30 s).
let _histWrites = [];
const _HIST_MAX = 90;              // marge sous le plafond WebKit (~100 / 30 s)

function _histQuotaOk() {
  const now = Date.now();
  // Purge tout ce qui est sorti de la fenêtre de 30 s.
  while (_histWrites.length && now - _histWrites[0] > 30000) _histWrites.shift();
  return _histWrites.length < _HIST_MAX;
}

// Écrit une entrée d'historique. Renvoie true si elle a VRAIMENT été posée —
// l'appelant peut ainsi tenir une comptabilité juste des entrées à reprendre.
// Ne lève JAMAIS : une écriture d'historique refusée ne doit pas pouvoir
// interrompre la fonction qui l'appelle (c'est tout le défaut ① ci-dessus).
function pushHistorySafe(stateObj, hash) {
  if (!_histQuotaOk()) return false;
  try {
    window.history.pushState(stateObj, "", hash);
    _histWrites.push(Date.now());
    return true;
  } catch (e) {
    // Plafond atteint malgré la marge, ou navigation en cours : on note l'essai
    // pour se calmer, et on continue sans historique plutôt que de tout casser.
    _histWrites.push(Date.now());
    try { console.warn("[nav] pushState refusé:", e && e.message); } catch (e2) {}
    return false;
  }
}

// Même précaution pour `replaceState`, soumis au MÊME plafond WebKit que
// `pushState` (les deux partagent le compteur de WebKit) et qui lève donc dans
// les mêmes conditions.
function replaceHistorySafe(stateObj, hash) {
  if (!_histQuotaOk()) return false;
  try {
    window.history.replaceState(stateObj, "", hash);
    _histWrites.push(Date.now());
    return true;
  } catch (e) {
    _histWrites.push(Date.now());
    return false;
  }
}

// ─── Entrées d'historique posées par les overlays ──────────────────────────
let _navOverlayDepth = 0;       // combien d'entrées d'overlay sont à nous
let _navClosingFromPop = false; // vrai pendant le traitement d'un popstate
let _navExpectingBack = 0;      // retours que NOUS avons déclenchés
let _releasePending = false;    // une reprise d'entrée est programmée
let _releaseTimer = null;

// Ouverture d'un overlay : une entrée, marquée comme nôtre.
function pushOverlayHistory(kind, hash) {
  const url = hash || ("#" + kind);
  // ⚠️ Cas « une modale en remplace une autre » (openModal n'empile pas, cf.
  // CLAUDE.md) : le code fait `closeModal(); openModal(...)`. La reprise de
  // l'entrée précédente est encore PROGRAMMÉE — on l'annule et on RÉUTILISE
  // l'entrée courante au lieu d'en empiler une seconde. Sans cela, remplacer
  // une modale laissait une entrée orpheline, donc un appui « retour » mort.
  // ⚠️ `_navOverlayDepth > 0` est indispensable : sans lui, une reprise armée
  // puis rendue caduque par une navigation ferait RÉÉCRIRE l'entrée d'écran.
  if (_releasePending && _navOverlayDepth > 0) {
    cancelOverlayRelease();
    if (replaceHistorySafe({ overlay: kind, passioOverlay: true }, url)) return;
  }
  cancelOverlayRelease();
  if (pushHistorySafe({ overlay: kind, passioOverlay: true }, url)) _navOverlayDepth++;
}

// Fermeture d'un overlay AUTREMENT que par un retour : on consomme l'entrée
// qu'il avait posée, sinon elle reste morte sur la pile et avale un retour.
// Différée d'un tour de boucle pour laisser le cas « remplacement » ci-dessus
// s'exprimer — l'utilisateur ne peut pas appuyer sur retour entre-temps.
// Abandonne une reprise programmée SANS reculer : appelée quand les entrées
// d'overlay ne sont de toute façon plus au sommet de la pile (une navigation
// vient de pousser par-dessus). Reculer alors ferait quitter l'écran.
function cancelOverlayRelease() {
  _releasePending = false;
  clearTimeout(_releaseTimer);
  _releaseTimer = null;
}

function releaseOverlayHistory() {
  // Fermeture DÉCLENCHÉE par un popstate : l'entrée vient déjà d'être retirée
  // par le navigateur, la reprendre ferait reculer d'un cran de trop.
  if (_navClosingFromPop) return;
  if (_navOverlayDepth <= 0) return;
  _releasePending = true;
  clearTimeout(_releaseTimer);
  _releaseTimer = setTimeout(_flushOverlayRelease, 0);
}

function _flushOverlayRelease() {
  _releaseTimer = null;
  if (!_releasePending) return;
  _releasePending = false;
  if (_navOverlayDepth <= 0) return;
  // L'entrée n'est à reprendre que si elle est encore AU SOMMET. Si autre chose
  // a poussé par-dessus entre-temps (une navigation, un autre overlay), reculer
  // ferait quitter l'écran courant : on abandonne la comptabilité, sans risque.
  let st = null;
  try { st = window.history.state; } catch (e) {}
  if (!st || !st.passioOverlay) { _navOverlayDepth = 0; return; }
  _navOverlayDepth--;
  _navExpectingBack++;
  try {
    window.history.back();
    // Filet : si aucun popstate n'arrive, on relâche le compteur plutôt que de
    // laisser un retour coincé pour le reste de la session.
    setTimeout(function () { if (_navExpectingBack > 0) _navExpectingBack--; }, 400);
  } catch (e) { _navExpectingBack--; }
}

// ═══════════════════════════════════════════════════════════════════════════
// VERROU DE DÉFILEMENT — COMPTÉ PAR PROPRIÉTAIRE (correctif iPhone 2026-09-02)
// ---------------------------------------------------------------------------
// `document.body.style.overflow` est une ressource UNIQUE que plusieurs
// overlays se disputaient : chacun posait `"hidden"` à l'ouverture et écrivait
// `""` à la fermeture. Deux conséquences, toutes deux vécues comme « l'écran
// est figé » :
//   · l'overlay du DESSUS, en se fermant, DÉVERROUILLAIT le défilement alors
//     que celui du dessous était encore affiché ;
//   · à l'inverse, une exception avant la ligne de libération (ou un chemin de
//     fermeture qui l'oubliait) laissait le verrou posé POUR TOUJOURS — plus
//     rien ne défilait, et aucune erreur n'apparaissait à l'écran.
// On compte donc les propriétaires : le défilement ne revient qu'au dernier
// parti. Un même propriétaire ne peut pas verrouiller deux fois (idempotent),
// sinon un double appel d'ouverture rendrait la libération impossible.
const _scrollLockOwners = new Set();

function lockBodyScroll(owner) {
  _scrollLockOwners.add(owner || "anon");
  try { document.body.style.overflow = "hidden"; } catch (e) {}
}
function unlockBodyScroll(owner) {
  _scrollLockOwners.delete(owner || "anon");
  if (_scrollLockOwners.size === 0) {
    try { document.body.style.overflow = ""; } catch (e) {}
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTAGE — UN ÉCHEC NE DOIT PAS ÊTRE SILENCIEUX (correctif iPhone 2026-09-02)
// ---------------------------------------------------------------------------
// Les six points de partage appelaient `navigator.share(...).catch(() => {})`
// — et l'un d'eux (partage du profil, app-06) n'avait AUCUN `catch`. Deux
// défauts, tous deux bien plus fréquents sur iPhone que sur Android :
//   · `navigator.share` EXISTE sur iOS mais peut refuser — activation
//     utilisateur consommée, feuille de partage déjà ouverte, contexte non
//     sécurisé. Le `catch` vide transformait ce refus en « je tape sur Partager
//     et il ne se passe rien », sans repli et sans message ;
//   · sans `catch` du tout, une simple ANNULATION par l'utilisateur (geste très
//     courant) produisait une promesse rejetée non gérée, remontée dans la
//     table `client_errors` par le moniteur de platform.js — du bruit qui
//     enterre les vraies erreurs.
// Ici : l'annulation est silencieuse (c'est un choix de l'utilisateur, pas une
// panne), tout autre échec retombe sur la copie du lien, et l'absence des DEUX
// mécanismes se dit à l'écran plutôt que de ne rien faire.
//
// ⚠️ À appeler SYNCHRONEMENT depuis le gestionnaire de clic : sur iOS, un
// `await` avant `navigator.share` consomme l'activation utilisateur et l'appel
// est alors refusé.
// ═══════════════════════════════════════════════════════════════════════════
function partagerOuCopier(data, msgCopie) {
  const url = (data && data.url) || "";
  const texteCopie = data && data.text ? (data.text + "\n" + url) : url;
  const copier = function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texteCopie).then(
        function () { toast(msgCopie || "🔗 Lien copié"); },
        function () { toast("Lien : " + url); }
      );
    } else {
      toast("Lien : " + url);
    }
  };
  if (!navigator.share) { copier(); return; }
  try {
    const p = navigator.share(data);
    if (p && typeof p.catch === "function") {
      p.catch(function (e) {
        // Annulation volontaire : rien à dire, rien à remonter.
        if (e && (e.name === "AbortError" || e.name === "NotAllowedError" && /abort/i.test(e.message || ""))) return;
        copier();
      });
    }
  } catch (e) {
    copier();   // `share` a levé de façon synchrone (contexte non sécurisé…)
  }
}

// Ajouter un overlay/modal à l'historique de navigation
function pushOverlayToHistory(overlayType, overlayId = "") {
  const state = { overlay: overlayType, id: overlayId, passioOverlay: true };
  const hash = overlayId ? `#${overlayType}-${overlayId}` : `#${overlayType}`;
  if (pushHistorySafe(state, hash)) _navOverlayDepth++;
}

function goTo(screen) {
  // ADR-009 : l'écran Wallet n'existe plus. Un ancien lien, un deep link `#wallet`
  // ou un raccourci mémorisé doit mener à une destination valide plutôt qu'à un
  // écran blanc (aucun `#screen-wallet` ne peut plus recevoir la classe active).
  if (screen === "wallet" || screen === "shop") screen = "profiles";
  // Refonte multi-passion §6 : l'écran « Carnets de voyage » n'existe plus. Même
  // raison, même remède qu'ADR-009 — un ancien deep link `#cdv`, un raccourci
  // mémorisé ou une notification de carnet ne doit jamais laisser l'application
  // sans écran actif. On renvoie au fil, la destination neutre.
  if (screen === "cdv") screen = "feed";
  // Fermer le panneau d'outils contextuel s'il était ouvert (on change d'écran).
  if (window.ContextualTools && ContextualTools.isOpen()) ContextualTools.close();
  // Ajouter à l'historique seulement si ce n'est pas un retour en arrière
  if (!isNavigatingBack) {
    // Ne pas ajouter si c'est le même écran
    if (navigationHistory[navigationHistory.length - 1] !== screen) {
      navigationHistory.push(screen);
      // Limiter l'historique à 20 écrans
      if (navigationHistory.length > 20) {
        navigationHistory.shift();
      }
    }
    // Utiliser l'History API pour le bouton back.
    // ⚠️ JAMAIS d'appel nu ici : sur iPhone, passé le plafond WebKit, `pushState`
    // LÈVE — et tout ce qui suit (bascule d'écran, rendu) était sauté, laissant
    // l'écran figé. `pushHistorySafe` absorbe le refus et laisse `goTo` finir.
    pushHistorySafe({ screen }, "#" + screen);
    // On change d'écran : les entrées d'overlay encore comptées sont derrière
    // nous, plus au sommet. Les oublier évite qu'une fermeture ultérieure ne
    // fasse reculer hors de l'écran courant. ⚠️ Et il faut aussi DÉSARMER une
    // reprise déjà programmée : sans cela, une modale ouverte dans la foulée
    // (`goTo(...); openModal(...)`, cas des liens profonds) la prendrait pour
    // un remplacement et ÉCRASERAIT l'entrée d'écran qu'on vient de poser.
    _navOverlayDepth = 0;
    cancelOverlayRelease();
  }

  $$(".nav-item").forEach(n => {
    const is = n.getAttribute("data-screen") === screen;
    n.classList.toggle("active", is);
    // aria-current expose l'onglet actif aux lecteurs d'écran (annonce « actuel »).
    if (is) n.setAttribute("aria-current", "page");
    else n.removeAttribute("aria-current");
  });
  // Une aide contextuelle est ancrée à un élément de l'écran qu'on quitte :
  // la laisser flotter sur l'écran suivant n'aurait aucun sens (spec §8).
  try { fermerHint(); } catch (e) {}
  // Fil fenêtré : mémoriser l'ancre AVANT de masquer l'écran — une carte dans un
  // écran inactif n'a plus de rectangle mesurable. Et démonter l'observateur en
  // quittant, pour qu'aucun ne survive à la navigation.
  var _quitteFil = document.getElementById("screen-feed");
  if (_quitteFil && _quitteFil.classList.contains("active") && screen !== "feed") {
    try { feedWindowRememberScroll(); feedWindowTeardown(); } catch (e) {}
  }

  $$(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById("screen-" + screen);
  if (el) el.classList.add("active");
  $("#appMain").scrollTop = 0;
  document.body.classList.toggle("screen-feed-active", screen === "feed");

  // Première visite : le module pose ses indications contextuelles au bon moment
  // (étape « Rencontrer » à la première ouverture de l'IRL) et arme
  // `_passioIrlSkipGeoOnce` pour qu'aucune position ne soit demandée
  // implicitement. Inerte quand le drapeau est coupé ou qu'un compte existe.
  //
  // ⚠️ APPELÉ AVANT le rendu, pas après. Le marqueur anti-géolocalisation est à
  // usage unique et c'est `renderIRL` qui le CONSOMME : posé après la ligne
  // ci-dessous, il arrivait trop tard pour le premier rendu — celui qui compte,
  // puisque c'est là que la position aurait été demandée. Le lot UI-4A0 masquait
  // ce défaut en armant le même marqueur dans son enveloppe de `renderIRL` ;
  // couper ce lot l'aurait rouvert, sans le moindre symptôme visible.
  try { if (window.PassioFirstRun) PassioFirstRun.surNavigation(screen); } catch(_) {}

  // Re-render dynamic screens on navigate
  if (screen === "feed")     { renderFeed(); try { feedWindowRestoreScroll(); } catch (e) {} }
  if (screen === "profiles") renderProfilesScreen();
  if (screen === "studio")   renderStudio();
  if (screen === "explore")  { renderExplorer(); setTimeout(renderAiHistory, 50); }
  if (screen === "irl")      renderIRL();
  if (screen === "messages") renderMessages();

  // Analytics navigation (fire-and-forget, silencieux)
  try { if (typeof supaTrack === "function") supaTrack("screen_view", { screen: screen }); } catch(_) {}
}

// Fonction générique pour fermer les overlays
function closeCurrentOverlay() {
  // Panneau d'outils contextuel (IRL/CDV…) : priorité haute pour que le bouton
  // retour et Escape le ferment avant tout le reste.
  if (window.ContextualTools && ContextualTools.isOpen()) {
    ContextualTools.close();
    return true;
  }
  // Vérifier et fermer les overlays dans cet ordre de priorité
  if (reelsState && reelsState.open) {
    closeReels();
    return true;
  }
  if (document.getElementById("modalBackdrop") && document.getElementById("modalBackdrop").classList.contains("active")) {
    closeModal();
    return true;
  }
  if (document.getElementById("storyViewer") && document.getElementById("storyViewer").classList.contains("active")) {
    closeStoryViewer();
    return true;
  }

  // ⚠️ LES QUATRE GRANDS PANNEAUX PLEIN ÉCRAN (corrigé le 2026-09-02).
  // Ce qu'il y avait ici interrogeait `eventDetail`, `postDetail`,
  // `profileDetail` et `commentsPanel` : AUCUN de ces identifiants n'existe
  // dans index.html. La branche était morte et n'a jamais rien fermé — le
  // bouton retour et le geste de retour depuis le bord tombaient donc dans le
  // `goTo(écran)` qui suit, et l'écran changeait SOUS un panneau
  // `position:fixed; inset:0` resté affiché. Vu de l'utilisateur : le panneau
  // est figé, et un second retour quitte l'application. Sur iPhone c'est le
  // chemin principal, et en PWA installée aucun bouton du navigateur ne
  // rattrape le coup.
  //
  // L'ordre suit le z-index DÉCROISSANT : on ferme toujours ce qui est
  // au-dessus. mediaEditor (4000) · conv-fullpage (1200) · eventDetailPage et
  // postDetailPage (200). Les couches supérieures (modale 10001, bobines 9999,
  // stories, panneau d'outils) sont déjà traitées plus haut.
  // ⚠️ L'APPEL EN COURS EST UN CAS À PART. Il recouvre tout (z-index 100000).
  // Sans entrée d'historique, un geste de retour QUITTAIT l'application en plein
  // appel. Mais raccrocher sur un balayage accidentel serait pire encore : on
  // CONSOMME donc le retour sans rien démonter, en reposant une entrée. C'est le
  // comportement des applications d'appel natives — on ne « revient pas en
  // arrière » depuis un appel, et on ne le coupe pas non plus par mégarde.
  // Raccrocher reste un geste explicite (le bouton 📵).
  const appel = document.getElementById("callOverlay");
  if (appel && appel.classList.contains("active")) {
    if (typeof pushHistorySafe === "function") pushHistorySafe({ overlay: "call", passioOverlay: true }, "#appel");
    return true;
  }

  // Carte plein écran de « Rencontrer » : `position: fixed; inset: 0` (z 9000).
  const carte = document.getElementById("irlMapWrap");
  if (carte && carte.classList.contains("fullscreen")) {
    if (typeof toggleIrlMapFullscreen === "function") toggleIrlMapFullscreen();
    else carte.classList.remove("fullscreen");
    return true;
  }

  // Panneau de filtres historique de « Rencontrer », plein écran lui aussi.
  const filtres = document.getElementById("irlFiltersPanel");
  if (filtres && filtres.style.display === "block") {
    if (typeof closeIrlFiltersPanel === "function") closeIrlFiltersPanel();
    else filtres.style.display = "none";
    return true;
  }

  const editeurMedia = document.getElementById("mediaEditor");
  if (editeurMedia && editeurMedia.classList.contains("open")) {
    // meClose() coupe aussi la caméra et l'enregistrement en cours : sortir de
    // ce panneau sans lui laisserait l'objectif actif en arrière-plan.
    if (typeof meClose === "function") meClose(); else editeurMedia.classList.remove("open");
    return true;
  }

  const convPleinePage = document.getElementById("conv-fullpage");
  if (convPleinePage && convPleinePage.classList.contains("active")) {
    if (typeof closeConversation === "function") closeConversation();
    else convPleinePage.classList.remove("active");
    return true;
  }

  const ficheActivite = document.getElementById("eventDetailPage");
  if (ficheActivite && ficheActivite.style.display !== "none" && ficheActivite.style.display !== "") {
    if (typeof closeEventDetail === "function") closeEventDetail();
    else ficheActivite.style.display = "none";
    return true;
  }

  const pagePost = document.getElementById("postDetailPage");
  if (pagePost && pagePost.style.display !== "none" && pagePost.style.display !== "") {
    if (typeof closePost === "function") closePost(); else pagePost.style.display = "none";
    return true;
  }

  return false;
}

// Écrans réels vers lesquels un hash peut légitimement ramener.
const NAV_SCREENS = ["feed", "profiles", "studio", "explore", "irl", "messages"];

// Gérer le bouton back du téléphone (et le geste de retour depuis le bord, qui
// est LE chemin de retour sur iPhone).
window.addEventListener("popstate", (e) => {
  // ① Retour que NOUS avons déclenché en refermant un overlay au doigt : son
  //    entrée vient d'être consommée, il n'y a plus rien à faire. Sans ce
  //    garde, on enchaînerait sur un `goTo` inutile qui re-rendrait l'écran.
  if (_navExpectingBack > 0) { _navExpectingBack--; return; }

  // ② D'abord, essayer de fermer un overlay ouvert.
  _navClosingFromPop = true;
  let ferme = false;
  try {
    ferme = closeCurrentOverlay();
  } catch (err) {
    // Un overlay qui lève en se fermant ne doit pas rendre le bouton retour
    // inerte pour le reste de la session.
    try { console.warn("[nav] fermeture d'overlay:", err); } catch (e2) {}
  } finally {
    _navClosingFromPop = false;
  }
  if (ferme) {
    if (_navOverlayDepth > 0) _navOverlayDepth--;
    return;
  }

  // ③ Sinon, naviguer vers l'écran précédent.
  if (e.state && e.state.screen) {
    isNavigatingBack = true;
    try { goTo(e.state.screen); } finally { isNavigatingBack = false; }
    return;
  }

  // ④ Repli : entrée SANS état — le chargement initial de la page, ou un lien
  //    profond partagé. Sans lui, ce retour ne faisait RIEN : le premier écran
  //    visité était un cul-de-sac, un appui mort de plus. On suit le hash quand
  //    il nomme un écran réel, sinon on ramène au Fil, qui est l'accueil.
  //    ⚠️ Aucune entrée n'est poussée (isNavigatingBack) : la position dans
  //    l'historique reste donc l'entrée initiale, et un retour de plus quitte
  //    bien l'application — c'est le comportement attendu.
  let h = "";
  try { h = (location.hash || "").replace(/^#/, ""); } catch (e2) {}
  const cible = NAV_SCREENS.indexOf(h) >= 0 ? h : "feed";
  isNavigatingBack = true;
  try { goTo(cible); } finally { isNavigatingBack = false; }
});

function toggleDevPanel() {
  var panel = $("#devPanel");
  if (!panel) return;
  panel.classList.toggle("active");
  if (panel.classList.contains("active")) { try { majSectionCompte(); } catch (e) {} }
}

/* Le panneau Paramètres est du balisage STATIQUE : ses deux entrées de compte
   n'ont de sens qu'au regard de l'état de connexion, qui n'est connu qu'à
   l'ouverture. Sans cette mise à jour, un visiteur du parcours de première
   visite lisait « Se déconnecter » — sans effet utile pour lui, puisqu'il n'a
   pas de compte — et ne trouvait NULLE PART comment se connecter à un compte
   déjà créé. Défaut vécu le 2026-09-02 : « je n'arrive plus à me connecter
   avec le compte qui était déjà créé avant ». */
function majSectionCompte() {
  var visiteur = false;
  try { visiteur = !!(window.PassioFirstRun && PassioFirstRun.estVisiteur()); } catch (e) {}
  var bascule = document.getElementById("settingsAuthSwitch");
  if (bascule) {
    bascule.textContent = visiteur
      ? "🔑 J'ai déjà un compte — me connecter"
      : "🔄 Se connecter avec un autre compte";
  }
  // ⚠️ ET TOUT CE QUI SUPPOSE UN COMPTE PART AVEC, pas seulement l'entrée qui a
  // motivé ce correctif : « Se déconnecter » n'a rien à déconnecter, « Changer
  // mon mot de passe » appelle `supa.auth.updateUser` sans session, et
  // « Supprimer mon compte » propose d'effacer ce qui n'existe pas. Même classe
  // de défaut que celui qu'on vient de corriger, au même endroit.
  ["settingsLogout", "settingsChangePassword", "settingsDeleteAccount"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = visiteur ? "none" : "";
  });
}

function toggleSettingsSection(el) {
  var wasOpen = el.classList.contains("open");
  // Fermer toutes les sections
  document.querySelectorAll(".settings-section").forEach(function(s) { s.classList.remove("open"); });
  // Ouvrir celle-ci si elle était fermée
  if (!wasOpen) el.classList.add("open");
}

// ===== PARAMÈTRES COMPLETS =====
function openNotifSettings() {
  var cfg = getCurrentConfig();
  var notifs = cfg.notifs || { posts: true, messages: true, likes: true, events: true, system: true };
  openModal('\
    <div class="modal-handle"></div>\
    <div class="modal-title">🔔 Notifications</div>\
    <p style="font-size:12px;color:var(--muted);margin-bottom:14px;">Choisis ce qui te notifie</p>\
    <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);"><span style="font-size:13px;">📝 Nouveaux posts</span><input type="checkbox" id="notifPosts" ' + (notifs.posts ? 'checked' : '') + ' style="width:20px;height:20px;accent-color:var(--accent);"></label>\
    <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);"><span style="font-size:13px;">💬 Messages</span><input type="checkbox" id="notifMessages" ' + (notifs.messages ? 'checked' : '') + ' style="width:20px;height:20px;accent-color:var(--accent);"></label>\
    <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);"><span style="font-size:13px;">❤️ Likes & commentaires</span><input type="checkbox" id="notifLikes" ' + (notifs.likes ? 'checked' : '') + ' style="width:20px;height:20px;accent-color:var(--accent);"></label>\
    <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);"><span style="font-size:13px;">🤝 Événements IRL</span><input type="checkbox" id="notifEvents" ' + (notifs.events ? 'checked' : '') + ' style="width:20px;height:20px;accent-color:var(--accent);"></label>\
    <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;"><span style="font-size:13px;">🔧 Système</span><input type="checkbox" id="notifSystem" ' + (notifs.system ? 'checked' : '') + ' style="width:20px;height:20px;accent-color:var(--accent);"></label>\
    <button class="btn primary block" onclick="saveNotifSettings()" style="margin-top:14px;">Sauvegarder</button>\
  ');
}
function saveNotifSettings() {
  var cfg = getCurrentConfig();
  cfg.notifs = { posts: document.getElementById("notifPosts").checked, messages: document.getElementById("notifMessages").checked, likes: document.getElementById("notifLikes").checked, events: document.getElementById("notifEvents").checked, system: document.getElementById("notifSystem").checked };
  saveConfig(cfg); closeModal(); toast("🔔 Notifications mises à jour");
}

function openPrivacySettings() {
  var cfg = getCurrentConfig();
  var priv = cfg.privacy || { profilePublic: true, showOnline: true, allowMessages: "everyone", showActivity: true };
  openModal('\
    <div class="modal-handle"></div>\
    <div class="modal-title">🔒 Confidentialité</div>\
    <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);"><span style="font-size:13px;">👁 Profil public</span><input type="checkbox" id="privPublic" ' + (priv.profilePublic ? 'checked' : '') + ' style="width:20px;height:20px;accent-color:var(--accent);"></label>\
    <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);"><span style="font-size:13px;">🟢 Afficher en ligne</span><input type="checkbox" id="privOnline" ' + (priv.showOnline ? 'checked' : '') + ' style="width:20px;height:20px;accent-color:var(--accent);"></label>\
    <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);"><span style="font-size:13px;">📊 Afficher mon activité</span><input type="checkbox" id="privActivity" ' + (priv.showActivity ? 'checked' : '') + ' style="width:20px;height:20px;accent-color:var(--accent);"></label>\
    <div style="padding:12px 0;"><span style="font-size:13px;">💬 Qui peut m\'écrire ?</span>\
      <select id="privMessages" style="display:block;width:100%;margin-top:6px;padding:10px;border-radius:10px;border:1.5px solid var(--border);font-size:16px;">\
        <option value="everyone" ' + (priv.allowMessages === "everyone" ? "selected" : "") + '>Tout le monde</option>\
        <option value="followers" ' + (priv.allowMessages === "followers" ? "selected" : "") + '>Mes abonnés</option>\
        <option value="nobody" ' + (priv.allowMessages === "nobody" ? "selected" : "") + '>Personne</option>\
      </select></div>\
    <button class="btn primary block" onclick="savePrivacySettings()" style="margin-top:14px;">Sauvegarder</button>\
  ');
}
function savePrivacySettings() {
  var cfg = getCurrentConfig();
  cfg.privacy = { profilePublic: document.getElementById("privPublic").checked, showOnline: document.getElementById("privOnline").checked, showActivity: document.getElementById("privActivity").checked, allowMessages: document.getElementById("privMessages").value };
  saveConfig(cfg); closeModal(); toast("🔒 Confidentialité mise à jour");
}

function openContentSettings() {
  var cfg = getCurrentConfig();
  var content = cfg.content || { autoplay: true, dataEco: false, showSensitive: false, language: "fr" };
  openModal('\
    <div class="modal-handle"></div>\
    <div class="modal-title">📱 Contenu & feed</div>\
    <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);"><span style="font-size:13px;">▶️ Lecture auto des vidéos</span><input type="checkbox" id="contentAutoplay" ' + (content.autoplay ? 'checked' : '') + ' style="width:20px;height:20px;accent-color:var(--accent);"></label>\
    <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);"><span style="font-size:13px;">📡 Mode économie de données</span><input type="checkbox" id="contentDataEco" ' + (content.dataEco ? 'checked' : '') + ' style="width:20px;height:20px;accent-color:var(--accent);"></label>\
    <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);"><span style="font-size:13px;">⚠️ Afficher contenu sensible</span><input type="checkbox" id="contentSensitive" ' + (content.showSensitive ? 'checked' : '') + ' style="width:20px;height:20px;accent-color:var(--accent);"></label>\
    <div style="padding:12px 0;"><span style="font-size:13px;">🌍 Langue</span>\
      <select id="contentLang" style="display:block;width:100%;margin-top:6px;padding:10px;border-radius:10px;border:1.5px solid var(--border);font-size:16px;">\
        <option value="fr" ' + (content.language === "fr" ? "selected" : "") + '>Français</option>\
        <option value="en" ' + (content.language === "en" ? "selected" : "") + '>English</option>\
        <option value="es" ' + (content.language === "es" ? "selected" : "") + '>Español</option>\
      </select></div>\
    <button class="btn primary block" onclick="saveContentSettings()" style="margin-top:14px;">Sauvegarder</button>\
  ');
}
function saveContentSettings() {
  var cfg = getCurrentConfig();
  cfg.content = { autoplay: document.getElementById("contentAutoplay").checked, dataEco: document.getElementById("contentDataEco").checked, showSensitive: document.getElementById("contentSensitive").checked, language: document.getElementById("contentLang").value };
  saveConfig(cfg); closeModal(); toast("📱 Préférences de contenu mises à jour");
}

function openScreenTime() {
  var usage = parseInt(localStorage.getItem("passio_usage_min") || "0");
  var limitSec = parseInt(localStorage.getItem("passio_limit_sec") || "3600");
  var hasCode = localStorage.getItem("passio_parental_code") ? true : false;
  var lH = Math.floor(limitSec / 3600);
  var lM = Math.floor((limitSec % 3600) / 60);
  var lS = limitSec % 60;
  var uH = Math.floor(usage / 60);
  var uM = usage % 60;

  openModal('\
    <div class="modal-handle"></div>\
    <div class="modal-title">⏱ Temps d\'écran</div>\
    \
    <div style="text-align:center;margin:16px 0;">\
      <div style="font-size:42px;font-weight:900;color:var(--accent);">' + uH + 'h ' + (uM < 10 ? '0' : '') + uM + 'min</div>\
      <div style="font-size:12px;color:var(--muted);">utilisé aujourd\'hui</div>\
    </div>\
    \
    <div style="background:var(--bg-deep);border-radius:14px;padding:16px;margin-bottom:14px;">\
      <div style="font-size:13px;font-weight:800;margin-bottom:10px;">⏳ Limite journalière</div>\
      <div style="display:flex;gap:8px;align-items:center;justify-content:center;margin-bottom:12px;">\
        <div style="text-align:center;">\
          <input type="number" id="limitH" value="' + escapeHtml(lH) + '" min="0" max="23" style="width:56px;padding:10px 4px;text-align:center;font-size:22px;font-weight:900;border:2px solid var(--border);border-radius:12px;background:var(--bg-card);color:var(--text);"/>\
          <div style="font-size:10px;color:var(--muted);margin-top:4px;">heures</div>\
        </div>\
        <span style="font-size:24px;font-weight:900;color:var(--muted);">:</span>\
        <div style="text-align:center;">\
          <input type="number" id="limitM" value="' + escapeHtml(lM) + '" min="0" max="59" style="width:56px;padding:10px 4px;text-align:center;font-size:22px;font-weight:900;border:2px solid var(--border);border-radius:12px;background:var(--bg-card);color:var(--text);"/>\
          <div style="font-size:10px;color:var(--muted);margin-top:4px;">minutes</div>\
        </div>\
        <span style="font-size:24px;font-weight:900;color:var(--muted);">:</span>\
        <div style="text-align:center;">\
          <input type="number" id="limitS" value="' + escapeHtml(lS) + '" min="0" max="59" style="width:56px;padding:10px 4px;text-align:center;font-size:22px;font-weight:900;border:2px solid var(--border);border-radius:12px;background:var(--bg-card);color:var(--text);"/>\
          <div style="font-size:10px;color:var(--muted);margin-top:4px;">secondes</div>\
        </div>\
      </div>\
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;">\
        <button onclick="setTimeLimitQuick(1800)" class="btn ghost" style="font-size:11px;padding:6px 10px;">30 min</button>\
        <button onclick="setTimeLimitQuick(3600)" class="btn ghost" style="font-size:11px;padding:6px 10px;">1h</button>\
        <button onclick="setTimeLimitQuick(5400)" class="btn ghost" style="font-size:11px;padding:6px 10px;">1h30</button>\
        <button onclick="setTimeLimitQuick(7200)" class="btn ghost" style="font-size:11px;padding:6px 10px;">2h</button>\
        <button onclick="setTimeLimitQuick(10800)" class="btn ghost" style="font-size:11px;padding:6px 10px;">3h</button>\
        <button onclick="setTimeLimitQuick(0)" class="btn ghost" style="font-size:11px;padding:6px 10px;">Illimité</button>\
      </div>\
    </div>\
    \
    <div style="background:var(--bg-deep);border-radius:14px;padding:16px;margin-bottom:14px;">\
      <div style="font-size:13px;font-weight:800;margin-bottom:8px;">🔐 Contrôle parental</div>\
      <div style="font-size:11px;color:var(--muted);margin-bottom:10px;">Un code à 4 chiffres sera demandé pour modifier ou désactiver la limite.</div>\
      ' + (hasCode
        ? '<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:12px;color:var(--accent);font-weight:700;">✅ Code actif</span><button onclick="removeParentalCode()" class="btn ghost" style="font-size:11px;padding:6px 10px;color:#ef4444;border-color:rgba(239,68,68,0.3);">Supprimer</button></div>'
        : '<button onclick="setupParentalCode()" class="btn ghost" style="font-size:12px;width:100%;">🔒 Définir un code parental</button>'
      ) + '\
    </div>\
    \
    <button class="btn primary block" onclick="saveScreenTimeLimit()">💾 Sauvegarder la limite</button>\
  ');
}

function setTimeLimitQuick(sec) {
  var h = Math.floor(sec / 3600);
  var m = Math.floor((sec % 3600) / 60);
  var s = sec % 60;
  var hEl = document.getElementById("limitH"); if (hEl) hEl.value = h;
  var mEl = document.getElementById("limitM"); if (mEl) mEl.value = m;
  var sEl = document.getElementById("limitS"); if (sEl) sEl.value = s;
}

function saveScreenTimeLimit() {
  var hasCode = localStorage.getItem("passio_parental_code");
  if (hasCode) {
    askParentalCode(function() { doSaveScreenTimeLimit(); });
  } else {
    doSaveScreenTimeLimit();
  }
}

function doSaveScreenTimeLimit() {
  var h = parseInt(document.getElementById("limitH")?.value || "0");
  var m = parseInt(document.getElementById("limitM")?.value || "0");
  var s = parseInt(document.getElementById("limitS")?.value || "0");
  var total = h * 3600 + m * 60 + s;
  localStorage.setItem("passio_limit_sec", total.toString());
  closeModal();
  if (total === 0) {
    toast("⏱ Limite désactivée — temps illimité");
  } else {
    toast("⏱ Limite : " + h + "h " + (m < 10 ? "0" : "") + m + "min " + (s < 10 ? "0" : "") + s + "s");
  }
}

function setupParentalCode() {
  openModal('\
    <div class="modal-handle"></div>\
    <div class="modal-title">🔐 Définir le code parental</div>\
    <p style="font-size:12px;color:var(--muted);margin-bottom:14px;">Ce code à 4 chiffres sera demandé pour modifier la limite de temps. Note-le bien !</p>\
    <div style="display:flex;gap:8px;justify-content:center;margin-bottom:14px;">\
      <input type="password" id="parentCode1" maxlength="1" inputmode="numeric" style="width:50px;height:56px;text-align:center;font-size:26px;font-weight:900;border:2px solid var(--border);border-radius:14px;background:var(--bg-card);color:var(--text);" oninput="if(this.value.length===1)document.getElementById(\'parentCode2\').focus()"/>\
      <input type="password" id="parentCode2" maxlength="1" inputmode="numeric" style="width:50px;height:56px;text-align:center;font-size:26px;font-weight:900;border:2px solid var(--border);border-radius:14px;background:var(--bg-card);color:var(--text);" oninput="if(this.value.length===1)document.getElementById(\'parentCode3\').focus()"/>\
      <input type="password" id="parentCode3" maxlength="1" inputmode="numeric" style="width:50px;height:56px;text-align:center;font-size:26px;font-weight:900;border:2px solid var(--border);border-radius:14px;background:var(--bg-card);color:var(--text);" oninput="if(this.value.length===1)document.getElementById(\'parentCode4\').focus()"/>\
      <input type="password" id="parentCode4" maxlength="1" inputmode="numeric" style="width:50px;height:56px;text-align:center;font-size:26px;font-weight:900;border:2px solid var(--border);border-radius:14px;background:var(--bg-card);color:var(--text);" oninput="if(this.value.length===1)confirmParentalCode()"/>\
    </div>\
    <button class="btn primary block" onclick="confirmParentalCode()">✅ Confirmer le code</button>\
    <button class="btn ghost block" onclick="closeModal();openScreenTime();" style="margin-top:6px;">Annuler</button>\
  ');
  setTimeout(function() { var el = document.getElementById("parentCode1"); if (el) el.focus(); }, 100);
}

async function _hashPin(code) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("passio:" + code));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function confirmParentalCode() {
  var code = (document.getElementById("parentCode1")?.value || "") +
    (document.getElementById("parentCode2")?.value || "") +
    (document.getElementById("parentCode3")?.value || "") +
    (document.getElementById("parentCode4")?.value || "");
  if (code.length !== 4 || !/^\d{4}$/.test(code)) {
    toast("Le code doit contenir 4 chiffres");
    return;
  }
  const hash = await _hashPin(code);
  localStorage.setItem("passio_parental_code", hash);
  closeModal();
  toast("🔐 Code parental activé !");
  openScreenTime();
}

function removeParentalCode() {
  askParentalCode(function() {
    localStorage.removeItem("passio_parental_code");
    toast("🔓 Code parental supprimé");
    openScreenTime();
  });
}

function askParentalCode(onSuccess) {
  openModal('\
    <div class="modal-handle"></div>\
    <div class="modal-title">🔐 Entrer le code parental</div>\
    <p style="font-size:12px;color:var(--muted);margin-bottom:14px;">Saisis ton code à 4 chiffres pour continuer.</p>\
    <div style="display:flex;gap:8px;justify-content:center;margin-bottom:14px;">\
      <input type="password" id="askCode1" maxlength="1" inputmode="numeric" style="width:50px;height:56px;text-align:center;font-size:26px;font-weight:900;border:2px solid var(--border);border-radius:14px;background:var(--bg-card);color:var(--text);" oninput="if(this.value.length===1)document.getElementById(\'askCode2\').focus()"/>\
      <input type="password" id="askCode2" maxlength="1" inputmode="numeric" style="width:50px;height:56px;text-align:center;font-size:26px;font-weight:900;border:2px solid var(--border);border-radius:14px;background:var(--bg-card);color:var(--text);" oninput="if(this.value.length===1)document.getElementById(\'askCode3\').focus()"/>\
      <input type="password" id="askCode3" maxlength="1" inputmode="numeric" style="width:50px;height:56px;text-align:center;font-size:26px;font-weight:900;border:2px solid var(--border);border-radius:14px;background:var(--bg-card);color:var(--text);" oninput="if(this.value.length===1)document.getElementById(\'askCode4\').focus()"/>\
      <input type="password" id="askCode4" maxlength="1" inputmode="numeric" style="width:50px;height:56px;text-align:center;font-size:26px;font-weight:900;border:2px solid var(--border);border-radius:14px;background:var(--bg-card);color:var(--text);"/>\
    </div>\
    <button class="btn primary block" id="askCodeBtn">✅ Valider</button>\
    <button class="btn ghost block" onclick="closeModal()" style="margin-top:6px;">Annuler</button>\
  ');
  setTimeout(function() {
    var el = document.getElementById("askCode1"); if (el) el.focus();
    var btn = document.getElementById("askCodeBtn");
    if (btn) {
      btn.onclick = async function() {
        var code = (document.getElementById("askCode1")?.value||"") + (document.getElementById("askCode2")?.value||"") + (document.getElementById("askCode3")?.value||"") + (document.getElementById("askCode4")?.value||"");
        var stored = localStorage.getItem("passio_parental_code");
        var hash = await _hashPin(code);
        // Compatibilité : supporte ancien code en clair (migration)
        if (hash === stored || code === stored) {
          if (code === stored) { _hashPin(code).then(h => localStorage.setItem("passio_parental_code", h)); }
          closeModal();
          if (onSuccess) onSuccess();
        } else {
          toast("❌ Code incorrect", "error");
          ["askCode1","askCode2","askCode3","askCode4"].forEach(function(id) { var e = document.getElementById(id); if(e) e.value=""; });
          var el = document.getElementById("askCode1"); if (el) el.focus();
        }
      };
    }
  }, 100);
}

function setTimeLimit(min) {
  localStorage.setItem("passio_limit_sec", (min * 60).toString());
  toast("⏱ Limite : " + (min > 0 ? min + " min/jour" : "illimitée"));
  openScreenTime();
}

function openPauseMode() {
  openModal('\
    <div class="modal-handle"></div>\
    <div class="modal-title">🧘 Mode pause</div>\
    <p style="font-size:12px;color:var(--muted);margin-bottom:16px;">Prends une pause. PASSIO sera là quand tu reviens.</p>\
    <div style="display:flex;flex-direction:column;gap:8px;">\
      <button class="btn ghost" onclick="activatePause(30)" style="text-align:left;padding:14px;">😌 Pause 30 minutes</button>\
      <button class="btn ghost" onclick="activatePause(60)" style="text-align:left;padding:14px;">🍃 Pause 1 heure</button>\
      <button class="btn ghost" onclick="activatePause(1440)" style="text-align:left;padding:14px;">🌙 Pause jusqu\'à demain</button>\
      <button class="btn ghost" onclick="activatePause(10080)" style="text-align:left;padding:14px;">🏖 Pause 1 semaine</button>\
    </div>\
    <button class="btn primary block" onclick="closeModal()" style="margin-top:14px;">Annuler</button>\
  ');
}
function activatePause(min) {
  closeModal();
  toast("🧘 Mode pause activé — " + (min < 60 ? min + " min" : min < 1440 ? Math.round(min/60) + "h" : Math.round(min/1440) + " jour(s)"));
}

function openAbout() {
  openModal('\
    <div class="modal-handle"></div>\
    <div style="text-align:center;margin-bottom:16px;">\
      <div style="font-size:48px;margin-bottom:8px;">🟣</div>\
      <div style="font-weight:900;font-size:22px;color:var(--text);">PASSIO</div>\
      <div style="font-size:12px;color:var(--muted);margin-top:4px;">Version Beta 1.1 · Mai 2026</div>\
    </div>\
    <div style="font-size:13px;color:var(--text);line-height:1.6;margin-bottom:14px;">Le premier réseau social pensé pour tes passions. Crée, partage, rencontre — autour de ce qui t\'anime vraiment.</div>\
    <div style="font-size:11px;color:var(--muted);line-height:1.5;">\
      🏢 PASSIO SAS · France<br>\
      📧 contact@passio.app<br>\
      🌐 passio.app<br><br>\
      Fondé avec ❤️ par des passionnés.\
    </div>\
    <button class="btn primary block" onclick="closeModal()" style="margin-top:14px;">Fermer</button>\
  ');
}

function openLogoutConfirm() {
  openModal('\
    <div class="modal-handle"></div>\
    <div class="modal-title">🚪 Se déconnecter ?</div>\
    <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">Tu garderas ton compte et ton contenu. Tu pourras te reconnecter à tout moment.</p>\
    <div style="display:flex;gap:8px;">\
      <button class="btn ghost" onclick="closeModal()" style="flex:1;">Annuler</button>\
      <button class="btn primary" onclick="closeModal();doLogout(\'signin\');" style="flex:1;background:#ef4444;">Se déconnecter</button>\
    </div>\
  ');
}

/* ═══════════════════════════════════════════════════════════════════════════
   🔑 SE CONNECTER À UN COMPTE EXISTANT / CHANGER DE COMPTE  (2026-09-02)
   ───────────────────────────────────────────────────────────────────────────
   Le parcours de première visite (`js/first-run.js`, actif par défaut) fait
   entrer un appareil SANS compte directement dans le fil : plus de landing,
   donc plus de formulaire de connexion à l'écran. Le seul chemin vers ce
   formulaire était le gate d'action engageante (« J'ai déjà un compte »), qu'il
   faut déclencher par un like ou un commentaire — introuvable pour qui veut
   simplement retrouver SON compte.

   ⚠️ ET LA DÉCONNEXION NE SERT PAS DE SORTIE DE SECOURS, elle aggrave le
   piège : `purgeAccountScopedData` efface `STATE_KEY` et `passio_uid`, donc au
   rechargement `compteExistant()` rend `false` et l'appareil retombe dans le
   parcours invité — sans jamais montrer l'écran de connexion. D'où l'INTENTION
   ci-dessous, posée APRÈS la purge (elle survit donc au nettoyage) sur une clé
   d'APPAREIL délibérément absente d'`ACCOUNT_SCOPED_KEYS`, et consommée une
   seule fois par `boot()`.
   ═══════════════════════════════════════════════════════════════════════════ */
var AUTH_INTENT_KEY = "passio_auth_intent_v1";
// ⚠️ HORODATÉE, ET C'EST INDISPENSABLE. Entre `setItem` et le rechargement il
// s'écoule 1,2 s : une application fermée, un onglet tué ou un plantage dans
// cette fenêtre laisserait la clé sur l'appareil POUR TOUJOURS, et le prochain
// démarrage — le lendemain, ou pour quelqu'un d'autre sur un appareil partagé —
// s'ouvrirait sur un mur de connexion au lieu du fil de découverte. Ce serait
// exactement le contraire de « l'application est elle-même le pitch ».
var AUTH_INTENT_TTL_MS = 10 * 60 * 1000;

function poserIntentionAuth(mode) {
  try { localStorage.setItem(AUTH_INTENT_KEY, JSON.stringify({ mode: mode || "signin", t: Date.now() })); } catch (e) {}
}

// Lit l'intention, l'EFFACE toujours, et ne rend son mode que si elle est
// encore fraîche : une clé périmée doit disparaître, pas s'appliquer.
function consommerIntentionAuth() {
  var brut = null;
  try { brut = localStorage.getItem(AUTH_INTENT_KEY); } catch (e) {}
  if (!brut) return null;
  try { localStorage.removeItem(AUTH_INTENT_KEY); } catch (e) {}
  var o = null;
  try { o = JSON.parse(brut); } catch (e) { o = null; }
  if (!o || typeof o !== "object" || typeof o.t !== "number") return null;
  if (Date.now() - o.t > AUTH_INTENT_TTL_MS) return null;
  return o.mode === "signup" ? "signup" : "signin";
}
window.poserIntentionAuth = poserIntentionAuth;
window.consommerIntentionAuth = consommerIntentionAuth;

/* Ouvre le formulaire d'authentification, où qu'on se trouve dans l'app.
   Renvoie `false` si le balisage d'onboarding est absent — l'appelant garde
   alors la main plutôt que de laisser l'écran dans un état intermédiaire. */
function openAuthScreen(mode) {
  var onb = document.getElementById("onboarding");
  if (!onb) return false;
  try { closeModal(); } catch (e) {}
  var panel = document.getElementById("devPanel");
  if (panel) panel.classList.remove("active");
  var landing = document.getElementById("landing");
  if (landing) landing.classList.remove("active");

  // ⚠️ UN SEUL MOTEUR D'OUVERTURE. `ouvrirAuth` (first-run.js) connaît déjà
  // l'étape « splash », la remise à zéro d'`onbStepIdx` et la porte de sortie :
  // le jour où le formulaire déménage, il n'y a qu'UN endroit à corriger. Le
  // repli ci-dessous ne sert que si le module n'est pas chargé.
  try {
    if (window.PassioFirstRun) {
      if (mode === "signup" && PassioFirstRun.allerInscription) PassioFirstRun.allerInscription("");
      else if (PassioFirstRun.allerConnexion) PassioFirstRun.allerConnexion("deja_compte");
      if (onb.classList.contains("active")) return true;
    }
  } catch (e) { if (typeof diagLog === "function") diagLog("openAuthScreen (module) : " + e); }

  onb.classList.add("active");
  // ⚠️ LE FORMULAIRE VIT SUR L'ÉTAPE « splash », PAS SUR « auth » : cette
  // dernière existe encore dans le balisage mais porte `display:none!important`
  // — l'ouvrir afficherait un écran VIDE, sans la moindre erreur. Et
  // `onbStepIdx` doit repartir de 0, sinon le `onbNext()` d'une inscription
  // réussie sauterait l'âge ou le prénom.
  onbStepIdx = 0;
  // ⚠️ CATCH QUI RAPPORTE, ET QUI RENONCE. Avaler l'erreur en rendant `true`
  // laisserait `#onboarding` actif SANS aucune `.onb-step.active` : un écran
  // vide, sans message en console, et l'application inatteignable. On rend
  // `false` pour que l'appelant (`boot()`) reprenne son chemin normal.
  try {
    showOnbStep("splash");
  } catch (e) {
    if (typeof diagLog === "function") diagLog("openAuthScreen : showOnbStep a échoué — " + e);
    onb.classList.remove("active");
    return false;
  }
  try { switchAuthTab(mode === "signup" ? "signup" : "signin"); }
  catch (e) { if (typeof diagLog === "function") diagLog("openAuthScreen : switchAuthTab — " + e); }
  // Porte de sortie : l'onboarding est un écran plein SANS retour. En mode
  // invité, first-run.js sait poser son « ← Continuer à explorer » ; sans elle,
  // quelqu'un qui change d'avis est enfermé dans le formulaire.
  try {
    if (window.PassioFirstRun && PassioFirstRun.actif() && PassioFirstRun.poserSortieExploration) {
      PassioFirstRun.poserSortieExploration();
    }
  } catch (e) {}
  return true;
}
window.openAuthScreen = openAuthScreen;

/* Entrée « Compte » du panneau Paramètres. Deux situations, un seul bouton :
   • visiteur sans compte  → rien à déconnecter, on ouvre la connexion ;
   • compte connecté       → confirmation, puis déconnexion AVEC intention de
                             reconnexion (l'écran de connexion s'ouvre après le
                             rechargement). */
function openAccountSwitch() {
  // ⚠️ Fermé ICI, pas seulement par le `onclick` du bouton : tout appel
  // programmatique laisserait sinon le panneau Paramètres par-dessus l'écran
  // d'authentification.
  var panneau = document.getElementById("devPanel");
  if (panneau) panneau.classList.remove("active");
  var visiteur = false;
  try { visiteur = !!(window.PassioFirstRun && PassioFirstRun.estVisiteur()); } catch (e) {}
  if (visiteur) {
    // Aucun compte sur cet appareil : rien à déconnecter, on ouvre le
    // formulaire EXISTANT (aucun second système d'auth).
    openAuthScreen("signin");
    return;
  }
  openModal('\
    <div class="modal-handle"></div>\
    <div class="modal-title">🔄 Se connecter avec un autre compte</div>\
    <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">Tu vas être déconnecté de ce compte, puis l\'écran de connexion s\'ouvrira. Ce compte et tout son contenu restent intacts — tu pourras y revenir quand tu veux.</p>\
    <div style="display:flex;gap:8px;">\
      <button class="btn ghost" onclick="closeModal()" style="flex:1;">Annuler</button>\
      <button class="btn primary" onclick="closeModal();doLogout(\'signin\');" style="flex:1;">Continuer</button>\
    </div>\
  ');
}
window.openAccountSwitch = openAccountSwitch;

// Caches persistants LIÉS AU COMPTE (jamais au device). Ils DOIVENT être purgés
// à la déconnexion, sinon le compte suivant connecté DANS LE MÊME NAVIGATEUR
// hérite des données du précédent : conversations privées (localStorage + IndexedDB),
// profil de config, historique IA, brouillon de vlog… (fuite d'isolation inter-comptes
// corrigée le 2026-08-12). On NE touche PAS aux clés device/consentement
// (passio_gate_* = sessionStorage, passio_telemetry opt-out, passio_realtime_* flags
// de test, passio_parental_code) qui n'appartiennent pas à un compte.
var ACCOUNT_SCOPED_KEYS = [
  STATE_KEY,                 // profils, posts perso, notifications, likes…
  "passio_uid",              // id (anonyme) du compte courant
  "passio_conversations_v1", // messagerie (vocaux base64 inclus) — cache localStorage
  "passio_config",           // config de profil
  "passio_ai_history",       // historique de l'assistant IA
  "passio_vlog_draft_v1",    // brouillon de publication
  "passio_oauth_pending",    // jeton transitoire de retour OAuth
  // Ajoutés le 2026-08-14 après inventaire exhaustif des clés réellement écrites
  // par l'application : ces quatre-là portent du CONTENU de compte et survivaient
  // à la déconnexion.
  "passio_cdv_lives",        // carnets de voyage (étapes, photos) — vrai contenu
  "passio_cdv_geo_v1",       // cache de géocodage des lieux visités — données de lieu
  "passio_passion_requests", // demandes de passion faites par la personne
  "passio_event_reminded",   // événements pour lesquels un rappel a été posé
  "passio_conv_deleted_v1",  // journal des suppressions de conversations/messages (ADR-008)
  // ⚠️ NE PAS ajouter ici, et c'est délibéré :
  //   passio_parental_code / passio_limit_sec — le contrôle parental est posé sur
  //     l'APPAREIL par un parent ; le purger à la déconnexion offrirait à l'enfant
  //     un contournement en un clic.
  //   passio_device_id, passio_telemetry, passio_pwa_*, passio_logo_variant,
  //     passio_debug — propres à l'appareil, sans lien avec un compte.
  //   passio_auth_intent_v1 — l'intention de reconnexion, posée APRÈS cette
  //     purge par `doLogout` et consommée par `boot()`. L'ajouter ici
  //     refermerait le piège qu'elle ouvre : la déconnexion redeviendrait un
  //     aller simple vers le fil invité, sans écran de connexion.
];

// Efface TOUTE trace du compte courant côté device (localStorage + IndexedDB).
// best-effort : ne throw jamais. Renvoie une promesse résolue quand IndexedDB est vidé.
function purgeAccountScopedData() {
  // ⚠️ EN PREMIER : le verrou. Tout ce qui suit serait vain si une écriture
  // survenait pendant les 1,2 s qui séparent la purge du rechargement.
  _accountPurged = true;
  _stateDirty = false;
  discardPendingStateSave();
  // L'identité aussi : les fonctions d'écriture testent `!MY_UID` et s'abstiennent.
  try { MY_UID = null; window.MY_UID = null; } catch (e) {}
  // Caches en mémoire : le rechargement les emporte, mais il peut échouer ou tarder.
  try { if (typeof _clearProfileCache === "function") _clearProfileCache(); } catch (e) {}
  // ⚠️ Le cache « ligne profiles assurée » est indexé par UID, donc un changement
  // d'utilisateur le manque naturellement. On le vide quand même à la purge :
  // laisser un UID marqué assuré après une déconnexion ferait sauter l'insert
  // du compte suivant si les identifiants venaient à se recouvrir.
  try { if (typeof _resetProfilAssure === "function") _resetProfilAssure(); } catch (e) {}
  try { ACCOUNT_SCOPED_KEYS.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
  // ⚠️ Les files de sauvegarde en attente sont suffixées par compte : elles ne
  // peuvent donc pas figurer en dur dans la liste ci-dessus. Chacune contient le
  // blob d'état COMPLET (profils, notifications, likes…) — le laisser sur
  // l'appareil après une déconnexion, c'est le laisser lisible par le compte
  // suivant. doLogout pousse déjà l'état avant de partir : il n'y a rien à
  // sauver ici, seulement quelque chose à ne pas abandonner derrière soi.
  try {
    const aPurger = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(PENDING_USER_STATE_PREFIX) === 0) aPurger.push(k);
    }
    aPurger.forEach(function (k) { localStorage.removeItem(k); });
  } catch (e) {}
  // Les conversations ont un second store DURABLE (IndexedDB, idb-store.js) que
  // localStorage.removeItem ne touche pas : sans ça, hydrateConvsFromIDB() au boot
  // ré-injecte les messages du compte précédent chez le suivant.
  try {
    if (typeof idbConvClear === "function") return Promise.resolve(idbConvClear()).catch(function () {});
  } catch (e) {}
  return Promise.resolve();
}
window.purgeAccountScopedData = purgeAccountScopedData;

/* Ferme la session CÔTÉ APPAREIL en retirant le jeton que le SDK relit au
   démarrage. À n'appeler qu'en DERNIER RECOURS, quand `supa.auth.signOut()` n'a
   pas abouti (hors ligne, jeton non révocable) : pour supabase-js, ce jeton EST
   la session, donc le laisser en place fait rouvrir le compte quitté au
   prochain démarrage — et `ACCOUNT_SCOPED_KEYS` ne le connaît pas, puisqu'il
   appartient au SDK et non à l'application.

   ⚠️ La clé est nommée d'après la RÉFÉRENCE du projet Supabase
   (`sb-<ref>-auth-token`) : on la retrouve par motif plutôt qu'en la recopiant
   en dur, pour qu'un changement de projet ne laisse pas ici une clé fantôme
   qui ne correspondrait plus à rien. Ne détruit rien côté serveur : le compte
   reste intact, seule sa session locale est fermée. */
function purgerJetonAuthLocal() {
  try {
    var aPurger = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && /^sb-.+-auth-token$/.test(k)) aPurger.push(k);
    }
    aPurger.forEach(function (k) { localStorage.removeItem(k); });
    return aPurger.length;
  } catch (e) { return 0; }
}
window.purgerJetonAuthLocal = purgerJetonAuthLocal;

async function doLogout(intention) {
  // Flush immédiat : pousse les changements en attente (debounce 2500ms non encore
  // déclenché) vers Supabase AVANT la déconnexion. Sans ça, toute modification faite
  // dans les 2,5 s précédant le logout est perdue à la reconnexion.
  try { if (typeof supaSaveUserState === "function") await supaSaveUserState(); } catch(e) {}
  // ⚠️ LE SDK NE LÈVE PAS SUR UN REFUS : sans lire `{ error }`, une déconnexion
  // qui ÉCHOUE (hors ligne, jeton non révocable) passait pour réussie — la
  // session survivait au rechargement et la personne se retrouvait dans le
  // compte qu'elle venait de quitter, alors que tout son cache local, lui,
  // avait bien été purgé. On ferme alors la session côté appareil.
  var echecSignOut = false;
  try {
    var so = await supa.auth.signOut();
    if (so && so.error) echecSignOut = true;
  } catch(e) { echecSignOut = true; }
  if (echecSignOut) { try { purgerJetonAuthLocal(); } catch (e) {} }
  discardPendingStateSave();
  // ⚠️ Isolation inter-comptes : purge complète des caches liés au compte, y compris
  // les conversations en IndexedDB (sinon fuite de messages privés vers le compte suivant).
  try { await purgeAccountScopedData(); } catch(e) {}
  // ⚠️ APRÈS la purge, JAMAIS avant : `purgeAccountScopedData` ne connaît que les
  // clés de compte, mais un `removeItem` posé avant celle-ci serait de toute façon
  // suivi d'une écriture perdue. L'intention est une clé d'APPAREIL (absente
  // d'`ACCOUNT_SCOPED_KEYS`), consommée une seule fois par `boot()`.
  //
  // ⚠️ L'INTENTION SUIT LE PARAMÈTRE, elle n'est pas posée d'office. Une
  // déconnexion VOLONTAIRE (les deux boutons des Paramètres) demande l'écran de
  // connexion : sans ça, le rechargement repart sur un appareil « sans compte »
  // et le parcours de première visite le renvoie dans le fil invité, sans le
  // moindre formulaire. Mais tout appelant FUTUR — une suppression de compte,
  // une expiration de session — hériterait de cet écran sans l'avoir demandé :
  // `doLogout()` sans argument reste donc l'ancien comportement, à l'octet près.
  if (intention === "signin") poserIntentionAuth("signin");
  toast(intention === "signin" ? "🔄 Déconnecté — connecte-toi avec ton autre compte" : "👋 Déconnecté — à bientôt !");
  setTimeout(() => location.reload(), 1200);
}

/* Changement de mot de passe SANS email : pour un utilisateur déjà connecté,
   via la session active (supa.auth.updateUser). L'envoi d'e-mails EST
   opérationnel depuis le branchement du SMTP (2026-08-30, docs/SETUP_SMTP_AUTH.md) ;
   ce chemin reste le plus court pour qui est déjà connecté — il évite un
   aller-retour par la boîte mail — et la seule sortie si le mail n'arrive pas. */
function openChangePassword() {
  openModal('\
    <div class="modal-handle"></div>\
    <div class="modal-title">🔑 Changer mon mot de passe</div>\
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px;">Choisis un nouveau mot de passe (6 caractères minimum). Tu resteras connecté.</p>\
    <label class="field"><span>Nouveau mot de passe</span>\
      <input type="password" class="input" id="cpNew" autocomplete="new-password" minlength="6" placeholder="••••••••"/></label>\
    <label class="field" style="margin-top:8px;"><span>Confirme le mot de passe</span>\
      <input type="password" class="input" id="cpConfirm" autocomplete="new-password" minlength="6" placeholder="••••••••"/></label>\
    <div id="cpMsg" style="font-size:12px;min-height:16px;margin:8px 0 2px;"></div>\
    <div style="display:flex;gap:8px;margin-top:10px;">\
      <button class="btn ghost" onclick="closeModal()" style="flex:1;">Annuler</button>\
      <button class="btn primary" id="cpBtn" onclick="doChangePassword()" style="flex:1;">Valider</button>\
    </div>\
  ');
}

async function doChangePassword() {
  var nEl = document.getElementById("cpNew");
  var cEl = document.getElementById("cpConfirm");
  var msg = document.getElementById("cpMsg");
  var btn = document.getElementById("cpBtn");
  var n = nEl ? nEl.value : "";
  var c = cEl ? cEl.value : "";
  function err(t) { if (msg) { msg.style.color = "#e11d48"; msg.textContent = t; } }
  if (n.length < 6) { err("Au moins 6 caractères."); return; }
  if (n !== c) { err("Les mots de passe ne correspondent pas."); return; }
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  // S'assurer que la session est bien chargée en mémoire avant updateUser
  // (sinon supabase-js renvoie « Auth session missing »).
  try {
    var gs = await supa.auth.getSession();
    if (!gs || !gs.data || !gs.data.session) {
      err("Session expirée. Reconnecte-toi puis réessaie.");
      if (btn) { btn.disabled = false; btn.textContent = "Valider"; }
      return;
    }
  } catch (e) {}
  try {
    var r = await supa.auth.updateUser({ password: n });
    if (r && r.error) {
      var m = r.error.message || "";
      // Traduction des messages Supabase courants.
      if (/different from the old/i.test(m)) m = "Le nouveau mot de passe doit être différent de l'ancien.";
      else if (/session/i.test(m)) m = "Session expirée. Reconnecte-toi puis réessaie.";
      else if (/at least/i.test(m)) m = "Mot de passe trop court.";
      else if (!m) m = "Impossible de changer le mot de passe.";
      err(m);
      if (btn) { btn.disabled = false; btn.textContent = "Valider"; }
      return;
    }
    closeModal();
    toast("✅ Mot de passe mis à jour");
  } catch (e) {
    err("Erreur réseau. Réessaie.");
    if (btn) { btn.disabled = false; btn.textContent = "Valider"; }
  }
}
window.openChangePassword = openChangePassword;
window.doChangePassword = doChangePassword;

/* ============================================================
   🛡 RGPD 2026-06-10 — Suppression de compte réelle + politique
   de confidentialité. Avant : "Supprimer mon compte" ne vidait
   que le localStorage, les données Supabase restaient en base.
   ============================================================ */

function openDeleteAccountConfirm() {
  openModal('\
    <div class="modal-handle"></div>\
    <div class="modal-title" style="color:#ef4444;">🗑 Supprimer mon compte</div>\
    <p style="font-size:13px;color:var(--muted);margin-bottom:10px;">Cette action est <strong>définitive</strong>. Seront supprimés :</p>\
    <ul style="font-size:13px;color:var(--muted);margin:0 0 12px 18px;line-height:1.7;">\
      <li>ton profil et tes passions ;</li>\
      <li>tous tes posts, photos, vidéos, carnets et stories ;</li>\
      <li>tes messages, conversations et notifications ;</li>\
      <li>tes likes, commentaires, abonnements et événements.</li>\
    </ul>\
    <p style="font-size:12px;color:var(--muted);margin-bottom:14px;">Ton adresse e-mail de connexion sera définitivement retirée de nos serveurs sous 30 jours (art. 17 RGPD). Pour toute question : contact@ladamemetallerie.com</p>\
    <label class="field"><span>Tape <strong>SUPPRIMER</strong> pour confirmer</span>\
      <input type="text" class="input" id="deleteConfirmInput" autocomplete="off" placeholder="SUPPRIMER"/></label>\
    <div style="display:flex;gap:8px;margin-top:12px;">\
      <button class="btn ghost" onclick="closeModal()" style="flex:1;">Annuler</button>\
      <button class="btn primary" onclick="doDeleteAccount()" style="flex:1;background:#ef4444;">Supprimer définitivement</button>\
    </div>\
  ');
}

async function doDeleteAccount() {
  var input = document.getElementById("deleteConfirmInput");
  if (!input || input.value.trim().toUpperCase() !== "SUPPRIMER") {
    toast("Tape SUPPRIMER pour confirmer");
    return;
  }
  closeModal();
  toast("🗑 Suppression en cours…");
  // Suppression best-effort des données serveur, table par table.
  // Les policies RLS limitent de toute façon chaque DELETE au propriétaire.
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    var jobs = [
      ["posts",           "author_id"],
      ["post_likes",      "user_id"],
      ["post_comments",   "author_id"],
      ["stories",         "author_id"],
      ["events",          "author_id"],
      ["event_attendees", "user_id"],
      ["conv_messages",   "from_id"],
      ["conv_members",    "user_id"],
      ["notifications",   "user_id"],
      ["user_state",      "user_id"],
      ["profiles",        "id"],
    ];
    for (var i = 0; i < jobs.length; i++) {
      try { await supa.from(jobs[i][0]).delete().eq(jobs[i][1], MY_UID); } catch (e) {}
    }
    try { await supa.from("follows").delete().eq("follower_id", MY_UID); } catch (e) {}
    try { await supa.from("follows").delete().eq("following_id", MY_UID); } catch (e) {}
    try { await supa.from("blocks").delete().eq("blocker_id", MY_UID); } catch (e) {}
    try { await supa.from("blocks").delete().eq("blocked_id", MY_UID); } catch (e) {}
    // Suppression du compte auth côté serveur. L'Edge Function `delete-account`
    // EST déployée et active — vérifié de bout en bout le 2026-08-17 : elle
    // supprime le compte (reconnexion impossible ensuite) ET les MÉDIAS du
    // Storage, que ce code client ne touche jamais.
    //
    // Le commentaire précédent affirmait le contraire (« tant que l'Edge
    // Function n'est pas déployée… la purge manuelle sous 30 jours s'applique »).
    // Il était périmé et trompeur au pire endroit : il donnait à lire une
    // suppression incomplète là où elle est complète. Non-régression :
    // `tests/e2e/suppression-compte.spec.js` (opt-in PASSIO_E2E_MULTI) —
    // nécessaire parce qu'une Edge Function se redéploie sans que le dépôt bouge.
    try { await supa.functions.invoke("delete-account"); } catch (e) {}
    try { await supa.auth.signOut(); } catch (e) {}
  }
  // Purge locale complète
  discardPendingStateSave();
  try {
    Object.keys(localStorage)
      .filter(function (k) { return k.indexOf("passio") !== -1 || k === "sb-njkiyoklssvefstljemx-auth-token"; })
      .forEach(function (k) { localStorage.removeItem(k); });
  } catch (e) {}
  // Conversations durables en IndexedDB : non couvertes par le nettoyage localStorage.
  try { if (typeof idbConvClear === "function") await Promise.resolve(idbConvClear()).catch(function () {}); } catch (e) {}
  try { sessionStorage.clear(); } catch (e) {}
  toast("✅ Compte supprimé. Au revoir 💜");
  setTimeout(function () { location.reload(); }, 1500);
}

function openPrivacyPolicy() {
  openModal('\
    <div class="modal-handle"></div>\
    <div class="modal-title">🛡 Politique de confidentialité</div>\
    <div style="font-size:12.5px;color:var(--muted);line-height:1.65;max-height:55vh;overflow-y:auto;padding-right:4px;">\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">Dernière mise à jour : juin 2026 — PASSIO (beta privée)</strong></p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">1. Données collectées.</strong> Lors de l\'inscription : adresse e-mail et nom d\'utilisateur. Lors de l\'utilisation : passions, publications (textes, photos, vidéos, audio), carnets, messages, commentaires, likes, abonnements, participation aux événements, et préférences locales (thème, filtres).</p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">2. Où sont stockées tes données.</strong> Sur les serveurs de notre prestataire Supabase (hébergement UE/US, chiffrement en transit), et en partie sur ton appareil (localStorage) pour le fonctionnement hors-ligne. Les accès en base sont restreints par des règles de sécurité par propriétaire (RLS).</p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">3. Ce que nous ne faisons pas.</strong> Pas de revente de données, pas de publicité ciblée, pas de traqueurs tiers. C\'est l\'engagement fondateur de PASSIO.</p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">4. Durée de conservation.</strong> Tes données sont conservées tant que ton compte est actif. La suppression du compte efface tes contenus immédiatement et ton e-mail sous 30 jours.</p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">5. Tes droits (RGPD).</strong> Accès, rectification, effacement, portabilité, opposition. Exerce-les directement dans l\'app (Paramètres → Supprimer mon compte) ou par e-mail : <strong style="color:var(--text);">contact@ladamemetallerie.com</strong>. Tu peux aussi saisir la CNIL (cnil.fr).</p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">6. Mineurs.</strong> PASSIO est réservé aux 13 ans et plus ; l\'inscription demande l\'âge à l\'onboarding.</p>\
      <p style="margin:0;"><strong style="color:var(--text);">7. Beta privée.</strong> Pendant la phase de test, l\'accès est protégé par code et les fonctionnalités peuvent évoluer ; tes retours peuvent être utilisés pour améliorer le produit.</p>\
    </div>\
    <button class="btn primary block" onclick="closeModal()" style="margin-top:14px;">J\'ai compris</button>\
  ');
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".hamburger") && !e.target.closest(".dev-panel")) {
    $("#devPanel").classList.remove("active");
  }
});

// ======== ONBOARDING ========
let onbStepIdx = 0;
const onbSteps = ["splash", "age", "name", "passions"];
let selectedPassions = [];

function showOnbStep(name) {
  $$(".onb-step").forEach(s => s.classList.toggle("active", s.getAttribute("data-onb-step") === name));
}

function onbNext() {
  onbStepIdx++;
  if (onbStepIdx >= onbSteps.length) return onbFinish();
  showOnbStep(onbSteps[onbStepIdx]);
}

function onbPrev() {
  if (onbStepIdx === 0) return;
  onbStepIdx--;
  showOnbStep(onbSteps[onbStepIdx]);
}

function onbValidateAge() {
  const val = parseInt($("#birthYear").value, 10);
  if (!val || val < 1900 || val > 2025) {
    toast("Année invalide", "info");
    return;
  }
  const currentYear = new Date().getFullYear();
  const age = currentYear - val;
  if (age < 13) {
    toast("PASSIO est réservé aux 13 ans et plus.", "info");
    return;
  }
  state.user.birthYear = val;
  state.user.isMinor = age < 18;
  onbNext();
}

function onbValidateName() {
  const v = $("#userName").value.trim();
  if (v.length < 2) { toast("Indique ton prénom."); return; }
  state.user.name = v;
  onbNext();
  renderPassionGrid();
  // Première visite : un visiteur qui a déjà choisi ses passions ne doit pas se
  // les voir redemander — ce serait exactement le « second onboarding » que le
  // lot interdit. Le pré-remplissage passe par `selectedPassions`, la variable
  // que cet écran lit déjà : aucun second moteur de sélection.
  try { if (window.PassioFirstRun) PassioFirstRun.prefiller(); } catch (e) {}
}

// -------- AUTH STEP --------
let _authMode = "signin";
// Adresse dont la confirmation est en attente (voir onbResendConfirmation).
// ⚠️ Déclarée ICI, avant switchAuthTab qui la remet à zéro : un `let` n'est pas
// hissé comme une déclaration de fonction — plus bas dans le fichier, tout appel
// fait pendant l'évaluation du script la trouverait en zone morte temporelle.
let _pendingConfirmEmail = "";

function switchAuthTab(mode) {
  _authMode = mode;
  document.getElementById("authTabSignin").classList.toggle("active", mode === "signin");
  document.getElementById("authTabSignup").classList.toggle("active", mode === "signup");
  document.getElementById("authPasswordConfirmWrap").style.display = mode === "signup" ? "" : "none";
  const phoneWrap = document.getElementById("authPhoneWrap");
  if (phoneWrap) phoneWrap.style.display = mode === "signup" ? "" : "none";
  document.getElementById("authSubmitBtn").textContent = mode === "signin" ? "Se connecter" : "Créer mon compte";
  // "Mot de passe oublié ?" pertinent uniquement en connexion
  const forgot = document.getElementById("authForgotLink");
  if (forgot) forgot.style.display = mode === "signin" ? "" : "none";
  const msg = document.getElementById("authMsg");
  msg.className = "onb-auth-msg";
  msg.textContent = "";
  // ⚠️ Remise à zéro de l'écran : le lien de renvoi ne survit pas à un
  // changement d'onglet. Les appelants qui basculent PUIS proposent le renvoi
  // (onbDoAuth) doivent donc appeler _showResendConfirmation APRÈS switchAuthTab.
  _showResendConfirmation("");
}

// ── Mot de passe oublié : envoie un e-mail de réinitialisation Supabase ──
async function onbForgotPassword() {
  const email = (document.getElementById("authEmail")?.value || "").trim();
  if (!email || !email.includes("@")) {
    _showAuthMsg("Entre ton adresse e-mail ci-dessus, puis reclique sur « Mot de passe oublié ».", "error");
    return;
  }
  try {
    const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    if (error) { _showAuthMsg(error.message || "Échec de l'envoi.", "error"); return; }
    _showAuthMsg("📧 E-mail de réinitialisation envoyé. Vérifie ta boîte (et les spams).", "success");
  } catch (e) {
    _showAuthMsg("Erreur réseau. Vérifie ta connexion.", "error");
  }
}

// ── Confirmation d'e-mail : renvoyer le lien ────────────────────────────────
//
// Depuis l'activation de « Confirm email » (SMTP Brevo, 2026-08-30), `signUp`
// ne rend PLUS de session : le compte existe mais reste inutilisable tant que
// l'adresse n'est pas confirmée. Sans ce renvoi, un lien non reçu (spam, boîte
// pleine, lien expiré au bout de 24 h) enferme la personne : l'inscription
// répond « cet e-mail est déjà utilisé », la connexion « confirme ton e-mail »,
// et aucun des deux écrans n'offrait de sortie.
//
// L'adresse est mémorisée par _showResendConfirmation pour que le lien reste
// utilisable après un changement d'onglet piloté par le code, mais la valeur
// SAISIE prime toujours : on renvoie là où la personne regarde.
function _showResendConfirmation(email) {
  _pendingConfirmEmail = String(email || "").trim();
  const el = document.getElementById("authResendLink");
  if (el) el.style.display = _pendingConfirmEmail ? "" : "none";
}

async function onbResendConfirmation() {
  const saisi = (document.getElementById("authEmail")?.value || "").trim();
  const email = saisi || _pendingConfirmEmail;
  if (!email || !email.includes("@")) {
    _showAuthMsg("Entre ton adresse e-mail ci-dessus, puis reclique sur « Renvoyer ».", "error");
    return;
  }
  try {
    // Absent du client de repli hors ligne comme des SDK antérieurs à 2.7 :
    // le dire, plutôt que de lever un TypeError avalé en « erreur réseau ».
    if (!supa || !supa.auth || typeof supa.auth.resend !== "function") {
      _showAuthMsg("Renvoi indisponible pour l'instant. Réessaie dans un moment.", "error");
      return;
    }
    const { error } = await supa.auth.resend({ type: "signup", email });
    if (error) {
      let m = error.message || "Échec de l'envoi.";
      // Supabase impose un délai minimal entre deux envois (anti-abus) : le
      // message brut est en anglais et cite des secondes, on le rend lisible.
      if (/security purposes|rate limit|too many/i.test(m)) m = "Un e-mail vient déjà d'être envoyé. Patiente une minute avant de réessayer.";
      _showAuthMsg(m, "error");
      return;
    }
    // Supabase ne dit JAMAIS si l'adresse existe ou est déjà confirmée
    // (anti-énumération) : le message ne doit rien affirmer de plus que l'envoi.
    _showAuthMsg("📧 Si ce compte attend une confirmation, le lien vient d'être renvoyé. Pense aux spams.", "success");
  } catch (e) {
    _showAuthMsg("Erreur réseau. Vérifie ta connexion.", "error");
  }
}

// ── Connexion Google (OAuth) : redirige vers Google puis revient sur l'app ──
// Nécessite le provider Google activé dans le Dashboard Supabase (Authentication
// → Providers → Google). Le retour est géré par onAuthStateChange (boot, app-08)
// qui voit le flag passio_oauth_pending et finalise l'entrée dans l'app.
async function onbGoogleAuth() {
  try {
    try { localStorage.setItem("passio_oauth_pending", "1"); } catch (e) {}
    const { error } = await supa.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) {
      try { localStorage.removeItem("passio_oauth_pending"); } catch (e) {}
      _showAuthMsg(error.message || "Connexion Google indisponible.", "error");
    }
  } catch (e) {
    try { localStorage.removeItem("passio_oauth_pending"); } catch (e) {}
    _showAuthMsg("Connexion Google indisponible.", "error");
  }
}

// ── Récupération de mot de passe : UI minimale affichée quand Supabase émet
// l'événement PASSWORD_RECOVERY (retour depuis le lien e-mail). ──
function _showPasswordRecoveryUI() {
  if (document.getElementById("pwdRecoveryOverlay")) return;
  const ov = document.createElement("div");
  ov.id = "pwdRecoveryOverlay";
  ov.style.cssText = "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px;";
  ov.innerHTML =
    '<div style="background:var(--bg-card,#fff);border-radius:18px;padding:24px;max-width:360px;width:100%;box-shadow:0 12px 48px rgba(0,0,0,0.3);">' +
      '<div style="font-size:18px;font-weight:800;margin-bottom:6px;">Nouveau mot de passe</div>' +
      '<div style="font-size:13px;color:var(--muted);margin-bottom:16px;">Choisis un nouveau mot de passe pour ton compte.</div>' +
      '<input type="password" id="pwdRecoveryInput" placeholder="••••••••" minlength="6" autocomplete="new-password" class="input" style="width:100%;box-sizing:border-box;font-size:16px;margin-bottom:8px;"/>' +
      '<div id="pwdRecoveryMsg" style="font-size:12px;min-height:16px;margin-bottom:10px;"></div>' +
      '<button id="pwdRecoveryBtn" class="btn primary block" style="padding:13px;font-weight:800;">Valider</button>' +
    '</div>';
  document.body.appendChild(ov);
  const input = ov.querySelector("#pwdRecoveryInput");
  const btn = ov.querySelector("#pwdRecoveryBtn");
  const msg = ov.querySelector("#pwdRecoveryMsg");
  setTimeout(function () { try { input.focus(); } catch (e) {} }, 50);
  btn.onclick = async function () {
    const pwd = input.value || "";
    if (pwd.length < 6) { msg.style.color = "#e11d48"; msg.textContent = "Au moins 6 caractères."; return; }
    btn.disabled = true; btn.textContent = "…";
    try {
      const { error } = await supa.auth.updateUser({ password: pwd });
      if (error) { msg.style.color = "#e11d48"; msg.textContent = error.message; btn.disabled = false; btn.textContent = "Valider"; return; }
      msg.style.color = "#16a34a"; msg.textContent = "✅ Mot de passe mis à jour.";
      if (typeof state !== "undefined") { state.onboarded = true; try { saveState(); } catch (e) {} }
      setTimeout(function () { window.location.reload(); }, 900);
    } catch (e) {
      msg.style.color = "#e11d48"; msg.textContent = "Erreur réseau."; btn.disabled = false; btn.textContent = "Valider";
    }
  };
  input.onkeypress = function (e) { if (e.key === "Enter") btn.click(); };
}
window._showPasswordRecoveryUI = _showPasswordRecoveryUI;

function _showAuthMsg(text, type) {
  const el = document.getElementById("authMsg");
  if (!el) return;
  el.textContent = text;
  el.className = "onb-auth-msg " + type;
}

// Normalise un numéro de téléphone : garde le « + » de tête (international) et
// les chiffres, supprime espaces/points/tirets/parenthèses. Renvoie "" si vide.
function normalizePhone(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const plus = s[0] === "+" ? "+" : "";
  return plus + s.replace(/[^\d]/g, "");
}

async function onbDoAuth() {
  const email = (document.getElementById("authEmail")?.value || "").trim();
  const pwd = document.getElementById("authPassword")?.value || "";
  const pwd2 = document.getElementById("authPasswordConfirm")?.value || "";
  const phone = normalizePhone(document.getElementById("authPhone")?.value || "");
  const btn = document.getElementById("authSubmitBtn");

  // Validation de format stricte (en plus de la confirmation par e-mail Supabase).
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!EMAIL_RE.test(email)) { _showAuthMsg("Adresse e-mail invalide.", "error"); return; }
  if (pwd.length < 6) { _showAuthMsg("Le mot de passe doit contenir au moins 6 caractères.", "error"); return; }
  if (_authMode === "signup" && pwd !== pwd2) { _showAuthMsg("Les mots de passe ne correspondent pas.", "error"); return; }
  // Numéro obligatoire à la création (demandé au même titre que l'e-mail) :
  // 8 à 15 chiffres, éventuellement précédés d'un indicatif « + » international.
  if (_authMode === "signup") {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) { _showAuthMsg("Numéro de téléphone invalide.", "error"); return; }
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="auth-loading"></span>' + (_authMode === "signin" ? "Connexion…" : "Création…"); }

  try {
    let result;
    if (_authMode === "signin") {
      result = await supa.auth.signInWithPassword({ email, password: pwd });
    } else {
      // Le numéro voyage dans user_metadata (auth.users) : jamais exposé aux
      // autres comptes (contrairement à `profiles`, en lecture publique), lisible
      // seulement côté serveur via service_role (centre de pilotage).
      result = await supa.auth.signUp({ email, password: pwd, options: { data: { phone } } });
      // Copie locale pour le profil et les prochaines synchros.
      try {
        if (typeof state !== "undefined") {
          state.user = state.user || {};
          state.user.general = state.user.general || {};
          state.user.general.phone = phone;
        }
      } catch (e) {}
    }
    const { data, error } = result;
    if (error) {
      let msg = error.message;
      if (msg.includes("Invalid login")) msg = "E-mail ou mot de passe incorrect.";
      if (msg.includes("already registered")) msg = "Cet e-mail est déjà utilisé. Connecte-toi.";
      // Seule sortie possible pour qui n'a jamais reçu le lien : sans ce renvoi,
      // le compte est inaccessible pour toujours (« déjà utilisé » à
      // l'inscription, « confirme ton e-mail » à la connexion, et rien d'autre).
      if (msg.includes("Email not confirmed")) {
        msg = "Confirme ton e-mail avant de te connecter.";
        _showResendConfirmation(email);
      }
      _showAuthMsg(msg, "error");
      if (btn) { btn.disabled = false; btn.textContent = _authMode === "signin" ? "Se connecter" : "Créer mon compte"; }
      return;
    }
    if (_authMode === "signup") {
      // Avec « Confirm email » activé, Supabase NE renvoie PAS d'erreur si l'e-mail
      // existe déjà (anti-énumération) : il renvoie un user aux `identities` vides.
      // On le détecte pour garantir « un seul compte par e-mail ».
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        // ⚠️ switchAuthTab() VIDE #authMsg (il remet la classe et le texte à zéro) :
        // basculer AVANT d'écrire, sinon l'explication est effacée dans la
        // milliseconde et l'écran change sans un mot. Ces deux branches ne sont
        // atteignables que depuis l'activation de « Confirm email » (2026-08-30) —
        // le défaut était donc invisible tant que signUp rendait une session.
        switchAuthTab("signin");
        _showAuthMsg("Cet e-mail est déjà utilisé. Connecte-toi.", "error");
        if (btn) { btn.disabled = false; btn.textContent = "Se connecter"; }
        return;
      }
      // Pas de session → e-mail à confirmer. On NE rentre PAS dans l'app sans
      // adresse confirmée (exigence : « il faut une adresse mail valide »).
      if (!data?.session) {
        switchAuthTab("signin");
        _showAuthMsg("✅ Compte créé ! Vérifie tes e-mails (et les spams) pour confirmer, puis reviens te connecter.", "success");
        _showResendConfirmation(email);
        if (btn) { btn.disabled = false; btn.textContent = "Se connecter"; }
        return;
      }
    }
    if (data?.session?.user) {
      MY_UID = data.session.user.id;
      localStorage.setItem("passio_uid", MY_UID);
      if (_authMode === "signin") {
        // Compte existant → marque onboardé et recharge : boot() lance l'app directement
        state.onboarded = true;
        saveState();
        window.location.reload();
        return;
      }
    }
    onbNext();
  } catch(e) {
    _showAuthMsg("Erreur réseau. Vérifie ta connexion.", "error");
    if (btn) { btn.disabled = false; btn.textContent = _authMode === "signin" ? "Se connecter" : "Créer mon compte"; }
  }
}

async function onbSkipAuth() {
  // Auth anonyme Supabase : donne un vrai auth.uid() aux utilisateurs sans compte,
  // indispensable depuis les policies RLS strictes (sinon publication impossible).
  // ⚠️ onbNext() AVANT l'await : la promesse de signInAnonymously() peut rester
  // bloquée par le verrou auth interne de supabase-js (constaté 2026-06-12, selon
  // le timing) — l'onboarding restait figé sur l'écran auth. L'UI avance tout de
  // suite ; MY_UID est posé par le retour ci-dessous OU par onAuthStateChange (boot).
  //
  // ⚠️ Mais pendant cette fenêtre, MY_UID peut encore porter l'identifiant du compte
  // PRÉCÉDENT de cet appareil (restauré depuis passio_uid au boot). Une écriture
  // partie là partirait sous une identité qui n'est plus la nôtre. On l'efface donc
  // AVANT d'avancer : les fonctions d'écriture testent toutes `!MY_UID` et
  // s'abstiennent — ne rien écrire vaut mieux qu'écrire sous le nom d'un autre.
  MY_UID = null;
  window.MY_UID = null;
  try { localStorage.removeItem("passio_uid"); } catch (e) {}
  onbNext();
  try {
    if (supa && supa.auth && typeof supa.auth.signInAnonymously === "function") {
      const { data, error } = await supa.auth.signInAnonymously();
      if (!error && data && data.session) {
        MY_UID = data.session.user.id;
        window.MY_UID = MY_UID;
        try { localStorage.setItem("passio_uid", MY_UID); } catch(e) {}
        console.log("Session anonyme créée");
      } else if (error) {
        console.warn("Auth anonyme refusée:", error.message);
      }
    }
  } catch(e) { console.warn("Auth anonyme indisponible:", e); }
}

// ── Écran « Qu'est-ce qui te passionne ? » (spec §5) ─────────────────────────
//
// Trois écarts corrigés par rapport à l'écran d'origine :
//
// ① Le plafond était de 3. La spec demande 1 minimum, 3 en recommandation, 7 au
//    maximum : « ne pas bloquer un utilisateur qui n'a réellement qu'une passion
//    forte simplement pour satisfaire un chiffre produit ».
// ② La copie disait « Chacune crée un profil dédié ». Depuis le lot 1 (V2),
//    c'est FAUX : un seul profil de départ est créé, les autres passions restent
//    des intérêts de Fil. L'écran promettait une mécanique que le code ne fait
//    plus.
// ③ Le profil de départ était choisi en silence (`selectedPassions[0]`).
//    La spec : « Ainsi, le choix n'est pas silencieux. »
//
// Tout est derrière onbV2Actif() : drapeau à false → ancienne copie, ancien
// plafond, aucune recherche, aucun sélecteur de départ.
var ONB_MAX_PASSIONS = 7;      // plafond V2 (spec §5)
var ONB_MAX_PASSIONS_V1 = 3;   // plafond historique, conservé pour le repli
var ONB_SEARCH_SEUIL = 12;     // « permettre la recherche si le catalogue devient long »

function onbMaxPassions() {
  return onbV2Actif() ? ONB_MAX_PASSIONS : ONB_MAX_PASSIONS_V1;
}

function renderPassionGrid() {
  const grid = $("#passionGrid");
  if (!grid) return;
  const v2 = onbV2Actif();
  const all = allPassions();

  const titreEl = $("#onbPassionsTitle");
  const texteEl = $("#onbPassionsText");
  if (titreEl) titreEl.textContent = v2 ? "Qu'est-ce qui te passionne ?" : "Tes premières passions";
  if (texteEl) {
    texteEl.textContent = v2
      ? "Choisis ce que tu veux voir dans ton Fil. Tu pourras tout modifier plus tard."
      : "Choisis 1 à 3 passions. Chacune crée un profil dédié.";
  }

  // ── Lot flat_passions_v1 : la grille devient une RECHERCHE ────────────────
  // « Recherche et choisis directement ce que tu aimes. » On ne fait plus
  // choisir dans une grille de 19 tuiles : on tape « Enduro », et c'est tout.
  //
  // ⚠️ MONTÉ UNE SEULE FOIS (`monterOnboarding` porte le garde). Cette fonction
  // est rappelée à CHAQUE sélection : re-monter le composant viderait le champ
  // et refermerait le clavier à chaque passion cochée.
  //
  // Hors lot, la suite de la fonction s'exécute exactement comme avant.
  if (typeof PassioFlatUI !== "undefined" && PassioFlatUI.actif()) {
    if (titreEl) titreEl.textContent = "Qu'est-ce qui te passionne ?";
    if (texteEl) texteEl.textContent = "Recherche et choisis directement ce que tu aimes.";
    const champHisto = $("#onbPassionSearch");
    if (champHisto) champHisto.style.display = "none";   // le sélecteur a le sien
    PassioFlatUI.monterOnboarding(grid, {
      selection: selectedPassions,
      max: onbMaxPassions(),
      onChangement: function (ids) {
        // On VIDE et on remplit le tableau en place. `selectedPassions` est
        // un `let` de portée script — donc absent de `window` : le réaffecter
        // depuis un autre fichier serait impossible, et `onbFinish` lit
        // `selectedPassions[0]` comme passion de départ.
        selectedPassions.length = 0;
        ids.forEach(function (id) { selectedPassions.push(id); });
        renderOnbStarter();
      },
    });
    renderOnbStarter();
    return;
  }

  // Recherche : n'apparaît qu'en V2 et qu'au-delà du seuil — un champ de
  // recherche au-dessus de douze tuiles ajoute une étape sans rien filtrer.
  const rechercheEl = $("#onbPassionSearch");
  const rechercheActive = v2 && all.length > ONB_SEARCH_SEUIL;
  let filtre = "";
  if (rechercheEl) {
    rechercheEl.style.display = rechercheActive ? "block" : "none";
    if (rechercheActive) filtre = (rechercheEl.value || "").trim().toLowerCase();
  }

  let visibles = all;
  if (filtre) {
    visibles = all.filter(function (p) {
      // Une passion déjà cochée reste visible même hors résultats : la voir
      // disparaître donnerait à croire qu'elle a été décochée.
      if (selectedPassions.includes(p.id)) return true;
      return String(p.label || "").toLowerCase().indexOf(filtre) >= 0
          || String(p.id || "").toLowerCase().indexOf(filtre) >= 0;
    });
  }

  const depart = v2 ? selectedPassions[0] : null;
  const tiles = visibles.map(p => `
    <div class="passion-tile ${selectedPassions.includes(p.id) ? "selected" : ""} ${p.custom ? "passion-custom" : ""}"
         data-passion="${escapeHtml(p.id)}"
         onclick="togglePassion('${escapeJsArg(p.id)}')">
      <div class="passion-tile-emoji">${p.emoji}</div>
      <div class="passion-tile-label">${escapeHtml(p.label)}</div>
      ${p.custom ? '<div class="passion-custom-badge">custom</div>' : ''}
      ${p.id === depart ? '<div class="passion-depart-badge" data-depart="1" style="position:absolute;top:4px;left:5px;font-size:11px;">★</div>' : ''}
    </div>
  `).join("");
  // ⛔ Tuile masquée tant que `passionsPersoSuspendues()` : voir la note de
  // `openCreateCustomPassion`. Le garde du point de convergence reste en place.
  const createTile = passionsPersoSuspendues() ? "" : `
    <div class="passion-tile passion-tile-create" onclick="openCreateCustomPassion()">
      <div class="passion-tile-emoji">＋</div>
      <div class="passion-tile-label">Créer la mienne</div>
    </div>
  `;
  // Tuile masquée tant que la création est suspendue (hotfix 2026-08-30) : une
  // porte qui refuse au tap est un cul-de-sac. Le garde d'`openCreateCustomPassion`
  // reste en place — il couvre tout appelant que ce masquage oublierait.
  const _peutCreer = !(typeof passionsPersoSuspendues === "function" && passionsPersoSuspendues());
  grid.innerHTML = tiles + ((filtre || !_peutCreer) ? "" : createTile);

  renderOnbStarter();
}

// Le profil de départ, énoncé et modifiable (spec §5).
//
// Le tap sur une tuile est déjà pris : il coche/décoche. Le surcharger pour
// « promouvoir en départ » rendrait le décochage imprévisible. D'où une rangée
// dédiée sous la grille, où le tap ne veut dire qu'une chose.
function renderOnbStarter() {
  const hote = $("#onbStarter");
  if (!hote) return;
  if (!onbV2Actif() || selectedPassions.length === 0) {
    hote.style.display = "none";
    hote.innerHTML = "";
    return;
  }

  const depart = selectedPassions[0];
  const puces = selectedPassions.map(function (id) {
    const p = passionById(id);
    const actif = id === depart;
    return '<button type="button" class="onb-starter-chip" data-passion-depart="' + escapeHtml(id) + '"'
      + ' onclick="setStarterPassion(\'' + escapeJsArg(id) + '\')"'
      + ' aria-pressed="' + (actif ? "true" : "false") + '"'
      + ' style="display:inline-flex;align-items:center;gap:5px;padding:7px 11px;border-radius:999px;font-size:12px;'
      + 'cursor:pointer;min-height:34px;border:1.5px solid ' + (actif ? "var(--accent)" : "var(--border)") + ';'
      + 'background:' + (actif ? "var(--accent)" : "var(--bg-card)") + ';'
      + 'color:' + (actif ? "#fff" : "var(--text)") + ';font-weight:' + (actif ? "700" : "600") + ';">'
      + (actif ? "★ " : "") + (p && p.emoji ? p.emoji : "✨") + " " + escapeHtml((p && p.label) ? p.label : id)
      + '</button>';
  }).join("");

  hote.innerHTML =
      '<div style="font-size:12px;font-weight:700;margin-bottom:5px;">Ta passion de départ</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + puces + '</div>'
    + '<div style="font-size:11px;color:var(--muted);margin-top:6px;line-height:1.45;">'
    +   'Tu pourras ajouter d\'autres passions ensuite. Les autres passions choisies '
    +   'alimentent ton Fil sans que tu aies à les créer.'
    + '</div>';
  hote.style.display = "block";
}

// Désigne la passion de départ en la plaçant en tête : `selectedPassions[0]` est
// la seule définition du profil de départ (onbFinish la lit là), et l'ordre de
// la liste n'a pas d'autre usage que celui-là.
function setStarterPassion(id) {
  const idx = selectedPassions.indexOf(id);
  if (idx <= 0) return;                     // absente, ou déjà en tête
  selectedPassions.splice(idx, 1);
  selectedPassions.unshift(id);
  renderPassionGrid();
}

// ⛔ CRÉATION DE PASSIONS PERSONNALISÉES SUSPENDUE
// (hotfix du 2026-08-30, MAINTENUE sur ADR-010 par arbitrage de Benjamin
//  le 2026-08-31.)
//
// LE MOTIF TECHNIQUE. Une passion personnalisée reçoit un id `custom_<slug>_<rand>`
// qui ne vit que dans l'état local. Or `posts`, `profiles`, `stories`, `events`
// et `conversations` portent une clé étrangère vers `passions(id)`, table qui
// n'a qu'une policy SELECT : aucun client ne peut y insérer la ligne. Publier
// dans une telle passion échoue en 23503, définitivement.
//
// ⚠️ LE MOTIF PRODUIT, qui décide seul de la question. La sortie A permettait de
// la garder comme centre d'intérêt du fil, puisque le filtre de lecture est
// 100 % local. Mais une passion non canonique ne peut alimenter AUCUN contenu
// serveur : la conserver comme NOUVEAU centre d'intérêt créerait un filtre sans
// contenu — une fonctionnalité qui ne peut rien montrer. ADR-010 ne rouvre donc
// pas cette porte.
//
// CE QUI N'EST PAS TOUCHÉ : les passions déjà créées restent dans
// `state.user.customPassions`, restent publiées dans le jsonb `profiles.passions`
// (qui ne porte aucune clé étrangère), et leurs publications restent en place.
// Aucune suppression, aucune transformation.
//
// LA SUITE : « Proposer une passion », avec validation avant ajout au référentiel
// canonique. Hors périmètre d'ADR-010.
//
// ⚠️ Masquer les tuiles NE SUFFIT PAS : un appelant futur passerait à côté du
// masquage. Garder sans masquer offrirait une porte qui refuse au tap. Les deux
// sont nécessaires — c'est le point de convergence qui fait foi.
function passionsPersoSuspendues() { return true; }

function openCreateCustomPassion() {
  if (passionsPersoSuspendues()) {
    openModal('\
      <div class="modal-handle"></div>\
      <div class="modal-title">🌟 Créer ta passion</div>\
      <div style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:16px;">\
        La création de passions personnalisées est <b>momentanément indisponible</b>.\
        Une passion à toi ne peut pas encore recevoir de contenu : tu te retrouverais\
        avec un filtre qui ne montre rien.<br/><br/>\
        Tes passions déjà créées ne sont pas touchées : elles restent sur ton profil.\
        Choisis une passion du catalogue pour publier dès maintenant.\
      </div>\
      <button class="btn primary block" onclick="closeModal()">J\'ai compris</button>\
    ');
    return;
  }

  const palette = [
    { emoji: "⭐", color: "#8b5cf6" },
    { emoji: "🎯", color: "#8b5cf6" },
    { emoji: "🔥", color: "#7c3aed" },
    { emoji: "💡", color: "#7c3aed" },
    { emoji: "🌿", color: "#8b5cf6" },
    { emoji: "🎭", color: "#a78bfa" },
    { emoji: "⚡", color: "#a78bfa" },
    { emoji: "🛸", color: "#a78bfa" },
    { emoji: "🧩", color: "#a78bfa" },
    { emoji: "🦄", color: "#c4b5fd" },
    { emoji: "🌈", color: "#7c3aed" },
    { emoji: "♟", color: "#8b5cf6" },
  ];
  window._customPassionDraft = { emoji: "⭐", color: "#8b5cf6" };

  // Voir les demandes en attente
  var pending = JSON.parse(localStorage.getItem("passio_passion_requests") || "[]");
  var pendingHTML = pending.length ? '<div style="margin-bottom:14px;"><div style="font-weight:700;font-size:12px;color:var(--text);margin-bottom:6px;">📋 Mes demandes en cours</div>' +
    pending.map(function(r) {
      var statusColor = r.status === "approved" ? "#10b981" : r.status === "rejected" ? "#ef4444" : "#f59e0b";
      var statusLabel = r.status === "approved" ? "✅ Approuvée" : r.status === "rejected" ? "❌ Refusée" : "⏳ En attente";
      return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;margin-bottom:4px;">' +
        '<span style="font-size:18px;">' + r.emoji + '</span>' +
        '<div style="flex:1;"><div style="font-weight:700;font-size:12px;">' + escapeHtml(r.name) + '</div><div style="font-size:10px;color:var(--muted);">' + escapeHtml(r.reason || "") + '</div></div>' +
        '<span style="font-size:10px;font-weight:700;color:' + statusColor + ';">' + statusLabel + '</span>' +
      '</div>';
    }).join("") + '</div>' : '';

  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">🌟 Créer ta passion</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:14px;line-height:1.5;">Ta passion est ajoutée tout de suite, rien que pour toi : elle sert à choisir ce que tu vois dans ton fil. Elle n'entre pas dans le catalogue commun, et on ne peut pas encore publier dedans.</div>

    ${pendingHTML}

    <label class="field">
      <span>Nom de la passion</span>
      <input type="text" class="input" id="customPassionName" placeholder="Ex: Astronomie, Jonglage, Calligraphie…" maxlength="30" />
    </label>

    <label class="field">
      <span>Pourquoi cette passion ?</span>
      <textarea class="textarea" id="customPassionReason" placeholder="Décris en quelques mots pourquoi tu veux cette catégorie, combien de personnes seraient intéressées…" maxlength="200" style="min-height:70px;"></textarea>
    </label>

    <label class="field">
      <span>Es-tu créateur/influenceur dans ce domaine ?</span>
      <div style="display:flex;gap:8px;margin-top:4px;">
        <button class="pill" id="creatorYes" onclick="document.getElementById('creatorYes').classList.add('active');document.getElementById('creatorNo').classList.remove('active');">✅ Oui</button>
        <button class="pill" id="creatorNo" onclick="document.getElementById('creatorNo').classList.add('active');document.getElementById('creatorYes').classList.remove('active');">Non</button>
      </div>
    </label>

    <label class="field">
      <span>Lien vers ton contenu (optionnel)</span>
      <input type="url" class="input" id="customPassionLink" placeholder="https://instagram.com/..." maxlength="100" />
    </label>

    <div class="field">
      <span class="field-label">Choisis un symbole</span>
      <div class="emoji-palette" id="customEmojiPalette">
        ${palette.map((opt, i) => `
          <button type="button" class="emoji-chip ${i === 0 ? 'selected' : ''}" data-emoji="${escapeHtml(opt.emoji)}" data-color="${escapeHtml(opt.color)}" onclick="selectCustomEmoji('${escapeJsArg(opt.emoji)}','${escapeJsArg(opt.color)}')">${opt.emoji}</button>
        `).join("")}
      </div>
    </div>

    <div class="field">
      <span class="field-label">Aperçu</span>
      <div class="passion-preview" id="customPassionPreview">
        <div class="passion-tile selected" style="max-width:120px;">
          <div class="passion-tile-emoji" id="previewEmoji">⭐</div>
          <div class="passion-tile-label" id="previewLabel">Ma passion</div>
        </div>
      </div>
    </div>

    <div style="background:rgba(139,92,246,0.06);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:14px;">
      <div style="font-size:11px;color:var(--text);line-height:1.5;">
        <b>📌 Critères d'approbation :</b><br>
        · La passion n'existe pas déjà dans PASSIO<br>
        · Elle concerne un centre d'intérêt réel et partagé<br>
        · Elle respecte les règles de la communauté<br>
        · Les créateurs/influenceurs sont prioritaires
      </div>
    </div>

    <button class="btn primary block" onclick="submitPassionRequest()">📩 Envoyer ma demande</button>
  `);
  setTimeout(() => {
    const input = document.getElementById("customPassionName");
    if (input) {
      input.addEventListener("input", () => {
        const v = input.value.trim();
        const lbl = document.getElementById("previewLabel");
        if (lbl) lbl.textContent = v || "Ma passion";
      });
      input.focus();
    }
  }, 60);
}

function selectCustomEmoji(emoji, color) {
  window._customPassionDraft = { emoji, color };
  const prev = document.getElementById("previewEmoji");
  if (prev) prev.textContent = emoji;
  const chips = document.querySelectorAll("#customEmojiPalette .emoji-chip");
  chips.forEach(c => c.classList.toggle("selected", c.getAttribute("data-emoji") === emoji));
  const tile = document.querySelector("#customPassionPreview .passion-tile");
  if (tile) tile.style.borderColor = color;
}

function submitPassionRequest() {
  const input = document.getElementById("customPassionName");
  const name = input ? input.value.trim() : "";
  if (name.length < 2) { toast("Donne un nom à ta passion (2+ caractères)"); return; }
  const reason = (document.getElementById("customPassionReason") || {}).value || "";
  const link = (document.getElementById("customPassionLink") || {}).value || "";
  const isCreator = document.getElementById("creatorYes") && document.getElementById("creatorYes").classList.contains("active");
  const draft = window._customPassionDraft || { emoji: "⭐", color: "#8b5cf6" };

  const request = {
    id: "req_" + uid(),
    name: name,
    emoji: draft.emoji,
    color: draft.color,
    reason: reason,
    link: link,
    isCreator: isCreator,
    status: "pending",
    createdAt: Date.now(),
  };

  // Sauvegarder la demande localement
  var requests = JSON.parse(localStorage.getItem("passio_passion_requests") || "[]");
  requests.unshift(request);
  localStorage.setItem("passio_passion_requests", JSON.stringify(requests));

  // Envoyer dans Supabase si disponible
  if (typeof supa !== "undefined") {
    try {
      supa.from("passion_requests").insert({
        id: request.id,
        user_id: MY_UID,
        name: name,
        emoji: draft.emoji,
        reason: reason,
        link: link,
        is_creator: isCreator,
        status: "pending",
        created_at: new Date().toISOString(),
      });
    } catch(e) {}
  }

  closeModal();
  // ⚠️ Ce message annonçait « Demande envoyée ! Tu seras notifié quand elle sera
  // examinée », et la modale promettait une revue « par l'équipe PASSIO […] sous
  // 48h ». Aucune revue n'a jamais existé : le code auto-approuvait après cinq
  // secondes. Une promesse de modération humaine qu'aucun humain ne tient n'est
  // pas un détail de formulation — on dit ce que le produit fait.
  toast("✨ Passion ajoutée à tes passions", "success");

  // Ajout IMMÉDIAT. C'était un `setTimeout(…, 5000)` commenté « Simuler une
  // approbation après 5 secondes pour la démo » : la passion n'existait donc pas
  // pendant 5 secondes, et le toast de succès mentait sur son propre effet.
  // La passion est PERSONNELLE (`state.user.customPassions`, jamais publiée) :
  // il n'y a rien à approuver, et personne pour le faire.
  (function() {
    var reqs = JSON.parse(localStorage.getItem("passio_passion_requests") || "[]");
    var req = reqs.find(function(r) { return r.id === request.id; });
    if (req) {
      req.status = "approved";
      localStorage.setItem("passio_passion_requests", JSON.stringify(reqs));

      // Créer la passion automatiquement
      var newPassion = {
        id: "custom_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20) + "_" + Math.random().toString(36).slice(2, 6),
        emoji: draft.emoji,
        label: name,
        color: draft.color,
        custom: true,
        approved: true,
        createdAt: Date.now(),
      };
      if (!state.user.customPassions) state.user.customPassions = [];
      state.user.customPassions.push(newPassion);
      saveState();
      if (typeof renderExplorer === "function") renderExplorer();
    }
  })();
}

function saveCustomPassion() {
  // Redirige vers le nouveau flow de demande
  submitPassionRequest();
}

function togglePassion(id) {
  const idx = selectedPassions.indexOf(id);
  if (idx >= 0) selectedPassions.splice(idx, 1);
  else {
    const max = onbMaxPassions();
    if (selectedPassions.length >= max) { toast("Max " + max + " passions pour commencer"); return; }
    selectedPassions.push(id);
  }
  renderPassionGrid();
}

// ── Onboarding V2 — intérêts Feed ────────────────────────────────────────────
// Drapeau de repli. Mettre window.PASSIO_ONBOARDING_V2 = false AVANT le boot
// rebascule tout le lot sur l'ancien parcours, sans toucher au code.
function onbV2Actif() {
  try { return window.PASSIO_ONBOARDING_V2 !== false; } catch (e) { return true; }
}

// SOURCE DE VÉRITÉ des intérêts du Fil.
//
// Il y en avait deux, jamais synchronisées : `_activeFeedPassions` (Set runtime,
// lu par le rendu) et `state.selectedFeedPassions` (déclaré app-02 l.58, validé
// au chargement… et JAMAIS écrit ni lu ailleurs — état mort). Résultat mesuré le
// 2026-08-22 : les passions choisies à l'inscription n'alimentaient pas le Fil,
// et aucun filtre ne survivait à un rechargement.
//
// Cette fonction est le seul endroit qui écrit les deux à la fois. Tout appelant
// qui modifie les intérêts DOIT passer par ici, sinon la divergence revient.
// ══════════════════════════════════════════════════════════════════════════
// SÉLECTIONS DU FIL — « Suivis », passions et envies, en OU INCLUSIF
// ──────────────────────────────────────────────────────────────────────────
// ⚠️ CE QUI CHANGE PAR RAPPORT À ADR-010, et pourquoi. ADR-010 avait posé deux
// VUES EXCLUSIVES : « Accueil » (union passions + suivis) et « Suivis » (rien
// d'autre). Toucher une passion quittait « Suivis », et allumer « Suivis »
// grisait les passions — la contradiction était rendue impossible plutôt
// qu'affichée. La refonte multi-passion remplace cette exclusivité par une
// SÉLECTION ADDITIVE : « Suivis » est un critère au même titre qu'une passion
// ou qu'une envie, et il reste coché pendant qu'on en ajoute d'autres.
//
// Une publication entre dans le fil si elle satisfait AU MOINS UN critère coché :
//     auteur suivi   OU   passion cochée   OU   envie cochée
// Les résultats sont fondus dans UNE liste, dédupliquée par `p.id`, puis classés
// par le moteur existant (`rankFeedPosts` / bonus d'intention). Aucune section
// par source, par passion ni par envie.
//
// ⚠️ CE QUI NE REVIENT PAS EN ARRIÈRE — la persistance. L'ancienne bascule
// `_showFollowingFeed` était une variable de portée script jamais écrite : elle
// repartait à `false` à chaque ouverture, donc suivre quelqu'un n'avait aucun
// effet durable. « Suivis » vit désormais dans `state.feedFollowingOn`,
// sauvegardé, et les deux anciennes vues s'y migrent à `true` (loadState).
//
// ⚠️ Ces sélections sont un état de LECTURE. Elles ne touchent jamais à la
// passion de publication (`currentProfileId`) — cf. ADR-010, décision 6.
// ══════════════════════════════════════════════════════════════════════════
// LA BULLE DE PASSION — UN SEUL COMPOSANT, DEUX SURFACES
// ──────────────────────────────────────────────────────────────────────────
// Le Fil (multi-sélection) et le Profil (choix unique) affichent désormais la
// MÊME bulle : mêmes classes `.profile-tile*`, donc mêmes dimensions, mêmes
// espacements, mêmes états visuels. C'est une exigence de la refonte
// multi-passion (§1 et §7), et c'est aussi une leçon de ce dépôt : les deux
// tables de libellés de mood, puis les deux écrans de profil, avaient divergé
// parce que chacun portait sa copie du rendu.
//
// ⚠️ LE GESTIONNAIRE N'EST PAS UNE CHAÎNE LIBRE. `action` désigne l'un des
// quatre gestes possibles, et chaque branche écrit son appel EN TOUTES LETTRES
// ci-dessous. Laisser l'appelant fournir la chaîne d'`onclick` aurait fait
// entrer une valeur non relue dans un attribut `on*` — exactement ce que
// `audit:echappement` refuse, et il a raison : un gestionnaire doit se relire à
// l'oeil, sans remonter la provenance de la chaîne. Seul `arg` circule, et il
// passe par `escapeJsArg`.
//
// Champs : { emoji, label, photoUrl, fallbackUrl, count, selected, dimmed,
//            action, arg, title, tileKey }
function _passionTileOnclick(action, arg) {
  var a = escapeJsArg(String(arg == null ? "" : arg));
  if (action === "feedFollowing")  return "toggleFeedFollowing()";
  if (action === "feedPassion")    return "toggleProfileFilter('" + a + "')";
  if (action === "profilePassion") return arg == null ? "setProfilePassion(null)" : "setProfilePassion('" + a + "')";
  if (action === "visitedPassion") return "setVisitedPassion('" + a + "')";
  return "";
}

// ⚠️ PAS D'ACTIVATION CLAVIER ICI, ET C'EST DÉLIBÉRÉ (mesuré le 2026-08-31).
// Une bulle est un `<div role="button" tabindex="0">`, donc Entrée et Espace
// doivent l'activer — mais `app-08` porte DÉJÀ un délégué générique qui active
// tout `[role="button"]` non natif, et il est le bon endroit pour ça. Ajouter
// ici un second écouteur produisait DEUX activations pour une touche.
//
// Tant que le geste était une AFFECTATION (`filtre = 'pp_pod'`), la répétition
// était idempotente et invisible ; devenue une BASCULE avec la multisélection,
// elle s'annulait — la touche ne faisait plus rien du tout, sans la moindre
// erreur. Le délégué d'app-08 documente exactement ce piège à propos des
// `.nav-item`, qu'il exclut « pour ne pas activer deux fois ».
//
// Règle générale : ne jamais ajouter d'activation clavier pour un `role="button"`
// dans ce dépôt — elle existe, une fois, dans `app-08`.

function passionTileHTML(o) {
  o = o || {};
  var emoji = String(o.emoji || "✨");
  var label = String(o.label || "Passion");
  var selected = !!o.selected;
  var dimmed = !!o.dimmed;
  var avatarContent = o.photoUrl
    ? '<img loading="lazy" decoding="async" class="profile-tile-photo" src="' + safeUrlAttr(o.photoUrl) + '" alt="' + escapeHtml(label) + '"'
      + (o.fallbackUrl ? ' onerror="this.onerror=null;this.src=\'' + escapeJsArg(o.fallbackUrl) + '\'"' : '')
      + '/><span class="profile-tile-emoji-badge">' + escapeHtml(emoji) + '</span>'
      + '<span class="profile-tile-glyph" aria-hidden="true">' + escapeHtml(emoji) + '</span>'
    : escapeHtml(emoji) + '<span class="profile-tile-glyph" aria-hidden="true">' + escapeHtml(emoji) + '</span>';
  var badge = (o.count > 0)
    ? '<span class="profile-tile-count" style="position:absolute;top:-5px;right:-5px;background:var(--accent);color:#fff;font-size:9px;font-weight:800;border-radius:8px;padding:1px 5px;min-width:16px;text-align:center;border:2px solid var(--bg);line-height:14px;">' + Number(o.count) + '</span>'
    : '';
  return '<div class="profile-tile ' + (selected ? "active" : "") + '"'
    + ' onclick="' + _passionTileOnclick(o.action, o.arg) + '"'
    + ' title="' + escapeHtml(o.title || label) + '"'
    // Cle d'identification de la bulle, pour la resynchronisation et les tests.
    // Le neutre « Toutes » porte la chaine vide, comme la selection qu'il pose.
    + (o.tileKey === undefined ? "" : ' data-passion-tile="' + escapeHtml(String(o.tileKey)) + '"')
    + ' role="button" tabindex="0" aria-pressed="' + (selected ? "true" : "false") + '"'
    + ' style="opacity:' + (dimmed ? "0.3" : "1") + ';transform:' + (selected ? "scale(1.07)" : "scale(1)") + ';transition:all 0.2s;">'
    + '<div class="profile-tile-avatar" style="position:relative;' + (o.photoUrl ? "overflow:hidden;" : "") + (o.avatarStyle || "") + '">'
    + avatarContent + badge + '</div>'
    + '<div class="profile-tile-label" style="font-weight:' + (selected ? "800" : "600") + ';color:' + (selected ? "var(--accent)" : "") + ';">'
    + escapeHtml(label) + '</div>'
    + '</div>';
}

// ⚠️ `passionChipHTML` A VÉCU ICI LE 2026-09-02, ET SEULEMENT CE JOUR-LÀ. Elle
// rendait le rail du profil en pastilles de texte (emoji · libellé · décompte),
// sur une lecture trop littérale de « enlève les onglets ronds violets sous le
// pseudo des passions, c'est trop gros trop visible ; tu mets juste les passions
// en question, fin élégant » : Benjamin visait la LIGNE DE TITRES de la carte
// d'identité, qui répétait les mêmes mots 5 px plus haut. Verdict le soir même :
// « sur le profil remets les bulles rondes comme avant, pas de rangée de
// passions ovale. » La ligne de titres reste retirée, la bulle revient, et la
// fonction part avec ses règles CSS plutôt que de survivre sans appelant.
//
// Ce qu'il faut en retenir avant de refaire une pastille : le Fil et le Profil
// affichent la MÊME bulle (`passionTileHTML` ci-dessus), c'est une exigence de
// la refonte multi-passion (§1 et §7) et une leçon de ce dépôt — les deux tables
// de libellés de mood, puis les deux écrans de profil, ont divergé parce que
// chacun portait sa copie du rendu.

// ── LE RAIL DE PASSIONS EST COULISSANT — GARDER SA POSITION ───────────────
// Depuis le 2026-09-02 les bulles ont une largeur FIXE : la rangée déborde et
// se fait défiler au doigt (`.profile-strip { overflow-x: auto }`). Réécrire
// `innerHTML` remet alors `scrollLeft` à ZÉRO — et la bulle qu'on venait de
// toucher tout à droite sortait de l'écran à l'instant même où elle s'allumait,
// puisque cocher une passion change le HTML du rail et le fait reconstruire.
//
// Tout point qui réécrit un `.profile-strip` passe donc par ici plutôt que
// d'écrire `innerHTML` directement. La position est reposée SYNCHRONEMENT :
// le navigateur calcule la mise en page à la demande sur l'affectation, donc
// rien ne clignote, et une rangée devenue plus courte se borne d'elle-même.
function ecrireRailCoulissant(rail, html) {
  if (!rail) return;
  var x = rail.scrollLeft || 0;
  rail.innerHTML = html;
  if (x > 0) { try { rail.scrollLeft = x; } catch (e) {} }
}

// L'URL de la photo d'illustration d'une passion du catalogue (identifiant
// Unsplash), et son repli. Le Fil et le Profil en avaient deux copies.
function passionPhotoUrl(passionMeta) {
  var id = passionMeta && passionMeta.photo;
  return id ? "https://images.unsplash.com/" + id + "?w=200&h=200&fit=crop&crop=faces,entropy&auto=format&q=80" : null;
}
function passionPhotoFallback(passionId) {
  return "https://picsum.photos/seed/" + encodeURIComponent(String(passionId || "passion")) + "/200/200";
}

function feedFollowingSelected() {
  try { return state ? state.feedFollowingOn !== false : true; } catch (e) { return true; }
}

// Repeint le fil après un changement de sélection. Facteur commun des trois
// familles de critères : sans lui, chacune redécouvrait l'invalidation du guard
// no-op et le retour en tête de liste.
function _feedSelectionChanged() {
  // ⚠️ Invalider le guard no-op AVANT de repeindre. `renderFeed` sort tôt quand
  // la signature est inchangée ET que la liste a des enfants — et le repli
  // d'exploration écrit dans `_feedDomSig` une signature d'une AUTRE forme
  // (« repli§… »), incomparable à la nôtre. Un changement de sélection est un
  // geste explicite : il doit toujours repeindre.
  try { window._feedDomSig = null; } catch (e) {}
  try { if (typeof syncFeedViewUi === "function") syncFeedViewUi(); } catch (e) {}
  try { if (typeof renderProfileStrip === "function") renderProfileStrip(); } catch (e) {}
  try { renderFeed(); } catch (e) {}
  try {
    var appMain = document.getElementById("appMain");
    if (appMain) setTimeout(function () { appMain.scrollTop = 0; }, 60);
  } catch (e) {}
}

function setFeedFollowing(on) {
  var v = !!on;
  try {
    if (state.feedFollowingOn === v) return v;
    state.feedFollowingOn = v;
    // `feedView` n'est plus lue par le rendu. On la fige sur « accueil » pour
    // qu'un client ANTÉRIEUR relisant ce blob montre l'union (un sur-ensemble)
    // plutôt que de rester bloqué sur l'ancienne vue « suivis » seule.
    state.feedView = "accueil";
    saveState();
  } catch (e) {}
  _feedSelectionChanged();
  return v;
}

function toggleFeedFollowing() {
  return setFeedFollowing(!feedFollowingSelected());
}

// Compat : `setFeedView` reste appelable (liens anciens, tests, code en vol).
// Elle ne rend PLUS une vue exclusive — « suivis » coche simplement « Suivis ».
function setFeedView(vue) {
  setFeedFollowing(true);
  return (vue === "suivis") ? "suivis" : "accueil";
}

// Aligne l'interface sur la vue courante. Appelée à chaque `renderFeed` (le fil
// peut être repeint sans passer par `setFeedView` : boot, realtime, navigation).
//
// ⚠️ ELLE NE PILOTE PLUS DE COMMUTATEUR. La rangée « Accueil / Suivis » a été
// retirée le 2026-08-31 sur demande de Benjamin, après essai réel : elle coûtait
// une ligne de chrome en haut du Fil pour un choix que la tuile « Suivis » du
// rail exprime déjà. C'est `renderProfileStrip` (app-06) qui rend l'état de la
// vue, dans cette tuile.
//
// ⚠️ ELLE RESTE UTILE, et ce n'est pas une coquille vide : le bloc de passions
// était MASQUÉ en vue « Suivis » par la version précédente. Un compte qui a
// quitté l'application dans cet état porte encore `hidden` sur ce nœud au
// rechargement — l'attribut est dans le DOM servi, pas dans l'état. Sans cette
// remise à zéro, le rail resterait invisible pour toujours, tuile « Suivis »
// comprise : plus aucune commande pour en sortir. C'est le même piège que le
// filtre du Fil resté accroché à une passion archivée.
function syncFeedViewUi() {
  var bloc = document.getElementById("feedPassionsBlock");
  // On n'écrit QUE si la valeur change : ce nœud est dans #screen-feed, observé
  // par plusieurs lots UI, et une écriture inconditionnelle à chaque rendu
  // réveillerait leurs MutationObserver pour rien.
  if (bloc && bloc.hidden) bloc.hidden = false;
}

function setFeedPassions(ids, opts) {
  var liste = Array.isArray(ids) ? ids.filter(function (x) { return typeof x === "string" && x; }) : [];
  // Dédup en conservant l'ordre de sélection : le premier choisi est le primaire.
  var vues = {}, propre = [];
  for (var i = 0; i < liste.length; i++) {
    if (!vues[liste[i]]) { vues[liste[i]] = 1; propre.push(liste[i]); }
  }
  _activeFeedPassions = new Set(propre);
  try { state.selectedFeedPassions = propre.slice(); } catch (e) {}
  // Marqueur de migration explicite (spec §12). Dès qu'un écrit passe par ici,
  // le compte vit dans le nouveau modèle : `selectedFeedPassions` devient une
  // valeur, y compris quand elle est VIDE. Sans ce marqueur, une liste vide est
  // indiscernable d'une liste jamais renseignée, et restoreFeedPassions
  // « répare » un fil que l'utilisateur venait délibérément de vider.
  // L'amorçage depuis les profils passe `migration: true` pour ne pas se
  // marquer lui-même avant d'avoir tracé l'événement.
  try { if (!opts || opts.migration !== true) state.feedInterestsMigrated = true; } catch (e) {}
  if (!opts || opts.save !== false) { try { saveState(); } catch (e) {} }
  return propre;
}

// Restaure les intérêts persistés dans le Set runtime. Appelée au boot, sur TOUS
// les chemins de démarrage.
//
// Migration (spec §12) : un compte antérieur au lot Onboarding V2 n'a pas de
// `selectedFeedPassions` mais possède des profils passion. Sans amorçage, il
// retombe sur `nothingSelected` — c'est-à-dire l'écran « Choisis une passion »,
// fil VIDE (voir renderFeed : un Set vide ne veut pas dire « tout le fil »).
// On amorce donc depuis les passions uniques de ses profils. Aucun profil n'est
// supprimé ni modifié.
//
// ⚠️ Historique, à ne pas re-supprimer par erreur : cette migration a été
// retirée quelques heures le 2026-08-22 sur un MAUVAIS diagnostic. Elle faisait
// tomber profils-types.spec.js, et j'en avais conclu qu'elle « rétrécissait le
// fil des comptes existants ». Faux. La vraie cause était dans le test : il
// appelait toggleProfileFilter(passion) — une BASCULE — sur une passion que la
// migration venait justement d'activer, ce qui la DÉSACTIVAIT. Mesuré :
// passion publiée « musique », profil « musique ». Le test exprime désormais son
// intention (s'assurer que la passion est sélectionnée) au lieu de basculer.
function restoreFeedPassions() {
  var persistees = [];
  try { persistees = Array.isArray(state.selectedFeedPassions) ? state.selectedFeedPassions : []; } catch (e) {}
  if (persistees.length) return setFeedPassions(persistees, { save: false });

  // ── Le vide VOULU n'est pas le vide JAMAIS RENSEIGNÉ (spec §12) ────────────
  //
  // « Ne pas [migrer] si l'utilisateur a explicitement vidé ses filtres dans le
  // nouveau modèle : d'où l'intérêt d'un marqueur de migration explicite. »
  //
  // Mesuré le 2026-08-23, avant ce garde : un utilisateur qui décochait sa
  // DERNIÈRE passion obtenait bien un fil vide… et la retrouvait cochée au
  // rechargement suivant, la migration prenant sa liste vide pour une absence
  // de données. Son choix était défait en silence, à chaque démarrage.
  var dejaMigre = false;
  try { dejaMigre = state.feedInterestsMigrated === true; } catch (e) {}
  if (dejaMigre) { _activeFeedPassions = new Set(); return []; }

  var profils = [];
  try { profils = (state.user && Array.isArray(state.user.profiles)) ? state.user.profiles : []; } catch (e) {}
  var depuisProfils = profils.map(function (p) { return p && p.passion; })
                             .filter(function (x) { return typeof x === "string" && x; });
  if (!depuisProfils.length) { _activeFeedPassions = new Set(); return []; }

  var restaurees = setFeedPassions(depuisProfils, { migration: true });
  try {
    if (window.tel && tel.action) {
      tel.action("feed_interests_migrated", { n_interests: restaurees.length, source: "profiles" });
    }
  } catch (e) {}
  // La migration a eu lieu : elle ne doit plus jamais se rejouer sur ce compte.
  try { state.feedInterestsMigrated = true; saveState(); } catch (e) {}
  return restaurees;
}

function onbFinish() {
  if (selectedPassions.length === 0) {
    toast("Choisis au moins 1 passion.");
    return;
  }

  var v2 = onbV2Actif();
  var primaire = selectedPassions[0];

  // PROFILS — V2 : UN SEUL profil passion de départ (spec §6). Sélectionner trois
  // passions créait trois profils, soit une taxe d'identité imposée avant la
  // première valeur. Les autres passions restent des INTÉRÊTS de Fil ; l'utilisateur
  // crée un second profil plus tard, s'il en veut un.
  var passionsProfil = v2 ? [primaire] : selectedPassions;
  state.user.profiles = passionsProfil.map(function (pid) {
    var p = passionById(pid);
    return {
      id: uid(),
      name: state.user.name,
      passion: pid,
      emoji: p.emoji,
      bio: "Profil " + p.label + " · Débutant·e passionné·e",
      color: p.color,
      createdAt: Date.now(),
    };
  });
  state.user.currentProfileId = state.user.profiles[0].id;

  // INTÉRÊTS DU FIL — V2 : les passions choisies alimentent le Fil IMMÉDIATEMENT.
  // L'ancien code faisait `_activeFeedPassions = new Set()` ici même, avec le
  // commentaire « pas de filtre par défaut après onboarding » : l'utilisateur
  // atterrissait donc sur un fil qui ignorait ses choix.
  if (v2) {
    setFeedPassions(selectedPassions, { save: false });
  } else {
    _activeFeedPassions = new Set();
  }
  state.onboarded = true;

  // ADR-009 : plus aucune récompense d'activation (`first_login`, `daily`).
  // Le chemin de repli suit désormais le parcours V2 sur ce point.

  saveState();

  // ACTIVATION — aucune donnée personnelle. Les noms de clés évitent la liste
  // noire PII de telemetry.js : « passion_count » et « primary_passion_id »,
  // demandés par la spec, percutent « pass » et seraient jetés en SILENCE.
  // scripts/audit-telemetry-keys.js verrouille ce point.
  try {
    if (window.tel && tel.action) {
      tel.action("signup_completed", { signup_method: "email", flag_v2: v2 });
      tel.action("passions_selected", {
        n_interests: selectedPassions.length,
        primary_id: primaire,
        starter_profiles: state.user.profiles.length,
        flag_v2: v2,
      });
    }
  } catch (e) {}

  document.getElementById("onboarding").classList.remove("active");
  document.getElementById("landing").classList.remove("active");
  try { renderEverything(); } catch(e) { console.warn("renderEverything error:", e); }
  document.body.classList.add("screen-feed-active");

  try {
    if (v2 && window.tel && tel.action) {
      tel.action("personalized_feed_viewed", { n_interests: selectedPassions.length, flag_v2: true });
    }
  } catch (e) {}

  try { if (typeof supaInit === "function") supaInit(); } catch(e) {}
  // Flush IMMÉDIAT des profils-passion vers user_state dès la fin de l'onboarding.
  // Sans ça, si l'utilisateur ferme l'app dans les 2.5s suivant le choix de ses
  // passions, le debounce n'a pas eu le temps de sauvegarder → profils perdus à
  // la prochaine connexion. supaInit appelle aussi supaLoadUserState qui peut faire
  // un save, mais on garantit ici un flush explicite en parallèle.
  setTimeout(function() {
    try { if (typeof supaSaveUserState === "function") supaSaveUserState(); } catch(e) {}
    // ⚠️ L'onboarding est une sauvegarde EXPLICITE du pseudo et des passions,
    // mais il ne propose AUCUN contrôle de confidentialité : il n'a donc rien à
    // dire sur `is_private`, et ne l'envoie pas. Écrire `false` « parce qu'on
    // enregistre » rendrait public un compte que la ligne minimale a créé privé.
    // Le caractère explicite d'une action ne rend pas tous ses champs autoritaires.
    try {
      if (typeof supaSavePublicProfile === "function") {
        var _g = (state.user && state.user.general) || {};
        supaSavePublicProfile({ username: _g.username, bio: _g.bio });
      }
      if (typeof supaSavePassionState === "function") supaSavePassionState();
    } catch(e) {}
  }, 800);

  // Pas de tour forcé en V2 (spec §8) : « le tour long actuel ne doit pas suivre
  // l'inscription, la compréhension doit venir du produit lui-même ».
  //
  // ⚠️ Ne PAS se contenter de sauter l'appel ici. Mesuré le 2026-08-23 : le tour
  // réapparaissait ~800 ms après l'entrée sur PASSIO. `launchTourSafe` a QUATRE
  // appelants (ici, exitLanding, exitLandingAsAuth, initApp) et les trois autres
  // sont gardés par `if (!state.tourSeen)`. Sauter le seul appel d'onbFinish
  // laissait donc le drapeau à false : le premier des trois autres à s'exécuter
  // relançait le tour. La règle §8 était contournée en une seconde.
  //
  // Poser le drapeau exprime la règle là où elle se décide, sans dépendre de
  // quel appelant gagne la course. Le tour reste lançable à la main (« Tour
  // démo »), il n'est plus imposé.
  if (v2) {
    state.tourSeen = true;
    try { saveState(); } catch (e) {}
  } else {
    launchTourSafe();
  }

  // ── PREMIÈRE VISITE : transfert du mode invité ───────────────────────────
  // Migre les préférences locales (passions, spécialités, envies, état du tour)
  // vers le compte qui vient d'exister, puis restaure l'écran et le contenu
  // consultés et RAPPELLE l'action demandée.
  //
  // ⚠️ ELLE NE REJOUE AUCUNE ACTION. Publier, envoyer un message ou inscrire à
  // une activité automatiquement après une création de compte serait un effet
  // externe que personne n'a confirmé. Inerte si aucune préférence d'invité
  // n'existe — donc sans effet sur le parcours historique.
  try { if (window.PassioFirstRun) PassioFirstRun.apresAuthentification(); } catch (e) {}
}

// Recherche un post par id dans TOUTES les sources : seed (démo), posts perso
// (userPosts) ET posts réseau Supabase (vrais utilisateurs). De nombreux
// handlers ne regardaient que seed + userPosts → impossible d'ouvrir/commenter/
// réagir sur un vrai post d'un autre compte, et les notifs de like ne partaient
// pas. Centralisé le 2026-06-17. Voir [[project_passio]].
// ⚠️ PRIORITÉ ≠ CELLE DU FIL. Un post publié vit SIMULTANÉMENT dans `userPosts`
// (copie locale conservée à la publication) et dans `supabasePosts` (copie serveur
// revenue au chargement). Cette fonction rend la copie LOCALE, tandis que
// `allFeedPosts` dédoublonne dans l'ordre seed → supabase → me et affiche donc la
// copie SERVEUR. Conséquence : MUTER l'objet rendu ici ne change rien à l'écran.
// Pour lire, c'est sans importance ; pour ÉCRIRE, passer par allPostCopies(id).
function findPostAnywhere(id) {
  return (state.seed.posts || []).find(p => p.id === id)
      || (state.userPosts || []).find(p => p.id === id)
      || (state.supabasePosts || []).find(p => p.id === id)
      || null;
}

// Toutes les copies d'un post portant cet id, à travers les trois sources. À
// utiliser dès qu'on MODIFIE un post : sinon la mutation atterrit sur une copie
// que le fil n'affiche pas (le ❤️ passait rouge, le compteur restait figé).
function allPostCopies(id) {
  var out = [];
  [state.seed && state.seed.posts, state.userPosts, state.supabasePosts].forEach(function (src) {
    (src || []).forEach(function (p) { if (p && p.id === id) out.push(p); });
  });
  return out;
}

// ══════════════════════════════════════════════════════════════════════════
// SUPPRESSIONS DURABLES — « pierres tombales » de publication (2026-09-01)
// ──────────────────────────────────────────────────────────────────────────
// Défaut réel, signalé après un essai de publication : les posts supprimés
// RESSORTAIENT tous dans le fil au moment de la publication suivante. Trois
// causes se cumulaient, et aucune ne pouvait être vue depuis l'écran :
//
//   ① `deletePost` ne retirait la publication que de `userPosts` et de
//      `seed.posts`. Ni `supabasePosts` (la copie SERVEUR du même post) ni
//      `window._feedExtraPosts` (le tampon anti-écrasement du rafraîchissement)
//      n'étaient touchés — or `startFeedRefreshLoop` fait
//      `state.supabasePosts = posts.concat(extra)` toutes les 60 s : une entrée
//      d'`extra` que le serveur ne renvoie plus est RÉINJECTÉE indéfiniment.
//   ② la suppression serveur partait en `.then(()=>{}).catch(()=>{})`, sans
//      lire `{ error }` NI compter les lignes touchées, et sans vérifier
//      `window._supaReal` : envoyée au stub noop (SDK pas encore chargé, réseau
//      coupé) elle rendait `{ data: [], error: null }` — un faux succès. La
//      ligne restait en base, et personne ne réessayait jamais.
//   ③ `publishPost` recopiait ENSUITE toute la page serveur dans
//      `state.seed.posts` : d'où la réapparition EN BLOC, exactement au moment
//      de la publication.
//
// La parade est une liste de suppressions, persistée dans l'état et
// synchronisée par le blob `user_state` (donc valable sur tous les appareils du
// compte) : quelle que soit la voie par laquelle une publication supprimée
// revient — page serveur, temps réel, blob de synchronisation périmé, file de
// pagination —, elle est écartée. Une suppression ne s'annule jamais : la
// fusion de deux listes est donc toujours une UNION, jamais un remplacement.
//
// ⚠️ Bornée à POSTS_SUPPRIMES_MAX : le blob `user_state` part EN ENTIER à
// chaque synchronisation (même raison que `passionSignals`). Les plus anciennes
// entrées sortent en premier — leur ligne a eu tout le temps d'être réellement
// effacée en base, et la file de suppression (app-04) garantit le rattrapage.
// ══════════════════════════════════════════════════════════════════════════
var POSTS_SUPPRIMES_MAX = 500;

// Liste vivante (créée à la volée sur un état ancien qui ne la porte pas).
function postsSupprimes() {
  if (typeof state === "undefined" || !state) return [];
  if (!Array.isArray(state.deletedPostIds)) state.deletedPostIds = [];
  return state.deletedPostIds;
}

function postSupprime(id) {
  if (!id) return false;
  return postsSupprimes().indexOf(id) > -1;
}

// Enregistre la suppression. Ré-inscrit en QUEUE un id déjà connu : la borne
// évacue les plus anciens, et une suppression qu'on vient de rejouer est la
// dernière chose qu'il faut oublier.
function marquerPostSupprime(id) {
  if (!id) return;
  var liste = postsSupprimes();
  var i = liste.indexOf(id);
  if (i > -1) liste.splice(i, 1);
  liste.push(id);
  if (liste.length > POSTS_SUPPRIMES_MAX) liste.splice(0, liste.length - POSTS_SUPPRIMES_MAX);
}

// UNION avec une liste venue d'ailleurs (blob serveur d'un autre appareil).
// ⚠️ Jamais un remplacement : `_applyUserState` recopie les clés du blob telles
// quelles, donc un blob écrit AVANT une suppression locale l'effacerait — et le
// post reviendrait au rafraîchissement suivant, ce que tout ce bloc existe pour
// empêcher.
function fusionnerPostsSupprimes(entrants) {
  if (!Array.isArray(entrants) || !entrants.length) return;
  var liste = postsSupprimes();
  entrants.forEach(function (id) {
    if (typeof id === "string" && id && liste.indexOf(id) === -1) liste.push(id);
  });
  if (liste.length > POSTS_SUPPRIMES_MAX) liste.splice(0, liste.length - POSTS_SUPPRIMES_MAX);
}

// Retire de TOUS les tableaux vivants les copies d'une publication supprimée.
// Appelée à la suppression, après une hydratation serveur et au démarrage : un
// seul oubli de tableau suffit à faire réapparaître le contenu (cause ①).
function purgerPostsSupprimes() {
  try {
    if (typeof state === "undefined" || !state) return 0;
    var liste = postsSupprimes();
    if (!liste.length) return 0;
    var morts = {};
    liste.forEach(function (id) { morts[id] = true; });
    var retires = 0;
    var filtre = function (arr) {
      if (!Array.isArray(arr)) return arr;
      var out = arr.filter(function (p) { return !(p && morts[p.id]); });
      retires += (arr.length - out.length);
      return out;
    };
    state.userPosts = filtre(state.userPosts);
    state.supabasePosts = filtre(state.supabasePosts);
    if (state.seed) state.seed.posts = filtre(state.seed.posts);
    window._feedExtraPosts = filtre(window._feedExtraPosts || []);
    return retires;
  } catch (e) { return 0; }
}

// « Cette publication est-elle la mienne ? » — donc : puis-je la supprimer ?
//
// ⚠️ Le test portait sur `p._source === "me"`, c'est-à-dire sur la PROVENANCE DE
// LA COPIE AFFICHÉE, pas sur l'auteur. Or `allFeedPosts` dédoublonne dans
// l'ordre seed → supabase → me : dès que la copie SERVEUR d'un post est
// chargée, c'est elle qui s'affiche, avec `_source === "supabase"` — et le
// bouton « ⋯ » de MA propre publication disparaissait de la carte. Rien ne le
// signalait ; il ne restait que la fiche ouverte (qui, elle, teste bien
// `userPosts`) pour supprimer. La question est l'AUTEUR, jamais la source.
function _estMonPost(p) {
  if (!p || !p.id) return false;
  if ((state.userPosts || []).some(function (up) { return up && up.id === p.id; })) return true;
  var moi = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : null;
  // Le contenu de démonstration n'appartient à personne : il n'a pas d'options.
  if (p._source === "seed") return false;
  return !!(moi && p.authorId && p.authorId === moi);
}

// ======== MODÉRATION ========
// Vrai si l'utilisateur `id` est bloqué (son contenu doit être masqué et ses
// interactions ignorées). Centralisé pour filtrer feed, commentaires, stories,
// conversations et notifications. Voir [[project_passio]].
function isBlocked(id) {
  if (!id) return false;
  return (state.user.blocked || []).includes(id);
}

// ======== FEED ========
function allFeedPosts() {
  // ✅ NOUVELLES SOURCES DE POSTS:
  // 1. Posts SEED de démo (faux utilisateurs)
  const seedPosts = (state.seed.posts || []).map(p => ({ ...p, _source: "seed" }));

  // 2. Posts vrais utilisateurs depuis Supabase
  const supabasePosts = (state.supabasePosts || []).map(p => ({ ...p, _source: "supabase" }));

  // 3. Mes posts (posts locaux de l'utilisateur courant)
  const myPosts = (state.userPosts || []).map(p => ({ ...p, _source: "me" }));

  // Combiner TOUS les posts
  const allPosts = [...seedPosts, ...supabasePosts, ...myPosts];

  // Dédup par ID + masquer auteurs bloqués (modération) + exclure les bobines
  // (isReel) : elles vivent dans le viewer Bobines, pas dans le fil.
  // ⚠️ ORDRE : filtrer D'ABORD, dédoublonner ENSUITE. L'ancienne version marquait
  // l'id comme « vu » AVANT de tester isReel et le blocage : si la première copie
  // rencontrée était rejetée, elle avait déjà consommé l'id et TOUTES les autres
  // copies étaient écartées comme doublons — le post disparaissait entièrement du
  // fil. Cas réel : la copie seed marquée bobine et la copie serveur normale.
  const blocked = state.user.blocked || [];
  // La modération, elle, s'applique à l'ID ENTIER : si UNE copie porte un auteur
  // bloqué, aucune copie ne doit passer. Corriger l'ordre ne doit pas ouvrir une
  // porte dérobée où une seconde copie ferait réapparaître un contenu masqué.
  const idsBloques = new Set();
  if (blocked.length) {
    allPosts.forEach(p => { if (p && blocked.includes(p.authorId)) idsBloques.add(p.id); });
  }
  const seenIds = new Set();
  const deduplicated = allPosts.filter(p => {
    if (p.isReel) return false;
    if (idsBloques.has(p.id)) return false;
    // ⚠️ FILET FINAL DE LA SUPPRESSION. Les tableaux sources sont déjà purgés à
    // la suppression et après chaque hydratation, mais ce fil est la surface où
    // un oubli se VOIT : un contenu supprimé qui revient d'un blob de
    // synchronisation périmé ou d'une page serveur en vol s'arrête ici. Testé à
    // l'ID, jamais à la source — les trois copies portent le même.
    if (postSupprime(p.id)) return false;
    // ⚠️ LES CARNETS SONT RETIRÉS (§6), ET C'EST AUSSI UNE GARANTIE DE
    // CONFIDENTIALITÉ. La visibilité d'un carnet vivait dans le blob jsonb
    // `vlog` (pas de colonne), donc la RLS ne pouvait PAS la faire respecter :
    // la ligne `posts` part à tous ceux qui peuvent lire l'auteur, et seul un
    // filet CLIENT empêchait un carnet « Privé » de s'afficher dans le fil de
    // tout le monde. En excluant les publications de type `vlog` d'office, ce
    // filet devient inconditionnel — un carnet ancien, quelle que soit sa
    // visibilité déclarée, n'entre plus nulle part.
    if (p.type === "vlog") return false;
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });

  // Trier par date décroissante (guard `|| 0` : un post sans createdAt donnait
  // NaN → ordre instable, cartes éparpillées dans le fil).
  return deduplicated.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// Profils sélectionnés pour filtrer le fil (multi-sélection)

// ======== MOOD MULTI-SELECT ========
var selectedMoods = new Set(["creation"]); // Par défaut "Création"

// ══════════════════════════════════════════════════════════════════════════
// ENVIE DU MOMENT (drapeau `feed_intents_v1`)
// ──────────────────────────────────────────────────────────────────────────
// Cette couche remplace visuellement les anciens moods quand le drapeau est
// actif, mais ne filtre JAMAIS le fil : elle réordonne uniquement le set déjà
// autorisé par les passions et les suivis. Le mood historique reste lu/écrit
// pour la compatibilité et reprend exactement son comportement quand le
// drapeau est coupé.
//
// ── UI-2 : le rail SUIT le shell V2, il n'a plus d'activation propre ────────
// Depuis la validation visuelle du 2026-08-26, le shell V2 est actif par défaut
// sur l'URL normale. Les drapeaux ci-dessous ne savent toujours que RETIRER :
// une valeur positive héritée (`"1"`, `window...=true`) est ignorée, et l'ancien
// aperçu séparé `?passio_preview=feed-intents-v1` ne constitue plus un canal.
//
//     localStorage.passio_feed_intents_v1 = "0"   → kill switch immédiat
//     window.PASSIO_FEED_INTENTS_V1 = false        → coupure en mémoire
//     localStorage.passio_ui_v2 = "0" / PASSIO_UI_V2 = false → coupent le shell,
//                                                   donc le rail avec lui
//
// ⚠️ Aucune de ces gardes n'ÉCRIT dans le navigateur : lecture seule.
// ══════════════════════════════════════════════════════════════════════════
var FEED_INTENTS_VERSION = "v1";
var activeFeedIntent = "for_you";

function feedIntentsEnabled() {
  // Coupures propres au rail, prioritaires et purement soustractives.
  if (window.PASSIO_FEED_INTENTS_V1 === false) return false;
  var stored = null;
  try {
    stored = localStorage.getItem("passio_feed_intents_v1");
  } catch (e) {}
  if (stored === "0") return false;
  // Puis le shell V2 tranche. `ui-v2-shell.js` est chargé après ce fichier mais
  // AVANT tout rendu ; le repli ci-dessous applique le même défaut actif, pour
  // qu'un chargement partiel ne fasse jamais diverger les deux réponses.
  try {
    if (window.PassioUIV2 && typeof window.PassioUIV2.isEnabled === "function") {
      return !!window.PassioUIV2.isEnabled();
    }
  } catch (e) {}
  if (window.PASSIO_UI_V2 === false) return false;
  try {
    if (localStorage.getItem("passio_ui_v2") === "0") return false;
  } catch (e) {}
  return true;
}

// Les envies RÉELLEMENT sélectionnables comme critère. « for_you » n'en fait pas
// partie : c'est le NEUTRE, c'est-à-dire l'absence de critère d'envie — le
// cocher revient à tout décocher.
var FEED_INTENT_SOURCES = ["discover", "learn", "create", "meet"];

function normalizeFeedIntent(intent) {
  return ["for_you", "discover", "learn", "create", "meet"].indexOf(intent) > -1
    ? intent : "for_you";
}

// ── MULTI-SÉLECTION DES ENVIES ────────────────────────────────────────────────
// `activeFeedIntent` (une seule valeur) reste la source de vérité du CLASSEMENT
// quand exactement une envie est cochée : c'est ce qui garde intact le
// comportement mesuré du rail d'intentions. Dès qu'il y en a plusieurs, le bonus
// retenu est le MEILLEUR des envies cochées (cf. `rankFeedPostsForIntents`).
function feedIntentsSelected() {
  var out = [];
  try {
    var brut = (state && Array.isArray(state.feedIntents)) ? state.feedIntents : [];
    for (var i = 0; i < brut.length; i++) {
      if (FEED_INTENT_SOURCES.indexOf(brut[i]) > -1 && out.indexOf(brut[i]) === -1) out.push(brut[i]);
    }
  } catch (e) {}
  return out;
}

function setFeedIntents(liste) {
  var propres = [];
  (Array.isArray(liste) ? liste : []).forEach(function (i) {
    if (FEED_INTENT_SOURCES.indexOf(i) > -1 && propres.indexOf(i) === -1) propres.push(i);
  });
  try { state.feedIntents = propres; saveState(); } catch (e) {}
  // `activeFeedIntent` porte le classement : une seule envie cochée le pilote,
  // zéro ou plusieurs le ramènent au neutre (le bonus multiple est calculé
  // ailleurs, à partir de la liste).
  activeFeedIntent = (propres.length === 1) ? propres[0] : "for_you";
  return propres;
}

// Un post satisfait-il l'envie `intent` ? Utilisé comme CRITÈRE D'ENTRÉE dans le
// fil (union), pas seulement comme bonus de classement.
//
// ⚠️ « Explorer » n'a aucun mood correspondant, et ne peut pas en avoir : c'est
// une question posée au LECTEUR (« qu'est-ce qui vient d'ailleurs ? »), pas une
// étiquette posée par l'auteur. Son prédicat reprend donc exactement les deux
// signaux que `rankFeedPostsForIntent` utilise déjà pour le bonus « discover » :
// auteur que je ne suis pas, ou passion que je n'ai pas cochée.
function feedPostMatchesIntent(p, intent) {
  if (!p) return false;
  if (intent === "discover") {
    try {
      var suivis = (state.user && state.user.following) || [];
      var horsSuivis = !!p.authorId && suivis.indexOf(p.authorId) === -1;
      var horsPassions = !!p.passion && !_activeFeedPassions.has(p.passion);
      return horsSuivis || horsPassions;
    } catch (e) { return false; }
  }
  return legacyMoodToFeedIntent(p.mood) === intent;
}

// Fonction pure, volontairement conservatrice : les valeurs historiques sans
// équivalent sûr restent génériques et ne reçoivent aucun bonus d'intention.
function legacyMoodToFeedIntent(mood) {
  if (mood === "creation") return "create";
  if (mood === "learn") return "learn";
  if (mood === "irl") return "meet";
  return "generic"; // actu, chill, all, absent ou valeur inconnue
}

// ── VOCABULAIRE DES MOODS ────────────────────────────────────────────────────
//
// Une seule table, parce que les deux surfaces qui affichaient un mood avaient
// chacune la leur et qu'elles avaient DIVERGÉ : le fil connaissait « irl » mais
// pas « actu », les bobines l'inverse. Conséquence mesurée le 2026-08-29 :
// tous les posts d'actualité du seed sortaient avec une étiquette de mood VIDE
// (`moodMap[p.mood] || ""`), et un post « irl » sortait « IRL » ici et « Tout »
// là-bas.
//
// Les LIBELLÉS suivent le rail d'intentions du Fil (Explorer · Apprendre ·
// Idées · Rencontrer) : ce qu'on choisit en publiant porte le même mot que ce
// qu'on choisit en lisant. Les VALEURS, elles, ne bougent pas — elles sont
// écrites en base (`posts.mood`), relues par `legacyMoodToFeedIntent`, et
// portées par des milliers de publications existantes.
//
// ⚠️ TROIS entrées, et c'est le produit qui les compte, pas cette table :
// le Studio ne propose que 💡 Idées · 📚 Apprendre · 🤝 Rencontrer · ✨ Tous.
// « Explorer » n'est PAS ici et ne peut pas y être : c'est une question posée au
// LECTEUR (auteur non suivi, passion non cochée), jamais une étiquette posée par
// l'auteur — lui donner une pastille la rendrait décorative, donc mensongère.
// « chill » et « actu » n'y sont plus : voir la scission juste en dessous.
//
// ⚠️ « all » n'est PAS dans la table, et c'est délibéré : le neutre ne porte
// aucune étiquette sur la carte (`moodTagLabel` rend ""). L'ajouter collerait un
// badge à TOUS les posts venus de Supabase, qui retombent sur `mood: "all"`.
// Le Studio, lui, a bien une pastille « ✨ Tous » : y choisir le neutre est un
// geste, ne rien afficher ensuite en est la conséquence voulue.
var PASSIO_MOOD_LABELS = {
  creation: { emoji: "💡", label: "Idées" },
  learn:    { emoji: "📚", label: "Apprendre" },
  irl:      { emoji: "🤝", label: "Rencontrer" },
};

// ── AFFICHER ET ADMETTRE SONT DEUX CHOSES (2026-09-02) ───────────────────────
//
// `PASSIO_MOOD_LABELS` portait CINQ entrées et servait à DEUX usages qui n'ont
// rien à voir — c'est en retirant « chill » et « actu » du produit qu'on s'en
// est aperçu :
//
//   ① NOMMER une envie sur une carte (`moodTagLabel`, `moodShortLabel`) ;
//   ② ADMETTRE une valeur de `posts.mood` dans le repli d'exploration
//      (`moodsAffichables`, plus bas dans ce fichier).
//
// Les deux listes viennent de DIVERGER, et devaient diverger : le Studio ne
// propose plus que Idées · Apprendre · Rencontrer · Tous — « chill » et « actu »
// ne sont plus publiables depuis le 2026-08-29 — donc plus rien ne doit les
// NOMMER. Mais la base de production porte des milliers de publications qui les
// portent encore, et les retirer de la liste d'ADMISSION les ferait disparaître
// du fil de tout le monde. Un retrait de vocabulaire ne doit pas effacer du
// contenu réel.
//
// D'où la scission. `PASSIO_MOOD_LABELS` ne garde que ce qui s'affiche ;
// `PASSIO_MOODS_ADMIS` garde tout ce qui a le droit d'exister en base.
//
// ⚠️ Conséquence VOULUE : une publication « chill » ou « actu » se comporte
// désormais exactement comme le neutre `all` — elle entre dans le fil, elle
// entre dans l'exploration, et elle ne porte AUCUNE pastille. C'est ce que
// `moodTagLabel` fait déjà de toute valeur qu'elle ne connaît pas.
//
// ⚠️ `legacyMoodToFeedIntent` n'est PAS touchée : elle rendait déjà « generic »
// pour « chill » et « actu ». Ces publications ne satisfaisaient donc déjà
// aucune des envies du rail — le produit avait tranché avant l'affichage.
//
// ⚠️ NE PAS confondre le MOOD « actu », mort, et la PASSION « actu »
// (Actualité 🌍), qui est l'une des 19 du catalogue et reste vivante.
var PASSIO_MOODS_ADMIS = (function () {
  var admis = {};
  Object.keys(PASSIO_MOOD_LABELS).forEach(function (m) { admis[m] = 1; });
  // Valeurs LÉGUÉES : plus publiables, plus affichables, toujours admises.
  admis.chill = 1;
  admis.actu = 1;
  return admis;
})();

// Étiquette de la carte (fil, post ouvert) : emoji + libellé, ou "" pour le
// neutre et pour toute valeur inconnue venue de la base.
function moodTagLabel(mood) {
  var m = PASSIO_MOOD_LABELS[mood];
  return m ? m.emoji + " " + m.label : "";
}

// Libellé nu (bobines), où le neutre s'écrit « Tout » depuis toujours.
function moodShortLabel(mood) {
  var m = PASSIO_MOOD_LABELS[mood];
  return m ? m.label : "Tout";
}

// Étiquette « Exemple PASSIO » du contenu de démonstration, posée UNIQUEMENT
// pour un visiteur sans compte pendant le parcours de première visite (drapeau
// `first_run_experience_v1`). Rend "" partout ailleurs — donc le HTML d'une
// carte est identique à l'octet près pour tout compte existant, et quand le
// drapeau est coupé.
//
// ⚠️ Le discriminant est `p._source === "seed"`, posé par `allFeedPosts`, et
// jamais la forme de l'identifiant : deviner finirait par étiqueter une vraie
// publication comme un exemple.
function _firstRunDemoTag(p) {
  try {
    if (!window.PassioFirstRun) return "";
    return PassioFirstRun.etiquetteDemo(p) || "";
  } catch (e) { return ""; }
}

// La pastille ELLE-MÊME, ou rien. Ne jamais rendre `<span class="post-mood-tag">`
// avec un libellé vide : la classe porte `padding: 3px 9px`, `border: 1px` et un
// fond opaque, donc un libellé vide dessine une CAPSULE CREUSE — mesurée à
// 20 × 8 px sur un post neutre. Or `moodTagLabel` rend "" pour `all`, pour un
// mood inconnu et pour un mood absent : tous les posts venus de Supabase
// retombent sur `mood: "all"`, donc TOUS en portaient une.
// ⚠️ C'est bien le neutre qui ne doit porter aucun badge (cf. la note de
// `PASSIO_MOOD_LABELS`) — l'intention était juste, seul le rendu la trahissait.
// ⚠️ `data-mood` porte la COULEUR de la pastille (une teinte par envie, cf. le
// bloc « PASTILLE DE MOOD » de styles.css). Il n'est posé que sur la branche où
// `moodTagLabel` a rendu un libellé : le mood y est donc forcément une CLÉ de
// `PASSIO_MOOD_LABELS`, jamais une valeur libre venue de la base. L'échappement
// reste là par principe — cette table peut grandir, la garde ne doit pas
// dépendre de sa forme actuelle.
function _moodTagHTML(mood) {
  var t = moodTagLabel(mood);
  return t ? '<span class="post-mood-tag" data-mood="' + escapeHtml(String(mood)) + '">' + t + '</span>' : "";
}

function feedIntentMeta(intent) {
  return { v: FEED_INTENTS_VERSION, flag: "on", intent: normalizeFeedIntent(intent) };
}

function feedIntentTrack(name, intent) {
  if (!feedIntentsEnabled()) return;
  try {
    if (window.tel && tel.action) tel.action(name, feedIntentMeta(intent));
  } catch (e) {}
}

function syncFeedIntentUi() {
  var enabled = feedIntentsEnabled();
  var legacy = document.getElementById("moodSelector");
  var selector = document.getElementById("feedIntentSelector");
  if (legacy) legacy.hidden = enabled;
  if (selector) selector.hidden = !enabled;
  if (!enabled) { activeFeedIntent = "for_you"; try { state.feedIntents = []; } catch (e) {} }
  activeFeedIntent = normalizeFeedIntent(activeFeedIntent);
  if (!selector) return;
  // MULTI-SÉLECTION : chaque envie cochée est active. « Tous » (for_you) est le
  // neutre — actif exactement quand aucune envie n'est cochée.
  var choisies = feedIntentsSelected();
  // Le classement suit la sélection persistée : sans cette ligne, `activeFeedIntent`
  // repartirait à « for_you » à chaque rechargement alors qu'une envie est cochée.
  activeFeedIntent = (choisies.length === 1) ? choisies[0] : "for_you";
  // ⚠️ « Tous » n'a plus de bouton (2026-08-31) : rien de coché DIT « tous ».
  // La branche `for_you` reste écrite pour un balisage ancien encore servi par
  // un cache — sans elle, un tel bouton resterait allumé à jamais.
  selector.querySelectorAll(".feed-intent-btn").forEach(function(btn) {
    var cle = btn.getAttribute("data-intent");
    var active = (cle === "for_you") ? (choisies.length === 0) : (choisies.indexOf(cle) > -1);
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function setupFeedIntentDelegation() {
  var selector = document.getElementById("feedIntentSelector");
  if (!selector || selector._delegationAttached) return;
  selector.addEventListener("click", function(e) {
    var btn = e.target.closest(".feed-intent-btn");
    if (!btn || !selector.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    setFeedIntent(btn.getAttribute("data-intent"));
  });
  selector._delegationAttached = true;
}

// Bascule une envie. « Tous » remet le neutre (aucune envie cochée) ; toute
// autre s'ajoute ou se retire sans toucher aux autres, ni aux passions, ni à
// « Suivis » — c'est la règle du OU inclusif.
function setFeedIntent(intent) {
  if (!feedIntentsEnabled()) return;
  var requested = normalizeFeedIntent(intent);
  var choisies = feedIntentsSelected();
  var reset = (requested === "for_you");
  if (reset) {
    choisies = [];
  } else if (choisies.indexOf(requested) > -1) {
    choisies = choisies.filter(function (x) { return x !== requested; });
    reset = choisies.length === 0;
  } else {
    choisies = choisies.concat([requested]);
  }
  setFeedIntents(choisies);
  feedIntentTrack(reset ? "feed_intent_reset" : "feed_intent_selected", activeFeedIntent);
  window._feedDomSig = null;
  renderFeed();
  syncFeedIntentUi();
}

function feedIntentTrackContentClick() {
  if (!feedIntentsEnabled() || activeFeedIntent === "for_you") return;
  feedIntentTrack("feed_intent_content_click", activeFeedIntent);
}

function feedIntentTrackMeetToIrl() {
  if (!feedIntentsEnabled() || activeFeedIntent !== "meet") return;
  feedIntentTrack("feed_intent_meet_irl", activeFeedIntent);
}

function openFeedPost(id) {
  // Première visite : trace l'OUVERTURE d'un contenu par un visiteur — un
  // compteur, jamais un identifiant ni un libellé. Inerte hors mode invité.
  try { if (window.PassioFirstRun) PassioFirstRun.contenuOuvert("post"); } catch (e) {}
  feedIntentTrackContentClick();
  return openPost(id);
}

// ✅ EVENT DELEGATION pour les moods - Plus robuste et fluide!
function setupMoodDelegation() {
  var moodSelector = document.getElementById("moodSelector");
  if (!moodSelector) return;

  // Enlever les anciens listeners (si présent)
  if (moodSelector._delegationAttached) return;

  moodSelector.addEventListener("click", function(e) {
    var btn = e.target.closest(".mood-btn");
    if (!btn) return;

    e.stopPropagation();
    e.preventDefault();

    var mood = btn.getAttribute("data-mood");
    if (!mood) return;

    toggleMood(mood);
  });

  moodSelector._delegationAttached = true;
}

function toggleMood(mood) {
  if (selectedMoods.has(mood)) {
    selectedMoods.delete(mood);
  } else {
    selectedMoods.add(mood);
  }

  // À partir d'ici le filtre mood exprime une INTENTION, plus un défaut d'usine :
  // renderFeed cesse de l'élargir automatiquement (spec §7, « règle absolue »).
  // Marqueur persistant, car `selectedMoods` repart à {"creation"} à chaque
  // chargement : sans persistance, l'élargissement reviendrait contredire
  // l'utilisateur au rechargement suivant.
  if (!state.feedMoodsTouched) {
    state.feedMoodsTouched = true;
    try { saveState(); } catch (e) {}
  }

  renderFeed();
  // renderFeed reconstruit le DOM du feed mais pas le sélecteur de moods —
  // on resynchronise les classes .active immédiatement après.
  updateMoodButtonsUI();
}

function updateMoodButtonsUI() {
  var buttons = document.querySelectorAll("#moodSelector .mood-btn");

  buttons.forEach(function(b) {
    var mood = b.getAttribute("data-mood");
    if (selectedMoods.has(mood)) {
      b.classList.add("active");
    } else {
      b.classList.remove("active");
    }
  });
}

// Attache les event listeners individuels aux boutons de mood (fallback si delegation échoue)
function setupMoodButtons() {
  var buttons = document.querySelectorAll("#moodSelector .mood-btn");
  buttons.forEach(function(btn) {
    var moodValue = btn.getAttribute("data-mood");
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      e.preventDefault();
      toggleMood(moodValue);
    });
  });
}

// ⚠️ `renderFeedCdvLives` — le carrousel « CDV Live en direct » posé en tête du
// fil — a été RETIRÉ avec la fonctionnalité Carnet de voyage (§6). Il n'avait
// déjà aucun appelant : la fonction était morte avant même ce retrait.

// ======== PULL-TO-REFRESH ========
// Détecte un swipe vers le bas depuis le haut du feed et recharge les posts Supabase.
(function _setupPullToRefresh() {
  var _touchStartY = 0;
  var _pullActive = false;
  var _pulling = false;

  document.addEventListener("touchstart", function(e) {
    var feedEl = document.getElementById("screen-feed");
    if (!feedEl || !feedEl.classList.contains("active")) return;
    // ⚠️ LE CONTENEUR QUI DÉFILE EST `#appMain`, PAS `#feedList`.
    // `.app-main` porte `overflow-y: auto` ; `#feedList` n'a aucun overflow et
    // grandit avec son contenu. Son `scrollTop` vaut donc TOUJOURS 0, et le
    // garde « ne déclenche qu'en haut du fil » ne gardait rien : n'importe quel
    // balayage vers le bas — c'est-à-dire le geste NORMAL pour remonter dans le
    // fil — armait le rafraîchissement, à n'importe quelle hauteur. Sur iPhone
    // le rebond élastique de WebKit rend le faux départ encore plus visible.
    var list = document.getElementById("appMain");
    if (!list) return;
    // Déclenche seulement si on est réellement en haut du défilement.
    if (list.scrollTop > 10) return;
    _touchStartY = e.touches[0].clientY;
    _pullActive = true;
  }, { passive: true });

  document.addEventListener("touchmove", function(e) {
    if (!_pullActive) return;
    var delta = e.touches[0].clientY - _touchStartY;
    if (delta > 60 && !_pulling) {
      _pulling = true;
      var ind = document.getElementById("_pullIndicator");
      if (ind) ind.style.display = "flex";
    }
  }, { passive: true });

  document.addEventListener("touchend", function() {
    if (!_pullActive) return;
    _pullActive = false;
    if (_pulling) {
      _pulling = false;
      var ind = document.getElementById("_pullIndicator");
      if (ind) ind.style.display = "none";
      // Recharge les posts depuis Supabase
      if (typeof supaLoadPosts === "function" && typeof MY_UID !== "undefined" && MY_UID) {
        supaLoadPosts().then(function(posts) {
          if (posts && posts.length > 0) {
            var extra = (window._feedExtraPosts || []).filter(function(p) { return !posts.some(function(x) { return x.id === p.id; }); });
            state.supabasePosts = posts.concat(extra);
            renderFeed();
          }
        }).catch(function() {});
      } else {
        renderFeed();
      }
    }
  }, { passive: true });
})();

// ══════════════════════════════════════════════════════════════════════════
// CLASSEMENT DU FIL PAR PERTINENCE (2026-08-04)
// Le fil est DÉJÀ filtré en amont (passions sélectionnées + suivis) ; ce
// classement ne change QUE l'ordre à l'intérieur de ce set — jamais ce qui est
// visible. C'est le différenciateur d'un réseau de PASSIONS : on remonte le
// contenu le plus pertinent pour MOI plutôt que le simple « plus récent ».
// Repli chronologique strict via localStorage.passio_feed_rank="0" (soupape).
// Signaux :
//   • fraîcheur — dominante (décroissance douce τ≈48 h) : le fil reste vivant
//   • affinité — +1 passion que JE pratique (profil), +1 auteur que je suis
//   • engagement — likes + 2×commentaires + réactions, log-compressé, plafonné
// ⚠️ Les scores utilisent le MÊME bucket 5 min que le guard _feedDomSig de
// renderFeed → l'ordre est STABLE dans la fenêtre du guard (pas de repaint
// parasite entre deux rendus rapprochés). Ne pas remplacer nowBucket par un
// Date.now() continu sans revoir le guard.
// ══════════════════════════════════════════════════════════════════════════
function _myPassionSet() {
  var s = new Set();
  var profs = (state.user && state.user.profiles) || [];
  for (var i = 0; i < profs.length; i++) {
    if (profs[i] && profs[i].passion) s.add(profs[i].passion);
  }
  return s;
}
// Passions marquées « Ça m'intrigue » (lot UI-5). Relu À CHAUD à chaque
// classement : le signal peut être posé pendant la session, depuis le viewer de
// bobines, sans que rien ne re-crée l'ensemble.
function _passionSignalSet() {
  var s = new Set();
  try {
    var m = (state && state.user && state.user.passionSignals) || {};
    for (var k in m) { if (Object.prototype.hasOwnProperty.call(m, k) && m[k]) s.add(k); }
  } catch (e) {}
  return s;
}
// Fenêtre et poids du terme « je viens de publier » (cf. `feedPostScore`).
// Le bonus doit dépasser le MEILLEUR score atteignable par une autre
// publication : fraîcheur 1,0 + affinité maximale (passion + auteur suivi +
// curiosité = 2,6 × 0,35 = 0,91) + engagement plafonné (3 × 0,12 = 0,36), soit
// 2,27. Une publication à moi vaut au pire 1,0 + 0,35 + 0 + 1,20 = 2,55 : elle
// passe devant, toujours, pendant la fenêtre.
var FEED_MA_PUBLI_HEURES = 2;
var FEED_MA_PUBLI_BONUS = 1.2;

function feedPostScore(p, nowBucket, myPassions, followingSet, signalSet) {
  // Fraîcheur : âge en heures via buckets 5 min (12/h), décroissance exp τ=48 h.
  var postB = Math.floor((p.createdAt || 0) / 300000);
  var ageHours = Math.max(0, nowBucket - postB) / 12;
  var recency = Math.exp(-ageHours / 48); // 1.0 (frais) → 0.37 (48 h) → 0.14 (96 h)

  // Affinité : 0 à 3 (passion pratiquée, auteur suivi, Passio qui m'intrigue).
  var affinity = 0;
  if (p.passion && myPassions.has(p.passion)) affinity += 1;
  if (p.authorId && followingSet.has(p.authorId)) affinity += 1;
  // Lot UI-5 : « Ça m'intrigue », posé depuis une bobine. Sans ce terme le
  // bouton serait DÉCORATIF — `state.user.likedPosts` n'est lu par aucun
  // classement, et le viewer de bobines n'en a aucun. Volontairement plus
  // faible qu'une passion pratiquée (0,6 contre 1) : c'est une curiosité, pas
  // une déclaration. Même soupape que le reste : `passio_feed_rank = "0"`
  // court-circuite tout le classement en amont.
  if (p.passion && signalSet && signalSet.has(p.passion)) affinity += 0.6;

  // Engagement : commentaires > réactions ; log-compressé, plafonné (un vieux
  // post viral ne doit pas écraser la fraîcheur).
  var likes = p.likes || 0;
  var comments = (p.comments || []).length;
  var reactions = Array.isArray(p.reactions) ? p.reactions.length : 0;
  var engagement = Math.min(3, Math.log(1 + likes + 2 * comments + reactions));

  // ── « JE VIENS DE PUBLIER » : GARANTIE DE VISIBILITÉ, BORNÉE ───────────────
  //
  // Sans ce terme, une publication toute neuve ne peut PAS gagner : elle a la
  // fraîcheur maximale mais un engagement NUL, quand n'importe quelle
  // publication un peu établie plafonne l'engagement dès ~20 j'aime. Mesuré le
  // 2026-09-02 avec un compte « musique » : la publication de l'utilisateur
  // sortait 25e sur 40, et `renderFeed` n'en peint que 20 — donc INVISIBLE.
  // L'utilisateur publie, et ne voit rien.
  //
  // ⚠️ Le défaut ne vient PAS du contenu de démonstration, il vient du barème.
  // Le socle l'a seulement rendu ATTEIGNABLE en ajoutant des publications
  // fraîches et engageantes : avant, la publication neuve sortait 20e, soit la
  // toute dernière carte peinte. Elle tenait à une place. Corriger le socle
  // sans corriger le barème aurait rendu les tests verts en laissant le
  // produit à une publication du même défaut.
  //
  // ⚠️ BORNÉ DANS LE TEMPS, et c'est ce qui le rend acceptable : passé le
  // délai, le bonus disparaît entièrement et le fil redevient exactement
  // celui d'avant. Il ne s'agit pas de promouvoir mes publications, il s'agit
  // de me montrer ce que je viens de faire. Au-delà, mes propres publications
  // sont classées comme les autres — la fraîcheur s'en charge.
  //
  // ⚠️ La propriété se teste par `_estMonPost` (l'AUTEUR), jamais par `_source` :
  // c'est la règle du projet, et elle écarte d'office le contenu de
  // démonstration, qui n'appartient à personne.
  var mienneEtFraiche = (ageHours < FEED_MA_PUBLI_HEURES && _estMonPost(p)) ? FEED_MA_PUBLI_BONUS : 0;

  return recency * 1.0 + affinity * 0.35 + engagement * 0.12 + mienneEtFraiche;
}
function rankFeedPosts(posts) {
  var arr = (posts || []).slice();
  var off = false;
  try { off = localStorage.getItem("passio_feed_rank") === "0"; } catch (e) {}
  if (off) {
    return arr.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }
  var nowBucket = Math.floor(Date.now() / 300000);
  var myPassions = _myPassionSet();
  var following = (state.user && state.user.following) || state.following || [];
  var followingSet = new Set(following);
  var signalSet = _passionSignalSet();
  // Les posts ici sont déjà des copies (allFeedPosts fait {...p}) → mutation sûre.
  for (var i = 0; i < arr.length; i++) {
    arr[i]._feedScore = feedPostScore(arr[i], nowBucket, myPassions, followingSet, signalSet);
  }
  arr.sort(function(a, b) {
    var d = b._feedScore - a._feedScore;
    if (d) return d;
    d = (b.createdAt || 0) - (a.createdAt || 0); // ex-æquo : plus récent d'abord
    if (d) return d;
    return String(a.id) < String(b.id) ? -1 : 1; // tri stable & déterministe
  });
  return arr;
}

// Réordonne le résultat de rankFeedPosts sans jamais ajouter, retirer ou
// dupliquer un post. La soupape historique passio_feed_rank="0" coupe aussi les
// bonus d'intention : un seul kill switch suffit pour retrouver la chronologie.
// Bonus de classement d'UN post pour UNE envie. Extrait de `rankFeedPostsForIntent`
// pour que la version multi-envies applique EXACTEMENT la même règle : deux
// copies auraient divergé, comme les deux tables de libellés de mood avant elles.
// `lot` sert au seul garde-fou de « Explorer » (au moins un signal fiable dans
// le lot classé, sinon aucun bonus n'est distribué).
function _feedIntentBonus(p, intent, lot) {
  var myPassions = _myPassionSet();
  var following = (state.user && state.user.following) || state.following || [];
  var followingSet = new Set(following);
  if (intent === "discover") {
    // Découvrir n'est permis que si au moins un signal de nouveauté fiable existe.
    // À défaut, le classement neutre est rendu exactement dans le même ordre,
    // sans heuristique inventée à partir du texte libre.
    var reliable = (lot || []).some(function (x) {
      return !!((x.authorId && followingSet.size) || (x.passion && myPassions.size));
    });
    if (!reliable) return 0;
    var bonus = 0;
    if (p.authorId && followingSet.size && !followingSet.has(p.authorId)) bonus += 0.28;
    if (p.passion && myPassions.size && !myPassions.has(p.passion)) bonus += 0.28;
    return bonus;
  }
  if (legacyMoodToFeedIntent(p.mood) !== intent) return 0;
  // « Rencontrer » ne remonte que des posts dont le parcours IRL existant est
  // réellement actionnable ; il n'active ni proposition ni géolocalisation.
  var sharedEventActionable = intent === "meet"
    && p.sharedReelData && p.sharedReelData.kind === "event"
    && p.sharedReelData.id && typeof openEventDetails === "function";
  if (intent !== "meet" || sharedEventActionable
      || (typeof feedIrlBridgeEligible === "function" && feedIrlBridgeEligible(p))) {
    return 0.55;
  }
  return 0;
}

// Plusieurs envies cochées : le bonus retenu est le MEILLEUR des envies, jamais
// leur somme — cumuler ferait passer un post « Apprendre + Rencontrer » devant
// tout le reste pour une raison que l'écran n'explique pas. Zéro ou une envie
// retombe EXACTEMENT sur `rankFeedPostsForIntent`, dont le comportement mesuré
// ne bouge pas.
function rankFeedPostsForIntents(posts, intents) {
  var liste = (Array.isArray(intents) ? intents : []).filter(function (i) {
    return FEED_INTENT_SOURCES.indexOf(i) > -1;
  });
  if (liste.length <= 1) return rankFeedPostsForIntent(posts, liste[0] || "for_you");
  var ranked = rankFeedPosts(posts);
  if (!feedIntentsEnabled()) return ranked;
  try {
    if (localStorage.getItem("passio_feed_rank") === "0") return ranked;
  } catch (e) {}
  return ranked.map(function (p, index) {
    var meilleur = 0;
    for (var i = 0; i < liste.length; i++) {
      var b = _feedIntentBonus(p, liste[i], ranked);
      if (b > meilleur) meilleur = b;
    }
    var baseScore = typeof p._feedScore === "number" ? p._feedScore : 0;
    return { post: p, index: index, total: baseScore + meilleur };
  }).sort(function (a, b) {
    var d = b.total - a.total;
    return d || a.index - b.index;
  }).map(function (x) { return x.post; });
}

function rankFeedPostsForIntent(posts, intent) {
  var ranked = rankFeedPosts(posts);
  intent = normalizeFeedIntent(intent);
  if (!feedIntentsEnabled() || intent === "for_you") return ranked;
  try {
    if (localStorage.getItem("passio_feed_rank") === "0") return ranked;
  } catch (e) {}

  // ⚠️ Le garde-fou de « Explorer » (au moins un signal de nouveauté fiable dans
  // le lot, sinon aucun bonus) vit désormais dans `_feedIntentBonus`, partagé
  // avec la version multi-envies : il rend 0 pour chaque post, donc l'ordre
  // neutre est rendu à l'identique — même résultat qu'un retour anticipé.
  return ranked.map(function(p, index) {
    var bonus = _feedIntentBonus(p, intent, ranked);
    var baseScore = typeof p._feedScore === "number" ? p._feedScore : 0;
    return { post: p, index: index, total: baseScore + bonus };
  }).sort(function(a, b) {
    var d = b.total - a.total;
    return d || a.index - b.index;
  }).map(function(x) { return x.post; });
}

// ── REPLI EXPLORATION du Fil (spec §7) ────────────────────────────────────────
//
// Quand les passions choisies ne donnent rien à afficher, la version précédente
// s'arrêtait sur « Aucun post pour cette sélection. Essaie un autre mood ou sois
// le premier à publier ici. » — un cul-de-sac : aucune des deux issues n'était
// cliquable depuis cet écran.
//
// La spec §7 impose un ordre de repli : ① les autres passions sélectionnées
// (déjà couvert : le fil est l'UNION des intérêts, pas une intersection),
// ② des contenus d'exploration CLAIREMENT ÉTIQUETÉS, ③ des personnes,
// ④ ajouter une passion, ⑤ publier. Et : « le repli doit rester lisible comme
// exploration, pas prétendre être une personnalisation exacte » — d'où le
// bandeau explicite au-dessus des cartes, et la mention de la passion d'origine
// sur chacune.
//
// Retourne true dès que le repli est peint. Il l'est même sans contenu à
// explorer (base vide, ou l'utilisateur suit déjà tout) : les trois issues
// restent la vraie valeur de cet écran, et le message historique n'en offrait
// aucune. false n'arrive que si le nœud de liste manque.
var FEED_EXPLORATION_MAX = 6;

function renderFeedExplorationFallback(list) {
  if (!list) return false;

  var mesInterets = Array.from(_activeFeedPassions);
  var etiquettes = mesInterets.map(function(id) {
    var p = passionById(id);
    return (p && p.label) ? p.label : id;
  });

  // Contenus hors de mes passions, affichables dans le fil (un mood sans bouton
  // — "irl" — resterait invisible : l'y mettre ferait une carte fantôme).
  var moodsAffichables = {};
  // ⚠️ Cette liste se construisait en LISANT LES BOUTONS de `#moodSelector`.
  // Deux raisons de ne plus le faire, et la seconde est un défaut mesuré :
  //  · sous UI-7 ce rail est MASQUÉ (`#feedIntentSelector` le remplace) — faire
  //    dépendre le classement du fil du DOM d'une surface cachée est fragile ;
  //  · `irl` n'a JAMAIS eu de bouton dans ce rail. Une publication « Rencontrer »
  //    venue d'une passion que l'on ne suit pas était donc exclue de
  //    l'exploration — invisible pour exactement les gens qu'elle cherche.
  //    « Rencontrer » est devenu publiable le 2026-08-29 (#194) ; le défaut
  //    n'existait pas avant, faute de moyen de produire un tel post.
  // La table canonique `PASSIO_MOODS_ADMIS` fait foi. Elle reste une liste
  // BLANCHE : un mood inconnu venu de la base n'entre toujours pas.
  // ⚠️ C'est bien `PASSIO_MOODS_ADMIS` et NON `PASSIO_MOOD_LABELS` : depuis la
  // scission du 2026-09-02, la seconde ne contient plus que ce qui s'AFFICHE
  // (trois envies). Lire les libellés ici ferait disparaître du fil toutes les
  // publications de production portant « chill » ou « actu » — c'est-à-dire du
  // contenu réel effacé par un changement de vocabulaire.
  try {
    Object.keys(PASSIO_MOODS_ADMIS).forEach(function(m) { moodsAffichables[m] = 1; });
  } catch (e) {}

  var candidats = [];
  try {
    candidats = allFeedPosts().filter(function(p) {
      if (!p || p.type === "vlog") return false;
      if (_activeFeedPassions.has(p.passion)) return false;
      return p.mood === "all" || !p.mood || !!moodsAffichables[p.mood];
    });
  } catch (e) { candidats = []; }

  var seen = {};
  candidats = candidats.filter(function(p) {
    if (seen[p.id]) return false;
    seen[p.id] = 1;
    return true;
  });

  var aExplorer = [];
  try { aExplorer = rankFeedPosts(candidats).slice(0, FEED_EXPLORATION_MAX); }
  catch (e) { aExplorer = candidats.slice(0, FEED_EXPLORATION_MAX); }

  var quoi = etiquettes.length === 1
    ? "Rien encore dans " + escapeHtml(etiquettes[0])
    : "Rien encore dans tes passions";

  var html = ''
    + '<div class="feed-repli-tete" style="padding:18px 16px 8px;text-align:center;">'
    +   '<div style="font-size:30px;line-height:1;">🌱</div>'
    +   '<div style="font-size:16px;font-weight:800;margin-top:8px;">' + quoi + '</div>'
    +   '<div style="font-size:13px;color:var(--muted);margin-top:6px;line-height:1.5;">'
    +     'Personne n\'a encore publié ici. En attendant, voici ce qui vit ailleurs sur PASSIO.'
    +   '</div>'
    + '</div>'
    + '<div class="feed-repli-actions" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding:6px 16px 16px;">'
    +   '<button class="btn ghost" onclick="goTo(\'profiles\')" style="flex:1 1 auto;">➕ Ajouter une passion</button>'
    +   '<button class="btn ghost" onclick="goTo(\'explore\')" style="flex:1 1 auto;">👥 Découvrir des personnes</button>'
    +   '<button class="btn primary" onclick="goTo(\'studio\')" style="flex:1 1 100%;">✍️ Publier le premier contenu</button>'
    + '</div>';

  if (aExplorer.length) {
    html += '<div class="feed-repli-bandeau" style="margin:4px 12px 10px;padding:9px 12px;border:1.5px dashed var(--border);border-radius:12px;background:var(--bg-card);">'
          +   '<div style="font-size:12px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:var(--accent);">Exploration</div>'
          +   '<div style="font-size:12px;color:var(--muted);margin-top:2px;">Hors de tes passions — ce n\'est pas ton fil personnalisé.</div>'
          + '</div>';
    html += aExplorer.map(function(p) {
      var pa = passionById(p.passion);
      var nom = (pa && pa.label) ? pa.label : (p.passion || "");
      var badge = '<div style="padding:2px 12px 0;font-size:11px;color:var(--muted);">Exploration · '
                + escapeHtml(nom) + '</div>';
      return '<div class="feed-repli-carte">' + badge + _renderPostHTMLSafe(p) + '</div>';
    }).join("");
  }

  list.innerHTML = html;

  // Le guard no-op de renderFeed compare `_feedDomSig` ET exige que la liste
  // ait des enfants. Sans cette ligne, un rendu normal ultérieur retombant sur
  // la signature d'avant le repli serait sauté et le repli resterait à l'écran.
  window._feedDomSig = "repli§" + mesInterets.join(",") + "§" + aExplorer.length;

  try {
    if (window.tel && tel.action) {
      tel.action("feed_exploration_fallback", {
        n_interests: mesInterets.length,
        n_explore: aExplorer.length,
      });
    }
  } catch (e) {}

  return true;
}

// ── AIDES CONTEXTUELLES (spec §8) ────────────────────────────────────────────
//
// « La compréhension doit venir du produit lui-même. » Le §8 interdit le tour
// long après l'inscription (fermé par ailleurs) et autorise, à la place, des
// aides contextuelles sous trois conditions non négociables :
//
//   ① UNE SEULE à la fois — jamais deux bulles à l'écran ;
//   ② dismissible — l'utilisateur peut la faire taire ;
//   ③ « Aucun carrousel de sept écrans avant de pouvoir utiliser PASSIO » :
//      une aide n'est jamais modale, ne bloque rien, et ne se remontre pas.
//
// Ce n'est donc PAS un mini-tour déguisé. Chaque aide est déclenchée par le
// geste auquel elle se rapporte, une fois, et disparaît pour toujours.
//
// ⚠️ `hintsVus` est marqué à l'AFFICHAGE, pas au rejet. Une aide vue puis
// ignorée (l'utilisateur navigue ailleurs) a joué son rôle ; la remontrer
// tournerait au harcèlement, ce que le §8 refuse.
var HINTS = {
  feed_auteur: "Appuie sur l'auteur pour découvrir sa Passio",
  profil_visite: "Suis-le, ou envoie-lui un message",
  // ⚠️ La CLÉ reste `second_profil` — `hintsVus`, les tests et les ancres en
  // dépendent. Seul le LIBELLÉ suit ADR-011 : on n'ajoute plus un « profil »,
  // on ajoute une PASSION à son profil unique (2026-09-01).
  second_profil: "Tu peux ajouter une autre passion à ton profil",
  conversation_irl: "Quand vous êtes prêts, propose un moment IRL autour de votre passion",
};

function hintDejaVu(id) {
  try { return !!(state.hintsVus && state.hintsVus[id]); } catch (e) { return true; }
}

function hintVisible() {
  return !!document.querySelector(".passio-hint");
}

// Retire l'aide à l'écran, s'il y en a une. Appelé aussi à chaque navigation :
// une bulle ancrée sur un élément d'un autre écran n'a plus de sens.
function fermerHint() {
  var el = document.querySelector(".passio-hint");
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

// Affiche l'aide `id` ancrée sous `cible`. Ne fait rien si l'aide a déjà été
// vue, si une autre est à l'écran, ou si la cible n'est pas visible.
function montrerHint(id, cible) {
  try {
    // ⚠️ DEUX SYSTÈMES D'AIDE NE PEUVENT PAS COHABITER À L'ÉCRAN. Pendant le
    // parcours de première visite, les indications contextuelles sont celles du
    // lot (trois au maximum, ancrées, mémorisées) : laisser les aides
    // historiques se déclencher en plus produisait une bulle POSÉE SUR la carte
    // de bienvenue, dont elle recouvrait l'action principale (mesuré en capture
    // 390 px). Elles reprennent dès que le parcours est terminé ou coupé.
    if (window.PassioFirstRun && PassioFirstRun.estVisiteur()) return false;
    var texte = HINTS[id];
    if (!texte || hintDejaVu(id) || hintVisible()) return false;
    var el = (typeof cible === "string") ? document.querySelector(cible) : cible;
    if (!el || !el.offsetParent) return false;

    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false;

    var bulle = document.createElement("div");
    bulle.className = "passio-hint";
    bulle.setAttribute("role", "status");
    bulle.setAttribute("data-hint", id);
    // Texte statique venu de HINTS — aucune donnée utilisateur n'entre ici.
    bulle.innerHTML = '<span class="passio-hint-texte">' + escapeHtml(texte) + '</span>'
      + '<button type="button" class="passio-hint-ok" onclick="fermerHint()">Compris</button>';

    // Ancrage sous la cible, borné à la fenêtre pour ne jamais sortir à droite.
    var largeur = Math.min(300, window.innerWidth - 24);
    var gauche = Math.max(12, Math.min(r.left, window.innerWidth - largeur - 12));
    var haut = r.bottom + 8;
    // Si la cible est en bas d'écran, on passe la bulle au-dessus.
    if (haut + 70 > window.innerHeight) haut = Math.max(12, r.top - 70);
    bulle.style.cssText = "position:fixed;z-index:9000;left:" + Math.round(gauche) + "px;top:"
      + Math.round(haut) + "px;width:" + largeur + "px;";
    document.body.appendChild(bulle);

    try {
      state.hintsVus = state.hintsVus || {};
      state.hintsVus[id] = true;
      saveState();
    } catch (e) {}
    try { if (window.tel && tel.action) tel.action("hint_shown", { hint: id }); } catch (e) {}
    return true;
  } catch (e) { return false; }
}

// ══════════════════════════════════════════════════════════════════════════
// FIL FENÊTRÉ (drapeau `feed_window_v1`) — PERF-IOS phase 2
// ──────────────────────────────────────────────────────────────────────────
// Borne le nombre de cartes RÉELLEMENT montées dans #feedList, charge les
// suivantes par lots quand on approche du bas, et conserve l'ancre de scroll
// à la navigation aller-retour. Le classement, `_feedDomSig`, le HTML des
// cartes et le parcours Fil → IRL sont strictement inchangés.
//
//     localStorage.passio_feed_window_v1 = "1"  → fenêtrage actif
//     localStorage.passio_feed_window_v1 = "0"  → kill switch immédiat
//     window.PASSIO_FEED_WINDOW_V1 = false      → coupure en mémoire
//     ?passio_preview=feed-window-v1            → canari pour cette URL seulement
//
// ⚠️ POURQUOI L'ANCRE SAUTAIT (19–78 px sur le prototype, contre-revue Codex).
// `.post` porte `content-visibility: auto; contain-intrinsic-size: auto 320px`
// (styles.css). Tant qu'une carte n'a JAMAIS été peinte, le navigateur lui
// prête 320 px — or les cartes réelles vont de ~150 px (texte seul) à ~560 px
// (cover). Chaque carte qui entre pour la première fois dans le flux corrige
// alors sa hauteur d'un coup, et tout ce qui est en dessous se décale de la
// différence. Le mot-clé `auto` mémorise la taille après la première peinture,
// mais iOS abandonne cette mémoire sous pression mémoire : d'où le retour des
// sauts en session longue.
//
// Le correctif ne relâche AUCUN seuil, il supprime l'estimation :
//   ① une carte déshydratée garde son élément en place, avec une hauteur
//      explicite égale à sa hauteur mesurée (`getBoundingClientRect`, donc
//      fractionnaire, et box-sizing:border-box partout → boîte identique) ;
//      seuls ses enfants sont retirés. Marges et place dans le flux inchangées,
//      donc décalage nul par construction ;
//   ② une carte hydratée reçoit un `contain-intrinsic-size` explicite égal à sa
//      hauteur réelle, qui remplace la supposition de 320 px et survit à
//      l'oubli du `auto`.
// ══════════════════════════════════════════════════════════════════════════
var FEED_WINDOW_VERSION = "v1";
// Marge d'hydratation de part et d'autre du viewport. Large exprès : l'oeil ne
// doit jamais croiser une carte vide, même en scroll rapide au doigt.
var FEED_WINDOW_MARGIN_PX = 1400;
// Taille d'un lot de chargement progressif (identique au pas historique du
// bouton « Charger plus », pour ne pas changer la pagination serveur).
var FEED_WINDOW_BATCH = 20;

function feedWindowEnabled() {
  if (typeof window.PASSIO_FEED_WINDOW_V1 === "boolean") return window.PASSIO_FEED_WINDOW_V1;
  var stored = null;
  try { stored = localStorage.getItem("passio_feed_window_v1"); } catch (e) {}
  if (stored === "0") return false;  // kill switch local prioritaire
  if (stored === "1") return true;
  try {
    var preview = new URLSearchParams(window.location.search).get("passio_preview");
    if (preview === "feed-window-v1") return true;
  } catch (e) {}
  return false; // défaut sûr : rendu historique, à l'octet près
}

// Signature d'une carte : ce qui, dans le modèle, change son HTML rendu.
// Sert au repeint incrémental — jamais à décider d'un affichage.
function _feedWindowCardSig(p) {
  return p.id + ":" + (p.likes || 0) + ":" + ((p.comments || []).length)
       + ":" + (Array.isArray(p.reactions) ? p.reactions.length : 0);
}

// Marge d'hydratation, réglable pour les tests et pour un éventuel ajustement
// terrain sans redéploiement. Toute valeur non numérique retombe sur le défaut.
function feedWindowMarginPx() {
  var v = window.PASSIO_FEED_WINDOW_MARGIN;
  return (typeof v === "number" && isFinite(v) && v >= 0) ? v : FEED_WINDOW_MARGIN_PX;
}

function _feedWindowScroller() {
  return document.querySelector(".app-main") || document.getElementById("appMain");
}

// Déshydrate une carte : son élément RESTE dans le flux, à hauteur figée.
// Refuse tant qu'elle contient le focus (saisie en cours) ou une sélection.
function feedWindowDehydrate(card) {
  if (!card || card._fwOff) return false;
  try {
    if (document.activeElement && card.contains(document.activeElement)) return false;
  } catch (e) {}
  var h = card.getBoundingClientRect().height;
  if (!(h > 0)) return false;                       // jamais peinte : rien à figer
  card._fwHtml = card.innerHTML;
  card.style.height = h + "px";
  card.style.containIntrinsicSize = h + "px";
  card.innerHTML = "";
  card._fwOff = true;
  card.setAttribute("data-fw", "off");
  return true;
}

// Réhydrate une carte. Le HTML est REGÉNÉRÉ depuis le modèle quand le post est
// retrouvable : un like ou un commentaire arrivé pendant que la carte était
// démontée a modifié le modèle, pas le DOM absent — restaurer la chaîne mise de
// côté rafficherait des compteurs périmés. Repli sur la chaîne conservée.
function feedWindowHydrate(card) {
  if (!card || !card._fwOff) return false;
  var html = card._fwHtml || "";
  try {
    var id = card.getAttribute("data-postid");
    var post = (id && typeof findPostAnywhere === "function") ? findPostAnywhere(id) : null;
    if (post) {
      var tpl = document.createElement("template");
      tpl.innerHTML = _renderPostHTMLSafe(post);
      var fresh = tpl.content.firstElementChild;
      if (fresh && fresh.innerHTML) html = fresh.innerHTML;
    }
  } catch (e) {}
  card.innerHTML = html;
  card._fwHtml = null;
  card.style.height = "";
  card._fwOff = false;
  card.removeAttribute("data-fw");
  _feedWindowRedecorer(card);
  // La taille intrinsèque reste posée : elle vaut la dernière hauteur réelle
  // mesurée, ce qui est toujours plus juste que la supposition de 320 px.
  return true;
}

// ⚠️ Défaut relevé en contre-revue indépendante sur cette PR, et REPRODUIT le
// 2026-08-29 : 12 passerelles avant, 11 après une seule déshydratation, et elles
// ne revenaient jamais.
//
// Réhydrater REMPLACE l'intérieur de la carte. La passerelle UI-3
// (`[data-v3-bridge]`) posée DEDANS disparaît donc, alors que le marqueur
// `data-v3-decore` vit sur l'ÉLÉMENT et survit à `innerHTML`. Or c'est ce
// marqueur, et lui seul, qui autorise `styles.css` à masquer le CTA historique
// (`.post[data-v3-decore] .feed-irl-bridge`) : la carte se retrouvait avec la
// porte neuve retirée ET l'ancienne toujours masquée — donc AUCUNE porte vers
// l'IRL. Et l'observateur d'UI-3 écoute `#feedList` en `childList` SANS
// `subtree` : remplacer le contenu d'une carte ne le réveille pas, rien ne
// repose la passerelle. `feedWindowTeardown()` réhydratant tout, une simple
// navigation suffisait à vider le fil de ses passerelles.
//
// On redécore donc explicitement, à la seule sortie commune de toutes les
// réhydratations — observateur, coupure du drapeau, redimensionnement.
function _feedWindowRedecorer(card) {
  try {
    // Les marqueurs partent AVEC la décoration qu'ils accompagnaient : une carte
    // non décorée ne doit jamais rester porteuse de la condition qui masque le
    // CTA historique, même le temps d'une trame. `decorerArticle` les repose.
    card.removeAttribute("data-v3-decore");
    card.removeAttribute("data-v3-activity-source");
    if (window.PassioUIV3
        && typeof PassioUIV3.decorateFeed === "function"
        && typeof PassioUIV3.isEnabled === "function"
        && PassioUIV3.isEnabled()) {
      PassioUIV3.decorateFeed();
    }
  } catch (e) {
    // Jamais muet : un `catch` large sur un chemin de rendu a déjà masqué six
    // jours de fil vide dans ce dépôt.
    try { if (typeof diagLog === "function") diagLog("feedWindow.redecorer", e && e.message); } catch (_) {}
  }
}

// Fige la taille intrinsèque d'une carte montée sur sa hauteur réelle, pour que
// le navigateur n'ait plus jamais à la supposer (cause des sauts d'ancre).
function _feedWindowPinIntrinsic(card) {
  if (!card || card._fwOff) return;
  var h = card.getBoundingClientRect().height;
  if (h > 0) card.style.containIntrinsicSize = h + "px";
}

// UN SEUL observateur pour tout le fil, recréé seulement quand la liste change
// d'identité. `_fwObsToken` empêche d'en empiler un par rendu — c'est la fuite
// classique d'un fenêtrage naïf.
function feedWindowSync(list) {
  if (!feedWindowEnabled()) return;
  list = list || document.getElementById("feedList");
  if (!list) return;

  var scroller = _feedWindowScroller();
  if (!window._feedWindowObserver || window._feedWindowRoot !== scroller) {
    if (window._feedWindowObserver) {
      try { window._feedWindowObserver.disconnect(); } catch (e) {}
    }
    window._feedWindowObserverCount = (window._feedWindowObserverCount || 0) + 1;
    window._feedWindowRoot = scroller;
    window._feedWindowObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        if (el.id === "feedWindowSentinel") {
          if (entry.isIntersecting) feedWindowLoadNextBatch();
          return;
        }
        if (entry.isIntersecting) feedWindowHydrate(el);
        else feedWindowDehydrate(el);
      });
    }, { root: scroller || null, rootMargin: feedWindowMarginPx() + "px 0px" });
  }

  var obs = window._feedWindowObserver;
  var cards = list.querySelectorAll(".post[data-postid]");
  for (var i = 0; i < cards.length; i++) {
    var c = cards[i];
    if (c._fwObserved) continue;
    c._fwObserved = true;
    _feedWindowPinIntrinsic(c);
    obs.observe(c);
  }
  var sentinel = document.getElementById("feedWindowSentinel");
  if (sentinel && !sentinel._fwObserved) {
    sentinel._fwObserved = true;
    obs.observe(sentinel);
  }
}

// Chargement progressif : appelé quand la sentinelle de fin de liste entre dans
// la marge. Réutilise EXACTEMENT le chemin de pagination historique.
function feedWindowLoadNextBatch() {
  if (!feedWindowEnabled()) return;
  if (window._feedWindowLoading) return;
  var feedEl = document.getElementById("screen-feed");
  if (!feedEl || !feedEl.classList.contains("active")) return;
  window._feedWindowLoading = true;
  try {
    if (window.tel && tel.action) {
      tel.action("feed_window_batch", {
        v: FEED_WINDOW_VERSION,
        limit: window._feedRenderLimit || FEED_WINDOW_BATCH,
      });
    }
  } catch (e) {}
  var done = function () { window._feedWindowLoading = false; };
  if (typeof loadMoreFeedPosts !== "function") { done(); return; }
  try {
    var r = loadMoreFeedPosts();
    if (r && typeof r.then === "function") r.then(done, done);
    else done();
  } catch (e) { done(); }
}

// Repeint INCRÉMENTAL : n'ajoute que la queue manquante, sans toucher aux
// cartes déjà montées — donc sans réinitialiser le scroll ni re-décoder les
// images déjà à l'écran. Renvoie false dès que le moindre doute existe, et le
// rendu complet historique reprend la main.
function feedWindowPaintIncremental(list, visible, hasMore, moreBtnHtml) {
  if (!feedWindowEnabled()) return false;
  var mounted = list.querySelectorAll(".post[data-postid]");
  var n = mounted.length;
  if (n === 0 || n >= visible.length) return false;
  var sigs = list._fwSigs;
  if (!sigs || sigs.length !== n) return false;
  for (var i = 0; i < n; i++) {
    if (mounted[i].getAttribute("data-postid") !== visible[i].id) return false;
    if (sigs[i] !== _feedWindowCardSig(visible[i])) return false;   // compteur périmé
  }
  var tail = list.querySelector("#feedWindowTail");
  if (tail) tail.remove();
  list.insertAdjacentHTML("beforeend",
    visible.slice(n).map(_renderPostHTMLSafe).join("") + feedWindowTailHtml(hasMore, moreBtnHtml));
  list._fwSigs = visible.map(_feedWindowCardSig);
  feedWindowSync(list);
  return true;
}

// Pied de liste : bouton historique + sentinelle de chargement progressif.
// Le bouton reste, seul et inchangé, quand le drapeau est coupé.
function feedWindowTailHtml(hasMore, moreBtnHtml) {
  if (!feedWindowEnabled()) return hasMore ? moreBtnHtml : "";
  return '<div id="feedWindowTail">'
       + (hasMore ? moreBtnHtml : "")
       + '<div id="feedWindowSentinel" aria-hidden="true" style="height:1px;"></div>'
       + '</div>';
}

// ── Ancre de scroll ───────────────────────────────────────────────────────
// On ne mémorise PAS un `scrollTop` brut : à la navigation retour, les images
// ne sont pas encore décodées et le même pixel ne désigne plus le même post.
// On mémorise la carte de tête et son décalage, puis on corrige jusqu'à
// convergence — c'est ce qui tient l'écart sous 2 px.
function feedWindowRememberScroll() {
  if (!feedWindowEnabled()) return;
  var scroller = _feedWindowScroller();
  var list = document.getElementById("feedList");
  if (!scroller || !list) return;
  var top = scroller.getBoundingClientRect().top;
  var cards = list.querySelectorAll(".post[data-postid]");
  var anchor = null, delta = 0;
  for (var i = 0; i < cards.length; i++) {
    var d = cards[i].getBoundingClientRect().top - top;
    if (d >= -1) { anchor = cards[i]; delta = d; break; }   // 1re carte non dépassée
    anchor = cards[i]; delta = d;                            // sinon, la dernière au-dessus
  }
  window._feedScrollAnchor = {
    id: anchor ? anchor.getAttribute("data-postid") : null,
    delta: anchor ? delta : 0,
    y: scroller.scrollTop,
    // ⚠️ L'ancre mémorisait aussi l'état de l'en-tête rétractable, qui retirait
    // ~150 px au-dessus du fil une fois replié : restaurer la position sans
    // restaurer sa hauteur, c'était viser une page d'une autre géométrie, et
    // c'était la moitié haute des sauts de 19 à 78 px relevés en contre-revue.
    // Le repli a été RETIRÉ (#196) : la géométrie ne varie plus, il n'y a donc
    // plus rien à mémoriser ici. Ne pas le réintroduire sans le repli.
  };
}

var _FEED_GESTES = ["wheel", "touchstart", "pointerdown", "keydown"];

function feedWindowRestoreScroll() {
  if (!feedWindowEnabled()) return;
  var memo = window._feedScrollAnchor;
  if (!memo) return;
  var scroller = _feedWindowScroller();
  if (!scroller) return;

  // Une restauration déjà en cours appartient à une navigation précédente.
  _feedWindowArreterVeille();

  // ⚠️ `_feedScrollRestoring` neutralisait la bascule d'en-tête pendant la
  // convergence : sans ça, chaque correction de scroll la redéclenchait et la
  // cible bougeait sous la correction. Ce consommateur a disparu avec le repli
  // lui-même (#196). Le marqueur SURVIT parce qu'il dit « une restauration est
  // en cours » et que le test de cycle de vie exige qu'il soit bien relâché —
  // c'est ce qui prouve que la restauration se termine et ne fuit pas.
  window._feedScrollRestoring = true;

  // Toute la restauration — convergence PUIS veille — s'interrompt au premier
  // GESTE de l'utilisateur : dès qu'il touche l'écran, c'est lui qui décide où
  // est la page, plus nous. Les écouteurs sont posés tout de suite, et pas
  // seulement à l'ouverture de la veille : un doigt posé pendant la convergence
  // doit rendre la main immédiatement.
  var minuteries = [];
  var vivante = true;
  var arret = function () {
    if (!vivante) return;
    vivante = false;
    minuteries.forEach(clearTimeout);
    minuteries.length = 0;
    _FEED_GESTES.forEach(function (ev) { window.removeEventListener(ev, arret, true); });
    window._feedScrollRestoring = false;
    window._feedWindowVeille = null;
  };
  _FEED_GESTES.forEach(function (ev) {
    window.addEventListener(ev, arret, { capture: true, passive: true });
  });
  window._feedWindowVeille = arret;

  // Viser la carte mémorisée : renvoie l'écart corrigé, 0 si déjà en place,
  // null si le post a disparu du fil.
  var viser = function () {
    var list = document.getElementById("feedList");
    var card = (memo.id && list)
      ? list.querySelector('.post[data-postid="' + (window.CSS && CSS.escape ? CSS.escape(memo.id) : memo.id) + '"]')
      : null;
    if (!card) return null;
    var diff = (card.getBoundingClientRect().top - scroller.getBoundingClientRect().top) - memo.delta;
    if (Math.abs(diff) > 0.5) { scroller.scrollTop += diff; return diff; }
    return 0;
  };

  // Convergence : viser, mesurer, corriger — jusqu'à deux trames stables. La
  // mise en page et le décodage des images se posent de façon asynchrone : viser
  // une seule fois manque la cible, et trois trames n'y suffisaient pas (150 px
  // d'écart résiduel mesuré).
  var attempts = 0, stable = 0;
  var step = function () {
    if (!vivante) return;
    attempts++;
    var diff = viser();
    if (diff === null) { scroller.scrollTop = memo.y; arret(); return; }  // post disparu : repli brut
    if (diff !== 0) stable = 0; else stable++;
    if (stable < 2 && attempts < 12) { requestAnimationFrame(step); return; }
    _feedWindowVeillerAncre(viser, arret, minuteries, function () { return vivante; });
  };
  requestAnimationFrame(step);
}

// ── Veille d'ancre après convergence ──────────────────────────────────────
// ⚠️ Mesuré le 2026-08-29 : tant que l'ancrage de défilement NATIF du navigateur
// (`overflow-anchor`) opère, il rattrape lui-même toute croissance de contenu
// au-dessus du viewport, et la convergence ci-dessus paraît suffisante. Elle ne
// l'est pas : elle s'appuyait sans le savoir sur cette béquille. En la coupant
// (`overflow-anchor: none`), la même navigation dérivait de 114 à 138 px — c'est
// la forme locale du rouge CI, où le Chromium du runner ne compensait pas.
//
// On ne s'en remet donc plus au navigateur : après la convergence, on REVÉRIFIE
// l'ancre à quelques instants choisis et on corrige tout écart. Une veille par
// échéances plutôt qu'un observateur : coût borné, rien à démonter, aucune fuite.
var _FEED_VEILLE_MS = [90, 200, 350, 550, 800, 1100];

function _feedWindowVeillerAncre(viser, arret, minuteries, vivante) {
  _FEED_VEILLE_MS.forEach(function (ms, i) {
    minuteries.push(setTimeout(function () {
      if (!vivante()) return;
      // Le fil a pu être quitté entre-temps : ne rien corriger sur un écran caché.
      var ecran = document.getElementById("screen-feed");
      if (!ecran || ecran.style.display === "none" || !feedWindowEnabled()) { arret(); return; }
      if (viser() === null || i === _FEED_VEILLE_MS.length - 1) arret();
    }, ms));
  });
}

function _feedWindowArreterVeille() {
  if (typeof window._feedWindowVeille === "function") window._feedWindowVeille();
}

// Une rotation ou un changement de largeur périme toute hauteur figée : on les
// relâche et on laisse le flux se recalculer, plutôt que de conserver des
// hauteurs fausses qui décaleraient l'ancre (tests 320/390/430 px).
function feedWindowSetupResize() {
  if (window._feedWindowResizeAttached) return;
  window._feedWindowResizeAttached = true;
  var t = null;
  window.addEventListener("resize", function () {
    if (!feedWindowEnabled()) return;
    clearTimeout(t);
    t = setTimeout(function () {
      var list = document.getElementById("feedList");
      if (!list) return;
      list.querySelectorAll('.post[data-fw="off"]').forEach(feedWindowHydrate);
      list.querySelectorAll(".post[data-postid]").forEach(function (c) {
        c.style.containIntrinsicSize = "";
      });
      requestAnimationFrame(function () {
        list.querySelectorAll(".post[data-postid]").forEach(_feedWindowPinIntrinsic);
      });
    }, 150);
  }, { passive: true });
}

// Coupe tout : observateur, hauteurs figées, mémoire d'ancre. Appelé par le kill
// switch et quand on quitte le fil, pour qu'aucun observateur ne survive.
function feedWindowTeardown() {
  // La veille d'ancre survivrait au démontage et corrigerait un fil qu'on vient
  // de rendre à son état historique : la couper d'abord.
  _feedWindowArreterVeille();
  if (window._feedWindowObserver) {
    try { window._feedWindowObserver.disconnect(); } catch (e) {}
  }
  window._feedWindowObserver = null;
  window._feedWindowRoot = null;
  var list = document.getElementById("feedList");
  if (list) {
    list.querySelectorAll('.post[data-fw="off"]').forEach(feedWindowHydrate);
    list.querySelectorAll(".post[data-postid]").forEach(function (c) { c._fwObserved = false; });
  }
  var s = document.getElementById("feedWindowSentinel");
  if (s) s._fwObserved = false;
}

// Compteurs d'état — lus par les tests et par le pilotage. Aucune donnée
// utilisateur : uniquement des nombres et un booléen.
function feedWindowStats() {
  var list = document.getElementById("feedList");
  var cards = list ? list.querySelectorAll(".post[data-postid]") : [];
  var off = list ? list.querySelectorAll('.post[data-fw="off"]').length : 0;
  return {
    enabled: feedWindowEnabled(),
    total: cards.length,
    mounted: cards.length - off,
    dehydrated: off,
    observers: window._feedWindowObserver ? 1 : 0,
    observersCreated: window._feedWindowObserverCount || 0,
    loading: !!window._feedWindowLoading,
  };
}
window.feedWindowStats = feedWindowStats;

function renderFeed() {
  // 🎯 Masquer le skeleton loader
  const skeleton = $("#feedSkeleton");
  if (skeleton) skeleton.style.display = "none";

  const list = $("#feedList");

  // Kill switch : drapeau coupé alors que le fenêtrage a laissé des traces
  // (observateur vivant, cartes déshydratées). On remonte tout et on force un
  // rendu complet historique — le retour arrière est immédiat, sans rechargement.
  if (!feedWindowEnabled()
      && (window._feedWindowObserver || (list && list.querySelector('.post[data-fw="off"]')))) {
    try { feedWindowTeardown(); } catch (e) {}
    if (list) list._fwSigs = null;
    window._feedDomSig = null;
  }

  const mood = state.currentMood || "all";
  syncFeedViewUi();
  setupFeedIntentDelegation();
  syncFeedIntentUi();
  const intentsEnabled = feedIntentsEnabled();

  // Tous les posts (hors vlogs)
  let allPosts = allFeedPosts().filter(function(p) { return p.type !== "vlog"; });

  let posts = [];
  let availablePostsForMood = []; // Pour afficher les moods disponibles

  // ── SÉLECTION ADDITIVE DU FIL — « Suivis » OU passions OU envies ──
  //
  // Trois familles de critères, TOUTES cumulables, jamais croisées : une
  // publication entre dès qu'elle satisfait AU MOINS UN critère coché. Cocher
  // une passion n'éteint pas « Suivis », cocher une envie n'éteint ni l'un ni
  // l'autre — c'est la règle du OU inclusif.
  //
  //   auteur suivi   OU   passion cochée   OU   envie cochée
  //
  // Ce que ça change concrètement : si je suis Alice sans partager aucune de ses
  // passions, TOUTES ses publications restent admissibles tant que « Suivis »
  // est coché ; et une publication Moto d'un inconnu entre si « Moto » est
  // cochée, même si je ne suis personne.
  const suivisOn = feedFollowingSelected();
  const enviesChoisies = intentsEnabled ? feedIntentsSelected() : [];
  const followingIds = (state.user && state.user.following) || [];
  const suitQuelquun = followingIds.length > 0;

  let combinedPosts = [];

  // ⚠️ DEUX NOTIONS DISTINCTES, et les confondre change ce que l'écran vide
  // PROPOSE. Elles ne coïncident que dans un cas : « Suivis » coché alors qu'on
  // ne suit personne.
  //
  //   · `aucuneSource`    — rien de coché ne peut produire du contenu. C'est ce
  //                         qui décide s'il faut seulement calculer l'union.
  //   · `aucuneSelection` — l'utilisateur n'a coché AUCUN critère. C'est ce que
  //                         `nothingSelected` a toujours voulu dire : l'écran
  //                         qui invite à choisir, et son action « Explorer ».
  //
  // Les fondre faisait dire « Choisis tes passions » à quelqu'un qui a coché
  // « Suivis » et ne suit personne — donc qui a bel et bien choisi. Son écran
  // dit « Tu ne suis encore personne », et l'action que le lot UI-2 §5 y attache
  // est « Publier », pas « Explorer ».
  const aucuneSource = !(suivisOn && suitQuelquun)
    && _activeFeedPassions.size === 0
    && enviesChoisies.length === 0;
  const nothingSelected = !suivisOn
    && _activeFeedPassions.size === 0
    && enviesChoisies.length === 0;

  if (!aucuneSource) {
    if (_activeFeedPassions.size > 0) {
      combinedPosts = combinedPosts.concat(allPosts.filter(function(p) { return _activeFeedPassions.has(p.passion); }));
    }
    if (suivisOn && suitQuelquun) {
      combinedPosts = combinedPosts.concat(allPosts.filter(function(p) { return followingIds.includes(p.authorId); }));
    }
    if (enviesChoisies.length > 0) {
      combinedPosts = combinedPosts.concat(allPosts.filter(function(p) {
        return enviesChoisies.some(function (env) { return feedPostMatchesIntent(p, env); });
      }));
    }
  }
  // ── PREMIÈRE VISITE : FIL DE DÉCOUVERTE ─────────────────────────────────
  //
  // Un visiteur qui n'a encore RIEN choisi verrait sinon un cul-de-sac, et pas
  // n'importe lequel : `feedFollowingOn` vaut `true` par défaut et il ne suit
  // personne, donc `aucuneSource` est vrai, `combinedPosts` reste vide, et
  // l'écran affiche « Tu ne suis encore personne » — c'est-à-dire l'exact
  // contraire de la promesse du lot (« voir immédiatement du contenu »).
  //
  // On lui montre donc TOUT le contenu affichable, classé par le moteur
  // habituel. ⚠️ Rien n'est coché ni persisté : aucune tuile ne s'allume,
  // `_activeFeedPassions` et `state.selectedFeedPassions` restent vides — sans
  // quoi la migration vers son futur compte transférerait des « choix » qu'il
  // n'a jamais faits. Dès qu'il coche une passion, la sélection additive
  // ci-dessus reprend la main sans transition.
  var _frDecouverte = false;
  try { _frDecouverte = !!(window.PassioFirstRun && PassioFirstRun.filDecouverte()); } catch (e) {}
  if (_frDecouverte) combinedPosts = allPosts.slice();

  // ⚠️ La déduplication qui suit (`seenIds`) n'est plus une précaution mais une
  // NÉCESSITÉ : une publication d'un compte suivi, dans une passion cochée, et
  // portant une envie cochée entre par les TROIS sources à chaque rendu. Elle
  // ne doit apparaître qu'une fois — la clé est l'identifiant `p.id`.

  // Dédupliquer les posts
  const seenIds = new Set();
  availablePostsForMood = combinedPosts.filter(function(p) {
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });

  // Un post passe le filtre mood s'il est universel, ou si son mood est coché.
  function _moodVisible(p) {
    return p.mood === "all" || !p.mood || selectedMoods.has(p.mood);
  }

  // ── §7 « RÈGLE ABSOLUE » : le mood par défaut ne doit jamais masquer TOUT le
  // contenu des passions choisies.
  //
  // `selectedMoods` démarre à {"creation"} (l. ~2486). Mesuré le 2026-08-23 sur
  // le seed : 4 passions sur 17 (yoga, bienetre, cinema, actu) ont du contenu
  // et AUCUN post de mood "creation". Un compte neuf qui choisissait « yoga »
  // atterrissait donc sur « Aucun post pour cette sélection » alors que trois
  // posts yoga existaient — et le bouton "creation", seul mood actif, était
  // grisé avec pointer-events:none par renderMoodStripSmart : impossible de le
  // décocher. Cul-de-sac complet, pour la raison exactement inverse de celle
  // affichée.
  //
  // Tant que l'utilisateur n'a JAMAIS touché au filtre mood, celui-ci n'est pas
  // une intention : c'est un défaut d'usine. On l'élargit alors aux moods
  // réellement présents. Dès qu'il y touche (`state.feedMoodsTouched`, posé par
  // toggleMood), son choix est respecté sans condition — y compris s'il vide le
  // fil : c'est le sien.
  if (!intentsEnabled && onbV2Actif() && !state.feedMoodsTouched && availablePostsForMood.length > 0
      && availablePostsForMood.filter(_moodVisible).length === 0) {
    var _presents = {};
    availablePostsForMood.forEach(function(p) {
      if (p.mood && p.mood !== "all") _presents[p.mood] = 1;
    });
    // Seuls les moods qui ont un bouton : élargir vers "irl" (sans bouton dans
    // #moodSelector) donnerait un filtre actif que l'utilisateur ne pourrait ni
    // voir ni retirer.
    var _elargis = Object.keys(_presents).filter(function(m) {
      return !!document.querySelector('.mood-btn[data-mood="' + m + '"]');
    });
    if (_elargis.length) {
      selectedMoods = new Set(_elargis);
      if (typeof updateMoodButtonsUI === "function") updateMoodButtonsUI();
      try {
        if (window.tel && tel.action) {
          tel.action("feed_moods_widened", { n_moods: _elargis.length, n_interests: _activeFeedPassions.size });
        }
      } catch (e) {}
    }
  }

  // Appliquer le filtre mood :
  // - selectedMoods vide → rien
  // - mood "all" sur un post → visible quel que soit le mood sélectionné (post universel)
  // - sinon → correspondance exacte
  posts = intentsEnabled
    ? availablePostsForMood.slice()
    : (selectedMoods.size === 0 ? [] : availablePostsForMood.filter(_moodVisible));

  renderProfileStrip();

  // L'ancien rail n'est recalculé que lorsqu'il est réellement utilisé. Le
  // nouveau rail conserve les mêmes posts et ne pilote que leur ordre.
  if (intentsEnabled) syncFeedIntentUi();
  else renderMoodStripSmart(availablePostsForMood);

  renderStories();

  if (posts.length === 0) {
    // ── §7 : REPLI EXPLORATION plutôt qu'un cul-de-sac.
    // Déclenché quand les intérêts de l'utilisateur ne donnent rien À AFFICHER —
    // soit qu'aucun contenu n'existe, soit qu'il n'en existe que d'inaffichable
    // dans le fil (mood "irl", qui n'a pas de bouton). On ne le déclenche PAS
    // quand l'utilisateur a lui-même restreint les moods et que du contenu
    // existe derrière : ce vide-là est son choix, pas une impasse.
    // Repli d'exploration : « voici ce qui vit ailleurs ». Il ne se déclenche
    // que sur une sélection de PASSIONS restée vide de contenu. Une sélection
    // « Suivis » seule ne le déclenche pas : montrer du contenu d'inconnus
    // contredirait exactement ce que ce critère promet.
    if (onbV2Actif() && _activeFeedPassions.size > 0
        && (availablePostsForMood.length === 0 || !state.feedMoodsTouched)
        && renderFeedExplorationFallback(list)) {
      var emptyElRepli = $("#feedEmpty");
      if (emptyElRepli) emptyElRepli.style.display = "none";
      return;
    }
    list.innerHTML = "";
    var emptyEl = $("#feedEmpty");
    if (emptyEl) {
      var emptyTitle = emptyEl.querySelector(".empty-title");
      var emptyText = emptyEl.querySelector(".empty-text");

      var _seulSuivis = suivisOn && _activeFeedPassions.size === 0 && enviesChoisies.length === 0;
      if (_seulSuivis && !suitQuelquun) {
        // « Suivis » coché, aucun abonnement : le message dit quoi FAIRE, et où.
        // Ne jamais y proposer du contenu d'inconnus (cf. repli ci-dessus).
        if (emptyTitle) emptyTitle.textContent = "Tu ne suis encore personne";
        if (emptyText) emptyText.textContent = "Ouvre le profil de quelqu'un et touche « Suivre » : ses publications apparaîtront ici. Tu peux aussi cocher une passion ci-dessus.";
      } else if (_seulSuivis) {
        if (emptyTitle) emptyTitle.textContent = "Rien de neuf chez tes abonnements";
        if (emptyText) emptyText.textContent = "Les comptes que tu suis n'ont rien publié pour le moment. Coche une passion ci-dessus pour élargir ton fil.";
      } else if (nothingSelected) {
        // Aucun critère coché du tout : le seul vrai cul-de-sac. Il énonce les
        // DEUX sorties, puisqu'il y en a deux.
        if (emptyTitle) emptyTitle.textContent = "Choisis tes passions";
        if (emptyText) emptyText.textContent = "Ton fil réunit les passions que tu choisis et les personnes que tu suis. Touche une passion ci-dessus pour commencer.";
      } else if (!intentsEnabled && selectedMoods.size === 0) {
        if (emptyTitle) emptyTitle.textContent = "Choisis un mood";
        if (emptyText) emptyText.textContent = "Sélectionne un mood pour filtrer le contenu.";
      } else if (_activeFeedPassions.size === 0 && suitQuelquun) {
        if (emptyTitle) emptyTitle.textContent = "Rien de neuf pour l'instant";
        if (emptyText) emptyText.textContent = "Les personnes que tu suis n'ont rien publié. Ajoute une passion ci-dessus pour découvrir d'autres contenus.";
      } else if (_activeFeedPassions.size > 0) {
        if (emptyTitle) emptyTitle.textContent = "Aucun post pour cette sélection";
        if (emptyText) emptyText.textContent = intentsEnabled
          ? "Sois le premier à publier autour de cette passion."
          : "Essaie un autre mood ou sois le premier à publier ici.";
      } else {
        if (emptyTitle) emptyTitle.textContent = "Aucun contenu";
        if (emptyText) emptyText.textContent = intentsEnabled
          ? "Sélectionne une passion pour découvrir son contenu."
          : "Sélectionne une passion et un mood.";
      }
      // UI-2 : quand la V2 est active, l'état vide se termine par une action
      // (§5). Les textes ci-dessus ne bougent pas — le module ajoute un bouton
      // et le retire de lui-même dès que la V2 est coupée.
      if (window.PassioUIV2 && typeof window.PassioUIV2.decorateEmpty === "function") {
        window.PassioUIV2.decorateEmpty(emptyEl, { nothingSelected: nothingSelected });
      }
      emptyEl.style.display = "block";
    }
    return;
  }
  var emptyEl2 = $("#feedEmpty");
  if (emptyEl2) emptyEl2.style.display = "none";

  // ✅ CLASSEMENT PAR PERTINENCE (fraîcheur + affinité passion/suivis + engagement).
  // Repli chronologique strict via localStorage.passio_feed_rank="0". Voir rankFeedPosts.
  const sortedPosts = intentsEnabled
    ? rankFeedPostsForIntents(posts, enviesChoisies)
    : rankFeedPosts(posts);

  const renderLimit = window._feedRenderLimit || 20;
  const visible = sortedPosts.slice(0, renderLimit);
  const hasMore = sortedPosts.length > renderLimit || window._feedServerMayHaveMore;
  const moreBtnHtml = `<div style="text-align:center;padding:14px 0 24px;"><button class="btn ghost" id="feedLoadMoreBtn" onclick="loadMoreFeedPosts()">⤵ Charger plus de posts</button></div>`;

  // ── Guard no-op : si le contenu visible est STRICTEMENT le même que le
  // dernier rendu (mêmes posts, mêmes compteurs, mêmes filtres), on ne
  // reconstruit pas le DOM. Revenir sur le fil (goTo) ou pull-to-refresh sans
  // nouveauté ne re-décode plus 20 cartes d'images. Le bucket 5 min force un
  // repaint occasionnel pour rafraîchir les temps relatifs (« il y a X min »).
  const _domSig = [
    mood, Array.from(selectedMoods).join(","), Array.from(_activeFeedPassions).join(","),
    intentsEnabled ? "intents1:" + activeFeedIntent : "intents0",
    suivisOn ? "sv1" : "sv0", enviesChoisies.join("+"), followingIds.length, renderLimit, hasMore ? 1 : 0,
    Math.floor(Date.now() / 300000),
    // Le pont Fil → IRL change le HTML des cartes sans toucher aux posts : sans
    // lui dans la signature, basculer le drapeau ne repeindrait pas le fil.
    (typeof feedIrlBridgeEnabled === "function" && feedIrlBridgeEnabled()) ? "irl1" : "irl0",
    visible.map(function(p) {
      return p.id + ":" + (p.likes || 0) + ":" + ((p.comments || []).length) + ":" + (Array.isArray(p.reactions) ? p.reactions.length : 0);
    }).join("|"),
  ].join("§");
  if (_domSig === window._feedDomSig && list.children.length > 0) {
    // Le DOM est déjà le bon, mais l'observateur a pu être démonté en quittant
    // le fil : sans ce réarmement, revenir sur le fil laissait un fenêtrage
    // mort (plus rien ne s'hydrate ni ne se démonte) — trouvé par le test des
    // dix navigations, jamais par une relecture.
    feedWindowSync(list);
    return;
  }
  window._feedDomSig = _domSig;

  // ── Peinture en 2 temps : on affiche d'abord FAST cartes (paint initial ~2×
  // plus rapide à la navigation), puis on complète jusqu'à renderLimit juste
  // après, en idle, SANS reconstruire les premières cartes (insertAdjacentHTML).
  // Le nombre total affiché est inchangé — seul l'instant du paint diffère.
  // ── Fil fenêtré : si les cartes déjà montées sont exactement le début de ce
  // qu'il faut afficher (cas du chargement progressif), on n'ajoute que la
  // queue. Le DOM en place n'est pas retouché : ni scroll réinitialisé, ni
  // images re-décodées. Toute divergence renvoie au rendu complet ci-dessous.
  if (feedWindowPaintIncremental(list, visible, hasMore, moreBtnHtml)) return;

  const FAST = Math.min(12, visible.length);
  list.innerHTML = visible.slice(0, FAST).map(_renderPostHTMLSafe).join("")
    + (visible.length <= FAST ? feedWindowTailHtml(hasMore, moreBtnHtml) : "");
  list._fwSigs = feedWindowEnabled() && visible.length <= FAST
    ? visible.map(_feedWindowCardSig) : null;
  feedWindowSetupResize();
  feedWindowSync(list);

  // UI-2 : Bobine du fil et module « Passionnés à découvrir », insérés APRÈS
  // les premières cartes quand la V2 est active. Si elle est coupée, la fonction
  // ne fait rien : aucun post n'est ajouté, retiré ni réordonné dans les deux
  // cas — la décoration ne touche pas `sortedPosts`. Placée ici (dans la
  // peinture rapide) : les deux points d'insertion sont sous FAST, le
  // complément idle append derrière et l'ordre reste correct.
  if (window.PassioUIV2 && typeof window.PassioUIV2.decorateFeed === "function") {
    window.PassioUIV2.decorateFeed(list, visible);
  }

  // Aide §8 « première carte ». Différée d'un tick : la bulle s'ancre sur le
  // rectangle de la carte, qui n'est mesurable qu'une fois la peinture faite.
  // Ne part que si l'écran du Fil est bien celui qu'on regarde — renderFeed est
  // aussi appelé par renderEverything pendant que l'utilisateur est ailleurs.
  try {
    if (!hintDejaVu("feed_auteur")) {
      setTimeout(function () {
        var ecran = document.getElementById("screen-feed");
        if (!ecran || !ecran.classList.contains("active")) return;
        montrerHint("feed_auteur", "#feedList .post .post-author");
      }, 400);
    }
  } catch (e) {}

  // Jeton de rendu : si renderFeed est rappelé (filtre/refresh) avant que le
  // complément idle ne s'exécute, l'ancien complément est annulé.
  const _token = (window._feedRenderToken = (window._feedRenderToken || 0) + 1);
  if (visible.length > FAST) {
    const _fill = function() {
      if (window._feedRenderToken !== _token) return;          // rendu obsolète
      if (!document.body.contains(list)) return;
      // ⚠️ `visible` est un INSTANTANÉ pris avant l'attente idle, et ses posts
      // sont des copies (`allFeedPosts` fait `{...p}`). Ses compteurs ont pu
      // bouger depuis — c'est exactement ce qui arrive à un like optimiste
      // ANNULÉ par un refus serveur : la carte sortait « 🤍 5 », le cœur relu en
      // direct (`state.user.likedPosts`) mais le nombre figé à sa valeur
      // optimiste, et ce faux compteur survivait jusqu'au prochain rendu
      // complet. Les cartes du premier lot, elles, sont rattrapées par la
      // retouche en place ; celles-ci n'existaient pas encore, donc rien ne
      // pouvait les corriger. Défaut mesuré le 2026-09-02, atteignable dès
      // qu'une carte dépasse la douzième position.
      // On ne re-CLASSE rien : l'ordre reste celui de l'instantané, sinon les
      // cartes sauteraient sous le doigt pendant le défilement.
      const frais = visible.map(_feedCompteursFrais);
      list.insertAdjacentHTML("beforeend",
        frais.slice(FAST).map(_renderPostHTMLSafe).join("") + feedWindowTailHtml(hasMore, moreBtnHtml));
      if (feedWindowEnabled()) list._fwSigs = frais.map(_feedWindowCardSig);
      feedWindowSync(list);
    };
    (window.requestIdleCallback || function(f){ return setTimeout(f, 50); })(_fill, { timeout: 300 });
  }

  // Cascade d'apparition : UNIQUEMENT au premier rendu du fil de la session.
  // Sinon chaque re-render (refresh, like realtime, filtre) rejouait l'anim
  // sur 20 cartes → ~840ms de "lag" perçu à chaque fois.
  if (!window._feedIntroDone) {
    window._feedIntroDone = true;
    list.classList.add("feed-intro");
    setTimeout(function(){ list.classList.remove("feed-intro"); }, 700);
  } else {
    list.classList.remove("feed-intro");
  }
}

// Met à jour en place le compteur de like d'un post dans le DOM (fil + détail),
// sans reconstruire tout le fil. Utilisé par les canaux realtime (like d'un AUTRE
// compte) : avant, chaque like reçu déclenchait un renderFeed() complet (~34ms +
// re-décodage des images + scroll qui saute). post.liked = MON état (inchangé par
// le like d'autrui), on le préserve.
function patchPostLikeDom(post) {
  if (!post) return;
  var liked = !!post.liked;
  var sel = '.post[data-postid="' + post.id + '"] .post-action[data-action="like"]';
  document.querySelectorAll(sel).forEach(function(span){
    span.classList.toggle("liked", liked);
    span.innerHTML = (liked ? "❤️" : "🤍") + " " + (post.likes || 0);
  });
}

// renderFeed() différé + coalescé, et SEULEMENT si le fil est visible. Pour les
// événements realtime peu fréquents (nouveau post) : évite de reconstruire le fil
// à chaque insert et de le faire pour rien quand on est sur un autre écran.
var _feedRenderTimer = null;
function scheduleFeedRender() {
  var feedEl = document.getElementById("screen-feed");
  if (!feedEl || !feedEl.classList.contains("active")) return;
  clearTimeout(_feedRenderTimer);
  _feedRenderTimer = setTimeout(function(){ try { renderFeed(); } catch(e){} }, 350);
}

// Real-photo cover, maps each `cover` variant to an Unsplash HD photo.
// Unsplash allows hotlinking of their official image URLs indefinitely.
// A light dark gradient is overlaid at the bottom for legibility of the caption chip.
const COVER_PHOTOS = {
  stage:       "photo-1501386761578-eac5c94b800a", // live concert crowd
  street:      "photo-1519608487953-e999c86e7455", // street photography
  nature:      "photo-1470071459604-3b5ec3a7fe05", // forest light
  neon:        "photo-1550745165-9bc0b252726f",   // neon lights
  studio:      "photo-1598488035139-bdbb2231ce04", // studio mic / recording
  horizon:     "photo-1507525428034-b723cf961d3e", // ocean horizon
  dark_matter: "photo-1462331940025-496dfbfc7564", // galaxy / stars
  news:        "photo-1504711434969-e33886168f5c", // stacked newspapers
  news_asia:   "photo-1540959733332-eab4deabeeaf", // Tokyo skyline
  news_africa: "photo-1489392191049-fc10c97e64b6", // African landscape
  news_europe: "photo-1529699211952-734e80c4d42b", // European Parliament
  climate:     "photo-1569163139394-de4798d9c2c3", // melting ice
  tech:        "photo-1518770660439-4636190af475", // circuit board
  workshop:    "photo-1513519245088-0e12902e5a38", // woodworker hands
  kitchen:     "photo-1556909114-f6e7ad7d3136",   // chef plating
  dance:       "photo-1508700115892-45ecd05ae2ad", // dancer in motion
  book:        "photo-1519681393784-d120267933ba", // mountain/book contemplative
  trail:       "photo-1464822759023-fed622ff2c3b", // trail running
  sunrise:     "photo-1513745405825-efaf9a49315f", // sunrise horizon
};
const COVER_FALLBACK_EMOJI = {
  stage: "🎤", street: "🚶", nature: "🌿", neon: "✨", studio: "🎧",
  horizon: "🌅", dark_matter: "🌌", news: "📡", news_asia: "🗾", news_africa: "🌍",
  news_europe: "🇪🇺", climate: "🌱", tech: "💠", workshop: "🛠", kitchen: "🥘",
  dance: "💃", book: "📚", trail: "🥾", sunrise: "🌄",
};

function renderPostCover(p, passion) {
  const coverKey = (typeof p.cover === "string" && COVER_PHOTOS[p.cover]) ? p.cover : null;
  const photoId = coverKey ? COVER_PHOTOS[coverKey] : null;
  const passionLabel = passion.label || "";
  const passionEmoji = passion.emoji || "✨";

  if (photoId) {
    const primary = `https://images.unsplash.com/${photoId}?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80`;
    // Picsum fallback, always serves a real photograph, seeded by cover key for consistency.
    const seed = encodeURIComponent(coverKey + "-" + (p.id || ""));
    const fallback1 = `https://picsum.photos/seed/${seed}/900/560`;
    const fallback2 = `https://loremflickr.com/900/560/${encodeURIComponent(coverKey.replace(/_/g, ','))}`;
    const pc = passion.color || "#8b5cf6";
    // Double onerror chain: unsplash → picsum (always works) → loremflickr (themed) → gradient
    const onerr = `this.onerror=function(){this.onerror=function(){this.style.display='none';};this.src='${escapeJsArg(fallback2)}';};this.src='${escapeJsArg(fallback1)}';`;
    return `<div class="post-media post-cover-photo" style="
      background:
        radial-gradient(circle at 30% 30%, ${pc}55, transparent 55%),
        linear-gradient(135deg, ${pc}33 0%, #2a2450 60%, #1c1938 100%);
    ">
      <img class="post-cover-img" src="${primary}" alt="${escapeHtml(passionLabel)}" loading="lazy" onerror="${onerr}" />
      <div class="post-cover-overlay"></div>
      <div class="post-cover-caption">${passionEmoji} ${escapeHtml(passionLabel)}</div>
    </div>`;
  }

  // Fallback for posts without a mapped cover: subtle passion-colored gradient
  const pc = passion.color || "#8b5cf6";
  const fbEmoji = COVER_FALLBACK_EMOJI[p.cover] || passionEmoji;
  return `<div class="post-media post-cover" style="
    height: 220px;
    background:
      radial-gradient(circle at 30% 30%, ${pc}99, transparent 55%),
      linear-gradient(135deg, ${pc}44 0%, #2a2450 60%, #1c1938 100%);
  ">
    <div class="post-cover-emoji">${fbEmoji}</div>
    <div class="post-cover-caption">${passionEmoji} ${escapeHtml(passionLabel)}</div>
  </div>`;
}

// ════════════════════════════════════════════════════════════════════════
// LIKES CROSS-COMPTE SUR LES COMMENTAIRES (IRL & CDV) — table comment_likes.
// Compteurs partagés et visibles par TOUS. Cache mémoire window._commentLikeData
// = { id: {count, liked} }, hydraté depuis Supabase à l'ouverture d'un fil.
// + tri des commentaires (récents / plus aimés).
// ════════════════════════════════════════════════════════════════════════
function commentLikeInfo(id) {
  window._commentLikeData = window._commentLikeData || {};
  return window._commentLikeData[id] || { liked: false, count: 0 };
}
// NB : le bouton like inline (commentLikeBtnHtml) et son handler (toggleCommentLike)
// ont été retirés le 2026-08-04 — code mort : plus aucune surface ne les émettait
// depuis l'unification des likes de commentaires via comment_interactions
// (cf. _cl/sortComments plus bas qui lisent c.likes). commentLikeInfo/_commentLikeData
// restent utilisés comme repli de l'ancien cache comment_likes.
// Hydrate les compteurs réels depuis Supabase pour un lot d'ids, puis re-render.
async function hydrateCommentLikes(ids, rerender) {
  ids = (ids || []).filter(Boolean);
  if (!ids.length || typeof supaLoadCommentLikes !== "function" || !window._supaReal) return;
  try {
    var data = await supaLoadCommentLikes(ids);
    if (!data) return;
    window._commentLikeData = window._commentLikeData || {};
    Object.keys(data).forEach(function(id) { window._commentLikeData[id] = data[id]; });
    if (typeof rerender === "function") rerender();
  } catch (e) {}
}
function sortComments(list, mode) {
  var arr = (list || []).slice();
  // Likes : système unifié (c.likes via comment_interactions) avec repli sur l'ancien
  // cache comment_likes ; date : at (IRL/CDV) ou createdAt (fil).
  function _cl(c) { return (c.likes != null) ? c.likes : ((typeof commentLikeInfo === "function" ? commentLikeInfo(c.id).count : 0) || 0); }
  function _at(c) { return c.at || c.createdAt || 0; }
  if (mode === "liked") {
    arr.sort(function(a, b) { return _cl(b) - _cl(a) || _at(b) - _at(a); });
  } else {
    arr.sort(function(a, b) { return _at(b) - _at(a); }); // récents d'abord
  }
  return arr;
}
// Barre de tri (pills) réutilisable. `current` = "recent"|"liked", `onpick` = nom
// d'une fonction globale recevant le mode.
function commentSortBarHtml(current, onpick) {
  current = current || "recent";
  function pill(mode, label) {
    var active = current === mode;
    return '<button onclick="' + onpick + '(\'' + escapeJsArg(mode) + '\')" style="background:' + (active ? "var(--accent)" : "var(--bg-deep)") + ';color:' + (active ? "#fff" : "var(--muted)") + ';border:none;border-radius:999px;font-size:11px;font-weight:700;padding:4px 10px;cursor:pointer;">' + label + '</button>';
  }
  return '<div style="display:flex;gap:6px;margin-bottom:8px;">' + pill("recent", "🕐 Récents") + pill("liked", "❤️ Aimés") + '</div>';
}

// Rend UNE carte de post sans jamais faire echouer tout le fil : un post
// malforme (tableau attendu = undefined, .map/.includes sur du vide) est saute
// au lieu de vider #feedList entier (TypeError qui remontait jusqu'a renderFeed).
function _renderPostHTMLSafe(p) {
  try { return renderPostHTML(p); }
  catch (e) { try { if (typeof diagLog === "function") diagLog("renderPostHTML fail", (p && p.id) || "?", e && e.message); } catch (_) {} return ""; }
}
// Compteurs volatils relus sur l'objet CANONIQUE, sans toucher au classement.
//
// Un post rendu dans le fil est une COPIE (`allFeedPosts` fait `{...p}`), figée
// à l'instant du classement. Tout ce qui bouge après — un like optimiste, son
// annulation sur refus serveur, un commentaire arrivé en realtime — ne bouge que
// sur l'original. Peindre la copie plus tard affiche donc un nombre périmé.
//
// ⚠️ La propriété du post se retrouve par `findPostAnywhere`, jamais par
// `seed.posts.find || userPosts.find` : un post vit dans QUATRE tableaux.
// ⚠️ On ne recopie QUE les compteurs. Reprendre l'objet canonique entier
// perdrait les champs d'affichage que `allFeedPosts` a posés sur la copie
// (`_source`, `authorName`, `authorEmoji`…), et la carte sortirait anonyme.
// ⚠️ Retour tel quel quand rien n'a bougé : pas de copie inutile par carte.
function _feedCompteursFrais(p) {
  try {
    if (!p || !p.id || typeof findPostAnywhere !== "function") return p;
    var vrai = findPostAnywhere(p.id);
    if (!vrai) return p;
    var nbC = (vrai.comments || []).length, nbCp = (p.comments || []).length;
    var nbR = Array.isArray(vrai.reactions) ? vrai.reactions.length : -1;
    var nbRp = Array.isArray(p.reactions) ? p.reactions.length : -1;
    if ((vrai.likes || 0) === (p.likes || 0) && nbC === nbCp && nbR === nbRp) return p;
    var copie = Object.assign({}, p);
    copie.likes = vrai.likes;
    if (vrai.comments) copie.comments = vrai.comments;
    if (Array.isArray(vrai.reactions)) copie.reactions = vrai.reactions;
    return copie;
  } catch (e) { return p; }
}

function renderPostHTML(p) {
  // ✅ AFFICHER TOUJOURS LE VRAI NOM DU PROFIL!
  let authorName = p.authorName;

  // Si source est "me", utiliser le profil courant
  if (p._source === "me") {
    authorName = p.authorName || currentProfile()?.name || state.user.name;
  }
  // Si pas de nom et c'est un post Supabase, chercher dans les posts Supabase
  else if (!authorName && p._source === "supabase") {
    const supaPost = state.supabasePosts?.find(sp => sp.id === p.id);
    authorName = supaPost?.authorName || p.authorName;
  }
  // Si toujours pas de nom, chercher dans tous les posts
  if (!authorName) {
    const anyPost = [...(state.seed.posts || []), ...(state.supabasePosts || []), ...(state.userPosts || [])].find(post => post.id === p.id);
    authorName = anyPost?.authorName;
  }

  const _cuAuthor = userById(p.authorId) || {};
  const author = {
    // ⚠️ `id`, `passions` et `passion` DOIVENT être recopiés ici. Cet objet est
    // reconstruit de zéro à partir de quatre champs d'affichage, et il est passé
    // tel quel à des lecteurs qui ont besoin de savoir DE QUI ils parlent
    // (`userById`, `avatarBg`, la passion de repli). Sans eux, ces lecteurs
    // rendent "" sans erreur ni test rouge ailleurs.
    id: p.authorId,
    passions: _cuAuthor.passions,
    passion: _cuAuthor.passion || p.passion,
    name: authorName || _cuAuthor.name || "Profil",  // Fallback minimal au lieu de "Utilisateur"
    profileEmoji: p.authorEmoji || _cuAuthor.profileEmoji || "✨",
    avatar: p.authorColor || _cuAuthor.avatar || "#8b5cf6",
    photoUrl: _cuAuthor.photoUrl || p.authorAvatar || null,  // 📷 photo de profil (live > snapshot)
  };
  const passion = passionById(p.passion);
  const liked = (state.user.likedPosts || []).includes(p.id);
  const likeClass = liked ? "liked" : "";

  let media = "";
  // ⚠️ La carte « Carnet de voyage » du fil a été RETIRÉE (§6). Les
  // publications de type `vlog` n'entrent plus dans aucun fil (`allFeedPosts`),
  // donc cette branche n'avait plus de contenu à peindre — et son `onclick`
  // appelait `openVlogViewer`, qui n'existe plus. La classe `.post-vlog-card`,
  // elle, RESTE : la carte d'événement partagé s'en sert (juste dessous).
  // Événement IRL partagé dans le feed (shareEventInFeed, app-07) → carte
  // compacte cliquable vers la fiche. Porté par sharedReelData.kind==="event".
  if (p.sharedReelData && p.sharedReelData.kind === "event") {
    const se = p.sharedReelData;
    const sd = (typeof fmtEventDate === "function" && se.date) ? fmtEventDate(se.date) : null;
    const sp = passionById(se.passion) || { label: "", emoji: "📍" };
    media = `<div class="post-vlog-card" onclick="event.stopPropagation();openEventDetails('${escapeJsArg(se.id)}')" style="cursor:pointer;">
      <div style="display:flex;gap:12px;align-items:center;padding:14px;background:var(--bg-soft);border:1px solid var(--border);border-radius:14px;">
        <div class="event-date-block" style="flex-shrink:0;">
          <div class="event-date-day">${sd ? escapeHtml(sd.day) : "📍"}</div>
          <div class="event-date-month">${sd ? escapeHtml(sd.month) : ""}</div>
        </div>
        <div style="flex:1;min-width:0;">
          <span class="cdv-feed-tag" style="display:inline-block;margin-bottom:4px;">📍 ÉVÉNEMENT IRL</span>
          <div style="font-weight:800;font-size:15px;line-height:1.25;">${escapeHtml(se.title || "Événement")}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:3px;">${sp.emoji} ${escapeHtml(sp.label)}${se.city ? " · 📍 " + escapeHtml(se.city) : ""}</div>
        </div>
        <span class="btn small primary" style="flex-shrink:0;pointer-events:none;">Voir</span>
      </div>
    </div>`;
  }
  const shouldCover = p.type === "photo" || (p.cover && p.type !== "vlog");
  if (shouldCover) {
    // ✅ VALIDATION PHOTO - Vérifier que l'URL est valide
    if (p.image && p.image.trim()) {
      // ✅ Ajouter fallback si l'image échoue à charger
      media = `<div class="post-media">
        <img
          src="${safeUrlAttr(passioThumb(p.image, 700))}"
          alt="post"
          loading="lazy" decoding="async"
          onerror="this.onerror=null;this.style.background='#eee';this.style.minHeight='200px';"
          style="width:100%;display:block;background:#f5f5f5;"
        />
      </div>`;
    } else {
      media = renderPostCover(p, passion);
    }
  }
  if (p.type === "audio") {
    // ✅ VALIDATION AUDIO - Vérifier que l'URL est valide
    if (p.audio && p.audio.trim()) {
      media = `<div class="post-audio">
        🎙 <audio
          controls
          src="${safeUrlAttr(p.audio)}"
          onerror="console.error('Audio failed:', this.src);"
          style="width:100%;"
        ></audio>
      </div>`;
    } else {
      media = `<div class="post-audio" style="background:#f0f0f0;padding:12px;border-radius:8px;text-align:center;color:#666;">
        [Audio indisponible] 🎙
      </div>`;
    }
  }
  if (p.type === "video") {
    // ✅ VALIDATION VIDÉO - Vérifier que l'URL est valide
    if (p.video && p.video.trim()) {
      media = `<div class="post-media">
        <video
          src="${safeUrlAttr(p.video)}"
          controls
          playsinline
          preload="metadata"
          onerror="this.style.background='#000';this.style.color='#888';this.innerHTML='[Vidéo indisponible]';"
          style="width:100%;display:block;background:#000;border-radius:0;max-height:560px;"
        ></video>
      </div>`;
    } else {
      media = renderPostCover(p, passion);
    }
  }

  const commentsPreview = (p.comments || []).slice(0, 2).map(c => {
    const cu = userById(c.authorId) || { name: "?", profileEmoji: "👤", avatar: "#64748b" };
    const cSrc = c.authorId === "me" ? "me" : "seed";
    // « Aimé par moi » : likeComment() enregistre le like sous MY_UID (souvent ≠
    // state.user.id, parfois vide) → comparer likedBy à TOUTES mes identités,
    // sinon le ❤️ de l'aperçu du fil repassait en 🤍 (like « qui ne marche pas »).
    const _cSelfIds = [(typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : null, state.user?.id, "me"].filter(Boolean);
    const cLiked = (c.likedBy || []).some(x => _cSelfIds.indexOf(x) > -1);
    const cLikes = c.likes || 0;
    const cReplies = c.replies || [];

    return `<div class="comment" data-commentid="${escapeHtml(c.id)}">
      <div class="avatar sm" style="background:${avatarBg(cu)};cursor:pointer;" onclick="event.stopPropagation();openUserProfile('${escapeJsArg(c.authorId)}','${escapeJsArg(cSrc)}')">${avatarInner(cu)}</div>
      <div class="comment-body">
        <div class="comment-author" style="cursor:pointer;" onclick="event.stopPropagation();openUserProfile('${escapeJsArg(c.authorId)}','${escapeJsArg(cSrc)}')">${escapeHtml(cu.name)}</div>
        ${identitePassionsHTML(cu, "ident-passions-sm")}
        <div class="comment-text">${escapeHtml(c.text)}</div>
        <div class="comment-meta">${fmtTime(c.createdAt)}</div>
        <div class="comment-actions">
          <span class="comment-action ${cLiked ? "liked" : ""}" data-cmtlike="${escapeHtml(c.id)}" onclick="return likeComment('${escapeJsArg(p.id)}','${escapeJsArg(c.id)}', event);">
            ${cLiked ? "❤️" : "🤍"} ${cLikes}
          </span>
          <span class="comment-action" onclick="return replyToComment('${escapeJsArg(p.id)}','${escapeJsArg(c.id)}','${escapeJsArg(cu.name)}', event);" title="Répondre">💬</span>
          <span class="comment-action" onclick="return showEmojiPickerForComment('${escapeJsArg(p.id)}','${escapeJsArg(c.id)}', event);" title="Emoji & GIF">😊</span>
          ${cReplies.length > 0 ? `<span class="comment-reply-count" onclick="event.stopPropagation();openComments('${escapeJsArg(p.id)}');return false;">▼ ${cReplies.length} réponse${cReplies.length > 1 ? "s" : ""}</span>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");

  // Tronquer le texte long avec un "Lire la suite"
  const fullText = p.text || "";
  const truncated = fullText.length > 220;
  const displayText = truncated ? fullText.slice(0, 220) + "…" : fullText;
  // Le HTML historique reste littéralement identique quand le flag est OFF.
  const FEED_POST_OPEN_FN = feedIntentsEnabled() ? "openFeedPost" : "openPost";

  // ⚠️ L'en-tête de la carte NE PORTE PAS la ligne d'identité
  // (identitePassionsHTML), et c'est une décision de Benjamin du 2026-09-02,
  // sur essai réel : « sur un post dans le fil tu écris deux fois la passion
  // concernée, je veux qu'il n'y en ait qu'une, celle avec l'heure du post. »
  // Les deux lignes se suivaient — « Moto · Podcast · Tech », puis « Moto ·
  // il y a 2 h » — et sur un compte mono-passion elles répétaient littéralement
  // le même mot. Seule reste post-author-meta, qui nomme la passion DE LA
  // PUBLICATION : la bonne question sur une carte, alors que la ligne
  // d'identité répondait « quelles sont les passions du compte ? ».
  //
  // ⚠️ `post-passion-tag` n'AJOUTE PAS une seconde mention : il enrobe celle qui
  // existait déjà, pour la rendre lisible (accent + graisse) au lieu du gris
  // `--muted` à 11 px qu'elle partageait avec l'heure. Retour de testeur du
  // 2026-09-02 : « on ne voit pas assez à quelle passion appartient un post ».
  // Le `textContent` de `.post-author-meta` est INCHANGÉ à l'octet près —
  // deux suites l'assertent (`profil-entete-passions`, `refonte-multi-passion`).
  //
  // ⚠️ `passion.label` PASSE PAR `escapeHtml`, et ce n'est pas décoratif :
  // `passionById` peut rendre une entrée de `state.user.customPassions`, dont le
  // libellé est de la saisie libre (`label: name`). La portée est le compte
  // lui-même — aucun libellé d'un TIERS n'atteint cette ligne — mais la
  // convention maison ne souffre pas d'exception, et la ligne d'origine ne
  // l'échappait déjà pas. Corrigé en même temps que l'enrobage plutôt que laissé
  // pour plus tard.
  // L'identité complète reste centralisée (ADR-011 §3) : elle vit sur les DEUX
  // en-têtes de profil, où elle est cliquable, et sur les surfaces denses
  // (commentaires, listes, inbox) — aucune de celles-là n'affiche de passion à
  // côté, donc aucune n'y fait doublon. Même retrait dans openPost, qui
  // affichait exactement la même paire.
  return `<article class="post" data-postid="${escapeHtml(p.id)}">
    <div class="post-header">
      <div class="avatar" style="background:${avatarBg(author)};cursor:pointer;" onclick="openUserProfile('${escapeJsArg(p.authorId)}','${escapeJsArg(p._source)}')">${avatarInner(author)}</div>
      <div class="post-author" style="cursor:pointer;" onclick="openUserProfile('${escapeJsArg(p.authorId)}','${escapeJsArg(p._source)}')">
        <div class="post-author-name">${escapeHtml(author.name || "Moi")}</div>
        <div class="post-author-meta">
          <span class="post-passion-tag">${escapeHtml(passion.emoji)} ${escapeHtml(passion.label)}</span> · ${fmtTime(p.createdAt)}
          ${p._source === "me" && p.syncStatus ? `
            ${p.syncStatus === "syncing" ? '<span style="margin-left:8px;font-size:10px;color:var(--muted);">⏳ Sync...</span>' : ""}
            ${p.syncStatus === "synced" ? '<span style="margin-left:8px;font-size:10px;color:#22c55e;">📡 En ligne</span>' : ""}
            ${p.syncStatus === "offline" ? '<span style="margin-left:8px;font-size:10px;color:#f59e0b;">📴 Local</span>' : ""}
          ` : ""}
        </div>
      </div>
      ${_estMonPost(p) ? `<button class="post-menu-btn" onclick="event.stopPropagation();openPostOptions('${escapeJsArg(p.id)}')" aria-label="Options du post" title="Options">
        <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
      </button>` : ""}
      ${_firstRunDemoTag(p)}
      ${_moodTagHTML(p.mood)}
    </div>

    <div class="post-body" onclick="${FEED_POST_OPEN_FN}('${escapeJsArg(p.id)}')" style="cursor:pointer;">
      ${escapeHtml(displayText)}
      ${truncated ? `<span style="color:var(--accent);font-weight:700;"> Lire la suite</span>` : ""}
    </div>
    <div onclick="${FEED_POST_OPEN_FN}('${escapeJsArg(p.id)}')" style="cursor:pointer;">${media}</div>

    <div class="post-actions">
      <span class="post-action ${likeClass}" data-action="like" onclick="likePost('${escapeJsArg(p.id)}', false, this)">
        ${liked ? "❤️" : "🤍"} ${p.likes || 0}
      </span>
      <span class="post-action" data-cmtcount="${escapeHtml(p.id)}" onclick="openComments('${escapeJsArg(p.id)}')">💬 ${commentThreadCount(p.comments)}</span>
      <span class="post-action" onclick="return showEmojiPickerForPost('${escapeJsArg(p.id)}', event);" title="Emoji & GIF">😊</span>
      <span class="post-action" onclick="event.stopPropagation();sharePost('${escapeJsArg(p.id)}')" title="Partager" aria-label="Partager">
        ${shareIconSvg(18)}
      </span>
      <span class="post-react-chip-holder" data-postchip="${escapeHtml(p.id)}" style="margin-left:auto;">${_postReactChipHtml(p.id)}</span>
    </div>

    ${typeof feedIrlBridgeCtaHtml === "function" ? feedIrlBridgeCtaHtml(p) : ""}

    ${commentsPreview ? `<div style="margin-top:8px;" onclick="openPost('${escapeJsArg(p.id)}')" style="cursor:pointer;">${commentsPreview}</div>` : ""}
  </article>`;
}

async function openPost(id) {
  const post = state.seed.posts.find(p => p.id === id)
            || state.userPosts.find(p => p.id === id)
            || (state.supabasePosts || []).find(p => p.id === id);
  if (!post) return;
  const page = document.getElementById("postDetailPage");
  const content = document.getElementById("postDetailContent");
  if (!page || !content) return;

  // ⚡ Les commentaires Supabase ne sont PLUS chargés en bloquant ici : la page
  // détail s'affichait après ~700 ms (le temps du réseau) = grosse impression de
  // lag. On rend TOUT DE SUITE avec les commentaires locaux puis on rafraîchit en
  // arrière-plan (_loadPostDetailComments, en bas de la fonction).
  // ⚠️ MÊME PIÈGE QUE `renderPostHTML` : ces objets sont reconstruits à partir de
  // champs d'affichage. Sans `id` ni `passions`, les lecteurs qui remontent au
  // compte (`userById`, passion de repli) ne savent pas de qui ils parlent.
  const author = (post._source === "me" || (typeof MY_UID !== "undefined" && post.authorId === MY_UID))
    ? { id: (typeof MY_UID !== "undefined" && MY_UID) || "me", name: currentProfile()?.name || state.user.name, profileEmoji: currentProfile()?.emoji || "✨", avatar: currentProfile()?.color || "#8b5cf6", photoUrl: (state.user.general || {}).avatarPhoto || null }
    : (function(){ const cu = userById(post.authorId) || {}; return post.authorName ? { id: post.authorId, passions: cu.passions, passion: cu.passion || post.passion, name: post.authorName, profileEmoji: post.authorEmoji || "✨", avatar: post.authorColor || "#8b5cf6", photoUrl: cu.photoUrl || post.authorAvatar || null } : cu; })();
  const passion = passionById(post.passion);
  const liked = state.user.likedPosts.includes(id);

  // Media (réutilise la logique de renderPostHTML)
  let media = "";
  if (post.type === "photo" || (post.cover && post.type !== "vlog" && post.type !== "audio")) {
    media = post.image
      ? `<div class="post-media"><img loading="lazy" decoding="async" src="${safeUrlAttr(passioThumb(post.image, 700))}" alt="post" style="width:100%;border-radius:14px;"/></div>`
      : renderPostCover(post, passion);
  }
  if (post.type === "audio") {
    media = post.audio
      ? `<div class="post-audio">🎙 <audio controls src="${safeUrlAttr(post.audio)}" style="flex:1;"></audio></div>`
      : `<div class="post-audio" style="padding:14px;background:var(--bg-card);border-radius:13px;border:1px solid var(--border);gap:10px;">🎙 <div style="flex:1;font-size:13px;color:var(--text-dim);">Podcast de ${escapeHtml(author.name || "un créateur")} · Mode démo</div></div>`;
  }
  if (post.type === "video" && post.video) {
    media = `<div class="post-media"><video src="${safeUrlAttr(post.video)}" controls playsinline preload="metadata" style="width:100%;border-radius:14px;background:#000;"></video></div>`;
  }

  // Renderer UNIFIÉ (identique au fil / IRL / CDV / modale). Le bloc inline
  // dupliqué qui vivait ici divergeait du canonique : pas de pastille de
  // réactions agrégées « 😍 N », pas de menu ⋯, like non résolu sur toutes mes
  // identités (MY_UID/state.user.id/"me"). _renderCommentsList (app-04) est la
  // source unique de vérité — plus aucune divergence à maintenir en double.
  const allComments = (post.comments && post.comments.length)
    ? _renderCommentsList(post.comments, id) : "";

  content.innerHTML = `
    <div class="post" data-postid="${escapeHtml(id)}" style="cursor:default;">
      <div class="post-header">
        <div class="avatar" style="background:${avatarBg(author)};cursor:pointer;" onclick="openUserProfile('${escapeJsArg(post.authorId)}','${escapeJsArg(post._source || "seed")}')">${avatarInner(author)}</div>
        <div class="post-author" style="cursor:pointer;" onclick="openUserProfile('${escapeJsArg(post.authorId)}','${escapeJsArg(post._source || "seed")}')">
          <div class="post-author-name">${escapeHtml(author.name || "Utilisateur")}</div>
          <div class="post-author-meta"><span class="post-passion-tag">${escapeHtml(passion.emoji)} ${escapeHtml(passion.label)}</span> · ${fmtTime(post.createdAt)}</div>
        </div>
        ${(state.userPosts || []).some(function(up){ return up.id === id; }) ? `<button class="post-menu-btn" onclick="event.stopPropagation();openPostOptions('${escapeJsArg(id)}')" aria-label="Options du post" title="Options">
          <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
        </button>` : ""}
        ${_moodTagHTML(post.mood)}
      </div>
      <div class="post-body" style="white-space:pre-wrap;">${escapeHtml(post.text || "")}</div>
      ${media ? `<div class="dbl-like" ondblclick="_dblLikeDetail('${escapeJsArg(id)}', event)" title="Double-clic pour aimer ❤️">${media}</div>` : ""}
      <div class="post-actions">
        <span class="post-action ${liked ? "liked" : ""}" onclick="event.stopPropagation(); likePostDetail('${escapeJsArg(id)}', this);">
          ${liked ? "❤️" : "🤍"} ${post.likes || 0}
        </span>
        <span class="post-action" data-cmtcount="${escapeHtml(id)}" onclick="openComments('${escapeJsArg(id)}')">💬 ${commentThreadCount(post.comments)}</span>
        <span class="post-action" onclick="return showEmojiPickerForPost('${escapeJsArg(id)}', event);" title="Emoji & GIF">😊</span>
        <span class="post-action" onclick="event.stopPropagation();sharePost('${escapeJsArg(id)}')" title="Partager" aria-label="Partager">
          ${shareIconSvg(18)}
        </span>
        <span class="post-react-chip-holder" data-postchip="${escapeHtml(id)}" style="margin-left:auto;">${_postReactChipHtml(id)}</span>
      </div>
    </div>
    <div style="margin-top:8px;">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:10px;">Commentaires (${commentThreadCount(post.comments)})</div>
      <div id="postDetailComments" data-thread="${escapeHtml(id)}">${allComments || '<div style="font-size:13px;color:var(--muted);text-align:center;padding:20px 0;">Aucun commentaire — sois le premier 💬</div>'}</div>
    </div>
    <div style="height:20px;"></div>
  `;

  // Une entrée d'historique, pour que le geste de retour ferme la page au lieu
  // de changer d'écran DERRIÈRE elle. Seulement à l'OUVERTURE : rouvrir une
  // autre publication alors que la page est déjà à l'écran ne doit pas empiler.
  if (page.style.display === "none" || !page.style.display) pushOverlayHistory("post", "#post");
  page.style.display = "flex";
  page.scrollTop = 0;

  // Rafraîchit les commentaires depuis Supabase EN ARRIÈRE-PLAN (n'ayant plus
  // bloqué l'affichage) puis patche #postDetailComments sans jank (scroll préservé,
  // no-op si inchangé). Cache 20 s partagé avec openComments → rouvrir = instantané.
  _loadPostDetailComments(id, post);
}

async function _loadPostDetailComments(id, post) {
  if (typeof supa === "undefined" || !supa || typeof MY_UID === "undefined" || !MY_UID) return;
  window._cmtThreadLoadedAt = window._cmtThreadLoadedAt || {};
  if ((Date.now() - (window._cmtThreadLoadedAt[id] || 0)) < 20000) return; // déjà frais
  try {
    const supaComments = await supaLoadComments(id);
    if (supaComments && supaComments.length > 0) {
      const supaIds = new Set(supaComments.map(c => c.id));
      const localOnly = (post.comments || []).filter(c => !supaIds.has(c.id) && !c.fromSupabase);
      post.comments = [...supaComments.map(c => ({ ...c, text: c.content || c.text || "" })), ...localOnly]
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    if (typeof hydrateCommentInteractions === "function") {
      try { await hydrateCommentInteractions(post); } catch(e) {}
    }
    window._cmtThreadLoadedAt[id] = Date.now();
    const pd = document.getElementById("postDetailComments");
    if (pd && pd.getAttribute("data-thread") === id && typeof _setThreadHtml === "function") {
      _setThreadHtml(pd, post.comments.length
        ? _renderCommentsList(post.comments, id)
        : '<div style="font-size:13px;color:var(--muted);text-align:center;padding:20px 0;">Aucun commentaire — sois le premier 💬</div>');
    }
  } catch(e) {}
}

// Like depuis la vue détail d'un post : délègue au likePost() canonique
// (cherche dans seed + userPosts + supabasePosts via findPostAnywhere, sync
// Supabase, notif auteur) puis met à jour le bouton EN PLACE — sans re-render
// global. Remplace l'ancien handler inline dupliqué qui oubliait supabasePosts
// (cf. CLAUDE.md) et désynchronisait le compteur → « double like ».
function likePostDetail(id, el) {
  likePost(id, true); // skipRender : on est en vue détail, pas dans le fil
  const liked = state.user.likedPosts.includes(id);
  const p = findPostAnywhere(id);
  const n = p ? (p.likes || 0) : 0;
  if (el) {
    el.classList.toggle("liked", liked);
    el.innerHTML = (liked ? "❤️" : "🤍") + " " + n;
  }
}
