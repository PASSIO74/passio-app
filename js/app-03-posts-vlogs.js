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
      const shareUrl = "https://passio-app.netlify.app";
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
  if (_btn) {
    _btn.classList.toggle("liked", nowLiked);
    _btn.innerHTML = (nowLiked ? "❤️" : "🤍") + " " + (post.likes || 0);
  } else if (!skipRender) {
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

// "M'inspirer", duplique la STRUCTURE (pas le contenu) pour démarrer un nouveau carnet
function inspireFromCarnet(postId) {
  const post = (typeof findPostAnywhere === "function")
    ? findPostAnywhere(postId)
    : (state.userPosts.find(p => p.id === postId) || state.seed.posts.find(p => p.id === postId));
  if (!post || post.type !== "vlog") return;
  closeVlogViewer();
  // Remettre dans l'éditeur
  setTimeout(() => {
    goTo("studio");
    setTimeout(() => {
      // Bascule en vue Carnet (onglet retiré → fonction dédiée)
      activateStudioVlog();
      // Remplit avec la structure
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
    .map((s, i) => ({ place: s.place || "", dayNum: i + 1, ll: s.place ? cityToLatLng(s.place) : null }))
    .filter(s => s.ll);
  // Fallback : si aucune étape n'a pu être géolocalisée, on essaie la destination du carnet
  if (mapPlaces.length === 0 && post.destination) {
    const destLL = cityToLatLng(post.destination);
    if (destLL) mapPlaces.push({ place: post.destination, dayNum: 1, ll: destLL });
  }
  const hasMap = mapPlaces.length > 0;
  const isSaved = isCarnetSaved(postId);

  const html = `
    ${post.cover ? `<img loading="lazy" decoding="async" class="vlog-viewer-cover" src="${post.cover}" alt="${escapeHtml(post.destination || '')}" onerror="this.onerror=null;this.src='https://picsum.photos/seed/vlog-${postId}/1280/720';"/>` : `<div class="vlog-viewer-cover"></div>`}
    <div class="vlog-viewer-body">
      <div class="vlog-viewer-title">${escapeHtml(post.destination || "Carnet de voyage")}</div>
      <div class="vlog-viewer-dates">${escapeHtml(fmtRange(post.dateStart, post.dateEnd))}</div>
      <div class="vlog-viewer-author">par ${escapeHtml(author.name)}</div>

      <div class="vlog-stats-bar">
        <div class="vlog-stat"><div class="vlog-stat-num">${stats.durée}</div><div class="vlog-stat-label">Jours</div></div>
        <div class="vlog-stat"><div class="vlog-stat-num">${stats.nbDays}</div><div class="vlog-stat-label">Étapes</div></div>
        <div class="vlog-stat"><div class="vlog-stat-num">${stats.coutJour ? stats.coutJour + "€" : "—"}</div><div class="vlog-stat-label">Coût/jour</div></div>
        <div class="vlog-stat"><div class="vlog-stat-num">${stats.nbPhotos}</div><div class="vlog-stat-label">Photos</div></div>
      </div>

      ${hasMap ? `<div class="vlog-mini-map" id="vlogViewerMap"></div>` : `<div class="vlog-map-empty">📍 Lieux non géolocalisables sur la carte</div>`}

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
        <button class="vlog-action-btn" onclick="inspireFromCarnet('${postId}')">
          📔 M'en inspirer
        </button>
        <button class="vlog-action-btn primary" onclick="organizeGroupTrip('${postId}')">
          🤝 Organiser un voyage groupé
        </button>
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
  // Charge les commentaires Supabase (cross-compte) puis re-rend.
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID && typeof supaLoadComments === "function") {
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
        var box2 = document.getElementById("vlogCommentsList");
        var vv = document.getElementById("vlogViewer");
        if (box2 && vv && vv.getAttribute("data-current-post") === postId) {
          box2.innerHTML = post.comments.length ? _renderCommentsList(post.comments, postId) : empty;
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
function saveCdvLives(lives) { localStorage.setItem("passio_cdv_lives", JSON.stringify(lives)); }

// Un live publié localement a authorId "me" ; rechargé depuis Supabase il a MY_UID.
function isMyLive(l) {
  return !!l && (l.authorId === "me" || (typeof MY_UID !== "undefined" && MY_UID && l.authorId === MY_UID));
}

// Récupérer les lives actifs (global, pour tous)
function getActiveCdvLives() {
  return getCdvLives().filter(l => l.status === "live" && l.visibility !== "private"
    && !(typeof isBlocked === "function" && isBlocked(l.authorId)));
}

// Récupérer les lives des people qu'on suit
function getFollowingCdvLives() {
  const allLives = getCdvLives();
  const myFollowing = state.following || [];
  return allLives.filter(l => l.status === "live" && myFollowing.includes(l.authorId));
}

// Incrémenter le compteur de spectateurs
function addCdvLiveViewer(liveId) {
  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live) return;
  if (!live.currentViewers) live.currentViewers = 0;
  if (!live.viewers) live.viewers = [];

  const userId = state.user?.id || "me";
  if (!live.viewers.includes(userId)) {
    live.viewers.push(userId);
    live.currentViewers = live.viewers.length;
  }
  saveCdvLives(lives);
}

// Retirer un spectateur
function removeCdvLiveViewer(liveId) {
  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live) return;

  const userId = state.user?.id || "me";
  live.viewers = (live.viewers || []).filter(v => v !== userId);
  live.currentViewers = live.viewers.length;
  saveCdvLives(lives);
}

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
    followers: Math.floor(Math.random()*10+1),
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

function addCdvLiveStep(liveId) {
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">📍 Ajouter une étape live</div>

    <label class="field"><span>📍 Où es-tu ?</span>
      <input type="text" class="input" id="liveStepCity" placeholder="Ville, lieu, spot…" maxlength="60"/>
    </label>

    <label class="field"><span>🎭 Type d'étape</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="pill step-type-btn active" onclick="selectStepType(this,'📍')">📍 Lieu</button>
        <button class="pill step-type-btn" onclick="selectStepType(this,'🍽')">🍽 Restaurant</button>
        <button class="pill step-type-btn" onclick="selectStepType(this,'🏨')">🏨 Hébergement</button>
        <button class="pill step-type-btn" onclick="selectStepType(this,'🎯')">🎯 Activité</button>
        <button class="pill step-type-btn" onclick="selectStepType(this,'🚗')">🚗 Transport</button>
        <button class="pill step-type-btn" onclick="selectStepType(this,'💡')">💡 Conseil</button>
        <button class="pill step-type-btn" onclick="selectStepType(this,'⚠️')">⚠️ Alerte</button>
      </div>
    </label>

    <label class="field"><span>✍️ Raconte ce moment</span>
      <textarea class="textarea" id="liveStepContent" placeholder="Ce que tu vois, ressens, fais… tes conseils pour ceux qui viendront après toi" maxlength="500" style="min-height:80px;"></textarea>
    </label>

    <label class="field"><span>⭐ Note ce lieu (optionnel)</span>
      <div style="display:flex;gap:4px;" id="liveStepRating">
        <span class="rating-star" onclick="setStepRating(1)" style="font-size:24px;cursor:pointer;">☆</span>
        <span class="rating-star" onclick="setStepRating(2)" style="font-size:24px;cursor:pointer;">☆</span>
        <span class="rating-star" onclick="setStepRating(3)" style="font-size:24px;cursor:pointer;">☆</span>
        <span class="rating-star" onclick="setStepRating(4)" style="font-size:24px;cursor:pointer;">☆</span>
        <span class="rating-star" onclick="setStepRating(5)" style="font-size:24px;cursor:pointer;">☆</span>
      </div>
    </label>

    <label class="field"><span>💰 Budget (optionnel)</span>
      <div style="display:flex;gap:6px;">
        <button class="pill budget-btn" onclick="selectBudget(this,'free')">Gratuit</button>
        <button class="pill budget-btn" onclick="selectBudget(this,'€')">€</button>
        <button class="pill budget-btn" onclick="selectBudget(this,'€€')">€€</button>
        <button class="pill budget-btn" onclick="selectBudget(this,'€€€')">€€€</button>
      </div>
    </label>

    <label class="field"><span>📷 Photos (optionnel)</span>
      <div id="liveStepPhotoPreview" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;"></div>
      <div class="upload-zone" onclick="document.getElementById('liveStepPhotoInput').click()" style="padding:12px;">
        <div class="upload-zone-icon" style="font-size:18px;">📷</div>
        <div class="upload-zone-title" style="font-size:12px;">Ajouter des photos</div>
      </div>
      <input type="file" id="liveStepPhotoInput" accept="image/*" multiple style="display:none;" onchange="previewLiveStepPhotos(event)"/>
    </label>

    <div style="display:flex;gap:8px;margin-top:14px;">
      <button class="btn ghost" onclick="closeModal()">Plus tard</button>
      <button class="btn primary" style="flex:1;" onclick="saveCdvLiveStep('${liveId}')">📡 Publier l'étape</button>
    </div>
  `);
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
function previewLiveStepPhotos(event) {
  var files = event.target.files;
  if (!files || !files.length) return;
  Array.from(files).forEach(function(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      _liveStepPhotos.push(e.target.result);
      var prev = document.getElementById("liveStepPhotoPreview");
      if (prev) {
        prev.innerHTML = _liveStepPhotos.map(function(p, i) {
          return '<div style="position:relative;display:inline-block;"><img loading="lazy" decoding="async" src="' + p + '" style="width:70px;height:70px;border-radius:10px;object-fit:cover;"/><span onclick="_liveStepPhotos.splice(' + i + ',1);previewLiveStepPhotosRefresh();" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#ef4444;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;">×</span></div>';
        }).join("");
      }
    };
    reader.readAsDataURL(file);
  });
}
function previewLiveStepPhotosRefresh() {
  var prev = document.getElementById("liveStepPhotoPreview");
  if (prev) {
    prev.innerHTML = _liveStepPhotos.map(function(p, i) {
      return '<div style="position:relative;display:inline-block;"><img loading="lazy" decoding="async" src="' + p + '" style="width:70px;height:70px;border-radius:10px;object-fit:cover;"/><span onclick="_liveStepPhotos.splice(' + i + ',1);previewLiveStepPhotosRefresh();" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#ef4444;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;">×</span></div>';
    }).join("");
  }
}

function saveCdvLiveStep(liveId) {
  const city = document.getElementById("liveStepCity")?.value.trim();
  const content = document.getElementById("liveStepContent")?.value.trim();
  if (!city && !content) { toast("Ajoute au moins un lieu ou un texte"); return; }

  const step = {
    id: "ls_" + uid(),
    city: city || "Quelque part",
    emoji: _stepEmoji || "📍",
    content: content || "",
    photos: _liveStepPhotos.length ? [..._liveStepPhotos] : [],
    photo: _liveStepPhotos[0] || null,
    rating: _stepRating || 0,
    budget: _stepBudget || "",
    createdAt: Date.now(),
  };
  _liveStepPhotos = [];
  _stepEmoji = "📍";
  _stepRating = 0;
  _stepBudget = "";

  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live) return;
  live.steps.push(step);
  saveCdvLives(lives);
  if (typeof supaAddCdvLiveStep === "function") supaAddCdvLiveStep(liveId, step);
  closeModal();
  toast("📍 Étape publiée en direct !");
  renderCdvLives();
}

function endCdvLive(liveId) {
  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live) return;
  live.status = "ended";
  saveCdvLives(lives);
  if (typeof supaUpdateCdvLiveStatus === "function") supaUpdateCdvLiveStatus(liveId, "ended");
  toast("✅ CDV Live terminé — il apparaît maintenant comme un carnet complet");
  renderCdvLives();
  renderCdvScreen();
}

// Convertit un Live (de préférence terminé) en brouillon de carnet éditable
// dans le Studio : destination + étapes (lieu/texte/photo) pré-remplies.
function convertLiveToCarnet(liveId) {
  const live = getCdvLives().find(l => l.id === liveId);
  if (!live) return;
  closeModal();
  goTo("studio");
  setTimeout(() => {
    activateStudioVlog();
    setTimeout(() => {
      if ($("#vlogDestination")) $("#vlogDestination").value = live.destination || "";
      vlogState.cover = null;
      if ($("#vlogCoverPreview")) $("#vlogCoverPreview").innerHTML = "";
      vlogState.steps = (live.steps || []).map(s => ({
        id: uid(),
        place: s.city || "",
        text: s.content || "",
        tip: "",
        photo: s.photo || (s.photos && s.photos[0]) || null,
      }));
      if (typeof renderVlogSteps === "function") renderVlogSteps();
      toast("📔 Live converti en brouillon de carnet — complète-le puis publie");
    }, 250);
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
  var cnt = function(e){ return (live.reactions || []).filter(function(r){ return r === e; }).length || ""; };
  return '<button class="btn ghost" onclick="reactCdvLive(\'' + liveId + '\',\'❤️\')" style="flex:1;font-size:13px;padding:8px;">❤️ ' + cnt("❤️") + '</button>'
    + '<button class="btn ghost" onclick="reactCdvLive(\'' + liveId + '\',\'🔥\')" style="flex:1;font-size:13px;padding:8px;">🔥 ' + cnt("🔥") + '</button>'
    + '<button class="btn ghost" onclick="reactCdvLive(\'' + liveId + '\',\'😍\')" style="flex:1;font-size:13px;padding:8px;">😍 ' + cnt("😍") + '</button>'
    + '<button class="btn ghost" onclick="shareCdvLive(\'' + liveId + '\')" style="flex:1;font-size:13px;padding:8px;" title="Partager ce live">' + shareIconSvg(16) + '</button>';
}
// Patch LÉGER du viewer de live ouvert (compteur de suivis, réactions, et bloc
// commentaires si demandé) — SANS reconstruire les étapes/photos ni perdre le
// scroll / les réponses ouvertes. Utilisé par le refresh 5s quand seuls les
// commentaires/réactions/suivis ont changé (pas les étapes ni le statut).
function _patchCdvLiveViewer(live, patchComments) {
  if (!live) return;
  var vc = document.getElementById("cdvViewerCount");
  if (vc) vc.textContent = "👁 " + ((live.followers || live.viewers || []).length) + " suivent";
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

  // Ajouter le spectateur actuel au compteur
  if (isLive && !isMine) {
    addCdvLiveViewer(liveId);
  }

  // Nombre réel de personnes qui suivent (plus de valeur fictive aléatoire).
  var viewerCount = (live.followers || live.viewers || []).length;

  let stepsHTML = live.steps.map(function(s) {
    var photosHTML = "";
    if (s.photos && s.photos.length > 1) {
      photosHTML = '<div style="display:flex;gap:4px;overflow-x:auto;margin-top:6px;scrollbar-width:none;">' + s.photos.map(function(p) { return '<img loading="lazy" decoding="async" src="' + p + '" style="height:120px;border-radius:8px;object-fit:cover;flex-shrink:0;"/>'; }).join("") + '</div>';
    } else if (s.photo) {
      photosHTML = '<img loading="lazy" decoding="async" src="' + s.photo + '" style="width:100%;border-radius:10px;margin-top:6px;max-height:200px;object-fit:cover;"/>';
    }
    var ratingHTML = s.rating ? '<span style="font-size:12px;color:#f59e0b;margin-left:8px;">' + "★".repeat(s.rating) + "☆".repeat(5-s.rating) + '</span>' : "";
    var budgetHTML = s.budget ? '<span style="font-size:10px;background:var(--bg-deep);border-radius:6px;padding:2px 6px;margin-left:6px;">' + s.budget + '</span>' : "";
    return '<div style="display:flex;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);">\
      <div style="font-size:24px;flex-shrink:0;">' + s.emoji + '</div>\
      <div style="flex:1;min-width:0;">\
        <div style="display:flex;align-items:center;flex-wrap:wrap;">\
          <span style="font-weight:700;font-size:13px;color:var(--text);">' + escapeHtml(s.city) + '</span>' + ratingHTML + budgetHTML + '\
        </div>\
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">' + fmtTime(s.createdAt) + '</div>\
        ' + (s.content ? '<div style="font-size:12px;color:var(--text-dim);line-height:1.5;">' + escapeHtml(s.content) + '</div>' : "") + '\
        ' + photosHTML + '\
      </div>\
    </div>';
  }).join("");

  if (!live.steps.length) stepsHTML = '<div style="text-align:center;padding:30px;color:var(--muted);"><div style="font-size:32px;margin-bottom:8px;">🧳</div>L\'aventure commence bientôt…</div>';

  var commentsHTML = _cdvCommentsBoxHtml(live);

  const html = '\
    <span class="modal-close" onclick="closeModal()">×</span>\
    \
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">\
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
    <div id="cdvReactBar" style="display:flex;gap:6px;margin-bottom:14px;">' + _cdvReactBarHtml(liveId, live) + '</div>\
    \
    <div style="font-weight:800;font-size:13px;color:var(--text);margin-bottom:8px;">📍 Étapes</div>\
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
    ' + (isMine && isLive ? '\
      <div style="display:flex;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border);">\
        <button class="btn primary" style="flex:1;" onclick="closeModal();addCdvLiveStep(\'' + liveId + '\')">📍 Ajouter une étape</button>\
        <button class="btn ghost" style="border-color:rgba(239,68,68,0.4);color:#ef4444;" onclick="closeModal();endCdvLive(\'' + liveId + '\')">Terminer</button>\
      </div>' : (!isMine ? '\
      <div style="margin-top:14px;">\
        <button class="btn primary block" onclick="toggleFollowCdvLive(\'' + liveId + '\',this)" style="background:linear-gradient(135deg,#ef4444,#f59e0b);">📡 Suivre ce voyage</button>\
        <button onclick="reportCdvLive(\'' + liveId + '\')" style="display:block;margin:10px auto 0;background:none;border:none;color:var(--muted);font-size:11px;cursor:pointer;">⚠️ Signaler ce live</button>\
      </div>' : (isMine && !isLive ? '\
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);">\
        <button class="btn primary block" onclick="convertLiveToCarnet(\'' + liveId + '\')">📔 Convertir en carnet de voyage</button>\
      </div>' : ''))) + '\
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
  if (el) { el.classList.toggle("liked", cur.liked); el.innerHTML = (cur.liked ? "❤️" : "🤍") + " " + (cur.likes || 0); }
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
      var lk = document.querySelector('[data-livelike="' + id + '"]');
      if (lk) { lk.classList.toggle("liked", d.liked); lk.innerHTML = (d.liked ? "❤️" : "🤍") + " " + (d.likes || 0); }
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

function setStudioToVlog() {
  goTo("studio");
  setTimeout(() => {
    activateStudioVlog();
  }, 200);
}

// Filtre actif sur l'écran CDV - multi-select (saved / mine / live)
let cdvFilters = new Set(); // Vide par défaut = affiche TOUS les carnets

// Carte compacte d'un Live épinglé en tête de la liste CDV (vue par défaut).
// Pastille rouge animée déjà stylée (.cdv-live-badge). Clic → viewer du live.
function _pinnedLiveCardHtml(l) {
  const seedAuthor = userById(l.authorId);
  const authorName = isMyLive(l) ? (state.user.name || "Toi") : (seedAuthor && seedAuthor.name) || "Passionné";
  const viewerCount = (l.followers || l.viewers || []).length;
  const nSteps = (l.steps || []).length;
  return `<div class="cdv-live-card cdv-live-pinned" onclick="openCdvLiveViewer('${l.id}')" style="border-color:rgba(239,68,68,0.35);position:relative;">
    <div class="cdv-live-header">
      <span class="cdv-live-badge">🔴 EN DIRECT</span>
      <div style="flex:1;min-width:0;">
        <div class="cdv-live-dest">${escapeHtml(l.destination || "Live")}</div>
        <div class="cdv-live-author">par ${escapeHtml(authorName)} · ${nSteps} étape${nSteps > 1 ? "s" : ""}</div>
      </div>
      <span style="font-size:11px;color:var(--muted);white-space:nowrap;">👁 ${viewerCount}</span>
    </div>
  </div>`;
}

function renderCdvScreen() {
  const list = document.getElementById("cdvList");
  if (!list) return;

  // Vider cdvLiveList (ne pas afficher les lives en haut)
  const liveListEl = document.getElementById("cdvLiveList");
  if (liveListEl) liveListEl.innerHTML = "";

  // Sync filter pills (multi-select)
  document.querySelectorAll("#cdvFilterRow .pill").forEach(p => {
    const filterType = p.getAttribute("data-cdvfilter");
    p.classList.toggle("active", cdvFilters && cdvFilters.has(filterType));
  });

  // Filtre multi-select: affiche seulement si "live" est l'UNIQUE filtre actif
  const showLiveOnly = cdvFilters && cdvFilters.size === 1 && cdvFilters.has("live");
  if (showLiveOnly) {
    // Affiche les lives en cours ET les lives terminés
    const lives = getCdvLives().filter(l =>
      !(typeof isBlocked === "function" && isBlocked(l.authorId)) &&
      (isMyLive(l) || (state.following || []).includes(l.authorId) || l.visibility === "public"));
    if (!lives.length) {
      list.innerHTML = "";
      document.getElementById("cdvEmpty").style.display = "block";
      return;
    }
    document.getElementById("cdvEmpty").style.display = "none";

    // Dédupliquer par ID pour éviter les doublons
    const seenIds = new Set();
    const uniqueLives = lives.filter(l => {
      if (seenIds.has(l.id)) return false;
      seenIds.add(l.id);
      return true;
    });

    // Lives en cours d'abord
    const active = uniqueLives.filter(l => l.status === "live");
    const ended = uniqueLives.filter(l => l.status === "ended");

    let html = active.length ? `<div style="font-weight:700;font-size:13px;color:var(--text);margin:14px 0 8px;">✨ ${active.length} live${active.length>1?"s":""} en cours</div>` : "";
    html += active.map(l => {
      const isNew = l.createdAt && Date.now() - l.createdAt < 60000;
      const seedAuthor = userById(l.authorId);
      const authorName = isMyLive(l) ? (state.user.name || "Toi") : (seedAuthor && seedAuthor.name) || "Passionné";
      const viewerCount = (l.followers || l.viewers || []).length;
      const myId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
      const isFollowing = (l.followers || []).includes(myId);

      return `<div class="cdv-live-card" onclick="openCdvLiveViewer('${l.id}')" style="border-color:rgba(239,68,68,0.3);position:relative;">
        ${isNew ? '<div style="position:absolute;top:10px;right:10px;background:#ef4444;color:#fff;font-size:9px;font-weight:700;padding:3px 7px;border-radius:12px;">NOUVEAU</div>' : ''}
        <div class="cdv-live-header">
          <span class="cdv-live-badge">🔴 EN DIRECT</span>
          <div style="flex:1;">
            <div class="cdv-live-dest">${escapeHtml(l.destination)}</div>
            <div class="cdv-live-author">par ${escapeHtml(authorName)} · ${l.steps.length} étape${l.steps.length>1?"s":""}</div>
          </div>
        </div>
        ${l.steps.length ? `
          <div class="cdv-live-steps">
            ${l.steps.slice(-5).map(s => `
              <div class="cdv-live-step">
                <div class="cdv-live-step-emoji">${s.emoji}</div>
                <div class="cdv-live-step-city">${escapeHtml(s.city)}</div>
                <div class="cdv-live-step-time">${fmtTime(s.createdAt)}</div>
              </div>`).join("")}
          </div>` : `<div style="text-align:center;padding:10px;color:var(--muted);font-size:11px;">En attente de la première étape…</div>`}
        <div class="cdv-live-footer">
          <div class="cdv-live-count">👁 ${viewerCount} regardent</div>
          ${isMyLive(l) ? `<button class="cdv-live-follow-btn" onclick="event.stopPropagation();addCdvLiveStep('${l.id}')">+ Étape</button>` : `<button class="cdv-live-follow-btn" onclick="event.stopPropagation();toggleFollowCdvLive('${l.id}',this)" style="background:${isFollowing ? '#8b5cf6' : 'var(--border)'};color:${isFollowing ? '#fff' : 'var(--text)'};">${isFollowing ? '✓ En suivi' : '📡 Suivre'}</button>`}
        </div>
        <div class="post-actions" onclick="event.stopPropagation()">
          ${_liveLikeSpanHtml(l)}
          <span class="post-action" onclick="event.stopPropagation();openCommentSheet('${l.id}','💬 ${escapeHtml((l.destination||'').replace(/'/g,'’')).slice(0,40)}')">💬 ${commentThreadCount(l.comments)}</span>
          <span class="post-action" onclick="return reactCdvLivePicker('${l.id}', event);" title="Réagir">😊</span>
          <span class="post-action" onclick="event.stopPropagation();shareCdvLive('${l.id}')" title="Partager" aria-label="Partager">${shareIconSvg(18)}</span>
          <span class="post-react-chip-holder" data-livechip="${l.id}" style="margin-left:auto;">${_liveReactChipHtml(l.id)}</span>
        </div>
      </div>`;
    }).join("");

    if (ended.length) html += `<div style="font-weight:700;font-size:13px;color:var(--text);margin:14px 0 8px;">✅ Lives terminés</div>`;
    html += ended.map(l => `
      <div class="cdv-live-card" onclick="openCdvLiveViewer('${l.id}')" style="border-color:var(--border);">
        <div class="cdv-live-header">
          <span style="font-size:10px;font-weight:700;color:var(--muted);background:var(--bg-deep);padding:3px 8px;border-radius:6px;">✅ TERMINÉ</span>
          <div style="flex:1;">
            <div class="cdv-live-dest">${escapeHtml(l.destination)}</div>
            <div class="cdv-live-author">${l.steps.length} étape${l.steps.length>1?"s":""}</div>
          </div>
        </div>
        <div class="post-actions" onclick="event.stopPropagation()">
          ${_liveLikeSpanHtml(l)}
          <span class="post-action" onclick="event.stopPropagation();openCommentSheet('${l.id}','💬 ${escapeHtml((l.destination||'').replace(/'/g,'’')).slice(0,40)}')">💬 ${commentThreadCount(l.comments)}</span>
          <span class="post-action" onclick="return reactCdvLivePicker('${l.id}', event);" title="Réagir">😊</span>
          <span class="post-action" onclick="event.stopPropagation();shareCdvLive('${l.id}')" title="Partager" aria-label="Partager">${shareIconSvg(18)}</span>
          <span class="post-react-chip-holder" data-livechip="${l.id}" style="margin-left:auto;">${_liveReactChipHtml(l.id)}</span>
        </div>
      </div>`).join("");

    list.innerHTML = html;
    // Likes ❤️ par utilisateur distinct (chargés en lot, patch DOM sans re-render).
    _loadCdvLiveLikes(active.concat(ended).map(function(l){ return l.id; }));
    return;
  }

  const q = (($("#cdvSearchInput") && $("#cdvSearchInput").value) || "").toLowerCase().trim();
  let carnets = allCarnets();

  // Filtre multi-select: si des filtres sont sélectionnés, afficher UNIQUEMENT ceux-ci
  if (cdvFilters && cdvFilters.size > 0) {
    const saved = cdvFilters.has("saved") ? savedCarnets() : [];
    const myCarnets = cdvFilters.has("mine") ? carnets.filter(c => c._source === "me") : [];

    // Combiner les résultats de TOUS les filtres sélectionnés
    const filtered = new Set();

    if (cdvFilters.has("saved")) {
      saved.forEach(id => {
        const c = carnets.find(x => x.id === id);
        if (c) filtered.add(c);
      });
    }

    if (cdvFilters.has("mine")) {
      myCarnets.forEach(c => filtered.add(c));
    }

    carnets = Array.from(filtered);
  }

  if (q) {
    carnets = carnets.filter(c =>
      (c.destination || "").toLowerCase().includes(q) ||
      (c.text || "").toLowerCase().includes(q) ||
      (c.steps || []).some(s => (s.place || "").toLowerCase().includes(q))
    );
  }

  // Live épinglé : si un carnet Live est en cours, on le remonte EN TÊTE de la
  // liste CDV (uniquement en vue par défaut — pas en recherche ni sous filtre).
  let pinnedLivesHtml = "";
  if ((!cdvFilters || cdvFilters.size === 0) && !q) {
    const _seenPin = new Set();
    const _activeLives = getActiveCdvLives().filter(l => {
      if (_seenPin.has(l.id)) return false; _seenPin.add(l.id); return true;
    });
    if (_activeLives.length) {
      pinnedLivesHtml = '<div class="cdv-pinned-live-title">🔴 En direct maintenant</div>'
        + _activeLives.map(_pinnedLiveCardHtml).join("");
    }
  }

  if (!carnets.length) {
    // Un Live en cours reste visible même sans aucun carnet à afficher.
    if (pinnedLivesHtml) {
      list.innerHTML = pinnedLivesHtml;
      const _emptyEl = document.getElementById("cdvEmpty");
      if (_emptyEl) _emptyEl.style.display = "none";
      return;
    }
    list.innerHTML = "";
    const empty = document.getElementById("cdvEmpty");
    if (empty) {
      let icon = "📔", title = "Aucun carnet trouvé", text = "", cta = "";
      if (q) {
        title = "Aucun résultat";
        text = "Aucun carnet ne correspond à « " + escapeHtml(q) + " ». Essaie une autre destination.";
      } else if (cdvFilters && cdvFilters.size > 0) {
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
  // Le(s) Live(s) en cours sont épinglés en tête via pinnedLivesHtml.
  list.innerHTML = pinnedLivesHtml + carnets.map(c => {
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
      </div>

      <div class="cdv-feed-cover-wrap">
        ${c.cover ? `<img loading="lazy" decoding="async" class="cdv-feed-cover" src="${c.cover}" alt="" onerror="this.onerror=null;this.src='https://picsum.photos/seed/cdv-${c.id}/1280/720';"/>` : ""}
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
        <span class="post-action ${isLiked ? "liked" : ""}" onclick="likePost('${c.id}')">
          ${isLiked ? "❤️" : "🤍"} ${c.likes || 0}
        </span>
        <span class="post-action" onclick="openComments('${c.id}')">💬 ${commentThreadCount(c.comments)}</span>
        <span class="post-action" onclick="return showEmojiPickerForPost('${c.id}', event);" title="Emoji & GIF">😊</span>
        <span class="post-action" onclick="event.stopPropagation();sharePost('${c.id}')" title="Partager" aria-label="Partager">${shareIconSvg(18)}</span>
        <span class="post-action" onclick="toggleCarnetSave('${c.id}');renderCdvScreen()" title="${isSaved ? "Sauvegardé" : "Sauvegarder"}">${isSaved ? "⭐" : "☆"}</span>
        <span class="post-react-chip-holder" data-postchip="${c.id}" style="margin-left:auto;">${_postReactChipHtml(c.id)}</span>
      </div>
    </article>`;
  }).join("");
}

