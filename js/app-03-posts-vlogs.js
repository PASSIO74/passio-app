function closePost() {
  const page = document.getElementById("postDetailPage");
  if (page) page.style.display = "none";
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
    <button class="btn primary block" id="_shareInFeedBtn" onclick="sharePostInFeed('${id}')" style="margin-bottom:10px;">
      ➕ Partager dans mon feed
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
      const shareUrl = post.type === "vlog"
        ? (location.origin + location.pathname + "#carnet-" + id)
        : "https://passio-app.netlify.app";
      if (navigator.share) {
        navigator.share({ title: "PASSIO", text: txt, url: shareUrl }).catch(() => {});
      } else {
        navigator.clipboard?.writeText(txt + "\n\n" + shareUrl)
          .then(() => toast("✅ Lien copié"))
          .catch(() => toast("Copie impossible"));
      }
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
    text: `📤 A partagé un post\n\n${passion.emoji} ${escapeHtml(post.authorName || "Passionné")} – ${passion.label}\n\n"${escapeHtml(txt).slice(0, 150)}${txt.length > 150 ? "…" : ""}"`,
    passion: post.passion || null,
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
  state.userPosts.push(newPost);
  saveState();

  closeModal();
  setTimeout(() => { goTo("feed"); setTimeout(() => renderFeed(), 100); }, 100);
  toast("✅ Publication partagée avec succès.");

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

function likePost(id, skipRender = false, el = null) {
  if (_likePending.has(id)) return;
  _likePending.add(id);
  setTimeout(() => _likePending.delete(id), 800);

  const post = findPostAnywhere(id);
  if (!post) { _likePending.delete(id); return; }
  const liked = state.user.likedPosts.includes(id);
  if (liked) {
    state.user.likedPosts = state.user.likedPosts.filter(x => x !== id);
    post.likes = Math.max(0, (post.likes || 1) - 1);
    post.liked = false;
  } else {
    state.user.likedPosts.push(id);
    post.likes = (post.likes || 0) + 1;
    post.liked = true;
    bumpQuest("like");
    try { supaTrack("like_post", { passion: post.passion }); } catch(_) {}
  }
  saveState();

  // Mise à jour en place : évite de reconstruire tout le fil (perte de scroll,
  // panels ouverts, états de saisie). On cherche le bouton via el (passé par
  // l'onclick inline) ou via data-postid dans le DOM.
  const nowLiked = !liked;
  var _btn = el || (function() {
    var art = document.querySelector('[data-postid="' + id + '"]');
    return art ? art.querySelector('[data-action="like"]') : null;
  })();
  // Boutons portant data-postlike (carte carnet CDV, viewer de carnet…) : le même
  // post peut être visible sur plusieurs surfaces à la fois → on les repeint TOUS.
  var _all = document.querySelectorAll('[data-postlike="' + id + '"]');
  [].forEach.call(_all, function (n) {
    n.classList.toggle("liked", nowLiked);
    n.innerHTML = (nowLiked ? "❤️" : "🤍") + " " + (post.likes || 0);
    if (nowLiked) _likePop(n);
  });
  if (_btn) {
    _btn.classList.toggle("liked", nowLiked);
    _btn.innerHTML = (nowLiked ? "❤️" : "🤍") + " " + (post.likes || 0);
    if (nowLiked) _likePop(_btn);
  } else if (!_all.length && !skipRender) {
    renderFeed();
  }

  // Sync avec Supabase
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    supaToggleLike(id);
    if (!liked && post && post.authorId && post.authorId !== MY_UID && post.fromSupabase) {
      supaInsertNotif(post.authorId, "like", id, "a aimé ton post");
    }
  }
}

// ===== DOC VIEWER, Passia (simple + complet embarqués) =====
const DOC_PASSIA_SIMPLE = `
<span class="doc-viewer-header-tag">VERSION SIMPLE · 3 MIN DE LECTURE</span>
<h1>Passia, expliqué simplement</h1>
<p style="font-style: italic; color: #6b6480;">Sans jargon, et sans rien te promettre.</p>
<div class="doc-callout">
  <div class="doc-callout-title">L'essentiel en 4 points</div>
  <p>• Aujourd'hui, Passia (💎) est un <b>point de fidélité interne</b> à l'app.</p>
  <p>• Il n'a <b>aucune valeur en euros</b> et ne peut pas être revendu ou converti.</p>
  <p>• Tu en gagnes en participant, tu en dépenses pour soutenir des créateurs dans l'app.</p>
  <p>• Une évolution « crypto » est <b>à l'étude</b> pour l'avenir, mais rien n'est décidé.</p>
</div>

<h1>1. C'est quoi Passia, aujourd'hui ?</h1>
<p>Passia, c'est un compteur de fidélité dans PASSIO. Tu en gagnes en publiant, en aidant, en participant. Tu peux t'en servir dans l'app pour soutenir des créateurs ou débloquer certaines options.</p>
<p>C'est un peu comme les points de fidélité d'un magasin : utiles à l'intérieur du système, mais ce n'est pas de l'argent et on ne peut pas les échanger contre des euros.</p>

<h1>2. Et la « cryptomonnaie » dont on parle ?</h1>
<p>C'est une <b>piste que nous explorons</b> pour le futur : donner un jour à la communauté une vraie souveraineté sur ce qu'elle crée. Mais c'est une réflexion, pas un produit.</p>
<div class="doc-callout amber">
  <div class="doc-callout-title">Ce qui est vrai à ce jour</div>
  <p>Aucun token n'existe. Rien n'est en vente. Aucune date n'est fixée. Une telle évolution ne se ferait que dans un cadre légal strict (réglementation européenne MiCA) et après des audits de sécurité.</p>
</div>

<h1>3. Ce qu'il ne faut pas croire</h1>
<div class="doc-callout red">
  <div class="doc-callout-title">Passia n'est pas un investissement</div>
  <p>Personne ne peut te promettre que Passia « prendra de la valeur ». Ne considère jamais tes Passia comme un placement, et méfie-toi de quiconque te promettrait des gains.</p>
</div>
<div class="doc-callout red">
  <div class="doc-callout-title">Attention aux arnaques</div>
  <p>Toute proposition du type « double tes Passia » (sur Discord, Telegram, X…) est une arnaque. PASSIO n'a aucun programme de ce genre et ne te demandera jamais de payer pour en recevoir.</p>
</div>

<h1>4. En résumé</h1>
<div class="doc-callout green">
  <div class="doc-callout-title">À retenir</div>
  <p>Passia = points de fidélité internes, sans valeur monétaire ni conversion à ce jour.</p>
  <p>Tu ne participes pas pour « gagner de l'argent », mais parce que tu crois au projet et à sa communauté.</p>
  <p>Toute évolution future sera annoncée clairement, encadrée par la loi, et n'aura jamais valeur de promesse de gain.</p>
</div>
`;

const DOC_PASSIA_FULL = `
<span class="doc-viewer-header-tag">NOTE D'INTENTION · PISTE À L'ÉTUDE</span>
<h1>Passia — points de fidélité & réflexion sur l'avenir</h1>
<p style="font-style: italic; color: #6b6480;">Document d'information. Ni offre, ni conseil en investissement, ni promesse de rendement.</p>

<div class="doc-callout red">
  <div class="doc-callout-title">⚠️ Avertissement, à lire en premier</div>
  <p>À ce jour, Passia est un <b>point de fidélité interne</b> à PASSIO : il n'a aucune valeur monétaire, n'est pas convertible en euros et n'est pas transférable hors de l'application.</p>
  <p>Aucun « token » crypto n'existe et aucun n'est proposé à l'achat. Ce document décrit une <b>réflexion</b> sur une évolution possible. Il ne constitue ni une offre, ni un conseil financier, ni une garantie. Rien n'est décidé ni daté.</p>
</div>

<h1>1. Où en est-on aujourd'hui</h1>
<p>Dans PASSIO, Passia (💎) récompense la participation : créer, aider, organiser, échanger. Il se dépense à l'intérieur de l'app (soutenir un créateur, débloquer des options). C'est un système fermé, comparable à des points de fidélité : utile dans l'app, mais sans valeur de revente.</p>

<h1>2. La piste que nous explorons</h1>
<p>À long terme, nous étudions la possibilité de donner à la communauté une plus grande souveraineté sur ce qu'elle crée. L'objectif serait de moins dépendre d'un système fermé — mais uniquement <b>si</b> cela peut se faire de façon sûre et conforme à la loi.</p>
<p>Cette réflexion peut aboutir… ou pas. Un « go / no-go » honnête fait partie du processus : il est tout à fait possible que cette évolution ne voie jamais le jour.</p>

<h1>3. Nos principes non négociables</h1>
<ul>
  <li><b>Pas de promesse de gain.</b> Nous n'annoncerons jamais de prix, de projection de valeur ou de rendement.</li>
  <li><b>La loi d'abord.</b> Aucune étape sans conformité au cadre européen (MiCA) et validation juridique.</li>
  <li><b>La sécurité d'abord.</b> Aucune ouverture sans audits indépendants et garde-fous utilisateurs.</li>
  <li><b>Transparence.</b> Les règles seraient publiques et vérifiables, pas décidées en coulisses.</li>
  <li><b>Protection des plus vulnérables.</b> Contrôle d'âge, plafonds et prévention resteraient prioritaires.</li>
</ul>

<h1>4. Les risques, en toute honnêteté</h1>
<div class="doc-callout amber">
  <div class="doc-callout-title">Si une telle évolution voyait le jour</div>
  <p>Tout actif transférable peut voir sa valeur varier fortement, y compris chuter. Il n'existerait aucune garantie de conserver ou de récupérer une quelconque valeur.</p>
</div>
<ul>
  <li><b>Risque de marché</b> : la valeur d'un actif numérique est volatile et imprévisible.</li>
  <li><b>Risque produit</b> : le projet dépend de son adoption ; il peut ne pas se concrétiser.</li>
  <li><b>Risque réglementaire</b> : le cadre légal évolue et peut empêcher ou retarder toute évolution.</li>
  <li><b>Risque technique</b> : toute technologie comporte des failles possibles.</li>
</ul>
<div class="doc-callout red">
  <div class="doc-callout-title">Règle de bon sens</div>
  <p>Ne considère jamais des points de fidélité comme une épargne ou un investissement. Méfie-toi de toute promesse de gain : elle ne viendrait pas de PASSIO.</p>
</div>

<h1>5. Ce que tu peux faire aujourd'hui</h1>
<p>Utiliser Passia pour ce à quoi il sert : soutenir les créateurs et faire vivre la communauté dans l'app. C'est là que se trouve sa vraie utilité — pas dans une éventuelle valeur future.</p>

<div class="doc-callout">
  <div class="doc-callout-title">La phrase qui résume tout</div>
  <p>Tu ne détiens pas une promesse de gain : tu participes à une communauté. Toute évolution future sera annoncée clairement, encadrée par la loi, et sans jamais valoir promesse de rendement.</p>
</div>
`;

function openDoc(which) {
  const html = which === 'simple' ? DOC_PASSIA_SIMPLE : DOC_PASSIA_FULL;
  document.getElementById('docViewerBody').innerHTML = html;
  document.getElementById('docViewer').classList.add('open');
  document.getElementById('docViewer').setAttribute('aria-hidden', 'false');
  document.body.classList.add('doc-open');
  document.body.style.overflow = 'hidden';
  // Reset scroll en haut
  document.getElementById('docViewer').scrollTop = 0;
}

function closeDocViewer() {
  document.getElementById('docViewer').classList.remove('open');
  document.getElementById('docViewer').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('doc-open');
  document.body.style.overflow = '';
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const v = document.getElementById('docViewer');
    if (v && v.classList.contains('open')) closeDocViewer();
  }
});

// ===== CARNET DE VOYAGE (VLOG) =====
const vlogState = {
  cover: null,
  steps: [],
};

// ── BROUILLON AUTOMATIQUE DU CARNET ──────────────────────────────────────────
// Un carnet, c'est 20 minutes d'écriture (destination, dates, N étapes, bilan,
// conseil). Rien n'était sauvegardé : un `goTo` involontaire, un onglet fermé ou
// un rechargement PWA et TOUT était perdu — la première cause d'abandon possible
// sur cette fonctionnalité. On persiste donc en continu (sans les médias base64,
// trop lourds pour localStorage : seule l'URL d'un média déjà uploadé est gardée).
const VLOG_DRAFT_KEY = "passio_vlog_draft_v1";
const VLOG_DRAFT_FIELDS = ["vlogDestination", "vlogDateStart", "vlogDateEnd", "vlogBudget", "vlogTransport", "vlogLodging", "vlogSeason", "vlogTip"];

function saveVlogDraft() {
  try {
    var fields = {};
    VLOG_DRAFT_FIELDS.forEach(function (id) { var el = $("#" + id); if (el) fields[id] = el.value || ""; });
    var keep = function (v) { return typeof v === "string" && v.indexOf("data:") !== 0 ? v : null; };
    var steps = (vlogState.steps || []).map(function (s) {
      return { place: s.place || "", text: s.text || "", tip: s.tip || "",
        photo: keep(s.photo), video: keep(s.video), audio: keep(s.audio) };
    });
    var hasContent = Object.keys(fields).some(function (k) { return fields[k]; })
      || steps.some(function (s) { return s.place || s.text || s.tip; });
    if (!hasContent) { localStorage.removeItem(VLOG_DRAFT_KEY); return; }
    localStorage.setItem(VLOG_DRAFT_KEY, JSON.stringify({ fields: fields, steps: steps, cover: keep(vlogState.cover), at: Date.now() }));
  } catch (e) {}
}

function getVlogDraft() {
  try { return JSON.parse(localStorage.getItem(VLOG_DRAFT_KEY) || "null"); } catch (e) { return null; }
}
function clearVlogDraft() { try { localStorage.removeItem(VLOG_DRAFT_KEY); } catch (e) {} }

// Restaure le brouillon dans le Studio (appelé depuis la bannière de reprise).
function restoreVlogDraft() {
  var d = getVlogDraft();
  if (!d) return;
  VLOG_DRAFT_FIELDS.forEach(function (id) { var el = $("#" + id); if (el && d.fields && d.fields[id] != null) el.value = d.fields[id]; });
  vlogState.cover = d.cover || null;
  if (d.cover && $("#vlogCoverPreview")) $("#vlogCoverPreview").innerHTML = '<img loading="lazy" decoding="async" class="vlog-cover-preview" src="' + safeUrlAttr(d.cover) + '" alt="Cover"/>';
  vlogState.steps = (d.steps || []).map(function (s) { return Object.assign({ id: uid() }, s); });
  if (!vlogState.steps.length) vlogState.steps = [{ id: uid(), place: "", text: "", tip: "", photo: null }];
  renderVlogSteps();
  var b = document.getElementById("vlogDraftBanner");
  if (b) b.remove();
  toast("📔 Brouillon restauré");
}

function discardVlogDraft() {
  clearVlogDraft();
  var b = document.getElementById("vlogDraftBanner");
  if (b) b.remove();
  toast("Brouillon supprimé");
}

// Bannière « reprendre le brouillon » en tête de la vue Carnet du Studio.
function renderVlogDraftBanner() {
  var host = $("#studioVlog");
  var old = document.getElementById("vlogDraftBanner");
  if (old) old.remove();
  var d = getVlogDraft();
  if (!host || !d) return;
  var when = (typeof fmtTime === "function") ? fmtTime(d.at) : "";
  var dest = (d.fields && d.fields.vlogDestination) || "carnet sans titre";
  var div = document.createElement("div");
  div.id = "vlogDraftBanner";
  div.style.cssText = "background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.3);border-radius:12px;padding:12px;margin-bottom:12px;";
  div.innerHTML = '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">📝 Brouillon en cours</div>'
    + '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px;">« ' + escapeHtml(dest) + ' » · ' + escapeHtml(when) + '</div>'
    + '<div style="display:flex;gap:8px;">'
    + '<button class="btn primary" style="flex:1;font-size:12px;padding:8px;" onclick="restoreVlogDraft()">Reprendre</button>'
    + '<button class="btn ghost" style="font-size:12px;padding:8px;" onclick="discardVlogDraft()">Supprimer</button>'
    + '</div>';
  host.insertBefore(div, host.firstChild);
}

// Autosave : toute frappe dans la vue Carnet du Studio (champs bilan + étapes).
document.addEventListener("input", function (e) {
  var t = e.target;
  if (!t || !t.id && !t.closest) return;
  var inVlog = (t.id && VLOG_DRAFT_FIELDS.indexOf(t.id) > -1) || (t.closest && t.closest(".vlog-step"));
  if (!inVlog) return;
  clearTimeout(window._vlogDraftTimer);
  window._vlogDraftTimer = setTimeout(saveVlogDraft, 600);
});
window.addEventListener("pagehide", function () { try { if (studioType === "vlog") saveVlogDraft(); } catch (e) {} });

// Templates de pré-remplissage
const VLOG_TEMPLATES = {
  weekend: {
    nbDays: 3,
    placeholders: ["Centre-ville", "Quartier alternatif", "Sortie matinale + retour"],
    transport: "Train + métro",
    lodging: "Hôtel ou Airbnb",
    season: "toute l'année",
    tip: "Réserve les restos populaires 48h à l'avance, c'est l'astuce qu'on oublie sur les week-ends courts."
  },
  roadtrip: {
    nbDays: 5,
    placeholders: ["Ville de départ", "Étape nature", "Ville étape", "Sentier panoramique", "Retour"],
    transport: "Voiture + parfois ferry",
    lodging: "Auberges + 1 camping",
    season: "mai-septembre",
    tip: "Trace ton parcours sur Google Maps offline avant de partir, coupures de réseau garanties."
  },
  etranger: {
    nbDays: 7,
    placeholders: ["Arrivée capitale", "Quartier historique", "Excursion 1 jour", "Ville secondaire", "Site naturel", "Plage / détente", "Retour"],
    transport: "Avion + train local",
    lodging: "Mix hôtel + auberge",
    season: "à confirmer",
    tip: "Achète une carte SIM locale dès l'aéroport, beaucoup moins cher que le roaming et plus rapide."
  },
  nature: {
    nbDays: 4,
    placeholders: ["Camp de base", "Sommet du jour 1", "Lac d'altitude", "Retour vallée"],
    transport: "Voiture + marche",
    lodging: "Refuge + bivouac",
    season: "juin-septembre",
    tip: "Vérifie la météo en montagne 3 jours avant, un orage peut tout changer."
  },
  culturel: {
    nbDays: 5,
    placeholders: ["Musée principal", "Vieille ville", "Monument emblématique", "Quartier des arts", "Site archéologique"],
    transport: "Train + à pied",
    lodging: "Hôtel central",
    season: "avril-octobre",
    tip: "Pass culturel acheté en ligne avant le départ : économie 30 % et tu coupes la queue."
  },
  blank: {
    nbDays: 0, placeholders: [], transport: "", lodging: "", season: "", tip: ""
  }
};

function applyVlogTemplate(kind) {
  const tpl = VLOG_TEMPLATES[kind];
  if (!tpl) return;

  // Marquer le template actif
  document.querySelectorAll(".vlog-template-btn").forEach(function(btn) { btn.classList.remove("active"); });
  var clickedBtn = document.querySelector('.vlog-template-btn[onclick*="' + kind + '"]');
  if (clickedBtn) clickedBtn.classList.add("active");

  // Pré-remplir les champs si vides
  if (tpl.transport && $("#vlogTransport") && !$("#vlogTransport").value) $("#vlogTransport").value = tpl.transport;
  if (tpl.lodging && $("#vlogLodging") && !$("#vlogLodging").value) $("#vlogLodging").value = tpl.lodging;
  if (tpl.season && $("#vlogSeason") && !$("#vlogSeason").value) $("#vlogSeason").value = tpl.season;
  if (tpl.tip && $("#vlogTip") && !$("#vlogTip").value) $("#vlogTip").value = tpl.tip;

  // Générer les étapes templates (en remplaçant celles existantes si vides)
  const isEmpty = (vlogState.steps || []).every(s => !s.place && !s.text && !s.photo);
  if (kind === "blank") {
    if (isEmpty) {
      vlogState.steps = [{ id: uid(), place: "", text: "", tip: "", photo: null }];
    }
  } else if (isEmpty || !vlogState.steps || vlogState.steps.length === 0) {
    vlogState.steps = (tpl.placeholders || []).map((ph) => ({
      id: uid(), place: ph, text: "", tip: "", photo: null
    }));
  }
  renderVlogSteps();
  toast(`✨ Modèle « ${kind === "weekend" ? "Week-end" : kind === "roadtrip" ? "Road trip" : kind === "etranger" ? "Voyage étranger" : kind === "nature" ? "Aventure nature" : kind === "culturel" ? "Voyage culturel" : "Vierge"} » appliqué`);
}

function moveVlogStep(stepId, direction) {
  const idx = vlogState.steps.findIndex(s => s.id === stepId);
  if (idx === -1) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= vlogState.steps.length) return;
  const tmp = vlogState.steps[idx];
  vlogState.steps[idx] = vlogState.steps[newIdx];
  vlogState.steps[newIdx] = tmp;
  renderVlogSteps();
}

// Carnets sauvegardés (favoris)
function savedCarnets() {
  return state.user.savedCarnets || [];
}
function isCarnetSaved(postId) {
  return savedCarnets().includes(postId);
}
function toggleCarnetSave(postId) {
  state.user.savedCarnets = state.user.savedCarnets || [];
  const idx = state.user.savedCarnets.indexOf(postId);
  if (idx === -1) {
    state.user.savedCarnets.push(postId);
    toast("⭐ Carnet sauvegardé dans tes favoris");
  } else {
    state.user.savedCarnets.splice(idx, 1);
    toast("Carnet retiré des favoris");
  }
  saveState();
  // Re-render le viewer s'il est ouvert
  const vw = $("#vlogViewer");
  if (vw && vw.classList.contains("open")) {
    const currentId = vw.getAttribute("data-current-post");
    if (currentId) openVlogViewer(currentId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODIFIER UN CARNET PUBLIÉ
// Un carnet, c'est un long récit : jusqu'ici le menu ⋯ ne proposait que
// « supprimer », donc une faute dans la destination ou une étape oubliée
// obligeait à TOUT resaisir. On recharge le carnet dans l'éditeur CDV et la
// publication met à jour la ligne existante au lieu d'en créer une nouvelle.
// ═══════════════════════════════════════════════════════════════════════════
// Co-auteurs d'un carnet (cache local alimenté par supaLoadCarnetCollaborators).
function carnetCollaborators(post) {
  if (!post) return [];
  if (Array.isArray(post.collaborators)) return post.collaborators;
  var c = window._carnetCollabs && window._carnetCollabs[post.id];
  return Array.isArray(c) ? c : [];
}

// Qui peut modifier un carnet : son auteur OU un co-auteur (miroir client de la
// policy `can_edit_post`).
function canEditCarnet(post) {
  if (!post) return false;
  var me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  if (post.authorId === me || post.authorId === "me" || post._source === "me") return true;
  return carnetCollaborators(post).indexOf(me) > -1;
}

function editCarnet(postId) {
  var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!post || post.type !== "vlog") { toast("Carnet introuvable"); return; }
  if (!canEditCarnet(post)) { toast("Tu ne peux modifier que tes carnets (ou ceux où tu es co-auteur)"); return; }

  closeVlogViewer();
  window._editingCarnetId = postId;
  activateStudioVlog();

  if ($("#vlogDestination")) $("#vlogDestination").value = post.destination || "";
  if ($("#vlogDateStart")) $("#vlogDateStart").value = post.dateStart || "";
  if ($("#vlogDateEnd")) $("#vlogDateEnd").value = post.dateEnd || "";
  if ($("#vlogBudget")) $("#vlogBudget").value = post.budget || "";
  if ($("#vlogTransport")) $("#vlogTransport").value = post.transport || "";
  if ($("#vlogLodging")) $("#vlogLodging").value = post.lodging || "";
  if ($("#vlogSeason")) $("#vlogSeason").value = post.season || "";
  if ($("#vlogTip")) $("#vlogTip").value = post.tip || "";
  vlogState.cover = post.cover || null;
  if ($("#vlogCoverPreview")) {
    $("#vlogCoverPreview").innerHTML = post.cover
      ? '<img loading="lazy" decoding="async" class="vlog-cover-preview" src="' + safeUrlAttr(post.cover) + '" alt="Cover"/>'
      : "";
  }
  // On garde les coordonnées déjà résolues : pas de re-géocodage inutile.
  vlogState.steps = (post.steps || []).map(function (s) {
    return { id: uid(), place: s.place || "", text: s.text || "", tip: s.tip || "",
      photo: s.photo || null, video: s.video || null, audio: s.audio || null,
      lat: (typeof s.lat === "number") ? s.lat : null, lng: (typeof s.lng === "number") ? s.lng : null };
  });
  if (!vlogState.steps.length) vlogState.steps = [{ id: uid(), place: "", text: "", tip: "", photo: null }];
  renderVlogSteps();
  _syncCarnetEditorMode();
  // Une modification ne doit pas être confondue avec un brouillon de création.
  var b = document.getElementById("vlogDraftBanner");
  if (b) b.remove();
  toast("✏️ Modifie ton carnet puis enregistre");
}

// ── Co-auteurs d'un carnet : inviter / retirer (auteur uniquement) ──
function openCarnetCollaborators(postId) {
  var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!post) return;
  var me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  var isOwner = post.authorId === me || post.authorId === "me" || post._source === "me";
  if (!isOwner) { toast("Seul l'auteur du carnet peut gérer les co-auteurs"); return; }

  var cols = carnetCollaborators(post);
  var listHtml = cols.length
    ? cols.map(function (uidC) {
        var u = (typeof userById === "function" && userById(uidC)) || {};
        return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">'
          + '<div class="avatar" style="background:' + (u.avatar || "#7c3aed") + ';width:30px;height:30px;font-size:14px;">' + (u.profileEmoji || "🌍") + '</div>'
          + '<div style="flex:1;font-size:13px;color:var(--text);">' + escapeHtml(u.name || "Passionné") + '</div>'
          + '<span onclick="removeCarnetCollaborator(\'' + escapeJsArg(postId) + '\',\'' + escapeJsArg(uidC) + '\')" style="cursor:pointer;color:#ef4444;font-size:12px;">Retirer</span>'
          + '</div>';
      }).join("")
    : '<div style="font-size:12px;color:var(--muted);padding:8px 0;">Personne pour l\'instant. Invite les personnes avec qui tu as voyagé : elles pourront compléter et corriger le carnet.</div>';

  openModal(
    '<div class="modal-handle"></div>'
    + '<span class="modal-close" onclick="closeModal()">×</span>'
    + '<div class="modal-title">👥 Co-auteurs du carnet</div>'
    + '<div id="carnetCollabList">' + listHtml + '</div>'
    + '<label class="field" style="margin-top:12px;"><span>Inviter quelqu\'un</span>'
    + '<input type="text" class="input" id="carnetCollabSearch" placeholder="Pseudo…" oninput="searchCarnetCollaborator(\'' + escapeJsArg(postId) + '\', this.value)"/></label>'
    + '<div id="carnetCollabResults" style="display:flex;flex-direction:column;gap:6px;"></div>'
  );
}

async function searchCarnetCollaborator(postId, q) {
  var box = document.getElementById("carnetCollabResults");
  if (!box) return;
  q = (q || "").trim();
  if (q.length < 2) { box.innerHTML = ""; return; }
  box.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:6px;">Recherche…</div>';
  var users = [];
  try { if (typeof supaSearchUsers === "function") users = (await supaSearchUsers(q)) || []; } catch (e) {}
  if (!users.length) {
    users = ((state.seed && state.seed.users) || [])
      .filter(function (u) { return (u.name || "").toLowerCase().indexOf(q.toLowerCase()) > -1; })
      .slice(0, 6)
      .map(function (u) { return { id: u.id, username: u.name, emoji: u.profileEmoji, color: u.avatar }; });
  }
  var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  var already = carnetCollaborators(post);
  var me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  users = users.filter(function (u) { return u.id !== me && already.indexOf(u.id) < 0; });
  if (!users.length) { box.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:6px;">Aucun compte trouvé</div>'; return; }
  box.innerHTML = users.slice(0, 6).map(function (u) {
    return '<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:10px;padding:8px;">'
      + '<div class="avatar" style="background:' + (u.color || "#7c3aed") + ';width:28px;height:28px;font-size:13px;">' + (u.emoji || "✨") + '</div>'
      + '<div style="flex:1;font-size:13px;color:var(--text);">' + escapeHtml(u.username || "Passionné") + '</div>'
      + '<button class="btn primary" style="font-size:11px;padding:6px 10px;" onclick="addCarnetCollaborator(\'' + escapeJsArg(postId) + '\',\'' + escapeJsArg(u.id) + '\',\'' + escapeJsArg(u.username || "Passionné") + '\')">Inviter</button>'
      + '</div>';
  }).join("");
}

async function addCarnetCollaborator(postId, userId, name) {
  var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!post) return;
  window._carnetCollabs = window._carnetCollabs || {};
  var cur = carnetCollaborators(post).slice();
  if (cur.indexOf(userId) > -1) return;
  cur.push(userId);
  post.collaborators = cur;
  window._carnetCollabs[postId] = cur;
  try { saveState(); } catch (e) {}
  if (typeof supaAddCarnetCollaborator === "function") await supaAddCarnetCollaborator(postId, userId);
  if (typeof supaInsertNotif === "function") {
    try { supaInsertNotif(userId, "comment", postId, "t'a invité·e à co-écrire son carnet"); } catch (e) {}
  }
  toast("👥 " + (name || "Invité") + " peut désormais compléter ce carnet");
  openCarnetCollaborators(postId);
}

function removeCarnetCollaborator(postId, userId) {
  var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!post) return;
  var cur = carnetCollaborators(post).filter(function (x) { return x !== userId; });
  post.collaborators = cur;
  window._carnetCollabs = window._carnetCollabs || {};
  window._carnetCollabs[postId] = cur;
  try { saveState(); } catch (e) {}
  if (typeof supaRemoveCarnetCollaborator === "function") supaRemoveCarnetCollaborator(postId, userId);
  toast("Co-auteur retiré");
  openCarnetCollaborators(postId);
}

