// Click sur les pills filter de CDV - multi-select
document.addEventListener("click", (e) => {
  const t = e.target.closest("#cdvFilterRow [data-cdvfilter]");
  if (!t) return;

  const filterType = t.getAttribute("data-cdvfilter");

  // Toggle multi-select
  if (cdvFilters.has(filterType)) {
    cdvFilters.delete(filterType);
  } else {
    cdvFilters.add(filterType);
  }

  console.log("[CDV] Filtres sélectionnés:", Array.from(cdvFilters));
  renderCdvScreen();
});

// Carrousel des carnets de voyage en haut du Fil, point d'entrée principal
function renderVlogCarousel() {
  const el = $("#vlogCarousel");
  if (!el) return;
  const carnets = allCarnets().slice(0, 8); // max 8 mini-cartes
  // Toujours afficher la tuile "Créer" en premier, invitation visible
  let html = `<div class="vlog-card-create" onclick="setStudioToVlog()">
    <div class="vlog-card-create-icon">＋</div>
    <div class="vlog-card-create-label">Créer un carnet</div>
    <div class="vlog-card-create-sub">Raconte ton voyage</div>
  </div>`;

  html += carnets.map(c => {
    const stats = vlogStats(c);
    return `<div class="vlog-card-mini" onclick="openVlogViewer('${c.id}')">
      <img loading="lazy" decoding="async" class="vlog-card-mini-cover" src="${c.cover || `https://picsum.photos/seed/vlog-mini-${c.id}/360/240`}" alt="${escapeHtml(c.destination || '')}" onerror="this.onerror=null;this.src='https://picsum.photos/seed/vlog-mini-${c.id}/360/240';"/>
      <div class="vlog-card-mini-overlay"></div>
      <span class="vlog-card-mini-tag">📔 CARNET</span>
      <div class="vlog-card-mini-meta">
        <div class="vlog-card-mini-dest">${escapeHtml(c.destination || "Voyage")}</div>
        <div class="vlog-card-mini-stats">${stats.durée}j · ${stats.nbDays} étapes${c.budget ? " · " + escapeHtml(c.budget.split('(')[0].trim()) : ""}</div>
      </div>
    </div>`;
  }).join("");

  el.innerHTML = html;
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#vlogViewer") && $("#vlogViewer").classList.contains("open")) {
    closeVlogViewer();
  }
});

// ===== MENU D'OPTIONS D'UN POST (⋯) =====
// Bottom-sheet façon Instagram : la suppression vit ici, plus dans l'en-tête du post.
function openPostOptions(postId) {
  openModal(`
    <div class="modal-handle"></div>
    <div class="post-options-sheet">
      <button class="post-option danger" onclick="closeModal();confirmDeletePost('${postId}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7 H20"/><path d="M9 7 V4 H15 V7"/><path d="M6 7 L7 20 H17 L18 7"/><path d="M10 11 V17"/><path d="M14 11 V17"/></svg>
        Supprimer le post
      </button>
      <button class="post-option" onclick="closeModal()">Annuler</button>
    </div>
  `);
}

// ===== SUPPRESSION DES POSTS =====
function confirmDeletePost(postId) {
  const post = state.userPosts.find(p => p.id === postId);
  if (!post) {
    toast("Tu ne peux supprimer que tes propres posts.");
    return;
  }
  // Aperçu rapide du contenu pour la confirmation
  const preview = (post.text || "").slice(0, 80) + (post.text && post.text.length > 80 ? "…" : "");
  const html = `
    <div class="modal-handle"></div>
    <span class="modal-close" onclick="closeModal()">×</span>
    <div class="pay-modal-head">
      <div class="pay-modal-emoji">🗑</div>
      <div class="pay-modal-title">Supprimer ce post ?</div>
    </div>
    <div style="font-size:13px;color:var(--text);margin-bottom:14px;line-height:1.55;text-align:center;">
      Cette action est <b>définitive</b>. Le post et ses commentaires seront supprimés. Tes points et Passia gagnés à la publication restent acquis.
    </div>
    ${preview ? `<div style="background:rgba(139,92,246,0.06);padding:10px 12px;border-radius:10px;margin-bottom:14px;font-size:12px;color:var(--text-dim);font-style:italic;line-height:1.5;">« ${escapeHtml(preview)} »</div>` : ""}
    <button class="btn block" style="background:#dc2626;color:#fff;border-color:#dc2626;margin-bottom:8px;" onclick="deletePost('${postId}')">
      Oui, supprimer définitivement
    </button>
    <button class="btn ghost block" onclick="closeModal()">Annuler</button>
  `;
  openModal(html);
}

function deletePost(postId) {
  const idx = state.userPosts.findIndex(p => p.id === postId);
  if (idx === -1) {
    toast("Post introuvable.");
    closeModal();
    return;
  }
  const post = state.userPosts[idx];
  // Retire le post de la liste perso
  state.userPosts.splice(idx, 1);
  // Nettoie les références (likes notamment)
  state.user.likedPosts = (state.user.likedPosts || []).filter(x => x !== postId);
  // Trace dans l'historique
  state.transactions.unshift({
    id: uid(),
    kind: "post_delete",
    pts: 0,
    passia: 0,
    label: "Post supprimé",
    at: Date.now(),
  });
  saveState();
  // Supprimer aussi dans Supabase
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    supa.from("posts").delete().eq("id", postId).eq("author_id", MY_UID).then(() => {}).catch(() => {});
    // Nettoyer le média Storage associé → évite les fichiers orphelins (coût à l'échelle).
    // Best-effort : si la RLS Storage refuse, on ignore (le pire = un orphelin, statu quo).
    try {
      const marker = "/storage/v1/object/public/content/";
      const paths = [post && post.image, post && post.video, post && post.audio, post && post.cover]
        .filter(function(u){ return typeof u === "string" && u.indexOf(marker) !== -1; })
        .map(function(u){ return decodeURIComponent(u.slice(u.indexOf(marker) + marker.length).split("?")[0]); });
      if (paths.length) supa.storage.from("content").remove(paths).then(function(){}).catch(function(){});
    } catch(e) {}
  }
  // Retirer aussi de seed.posts si présent
  state.seed.posts = (state.seed.posts || []).filter(p => p.id !== postId);
  closeModal();
  // Fermer la page de détail si elle affichait ce post (sinon il reste à l'écran)
  if (typeof closePost === "function") closePost();
  // Re-render selon l'écran courant
  renderFeed();
  if (typeof renderProfilesScreen === "function") renderProfilesScreen();
  toast("Post supprimé.");
}

// Détecte une URL d'image/GIF (Giphy/Tenor ou extension média) pour rendre un
// commentaire « GIF » comme une vraie image plutôt qu'en texte brut. Utilisé par
// le renderer unifié → un commentaire dont le texte EST une URL de GIF s'affiche
// en image dans les 3 contextes (fil / IRL / CDV) sans changement de schéma.
function _looksLikeMediaUrl(s) {
  if (!s || typeof s !== "string") return false;
  s = s.trim();
  if (!/^https?:\/\//i.test(s)) return false;
  return /\.(gif|png|jpe?g|webp)(\?|#|$)/i.test(s)
    || /(giphy\.com|tenor\.com|media\d*\.giphy|media\.tenor)/i.test(s);
}
function _commentBodyHtml(txt) {
  return _looksLikeMediaUrl(txt)
    ? '<img loading="lazy" decoding="async" src="' + txt.replace(/"/g, "&quot;") + '" style="max-width:160px;border-radius:10px;margin-top:2px;display:block;" alt="GIF" />'
    : escapeHtml(txt || "");
}

function _renderCommentsList(allComments, postId) {
  // Masquer les commentaires des utilisateurs bloqués (modération)
  var _visible = (allComments || []).filter(c => !(typeof isBlocked === "function" && isBlocked(c.authorId)));
  // Pagination : injecter 80+ commentaires d'un coup coûtait ~130ms de DOM
  // (gros lag, rejoué à chaque (ré)ouverture et interaction). On n'affiche que
  // les _LIMIT plus récents (l'array est trié récent→ancien) ; le reste via
  // "voir plus". Cap le coût de paint quel que soit le contexte (fil/IRL/CDV).
  var _LIMIT = 30;
  var _olderBtn = "";
  if (!(window._cmtExpanded && window._cmtExpanded[postId]) && _visible.length > _LIMIT) {
    _olderBtn = '<button class="btn ghost block" style="margin:10px auto 2px;display:block;font-size:12px;" onclick="_expandComments(\'' + postId + '\')">↓ Voir les ' + (_visible.length - _LIMIT) + ' commentaires plus anciens</button>';
    _visible = _visible.slice(0, _LIMIT);
  }
  return _visible.map(c => {
    let name, emoji, avatarColor, authorId;
    authorId = c.authorId || "?";
    // Normalisation cross-contexte : les commentaires IRL/CDV utilisent c.author
    // et c.at au lieu de c.authorName/c.createdAt → on aligne sur la forme « post »
    // pour que ce même renderer marche partout.
    if (!c.authorName && c.author) c.authorName = c.author;
    if (c.createdAt == null && c.at != null) c.createdAt = c.at;
    // Priorité : infos embarquées (Supabase) > userById
    const _cu = userById(authorId) || { name: "?", profileEmoji: "👤", avatar: "#64748b" };
    if (c.authorName) {
      name = c.authorName; emoji = c.authorEmoji || "✨"; avatarColor = _cu.avatar || "#8b5cf6";
    } else {
      name = _cu.name; emoji = _cu.profileEmoji; avatarColor = _cu.avatar;
    }
    const _cAv = { avatar: avatarColor, profileEmoji: emoji, name, photoUrl: _cu.photoUrl || null };
    const cSrc = (authorId === "me" || (typeof MY_UID !== "undefined" && authorId === MY_UID)) ? "me" : "seed";
    // « Aimé par moi » : likeComment() enregistre le like sous MY_UID (et non
    // state.user.id, souvent vide) → comparer la liste likedBy à TOUTES mes
    // identités possibles, sinon le ❤️ repasse en 🤍 à chaque re-render (bug
    // fil/IRL/CDV : le like semblait disparaître).
    const _selfIds = [(typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : null, state.user?.id, "me"].filter(Boolean);
    const cLiked = (c.likedBy || []).some(x => _selfIds.indexOf(x) > -1);
    const cLikes = c.likes || 0;
    // Sépare les VRAIES réponses (texte / GIF) des réactions emoji : une réaction
    // emoji n'est PAS un commentaire → elle ne s'affiche pas en ligne de réponse mais
    // dans une pastille « 😍 N » cliquable (cf. _cmtReactChipHtml / openCommentReactors).
    const cAllReplies = c.replies || [];
    const cReplies = cAllReplies.filter(r => r.type !== "emoji_reaction");
    const cReactChip = _cmtReactChipHtml(postId, c);

    const cMine = (authorId === "me" || (typeof MY_UID !== "undefined" && authorId === MY_UID));
    return `<div class="comment" data-commentid="${c.id}">
      <div class="avatar sm" style="background:${avatarBg(_cAv)};cursor:pointer;" onclick="event.stopPropagation();closeModal();openUserProfile('${authorId}','${cSrc}')">${avatarInner(_cAv)}</div>
      <button class="comment-menu-btn" title="Options" onclick="event.stopPropagation();return openCommentOptions('${postId}','${c.id}',${cMine ? 1 : 0}, event);"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>
      <div class="comment-body">
        <div class="comment-author" style="cursor:pointer;" onclick="event.stopPropagation();closeModal();openUserProfile('${authorId}','${cSrc}')">${escapeHtml(name)}</div>
        <div class="comment-text">${_commentBodyHtml(c.text || c.content || "")}</div>
        <div class="comment-meta">${fmtTime(c.createdAt || c.at)}</div>
        <div class="comment-actions">
          <span class="comment-action ${cLiked ? "liked" : ""}" onclick="return likeComment('${postId}','${c.id}', event);">
            ${cLiked ? "❤️" : "🤍"} ${cLikes}
          </span>
          <span class="comment-action" onclick="return replyToComment('${postId}','${c.id}','${escapeJsArg(name)}', event);" title="Répondre">💬</span>
          <span class="comment-action" onclick="return showEmojiPickerForComment('${postId}','${c.id}', event);" title="Emoji & GIF">😊</span>
          ${cReactChip}
          ${cReplies.length > 0 ? `<span class="comment-reply-count" onclick="return toggleCommentReplies('${c.id}', event);">▲ Masquer les réponses</span>` : ""}
        </div>
        ${cReplies.length > 0 ? `<div class="comment-replies" id="replies-${c.id}" style="display:block;">${cReplies.map(r => {
          const ru = userById(r.authorId) || { name: "?", profileEmoji: "👤", avatar: "#64748b" };
          const rSrc = r.authorId === "me" ? "me" : "seed";

          // Si c'est une réaction emoji, afficher différemment
          if (r.type === "emoji_reaction") {
            const _rAv = { avatar: ru.avatar || "#64748b", profileEmoji: ru.profileEmoji || "👤", name: ru.name, photoUrl: ru.photoUrl || null };
            return `<div class="comment-reply" style="display:flex;align-items:center;gap:6px;padding:4px 0;">
              <div class="avatar xs" style="background:${avatarBg(_rAv)};flex-shrink:0;cursor:pointer;" onclick="event.stopPropagation();closeModal();openUserProfile('${r.authorId}','${rSrc}')">${avatarInner(_rAv)}</div>
              <div><span style="font-size:11px;color:var(--text);font-weight:600;cursor:pointer;" onclick="event.stopPropagation();closeModal();openUserProfile('${r.authorId}','${rSrc}')">${escapeHtml(ru.name)}</span> <span style="font-size:14px;">${r.text}</span></div>
            </div>`;
          }

          // Si c'est une réaction GIF
          if (r.type === "gif_reaction") {
            const _rAv = { avatar: ru.avatar || "#64748b", profileEmoji: ru.profileEmoji || "👤", name: ru.name, photoUrl: ru.photoUrl || null };
            return `<div class="comment-reply" style="display:flex;align-items:flex-start;gap:6px;padding:4px 0;">
              <div class="avatar xs" style="background:${avatarBg(_rAv)};flex-shrink:0;cursor:pointer;" onclick="event.stopPropagation();closeModal();openUserProfile('${r.authorId}','${rSrc}')">${avatarInner(_rAv)}</div>
              <div><span style="font-size:11px;color:var(--text);font-weight:600;cursor:pointer;" onclick="event.stopPropagation();closeModal();openUserProfile('${r.authorId}','${rSrc}')">${escapeHtml(ru.name)}</span><br/>
              <img loading="lazy" decoding="async" src="${r.text}" style="width:90px;height:90px;border-radius:8px;margin-top:4px;object-fit:cover;" alt="GIF" /></div>
            </div>`;
          }

          // Réponse normale — avec sa propre action « réagir » + pastille de réactions
          const _rAvT = { avatar: ru.avatar || "#64748b", profileEmoji: ru.profileEmoji || "👤", name: ru.name, photoUrl: ru.photoUrl || null };
          const rReactChip = _cmtReactChipHtml(postId, r);
          return `<div class="comment-reply" data-replyid="${r.id}" style="display:flex;align-items:flex-start;gap:6px;padding:4px 0;">
            <div class="avatar xs" style="background:${avatarBg(_rAvT)};flex-shrink:0;cursor:pointer;" onclick="event.stopPropagation();closeModal();openUserProfile('${r.authorId}','${rSrc}')">${avatarInner(_rAvT)}</div>
            <div style="flex:1;min-width:0;"><span class="comment-reply-author" style="font-size:11px;font-weight:600;cursor:pointer;" onclick="event.stopPropagation();closeModal();openUserProfile('${r.authorId}','${rSrc}')">${escapeHtml(ru.name)}</span> ${_commentBodyHtml(r.text)}
            <div class="comment-reply-actions" style="display:flex;align-items:center;gap:10px;margin-top:2px;">
              <span style="font-size:10px;color:var(--muted);">${fmtTime(r.createdAt)}</span>
              <span class="comment-action" style="font-size:12px;" onclick="return reactToReply('${postId}','${r.id}', event);" title="Réagir">😊</span>
              ${rReactChip}
            </div></div>
          </div>`;
        }).join("")}</div>` : ""}
      </div>
    </div>`;
  }).join("") + _olderBtn;
}

// Déplie tous les commentaires d'un fil (retire le cap de pagination) puis re-rend.
function _expandComments(threadId) {
  window._cmtExpanded = window._cmtExpanded || {};
  window._cmtExpanded[threadId] = true;
  if (typeof _refreshCommentThreadUI === "function") _refreshCommentThreadUI(threadId);
}

// ════════════════════════════════════════════════════════════════════════
// RÉACTIONS EMOJI SUR UN COMMENTAIRE — pastille unique « 😍 N » (fil/IRL/CDV).
// Une réaction emoji n'est PAS un commentaire : toutes les réactions d'un même
// commentaire sont agrégées en UN SEUL emoji (le plus fréquent) + le total ; un
// clic ouvre la liste de QUI a réagi (et avec quoi). Identique partout.
// ════════════════════════════════════════════════════════════════════════
function _cmtReactions(comment) {
  return (comment && comment.replies || []).filter(function(r){ return r && r.type === "emoji_reaction"; });
}
// Localise un NŒUD de commentaire — un commentaire de premier niveau OU une réponse
// — par son id, dans n'importe quel fil (fil / IRL / CDV). Permet de réagir aussi
// bien à un commentaire qu'à une réponse avec le même code. Renvoie
// { thread, node, parent? } ou null.
function _findCommentNode(threadId, nodeId) {
  var thread = (typeof _findCommentThread === "function") ? _findCommentThread(threadId) : null;
  if (!thread && typeof findPostAnywhere === "function") {
    var p = findPostAnywhere(threadId);
    if (p) thread = { comments: p.comments || [], save: function(){ try { saveState(); } catch(e){} } };
  }
  if (!thread) return null;
  var c = thread.comments.find(function(x){ return x.id === nodeId; });
  if (c) return { thread: thread, node: c, parent: null };
  for (var i = 0; i < thread.comments.length; i++) {
    var rep = (thread.comments[i].replies || []).find(function(x){ return x.id === nodeId; });
    if (rep) return { thread: thread, node: rep, parent: thread.comments[i] };
  }
  return null;
}
function _cmtReactChipHtml(threadId, comment) {
  var reactions = _cmtReactions(comment);
  if (!reactions.length) return "";
  var counts = {};
  reactions.forEach(function(r){ var e = r.text || "❤️"; counts[e] = (counts[e] || 0) + 1; });
  var top = Object.keys(counts).sort(function(a, b){ return counts[b] - counts[a]; })[0] || "❤️";
  var _selfIds = [(typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : null, (state.user && state.user.id), "me"].filter(Boolean);
  var mine = reactions.some(function(r){ return _selfIds.indexOf(r.authorId) > -1; });
  return '<span class="cmt-react-chip' + (mine ? " mine" : "") + '" title="Voir qui a réagi"'
    + ' onclick="return openCommentReactors(\'' + threadId + '\',\'' + comment.id + '\', event);">'
    + top + ' <b>' + reactions.length + '</b></span>';
}
// Popover listant les réactions emoji d'un commentaire : qui a réagi + son emoji.
function openCommentReactors(threadId, commentId, event) {
  if (event && event.stopPropagation) { event.stopPropagation(); event.preventDefault(); }
  var old = document.getElementById("cmt-react-detail");
  if (old) { old.remove(); return false; }
  var found = _findCommentNode(threadId, commentId);
  var c = found && found.node;
  if (!c) return false;
  var reactions = _cmtReactions(c);
  if (!reactions.length) return false;
  var pop = document.createElement("div");
  pop.id = "cmt-react-detail";
  pop.style.cssText = "position:fixed;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:10px 12px;z-index:100003;box-shadow:0 8px 28px rgba(0,0,0,0.28);width:230px;max-height:280px;overflow-y:auto;";
  var rowsHtml = reactions.map(function(r){
    var u = (typeof userById === "function" && userById(r.authorId)) || { name: "Quelqu'un", profileEmoji: "👤", avatar: "#64748b" };
    var _av = { avatar: u.avatar || "#64748b", profileEmoji: u.profileEmoji || "👤", name: u.name, photoUrl: u.photoUrl || null };
    var rSrc = (r.authorId === "me" || (typeof MY_UID !== "undefined" && r.authorId === MY_UID)) ? "me" : "seed";
    return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">'
      + '<div class="avatar sm" style="background:' + avatarBg(_av) + ';flex-shrink:0;cursor:pointer;" onclick="event.stopPropagation();closeModal&&closeModal();openUserProfile(\'' + r.authorId + '\',\'' + rSrc + '\')">' + avatarInner(_av) + '</div>'
      + '<span style="flex:1;font-size:12px;color:var(--text);">' + escapeHtml(u.name) + '</span>'
      + '<span style="font-size:18px;">' + (r.text || "❤️") + '</span></div>';
  }).join("");
  pop.innerHTML = '<div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:8px;">Réactions · ' + reactions.length + '</div>' + rowsHtml;
  var btn = event && (event.currentTarget || event.target);
  if (btn && btn.getBoundingClientRect) {
    var r = btn.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 240)) + "px";
    pop.style.bottom = Math.max(8, window.innerHeight - r.top + 8) + "px";
  } else { pop.style.left = "50%"; pop.style.bottom = "30%"; pop.style.transform = "translateX(-50%)"; }
  document.body.appendChild(pop);
  setTimeout(function(){
    var cl = function(e){ if (!pop.contains(e.target) && e.target !== btn) { pop.remove(); document.removeEventListener("click", cl); } };
    document.addEventListener("click", cl);
  }, 50);
  return false;
}

// Réagir à une RÉPONSE de commentaire : popover emoji léger (façon Facebook), un
// emoji par tap → agrégé dans la pastille « 😍 N » de la réponse (addEmojiToComment
// localise indifféremment un commentaire ou une réponse). Pas de GIF ici (réponses
// = réactions emoji uniquement, pour rester simple et cohérent).
function reactToReply(threadId, replyId, event) {
  // Même panneau segmenté que partout, en emoji uniquement (une réaction GIF sur
  // une réponse ne serait pas rendue → on garde les réponses en emoji).
  if (typeof emojiReactPanel === "function") {
    return emojiReactPanel(event, function(e){
      if (typeof addEmojiToComment === "function") addEmojiToComment(threadId, replyId, e);
    });
  }
  return false;
}

// ════════════════════════════════════════════════════════════════════════
// PASTILLE DE RÉACTIONS GÉNÉRIQUE (post du fil / carnet / live CDV) — EXACTEMENT
// la même que sur les commentaires (.cmt-react-chip : 1 emoji + total, clic → qui
// a réagi). Normalise les réactions de chaque surface en [{authorId?, text}].
// ════════════════════════════════════════════════════════════════════════
// Clé d'agrégation : un GIF (URL) compte comme « 🎬 », sinon l'emoji lui-même.
function _reactKey(t) {
  return (typeof _looksLikeMediaUrl === "function" && _looksLikeMediaUrl(t)) ? "🎬" : (t || "❤️");
}
// items = [{authorId?, text}]. onclickAttr = handler de détail (chaîne onclick).
function _reactionItemsChipHtml(items, onclickAttr) {
  if (!items || !items.length) return "";
  var counts = {};
  items.forEach(function(it){ var k = _reactKey(it.text); counts[k] = (counts[k] || 0) + 1; });
  var top = Object.keys(counts).sort(function(a, b){ return counts[b] - counts[a]; })[0] || "❤️";
  var _selfIds = [(typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : null, (state.user && state.user.id), "me"].filter(Boolean);
  var mine = items.some(function(it){ return _selfIds.indexOf(it.authorId) > -1; });
  return '<span class="cmt-react-chip' + (mine ? " mine" : "") + '" title="Voir qui a réagi" onclick="' + onclickAttr + '">'
    + top + ' <b>' + items.length + '</b></span>';
}
// Popover listant les réacteurs : avatar + pseudo + emoji (ou vignette GIF) si
// l'auteur est connu ; sinon décompte par emoji (cas des lives, sans auteur local).
function _openReactorsList(items, event) {
  if (event && event.stopPropagation) { event.stopPropagation(); event.preventDefault(); }
  var old = document.getElementById("cmt-react-detail");
  if (old) { old.remove(); return false; }
  if (!items || !items.length) return false;
  var pop = document.createElement("div");
  pop.id = "cmt-react-detail";
  pop.style.cssText = "position:fixed;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:10px 12px;z-index:100003;box-shadow:0 8px 28px rgba(0,0,0,0.28);width:230px;max-height:280px;overflow-y:auto;";
  var withAuthors = items.some(function(it){ return it.authorId; });
  var rowsHtml;
  function face(t) {
    return (typeof _looksLikeMediaUrl === "function" && _looksLikeMediaUrl(t))
      ? '<img loading="lazy" src="' + String(t).replace(/"/g, "&quot;") + '" style="width:30px;height:30px;border-radius:6px;object-fit:cover;"/>'
      : '<span style="font-size:18px;">' + (t || "❤️") + '</span>';
  }
  if (withAuthors) {
    rowsHtml = items.map(function(it){
      var u = (typeof userById === "function" && userById(it.authorId)) || { name: "Quelqu'un", profileEmoji: "👤", avatar: "#64748b" };
      var _av = { avatar: u.avatar || "#64748b", profileEmoji: u.profileEmoji || "👤", name: u.name, photoUrl: u.photoUrl || null };
      var rSrc = (it.authorId === "me" || (typeof MY_UID !== "undefined" && it.authorId === MY_UID)) ? "me" : "seed";
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">'
        + '<div class="avatar sm" style="background:' + avatarBg(_av) + ';flex-shrink:0;cursor:pointer;" onclick="event.stopPropagation();closeModal&&closeModal();openUserProfile(\'' + it.authorId + '\',\'' + rSrc + '\')">' + avatarInner(_av) + '</div>'
        + '<span style="flex:1;font-size:12px;color:var(--text);">' + escapeHtml(u.name) + '</span>' + face(it.text) + '</div>';
    }).join("");
  } else {
    var counts = {};
    items.forEach(function(it){ var k = _reactKey(it.text); counts[k] = (counts[k] || 0) + 1; });
    rowsHtml = Object.keys(counts).map(function(k){
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;">' + face(k) + '<b style="font-size:13px;color:var(--text);">' + counts[k] + '</b></div>';
    }).join("");
  }
  pop.innerHTML = '<div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:8px;">Réactions · ' + items.length + '</div>' + rowsHtml;
  var btn = event && (event.currentTarget || event.target);
  if (btn && btn.getBoundingClientRect) {
    var r = btn.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 240)) + "px";
    pop.style.bottom = Math.max(8, window.innerHeight - r.top + 8) + "px";
  } else { pop.style.left = "50%"; pop.style.bottom = "30%"; pop.style.transform = "translateX(-50%)"; }
  document.body.appendChild(pop);
  setTimeout(function(){
    var cl = function(e){ if (!pop.contains(e.target) && e.target !== btn) { pop.remove(); document.removeEventListener("click", cl); } };
    document.addEventListener("click", cl);
  }, 50);
  return false;
}
// ── Post du fil / carnet (réactions = post.reactions, avec authorId) ──
function _postReactItems(postId) {
  var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!post) return [];
  // post.reactions peut être un OBJET (ex. réactions agrégées des bobines/messages)
  // et non un tableau → garder Array.isArray pour éviter un crash de .filter.
  var arr = Array.isArray(post.reactions) ? post.reactions : [];
  return arr
    .filter(function(r){ return r && (r.type === "emoji_reaction" || r.type === "gif_reaction"); })
    .map(function(r){ return { authorId: r.authorId, text: r.text }; });
}
function _postReactChipHtml(postId) {
  return _reactionItemsChipHtml(_postReactItems(postId), "return openPostReactors('" + postId + "', event);");
}
function openPostReactors(postId, event) {
  return _openReactorsList(_postReactItems(postId), event);
}
// ── Live CDV (réactions = live.reactions, simples emojis sans auteur local) ──
function _liveReactItems(liveId) {
  var lives = (typeof getCdvLives === "function") ? getCdvLives() : [];
  var live = lives.find(function(l){ return l.id === liveId; });
  if (!live) return [];
  // ❤️ = like (compté à part) → exclu de la pastille de réactions.
  // reactionsBy [{emoji,userId}] (auteur connu) prioritaire ; sinon strings (sans auteur).
  if (Array.isArray(live.reactionsBy) && live.reactionsBy.length) {
    return live.reactionsBy.filter(function(x){ return x && x.emoji !== "❤️"; })
      .map(function(x){ return { authorId: x.userId, text: x.emoji }; });
  }
  var arr = Array.isArray(live.reactions) ? live.reactions : [];
  return arr.filter(function(e){ return e !== "❤️"; })
    .map(function(e){ return { authorId: null, text: e }; });
}
function _liveReactChipHtml(liveId) {
  return _reactionItemsChipHtml(_liveReactItems(liveId), "return openLiveReactors('" + liveId + "', event);");
}
function openLiveReactors(liveId, event) {
  return _openReactorsList(_liveReactItems(liveId), event);
}

async function openComments(postId) {
  // Ajouter à l'historique pour que le bouton back fonctionne
  pushOverlayToHistory("comments", postId);
  window._openCommentsPostId = postId; // suivi pour le temps réel des interactions

  let post = findPostAnywhere(postId);
  if (!post) return;

  // Afficher immédiatement avec les commentaires locaux
  let localComments = (post.comments || []);
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">Discussion</div>
    <div class="modal-subtitle">Commente pour gagner +3 pts.</div>
    <div id="commentsBox" style="max-height:260px;overflow-y:auto;margin-bottom:12px;">
      ${localComments.length ? _renderCommentsList(localComments, postId) : '<div class="empty"><div class="empty-icon">💭</div><div class="empty-title">Chargement…</div></div>'}
    </div>
    <textarea class="textarea" id="newComment" placeholder="Réponse authentique, pas vide..." maxlength="400" style="min-height:70px;"></textarea>
    <div style="display:flex;align-items:center;gap:6px;margin-top:8px;">
      ${_cmtComposerToolsHtml("newComment", "submitComment", postId)}
      <button class="btn primary" style="flex:1;" onclick="submitComment('${postId}')">Publier · +3 pts</button>
    </div>
  `);

  // Charger les vrais commentaires Supabase
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    try {
      const supaComments = await supaLoadComments(postId);
      if (supaComments && supaComments.length >= 0) {
        // Merge : garder locaux non-Supabase + Supabase
        const supaIds = supaComments.map(c => c.id);
        const localOnly = localComments.filter(c => !supaIds.includes(c.id) && !c.fromSupabase);
        const merged = [...supaComments.map(c => ({ ...c, text: c.content || c.text || "" })), ...localOnly]
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        // Mettre à jour le post local
        post.comments = merged;
        // Hydrate les interactions cross-compte (likes/réponses/emojis) puis re-rend.
        if (typeof hydrateCommentInteractions === "function") {
          try { await hydrateCommentInteractions(post); } catch(e) {}
        }
        const box = document.getElementById("commentsBox");
        if (box) {
          box.innerHTML = post.comments.length
            ? _renderCommentsList(post.comments, postId)
            : '<div class="empty"><div class="empty-icon">💭</div><div class="empty-title">Sois le premier à réagir</div></div>';
        }
        // Mettre à jour le titre
        const title = document.querySelector(".modal-title");
        if (title) title.textContent = `Discussion (${post.comments.length})`;
      }
    } catch(e) {}
  } else {
    // Pas de Supabase : afficher les locaux
    const box = document.getElementById("commentsBox");
    if (box && localComments.length === 0) {
      box.innerHTML = '<div class="empty"><div class="empty-icon">💭</div><div class="empty-title">Sois le premier à réagir</div></div>';
    }
  }
}

