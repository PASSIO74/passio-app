function copyReelLink(postId, encodedUrl) {
  const url = decodeURIComponent(encodedUrl);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      toast("🔗 Lien copié!");
      closeModal();
    });
  } else {
    toast("Copie impossible sur ce navigateur");
  }
}

function shareReelVia(platform, postId, encodedUrl, encodedText) {
  const url = decodeURIComponent(encodedUrl);
  const text = decodeURIComponent(encodedText);
  let shareUrl;

  switch(platform) {
    case "whatsapp":
      shareUrl = `https://wa.me/?text=${encodedText}%20${encodedUrl}`;
      break;
    case "twitter":
      shareUrl = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
      break;
    case "facebook":
      shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
      break;
    case "telegram":
      shareUrl = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;
      break;
    default:
      return;
  }

  window.open(shareUrl, "_blank", "width=600,height=400");
  toast(`Ouverture ${platform}...`);
  closeModal();
}

function shareReelEmail(postId, encodedText) {
  const reel = findPostAnywhere(postId);
  if (!reel) return;

  const url = `${location.origin}${location.pathname}#reel=${encodeURIComponent(postId)}`;
  const author = authorOfReel(reel);
  const passion = passionById(reel.passion) || { label: reel.passion, emoji: "✨" };
  const text = reel.text || reel.caption || "";

  const subject = encodeURIComponent(`Regarde cette bobine PASSIO de ${author.name}!`);
  const body = encodeURIComponent(`Salut!\n\nJe viens de découvrir cette super bobine sur PASSIO:\n\n${passion.emoji} ${author.name} – ${passion.label}\n"${text.slice(0, 150)}${text.length > 150 ? "…" : ""}"\n\nViens la voir ici: ${url}\n\nPASSIO - Partage tes passions!`);

  const mailtoLink = `mailto:?subject=${subject}&body=${body}`;
  window.location.href = mailtoLink;
  toast("📧 Ouverture de ton client email...");
  closeModal();
}

function shareReelSMS(postId, encodedUrl) {
  const url = decodeURIComponent(encodedUrl);
  const reel = findPostAnywhere(postId);
  if (!reel) return;

  const text = reel.text || reel.caption || "";
  const smsBody = encodeURIComponent(`Regarde cette bobine PASSIO: ${text.slice(0, 30)}... ${url}`);
  const smsLink = `sms:?body=${smsBody}`;
  window.location.href = smsLink;
  toast("📱 Ouverture SMS...");
  closeModal();
}

function scrollToReel(idx) {
  const list = document.getElementById("reelsList");
  if (!list) return;
  const items = list.querySelectorAll(".reel-item");
  if (!items.length) return;
  const target = Math.max(0, Math.min(idx, items.length - 1));
  const el = items[target];
  if (el && el.scrollIntoView) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  updateReelsNavState(target);
}

function nextReel() {
  if (!reelsState.open) return;
  scrollToReel(reelsState.current + 1);
}

function prevReel() {
  if (!reelsState.open) return;
  scrollToReel(reelsState.current - 1);
}

function updateReelsNavState(idx) {
  const total = reelsState.items.length;
  const prev = document.getElementById("reelsPrevBtn");
  const next = document.getElementById("reelsNextBtn");
  if (prev) prev.classList.toggle("disabled", idx <= 0);
  if (next) next.classList.toggle("disabled", idx >= total - 1);
}

// Navigation clavier (flèches + Échap)
document.addEventListener("keydown", (e) => {
  if (!reelsState.open) {
    return;
  }
  if (e.key === "Escape") { closeReels(); return; }
  if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
    e.preventDefault();
    nextReel();
  } else if (e.key === "ArrowUp" || e.key === "PageUp") {
    e.preventDefault();
    prevReel();
  }
});

// ======== PROFILES ========
function renderMainProfile() {
  var g = state.user.general || {};
  var cur = currentProfile();
  var avatarEl = document.getElementById("mainProfileAvatar");
  var usernameEl = document.getElementById("mainProfileUsername");
  var bioEl = document.getElementById("mainProfileBio");
  var rsEl = document.getElementById("mainProfileRs");
  if (!avatarEl) return;

  var cover = document.getElementById("mainProfileCover");
  if (cover) {
    cover.style.background = g.coverPhoto ? "url(" + g.coverPhoto + ") center/cover" : "linear-gradient(135deg, #8b5cf6, #6d28d9)";
  }

  if (g.avatarPhoto) {
    avatarEl.style.backgroundImage = "url(" + g.avatarPhoto + ")";
    avatarEl.style.backgroundSize = "cover";
    avatarEl.style.backgroundPosition = "center";
    avatarEl.innerHTML = '<div class="main-profile-avatar-badge">📷</div><input type="file" id="avatarPhotoInput" accept="image/*" style="display:none;" onchange="changeAvatarPhoto(event)"/>';
  } else {
    avatarEl.style.backgroundImage = "";
    avatarEl.innerHTML = (g.emoji || (cur ? cur.emoji : "✨")) + '<div class="main-profile-avatar-badge">📷</div><input type="file" id="avatarPhotoInput" accept="image/*" style="display:none;" onchange="changeAvatarPhoto(event)"/>';
  }

  usernameEl.textContent = g.username || state.user.name || "Mon profil";
  // Bio : afficher seulement si renseignée (sinon rien, pas de placeholder)
  bioEl.textContent = g.bio || "";
  bioEl.style.display = g.bio ? "" : "none";

  var RS_ICONS = { instagram:"📸", facebook:"👤", tiktok:"🎵", youtube:"▶️", twitter:"𝕏", linkedin:"💼", snapchat:"👻", autre:"🔗" };
  var links = g.rsLinks || [];
  // Réseaux sociaux : afficher seulement s'il y en a (sinon rien)
  rsEl.innerHTML = links.length
    ? links.map(function(l) { return '<a class="main-profile-rs-link" href="' + escapeHtml(l.url) + '" target="_blank">' + (RS_ICONS[l.platform]||"🔗") + " " + escapeHtml(l.platform) + '</a>'; }).join("")
    : "";
  rsEl.style.display = links.length ? "" : "none";

  // Pastille étoiles : indicateur discret de points + rang (clic → Wallet pour
  // le détail). Remis à la demande de l'utilisateur, version sobre et intuitive.
  var starsScoreEl = document.getElementById("profileStarsScore");
  var starsRankEl  = document.getElementById("profileStarsRank");
  if (starsScoreEl && starsRankEl) {
    var _score = state.user.score || 0;
    var _rank  = (typeof rankOf === "function") ? rankOf(_score) : { label: "Débutant" };
    starsScoreEl.textContent = _score;
    starsRankEl.textContent  = _rank.label;
    var chip = document.getElementById("mainProfileStars");
    if (chip) chip.title = _rank.next ? ("Plus que " + Math.max(0, _rank.next - _score) + " pts avant « " + (rankOf(_rank.next).label) + " »") : "Rang maximum atteint 🏆";
  }

  var postCount = state.userPosts.length;
  document.getElementById("mainStatPosts").textContent = postCount;
  var ppEl = document.getElementById("topPassia"); if (ppEl) ppEl.textContent = state.user.passia || 0;
  // Abonnements : vraie donnée locale (les gens que je suis)
  var foEl = document.getElementById("mainStatFollowing"); if (foEl) foEl.textContent = (state.user.following || []).length;
  // Abonnés : vrai compte Supabase (async). Affiche le cache en attendant.
  var fEl = document.getElementById("mainStatFollowers"); if (fEl) fEl.textContent = (typeof window._followersCount === "number" ? window._followersCount : 0);
  loadFollowersCount();

  // Events
  var eventsEl = document.getElementById("profileEvents");
  if (eventsEl) {
    var events = (state.seed.events||[]).slice(0,3);
    eventsEl.innerHTML = events.length ? events.map(function(e) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;margin-bottom:6px;"><span style="font-size:20px;">'+(e.emoji||"📍")+'</span><div style="flex:1;"><div style="font-weight:700;font-size:12px;">'+escapeHtml(e.title||"Événement")+'</div><div style="font-size:10px;color:var(--muted);">'+escapeHtml(e.city||"")+'</div></div></div>';
    }).join("") : '<div style="font-size:12px;color:var(--muted);padding:10px;">Aucun événement</div>';
  }

  // Top posts
  var topEl = document.getElementById("profileTopPosts");
  if (topEl) {
    var top = state.userPosts.slice().sort(function(a,b){return(b.likes||0)-(a.likes||0);}).slice(0,3);
    topEl.innerHTML = top.length ? top.map(function(p){return renderPostHTML(Object.assign({},p,{_source:"me"}));}).join("") : '<div style="font-size:12px;color:var(--muted);padding:10px;">Publie ton premier post !</div>';
  }
}

// ===== STATS PROFIL CLIQUABLES (posts / abonnés / abonnements) =====

// Charge le vrai nombre d'abonnés depuis Supabase (follows.following_id = MY_UID)
async function loadFollowersCount() {
  if (typeof supa === "undefined" || !supa || typeof MY_UID === "undefined" || !MY_UID) return;
  try {
    const { count } = await supa.from("follows").select("*", { count: "exact", head: true }).eq("following_id", MY_UID);
    window._followersCount = count || 0;
    var fEl = document.getElementById("mainStatFollowers");
    if (fEl) fEl.textContent = window._followersCount;
  } catch (e) {}
}

