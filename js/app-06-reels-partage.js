// ══════════════════════════════════════════════════════════════════════════
// LIEN PARTAGÉ D'UNE BOBINE — #reel=<id>
//
// ⚠️ Ces liens EXISTAIENT depuis toujours : openReelShareModal les fabrique et
// les envoie sur WhatsApp, Telegram, X, Facebook, e-mail, SMS et presse-papier.
// Mais AUCUN code ne les lisait au démarrage — ouvrir un lien de bobine partagée
// retombait bêtement sur le fil. La boucle de partage, c'est-à-dire le seul
// chemin d'entrée d'une personne qui ne connaît pas encore PASSIO, était rompue
// en silence. Même défaut et même correctif que #cdv-live-<id> (app-03) et
// #irl-event-<id> (app-07), corrigés eux le 2026-07-21.
//
// Cinq règles que ce routage tient, et qui expliquent sa forme :
//   ① il n'ouvre JAMAIS une autre bobine que celle demandée. openReels() montre
//      la première de la liste quand l'id est absent — pire qu'une erreur : un
//      lien qui ment sans le dire. D'où la vérification d'APPARTENANCE à
//      buildReels(id) AVANT toute ouverture. ⚠️ Tester isReel + média ne suffit
//      pas : buildReels écarte aussi les comptes BLOQUÉS, et une bobine d'un
//      compte bloqué passait donc la garde puis ouvrait le viewer sur autrui ;
//   ② il attend que l'application soit vraiment prête. `state` vaut **null**
//      (pas undefined) jusqu'à `state = loadState()` dans boot(), qui part
//      APRÈS `await ensureSupabase()` — un aller-retour CDN. Sonder trop tôt
//      levait un TypeError dans findPostAnywhere ; comme l'appel vient d'un
//      setTimeout, l'exception n'était rattrapée par personne et TUAIT la
//      chaîne de reprise, en silence (piège déjà payé sur ui-v4b-fiche.js le
//      2026-08-28). Le corps entier est donc sous try, et une exception
//      REPLANIFIE au lieu de conclure ;
//   ③ il n'ouvre rien par-dessus le gate, la landing ou l'onboarding : le
//      viewer est en z-index 9999, il recouvrirait l'inscription de la personne
//      même qui vient d'ouvrir le lien. Ces attentes ne consomment pas d'essai ;
//   ④ il ne nettoie le hash que sur le chemin de SUCCÈS. Le nettoyer sur échec
//      rendait le lien irrécupérable — même un rechargement ne pouvait plus rien
//      retenter (le précédent _openIrlEventFromHash ne le nettoie jamais) ;
//   ⑤ il mémorise l'id au premier passage : pendant l'attente, une ouverture
//      normale des Bobines empile « #reels » et le lien aurait été perdu sans
//      un mot.
//
// ⚠️ Télémétrie : le marqueur ci-dessous n'est PAS corrélé au `?plk=` du lien.
// telemetry.js consomme et RETIRE ce paramètre au chargement de la page, bien
// avant que le bloc app n'existe (en prod il n'est même pas téléchargé). Son
// propre événement `link_open` prouve l'ouverture du lien ; celui-ci prouve
// l'affichage effectif de la bobine. Les apparier demanderait une API publique
// de telemetry.js qui n'existe pas encore.
var _reelLinkId = "";         // id capturé au premier passage
var _reelLinkEssais = 0;      // tentatives « le contenu n'est pas encore là »
var _reelLinkAttentes = 0;    // tentatives « l'application n'est pas prête »
var _reelLinkTimer = null;

function _reelLinkReplanifier(delai) {
  if (_reelLinkTimer) return;
  _reelLinkTimer = setTimeout(function () {
    _reelLinkTimer = null;
    _openReelDeepLink();
  }, delai || 700);
}

// Retire le #reel=<id> sans toucher à la query (?plk=… sert au suivi du lien,
// et telemetry.js l'a déjà lu et retiré au chargement).
function _reelLinkNettoyerHash() {
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
}

// L'application peut-elle répondre, et l'écran est-il libre ?
function _reelLinkAppPrete() {
  if (document.documentElement.classList.contains("passio-locked")) return false;
  // ⚠️ `state` est déclaré `let state = null` : `typeof state === "undefined"`
  // seul ne protège de rien, c'est l'accès à `.seed` qui lève.
  if (typeof state === "undefined" || !state || !state.seed) return false;
  if (typeof findPostAnywhere !== "function" || typeof openReelById !== "function") return false;
  if (typeof buildReels !== "function") return false;
  var l = document.getElementById("landing");
  if (l && l.classList.contains("active")) return false;
  var o = document.getElementById("onboarding");
  if (o && o.classList.contains("active")) return false;
  return true;
}

function _openReelDeepLink() {
  var m = /^#reel=(.+)$/.exec(location.hash || "");
  if (m) {
    var lu = m[1];
    try { lu = decodeURIComponent(lu); } catch (e) {}
    _reelLinkId = lu;
  }
  var id = _reelLinkId;
  if (!id) return false;

  try {
    // Gate, landing, onboarding, application pas encore chargée : on attend,
    // sans consommer d'essai de contenu. Bornée — aucun minuteur ne doit
    // tourner seul indéfiniment (600 × 700 ms ≈ 7 min, le temps d'une
    // inscription), et le hash reste en place, donc un rechargement retente.
    if (!_reelLinkAppPrete()) {
      if (++_reelLinkAttentes <= 600) _reelLinkReplanifier();
      return false;
    }

    var post = findPostAnywhere(id);
    var jouable = !!post && !!post.isReel
      && !!(post.video || post.image || post.photo || post.coverPhotoUrl || post.cover);
    // Seule garde qui compte : la bobine est-elle DANS la liste que le viewer
    // va afficher ? buildReels(id) épingle la cible même hors des 30 plus
    // récentes, et écarte les comptes bloqués — d'où cette vérification plutôt
    // qu'une copie de ses conditions, qui divergerait tôt ou tard.
    var dansLaListe = jouable && buildReels(id).some(function (p) { return p.id === id; });

    if (!dansLaListe) {
      // Une bobine RÉELLE n'arrive qu'avec supaLoadPosts : on retente avant de
      // conclure. Le hash n'est PAS nettoyé ici — le lien doit rester rejouable
      // par un simple rechargement si le réseau a été plus lent que le budget.
      if (++_reelLinkEssais <= 12) { _reelLinkReplanifier(); return false; }
      _reelLinkId = "";
      if (typeof toast === "function") toast("Bobine introuvable ou supprimée");
      return false;
    }

    // Le hash part AVANT l'ouverture : openReels() empile son propre « #reels »,
    // et le retour arrière doit fermer le viewer, pas rejouer le lien en boucle.
    _reelLinkNettoyerHash();
    _reelLinkId = "";
    _reelLinkEssais = 0;
    _reelLinkAttentes = 0;

    if (openReelById(id) === false) {
      if (typeof toast === "function") toast("Bobine introuvable ou supprimée");
      return false;
    }
    try { if (window.tel && tel.action) tel.action("reel_link_open", { source: "deeplink" }); } catch (e) {}
    return true;
  } catch (e) {
    // Une exception ne doit PAS tuer la chaîne : on la journalise (un catch muet
    // ici rendrait un lien mort indiscernable d'un lien absent) et on retente.
    try { console.warn("[reel] lien partagé :", e); } catch (e2) {}
    if (++_reelLinkEssais <= 12) _reelLinkReplanifier();
    return false;
  }
}

// Un lien collé pendant que l'app tourne : budget neuf seulement si la CIBLE
// change (sinon une page qui réécrit son hash ré-armerait le compteur sans fin).
window.addEventListener("hashchange", function () {
  var m = /^#reel=(.+)$/.exec(location.hash || "");
  if (!m) return;
  var id = m[1];
  try { id = decodeURIComponent(id); } catch (e) {}
  if (id && id !== _reelLinkId) {
    _reelLinkId = id;
    _reelLinkEssais = 0;
    _reelLinkAttentes = 0;
  }
  _openReelDeepLink();
});

(function _reelDeepLinkBoot() {
  if (!/^#reel=/.test(location.hash || "")) return;
  // On attend le déverrouillage plutôt que de sonder : `__gateReady` est la
  // promesse que boot() attend déjà (js/access-gate.js). Elle ne dit PAS que
  // l'application est prête (cf. règle ②) — c'est _reelLinkAppPrete qui le dit.
  // Repli immédiat si le gate est absent (page de test, build sans gate).
  var demarrer = function () { _reelLinkReplanifier(400); };
  var g = window.__gateReady;
  if (g && typeof g.then === "function") g.then(demarrer); else demarrer();
})();

function copyReelLink(postId, encodedUrl) {
  const url = decodeURIComponent(encodedUrl);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      _telLinkShare(url, "clipboard");
      toast("🔗 Lien copié!");
      closeModal();
    });
  } else {
    toast("Copie impossible sur ce navigateur");
  }
}

// Émet le signal « lien partagé » (canal donné) au centre de pilotage, à partir
// d'une URL taguée. Guardé : ne casse rien si la télémétrie est absente/désactivée.
function _telLinkShare(url, channel) {
  try { if (window.tel && tel.linkShare) { var id = tel.linkFromUrl(url); if (id) tel.linkShare(id, channel); } } catch (e) {}
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

  _telLinkShare(url, platform);
  window.open(shareUrl, "_blank", "width=600,height=400");
  toast(`Ouverture ${platform}...`);
  closeModal();
}