function submitComment(postId) {
  const text = $("#newComment").value.trim();
  if (text.length < 2) { toast("Trop court"); return; }
  let post = findPostAnywhere(postId);
  if (!post) return;
  if (!post.comments) post.comments = [];
  const realAuthorId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  const p = currentProfile();
  const _cid = "c_" + uid(); // id aligné local ⇄ Supabase (cf. supaAddComment)
  post.comments.unshift({
    id: _cid, authorId: realAuthorId,
    authorName: p?.name || state.user.name || "Moi",
    authorEmoji: p?.emoji || "✨",
    text, content: text, createdAt: Date.now(),
  });
  // Ensure author is in seed.users for userById()
  const meEntry = { id: realAuthorId, name: p?.name || state.user.name || "Moi", profileEmoji: p?.emoji || "✨", avatar: p?.color || "#8b5cf6" };
  state.seed.users = state.seed.users.filter(u => u.id !== realAuthorId);
  state.seed.users.push(meEntry);
  grantReward("comment");
  // Sync avec Supabase
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    supaAddComment(postId, text, _cid);
    // Notifier l'auteur du post
    const commentedPost = findPostAnywhere(postId);
    if (commentedPost && commentedPost.authorId && commentedPost.authorId !== MY_UID && commentedPost.fromSupabase) {
      supaInsertNotif(commentedPost.authorId, "comment", postId, "a commenté ton post");
    }
  }
  closeModal();
  renderFeed();
}

// Applique en TEMPS RÉEL une interaction de commentaire reçue d'un autre compte
// (canal realtime:comment_interactions, app-08). op = "add" (INSERT) | "remove" (DELETE).
function _applyCommentInteractionEvent(r, op) {
  try {
    if (!r || !r.comment_id) return;
    if (typeof MY_UID !== "undefined" && r.user_id === MY_UID) return; // déjà appliqué localement
    if (typeof isBlocked === "function" && isBlocked(r.user_id)) return;
    // Résolution générique : post, événement IRL ou live CDV (post_id sert d'id de fil).
    var thread = (r.post_id && typeof _findCommentThread === "function") ? _findCommentThread(r.post_id) : null;
    // Cible un commentaire OU une réponse (réactions de réponse sync via le même canal).
    var comment = null;
    if (thread) {
      comment = thread.comments.find(function(c){ return c.id === r.comment_id; });
      if (!comment) {
        for (var _i = 0; _i < thread.comments.length; _i++) {
          var _rep = (thread.comments[_i].replies || []).find(function(x){ return x.id === r.comment_id; });
          if (_rep) { comment = _rep; break; }
        }
      }
    }
    if (!comment) {
      // Réaction portée par le POST lui-même (convention comment_id === post_id) :
      // on l'applique à post.reactions → pastille « 😍 N » mise à jour en direct.
      if (op === "add" && r.comment_id === r.post_id && (r.kind === "emoji" || r.kind === "gif")
          && r.payload && typeof findPostAnywhere === "function") {
        var _post = findPostAnywhere(r.post_id);
        if (_post) {
          if (!Array.isArray(_post.reactions)) _post.reactions = [];
          var _prid = (r.kind === "emoji" ? "semoji_" : "sgif_") + (r.created_at || Date.now()) + "_" + r.user_id;
          if (!_post.reactions.find(function(x){ return x.id === _prid; })) {
            _post.reactions.push({ id: _prid, authorId: r.user_id, text: r.payload,
              type: r.kind === "emoji" ? "emoji_reaction" : "gif_reaction", createdAt: supaTs(r.created_at) });
            try { saveState(); } catch(e) {}
            if (typeof updatePostReactionsUI === "function") updatePostReactionsUI(r.post_id);
          }
        }
      }
      return; // sinon : fil/commentaire pas chargé localement → rien à faire
    }
    comment.likedBy = comment.likedBy || []; comment.replies = comment.replies || []; comment.emojis = comment.emojis || [];
    if (r.kind === "like") {
      if (op === "add") { if (comment.likedBy.indexOf(r.user_id) < 0) { comment.likedBy.push(r.user_id); comment.likes = (comment.likes || 0) + 1; } }
      else { if (comment.likedBy.indexOf(r.user_id) > -1) { comment.likedBy = comment.likedBy.filter(function(x){ return x !== r.user_id; }); comment.likes = Math.max(0, (comment.likes || 1) - 1); } }
    } else if (r.kind === "reply" && op === "add") {
      var rid = "srep_" + r.created_at;
      if (!comment.replies.find(function(x){ return x.id === rid; })) comment.replies.push({ id: rid, authorId: r.user_id, text: r.payload || "", createdAt: supaTs(r.created_at) });
    } else if (r.kind === "emoji" && op === "add" && r.payload) {
      var eid = "semoji_" + (r.created_at || Date.now()) + "_" + r.user_id;
      if (!comment.replies.find(function(x){ return x.id === eid; }))
        comment.replies.push({ id: eid, authorId: r.user_id, text: r.payload, type: "emoji_reaction", createdAt: supaTs(r.created_at) });
    } else if (r.kind === "gif" && op === "add" && r.payload) {
      var gid = "sgif_" + (r.created_at || Date.now()) + "_" + r.user_id;
      if (!comment.replies.find(function(x){ return x.id === gid; }))
        comment.replies.push({ id: gid, authorId: r.user_id, text: r.payload, type: "gif_reaction", createdAt: supaTs(r.created_at) });
    }
    if (typeof thread.save === "function") thread.save(); else saveState();
    if (typeof _refreshCommentThreadUI === "function") _refreshCommentThreadUI(r.post_id);
    // Profil de l'auteur inconnu localement → le résoudre puis re-render, sinon
    // la réponse/réaction realtime s'affiche avec « ? » comme pseudo.
    if (op === "add" && r.user_id && typeof userById === "function" && !userById(r.user_id)
        && typeof _resolveProfilesByIds === "function") {
      _resolveProfilesByIds([r.user_id]).then(function(){
        if (typeof _refreshCommentThreadUI === "function") _refreshCommentThreadUI(r.post_id);
      }).catch(function(){});
    }
  } catch(e) {}
}

// ════════════════════════════════════════════════════════════════════════
// SYSTÈME DE COMMENTAIRES UNIFIÉ (fil / IRL / CDV)
// Un seul renderer (_renderCommentsList) + un seul jeu de handlers (like/répondre/
// emoji/GIF dans emoji-misc.js) pour les 3 contextes. _findCommentThread(id)
// localise le tableau de commentaires quel que soit le contexte ; les handlers
// ne dépendent plus de findPostAnywhere. Cross-compte via comment_interactions
// (post_id = id du fil, nullable côté table → OK pour event/cdv).
// ════════════════════════════════════════════════════════════════════════

// Retourne { kind, id, comments (référence mutable), save(), targetUserId } ou null.
function _findCommentThread(threadId) {
  if (!threadId) return null;
  // 1) Post du fil
  if (typeof findPostAnywhere === "function") {
    var post = findPostAnywhere(threadId);
    if (post) {
      if (!post.comments) post.comments = [];
      return { kind: "post", id: threadId, comments: post.comments,
        save: function(){ try { saveState(); } catch(e){} },
        targetUserId: post.authorId, fromSupabase: post.fromSupabase };
    }
  }
  // 2) Événement IRL
  if (typeof allEvents === "function") {
    try {
      var ev = allEvents().find(function(e){ return e.id === threadId; });
      if (ev) {
        window._eventCommentsCache = window._eventCommentsCache || {};
        if (!window._eventCommentsCache[threadId]) window._eventCommentsCache[threadId] = [];
        return { kind: "event", id: threadId, comments: window._eventCommentsCache[threadId],
          save: function(){}, targetUserId: ev.organizerId };
      }
    } catch(e) {}
  }
  // 3) Live CDV
  if (typeof getCdvLives === "function") {
    try {
      var lives = getCdvLives();
      var live = lives.find(function(l){ return l.id === threadId; });
      if (live) {
        if (!live.comments) live.comments = [];
        return { kind: "cdv", id: threadId, comments: live.comments,
          save: function(){ try { saveCdvLives(lives); } catch(e){} }, targetUserId: live.authorId };
      }
    } catch(e) {}
  }
  return null;
}

// Re-render le fil de commentaires partout où il est affiché (modale post,
// page détail IRL, viewer CDV, feuille générique).
// Coalesce les rafraîchissements (rafales realtime : plusieurs likes/réponses
// reçus en même temps recompilaient toute la liste à chaque event = lag). Un
// seul rebuild par frame (~16ms, imperceptible).
var _cmtRefreshQueued = {};
function _refreshCommentThreadUI(threadId) {
  if (!threadId) return;
  if (_cmtRefreshQueued[threadId]) return;
  _cmtRefreshQueued[threadId] = true;
  requestAnimationFrame(function(){
    _cmtRefreshQueued[threadId] = false;
    try { _refreshCommentThreadUINow(threadId); } catch(e) {}
  });
}
function _refreshCommentThreadUINow(threadId) {
  var thread = _findCommentThread(threadId);
  if (!thread) return;
  // Modale commentaires du fil
  try {
    if (window._openCommentsPostId === threadId) {
      var box = document.getElementById("commentsBox");
      if (box) box.innerHTML = _renderCommentsList(thread.comments, threadId);
    }
  } catch(e) {}
  // IRL : son renderer gère DÉJÀ la page détail ET la feuille inline (#cmtThreadList).
  if (thread.kind === "event") {
    try { if (typeof _renderEventComments === "function") _renderEventComments(threadId); } catch(e) {}
    return;
  }
  // CDV : viewer plein écran (#cdvCommentsBox).
  try {
    if (thread.kind === "cdv") {
      var cdvBox = document.getElementById("cdvCommentsBox");
      if (cdvBox && typeof _cdvCommentsBoxHtml === "function") {
        var l = getCdvLives().find(function(x){ return x.id === threadId; });
        if (l) cdvBox.innerHTML = _cdvCommentsBoxHtml(l);
      }
    }
  } catch(e) {}
  // Carnet CDV ouvert dans le viewer plein écran (#vlogCommentsList).
  try {
    var vv = document.getElementById("vlogViewer");
    var vlist = document.getElementById("vlogCommentsList");
    if (vlist && vv && vv.getAttribute("data-current-post") === threadId) {
      vlist.innerHTML = thread.comments.length
        ? _renderCommentsList(thread.comments, threadId)
        : '<div style="font-size:12px;color:var(--muted);">Aucun commentaire — sois le premier 💬</div>';
    }
  } catch(e) {}
  // Feuille générique inline (carte CDV/fil sans ouvrir le détail).
  try {
    var sheet = document.getElementById("cmtThreadList");
    if (sheet && sheet.getAttribute("data-thread") === threadId) {
      sheet.innerHTML = thread.comments.length
        ? _renderCommentsList(thread.comments, threadId)
        : '<div class="empty"><div class="empty-icon">💭</div><div class="empty-title">Sois le premier à réagir</div></div>';
    }
  } catch(e) {}
}

// ───────── Menu ⋯ d'options d'un commentaire (Instagram-like) ─────────
function openCommentOptions(threadId, commentId, mine, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  var thread = _findCommentThread(threadId);
  var c = thread && thread.comments.find(function(x){ return x.id === commentId; });
  if (!c) return false;
  var isMine = (mine === 1 || mine === "1" || mine === true)
    || (typeof MY_UID !== "undefined" && c.authorId === MY_UID) || c.authorId === "me";
  window._cmtSheetCtx = { threadId: threadId, commentId: commentId,
    name: c.authorName || c.author || "ce compte", authorId: c.authorId,
    text: c.text || c.content || "" };
  var rows = ""
    + _cmtRow("💬", "Répondre", "reply")
    + _cmtRow("😊", "Réagir avec un emoji", "react")
    + _cmtRow("🎬", "Réagir avec un GIF", "gif")
    + _cmtRow("📋", "Copier le texte", "copy");
  if (isMine) {
    rows += _cmtRow("🗑", "Supprimer", "delete", true);
  } else {
    rows += _cmtRow("🔕", "Masquer ce commentaire", "hide");
    rows += _cmtRow("🚫", "Bloquer ce compte", "block", true);
    rows += _cmtRow("⚠️", "Signaler", "report", true);
  }
  var ov = document.createElement("div");
  ov.id = "cmtSheet";
  ov.className = "cmt-sheet-ov";
  ov.onclick = function(e){ if (e.target === ov) _closeCmtSheet(); };
  ov.innerHTML = '<div class="cmt-sheet"><div class="cmt-sheet-handle"></div>' + rows
    + '<button class="cmt-sheet-row cancel" onclick="_closeCmtSheet()">Annuler</button></div>';
  document.body.appendChild(ov);
  return false;
}
function _cmtRow(icon, label, action, danger) {
  return '<button class="cmt-sheet-row' + (danger ? " danger" : "") + '" onclick="_cmtAct(\'' + action + '\')">'
    + '<span class="cmt-sheet-ic">' + icon + '</span>' + escapeHtml(label) + '</button>';
}
function _closeCmtSheet() { var o = document.getElementById("cmtSheet"); if (o) o.remove(); }
function _cmtAct(kind) {
  var ctx = window._cmtSheetCtx; if (!ctx) return;
  _closeCmtSheet();
  if (kind === "reply") { try { replyToComment(ctx.threadId, ctx.commentId, ctx.name, null); } catch(e){} }
  else if (kind === "react") { try { showEmojiPickerForComment(ctx.threadId, ctx.commentId, null); } catch(e){} }
  else if (kind === "gif") { try { showGifPickerForComment(ctx.threadId, ctx.commentId, null); } catch(e){} }
  else if (kind === "copy") {
    try { navigator.clipboard.writeText(ctx.text); toast("📋 Texte copié"); }
    catch(e) { toast("Copie impossible"); }
  }
  else if (kind === "delete") { deleteCommentEntry(ctx.threadId, ctx.commentId); }
  else if (kind === "hide") { deleteCommentEntry(ctx.threadId, ctx.commentId, true); toast("🔕 Commentaire masqué"); }
  else if (kind === "block") { if (typeof blockUser === "function") blockUser(ctx.authorId); }
  else if (kind === "report") { reportCommentEntry(ctx.threadId, ctx.commentId); }
}

// Supprime un commentaire (local + best-effort Supabase selon le préfixe d'id).
// `localOnly` = simple masquage local (action « Masquer » sur le commentaire d'autrui).
function deleteCommentEntry(threadId, commentId, localOnly) {
  var thread = _findCommentThread(threadId);
  if (!thread) return;
  var idx = thread.comments.findIndex(function(c){ return c.id === commentId; });
  if (idx > -1) thread.comments.splice(idx, 1);
  if (typeof thread.save === "function") thread.save();
  // Reflète sur le post local (compteur de la carte fil) le cas échéant.
  if (thread.kind === "post" && typeof renderFeed === "function") { try { renderFeed(); } catch(e){} }
  _refreshCommentThreadUI(threadId);
  if (!localOnly) {
    _supaDeleteCommentRow(commentId);
    if (thread.kind === "post") toast("🗑 Commentaire supprimé");
    else toast("🗑 Commentaire supprimé");
  }
}
async function _supaDeleteCommentRow(commentId) {
  try {
    if (typeof supa === "undefined" || !supa || !window._supaReal) return;
    var table = null;
    if (/^ec_/.test(commentId)) table = "event_comments";
    else if (/^lc_/.test(commentId)) table = "cdv_live_comments";
    else table = "post_comments"; // c_… et autres
    await supa.from(table).delete().eq("id", commentId);
    // Nettoie aussi les interactions liées (best-effort, RLS owner).
    try { await supa.from("comment_interactions").delete().eq("comment_id", commentId); } catch(e) {}
  } catch(e) {}
}

