// ======== TOPBAR ========
function renderTopbar() {
  const prof = currentProfile();
  $("#topScore").textContent = state.user.score || 0;
  $("#topPassia").textContent = state.user.passia || 0;
  // Ne pas afficher la passion, juste PASSIO
  if (prof) {
    $("#currentProfilePassion").textContent = "";
  }
  renderBell();
}

// ======== MODALS ========
function openModal(html) {
  // Ajouter à l'historique pour que le bouton back fonctionne
  window.history.pushState({ overlay: "modal" }, "", "#modal");

  // Injecte un bouton × de fermeture en haut à droite de tous les modals
  const closeBtn = `<button type="button" class="modal-close" onclick="closeModal()" aria-label="Fermer">×</button>`;
  $("#modalContent").innerHTML = closeBtn + html;
  $("#modalBackdrop").classList.add("active");

}
function closeModal() {
  // Arrêter le refresh automatique du CDV Live si actif
  if (cdvLiveRefreshInterval) {
    clearInterval(cdvLiveRefreshInterval);
    cdvLiveRefreshInterval = null;
  }

  // Retirer le spectateur du live si c'est applicable
  const currentLiveId = document.querySelector(".modal-fullscreen")?.getAttribute("data-live-id");
  if (currentLiveId) {
    removeCdvLiveViewer(currentLiveId);
  }

  $("#modalBackdrop").classList.remove("active");
}
function closeModalOnBackdrop(e) {
  if (e.target.id === "modalBackdrop") closeModal();
}
// Ferme le modal avec la touche Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#modalBackdrop").classList.contains("active")) {
    closeModal();
  }
});
// La poignée en haut du modal ferme aussi par tap
document.addEventListener("click", (e) => {
  if (e.target && e.target.classList && e.target.classList.contains("modal-handle")) {
    closeModal();
  }
});

// ======== TOUR (demo investisseurs) ========
const TOUR_STEPS = [
  {
    screen: "profiles",
    emoji: "👤",
    title: "Plusieurs profils, plusieurs passions",
    lede: "Un espace dédié pour chaque chose qui t'anime.",
    points: [
      "Skate, lecture, photo, cuisine, chaque passion son profil",
      "Tu changes d'univers en un tap",
      "Pas besoin de tout mélanger sur un seul compte"
    ]
  },
  {
    screen: "feed",
    emoji: "🏠",
    title: "Ton fil, à ton rythme",
    lede: "Le contenu s'adapte à ton humeur du moment.",
    points: [
      "Tu choisis : envie de créer, d'apprendre ou de te détendre ?",
      "Pas d'algorithme qui te garde captif",
      "Tu lis ce que tu veux, quand tu veux"
    ]
  },
  {
    screen: "irl",
    emoji: "🤝",
    title: "Retrouvez-vous en vrai",
    lede: "Le cœur de PASSIO : transformer une passion en moments réels avec d'autres.",
    points: [
      "Événements près de chez toi, organisés par la communauté",
      "Carte interactive France et Europe",
      "Skate jam, atelier, dégustation, book club…"
    ]
  },
  {
    screen: "studio",
    emoji: "🎙",
    title: "Crée tout ce que tu veux",
    lede: "Texte, photo, vidéo, podcast, carnet de voyage, tout au même endroit.",
    points: [
      "Pas besoin d'outils externes",
      "Templates pour démarrer facilement",
      "Tu publies quand ça t'inspire, pas quand un algo te dit"
    ]
  },
  {
    screen: "explore",
    emoji: "🔍",
    title: "Trouve ta communauté",
    lede: "Découvre les passions et les gens qui partagent les tiennes.",
    points: [
      "Toutes les passions, du skate à la céramique",
      "Tu peux créer la tienne si elle n'existe pas",
      "Des créateurs à découvrir, près de chez toi"
    ]
  },
  {
    screen: "cdv",
    emoji: "📔",
    title: "Raconte tes voyages",
    lede: "Documente tes périples comme une histoire, pour t'en souvenir et inspirer les autres.",
    points: [
      "Étapes, photos, vidéos, audio, conseils",
      "Carte interactive auto-générée",
      "Inspire-toi des carnets des autres pour préparer le tien"
    ]
  },
  {
    screen: "wallet",
    emoji: "💎",
    title: "Soutiens ce qui te plaît",
    lede: "Avec Passia, tu envoies de la valeur à ceux qui te l'apportent.",
    points: [
      "Gagne du Passia en participant à la communauté",
      "Soutiens un créateur, paye un cours, un événement",
      "Plus tard, le Passia deviendra une vraie monnaie qui grandit avec la communauté"
    ]
  },
];

let tourIdx = 0;

function startTour() {
  // Forcer le retrait de landing et onboarding
  const landing = document.getElementById("landing");
  if (landing) landing.classList.remove("active");
  const onb = document.getElementById("onboarding");
  if (onb) onb.classList.remove("active");
  
  $("#devPanel").classList.remove("active");
  tourIdx = 0;
  state.tourSeen = true;
  saveState();
  showTour();
}

function showTour() {
  const step = TOUR_STEPS[tourIdx];

  // Changement d'écran silencieux sans déclencher les re-renders
  $$(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById("screen-" + step.screen);
  if (el) el.classList.add("active");

  $("#tourOverlay").classList.add("active");
  $("#tourStepLabel").textContent = `Étape ${tourIdx + 1} / ${TOUR_STEPS.length}`;
  const emojiEl = $("#tourEmoji");
  if (emojiEl) emojiEl.textContent = step.emoji || "✨";
  $("#tourTitle").textContent = step.title;
  const ledeEl = $("#tourLede");
  if (ledeEl) ledeEl.textContent = step.lede || "";

  // Points ou mood cards
  const pointsEl = $("#tourPoints");
  if (pointsEl) {
    if (step.moodCards) {
      pointsEl.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px;list-style:none;padding:0;">
        ${step.moodCards.map(m => `
          <div style="background:linear-gradient(135deg,${m.color}18,${m.color}08);border:1.5px solid ${m.color}40;border-radius:16px;padding:14px 10px;text-align:center;">
            <div style="font-size:28px;margin-bottom:6px;">${m.emoji}</div>
            <div style="font-weight:800;font-size:13px;color:${m.color};margin-bottom:3px;">${m.label}</div>
            <div style="font-size:11px;color:var(--muted);">${m.desc}</div>
          </div>`).join("")}
      </div>`;
    } else {
      pointsEl.innerHTML = (step.points || []).map(pt => `<li>${pt}</li>`).join("");
    }
  }

  const oldText = document.getElementById("tourText");
  if (oldText) oldText.style.display = "none";
  $("#tourDots").innerHTML = TOUR_STEPS.map((_, i) => `<div class="tour-dot ${i === tourIdx ? "active" : ""}"></div>`).join("");
  $("#tourNextBtn").textContent = tourIdx === TOUR_STEPS.length - 1 ? "Terminer ✨" : "Suivant →";

  // Carte interactive pour l'étape IRL
  const mapWrap = $("#tourMapWrap");
  if (mapWrap) {
    if (step.screen === "irl") {
      mapWrap.style.display = "block";
      if (_tourMap) { _tourMap.remove(); _tourMap = null; }
      ensureLeaflet().then(() => setTimeout(() => {
        _tourMap = L.map("tourMap", { zoomControl: true, attributionControl: false, dragging: true, scrollWheelZoom: true, doubleClickZoom: true, touchZoom: true });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(_tourMap);
        _tourMap.setView([46.6, 2.5], 5);
        [
          { lat: 48.86, lng: 2.35, emoji: "🛹" },
          { lat: 45.75, lng: 4.83, emoji: "🎨" },
          { lat: 43.30, lng: 5.37, emoji: "🎸" },
          { lat: 44.84, lng: -0.58, emoji: "📸" },
          { lat: 47.22, lng: -1.55, emoji: "🤿" },
        ].forEach(e => {
          const icon = L.divIcon({ className: "", html: `<div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#8b5cf6,#6d28d9);display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #fff;box-shadow:0 4px 10px rgba(124,58,237,0.45)">${e.emoji}</div>`, iconSize: [28,28], iconAnchor: [14,14] });
          L.marker([e.lat, e.lng], { icon }).addTo(_tourMap);
        });
      }, 80)).catch(function(){});
    } else {
      mapWrap.style.display = "none";
      if (_tourMap) { _tourMap.remove(); _tourMap = null; }
    }
  }
}

let _tourMap = null;

function tourNext() {
  tourIdx++;
  if (tourIdx >= TOUR_STEPS.length) return endTour();
  showTour();
}

function endTour() {
  $("#tourOverlay").classList.remove("active");
  if (_tourMap) { _tourMap.remove(); _tourMap = null; }
  // Remettre les stories
  const storiesRow = $("#storiesRowFeed");
  if (storiesRow) storiesRow.style.display = "";
  if (typeof goTo === "function") goTo("feed");
}

// ======== SHARE / FEEDBACK ========
function shareBeta() {
  $("#devPanel").classList.remove("active");
  const link = window.location.href;
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">Partager la beta</div>
    <div class="modal-subtitle">Envoie ce lien à tes bêta-testeurs. Leurs données restent sur leur appareil.</div>
    <div class="share-box">${escapeHtml(link)}</div>
    <div style="display:flex;gap:8px;">
      <button class="btn primary block" onclick="navigator.clipboard && navigator.clipboard.writeText('${link}');toast('Lien copié');closeModal();">📋 Copier le lien</button>
    </div>
    <div class="section-title" style="margin-top:14px;">Message prêt-à-envoyer</div>
    <textarea class="textarea" readonly style="min-height:120px;">Salut ! Je te partage la beta de PASSIO, le réseau social basé sur les passions que je prépare. 5 min de test, je veux tes retours honnêtes. 👉 ${link}</textarea>
  `);
}

function feedbackModal() {
  $("#devPanel").classList.remove("active");
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">Ton feedback beta</div>
    <div class="modal-subtitle">Enregistré localement. Tu pourras l'exporter au créateur.</div>
    <label class="field"><span>Ce que tu as aimé</span><textarea class="textarea" id="fbLike"></textarea></label>
    <label class="field"><span>Ce qui ne va pas / bugs</span><textarea class="textarea" id="fbBad"></textarea></label>
    <label class="field"><span>Une feature à ajouter</span><textarea class="textarea" id="fbIdea"></textarea></label>
    <button class="btn primary block" onclick="saveFeedback()">Enregistrer</button>
  `);
}

function saveFeedback() {
  const fb = {
    at: Date.now(),
    like: $("#fbLike").value.trim(),
    bad: $("#fbBad").value.trim(),
    idea: $("#fbIdea").value.trim(),
  };
  state.feedbacks = state.feedbacks || [];
  state.feedbacks.unshift(fb);
  saveState();
  closeModal();
  toast("Merci pour ton retour !", "reward");
}

// ======== RESET ========
function resetApp() {
  if (!confirm("Tout réinitialiser ? (onboarding, profils, posts, wallet)")) return;
  localStorage.removeItem(STATE_KEY);
  location.reload();
}

// ======== LANDING ========
function showLanding() {
  $("#landing").classList.add("active");
  setTimeout(function() { try { applyConfig(); } catch(e) {} }, 150);
}

