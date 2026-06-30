// Liste partagée d'emojis disponibles dans tous les pickers de l'app
window._PASSIO_EMOJI_LIST = [
  // Émotions / visages
  "😂","😍","🥰","😊","😎","🤩","😆","😅","🤣","😭","😤","🤯","😜","😏","🫶",
  // Amour / cœurs
  "❤️","💕","💖","💗","💓","💞","🖤","💛","💚","💙","💜","🤍","🧡",
  // Réactions classiques
  "👍","👎","👏","🙌","💪","🤜","🫡","🤔","💯","🔥","✨","🌟","⭐","🎉","🎊",
  // Nature / objets / fun
  "🌈","🦋","🌸","🍀","🚀","🎵","🎶","🎯","🏆","📸","🌙","☀️","🍕","🍔","🎮",
  // Divers expressifs
  "💀","👀","🫠","🥲","🤌","💅","🫶","🙏","✌️","🤞",
];

// ════════════════════════════════════════════════════════════════
// API GIF (backlog #5) — Tenor v2 ou Giphy, avec fallback hors-ligne.
// 👉 POUR ACTIVER : coller la clé ci-dessous (une seule ligne à changer).
//    Tenor : console.cloud.google.com → activer « Tenor API » → Identifiants → Clé API
//    Giphy : developers.giphy.com → Create an API Key
// Sans clé (ou si l'API échoue), l'app retombe sur les listes locales — rien ne casse.
// ⚠️ CSP : tenor.googleapis.com et api.giphy.com doivent rester autorisés dans
//    connect-src (netlify.toml + _headers).
window.PASSIO_GIF_API = {
  provider: "giphy", // "tenor" ou "giphy"
  key: "u28ANom3fQTKp1KmOtVXhJcjRTRTXkBE" // clé Web Giphy (publique, côté client — comme la clé anon Supabase)
};

// Liste de secours (les 26 GIFs historiques dédupliqués) — utilisée sans clé ou hors-ligne.
var PASSIO_DEFAULT_GIFS = ["https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif","https://media.giphy.com/media/xT9IgG50Lg7rusjtG8/giphy.gif","https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif","https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif","https://media.giphy.com/media/3oz8xAFtqoOUUrsh7W/giphy.gif","https://media.giphy.com/media/l4FGGafcOHmrlQxG0/giphy.gif","https://media.giphy.com/media/3ohzdKdb7d1bbVwnQU/giphy.gif","https://media.giphy.com/media/l0HlFZ3c8HWDRlCharepI/giphy.gif","https://media.giphy.com/media/FW8aI0tXVE8gKxYvRc/giphy.gif","https://media.giphy.com/media/l0Iy1Z8oW4fvfBLh2/giphy.gif","https://media.giphy.com/media/l0HlDtKUoRb0x8bDy/giphy.gif","https://media.giphy.com/media/l0Iy0QcSoQYQW3SWHf/giphy.gif","https://media.giphy.com/media/l0MYr7jgMgWI8ouOI/giphy.gif","https://media.giphy.com/media/l0HlSY9x8FZo0XO1i/giphy.gif","https://media.giphy.com/media/l4Jz3a8jO92crOLXy/giphy.gif","https://media.giphy.com/media/l0HlF5j3QRG5pxPAI/giphy.gif","https://media.giphy.com/media/3o7TKU8j7Yt9R2xNMY/giphy.gif","https://media.giphy.com/media/l0MYM8m02D0c3PoFi/giphy.gif","https://media.giphy.com/media/RH16FlVXbaAzS/giphy.gif","https://media.giphy.com/media/l46Ce3kKMKxvEiFZS/giphy.gif","https://media.giphy.com/media/l0HlHJJxcNHFqyvrm/giphy.gif","https://media.giphy.com/media/JIX9RbDfLvbl2/giphy.gif","https://media.giphy.com/media/l0HlQaQ6gWfllcjDO/giphy.gif","https://media.giphy.com/media/l3q2K6HIuvsGyp7UE/giphy.gif","https://media.giphy.com/media/l0HlMMaQ5vJ7lKOmY/giphy.gif","https://media.giphy.com/media/l4FgUMgdCHHBFcGe88/giphy.gif"];

// Recherche de GIFs (tendances si query vide) → Promise<string[]> d'URLs.
// Cache mémoire 10 min par requête pour économiser le quota.
var _gifCache = {};
function passioFetchGifs(query, limit) {
  limit = limit || 24;
  var q = (query || "").trim();
  var cfg = window.PASSIO_GIF_API || {};
  if (!cfg.key) return Promise.resolve(PASSIO_DEFAULT_GIFS.slice(0, limit));
  var cacheKey = cfg.provider + ":" + q.toLowerCase() + ":" + limit;
  var hit = _gifCache[cacheKey];
  if (hit && Date.now() - hit.at < 600000) return Promise.resolve(hit.urls);
  var url;
  if (cfg.provider === "giphy") {
    url = q
      ? "https://api.giphy.com/v1/gifs/search?api_key=" + encodeURIComponent(cfg.key) + "&q=" + encodeURIComponent(q) + "&limit=" + limit + "&rating=pg-13&lang=fr"
      : "https://api.giphy.com/v1/gifs/trending?api_key=" + encodeURIComponent(cfg.key) + "&limit=" + limit + "&rating=pg-13";
  } else {
    url = q
      ? "https://tenor.googleapis.com/v2/search?key=" + encodeURIComponent(cfg.key) + "&q=" + encodeURIComponent(q) + "&limit=" + limit + "&media_filter=tinygif,gif&locale=fr_FR&contentfilter=medium"
      : "https://tenor.googleapis.com/v2/featured?key=" + encodeURIComponent(cfg.key) + "&limit=" + limit + "&media_filter=tinygif,gif&locale=fr_FR&contentfilter=medium";
  }
  return fetch(url)
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (data) {
      var urls;
      if (cfg.provider === "giphy") {
        urls = (data.data || []).map(function (g) {
          var i = g.images && (g.images.fixed_height || g.images.original);
          return i && i.url;
        }).filter(Boolean);
      } else {
        urls = (data.results || []).map(function (g) {
          var mf = g.media_formats || {};
          return (mf.tinygif || mf.gif || {}).url;
        }).filter(Boolean);
      }
      if (!urls.length) return PASSIO_DEFAULT_GIFS.slice(0, limit);
      _gifCache[cacheKey] = { at: Date.now(), urls: urls };
      return urls;
    })
    .catch(function () { return PASSIO_DEFAULT_GIFS.slice(0, limit); });
}
window.passioFetchGifs = passioFetchGifs;

// Panneau GIF générique : recherche + grille, rempli via passioFetchGifs.
// opts = { id, onPick(url), position (css fixe), cols, cell, keepOpenFor (id de bouton) }
function passioGifPanel(opts) {
  var old = document.getElementById(opts.id);
  if (old) { old.remove(); return null; } // toggle : 2e clic = fermer
  var cols = opts.cols || 4, cell = opts.cell || 90;
  var panel = document.createElement("div");
  panel.id = opts.id;
  var _z = opts.z || 10000; // surclassable : un composeur ouvert depuis un modal (10001) doit passer au-dessus
  panel.style.cssText = "position:fixed;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:10px;z-index:" + _z + ";box-shadow:0 4px 16px rgba(0,0,0,0.25);" + (opts.position || "bottom:120px;right:20px;");
  var search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Rechercher un GIF…";
  search.setAttribute("aria-label", "Rechercher un GIF");
  search.style.cssText = "width:100%;box-sizing:border-box;margin-bottom:8px;padding:8px 12px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg-deep);color:var(--text);font-size:16px;outline:none;";
  var grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(" + cols + "," + cell + "px);gap:8px;max-height:340px;overflow-y:auto;";
  panel.appendChild(search);
  panel.appendChild(grid);

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
      cellEl.style.cssText = "width:" + cell + "px;height:" + cell + "px;background:var(--bg-soft);border-radius:6px;overflow:hidden;cursor:pointer;border:1px solid var(--border);transition:border-color 0.15s;";
      var img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.src = gifUrl;
      img.alt = "GIF";
      img.style.cssText = "width:100%;height:100%;object-fit:cover;";
      cellEl.appendChild(img);
      cellEl.onmouseover = function () { this.style.borderColor = "var(--accent)"; };
      cellEl.onmouseout = function () { this.style.borderColor = "var(--border)"; };
      cellEl.onclick = function (evt) {
        evt.stopPropagation();
        evt.preventDefault();
        opts.onPick(gifUrl);
        panel.remove();
      };
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
  search.onclick = function (e) { e.stopPropagation(); };

  document.body.appendChild(panel);
  setTimeout(function () {
    var closeListener = function (e) {
      if (!panel.contains(e.target) && (!opts.keepOpenFor || e.target.id !== opts.keepOpenFor)) {
        panel.remove();
        document.removeEventListener("click", closeListener);
      }
    };
    document.addEventListener("click", closeListener);
  }, 50);
  return panel;
}
window.passioGifPanel = passioGifPanel;
// ════════════════════════════════════════════════════════════════