// Signale un commentaire (modération) → table reports via supaReport.
function reportCommentEntry(threadId, commentId) {
  if (typeof supaReport === "function") supaReport("comment", commentId, "");
  toast("⚠️ Commentaire signalé. Merci, on s'en occupe.");
}

// ───────── Feuille de commentaires inline (IRL / CDV sans ouvrir le détail) ─────────
// Ouvre une modale légère avec le fil de commentaires riche + un champ de saisie,
// pour commenter/voir les commentaires d'un événement ou d'un live directement
// depuis la carte de liste.
function openCommentSheet(threadId, title) {
  var thread = _findCommentThread(threadId);
  if (!thread) { toast("Commentaires indisponibles"); return; }
  if (typeof pushOverlayToHistory === "function") { try { pushOverlayToHistory("comments", threadId); } catch(e) {} }
  window._openCommentsPostId = null; // ce n'est pas la modale post
  var empty = '<div class="empty"><div class="empty-icon">💭</div><div class="empty-title">Sois le premier à réagir</div></div>';
  var initial = thread.comments.length ? _renderCommentsList(thread.comments, threadId) : empty;
  openModal(
    '<div class="modal-handle"></div>'
    + '<div class="modal-title">' + (title || "💬 Commentaires") + '</div>'
    + '<div class="modal-subtitle">Commente pour gagner +3 pts.</div>'
    + '<div id="cmtThreadList" data-thread="' + threadId + '" style="max-height:52vh;overflow-y:auto;margin-bottom:12px;">' + initial + '</div>'
    + '<div style="display:flex;gap:6px;align-items:center;">'
    + '<input type="text" class="input" id="cmtThreadInput" placeholder="Écris un commentaire…" maxlength="500" style="flex:1;" onkeypress="if(event.key===\'Enter\')submitCommentSheet(\'' + threadId + '\')"/>'
    + _cmtComposerToolsHtml("cmtThreadInput", "submitCommentSheet", threadId)
    + '<button class="btn primary" onclick="submitCommentSheet(\'' + threadId + '\')">Envoyer</button>'
    + '</div>'
  );
  // Hydrate / charge les commentaires distants selon le contexte.
  if (thread.kind === "event" && typeof _loadEventComments === "function") {
    _loadEventComments(threadId); // écrit dans #cmtThreadList (cf. _renderEventComments)
  } else if (thread.comments.length && typeof hydrateCommentInteractions === "function") {
    hydrateCommentInteractions({ comments: thread.comments }).then(function(){
      var b = document.getElementById("cmtThreadList");
      if (b && b.getAttribute("data-thread") === threadId) b.innerHTML = _renderCommentsList(thread.comments, threadId);
    });
  }
}

function submitCommentSheet(threadId) {
  var inp = document.getElementById("cmtThreadInput");
  if (!inp || !inp.value.trim()) return;
  var thread = _findCommentThread(threadId);
  if (!thread) return;
  if (thread.kind === "event" && typeof addEventComment === "function") {
    addEventComment(threadId); // lit #cmtThreadInput en repli, re-render #cmtThreadList
  } else if (thread.kind === "cdv" && typeof addCdvLiveComment === "function") {
    addCdvLiveComment(threadId); // lit #cmtThreadInput en repli, re-render via _refreshCommentThreadUI
  } else if (typeof submitComment === "function") {
    // Fil : réutilise le chemin post (champ texte différent → on délègue manuellement)
    var t = inp.value.trim(); inp.value = "";
    var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(threadId) : null;
    if (post) {
      if (!post.comments) post.comments = [];
      var _cid = "c_" + uid();
      var p = (typeof currentProfile === "function") ? currentProfile() : null;
      var realAuthorId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
      post.comments.unshift({ id: _cid, authorId: realAuthorId, authorName: (p && p.name) || state.user.name || "Moi", authorEmoji: (p && p.emoji) || "✨", text: t, content: t, createdAt: Date.now() });
      if (typeof grantReward === "function") grantReward("comment");
      if (typeof supaAddComment === "function" && typeof MY_UID !== "undefined" && MY_UID) supaAddComment(threadId, t, _cid);
      _refreshCommentThreadUI(threadId);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════
// BARRE DE COMPOSITION UNIFIÉE (emoji + GIF) — commune au fil, à l'IRL et au CDV.
// Tous les composeurs de commentaires (champ texte + bouton Envoyer) reçoivent
// les mêmes outils 😊/🎬 : insertion d'emoji au curseur + envoi d'un GIF en
// commentaire. Un commentaire « GIF » = un commentaire dont le texte est l'URL
// du GIF (rendu en image par _commentBodyHtml) → aucun changement de schéma, OK
// pour les 3 back-ends (post_comments / event_comments / cdv_live_comments).
// `submitFn`/`submitArg` = la fonction d'envoi propre à chaque contexte.
// ════════════════════════════════════════════════════════════════════════
function _cmtComposerToolsHtml(inputId, submitFn, submitArg) {
  var arg = submitArg != null ? "'" + String(submitArg).replace(/'/g, "\\'") + "'" : "null";
  // UN SEUL bouton 😊 (toolbar allégée) : le panneau emoji contient un onglet GIF.
  return '<button type="button" class="cmt-tool-btn" title="Emoji & GIF" aria-label="Ajouter un emoji ou un GIF" onclick="cmtComposerEmoji(\'' + inputId + '\',event,\'' + submitFn + '\',' + arg + ')">😊</button>';
}

function _cmtInsertAtCursor(inp, text) {
  try {
    var s = inp.selectionStart, e = inp.selectionEnd;
    if (typeof s === "number") {
      inp.value = inp.value.slice(0, s) + text + inp.value.slice(e);
      var np = s + text.length;
      inp.selectionStart = inp.selectionEnd = np;
    } else { inp.value += text; }
  } catch (err) { inp.value += text; }
  inp.focus();
  if (typeof autoResizeTextarea === "function") { try { autoResizeTextarea(inp); } catch (e) {} }
}

// Panneau unifié emoji + GIF du composeur de commentaires (fil / IRL / CDV).
// UN SEUL panneau élégant avec deux onglets segmentés côte à côte (😊 Emoji /
// 🎬 GIF) du même style ; on bascule le contenu sans fermer le panneau.
// `startTab` ("emoji" par défaut | "gif") = onglet ouvert d'emblée.
function cmtComposerEmoji(inputId, event, submitFn, submitArg, startTab) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  var old = document.getElementById("cmt-emoji-composer");
  if (old) { old.remove(); return false; } // toggle
  var inp = document.getElementById(inputId);
  if (!inp) return false;
  var btn = event && (event.currentTarget || event.target);
  var emojis = window._PASSIO_EMOJI_LIST
    || ["😀","😂","😍","🥰","😎","😭","😡","👍","🙏","🔥","❤️","🎉","✨","💯","😅","🤔","😴","🥳","😇","🙌","👏","😢","😱","🤗","😋","🤩","😉","😘","🤤","😏"];
  var panel = document.createElement("div");
  panel.id = "cmt-emoji-composer";
  // z-index 100002 : AU-DESSUS du .modal-backdrop (10001, viewer CDV) et de la
  // feuille de réponse .cmt-sheet-ov (10001) d'où ce panel peut être ouvert.
  panel.style.cssText = "position:fixed;background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:10px;z-index:100002;box-shadow:0 6px 24px rgba(0,0,0,0.28);width:288px;box-sizing:border-box;";

  // ── Onglets segmentés (😊 Emoji | 🎬 GIF) ──
  var seg = document.createElement("div");
  seg.style.cssText = "display:flex;gap:4px;background:var(--bg-deep);border-radius:999px;padding:3px;margin-bottom:8px;";
  var tabEmoji = document.createElement("button");
  var tabGif = document.createElement("button");
  function styleTab(b, active) {
    b.style.cssText = "flex:1;border:none;border-radius:999px;font-size:12.5px;font-weight:700;padding:7px 10px;cursor:pointer;transition:all .15s;"
      + (active ? "background:var(--accent);color:#fff;box-shadow:0 1px 4px rgba(124,58,237,0.35);" : "background:transparent;color:var(--muted);");
  }
  tabEmoji.type = "button"; tabEmoji.innerHTML = "😊 Emoji";
  tabGif.type = "button"; tabGif.innerHTML = "🎬 GIF";
  seg.appendChild(tabEmoji); seg.appendChild(tabGif);
  panel.appendChild(seg);

  // ── Conteneur de contenu (emoji OU gif) ──
  var content = document.createElement("div");
  panel.appendChild(content);

  function _insertEmoji(e) { _cmtInsertAtCursor(inp, e); }
  function _pickGif(url) {
    inp.value = url; // le texte EST l'URL → rendu en image (cf. _commentBodyHtml)
    if (submitFn && typeof window[submitFn] === "function") { try { window[submitFn](submitArg); } catch (e) {} }
    panel.remove();
  }

  function showEmoji() {
    styleTab(tabEmoji, true); styleTab(tabGif, false);
    content.innerHTML = "";
    var grid = document.createElement("div");
    grid.style.cssText = "display:flex;flex-wrap:wrap;gap:2px;max-height:200px;overflow-y:auto;";
    emojis.forEach(function (e) {
      var b = document.createElement("span");
      b.textContent = e;
      // Emojis plus petits + cellule plus compacte
      b.style.cssText = "cursor:pointer;font-size:18px;line-height:1;padding:5px;border-radius:8px;transition:background .15s,transform .1s;";
      b.onmouseover = function () { this.style.background = "rgba(124,58,237,0.18)"; this.style.transform = "scale(1.18)"; };
      b.onmouseout = function () { this.style.background = "transparent"; this.style.transform = "scale(1)"; };
      b.onclick = function (ev) { ev.stopPropagation(); _insertEmoji(e); };
      grid.appendChild(b);
    });
    content.appendChild(grid);
  }

  function showGif() {
    styleTab(tabGif, true); styleTab(tabEmoji, false);
    content.innerHTML = "";
    if (typeof passioFetchGifs !== "function") {
      var na = document.createElement("div");
      na.style.cssText = "padding:18px;text-align:center;color:var(--muted);font-size:13px;";
      na.textContent = "GIF indisponible";
      content.appendChild(na);
      return;
    }
    var search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Rechercher un GIF…";
    search.setAttribute("aria-label", "Rechercher un GIF");
    search.style.cssText = "width:100%;box-sizing:border-box;margin-bottom:8px;padding:8px 12px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg-deep);color:var(--text);font-size:16px;outline:none;";
    search.onclick = function (e) { e.stopPropagation(); };
    var grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-height:240px;overflow-y:auto;";
    content.appendChild(search);
    content.appendChild(grid);
    function fill(urls) {
      grid.innerHTML = "";
      if (!urls || !urls.length) {
        var empty = document.createElement("div");
        empty.style.cssText = "grid-column:1/-1;padding:18px;text-align:center;color:var(--muted);font-size:13px;";
        empty.textContent = "Aucun GIF trouvé";
        grid.appendChild(empty);
        return;
      }
      urls.forEach(function (gifUrl) {
        var cellEl = document.createElement("div");
        cellEl.style.cssText = "aspect-ratio:1/1;background:var(--bg-soft);border-radius:8px;overflow:hidden;cursor:pointer;border:1px solid var(--border);transition:border-color .15s;";
        var img = document.createElement("img");
        img.loading = "lazy"; img.decoding = "async"; img.src = gifUrl; img.alt = "GIF";
        img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
        cellEl.appendChild(img);
        cellEl.onmouseover = function () { this.style.borderColor = "var(--accent)"; };
        cellEl.onmouseout = function () { this.style.borderColor = "var(--border)"; };
        cellEl.onclick = function (evt) { evt.stopPropagation(); evt.preventDefault(); _pickGif(gifUrl); };
        grid.appendChild(cellEl);
      });
    }
    passioFetchGifs("").then(fill);
    var _deb = null;
    search.oninput = function () {
      clearTimeout(_deb);
      var q = search.value;
      _deb = setTimeout(function () { passioFetchGifs(q).then(fill); }, 350);
    };
  }

  tabEmoji.onclick = function (ev) { ev.stopPropagation(); showEmoji(); };
  tabGif.onclick = function (ev) { ev.stopPropagation(); showGif(); };
  if (startTab === "gif") showGif(); else showEmoji();

  // Positionnement au-dessus du bouton déclencheur
  if (btn && btn.getBoundingClientRect) {
    var r = btn.getBoundingClientRect();
    panel.style.left = Math.max(8, Math.min(r.left - 120, window.innerWidth - 296)) + "px";
    panel.style.bottom = Math.max(8, window.innerHeight - r.top + 8) + "px";
  } else {
    panel.style.left = "50%"; panel.style.bottom = "30%"; panel.style.transform = "translateX(-50%)";
  }
  document.body.appendChild(panel);
  setTimeout(function () {
    var cl = function (ev) {
      if (!panel.contains(ev.target) && ev.target !== btn) { panel.remove(); document.removeEventListener("click", cl); }
    };
    document.addEventListener("click", cl);
  }, 50);
  return false;
}

// Compat : ouvre le panneau unifié directement sur l'onglet GIF.
function cmtComposerGif(inputId, event, submitFn, submitArg) {
  return cmtComposerEmoji(inputId, event, submitFn, submitArg, "gif");
}

// Petit popover de réaction emoji (rangée d'emojis, façon Facebook) — réutilisé
// par les cartes événement IRL et live CDV pour le bouton 😊 « Réagir ».
// onPick(emoji) reçoit l'emoji choisi.
function _emojiReactPopover(event, onPick) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  var old = document.getElementById("react-popover");
  if (old) { old.remove(); return false; } // toggle
  var btn = event && (event.currentTarget || event.target);
  var emojis = ["❤️","🔥","😍","👏","😂","😮","😢","🎉","💯","🙌"];
  var pop = document.createElement("div");
  pop.id = "react-popover";
  pop.style.cssText = "position:fixed;background:var(--bg-card);border:1px solid var(--border);border-radius:999px;padding:6px 8px;z-index:100002;box-shadow:0 6px 24px rgba(0,0,0,0.28);display:flex;gap:2px;max-width:92vw;overflow-x:auto;";
  emojis.forEach(function (e) {
    var s = document.createElement("span");
    s.textContent = e;
    s.style.cssText = "cursor:pointer;font-size:22px;line-height:1;padding:5px;border-radius:50%;transition:transform .1s,background .15s;";
    s.onmouseover = function () { this.style.transform = "scale(1.3)"; this.style.background = "rgba(124,58,237,0.15)"; };
    s.onmouseout = function () { this.style.transform = "scale(1)"; this.style.background = "transparent"; };
    s.onclick = function (ev) { ev.stopPropagation(); pop.remove(); try { onPick(e); } catch (er) {} };
    pop.appendChild(s);
  });
  if (btn && btn.getBoundingClientRect) {
    var r = btn.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left - 90, window.innerWidth - 300)) + "px";
    pop.style.bottom = Math.max(8, window.innerHeight - r.top + 8) + "px";
  } else {
    pop.style.left = "50%"; pop.style.bottom = "30%"; pop.style.transform = "translateX(-50%)";
  }
  document.body.appendChild(pop);
  setTimeout(function () {
    var cl = function (ev) {
      if (!pop.contains(ev.target) && ev.target !== btn) { pop.remove(); document.removeEventListener("click", cl); }
    };
    document.addEventListener("click", cl);
  }, 50);
  return false;
}

// ════════════════════════════════════════════════════════════════════════
// PANNEAU DE RÉACTION UNIFIÉ (😊 Emoji | 🎬 GIF) — MÊME présentation PARTOUT.
// Exactement le look du composeur de commentaires (onglets segmentés), mais en
// mode « réaction » : tap sur un emoji = réaction appliquée + fermeture ; pick
// d'un GIF = GIF appliqué + fermeture. Utilisé pour réagir à un post, un
// commentaire, une réponse, un événement IRL et un live CDV.
//   onEmoji(emoji)  → applique la réaction emoji (obligatoire)
//   onGif(url)      → applique la réaction GIF (optionnel : sans lui, pas d'onglet GIF)
// ════════════════════════════════════════════════════════════════════════
function emojiReactPanel(event, onEmoji, onGif) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  var old = document.getElementById("emoji-react-panel");
  if (old) { old.remove(); return false; } // toggle
  var btn = event && (event.currentTarget || event.target);
  var emojis = window._PASSIO_EMOJI_LIST
    || ["😀","😂","😍","🥰","😎","😭","😡","👍","🙏","🔥","❤️","🎉","✨","💯","😅","🤔","😴","🥳","😇","🙌","👏","😢","😱","🤗","😋","🤩","😉","😘","🤤","😏"];
  var hasGif = (typeof onGif === "function") && (typeof passioFetchGifs === "function");

  var panel = document.createElement("div");
  panel.id = "emoji-react-panel";
  panel.style.cssText = "position:fixed;background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:10px;z-index:100002;box-shadow:0 6px 24px rgba(0,0,0,0.28);width:288px;box-sizing:border-box;";

  var cl = null;
  function close() { panel.remove(); try { document.removeEventListener("click", cl); } catch (e) {} }
  function pickEmoji(e) { try { if (onEmoji) onEmoji(e); } catch (err) {} close(); }
  function pickGif(url) { try { if (onGif) onGif(url); } catch (err) {} close(); }

  var content = document.createElement("div");

  function showEmoji() {
    content.innerHTML = "";
    var grid = document.createElement("div");
    grid.style.cssText = "display:flex;flex-wrap:wrap;gap:2px;max-height:200px;overflow-y:auto;";
    emojis.forEach(function (e) {
      var b = document.createElement("span");
      b.textContent = e;
      b.style.cssText = "cursor:pointer;font-size:18px;line-height:1;padding:5px;border-radius:8px;transition:background .15s,transform .1s;";
      b.onmouseover = function () { this.style.background = "rgba(124,58,237,0.18)"; this.style.transform = "scale(1.18)"; };
      b.onmouseout = function () { this.style.background = "transparent"; this.style.transform = "scale(1)"; };
      b.onclick = function (ev) { ev.stopPropagation(); pickEmoji(e); };
      grid.appendChild(b);
    });
    content.appendChild(grid);
  }
  function showGif() {
    content.innerHTML = "";
    var search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Rechercher un GIF…";
    search.setAttribute("aria-label", "Rechercher un GIF");
    search.style.cssText = "width:100%;box-sizing:border-box;margin-bottom:8px;padding:8px 12px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg-deep);color:var(--text);font-size:16px;outline:none;";
    search.onclick = function (e) { e.stopPropagation(); };
    var grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-height:240px;overflow-y:auto;";
    content.appendChild(search);
    content.appendChild(grid);
    function fill(urls) {
      grid.innerHTML = "";
      if (!urls || !urls.length) {
        var empty = document.createElement("div");
        empty.style.cssText = "grid-column:1/-1;padding:18px;text-align:center;color:var(--muted);font-size:13px;";
        empty.textContent = "Aucun GIF trouvé";
        grid.appendChild(empty);
        return;
      }
      urls.forEach(function (gifUrl) {
        var cellEl = document.createElement("div");
        cellEl.style.cssText = "aspect-ratio:1/1;background:var(--bg-soft);border-radius:8px;overflow:hidden;cursor:pointer;border:1px solid var(--border);transition:border-color .15s;";
        var img = document.createElement("img");
        img.loading = "lazy"; img.decoding = "async"; img.src = gifUrl; img.alt = "GIF";
        img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
        cellEl.appendChild(img);
        cellEl.onmouseover = function () { this.style.borderColor = "var(--accent)"; };
        cellEl.onmouseout = function () { this.style.borderColor = "var(--border)"; };
        cellEl.onclick = function (evt) { evt.stopPropagation(); evt.preventDefault(); pickGif(gifUrl); };
        grid.appendChild(cellEl);
      });
    }
    passioFetchGifs("").then(fill);
    var _deb = null;
    search.oninput = function () { clearTimeout(_deb); var q = search.value; _deb = setTimeout(function () { passioFetchGifs(q).then(fill); }, 350); };
  }

  if (hasGif) {
    var seg = document.createElement("div");
    seg.style.cssText = "display:flex;gap:4px;background:var(--bg-deep);border-radius:999px;padding:3px;margin-bottom:8px;";
    var tabEmoji = document.createElement("button");
    var tabGif = document.createElement("button");
    var styleTab = function (b, active) {
      b.style.cssText = "flex:1;border:none;border-radius:999px;font-size:12.5px;font-weight:700;padding:7px 10px;cursor:pointer;transition:all .15s;"
        + (active ? "background:var(--accent);color:#fff;box-shadow:0 1px 4px rgba(124,58,237,0.35);" : "background:transparent;color:var(--muted);");
    };
    tabEmoji.type = "button"; tabEmoji.innerHTML = "😊 Emoji";
    tabGif.type = "button"; tabGif.innerHTML = "🎬 GIF";
    seg.appendChild(tabEmoji); seg.appendChild(tabGif);
    panel.appendChild(seg);
    panel.appendChild(content);
    tabEmoji.onclick = function (ev) { ev.stopPropagation(); styleTab(tabEmoji, true); styleTab(tabGif, false); showEmoji(); };
    tabGif.onclick = function (ev) { ev.stopPropagation(); styleTab(tabGif, true); styleTab(tabEmoji, false); showGif(); };
    styleTab(tabEmoji, true); styleTab(tabGif, false);
    showEmoji();
  } else {
    panel.appendChild(content);
    showEmoji();
  }

  if (btn && btn.getBoundingClientRect) {
    var r = btn.getBoundingClientRect();
    panel.style.left = Math.max(8, Math.min(r.left - 120, window.innerWidth - 296)) + "px";
    panel.style.bottom = Math.max(8, window.innerHeight - r.top + 8) + "px";
  } else { panel.style.left = "50%"; panel.style.bottom = "30%"; panel.style.transform = "translateX(-50%)"; }
  document.body.appendChild(panel);
  setTimeout(function () {
    cl = function (ev) { if (!panel.contains(ev.target) && ev.target !== btn) { panel.remove(); document.removeEventListener("click", cl); } };
    document.addEventListener("click", cl);
  }, 50);
  return false;
}

// Mood selector
$$(".mood-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    state.currentMood = btn.getAttribute("data-mood") || "all";
    saveState();
    renderFeed();
    var appMain = document.getElementById("appMain");
    if (appMain) setTimeout(function() { appMain.scrollTop = 0; }, 60);
  });
});

// ======== BOUTIQUE PASSIA ========
const PASSIA_PACKS = [
  { id: "pack_1",  emoji: "🌱", name: "Découverte",  base: 50,    bonus: 0,    price: 4.99,  popular: false, mega: false },
  { id: "pack_2",  emoji: "🌸", name: "Standard",    base: 150,   bonus: 30,   price: 9.99,  popular: false, mega: false },
  { id: "pack_3",  emoji: "💎", name: "Confort",     base: 350,   bonus: 80,   price: 19.99, popular: false, mega: false },
  { id: "pack_4",  emoji: "🔥", name: "Soutien",     base: 500,   bonus: 150,  price: 24.99, popular: true,  mega: false },
  { id: "pack_5",  emoji: "🚀", name: "Créateur",    base: 1200,  bonus: 400,  price: 49.99, popular: false, mega: false },
  { id: "pack_6",  emoji: "👑", name: "Mécène",      base: 3000,  bonus: 1500, price: 99.99, popular: false, mega: true  },
];

