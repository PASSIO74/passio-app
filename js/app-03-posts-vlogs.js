function closePost() {
  const page = document.getElementById("postDetailPage");
  const etaitOuverte = !!(page && page.style.display && page.style.display !== "none");
  if (page) page.querySelectorAll('video[data-video-public-src]').forEach(arreterVideoPublique);
  if (page) page.style.display = "none";
  // Reprend l'entrée posée par openPost — sinon elle reste morte sur la pile et
  // avale un appui « retour ». Inerte quand la fermeture VIENT d'un retour.
  if (etaitOuverte && typeof releaseOverlayHistory === "function") releaseOverlayHistory();
}

function sharePost(id) {
  const post = findPostAnywhere(id);
  if (!post) { toast("Le contenu original n'est plus disponible."); return; }

  const passion = passionById(post.passion) || { label: post.passion || "", emoji: "✨" };
  const txt = (post.text || post.caption || "").slice(0, 100);

  const html = `
    <div class="modal-title">${shareIconSvg(20)} Partager ce post</div>
    <div style="background:var(--bg-soft);border-radius:14px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:var(--text-dim);line-height:1.5;">
      ${escapeHtml(txt)}${txt.length >= 100 ? "…" : ""}
    </div>
    <button class="btn primary block" id="_shareInFeedBtn" onclick="sharePostInFeed('${escapeJsArg(id)}')" style="margin-bottom:10px;">
      Partager dans mon feed
    </button>
    <button class="btn secondary block" id="_shareOutBtn">
      ${shareIconSvg(16)} Partager en dehors
    </button>
  `;
  openModal(html);
  // Listener propre : évite l'injection de texte utilisateur dans un onclick inline
  setTimeout(() => {
    const btn = document.getElementById("_shareOutBtn");
    if (!btn) return;
    btn.addEventListener("click", function() {
      // Un carnet partagé doit OUVRIR le carnet, pas la page d'accueil.
      // ⚠️ Plus de lien profond `#carnet-<id>` : le Carnet de voyage a été retiré
      // (ADR-011 §6) et plus AUCUN routeur ne l'attrape. Le lien promettait
      // d'ouvrir un carnet et déposait le destinataire sur le fil, sans un mot.
      const shareUrl = "https://passio-app.netlify.app";
      partagerOuCopier({ title: "PASSIO", text: txt, url: shareUrl }, "Lien copié");
    });
  }, 0);
}