// Clic « posts » : sélectionne tous mes profils, onglet Posts, défile vers le contenu
function openMyPostsTab() {
  window.profilesFilterSelection = new Set((state.user.profiles || []).map(function(p){ return p.id; }));
  window.activeProfileTab = "posts";
  document.querySelectorAll(".profile-tab").forEach(function(b, i){ b.classList.toggle("active", i === 0); });
  renderProfilesScreen();
  var anchor = document.getElementById("myPosts");
  if (anchor && anchor.scrollIntoView) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Une ligne de personne (avatar + nom), clic -> ouvre son profil
function _personRowHTML(id, u) {
  return '<div onclick="closeModal();openUserProfile(\'' + id + '\')" style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--border);border-radius:12px;cursor:pointer;">'
    + '<div style="width:40px;height:40px;border-radius:50%;background:' + avatarBg(u) + ';display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">' + avatarInner(u) + '</div>'
    + '<div style="font-weight:700;font-size:14px;color:var(--text);">' + escapeHtml(u.name || 'Utilisateur') + '</div></div>';
}
function _peopleEmpty(msg) {
  return '<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px;">' + escapeHtml(msg) + '</div>';
}
function _peopleModal(title, bodyHTML) {
  openModal('<span class="modal-close" onclick="closeModal()">×</span>'
    + '<div class="modal-title">' + title + '</div>'
    + '<div id="peopleListBody" style="display:flex;flex-direction:column;gap:8px;margin-top:8px;max-height:60vh;overflow-y:auto;">' + bodyHTML + '</div>');
}

// Clic « abonnements » : liste des gens que je suis (vraie donnée locale)
function openFollowingList() {
  var ids = state.user.following || [];
  var rows = ids.map(function(id){
    var u = userById(id) || { name: "Utilisateur", profileEmoji: "👤", avatar: "#64748b" };
    return _personRowHTML(id, u);
  }).join("");
  _peopleModal("Abonnements", ids.length ? rows : _peopleEmpty("Tu ne suis personne pour l'instant."));
}

// Clic « abonnés » : liste réelle depuis Supabase (follows + profiles)
async function openFollowersList() {
  _peopleModal("Abonnés", '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px;">Chargement…</div>');
  var body = document.getElementById("peopleListBody");
  if (typeof supa === "undefined" || !supa || typeof MY_UID === "undefined" || !MY_UID) {
    if (body) body.innerHTML = _peopleEmpty("Connecte-toi pour voir tes abonnés.");
    return;
  }
  try {
    const { data: rels } = await supa.from("follows").select("follower_id").eq("following_id", MY_UID);
    var ids = (rels || []).map(function(r){ return r.follower_id; }).filter(Boolean);
    if (!ids.length) { if (body) body.innerHTML = _peopleEmpty("Personne ne te suit encore."); return; }
    const { data: profs } = await supa.from("profiles").select("id,username,emoji,color").in("id", ids);
    var map = {}; (profs || []).forEach(function(p){ map[p.id] = p; });
    var rows = ids.map(function(id){
      var p = map[id] || {};
      var u = { name: p.username || (userById(id) || {}).name || "Utilisateur", profileEmoji: p.emoji || "👤", avatar: p.color || "#64748b" };
      return _personRowHTML(id, u);
    }).join("");
    if (body) body.innerHTML = rows || _peopleEmpty("Personne ne te suit encore.");
  } catch (e) {
    if (body) body.innerHTML = _peopleEmpty("Impossible de charger les abonnés.");
  }
}

// Onglet de contenu actif (posts | photos | videos | carnets)
function _activeProfileTab() { return window.activeProfileTab || "posts"; }

// Rend la zone #myPosts selon l'onglet actif ET la multi-sélection de profils.
// Sélection vide => invite à sélectionner (pas de fallback profil actif).
function renderProfileContent() {
  var myPostsDiv = document.getElementById("myPosts");
  if (!myPostsDiv) return;

  var sel = window.profilesFilterSelection || new Set();
  if (sel.size === 0) {
    myPostsDiv.innerHTML = '<div class="empty"><div class="empty-icon">👆</div><div class="empty-title">Sélectionne un profil passion</div><div class="empty-text">Coche un ou plusieurs profils ci-dessus pour afficher leur contenu.</div></div>';
    return;
  }

  var mine = state.userPosts.filter(function(p){ return sel.has(p.profileId); });
  var tab = _activeProfileTab();

  function emptyBlock(icon, title) {
    return '<div class="empty"><div class="empty-icon">'+icon+'</div><div class="empty-title">'+title+'</div><div class="empty-text">Rien à afficher pour '+(sel.size===1?"ce profil":"ces profils")+'.</div></div>';
  }

  if (tab==="photos") {
    var photos = mine.filter(function(p){return p.type==="photo"||p.image;});
    myPostsDiv.innerHTML = photos.length ? '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;">'+photos.map(function(p){var src=p.image||"https://picsum.photos/seed/"+p.id+"/300/300";return '<div style="aspect-ratio:1;border-radius:8px;overflow:hidden;"><img loading="lazy" decoding="async" src="'+src+'" style="width:100%;height:100%;object-fit:cover;"/></div>';}).join("")+'</div>' : emptyBlock("📷","Aucune photo");
  } else if (tab==="videos") {
    var videos = mine.filter(function(p){return p.type==="video";});
    myPostsDiv.innerHTML = videos.length ? videos.map(function(p){return renderPostHTML(Object.assign({},p,{_source:"me"}));}).join("") : emptyBlock("🎬","Aucune vidéo");
  } else if (tab==="carnets") {
    var carnets = mine.filter(function(p){return p.type==="vlog";});
    myPostsDiv.innerHTML = carnets.length ? carnets.map(function(p){return renderPostHTML(Object.assign({},p,{_source:"me"}));}).join("") : emptyBlock("📔","Aucun carnet");
  } else {
    myPostsDiv.innerHTML = mine.length ? mine.map(function(p){return renderPostHTML(Object.assign({},p,{_source:"me"}));}).join("") : emptyBlock("✏️","Rien publié");
  }
}

function switchProfileTab(tab, btn) {
  window.activeProfileTab = tab;
  document.querySelectorAll(".profile-tab").forEach(function(b){b.classList.remove("active");});
  if (btn) btn.classList.add("active");
  renderProfileContent();
}

function shareMyProfile() {
  var name = ((state.user.general||{}).username || state.user.name || "Passionné");
  if (navigator.share) {
    navigator.share({title:name+" sur PASSIO",text:"Découvre mon profil sur PASSIO !",url:window.location.href});
  } else {
    if (navigator.clipboard) navigator.clipboard.writeText(window.location.href);
    toast("📤 Lien copié !");
  }
}

// Upload une photo de profil/couverture vers Supabase Storage puis pousse l'URL
// dans la table `profiles` (via supaUpsertProfile) → visible par TOUS les autres
// comptes. Affichage optimistic en base64 d'abord, remplacé par l'URL Storage.
// `field` = "avatarPhoto" | "coverPhoto" ; `folder` = dossier Storage.
async function _syncProfilePhoto(field, folder, dataUrl) {
  if (!state.user.general) state.user.general = {};
  // 1) Optimistic : affiche tout de suite la photo locale (base64).
  state.user.general[field] = dataUrl;
  saveState();
  renderMainProfile();
  // 2) Upload Storage → URL durable (sinon le base64 ne quitte jamais l'appareil).
  try {
    if (typeof supaUploadMedia === "function" && typeof MY_UID !== "undefined" && MY_UID) {
      const key = field + "_" + MY_UID + "_" + Date.now();
      const url = await supaUploadMedia(key, folder, dataUrl, "photo");
      if (url && /^https?:\/\//.test(url)) {
        state.user.general[field] = url; // remplace le base64 par l'URL partageable
        saveState();
        renderMainProfile();
      }
    }
    // 3) Pousse l'URL (ou laisse tel quel si offline) dans la table profiles.
    if (typeof supaUpsertProfile === "function") await supaUpsertProfile();
  } catch (e) { console.warn("Sync photo profil échouée:", e && e.message); }
}

function changeCoverPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    _syncProfilePhoto("coverPhoto", "covers", e.target.result);
    toast("📷 Photo de couverture mise à jour !");
  };
  reader.readAsDataURL(file);
}

function changeAvatarPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    _syncProfilePhoto("avatarPhoto", "avatars", e.target.result);
    toast("📷 Photo de profil mise à jour !");
  };
  reader.readAsDataURL(file);
}

function changePassionPhoto(event, profileId) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const prof = state.user.profiles.find(p => p.id === profileId);
    if (prof) {
      prof.photo = e.target.result;
      saveState();
      renderProfilesScreen();
      toast("📷 Photo du profil passion mise à jour !");
    }
  };
  reader.readAsDataURL(file);
}

function openEditMainProfile() {
  const g = state.user.general || {};
  const RS_LIST = ["instagram","tiktok","facebook","youtube","twitter","linkedin","snapchat","autre"];
  const links = g.rsLinks || [];

  const html = `
    <div class="modal-handle"></div>
    <div class="modal-title">✏️ Mon profil principal</div>

    <label class="field">
      <span>Pseudo</span>
      <input type="text" class="input" id="editUsername" value="${escapeHtml(g.username || state.user.name || "")}" maxlength="40" placeholder="Ton nom sur PASSIO"/>
    </label>

    <label class="field">
      <span>Biographie <span style="font-weight:400;color:var(--muted);" id="bioCount">${(g.bio||"").length}/200</span></span>
      <textarea class="textarea" id="editBio" maxlength="200" placeholder="Présente-toi en quelques mots, parle de tes passions…" style="min-height:90px;">${escapeHtml(g.bio||"")}</textarea>
    </label>

    <div style="font-weight:700;font-size:13px;color:var(--text);margin:14px 0 10px;">🔗 Mes réseaux sociaux</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${RS_LIST.map(platform => {
        const icons = { instagram:"📸", tiktok:"🎵", facebook:"👤", youtube:"▶️", twitter:"𝕏", linkedin:"💼", snapchat:"👻", autre:"🔗" };
        const existing = links.find(l => l.platform === platform);
        return `<div style="display:flex;align-items:center;gap:8px;">
          <span style="width:24px;text-align:center;font-size:16px;">${icons[platform]||"🔗"}</span>
          <input type="url" class="input rs-link-input" data-platform="${platform}"
            placeholder="${platform.charAt(0).toUpperCase()+platform.slice(1)} URL"
            value="${escapeHtml(existing?.url||"")}"
            style="flex:1;font-size:12px;padding:8px 12px;"/>
        </div>`;
      }).join("")}
    </div>

    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);">
      <button class="btn ghost" onclick="closeModal();setTimeout(openConfigurator,200);" style="width:100%;font-size:13px;padding:12px;">🎨 Apparence & thème</button>
    </div>

    <div style="display:flex;gap:8px;margin-top:12px;">
      <button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn primary" style="flex:1;" onclick="saveMainProfile()">💾 Sauvegarder</button>
    </div>`;

  openModal(html);
  const bioTa = document.getElementById("editBio");
  const bioCount = document.getElementById("bioCount");
  if (bioTa && bioCount) bioTa.addEventListener("input", () => bioCount.textContent = `${bioTa.value.length}/200`);
}

async function saveMainProfile() {
  const username = document.getElementById("editUsername")?.value.trim() || "";
  const bio      = document.getElementById("editBio")?.value.trim() || "";
  const rsInputs = document.querySelectorAll(".rs-link-input");
  const rsLinks  = [];
  rsInputs.forEach(inp => { if (inp.value.trim()) rsLinks.push({ platform: inp.dataset.platform, url: inp.value.trim() }); });

  // Unicité du pseudo : refuse un pseudo déjà porté par un autre compte.
  if (username && typeof supaUsernameTaken === "function") {
    const takenBy = await supaUsernameTaken(username);
    if (takenBy) { toast("⚠️ Ce pseudo est déjà utilisé, choisis-en un autre"); return; }
  }

  if (!state.user.general) state.user.general = {};
  state.user.general.username = username;
  state.user.general.bio      = bio;
  state.user.general.rsLinks  = rsLinks;
  state.user.general.emoji    = currentProfile()?.emoji || "✨";
  if (username) state.user.name = username;
  // ⚠️ Renommer aussi le PROFIL ACTIF : c'est lui que supaUpsertProfile publie
  // (prof.name prioritaire). Sans ça, « Modifier le profil » changeait g.username
  // mais l'identité publique restait l'ancien nom du profil → renommage ignoré.
  if (username) { const _cp = currentProfile(); if (_cp) _cp.name = username; }

  saveState();
  // await : on garantit que le serveur (source de vérité du profil stable) est à
  // jour AVANT de rendre la main, pour qu'un éventuel re-sync adopte le nouveau nom.
  if (typeof supaUpsertProfile === "function") { try { await supaUpsertProfile(); } catch(e) {} }
  closeModal();
  renderMainProfile();
  toast("✅ Profil mis à jour !");
}

function renderProfilesScreen() {
  renderMainProfile();

  // 🔄 Initialiser la sélection des profils (multi-select)
  if (!window.profilesFilterSelection) {
    window.profilesFilterSelection = new Set();
  }

  const list = $("#profileList");
  const sub  = $("#profilesQuotaSub");

  if (sub) {
    // Plus de décompte verbeux : on garde uniquement la fonction Réinitialiser
    // quand une sélection est active, sinon rien.
    if (window.profilesFilterSelection.size > 0) {
      sub.innerHTML = `<span class="link" onclick="clearProfilesFilter()">Réinitialiser</span>`;
      sub.style.display = "";
    } else {
      sub.innerHTML = "";
      sub.style.display = "none";
    }
  }

  list.innerHTML = state.user.profiles.map(p => {
    const passion    = passionById(p.passion);
    const postCount  = state.userPosts.filter(up => up.profileId === p.id).length;
    const isSelected = window.profilesFilterSelection.has(p.id);
    const hasPhoto   = p.photo ? true : false;
    const avatarStyle = hasPhoto
      ? `background:url(${p.photo}) center/cover;`
      : `background:${p.color};`;
    const avatarContent = hasPhoto ? "" : p.emoji;

    return `<div class="profile-card ${isSelected?"selected":""}" style="${isSelected ? "border:2px solid var(--accent);background:rgba(124,58,237,0.08);" : ""}" onclick="toggleProfileSelect('${p.id}')">
      <div class="avatar lg" style="${avatarStyle}position:relative;">${avatarContent}
        <div class="passion-photo-badge" onclick="event.stopPropagation();document.getElementById('passionPhoto_${p.id}').click()">📷</div>
        <input type="file" id="passionPhoto_${p.id}" accept="image/*" style="display:none;" onchange="event.stopPropagation();changePassionPhoto(event,'${p.id}')"/>
      </div>
      <div class="profile-card-body" style="flex:1;">
        <div class="profile-card-name">
          ${passion.emoji} ${passion.label}
        </div>
        <div class="profile-card-passion" style="color:var(--muted);font-size:11px;">${postCount} post${postCount>1?"s":""} · créé le ${fmtDate(p.createdAt)}</div>
      </div>
      <button onclick="event.stopPropagation();confirmDeleteProfile('${p.id}','${escapeHtml(passion.label)}')" style="flex-shrink:0;width:32px;height:32px;border-radius:50%;border:1px solid rgba(239,68,68,0.3);background:transparent;color:#ef4444;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;">🗑</button>
    </div>`;
  }).join("");

  // Contenu en dessous : filtré par l'onglet actif ET la multi-sélection
  renderProfileContent();
}

// 🔄 MULTI-SÉLECTION DES PROFILS (écran profil). Nom distinct de toggleProfileFilter
// (feed, _activeFeedPassions, plus bas) pour éviter la collision de noms qui masquait ce handler.
function toggleProfileSelect(profileId) {
  if (!window.profilesFilterSelection) {
    window.profilesFilterSelection = new Set();
  }

  if (window.profilesFilterSelection.has(profileId)) {
    window.profilesFilterSelection.delete(profileId);
  } else {
    window.profilesFilterSelection.add(profileId);
  }

  renderProfilesScreen();
}

