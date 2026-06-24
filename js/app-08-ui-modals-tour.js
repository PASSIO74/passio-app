// ======== TOPBAR ========
function renderTopbar() {
  const prof = currentProfile();
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
// Identifiant de l'utilisateur courant côté stories (auth Supabase ou "me").
function _myStoryAuthorId() {
  return (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
}

// Regroupe state.seed.stories PAR AUTEUR (façon Instagram) : une seule bulle par
// profil, qui contient toutes ses stories. L'ordre des groupes suit l'activité
// la plus récente (les stories sont déjà unshift => plus récentes en tête).
// Dans chaque groupe, on joue de la plus ancienne à la plus récente.
function buildStoryGroups() {
  const stories = state.seed.stories || [];
  const map = new Map();
  const order = [];
  stories.forEach(s => {
    const id = String(s.authorId || "unknown");
    if (!map.has(id)) {
      const u = userById(s.authorId) || {};
      map.set(id, {
        authorId: s.authorId,
        name: s.authorName || u.name || "Passionné",
        emoji: s.authorEmoji || u.profileEmoji || "✨",
        color: s.authorColor || u.avatar || "#8b5cf6",
        stories: [],
      });
      order.push(id);
    }
    map.get(id).stories.push(s);
  });
  const groups = order.map(id => map.get(id));
  groups.forEach(g => g.stories.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  return groups;
}

// Miniature de la bulle d'un groupe : la story la plus récente avec un visuel,
// sinon l'emoji du profil.
function _storyBubbleInner(g) {
  const withMedia = g.stories.slice().reverse().find(s => s.media && s.mediaType !== "video");
  if (withMedia) {
    return `<img loading="lazy" decoding="async" src="${escapeHtml(withMedia.media)}" alt="${escapeHtml(g.name)}" onerror="this.style.display='none'"/>`;
  }
  const withPhoto = g.stories.slice().reverse().find(s => s.photo);
  if (withPhoto) {
    const photoUrl = `https://images.unsplash.com/${withPhoto.photo}?w=160&h=160&fit=crop&crop=entropy&auto=format&q=75`;
    const fallback = `https://picsum.photos/seed/${withPhoto.id}/160/160`;
    return `<img loading="lazy" decoding="async" src="${photoUrl}" alt="${escapeHtml(g.name)}" onerror="this.onerror=null;this.src='${fallback}'"/>`;
  }
  return g.emoji || "✨";
}

function renderStories() {
  // Chercher #storiesRowFeed (feed) OU #storiesRow (explorer)
  const row = $("#storiesRowFeed") || $("#storiesRow");
  if (!row) return;
  const seen = state.user.seenStories || [];
  const groups = buildStoryGroups();
  const myId = String(_myStoryAuthorId());

  // Mon groupe (toutes MES stories) : affiché UNE SEULE fois via la bulle "Ta story".
  // Les autres profils suivent, un par bulle.
  const myGroup = groups.find(g => String(g.authorId) === myId || String(g.authorId) === "me");
  const others = groups.filter(g => g !== myGroup);

  const me = (typeof currentProfile === "function" && currentProfile()) || {};
  const myColor = (myGroup && myGroup.color) || me.color || "#8b5cf6";
  const myEmoji = (myGroup && myGroup.emoji) || me.emoji || "✨";

  let html;
  if (myGroup && myGroup.stories.length) {
    // J'ai déjà des stories : la bulle ouvre MON groupe ; le petit "+" en ajoute une.
    const allSeen = myGroup.stories.every(s => seen.includes(s.id));
    html = `
      <div class="story-item" onclick="openStoryGroup('${escapeHtml(String(myGroup.authorId))}')" title="Voir ta story">
        <div class="story-ring ${allSeen ? "seen" : ""}">
          <div class="story-inner" style="background:${myColor};">${_storyBubbleInner(myGroup)}</div>
        </div>
        <button class="story-add-badge" onclick="event.stopPropagation();meOpen('story')" aria-label="Ajouter une story">+</button>
        <div class="story-label">Ta story</div>
      </div>
    `;
  } else {
    // Pas encore de story : bulle de création.
    html = `
      <div class="story-item" onclick="meOpen('story')" title="Créer une story">
        <div class="story-ring create">
          <div class="story-inner" style="background:${myColor};">${myEmoji}</div>
        </div>
        <div class="story-label">Ta story</div>
      </div>
    `;
  }

  html += others.map(g => {
    const allSeen = g.stories.every(s => seen.includes(s.id));
    return `
      <div class="story-item" onclick="openStoryGroup('${escapeHtml(String(g.authorId))}')">
        <div class="story-ring ${allSeen ? "seen" : ""}">
          <div class="story-inner" style="background: ${g.color};">${_storyBubbleInner(g)}</div>
        </div>
        <div class="story-label">${escapeHtml(g.name.split(" ")[0])}</div>
      </div>
    `;
  }).join("");

  row.innerHTML = html;
  const rowFeed = $("#storiesRowFeed");
  if (rowFeed) rowFeed.innerHTML = html;
}

// ======== CRÉATION DE STORY ========
const STORY_BGS = [
  "linear-gradient(135deg,#7c3aed,#a78bfa)",
  "linear-gradient(135deg,#ec4899,#f97316)",
  "linear-gradient(135deg,#0ea5e9,#22d3ee)",
  "linear-gradient(135deg,#10b981,#84cc16)",
  "linear-gradient(135deg,#f43f5e,#fb7185)",
  "linear-gradient(135deg,#1e293b,#475569)",
];
let _storyBg = STORY_BGS[0];

function openStoryComposer() {
  _storyBg = STORY_BGS[0];
  const swatches = STORY_BGS.map((bg, i) =>
    `<button class="story-bg-swatch ${i === 0 ? "active" : ""}" data-bg="${bg}" style="background:${bg};" onclick="selectStoryBg(this)" aria-label="Fond ${i + 1}"></button>`
  ).join("");
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">✨ Créer une story</div>
    <div class="modal-subtitle">Visible 24 h par ta communauté.</div>
    <div class="story-compose-preview" id="storyPreview" style="background:${_storyBg};">
      <div id="storyPreviewText">Ton texte ici…</div>
    </div>
    <div class="story-bg-row">${swatches}</div>
    <textarea class="textarea" id="storyComposeText" maxlength="180" placeholder="Quoi de neuf dans ta passion ?" oninput="_onStoryComposeInput(this)" style="margin-top:10px;min-height:64px;"></textarea>
    <button class="btn primary block" style="margin-top:12px;" onclick="publishStoryFromComposer()">Publier ma story</button>
  `);
}

function _onStoryComposeInput(ta) {
  const prev = document.getElementById("storyPreviewText");
  if (prev) prev.textContent = ta.value || "Ton texte ici…";
}

function selectStoryBg(btn) {
  _storyBg = btn.getAttribute("data-bg") || STORY_BGS[0];
  document.querySelectorAll(".story-bg-swatch").forEach(s => s.classList.remove("active"));
  btn.classList.add("active");
  const prev = document.getElementById("storyPreview");
  if (prev) prev.style.background = _storyBg;
}

function publishStoryFromComposer() {
  const ta = document.getElementById("storyComposeText");
  const text = (ta && ta.value || "").trim();
  if (text.length < 1) { toast("Écris quelque chose pour ta story"); return; }
  const p = (typeof currentProfile === "function" && currentProfile()) || {};
  const story = {
    id: "story_" + uid(),
    authorId: (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me",
    authorName: p.name || state.user.name || "Moi",
    authorEmoji: p.emoji || "✨",
    authorColor: p.color || "#8b5cf6",
    text, content: text,
    bg: _storyBg,
    emoji: p.emoji || "✨",
    passion: p.passion || null,
    createdAt: Date.now(),
    fromSupabase: false,
  };
  state.seed.stories = state.seed.stories || [];
  state.seed.stories.unshift(story);
  // Rendre l'auteur résoluble par userById() (pour les rendus qui s'y fient)
  try {
    const meId = story.authorId;
    state.seed.users = (state.seed.users || []).filter(u => u.id !== meId);
    state.seed.users.push({ id: meId, name: story.authorName, profileEmoji: story.authorEmoji, avatar: story.authorColor });
  } catch(e) {}
  saveState();
  if (typeof supa !== "undefined" && supa && typeof supaPublishStory === "function") supaPublishStory(story);
  closeModal();
  try { renderStories(); } catch(e) {}
  toast("✨ Story publiée !");
}

// Conservé pour compat : redirige vers l'éditeur média.
function openStudioAsStory() { meOpen("story"); }

// ════════════════════════════════════════════════════════════════════════
// ÉDITEUR MÉDIA façon Instagram — partagé par STORIES et BOBINES.
// Média (photo/vidéo) ou fond dégradé (story) + overlays déplaçables :
// texte, emoji, GIF. Publie en story (24h) ou en bobine (is_reel).
// ════════════════════════════════════════════════════════════════════════
var meState = { mode: "story", media: null, mediaType: null, bg: STORY_BGS[0], bgIdx: 0, overlays: [], _seq: 0 };
// État de la caméra live (capture façon Instagram).
var meCam = { stream: null, facing: "user", recorder: null, chunks: [], recording: false, recTimer: null, recStart: 0, holdTimer: null, maxTimer: null, _boundShutter: false };

function meOpen(mode) {
  meState = { mode: mode || "story", media: null, mediaType: null, bg: STORY_BGS[0], bgIdx: 0, overlays: [], _seq: 0 };
  var ed = document.getElementById("mediaEditor"); if (!ed) return;
  document.getElementById("meMedia").innerHTML = "";
  document.getElementById("meOverlays").innerHTML = "";
  // Fond noir pendant la capture (pas le dégradé de l'ancien composer).
  document.getElementById("meCanvas").style.background = "#000";
  // Placeholder gardé masqué : il ne sert que de fallback si la caméra échoue.
  document.getElementById("mePlaceholder").classList.add("hidden");
  document.getElementById("mePhTitle").textContent = (mode === "bobine")
    ? "Ajoute une vidéo (ou une photo) pour ta bobine" : "Ajoute une photo ou une vidéo";
  var gradBtn = document.getElementById("meGradientBtn"); if (gradBtn) gradBtn.style.display = (mode === "bobine") ? "none" : "";
  var bgBtn = document.getElementById("meBgBtn"); if (bgBtn) bgBtn.style.display = (mode === "bobine") ? "none" : "";
  var title = document.getElementById("meTitle"); if (title) title.textContent = (mode === "bobine") ? "Bobine" : "Story";
  document.getElementById("mePublishBtn").textContent = (mode === "bobine") ? "Publier ma bobine" : "Publier ma story";
  // Phase capture par défaut (le loader caméra s'affiche le temps de l'init).
  ed.classList.remove("phase-edit", "me-recording", "me-cam-on", "me-no-cam");
  ed.classList.add("open", "phase-capture");
  ed.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  _meBindShutter();
  meStartCamera();
}
function meClose() {
  var ed = document.getElementById("mediaEditor");
  meStopRecording(true);
  meStopCamera();
  if (ed) { ed.classList.remove("open", "phase-edit", "phase-capture", "me-recording", "me-cam-on"); ed.setAttribute("aria-hidden", "true"); }
  document.body.style.overflow = "";
  try { var v = document.querySelector("#meMedia video"); if (v) v.pause(); } catch(e) {}
  var bar = document.getElementById("meEmojiBar"); if (bar) bar.remove();
}
// Bouton ✕ : en édition → revient à la capture ; en capture → ferme.
function meTopBack() {
  var ed = document.getElementById("mediaEditor");
  if (ed && ed.classList.contains("phase-edit")) { meBackToCapture(); return; }
  meClose();
}
function meBackToCapture() {
  var ed = document.getElementById("mediaEditor"); if (!ed) return;
  meState.media = null; meState.mediaType = null; meState.overlays = []; meState._seq = 0;
  document.getElementById("meMedia").innerHTML = "";
  document.getElementById("meOverlays").innerHTML = "";
  document.getElementById("meCanvas").style.background = "#000";
  document.getElementById("mePlaceholder").classList.add("hidden");
  ed.classList.remove("phase-edit", "me-no-cam"); ed.classList.add("phase-capture");
  meStartCamera();
}
function meEnterEditPhase() {
  var ed = document.getElementById("mediaEditor"); if (!ed) return;
  meStopRecording(true);
  meStopCamera();
  ed.classList.remove("phase-capture"); ed.classList.add("phase-edit");
  meState._enteredEditAt = Date.now(); // anti clic-fantôme : bloque une publication immédiate
}
// Absorbe le prochain clic (le « ghost click » émis après un pointerup tactile),
// pour qu'il n'atteigne pas le bouton Publier qui vient d'apparaître sous le doigt.
function _meSwallowNextClick() {
  var t;
  var swallow = function(e) {
    e.stopPropagation(); e.preventDefault();
    document.removeEventListener("click", swallow, true);
    clearTimeout(t);
  };
  document.addEventListener("click", swallow, true);
  t = setTimeout(function() { document.removeEventListener("click", swallow, true); }, 700);
}

// ---- Caméra live ----
async function meStartCamera() {
  if (meState.mode !== "bobine" && meState.mode !== "story") return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { _meNoCamera(); return; }
  try {
    meStopCamera();
    var stream = await navigator.mediaDevices.getUserMedia({
      // 720p (au lieu de 1280) : suffisant pour du social mobile, ~2× moins
      // de pixels donc des vidéos bien plus légères (cf. bitrate ci-dessous).
      video: { facingMode: meCam.facing, width: { ideal: 720 }, height: { ideal: 720 } },
      audio: true
    });
    meCam.stream = stream;
    var v = document.getElementById("meCamVideo");
    if (!v) { meStopCamera(); _meNoCamera(); return; }
    v.srcObject = stream; v.muted = true;
    v.style.transform = (meCam.facing === "user") ? "scaleX(-1)" : "none";
    var ed = document.getElementById("mediaEditor"); if (ed) { ed.classList.remove("me-no-cam"); ed.classList.add("me-cam-on"); }
    try { await v.play(); } catch(e) {}
  } catch(e) { _meNoCamera(); }
}
function meStopCamera() {
  try { if (meCam.stream) meCam.stream.getTracks().forEach(function(t) { t.stop(); }); } catch(e) {}
  meCam.stream = null;
  var v = document.getElementById("meCamVideo"); if (v) { try { v.srcObject = null; } catch(e) {} }
  var ed = document.getElementById("mediaEditor"); if (ed) ed.classList.remove("me-cam-on");
}
function _meNoCamera() {
  // Pas d'accès caméra → on masque le loader et on retombe sur le placeholder galerie/fond.
  var ed = document.getElementById("mediaEditor"); if (ed) { ed.classList.remove("me-cam-on"); ed.classList.add("me-no-cam"); }
  var ph = document.getElementById("mePlaceholder"); if (ph) ph.classList.remove("hidden");
}
function meFlipCamera() {
  if (!meCam.stream) { meStartCamera(); return; }
  meCam.facing = (meCam.facing === "user") ? "environment" : "user";
  meStartCamera();
}

// Capture photo : on dessine l'image de la vidéo dans un canvas.
function meCapturePhoto() {
  var v = document.getElementById("meCamVideo");
  if (!v || !v.videoWidth) { mePickMedia(); return; }
  try {
    var c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    var ctx = c.getContext("2d");
    if (meCam.facing === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0, c.width, c.height);
    var url = c.toDataURL("image/jpeg", 0.88);
    meSetMedia(url, "photo");
  } catch(e) { toast("Impossible de prendre la photo"); }
}

// Enregistrement vidéo (maintien du déclencheur).
function meStartRecording() {
  if (!meCam.stream || !window.MediaRecorder || meCam.recording) return;
  var mime = (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) ? "video/webm;codecs=vp9,opus"
    : (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) ? "video/webm;codecs=vp8,opus"
    : (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("video/webm")) ? "video/webm"
    : (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("video/mp4")) ? "video/mp4" : "";
  meCam.chunks = [];
  // Bitrate plafonné : sans ça le navigateur enregistre à 2,5-8 Mbps → une
  // vidéo de 60 s pèse 20-30 Mo et sature le Storage (1 Go en gratuit).
  // 1,2 Mbps vidéo + 96 kbps audio → ~60 s ≈ 8-9 Mo, qualité sociale OK.
  var recOpts = { videoBitsPerSecond: 1200000, audioBitsPerSecond: 96000 };
  if (mime) recOpts.mimeType = mime;
  try { meCam.recorder = new MediaRecorder(meCam.stream, recOpts); }
  catch(e) {
    try { meCam.recorder = mime ? new MediaRecorder(meCam.stream, { mimeType: mime }) : new MediaRecorder(meCam.stream); }
    catch(e2) { return; }
  }
  meCam.recorder.ondataavailable = function(ev) { if (ev.data && ev.data.size) meCam.chunks.push(ev.data); };
  meCam.recorder.onstop = _meOnRecordingStop;
  try { meCam.recorder.start(); } catch(e) { return; }
  meCam.recording = true; meCam.recStart = Date.now();
  var ed = document.getElementById("mediaEditor"); if (ed) ed.classList.add("me-recording");
  meCam.recTimer = setInterval(_meUpdateRecTime, 200);
  meCam.maxTimer = setTimeout(function() { meStopRecording(); }, 60000); // 60 s max
}
function meStopRecording(silent) {
  clearTimeout(meCam.maxTimer); clearInterval(meCam.recTimer);
  if (!meCam.recording) return;
  meCam.recording = false;
  meCam._silent = !!silent;
  try { if (meCam.recorder && meCam.recorder.state !== "inactive") meCam.recorder.stop(); } catch(e) {}
  var ed = document.getElementById("mediaEditor"); if (ed) ed.classList.remove("me-recording");
}
function _meUpdateRecTime() {
  var el = document.getElementById("meRecTime"); if (!el) return;
  var s = Math.floor((Date.now() - meCam.recStart) / 1000);
  el.textContent = "0:" + (s < 10 ? "0" : "") + s;
}
function _meOnRecordingStop() {
  if (meCam._silent) { meCam._silent = false; return; }
  var dur = Date.now() - meCam.recStart;
  if (dur < 700 || !meCam.chunks.length) { meCapturePhoto(); return; } // appui bref → photo
  var blob = new Blob(meCam.chunks, { type: (meCam.chunks[0] && meCam.chunks[0].type) || "video/webm" });
  var r = new FileReader();
  r.onload = function() { meSetMedia(r.result, "video"); };
  r.onerror = function() { toast("Impossible d'enregistrer la vidéo"); };
  r.readAsDataURL(blob);
}

// Déclencheur : tap = photo, maintien = vidéo.
function _meBindShutter() {
  if (meCam._boundShutter) return;
  var sh = document.getElementById("meShutter"); if (!sh) return;
  meCam._boundShutter = true;
  var held = false;
  sh.addEventListener("pointerdown", function(e) {
    e.preventDefault();
    var ed = document.getElementById("mediaEditor");
    if (!ed || !ed.classList.contains("me-cam-on")) { mePickMedia(); return; }
    held = false;
    try { sh.setPointerCapture(e.pointerId); } catch(_) {}
    meCam.holdTimer = setTimeout(function() { held = true; meStartRecording(); }, 320);
  });
  function end(e) {
    if (e) { e.preventDefault(); try { sh.releasePointerCapture(e.pointerId); } catch(_) {} }
    clearTimeout(meCam.holdTimer);
    var ed = document.getElementById("mediaEditor");
    if (!ed || !ed.classList.contains("me-cam-on")) return;
    if (meCam.recording) { _meSwallowNextClick(); meStopRecording(); }
    else if (!held) { _meSwallowNextClick(); meCapturePhoto(); }
    held = false;
  }
  sh.addEventListener("pointerup", end);
  sh.addEventListener("pointercancel", function(e) { if (meCam.recording) end(e); else clearTimeout(meCam.holdTimer); });
}

function mePickMedia() { var i = document.getElementById("meMediaInput"); if (i) i.click(); }
function meCycleBg() {
  if (meState.mode === "bobine") return;
  meState.media = null; meState.mediaType = null;
  document.getElementById("meMedia").innerHTML = "";
  meState.bgIdx = (meState.bgIdx + 1) % STORY_BGS.length;
  meState.bg = STORY_BGS[meState.bgIdx];
  document.getElementById("meCanvas").style.background = meState.bg;
  document.getElementById("mePlaceholder").classList.add("hidden");
  meEnterEditPhase();
}
function _meReadFile(file) {
  return new Promise(function(res, rej) { var r = new FileReader(); r.onload = function() { res(r.result); }; r.onerror = function() { rej(r.error); }; r.readAsDataURL(file); });
}
async function meOnMedia(ev) {
  var file = ev.target.files && ev.target.files[0]; ev.target.value = "";
  if (!file) return;
  var isVideo = (file.type || "").indexOf("video/") === 0;
  if (!isVideo && (file.type || "").indexOf("image/") !== 0) { toast("Photo ou vidéo uniquement"); return; }
  // Les vidéos de galerie ne sont pas ré-encodées : on refuse celles trop
  // lourdes (un fichier de 30 Mo a rempli 1/3 du Storage en beta). 25 Mo max.
  if (isVideo && file.size > 25 * 1024 * 1024) {
    toast("Vidéo trop lourde (" + Math.round(file.size / 1048576) + " Mo). Filme directement dans l'app ou choisis une vidéo < 25 Mo.");
    return;
  }
  try {
    var dataUrl;
    if (isVideo) { dataUrl = await _meReadFile(file); }
    else { try { dataUrl = await window.passioCompressImage(file, 1280, 0.85); } catch(e) { dataUrl = await _meReadFile(file); } }
    meSetMedia(dataUrl, isVideo ? "video" : "photo");
  } catch(e) { toast("Impossible de charger ce média"); }
}
function meSetMedia(dataUrl, type) {
  meState.media = dataUrl; meState.mediaType = type;
  document.getElementById("meMedia").innerHTML = (type === "video")
    ? '<video src="' + dataUrl + '" muted playsinline loop autoplay></video>'
    : '<img src="' + dataUrl + '" alt=""/>';
  document.getElementById("mePlaceholder").classList.add("hidden");
  meEnterEditPhase();
}
function meAddText() {
  var t = prompt("Ton texte :"); if (t == null) return; t = t.trim(); if (!t) return;
  meAddOverlay({ type: "text", text: t, color: "#ffffff", x: 50, y: 45, size: 26 });
}
var ME_EMOJIS = ["🔥","😂","❤️","✨","😍","🎉","👏","🙌","💯","🎸","📸","🌍","☕","🍕","⚽","🎬","💜","😎","🥳","🤩"];
function meAddEmoji() {
  var existing = document.getElementById("meEmojiBar"); if (existing) { existing.remove(); return; }
  var bar = document.createElement("div"); bar.id = "meEmojiBar";
  bar.style.cssText = "position:fixed;left:50%;bottom:84px;transform:translateX(-50%);background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:10px;display:flex;flex-wrap:wrap;gap:4px;max-width:320px;z-index:4100;box-shadow:0 8px 24px rgba(0,0,0,0.3);";
  ME_EMOJIS.forEach(function(em) {
    var b = document.createElement("button"); b.textContent = em;
    b.style.cssText = "font-size:24px;background:none;border:none;cursor:pointer;padding:4px;";
    b.onclick = function() { meAddOverlay({ type: "emoji", emoji: em, x: 50, y: 55, size: 52 }); bar.remove(); };
    bar.appendChild(b);
  });
  document.body.appendChild(bar);
}
function meAddGif() {
  if (typeof passioGifPanel !== "function") { toast("GIF indisponible"); return; }
  passioGifPanel({ id: "meGifPanel", position: "left:50%;bottom:84px;transform:translateX(-50%);", onPick: function(url) { meAddOverlay({ type: "gif", url: url, x: 50, y: 55 }); } });
}
function meAddOverlay(ov) {
  ov.id = "ov_" + (++meState._seq);
  meState.overlays.push(ov);
  _meRenderOverlay(ov);
  meSelectOverlay(ov);
}
function meSelectOverlay(ov) {
  document.querySelectorAll("#meOverlays .me-overlay").forEach(function(e) { e.classList.remove("selected"); });
  var el = document.getElementById(ov.id); if (el) el.classList.add("selected");
}
function meRemoveOverlay(id) {
  meState.overlays = meState.overlays.filter(function(o) { return o.id !== id; });
  var el = document.getElementById(id); if (el) el.remove();
}
// Applique position (left/top) + transform (scale/rotation) et garde les
// poignées à taille constante (contre-scale).
function _meApplyTransform(el, ov) {
  var s = ov.scale || 1, r = ov.rot || 0;
  el.style.left = ov.x + "%"; el.style.top = ov.y + "%";
  el.style.transform = "translate(-50%,-50%) scale(" + s + ") rotate(" + r + "deg)";
  el.querySelectorAll(".me-ov-ctrl").forEach(function(b) { b.style.transform = "scale(" + (1 / s) + ")"; });
}
function _meRenderOverlay(ov) {
  if (ov.scale == null) ov.scale = 1;
  if (ov.rot == null) ov.rot = 0;
  var layer = document.getElementById("meOverlays");
  var el = document.createElement("div");
  el.className = "me-overlay " + ov.type; el.id = ov.id;
  var content = document.createElement("span");
  if (ov.type === "text") { content.textContent = ov.text; el.style.color = ov.color; if (ov.size) el.style.fontSize = ov.size + "px"; }
  else if (ov.type === "emoji") { content.textContent = ov.emoji; }
  else if (ov.type === "gif") { content.innerHTML = '<img src="' + ov.url + '" alt="GIF"/>'; }
  el.appendChild(content);
  var del = document.createElement("button"); del.className = "me-ov-del me-ov-ctrl"; del.textContent = "✕";
  del.onclick = function(e) { e.stopPropagation(); meRemoveOverlay(ov.id); };
  el.appendChild(del);
  var rsz = document.createElement("button"); rsz.className = "me-ov-resize me-ov-ctrl"; rsz.textContent = "⤡"; rsz.setAttribute("aria-label", "Redimensionner");
  el.appendChild(rsz);
  if (ov.type === "text") {
    el.addEventListener("dblclick", function(e) { e.stopPropagation(); var nt = prompt("Modifier le texte :", ov.text); if (nt != null && nt.trim()) { ov.text = nt.trim(); content.textContent = ov.text; } });
  }
  _meApplyTransform(el, ov);
  _meMakeInteractive(el, ov, rsz);
  layer.appendChild(el);
}
// Déplacement (1 doigt) + pincer pour redimensionner/pivoter (2 doigts)
// + poignée d'angle pour agrandir/rétrécir à la souris ou à 1 doigt.
function _meMakeInteractive(el, ov, handle) {
  var canvas = document.getElementById("meCanvas");
  var pointers = {}; var rect = null;
  var drag = null;            // { px, py, ox, oy }
  var pinch = null;           // { dist, ang, scale, rot }

  el.addEventListener("pointerdown", function(e) {
    e.preventDefault(); e.stopPropagation();
    meSelectOverlay(ov);
    rect = canvas.getBoundingClientRect();
    try { el.setPointerCapture(e.pointerId); } catch(_) {}
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 1) { drag = { px: e.clientX, py: e.clientY, ox: ov.x, oy: ov.y }; }
    else if (ids.length === 2) { drag = null; pinch = _mePinchStart(pointers, ids, ov); }
  });
  el.addEventListener("pointermove", function(e) {
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length >= 2 && pinch) {
      var p = pointers[ids[0]], q = pointers[ids[1]];
      var dist = Math.hypot(p.x - q.x, p.y - q.y) || 1;
      var ang = Math.atan2(q.y - p.y, q.x - p.x);
      ov.scale = Math.max(0.3, Math.min(5, pinch.scale * (dist / pinch.dist)));
      ov.rot = pinch.rot + (ang - pinch.ang) * 180 / Math.PI;
      _meApplyTransform(el, ov);
    } else if (drag && rect) {
      var dx = (e.clientX - drag.px) / rect.width * 100;
      var dy = (e.clientY - drag.py) / rect.height * 100;
      ov.x = Math.max(3, Math.min(97, drag.ox + dx));
      ov.y = Math.max(3, Math.min(97, drag.oy + dy));
      _meApplyTransform(el, ov);
    }
  });
  function up(e) {
    delete pointers[e.pointerId];
    try { el.releasePointerCapture(e.pointerId); } catch(_) {}
    var ids = Object.keys(pointers);
    if (ids.length === 1) { pinch = null; drag = { px: pointers[ids[0]].x, py: pointers[ids[0]].y, ox: ov.x, oy: ov.y }; }
    else if (ids.length === 0) { drag = null; pinch = null; }
  }
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);

  // Poignée d'angle : redimensionne selon la distance au centre de l'overlay.
  if (handle) {
    handle.addEventListener("pointerdown", function(e) {
      e.preventDefault(); e.stopPropagation();
      meSelectOverlay(ov);
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var startD = Math.hypot(e.clientX - cx, e.clientY - cy) || 1;
      var sScale = ov.scale || 1;
      try { handle.setPointerCapture(e.pointerId); } catch(_) {}
      function mv(ev) {
        var d = Math.hypot(ev.clientX - cx, ev.clientY - cy) || 1;
        ov.scale = Math.max(0.3, Math.min(5, sScale * (d / startD)));
        _meApplyTransform(el, ov);
      }
      function end(ev) {
        try { handle.releasePointerCapture(ev.pointerId); } catch(_) {}
        handle.removeEventListener("pointermove", mv);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
      }
      handle.addEventListener("pointermove", mv);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    });
  }
}
function _mePinchStart(pointers, ids, ov) {
  var p = pointers[ids[0]], q = pointers[ids[1]];
  return {
    dist: Math.hypot(p.x - q.x, p.y - q.y) || 1,
    ang: Math.atan2(q.y - p.y, q.x - p.x),
    scale: ov.scale || 1,
    rot: ov.rot || 0
  };
}
function _meOverlaysData() {
  return meState.overlays.map(function(o) {
    var c = { type: o.type, x: Math.round(o.x), y: Math.round(o.y), scale: +(o.scale || 1).toFixed(3), rot: Math.round(o.rot || 0) };
    if (o.type === "text") { c.text = o.text; c.color = o.color; c.size = o.size; }
    if (o.type === "emoji") { c.emoji = o.emoji; c.size = o.size; }
    if (o.type === "gif") { c.url = o.url; }
    return c;
  });
}
async function mePublish() {
  // Anti clic-fantôme : ignore une publication déclenchée dans la foulée d'une capture.
  if (meState._enteredEditAt && (Date.now() - meState._enteredEditAt) < 700) return;
  if (meState.mode === "bobine" && !meState.media) { toast("Ajoute une vidéo ou une photo pour ta bobine"); return; }
  var p = (typeof currentProfile === "function" && currentProfile()) || {};
  var authorId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  var overlays = _meOverlaysData();
  var firstText = (meState.overlays.find(function(o) { return o.type === "text"; }) || {}).text || "";
  var media = meState.media, mediaType = meState.mediaType, bg = meState.bg, mode = meState.mode;
  meClose();
  if (mode === "story") {
    var story = {
      id: "story_" + uid(), authorId: authorId,
      authorName: p.name || state.user.name || "Moi", authorEmoji: p.emoji || "✨", authorColor: p.color || "#8b5cf6",
      text: firstText, content: firstText,
      bg: media ? null : bg, media: media || null, mediaType: mediaType || null,
      overlays: overlays, emoji: p.emoji || "✨", passion: p.passion || null, createdAt: Date.now(), fromSupabase: false,
    };
    state.seed.stories = state.seed.stories || [];
    state.seed.stories.unshift(story);
    try { state.seed.users = (state.seed.users || []).filter(function(u) { return u.id !== authorId; }); state.seed.users.push({ id: authorId, name: story.authorName, profileEmoji: story.authorEmoji, avatar: story.authorColor }); } catch(e) {}
    saveState();
    if (typeof supaPublishStory === "function") supaPublishStory(story);
    try { renderStories(); } catch(e) {}
    toast("✨ Story publiée !");
  } else {
    var post = {
      id: "reel_" + uid(), authorId: authorId, profileId: state.user.currentProfileId,
      authorName: p.name || state.user.name || "Profil", authorEmoji: p.emoji || "✨", authorColor: p.color || "#8b5cf6",
      passion: p.passion || "autre", mood: "creation",
      type: (mediaType === "video") ? "video" : "photo", isReel: true,
      image: (mediaType === "photo") ? media : null, video: (mediaType === "video") ? media : null,
      text: firstText, overlays: overlays,
      createdAt: Date.now(), likes: 0, liked: false, comments: [],
    };
    state.userPosts = state.userPosts || [];
    state.userPosts.unshift(post);
    saveState();
    if (typeof supaPublishPostWithRetry === "function") supaPublishPostWithRetry(post);
    try { renderFeed(); } catch(e) {}
    setTimeout(function() { try { if (typeof openReels === "function") openReels(); } catch(e) {} }, 80);
    toast("🎬 Bobine publiée !");
  }
}

// Viewer groupé (Instagram) : un groupe = un auteur ; storyItemIdx = index de la
// story DANS le groupe courant.
let storyGroups = [];
let storyGroupIdx = 0;
let storyItemIdx = 0;
let storyTimer = null;
const STORY_DURATION = 4500;

// Ouvre le viewer sur toutes les stories d'un auteur, à la suite.
function openStoryGroup(authorId) {
  storyGroups = buildStoryGroups();
  let gi = storyGroups.findIndex(g => String(g.authorId) === String(authorId));
  if (gi < 0) gi = 0;
  openStoryViewerAt(gi, 0);
}

function openStoryViewerAt(groupIdx, itemIdx) {
  if (!storyGroups.length) storyGroups = buildStoryGroups();
  if (!storyGroups.length) return;
  // Ajouter à l'historique pour que le bouton back fonctionne
  window.history.pushState({ overlay: "story" }, "", "#story");
  storyGroupIdx = Math.max(0, Math.min(groupIdx, storyGroups.length - 1));
  storyItemIdx = itemIdx || 0;
  $("#storyViewer").classList.add("active");
  playCurrentStory();
}

// Compat : ancien appel par index plat dans state.seed.stories → ouvre le groupe.
function openStoryViewer(idx) {
  const stories = state.seed.stories || [];
  const target = stories[idx];
  if (!target) return;
  openStoryGroup(target.authorId);
}

// HTML des overlays (texte/emoji/GIF positionnés) pour les viewers story & bobine.
function _storyOverlaysHtml(overlays) {
  return (overlays || []).map(function(o) {
    var s = o.scale || 1, r = o.rot || 0;
    var tr = "transform:translate(-50%,-50%) scale(" + s + ") rotate(" + r + "deg);";
    var pos = "left:" + (o.x != null ? o.x : 50) + "%;top:" + (o.y != null ? o.y : 50) + "%;" + tr;
    if (o.type === "text") {
      return '<div class="story-ov" style="' + pos + 'color:' + (o.color || "#fff") + ';font-size:' + (o.size || 26) + 'px;font-weight:800;">' + escapeHtml(o.text || "") + '</div>';
    }
    if (o.type === "emoji") {
      return '<div class="story-ov emoji" style="' + pos + 'font-size:' + (o.size || 52) + 'px;">' + escapeHtml(o.emoji || "") + '</div>';
    }
    if (o.type === "gif") {
      return '<div class="story-ov gif" style="' + pos + '"><img src="' + escapeHtml(o.url || "") + '" alt="GIF"/></div>';
    }
    return "";
  }).join("");
}

function playCurrentStory() {
  clearInterval(storyTimer);
  const group = storyGroups[storyGroupIdx];
  if (!group) return closeStoryViewer();
  const stories = group.stories;
  if (!stories[storyItemIdx]) return closeStoryViewer();
  const s = stories[storyItemIdx];
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
  card.style.background = (s.media ? "#000" : (s.bg || "var(--grad-hero)"));

  // Couche média (photo/vidéo) si présente
  const mediaLayer = document.getElementById("storyMedia");
  if (mediaLayer) {
    if (s.media) {
      mediaLayer.innerHTML = (s.mediaType === "video")
        ? `<video src="${s.media}" muted playsinline loop autoplay></video>`
        : `<img src="${escapeHtml(s.media)}" alt="" onerror="this.style.display='none'"/>`;
    } else { mediaLayer.innerHTML = ""; }
  }

  // Overlays (texte/emoji/GIF positionnés). Si présents, ils remplacent le texte centré.
  const ovLayer = document.getElementById("storyOverlays");
  const overlays = Array.isArray(s.overlays) ? s.overlays : [];
  if (ovLayer) ovLayer.innerHTML = _storyOverlaysHtml(overlays);

  if (overlays.length) {
    $("#storyContent").innerHTML = "";
  } else {
    $("#storyContent").innerHTML = `<div style="font-size:22px;font-weight:800;line-height:1.25;white-space:pre-line;color:#ffffff;text-shadow:0 2px 10px rgba(0,0,0,0.25);">${escapeHtml(s.text || s.content || "")}</div>`;
  }

  // Progress bars
  const row = $("#storyProgressRow");
  row.innerHTML = stories.map((_, i) => `
    <div class="story-progress ${i < storyItemIdx ? "done" : ""}">
      <div class="story-progress-bar" id="sp-${i}" style="width:${i < storyItemIdx ? "100%" : "0"};"></div>
    </div>
  `).join("");

  // Mark as seen
  if (!state.user.seenStories.includes(s.id)) {
    state.user.seenStories.push(s.id);
    saveState();
  }

  // Animate current bar
  const bar = document.getElementById("sp-" + storyItemIdx);
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
  const group = storyGroups[storyGroupIdx];
  if (!group) { closeStoryViewer(); return; }
  // Story suivante du même auteur…
  if (storyItemIdx < group.stories.length - 1) {
    storyItemIdx++;
    playCurrentStory();
    return;
  }
  // …sinon on passe à l'auteur suivant…
  if (storyGroupIdx < storyGroups.length - 1) {
    storyGroupIdx++;
    storyItemIdx = 0;
    playCurrentStory();
    return;
  }
  // …sinon fin.
  closeStoryViewer();
}

function storyPrev() {
  clearInterval(storyTimer);
  // Story précédente du même auteur…
  if (storyItemIdx > 0) {
    storyItemIdx--;
    playCurrentStory();
    return;
  }
  // …sinon dernière story de l'auteur précédent…
  if (storyGroupIdx > 0) {
    storyGroupIdx--;
    const g = storyGroups[storyGroupIdx];
    storyItemIdx = g ? Math.max(0, g.stories.length - 1) : 0;
    playCurrentStory();
    return;
  }
  // …sinon on ferme.
  closeStoryViewer();
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

// Badge des messages non-lus sur l'icône Messages du topbar (déplacée depuis la
// barre du bas). Somme des `unread` de toutes les conversations.
function renderMsgBadge() {
  const dot = document.getElementById("msgDot");
  if (!dot) return;
  let n = 0;
  try { (getConversations() || []).forEach(c => { n += (c.unread || 0); }); } catch(e) {}
  dot.textContent = n > 0 ? (n > 9 ? "9+" : String(n)) : "";
}

// HTML de la liste de notifications (extrait pour pouvoir re-rendre le panneau
// en place lors d'un rafraîchissement Supabase / temps réel).
function _notifListHtml(notifs) {
  notifs = notifs || [];
  if (!notifs.length) return `
    <div class="empty">
      <div class="empty-icon">🔕</div>
      <div class="empty-title">Tout est calme</div>
      <div class="empty-text">Tu es à jour, profite.</div>
    </div>`;
  return notifs.map(n => `
    <div class="notif-row ${n.unread ? "unread" : ""}" onclick="clickNotif('${n.id}')">
      <div class="notif-icon">${n.emoji || "✨"}</div>
      <div class="notif-body">
        <div class="notif-text">${n.text}</div>
        <div class="notif-meta">${fmtTime(n.createdAt)}</div>
      </div>
      ${n.unread ? '<div class="notif-dot"></div>' : ""}
    </div>`).join("");
}

// Fusionne des notifications Supabase dans l'état local (priorité Supabase,
// dédup par id, tri par date), met à jour le badge cloche et rafraîchit le
// panneau s'il est ouvert. Utilisé au boot, à l'ouverture du panneau et en
// temps réel. Remplace la fusion qui dormait dans le code mort de supaInit.
function mergeSupaNotifs(ns) {
  if (!ns || !ns.length) return;
  // Ignorer les notifs émises par un utilisateur bloqué (modération)
  if (typeof isBlocked === "function") ns = ns.filter(n => !isBlocked(n.fromId));
  if (!ns.length) return;
  const localOnly = (state.notifications || []).filter(n => !n.fromSupabase);
  const byId = new Map();
  [...ns, ...localOnly].forEach(n => { if (n && n.id && !byId.has(n.id)) byId.set(n.id, n); });
  state.notifications = [...byId.values()]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 50);
  try { saveState(); } catch(e) {}
  try { renderBell(); } catch(e) {}
  const list = document.querySelector(".notif-list");
  if (list) list.innerHTML = _notifListHtml(state.notifications);
}

function openNotifications() {
  const notifs = state.notifications || [];
  const html = `
    <div class="modal-handle"></div>
    <div class="modal-title">🔔 Notifications</div>
    <div class="modal-subtitle">Ce qui s'est passé pendant que tu vivais ta vraie vie.</div>
    <div class="notif-list">
      ${_notifListHtml(notifs)}
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button class="btn ghost block" onclick="markAllNotifsRead()">Tout marquer lu</button>
      <button class="btn primary block" onclick="closeModal()">OK</button>
    </div>
  `;
  openModal(html);
  // Rafraîchir depuis Supabase à l'ouverture : garantit l'affichage des notifs
  // reçues même si le realtime ne les a pas livrées. La liste se met à jour en
  // place via mergeSupaNotifs (pas de réouverture de modal). Puis on remet le
  // badge à zéro (les lignes affichées gardent leur surlignage pour CETTE vue).
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID
      && typeof supaLoadNotifications === "function") {
    supaLoadNotifications()
      .then(ns => { if (ns && ns.length) mergeSupaNotifs(ns); _resetNotifBadge(); })
      .catch(() => { _resetNotifBadge(); });
  } else {
    _resetNotifBadge();
  }
}

// Remet le compteur (badge cloche) à zéro : marque toutes les notifs comme lues
// et synchronise le « seen » côté Supabase, sans re-rendre la liste affichée
// (le surlignage des nouvelles reste visible le temps de cette ouverture).
function _resetNotifBadge() {
  let changed = false;
  (state.notifications || []).forEach(n => {
    if (n.unread) {
      n.unread = false; changed = true;
      if (n.fromSupabase && typeof supaMarkNotifSeen === "function") { try { supaMarkNotifSeen(n.id); } catch (e) {} }
    }
  });
  if (changed) { try { saveState(); } catch (e) {} try { renderBell(); } catch (e) {} }
}

function markNotifRead(id) {
  const n = state.notifications.find(x => x.id === id);
  if (n) {
    n.unread = false;
    saveState();
    renderBell();
    // Re-render en place (pas de réouverture → évite un re-fetch Supabase).
    const list = document.querySelector(".notif-list");
    if (list) list.innerHTML = _notifListHtml(state.notifications);
    // Sync Supabase si c'est une notif Supabase
    if (n.fromSupabase && typeof supaMarkNotifSeen === "function") {
      supaMarkNotifSeen(id);
    }
  }
}

// Clic sur une notif (panneau OU toast) : marque lu + emmène vers le contenu.
function clickNotif(id) {
  const n = (state.notifications || []).find(x => x.id === id);
  markNotifRead(id);
  openNotifTarget(n);
}

// Navigue vers l'action d'une notification selon son type.
//  like/comment/mention/reaction → le post concerné (ref_id)
//  follow                        → le profil de l'émetteur
//  event_join                    → la fiche événement
//  message                       → la conversation
function openNotifTarget(n) {
  if (!n) return;
  try { closeModal(); } catch (e) {}
  const ref = n.refId, from = n.fromId;
  switch (n.kind) {
    case "like":
    case "comment":
    case "mention":
    case "reaction":
      if (ref && typeof openPost === "function") openPost(ref);
      break;
    case "follow":
      if ((from || ref) && typeof openUserProfile === "function") openUserProfile(from || ref);
      break;
    case "event_join":
      if (ref && typeof openEventDetails === "function") openEventDetails(ref);
      break;
    case "message":
      if (ref && typeof openConversation === "function") openConversation(ref);
      break;
    default:
      // Notif locale / type inconnu : pas de cible précise, on n'ouvre rien.
      break;
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
  try { renderMsgBadge(); } catch(e) {}
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
  // Charge le SDK Supabase à la demande (lazy, hors page verrouillée) PUIS
  // construit le vrai client, avant le moindre appel `supa.*` ci-dessous.
  try { if (typeof ensureSupabase === "function") await ensureSupabase(); } catch(e) { console.warn("Supabase SDK load failed:", e); }
  _initRealSupa();

  $("#logoTopbar").src = LOGO_SRC;
  $("#logoOnb1").src = LOGO_SRC;
  const ll = document.getElementById("logoLanding");
  if (ll) ll.src = LOGO_SRC;
  const lp = document.getElementById("pwaLogoImg");
  if (lp) lp.src = LOGO_SRC;

  state = loadState();

  // Restaure les conversations depuis le store DURABLE (IndexedDB) — toujours,
  // quel que soit le chemin de boot. Async + auto-gardé (s'exécute une seule
  // fois), fusionne sans perte avec localStorage/seed/Supabase.
  try { hydrateConvsFromIDB(); } catch(e) {}

  // Retour depuis un lien « mot de passe oublié » : l'URL contient type=recovery.
  // On affiche l'UI de nouveau mot de passe par-dessus l'écran courant.
  if ((window.location.hash || "").indexOf("type=recovery") !== -1) {
    try { if (typeof _showPasswordRecoveryUI === "function") _showPasswordRecoveryUI(); } catch(e) {}
  }

  // Vérifie si l'utilisateur est déjà connecté via Supabase Auth
  try {
    const { data: { session } } = await supa.auth.getSession();
    if (session?.user) {
      MY_UID = session.user.id;
      localStorage.setItem("passio_uid", MY_UID);
      if (localStorage.getItem("passio_oauth_pending")) localStorage.removeItem("passio_oauth_pending");
      // 🔑 Une session Supabase valide = compte réel connecté → on entre dans l'app,
      // même si le flag d'onboarding local est absent (nouvel appareil, réinstallation,
      // connexion directe par email, user_state purgé…). Sans ça, un utilisateur
      // pourtant authentifié retombait sur la landing (« ça me renvoie à la première
      // page sans me connecter »).
      // ⚠️ ORDRE IMPORTANT : on pose onboarded=true AVANT supaLoadUserState — sinon
      // la sync ré-applique l'état serveur (sauvé à onboarded=false) et écrase le flag.
      state.onboarded = true;
      try { saveState(); } catch(e) {}
      // 🔄 SYNC CROSS-APPAREIL : restaure tout l'état du compte (profils, réglages,
      // carnets, passions custom, listes…) depuis Supabase. Sur un appareil vierge
      // ça reconstitue le compte ; le profil par défaut ci-dessous ne sert plus
      // que de filet ultime si le serveur n'a vraiment rien.
      try { if (typeof supaLoadUserState === "function") await supaLoadUserState(); } catch(e) {}
      // supaLoadUserState a pu ré-appliquer un état serveur sans le flag → on le
      // re-garantit (on a une session valide, donc accès).
      state.onboarded = true;
      if (state.onboarded) {
        // Session active + déjà onboardé → accès direct à l'app
        // Crée un profil par défaut si l'utilisateur n'en a pas (connexion sans onboarding)
        if (!state.user.profiles || state.user.profiles.length === 0) {
          const defPassion = allPassions()[0];
          // 🔑 D'abord récupérer le VRAI profil déjà publié pour ce compte (table
          // profiles) : sinon on créait « Passionné » par défaut et on l'upsertait,
          // ÉCRASANT le vrai nom/emoji/couleur/photo en base (bug « ça affiche
          // Passionné »). On adopte le profil serveur s'il existe.
          let srvProf = null;
          try {
            const { data } = await supa.from("profiles").select("username,emoji,color,passion_id,avatar_url,bio").eq("id", MY_UID).maybeSingle();
            if (data && data.username) srvProf = data;
          } catch(e) {}
          const defProfile = {
            id: uid(),
            name: (srvProf && srvProf.username) || state.user.name || "Passionné",
            passion: (srvProf && srvProf.passion_id) || defPassion.id,
            emoji: (srvProf && srvProf.emoji) || defPassion.emoji,
            color: (srvProf && srvProf.color) || defPassion.color,
            bio: (srvProf && srvProf.bio) || "",
            createdAt: Date.now(),
          };
          state.user.profiles = [defProfile];
          state.user.currentProfileId = defProfile.id;
          if (srvProf) {
            state.user.general = state.user.general || {};
            if (srvProf.username) state.user.general.username = srvProf.username;
            if (srvProf.avatar_url) state.user.general.avatarPhoto = srvProf.avatar_url;
            if (!state.user.name && srvProf.username) state.user.name = srvProf.username;
          }
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
      // Lien « mot de passe oublié » → afficher l'UI de nouveau mot de passe.
      if (event === "PASSWORD_RECOVERY") {
        try { if (typeof _showPasswordRecoveryUI === "function") _showPasswordRecoveryUI(); } catch(e) {}
        return;
      }
      if (session?.user) {
        MY_UID = session.user.id;
        localStorage.setItem("passio_uid", MY_UID);
        // Retour OAuth (Google) arrivé après le boot : finaliser + recharger dans l'app.
        if (event === "SIGNED_IN" && localStorage.getItem("passio_oauth_pending")) {
          localStorage.removeItem("passio_oauth_pending");
          if (typeof state !== "undefined") { state.onboarded = true; try { saveState(); } catch(e) {} }
          setTimeout(() => { try { window.location.reload(); } catch(e) {} }, 0);
          return;
        }
        // ✅ FIX CRITIQUE : déclencher supaInit() dès qu'une session est établie
        // Sans ça, les posts Supabase ne chargent jamais sur un nouvel appareil
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          // ⚠️ setTimeout OBLIGATOIRE (piège supabase-js documenté) : le client tient
          // un verrou auth pendant l'émission de l'événement ; toute requête Supabase
          // lancée DANS le callback attend ce verrou → deadlock, et la promesse de
          // signInAnonymously()/signUp() ne résout jamais (onboarding figé sur l'auth).
          setTimeout(() => {
            try { supaInit(); } catch(e) { console.warn("supaInit on auth change:", e); }
            // v3 : garantir l'abonnement au topic user même si supaSubscribe a déjà
            // tourné avant que MY_UID soit posé (idempotent via _userTopicChan).
            if (window.PASSIO_REALTIME_V3) { try { if (typeof _subscribeUserTopic === "function") _subscribeUserTopic(); } catch(e) {} }
          }, 0);
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
// CDN optionnel devant Supabase Storage (cache au bord → soulage l'egress du
// forfait gratuit). VIDE = désactivé (URL Supabase directe, comportement actuel).
// Pour activer : déployer cloudflare/passio-cdn-worker.js puis coller ici l'URL
// du Worker SANS slash final, ex. "https://passio-cdn.toncompte.workers.dev".
// Pense à autoriser ce domaine dans la CSP (img-src/media-src). Voir docs/CDN_CLOUDFLARE.md.
const PASSIO_CDN_BASE = "";
function cdnUrl(url) {
  if (!PASSIO_CDN_BASE || typeof url !== "string" || url.indexOf("data:") === 0) return url;
  const marker = "/storage/v1/object/public/";
  const i = url.indexOf(marker);
  if (i === -1) return url;
  return PASSIO_CDN_BASE + "/" + url.slice(i + marker.length);
}
window.cdnUrl = cdnUrl;

let supa;
// Le SDK Supabase est chargé en PARESSEUX (supabase-loader.js, post-gate). Tant
// qu'il n'est pas prêt, `supa` est un stub noop : tout appel retombe dessus sans
// casser (offline-safe). Le VRAI client est construit par _initRealSupa() en tête
// de boot(), une fois ensureSupabase() résolu.
function _buildNoopSupa() {
  const _noopQ = () => ({ select: () => _noopQ(), order: () => _noopQ(), limit: () => Promise.resolve({data:[],error:null}), eq: () => _noopQ(), neq: () => _noopQ(), ilike: () => _noopQ(), gte: () => _noopQ(), in: () => _noopQ(), maybeSingle: () => Promise.resolve({data:null,error:null}), single: () => Promise.resolve({data:null,error:null}), delete: () => _noopQ(), upsert: () => Promise.resolve({error:null}), insert: () => _noopQ() });
  return {
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
supa = _buildNoopSupa();
// Exposer le client sur window : `supa` est un `let` (binding lexical) qui ne
// crée PAS de propriété window → le monitoring d'erreurs (platform.js, chargé
// avant) testait `window.supa` toujours undefined et ne loggait JAMAIS rien
// dans client_errors. (Corrigé le 2026-06-19.) Réaffecté par _initRealSupa().
window.supa = supa;

// Construit le VRAI client une fois le SDK chargé. Idempotent. Appelé en tête de
// boot() après `await ensureSupabase()`. Retourne false si le SDK est absent
// (réseau coupé) → on reste sur le stub noop, l'app fonctionne en local.
function _initRealSupa() {
  if (window._supaReal) return true;
  if (typeof supabase === "undefined") return false;
  try {
    supa = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    window.supa = supa;
    window._supaReal = true;
    return true;
  } catch(e) { console.warn("Supabase init failed:", e); return false; }
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

    // Nom public = nom du PROFIL ACTIF (persona). Mais « Passionné »/« Profil »
    // sont des sentinelles auto-générées (profil par défaut créé sans onboarding) :
    // si c'en est une, on préfère le vrai nom de compte plutôt que d'écraser en
    // base un vrai pseudo par « Passionné » (bug « ça affiche Passionné »).
    const _isDefaultName = (n) => !n || n === "Passionné" || n === "Profil";
    let _uname = prof.name;
    if (_isDefaultName(_uname)) _uname = g.username || state.user.name || _uname || "Profil";
    const profileData = {
      id: MY_UID,
      username: _uname,
      emoji: prof.emoji || "✨",
      color: prof.color || "#8b5cf6",
      passion_id: prof.passion || null,
      bio: g.bio || "",
    };
    // Photo de profil / couverture : on ne pousse en DB que des URLs Storage
    // (jamais de base64 — quota + egress). Les colonnes sont nullables : si la
    // photo n'est pas encore uploadée, on laisse `null` (l'avatar emoji reste).
    if (typeof g.avatarPhoto === "string" && /^https?:\/\//.test(g.avatarPhoto)) profileData.avatar_url = g.avatarPhoto;
    if (typeof g.coverPhoto === "string" && /^https?:\/\//.test(g.coverPhoto)) profileData.cover_url = g.coverPhoto;

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
        is_reel: !!post.isReel, // bobine → Bobines (exclu du feed)
        ...(post.overlays && post.overlays.length ? { overlays: post.overlays } : {}),
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
      cacheControl: "31536000", // 1 an : média immuable (nom unique) → cache navigateur/CDN, soulage l'egress
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
        return cdnUrl(publicUrl.publicUrl);
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
      .select("id, author_id, passion_id, mood, content, media_url, created_at, is_reel, overlays, shared_from_post_id, shared_data, profiles!author_id(username,emoji,color,avatar_url)")
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
        // ⚠️ PAS d'embed profiles(...) : post_comments n'a pas de FK vers profiles
        // en prod → 400 (commentsData restait vide → posts du feed à "0 commentaire").
        supa.from("post_comments").select("post_id, id, author_id, content, created_at").in("post_id", postIds).order("created_at", { ascending: false }).limit(200),
      ]);
      likesData = likesRes.data || [];
      commentsData = commentsRes.data || [];
    } catch(e) {}
    // Résout les auteurs des commentaires en une requête (sans embed).
    const commentProfs = await _resolveProfilesByIds((commentsData || []).map(c => c.author_id));
    return data.map((r, idx) => {
      const postLikes = likesData.filter(l => l.post_id === r.id);
      const postComments = commentsData.filter(c => c.post_id === r.id).map(c => {
        const cp = commentProfs[c.author_id] || {};
        return {
        id: c.id, authorId: c.author_id,
        authorName: cp.username || "Profil",
        authorEmoji: cp.emoji || "✨",
        text: c.content || "", content: c.content || "",
        createdAt: new Date(c.created_at + "Z").getTime(),
        fromSupabase: true,
      };});

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

      // Cache le profil de l'auteur (photo comprise) → propagation partout.
      try { if (r.profiles && r.author_id) cacheRemoteProfile({ id: r.author_id, username: r.profiles.username, emoji: r.profiles.emoji, color: r.profiles.color, avatar_url: r.profiles.avatar_url, passion_id: r.passion_id }); } catch(e) {}
      return {
        id: r.id, authorId: r.author_id,
        authorName: r.profiles?.username || "Profil",  // ✅ Doit toujours avoir un username depuis Supabase!
        authorEmoji: r.profiles?.emoji || "✨",  // ✅ Utiliser l'emoji depuis profiles
        authorColor: r.profiles?.color || "#8b5cf6",  // ✅ Utiliser la couleur depuis profiles
        authorAvatar: r.profiles?.avatar_url || null,  // 📷 Photo de profil (URL Storage) si définie
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
        isReel: !!r.is_reel, // bobine (exclu du feed, affiché dans Bobines)
        overlays: r.overlays || null,
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
async function supaAddComment(postId, content, commentId) {
  try {
    await supaUpsertProfile();
    await supa.from("post_comments").insert({
      // ⚠️ id ALIGNÉ avec le commentaire local (commentId) pour pouvoir rattacher
      // les interactions cross-compte (like/réponse/emoji) au même id partout.
      id: commentId || ("c_" + uid()), post_id: postId, author_id: MY_UID, content,
      created_at: new Date().toISOString(),
    });
  } catch(e) { console.warn("Comment error:", e); }
}

// ───────── Interactions sur les commentaires (like / réponse / emoji) ─────────
// Stockées dans comment_interactions (RLS owner) → propagées à tous les comptes.
async function supaCommentInteract(commentId, postId, kind, payload) {
  try {
    if (typeof supa === "undefined" || !supa || !MY_UID || !window._supaReal) return;
    await supa.from("comment_interactions").insert({
      id: "ci_" + uid(), comment_id: commentId, post_id: postId || null,
      user_id: MY_UID, kind: kind, payload: payload || null, created_at: new Date().toISOString(),
    });
  } catch(e) {}
}
async function supaCommentRemoveLike(commentId) {
  try {
    if (typeof supa === "undefined" || !supa || !MY_UID || !window._supaReal) return;
    await supa.from("comment_interactions").delete().eq("comment_id", commentId).eq("user_id", MY_UID).eq("kind", "like");
  } catch(e) {}
}
// Charge les interactions de plusieurs commentaires → { [cid]: {likes,likedBy,replies,emojis} }.
async function supaLoadCommentInteractions(commentIds) {
  var out = {};
  try {
    var uniq = [...new Set((commentIds || []).filter(Boolean))];
    if (!uniq.length || typeof supa === "undefined" || !supa || !window._supaReal) return out;
    var res = await supa.from("comment_interactions").select("comment_id,user_id,kind,payload,created_at").in("comment_id", uniq).order("created_at", { ascending: true });
    (res.data || []).forEach(function(r){
      var o = out[r.comment_id] || (out[r.comment_id] = { likes: 0, likedBy: [], replies: [], emojis: [] });
      if (r.kind === "like") { o.likes++; o.likedBy.push(r.user_id); }
      else if (r.kind === "reply") o.replies.push({ id: "srep_" + r.created_at, authorId: r.user_id, text: r.payload || "", createdAt: new Date(r.created_at + "Z").getTime() });
      else if (r.kind === "emoji" && r.payload) o.emojis.push(r.payload);
    });
  } catch(e) {}
  return out;
}
// Applique les interactions chargées sur les objets commentaires d'un post.
async function hydrateCommentInteractions(post) {
  try {
    if (!post || !Array.isArray(post.comments) || !post.comments.length) return;
    var ids = post.comments.map(function(c){ return c.id; });
    var map = await supaLoadCommentInteractions(ids);
    post.comments.forEach(function(c){
      var info = map[c.id]; if (!info) return;
      c.likes = info.likes || 0;
      c.likedBy = info.likedBy || [];
      c.emojis = info.emojis || [];
      // Réponses serveur (texte) — remplace la liste (source de vérité partagée).
      c.replies = (info.replies || []).slice();
    });
  } catch(e) {}
}

// Résout des profils (username/emoji/color) par ids en UNE requête, SANS embed
// PostgREST. Les tables post_comments / stories / events n'ont pas de FK
// `author_id → profiles` en prod → l'embed `profiles(...)` y renvoie 400 et la
// requête échoue (constaté le 2026-06-17 : commentaires des autres invisibles,
// 400 au boot). Retourne { [id]: {id,username,emoji,color} }.
async function _resolveProfilesByIds(ids) {
  const out = {};
  const uniq = [...new Set((ids || []).filter(Boolean))];
  if (!uniq.length) return out;
  try {
    const { data } = await supa.from("profiles").select("id,username,emoji,color,avatar_url,passion_id,bio").in("id", uniq);
    (data || []).forEach(p => { out[p.id] = p; try { cacheRemoteProfile(p); } catch(e) {} });
  } catch(e) {}
  return out;
}

async function supaLoadComments(postId) {
  try {
    const { data, error } = await supa.from("post_comments")
      .select("*")
      .eq("post_id", postId).order("created_at", { ascending: true });
    if (error) { console.warn("supaLoadComments:", error.message); return []; }
    const rows = data || [];
    const profs = await _resolveProfilesByIds(rows.map(r => r.author_id));
    return rows.map(r => {
      const p = profs[r.author_id] || {};
      return {
        id: r.id, authorId: r.author_id,
        authorName: p.username || "Passionné",
        authorEmoji: p.emoji || "✨",
        content: r.content,
        createdAt: new Date(r.created_at + "Z").getTime(),
      };
    });
  } catch(e) { return []; }
}

// ---- STORIES ----
async function supaPublishStory(story) {
  try {
    await supaUpsertProfile();
    // Uploader le média (photo/vidéo) en Storage — jamais de base64 en DB.
    var mediaUrl = null, mediaType = story.mediaType || null;
    if (story.media && typeof story.media === "string") {
      if (story.media.startsWith("data:") && typeof supaUploadMedia === "function") {
        var folder = (mediaType === "video") ? "videos" : "photos";
        try { mediaUrl = await supaUploadMedia(story.id, folder, story.media, mediaType || "photo"); } catch(e) {}
        if (mediaUrl && mediaUrl.indexOf("data:") === 0) mediaUrl = null;
        if (mediaUrl) { story.media = mediaUrl; try { saveState(); renderStories(); } catch(e) {} }
      } else if (story.media.indexOf("data:") !== 0) {
        mediaUrl = story.media;
      }
    }
    await supa.from("stories").insert({
      id: story.id || uid(), author_id: MY_UID,
      passion_id: story.passion || null,
      content: story.text || story.content || "",
      emoji: story.emoji || "✨",
      media_url: mediaUrl,
      media_type: mediaType,
      overlays: (story.overlays && story.overlays.length) ? story.overlays : null,
      created_at: new Date().toISOString(),
    });
  } catch(e) { console.warn("Story error:", e); }
}

async function supaLoadStories() {
  try {
    const since = new Date(Date.now() - 24*3600*1000).toISOString();
    const { data, error } = await supa.from("stories").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(30);
    if (error) { console.warn("supaLoadStories:", error.message); return []; }
    const rows = data || [];
    const profs = await _resolveProfilesByIds(rows.map(r => r.author_id));
    return rows.map(r => { const p = profs[r.author_id] || {}; return { id: r.id, authorId: r.author_id, authorName: p.username || "Passionné", authorEmoji: p.emoji || "✨", authorColor: p.color || "#8b5cf6", passion: r.passion_id, content: r.content || "", text: r.content || "", emoji: r.emoji || "✨", media: r.media_url || null, mediaType: r.media_type || null, overlays: r.overlays || null, fromSupabase: true }; });
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
    const { data, error } = await supa.from("events").select("*").order("created_at", { ascending: false }).limit(60);
    if (error) { console.warn("supaLoadEvents:", error.message); return []; }
    const rows = data || [];
    const profs = await _resolveProfilesByIds(rows.map(r => r.organizer_id || r.author_id));
    // Charger les vrais participants (compteurs/avatars cross-compte). Sans ça,
    // supaLoadEvents renvoyait attendees:[] → tout événement affichait "0 inscrit"
    // même si plusieurs comptes l'avaient rejoint. (Corrigé le 2026-06-18.)
    const attByEvent = {};
    if (rows.length) {
      try {
        const { data: atts } = await supa.from("event_attendees")
          .select("event_id,user_id").in("event_id", rows.map(r => r.id));
        (atts || []).forEach(a => { (attByEvent[a.event_id] = attByEvent[a.event_id] || []).push(a.user_id); });
      } catch(e) {}
    }
    return rows.map(r => ({
      id: r.id,
      authorId: r.author_id,
      organizerId: r.organizer_id || r.author_id,
      organizerName: (profs[r.organizer_id || r.author_id] || {}).username || "Passionné",
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
      attendees: attByEvent[r.id] || [],
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
      .select("id, username, emoji, color, passion_id, bio, avatar_url")
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
          photoUrl: profile.avatar_url || null, // 📷 photo de profil (Storage)
          bio: profile.bio || "",
          passions: [] // Tous les profils/passions de cet utilisateur
        };
        // Met en cache le profil distant (photo comprise) → propagation partout
        try { if (typeof cacheRemoteProfile === "function") cacheRemoteProfile({ id: profile.id, username: profile.username, emoji: profile.emoji, color: profile.color, avatar_url: profile.avatar_url, passion_id: profile.passion_id, bio: profile.bio }); } catch(e) {}
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

// Unicité des pseudos : un même pseudo ne doit jamais être porté par deux comptes
// (sinon impossible de distinguer les conversations / on a l'impression d'écrire
// au mauvais compte). Renvoie l'id du compte qui détient déjà ce pseudo (autre
// que le mien), ou null. Insensible à la casse. En cas de souci réseau → null
// (on n'empêche pas l'utilisateur de continuer hors-ligne).
async function supaUsernameTaken(name) {
  try {
    const clean = (name || "").trim();
    if (!clean || typeof supa === "undefined" || !supa || !window._supaReal) return null;
    const { data, error } = await supa.from("profiles")
      .select("id, username").ilike("username", clean).limit(10);
    if (error || !data) return null;
    const hit = data.find(p => p.id !== MY_UID && (p.username || "").trim().toLowerCase() === clean.toLowerCase());
    return hit ? hit.id : null;
  } catch(e) { return null; }
}
window.supaUsernameTaken = supaUsernameTaken;

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
      from_id: MY_UID, content: _withSenderMeta(content),
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

      // Messages de contrôle (réaction / suppression) : pas de bulle, on les marque.
      if (contentData && (contentData.type === "react" || contentData.type === "del")) {
        msg._ctrl = contentData;
      } else if (contentData) {
        // Traiter content JSON — décodage partagé avec renderConvFpThread (app-04)
        applyMsgContentData(msg, r.content);
        _diag("supaLoadMessages: contenu média appliqué - " + contentData.type);
      }

      return msg;
    });

    // S'assurer que les messages sont triés par timestamp
    messages.sort(function(a, b) { return (a.at || 0) - (b.at || 0); });

    // Rejoue les événements de contrôle (réactions / suppressions) dans l'ordre,
    // puis les exclut du fil (ils ne doivent pas s'afficher comme des bulles).
    var ctrls = messages.filter(function(m){ return m._ctrl; });
    var clean = messages.filter(function(m){ return !m._ctrl; });
    if (ctrls.length) {
      var byId = {}; clean.forEach(function(m){ byId[m.id] = m; });
      ctrls.forEach(function(m){
        var ev = m._ctrl;
        if (ev.type === "del") { var i = clean.findIndex(function(x){ return x.id === ev.target; }); if (i >= 0) { delete byId[ev.target]; clean.splice(i,1); } }
        else if (ev.type === "react" && ev.target) {
          var tm = byId[ev.target]; if (tm) { tm.reactions = tm.reactions || {}; if (ev.op === "remove") { tm.reactions[ev.emoji] = (tm.reactions[ev.emoji]||1)-1; if (tm.reactions[ev.emoji] <= 0) delete tm.reactions[ev.emoji]; } else { tm.reactions[ev.emoji] = (tm.reactions[ev.emoji]||0)+1; } }
        }
      });
    }
    _diag("supaLoadMessages: ✅ " + clean.length + " messages traités");
    return clean;
  } catch(e) {
    _diag("supaLoadMessages: EXCEPTION - " + e.message);
    console.error("supaLoadMessages exception:", e);
    return [];
  }
}

// ───────── Accusés de lecture réels (table conv_reads) ─────────
// Marque la conversation comme lue par MOI (upsert de mon last_read_at).
async function supaMarkRead(convId) {
  try {
    if (typeof supa === "undefined" || !supa || !MY_UID || !window._supaReal || !convId) return;
    await supa.from("conv_reads").upsert(
      { conv_id: convId, user_id: MY_UID, last_read_at: new Date().toISOString() },
      { onConflict: "conv_id,user_id" }
    );
  } catch(e) {}
}

// Charge l'instant de lecture des AUTRES membres → c._otherReadAt (le plus récent).
// Sert à afficher un ✓✓ fiable sur mes messages (lus si envoyés avant cet instant).
async function supaLoadOtherRead(convId) {
  try {
    if (typeof supa === "undefined" || !supa || !MY_UID || !window._supaReal || !convId) return;
    const { data } = await supa.from("conv_reads").select("user_id,last_read_at").eq("conv_id", convId).neq("user_id", MY_UID);
    if (!data || !data.length) return;
    var maxAt = 0;
    data.forEach(function(r){ var t = new Date(r.last_read_at).getTime(); if (t > maxAt) maxAt = t; });
    var c = getConversations().find(function(x){ return x.id === convId; });
    if (c && maxAt) {
      c._otherReadAt = maxAt; c._otherRead = true;
      if (window._openedConvId === convId) {
        try { var fp = document.getElementById("conv-fullpage"); renderConvFpThread(c, fp ? fp.getAttribute("data-display-name") : (c.userName||"")); } catch(e) {}
      }
    }
  } catch(e) {}
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
        supa.from("conv_messages").select("id,conv_id,from_id,content,created_at,profiles(username,emoji,color,avatar_url)")
          .eq("conv_id", cid).order("created_at", { ascending: false }).limit(5)
      )),
      Promise.all(convIds.map(cid =>
        supa.from("conv_members").select("conv_id,user_id,profiles(username,emoji,color,avatar_url)").eq("conv_id", cid)
      ))
    ]);

    const result = convs.map((c, i) => {
      // Premier message NON de contrôle (on saute les événements react/del qui ne
      // doivent pas servir d'aperçu de conversation).
      const _recent = lastMsgsAll[i]?.data || [];
      const last = _recent.find(function(mm){
        if (!mm || typeof mm.content !== "string" || mm.content.charAt(0) !== "{") return true;
        try { var t = JSON.parse(mm.content).type; return t !== "react" && t !== "del"; } catch(e) { return true; }
      }) || _recent[0];
      const members = membersAll[i]?.data || [];
      // Identifier le partenaire de façon robuste. L'embed `profiles` peut être
      // null (pas de FK résolue) et la ligne conv_members de l'autre peut manquer
      // (insert refusé un temps par la RLS) → on retombe alors sur l'expéditeur du
      // dernier message puis sur le créateur de la conv. Sans ça, userId reste ""
      // → la conv n'est PAS dédupliquée (doublons « Passionné ») et la photo manque.
      let other = members.find(m => m.user_id !== MY_UID);
      let otherId = (other && other.user_id)
        || (last && last.from_id && last.from_id !== MY_UID ? last.from_id : null)
        || (c.created_by && c.created_by !== MY_UID ? c.created_by : null)
        || "";
      // Profil du partenaire : embed members, sinon embed du dernier message.
      const otherProf = (other && other.profiles)
        || (last && last.from_id === otherId ? last.profiles : null)
        || null;
      if (otherId && otherProf && typeof cacheRemoteProfile === "function") {
        try { cacheRemoteProfile({ id: otherId, username: otherProf.username, emoji: otherProf.emoji, color: otherProf.color, avatar_url: otherProf.avatar_url }); } catch(e) {}
      }
      let lastMsg = null;
      if (last) {
        lastMsg = { id: last.id, from: last.from_id === MY_UID ? "me" : last.from_id, fromName: last.profiles?.username || "Passionné", text: last.content, at: new Date(last.created_at + "Z").getTime() };
        applyMsgContentData(lastMsg, last.content); // aperçu : "🎙 Message vocal" + sp (profil expéditeur)
      }
      // Si le dernier message reçu porte le profil/persona de l'expéditeur, il prime
      // sur la ligne `profiles` partagée pour nommer la conversation (cf. _withSenderMeta).
      const lastSp = (last && last.from_id !== MY_UID && lastMsg && lastMsg.senderProfile) ? lastMsg.senderProfile : null;
      return {
        id: c.id, isGroup: c.is_group, groupName: c.group_name,
        passion: null,
        userId: otherId,
        userEmoji: lastSp?.e || otherProf?.emoji || "✨",
        userColor: lastSp?.c || otherProf?.color || "#8b5cf6",
        userName: lastSp?.n || otherProf?.username || "Passionné",
        userPhoto: lastSp?.ph || otherProf?.avatar_url || null,
        userIds: members.map(m => m.user_id),
        lastAt: last ? new Date(last.created_at + "Z").getTime() : new Date(c.created_at + "Z").getTime(),
        unread: 0,
        messages: lastMsg ? [lastMsg] : [],
        fromSupabase: true,
      };
    });

    // Dédupliquer par userId (garder la conv la plus récente par paire). Quand
    // userId a pu être résolu, deux conversations Supabase entre les deux mêmes
    // comptes fusionnent en une seule entrée → plus de doublon dans la liste.
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
    // ⚠️ Le pseudo est contrôlé par l'utilisateur ET le texte de la notif est
    // rendu en innerHTML chez le destinataire (_notifListHtml) → on échappe le
    // pseudo ici pour éviter un XSS stocké cross-compte. `content` est statique
    // (fourni par le code appelant), donc sûr.
    const safeName = (typeof escapeHtml === "function") ? escapeHtml(prof?.name || "Quelqu'un") : (prof?.name || "Quelqu'un");
    await supa.from("notifications").insert({
      id: "n_" + uid(), user_id: toUserId,
      kind, from_id: MY_UID, ref_id: refId,
      content: `${safeName} ${content}`,
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
// Realtime v2 (canaux privés par conversation) — OPT-IN (défaut OFF).
// ⚠️ Repassé OFF par défaut le 2026-06-15 : le test 2 comptes automatisé a
// révélé une COURSE pour les conversations créées PENDANT la session — B
// s'abonne au canal privé via le handler conv_members APRÈS que A ait pu
// diffuser le 1er message (broadcasts non rejoués) → 1er message perdu. v1
// (canal global) n'a pas ce problème. v2 reste activable par device pour les
// tests : localStorage.passio_realtime_v2 = "1". Correctif robuste prévu =
// topic privé PAR UTILISATEUR (`user:<uid>`, abonné une fois au boot, le
// trigger diffuse à chaque membre) → plus de course. Voir docs/SCALE_RUNBOOK.
window.PASSIO_REALTIME_V2 = (function(){
  if (typeof window.PASSIO_REALTIME_V2 === "boolean") return window.PASSIO_REALTIME_V2;
  try {
    var v = localStorage.getItem("passio_realtime_v2");
    if (v === "1") return true;
    if (v === "0") return false;
  } catch(e){}
  return false; // défaut : v1 (fiable) pour tout le monde
})();

// Realtime v3 (DESIGN DÉFINITIF, scalable + sans course) — ACTIVÉ PAR DÉFAUT
// depuis le 2026-06-15 : un seul canal privé PAR UTILISATEUR (`user:<MY_UID>`),
// abonné une fois au boot. Le trigger SQL (migration_realtime_user_topic.sql,
// appliquée en prod) diffuse chaque message au topic perso de CHAQUE membre.
// Pas de course (topic stable), chaque client ne reçoit que ses messages.
// Validé par test 2 comptes (PASSIO_E2E_RT=v3, vert). Quand v3 est ON, il a
// priorité sur v2/v1. Soupape par device : localStorage.passio_realtime_v3="0"
// → revient à v1 (canal global). v2 reste accessible via passio_realtime_v2="1".
window.PASSIO_REALTIME_V3 = (function(){
  if (typeof window.PASSIO_REALTIME_V3 === "boolean") return window.PASSIO_REALTIME_V3;
  try {
    var v = localStorage.getItem("passio_realtime_v3");
    if (v === "1") return true;
    if (v === "0") return false;
  } catch(e){}
  return true; // défaut : v3 (scalable) pour tout le monde
})();

// Traitement d'un message entrant (factorisé : utilisé par le canal global v1
// ET par les canaux privés v2). `r` = ligne conv_messages (payload.new ou
// payload.record selon la source).
async function _handleIncomingConvMessage(r) {
  if (!r || !r.conv_id) return;
  if (r.from_id === MY_UID) return; // nos propres messages sont déjà dans l'UI (optimistic)
  if (typeof isBlocked === "function" && isBlocked(r.from_id)) return; // expéditeur bloqué (modération)

  // Messages de contrôle (pas de bulle) : suppression « pour tous » et réactions.
  try {
    if (r.content && typeof r.content === "string" && r.content.charAt(0) === "{") {
      var _dd = JSON.parse(r.content);
      if (_dd && (_dd.type === "del" || _dd.type === "react") && _dd.target) {
        var _cv = getConversations().find(function(x){ return x.id === r.conv_id || (!x.isGroup && x.userId === r.from_id); });
        if (_cv && _cv.messages) {
          if (_dd.type === "del") {
            _cv.messages = _cv.messages.filter(function(x){ return x.id !== _dd.target; });
          } else if (typeof _applyReactionEvent === "function") {
            _applyReactionEvent(_cv, _dd); // applique la réaction de l'autre
          }
          conversationsState = getConversations();
          saveConversations();
          try { if (window._openedConvId === (_cv.id) || window._openedConvId === r.conv_id) { var fp = document.getElementById("conv-fullpage"); renderConvFpThread(_cv, fp ? fp.getAttribute("data-display-name") : (_cv.userName||"")); } } catch(e) {}
          try { renderMessages(); } catch(e) {}
        }
        return;
      }
    }
  } catch(e) {}

  var convs = getConversations();
  var conv = convs.find(c => c.id === r.conv_id);

  // La déduplication (1 conv par paire) peut avoir fusionné CETTE conv_id dans une
  // autre entrée ayant le même partenaire → l'entrée locale a un id différent de
  // r.conv_id. Sans ce repli, le message entrant déclencherait une « nouvelle conv »
  // en double, voire serait perdu côté affichage. On route donc par partenaire.
  if (!conv && r.from_id) {
    conv = convs.find(c => !c.isGroup && c.userId === r.from_id);
  }

  if (!conv) {
    // Nouvelle conv inconnue → vérifier membership Supabase puis créer localement
    try {
      const { data: membership } = await supa.from("conv_members")
        .select("conv_id").eq("conv_id", r.conv_id).eq("user_id", MY_UID).maybeSingle();
      if (!membership) return; // pas membre → ignorer
      const { data: convData } = await supa.from("conversations").select("*").eq("id", r.conv_id).maybeSingle();
      const { data: members } = await supa.from("conv_members")
        .select("user_id, profiles(username,emoji,color,avatar_url)").eq("conv_id", r.conv_id);
      const other = (members || []).find(m => m.user_id !== MY_UID);
      if (other?.profiles) {
        _profileCache.set(other.user_id, { username: other.profiles.username, emoji: other.profiles.emoji || "✨", color: other.profiles.color || "#8b5cf6", photoUrl: other.profiles.avatar_url || null });
        try { if (typeof cacheRemoteProfile === "function") cacheRemoteProfile({ id: other.user_id, username: other.profiles.username, emoji: other.profiles.emoji, color: other.profiles.color, avatar_url: other.profiles.avatar_url }); } catch(e) {}
      }
      conv = {
        id: r.conv_id, isGroup: convData?.is_group || false, groupName: convData?.group_name || null,
        passion: null, userId: other?.user_id || r.from_id,
        userEmoji: other?.profiles?.emoji || "✨", userColor: other?.profiles?.color || "#8b5cf6",
        userName: other?.profiles?.username || "Passionné",
        userPhoto: other?.profiles?.avatar_url || null,
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
  applyMsgContentData(newMsg, r.content); // décode gif/media/audio/doc/location (+ sp = profil expéditeur)

  // DM : refléter le profil/persona réellement utilisé par l'expéditeur (l'en-tête
  // et la liste affichent c.userName, pas le nom par message). Sans ça, on verrait
  // le nom de la ligne `profiles` partagée au lieu du profil d'envoi (« ben123 »).
  if (!conv.isGroup && newMsg.senderProfile) {
    if (newMsg.senderProfile.n) conv.userName = newMsg.senderProfile.n;
    if (newMsg.senderProfile.e) conv.userEmoji = newMsg.senderProfile.e;
    if (newMsg.senderProfile.c) conv.userColor = newMsg.senderProfile.c;
    if (newMsg.senderProfile.ph) conv.userPhoto = newMsg.senderProfile.ph;
  }

  if (!conv.messages) conv.messages = [];
  if (conv.messages.find(m => m.id === r.id)) return; // déjà présent (dedup)
  conv.messages.push(newMsg);
  conv.messages.sort((a, b) => (a.at || 0) - (b.at || 0));
  conv.lastAt = msgAt;

  // Conv ouverte : soit l'id serveur, soit l'entrée locale fusionnée (id ≠ r.conv_id).
  const isConvOpen = window._openedConvId === r.conv_id || window._openedConvId === conv.id;
  if (isConvOpen) {
    // Je lis le message en direct → marque MA lecture côté serveur (accusés réels).
    try { if (typeof supaMarkRead === "function") supaMarkRead(conv.id); } catch(e) {}
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
  try { renderMsgBadge(); } catch(e) {}
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

// v3 : s'abonne UNE fois au topic privé de l'utilisateur (`user:<MY_UID>`).
// Reçoit tous ses messages (le trigger diffuse à chaque membre). Idempotent.
function _subscribeUserTopic() {
  if (typeof supa === "undefined" || !supa || !MY_UID || window._userTopicChan) return;
  window._userTopicChan = supa.channel("user:" + MY_UID, { config: { private: true } })
    .on("broadcast", { event: "INSERT" }, function(msg) {
      var p = msg && msg.payload;
      var r = p && (p.record || p.new || p);
      if (r && r.conv_id) _handleIncomingConvMessage(r);
    })
    .subscribe();
}
window._subscribeUserTopic = _subscribeUserTopic;
// ════════════════════════════════════════════════════════════════════════

function supaSubscribe() {
  // Garde anti double-abonnement : supaInit peut être appelé par boot() ET par
  // onAuthStateChange — un seul jeu de canaux realtime doit exister.
  if (window._supaSubscribed) return;
  window._supaSubscribed = true;
  // ── Réception des messages entrants ──
  if (window.PASSIO_REALTIME_V3) {
    // v3 (design définitif) : UN canal privé par utilisateur, abonné une fois.
    // Scalable + aucune course. Nécessite migration_realtime_user_topic.sql.
    _subscribeUserTopic();
  } else if (window.PASSIO_REALTIME_V2) {
    // v2 (expérimental) : un canal PRIVÉ par conversation (course sur conv créée
    // en session — voir SCALE_RUNBOOK). Nécessite migration_realtime_authorization.
    (getConversations() || []).forEach(function(c) { if (c && c.id) _subscribePrivateConv(c.id); });
  } else {
    // v1 (défaut) : canal global, filtrage d'appartenance côté client (_handleIncomingConvMessage).
    supa.channel("realtime:my_messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conv_messages" }, function(payload) {
        _handleIncomingConvMessage(payload.new);
      })
      .subscribe();
  }

  // ── Accusés de lecture : un autre membre a lu → met à jour le ✓✓ en direct ──
  supa.channel("realtime:conv_reads")
    .on("postgres_changes", { event: "*", schema: "public", table: "conv_reads" }, function(payload) {
      var r = payload.new; if (!r || r.user_id === MY_UID) return;
      var c = getConversations().find(function(x){ return x.id === r.conv_id || (!x.isGroup && x.userId === r.user_id); });
      if (!c) return;
      var t = new Date(r.last_read_at).getTime();
      if (t > (c._otherReadAt || 0)) {
        c._otherReadAt = t; c._otherRead = true;
        if (window._openedConvId === c.id || window._openedConvId === r.conv_id) {
          try { var fp = document.getElementById("conv-fullpage"); renderConvFpThread(c, fp ? fp.getAttribute("data-display-name") : (c.userName||"")); } catch(e) {}
        }
      }
    })
    .subscribe();

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
        const { data: convData } = await supa.from("conversations").select("*").eq("id", convId).maybeSingle();
        const { data: members } = await supa.from("conv_members")
          .select("user_id, profiles(username,emoji,color,avatar_url)").eq("conv_id", convId);
        const other = (members || []).find(m => m.user_id !== MY_UID);
        // Repli sur le créateur de la conv si l'autre membre n'est pas (encore)
        // lisible → userId résolu → la dédup par paire opère et il n'y a pas de
        // doublon « Passionné » sans photo. (cf. supaLoadMyConversations)
        const otherId = (other && other.user_id)
          || (convData?.created_by && convData.created_by !== MY_UID ? convData.created_by : "")
          || "";
        if (other?.profiles && typeof cacheRemoteProfile === "function") {
          try { cacheRemoteProfile({ id: other.user_id, username: other.profiles.username, emoji: other.profiles.emoji, color: other.profiles.color, avatar_url: other.profiles.avatar_url }); } catch(e) {}
        }
        const newConv = {
          id: convId,
          isGroup: convData?.is_group || false,
          groupName: convData?.group_name || null,
          passion: null,
          userId: otherId,
          userEmoji: other?.profiles?.emoji || "✨",
          userColor: other?.profiles?.color || "#8b5cf6",
          userName: other?.profiles?.username || "Passionné",
          userPhoto: other?.profiles?.avatar_url || null,
          userIds: (members || []).map(m => m.user_id),
          lastAt: new Date(convData?.created_at || Date.now()).getTime(),
          unread: 0,
          messages: [],
          fromSupabase: true,
        };
        conversationsState = deduplicateConversations([newConv, ...getConversations()]);
        saveConversations();
        if (window.PASSIO_REALTIME_V2 && window._subscribePrivateConv) window._subscribePrivateConv(convId);
        // Backfill (v2) : en s'abonnant au canal privé d'une conv créée PENDANT la
        // session, on peut manquer les messages déjà diffusés avant que l'abonnement
        // soit actif (broadcasts non rejoués). On recharge donc l'historique depuis
        // la base pour combler la course. (En v1, le canal global les attrapait.)
        if (window.PASSIO_REALTIME_V2 && typeof supaLoadMessages === "function") {
          try {
            const msgs = await supaLoadMessages(convId);
            if (msgs && msgs.length) {
              const cc = getConversations().find(x => x.id === convId);
              if (cc) {
                cc.messages = msgs;
                cc.lastAt = (msgs[msgs.length - 1] && msgs[msgs.length - 1].at) || cc.lastAt;
                if (window._openedConvId !== convId) cc.unread = msgs.filter(m => m.from !== "me").length;
                conversationsState = deduplicateConversations(getConversations());
                saveConversations();
              }
            }
          } catch(e) {}
        }
        try { renderMessages(); } catch(e) {}
      } catch(e) {}
    })
    .subscribe();

  // ── Mises à jour de profil en temps réel (photo/pseudo/emoji/couleur) ──
  // Quand un utilisateur change sa photo de profil ou son pseudo, on rafraîchit
  // le cache local (state.seed.users) → son avatar se met à jour PARTOUT à
  // l'écran (fil, commentaires, messages) sans rechargement.
  supa.channel("realtime:profiles")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, payload => {
      try {
        const p = payload.new;
        if (!p || !p.id || p.id === MY_UID) return;
        cacheRemoteProfile(p);
        // Re-rendre les surfaces visibles (léger, idempotent).
        try { if (typeof renderFeed === "function") renderFeed(); } catch(e) {}
        try { if (typeof renderMessages === "function") renderMessages(); } catch(e) {}
      } catch(e) {}
    })
    .subscribe();

  // Nouveaux posts en temps reel
  supa.channel("realtime:posts")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, async payload => {
      const r = payload.new;
      if (r.author_id === MY_UID) return;
      try {
        const { data: prof } = await supa.from("profiles").select("username,emoji,color").eq("id", r.author_id).maybeSingle();
        const _mu = (r.media_url || "").toLowerCase();
        const _isVid = _mu.includes(".mp4") || _mu.includes("videos/");
        const newPost = { id: r.id, authorId: r.author_id, authorName: prof?.username || "Passionne", authorEmoji: prof?.emoji || "✨", authorColor: prof?.color || "#8b5cf6", passion: r.passion_id || "autre", mood: r.mood || "all", type: _isVid ? "video" : "text", text: r.content || "", image: _isVid ? null : (r.media_url || null), video: _isVid ? r.media_url : null, isReel: !!r.is_reel, overlays: r.overlays || null, createdAt: new Date(r.created_at + "Z").getTime(), likes: 0, liked: false, comments: [], fromSupabase: true };
        // ✅ Ajouter dans state.supabasePosts, pas state.seed.posts!
        if (!state.supabasePosts.find(p => p.id === newPost.id)) {
          state.supabasePosts.unshift(newPost);
          console.log("📥 Post reçu en realtime:", newPost.authorName, newPost.isReel ? "(bobine)" : "");
          try { renderFeed(); } catch(e) {}
          if (newPost.isReel && reelsState && reelsState.open) { try { /* viewer ouvert : laisser l'utilisateur rafraîchir */ } catch(e) {} }
        }
      } catch(e) {}
    })
    .subscribe();

  // Likes en temps reel
  supa.channel("realtime:likes")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_likes" }, payload => {
      const r = payload.new;
      const post = findPostAnywhere(r.post_id);
      if (post) { post.likes = (post.likes || 0) + 1; try { renderFeed(); } catch(e) {} }
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "post_likes" }, payload => {
      const r = payload.old;
      const post = findPostAnywhere(r.post_id);
      if (post) { post.likes = Math.max(0, (post.likes || 1) - 1); try { renderFeed(); } catch(e) {} }
    })
    .subscribe();

  // ── Notifications entrantes (like, comment, follow…) en temps réel ──
  // 🔧 FIX 2026-06-17 : il n'existait AUCUN canal realtime sur la table
  // notifications → les notifs n'arrivaient jamais en direct. La table est dans
  // la publication supabase_realtime (cf. migrations). mergeSupaNotifs gère
  // badge + panneau ouvert + dédup.
  supa.channel("realtime:notifications")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, payload => {
      const r = payload.new;
      if (!r || r.user_id !== MY_UID) return; // pas pour moi
      const notif = {
        id: r.id, kind: r.kind, fromId: r.from_id, refId: r.ref_id,
        text: r.content || "", emoji: _notifEmoji(r.kind),
        createdAt: new Date((r.created_at || "") + "Z").getTime() || Date.now(),
        unread: !r.seen, fromSupabase: true,
      };
      if ((state.notifications || []).some(n => n.id === notif.id)) return;
      mergeSupaNotifs([notif]);
      // Toast cliquable → emmène vers le contenu de la notif.
      try { toast(notif.text || "Nouvelle notification", "info", () => { markNotifRead(notif.id); openNotifTarget(notif); }); } catch(e) {}
    })
    .subscribe();

  // Commentaires en temps reel
  supa.channel("realtime:comments")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_comments" }, async payload => {
      const r = payload.new;
      if (r.author_id === MY_UID) return;
      try {
        const post = findPostAnywhere(r.post_id);
        if (post) {
          const { data: prof } = await supa.from("profiles").select("username,emoji").eq("id", r.author_id).maybeSingle();
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
    // Notifier la personne suivie (un suivi est une interaction qui doit
    // apparaître dans ses notifications).
    if (targetId && targetId !== MY_UID && typeof supaInsertNotif === "function") {
      supaInsertNotif(targetId, "follow", MY_UID, "a commencé à te suivre");
    }
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

// ---- MODÉRATION : BLOCAGE / SIGNALEMENT ----
async function supaBlockUser(targetId) {
  try {
    await supa.from("blocks").insert({ blocker_id: MY_UID, blocked_id: targetId, created_at: new Date().toISOString() });
  } catch(e) {}
}
async function supaUnblockUser(targetId) {
  try {
    await supa.from("blocks").delete().eq("blocker_id", MY_UID).eq("blocked_id", targetId);
  } catch(e) {}
}
async function supaLoadBlocks() {
  try {
    const { data } = await supa.from("blocks").select("blocked_id").eq("blocker_id", MY_UID);
    return (data || []).map(r => r.blocked_id);
  } catch(e) { return []; }
}
async function supaReport(targetType, targetId, reason) {
  try {
    await supa.from("reports").insert({
      id: "r_" + uid(), reporter_id: MY_UID || null,
      target_type: targetType, target_id: String(targetId || ""),
      reason: String(reason || "").slice(0, 500), created_at: new Date().toISOString(),
    });
  } catch(e) {}
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
// Emoji d'une notif dérivé de son `kind` (pas de jointure profiles : voir
// supaLoadNotifications).
function _notifEmoji(kind) {
  return ({ like: "❤️", comment: "💬", follow: "➕", message: "✉️", mention: "📣", reaction: "😊", event_join: "🤝" })[kind] || "✨";
}

async function supaLoadNotifications() {
  try {
    // ⚠️ NE PAS faire `.select("*, profiles!from_id(...)")` : `notifications.from_id`
    // est une simple colonne TEXT SANS FK vers profiles (cf. supabase_tables.sql)
    // → PostgREST renvoie 400 sur l'embed et la requête échoue toujours en prod.
    // (Bug constaté le 2026-06-17 par le test 2 comptes : 0 notif chargée.) On
    // dérive l'emoji du kind ; le nom de l'émetteur est déjà dans `content`.
    const { data, error } = await supa.from("notifications")
      .select("*")
      .eq("user_id", MY_UID)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) { console.warn("supaLoadNotifications:", error.message); return []; }
    return (data || []).map(r => ({
      id: r.id, kind: r.kind, fromId: r.from_id, refId: r.ref_id,
      text: r.content || "",
      emoji: _notifEmoji(r.kind),
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

    // 0. SYNC CROSS-APPAREIL : restaure l'\u00e9tat du compte si le serveur en a un
    // plus r\u00e9cent (couvre le chemin onAuthStateChange/SIGNED_IN apr\u00e8s le boot).
    try {
      if (typeof supaLoadUserState === "function") {
        const restored = await supaLoadUserState();
        if (restored) { try { renderEverything(); } catch(e) {} }
      }
    } catch(e) {}

    // 0bis. PROFIL STABLE PAR COMPTE/EMAIL : la ligne `profiles` (cl\u00e9 = uid du
    // compte mail) fait FOI. \u00c0 chaque connexion, l'appareil ADOPTE le nom/emoji/
    // couleur/photo du serveur au lieu de republier le nom local \u2014 sinon le nom
    // d\u00e9rivait d'un appareil \u00e0 l'autre (profil local diff\u00e9rent \u2192 \u00e9crasement).
    // Le nom ne change QUE via \u00ab Modifier le profil \u00bb (saveMainProfile, explicite).
    // S'il n'y a pas encore de profil serveur (compte neuf), on publie le local
    // (cr\u00e9ation de la ligne \u2192 d\u00e9couvrable dans la recherche + FK conversations).
    try {
      const { data: srv } = await supa.from("profiles")
        .select("username,emoji,color,avatar_url,passion_id,bio").eq("id", MY_UID).maybeSingle();
      const cp = (typeof currentProfile === "function") ? currentProfile() : null;
      if (srv && srv.username && cp) {
        cp.name = srv.username;
        if (srv.emoji) cp.emoji = srv.emoji;
        if (srv.color) cp.color = srv.color;
        if (srv.passion_id) cp.passion = srv.passion_id;
        state.user.general = state.user.general || {};
        state.user.general.username = srv.username;
        if (srv.avatar_url) state.user.general.avatarPhoto = srv.avatar_url;
        if (!state.user.name) state.user.name = srv.username;
        try { if (typeof cacheRemoteProfile === "function") cacheRemoteProfile({ id: MY_UID, username: srv.username, emoji: srv.emoji, color: srv.color, avatar_url: srv.avatar_url, passion_id: srv.passion_id }); } catch(e) {}
        try { saveState(); } catch(e) {}
        try { if (typeof renderTopbar === "function") renderTopbar(); } catch(e) {}
        try { if (typeof renderMainProfile === "function") renderMainProfile(); } catch(e) {}
      } else {
        // Pas de profil serveur encore \u2192 publier le profil local (cr\u00e9ation).
        await supaUpsertProfile();
      }
    } catch(e) { try { await supaUpsertProfile(); } catch(_e) {} }

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
      // \ud83d\udd27 FIX 2026-06-17 : les notifications Supabase n'\u00e9taient charg\u00e9es que dans
      // le code mort apr\u00e8s le `return;` plus bas \u2192 la cloche n'affichait JAMAIS
      // les notifs re\u00e7ues d'autres comptes. On les charge ici (chemin vivant).
      if (typeof supaLoadNotifications === "function")
        supaLoadNotifications().then(ns => { if (ns && ns.length) mergeSupaNotifs(ns); }).catch(e => {});
      // Liste de blocage (modération) : fusion avec le cache local.
      if (typeof supaLoadBlocks === "function")
        supaLoadBlocks().then(bl => {
          if (bl && bl.length) {
            state.user.blocked = [...new Set([...(state.user.blocked || []), ...bl])];
            try { saveState(); } catch(e) {}
            try { if (typeof renderFeed === "function") renderFeed(); } catch(e) {}
          }
        }).catch(e => {});
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
    // Renvoie les messages rest\u00e9s en file d'attente (\u00e9chec/hors-ligne) d'une session pr\u00e9c\u00e9dente.
    try { if (typeof _flushOutbox === "function") setTimeout(_flushOutbox, 1500); } catch(e) {}
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