async function sharePostInFeed(id) {
  const btn = document.getElementById("_shareInFeedBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Partage en cours…"; }

  if (typeof MY_UID === "undefined" || !MY_UID) {
    toast("Connexion requise pour partager ce contenu.");
    closeModal();
    return;
  }

  const post = findPostAnywhere(id);
  if (!post) { toast("Le contenu original n'est plus disponible."); closeModal(); return; }

  try { window.tel && tel.action("share_post", { postId: id }); } catch (e) {}

  const prof = currentProfile();
  const g = state.user.general || {};
  let authorName = g.username || prof?.name || "Moi";

  if (!g.username && typeof supa !== "undefined" && supa && MY_UID) {
    try {
      const { data } = await supa.from("profiles").select("username").eq("id", MY_UID).maybeSingle();
      if (data?.username) { state.user.general.username = data.username; authorName = data.username; }
    } catch(e) {}
  }

  const passion = passionById(post.passion) || { label: post.passion || "", emoji: "✨" };
  const txt = post.text || post.caption || "";

  const newPost = {
    id: "post_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
    type: "text",
    authorId: MY_UID,
    authorName: authorName,
    authorEmoji: prof?.emoji || g.emoji || "✨",
    authorColor: prof?.color || g.color || "#8b5cf6",
    // ⚠️ PAS d'escapeHtml : voir la note de `shareReelInFeed` (app-05) — `text`
    // est échappé à l'affichage, l'échapper ici le fait passer deux fois.
    text: `📤 A partagé un post\n\n${passion.emoji} ${post.authorName || "Passionné"} – ${passion.label}\n\n"${txt.slice(0, 150)}${txt.length > 150 ? "…" : ""}"`,
    // Le repartage est MA publication : il hérite du classement de la source
    // quand celui-ci peut partir, et retombe sur le mien sinon. `posts` est en
    // politique OBLIGATOIRE (ADR-010) — `null` ferait refuser l'envoi.
    passion: passionDeRepartage(post.passion),
    mood: post.mood || "all",
    createdAt: Date.now(),
    timestamp: Date.now(),
    likes: 0,
    comments: [],
    sharedReel: id,
    sharedReelData: {
      id: post.id,
      text: txt,
      authorName: post.authorName || "Passionné",
      authorEmoji: post.authorEmoji || "✨",
      authorColor: post.authorColor || "#8b5cf6",
      passion: post.passion
    }
  };

  if (!state.userPosts) state.userPosts = [];
  // ⚠️ Refus AVANT la mutation locale — cf. `mePublish` (app-08). Le bouton est
  // rendu à son état initial : le geste a échoué, il doit rester possible.
  if (typeof publicationRefuseeFautePassion === "function"
      && publicationRefuseeFautePassion(newPost.passion)) {
    if (btn) { btn.disabled = false; btn.textContent = "Partager dans mon fil"; }
    closeModal();
    return;
  }
  state.userPosts.push(newPost);
  saveState();

  closeModal();
  setTimeout(() => { goTo("feed"); setTimeout(() => renderFeed(), 100); }, 100);
  toast("Publication partagée avec succès.", "success");

  if (typeof supa !== "undefined" && supa) {
    try {
      const syncPromise = supaPublishPostWithRetry(newPost);
      const timeout = new Promise(resolve => setTimeout(() => resolve(false), 5000));
      const ok = await Promise.race([syncPromise, timeout]);
      if (!ok) console.warn("⚠️ [SHARE] Sync timeout — partagé localement uniquement");
    } catch(e) {
      console.warn("⚠️ [SHARE] Erreur sync:", e.message);
      toast("Impossible de partager ce contenu pour le moment.");
    }
  }
}

// Verrou anti-double-clic : empêche deux likes simultanés sur le même post
const _likePending = new Set();

// Les compteurs publics ne s'abonnent plus aux likes de TOUT le réseau.
// Au plus trois HEAD exacts, séquentiels, par créneau de 15–16,5 s ; aucune
// liste d'identifiants n'est téléchargée (ni tronquée par max-rows).
const POST_LIKE_REFRESH_MS = 15000;
const POST_LIKE_REFRESH_JITTER_MS = 1500;
const POST_LIKE_REFRESH_MAX_POSTS = 3;
let _postLikeRefreshTimer = null;
let _postLikeRefreshDueAt = 0;
let _postLikeRefreshRunning = false;
let _postLikeRefreshBusy = false;
let _postLikeRefreshEpoch = 0;
let _postLikeRefreshNextAt = 0;
let _postLikeRefreshIdentity = null;
let _postLikeRefreshObserver = null;
const _postLikeRefreshEntries = new Map();
window._postLikeRefreshStats = { cycles: 0, reads: 0, updated: 0, errors: 0, discarded: 0 };