// Fonction robuste pour lancer le tour quoi qu'il arrive
function launchTourSafe() {
  function tryLaunch() {
    var overlay = document.getElementById("tourOverlay");
    if (!overlay) { setTimeout(tryLaunch, 500); return; }
    // Forcer retrait de tout ce qui bloque
    var l = document.getElementById("landing"); if (l) l.classList.remove("active");
    var o = document.getElementById("onboarding"); if (o) o.classList.remove("active");
    var d = document.getElementById("devPanel"); if (d) d.classList.remove("active");
    // Lancer le tour
    tourIdx = 0;
    overlay.classList.add("active");
    showTour();
  }
  setTimeout(tryLaunch, 800);
}

function exitLanding() {
  document.getElementById("landing").classList.remove("active");
  state.landingSeen = true;
  saveState();
  if (!state.onboarded) {
    document.getElementById("onboarding").classList.add("active");
    onbStepIdx = 0;
    showOnbStep(onbSteps[0]);
  } else {
    try { purgeConvDuplicates(); } catch(e) {} // nettoyer les doublons au boot
    try { renderEverything(); } catch(e) {}
    document.body.classList.add("screen-feed-active");
    try { if (typeof supaInit === "function") supaInit(); } catch(e) {}
    // ✅ LANCER LE TOUR SEULEMENT SI C'EST LA PREMIÈRE VISITE
    if (!state.tourSeen) {
      state.tourSeen = true;
      saveState();
      launchTourSafe();
    }
  }
}

// Accès direct : pré-remplit tout et lance l'app immédiatement (utile pour les démos répétées)
function skipToApp() {
  state.user.name = state.user.name || "Benjamin";
  state.user.birthYear = state.user.birthYear || 1995;
  state.landingSeen = true;
  state.onboarded = true;
  // Sélectionne 3 passions par défaut si pas déjà fait
  if (!state.user.profiles || state.user.profiles.length === 0) {
    const defaultPassions = ["voyage", "musique", "photo"];
    defaultPassions.forEach(pid => {
      const p = passionById(pid);
      if (!p) return;
      const np = {
        id: uid(),
        name: state.user.name,
        passion: pid,
        emoji: p.emoji,
        bio: `Profil ${p.label}`,
        color: p.color,
        createdAt: Date.now(),
      };
      state.user.profiles.push(np);
    });
    state.user.currentProfileId = state.user.profiles[0].id;
  }
  saveState();
  document.getElementById("landing").classList.remove("active");
  document.getElementById("onboarding").classList.remove("active");
  try { renderEverything(); } catch(e) {}
  document.body.classList.add("screen-feed-active");
  try { if (typeof supaInit === "function") supaInit(); } catch(e) {}
  // ✅ LANCER LE TOUR SEULEMENT SI C'EST LA PREMIÈRE VISITE
  if (!state.tourSeen) {
    state.tourSeen = true;
    saveState();
    launchTourSafe();
  }
}

// ======== STORIES ========
function renderStories() {
  // Chercher #storiesRowFeed (feed) OU #storiesRow (explorer)
  const row = $("#storiesRowFeed") || $("#storiesRow");
  _diag("📖 renderStories() called - row exists: " + (row ? "YES" : "NO"));
  if (!row) {
    _diag("❌ Neither storiesRowFeed nor storiesRow found!");
    return;
  }
  const stories = state.seed.stories || [];
  _diag("📖 Stories count: " + stories.length);
  const seen = state.user.seenStories || [];

  // Stories des autres (pas de "Ton story" car Studio existe déjà)
  let html = ``;

  html += stories.map((s, i) => {
    const u = userById(s.authorId) || { name: "?", avatar: "#8b5cf6", profileEmoji: "✨" };
    const isSeen = seen.includes(s.id);
    const photoUrl = s.photo
      ? `https://images.unsplash.com/${s.photo}?w=160&h=160&fit=crop&crop=entropy&auto=format&q=75`
      : null;
    const fallback = `https://picsum.photos/seed/${s.id}/160/160`;
    const inner = photoUrl
      ? `<img loading="lazy" decoding="async" src="${photoUrl}" alt="${escapeHtml(u.name)}" onerror="this.onerror=null;this.src='${fallback}'"/>`
      : (u.profileEmoji || "✨");
    return `
      <div class="story-item" onclick="openStoryViewer(${i})">
        <div class="story-ring ${isSeen ? "seen" : ""}">
          <div class="story-inner" style="background: ${u.avatar};">${inner}</div>
        </div>
        <div class="story-label">${escapeHtml(u.name.split(" ")[0])}</div>
      </div>
    `;
  }).join("");

  _diag("📖 HTML generated length: " + html.length);
  row.innerHTML = html;
  _diag("📖 HTML set to #storiesRow");
  const rowFeed = $("#storiesRowFeed");
  if (rowFeed) {
    rowFeed.innerHTML = html;
    _diag("📖 HTML also set to #storiesRowFeed");
  } else {
    _diag("ℹ️ #storiesRowFeed not found (only main feed)");
  }
}

function openStudioAsStory() {
  toast("Studio stories · bientôt en bêta", "info");
  goTo("studio");
}

let storyIdx = 0;
let storyTimer = null;
const STORY_DURATION = 4500;

function openStoryViewer(idx) {
  // Ajouter à l'historique pour que le bouton back fonctionne
  window.history.pushState({ overlay: "story" }, "", "#story");

  storyIdx = idx;
  $("#storyViewer").classList.add("active");
  playCurrentStory();

}

function playCurrentStory() {
  clearInterval(storyTimer);
  const stories = state.seed.stories;
  if (!stories[storyIdx]) return closeStoryViewer();
  const s = stories[storyIdx];
  // Priorité aux infos embarquées dans la story (Supabase), sinon fallback userById
  const uLocal = userById(s.authorId);
  const u = {
    name: s.authorName || uLocal?.name || "Passionné",
    avatar: s.authorColor || uLocal?.avatar || "#8b5cf6",
    profileEmoji: s.authorEmoji || uLocal?.profileEmoji || "✨",
  };

  $("#storyAvatar").style.background = u.avatar;
  $("#storyAvatar").textContent = (u.profileEmoji || u.name[0] || "?");
  $("#storyAvatar").style.cursor = "pointer";
  $("#storyAvatar").onclick = function(e) { e.stopPropagation(); closeStoryViewer(); openUserProfile(s.authorId); };
  $("#storyAuthor").textContent = u.name;
  $("#storyAuthor").style.cursor = "pointer";
  $("#storyAuthor").onclick = function(e) { e.stopPropagation(); closeStoryViewer(); openUserProfile(s.authorId); };
  $("#storyTime").textContent = fmtTime(s.createdAt);

  const card = $("#storyCard");
  card.style.background = s.bg || "var(--grad-hero)";

  $("#storyContent").innerHTML = `<div style="font-size:22px;font-weight:800;line-height:1.25;white-space:pre-line;color:#ffffff;">${escapeHtml(s.text)}</div>`;

  // Progress bars
  const row = $("#storyProgressRow");
  row.innerHTML = stories.map((_, i) => `
    <div class="story-progress ${i < storyIdx ? "done" : ""}">
      <div class="story-progress-bar" id="sp-${i}" style="width:${i < storyIdx ? "100%" : "0"};"></div>
    </div>
  `).join("");

  // Mark as seen
  if (!state.user.seenStories.includes(s.id)) {
    state.user.seenStories.push(s.id);
    saveState();
  }

  // Animate current bar
  const bar = document.getElementById("sp-" + storyIdx);
  if (bar) {
    let start = Date.now();
    storyTimer = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / STORY_DURATION) * 100);
      bar.style.width = p + "%";
      if (p >= 100) {
        clearInterval(storyTimer);
        storyNext();
      }
    }, 80);
  }
}

function storyNext() {
  clearInterval(storyTimer);
  const stories = state.seed.stories;
  if (storyIdx >= stories.length - 1) { closeStoryViewer(); return; }
  storyIdx++;
  playCurrentStory();
}

function storyPrev() {
  clearInterval(storyTimer);
  if (storyIdx <= 0) { closeStoryViewer(); return; }
  storyIdx--;
  playCurrentStory();
}

function closeStoryViewer() {
  clearInterval(storyTimer);
  $("#storyViewer").classList.remove("active");
  renderStories();

}

// ======== NOTIFICATIONS ========
function unreadCount() {
  return (state.notifications || []).filter(n => n.unread).length;
}

function renderBell() {
  const dot = $("#bellDot");
  if (!dot) return;
  const n = unreadCount();
  dot.textContent = n > 0 ? (n > 9 ? "9+" : String(n)) : "";
}

function openNotifications() {
  const notifs = state.notifications || [];
  const html = `
    <div class="modal-handle"></div>
    <div class="modal-title">🔔 Notifications</div>
    <div class="modal-subtitle">Ce qui s'est passé pendant que tu vivais ta vraie vie.</div>
    <div class="notif-list">
      ${notifs.length ? notifs.map(n => {
        const u = userById(n.fromId) || { name: "Passio", avatar: "#8b5cf6", profileEmoji: "✨" };
        return `
          <div class="notif-row ${n.unread ? "unread" : ""}" onclick="markNotifRead('${n.id}')">
            <div class="notif-icon">${n.emoji || "✨"}</div>
            <div class="notif-body">
              <div class="notif-text">${n.text}</div>
              <div class="notif-meta">${fmtTime(n.createdAt)}</div>
            </div>
            ${n.unread ? '<div class="notif-dot"></div>' : ""}
          </div>
        `;
      }).join("") : `
        <div class="empty">
          <div class="empty-icon">🔕</div>
          <div class="empty-title">Tout est calme</div>
          <div class="empty-text">Tu es à jour, profite.</div>
        </div>
      `}
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button class="btn ghost block" onclick="markAllNotifsRead()">Tout marquer lu</button>
      <button class="btn primary block" onclick="closeModal()">OK</button>
    </div>
  `;
  openModal(html);
}

function markNotifRead(id) {
  const n = state.notifications.find(x => x.id === id);
  if (n) {
    n.unread = false;
    saveState();
    renderBell();
    openNotifications();
    // Sync Supabase si c'est une notif Supabase
    if (n.fromSupabase && typeof supaMarkNotifSeen === "function") {
      supaMarkNotifSeen(id);
    }
  }
}

function markAllNotifsRead() {
  state.notifications.forEach(n => n.unread = false);
  saveState();
  renderBell();
  closeModal();
  toast("Notifications marquées comme lues", "info");
}

function pushNotification(text, emoji = "✨", fromId = "me") {
  state.notifications = state.notifications || [];
  state.notifications.unshift({
    id: uid(), kind: "local", fromId, text, createdAt: Date.now(), unread: true, emoji,
  });
  saveState();
  renderBell();
}

