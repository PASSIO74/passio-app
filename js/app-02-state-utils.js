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
      score: 0,
      passia: 0,
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
      general: {},
    },
    seed,                    // fake accounts / posts / events / stories / notifs / quests (SEED DE DÉMO SEULEMENT)
    supabasePosts: [],       // ✅ POSTS VRAIS UTILISATEURS chargés depuis Supabase
    userPosts: [],           // posts published by the user
    userEvents: [],          // events created by the user
    transactions: [],
    notifications: [],       // user-specific notifications (seed copied at init)
    quests: [],              // user-specific quest progress (seed copied at init)
    currentMood: "all",
    selectedFeedPassions: [], // passion IDs actifs dans le fil
    feedMoodsTouched: false,  // l'utilisateur a-t-il déjà réglé le filtre mood lui-même ?
    feedInterestsMigrated: false, // le compte vit-il dans le modèle selectedFeedPassions ?
    hintsVus: {},             // aides contextuelles déjà montrées (spec §8)
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // Always refresh seed (in case we update it between versions)
    const def = defaultState();
    parsed.seed = def.seed;
    // Migrate for upgraded schema
    if (!parsed.user.seenStories) parsed.user.seenStories = [];
    if (!Array.isArray(parsed.notifications) || !parsed.notifications.length) {
      parsed.notifications = def.seed.notifications.map(n => ({ ...n }));
    }
    if (!Array.isArray(parsed.quests) || !parsed.quests.length) {
      parsed.quests = def.seed.quests.map(q => ({ ...q }));
    }
    if (typeof parsed.landingSeen === "undefined") parsed.landingSeen = false;
    if (!Array.isArray(parsed.user.customPassions)) parsed.user.customPassions = [];
    if (!Array.isArray(parsed.user.following)) parsed.user.following = [];
    if (!Array.isArray(parsed.user.seenNotifIds)) parsed.user.seenNotifIds = [];
    if (!Array.isArray(parsed.selectedFeedPassions)) parsed.selectedFeedPassions = [];
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
  const keepSeed = state.seed, keepSupa = state.supabasePosts;
  window._hydratingState = true;
  try {
    Object.keys(data).forEach((k) => { if (k !== "seed" && k !== "supabasePosts") state[k] = data[k]; });
    state.seed = keepSeed;
    state.supabasePosts = keepSupa;
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
      _applyUserState(data.data);
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
      // Restaure le profil actif local s'il est toujours dans la liste fusionnée.
      if (localCurrentId) {
        const stillExists = Array.isArray(state.user.profiles) && state.user.profiles.some(function(p) { return p.id === localCurrentId; });
        if (stillExists) state.user.currentProfileId = localCurrentId;
      }
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
  return allPassions().find(p => p.id === id) || { emoji: "✨", label: "Passion", color: "#8b5cf6" };
}

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

function rankOf(score) {
  let r = RANKS[0];
  for (const rank of RANKS) if (score >= rank.min) r = rank;
  return r;
}