function clearProfilesFilter() {
  if (!window.profilesFilterSelection) {
    window.profilesFilterSelection = new Set();
  }
  window.profilesFilterSelection.clear();
  renderProfilesScreen();
}

function switchToProfile(id) {
  state.user.currentProfileId = id;
  const p = currentProfile();
  // switchToProfile ne force plus de filtre — l'utilisateur choisit lui-même
  saveState();
  // Le profil actif = identité publique (1 ligne profiles par compte) → on la
  // resynchronise pour que la recherche/messagerie reflètent le bon pseudo.
  if (typeof supaUpsertProfile === "function") { try { supaUpsertProfile(); } catch(e) {} }
  renderTopbar();
  renderProfilesScreen();
  renderFeed();
}

function confirmDeleteProfile(profileId, passionLabel) {
  var profiles = state.user.profiles || [];
  if (profiles.length <= 1) {
    toast("Tu dois garder au moins 1 profil passion");
    return;
  }
  openModal('\
    <div class="modal-handle"></div>\
    <div style="text-align:center;margin-bottom:16px;">\
      <div style="font-size:40px;margin-bottom:8px;">🗑</div>\
      <div style="font-weight:800;font-size:16px;color:var(--text);">Supprimer ce profil ?</div>\
      <div style="font-size:13px;color:var(--muted);margin-top:6px;">Le profil <b>' + escapeHtml(passionLabel) + '</b> et tous ses posts seront supprimés.</div>\
    </div>\
    <div style="display:flex;gap:8px;">\
      <button class="btn ghost" onclick="closeModal()" style="flex:1;">Annuler</button>\
      <button class="btn primary" onclick="deleteProfile(\'' + profileId + '\')" style="flex:1;background:#ef4444;">Supprimer</button>\
    </div>\
  ');
}

function deleteProfile(profileId) {
  var profiles = state.user.profiles || [];
  if (profiles.length <= 1) { toast("Tu dois garder au moins 1 profil"); closeModal(); return; }
  state.user.profiles = profiles.filter(function(p) { return p.id !== profileId; });
  state.userPosts = state.userPosts.filter(function(p) { return p.profileId !== profileId; });
  if (state.user.currentProfileId === profileId) {
    state.user.currentProfileId = state.user.profiles[0].id;
  }
  // selectedFeedPassions ne contient pas d'IDs de profil, rien à nettoyer ici
  saveState();
  // Re-synchronise le profil public pour retirer la passion supprimée de la
  // liste affichée aux autres.
  if (typeof supaUpsertProfile === "function") { try { supaUpsertProfile(); } catch(e) {} }
  closeModal();
  renderProfilesScreen();
  renderProfileStrip();
  toast("Profil supprimé");
}

function renderProfileStrip() {
  const box = document.getElementById("profileStrip");
  if (!box) return;
  const profiles = state.user.profiles || [];
  if (profiles.length === 0) { box.innerHTML = ""; return; }

  var hasFilter = _activeFeedPassions.size > 0 || _showFollowingFeed;
  box.classList.toggle("has-filter", hasFilter);

  var hasPassionFilter = _activeFeedPassions.size > 0;
  // Compter les posts disponibles par passion (tous moods)
  var allPostsFlat = allFeedPosts().filter(function(p) { return p.type !== "vlog"; });
  var postCountByPassion = {};
  allPostsFlat.forEach(function(p) { postCountByPassion[p.passion] = (postCountByPassion[p.passion] || 0) + 1; });

  // ── PROFIL SPÉCIAL "SUIVIS" : Photo de gens/communauté ──
  var followingIds = state.user?.following || [];
  var followingPostCount = allPostsFlat.filter(function(p) { return followingIds.includes(p.authorId); }).length;
  var followingTile = '<div class="profile-tile ' + (_showFollowingFeed ? "active" : "") + '" onclick="toggleFollowingFilter()" title="Suivis" style="opacity:1;transform:' + (_showFollowingFeed ? 'scale(1.07)' : 'scale(1)') + ';transition:all 0.2s;">\
      <div class="profile-tile-avatar" style="position:relative;overflow:hidden;background:linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(124, 58, 237, 0.10));"><img loading="lazy" decoding="async" class="profile-tile-photo" src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=200&h=200&fit=crop&crop=faces,entropy&auto=format&q=80" alt="Suivis" onerror="this.onerror=null;this.src=\'https://picsum.photos/seed/community/200/200\'" /><div style="position:absolute;inset:0;background:radial-gradient(circle at 30% 30%, rgba(139, 92, 246, 0.08), transparent 70%);pointer-events:none;"></div>' + (followingPostCount > 0 ? '<span style="position:absolute;top:-5px;right:-5px;background:var(--accent);color:#fff;font-size:9px;font-weight:800;border-radius:8px;padding:1px 5px;min-width:16px;text-align:center;border:2px solid var(--bg);line-height:14px;">' + followingPostCount + '</span>' : '') + '</div>\
      <div class="profile-tile-label" style="font-weight:' + (_showFollowingFeed ? '800' : '600') + ';color:' + (_showFollowingFeed ? 'var(--accent)' : '') + ';">Suivis</div>\
    </div>';

  var tilesHTML = followingTile + profiles.map(function(p) {
    const passion = passionById(p.passion);
    const isSelected = _activeFeedPassions.has(p.passion);
    const isDimmed = hasPassionFilter && !isSelected;
    const label = escapeHtml(passion.label);
    const photoId = passion.photo;
    const photoUrl = photoId
      ? "https://images.unsplash.com/" + photoId + "?w=200&h=200&fit=crop&crop=faces,entropy&auto=format&q=80"
      : null;
    const fallback = "https://picsum.photos/seed/" + p.passion + "/200/200";
    const avatarContent = photoUrl
      ? '<img loading="lazy" decoding="async" class="profile-tile-photo" src="' + photoUrl + '" alt="' + label + '" onerror="this.onerror=null;this.src=\'' + fallback + '\'"/><span class="profile-tile-emoji-badge">' + p.emoji + '</span>'
      : p.emoji;
    const count = postCountByPassion[p.passion] || 0;
    const countBadge = count > 0
      ? '<span style="position:absolute;top:-5px;right:-5px;background:var(--accent);color:#fff;font-size:9px;font-weight:800;border-radius:8px;padding:1px 5px;min-width:16px;text-align:center;border:2px solid var(--bg);line-height:14px;">' + count + '</span>'
      : '';
    return '<div class="profile-tile ' + (isSelected ? "active" : "") + '" onclick="toggleProfileFilter(\'' + p.passion + '\')" title="' + label + '" style="opacity:' + (isDimmed ? '0.3' : '1') + ';transform:' + (isSelected ? 'scale(1.07)' : 'scale(1)') + ';transition:all 0.2s;">\
      <div class="profile-tile-avatar" style="position:relative;">' + avatarContent + countBadge + '</div>\
      <div class="profile-tile-label" style="font-weight:' + (isSelected ? '800' : '600') + ';color:' + (isSelected ? 'var(--accent)' : '') + ';">' + label + '</div>\
    </div>';
  }).join("");

  box.innerHTML = tilesHTML;
}

function toggleFollowingFilter() {
  _showFollowingFeed = !_showFollowingFeed;
  saveState();
  renderFeed();
  var appMain = document.getElementById("appMain");
  if (appMain) setTimeout(function() { appMain.scrollTop = 0; }, 60);
}

function toggleProfileFilter(passionId) {
  if (_activeFeedPassions.has(passionId)) {
    _activeFeedPassions.delete(passionId);
  } else {
    _activeFeedPassions.add(passionId);
  }
  // Auto-reset le mood si le mood actuel n'a plus de contenu dans la nouvelle sélection
  var mood = state.currentMood || "all";
  if (mood !== "all") {
    var allPostsNow = allFeedPosts().filter(function(p) { return p.type !== "vlog"; });
    var byPassion = _activeFeedPassions.size > 0
      ? allPostsNow.filter(function(p) { return _activeFeedPassions.has(p.passion); })
      : allPostsNow;
    var hasMoodContent = byPassion.some(function(p) { return (p.mood || "all") === mood; });
    if (!hasMoodContent) { state.currentMood = "all"; }
  }
  saveState();
  renderFeed();
  var appMain = document.getElementById("appMain");
  if (appMain) setTimeout(function() { appMain.scrollTop = 0; }, 60);
}

function selectAllProfiles() {
  _activeFeedPassions = new Set();
  renderFeed();
}

// Met à jour les boutons mood : actif selon selectedMoods (multi-select),
// grisé si aucun post disponible dans la sélection de passions courante
function renderMoodStripSmart(availablePosts) {
  // Compter les posts par mood dans la sélection de passions courante
  var countByMood = { all: availablePosts.length };
  availablePosts.forEach(function(p) {
    var m = p.mood || "all";
    if (m !== "irl") countByMood[m] = (countByMood[m] || 0) + 1;
  });
  var hasPassionFilter = _activeFeedPassions.size > 0;
  $$(".mood-btn").forEach(function(btn) {
    var m = btn.getAttribute("data-mood");
    // ✅ UTILISER selectedMoods AU LIEU DE state.currentMood
    var isActive = selectedMoods.has(m);
    var count = m === "all" ? availablePosts.length : (countByMood[m] || 0);
    var hasContent = m === "all" ? true : count > 0;
    btn.classList.toggle("active", isActive);
    // Griser les moods sans contenu uniquement quand un filtre passion est actif
    if (hasPassionFilter) {
      btn.style.opacity = hasContent ? "1" : "0.25";
      btn.style.pointerEvents = hasContent ? "" : "none";
      btn.style.filter = hasContent ? "" : "grayscale(1)";
    } else {
      btn.style.opacity = "1";
      btn.style.pointerEvents = "";
      btn.style.filter = "";
    }
  });
}

// ===== Limite profils + paywall =====
const FREE_PROFILES_LIMIT = 3;
const EXTRA_PROFILE_COST_PASSIA = 150;

function hasActivePass() {
  const ap = state.user && state.user.activePass;
  if (!ap) return false;
  return !ap.nextBillingAt || ap.nextBillingAt > Date.now();
}

function profilesCount() {
  return (state.user.profiles || []).length;
}

function isNextProfilePaid() {
  return profilesCount() >= FREE_PROFILES_LIMIT && !hasActivePass();
}

function openProfilePaywall() {
  const balance = state.user.passia || 0;
  const cost = EXTRA_PROFILE_COST_PASSIA;
  const canAfford = balance >= cost;
  const html = `
    <div class="modal-handle"></div>
    <span class="modal-close" onclick="closeModal()">×</span>
    <div class="pay-modal-head">
      <div class="pay-modal-emoji">🔓</div>
      <div class="pay-modal-title">Profil supplémentaire</div>
    </div>
    <div style="font-size:13px;color:var(--text);text-align:center;margin-bottom:14px;line-height:1.55;">
      Tu as déjà <b>${profilesCount()} profils actifs</b> (la limite gratuite).<br/>
      Ajoute un nouveau profil-passion pour <b>${cost} 💎</b>, ou passe au Pass Passion pour des profils illimités.
    </div>
    <div class="pay-modal-amount" style="background: linear-gradient(135deg, #4c1d95, #7c3aed);">
      <div class="pay-modal-amount-big">${cost} 💎</div>
      <div class="pay-modal-amount-sub">Solde actuel : ${balance} 💎</div>
    </div>
    <button class="btn primary block" ${canAfford ? `onclick="payForExtraProfile()"` : 'disabled style="opacity:0.5;cursor:not-allowed;"'}>
      ${canAfford ? `Payer ${cost} 💎 et créer mon profil` : `Pas assez de 💎 (manque ${cost - balance})`}
    </button>
    ${!canAfford ? `<button class="btn block" style="margin-top:8px;" onclick="closeModal();goTo('wallet');setTimeout(()=>setWalletTab('shop'), 100);">+ Acheter du Passia</button>` : ""}
    <div style="text-align:center;margin:14px 0 8px;font-size:11px;color:var(--muted);">— ou —</div>
    <div class="pass-card" onclick="closeModal();goTo('wallet');setTimeout(()=>setWalletTab('shop'), 100);" style="margin:0;cursor:pointer;">
      <div class="pass-card-head">
        <div class="pass-card-title">Pass Passion</div>
        <div class="pass-card-badge">Profils illimités</div>
      </div>
      <div class="pass-card-price">9,99 € <span class="pass-card-price-per">/ mois</span></div>
      <ul class="pass-card-perks" style="margin:0;">
        <li>Profils illimités</li>
        <li>200 💎 / mois inclus</li>
        <li>Annulable à tout moment</li>
      </ul>
    </div>
    <p style="font-size:10.5px;color:var(--muted);text-align:center;margin-top:12px;line-height:1.5;">
      Pourquoi ? Un profil = un fil dédié, modéré, hébergé. Au-delà de 3, on couvre les frais réels d'hébergement et de modération.
    </p>
  `;
  openModal(html);
}