window.toggleEmojiPanel = function() {
  var p = document.getElementById("convEmojiPanel");
  if(!p) return;
  p.classList.toggle("open");
  // Remplissage (lazy) de la grille GIF à la première ouverture — via l'API si clé.
  if (p.classList.contains("open") && !p._gifFilled) {
    p._gifFilled = true;
    if (window._fillEmojiGifGrid) window._fillEmojiGifGrid("");
  }
};

window.switchEmojiTab = function(t,b) {
  document.querySelectorAll("#emojiTopBar button").forEach(x => x.style.background="transparent");
  b.style.background="#7c3aed";
  var e = document.getElementById("emojiTabContent");
  var g = document.getElementById("gifTabContent");
  if(t==="emoji") {
    e.style.display="flex";
    g.style.display="none";
  } else {
    e.style.display="none";
    g.style.display="flex";
  }
};

// Populate emoji grid - TRÈS COMPACT
var emojiList = "😀😁😂🤣😃😄😅😆😉😊😇🥰😍😘😗😚😙🥲😋😛😜🤪😌😔😑😐😶😏😒🙄😬🤐😷🤒🤕🤮🤧🤥🤓😎😕😟🙁☹️😮😯😲😳😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽👾🤖😺😸😹😻😼😽🙀😿😾🙈🙉🙊❤️🧡💛💚💙💜🖤🤍🤎💔💕💞💓💗💖💘💝💟👋🤚🖐️✋🖖👌🤌🤏✌️🤞🫰🤟🤘🤙👍👎✊👊🤛🤜👏🙌👐🤲🤝🎉🎊🎈🎁🔥💯✨⭐🌟👀🎯🎭🎨🎬🎤🎧🎼🎹🥁🎷🎺🎸🎻🌈☀️🌙⭐✨💫🌟🎊🎉";
var grid = document.getElementById("emojiGrid");
if(grid) {
  grid.style.gap = "0px";
  grid.style.gridTemplateColumns = "repeat(12,1fr)";
  for(var i=0; i < emojiList.length; i++) {
    var d = document.createElement("div");
    d.textContent = emojiList[i];
    d.style.cssText = "font-size:12px;padding:0px;cursor:pointer;text-align:center;line-height:1;";
    d.onclick = function(e) {
      if(window.insertEmoji) window.insertEmoji(e.target.textContent);
      window.toggleEmojiPanel();
    };
    grid.appendChild(d);
  }
}

// Grille GIF du panneau emoji — remplie en LAZY à la première ouverture
// (toggleEmojiPanel) via passioFetchGifs : API si clé, sinon liste locale.
// 🔧 PERF : plus aucun GIF chargé au boot (avant : 26 requêtes Giphy à vide).
window._fillEmojiGifGrid = function(query) {
  var gifGrid = document.getElementById("gifGrid");
  if (!gifGrid) return;
  passioFetchGifs(query || "", 26).then(function(urls) {
    gifGrid.innerHTML = "";
    urls.forEach(function(url) {
      var d = document.createElement("div");
      d.style.cssText = "width:100%;height:120px;border-radius:8px;overflow:hidden;cursor:pointer;";
      var img = document.createElement("img");
      img.loading = "lazy"; // 🔧 PERF : ne charge que les GIFs visibles
      img.src = url;
      img.style.cssText = "width:100%;height:100%;object-fit:cover;";
      img.onclick = function() {
        if(window._sendGif) window._sendGif(url);
        window.toggleEmojiPanel();
      };
      d.appendChild(img);
      gifGrid.appendChild(d);
    });
  });
};

// ASSIGNATION: _sendGif vers window._sendGif (utilise la version avec diags ci-dessus)
window._sendGif = _sendGif;

// Click outside to close
document.addEventListener("click", function(e) {
  // Fermer emoji panel
  var p = document.getElementById("convEmojiPanel");
  var b = document.getElementById("btnEmoji");
  if(p && p.classList.contains("open") && !p.contains(e.target) && (!b || !b.contains(e.target))) {
    p.classList.remove("open");
  }

  // Fermer attach menu
  var m = document.getElementById("convAttachMenu");
  var a = document.getElementById("btnAttach");
  if(m && m.classList.contains("open") && !m.contains(e.target) && (!a || !a.contains(e.target))) {
    m.classList.remove("open");
    a?.classList.remove("active");
  }
});

// ===== FONCTIONS COMMENTAIRES =====
function likeComment(postId, commentId, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  _diag("❤️ likeComment(" + postId + ", " + commentId + ")");
  var thread = (typeof _findCommentThread === "function") ? _findCommentThread(postId) : null;
  if (!thread && typeof findPostAnywhere === "function") { var _p = findPostAnywhere(postId); if (_p) thread = { comments: _p.comments || [], save: function(){ try{saveState();}catch(e){} } }; }
  if (!thread) { _diag("❌ Thread not found"); return false; }
  var comment = thread.comments.find(c => c.id === commentId);
  if (!comment) { _diag("❌ Comment not found"); return false; }
  // Initialiser les propriétés manquantes
  if (!comment.likes) comment.likes = 0;
  if (!comment.likedBy) comment.likedBy = [];
  if (!comment.replies) comment.replies = [];
  if (!comment.emojis) comment.emojis = [];

  var meId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : (state.user?.id || "me");
  var already = comment.likedBy.indexOf(meId) > -1;
  if (already) {
    comment.likedBy = comment.likedBy.filter(function(x){ return x !== meId; });
    comment.likes = Math.max(0, (comment.likes || 1) - 1);
    if (typeof supaCommentRemoveLike === "function") supaCommentRemoveLike(commentId);
  } else {
    comment.likes = (comment.likes || 0) + 1;
    comment.likedBy.push(meId);
    if (typeof supaCommentInteract === "function") supaCommentInteract(commentId, postId, "like", "");
    // Notifie l'auteur du commentaire (interaction cross-compte).
    if (comment.authorId && comment.authorId !== meId && comment.fromSupabase && typeof supaInsertNotif === "function") {
      try { supaInsertNotif(comment.authorId, "like", postId, "a aimé ton commentaire"); } catch(e) {}
    }
  }
  _diag("✅ Like toggle: " + comment.likes + " likes");
  if (typeof thread.save === "function") thread.save(); else saveState();

  // Update visuel du like
  var commentEl = document.querySelector('[data-commentid="' + commentId + '"]');
  if (commentEl) {
    var likeBtn = commentEl.querySelector('.comment-actions .comment-action');
    if (likeBtn) {
      likeBtn.classList.toggle('liked', !already);
      likeBtn.innerHTML = (already ? '🤍 ' : '❤️ ') + comment.likes;
    }
  }
  return false;
}