// Ajuste titre et bouton selon création / modification.
function _syncCarnetEditorMode() {
  var editing = !!window._editingCarnetId;
  var t = document.getElementById("cdvEditorTitle");
  if (t) t.textContent = editing ? "✏️ Modifier le carnet" : "📔 Nouveau carnet";
  var b = document.getElementById("cdvPublishBtn");
  if (b) b.textContent = editing ? "✅ Enregistrer les modifications" : "✨ Publier mon carnet · +50 pts";
}

// ⭐ Favoris des LIVES. L'onglet « Mes favoris » ne couvrait que les carnets :
// un voyage en direct suivi puis terminé n'était plus retrouvable nulle part.
function savedLives() {
  return (state.user && state.user.savedLives) || [];
}
function isLiveSaved(liveId) {
  return savedLives().indexOf(liveId) > -1;
}
function toggleLiveSave(liveId, el) {
  state.user.savedLives = state.user.savedLives || [];
  var i = state.user.savedLives.indexOf(liveId);
  if (i === -1) { state.user.savedLives.push(liveId); toast("⭐ Voyage sauvegardé dans tes favoris"); }
  else { state.user.savedLives.splice(i, 1); toast("Voyage retiré des favoris"); }
  saveState();
  // Patch en place (toutes les cartes du même live) plutôt qu'un re-render global.
  var saved = isLiveSaved(liveId);
  document.querySelectorAll('[data-livesave="' + liveId + '"]').forEach(function (n) {
    n.textContent = saved ? "⭐" : "☆";
    n.setAttribute("title", saved ? "Sauvegardé" : "Sauvegarder");
  });
}

// "M'inspirer", duplique la STRUCTURE (pas le contenu) pour démarrer un nouveau carnet
function inspireFromCarnet(postId) {
  const post = (typeof findPostAnywhere === "function")
    ? findPostAnywhere(postId)
    : (state.userPosts.find(p => p.id === postId) || state.seed.posts.find(p => p.id === postId));
  if (!post || post.type !== "vlog") return;
  closeVlogViewer();
  // Ouvre l'éditeur de carnet (écran CDV) et le remplit avec la STRUCTURE.
  setTimeout(() => {
    activateStudioVlog();
    if ($("#vlogDestination")) $("#vlogDestination").value = "Mon " + (post.destination || "voyage");
    if ($("#vlogTransport")) $("#vlogTransport").value = post.transport || "";
    if ($("#vlogLodging")) $("#vlogLodging").value = post.lodging || "";
    if ($("#vlogSeason")) $("#vlogSeason").value = post.season || "";
    vlogState.cover = null;
    if ($("#vlogCoverPreview")) $("#vlogCoverPreview").innerHTML = "";
    vlogState.steps = (post.steps || []).map(s => ({
      id: uid(),
      place: s.place || "",
      text: "", tip: "", photo: null  // on copie SEULEMENT la structure / lieux, pas le contenu perso
    }));
    renderVlogSteps();
    toast("📔 Structure copiée. À toi d'écrire ton histoire.");
  }, 200);
}

// Organiser un voyage groupé à partir d'un carnet
function organizeGroupTrip(postId) {
  const post = (typeof findPostAnywhere === "function")
    ? findPostAnywhere(postId)
    : (state.userPosts.find(p => p.id === postId) || state.seed.posts.find(p => p.id === postId));
  if (!post || post.type !== "vlog") return;
  closeVlogViewer();
  setTimeout(() => {
    if (typeof openCreateEvent === "function") {
      openCreateEvent();
      // Pré-remplir si on peut accéder aux champs
      setTimeout(() => {
        // 🔧 FIX AUDIT 2026-06-10 : les vrais IDs du modal sont evTitle/
        // evCity/evDesc — le pré-remplissage "Voyage groupé" ne marchait jamais.
        const titleInput = document.getElementById("evTitle");
        const cityInput = document.getElementById("evCity");
        const descInput = document.getElementById("evDesc");
        if (titleInput) titleInput.value = "Voyage groupé : " + (post.destination || "destination");
        if (cityInput) cityInput.value = (post.destination || "").split(/[·,]/)[0].trim();
        if (descInput) descInput.value = "Inspiré du carnet de voyage de la communauté. " + ((post.steps || []).length) + " jours, " + (post.budget ? "budget ~" + post.budget : "à définir ensemble") + ". " + (post.tip || "");
      }, 250);
    } else {
      goTo("irl");
      toast("Crée un événement IRL pour organiser ce voyage groupé.");
    }
  }, 200);
}

// Stats calculées du carnet
function vlogStats(post) {
  const nbDays = (post.steps || []).length;
  let durée = nbDays;
  if (post.dateStart && post.dateEnd) {
    const ms = new Date(post.dateEnd).getTime() - new Date(post.dateStart).getTime();
    durée = Math.max(1, Math.round(ms / 86400000) + 1);
  }
  // Coût moyen par jour si budget connu
  let coutJour = null;
  if (post.budget) {
    const m = String(post.budget).match(/(\d[\d\s]*)/);
    if (m) {
      const total = parseInt(m[1].replace(/\s/g, ""), 10);
      if (!isNaN(total) && durée > 0) coutJour = Math.round(total / durée);
    }
  }
  // Photos
  const nbPhotos = (post.steps || []).filter(s => s.photo).length + (post.cover ? 1 : 0);
  return { nbDays, durée, coutJour, nbPhotos };
}

function addVlogStep() {
  vlogState.steps = vlogState.steps || [];
  vlogState.steps.push({ id: uid(), place: "", text: "", tip: "", photo: null });
  renderVlogSteps();
}

function removeVlogStep(stepId) {
  vlogState.steps = (vlogState.steps || []).filter(s => s.id !== stepId);
  renderVlogSteps();
}

function updateVlogStep(stepId, field, value) {
  const s = (vlogState.steps || []).find(x => x.id === stepId);
  if (!s) return;
  s[field] = value;
}

function renderVlogSteps() {
  const list = $("#vlogStepsList");
  if (!list) return;
  const steps = vlogState.steps || [];
  if (steps.length === 0) {
    list.innerHTML = `<div class="empty" style="padding:14px;"><div class="empty-text">Aucune étape pour le moment. Tap « + Ajouter un jour » pour commencer.</div></div>`;
    return;
  }
  list.innerHTML = steps.map((s, i) => `
    <div class="vlog-step" data-stepid="${s.id}">
      <div class="vlog-step-head">
        <span class="vlog-step-num">${i + 1}</span>
        <span class="vlog-step-title">Jour ${i + 1}</span>
        <div class="vlog-step-reorder">
          <button class="vlog-step-arrow" onclick="moveVlogStep('${s.id}', -1)" ${i === 0 ? "disabled" : ""} aria-label="Monter">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14 L12 8 L18 14"/></svg>
          </button>
          <button class="vlog-step-arrow" onclick="moveVlogStep('${s.id}', 1)" ${i === steps.length - 1 ? "disabled" : ""} aria-label="Descendre">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10 L12 16 L18 10"/></svg>
          </button>
        </div>
        <button class="vlog-step-remove" onclick="removeVlogStep('${s.id}')" aria-label="Supprimer ce jour">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5 L19 19"/><path d="M19 5 L5 19"/></svg>
        </button>
      </div>
      <input type="text" class="input" placeholder="Lieu (ex: Lisbonne · Alfama)" value="${escapeHtml(s.place || '')}" maxlength="60" oninput="updateVlogStep('${s.id}', 'place', this.value)" style="margin-bottom:6px;" />
      ${s.photo ? `<img loading="lazy" decoding="async" class="vlog-step-photo-thumb" src="${s.photo}" alt=""/>` : ''}
      ${s.video ? `<video class="vlog-step-photo-thumb" src="${s.video}" controls playsinline preload="metadata" style="max-height:160px;"></video>` : ''}
      ${s.audio ? `<audio src="${s.audio}" controls style="width:100%;margin:6px 0;"></audio>` : ''}
      <div class="vlog-step-media-row">
        <button class="vlog-step-media-btn" onclick="document.getElementById('vlogStepPhoto_${s.id}').click()" title="Ajouter / changer la photo">
          <span style="font-size:14px;">📷</span>
          <span>${s.photo ? "Changer photo" : "Photo"}</span>
        </button>
        <button class="vlog-step-media-btn" onclick="document.getElementById('vlogStepVideo_${s.id}').click()" title="Ajouter / changer la vidéo">
          <span style="font-size:14px;">🎥</span>
          <span>${s.video ? "Changer vidéo" : "Vidéo"}</span>
        </button>
        <button class="vlog-step-media-btn" onclick="document.getElementById('vlogStepAudio_${s.id}').click()" title="Ajouter / changer l'audio">
          <span style="font-size:14px;">🎙</span>
          <span>${s.audio ? "Changer audio" : "Audio"}</span>
        </button>
        ${s.photo || s.video || s.audio ? `<button class="vlog-step-media-btn vlog-step-media-clear" onclick="clearVlogStepMedia('${s.id}')" title="Retirer le média">✕</button>` : ''}
      </div>
      <input type="file" id="vlogStepPhoto_${s.id}" accept="image/*" style="display:none;" onchange="onVlogStepMediaChange(event, '${s.id}', 'photo')" />
      <input type="file" id="vlogStepVideo_${s.id}" accept="video/*" style="display:none;" onchange="onVlogStepMediaChange(event, '${s.id}', 'video')" />
      <input type="file" id="vlogStepAudio_${s.id}" accept="audio/*" style="display:none;" onchange="onVlogStepMediaChange(event, '${s.id}', 'audio')" />
      <textarea class="textarea" placeholder="Note du jour : ce que tu as vu, ressenti, mangé…" maxlength="400" style="min-height:60px;margin-top:6px;" oninput="updateVlogStep('${s.id}', 'text', this.value)">${escapeHtml(s.text || '')}</textarea>
      <input type="text" class="input" placeholder="💡 Conseil pratique (optionnel)" value="${escapeHtml(s.tip || '')}" maxlength="160" oninput="updateVlogStep('${s.id}', 'tip', this.value)" style="margin-top:6px;font-size:12px;" />
    </div>
  `).join("");
}

function onVlogStepMediaChange(e, stepId, kind) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const limit = kind === "video" ? 12 * 1024 * 1024 : kind === "audio" ? 5 * 1024 * 1024 : 3 * 1024 * 1024;
  if (f.size > limit) { toast(`Fichier ${kind} trop gros (limite ${limit / 1024 / 1024} Mo).`); return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    updateVlogStep(stepId, kind, ev.target.result);
    // Pour ne pas accumuler les médias sur une étape, on garde l'ancienne logique : photo, video et audio peuvent coexister
    renderVlogSteps();
  };
  reader.readAsDataURL(f);
}

function clearVlogStepMedia(stepId) {
  updateVlogStep(stepId, "photo", null);
  updateVlogStep(stepId, "video", null);
  updateVlogStep(stepId, "audio", null);
  renderVlogSteps();
}

function onVlogStepPhotoChange(e, stepId) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  if (f.size > 3 * 1024 * 1024) { toast("Photo > 3 Mo, compresse-la"); return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    updateVlogStep(stepId, "photo", ev.target.result);
    renderVlogSteps();
  };
  reader.readAsDataURL(f);
}

// Cover du carnet
document.addEventListener("click", (e) => {
  if (e.target.closest("#vlogCoverZone")) {
    const inp = $("#vlogCoverInput");
    if (inp) inp.click();
  }
});

document.addEventListener("change", (e) => {
  if (e.target && e.target.id === "vlogCoverInput") {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { toast("Cover > 4 Mo, compresse-la"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      vlogState.cover = ev.target.result;
      const prev = $("#vlogCoverPreview");
      if (prev) prev.innerHTML = `<img loading="lazy" decoding="async" class="vlog-cover-preview" src="${ev.target.result}" alt="Cover"/>`;
    };
    reader.readAsDataURL(f);
  }
});

// Viewer plein écran d'un carnet
function openVlogViewer(postId) {
  // findPostAnywhere inclut supabasePosts → ouvre aussi les carnets d'autres comptes.
  const post = (typeof findPostAnywhere === "function")
    ? findPostAnywhere(postId)
    : (state.userPosts.find(p => p.id === postId) || state.seed.posts.find(p => p.id === postId));
  if (!post || post.type !== "vlog") return;
  const author = post._source === "me" || post.profileId
    ? { name: state.user.name || "Toi", profileEmoji: "🌍", avatar: "#7c3aed" }
    : (userById(post.authorId) || { name: "Anonyme", profileEmoji: "🌍", avatar: "#7c3aed" });

  const fmtRange = (a, b) => {
    if (!a && !b) return "";
    const da = a ? new Date(a) : null;
    const db = b ? new Date(b) : null;
    const opts = { day: "numeric", month: "short", year: "numeric" };
    if (da && db) return `${da.toLocaleDateString("fr-FR", opts)} → ${db.toLocaleDateString("fr-FR", opts)}`;
    return (da || db).toLocaleDateString("fr-FR", opts);
  };

  const stepsHTML = (post.steps || []).map((st, i) => `
    <div class="vlog-viewer-step">
      <span class="vlog-viewer-step-day">JOUR ${i + 1}</span>
      ${st.place ? `<div class="vlog-viewer-step-place">📍 ${escapeHtml(st.place)}</div>` : ""}
      ${st.photo ? `<img loading="lazy" decoding="async" class="vlog-viewer-step-photo" src="${st.photo}" alt="" onerror="this.onerror=null;this.src='https://picsum.photos/seed/vlog-step-${i}-${postId}/720/480';"/>` : ""}
      ${st.video ? `<video class="vlog-viewer-step-photo" src="${st.video}" controls playsinline preload="metadata" style="background:#000;"></video>` : ""}
      ${st.audio ? `<audio src="${st.audio}" controls style="width:100%;margin:6px 0;"></audio>` : ""}
      ${st.text ? `<div class="vlog-viewer-step-text">${escapeHtml(st.text)}</div>` : ""}
      ${st.tip ? `<div class="vlog-viewer-step-tip">💡 ${escapeHtml(st.tip)}</div>` : ""}
    </div>
  `).join("");

  const practical = [];
  if (post.budget) practical.push(["Budget", post.budget]);
  if (post.transport) practical.push(["Transport", post.transport]);
  if (post.lodging) practical.push(["Logement", post.lodging]);
  if (post.season) practical.push(["Saison", post.season]);

  const stats = vlogStats(post);
  // Conserve l'index original de l'étape pour le numéro affiché sur la carte
  const mapPlaces = (post.steps || [])
    .map((s, i) => ({ place: s.place || "", dayNum: i + 1, ll: cdvStepLatLng(s) }))
    .filter(s => s.ll);
  // Lieux jamais géocodés (carnets antérieurs, destinations hors France) : on
  // complète en tâche de fond puis on re-rend — la carte se remplit toute seule.
  if ((post.steps || []).some(s => s && s.place && typeof s.lat !== "number")) _cdvBackfillCarnetCoords(post);
  // Pays traversés (bandeau de stats) : même logique, en tâche de fond.
  if (typeof _cdvBackfillCarnetCountries === "function") _cdvBackfillCarnetCountries(post);
  // Fallback : si aucune étape n'a pu être géolocalisée, on essaie la destination du carnet
  if (mapPlaces.length === 0 && post.destination) {
    const destLL = cityToLatLng(post.destination);
    if (destLL) mapPlaces.push({ place: post.destination, dayNum: 1, ll: destLL });
  }
  const hasMap = mapPlaces.length > 0;
  const isSaved = isCarnetSaved(postId);
  // Km parcourus + pays traversés (les deux chiffres signature d'un carnet de
  // voyage), calculés depuis les mêmes coordonnées que la carte ci-dessus.
  const tripSt = cdvTripStats(post.steps || [], { start: post.dateStart, end: post.dateEnd });

  const html = `
    ${post.cover ? `<img loading="lazy" decoding="async" class="vlog-viewer-cover" src="${post.cover}" alt="${escapeHtml(post.destination || '')}" onerror="this.onerror=null;this.src='https://picsum.photos/seed/vlog-${postId}/1280/720';"/>` : `<div class="vlog-viewer-cover"></div>`}
    <div class="vlog-viewer-body">
      <div class="vlog-viewer-title">${escapeHtml(post.destination || "Carnet de voyage")}</div>
      <div class="vlog-viewer-dates">${escapeHtml(fmtRange(post.dateStart, post.dateEnd))}</div>
      <div class="vlog-viewer-author">par ${escapeHtml(author.name)}${(function () {
        // Crédits des co-auteurs : un voyage à plusieurs se raconte à plusieurs.
        var cols = carnetCollaborators(post);
        if (!cols.length) return "";
        var names = cols.map(function (u) { return ((typeof userById === "function" && userById(u)) || {}).name || "un co-voyageur"; });
        return " · avec " + escapeHtml(names.join(", "));
      })()}</div>

      <div class="vlog-stats-bar">
        <div class="vlog-stat"><div class="vlog-stat-num">${stats.durée}</div><div class="vlog-stat-label">Jours</div></div>
        <div class="vlog-stat"><div class="vlog-stat-num">${stats.nbDays}</div><div class="vlog-stat-label">Étapes</div></div>
        ${tripSt.km ? `<div class="vlog-stat"><div class="vlog-stat-num">${tripSt.km >= 1000 ? (tripSt.km / 1000).toFixed(1).replace(".", ",") + "k" : tripSt.km}</div><div class="vlog-stat-label">Km</div></div>` : ""}
        ${tripSt.countries.length ? `<div class="vlog-stat"><div class="vlog-stat-num">${tripSt.countries.length}</div><div class="vlog-stat-label">Pays</div></div>` : ""}
        <div class="vlog-stat"><div class="vlog-stat-num">${stats.coutJour ? stats.coutJour + "€" : "—"}</div><div class="vlog-stat-label">Coût/jour</div></div>
        <div class="vlog-stat"><div class="vlog-stat-num">${stats.nbPhotos}</div><div class="vlog-stat-label">Photos</div></div>
      </div>
      ${tripSt.countries.length ? `<div class="cdv-stat-flags">${tripSt.countries.map(c => `<span>${cdvCountryFlag(c)} ${escapeHtml(c)}</span>`).join("")}</div>` : ""}

      ${hasMap ? `<div class="vlog-mini-map" id="vlogViewerMap"></div>` : `<div class="vlog-map-empty">📍 Lieux non géolocalisables sur la carte</div>`}
      ${mapPlaces.length > 1 ? `<button class="btn ghost block" style="font-size:12px;margin-bottom:12px;" onclick="closeModal();openCdvRouteReplay('${escapeJsArg(postId)}','carnet')">🎬 Rejouer l'itinéraire</button>` : ""}

      ${post.tip ? `<div class="vlog-viewer-tip">
        <div class="vlog-viewer-tip-label">⭐ LE CONSEIL CLÉ</div>
        ${escapeHtml(post.tip)}
      </div>` : ""}

      ${stepsHTML}

      ${practical.length > 0 ? `
        <div class="section-title" style="margin-top:24px;font-size:14px;">Bilan pratique</div>
        <div class="vlog-viewer-practical">
          ${practical.map(([l, v]) => `<div class="vlog-viewer-practical-item">
            <div class="vlog-viewer-practical-label">${escapeHtml(l)}</div>
            <div class="vlog-viewer-practical-value">${escapeHtml(v)}</div>
          </div>`).join("")}
        </div>` : ""}

      <div class="vlog-viewer-actions">
        <button class="vlog-action-btn ${isSaved ? "saved" : ""}" onclick="toggleCarnetSave('${postId}')">
          ${isSaved ? "⭐ Sauvegardé" : "☆ Sauvegarder"}
        </button>
        <button class="vlog-action-btn" onclick="saveItineraryPlaces('${postId}','carnet')">
          📍 Enregistrer les lieux
        </button>
        ${canEditCarnet(post) ? `<button class="vlog-action-btn" onclick="editCarnet('${postId}')">✏️ Modifier</button>` : ""}
        ${(post.authorId === ((typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me") || post._source === "me")
          ? `<button class="vlog-action-btn" onclick="openCarnetCollaborators('${postId}')">👥 Co-auteurs</button>` : ""}
        <button class="vlog-action-btn" onclick="inspireFromCarnet('${postId}')">
          📔 M'en inspirer
        </button>
        <button class="vlog-action-btn primary" onclick="organizeGroupTrip('${postId}')">
          🤝 Organiser un voyage groupé
        </button>
      </div>

      <div class="post-actions" style="margin-top:20px;">
        <span class="post-action ${(state.user.likedPosts || []).indexOf(postId) > -1 ? "liked" : ""}" data-postlike="${postId}" onclick="event.stopPropagation();likePost('${postId}', true, this)">${(state.user.likedPosts || []).indexOf(postId) > -1 ? "❤️" : "🤍"} ${post.likes || 0}</span>
        <span class="post-action" onclick="return showEmojiPickerForPost('${postId}', event);" title="Emoji & GIF">😊</span>
        <span class="post-action" onclick="event.stopPropagation();sharePost('${postId}')" title="Partager" aria-label="Partager">${shareIconSvg(18)}</span>
        <span class="post-react-chip-holder" data-postchip="${postId}" style="margin-left:auto;">${_postReactChipHtml(postId)}</span>
      </div>

      <div class="vlog-viewer-comments" style="margin-top:24px;border-top:1px solid var(--border);padding-top:16px;">
        <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:12px;">💬 Commentaires</div>
        <div id="vlogCommentsList" style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px;">
          <div style="font-size:12px;color:var(--muted);">Chargement…</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <input type="text" class="input" id="vlogCommentInput" placeholder="Écris un commentaire…" maxlength="500" style="flex:1;font-size:13px;padding:10px 12px;" onkeypress="if(event.key==='Enter')submitVlogComment('${postId}')"/>
          ${_cmtComposerToolsHtml("vlogCommentInput", "submitVlogComment", postId)}
          <button class="btn primary" onclick="submitVlogComment('${postId}')" style="font-size:13px;padding:10px 14px;">Envoyer</button>
        </div>
      </div>
    </div>
  `;
  $("#vlogViewerContent").innerHTML = html;
  $("#vlogViewer").classList.add("open");
  $("#vlogViewer").setAttribute("aria-hidden", "false");
  $("#vlogViewer").setAttribute("data-current-post", postId);
  // Bloque le scroll sous-jacent (app + body), scroll uniquement à l'intérieur du viewer
  document.body.classList.add("vlog-open");
  document.body.style.overflow = "hidden";
  // Reset du scroll du viewer en haut
  $("#vlogViewer").scrollTop = 0;

  // Charge / rend les commentaires du carnet (même système que le fil/IRL)
  _renderVlogComments(postId);

  // Co-auteurs (cross-compte) : chargés en arrière-plan puis crédités en tête.
  if (typeof supaLoadCarnetCollaborators === "function") {
    supaLoadCarnetCollaborators([postId]).then(function (m) {
      // null = requête impossible (hors-ligne / erreur) → on GARDE ce qu'on sait.
      if (!m || !Array.isArray(m[postId])) return;
      var cols = m[postId];
      window._carnetCollabs = window._carnetCollabs || {};
      var known = carnetCollaborators(post);
      window._carnetCollabs[postId] = cols;
      post.collaborators = cols;
      var vw = document.getElementById("vlogViewer");
      // Re-render seulement si la liste a réellement changé (pas de clignotement).
      if (cols.join(",") !== known.join(",") && vw && vw.classList.contains("open")
          && vw.getAttribute("data-current-post") === postId) openVlogViewer(postId);
    }).catch(function () {});
  }

  // Initialise la mini-carte si on a des points géolocalisés
  if (hasMap) {
    setTimeout(() => initVlogMiniMap(mapPlaces), 200);
  }
}

// Rend les commentaires d'un carnet dans le viewer plein écran (#vlogCommentsList).
// Le carnet EST un post (findPostAnywhere), donc on réutilise tel quel le renderer
// et le pipeline Supabase du fil (même fonctionnalité, mêmes commentaires).
async function _renderVlogComments(postId) {
  var box = document.getElementById("vlogCommentsList");
  if (!box) return;
  var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  var empty = '<div style="font-size:12px;color:var(--muted);">Aucun commentaire — sois le premier 💬</div>';
  var comments = (post && post.comments) || [];
  box.innerHTML = comments.length ? _renderCommentsList(comments, postId) : empty;
  // Charge les commentaires Supabase (cross-compte) EN ARRIÈRE-PLAN puis re-rend
  // sans jank (scroll préservé, no-op si inchangé). Cache 20 s partagé → réouverture
  // instantanée (même politique que le fil, cf. openComments/openPost).
  window._cmtThreadLoadedAt = window._cmtThreadLoadedAt || {};
  var _fresh = (Date.now() - (window._cmtThreadLoadedAt[postId] || 0)) < 20000;
  if (!_fresh && typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID && typeof supaLoadComments === "function") {
    try {
      var supaComments = await supaLoadComments(postId);
      if (supaComments && post) {
        var supaIds = supaComments.map(function(c){ return c.id; });
        var localOnly = comments.filter(function(c){ return supaIds.indexOf(c.id) < 0 && !c.fromSupabase; });
        var merged = supaComments.map(function(c){ return Object.assign({}, c, { text: c.content || c.text || "" }); })
          .concat(localOnly)
          .sort(function(a, b){ return (b.createdAt || 0) - (a.createdAt || 0); });
        post.comments = merged;
        if (typeof hydrateCommentInteractions === "function") { try { await hydrateCommentInteractions(post); } catch(e) {} }
        window._cmtThreadLoadedAt[postId] = Date.now();
        var box2 = document.getElementById("vlogCommentsList");
        var vv = document.getElementById("vlogViewer");
        if (box2 && vv && vv.getAttribute("data-current-post") === postId) {
          if (typeof _setThreadHtml === "function") _setThreadHtml(box2, post.comments.length ? _renderCommentsList(post.comments, postId) : empty);
          else box2.innerHTML = post.comments.length ? _renderCommentsList(post.comments, postId) : empty;
        }
      }
    } catch(e) {}
  }
}

// Publie un commentaire sur un carnet — calque exact de submitComment (fil).
function submitVlogComment(postId) {
  var inp = document.getElementById("vlogCommentInput");
  if (!inp) return;
  var text = inp.value.trim();
  if (text.length < 2) { toast("Trop court"); return; }
  var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!post) return;
  if (!post.comments) post.comments = [];
  var realAuthorId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  var p = (typeof currentProfile === "function") ? currentProfile() : null;
  var _cid = "c_" + uid();
  post.comments.unshift({
    id: _cid, authorId: realAuthorId,
    authorName: (p && p.name) || state.user.name || "Moi",
    authorEmoji: (p && p.emoji) || "✨",
    text: text, content: text, createdAt: Date.now(),
  });
  // S'assure que l'auteur est dans seed.users pour userById()
  var meEntry = { id: realAuthorId, name: (p && p.name) || state.user.name || "Moi", profileEmoji: (p && p.emoji) || "✨", avatar: (p && p.color) || "#8b5cf6" };
  state.seed.users = state.seed.users.filter(function(u){ return u.id !== realAuthorId; });
  state.seed.users.push(meEntry);
  if (typeof grantReward === "function") grantReward("comment");
  // Sync Supabase + notif auteur (mêmes règles que submitComment)
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID && typeof supaAddComment === "function") {
    supaAddComment(postId, text, _cid);
    if (post.authorId && post.authorId !== MY_UID && post.fromSupabase && typeof supaInsertNotif === "function") {
      supaInsertNotif(post.authorId, "comment", postId, "a commenté ton carnet");
    }
  }
  inp.value = "";
  _renderVlogComments(postId);
  if (typeof renderCdvScreen === "function") { try { renderCdvScreen(); } catch(e) {} }
}

function initVlogMiniMap(places) {
  const el = document.getElementById("vlogViewerMap");
  if (!el || !places.length) return;
  if (typeof L === "undefined") { ensureLeaflet().then(function(){ initVlogMiniMap(places); }).catch(function(){}); return; }
  // Évite double init
  if (el._leafletMap) { try { el._leafletMap.remove(); } catch(e) {} el._leafletMap = null; }

  try {
    // Zoom adapté : 13 pour un seul point (échelle ville), sinon fitBounds couvrira tout
    const initialZoom = places.length === 1 ? 13 : 11;
    const map = L.map(el, { zoomControl: true, attributionControl: false })
      .setView(places[0].ll, initialZoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);

    const bounds = [];
    places.forEach((p) => {
      const icon = L.divIcon({
        className: "passio-marker-wrap",
        html: `<div class="passio-marker">${p.dayNum || 1}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -16],
      });
      const m = L.marker(p.ll, { icon }).addTo(map);
      m.bindPopup(`<b>Jour ${p.dayNum || 1}</b><br/>${escapeHtml(p.place)}`);
      bounds.push(p.ll);
    });

    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 12 });
    }
    el._leafletMap = map;
    // 2 invalidateSize successifs pour gérer le délai d'apparition du modal
    setTimeout(() => { try { map.invalidateSize(); } catch(e) {} }, 100);
    setTimeout(() => { try { map.invalidateSize(); } catch(e) {} }, 400);
  } catch (e) {
    console.warn("Carte vlog : init impossible", e);
  }
}