const PASSIA_PASSES = [
  {
    id: "pass_monthly",
    title: "Pass Passion",
    badge: "Mensuel",
    price: 9.99,
    period: "/ mois",
    monthlyPassia: 200,
    perks: [
      "200 💎 Passia ajoutés chaque mois",
      "Profils illimités (vs 4 par défaut)",
      "Archives complètes de tes contenus",
      "Badge Passion sur tous tes profils",
      "Statistiques avancées par profil",
      "Annulable à tout moment"
    ],
    annual: false
  },
  {
    id: "pass_annual",
    title: "Pass Passion Annuel",
    badge: "Économise 30 💎 Passia",
    price: 89.00,
    period: "/ an",
    monthlyPassia: 200, // 2400 sur l'année
    perks: [
      "2 400 💎 Passia répartis sur l'année",
      "Tous les avantages du Pass mensuel",
      "Accès anticipé aux nouveautés",
      "Badge Mécène (édition limitée)",
      "Soutien direct au développement",
      "30 € d'économie vs mensuel"
    ],
    annual: true
  },
];

function renderShop() {
  const grid = $("#packGrid");
  if (!grid) return;
  grid.innerHTML = PASSIA_PACKS.map(p => {
    const total = p.base + p.bonus;
    const cls = p.popular ? "popular" : (p.mega ? "mega" : "");
    return `<div class="pack-card ${cls}" onclick="openBuyModal('${p.id}')">
      <div class="pack-emoji">${p.emoji}</div>
      <div class="pack-name">${escapeHtml(p.name)}</div>
      <div class="pack-amount">
        <span class="pack-amount-num">${total}</span>
        <span class="pack-amount-emoji">💎</span>
      </div>
      ${p.bonus > 0 ? `<span class="pack-bonus">+${p.bonus} bonus</span>` : '<span style="font-size:11px;color:var(--muted);display:block;margin-bottom:6px;">Sans bonus</span>'}
      <div class="pack-price">
        ${p.price.toFixed(2).replace('.', ',')} €
        <div class="pack-price-per">${(p.price / total * 100).toFixed(2).replace('.', ',')} ¢ / Passia</div>
      </div>
    </div>`;
  }).join("");

  const passList = $("#passList");
  if (passList) {
    passList.innerHTML = PASSIA_PASSES.map(p => `
      <div class="pass-card ${p.annual ? 'annual' : ''}" onclick="openBuyPassModal('${p.id}')">
        <div class="pass-card-head">
          <div class="pass-card-title">${escapeHtml(p.title)}</div>
          <div class="pass-card-badge">${escapeHtml(p.badge)}</div>
        </div>
        <div class="pass-card-price">
          ${p.price.toFixed(2).replace('.', ',')} €
          <span class="pass-card-price-per">${escapeHtml(p.period)}</span>
        </div>
        <ul class="pass-card-perks">
          ${p.perks.map(pk => `<li>${escapeHtml(pk)}</li>`).join("")}
        </ul>
        <button class="pass-card-cta">Activer ce pass</button>
      </div>
    `).join("");
  }
}

function openBuyModal(packId) {
  const p = PASSIA_PACKS.find(x => x.id === packId);
  if (!p) return;
  const total = p.base + p.bonus;
  const html = `
    <div class="modal-handle"></div>
    <span class="modal-close" onclick="closeModal()">×</span>
    <div class="pay-modal-head">
      <div class="pay-modal-emoji">${p.emoji}</div>
      <div class="pay-modal-title">Pack ${escapeHtml(p.name)}</div>
    </div>
    <div class="pay-modal-amount">
      <div class="pay-modal-amount-big">${total} 💎</div>
      <div class="pay-modal-amount-sub">${p.bonus > 0 ? `${p.base} + ${p.bonus} bonus offerts ·` : ""} ${p.price.toFixed(2).replace('.', ',')} €</div>
    </div>
    <div style="font-size:13px;color:var(--text-dim);margin-bottom:10px;text-align:center;">Choisis ton moyen de paiement</div>
    <button class="pay-method" onclick="confirmPurchase('${p.id}', 'apple')">
      <span class="pay-method-icon">🍎</span>
      Apple Pay
      <span class="pay-method-arrow">›</span>
    </button>
    <button class="pay-method" onclick="confirmPurchase('${p.id}', 'google')">
      <span class="pay-method-icon">🅖</span>
      Google Pay
      <span class="pay-method-arrow">›</span>
    </button>
    <button class="pay-method" onclick="confirmPurchase('${p.id}', 'card')">
      <span class="pay-method-icon">💳</span>
      Carte bancaire (Visa, Mastercard)
      <span class="pay-method-arrow">›</span>
    </button>
    <button class="pay-method" onclick="confirmPurchase('${p.id}', 'paypal')">
      <span class="pay-method-icon">🅿️</span>
      PayPal
      <span class="pay-method-arrow">›</span>
    </button>
    <p style="font-size:10.5px;color:var(--muted);text-align:center;margin-top:14px;line-height:1.5;">
      🔒 Paiement traité par Stripe, chiffré bout en bout · Remboursement 14 jours sans justification
    </p>
  `;
  openModal(html);
}

function openBuyPassModal(passId) {
  const p = PASSIA_PASSES.find(x => x.id === passId);
  if (!p) return;
  const html = `
    <div class="modal-handle"></div>
    <span class="modal-close" onclick="closeModal()">×</span>
    <div class="pay-modal-head">
      <div class="pay-modal-emoji">${p.annual ? "👑" : "✨"}</div>
      <div class="pay-modal-title">${escapeHtml(p.title)}</div>
    </div>
    <div class="pay-modal-amount" style="${p.annual ? 'background: linear-gradient(135deg, #b45309, #f59e0b);' : ''}">
      <div class="pay-modal-amount-big">${p.price.toFixed(2).replace('.', ',')} €</div>
      <div class="pay-modal-amount-sub">${escapeHtml(p.period)} · ${p.annual ? "2 400" : "200"} 💎 inclus</div>
    </div>
    <div style="font-size:12.5px;color:var(--text);margin-bottom:14px;line-height:1.5;background:rgba(139,92,246,0.06);padding:10px 12px;border-radius:10px;">
      <b>Sans engagement.</b> ${p.annual ? "Renouvellement annuel automatique, annulable à tout moment depuis ton wallet." : "Renouvellement mensuel automatique, annulable en 1 clic."}
    </div>
    <div style="font-size:13px;color:var(--text-dim);margin-bottom:10px;text-align:center;">Choisis ton moyen de paiement</div>
    <button class="pay-method" onclick="confirmPassPurchase('${p.id}', 'apple')">
      <span class="pay-method-icon">🍎</span>
      Apple Pay
      <span class="pay-method-arrow">›</span>
    </button>
    <button class="pay-method" onclick="confirmPassPurchase('${p.id}', 'card')">
      <span class="pay-method-icon">💳</span>
      Carte bancaire
      <span class="pay-method-arrow">›</span>
    </button>
    <p style="font-size:10.5px;color:var(--muted);text-align:center;margin-top:14px;line-height:1.5;">
      🔒 Paiement sécurisé · Annulable à tout moment · Aucun frais caché
    </p>
  `;
  openModal(html);
}

function confirmPurchase(packId, method) {
  const p = PASSIA_PACKS.find(x => x.id === packId);
  if (!p) return;
  const total = p.base + p.bonus;

  // Crédite le wallet
  state.user.passia += total;
  state.transactions.unshift({
    id: uid(),
    kind: "purchase",
    pts: 0,
    passia: total,
    label: `Achat pack ${p.name} · ${p.price.toFixed(2).replace('.', ',')} €`,
    at: Date.now(),
  });
  saveState();
  closeModal();
  renderTopbar();
  renderWallet();
  // Confettis virtuels via toast festif
  rewardToast(0, total, `🎉 Achat confirmé · ${p.name}`);
  toast(`💎 +${total} Passia crédités sur ton wallet !`, "success");
}

function confirmPassPurchase(passId, method) {
  const p = PASSIA_PASSES.find(x => x.id === passId);
  if (!p) return;
  const credit = p.annual ? 2400 : 200;

  state.user.passia += credit;
  state.user.activePass = {
    id: p.id,
    title: p.title,
    activeSince: Date.now(),
    nextBillingAt: p.annual ? Date.now() + 365 * 86400000 : Date.now() + 30 * 86400000,
  };
  state.transactions.unshift({
    id: uid(),
    kind: "pass_purchase",
    pts: 0,
    passia: credit,
    label: `Pass activé : ${p.title} · ${p.price.toFixed(2).replace('.', ',')} €`,
    at: Date.now(),
  });
  saveState();
  closeModal();
  renderTopbar();
  renderWallet();
  rewardToast(0, credit, `👑 Pass ${p.title} activé !`);
  toast(`✨ Bienvenue dans le Pass Passion · +${credit} Passia`, "success");
}

// Bascule des onglets Wallet
function setWalletTab(tabId) {
  $$(".wallet-tab").forEach(t => t.classList.toggle("active", t.getAttribute("data-wallettab") === tabId));
  $$(".wallet-pane").forEach(p => p.classList.toggle("active", p.getAttribute("data-walletpane") === tabId));
  if (tabId === "shop") renderShop();
  // scroll en haut du wallet
  $("#appMain").scrollTop = 0;
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-wallettab]");
  if (t) setWalletTab(t.getAttribute("data-wallettab"));
});

// ======== MESSAGERIE ========
const SEED_CONVERSATIONS = [
  {
    id: "conv_lea",
    userId: "u_lea",
    passion: "musique",
    unread: 2,
    lastAt: Date.now() - 30 * 60000,
    messages: [
      { from: "them", text: "Salut ! J'ai vu que tu jouais aussi. Tu pratiques quel style ?", at: Date.now() - 90 * 60000 },
      { from: "me", text: "Plutôt indé acoustique. Toi ?", at: Date.now() - 80 * 60000 },
      { from: "them", text: "Pareil ! On se fait une jam ce week-end ?", at: Date.now() - 35 * 60000 },
      { from: "them", text: "J'ai un local sympa au sud de Lyon.", at: Date.now() - 30 * 60000 },
    ],
  },
  {
    id: "conv_theo",
    userId: "u_theo",
    passion: "cuisine",
    unread: 0,
    lastAt: Date.now() - 3 * 3600000,
    messages: [
      { from: "me", text: "Hey, le workshop pâte feuilletée dimanche est encore ouvert ?", at: Date.now() - 5 * 3600000 },
      { from: "them", text: "Ouais ! Reste 2 places. Tu viens ?", at: Date.now() - 4 * 3600000 },
      { from: "me", text: "Trop bien, je m'inscris", at: Date.now() - 3 * 3600000 },
    ],
  },
  {
    id: "conv_nina",
    userId: "u_nina",
    passion: "voyage",
    unread: 1,
    lastAt: Date.now() - 6 * 3600000,
    messages: [
      { from: "them", text: "Si tu veux je te partage ma liste d'auberges du Portugal", at: Date.now() - 8 * 3600000 },
      { from: "them", text: "Y'a aussi des spots photo dispo, dis-moi ce qui t'intéresse 🌅", at: Date.now() - 6 * 3600000 },
    ],
  },
  {
    id: "conv_karim",
    userId: "u_karim",
    passion: "photo",
    unread: 0,
    lastAt: Date.now() - 26 * 3600000,
    messages: [
      { from: "them", text: "Atelier tirage la semaine prochaine, ça te dit ?", at: Date.now() - 30 * 3600000 },
      { from: "me", text: "Carrément. Quel jour ?", at: Date.now() - 28 * 3600000 },
      { from: "them", text: "Mardi 19h, atelier rue Vauban. Apporte un négatif que tu aimes.", at: Date.now() - 26 * 3600000 },
    ],
  },
  {
    id: "conv_sofia",
    userId: "u_sofia",
    passion: "litterature",
    unread: 0,
    lastAt: Date.now() - 2 * 86400000,
    messages: [
      { from: "them", text: "Tu lis quoi en ce moment ?", at: Date.now() - 3 * 86400000 },
      { from: "me", text: "Annie Ernaux, Les Années. Toi ?", at: Date.now() - 2 * 86400000 },
      { from: "them", text: "Justement je viens de finir. Book club mensuel chez moi si tu veux 📚", at: Date.now() - 2 * 86400000 },
    ],
  },
];

let conversationsState = null;
let _saveConvTimer = null;          // debounce localStorage
const _profileCache = new Map();    // cache profils → évite requêtes répétées

// Cache pré-rempli depuis les convs déjà connues
function _primeProfileCache(convs) {
  (convs || []).forEach(function(c) {
    if (c.userId && c.userName) {
      _profileCache.set(c.userId, { username: c.userName, emoji: c.userEmoji || "✨", color: c.userColor || "#8b5cf6" });
    }
  });
}

// Récupère un profil avec cache — zéro requête Supabase si déjà connu
async function _fetchProfile(userId) {
  if (_profileCache.has(userId)) return _profileCache.get(userId);
  try {
    const { data } = await supa.from("profiles").select("username,emoji,color,avatar_url").eq("id", userId).maybeSingle();
    const prof = data ? { username: data.username || "Passionné", emoji: data.emoji || "✨", color: data.color || "#8b5cf6", photoUrl: data.avatar_url || null } : { username: "Passionné", emoji: "✨", color: "#8b5cf6", photoUrl: null };
    _profileCache.set(userId, prof);
    // Propage la photo partout (fil, profils, autres conversations).
    try { if (data && typeof cacheRemoteProfile === "function") cacheRemoteProfile({ id: userId, username: data.username, emoji: data.emoji, color: data.color, avatar_url: data.avatar_url }); } catch(e) {}
    return prof;
  } catch(e) { return { username: "Passionné", emoji: "✨", color: "#8b5cf6", photoUrl: null }; }
}

function deduplicateConversations(convs) {
  // Pour les DMs : une seule conv par userId (garder la plus récente, fusionner les messages)
  var seen = {};
  var result = [];
  // Trier par lastAt desc pour traiter le plus récent en premier
  var sorted = [...convs].sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  for (var c of sorted) {
    if (c.isGroup) { result.push(c); continue; }
    // Repli : d'anciennes conversations (créées avant la résolution fiable du
    // partenaire) ont pu être sauvegardées avec userId vide → elles ne se
    // dédupliquaient pas (clé = id, unique). On infère alors l'userId depuis le
    // premier message reçu (from ≠ "me") pour qu'elles fusionnent par paire.
    if (!c.userId && c.messages && c.messages.length) {
      var fromOther = c.messages.find(function(m){ return m && m.from && m.from !== "me"; });
      if (fromOther) c.userId = fromOther.from;
    }
    var key = c.userId || c.id;
    if (!seen[key]) {
      seen[key] = c;
      result.push(c);
    } else {
      // Fusionner les messages par ID uniquement (plus de comparaison text+timestamp fragile)
      var main = seen[key];
      var mainIds = new Set((main.messages||[]).map(function(x){ return x.id; }).filter(Boolean));
      var extraMsgs = (c.messages || []).filter(function(m){ return m.id && !mainIds.has(m.id); });
      if (extraMsgs.length) {
        main.messages = [...(main.messages||[]), ...extraMsgs].sort(function(a,b){ return (a.at||0)-(b.at||0); });
      }
      // Backfill identité : si l'entrée gardée n'a pas de nom/photo résolus mais que
      // le doublon les a, on les récupère (sinon l'entrée fusionnée resterait
      // « Passionné » sans photo alors qu'on connaît la bonne identité).
      if ((!main.userName || main.userName === "Passionné") && c.userName && c.userName !== "Passionné") main.userName = c.userName;
      if (!main.userPhoto && c.userPhoto) main.userPhoto = c.userPhoto;
      if ((!main.userEmoji || main.userEmoji === "✨") && c.userEmoji && c.userEmoji !== "✨") main.userEmoji = c.userEmoji;
      if (!main.userId && c.userId) main.userId = c.userId;
    }
  }
  return result;
}

function getConversations() {
  if (conversationsState) return conversationsState;
  try {
    const saved = localStorage.getItem("passio_conversations_v1");
    if (saved) {
      conversationsState = deduplicateConversations(JSON.parse(saved));
      return conversationsState;
    }
  } catch (e) {}
  conversationsState = deduplicateConversations(JSON.parse(JSON.stringify(SEED_CONVERSATIONS)));
  return conversationsState;
}

// Fusionne deux listes de conversations par id, en unissant les messages par id
// (aucune perte). Gère les groupes (que deduplicateConversations ne déduplique
// pas par id). Utilisé pour fusionner IndexedDB + état courant à l'hydratation.
function _unionConvsById(a, b) {
  var byId = {};
  [].concat(a || [], b || []).forEach(function(c) {
    if (!c || !c.id) return;
    var ex = byId[c.id];
    if (!ex) { byId[c.id] = Object.assign({}, c, { messages: (c.messages || []).slice() }); return; }
    var ids = {};
    (ex.messages || []).forEach(function(m) { if (m && m.id) ids[m.id] = 1; });
    (c.messages || []).forEach(function(m) { if (m && m.id && !ids[m.id]) { ex.messages.push(m); ids[m.id] = 1; } });
    if ((c.lastAt || 0) > (ex.lastAt || 0)) { ex.lastAt = c.lastAt; }
  });
  return Object.keys(byId).map(function(k) {
    byId[k].messages.sort(function(x, y) { return (x.at || 0) - (y.at || 0); });
    return byId[k];
  });
}

// Hydrate les conversations depuis IndexedDB (store durable) et fusionne avec
// l'état courant (localStorage/seed) SANS PERTE. Appelé une fois au boot.
// Première fois (IDB vide) : migre l'état localStorage existant vers IDB.
var _idbConvHydrated = false;
function hydrateConvsFromIDB() {
  if (_idbConvHydrated || !window.idbConvLoad) return Promise.resolve();
  _idbConvHydrated = true;
  return window.idbConvLoad().then(function(idbConvs) {
    if (!idbConvs || !idbConvs.length) {
      // Migration initiale : pousser l'état actuel dans IDB.
      if (window.idbConvSave) window.idbConvSave(getConversations());
      return;
    }
    var current = conversationsState || [];
    conversationsState = deduplicateConversations(_unionConvsById(idbConvs, current));
    try { if (typeof renderMessages === "function") renderMessages(); } catch(e) {}
  }).catch(function() {});
}

function saveConversations() {
  if (conversationsState) conversationsState = deduplicateConversations(conversationsState);
  // Debounce : évite des dizaines d'écritures localStorage en rafale
  clearTimeout(_saveConvTimer);
  _saveConvTimer = setTimeout(function() {
    try { localStorage.setItem("passio_conversations_v1", JSON.stringify(conversationsState)); } catch(e) {}
    // Store DURABLE (IndexedDB, sans limite ~5 Mo) : si le localStorage ci-dessus
    // échoue sur quota, les données restent sauvegardées ici sans perte.
    if (window.idbConvSave) window.idbConvSave(conversationsState);
  }, 250);
}

// Sauvegarde immédiate pour les cas critiques (fermeture de page, etc.)
function saveConversationsNow() {
  clearTimeout(_saveConvTimer);
  if (conversationsState) conversationsState = deduplicateConversations(conversationsState);
  try { localStorage.setItem("passio_conversations_v1", JSON.stringify(conversationsState)); } catch(e) {}
  if (window.idbConvSave) window.idbConvSave(conversationsState);
}

// Nettoyage forcé des doublons au démarrage
function purgeConvDuplicates() {
  try {
    const saved = localStorage.getItem("passio_conversations_v1");
    if (!saved) return;
    const parsed = JSON.parse(saved);
    const clean = deduplicateConversations(parsed);
    if (clean.length < parsed.length) {
      localStorage.setItem("passio_conversations_v1", JSON.stringify(clean));
      conversationsState = clean;
    }
  } catch(e) {}
}