function payForExtraProfile() {
  const cost = EXTRA_PROFILE_COST_PASSIA;
  if ((state.user.passia || 0) < cost) {
    toast("Solde Passia insuffisant.");
    return;
  }
  // Marque qu'on a payé pour ce prochain profil, sera consommé à la création
  window._paidProfileSlotPending = true;
  closeModal();
  // Petit délai pour la transition de modale, puis ouvre la création
  setTimeout(() => openCreateProfile(true), 180);
}

function openCreateProfile(_paidSlotConfirmed) {
  // Vérifie le paywall, sauf si on vient de confirmer un paiement
  if (!_paidSlotConfirmed && isNextProfilePaid()) {
    openProfilePaywall();
    return;
  }
  const already = state.user.profiles.map(p => p.passion);
  const pool = allPassions().filter(p => !already.includes(p.id));
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">Nouveau fil · Nouvelle passion</div>
    <div class="modal-subtitle">Choisis une passion existante, ou crée la tienne. Chaque passion = un fil dédié. +15 pts · +2 💎</div>
    <div class="passion-grid" id="newProfileGrid">
      ${pool.map(p => `
        <div class="passion-tile ${p.custom ? 'passion-custom' : ''}" data-passion="${p.id}" onclick="selectNewProfilePassion('${p.id}')">
          <div class="passion-tile-emoji">${p.emoji}</div>
          <div class="passion-tile-label">${escapeHtml(p.label)}</div>
          ${p.custom ? '<div class="passion-custom-badge">Perso</div>' : ''}
        </div>
      `).join("")}
      <div class="passion-tile passion-tile-create" onclick="openCreateCustomPassionFromProfile()">
        <div class="passion-tile-emoji">＋</div>
        <div class="passion-tile-label">Créer une passion</div>
      </div>
    </div>
    ${pool.length === 0 ? '<div style="font-size:12px;color:var(--muted);text-align:center;margin:8px 0;">Toutes les passions du catalogue sont déjà prises, tu peux créer la tienne ci-dessus ✨</div>' : ''}
    <label class="field" style="margin-top:8px;">
      <span>Nom affiché (peut être un pseudo)</span>
      <input type="text" class="input" id="newProfileName" value="${escapeHtml(state.user.name)}" maxlength="40" />
    </label>
    <label class="field">
      <span>Bio courte</span>
      <input type="text" class="input" id="newProfileBio" placeholder="Ex: Photographe amateur · Paris" maxlength="80" />
    </label>
    <button class="btn primary block" onclick="confirmCreateProfile()">Créer ce fil</button>
  `);
  window._newProfilePassion = null;
}

/* Open custom-passion creator from inside the "Nouveau fil" modal.
   After save, we jump straight back into openCreateProfile so user can pick it. */
function openCreateCustomPassionFromProfile() {
  window._returnToCreateProfile = true;
  openCreateCustomPassion();
}

function selectNewProfilePassion(id) {
  window._newProfilePassion = id;
  $$("#newProfileGrid .passion-tile").forEach(t => {
    t.classList.toggle("selected", t.getAttribute("data-passion") === id);
  });
}

async function confirmCreateProfile() {
  const pid = window._newProfilePassion;
  if (!pid) { toast("Choisis une passion"); return; }

  // Vérifie le paywall : profil au-delà du quota gratuit ET pas de Pass actif ET pas de paiement préalable
  const paidPending = !!window._paidProfileSlotPending;
  if (profilesCount() >= FREE_PROFILES_LIMIT && !hasActivePass() && !paidPending) {
    closeModal();
    setTimeout(() => openProfilePaywall(), 150);
    return;
  }

  const name = $("#newProfileName").value.trim() || state.user.name;
  const bio = $("#newProfileBio").value.trim();

  // Unicité du nom : ni deux profils du même compte, ni le pseudo d'un autre compte.
  if (name && (state.user.profiles || []).some(p => (p.name || "").trim().toLowerCase() === name.toLowerCase())) {
    toast("⚠️ Tu as déjà un profil avec ce nom"); return;
  }
  if (name && typeof supaUsernameTaken === "function") {
    const takenBy = await supaUsernameTaken(name);
    if (takenBy) { toast("⚠️ Ce pseudo est déjà utilisé par un autre compte"); return; }
  }
  const p = passionById(pid);
  const np = {
    id: uid(),
    name,
    passion: pid,
    emoji: p.emoji,
    bio: bio || `Profil ${p.label}`,
    color: p.color,
    createdAt: Date.now(),
    paid: paidPending,
  };

  // Si paiement Passia : déduit et log
  if (paidPending) {
    state.user.passia -= EXTRA_PROFILE_COST_PASSIA;
    state.transactions.unshift({
      id: uid(),
      kind: "profile_extra",
      pts: 0,
      passia: -EXTRA_PROFILE_COST_PASSIA,
      label: `Profil supplémentaire débloqué : ${p.label}`,
      at: Date.now(),
    });
    window._paidProfileSlotPending = false;
  }

  state.user.profiles.push(np);
  state.user.currentProfileId = np.id;
  saveState();
  // Synchronise tout de suite le profil actif vers Supabase → découvrable dans la
  // recherche et messageable sans attendre le prochain boot.
  if (typeof supaUpsertProfile === "function") { try { supaUpsertProfile(); } catch(e) {} }
  grantReward("profile_create");
  closeModal();
  renderProfilesScreen();
  renderTopbar();

  if (paidPending) {
    toast(`✨ Profil ${p.label} débloqué ! −${EXTRA_PROFILE_COST_PASSIA} 💎`, "success");
  }
}

function switchProfileModal() {
  $("#devPanel").classList.remove("active");
  goTo("profiles");
}

// ======== STUDIO ========
let studioType = "text";
let studioMood = "creation";
let photoDataUrl = null;
let audioDataUrl = null;
let videoDataUrl = null;

// ===== STUDIO CDV LIVE HELPERS =====
var _studioCdvDuration = "semaine";
var _studioCdvVisibility = "public";

function selectCdvStudioDuration(btn, val) {
  _studioCdvDuration = val;
  document.querySelectorAll(".duration-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

function selectCdvStudioVisibility(btn, val) {
  _studioCdvVisibility = val;
  document.querySelectorAll(".visibility-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

function startCdvLiveFromStudio() {
  const dest = document.getElementById("cdvLiveDestInput")?.value.trim();
  if (!dest) { toast("Indique une destination"); return; }
  const desc = document.getElementById("cdvLiveDescInput")?.value.trim() || "";

  const live = {
    id: "live_" + uid(),
    authorId: "me",
    destination: dest,
    description: desc,
    duration: _studioCdvDuration,
    visibility: _studioCdvVisibility,
    status: "live",
    steps: [],
    followers: [],
    viewers: [],
    currentViewers: 0,
    reactions: [],
    comments: [],
    createdAt: Date.now(),
  };

  const lives = getCdvLives();
  lives.unshift(live);
  saveCdvLives(lives);

  // Reset le studio
  document.getElementById("cdvLiveDestInput").value = "";
  document.getElementById("cdvLiveDescInput").value = "";
  _studioCdvDuration = "semaine";
  _studioCdvVisibility = "public";

  toast("📡 CDV Live démarré ! Ajoute une étape pour lancer la diffusion");
  goTo("cdv");
  setTimeout(() => {
    renderCdvScreen();
    renderFeed();
    addCdvLiveStep(live.id);
  }, 300);
}

function renderStudio() {
  // Passion dropdown based on user profiles
  const sel = $("#postPassion");
  sel.innerHTML = state.user.profiles.map(p => {
    const pn = passionById(p.passion);
    return `<option value="${p.passion}" ${p.id === state.user.currentProfileId ? "selected" : ""}>${pn.emoji} ${pn.label}</option>`;
  }).join("");

  // Drafts
  // 🔧 FIX AUDIT 2026-06-10 : #draftList n'existe plus dans le markup →
  // TypeError à CHAQUE ouverture du Studio (goTo("studio") → renderStudio).
  const drafts = state.user.drafts || [];
  const dl = $("#draftList");
  if (!dl) return;
  if (drafts.length === 0) {
    dl.innerHTML = `<div class="empty"><div class="empty-icon">📝</div><div class="empty-title">Aucun brouillon</div><div class="empty-text">Tes brouillons apparaîtront ici.</div></div>`;
  } else {
    dl.innerHTML = drafts.map(d => `<div class="list-row" onclick="loadDraft('${escapeHtml(d.id)}')">
      <div style="font-size:22px;">${d.type === "photo" ? "📷" : d.type === "audio" ? "🎙" : "✍️"}</div>
      <div class="list-row-body">
        <div class="list-row-title">${escapeHtml((d.text || "").slice(0, 60)) || "(vide)"}</div>
        <div class="list-row-meta">${passionById(d.passion).label} · ${fmtTime(d.at)}</div>
      </div>
      <button class="btn small ghost" onclick="event.stopPropagation();deleteDraft('${escapeHtml(d.id)}')">🗑</button>
    </div>`).join("");
  }
}

function applyTemplate(kind) {
  const ta = $("#postText");
  const templates = {
    journal: "📔 Jour X de mon aventure [PASSION] :\n\nCe que j'ai fait :\n— \n\nCe qui a marché :\n— \n\nCe qui a cassé :\n— \n\nProchaine étape :\n— ",
    tuto: "🧠 Mini-tuto : [sujet]\n\n1. La règle cachée :\n2. L'erreur classique :\n3. Le shortcut que j'aurais aimé connaître :",
    coulisses: "🎬 Coulisses, ce que vous ne voyez pas :\n\nAvant : \nPendant : \nAprès : \n\nLeçon retenue :",
    question: "❓ Question à la communauté :\n\nContexte : \nCe que j'ai déjà essayé : \nCe que j'aimerais savoir :",
  };
  ta.value = templates[kind] || "";
  // Marquer le template actif
  document.querySelectorAll("#fieldTemplates .pill").forEach(function(b) { b.classList.remove("active"); });
  var clicked = document.querySelector('#fieldTemplates .pill[onclick*="' + kind + '"]');
  if (clicked) clicked.classList.add("active");
  toast("Template appliqué");
}

// Studio type tabs
$$("#studioTypeTabs .studio-type").forEach(el => {
  el.addEventListener("click", () => {
    // « Bobine » se crée dans l'éditeur média (façon Instagram : vidéo/photo +
    // overlays texte/emoji/GIF), pas dans le formulaire du Studio.
    if (el.getAttribute("data-type") === "bobine") {
      if (typeof meOpen === "function") meOpen("bobine");
      return;
    }
    $$("#studioTypeTabs .studio-type").forEach(e => e.classList.remove("active"));
    el.classList.add("active");
    studioType = el.getAttribute("data-type");
    $("#studioPhoto").style.display = studioType === "photo" ? "block" : "none";
    // « Bobine » réutilise le même bloc d'upload vidéo que « Vidéo » (mais publie
    // en is_reel → va dans les Bobines, pas le feed).
    $("#studioVideo").style.display = (studioType === "video" || studioType === "bobine") ? "block" : "none";
    $("#studioAudio").style.display = studioType === "audio" ? "block" : "none";
    const vlogEl = $("#studioVlog");
    if (vlogEl) vlogEl.style.display = studioType === "vlog" ? "block" : "none";
    const cdvliveEl = $("#studiocdvlive");
    if (cdvliveEl) cdvliveEl.style.display = studioType === "cdvlive" ? "block" : "none";

    // En mode carnet/live : masquer le textarea principal, mood, templates, passion
    // Le carnet a sa propre catégorie (voyage) et son propre mood (chill)
    const isVlog = studioType === "vlog";
    const isCdvLive = studioType === "cdvlive";
    const mainTextField = $("#postText") && $("#postText").closest(".field");
    if (mainTextField) mainTextField.style.display = (isVlog || isCdvLive) ? "none" : "block";
    const fp = $("#fieldPassion"); if (fp) fp.style.display = (isVlog || isCdvLive) ? "none" : "block";
    const fm = $("#fieldMood");    if (fm) fm.style.display = (isVlog || isCdvLive) ? "none" : "block";
    const ft = $("#fieldTemplates"); if (ft) ft.style.display = (isVlog || isCdvLive) ? "none" : "block";

    // Si on bascule sur vlog, on initialise au moins une étape
    if (studioType === "vlog" && (!vlogState.steps || vlogState.steps.length === 0)) {
      vlogState.steps = [{ id: uid(), place: "", text: "", tip: "", photo: null, video: null, audio: null }];
      renderVlogSteps();
    }
  });
});

// Mood pill row
$$("#postMoodRow .pill").forEach(p => {
  p.addEventListener("click", () => {
    $$("#postMoodRow .pill").forEach(x => x.classList.remove("active"));
    p.classList.add("active");
    studioMood = p.getAttribute("data-postmood");
  });
});

// Photo upload
document.addEventListener("click", (e) => {
  if (e.target.closest("#uploadZone")) {
    $("#photoInput").click();
  }
  if (e.target.closest("#videoUploadZone")) {
    $("#videoInput").click();
  }
});

// Compression d'image côté client : redimensionne à maxDim px max et ré-encode
// en JPEG. Permet de partager N'IMPORTE QUELLE photo (plus de limite 500 Ko) en
// la ramenant à un poids raisonnable (~150-400 Ko) avant l'upload Storage.
window.passioCompressImage = function (file, maxDim, quality) {
  maxDim = maxDim || 1600; quality = quality || 0.82;
  return new Promise(function (resolve, reject) {
    if (!file || !file.type || file.type.indexOf("image/") !== 0) { reject(new Error("not-image")); return; }
    var reader = new FileReader();
    reader.onerror = function () { reject(new Error("read-fail")); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { reject(new Error("decode-fail")); };
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        try {
          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          // WebP si supporté (~30 % plus léger), sinon JPEG.
          var out = canvas.toDataURL("image/webp", quality);
          if (out.indexOf("data:image/webp") !== 0) out = canvas.toDataURL("image/jpeg", quality);
          resolve(out);
        } catch (e) { reject(e); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
};

$("#photoInput").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (!f.type || f.type.indexOf("image/") !== 0) { toast("Choisis une image."); return; }
  // Garde-fou mémoire uniquement (très large) — la photo est ensuite compressée.
  if (f.size > 40 * 1024 * 1024) { toast("Image trop lourde (>40 Mo)."); return; }
  try {
    photoDataUrl = await passioCompressImage(f); // ✅ compression auto, plus de limite 500 Ko
    studioType = "photo";
    $$("#studioTypeTabs .studio-type").forEach(el => el.classList.remove("active"));
    document.querySelector('[data-type="photo"]')?.classList.add("active");
    $("#studioPhoto").style.display = "block";
    $("#studioVideo").style.display = "none";
    $("#studioAudio").style.display = "none";
    const vlogEl = $("#studioVlog"); if (vlogEl) vlogEl.style.display = "none";
    const cdvliveEl = $("#studiocdvlive"); if (cdvliveEl) cdvliveEl.style.display = "none";
    renderPhotoPreview();
  } catch (err) {
    console.warn("compress photo:", err);
    toast("Impossible de lire cette image.");
  }
});

function renderPhotoPreview() {
  const box = $("#photoPreviewBox");
  if (!photoDataUrl) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="photo-preview">
    <img loading="lazy" decoding="async" src="${photoDataUrl}" alt="preview"/>
    <div class="photo-clear" onclick="clearPhoto()">✕</div>
  </div>`;
}