function closeVlogViewer() {
  $("#vlogViewer").classList.remove("open");
  $("#vlogViewer").setAttribute("aria-hidden", "true");
  document.body.classList.remove("vlog-open");
  document.body.style.overflow = "";
}

// Renvoie tous les carnets disponibles (seed + perso + Supabase cross-compte),
// dédupliqués et triés par date desc. Les carnets d'AUTRES comptes arrivent via
// supabasePosts (colonne posts.vlog) depuis le 2026-07-02.
function allCarnets() {
  const me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  const seed = (state.seed.posts || []).filter(p => p.type === "vlog").map(p => ({ ...p, _source: "seed" }));
  const mine = (state.userPosts || []).filter(p => p.type === "vlog").map(p => ({ ...p, _source: "me" }));
  const net  = (state.supabasePosts || []).filter(p => p.type === "vlog")
    .map(p => ({ ...p, _source: (p.authorId === me ? "me" : "seed") }));
  const blocked = (state.user && state.user.blocked) || [];
  const seen = new Set();
  return [...mine, ...net, ...seed]
    .filter(c => {
      if (seen.has(c.id)) return false; seen.add(c.id);
      if (blocked.length && blocked.includes(c.authorId)) return false;
      return true;
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// Rendu de la section "Carnets" dans Explorer (avec recherche)
function renderCarnetsExplore() {
  const list = $("#carnetsExploreList");
  if (!list) return;
  const q = (($("#carnetSearch") && $("#carnetSearch").value) || "").toLowerCase().trim();
  let carnets = allCarnets();
  if (q) {
    carnets = carnets.filter(c =>
      (c.destination || "").toLowerCase().includes(q) ||
      (c.text || "").toLowerCase().includes(q) ||
      (c.steps || []).some(s => (s.place || "").toLowerCase().includes(q))
    );
  }
  if (!carnets.length) {
    list.innerHTML = `<div class="empty" style="padding:20px;"><div class="empty-icon">📔</div><div class="empty-title">${q ? "Aucun carnet trouvé" : "Aucun carnet pour le moment"}</div><div class="empty-text">${q ? "Essaie une autre destination." : "Sois le premier à publier un carnet de voyage."}</div></div>`;
    return;
  }
  list.innerHTML = carnets.map(c => {
    const stats = vlogStats(c);
    const author = c._source === "me" ? state.user.name : (userById(c.authorId) || { name: "Anonyme" }).name;
    return `<div class="carnet-explore-card" onclick="openVlogViewer('${c.id}')">
      ${c.cover ? `<img loading="lazy" decoding="async" class="carnet-explore-cover" src="${c.cover}" alt=""/>` : `<div class="carnet-explore-cover" style="background:linear-gradient(135deg,#4c1d95,#7c3aed);"></div>`}
      <div class="carnet-explore-body">
        <div class="carnet-explore-dest">📍 ${escapeHtml(c.destination || "Carnet")}</div>
        <div class="carnet-explore-meta">
          <span>${stats.durée} jours</span>
          <span>•</span>
          <span>${stats.nbDays} étapes</span>
          ${c.budget ? `<span>•</span><span>💰 ${escapeHtml(c.budget)}</span>` : ""}
          <span>•</span>
          <span>par ${escapeHtml(author)}</span>
        </div>
      </div>
    </div>`;
  }).join("");
}

// Helper : aller direct au Studio en mode vlog
// ===== CDV LIVE =====
// ===== CDV LIVE SYSTEM (complet et fonctionnel) =====
function getCdvLives() {
  try { return JSON.parse(localStorage.getItem("passio_cdv_lives") || "[]"); } catch(e) { return []; }
}
// Écriture tolérante au quota : les étapes portent des photos base64 tant qu'elles
// ne sont pas uploadées sur Storage → un carnet live photo-lourd faisait sauter
// localStorage (QuotaExceededError NON catchée = étape perdue en silence, alors
// que la sync Supabase, elle, avait réussi). On dégrade : purge des lives terminés
// les plus anciens, puis retry ; en dernier recours on garde au moins les lives actifs.
function saveCdvLives(lives) {
  var arr = Array.isArray(lives) ? lives : [];
  try { localStorage.setItem("passio_cdv_lives", JSON.stringify(arr)); return true; }
  catch (e) {
    try {
      var slim = arr.filter(function (l) { return l && l.status === "live"; })
        .concat(arr.filter(function (l) { return !l || l.status !== "live"; }).slice(0, 10));
      localStorage.setItem("passio_cdv_lives", JSON.stringify(slim));
      return true;
    } catch (e2) {
      if (typeof toast === "function") toast("⚠️ Stockage local plein — le live est sur le serveur mais pas en cache");
      return false;
    }
  }
}

// Compte de personnes qui suivent un live, robuste à toutes les formes historiques
// (tableau d'ids, ancien nombre fictif, absent). À utiliser PARTOUT plutôt que
// `(l.followers || l.viewers || []).length` qui donnait `undefined` sur un nombre.
function cdvLiveFollowerCount(l) {
  if (!l) return 0;
  if (Array.isArray(l.followers)) return l.followers.length;
  if (Array.isArray(l.viewers)) return l.viewers.length;
  if (typeof l.followers === "number") return 0; // ancien compteur fictif → ignoré
  return 0;
}

// Un live "abonnés" ne doit être visible que par les abonnés (et son auteur) ;
// un live "privé" seulement par son auteur. Centralisé ici — l'ancien filtrage
// ne testait que `private`, donc un live « 👥 Abonnés » était visible de tous.
function canSeeCdvLive(l) {
  if (!l) return false;
  if (typeof isBlocked === "function" && isBlocked(l.authorId)) return false;
  if (isMyLive(l)) return true;
  if (l.visibility === "private") return false;
  if (l.visibility === "followers") {
    var following = [].concat(state.following || [], (state.user && state.user.following) || []);
    return following.indexOf(l.authorId) > -1;
  }
  return true;
}

// Un live publié localement a authorId "me" ; rechargé depuis Supabase il a MY_UID.
function isMyLive(l) {
  return !!l && (l.authorId === "me" || (typeof MY_UID !== "undefined" && MY_UID && l.authorId === MY_UID));
}

// ═══════════════════════════════════════════════════════════════════════════
// CO-VOYAGEURS (CDV v2) — on voyage rarement seul
// L'auteur invite des comptes qui peuvent alors publier leurs propres étapes
// sur SON voyage (chacun signe les siennes → la RLS de cdv_live_steps, qui
// exige author_id = auth.uid(), reste satisfaite telle quelle).
// ═══════════════════════════════════════════════════════════════════════════
function cdvCollaborators(l) {
  return (l && Array.isArray(l.collaborators)) ? l.collaborators : [];
}

// Qui peut publier/modifier une étape : l'auteur OU un co-voyageur.
function canEditLive(l) {
  if (!l) return false;
  if (isMyLive(l)) return true;
  var me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  return cdvCollaborators(l).indexOf(me) > -1;
}

function openCdvCollaborators(liveId) {
  var live = getCdvLives().find(function (l) { return l.id === liveId; });
  if (!live || !isMyLive(live)) return;
  var cols = cdvCollaborators(live);
  var listHtml = cols.length
    ? cols.map(function (uidC) {
        var u = (typeof userById === "function" && userById(uidC)) || {};
        return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">'
          + '<div class="avatar" style="background:' + (u.avatar || "#7c3aed") + ';width:30px;height:30px;font-size:14px;">' + (u.profileEmoji || "🌍") + '</div>'
          + '<div style="flex:1;font-size:13px;color:var(--text);">' + escapeHtml(u.name || "Passionné") + '</div>'
          + '<span onclick="removeCdvCollaborator(\'' + liveId + '\',\'' + escapeJsArg(uidC) + '\')" style="cursor:pointer;color:#ef4444;font-size:12px;">Retirer</span>'
          + '</div>';
      }).join("")
    : '<div style="font-size:12px;color:var(--muted);padding:8px 0;">Personne pour l\'instant. Invite les gens avec qui tu voyages : ils pourront publier leurs propres étapes sur ce voyage.</div>';

  openModal(
    '<div class="modal-handle"></div>'
    + '<span class="modal-close" onclick="closeModal()">×</span>'
    + '<div class="modal-title">👥 Co-voyageurs</div>'
    + '<div id="cdvCollabList">' + listHtml + '</div>'
    + '<label class="field" style="margin-top:12px;"><span>Inviter quelqu\'un</span>'
    + '<input type="text" class="input" id="cdvCollabSearch" placeholder="Pseudo du voyageur…" oninput="searchCdvCollaborator(\'' + liveId + '\', this.value)"/></label>'
    + '<div id="cdvCollabResults" style="display:flex;flex-direction:column;gap:6px;"></div>'
  );
}

// Recherche de comptes à inviter (réutilise supaSearchUsers, comme la messagerie).
async function searchCdvCollaborator(liveId, q) {
  var box = document.getElementById("cdvCollabResults");
  if (!box) return;
  q = (q || "").trim();
  if (q.length < 2) { box.innerHTML = ""; return; }
  box.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:6px;">Recherche…</div>';
  var users = [];
  try { if (typeof supaSearchUsers === "function") users = (await supaSearchUsers(q)) || []; } catch (e) {}
  // Repli local (comptes de démo / déjà connus) pour ne jamais rendre une page vide.
  if (!users.length) {
    users = ((state.seed && state.seed.users) || [])
      .filter(function (u) { return (u.name || "").toLowerCase().indexOf(q.toLowerCase()) > -1; })
      .slice(0, 6)
      .map(function (u) { return { id: u.id, username: u.name, emoji: u.profileEmoji, color: u.avatar }; });
  }
  var live = getCdvLives().find(function (l) { return l.id === liveId; }) || {};
  var already = cdvCollaborators(live);
  var me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  users = users.filter(function (u) { return u.id !== me && already.indexOf(u.id) < 0; });
  if (!users.length) { box.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:6px;">Aucun compte trouvé</div>'; return; }
  box.innerHTML = users.slice(0, 6).map(function (u) {
    return '<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:10px;padding:8px;">'
      + '<div class="avatar" style="background:' + (u.color || "#7c3aed") + ';width:28px;height:28px;font-size:13px;">' + (u.emoji || "✨") + '</div>'
      + '<div style="flex:1;font-size:13px;color:var(--text);">' + escapeHtml(u.username || "Passionné") + '</div>'
      + '<button class="btn primary" style="font-size:11px;padding:6px 10px;" onclick="addCdvCollaborator(\'' + liveId + '\',\'' + escapeJsArg(u.id) + '\',\'' + escapeJsArg(u.username || "Passionné") + '\')">Inviter</button>'
      + '</div>';
  }).join("");
}

async function addCdvCollaborator(liveId, userId, name) {
  var lives = getCdvLives();
  var live = lives.find(function (l) { return l.id === liveId; });
  if (!live || !isMyLive(live)) return;
  if (!Array.isArray(live.collaborators)) live.collaborators = [];
  if (live.collaborators.indexOf(userId) > -1) return;
  live.collaborators.push(userId);
  saveCdvLives(lives);
  if (typeof supaAddCdvCollaborator === "function") await supaAddCdvCollaborator(liveId, userId);
  if (typeof supaInsertNotif === "function") {
    try { supaInsertNotif(userId, "cdv_live_step", liveId, "t'a invité·e à co-écrire son voyage"); } catch (e) {}
  }
  toast("👥 " + (name || "Invité") + " peut désormais publier des étapes");
  openCdvCollaborators(liveId);
}

function removeCdvCollaborator(liveId, userId) {
  var lives = getCdvLives();
  var live = lives.find(function (l) { return l.id === liveId; });
  if (!live) return;
  live.collaborators = cdvCollaborators(live).filter(function (x) { return x !== userId; });
  saveCdvLives(lives);
  if (typeof supaRemoveCdvCollaborator === "function") supaRemoveCdvCollaborator(liveId, userId);
  toast("Co-voyageur retiré");
  openCdvCollaborators(liveId);
}

// Récupérer les lives actifs (global, pour tous)
function getActiveCdvLives() {
  return getCdvLives().filter(l => l.status === "live" && canSeeCdvLive(l));
}

// Récupérer les lives des people qu'on suit
function getFollowingCdvLives() {
  const allLives = getCdvLives();
  const myFollowing = state.following || [];
  return allLives.filter(l => l.status === "live" && myFollowing.includes(l.authorId));
}

// ⚠️ Le "compteur de spectateurs" local était une fiction : il poussait MON id dans
// live.viewers de MA copie localStorage — invisible des autres, jamais décrémenté,
// et comptabilisé ensuite comme un abonné. Le seul chiffre honnête est le nombre de
// personnes qui SUIVENT le live (table cdv_live_followers, cross-compte). Ces deux
// fonctions restent des no-op pour ne casser aucun appelant existant.
function addCdvLiveViewer() { /* no-op : voir cdvLiveFollowerCount() */ }
function removeCdvLiveViewer() { /* no-op : voir cdvLiveFollowerCount() */ }

// Auto-refresh du CDV Live toutes les 5 secondes (tant que la modal est ouverte)
let cdvLiveRefreshInterval = null;
function startCdvLiveRefresh(liveId) {
  if (cdvLiveRefreshInterval) clearInterval(cdvLiveRefreshInterval);
  cdvLiveRefreshInterval = setInterval(() => {
    const modal = document.querySelector(".modal");
    if (!modal || !modal.classList.contains("modal-fullscreen") || modal.getAttribute("data-live-id") !== liveId) {
      clearInterval(cdvLiveRefreshInterval);
      cdvLiveRefreshInterval = null;
      return;
    }
    // Ne pas rafraîchir pendant la saisie d'un commentaire (sinon on efface le texte).
    const ci = document.getElementById("cdvLiveComment");
    if (ci && document.activeElement === ci && ci.value) return;
    // Onglet en arrière-plan : pas de polling (batterie/quota) — le realtime + le
    // retour sur l'onglet rattrapent.
    if (document.hidden) return;

    // Recharger ce live depuis Supabase (étapes/commentaires/réactions/suivis cross-compte).
    if (typeof supaLoadCdvLive === "function") {
      supaLoadCdvLive(liveId).then(fresh => {
        if (!fresh) return;
        const lives = getCdvLives();
        const idx = lives.findIndex(l => l.id === liveId);
        const prev = idx >= 0 ? lives[idx] : null;
        if (idx >= 0) lives[idx] = fresh; else lives.unshift(fresh);
        saveCdvLives(lives);
        const stillOpen = document.querySelector(".modal.modal-fullscreen[data-live-id='" + liveId + "']");
        if (!stillOpen) return;
        // Rebuild COMPLET seulement si la structure change (nouvelle étape / statut)
        // — rare. Sinon on PATCHE en place (compteurs, réactions, et bloc commentaires
        // uniquement s'ils ont changé) pour NE PAS détruire le scroll, les réponses
        // ouvertes et les photos d'étapes à chaque tick de 5s. C'était la cause du
        // "ça bug / ça lag" sur les commentaires CDV.
        const structuralChange = !prev
          || (prev.steps || []).length !== (fresh.steps || []).length
          || prev.status !== fresh.status;
        if (structuralChange) { openCdvLiveViewer(liveId); return; }
        const commentsChanged = (prev.comments || []).length !== (fresh.comments || []).length;
        // Ne pas écraser le bloc commentaires si l'utilisateur a déplié des réponses
        // ou est en train d'interagir : on ne le re-rend QUE si un commentaire est
        // réellement apparu/disparu.
        if (typeof _patchCdvLiveViewer === "function") _patchCdvLiveViewer(fresh, commentsChanged);
      }).catch(() => {});
    } else {
      const lives = getCdvLives();
      if (lives.find(l => l.id === liveId)) openCdvLiveViewer(liveId);
    }
  }, 5000);
}

function startCdvLive() {
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">📡 Démarrer un CDV Live</div>
    <p class="section-subtitle" style="margin-top:-4px;">Tes abonnés te suivent en direct.</p>

    <label class="field"><span>🌍 Destination</span>
      <input type="text" class="input" id="cdvLiveDest" placeholder="Ex : Lisbonne, Road trip Écosse…" maxlength="60"/>
    </label>

    <label class="field"><span>📝 Description du voyage</span>
      <textarea class="textarea" id="cdvLiveDesc" placeholder="De quoi parle ce voyage ? Quel est le plan ?" maxlength="300" style="min-height:60px;"></textarea>
    </label>

    <label class="field"><span>📅 Durée prévue</span>
      <div style="display:flex;gap:8px;">
        <button class="pill cdv-dur-btn" onclick="selectCdvDuration(this,'1j')">1 jour</button>
        <button class="pill cdv-dur-btn" onclick="selectCdvDuration(this,'weekend')">Weekend</button>
        <button class="pill cdv-dur-btn active" onclick="selectCdvDuration(this,'semaine')">1 semaine</button>
        <button class="pill cdv-dur-btn" onclick="selectCdvDuration(this,'long')">+ long</button>
      </div>
    </label>

    <label class="field"><span>🔒 Visibilité</span>
      <div style="display:flex;gap:8px;">
        <button class="pill cdv-vis-btn active" onclick="selectCdvVisibility(this,'public')">🌍 Public</button>
        <button class="pill cdv-vis-btn" onclick="selectCdvVisibility(this,'followers')">👥 Abonnés</button>
        <button class="pill cdv-vis-btn" onclick="selectCdvVisibility(this,'private')">🔒 Privé</button>
      </div>
    </label>

    <div style="display:flex;gap:8px;margin-top:14px;">
      <button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn primary" style="flex:1;background:linear-gradient(135deg,#ef4444,#f59e0b);" onclick="createCdvLive()">🔴 Lancer le Live</button>
    </div>
  `);
}

var _cdvDuration = "semaine";
var _cdvVisibility = "public";
function selectCdvDuration(btn, val) { _cdvDuration = val; document.querySelectorAll(".cdv-dur-btn").forEach(function(b){b.classList.remove("active");}); btn.classList.add("active"); }
function selectCdvVisibility(btn, val) { _cdvVisibility = val; document.querySelectorAll(".cdv-vis-btn").forEach(function(b){b.classList.remove("active");}); btn.classList.add("active"); }

function createCdvLive() {
  const dest = document.getElementById("cdvLiveDest")?.value.trim();
  if (!dest) { toast("Indique une destination"); return; }
  const desc = document.getElementById("cdvLiveDesc")?.value.trim() || "";
  const live = {
    id: "live_" + uid(),
    authorId: "me",
    destination: dest,
    description: desc,
    duration: _cdvDuration,
    visibility: _cdvVisibility,
    status: "live",
    steps: [],
    // followers est un TABLEAU d'ids partout ailleurs (toggleFollowCdvLive,
    // supaLoadCdvLives). L'ancienne valeur `Math.floor(Math.random()*10+1)` était
    // (a) un compteur fictif et (b) un NOMBRE → `(l.followers||[]).length` valait
    // `undefined` → « 👁 undefined suivent » sur toutes les cartes.
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
  if (typeof supaPublishCdvLive === "function") supaPublishCdvLive(live);
  closeModal();
  toast("📡 CDV Live démarré !");
  renderCdvLives();
  setTimeout(() => addCdvLiveStep(live.id), 300);
}

function addCdvLiveStep(liveId, stepId) {
  // ⚠️ RESET des brouillons de la composition : ces variables sont GLOBALES et
  // n'étaient remises à zéro qu'en cas de publication réussie. Si l'utilisateur
  // fermait la modale (« Plus tard » / ×), ses photos, sa note ★ et son budget
  // se retrouvaient collés à l'étape SUIVANTE, d'un autre lieu voire d'un autre live.
  var _edit = stepId ? (getCdvLives().find(function (l) { return l.id === liveId; }) || { steps: [] })
    .steps.find(function (s) { return s.id === stepId; }) : null;
  _liveStepPhotos = _edit && Array.isArray(_edit.photos) ? _edit.photos.slice() : [];
  _stepEmoji = (_edit && _edit.emoji) || "📍";
  _stepRating = (_edit && _edit.rating) || 0;
  _stepBudget = (_edit && _edit.budget) || "";
  _stepLat = (_edit && typeof _edit.lat === "number") ? _edit.lat : null;
  _stepLng = (_edit && typeof _edit.lng === "number") ? _edit.lng : null;
  var _types = [["📍", "Lieu"], ["🍽", "Restaurant"], ["🏨", "Hébergement"], ["🎯", "Activité"], ["🚗", "Transport"], ["💡", "Conseil"], ["⚠️", "Alerte"]];
  var _budgets = [["free", "Gratuit"], ["€", "€"], ["€€", "€€"], ["€€€", "€€€"]];
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">${_edit ? "✏️ Modifier l'étape" : "📍 Ajouter une étape live"}</div>

    <label class="field"><span>📍 Où es-tu ?</span>
      <input type="text" class="input" id="liveStepCity" placeholder="Ville, lieu, spot…" maxlength="60" value="${escapeHtml((_edit && _edit.city) || "")}"/>
      <button class="pill${_stepLat != null ? " active" : ""}" id="cdvGeoBtn" onclick="cdvUseMyPosition()" style="margin-top:6px;width:100%;">${_stepLat != null ? "📍 Position enregistrée ✓" : "📍 Ma position"}</button>
    </label>

    <label class="field"><span>🎭 Type d'étape</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${_types.map(function (t) {
          return `<button class="pill step-type-btn${_stepEmoji === t[0] ? " active" : ""}" onclick="selectStepType(this,'${t[0]}')">${t[0]} ${t[1]}</button>`;
        }).join("")}
      </div>
    </label>

    <label class="field"><span>✍️ Raconte ce moment</span>
      <textarea class="textarea" id="liveStepContent" placeholder="Ce que tu vois, ressens, fais… tes conseils pour ceux qui viendront après toi" maxlength="500" style="min-height:80px;">${escapeHtml((_edit && _edit.content) || "")}</textarea>
    </label>

    <label class="field"><span>⭐ Note ce lieu (optionnel)</span>
      <div style="display:flex;gap:4px;" id="liveStepRating">
        ${[1, 2, 3, 4, 5].map(function (n) {
          var on = n <= _stepRating;
          return `<span class="rating-star" onclick="setStepRating(${n})" style="font-size:24px;cursor:pointer;color:${on ? "#f59e0b" : "var(--muted)"};">${on ? "★" : "☆"}</span>`;
        }).join("")}
      </div>
    </label>

    <label class="field"><span>💰 Budget (optionnel)</span>
      <div style="display:flex;gap:6px;">
        ${_budgets.map(function (b) {
          return `<button class="pill budget-btn${_stepBudget === b[0] ? " active" : ""}" onclick="selectBudget(this,'${b[0]}')">${b[1]}</button>`;
        }).join("")}
      </div>
    </label>

    <label class="field"><span>📷 Photos (optionnel · ${CDV_STEP_MAX_PHOTOS} max)</span>
      <div id="liveStepPhotoPreview" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;"></div>
      <div class="upload-zone" onclick="document.getElementById('liveStepPhotoInput').click()" style="padding:12px;">
        <div class="upload-zone-icon" style="font-size:18px;">📷</div>
        <div class="upload-zone-title" style="font-size:12px;">Ajouter des photos</div>
      </div>
      <input type="file" id="liveStepPhotoInput" accept="image/*" multiple style="display:none;" onchange="previewLiveStepPhotos(event)"/>
    </label>

    <div style="display:flex;gap:8px;margin-top:14px;">
      <button class="btn ghost" onclick="closeModal()">${_edit ? "Annuler" : "Plus tard"}</button>
      <button class="btn primary" style="flex:1;" onclick="saveCdvLiveStep('${liveId}'${stepId ? ",'" + stepId + "'" : ""})">${_edit ? "✅ Enregistrer" : "📡 Publier l'étape"}</button>
    </div>
  `);
  previewLiveStepPhotosRefresh();
}

var _stepEmoji = "📍";
var _stepRating = 0;
var _stepBudget = "";
function selectStepType(btn, emoji) { _stepEmoji = emoji; document.querySelectorAll(".step-type-btn").forEach(function(b){b.classList.remove("active");}); btn.classList.add("active"); }
function selectBudget(btn, val) { _stepBudget = val; document.querySelectorAll(".budget-btn").forEach(function(b){b.classList.remove("active");}); btn.classList.add("active"); }
function setStepRating(n) {
  _stepRating = n;
  document.querySelectorAll(".rating-star").forEach(function(s, i) { s.textContent = i < n ? "★" : "☆"; s.style.color = i < n ? "#f59e0b" : "var(--muted)"; });
}

let _liveStepPhotos = [];
// Garde-fous : sans limite, 6 photos de téléphone en base64 (~8 Mo chacune) partaient
// dans localStorage["passio_cdv_lives"] → QuotaExceededError et étape perdue.
const CDV_STEP_MAX_PHOTOS = 6;
const CDV_STEP_MAX_PHOTO_BYTES = 8 * 1024 * 1024;
function previewLiveStepPhotos(event) {
  var files = event.target.files;
  if (!files || !files.length) return;
  Array.from(files).forEach(function(file) {
    if (_liveStepPhotos.length >= CDV_STEP_MAX_PHOTOS) { toast("Maximum " + CDV_STEP_MAX_PHOTOS + " photos par étape"); return; }
    if (file.size > CDV_STEP_MAX_PHOTO_BYTES) { toast("Photo trop lourde (" + Math.round(file.size / 1048576) + " Mo, limite 8 Mo)"); return; }
    var reader = new FileReader();
    reader.onload = function(e) {
      // Downscale avant stockage (même hygiène que les uploads du fil) : une photo
      // de 4000 px ne sert à rien dans une étape et fait exploser le cache local.
      var done = function (src) {
        if (_liveStepPhotos.length >= CDV_STEP_MAX_PHOTOS) return;
        _liveStepPhotos.push(src);
        previewLiveStepPhotosRefresh();
      };
      if (typeof _downscaleImageForUpload === "function") {
        _downscaleImageForUpload(e.target.result).then(done).catch(function () { done(e.target.result); });
      } else { done(e.target.result); }
    };
    reader.readAsDataURL(file);
  });
  event.target.value = ""; // re-sélectionner la même photo doit re-déclencher change
}
function previewLiveStepPhotosRefresh() {
  var prev = document.getElementById("liveStepPhotoPreview");
  if (!prev) return;
  prev.innerHTML = _liveStepPhotos.map(function(p, i) {
    return '<div style="position:relative;display:inline-block;"><img loading="lazy" decoding="async" src="' + safeUrlAttr(p) + '" style="width:70px;height:70px;border-radius:10px;object-fit:cover;"/><span onclick="_liveStepPhotos.splice(' + i + ',1);previewLiveStepPhotosRefresh();" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#ef4444;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;">×</span></div>';
  }).join("");
}

function saveCdvLiveStep(liveId, stepId) {
  const city = document.getElementById("liveStepCity")?.value.trim();
  const content = document.getElementById("liveStepContent")?.value.trim();
  if (!city && !content) { toast("Ajoute au moins un lieu ou un texte"); return; }

  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live) { toast("Live introuvable"); return; }
  if (!Array.isArray(live.steps)) live.steps = [];

  const existing = stepId ? live.steps.find(s => s.id === stepId) : null;
  const step = {
    id: existing ? existing.id : "ls_" + uid(),
    // Chaque étape est signée : sur un voyage à plusieurs, on sait qui a publié
    // quoi, et seul l'auteur d'une étape peut la modifier (comme la RLS).
    authorId: existing ? (existing.authorId || ((typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me"))
                       : ((typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me"),
    city: city || "Quelque part",
    emoji: _stepEmoji || "📍",
    content: content || "",
    photos: _liveStepPhotos.length ? [..._liveStepPhotos] : [],
    photo: _liveStepPhotos[0] || null,
    rating: _stepRating || 0,
    budget: _stepBudget || "",
    lat: (typeof _stepLat === "number") ? _stepLat : (existing && typeof existing.lat === "number" ? existing.lat : null),
    lng: (typeof _stepLng === "number") ? _stepLng : (existing && typeof existing.lng === "number" ? existing.lng : null),
    createdAt: existing ? (existing.createdAt || Date.now()) : Date.now(),
    editedAt: existing ? Date.now() : null,
  };
  _liveStepPhotos = [];
  _stepEmoji = "📍";
  _stepRating = 0;
  _stepBudget = "";
  _stepLat = null;
  _stepLng = null;

  if (existing) {
    live.steps[live.steps.indexOf(existing)] = step;
    saveCdvLives(lives);
    if (typeof supaUpdateCdvLiveStep === "function") supaUpdateCdvLiveStep(liveId, step);
    closeModal();
    toast("✅ Étape modifiée");
  } else {
    live.steps.push(step);
    saveCdvLives(lives);
    if (typeof supaAddCdvLiveStep === "function") supaAddCdvLiveStep(liveId, step);
    if (typeof grantReward === "function") { try { grantReward("comment"); } catch (e) {} }
    closeModal();
    toast("📍 Étape publiée en direct !");
    _notifyCdvLiveFollowers(live, step);
  }
  // Pas de GPS ? On géocode le nom du lieu en tâche de fond (monde entier) pour
  // que l'étape apparaisse quand même sur la carte, sans retarder la publication.
  if (step.lat == null && step.city && step.city !== "Quelque part") {
    _cdvBackfillStepCoords(liveId, step.id, step.city);
  }
  renderCdvLives();
  if (typeof renderCdvScreen === "function") { try { renderCdvScreen(); } catch (e) {} }
}

// Supprimer une étape (auteur uniquement) — confirmation puis suppression locale
// + serveur. Sans ça, une faute de frappe ou une photo ratée restait à vie.
function deleteCdvLiveStep(liveId, stepId) {
  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live || !canEditLive(live)) return;
  // On ne supprime que SES propres étapes (la RLS l'impose de toute façon).
  const me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  const st = (live.steps || []).find(s => s.id === stepId);
  if (st && st.authorId && st.authorId !== me) { toast("Seul l'auteur de cette étape peut la supprimer"); return; }
  if (!confirm("Supprimer cette étape ? C'est définitif.")) return;
  live.steps = (live.steps || []).filter(s => s.id !== stepId);
  saveCdvLives(lives);
  if (typeof supaDeleteCdvLiveStep === "function") supaDeleteCdvLiveStep(liveId, stepId);
  toast("🗑 Étape supprimée");
  openCdvLiveViewer(liveId);
}

// Prévient les personnes qui SUIVENT ce live qu'une nouvelle étape est publiée
// (c'est tout l'intérêt du « suivre » : avant, suivre n'apportait rien du tout).
function _notifyCdvLiveFollowers(live, step) {
  try {
    if (!live || !Array.isArray(live.followers) || typeof supaInsertNotif !== "function") return;
    var me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
    var label = "a publié une nouvelle étape" + (step && step.city ? " : " + step.city : "");
    live.followers.forEach(function (uidF) {
      if (!uidF || uidF === me) return;
      try { supaInsertNotif(uidF, "cdv_live_step", live.id, label); } catch (e) {}
    });
  } catch (e) {}
}

// Carte de l'itinéraire d'un live (marqueurs numérotés dans l'ordre des étapes).
// Séparée de initVlogMiniMap (qui cible l'id fixe #vlogViewerMap) pour pouvoir
// vivre dans la modale plein écran du live.
function _initCdvLiveMap(el, places, opts) {
  opts = opts || {};
  if (!el || !places || !places.length) return;
  if (typeof L === "undefined") {
    if (typeof ensureLeaflet === "function") ensureLeaflet().then(function () { _initCdvLiveMap(el, places, opts); }).catch(function () {});
    return;
  }
  if (el._leafletMap) { try { el._leafletMap.remove(); } catch (e) {} el._leafletMap = null; }
  try {
    var map = L.map(el, { zoomControl: true, attributionControl: false })
      .setView(places[places.length - 1].ll, places.length === 1 ? 12 : 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
    var bounds = [];
    places.forEach(function (p) {
      var icon = L.divIcon({
        className: "passio-marker-wrap",
        html: '<div class="passio-marker">' + p.dayNum + '</div>',
        iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -16],
      });
      L.marker(p.ll, { icon: icon }).addTo(map)
        .bindPopup("<b>Étape " + p.dayNum + "</b><br/>" + escapeHtml(p.place));
      bounds.push(p.ll);
    });
    // Trace le trajet entre les étapes : l'itinéraire se lit d'un coup d'œil.
    // (Désactivé pour une simple collection de lieux, qui n'est pas un trajet.)
    if (bounds.length > 1) {
      if (opts.connect !== false) L.polyline(bounds, { color: "#7c3aed", weight: 3, opacity: 0.7, dashArray: "6 6" }).addTo(map);
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 12 });
    }
    el._leafletMap = map;
    setTimeout(function () { try { map.invalidateSize(); } catch (e) {} }, 120);
    setTimeout(function () { try { map.invalidateSize(); } catch (e) {} }, 420);
  } catch (e) { console.warn("Carte live CDV : init impossible", e); }
}

// Terminer un live est IRRÉVERSIBLE (plus d'étapes possibles) : on confirme, et on
// enchaîne directement sur la conversion en carnet — le moment où l'auteur a le
// plus envie de finaliser son récit. Avant : un tap sur « Terminer » suffisait.
function confirmEndCdvLive(liveId) {
  const live = getCdvLives().find(l => l.id === liveId);
  if (!live || !isMyLive(live)) return;
  const n = (live.steps || []).length;
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">Terminer ce carnet en direct ?</div>
    <div style="font-size:13px;color:var(--text-dim);line-height:1.55;margin-bottom:14px;">
      « ${escapeHtml(live.destination || "Voyage")} » passera en <b>terminé</b> : tu ne pourras plus ajouter d'étape.
      Tes ${n} étape${n > 1 ? "s" : ""} et les commentaires restent visibles.
    </div>
    <button class="btn primary block" style="margin-bottom:8px;" onclick="endCdvLive('${liveId}', true)">Terminer et créer le carnet</button>
    <button class="btn ghost block" style="margin-bottom:8px;" onclick="endCdvLive('${liveId}', false)">Terminer seulement</button>
    <button class="btn ghost block" onclick="closeModal()">Annuler</button>
  `);
}

function endCdvLive(liveId, offerCarnet) {
  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live) return;
  live.status = "ended";
  live.endedAt = Date.now();
  saveCdvLives(lives);
  if (typeof supaUpdateCdvLiveStatus === "function") supaUpdateCdvLiveStatus(liveId, "ended");
  closeModal();
  toast("✅ CDV Live terminé");
  renderCdvLives();
  renderCdvScreen();
  // Le direct devient un carnet SANS étape intermédiaire : l'utilisateur atterrit
  // directement dans le Studio pré-rempli avec ses étapes (modèle Polarsteps —
  // le voyage est un seul objet dont le récit se finalise à l'arrivée).
  if (offerCarnet && (live.steps || []).length) {
    setTimeout(function () { convertLiveToCarnet(liveId); }, 250);
  }
}