function _postLikeIdentity() {
  return String(typeof MY_UID === "undefined" ? "" : MY_UID) + ":"
    + (typeof _profileCacheGeneration === "undefined" ? 0 : _profileCacheGeneration);
}
function _postLikeEntry(id) {
  const identity = _postLikeIdentity();
  if (identity !== _postLikeRefreshIdentity) {
    _postLikeRefreshIdentity = identity;
    _postLikeRefreshEntries.clear();
    _postLikeRefreshEpoch++;
  }
  if (!_postLikeRefreshEntries.has(id)) {
    // Une longue session ne conserve pas l'historique de toutes les cartes.
    if (_postLikeRefreshEntries.size >= 300) {
      for (const [key, value] of _postLikeRefreshEntries) {
        if (!value.pending) { _postLikeRefreshEntries.delete(key); break; }
      }
    }
    _postLikeRefreshEntries.set(id, { version: 0, pending: 0, checkedAt: 0 });
  }
  return _postLikeRefreshEntries.get(id);
}
function _postLikeMutationBegin(id) {
  const entry = _postLikeEntry(id);
  if (!entry.pending) entry.confirmedLiked = (state.user.likedPosts || []).includes(id);
  entry.version++;
  entry.pending++;
  entry.intent = (entry.intent || 0) + 1;
  return { identity: _postLikeIdentity(), entry, intent: entry.intent };
}
function _postLikeMutationEnd(id, token) {
  if (!token || token.identity !== _postLikeIdentity() || _postLikeRefreshEntries.get(id) !== token.entry) return;
  token.entry.pending = Math.max(0, token.entry.pending - 1);
  token.entry.version++;
  _postLikeRefreshWake();
}
function _postLikeCopies(id) {
  return Array.from(new Set(allPostCopies(id).concat(
    (window._feedExtraPosts || []).filter(p => p.id === id),
    (window._visited && window._visited.posts || []).filter(p => p.id === id),
    (typeof reelsState === "undefined" ? [] : reelsState.items || []).filter(p => p.id === id)
  )));
}
// Le chargement complet du fil reste utile, mais sa réponse peut précéder un
// HEAD plus récent ou une intention locale. Il ne doit pas les écraser ensuite.
function _postLikeReadToken(id) {
  const entry = _postLikeEntry(id);
  return { entry, version: entry.version };
}
function _postLikeReconcileLoaded(post, token) {
  const entry = _postLikeRefreshEntries.get(post.id);
  if (entry && token && (entry !== token.entry || entry.pending || entry.version !== token.version)) {
    const current = _postLikeCopies(post.id)[0];
    if (current) { post.likes = current.likes; post.liked = current.liked; }
  }
  return post;
}