// ======== QUESTS ========
function renderQuests() {
  const box = $("#questsBox");
  if (!box) return;
  const quests = state.quests || [];
  if (!quests.length) { box.innerHTML = `<div class="empty"><div class="empty-text">Pas de défi aujourd'hui.</div></div>`; return; }

  // Regroupe par catégorie : daily, weekly, community
  const groups = {
    daily: { label: "🔥 Défis du jour", quests: [] },
    weekly: { label: "⭐ Défis de la semaine", quests: [] },
    community: { label: "🏆 Défis communautaires (gros gains)", quests: [] },
  };
  quests.forEach(q => {
    const cat = q.kind === "weekly" ? "weekly" : q.kind === "community" ? "community" : "daily";
    groups[cat].quests.push(q);
  });

  // Stats du haut : total gagnable + déjà gagné
  const totalPts = quests.filter(q => !q.done).reduce((s, q) => s + q.reward, 0);
  const totalPassia = quests.filter(q => !q.done).reduce((s, q) => s + q.passia, 0);
  const doneCount = quests.filter(q => q.done).length;

  let html = `<div class="quest-summary">
    <div class="quest-summary-line"><b>${doneCount} / ${quests.length}</b> défis complétés</div>
    <div class="quest-summary-line">À gagner : <b>+${totalPts} pts</b> · <b>+${totalPassia} 💎</b></div>
  </div>`;

  Object.entries(groups).forEach(([cat, group]) => {
    if (!group.quests.length) return;
    html += `<div class="quest-group-title">${group.label}</div>`;
    html += group.quests.map(q => {
      const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
      const ready = q.progress >= q.target && !q.done;
      return `
        <div class="quest-card ${q.done ? "done" : ""} ${ready ? "ready" : ""}">
          <div class="quest-emoji">${q.emoji}</div>
          <div class="quest-body">
            <div class="quest-title">${escapeHtml(q.title)}</div>
            <div class="quest-reward">+${q.reward} pts · +${q.passia} 💎</div>
            <div class="quest-progress"><div class="quest-progress-bar" style="width:${pct}%;"></div></div>
          </div>
          ${q.done
            ? `<div style="font-size:18px;">✅</div>`
            : `<button class="quest-claim" ${ready ? "" : "disabled"} onclick="claimQuest('${q.id}')">${ready ? "Réclamer" : q.progress + "/" + q.target}</button>`
          }
        </div>
      `;
    }).join("");
  });

  box.innerHTML = html;
}

function bumpQuest(type) {
  let changed = false;
  (state.quests || []).forEach(q => {
    if (q.type === type && !q.done && q.progress < q.target) {
      q.progress++;
      changed = true;
    }
  });
  if (changed) { saveState(); renderQuests(); }
}

function claimQuest(id) {
  const q = state.quests.find(x => x.id === id);
  if (!q || q.done || q.progress < q.target) return;
  q.done = true;
  state.user.score += q.reward;
  state.user.passia += q.passia;
  state.transactions.unshift({
    id: uid(), ts: Date.now(), type: "quest",
    title: "Quête : " + q.title,
    score: q.reward, passia: q.passia,
  });
  saveState();
  rewardToast(q.reward, q.passia, "Quête complétée");
  pushNotification("🎯 Quête complétée : <b>" + escapeHtml(q.title) + "</b>", "🎯");
  renderQuests();
  renderTopbar();
  renderWallet();
}

// ======== NAV CLICKS ========
$$(".nav-item").forEach(n => {
  n.addEventListener("click", () => {
    const s = n.getAttribute("data-screen");
    if (s === "bobines") { openReels(); return; }
    if (s) goTo(s);
  });
});

// ======== PITCH (re-open from dev panel) ========
function showPitchLanding() {
  $("#devPanel").classList.remove("active");
  showLanding();
}

// ======== INIT ========
function renderEverything() {
  renderTopbar();
  renderFeed();
  renderBell();
  // Re-render les écrans déjà ouverts si nécessaire
  try { if (typeof renderMessages === "function") renderMessages(); } catch(e) {}
  try { if (typeof renderIRL === "function") renderIRL(); } catch(e) {}
}

function initApp() {
  try { renderEverything(); } catch(e) {}
  document.body.classList.add("screen-feed-active");
  try { if (typeof supaInit === "function") supaInit(); } catch(e) {}
  // ✅ LANCER LE TOUR SEULEMENT SI C'EST LA PREMIÈRE VISITE
  if (!state.tourSeen) {
    state.tourSeen = true;
    saveState();
    launchTourSafe();
  }
}

// navigateTo — alias de goTo pour la compatibilité (utilisé dans les cartes IA)
function navigateTo(screen) {
  try { goTo(screen); } catch(e) { console.warn("navigateTo error:", e); }
}

async function boot() {
  $("#logoTopbar").src = LOGO_SRC;
  $("#logoOnb1").src = LOGO_SRC;
  const ll = document.getElementById("logoLanding");
  if (ll) ll.src = LOGO_SRC;
  const lp = document.getElementById("pwaLogoImg");
  if (lp) lp.src = LOGO_SRC;

  state = loadState();

  // Vérifie si l'utilisateur est déjà connecté via Supabase Auth
  try {
    const { data: { session } } = await supa.auth.getSession();
    if (session?.user) {
      MY_UID = session.user.id;
      localStorage.setItem("passio_uid", MY_UID);
      if (state.onboarded) {
        // Session active + déjà onboardé → accès direct à l'app
        // Crée un profil par défaut si l'utilisateur n'en a pas (connexion sans onboarding)
        if (!state.user.profiles || state.user.profiles.length === 0) {
          const defPassion = allPassions()[0];
          const defProfile = { id: uid(), name: state.user.name || "Passionné", passion: defPassion.id, emoji: defPassion.emoji, color: defPassion.color, bio: "", createdAt: Date.now() };
          state.user.profiles = [defProfile];
          state.user.currentProfileId = defProfile.id;
          saveState();
        }
        // Pas de filtre par défaut au démarrage — l'utilisateur choisit
        _activeFeedPassions = new Set();
        try { renderEverything(); } catch(e) {}
        document.body.classList.add("screen-feed-active");
        try { supaInit(); } catch(e) {}
        return;
      }
    }
  } catch(e) { /* pas de session */ }

  // Écouter les changements d'état auth (connexion depuis un autre appareil, confirmation email, etc.)
  try {
    supa.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        MY_UID = session.user.id;
        localStorage.setItem("passio_uid", MY_UID);
        // ✅ FIX CRITIQUE : déclencher supaInit() dès qu'une session est établie
        // Sans ça, les posts Supabase ne chargent jamais sur un nouvel appareil
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          // ⚠️ setTimeout OBLIGATOIRE (piège supabase-js documenté) : le client tient
          // un verrou auth pendant l'émission de l'événement ; toute requête Supabase
          // lancée DANS le callback attend ce verrou → deadlock, et la promesse de
          // signInAnonymously()/signUp() ne résout jamais (onboarding figé sur l'auth).
          setTimeout(() => { try { supaInit(); } catch(e) { console.warn("supaInit on auth change:", e); } }, 0);
        }
      }
    });
  } catch(e) {}

  showLanding();
}