function replyToComment(postId, commentId, authorName, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  _diag("💬 replyToComment(" + postId + ", " + commentId + ")");
  var existingInputs = document.querySelectorAll(".comment-reply-input");
  existingInputs.forEach(function(input) { input.remove(); });
  var inputDiv = document.createElement("div");
  inputDiv.className = "comment-reply-input";
  inputDiv.style.cssText = "margin-top:12px;display:flex;gap:6px;padding:10px;background:var(--bg-soft);border-radius:8px;border:2px solid var(--accent);animation:fadeIn 0.3s ease;";
  var inputField = document.createElement("input");
  inputField.type = "text";
  inputField.placeholder = "Répondre à " + authorName + "…";
  inputField.style.cssText = "flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:12px;font-size:13px;box-sizing:border-box;";
  var sendBtn = document.createElement("button");
  sendBtn.textContent = "✓";
  sendBtn.style.cssText = "width:32px;height:32px;border-radius:8px;background:var(--accent);color:#fff;border:none;cursor:pointer;font-weight:bold;";
  sendBtn.onclick = function(e) {
    e.stopPropagation();
    var replyText = inputField.value.trim();
    if (!replyText) return;
    _diag("📝 Submitting reply");
    var thread = (typeof _findCommentThread === "function") ? _findCommentThread(postId) : null;
    if (!thread && typeof findPostAnywhere === "function") { var _p = findPostAnywhere(postId); if (_p) thread = { comments: _p.comments || [], save: function(){ try{saveState();}catch(e){} } }; }
    if (!thread) { _diag("❌ Thread not found"); return; }
    var comment = thread.comments.find(c => c.id === commentId);
    if (!comment) { _diag("❌ Comment not found"); return; }
    // Initialiser les propriétés manquantes
    if (!comment.replies) comment.replies = [];
    if (!comment.likes) comment.likes = 0;
    if (!comment.likedBy) comment.likedBy = [];
    if (!comment.emojis) comment.emojis = [];

    var _meId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : (state.user?.id || "me");
    var newReply = { id: "reply_" + Date.now(), authorId: _meId, text: replyText, createdAt: Date.now() };
    comment.replies.push(newReply);
    _diag("✅ Reply added");
    if (typeof thread.save === "function") thread.save(); else saveState();
    // Sync Supabase → la réponse apparaît chez tous les comptes.
    if (typeof supaCommentInteract === "function") supaCommentInteract(commentId, postId, "reply", replyText);
    if (comment.authorId && comment.authorId !== _meId && comment.fromSupabase && typeof supaInsertNotif === "function") {
      try { supaInsertNotif(comment.authorId, "comment", postId, "a répondu à ton commentaire"); } catch(e) {}
    }
    inputDiv.remove();

    // Créer ou mettre à jour le div replies
    var repliesDiv = document.getElementById("replies-" + commentId);
    if (!repliesDiv) {
      // Créer le div replies s'il n'existe pas
      repliesDiv = document.createElement("div");
      repliesDiv.className = "comment-replies";
      repliesDiv.id = "replies-" + commentId;
      repliesDiv.style.cssText = "display:none;";
      var commentBody = document.querySelector('[data-commentid="' + commentId + '"] .comment-body');
      if (commentBody) commentBody.appendChild(repliesDiv);
    }

    // Ajouter la nouvelle réponse au div — avec vrai pseudo et avatar
    var _meUser = (typeof userById === "function") ? (userById(_meId) || {}) : {};
    var _meProf = (typeof currentProfile === "function") ? (currentProfile() || {}) : {};
    var _meName = _meUser.name || _meProf.name || state.user?.name || "Moi";
    // Filtrer les sentinelles génériques
    if (_meName === "Passionné" || _meName === "Profil" || _meName === "Moi" || !_meName) {
      var _gen = typeof state !== "undefined" && state.user?.name;
      if (_gen && _gen !== "Passionné" && _gen !== "Profil") _meName = _gen;
    }
    var _meAvObj = { avatar: _meUser.avatar || _meProf.color || "#8b5cf6", profileEmoji: _meUser.profileEmoji || _meProf.emoji || "✨", name: _meName, photoUrl: _meUser.photoUrl || _meProf.photoUrl || null };
    var replyEl = document.createElement("div");
    replyEl.className = "comment-reply";
    replyEl.style.cssText = "display:flex;align-items:flex-start;gap:8px;padding:6px 0;";
    replyEl.innerHTML = '<div class="avatar sm" style="background:' + avatarBg(_meAvObj) + ';flex-shrink:0;">' + avatarInner(_meAvObj) + '</div>' +
      '<div><span class="comment-reply-author" style="font-size:11px;font-weight:600;color:var(--text);">' + escapeHtml(_meName) + '</span> ' + escapeHtml(replyText) +
      '<div style="font-size:10px;color:var(--muted);margin-top:2px;">À l\'instant</div></div>';
    repliesDiv.appendChild(replyEl);

    // Créer ou mettre à jour le bouton réponse
    var replyCountBtn = document.querySelector('[data-commentid="' + commentId + '"] .comment-reply-count');
    if (!replyCountBtn) {
      // Créer le bouton s'il n'existe pas
      replyCountBtn = document.createElement("span");
      replyCountBtn.className = "comment-reply-count";
      replyCountBtn.style.cssText = "cursor:pointer;font-size:12px;color:var(--accent);margin-left:8px;";
      replyCountBtn.onclick = function(e) { e.stopPropagation(); toggleCommentReplies(commentId, e); };
      var commentActions = document.querySelector('[data-commentid="' + commentId + '"] .comment-actions');
      if (commentActions) commentActions.appendChild(replyCountBtn);
    }
    // Mettre à jour le nombre de réponses
    replyCountBtn.textContent = "▲ Masquer les réponses";
    _diag("✅ Reply button updated");

    // AFFICHER LES REPLIES AUTOMATIQUEMENT
    if (repliesDiv && repliesDiv.style.display === "none") {
      repliesDiv.style.display = "block";
      _diag("✅ Replies displayed automatically");
    }
  };
  inputField.onkeypress = function(e) { if (e.key === 'Enter') sendBtn.click(); };
  inputDiv.appendChild(inputField);
  inputDiv.appendChild(sendBtn);
  var commentElement = document.querySelector('[data-commentid="' + commentId + '"]');
  _diag("🔍 Looking for commentId: " + commentId);
  _diag("🔍 Found element: " + (commentElement ? "YES" : "NO"));
  if (commentElement) {
    var commentBody = commentElement.querySelector(".comment-body");
    _diag("🔍 Found comment-body: " + (commentBody ? "YES" : "NO"));
    if (commentBody) {
      // Insérer APRÈS les comment-actions (pas à la fin)
      var commentActions = commentBody.querySelector(".comment-actions");
      if (commentActions) {
        commentActions.parentNode.insertBefore(inputDiv, commentActions.nextSibling);
        _diag("✅ Input inserted AFTER comment-actions");
      } else {
        commentBody.appendChild(inputDiv);
        _diag("✅ Input inserted at end of body");
      }

      inputField.focus();

      // Scroll pour rendre l'input visible
      setTimeout(function() {
        inputDiv.scrollIntoView({ behavior: "smooth", block: "center" });
        _diag("📍 Scrolled to input");
      }, 100);
    } else {
      _diag("❌ Comment body not found!");
    }
  } else {
    _diag("❌ Comment element not found!");
  }
  return false;
}

function toggleCommentReplies(commentId, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  _diag("📂 toggleCommentReplies(" + commentId + ")");
  var repliesDiv = document.getElementById("replies-" + commentId);
  var btn = document.querySelector('[data-commentid="' + commentId + '"] .comment-reply-count');
  if (repliesDiv) {
    var isHidden = repliesDiv.style.display === "none" || repliesDiv.style.display === "";
    repliesDiv.style.display = isHidden ? "block" : "none";
    if (btn) {
      var count = repliesDiv.querySelectorAll(".comment-reply").length;
      btn.textContent = isHidden
        ? "▲ Masquer les réponses"
        : "▼ " + count + " réponse" + (count > 1 ? "s" : "");
    }
    _diag("✅ Replies toggled");
  }
  return false;
}

function toggleCommentEmojis(commentId, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  _diag("😊 toggleCommentEmojis(" + commentId + ")");
  var emojisDiv = document.getElementById("emojis-" + commentId);
  if (emojisDiv) {
    emojisDiv.style.display = emojisDiv.style.display === "none" ? "block" : "none";
    _diag("✅ Emojis toggled");
  }
  return false;
}

function showGifPickerForMessage() {
  // Panneau générique branché sur l'API GIF (recherche incluse, fallback local)
  passioGifPanel({
    id: "gif-panel-msg",
    position: "bottom:120px;right:20px;",
    keepOpenFor: "btnGif",
    onPick: function(gifUrl) {
      // FIX 2026-06-15 : envoyer le GIF comme média (m.gif) via _sendGif, et NON
      // coller l'URL dans le champ texte (sinon il partait en texte brut, l'URL
      // s'affichait au lieu du GIF animé).
      if (window._sendGif) {
        window._sendGif(gifUrl);
      } else {
        var input = document.getElementById("convFpInput");
        if (input) { input.value = gifUrl; input.focus(); autoResizeTextarea(input); }
      }
    }
  });
}