// La géométrie seule compterait aussi le fil CACHÉ sous une fiche/modale.
// On intersecte les scrollports, puis vérifie que la carte reçoit réellement
// un point de l'écran. Même chemin pour fil, profil, détail et bobines.
function _postLikeCardVisible(card) {
  if (!card || !card.isConnected || !card.getClientRects().length) return false;
  const rect = card.getBoundingClientRect();
  let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
  let right = Math.min(window.innerWidth, rect.right), bottom = Math.min(window.innerHeight, rect.bottom);
  for (let node = card; node && node.nodeType === 1; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
    if (node !== card) {
      const clip = node.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
    }
  }
  if (right - left < 2 || bottom - top < 2) return false;
  return [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]].some(function (point) {
    const hit = document.elementFromPoint(left + (right - left) * point[0], top + (bottom - top) * point[1]);
    return hit && card.contains(hit);
  });
}
function _postLikeVisibleIds() {
  if (document.hidden || window._rechargementImminent === true) return [];
  // Les visiteurs n'avaient déjà aucun CDC : leur ajouter ces HEAD coûterait
  // sans rien économiser. Même autorité et même repli que supaSubscribe.
  if (typeof connexionTempsReelAutorisee === "function" && !connexionTempsReelAutorisee()) return [];
  const ids = new Set();
  document.querySelectorAll('.post[data-postid], .reel-item[data-post-id]').forEach(function (card) {
    const id = card.getAttribute("data-postid") || card.getAttribute("data-post-id");
    const post = id && _postLikeCopies(id).find(p => p.fromSupabase);
    if (!post || (typeof isBlocked === "function" && isBlocked(post.authorId))) return;
    if (card.closest("#visitedContent") && window._visited && window._visited.locked) return;
    if (!(typeof postSupprime === "function" && postSupprime(id)) && _postLikeCardVisible(card)) ids.add(id);
  });
  return Array.from(ids);
}
function _postLikeRefreshWake() {
  if (!_postLikeRefreshRunning) return;
  if (document.hidden) {
    _postLikeRefreshEpoch++;
    clearTimeout(_postLikeRefreshTimer);
    _postLikeRefreshTimer = null;
    return;
  }
  if (_postLikeRefreshBusy) return;
  const delay = Math.max(200, _postLikeRefreshNextAt - Date.now());
  // Les animations/modifications du DOM ne repoussent jamais un rendez-vous
  // déjà plus proche : un défilement continu ne doit pas affamer le compteur.
  if (_postLikeRefreshTimer !== null && _postLikeRefreshDueAt <= Date.now() + delay) return;
  clearTimeout(_postLikeRefreshTimer);
  _postLikeRefreshTimer = null;
  _postLikeRefreshDueAt = Date.now() + delay;
  _postLikeRefreshTimer = setTimeout(_postLikeRefreshTour, delay);
}
async function _postLikeRefreshTour() {
  _postLikeRefreshTimer = null;
  if (!_postLikeRefreshRunning || _postLikeRefreshBusy || document.hidden) return;
  if (Date.now() < _postLikeRefreshNextAt) { _postLikeRefreshWake(); return; }
  _postLikeRefreshBusy = true;
  let queried = false;
  try {
    if (!window._supaReal || navigator.onLine === false || typeof supa === "undefined" || !supa) return;
    const ids = _postLikeVisibleIds();
    const candidates = ids.map(id => ({ id, entry: _postLikeEntry(id) }))
      .filter(item => !item.entry.pending)
      .sort((a, b) => a.entry.checkedAt - b.entry.checkedAt)
      .slice(0, POST_LIKE_REFRESH_MAX_POSTS);
    if (!candidates.length) return;
    queried = true;
    const identity = _postLikeIdentity(), epoch = _postLikeRefreshEpoch;
    _postLikeRefreshNextAt = Date.now() + POST_LIKE_REFRESH_MS + Math.floor(Math.random() * POST_LIKE_REFRESH_JITTER_MS);
    window._postLikeRefreshStats.cycles++;
    for (const { id, entry } of candidates) {
      if (!_postLikeRefreshRunning || navigator.onLine === false || identity !== _postLikeIdentity() || epoch !== _postLikeRefreshEpoch || !_postLikeVisibleIds().includes(id)) break;
      if (entry.pending) continue;
      const version = entry.version;
      entry.checkedAt = Date.now(); // rotation, même sur erreur : pas de famine des autres cartes
      window._postLikeRefreshStats.reads++;
      let result;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        let query = supa.from("post_likes").select("post_id", { count: "exact", head: true }).eq("post_id", id);
        if (typeof query.abortSignal === "function") query = query.abortSignal(controller.signal);
        result = await query;
      } catch (e) { result = { error: e }; }
      finally { clearTimeout(timeout); }
      // Un zéro est un résultat ; NULL, un refus ou une réponse périmée n'en est pas un.
      if (!result || result.error || !Number.isSafeInteger(result.count) || result.count < 0) {
        window._postLikeRefreshStats.errors++;
        continue;
      }
      if (!_postLikeRefreshRunning || identity !== _postLikeIdentity() || epoch !== _postLikeRefreshEpoch
          || _postLikeRefreshEntries.get(id) !== entry || entry.pending || entry.version !== version
          || !_postLikeVisibleIds().includes(id)) {
        window._postLikeRefreshStats.discarded++;
        continue;
      }
      const copies = _postLikeCopies(id);
      copies.forEach(function (post) { post.likes = result.count; }); // MON liked reste local
      entry.version++;
      const post = copies[0];
      if (post) _paintPostLike(id, !!post.liked || (state.user.likedPosts || []).includes(id), result.count, null, false);
      window._postLikeRefreshStats.updated++;
    }
  } finally {
    _postLikeRefreshBusy = false;
    if (_postLikeRefreshRunning && !document.hidden) {
      const delay = Math.max(200, _postLikeRefreshNextAt - Date.now(), queried ? 0 : POST_LIKE_REFRESH_MS);
      _postLikeRefreshDueAt = Date.now() + delay;
      _postLikeRefreshTimer = setTimeout(_postLikeRefreshTour, delay);
    }
  }
}
function startPostLikeRefresh() {
  if (_postLikeRefreshRunning) { _postLikeRefreshWake(); return; }
  _postLikeRefreshRunning = true;
  _postLikeRefreshEpoch++;
  if (!_postLikeRefreshObserver) {
    _postLikeRefreshObserver = new MutationObserver(_postLikeRefreshWake);
    _postLikeRefreshObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
    document.addEventListener("scroll", _postLikeRefreshWake, { capture: true, passive: true });
    document.addEventListener("visibilitychange", _postLikeRefreshWake);
    window.addEventListener("pageshow", _postLikeRefreshWake);
    window.addEventListener("resize", _postLikeRefreshWake, { passive: true });
    window.addEventListener("online", _postLikeRefreshWake);
  }
  _postLikeRefreshWake();
}
function stopPostLikeRefresh() {
  _postLikeRefreshRunning = false;
  _postLikeRefreshEpoch++;
  clearTimeout(_postLikeRefreshTimer);
  _postLikeRefreshTimer = null;
}

