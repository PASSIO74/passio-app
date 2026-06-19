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
    if (!Array.isArray(parsed.selectedFeedPassions)) parsed.selectedFeedPassions = [];
    // ✅ SÉCURITÉ: Initialiser supabasePosts s'il n'existe pas
    if (!Array.isArray(parsed.supabasePosts)) parsed.supabasePosts = [];
    return parsed;
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  try {
    // Don't persist seed nor heavy media to save quota
    const lean = { ...state };
    lean.seed = null; // rebuilt at load
    // ⚠️ Ne JAMAIS persister de base64 média dans localStorage (quota ~5 Mo) :
    // c'était la vraie cause des limites de taille (500 Ko) et des « Save failed ».
    // Les médias vivent dans Supabase Storage ; on ne garde localement que les URLs.
    // Le base64 reste en mémoire (affichage optimistic) jusqu'à ce que l'URL
    // Storage le remplace après upload (cf. supaPublishPostWithRetry).
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
    localStorage.setItem(STATE_KEY, JSON.stringify(lean));
  } catch (e) {
    console.warn("Save failed:", e);
  }
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

function fmtTime(ts) {
  if (!ts) return "Invalid Date";

  let d;
  if (typeof ts === "string") {
    // Chaîne ISO UTC: "2026-06-08T15:50:12.753"
    d = new Date(ts + "Z");
  } else {
    // Timestamp en ms (depuis Date.now())
    d = new Date(ts);
  }

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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
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
    return { id, name: (p?.name || state.user.name || "Moi"), avatar: (p?.color || "#8b5cf6"), profileEmoji: (p?.emoji || "✨") };
  }
  return state.seed.users.find(u => u.id === id);
}

function currentProfile() {
  return state.user.profiles.find(p => p.id === state.user.currentProfileId) || state.user.profiles[0];
}

function rankOf(score) {
  let r = RANKS[0];
  for (const rank of RANKS) if (score >= rank.min) r = rank;
  return r;
}

// ======== TOAST ========
function toast(msg, type = "info") {
  const stack = $("#toastStack");
  const t = document.createElement("div");
  t.className = "toast " + (type || "");
  t.textContent = msg;
  stack.appendChild(t);
  setTimeout(() => t.remove(), 3000);
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
function grantReward(kind, customLabel) {
  const r = REWARDS[kind];
  if (!r) return;
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
  renderWallet();
  rewardToast(r.pts, r.passia, customLabel || r.label);
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
  });
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
  if (screen === "cdv")      renderCdvScreen();
}

// Fonction générique pour fermer les overlays
function closeCurrentOverlay() {
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
          <input type="number" id="limitH" value="' + lH + '" min="0" max="23" style="width:56px;padding:10px 4px;text-align:center;font-size:22px;font-weight:900;border:2px solid var(--border);border-radius:12px;background:var(--bg-card);color:var(--text);"/>\
          <div style="font-size:10px;color:var(--muted);margin-top:4px;">heures</div>\
        </div>\
        <span style="font-size:24px;font-weight:900;color:var(--muted);">:</span>\
        <div style="text-align:center;">\
          <input type="number" id="limitM" value="' + lM + '" min="0" max="59" style="width:56px;padding:10px 4px;text-align:center;font-size:22px;font-weight:900;border:2px solid var(--border);border-radius:12px;background:var(--bg-card);color:var(--text);"/>\
          <div style="font-size:10px;color:var(--muted);margin-top:4px;">minutes</div>\
        </div>\
        <span style="font-size:24px;font-weight:900;color:var(--muted);">:</span>\
        <div style="text-align:center;">\
          <input type="number" id="limitS" value="' + lS + '" min="0" max="59" style="width:56px;padding:10px 4px;text-align:center;font-size:22px;font-weight:900;border:2px solid var(--border);border-radius:12px;background:var(--bg-card);color:var(--text);"/>\
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

async function doLogout() {
  try { await supa.auth.signOut(); } catch(e) {}
  localStorage.removeItem("passio_uid");
  localStorage.removeItem("passio_state");
  toast("👋 Déconnecté — à bientôt !");
  setTimeout(() => location.reload(), 1200);
}

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
      ["profiles",        "id"],
    ];
    for (var i = 0; i < jobs.length; i++) {
      try { await supa.from(jobs[i][0]).delete().eq(jobs[i][1], MY_UID); } catch (e) {}
    }
    try { await supa.from("follows").delete().eq("follower_id", MY_UID); } catch (e) {}
    try { await supa.from("follows").delete().eq("following_id", MY_UID); } catch (e) {}
    try { await supa.from("blocks").delete().eq("blocker_id", MY_UID); } catch (e) {}
    try { await supa.from("blocks").delete().eq("blocked_id", MY_UID); } catch (e) {}
    // Suppression du compte auth (e-mail) côté serveur — best-effort : tant que
    // l'Edge Function n'est pas déployée (docs/EDGE_FUNCTION_DELETE_ACCOUNT.md),
    // l'échec est silencieux et la purge manuelle sous 30 jours s'applique.
    try { await supa.functions.invoke("delete-account"); } catch (e) {}
    try { await supa.auth.signOut(); } catch (e) {}
  }
  // Purge locale complète
  try {
    Object.keys(localStorage)
      .filter(function (k) { return k.indexOf("passio") !== -1 || k === "sb-njkiyoklssvefstljemx-auth-token"; })
      .forEach(function (k) { localStorage.removeItem(k); });
  } catch (e) {}
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