function clearPhoto() { photoDataUrl = null; renderPhotoPreview(); }

// Video upload
$("#videoInput").addEventListener("change", (e) => {
  const f = e.target.files[0];
  console.log("📹 Fichier vidéo sélectionné:", f?.name, f?.size, "bytes");
  if (!f) {
    console.warn("❌ Aucun fichier sélectionné");
    return;
  }

  // Limite vidéo généreuse : le média n'est plus persisté en base64 (Storage only),
  // donc plus besoin du garde 500 Ko. On garde un plafond mémoire raisonnable.
  const maxSize = 30 * 1024 * 1024; // 30 Mo
  if (f.size > maxSize) {
    const sizeMB = Math.round(f.size / 1024 / 1024);
    toast(`Vidéo trop lourde (${sizeMB} Mo, max 30 Mo).`);
    console.warn("❌ Vidéo trop grande");
    return;
  }

  console.log("✅ Vidéo OK, conversion en cours...");
  toast("⏳ Chargement vidéo...");

  const reader = new FileReader();
  reader.onerror = () => {
    console.error("❌ Erreur FileReader:", reader.error);
    toast("❌ Erreur lecture vidéo");
  };
  reader.onload = () => {
    try {
      videoDataUrl = reader.result;
      console.log("✅ Vidéo convertie, taille data URL:", videoDataUrl.length);

      // 🎯 Changer automatiquement le type à "video"
      studioType = "video";
      console.log("✅ Type changé à video");

      // Mettre à jour l'affichage des boutons studio-type
      $$("#studioTypeTabs .studio-type").forEach(e => e.classList.remove("active"));
      document.querySelector('[data-type="video"]')?.classList.add("active");

      // Afficher la section vidéo et masquer les autres
      $("#studioPhoto").style.display = "none";
      $("#studioVideo").style.display = "block";
      $("#studioAudio").style.display = "none";
      const vlogEl = $("#studioVlog"); if (vlogEl) vlogEl.style.display = "none";
      const cdvliveEl = $("#studiocdvlive"); if (cdvliveEl) cdvliveEl.style.display = "none";

      renderVideoPreview();
      toast("✅ Vidéo chargée et prête!");
      console.log("✅ Vidéo affichée et prête à partager");
    } catch (err) {
      console.error("❌ Exception:", err);
      toast("❌ Erreur lors du traitement vidéo");
    }
  };
  reader.readAsDataURL(f);
});