// Micro-interactions de like (façon Instagram/Facebook).
// Petit « pop » du bouton au like.
function _likePop(el) {
  if (!el) return;
  try { el.classList.remove("like-pop"); void el.offsetWidth; el.classList.add("like-pop"); } catch (e) {}
  setTimeout(function () { try { el.classList.remove("like-pop"); } catch (e) {} }, 360);
}
// Gros cœur qui « éclot » au centre d'un conteneur média (double-tap pour liker).
function _heartBurst(container) {
  if (!container) return;
  try {
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    var h = document.createElement("div");
    h.className = "heart-burst"; h.textContent = "❤️";
    container.appendChild(h);
    setTimeout(function () { try { h.remove(); } catch (e) {} }, 860);
  } catch (e) {}
}
// Double-tap sur le média d'un post (vue détail) = LIKE (jamais unlike, comme IG)
// + éclosion du cœur. Met à jour le bouton ❤️ en place avec un pop.
function _dblLikeDetail(postId, ev) {
  var cont = ev && (ev.currentTarget || ev.target);
  _heartBurst(cont && cont.classList && cont.classList.contains("dbl-like") ? cont : (cont && cont.closest ? cont.closest(".dbl-like") : cont));
  if (!(state.user.likedPosts || []).includes(postId)) {
    var btn = document.querySelector("#postDetailContent .post-actions .post-action");
    if (typeof likePostDetail === "function") likePostDetail(postId, btn);
    _likePop(btn);
  }
}

// Repeint TOUS les boutons ❤️ d'un post, RETROUVÉS dans le DOM au moment de
// l'appel — jamais via une référence mémorisée. ⚠️ Ne JAMAIS garder un nœud à
// travers un `await` : entre le clic et la réponse serveur, le fil peut être
// reconstruit (post reçu en realtime, retour sur l'écran) ; le bouton d'origine
// est alors détaché et le repeindre revient à peindre un fantôme, invisible pour
// l'utilisateur. Renvoie le nombre de boutons effectivement repeints.
function _paintPostLike(id, liked, count, el, pop) {
  var done = [];
  function paint(n) {
    if (!n || done.indexOf(n) > -1) return;
    done.push(n);
    n.classList.toggle("liked", liked);
    n.innerHTML = (liked ? "❤️" : "🤍") + " " + count;
    if (liked && pop) _likePop(n);
  }
  // Fil et toute surface qui rend une carte de post.
  document.querySelectorAll('[data-postid="' + id + '"] [data-action="like"]').forEach(paint);
  // Cartes carnet CDV, viewer de carnet… (le même post peut être visible sur
  // plusieurs surfaces à la fois).
  document.querySelectorAll('[data-postlike="' + id + '"]').forEach(paint);
  // Vue détail : son ❤️ ne porte aucun attribut, mais sa barre d'actions contient
  // la pastille data-postchip et le like en est la PREMIÈRE action (même
  // convention que _dblLikeDetail). Garde : on ne repeint que si le contenu a
  // bien la forme d'un compteur de like.
  document.querySelectorAll('[data-postchip="' + id + '"]').forEach(function (chip) {
    var bar = chip.closest ? chip.closest(".post-actions") : null;
    var first = bar ? bar.querySelector(".post-action") : null;
    if (first && /[❤🤍]/.test(first.textContent || "")) paint(first);
  });
  if (el && el.isConnected) paint(el);
  // Bobines : structure différente (icône + label séparé), pas de innerHTML.
  document.querySelectorAll('[data-reellike="' + id + '"]').forEach(function (n) {
    n.classList.toggle("liked", liked);
    var lab = n.querySelector(".reel-action-label");
    if (lab) lab.textContent = count;
    done.push(n);
  });
  return done.length;
}