function fmtMsgTime(ts) {
  const diff = Date.now() - ts;
  const mn = Math.floor(diff / 60000);
  if (mn < 1) return "à l'instant";
  if (mn < 60) return mn + " min";
  const h = Math.floor(mn / 60);
  if (h < 24) return h + " h";
  const d = Math.floor(h / 24);
  if (d < 7) return d + " j";
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// Filtre lu / non lu uniquement (plus de filtre par passion)
let msgReadFilter = "all";

function renderMessageFilters() {
  // Plus de tuiles par passion — juste les pills lu/non lu
  const row = $("#msgFilterRow");
  if (row) row.innerHTML = ""; // vide, on n'affiche plus de filtres passion
  const readRow = $("#msgReadFilterRow");
  if (!readRow) return;
  // Onglets supprimés
  readRow.innerHTML = "";
}

function openNewMessage() {
  var html = `
    <span class="modal-close" onclick="closeModal()">×</span>
    <div style="font-weight:800;font-size:16px;margin-bottom:14px;">✉️ Nouveau message</div>
    <div style="position:relative;">
      <input id="_nmSearch" type="text" class="input" placeholder="🔍 Chercher un utilisateur…" autocomplete="off"
        style="width:100%;box-sizing:border-box;padding-right:40px;"
        oninput="_nmDoSearch(this.value)" />
    </div>
    <div id="_nmResults" style="margin-top:8px;max-height:320px;overflow-y:auto;"></div>
  `;
  openModal(html);
  setTimeout(function() {
    var inp = document.getElementById("_nmSearch");
    if (inp) inp.focus();
    _nmDoSearch(""); // afficher les contacts récents immédiatement
  }, 80);
}

function _nmDoSearch(q) {
  var box = document.getElementById("_nmResults");
  if (!box) return;
  q = (q || "").trim().toLowerCase();

  // Contacts récents (conversations existantes)
  var convs = getConversations();
  var recentUsers = convs.filter(function(c) { return !c.isGroup && c.userId; })
    .map(function(c) { return { id: c.userId, name: c.userName || "Passionné", emoji: c.userEmoji || "✨", color: c.userColor || "#8b5cf6", photoUrl: c.userPhoto || (userById(c.userId) || {}).photoUrl || null, src: "conv" }; });

  // Seed users
  var seedUsers = ((state.seed && state.seed.users) ? state.seed.users : []).map(function(u) {
    return { id: u.id, name: u.name || "Passionné", emoji: u.profileEmoji || "✨", color: u.avatar || "#8b5cf6", photoUrl: u.photoUrl || null, passion: u.passion, src: "seed" };
  });

  var all = recentUsers.concat(seedUsers.filter(function(su) {
    return !recentUsers.find(function(r) { return r.id === su.id; });
  }));

  var matches = q ? all.filter(function(u) { return u.name.toLowerCase().includes(q); }) : all;
  matches = matches.slice(0, 10);

  if (matches.length === 0) {
    box.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">Aucun utilisateur trouvé</div>`;
    // Lancer aussi la recherche Supabase si query non vide
    if (q && typeof supaSearchUsers === "function" && supa && MY_UID) {
      supaSearchUsers(q).then(function(res) {
        if (!res || !res.length) return;
        var html2 = res.slice(0,8).map(function(u) { return _nmUserRow(u.id, u.username||"Passionné", u.emoji||"✨", u.color||"#8b5cf6", u.photoUrl); }).join("");
        if (box) box.innerHTML = html2;
      }).catch(function(){});
    }
    return;
  }

  box.innerHTML = matches.map(function(u) { return _nmUserRow(u.id, u.name, u.emoji, u.color, u.photoUrl); }).join("");

  // Compléter avec Supabase en arrière-plan si query
  if (q && typeof supaSearchUsers === "function" && supa && MY_UID) {
    supaSearchUsers(q).then(function(res) {
      if (!res || !box) return;
      var extra = res.filter(function(u) { return !matches.find(function(m) { return m.id === u.id; }); }).slice(0,5);
      if (extra.length) box.innerHTML += extra.map(function(u) { return _nmUserRow(u.id, u.username||"Passionné", u.emoji||"✨", u.color||"#8b5cf6", u.photoUrl); }).join("");
    }).catch(function(){});
  }
}

function _nmUserRow(id, name, emoji, color, photoUrl) {
  var esc = escapeHtml(name || "Passionné");
  var _u = { avatar: color, profileEmoji: emoji, photoUrl: photoUrl || null };
  // data-* attributes pour éviter les problèmes de quotes dans onclick
  return `<div class="_nm-row" data-uid="${escapeHtml(id)}" data-name="${esc}" data-emoji="${escapeHtml(emoji)}" data-color="${escapeHtml(color)}" data-photo="${escapeHtml(photoUrl || '')}"
    style="display:flex;align-items:center;gap:12px;padding:11px 4px;cursor:pointer;border-bottom:1px solid var(--border);">
    <div style="width:40px;height:40px;border-radius:14px;background:${avatarBg(_u)};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${avatarInner(_u)}</div>
    <div style="font-weight:700;font-size:14px;color:var(--text);flex:1;">${esc}</div>
    <div style="font-size:12px;color:var(--accent);font-weight:700;">Message →</div>
  </div>`;
}

// Délégation sur le modal pour les lignes utilisateur
document.addEventListener("click", function(e) {
  var row = e.target.closest("._nm-row");
  if (row) {
    closeModal();
    startDirectMessage(
      row.getAttribute("data-uid"),
      row.getAttribute("data-name"),
      row.getAttribute("data-emoji"),
      row.getAttribute("data-color"),
      row.getAttribute("data-photo") || null
    );
  }
});

function searchUsers(query) {
  var results = document.getElementById("msgUserResults");
  if (!results) return;
  if (!query || query.trim().length < 1) {
    results.style.display = "none";
    results.innerHTML = "";
    return;
  }

  results.style.display = "block";
  results.innerHTML = "<div style='padding:14px;text-align:center;color:var(--muted);font-size:13px;'>Recherche…</div>";

  var q = query.trim().toLowerCase();

  // Seed local
  var seedUsers = ((state.seed && state.seed.users) ? state.seed.users : []).filter(function(u) {
    return (u.name||"").toLowerCase().includes(q) || (u.passion||"").toLowerCase().includes(q);
  }).slice(0, 5);

  // Supabase (vrais utilisateurs)
  var supaPromise = (supa && typeof supaSearchUsers === 'function')
    ? supaSearchUsers(query.trim())
    : Promise.resolve([]);

  supaPromise.then(function(supaUsers) {
    var supaIds = new Set((supaUsers || []).map(function(u) { return u.id; }));
    var supaFormatted = (supaUsers || []).map(function(u) {
      return {
        id: u.id,
        name: u.username || "Passionné",
        profileEmoji: u.emoji || "✨",
        avatar: u.color || "#8b5cf6",
        photoUrl: u.photoUrl || null,
        passions: u.passions || [],
        bio: u.bio || ""
      };
    });

    // Seed : exclure ceux déjà dans Supabase
    var seedFiltered = seedUsers.filter(function(u) { return !supaIds.has(u.id); });
    var matches = supaFormatted.concat(seedFiltered).slice(0, 8);

    if (matches.length === 0) {
      results.innerHTML = "<div style='padding:14px 16px;color:var(--muted);font-size:13px;text-align:center;'>Aucun utilisateur trouvé</div>";
      return;
    }

    results.innerHTML = matches.map(function(u) {
      var nameEsc = escapeHtml(u.name || "Passionné");
      var emoji = u.profileEmoji || "✨";
      // Badges passions
      var passionBadges = "";
      if (u.passions && u.passions.length > 0) {
        passionBadges = u.passions.map(function(p) {
          var label = p.label || (typeof passionById === "function" && passionById(p.id) ? passionById(p.id).label : "");
          return "<span style='background:rgba(124,58,237,0.10);border:1px solid rgba(124,58,237,0.18);border-radius:20px;padding:1px 6px;font-size:10px;font-weight:600;color:var(--accent);margin-right:2px;'>"
            + (p.emoji || "✨") + (label ? " " + escapeHtml(label) : "") + "</span>";
        }).join("");
      } else if (u.passion) {
        var pw = passionById(u.passion) || { emoji: "✨", label: "" };
        passionBadges = "<span style='background:rgba(124,58,237,0.10);border:1px solid rgba(124,58,237,0.18);border-radius:20px;padding:1px 6px;font-size:10px;font-weight:600;color:var(--accent);'>"
          + pw.emoji + (pw.label ? " " + escapeHtml(pw.label) : "") + "</span>";
      }
      return "<div class='msg-user-result-row' data-uid='" + u.id + "' data-name='" + nameEsc + "' data-emoji='" + emoji + "' data-avatar='" + escapeHtml(u.avatar||"#8b5cf6") + "' data-photo='" + escapeHtml(u.photoUrl || '') + "' onclick='_pickMsgUser(this)' style='display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);'>" +
        "<div style='width:38px;height:38px;border-radius:50%;background:" + avatarBg(u) + ";display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;'>" + avatarInner(u) + "</div>" +
        "<div style='flex:1;min-width:0;'>" +
          "<div style='font-weight:700;font-size:13px;color:var(--text);margin-bottom:3px;'>" + nameEsc + "</div>" +
          "<div>" + passionBadges + "</div>" +
        "</div>" +
        "<div style='font-size:11px;font-weight:700;color:var(--accent);flex-shrink:0;'>Message →</div>" +
      "</div>";
    }).join("") +
    "<div style='padding:8px 14px;font-size:10px;color:var(--muted);text-align:center;'>Tap pour démarrer une conversation</div>";
  });
}

function _pickMsgUser(el) {
  var u_id = el.getAttribute("data-uid");
  var u_name = el.getAttribute("data-name");
  var u_emoji = el.getAttribute("data-emoji");
  var u_avatar = el.getAttribute("data-avatar");
  var u_photo = el.getAttribute("data-photo") || null;
  startDirectMessage(u_id, u_name, u_emoji, u_avatar, u_photo);
}


async function startDirectMessage(userId, userName, userEmoji, userAvatar, userPhoto) {
  // Photo : argument explicite, sinon profil déjà connu en cache
  if (!userPhoto) userPhoto = (userById(userId) || {}).photoUrl || null;
  var results = document.getElementById("msgUserResults");
  if (results) { results.style.display = "none"; results.innerHTML = ""; }
  var search = document.getElementById("msgUserSearch");
  if (search) search.value = "";

  var passion = null; // Les DMs ne sont pas liés à une passion spécifique

  // Si Supabase dispo : approche Supabase-first (ID cohérent entre utilisateurs)
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID && userId !== "me") {
    goTo("messages");
    let supaConvId = null;
    try {
      // Chercher une conv directe existante entre les deux users dans Supabase
      const { data: myMemberships } = await supa.from("conv_members").select("conv_id").eq("user_id", MY_UID);
      const myConvIds = (myMemberships || []).map(m => m.conv_id);
      if (myConvIds.length) {
        const { data: shared } = await supa.from("conv_members")
          .select("conv_id").eq("user_id", userId).in("conv_id", myConvIds);
        if (shared && shared.length) {
          // Vérifier que c'est une conv directe (pas groupe)
          const { data: convData } = await supa.from("conversations")
            .select("id, is_group").in("id", shared.map(s => s.conv_id)).eq("is_group", false).limit(1);
          supaConvId = convData?.[0]?.id || null;
        }
      }
    } catch(e) {}

    // Pas de conv existante → en créer une dans Supabase
    if (!supaConvId) {
      try { supaConvId = await supaCreateConversation(userId, passion); } catch(e) {}
    }

    if (supaConvId) {
      // Créer ou mettre à jour la conv locale avec l'ID Supabase
      var convs = getConversations();
      var existing = convs.find(c => c.id === supaConvId || (!c.isGroup && c.userId === userId));
      if (existing) {
        existing.id = supaConvId;
        existing.userId = userId;
        existing.userName = userName || existing.userName || "Passionné";
        existing.userEmoji = userEmoji || existing.userEmoji || "✨";
        existing.userColor = userAvatar || existing.userColor || "#8b5cf6";
        if (userPhoto) existing.userPhoto = userPhoto;
      } else {
        convs.unshift({ id: supaConvId, userId, userName: userName || "Passionné", userEmoji: userEmoji || "✨", userColor: userAvatar || "#8b5cf6", userPhoto: userPhoto || null, passion, unread: 0, lastAt: Date.now(), messages: [], isGroup: false });
      }
      conversationsState = convs;
      saveConversations();
      setTimeout(function() { renderMessages(); openConversation(supaConvId); }, 120);
      return;
    }
  }

  // Fallback local
  var convs = getConversations();
  var existing = convs.find(function(c) { return !c.isGroup && c.userId === userId; });
  if (existing) {
    goTo("messages");
    setTimeout(function() { openConversation(existing.id); }, 120);
    return;
  }
  var newConv = { id: "conv_" + uid(), userId, userName: userName || "Passionné", userEmoji: userEmoji || "✨", userColor: userAvatar || "#8b5cf6", userPhoto: userPhoto || null, passion, unread: 0, lastAt: Date.now(), messages: [], isGroup: false };
  convs.unshift(newConv);
  conversationsState = convs;
  saveConversations();
  goTo("messages");
  setTimeout(function() { renderMessages(); openConversation(newConv.id); }, 120);
}

async function openUserProfile(authorId, source) {
  // Ajouter à l'historique pour que le bouton back fonctionne
  pushOverlayToHistory("profile", authorId);

  console.log("[openUserProfile] authorId:", authorId, "source:", source);

  if (source === "me" || authorId === "me" || (typeof MY_UID !== "undefined" && MY_UID && authorId === MY_UID)) {
    goTo("profiles");
    return;
  }

  var user = userById(authorId);

  // Si pas trouvé par ID, chercher par username dans seed.users
  if (!user) {
    user = (state.seed.users || []).find(u =>
      u.username === authorId ||
      (u.name && u.name.toLowerCase() === (authorId || "").toLowerCase())
    );
    if (user) {
      console.log("[openUserProfile] Trouvé dans seed.users par username");
    }
  } else {
    console.log("[openUserProfile] Trouvé dans seed.users par ID");
  }

  if (!user) {
    var post = (state.seed.posts || []).find(function(p) { return p.authorId === authorId; });
    if (post) {
      user = { id: authorId, name: post.authorName || "Passionné", profileEmoji: post.authorEmoji || "✨", avatar: post.authorColor || "#8b5cf6", passion: post.passion, bio: post.authorBio || "", photoUrl: post.authorAvatar || null };
      console.log("[openUserProfile] Trouvé via post seed");
    }
  }

  // Chercher dans Supabase si non trouvé localement
  if (!user && typeof supa !== "undefined" && supa) {
    try {
      // D'abord, chercher par ID
      console.log("[openUserProfile] Cherchant dans Supabase avec id:", authorId);
      let { data, error } = await supa.from("profiles").select("id,username,emoji,color,passion_id,passions,bio,avatar_url").eq("id", authorId).limit(1);
      console.log("[openUserProfile] Supabase response (by id):", data, "error:", error);

      // Si pas trouvé par ID, chercher par username (en cas de confusion entre ID et username)
      if ((!data || data.length === 0) && authorId && !authorId.startsWith("u_")) {
        console.log("[openUserProfile] Pas trouvé par id, cherchant par username:", authorId);
        const { data: dataByUsername } = await supa.from("profiles").select("id,username,emoji,color,passion_id,passions,bio,avatar_url").ilike("username", authorId).limit(1);
        if (dataByUsername && dataByUsername.length > 0) {
          data = dataByUsername;
          console.log("[openUserProfile] Trouvé par username:", dataByUsername);
        }
      }

      if (data && data.length > 0) {
        const profile = data[0];
        user = { id: profile.id, name: profile.username || "Passionné", profileEmoji: profile.emoji || "✨", avatar: profile.color || "#8b5cf6", passion: profile.passion_id || "", passions: Array.isArray(profile.passions) ? profile.passions : undefined, bio: profile.bio || "", photoUrl: profile.avatar_url || null };
        try { cacheRemoteProfile(profile); } catch(e) {}
        state.seed.users.push(user);
        console.log("[openUserProfile] Trouvé dans Supabase et ajouté à seed.users");
      }
    } catch(e) {
      console.warn("[openUserProfile] Erreur Supabase:", e);
    }
  }

  if (!user) {
    console.warn("[openUserProfile] Profil non trouvé pour:", authorId);
    toast("Profil non trouvé");
    return;
  }

  // 🔄 Charger TOUTES les passions depuis Supabase (toujours, même si user déjà trouvé en local)
  let userPassions = [];
  const _profileId = user.id || authorId;
  if (typeof supa !== "undefined" && supa && _profileId) {
    try {
      const { data } = await supa.from("profiles")
        .select("passion_id, emoji, passions, bio, avatar_url")
        .eq("id", _profileId)
        .maybeSingle();
      if (data) {
        if (Array.isArray(data.passions) && data.passions.length) {
          userPassions = data.passions;
        } else if (data.passion_id) {
          userPassions = [{ id: data.passion_id, emoji: data.emoji || "✨" }];
        }
        // Enrichir le user avec les données fraîches de Supabase
        if (data.bio && !user.bio) user.bio = data.bio;
        if (data.avatar_url && !user.photoUrl) user.photoUrl = data.avatar_url;
      }
    } catch(e) {}
  }

  // Fallback: passions déjà dans l'objet user (cache local)
  if (!userPassions.length && user.passions && Array.isArray(user.passions)) {
    userPassions = user.passions;
  }

  // Dernier fallback: passion unique
  if (!userPassions.length && user.passion) {
    const passion = passionById(user.passion);
    if (passion) {
      userPassions = [{ id: user.passion, emoji: passion.emoji, label: passion.label }];
    }
  }

  // 🎯 Créer un HTML pour afficher TOUTES les passions
  const passionsHTML = userPassions.length > 0
    ? '<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:8px;">' +
      userPassions.map(p => {
        const pas = passionById(p.id);
        return '<div style="display:flex;align-items:center;gap:4px;padding:4px 10px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;font-size:11px;font-weight:700;">' + (p.emoji || "✨") + ' ' + (pas ? pas.label : "Passion") + '</div>';
      }).join("") +
      '</div>'
    : '';

  var userPosts = allFeedPosts().filter(function(p) { return p.authorId === authorId; });
  var postCount = userPosts.length;
  var likeCount = userPosts.reduce(function(s,p) { return s + (p.likes||0); }, 0);
  var followerCount = 0;

  // Charger le vrai compte d'abonnés depuis Supabase
  if (typeof supa !== "undefined" && supa) {
    try {
      const { count } = await supa.from("follows").select("*", { count: "exact", head: true }).eq("following_id", authorId);
      followerCount = count || 0;
    } catch(e) {}
  }

  var postsHTML = userPosts.length > 0
    ? userPosts.map(renderPostHTML).join("")
    : '<div style="text-align:center;padding:30px;color:var(--muted);font-size:12px;">Aucune publication pour l\'instant</div>';

  var html = '\
    <span class="modal-close" onclick="closeModal()">×</span>\
    \
    <!-- AVATAR + NOM -->\
    <div style="text-align:center;padding-top:20px;margin-bottom:16px;">\
      <div style="width:80px;height:80px;border-radius:50%;background:' + avatarBg(user) + ';display:flex;align-items:center;justify-content:center;font-size:38px;margin:0 auto 12px;border:4px solid #fff;box-shadow:0 6px 20px rgba(139,92,246,0.3);">' + avatarInner(user) + '</div>\
      <div style="font-weight:900;font-size:22px;color:var(--text);">' + escapeHtml(user.name || "Passionné") + '</div>\
      ' + passionsHTML + '\
      ' + (user.bio ? '<div style="font-size:13px;color:var(--text-dim);margin-top:10px;line-height:1.5;max-width:280px;margin-left:auto;margin-right:auto;">' + escapeHtml(user.bio) + '</div>' : '') + '\
    </div>\
    \
    <!-- BOUTONS -->\
    <div style="display:flex;gap:8px;justify-content:center;margin-bottom:16px;">\
      <button class="btn primary" onclick="closeModal();startDirectMessage(\'' + authorId + '\',\'' + escapeJsArg(user.name || "Passionné") + '\',\'' + (user.profileEmoji || "✨") + '\',\'' + (user.avatar || "#8b5cf6") + '\',\'' + (user.photoUrl || "") + '\')" style="font-size:12px;padding:10px 18px;border-radius:14px;">💬 Message</button>\
      <button class="btn ghost" id="followBtn_' + authorId + '" onclick="toggleFollowUser(\'' + authorId + '\',\'' + escapeJsArg(user.name || "") + '\')" style="font-size:12px;padding:10px 18px;border-radius:14px;' + ((state.user.following||[]).includes(authorId) ? 'background:var(--accent);color:#fff;border-color:var(--accent);' : '') + '">' + ((state.user.following||[]).includes(authorId) ? '✓ Suivi' : '➕ Suivre') + '</button>\
    </div>\
    \
    <!-- STATS -->\
    <div style="display:flex;gap:0;border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:16px;">\
      <div style="flex:1;text-align:center;padding:12px 6px;border-right:1px solid var(--border);">\
        <div style="font-size:18px;font-weight:900;color:var(--text);">' + postCount + '</div>\
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">Posts</div>\
      </div>\
      <div style="flex:1;text-align:center;padding:12px 6px;border-right:1px solid var(--border);">\
        <div style="font-size:18px;font-weight:900;color:var(--text);">' + followerCount + '</div>\
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">Abonnés</div>\
      </div>\
      <div style="flex:1;text-align:center;padding:12px 6px;">\
        <div style="font-size:18px;font-weight:900;color:var(--text);">' + likeCount + '</div>\
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">Likes</div>\
      </div>\
    </div>\
    \
    <!-- ACTIONS RAPIDES -->\
    <div style="display:flex;gap:8px;margin-bottom:16px;">\
      <button class="btn ghost" onclick="shareUserProfile(\'' + authorId + '\',\'' + escapeJsArg(user.name || "") + '\')" style="flex:1;font-size:11px;padding:8px;">' + shareIconSvg(14) + ' Partager</button>\
      <button class="btn ghost" onclick="reportUser(\'' + authorId + '\',\'' + escapeJsArg(user.name || "") + '\')" style="flex:1;font-size:11px;padding:8px;color:#f59e0b;border-color:rgba(245,158,11,0.3);">🚩 Signaler</button>\
      ' + (isBlocked(authorId)
        ? '<button class="btn ghost" onclick="unblockUser(\'' + authorId + '\',\'' + escapeJsArg(user.name || "") + '\');closeModal();" style="flex:1;font-size:11px;padding:8px;">✅ Débloquer</button>'
        : '<button class="btn ghost" onclick="blockUser(\'' + authorId + '\',\'' + escapeJsArg(user.name || "") + '\')" style="flex:1;font-size:11px;padding:8px;color:#ef4444;border-color:rgba(239,68,68,0.3);">🚫 Bloquer</button>') + '\
    </div>\
    \
    <!-- PUBLICATIONS -->\
    <div style="font-weight:800;font-size:14px;color:var(--text);margin-bottom:10px;">📝 Publications <span style="font-weight:400;color:var(--muted);">(' + postCount + ')</span></div>\
    <div>' + postsHTML + '</div>\
  ';
  openModal(html);
  // Passer en plein écran
  var modalEl = document.querySelector(".modal");
  if (modalEl) modalEl.classList.add("modal-fullscreen");
}

function toggleFollowUser(userId, userName) {
  var btn = document.getElementById("followBtn_" + userId);
  if (!btn) return;
  state.user.following = state.user.following || [];
  const isFollowing = state.user.following.includes(userId);
  if (!isFollowing) {
    state.user.following.push(userId);
    btn.innerHTML = "✓ Suivi";
    btn.style.background = "var(--accent)";
    btn.style.color = "#fff";
    btn.style.borderColor = "var(--accent)";
    toast("Tu suis " + (userName || "cet utilisateur") + " !");
    supaFollowUser(userId);
  } else {
    state.user.following = state.user.following.filter(id => id !== userId);
    btn.innerHTML = "➕ Suivre";
    btn.style.background = "";
    btn.style.color = "";
    btn.style.borderColor = "";
    toast("Tu ne suis plus " + (userName || "cet utilisateur"));
    supaUnfollowUser(userId);
  }
  saveState();
}

// ======== MODÉRATION (UI) ========
function blockUser(userId, name) {
  if (!userId || userId === MY_UID || userId === "me") return;
  state.user.blocked = state.user.blocked || [];
  if (!state.user.blocked.includes(userId)) state.user.blocked.push(userId);
  // Bloquer = ne plus suivre non plus
  state.user.following = (state.user.following || []).filter(id => id !== userId);
  saveState();
  if (typeof supaBlockUser === "function") supaBlockUser(userId);
  if (typeof supaUnfollowUser === "function") supaUnfollowUser(userId);
  closeModal();
  toast("🚫 " + (name || "Utilisateur") + " bloqué");
  try { renderFeed(); } catch(e) {}
  try { renderMessages(); } catch(e) {}
  try { renderBell(); } catch(e) {}
}

function unblockUser(userId, name) {
  if (!userId) return;
  state.user.blocked = (state.user.blocked || []).filter(id => id !== userId);
  saveState();
  if (typeof supaUnblockUser === "function") supaUnblockUser(userId);
  toast("✅ " + (name || "Utilisateur") + " débloqué");
  try { renderFeed(); } catch(e) {}
  try { if (typeof renderBlockedList === "function") renderBlockedList(); } catch(e) {}
}

function reportUser(userId, name) {
  if (!userId) return;
  if (typeof supaReport === "function") supaReport("user", userId, "");
  closeModal();
  toast("🚩 Signalement envoyé. Notre équipe va vérifier.");
}

function reportPost(postId) {
  if (!postId) return;
  if (typeof supaReport === "function") supaReport("post", postId, "");
  toast("🚩 Post signalé. Merci, on s'en occupe.");
}

function _blockedListHtml() {
  const blocked = state.user.blocked || [];
  if (!blocked.length) return '<div class="empty"><div class="empty-icon">✅</div><div class="empty-title">Aucun compte bloqué</div><div class="empty-text">Tu n\'as bloqué personne.</div></div>';
  return blocked.map(id => {
    const u = (typeof userById === "function" && userById(id)) || {};
    const name = u.name || "Utilisateur";
    const emoji = u.profileEmoji || "👤";
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
      <div class="avatar sm" style="background:${avatarBg(u)};">${avatarInner(u)}</div>
      <div style="flex:1;font-weight:700;font-size:13px;color:var(--text);">${escapeHtml(name)}</div>
      <button class="btn ghost" style="font-size:11px;padding:6px 12px;" onclick="unblockUser('${id}','${escapeJsArg(name)}')">Débloquer</button>
    </div>`;
  }).join("");
}

function renderBlockedList() {
  const box = document.getElementById("blockedListBox");
  if (box) box.innerHTML = _blockedListHtml();
}

function openBlockedList() {
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">🚫 Comptes bloqués</div>
    <div class="modal-subtitle">Leurs posts, commentaires et messages sont masqués.</div>
    <div id="blockedListBox" style="max-height:320px;overflow-y:auto;margin-top:8px;">${_blockedListHtml()}</div>
    <button class="btn primary block" style="margin-top:12px;" onclick="closeModal()">OK</button>
  `);
}

function shareUserProfile(userId, name) {
  const url = location.origin + location.pathname + "#user-" + userId;
  const data = { title: name || "Profil PASSIO", text: "Découvre " + (name || "ce profil") + " sur PASSIO", url };
  if (navigator.share) {
    navigator.share(data).catch(() => {});
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => toast("🔗 Lien du profil copié"), () => toast("Lien : " + url));
  } else {
    toast("Lien : " + url);
  }
}