// Convertit un Live (de préférence terminé) en brouillon de carnet éditable
// dans le Studio : destination + étapes (lieu/texte/photo) pré-remplies.
function convertLiveToCarnet(liveId) {
  const live = getCdvLives().find(l => l.id === liveId);
  if (!live) return;
  closeModal();
  setTimeout(() => {
    activateStudioVlog();
    if ($("#vlogDestination")) $("#vlogDestination").value = live.destination || "";
    vlogState.cover = null;
    if ($("#vlogCoverPreview")) $("#vlogCoverPreview").innerHTML = "";
    // Reprend aussi la note ★ et le budget saisis en direct (sinon ce travail
    // était perdu à la conversion) — ils deviennent le conseil de l'étape.
    vlogState.steps = (live.steps || []).map(s => ({
      id: uid(),
      place: s.city || "",
      text: s.content || "",
      tip: [s.budget ? "Budget " + s.budget : "", s.rating ? "★".repeat(s.rating) : ""].filter(Boolean).join(" · "),
      photo: s.photo || (s.photos && s.photos[0]) || null,
    }));
    if (typeof renderVlogSteps === "function") renderVlogSteps();
    toast("📔 Live converti en brouillon de carnet — complète-le puis publie");
  }, 200);
}

// Construit le bloc commentaires d'un live (barre de tri + likes), re-rendable
// seul (#cdvCommentsBox) sans ré-ouvrir toute la modale.
function _cdvCommentsBoxHtml(live) {
  if (!live) return "";
  var comments = (live.comments || []);
  // Normalise EN PLACE (id stable + forme « post ») pour que le renderer unifié
  // et ses handlers (like/répondre/emoji/GIF/⋯) retrouvent le bon commentaire.
  comments.forEach(function(c) {
    if (!c.id) c.id = "lc_" + (c.at || Date.now()) + "_" + Math.random().toString(36).slice(2, 7);
    if (typeof _normalizeThreadComment === "function") _normalizeThreadComment(c);
    else { if (!c.authorName && c.author) c.authorName = c.author; if (c.createdAt == null && c.at != null) c.createdAt = c.at; }
  });
  if (!comments.length) return '<div style="font-size:11px;color:var(--muted);padding:8px;">Aucun commentaire — lance la conversation !</div>';
  var mode = window._cdvCommentSort || "recent";
  var bar = comments.length > 1 ? commentSortBarHtml(mode, "setCdvCommentSort") : "";
  return bar + _renderCommentsList(sortComments(comments, mode), live.id);
}
// Barre de réactions (❤️🔥😍 + partage) du viewer de live — extraite pour pouvoir
// la patcher en place lors du refresh 5s sans reconstruire tout le viewer.
function _cdvReactBarHtml(liveId, live) {
  var me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  // Emojis : compteur = personnes DISTINCTES (une réaction par personne, cf. la
  // règle produit). L'agrégat brut `reactions` peut contenir des doublons hérités.
  var by = Array.isArray(live.reactionsBy) ? live.reactionsBy : [];
  var cnt = function (e) {
    if (by.length) {
      var users = {};
      by.forEach(function (x) { if (x && x.emoji === e) users[x.userId] = 1; });
      return Object.keys(users).length || "";
    }
    return (live.reactions || []).filter(function (r) { return r === e; }).length || "";
  };
  var mineNow = function (e) {
    return by.some(function (x) { return x && x.userId === me && x.emoji === e; }) ? " active" : "";
  };
  // ❤️ = LIKE (toggle strict, 1 par compte, persisté dans cdv_live_reactions via
  // supaToggleCdvLiveLike) — le même bouton que sur les cartes. Avant, il passait
  // par reactCdvLive() qui empilait un ❤️ de plus À CHAQUE TAP sans jamais pouvoir
  // le retirer, et sans jamais être compté comme un like.
  var lk = (window._liveLikes && window._liveLikes[liveId]) || { likes: 0, liked: false };
  var liked = ((state.user && state.user.likedLives) || []).indexOf(liveId) > -1 || lk.liked;
  return '<button class="btn ghost' + (liked ? " active" : "") + '" data-livelike="' + liveId
      + '" onclick="likeCdvLiveCard(\'' + liveId + '\', this)" style="flex:1;font-size:13px;padding:8px;">'
      + (liked ? "❤️" : "🤍") + " " + (lk.likes || 0) + '</button>'
    + '<button class="btn ghost' + mineNow("🔥") + '" onclick="reactCdvLive(\'' + liveId + '\',\'🔥\')" style="flex:1;font-size:13px;padding:8px;">🔥 ' + cnt("🔥") + '</button>'
    + '<button class="btn ghost' + mineNow("😍") + '" onclick="reactCdvLive(\'' + liveId + '\',\'😍\')" style="flex:1;font-size:13px;padding:8px;">😍 ' + cnt("😍") + '</button>'
    + '<button class="btn ghost" onclick="shareCdvLive(\'' + liveId + '\')" style="flex:1;font-size:13px;padding:8px;" title="Partager ce live">' + shareIconSvg(16) + '</button>';
}
// Patch LÉGER du viewer de live ouvert (compteur de suivis, réactions, et bloc
// commentaires si demandé) — SANS reconstruire les étapes/photos ni perdre le
// scroll / les réponses ouvertes. Utilisé par le refresh 5s quand seuls les
// commentaires/réactions/suivis ont changé (pas les étapes ni le statut).
function _patchCdvLiveViewer(live, patchComments) {
  if (!live) return;
  var vc = document.getElementById("cdvViewerCount");
  if (vc) vc.textContent = "👁 " + cdvLiveFollowerCount(live) + " suivent";
  var rb = document.getElementById("cdvReactBar");
  if (rb) rb.innerHTML = _cdvReactBarHtml(live.id, live);
  if (patchComments) {
    var box = document.getElementById("cdvCommentsBox");
    if (box) box.innerHTML = _cdvCommentsBoxHtml(live);
  }
}
function setCdvCommentSort(mode) {
  window._cdvCommentSort = mode;
  var modalEl = document.querySelector(".modal[data-live-id]");
  var liveId = modalEl && modalEl.getAttribute("data-live-id");
  var box = document.getElementById("cdvCommentsBox");
  if (!liveId || !box) return;
  var live = getCdvLives().find(function(l){ return l.id === liveId; });
  if (live) box.innerHTML = _cdvCommentsBoxHtml(live);
}

function openCdvLiveViewer(liveId) {
  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live) return;

  const isMine = isMyLive(live);
  const isLive = live.status === "live";
  if (!canSeeCdvLive(live)) { toast("Ce carnet en direct n'est pas accessible"); return; }
  if (!Array.isArray(live.steps)) live.steps = [];

  // Nombre réel de personnes qui suivent (plus de valeur fictive aléatoire).
  var viewerCount = cdvLiveFollowerCount(live);
  const canEdit = canEditLive(live);
  const hasCollabs = cdvCollaborators(live).length > 0;

  let stepsHTML = live.steps.map(function(s) {
    var photosHTML = "";
    // ⚠️ photos = contenu d'un AUTRE compte (cdv_live_steps.photos) → safeUrlAttr
    // obligatoire (bloque javascript: et la sortie d'attribut), cf. CLAUDE.md.
    if (s.photos && s.photos.length > 1) {
      photosHTML = '<div style="display:flex;gap:4px;overflow-x:auto;margin-top:6px;scrollbar-width:none;">' + s.photos.map(function(p) { return '<img loading="lazy" decoding="async" src="' + safeUrlAttr(p) + '" style="height:120px;border-radius:8px;object-fit:cover;flex-shrink:0;"/>'; }).join("") + '</div>';
    } else if (s.photo) {
      photosHTML = '<img loading="lazy" decoding="async" src="' + safeUrlAttr(s.photo) + '" style="width:100%;border-radius:10px;margin-top:6px;max-height:200px;object-fit:cover;"/>';
    }
    var ratingHTML = s.rating ? '<span style="font-size:12px;color:#f59e0b;margin-left:8px;">' + "★".repeat(s.rating) + "☆".repeat(5-s.rating) + '</span>' : "";
    var budgetHTML = s.budget ? '<span style="font-size:10px;background:var(--bg-deep);border-radius:6px;padding:2px 6px;margin-left:6px;">' + s.budget + '</span>' : "";
    // Chacun corrige SES étapes (la RLS impose author_id = auth.uid()) ; sur un
    // voyage à plusieurs, on affiche aussi qui a publié l'étape.
    var _me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
    var stepMine = !s.authorId || s.authorId === _me || (isMine && !hasCollabs);
    var byLabel = (hasCollabs && s.authorId && s.authorId !== live.authorId)
      ? '<span style="font-size:10px;color:var(--muted);margin-left:6px;">· par ' + escapeHtml(((typeof userById === "function" && userById(s.authorId)) || {}).name || "un co-voyageur") + '</span>'
      : "";
    var ownerTools = stepMine
      ? '<div style="display:flex;gap:10px;margin-top:6px;">'
        + '<span onclick="event.stopPropagation();addCdvLiveStep(\'' + liveId + '\',\'' + s.id + '\')" style="font-size:11px;color:var(--muted);cursor:pointer;">✏️ Modifier</span>'
        + '<span onclick="event.stopPropagation();deleteCdvLiveStep(\'' + liveId + '\',\'' + s.id + '\')" style="font-size:11px;color:#ef4444;cursor:pointer;">🗑 Supprimer</span>'
        + '</div>'
      : "";
    return '<div style="display:flex;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);">\
      <div style="font-size:24px;flex-shrink:0;">' + escapeHtml(s.emoji || "📍") + '</div>\
      <div style="flex:1;min-width:0;">\
        <div style="display:flex;align-items:center;flex-wrap:wrap;">\
          <span style="font-weight:700;font-size:13px;color:var(--text);">' + escapeHtml(s.city) + '</span>' + ratingHTML + budgetHTML + '\
        </div>\
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">' + fmtTime(s.createdAt) + (s.editedAt ? " · modifiée" : "") + byLabel + '</div>\
        ' + (s.content ? '<div style="font-size:12px;color:var(--text-dim);line-height:1.5;">' + escapeHtml(s.content) + '</div>' : "") + '\
        ' + photosHTML + ownerTools + '\
      </div>\
    </div>';
  }).join("");

  if (!live.steps.length) stepsHTML = '<div style="text-align:center;padding:30px;color:var(--muted);"><div style="font-size:32px;margin-bottom:8px;">🧳</div>L\'aventure commence bientôt…</div>';

  // Itinéraire sur carte, comme dans le viewer de carnet : chaque étape géolocalisée
  // devient un marqueur numéroté. C'était la grande absente du live (le format le
  // plus « carte » de l'app n'en avait aucune, contrairement à Polarsteps/Google Maps).
  var mapPlaces = (live.steps || [])
    .map(function (s, i) { return { place: s.city || "", dayNum: i + 1, ll: cdvStepLatLng(s) }; })
    .filter(function (s) { return s.ll; });
  if (!mapPlaces.length && live.destination && typeof cityToLatLng === "function") {
    var dll = cityToLatLng(live.destination);
    if (dll) mapPlaces.push({ place: live.destination, dayNum: 1, ll: dll });
  }

  var commentsHTML = _cdvCommentsBoxHtml(live);

  const html = '\
    <button class="cdv-viewer-menu-btn" onclick="openCdvLiveMenu(\'' + liveId + '\', true)" title="Options" aria-label="Options du voyage">⋯</button>\
    \
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding-right:86px;">\
      ' + (isLive ? '<span class="cdv-live-badge">🔴 EN DIRECT</span>' : '<span style="font-size:10px;font-weight:700;color:var(--muted);background:var(--bg-deep);padding:3px 8px;border-radius:6px;">✅ TERMINÉ</span>') + '\
      <div style="font-weight:800;font-size:18px;color:var(--text);">📡 ' + escapeHtml(live.destination) + '</div>\
    </div>\
    ' + (live.description ? '<div style="font-size:12px;color:var(--text-dim);margin-bottom:8px;">' + escapeHtml(live.description) + '</div>' : '') + '\
    \
    <div style="display:flex;gap:12px;margin-bottom:14px;font-size:11px;color:var(--muted);">\
      <span>📍 ' + live.steps.length + ' étape' + (live.steps.length>1?"s":"") + '</span>\
      <span id="cdvViewerCount">👁 ' + viewerCount + ' suivent</span>\
      <span>🕐 ' + fmtTime(live.createdAt) + '</span>\
      ' + (live.duration ? '<span>📅 ' + live.duration + '</span>' : '') + '\
    </div>\
    \
    <div id="cdvTripStats">' + _cdvTripStatsHtml(cdvTripStats(live.steps)) + '</div>\
    \
    <div id="cdvReactBar" style="display:flex;gap:6px;margin-bottom:14px;">' + _cdvReactBarHtml(liveId, live) + '</div>\
    \
    ' + (mapPlaces.length ? '<div class="vlog-mini-map" id="cdvLiveMap" style="margin-bottom:14px;"></div>' : '') + '\
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">\
      <div style="font-weight:800;font-size:13px;color:var(--text);flex:1;">📍 Étapes</div>\
      ' + (live.steps.length ? '<button class="pill" onclick="closeModal();openCdvStepStory(\'' + liveId + '\',0)" style="font-size:11px;">▶ Plein écran</button>' : '') + '\
      ' + (mapPlaces.length > 1 ? '<button class="pill" onclick="closeModal();openCdvRouteReplay(\'' + liveId + '\',\'live\')" style="font-size:11px;">🎬 Rejouer</button>' : '') + '\
    </div>\
    ' + stepsHTML + '\
    \
    <div style="font-weight:800;font-size:13px;color:var(--text);margin:14px 0 8px;">💬 Commentaires</div>\
    <div id="cdvCommentsBox">' + commentsHTML + '</div>\
    <div style="display:flex;gap:6px;margin-top:8px;align-items:center;">\
      <input type="text" class="input" id="cdvLiveComment" placeholder="Écris un commentaire…" style="flex:1;font-size:12px;padding:8px 12px;" onkeypress="if(event.key===\'Enter\')addCdvLiveComment(\'' + liveId + '\')"/>\
      ' + _cmtComposerToolsHtml("cdvLiveComment", "addCdvLiveComment", liveId) + '\
      <button class="btn primary" onclick="addCdvLiveComment(\'' + liveId + '\')" style="font-size:12px;padding:8px 12px;">Envoyer</button>\
    </div>\
    \
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px;">\
      ' + (canEdit && isLive ? '\
        <div style="display:flex;gap:8px;">\
          <button class="btn primary" style="flex:1;" onclick="closeModal();addCdvLiveStep(\'' + liveId + '\')">📍 Ajouter une étape</button>\
          ' + (isMine ? '<button class="btn ghost" style="border-color:rgba(239,68,68,0.4);color:#ef4444;" onclick="confirmEndCdvLive(\'' + liveId + '\')">Terminer</button>' : '') + '\
        </div>' : '') + '\
      ' + (isMine ? '<button class="btn ghost block" onclick="openCdvCollaborators(\'' + liveId + '\')">👥 Co-voyageurs' + (hasCollabs ? ' (' + cdvCollaborators(live).length + ')' : '') + '</button>' : '') + '\
      ' + (isMine && !isLive ? '<button class="btn primary block" onclick="convertLiveToCarnet(\'' + liveId + '\')">📔 Convertir en carnet de voyage</button>' : '') + '\
      ' + (live.steps.length ? '<button class="btn ghost block" onclick="saveItineraryPlaces(\'' + liveId + '\',\'live\')">📍 Enregistrer les lieux</button>' : '') + '\
      ' + (!isMine ? '\
        <button class="btn primary block" onclick="toggleFollowCdvLive(\'' + liveId + '\',this)" style="background:linear-gradient(135deg,#ef4444,#f59e0b);">📡 Suivre ce voyage</button>\
        <button onclick="reportCdvLive(\'' + liveId + '\')" style="display:block;margin:4px auto 0;background:none;border:none;color:var(--muted);font-size:11px;cursor:pointer;">⚠️ Signaler ce live</button>' : '') + '\
    </div>\
  ';
  openModal(html);
  var modalEl = document.querySelector(".modal");
  if (modalEl) {
    modalEl.classList.add("modal-fullscreen");
    modalEl.setAttribute("data-live-id", liveId);
    // Lancer le refresh en temps réel si c'est un live
    if (isLive) {
      startCdvLiveRefresh(liveId);
    }
  }
  // Compteur ❤️ réel (par personne) sur le bouton like du viewer.
  if (typeof _loadCdvLiveLikes === "function") _loadCdvLiveLikes([liveId]);
  // Pays des étapes (compteur du bandeau de stats) : géocodage inverse en tâche
  // de fond, une seule fois par live, puis re-render du seul bandeau.
  if (typeof _cdvBackfillCountries === "function") _cdvBackfillCountries(live);
  // Carte de l'itinéraire (Leaflet chargé à la demande).
  if (mapPlaces.length) {
    setTimeout(function () {
      var el = document.getElementById("cdvLiveMap");
      if (el && typeof _initCdvLiveMap === "function") _initCdvLiveMap(el, mapPlaces);
    }, 200);
  }
  // Interactions cross-compte des commentaires (likes + réponses + emojis) via
  // comment_interactions : hydrate puis re-render le bloc seul.
  if (typeof hydrateCommentInteractions === "function" && (live.comments || []).length) {
    // S'assure que chaque commentaire a un id stable avant l'hydratation.
    (live.comments || []).forEach(function(c){ if (!c.id) c.id = "lc_" + (c.at || Date.now()) + "_" + Math.random().toString(36).slice(2, 7); });
    hydrateCommentInteractions({ comments: live.comments }).then(function(){
      var box = document.getElementById("cdvCommentsBox");
      if (box && document.querySelector('.modal[data-live-id="' + liveId + '"]')) box.innerHTML = _cdvCommentsBoxHtml(live);
    });
  }
}