// Applique (ou révoque) MON like dans l'état local. Isolé de l'écriture réseau :
// l'annulation rejoue exactement l'inverse, en delta (et non par restauration
// d'un instantané, qui écraserait un like reçu d'autrui entre-temps).
// ⚠️ post.liked ET state.user.likedPosts doivent rester en phase : le fil rend
// depuis likedPosts, patchPostLikeDom (echo realtime) depuis post.liked.
function _applyLikeLocally(id, liked) {
  var post = findPostAnywhere(id);
  var list = state.user.likedPosts || (state.user.likedPosts = []);
  var at = list.indexOf(id);
  if (liked && at === -1) list.push(id);
  if (!liked && at > -1) list.splice(at, 1);
  // ⚠️ TOUTES les copies, pas seulement celle que findPostAnywhere renvoie. Un post
  // publié existe à la fois dans userPosts et dans supabasePosts ; le fil affiche
  // la copie SERVEUR alors que findPostAnywhere rend la copie LOCALE. On incrémentait
  // donc un compteur invisible : le cœur passait rouge, le nombre ne bougeait pas.
  var copies = _postLikeCopies(id);
  copies.forEach(function (p) {
    p.liked = liked;
    p.likes = Math.max(0, (p.likes || 0) + (liked ? 1 : -1));
  });
  saveState();
  return post;
}

// Écrit MON like en base, dans le sens VOULU par l'utilisateur. Renvoie { ok, error }.
//
// ⚠️ Remplace l'ancien supaToggleLike (app-08, supprimé), qui relisait post_likes pour
// DÉDUIRE le sens de l'écriture : dès que l'état local et la base divergeaient
// (like perdu hors-ligne, action faite depuis un autre appareil), le clic écrivait
// l'INVERSE de ce que l'utilisateur voyait — sans la moindre erreur. Et comme le
// hook fetch tague la PREMIÈRE requête du flow, le centre de pilotage affichait
// « écriture serveur confirmée » alors que c'était la LECTURE qui était taguée.
// Ici : une seule requête, l'écriture, et la confirmation est explicite.
//
// Deuxième correctif : le SDK Supabase ne LÈVE PAS sur un refus RLS, il renvoie
// { error }. Sans lire ce champ, un ❤️ rejeté restait allumé jusqu'au prochain
// chargement, où il disparaissait sans explication.
//
// Idempotent : post_likes a pour clé primaire (post_id, user_id) → ré-aimer un
// post déjà aimé renvoie 23505, l'état voulu est atteint, c'est un succès ; un
// delete qui ne touche aucune ligne l'est aussi.
async function supaSetPostLike(postId, want, cid) {
  var out = { ok: false, error: null };
  try {
    if (typeof supa === "undefined" || !supa || typeof MY_UID === "undefined" || !MY_UID) {
      out.error = { message: "session absente" };
    } else if (want) {
      var ins = await supa.from("post_likes").insert({ post_id: postId, user_id: MY_UID });
      var dup = ins && ins.error && String(ins.error.code) === "23505";
      out = { ok: !!(!ins || !ins.error || dup), error: (ins && ins.error) || null };
    } else {
      // ⚠️ « Zéro ligne supprimée » n'est un succès idempotent que si la ligne était
      // DÉJÀ absente. Sous RLS, ça peut aussi vouloir dire « ligne présente mais
      // invisible à la policy DELETE » : le like restait alors en base et
      // réapparaissait au rechargement, sans que rien ne l'ait signalé. On demande
      // donc les lignes supprimées et on vérifie qu'il n'en restait pas une.
      var del = await supa.from("post_likes").delete()
        .eq("post_id", postId).eq("user_id", MY_UID).select("post_id");
      if (del && del.error) {
        out = { ok: false, error: del.error };
      } else if (del && Array.isArray(del.data) && del.data.length === 0) {
        // Rien supprimé : la ligne existait-elle ? Si oui, la policy l'a filtrée.
        var chk = await supa.from("post_likes").select("post_id")
          .eq("post_id", postId).eq("user_id", MY_UID).maybeSingle();
        var restante = !!(chk && chk.data);
        out = restante
          ? { ok: false, error: { message: "like non retiré (policy DELETE)" } }
          : { ok: true, error: null };
      } else {
        out = { ok: true, error: null };
      }
    }
  } catch (e) { out = { ok: false, error: e }; }
  // Confirmation EXPLICITE de l'enregistrement pour le traçage : le contrat ne
  // peut plus prendre une lecture (ni une notification) pour une écriture.
  try {
    if (window.tel && cid) {
      tel.step(cid, "saved", out.ok ? "ok" : "error",
        out.ok ? null : { detail: String((out.error && out.error.message) || out.error || "").slice(0, 120) });
      tel.flowEnd(cid, out.ok ? "ok" : "error");
    }
  } catch (e) {}
  return out;
}