// =====================================================
// SUPABASE — Toutes fonctionnalités temps réel
// =====================================================
const SUPABASE_URL = "https://njkiyoklssvefstljemx.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qa2l5b2tsc3N2ZWZzdGxqZW14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTc3MDQsImV4cCI6MjA5NDI3MzcwNH0.wbFAexVW75vlXZ7mRRxeZ28zKevOAYYe0lda0F22dTM";
let supa;
try {
  supa = (typeof supabase !== "undefined") ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
} catch(e) { console.warn("Supabase init failed:", e); supa = null; }
if (!supa) {
  const _noopQ = () => ({ select: () => _noopQ(), order: () => _noopQ(), limit: () => Promise.resolve({data:[],error:null}), eq: () => _noopQ(), neq: () => _noopQ(), ilike: () => _noopQ(), gte: () => _noopQ(), in: () => _noopQ(), maybeSingle: () => Promise.resolve({data:null,error:null}), single: () => Promise.resolve({data:null,error:null}), delete: () => _noopQ(), upsert: () => Promise.resolve({error:null}), insert: () => _noopQ() });
  supa = {
    from: () => _noopQ(),
    channel: () => ({ on: function(){ return this; }, subscribe: () => null }),
    removeChannel: () => {},
    auth: {
      getSession: () => Promise.resolve({data:{session:null},error:null}),
      signInWithPassword: () => Promise.resolve({data:null,error:{message:"Supabase non disponible"}}),
      signUp: () => Promise.resolve({data:null,error:{message:"Supabase non disponible"}}),
      signOut: () => Promise.resolve({error:null}),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  };
}

function getMyUserId() {
  let id = localStorage.getItem("passio_uid");
  if (!id) { id = "u_" + Math.random().toString(36).slice(2,10); localStorage.setItem("passio_uid", id); }
  return id;
}
let MY_UID = getMyUserId();

// ---- PROFIL ----
async function supaUpsertProfile() {
  try {
    console.log("🔄 [UPSERT] Début supaUpsertProfile()");
    diagLog(`🔄 [UPSERT] Début supaUpsertProfile()`);

    const prof = currentProfile();
    const g = state.user.general || {};

    console.log("📋 [UPSERT] prof=", prof);
    console.log("📋 [UPSERT] MY_UID=", MY_UID);

    if (!prof) {
      console.warn("❌ [UPSERT] Pas de profil courant!");
      diagLog(`❌ [UPSERT] Pas de profil courant`);
      return;
    }

    const profileData = {
      id: MY_UID,
      username: g.username || prof.name || state.user.name || "Profil",  // ✅ Toujours afficher le vrai nom du profil!
      emoji: prof.emoji || "✨",
      color: prof.color || "#8b5cf6",
      passion_id: prof.passion || null,
      bio: g.bio || "",
    };

    console.log("📤 [UPSERT] Envoi:", profileData);
    diagLog(`📤 [UPSERT] Envoi profil: ${JSON.stringify(profileData)}`);

    const result = await supa.from("profiles").upsert(profileData, { onConflict: "id" });

    console.log("✅ [UPSERT] Succès:", result);
    diagLog(`✅ [UPSERT] Profil mis à jour`);
  } catch(e) {
    console.error("❌ [UPSERT] Erreur:", e);
    console.error("❌ [UPSERT] Message:", e.message);
    diagLog(`❌ [UPSERT] ERREUR: ${e.message}`);
  }
}

// ---- DIAGNOSTIC ----
// Créer un panneau de diagnostic visible à l'écran
const _diagPanel = document.createElement("div");
_diagPanel.id = "sync_diagnosis_panel";
_diagPanel.style.cssText = `
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: #1a1a1a;
  color: #00ff00;
  padding: 15px;
  border-radius: 8px;
  font-size: 11px;
  font-family: monospace;
  max-width: 350px;
  max-height: 300px;
  overflow-y: auto;
  z-index: 99999;
  border: 2px solid #00ff00;
  white-space: pre-wrap;
  word-break: break-all;
  display: none;
`;
_diagPanel.textContent = "DIAGNOSTIC SYNC\n================\n";
document.body.appendChild(_diagPanel);

function showDiag() {
  _diagPanel.style.display = "block";
}

function hideDiag() {
  _diagPanel.style.display = "none";
}

function diagLog(msg) {
  const time = new Date().toLocaleTimeString();
  const line = `[${time}] ${msg}\n`;
  _diagPanel.textContent += line;
  _diagPanel.scrollTop = _diagPanel.scrollHeight;
  console.log("[DIAG]", msg);

  // 🔧 STOCKER LES LOGS pour le diagnostic avancé
  if (!window._diagLogs) window._diagLogs = [];
  window._diagLogs.push(`[${time}] ${msg}`);
  if (window._diagLogs.length > 100) window._diagLogs.shift();  // Garder seulement les 100 derniers
}

// Diagnostic DÉSACTIVÉ au démarrage pour éviter les lags (le garder fermé)
window.addEventListener("load", () => {
  setTimeout(() => {
    // ⚠️ LOGS MINIMAUX AU DÉMARRAGE (pour fluidité)
    // Ne pas afficher le diagnostic - le garder fermé jusqu'à ce que l'utilisateur le demande
    // hideDiag() est appelé par défaut
  }, 500);
});

// ---- POSTS ----
// ===== UPLOAD PHOTO/VIDÉO/AUDIO À SUPABASE STORAGE =====
async function supaUploadMedia(dataUrl, postId, type = "photo") {
  try {
    if (!dataUrl || !dataUrl.startsWith("data:")) {
      console.warn("❌ DataUrl invalide");
      return null;
    }

    console.log("📸 Conversion data URL en Blob...");
    // Convertir data:// base64 en Blob
    const parts = dataUrl.split(';base64,');
    if (parts.length < 2) {
      console.warn("❌ Format data URL incorrect");
      return null;
    }

    const bstr = atob(parts[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      u8arr[i] = bstr.charCodeAt(i);
    }
    // Déterminer le type MIME et l'extension
    let mimeType = "image/jpeg";
    let extension = "jpg";
    if (type === "video") {
      mimeType = "video/mp4";
      extension = "mp4";
    } else if (type === "audio") {
      mimeType = "audio/mpeg";
      extension = "mp3";
    }

    const blob = new Blob([u8arr], { type: mimeType });
    console.log(`✅ Blob ${type} créé: ${blob.size} bytes`);

    // Upload à Supabase Storage
    const fileName = `${type}s/${MY_UID}/${postId}.${extension}`;
    console.log(`📤 Upload vers: ${fileName}`);

    // Essayer upload au bucket "media" d'abord
    let bucketUsed = "media";
    let uploadResult = await supa.storage
      .from("media")
      .upload(fileName, blob, { upsert: true });

    // Si le bucket "media" n'existe pas, essayer "storage"
    if (uploadResult.error && (uploadResult.error.message.includes("not found") || uploadResult.error.message.includes("does not exist"))) {
      console.warn("⚠️ Bucket 'media' non trouvé, essayer 'storage'...");
      bucketUsed = "storage";
      uploadResult = await supa.storage
        .from("storage")
        .upload(fileName, blob, { upsert: true });
    }

    const { data, error } = uploadResult;

    if (error) {
      console.error("❌ Upload échoué:", error);
      console.error("   Message complet:", JSON.stringify(error, null, 2));
      console.error("   Status HTTP:", error.status);
      console.error("   Code erreur:", error.code);

      // Diagnostic: pourquoi l'upload échoue?
      if (error.message?.includes("not found") || error.message?.includes("does not exist")) {
        console.error("⚠️ RAISON: Bucket Supabase Storage n'existe pas!");
        console.error("   → Créer les buckets 'media' et 'storage' dans Supabase");
      } else if (error.status === 401 || error.status === 403) {
        console.error("⚠️ RAISON: Permissions Supabase Storage insuffisantes");
        console.error("   → Vérifier les row level security (RLS) policies");
      } else if (error.status === 413) {
        console.error("⚠️ RAISON: Fichier trop gros pour Supabase Storage");
      }

      // Fallback: retourner le dataUrl original en base64
      console.warn("⚠️ Fallback: utiliser base64 au lieu de Storage");
      return dataUrl;  // Retourner les données base64 originales!
    }

    // Retourner l'URL publique du bucket utilisé
    try {
      const { data: { publicUrl } } = supa.storage.from(bucketUsed).getPublicUrl(fileName);
      console.log(`✅ URL publique: ${publicUrl}`);
      return publicUrl;
    } catch (e) {
      console.warn("❌ getPublicUrl échoué:", e.message);
      return null;
    }
  } catch (e) {
    console.error("❌ Upload exception:", e);
    console.error("   Message:", e.message);
    return null;
  }
}

// ===== PUBLICATION AVEC RETRY AUTOMATIQUE =====
// ===== SYSTÈME DE PUBLICATION FIABLE MULTI-APPAREILS =====
// TIMEOUT COURT: Supabase répond ou on considère que c'est un problème réseau

async function supaPublishPostWithRetry(post, maxRetries = 2) {
  console.log("🚀 [PUBLISH] supaPublishPostWithRetry() DÉBUT - Post ID:", post.id);

  // ✅ S'assurer que le profil existe en DB avant de publier
  // Sinon le JOIN profiles!author_id retourne null → pas de nom d'auteur pour les autres
  try { await supaUpsertProfile(); } catch(e) { console.warn("⚠️ [PUBLISH] upsertProfile échoué:", e.message); }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 [PUBLISH ${attempt}/${maxRetries}] Tentative...`);

      // STEP 1: Uploader les médias (avec timeout 2s)
      let mediaUrl = null;

      if (post.type === "photo" && post.image) {
        console.log("📸 [PUBLISH] Upload photo...");
        mediaUrl = await Promise.race([
          supaUploadMedia(post.id, "photos", post.image, "image"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Upload timeout")), 12000))
        ]);
      } else if (post.type === "video" && post.video) {
        console.log("📹 [PUBLISH] Upload vidéo...");
        mediaUrl = await Promise.race([
          supaUploadMedia(post.id, "videos", post.video, "video"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Upload timeout")), 20000))
        ]);
      } else if (post.type === "audio" && post.audio) {
        console.log("🎙️ [PUBLISH] Upload audio...");
        mediaUrl = await Promise.race([
          supaUploadMedia(post.id, "audios", post.audio, "audio"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Upload timeout")), 15000))
        ]);
      }

      // Réécrire l'URL Storage dans le post local : le base64 est remplacé par
      // l'URL → l'affichage et la persistance (saveState) n'utilisent plus le
      // base64 (évite le quota localStorage et garde l'image après reload).
      if (mediaUrl && typeof mediaUrl === "string" && mediaUrl.indexOf("http") === 0) {
        if (post.type === "photo") post.image = mediaUrl;
        else if (post.type === "video") post.video = mediaUrl;
        else if (post.type === "audio") post.audio = mediaUrl;
      }

      // STEP 2: Créer le post (avec timeout 3s)
      console.log("📝 [PUBLISH] Création post...");
      const postData = {
        id: post.id,
        author_id: MY_UID,
        passion_id: post.passion || null,
        mood: post.mood || "all",
        content: (post.text && !post.text.startsWith("data:")) ? post.text : (post.text?.startsWith("data:") ? "" : ""),
        // ✅ NE JAMAIS stocker du base64 en DB — seulement des URLs Supabase Storage
        media_url: (mediaUrl && !mediaUrl.startsWith("data:")) ? mediaUrl : null,
        created_at: new Date(post.createdAt).toISOString(),
        // 🔄 Ajouter les champs de repost si applicable
        ...(post.sharedReel && { shared_from_post_id: post.sharedReel }),
        ...(post.sharedReelData && { shared_data: JSON.stringify(post.sharedReelData) }),
      };

      const insertPromise = supa.from("posts").insert([postData]).select();
      const { data, error } = await Promise.race([
        insertPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Insert timeout")), 3000))
      ]);

      if (error) throw error;

      console.log("✅ [PUBLISH] Publication réussie!");
      diagLog(`✅ Post ${post.id} publié`);
      return true;

    } catch (e) {
      console.warn(`⚠️ [PUBLISH ${attempt}] Erreur:`, e.message);

      if (attempt === maxRetries) {
        console.error("❌ [PUBLISH] Impossible après retries");
        return false;
      }

      // Attendre avant retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return false;
}

// Fonction d'upload média vers Supabase Storage (avec fallback)
async function supaUploadMedia(postId, folder, base64Data, mediaType) {
  console.log(`📤 [UPLOAD] Début upload ${folder}/${postId}`);

  if (!base64Data || !base64Data.startsWith("data:")) {
    console.warn("⚠️ [UPLOAD] Format base64 invalide - utiliser fallback");
    return base64Data;  // Retourner le base64 comme fallback
  }

  try {
    // Vérifier que Supabase Storage existe
    if (!supa || !supa.storage) {
      console.warn("⚠️ [UPLOAD] Storage indisponible - fallback base64");
      return base64Data;
    }

    // Convertir base64 en Blob
    const parts = base64Data.split(",");
    const bstr = atob(parts[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      u8arr[i] = bstr.charCodeAt(i);
    }
    const blob = new Blob([u8arr], { type: parts[0].split(":")[1].split(";")[0] });

    console.log(`📊 [UPLOAD] Blob créé: ${blob.size} bytes`);

    // Générer nom de fichier (extension cohérente avec le vrai type pour les images : webp/jpeg)
    let ext = ".jpg";
    if (mediaType === "video") ext = ".mp4";
    else if (mediaType === "audio") ext = ".mp3";
    else if (base64Data.indexOf("data:image/webp") === 0) ext = ".webp";
    else if (base64Data.indexOf("data:image/png") === 0) ext = ".png";
    const fileName = `${postId}${ext}`;
    const filePath = `${folder}/${MY_UID}/${fileName}`;

    console.log(`📁 [UPLOAD] Chemin: ${filePath}`);

    // Uploader vers Supabase Storage
    const { data, error } = await supa.storage.from("content").upload(filePath, blob, {
      cacheControl: "3600",
      upsert: true,
    });

    if (error) {
      console.warn("⚠️ [UPLOAD] Storage échoué:", error.message);
      console.warn("📌 [UPLOAD] Fallback: utiliser base64 temporairement");
      return base64Data;  // Fallback à base64
    }

    console.log("✅ [UPLOAD] Fichier uploadé:", data);

    // Récupérer l'URL publique
    try {
      const { data: publicUrl } = supa.storage.from("content").getPublicUrl(filePath);
      if (publicUrl?.publicUrl) {
        console.log("🔗 [UPLOAD] URL publique OK");
        return publicUrl.publicUrl;
      }
    } catch (e) {
      console.warn("⚠️ [UPLOAD] getPublicUrl échoué, fallback base64");
      return base64Data;
    }

    return base64Data;  // Fallback final

  } catch (e) {
    console.warn("⚠️ [UPLOAD] Exception:", e.message);
    console.warn("📌 [UPLOAD] Fallback: utiliser base64");
    return base64Data;  // Fallback toujours
  }
}

// Version legacy (fallback)
async function supaPublishPost(post) {
  try {
    const success = await supaPublishPostWithRetry(post);
    if (!success) {
      console.warn("Post non synchronisé après tentatives");
    }
  } catch(e) {
    console.warn("Post error:", e);
  }
}

async function supaLoadPosts(offset = 0) {
  try {
    // diagLog("📥 Chargement posts depuis Supabase..."); // LOG LOURD DÉSACTIVÉ
    // console.log("[SYNC] Chargement des posts depuis Supabase..."); // LOG LOURD DÉSACTIVÉ
    // ✅ FIX: sélection explicite des champs (évite de charger des colonnes non nécessaires)
    // La DB a été nettoyée des base64 — le code empêche désormais tout nouveau base64 en DB
    const { data, error } = await supa.from("posts")
      .select("id, author_id, passion_id, mood, content, media_url, created_at, shared_from_post_id, shared_data, profiles!author_id(username,emoji,color)")
      .order("created_at", { ascending: false })
      .range(offset, offset + 59);
    if (error) {
      diagLog(`❌ Erreur chargement: ${error.message}`);
      console.error("[SYNC] Erreur requête posts:", error);
      return [];
    }
    // diagLog(`📥 ${data?.length || 0} posts chargés`); // LOG LOURD DÉSACTIVÉ
    // console.log("[SYNC] Posts chargés:", data?.length || 0); // LOG LOURD DÉSACTIVÉ
    window._feedServerMayHaveMore = ((data || []).length === 60);
    if (!data || !data.length) return [];
    // Charger tous les likes + counts commentaires d'un coup
    const postIds = data.map(r => r.id);
    let likesData = [], commentsData = [];
    try {
      const [likesRes, commentsRes] = await Promise.all([
        supa.from("post_likes").select("post_id, user_id").in("post_id", postIds),
        supa.from("post_comments").select("post_id, id, author_id, content, created_at, profiles(username,emoji,color)").in("post_id", postIds).order("created_at", { ascending: false }).limit(200),
      ]);
      likesData = likesRes.data || [];
      commentsData = commentsRes.data || [];
    } catch(e) {}
    return data.map((r, idx) => {
      const postLikes = likesData.filter(l => l.post_id === r.id);
      const postComments = commentsData.filter(c => c.post_id === r.id).map(c => ({
        id: c.id, authorId: c.author_id,
        authorName: c.profiles?.username || "Profil",  // ✅ Doit toujours avoir un username!
        authorEmoji: c.profiles?.emoji || "✨",
        text: c.content || "", content: c.content || "",
        createdAt: new Date(c.created_at + "Z").getTime(),
        fromSupabase: true,
      }));

      // Diagnostic du premier post
      if (idx === 0) {
        diagLog(`📌 Post #1 détails:`);
        diagLog(`  - author_id: "${r.author_id}"`);
        diagLog(`  - passion_id: "${r.passion_id}"`);
        diagLog(`  - created_at (raw): ${r.created_at}`);
        const ts = new Date(r.created_at + "Z").getTime();
        diagLog(`  - createdAt (ms): ${ts}`);
        diagLog(`  - Heure locale: ${new Date(ts).toLocaleString('fr-FR')}`);
        diagLog(`  - profiles?.username: "${r.profiles?.username}"`);
        diagLog(`  - profiles?.emoji: "${r.profiles?.emoji}"`);
        diagLog(`  → Affichera: "${r.profiles?.username || "Passionné"}"`);
        diagLog(`🎯 Passion filtrée actuelle: ${_activeFeedPassions.size > 0 ? Array.from(_activeFeedPassions).join(",") : "AUCUNE"}`);

        // ✅ DIAGNOSTIC VIDÉO
        diagLog(`📹 DIAGNOSTIC MEDIA:`);
        diagLog(`  - media_url défini? ${r.media_url ? "✅" : "❌"}`);
        if (r.media_url) {
          diagLog(`  - media_url: ${r.media_url.substring(0, 80)}...`);
          diagLog(`  - Contient .mp4? ${r.media_url.includes(".mp4") ? "✅" : "❌"}`);
          diagLog(`  - Contient videos/? ${r.media_url.includes("videos/") ? "✅" : "❌"}`);
          diagLog(`  - Contient .jpg/.png? ${r.media_url.includes(".jpg") || r.media_url.includes(".png") ? "✅" : "❌"}`);
          diagLog(`  - Contient photos/? ${r.media_url.includes("photos/") ? "✅" : "❌"}`);
        }
      }

      return {
        id: r.id, authorId: r.author_id,
        authorName: r.profiles?.username || "Profil",  // ✅ Doit toujours avoir un username depuis Supabase!
        authorEmoji: r.profiles?.emoji || "✨",  // ✅ Utiliser l'emoji depuis profiles
        authorColor: r.profiles?.color || "#8b5cf6",  // ✅ Utiliser la couleur depuis profiles
        passion: r.passion_id || "autre", mood: r.mood || "all",
        // ✅ Détecter le type basé sur l'extension du fichier dans media_url
        type: (() => {
          if (!r.media_url) return "text";
          const url = r.media_url.toLowerCase();
          if (url.includes(".mp4") || url.includes("videos/")) return "video";
          if (url.includes(".mp3") || url.includes(".wav") || url.includes("audios/")) return "audio";
          if (url.includes(".jpg") || url.includes(".png") || url.includes("photos/")) return "photo";
          return r.post_type || "photo";  // Fallback
        })(),
        text: r.content || "",
        // ✅ Charger media_url dans la bonne variable selon le type détecté
        image: (() => {
          if (!r.media_url) return null;
          const url = r.media_url.toLowerCase();
          if (url.includes(".mp4") || url.includes("videos/")) return null;
          if (url.includes(".mp3") || url.includes(".wav") || url.includes("audios/")) return null;
          return r.media_url;
        })(),
        video: (() => {
          if (!r.media_url) return null;
          const url = r.media_url.toLowerCase();
          if (url.includes(".mp4") || url.includes("videos/")) return r.media_url;
          return null;
        })(),
        audio: (() => {
          if (!r.media_url) return null;
          const url = r.media_url.toLowerCase();
          if (url.includes(".mp3") || url.includes(".wav") || url.includes("audios/")) return r.media_url;
          return null;
        })(),
        createdAt: new Date(r.created_at + "Z").getTime(),  // ✅ Ajouter Z pour indiquer que c'est UTC!
        likes: postLikes.length,
        liked: postLikes.some(l => l.user_id === MY_UID),
        comments: postComments, fromSupabase: true,
        // 🔄 Repost support: parse shared_from_post_id and shared_data if applicable
        ...(r.shared_from_post_id && { sharedReel: r.shared_from_post_id }),
        ...(r.shared_data && { sharedReelData: (() => {
          try {
            return typeof r.shared_data === 'string' ? JSON.parse(r.shared_data) : r.shared_data;
          } catch(e) {
            console.warn("Failed to parse shared_data:", e);
            return null;
          }
        })() }),
      };
    });
  } catch(e) { return []; }
}