function showGifPickerForComment(postId, commentId, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  console.log("🎬 showGifPickerForComment:", postId, commentId);

  // Fermer les anciens panels
  var oldPanel = document.getElementById("gif-panel-" + commentId);
  if (oldPanel) oldPanel.remove();

  // Position : près du bouton GIF du commentaire si dispo, sinon centré
  var position = "left:50%;top:25%;transform:translateX(-50%);";
  var gifBtn = event?.target;
  if (gifBtn && gifBtn.classList && gifBtn.classList.contains("comment-action")) {
    var rect = gifBtn.getBoundingClientRect();
    position = "left:" + Math.min(rect.left + 30, window.innerWidth - 420) + "px;top:" + Math.max(rect.top - 10, 10) + "px;";
  }
  passioGifPanel({
    id: "gif-panel-" + commentId,
    position: position,
    z: 100002, // au-dessus du modal (10001) qui contient la liste de commentaires
    onPick: function(gifUrl) { addGifToComment(postId, commentId, gifUrl); }
  });
  return false;
}

function showEmojiPickerForComment(postId, commentId, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }

  // Fermer les anciens panels
  var oldPanel = document.getElementById("emoji-panel-" + commentId);
  if (oldPanel) { oldPanel.remove(); return false; }

  // Initialiser les propriétés du commentaire
  var _thr = (typeof _findCommentThread === "function") ? _findCommentThread(postId) : null;
  if (!_thr && typeof findPostAnywhere === "function") { var _pp = findPostAnywhere(postId); if (_pp) _thr = { comments: _pp.comments || [] }; }
  if (_thr) {
    var comment = _thr.comments.find(c => c.id === commentId);
    if (comment) {
      if (!comment.likes) comment.likes = 0;
      if (!comment.likedBy) comment.likedBy = [];
      if (!comment.replies) comment.replies = [];
      if (!comment.emojis) comment.emojis = [];
    }
  }

  var selected = []; // emojis accumulés pour cette session

  var emojis = window._PASSIO_EMOJI_LIST;
  var panel = document.createElement("div");
  panel.id = "emoji-panel-" + commentId;
  // z-index 100002 : ce picker de réaction est toujours ouvert depuis la liste de
  // commentaires, qui vit dans un modal (10001 : viewer CDV, openComments, feuille
  // de réponse) → sans ça il s'affiche en arrière-plan (bug IRL/CDV).
  panel.style.cssText = "position:fixed;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px;z-index:100002;box-shadow:0 4px 20px rgba(0,0,0,0.25);width:260px;";

  // Ligne de prévisualisation + bouton valider
  var previewRow = document.createElement("div");
  previewRow.style.cssText = "display:flex;align-items:center;gap:6px;min-height:34px;border-bottom:1px solid var(--border);padding-bottom:6px;";

  var previewSpan = document.createElement("span");
  previewSpan.style.cssText = "font-size:22px;flex:1;letter-spacing:2px;min-width:0;";
  previewSpan.textContent = "";

  var validateBtn = document.createElement("button");
  validateBtn.textContent = "✓";
  validateBtn.style.cssText = "background:var(--accent);color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:14px;font-weight:700;cursor:pointer;opacity:0.4;pointer-events:none;transition:opacity 0.15s;flex-shrink:0;";
  validateBtn.onclick = function(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    if (!selected.length) return;
    addEmojiToComment(postId, commentId, selected.join(""));
    panel.remove();
    document.removeEventListener("click", closeListener);
  };

  // Onglet GIF intégré au picker emoji (réaction GIF accessible depuis le même
  // panneau → on retire le bouton 🎬 séparé des actions de commentaire).
  var gifTab = document.createElement("button");
  gifTab.type = "button";
  gifTab.innerHTML = "🎬 GIF";
  gifTab.title = "Réagir avec un GIF";
  gifTab.style.cssText = "border:1px solid var(--border);background:transparent;color:var(--text);font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;cursor:pointer;flex-shrink:0;";
  gifTab.onmouseover = function() { this.style.background = "rgba(124,58,237,0.15)"; this.style.borderColor = "var(--accent)"; };
  gifTab.onmouseout = function() { this.style.background = "transparent"; this.style.borderColor = "var(--border)"; };
  gifTab.onclick = function(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    panel.remove();
    try { document.removeEventListener("click", closeListener); } catch(e) {}
    showGifPickerForComment(postId, commentId, evt);
  };

  previewRow.appendChild(previewSpan);
  previewRow.appendChild(gifTab);
  previewRow.appendChild(validateBtn);
  panel.appendChild(previewRow);

  // Grille d'emojis
  var grid = document.createElement("div");
  grid.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;max-height:160px;overflow-y:auto;";

  emojis.forEach(function(e) {
    var btn = document.createElement("span");
    btn.textContent = e;
    btn.style.cssText = "cursor:pointer;font-size:22px;padding:5px;border-radius:6px;transition:background 0.15s,transform 0.1s;";
    btn.onmouseover = function() { this.style.background = "rgba(124,58,237,0.2)"; this.style.transform = "scale(1.2)"; };
    btn.onmouseout = function() { this.style.background = "transparent"; this.style.transform = "scale(1)"; };
    btn.onclick = function(evt) {
      evt.stopPropagation();
      evt.preventDefault();
      selected.push(e);
      previewSpan.textContent = selected.join("");
      validateBtn.style.opacity = "1";
      validateBtn.style.pointerEvents = "auto";
    };
    grid.appendChild(btn);
  });

  panel.appendChild(grid);

  // Positionner le panel à côté du bouton emoji
  var emojiBtn = event && event.target;
  if (emojiBtn) {
    var rect = emojiBtn.getBoundingClientRect();
    var left = rect.left + window.scrollX;
    var top = rect.top + window.scrollY - 10;
    // Eviter débordement à droite
    if (left + 265 > window.innerWidth) left = window.innerWidth - 270;
    panel.style.position = "fixed";
    panel.style.left = Math.max(4, left) + "px";
    panel.style.top = Math.max(4, rect.top - 130) + "px";
  }

  document.body.appendChild(panel);

  // Fermer quand on clique ailleurs (sans fermer si clic dans le panel)
  var closeListener = function(e) {
    if (!panel.contains(e.target)) {
      panel.remove();
      document.removeEventListener("click", closeListener);
    }
  };
  setTimeout(function() {
    document.addEventListener("click", closeListener);
  }, 50);

  return false;
}