async function onbDoAuth() {
  const email = (document.getElementById("authEmail")?.value || "").trim();
  const pwd = document.getElementById("authPassword")?.value || "";
  const pwd2 = document.getElementById("authPasswordConfirm")?.value || "";
  const btn = document.getElementById("authSubmitBtn");

  if (!email || !email.includes("@")) { _showAuthMsg("Adresse e-mail invalide.", "error"); return; }
  if (pwd.length < 6) { _showAuthMsg("Le mot de passe doit contenir au moins 6 caractères.", "error"); return; }
  if (_authMode === "signup" && pwd !== pwd2) { _showAuthMsg("Les mots de passe ne correspondent pas.", "error"); return; }

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="auth-loading"></span>' + (_authMode === "signin" ? "Connexion…" : "Création…"); }

  try {
    let result;
    if (_authMode === "signin") {
      result = await supa.auth.signInWithPassword({ email, password: pwd });
    } else {
      result = await supa.auth.signUp({ email, password: pwd });
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
    if (_authMode === "signup" && data?.user && !data?.session) {
      _showAuthMsg("✅ Compte créé ! Vérifie tes e-mails pour confirmer, puis reviens te connecter.", "success");
      switchAuthTab("signin");
      if (btn) { btn.disabled = false; btn.textContent = "Se connecter"; }
      return;
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

function renderPassionGrid() {
  const grid = $("#passionGrid");
  const all = allPassions();
  const tiles = all.map(p => `
    <div class="passion-tile ${selectedPassions.includes(p.id) ? "selected" : ""} ${p.custom ? "passion-custom" : ""}"
         data-passion="${p.id}"
         onclick="togglePassion('${p.id}')">
      <div class="passion-tile-emoji">${p.emoji}</div>
      <div class="passion-tile-label">${escapeHtml(p.label)}</div>
      ${p.custom ? '<div class="passion-custom-badge">custom</div>' : ''}
    </div>
  `).join("");
  const createTile = `
    <div class="passion-tile passion-tile-create" onclick="openCreateCustomPassion()">
      <div class="passion-tile-emoji">＋</div>
      <div class="passion-tile-label">Créer la mienne</div>
    </div>
  `;
  grid.innerHTML = tiles + createTile;
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
          <button type="button" class="emoji-chip ${i === 0 ? 'selected' : ''}" data-emoji="${opt.emoji}" data-color="${opt.color}" onclick="selectCustomEmoji('${opt.emoji}','${opt.color}')">${opt.emoji}</button>
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
    if (selectedPassions.length >= 3) { toast("Max 3 passions pour commencer"); return; }
    selectedPassions.push(id);
  }
  renderPassionGrid();
}

function onbFinish() {
  if (selectedPassions.length === 0) {
    toast("Choisis au moins 1 passion.");
    return;
  }
  state.user.profiles = selectedPassions.map((pid, idx) => {
    const p = passionById(pid);
    return {
      id: uid(),
      name: state.user.name,
      passion: pid,
      emoji: p.emoji,
      bio: `Profil ${p.label} · Débutant·e passionné·e`,
      color: p.color,
      createdAt: Date.now(),
    };
  });
  state.user.currentProfileId = state.user.profiles[0].id;
  _activeFeedPassions = new Set(); // pas de filtre par défaut après onboarding
  state.onboarded = true;

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

  saveState();
  document.getElementById("onboarding").classList.remove("active");
  document.getElementById("landing").classList.remove("active");
  try { renderEverything(); } catch(e) { console.warn("renderEverything error:", e); }
  document.body.classList.add("screen-feed-active");
  try { if (typeof supaInit === "function") supaInit(); } catch(e) {}
  // Lancer le tour — avec fallback
  launchTourSafe();
}

// Recherche un post par id dans TOUTES les sources : seed (démo), posts perso
// (userPosts) ET posts réseau Supabase (vrais utilisateurs). De nombreux
// handlers ne regardaient que seed + userPosts → impossible d'ouvrir/commenter/
// réagir sur un vrai post d'un autre compte, et les notifs de like ne partaient
// pas. Centralisé le 2026-06-17. Voir [[project_passio]].
function findPostAnywhere(id) {
  return (state.seed.posts || []).find(p => p.id === id)
      || (state.userPosts || []).find(p => p.id === id)
      || (state.supabasePosts || []).find(p => p.id === id)
      || null;
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

  // Dédupliquer par ID + masquer les auteurs bloqués (modération)
  const blocked = state.user.blocked || [];
  const seenIds = new Set();
  const deduplicated = allPosts.filter(p => {
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    if (blocked.length && blocked.includes(p.authorId)) return false;
    return true;
  });

  // Trier par date décroissante
  return deduplicated.sort((a, b) => b.createdAt - a.createdAt);
}

// Profils sélectionnés pour filtrer le fil (multi-sélection)

// ======== MOOD MULTI-SELECT ========
var selectedMoods = new Set(["creation"]); // Par défaut "Création"

console.log("✅ selectedMoods initialisé:", Array.from(selectedMoods));

// ✅ EVENT DELEGATION pour les moods - Plus robuste et fluide!
function setupMoodDelegation() {
  var moodSelector = document.getElementById("moodSelector");
  if (!moodSelector) return;

  // Enlever les anciens listeners (si présent)
  if (moodSelector._delegationAttached) return;

  console.log("🔧 setupMoodDelegation");

  moodSelector.addEventListener("click", function(e) {
    var btn = e.target.closest(".mood-btn");
    if (!btn) return;

    e.stopPropagation();
    e.preventDefault();

    var mood = btn.getAttribute("data-mood");
    if (!mood) return;

    console.log("🔴 CLIC MOOD:", mood);
    toggleMood(mood);
  });

  moodSelector._delegationAttached = true;
}

function toggleMood(mood) {
  console.log("🔴 toggleMood:", mood, "| avant:", Array.from(selectedMoods));

  // Toggle
  if (selectedMoods.has(mood)) {
    selectedMoods.delete(mood);
  } else {
    selectedMoods.add(mood);
  }

  console.log("  après:", Array.from(selectedMoods));

  // Mettre à jour l'UI immédiatement
  updateMoodButtonsUI();

  // Re-render le feed UNE SEULE FOIS
  renderFeed();

  // RE-METTRE À JOUR L'UI après renderFeed (le DOM peut avoir changé)
  setTimeout(function() {
    console.log("🔄 Mise à jour UI après renderFeed");
    updateMoodButtonsUI();
  }, 50);
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

// Fonction pour attacher les event listeners aux boutons de mood
function setupMoodButtons() {
  console.log("🔧 setupMoodButtons() called");
  var buttons = document.querySelectorAll("#moodSelector .mood-btn");
  console.log("  Boutons trouvés:", buttons.length);

  buttons.forEach(function(btn) {
    var moodValue = btn.getAttribute("data-mood");
    console.log("  Attachement du listener pour:", moodValue);

    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      e.preventDefault();
      console.log("  📌 CLIC sur bouton:", moodValue);
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
    " onclick="openCdvLiveViewer('${l.id}')" onmouseover="this.style.background='linear-gradient(135deg,rgba(239,68,68,0.15),rgba(245,158,11,0.15))'" onmouseout="this.style.background='linear-gradient(135deg,rgba(239,68,68,0.1),rgba(245,158,11,0.1))'">
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

function renderFeed() {
  // 🎯 Masquer le skeleton loader au démarrage
  const skeleton = $("#feedSkeleton");
  if (skeleton) skeleton.style.display = "none";

  const list = $("#feedList");
  const mood = state.currentMood || "all";

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

  // Appliquer le filtre mood :
  // - selectedMoods vide → rien
  // - mood "all" sur un post → visible quel que soit le mood sélectionné (post universel)
  // - sinon → correspondance exacte
  posts = selectedMoods.size === 0
    ? []
    : availablePostsForMood.filter(function(p) {
        return p.mood === "all" || !p.mood || selectedMoods.has(p.mood);
      });

  renderProfileStrip();

  // Afficher les filtres de mood pour les deux modes
  renderMoodStripSmart(availablePostsForMood);

  renderStories();

  if (posts.length === 0) {
    list.innerHTML = "";
    var emptyEl = $("#feedEmpty");
    if (emptyEl) {
      var emptyTitle = emptyEl.querySelector(".empty-title");
      var emptyText = emptyEl.querySelector(".empty-text");

      if (nothingSelected) {
        if (emptyTitle) emptyTitle.textContent = "Choisis une passion";
        if (emptyText) emptyText.textContent = "Sélectionne une passion ci-dessus pour voir le contenu de ta communauté.";
      } else if (selectedMoods.size === 0) {
        if (emptyTitle) emptyTitle.textContent = "Choisis un mood";
        if (emptyText) emptyText.textContent = "Sélectionne un mood pour filtrer le contenu.";
      } else if (_showFollowingFeed && _activeFeedPassions.size > 0) {
        if (emptyTitle) emptyTitle.textContent = "Aucun post pour cette combinaison";
        if (emptyText) emptyText.textContent = "Essaie un autre mood ou autre sélection.";
      } else if (_showFollowingFeed) {
        if (emptyTitle) emptyTitle.textContent = "Aucun post de tes suivis";
        if (emptyText) emptyText.textContent = "Tu ne suis personne, ou ils n'ont rien publié.";
      } else if (_activeFeedPassions.size > 0) {
        if (emptyTitle) emptyTitle.textContent = "Aucun post pour cette sélection";
        if (emptyText) emptyText.textContent = "Essaie un autre mood ou sois le premier à publier ici.";
      } else {
        if (emptyTitle) emptyTitle.textContent = "Aucun contenu";
        if (emptyText) emptyText.textContent = "Sélectionne une passion et un mood.";
      }
      emptyEl.style.display = "block";
    }
    return;
  }
  var emptyEl2 = $("#feedEmpty");
  if (emptyEl2) emptyEl2.style.display = "none";

  // ✅ TRIER LES POSTS: les plus récents en premier!
  const sortedPosts = posts.sort((a, b) => {
    const dateA = a.createdAt || 0;
    const dateB = b.createdAt || 0;
    return dateB - dateA;  // Descendant = récents d'abord
  });

  // Diagnostic: afficher les 3 premiers posts et leurs créatedAt
  if (sortedPosts.length > 0) {
    console.log("🎯 TOP 3 POSTS TRIÉS (AVANT RENDU):");
    for (let i = 0; i < Math.min(3, sortedPosts.length); i++) {
      const p = sortedPosts[i];
      console.log(`${i+1}. ${p.authorName || "?"} - createdAt: ${p.createdAt} - ${new Date(p.createdAt).toLocaleString('fr-FR')}`);
    }
    // DIAGNOSTIC: vérifier les timestamps exacts
    console.log("DEBUG: First post createdAt =", sortedPosts[0].createdAt, "Type:", typeof sortedPosts[0].createdAt);
    console.log("DEBUG: Second post createdAt =", sortedPosts[1]?.createdAt, "Type:", typeof sortedPosts[1]?.createdAt);
  }

  const renderLimit = window._feedRenderLimit || 20;
  list.innerHTML = sortedPosts.slice(0, renderLimit).map(renderPostHTML).join("");
  // ── Pagination : bouton "Charger plus" si d'autres posts existent (local ou serveur)
  if (sortedPosts.length > renderLimit || window._feedServerMayHaveMore) {
    list.innerHTML += `<div style="text-align:center;padding:14px 0 24px;"><button class="btn ghost" id="feedLoadMoreBtn" onclick="loadMoreFeedPosts()">⤵ Charger plus de posts</button></div>`;
  }
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
    const onerr = `this.onerror=function(){this.onerror=function(){this.style.display='none';};this.src='${fallback2}';};this.src='${fallback1}';`;
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

  const author = {
    name: authorName || "Profil",  // Fallback minimal au lieu de "Utilisateur"
    profileEmoji: p.authorEmoji || "✨",
    avatar: p.authorColor || "#8b5cf6"
  };
  const passion = passionById(p.passion);
  const moodMap = { creation: "🎨 Création", learn: "📚 Apprendre", chill: "😌 Chill", irl: "🤝 IRL" };
  const liked = state.user.likedPosts.includes(p.id);
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
    media = `<div class="post-vlog-card" onclick="openVlogViewer('${p.id}')">
      ${coverSrc ? `<img loading="lazy" decoding="async" class="post-vlog-cover" src="${coverSrc}" alt="${escapeHtml(p.destination || '')}" onerror="this.onerror=null;this.src='https://picsum.photos/seed/vlog-feed-${p.id}/1280/720';"/>` : `<div class="post-vlog-cover"></div>`}
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
  const shouldCover = p.type === "photo" || (p.cover && p.type !== "vlog");
  if (shouldCover) {
    // ✅ VALIDATION PHOTO - Vérifier que l'URL est valide
    if (p.image && p.image.trim()) {
      // ✅ Ajouter fallback si l'image échoue à charger
      media = `<div class="post-media">
        <img
          src="${passioThumb(p.image, 700)}"
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
          src="${p.audio}"
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
          src="${p.video}"
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
    const cLiked = (c.likedBy || []).includes(state.user?.id || "me");
    const cLikes = c.likes || 0;
    const cReplies = c.replies || [];

    return `<div class="comment" data-commentid="${c.id}">
      <div class="avatar sm" style="background:${cu.avatar};cursor:pointer;" onclick="event.stopPropagation();openUserProfile('${c.authorId}','${cSrc}')">${cu.profileEmoji || (cu.name||"?")[0]}</div>
      <div class="comment-body">
        <div class="comment-author" style="cursor:pointer;" onclick="event.stopPropagation();openUserProfile('${c.authorId}','${cSrc}')">${escapeHtml(cu.name)}</div>
        <div class="comment-text">${escapeHtml(c.text)}</div>
        <div class="comment-meta">${fmtTime(c.createdAt)}</div>
        <div class="comment-actions">
          <span class="comment-action ${cLiked ? "liked" : ""}" onclick="return likeComment('${p.id}','${c.id}', event);">
            ${cLiked ? "❤️" : "🤍"} ${cLikes}
          </span>
          <span class="comment-action" onclick="return replyToComment('${p.id}','${c.id}','${escapeHtml(cu.name)}', event);" title="Répondre">💬</span>
          <span class="comment-action" onclick="return showEmojiPickerForComment('${p.id}','${c.id}', event);" title="Réagir">😊</span>
          <span class="comment-action" onclick="return showGifPickerForComment('${p.id}','${c.id}', event);" title="GIF">🎬</span>
          ${cReplies.length > 0 ? `<span class="comment-reply-count" onclick="return toggleCommentReplies('${c.id}', event);">${cReplies.length} réponse${cReplies.length > 1 ? "s" : ""}</span>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");

  // Tronquer le texte long avec un "Lire la suite"
  const fullText = p.text || "";
  const truncated = fullText.length > 220;
  const displayText = truncated ? fullText.slice(0, 220) + "…" : fullText;

  return `<article class="post" data-postid="${p.id}">
    <div class="post-header">
      <div class="avatar" style="background:${author.avatar};cursor:pointer;" onclick="openUserProfile('${p.authorId}','${p._source}')">${author.profileEmoji || (author.name || "?")[0]}</div>
      <div class="post-author" style="cursor:pointer;" onclick="openUserProfile('${p.authorId}','${p._source}')">
        <div class="post-author-name">${escapeHtml(author.name || "Moi")}
          ${p._source === "me" ? '<span class="pill" style="padding:2px 7px;font-size:9px;border-color:rgba(139, 92, 246,0.5);color:#fed7aa;">Moi</span>' : ""}
        </div>
        <div class="post-author-meta">
          ${passion.emoji} ${passion.label} · ${fmtTime(p.createdAt)}
          ${p._source === "me" && p.syncStatus ? `
            ${p.syncStatus === "syncing" ? '<span style="margin-left:8px;font-size:10px;color:var(--muted);">⏳ Sync...</span>' : ""}
            ${p.syncStatus === "synced" ? '<span style="margin-left:8px;font-size:10px;color:#22c55e;">📡 En ligne</span>' : ""}
            ${p.syncStatus === "offline" ? '<span style="margin-left:8px;font-size:10px;color:#f59e0b;">📴 Local</span>' : ""}
          ` : ""}
        </div>
      </div>
      ${p._source === "me" ? `<button class="post-delete-btn" onclick="confirmDeletePost('${p.id}')" aria-label="Supprimer ce post" title="Supprimer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7 H20"/><path d="M9 7 V4 H15 V7"/><path d="M6 7 L7 20 H17 L18 7"/><path d="M10 11 V17"/><path d="M14 11 V17"/></svg>
      </button>` : ""}
      <span class="post-mood-tag">${moodMap[p.mood] || ""}</span>
    </div>

    <div class="post-body" onclick="openPost('${p.id}')" style="cursor:pointer;">
      ${escapeHtml(displayText)}
      ${truncated ? `<span style="color:var(--accent);font-weight:700;"> Lire la suite</span>` : ""}
    </div>
    <div onclick="openPost('${p.id}')" style="cursor:pointer;">${media}</div>

    <div class="post-actions">
      <span class="post-action ${likeClass}" onclick="likePost('${p.id}')">
        ${liked ? "❤️" : "🤍"} ${p.likes || 0}
      </span>
      <span class="post-action" onclick="openComments('${p.id}')">💬 ${(p.comments || []).length}</span>
      <span class="post-action" onclick="return showEmojiPickerForPost('${p.id}', event);" title="Réagir">😊</span>
      <span class="post-action" onclick="return showGifPickerForPost('${p.id}', event);" title="GIF">🎬</span>
      <span class="post-action" onclick="sharePost('${p.id}')">🔁 Partager</span>
      <span class="post-action" style="margin-left:auto;" onclick="openPassionExplorer('${p.passion}')">🔎 ${passion.label}</span>
    </div>

    ${commentsPreview ? `<div style="margin-top:8px;" onclick="openPost('${p.id}')" style="cursor:pointer;">${commentsPreview}</div>` : ""}
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

  // Charger les commentaires Supabase si besoin
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    try {
      const supaComments = await supaLoadComments(id);
      if (supaComments && supaComments.length > 0) {
        const supaIds = new Set(supaComments.map(c => c.id));
        const localOnly = (post.comments || []).filter(c => !supaIds.has(c.id) && !c.fromSupabase);
        post.comments = [...supaComments.map(c => ({ ...c, text: c.content || c.text || "" })), ...localOnly]
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      }
    } catch(e) {}
  }

  const author = (post._source === "me" || (typeof MY_UID !== "undefined" && post.authorId === MY_UID))
    ? { name: currentProfile()?.name || state.user.name, profileEmoji: currentProfile()?.emoji || "✨", avatar: currentProfile()?.color || "#8b5cf6" }
    : (post.authorName ? { name: post.authorName, profileEmoji: post.authorEmoji || "✨", avatar: post.authorColor || "#8b5cf6" } : userById(post.authorId));
  const passion = passionById(post.passion);
  const liked = state.user.likedPosts.includes(id);
  const moodMap = { creation: "🎨 Création", learn: "📚 Apprendre", chill: "😌 Chill", irl: "🤝 IRL" };

  // Media (réutilise la logique de renderPostHTML)
  let media = "";
  if (post.type === "photo" || (post.cover && post.type !== "vlog" && post.type !== "audio")) {
    media = post.image
      ? `<div class="post-media"><img loading="lazy" decoding="async" src="${passioThumb(post.image, 700)}" alt="post" style="width:100%;border-radius:14px;"/></div>`
      : renderPostCover(post, passion);
  }
  if (post.type === "audio") {
    media = post.audio
      ? `<div class="post-audio">🎙 <audio controls src="${post.audio}" style="flex:1;"></audio></div>`
      : `<div class="post-audio" style="padding:14px;background:var(--bg-card);border-radius:13px;border:1px solid var(--border);gap:10px;">🎙 <div style="flex:1;font-size:13px;color:var(--text-dim);">Podcast de ${escapeHtml(author.name || "un créateur")} · Mode démo</div></div>`;
  }
  if (post.type === "video" && post.video) {
    media = `<div class="post-media"><video src="${post.video}" controls playsinline preload="metadata" style="width:100%;border-radius:14px;background:#000;"></video></div>`;
  }

  // Tous les commentaires (Supabase + locaux)
  const allComments = (post.comments || []).map(c => {
    let cName, cEmoji, cAvatar, cAuthorId = c.authorId || "?";
    if (c.authorName) {
      cName = c.authorName; cEmoji = c.authorEmoji || "✨"; cAvatar = "#8b5cf6";
    } else {
      const cu = userById(cAuthorId) || { name: "?", profileEmoji: "👤", avatar: "#64748b" };
      cName = cu.name; cEmoji = cu.profileEmoji; cAvatar = cu.avatar;
    }
    const cSrc = (cAuthorId === "me" || (typeof MY_UID !== "undefined" && cAuthorId === MY_UID)) ? "me" : "seed";
    const cLiked = (c.likedBy || []).includes(state.user?.id || "me");
    const cLikes = c.likes || 0;
    const cReplies = c.replies || [];
    return `<div class="comment" data-commentid="${c.id}">
      <div class="avatar sm" style="background:${cAvatar};cursor:pointer;" onclick="event.stopPropagation();openUserProfile('${cAuthorId}','${cSrc}')">${cEmoji || (cName||"?")[0]}</div>
      <div class="comment-body">
        <div class="comment-author" style="cursor:pointer;" onclick="event.stopPropagation();openUserProfile('${cAuthorId}','${cSrc}')">${escapeHtml(cName)}</div>
        <div class="comment-text">${escapeHtml(c.text || c.content || "")}</div>
        <div class="comment-meta">${fmtTime(c.createdAt)}</div>
        <div class="comment-actions">
          <span class="comment-action ${cLiked ? "liked" : ""}" onclick="return likeComment('${id}','${c.id}', event);">
            ${cLiked ? "❤️" : "🤍"} ${cLikes}
          </span>
          <span class="comment-action" onclick="return replyToComment('${id}','${c.id}','${escapeHtml(cName)}', event);" title="Répondre">💬</span>
          <span class="comment-action" onclick="return showEmojiPickerForComment('${id}','${c.id}', event);" title="Réagir">😊</span>
          <span class="comment-action" onclick="return showGifPickerForComment('${id}','${c.id}', event);" title="GIF">🎬</span>
          ${cReplies.length > 0 ? `<span class="comment-reply-count" onclick="return toggleCommentReplies('${c.id}', event);">${cReplies.length} réponse${cReplies.length > 1 ? "s" : ""}</span>` : ""}
          ${(c.emojis || []).length > 0 ? `<span class="comment-emoji-count" onclick="return toggleCommentEmojis('${c.id}', event);">${(c.emojis || []).length} emoji</span>` : ""}
        </div>
        ${(c.emojis || []).length > 0 ? `<div class="comment-emojis" id="emojis-${c.id}" style="display:none;padding:8px 0;border-top:1px solid rgba(124,58,237,0.1);margin-top:8px;"><div style="display:flex;gap:6px;flex-wrap:wrap;">${(c.emojis || []).map(e => `<span style="font-size:20px;padding:4px 8px;background:var(--bg-soft);border-radius:6px;cursor:default;">${e}</span>`).join("")}</div></div>` : ""}
        ${cReplies.length > 0 ? `<div class="comment-replies" id="replies-${c.id}" style="display:none;">${cReplies.map(r => {
          const ru = userById(r.authorId) || { name: "?", profileEmoji: "👤", avatar: "#64748b" };
          const rSrc = r.authorId === "me" ? "me" : "seed";

          // Si c'est une réaction emoji, afficher différemment
          if (r.type === "emoji_reaction") {
            return `<div class="comment-reply" style="padding:8px 0;">
              <span style="font-size:11px;color:var(--text);font-weight:600;cursor:pointer;" onclick="event.stopPropagation();openUserProfile('${r.authorId}','${rSrc}')">${escapeHtml(ru.name)}</span><span style="font-size:11px;color:var(--text);font-weight:600;">:</span> <span style="font-size:18px;letter-spacing:2px;">${r.text}</span>
            </div>`;
          }

          // Si c'est une réaction GIF
          if (r.type === "gif_reaction") {
            return `<div class="comment-reply" style="padding:8px 0;">
              <span style="font-size:11px;color:var(--text);font-weight:600;cursor:pointer;" onclick="event.stopPropagation();openUserProfile('${r.authorId}','${rSrc}')">${escapeHtml(ru.name)}</span><span style="font-size:11px;color:var(--text);font-weight:600;">:</span>
              <img loading="lazy" decoding="async" src="${r.text}" style="width:120px;height:120px;border-radius:8px;margin-top:6px;object-fit:cover;" alt="GIF" />
            </div>`;
          }

          // Réponse normale
          return `<div class="comment-reply">
            <span class="comment-reply-author" style="cursor:pointer;" onclick="event.stopPropagation();openUserProfile('${r.authorId}','${rSrc}')">${escapeHtml(ru.name)}</span>: ${escapeHtml(r.text)}
            <div style="font-size:10px;color:var(--muted);margin-top:2px;">${fmtTime(r.createdAt)}</div>
          </div>`;
        }).join("")}</div>` : ""}
      </div>
    </div>`;
  }).join("");

  content.innerHTML = `
    <div class="post" data-postid="${id}" style="cursor:default;">
      <div class="post-header">
        <div class="avatar" style="background:${author.avatar};cursor:pointer;" onclick="openUserProfile('${post.authorId}','${post._source || "seed"}')">${author.profileEmoji || (author.name||"?")[0]}</div>
        <div class="post-author" style="cursor:pointer;" onclick="openUserProfile('${post.authorId}','${post._source || "seed"}')">
          <div class="post-author-name">${escapeHtml(author.name || "Utilisateur")}</div>
          <div class="post-author-meta">${passion.emoji} ${passion.label} · ${fmtTime(post.createdAt)}</div>
        </div>
        ${(state.userPosts || []).some(function(up){ return up.id === id; }) ? `<button class="post-delete-btn" onclick="event.stopPropagation();confirmDeletePost('${id}')" aria-label="Supprimer ce post" title="Supprimer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7 H20"/><path d="M9 7 V4 H15 V7"/><path d="M6 7 L7 20 H17 L18 7"/><path d="M10 11 V17"/><path d="M14 11 V17"/></svg>
        </button>` : ""}
        <span class="post-mood-tag">${moodMap[post.mood] || ""}</span>
      </div>
      <div class="post-body" style="white-space:pre-wrap;">${escapeHtml(post.text || "")}</div>
      ${media}
      <div class="post-actions">
        <span class="post-action ${liked ? "liked" : ""}" onclick="event.stopPropagation(); (function() {
          let p = state.seed.posts.find(x => x.id === '${id}') || state.userPosts.find(x => x.id === '${id}');
          if (!p) return;
          const wasLiked = state.user.likedPosts.includes('${id}');
          if (wasLiked) {
            state.user.likedPosts = state.user.likedPosts.filter(x => x !== '${id}');
            p.likes = Math.max(0, (p.likes || 1) - 1);
          } else {
            state.user.likedPosts.push('${id}');
            p.likes = (p.likes || 0) + 1;
          }
          saveState();
          this.classList.toggle('liked');
          this.innerHTML = (wasLiked ? '🤍' : '❤️') + ' ' + p.likes;
          if (typeof supaToggleLike !== 'undefined') supaToggleLike('${id}');
        }).call(this);">
          ${liked ? "❤️" : "🤍"} ${post.likes || 0}
        </span>
        <span class="post-action" onclick="openComments('${id}')">💬 ${(post.comments||[]).length}</span>
        <span class="post-action" onclick="return showEmojiPickerForPost('${id}', event);" title="Réagir">😊</span>
        <span class="post-action" onclick="return showGifPickerForPost('${id}', event);" title="GIF">🎬</span>
        <span class="post-action" onclick="sharePost('${id}')">🔁 Partager</span>
      </div>
    </div>
    ${allComments ? `
      <div style="margin-top:8px;">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:10px;">Commentaires (${(post.comments||[]).length})</div>
        ${allComments}
      </div>
    ` : `<div style="font-size:13px;color:var(--muted);text-align:center;padding:20px 0;">Aucun commentaire — sois le premier 💬</div>`}
    <div style="height:20px;"></div>
  `;

  page.style.display = "flex";
  page.scrollTop = 0;
}