function renderMessages() {
  const list = $("#messageList");
  if (!list) return;
  const convs = getConversations();

  // Génère les pills lu/non lu
  renderMessageFilters();
  try { if (typeof renderMsgBadge === "function") renderMsgBadge(); } catch(e) {}

  const _q = (window._msgSearchQuery || "").trim().toLowerCase();
  const _showArch = !!window._showArchived;

  // Masquer les conversations avec un utilisateur bloqué (modération)
  let filtered = convs.filter(c => !(typeof isBlocked === "function" && isBlocked(c.userId)));

  // Bandeau « Archivées » : compteur + bascule (caché pendant une recherche).
  const archivedCount = filtered.filter(c => c.archived).length;
  const archRow = document.getElementById("archivedToggleRow");
  if (archRow) {
    if (_q) archRow.innerHTML = "";
    else if (_showArch) archRow.innerHTML = `<button class="btn ghost block" onclick="_toggleArchivedView()" style="font-size:13px;">← Retour aux conversations</button>`;
    else if (archivedCount) archRow.innerHTML = `<button class="btn ghost block" onclick="_toggleArchivedView()" style="font-size:13px;">📥 Archivées (${archivedCount})</button>`;
    else archRow.innerHTML = "";
  }

  if (_q) {
    // Recherche globale : nom de conversation OU texte d'un message (archivées incluses).
    filtered = filtered.filter(c => {
      const name = (c.isGroup ? (c.groupName || "") : (c.userName || "")).toLowerCase();
      if (name.indexOf(_q) > -1) return true;
      return (c.messages || []).some(m => (m.text || "").toLowerCase().indexOf(_q) > -1);
    });
  } else {
    // Vue normale : actives, ou archivées si on a basculé.
    filtered = filtered.filter(c => _showArch ? c.archived : !c.archived);
  }
  // Épinglées d'abord, puis par date du dernier message.
  filtered.sort((a, b) => ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || (b.lastAt - a.lastAt));

  if (!filtered.length) {
    list.innerHTML = "";
    const empt = $("#messagesEmpty");
    if (empt) {
      empt.style.display = "block";
      const t = empt.querySelector(".empty-title"), x = empt.querySelector(".empty-text");
      if (_q) { if (t) t.textContent = "Aucun résultat"; if (x) x.textContent = "Aucune conversation ni message ne correspond à ta recherche."; }
      else if (_showArch) { if (t) t.textContent = "Aucune conversation archivée"; if (x) x.textContent = "Les conversations archivées apparaîtront ici."; }
      else { if (t) t.textContent = "Aucune conversation"; if (x) x.textContent = "Recherche un utilisateur ci-dessus pour démarrer une discussion."; }
    }
    return;
  }
  $("#messagesEmpty").style.display = "none";

  // Pagination : on n'affiche que les N conversations les plus récentes (30 par
  // défaut, +30 par clic). La liste chargeait tout — coûteux au-delà de quelques
  // dizaines de fils (le fil des messages est déjà paginé via _loadMoreMsgs).
  const PAGE = 30;
  if (typeof window._convListLimit !== "number") window._convListLimit = PAGE;
  const total = filtered.length;
  const shown = Math.min(window._convListLimit, total);
  const visible = filtered.slice(0, shown);
  const moreBtn = total > shown
    ? `<button class="btn ghost block" style="margin:10px auto;display:block;" onclick="_loadMoreConvs()">Voir les conversations plus anciennes (${total - shown})</button>`
    : "";

  list.innerHTML = visible.map(c => {
    const seedUsersArr = state.seed.users || [];
    const u = seedUsersArr.find(x => x.id === c.userId) || { name: "Inconnu", avatar: "#7c3aed", profileEmoji: "🙂" };
    const lastMsg = c.messages && c.messages.length ? c.messages[c.messages.length - 1] : null;
    const _previewContent = lastMsg
      ? (lastMsg.gif ? "🎞 GIF" : lastMsg.voiceData ? "🎙 Message vocal" : lastMsg.video ? "🎬 Vidéo" : lastMsg.img ? "📷 Photo" : lastMsg.docData ? "📄 " + (lastMsg.fileName || "Fichier") : lastMsg.text || "")
      : "";
    const previewText = (c.draft && c.id !== window._openedConvId)
      ? "✏️ Brouillon : " + c.draft
      : (lastMsg
          ? (lastMsg.from === "me" ? "Toi : " : "") + _previewContent
          : "Démarrer la conversation…");

    // Affichage groupe vs conversation simple
    var displayName, displayEmoji, displayAvatar;
    if (c.isGroup) {
      displayName = c.groupName || "Groupe";
      displayEmoji = "👥";
      displayAvatar = "var(--accent)";
    } else {
      displayName = c.userName || u.name;
      displayEmoji = c.userEmoji || u.profileEmoji;
      displayAvatar = c.userColor || u.avatar;
    }

    // Avatar de la conv : photo de groupe, sinon photo de profil live de l'autre, sinon couleur+emoji.
    const _convU = c.isGroup ? null : { avatar: displayAvatar, profileEmoji: displayEmoji, photoUrl: (userById(c.userId) || {}).photoUrl || c.userPhoto || u.photoUrl || null };
    const avatarStyle = (c.isGroup && c.groupPhoto)
      ? `background:url(${c.groupPhoto}) center/cover;font-size:0;`
      : (c.isGroup ? `background:${displayAvatar};` : `background:${avatarBg(_convU)};`);
    const _convAvInner = (c.isGroup && c.groupPhoto) ? '' : (c.isGroup ? displayEmoji : avatarInner(_convU));

    const membresLine = c.isGroup
      ? `<div class="msg-passion" style="font-size:11px;color:var(--muted);">👥 ${((c.userIds||[]).length || 0)} membres</div>`
      : "";

    return `<div class="msg-card ${c.unread > 0 ? "unread" : ""}" onclick="openConversation('${c.id}')">
      <div class="msg-avatar" style="${avatarStyle}">${_convAvInner}</div>
      <div class="msg-body">
        <div class="msg-head">
          <span class="msg-name">${c.pinned ? "📌 " : ""}${escapeHtml(displayName)}</span>
          <span class="msg-time">${lastMsg ? fmtMsgTime(c.lastAt) : ""}</span>
        </div>
        ${membresLine}
        <div class="msg-preview ${c.unread > 0 ? 'unread-preview' : ''}">${escapeHtml(previewText)}</div>
      </div>
      ${c.unread > 0 ? `<div class="msg-badge">${c.unread}</div>` : ""}
    </div>`;
  }).join("") + moreBtn;
}

// Pagination de la liste de conversations : afficher 30 fils de plus.
function _loadMoreConvs() {
  window._convListLimit = (window._convListLimit || 30) + 30;
  renderMessages();
}

// Recherche globale dans la liste des conversations (nom + texte des messages).
function _globalMsgSearch(q) {
  window._msgSearchQuery = q || "";
  window._convListLimit = 30; // réinitialise la pagination pour la recherche
  renderMessages();
}

// Bascule entre conversations actives et archivées.
function _toggleArchivedView() {
  window._showArchived = !window._showArchived;
  window._convListLimit = 30;
  renderMessages();
}

// Archive / désarchive une conversation (masquée de la liste principale).
function _toggleArchiveConv(convId) {
  var convs = getConversations();
  var c = convs.find(function(x){ return x.id === convId; });
  if (!c) return;
  c.archived = !c.archived;
  if (c.archived) c.pinned = false; // une conv archivée n'est plus épinglée
  saveConversations();
  if (typeof closeConvSettings === "function") closeConvSettings();
  try { if (typeof closeConversation === "function") closeConversation(); } catch(e) {}
  try { renderMessages(); } catch(e) {}
  toast(c.archived ? "📥 Conversation archivée" : "📤 Conversation désarchivée");
}

async function openConversation(convId) {
  const sp = document.getElementById("convSettingsPanel");
  if (sp) { sp.classList.remove("open"); sp.style.transform = "translateX(100%)"; sp.style.display = "none"; sp.style.pointerEvents = "none"; }
  // Réinitialise un éventuel contexte de réponse d'une conversation précédente.
  if (window._replyTo) { window._replyTo = null; try { _renderReplyBar(); } catch(e) {} }
  window._openedConvId = convId;
  var convs = getConversations();
  var c = convs.find(function(x) { return x.id === convId; });
  if (!c) { console.warn("openConversation: conv not found:", convId); return; }
  // 1ʳᵉ ouverture d'une conversation : proposer les notifications d'appel pour
  // pouvoir RECEVOIR un appel même app fermée (geste utilisateur = autorisé).
  if (!c.isGroup) { try { if (typeof requestCallNotifications === "function") requestCallNotifications(); } catch(e) {} }
  c._convPage = 1; // repart du bas (messages récents) à chaque ouverture
  const u = (state.seed.users || []).find(x => x.id === c.userId) || { name: "Inconnu", avatar: "#7c3aed", profileEmoji: "🙂" };

  var displayName, displayEmoji, displayAvatar;
  if (c.isGroup) {
    displayName = c.groupName || "Groupe";
    displayEmoji = "👥";
    displayAvatar = "var(--accent)";
  } else {
    displayName = c.userName || u.name;
    displayEmoji = c.userEmoji || u.profileEmoji;
    displayAvatar = c.userColor || u.avatar;
  }

  c.unread = 0;
  saveConversations();
  try { if (typeof renderMsgBadge === "function") renderMsgBadge(); } catch(e) {}

  // Avatar header — photo de groupe ou couleur+emoji
  var avatarHtml;
  if (c.isGroup && c.groupPhoto) {
    avatarHtml = `<div onclick="pickGroupPhoto('${convId}')" style="position:relative;flex-shrink:0;cursor:pointer;">
      <div class="conv-fp-head-avatar" style="background:url(${c.groupPhoto}) center/cover;font-size:0;"></div>
      <div style="position:absolute;bottom:-1px;right:-1px;width:14px;height:14px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:8px;border:1.5px solid var(--bg-soft);">📷</div>
    </div>`;
  } else {
    const _hu = { avatar: displayAvatar, profileEmoji: displayEmoji, photoUrl: (userById(c.userId) || {}).photoUrl || c.userPhoto || u.photoUrl || null };
    avatarHtml = `<div class="conv-fp-head-avatar" style="background:${avatarBg(_hu)};" onclick="${c.isGroup ? '' : `openUserProfile('${c.userId}','seed')`}">${avatarInner(_hu)}</div>`;
  }

  // ── Header ──
  const headEl = document.getElementById("convFpHead");
  if (headEl) headEl.innerHTML = `
    <button class="conv-fp-back" onclick="closeConversation()" aria-label="Retour">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    ${avatarHtml}
    <div class="conv-fp-head-info" onclick="${c.isGroup ? '' : `openUserProfile('${c.userId}','seed')`}">
      <div class="conv-fp-name">${escapeHtml(displayName)}</div>
      <div class="conv-fp-passion">${c.isGroup ? `👥 ${(c.userIds||[]).length} membres` : 'Voir le profil'}</div>
    </div>
    <div class="conv-actions">
      ${c.isGroup ? `<button class="conv-action-btn" onclick="showGroupMembers('${convId}')" title="Membres">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      </button>` : ''}
      ${c.isGroup ? '' : `<button class="conv-action-btn" onclick="startCall('${convId}','voice')" title="Appel audio">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.6 1.2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      </button>
      <button class="conv-action-btn" onclick="startCall('${convId}','video')" title="Appel vidéo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
      </button>`}
      <button class="conv-action-btn" onclick="openConvSettings('${convId}')" title="Paramètres">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </button>
    </div>`;

  // ── Champ de saisie (textarea) ──
  const inp = document.getElementById("convFpInput");
  const btn = document.getElementById("convFpSendBtn");
  if (inp) {
    inp.value = c.draft || ""; // restaure le brouillon non envoyé
    inp.style.height = "auto";
    try { if (inp.value) autoResizeTextarea(inp); } catch(e) {}
    inp.onkeydown = function(e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessageFp(convId, displayName); }
    };
  }
  if (btn) btn.onclick = () => sendMessageFp(convId, displayName);

  // ── Afficher pleine page ──
  const fp = document.getElementById("conv-fullpage");
  if (fp) {
    fp.setAttribute("data-conv-id", convId);
    fp.setAttribute("data-display-name", displayName);
    fp.classList.add("active");
  }

  var thread = document.getElementById("convFpThread");
  // Fond de conversation personnalisé (réglages → 🎨), sinon fond par défaut.
  if (thread) thread.style.background = c.bg || "var(--bg-deep)";

  // Souscrire aux nouveaux messages en temps réel
  _supaConvSpecificChannel(convId, displayName);
  _subscribeTyping(convId);
  // Accusés de lecture réels : je marque comme lu + je charge l'état de l'autre.
  try { if (typeof supaMarkRead === "function") supaMarkRead(convId); } catch(e) {}
  try { if (typeof supaLoadOtherRead === "function") supaLoadOtherRead(convId); } catch(e) {}

  // Affichage immédiat avec les messages locaux (feedback instantané)
  renderConvFpThread(c, displayName);
  if (thread) thread.scrollTop = thread.scrollHeight;
  if (inp) inp.focus();
  try { renderMessages(); } catch(e) {}

  // Charger TOUS les messages depuis Supabase (pas de limite, tous les anciens inclus)
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    try {
      var supaMessages = await supaLoadMessages(convId);
      if (window._openedConvId !== convId) return;
      var convs2 = getConversations();
      var c2 = convs2.find(function(x) { return x.id === convId; });
      if (!c2) return;
      var remote = supaMessages || [];
      // Créer un map des messages Supabase par ID
      var remoteMap = {};
      remote.forEach(function(m) { if (m.id) remoteMap[m.id] = m; });

      // REMPLACER les messages locaux par les messages Supabase quand ils existent.
      // On conserve `myReact` (suivi de MA réaction, local) et le `status` d'envoi.
      var messages = (c2.messages || []).map(function(m) {
        var rm = remoteMap[m.id];
        if (rm) { if (m.myReact) rm.myReact = m.myReact; if (m.status && !rm.status) rm.status = m.status; return rm; }
        return m;
      });

      // Ajouter les messages Supabase qui n'existent pas localement
      var localIds = new Set((c2.messages || []).map(function(m) { return m.id; }).filter(Boolean));
      remote.forEach(function(m) {
        if (!localIds.has(m.id)) messages.push(m);
      });

      c2.messages = messages;
      c2.messages.sort(function(a, b) { return (a.at || 0) - (b.at || 0); });
      c2._otherRead = true;
      saveConversations();
      if (window._openedConvId === convId) {
        renderConvFpThread(c2, displayName);
        if (thread) thread.scrollTop = thread.scrollHeight;
      }
    } catch(e) { console.warn("openConversation supabase load error:", e); }
  }
}