function likePost(id, skipRender = false, el = null) {
  // Mode invité (première visite) : cette action engage le compte. Le gate
  // EXPLIQUE l'action puis propose la création de compte ; il ne rejoue jamais
  // l'action après coup. Rend `true` — donc inerte — hors mode invité.
  if (window.requireAuthentication && !requireAuthentication("aimer")) return;
  const post = findPostAnywhere(id);
  // Clics sans effet : ils étaient avalés en silence — l'utilisateur voyait un
  // bouton qui ne réagit pas, et le centre de pilotage ne voyait RIEN (pas même
  // un « clic mort », puisqu'on sortait avant d'ouvrir la chaîne de validation).
  if (!post) {
    try { window.tel && tel.action("like_ignored", { postId: id, reason: "post_introuvable" }); } catch (e) {}
    toast("Ce contenu n'est plus disponible.");
    return;
  }
  if (_likePending.has(id)) {
    try { window.tel && tel.action("like_ignored", { postId: id, reason: "anti_double_clic" }); } catch (e) {}
    return;
  }
  _likePending.add(id);
  setTimeout(() => _likePending.delete(id), 800);

  const liked = state.user.likedPosts.includes(id);
  const want = !liked;                       // état VOULU par l'utilisateur
  // Pas d'écriture serveur pour le contenu de DÉMO : ses identifiants (p48,
  // pac_yoga, reel_seed_*) n'existent dans aucune table, la ligne écrite n'est
  // donc jamais recomptée nulle part — 28 des 66 likes de la prod étaient de ces
  // orphelins (le like partait en base et disparaissait au rechargement). Les
  // posts locaux non encore synchronisés gardent leur écriture : la publication
  // conserve l'identifiant local, la ligne redevient valide une fois le post
  // envoyé. Ouvrir une chaîne de validation pour un post de démo produirait en
  // plus un faux « clic mort » au pilotage.
  const isDemoPost = !post.fromSupabase && (state.seed.posts || []).some(p => p.id === id);
  const willWrite = typeof supa !== "undefined" && supa
    && typeof MY_UID !== "undefined" && MY_UID && !isDemoPost;

  try { window.tel && tel.action(want ? "like_post" : "unlike_post", { postId: id }); } catch (e) {}
  var _cid = null;
  if (willWrite) {
    try { if (window.tel && tel.flowStart) _cid = tel.flowStart(want ? "like_post" : "unlike_post", { postId: id }); } catch (e) {}
  }

  // Mise à jour optimiste : l'affichage ne dépend JAMAIS du réseau.
  const refreshMutation = willWrite ? _postLikeMutationBegin(id) : null;
  _applyLikeLocally(id, want);
  if (want) {
    try { supaTrack("like_post", { passion: post.passion }); } catch(_) {}
  }
  // Repeint en place plutôt que reconstruire le fil (perte de scroll, panels
  // ouverts, saisies en cours). Repli sur renderFeed() si aucun bouton n'a été
  // trouvé dans le DOM.
  const painted = _paintPostLike(id, want, post.likes || 0, el, true);
  if (!painted && !skipRender) renderFeed();

  if (!willWrite) return;

  // Écriture serveur : on envoie l'INTENTION, on ne la re-déduit pas de la base.
  // Deux intentions espacées de >800 ms restent possibles pendant un réseau
  // lent. On conserve leur ordre en base et n'annule jamais une intention plus
  // récente en recevant l'échec de l'ancienne.
  const write = Promise.resolve(refreshMutation.entry.writeTail).catch(function () {}).then(function () {
    if (refreshMutation.identity !== _postLikeIdentity()) return { ok: false };
    return supaSetPostLike(id, want, _cid);
  });
  refreshMutation.entry.writeTail = write;
  write.catch(function (error) { return { ok: false, error }; }).then(function (res) {
    if (refreshMutation.identity !== _postLikeIdentity()
        || _postLikeRefreshEntries.get(id) !== refreshMutation.entry) return;
    if (res && res.ok) refreshMutation.entry.confirmedLiked = want;
    if (refreshMutation.intent !== refreshMutation.entry.intent) return;
    if (res && res.ok) {
      if (want && post.fromSupabase && post.authorId && post.authorId !== MY_UID) {
        supaInsertNotif(post.authorId, "like", id, "a aimé ton post");
      }
      return;
    }
    // Échec RÉEL de l'écriture → on annule l'affichage optimiste. Laisser un ❤️
    // qui n'existe pas en base, c'est le faire disparaître au prochain
    // chargement, sans que personne ne comprenne pourquoi.
    const confirmed = refreshMutation.entry.confirmedLiked;
    const p2 = (state.user.likedPosts || []).includes(id) === confirmed
      ? findPostAnywhere(id) : _applyLikeLocally(id, confirmed);
    _paintPostLike(id, confirmed, p2 ? (p2.likes || 0) : 0, null, false);
    toast(want ? "Ton j'aime n'a pas pu être enregistré." : "Le retrait du j'aime n'a pas pu être enregistré.");
  }).finally(function () { _postLikeMutationEnd(id, refreshMutation); });
}