function addGifToComment(postId, commentId, gifUrl) {
  console.log("🎬 addGifToComment:", postId, commentId);
  // commentId peut désigner un commentaire OU une réponse (_findCommentNode gère les deux).
  var found = (typeof _findCommentNode === "function") ? _findCommentNode(postId, commentId) : null;
  var thread = found && found.thread;
  var comment = found && found.node;
  if (!comment) return false;

  // Initialiser replies si nécessaire
  if (!comment.replies) comment.replies = [];

  // Créer une nouvelle réaction GIF
  var gifReaction = {
    id: "gif_" + commentId + "_" + Math.random().toString(36).substr(2, 9),
    // MY_UID (et non state.user.id souvent vide) → cohérent avec emoji/reply/like,
    // sinon la réaction est attribuée à "me" (résolution d'auteur incohérente).
    authorId: (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : (state.user?.id || "me"),
    text: gifUrl,
    type: "gif_reaction",
    createdAt: Date.now(),
    likes: 0,
    likedBy: []
  };
  comment.replies.push(gifReaction);
  // Sync Supabase → la réaction GIF apparaît chez tous les comptes ET survit au
  // re-render/hydratation (sans ça, seul l'emoji était synchronisé : le GIF
  // disparaissait au rechargement / poll CDV 5 s).
  if (typeof supaCommentInteract === "function") supaCommentInteract(commentId, postId, "gif", gifUrl);
  console.log("✅ GIF reaction added + synced");

  if (typeof thread.save === "function") thread.save();
  // Re-render unifié : la réponse GIF apparaît dans la liste, les réactions emoji
  // restent agrégées dans la pastille.
  if (typeof _refreshCommentThreadUI === "function") _refreshCommentThreadUI(postId);
  return false;
}

function showEmojiPickerForPost(postId, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }

  var oldPanel = document.getElementById("emoji-panel-post-" + postId);
  if (oldPanel) { oldPanel.remove(); return false; }

  var selected = [];

  var emojis = window._PASSIO_EMOJI_LIST;
  var panel = document.createElement("div");
  panel.id = "emoji-panel-post-" + postId;
  panel.style.cssText = "position:fixed;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px;z-index:10000;box-shadow:0 4px 20px rgba(0,0,0,0.25);width:260px;";

  // Ligne prévisualisation + bouton valider
  var previewRow = document.createElement("div");
  previewRow.style.cssText = "display:flex;align-items:center;gap:6px;min-height:34px;border-bottom:1px solid var(--border);padding-bottom:6px;";

  var previewSpan = document.createElement("span");
  previewSpan.style.cssText = "font-size:22px;flex:1;letter-spacing:2px;min-width:0;";

  var validateBtn = document.createElement("button");
  validateBtn.textContent = "✓";
  validateBtn.style.cssText = "background:var(--accent);color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:14px;font-weight:700;cursor:pointer;opacity:0.4;pointer-events:none;transition:opacity 0.15s;flex-shrink:0;";
  validateBtn.onclick = function(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    if (!selected.length) return;
    addEmojiToPost(postId, selected.join(""));
    panel.remove();
    document.removeEventListener("click", closeListener);
  };

  // Onglet GIF intégré au picker emoji du post (→ on retire le 🎬 séparé de la
  // barre d'actions du post).
  var gifTab = document.createElement("button");
  gifTab.type = "button";
  gifTab.innerHTML = "🎬 GIF";
  gifTab.title = "Réagir avec un GIF";
  gifTab.style.cssText = "border:1px solid var(--border);background:transparent;color:var(--text);font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;cursor:pointer;flex-shrink:0;";
  gifTab.onmouseover = function() { this.style.background = "rgba(124,58,237,0.15)"; this.style.borderColor = "var(--accent)"; };
  gifTab.onmouseout = function() { this.style.background = "transparent"; this.style.borderColor = "var(--border)"; };
  gifTab.onclick = function(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    panel.remove();
    try { document.removeEventListener("click", closeListener); } catch(e) {}
    showGifPickerForPost(postId, evt);
  };

  previewRow.appendChild(previewSpan);
  previewRow.appendChild(gifTab);
  previewRow.appendChild(validateBtn);
  panel.appendChild(previewRow);

  var grid = document.createElement("div");
  grid.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;max-height:160px;overflow-y:auto;";

  emojis.forEach(function(e) {
    var btn = document.createElement("span");
    btn.textContent = e;
    btn.style.cssText = "cursor:pointer;font-size:22px;padding:5px;border-radius:6px;transition:background 0.15s,transform 0.1s;";
    btn.onmouseover = function() { this.style.background = "rgba(124,58,237,0.2)"; this.style.transform = "scale(1.2)"; };
    btn.onmouseout = function() { this.style.background = "transparent"; this.style.transform = "scale(1)"; };
    btn.onclick = function(evt) {
      evt.stopPropagation();
      evt.preventDefault();
      selected.push(e);
      previewSpan.textContent = selected.join("");
      validateBtn.style.opacity = "1";
      validateBtn.style.pointerEvents = "auto";
    };
    grid.appendChild(btn);
  });

  panel.appendChild(grid);

  var emojiBtn = event && event.target;
  if (emojiBtn) {
    var rect = emojiBtn.getBoundingClientRect();
    var left = rect.left + window.scrollX;
    if (left + 265 > window.innerWidth) left = window.innerWidth - 270;
    panel.style.left = Math.max(4, left) + "px";
    panel.style.top = Math.max(4, rect.top - 130) + "px";
  }

  document.body.appendChild(panel);

  var closeListener = function(e) {
    if (!panel.contains(e.target)) {
      panel.remove();
      document.removeEventListener("click", closeListener);
    }
  };
  setTimeout(function() {
    document.addEventListener("click", closeListener);
  }, 50);

  return false;
}

// Sélecteur emoji + GIF pour un ÉVÉNEMENT IRL — même présentation que celui des
// posts (grille complète, prévisualisation des emojis choisis, bouton ✓ pour
// valider AVANT d'envoyer). Onglet 🎬 GIF intégré. Au valider → réactions appliquées.
function showEmojiPickerForEvent(eventId, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  var oldPanel = document.getElementById("emoji-panel-ev-" + eventId);
  if (oldPanel) { oldPanel.remove(); return false; }

  var selected = [];
  var emojis = window._PASSIO_EMOJI_LIST || ["❤️","🔥","😍","👏","😂","😮","😢","🎉","💯","🙌"];
  var panel = document.createElement("div");
  panel.id = "emoji-panel-ev-" + eventId;
  panel.style.cssText = "position:fixed;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px;z-index:100002;box-shadow:0 4px 20px rgba(0,0,0,0.25);width:260px;";

  var previewRow = document.createElement("div");
  previewRow.style.cssText = "display:flex;align-items:center;gap:6px;min-height:34px;border-bottom:1px solid var(--border);padding-bottom:6px;";
  var previewSpan = document.createElement("span");
  previewSpan.style.cssText = "font-size:22px;flex:1;letter-spacing:2px;min-width:0;overflow:hidden;";

  var validateBtn = document.createElement("button");
  validateBtn.textContent = "✓";
  validateBtn.style.cssText = "background:var(--accent);color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:14px;font-weight:700;cursor:pointer;opacity:0.4;pointer-events:none;transition:opacity 0.15s;flex-shrink:0;";
  validateBtn.onclick = function(evt) {
    evt.stopPropagation(); evt.preventDefault();
    if (!selected.length) return;
    if (typeof applyEventEmojiReaction === "function") applyEventEmojiReaction(eventId, selected.slice());
    panel.remove();
    try { document.removeEventListener("click", closeListener); } catch(e) {}
    if (typeof toast === "function") toast("Réaction envoyée " + selected.join(""));
  };

  var gifTab = document.createElement("button");
  gifTab.type = "button";
  gifTab.innerHTML = "🎬 GIF";
  gifTab.title = "Réagir avec un GIF";
  gifTab.style.cssText = "border:1px solid var(--border);background:transparent;color:var(--text);font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;cursor:pointer;flex-shrink:0;";
  gifTab.onclick = function(evt) {
    evt.stopPropagation(); evt.preventDefault();
    panel.remove();
    try { document.removeEventListener("click", closeListener); } catch(e) {}
    if (typeof passioGifPanel === "function") {
      passioGifPanel({ id: "gif-panel-ev-" + eventId, position: "left:50%;top:25%;transform:translateX(-50%);",
        onPick: function(gifUrl) { if (typeof applyEventGifReaction === "function") applyEventGifReaction(eventId, gifUrl); if (typeof toast === "function") toast("GIF envoyé 🎬"); } });
    }
  };

  previewRow.appendChild(previewSpan);
  previewRow.appendChild(gifTab);
  previewRow.appendChild(validateBtn);
  panel.appendChild(previewRow);

  var grid = document.createElement("div");
  grid.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;max-height:160px;overflow-y:auto;";
  emojis.forEach(function(e) {
    var b = document.createElement("span");
    b.textContent = e;
    b.style.cssText = "cursor:pointer;font-size:22px;padding:5px;border-radius:6px;transition:background 0.15s,transform 0.1s;";
    b.onmouseover = function() { this.style.background = "rgba(124,58,237,0.2)"; this.style.transform = "scale(1.2)"; };
    b.onmouseout = function() { this.style.background = "transparent"; this.style.transform = "scale(1)"; };
    b.onclick = function(evt) {
      evt.stopPropagation(); evt.preventDefault();
      selected.push(e);
      previewSpan.textContent = selected.join("");
      validateBtn.style.opacity = "1"; validateBtn.style.pointerEvents = "auto";
    };
    grid.appendChild(b);
  });
  panel.appendChild(grid);

  var emojiBtn = event && event.target;
  if (emojiBtn && emojiBtn.getBoundingClientRect) {
    var rect = emojiBtn.getBoundingClientRect();
    var left = rect.left;
    if (left + 265 > window.innerWidth) left = window.innerWidth - 270;
    panel.style.left = Math.max(4, left) + "px";
    panel.style.top = Math.max(4, rect.top - 200) + "px";
  } else { panel.style.left = "50%"; panel.style.top = "25%"; panel.style.transform = "translateX(-50%)"; }

  document.body.appendChild(panel);
  var closeListener = function(e) { if (!panel.contains(e.target)) { panel.remove(); document.removeEventListener("click", closeListener); } };
  setTimeout(function() { document.addEventListener("click", closeListener); }, 50);
  return false;
}