function shareReelEmail(postId, encodedText, encodedUrl) {
  const reel = findPostAnywhere(postId);
  if (!reel) return;

  // Réutilise l'URL taguée du modal (suivi du lien) ; repli si absente.
  const url = encodedUrl ? decodeURIComponent(encodedUrl) : `${location.origin}${location.pathname}#reel=${encodeURIComponent(postId)}`;
  const author = authorOfReel(reel);
  const passion = passionById(reel.passion) || { label: reel.passion, emoji: "✨" };
  const text = reel.text || reel.caption || "";

  const subject = encodeURIComponent(`Regarde cette bobine PASSIO de ${author.name}!`);
  const body = encodeURIComponent(`Salut!\n\nJe viens de découvrir cette super bobine sur PASSIO:\n\n${passion.emoji} ${author.name} – ${passion.label}\n"${text.slice(0, 150)}${text.length > 150 ? "…" : ""}"\n\nViens la voir ici: ${url}\n\nPASSIO - Partage tes passions!`);

  _telLinkShare(url, "email");
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
  _telLinkShare(url, "sms");
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
// Initiales pour l'avatar par défaut : 2 premières lettres de mots ("Léa Moreau" → "LM")
function _profileInitials(name) {
  var words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  var ini = words.slice(0, 2).map(function(w) { return w.charAt(0); }).join("");
  return ini.toUpperCase();
}

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
    // data-has-photo protège la photo uploadée des overrides !important du
    // Configurateur (app-05) ; sans photo : mesh gradient au lieu de l'aplat vide
    cover.dataset.hasPhoto = g.coverPhoto ? "1" : "";
    cover.style.background = g.coverPhoto
      ? "url(" + g.coverPhoto + ") center/cover"
      : "radial-gradient(130% 140% at 12% -10%, #c4b5fd 0%, rgba(196,181,253,0) 55%), radial-gradient(120% 130% at 95% 15%, #8b5cf6 0%, rgba(139,92,246,0) 60%), radial-gradient(160% 130% at 50% 115%, #5b21b6 0%, #6d28d9 70%)";
  }

  avatarEl.dataset.hasPhoto = g.avatarPhoto ? "1" : "";
  if (g.avatarPhoto) {
    avatarEl.style.backgroundImage = "url(" + g.avatarPhoto + ")";
    avatarEl.style.backgroundSize = "cover";
    avatarEl.style.backgroundPosition = "center";
    avatarEl.innerHTML = '<div class="main-profile-avatar-badge">📷</div><input type="file" id="avatarPhotoInput" accept="image/*" style="display:none;" onchange="changeAvatarPhoto(event)"/>';
  } else {
    // Initiales façon Notion/Slack (identifiable sans photo) ; emoji en repli
    avatarEl.style.backgroundImage = "";
    var _ini = _profileInitials(g.username || state.user.name);
    avatarEl.innerHTML = (_ini
        ? '<span style="font-weight:800;font-size:30px;color:#fff;letter-spacing:.02em;">' + escapeHtml(_ini) + '</span>'
        : (g.emoji || (cur ? cur.emoji : "✨")))
      + '<div class="main-profile-avatar-badge">📷</div><input type="file" id="avatarPhotoInput" accept="image/*" style="display:none;" onchange="changeAvatarPhoto(event)"/>';
  }

  usernameEl.textContent = g.username || state.user.name || "Mon profil";
  // §2 : mes passions sous mon pseudo, comme sur toutes les autres surfaces.
  // Nœud créé une fois, tenu à jour ensuite — pas de `innerHTML` sur la carte,
  // qui emporterait l'input de photo qu'elle héberge.
  try {
    var identEl = document.getElementById("mainProfileIdent");
    var identTxt = (typeof identitePassionsTexte === "function")
      ? identitePassionsTexte({ id: (typeof MY_UID !== "undefined" && MY_UID) || "me" }) : "";
    if (!identEl && identTxt) {
      identEl = document.createElement("div");
      identEl.id = "mainProfileIdent";
      identEl.className = "ident-passions";
      usernameEl.parentNode.insertBefore(identEl, usernameEl.nextSibling);
    }
    if (identEl) {
      // Un libellé vide ne doit rien peindre : une ligne vide sous un pseudo se
      // lit comme un chargement qui n'arrive jamais.
      identEl.textContent = identTxt;
      identEl.title = identTxt;
      identEl.hidden = !identTxt;
    }
  } catch (e) { _v8Echec("ident_passions", e); }
  // Bio : afficher seulement si renseignée (sinon rien, pas de placeholder)
  bioEl.textContent = g.bio || "";
  bioEl.style.display = g.bio ? "" : "none";

  var RS_ICONS = { instagram:"📸", facebook:"👤", tiktok:"🎵", youtube:"▶️", twitter:"𝕏", linkedin:"💼", snapchat:"👻", autre:"🔗" };
  var links = g.rsLinks || [];
  // Réseaux sociaux : afficher seulement s'il y en a (sinon rien)
  rsEl.innerHTML = links.length
    ? links.map(function(l) { return '<a class="main-profile-rs-link" href="' + safeUrlAttr(l.url) + '" target="_blank" rel="noopener noreferrer">' + (RS_ICONS[l.platform]||"🔗") + " " + escapeHtml(l.platform) + '</a>'; }).join("")
    : "";
  rsEl.style.display = links.length ? "" : "none";

  // ADR-009 : plus de pastille score/rang ni de solde Passia sur le profil.
  // Le cœur produit est Passion → contenu → personne → conversation → IRL ;
  // aucun score global ne doit concurrencer cette promesse.

  // Pastille badges : uniquement quand il y en a au moins un (une pastille « 0 »
  // ne raconte rien et encombre la ligne d'identité).
  var badgeChip = document.getElementById("mainProfileBadges");
  if (badgeChip && typeof myBadgeCount === "function") {
    var _nb = myBadgeCount();
    badgeChip.style.display = _nb ? "inline-flex" : "none";
    var _nbEl = document.getElementById("profileBadgeCount");
    if (_nbEl) _nbEl.textContent = _nb;
    badgeChip.title = "🏅 " + _nb + " badge" + (_nb > 1 ? "s" : "") + " — voir le détail";
  }

  var postCount = state.userPosts.length;
  document.getElementById("mainStatPosts").textContent = postCount;
  // Abonnements : vraie donnée locale (les gens que je suis)
  var foEl = document.getElementById("mainStatFollowing"); if (foEl) foEl.textContent = (state.user.following || []).length;
  // Abonnés : vrai compte Supabase (async). Affiche le cache en attendant.
  var fEl = document.getElementById("mainStatFollowers"); if (fEl) fEl.textContent = (typeof window._followersCount === "number" ? window._followersCount : 0);
  loadFollowersCount();

  // Activités — ORGANISÉES et REJOINTES (§6 du lot UI-7).
  // ⚠️ Ce bloc listait `state.seed.events.slice(0,3)`, c'est-à-dire les TROIS
  // PREMIÈRES activités du contenu de démonstration : ni les miennes, ni celles
  // auxquelles je participe. La section s'appelait « Événements participés » et
  // ne montrait donc, littéralement, jamais une participation. On lit désormais
  // les moteurs existants — `allEvents()`, `_isMyEvent()`, `myRsvp()` — sans en
  // créer aucun, et chaque ligne porte une miniature, une date et une ville.
  var eventsEl = document.getElementById("profileEvents");
  if (eventsEl) eventsEl.innerHTML = _myProfileEventsHTML();
  // Refonte multi-passion (§1) : UN SEUL sélecteur, en haut, au-dessus des
  // onglets — il remplace la ligne « Passion active » (UI-8) et les deux
  // rangées de puces jumelles (Publications / Activités), qui disaient trois
  // fois la même chose à trois endroits différents.
  try { renderProfilePassionRail(); } catch (e) { _v8Echec("rail_passions", e); }

  // Top posts
  var topEl = document.getElementById("profileTopPosts");
  if (topEl) {
    // ⚠️ Le bloc « 🔥 Publications populaires » vit dans l'onglet « Publications »,
    // SOUS la rangée de puces de passion — il doit donc obéir au même filtre que la
    // liste qui le suit (`renderProfileContent`, ~653). Il ne le faisait pas :
    // choisir « Moto » vidait la liste du bas en affichant « Rien en Moto — touche
    // Toutes… » pendant que ce bloc-ci, quelques pixels plus haut et sous le même
    // onglet, continuait d'afficher du Yoga et du Podcast. Un filtre qu'un bloc
    // voisin contredit n'est pas un filtre : c'est ce qui rendait l'écran illisible.
    var _mesPosts = state.userPosts || [];
    try {
      if (typeof _postDansFiltreProfil === "function") {
        _mesPosts = _mesPosts.filter(function (x) { return _postDansFiltreProfil(x); });
      }
    } catch (e) {}
    var top = _mesPosts.slice().sort(function(a,b){return(b.likes||0)-(a.likes||0);}).slice(0,3);
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
  // Lot UI-8 : « tous mes posts », c'est le neutre « Toutes », pas une
  // sélection de toutes les cartes (qui n'existe plus).
  if (passionsUnifieesActives()) {
    _migrerFiltresPassion();
    state.user.profilePostFilterId = null;
    saveState();
  }
  window.profilesFilterSelection = new Set((state.user.profiles || []).map(function(p){ return p.id; }));
  _persistProfileFilter();
  window.activeProfileTab = "posts";
  window.profileTabSelection = new Set(["posts"]);
  _persistProfileTabs();
  _syncProfileTabButtons();
  renderProfilesScreen();
  // Sous le lot UI-7, #myPosts vit dans l'onglet « Publications » : défiler
  // vers un nœud masqué ne fait rien. On ouvre l'onglet d'abord — inerte dès
  // que le lot est coupé.
  try {
    if (window.PassioUIV7 && typeof window.PassioUIV7.selectProfileTab === "function"
        && document.querySelector('[data-v7-tab="publications"]')) {
      window.PassioUIV7.selectProfileTab("publications");
    }
  } catch (e) {}
  var anchor = document.getElementById("myPosts");
  if (anchor && anchor.scrollIntoView) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Une ligne de personne (avatar + nom), clic -> ouvre son profil
function _personRowHTML(id, u) {
  return '<div onclick="closeModal();openUserProfile(\'' + escapeJsArg(id) + '\')" style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--border);border-radius:12px;cursor:pointer;">'
    + '<div style="width:40px;height:40px;border-radius:50%;background:' + avatarBg(u) + ';display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">' + avatarInner(u) + '</div>'
    + '<div style="min-width:0;"><div style="font-weight:700;font-size:14px;color:var(--text);">' + escapeHtml(u.name || 'Utilisateur') + '</div>'
    + identitePassionsHTML(u, "ident-passions-sm") + '</div></div>';
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
    const { data: profs } = await supa.from("profiles").select("id,username,emoji,color,passions").in("id", ids);
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

// Onglets de contenu : MULTI-SÉLECTION (union des types cochés).
// L'ordre fait foi pour l'affichage et la persistance.
// ⚠️ « carnets » a quitté cette liste avec la fonctionnalité Carnet de voyage
// (§6). Son bouton est retiré du balisage, son prédicat aussi : un sous-filtre
// qui ne peut plus rien montrer est un contrôle mort.
var PROFILE_TAB_KEYS = ["posts", "photos", "videos", "bobines"];

// Prédicats par type. « posts » = tout (l'onglet historique, non filtrant) : le
// cocher avec d'autres donne donc l'union complète, ce qui reste cohérent.
var PROFILE_TAB_PRED = {
  posts:   function(p) { return true; },
  photos:  function(p) { return !p.isReel && (p.type === "photo" || p.image); },
  videos:  function(p) { return p.type === "video" && !p.isReel; },
  bobines: function(p) { return !!p.isReel; },
};

// Sélection courante (Set), restaurée depuis l'état, repli sur « posts ».
function _profileTabSel() {
  if (!window.profileTabSelection) {
    var saved = ((state.user || {}).contentTabIds) || [];
    var valid = saved.filter(function(k){ return PROFILE_TAB_KEYS.indexOf(k) !== -1; });
    window.profileTabSelection = new Set(valid.length ? valid : ["posts"]);
  }
  return window.profileTabSelection;
}

// Compat : anciens appelants qui voulaient UN onglet → le premier coché.
function _activeProfileTab() {
  var sel = _profileTabSel();
  for (var i = 0; i < PROFILE_TAB_KEYS.length; i++) {
    if (sel.has(PROFILE_TAB_KEYS[i])) return PROFILE_TAB_KEYS[i];
  }
  return "posts";
}

function _persistProfileTabs() {
  try {
    if (!state.user) return;
    state.user.contentTabIds = [...(_profileTabSel())];
    saveState();
  } catch (e) {}
}

// Reflète la sélection sur les boutons (classe + aria-pressed).
function _syncProfileTabButtons() {
  var sel = _profileTabSel();
  // Scopé à MON écran profil : la vue « profil visité » (app-04) a ses propres
  // onglets .profile-tab dans #visitedTabs, avec leur propre sélection.
  document.querySelectorAll("#screen-profiles .profile-tab").forEach(function(b){
    var k = b.getAttribute("data-tab");
    var on = !!k && sel.has(k);
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

// Activités de MON profil : celles que j'organise et celles où j'ai répondu
// (« je viens », « peut-être », liste d'attente). Les à-venir d'abord, du plus
// proche au plus lointain, puis les passées de la plus récente à la plus
// ancienne — l'écran de profil sert d'abord à retrouver ce qui arrive.
// Aucun moteur nouveau : `allEvents`, `_isMyEvent` et `myRsvp` sont ceux d'IRL.
function _myProfileEvents(limit) {
  var out = [];
  try {
    var tous = (typeof allEvents === "function") ? allEvents() : [];
    out = tous.filter(function (e) {
      if (!e) return false;
      var mien = (typeof _isMyEvent === "function") ? _isMyEvent(e) : false;
      var rep = (typeof myRsvp === "function") ? myRsvp(e.id) : null;
      return mien || (rep && rep !== "declined");
    });
  } catch (e) {
    // ⚠️ Jamais muet : un `catch` large sur un chemin d'affichage a déjà masqué
    // un ReferenceError six jours dans ce dépôt (fiche « catch large »).
    if (typeof diagLog === "function") diagLog("profil_activites " + (e && e.message));
    else if (window.console && console.error) console.error("[profil] activités :", e);
    return [];
  }
  // Lot UI-8 : filtre à choix unique de l'onglet « Activités ». Aucun moteur IRL
  // parallèle — on ne fait que restreindre la liste déjà produite par `allEvents`,
  // `_isMyEvent` et `myRsvp`. `limit === 9999` est l'appel de COMPTAGE des cartes
  // de passion : il ne doit jamais être restreint par le filtre d'affichage.
  if (limit !== 9999 && typeof passionsUnifieesActives === "function" && passionsUnifieesActives()) {
    try {
      out = out.filter(function (e) { return _evtDansFiltreProfil(e); });
    } catch (x) {}
  }
  var maintenant = Date.now();
  out.sort(function (a, b) {
    var fa = a.date >= maintenant, fb = b.date >= maintenant;
    if (fa !== fb) return fa ? -1 : 1;
    return fa ? (a.date - b.date) : (b.date - a.date);
  });
  return out.slice(0, limit || 4);
}

// Une ligne = miniature + titre + « date · ville ». Tout contenu d'activité
// passe par escapeHtml (titre, ville), l'identifiant par escapeJsArg (argument
// JS d'un onclick) et la couverture par safeUrlAttr (URL posée par autrui).
function _myProfileEventsHTML() {
  var evs = _myProfileEvents(passionsUnifieesActives() ? 8 : 4);
  if (!evs.length) {
    var _f = "";
    try { if (passionsUnifieesActives()) _f = _libelleFiltreProfil(); } catch (x) {}
    var _msg = _f
      ? "Aucune activité en " + _f + " pour l'instant — décoche cette passion ou propose une sortie depuis « Rencontrer »."
      : "Aucune activité pour le moment — rejoins ou propose une sortie depuis « Rencontrer ».";
    return '<div style="font-size:12px;color:var(--muted);padding:10px;">' + escapeHtml(_msg) + '</div>';
  }
  return evs.map(function (e) {
    var emoji = e.emoji || "📍";
    try {
      if (!e.emoji && typeof passionById === "function") emoji = (passionById(e.passion) || {}).emoji || "📍";
    } catch (x) {}
    var vignette = e.coverUrl
      ? '<img loading="lazy" decoding="async" src="' + safeUrlAttr(e.coverUrl) + '" alt="" '
        + 'style="width:100%;height:100%;object-fit:cover;display:block;" '
        + 'onerror="this.style.display=\'none\'"/>'
      : '<span style="font-size:20px;">' + escapeHtml(String(emoji)) + '</span>';
    var quand = "";
    try {
      quand = new Date(e.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    } catch (x) {}
    var bas = [quand, e.city ? String(e.city) : ""].filter(Boolean).join(" · ");
    var role = ((typeof _isMyEvent === "function") && _isMyEvent(e)) ? "Tu organises" : "";
    return '<div data-profile-event="' + escapeHtml(String(e.id)) + '" '
      + 'onclick="openEventDetails(\'' + escapeJsArg(String(e.id)) + '\')" '
      + 'style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-card);'
      + 'border:1px solid var(--border);border-radius:12px;margin-bottom:6px;cursor:pointer;">'
      + '<div style="width:44px;height:44px;flex:0 0 44px;border-radius:10px;overflow:hidden;'
      + 'background:var(--bg-tint);display:grid;place-items:center;">' + vignette + '</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-weight:700;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
      + escapeHtml(e.title || "Activité") + '</div>'
      + '<div style="font-size:10.5px;color:var(--muted);">' + escapeHtml(bas) + '</div>'
      + '</div>'
      + (role ? '<span style="font-size:10px;color:var(--muted);white-space:nowrap;">' + role + '</span>' : '')
      + '</div>';
  }).join("");
}

// Rend la zone #myPosts selon l'onglet actif ET la multi-sélection de profils.
// Sélection vide => invite à sélectionner (pas de fallback profil actif).
function renderProfileContent() {
  var myPostsDiv = document.getElementById("myPosts");
  if (!myPostsDiv) return;

  // ⚠️ AUCUNE PASSION COCHÉE = AUCUN FILTRE, donc TOUT s'affiche.
  //
  // Ce n'était pas le cas, et le défaut était double. ① « Réinitialiser » —
  // le seul mot que porte cette ligne — appelle `clearProfilesFilter()`, qui
  // VIDAIT l'écran au lieu de retirer le filtre : une remise à zéro qui efface
  // le contenu ne remet rien à zéro. ② Un compte neuf n'a pas encore de
  // `profileFilterIds` : il arrivait donc sur « Sélectionne un profil passion »
  // et ne voyait AUCUNE de ses publications, sans avoir rien filtré.
  //
  // La règle appliquée ici est celle que ce fichier énonce déjà quinze lignes
  // plus bas pour les types de contenu — « Aucune icône cochée = AUCUN filtre :
  // on affiche tout (et non un état vide) ». Les deux rangées vivent sur le même
  // écran ; elles se contredisaient.
  // ⚠️ Les carnets (§6) sont retirés de l'affichage, y compris sur MON profil.
  // `allFeedPosts` les exclut déjà pour le fil, mais cette liste-ci lit
  // `state.userPosts` en direct : sans ce filtre, un carnet ancien s'y
  // afficherait avec un `onclick` vers un viewer qui n'existe plus.
  var mine = state.userPosts.filter(function (p) { return p && p.type !== "vlog"; });

  if (passionsUnifieesActives()) {
    // ── LOT UI-8 : le filtre de contenu vit ICI, dans « Publications », et il
    // est à choix UNIQUE. « Toutes » (aucun filtre) est le neutre. Les anciennes
    // publications qui n'ont qu'une passion OU qu'un profileId restent
    // atteignables : l'appariement est le même que celui de la multisélection
    // historique (`_postDeLaPassion`).
    mine = mine.filter(function (p) { return _postDansFiltreProfil(p); });
  } else {
    var sel = window.profilesFilterSelection || new Set();

    // Filtrage cohérent : un profil sélectionné = sa passion. On matche STRICTEMENT
    // par PASSION (donnée fiable, figée à la création). Le profileId ne sert QUE de
    // repli pour un post sans passion. Matcher aussi par profileId (comme avant)
    // faisait fuiter un post « photo » publié pendant que le profil « musique » était
    // actif (profileId=musique) DANS le profil musique, et le double-comptait.
    if (sel.size > 0) {
      var selProfiles = (state.user.profiles || []).filter(function(pr){ return sel.has(pr.id); });
      var selPassions = new Set(selProfiles.map(function(pr){ return pr.passion; }));
      mine = mine.filter(function(p){ return selPassions.has(p.passion) || (!p.passion && sel.has(p.profileId)); });
    }
  }

  // Multi-sélection des types : union des prédicats cochés.
  var tabSel = _profileTabSel();
  var tabKeys = PROFILE_TAB_KEYS.filter(function(k){ return tabSel.has(k); });
  // Aucune icône cochée = AUCUN filtre : on affiche tout (et non un état vide).
  var tab = tabKeys.length === 1 ? tabKeys[0] : null; // null = vue mixte / non filtrée
  if (tabKeys.length) {
    mine = mine.filter(function(p){
      return tabKeys.some(function(k){ return PROFILE_TAB_PRED[k](p); });
    });
  }

  // État vide guidé — même format que l'état vide des bobines (emoji + titre +
  // texte + bouton primaire), CTA direct vers le Studio. On reste sur la classe
  // inline `.empty` (et non `.reels-empty`, qui est en position:absolute pour le
  // viewer plein écran des bobines et casserait la mise en page ici).
  // Lot UI-8 : quand un filtre de passion est posé, l'état vide doit dire que
  // c'est LUI qui vide l'écran — sinon il affirme « tu n'as rien publié » à
  // quelqu'un qui a publié ailleurs.
  var _filtreNom = "";
  try {
    if (passionsUnifieesActives()) {
      _filtreNom = _libelleFiltreProfil();
    }
  } catch (e) { _v8Echec("etat_vide", e); }

  function guidedEmpty(emoji, title, text) {
    if (_filtreNom) {
      title = "Rien en " + _filtreNom;
      text = "Touche « Toutes » pour revoir tout ce que tu as publié, ou crée dans cette passion.";
    }
    return '<div class="empty">'
      + '<div class="empty-icon">'+emoji+'</div>'
      + '<div class="empty-title">'+title+'</div>'
      + '<div class="empty-text">'+text+'</div>'
      + '<button class="btn primary" onclick="goTo(\'studio\')">✨ Créer un post</button>'
      + '</div>';
  }

  if (tab==="photos") {
    var photos = mine.filter(function(p){return !p.isReel && (p.type==="photo"||p.image);});
    myPostsDiv.innerHTML = photos.length ? '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;">'+photos.map(function(p){var src=p.image||"https://picsum.photos/seed/"+p.id+"/300/300";return '<div style="aspect-ratio:1;border-radius:8px;overflow:hidden;"><img loading="lazy" decoding="async" src="'+src+'" style="width:100%;height:100%;object-fit:cover;"/></div>';}).join("")+'</div>' : guidedEmpty("📷","Ajoute ta première photo","Un cliché de ton univers, ton atelier, ton travail en cours.");
  } else if (tab==="videos") {
    // Vidéos « classiques » : on exclut les bobines (elles ont leur propre onglet).
    var videos = mine.filter(function(p){return p.type==="video" && !p.isReel;});
    myPostsDiv.innerHTML = videos.length ? videos.map(function(p){return renderPostHTML(Object.assign({},p,{_source:"me"}));}).join("") : guidedEmpty("🎬","Publie ta première vidéo","Montre ton geste, ton processus en mouvement.");
  } else if (tab==="bobines") {
    var bobines = mine.filter(function(p){return p.isReel;});
    myPostsDiv.innerHTML = bobines.length
      ? '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;">'+bobines.map(function(p){
          var poster = p.image || p.poster || "";
          var thumb = poster
            ? '<img loading="lazy" decoding="async" src="'+poster+'" style="width:100%;height:100%;object-fit:cover;"/>'
            : (p.video ? '<video src="'+p.video+'#t=0.1" muted playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;background:#000;"></video>' : '<div style="width:100%;height:100%;background:linear-gradient(135deg,#7c3aed,#a78bfa);"></div>');
          return '<div onclick="openReelById(\''+escapeJsArg(p.id)+'\')" style="aspect-ratio:9/16;border-radius:8px;overflow:hidden;position:relative;cursor:pointer;">'+thumb+'<span style="position:absolute;left:6px;bottom:6px;font-size:14px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6));">🎞️</span></div>';
        }).join("")+'</div>'
      // ⚠️ `emptyBlock` n'a jamais existé → ReferenceError en prod (8× le 20/07)
      // pour tout profil sans bobine ouvrant cet onglet. guidedEmpty est le
      // même état vide que les autres onglets.
      : guidedEmpty("🎞️","Aucune bobine","Filme un moment de ta passion en format vertical.");
  } else {
    // État vide guidé : au lieu d'un simple « rien publié », on invite à créer
    // (raccourci direct vers le Studio), au même format que l'état vide des bobines.
    myPostsDiv.innerHTML = mine.length
      ? mine.map(function(p){return renderPostHTML(Object.assign({},p,{_source:"me"}));}).join("")
      : guidedEmpty("🎨","Publie ta première création","Montre ton processus, pas juste le résultat.");
  }
}

// Bascule un type de contenu (multi-sélection) : re-toucher une icône la décoche.
function switchProfileTab(tab, btn) {
  if (PROFILE_TAB_KEYS.indexOf(tab) === -1) return;
  var sel = _profileTabSel();
  if (sel.has(tab)) sel.delete(tab); else sel.add(tab);
  window.activeProfileTab = _activeProfileTab(); // compat
  _persistProfileTabs();
  _syncProfileTabButtons();
  renderProfileContent();
}

function shareMyProfile() {
  var name = ((state.user.general||{}).username || state.user.name || "Passionné");
  // Lien de profil suivi (?plk) : apparie le partage à une ouverture confirmée.
  var _lk = (window.tel && tel.linkCreate) ? tel.linkCreate("profile", (window.MY_UID || name)) : "";
  var url = (_lk && tel.tagUrl) ? tel.tagUrl(window.location.href, _lk) : window.location.href;
  if (navigator.share) {
    _telLinkShare(url, "native");
    navigator.share({title:name+" sur PASSIO",text:"Découvre mon profil sur PASSIO !",url:url});
  } else {
    if (navigator.clipboard) navigator.clipboard.writeText(url);
    _telLinkShare(url, "clipboard");
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
    // 3) Pousse l'URL — et ELLE SEULE. Republier le profil complet ici, c'était
    // réécrire pseudo, bio et confidentialité depuis l'état local à chaque
    // changement de photo (P0 confidentialité du 2026-08-31).
    // `field` vaut "avatarPhoto" ou "coverPhoto" ; la colonne correspondante est
    // `avatar_url` / `cover_url`, et on ne publie qu'une URL Storage.
    const _col = (field === "avatarPhoto") ? "avatar_url" : (field === "coverPhoto" ? "cover_url" : null);
    const _val = state.user.general[field];
    if (_col && typeof _val === "string" && /^https?:\/\//.test(_val) && typeof supaSavePublicProfile === "function") {
      await supaSavePublicProfile({ [_col]: _val });
    } else if (typeof supaEnsureProfileExists === "function") {
      await supaEnsureProfileExists();   // la ligne doit exister, rien de plus
    }
  } catch (e) { console.warn("Sync photo profil échouée:", e && e.message); }
}

// ════════════════════════════════════════════════════════════════════════
// RECADREUR DE PHOTO (vanilla, sans dépendance) — utilisé pour l'avatar, la
// couverture et les photos de profil passion. Glisser pour déplacer, molette /
// pince / curseur pour zoomer ; exporte un JPEG recadré à la bonne résolution.
// passioOpenCropper(src, {aspect,outW,outH,round,title}) → Promise<dataUrl>.
// ════════════════════════════════════════════════════════════════════════
function passioOpenCropper(src, opts) {
  opts = opts || {};
  var aspect = opts.aspect || 1;
  var outW = opts.outW || 480;
  var outH = opts.outH || Math.round(outW / aspect);
  var round = !!opts.round;
  var title = opts.title || "Recadrer la photo";
  return new Promise(function(resolve, reject) {
    var VW = Math.min((window.innerWidth || 360) - 48, 360);
    var VH = Math.round(VW / aspect);
    var ov = document.createElement("div");
    ov.className = "passio-cropper-ov";
    ov.style.cssText = "position:fixed;inset:0;z-index:6000;background:rgba(0,0,0,0.88);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;";
    ov.innerHTML =
      '<div style="color:#fff;font-weight:800;font-size:16px;margin-bottom:14px;text-align:center;">' + escapeHtml(title) + '</div>'
      + '<div id="pcropView" style="position:relative;width:' + VW + 'px;height:' + VH + 'px;overflow:hidden;border-radius:' + (round ? "50%" : "14px") + ';touch-action:none;background:#000;box-shadow:0 0 0 2px rgba(255,255,255,0.9);cursor:grab;">'
      + '<img id="pcropImg" alt="" draggable="false" style="position:absolute;left:0;top:0;user-select:none;-webkit-user-drag:none;max-width:none;"/>'
      + '<div class="pcrop-grid" style="position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,0.35) 1px,transparent 1px),linear-gradient(rgba(255,255,255,0.35) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.35) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.35) 1px,transparent 1px);background-position:0 33.33%,0 66.66%,33.33% 0,66.66% 0;background-size:100% 1px,100% 1px,1px 100%,1px 100%;background-repeat:no-repeat;"></div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:10px;width:' + VW + 'px;margin-top:16px;">'
      + '<span style="display:inline-flex;"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" aria-hidden=\"true\" style=\"width:14px;height:14px;color:var(--muted);display:block;\"><circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M20 20 L16.4 16.4\"/></svg></span>'
      + '<input id="pcropZoom" type="range" min="1" max="4" step="0.01" value="1" style="flex:1;accent-color:var(--accent);"/>'
      + '</div>'
      + '<div style="display:flex;gap:10px;margin-top:18px;width:' + VW + 'px;">'
      + '<button class="btn ghost" id="pcropCancel" style="flex:1;background:rgba(255,255,255,0.12);color:#fff;border-color:rgba(255,255,255,0.25);">Annuler</button>'
      + '<button class="btn primary" id="pcropOk" style="flex:1;">Valider</button>'
      + '</div>'
      + '<div style="color:rgba(255,255,255,0.6);font-size:11px;margin-top:10px;text-align:center;">Glisse pour déplacer · pince ou molette pour zoomer</div>';
    document.body.appendChild(ov);

    var img = ov.querySelector("#pcropImg");
    var view = ov.querySelector("#pcropView");
    var zoomEl = ov.querySelector("#pcropZoom");
    var NW = 0, NH = 0, baseScale = 1, zoom = 1, ox = 0, oy = 0;

    function clamp() {
      var dispW = NW * baseScale * zoom, dispH = NH * baseScale * zoom;
      ox = Math.min(0, Math.max(VW - dispW, ox));
      oy = Math.min(0, Math.max(VH - dispH, oy));
    }
    function apply() {
      clamp();
      img.style.width = (NW * baseScale * zoom) + "px";
      img.style.height = (NH * baseScale * zoom) + "px";
      img.style.left = ox + "px";
      img.style.top = oy + "px";
    }
    function zoomTo(nz, cx, cy) {
      nz = Math.min(4, Math.max(1, nz));
      var k = nz / zoom;
      ox = cx - (cx - ox) * k; oy = cy - (cy - oy) * k;
      zoom = nz; zoomEl.value = zoom; apply();
    }
    img.onload = function() {
      NW = img.naturalWidth || 1; NH = img.naturalHeight || 1;
      baseScale = Math.max(VW / NW, VH / NH);
      zoom = 1;
      ox = (VW - NW * baseScale) / 2; oy = (VH - NH * baseScale) / 2;
      apply();
    };
    img.onerror = function() { ov.remove(); reject(new Error("img load failed")); };
    img.src = src;

    zoomEl.addEventListener("input", function() { zoomTo(parseFloat(zoomEl.value), VW / 2, VH / 2); });
    view.addEventListener("wheel", function(e) {
      e.preventDefault();
      var rect = view.getBoundingClientRect();
      zoomTo(zoom * (e.deltaY < 0 ? 1.08 : 0.92), e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    var pts = {}, pinch = null;
    view.addEventListener("pointerdown", function(e) {
      try { view.setPointerCapture(e.pointerId); } catch (_) {}
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      view.style.cursor = "grabbing";
      if (Object.keys(pts).length === 2) {
        var a = Object.values(pts);
        pinch = { dist: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), zoom: zoom };
      }
    });
    view.addEventListener("pointermove", function(e) {
      if (!pts[e.pointerId]) return;
      var prev = pts[e.pointerId];
      if (Object.keys(pts).length === 2 && pinch) {
        pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        var a = Object.values(pts);
        var dist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        var rect = view.getBoundingClientRect();
        zoomTo(pinch.zoom * (dist / pinch.dist), (a[0].x + a[1].x) / 2 - rect.left, (a[0].y + a[1].y) / 2 - rect.top);
        return;
      }
      var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      ox += dx; oy += dy; apply();
    });
    function up(e) { delete pts[e.pointerId]; if (Object.keys(pts).length < 2) pinch = null; view.style.cursor = "grab"; }
    view.addEventListener("pointerup", up);
    view.addEventListener("pointercancel", up);

    ov.querySelector("#pcropCancel").onclick = function() { ov.remove(); reject(new Error("cancelled")); };
    ov.querySelector("#pcropOk").onclick = function() {
      try {
        var s = baseScale * zoom;
        var c = document.createElement("canvas");
        c.width = outW; c.height = outH;
        var ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, (-ox) / s, (-oy) / s, VW / s, VH / s, 0, 0, outW, outH);
        var out = c.toDataURL("image/jpeg", 0.9);
        ov.remove(); resolve(out);
      } catch (err) { ov.remove(); reject(err); }
    };
  });
}

// Lit le fichier choisi, ouvre le recadreur, renvoie le dataURL recadré.
function _readAndCrop(file, cropOpts) {
  return new Promise(function(resolve, reject) {
    if (!file) { reject(new Error("no file")); return; }
    var reader = new FileReader();
    reader.onload = function(e) { passioOpenCropper(e.target.result, cropOpts).then(resolve, reject); };
    reader.onerror = function() { reject(reader.error); };
    reader.readAsDataURL(file);
  });
}

function changeCoverPhoto(event) {
  const file = event.target.files[0];
  if (event.target) event.target.value = "";
  if (!file) { _reopenEditProfileAfterCover(); return; }
  // 3:2 — même ratio que l'affichage .main-profile-cover (agrandi le 2026-07-20) :
  // la photo est visible ENTIÈRE sur le profil, telle que cadrée ici.
  _readAndCrop(file, { aspect: 3 / 2, outW: 1080, outH: 720, round: false, title: "Recadre ta photo de couverture" })
    .then(function(dataUrl) {
      _syncProfilePhoto("coverPhoto", "covers", dataUrl);
      toast("📷 Photo de couverture mise à jour !");
      _reopenEditProfileAfterCover();
    })
    .catch(function() { _reopenEditProfileAfterCover(); });
}

// Rouvre la modale « Mon profil principal » si le changement de couverture a été
// lancé depuis elle (le recadreur l'avait remplacée).
function _reopenEditProfileAfterCover() {
  if (!window._editProfileReopen) return;
  window._editProfileReopen = false;
  setTimeout(function() { if (typeof openEditMainProfile === "function") openEditMainProfile(); }, 220);
}

function changeAvatarPhoto(event) {
  const file = event.target.files[0];
  if (event.target) event.target.value = "";
  if (!file) return;
  _readAndCrop(file, { aspect: 1, outW: 480, outH: 480, round: true, title: "Recadre ta photo de profil" })
    .then(function(dataUrl) {
      _syncProfilePhoto("avatarPhoto", "avatars", dataUrl);
      toast("📷 Photo de profil mise à jour !");
    })
    .catch(function() {});
}

function changePassionPhoto(event, profileId) {
  const file = event.target.files[0];
  if (event.target) event.target.value = "";
  if (!file) { _reopenEditPassionAfterPhoto(); return; }
  _readAndCrop(file, { aspect: 1, outW: 480, outH: 480, round: true, title: "Recadre la photo de la passion" })
    .then(async function(base64) {
    const prof = state.user.profiles.find(p => p.id === profileId);
    if (!prof) return;
    prof.photo = base64; // cache local immédiat pour l'affichage
    saveState();
    renderProfilesScreen();
    toast("📷 Photo de la passion mise à jour !");
    _reopenEditPassionAfterPhoto();
    // Tente un upload vers Storage → stocke l'URL (sync cross-appareil sans base64)
    if (typeof supaUploadMedia === "function" && window._supaReal) {
      try {
        // ⚠️ Signature `(postId, folder, base64, type)` — l'ancien appel
        // `(base64, folder, "photo")` visait une définition supprimée et
        // renvoyait la chaîne "photo" en guise d'URL (photoUrl corrompue).
        const url = await supaUploadMedia(profileId, "passion_photos", base64, "photo");
        // On ne stocke QUE une vraie URL http : le fallback base64 ne doit pas
        // partir dans user_state (payload ~1 Mo max, et _syncableState ne
        // strippe que prof.photo, pas photoUrl).
        if (url && url.indexOf("http") === 0) {
          prof.photoUrl = url;
          saveState();
        }
      } catch(_e) {}
    }
    // Flush immédiat vers user_state (sans attendre le debounce 2500ms).
    if (typeof supaSaveUserState === "function") { try { supaSaveUserState(); } catch(_e) {} }
    // La photo d'une passion n'atteint les VISITEURS que par `profiles.passions`,
    // écrit uniquement par `supaSavePassionState` (cf. `savePassionProfile`).
    if (typeof supaSavePassionState === "function") { try { supaSavePassionState(); } catch(_e) {} }
    })
    .catch(function() { _reopenEditPassionAfterPhoto(); });
}

// Photo de FOND d'un profil passion (bandeau derrière la carte). Même chaîne
// que la couverture principale : recadrage 3:2, cache local base64 puis URL
// Storage quand l'upload aboutit (le base64 ne part pas dans user_state).
function changePassionCoverPhoto(event, profileId) {
  const file = event.target.files[0];
  if (event.target) event.target.value = "";
  if (!file) { _reopenEditPassionAfterPhoto(); return; }
  _readAndCrop(file, { aspect: 3 / 2, outW: 1080, outH: 720, round: false, title: "Recadre la photo de fond" })
    .then(async function(base64) {
      const prof = state.user.profiles.find(p => p.id === profileId);
      if (!prof) return;
      prof.coverPhoto = base64; // cache local immédiat
      saveState();
      renderProfilesScreen();
      toast("📷 Photo de fond mise à jour !");
      _reopenEditPassionAfterPhoto();
      if (typeof supaUploadMedia === "function" && window._supaReal) {
        try {
          const url = await supaUploadMedia(profileId + "_cover", "passion_covers", base64, "photo");
          if (url && url.indexOf("http") === 0) { prof.coverUrl = url; saveState(); }
        } catch(_e) {}
      }
      if (typeof supaSaveUserState === "function") { try { supaSaveUserState(); } catch(_e) {} }
      if (typeof supaSavePassionState === "function") { try { supaSavePassionState(); } catch(_e) {} }
    })
    .catch(function() { _reopenEditPassionAfterPhoto(); });
}

// ⋯ MENU D'ÉDITION DES PROFILS (2026-07-20) — remplace le crayon ✏️ par trois
// petits points discrets en haut à droite de la carte (profil principal ET
// cartes de profil passion). Le menu est un popover ancré au bouton ; il se
// ferme au clic extérieur, au scroll, à Escape ou après un choix.
// Préfixe `_profileDots*` pour éviter toute collision de globals (cf. CLAUDE.md).
function _profileDotsClose() {
  const old = document.getElementById("profileDotsMenu");
  if (old) old.remove();
  document.removeEventListener("click", _profileDotsClose, true);
  window.removeEventListener("scroll", _profileDotsClose, true);
  window.removeEventListener("resize", _profileDotsClose, true);
  document.removeEventListener("keydown", _profileDotsKey);
}

function _profileDotsKey(e) {
  if (e.key === "Escape") _profileDotsClose();
}

// items = [{ icon, label, run: function, danger?:true }]
function _profileDotsOpen(ev, items) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  const btn = ev && ev.currentTarget;
  const already = document.getElementById("profileDotsMenu");
  _profileDotsClose();
  if (already) return; // re-clic sur les ⋯ = fermeture

  const menu = document.createElement("div");
  menu.id = "profileDotsMenu";
  menu.className = "profile-dots-menu";
  menu.setAttribute("role", "menu");
  items.forEach(function(it, i) {
    const b = document.createElement("button");
    b.className = "profile-dots-item" + (it.danger ? " danger" : "");
    b.setAttribute("role", "menuitem");
    b.innerHTML = '<span class="profile-dots-ico">' + escapeHtml(it.icon || "") + "</span>" + escapeHtml(it.label || "");
    b.onclick = function(e) {
      e.stopPropagation();
      _profileDotsClose();
      try { it.run(); } catch (err) {}
    };
    menu.appendChild(b);
    if (it.sep && i < items.length - 1) {
      const hr = document.createElement("div");
      hr.className = "profile-dots-sep";
      menu.appendChild(hr);
    }
  });
  document.body.appendChild(menu);

  // Ancrage sous le bouton, aligné à droite, borné à la fenêtre.
  const r = btn ? btn.getBoundingClientRect() : { bottom: 60, right: window.innerWidth - 12 };
  const w = menu.offsetWidth || 210;
  let left = Math.min(r.right - w, window.innerWidth - w - 8);
  if (left < 8) left = 8;
  let top = r.bottom + 6;
  const h = menu.offsetHeight || 160;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  menu.style.left = left + "px";
  menu.style.top  = top + "px";

  setTimeout(function() {
    document.addEventListener("click", _profileDotsClose, true);
    window.addEventListener("scroll", _profileDotsClose, true);
    window.addEventListener("resize", _profileDotsClose, true);
    document.addEventListener("keydown", _profileDotsKey);
  }, 0);
}

// Menu du PROFIL PRINCIPAL (⋯ en haut à droite de la couverture).
function openMainProfileMenu(ev) {
  _profileDotsOpen(ev, [
    { icon: "✏️", label: "Modifier le profil", run: function() { openEditMainProfile(); } },
    { icon: "🖼️", label: "Photo de profil",    run: function() { const i = document.getElementById("avatarPhotoInput"); if (i) i.click(); } },
    { icon: "🌄", label: "Photo de couverture", run: function() { const i = document.getElementById("coverPhotoInput"); if (i) i.click(); }, sep: true },
    // ⚠️ LA SEULE PORTE VERS LA GESTION DES PASSIONS depuis la refonte
    // multi-passion : l'onglet « À propos » qui la portait a disparu (§1).
    // Retirer un onglet ne doit jamais emporter la seule commande d'une
    // fonction — ajouter, renommer, illustrer ou archiver une passion passe
    // désormais par ici.
    { icon: "🗂️", label: "Mes passions", run: function() { if (typeof openPassionManager === "function") openPassionManager(); } },
    { icon: "🎨", label: "Apparence & thème",   run: function() { if (typeof openConfigurator === "function") openConfigurator(); } }
  ]);
}

// Menu d'un PROFIL PASSION (⋯ en haut à droite de la carte).
function openPassionProfileMenu(ev, profileId) {
  const p = (state.user.profiles || []).find(x => x.id === profileId);
  if (!p) return;
  const passion = passionById(p.passion);
  // ⚠️ Lot UI-8 : « Supprimer ce profil » effaçait la passion ET TOUS SES POSTS.
  // Elle est remplacée par l'archivage, qui ne retire aucun contenu. La
  // suppression reste le comportement rendu par le kill switch.
  var v8 = passionsUnifieesActives();
  var dernier = v8
    ? { icon: "🗄️", label: "Archiver cette passion", run: function() { confirmArchivePassion(profileId); } }
    : { icon: "🗑", label: "Supprimer ce profil", danger: true, run: function() { confirmDeleteProfile(profileId, (passion && passion.label) || ""); } };
  _profileDotsOpen(ev, [
    { icon: "✏️", label: v8 ? "Modifier cette passion" : "Modifier ce profil", run: function() { openEditPassionProfile(profileId); } },
    { icon: "🖼️", label: v8 ? "Photo de la passion" : "Photo du profil",    run: function() { const i = document.getElementById("passionPhoto_" + profileId); if (i) i.click(); } },
    { icon: "🌄", label: "Photo de fond",      run: function() { const i = document.getElementById("passionCover_" + profileId); if (i) i.click(); }, sep: true },
    dernier
  ]);
}

// ⚠️ PREUVE D'INTERACTION, pas déduction. Le marqueur `privacyChoisi` ne doit
// PAS se déduire de la valeur finale au moment de la soumission : « la case est
// décochée » ne distingue pas « j'ai choisi public » de « je n'y ai pas touché ».
// Seul un `change` sur le contrôle prouve un geste.
function marquerConfidentialiteTouchee() { window._privacyTouched = true; }

function openEditMainProfile() {
  // Remis à zéro à CHAQUE ouverture : un geste d'hier ne prouve pas celui d'aujourd'hui.
  // (`editCoverFromModal` réouvre la modale ; il restaure ce drapeau lui-même.)
  window._privacyTouched = false;
  // ⚠️ HYDRATATION SERVEUR, en arrière-plan. La case est d'abord rendue depuis
  // l'état local (instantané), puis corrigée dès que la base répond — sinon un
  // profil créé PRIVÉ par `ensure` s'afficherait public, et le rendre vraiment
  // public demanderait deux allers-retours au lieu d'un geste.
  // On ne corrige QUE si la personne n'a pas encore touché au contrôle : sinon
  // la case basculerait sous son doigt.
  setTimeout(function () {
    try {
      if (typeof supaHydraterConfidentialite !== "function") return;
      supaHydraterConfidentialite().then(function (v) {
        if (v === null || v === undefined) return;
        if (window._privacyTouched === true) return;
        var el = document.getElementById("editIsPrivate");
        if (el) el.checked = !!v;
      }).catch(function () {});
    } catch (e) {}
  }, 0);
  const g = state.user.general || {};
  const RS_LIST = ["instagram","tiktok","facebook","youtube","twitter","linkedin","snapchat","autre"];
  const links = g.rsLinks || [];

  const html = `
    <div class="modal-handle"></div>
    <div class="modal-title">✏️ Mon profil principal</div>

    <!-- Photo de couverture : unique point d'entrée (le bouton « Changer » a été
         retiré de la carte profil pour ne garder QU'UN seul onglet d'édition). -->
    <div class="field">
      <span>Photo de couverture</span>
      <div style="display:flex;gap:8px;align-items:center;">
        <div id="editCoverPreview" style="flex:1;height:64px;border-radius:12px;border:1px solid var(--border);background:${g.coverPhoto ? "url(" + safeUrlAttr(g.coverPhoto) + ") center/cover" : "linear-gradient(135deg,#8b5cf6,#6d28d9)"};"></div>
        <button class="btn ghost" style="white-space:nowrap;" onclick="editCoverFromModal()">📷 Changer</button>
      </div>
    </div>

    <label class="field">
      <span>Pseudo</span>
      <input type="text" class="input" id="editUsername" value="${escapeHtml(g.username || state.user.name || "")}" maxlength="40" placeholder="Ton nom sur PASSIO"/>
    </label>

    <label class="field">
      <span>Biographie <span style="font-weight:400;color:var(--muted);" id="bioCount">${(g.bio||"").length}/200</span></span>
      <textarea class="textarea" id="editBio" maxlength="200" placeholder="Présente-toi en quelques mots, parle de tes passions…" style="min-height:90px;">${escapeHtml(g.bio||"")}</textarea>
    </label>

    <!-- Confidentialité : compte privé (façon Instagram). L'en-tête du profil
         (avatar, pseudo, passions, compteurs) reste public ; seul le CONTENU
         est réservé aux abonnés. -->
    <div class="field">
      <span>Confidentialité</span>
      <label style="display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid var(--border);border-radius:12px;cursor:pointer;">
        <input type="checkbox" id="editIsPrivate" ${g.isPrivate ? "checked" : ""} onchange="marquerConfidentialiteTouchee()" style="width:20px;height:20px;flex-shrink:0;margin-top:1px;accent-color:var(--accent);"/>
        <span style="flex:1;">
          <span style="display:block;font-weight:700;font-size:13px;color:var(--text);">🔒 Compte privé</span>
          <span style="display:block;font-size:11px;color:var(--muted);line-height:1.45;margin-top:3px;">Seuls tes abonnés peuvent voir tes publications, photos, bobines et carnets. Ton pseudo, ton avatar et tes passions restent visibles pour que l'on puisse te trouver.</span>
        </span>
      </label>
    </div>

    <div style="font-weight:700;font-size:13px;color:var(--text);margin:14px 0 10px;">🔗 Mes réseaux sociaux</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${RS_LIST.map(platform => {
        const icons = { instagram:"📸", tiktok:"🎵", facebook:"👤", youtube:"▶️", twitter:"𝕏", linkedin:"💼", snapchat:"👻", autre:"🔗" };
        const existing = links.find(l => l.platform === platform);
        return `<div style="display:flex;align-items:center;gap:8px;">
          <span style="width:24px;text-align:center;font-size:16px;">${icons[platform]||"🔗"}</span>
          <input type="url" class="input rs-link-input" data-platform="${escapeHtml(platform)}"
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

  // Restaure la saisie en cours si on revient d'un changement de couverture
  // (le recadrage ouvre sa propre modale et fermait celle-ci).
  const draft = window._editProfileDraft;
  if (draft) {
    window._editProfileDraft = null;
    const u = document.getElementById("editUsername"); if (u) u.value = draft.username || "";
    if (bioTa) { bioTa.value = draft.bio || ""; if (bioCount) bioCount.textContent = `${bioTa.value.length}/200`; }
    const pv = document.getElementById("editIsPrivate"); if (pv) pv.checked = !!draft.isPrivate;
    // Un aller-retour par le recadreur ne doit pas effacer la preuve du geste.
    window._privacyTouched = !!draft.privacyTouched;
    (draft.rs || []).forEach(function(r) {
      const inp = document.querySelector('.rs-link-input[data-platform="' + r.platform + '"]');
      if (inp) inp.value = r.url || "";
    });
  }
}

// Changement de couverture DEPUIS la modale d'édition : on mémorise la saisie
// en cours (le recadreur ouvre sa propre modale et écrase celle-ci) puis on
// rouvre la modale une fois l'opération terminée (cf. changeCoverPhoto).
function editCoverFromModal() {
  window._editProfileDraft = {
    username: document.getElementById("editUsername")?.value || "",
    bio: document.getElementById("editBio")?.value || "",
    isPrivate: !!document.getElementById("editIsPrivate")?.checked,
    privacyTouched: !!window._privacyTouched,
    rs: [...document.querySelectorAll(".rs-link-input")].map(function(i) { return { platform: i.dataset.platform, url: i.value }; })
  };
  window._editProfileReopen = true;
  const inp = document.getElementById("coverPhotoInput");
  if (inp) inp.click();
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
  // ⚠️ MARQUEUR DE CHOIX DE CONFIDENTIALITÉ (2026-08-31, venu du hotfix #226).
  // `general.isPrivate` est la SEULE trace de confidentialité de l'application,
  // et cette ligne est sa SEULE assignation dans tout le dépôt. Un `false` n'y
  // prouve donc rien : la case a pu rester décochée pendant qu'on enregistrait
  // simplement sa bio. Le marqueur n'est posé que si la personne AGIT sur le
  // contrôle (`change`) — jamais déduit de la valeur finale à la soumission.
  var _prive = !!document.getElementById("editIsPrivate")?.checked;
  if (window._privacyTouched === true) state.user.general.privacyChoisi = true;
  state.user.general.isPrivate = _prive;
  // ⚠️ NE PLUS écraser l'emoji du compte avec celui de la passion ACTIVE (ADR-010).
  // `main` écrit ici `state.user.general.emoji = currentProfile()?.emoji` SANS
  // condition : la dériver de la passion active à chaque enregistrement ramène le
  // défaut que ce lot corrige — l'avatar public change au gré de la passion.
  // On ne l'initialise que s'il est absent.
  if (!state.user.general.emoji) state.user.general.emoji = currentProfile()?.emoji || "✨";
  // ⚠️ ET LA COULEUR, symétriquement. `general.color` n'était assigné NULLE PART
  // — `git grep "general\.color\s*="` ne rendait rien sur aucune branche. `g.color`
  // valait donc toujours `undefined`, et la couleur publiée retombait
  // systématiquement sur celle de la passion ACTIVE : la moitié du défaut avait
  // survécu à son correctif.
  if (!state.user.general.color) state.user.general.color = currentProfile()?.color || "#8b5cf6";
  if (username) state.user.name = username;
  // ⚠️ Renommer TOUTES les passions, pas seulement l'active. `supaUpsertProfile` et
  // `_msgSenderMeta` prennent bien le pseudo général en priorité, mais `prof.name`
  // survit ailleurs — `supaInsertNotif` s'en sert pour nommer l'expéditeur : après
  // un renommage, les notifications envoyées depuis une AUTRE passion partaient
  // sous l'ANCIEN nom, chez le destinataire, sans que rien ne le signale.
  if (username) (state.user.profiles || []).forEach(function (pr) { pr.name = username; });

  saveState();
  // await : on garantit que le serveur (source de vérité du profil stable) est à
  // jour AVANT de rendre la main, pour qu'un éventuel re-sync adopte le nouveau nom.
  // ⚠️ SAUVEGARDE EXPLICITE, champ par champ. C'est le SEUL parcours qui porte
  // un contrôle de confidentialité, donc le seul autorisé à écrire
  // `is_private` — et encore : `supaSavePublicProfile` le refusera si
  // `privacyChoisi` n'est pas posé (cf. le marqueur, plus haut dans cette
  // fonction). L'ancien appel republiait tout le profil depuis l'état local.
  if (typeof supaSavePublicProfile === "function") {
    try {
      await supaSavePublicProfile({
        username: state.user.general.username,
        bio: state.user.general.bio,
        rs_links: Array.isArray(state.user.general.rsLinks) ? state.user.general.rsLinks : [],
        is_private: state.user.general.isPrivate,
      });
    } catch (e) {}
  }
  // Flush user_state immédiat (username/bio/rsLinks doivent être dans le blob sync).
  if (typeof supaSaveUserState === "function") { try { supaSaveUserState(); } catch(e) {} }
  closeModal();
  renderMainProfile();
  toast("✅ Profil mis à jour !");
}

// ══════════════════════════════════════════════════════════════════════════
// LOT UI-8 — « une personne, plusieurs passions »
// ──────────────────────────────────────────────────────────────────────────
// PASSIO ne doit plus donner l'impression que l'on possède plusieurs COMPTES.
// Le modèle devient : UN profil personnel (pseudo, avatar, abonnés) + plusieurs
// PASSIONS, univers de contenu rattachés à ce même profil. Une seule passion
// est active pour CRÉER ; consulter se fait par des filtres séparés.
//
// ⚠️ CINQ POINTS À CONNAÎTRE AVANT D'Y TOUCHER.
//
// ① `currentProfileId` reste la SEULE source de vérité de l'identité active,
//    et `switchToProfile()` son seul point d'écriture. Rien n'est dupliqué.
//    ⚠️ ADR-011 §4 : ses trois appelants d'alors — la ligne « Passion active »,
//    le sélecteur et le bouton « Utiliser pour créer » — ont TOUS été retirés
//    du profil. Le Studio (`onStudioPassionChange`) est le seul point de choix.
//
// ② La multisélection des cartes (`toggleProfileSelect`) est REMPLACÉE, pas
//    supprimée : elle reste le comportement rendu par le kill switch. Le filtre
//    de contenu devient à choix UNIQUE (`state.user.profilePostFilterId`), plus
//    un filtre jumeau
//    pour « Activités » (`profileEventFilterId`). Aucun filtre = « Toutes ».
//
// ③ Migration défensive de l'ancien état : `profileFilterIds` n'est jamais
//    effacé. S'il contient EXACTEMENT une passion encore valide, elle devient
//    le filtre unique ; vide ou multiple, on retombe sur « Toutes ». La
//    migration ne tourne qu'une fois (`_v8FiltresMigres`).
//
// ④ L'ARCHIVAGE remplace la suppression, qui effaçait le profil ET tous ses
//    posts. Archiver ne retire RIEN : la passion reste dans `state.user.profiles`
//    avec `archived:true`, ses publications restent visibles dans « Toutes ».
//    Aucune migration Supabase — le drapeau voyage dans le blob `user_state`.
//    ⚠️ Ce point parlait d'un quota payant (`isNextProfilePaid`) : ADR-009 a
//    retiré l'économie interne, il n'y a donc plus ni limite ni emplacement à
//    payer. Archiver et restaurer sont gratuits, et le restent.
//
// ⑤ Le filtre est monté PAR RAPPORT au bloc qu'il commande
//    (`insertBefore(rangee, #myPosts)`), jamais à une position fixe de l'écran :
//    sous le lot UI-7, `#myPosts` et `#profileEvents` vivent dans des panneaux
//    d'onglet, et une rangée posée « en haut de l'écran » sortirait du panneau.
//
// Coupure, prioritaire sur tout :
//   window.PASSIO_UI_8 === false   ·   localStorage.passio_ui_8 === "0"
// Le drapeau ne sait qu'ENLEVER : aucune valeur positive n'active, et rien
// n'est écrit dans `localStorage`.
// ══════════════════════════════════════════════════════════════════════════

// ⚠️ Jamais muet : un `catch(e){}` sur un chemin d'affichage a déjà masqué un
// ReferenceError six jours dans ce dépôt (fiche « catch large »), et une surface
// qui disparaît sans un mot est indiscernable d'un kill switch ou d'un lot non
// déployé — la cause exacte des quatre aperçus invisibles du 2026-08-28.
function _v8Echec(etape, e) {
  try {
    if (typeof diagLog === "function") diagLog("ui_v8 " + etape + " " + (e && e.message));
    else if (window.console && console.error) console.error("[ui-v8] " + etape + " :", e);
  } catch (x) {}
}

function passionsUnifieesActives() {
  try { if (window.PASSIO_UI_8 === false) return false; } catch (e) {}
  try { if (localStorage.getItem("passio_ui_8") === "0") return false; } catch (e) {}
  return true;
}

// Les passions utilisables (non archivées) et les archivées. Une liste vide de
// passions vivantes ne doit jamais arriver — `archiverPassion` refuse la
// dernière — mais on retombe sur la liste complète plutôt que sur un écran vide.
function passionsVivantes() {
  var tous = (state.user && state.user.profiles) || [];
  var vifs = tous.filter(function (p) { return !p.archived; });
  return vifs.length ? vifs : tous;
}
function passionsArchivees() {
  return ((state.user && state.user.profiles) || []).filter(function (p) { return !!p.archived; });
}

// « Yoga / Bien-être » → « Yoga ». Affichage SEUL : la clé métier ne bouge pas.
function _passionCourte(label) {
  var s = String(label || "");
  var i = s.search(/\s*[\/&·]\s*/);
  return (i > 0 ? s.slice(0, i) : s).trim() || s;
}
// Une couleur de passion part dans un attribut `style` : on n'y laisse entrer
// qu'une forme connue. Elle est locale aujourd'hui, mais un attribut de style
// n'est pas un endroit où faire confiance à une chaîne libre.
function _couleurSure(c) {
  var s = String(c || "");
  return /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,%\s]+\)|[a-zA-Z]{3,20})$/.test(s) ? s : "var(--accent)";
}

function _passionEtiquette(pr) {
  var meta = {};
  try { meta = passionById(pr.passion) || {}; } catch (e) {}
  return {
    emoji: meta.emoji || pr.emoji || "✨",
    label: _passionCourte(meta.label || pr.passion || "Passion"),
  };
}

// ③ Migration défensive, une seule fois, sans jamais effacer l'ancien état.
//
// ⚠️ DEUX ÉTAGES, et il faut les DEUX. Le profil a connu trois modèles : une
// multisélection (`profileFilterIds`), puis un choix unique (ADR-011 §1), puis
// de nouveau une multisélection (`profilePassionIds`). Un compte peut donc
// arriver ici avec l'un ou l'autre — celui qui a utilisé l'app entre les deux
// versions porte `profilePostFilterId`, celui qui ne l'a pas ouverte depuis
// porte encore `profileFilterIds`. Sauter l'un des deux étages perdrait
// silencieusement le filtre de l'un des deux groupes.
function _migrerFiltresPassion() {
  if (!state.user) return;
  if (!state.user._v8FiltresMigres) {
    state.user._v8FiltresMigres = true;
    if (state.user.profilePostFilterId === undefined) {
      var anciens = state.user.profileFilterIds || [];
      var valides = new Set((state.user.profiles || []).map(function (p) { return p.id; }));
      var retenus = anciens.filter(function (id) { return valides.has(id); });
      state.user.profilePostFilterId = (retenus.length === 1) ? retenus[0] : null;
    }
    if (state.user.profileEventFilterId === undefined) state.user.profileEventFilterId = null;
  }
  // Retour à la multisélection : la valeur unique devient une liste d'un
  // élément, une absence de valeur une liste vide (« toutes »).
  if (!Array.isArray(state.user.profilePassionIds)) {
    var seul = state.user.profilePostFilterId || null;
    state.user.profilePassionIds = seul ? [seul] : [];
  }
}

// Les passions cochées, en OBJETS et déjà nettoyées : une passion disparue ou
// archivée est ignorée plutôt que de vider l'écran sans explication. On NE
// RÉÉCRIT PAS l'état ici — cette fonction est appelée pendant le rendu, et une
// écriture non persistée y serait un mensonge de plus. C'est `archiverPassion`
// et `deleteProfile` qui nettoient, une fois, au point d'ÉCRITURE.
function profilePassionsSelectionnees() {
  try {
    _migrerFiltresPassion();
    var ids = state.user.profilePassionIds || [];
    if (!ids.length) return [];
    var profils = state.user.profiles || [];
    return ids.map(function (id) {
      return profils.find(function (p) { return p.id === id; });
    }).filter(function (p) { return p && !p.archived; });
  } catch (e) { return []; }
}

// Le prédicat d'affichage. AUCUNE passion cochée = tout passe : c'est le neutre
// qui remplace l'ancienne bulle « Toutes », retirée parce que la multisélection
// le dit déjà — tout décocher et cocher « Toutes » sont le même geste.
function _postDansFiltreProfil(post) {
  var sel = profilePassionsSelectionnees();
  if (!sel.length) return true;
  return sel.some(function (pr) { return _postDeLaPassion(post, pr); });
}

function _evtDansFiltreProfil(ev) {
  var sel = profilePassionsSelectionnees();
  if (!sel.length) return true;
  return sel.some(function (pr) { return ev && ev.passion === pr.passion; });
}

// « Moto », ou « Moto · Yoga ». Vide quand rien n'est coché — l'état vide doit
// alors dire « tu n'as rien publié », pas « rien en … ».
function _libelleFiltreProfil() {
  var sel = profilePassionsSelectionnees();
  if (!sel.length) return "";
  return sel.map(function (pr) { return _passionEtiquette(pr).label; }).join(" · ");
}

// Compatibilité : plusieurs appels historiques attendent UNE passion. Ils ne
// s'en servent que pour un libellé ou un tri, jamais pour filtrer — le filtrage
// passe par les prédicats ci-dessus, qui voient toute la sélection.
function _passionDuFiltre(cle) {
  var sel = profilePassionsSelectionnees();
  return sel.length === 1 ? sel[0] : null;
}

// Appariement post ↔ passion. La PASSION est la source de vérité (figée à la
// création) ; `profileId` ne sert que de repli pour un post sans passion —
// c'est exactement la règle déjà appliquée par la multisélection historique.
function _postDeLaPassion(p, pr) {
  return p.passion === pr.passion || (!p.passion && p.profileId === pr.id);
}

// Rend une passion VISIBLE dans le Fil (2026-08-30).
//
// ⚠️ Le Fil ne montre que les passions présentes dans `_activeFeedPassions`, et un
// Set VIDE n'y veut pas dire « tout » : il veut dire « rien » (app-02 ~3993). Or ni
// `confirmCreateProfile`, ni `quickCreateProfile`, ni `restaurerPassion` n'y
// touchaient. Conséquences mesurables, et c'est le défaut qui rendait le
// multi-passion incompréhensible à l'usage : ① une passion neuve naissait GRISÉE
// dans la rangée du Fil ; ② publier dedans rendait son propre post invisible dans
// son propre fil, sans le moindre message ; ③ archiver puis restaurer perdait
// l'appartenance au Fil en silence (`archiverPassion` retire — à raison, sinon le
// filtre survivrait à sa commande — mais `restaurerPassion` ne remettait pas).
//
// On AJOUTE seulement : jamais de remise à zéro de la sélection existante.
function ajouterPassionAuFil(passionId) {
  if (!passionId) return;
  try {
    if (typeof setFeedPassions !== "function" || typeof _activeFeedPassions === "undefined") return;
    if (_activeFeedPassions.has(passionId)) return;
    setFeedPassions(Array.from(_activeFeedPassions).concat([passionId]));
  } catch (e) {}
}

// ⚠️ COMPAT. Le profil n'a plus qu'UN sélecteur de passion (`setProfilePassion`),
// posé au-dessus des onglets, qui commande Publications ET Activité. Ces deux
// noms restent des points d'entrée : ils écrivaient chacun leur clé, et du code
// en vol — ou un test — peut encore les appeler. Ils délèguent, plutôt que de
// disparaître en laissant deux filtres divergents derrière eux.
function setPostPassionFilter(profileId) { return setProfilePassion(profileId); }
function setEventPassionFilter(profileId) { return setProfilePassion(profileId); }

// ⚠️ `_passionFilterRowHTML` et `_monterFiltrePassion` ont été RETIRÉES par la
// refonte multi-passion (§1) : elles montaient deux rangées de puces jumelles
// (`#v8PostFilter` sous Publications, `#v8EventFilter` sous Activités) qui
// posaient la MÊME question à deux endroits, avec deux réponses possibles.
// Un seul rail de bulles les remplace, au-dessus des onglets, et il commande
// les deux — voir `renderProfilePassionRail`.

// ══════════════════════════════════════════════════════════════════════════
// LE RAIL DE PASSIONS DU PROFIL (refonte multi-passion, §1)
// ──────────────────────────────────────────────────────────────────────────
// Les passions se présentent en haut du profil, dans le MÊME composant que le
// Fil — `passionTileHTML` (app-02), donc mêmes classes, mêmes dimensions, mêmes
// espacements, mêmes états. Deux différences assumées avec le Fil, et une seule
// est visuelle :
//
//   · MULTI-SÉLECTION, comme le Fil. La version précédente imposait ici un choix
//     unique et une bulle « Toutes » ; Benjamin a demandé l'inverse le
//     2026-08-31, et il a raison : deux écrans qui montrent le même composant
//     doivent répondre au même geste. « Toutes » disparaît avec ce changement —
//     tout décocher DIT déjà « toutes », et garder les deux, c'était offrir deux
//     commandes pour un seul état.
//   · La sélection pilote les DEUX onglets à la fois (Publications ET Activité) :
//     ce qui est coché sous le sélecteur, tout ce qui est dessous le suit.
//
// ⚠️ La liste `profilePassionIds` est la SEULE source de vérité. Les deux clés
// historiques (`profilePostFilterId`, `profileEventFilterId`) ne sont plus lues
// pour filtrer — seulement migrées une fois — et sont tenues à jour pour qu'un
// appareil resté sur l'ancienne version ne réaffiche pas un filtre fantôme.
function _profilePassionSelected() {
  try { var sel = profilePassionsSelectionnees(); return sel.length === 1 ? sel[0] : null; }
  catch (e) { return null; }
}

// Bascule une passion : elle s'ajoute ou se retire sans toucher aux autres.
// `null` remet le neutre (rien de coché = tout), ce qui garde un chemin
// programmatique vers l'état « toutes » maintenant que la bulle a disparu.
function setProfilePassion(profileId) {
  _migrerFiltresPassion();
  var ids = (state.user.profilePassionIds || []).slice();
  if (!profileId) {
    ids = [];
  } else {
    var i = ids.indexOf(profileId);
    if (i > -1) ids.splice(i, 1); else ids.push(profileId);
  }
  state.user.profilePassionIds = ids;
  // Miroir de compatibilité : une seule cochée se relit par un ancien client,
  // plusieurs ou aucune valent « toutes » pour lui.
  state.user.profilePostFilterId = (ids.length === 1) ? ids[0] : null;
  state.user.profileEventFilterId = state.user.profilePostFilterId;
  saveState();
  renderProfilePassionRail();
  try { renderProfileContent(); } catch (e) { _v8Echec("rail_posts", e); }
  try {
    var box = document.getElementById("profileEvents");
    if (box) box.innerHTML = _myProfileEventsHTML();
  } catch (e) { _v8Echec("rail_events", e); }
}

// L'ancre : le rail se pose JUSTE AVANT le groupe d'onglets qu'il commande.
// ⚠️ Jamais « après la carte d'identité » : le lot UI-7 insère sa barre
// d'onglets à `carte.nextSibling`, donc un rail posé là se retrouverait SOUS
// les onglets au rendu suivant. On vise ce qui vient après lui, pas ce qui
// vient avant.
function _ancreRailPassions() {
  var ec = document.getElementById("screen-profiles");
  if (!ec) return null;
  return document.getElementById("v7ProfileTabs")
      || ec.querySelector(".profile-tabs-hint")
      || ec.querySelector(".profile-tabs")
      || document.getElementById("myPosts");
}

function renderProfilePassionRail() {
  var ancre = _ancreRailPassions();
  if (!ancre || !ancre.parentNode) return null;
  var rail = document.getElementById("v9ProfilePassions");

  // Kill switch du lot UI-8 : sans le modèle « une personne, plusieurs
  // passions », ce rail n'a pas de sens — l'écran historique revient entier.
  if (!passionsUnifieesActives()) {
    if (rail && rail.parentNode) rail.parentNode.removeChild(rail);
    return null;
  }

  if (!rail) {
    rail = document.createElement("div");
    rail.id = "v9ProfilePassions";
    rail.className = "profile-strip v9-profile-strip";
    rail.setAttribute("role", "group");
    rail.setAttribute("aria-label", "Filtrer ce profil par passion");
  }
  if (rail.nextSibling !== ancre || rail.parentNode !== ancre.parentNode) {
    ancre.parentNode.insertBefore(rail, ancre);
  }

  var vivantes = passionsVivantes();
  var selIds = {};
  var nbSel = 0;
  profilePassionsSelectionnees().forEach(function (pr) { selIds[pr.id] = 1; nbSel++; });

  // État propre « profil sans passion » : on ne laisse pas une rangée vide,
  // qui se lirait comme un chargement qui n'arrive jamais.
  if (!vivantes.length) {
    var vide = '<div class="v9-strip-empty">Aucune passion pour l\'instant · '
      + '<span class="link" onclick="openCreateProfile()">Ajouter une passion</span></div>';
    if (rail.getAttribute("data-v9-sig") !== "vide") {
      rail.setAttribute("data-v9-sig", "vide");
      rail.innerHTML = vide;
    }
    rail.classList.toggle("has-filter", false);
    return rail;
  }

  var posts = state.userPosts || [];
  var sig = (Object.keys(selIds).sort().join("+") || "-") + "|"
    + vivantes.map(function (p) { return p.id + ":" + p.passion; }).join(",")
    + "|" + posts.length;
  if (rail.getAttribute("data-v9-sig") === sig) return rail;
  rail.setAttribute("data-v9-sig", sig);
  rail.classList.toggle("has-filter", nbSel > 0);

  // ⚠️ PLUS DE BULLE « TOUTES » (demande de Benjamin, 2026-08-31). En
  // multisélection elle faisait double emploi : tout décocher et la cocher
  // produisent le même état. En garder une aurait laissé deux commandes pour un
  // seul résultat — et la question « laquelle est active ? » quand on coche une
  // passion alors que « Toutes » l'est déjà.
  var html = vivantes.map(function (pr) {
    var et = _passionEtiquette(pr);
    var meta = {};
    try { meta = passionById(pr.passion) || {}; } catch (e) {}
    var on = !!selIds[pr.id];
    return passionTileHTML({
      emoji: et.emoji,
      label: et.label,
      photoUrl: pr.photoUrl || pr.photo || passionPhotoUrl(meta),
      fallbackUrl: passionPhotoFallback(pr.passion),
      count: posts.filter(function (x) { return _postDeLaPassion(x, pr); }).length,
      selected: on,
      dimmed: !on && nbSel > 0,
      action: "profilePassion", arg: String(pr.id),
      title: et.label,
      tileKey: pr.id,
    });
  }).join("");

  rail.innerHTML = html;
  return rail;
}

// ── Gérer ses passions : un panneau, plus une section de la page ────────────
// La refonte retire l'onglet « À propos » où le lot UI-7 avait rangé la liste
// des cartes de passion. Elles ne disparaissent pas pour autant : elles sont
// dans `#passionManager`, ouvert à la demande depuis les options du profil.
// Sans cette porte, ajouter une passion, changer sa photo ou en archiver une
// deviendrait inatteignable — un retrait d'onglet ne doit jamais emporter la
// seule commande d'une fonction (leçon du Studio après un carnet, 2026-08-29).
function openPassionManager() {
  var box = document.getElementById("passionManager");
  if (!box) return;
  try { closeModal(); } catch (e) {}
  box.hidden = false;
  try { renderProfilesScreen(); } catch (e) {}
  if (box.scrollIntoView) box.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closePassionManager() {
  var box = document.getElementById("passionManager");
  if (box) box.hidden = true;
}

// ⚠️ `renderActivePassionLine` (la ligne « Publier dans : X · Changer », UI-8)
// et `openPassionSwitcher` ont été RETIRÉES par la refonte multi-passion.
// §1 supprime le bloc « Passion active » du profil, et §3 fait du Studio le
// SEUL endroit où l'on choisit la passion de destination d'un contenu.
// `currentProfileId` reste la source de vérité de l'identité d'écriture et
// `switchToProfile` son seul point d'écriture — mais plus aucun écran hors
// Studio ne l'expose comme un choix.

// ── ④ ARCHIVAGE (remplace la suppression, qui effaçait aussi les posts) ────
function confirmArchivePassion(profileId) {
  var pr = (state.user.profiles || []).find(function (p) { return p.id === profileId; });
  if (!pr) return;
  var et = _passionEtiquette(pr);
  var vivantes = (state.user.profiles || []).filter(function (p) { return !p.archived; });
  if (vivantes.length <= 1) {
    toast("Tu dois garder au moins une passion active");
    return;
  }
  // ⚠️ On n'exige plus de « choisir d'abord une autre passion active » : la
  // refonte multi-passion retire cette notion de l'interface (§1), donc exiger
  // un geste qui n'existe plus serait un cul-de-sac. `archiverPassion` bascule
  // lui-même sur une autre passion vivante.
  openModal(
    '<div class="modal-handle"></div>'
    + '<div style="text-align:center;margin-bottom:16px;">'
    + '<div style="font-size:36px;margin-bottom:8px;">🗄️</div>'
    + '<div style="font-weight:800;font-size:16px;color:var(--text);">Archiver cette passion ?</div>'
    + '<div style="font-size:13px;color:var(--muted);margin-top:6px;line-height:1.5;">'
    + escapeHtml(et.emoji + " " + et.label) + ' quitte tes passions actives.<br/>'
    + '<b>Rien n\'est supprimé</b> : tes publications, activités, bobines et médias restent visibles dans « Toutes », et tu peux la restaurer quand tu veux.'
    + "</div></div>"
    + '<div style="display:flex;gap:8px;">'
    + '<button class="btn ghost" onclick="closeModal()" style="flex:1;">Annuler</button>'
    + '<button class="btn primary" data-v8-archiver="' + escapeHtml(String(profileId)) + '" onclick="archiverPassion(\'' + escapeJsArg(String(profileId)) + '\')" style="flex:1;">Archiver</button>'
    + "</div>"
  );
}

// Retire une passion de TOUS les filtres du profil. Appelée aux points
// d'ÉCRITURE (archivage, suppression) et jamais à l'affichage : une passion
// cochée puis archivée laisserait sinon un filtre que plus aucune bulle ne peut
// décocher — le rail ne rend que les passions vivantes.
function _retirerPassionDesFiltres(profileId) {
  try {
    _migrerFiltresPassion();
    state.user.profilePassionIds = (state.user.profilePassionIds || [])
      .filter(function (id) { return id !== profileId; });
    if (state.user.profilePostFilterId === profileId) state.user.profilePostFilterId = null;
    if (state.user.profileEventFilterId === profileId) state.user.profileEventFilterId = null;
  } catch (e) {}
}

function archiverPassion(profileId) {
  var pr = (state.user.profiles || []).find(function (p) { return p.id === profileId; });
  if (!pr) { closeModal(); return; }
  var vivantes = (state.user.profiles || []).filter(function (p) { return !p.archived; });
  if (vivantes.length <= 1) { toast("Tu dois garder au moins une passion active"); closeModal(); return; }
  // ⚠️ La passion de publication ne doit JAMAIS pointer une passion archivée :
  // `currentProfile()` rend `null` dans ce cas et tout le modèle suppose cet
  // état impossible. On rebascule ici, au POINT D'ÉCRITURE — pas à l'affichage,
  // qui ne persiste rien.
  if (state.user.currentProfileId === profileId) {
    var _remplacante = vivantes.find(function (p) { return p.id !== profileId; });
    if (_remplacante) state.user.currentProfileId = _remplacante.id;
  }

  pr.archived = true;
  pr.archivedAt = Date.now();
  // Un filtre qui pointait dessus le lâche — sinon l'écran se vide sans que rien
  // ne l'explique, et la seule commande capable de le décocher (sa bulle) vient
  // justement de disparaître du rail.
  _retirerPassionDesFiltres(profileId);
  // ⚠️ Et le FIL, surtout. Sa tuile quitte `renderProfileStrip` (qui ne rend
  // plus que les passions vivantes) mais la passion resterait dans
  // `_activeFeedPassions` : le filtre survivrait à sa propre commande. Si
  // c'était la seule sélectionnée, le Fil n'afficherait plus QUE la passion
  // qu'on vient de ranger, sans rien à l'écran pour en sortir.
  try {
    if (typeof setFeedPassions === "function" && typeof _activeFeedPassions !== "undefined"
        && _activeFeedPassions.has(pr.passion)) {
      setFeedPassions(Array.from(_activeFeedPassions).filter(function (x) { return x !== pr.passion; }));
    }
  } catch (e) {
    if (typeof diagLog === "function") diagLog("v8_archive_filtre_fil " + (e && e.message));
    else if (window.console && console.error) console.error("[ui-v8] filtre du fil :", e);
  }
  saveState();
  // Passions seules : ni pseudo, ni bio, ni avatar, ni confidentialité.
  if (typeof supaSavePassionState === "function") { try { supaSavePassionState(); } catch (e) {} }
  if (typeof supaSaveUserState === "function") { try { supaSaveUserState(); } catch (e) {} }
  closeModal();
  renderProfilesScreen();
  if (typeof renderProfileStrip === "function") { try { renderProfileStrip(); } catch (e) {} }
  var et = _passionEtiquette(pr);
  toast("🗄️ " + et.label + " archivée — rien n'a été supprimé");
}

function restaurerPassion(profileId) {
  var pr = (state.user.profiles || []).find(function (p) { return p.id === profileId; });
  if (!pr) return;
  pr.archived = false;
  delete pr.archivedAt;
  // Symétrique d'`archiverPassion`, qui l'avait retirée du Fil : sans ça, un
  // aller-retour archiver→restaurer perdait le réglage, en silence.
  ajouterPassionAuFil(pr.passion);
  saveState();
  // Passions seules : ni pseudo, ni bio, ni avatar, ni confidentialité.
  if (typeof supaSavePassionState === "function") { try { supaSavePassionState(); } catch (e) {} }
  if (typeof supaSaveUserState === "function") { try { supaSaveUserState(); } catch (e) {} }
  closeModal();
  renderProfilesScreen();
  if (typeof renderProfileStrip === "function") { try { renderProfileStrip(); } catch (e) {} }
  toast("✅ " + _passionEtiquette(pr).label + " est de retour dans tes passions");
  // Restaurer deux passions ne doit pas obliger à rouvrir la liste à la main.
  if (passionsArchivees().length) setTimeout(openArchivedPassions, 350);
}

function openArchivedPassions() {
  var archivees = passionsArchivees();
  var lignes = archivees.length
    ? archivees.map(function (pr) {
        var et = _passionEtiquette(pr);
        return '<div class="v8-switch-row" data-v8-archived="' + escapeHtml(String(pr.id)) + '">'
          + '<span class="v8-switch-emoji" aria-hidden="true">' + escapeHtml(et.emoji) + "</span>"
          + '<span class="v8-switch-name">' + escapeHtml(et.label) + "</span>"
          + '<button type="button" class="v8-switch-go" data-v8-restaurer="' + escapeHtml(String(pr.id)) + '"'
          + ' onclick="restaurerPassion(\'' + escapeJsArg(String(pr.id)) + '\')">Restaurer</button>'
          + "</div>";
      }).join("")
    : '<div style="font-size:12px;color:var(--muted);padding:10px;">Aucune passion archivée.</div>';
  openModal(
    '<div class="modal-handle"></div>'
    + '<div class="modal-title">Passions archivées</div>'
    + '<p class="section-subtitle" style="margin-top:-6px;">Leurs publications et activités n\'ont pas bougé : elles restent visibles dans « Toutes ».</p>'
    + '<div class="v8-switch-list">' + lignes + "</div>"
  );
}

function renderProfilesScreen() {
  renderMainProfile();
  // Le rail de passions se remonte à chaque rendu : le lot UI-7 reconstruit sa
  // barre d'onglets, et le rail doit rester juste au-dessus d'elle.
  try { renderProfilePassionRail(); } catch (e) { _v8Echec("rail_passions", e); }

  // 🔄 Initialiser la sélection des profils (multi-select), restaurée depuis la
  // dernière session (state.user.profileFilterIds), filtrée sur les profils existants.
  if (!window.profilesFilterSelection) {
    var _saved = (state.user && state.user.profileFilterIds) || [];
    var _valid = new Set((state.user.profiles || []).map(function(p){ return p.id; }));
    window.profilesFilterSelection = new Set(_saved.filter(function(id){ return _valid.has(id); }));
  }

  // Onglets de contenu : refléter la multi-sélection restaurée sur les icônes.
  _syncProfileTabButtons();

  const list = $("#profileList");
  const sub  = $("#profilesQuotaSub");

  // ── LOT UI-8 : les passions sont des UNIVERS rattachés au profil personnel ──
  // Plus de multisélection sur les cartes : le filtre de contenu a déménagé dans
  // « Publications » (et son jumeau dans « Activités »). Ici, une carte ne dit
  // plus qu'une chose — « avec laquelle je crée ? » — et le reste de la carte
  // ouvre l'édition existante (photo, couverture, bio).
  if (passionsUnifieesActives()) {
    _migrerFiltresPassion();

    // Comptages : une seule lecture d'`allEvents()` pour toutes les cartes.
    var _mesEvs = _myProfileEvents(9999);
    var _courant = state.user.currentProfileId;

    if (sub) {
      var _arch = passionsArchivees();
      if (_arch.length) {
        sub.innerHTML = '<span class="link" data-v8-archivees="1" onclick="openArchivedPassions()">🗄️ Passions archivées (' + _arch.length + ')</span>';
        sub.style.display = "";
      } else {
        sub.innerHTML = "";
        sub.style.display = "none";
      }
    }

    list.innerHTML = passionsVivantes().map(function (p) {
      var et = _passionEtiquette(p);
      var estActive = (p.id === _courant);
      var _pPhoto = p.photoUrl || p.photo || null;
      var avatarStyle = _pPhoto
        ? "background:url(" + safeUrlAttr(_pPhoto) + ") center/cover;"
        : "background:" + _couleurSure(p.color) + ";";
      var avatarContent = _pPhoto ? "" : escapeHtml(et.emoji);
      var _pCover = p.coverUrl || p.coverPhoto || null;
      var coverStyle = _pCover
        ? "background:linear-gradient(90deg, rgba(0,0,0,0.62), rgba(0,0,0,0.30)), url(" + safeUrlAttr(_pCover) + ") center/cover;"
        : "";

      var nbPosts = (state.userPosts || []).filter(function (x) { return _postDeLaPassion(x, p); }).length;
      var nbEvs = _mesEvs.filter(function (e) { return e && e.passion === p.passion; }).length;
      var compte = nbPosts + " publication" + (nbPosts > 1 ? "s" : "") + " · " + nbEvs + " activité" + (nbEvs > 1 ? "s" : "");

      // ⚠️ PLUS DE SÉLECTEUR DE PASSION D'ÉCRITURE ICI (refonte §3) : le Studio
      // est le seul endroit où l'on choisit la passion de destination. La carte
      // ne fait plus qu'INDIQUER laquelle le Studio présélectionnera — c'est une
      // information, plus une commande, et `switchToProfile` n'est plus appelée
      // depuis cet écran.
      var etat = estActive
        ? '<span class="v8-state on" data-v8-active="' + escapeHtml(String(p.id)) + '">Passion du Studio ✓</span>'
        : "";

      return '<div class="profile-card v8-passion-card' + (estActive ? " is-active" : "") + (_pCover ? " has-cover" : "") + '"'
        + ' data-v8-card="' + escapeHtml(String(p.id)) + '" style="' + coverStyle + '"'
        + ' onclick="openEditPassionProfile(\'' + escapeJsArg(String(p.id)) + '\')">'
        + '<div class="avatar lg" style="' + avatarStyle + 'position:relative;">' + avatarContent
        + '<div class="passion-photo-badge" onclick="event.stopPropagation();document.getElementById(\'passionPhoto_' + escapeJsArg(String(p.id)) + '\').click()">📷</div>'
        + '<input type="file" id="passionPhoto_' + escapeHtml(String(p.id)) + '" accept="image/*" style="display:none;" onclick="event.stopPropagation();" onchange="event.stopPropagation();changePassionPhoto(event,\'' + escapeJsArg(String(p.id)) + '\')"/>'
        + '<input type="file" id="passionCover_' + escapeHtml(String(p.id)) + '" accept="image/*" style="display:none;" onclick="event.stopPropagation();" onchange="event.stopPropagation();changePassionCoverPhoto(event,\'' + escapeJsArg(String(p.id)) + '\')"/>'
        + '</div>'
        + '<div class="profile-card-body">'
        + '<div class="profile-card-name">' + escapeHtml(et.emoji) + " " + escapeHtml(et.label) + '</div>'
        + (p.bio ? '<div class="profile-card-bio">' + escapeHtml(p.bio) + '</div>' : "")
        + '<div class="v8-card-meta">' + escapeHtml(compte) + '</div>'
        + '</div>'
        + '<button class="profile-dots-btn" onclick="openPassionProfileMenu(event,\'' + escapeJsArg(String(p.id)) + '\')" title="Options" aria-label="Options de la passion" aria-haspopup="menu">⋯</button>'
        + etat
        + '</div>';
    }).join("");
  } else {


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
      const isSelected = window.profilesFilterSelection.has(p.id);
      const _pPhoto = p.photoUrl || p.photo || null;
      const hasPhoto   = !!_pPhoto;
      const avatarStyle = hasPhoto
        ? `background:url(${safeUrlAttr(_pPhoto)}) center/cover;`
        : `background:${p.color};`;
      const avatarContent = hasPhoto ? "" : p.emoji;

      // Photo de fond du profil passion (facultative) : voile sombre par-dessus
      // pour que le nom et la bio restent lisibles.
      const _pCover = p.coverUrl || p.coverPhoto || null;
      const coverStyle = _pCover
        ? `background:linear-gradient(90deg, rgba(0,0,0,0.62), rgba(0,0,0,0.30)), url(${safeUrlAttr(_pCover)}) center/cover;`
        : "";

      return `<div class="profile-card ${isSelected?"selected":""} ${_pCover?"has-cover":""}" style="${coverStyle}${isSelected ? "border:2px solid var(--accent);" : ""}" onclick="toggleProfileSelect('${escapeJsArg(p.id)}')">
        <div class="avatar lg" style="${avatarStyle}position:relative;">${avatarContent}
          <div class="passion-photo-badge" onclick="event.stopPropagation();document.getElementById('passionPhoto_${escapeJsArg(p.id)}').click()">📷</div>
          <input type="file" id="passionPhoto_${p.id}" accept="image/*" style="display:none;" onclick="event.stopPropagation();" onchange="event.stopPropagation();changePassionPhoto(event,'${escapeJsArg(p.id)}')"/>
          <input type="file" id="passionCover_${p.id}" accept="image/*" style="display:none;" onclick="event.stopPropagation();" onchange="event.stopPropagation();changePassionCoverPhoto(event,'${escapeJsArg(p.id)}')"/>
        </div>
        <div class="profile-card-body" style="flex:1;">
          <div class="profile-card-name">
            ${passion.emoji} ${passion.label}
          </div>
          ${p.bio ? `<div class="profile-card-bio">${escapeHtml(p.bio)}</div>` : ""}
        </div>
        <button class="profile-dots-btn" onclick="openPassionProfileMenu(event,'${escapeJsArg(p.id)}')" title="Options du profil" aria-label="Options du profil" aria-haspopup="menu" style="flex-shrink:0;">⋯</button>
      </div>`;
    }).join("");
  }

  // Contenu en dessous : filtré par l'onglet actif ET la multi-sélection
  renderProfileContent();

  // Aide §8 « premier retour Profil » : montrer comment créer un second profil
  // passion. Elle n'a de sens que si l'utilisateur en a exactement UN — celui
  // créé à l'inscription. Avec deux profils ou plus, il a déjà trouvé tout seul,
  // et le §8 interdit d'expliquer ce qui est acquis.
  // ⚠️ L'ANCRE dépend de l'écran réellement affiché. `montrerHint` refuse une
  // cible sans `offsetParent` — et « Mes passions » vit maintenant dans le
  // panneau `#passionManager`, masqué tant qu'on ne l'ouvre pas : ancrer l'aide
  // sur `#nouveauProfilLien` la rendrait simplement invisible, sans que rien
  // n'échoue. On retombe alors sur le rail de passions, qui est la surface
  // visible de ce que l'aide veut montrer, puis sur le bouton d'options — la
  // porte réelle vers la gestion.
  try {
    if (typeof montrerHint === "function" && (state.user.profiles || []).length === 1) {
      setTimeout(function () {
        var ecran = document.getElementById("screen-profiles");
        if (!ecran || !ecran.classList.contains("active")) return;
        var ancre = "#nouveauProfilLien";
        var lien = document.getElementById("nouveauProfilLien");
        if (!lien || !lien.offsetParent) {
          var rail = document.getElementById("v9ProfilePassions");
          if (rail && rail.offsetParent) ancre = "#v9ProfilePassions";
          else if (ecran.querySelector(".profile-dots-btn")) ancre = "#screen-profiles .profile-dots-btn";
        }
        montrerHint("second_profil", ancre);
      }, 400);
    }
  } catch (e) {}
}

// 🔄 MULTI-SÉLECTION DES PROFILS (écran profil). Nom distinct de toggleProfileFilter
// (feed, _activeFeedPassions, plus bas) pour éviter la collision de noms qui masquait ce handler.
// Persiste la sélection de profils pour la restaurer à la prochaine session.
function _persistProfileFilter() {
  try {
    if (!state.user) return;
    state.user.profileFilterIds = [...(window.profilesFilterSelection || [])];
    saveState();
  } catch (e) {}
}

function toggleProfileSelect(profileId) {
  if (!window.profilesFilterSelection) {
    window.profilesFilterSelection = new Set();
  }

  if (window.profilesFilterSelection.has(profileId)) {
    window.profilesFilterSelection.delete(profileId);
  } else {
    window.profilesFilterSelection.add(profileId);
  }

  _persistProfileFilter();
  renderProfilesScreen();
}

function clearProfilesFilter() {
  if (!window.profilesFilterSelection) {
    window.profilesFilterSelection = new Set();
  }
  window.profilesFilterSelection.clear();
  _persistProfileFilter();
  renderProfilesScreen();
}

function switchToProfile(id) {
  state.user.currentProfileId = id;
  const p = currentProfile();
  // switchToProfile ne force plus de filtre — l'utilisateur choisit lui-même
  saveState();
  // Lot UI-8 : le changement de passion active n'est JAMAIS muet — c'est avec
  // elle que l'utilisateur publiera ensuite. Le toast dit ce qui change
  // vraiment : l'univers de création, pas le compte.
  if (passionsUnifieesActives()) {
    try {
      var _et = _passionEtiquette(p || {});
      toast("✨ Tu crées maintenant dans " + _et.label);
    } catch (e) {}
  }
  // Le profil actif = identité publique (1 ligne profiles par compte) → on la
  // resynchronise pour que la recherche/messagerie reflètent le bon pseudo.
  // Passions seules : ni pseudo, ni bio, ni avatar, ni confidentialité.
  if (typeof supaSavePassionState === "function") { try { supaSavePassionState(); } catch (e) {} }
  // Flush immédiat de user_state pour persister le changement de profil actif.
  if (typeof supaSaveUserState === "function") { try { supaSaveUserState(); } catch(e) {} }
  renderTopbar();
  renderProfilesScreen();
  renderFeed();
  // Le Studio prend la passion active comme valeur par défaut : s'il est déjà
  // monté, son sélecteur doit suivre immédiatement (sinon la prochaine
  // publication partirait dans l'ancienne passion).
  // ⚠️ `#postPassion` est dans le markup statique : tester sa présence ne garde
  // RIEN. Ce qu'il faut tester, c'est que le Studio soit à l'écran — sinon
  // `renderStudio()` réécrit le <select> et écrase une passion choisie à la
  // main pour la publication en cours.
  try {
    var _st = document.getElementById("screen-studio");
    if (_st && _st.classList.contains("active") && typeof renderStudio === "function") renderStudio();
  } catch (e) { _v8Echec("studio_resync", e); }
  try { if (typeof renderProfileStrip === "function") renderProfileStrip(); } catch (e) { _v8Echec("strip_resync", e); }
}

// ===== ÉDITION D'UN PROFIL PASSION (crayon sur la carte) =====
// Un seul point d'entrée par profil passion : photo, petite bio, et la
// suppression (déplacée ici — plus de corbeille sur la carte).
function openEditPassionProfile(profileId) {
  const p = (state.user.profiles || []).find(x => x.id === profileId);
  if (!p) return;
  const passion = passionById(p.passion);
  // ⚠️ Lot UI-8 : cette modale est désormais ouverte par TOUTE la surface de la
  // carte de passion. Y laisser « Supprimer ce profil » — qui efface aussi
  // `state.userPosts` — mettrait la suppression destructrice à deux taps, plus
  // près qu'avant le lot. Sous UI-8, c'est l'archivage, et lui seul.
  const _v8 = passionsUnifieesActives();
  const photo = p.photoUrl || p.photo || null;
  const cover = p.coverUrl || p.coverPhoto || null;

  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">✏️ ${escapeHtml(passion.emoji + " " + passion.label)}</div>

    <div class="field">
      <span>Photo de la passion</span>
      <div style="display:flex;gap:10px;align-items:center;">
        <div style="width:56px;height:56px;border-radius:50%;flex-shrink:0;${photo ? "background:url(" + safeUrlAttr(photo) + ") center/cover;" : "background:" + escapeHtml(p.color || "var(--accent)") + ";display:flex;align-items:center;justify-content:center;font-size:24px;"}">${photo ? "" : escapeHtml(p.emoji || "")}</div>
        <button class="btn ghost" onclick="_editPassionPhotoFromModal('${escapeJsArg(p.id)}')">📷 Changer</button>
      </div>
    </div>

    <div class="field">
      <span>Photo de fond</span>
      <div style="display:flex;gap:10px;align-items:center;">
        <div style="flex:1;height:60px;border-radius:12px;border:1px solid var(--border);${cover ? "background:url(" + safeUrlAttr(cover) + ") center/cover;" : "background:var(--bg-deep);"}"></div>
        <button class="btn ghost" style="white-space:nowrap;" onclick="_editPassionCoverFromModal('${escapeJsArg(p.id)}')">📷 Changer</button>
      </div>
      ${cover ? `<button class="btn ghost" style="margin-top:6px;font-size:12px;padding:8px;color:var(--muted);" onclick="removePassionCover('${escapeJsArg(p.id)}')">Retirer la photo de fond</button>` : ""}
    </div>

    <label class="field">
      <span>Bio de ce profil <span style="font-weight:400;color:var(--muted);" id="passionBioCount">${(p.bio||"").length}/150</span></span>
      <textarea class="textarea" id="editPassionBio" maxlength="150" placeholder="Décris ce que tu partages avec cette passion…" style="min-height:80px;">${escapeHtml(p.bio||"")}</textarea>
    </label>

    <div style="display:flex;gap:8px;margin-top:12px;">
      <button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn primary" style="flex:1;" onclick="savePassionProfile('${escapeJsArg(p.id)}')">💾 Sauvegarder</button>
    </div>

    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);">
      ${_v8 ? `<button class="btn ghost" data-v8-archiver-lien="1" onclick="closeModal();setTimeout(function(){confirmArchivePassion('${escapeJsArg(p.id)}');},200);" style="width:100%;font-size:13px;padding:12px;">🗄️ Archiver cette passion</button>`
            : `<button class="btn ghost" onclick="closeModal();setTimeout(function(){confirmDeleteProfile('${escapeJsArg(p.id)}','${escapeJsArg(passion.label)}');},200);" style="width:100%;font-size:13px;padding:12px;color:#ef4444;">🗑 Supprimer ce profil</button>`}
    </div>`);

  const ta = document.getElementById("editPassionBio");
  const cnt = document.getElementById("passionBioCount");
  if (ta && cnt) ta.addEventListener("input", () => cnt.textContent = `${ta.value.length}/150`);
}

// Changement de photo depuis la modale d'édition d'un profil passion : le
// recadreur ouvre sa propre modale → on mémorise la bio saisie et on rouvre.
function _editPassionPhotoFromModal(profileId) {
  window._editPassionDraft = { id: profileId, bio: document.getElementById("editPassionBio")?.value || "" };
  const inp = document.getElementById("passionPhoto_" + profileId);
  if (inp) inp.click();
}

function _editPassionCoverFromModal(profileId) {
  window._editPassionDraft = { id: profileId, bio: document.getElementById("editPassionBio")?.value || "" };
  const inp = document.getElementById("passionCover_" + profileId);
  if (inp) inp.click();
}

function removePassionCover(profileId) {
  const p = (state.user.profiles || []).find(x => x.id === profileId);
  if (!p) return;
  const bio = document.getElementById("editPassionBio")?.value || "";
  delete p.coverPhoto; delete p.coverUrl;
  p.bio = bio.trim();
  saveState();
  if (typeof supaSaveUserState === "function") { try { supaSaveUserState(); } catch(e) {} }
  if (typeof supaSavePassionState === "function") { try { supaSavePassionState(); } catch(e) {} }
  renderProfilesScreen();
  openEditPassionProfile(profileId);
  toast("Photo de fond retirée");
}

function _reopenEditPassionAfterPhoto() {
  const d = window._editPassionDraft;
  if (!d) return;
  window._editPassionDraft = null;
  setTimeout(function() {
    openEditPassionProfile(d.id);
    const ta = document.getElementById("editPassionBio");
    const cnt = document.getElementById("passionBioCount");
    if (ta) { ta.value = d.bio || ""; if (cnt) cnt.textContent = ta.value.length + "/150"; }
  }, 220);
}

function savePassionProfile(profileId) {
  const p = (state.user.profiles || []).find(x => x.id === profileId);
  if (!p) { closeModal(); return; }
  p.bio = (document.getElementById("editPassionBio")?.value || "").trim();
  saveState();
  if (typeof supaSaveUserState === "function") { try { supaSaveUserState(); } catch(e) {} }
  // ⚠️ La carte de passion telle qu'un VISITEUR la voit est servie par la colonne
  // jsonb `profiles.passions`, alimentée UNIQUEMENT par `supaSavePassionState`. Sans
  // cet appel, modifier la bio d'une passion ne changeait rien pour les autres :
  // la nouvelle bio n'atteignait le public qu'au prochain geste qui, par hasard,
  // republiait le profil (changer de passion active, renommer son pseudo…).
  //
  // ⚠️ CE FUT `supaUpsertProfile` — et la fusion du 2026-08-31 l'y avait REMIS,
  // dans les quatre chemins de cette famille (photo, couverture, retrait de
  // couverture, bio). Ce nom ne désigne plus la même chose : depuis la séparation
  // des autorités, ce n'est qu'un ALIAS d'`ensure`, qui n'écrit AUCUN champ d'une
  // ligne existante. Le défaut que ce commentaire décrit était donc revenu,
  // silencieusement et à l'identique — l'appel restait présent, la fonction
  // existait, l'écriture ne partait plus. C'est le pire genre de régression de
  // fusion : elle ne se voit ni dans le diff ni à l'exécution.
  if (typeof supaSavePassionState === "function") { try { supaSavePassionState(); } catch(e) {} }
  closeModal();
  renderProfilesScreen();
  toast("✅ Passion mise à jour !");
}

function confirmDeleteProfile(profileId, passionLabel) {
  var profiles = state.user.profiles || [];
  if (profiles.length <= 1) {
    toast("Tu dois garder au moins 1 passion");
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
      <button class="btn primary" onclick="deleteProfile(\'' + escapeJsArg(profileId) + '\')" style="flex:1;background:#ef4444;">Supprimer</button>\
    </div>\
  ');
}

function deleteProfile(profileId) {
  var profiles = state.user.profiles || [];
  if (profiles.length <= 1) { toast("Tu dois garder au moins 1 profil"); closeModal(); return; }
  state.user.profiles = profiles.filter(function(p) { return p.id !== profileId; });
  state.userPosts = state.userPosts.filter(function(p) { return p.profileId !== profileId; });
  if (state.user.currentProfileId === profileId) {
    // ⚠️ Le repli doit désigner une passion VIVANTE : sinon supprimer la
    // dernière non archivée rendait active une passion rangée — un état que
    // tout le lot UI-8 suppose impossible.
    var _vivantes = (state.user.profiles || []).filter(function (x) { return !x.archived; });
    state.user.currentProfileId = (_vivantes[0] || state.user.profiles[0]).id;
  }
  // selectedFeedPassions ne contient pas d'IDs de profil, rien à nettoyer ici
  // ⚠️ Les filtres du PROFIL, si : depuis le passage en multisélection, une
  // passion supprimée qui y resterait serait un filtre que plus aucune bulle ne
  // peut décocher (le rail ne rend que les passions existantes). Même raison
  // qu'à l'archivage, et même point d'écriture.
  _retirerPassionDesFiltres(profileId);
  saveState();
  // Re-synchronise le profil public pour retirer la passion supprimée de la
  // liste affichée aux autres.
  // Passions seules : ni pseudo, ni bio, ni avatar, ni confidentialité.
  if (typeof supaSavePassionState === "function") { try { supaSavePassionState(); } catch (e) {} }
  // Flush immédiat de user_state pour ne pas perdre la suppression si l'utilisateur
  // se déconnecte dans les 2500ms suivantes.
  if (typeof supaSaveUserState === "function") { try { supaSaveUserState(); } catch(e) {} }
  closeModal();
  renderProfilesScreen();
  renderProfileStrip();
  toast("Profil supprimé");
}

function renderProfileStrip() {
  const box = document.getElementById("profileStrip");
  if (!box) return;
  // Lot UI-8 : une passion archivée ne pèse plus sur le Fil. Rien n'est
  // supprimé — la restaurer la fait revenir ici telle quelle.
  var profiles = passionsUnifieesActives() ? passionsVivantes() : (state.user.profiles || []);

  // ⚠️ Toute passion qui FILTRE le fil doit avoir sa bulle (ADR-010 : une passion
  // sert à choisir le contenu du fil — une préférence de lecture invisible n'est
  // pas une préférence, c'est un piège).
  //
  // Défaut mesuré : l'onboarding fait choisir jusqu'à 7 passions et les met TOUTES
  // dans `_activeFeedPassions` (`setFeedPassions(selectedPassions)`), mais ne crée
  // qu'UNE passion (`passionsProfil = [primaire]`). Ce rail ne dessinait que les
  // passions AYANT un profil : les autres décidaient réellement de ce qui entrait
  // dans le fil, sans tuile pour les voir ni les décocher. Un compte neuf ayant
  // coché 3 passions voyait donc une seule bulle et un fil nourri par trois.
  //
  // On complète donc avec les passions actives sans profil. Ce sont des entrées
  // d'AFFICHAGE : rien n'est créé dans `state.user.profiles`, et les décocher les
  // fait disparaître d'elles-mêmes.
  try {
    var _avecProfil = {};
    profiles.forEach(function (p) { _avecProfil[p.passion] = 1; });
    var _orphelines = Array.from(_activeFeedPassions).filter(function (id) { return id && !_avecProfil[id]; });
    if (_orphelines.length) {
      profiles = profiles.concat(_orphelines.map(function (id) {
        var pas = passionById(id);
        return { id: "_interet_" + id, passion: id, emoji: (pas && pas.emoji) || "✨", _interetSeul: true };
      }));
    }
  } catch (e) {}

  // ⚠️ PAS DE RETOUR ANTICIPÉ QUI EMPORTE « SUIVIS ». Ce garde vidait le rail
  // dès qu'aucune passion n'était résoluble — et il emportait donc la tuile
  // « Suivis » avec lui, puisqu'elle vit dans ce même rail depuis le
  // 2026-08-31. Conséquence : un compte sans passion mais QUI SUIT des gens
  // n'avait plus aucune commande pour voir leurs publications. Il ne pouvait
  // pas non plus en sortir, la vue étant persistée.
  //
  // ⚠️ Le défaut existait déjà sur `main`, où la tuile était construite APRÈS
  // ce retour : il n'est pas né du déplacement, il devient seulement visible
  // maintenant que cette tuile est la seule porte vers les comptes suivis.
  // Le cas n'est pas théorique : c'est l'état d'un compte neuf, et c'est
  // exactement celui qu'exerce `gate-sans-app`.
  var _sansPassion = (profiles.length === 0);

  // ⚠️ « SUIVIS » EST DE RETOUR DANS CE RAIL (2026-08-31), sur demande de
  // Benjamin après essai de la preview : « je préfère que tu mettes Suivis avec
  // les passions à afficher comme avant ; ça rajoute encore une ligne en haut,
  // pas confortable ». Le commutateur « Accueil / Suivis » posé au-dessus par
  // ADR-010 est retiré : sur un écran de téléphone, deux lignes de chrome en
  // moins valent mieux qu'une taxonomie propre.
  //
  // ⚠️ CE QUI NE REVIENT PAS EN ARRIÈRE. L'ancienne tuile inversait
  // `_showFollowingFeed`, une variable de session NON persistée : elle repartait
  // à faux à chaque ouverture, donc suivre quelqu'un n'avait aucun effet
  // durable. Celle-ci pilote `state.feedFollowingOn`, sauvegardé. Même place,
  // même geste, mais le défaut de fond reste corrigé.
  //
  // ⚠️ ELLE N'EST PLUS EXCLUSIVE DES PASSIONS (refonte multi-passion). La
  // version d'ADR-010 grisait les passions dès que « Suivis » était allumé,
  // parce que le moteur ne les consultait alors pas : la contradiction était
  // rendue impossible plutôt qu'affichée. Le moteur fait désormais l'UNION des
  // trois familles de critères (`renderFeed`, app-02), donc les cocher ensemble
  // a un effet réel — et le rail doit les montrer TOUTES actives en même temps.
  // Cocher une passion ne décoche plus « Suivis », et réciproquement.
  var enSuivis = (typeof feedFollowingSelected === "function") ? feedFollowingSelected() : true;
  var hasPassionFilter = _activeFeedPassions.size > 0;
  box.classList.toggle("has-filter", hasPassionFilter || enSuivis);

  // Compter les posts disponibles par passion (tous moods)
  var allPostsFlat = allFeedPosts().filter(function(p) { return p.type !== "vlog"; });
  var postCountByPassion = {};
  allPostsFlat.forEach(function(p) { postCountByPassion[p.passion] = (postCountByPassion[p.passion] || 0) + 1; });

  // Combien de publications le rail « Suivis » montrerait — même source que le
  // moteur (`following` × `authorId`), pour ne pas annoncer un chiffre que le
  // fil ne tiendrait pas.
  var _suivis = (state.user && state.user.following) || [];
  var followingPostCount = _suivis.length
    ? allPostsFlat.filter(function (p) { return _suivis.indexOf(p.authorId) >= 0; }).length
    : 0;
  // ⚠️ Le rendu de la bulle est CENTRALISÉ dans `passionTileHTML` (app-02) : le
  // Profil affiche exactement la même, et deux copies auraient divergé.
  var followingTile = passionTileHTML({
    emoji: "👥",
    label: "Suivis",
    photoUrl: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=200&h=200&fit=crop&crop=faces,entropy&auto=format&q=80",
    fallbackUrl: "https://picsum.photos/seed/community/200/200",
    avatarStyle: "background:linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(124, 58, 237, 0.10));",
    count: followingPostCount,
    selected: enSuivis,
    dimmed: !enSuivis,
    action: "feedFollowing",
    title: "Suivis",
    tileKey: "__suivis__",
  });

  var tilesHTML = followingTile + (_sansPassion ? [] : profiles).map(function(p) {
    const passion = passionById(p.passion);
    // Une passion cochée reste cochée quel que soit l'état de « Suivis » : les
    // critères sont additifs. Le grisé ne signale plus qu'une chose — « ce
    // critère-ci n'est pas coché » — et jamais « il est sans effet ».
    const isSelected = _activeFeedPassions.has(p.passion);
    const isDimmed = !isSelected && (hasPassionFilter || enSuivis);
    return passionTileHTML({
      emoji: p.emoji,
      label: passion.label,
      photoUrl: passionPhotoUrl(passion),
      fallbackUrl: passionPhotoFallback(p.passion),
      count: postCountByPassion[p.passion] || 0,
      selected: isSelected,
      dimmed: isDimmed,
      action: "feedPassion", arg: p.passion,
      title: passion.label,
      tileKey: p.passion,
    });
  }).join("");

  // Perf : appelé à chaque renderFeed — pas de rebuild si rien n'a changé
  // (les tuiles portent des photos Unsplash : re-set innerHTML = re-décodage/flash).
  if (box._lastHtml !== tilesHTML) { box.innerHTML = tilesHTML; box._lastHtml = tilesHTML; }
}

// `toggleFollowingFilter` a été SUPPRIMÉE le 2026-08-30 (ADR-010) avec la
// bascule `_showFollowingFeed` qu'elle inversait. Le choix « voir mes suivis »
// passe désormais par `setFeedView("suivis")`, qui persiste.

function toggleProfileFilter(passionId) {
  // ⚠️ NE TOUCHE PLUS À « SUIVIS ». La version d'ADR-010 forçait le retour en
  // vue « accueil » ici, parce que le moteur ignorait les passions tant que
  // « Suivis » était allumé — un tap sur une passion n'aurait rien fait sinon.
  // Les critères sont désormais additifs : cocher une passion s'ajoute à
  // « Suivis » au lieu de le remplacer (refonte multi-passion, §4).
  if (_activeFeedPassions.has(passionId)) {
    _activeFeedPassions.delete(passionId);
  } else {
    _activeFeedPassions.add(passionId);
  }
  // Persiste le nouvel état : le Set runtime seul ne survivrait pas au rechargement.
  try { setFeedPassions(Array.from(_activeFeedPassions), { save: false }); } catch (e) {}
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
  // ⚠️ Le nom trompe : aucune passion active ne veut PAS dire « tout le fil ».
  // renderFeed calcule `nothingSelected` et affiche « Choisis une passion » —
  // le fil est VIDE. C'est précisément la confusion qui a produit un mauvais
  // diagnostic le 2026-08-22 (PR #126, corrigée par #127). Persisté, sinon le
  // rechargement ressusciterait les intérêts que l'utilisateur vient de retirer.
  // Cette fonction n'est aujourd'hui câblée à aucun élément d'interface.
  try { setFeedPassions([]); } catch (e) { _activeFeedPassions = new Set(); }
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

// ===== Profils multiples =====
// ADR-009 : plus aucune limite payante ni monnaie interne. Créer un profil-passion
// supplémentaire est libre et gratuit — le paywall « 150 💎 », le « Pass Passion »
// et le compteur `profilesCount()` qui ne servait qu'à eux ont été retirés du
// cœur produit avec le reste de l'économie Passia.

function openCreateProfile() {
  // ⚠️ Lot UI-8 : une passion ARCHIVÉE ne compte pas comme « déjà prise ». Sans
  // ça elle n'apparaissait ni dans la liste, ni dans le catalogue. La choisir
  // ici la RESTAURE (cf. confirmCreateProfile), elle n'en crée pas une seconde.
  // ⚠️ ADR-009 : le paywall qui gardait cette porte (quota gratuit de 3, Pass
  // Passion, paiement en 💎) est retiré avec le reste de l'économie interne.
  // Créer une passion est désormais toujours gratuit, et sans limite — il n'y a
  // plus aucun moyen de payer, donc plus rien à barrer.
  const _v8Cr = passionsUnifieesActives();
  const already = state.user.profiles
    .filter(p => !(_v8Cr && p.archived))
    .map(p => p.passion);
  // ⚠️ SORTIE A (2026-08-30). La grille est bâtie sur les passions PUBLIABLES,
  // pas sur `allPassions()`. Une passion personnalisée n'existe que sur cet
  // appareil : en faire un rangement de publication menait à un insert refusé
  // par la clé étrangère, donc à des posts invisibles de tous — et, quand
  // c'était la seule passion du compte, à un profil public jamais synchronisé.
  // Elle reste entière dans `state.user.customPassions` et reste un centre
  // d'intérêt du fil ; c'est la porte d'ÉCRITURE qui se ferme, pas la passion.
  const pool = passionsPubliables().filter(p => !already.includes(p.id));
  openModal(`
    <div class="modal-handle"></div>
    <div style="text-align:center;margin-bottom:18px;">
      <div style="font-size:28px;margin-bottom:6px;">✨</div>
      <div style="font-weight:800;font-size:17px;color:var(--text);margin-bottom:4px;">Nouvelle passion</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.5;">Une passion range ce que tu publies — ton profil et tes abonnés, eux, restent les mêmes.</div>
    </div>
    <div class="passion-grid new-profile-passion-grid" id="newProfileGrid">
      ${pool.map(p => `
        <div class="passion-tile ${p.custom ? 'passion-custom' : ''}" data-passion="${escapeHtml(p.id)}" onclick="selectNewProfilePassion('${escapeJsArg(p.id)}')">
          <div class="passion-tile-emoji">${p.emoji}</div>
          <div class="passion-tile-label">${escapeHtml(p.label)}</div>
          ${p.custom ? '<div class="passion-custom-badge">Perso</div>' : ''}
        </div>
      `).join("")}
    </div>
    ${pool.length === 0 ? '<div style="font-size:12px;color:var(--muted);text-align:center;margin:8px 0;">Tu as déjà toutes les passions du catalogue ✨</div>' : ''}

    <label class="field" style="margin-top:4px;">
      <span>Bio courte <span style="font-weight:400;color:var(--muted);">(optionnel)</span></span>
      <input type="text" class="input" id="newProfileBio" placeholder="Ex : Photographe amateur · Paris" maxlength="80" />
    </label>
    <button class="btn primary block" id="confirmNewPassionBtn" style="margin-top:12px;" onclick="confirmCreateProfile()">Ajouter cette passion</button>
  `);
  window._newProfilePassion = null;
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

  // ⚠️ Lot UI-8 : cette passion existe peut-être déjà, ARCHIVÉE. La recréer
  // ferait un doublon (deux entrées pour la même passion, que la fusion
  // défensive d'app-02 dédupliquerait ensuite en silence). On la restaure, sans
  // rien effacer.
  if (passionsUnifieesActives()) {
    const _arch = (state.user.profiles || []).find(function (x) { return x.archived && x.passion === pid; });
    if (_arch) { restaurerPassion(_arch.id); return; }
  }

  // Identité centralisée : on réutilise toujours le nom principal du compte.
  const name = (state.user.general && state.user.general.username) || state.user.name || "Passionné";
  const bio = ($("#newProfileBio") ? $("#newProfileBio").value.trim() : "") || "";
  const p = passionById(pid);
  const np = {
    id: uid(),
    name,
    passion: pid,
    emoji: p.emoji,
    // Pas de bio par défaut : elle s'affichait telle quelle sur la carte, et
    // « Profil Cuisine » réintroduisait à l'écran le mot que le lot retire.
    bio: bio || "",
    color: p.color,
    createdAt: Date.now(),
  };

  state.user.profiles.push(np);
  state.user.currentProfileId = np.id;
  // Une passion qu'on vient de créer doit être visible dans le Fil, sinon elle
  // naît grisée et le premier post publié dedans est invisible pour son auteur.
  ajouterPassionAuFil(pid);
  saveState();
  // Synchronise tout de suite le profil actif vers Supabase → découvrable dans la
  // recherche et messageable sans attendre le prochain boot.
  // Passions seules : ni pseudo, ni bio, ni avatar, ni confidentialité.
  if (typeof supaSavePassionState === "function") { try { supaSavePassionState(); } catch (e) {} }
  // Pousse immédiatement user_state (liste complète des profils) sans attendre le
  // debounce de 2500ms — sinon un logout rapide perd le nouveau profil.
  if (typeof supaSaveUserState === "function") { try { supaSaveUserState(); } catch(e) {} }
  closeModal();
  renderProfilesScreen();
  renderTopbar();
  toast(`✨ ${p.label} ajoutée à tes passions`, "success");
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


// ── §3 : LE STUDIO EST LE SEUL POINT DE CHOIX DE LA PASSION DE DESTINATION ──
// Et il doit s'en souvenir. Depuis que la refonte multi-passion a retiré la
// ligne « Passion active » du profil, `#postPassion` est la SEULE commande qui
// désigne une passion d'écriture : si elle ne persistait rien, quelqu'un qui
// publie toujours dans « Podcast » devrait le re-choisir à chaque fois, et le
// Studio rouvrirait sur la passion de son inscription pour toujours.
//
// ⚠️ Cela ne touche AUCUNE préférence de lecture (ADR-010, décision 6) :
// `switchToProfile` écrit `currentProfileId`, jamais `_activeFeedPassions`.
function onStudioPassionChange() {
  try {
    var sel = document.getElementById("postPassion");
    if (!sel || !sel.value) return;
    var pr = (state.user.profiles || []).find(function (p) {
      return p && !p.archived && p.passion === sel.value;
    });
    if (pr && pr.id !== state.user.currentProfileId && typeof switchToProfile === "function") {
      switchToProfile(pr.id);
    }
  } catch (e) {
    if (typeof diagLog === "function") diagLog("studio_passion_change " + (e && e.message));
  }
}

function renderStudio() {
  // ⚠️ Le filet « le Studio se répare après l'éditeur de carnet » a disparu avec
  // l'éditeur (§6) : plus rien ne masque les champs du Studio, donc plus rien à
  // restaurer. Un état résiduel `studioType === "vlog"` — venu d'un brouillon
  // enregistré avant le retrait — est ramené au neutre, sinon le composeur
  // publierait dans un type qui n'existe plus.
  if (studioType === "vlog" || studioType === "cdvlive") studioType = "text";

  // Passion dropdown based on user profiles
  const sel = $("#postPassion");
  // Lot UI-8 : on ne propose pas de créer dans une passion archivée. Les
  // publications existantes gardent la leur — seul le choix futur est borné.
  const _poolBrut = passionsUnifieesActives() ? passionsVivantes() : state.user.profiles;
  // ⚠️ SORTIE A : un compte peut DÉJÀ posséder une passion personnalisée créée
  // avant ce correctif. Elle reste dans son profil et dans son fil, mais on ne
  // lui propose plus d'y publier — l'insert serait refusé et le post perdu.
  const _pool = _poolBrut.filter(p => p && estPassionCanonique(p.passion));
  sel.innerHTML = _pool.map(p => {
    const pn = passionById(p.passion);
    return `<option value="${p.passion}" ${p.id === state.user.currentProfileId ? "selected" : ""}>${pn.emoji} ${pn.label}</option>`;
  }).join("");
  // La ligne d'explication n'apparaît QUE si quelque chose a été écarté : sinon
  // elle inquiéterait pour rien l'immense majorité des comptes.
  //
  // ⚠️ Deux situations, deux messages. « Certaines passions sont écartées » est
  // une information ; « AUCUNE passion publiable » est une impasse, et une
  // impasse doit nommer la sortie. Les confondre laissait un compte 100 %
  // passions personnelles devant un select vide, sans rien à faire.
  const _horsCat = _poolBrut.length - _pool.length;
  const _noteP = $("#studioPassionNote");
  if (_noteP) {
    if (!_pool.length && _horsCat) {
      _noteP.innerHTML = "Tes passions n'existent que chez toi : elles rangent ton fil, mais on ne peut pas encore y publier. "
        + '<a href="#" onclick="event.preventDefault();openCreateProfile();" style="color:var(--accent);font-weight:700;">Ajoute une passion du catalogue</a> pour publier.';
      _noteP.style.display = "block";
    } else if (_horsCat) {
      _noteP.textContent = "Tes passions personnelles rangent ton fil, mais on ne peut pas encore y publier.";
      _noteP.style.display = "block";
    } else {
      _noteP.textContent = "";
      _noteP.style.display = "none";
    }
  }

  // Drafts
  // 🔧 FIX AUDIT 2026-06-10 : #draftList n'existe plus dans le markup →
  // TypeError à CHAQUE ouverture du Studio (goTo("studio") → renderStudio).
  const drafts = state.user.drafts || [];
  const dl = $("#draftList");
  if (!dl) return;
  if (drafts.length === 0) {
    dl.innerHTML = `<div class="empty"><div class="empty-icon">📝</div><div class="empty-title">Aucun brouillon</div><div class="empty-text">Tes brouillons apparaîtront ici.</div></div>`;
  } else {
    dl.innerHTML = drafts.map(d => `<div class="list-row" onclick="loadDraft('${escapeJsArg(escapeHtml(d.id))}')">
      <div style="font-size:22px;">${d.type === "photo" ? "📷" : d.type === "audio" ? "🎙" : "✍️"}</div>
      <div class="list-row-body">
        <div class="list-row-title">${escapeHtml((d.text || "").slice(0, 60)) || "(vide)"}</div>
        <div class="list-row-meta">${passionById(d.passion).label} · ${fmtTime(d.at)}</div>
      </div>
      <button class="btn small ghost" onclick="event.stopPropagation();deleteDraft('${escapeJsArg(escapeHtml(d.id))}')">🗑</button>
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
    // ⚠️ Le masquage des champs « en mode carnet/live » a été retiré avec le
    // Carnet de voyage (§6). Les types `vlog` et `cdvlive` n'existent plus, donc
    // le texte libre, la passion, le mood et les modèles restent TOUJOURS
    // visibles ici — c'est précisément le défaut que ce masquage avait produit
    // le 2026-08-29 (un Studio amputé, sans chemin de retour).
  });
});

// ⚠️ RETRAIT DU CARNET DE VOYAGE (refonte multi-passion, §6).
// Quatre fonctions vivaient ici et sont parties avec l'écran CDV :
// `_studioChampsTexteVisibles` (elle ne servait qu'à masquer puis rendre les
// champs que l'éditeur de carnet empruntait au Studio), `activateStudioVlog`,
// `closeCarnetEditor` et `saveCarnetEdits`.
//
// ⚠️ Le défaut qu'elles portaient disparaît avec elles, et il vaut d'être
// retenu : ouvrir l'éditeur de carnet AMPUTAIT le Studio (texte libre, passion
// et mood masqués), et le seul chemin de restauration était un onglet de format
// que le lot UI-6 avait retiré de l'écran. Un composeur muet, sans erreur ni
// message, jusqu'au rechargement. Famille générale : retirer un chemin d'accès
// peut supprimer le seul chemin de RETOUR d'un état transitoire.


// ⚠️ Les moods « chill » et « actu » ont quitté le Studio avec l'alignement du
// vocabulaire sur le rail d'intentions du Fil : ils n'ont plus de pastille.
// Un brouillon plus ancien qui en porte un rechargeait donc une rangée SANS
// pastille active — état muet, que l'auteur ne pouvait corriger qu'en cliquant
// au hasard, et qui republiait en silence un mood absent de l'écran. Les deux
// valaient déjà « generic » pour `legacyMoodToFeedIntent`, exactement comme le
// neutre « all » : les y ramener ne perd aucun classement.
// La rangée est lue dans le DOM plutôt qu'en dur : une pastille ajoutée demain
// est reconnue sans toucher à cette fonction.
function normalizeStudioMood(mood) {
  var connu = false;
  $$("#postMoodRow .pill").forEach(function (el) {
    if (el.getAttribute("data-postmood") === mood) connu = true;
  });
  return connu ? mood : "all";
}

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
  if (!f) return;

  const maxSize = 30 * 1024 * 1024; // 30 Mo
  if (f.size > maxSize) {
    const sizeMB = Math.round(f.size / 1024 / 1024);
    toast(`Vidéo trop lourde (${sizeMB} Mo, max 30 Mo).`);
    return;
  }

  toast("⏳ Chargement vidéo...");

  const reader = new FileReader();
  reader.onerror = () => toast("Erreur lors de la lecture de la vidéo.");
  reader.onload = () => {
    try {
      videoDataUrl = reader.result;
      studioType = "video";

      $$("#studioTypeTabs .studio-type").forEach(e => e.classList.remove("active"));
      document.querySelector('[data-type="video"]')?.classList.add("active");

      $("#studioPhoto").style.display = "none";
      $("#studioVideo").style.display = "block";
      $("#studioAudio").style.display = "none";

      renderVideoPreview();
      toast("✅ Vidéo chargée !");
    } catch (err) {
      toast("Erreur lors du traitement de la vidéo.");
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
    $("#studioPhoto").style.display = "none";
    // Afficher l'audio en lecture
    $("#recStatus").textContent = "✅ Audio chargé et prêt à publier";
    $("#recPlayback").innerHTML = `<audio controls src="${escapeHtml(audioDataUrl)}" style="width:100%;margin-top:6px;"></audio>`;
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
        $("#recStatus").textContent = "Enregistrement prêt à publier";
        $("#recPlayback").innerHTML = `<audio controls src="${escapeHtml(audioDataUrl)}" style="width:100%;margin-top:6px;"></audio>
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

// Verrou anti-double-clic : empêche deux soumissions simultanées du même post
let _publishInProgress = false;

async function publishPost() {
  // Mode invité (première visite) : cette action engage le compte. Le gate
  // EXPLIQUE l'action puis propose la création de compte ; il ne rejoue jamais
  // l'action après coup. Rend `true` — donc inerte — hors mode invité.
  if (window.requireAuthentication && !requireAuthentication("publier")) return false;
  if (_publishInProgress) {
    toast("Publication en cours, attends un moment...");
    return;
  }

  const text = $("#postText").value.trim();
  const passion = $("#postPassion").value;

  if (studioType === "text" && text.length < 3) {
    toast("Écris quelque chose.");
    return;
  }
  if (studioType === "photo" && !photoDataUrl) {
    toast("Ajoute une photo.");
    return;
  }
  if ((studioType === "video" || studioType === "bobine") && !videoDataUrl) {
    toast(studioType === "bobine" ? "Ajoute une vidéo pour ta bobine." : "Ajoute une vidéo.");
    return;
  }
  if (studioType === "audio" && !audioDataUrl) {
    toast("Enregistre un audio.");
    return;
  }

  _publishInProgress = true;

  // ⚠️ IMPASSE FERMÉE LE 2026-08-31. La sortie A retire du `<select>` les
  // passions non publiables. Un compte dont TOUTES les passions sont
  // personnelles se retrouve donc devant un select VIDE, `value` vaut "", et
  // l'ancien chemin créait quand même le post EN LOCAL (affichage optimiste)
  // avant que le garde central ne le refuse. Résultat : un post visible chez
  // son auteur, jamais parti, perdu au changement d'appareil — exactement la
  // perte silencieuse que ce chantier ferme.
  //
  // On refuse donc ICI, avant toute création locale, et on dit quoi faire.
  if (!estPassionCanonique(passion)) {
    _publishInProgress = false;
    // ⚠️ Le discriminant est ce que le COMPTE possède, PAS le catalogue.
    // `passionsPubliables()` rend les 19 passions du catalogue : elle n'est
    // jamais vide, donc la brancher ici rendait l'impasse inatteignable et
    // renvoyait le compte bloqué au message « choisis » — dans un select vide.
    var _mienne = (typeof passionParDefautPourPublier === "function") ? passionParDefautPourPublier() : null;
    toast(_mienne
      ? "Choisis une passion pour publier."
      : "⚠️ Ajoute une passion du catalogue pour publier — tes passions personnelles rangent ton fil, mais on ne peut pas encore y publier.");
    return;
  }

  toast("⏳ Publication en cours...", "loading");

  // ✅ Afficher directement le nom du profil courant!
  const prof = currentProfile();
  const g = state.user.general || {};

  // Username manquant : résolution en ARRIÈRE-PLAN — l'await ici bloquait
  // l'affichage optimiste du post d'un aller-retour réseau complet.
  if (!g.username && typeof supa !== "undefined" && supa && MY_UID) {
    supa.from("profiles").select("username").eq("id", MY_UID).maybeSingle().then(({ data }) => {
      if (data?.username) {
        state.user.general.username = data.username;
        post.authorName = data.username;
        saveState();
      }
    }).catch(() => {});
  }

  // ✅ L'auteur d'un post est le COMPTE (ADR-010), jamais une passion.
  //
  // ⚠️ Le nom suivait déjà `general.username`, mais l'emoji et la couleur
  // restaient ceux de la passion ACTIVE. Deux conséquences, mesurées :
  //  · publier dans une passion autre que l'active produisait un post dont
  //    `passion`/`profileId` disaient A et dont l'emoji disait B ;
  //  · la carte optimiste locale ne correspondait pas à ce que le serveur rend
  //    ensuite — `supaLoadPosts` reconstruit l'avatar depuis `profiles.emoji`,
  //    c'est-à-dire l'identité du compte. L'emoji changeait donc au rechargement.
  // Même correction que dans `supaUpsertProfile` le 2026-08-30 : l'identité
  // publiée est celle du compte, avec repli sur la passion pour un état ancien
  // qui n'aurait jamais renseigné `general`.
  const authorName = (state.user.general?.username) || prof?.name || state.user.name || "Profil";
  const authorEmoji = g.emoji || prof?.emoji || "✨";
  const authorColor = g.color || prof?.color || "#8b5cf6";

  // Rattacher le post à la passion CHOISIE (pas à la passion active) pour que le
  // filtre de l'écran profil reste cohérent. Repli sur la passion active.
  // ⚠️ On ne retient qu'une passion VIVANTE : le `<select>` ne propose que
  // celles-là, mais cette recherche balayait `profiles` en entier, archivées
  // comprises — un `profileId` rangé restait donc atteignable par du code qui
  // poserait la valeur du select lui-même.
  const _matchProf = (state.user.profiles || []).find(function(pr){ return pr.passion === passion && !pr.archived; })
    || (state.user.profiles || []).find(function(pr){ return pr.passion === passion; });
  const post = {
    id: uid(),
    authorId: (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me",
    profileId: (_matchProf && _matchProf.id) || state.user.currentProfileId,
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

  // ⚠️ Les champs de carnet (destination, étapes, budget, transport…) ont été
  // retirés du post publié avec la fonctionnalité (§6).

  // Album d'événement : le Studio a été ouvert depuis « Partager mon expérience »
  // sur la fiche d'un événement (window._pendingEventPost) → on rattache le post
  // à cet événement pour qu'il remonte dans son album. Le drapeau est à usage
  // UNIQUE (sinon toutes les publications suivantes seraient rattachées aussi).
  if (window._pendingEventPost) {
    post.eventId = window._pendingEventPost;
    window._pendingEventPost = null;
  }

  // Ajouter au state local IMMÉDIATEMENT (optimistic update)
  state.userPosts.unshift(post);
  saveState();

  // Naviguer et afficher immédiatement. Une bobine → viewer Bobines (pas le feed).
  if (post.isReel) {
    try { renderFeed(); } catch(e) {}
    setTimeout(() => { try { if (typeof openReels === "function") openReels(); } catch(e) {} }, 80);
  } else {
    goTo("feed");
    setTimeout(() => renderFeed(), 50);
  }

  // Synchroniser EN BACKGROUND avec timeout 5s
  let syncSuccess = false;
  try {
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve(false), 5000)
    );

    // Quand l'upload se termine (même après le timeout d'affichage), l'URL Storage
    // a remplacé le base64 dans `post` → on persiste et on re-rend pour fixer l'image.
    const syncPromise = supaPublishPostWithRetry(post).then((ok) => {
      if (ok) { try { saveState(); renderFeed(); } catch (e) {} }
      return ok;
    });
    syncSuccess = await Promise.race([syncPromise, timeoutPromise]);

    if (syncSuccess) {
      toast("✅ Post publié !", "success");
      try { supaTrack("publish_post", { type: post.type, passion: post.passion, is_reel: !!post.isReel }); } catch(_) {}
    } else {
      // ⚠️ « connexion lente » accusait le RÉSEAU pour une erreur de DONNÉES :
      // l'utilisateur réessayait une opération qui ne pouvait jamais aboutir
      // (docs/PASSION_PERSONNALISEE_FK_2026-08-30.md §3).
      var _msgP = (typeof messageEchecPassion === "function") ? messageEchecPassion() : null;
      toast(_msgP || "⏱️ Post en local (connexion lente)", "warning");
    }
  } catch (e) {
    toast("⏱️ Post en local (erreur réseau)", "warning");
  } finally {
    _publishInProgress = false; // libère le verrou quoi qu'il arrive
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


  // ✅ Le message de confirmation est déjà dans supaPublishPostWithRetry
  // (toast "Publication en cours..." → "✅ Post publié!" ou "❌ Erreur")
  // Pas de duplication ici

  // Navigation immédiate
  {
    // 🔄 RECHARGER LES POSTS APRÈS PUBLICATION
    if (syncSuccess) {
      try {
        diagLog("🔄 Reloading posts after publish...");
        const newPosts = await supaLoadPosts();
        if (newPosts && newPosts.length > 0) {
          state.seed.posts = newPosts;
          diagLog(`✅ ${newPosts.length} posts reloaded`);
        }
      } catch(e) { /* erreur réseau non bloquante */ }
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
    // Filet de dernier recours : un `<select>` peut valoir "" sans que personne
    // ne l'ait voulu (une affectation à une valeur sans <option> le vide en
    // silence — cf. shareEventExperience). Un post sans passion perd sa
    // provenance ET disparaît du fil de son auteur, que le filtre de passions
    // écarte. On retombe donc sur l'identité active, jamais sur du vide.
    passion: $("#postPassion").value || (currentProfile() && currentProfile().passion) || "",
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
  // ⚠️ La passion du brouillon était la SEULE chose que `loadDraft` ne
  // restaurait pas. Tant que le `<select>` proposait toutes les passions, le
  // brouillon repartait sous la sienne par la présélection du profil actif.
  // Depuis le filtre canonique, un brouillon rangé dans une passion non
  // publiable serait republié sous une AUTRE passion, sans un mot. On la
  // restaure quand elle est encore proposée, et on le DIT quand elle ne l'est
  // plus — plutôt que de reclasser dans le dos de son auteur.
  setTimeout(function () {
    try {
      var sel = $("#postPassion");
      if (!sel || !d.passion) return;
      var dispo = [].slice.call(sel.options).some(function (o) { return o.value === d.passion; });
      if (dispo) { sel.value = d.passion; return; }
      var pn = (typeof passionById === "function") ? passionById(d.passion) : null;
      toast("⚠️ « " + ((pn && pn.label) || d.passion) + " » n'est plus publiable : choisis une passion avant d'envoyer.");
    } catch (e) {}
  }, 0);
  studioMood = normalizeStudioMood(d.mood);
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
    $("#recPlayback").innerHTML = `<audio controls src="${escapeHtml(audioDataUrl)}" style="width:100%;margin-top:6px;"></audio>`;
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
    <div class="trending-tile" onclick="openPassionExplorer('${escapeJsArg(p.id)}')">
      <div class="trending-emoji">${escapeHtml(p.emoji)}</div>
      <div class="trending-name">${escapeHtml(p.label)}</div>
      <div class="trending-stat">${p.count} post${p.count>1?"s":""} · 🔥</div>
    </div>
  `).join("");

  // All passions + CTA « Créer une passion » à la fin
  const customs = (state.user.customPassions || []);
  const allList = [...PASSIONS, ...customs];
  // ⛔ Tuile masquée tant que `passionsPersoSuspendues()` — arbitrage du
  // 2026-08-31 : une passion non canonique ne peut alimenter aucun contenu
  // serveur, donc l'offrir comme centre d'intérêt créerait un filtre sans
  // contenu. Les passions DÉJÀ créées restent affichées dans la grille
  // ci-dessous (`customs`), avec leur badge « Perso » : rien n'est supprimé.
  const createCta = (typeof passionsPersoSuspendues === "function" && passionsPersoSuspendues()) ? "" : `
    <div class="passion-tile passion-tile-create" onclick="openCreateCustomPassionFromExplorer()">
      <div class="passion-tile-emoji">＋</div>
      <div class="passion-tile-label">Créer une passion</div>
    </div>
  `;
  $("#allPassions").innerHTML = allList.map(p => `
    <div class="passion-tile ${p.custom ? 'passion-custom' : ''}" onclick="openPassionExplorer('${escapeJsArg(p.id)}')">
      <div class="passion-tile-emoji">${escapeHtml(p.emoji)}</div>
      <div class="passion-tile-label">${escapeHtml(p.label)}</div>
      ${p.custom ? '<div class="passion-custom-badge">Perso</div>' : ''}
    </div>
  `).join("") + createCta;

  // Suggested creators : seed en premier, puis vrais utilisateurs Supabase chargés async
  const seedHtml = state.seed.users.slice(0, 4).map(u => {
    const p = passionById(u.passion);
    return `<div class="list-row" onclick="openUserProfile('${escapeJsArg(u.id)}')">
      <div class="avatar" style="background:${avatarBg(u)};">${avatarInner(u)}</div>
      <div class="list-row-body">
        <div class="list-row-title">${escapeHtml(u.name)}</div>
        <div class="list-row-meta">${p.emoji} ${p.label} · ${escapeHtml(u.bio || "")}</div>
      </div>
      <button class="btn small" onclick="event.stopPropagation();toast('+ ${escapeJsArg(u.name)} suivi·e')">Suivre</button>
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
          return `<div class="list-row" onclick="openUserProfile('${escapeJsArg(u.id)}')">
            <div class="avatar" style="background:${avatarBg(_av)};">${avatarInner(_av)}</div>
            <div class="list-row-body">
              <div class="list-row-title">${name}</div>
              <div class="list-row-meta">${p.emoji} ${p.label}${bio ? " · " + bio.slice(0, 40) : ""}</div>
            </div>
            <button class="btn small" onclick="event.stopPropagation();followUserFromExplorer('${escapeJsArg(u.id)}','${escapeJsArg(name)}')">Suivre</button>
          </div>`;
        }).join("");
        // Remplacer la section avec seed (4) + vrais users (jusqu'à 8)
        const seedSlice = state.seed.users.slice(0, 4).map(u => {
          const p = passionById(u.passion);
          return `<div class="list-row" onclick="openUserProfile('${escapeJsArg(u.id)}')">
            <div class="avatar" style="background:${avatarBg(u)};">${avatarInner(u)}</div>
            <div class="list-row-body">
              <div class="list-row-title">${escapeHtml(u.name)}</div>
              <div class="list-row-meta">${p.emoji} ${p.label} · ${escapeHtml(u.bio || "")}</div>
            </div>
            <button class="btn small" onclick="event.stopPropagation();toast('+ ${escapeJsArg(u.name)} suivi·e')">Suivre</button>
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
  // Passer par le chemin CANONIQUE (supaFollowUser) : il garantit la FK
  // (supaUpsertProfile avant l'insert) ET notifie la personne suivie — le raw
  // insert précédent écrivait le follow mais la cible n'en était jamais avertie.
  if (typeof supaFollowUser === "function") { try { supaFollowUser(userId); } catch (e) {} }
  else if (typeof supa !== "undefined" && supa && MY_UID) {
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
      return '<div class="ai-card" onclick="openUserProfile(\'' + escapeJsArg(u.id) + '\')">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<div style="width:32px;height:32px;border-radius:50%;background:' + avatarBg(u) + ';display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;">' + avatarInner(u) + '</div>' +
          '<div><div class="ai-card-title" style="margin:0;">' + escapeHtml(u.name) + '</div><div class="ai-card-meta">' + p.emoji + ' ' + p.label + '</div></div>' +
        '</div>' +
      '</div>';
    }).join("");
    return '<div><div class="ai-section-label">👤 Créateurs' + (allPid ? ' · ' + allPid : '') + '</div>' + uCards + '</div>';
  }

  // --- Gamification ---
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
        html += '<div class="ai-card" onclick="openUserProfile(\'' + escapeJsArg(u.id) + '\')">' +
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
      html2 += '<div class="ai-card" onclick="openPassionExplorer(\'' + escapeJsArg(p.id) + '\')">' +
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
    '<em>"Conseils en photographie"</em>, <em>"Events IRL Lyon"</em>, <em>"Rencontrer des passionnés"</em>' +
    '</div>';
}