function renderConvFpThread(c, displayName) {
  var thread = document.getElementById("convFpThread");
  if (!thread) return;
  var allMsgs = c.messages || [];

  // Scroll infini : on n'affiche que les N derniers messages, on en charge plus en
  // remontant. _convPage = nombre de pages affichées (réinitialisé à l'ouverture).
  var CONV_PAGE = 40;
  if (typeof c._convPage !== "number") c._convPage = 1;
  var _shownCount = Math.min(allMsgs.length, c._convPage * CONV_PAGE);
  var _startIdx = Math.max(0, allMsgs.length - _shownCount);
  var _hasMoreOlder = _startIdx > 0;
  var msgs = allMsgs.slice(_startIdx);
  _wireConvScroll(thread, c.id);

  if (msgs.length === 0) {
    thread.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;opacity:0.6;">
        <div style="font-size:48px;">💬</div>
        <div style="font-size:14px;color:var(--muted);text-align:center;">Aucun message pour l'instant.<br>Dis bonjour !</div>
      </div>`;
    return;
  }

  // Helpers
  function _dayLabel(ts) {
    if (!ts) return "";
    var d = new Date(ts), now = new Date();
    var sameYear = d.getFullYear() === now.getFullYear();
    var diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return "Hier";
    return d.toLocaleDateString("fr-FR", { day:"numeric", month:"long", year: sameYear ? undefined : "numeric" });
  }
  function _dayKey(ts) { var d = new Date(ts); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }

  var parts = [];
  var lastDay = "";
  var lastFrom = "";

  msgs.forEach(function(m, i) {
    var isMe = (m.from === "me");
    var msgDay = m.at ? _dayKey(m.at) : "";

    // Séparateur de date
    if (msgDay && msgDay !== lastDay) {
      lastDay = msgDay;
      lastFrom = ""; // reset grouping on new day
      parts.push(
        '<div style="display:flex;align-items:center;gap:8px;margin:12px 4px 10px;">' +
          '<div style="flex:1;height:1px;background:var(--border);"></div>' +
          '<span style="font-size:11px;color:var(--muted);font-weight:600;white-space:nowrap;padding:0 4px;">' + _dayLabel(m.at) + '</span>' +
          '<div style="flex:1;height:1px;background:var(--border);"></div>' +
        '</div>'
      );
    }

    var isLastMe = isMe && (i === msgs.length - 1);
    var isNewSender = (m.from !== lastFrom);
    lastFrom = m.from;

    // Nom de l'expéditeur (groupes uniquement, 1ère bulle du groupe)
    var senderLine = "";
    if (!isMe && c.isGroup && isNewSender && m.fromName) {
      senderLine = '<span class="conv-sender-name">' + escapeHtml(m.fromName) + '</span>';
    }

    // Read receipt — ✓✓ si l'autre a lu (last_read_at >= heure du message), sinon ✓.
    // Masqués si l'utilisateur les a désactivés (réglage global).
    var _rrOn = !(((state.user.general)||{}).readReceipts === false);
    var _isRead = c._otherReadAt ? (m.at && m.at <= c._otherReadAt) : c._otherRead;
    var readReceipt = (isLastMe && _rrOn)
      ? (_isRead
          ? ' <span style="color:var(--accent);">✓✓</span>'
          : ' <span style="opacity:0.5;">✓</span>')
      : "";

    // Statut d'envoi (mes messages) : 🕓 en cours, ⚠️ échec (cliquable pour réessayer).
    var statusInd = "";
    if (isMe) {
      if (m.status === "sending") statusInd = ' <span style="opacity:0.55;">🕓</span>';
      else if (m.status === "failed") statusInd = ' <span style="color:#ef4444;cursor:pointer;font-weight:700;" onclick="_retryMsg(\'' + c.id + '\',\'' + m.id + '\')">⚠️ réessayer</span>';
    }

    // Temps — affiché sur chaque message avec heure exacte (HH:MM)
    var isLastInGroup = (i === msgs.length - 1) || (msgs[i+1] && msgs[i+1].from !== m.from) || (msgs[i+1] && m.at && msgs[i+1].at && _dayKey(msgs[i+1].at) !== msgDay);
    var timeStr = '';
    if (m.at) {
      var receipt = (isLastMe && isLastInGroup) ? readReceipt : '';
      var d = new Date(m.at);
      var hours = String(d.getHours()).padStart(2, '0');
      var mins = String(d.getMinutes()).padStart(2, '0');
      var timeExact = hours + ':' + mins;
      timeStr = '<span class="conv-bubble-time">' + timeExact + receipt + statusInd + '</span>';
    } else if (isMe) {
      timeStr = '<span class="conv-bubble-time">' + ((isLastMe && isLastInGroup) ? readReceipt : '') + statusInd + '</span>';
    }

    // Contenu
    var content = "";
    var isMedia = false;

    // Décoder le JSON du texte si nécessaire (messages média Supabase non encore décodés)
    applyMsgContentData(m);

    if (m.gif) {
      isMedia = true;
      content = '<img src="' + m.gif + '" style="max-width:200px;max-height:160px;border-radius:12px;display:block;" loading="lazy"/>';
    } else if (m.video) {
      isMedia = true;
      content = '<video src="' + m.video + '" style="max-width:200px;max-height:200px;border-radius:12px;display:block;cursor:pointer;" controls preload="none"/>';
    } else if (m.img) {
      isMedia = true;
      content = '<img loading="lazy" decoding="async" src="' + m.img + '" style="max-width:200px;max-height:200px;border-radius:12px;display:block;cursor:pointer;" onclick="openFullImg(this.src)"/>';
    } else if (m.fileUrl) {
      isMedia = true;
      var ftype = (m.fileType || 'file').toLowerCase();
      var fname = escapeHtml(m.fileName || 'Fichier');
      var fileIcon = ftype === 'doc' || ftype === 'document' ? '📄' :
                     ftype === 'image' ? '🖼️' :
                     ftype === 'video' ? '🎬' :
                     ftype === 'audio' ? '🎵' : '📎';
      var docBg = isMe ? 'rgba(255,255,255,0.12)' : 'var(--bg-soft)';
      var docBorder = isMe ? 'rgba(255,255,255,0.2)' : 'var(--border)';
      content = '<a href="' + escapeHtml(m.fileUrl) + '" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;display:inline-block;">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:8px;cursor:pointer;">' +
        '<div style="width:36px;height:36px;border-radius:10px;background:' + docBg + ';border:1px solid ' + docBorder + ';display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">' + fileIcon + '</div>' +
        '<div><div style="font-size:13px;font-weight:700;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + fname + '</div>' +
        '<div style="font-size:10px;opacity:0.6;">📥 Télécharger</div></div></div></a>';
    } else if (m.location) {
      isMedia = true;
      content = '<a href="' + escapeHtml(m.location.url || 'https://maps.google.com') + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">' +
        '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;">' +
        '<div style="font-size:20px;">📍</div>' +
        '<div><div style="font-size:13px;">📍 Position</div><div style="font-size:11px;opacity:0.7;">' + escapeHtml(m.location.lat + ', ' + m.location.lng) + '</div></div></div></a>';
    } else if (m.voiceData && !m.isFile) {
      isMedia = true;
      var vDur = m.voiceDuration || 0;
      var vDurStr = Math.floor(vDur/60) + ':' + String(vDur%60).padStart(2,'0');
      var aid = 'aud_' + (m.id || i).toString().replace(/[^a-z0-9]/gi,'');
      window['_vd_' + aid] = m.voiceData;
      var waveBg = isMe ? 'rgba(255,255,255,0.2)' : 'rgba(139,92,246,0.12)';
      var waveFill = isMe ? 'rgba(255,255,255,0.6)' : 'var(--accent)';
      content = '<div style="display:flex;align-items:center;gap:8px;min-width:180px;max-width:240px;">' +
        '<button style="width:34px;height:34px;border-radius:50%;background:' + (isMe?'rgba(255,255,255,0.2)':'rgba(139,92,246,0.12)') + ';border:none;color:' + (isMe?'#fff':'var(--accent)') + ';cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;" onclick="_playVoiceById(\'' + aid + '\')" id="pb_' + aid + '">▶</button>' +
        '<div style="flex:1;height:28px;background:' + waveBg + ';border-radius:8px;overflow:hidden;cursor:pointer;" onclick="_playVoiceById(\'' + aid + '\')"><div id="wf_' + aid + '" style="height:100%;background:' + waveFill + ';border-radius:8px;width:0%;transition:width 0.15s;"></div></div>' +
        '<span id="dur_' + aid + '" style="font-size:11px;opacity:0.75;flex-shrink:0;min-width:30px;text-align:right;">' + vDurStr + '</span>' +
        '<button class="voice-speed-btn" onclick="_cycleVoiceSpeed()" style="flex-shrink:0;background:' + (isMe?'rgba(255,255,255,0.18)':'rgba(139,92,246,0.12)') + ';border:none;color:' + (isMe?'#fff':'var(--accent)') + ';font-size:10px;font-weight:800;border-radius:8px;padding:2px 6px;cursor:pointer;">' + (((window._voiceSpeed||1) % 1 === 0) ? (window._voiceSpeed||1) : String(window._voiceSpeed).replace(".",",")) + '×</button>' +
        '</div>';
    } else if (m.docData) {
      isMedia = true;
      var fname = escapeHtml(m.fileName || 'Fichier');
      var docBg = isMe ? 'rgba(255,255,255,0.12)' : 'var(--bg-soft)';
      var docBorder = isMe ? 'rgba(255,255,255,0.2)' : 'var(--border)';
      content = '<div style="display:flex;align-items:center;gap:10px;padding:4px 0;cursor:pointer;" onclick="_docDownload(\'' + (m.id||i) + '\')">' +
        '<div style="width:36px;height:36px;border-radius:10px;background:' + docBg + ';border:1px solid ' + docBorder + ';display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">📄</div>' +
        '<div><div style="font-size:13px;font-weight:700;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + fname + '</div>' +
        '<div style="font-size:10px;opacity:0.6;">' + escapeHtml((m.fileType||'') + (m.fileSize ? ' · '+m.fileSize : '')) + '</div></div></div>';
      // stocker pour le téléchargement
      window['_doc_' + (m.id||i)] = { data: m.docData, name: m.fileName || 'fichier' };
    } else if (m.text) {
      if (m.text.startsWith('📍')) {
        var parts2 = m.text.split(': ');
        content = '<a href="' + escapeHtml(parts2[1]||'') + '" target="_blank" rel="noopener" style="color:inherit;">' + escapeHtml(m.text) + '</a>';
      } else {
        content = escapeHtml(m.text);
      }
    }

    // Arrondir les coins pour les messages groupés
    var isFirstInGroup = isNewSender;
    var isLastOfGroup = isLastInGroup;
    var extraBubbleStyle = '';
    if (isMe) {
      if (!isFirstInGroup) extraBubbleStyle += 'border-top-right-radius:6px;';
      if (!isLastOfGroup) extraBubbleStyle += 'border-bottom-right-radius:6px;';
    } else {
      if (!isFirstInGroup) extraBubbleStyle += 'border-top-left-radius:6px;';
      if (!isLastOfGroup) extraBubbleStyle += 'border-bottom-left-radius:6px;';
    }

    var bubbleStyle = isMedia
      ? ' style="background:transparent;padding:0;box-shadow:none;' + extraBubbleStyle + '"'
      : (extraBubbleStyle ? ' style="' + extraBubbleStyle + '"' : '');

    // Bloc citation (réponse à un message)
    var replyHtml = "";
    if (m.replyTo && (m.replyTo.t || m.replyTo.n)) {
      replyHtml = '<div class="conv-reply-quote" onclick="_jumpToMsg(\'' + (m.replyTo.id||'') + '\')">' +
        '<span class="conv-reply-name">' + escapeHtml(m.replyTo.n || '') + '</span>' +
        '<span class="conv-reply-text">' + escapeHtml((m.replyTo.t || '📎 Pièce jointe').slice(0,80)) + '</span></div>';
    }

    // Réactions sous la bulle
    var reactHtml = "";
    if (m.reactions && Object.keys(m.reactions).length) {
      reactHtml = '<div class="conv-reactions ' + (isMe?'me':'them') + '">' +
        Object.keys(m.reactions).map(function(e){ return '<span class="conv-react-badge">' + e + (m.reactions[e]>1?(' '+m.reactions[e]):'') + '</span>'; }).join('') +
        '</div>';
    }

    parts.push(
      '<div class="conv-bubble-wrap ' + (isMe?'me':'them') + '" data-mid="' + (m.id||'') + '" data-me="' + (isMe?'1':'0') + '">' +
        senderLine +
        '<div class="conv-bubble ' + (isMe?'me':'them') + '"' + bubbleStyle + '>' + replyHtml + content + '</div>' +
        reactHtml +
        timeStr +
      '</div>'
    );
  });

  // Indicateur « messages plus anciens » en tête quand il en reste à charger.
  if (_hasMoreOlder) {
    parts.unshift('<div style="text-align:center;padding:8px;font-size:12px;color:var(--muted);">⏳ Remonte pour charger les messages plus anciens…</div>');
  }

  thread.innerHTML = parts.join('');
  if (!c._loadingOlder) thread.scrollTop = thread.scrollHeight; // pas de saut en bas pendant le chargement d'historique
  _wireMsgActions(thread, c.id);
  _wireConvScroll(thread, c.id);
}

// Scroll infini : charge une page de messages plus anciens quand on approche du
// haut du fil, en préservant la position visuelle.
function _wireConvScroll(thread, convId) {
  if (!thread) return;
  thread._curConvId = convId;
  if (thread._scrollWired) return;
  thread._scrollWired = true;
  thread.addEventListener("scroll", function() {
    if (thread.scrollTop > 60 || thread._loadingMore) return;
    var c = getConversations().find(function(x){ return x.id === thread._curConvId; });
    if (!c || !c.messages) return;
    var shown = Math.min(c.messages.length, (c._convPage || 1) * 40);
    if (shown >= c.messages.length) return; // tout est déjà affiché
    thread._loadingMore = true;
    var oldH = thread.scrollHeight;
    c._convPage = (c._convPage || 1) + 1;
    c._loadingOlder = true;
    var fp = document.getElementById("conv-fullpage");
    renderConvFpThread(c, fp ? fp.getAttribute("data-display-name") : (c.userName||""));
    c._loadingOlder = false;
    thread.scrollTop = thread.scrollHeight - oldH; // conserve la position visuelle
    thread._loadingMore = false;
  }, { passive: true });
}

// Attache (une fois par fil) l'ouverture du menu d'actions sur appui long / clic droit
// d'une bulle. Délégué sur le conteneur → robuste au re-render.
function _wireMsgActions(thread, convId) {
  if (!thread || thread._msgActionsWired === convId) {
    if (thread) thread._curConvId = convId;
    return;
  }
  thread._msgActionsWired = convId;
  thread._curConvId = convId;
  var pressTimer = null, moved = false;
  function bubbleMid(t) { var w = t && t.closest ? t.closest(".conv-bubble-wrap") : null; return w ? w.getAttribute("data-mid") : null; }
  thread.addEventListener("contextmenu", function(e) {
    var mid = bubbleMid(e.target); if (!mid) return;
    e.preventDefault(); _openMsgActions(thread._curConvId, mid);
  });
  thread.addEventListener("touchstart", function(e) {
    var mid = bubbleMid(e.target); if (!mid) return;
    moved = false;
    pressTimer = setTimeout(function(){ if (!moved) _openMsgActions(thread._curConvId, mid); }, 480);
  }, { passive: true });
  thread.addEventListener("touchmove", function(){ moved = true; clearTimeout(pressTimer); }, { passive: true });
  thread.addEventListener("touchend", function(){ clearTimeout(pressTimer); }, { passive: true });
}

// Scroll jusqu'au message cité (surbrillance brève).
function _jumpToMsg(mid) {
  if (!mid) return;
  var el = document.querySelector('.conv-bubble-wrap[data-mid="' + mid + '"]');
  if (!el) { toast("Message introuvable (peut-être plus ancien)"); return; }
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  var b = el.querySelector(".conv-bubble");
  if (b) { b.style.transition = "box-shadow .3s"; b.style.boxShadow = "0 0 0 3px var(--accent)"; setTimeout(function(){ b.style.boxShadow = ""; }, 1200); }
}

// ───────── Actions sur un message (appui long) ─────────
function _msgById(convId, msgId) {
  var c = getConversations().find(function(x){ return x.id === convId; });
  if (!c) return null;
  return { c: c, m: (c.messages || []).find(function(x){ return x.id === msgId; }) };
}
function _msgPreviewText(m) {
  if (!m) return "";
  if (m.text && !/^\{/.test(m.text)) return m.text;
  if (m.gif) return "🎞 GIF"; if (m.img) return "📷 Photo"; if (m.video) return "🎬 Vidéo";
  if (m.voiceData) return "🎙 Message vocal"; if (m.fileUrl || m.docData) return "📄 " + (m.fileName || "Fichier");
  if (m.location) return "📍 Position"; return m.text || "Message";
}

function _openMsgActions(convId, msgId) {
  var r = _msgById(convId, msgId); if (!r || !r.m) return;
  var m = r.m, isMe = (m.from === "me");
  var reacts = ["❤️","😂","👍","😮","😢","🔥"];
  var reactRow = '<div style="display:flex;justify-content:space-around;padding:6px 4px 12px;">' +
    reacts.map(function(e){ return '<span onclick="_reactAndClose(\'' + convId + '\',\'' + msgId + '\',\'' + e + '\')" style="font-size:26px;cursor:pointer;">' + e + '</span>'; }).join('') + '</div>';
  function item(icon, label, fn, danger) {
    return '<div class="csetting-item" onclick="' + fn + '"><div class="csetting-icon">' + icon + '</div>' +
      '<div class="csetting-label"' + (danger?' style="color:#ef4444;"':'') + '>' + label + '</div></div>';
  }
  var canCopy = m.text && !/^\{/.test(m.text);
  openModal(
    '<div class="modal-handle"></div>' + reactRow +
    item('↩️', 'Répondre', "_setReplyTo('" + convId + "','" + msgId + "')") +
    (canCopy ? item('📋', 'Copier le texte', "_copyMsg('" + convId + "','" + msgId + "')") : '') +
    item('↪️', 'Transférer', "_forwardPick('" + convId + "','" + msgId + "')") +
    item('🗑️', 'Supprimer pour moi', "_deleteMsgForMe('" + convId + "','" + msgId + "')", true) +
    (isMe ? item('🗑️', 'Supprimer pour tous', "_deleteMsgForAll('" + convId + "','" + msgId + "')", true) : '')
  );
}

function _reactAndClose(convId, msgId, emoji) { closeModal(); _toggleReaction(convId, msgId, emoji); }

function _copyMsg(convId, msgId) {
  var r = _msgById(convId, msgId); if (!r || !r.m) return;
  var t = r.m.text || "";
  try { navigator.clipboard.writeText(t); toast("📋 Copié"); } catch(e) { toast("Copie impossible"); }
  closeModal();
}

// Répondre : mémorise la cible et affiche un bandeau au-dessus du champ de saisie.
function _setReplyTo(convId, msgId) {
  closeModal();
  var r = _msgById(convId, msgId); if (!r || !r.m) return;
  var m = r.m;
  window._replyTo = { convId: convId, id: msgId, t: _msgPreviewText(m).slice(0,80), n: (m.from === "me" ? "Toi" : (m.fromName || r.c.userName || "Lui")) };
  _renderReplyBar();
  var inp = document.getElementById("convFpInput"); if (inp) inp.focus();
}
function _cancelReply() { window._replyTo = null; _renderReplyBar(); }
function _renderReplyBar() {
  var bar = document.getElementById("convReplyBar");
  var rt = window._replyTo;
  if (!rt) { if (bar) bar.remove(); return; }
  var toolbar = document.querySelector("#conv-fullpage .conv-toolbar");
  if (!toolbar) return;
  if (!bar) { bar = document.createElement("div"); bar.id = "convReplyBar"; toolbar.parentNode.insertBefore(bar, toolbar); }
  bar.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-soft);border-left:3px solid var(--accent);border-radius:8px;margin:0 8px 6px;">' +
    '<div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:800;color:var(--accent);">↩️ Réponse à ' + escapeHtml(rt.n) + '</div>' +
    '<div style="font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(rt.t) + '</div></div>' +
    '<span onclick="_cancelReply()" style="font-size:18px;cursor:pointer;color:var(--muted);padding:0 4px;">✕</span></div>';
}

// Supprimer pour moi : retrait local uniquement.
function _deleteMsgForMe(convId, msgId) {
  closeModal();
  var r = _msgById(convId, msgId); if (!r || !r.m) return;
  r.c.messages = (r.c.messages || []).filter(function(x){ return x.id !== msgId; });
  saveConversations();
  var fp = document.getElementById("conv-fullpage");
  renderConvFpThread(r.c, fp ? fp.getAttribute("data-display-name") : "");
  try { renderMessages(); } catch(e) {}
  toast("Message supprimé");
}

// Supprimer pour tous (mes messages) : retrait local + suppression Supabase +
// tombstone diffusé au destinataire (géré par _handleIncomingConvMessage type:del).
function _deleteMsgForAll(convId, msgId) {
  closeModal();
  var r = _msgById(convId, msgId); if (!r || !r.m || r.m.from !== "me") return;
  r.c.messages = (r.c.messages || []).filter(function(x){ return x.id !== msgId; });
  saveConversations();
  var fp = document.getElementById("conv-fullpage");
  renderConvFpThread(r.c, fp ? fp.getAttribute("data-display-name") : "");
  try { renderMessages(); } catch(e) {}
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    try { supa.from("conv_messages").delete().eq("id", msgId).then(function(){}, function(){}); } catch(e) {}
    // Tombstone : prévient l'autre client de retirer le message.
    try {
      var tomb = JSON.stringify({ type: "del", target: msgId, text: "🗑 Message supprimé" });
      supa.from("conv_messages").insert({ id: "del_" + uid(), conv_id: convId, from_id: MY_UID, content: tomb, created_at: new Date().toISOString() }).then(function(){}, function(){});
    } catch(e) {}
  }
  toast("Message supprimé pour tous");
}

// Transférer : choisir une conversation cible.
function _forwardPick(convId, msgId) {
  closeModal();
  window._forwardSrc = { convId: convId, msgId: msgId };
  var convs = getConversations().filter(function(c){ return !c.archived; }).sort(function(a,b){ return (b.lastAt||0)-(a.lastAt||0); }).slice(0, 30);
  var rows = convs.map(function(c){
    var name = c.isGroup ? (c.groupName || "Groupe") : (c.userName || "Conversation");
    return '<div class="csetting-item" onclick="_forwardTo(\'' + c.id + '\')"><div class="csetting-icon">' + (c.isGroup?'👥':'💬') + '</div>' +
      '<div class="csetting-label">' + escapeHtml(name) + '</div></div>';
  }).join("");
  openModal('<div class="modal-handle"></div><div class="modal-title">↪️ Transférer vers…</div>' +
    '<div style="max-height:340px;overflow-y:auto;margin-top:8px;">' + (rows || '<div style="padding:20px;text-align:center;color:var(--muted);">Aucune conversation</div>') + '</div>');
}

function _forwardTo(targetConvId) {
  closeModal();
  var src = window._forwardSrc; if (!src) return;
  var r = _msgById(src.convId, src.msgId); if (!r || !r.m) return;
  var m = r.m;
  var convs = getConversations();
  var target = convs.find(function(x){ return x.id === targetConvId; }); if (!target) return;
  // Reconstruit un envelope de contenu selon le type, puis insère localement + Supabase.
  var content = null, localMsg = { id: "msg_" + uid(), from: "me", at: Date.now() };
  if (m.img || m.video) { content = { type: "media", url: m.img || m.video, fileType: m.video ? "video/mp4" : "image/jpeg", filename: "média", text: m.video ? "🎬 Vidéo" : "📷 Photo" }; if (m.video) localMsg.video = m.video; else localMsg.img = m.img; }
  else if (m.gif) { content = { type: "gif", url: m.gif, text: "🎞 GIF" }; localMsg.gif = m.gif; }
  else if (m.fileUrl) { content = { type: "doc", url: m.fileUrl, filename: m.fileName || "Fichier", text: "📄 " + (m.fileName||"Fichier") }; localMsg.fileUrl = m.fileUrl; localMsg.fileName = m.fileName; localMsg.fileType = m.fileType; }
  else if (m.location) { content = { type: "location", lat: m.location.lat, lng: m.location.lng, url: m.location.url, text: "📍 Position" }; localMsg.location = m.location; }
  else { localMsg.text = m.text || ""; }
  if (!target.messages) target.messages = [];
  target.messages.push(localMsg);
  target.lastAt = Date.now();
  saveConversations();
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    var raw = content ? JSON.stringify(content) : (localMsg.text || "");
    var payload = (typeof _withSenderMeta === "function") ? _withSenderMeta(raw) : raw;
    try { supa.from("conv_messages").insert({ id: localMsg.id, conv_id: targetConvId, from_id: MY_UID, content: payload, created_at: new Date().toISOString() }).then(function(){}, function(){}); } catch(e) {}
  }
  try { renderMessages(); } catch(e) {}
  toast("↪️ Transféré");
}

// Décode le content JSON des messages média Supabase (type gif/media/audio/doc/location,
// encodé par sendMessageToSupabase, app-09) et applique les champs sur l'objet message.
// Les messages vocaux (audio/webm ou "Message vocal (Xs)") vont vers le lecteur intégré
// (m.voiceData) ; les autres fichiers audio restent des pièces jointes téléchargeables.
// `raw` est optionnel : par défaut on tente de décoder m.text.
function applyMsgContentData(m, raw) {
  var src = (raw === undefined || raw === null) ? m.text : raw;
  if (!src || typeof src !== "string" || src.trim().charAt(0) !== "{") return;
  var d;
  try { d = JSON.parse(src); } catch (e) { return; }
  if (!d || !d.type) return;
  // Identité de l'expéditeur (profil/persona utilisé à l'envoi) — prioritaire sur
  // le nom dérivé de la ligne `profiles` partagée. Cf. _withSenderMeta (app-02).
  if (d.sp) {
    m.senderProfile = d.sp;
    if (d.sp.n) m.fromName = d.sp.n;
    if (d.sp.e) m.fromEmoji = d.sp.e;
  }
  if (d.rt && !m.replyTo) m.replyTo = d.rt; // contexte de réponse (cf. _setReplyTo)
  if (d.type === "gif" && !m.gif) {
    m.gif = d.url;
  } else if (d.type === "location" && !m.location) {
    m.location = { lat: d.lat, lng: d.lng, url: d.url };
  } else if (d.type === "media" && !m.img && !m.video) {
    if (d.fileType && d.fileType.indexOf("video/") === 0) m.video = d.url;
    else m.img = d.url;
  } else if (d.type === "audio" && !m.voiceData && !m.fileUrl) {
    var isVoice = d.fileType === "audio/webm" || /^Message vocal/.test(d.filename || "");
    if (isVoice) {
      m.voiceData = d.url;
      var dm = (d.filename || "").match(/\((\d+)\s*s\)/);
      m.voiceDuration = dm ? parseInt(dm[1], 10) : 0;
    } else {
      m.fileUrl = d.url;
      m.fileName = d.filename;
      m.fileType = d.type;
    }
  } else if (d.type === "doc" && !m.fileUrl) {
    m.fileUrl = d.url;
    m.fileName = d.filename;
    m.fileType = d.type;
  }
  if (d.text && m.text !== d.text) m.text = d.text;
}

// Téléchargement doc depuis store global
function _docDownload(key) {
  var d = window['_doc_' + key];
  if (!d) return;
  var a = document.createElement('a');
  a.href = d.data; a.download = d.name; a.click();
}

// Lecture audio via window store (évite les data-URI dans les attributs)
function _playVoiceById(aid) {
  var src = window['_vd_' + aid];
  var pb  = document.getElementById('pb_'  + aid);
  var wf  = document.getElementById('wf_'  + aid);
  var dur = document.getElementById('dur_' + aid);
  var audioKey = '_aud_' + aid;
  if (!window[audioKey]) {
    window[audioKey] = new Audio(src);
  }
  var audio = window[audioKey];
  audio.playbackRate = window._voiceSpeed || 1; // vitesse de lecture choisie
  if (!audio.paused) {
    audio.pause();
    if (pb) pb.textContent = '▶';
    return;
  }
  audio.play().then(function() {
    if (pb) pb.textContent = '⏸';
    var iv = setInterval(function() {
      if (audio.paused || audio.ended) {
        clearInterval(iv);
        if (pb) pb.textContent = '▶';
        if (wf) wf.style.width = '0%';
        return;
      }
      if (wf && audio.duration) wf.style.width = (audio.currentTime / audio.duration * 100) + '%';
      if (dur && audio.duration) {
        var r = Math.ceil(audio.duration - audio.currentTime);
        dur.textContent = Math.floor(r/60) + ':' + String(r%60).padStart(2,'0');
      }
    }, 150);
  }).catch(function() { if (pb) pb.textContent = '▶'; });
}

// Vitesse de lecture des messages vocaux : cycle 1× → 1,5× → 2×.
function _cycleVoiceSpeed(btnId) {
  var cur = window._voiceSpeed || 1;
  var next = cur === 1 ? 1.5 : (cur === 1.5 ? 2 : 1);
  window._voiceSpeed = next;
  // Applique à tous les vocaux en cours de lecture.
  Object.keys(window).forEach(function(k){ if (k.indexOf("_aud_") === 0 && window[k] && typeof window[k].playbackRate !== "undefined") { try { window[k].playbackRate = next; } catch(e) {} } });
  // Met à jour tous les boutons de vitesse affichés.
  document.querySelectorAll(".voice-speed-btn").forEach(function(b){ b.textContent = (next % 1 === 0 ? next : next.toString().replace(".", ",")) + "×"; });
}

function _loadMoreMsgs(convId) {
  const convs = getConversations();
  const c = convs.find(x => x.id === convId);
  if (!c) return;
  c._msgPage = (c._msgPage || 1) + 1;
  const fp = document.getElementById("conv-fullpage");
  const displayName = fp ? fp.getAttribute("data-display-name") : "";
  renderConvFpThread(c, displayName);
}

const _REACT_EMOJIS = ["❤️","😂","😮","😢","👏","🔥","🎸","💪"];
function _showReactPicker(convId, msgId, bubbleEl) {
  // Supprimer un picker existant
  var old = document.getElementById("_reactPicker");
  if (old) { old.remove(); if (old._forMsg === msgId) return; }
  var picker = document.createElement("div");
  picker.id = "_reactPicker";
  picker._forMsg = msgId;
  picker.style.cssText = "position:fixed;z-index:999;background:var(--bg-card);border:1.5px solid var(--border);border-radius:20px;padding:8px 12px;display:flex;gap:8px;box-shadow:0 8px 30px rgba(0,0,0,0.25);";
  _REACT_EMOJIS.forEach(e => {
    var sp = document.createElement("span");
    sp.style.cssText = "font-size:22px;cursor:pointer;";
    sp.textContent = e;
    sp.addEventListener("click", function() { _toggleReaction(convId, msgId, e); picker.remove(); });
    picker.appendChild(sp);
  });
  // Positionner au-dessus de la bulle
  var rect = bubbleEl.getBoundingClientRect();
  picker.style.left = Math.min(rect.left, window.innerWidth - 290) + "px";
  picker.style.top = (rect.top - 56) + "px";
  document.body.appendChild(picker);
  setTimeout(() => document.addEventListener("click", function _close(e) { if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener("click", _close); }}, {once:false}), 100);
}

function _toggleReaction(convId, msgId, emoji) {
  var convs = getConversations();
  var c = convs.find(x => x.id === convId);
  if (!c) return;
  var m = (c.messages || []).find(x => x.id === msgId);
  if (!m) return;
  if (!m.reactions) m.reactions = {};
  if (!m.myReact) m.myReact = {};
  // On suit MA réaction séparément du total : sinon, réagir au même emoji qu'un
  // autre membre l'aurait retiré au lieu d'ajouter la mienne.
  var op;
  if (m.myReact[emoji]) {
    delete m.myReact[emoji];
    m.reactions[emoji] = (m.reactions[emoji] || 1) - 1;
    if (m.reactions[emoji] <= 0) delete m.reactions[emoji];
    op = "remove";
  } else {
    m.myReact[emoji] = true;
    m.reactions[emoji] = (m.reactions[emoji] || 0) + 1;
    op = "add";
  }
  saveConversations();
  const fp = document.getElementById("conv-fullpage");
  const displayName = fp ? fp.getAttribute("data-display-name") : "";
  renderConvFpThread(c, displayName);
  // Diffuse la réaction à l'autre (persistée comme message de contrôle type:react).
  _sendReaction(convId, msgId, emoji, op);
}

// Envoie un événement de réaction à Supabase (appliqué chez le destinataire par
// _handleIncomingConvMessage, et rejoué au chargement via supaLoadMessages).
function _sendReaction(convId, msgId, emoji, op) {
  if (typeof supa === "undefined" || !supa || typeof MY_UID === "undefined" || !MY_UID || !window._supaReal) return;
  try {
    var content = JSON.stringify({ type: "react", target: msgId, emoji: emoji, op: op });
    supa.from("conv_messages").insert({ id: "rx_" + uid(), conv_id: convId, from_id: MY_UID, content: content, created_at: new Date().toISOString() }).then(function(){}, function(){});
  } catch(e) {}
}

// Applique un événement de réaction (reçu ou rejoué) à un message d'une conv.
function _applyReactionEvent(c, ev) {
  if (!c || !ev || !ev.target) return;
  var tm = (c.messages || []).find(function(x){ return x.id === ev.target; });
  if (!tm) return;
  tm.reactions = tm.reactions || {};
  if (ev.op === "remove") {
    tm.reactions[ev.emoji] = (tm.reactions[ev.emoji] || 1) - 1;
    if (tm.reactions[ev.emoji] <= 0) delete tm.reactions[ev.emoji];
  } else {
    tm.reactions[ev.emoji] = (tm.reactions[ev.emoji] || 0) + 1;
  }
}

function sendMessageFp(convId, displayName) {
  // 1. Récupérer le texte
  var inp = document.getElementById("convFpInput");
  if (!inp) { console.error("sendMessageFp: input not found"); return; }
  var txt = (inp.value || "").trim();
  if (!txt) return;

  // 2. Vider le champ
  inp.value = "";
  try { inp.style.height = "auto"; } catch(e) {}

  // 3. Fermer les panneaux si disponibles
  try { if (typeof _closeEmojiPanel === "function") _closeEmojiPanel(); } catch(e) {}
  try { if (typeof _closeAttachMenu === "function") _closeAttachMenu(); } catch(e) {}

  // 4. Trouver la conversation
  var convs = getConversations();
  var c = convs.find(function(x) { return x.id === convId; });
  if (!c) { console.error("sendMessageFp: conv not found:", convId); toast("Erreur : conversation introuvable"); return; }

  // 5. Ajouter le message localement (+ contexte de réponse si actif)
  if (!c.messages) c.messages = [];
  var msgId = "msg_" + uid();
  var _localMsg = { id: msgId, from: "me", text: txt, at: Date.now(), status: "sending" };
  var _reply = (window._replyTo && window._replyTo.convId === convId) ? { id: window._replyTo.id, t: window._replyTo.t, n: window._replyTo.n } : null;
  if (_reply) _localMsg.replyTo = _reply;
  c.messages.push(_localMsg);
  c.lastAt = Date.now();
  delete c.draft; // brouillon envoyé
  saveConversations();
  if (window._replyTo) { window._replyTo = null; try { _renderReplyBar(); } catch(e) {} }
  try { _hideMentionBox(); } catch(e) {}
  try { if (c.isGroup) _notifyMentions(c, txt); } catch(e) {} // notifie les @mentionnés

  // 6. Afficher IMMÉDIATEMENT
  renderConvFpThread(c, displayName);
  var thread = document.getElementById("convFpThread");
  if (thread) thread.scrollTop = thread.scrollHeight;
  try { renderMessages(); } catch(e) {}

  // 7. Envoyer à Supabase (statut + file d'attente hors-ligne)
  var _content = _withSenderMeta(txt); // attache le profil actif (persona)
  if (_reply) { try { var _cd = JSON.parse(_content); _cd.rt = _reply; _content = JSON.stringify(_cd); } catch(e) {} }
  _sendTextToSupa(convId, msgId, _content);
}

// ───────── Statut d'envoi + file d'attente hors-ligne ─────────
var OUTBOX_KEY = "passio_outbox_v1";
function _outboxLoad() { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]"); } catch(e) { return []; } }
function _outboxSave(a) { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(a)); } catch(e) {} }
function _outboxAdd(convId, msgId, content) {
  var a = _outboxLoad().filter(function(x){ return x.msgId !== msgId; });
  a.push({ convId: convId, msgId: msgId, content: content, at: Date.now() });
  _outboxSave(a);
}
function _outboxRemove(msgId) { _outboxSave(_outboxLoad().filter(function(x){ return x.msgId !== msgId; })); }

// Met à jour le statut d'un message local et rafraîchit le fil si ouvert.
function _setMsgStatus(convId, msgId, status) {
  var convs = getConversations();
  var c = convs.find(function(x){ return x.id === convId; }); if (!c) return;
  var m = (c.messages || []).find(function(x){ return x.id === msgId; }); if (!m) return;
  m.status = status;
  saveConversations();
  if (window._openedConvId === convId) {
    try { var fp = document.getElementById("conv-fullpage"); renderConvFpThread(c, fp ? fp.getAttribute("data-display-name") : (c.userName||"")); } catch(e) {}
  }
}

// Envoie un message texte/enveloppe à Supabase, gère statut (sending→sent/failed)
// et la file d'attente : hors-ligne ou échec → garde en outbox pour renvoi auto.
function _sendTextToSupa(convId, msgId, content) {
  if (typeof supa === "undefined" || !supa || typeof MY_UID === "undefined" || !MY_UID || !window._supaReal) {
    _setMsgStatus(convId, msgId, "failed"); _outboxAdd(convId, msgId, content); return;
  }
  if (navigator && navigator.onLine === false) {
    _setMsgStatus(convId, msgId, "failed"); _outboxAdd(convId, msgId, content); return;
  }
  supa.from("conv_messages")
    .insert({ id: msgId, conv_id: convId, from_id: MY_UID, content: content, created_at: new Date().toISOString() })
    .then(function(res) {
      if (res && res.error) { _setMsgStatus(convId, msgId, "failed"); _outboxAdd(convId, msgId, content); }
      else { _setMsgStatus(convId, msgId, "sent"); _outboxRemove(msgId); }
    })
    .catch(function() { _setMsgStatus(convId, msgId, "failed"); _outboxAdd(convId, msgId, content); });
}

// Renvoi manuel d'un message en échec.
function _retryMsg(convId, msgId) {
  var item = _outboxLoad().find(function(x){ return x.msgId === msgId; });
  _setMsgStatus(convId, msgId, "sending");
  if (item) _sendTextToSupa(convId, msgId, item.content);
  else { // pas en outbox → re-tenter depuis le texte du message
    var c = getConversations().find(function(x){ return x.id === convId; });
    var m = c && (c.messages||[]).find(function(x){ return x.id === msgId; });
    if (m) { var ct = _withSenderMeta(m.text || ""); _sendTextToSupa(convId, msgId, ct); }
  }
}

// Vide la file d'attente (à la reconnexion ou au boot).
function _flushOutbox() {
  var a = _outboxLoad();
  if (!a.length) return;
  if (navigator && navigator.onLine === false) return;
  a.forEach(function(item){ _setMsgStatus(item.convId, item.msgId, "sending"); _sendTextToSupa(item.convId, item.msgId, item.content); });
}
if (typeof window !== "undefined") {
  window.addEventListener("online", function(){ try { toast("🟢 Connexion rétablie — envoi des messages en attente"); } catch(e){} _flushOutbox(); });
}

// ── Notification sonore ──
function _playMsgSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.25);
  } catch(e) {}
}

// ── Typing indicator ──
let _typingTimeout = null;
let _typingChannel = null;

function onConvInputTyping() {
  const fp = document.getElementById("conv-fullpage");
  if (!fp) return;
  const convId = fp.getAttribute("data-conv-id");
  if (!convId) return;
  _sendTyping(convId);
  clearTimeout(_typingTimeout);
  _typingTimeout = setTimeout(() => _stopTyping(convId), 3000);
  // Brouillon : mémorise le texte non envoyé (debounce léger).
  clearTimeout(_draftTimer);
  _draftTimer = setTimeout(function(){
    var inp = document.getElementById("convFpInput");
    var c = getConversations().find(function(x){ return x.id === convId; });
    if (!inp || !c) return;
    var v = inp.value || "";
    if (v.trim()) c.draft = v; else delete c.draft;
    saveConversations();
  }, 350);
  // Mentions @ (groupes uniquement)
  try { _mentionDetect(convId); } catch(e) {}
}
var _draftTimer = null;

// ───────── Mentions @ dans les groupes ─────────
function _hideMentionBox() { var b = document.getElementById("convMentionBox"); if (b) b.remove(); }
function _mentionDetect(convId) {
  var c = getConversations().find(function(x){ return x.id === convId; });
  if (!c || !c.isGroup) { _hideMentionBox(); return; }
  var inp = document.getElementById("convFpInput"); if (!inp) return;
  var val = (inp.value || "").slice(0, inp.selectionStart || (inp.value||"").length);
  var mt = val.match(/@([\wà-öø-ÿ' -]{0,20})$/i);
  if (!mt) { _hideMentionBox(); return; }
  var q = (mt[1] || "").toLowerCase().trim();
  var members = (c.userIds || []).map(function(id){ return { id: id, name: (typeof _groupMemberName === "function" ? _groupMemberName(id) : "Membre") }; })
    .filter(function(m){ return !q || m.name.toLowerCase().indexOf(q) > -1; }).slice(0, 6);
  if (!members.length) { _hideMentionBox(); return; }
  var toolbar = document.querySelector("#conv-fullpage .conv-toolbar"); if (!toolbar) return;
  var box = document.getElementById("convMentionBox");
  if (!box) { box = document.createElement("div"); box.id = "convMentionBox"; box.style.cssText = "position:absolute;bottom:100%;left:8px;right:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;box-shadow:0 -4px 20px rgba(0,0,0,0.18);max-height:200px;overflow-y:auto;z-index:30;margin-bottom:6px;"; toolbar.style.position = "relative"; toolbar.appendChild(box); }
  box.innerHTML = members.map(function(m){
    return '<div onclick="_pickMention(\'' + String(m.name).replace(/'/g,"\\'") + '\')" style="display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);">' +
      '<span style="width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;">' + escapeHtml(String(m.name).charAt(0).toUpperCase()) + '</span>' +
      '<span style="font-size:13px;font-weight:600;">' + escapeHtml(m.name) + '</span></div>';
  }).join("");
}
function _pickMention(name) {
  var inp = document.getElementById("convFpInput"); if (!inp) return;
  var pos = inp.selectionStart || inp.value.length;
  var before = inp.value.slice(0, pos).replace(/@([\wà-öø-ÿ' -]{0,20})$/i, "@" + name + " ");
  inp.value = before + inp.value.slice(pos);
  _hideMentionBox();
  inp.focus();
  try { autoResizeTextarea(inp); } catch(e) {}
}
// Notifie les membres mentionnés (@nom) dans un message de groupe.
function _notifyMentions(c, text) {
  if (!c || !c.isGroup || !text || text.indexOf("@") < 0) return;
  if (typeof supaInsertNotif !== "function") return;
  var low = text.toLowerCase();
  (c.userIds || []).forEach(function(id){
    var name = (typeof _groupMemberName === "function" ? _groupMemberName(id) : "");
    if (name && low.indexOf("@" + name.toLowerCase()) > -1) {
      try { supaInsertNotif(id, "mention", c.id, "t'a mentionné dans « " + (c.groupName || "un groupe") + " »"); } catch(e) {}
    }
  });
}

function _sendTyping(convId) {
  if (!_typingChannel) return;
  try { _typingChannel.send({ type: "broadcast", event: "typing", payload: { user: currentProfile()?.name || state.user.name || "Quelqu'un" } }); } catch(e) {}
}

function _stopTyping(convId) {
  clearTimeout(_typingTimeout);
  if (!_typingChannel) return;
  try { _typingChannel.send({ type: "broadcast", event: "stop_typing", payload: {} }); } catch(e) {}
}

function _subscribeTyping(convId) {
  if (typeof supa === "undefined" || !supa) return;
  if (_typingChannel) { try { supa.removeChannel(_typingChannel); } catch(e) {} _typingChannel = null; }
  _typingChannel = supa.channel("typing:" + convId)
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      const bar = document.getElementById("convTypingBar");
      if (bar) { bar.textContent = (payload.user || "Quelqu'un") + " est en train d'écrire…"; bar.style.display = "block"; }
      clearTimeout(bar?._hideTimer);
      if (bar) bar._hideTimer = setTimeout(() => { bar.style.display = "none"; }, 4000);
    })
    .on("broadcast", { event: "stop_typing" }, () => {
      const bar = document.getElementById("convTypingBar");
      if (bar) bar.style.display = "none";
    })
    .subscribe();
}

// Canal Supabase filtré par conv_id (réception instantanée sans aller-retour JS)
let _supaConvChannel = null;
function _supaConvSpecificChannel(convId, displayName) {
  if (typeof supa === "undefined" || !supa) return;
  // v3 : le topic privé par utilisateur (abonné une fois au boot) couvre déjà
  // cette conv → rien à faire à l'ouverture.
  if (window.PASSIO_REALTIME_V3) return;
  // v2 : la réception passe par le canal PRIVÉ de la conv (abonné au boot / à
  // la création). On s'assure juste qu'il existe — pas de postgres_changes.
  if (window.PASSIO_REALTIME_V2) {
    if (window._subscribePrivateConv) window._subscribePrivateConv(convId);
    return;
  }
  if (_supaConvChannel) { try { supa.removeChannel(_supaConvChannel); } catch(e) {} _supaConvChannel = null; }
  _supaConvChannel = supa.channel("conv_specific:" + convId)
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "conv_messages",
      filter: "conv_id=eq." + convId   // filtre côté Supabase → seuls les messages de CETTE conv arrivent
    }, async function(payload) {
      const r = payload.new;
      if (!r || r.from_id === MY_UID) return; // ignorer nos propres messages (déjà ajoutés en local)
      if (window._openedConvId !== convId) return; // race condition guard

      // Profil depuis cache (0 requête si déjà connu)
      const prof = await _fetchProfile(r.from_id);
      const newMsg = { id: r.id, from: r.from_id, fromName: prof.username, fromEmoji: prof.emoji, text: r.content, at: supaTs(r.created_at) };

      const convs = getConversations();
      const c = convs.find(x => x.id === convId);
      if (!c) return;
      if (!c.messages) c.messages = [];
      if (c.messages.find(m => m.id === r.id)) return; // déjà présent
      c.messages.push(newMsg);
      c.lastAt = newMsg.at;
      c._otherRead = true; // la conv est ouverte → l'utilisateur a lu
      saveConversations();
      if (window._openedConvId === convId) renderConvFpThread(c, displayName);
      renderMessages();
    })
    .subscribe();
}

function closeConversation() {
  window._openedConvId = null;
  if (_typingChannel) { try { supa.removeChannel(_typingChannel); } catch(e) {} _typingChannel = null; }
  if (_supaConvChannel) { try { supa.removeChannel(_supaConvChannel); } catch(e) {} _supaConvChannel = null; }
  clearTimeout(_typingTimeout);
  saveConversationsNow(); // sauvegarde immédiate en quittant
  const bar = document.getElementById("convTypingBar");
  if (bar) bar.style.display = "none";
  const fp = document.getElementById("conv-fullpage");
  if (fp) fp.classList.remove("active");
  // Refermer les panneaux glissants pour ne pas les retrouver ouverts dans la prochaine conversation
  document.getElementById("convSettingsPanel")?.classList.remove("open");
  document.getElementById("convFilesPanel")?.classList.remove("open");
  renderMessages();
}

// ===== CONFIGURATEUR — personnalisation de l'app =====
const ACCENT_COLORS = [
  { id: "violet", name: "Violet", emoji: "💜", accent: "#7c3aed", soft: "#8b5cf6", c2: "#6d28d9", c2s: "#7c3aed", c3: "#5b21b6", c3s: "#6d28d9", c4: "#a78bfa", c4s: "#c4b5fd", c5: "#c4b5fd", c5s: "#ddd6fe", bgDeep: "#e9e4f8", bgSoft: "#f3f0fb", border: "rgba(24,18,48,0.07)", borderStrong: "rgba(24,18,48,0.12)", shadow: "124,58,237", grad1: "linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)", grad2: "linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%)" },
  { id: "rose", name: "Rose", emoji: "🩷", accent: "#ec4899", soft: "#f472b6", c2: "#db2777", c2s: "#ec4899", c3: "#be185d", c3s: "#db2777", c4: "#f472b6", c4s: "#fbcfe8", c5: "#fbcfe8", c5s: "#fce7f3", bgDeep: "#fce7f3", bgSoft: "#fdf2f8", border: "rgba(236,72,153,0.18)", borderStrong: "rgba(236,72,153,0.32)", shadow: "236,72,153", grad1: "linear-gradient(135deg,#fbcfe8 0%,#ec4899 50%,#be185d 100%)", grad2: "linear-gradient(135deg,#f472b6 0%,#db2777 100%)" },
  { id: "bleu", name: "Bleu", emoji: "🩵", accent: "#0ea5e9", soft: "#38bdf8", c2: "#0284c7", c2s: "#0ea5e9", c3: "#0369a1", c3s: "#0284c7", c4: "#38bdf8", c4s: "#bae6fd", c5: "#bae6fd", c5s: "#e0f2fe", bgDeep: "#e0f2fe", bgSoft: "#f0f9ff", border: "rgba(14,165,233,0.18)", borderStrong: "rgba(14,165,233,0.32)", shadow: "14,165,233", grad1: "linear-gradient(135deg,#bae6fd 0%,#0ea5e9 50%,#0369a1 100%)", grad2: "linear-gradient(135deg,#38bdf8 0%,#0284c7 100%)" },
  { id: "vert", name: "Vert", emoji: "💚", accent: "#10b981", soft: "#34d399", c2: "#059669", c2s: "#10b981", c3: "#047857", c3s: "#059669", c4: "#34d399", c4s: "#a7f3d0", c5: "#a7f3d0", c5s: "#d1fae5", bgDeep: "#d1fae5", bgSoft: "#ecfdf5", border: "rgba(16,185,129,0.18)", borderStrong: "rgba(16,185,129,0.32)", shadow: "16,185,129", grad1: "linear-gradient(135deg,#a7f3d0 0%,#10b981 50%,#047857 100%)", grad2: "linear-gradient(135deg,#34d399 0%,#059669 100%)" },
  { id: "orange", name: "Orange", emoji: "🧡", accent: "#f59e0b", soft: "#fbbf24", c2: "#d97706", c2s: "#f59e0b", c3: "#b45309", c3s: "#d97706", c4: "#fbbf24", c4s: "#fde68a", c5: "#fde68a", c5s: "#fef3c7", bgDeep: "#fef3c7", bgSoft: "#fffbeb", border: "rgba(245,158,11,0.18)", borderStrong: "rgba(245,158,11,0.32)", shadow: "245,158,11", grad1: "linear-gradient(135deg,#fde68a 0%,#f59e0b 50%,#b45309 100%)", grad2: "linear-gradient(135deg,#fbbf24 0%,#d97706 100%)" },
  { id: "rouge", name: "Rouge", emoji: "❤️", accent: "#ef4444", soft: "#f87171", c2: "#dc2626", c2s: "#ef4444", c3: "#b91c1c", c3s: "#dc2626", c4: "#f87171", c4s: "#fecaca", c5: "#fecaca", c5s: "#fee2e2", bgDeep: "#fee2e2", bgSoft: "#fef2f2", border: "rgba(239,68,68,0.18)", borderStrong: "rgba(239,68,68,0.32)", shadow: "239,68,68", grad1: "linear-gradient(135deg,#fecaca 0%,#ef4444 50%,#b91c1c 100%)", grad2: "linear-gradient(135deg,#f87171 0%,#dc2626 100%)" },
  { id: "noir", name: "Sombre", emoji: "🖤", accent: "#6366f1", soft: "#818cf8", c2: "#4f46e5", c2s: "#6366f1", c3: "#4338ca", c3s: "#4f46e5", c4: "#818cf8", c4s: "#c7d2fe", c5: "#c7d2fe", c5s: "#e0e7ff", bgDeep: "#1e1b4b", bgSoft: "#1e1b36", border: "rgba(99,102,241,0.25)", borderStrong: "rgba(99,102,241,0.40)", shadow: "99,102,241", grad1: "linear-gradient(135deg,#c7d2fe 0%,#6366f1 50%,#4338ca 100%)", grad2: "linear-gradient(135deg,#818cf8 0%,#4f46e5 100%)", dark: true },
];

const FONT_SIZES = [
  { id: "small", name: "Petit", px: 13 },
  { id: "medium", name: "Moyen", px: 14 },
  { id: "large", name: "Grand", px: 16 },
  { id: "xlarge", name: "Très grand", px: 18 },
];

const FONT_FAMILIES = [
  { id: "default", name: "Par défaut", family: "system-ui, -apple-system, sans-serif" },
  { id: "inter", name: "Inter", family: "'Inter', sans-serif", url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" },
  { id: "poppins", name: "Poppins", family: "'Poppins', sans-serif", url: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" },
  { id: "nunito", name: "Nunito", family: "'Nunito', sans-serif", url: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" },
  { id: "space", name: "Space Grotesk", family: "'Space Grotesk', sans-serif", url: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap" },
  { id: "outfit", name: "Outfit", family: "'Outfit', sans-serif", url: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap" },
  { id: "playfair", name: "Playfair Display", family: "'Playfair Display', serif", url: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&display=swap" },
  { id: "caveat", name: "Caveat", family: "'Caveat', cursive", url: "https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&display=swap" },
  { id: "righteous", name: "Righteous", family: "'Righteous', cursive", url: "https://fonts.googleapis.com/css2?family=Righteous&display=swap" },
  { id: "quicksand", name: "Quicksand", family: "'Quicksand', sans-serif", url: "https://fonts.googleapis.com/css2?family=Quicksand:wght@400;600;700&display=swap" },
  { id: "comfortaa", name: "Comfortaa", family: "'Comfortaa', cursive", url: "https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;600;700&display=swap" },
  { id: "oswald", name: "Oswald", family: "'Oswald', sans-serif", url: "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap" },
  { id: "dancing", name: "Dancing Script", family: "'Dancing Script', cursive", url: "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;600;700&display=swap" },
  { id: "mono", name: "JetBrains Mono", family: "'JetBrains Mono', monospace", url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&display=swap" },
  { id: "bitter", name: "Bitter", family: "'Bitter', serif", url: "https://fonts.googleapis.com/css2?family=Bitter:wght@400;600;700;800&display=swap" },
  { id: "fredoka", name: "Fredoka", family: "'Fredoka', sans-serif", url: "https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap" },
];
