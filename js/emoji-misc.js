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

// Composeur de RÉPONSE — MÊME barre que les commentaires : champ texte + bouton
// 😊 (panneau emoji/GIF unifié `cmtComposerEmoji`, avec validation avant partage)
// + bouton Envoyer. La réponse est poussée dans le modèle puis le fil est re-rendu
// par le renderer unifié (`_renderCommentsList`) → réponses IDENTIQUES partout
// (fil / IRL / CDV), GIF de réponse rendu en image, pastille de réactions incluse.
function replyToComment(postId, commentId, authorName, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  document.querySelectorAll(".comment-reply-input").forEach(function(n){ n.remove(); });

  var inputId = "reply-input-" + commentId;
  var arg = postId + "|" + commentId;
  var wrap = document.createElement("div");
  wrap.className = "comment-reply-input";
  wrap.style.cssText = "margin-top:10px;display:flex;gap:6px;align-items:center;padding:8px;background:var(--bg-soft);border-radius:10px;border:1.5px solid var(--accent);animation:fadeIn 0.3s ease;";
  wrap.innerHTML =
    '<button type="button" class="cmt-tool-btn" title="Emoji & GIF" aria-label="Ajouter un emoji ou un GIF" style="background:none;border:none;font-size:18px;cursor:pointer;padding:2px 4px;line-height:1;" '
      + 'onclick="cmtComposerEmoji(\'' + inputId + '\',event,\'_submitReply\',\'' + arg + '\')">😊</button>'
    + '<input id="' + inputId + '" type="text" class="reply-field" placeholder="Répondre à ' + escapeHtml(authorName) + '…" '
      + 'style="flex:1;min-width:0;padding:8px 12px;border:1px solid var(--border);border-radius:12px;font-size:16px;box-sizing:border-box;background:var(--bg-card);color:var(--text);" '
      + 'onkeypress="if(event.key===\'Enter\'){event.preventDefault();_submitReply(\'' + arg + '\');}" />'
    + '<button type="button" title="Envoyer" aria-label="Envoyer la réponse" '
      + 'style="width:34px;height:34px;border-radius:9px;background:var(--accent);color:#fff;border:none;cursor:pointer;font-weight:bold;flex-shrink:0;" '
      + 'onclick="_submitReply(\'' + arg + '\')">✓</button>';

  var commentElement = document.querySelector('[data-commentid="' + commentId + '"]');
  var commentBody = commentElement && commentElement.querySelector(".comment-body");
  if (commentBody) {
    var commentActions = commentBody.querySelector(".comment-actions");
    if (commentActions) commentActions.parentNode.insertBefore(wrap, commentActions.nextSibling);
    else commentBody.appendChild(wrap);
    var f = document.getElementById(inputId);
    if (f) f.focus();
    setTimeout(function(){ try { wrap.scrollIntoView({ behavior: "smooth", block: "center" }); } catch(e){} }, 100);
  }
  return false;
}