function toggleFollowCdvLive(liveId, btn) {
  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live) return;

  if (!Array.isArray(live.followers)) live.followers = [];
  const userId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : (state.user?.id || "me");
  const isFollowing = live.followers.includes(userId);

  if (isFollowing) {
    live.followers = live.followers.filter(f => f !== userId);
    if (typeof supaUnfollowCdvLive === "function") supaUnfollowCdvLive(liveId);
    toast("✖️ Tu ne suis plus ce voyage");
  } else {
    live.followers.push(userId);
    if (typeof supaFollowCdvLive === "function") supaFollowCdvLive(liveId);
    toast("📡 Tu suis ce voyage en direct !");
  }
  live.currentViewers = live.followers.length;
  saveCdvLives(lives);
  openCdvLiveViewer(liveId);
}

// Partage d'un Live CDV : Web Share API si dispo, sinon copie du lien (réel,
// plus de faux toast). Le lien #cdv-live-<id> est repris au boot par le routage.
function shareCdvLive(liveId) {
  var lives = getCdvLives();
  var live = lives.find(function(l) { return l.id === liveId; });
  if (!live) return;
  var url = location.origin + location.pathname + "#cdv-live-" + liveId;
  var title = "📡 " + (live.destination || "Carnet de voyage en direct") + " sur PASSIO";
  var text = (live.destination ? live.destination + " · " : "") + (live.steps ? live.steps.length : 0) + " étape" + ((live.steps && live.steps.length > 1) ? "s" : "");
  if (navigator.share) {
    navigator.share({ title: title, text: text, url: url }).catch(function() {});
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(
      function() { toast("🔗 Lien du live copié"); },
      function() { toast("🔗 " + url); }
    );
  } else {
    toast("🔗 " + url);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UN SEUL « VOYAGE » (CDV v2) — modèle Polarsteps
// Avant : deux boutons concurrents (« Nouveau carnet » / « Démarrer un Live »)
// obligeaient à trancher AVANT d'écrire une ligne, entre deux objets qui
// racontent pourtant la même chose. Désormais une seule entrée « Nouveau
// voyage » ; le format se choisit selon UN critère compréhensible : est-ce que
// je pars maintenant, ou est-ce que je raconte un voyage déjà fait ?
// ═══════════════════════════════════════════════════════════════════════════
function openNewTripSheet() {
  var mine = getCdvLives().filter(function (l) { return isMyLive(l) && l.status === "live"; });
  var resume = mine.length
    ? '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.28);border-radius:12px;padding:12px;margin-bottom:12px;">'
      + '<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;">🔴 Voyage en cours</div>'
      + '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px;">« ' + escapeHtml(mine[0].destination || "Voyage") + ' » · ' + ((mine[0].steps || []).length) + ' étape(s)</div>'
      + '<button class="btn primary block" style="font-size:12px;padding:9px;" onclick="closeModal();addCdvLiveStep(\'' + mine[0].id + '\')">📍 Ajouter une étape</button>'
      + '</div>'
    : "";
  openModal(
    '<div class="modal-handle"></div>'
    + '<div class="modal-title">✈️ Nouveau voyage</div>'
    + resume
    + '<div class="cdv-trip-choice" onclick="closeModal();startCdvLive()">'
    +   '<div class="cdv-trip-choice-emoji">🔴</div>'
    +   '<div><div class="cdv-trip-choice-title">Je pars maintenant</div>'
    +   '<div class="cdv-trip-choice-sub">Publie tes étapes en direct, tes abonnés suivent le voyage au fil des jours. À la fin, tout devient un carnet.</div></div>'
    + '</div>'
    + '<div class="cdv-trip-choice" onclick="closeModal();setStudioToVlog()">'
    +   '<div class="cdv-trip-choice-emoji">📔</div>'
    +   '<div><div class="cdv-trip-choice-title">Je raconte un voyage passé</div>'
    +   '<div class="cdv-trip-choice-sub">Rédige le carnet complet d\'un coup : étapes, carte, budget, conseils.</div></div>'
    + '</div>'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STORY DE VOYAGE (CDV v2) — consommation plein écran façon Instagram/TikTok
// Les étapes ne se lisaient qu'en LISTE, un format qui ne retient personne.
// Ici : une étape = un écran vertical, barres de progression en haut, tap à
// droite/gauche pour naviguer, avance auto sur les étapes sans photo.
// L'overlay est construit en JS (mêmes conventions que #vliveOverlay).
// ═══════════════════════════════════════════════════════════════════════════
var _cdvStory = { liveId: null, steps: [], i: 0, timer: null };

function openCdvStepStory(liveId, startIndex) {
  var live = getCdvLives().find(function (l) { return l.id === liveId; });
  if (!live || !canSeeCdvLive(live)) return;
  var steps = (live.steps || []).slice();
  if (!steps.length) { toast("Ce voyage n'a pas encore d'étape"); return; }
  _cdvStory = { liveId: liveId, steps: steps, i: Math.max(0, Math.min(startIndex || 0, steps.length - 1)), timer: null, title: live.destination || "Voyage" };

  var ov = document.getElementById("cdvStoryOverlay");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "cdvStoryOverlay";
    ov.className = "cdv-story-overlay";
    document.body.appendChild(ov);
  }
  ov.style.display = "flex";
  document.body.style.overflow = "hidden";
  _renderCdvStory();
}

function _renderCdvStory() {
  var ov = document.getElementById("cdvStoryOverlay");
  if (!ov) return;
  var s = _cdvStory.steps[_cdvStory.i];
  if (!s) { closeCdvStepStory(); return; }

  var bars = _cdvStory.steps.map(function (_, i) {
    var fill = i < _cdvStory.i ? "100%" : (i === _cdvStory.i ? "100%" : "0%");
    var anim = i === _cdvStory.i ? " cdv-story-bar-active" : "";
    return '<div class="cdv-story-bar"><i style="width:' + fill + ';"' + (anim ? ' class="' + anim.trim() + '"' : '') + '></i></div>';
  }).join("");

  var photo = (s.photos && s.photos[0]) || s.photo || null;
  var media = photo
    ? '<img class="cdv-story-media" src="' + safeUrlAttr(photo) + '" alt=""/>'
    : '<div class="cdv-story-media cdv-story-media-empty"><span>' + escapeHtml(s.emoji || "📍") + '</span></div>';

  var rating = s.rating ? '<span class="cdv-story-star">' + "★".repeat(s.rating) + '</span>' : "";
  var budget = s.budget ? '<span class="cdv-story-chip">' + escapeHtml(s.budget) + '</span>' : "";

  ov.innerHTML =
    '<div class="cdv-story-bars">' + bars + '</div>'
    + '<div class="cdv-story-head">'
    +   '<div class="cdv-story-title">' + escapeHtml(_cdvStory.title) + '</div>'
    +   '<div class="cdv-story-count">' + (_cdvStory.i + 1) + '/' + _cdvStory.steps.length + '</div>'
    +   '<span class="cdv-story-close" onclick="closeCdvStepStory()" role="button" aria-label="Fermer">×</span>'
    + '</div>'
    + media
    + '<div class="cdv-story-nav cdv-story-prev" onclick="cdvStoryPrev()" role="button" aria-label="Étape précédente"></div>'
    + '<div class="cdv-story-nav cdv-story-next" onclick="cdvStoryNext()" role="button" aria-label="Étape suivante"></div>'
    + '<div class="cdv-story-foot">'
    +   '<div class="cdv-story-place">' + escapeHtml(s.emoji || "📍") + ' ' + escapeHtml(s.city || "") + rating + budget + '</div>'
    +   (s.content ? '<div class="cdv-story-text">' + escapeHtml(s.content) + '</div>' : "")
    +   '<div class="cdv-story-time">' + fmtTime(s.createdAt) + '</div>'
    + '</div>';

  // Avance automatique (5 s), comme une story — mise en pause au tap long
  // n'est pas nécessaire ici : les zones de navigation couvrent tout l'écran.
  clearTimeout(_cdvStory.timer);
  _cdvStory.timer = setTimeout(cdvStoryNext, 5000);
}

function cdvStoryNext() {
  if (_cdvStory.i >= _cdvStory.steps.length - 1) { closeCdvStepStory(); return; }
  _cdvStory.i++;
  _renderCdvStory();
}
function cdvStoryPrev() {
  if (_cdvStory.i <= 0) return;
  _cdvStory.i--;
  _renderCdvStory();
}
function closeCdvStepStory() {
  clearTimeout(_cdvStory.timer);
  var ov = document.getElementById("cdvStoryOverlay");
  if (ov) { ov.style.display = "none"; ov.innerHTML = ""; }
  document.body.style.overflow = "";
}
document.addEventListener("keydown", function (e) {
  var ov = document.getElementById("cdvStoryOverlay");
  if (!ov || ov.style.display !== "flex") return;
  if (e.key === "Escape") closeCdvStepStory();
  else if (e.key === "ArrowRight") cdvStoryNext();
  else if (e.key === "ArrowLeft") cdvStoryPrev();
});

// ═══════════════════════════════════════════════════════════════════════════
// MES LIEUX — la LISTE D'ENVIES de voyage (refonte 2026-07-22)
// ---------------------------------------------------------------------------
// v1 n'était qu'une liste morte : on capturait les lieux d'un carnet et… rien.
// Aucune raison d'y revenir, donc « on ne comprend pas à quoi ça sert ».
// v2 en fait le pendant de la wishlist de Polarsteps / des « Saved » de Google
// Maps : chaque lieu a un STATUT (à visiter → visité) et surtout des ACTIONS
// qui le sortent de la liste — y aller (itinéraire), en faire une étape de mon
// voyage en cours, ou organiser un événement IRL sur place.
// Rien de nouveau en base : tout vit dans state.user.savedPlaces.
// ═══════════════════════════════════════════════════════════════════════════
function savedPlaces() { return (state.user && state.user.savedPlaces) || []; }

// Statut d'un lieu. Les entrées de la v1 n'en ont pas → « à visiter » par défaut.
function _splStatus(p) { return (p && p.status === "done") ? "done" : "wish"; }

function savedPlacesStats() {
  var list = savedPlaces(), wish = 0, done = 0, countries = {}, trips = {};
  list.forEach(function (p) {
    if (_splStatus(p) === "done") done++; else wish++;
    if (p.country) countries[String(p.country).toLowerCase()] = p.country;
    if (p.fromTrip) trips[p.fromTrip] = 1;
  });
  return {
    total: list.length, wish: wish, done: done,
    countries: Object.keys(countries).map(function (k) { return countries[k]; }),
    trips: Object.keys(trips).length,
  };
}

function _splFind(id) {
  return savedPlaces().find(function (p) { return p.id === id; }) || null;
}

function saveItineraryPlaces(id, kind) {
  var src = kind === "live"
    ? (getCdvLives().find(function (l) { return l.id === id; }) || null)
    : (typeof findPostAnywhere === "function" ? findPostAnywhere(id) : null);
  if (!src) { toast("Voyage introuvable"); return; }
  var from = src.destination || "Voyage";
  state.user.savedPlaces = state.user.savedPlaces || [];
  var existing = {};
  state.user.savedPlaces.forEach(function (p) { existing[(p.name || "").toLowerCase()] = 1; });
  var added = 0;
  (src.steps || []).forEach(function (s) {
    var name = (s.city || s.place || "").trim();
    if (!name || existing[name.toLowerCase()]) return;
    existing[name.toLowerCase()] = 1;
    var ll = cdvStepLatLng(s);
    state.user.savedPlaces.push({
      id: "pl_" + uid(), name: name, note: (s.content || s.text || "").slice(0, 160),
      tip: s.tip || "", budget: s.budget || "", rating: s.rating || 0,
      emoji: s.emoji || "\u{1F4CD}", country: s.country || "",
      status: "wish",
      lat: ll ? ll[0] : null, lng: ll ? ll[1] : null,
      fromTrip: from, fromId: id, fromKind: kind === "live" ? "live" : "carnet", at: Date.now(),
    });
    added++;
  });
  if (state.user.savedPlaces.length > 300) state.user.savedPlaces = state.user.savedPlaces.slice(-300);
  saveState();
  closeModal();
  toast(added ? "📍 " + added + " lieu" + (added > 1 ? "x" : "") + " enregistré" + (added > 1 ? "s" : "") : "Ces lieux sont déjà dans ta liste");
  if (typeof renderCdvScreen === "function") { try { renderCdvScreen(); } catch (e) {} }
}

function removeSavedPlace(placeId) {
  state.user.savedPlaces = savedPlaces().filter(function (p) { return p.id !== placeId; });
  saveState();
  _splRender();
  if (typeof renderCdvScreen === "function") { try { renderCdvScreen(); } catch (e) {} }
}

// « Je l'ai fait ✓ » — le geste qui transforme la liste en journal : sans lui,
// une wishlist ne fait que grossir et finit par ne plus rien vouloir dire.
function toggleSavedPlaceDone(placeId) {
  var p = _splFind(placeId);
  if (!p) return;
  p.status = _splStatus(p) === "done" ? "wish" : "done";
  p.doneAt = p.status === "done" ? Date.now() : 0;
  saveState();
  _splRender();
  if (p.status === "done") toast("✅ " + p.name + " : visité !");
}

// Itinéraire : on ouvre l'app de cartes du téléphone. Les coordonnées priment
// (un nom de spot est souvent ambigu), sinon on cherche le nom + le voyage.
function _splMapsUrl(p) {
  var q = (typeof p.lat === "number" && typeof p.lng === "number")
    ? (p.lat + "," + p.lng)
    : ((p.name || "") + (p.country ? " " + p.country : ""));
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
}
function openSavedPlaceRoute(placeId) {
  var p = _splFind(placeId);
  if (!p) return;
  window.open(_splMapsUrl(p), "_blank", "noopener");
}

// Transformer un lieu en ÉTAPE de mon voyage en cours : c'est le trajet naturel
// « je l'avais repéré → j'y suis ». Le composeur d'étape est simplement
// pré-rempli (nom + coordonnées connues).
function addSavedPlaceToLive(placeId) {
  var p = _splFind(placeId);
  if (!p) return;
  var mine = (typeof getCdvLives === "function" ? getCdvLives() : [])
    .filter(function (l) { return l && l.status === "live" && isMyLive(l); });
  if (!mine.length) {
    toast("Démarre un voyage en direct pour y ajouter cette étape ✈️");
    return;
  }
  closeModal();
  addCdvLiveStep(mine[0].id);
  setTimeout(function () {
    var inp = document.getElementById("liveStepCity");
    if (inp) inp.value = p.name;
    if (typeof p.lat === "number") {
      _stepLat = p.lat; _stepLng = p.lng;
      var b = document.getElementById("cdvGeoBtn");
      if (b) { b.classList.add("active"); b.textContent = "\u{1F4CD} Position du lieu ✓"; }
    }
    if (p.rating) { try { setStepRating(p.rating); } catch (e) {} }
  }, 60);
}

// Organiser un événement IRL sur place : le lieu repéré devient une sortie.
function createEventAtSavedPlace(placeId) {
  var p = _splFind(placeId);
  if (!p || typeof openCreateEvent !== "function") return;
  closeModal();
  openCreateEvent();
  setTimeout(function () {
    var venue = document.getElementById("evVenue");
    var city = document.getElementById("evCity");
    if (venue) venue.value = p.name;
    if (city && p.name) city.value = p.name;
    if (typeof p.lat === "number") window._evPickedCoords = { lat: p.lat, lng: p.lng };
  }, 60);
}

/* --- Ajout manuel ---------------------------------------------------------
   Une liste d'envies qu'on ne peut remplir qu'en copiant le carnet d'un autre
   reste inutilisable : on doit pouvoir y jeter un lieu entendu ailleurs. Le
   géocodage part en tâche de fond (le lieu apparaît tout de suite dans la
   liste, il rejoint la carte quelques centaines de ms plus tard). */
function openAddSavedPlace() {
  openModal('<div class="modal-handle"></div>'
    + '<div class="modal-title">\u{1F4CD} Ajouter un lieu</div>'
    + '<div class="modal-subtitle">Un endroit dont on t\'a parlé, repéré ailleurs… garde-le ici pour ton prochain voyage.</div>'
    + '<label class="field"><span>Nom du lieu *</span>'
    + '<input type="text" class="input" id="splNewName" maxlength="70" placeholder="Cap Fréhel, Ryokan Kyoto, plage de Praia…"/></label>'
    + '<label class="field"><span>Pourquoi ? (optionnel)</span>'
    + '<textarea class="textarea" id="splNewNote" maxlength="200" placeholder="Coucher de soleil, prix, à faire tôt le matin…" style="min-height:64px;"></textarea></label>'
    + '<div style="display:flex;gap:8px;margin-top:12px;">'
    + '<button class="btn ghost" onclick="openSavedPlaces()">Annuler</button>'
    + '<button class="btn primary" style="flex:1;" onclick="submitAddSavedPlace()">➕ Ajouter à ma liste</button></div>');
  setTimeout(function () { var i = document.getElementById("splNewName"); if (i) i.focus(); }, 80);
}

async function submitAddSavedPlace() {
  var nameEl = document.getElementById("splNewName");
  var noteEl = document.getElementById("splNewNote");
  var name = ((nameEl && nameEl.value) || "").trim();
  if (!name) { toast("Donne un nom à ce lieu"); return; }
  var pl = {
    id: "pl_" + uid(), name: name, note: ((noteEl && noteEl.value) || "").trim().slice(0, 200),
    tip: "", budget: "", rating: 0, emoji: "\u{1F4CD}", country: "", status: "wish",
    lat: null, lng: null, fromTrip: "Ajouté à la main", fromId: "", at: Date.now(),
  };
  state.user.savedPlaces = savedPlaces().concat([pl]);
  saveState();
  toast("\u{1F4CD} " + name + " ajouté à ta liste");
  openSavedPlaces();
  if (typeof renderCdvScreen === "function") { try { renderCdvScreen(); } catch (e) {} }
  try {
    if (typeof passioGeocode === "function") {
      var g = await passioGeocode(name);
      if (g && typeof g.lat === "number") {
        var target = _splFind(pl.id);
        if (target) {
          target.lat = g.lat; target.lng = g.lng; target.country = g.country || "";
          saveState();
          if (document.getElementById("splList")) _splRender();
        }
      }
    }
  } catch (e) {}
}

/* --- Rendu ---------------------------------------------------------------- */
// Les 3 tuiles « À visiter / Visités / Pays » sont des FILTRES CUMULABLES
// (2026-07-22) : elles affichaient des chiffres mais n'étaient pas cliquables,
// alors que c'est exactement là qu'on a envie de trier. Sélection vide = tout.
// « Pays » n'est pas un statut : la tuile déplie la liste des pays, eux-mêmes
// multi-sélectionnables. Le filtrage vaut pour la LISTE **et** la CARTE.
// ⚠️ Les Sets sont stockés sous des clés DIFFÉRENTES du nom des fonctions :
// une `function X` de script classique EST `window.X`, donc `window._splStatusSel = new Set()`
// écraserait la fonction elle-même dès le premier appel.
function _splStatusSel() {
  if (!(window._splSelStatus instanceof Set)) window._splSelStatus = new Set();
  return window._splSelStatus;
}
function _splCountrySel() {
  if (!(window._splSelCountry instanceof Set)) window._splSelCountry = new Set();
  return window._splSelCountry;
}
function _splToggleStatus(s) {
  var sel = _splStatusSel();
  if (sel.has(s)) sel.delete(s); else sel.add(s);
  _splRender();
}
function _splToggleCountriesPanel() {
  window._splCountriesOpen = !window._splCountriesOpen;
  _splRender();
}
function _splToggleCountry(c) {
  var key = String(c || "").toLowerCase();
  var sel = _splCountrySel();
  if (sel.has(key)) sel.delete(key); else sel.add(key);
  window._splCountriesOpen = true;
  _splRender();
}
function _splClearFilters() {
  _splStatusSel().clear(); _splCountrySel().clear();
  window._splCountriesOpen = false;
  _splRender();
}
// Compat : l'ancienne API à filtre unique (utilisée par la suite E2E).
function _splSetFilter(f) {
  var sel = _splStatusSel();
  sel.clear();
  if (f === "wish" || f === "done") sel.add(f);
  window._splFilter = f;
  _splRender();
}
function _splSetQuery(q) { window._splQuery = String(q || "").toLowerCase().trim(); _splRender(); }

function _splVisiblePlaces() {
  var st = _splStatusSel(), ct = _splCountrySel();
  var q = window._splQuery || "";
  return savedPlaces().slice().reverse().filter(function (p) {
    if (st.size && !st.has(_splStatus(p))) return false;
    if (ct.size && !ct.has(String(p.country || "").toLowerCase())) return false;
    if (!q) return true;
    return ((p.name || "") + " " + (p.fromTrip || "") + " " + (p.note || "")
      + " " + (p.tip || "") + " " + (p.country || "")).toLowerCase().indexOf(q) > -1;
  });
}

function _splCardHtml(p, num) {
  var done = _splStatus(p) === "done";
  var meta = [];
  if (p.country) meta.push(cdvCountryFlag(p.country) + " " + escapeHtml(p.country));
  if (p.fromTrip) meta.push(escapeHtml(p.fromTrip));
  if (p.budget && p.budget !== "free") meta.push(escapeHtml(p.budget));
  if (p.rating) meta.push("★".repeat(p.rating));
  var jsId = escapeJsArg(p.id);
  // Le numéro REPREND celui du marqueur de la carte (même valeur, même ordre) :
  // sans lui, impossible de savoir quelle épingle correspond à quelle ligne.
  // Les lieux sans coordonnées n'ont pas d'épingle → pas de numéro.
  var numHtml = num
    ? '<div class="spl-card-num" title="Repère ' + num + ' sur la carte">' + num + '</div>'
    : '<div class="spl-card-num none" title="Ce lieu n\'est pas encore placé sur la carte">·</div>';
  return '<div class="spl-card' + (done ? " done" : "") + '"' + (num ? ' data-splnum="' + num + '"' : "") + '>'
    + '<div class="spl-card-head">'
    +   numHtml
    +   '<div class="spl-card-ico">' + escapeHtml(p.emoji || "\u{1F4CD}") + '</div>'
    +   '<div style="flex:1;min-width:0;">'
    +     '<div class="spl-card-name"><span>' + escapeHtml(p.name) + '</span>' + (done ? '<span class="spl-done-tag">✅ visité</span>' : "") + '</div>'
    +     (meta.length ? '<div class="spl-card-meta">' + meta.join(" · ") + '</div>' : "")
    +   '</div>'
    +   '<button class="spl-del" onclick="removeSavedPlace(\'' + jsId + '\')" aria-label="Retirer de ma liste">\u{1F5D1}</button>'
    + '</div>'
    + (p.note ? '<div class="spl-card-note">' + escapeHtml(p.note) + '</div>' : "")
    + (p.tip ? '<div class="spl-card-tip">\u{1F4A1} ' + escapeHtml(p.tip) + '</div>' : "")
    + '<div class="spl-actions">'
    +   '<button class="spl-act' + (done ? " on" : "") + '" onclick="toggleSavedPlaceDone(\'' + jsId + '\')">' + (done ? "↩ À visiter" : "✅ Visité") + '</button>'
    +   '<button class="spl-act" onclick="openSavedPlaceRoute(\'' + jsId + '\')">\u{1F9ED} Y aller</button>'
    +   '<button class="spl-act" onclick="addSavedPlaceToLive(\'' + jsId + '\')">\u{1F4E1} Étape</button>'
    +   '<button class="spl-act" onclick="createEventAtSavedPlace(\'' + jsId + '\')">\u{1F389} Événement</button>'
    + '</div>'
    + '</div>';
}

function _splRender() {
  var listEl = document.getElementById("splList");
  if (!listEl) return;
  var st = savedPlacesStats();

  var statusSel = _splStatusSel(), countrySel = _splCountrySel();

  // Les 3 tuiles SONT les filtres (multi-sélection).
  var statsEl = document.getElementById("splStats");
  if (statsEl) {
    if (!st.total) { statsEl.innerHTML = ""; }
    else {
      var tile = function (key, ico, val, lbl, on, act) {
        return '<button type="button" class="spl-tile' + (on ? " on" : "") + '" aria-pressed="' + (on ? "true" : "false")
          + '" onclick="' + act + '"><div class="spl-tile-ico">' + ico + '</div>'
          + '<div class="spl-tile-val">' + val + '</div>'
          + '<div class="spl-tile-lbl">' + escapeHtml(lbl) + '</div></button>';
      };
      statsEl.innerHTML = '<div class="spl-tiles">'
        + tile("wish", "✨", st.wish, "à visiter", statusSel.has("wish"), "_splToggleStatus('wish')")
        + tile("done", "✅", st.done, "visité" + (st.done > 1 ? "s" : ""), statusSel.has("done"), "_splToggleStatus('done')")
        + tile("country", "\u{1F30D}", st.countries.length, "pays", countrySel.size > 0 || window._splCountriesOpen, "_splToggleCountriesPanel()")
        + '</div>';
    }
  }

  // Panneau des pays : ouvert par la tuile 🌍, chaque pays est cumulable.
  var filtersEl = document.getElementById("splFilters");
  if (filtersEl) {
    var parts = [];
    if ((window._splCountriesOpen || countrySel.size) && st.countries.length) {
      parts = st.countries.slice().sort().map(function (c) {
        var on = countrySel.has(String(c).toLowerCase());
        return '<button class="pill' + (on ? " active" : "") + '" onclick="_splToggleCountry(\'' + escapeJsArg(c) + '\')">'
          + cdvCountryFlag(c) + " " + escapeHtml(c) + '</button>';
      });
    }
    if (statusSel.size || countrySel.size) {
      parts.push('<button class="pill" onclick="_splClearFilters()">✕ Tout voir</button>');
    }
    filtersEl.innerHTML = parts.join("");
  }

  if (!st.total) {
    listEl.innerHTML = '<div class="empty" style="padding:18px 12px;"><div class="empty-icon">\u{1F5FA}</div>'
      + '<div class="empty-title">Ta liste d\'envies est vide</div>'
      + '<div class="empty-text">Ouvre le carnet ou le live d\'un voyage qui te plaît puis tape « Enregistrer les lieux » : chaque étape devient une adresse à retrouver ici — avec sa carte, son budget et la note du voyageur.<br><br>Tu peux aussi ajouter un lieu à la main juste en dessous.</div></div>';
    return;
  }

  // Numérotation COMMUNE liste ↔ carte : on numérote les lieux géolocalisés
  // dans l'ordre d'affichage, et la carte reçoit exactement ces numéros.
  var vis = _splVisiblePlaces();
  var pts = [], n = 0, cards = [];
  vis.forEach(function (p) {
    var num = 0;
    if (typeof p.lat === "number" && typeof p.lng === "number") {
      num = ++n;
      pts.push({ place: p.name, dayNum: num, ll: [p.lat, p.lng] });
    }
    cards.push(_splCardHtml(p, num));
  });
  listEl.innerHTML = vis.length
    ? cards.join("")
    : '<div style="text-align:center;color:var(--muted);font-size:12px;padding:18px 0;">Aucun lieu ne correspond à ces filtres.</div>';
  _splSyncMap(pts);
}

// La carte suit les filtres. Débouncée + signature : `_initCdvLiveMap` DÉTRUIT
// et reconstruit la carte, ce qui serait insoutenable à chaque frappe dans la
// recherche (et referait clignoter les tuiles pour rien).
function _splSyncMap(pts) {
  var el = document.getElementById("savedPlacesMap");
  if (!el) return;
  if (!pts.length) { el.style.display = "none"; el._splSig = ""; return; }
  el.style.display = "";
  var sig = pts.map(function (p) { return p.dayNum + ":" + p.ll[0] + "," + p.ll[1]; }).join("|");
  if (el._splSig === sig) return;
  el._splSig = sig;
  clearTimeout(window._splMapTimer);
  window._splMapTimer = setTimeout(function () {
    var target = document.getElementById("savedPlacesMap");
    if (!target || target._splSig !== sig) return;
    if (typeof _initCdvLiveMap === "function") _initCdvLiveMap(target, pts, { connect: false });
  }, 220);
}

function openSavedPlaces() {
  if (!window._splFilter) window._splFilter = "all";
  window._splQuery = "";
  _splStatusSel().clear(); _splCountrySel().clear();
  window._splCountriesOpen = false;
  var places = savedPlaces();
  var hasMap = places.some(function (p) { return typeof p.lat === "number"; });
  openModal(
    '<div class="modal-handle"></div>'
    + '<div class="modal-title">\u{1F4CD} Mes lieux</div>'
    + '<div class="modal-subtitle">Ta liste d\'envies : les adresses repérées dans les voyages des autres, prêtes pour ton prochain départ.</div>'
    + '<div id="splStats"></div>'
    + (hasMap
        ? '<div class="vlog-mini-map" id="savedPlacesMap" style="margin-bottom:6px;"></div>'
          + '<div class="spl-map-legend">Les numéros des épingles correspondent aux lieux listés ci-dessous.</div>'
        : "")
    + (places.length > 5
        ? '<input type="text" class="input" id="splSearch" placeholder="Rechercher un lieu, un voyage…" oninput="_splSetQuery(this.value)" style="margin-bottom:8px;"/>'
        : "")
    + '<div class="spl-filters" id="splFilters"></div>'
    + '<div class="spl-list" id="splList"></div>'
    + '<div style="display:flex;gap:8px;margin-top:12px;">'
    +   '<button class="btn ghost" style="flex:1;" onclick="openAddSavedPlace()">➕ Ajouter un lieu</button>'
    +   '<button class="btn ghost" onclick="closeModal()">Fermer</button>'
    + '</div>'
  );
  // La carte est peuplée par `_splRender` (mêmes numéros que la liste, et elle
  // suit les filtres) — plus d'initialisation séparée qui divergeait.
  _splRender();
}

// ═══════════════════════════════════════════════════════════════════════════
// GÉOLOCALISATION DES ÉTAPES (CDV v2)
// `cityToLatLng` est un dictionnaire de ~220 villes FRANÇAISES : « Lisbonne »,
// « Kyoto » ou le nom d'un spot n'y figurent pas → l'étape disparaissait
// simplement de la carte. On stocke désormais de VRAIES coordonnées :
//   1. GPS de l'appareil (bouton « 📍 Ma position ») — précis, instantané ;
//   2. sinon géocodage Nominatim mondial du nom saisi (en tâche de fond) ;
//   3. sinon repli sur le dictionnaire (rétro-compat des étapes existantes).
// ═══════════════════════════════════════════════════════════════════════════

// Coordonnées d'une étape (live OU carnet), quelle que soit sa forme.
function cdvStepLatLng(s) {
  if (!s) return null;
  if (typeof s.lat === "number" && typeof s.lng === "number") return [s.lat, s.lng];
  var name = s.city || s.place || "";
  return (name && typeof cityToLatLng === "function") ? cityToLatLng(name) : null;
}

// Cache de géocodage (mémoire + localStorage) : Nominatim demande de ne pas
// marteler son service, et un même lieu revient d'étape en étape.
function _cdvGeoCache() {
  if (!window._cdvGeoCacheObj) {
    try { window._cdvGeoCacheObj = JSON.parse(localStorage.getItem("passio_cdv_geo_v1") || "{}"); }
    catch (e) { window._cdvGeoCacheObj = {}; }
  }
  return window._cdvGeoCacheObj;
}
function _cdvGeoCacheSet(key, val) {
  var c = _cdvGeoCache();
  c[key] = val;
  try { localStorage.setItem("passio_cdv_geo_v1", JSON.stringify(c)); } catch (e) {}
}

// Géocode un nom de lieu (monde entier) → {lat,lng} ou null. Best-effort.
async function cdvGeocodePlace(name) {
  var key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  var cache = _cdvGeoCache();
  if (cache[key] !== undefined) return cache[key];
  var res = null;
  try {
    if (typeof _geocodeAddress === "function") res = await _geocodeAddress(key);
  } catch (e) { res = null; }
  // Repli dictionnaire France si le réseau échoue.
  if (!res && typeof cityToLatLng === "function") {
    var ll = cityToLatLng(key);
    if (ll) res = { lat: ll[0], lng: ll[1] };
  }
  _cdvGeoCacheSet(key, res);
  return res;
}

// Position GPS de l'appareil pour l'étape en cours de saisie. Remplit aussi le
// champ « Où es-tu ? » par géocodage inverse s'il est vide.
var _stepLat = null, _stepLng = null;
function cdvUseMyPosition() {
  var btn = document.getElementById("cdvGeoBtn");
  if (!navigator.geolocation) { toast("Géolocalisation indisponible sur cet appareil"); return; }
  if (btn) { btn.disabled = true; btn.textContent = "📍 Localisation…"; }
  navigator.geolocation.getCurrentPosition(function (pos) {
    _stepLat = pos.coords.latitude;
    _stepLng = pos.coords.longitude;
    if (btn) { btn.disabled = false; btn.textContent = "📍 Position enregistrée ✓"; btn.classList.add("active"); }
    toast("📍 Position enregistrée");
    var inp = document.getElementById("liveStepCity");
    if (inp && !inp.value.trim()) _cdvReverseGeocode(_stepLat, _stepLng, inp);
  }, function () {
    if (btn) { btn.disabled = false; btn.textContent = "📍 Ma position"; }
    toast("Position refusée ou indisponible");
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

// Géocodage INVERSE : coordonnées → nom de lieu lisible (pré-remplit le champ).
// ⚠️ Passe par passioReverseGeocode (BAN + Photon, gratuits et sans clé) : l'appel
// direct à Nominatim qui existait ici est désormais BLOQUÉ par la CSP de prod, en
// plus d'enfreindre sa politique d'usage. (Migré le 2026-07-21.)
async function _cdvReverseGeocode(lat, lng, inputEl) {
  try {
    if (typeof passioReverseGeocode !== "function") return;
    var r = await passioReverseGeocode(lat, lng);
    var name = (r && (r.city || r.name)) || "";
    if (name && inputEl && !inputEl.value.trim()) inputEl.value = name;
  } catch (e) {}
}

// Complète en tâche de fond les coordonnées d'une étape enregistrée sans GPS,
// puis rafraîchit la carte si le viewer est ouvert. Ne bloque JAMAIS la
// publication : l'étape part tout de suite, la carte se précise après.
async function _cdvBackfillStepCoords(liveId, stepId, name) {
  var geo = await cdvGeocodePlace(name);
  if (!geo) return;
  var lives = getCdvLives();
  var live = lives.find(function (l) { return l.id === liveId; });
  if (!live) return;
  var st = (live.steps || []).find(function (s) { return s.id === stepId; });
  if (!st || typeof st.lat === "number") return;
  st.lat = geo.lat; st.lng = geo.lng;
  saveCdvLives(lives);
  if (typeof supaUpdateCdvLiveStepCoords === "function") supaUpdateCdvLiveStepCoords(stepId, geo.lat, geo.lng);
  if (document.querySelector('.modal[data-live-id="' + liveId + '"]')) openCdvLiveViewer(liveId);
}

// Idem pour les étapes d'un CARNET : géocode tous les lieux non résolus puis
// re-rend le viewer (les coordonnées sont persistées dans le post → jsonb vlog).
async function _cdvBackfillCarnetCoords(post) {
  if (!post || !Array.isArray(post.steps)) return;
  var changed = false;
  for (var i = 0; i < post.steps.length; i++) {
    var s = post.steps[i];
    if (!s || typeof s.lat === "number" || !s.place) continue;
    var geo = await cdvGeocodePlace(s.place);
    if (geo) { s.lat = geo.lat; s.lng = geo.lng; changed = true; }
  }
  if (!changed) return;
  try { saveState(); } catch (e) {}
  var vw = document.getElementById("vlogViewer");
  if (vw && vw.classList.contains("open") && vw.getAttribute("data-current-post") === post.id) openVlogViewer(post.id);
}

// Ouvre la cible d'un lien partagé #cdv-live-<id> / #carnet-<id>.
// ⚠️ Ces liens EXISTAIENT (shareCdvLive les fabrique depuis le début) mais AUCUN
// routage ne les lisait : ouvrir un lien partagé retombait sur l'accueil, donc le
// partage d'un carnet/live ne ramenait personne sur le contenu. Appelé au boot
// (après le chargement des lives) et à chaque changement de hash.
function _openCdvDeepLink() {
  try {
    var h = (location.hash || "").replace(/^#/, "");
    if (!h) return false;
    var mLive = h.match(/^cdv-live-(.+)$/);
    if (mLive) {
      var lid = decodeURIComponent(mLive[1]);
      if (!getCdvLives().some(function (l) { return l.id === lid; })) return false;
      if (typeof goTo === "function") goTo("cdv");
      setTimeout(function () { openCdvLiveViewer(lid); }, 120);
      history.replaceState(null, "", location.pathname + location.search);
      return true;
    }
    var mCar = h.match(/^carnet-(.+)$/);
    if (mCar) {
      var cid = decodeURIComponent(mCar[1]);
      var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(cid) : null;
      if (!post) return false;
      if (typeof goTo === "function") goTo("cdv");
      setTimeout(function () { openVlogViewer(cid); }, 120);
      history.replaceState(null, "", location.pathname + location.search);
      return true;
    }
  } catch (e) {}
  return false;
}
window.addEventListener("hashchange", function () { _openCdvDeepLink(); });

// Signalement d'un Live (modération) — réutilise supaReport (table reports).
function reportCdvLive(liveId) {
  if (!liveId) return;
  if (typeof supaReport === "function") supaReport("cdv_live", liveId, "");
  toast("🚩 Live signalé. Merci, on s'en occupe.");
}

// Enregistre une réaction emoji sur un live AVEC son auteur : `reactions` (strings,
// pour les compteurs de la barre du viewer) ET `reactionsBy` ([{emoji,userId}], pour
// la pastille « qui a réagi »). Auteur = MY_UID.
// UNE réaction (non-❤️) par personne sur un live : remplace la précédente ; re-tap
// de la même = toggle off. Met à jour reactions[] (compteurs de la barre) ET
// reactionsBy[] ({emoji,userId} pour « qui a réagi »), et resynchronise Supabase
// (delete de l'ancienne + insert). Le ❤️ (like) est géré à part. Retourne
// { removedSame } (true = on a juste retiré, pas de toast).
function _pushLiveReaction(live, emoji) {
  if (!live) return { removedSame: false };
  if (!Array.isArray(live.reactions)) live.reactions = [];
  if (!Array.isArray(live.reactionsBy)) live.reactionsBy = [];
  var me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  var mine = live.reactionsBy.filter(function (x) { return x && x.userId === me && x.emoji !== "❤️"; });
  var prev = mine.length ? mine[mine.length - 1].emoji : null;
  var toggleOff = prev === emoji;
  // Retirer ma réaction précédente (agrégat + « qui a réagi » + serveur).
  live.reactionsBy = live.reactionsBy.filter(function (x) { return !(x && x.userId === me && x.emoji !== "❤️"); });
  if (prev) {
    var idx = live.reactions.indexOf(prev);
    if (idx > -1) live.reactions.splice(idx, 1);
    if (typeof supaRemoveCdvLiveReaction === "function") supaRemoveCdvLiveReaction(live.id, prev);
  }
  if (toggleOff) return { removedSame: true };
  live.reactions.push(emoji);
  live.reactionsBy.push({ emoji: emoji, userId: me, at: Date.now() });
  if (typeof supaReactCdvLive === "function") supaReactCdvLive(live.id, emoji);
  return { removedSame: false };
}

function reactCdvLive(liveId, emoji) {
  // ❤️ = like (toggle strict), jamais une réaction empilable.
  if (emoji === "❤️") {
    var lkEl = document.querySelector('[data-livelike="' + liveId + '"]');
    likeCdvLiveCard(liveId, lkEl);
    return;
  }
  var lives = getCdvLives();
  var live = lives.find(function(l) { return l.id === liveId; });
  if (!live) return;
  var res = _pushLiveReaction(live, emoji);
  saveCdvLives(lives);
  if (!res.removedSame) toast(emoji);
  // Patch la barre de réactions en place (compteurs) plutôt que reconstruire tout
  // le viewer (étapes/photos/commentaires) à chaque tap → plus de scroll perdu ni
  // de lag, et les réponses dépliées restent ouvertes.
  if (typeof _patchCdvLiveViewer === "function") _patchCdvLiveViewer(live, false);
  else openCdvLiveViewer(liveId);
}

// Like ❤️ d'une CARTE live en TOGGLE STRICT (1 par compte, comme les événements).
// Ne rouvre PAS le viewer ; patch le compteur en place. Cache window._liveLikes +
// état optimiste state.user.likedLives ; sync cdv_live_reactions (emoji '❤️').
function likeCdvLiveCard(liveId, el) {
  state.user.likedLives = state.user.likedLives || [];
  window._liveLikes = window._liveLikes || {};
  var cur = window._liveLikes[liveId] || { likes: 0, liked: false };
  var liked = state.user.likedLives.indexOf(liveId) > -1;
  if (liked) {
    state.user.likedLives = state.user.likedLives.filter(function(x){ return x !== liveId; });
    cur.likes = Math.max(0, (cur.likes || 1) - 1); cur.liked = false;
  } else {
    state.user.likedLives.push(liveId);
    cur.likes = (cur.likes || 0) + 1; cur.liked = true;
  }
  window._liveLikes[liveId] = cur;
  if (typeof saveState === "function") saveState();
  // Tous les exemplaires : un live peut être affiché en même temps sur sa carte
  // épinglée, sur sa carte de liste et dans le viewer ouvert par-dessus.
  var _els = document.querySelectorAll('[data-livelike="' + liveId + '"]');
  if (!_els.length && el) _els = [el];
  [].forEach.call(_els, function (n) {
    n.classList.toggle("liked", cur.liked); n.classList.toggle("active", cur.liked);
    n.innerHTML = (cur.liked ? "❤️" : "🤍") + " " + (cur.likes || 0);
  });
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID && window._supaReal && typeof supaToggleCdvLiveLike === "function") {
    supaToggleCdvLiveLike(liveId);
    if (cur.liked) {
      var lv = getCdvLives().find(function(l){ return l.id === liveId; });
      if (lv && lv.authorId && lv.authorId !== MY_UID && typeof supaInsertNotif === "function") {
        supaInsertNotif(lv.authorId, "like", liveId, "a aimé ton live");
      }
    }
  }
}

// 😊 Réagir depuis une CARTE live : popover d'emojis → reactions (sans rouvrir le viewer).
// Le ❤️ du popover route vers le toggle de like (cohérent avec le bouton ❤️).
function reactCdvLivePicker(liveId, event) {
  // Panneau segmenté unifié, emoji uniquement (les lives ne stockent que des emojis).
  var _picker = (typeof emojiReactPanel === "function") ? emojiReactPanel : _emojiReactPopover;
  return _picker(event, function(emoji){
    if (emoji === "❤️") {
      var el = document.querySelector('[data-livelike="' + liveId + '"]');
      if ((state.user.likedLives || []).indexOf(liveId) < 0) likeCdvLiveCard(liveId, el);
      return;
    }
    var lives = getCdvLives();
    var live = lives.find(function(l) { return l.id === liveId; });
    if (!live) return;
    var res = _pushLiveReaction(live, emoji);
    saveCdvLives(lives);
    // Met à jour EN PLACE la pastille « 😍 N » de la/les carte(s) de ce live.
    if (typeof _liveReactChipHtml === "function") {
      document.querySelectorAll('[data-livechip="' + liveId + '"]').forEach(function(h){ h.innerHTML = _liveReactChipHtml(liveId); });
    }
    if (!res.removedSame && typeof toast === "function") toast(emoji);
  });
}

// Span ❤️ de like d'une carte live (toggle), lu depuis le cache _liveLikes +
// l'état optimiste state.user.likedLives. Mutualisé entre cartes en cours/terminées.
function _liveLikeSpanHtml(l) {
  var c = (window._liveLikes && window._liveLikes[l.id]) || { likes: 0, liked: false };
  var liked = (state.user.likedLives || []).indexOf(l.id) > -1 || c.liked;
  return '<span class="post-action ' + (liked ? "liked" : "") + '" data-livelike="' + l.id
    + '" onclick="event.stopPropagation();likeCdvLiveCard(\'' + l.id + '\', this)">'
    + (liked ? "❤️" : "🤍") + " " + (c.likes || 0) + '</span>';
}

// Charge en une requête les likes ❤️ (par utilisateur distinct) des lives visibles
// puis met à jour les pastilles ❤️ en place (cache window._liveLikes).
async function _loadCdvLiveLikes(ids) {
  window._liveLikes = window._liveLikes || {};
  if (!ids || !ids.length) return;
  if (typeof supaLoadCdvLiveLikes !== "function" || !window._supaReal) return;
  try {
    var data = await supaLoadCdvLiveLikes(ids);
    if (!data) return;
    Object.keys(data).forEach(function(id){
      var d = data[id];
      if ((state.user.likedLives || []).indexOf(id) > -1) d.liked = true;
      window._liveLikes[id] = d;
      document.querySelectorAll('[data-livelike="' + id + '"]').forEach(function (lk) {
        lk.classList.toggle("liked", d.liked); lk.classList.toggle("active", d.liked);
        lk.innerHTML = (d.liked ? "❤️" : "🤍") + " " + (d.likes || 0);
      });
    });
  } catch (e) {}
}

function addCdvLiveComment(liveId) {
  var inp = document.getElementById("cdvLiveComment") || document.getElementById("cmtThreadInput");
  if (!inp) return;
  var text = inp.value.trim();
  if (!text) return;
  var lives = getCdvLives();
  var live = lives.find(function(l) { return l.id === liveId; });
  if (!live) return;
  if (!live.comments) live.comments = [];
  var _author = (state.user.general && state.user.general.username) || state.user.name || "Moi";
  var _myId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  var _c = { id: "lc_local_" + Date.now(), authorId: _myId, author: _author, authorName: _author, text: text, at: Date.now(), createdAt: Date.now(), replies: [], likes: 0, likedBy: [] };
  live.comments.push(_c);
  saveCdvLives(lives);
  if (typeof supaAddCdvLiveComment === "function") supaAddCdvLiveComment(liveId, text);
  // Notifie l'auteur du live (interaction cross-compte sur SON carnet).
  if (live.authorId && live.authorId !== _myId && live.authorId !== "me" && typeof supaInsertNotif === "function") {
    try { supaInsertNotif(live.authorId, "comment", liveId, "a commenté ton live"); } catch (e) {}
  }
  // Re-render le bloc commentaires seul (évite de ré-ouvrir toute la modale et de
  // perdre la position de défilement).
  if (inp) inp.value = "";
  var box = document.getElementById("cdvCommentsBox");
  if (box) box.innerHTML = _cdvCommentsBoxHtml(live);
  else if (typeof _refreshCommentThreadUI === "function" && document.getElementById("cmtThreadList")) _refreshCommentThreadUI(liveId);
  else if (document.querySelector(".modal[data-live-id]")) openCdvLiveViewer(liveId);
}

// renderCdvLives() n'est plus utilisée - les lives s'affichent uniquement dans cdvList via renderCdvScreen()
// Cette fonction est conservée vide pour compatibilité
function renderCdvLives() {
  const el = document.getElementById("cdvLiveList");
  if (el) el.innerHTML = "";
}

// Ouvre l'éditeur de carnet (dans l'écran CDV — plus dans le Studio).
function setStudioToVlog() {
  activateStudioVlog();
}

// Filtre actif sur l'écran CDV - multi-select (saved / mine / live)
let cdvFilters = new Set(); // Vide par défaut = affiche TOUS les carnets

// Carte compacte d'un Live épinglé en tête de la liste CDV (vue par défaut).
// Pastille rouge animée déjà stylée (.cdv-live-badge). Clic → viewer du live.
function _pinnedLiveCardHtml(l) {
  const seedAuthor = userById(l.authorId);
  const authorName = isMyLive(l) ? (state.user.name || "Toi") : (seedAuthor && seedAuthor.name) || "Passionné";
  const viewerCount = cdvLiveFollowerCount(l);
  const nSteps = (l.steps || []).length;
  return `<div class="cdv-live-card cdv-live-pinned" onclick="openCdvLiveViewer('${l.id}')" style="border-color:rgba(239,68,68,0.35);position:relative;">
    ${_cdvLiveMenuBtnHtml(l)}
    <div class="cdv-live-header">
      <span class="cdv-live-badge">🔴 EN DIRECT</span>
      <div style="flex:1;min-width:0;">
        <div class="cdv-live-dest">${escapeHtml(l.destination || "Live")}</div>
        <div class="cdv-live-author">par ${escapeHtml(authorName)} · ${nSteps} étape${nSteps > 1 ? "s" : ""}</div>
      </div>
      <span style="font-size:11px;color:var(--muted);white-space:nowrap;">👁 ${viewerCount}</span>
    </div>
    ${_cdvLiveActionsHtml(l)}
  </div>`;
}

function renderCdvScreen() {
  const list = document.getElementById("cdvList");
  if (!list) return;

  // Vider cdvLiveList (ne pas afficher les lives en haut)
  const liveListEl = document.getElementById("cdvLiveList");
  if (liveListEl) liveListEl.innerHTML = "";

  // ⚠️ Les deux boutons sont désormais TOUJOURS visibles (2026-07-22) : les
  // masquer tant que la collection était vide rendait ces deux fonctions
  // invisibles pour ceux qui n'en avaient jamais entendu parler — or c'est
  // justement l'état où il faut expliquer à quoi elles servent (chacune a un
  // état vide pédagogique avec son CTA).
  // ⚠️ Seul le LIBELLÉ est réécrit (l'icône du bouton est un span à part, et
  // celle du passeport un SVG : un textContent sur le bouton les effacerait).
  const spBtn = document.getElementById("cdvSavedPlacesBtn");
  if (spBtn) {
    const n = savedPlaces().length;
    spBtn.style.display = "";
    const lbl = document.getElementById("cdvSavedPlacesLbl");
    if (lbl) lbl.textContent = n ? n + " lieu" + (n > 1 ? "x" : "") : "";
  }

  // Le libellé du passeport porte le chiffre qui donne envie de l'ouvrir
  // (km cumulés), sinon une invitation explicite.
  const ppBtn = document.getElementById("cdvPassportBtn");
  if (ppBtn) {
    const pp = cdvPassportStats();
    ppBtn.style.display = "";
    const plbl = document.getElementById("cdvPassportLbl");
    if (plbl) plbl.textContent = pp.km
      ? _cdvKmLabel(pp.km) + " km"
      : (pp.trips.length ? pp.trips.length + " voyage" + (pp.trips.length > 1 ? "s" : "") : "");
  }

  // Sync filter pills (multi-select)
  document.querySelectorAll("#cdvFilterRow .pill").forEach(p => {
    const filterType = p.getAttribute("data-cdvfilter");
    p.classList.toggle("active", cdvFilters && cdvFilters.has(filterType));
  });

  const q = (($("#cdvSearchInput") && $("#cdvSearchInput").value) || "").toLowerCase().trim();
  const hasFilters = !!(cdvFilters && cdvFilters.size > 0);
  // Les 3 pastilles sont des filtres CUMULABLES. Avant, « 🔴 Lives » n'était pris
  // en compte QUE s'il était le seul actif : cocher « Mes carnets » + « Lives »
  // faisait disparaître les lives sans le dire. Désormais la sélection est
  // additive : Lives ajoute les lives, Mes carnets / Favoris ajoutent des carnets,
  // et « Mes carnets » restreint aussi les lives aux miens.
  const wantLives = !hasFilters ? false : cdvFilters.has("live");
  const wantMine = cdvFilters.has("mine");
  const wantSaved = cdvFilters.has("saved");

  let livesHtml = "";
  let liveIdsShown = [];
  // « ⭐ Mes favoris » couvre aussi les voyages en direct sauvegardés.
  if (wantLives || wantSaved) {
    const seenIds = new Set();
    const lives = getCdvLives()
      .filter(l => canSeeCdvLive(l))
      .filter(l => {
        if (wantLives && (!wantMine || isMyLive(l))) return true;
        return wantSaved && isLiveSaved(l.id);   // favoris : même sans le filtre Lives
      })
      .filter(l => !q || _cdvLiveMatchesQuery(l, q))
      .filter(l => { if (seenIds.has(l.id)) return false; seenIds.add(l.id); return true; });

    const active = lives.filter(l => l.status === "live");
    const ended = lives.filter(l => l.status !== "live");
    liveIdsShown = active.concat(ended).map(l => l.id);

    if (active.length) livesHtml += `<div style="font-weight:700;font-size:13px;color:var(--text);margin:14px 0 8px;">✨ ${active.length} live${active.length > 1 ? "s" : ""} en cours</div>`;
    livesHtml += active.map(_cdvActiveLiveCardHtml).join("");
    if (ended.length) livesHtml += `<div style="font-weight:700;font-size:13px;color:var(--text);margin:14px 0 8px;">✅ Lives terminés</div>`;
    livesHtml += ended.map(_cdvEndedLiveCardHtml).join("");
  }

  let carnets = allCarnets();

  // Carnets : « Lives » seul = pas de carnets ; sinon union des filtres cochés.
  if (hasFilters) {
    if (!wantMine && !wantSaved) {
      carnets = [];
    } else {
      const savedIds = wantSaved ? savedCarnets() : [];
      const filtered = new Set();
      if (wantSaved) savedIds.forEach(id => { const c = carnets.find(x => x.id === id); if (c) filtered.add(c); });
      if (wantMine) carnets.filter(c => c._source === "me").forEach(c => filtered.add(c));
      carnets = Array.from(filtered);
    }
  }

  if (q) carnets = carnets.filter(c => _cdvCarnetMatchesQuery(c, q));

  // Live épinglé : si un carnet Live est en cours, on le remonte EN TÊTE de la
  // liste CDV. En recherche, les lives correspondants restent épinglés (avant, ils
  // disparaissaient dès la première lettre tapée alors que c'est LE contenu chaud).
  let pinnedLivesHtml = "";
  if (!hasFilters) {
    const _seenPin = new Set();
    const _activeLives = getActiveCdvLives()
      .filter(l => !q || _cdvLiveMatchesQuery(l, q))
      .filter(l => { if (_seenPin.has(l.id)) return false; _seenPin.add(l.id); return true; });
    if (_activeLives.length) {
      pinnedLivesHtml = '<div class="cdv-pinned-live-title">🔴 En direct maintenant</div>'
        + _activeLives.map(_pinnedLiveCardHtml).join("");
      liveIdsShown = liveIdsShown.concat(_activeLives.map(l => l.id));
    }
  }

  const headHtml = pinnedLivesHtml + livesHtml;

  if (!carnets.length) {
    // Un Live (épinglé ou filtré) reste visible même sans aucun carnet à afficher.
    if (headHtml) {
      list.innerHTML = headHtml;
      const _emptyEl = document.getElementById("cdvEmpty");
      if (_emptyEl) _emptyEl.style.display = "none";
      if (liveIdsShown.length) _loadCdvLiveLikes(liveIdsShown);
      return;
    }
    list.innerHTML = "";
    const empty = document.getElementById("cdvEmpty");
    if (empty) {
      let icon = "📔", title = "Aucun carnet trouvé", text = "", cta = "";
      if (q) {
        title = "Aucun résultat";
        text = "Rien ne correspond à « " + escapeHtml(q) + " ». Essaie une autre destination, un lieu d'étape ou un pseudo.";
      } else if (hasFilters) {
        title = "Aucun carnet dans ce filtre";
        text = "Retire les filtres ou crée ton premier carnet.";
        cta = '<button class="btn primary" style="margin-top:12px;" onclick="setStudioToVlog()">📔 Créer un carnet</button>';
      } else {
        title = "Aucun carnet pour le moment";
        text = "Raconte ton prochain voyage, étape par étape.";
        cta = '<button class="btn primary" style="margin-top:12px;" onclick="setStudioToVlog()">📔 Créer un carnet</button>';
      }
      empty.innerHTML = '<div class="empty-icon">' + icon + '</div><div class="empty-title">' + title + '</div><div class="empty-text">' + text + '</div>' + cta;
      empty.style.display = "block";
    }
    return;
  }
  document.getElementById("cdvEmpty").style.display = "none";

  // Format "fil d'actualité" : chaque carnet est un post complet.
  // Le(s) Live(s) en cours sont épinglés en tête via headHtml.
  list.innerHTML = headHtml + carnets.map(c => {
    const stats = vlogStats(c);
    const isMine = c._source === "me";
    const seedAuthor = userById(c.authorId);
    const authorName = isMine ? (state.user.name || "Toi") : (seedAuthor && seedAuthor.name) || "Anonyme";
    const authorEmoji = isMine ? "🌍" : (seedAuthor && seedAuthor.profileEmoji) || "🌍";
    const authorColor = isMine ? "#7c3aed" : (seedAuthor && seedAuthor.avatar) || "#7c3aed";
    const isSaved = isCarnetSaved(c.id);
    const isLiked = state.user.likedPosts && state.user.likedPosts.includes(c.id);

    const fmtRange = (a, b) => {
      const o = { day: "numeric", month: "short", year: "numeric" };
      if (a && b) return new Date(a).toLocaleDateString("fr-FR", o) + " → " + new Date(b).toLocaleDateString("fr-FR", o);
      if (a) return new Date(a).toLocaleDateString("fr-FR", o);
      return "";
    };
    const dates = fmtRange(c.dateStart, c.dateEnd);
    const since = c.createdAt ? fmtTime(c.createdAt) : "";

    return `<article class="cdv-feed-card" onclick="openVlogViewer('${c.id}')">
      <div class="cdv-feed-header">
        <div class="avatar" style="background:${authorColor};">${authorEmoji}</div>
        <div class="cdv-feed-author">
          <div class="cdv-feed-author-name">
            ${escapeHtml(authorName)}
            ${isMine ? '<span class="pill" style="padding:2px 7px;font-size:9px;border-color:rgba(139,92,246,0.5);">Moi</span>' : ""}
          </div>
          <div class="cdv-feed-author-meta">a publié un carnet de voyage · ${escapeHtml(since)}</div>
        </div>
        ${isSaved ? `<span class="cdv-feed-saved-badge">⭐ Sauvegardé</span>` : ""}
        ${isMine ? `<span class="post-action" onclick="event.stopPropagation();openPostOptions('${c.id}')" title="Options" aria-label="Options du carnet" style="margin-left:6px;">⋯</span>` : ""}
      </div>

      <div class="cdv-feed-cover-wrap">
        ${c.cover ? `<img loading="lazy" decoding="async" class="cdv-feed-cover" src="${safeUrlAttr(c.cover)}" alt="" onerror="this.onerror=null;this.src='https://picsum.photos/seed/cdv-${c.id}/1280/720';"/>` : ""}
        <div class="cdv-feed-cover-overlay"></div>
        <div class="cdv-feed-cover-meta">
          <span class="cdv-feed-tag">📔 CARNET DE VOYAGE</span>
          <div class="cdv-feed-dest">${escapeHtml(c.destination || "Voyage")}</div>
          ${dates ? `<div class="cdv-feed-dates">${escapeHtml(dates)}</div>` : ""}
        </div>
      </div>

      <div class="cdv-feed-body">
        <div class="cdv-feed-stats">
          <span>📍 ${stats.durée} jours</span>
          <span>•</span>
          <span>🎒 ${stats.nbDays} étapes</span>
          ${c.budget ? `<span>•</span><span>💰 ${escapeHtml(c.budget)}</span>` : ""}
          ${c.transport ? `<span>•</span><span>🚆 ${escapeHtml(c.transport)}</span>` : ""}
        </div>
        ${c.tip ? `<div class="cdv-feed-tip">
          <div class="cdv-feed-tip-label">⭐ LE CONSEIL CLÉ</div>
          ${escapeHtml(c.tip.length > 140 ? c.tip.slice(0, 140) + "…" : c.tip)}
        </div>` : ""}
      </div>

      <div class="post-actions" onclick="event.stopPropagation()">
        <span class="post-action ${isLiked ? "liked" : ""}" data-postlike="${c.id}" onclick="event.stopPropagation();likePost('${c.id}', true, this)">${isLiked ? "❤️" : "🤍"} ${c.likes || 0}</span>
        <span class="post-action" onclick="openComments('${c.id}')">💬 ${commentThreadCount(c.comments)}</span>
        <span class="post-action" onclick="return showEmojiPickerForPost('${c.id}', event);" title="Emoji & GIF">😊</span>
        <span class="post-action" onclick="event.stopPropagation();sharePost('${c.id}')" title="Partager" aria-label="Partager">${shareIconSvg(18)}</span>
        <span class="post-action" onclick="toggleCarnetSave('${c.id}');renderCdvScreen()" title="${isSaved ? "Sauvegardé" : "Sauvegarder"}">${isSaved ? "⭐" : "☆"}</span>
        <span class="post-react-chip-holder" data-postchip="${c.id}" style="margin-left:auto;">${_postReactChipHtml(c.id)}</span>
      </div>
    </article>`;
  }).join("");

  // Likes ❤️ par utilisateur distinct (chargés en lot, patch DOM sans re-render).
  if (liveIdsShown.length) _loadCdvLiveLikes(liveIdsShown);
}

// ── Recherche CDV ────────────────────────────────────────────────────────────
// La recherche ne couvrait que destination / texte / lieux d'étapes d'un CARNET :
// impossible de retrouver un live, un auteur, un conseil ou un bilan pratique.
function _cdvLiveMatchesQuery(l, q) {
  if (!q) return true;
  var author = (isMyLive(l) ? (state.user.name || "") : ((userById(l.authorId) || {}).name || ""));
  var hay = [l.destination, l.description, author]
    .concat((l.steps || []).map(function (s) { return (s.city || "") + " " + (s.content || ""); }))
    .join(" ").toLowerCase();
  return hay.indexOf(q) > -1;
}

function _cdvCarnetMatchesQuery(c, q) {
  if (!q) return true;
  var author = (c._source === "me" ? (state.user.name || "") : ((userById(c.authorId) || {}).name || ""));
  var hay = [c.destination, c.text, c.tip, c.budget, c.transport, c.lodging, c.season, author]
    .concat((c.steps || []).map(function (s) { return (s.place || "") + " " + (s.text || "") + " " + (s.tip || ""); }))
    .join(" ").toLowerCase();
  return hay.indexOf(q) > -1;
}

// ── Cartes de live de la liste CDV (extraites de renderCdvScreen) ────────────
function _cdvActiveLiveCardHtml(l) {
  const isNew = l.createdAt && Date.now() - l.createdAt < 60000;
  const seedAuthor = userById(l.authorId);
  const authorName = isMyLive(l) ? (state.user.name || "Toi") : (seedAuthor && seedAuthor.name) || "Passionné";
  const viewerCount = cdvLiveFollowerCount(l);
  const myId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  const isFollowing = (Array.isArray(l.followers) ? l.followers : []).includes(myId);
  const steps = l.steps || [];
  return `<div class="cdv-live-card" onclick="openCdvLiveViewer('${l.id}')" style="border-color:rgba(239,68,68,0.3);position:relative;">
    ${_cdvLiveMenuBtnHtml(l)}
    ${isNew ? '<div style="position:absolute;top:11px;right:38px;background:#ef4444;color:#fff;font-size:9px;font-weight:700;padding:3px 7px;border-radius:12px;">NOUVEAU</div>' : ''}
    <div class="cdv-live-header">
      <span class="cdv-live-badge">🔴 EN DIRECT</span>
      <div style="flex:1;">
        <div class="cdv-live-dest">${escapeHtml(l.destination || "Live")}</div>
        <div class="cdv-live-author">par ${escapeHtml(authorName)} · ${steps.length} étape${steps.length > 1 ? "s" : ""}</div>
      </div>
    </div>
    ${steps.length ? `
      <div class="cdv-live-steps">
        ${steps.slice(-5).map((s) => `
          <div class="cdv-live-step" onclick="event.stopPropagation();openCdvStepStory('${l.id}', ${steps.indexOf(s)})" title="Voir en plein écran">
            <div class="cdv-live-step-emoji">${escapeHtml(s.emoji || "📍")}</div>
            <div class="cdv-live-step-city">${escapeHtml(s.city || "")}</div>
            <div class="cdv-live-step-time">${fmtTime(s.createdAt)}</div>
          </div>`).join("")}
      </div>` : `<div style="text-align:center;padding:10px;color:var(--muted);font-size:11px;">En attente de la première étape…</div>`}
    <div class="cdv-live-footer">
      <div class="cdv-live-count">👁 ${viewerCount} suivent</div>
      ${canEditLive(l)
        ? `<button class="cdv-live-follow-btn" onclick="event.stopPropagation();addCdvLiveStep('${l.id}')">+ Étape</button>`
        : `<button class="cdv-live-follow-btn" onclick="event.stopPropagation();toggleFollowCdvLive('${l.id}',this)" style="background:${isFollowing ? '#8b5cf6' : 'var(--border)'};color:${isFollowing ? '#fff' : 'var(--text)'};">${isFollowing ? '✓ En suivi' : '📡 Suivre'}</button>`}
    </div>
    ${_cdvLiveActionsHtml(l)}
  </div>`;
}

function _cdvEndedLiveCardHtml(l) {
  const steps = l.steps || [];
  return `<div class="cdv-live-card" onclick="openCdvLiveViewer('${l.id}')" style="border-color:var(--border);position:relative;">
    ${_cdvLiveMenuBtnHtml(l)}
    <div class="cdv-live-header">
      <span style="font-size:10px;font-weight:700;color:var(--muted);background:var(--bg-deep);padding:3px 8px;border-radius:6px;">✅ TERMINÉ</span>
      <div style="flex:1;">
        <div class="cdv-live-dest">${escapeHtml(l.destination || "Live")}</div>
        <div class="cdv-live-author">${steps.length} étape${steps.length > 1 ? "s" : ""}</div>
      </div>
    </div>
    ${_cdvLiveActionsHtml(l)}
  </div>`;
}

// ── ⋯ Options d'un live (2026-07-22) ────────────────────────────────────────
// Un live n'était ni modifiable ni supprimable : une faute de frappe dans la
// destination ou un live lancé par erreur restaient là pour toujours. Le ⋯ est
// DISCRET (coin haut droit, gris) et n'ouvre pas le viewer (stopPropagation).
function _cdvLiveMenuBtnHtml(l) {
  return `<button class="cdv-live-menu-btn" onclick="event.stopPropagation();openCdvLiveMenu('${l.id}')"
    title="Options" aria-label="Options du voyage">⋯</button>`;
}

// ⚠️ `openModal` n'empile pas : ouvrir ce menu depuis le viewer plein écran
// REMPLACE le viewer. On mémorise donc d'où l'on vient pour y revenir en
// annulant (et après une modification) — sinon un simple « Annuler » renvoyait
// l'utilisateur sur la liste, en refermant le voyage qu'il était en train de lire.
function openCdvLiveMenu(liveId, fromViewer) {
  const live = getCdvLives().find(l => l.id === liveId);
  if (!live) return;
  window._cdvMenuFromViewer = !!fromViewer;
  // ⚠️ La RLS de `cdv_lives` limite UPDATE/DELETE à l'AUTEUR : proposer
  // « Modifier »/« Supprimer » à un co-voyageur donnerait un échec silencieux
  // côté serveur (0 ligne touchée) alors que l'app dirait « mis à jour ».
  // Un co-voyageur garde l'ajout d'étape (sa propre ligne, policy owner).
  const mine = isMyLive(live);
  const collab = !mine && typeof canEditLive === "function" && canEditLive(live);
  const ended = live.status === "ended";
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">${escapeHtml(live.destination || "Voyage")}</div>
    <div class="modal-subtitle">${ended ? "Voyage terminé" : "Voyage en direct"} · ${(live.steps || []).length} étape${(live.steps || []).length > 1 ? "s" : ""}</div>
    ${mine ? `
      <button class="btn ghost block" style="margin-bottom:8px;" onclick="editCdvLive('${liveId}')">✏️ Modifier le voyage</button>
      ${!ended ? `<button class="btn ghost block" style="margin-bottom:8px;" onclick="addCdvLiveStep('${liveId}')">➕ Ajouter une étape</button>
      <button class="btn ghost block" style="margin-bottom:8px;" onclick="confirmEndCdvLive('${liveId}')">⏹ Terminer le direct</button>` : ""}
      <button class="btn ghost block" style="margin-bottom:8px;color:#ef4444;" onclick="confirmDeleteCdvLive('${liveId}')">🗑 Supprimer le voyage</button>
    ` : `
      ${collab && !ended ? `<button class="btn ghost block" style="margin-bottom:8px;" onclick="addCdvLiveStep('${liveId}')">➕ Ajouter une étape</button>` : ""}
      <button class="btn ghost block" style="margin-bottom:8px;" onclick="shareCdvLive('${liveId}')">🔗 Partager</button>
      ${collab ? "" : `<button class="btn ghost block" style="margin-bottom:8px;color:#ef4444;" onclick="reportCdvLive('${liveId}')">⚠️ Signaler ce voyage</button>`}
    `}
    <button class="btn ghost block" onclick="_closeCdvLiveMenu('${liveId}')">Annuler</button>
  `);
}

// Referme le menu : retour au viewer si c'est de là qu'on venait.
function _closeCdvLiveMenu(liveId) {
  const back = window._cdvMenuFromViewer;
  window._cdvMenuFromViewer = false;
  closeModal();
  if (back && liveId && getCdvLives().some(l => l.id === liveId)) openCdvLiveViewer(liveId);
}

// Modifier destination / description / visibilité. Les étapes ne bougent pas.
function editCdvLive(liveId) {
  const live = getCdvLives().find(l => l.id === liveId);
  if (!live || !isMyLive(live)) { toast("Voyage introuvable"); return; }
  _cdvVisibility = live.visibility || "public";
  _cdvDuration = live.duration || "semaine";
  const vis = [["public", "🌍 Public"], ["followers", "👥 Abonnés"], ["private", "🔒 Privé"]];
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">✏️ Modifier le voyage</div>
    <label class="field"><span>🌍 Destination</span>
      <input type="text" class="input" id="cdvEditDest" maxlength="60" value="${escapeHtml(live.destination || "")}"/>
    </label>
    <label class="field"><span>📝 Description</span>
      <textarea class="textarea" id="cdvEditDesc" maxlength="300" style="min-height:60px;">${escapeHtml(live.description || "")}</textarea>
    </label>
    <label class="field"><span>🔒 Visibilité</span>
      <div style="display:flex;gap:8px;">
        ${vis.map(v => `<button class="pill cdv-vis-btn${_cdvVisibility === v[0] ? " active" : ""}" onclick="selectCdvVisibility(this,'${v[0]}')">${v[1]}</button>`).join("")}
      </div>
    </label>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button class="btn ghost" onclick="_closeCdvLiveMenu('${liveId}')">Annuler</button>
      <button class="btn primary" style="flex:1;" onclick="saveCdvLiveEdits('${liveId}')">Enregistrer</button>
    </div>
  `);
}

function saveCdvLiveEdits(liveId) {
  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live) return;
  const dest = (document.getElementById("cdvEditDest")?.value || "").trim();
  if (!dest) { toast("Indique une destination"); return; }
  live.destination = dest;
  live.description = (document.getElementById("cdvEditDesc")?.value || "").trim();
  live.visibility = _cdvVisibility;
  live.updatedAt = Date.now();
  saveCdvLives(lives);
  if (typeof supaUpdateCdvLive === "function") {
    supaUpdateCdvLive(liveId, {
      destination: live.destination, description: live.description, visibility: live.visibility,
    });
  }
  const back = window._cdvMenuFromViewer;
  window._cdvMenuFromViewer = false;
  closeModal();
  toast("✅ Voyage mis à jour");
  renderCdvLives();
  if (typeof renderCdvScreen === "function") { try { renderCdvScreen(); } catch (e) {} }
  // Retour au voyage ouvert, avec le nouveau titre visible tout de suite.
  if (back) openCdvLiveViewer(liveId);
}

// Supprimer est IRRÉVERSIBLE (étapes, commentaires, réactions partent avec).
function confirmDeleteCdvLive(liveId) {
  const live = getCdvLives().find(l => l.id === liveId);
  if (!live || !isMyLive(live)) return;
  const n = (live.steps || []).length;
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">Supprimer ce voyage ?</div>
    <div style="font-size:13px;color:var(--text-dim);line-height:1.55;margin-bottom:14px;">
      « ${escapeHtml(live.destination || "Voyage")} », ses ${n} étape${n > 1 ? "s" : ""} et les commentaires
      seront <b>définitivement supprimés</b>, pour toi comme pour ceux qui te suivent.
    </div>
    <button class="btn block" style="margin-bottom:8px;background:#ef4444;color:#fff;" onclick="deleteCdvLive('${liveId}')">🗑 Supprimer définitivement</button>
    <button class="btn ghost block" onclick="_closeCdvLiveMenu('${liveId}')">Annuler</button>
  `);
}

function deleteCdvLive(liveId) {
  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live || !isMyLive(live)) return;
  saveCdvLives(lives.filter(l => l.id !== liveId));
  if (typeof supaDeleteCdvLive === "function") supaDeleteCdvLive(liveId);
  window._cdvMenuFromViewer = false; // le voyage n'existe plus : ne pas y revenir
  closeModal();
  toast("🗑 Voyage supprimé");
  renderCdvLives();
  if (typeof renderCdvScreen === "function") { try { renderCdvScreen(); } catch (e) {} }
}

// Barre d'engagement commune aux cartes live (charte unifiée du fil).
function _cdvLiveActionsHtml(l) {
  const title = escapeJsArg("💬 " + (l.destination || "Live").slice(0, 40));
  return `<div class="post-actions" onclick="event.stopPropagation()">
    ${_liveLikeSpanHtml(l)}
    <span class="post-action" onclick="event.stopPropagation();openCommentSheet('${l.id}','${title}')">💬 ${commentThreadCount(l.comments)}</span>
    <span class="post-action" onclick="return reactCdvLivePicker('${l.id}', event);" title="Réagir">😊</span>
    <span class="post-action" onclick="event.stopPropagation();shareCdvLive('${l.id}')" title="Partager" aria-label="Partager">${shareIconSvg(18)}</span>
    <span class="post-action" data-livesave="${l.id}" onclick="event.stopPropagation();toggleLiveSave('${l.id}', this)" title="${isLiveSaved(l.id) ? "Sauvegardé" : "Sauvegarder"}">${isLiveSaved(l.id) ? "⭐" : "☆"}</span>
    <span class="post-react-chip-holder" data-livechip="${l.id}" style="margin-left:auto;">${_liveReactChipHtml(l.id)}</span>
  </div>`;
}


/* ============================================================================
   CDV — STATISTIQUES DE VOYAGE & PASSEPORT (2026-07-21)
   ----------------------------------------------------------------------------
   C'est LA signature des leaders du carnet de voyage (Polarsteps, FindPenguins) :
   le voyage ne se resume pas a une liste d'etapes, il produit des CHIFFRES dont on
   est fier et qu'on partage (km parcourus, jours, villes, pays). PASSIO avait deja
   les etapes geolocalisees (lat/lng depuis le CDV v2) mais n'en tirait rien.

   Tout est calcule A PARTIR DES DONNEES EXISTANTES — aucune migration, aucune
   colonne : les km viennent de la polyline des etapes deja tracee sur la carte.
   ========================================================================== */

// Distance orthodromique entre deux points [lat, lng], en km (rayon moyen 6371).
function _kmBetween(a, b) {
  if (!a || !b) return 0;
  var R = 6371, rad = Math.PI / 180;
  var dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  var la1 = a[0] * rad, la2 = b[0] * rad;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Statistiques d'UN voyage (live OU carnet — les deux formes d'etape sont gerees
// par cdvStepLatLng, qui lit s.city comme s.place).
// opts : { start, end } (timestamps) pour un carnet dont les dates sont portees
// par le post et non par les etapes.
function cdvTripStats(steps, opts) {
  steps = Array.isArray(steps) ? steps : [];
  opts = opts || {};
  var pts = [], cities = {}, countries = {}, photos = 0, budgets = [];
  var tMin = null, tMax = null;

  steps.forEach(function (s) {
    if (!s) return;
    var ll = (typeof cdvStepLatLng === "function") ? cdvStepLatLng(s) : null;
    if (ll) pts.push(ll);
    var name = (s.city || s.place || "").trim();
    if (name) cities[name.toLowerCase()] = name;
    if (s.country) countries[String(s.country).toLowerCase()] = s.country;
    if (Array.isArray(s.photos)) photos += s.photos.length;
    else if (s.photo) photos += 1;
    if (s.budget && s.budget !== "free") budgets.push(s.budget);
    var t = s.createdAt || s.at || 0;
    if (t) { if (tMin === null || t < tMin) tMin = t; if (tMax === null || t > tMax) tMax = t; }
  });

  var km = 0;
  for (var i = 1; i < pts.length; i++) km += _kmBetween(pts[i - 1], pts[i]);

  // Duree : les dates explicites du carnet priment sur les horodatages d'etape.
  var start = opts.start || tMin, end = opts.end || tMax;
  var days = 0;
  if (start && end && end >= start) days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  else if (start) days = 1;

  // Budget « dominant » : les etapes portent un PALIER (€/€€/€€€), pas un montant —
  // on ne peut donc pas sommer, on remonte le palier le plus frequent.
  var tally = {}, budget = "";
  budgets.forEach(function (b) { tally[b] = (tally[b] || 0) + 1; });
  Object.keys(tally).forEach(function (b) { if (!budget || tally[b] > tally[budget]) budget = b; });

  return {
    steps: steps.length,
    km: Math.round(km),
    days: days,
    cities: Object.keys(cities).map(function (k) { return cities[k]; }),
    countries: Object.keys(countries).map(function (k) { return countries[k]; }),
    photos: photos,
    budget: budget,
    geolocated: pts.length,
  };
}

// Drapeau d'un pays (les noms viennent de Photon, en francais). Purement decoratif :
// un pays inconnu du dictionnaire retombe sur la mappemonde, jamais sur du vide.
var CDV_COUNTRY_FLAGS = {
  "france": "\u{1F1EB}\u{1F1F7}", "espagne": "\u{1F1EA}\u{1F1F8}", "spain": "\u{1F1EA}\u{1F1F8}",
  "italie": "\u{1F1EE}\u{1F1F9}", "italy": "\u{1F1EE}\u{1F1F9}", "portugal": "\u{1F1F5}\u{1F1F9}",
  "allemagne": "\u{1F1E9}\u{1F1EA}", "germany": "\u{1F1E9}\u{1F1EA}", "belgique": "\u{1F1E7}\u{1F1EA}",
  "belgium": "\u{1F1E7}\u{1F1EA}", "suisse": "\u{1F1E8}\u{1F1ED}", "switzerland": "\u{1F1E8}\u{1F1ED}",
  "royaume-uni": "\u{1F1EC}\u{1F1E7}", "united kingdom": "\u{1F1EC}\u{1F1E7}", "irlande": "\u{1F1EE}\u{1F1EA}",
  "pays-bas": "\u{1F1F3}\u{1F1F1}", "netherlands": "\u{1F1F3}\u{1F1F1}", "grece": "\u{1F1EC}\u{1F1F7}",
  "grèce": "\u{1F1EC}\u{1F1F7}", "greece": "\u{1F1EC}\u{1F1F7}", "maroc": "\u{1F1F2}\u{1F1E6}",
  "morocco": "\u{1F1F2}\u{1F1E6}", "tunisie": "\u{1F1F9}\u{1F1F3}", "algérie": "\u{1F1E9}\u{1F1FF}",
  "sénégal": "\u{1F1F8}\u{1F1F3}", "états-unis": "\u{1F1FA}\u{1F1F8}",
  "united states": "\u{1F1FA}\u{1F1F8}", "canada": "\u{1F1E8}\u{1F1E6}", "mexique": "\u{1F1F2}\u{1F1FD}",
  "brésil": "\u{1F1E7}\u{1F1F7}", "brazil": "\u{1F1E7}\u{1F1F7}", "argentine": "\u{1F1E6}\u{1F1F7}",
  "pérou": "\u{1F1F5}\u{1F1EA}", "colombie": "\u{1F1E8}\u{1F1F4}", "japon": "\u{1F1EF}\u{1F1F5}",
  "japan": "\u{1F1EF}\u{1F1F5}", "chine": "\u{1F1E8}\u{1F1F3}", "china": "\u{1F1E8}\u{1F1F3}",
  "thaïlande": "\u{1F1F9}\u{1F1ED}", "thailand": "\u{1F1F9}\u{1F1ED}", "vietnam": "\u{1F1FB}\u{1F1F3}",
  "indonésie": "\u{1F1EE}\u{1F1E9}", "inde": "\u{1F1EE}\u{1F1F3}", "india": "\u{1F1EE}\u{1F1F3}",
  "corée du sud": "\u{1F1F0}\u{1F1F7}", "australie": "\u{1F1E6}\u{1F1FA}", "australia": "\u{1F1E6}\u{1F1FA}",
  "nouvelle-zélande": "\u{1F1F3}\u{1F1FF}", "islande": "\u{1F1EE}\u{1F1F8}", "iceland": "\u{1F1EE}\u{1F1F8}",
  "norvège": "\u{1F1F3}\u{1F1F4}", "suède": "\u{1F1F8}\u{1F1EA}", "finlande": "\u{1F1EB}\u{1F1EE}",
  "danemark": "\u{1F1E9}\u{1F1F0}", "pologne": "\u{1F1F5}\u{1F1F1}", "croatie": "\u{1F1ED}\u{1F1F7}",
  "autriche": "\u{1F1E6}\u{1F1F9}", "turquie": "\u{1F1F9}\u{1F1F7}", "égypte": "\u{1F1EA}\u{1F1EC}",
  "afrique du sud": "\u{1F1FF}\u{1F1E6}", "kenya": "\u{1F1F0}\u{1F1EA}", "madagascar": "\u{1F1F2}\u{1F1EC}",
};
function cdvCountryFlag(name) {
  return CDV_COUNTRY_FLAGS[String(name || "").toLowerCase().trim()] || "\u{1F30D}";
}

// Bandeau de statistiques. `compact` = version 3 tuiles pour une carte ;
// sinon les 6 tuiles du viewer.
function _cdvTripStatsHtml(st, compact) {
  if (!st || !st.steps) return "";
  var tiles = [];
  if (st.km > 0) tiles.push(["\u{1F6E3}", st.km >= 1000 ? (st.km / 1000).toFixed(1).replace(".", ",") + "k" : st.km, "km"]);
  if (st.days > 0) tiles.push(["\u{1F4C5}", st.days, st.days > 1 ? "jours" : "jour"]);
  tiles.push(["\u{1F4CD}", st.steps, st.steps > 1 ? "étapes" : "étape"]);
  if (!compact) {
    if (st.cities.length) tiles.push(["\u{1F3D9}", st.cities.length, st.cities.length > 1 ? "villes" : "ville"]);
    if (st.countries.length) tiles.push(["\u{1F30D}", st.countries.length, "pays"]);
    if (st.photos) tiles.push(["\u{1F4F7}", st.photos, st.photos > 1 ? "photos" : "photo"]);
  }
  if (!tiles.length) return "";

  var cells = _cdvStatTilesHtml(tiles, compact, true);

  var flags = (!compact && st.countries.length)
    ? '<div class="cdv-stat-flags">' + st.countries.map(function (c) {
        return '<span title="' + escapeHtml(c) + '">' + cdvCountryFlag(c) + " " + escapeHtml(c) + '</span>';
      }).join("") + '</div>'
    : "";

  return '<div class="cdv-stats' + (compact ? " compact" : "") + '">' + cells + '</div>' + flags;
}

// Rangée de tuiles chiffrées, réutilisable hors voyage (Mes lieux, passeport).
// `tiles` = [[emoji, valeur, libellé], …]. `cellsOnly` sert à _cdvTripStatsHtml,
// qui enveloppe lui-même dans .cdv-stats.
function _cdvStatTilesHtml(tiles, compact, cellsOnly) {
  var cells = (tiles || []).map(function (t) {
    return '<div class="cdv-stat">'
      + '<div class="cdv-stat-ico">' + t[0] + '</div>'
      + '<div class="cdv-stat-val">' + escapeHtml(String(t[1])) + '</div>'
      + '<div class="cdv-stat-lbl">' + escapeHtml(t[2]) + '</div>'
      + '</div>';
  }).join("");
  if (cellsOnly) return cells;
  if (!cells) return "";
  return '<div class="cdv-stats' + (compact ? " compact" : "") + '">' + cells + '</div>';
}

// Complete en TACHE DE FOND le pays de chaque etape geolocalisee (geocodage
// inverse, mutualise par le cache 7 jours de passioReverseGeocode). Sans ca, le
// compteur de pays resterait vide sur tout l'historique.
// /!\ Un seul passage par live (garde _countriesDone) : le viewer est re-rendu
// toutes les 5 s par le refresh temps reel.
// Remplit `country` sur les etapes qui n'en ont pas. Mutation EN PLACE, renvoie
// true si quelque chose a change. Commun aux lives et aux carnets.
async function _cdvFillStepCountries(steps) {
  if (typeof passioReverseGeocode !== "function") return false;
  var todo = (steps || []).filter(function (s) { return s && !s.country; });
  var changed = false;
  for (var i = 0; i < todo.length; i++) {
    var ll = cdvStepLatLng(todo[i]);
    if (!ll) continue;
    try {
      var r = await passioReverseGeocode(ll[0], ll[1]);
      if (r && r.country) { todo[i].country = r.country; changed = true; }
    } catch (e) {}
  }
  return changed;
}

// Variante CARNET : le post n'est pas persiste par saveCdvLives, et le geocodage
// inverse est cache 7 jours — remplir la copie en memoire suffit, le bandeau se
// recalcule a chaque ouverture pour un cout nul.
async function _cdvBackfillCarnetCountries(post) {
  if (!post || post._countriesDone) return;
  post._countriesDone = true;
  var changed = await _cdvFillStepCountries(post.steps || []);
  if (!changed) return;
  if (typeof openVlogViewer === "function" && document.querySelector('.modal [class*="vlog-viewer-body"]')) {
    var st = cdvTripStats(post.steps || [], { start: post.dateStart, end: post.dateEnd });
    var holder = document.querySelector(".modal .cdv-stat-flags");
    if (holder) {
      holder.innerHTML = st.countries.map(function (c) {
        return '<span>' + cdvCountryFlag(c) + " " + escapeHtml(c) + '</span>';
      }).join("");
    }
  }
}

async function _cdvBackfillCountries(live) {
  if (!live || live._countriesDone) return;
  live._countriesDone = true;
  var steps = (live.steps || []).filter(function (s) { return s && !s.country; });
  if (!steps.length) return;
  var changed = await _cdvFillStepCountries(steps);
  if (!changed) return;
  var lives = getCdvLives();
  var target = lives.find(function (l) { return l.id === live.id; });
  if (target) {
    (target.steps || []).forEach(function (s) {
      var src = steps.find(function (x) { return x.id === s.id; });
      if (src && src.country) s.country = src.country;
    });
    saveCdvLives(lives);
  }
  // Rafraichit le bandeau si le viewer de CE live est toujours ouvert.
  var band = document.getElementById("cdvTripStats");
  if (band && document.querySelector('.modal[data-live-id="' + live.id + '"]')) {
    band.innerHTML = _cdvTripStatsHtml(cdvTripStats(live.steps));
  }
}

/* ---------------------------------------------------------------------------
   PASSEPORT — l'agregat de TOUS mes voyages (lives + carnets).
   C'est le « profil de voyageur » de FindPenguins : le chiffre cumule est ce qui
   donne envie de repartir, et c'est l'ecran le plus partage de ces apps.
   ------------------------------------------------------------------------- */
function cdvPassportStats() {
  var me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  var trips = [];

  (getCdvLives() || []).forEach(function (l) {
    if (l && isMyLive(l)) trips.push({ kind: "live", id: l.id, title: l.destination || "Voyage", steps: l.steps || [], at: l.createdAt });
  });
  (typeof allCarnets === "function" ? allCarnets() : []).forEach(function (p) {
    if (!p) return;
    var a = p.authorId || p.author;
    if (a !== me && a !== "me") return;
    trips.push({ kind: "carnet", id: p.id, title: p.destination || "Carnet", steps: p.steps || [], at: p.dateStart || p.at, start: p.dateStart, end: p.dateEnd });
  });

  var km = 0, days = 0, steps = 0, photos = 0;
  var cities = {}, countries = {};
  trips.forEach(function (t) {
    var st = cdvTripStats(t.steps, { start: t.start, end: t.end });
    t.stats = st;
    km += st.km; days += st.days; steps += st.steps; photos += st.photos;
    st.cities.forEach(function (c) { cities[c.toLowerCase()] = c; });
    st.countries.forEach(function (c) { countries[c.toLowerCase()] = c; });
  });

  trips.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });

  // Agregats par ANNEE : « 2026 : 3 voyages, 1 240 km » est ce qui fait relire
  // son passeport (le meme ressort que le recap annuel de Spotify).
  var byYear = {};
  trips.forEach(function (t) {
    var y = t.at ? new Date(t.at).getFullYear() : 0;
    if (!y) return;
    if (!byYear[y]) byYear[y] = { year: y, trips: 0, km: 0, days: 0, countries: {} };
    byYear[y].trips++;
    byYear[y].km += t.stats.km;
    byYear[y].days += t.stats.days;
    t.stats.countries.forEach(function (c) { byYear[y].countries[c.toLowerCase()] = 1; });
  });
  var years = Object.keys(byYear).map(function (y) {
    var o = byYear[y];
    return { year: o.year, trips: o.trips, km: Math.round(o.km), days: o.days, countries: Object.keys(o.countries).length };
  }).sort(function (a, b) { return b.year - a.year; });

  // Le voyage « record » : celui qu'on montre en premier quand on partage.
  var longest = trips.slice().sort(function (a, b) { return b.stats.km - a.stats.km; })[0] || null;

  return {
    trips: trips,
    km: Math.round(km), days: days, steps: steps, photos: photos,
    cities: Object.keys(cities).map(function (k) { return cities[k]; }),
    countries: Object.keys(countries).map(function (k) { return countries[k]; }),
    years: years,
    longest: (longest && longest.stats.km) ? longest : null,
  };
}

/* ---------------------------------------------------------------------------
   NIVEAUX DE VOYAGEUR — la progression, pas juste un compteur.
   Un chiffre brut (« 640 km ») ne dit pas si c'est beaucoup : un PALIER nommé et
   la distance qui reste avant le suivant donnent un objectif. Entierement derive
   des km cumules : rien n'est stocke, rien ne peut se desynchroniser.
   ------------------------------------------------------------------------- */
var CDV_TRAVEL_LEVELS = [
  { km: 0,     emoji: "\u{1F331}", name: "Premier départ" },
  { km: 100,   emoji: "\u{1F9ED}", name: "Curieux" },
  { km: 500,   emoji: "\u{1F392}", name: "Baroudeur" },
  { km: 1000,  emoji: "\u{1F6E3}", name: "Grand rouleur" },
  { km: 3000,  emoji: "\u{2708}",  name: "Bourlingueur" },
  { km: 10000, emoji: "\u{1F30D}", name: "Globe-trotteur" },
  { km: 40000, emoji: "\u{1F30F}", name: "Tour du monde" },
];

function cdvTravelLevel(km) {
  km = km || 0;
  var cur = CDV_TRAVEL_LEVELS[0], next = null;
  for (var i = 0; i < CDV_TRAVEL_LEVELS.length; i++) {
    if (km >= CDV_TRAVEL_LEVELS[i].km) cur = CDV_TRAVEL_LEVELS[i];
    else { next = CDV_TRAVEL_LEVELS[i]; break; }
  }
  var pct = next ? Math.round(((km - cur.km) / (next.km - cur.km)) * 100) : 100;
  return { level: cur, next: next, pct: Math.max(2, Math.min(100, pct)), remaining: next ? next.km - km : 0 };
}

function _cdvKmLabel(km) {
  return km >= 1000 ? (km / 1000).toFixed(1).replace(".", ",") + "k" : String(km);
}

function openCdvPassport() {
  var p = cdvPassportStats();

  // Passeport vierge : on EXPLIQUE et on propose de partir, plutot qu'un toast
  // qui laissait l'utilisateur devant une porte fermee sans savoir quoi faire.
  if (!p.trips.length) {
    openModal('<div class="modal-handle"></div>'
      + '<div class="modal-title">\u{1F6C2} Mon passeport</div>'
      + '<div class="modal-subtitle">Le récapitulatif de tout ce que tu as parcouru sur PASSIO.</div>'
      + '<div class="empty" style="padding:18px 12px;"><div class="empty-icon">\u{1F30D}</div>'
      + '<div class="empty-title">Ton passeport est encore vierge</div>'
      + '<div class="empty-text">Dès ton premier voyage — un live en direct ou un carnet raconté après coup — PASSIO calcule tout seul tes kilomètres, tes jours sur la route, tes villes et tes pays à partir de tes étapes. Tu montes de niveau à mesure que tu roules.</div></div>'
      + '<div style="display:flex;gap:8px;margin-top:8px;">'
      + '<button class="btn primary" style="flex:1;" onclick="closeModal();' + (typeof openNewTripSheet === "function" ? "openNewTripSheet()" : "goTo(\'cdv\')") + '">✈️ Commencer un voyage</button>'
      + '<button class="btn ghost" onclick="closeModal()">Fermer</button></div>');
    return;
  }

  var lvl = cdvTravelLevel(p.km);
  var tripsHtml = p.trips.map(function (t) {
    var s = t.stats;
    var bits = [];
    if (s.km) bits.push(s.km + " km");
    if (s.days) bits.push(s.days + (s.days > 1 ? " jours" : " jour"));
    if (s.steps) bits.push(s.steps + (s.steps > 1 ? " étapes" : " étape"));
    var open = t.kind === "live"
      ? 'closeModal();openCdvLiveViewer(\'' + escapeJsArg(t.id) + '\')'
      : 'closeModal();openVlogViewer(\'' + escapeJsArg(t.id) + '\')';
    return '<div class="cdv-passport-trip" onclick="' + open + '">'
      + '<div class="cdv-passport-trip-ico">' + (t.kind === "live" ? "\u{1F4E1}" : "\u{1F4D4}") + '</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div class="cdv-passport-trip-title">' + escapeHtml(t.title) + '</div>'
      + '<div class="cdv-passport-trip-sub">' + escapeHtml(bits.join(" · ") || "Aucune étape géolocalisée") + '</div>'
      + '</div><div style="color:var(--muted);">›</div></div>';
  }).join("");

  // ⚠️ Les drapeaux sont DÉJÀ émis par _cdvTripStatsHtml (mode non compact) : on
  // ne rajoute ici QUE le message d'attente quand aucun pays n'est encore connu,
  // sinon la liste des pays s'affiche en double.
  var flagsHtml = p.countries.length
    ? ""
    : '<div style="font-size:11px;color:var(--muted);text-align:center;padding:6px 0;">Les pays apparaissent dès que tes étapes sont géolocalisées \u{1F4CD}</div>';

  // Carte de NIVEAU : le chiffre seul ne dit pas si c'est beaucoup — le palier
  // nomme et la barre « il te reste X km » donnent un cap.
  var heroHtml = '<div class="cdv-pp-hero">'
    + '<div class="cdv-pp-hero-top">'
    +   '<div class="cdv-pp-hero-ico">' + lvl.level.emoji + '</div>'
    +   '<div style="flex:1;min-width:0;">'
    +     '<div class="cdv-pp-hero-lvl">' + escapeHtml(lvl.level.name) + '</div>'
    +     '<div class="cdv-pp-hero-km">' + _cdvKmLabel(p.km) + ' km parcourus · ' + p.trips.length + ' voyage' + (p.trips.length > 1 ? "s" : "") + '</div>'
    +   '</div>'
    + '</div>'
    + '<div class="cdv-pp-bar"><i style="width:' + lvl.pct + '%;"></i></div>'
    + '<div class="cdv-pp-next">' + (lvl.next
        ? "Encore " + _cdvKmLabel(lvl.remaining) + " km avant « " + escapeHtml(lvl.next.name) + " » " + lvl.next.emoji
        : "Niveau maximum atteint — respect \u{1F3C6}") + '</div>'
    + '</div>';

  // Villes : la preuve concrete derriere le compteur (« 12 villes » ne se
  // visualise pas, « Lisbonne · Porto · Faro » oui).
  var citiesHtml = p.cities.length
    ? '<div class="cdv-pp-sec-title">\u{1F3D9} Mes villes</div>'
      + '<div class="cdv-stat-flags">'
      + p.cities.slice(0, 24).map(function (c) { return '<span>' + escapeHtml(c) + '</span>'; }).join("")
      + (p.cities.length > 24 ? '<span>+' + (p.cities.length - 24) + '</span>' : "")
      + '</div>'
    : "";

  // Records + recap annuel : ce qu'on relit et ce qu'on partage.
  var recordsHtml = "";
  if (p.longest) {
    recordsHtml += '<div class="cdv-pp-rec" onclick="closeModal();'
      + (p.longest.kind === "live" ? "openCdvLiveViewer('" : "openVlogViewer('") + escapeJsArg(p.longest.id) + '\')">'
      + '<span class="cdv-pp-rec-k">\u{1F3C6} Plus long voyage</span>'
      + '<span class="cdv-pp-rec-v">' + escapeHtml(p.longest.title) + ' · ' + p.longest.stats.km + ' km</span></div>';
  }
  if (p.days) {
    recordsHtml += '<div class="cdv-pp-rec"><span class="cdv-pp-rec-k">\u{1F4C5} Jours sur la route</span>'
      + '<span class="cdv-pp-rec-v">' + p.days + ' jour' + (p.days > 1 ? "s" : "") + '</span></div>';
  }
  if (p.photos) {
    recordsHtml += '<div class="cdv-pp-rec"><span class="cdv-pp-rec-k">\u{1F4F7} Photos rapportées</span>'
      + '<span class="cdv-pp-rec-v">' + p.photos + '</span></div>';
  }
  var nPlaces = (typeof savedPlaces === "function") ? savedPlaces().length : 0;
  recordsHtml += '<div class="cdv-pp-rec" onclick="closeModal();openSavedPlaces()">'
    + '<span class="cdv-pp-rec-k">\u{1F4CD} Lieux gardés pour plus tard</span>'
    + '<span class="cdv-pp-rec-v">' + nPlaces + ' ›</span></div>';
  if (recordsHtml) recordsHtml = '<div class="cdv-pp-sec-title">\u{1F3AF} Mes records</div>' + recordsHtml;

  var yearsHtml = p.years.length > 1
    ? '<div class="cdv-pp-sec-title">\u{1F5D3} Année par année</div>'
      + p.years.map(function (y) {
          var bits = [y.trips + " voyage" + (y.trips > 1 ? "s" : "")];
          if (y.km) bits.push(y.km + " km");
          if (y.countries) bits.push(y.countries + " pays");
          return '<div class="cdv-pp-year"><b>' + y.year + '</b><span>' + escapeHtml(bits.join(" · ")) + '</span></div>';
        }).join("")
    : "";

  // Badges de voyage : la progression VERROUILLEE est ce qui donne envie de
  // repartir. Reutilise myBadges() (app-07) — aucun etat en plus.
  var badgesHtml = "";
  if (typeof myBadges === "function") {
    var travelIds = { traveler: 1, globetrot: 1, long_haul: 1, explorer: 1 };
    var bs = myBadges().filter(function (b) { return travelIds[b.id]; });
    if (bs.length) {
      badgesHtml = '<div class="cdv-pp-sec-title">\u{1F3C5} Mes badges de voyage</div>'
        + '<div class="cdv-pp-badges">'
        + bs.map(function (b) {
            return '<div class="cdv-pp-badge' + (b.earned ? " on" : "") + '">'
              + '<div class="cdv-pp-badge-ico">' + b.emoji + '</div>'
              + '<div class="cdv-pp-badge-lbl">' + escapeHtml(b.label) + '</div>'
              + '<div class="cdv-pp-badge-sub">' + (b.earned ? "Débloqué ✓" : b.have + " / " + b.goal) + '</div>'
              + (b.earned ? "" : '<div class="cdv-pp-badge-bar"><i style="width:' + b.pct + '%;"></i></div>')
              + '</div>';
          }).join("")
        + '</div>';
    }
  }

  openModal('<div class="modal-handle"></div>'
    + '<div class="modal-title">\u{1F6C2} Mon passeport</div>'
    + '<div class="modal-subtitle">Tes voyages PASSIO additionnés : distance, jours, villes et pays sont calculés tout seuls à partir de tes étapes.</div>'
    + heroHtml
    + _cdvTripStatsHtml({
        steps: p.steps, km: p.km, days: p.days, cities: p.cities,
        countries: p.countries, photos: p.photos, budget: "", geolocated: 1,
      })
    + flagsHtml
    + citiesHtml
    + recordsHtml
    + yearsHtml
    + badgesHtml
    + '<div class="cdv-pp-sec-title">✈️ Mes ' + p.trips.length + ' voyage' + (p.trips.length > 1 ? "s" : "") + '</div>'
    + tripsHtml
    + '<div style="display:flex;gap:8px;margin-top:12px;">'
    +   '<button class="btn primary" style="flex:1;" onclick="shareCdvPassport()">📤 Partager mon passeport</button>'
    +   '<button class="btn ghost" onclick="closeModal()">Fermer</button>'
    + '</div>');
}

// Partage : un passeport ne vaut que s'il se montre. Texte court, chiffré, prêt
// à coller — navigator.share sur mobile, presse-papiers ailleurs.
function shareCdvPassport() {
  var p = cdvPassportStats();
  var lvl = cdvTravelLevel(p.km);
  var bits = [];
  if (p.km) bits.push(p.km + " km");
  if (p.trips.length) bits.push(p.trips.length + " voyage" + (p.trips.length > 1 ? "s" : ""));
  if (p.cities.length) bits.push(p.cities.length + " ville" + (p.cities.length > 1 ? "s" : ""));
  if (p.countries.length) bits.push(p.countries.length + " pays");
  var txt = "\u{1F6C2} Mon passeport PASSIO — " + lvl.level.emoji + " " + lvl.level.name
    + "\n" + bits.join(" · ")
    + (p.countries.length ? "\n" + p.countries.map(cdvCountryFlag).join(" ") : "");
  if (navigator.share) {
    navigator.share({ title: "Mon passeport PASSIO", text: txt }).catch(function () {});
    return;
  }
  try {
    navigator.clipboard.writeText(txt);
    toast("Passeport copié — colle-le où tu veux 📋");
  } catch (e) { toast("Partage indisponible sur cet appareil"); }
}

/* ============================================================================
   CDV — RÉTROSPECTIVE ANIMÉE DE L'ITINÉRAIRE (2026-07-21)
   ----------------------------------------------------------------------------
   Le « flyover » de FindPenguins / le récap de Relive : le trajet se REJOUE, la
   ligne se trace d'étape en étape et la carte suit. C'est le format le plus
   partagé de ces apps, parce qu'il transforme une liste en récit.

   Aucune vidéo n'est encodée (ce serait lourd et lent sur mobile) : on anime la
   carte MapLibre déjà chargée, ce qui est instantané et fonctionne hors-ligne
   une fois les tuiles en cache.

   ⚠️ Le shim L (map-loader.js) n'expose pas de mise à jour de tracé : on
   reconstruit les couches à chaque étape via clearLayers() puis re-ajout. À une
   étape toutes les ~2 s c'est imperceptible, et ça évite d'élargir le shim.
   ========================================================================== */

var CDV_REPLAY_STEP_MS = 2200;

// Points rejouables d'un voyage (live OU carnet) : uniquement les étapes
// géolocalisées, dans l'ordre.
function _cdvReplayPoints(trip) {
  return (trip.steps || [])
    .map(function (s, i) {
      var ll = cdvStepLatLng(s);
      return ll ? {
        ll: ll, n: i + 1,
        place: s.city || s.place || "",
        text: s.content || s.text || "",
        photo: (Array.isArray(s.photos) && s.photos[0]) || s.photo || "",
        country: s.country || "",
      } : null;
    })
    .filter(Boolean);
}

// Point d'entrée unique : `kind` vaut "live" ou "carnet".
function openCdvRouteReplay(id, kind) {
  var trip = null;
  if (kind === "carnet") {
    trip = (typeof findPostAnywhere === "function") ? findPostAnywhere(id) : null;
  } else {
    trip = getCdvLives().find(function (l) { return l.id === id; });
  }
  if (!trip) { toast("Voyage introuvable"); return; }

  var pts = _cdvReplayPoints(trip);
  if (pts.length < 2) { toast("Il faut au moins 2 étapes géolocalisées pour rejouer l'itinéraire 📍"); return; }

  var st = cdvTripStats(trip.steps || [], { start: trip.dateStart, end: trip.dateEnd });
  var title = trip.destination || "Mon voyage";

  var ov = document.createElement("div");
  ov.id = "cdvReplayOverlay";
  ov.className = "cdv-replay";
  ov.innerHTML =
      '<div class="cdv-replay-bars">'
    +   pts.map(function (_, i) { return '<i data-rb="' + i + '"></i>'; }).join("")
    + '</div>'
    + '<button class="cdv-replay-close" aria-label="Fermer">×</button>'
    + '<div class="cdv-replay-map" id="cdvReplayMap"></div>'
    + '<div class="cdv-replay-card">'
    +   '<div class="cdv-replay-head">'
    +     '<div class="cdv-replay-title">' + escapeHtml(title) + '</div>'
    +     '<div class="cdv-replay-sub" id="cdvReplayStats">'
    +       (st.km ? st.km + " km · " : "") + pts.length + " étapes"
    +       (st.countries.length ? " · " + st.countries.length + " pays" : "")
    +     '</div>'
    +   '</div>'
    +   '<div class="cdv-replay-step" id="cdvReplayStep"></div>'
    + '</div>';
  document.body.appendChild(ov);

  var state_ = { i: 0, timer: null, map: null, done: false };

  var cleanup = function () {
    state_.done = true;
    if (state_.timer) clearTimeout(state_.timer);
    try { if (state_.map) state_.map.remove(); } catch (e) {}
    document.removeEventListener("keydown", onKey);
    if (ov.parentNode) ov.parentNode.removeChild(ov);
  };
  function onKey(e) {
    if (e.key === "Escape") cleanup();
    else if (e.key === "ArrowRight") show(state_.i + 1);
    else if (e.key === "ArrowLeft") show(state_.i - 1);
  }
  document.addEventListener("keydown", onKey);
  ov.querySelector(".cdv-replay-close").onclick = cleanup;

  // Tap gauche / droite pour naviguer à la main (même grammaire que les stories).
  ov.querySelector(".cdv-replay-map").onclick = function (e) {
    var r = this.getBoundingClientRect();
    show(state_.i + ((e.clientX - r.left) < r.width * 0.3 ? -1 : 1));
  };

  function paint(upto) {
    if (!state_.map) return;
    state_.map.clearLayers();
    var seen = pts.slice(0, upto + 1);
    seen.forEach(function (p, idx) {
      var isLast = idx === upto;
      var icon = L.divIcon({
        className: "passio-marker-wrap",
        html: '<div class="passio-marker' + (isLast ? " current" : "") + '">' + p.n + '</div>',
        iconSize: [36, 36], iconAnchor: [18, 18],
      });
      L.marker(p.ll, { icon: icon }).addTo(state_.map);
    });
    if (seen.length > 1) {
      L.polyline(seen.map(function (p) { return p.ll; }),
        { color: "#7c3aed", weight: 4, opacity: 0.85 }).addTo(state_.map);
    }
    state_.map.setView(pts[upto].ll, seen.length > 1 ? 8 : 10);
  }

  function show(i) {
    if (state_.done) return;
    if (i < 0) i = 0;
    if (i >= pts.length) { finish(); return; }
    state_.i = i;
    var p = pts[i];

    ov.querySelectorAll("[data-rb]").forEach(function (b, idx) {
      b.className = idx < i ? "done" : (idx === i ? "on" : "");
    });

    var card = document.getElementById("cdvReplayStep");
    if (card) {
      card.innerHTML =
          (p.photo ? '<img class="cdv-replay-photo" src="' + safeUrlAttr(p.photo) + '" alt="" loading="lazy"/>' : "")
        + '<div style="flex:1;min-width:0;">'
        +   '<div class="cdv-replay-place">' + p.n + ". " + escapeHtml(p.place || "Étape") + '</div>'
        +   (p.country ? '<div class="cdv-replay-country">' + cdvCountryFlag(p.country) + " " + escapeHtml(p.country) + '</div>' : "")
        +   (p.text ? '<div class="cdv-replay-text">' + escapeHtml(p.text.slice(0, 160)) + (p.text.length > 160 ? "…" : "") + '</div>' : "")
        + '</div>';
    }
    paint(i);

    if (state_.timer) clearTimeout(state_.timer);
    state_.timer = setTimeout(function () { show(i + 1); }, CDV_REPLAY_STEP_MS);
  }

  function finish() {
    if (state_.timer) clearTimeout(state_.timer);
    ov.querySelectorAll("[data-rb]").forEach(function (b) { b.className = "done"; });
    var card = document.getElementById("cdvReplayStep");
    if (card) {
      card.innerHTML = '<div style="flex:1;text-align:center;">'
        + '<div style="font-size:22px;margin-bottom:6px;">🏁</div>'
        + '<div class="cdv-replay-place">' + escapeHtml(title) + '</div>'
        + '<div class="cdv-replay-text">'
        + (st.km ? st.km + " km parcourus · " : "") + pts.length + " étapes"
        + (st.days ? " · " + st.days + (st.days > 1 ? " jours" : " jour") : "")
        + '</div></div>';
    }
    // Cadre le trajet ENTIER : la dernière image doit montrer le voyage complet.
    try {
      if (state_.map && typeof L !== "undefined") {
        state_.map.fitBounds(L.latLngBounds(pts.map(function (p) { return p.ll; })), { padding: [50, 50], maxZoom: 10 });
      }
    } catch (e) {}
  }

  // La carte d'abord (elle conditionne tout le rendu), puis la lecture.
  var startReplay = function () {
    var el = document.getElementById("cdvReplayMap");
    if (!el || state_.done) return;
    try {
      state_.map = L.map(el, { zoomControl: false, attributionControl: false })
        .setView(pts[0].ll, 10);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(state_.map);
      setTimeout(function () { try { state_.map.invalidateSize(); } catch (e) {} }, 150);
    } catch (e) {
      toast("Carte indisponible sur cet appareil");
      cleanup();
      return;
    }
    show(0);
  };

  if (typeof L === "undefined") {
    if (typeof ensureLeaflet === "function") ensureLeaflet().then(startReplay).catch(function () {
      toast("Carte indisponible");
      cleanup();
    });
    else { toast("Carte indisponible"); cleanup(); }
  } else startReplay();
}