// ---- LIKES ----
async function supaToggleLike(postId) {
  try {
    const { data: existing } = await supa.from("post_likes").select("post_id").eq("post_id", postId).eq("user_id", MY_UID).maybeSingle();
    if (existing) {
      await supa.from("post_likes").delete().eq("post_id", postId).eq("user_id", MY_UID);
      return false;
    } else {
      await supa.from("post_likes").insert({ post_id: postId, user_id: MY_UID });
      return true;
    }
  } catch(e) { return false; }
}

async function supaGetLikeCount(postId) {
  try {
    const { count } = await supa.from("post_likes").select("*", { count: "exact", head: true }).eq("post_id", postId);
    return count || 0;
  } catch(e) { return 0; }
}

// ---- COMMENTAIRES ----
async function supaAddComment(postId, content) {
  try {
    await supaUpsertProfile();
    await supa.from("post_comments").insert({
      id: "c_" + uid(), post_id: postId, author_id: MY_UID, content,
      created_at: new Date().toISOString(),
    });
  } catch(e) { console.warn("Comment error:", e); }
}

async function supaLoadComments(postId) {
  try {
    const { data } = await supa.from("post_comments")
      .select("*, profiles(username,emoji,color)")
      .eq("post_id", postId).order("created_at", { ascending: true });
    return (data || []).map(r => ({
      id: r.id, authorId: r.author_id,
      authorName: r.profiles?.username || "Passionné",
      authorEmoji: r.profiles?.emoji || "✨",
      content: r.content,
      createdAt: new Date(r.created_at + "Z").getTime(),
    }));
  } catch(e) { return []; }
}

// ---- STORIES ----
async function supaPublishStory(story) {
  try {
    await supaUpsertProfile();
    await supa.from("stories").insert({
      id: story.id || uid(), author_id: MY_UID,
      passion_id: story.passion || null,
      content: story.text || story.content || "",
      emoji: story.emoji || "✨",
      created_at: new Date().toISOString(),
    });
  } catch(e) { console.warn("Story error:", e); }
}

async function supaLoadStories() {
  try {
    const since = new Date(Date.now() - 24*3600*1000).toISOString();
    const { data } = await supa.from("stories").select("*, profiles(username,emoji,color)").gte("created_at", since).order("created_at", { ascending: false }).limit(30);
    return (data || []).map(r => ({ id: r.id, authorId: r.author_id, authorName: r.profiles?.username || "Passionné", authorEmoji: r.profiles?.emoji || "✨", authorColor: r.profiles?.color || "#8b5cf6", passion: r.passion_id, content: r.content || "", emoji: r.emoji || "✨", fromSupabase: true }));
  } catch(e) { return []; }
}

// ---- EVENTS IRL ----
async function supaPublishEvent(event) {
  try {
    await supaUpsertProfile();
    const { error } = await supa.from("events").insert({
      id: event.id || uid(), author_id: MY_UID,
      title: event.title, passion_id: event.passion || null,
      lat: event.lat || null, lng: event.lng || null,
      city: event.city || "", emoji: event.emoji || "📍",
      date_at: event.date ? new Date(event.date).toISOString() : new Date().toISOString(),
      description: event.desc || null,
      venue: event.venue || null,
      address: event.address || null,
      postal_code: event.postalCode || null,
      price: event.price || 0,
      max_attendees: event.maxAttendees || null,
      contact: event.contact || null,
      external_link: event.externalLink || null,
      event_type: event.eventType || "Autre",
      cover_url: event.coverUrl || null,
      organizer_id: MY_UID,
    });
    if (error) console.warn("Event Supabase error:", error);
  } catch(e) { console.warn("Event error:", e); }
}

async function supaLoadEvents() {
  try {
    const { data } = await supa.from("events").select("*, profiles(username,emoji,color)").order("created_at", { ascending: false }).limit(60);
    return (data || []).map(r => ({
      id: r.id,
      authorId: r.author_id,
      organizerId: r.organizer_id || r.author_id,
      organizerName: r.profiles?.username || "Passionné",
      title: r.title || "Événement",
      passion: r.passion_id || "autre",
      lat: r.lat, lng: r.lng,
      city: r.city || "",
      emoji: r.emoji || "📍",
      date: r.date_at ? new Date(r.date_at).getTime() : Date.now(),
      desc: r.description || "",
      venue: r.venue || "",
      address: r.address || "",
      postalCode: r.postal_code || "",
      price: r.price || 0,
      maxAttendees: r.max_attendees || null,
      contact: r.contact || "",
      externalLink: r.external_link || "",
      eventType: r.event_type || "Autre",
      coverUrl: r.cover_url || null,
      attendees: [],
      fromSupabase: true,
    }));
  } catch(e) { return []; }
}

// ---- MESSAGERIE TEMPS RÉEL ----

async function supaSearchUsers(query) {
  try {
    const cleanQuery = (query || "").trim();
    console.log("[SEARCH] Query:", cleanQuery, "MY_UID:", MY_UID);

    if (!cleanQuery || cleanQuery.length === 0) {
      console.log("[SEARCH] Query is empty");
      return [];
    }

    // 🔍 Retourner TOUS les profils de chaque utilisateur (pas juste un)
    // Search by username OR bio - sans exclusion par MY_UID pour permettre de trouver son propre profil depuis un autre appareil
    const searchPattern = `%${cleanQuery}%`;
    const { data, error } = await supa.from("profiles")
      .select("id, username, emoji, color, passion_id, bio")
      .or(`username.ilike.${searchPattern},bio.ilike.${searchPattern}`);

    console.log("[SEARCH] Data returned:", data, "Error:", error);
    if (!data) {
      console.log("[SEARCH] No data returned");
      return [];
    }

    console.log("[SEARCH] Found " + data.length + " profiles");

    // Grouper par utilisateur (username) pour obtenir TOUS ses profils/passions
    const userMap = {};
    data.forEach(profile => {
      if (!userMap[profile.id]) {
        userMap[profile.id] = {
          id: profile.id,
          username: profile.username || "Passionné",
          emoji: profile.emoji || "✨",
          color: profile.color || "#8b5cf6",
          bio: profile.bio || "",
          passions: [] // Tous les profils/passions de cet utilisateur
        };
      }
      if (profile.passion_id) {
        userMap[profile.id].passions.push({
          id: profile.passion_id,
          emoji: profile.emoji || "✨"
        });
      }
    });

    const results = Object.values(userMap).slice(0, 8);
    console.log("[SEARCH] Returning " + results.length + " users");
    return results;
  } catch(e) {
    console.error("[SEARCH] Error:", e);
    return [];
  }
}