function renderVideoPreview() {
  const box = $("#videoPreviewBox");
  if (!box) return;
  if (!videoDataUrl) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="photo-preview">
    <video src="${videoDataUrl}" controls playsinline style="width:100%;max-height:360px;border-radius:14px;display:block;background:#000;"></video>
    <div class="photo-clear" onclick="clearVideo()">✕</div>
  </div>`;
}

function clearVideo() { videoDataUrl = null; renderVideoPreview(); }

// ✅ Audio file upload
$("#audioInput").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  // ✅ LIMITE AUDIO: 500 KB max (base64 serait 667 KB)
  if (f.size > 500 * 1024) {
    toast("Audio > 500 KB, compresse-la!");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    audioDataUrl = reader.result;
    // Changer automatiquement le type à "audio"
    studioType = "audio";
    // Mettre à jour l'affichage des boutons studio-type
    $$("#studioTypeTabs .studio-type").forEach(e => e.classList.remove("active"));
    document.querySelector('[data-type="audio"]')?.classList.add("active");
    // Afficher la section audio
    // 🔧 FIX AUDIT 2026-06-10 : #studioText n'existe pas (le textarea
    // #postText est toujours visible) → TypeError qui cassait l'import
    // audio avant l'affichage du lecteur.
    $("#studioAudio").style.display = "block";
    $("#studioVideo").style.display = "none";
    $("#studioVlog").style.display = "none";
    $("#studioPhoto").style.display = "none";
    // Afficher l'audio en lecture
    $("#recStatus").textContent = "✅ Audio chargé et prêt à publier";
    $("#recPlayback").innerHTML = `<audio controls src="${audioDataUrl}" style="width:100%;margin-top:6px;"></audio>`;
    toast("✅ Audio chargé!");
  };
  reader.readAsDataURL(f);
});

// Audio recording
let mediaRecorder = null;
let audioChunks = [];
let recStartTs = 0;
let recTimer = null;

async function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    $("#recBtn").classList.remove("recording");
    $("#recStatus").textContent = "Traitement...";
    clearInterval(recTimer);
    return;
  }
  if (!navigator.mediaDevices) {
    toast("Ton navigateur ne supporte pas l'enregistrement audio.");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onload = () => {
        audioDataUrl = reader.result;
        // 🎯 Changer automatiquement le type à "audio"
        studioType = "audio";
        // Mettre à jour l'affichage des boutons studio-type
        $$("#studioTypeTabs .studio-type").forEach(e => e.classList.remove("active"));
        document.querySelector('[data-type="audio"]')?.classList.add("active");
        // Afficher la section audio et masquer les autres
        $("#studioPhoto").style.display = "none";
        $("#studioVideo").style.display = "none";
        $("#studioAudio").style.display = "block";
        const vlogEl = $("#studioVlog"); if (vlogEl) vlogEl.style.display = "none";
        const cdvliveEl = $("#studiocdvlive"); if (cdvliveEl) cdvliveEl.style.display = "none";
        $("#recStatus").textContent = "Enregistrement prêt à publier";
        $("#recPlayback").innerHTML = `<audio controls src="${audioDataUrl}" style="width:100%;margin-top:6px;"></audio>
          <button class="btn small ghost" style="margin-top:6px;" onclick="clearAudio()">🗑 Supprimer</button>`;
      };
      reader.readAsDataURL(blob);
      stream.getTracks().forEach(t => t.stop());
    };
    mediaRecorder.start();
    recStartTs = Date.now();
    $("#recBtn").classList.add("recording");
    $("#recStatus").textContent = "🔴 Enregistrement en cours, tap pour stopper";
    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - recStartTs) / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      $("#recTime").textContent = `${mm}:${ss}`;
      if (s >= 120) toggleRecording();
    }, 250);
  } catch (e) {
    console.warn(e);
    toast("Micro refusé, active l'autorisation navigateur");
    // Simulate fallback
    audioDataUrl = "data:audio/webm;base64,";
    $("#recStatus").textContent = "Enregistrement simulé (micro non accessible)";
  }
}

function clearAudio() {
  audioDataUrl = null;
  $("#recPlayback").innerHTML = "";
  $("#recStatus").textContent = "Tap pour démarrer l'enregistrement";
  $("#recTime").textContent = "00:00";
}

async function publishPost() {
  console.log("🚀 [PUBLISH] publishPost() APPELÉE!");
  diagLog(`🚀 [PUBLISH] Début publishPost()`);

  const text = $("#postText").value.trim();
  const passion = $("#postPassion").value;

  console.log("🔍 [PUBLISH] Validation: type=" + studioType + ", text=" + text.substring(0,20));
  diagLog(`🔍 [PUBLISH] Type: ${studioType}, Passion: ${passion}`);

  if (studioType === "text" && text.length < 3) {
    console.warn("❌ [PUBLISH] Text trop court");
    toast("Écris quelque chose.");
    return;
  }
  if (studioType === "photo" && !photoDataUrl) {
    console.warn("❌ [PUBLISH] Pas de photo");
    toast("Ajoute une photo.");
    return;
  }
  if ((studioType === "video" || studioType === "bobine") && !videoDataUrl) {
    console.warn("❌ [PUBLISH] Pas de vidéo");
    toast(studioType === "bobine" ? "Ajoute une vidéo pour ta bobine." : "Ajoute une vidéo.");
    return;
  }
  if (studioType === "audio" && !audioDataUrl) {
    console.warn("❌ [PUBLISH] Pas d'audio");
    toast("Enregistre un audio.");
    return;
  }

  // Validation spéciale carnet de voyage
  if (studioType === "vlog") {
    const dest = ($("#vlogDestination") && $("#vlogDestination").value || "").trim();
    if (!dest) { toast("Destination obligatoire pour un carnet."); return; }
    if (!vlogState.steps || vlogState.steps.length === 0) { toast("Ajoute au moins un jour."); return; }
  }

  // 📡 Afficher le statut de synchronisation
  console.log("✅ [PUBLISH] Validation passée, démarrage publication");
  toast("⏳ Publication en cours...", "loading");
  diagLog(`📝 [PUBLISH] Validation OK - Création post`);

  // ✅ Afficher directement le nom du profil courant!
  const prof = currentProfile();
  const g = state.user.general || {};

  // Charger le username depuis Supabase par MY_UID (clé primaire correcte)
  if (!g.username && typeof supa !== "undefined" && supa && MY_UID) {
    try {
      const { data } = await supa.from("profiles").select("username").eq("id", MY_UID).maybeSingle();
      if (data?.username) {
        state.user.general.username = data.username;  // Sauvegarder dans state
      }
    } catch (e) {}
  }

  // ✅ Toujours afficher le vrai nom du profil!
  const authorName = (state.user.general?.username) || prof?.name || state.user.name || "Profil";
  const authorEmoji = prof?.emoji || "✨";
  const authorColor = prof?.color || "#8b5cf6";

  const post = {
    id: uid(),
    authorId: (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me",
    profileId: state.user.currentProfileId,
    passion,
    mood: studioMood,
    // Une bobine est une vidéo verticale, mais marquée is_reel (→ Bobines, pas le feed)
    type: studioType === "bobine" ? "video" : studioType,
    isReel: studioType === "bobine",
    text,
    image: studioType === "photo" ? photoDataUrl : null,
    video: (studioType === "video" || studioType === "bobine") ? videoDataUrl : null,
    audio: studioType === "audio" ? audioDataUrl : null,
    createdAt: Date.now(),
    likes: 0,
    liked: false,
    comments: [],
    syncStatus: "syncing", // 🔄 Tracker le statut de sync
    authorName: authorName,
    authorEmoji: authorEmoji,
    authorColor: authorColor,
  };

  diagLog(`📝 authorName: "${authorName}" (de general.username)`);
  diagLog(`authorEmoji: "${authorEmoji}"`);
  diagLog(`authorColor: "${authorColor}"`);

  // Champs spécifiques au carnet de voyage
  if (studioType === "vlog") {
    post.destination = ($("#vlogDestination").value || "").trim();
    post.dateStart = ($("#vlogDateStart") && $("#vlogDateStart").value) || null;
    post.dateEnd = ($("#vlogDateEnd") && $("#vlogDateEnd").value) || null;
    post.cover = vlogState.cover;
    post.steps = (vlogState.steps || []).map(s => ({
      place: s.place || "", text: s.text || "", tip: s.tip || "",
      photo: s.photo || null, video: s.video || null, audio: s.audio || null
    }));
    post.budget = ($("#vlogBudget") && $("#vlogBudget").value || "").trim();
    post.transport = ($("#vlogTransport") && $("#vlogTransport").value || "").trim();
    post.lodging = ($("#vlogLodging") && $("#vlogLodging").value || "").trim();
    post.season = ($("#vlogSeason") && $("#vlogSeason").value || "").trim();
    post.tip = ($("#vlogTip") && $("#vlogTip").value || "").trim();
    post.text = post.destination + (post.dateStart || post.dateEnd ? " · carnet" : "");
  }

  // 🔄 Synchroniser avec Supabase (avec timeout court)
  console.log("🚀 [PUBLISH] Début synchronisation Supabase");

  // Ajouter au state local IMMÉDIATEMENT (optimistic update)
  state.userPosts.unshift(post);
  saveState();
  diagLog("✅ Post ajouté localement (optimistic)");

  // Naviguer et afficher immédiatement. Une bobine → viewer Bobines (pas le feed).
  if (post.isReel) {
    try { renderFeed(); } catch(e) {}
    setTimeout(() => { try { if (typeof openReels === "function") openReels(); } catch(e) {} }, 80);
  } else {
    goTo("feed");
    setTimeout(() => renderFeed(), 50);
  }

  // Synchroniser EN BACKGROUND avec timeout court (3 secondes)
  let syncSuccess = false;
  try {
    // Promise avec timeout
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => {
        console.warn("⚠️ [PUBLISH] Timeout sync (3s)");
        resolve(false);
      }, 3000)
    );

    // Quand l'upload se termine (même après le timeout d'affichage), l'URL Storage
    // a remplacé le base64 dans `post` → on persiste et on re-rend pour fixer l'image.
    const syncPromise = supaPublishPostWithRetry(post).then((ok) => {
      if (ok) { try { saveState(); renderFeed(); } catch (e) {} }
      return ok;
    });
    syncSuccess = await Promise.race([syncPromise, timeoutPromise]);

    if (syncSuccess) {
      console.log("✅ [PUBLISH] Publication synchronisée");
      toast("✅ Post publié!", "success");
    } else {
      console.warn("⚠️ [PUBLISH] Sync timeout - post local uniquement");
      toast("⏱️ Post en local (connexion lente)", "warning");
    }
  } catch (e) {
    console.warn("⚠️ [PUBLISH] Erreur sync:", e.message);
    toast("⏱️ Post en local (erreur sync)", "warning");
  }

  // Clear form
  $("#postText").value = "";
  photoDataUrl = null;
  videoDataUrl = null;
  audioDataUrl = null;
  renderPhotoPreview();
  renderVideoPreview();
  $("#recPlayback").innerHTML = "";
  $("#recTime").textContent = "00:00";
  $("#recStatus").textContent = "Tap pour démarrer l'enregistrement";

  // Clear vlog form
  if (studioType === "vlog") {
    if ($("#vlogDestination")) $("#vlogDestination").value = "";
    if ($("#vlogDateStart")) $("#vlogDateStart").value = "";
    if ($("#vlogDateEnd")) $("#vlogDateEnd").value = "";
    if ($("#vlogBudget")) $("#vlogBudget").value = "";
    if ($("#vlogTransport")) $("#vlogTransport").value = "";
    if ($("#vlogLodging")) $("#vlogLodging").value = "";
    if ($("#vlogSeason")) $("#vlogSeason").value = "";
    if ($("#vlogTip")) $("#vlogTip").value = "";
    if ($("#vlogCoverPreview")) $("#vlogCoverPreview").innerHTML = "";
    vlogState.cover = null;
    vlogState.steps = [];
  }

  // Reward
  const kind = studioType === "photo" ? "publish_photo"
             : studioType === "video" ? "publish_video"
             : studioType === "audio" ? "publish_audio"
             : studioType === "vlog"  ? "publish_vlog"
             : "publish_text";
  grantReward(kind);
  if (studioMood === "creation") bumpQuest("publish");

  // ✅ Le message de confirmation est déjà dans supaPublishPostWithRetry
  // (toast "Publication en cours..." → "✅ Post publié!" ou "❌ Erreur")
  // Pas de duplication ici

  // Navigation immédiate
  if (studioType === "vlog") {
    goTo("cdv");
    pushNotification(`📔 Ton carnet <b>${escapeHtml(post.destination || "voyage")}</b> ${syncSuccess ? "est en ligne" : "est local"}`, "📔");
  } else {
    // 🔄 RECHARGER LES POSTS APRÈS PUBLICATION
    if (syncSuccess) {
      try {
        diagLog("🔄 Reloading posts after publish...");
        const newPosts = await supaLoadPosts();
        if (newPosts && newPosts.length > 0) {
          state.seed.posts = newPosts;
          diagLog(`✅ ${newPosts.length} posts reloaded`);
        }
      } catch(e) {
        console.error("Erreur reload posts:", e);
      }
    }

    goTo("feed");
    pushNotification(`✨ Ton post est ${syncSuccess ? "en ligne" : "en attente"}`, "✨");
  }
}

function saveDraft() {
  const text = $("#postText").value.trim();
  if (!text && !photoDataUrl && !videoDataUrl && !audioDataUrl) { toast("Rien à sauvegarder"); return; }
  const d = {
    id: uid(),
    type: studioType,
    text,
    passion: $("#postPassion").value,
    mood: studioMood,
    image: photoDataUrl,
    video: videoDataUrl,
    audio: audioDataUrl,
    at: Date.now(),
  };
  state.user.drafts.unshift(d);
  saveState();
  toast("Brouillon sauvegardé");
  renderStudio();
}

function loadDraft(id) {
  const d = state.user.drafts.find(x => x.id === id);
  if (!d) return;
  studioType = d.type;
  studioMood = d.mood;
  photoDataUrl = d.image || null;
  videoDataUrl = d.video || null;
  audioDataUrl = d.audio || null;
  $$("#studioTypeTabs .studio-type").forEach(el => el.classList.toggle("active", el.getAttribute("data-type") === studioType));
  $$("#postMoodRow .pill").forEach(el => el.classList.toggle("active", el.getAttribute("data-postmood") === studioMood));
  $("#studioPhoto").style.display = studioType === "photo" ? "block" : "none";
  $("#studioVideo").style.display = studioType === "video" ? "block" : "none";
  $("#studioAudio").style.display = studioType === "audio" ? "block" : "none";
  $("#postText").value = d.text || "";
  if (studioType === "photo") renderPhotoPreview();
  if (studioType === "video") renderVideoPreview();
  if (studioType === "audio" && audioDataUrl) {
    $("#recPlayback").innerHTML = `<audio controls src="${audioDataUrl}" style="width:100%;margin-top:6px;"></audio>`;
  }
  toast("Brouillon chargé");
}

function deleteDraft(id) {
  state.user.drafts = state.user.drafts.filter(x => x.id !== id);
  saveState();
  renderStudio();
}

// ======== EXPLORER ========
function renderExplorer() {
  // Stories (déplacées du Fil vers Explorer)
  if (typeof renderStories === "function") renderStories();

  // Trending : inclut seed + userPosts + supabasePosts (vrais posts réseau)
  const counts = {};
  [...state.seed.posts, ...state.userPosts, ...(state.supabasePosts || [])].forEach(p => {
    if (p.passion) counts[p.passion] = (counts[p.passion] || 0) + 1;
  });
  const ranked = PASSIONS.map(p => ({ ...p, count: counts[p.id] || 0 }))
    .sort((a, b) => b.count - a.count).slice(0, 6);

  $("#trendingGrid").innerHTML = ranked.map(p => `
    <div class="trending-tile" onclick="openPassionExplorer('${p.id}')">
      <div class="trending-emoji">${p.emoji}</div>
      <div class="trending-name">${p.label}</div>
      <div class="trending-stat">${p.count} post${p.count>1?"s":""} · 🔥</div>
    </div>
  `).join("");

  // All passions + CTA « Créer une passion » à la fin
  const customs = (state.user.customPassions || []);
  const allList = [...PASSIONS, ...customs];
  const createCta = `
    <div class="passion-tile passion-tile-create" onclick="openCreateCustomPassionFromExplorer()">
      <div class="passion-tile-emoji">＋</div>
      <div class="passion-tile-label">Créer une passion</div>
    </div>
  `;
  $("#allPassions").innerHTML = allList.map(p => `
    <div class="passion-tile ${p.custom ? 'passion-custom' : ''}" onclick="openPassionExplorer('${p.id}')">
      <div class="passion-tile-emoji">${p.emoji}</div>
      <div class="passion-tile-label">${p.label}</div>
      ${p.custom ? '<div class="passion-custom-badge">Perso</div>' : ''}
    </div>
  `).join("") + createCta;

  // Suggested creators : seed en premier, puis vrais utilisateurs Supabase chargés async
  const seedHtml = state.seed.users.slice(0, 4).map(u => {
    const p = passionById(u.passion);
    return `<div class="list-row" onclick="openUserProfile('${u.id}')">
      <div class="avatar" style="background:${avatarBg(u)};">${avatarInner(u)}</div>
      <div class="list-row-body">
        <div class="list-row-title">${escapeHtml(u.name)}</div>
        <div class="list-row-meta">${p.emoji} ${p.label} · ${escapeHtml(u.bio || "")}</div>
      </div>
      <button class="btn small" onclick="event.stopPropagation();toast('+ ${escapeHtml(u.name)} suivi·e')">Suivre</button>
    </div>`;
  }).join("");
  $("#suggestedCreators").innerHTML = seedHtml;

  // Charger les vrais profils Supabase en async et les ajouter
  if (typeof supa !== "undefined" && supa) {
    supa.from("profiles")
      .select("id, username, emoji, color, passion_id, bio, avatar_url")
      .not("username", "is", null)
      .limit(12)
      .then(({ data, error }) => {
        if (error || !data || !data.length) return;
        const el = document.getElementById("suggestedCreators");
        if (!el) return;
        // Exclure mon propre profil
        const others = data.filter(u => u.id !== MY_UID && u.username);
        if (!others.length) return;
        const supaHtml = others.map(u => {
          const p = passionById(u.passion_id) || { emoji: "✨", label: u.passion_id || "" };
          const name = escapeHtml(u.username || "Passionné");
          const bio = escapeHtml(u.bio || "");
          const avatarColor = u.color || "#8b5cf6";
          const emoji = u.emoji || "✨";
          const _av = { avatar: avatarColor, profileEmoji: emoji, photoUrl: u.avatar_url || null };
          return `<div class="list-row" onclick="openUserProfile('${u.id}')">
            <div class="avatar" style="background:${avatarBg(_av)};">${avatarInner(_av)}</div>
            <div class="list-row-body">
              <div class="list-row-title">${name}</div>
              <div class="list-row-meta">${p.emoji} ${p.label}${bio ? " · " + bio.slice(0, 40) : ""}</div>
            </div>
            <button class="btn small" onclick="event.stopPropagation();followUserFromExplorer('${u.id}','${name}')">Suivre</button>
          </div>`;
        }).join("");
        // Remplacer la section avec seed (4) + vrais users (jusqu'à 8)
        const seedSlice = state.seed.users.slice(0, 4).map(u => {
          const p = passionById(u.passion);
          return `<div class="list-row" onclick="openUserProfile('${u.id}')">
            <div class="avatar" style="background:${avatarBg(u)};">${avatarInner(u)}</div>
            <div class="list-row-body">
              <div class="list-row-title">${escapeHtml(u.name)}</div>
              <div class="list-row-meta">${p.emoji} ${p.label} · ${escapeHtml(u.bio || "")}</div>
            </div>
            <button class="btn small" onclick="event.stopPropagation();toast('+ ${escapeHtml(u.name)} suivi·e')">Suivre</button>
          </div>`;
        }).join("");
        el.innerHTML = supaHtml + seedSlice;
      })
      .catch(() => {});
  }

  // La recherche est gérée par filterExplore() (oninput sur l'input HTML)
}

function followUserFromExplorer(userId, userName) {
  if (!state.user.following) state.user.following = [];
  if (state.user.following.includes(userId)) {
    toast("Tu suis déjà " + userName);
    return;
  }
  state.user.following.push(userId);
  saveState();
  toast("✅ " + userName + " suivi·e !");
  if (typeof supa !== "undefined" && supa && MY_UID) {
    supa.from("follows").insert({ follower_id: MY_UID, following_id: userId }).catch(() => {});
  }
}

function openCreateCustomPassionFromExplorer() {
  window._returnToExplorer = true;
  openCreateCustomPassion();
}

// ======== EXPLORER — ONGLET IA ========

function switchExploreTab(tab) {
  var tabS = document.getElementById("exTab_search");
  var tabA = document.getElementById("exTab_ai");
  var panelS = document.getElementById("exPanel_search");
  var panelA = document.getElementById("exPanel_ai");
  if (!tabS || !tabA) return;
  if (tab === "search") {
    tabS.classList.add("active"); tabA.classList.remove("active");
    panelS.style.display = ""; panelA.style.display = "none";
  } else {
    tabA.classList.add("active"); tabS.classList.remove("active");
    panelS.style.display = "none"; panelA.style.display = "flex";
    setTimeout(function() {
      var inp = document.getElementById("aiInput");
      if (inp) inp.focus();
    }, 100);
  }
}

// ---- Base de connaissance passions ----
var AI_KNOWLEDGE = {
  photographie: {
    tips: ["Maîtrise la règle des tiers pour des compositions plus dynamiques.", "Shoot en RAW pour garder le maximum de latitude en post-traitement.", "La lumière naturelle du matin (golden hour) est la plus flatteuse.", "Un trépied change tout pour la photo de nuit et longue exposition.", "Apprends les bases de Lightroom : exposition, contraste, courbes de tons."],
    ressources: ["r/photography sur Reddit", "YouTube : Peter McKinnon, Mango Street", "Livre : 'Understanding Exposure' de Bryan Peterson"],
    pour_debuter: "Commence avec un 50mm f/1.8 (moins de 150€), facile à maîtriser et très polyvalent. Photographie ce qui t'entoure chaque jour pour progresser vite.",
    tendance: "La pellicule argentique fait un grand retour. Les filtres 'film' sur Lightroom cartonnent aussi."
  },
  musique: {
    tips: ["Pratique 20 min/jour vaut mieux que 3h le weekend.", "Apprends les gammes pentatoniques pour improviser rapidement.", "Écoute activement : analyse les arrangements de tes morceaux préférés.", "Enregistre-toi régulièrement pour mesurer ta progression.", "La théorie musicale est une aide, pas une contrainte — commence par les accords de base."],
    ressources: ["Yousician pour apprendre en jouant", "YouTube : Adam Neely, Paul Davids", "GuitarTricks ou JustinGuitar pour guitare"],
    pour_debuter: "Commence par 3 accords (Do, Sol, Ré) à la guitare — tu peux déjà jouer des dizaines de chansons. Pour piano : les gammes de Do majeur d'abord.",
    tendance: "La production musicale à domicile (bedroom pop) explose. FL Studio et Ableton sont accessibles même aux débutants."
  },
  cuisine: {
    tips: ["La mise en place (préparer tous les ingrédients avant) change tout.", "Maîtrise 5 techniques de base : sauter, rôtir, braiser, pocher, griller.", "Un bon couteau bien aiguisé est plus important que tout autre équipement.", "Goûte à chaque étape et assaisonne progressivement.", "Les fonds (bouillon maison) élèvent n'importe quel plat à un autre niveau."],
    ressources: ["YouTube : Ethan Chlebowski, Joshua Weissman", "Livre : 'Salt Fat Acid Heat' de Samin Nosrat", "App : Marmiton, 750g"],
    pour_debuter: "Maîtrise d'abord les œufs sous toutes leurs formes — brouillés, pochés, omelette. C'est le test ultime d'un bon cuisinier.",
    tendance: "La fermentation (kimchi, kefir, kombucha) et la cuisine végétale créative sont en plein boom."
  },
  skateboard: {
    tips: ["L'Ollie est la base absolue — ne passe pas à autre chose avant de le maîtriser.", "Filmer tes sessions t'aide à corriger ta technique.", "Les genouillères et le casque : indispensables au début.", "Skate sur différentes surfaces pour développer ton équilibre.", "Regarde des vidéos en slow motion pour analyser les tricks."],
    ressources: ["YouTube : Braille Skateboarding, Jonny Giger", "App : Skater XL pour visualiser les tricks", "Skatepark local pour rencontrer la communauté"],
    pour_debuter: "Un bon deck 8.0', des roues dures (99A+) pour le street, des trucks Indy ou Thunder. Budget ~100-150€ pour un setup complet décent.",
    tendance: "Le bowl et la transition reviennent fort, surtout après les JO de Paris 2024."
  },
  lecture: {
    tips: ["Fixe-toi un objectif réaliste : 10-20 pages/jour plutôt que 100 pages/semaine.", "Prends des notes ou surligne — ça ancre mieux les idées.", "Alterne fiction et non-fiction pour garder la curiosité.", "Rejoins un club de lecture pour partager et rester motivé.", "Lis ce qui t'attire vraiment, pas ce que tu penses 'devoir' lire."],
    ressources: ["Goodreads pour suivre tes lectures", "Babelio (version française)", "Podcast : 'Des livres et vous' sur France Culture"],
    pour_debuter: "Commence par des romans courts (200-250 pages) dans un genre qui te passionne. La SF et le thriller sont souvent de bons points d'entrée.",
    tendance: "Le 'romantasy' (romance + fantasy) cartonne en 2026, notamment les séries type SJM."
  },
  voyage: {
    tips: ["Voyage hors saison pour moins de monde et des prix réduits.", "Les transports locaux (bus, train) t'immergent vraiment dans la culture.", "Un carnet de voyage physique crée des souvenirs durables.", "Contacte des locals via Couchsurfing ou Workaway pour des expériences uniques.", "Réserve l'hébergement et les transports, laisse le reste flexible."],
    ressources: ["App : Rome2Rio pour les itinéraires", "Skyscanner + Google Flights pour les prix", "Blog : 'Le Routard' pour les incontournables"],
    pour_debuter: "Commence par un voyage solo de 3-5 jours dans une ville européenne proche. Amsterdam, Lisbonne ou Barcelone sont parfaites.",
    tendance: "Le 'slow travel' (rester plus longtemps dans moins d'endroits) remplace le tourisme de masse."
  },
  gaming: {
    tips: ["Les tutoriels in-game sont souvent insuffisants — cherche des guides communautaires.", "Joue avec les paramètres graphiques pour optimiser performance vs qualité.", "La communauté (Discord, Reddit du jeu) accélère énormément la progression.", "Fais des pauses régulières — 1h30 max puis 15 min de pause.", "Essaie des genres différents, tu te découvriras des goûts inattendus."],
    ressources: ["Metacritic pour choisir un jeu", "Twitch pour regarder avant d'acheter", "HumbleBundle pour les deals"],
    pour_debuter: "Sur PC : Steam. Sur console : les abonnements Game Pass / PS Plus offrent une centaine de jeux pour ~15€/mois.",
    tendance: "Les jeux indépendants (Balatro, Hades II, Manor Lords) dominent les charts 2025-2026."
  },
  sport: {
    tips: ["La régularité prime sur l'intensité — 3 fois/semaine vaut mieux qu'un effort épuisé.", "L'échauffement et les étirements réduisent les blessures de 60%.", "Suis tes progrès (application, carnet) pour rester motivé.", "L'alimentation et le sommeil représentent 70% des résultats.", "Trouve un partenaire d'entraînement pour l'accountability."],
    ressources: ["App : Strava (course/vélo), MyFitnessPal (nutrition)", "YouTube : Athlean-X, Jeff Nippard pour la musculation", "Garmin/Polar pour le suivi de performance"],
    pour_debuter: "Commence par 3 séances de 30 min par semaine. La marche rapide est une excellente base avant de courir.",
    tendance: "Le padel explose en France (+300% de pratiquants depuis 2022). Le trail running aussi."
  },
  art: {
    tips: ["Dessine tous les jours, même 5 minutes — la constance est la clé.", "Copie les maîtres pour apprendre les techniques.", "L'observation est plus importante que la technique au début.", "Expérimente différents médiums avant de te spécialiser.", "Montre ton travail, même imparfait — les retours accélèrent la progression."],
    ressources: ["Proko sur YouTube pour l'anatomie", "Ctrl+Paint pour le digital", "Skillshare / Domestika pour des cours structurés"],
    pour_debuter: "Un carnet de croquis + des crayons HB, 2B, 4B. Commence par dessiner des objets du quotidien sous différents angles.",
    tendance: "L'art génératif et le Procreate pour l'iPad dominent, mais l'aquarelle connaît un grand retour."
  },
  danse: {
    tips: ["Filme-toi pour voir ce que tu fais réellement vs ce que tu penses faire.", "La musicalité s'apprend — écoute et ressens le beat avant de bouger.", "Les bases solides avant les figures spectaculaires.", "Danse devant un miroir pour corriger ta posture.", "Les cours collectifs sont meilleurs que le solo pour débuter."],
    ressources: ["YouTube : Learn Quick, 1Million Dance Studio", "App : Steezy (hip-hop, contemp)", "Cours locaux pour la technique"],
    pour_debuter: "Le hip-hop ou la salsa sont accessibles et très sociaux. Compte 3-6 mois avant de te sentir à l'aise.",
    tendance: "Afrobeats et K-pop dance covers explosent sur les réseaux sociaux en 2026."
  }
};

// Mots-clés pour matcher les passions
var AI_PASSION_KEYWORDS = {
  photographie: ["photo","photographie","appareil","objectif","lightroom","raw","portrait","paysage","reflex","mirrorless"],
  musique: ["musique","guitare","piano","basse","batterie","chant","accord","gamme","mélodie","instrument","produire","prod"],
  cuisine: ["cuisine","cuisinier","recette","plat","chef","cook","repas","manger","gastronomie","pâtisserie","boulangerie"],
  skateboard: ["skate","skateboard","ollie","kickflip","trick","planche","skatepark","street"],
  lecture: ["lecture","livre","roman","lire","bouquin","auteur","littérature","bibliothèque","kindle"],
  voyage: ["voyage","voyager","partir","destination","trip","pays","ville","backpack","sac à dos","carnet de voyage","cdv"],
  gaming: ["jeu","gaming","gamer","console","pc","steam","playstation","xbox","nintendo","rpg","fps","mmo"],
  sport: ["sport","fitness","musculation","course","vélo","natation","yoga","cardio","entraînement","workout"],
  art: ["dessin","peinture","art","illustration","aquarelle","croquis","procreate","digital"],
  danse: ["danse","danser","chorégraphie","hip-hop","salsa","contemporain","ballet","afrobeats"]
};

// ---- Moteur de réponse IA ----
function aiDetectIntent(q) {
  var ql = q.toLowerCase();
  // App-specific intents
  if (/irl|événement|event|rencontre|près de|proximité/.test(ql)) return "irl";
  if (/cdv|carnet|voyage|live|en direct/.test(ql)) return "cdv";
  if (/créateur|profil|suivre|utilisateur|qui suit/.test(ql)) return "creators";
  if (/passia|points|score|wallet|gagner|récompense/.test(ql)) return "gamification";
  if (/mode pause|bien-être|digital wellbeing|temps d'écran|pause/.test(ql)) return "wellbeing";
  if (/post|publier|créer|studio/.test(ql) && !/passion/.test(ql)) return "create";
  // Passion knowledge
  for (var pid in AI_PASSION_KEYWORDS) {
    var kws = AI_PASSION_KEYWORDS[pid];
    for (var i = 0; i < kws.length; i++) {
      if (ql.includes(kws[i])) return "passion:" + pid;
    }
  }
  // Generic passion search
  var allP = allPassions ? allPassions() : PASSIONS;
  for (var j = 0; j < allP.length; j++) {
    if (ql.includes(allP[j].label.toLowerCase())) return "passion:" + allP[j].id;
  }
  return "general";
}

function aiGenerateResponse(query) {
  var ql = query.toLowerCase();
  var intent = aiDetectIntent(query);

  // --- IRL Events ---
  if (intent === "irl") {
    var evts = (state.seed.events || []);
    var matched = evts.filter(function(e) {
      return ql.includes(e.city ? e.city.toLowerCase() : "") ||
             ql.includes((e.passion || "").toLowerCase()) || evts.length > 0;
    }).slice(0, 5);
    var cardsHTML = matched.length ? matched.map(function(e) {
      var p = passionById(e.passion) || { emoji:"📍", label: e.passion };
      return '<div class="ai-card" onclick="navigateTo(\'irl\')">' +
        '<div class="ai-card-title">' + p.emoji + ' ' + escapeHtml(e.title || "Événement") + '</div>' +
        '<div class="ai-card-meta">📍 ' + escapeHtml(e.city || "France") + ' · ' + escapeHtml(e.date || "Bientôt") + '</div>' +
      '</div>';
    }).join("") : '<div style="font-size:12px;color:var(--muted);">Aucun événement trouvé pour ta recherche.</div>';
    return '<div><div class="ai-section-label">📍 Événements IRL</div>' + cardsHTML +
      '<div style="margin-top:10px;font-size:12px;color:var(--muted);">Tu peux aussi créer ton propre événement dans l\'onglet IRL → <b>+ Créer</b>.</div></div>';
  }

  // --- CDV ---
  if (intent === "cdv") {
    var lives = (state.cdvLives || []);
    var publicLives = lives.filter(function(l) { return l.visibility !== "private"; }).slice(0, 4);
    var cdvCards = publicLives.length ? publicLives.map(function(l) {
      return '<div class="ai-card" onclick="navigateTo(\'cdv\')">' +
        '<div class="ai-card-title">📔 ' + escapeHtml(l.title || "Carnet") + '</div>' +
        '<div class="ai-card-meta">' + (l.isLive ? "📡 En direct · " : "✅ Terminé · ") + (l.steps ? l.steps.length : 0) + ' étapes</div>' +
      '</div>';
    }).join("") : '<div style="font-size:12px;color:var(--muted);">Aucun carnet public pour l\'instant.</div>';
    return '<div><div class="ai-section-label">📔 Carnets de Voyage</div>' + cdvCards +
      '<div style="margin-top:10px;font-size:12px;color:var(--muted);">Lance ton propre CDV Live depuis l\'onglet <b>Carnets</b> → bouton 📡 CDV Live.</div></div>';
  }

  // --- Créateurs ---
  if (intent === "creators") {
    var allPid = null;
    for (var pid in AI_PASSION_KEYWORDS) {
      var kws = AI_PASSION_KEYWORDS[pid];
      for (var ki = 0; ki < kws.length; ki++) {
        if (ql.includes(kws[ki])) { allPid = pid; break; }
      }
      if (allPid) break;
    }
    var users = (state.seed.users || []);
    var filtered = allPid ? users.filter(function(u) { return u.passion === allPid; }) : users;
    filtered = filtered.slice(0, 5);
    var uCards = filtered.map(function(u) {
      var p = passionById(u.passion) || { emoji:"✨", label:"" };
      return '<div class="ai-card" onclick="openUserProfile(\'' + u.id + '\')">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<div style="width:32px;height:32px;border-radius:50%;background:' + avatarBg(u) + ';display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;">' + avatarInner(u) + '</div>' +
          '<div><div class="ai-card-title" style="margin:0;">' + escapeHtml(u.name) + '</div><div class="ai-card-meta">' + p.emoji + ' ' + p.label + '</div></div>' +
        '</div>' +
      '</div>';
    }).join("");
    return '<div><div class="ai-section-label">👤 Créateurs' + (allPid ? ' · ' + allPid : '') + '</div>' + uCards + '</div>';
  }

  // --- Gamification ---
  if (intent === "gamification") {
    return '<div><div class="ai-section-label">💎 Comment gagner des Passia</div>' +
      '<div class="ai-card"><div class="ai-card-title">📝 Publier un post texte</div><div class="ai-card-meta">+10 pts · +2 💎</div></div>' +
      '<div class="ai-card"><div class="ai-card-title">📷 Publier une photo</div><div class="ai-card-meta">+15 pts · +3 💎</div></div>' +
      '<div class="ai-card"><div class="ai-card-title">🎙 Publier un podcast</div><div class="ai-card-meta">+20 pts · +5 💎</div></div>' +
      '<div class="ai-card"><div class="ai-card-title">📍 Rejoindre un événement IRL</div><div class="ai-card-meta">+25 pts · +5 💎</div></div>' +
      '<div class="ai-card"><div class="ai-card-title">📔 Lancer un CDV Live</div><div class="ai-card-meta">+30 pts · +8 💎</div></div>' +
      '<div style="margin-top:8px;font-size:12px;color:var(--muted);">Consulte ton Wallet dans l\'onglet <b>Wallet</b> pour voir ton score et le leaderboard.</div></div>';
  }

  // --- Bien-être ---
  if (intent === "wellbeing") {
    return '<div><div class="ai-section-label">🌿 Bien-être digital sur PASSIO</div>' +
      '<div style="font-size:13px;line-height:1.6;">' +
      'PASSIO intègre des outils de bien-être uniques :<br><br>' +
      '⏱ <b>Temps d\'écran</b> — Fixe une limite quotidienne (30 min à illimité) via <b>⋯ → Temps d\'écran</b><br><br>' +
      '⏸ <b>Mode Pause</b> — Active une pause volontaire instantanée via <b>⋯ → Mode pause</b><br><br>' +
      '🔐 <b>Contrôle parental</b> — Code PIN pour protéger les paramètres, activable depuis <b>⋯ → Temps d\'écran</b><br><br>' +
      '<span style="color:var(--accent);font-weight:700;">PASSIO est le seul réseau social qui t\'encourage activement à poser ton téléphone.</span>' +
      '</div></div>';
  }

  // --- Créer du contenu ---
  if (intent === "create") {
    return '<div><div class="ai-section-label">➕ Créer du contenu</div>' +
      '<div style="font-size:13px;line-height:1.6;">' +
      'Depuis l\'onglet <b>Créer</b> (bouton + en bas), tu peux :<br><br>' +
      '📝 <b>Post texte</b> — Partage une pensée, une expérience<br>' +
      '📷 <b>Photo</b> — Upload depuis ta galerie<br>' +
      '🎙 <b>Podcast audio</b> — Enregistre directement depuis le micro<br><br>' +
      'Des <b>templates</b> pré-remplis sont disponibles (Journal de route, Mini-tuto, Coulisses).<br>' +
      'Tes brouillons sont sauvegardés automatiquement.' +
      '</div></div>';
  }

  // --- Passion knowledge ---
  if (intent.startsWith("passion:")) {
    var pid2 = intent.split(":")[1];
    var knowledge = AI_KNOWLEDGE[pid2];
    var passionObj = passionById(pid2);
    var passionLabel = passionObj ? passionObj.label : pid2;
    var passionEmoji = passionObj ? passionObj.emoji : "🎯";

    // Déterminer le sous-type de question
    var isDebutant = /débuter|commencer|débutant|démarrer|comment apprendre|conseils pour|start/.test(ql);
    var isTips = /conseil|astuce|tips|améliorer|progresser|technique/.test(ql);
    var isRessource = /ressource|apprendre|tuto|tutoriel|livre|site|app|outil/.test(ql);
    var isTendance = /tendance|trend|nouveauté|actuel|2025|2026/.test(ql);

    // Chercher créateurs de cette passion dans l'app
    var passionCreators = (state.seed.users || []).filter(function(u) { return u.passion === pid2; }).slice(0, 3);
    var passionEvents = (state.seed.events || []).filter(function(e) { return e.passion === pid2; }).slice(0, 2);

    var html = '<div>';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">';
    html += '<span style="font-size:28px;">' + passionEmoji + '</span>';
    html += '<div><div style="font-weight:800;font-size:15px;">' + passionLabel + '</div>';
    html += '<div style="font-size:11px;color:var(--muted);">Passion PASSIO</div></div></div>';

    if (!knowledge) {
      // Passion sans base de connaissance — réponse générique + données app
      html += '<div style="font-size:13px;line-height:1.6;margin-bottom:10px;">La passion <b>' + passionLabel + '</b> rassemble une belle communauté sur PASSIO. Explore les posts, connecte-toi aux créateurs et participe aux événements IRL !</div>';
    } else if (isDebutant) {
      html += '<div class="ai-section-label">Pour débuter</div>';
      html += '<div style="font-size:13px;line-height:1.6;background:var(--bg-deep);border-radius:12px;padding:12px;margin-bottom:8px;">' + knowledge.pour_debuter + '</div>';
    } else if (isRessource) {
      html += '<div class="ai-section-label">📚 Ressources recommandées</div>';
      knowledge.ressources.forEach(function(r) {
        html += '<div class="ai-card"><div class="ai-card-title" style="font-size:12px;font-weight:600;">→ ' + r + '</div></div>';
      });
    } else if (isTendance) {
      html += '<div class="ai-section-label">🔥 Tendances 2026</div>';
      html += '<div style="font-size:13px;line-height:1.6;background:var(--bg-deep);border-radius:12px;padding:12px;margin-bottom:8px;">' + knowledge.tendance + '</div>';
    } else {
      // Tips par défaut
      html += '<div class="ai-section-label">💡 Conseils clés</div>';
      knowledge.tips.slice(0, 4).forEach(function(t) {
        html += '<div style="display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;line-height:1.5;"><span style="color:var(--accent);font-weight:700;flex-shrink:0;">→</span><span>' + t + '</span></div>';
      });
    }

    // Créateurs dans l'app
    if (passionCreators.length) {
      html += '<div class="ai-section-label" style="margin-top:10px;">👤 Créateurs sur PASSIO</div>';
      passionCreators.forEach(function(u) {
        html += '<div class="ai-card" onclick="openUserProfile(\'' + u.id + '\')">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<div style="width:30px;height:30px;border-radius:50%;background:' + avatarBg(u) + ';display:flex;align-items:center;justify-content:center;font-size:14px;">' + avatarInner(u) + '</div>' +
            '<div><div class="ai-card-title" style="margin:0;">' + escapeHtml(u.name) + '</div><div class="ai-card-meta">' + escapeHtml(u.bio || "") + '</div></div>' +
          '</div></div>';
      });
    }

    // Events
    if (passionEvents.length) {
      html += '<div class="ai-section-label" style="margin-top:10px;">📍 Events IRL</div>';
      passionEvents.forEach(function(e) {
        html += '<div class="ai-card" onclick="navigateTo(\'irl\')">' +
          '<div class="ai-card-title">' + escapeHtml(e.title || "Événement") + '</div>' +
          '<div class="ai-card-meta">📍 ' + escapeHtml(e.city || "France") + ' · ' + escapeHtml(e.date || "") + '</div>' +
        '</div>';
      });
    }

    html += '</div>';
    return html;
  }

  // --- Réponse générale ---
  var allP2 = allPassions ? allPassions() : PASSIONS;
  var matchedPassions = allP2.filter(function(p) {
    return ql.includes(p.label.toLowerCase()) || p.label.toLowerCase().includes(ql);
  }).slice(0, 4);

  if (matchedPassions.length) {
    var html2 = '<div><div class="ai-section-label">🎯 Passions trouvées</div>';
    matchedPassions.forEach(function(p) {
      html2 += '<div class="ai-card" onclick="openPassionExplorer(\'' + p.id + '\')">' +
        '<div class="ai-card-title">' + p.emoji + ' ' + p.label + '</div>' +
        '<div class="ai-card-meta">Explore les créateurs et posts → cliquer pour voir</div>' +
      '</div>';
    });
    html2 += '</div>';
    return html2;
  }

  return '<div style="font-size:13px;line-height:1.6;">' +
    'Je n\'ai pas de réponse précise pour <em>"' + escapeHtml(query) + '"</em>.<br><br>' +
    'Tu peux :<br>' +
    '• Explorer une passion dans l\'onglet <b>Recherche</b><br>' +
    '• Chercher des événements IRL<br>' +
    '• Consulter les carnets de voyage<br><br>' +
    'Essaie des questions comme :<br>' +
    '<em>"Conseils en photographie"</em>, <em>"Events IRL Lyon"</em>, <em>"Comment gagner des Passia"</em>' +
    '</div>';
}