function addEmojiToPost(postId, emoji) {
  console.log("✨ addEmojiToPost:", postId, emoji);
  var post = findPostAnywhere(postId);
  if (!post) return false;

  if (!post.reactions) post.reactions = [];

  post.reactions.push({
    id: "emoji_" + postId + "_" + Math.random().toString(36).substr(2, 9),
    authorId: (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : (state.user?.id || "me"),
    text: emoji,
    type: "emoji_reaction",
    createdAt: Date.now()
  });

  if (typeof saveState === "function") saveState();
  updatePostReactionsUI(postId);
  return false;
}

function showGifPickerForPost(postId, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  console.log("🎬 showGifPickerForPost:", postId);

  var oldPanel = document.getElementById("gif-panel-post-" + postId);
  if (oldPanel) oldPanel.remove();

  // Position : près du bouton réaction du post si dispo, sinon centré
  var position = "left:50%;top:25%;transform:translateX(-50%);";
  var gifBtn = event?.target;
  if (gifBtn && gifBtn.classList && gifBtn.classList.contains("post-action")) {
    var rect = gifBtn.getBoundingClientRect();
    position = "left:" + Math.min(rect.left + 30, window.innerWidth - 420) + "px;top:" + Math.max(rect.top - 10, 10) + "px;";
  }
  passioGifPanel({
    id: "gif-panel-post-" + postId,
    position: position,
    onPick: function(gifUrl) { addGifToPost(postId, gifUrl); }
  });
  return false;
}

function addGifToPost(postId, gifUrl) {
  console.log("🎬 addGifToPost:", postId);
  var post = findPostAnywhere(postId);
  if (!post) return false;

  if (!post.reactions) post.reactions = [];

  post.reactions.push({
    id: "gif_" + postId + "_" + Math.random().toString(36).substr(2, 9),
    authorId: state.user?.id || "me",
    text: gifUrl,
    type: "gif_reaction",
    createdAt: Date.now()
  });

  if (typeof saveState === "function") saveState();
  updatePostReactionsUI(postId);
  return false;
}

function updatePostReactionsUI(postId) {
  var post = findPostAnywhere(postId);
  if (!post || !post.reactions) return;

  var postElement = document.querySelector('[data-postid="' + postId + '"]');
  if (!postElement) return;

  var reactionsDiv = postElement.querySelector(".post-reactions");
  if (reactionsDiv) reactionsDiv.remove();

  if (post.reactions.length > 0) {
    var newReactionsDiv = document.createElement("div");
    newReactionsDiv.className = "post-reactions";
    newReactionsDiv.style.cssText = "margin-top:12px;padding-top:8px;border-top:1px solid var(--border);";

    var reactionsHTML = post.reactions.map(r => {
      const ru = userById(r.authorId) || { name: "?", profileEmoji: "👤", avatar: "#64748b" };
      const rSrc = r.authorId === "me" ? "me" : "seed";
      const _rAv = { avatar: ru.avatar || "#64748b", profileEmoji: ru.profileEmoji || "👤", name: ru.name, photoUrl: ru.photoUrl || null };

      if (r.type === "emoji_reaction") {
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;">
          <div class="avatar sm" style="background:${avatarBg(_rAv)};flex-shrink:0;cursor:pointer;" onclick="event.stopPropagation();openUserProfile('${r.authorId}','${rSrc}')">${avatarInner(_rAv)}</div>
          <div><span style="font-size:11px;font-weight:600;cursor:pointer;" onclick="event.stopPropagation();openUserProfile('${r.authorId}','${rSrc}')">${escapeHtml(ru.name)}</span> <span style="font-size:18px;">${r.text}</span></div>
        </div>`;
      }

      if (r.type === "gif_reaction") {
        return `<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;">
          <div class="avatar sm" style="background:${avatarBg(_rAv)};flex-shrink:0;cursor:pointer;" onclick="event.stopPropagation();openUserProfile('${r.authorId}','${rSrc}')">${avatarInner(_rAv)}</div>
          <div><span style="font-size:11px;font-weight:600;cursor:pointer;" onclick="event.stopPropagation();openUserProfile('${r.authorId}','${rSrc}')">${escapeHtml(ru.name)}</span><br/>
          <img loading="lazy" decoding="async" src="${r.text}" style="width:120px;height:120px;border-radius:8px;margin-top:6px;object-fit:cover;" alt="GIF" /></div>
        </div>`;
      }
    }).join("");

    newReactionsDiv.innerHTML = reactionsHTML;
    postElement.appendChild(newReactionsDiv);
  }
}

function addEmojiToComment(postId, commentId, emoji) {
  console.log("✨ addEmojiToComment:", postId, commentId, emoji);
  // commentId peut désigner un commentaire OU une réponse (_findCommentNode gère les deux).
  var found = (typeof _findCommentNode === "function") ? _findCommentNode(postId, commentId) : null;
  var thread = found && found.thread;
  var comment = found && found.node;
  if (!comment) return false;

  // Chaque emoji = entrée séparée dans node.replies (avec authorId pour l'avatar).
  if (!comment.replies) comment.replies = [];
  var emojiReaction = {
    id: "emoji_" + commentId + "_" + Math.random().toString(36).substr(2, 9),
    authorId: (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : (state.user?.id || "me"),
    text: emoji,
    type: "emoji_reaction",
    createdAt: Date.now()
  };
  comment.replies.push(emojiReaction);
  if (typeof thread.save === "function") thread.save(); else saveState();
  // Sync Supabase → la réaction emoji apparaît chez tous les comptes.
  if (typeof supaCommentInteract === "function") supaCommentInteract(commentId, postId, "emoji", emoji);
  console.log("✅ Emoji reaction added + synced:", emoji);

  // Une réaction emoji n'est PAS un commentaire : on re-rend le fil via le renderer
  // unifié, qui l'agrège dans la pastille « 😍 N » (et non en ligne de réponse).
  if (typeof _refreshCommentThreadUI === "function") _refreshCommentThreadUI(postId);
  return false;
}

// ⚡ INITIALISATION PRINCIPALE - Attendre boot() puis lancer initApp()
console.log("🚀 Démarrage PASSIO...");
setTimeout(function() {
  // ✅ IMPORTANT: Assurer que MY_UID est défini
  // Si boot() n'a pas chargé depuis Supabase, utiliser localStorage
  if (!window.MY_UID || window.MY_UID === 'undefined') {
    window.MY_UID = localStorage.getItem("passio_uid") || ("u_" + Math.random().toString(36).slice(2,10));
    if (!localStorage.getItem("passio_uid")) {
      localStorage.setItem("passio_uid", window.MY_UID);
    }
    console.log("✅ MY_UID assigné: " + window.MY_UID);
  }

  // boot() doit s'être exécutée pour charger l'app, donc attendre 500ms
  setTimeout(function() {
    console.log("📱 MY_UID=" + window.MY_UID);
    // ⚠️ FIX CRITIQUE 2026-06-12 : initApp() SEULEMENT si l'onboarding est déjà fait.
    // Sinon, pour un NOUVEL utilisateur, initApp → launchTourSafe retirait de force
    // la landing et l'onboarding en plein parcours d'inscription (écran âge/prénom
    // écrasé par le tour ~1,4 s après le chargement). Le parcours nouveau venu est
    // géré par boot() (landing) puis onbFinish() (renderEverything + tour + supaInit).
    var _onboarded = false;
    try { _onboarded = !!(state && state.onboarded); } catch (e) {}
    if (!_onboarded) {
      console.log("⏭ initApp() ignoré : onboarding en cours (géré par boot/onbFinish)");
    } else if (typeof initApp === "function") {
      console.log("📱 Appel initApp()");
      try {
        initApp();
      } catch(err) {
        console.error("❌ ERREUR initApp:", err);
      }
    } else {
      console.error("❌ initApp() n'existe pas!");
    }

    // ✅ ACTIVER AUTO-REFRESH du feed (toutes les 10 secondes)
    setTimeout(function() {
      console.log("✅ Activation auto-refresh du feed");
      if (typeof startAutoRefresh === "function") {
        startAutoRefresh();
      }
    }, 1000);

  }, 500);
}, 100);

// 🧪 TEST SUPABASE READ - Vérifier si Supabase répond
window.testSupabaseRead = async function() {
  console.log("🧪 TEST SUPABASE READ");

  var modal = document.createElement("div");
  modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999999;";

  var box = document.createElement("div");
  box.style.cssText = "background:white;padding:20px;border-radius:12px;max-width:95%;max-height:85%;overflow-y:auto;font-family:monospace;font-size:11px;";

  var html = "<h3>🧪 TEST SUPABASE READ</h3>";
  html += "Essai de lire les posts depuis Supabase...<br/>";
  html += "Cela teste si la table 'posts' existe et est accessible<br/><br/>";

  box.innerHTML = html + "<button onclick='this.parentElement.parentElement.remove();' style='margin-top:10px;padding:8px 12px;background:#ec4899;color:white;border:none;border-radius:6px;cursor:pointer;width:100%;'>Fermer</button>";
  modal.appendChild(box);
  document.body.appendChild(modal);

  try {
    console.log("📖 Tentative de lecture des posts (TIMEOUT 5s)...");
    console.log("🔍 supa client OK?", !!supa);

    // ⏱️ TIMEOUT: Si pas de réponse en 5s, arrêter
    const timeoutPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        console.error("⏱️ TIMEOUT déclenché - Supabase n'a pas répondu en 5s");
        reject(new Error("TIMEOUT: Supabase ne répond pas après 5 secondes"));
      }, 5000);
    });

    console.log("📤 Envoi requête SELECT vers Supabase...");
    const readPromise = supa.from("posts").select("id,author_id,created_at").limit(1);
    console.log("📤 Requête construite, en attente...");

    const { data, error } = await Promise.race([readPromise, timeoutPromise]);
    console.log("✅ Réponse reçue!", { data: data?.length, error: error?.message });

    if (error) {
      html += "<br/><b>❌ ERREUR READ:</b><br/>";
      html += "Message: " + error.message + "<br/>";
      html += "Code: " + error.code + "<br/>";
      html += "Cela signifie: Supabase ne peut pas lire la table<br/>";
      console.error("❌ Erreur READ:", error);
    } else {
      html += "<br/><b>✅ LECTURE OK!</b><br/>";
      html += "Posts trouvés: " + (data?.length || 0) + "<br/>";
      html += "Cela signifie: La table 'posts' existe et est accessible<br/>";
      html += "Mais les INSERTs bloquent quand même = problème RLS/permissions<br/>";
      console.log("✅ Lecture OK:", data?.length);
    }
  } catch(e) {
    html += "<br/><b>❌ EXCEPTION READ:</b><br/>";
    html += "Message: " + e.message + "<br/>";
    html += "Type: " + e.name + "<br/>";
    html += "Stack: " + (e.stack?.split("\n")[0] || "?") + "<br/>";
    console.error("❌ Exception:", e);
  }

  box.innerHTML = html + "<button onclick='this.parentElement.parentElement.remove();' style='margin-top:10px;padding:8px 12px;background:#ec4899;color:white;border:none;border-radius:6px;cursor:pointer;width:100%;'>Fermer</button>";
};

// 🧪 TEST SUPABASE - Vérifier si on peut insérer un post
window.testSupabaseInsert = async function() {
  console.log("🧪 TEST SUPABASE INSERT");

  var modal = document.createElement("div");
  modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999999;";

  var box = document.createElement("div");
  box.style.cssText = "background:white;padding:20px;border-radius:12px;max-width:95%;max-height:85%;overflow-y:auto;font-family:monospace;font-size:11px;";

  var html = "<h3>🧪 TEST SUPABASE INSERT</h3>";
  html += "Envoi d'un post test en Supabase...<br/>";

  var testPost = {
    id: "test_" + Date.now(),
    author_id: window.MY_UID,
    passion_id: "test",
    mood: "all",
    content: "Post test pour vérifier si Supabase fonctionne",
    media_url: null,
    created_at: new Date().toISOString(),
  };

  html += "<br/><b>Données à insérer:</b><br/>";
  html += JSON.stringify(testPost, null, 2) + "<br/><br/>";
  html += "Envoi en cours...<br/>";

  box.innerHTML = html + "<button onclick='this.parentElement.parentElement.remove();' style='margin-top:10px;padding:8px 12px;background:#ec4899;color:white;border:none;border-radius:6px;cursor:pointer;width:100%;'>Fermer</button>";
  modal.appendChild(box);
  document.body.appendChild(modal);

  try {
    console.log("📤 Insertion test (TIMEOUT 5s):", testPost);

    // ⏱️ TIMEOUT: Si pas de réponse en 5s, arrêter
    const timeoutPromise = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error("TIMEOUT: Supabase ne répond pas après 5 secondes")), 5000);
    });

    const insertPromise = supa.from("posts").insert(testPost).select();
    const { data, error } = await Promise.race([insertPromise, timeoutPromise]);

    if (error) {
      html += "<br/><b>❌ ERREUR:</b><br/>";
      html += "Message: " + error.message + "<br/>";
      html += "Code: " + error.code + "<br/>";
      html += "JSON: " + JSON.stringify(error) + "<br/>";
      console.error("❌ Erreur INSERT:", error);
    } else {
      html += "<br/><b>✅ SUCCÈS!</b><br/>";
      html += "Post inséré: " + data[0].id + "<br/>";
      html += "Cela signifie que Supabase fonctionne!<br/>";
      console.log("✅ Succès INSERT:", data);
    }
  } catch(e) {
    html += "<br/><b>❌ EXCEPTION:</b><br/>";
    html += "Message: " + e.message + "<br/>";
    html += "Stack: " + e.stack + "<br/>";
    console.error("❌ Exception:", e);
  }

  box.innerHTML = html + "<button onclick='this.parentElement.parentElement.remove();' style='margin-top:10px;padding:8px 12px;background:#ec4899;color:white;border:none;border-radius:6px;cursor:pointer;width:100%;'>Fermer</button>";
};

// 🔍 DIAGNOSTIC AVANCÉ - Version SIMPLE (sans async)
window.showAdvancedDiagnostic = function() {
  // Créer une modal visible
  var modal = document.createElement("div");
  modal.id = "__advanced_diag_modal";
  modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999999;";

  var box = document.createElement("div");
  box.style.cssText = "background:white;padding:20px;border-radius:12px;max-width:95%;max-height:85%;overflow-y:auto;font-family:monospace;font-size:11px;line-height:1.6;";

  // Construire le diagnostic SIMPLE et RAPIDE
  var html = "";
  html += "<h3 style='margin-top:0;'>🔍 DIAGNOSTIC AVANCÉ</h3>";
  html += "<b>1️⃣ UTILISATEUR:</b><br/>";
  html += "MY_UID: <b>" + (window.MY_UID || "?") + "</b><br/>";
  html += "User: <b>" + (state.user?.name || "?") + "</b><br/>";
  html += "Profile: <b>" + ((state.user?.currentProfileId || "?").substring(0,8)) + "...</b><br/><br/>";

  html += "<b>2️⃣ POSTS EN MÉMOIRE:</b><br/>";
  html += "state.seed.posts: <b>" + ((state.seed.posts || []).length) + " posts</b><br/>";
  html += "state.userPosts: <b>" + ((state.userPosts || []).length) + " posts</b><br/>";
  if ((state.seed.posts || []).length > 0) {
    html += "Dernier post (seed): <b>" + (state.seed.posts[0].authorName || state.seed.posts[0].authorId || "?") + "</b><br/>";
  }
  if ((state.userPosts || []).length > 0) {
    html += "Dernier post (user): <b>" + ((state.userPosts[0].text || "").substring(0,30)) + "...</b><br/>";
  }
  html += "<br/>";

  html += "<b>3️⃣ LOGS DE DIAGNOSTIC:</b><br/>";
  if (window._diagLogs && window._diagLogs.length > 0) {
    html += "<b>Derniers logs:</b><br/>";
    window._diagLogs.slice(-10).forEach(log => {
      html += "• " + log + "<br/>";
    });
  } else {
    html += "Aucun log pour l'instant<br/>";
  }
  html += "<br/>";

  html += "<b>4️⃣ CONCLUSION:</b><br/>";
  var seedCount = (state.seed.posts || []).length;
  var userCount = (state.userPosts || []).length;

  if (seedCount === 0) {
    html += "❌ <b>PROBLÈME MAJEUR:</b> Aucun post en mémoire!<br/>";
    html += "→ Les posts ne sont pas chargés au démarrage";
  } else if (userCount > 0 && seedCount < 130) {
    html += "❌ <b>PROBLÈME CRITIQUE:</b> seed.posts (" + seedCount + ") < userPosts (" + userCount + ")<br/>";
    html += "→ <b>Tes posts NE SONT PAS EN SUPABASE!</b><br/>";
    html += "→ supaPublishPostWithRetry() échoue silencieusement<br/>";
    html += "→ Vérifier les logs ci-dessus pour l'erreur";
  } else {
    html += "✅ <b>OK:</b> Posts en mémoire";
  }
  html += "<br/><br/>";
  html += "<b>💡 ACTION:</b><br/>";
  html += "1. Clique 🔄 REFRESH<br/>";
  html += "2. Regarde les logs de diagnostic<br/>";
  html += "3. L'erreur Supabase apparaîtra ici";

  box.innerHTML = html + "<br/><button id='diag-close-modal' style='margin-top:10px;padding:8px 12px;background:#ec4899;color:white;border:none;border-radius:6px;cursor:pointer;width:100%;'>Fermer</button>";

  modal.appendChild(box);
  document.body.appendChild(modal);

  document.getElementById("diag-close-modal").onclick = function() {
    modal.remove();
  };
};

// 🔍 DIAGNOSTIC AVANCÉ - Inspecter Supabase directement (version console)
window.advancedDiagnostic = async function() {
  console.log("🔍 DIAGNOSTIC AVANCÉ SUPABASE");
  console.log("=" .repeat(50));

  // 1. Vérifier la connexion Supabase
  console.log("1️⃣ SUPABASE CONNEXION:");
  if (typeof supa === 'undefined') {
    console.error("❌ supa n'existe pas!");
    return;
  }
  console.log("✅ supa existe");

  // 2. Vérifier MY_UID
  console.log("\n2️⃣ UTILISATEUR COURANT:");
  console.log("MY_UID:", window.MY_UID);
  console.log("state.user.name:", state.user.name);
  console.log("state.user.currentProfileId:", state.user.currentProfileId);

  // 3. Charger TOUS les posts directement de Supabase
  console.log("\n3️⃣ CHARGER TOUS LES POSTS DE SUPABASE:");
  try {
    const { data, error } = await supa.from("posts").select("id,author_id,passion_id,created_at").order("created_at", { ascending: false }).limit(100);
    if (error) {
      console.error("❌ Erreur requête posts:", error);
      return;
    }
    console.log(`✅ ${data?.length || 0} posts trouvés dans Supabase:`);
    (data || []).slice(0, 5).forEach((p, i) => {
      console.log(`  ${i+1}. ID: ${p.id}, author_id: ${p.author_id}, passion: ${p.passion_id}, created: ${p.created_at}`);
    });
  } catch(e) {
    console.error("❌ Exception:", e);
  }

  // 4. Vérifier state.seed.posts
  console.log("\n4️⃣ STATE LOCAL (state.seed.posts):");
  console.log(`Total: ${(state.seed.posts || []).length}`);
  (state.seed.posts || []).slice(0, 5).forEach((p, i) => {
    console.log(`  ${i+1}. ID: ${p.id}, author: ${p.authorId}, passion: ${p.passion}`);
  });

  // 5. Vérifier state.userPosts
  console.log("\n5️⃣ POSTS PERSONNELS (state.userPosts):");
  console.log(`Total: ${(state.userPosts || []).length}`);
  (state.userPosts || []).slice(0, 5).forEach((p, i) => {
    console.log(`  ${i+1}. ID: ${p.id}, text: ${(p.text || '').substring(0, 30)}`);
  });

  console.log("\n" + "=".repeat(50));
  console.log("ℹ️ Si Supabase a 0 posts: vérifier si les publications échouent");
  console.log("ℹ️ Si Supabase a des posts mais state.seed.posts est vide: problème de chargement");
};

// 🔄 FONCTION AUTO-REFRESH - Recharger les posts automatiquement toutes les 10 sec
window._autoRefreshInterval = null;
window.startAutoRefresh = function() {
  // DÉSACTIVÉ (2026-06-29) : doublon de startFeedRefreshLoop() (app-08) qui fait
  // déjà le fallback 60s + realtime. Les deux tournaient en parallèle → 2 requêtes
  // réseau/min + 2 renderFeed (celui-ci re-rendait MÊME écran feed inactif).
  // startFeedRefreshLoop reste la source unique (vérifie l'écran actif, écrit dans
  // state.supabasePosts = source canonique de findPostAnywhere).
  return;
  // eslint-disable-next-line no-unreachable
  if (window._autoRefreshInterval) return;  // Déjà actif
  console.log("🔄 Auto-refresh fallback ACTIVÉ (toutes les 60s, realtime actif par ailleurs)");
  window._autoRefreshInterval = setInterval(function() {
    supaLoadPosts().then(function(posts) {
      if (posts && posts.length > 0) {
        // Comparer avec les posts actuels
        const currentCount = (state.seed.posts || []).length;
        const newCount = posts.length;
        if (newCount !== currentCount) {
          console.log(`🔄 Feed mis à jour: ${currentCount} → ${newCount} posts`);
          const extra2 = (window._feedExtraPosts || []).filter(p => !posts.some(x => x.id === p.id));
          state.seed.posts = posts.concat(extra2);
          renderFeed();
        }
      }
    }).catch(function(err) {
      console.warn("⚠️ Auto-refresh erreur:", err.message);
    });
  }, 60000);  // Fallback 60s — les mises à jour instantanées passent par le canal realtime:posts
};

window.stopAutoRefresh = function() {
  if (window._autoRefreshInterval) {
    clearInterval(window._autoRefreshInterval);
    window._autoRefreshInterval = null;
    console.log("⏹️ Auto-refresh DÉSACTIVÉ");
  }
};

// 🔄 FONCTION FORCE REFRESH - Recharger les posts depuis Supabase MAINTENANT
window.forceRefreshFeed = function() {
  console.log("🔄 FORCE REFRESH: Chargement des posts depuis Supabase...");
  supaLoadPosts().then(function(posts) {
    if (posts && posts.length > 0) {
      const oldCount = (state.seed.posts || []).length;
      state.seed.posts = posts;
      console.log(`✅ Posts mis à jour: ${oldCount} → ${posts.length}`);
      renderFeed();
      toast(`✅ Feed rafraîchi (${posts.length} posts)`, "success");
    } else {
      console.warn("❌ Aucun post retourné");
      toast("❌ Aucun post trouvé", "error");
    }
  }).catch(function(err) {
    console.error("❌ Erreur refresh:", err);
    toast("❌ Erreur: " + err.message, "error");
  });
};

// 🔧 DIAGNOSTIC PANEL - DÉSACTIVÉ (Mode normal)
// (Le diagnostic visible a été supprimé de l'interface)
console.log("✅ Mode normal - diagnostic panel désactivé");

// ✅ INITIALISATION MOODS MULTI-SELECT - EVENT DELEGATION
console.log("🎨 INITIALISATION MOODS GLOBALE");
setTimeout(function() {
  try {
    // 1. Setup event delegation (unique, robuste, fluide)
    setupMoodDelegation();

    // 2. Mettre à jour l'UI initiale
    updateMoodButtonsUI();

    console.log("🎨 MOOD INIT TERMINÉE");
  } catch(err) {
    console.error("❌ ERREUR MOOD INIT:", err.message);
  }
}, 200);

// 🔧 BOUTONS TEST SUPABASE - DÉSACTIVÉS
// (Les boutons de diagnostic ont été supprimés - app en mode normal)
console.log("✅ Mode normal - diagnostic buttons désactivés");

// 🔨 Fermer tous les diagnostics ouverts
setTimeout(() => {
  const diagnosticModal = document.getElementById("__advanced_diag_modal");
  const testModal = document.querySelector("[style*='rgba(0,0,0,0.5)']");
  if (diagnosticModal) diagnosticModal.remove();
  if (testModal && testModal !== diagnosticModal) testModal.remove();
  console.log("✅ Diagnostics fermés");
}, 100);

// INITIALISATION BOUTON DIAGNOSTIC 🔧 - Caché par défaut
setTimeout(function() {
  var diagBtn = document.createElement("button");
  diagBtn.id = "__diag_btn";
  diagBtn.textContent = "🔧";
  diagBtn.style.cssText = "position:fixed;top:20px;right:20px;width:40px;height:40px;border-radius:50%;background:#666;border:none;color:#fff;font-size:18px;cursor:pointer;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,0.3);transition:background 0.2s;display:none;";
  diagBtn.title = "Appuie sur Ctrl+Shift+D pour activer/désactiver";
  diagBtn.onclick = toggleDiagPanel;
  diagBtn.onmouseover = function() { if(!window._DEBUG_MODE) this.style.background = "#777"; };
  diagBtn.onmouseout = function() { if(!window._DEBUG_MODE) this.style.background = "#666"; };
  document.body.appendChild(diagBtn);

  // Raccourci clavier: Ctrl+Shift+D pour afficher/masquer le bouton diagnostic
  document.addEventListener("keydown", function(e) {
    if (e.ctrlKey && e.shiftKey && e.code === "KeyD") {
      e.preventDefault();
      var btn = document.getElementById("__diag_btn");
      if (btn) {
        var isVisible = btn.style.display !== "none";
        btn.style.display = isVisible ? "none" : "flex";
        if (!isVisible) {
          window._DEBUG_MODE = true;
          btn.style.background = "#ec4899";
          btn.style.borderColor = "#ec4899";
        }
      }
    }
  });
}, 500);