async function supaCreateConversation(withUserId) {
  try {
    await supaUpsertProfile();
    const convId = "conv_" + uid();
    const rConv = await supa.from("conversations").insert({
      id: convId, is_group: false,
      passion_id: null, created_by: MY_UID,
    });
    if (rConv.error) { console.warn("Conv error (conversations):", rConv.error.message); return null; }
    // Inserts séparés : un échec sur l'autre membre ne doit pas annuler le nôtre.
    // ⚠️ L'ajout de l'AUTRE membre exige la policy de migration_fix_conv_members_insert.sql
    // (sans elle, RLS v2 refuse → la conv serait invisible pour le destinataire).
    const rMe = await supa.from("conv_members").insert({ conv_id: convId, user_id: MY_UID });
    const rHim = await supa.from("conv_members").insert({ conv_id: convId, user_id: withUserId });
    if (rMe.error || rHim.error) {
      console.warn("Conv error (conv_members):", (rMe.error || rHim.error).message);
      // Conversation inutilisable côté serveur → nettoyer et laisser le fallback local
      try { await supa.from("conv_members").delete().eq("conv_id", convId); } catch(e) {}
      try { await supa.from("conversations").delete().eq("id", convId); } catch(e) {}
      return null;
    }
    return convId;
  } catch(e) { console.warn("Conv error:", e); return null; }
}

async function supaCreateGroup(groupName, memberIds, passionId) {
  try {
    await supaUpsertProfile();
    const convId = "grp_" + uid();
    const rConv = await supa.from("conversations").insert({
      id: convId, is_group: true,
      group_name: groupName, passion_id: passionId || null,
      created_by: MY_UID,
    });
    if (rConv.error) { console.warn("Group error (conversations):", rConv.error.message); return null; }
    const members = [...new Set([MY_UID, ...memberIds])].map(u => ({ conv_id: convId, user_id: u }));
    // Inserts séparés (cf. supaCreateConversation) : au moins les membres permis passent.
    let anyMemberError = null;
    for (const m of members) {
      const r = await supa.from("conv_members").insert(m);
      if (r.error && m.user_id !== MY_UID) anyMemberError = r.error;
    }
    if (anyMemberError) console.warn("Group error (conv_members):", anyMemberError.message);
    return convId;
  } catch(e) { return null; }
}

async function supaSendMessage(convId, content) {
  try {
    await supaUpsertProfile();
    await supa.from("conv_messages").insert({
      id: "msg_" + uid(), conv_id: convId,
      from_id: MY_UID, content,
      created_at: new Date().toISOString(),
    });
  } catch(e) { console.warn("Msg error:", e); }
}

async function supaLoadMessages(convId) {
  // Charge TOUS les messages sans limite (GIFs, pièces jointes, localisations encodées en JSON dans content)
  try {
    _diag("supaLoadMessages: Chargement pour convId=" + convId);

    const { data, error } = await supa
      .from("conv_messages")
      .select("id, conv_id, from_id, content, created_at, profiles(username,emoji,color)")
      .eq("conv_id", convId)
      .order("created_at", { ascending: true });

    if (error) {
      _diag("supaLoadMessages: ERREUR Supabase - " + error.message);
      console.warn("supaLoadMessages error:", error.message);
      return [];
    }

    _diag("supaLoadMessages: " + (data ? data.length : 0) + " messages chargés");

    const messages = (data || []).map(function(r) {
      if (r.profiles && r.from_id && typeof _profileCache !== "undefined") {
        _profileCache.set(r.from_id, { username: r.profiles.username || "Passionné", emoji: r.profiles.emoji || "✨", color: r.profiles.color || "#8b5cf6" });
      }

      // Essayer de décoder le content comme JSON
      var contentData = null;
      var contentText = r.content || "";
      try {
        // Toujours essayer de parser comme JSON
        contentData = JSON.parse(r.content);
        _diag("supaLoadMessages: JSON parsé - type=" + (contentData.type || "N/A"));
      } catch(e) {
        // content n'est pas du JSON, c'est du texte normal
        contentData = null;
      }

      var msg = {
        id: r.id,
        from: r.from_id === MY_UID ? "me" : r.from_id,
        fromName: (r.profiles && r.profiles.username) ? r.profiles.username : "Passionné",
        fromEmoji: (r.profiles && r.profiles.emoji) ? r.profiles.emoji : "✨",
        text: contentData && contentData.text ? contentData.text : contentText,
        at: new Date(r.created_at + "Z").getTime(),
      };

      // Traiter content JSON — décodage partagé avec renderConvFpThread (app-04)
      if (contentData) {
        applyMsgContentData(msg, r.content);
        _diag("supaLoadMessages: contenu média appliqué - " + contentData.type);
      }

      return msg;
    });

    // S'assurer que les messages sont triés par timestamp
    messages.sort(function(a, b) { return (a.at || 0) - (b.at || 0); });
    _diag("supaLoadMessages: ✅ " + messages.length + " messages traités");
    return messages;
  } catch(e) {
    _diag("supaLoadMessages: EXCEPTION - " + e.message);
    console.error("supaLoadMessages exception:", e);
    return [];
  }
}

async function supaLoadMyConversations() {
  try {
    const { data: memberships } = await supa.from("conv_members").select("conv_id").eq("user_id", MY_UID);
    if (!memberships?.length) return [];
    const convIds = memberships.map(m => m.conv_id);
    const { data: convs } = await supa.from("conversations").select("*").in("id", convIds);
    if (!convs) return [];

    // Batch toutes les requêtes en parallèle (fix N+1)
    const [lastMsgsAll, membersAll] = await Promise.all([
      Promise.all(convIds.map(cid =>
        supa.from("conv_messages").select("id,conv_id,from_id,content,created_at,profiles(username,emoji,color)")
          .eq("conv_id", cid).order("created_at", { ascending: false }).limit(1)
      )),
      Promise.all(convIds.map(cid =>
        supa.from("conv_members").select("conv_id,user_id,profiles(username,emoji,color)").eq("conv_id", cid)
      ))
    ]);

    const result = convs.map((c, i) => {
      const last = lastMsgsAll[i]?.data?.[0];
      const members = membersAll[i]?.data || [];
      const other = members.find(m => m.user_id !== MY_UID);
      let lastMsg = null;
      if (last) {
        lastMsg = { id: last.id, from: last.from_id === MY_UID ? "me" : last.from_id, fromName: last.profiles?.username || "Passionné", text: last.content, at: new Date(last.created_at + "Z").getTime() };
        applyMsgContentData(lastMsg, last.content); // aperçu : "🎙 Message vocal" plutôt que le JSON brut
      }
      return {
        id: c.id, isGroup: c.is_group, groupName: c.group_name,
        passion: null,
        userId: other?.user_id || "",
        userEmoji: other?.profiles?.emoji || "✨",
        userColor: other?.profiles?.color || "#8b5cf6",
        userName: other?.profiles?.username || "Passionné",
        userIds: members.map(m => m.user_id),
        lastAt: last ? new Date(last.created_at + "Z").getTime() : new Date(c.created_at + "Z").getTime(),
        unread: 0,
        messages: lastMsg ? [lastMsg] : [],
        fromSupabase: true,
      };
    });

    // Dédupliquer par userId (garder la conv la plus récente par paire)
    const seenUsers = {};
    const deduped = [];
    for (const c of result.sort((a,b) => b.lastAt - a.lastAt)) {
      if (c.isGroup) { deduped.push(c); continue; }
      const key = c.userId || c.id;
      if (!seenUsers[key]) { seenUsers[key] = true; deduped.push(c); }
    }
    return deduped;
  } catch(e) { return []; }
}

// supaSubscribeMessages() remplacée par _supaConvSpecificChannel() — voir plus haut

// ---- NOTIFICATIONS ----
async function supaInsertNotif(toUserId, kind, refId, content) {
  try {
    if (toUserId === MY_UID) return;
    const prof = currentProfile();
    await supa.from("notifications").insert({
      id: "n_" + uid(), user_id: toUserId,
      kind, from_id: MY_UID, ref_id: refId,
      content: `${prof?.name || "Quelqu'un"} ${content}`,
      seen: false, created_at: new Date().toISOString(),
    });
  } catch(e) {}
}

// ---- TEMPS RÉEL — abonnements globaux ----
// ════════════════════════════════════════════════════════════════════════
// REALTIME v2 (scaling P0.1) — canaux PRIVÉS par conversation.
// Flag OFF par défaut : la prod reste sur le canal global (v1) tant que la
// migration_realtime_authorization.sql N'EST PAS appliquée + Realtime
// Authorization activé au dashboard. Passer à true UNIQUEMENT après ça + test
// 2 comptes (voir docs/SCALE_RUNBOOK.md P0.1). En v1 ce code est inerte.
// Activable par device sans redéploiement : localStorage.passio_realtime_v2 = "1"
// (permet de tester v2 sur un seul client après l'étape dashboard, avant de
// l'activer pour tout le monde). Défaut : false.
window.PASSIO_REALTIME_V2 = window.PASSIO_REALTIME_V2 ||
  (function(){ try { return localStorage.getItem("passio_realtime_v2") === "1"; } catch(e){ return false; } })();

// Traitement d'un message entrant (factorisé : utilisé par le canal global v1
// ET par les canaux privés v2). `r` = ligne conv_messages (payload.new ou
// payload.record selon la source).
async function _handleIncomingConvMessage(r) {
  if (!r || !r.conv_id) return;
  if (r.from_id === MY_UID) return; // nos propres messages sont déjà dans l'UI (optimistic)

  var convs = getConversations();
  var conv = convs.find(c => c.id === r.conv_id);

  if (!conv) {
    // Nouvelle conv inconnue → vérifier membership Supabase puis créer localement
    try {
      const { data: membership } = await supa.from("conv_members")
        .select("conv_id").eq("conv_id", r.conv_id).eq("user_id", MY_UID).single();
      if (!membership) return; // pas membre → ignorer
      const { data: convData } = await supa.from("conversations").select("*").eq("id", r.conv_id).single();
      const { data: members } = await supa.from("conv_members")
        .select("user_id, profiles(username,emoji,color)").eq("conv_id", r.conv_id);
      const other = (members || []).find(m => m.user_id !== MY_UID);
      if (other?.profiles) _profileCache.set(other.user_id, { username: other.profiles.username, emoji: other.profiles.emoji || "✨", color: other.profiles.color || "#8b5cf6" });
      conv = {
        id: r.conv_id, isGroup: convData?.is_group || false, groupName: convData?.group_name || null,
        passion: null, userId: other?.user_id || r.from_id,
        userEmoji: other?.profiles?.emoji || "✨", userColor: other?.profiles?.color || "#8b5cf6",
        userName: other?.profiles?.username || "Passionné",
        userIds: (members || []).map(m => m.user_id),
        lastAt: new Date(r.created_at + "Z").getTime(), unread: 0, messages: [], fromSupabase: true,
      };
      convs.unshift(conv);
      if (window.PASSIO_REALTIME_V2 && window._subscribePrivateConv) window._subscribePrivateConv(r.conv_id);
    } catch(e) { return; }
  }

  // Profil depuis cache (0 requête si déjà connu)
  const prof = await _fetchProfile(r.from_id);
  const msgAt = new Date(r.created_at + "Z").getTime();
  const newMsg = { id: r.id, from: r.from_id, fromName: prof.username, fromEmoji: prof.emoji, text: r.content, at: msgAt };
  applyMsgContentData(newMsg, r.content); // décode gif/media/audio/doc/location

  if (!conv.messages) conv.messages = [];
  if (conv.messages.find(m => m.id === r.id)) return; // déjà présent (dedup)
  conv.messages.push(newMsg);
  conv.messages.sort((a, b) => (a.at || 0) - (b.at || 0));
  conv.lastAt = msgAt;

  const isConvOpen = window._openedConvId === r.conv_id;
  if (isConvOpen) {
    conv._otherRead = true; // l'utilisateur lit le message
    conversationsState = convs;
    saveConversations();
    try {
      const fp = document.getElementById("conv-fullpage");
      const displayName = fp ? fp.getAttribute("data-display-name") : (conv.userName || "");
      renderConvFpThread(conv, displayName);
    } catch(e) {}
    try { renderMessages(); } catch(e) {}
  } else {
    conv.unread = (conv.unread || 0) + 1;
    conversationsState = convs;
    saveConversations();
    _playMsgSound();
    try { renderMessages(); } catch(e) {}
  }
}
window._handleIncomingConvMessage = _handleIncomingConvMessage;