// ===== DOC VIEWER — SUPPRIMÉ (ADR-009) =====
// Les deux documents « Passia expliqué » et la visionneuse qui les affichait ne
// s'ouvraient que depuis l'onglet Crypto du Wallet, lui-même retiré. Ils
// décrivaient un système qui n'existe plus.

// ══════════════════════════════════════════════════════════════════════════
// CARNET DE VOYAGE — FONCTIONNALITÉ RETIRÉE (refonte multi-passion, §6)
// ──────────────────────────────────────────────────────────────────────────
// Tout le moteur « Carnet de voyage » vivait ici, de la ligne 366 à la fin du
// fichier : éditeur de carnet, viewer plein écran, CDV Live et ses étapes,
// commentaires et réactions d'étape, « Mes lieux », passeport de voyage,
// statistiques, géocodage, liens profonds `#cdv-live-<id>` et `#carnet-<id>`.
// Environ 4 500 lignes, retirées d'un bloc — leur seule porte d'entrée était
// l'écran CDV, lui-même supprimé.
//
// ⚠️ AUCUNE DONNÉE N'EST DÉTRUITE, et c'est délibéré : les carnets déjà écrits
// restent dans `localStorage["passio_cdv_lives"]`, dans les publications de
// type `vlog` (locales comme distantes) et dans les tables `cdv_*` de la base.
// Aucune migration destructive n'accompagne ce retrait ; si la fonctionnalité
// revient, elle retrouvera ce qui a été produit.
//
// ⚠️ CE QUI RESTE, et pourquoi. `_kmBetween` (distance entre deux points) est
// gardée ci-dessous : `app-07` s'en sert pour trier les activités IRL par
// proximité. Elle n'a rien de spécifique au voyage — c'est de la géométrie.
// La retirer avec le reste aurait cassé le tri « le plus proche » de l'écran
// Rencontrer, sans qu'aucune erreur ne le dise (l'appel est gardé par un
// `typeof`, donc la distance serait simplement retombée à 0 partout).
// ══════════════════════════════════════════════════════════════════════════

function _kmBetween(a, b) {
  if (!a || !b) return 0;
  var R = 6371, rad = Math.PI / 180;
  var dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  var la1 = a[0] * rad, la2 = b[0] * rad;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