// Envoi d'une réponse (appelé par le bouton ✓, la touche Entrée et le panneau
// GIF validé). arg = "postId|commentId".
function _submitReply(arg) {
  var parts = String(arg || "").split("|");
  var postId = parts[0], commentId = parts[1];
  var inp = document.getElementById("reply-input-" + commentId);
  if (!inp) return false;
  var text = (inp.value || "").trim();
  if (!text) return false;
  var thread = (typeof _findCommentThread === "function") ? _findCommentThread(postId) : null;
  if (!thread && typeof findPostAnywhere === "function") { var _p = findPostAnywhere(postId); if (_p) thread = { comments: _p.comments || [], save: function(){ try{saveState();}catch(e){} } }; }
  if (!thread) return false;
  var comment = thread.comments.find(function(c){ return c.id === commentId; });
  if (!comment) return false;
  if (!Array.isArray(comment.replies)) comment.replies = [];
  var meId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : (state.user?.id || "me");
  comment.replies.push({ id: "reply_" + Date.now(), authorId: meId, text: text, createdAt: Date.now() });
  if (typeof thread.save === "function") thread.save(); else saveState();
  // Sync Supabase → la réponse apparaît chez tous les comptes.
  if (typeof supaCommentInteract === "function") supaCommentInteract(commentId, postId, "reply", text);
  if (comment.authorId && comment.authorId !== meId && comment.fromSupabase && typeof supaInsertNotif === "function") {
    try { supaInsertNotif(comment.authorId, "comment", postId, "a répondu à ton commentaire"); } catch(e) {}
  }
  if (typeof grantReward === "function") { try { grantReward("comment"); } catch(e){} }
  var w = inp.closest(".comment-reply-input"); if (w) w.remove();
  // Re-render unifié → la réponse s'affiche exactement comme partout ailleurs.
  if (typeof _refreshCommentThreadUI === "function") _refreshCommentThreadUI(postId);
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

// Réagir à un commentaire : panneau segmenté unifié (😊 Emoji | 🎬 GIF), même
// présentation que partout. Tap emoji = réaction appliquée ; pick GIF = réaction GIF.
function showEmojiPickerForComment(postId, commentId, event) {
  if (typeof emojiReactPanel === "function") {
    return emojiReactPanel(event,
      function(e){ addEmojiToComment(postId, commentId, e); },
      function(url){ addGifToComment(postId, commentId, url); });
  }
  return false;
}

// Un GIF sur un commentaire = une RÉPONSE (image inline), PAS une réaction du
// compteur. On l'ajoute comme réponse normale (texte = URL → rendue en image par
// _commentBodyHtml), synchronisée comme une réponse (kind "reply"). Plusieurs GIF
// possibles (c'est un commentaire, pas une réaction limitée à 1/personne).
function addGifToComment(postId, commentId, gifUrl) {
  console.log("🎬 addGifToComment → réponse:", postId, commentId);
  var found = (typeof _findCommentNode === "function") ? _findCommentNode(postId, commentId) : null;
  var thread = found && found.thread;
  var comment = found && found.node;
  if (!comment) return false;
  if (!Array.isArray(comment.replies)) comment.replies = [];
  var meId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : (state.user && state.user.id) || "me";
  comment.replies.push({ id: "reply_" + Date.now(), authorId: meId, text: gifUrl, createdAt: Date.now() });
  if (typeof thread.save === "function") thread.save(); else saveState();
  if (typeof supaCommentInteract === "function") supaCommentInteract(commentId, postId, "reply", gifUrl);
  if (comment.authorId && comment.authorId !== meId && comment.fromSupabase && typeof supaInsertNotif === "function") {
    try { supaInsertNotif(comment.authorId, "comment", postId, "a répondu avec un GIF"); } catch (e) {}
  }
  // Nouvelle réponse = la liste change → refresh (scroll préservé via _setThreadHtml).
  if (typeof _refreshCommentThreadUI === "function") _refreshCommentThreadUI(postId);
  if (typeof toast === "function") toast("GIF ajouté en commentaire 🎬");
  return false;
}

// Réagir à un POST du fil : même panneau segmenté unifié (😊 Emoji | 🎬 GIF).
function showEmojiPickerForPost(postId, event) {
  if (typeof emojiReactPanel === "function") {
    return emojiReactPanel(event,
      function(e){ addEmojiToPost(postId, e); },
      function(url){ addGifToPost(postId, url); });
  }
  return false;
}

// Réagir à un ÉVÉNEMENT IRL : même panneau segmenté unifié (😊 Emoji | 🎬 GIF).
// Tap emoji = réaction (❤️ → like, géré par applyEventEmojiReaction) ; pick GIF = réaction GIF.
function showEmojiPickerForEvent(eventId, event) {
  if (typeof emojiReactPanel === "function") {
    return emojiReactPanel(event,
      function(e){ if (typeof applyEventEmojiReaction === "function") applyEventEmojiReaction(eventId, [e]); if (typeof toast === "function") toast("Réaction envoyée " + e); },
      function(url){ if (typeof applyEventGifReaction === "function") applyEventGifReaction(eventId, url); if (typeof toast === "function") toast("GIF envoyé 🎬"); });
  }
  return false;
}

// ════════════════════════════════════════════════════════════════════════
// UNE SEULE RÉACTION PAR PERSONNE (emoji OU gif) — commune au fil, aux carnets
// CDV et aux commentaires/réponses. Tape un nouvel emoji → il REMPLACE le
// précédent ; re-tape le MÊME → il est retiré (toggle off). `arr` = post.reactions
// ou comment.replies (les vraies réponses texte, sans type de réaction, sont
// laissées intactes). Retourne { removedSame } : true = on a juste retiré (rien à
// (ré)insérer ni notifier côté serveur).
function _applyOneReaction(arr, text, type) {
  var meIds = [(typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : null, (state.user && state.user.id), "me"].filter(Boolean);
  // UNE seule réaction EMOJI par personne. Les GIF ne sont plus des réactions (ils
  // deviennent des commentaires/réponses) → on ne les touche PAS ici.
  var isMine = function (r) { return r && meIds.indexOf(r.authorId) > -1 && r.type === "emoji_reaction"; };
  var mine = arr.filter(isMine);
  var toggleOff = mine.length === 1 && mine[0].text === text;
  // Retirer MON emoji existant → un seul par personne.
  for (var i = arr.length - 1; i >= 0; i--) { if (isMine(arr[i])) arr.splice(i, 1); }
  if (toggleOff) return { removedSame: true };
  arr.push({
    id: type.replace("_reaction", "") + "_" + Math.random().toString(36).substr(2, 9),
    authorId: meIds[0] || "me",
    text: text,
    type: type,
    createdAt: Date.now()
  });
  return { removedSame: false };
}

function addEmojiToPost(postId, emoji) {
  console.log("✨ addEmojiToPost:", postId, emoji);
  var post = findPostAnywhere(postId);
  if (!post) return false;
  // post.reactions peut être un OBJET (réactions agrégées de bobines/messages) →
  // le forcer en tableau, sinon .push/.splice plantait et l'emoji « ne marchait pas ».
  if (!Array.isArray(post.reactions)) post.reactions = [];

  var res = _applyOneReaction(post.reactions, emoji, "emoji_reaction");
  // Sync Supabase (convention : comment_id === post_id ⇒ réaction portée par le
  // POST lui-même). On efface d'abord MES réactions (journal append-only) puis on
  // (ré)insère la nouvelle — sauf toggle off. Chargée par supaLoadPosts, propagée
  // par realtime:comment_interactions.
  if (typeof supaCommentRemoveReactions === "function") supaCommentRemoveReactions(postId);
  if (!res.removedSame) {
    if (typeof supaCommentInteract === "function") supaCommentInteract(postId, postId, "emoji", emoji);
    _notifyPostReaction(post, emoji);
  }

  if (typeof saveState === "function") saveState();
  updatePostReactionsUI(postId);
  return false;
}

// Notifie l'auteur du post d'une réaction reçue (cross-compte uniquement).
function _notifyPostReaction(post, face) {
  try {
    var me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
    if (post && post.authorId && post.authorId !== me && post.fromSupabase && typeof supaInsertNotif === "function") {
      supaInsertNotif(post.authorId, "like", post.id, "a réagi " + face + " à ton post");
    }
  } catch(e) {}
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

// Poste un GIF comme COMMENTAIRE (jamais comme réaction/compteur) sur un fil
// quelconque : post du fil, événement IRL ou live CDV. Le GIF = un commentaire
// dont le texte est l'URL, rendu en image par _commentBodyHtml. Sync selon le
// contexte (post_comments / event_comments / cdv_live_comments).
function _postGifComment(threadId, gifUrl) {
  var thread = (typeof _findCommentThread === "function") ? _findCommentThread(threadId) : null;
  if (!thread) return false;
  if (!Array.isArray(thread.comments)) thread.comments = [];
  var meId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : (state.user && state.user.id) || "me";
  var p = (typeof currentProfile === "function") ? currentProfile() : null;
  var nm = (p && p.name) || (state.user && state.user.name) || "Moi";
  var kind = thread.kind;
  var cid = (kind === "event" ? "ec_local_" : kind === "cdv" ? "lc_local_" : "c_") + (typeof uid === "function" ? uid() : Date.now());
  thread.comments.unshift({
    id: cid, authorId: meId, authorName: nm, author: nm,
    authorEmoji: (p && p.emoji) || "✨",
    text: gifUrl, content: gifUrl, createdAt: Date.now(), at: Date.now()
  });
  if (typeof thread.save === "function") thread.save();
  try {
    if (kind === "event" && typeof supaAddEventComment === "function") supaAddEventComment(threadId, gifUrl);
    else if (kind === "cdv" && typeof supaAddCdvLiveComment === "function") supaAddCdvLiveComment(threadId, gifUrl);
    else if (typeof supaAddComment === "function" && typeof MY_UID !== "undefined" && MY_UID) supaAddComment(threadId, gifUrl, cid);
  } catch (e) {}
  // Notifie l'auteur du fil (cross-compte).
  try {
    if (thread.targetUserId && thread.targetUserId !== meId && thread.fromSupabase && typeof supaInsertNotif === "function") {
      supaInsertNotif(thread.targetUserId, "comment", threadId, "a commenté avec un GIF");
    }
  } catch (e) {}
  if (typeof grantReward === "function") { try { grantReward("comment"); } catch (e) {} }
  if (typeof _refreshCommentThreadUI === "function") _refreshCommentThreadUI(threadId);
  if (kind === "event" && typeof _patchEventCommentsInline === "function") { try { _patchEventCommentsInline(threadId); } catch (e) {} }
  // Met à jour le compteur 💬 sur la carte du fil (si aucune vue commentaires ouverte).
  if (kind === "post" && typeof renderFeed === "function" && !document.getElementById("commentsBox")
      && !(document.getElementById("postDetailPage") && document.getElementById("postDetailPage").style.display === "flex")) {
    try { renderFeed(); } catch (e) {}
  }
  if (typeof toast === "function") toast("GIF ajouté en commentaire 🎬");
  return false;
}

function addGifToPost(postId, gifUrl) {
  console.log("🎬 addGifToPost → commentaire:", postId);
  return _postGifComment(postId, gifUrl);
}

// Met à jour EN PLACE la pastille « 😍 N » du post (fil + détail + carte carnet),
// même présentation que les réactions de commentaire. Patch ciblé (pas de re-render).
function updatePostReactionsUI(postId) {
  if (typeof _postReactChipHtml !== "function") return;
  document.querySelectorAll('[data-postchip="' + postId + '"]').forEach(function(h){
    h.innerHTML = _postReactChipHtml(postId);
  });
}

function addEmojiToComment(postId, commentId, emoji) {
  console.log("✨ addEmojiToComment:", postId, commentId, emoji);
  // commentId peut désigner un commentaire OU une réponse (_findCommentNode gère les deux).
  var found = (typeof _findCommentNode === "function") ? _findCommentNode(postId, commentId) : null;
  var thread = found && found.thread;
  var comment = found && found.node;
  if (!comment) return false;

  // UNE réaction par personne : le nouvel emoji remplace le précédent (re-tap =
  // toggle off). Les vraies réponses texte de node.replies restent intactes.
  if (!Array.isArray(comment.replies)) comment.replies = [];
  var res = _applyOneReaction(comment.replies, emoji, "emoji_reaction");
  if (typeof thread.save === "function") thread.save(); else saveState();
  // Sync Supabase → la réaction emoji apparaît chez tous les comptes (efface mes
  // réactions précédentes d'abord, sauf toggle off).
  if (typeof supaCommentRemoveReactions === "function") supaCommentRemoveReactions(commentId);
  if (!res.removedSame && typeof supaCommentInteract === "function") supaCommentInteract(commentId, postId, "emoji", emoji);
  console.log("✅ Emoji reaction added + synced:", emoji);

  // Patch EN PLACE la pastille « 😍 N » (fluidité : pas de rebuild du fil → scroll
  // et composeur de réponse ouvert préservés). Fallback refresh si non visible.
  if (typeof _patchCmtReact !== "function" || !_patchCmtReact(postId, commentId)) {
    if (typeof _refreshCommentThreadUI === "function") _refreshCommentThreadUI(postId);
  }
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