// v2 : s'abonne au canal PRIVÉ d'une conversation (Broadcast-from-Database).
// Idempotent (dedup via _privateConvChans). No-op si supa absent.
window._privateConvChans = window._privateConvChans || {};
function _subscribePrivateConv(convId) {
  if (typeof supa === "undefined" || !supa || !convId) return;
  if (window._privateConvChans[convId]) return; // déjà abonné
  var ch = supa.channel("conv:" + convId, { config: { private: true } })
    .on("broadcast", { event: "INSERT" }, function(msg) {
      var p = msg && msg.payload;
      var r = p && (p.record || p.new || p); // selon le format broadcast_changes
      if (r && r.conv_id) _handleIncomingConvMessage(r);
    })
    .subscribe();
  window._privateConvChans[convId] = ch;
}
window._subscribePrivateConv = _subscribePrivateConv;
// ════════════════════════════════════════════════════════════════════════

function supaSubscribe() {
  // Garde anti double-abonnement : supaInit peut être appelé par boot() ET par
  // onAuthStateChange — un seul jeu de canaux realtime doit exister.
  if (window._supaSubscribed) return;
  window._supaSubscribed = true;
  // ── Réception des messages entrants ──
  if (window.PASSIO_REALTIME_V2) {
    // v2 (scalable) : un canal PRIVÉ par conversation (Broadcast-from-Database).
    // Chaque client ne reçoit QUE les messages de SES convs. Nécessite
    // migration_realtime_authorization.sql + Realtime Authorization activé.
    (getConversations() || []).forEach(function(c) { if (c && c.id) _subscribePrivateConv(c.id); });
  } else {
    // v1 (défaut) : canal global, filtrage d'appartenance côté client (_handleIncomingConvMessage).
    supa.channel("realtime:my_messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conv_messages" }, function(payload) {
        _handleIncomingConvMessage(payload.new);
      })
      .subscribe();
  }

  // ── Nouvelle conversation créée pour moi (l'autre personne m'ajoute comme membre) ──
  supa.channel("realtime:conv_members")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "conv_members" }, async payload => {
      const r = payload.new;
      if (!r || r.user_id !== MY_UID) return; // ce n'est pas moi qui suis ajouté
      const convId = r.conv_id;
      // Vérifier que je ne l'ai pas déjà
      const convs = getConversations();
      if (convs.find(c => c.id === convId)) return;
      // Charger la conv depuis Supabase
      try {
        const { data: convData } = await supa.from("conversations").select("*").eq("id", convId).single();
        const { data: members } = await supa.from("conv_members")
          .select("user_id, profiles(username,emoji,color)").eq("conv_id", convId);
        const other = (members || []).find(m => m.user_id !== MY_UID);
        const newConv = {
          id: convId,
          isGroup: convData?.is_group || false,
          groupName: convData?.group_name || null,
          passion: null,
          userId: other?.user_id || "",
          userEmoji: other?.profiles?.emoji || "✨",
          userColor: other?.profiles?.color || "#8b5cf6",
          userName: other?.profiles?.username || "Passionné",
          userIds: (members || []).map(m => m.user_id),
          lastAt: new Date(convData?.created_at || Date.now()).getTime(),
          unread: 0,
          messages: [],
          fromSupabase: true,
        };
        conversationsState = deduplicateConversations([newConv, ...getConversations()]);
        saveConversations();
        if (window.PASSIO_REALTIME_V2 && window._subscribePrivateConv) window._subscribePrivateConv(convId);
        try { renderMessages(); } catch(e) {}
      } catch(e) {}
    })
    .subscribe();

  // Nouveaux posts en temps reel
  supa.channel("realtime:posts")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, async payload => {
      const r = payload.new;
      if (r.author_id === MY_UID) return;
      try {
        const { data: prof } = await supa.from("profiles").select("username,emoji,color").eq("id", r.author_id).single();
        const newPost = { id: r.id, authorId: r.author_id, authorName: prof?.username || "Passionne", authorEmoji: prof?.emoji || "✨", authorColor: prof?.color || "#8b5cf6", passion: r.passion_id || "autre", mood: r.mood || "all", type: "text", text: r.content || "", image: r.media_url || null, createdAt: new Date(r.created_at + "Z").getTime(), likes: 0, liked: false, comments: [], fromSupabase: true };
        // ✅ Ajouter dans state.supabasePosts, pas state.seed.posts!
        if (!state.supabasePosts.find(p => p.id === newPost.id)) {
          state.supabasePosts.unshift(newPost);
          console.log("📥 Post reçu en realtime:", newPost.authorName);
          try { renderFeed(); } catch(e) {}
        }
      } catch(e) {}
    })
    .subscribe();

  // Likes en temps reel
  supa.channel("realtime:likes")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_likes" }, payload => {
      const r = payload.new;
      const post = state.seed.posts.find(p => p.id === r.post_id) || (state.userPosts||[]).find(p => p.id === r.post_id);
      if (post) { post.likes = (post.likes || 0) + 1; try { renderFeed(); } catch(e) {} }
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "post_likes" }, payload => {
      const r = payload.old;
      const post = state.seed.posts.find(p => p.id === r.post_id) || (state.userPosts||[]).find(p => p.id === r.post_id);
      if (post) { post.likes = Math.max(0, (post.likes || 1) - 1); try { renderFeed(); } catch(e) {} }
    })
    .subscribe();

  // Commentaires en temps reel
  supa.channel("realtime:comments")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_comments" }, async payload => {
      const r = payload.new;
      if (r.author_id === MY_UID) return;
      try {
        const post = state.seed.posts.find(p => p.id === r.post_id) || (state.userPosts||[]).find(p => p.id === r.post_id);
        if (post) {
          const { data: prof } = await supa.from("profiles").select("username,emoji").eq("id", r.author_id).single();
          if (!post.comments) post.comments = [];
          if (!post.comments.find(c => c.id === r.id)) {
            post.comments.unshift({ id: r.id, authorId: r.author_id, authorName: prof?.username || "Passionne", authorEmoji: prof?.emoji || "✨", text: r.content || "", content: r.content || "", createdAt: new Date(r.created_at + "Z").getTime(), fromSupabase: true });
          }
          try { renderFeed(); } catch(e) {}
        }
      } catch(e) {}
    })
    .subscribe();
}
// ---- FOLLOW / UNFOLLOW ----
async function supaFollowUser(targetId) {
  try {
    await supaUpsertProfile();
    await supa.from("follows").insert({ follower_id: MY_UID, following_id: targetId, created_at: new Date().toISOString() });
  } catch(e) {}
}

async function supaUnfollowUser(targetId) {
  try {
    await supa.from("follows").delete().eq("follower_id", MY_UID).eq("following_id", targetId);
  } catch(e) {}
}

async function supaLoadFollowing() {
  try {
    const { data } = await supa.from("follows").select("following_id").eq("follower_id", MY_UID);
    return (data || []).map(r => r.following_id);
  } catch(e) { return []; }
}

// ---- EVENT JOINING ----
async function supaJoinEvent(eventId) {
  try {
    await supaUpsertProfile();
    await supa.from("event_attendees").insert({ event_id: eventId, user_id: MY_UID, created_at: new Date().toISOString() });
  } catch(e) {}
}

async function supaLeaveEvent(eventId) {
  try {
    await supa.from("event_attendees").delete().eq("event_id", eventId).eq("user_id", MY_UID);
  } catch(e) {}
}

async function supaLoadJoinedEvents() {
  try {
    const { data } = await supa.from("event_attendees").select("event_id").eq("user_id", MY_UID);
    return (data || []).map(r => r.event_id);
  } catch(e) { return []; }
}

// ---- NOTIFICATIONS SUPABASE ----
async function supaLoadNotifications() {
  try {
    const { data } = await supa.from("notifications")
      .select("*, profiles!from_id(username,emoji)")
      .eq("user_id", MY_UID)
      .order("created_at", { ascending: false })
      .limit(30);
    return (data || []).map(r => ({
      id: r.id, kind: r.kind, fromId: r.from_id,
      text: r.content || "",
      emoji: r.profiles?.emoji || "✨",
      createdAt: new Date(r.created_at + "Z").getTime(),
      unread: !r.seen,
      fromSupabase: true,
    }));
  } catch(e) { return []; }
}

// ── Pagination du feed : rendre 20 de plus, et recharger une page serveur si besoin
window._feedRenderLimit = 20;
window._feedExtraPosts = [];
async function loadMoreFeedPosts() {
  const btn = document.getElementById("feedLoadMoreBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Chargement…"; }
  window._feedRenderLimit = (window._feedRenderLimit || 20) + 20;
  try {
    const loadedCount = (state.supabasePosts || []).length;
    // Si on approche de la fin du stock local et que le serveur peut avoir plus → page suivante
    if (window._feedServerMayHaveMore && window._feedRenderLimit >= loadedCount - 10) {
      const more = await supaLoadPosts(loadedCount);
      window._feedServerMayHaveMore = (more.length === 60);
      if (more.length) {
        const known = new Set((state.supabasePosts || []).map(p => p.id));
        const fresh = more.filter(p => !known.has(p.id));
        window._feedExtraPosts = (window._feedExtraPosts || []).concat(fresh);
        state.supabasePosts = (state.supabasePosts || []).concat(fresh);
      }
    }
  } catch (e) { console.warn("loadMoreFeedPosts:", e); }
  renderFeed();
}

// ===== SYSTÈME DE REFRESH AUTOMATIQUE DU FEED =====
let _feedRefreshInterval = null;