// Célèbre un passage de rang : à appeler APRÈS une modification du score, en lui
// passant le score AVANT le gain. Ne toaste que si le rang a réellement grimpé.
function checkRankUp(prevScore) {
  if (!state || !state.user) return;
  const newRank = rankOf(state.user.score || 0);
  const oldRank = rankOf(prevScore || 0);
  if (newRank.label === oldRank.label) return;
  const order = RANKS.map(r => r.label);
  if (order.indexOf(newRank.label) <= order.indexOf(oldRank.label)) return; // pas une montée
  try { toast("🎉 Nouveau rang débloqué : " + newRank.label + " !", "reward"); } catch (e) {}
  try { if (typeof pushNotification === "function") pushNotification("🎉 Nouveau rang : <b>" + escapeHtml(newRank.label) + "</b>", "🏆"); } catch (e) {}
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

function rewardToast(amount, passia, reason) {
  const stack = $("#toastStack");
  const t = document.createElement("div");
  t.className = "toast reward";
  t.innerHTML = `⭐ +${amount}${passia ? ` · 💎 +${passia}` : ""} · ${escapeHtml(reason)}`;
  stack.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ======== REWARDS ========
// Le Wallet n'est re-rendu par une récompense QUE s'il est à l'écran : renderWallet
// reconstruit guide + transactions + leaderboard + quêtes (~lourd), et goTo('wallet')
// le re-rend de toute façon à la navigation → le faire sur un écran caché = pur lag
// (ressenti sur CHAQUE commentaire/réponse/GIF via grantReward).
function _walletScreenActive() {
  var el = document.getElementById("screen-wallet");
  return !!(el && el.classList.contains("active"));
}

function grantReward(kind, customLabel) {
  const r = REWARDS[kind];
  if (!r) return;
  const _prevScore = state.user.score || 0;
  state.user.score += r.pts;
  state.user.passia += r.passia;
  state.transactions.unshift({
    id: uid(),
    kind,
    pts: r.pts,
    passia: r.passia,
    label: customLabel || r.label,
    at: Date.now(),
  });
  saveState();
  renderTopbar();
  if (_walletScreenActive()) renderWallet();
  rewardToast(r.pts, r.passia, customLabel || r.label);
  checkRankUp(_prevScore);
}

// 💎 VALEUR REÇUE — appelé quand QUELQU'UN D'AUTRE like un de MES posts (via le
// canal realtime:likes). C'est la seule source « organique » de Passia : rare,
// non-farmable (il faut que les autres aiment ton contenu). Chaque like reçu
// donne 2 ⭐ ; tous les LIKES_PER_PASSIA likes reçus → +1 💎.
function awardLikeReceived() {
  if (!state || !state.user) return;
  const _prevScore = state.user.score || 0;
  state.user.score = (state.user.score || 0) + (REWARDS.like_received.pts || 2);
  state.user.likesReceived = (state.user.likesReceived || 0) + 1;
  let passia = 0;
  if (state.user.likesReceived % LIKES_PER_PASSIA === 0) {
    passia = 1;
    state.user.passia = (state.user.passia || 0) + 1;
  }
  state.transactions.unshift({
    id: uid(),
    kind: "like_received",
    pts: REWARDS.like_received.pts || 2,
    passia,
    label: passia ? "Palier de likes reçus 💎" : "Like reçu",
    at: Date.now(),
  });
  saveState();
  try { renderTopbar(); } catch (e) {}
  try { if (_walletScreenActive()) renderWallet(); } catch (e) {}
  if (passia) rewardToast(REWARDS.like_received.pts || 2, passia, "Ton contenu plaît !");
  checkRankUp(_prevScore);
}

// ======== NAVIGATION ========
// Historique de navigation pour le bouton back du téléphone
let navigationHistory = ["feed"];
let isNavigatingBack = false;

// Ajouter un overlay/modal à l'historique de navigation
function pushOverlayToHistory(overlayType, overlayId = "") {
  const state = { overlay: overlayType, id: overlayId };
  const hash = overlayId ? `#${overlayType}-${overlayId}` : `#${overlayType}`;
  window.history.pushState(state, "", hash);
}

function goTo(screen) {
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
    // Utiliser l'History API pour le bouton back
    window.history.pushState({ screen }, "", "#" + screen);
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
  $$(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById("screen-" + screen);
  if (el) el.classList.add("active");
  $("#appMain").scrollTop = 0;
  document.body.classList.toggle("screen-feed-active", screen === "feed");

  // Re-render dynamic screens on navigate
  if (screen === "feed")     renderFeed();
  if (screen === "profiles") renderProfilesScreen();
  if (screen === "studio")   renderStudio();
  if (screen === "explore")  { renderExplorer(); setTimeout(renderAiHistory, 50); }
  if (screen === "irl")      renderIRL();
  if (screen === "wallet")   renderWallet();
  if (screen === "messages") renderMessages();
  if (screen === "cdv")      { renderCdvScreen(); if (typeof supaRefreshCdvLives === "function") supaRefreshCdvLives(); }

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

  // Vérifier d'autres overlays spécifiques
  const detailModal = document.getElementById("eventDetail") || document.getElementById("postDetail") || document.getElementById("profileDetail");
  if (detailModal && detailModal.style.display !== "none") {
    detailModal.style.display = "none";
    return true;
  }

  const commentsPanel = document.getElementById("commentsPanel");
  if (commentsPanel && commentsPanel.style.display !== "none") {
    commentsPanel.style.display = "none";
    return true;
  }

  return false;
}

// Gérer le bouton back du téléphone
window.addEventListener("popstate", (e) => {
  // D'abord, essayer de fermer un overlay ouvert
  if (closeCurrentOverlay()) {
    return;
  }

  // Sinon, naviguer vers l'écran précédent
  if (e.state && e.state.screen) {
    isNavigatingBack = true;
    goTo(e.state.screen);
    isNavigatingBack = false;
  }
});

function toggleDevPanel() {
  $("#devPanel").classList.toggle("active");
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
      <select id="privMessages" style="display:block;width:100%;margin-top:6px;padding:10px;border-radius:10px;border:1.5px solid var(--border);font-size:13px;">\
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
      <select id="contentLang" style="display:block;width:100%;margin-top:6px;padding:10px;border-radius:10px;border:1.5px solid var(--border);font-size:13px;">\
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
      <button class="btn primary" onclick="closeModal();doLogout();" style="flex:1;background:#ef4444;">Se déconnecter</button>\
    </div>\
  ');
}

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

async function doLogout() {
  // Flush immédiat : pousse les changements en attente (debounce 2500ms non encore
  // déclenché) vers Supabase AVANT la déconnexion. Sans ça, toute modification faite
  // dans les 2,5 s précédant le logout est perdue à la reconnexion.
  try { if (typeof supaSaveUserState === "function") await supaSaveUserState(); } catch(e) {}
  try { await supa.auth.signOut(); } catch(e) {}
  discardPendingStateSave();
  // ⚠️ Isolation inter-comptes : purge complète des caches liés au compte, y compris
  // les conversations en IndexedDB (sinon fuite de messages privés vers le compte suivant).
  try { await purgeAccountScopedData(); } catch(e) {}
  toast("👋 Déconnecté — à bientôt !");
  setTimeout(() => location.reload(), 1200);
}

/* Changement de mot de passe SANS email : pour un utilisateur déjà connecté,
   via la session active (supa.auth.updateUser). Indispensable tant que l'envoi
   d'e-mails (lien « mot de passe oublié ») n'est pas opérationnel. */
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
      <li>ton profil et tes profils passion ;</li>\
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
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">1. Données collectées.</strong> Lors de l\'inscription : adresse e-mail et nom d\'utilisateur. Lors de l\'utilisation : profils passion, publications (textes, photos, vidéos, audio), carnets, messages, commentaires, likes, abonnements, participation aux événements, et préférences locales (thème, filtres).</p>\
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
}

// -------- AUTH STEP --------
let _authMode = "signin";

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
      '<input type="password" id="pwdRecoveryInput" placeholder="••••••••" minlength="6" autocomplete="new-password" class="input" style="width:100%;box-sizing:border-box;font-size:15px;margin-bottom:8px;"/>' +
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
      if (msg.includes("Email not confirmed")) msg = "Confirme ton e-mail avant de te connecter.";
      _showAuthMsg(msg, "error");
      if (btn) { btn.disabled = false; btn.textContent = _authMode === "signin" ? "Se connecter" : "Créer mon compte"; }
      return;
    }
    if (_authMode === "signup") {
      // Avec « Confirm email » activé, Supabase NE renvoie PAS d'erreur si l'e-mail
      // existe déjà (anti-énumération) : il renvoie un user aux `identities` vides.
      // On le détecte pour garantir « un seul compte par e-mail ».
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        _showAuthMsg("Cet e-mail est déjà utilisé. Connecte-toi.", "error");
        switchAuthTab("signin");
        if (btn) { btn.disabled = false; btn.textContent = "Se connecter"; }
        return;
      }
      // Pas de session → e-mail à confirmer. On NE rentre PAS dans l'app sans
      // adresse confirmée (exigence : « il faut une adresse mail valide »).
      if (!data?.session) {
        _showAuthMsg("✅ Compte créé ! Vérifie tes e-mails pour confirmer, puis reviens te connecter.", "success");
        switchAuthTab("signin");
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
  const createTile = `
    <div class="passion-tile passion-tile-create" onclick="openCreateCustomPassion()">
      <div class="passion-tile-emoji">＋</div>
      <div class="passion-tile-label">Créer la mienne</div>
    </div>
  `;
  grid.innerHTML = tiles + (filtre ? "" : createTile);

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
      '<div style="font-size:12px;font-weight:700;margin-bottom:5px;">Ton profil de départ</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + puces + '</div>'
    + '<div style="font-size:11px;color:var(--muted);margin-top:6px;line-height:1.45;">'
    +   'Tu pourras créer d\'autres profils passion ensuite. Les autres passions choisies '
    +   'alimentent ton Fil sans créer de profil.'
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

function openCreateCustomPassion() {
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
    <div class="modal-title">🌟 Proposer une nouvelle passion</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:14px;line-height:1.5;">Les catégories sont validées par l'équipe PASSIO pour garantir la qualité et éviter les doublons. Ta demande sera examinée sous 48h.</div>

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
  toast("📩 Demande envoyée ! Tu seras notifié quand elle sera examinée.", "success");

  // Simuler une approbation après 5 secondes pour la démo
  setTimeout(function() {
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
      toast("🎉 Ta passion « " + name + " » a été approuvée ! " + draft.emoji, "reward");
    }
  }, 5000);
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

  // GAMIFICATION — retirée du parcours V2 (ADR-009 : Wallet/Passia hors du cœur).
  // Conservée telle quelle sur le chemin de repli pour ne rien changer à l'ancien.
  if (!v2) {
    state.user.score += REWARDS.first_login.pts;
    state.user.passia += REWARDS.first_login.passia;
    state.transactions.unshift({
      id: uid(), kind: "first_login",
      pts: REWARDS.first_login.pts, passia: REWARDS.first_login.passia,
      label: "Bienvenue sur PASSIO", at: Date.now(),
    });

    state.user.score += REWARDS.daily.pts;
    state.user.passia += REWARDS.daily.passia;
    state.transactions.unshift({
      id: uid(), kind: "daily",
      pts: REWARDS.daily.pts, passia: REWARDS.daily.passia,
      label: "Connexion du jour", at: Date.now(),
    });
  }

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
    try { if (typeof supaUpsertProfile === "function") supaUpsertProfile(); } catch(e) {}
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
//     localStorage.passio_feed_intents_v1 = "1"  → actif
//     localStorage.passio_feed_intents_v1 = "0"  → kill switch immédiat
//     window.PASSIO_FEED_INTENTS_V1 = false       → coupure en mémoire
// ══════════════════════════════════════════════════════════════════════════
var FEED_INTENTS_VERSION = "v1";
var activeFeedIntent = "for_you";

function feedIntentsEnabled() {
  if (typeof window.PASSIO_FEED_INTENTS_V1 === "boolean") return window.PASSIO_FEED_INTENTS_V1;
  try {
    var v = localStorage.getItem("passio_feed_intents_v1");
    if (v === "1") return true;
    if (v === "0") return false;
  } catch (e) {}
  return false; // défaut sûr : ancien sélecteur et ancien filtrage inchangés
}

function normalizeFeedIntent(intent) {
  return ["for_you", "discover", "learn", "create", "meet"].indexOf(intent) > -1
    ? intent : "for_you";
}

// Fonction pure, volontairement conservatrice : les valeurs historiques sans
// équivalent sûr restent génériques et ne reçoivent aucun bonus d'intention.
function legacyMoodToFeedIntent(mood) {
  if (mood === "creation") return "create";
  if (mood === "learn") return "learn";
  if (mood === "irl") return "meet";
  return "generic"; // actu, chill, all, absent ou valeur inconnue
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
  if (!enabled) activeFeedIntent = "for_you";
  activeFeedIntent = normalizeFeedIntent(activeFeedIntent);
  if (!selector) return;
  selector.querySelectorAll(".feed-intent-btn").forEach(function(btn) {
    var active = btn.getAttribute("data-intent") === activeFeedIntent;
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

function setFeedIntent(intent) {
  if (!feedIntentsEnabled()) return;
  var requested = normalizeFeedIntent(intent);
  var reset = requested === "for_you" || requested === activeFeedIntent;
  activeFeedIntent = reset ? "for_you" : requested;
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

// Afficher le carrousel de CDV Lives en haut du feed
function renderFeedCdvLives() {
  const container = document.getElementById("feedList");
  if (!container) return;

  // Récupérer les lives actifs pertinents pour l'utilisateur
  const allLives = getCdvLives().filter(l => l.status === "live");
  const myFollowing = state.following || [];
  const relevantLives = allLives.filter(l =>
    l.authorId === "me" ||
    myFollowing.includes(l.authorId) ||
    l.visibility === "public"
  );

  if (!relevantLives.length) return;

  // Créer un élément de live dans le feed
  const livesHTML = relevantLives.slice(0, 3).map(l => {
    const seedAuthor = userById(l.authorId);
    const authorName = l.authorId === "me" ? (state.user.name || "Toi") : (seedAuthor && seedAuthor.name) || "Passionné";
    const viewerCount = (l.currentViewers || 0) + Math.floor(Math.random()*10);

    return `<div class="cdv-feed-live-item" style="
      background:linear-gradient(135deg,rgba(239,68,68,0.1),rgba(245,158,11,0.1));
      border:1px solid rgba(239,68,68,0.25);
      border-radius:12px;
      padding:12px;
      margin-bottom:12px;
      cursor:pointer;
      transition:all 0.2s;
    " onclick="openCdvLiveViewer('${escapeJsArg(l.id)}')" onmouseover="this.style.background='linear-gradient(135deg,rgba(239,68,68,0.15),rgba(245,158,11,0.15))'" onmouseout="this.style.background='linear-gradient(135deg,rgba(239,68,68,0.1),rgba(245,158,11,0.1))'">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;">
        <span style="background:#ef4444;color:#fff;font-size:9px;font-weight:700;padding:3px 7px;border-radius:6px;animation:livePulse 1.5s ease infinite;">🔴 EN DIRECT</span>
        <span style="font-weight:700;font-size:13px;color:var(--text);">📡 ${escapeHtml(l.destination)}</span>
        <span style="font-size:11px;color:var(--muted);margin-left:auto;">👁 ${viewerCount}</span>
      </div>
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;">par ${escapeHtml(authorName)}</div>
      ${l.steps.length ? `<div style="font-size:10px;color:var(--muted);">${l.steps.length} étape${l.steps.length>1?"s":""} · ${l.duration || ""}</div>` : ""}
    </div>`;
  }).join("");

  // Insérer le carrousel en haut du feed
  const section = document.createElement("div");
  section.id = "feedCdvLivesSection";
  section.innerHTML = livesHTML;

  // Insérer avant le premier post
  const firstPost = container.querySelector(".post");
  if (firstPost) {
    container.insertBefore(section, firstPost);
  } else if (container.children.length > 0) {
    container.insertBefore(section, container.children[0]);
  } else {
    container.appendChild(section);
  }
}

// ======== PULL-TO-REFRESH ========
// Détecte un swipe vers le bas depuis le haut du feed et recharge les posts Supabase.
(function _setupPullToRefresh() {
  var _touchStartY = 0;
  var _pullActive = false;
  var _pulling = false;

  document.addEventListener("touchstart", function(e) {
    var feedEl = document.getElementById("screen-feed");
    if (!feedEl || !feedEl.classList.contains("active")) return;
    var list = document.getElementById("feedList");
    if (!list) return;
    // Déclenche seulement si on est en haut du scroll
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
function feedPostScore(p, nowBucket, myPassions, followingSet) {
  // Fraîcheur : âge en heures via buckets 5 min (12/h), décroissance exp τ=48 h.
  var postB = Math.floor((p.createdAt || 0) / 300000);
  var ageHours = Math.max(0, nowBucket - postB) / 12;
  var recency = Math.exp(-ageHours / 48); // 1.0 (frais) → 0.37 (48 h) → 0.14 (96 h)

  // Affinité : 0 à 2 (passion pratiquée, auteur suivi).
  var affinity = 0;
  if (p.passion && myPassions.has(p.passion)) affinity += 1;
  if (p.authorId && followingSet.has(p.authorId)) affinity += 1;

  // Engagement : commentaires > réactions ; log-compressé, plafonné (un vieux
  // post viral ne doit pas écraser la fraîcheur).
  var likes = p.likes || 0;
  var comments = (p.comments || []).length;
  var reactions = Array.isArray(p.reactions) ? p.reactions.length : 0;
  var engagement = Math.min(3, Math.log(1 + likes + 2 * comments + reactions));

  return recency * 1.0 + affinity * 0.35 + engagement * 0.12;
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
  // Les posts ici sont déjà des copies (allFeedPosts fait {...p}) → mutation sûre.
  for (var i = 0; i < arr.length; i++) {
    arr[i]._feedScore = feedPostScore(arr[i], nowBucket, myPassions, followingSet);
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
function rankFeedPostsForIntent(posts, intent) {
  var ranked = rankFeedPosts(posts);
  intent = normalizeFeedIntent(intent);
  if (!feedIntentsEnabled() || intent === "for_you") return ranked;
  try {
    if (localStorage.getItem("passio_feed_rank") === "0") return ranked;
  } catch (e) {}

  var myPassions = _myPassionSet();
  var following = (state.user && state.user.following) || state.following || [];
  var followingSet = new Set(following);

  // Découvrir n'est permis que si au moins un signal de nouveauté fiable existe.
  // À défaut, le classement « Pour toi » est rendu exactement dans le même
  // ordre, sans heuristique inventée à partir du texte libre.
  if (intent === "discover") {
    var reliable = ranked.some(function(p) {
      return !!((p.authorId && followingSet.size) || (p.passion && myPassions.size));
    });
    if (!reliable) return ranked;
  }

  return ranked.map(function(p, index) {
    var bonus = 0;
    if (intent === "discover") {
      if (p.authorId && followingSet.size && !followingSet.has(p.authorId)) bonus += 0.28;
      if (p.passion && myPassions.size && !myPassions.has(p.passion)) bonus += 0.28;
    } else if (legacyMoodToFeedIntent(p.mood) === intent) {
      // « Rencontrer » ne remonte que des posts dont le parcours IRL existant est
      // réellement actionnable ; il n'active ni proposition ni géolocalisation.
      var sharedEventActionable = intent === "meet"
        && p.sharedReelData && p.sharedReelData.kind === "event"
        && p.sharedReelData.id && typeof openEventDetails === "function";
      if (intent !== "meet" || sharedEventActionable
          || (typeof feedIrlBridgeEligible === "function" && feedIrlBridgeEligible(p))) {
        bonus = 0.55;
      }
    }
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
  try {
    $$("#moodSelector .mood-btn").forEach(function(b) {
      var m = b.getAttribute("data-mood");
      if (m) moodsAffichables[m] = 1;
    });
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
  second_profil: "Tu peux créer un profil pour une autre Passio",
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

function renderFeed() {
  // 🎯 Masquer le skeleton loader
  const skeleton = $("#feedSkeleton");
  if (skeleton) skeleton.style.display = "none";

  const list = $("#feedList");
  const mood = state.currentMood || "all";
  setupFeedIntentDelegation();
  syncFeedIntentUi();
  const intentsEnabled = feedIntentsEnabled();

  // Tous les posts (hors vlogs)
  let allPosts = allFeedPosts().filter(function(p) { return p.type !== "vlog"; });

  let posts = [];
  let availablePostsForMood = []; // Pour afficher les moods disponibles

  // ── COMBINAISON : "Suivis" OU "Passions" (multi-sélection) ──
  let combinedPosts = [];

  // ✅ RÈGLE : si aucune passion ET aucun suivis sélectionné → feed vide
  // L'utilisateur doit choisir une passion pour voir du contenu
  const nothingSelected = !_showFollowingFeed && _activeFeedPassions.size === 0;

  if (!nothingSelected) {
    // Ajouter les posts des suivis si sélectionné
    if (_showFollowingFeed) {
      const followingIds = state.user?.following || [];
      let followingPosts = allPosts.filter(function(p) { return followingIds.includes(p.authorId); });
      combinedPosts = combinedPosts.concat(followingPosts);
    }

    // Ajouter les posts des passions sélectionnées
    if (_activeFeedPassions.size > 0) {
      let postsByPassion = allPosts.filter(function(p) { return _activeFeedPassions.has(p.passion); });
      combinedPosts = combinedPosts.concat(postsByPassion);
    }
  }

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

      if (nothingSelected) {
        if (emptyTitle) emptyTitle.textContent = "Choisis une passion";
        if (emptyText) emptyText.textContent = "Sélectionne une passion ci-dessus pour voir le contenu de ta communauté.";
      } else if (!intentsEnabled && selectedMoods.size === 0) {
        if (emptyTitle) emptyTitle.textContent = "Choisis un mood";
        if (emptyText) emptyText.textContent = "Sélectionne un mood pour filtrer le contenu.";
      } else if (_showFollowingFeed && _activeFeedPassions.size > 0) {
        if (emptyTitle) emptyTitle.textContent = "Aucun post pour cette combinaison";
        if (emptyText) emptyText.textContent = intentsEnabled
          ? "Essaie une autre sélection de passions ou de suivis."
          : "Essaie un autre mood ou autre sélection.";
      } else if (_showFollowingFeed) {
        if (emptyTitle) emptyTitle.textContent = "Aucun post de tes suivis";
        if (emptyText) emptyText.textContent = "Tu ne suis personne, ou ils n'ont rien publié.";
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
      emptyEl.style.display = "block";
    }
    return;
  }
  var emptyEl2 = $("#feedEmpty");
  if (emptyEl2) emptyEl2.style.display = "none";

  // ✅ CLASSEMENT PAR PERTINENCE (fraîcheur + affinité passion/suivis + engagement).
  // Repli chronologique strict via localStorage.passio_feed_rank="0". Voir rankFeedPosts.
  const sortedPosts = intentsEnabled
    ? rankFeedPostsForIntent(posts, activeFeedIntent)
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
    _showFollowingFeed ? 1 : 0, renderLimit, hasMore ? 1 : 0,
    Math.floor(Date.now() / 300000),
    // Le pont Fil → IRL change le HTML des cartes sans toucher aux posts : sans
    // lui dans la signature, basculer le drapeau ne repeindrait pas le fil.
    (typeof feedIrlBridgeEnabled === "function" && feedIrlBridgeEnabled()) ? "irl1" : "irl0",
    visible.map(function(p) {
      return p.id + ":" + (p.likes || 0) + ":" + ((p.comments || []).length) + ":" + (Array.isArray(p.reactions) ? p.reactions.length : 0);
    }).join("|"),
  ].join("§");
  if (_domSig === window._feedDomSig && list.children.length > 0) return;
  window._feedDomSig = _domSig;

  // ── Peinture en 2 temps : on affiche d'abord FAST cartes (paint initial ~2×
  // plus rapide à la navigation), puis on complète jusqu'à renderLimit juste
  // après, en idle, SANS reconstruire les premières cartes (insertAdjacentHTML).
  // Le nombre total affiché est inchangé — seul l'instant du paint diffère.
  const FAST = Math.min(12, visible.length);
  list.innerHTML = visible.slice(0, FAST).map(_renderPostHTMLSafe).join("")
    + (visible.length <= FAST && hasMore ? moreBtnHtml : "");

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
      list.insertAdjacentHTML("beforeend",
        visible.slice(FAST).map(_renderPostHTMLSafe).join("") + (hasMore ? moreBtnHtml : ""));
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
    name: authorName || _cuAuthor.name || "Profil",  // Fallback minimal au lieu de "Utilisateur"
    profileEmoji: p.authorEmoji || _cuAuthor.profileEmoji || "✨",
    avatar: p.authorColor || _cuAuthor.avatar || "#8b5cf6",
    photoUrl: _cuAuthor.photoUrl || p.authorAvatar || null,  // 📷 photo de profil (live > snapshot)
  };
  const passion = passionById(p.passion);
  const moodMap = { creation: "🎨 Création", learn: "📚 Apprendre", chill: "😌 Chill", irl: "🤝 IRL" };
  const liked = (state.user.likedPosts || []).includes(p.id);
  const likeClass = liked ? "liked" : "";

  let media = "";
  // Carnet de voyage → aperçu compact full-width avec destination + dates en overlay
  if (p.type === "vlog") {
    const fmtRange = (a, b) => {
      const o = { day: "numeric", month: "short" };
      if (a && b) return new Date(a).toLocaleDateString("fr-FR", o) + " → " + new Date(b).toLocaleDateString("fr-FR", o);
      if (a) return new Date(a).toLocaleDateString("fr-FR", o);
      return "";
    };
    const dates = fmtRange(p.dateStart, p.dateEnd);
    const nbDays = (p.steps || []).length;
    const coverSrc = p.cover || "";
    media = `<div class="post-vlog-card" onclick="openVlogViewer('${escapeJsArg(p.id)}')">
      ${coverSrc ? `<img loading="lazy" decoding="async" class="post-vlog-cover" src="${safeUrlAttr(coverSrc)}" alt="${escapeHtml(p.destination || '')}" onerror="this.onerror=null;this.src='https://picsum.photos/seed/vlog-feed-${encodeURIComponent(p.id)}/1280/720';"/>` : `<div class="post-vlog-cover"></div>`}
      <div class="post-vlog-overlay"></div>
      <div class="post-vlog-meta">
        <span class="post-vlog-tag">📔 CARNET DE VOYAGE</span>
        <div class="post-vlog-dest">${escapeHtml(p.destination || "Voyage")}</div>
        ${dates ? `<div class="post-vlog-dates">${escapeHtml(dates)}</div>` : ""}
        <div class="post-vlog-stats">
          <span>📍 ${nbDays} jour${nbDays > 1 ? "s" : ""}</span>
          ${p.budget ? `<span>💰 ${escapeHtml(p.budget)}</span>` : ""}
          ${p.transport ? `<span>🚆 ${escapeHtml(p.transport)}</span>` : ""}
        </div>
      </div>
    </div>`;
  }
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

  return `<article class="post" data-postid="${escapeHtml(p.id)}">
    <div class="post-header">
      <div class="avatar" style="background:${avatarBg(author)};cursor:pointer;" onclick="openUserProfile('${escapeJsArg(p.authorId)}','${escapeJsArg(p._source)}')">${avatarInner(author)}</div>
      <div class="post-author" style="cursor:pointer;" onclick="openUserProfile('${escapeJsArg(p.authorId)}','${escapeJsArg(p._source)}')">
        <div class="post-author-name">${escapeHtml(author.name || "Moi")}</div>
        <div class="post-author-meta">
          ${passion.emoji} ${passion.label} · ${fmtTime(p.createdAt)}
          ${p._source === "me" && p.syncStatus ? `
            ${p.syncStatus === "syncing" ? '<span style="margin-left:8px;font-size:10px;color:var(--muted);">⏳ Sync...</span>' : ""}
            ${p.syncStatus === "synced" ? '<span style="margin-left:8px;font-size:10px;color:#22c55e;">📡 En ligne</span>' : ""}
            ${p.syncStatus === "offline" ? '<span style="margin-left:8px;font-size:10px;color:#f59e0b;">📴 Local</span>' : ""}
          ` : ""}
        </div>
      </div>
      ${p._source === "me" ? `<button class="post-menu-btn" onclick="event.stopPropagation();openPostOptions('${escapeJsArg(p.id)}')" aria-label="Options du post" title="Options">
        <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
      </button>` : ""}
      <span class="post-mood-tag">${moodMap[p.mood] || ""}</span>
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
  const author = (post._source === "me" || (typeof MY_UID !== "undefined" && post.authorId === MY_UID))
    ? { name: currentProfile()?.name || state.user.name, profileEmoji: currentProfile()?.emoji || "✨", avatar: currentProfile()?.color || "#8b5cf6", photoUrl: (state.user.general || {}).avatarPhoto || null }
    : (function(){ const cu = userById(post.authorId) || {}; return post.authorName ? { name: post.authorName, profileEmoji: post.authorEmoji || "✨", avatar: post.authorColor || "#8b5cf6", photoUrl: cu.photoUrl || post.authorAvatar || null } : cu; })();
  const passion = passionById(post.passion);
  const liked = state.user.likedPosts.includes(id);
  const moodMap = { creation: "🎨 Création", learn: "📚 Apprendre", chill: "😌 Chill", irl: "🤝 IRL" };

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
          <div class="post-author-meta">${passion.emoji} ${passion.label} · ${fmtTime(post.createdAt)}</div>
        </div>
        ${(state.userPosts || []).some(function(up){ return up.id === id; }) ? `<button class="post-menu-btn" onclick="event.stopPropagation();openPostOptions('${escapeJsArg(id)}')" aria-label="Options du post" title="Options">
          <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
        </button>` : ""}
        <span class="post-mood-tag">${moodMap[post.mood] || ""}</span>
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