function startFeedRefreshLoop() {
  if (_feedRefreshInterval) return;  // Déjà en cours
  console.log("🔄 [FEED] Démarrage refresh fallback du feed (60s, le realtime gère le reste)");
  _feedRefreshInterval = setInterval(async () => {
    try {
      const posts = await supaLoadPosts();
      if (posts && posts.length > 0) {
        const extra = (window._feedExtraPosts || []).filter(p => !posts.some(x => x.id === p.id));
        state.supabasePosts = posts.concat(extra);
        // NE RAFRAÎCHIR QUE SI ON EST SUR LE FEED
        // 🔧 FIX AUDIT 2026-06-10 : l'id est "screen-feed" (pas "feed") —
        // le fallback 60s ne rafraîchissait JAMAIS le fil.
        const feedEl = document.getElementById("screen-feed");
        if (feedEl && feedEl.classList.contains("active")) {
          renderFeed();
        }
      }
    } catch (e) {
      console.warn("⚠️ [FEED] Refresh échoué:", e.message);
    }
  }, 60000);  // Fallback 60s — les mises à jour instantanées passent par le canal realtime:posts
}

function stopFeedRefreshLoop() {
  if (_feedRefreshInterval) {
    clearInterval(_feedRefreshInterval);
    _feedRefreshInterval = null;
    console.log("⏹️ [FEED] Refresh arrêté");
  }
}

async function supaMarkNotifSeen(notifId) {
  try { await supa.from("notifications").upsert({ id: notifId, seen: true }, { onConflict: "id" }); } catch(e) {}
}

document.addEventListener("click", function(e) {
  if (!e.target.closest(".msg-search-wrap")) {
    var r = document.getElementById("msgUserResults");
    if (r) r.style.display = "none";
  }
});

// ---- INIT COMPL\u00c8TE ----
async function supaInit() {
  try {
    // \ud83d\udd27 FIX CRITIQUE: Le Promise.all() lancait 7 requ\u00eates Supabase en parall\u00e8le
    // \u2192 Le client Supabase se cassait apr\u00e8s la premi\u00e8re requ\u00eate
    // SOLUTION: Charger seulement les posts, puis attendre

    console.log("\ud83d\udce5 supaInit() d\u00e9marrage...");

    // 1. CHARGER LES POSTS au d\u00e9marrage
    console.log("\ud83d\udce5 [INIT] Chargement des posts Supabase");
    const initPosts = await supaLoadPosts();
    console.log(`\u2705 [INIT] ${initPosts.length} posts charg\u00e9s`);
    if (initPosts.length > 0) {
      state.supabasePosts = initPosts;
      renderFeed();
    }

    // 2. D\u00c9MARRER LE REFRESH AUTOMATIQUE DU FEED
    // Cela garantit que les posts d'autres utilisateurs apparaissent en temps quasi-r\u00e9el
    startFeedRefreshLoop();

    // 3. Les autres requ\u00eates peuvent attendre (moins critiques)
    setTimeout(() => {
      if (typeof supaLoadStories === "function")
        supaLoadStories().then(s => { if (s.length) { state.seed.stories = s; } }).catch(e => {});
      if (typeof supaLoadEvents === "function")
        supaLoadEvents().then(e => { if (e.length) { state.seed.events = e; } }).catch(e => {});
    }, 2000);

    // 4. CONVERSATIONS + REALTIME \u2014 \ud83d\udd27 FIX CRITIQUE 2026-06-12 : ces deux blocs
    // \u00e9taient dans le code mort apr\u00e8s le `return` ci-dessous depuis le "FIX Promise.all"
    // \u2192 l'app ne chargeait JAMAIS les conversations Supabase et ne s'abonnait JAMAIS
    // au realtime global : le destinataire ne recevait rien tant qu'il n'ouvrait pas
    // lui-m\u00eame la conversation (qu'il ne voyait pas non plus dans sa liste).
    try {
      const supaConvs = await supaLoadMyConversations();
      if (supaConvs && supaConvs.length) {
        const localConvs = getConversations();
        const supaConvIds = new Set(supaConvs.map(c => c.id));
        const localOnly = localConvs.filter(c => !supaConvIds.has(c.id) && !SEED_CONVERSATIONS.find(s => s.id === c.id));
        conversationsState = deduplicateConversations([...supaConvs, ...localOnly]);
      } else {
        conversationsState = deduplicateConversations(getConversations());
      }
      _primeProfileCache(conversationsState); // pr\u00e9-remplir cache \u2192 0 requ\u00eate lors de la r\u00e9ception
      saveConversations();
      try { renderMessages(); } catch(e) {}
    } catch(e) { console.warn("supaInit conversations:", e); }
    try { supaSubscribe(); } catch(e) { console.warn("supaSubscribe:", e); }
    // Sauvegarder imm\u00e9diatement avant fermeture de page (flush le debounce)
    window.addEventListener("beforeunload", saveConversationsNow, { once: false });

    console.log("\u2705 [INIT] Initialisation Supabase compl\u00e8te");
    return;
    if (supaPosts.length) {
      // Sync les posts likés depuis Supabase
      const likedFromSupa = supaPosts.filter(p => p.liked).map(p => p.id);
      if (likedFromSupa.length) {
        state.user.likedPosts = [...new Set([...(state.user.likedPosts || []), ...likedFromSupa])];
      }
      // Dédupliquer : les posts Supabase remplacent les locaux avec le même id
      const supaIds = new Set(supaPosts.map(p => p.id));
      const localOnly = (state.seed.posts || []).filter(p => !supaIds.has(p.id));
      state.seed.posts = [...supaPosts, ...localOnly];
    }
    if (supaStories.length) {
      const supaStoryIds = new Set(supaStories.map(s => s.id));
      const localStories = (state.seed.stories || []).filter(s => !supaStoryIds.has(s.id));
      state.seed.stories = [...supaStories, ...localStories];
    }
    if (supaEvents.length) {
      const supaEvIds = new Set(supaEvents.map(e => e.id));
      const localEvents = (state.seed.events || []).filter(e => !supaEvIds.has(e.id));
      state.seed.events = [...supaEvents, ...localEvents];
    }
    // Fusionne les notifications (priorit\u00e9 Supabase si fromSupabase)
    if (supaNotifs.length) {
      const localOnly = (state.notifications || []).filter(n => !n.fromSupabase);
      state.notifications = [...supaNotifs, ...localOnly].slice(0, 50);
    }
    // Fusionne les follows
    if (supaFollowing.length) {
      state.user.following = [...new Set([...(state.user.following || []), ...supaFollowing])];
    }
    // Fusionne les events rejoints
    if (supaJoined.length) {
      state.user.joinedEvents = [...new Set([...(state.user.joinedEvents || []), ...supaJoined])];
    }
    // Fusionne + déduplique les conversations Supabase
    if (supaConvs && supaConvs.length) {
      const localConvs = getConversations();
      const supaConvIds = new Set(supaConvs.map(c => c.id));
      const localOnly = localConvs.filter(c => !supaConvIds.has(c.id) && !SEED_CONVERSATIONS.find(s => s.id === c.id));
      const merged = [...supaConvs, ...localOnly];
      conversationsState = deduplicateConversations(merged);
      _primeProfileCache(conversationsState); // pré-remplir cache → 0 requête lors de la réception
      saveConversations();
    } else {
      conversationsState = deduplicateConversations(getConversations());
      _primeProfileCache(conversationsState);
      saveConversations();
    }
    saveState();
    try { renderEverything(); } catch(e) { console.warn("supaInit render error:", e); }
    try { supaSubscribe(); } catch(e) {}
    // Sauvegarder immédiatement avant fermeture de page (flush le debounce)
    window.addEventListener("beforeunload", saveConversationsNow, { once: false });
  } catch(e) { console.warn("supaInit error:", e); }
}


// ===== NOUVELLES FONCTIONNALITÉS =====

// Filtre ville IRL
function filterIrlByCity() {
  var q = ((document.getElementById("irlCitySearch")||{}).value||"").trim().toLowerCase();
  var empty = document.getElementById("irlSearchEmpty");
  var visible = 0;
  document.querySelectorAll("#eventList .event-card").forEach(function(card) {
    var city = (card.getAttribute("data-city")||"").toLowerCase();
    var title = (card.getAttribute("data-title")||"").toLowerCase();
    var show = !q || city.includes(q) || title.includes(q);
    card.style.display = show ? "" : "none";
    if (show) visible++;
  });
  if (empty) empty.style.display = (!q || visible > 0) ? "none" : "block";
}

// Historique IA
function getAiHistory() {
  try { return JSON.parse(localStorage.getItem("passio_ai_history")||"[]"); } catch(e) { return []; }
}
function saveAiHistory(q) {
  var h = getAiHistory().filter(function(x){ return x !== q; });
  h.unshift(q); h = h.slice(0,5);
  localStorage.setItem("passio_ai_history", JSON.stringify(h));
}
function clearAiHistory() { localStorage.removeItem("passio_ai_history"); }
function renderAiHistory() {
  var box = document.getElementById("aiHistoryBox");
  if (!box) return;
  var h = getAiHistory();
  if (!h.length) { box.style.display = "none"; return; }
  box.style.display = "block";
  box.innerHTML = "";
  var title = document.createElement("div");
  title.style.cssText = "font-size:11px;font-weight:800;color:var(--muted);margin-bottom:8px;text-transform:uppercase;";
  title.textContent = "🕐 Recherches récentes";
  box.appendChild(title);
  var row = document.createElement("div");
  row.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";
  h.forEach(function(q) {
    var btn = document.createElement("button");
    btn.className = "pill";
    btn.style.cssText = "padding:6px 10px;font-size:12px;cursor:pointer;";
    btn.textContent = q;
    btn.onclick = function(){ sendAIQuery(q); };
    row.appendChild(btn);
  });
  var clearBtn = document.createElement("button");
  clearBtn.style.cssText = "font-size:10px;color:var(--muted);background:none;border:none;cursor:pointer;padding:6px;";
  clearBtn.textContent = "Effacer";
  clearBtn.onclick = function(){ clearAiHistory(); renderAiHistory(); };
  row.appendChild(clearBtn);
  box.appendChild(row);
}

// Photo dans conversations
function attachMsgPhoto(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var fullpage = document.getElementById("conv-fullpage");
  if (!fullpage) return;
  var cid = fullpage.getAttribute("data-conv-id");
  if (!cid) return;
  var convs = getConversations();
  var conv = convs.find(function(c){ return c.id === cid; });
  if (!conv) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    if (!conv.messages) conv.messages = [];
    var msgId = "msg_" + uid();
    conv.messages.push({ id: msgId, from:"me", text:"", img: e.target.result, at: Date.now() });
    conv.lastAt = Date.now();
    saveConversations();
    var displayName = fullpage.getAttribute("data-display-name") || conv.userName || "Conversation";
    renderConvFpThread(conv, displayName);
    renderMessages();
  };
  reader.readAsDataURL(file);
  input.value = "";
}

// Profil chips dans feed
// toggleProfileFilter et selectAllProfiles définis plus haut


function resetOnboarding() {
  toggleDevPanel();
  state.onboarded = false;
  state.landingSeen = false;
  saveState();
  // Cacher l'app, montrer l'onboarding
  // 🔧 FIX AUDIT 2026-06-10 : #appShell n'existe pas (TypeError qui
  // interrompait le reset) — l'élément est .app-shell, sans état "active".
  document.body.classList.remove("screen-feed-active");
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById("onboarding").classList.add("active");
  document.getElementById("landing").classList.remove("active");
  onbStepIdx = 0;
  showOnbStep(onbSteps[0]);
}

function exitLandingAsAuth(mode) {
  document.getElementById("landing").classList.remove("active");
  state.landingSeen = true;
  saveState();
  document.getElementById("onboarding").classList.add("active");
  onbStepIdx = 0;
  showOnbStep(onbSteps[0]);
  // Pré-sélectionner l'onglet souhaité
  setTimeout(function() { switchAuthTab(mode); }, 50);
}
