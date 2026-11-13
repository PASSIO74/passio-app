// ⚠️ RETRAIT DU CARNET DE VOYAGE (refonte multi-passion, §6).
// Trois choses vivaient en tête de ce fichier et sont parties avec l'écran CDV :
// la délégation de clic `[data-cdvfilter]` (les filtres « Mes favoris / Mes
// carnets / Lives » du panneau Outils), le carrousel `renderVlogCarousel` et le
// raccourci Échap du viewer plein écran. Leurs cibles n'existent plus.

// ===== MENU D'OPTIONS D'UN POST (⋯) =====
// Bottom-sheet façon Instagram : la suppression vit ici, plus dans l'en-tête du post.
function openPostOptions(postId) {
  // ⚠️ « Modifier le carnet » a été retiré avec la fonctionnalité (§6) : son
  // éditeur n'existe plus. Les publications de type `vlog` n'apparaissent
  // d'ailleurs plus nulle part, donc ce menu ne peut plus s'ouvrir sur l'une
  // d'elles.
  // CRE-C16 / FIL-C24 (décision de Benjamin du 2026-11-13, « 1 : a ») : le
  // TEXTE d'une publication se corrige — rien d'autre (passion, média, type).
  // Pas pour un repartage : son texte est la citation de l'original.
  var _p = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  var _editBtn = (_p && !_p.sharedReelData && !_p.sharedFromPostId && !_p.isReel)
    ? `<button class="post-option" onclick="closeModal();modifierTextePublication('${escapeJsArg(postId)}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>
        Modifier le texte
      </button>`
    : "";
  openModal(`
    <div class="modal-handle"></div>
    <div class="post-options-sheet">
      ${_editBtn}
      <button class="post-option danger" onclick="closeModal();confirmDeletePost('${escapeJsArg(postId)}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7 H20"/><path d="M9 7 V4 H15 V7"/><path d="M6 7 L7 20 H17 L18 7"/><path d="M10 11 V17"/><path d="M14 11 V17"/></svg>
        Supprimer la publication
      </button>
      <button class="post-option" onclick="closeModal()">Annuler</button>
    </div>
  `);
}

// ── CORRIGER LE TEXTE D'UNE PUBLICATION (CRE-C16 / FIL-C24) ───────────────────
// Le serveur d'abord : le texte affiché ne change qu'une fois l'écriture
// confirmée (`{ error }` lu, zéro ligne = refus). La migration du 2026-11-13
// n'ouvre que la colonne `content`, à l'auteur ; `edited_at` est posé par le
// serveur. Une publication qui n'existe que sur cet appareil se corrige ici.
var TEXTE_PUBLICATION_MAX = 5000;
function modifierTextePublication(postId) {
  var p = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!p) { toast("Cette publication n'est plus disponible."); return; }
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">Modifier le texte</div>
    <div class="modal-subtitle">La passion, la photo et la vidéo ne changent pas. La publication portera la mention « modifié ».</div>
    <textarea class="textarea" id="pubTexteEdit" aria-label="Texte de la publication" maxlength="${TEXTE_PUBLICATION_MAX}" style="min-height:120px;"></textarea>
    <div style="display:flex;gap:8px;margin-top:12px;">
      <button class="btn ghost block" onclick="closeModal()">Annuler</button>
      <button class="btn primary block" id="pubTexteEnregistrer" onclick="enregistrerTextePublication('${escapeJsArg(postId)}')">Enregistrer</button>
    </div>
  `);
  var champ = document.getElementById("pubTexteEdit");
  if (champ) { champ.value = String(p.text || ""); try { champ.focus(); } catch (e) {} }
}
async function enregistrerTextePublication(postId) {
  var champ = document.getElementById("pubTexteEdit");
  var bouton = document.getElementById("pubTexteEnregistrer");
  var p = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!champ || !p) return;
  var texte = String(champ.value || "").trim().slice(0, TEXTE_PUBLICATION_MAX);
  if (!texte && !p.image && !p.video && !p.audio) { toast("Écris quelque chose, ou supprime la publication"); return; }
  if (texte === String(p.text || "").trim()) { closeModal(); return; }
  if (bouton) { if (bouton.disabled) return; bouton.disabled = true; bouton.textContent = "Enregistrement…"; }
  var serveur = !!(p.fromSupabase && typeof supa !== "undefined" && supa && window._supaReal
    && typeof _uidEstUnCompte === "function" && _uidEstUnCompte());
  var editedAt = Date.now();
  if (serveur) {
    var r = null;
    try {
      r = await supa.from("posts").update({ content: texte }).eq("id", postId).eq("author_id", MY_UID).select("id, edited_at");
    } catch (e) { r = { error: e }; }
    var ok = r && !r.error && Array.isArray(r.data) && r.data.length === 1;
    if (!ok) {
      if (bouton) { bouton.disabled = false; bouton.textContent = "Enregistrer"; }
      try { diagLog("modification de publication refusée " + String((r && r.error && (r.error.code || r.error.message)) || "0 ligne")); } catch (e) {}
      toast(typeof estEchecReseau === "function" && r && r.error && estEchecReseau(r.error)
        ? "⚠️ Pas de connexion — modification non enregistrée"
        : "⚠️ Modification non enregistrée — réessaie", "warning");
      return;
    }
    if (r.data[0].edited_at) editedAt = supaTs(r.data[0].edited_at);
  }
  // Toutes les copies vivantes (userPosts, supabasePosts, seed, extras du fil).
  [state.userPosts, state.supabasePosts, state.seed && state.seed.posts, window._feedExtraPosts].forEach(function (liste) {
    (liste || []).forEach(function (x) { if (x && x.id === postId) { x.text = texte; x.editedAt = editedAt; } });
  });
  try { saveState(); } catch (e) {}
  closeModal();
  window._feedDomSig = null; window._lastHtml = null;
  try { renderFeed(); } catch (e) {}
  try {
    var page = document.getElementById("postDetailPage");
    if (page && page.style.display === "flex" && typeof openPost === "function") openPost(postId);
  } catch (e) {}
  toast(serveur ? "Publication modifiée" : "Publication modifiée sur cet appareil");
}

// Le ⋯ d'une publication d'AUTRUI : signaler la publication, bloquer l'auteur.
// Même feuille que `openPostOptions`, mêmes moteurs que le profil visité
// (`reportPost`, `blockUser` — verdict serveur lu dans les deux).
function openPostOptionsAutrui(postId) {
  var p = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!p) return;
  var auteur = (typeof userById === "function" && userById(p.authorId)) || {};
  var nom = auteur.name || "cet utilisateur";
  var bloque = (typeof isBlocked === "function") && isBlocked(p.authorId);
  openModal(`
    <div class="modal-handle"></div>
    <div class="post-options-sheet">
      <button class="post-option" onclick="closeModal();reportPost('${escapeJsArg(postId)}')">🚩 Signaler cette publication</button>
      ${bloque
        ? `<button class="post-option" onclick="closeModal();unblockUser('${escapeJsArg(p.authorId)}','${escapeJsArg(nom)}')">✅ Débloquer ${escapeHtml(nom)}</button>`
        : `<button class="post-option danger" onclick="closeModal();demanderBlocage('${escapeJsArg(p.authorId)}','${escapeJsArg(nom)}')">🚫 Bloquer ${escapeHtml(nom)}</button>`}
      <button class="post-option" onclick="closeModal()">Annuler</button>
    </div>
  `);
}

// ═════════════════════════════════════════════════════════════════════════
// SUPPRESSION DES POSTS
// ─────────────────────────────────────────────────────────────────────────
// ⚠️ CE CHEMIN A RESSUSCITÉ DU CONTENU EN PRODUCTION (signalé le 2026-09-01 :
// « j'ai publié, et tout l'ancien contenu que j'avais supprimé est ressorti
// dans le fil »). Trois défauts se cumulaient — le détail des causes est dans
// le bloc « SUPPRESSIONS DURABLES » d'app-02. Les règles qui en découlent :
//
//   ① On supprime de TOUTES les copies vivantes, pas seulement de `userPosts` :
//      une publication vit simultanément dans `userPosts`, `supabasePosts`,
//      `seed.posts` et `window._feedExtraPosts`. `purgerPostsSupprimes()` est le
//      seul point qui les connaît toutes — ne pas refaire le filtrage à la main.
//   ② On pose une pierre tombale AVANT tout : c'est elle, et elle seule, qui
//      tient quand le contenu revient d'une page serveur, du temps réel ou d'un
//      blob de synchronisation périmé.
//   ③ La suppression serveur n'est JAMAIS un « fire and forget ». Elle est
//      vérifiée (erreur lue ET lignes comptées), et mise en file si elle échoue.
//      Sans quoi le stub noop (SDK pas encore chargé, réseau coupé) rend un faux
//      succès et la ligne reste en base pour tout le monde.
// ═════════════════════════════════════════════════════════════════════════

// Chemins Storage portés par une publication (best-effort : si la RLS Storage
// refuse, le pire est un fichier orphelin — jamais un post qui survit).
function _cheminsMediaPost(post) {
  try {
    // Deux formes d'URL depuis le CDN (2026-09-11) : Supabase direct (anciens
    // médias) et `<CDN>/content/…` (nouveaux). Ne reconnaître que la première
    // laisserait chaque nouveau média ORPHELIN à la suppression — sans erreur.
    const markers = ["/storage/v1/object/public/content/", "/media/content/"];
    const marqueur = function (u) { for (var i = 0; i < markers.length; i++) { if (u.indexOf(markers[i]) !== -1) return markers[i]; } return null; };
    // Une photo légère (2026-09-21) a sa grande à côté : les deux partent.
    return [post && post.image, post && post.video, post && post.audio, post && post.cover]
      .filter(function (u) { return typeof u === "string" && marqueur(u) !== null; })
      .map(function (u) { var m = marqueur(u); return decodeURIComponent(u.slice(u.indexOf(m) + m.length).split("?")[0]); })
      .reduce(function (acc, chemin) { return acc.concat(cheminsImageStorage(chemin)); }, []);
  } catch (e) { return []; }
}

// ── File d'attente des suppressions serveur ───────────────────────────────
// Même patron que la file des commentaires (`_cmtOb*`) : préfixe DÉDIÉ, car
// `_outbox*` (messages) et `_cmtOb*` (commentaires) existent déjà — trois files
// distinctes partagent `window`, et une collision de nom y serait silencieuse.
var _DEL_OUTBOX_KEY = "passio_post_delete_outbox_v1";
var _DEL_OB_MAX_TRIES = 12;
// Bornes d'hygiène. La file rend leurs essais à toutes ses entrées à chaque
// démarrage (conditions réseau neuves) : sans borne, une suppression réellement
// impossible — compte d'origine supprimé, ligne verrouillée — se retenterait
// jusqu'à la fin des temps et la file grossirait sans jamais rendre la main.
// La pierre tombale, elle, ne dépend pas de la file : le contenu reste caché
// ICI quoi qu'il advienne ; ce rattrapage ne sert qu'aux AUTRES comptes.
var _DEL_OB_MAX_ITEMS = 200;
var _DEL_OB_MAX_AGE_MS = 30 * 24 * 3600 * 1000;
var _delObTimer = null, _delObFlushing = false;
function _delObLoad() { try { return JSON.parse(localStorage.getItem(_DEL_OUTBOX_KEY) || "[]"); } catch (e) { return []; } }
function _delObSave(arr) { try { localStorage.setItem(_DEL_OUTBOX_KEY, JSON.stringify(arr)); } catch (e) {} }
function _delObStartTimer() { if (!_delObTimer) _delObTimer = setInterval(function () { if (!document.hidden) _delObFlush(); }, 15000); }
function _delObStopTimer() { if (_delObTimer) { clearInterval(_delObTimer); _delObTimer = null; } }

// ⚠️ L'entrée porte le COMPTE. La clé de file est unique pour l'origine, et
// deux comptes se succèdent sur le même appareil : sans ce champ, la
// suppression de A était rejouée sous l'identité de B — refusée par la RLS
// (author_id ≠ auth.uid()), donc retentée en boucle jusqu'à la borne, pour rien.
// Même leçon que la file `user_state`, dont la clé est suffixée par compte.
function _enqueuePostDelete(postId, paths) {
  if (!postId) return;
  var arr = _delObLoad().filter(function (o) { return o.postId !== postId; });
  // AUTH-06 : le compte RÉEL qui supprime, jamais le `u_<aléatoire>` d'un visiteur.
  var proprio = (typeof _fileProprietaire === "function") ? _fileProprietaire() : null;
  if (!proprio) return;   // un visiteur n'a aucune ligne en base à supprimer
  arr.push({ postId: postId, paths: paths || [], uid: proprio, tries: 0, ts: Date.now() });
  _delObSave(arr);
  _delObStartTimer();
  _delObFlush();
}

// Exécute UNE suppression serveur. Rend true seulement si la ligne n'est
// PLUS en base à la fin.
//
// ⚠️ « 0 ligne touchée » est ambigu et ne peut pas être tranché seul : la ligne
// a pu être déjà supprimée (succès) ou refusée par la policy (échec). On lève
// le doute par une relecture ciblée — c'est la seule preuve qui vaille, et elle
// coûte une requête sur un chemin rare.
async function _delObRun(op) {
  try {
    if (typeof sessionExpiree === "function" && sessionExpiree()) return "sans_session"; // UXO-02 : on attend, sans compter d'essai
    if (typeof supa === "undefined" || !supa || !window._supaReal) return false;
    if (typeof MY_UID === "undefined" || !MY_UID) return false;
    // ⚠️ LA RELECTURE N'EST UNE PREUVE QUE SI LE LECTEUR EST L'AUTEUR (ETAT-05, audit
    // du 2026-11-10). Sous une session morte, le DELETE est filtré par la RLS (0 ligne,
    // aucune erreur) et la relecture se fait sous le rôle anonyme : la publication d'un
    // compte PRIVÉ existe mais n'est pas lisible → « reste » nul → « supprimée ». La
    // file l'abandonnait, la pierre tombale la cachait à son auteur, ses abonnés la
    // lisaient toujours. Sans session de CE compte, on attend — sans compter d'essai.
    try {
      const ses = await supa.auth.getSession();
      const su = ses && ses.data && ses.data.session && ses.data.session.user;
      if (!su || su.id !== MY_UID) return "sans_session";
    } catch (e) { return "sans_session"; }
    const res = await supa.from("posts").delete().eq("id", op.postId).eq("author_id", MY_UID).select("id");
    const verdict = (typeof _writeVerdict === "function")
      ? _writeVerdict(res, { label: "suppression de la publication " + op.postId })
      : { ok: !(res && res.error), rows: (res && Array.isArray(res.data)) ? res.data.length : null };
    if (!verdict.ok) return false;
    if (verdict.rows === 0) {
      const { data: reste, error: errLect } = await supa.from("posts").select("id").eq("id", op.postId).maybeSingle();
      if (errLect) return false;          // on ne sait pas : on retentera
      if (reste) {                        // la ligne est là et n'a pas bougé → refus RLS
        try { diagLog("suppression refusée (RLS) pour " + op.postId); } catch (e) {}
        return false;
      }
    }
    // La ligne est partie : on peut nettoyer le média (jamais l'inverse — un
    // média effacé sur une publication encore en base donnerait une carte vide).
    try {
      if (op.paths && op.paths.length) await supa.storage.from("content").remove(op.paths);
    } catch (e) {}
    return true;
  } catch (e) { return false; }
}

async function _delObFlush() {
  if (_delObFlushing) return;
  var arr = _delObLoad();
  if (!arr.length) { _delObStopTimer(); return; }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;  // hors-ligne : attendre `online`
  if (!window._supaReal) return;                                               // backend pas prêt : réessai plus tard
  _delObFlushing = true;
  try {
    for (var i = 0; i < arr.length; i++) {
      var op = arr[i];
      if ((op.tries || 0) >= _DEL_OB_MAX_TRIES) continue;
      if (!op.uid) {   // entrée d'avant AUTH-06, sans propriétaire : ni rejouée sous un autre compte, ni gardée en silence
        try { if (typeof diagLog === "function") diagLog("file suppressions : entrée sans propriétaire retirée " + String(op.postId).slice(0, 40)); } catch (e) {}
        _delObSave(_delObLoad().filter(function (o) { return o.postId !== op.postId; }));
        continue;
      }
      if (op.uid !== MY_UID) continue;   // suppression d'un AUTRE compte : pas la nôtre à rejouer
      var ok = false;
      try { ok = await _delObRun(op); } catch (e) { ok = false; }
      if (ok === "sans_session") continue;   // ni preuve ni essai : on attend la session
      if (ok === true) {
        _delObSave(_delObLoad().filter(function (o) { return o.postId !== op.postId; }));
      } else {
        op.tries = (op.tries || 0) + 1;
        _delObSave(_delObLoad().map(function (o) { return o.postId === op.postId ? op : o; }));
      }
    }
  } finally { _delObFlushing = false; }
  var pend = _delObLoad().filter(function (o) {
    return (o.tries || 0) < _DEL_OB_MAX_TRIES && o.uid === MY_UID;
  });
  if (pend.length) _delObStartTimer(); else _delObStopTimer();
}

if (!window._delObWired) {
  window._delObWired = true;
  try {
    window.addEventListener("online", function () { _delObFlush(); });
    setTimeout(function () {
      // Une session neuve = des conditions réseau neuves : on rend leurs essais
      // aux suppressions épuisées plutôt que de les abandonner en base. La
      // pierre tombale les cache déjà ICI ; ce rattrapage sert aux AUTRES.
      try {
        var _seuil = Date.now() - _DEL_OB_MAX_AGE_MS;
        var _f = _delObLoad().filter(function (o) { return o && o.postId && (o.ts || 0) > _seuil; });
        if (_f.length > _DEL_OB_MAX_ITEMS) _f = _f.slice(_f.length - _DEL_OB_MAX_ITEMS);
        _delObSave(_f.map(function (o) { o.tries = 0; return o; }));
      } catch (e) {}
      _delObFlush();
    }, 4000);
  } catch (e) {}
}

function confirmDeletePost(postId) {
  // ⚠️ `findPostAnywhere` et non `userPosts.find` : après un rechargement, c'est
  // la copie SERVEUR de ma publication qui est en mémoire, et l'ancien test
  // répondait « tu ne peux supprimer que tes propres posts » sur mon propre post.
  const post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!post || !_estMonPost(post)) {
    toast("Tu ne peux supprimer que tes propres posts.");
    return;
  }
  // Aperçu rapide du contenu pour la confirmation
  const preview = (post.text || "").slice(0, 80) + (post.text && post.text.length > 80 ? "…" : "");
  const html = `
    <div class="modal-handle"></div>
    
    <div class="pay-modal-head">
      <div class="pay-modal-emoji">🗑</div>
      <div class="pay-modal-title">Supprimer cette publication ?</div>
    </div>
    <div style="font-size:13px;color:var(--text);margin-bottom:14px;line-height:1.55;text-align:center;">
      Cette action est <b>définitive</b>. Le post et ses commentaires seront supprimés.
    </div>
    ${preview ? `<div style="background:rgba(139,92,246,0.06);padding:10px 12px;border-radius:10px;margin-bottom:14px;font-size:12px;color:var(--text-dim);font-style:italic;line-height:1.5;">« ${escapeHtml(preview)} »</div>` : ""}
    <button class="btn block" style="background:#dc2626;color:#fff;border-color:#dc2626;margin-bottom:8px;" onclick="deletePost('${escapeJsArg(postId)}')">
      Oui, supprimer définitivement
    </button>
    <button class="btn ghost block" onclick="closeModal()">Annuler</button>
  `;
  openModal(html);
}

function deletePost(postId) {
  const post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!post || !_estMonPost(post)) {
    toast("Post introuvable.");
    closeModal();
    return;
  }
  // Les chemins Storage se lisent AVANT la purge : après, l'objet a disparu des
  // tableaux et on ne saurait plus quels fichiers effacer.
  const chemins = _cheminsMediaPost(post);

  // ① La pierre tombale d'abord : à partir d'ici, aucune voie de retour
  // (page serveur, temps réel, blob périmé, file de pagination) ne peut plus
  // ramener cette publication à l'écran, même si tout le reste échoue.
  marquerPostSupprime(postId);
  // ② Toutes les copies vivantes, en un seul point qui les connaît toutes.
  purgerPostsSupprimes();
  // ③ Les références qui pointaient dessus.
  state.user.likedPosts = (state.user.likedPosts || []).filter(x => x !== postId);
  saveState();
  // ④ Le serveur, vérifié et réessayé — jamais un « fire and forget ».
  _enqueuePostDelete(postId, chemins);

  closeModal();
  // Fermer la page de détail si elle affichait ce post (sinon il reste à l'écran)
  if (typeof closePost === "function") closePost();
  // Re-render selon l'écran courant
  renderFeed();
  if (typeof renderProfilesScreen === "function") renderProfilesScreen();
  toast("Publication supprimée.");
}

// Détecte une URL d'image/GIF (KLIPY, Giphy, Tenor ou extension média) pour rendre
// un commentaire « GIF » comme une vraie image plutôt qu'en texte brut. Utilisé par
// le renderer unifié → un commentaire dont le texte EST une URL de GIF s'affiche
// en image dans les 3 contextes (fil / IRL / CDV) sans changement de schéma.
function _looksLikeMediaUrl(s) {
  if (!s || typeof s !== "string") return false;
  s = s.trim();
  if (!/^https?:\/\//i.test(s)) return false;
  return /\.(gif|png|jpe?g|webp)(\?|#|$)/i.test(s)
    || /(giphy\.com|tenor\.com|media\d*\.giphy|media\.tenor|static\d*\.klipy\.com)/i.test(s);
}
// Transforme les URLs, @mentions et #hashtags en éléments cliquables (façon
// LinkedIn/Facebook). ⚠️ Opère sur du texte DÉJÀ échappé par escapeHtml → sûr
// (aucun HTML utilisateur brut injecté). Les @/# ne matchent que précédés d'un
// espace/ponctuation (donc pas à l'intérieur d'une URL, ex. .../#ancre).
// Liste (cache 15 s) des pseudos connus, triés du plus long au plus court pour
// matcher « @Nina Costa » avant « @Nina » (mentions multi-mots).
function _cmtKnownNames() {
  if (window.__cmtNamesCache && window.__cmtNamesCache.t > Date.now() - 15000) return window.__cmtNamesCache.list;
  var list = (state.seed.users || []).map(function (u) { return u && u.name; }).filter(Boolean);
  list.sort(function (a, b) { return b.length - a.length; });
  window.__cmtNamesCache = { t: Date.now(), list: list };
  return list;
}
// Rend les @mentions cliquables. Scan manuel (pas de regex à lookbehind, cassé
// sur d'anciens Safari iOS) : à chaque « @ » en début de mot, on matche le plus
// long pseudo CONNU (multi-mots « @Nina Costa »), sinon un seul mot. Opère sur du
// texte DÉJÀ échappé ; le pseudo affiché est ré-échappé (anti-XSS).
// La mention qui commence à safe[i] (« @ »), ou null. Le nom le plus connu d'abord,
// sinon le mot qui suit. Rend le HTML de la mention et le nombre de caractères lus.
function _mentionEn(safe, i) {
  var names = _cmtKnownNames();
  var after = safe.slice(i + 1), matched = null;
  for (var k = 0; k < names.length; k++) {
    var esc = escapeHtml(names[k]);
    if (esc && after.toLowerCase().indexOf(esc.toLowerCase()) === 0) { matched = { raw: names[k], esc: esc }; break; }
  }
  if (!matched) { var tk = (after.match(/^[A-Za-zÀ-ÿ0-9_'’-]+/) || [""])[0]; if (tk) matched = { raw: tk, esc: tk }; }
  if (!matched) return null;
  return {
    html: '<span class="cmt-mention" onclick="return _openMentionProfile(\'' + escapeJsArg(matched.raw) + '\', event)">@' + matched.esc + '</span>',
    lus: 1 + matched.esc.length,
  };
}
// Mentions, mots-dièse et liens d'un texte DÉJÀ échappé.
// ⚠️ UN SEUL PASSAGE, de gauche à droite (audit 2026-11-06) : ces trois réécritures
// se faisaient l'une après l'autre sur le résultat de la précédente, donc aussi sur le
// HTML déjà généré. Un nom de compte contenant une URL ou un « #mot » se retrouvait
// réécrit DANS l'attribut onclick de sa mention, dont il refermait les guillemets.
// Le morceau reconnu est ajouté à la sortie et n'est jamais relu.
function _linkifyText(safe) {
  if (!safe) return "";
  var bordMot = /[\s.,;!?()\[\]]/;
  var bordLien = /[\s(]/;
  var dieze = /^#[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9_'-]{1,30}/;
  var adresse = /^https?:\/\/[^\s<]+/;
  var out = "", i = 0, m;
  while (i < safe.length) {
    var ch = safe[i], avant = i > 0 ? safe[i - 1] : "";
    if (ch === "@" && (i === 0 || bordMot.test(avant))) {
      var men = _mentionEn(safe, i);
      if (men) { out += men.html; i += men.lus; continue; }
    } else if (ch === "#" && (i === 0 || bordMot.test(avant)) && (m = dieze.exec(safe.slice(i, i + 40)))) {
      var tag = m[0].slice(1);
      out += '<span class="cmt-hashtag" onclick="return _openHashtag(\'' + escapeJsArg(tag) + '\', event)">#' + tag + '</span>';
      i += m[0].length; continue;
    } else if (ch === "h" && (i === 0 || bordLien.test(avant)) && (m = adresse.exec(safe.slice(i)))) {
      var clean = m[0].replace(/[.,;!?)]+$/, ""); // ponctuation finale hors du lien
      out += '<a href="' + clean + '" target="_blank" rel="noopener noreferrer nofollow" class="cmt-link">' + clean + '</a>';
      i += clean.length; continue;
    }
    out += ch; i++;
  }
  return out;
}
// LOT-20 (audit UX/UI du 2026-11-10, MSG-C67) : les liens d'un MESSAGE, sur un
// texte DÉJÀ échappé — même reconnaissance que `_linkifyText` (http(s) seulement,
// ponctuation finale hors du lien, aucun `<`, `"` déjà en entité), sans mentions
// ni mots-dièse. Nouvel onglet, `noopener noreferrer nofollow`.
function _liensMessage(safe) {
  if (!safe) return "";
  var adresse = /^https?:\/\/[^\s<]+/;
  var bord = /[\s(]/;
  var out = "", i = 0, m;
  while (i < safe.length) {
    var ch = safe[i];
    if (ch === "h" && (i === 0 || bord.test(safe[i - 1])) && (m = adresse.exec(safe.slice(i)))) {
      var clean = m[0].replace(/[.,;!?)]+$/, "");
      out += '<a href="' + clean + '" target="_blank" rel="noopener noreferrer nofollow" class="msg-lien">' + clean + '</a>';
      i += clean.length; continue;
    }
    out += ch; i++;
  }
  return out;
}
function _commentBodyHtml(txt) {
  return _looksLikeMediaUrl(txt)
    ? '<img loading="lazy" decoding="async" src="' + safeUrlAttr(txt) + '" style="max-width:160px;border-radius:10px;margin-top:2px;display:block;" alt="GIF" />'
    : _linkifyText(escapeHtml(txt || ""));
}
// Ouvre le profil d'un pseudo @mentionné (recherche insensible à la casse dans
// les utilisateurs connus) — best-effort.
function _openMentionProfile(name, event) {
  if (event && event.stopPropagation) { event.stopPropagation(); }
  try {
    var n = String(name || "").toLowerCase();
    var u = (state.seed.users || []).find(function (x) { return x.name && x.name.toLowerCase() === n; });
    if (u && typeof openUserProfile === "function") {
      if (typeof closeModal === "function") closeModal();
      var src = (typeof MY_UID !== "undefined" && u.id === MY_UID) ? "me" : "seed";
      openUserProfile(u.id, src);
    } else if (typeof toast === "function") { toast("@" + name); }
  } catch (e) {}
  return false;
}
// Ouvre l'exploration filtrée sur un hashtag — best-effort.
function _openHashtag(tag, event) {
  if (event && event.stopPropagation) { event.stopPropagation(); }
  try {
    if (typeof closeModal === "function") closeModal();
    if (typeof goTo === "function") goTo("explore");
    var si = document.getElementById("exploreSearch") || document.querySelector("#screen-explore input[type='search']");
    if (si) { si.value = "#" + tag; if (typeof si.oninput === "function") si.oninput(); si.dispatchEvent(new Event("input")); }
    else if (typeof toast === "function") toast("#" + tag);
  } catch (e) {}
  return false;
}

// ════════════════════════════════════════════════════════════════════════
// @MENTIONS AVEC AUTOCOMPLÉTION (façon Instagram/Facebook/LinkedIn)
// Détecte « @partiel » en cours de frappe dans n'importe quel composeur de
// commentaire (fil / réponse / IRL / CDV) et propose une liste d'utilisateurs.
// Sélectionner insère « @Pseudo ». Rendu cliquable ensuite par _linkifyText.
// ════════════════════════════════════════════════════════════════════════
var _CMT_COMPOSER_SEL = "#newComment, .reply-field, #cmtThreadInput, #cdvLiveComment, #eventCommentInput";
function _mentionCandidates(q) {
  var seen = {}, out = [];
  var meIds = [(typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : null, "me"].filter(Boolean);
  (state.seed.users || []).forEach(function (u) {
    if (!u || !u.name) return;
    if (meIds.indexOf(u.id) > -1) return;                     // pas soi-même
    if (typeof isBlocked === "function" && isBlocked(u.id)) return;
    var key = u.name.toLowerCase();
    if (seen[key]) return;
    if (q && key.indexOf(q) !== 0 && key.indexOf(q) < 0) return; // préfixe OU contient
    seen[key] = 1; out.push(u);
  });
  // Priorité au préfixe, puis alpha ; limite courte pour rester léger.
  out.sort(function (a, b) {
    var ap = a.name.toLowerCase().indexOf(q) === 0 ? 0 : 1, bp = b.name.toLowerCase().indexOf(q) === 0 ? 0 : 1;
    return ap !== bp ? ap - bp : a.name.localeCompare(b.name);
  });
  return out.slice(0, 6);
}
function _closeMentionBox() {
  var b = document.getElementById("mention-box");
  if (b) b.remove();
  window._mentionTarget = null;
}
// ⚠️ ASTRA-24 (cinquième contre-revue, 2026-09-15) — LE CLIENT N'ÉCRIT PLUS LA
// NOTIFICATION DE MENTION. Il RÉSOUT les « @nom » en IDENTIFIANTS de comptes
// (la même liste que la boîte de suggestion) et les porte au SERVEUR
// (`notifier_mentions`, migration du 15/09), qui vérifie l'événement (un
// commentaire récent de l'appelant), autorise chaque destinataire (existant,
// non bloqué, membre s'il s'agit d'un groupe) et écrit la ligne avec un texte
// DÉRIVÉ. Un nom n'était pas une identité (homonymes) ; le texte était libre ;
// la ligne était ouverte à tout compte non bloqué — les trois sont fermés.
// Ignore les comptes démo (id « u_… ») et soi-même.
function _idsMentionnes(text, candidats) {
  if (!text || text.indexOf("@") < 0) return [];
  var low = text.toLowerCase();
  var meId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  var done = {}, ids = [];
  (candidats || []).forEach(function (u) {
    if (!u || !u.name || !u.id || u.id === meId || done[u.id]) return;
    if (String(u.id).indexOf("u_") === 0) return; // compte démo, pas de vraie notif
    if (low.indexOf("@" + u.name.toLowerCase()) > -1) { done[u.id] = 1; ids.push(u.id); }
  });
  return ids;
}
// Appelée APRÈS que le commentaire a atterri (`supaAddComment`, app-08) : le
// serveur exige un commentaire récent de l'appelant, il faut qu'il existe.
function _notifyCommentMentions(threadId, text) {
  var ids = _idsMentionnes(text, state.seed.users || []);
  if (!ids.length || typeof _mentionnerServeur !== "function") return;
  try { _mentionnerServeur("commentaire", threadId, ids); } catch (e) {}
}
function _cmtMentionDetect(el) {
  if (!el) return;
  var val = el.value || "";
  var pos = (typeof el.selectionStart === "number") ? el.selectionStart : val.length;
  var before = val.slice(0, pos);
  var m = before.match(/(^|\s)@([A-Za-zÀ-ÿ0-9_'-]{0,30})$/);
  if (!m) { _closeMentionBox(); return; }
  var q = m[2].toLowerCase();
  var users = _mentionCandidates(q);
  if (!users.length) { _closeMentionBox(); return; }
  _showMentionBox(el, users, m[2].length);
}
function _showMentionBox(el, users, qLen) {
  _closeMentionBox();
  window._mentionTarget = el;
  var box = document.createElement("div");
  box.id = "mention-box";
  box.className = "mention-box";
  users.forEach(function (u) {
    var av = { avatar: u.avatar || "#64748b", profileEmoji: u.profileEmoji || "👤", name: u.name, photoUrl: u.photoUrl || null };
    var row = document.createElement("div");
    row.className = "mention-row";
    row.innerHTML = '<div class="avatar sm" style="background:' + avatarBg(av) + ';flex-shrink:0;">' + avatarInner(av) + '</div>'
      + '<span class="mention-name">' + escapeHtml(u.name) + '</span>';
    row.onmousedown = function (ev) { ev.preventDefault(); _pickCmtMention(el, u.name, qLen); };
    box.appendChild(row);
  });
  // Positionnement AU-DESSUS du champ (le clavier mobile occupe le bas).
  var r = el.getBoundingClientRect();
  box.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 258)) + "px";
  box.style.bottom = Math.max(8, window.innerHeight - r.top + 6) + "px";
  document.body.appendChild(box);
}
function _pickCmtMention(el, name, qLen) {
  var pos = (typeof el.selectionStart === "number") ? el.selectionStart : (el.value || "").length;
  var val = el.value || "";
  var start = pos - qLen - 1; // position du « @ »
  if (start < 0) start = 0;
  el.value = val.slice(0, start) + "@" + name + " " + val.slice(pos);
  var np = start + name.length + 2;
  try { el.selectionStart = el.selectionEnd = np; } catch (e) {}
  el.focus();
  _closeMentionBox();
  if (typeof autoResizeTextarea === "function") { try { autoResizeTextarea(el); } catch (e) {} }
  if (typeof _syncComposerSendState === "function") _syncComposerSendState(el);
}
if (!window._mentionListenerAdded) {
  window._mentionListenerAdded = true;
  document.addEventListener("input", function (e) {
    var el = e.target;
    if (el && el.matches && el.matches(_CMT_COMPOSER_SEL)) _cmtMentionDetect(el);
  });
  document.addEventListener("click", function (e) {
    var box = document.getElementById("mention-box");
    if (box && !box.contains(e.target) && e.target !== window._mentionTarget) _closeMentionBox();
  });
}

// Tri des commentaires (façon Instagram/Facebook) : « Récents » (défaut) ou
// « Pertinents » (les plus aimés/réagis d'abord). État mémorisé par fil.
function _setCmtSort(threadId, mode) {
  window._cmtSort = window._cmtSort || {};
  window._cmtSort[threadId] = mode;
  if (typeof _refreshCommentThreadUINow === "function") _refreshCommentThreadUINow(threadId);
  return false;
}
function _cmtRelevance(c) {
  var reacts = 0; try { reacts = _cmtReactions(c).length; } catch (e) {}
  return (c.likes || 0) + reacts + ((c.replies || []).filter(function (r) { return r && r.type !== "emoji_reaction"; }).length);
}

// ════════════════════════════════════════════════════════════════════════
// #14 — FILE D'ATTENTE HORS-LIGNE + RÉESSAI D'ENVOI (façon IG/FB/WhatsApp)
// Un commentaire/réponse est TOUJOURS affiché en local instantanément. Sa
// synchronisation Supabase est mise dans une file persistante (localStorage) ;
// en cas d'échec (offline / erreur / backend pas prêt) on réessaie : à
// l'événement `online`, au boot, et périodiquement tant qu'il reste des envois.
// L'UI affiche « ⏳ Envoi… » puis « Non envoyé · Réessayer » (clic = retry).
// ════════════════════════════════════════════════════════════════════════
// ⚠️ Préfixe _cmtOb* OBLIGATOIRE : `_outboxLoad`/`_outboxSave` existent déjà pour
// la file d'attente des MESSAGES (OUTBOX_KEY, plus bas) → collision de noms.
var _CMT_OUTBOX_KEY = "passio_cmt_outbox_v1";
var _cmtObTimer = null, _cmtObFlushing = false;
function _cmtObLoad() { try { return JSON.parse(localStorage.getItem(_CMT_OUTBOX_KEY) || "[]"); } catch (e) { return []; } }
function _cmtObSave(arr) { try { localStorage.setItem(_CMT_OUTBOX_KEY, JSON.stringify(arr)); } catch (e) {} }
function _cmtObStartTimer() { if (!_cmtObTimer) _cmtObTimer = setInterval(function () { if (!document.hidden) _cmtObFlush(); }, 15000); }
function _cmtObStopTimer() { if (_cmtObTimer) { clearInterval(_cmtObTimer); _cmtObTimer = null; } }
// Marque un commentaire/réponse local comme en attente d'envoi + l'ajoute à la file.
function _enqueueCommentSync(op) {
  op.opId = "ob_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  op.tries = 0; op.ts = Date.now();
  // ⚠️ L'entrée porte le COMPTE (AUTH-06, 2026-09-14) : même défaut que la
  // file des messages — `supaAddComment` écrit `author_id = MY_UID` au moment
  // de l'ENVOI, donc un brouillon de A rejoué sous B était publié par B.
  op.uid = _fileProprietaire();
  var arr = _cmtObLoad(); arr.push(op); _cmtObSave(arr);
  var found = _findCommentNode(op.threadId, op.nodeId);
  if (found && found.node) { found.node._pending = true; found.node._failed = false; }
  _cmtObStartTimer();
  _cmtObFlush();
}
// ⚠️ SRV-02 (2026-11-13) : la notification d'un commentaire part à SA
// CONFIRMATION, jamais à la mise en file. La base exige le commentaire réel
// derrière une notification `comment` ; posée en parallèle, elle arrivait avant
// lui (hors ligne : des minutes avant) et se faisait refuser. `op.notif` =
// { to, kind, text } ; la référence est le fil (`op.threadId`). L'entrée a déjà
// passé la garde du compte (AUTH-06) : c'est bien son auteur qui notifie.
function _cmtObNotifier(op) {
  try {
    var n = op && op.notif;
    if (!n || !n.to || !n.kind || typeof supaInsertNotif !== "function") return;
    supaInsertNotif(n.to, n.kind, op.threadId, n.text);
  } catch (e) {}
}
// Exécute UN envoi ; renvoie une Promise<boolean> (succès serveur).
function _cmtObRun(op) {
  try {
    if (op.type === "post_comment" && typeof supaAddComment === "function") return Promise.resolve(supaAddComment(op.threadId, op.text, op.commentId));
    if (op.type === "reply" && typeof supaCommentInteract === "function") return Promise.resolve(supaCommentInteract(op.parentId, op.threadId, "reply", op.text));
  } catch (e) {}
  return Promise.resolve(false);
}
// Un commentaire À MOI confirmé en base change de nature : il devient une
// ligne SERVEUR (`fromSupabase`) et entre dans le total exact du fil
// (`commentsTotal`, sur TOUTES les copies du post). Sans ce geste il restait
// « local » pour toujours — le gestionnaire temps réel ignore mes propres
// lignes — et, au tour suivant du filet, le total serveur (qui le compte) plus
// la ligne locale le comptaient DEUX fois (contre-revue, P1).
function _commentaireConfirme(threadId, nodeId) {
  var found = _findCommentNode(threadId, nodeId);
  if (!found || !found.node || found.node.fromSupabase) return;
  found.node.fromSupabase = true;
  // Une RÉPONSE (`comment_interactions`) n'est pas un commentaire de premier
  // niveau : le serveur ne la compte pas, `nbCommentairesPost` la compte via
  // les `replies` — l'ajouter au total la comptait deux fois (contre-revue).
  if (found.parent) return;
  var copies = (typeof allPostCopies === "function") ? allPostCopies(threadId) : [];
  var vu = new Set();
  copies.forEach(function (c) {
    if (!c || vu.has(c)) return; vu.add(c);
    if (Number.isSafeInteger(c.commentsTotal)) c.commentsTotal++;
  });
  try { _patchPostCommentCount(threadId); } catch (e) {}
}
window._commentaireConfirme = _commentaireConfirme;
function _cmtObSetStatus(threadId, nodeId, ok) {
  var found = _findCommentNode(threadId, nodeId);
  if (!found || !found.node) return;
  if (ok) { found.node._pending = false; found.node._failed = false; _commentaireConfirme(threadId, nodeId); }
  else { found.node._pending = true; found.node._failed = true; }
  if (found.thread && typeof found.thread.save === "function") { try { found.thread.save(); } catch (e) {} }
  if (typeof _refreshCommentThreadUI === "function") _refreshCommentThreadUI(threadId);
}
async function _cmtObFlush() {
  if (_cmtObFlushing) return;
  var arr = _cmtObLoad();
  if (!arr.length) { _cmtObStopTimer(); return; }
  if (typeof sessionExpiree === "function" && sessionExpiree()) return; // UXO-02 : gardée, rejouée à la reconnexion
  if (typeof navigator !== "undefined" && navigator.onLine === false) return; // hors-ligne : attendre `online`
  if (!window._supaReal) return; // backend pas encore prêt (boot) : réessai plus tard
  _cmtObFlushing = true;
  try {
    var moi = _fileProprietaire();
    for (var i = 0; i < arr.length; i++) {
      var op = arr[i];
      // Le compte d'ABORD (AUTH-06) : une entrée d'un autre compte est jetée
      // — un brouillon ne se publie pas sous une identité qui n'est pas la
      // sienne. Une entrée d'AVANT ce correctif (sans `uid`) est adoptée si son
      // commentaire est encore ici, jetée sinon (même règle que les messages).
      var etrangere = op.uid ? (op.uid !== moi) : !((_findCommentNode(op.threadId, op.nodeId) || {}).node);
      if (etrangere) {
        _cmtObSave(_cmtObLoad().filter(function (o) { return o.opId !== op.opId; }));
        try { if (typeof diagLog === "function") diagLog("cmt_outbox_autre_compte"); } catch (e) {}
        continue;
      }
      if (!op.uid && moi) { op.uid = moi; _cmtObSave(_cmtObLoad().map(function (o) { return o.opId === op.opId ? op : o; })); }
      if ((op.tries || 0) >= 8) continue; // auto-stop : le clic « Réessayer » remet tries à 0
      var ok = false;
      try { ok = await _cmtObRun(op); } catch (e) { ok = false; }
      if (ok) { _cmtObSave(_cmtObLoad().filter(function (o) { return o.opId !== op.opId; })); _cmtObSetStatus(op.threadId, op.nodeId, true); _cmtObNotifier(op); }
      else { op.tries = (op.tries || 0) + 1; _cmtObSave(_cmtObLoad().map(function (o) { return o.opId === op.opId ? op : o; })); _cmtObSetStatus(op.threadId, op.nodeId, false); }
    }
  } finally { _cmtObFlushing = false; }
  var pend = _cmtObLoad().filter(function (o) { return (o.tries || 0) < 8; });
  if (pend.length) _cmtObStartTimer(); else _cmtObStopTimer();
}
// Clic sur « Réessayer » : remet le compteur d'essais à zéro et relance la file.
function _retryComment(threadId, nodeId) {
  _cmtObSave(_cmtObLoad().map(function (o) { return (o.threadId === threadId && o.nodeId === nodeId) ? (o.tries = 0, o) : o; }));
  var found = _findCommentNode(threadId, nodeId);
  if (found && found.node) { found.node._failed = false; found.node._pending = true; }
  if (typeof _refreshCommentThreadUINow === "function") _refreshCommentThreadUINow(threadId);
  _cmtObFlush();
  return false;
}
// Statut d'envoi affiché dans la méta d'un commentaire/réponse.
function _cmtStatusHtml(threadId, node) {
  if (!node) return "";
  if (node._failed) return ' · <span class="cmt-status failed" onclick="event.stopPropagation();return _retryComment(\'' + escapeJsArg(threadId) + '\',\'' + escapeJsArg(node.id) + '\')">Non envoyé · Réessayer</span>';
  if (node._pending) return ' · <span class="cmt-status pending">Envoi…</span>';
  return "";
}
if (!window._cmtObWired) {
  window._cmtObWired = true;
  try {
    window.addEventListener("online", function () { _cmtObFlush(); });
    setTimeout(function () { _cmtObFlush(); }, 4000); // 1re tentative après le boot
  } catch (e) {}
}

// #13 — Squelettes « shimmer » pendant le chargement (façon IG/FB/LinkedIn).
function _commentSkeletonHtml(n) {
  n = n || 4; var rows = "";
  for (var i = 0; i < n; i++) {
    rows += '<div class="cmt-skel">'
      + '<div class="cmt-skel-av shimmer"></div>'
      + '<div class="cmt-skel-lines">'
      + '<div class="cmt-skel-line shimmer" style="width:' + (36 + (i * 17) % 40) + '%"></div>'
      + '<div class="cmt-skel-line shimmer" style="width:' + (68 + (i * 13) % 26) + '%"></div>'
      + '</div></div>';
  }
  return '<div class="cmt-skel-wrap" aria-hidden="true">' + rows + '</div>';
}

// FIL-C07 (audit UX/UI du 2026-11-10) : « Masquer ce commentaire » ne tenait
// que jusqu'à la relecture de la discussion (le commentaire n'était retiré que
// du tableau en mémoire). Les identifiants masqués vivent désormais dans l'état
// du COMPTE (`state.user.hiddenComments`, borné à 500), et la liste les écarte
// comme elle écarte les comptes bloqués.
var _CMT_MASQUES_MAX = 500;
function commentaireMasque(id) {
  try { return !!id && ((state.user && state.user.hiddenComments) || []).indexOf(id) > -1; } catch (e) { return false; }
}
function memoriserCommentaireMasque(id) {
  if (!id || !state.user) return;
  var l = Array.isArray(state.user.hiddenComments) ? state.user.hiddenComments : (state.user.hiddenComments = []);
  if (l.indexOf(id) < 0) {
    l.push(id);
    if (l.length > _CMT_MASQUES_MAX) l.splice(0, l.length - _CMT_MASQUES_MAX);
  }
  try { saveState(); } catch (e) {}
}

// FIL-C29 : la limite de 400 caractères se dit, à partir de 350.
function majCompteurCommentaire(champ) {
  try {
    var c = document.getElementById((champ && champ.id ? champ.id : "newComment") + "Compteur");
    if (!c || !champ) return;
    var max = Number(champ.getAttribute("maxlength")) || 400;
    var n = (champ.value || "").length;
    if (n >= max - 50) { c.hidden = false; c.textContent = n + " / " + max; c.classList.toggle("plein", n >= max); }
    else { c.hidden = true; c.textContent = ""; }
  } catch (e) {}
}

function _renderCommentsList(allComments, postId) {
  // Masquer les commentaires des utilisateurs bloqués (modération) et ceux que
  // j'ai masqués (FIL-C07).
  var _visible = (allComments || []).filter(c => !(typeof isBlocked === "function" && isBlocked(c.authorId)) && !commentaireMasque(c.id));
  // Tri Pertinents / Récents (le tableau arrive trié récent→ancien).
  window._cmtSort = window._cmtSort || {};
  var _sortMode = window._cmtSort[postId] || "recent";
  if (_sortMode === "top") {
    _visible = _visible.slice().sort(function (a, b) {
      var d = _cmtRelevance(b) - _cmtRelevance(a);
      return d !== 0 ? d : ((b.createdAt || b.at || 0) - (a.createdAt || a.at || 0));
    });
  }
  // L'épinglé du fil toujours en tête (tri stable → ordre relatif gardé). La vérité
  // du FIL décide (`_estEpingle`, RV-38), pas le drapeau d'objets qu'une page
  // serveur reconstruit ; elle se sème du drapeau tant qu'aucune lecture n'a eu lieu.
  _semerEpingleFil(postId, allComments);
  if (_visible.some(function (c) { return _estEpingle(postId, c); })) {
    _visible = _visible.slice().sort(function (a, b) { return (_estEpingle(postId, b) ? 1 : 0) - (_estEpingle(postId, a) ? 1 : 0); });
  }
  var _sortBar = _visible.length >= 2
    ? '<div class="cmt-sortbar">'
      + '<button class="cmt-sort' + (_sortMode === "top" ? " active" : "") + '" onclick="return _setCmtSort(\'' + escapeJsArg(postId) + '\',\'top\')">Pertinents</button>'
      + '<button class="cmt-sort' + (_sortMode !== "top" ? " active" : "") + '" onclick="return _setCmtSort(\'' + escapeJsArg(postId) + '\',\'recent\')">Récents</button>'
      + '</div>'
    : "";
  // Pagination : injecter 80+ commentaires d'un coup coûtait ~130ms de DOM
  // (gros lag, rejoué à chaque (ré)ouverture et interaction). On n'affiche que
  // les _LIMIT plus récents (l'array est trié récent→ancien) ; le reste via
  // "voir plus". Cap le coût de paint quel que soit le contexte (fil/IRL/CDV).
  // Pagination INCRÉMENTALE (façon FB) : on montre `shown` commentaires, +30 par
  // clic (au lieu de tout injecter d'un coup). Cap le coût de paint sur les gros
  // fils quel que soit le contexte (fil/IRL/CDV).
  var _LIMIT = 30;
  window._cmtShown = window._cmtShown || {};
  // L'épinglé lu à part (RV-38, hors des pages chargées) s'ajoute à ce qui est
  // montré, il n'y prend pas la place du 30ᵉ (contre-revue du delta, P4).
  var _aPart = _visible.filter(function (c) { return c && c._epingleGarde; }).length;
  var _shown = (window._cmtShown[postId] || _LIMIT) + _aPart;
  var _olderBtn = "";
  if (_visible.length > _shown) {
    var _remaining = _visible.length - _shown;
    var _next = Math.min(_LIMIT, _remaining);
    _olderBtn = '<button class="btn ghost block" style="margin:10px auto 2px;display:block;font-size:12px;" onclick="_showMoreComments(\'' + escapeJsArg(postId) + '\')">↓ Voir ' + _next + ' commentaires de plus'
      + (_remaining > _next ? ' · ' + _remaining + ' restants' : '') + '</button>';
    _visible = _visible.slice(0, _shown);
  }
  // Tout ce qui est chargé est affiché : s'il reste des commentaires EN BASE
  // (page suivante), proposer de les charger — c'est la pagination serveur du
  // 2026-09-21, complément de la pagination d'affichage ci-dessus.
  if (!_olderBtn) _olderBtn = _commentairesSuiteHtml(postId);
  var _listHtml = _visible.map(c => {
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
    // Seules les réactions EMOJI vont dans la pastille « 😍 N ». Les réponses texte
    // ET les GIF (réponse image, type gif_reaction OU réponse dont le texte est une
    // URL) restent en LIGNE dans la liste des réponses (demande : le GIF = un
    // commentaire, pas un compteur de réaction).
    const cAllReplies = c.replies || [];
    const cReplies = cAllReplies.filter(r => r.type !== "emoji_reaction");
    const cReactChip = _cmtReactChipHtml(postId, c);
    // Réponses REPLIÉES par défaut (façon Instagram/Facebook) : « ⌵ Voir les N
    // réponses » ; l'état ouvert/fermé est mémorisé par commentaire pour survivre
    // aux re-renders (patch/ajout de réponse).
    window._repliesExpanded = window._repliesExpanded || {};
    const cRepOpen = !!window._repliesExpanded[c.id];

    const cMine = (authorId === "me" || (typeof MY_UID !== "undefined" && authorId === MY_UID));
    const cEpingle = _estEpingle(postId, c);
    return `<div class="comment${cEpingle ? " pinned" : ""}" data-commentid="${escapeHtml(c.id)}">
      <div class="avatar sm" role="link" aria-label="Profil de ${escapeHtml(name)}" style="background:${avatarBg(_cAv)};cursor:pointer;" onclick="event.stopPropagation();closeModal();openUserProfile('${escapeJsArg(authorId)}','${escapeJsArg(cSrc)}')">${avatarInner(_cAv)}</div>
      <button class="comment-menu-btn" title="Options" aria-label="Options du commentaire" onclick="event.stopPropagation();return openCommentOptions('${escapeJsArg(postId)}','${escapeJsArg(c.id)}',${cMine ? 1 : 0}, event);"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>
      <div class="comment-body">
        ${cEpingle ? '<div class="cmt-pinned-badge">Épinglé</div>' : ""}
        <div class="comment-author" style="cursor:pointer;" onclick="event.stopPropagation();closeModal();openUserProfile('${escapeJsArg(authorId)}','${escapeJsArg(cSrc)}')">${escapeHtml(name)}</div>
        <div class="comment-text">${_commentBodyHtml(c.text || c.content || "")}</div>
        <div class="comment-meta">${fmtTime(c.createdAt || c.at)}${c.edited ? " · modifié" : ""}${typeof _cmtStatusHtml === "function" ? _cmtStatusHtml(postId, c) : ""}</div>
        <div class="comment-actions">
          <span class="comment-action ${cLiked ? "liked" : ""}" role="button" aria-label="J'aime ce commentaire — ${cLikes}" data-cmtlike="${escapeHtml(c.id)}" onclick="return likeComment('${escapeJsArg(postId)}','${escapeJsArg(c.id)}', event);">
            ${cLiked ? "❤️" : "🤍"} ${cLikes}
          </span>
          <span class="comment-action" role="button" aria-label="Répondre" onclick="return replyToComment('${escapeJsArg(postId)}','${escapeJsArg(c.id)}','${escapeJsArg(name)}', event);" title="Répondre">💬</span>
          <span class="comment-action" role="button" aria-label="Réagir" onclick="return showEmojiPickerForComment('${escapeJsArg(postId)}','${escapeJsArg(c.id)}', event);" title="Emoji & GIF">😊</span>
          <span class="cmt-chip-holder" data-cmtchip="${escapeHtml(c.id)}">${cReactChip}</span>
          ${cReplies.length > 0 ? `<span class="comment-reply-count" onclick="return toggleCommentReplies('${escapeJsArg(c.id)}', event);">${cRepOpen ? "▲ Masquer les réponses" : ("⌵ Voir " + cReplies.length + " réponse" + (cReplies.length > 1 ? "s" : ""))}</span>` : ""}
        </div>
        ${cReplies.length > 0 ? `<div class="comment-replies" id="replies-${escapeHtml(c.id)}" style="display:${cRepOpen ? "block" : "none"};">${cReplies.map(r => {
          const ru = userById(r.authorId) || { name: "?", profileEmoji: "👤", avatar: "#64748b" };
          const rSrc = r.authorId === "me" ? "me" : "seed";

          // Si c'est une réaction emoji, afficher différemment
          // ⚠️ r.text est ÉCHAPPÉ : le payload de comment_interactions est librement
          // insérable par tout compte authentifié (RLS insert user_id only) → un
          // payload HTML brut serait un XSS stocké rendu chez tous les lecteurs.
          if (r.type === "emoji_reaction") {
            const _rAv = { avatar: ru.avatar || "#64748b", profileEmoji: ru.profileEmoji || "👤", name: ru.name, photoUrl: ru.photoUrl || null };
            return `<div class="comment-reply" style="display:flex;align-items:center;gap:6px;padding:4px 0;">
              <div class="avatar xs" style="background:${avatarBg(_rAv)};flex-shrink:0;cursor:pointer;" onclick="event.stopPropagation();closeModal();openUserProfile('${escapeJsArg(r.authorId)}','${escapeJsArg(rSrc)}')">${avatarInner(_rAv)}</div>
              <div><span style="font-size:11px;color:var(--text);font-weight:600;cursor:pointer;" onclick="event.stopPropagation();closeModal();openUserProfile('${escapeJsArg(r.authorId)}','${escapeJsArg(rSrc)}')">${escapeHtml(ru.name)}</span> <span style="font-size:14px;">${escapeHtml(r.text || "")}</span></div>
            </div>`;
          }

          // Si c'est une réaction GIF — n'affiche une image QUE si le texte est une
          // vraie URL média (sinon texte échappé), même raison anti-XSS que ci-dessus.
          if (r.type === "gif_reaction") {
            const _rAv = { avatar: ru.avatar || "#64748b", profileEmoji: ru.profileEmoji || "👤", name: ru.name, photoUrl: ru.photoUrl || null };
            const _gifHtml = _looksLikeMediaUrl(r.text)
              ? `<img loading="lazy" decoding="async" src="${safeUrlAttr(r.text)}" style="width:90px;height:90px;border-radius:8px;margin-top:4px;object-fit:cover;" alt="GIF" />`
              : `<span style="font-size:14px;">${escapeHtml(r.text || "")}</span>`;
            return `<div class="comment-reply" style="display:flex;align-items:flex-start;gap:6px;padding:4px 0;">
              <div class="avatar xs" style="background:${avatarBg(_rAv)};flex-shrink:0;cursor:pointer;" onclick="event.stopPropagation();closeModal();openUserProfile('${escapeJsArg(r.authorId)}','${escapeJsArg(rSrc)}')">${avatarInner(_rAv)}</div>
              <div><span style="font-size:11px;color:var(--text);font-weight:600;cursor:pointer;" onclick="event.stopPropagation();closeModal();openUserProfile('${escapeJsArg(r.authorId)}','${escapeJsArg(rSrc)}')">${escapeHtml(ru.name)}</span><br/>
              ${_gifHtml}</div>
            </div>`;
          }

          // Réponse normale — avec sa propre action « réagir » + pastille de réactions
          const _rAvT = { avatar: ru.avatar || "#64748b", profileEmoji: ru.profileEmoji || "👤", name: ru.name, photoUrl: ru.photoUrl || null };
          const rReactChip = _cmtReactChipHtml(postId, r);
          const rLiked = (r.likedBy || []).some(x => _selfIds.indexOf(x) > -1);
          const rLikes = r.likes || 0;
          return `<div class="comment-reply" data-replyid="${escapeHtml(r.id)}" style="display:flex;align-items:flex-start;gap:6px;padding:4px 0;">
            <div class="avatar xs" style="background:${avatarBg(_rAvT)};flex-shrink:0;cursor:pointer;" onclick="event.stopPropagation();closeModal();openUserProfile('${escapeJsArg(r.authorId)}','${escapeJsArg(rSrc)}')">${avatarInner(_rAvT)}</div>
            <div style="flex:1;min-width:0;"><span class="comment-reply-author" style="font-size:11px;font-weight:600;cursor:pointer;" onclick="event.stopPropagation();closeModal();openUserProfile('${escapeJsArg(r.authorId)}','${escapeJsArg(rSrc)}')">${escapeHtml(ru.name)}</span> ${_commentBodyHtml(r.text)}
            <div class="comment-reply-actions" style="display:flex;align-items:center;gap:10px;margin-top:2px;">
              <span style="font-size:10px;color:var(--muted);">${fmtTime(r.createdAt)}${typeof _cmtStatusHtml === "function" ? _cmtStatusHtml(postId, r) : ""}</span>
              <span class="comment-action ${rLiked ? "liked" : ""}" data-cmtlike="${escapeHtml(r.id)}" style="font-size:12px;" onclick="return likeCommentNode('${escapeJsArg(postId)}','${escapeJsArg(r.id)}', event);" title="J'aime">${rLiked ? "❤️" : "🤍"} ${rLikes}</span>
              <span class="comment-action" style="font-size:12px;" onclick="return reactToReply('${escapeJsArg(postId)}','${escapeJsArg(r.id)}', event);" title="Réagir">😊</span>
              <span class="cmt-chip-holder" data-cmtchip="${escapeHtml(r.id)}">${rReactChip}</span>
            </div></div>
          </div>`;
        }).join("")}</div>` : ""}
      </div>
    </div>`;
  }).join("") + _olderBtn;
  return _sortBar + _listHtml;
}

// Déplie tous les commentaires d'un fil (retire le cap de pagination) puis re-rend.
// Affiche 30 commentaires de plus (pagination incrémentale).
function _showMoreComments(threadId) {
  window._cmtShown = window._cmtShown || {};
  window._cmtShown[threadId] = (window._cmtShown[threadId] || 30) + 30;
  if (typeof _refreshCommentThreadUINow === "function") _refreshCommentThreadUINow(threadId);
  else if (typeof _refreshCommentThreadUI === "function") _refreshCommentThreadUI(threadId);
}
// ── Pagination SERVEUR des commentaires (2026-09-21) ────────────────────────
// La discussion n'est plus téléchargée entière : `supaLoadComments` (app-08)
// rend une page des plus récents et un curseur `suite`. Ces deux helpers
// posent la page sur le post et chargent la précédente à la demande.
// Chargements en vol, HORS du post : un post de `userPosts` est persisté dans
// l'état, un drapeau qui y resterait vrai bloquerait le bouton après rechargement.
const _commentairesEnCours = new Set();
// Toutes les copies d'un post (`userPosts` ET `supabasePosts` pour une
// publication à moi, `_feedExtraPosts`, bobines…) : ce qu'on apprend d'une
// discussion s'écrit sur chacune, sinon `findPostAnywhere` (qui préfère
// `userPosts`) et la carte du fil (copie `supabasePosts`) se contredisent.
function _copiesDiscussion(postId, post) {
  var out = [];
  var vu = new Set();
  [post].concat((typeof allPostCopies === "function") ? allPostCopies(postId) : [],
    (window._feedExtraPosts || []).filter(function (p) { return p && p.id === postId; }),
    (typeof reelsState === "undefined" ? [] : (reelsState.items || [])).filter(function (p) { return p && p.id === postId; }),
    (window._visited && window._visited.posts || []).filter(function (p) { return p && p.id === postId; }))
    .forEach(function (c) { if (c && !vu.has(c)) { vu.add(c); out.push(c); } });
  return out;
}
// Le total exact connu du post : le plus grand porté par l'une de ses copies
// (`supaLoadPosts` n'écrit que la copie `supabasePosts`).
function _totalConnu(postId, post) {
  var max = null;
  _copiesDiscussion(postId, post).forEach(function (c) {
    if (Number.isSafeInteger(c.commentsTotal) && (max === null || c.commentsTotal > max)) max = c.commentsTotal;
  });
  return max;
}
function _fusionnerPageCommentaires(post, page) {
  if (!post || !Array.isArray(page)) return;
  var copies = _copiesDiscussion(post.id, post);
  var total = _totalConnu(post.id, post);
  // Garder ce qui est à moi et pas encore en base ; tout le reste vient de la page.
  // Sans total serveur (chemin d'avant : la liste entière du fil, jusqu'à 200),
  // ce que l'ancienne liste tenait du serveur est le meilleur compte connu ;
  // sans lui, une page de 30 ferait tomber « 45 » à « 30 ».
  var serveurAvant = (post.comments || []).filter(function (c) { return c && c.fromSupabase; }).length;
  var ids = new Set(page.map(function (c) { return c.id; }));
  // Une discussion DÉJÀ paginée plus loin que cette page (réouverture après
  // 20 s) garde ses pages : la page 1 y est fusionnée, le curseur ne recule pas.
  // Deux conditions de plus (contre-revue) : la page doit annoncer une SUITE
  // (sans suite, elle EST la liste entière — une ligne supprimée en base par
  // son auteur revenait sinon, et avec elle un total faux pour la session), et
  // seules les lignes PLUS ANCIENNES que la page sont gardées (une ligne dans
  // la fenêtre de la page qui n'y est plus a été supprimée).
  var dejaPlusLoin = post._commentsPagine === true && !!page.suite && serveurAvant > page.length;
  var suite = dejaPlusLoin ? (post._commentsSuite || null) : (page.suite || null);
  var plancher = page.reduce(function (min, c) { var t = c && c.createdAt; return (typeof t === "number" && t < min) ? t : min; }, Infinity);
  // L'épinglé lu à part n'est pas une page déjà chargée : il passe par `garde`, qui
  // le fait revérifier (contre-vérification de d38d2fb, P3-b : repris ici, il ne
  // l'était jamais).
  var anciennes = dejaPlusLoin ? (post.comments || []).filter(function (c) { return c && c.fromSupabase && !c._epingleGarde && !ids.has(c.id) && (c.createdAt || 0) < plancher; }) : [];
  var connues = page.length + anciennes.length;
  if (Number.isSafeInteger(total)) {
    total = suite ? Math.max(total, connues) : connues;
  } else if (suite) {
    total = Math.max(page.length, serveurAvant);
  }
  // Ce qui est à moi et en attente d'envoi ; une ligne sans drapeau ni
  // `fromSupabase` (liste persistée par l'ancien client) est périmée : la page fait foi.
  var locaux = (post.comments || []).filter(function (c) { return c && !ids.has(c.id) && commentaireEnAttente(c); });
  // ⚠️ SAUF LE DÉCOR D'UN EXEMPLE (2026-11-10). Les commentaires d'une publication
  // de démonstration (`buildSeed`, app-01) n'ont ni `fromSupabase` ni drapeau
  // d'attente : la règle ci-dessus — écrite pour la liste persistée de MES
  // publications — les prenait pour des lignes périmées. La page serveur d'un
  // exemple étant presque toujours vide, ouvrir sa discussion affichait le
  // commentaire une demi-seconde, puis « Discussion (0) · Sois le premier à
  // réagir », alors que la carte du fil annonçait « 💬 1 » avec son aperçu — et
  // que les « j'aime » posés sur ce commentaire par de vrais comptes sont en
  // base (`comment_interactions`). `state.seed` n'est jamais persisté
  // (`_leanState`) : sur un exemple, une ligne sans drapeau EST le décor, jamais
  // un reste d'ancien client. Les vrais commentaires écrits sous un exemple
  // (la page) s'y ajoutent. Verrou : `controle-general-2026-11-10.spec.js` ⑤.
  var decor = (!post.fromSupabase && typeof _ciEstExemple === "function" && _ciEstExemple(post))
    ? (post.comments || []).filter(function (c) { return c && !c.fromSupabase && !ids.has(c.id) && !commentaireEnAttente(c); })
    : [];
  // L'ÉPINGLÉ lu à part (RV-38), plus ancien que la page, quand la page annonce une
  // suite : il reste — sinon chaque réouverture le relisait par son identifiant
  // (contre-revue du delta, P3-B). Sans suite, la page est la liste entière, et
  // l'épinglé qui n'y est pas a été supprimé.
  // Gardé, il reste À VÉRIFIER : sa présence en base se revérifie à chaque page
  // relue (`_assurerCommentaireEpingle`) — supprimé, il ne doit pas rester en tête
  // (contre-vérification de 84cb6b3, D1).
  var epingle = (typeof _epingleConnue === "function") ? _epingleConnue(post.id) : undefined;
  var garde = (epingle && epingle.cid && page.suite && !ids.has(epingle.cid))
    ? (post.comments || []).filter(function (c) {
        return c && c._epingleGarde && c.id === epingle.cid && c.fromSupabase && (c.createdAt || 0) < plancher && anciennes.indexOf(c) < 0;
      })
    : [];
  garde.forEach(function (c) { c._aVerifier = true; });
  var liste = page.map(function (c) { return Object.assign({}, c, { text: c.content || c.text || "" }); })
    .concat(anciennes, garde, locaux, decor)
    .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  copies.forEach(function (c) {
    c.comments = liste;
    c._commentsSuite = suite;
    if (!dejaPlusLoin) delete c._commentsPagine;
    if (Number.isSafeInteger(total)) c.commentsTotal = total;
  });
}
function _commentairesSuiteHtml(postId) {
  var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!post || !post._commentsSuite) return "";
  // L'épinglé lu à part (RV-38) n'est pas une page chargée : il ne réduit pas ce qui reste.
  var charges = (post.comments || []).filter(function (c) { return c && c.fromSupabase && !c._epingleGarde; }).length;
  var total = _totalConnu(postId, post);
  var restants = Number.isSafeInteger(total) ? Math.max(0, total - charges) : 0;
  if (_commentairesEnCours.has(postId)) {
    return '<button class="btn ghost block" style="margin:10px auto 2px;display:block;font-size:12px;" disabled>Chargement…</button>';
  }
  return '<button class="btn ghost block" data-cmtsuite="' + escapeHtml(postId) + '" style="margin:10px auto 2px;display:block;font-size:12px;" onclick="_chargerCommentairesPrecedents(\'' + escapeJsArg(postId) + '\')">↓ Charger les commentaires précédents'
    + (restants > 0 ? ' · ' + restants + ' restants' : '') + '</button>';
}
async function _chargerCommentairesPrecedents(postId) {
  var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!post || !post._commentsSuite || _commentairesEnCours.has(postId)) return;
  if (typeof supaLoadComments !== "function" || typeof supa === "undefined" || !supa) return;
  _commentairesEnCours.add(postId);
  _refreshCommentThreadUINow(postId);
  try {
    var page = await supaLoadComments(postId, { avant: post._commentsSuite });
    if (!page) return; // erreur : on garde la liste et le curseur, le bouton reste
    // Le filet a pu REMPLACER l'objet pendant la lecture : on écrit sur ce qui
    // est en état MAINTENANT, et sur toutes ses copies.
    post = findPostAnywhere(postId) || post;
    var connus = new Set((post.comments || []).map(function (c) { return c.id; }));
    // L'épinglé lu à part que cette page apporte est désormais chargé comme les
    // autres : il n'est plus « gardé » (RV-38).
    var dansLaPage = new Set(page.map(function (c) { return c.id; }));
    (post.comments || []).forEach(function (c) {
      if (c && c._epingleGarde && dansLaPage.has(c.id)) { delete c._epingleGarde; delete c._aVerifier; }
    });
    var nouveaux = page.filter(function (c) { return !connus.has(c.id); })
      .map(function (c) { return Object.assign({}, c, { text: c.content || c.text || "" }); });
    var liste = (post.comments || []).concat(nouveaux)
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    var suite = page.suite || null;
    // Dernière page atteinte : la liste est ENTIÈRE. Un épinglé lu à part qu'aucune
    // page n'a apporté n'existe plus dans ce fil : il part, et ne compte pas
    // (contre-vérification de d38d2fb, P4-c).
    if (!suite) liste = liste.filter(function (c) { return !(c && c._epingleGarde); });
    // Dernière page : la liste est entière, le total du fil (peut-être périmé à
    // la hausse — aucun événement DELETE n'est écouté) se recale dessus.
    var total = suite ? _totalConnu(postId, post) : liste.filter(function (c) { return c && c.fromSupabase; }).length;
    _copiesDiscussion(postId, post).forEach(function (c) {
      c.comments = liste; c._commentsSuite = suite; c._commentsPagine = true;
      if (Number.isSafeInteger(total)) c.commentsTotal = total;
    });
    if (nouveaux.length && typeof hydrateCommentInteractions === "function") {
      // `id` : le FIL — sans lui, aucune épingle n'est décidée (RV-38).
      try { await hydrateCommentInteractions({ id: postId, comments: nouveaux }, { epingle: false }); } catch (e) {}
    }
    // Ce qu'on vient de charger se voit : la pagination d'affichage suit.
    window._cmtShown = window._cmtShown || {};
    window._cmtShown[postId] = Math.max(window._cmtShown[postId] || 30, post.comments.length);
  } catch (e) {
    try { diagLog("commentaires_precedents", e && e.message); } catch (_e) {}
  } finally {
    _commentairesEnCours.delete(postId);
    _refreshCommentThreadUINow(postId);
    try { _patchPostCommentCount(postId); } catch (e) {}
  }
}
// Compat : ancien point d'entrée « tout afficher ».
function _expandComments(threadId) {
  window._cmtShown = window._cmtShown || {};
  window._cmtShown[threadId] = 1e9;
  if (typeof _refreshCommentThreadUINow === "function") _refreshCommentThreadUINow(threadId);
  else if (typeof _refreshCommentThreadUI === "function") _refreshCommentThreadUI(threadId);
}

// ════════════════════════════════════════════════════════════════════════
// RÉACTIONS EMOJI SUR UN COMMENTAIRE — pastille unique « 😍 N » (fil/IRL/CDV).
// Une réaction emoji n'est PAS un commentaire : toutes les réactions d'un même
// commentaire sont agrégées en UN SEUL emoji (le plus fréquent) + le total ; un
// clic ouvre la liste de QUI a réagi (et avec quoi). Identique partout.
// ════════════════════════════════════════════════════════════════════════
// Une réaction COMPTÉE : un emoji (un GIF est une réponse, rendue en image dans
// la liste), et jamais celui d'un compte BLOQUÉ — son contenu est masqué, ses
// interactions ignorées (`isBlocked`), comme ses commentaires. SEULE autorité de
// ce qui entre dans une pastille « 😍 N » et dans la liste des réacteurs, d'une
// PUBLICATION (`_postReactItems`) comme d'un COMMENTAIRE ou d'une réponse
// (`_cmtReactions`). Filtré à l'AFFICHAGE, jamais à la lecture : la RLS laisse un
// compte bloqué réagir sur une publication publique, ses lignes entrent dans
// `comment.replies` (`supaLoadCommentInteractions`, app-08) comme dans
// `post.reactions`, et un déblocage les rend sans relecture.
// Verrou : `tests/e2e/reactions-commentaire-bloque.spec.js`.
function _reactionEmojiComptee(r) {
  return !!(r && r.type === "emoji_reaction" && !(typeof isBlocked === "function" && isBlocked(r.authorId)));
}
// `comment.replies` telle que la voit une surface qui LISTE ou COMPTE ses
// réactions emoji AVEC ses réponses, sous « N réponses » : le panneau des
// commentaires d'une bobine (`loadReelComments`, app-05) et l'aperçu des
// commentaires d'une carte du fil (`renderPostHTML`, app-02). Une réaction n'y
// reste que si elle compte (`_reactionEmojiComptee`) ; les réponses texte et les
// GIF sont des réponses, rendues telles quelles (une entrée nulle aussi, comme
// avant). La discussion, elle, ne compte aucune réaction comme une réponse.
function _reponsesComptees(replies) {
  return (replies || []).filter(function (r) { return !r || r.type !== "emoji_reaction" || _reactionEmojiComptee(r); });
}
function _cmtReactions(comment) {
  // Emojis SEULEMENT dans la pastille — les GIF sont des réponses (image inline).
  // Un compte bloqué ne compte pas : la pastille, la liste des réacteurs
  // (`openCommentReactors`) et le tri « Pertinents » (`_cmtRelevance`) lisent
  // tous ici. Le temps réel ignorait déjà son AJOUT ; la lecture, non.
  var arr = (comment && comment.replies || []).filter(_reactionEmojiComptee);
  return _dedupReactionsByAuthor(arr);
}
// Patch EN PLACE la pastille de réactions d'un commentaire/réponse (holder
// [data-cmtchip]) — évite de reconstruire tout le fil à chaque tap (perte de
// scroll, composeur de réponse ouvert détruit). Retourne false si le nœud n'est
// pas visible → l'appelant retombe sur un refresh complet.
function _patchCmtReact(threadId, nodeId) {
  var found = (typeof _findCommentNode === "function") ? _findCommentNode(threadId, nodeId) : null;
  if (!found || !found.node) return false;
  // `CSS.escape` : un identifiant est un texte choisi par un compte (E-08).
  var holders = document.querySelectorAll('[data-cmtchip="' + CSS.escape(String(nodeId)) + '"]');
  if (!holders.length) return false;
  var html = _cmtReactChipHtml(threadId, found.node);
  holders.forEach(function(h){ h.innerHTML = html; });
  return true;
}
// Patch EN PLACE le compteur « 💬 N » d'un post partout où il est affiché (carte
// du fil [data-cmtcount] + vue détail) — remplace le renderFeed() complet qui
// reconstruisait tout le fil derrière la modale à chaque commentaire (gros lag).
function _patchPostCommentCount(postId) {
  var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!post) return;
  var n = (typeof nbCommentairesPost === "function") ? nbCommentairesPost(post) : (post.comments || []).length;
  document.querySelectorAll('[data-cmtcount="' + postId + '"]').forEach(function (el) {
    peindreCommentairesPost(el, n);
  });
}
// Patch EN PLACE le bouton like d'un commentaire/réponse (holder [data-cmtlike]).
function _patchCmtLike(threadId, nodeId, pop) {
  var found = (typeof _findCommentNode === "function") ? _findCommentNode(threadId, nodeId) : null;
  if (!found || !found.node) return false;
  var els = document.querySelectorAll('[data-cmtlike="' + CSS.escape(String(nodeId)) + '"]');
  if (!els.length) return false;
  var node = found.node;
  var _selfIds = [(typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : null, (state.user && state.user.id), "me"].filter(Boolean);
  var liked = (node.likedBy || []).some(function(x){ return _selfIds.indexOf(x) > -1; });
  els.forEach(function(el){ el.classList.toggle("liked", liked); el.innerHTML = (liked ? "❤️" : "🤍") + " " + (node.likes || 0); if (pop && typeof _likePop === "function") _likePop(el); });
  return true;
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
  // _reactKey : une URL de GIF compte comme « 🎬 » (sinon l'URL brute s'affichait
  // dans la pastille) ; escapeHtml sur l'emoji retenu (payload libre → anti-XSS).
  reactions.forEach(function(r){ var e = _reactKey(r.text); counts[e] = (counts[e] || 0) + 1; });
  var top = Object.keys(counts).sort(function(a, b){ return counts[b] - counts[a]; })[0] || "❤️";
  var _selfIds = [(typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : null, (state.user && state.user.id), "me"].filter(Boolean);
  var mine = reactions.some(function(r){ return _selfIds.indexOf(r.authorId) > -1; });
  return '<span class="cmt-react-chip' + (mine ? " mine" : "") + '" title="Voir qui a réagi"'
    + ' onclick="return openCommentReactors(\'' + escapeJsArg(threadId) + '\',\'' + escapeJsArg(comment.id) + '\', event);">'
    + escapeHtml(top) + ' <b>' + reactions.length + '</b></span>';
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
    var _face = _looksLikeMediaUrl(r.text)
      ? '<img loading="lazy" src="' + safeUrlAttr(r.text) + '" style="width:30px;height:30px;border-radius:6px;object-fit:cover;"/>'
      : '<span style="font-size:18px;">' + escapeHtml(r.text || "❤️") + '</span>';
    return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">'
      + '<div class="avatar sm" style="background:' + avatarBg(_av) + ';flex-shrink:0;cursor:pointer;" onclick="event.stopPropagation();closeModal&&closeModal();openUserProfile(\'' + escapeJsArg(r.authorId) + '\',\'' + escapeJsArg(rSrc) + '\')">' + avatarInner(_av) + '</div>'
      + '<span style="flex:1;font-size:12px;color:var(--text);">' + escapeHtml(u.name) + '</span>' + _face + '</div>';
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

// Like d'un NŒUD de commentaire OU de réponse (toggle 1/personne). _findCommentNode
// localise indifféremment un commentaire de 1er niveau ou une réponse → on peut
// « aimer » une réponse comme un commentaire (avant : le like manquait sur les
// réponses). Re-render unifié pour refléter le ❤️ partout.
function likeCommentNode(threadId, nodeId, event) {
  if (event && event.stopPropagation) { event.stopPropagation(); event.preventDefault(); }
  var found = (typeof _findCommentNode === "function") ? _findCommentNode(threadId, nodeId) : null;
  if (!found || !found.node) return false;
  var node = found.node, thread = found.thread;
  if (!Array.isArray(node.likedBy)) node.likedBy = [];
  if (typeof node.likes !== "number") node.likes = 0;
  var meId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : (state.user && state.user.id) || "me";
  var already = node.likedBy.indexOf(meId) > -1;
  if (already) {
    node.likedBy = node.likedBy.filter(function(x){ return x !== meId; });
    node.likes = Math.max(0, node.likes - 1);
    if (typeof supaCommentRemoveLike === "function") supaCommentRemoveLike(nodeId);
  } else {
    node.likedBy.push(meId); node.likes += 1;
    var _ecrit = (typeof supaCommentInteract === "function") ? supaCommentInteract(nodeId, threadId, "like", "") : false;
    // Au verdict de l'écriture (SRV-02 : la base exige le j'aime réel).
    if (node.authorId && node.authorId !== meId && node.fromSupabase && typeof notifierApresEcriture === "function") {
      notifierApresEcriture(_ecrit, node.authorId, "like", threadId, "a aimé ta réponse");
    }
  }
  if (thread && typeof thread.save === "function") thread.save(); else { try { saveState(); } catch(e){} }
  // Patch en place (fluidité : pas de rebuild du fil, scroll & composeur préservés).
  if (!_patchCmtLike(threadId, nodeId, true) && typeof _refreshCommentThreadUI === "function") _refreshCommentThreadUI(threadId);
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
// UNE réaction par auteur (la PLUS RÉCENTE). Filet de sécurité central : même si
// le journal Supabase (comment_interactions, append-only) contient plusieurs
// réactions d'un même compte, la pastille n'en montre qu'UNE par personne —
// « un seul emoji par post/commentaire ». Les réactions sans authorId (anonymes,
// ex. anciens lives sans userId) sont toutes conservées.
function _dedupReactionsByAuthor(list) {
  var byAuthor = {}, order = [], anon = [];
  (list || []).forEach(function (r) {
    if (!r) return;
    var a = r.authorId;
    if (!a) { anon.push(r); return; }
    var prev = byAuthor[a];
    if (!prev) { byAuthor[a] = r; order.push(a); }
    else if ((r.createdAt || 0) >= (prev.createdAt || 0)) byAuthor[a] = r;
  });
  return order.map(function (a) { return byAuthor[a]; }).concat(anon);
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
    + escapeHtml(top) + ' <b>' + items.length + '</b></span>';
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
      ? '<img loading="lazy" src="' + safeUrlAttr(t) + '" style="width:30px;height:30px;border-radius:6px;object-fit:cover;"/>'
      : '<span style="font-size:18px;">' + escapeHtml(t || "❤️") + '</span>';
  }
  if (withAuthors) {
    rowsHtml = items.map(function(it){
      var u = (typeof userById === "function" && userById(it.authorId)) || { name: "Quelqu'un", profileEmoji: "👤", avatar: "#64748b" };
      var _av = { avatar: u.avatar || "#64748b", profileEmoji: u.profileEmoji || "👤", name: u.name, photoUrl: u.photoUrl || null };
      var rSrc = (it.authorId === "me" || (typeof MY_UID !== "undefined" && it.authorId === MY_UID)) ? "me" : "seed";
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">'
        + '<div class="avatar sm" style="background:' + avatarBg(_av) + ';flex-shrink:0;cursor:pointer;" onclick="event.stopPropagation();closeModal&&closeModal();openUserProfile(\'' + escapeJsArg(it.authorId) + '\',\'' + escapeJsArg(rSrc) + '\')">' + avatarInner(_av) + '</div>'
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
  // La pastille de réactions ne compte QUE les emojis. Un GIF n'est PAS une
  // réaction : il est posté en COMMENTAIRE (rendu en image inline), jamais dans
  // le compteur (demande utilisateur 2026-07-07).
  var arr = Array.isArray(post.reactions) ? post.reactions : [];
  // Un compte BLOQUÉ ne compte pas : son contenu est masqué et ses interactions
  // ignorées (`isBlocked`), comme ses commentaires. Filtré ICI, à l'affichage,
  // pour toutes les copies : depuis RV-39, ma copie `userPosts` reçoit aussi ce
  // que rend le serveur, et la RLS laisse un compte bloqué réagir à une
  // publication publique (contre-revue du lot). La règle est celle des
  // commentaires, écrite UNE fois (`_reactionEmojiComptee`).
  var reacts = arr.filter(_reactionEmojiComptee);
  return _dedupReactionsByAuthor(reacts).map(function(r){ return { authorId: r.authorId, text: r.text }; });
}
function _postReactChipHtml(postId) {
  // ⚠️ `postId` entre dans une chaîne JS, elle-même dans un attribut onclick :
  // c'est le contexte d'`escapeJsArg`, pas d'`escapeHtml` (le HTML décode
  // `&#39;` AVANT le parse JS, l'apostrophe revient). En prod `posts.id` est de
  // type TEXT : un compte authentifié CHOISIT la valeur qu'il insère. Le
  // troisième appelant de ce même helper (app-03:2098, réactions d'étape)
  // échappait déjà — ces deux-ci sont les survivants.
  return _reactionItemsChipHtml(_postReactItems(postId), "return openPostReactors('" + escapeJsArg(postId) + "', event);");
}
function openPostReactors(postId, event) {
  return _openReactorsList(_postReactItems(postId), event);
}
// ⚠️ `_liveReactItems`, `_liveReactChipHtml` et `openLiveReactors` — la pastille
// de réactions d'un live CDV — ont été RETIRÉES avec le Carnet de voyage
// (ADR-011 §5). Elles lisaient `getCdvLives()`, qui n'existe plus, et aucune
// surface ne les peignait. La pastille des COMMENTAIRES et celle des POSTS,
// juste au-dessus, partagent le même moteur (`_reactionItemsChipHtml`) et sont
// intactes.

async function openComments(postId) {
  // ⚠️ PAS d'entrée d'historique ici : le fil s'affiche dans une modale, et
  // `openModal` en pose déjà une (que `closeModal` reprend). En poser une
  // seconde laissait une entrée orpheline — un appui « retour » mort par fil
  // de commentaires ouvert.
  window._openCommentsPostId = postId; // suivi pour le temps réel des interactions

  let post = findPostAnywhere(postId);
  if (!post) return;

  // Afficher immédiatement avec les commentaires locaux
  let localComments = (post.comments || []);
  // Décide MAINTENANT si on va charger depuis Supabase (sinon squelette éternel
  // en rouvrant un fil vide déjà chargé < 20 s).
  window._cmtThreadLoadedAt = window._cmtThreadLoadedAt || {};
  var _fresh = (Date.now() - (window._cmtThreadLoadedAt[postId] || 0)) < 20000;
  var _willLoad = !_fresh && typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID;
  var _emptyStateHtml = '<div class="empty"><div class="empty-icon">💭</div><div class="empty-title">Sois le premier à réagir</div></div>';
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">Discussion</div>
    <div id="commentsBox" class="cmt-fil-liste" aria-live="polite">
      ${localComments.length ? _renderCommentsList(localComments, postId) : (_willLoad ? _commentSkeletonHtml(4) : _emptyStateHtml)}
    </div>
    <textarea class="textarea" id="newComment" aria-label="Écrire un commentaire" placeholder="Ajoute un commentaire…" maxlength="400" rows="1" style="min-height:44px;" oninput="autoResizeTextarea(this);_syncComposerSendState(this);majCompteurCommentaire(this)" onkeydown="if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();submitComment('${escapeJsArg(postId)}');}"></textarea>
    <div class="cmt-compteur" id="newCommentCompteur" aria-live="polite" hidden></div>
    <div style="display:flex;align-items:center;gap:6px;margin-top:8px;">
      ${_cmtComposerToolsHtml("newComment", "submitComment", postId)}
      <button class="btn primary cmt-publier" style="flex:1;" onclick="submitComment('${escapeJsArg(postId)}')">Publier</button>
    </div>
  `);
  // Bouton d'envoi désactivé tant que le champ est vide (état initial).
  var _nc = document.getElementById("newComment");
  if (_nc) _syncComposerSendState(_nc);
  // Le sujet privé de cette discussion (`fil:<id>`, app-08) : la demande part
  // AVANT la lecture ci-dessous, qui finit donc le plus souvent après lui.
  try { if (typeof _filsRtReconcilier === "function") _filsRtReconcilier(); } catch (e) {}

  // Charger les vrais commentaires Supabase — SAUF si ce fil a déjà été chargé il
  // y a moins de 20 s : rouvrir la même discussion est alors INSTANTANÉ, sans
  // re-fetch réseau (~300-700 ms) ni re-render. C'est le correctif « ouverture
  // fluide ». Pendant ces 20 s, le temps réel tient la discussion à jour : un
  // AJOUT par sa charge, un RETRAIT par la ligne entière. Depuis le 2026-11-09,
  // c'est le sujet privé `fil:<id>` de la discussion qui écoute, et il reste
  // joint 20 s après la fermeture : le cache et lui ont la même durée. Un
  // événement tombé pendant que le socket dormait est relu au réveil
  // (`_rtRattraper`) ; un sujet en panne fait relire la discussion.
  if (_willLoad) {
    try {
      // Première page (les plus récents) ; « précédents » charge la suite.
      const supaComments = await supaLoadComments(postId);
      if (window._openCommentsPostId !== postId) return; // l'utilisateur a fermé/changé entre-temps
      post = findPostAnywhere(postId) || post; // le filet a pu remplacer l'objet pendant la lecture
      if (!supaComments) {
        // Erreur de lecture : on garde ce qu'on a (les aperçus), jamais le
        // squelette — c'est le défaut « squelette éternel » déjà payé une fois.
        try { diagLog("commentaires_lecture", "page impossible à charger, aperçus conservés"); } catch (e) {}
        const boxErr = document.getElementById("commentsBox");
        if (boxErr) _setThreadHtml(boxErr, localComments.length ? _renderCommentsList(localComments, postId) : _emptyStateHtml);
      } else if (supaComments.length >= 0) {
        // Merge : garder locaux non-Supabase + Supabase
        _fusionnerPageCommentaires(post, supaComments);
        // Hydrate les interactions cross-compte (likes/réponses/emojis) puis re-rend.
        if (typeof hydrateCommentInteractions === "function") {
          try { await hydrateCommentInteractions(post); } catch(e) {}
        }
        window._cmtThreadLoadedAt[postId] = Date.now();
        if (window._openCommentsPostId !== postId) return;
        const box = document.getElementById("commentsBox");
        if (box) {
          _setThreadHtml(box, post.comments.length
            ? _renderCommentsList(post.comments, postId)
            : '<div class="empty"><div class="empty-icon">💭</div><div class="empty-title">Sois le premier à réagir</div></div>');
        }
        // Mettre à jour le titre
        const title = document.querySelector(".modal-title");
        if (title) title.textContent = `Discussion (${nbCommentairesPost(post)})`;
      }
    } catch(e) {}
  } else if (typeof supa === "undefined" || !supa || typeof MY_UID === "undefined" || !MY_UID) {
    // Pas de Supabase : afficher les locaux
    const box = document.getElementById("commentsBox");
    if (box && localComments.length === 0) {
      box.innerHTML = '<div class="empty"><div class="empty-icon">💭</div><div class="empty-title">Sois le premier à réagir</div></div>';
    }
  }
}

// Relit la discussion d'une publication À L'ÉCRAN — la première page, ses
// interactions — et la repeint partout où elle est affichée (modale, détail,
// compteur de la carte). C'est la relecture du sujet `fil:<id>` (app-08) :
// rattrapage après l'abonnement ou le réveil du socket, repli quand le sujet
// est en panne. Lève si la page n'a pas pu être lue (une panne n'est pas un
// calme : l'appelant garde sa cadence vive). `opts.epingle === false` : ne pas
// relire l'épingle (`hydrateCommentInteractions`).
async function _relireDiscussionPublication(postId, opts) {
  var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!post || typeof supaLoadComments !== "function") return false;
  var page = await supaLoadComments(postId);
  if (!page) throw new Error("page de commentaires illisible");
  post = findPostAnywhere(postId) || post;   // le filet a pu remplacer l'objet pendant la lecture
  // ⚠️ LA PAGE EST UN INSTANTANÉ, L'ÉCRAN A PU AVANCER PENDANT SA LECTURE
  // (relecture adversariale du lot). Deux choses qu'elle ne peut pas savoir :
  //   · un commentaire arrivé PENDANT la lecture — reçu par le sujet, ou le mien
  //     tout juste confirmé —, plus récent que sa ligne la plus récente : il
  //     reste (la déduplication empêcherait sa seconde copie de le remettre) ;
  //   · les interactions déjà appliquées : la fusion rebâtit chaque commentaire
  //     depuis la page, et une hydratation en ÉCHEC repeindrait « 🤍 0 » ; on les
  //     reporte alors par identifiant (réussie, elle dit la vérité — y compris
  //     « plus rien » pour un commentaire sans ligne).
  var avant = (post.comments || []).slice();
  var dansLaPage = new Set(page.map(function (c) { return c.id; }));
  var plusRecent = page.reduce(function (m, c) { return Math.max(m, (c && c.createdAt) || 0); }, 0);
  var arrives = avant.filter(function (c) {
    return c && c.fromSupabase && !c._epingleGarde && !dansLaPage.has(c.id) && (c.createdAt || 0) > plusRecent;
  });
  var connus = new Map(avant.filter(function (c) { return c && c.id; }).map(function (c) { return [c.id, c]; }));
  _fusionnerPageCommentaires(post, page);
  post = findPostAnywhere(postId) || post;
  if (arrives.length) {
    var liste = post.comments || (post.comments = []);
    var ajoutes = 0;
    arrives.forEach(function (c) { if (!liste.some(function (x) { return x.id === c.id; })) { liste.push(c); ajoutes++; } });
    liste.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    if (ajoutes) _copiesDiscussion(postId, post).forEach(function (c) { if (Number.isSafeInteger(c.commentsTotal)) c.commentsTotal += ajoutes; });
  }
  var hydratee = false;
  if (typeof hydrateCommentInteractions === "function") {
    try { hydratee = (await hydrateCommentInteractions(post, opts)) === true; } catch (e) {}
  }
  if (!hydratee) {
    (post.comments || []).forEach(function (c) {
      var v = connus.get(c.id);
      if (!v || v === c) return;
      ["likes", "likedBy", "replies", "emojis"].forEach(function (k) { if (c[k] === undefined && v[k] !== undefined) c[k] = v[k]; });
    });
  }
  window._cmtThreadLoadedAt = window._cmtThreadLoadedAt || {};
  window._cmtThreadLoadedAt[postId] = Date.now();
  if (typeof _refreshCommentThreadUINow === "function") _refreshCommentThreadUINow(postId);
  try { _patchPostCommentCount(postId); } catch (e) {}
  return true;
}
window._relireDiscussionPublication = _relireDiscussionPublication;

function submitComment(postId) {
  // Mode invité (première visite) : cette action engage le compte. Le gate
  // EXPLIQUE l'action puis propose la création de compte ; il ne rejoue jamais
  // l'action après coup. Rend `true` — donc inerte — hors mode invité.
  if (window.requireAuthentication && !requireAuthentication("commenter")) return;
  const text = $("#newComment").value.trim();
  if (text.length < 2) { toast("Écris au moins 2 caractères"); return; }
  let post = findPostAnywhere(postId);
  if (!post) return;
  try { window.tel && tel.action("comment_post", { postId: postId, len: text.length }); } catch (e) {}
  // Le flux « comment_post » s'ouvre et se ferme dans `supaAddComment`, au
  // moment de l'écriture réelle (la file des commentaires peut l'envoyer plus
  // tard, hors ligne). Ouvert ICI, son identifiant était jeté et aucun verdict
  // ne le fermait (2026-11-06, contrats-actions.js).
  if (!post.comments) post.comments = [];
  const realAuthorId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  const p = currentProfile();
  const _cid = "c_" + uid(); // id aligné local ⇄ Supabase (cf. supaAddComment)
  post.comments.unshift({
    id: _cid, authorId: realAuthorId,
    authorName: p?.name || state.user.name || "Moi",
    authorEmoji: p?.emoji || "✨",
    text, content: text, createdAt: Date.now(),
    _pending: true, // en attente d'envoi : compté par nbCommentairesPost jusqu'à confirmation
  });
  // Ensure author is in seed.users for userById()
  const meEntry = { id: realAuthorId, name: p?.name || state.user.name || "Moi", profileEmoji: p?.emoji || "✨", avatar: p?.color || "#8b5cf6" };
  state.seed.users = state.seed.users.filter(u => u.id !== realAuthorId);
  state.seed.users.push(meEntry);
  // Sync avec Supabase — via la FILE D'ATTENTE (#14) : envoi + réessai auto si
  // offline/erreur, avec statut « Envoi… / Non envoyé » sur le commentaire.
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    // Notifier l'auteur du post — à la CONFIRMATION du commentaire (SRV-02) : la
    // notification voyage avec l'envoi dans la file, qui la pose au succès.
    const commentedPost = findPostAnywhere(postId);
    const _notifCmt = (commentedPost && commentedPost.authorId && commentedPost.authorId !== MY_UID && commentedPost.fromSupabase)
      ? { to: commentedPost.authorId, kind: "comment", text: "a commenté ton post" } : null;
    if (typeof _enqueueCommentSync === "function") _enqueueCommentSync({ type: "post_comment", threadId: postId, commentId: _cid, nodeId: _cid, text: text, notif: _notifCmt });
    else {
      const _ecrit = Promise.resolve(supaAddComment(postId, text, _cid));
      _ecrit.then(function (ok) { if (ok) _commentaireConfirme(postId, _cid); }).catch(function () {});
      if (_notifCmt) notifierApresEcriture(_ecrit, _notifCmt.to, _notifCmt.kind, postId, _notifCmt.text);
    }
    // ASTRA-24 : les mentions partent depuis `supaAddComment`, une fois le commentaire en base.
  }
  // FLUIDITÉ (façon Instagram/Facebook) : NE PAS fermer la discussion. On vide le
  // champ, on ré-affiche le fil (rapide, scroll préservé) avec le nouveau
  // commentaire mis en avant, et on met à jour le compteur du titre. Le compteur
  // 💬 de la carte du fil est rafraîchi en arrière-plan (la modale reste au-dessus).
  var _ta = document.getElementById("newComment");
  if (_ta) { _ta.value = ""; try { autoResizeTextarea(_ta); } catch (e) {} }
  if (typeof _refreshCommentThreadUINow === "function") _refreshCommentThreadUINow(postId);
  var _box = document.getElementById("commentsBox");
  if (_box) { _box.scrollTop = 0; _flashNewComment(_box, _cid); } // nouveau = en tête (unshift)
  var _tt = document.querySelector(".modal-title");
  if (_tt) _tt.textContent = "Discussion · " + nbCommentairesPost(post);
  if (typeof _syncComposerSendState === "function") _syncComposerSendState(_ta);
  // Compteur 💬 de la carte/du détail patché EN PLACE (fini le renderFeed complet
  // derrière la modale : ~100 ms de rebuild du fil à CHAQUE commentaire publié).
  try { _patchPostCommentCount(postId); } catch (e) {}
}

// Active/désactive le bouton « Publier » selon le contenu du champ (façon IG/FB :
// impossible d'envoyer un commentaire vide). `ta` = le textarea du composeur ; le
// bouton d'envoi est le .btn.primary de la rangée d'outils qui suit le champ.
function _syncComposerSendState(ta) {
  if (!ta) return;
  try {
    var tools = ta.nextElementSibling;
    var send = tools && tools.querySelector ? tools.querySelector(".btn.primary") : null;
    if (!send) return;
    var empty = !ta.value.trim();
    send.disabled = empty;
    send.style.opacity = empty ? "0.45" : "1";
    send.style.pointerEvents = empty ? "none" : "auto";
  } catch (e) {}
}

// Met brièvement en avant le commentaire fraîchement inséré (feedback optimiste).
function _flashNewComment(box, id) {
  try {
    var el = box.querySelector('[data-commentid="' + id + '"]');
    if (!el) return;
    el.style.animation = "fadeIn .35s ease";
    el.style.background = "rgba(124,58,237,0.12)";
    el.style.borderRadius = "12px";
    setTimeout(function () { el.style.transition = "background .8s ease"; el.style.background = "transparent"; }, 550);
  } catch (e) {}
}

// ════════════════════════════════════════════════════════════════════════
// R37 — UN RETRAIT D'INTERACTION SE VOIT EN DIRECT (2026-11-05)
// ────────────────────────────────────────────────────────────────────────
// Un DELETE de `comment_interactions` n'apporte QUE `{ id }`, et le client n'y
// peut rien : `realtime.apply_rls` (code de production) réduit l'ancienne ligne
// d'un DELETE à la clé primaire dès que la RLS est active (« we can't secure
// deletes so filter to pkey »), avant R25 comme après. Le gestionnaire d'avant
// passait cette charge à `_applyCommentInteractionEvent`, qui sort sur
// `!r.comment_id` : AUCUN retrait d'un autre compte (like, emoji, GIF,
// réaction de publication) ne s'affichait en direct. Il attendait la
// réouverture de la discussion (20 s au moins) ou le rechargement.
//
// ⚠️ JAMAIS « REPLICA IDENTITY FULL » POUR Y REMÉDIER : la charge porterait la
// ligne entière, mais un filtre `user_id=eq.<victime>` reconnaîtrait alors
// chaque effacement de la victime. C'est l'oracle que R25 a fermé, et la gate
// `audit-identite-replication` le refuse.
//
// LE REMÈDE EST UN INDEX, PAS UNE RELECTURE. Chaque ligne que cet appareil a
// LUE (`supaLoadCommentInteractions`, le repli du fil) ou REÇUE (un INSERT
// appliqué) y est notée sous son identifiant, avec sa cible, son compte, son
// genre et sa charge. Un DELETE se résout alors ici : zéro requête, et il ne
// touche que ce que l'appareil a vu.
// ⚠️ « RELIRE LA DISCUSSION OUVERTE À CHAQUE DELETE » ÉTAIT L'AUTRE PISTE, ET
// ELLE AMPLIFIE. La suppression part à TOUS les abonnés (aucune RLS sur un
// DELETE), donc chaque effacement, n'importe où, ferait relire leur discussion
// à tous les connectés qui en ont une ouverte : c'est le motif de la fiche « le
// mur, c'est l'amplification ». Elle laissait aussi la pastille des
// publications de côté, puisque celle-ci n'appartient pas à la discussion.
// ⚠️ LE TROU QUE L'INDEX NE BOUCHE PAS SEUL : `fil_compteurs` (la lecture du
// fil) rend les réactions d'une publication SANS leur identifiant. Un DELETE
// inconnu déclenche donc UNE lecture coalescée des identifiants, limitée aux
// publications À L'ÉCRAN dont une réaction d'autrui n'a pas encore le sien
// (`_ciVerifierReactionsPost`). Une réaction lue une fois garde son
// identifiant : à la lecture suivante du fil, sa clé naturelle le retrouve
// (`_ciRetrouverId`). Le coût suit donc ce que l'écran montre de NEUF, jamais
// le débit des suppressions.
// Verrous : `tests/e2e/retrait-interactions-direct.spec.js` (navigateur, rien
// n'est écrit) et `tests/e2e/retrait-interactions-reel.spec.js` (deux vrais
// comptes, staging). Fiche : `docs/journal/capacite-perf-realtime.md`, « 🧹 R37 ».
// ⚠️ LA CONTRE-REVUE DU LOT (2026-11-05, `audit-passio`, quatre cas reproduits)
// a trouvé deux trous que ce bloc ferme, et ils se ressemblent : ① un DELETE
// reçu PENDANT une lecture dont l'instantané le précède — la réponse périmée
// réindexait la ligne morte et rendait son `ci` à l'entrée, et plus rien ne la
// jugeait ; d'où les PIERRES TOMBALES (`_ciTombes`) : tout DELETE reçu, connu ou
// non, y est noté deux minutes, l'index le refuse et les lectures écartent ses
// lignes. ② Une réponse tronquée apprenait une partie des identifiants et
// laissait les autres sans `ci` : chaque DELETE inconnu relisait les mêmes 1 000
// lignes, sans fin ; d'où la borne en lignes ATTENDUES (on ne demande que ce qui
// tient largement sous la limite) et la réponse tronquée traitée comme un échec.
const CI_INDEX_MAX = 5000;
const _ciIndex = new Map();   // identifiant → { id, comment_id, post_id, user_id, kind, payload, created_at }
const _ciParCle = new Map();  // clé naturelle → identifiant (réactions venues de fil_compteurs, sans id)
const CI_TOMBES_MAX = 2000;
const CI_TOMBES_TTL_MS = 120000;
const _ciTombes = new Map();  // identifiant d'une ligne supprimée → instant de réception du DELETE
window._ciStats = { indexees: 0, retraitsAppliques: 0, inconnues: 0, verifications: 0, tombesEcartees: 0 };

function _ciEstMoi(uid) {
  if (!uid) return false;
  if (uid === "me") return true;
  if (typeof MY_UID !== "undefined" && MY_UID && uid === MY_UID) return true;
  return !!(state.user && state.user.id && uid === state.user.id);
}
// Clé naturelle d'une ligne : ce que `fil_compteurs` rend, faute d'identifiant.
// L'instant passe par `supaTs` : REST écrit `…+00:00`, le temps réel `… +00`.
function _ciCle(r) {
  if (!r || !r.comment_id || !r.user_id || !r.kind || r.created_at == null || r.created_at === "") return null;
  return [r.comment_id, r.user_id, r.kind, r.payload == null ? "" : String(r.payload), supaTs(r.created_at)].join("\u0001");
}
function _ciOublier(id) {
  var e = _ciIndex.get(id);
  if (!e) return null;
  _ciIndex.delete(id);
  var k = _ciCle(e);
  if (k && _ciParCle.get(k) === id) _ciParCle.delete(k);
  return e;
}
// Pierres tombales : bornées en nombre ET en âge (une lecture ne reste pas en
// vol deux minutes ; au-delà, la ligne n'existe de toute façon plus en base).
function _ciNoterTombe(id) {
  var maintenant = Date.now();
  _ciTombes.delete(id);
  _ciTombes.set(id, maintenant);
  // Ordre d'insertion : les plus anciennes d'abord.
  for (var it = _ciTombes.entries(), e = it.next(); !e.done; e = it.next()) {
    if (_ciTombes.size <= CI_TOMBES_MAX && maintenant - e.value[1] < CI_TOMBES_TTL_MS) break;
    _ciTombes.delete(e.value[0]);
  }
}
function _ciEstTombee(id) {
  if (!id || !_ciTombes.size) return false;
  var t = _ciTombes.get(id);
  if (t == null) return false;
  if (Date.now() - t >= CI_TOMBES_TTL_MS) { _ciTombes.delete(id); return false; }
  return true;
}
// Pierres tombales par CLÉ NATURELLE, pour les seules réactions de publication
// (RV-39, contre-revue) : `fil_compteurs` rend ces lignes SANS identifiant, et un
// DELETE reçu pendant sa lecture faisait revenir la réaction — `_ciOublier` venait
// d'effacer la clé qui l'aurait reconnue. Posées quand un retrait est résolu (par
// l'index, ou par la recherche à l'écran), consultées en construisant la copie
// serveur (`supaLoadPosts`). Mêmes bornes que les pierres par identifiant.
const _ciTombesCle = new Map();   // clé naturelle (`_ciCle`) → instant du retrait
function _ciNoterTombeCle(k) {
  if (!k) return;
  var maintenant = Date.now();
  _ciTombesCle.delete(k);
  _ciTombesCle.set(k, maintenant);
  for (var it = _ciTombesCle.entries(), e = it.next(); !e.done; e = it.next()) {
    if (_ciTombesCle.size <= CI_TOMBES_MAX && maintenant - e.value[1] < CI_TOMBES_TTL_MS) break;
    _ciTombesCle.delete(e.value[0]);
  }
}
// La clé d'une entrée de réaction (forme client) portée par la publication `postId`.
function _ciCleEntree(postId, x) {
  var kind = x && (x.type === "emoji_reaction" ? "emoji" : (x.type === "gif_reaction" ? "gif" : null));
  return kind ? _ciCle({ comment_id: postId, user_id: x.authorId, kind: kind, payload: x.text, created_at: x.createdAt }) : null;
}
// Cette réaction de publication, telle que la rend `fil_compteurs` (`x` : user_id,
// kind, payload, created_at), a-t-elle été retirée il y a moins de deux minutes ?
function _ciReactionPostTombee(postId, x) {
  if (!_ciTombesCle.size || !x) return false;
  var k = _ciCle({ comment_id: postId, user_id: x.user_id, kind: x.kind, payload: x.payload, created_at: x.created_at });
  var t = k ? _ciTombesCle.get(k) : null;
  if (t == null) return false;
  if (Date.now() - t >= CI_TOMBES_TTL_MS) { _ciTombesCle.delete(k); return false; }
  window._ciStats.tombesEcartees++;
  return true;
}
// Les lignes d'une lecture, sans celles qu'un DELETE déjà reçu a retirées.
function _ciSansTombees(lignes) {
  if (!Array.isArray(lignes) || !_ciTombes.size) return lignes;
  var gardees = lignes.filter(function (l) { return !(l && _ciEstTombee(l.id)); });
  window._ciStats.tombesEcartees += lignes.length - gardees.length;
  return gardees;
}
// Note une ligne LUE ou REÇUE. Borné (FIFO) : une entrée évincée coûte au pire
// un retrait qui attendra la réouverture, comme avant ce lot.
function _ciIndexer(r) {
  try {
    if (!r || typeof r.id !== "string" || !r.id || !r.comment_id) return;
    if (_ciEstTombee(r.id)) return;   // une réponse périmée ne ressuscite pas une ligne
    var e = { id: r.id, comment_id: r.comment_id, post_id: r.post_id || null, user_id: r.user_id || null,
      kind: r.kind || null, payload: r.payload == null ? null : r.payload, created_at: r.created_at == null ? null : r.created_at };
    _ciOublier(e.id);
    _ciIndex.set(e.id, e);
    var k = _ciCle(e);
    if (k) _ciParCle.set(k, e.id);
    window._ciStats.indexees++;
    while (_ciIndex.size > CI_INDEX_MAX) _ciOublier(_ciIndex.keys().next().value);
  } catch (err) { try { diagLog("ci_index : " + (err && err.message)); } catch (_e) {} }
}
// L'identifiant d'une ligne rendue sans lui (`fil_compteurs`), si cet appareil
// l'a déjà lue ou reçue ; sinon null.
function _ciRetrouverId(r) {
  var k = _ciCle(r);
  return k ? (_ciParCle.get(k) || null) : null;
}
// Cette entrée locale (réponse, réaction de commentaire ou de publication)
// est-elle la ligne `r` ? Par l'identifiant d'abord ; à défaut (entrée d'avant
// ce lot, ou rendue sans lui), par la clé naturelle. `type` : le genre d'entrée
// attendu (`emoji_reaction`, `gif_reaction`), ou null pour une réponse.
function _ciMemeLigne(x, r, type) {
  if (!x || !r) return false;
  if (x.ci) return x.ci === r.id;
  if (type ? x.type !== type : (x.type === "emoji_reaction" || x.type === "gif_reaction")) return false;
  if (x.authorId !== r.user_id) return false;
  if (String(x.text == null ? "" : x.text) !== String(r.payload == null ? "" : r.payload)) return false;
  return r.created_at != null && r.created_at !== "" && Number(x.createdAt) === supaTs(r.created_at);
}
function _ciTypeEntree(kind) {
  return kind === "emoji" ? "emoji_reaction" : (kind === "gif" ? "gif_reaction" : null);
}
// Retire, EN PLACE, les entrées de `arr` qui sont la ligne `r`. Rend leur nombre.
function _ciRetirerDe(arr, r, type) {
  if (!Array.isArray(arr)) return 0;
  var n = 0;
  for (var i = arr.length - 1; i >= 0; i--) {
    if (_ciMemeLigne(arr[i], r, type)) { arr.splice(i, 1); n++; }
  }
  return n;
}
// Un exemple du fil (démonstration) : des réactions, aucune ligne en base. Il
// ne doit JAMAIS faire lire quoi que ce soit. ⚠️ Pas `fromSupabase !== true` :
// la copie `userPosts` d'une publication à moi ne le porte pas, et mes
// publications seraient sorties du rattrapage (contre-revue du lot).
function _ciEstExemple(p) {
  if (!p) return true;
  if (p._source === "seed") return true;
  return !!(state.seed && Array.isArray(state.seed.posts) && state.seed.posts.indexOf(p) !== -1);
}

// Une réaction de publication À L'ÉCRAN qui porte déjà son identifiant sans
// être dans l'index : l'index ne vit qu'en mémoire, mais l'entrée a pu être
// persistée par une session précédente (une publication à moi, dans
// `userPosts`). On la retire de toutes les copies. Jamais une entrée à moi :
// ce que j'ai fait ici est déjà appliqué, comme pour un ajout. Les identifiants
// d'une rafale sont balayés ENSEMBLE (`_ciBalayerEcranPlusTard`) : un DELETE
// inconnu de toute la base ne paie pas chacun son balayage.
function _ciRetirerParCiAffiche(ids) {
  var cherches = new Set(ids || []), vus = {}, n = 0;
  if (!cherches.size) return false;
  try {
    document.querySelectorAll("[data-postchip]").forEach(function (h) {
      var pid = h.getAttribute("data-postchip");
      if (!pid || vus[pid]) return;
      vus[pid] = 1;
      var ici = 0;
      _copiesDiscussion(pid, null).forEach(function (p) {
        if (!p || !Array.isArray(p.reactions)) return;
        for (var i = p.reactions.length - 1; i >= 0; i--) {
          var x = p.reactions[i];
          if (x && x.ci && cherches.has(x.ci) && !_ciEstMoi(x.authorId)) {
            _ciNoterTombeCle(_ciCleEntree(pid, x));   // une lecture en vol ne la ramène pas (RV-39)
            p.reactions.splice(i, 1); ici++;
          }
        }
      });
      if (ici) { n += ici; if (typeof updatePostReactionsUI === "function") updatePostReactionsUI(pid); }
    });
    if (n) { window._ciStats.retraitsAppliques += n; try { saveState(); } catch (e) {} }
  } catch (e) { try { diagLog("ci_retrait_ecran : " + (e && e.message)); } catch (_e) {} }
  return n > 0;
}
const CI_ECRAN_DELAI_MS = 100;
const CI_INCONNUES_MAX = 2000;
const _ciInconnues = new Set();   // DELETE hors de l'index, en attente du balayage de l'écran
var _ciEcranMinuteur = null;
function _ciBalayerEcranPlusTard() {
  // Masquée : la page ne peint rien, le retour s'en charge (`_ciRattraper`).
  if (_ciEcranMinuteur || document.hidden) return;
  _ciEcranMinuteur = setTimeout(function () {
    _ciEcranMinuteur = null;
    var ids = Array.from(_ciInconnues);
    _ciInconnues.clear();
    if (ids.length) _ciRetirerParCiAffiche(ids);
  }, CI_ECRAN_DELAI_MS);
}

// Gestionnaire DELETE de `comment_interactions` (app-08, `_rtInteractionRetiree`).
// Par un sujet privé (`fil:<id>`, `user:<auteur>`, 2026-11-09), le serveur
// pousse la LIGNE ENTIÈRE : à défaut d'index, c'est elle qui décide — sans
// lecture des identifiants. `{ id }` seul (l'ancienne charge `postgres_changes`,
// R37, retirée avec la publication) reste accepté : la ligne est retrouvée dans
// l'index.
function _commentInteractionRetiree(old) {
  try {
    var id = old && typeof old.id === "string" ? old.id : null;
    if (id) _ciNoterTombe(id);
    var r = id ? _ciOublier(id) : null;
    if (!r && old && old.comment_id && old.kind) {
      r = { id: id, comment_id: old.comment_id, post_id: old.post_id || null, user_id: old.user_id || null,
        kind: old.kind, payload: old.payload == null ? null : old.payload, created_at: old.created_at == null ? null : old.created_at };
    }
    if (r) {
      // Une réaction de PUBLICATION : `fil_compteurs` la rendrait sans `id`, et
      // la pierre par identifiant ne la reconnaîtrait pas (RV-39).
      if (r.comment_id === r.post_id && _ciTypeEntree(r.kind)) _ciNoterTombeCle(_ciCle(r));
      _applyCommentInteractionEvent(r, "remove");
      return;
    }
    // Hors de l'index : une entrée persistée qui porte son identifiant (le
    // balayage de l'écran), ou — seule autre possibilité à l'écran — une
    // réaction de publication venue de `fil_compteurs`, qui ne l'a pas (la
    // lecture des identifiants, qui ne part que s'il en reste une).
    window._ciStats.inconnues++;
    if (id) {
      _ciInconnues.delete(id);
      _ciInconnues.add(id);
      while (_ciInconnues.size > CI_INCONNUES_MAX) _ciInconnues.delete(_ciInconnues.values().next().value);
      _ciBalayerEcranPlusTard();
    }
    _ciNonReconnue();
  } catch (e) { try { diagLog("ci_retrait : " + (e && e.message)); } catch (_e) {} }
}

// ── La lecture des identifiants manquants : coalescée, bornée, jamais masquée ──
const CI_VERIF_DELAI_MS = 400;
const CI_VERIF_POSTS_MAX = 30;
// Bornes en LIGNES : on ne demande que des publications dont les réactions
// connues tiennent sous `CI_VERIF_ATTENDUES_MAX`, avec une limite deux fois plus
// haute. Une réponse qui l'atteint est tronquée — elle ne prouve aucune
// absence — et compte comme un échec. 500, et non la valeur de `max-rows`
// (1 000) : une limite serveur plus basse que prévu ferait passer une réponse
// tronquée pour complète.
const CI_VERIF_ATTENDUES_MAX = 250;
const CI_VERIF_LIGNES_MAX = 500;
// Recul après un échec : 10, 20, 40 puis 60 s. La demande arrivée pendant le
// recul est REPORTÉE à sa fin, jamais perdue ; un succès remet tout à zéro.
const CI_VERIF_RECUL_MIN_MS = 10000;
const CI_VERIF_RECUL_MAX_MS = 60000;
var _ciVerifMinuteur = null, _ciVerifEnAttente = false, _ciVerifEnCours = false;
var _ciVerifEchecs = 0, _ciVerifEchecA = 0;
function _ciVerifRecul() {
  return _ciVerifEchecs ? Math.min(CI_VERIF_RECUL_MAX_MS, CI_VERIF_RECUL_MIN_MS * Math.pow(2, _ciVerifEchecs - 1)) : 0;
}
function _ciNonReconnue() {
  try {
    // Une page masquée ne peint rien : le rendez-vous est REPORTÉ au retour.
    if (document.hidden) { _ciVerifEnAttente = true; return; }
    if (_ciVerifMinuteur) return;                 // une rafale, un seul rendez-vous
    var delai = CI_VERIF_DELAI_MS;
    if (_ciVerifEchecA) delai = Math.max(delai, _ciVerifEchecA + _ciVerifRecul() - Date.now());
    _ciVerifMinuteur = setTimeout(function () {
      _ciVerifMinuteur = null;
      _ciVerifEnAttente = false;
      _ciVerifierReactionsPost();
    }, delai);
  } catch (e) { try { diagLog("ci_verif_arm : " + (e && e.message)); } catch (_e) {} }
}
function _ciRattraper() {
  if (document.hidden) return;
  if (_ciInconnues.size) _ciBalayerEcranPlusTard();
  if (_ciVerifEnAttente) _ciNonReconnue();
}
document.addEventListener("visibilitychange", _ciRattraper);
window.addEventListener("pageshow", _ciRattraper);
// Les publications À L'ÉCRAN (une pastille `[data-postchip]` dans le DOM) dont
// une réaction d'un autre compte n'a pas encore son identifiant, tant que leurs
// réactions connues tiennent sous la borne. Une publication qui la dépasse
// seule n'est jamais demandée : son retrait attend le filet du fil, et rien ne
// se relit en boucle pour elle.
function _ciPostsAVerifier() {
  var ids = [], attendues = 0;
  try {
    document.querySelectorAll("[data-postchip]").forEach(function (h) {
      if (ids.length >= CI_VERIF_POSTS_MAX) return;
      var pid = h.getAttribute("data-postchip");
      if (!pid || ids.indexOf(pid) !== -1) return;
      var p = (typeof findPostAnywhere === "function") ? findPostAnywhere(pid) : null;
      if (!p || _ciEstExemple(p) || !Array.isArray(p.reactions) || !p.reactions.length) return;
      if (!p.reactions.some(function (x) {
        return x && !x.ci && x.authorId && !_ciEstMoi(x.authorId) && (x.type === "emoji_reaction" || x.type === "gif_reaction");
      })) return;
      if (attendues + p.reactions.length > CI_VERIF_ATTENDUES_MAX) return;
      attendues += p.reactions.length;
      ids.push(pid);
    });
  } catch (e) { try { diagLog("ci_verif_ecran : " + (e && e.message)); } catch (_e) {} }
  return ids;
}
const CI_VERIF_RELANCES_MAX = 3;
function _ciVerifEchec(raison) {
  _ciVerifEchecs++;
  _ciVerifEchecA = Date.now();
  // Reportée à la fin du recul (`_ciNonReconnue`), pas perdue — trois fois au
  // plus : un refus qui dure (une policy) ne doit pas coûter une requête par
  // minute pour toujours ; un DELETE suivant redemandera, après le recul.
  if (_ciVerifEchecs <= CI_VERIF_RELANCES_MAX) _ciVerifEnAttente = true;
  try { diagLog("ci_verif : " + raison + " (échec " + _ciVerifEchecs + ", recul " + Math.round(_ciVerifRecul() / 1000) + " s)"); } catch (_e) {}
}
async function _ciVerifierReactionsPost() {
  if (_ciVerifEnCours) { _ciVerifEnAttente = true; return; }
  // Le minuteur a pu être armé page visible et tomber page masquée.
  if (document.hidden) { _ciVerifEnAttente = true; return; }
  if (typeof supa === "undefined" || !supa || !window._supaReal) return;
  _ciVerifEnCours = true;
  try {
    var ids = _ciPostsAVerifier();
    if (!ids.length) return;
    window._ciStats.verifications++;
    // Ce qui était à l'écran AVANT la lecture : seule une de CES entrées peut
    // être retirée. Une entrée posée pendant la lecture (filet du fil, INSERT)
    // n'est pas jugée par une réponse qui la précède.
    var avant = new Set();
    ids.forEach(function (pid) {
      _copiesDiscussion(pid, null).forEach(function (p) {
        (Array.isArray(p.reactions) ? p.reactions : []).forEach(function (x) { if (x && !x.ci) avant.add(x); });
      });
    });
    var res = await supa.from("comment_interactions")
      .select("id,comment_id,post_id,user_id,kind,payload,created_at")
      .in("comment_id", ids).in("kind", ["emoji", "gif"])
      .limit(CI_VERIF_LIGNES_MAX);
    if (res.error) { _ciVerifEchec((res.error.code || "") + " " + (res.error.message || "")); return; }
    var brutes = Array.isArray(res.data) ? res.data : [];
    // Une réponse tronquée ne prouve aucune absence, et la refaire relirait les
    // mêmes lignes à chaque DELETE : c'est un échec, avec son recul.
    if (brutes.length >= CI_VERIF_LIGNES_MAX) { _ciVerifEchec("réponse tronquée (" + brutes.length + " lignes)"); return; }
    _ciVerifEchecs = 0; _ciVerifEchecA = 0;
    // Une ligne dont le DELETE est déjà arrivé (pendant la lecture) est morte,
    // même si l'instantané de la réponse la porte encore.
    var lignes = _ciSansTombees(brutes);
    lignes.forEach(_ciIndexer);
    ids.forEach(function (pid) {
      var serveur = lignes.filter(function (l) { return l && l.comment_id === pid && l.payload != null; });
      var retire = 0;
      _copiesDiscussion(pid, null).forEach(function (p) {
        if (!Array.isArray(p.reactions)) return;
        for (var i = p.reactions.length - 1; i >= 0; i--) {
          var x = p.reactions[i];
          if (!x || x.ci) continue;
          var ligne = serveur.find(function (l) { return _ciMemeLigne(x, l, _ciTypeEntree(l.kind)); });
          if (ligne) { x.ci = ligne.id; continue; }
          // Absente du serveur : retirée — sauf une entrée à MOI (ma réaction
          // optimiste n'est peut-être pas encore écrite).
          if (avant.has(x) && x.authorId && !_ciEstMoi(x.authorId)) { p.reactions.splice(i, 1); retire++; }
        }
      });
      if (retire) {
        window._ciStats.retraitsAppliques += retire;
        try { saveState(); } catch (e) {}
        try { if (typeof updatePostReactionsUI === "function") updatePostReactionsUI(pid); }
        catch (e) { try { diagLog("ci_verif_pastille : " + (e && e.message)); } catch (_e) {} }
      }
    });
  } catch (e) {
    _ciVerifEchec(e && e.message);
  } finally {
    _ciVerifEnCours = false;
    // Un DELETE inconnu arrivé pendant la lecture, ou un échec : on regarde de
    // nouveau — après le recul s'il y en a un (`_ciNonReconnue`).
    if (_ciVerifEnAttente && !document.hidden) { _ciVerifEnAttente = false; _ciNonReconnue(); }
  }
}
// Le retrait d'une réaction portée par une PUBLICATION (comment_id === post_id),
// sur toutes ses copies : en oublier une la ferait revenir au rendu suivant.
function _ciRetirerReactionPost(r) {
  var type = _ciTypeEntree(r.kind);
  if (!type || typeof _copiesDiscussion !== "function") return false;
  var n = 0;
  _copiesDiscussion(r.post_id, null).forEach(function (p) { n += _ciRetirerDe(p && p.reactions, r, type); });
  if (!n) return false;
  window._ciStats.retraitsAppliques++;
  try { saveState(); } catch (e) {}
  if (typeof updatePostReactionsUI === "function") updatePostReactionsUI(r.post_id);
  return true;
}

// ════════════════════════════════════════════════════════════════════════
// RV-39 — LES RÉACTIONS D'AUTRUI SUR MES PUBLICATIONS SUIVENT LE SERVEUR
// (2026-11-05, trouvé par la contre-revue de R37)
// ────────────────────────────────────────────────────────────────────────
// Une publication à moi vit dans `userPosts` (la copie gardée à la publication)
// ET dans `supabasePosts` (la copie que rend le serveur). `findPostAnywhere`
// préfère la première, et la pastille la lit (`_postReactItems`). Or
// `supaLoadPosts` n'y recopiait que `commentsTotal` : les réactions d'autrui
// lues par `fil_compteurs` n'apparaissaient JAMAIS sur l'appareil qui a publié
// (ni sur un autre appareil du compte : `userPosts` voyage dans le blob
// `user_state`). Seules s'y voyaient celles reçues en direct, ou persistées par
// une session précédente ; et une réaction retirée pendant que le socket dormait
// y restait.
//
// À chaque lecture du fil, les réactions d'AUTRUI de la copie serveur sont donc
// recopiées dans mes copies `userPosts` (`_recopierReactionsAutrui`, appelée
// par `supaLoadPosts`), et rien d'autre :
//   · MES entrées restent les miennes : optimistes (pas encore en base), ou
//     retirées ici et pas encore effacées là-bas. Le serveur ne doit ni
//     ressusciter les unes ni retirer les autres ;
//   · une entrée d'autrui que le serveur rend aussi est GARDÉE (le même objet),
//     avec son `ci`. Une ligne serveur sans `ci` (c'est le cas de
//     `fil_compteurs`) reçoit celui de l'entrée locale, sur la copie serveur
//     aussi : c'est lui qui fait voir un retrait en direct (R37) ;
//   · une entrée d'autrui absente du serveur n'est retirée que si elle était là
//     AVANT la lecture. Une réaction reçue en direct pendant la lecture n'est
//     pas jugée par un instantané qui la précède (même règle que
//     `_ciVerifierReactionsPost`) ;
//   · rien ne bouge si les réactions n'ont pas été LUES (lecture en échec,
//     réponse du repli à la borne, publication absente de la réponse) : une
//     liste vide n'est pas une absence (`reactionsLues`, app-08) ;
//   · un état déjà juste ne change rien : ni sauvegarde, ni synchronisation
//     `user_state`, ni repeinte. Ce chemin tourne à CHAQUE tour du filet ;
//   · une réponse plus VIEILLE que la dernière recopiée pour cette publication
//     est ignorée (numéro de lecture). Toute lecture recopie : tête du fil, page
//     suivante, profil, bobines. Deux lectures non séquencées se croisent, et
//     l'instantané le plus ancien, arrivé le dernier, ramenait une réaction
//     retirée entre les deux (contre-revue du lot).
// La pastille est repeinte EN PLACE : la signature du fil (`_feedPostsSig`,
// `_feedDomSig`) ne regarde que la copie serveur, et ne repeindrait pas une
// carte dont seule ma copie a changé.
// ⚠️ Un DELETE reçu PENDANT la lecture, d'une ligne que l'instantané porte
// encore, est écarté par sa pierre tombale par CLÉ (`_ciReactionPostTombee`, à
// la construction de la copie serveur) : `fil_compteurs` ne rend pas l'`id`.
// Un compte bloqué entre dans ma copie comme dans la copie serveur ; c'est
// l'affichage qui l'écarte (`_postReactItems`).
// Verrou : `tests/e2e/reactions-mes-publications.spec.js`. Fiche :
// `docs/journal/capacite-perf-realtime.md`, « 🪞 RV-39 ».
function _estReactionAutrui(x) {
  return !!(x && x.authorId && !_ciEstMoi(x.authorId) && (x.type === "emoji_reaction" || x.type === "gif_reaction"));
}
// La clé naturelle d'une entrée de réaction (forme client), faute de `ci` :
// l'instant y est déjà passé par `supaTs` des deux côtés (REST `…+00:00`, temps
// réel `…+00`) — jamais l'`id` de l'entrée, dont la forme suit ce format.
function _cleReactionPost(x) {
  var t = Number(x && x.createdAt);
  if (!x || !Number.isFinite(t)) return null;
  return [x.type || "", x.authorId || "", x.text == null ? "" : String(x.text), t].join("\u0001");
}
function _signatureReactions(arr) {
  return (Array.isArray(arr) ? arr : []).map(function (x) {
    if (!x) return "";
    return [x.id, x.ci || "", x.authorId || "", x.type || "", x.text == null ? "" : String(x.text), Number(x.createdAt) || 0].join("\u0001");
  }).join("\u0002");
}
// Numéro de la dernière lecture partie, et, par publication, celui de la lecture
// la plus fraîche déjà recopiée (bornée : seules mes publications y entrent).
var _rv39Lectures = 0;
const _rv39Servie = new Map();
const RV39_SERVIE_MAX = 2000;
// AVANT la lecture des réactions : son numéro, et les entrées d'autrui de mes
// copies de la page — les seules qu'une réponse du serveur a le droit de retirer.
function _reactionsAutruiAvantLecture(postIds) {
  var avant = { seq: ++_rv39Lectures, entrees: new Set() };
  try {
    var ids = new Set(postIds || []);
    if (!ids.size || !Array.isArray(state.userPosts)) return avant;
    state.userPosts.forEach(function (u) {
      if (!u || !ids.has(u.id) || !Array.isArray(u.reactions)) return;
      u.reactions.forEach(function (x) { if (_estReactionAutrui(x)) avant.entrees.add(x); });
    });
  } catch (e) { try { diagLog("rv39_avant : " + (e && e.message)); } catch (_e) {} }
  return avant;
}
// `serveur` : le tableau `reactions` que `supaLoadPosts` vient de construire pour
// `postId` (la copie serveur, MUTÉE seulement pour y apprendre un `ci`) ;
// `avant` : `_reactionsAutruiAvantLecture`. Rend vrai si une de mes copies a changé.
function _recopierReactionsAutrui(postId, serveur, avant) {
  var change = false;
  try {
    if (!postId || !Array.isArray(serveur) || !Array.isArray(state.userPosts)) return false;
    var mesCopies = state.userPosts.filter(function (u) { return u && u.id === postId; });
    if (!mesCopies.length) return false;
    // Une lecture partie APRÈS celle-ci a déjà été recopiée : son instantané est
    // plus juste, celui-ci ne le défait pas.
    var seq = (avant && avant.seq) || 0;
    if (seq) {
      if ((_rv39Servie.get(postId) || 0) > seq) return false;
      _rv39Servie.delete(postId);
      _rv39Servie.set(postId, seq);
      while (_rv39Servie.size > RV39_SERVIE_MAX) _rv39Servie.delete(_rv39Servie.keys().next().value);
    }
    var duServeur = serveur.filter(_estReactionAutrui);
    mesCopies.forEach(function (u) {
      var locales = Array.isArray(u.reactions) ? u.reactions : [];
      var signatureAvant = _signatureReactions(locales);
      // Mes entrées d'autrui, rangées par `ci` et par clé naturelle : l'appariement
      // reste linéaire (ce chemin tourne à chaque tour, une publication peut porter
      // des centaines de réactions).
      var parCi = new Map(), parCle = new Map();
      var ranger = function (table, k, x) { if (!k) return; var l = table.get(k); if (l) l.push(x); else table.set(k, [x]); };
      locales.forEach(function (x) {
        if (!_estReactionAutrui(x)) return;
        if (x.ci) ranger(parCi, x.ci, x);
        ranger(parCle, _cleReactionPost(x), x);
      });
      var prises = new Set();
      var premiere = function (liste, retenir) {
        for (var i = 0; liste && i < liste.length; i++) {
          if (!prises.has(liste[i]) && (!retenir || retenir(liste[i]))) return liste[i];
        }
        return null;
      };
      var autrui = duServeur.map(function (s) {
        // La même ligne : par l'identifiant quand les deux côtés le portent ;
        // sinon par la clé naturelle (une entrée qui a un AUTRE `ci` est une
        // autre ligne).
        var k = _cleReactionPost(s);
        var l = s.ci
          ? (premiere(parCi.get(s.ci)) || premiere(k && parCle.get(k), function (x) { return !x.ci; }))
          : premiere(k && parCle.get(k));
        if (!l) return Object.assign({}, s);
        prises.add(l);
        if (!l.ci && s.ci) l.ci = s.ci;
        else if (l.ci && !s.ci) s.ci = l.ci;
        return l;
      });
      var gardees = locales.filter(function (x) {
        if (prises.has(x)) return false;
        if (!_estReactionAutrui(x)) return true;           // les miennes, et ce que le serveur ne couvre pas
        return !!(avant && avant.entrees instanceof Set) && !avant.entrees.has(x);   // reçue PENDANT la lecture
      });
      var nouvelles = autrui.concat(gardees);
      nouvelles.sort(function (a, b) { return (Number(a && a.createdAt) || 0) - (Number(b && b.createdAt) || 0); });
      if (_signatureReactions(nouvelles) === signatureAvant) return;
      u.reactions = nouvelles;
      change = true;
    });
    if (change) {
      try { saveState(); } catch (e) {}
      if (typeof updatePostReactionsUI === "function") updatePostReactionsUI(postId);
    }
  } catch (e) { try { diagLog("rv39_recopie : " + (e && e.message)); } catch (_e) {} }
  return change;
}

// Applique en TEMPS RÉEL une interaction de commentaire reçue d'un autre compte
// (canal realtime:comment_interactions, app-08). op = "add" (INSERT) | "remove"
// (DELETE : la ligne vient de l'index R37, la charge du serveur n'a que l'`id`).
function _applyCommentInteractionEvent(r, op) {
  try {
    if (!r || !r.comment_id) return;
    // #11 épingle (RV-38) : un état du FIL, ni « j'aime » ni réponse — seule la ligne
    // du PROPRIÉTAIRE du fil fait foi (`_epingleRecue`), la mienne comprise : elle
    // vient peut-être d'un autre de mes appareils. Indexée (R37) : son retrait — une
    // purge, avec le commentaire ou la publication, ou le retour arrière de la
    // migration — se reconnaît, et la vérité du fil se RELIT (`_epingleRetiree`).
    if (r.kind === "pin") { if (op === "add") { _ciIndexer(r); _epingleRecue(r); } else _epingleRetiree(r); return; }
    if (typeof MY_UID !== "undefined" && r.user_id === MY_UID) return; // déjà appliqué localement
    // Un compte bloqué n'AJOUTE rien ; ce qu'il retire part quand même (retirer
    // ne montre rien de lui, et sa ligne a pu être comptée par une lecture).
    if (op === "add" && typeof isBlocked === "function" && isBlocked(r.user_id)) return;
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
      if (r.comment_id === r.post_id && (r.kind === "emoji" || r.kind === "gif")) {
        if (op === "remove") { _ciRetirerReactionPost(r); return; }
        var _post = (r.payload && typeof findPostAnywhere === "function") ? findPostAnywhere(r.post_id) : null;
        if (_post) {
          if (!Array.isArray(_post.reactions)) _post.reactions = [];
          var _prid = (r.kind === "emoji" ? "semoji_" : "sgif_") + (r.created_at || Date.now()) + "_" + r.user_id;
          // Indexée même si l'entrée existe déjà : c'est ce qui permettra d'en
          // voir le retrait (R37).
          _ciIndexer(r);
          // Par la LIGNE, pas seulement par l'`id` d'entrée : une lecture du fil a
          // pu la poser juste avant, au format REST (`…+00:00`), quand le temps
          // réel écrit `… +00` — l'`id` diffère, c'est la même réaction (RV-39).
          var _typeP = _ciTypeEntree(r.kind);
          var _deja = _post.reactions.find(function(x){ return x && (x.id === _prid || _ciMemeLigne(x, r, _typeP)); });
          if (_deja) { if (!_deja.ci && r.id) _deja.ci = r.id; }
          else {
            _post.reactions.push({ id: _prid, ci: r.id || null, authorId: r.user_id, text: r.payload,
              type: r.kind === "emoji" ? "emoji_reaction" : "gif_reaction", createdAt: supaTs(r.created_at) });
            try { saveState(); } catch(e) {}
            if (typeof updatePostReactionsUI === "function") updatePostReactionsUI(r.post_id);
          }
        }
      }
      return; // sinon : fil/commentaire pas chargé localement → rien à faire
    }
    comment.likedBy = comment.likedBy || []; comment.replies = comment.replies || []; comment.emojis = comment.emojis || [];
    // La ligne d'un INSERT appliqué entre dans l'index : son retrait sera reconnu.
    if (op === "add") _ciIndexer(r);
    var _type = _ciTypeEntree(r.kind);   // null pour un like ou une réponse
    if (r.kind === "like") {
      if (op === "add") { if (comment.likedBy.indexOf(r.user_id) < 0) { comment.likedBy.push(r.user_id); comment.likes = (comment.likes || 0) + 1; } }
      else {
        // UNE ligne retirée = UNE occurrence : la lecture compte une entrée par
        // ligne (`supaLoadCommentInteractions`), doublons d'appareils compris.
        var _iL = comment.likedBy.indexOf(r.user_id);
        if (_iL < 0) return;
        comment.likedBy.splice(_iL, 1);
        comment.likes = Math.max(0, (comment.likes || 1) - 1);
        window._ciStats.retraitsAppliques++;
      }
    } else if (op === "remove") {
      // Emoji, GIF ou réponse (un GIF de réponse est une réponse) : l'entrée
      // qui EST cette ligne, jamais une autre du même compte.
      if (r.kind !== "reply" && !_type) return;
      if (!_ciRetirerDe(comment.replies, r, _type)) return;
      window._ciStats.retraitsAppliques++;
    } else if (r.kind === "reply") {
      var rid = "srep_" + r.created_at;
      var _repDeja = comment.replies.find(function(x){ return x.id === rid; });
      if (!_repDeja) comment.replies.push({ id: rid, ci: r.id || null, authorId: r.user_id, text: r.payload || "", createdAt: supaTs(r.created_at) });
      else if (!_repDeja.ci && r.id) _repDeja.ci = r.id;
    } else if (r.kind === "emoji" && r.payload) {
      var eid = "semoji_" + (r.created_at || Date.now()) + "_" + r.user_id;
      if (!comment.replies.find(function(x){ return x.id === eid; }))
        comment.replies.push({ id: eid, ci: r.id || null, authorId: r.user_id, text: r.payload, type: "emoji_reaction", createdAt: supaTs(r.created_at) });
    } else if (r.kind === "gif" && r.payload) {
      var gid = "sgif_" + (r.created_at || Date.now()) + "_" + r.user_id;
      if (!comment.replies.find(function(x){ return x.id === gid; }))
        comment.replies.push({ id: gid, ci: r.id || null, authorId: r.user_id, text: r.payload, type: "gif_reaction", createdAt: supaTs(r.created_at) });
    }
    if (typeof thread.save === "function") thread.save(); else saveState();
    // Fluidité : un like/une réaction d'un autre compte se patche EN PLACE (ne
    // détruit pas un composeur de réponse ouvert ni le scroll) ; ce qui change
    // la LISTE des réponses (une réponse, un GIF — rendu en ligne, pas dans la
    // pastille) déclenche un refresh complet.
    var _patched = false;
    if (r.kind === "like") _patched = _patchCmtLike(r.post_id, r.comment_id);
    // Un GIF (genre hérité `gif`) est rendu EN LIGNE, jamais dans la pastille :
    // patcher la pastille ne le montrait pas — la liste se rafraîchit.
    else if (r.kind === "emoji") _patched = _patchCmtReact(r.post_id, r.comment_id);
    if (!_patched && typeof _refreshCommentThreadUI === "function") _refreshCommentThreadUI(r.post_id);
    // Profil de l'auteur inconnu localement → le résoudre puis re-render, sinon
    // la réponse/réaction realtime s'affiche avec « ? » comme pseudo.
    if (op === "add" && r.user_id && typeof userById === "function" && !userById(r.user_id)
        && typeof _resolveProfilesByIds === "function") {
      _resolveProfilesByIds([r.user_id]).then(function(){
        if (r.kind === "like" && _patchCmtLike(r.post_id, r.comment_id)) return;
        if (r.kind === "emoji" && _patchCmtReact(r.post_id, r.comment_id)) return;
        if (typeof _refreshCommentThreadUI === "function") _refreshCommentThreadUI(r.post_id);
      }).catch(function(){});
    }
  } catch (e) {
    // Toute la logique d'ajout ET de retrait passe ici (R37) : une exception
    // muette était indiscernable de « rien à faire » (règle du catch large).
    try { diagLog("ci_appliquer " + (op || "?") + " : " + (e && e.message)); } catch (_e) {}
  }
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
  // ⚠️ La branche 0) — « Étape d'un voyage » (`cdvstep:` / `carnetstep:`) — a été
  // retirée avec le Carnet de voyage (ADR-011 §5). Plus aucun code ne produit un
  // identifiant de cette forme, et aucune surface n'affiche un fil d'étape.
  // Les commentaires DÉJÀ écrits restent dans `state.user.stepComments` : rien
  // n'est effacé, conformément à la règle « la fonctionnalité disparaît, pas les
  // données ».
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
          save: function(){ try { if (typeof _persistEventComments === "function") _persistEventComments(); } catch(e){} },
          targetUserId: ev.organizerId };
      }
    } catch(e) {}
  }
  // ⚠️ La 3ᵉ branche — « Live CDV » — a été retirée avec la fonctionnalité
  // (ADR-011 §5). Un fil de commentaires ne peut plus être un live de voyage :
  // `kind: "cdv"` n'est plus produit nulle part. Les branches « post » et
  // « event » ci-dessus sont inchangées.
  return null;
}

// Re-render le fil de commentaires partout où il est affiché (modale post,
// page détail IRL, viewer CDV, feuille générique).
// Coalesce les rafraîchissements (rafales realtime : plusieurs likes/réponses
// reçus en même temps recompilaient toute la liste à chaque event = lag). Un
// seul rebuild par frame (~16ms, imperceptible).
// Pose du HTML dans un conteneur de fil SANS jank : (1) no-op si le HTML est
// identique (une réaction/like ne rebuild pas un fil inchangé) ; (2) préserve la
// position de scroll ET le focus/valeur d'un éventuel champ de saisie en cours
// (répondre) — avant, chaque tap remettait le scroll en haut et pouvait vider une
// réponse à moitié tapée. C'est LE correctif de fluidité des commentaires.
function _setThreadHtml(el, html) {
  if (!el || el.innerHTML === html) return;
  var sc = el.scrollTop;
  // Sauver une saisie de réponse ouverte (champ dynamique hors innerHTML re-rendu).
  var active = document.activeElement;
  var save = null;
  if (active && el.contains(active) && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
    save = { id: active.id, val: active.value, s: active.selectionStart, e: active.selectionEnd };
  }
  el.innerHTML = html;
  el.scrollTop = sc;
  if (save && save.id) {
    var again = document.getElementById(save.id);
    if (again) { again.value = save.val; try { again.setSelectionRange(save.s, save.e); } catch(e) {} again.focus(); }
  }
}
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
      if (box) _setThreadHtml(box, _renderCommentsList(thread.comments, threadId));
      // Le titre suit l'autorité du compte (une réponse ou un GIF confirmé,
      // une ligne retirée : la liste bouge, le titre aussi).
      if (thread.kind === "post" && typeof nbCommentairesPost === "function" && typeof findPostAnywhere === "function") {
        var _titre = document.querySelector("#commentsModal .modal-title, .modal-title");
        var _postTitre = findPostAnywhere(threadId);
        if (_titre && _postTitre && /^Discussion/.test(_titre.textContent || "")) _titre.textContent = "Discussion (" + nbCommentairesPost(_postTitre) + ")";
      }
    }
  } catch(e) {}
  // ⚠️ La feuille de commentaires d'ÉTAPE (`#stepCommentsBox`, `kind: "step"`) a
  // été retirée avec le Carnet de voyage (ADR-011 §5) : `_findCommentThread` ne
  // produit plus ce genre de fil.
  // IRL : son renderer gère DÉJÀ la page détail ET la feuille inline (#cmtThreadList).
  if (thread.kind === "event") {
    try { if (typeof _renderEventComments === "function") _renderEventComments(threadId); } catch(e) {}
    return;
  }
  // ⚠️ Le rafraîchissement du viewer CDV (`#cdvCommentsBox`) a été retiré avec la
  // fonctionnalité (ADR-011 §5) : ce viewer n'existe plus.
  // Page détail d'un post (#postDetailComments) — realtime/like/réponse s'y
  // reflètent maintenant comme dans la modale (renderer unifié, 2026-07-03).
  try {
    var pd = document.getElementById("postDetailComments");
    if (pd && pd.getAttribute("data-thread") === threadId) {
      _setThreadHtml(pd, thread.comments.length
        ? _renderCommentsList(thread.comments, threadId)
        : '<div style="font-size:13px;color:var(--muted);text-align:center;padding:20px 0;">Aucun commentaire — sois le premier 💬</div>');
    }
  } catch(e) {}
  // Carnet CDV ouvert dans le viewer plein écran (#vlogCommentsList).
  try {
    var vv = document.getElementById("vlogViewer");
    var vlist = document.getElementById("vlogCommentsList");
    if (vlist && vv && vv.getAttribute("data-current-post") === threadId) {
      _setThreadHtml(vlist, thread.comments.length
        ? _renderCommentsList(thread.comments, threadId)
        : '<div style="font-size:12px;color:var(--muted);">Aucun commentaire — sois le premier 💬</div>');
    }
  } catch(e) {}
  // Panneau de commentaires des Bobines (app-05) : même discussion, même page.
  try {
    if (window.currentReelCommentPostId === threadId && typeof loadReelComments === "function") loadReelComments(threadId);
  } catch(e) {}
  // Feuille générique inline (carte CDV/fil sans ouvrir le détail).
  try {
    var sheet = document.getElementById("cmtThreadList");
    if (sheet && sheet.getAttribute("data-thread") === threadId) {
      _setThreadHtml(sheet, thread.comments.length
        ? _renderCommentsList(thread.comments, threadId)
        : '<div class="empty"><div class="empty-icon">💭</div><div class="empty-title">Sois le premier à réagir</div></div>');
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
  window._cmtSheetCtx.owner = (typeof _isThreadOwner === "function") ? _isThreadOwner(threadId) : false;
  // Épingler : réservé au propriétaire du fil (auteur du post/événement/live) — et
  // jamais dans un fil homonyme, que la garde du serveur refuse (`_filAmbigu`).
  if (window._cmtSheetCtx.owner && !_filAmbigu(threadId)) {
    rows += _cmtRow("📌", _estEpingle(threadId, c) ? "Retirer l'épingle" : "Épingler en haut", "pin");
  }
  if (isMine) {
    if (_commentaireModifiable(commentId, c.text || c.content || "")) rows += _cmtRow("✏️", "Modifier", "edit");
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
  return '<button class="cmt-sheet-row' + (danger ? " danger" : "") + '" onclick="_cmtAct(\'' + escapeJsArg(action) + '\')">'
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
    // FIL-C09 : le succès s'annonce APRÈS la réponse du presse-papiers (le
    // try/catch n'entourait qu'un appel asynchrone : refus avalé, « Texte copié »).
    try {
      Promise.resolve(navigator.clipboard.writeText(ctx.text))
        .then(function () { toast("Texte copié"); }, function () { toast("Copie impossible"); });
    } catch(e) { toast("Copie impossible"); }
  }
  else if (kind === "edit") { editCommentEntry(ctx.threadId, ctx.commentId); }
  else if (kind === "pin") { togglePinComment(ctx.threadId, ctx.commentId); }
  else if (kind === "delete") { deleteCommentEntry(ctx.threadId, ctx.commentId); }
  else if (kind === "hide") { memoriserCommentaireMasque(ctx.commentId); deleteCommentEntry(ctx.threadId, ctx.commentId, true); toast("Commentaire masqué"); }
  else if (kind === "block") { demanderBlocage(ctx.authorId, ctx.name); }
  else if (kind === "report") { reportCommentEntry(ctx.threadId, ctx.commentId); }
}

// Supprime un commentaire (local + best-effort Supabase selon le préfixe d'id).
// `localOnly` = simple masquage local (action « Masquer » sur le commentaire d'autrui).
function deleteCommentEntry(threadId, commentId, localOnly) {
  var thread = _findCommentThread(threadId);
  if (!thread) return;
  var idx = thread.comments.findIndex(function(c){ return c.id === commentId; });
  var retire = idx > -1 ? thread.comments.splice(idx, 1)[0] : null;
  // Le total serveur du fil (`commentsTotal`) comptait ce commentaire s'il
  // venait de la base ; un commentaire local pas encore envoyé n'y était pas.
  // Sur TOUTES les copies du post (carte du fil, ma copie userPosts, Bobines) :
  // une seule décrémentée laissait la carte du fil à l'ancien total.
  if (retire && retire.fromSupabase && thread.kind === "post") {
    var copiesDuFil = (typeof _copiesDiscussion === "function") ? _copiesDiscussion(threadId, null) : [];
    var vuDel = new Set();
    copiesDuFil.forEach(function (c) {
      if (!c || vuDel.has(c)) return; vuDel.add(c);
      if (Number.isSafeInteger(c.commentsTotal) && c.commentsTotal > 0) c.commentsTotal--;
    });
  }
  if (typeof thread.save === "function") thread.save();
  // Reflète sur le post local (compteur de la carte fil) le cas échéant — patch
  // en place, sans reconstruire tout le fil.
  if (thread.kind === "post") { try { _patchPostCommentCount(threadId); } catch(e){} }
  _refreshCommentThreadUI(threadId);
  if (localOnly) return;
  // ⚠️ LOT-1 (audit UX/UI du 2026-11-10, FIL-C06) : « Commentaire supprimé »
  // partait AVANT la réponse du serveur, qui n'était jamais lue. Un refus (RLS,
  // panne, hors ligne) laissait la ligne en base : le commentaire « supprimé »
  // revenait à la relecture suivante. On annonce désormais le VERDICT, et un
  // refus remet le commentaire à sa place.
  _supaDeleteCommentRow(commentId).then(function (v) {
    if (v && v.ok) { toast("Commentaire supprimé"); return; }
    if (retire) {
      var t2 = _findCommentThread(threadId);
      if (t2 && !t2.comments.some(function (c) { return c.id === retire.id; })) {
        t2.comments.splice(Math.min(Math.max(idx, 0), t2.comments.length), 0, retire);
        if (retire.fromSupabase && t2.kind === "post") {
          var vuRet = new Set();
          ((typeof _copiesDiscussion === "function") ? _copiesDiscussion(threadId, null) : []).forEach(function (c) {
            if (!c || vuRet.has(c)) return; vuRet.add(c);
            if (Number.isSafeInteger(c.commentsTotal)) c.commentsTotal++;
          });
        }
        if (typeof t2.save === "function") t2.save();
        if (t2.kind === "post") { try { _patchPostCommentCount(threadId); } catch (e) {} }
        _refreshCommentThreadUI(threadId);
      }
    }
    toast(v && v.reseau ? "Hors connexion : commentaire non supprimé. Réessaie une fois en ligne."
                        : "Le commentaire n'a pas pu être supprimé. Réessaie.", "error");
  });
}
// Rend le verdict de la suppression : { ok: true } (supprimé, ou rien à
// supprimer côté serveur : commentaire local, visiteur, démonstration),
// { ok: false, reseau } sinon. Une suppression qui ne touche AUCUNE ligne alors
// que la ligne existe encore est un refus (RLS) : le SDK ne lève pas dessus.
async function _supaDeleteCommentRow(commentId) {
  try {
    if (typeof supa === "undefined" || !supa || !window._supaReal) return { ok: true, local: true };
    var table = null;
    if (/^ec_/.test(commentId)) table = "event_comments";
    else if (/^lc_/.test(commentId)) table = "cdv_live_comments";
    else table = "post_comments"; // c_… et autres
    var r = await supa.from(table).delete().eq("id", commentId).select("id");
    if (r && r.error) {
      if (typeof diagLog === "function") diagLog("cmt_suppression: " + (r.error.message || r.error.code));
      return { ok: false, reseau: typeof estEchecReseau === "function" && estEchecReseau(r.error) };
    }
    if (!r || !Array.isArray(r.data) || !r.data.length) {
      // Zéro ligne : déjà partie (succès) ou refusée (la ligne est toujours là).
      var reste = await supa.from(table).select("id").eq("id", commentId).limit(1);
      if (reste && !reste.error && Array.isArray(reste.data) && reste.data.length) {
        if (typeof diagLog === "function") diagLog("cmt_suppression: 0 ligne, refus");
        return { ok: false, reseau: false };
      }
    }
    // Nettoie aussi les interactions liées (best-effort, RLS owner).
    try { await supa.from("comment_interactions").delete().eq("comment_id", commentId); } catch(e) {}
    return { ok: true };
  } catch(e) {
    return { ok: false, reseau: typeof estEchecReseau === "function" ? estEchecReseau(e) : true };
  }
}

// Suis-je le propriétaire du fil (auteur du post / organisateur événement /
// auteur du live) → autorisé à épingler un commentaire.
function _isThreadOwner(threadId) {
  var me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  var p = (typeof findPostAnywhere === "function") ? findPostAnywhere(threadId) : null;
  if (p) return p.authorId === me || p._source === "me" || p.authorId === "me";
  if (typeof allEvents === "function") { var e = allEvents().find(function (x) { return x.id === threadId; }); if (e) return e.organizerId === me || !!e._mine; }
  return false;
}
// ── #10 ÉDITION d'un commentaire (façon IG/FB) ── éditeur inline + sync.
// ⚠️ UN COMMENTAIRE D'ACTIVITÉ NE SE MODIFIE PAS (SRV-03, audit de stabilisation du
// 2026-11-10). Mesuré au canal ① : `event_comments` n'a ni colonne `content` ni policy
// UPDATE. « Modifier » y était proposé, l'écran disait « Commentaire modifié », et le
// texte ne quittait jamais l'appareil. Seule autorité du menu ET de l'édition directe.
// (`lc_` : commentaires des lives du Carnet, retirés par ADR-011, table sans droit.)
function _commentaireModifiable(commentId, texte) {
  if (/^(ec_|lc_)/.test(String(commentId || ""))) return false;
  return !_looksLikeMediaUrl(texte || "");
}

// L'enregistrement d'une modification : optimiste, puis LE VERDICT DE LA BASE décide
// (SRV-03). Sur un refus ou 0 ligne, l'ancien texte revient et c'est dit.
async function _enregistrerModificationCommentaire(found, threadId, commentId, v, cur) {
  var node = found.node;
  var avantEdite = !!node.edited;
  var sauver = function () {
    if (found.thread && typeof found.thread.save === "function") found.thread.save(); else { try { saveState(); } catch (e) {} }
  };
  node.text = v; node.content = v; node.edited = true;
  sauver();
  try { _refreshCommentThreadUINow(threadId); } catch (e) {}
  var ok = await _supaUpdateCommentRow(commentId, v);
  if (!ok) {
    node.text = cur; node.content = cur; node.edited = avantEdite;
    sauver();
    try { _refreshCommentThreadUINow(threadId); } catch (e) {}
    toast("Le commentaire n'a pas été modifié — réessaie", "warning");
    return false;
  }
  toast("Commentaire modifié");
  return true;
}

function editCommentEntry(threadId, commentId) {
  var found = (typeof _findCommentNode === "function") ? _findCommentNode(threadId, commentId) : null;
  if (!found || !found.node) return;
  var node = found.node;
  if (_looksLikeMediaUrl(node.text || node.content || "")) { toast("Un GIF ne peut pas être modifié"); return; }
  if (!_commentaireModifiable(commentId, node.text || node.content || "")) { toast("Ce commentaire ne peut pas être modifié"); return; }
  var el = document.querySelector('[data-commentid="' + commentId + '"] .comment-text');
  if (!el) return;
  var cur = node.text || node.content || "";
  el.innerHTML = "";
  var ta = document.createElement("textarea");
  ta.className = "cmt-edit-input"; ta.value = cur; ta.maxLength = 400;
  var bar = document.createElement("div"); bar.className = "cmt-edit-bar";
  var cancel = document.createElement("button"); cancel.className = "btn ghost small"; cancel.type = "button"; cancel.textContent = "Annuler";
  var save = document.createElement("button"); save.className = "btn primary small"; save.type = "button"; save.textContent = "Enregistrer";
  bar.appendChild(cancel); bar.appendChild(save);
  el.appendChild(ta); el.appendChild(bar);
  ta.focus(); try { autoResizeTextarea(ta); } catch (e) {}
  ta.oninput = function () { try { autoResizeTextarea(ta); } catch (e) {} };
  cancel.onclick = function (ev) { ev.stopPropagation(); _refreshCommentThreadUINow(threadId); };
  save.onclick = function (ev) {
    ev.stopPropagation();
    var v = (ta.value || "").trim();
    if (!v) { toast("Le commentaire ne peut pas être vide"); return; }
    if (v === cur) { _refreshCommentThreadUINow(threadId); return; }
    _enregistrerModificationCommentaire(found, threadId, commentId, v, cur);
  };
}
// Rend le VERDICT : `true` si la base a gardé le texte (ou s'il n'y a pas de base :
// commentaire local, mode hors Supabase), `false` sur un refus, une panne ou 0 ligne.
async function _supaUpdateCommentRow(commentId, text) {
  try {
    if (typeof supa === "undefined" || !supa || !window._supaReal) return true;
    // Un visiteur n'a rien en base : son commentaire vit sur l'appareil, le refus serveur
    // attendu n'est pas un échec (relu à la contre-revue du 2026-11-10).
    if (typeof _compteAuthReel === "function" && !_compteAuthReel()) return true;
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(String(commentId || "")) || /^(ec_|lc_)/.test(commentId)) return false;
    // Le SDK ne LÈVE PAS sur un refus RLS : depuis le 2026-09-11 l'UPDATE de
    // post_comments porte un WITH CHECK (auteur du post bloqueur → refus). Et un
    // UPDATE qui ne touche aucune ligne ne lève pas non plus : on compte les lignes.
    var r = await supa.from("post_comments").update({ content: text }).eq("id", commentId).select("id");
    return _writeVerdict(r, { expectRows: true, label: "commentaire (modification)" }).ok;
  } catch (e) { console.warn("commentaire (modification) :", e && e.message); return false; }
}
// ── #11 ÉPINGLER un commentaire (le propriétaire du fil le remonte en tête) ──
// Un seul épinglé par fil. Écrit dans comment_interactions (kind « pin », charge
// « 1 » / « 0 ») pour que les autres comptes le voient.
// ⚠️ RV-38 (2026-11-05) : JAMAIS une épingle n'avait atteint la base — la
// contrainte `ci_kind_check` refusait « pin » (23514) et le refus était avalé :
// l'épingle restait locale à l'appareil du propriétaire, « Commentaire épinglé »
// à l'écran. Désormais l'affichage est OPTIMISTE et suit le VERDICT de
// l'écriture : un refus le DÉFAIT et se DIT. Côté serveur (migration RV-38), la
// garde `trg_ci_epingle_garde` n'admet que le propriétaire du fil, sur un
// commentaire de ce fil. Fiche : docs/journal/serveur-securite-base.md.
// ⚠️ L'ÉPINGLE EST UN ÉTAT DU FIL, PAS D'UN COMMENTAIRE (contre-revue du lot) :
//   · elle se LIT au niveau du fil (`supaLireEpingleFil`, app-08 : les lignes du
//     propriétaire, dans ce fil, les plus récentes d'abord) — jamais par les seules
//     lignes des commentaires chargés : une page de 30 n'en porte qu'une partie, et
//     l'épinglé peut être plus ancien (il est alors lu par son identifiant) ;
//   · règle : le « 1 » le plus récent du fil l'emporte, sauf si un « 0 » plus
//     récent vise ce même commentaire (`_epingleDesLignes`). Commentaire par
//     commentaire, retirer l'épinglé faisait reparaître un « 1 » plus ancien ;
//   · elle se RETIENT par fil (`_epinglesFil`) et le rendu la lit (`_estEpingle`) :
//     une page serveur reconstruit les objets commentaires sans leur drapeau
//     (`_fusionnerPageCommentaires`, `_setEventComments`), et une lecture en échec
//     ne doit pas faire disparaître ce qu'on savait.
var _epinglesFil = {};         // fil → { cid } : la vérité connue (cid null : aucun épinglé)
var _epinglesEnVol = {};       // fil → écritures d'épingle en cours
var _epinglesRecuesEnVol = {}; // fil → une épingle du propriétaire est arrivée en direct PENDANT l'écriture
var _epinglesEcrites = {};     // fil → « commentaire|charge » des écritures du geste en cours (leur écho n'est pas un autre appareil)
var _epinglesEchoEnVol = {};   // fil → l'écho d'une de ces écritures est arrivé : elle a abouti, quoi que dise sa réponse
var _epinglesGeneration = {};  // fil → +1 à chaque épingle posée ou reçue
var _epinglesACharger = {};    // fil + commentaire → lecture de l'épinglé en cours
// Seul un vrai compte écrit une ligne (`user_id` = `auth.uid()`) : le fil d'un
// exemple (`u_…`) ou d'un visiteur ne se lit pas (contre-revue du delta, P4).
var COMPTE_EPINGLE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ⚠️ PRÉREQUIS CLIENT de la migration RV-38
// (`-- PREREQUIS-CLIENT: comment_interactions:epingle-du-fil`) :
// `scripts/appliquer-migration.mjs` refuse d'écrire en production tant que le
// client SERVI ne porte pas cette chaîne. L'ancien lecteur appliquait une ligne
// « pin » par son seul `comment_id`, de qui qu'elle soit, dans n'importe quel fil :
// un identifiant de commentaire réutilisé APRÈS l'épingle (dans l'autre table de
// commentaires, ou par un commentaire renommé) faisait paraître l'épingle d'un
// compte dans le fil d'autrui — la garde du serveur juge l'écriture, pas ce qu'un
// identifiant désignera plus tard (red team, P1). Ce client lit l'épingle par fil
// et par propriétaire, et n'en voit aucune dans un fil homonyme. La renommer,
// c'est renommer la ligne de la migration (verrou :
// tests/unit/barriere-migration.test.mjs).
var EPINGLE_DU_FIL = "comment_interactions:epingle-du-fil";
function _epingleGeneration(fil) { return (fil && _epinglesGeneration[fil]) || 0; }
function _epingleNouvelleGeneration(fil) { if (fil) _epinglesGeneration[fil] = _epingleGeneration(fil) + 1; }
function _epingleConnue(fil) {
  return (fil && Object.prototype.hasOwnProperty.call(_epinglesFil, fil)) ? _epinglesFil[fil] : undefined;
}
// L'épinglé du fil tel qu'on le connaît : sa vérité si elle est connue, sinon le
// drapeau local (avant toute lecture, hors ligne).
function _idEpingleFil(fil, commentaires) {
  var e = _epingleConnue(fil);
  if (e) return e.cid || null;
  var c = (commentaires || []).find(function (x) { return x && x.pinned; });
  return c ? c.id : null;
}
function _estEpingle(fil, c) {
  if (!c) return false;
  var e = _epingleConnue(fil);
  return e ? (!!e.cid && e.cid === c.id) : !!c.pinned;
}
// Avant toute lecture, la vérité du fil se sème du drapeau local, tant que les
// objets qui le portent existent encore : la page serveur qui suit les
// reconstruit sans lui (contre-revue : une lecture en échec après une page relue
// ne montrait plus rien). Une lecture réussie la remplace.
function _semerEpingleFil(fil, commentaires) {
  if (!fil || _epingleConnue(fil)) return;
  var c = (commentaires || []).find(function (x) { return x && x.pinned; });
  if (c) _epinglesFil[fil] = { cid: c.id };
}
// Pose la vérité du fil et aligne le drapeau des objets COURANTS — ceux qu'une
// page serveur a pu reconstruire entre-temps compris — pour qui le lit encore.
function _poserEpingleFil(fil, cid) {
  if (!fil) return;
  _epinglesFil[fil] = { cid: cid || null };
  var t = (typeof _findCommentThread === "function") ? _findCommentThread(fil) : null;
  (t && Array.isArray(t.comments) ? t.comments : []).forEach(function (c) {
    if (!c) return;
    if (cid && c.id === cid) c.pinned = true;
    else if (c.pinned) c.pinned = false;
  });
}
// Retire de toutes les copies de la discussion l'épinglé lu À PART (`_epingleGarde`)
// qui n'est plus l'épinglé `sauf` (null : tous) — hors de sa page, il n'était là
// que parce qu'il était épinglé. Appelé sur une vérité du SERVEUR seulement
// (lecture, ligne reçue, écriture confirmée, absence lue) : un geste optimiste
// refusé doit pouvoir revenir sans relecture. Rend vrai si quelque chose est parti.
// `seul` : ne viser que ce commentaire-là (une absence lue ne retire QUE le
// commentaire lu — contre-vérification de d38d2fb, P4-b). Un gardé que la fenêtre
// des pages chargées couvre désormais n'est plus hors page : il reste, sans sa
// marque (P3-a).
function _retirerEpinglesGardes(fil, sauf, seul) {
  var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(fil) : null;
  if (!post) return false;
  var parti = false;
  _copiesDiscussion(fil, post).forEach(function (copie) {
    var arr = copie && copie.comments;
    if (!Array.isArray(arr)) return;
    var plancher = _plancherPages(arr), suite = !!copie._commentsSuite;
    for (var i = arr.length - 1; i >= 0; i--) {
      var c = arr[i];
      if (!c || !c._epingleGarde || c.id === sauf || (seul && c.id !== seul)) continue;
      if (suite && (c.createdAt || 0) >= plancher) { delete c._epingleGarde; delete c._aVerifier; continue; }
      arr.splice(i, 1); parti = true;
    }
  });
  return parti;
}
// Le plus ancien commentaire qu'une PAGE a apporté (les gardés exclus) : en deçà,
// un commentaire n'est à l'écran que parce qu'il est épinglé.
function _plancherPages(commentaires) {
  return (commentaires || []).reduce(function (min, c) {
    var t = c && c.fromSupabase && !c._epingleGarde ? c.createdAt : null;
    return (typeof t === "number" && t < min) ? t : min;
  }, Infinity);
}
function _sauverEtRepeindreFil(fil) {
  var t = (typeof _findCommentThread === "function") ? _findCommentThread(fil) : null;
  try { if (t && typeof t.save === "function") t.save(); else saveState(); } catch (e) {}
  _refreshCommentThreadUINow(fil);
}
// Un identifiant de fil connu ICI à la fois comme PUBLICATION et comme ACTIVITÉ
// n'a pas de propriétaire sûr (red team RV-38, P2). Les identifiants sont choisis
// par le client : un compte peut publier sous l'identifiant de l'activité d'autrui,
// et `_findCommentThread` cherchant d'abord une publication, l'auteur de la
// publication homonyme passait pour le propriétaire de l'activité — ses épingles
// s'affichaient sur elle. La garde du serveur refuse d'épingler dans un fil
// ambigu ; ici, il n'a ni épingle lue, ni reçue, ni posée. Une lecture
// impossible des activités vaut ambiguïté : sans propriétaire sûr, aucune épingle.
function _filAmbigu(fil) {
  if (!fil || typeof findPostAnywhere !== "function" || !findPostAnywhere(fil)) return false;
  try {
    return typeof allEvents === "function" && allEvents().some(function (e) { return e && e.id === fil; });
  } catch (e) {
    try { diagLog("epingle_fil_ambigu : " + (e && e.message)); } catch (_e) {}
    return true;
  }
}
// Le PROPRIÉTAIRE du fil : l'auteur de la publication, l'organisateur de
// l'activité — la définition même de la garde du serveur (`posts.author_id`,
// `coalesce(nullif(organizer_id, ''), author_id)`, que `organizerId` reprend :
// `organizer_id || author_id`). Inconnu ici, ou fil homonyme : null, et rien
// ne se décide.
function _proprietaireFil(fil) {
  if (!fil || _filAmbigu(fil)) return null;
  var t = (typeof _findCommentThread === "function") ? _findCommentThread(fil) : null;
  var p = t ? t.targetUserId : null;
  if (p === "me") p = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : null;
  return (typeof p === "string" && p) ? p : null;
}
// La règle de lecture, PURE. `lignes` : les lignes « pin » du propriétaire, dans
// le fil, de la plus RÉCENTE à la plus ancienne. Le « 1 » le plus récent
// l'emporte, sauf si un « 0 » plus récent vise ce même commentaire. Rend
// l'identifiant épinglé, ou null.
function _epingleDesLignes(lignes) {
  var retires = new Set();
  for (var i = 0; i < (lignes || []).length; i++) {
    var l = lignes[i];
    if (!l || !l.comment_id) continue;
    var val = l.payload == null ? "" : String(l.payload);
    if (val === "1") return retires.has(l.comment_id) ? null : l.comment_id;
    if (val === "0") retires.add(l.comment_id);
  }
  return null;
}
// La discussion de ce fil est-elle À L'ÉCRAN (modale, feuille, page détail d'une
// publication ou d'une activité) ? Ni `_openCommentsPostId` ni les conteneurs
// ne le disent seuls : `closeModal` ne remet pas le premier à zéro, et les pages
// détail restent dans le DOM, cachées, après fermeture (contre-revue du delta,
// P4 : une modale fermée lisait encore l'épinglé).
function _discussionAffichee(fil) {
  try {
    var bd = document.getElementById("modalBackdrop");
    var modale = !!(bd && bd.classList.contains("active"));
    var sel = '[data-thread="' + CSS.escape(String(fil)) + '"]';
    if (modale && window._openCommentsPostId === fil && document.getElementById("commentsBox")) return true;
    if (modale && document.querySelector("#cmtThreadList" + sel)) return true;
    var visible = function (el) { return !!(el && el.getClientRects().length); };
    if (visible(document.querySelector("#postDetailComments" + sel))) return true;
    return window._openEventDetailId === fil && visible(document.getElementById("eventCommentsList"));
  } catch (e) { return false; }
}
// Lit la vérité du fil (`hydrateCommentInteractions`, à l'ouverture d'une
// discussion) et l'applique, si rien de plus récent ne l'a dépassée pendant la
// lecture : une épingle posée PENDANT l'écriture ou reçue en direct avance la
// génération, et une réponse partie avant elle est périmée (contre-revue : R1).
// `apres` : une promesse à attendre avant d'appliquer — les interactions de
// l'hydratation (P2-A). Ni sauvegarde ni repeinte quand l'épinglé ne change pas
// (contre-revue du delta, P2-B : chaque ouverture envoyait `user_state` en entier).
async function _lireEpingleFil(fil, apres) {
  try {
    if (!fil || typeof supaLireEpingleFil !== "function") return;
    var gen = _epingleGeneration(fil);
    var proprio = _proprietaireFil(fil);
    if (!proprio || !COMPTE_EPINGLE_RE.test(proprio)) {
      // Devenu HOMONYME depuis la dernière lecture : ce qu'on en savait ne vaut plus
      // (contre-revue de 3224fa0, B3 — la clé de `_epinglesFil` est partagée par la
      // publication et l'activité de même identifiant).
      if (_filAmbigu(fil)) {
        var t0 = _findCommentThread(fil);
        var avant0 = _idEpingleFil(fil, t0 && t0.comments);
        _poserEpingleFil(fil, null);
        if (avant0) _refreshCommentThreadUINow(fil);
      }
      return;
    }
    var lignes = await supaLireEpingleFil(fil, proprio);
    if (apres) { try { await apres; } catch (_e) {} }
    if (!lignes) return;                      // une lecture en échec ne décide de rien
    if (_epinglesEnVol[fil] || _epingleGeneration(fil) !== gen) return;
    var t = _findCommentThread(fil);
    var avant = _idEpingleFil(fil, t && t.comments);
    var cid = _epingleDesLignes(lignes);
    _poserEpingleFil(fil, cid);
    var parti = _retirerEpinglesGardes(fil, cid);
    if (cid !== avant || parti) _sauverEtRepeindreFil(fil);
    if (cid) await _assurerCommentaireEpingle(fil, cid);
  } catch (e) { try { diagLog(EPINGLE_DU_FIL + " : " + (e && e.message)); } catch (_e) {} }
}
// L'épinglé doit être à l'écran même hors de la première page (les 30 plus
// récents) : il est lu par son identifiant et rangé dans la discussion — le
// rendu le met en tête, « précédents » ne le redouble pas (dédoublonné par id).
// Une publication seulement (les commentaires d'une activité sont lus en entier),
// et seulement si sa discussion est à l'écran.
async function _assurerCommentaireEpingle(fil, cid) {
  var cle = fil + "\u0001" + cid;
  try {
    var t = _findCommentThread(fil);
    if (!t || t.kind !== "post" || !Array.isArray(t.comments)) return;
    var deja = t.comments.find(function (c) { return c && c.id === cid; });
    // Apporté par une page : rien à faire. GARDÉ par la fusion (lu à part, plus
    // ancien que la page) : sa présence en base se revérifie, une fois par page
    // relue, sans quitter l'écran pendant ce temps (contre-vérification de 84cb6b3, D1).
    if (deja && !(deja._epingleGarde && deja._aVerifier)) return;
    if (!_discussionAffichee(fil) || typeof supaLireCommentaire !== "function" || _epinglesACharger[cle]) return;
    _epinglesACharger[cle] = true;
    var c = await supaLireCommentaire(fil, cid);
    if (deja) {
      if (c === false) {
        // La base dit qu'il n'existe plus (supprimé par son auteur, la modération) :
        // il part — LUI seul. Une lecture en ÉCHEC ne prouve rien : il reste, à revérifier.
        if (_retirerEpinglesGardes(fil, null, cid)) _refreshCommentThreadUINow(fil);
      } else if (c) delete deja._aVerifier;
      return;
    }
    if (!c) return;
    var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(fil) : null;
    if (!post) return;
    // « Gardé » seulement s'il est HORS des pages chargées (plus ancien que la plus
    // ancienne, et il en reste) ; sinon c'est un commentaire comme les autres, rangé
    // à sa place — écrit depuis mon autre appareil, ou arrivé après la page : il ne
    // doit pas quitter la liste avec l'épingle (contre-vérification de d38d2fb, P3-a).
    if (post._commentsSuite && (c.createdAt || 0) < _plancherPages(t.comments)) c._epingleGarde = true;
    // Sur TOUTES les copies (fil, `userPosts`, bobines) : une seule ne suffit pas.
    _copiesDiscussion(fil, post).forEach(function (copie) {
      if (!Array.isArray(copie.comments)) copie.comments = [];
      if (copie.comments.some(function (x) { return x && x.id === cid; })) return;
      var i = copie.comments.findIndex(function (x) { return x && (x.createdAt || 0) < (c.createdAt || 0); });
      if (i < 0) copie.comments.push(c); else copie.comments.splice(i, 0, c);
    });
    // Ses propres « j'aime » et réponses ; l'épingle, elle, est déjà connue.
    if (typeof hydrateCommentInteractions === "function") await hydrateCommentInteractions({ id: fil, comments: [c] }, { epingle: false });
    var e = _epingleConnue(fil);
    if (e && e.cid === cid) _poserEpingleFil(fil, cid);
    // Repeint, sans sauvegarde : la page suivante le garde (`_fusionnerPageCommentaires`),
    // et rien de ce fil ne part dans `user_state` (P2-B).
    _refreshCommentThreadUINow(fil);
  } catch (err) {
    try { diagLog("epingle_charger : " + (err && err.message)); } catch (_e) {}
  } finally { delete _epinglesACharger[cle]; }
}
// Une épingle REÇUE en direct (`_applyCommentInteractionEvent`) : seule celle du
// propriétaire du fil compte — y compris la mienne venue d'un autre de mes
// appareils. Un « 0 » ne retire que l'épinglé qu'il vise.
function _epingleRecue(r) {
  try {
    var fil = r && r.post_id;
    if (!fil || !r.comment_id) return;
    var t = _findCommentThread(fil);
    if (!t || !Array.isArray(t.comments)) return;
    var proprio = _proprietaireFil(fil);
    if (!proprio || r.user_id !== proprio) return;
    var val = r.payload == null ? "" : String(r.payload);
    if (val !== "1" && val !== "0") return;
    var avant = _idEpingleFil(fil, t.comments);
    var cid = val === "1" ? r.comment_id : (avant === r.comment_id ? null : avant);
    // Une lecture partie avant cette ligne est périmée, même quand rien ne change.
    _epingleNouvelleGeneration(fil);
    // Reçue PENDANT une écriture de ce fil (un autre appareil du propriétaire, ou
    // l'écho de la mienne) : la fin de l'écriture relira le fil au lieu de
    // réimposer son propre état (contre-revue du delta, P4).
    // L'écho d'une de MES écritures en cours n'est pas un autre appareil : il ne
    // coûte pas de relecture (contre-vérification de 84cb6b3, D2).
    // Mais il PROUVE que l'écriture a abouti : si sa réponse se perd (panne), la fin
    // du geste relit le fil au lieu de remettre l'ancien épinglé (contre-vérification
    // de d38d2fb, P4-a).
    if (_epinglesEnVol[fil]) {
      if ((_epinglesEcrites[fil] || []).indexOf(r.comment_id + "|" + val) < 0) _epinglesRecuesEnVol[fil] = true;
      else _epinglesEchoEnVol[fil] = true;
    }
    _poserEpingleFil(fil, cid);
    var parti = _retirerEpinglesGardes(fil, cid);
    if (cid === avant && !parti) return;   // l'écho de ce qu'on sait : rien à repeindre
    // Repeinte SANS sauvegarde : la vérité vit en base et se relit à chaque
    // ouverture ; sauver ici envoyait `user_state` en entier à chaque spectateur,
    // pour chaque épingle reçue — un coût que le propriétaire pouvait provoquer
    // (contre-revue du delta, P2-B ; de 3224fa0, B1).
    _refreshCommentThreadUINow(fil);
    if (cid) _assurerCommentaireEpingle(fil, cid);
  } catch (e) { try { diagLog("epingle_recue : " + (e && e.message)); } catch (_e) {} }
}
// Une ligne d'épingle RETIRÉE en direct (la ligne vient de l'index R37) : une
// purge — le commentaire, la publication — ou le retour arrière de la migration.
// La vérité du fil se RELIT : elle ne se déduit pas d'une ligne qui n'est plus
// (red team RV-38 : l'épingle restait affichée jusqu'à la lecture suivante). Une
// discussion fermée se relit à sa prochaine ouverture. UNE relecture par rafale :
// une purge retire beaucoup de lignes d'un coup, et chacune coûtait une lecture
// à chaque spectateur (contre-revue de 3224fa0, B1 — l'amplification que R37
// avait écartée).
var EPINGLE_RELECTURE_MS = 300;
var _epinglesARelire = {};     // fil → minuterie de la relecture qui suit une rafale de retraits
function _epingleRetiree(r) {
  try {
    var fil = r && r.post_id;
    if (!fil || !_discussionAffichee(fil)) return;
    _epingleNouvelleGeneration(fil);   // une lecture partie avant le retrait est périmée
    clearTimeout(_epinglesARelire[fil]);
    _epinglesARelire[fil] = setTimeout(function () {
      delete _epinglesARelire[fil];
      if (_discussionAffichee(fil)) _lireEpingleFil(fil);
    }, EPINGLE_RELECTURE_MS);
  } catch (e) { try { diagLog("epingle_retiree : " + (e && e.message)); } catch (_e) {} }
}
// Ce que dit un refus, selon sa nature. 23514 : la contrainte de la base n'admet
// pas (encore) l'épingle ; 42501 : la garde ou la RLS la refuse — au propriétaire
// lui-même (seul à voir ce geste) : un commentaire que la base ne rattache pas à
// ce fil, ou un compte en cours de suppression.
function _motRefusEpingle(res) {
  if (res && res.reseau) return "Pas de connexion : l'épingle n'a pas été enregistrée";
  if (res && res.code === "23514") return "L'épingle n'est pas encore disponible : rien n'a été enregistré";
  if (res && res.code === "42501") return "Épingle refusée : ce commentaire ne peut pas être épinglé";
  return "L'épingle n'a pas été enregistrée";
}
async function togglePinComment(threadId, commentId) {
  try {
    var thread = _findCommentThread(threadId);
    if (!thread) return;
    var target = thread.comments.find(function (c) { return c.id === commentId; });
    if (!target) return;
    if (!_isThreadOwner(threadId)) { toast("Seul l'auteur du fil peut épingler un commentaire"); return; }
    // Un fil homonyme (une publication et une activité sous le même identifiant) :
    // la garde du serveur refuse d'y épingler, ce client n'y lit aucune épingle.
    if (_filAmbigu(threadId)) { toast("Épingle indisponible sur ce fil"); return; }
    // Pas encore en base (publication : `_pending` ; activité : `ec_local_…`) : la garde
    // le refuserait, et le refus dirait autre chose que la vraie raison.
    if (target._pending || /^ec_local_/.test(String(target.id))) {
      toast("Ce commentaire n'est pas encore envoyé : épingle-le dans un instant");
      return;
    }
    if (_epinglesEnVol[threadId]) return;   // un geste à la fois par fil
    var connueAvant = _epingleConnue(threadId);
    var actuel = _idEpingleFil(threadId, thread.comments);
    var willPin = actuel !== commentId;
    _poserEpingleFil(threadId, willPin ? commentId : null);
    _sauverEtRepeindreFil(threadId);
    var reel = window._supaReal && typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID
      && typeof supaEcrireInteraction === "function";
    if (!reel) { toast(willPin ? "Commentaire épinglé" : "Épingle retirée"); return; }   // aucune base : rien à partager
    _epinglesEnVol[threadId] = (_epinglesEnVol[threadId] || 0) + 1;
    delete _epinglesRecuesEnVol[threadId];
    delete _epinglesEchoEnVol[threadId];
    _epinglesEcrites[threadId] = [commentId + "|" + (willPin ? "1" : "0")].concat(willPin && actuel ? [actuel + "|0"] : []);
    _epingleNouvelleGeneration(threadId);
    var res;
    try {
      // La CIBLE d'abord : refusée, rien n'a été écrit, et l'écran revient
      // exactement à l'état d'avant. Le « 0 » de l'ancien ensuite, et seulement
      // si elle passe : le lecteur de ce client n'en a pas besoin (le « 1 » le
      // plus récent l'emporte) ; celui d'avant RV-38, qui lit commentaire par
      // commentaire, si.
      res = await supaEcrireInteraction(commentId, threadId, "pin", willPin ? "1" : "0");
      if (res.ok && willPin && actuel) {
        var r0 = await supaEcrireInteraction(actuel, threadId, "pin", "0");
        if (!r0.ok) { try { diagLog("epingle_ancienne : " + (r0.code || r0.message || "refus")); } catch (_e) {} }
      }
    } finally {
      _epinglesEnVol[threadId]--;
      if (!_epinglesEnVol[threadId]) { delete _epinglesEnVol[threadId]; delete _epinglesEcrites[threadId]; }
      // Une lecture partie PENDANT l'écriture est périmée elle aussi.
      _epingleNouvelleGeneration(threadId);
    }
    // Une épingle du propriétaire reçue PENDANT l'écriture (un autre de ses
    // appareils) : ni la confirmation ni le retour en arrière ne la réécrasent —
    // la base tranche, relue (contre-revue du delta, P4).
    var recue = !!_epinglesRecuesEnVol[threadId];
    var echo = !!_epinglesEchoEnVol[threadId];
    delete _epinglesRecuesEnVol[threadId];
    delete _epinglesEchoEnVol[threadId];
    if (res && res.ok) {
      // Les objets ont pu être reconstruits pendant l'écriture (une page relue) :
      // la vérité du fil se réapplique aux objets COURANTS.
      if (recue) _lireEpingleFil(threadId);
      else {
        _poserEpingleFil(threadId, willPin ? commentId : null);
        _retirerEpinglesGardes(threadId, willPin ? commentId : null);
        _sauverEtRepeindreFil(threadId);
      }
      toast(willPin ? "Commentaire épinglé" : "Épingle retirée");
      return;
    }
    // L'écho de MON écriture est arrivé : elle a abouti, sa réponse s'est perdue en
    // route. Rien à défaire : la base tranche, relue, et l'écran dit ce qui est.
    if (echo) {
      _lireEpingleFil(threadId);
      toast(willPin ? "Commentaire épinglé" : "Épingle retirée");
      return;
    }
    // Refusée ou perdue : l'écran revient à l'état d'avant, et le DIT.
    _poserEpingleFil(threadId, connueAvant ? connueAvant.cid : actuel);
    if (!connueAvant) delete _epinglesFil[threadId];
    _sauverEtRepeindreFil(threadId);
    // Un autre appareil a parlé pendant l'écriture : la base tranche, relue.
    if (recue) _lireEpingleFil(threadId);
    try { diagLog("epingle_refusee : " + ((res && (res.code || res.message)) || "inconnu")); } catch (_e) {}
    toast(_motRefusEpingle(res));
  } catch (e) {
    try { diagLog("epingle : " + (e && e.message)); } catch (_e) {}
  }
}

// Signale un commentaire (modération) → table reports via supaReport.
// Même correctif que `reportUser` (2026-09-10) : porte, `await`, verdict lu.
async function reportCommentEntry(threadId, commentId) {
  if (!commentId) return;
  try {
    if (typeof requireAuthentication === "function" && !requireAuthentication("signaler")) return;
  } catch (e) {}
  var motif = await _demanderMotifSignalement("ce commentaire");
  if (motif === null) return;
  var ok = false;
  try { if (typeof supaReport === "function") ok = await supaReport("comment", commentId, motif); } catch (e) { ok = false; }
  toast(ok
    ? "Commentaire signalé. Merci, on s'en occupe."
    : "Signalement déjà envoyé, ou impossible pour le moment.", ok ? "success" : "warning");
  if (ok && typeof _accuserReceptionSignalement === "function") _accuserReceptionSignalement();
}

// ───────── Feuille de commentaires inline (IRL / CDV sans ouvrir le détail) ─────────
// Ouvre une modale légère avec le fil de commentaires riche + un champ de saisie,
// pour commenter/voir les commentaires d'un événement ou d'un live directement
// depuis la carte de liste.
function openCommentSheet(threadId, title) {
  var thread = _findCommentThread(threadId);
  if (!thread) { toast("Commentaires indisponibles"); return; }
  // ⚠️ PAS d'entrée d'historique ici non plus : `openModal`, appelé juste en
  // dessous, en pose déjà une. Cf. openComments.
  window._openCommentsPostId = null; // ce n'est pas la modale post
  var empty = '<div class="empty"><div class="empty-icon">💭</div><div class="empty-title">Sois le premier à réagir</div></div>';
  var initial = thread.comments.length ? _renderCommentsList(thread.comments, threadId) : empty;
  openModal(
    '<div class="modal-handle"></div>'
    // ⚠️ `title` VIENT D'UN AUTRE COMPTE (c'est le titre d'une activité, posé par
    //    la carte de « Rencontrer »), et il atterrissait BRUT dans un innerHTML.
    //    `escapeJsArg` à l'appel ne suffit pas : il ferme la chaîne JS, pas le
    //    HTML — le parseur décode l'attribut AVANT que JS ne reçoive l'argument,
    //    si bien qu'un titre `<img src=x onerror=…>` s'exécutait à l'ouverture de
    //    la feuille, chez tous ceux qui touchent la pastille de commentaires.
    //    C'est le contexte d'escapeHtml, et il se pose ICI, à l'affichage.
    + '<div class="modal-title">' + escapeHtml(title || "Commentaires") + '</div>'
    + '<div class="modal-subtitle">Réponds à cette publication.</div>'
    + '<div id="cmtThreadList" data-thread="' + escapeHtml(threadId) + '" style="max-height:52vh;overflow-y:auto;margin-bottom:12px;">' + initial + '</div>'
    + '<div style="display:flex;gap:6px;align-items:center;">'
    + '<input type="text" class="input" id="cmtThreadInput" placeholder="Écris un commentaire…" maxlength="500" style="flex:1;" onkeypress="if(event.key===\'Enter\')submitCommentSheet(\'' + escapeJsArg(threadId) + '\')"/>'
    + _cmtComposerToolsHtml("cmtThreadInput", "submitCommentSheet", threadId)
    + '<button class="btn primary" onclick="submitCommentSheet(\'' + escapeJsArg(threadId) + '\')">Envoyer</button>'
    + '</div>'
  );
  // Le sujet privé de cette discussion (`fil:<id>`, app-08).
  try { if (typeof _filsRtReconcilier === "function") _filsRtReconcilier(); } catch (e) {}
  // Hydrate / charge les commentaires distants selon le contexte.
  if (thread.kind === "event" && typeof _loadEventComments === "function") {
    _loadEventComments(threadId); // écrit dans #cmtThreadList (cf. _renderEventComments)
  } else if (thread.comments.length && typeof hydrateCommentInteractions === "function") {
    hydrateCommentInteractions({ id: threadId, comments: thread.comments }).then(function(){
      var b = document.getElementById("cmtThreadList");
      if (b && b.getAttribute("data-thread") === threadId) _setThreadHtml(b, _renderCommentsList(thread.comments, threadId));
    });
  }
}

function submitCommentSheet(threadId) {
  // Mode invité (première visite) : cette action engage le compte. Le gate
  // EXPLIQUE l'action puis propose la création de compte ; il ne rejoue jamais
  // l'action après coup. Rend `true` — donc inerte — hors mode invité.
  if (window.requireAuthentication && !requireAuthentication("commenter")) return;
  var inp = document.getElementById("cmtThreadInput");
  if (!inp || !inp.value.trim()) return;
  var thread = _findCommentThread(threadId);
  if (!thread) return;
  if (thread.kind === "event" && typeof addEventComment === "function") {
    addEventComment(threadId); // lit #cmtThreadInput en repli, re-render #cmtThreadList
  } else if (typeof submitComment === "function") {
    // Fil : réutilise le chemin post (champ texte différent → on délègue manuellement)
    var t = inp.value.trim(); inp.value = "";
    var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(threadId) : null;
    if (post) {
      if (!post.comments) post.comments = [];
      var _cid = "c_" + uid();
      var p = (typeof currentProfile === "function") ? currentProfile() : null;
      var realAuthorId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
      post.comments.unshift({ id: _cid, authorId: realAuthorId, authorName: (p && p.name) || state.user.name || "Moi", authorEmoji: (p && p.emoji) || "✨", text: t, content: t, createdAt: Date.now(), _pending: true });
      if (typeof supaAddComment === "function" && typeof MY_UID !== "undefined" && MY_UID) {
        Promise.resolve(supaAddComment(threadId, t, _cid)).then(function (ok) { if (ok) _commentaireConfirme(threadId, _cid); }).catch(function () {});
      }
      _refreshCommentThreadUI(threadId);
      try { _patchPostCommentCount(threadId); } catch (e) {}
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
  // ⚠️ L'échappement maison ne traitait QUE l'apostrophe : un guillemet double
  // dans submitArg fermait l'attribut onclick lui-même. escapeJsArg couvre les deux.
  var arg = submitArg != null ? "'" + escapeJsArg(submitArg) + "'" : "null";
  // UN SEUL bouton 😊 (toolbar allégée) : le panneau emoji contient un onglet GIF.
  return '<button type="button" class="cmt-tool-btn" title="Emoji & GIF" aria-label="Ajouter un emoji ou un GIF" onclick="cmtComposerEmoji(\'' + escapeJsArg(inputId) + '\',event,\'' + escapeJsArg(submitFn) + '\',' + arg + ')">😊</button>';
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
  // Set emoji COMPLET (280+, catégorisé + recherchable) partagé avec la
  // messagerie ; repli sur la liste courte si app-09 pas encore chargé.
  var emojis = (typeof EMOJIS !== "undefined" && EMOJIS && EMOJIS.length)
    ? EMOJIS
    : (window._PASSIO_EMOJI_LIST
      || ["😀","😂","😍","🥰","😎","😭","😡","👍","🙏","🔥","❤️","🎉","✨","💯","😅","🤔","😴","🥳","😇","🙌","👏","😢","😱","🤗","😋","🤩","😉","😘","🤤","😏"]);
  var panel = document.createElement("div");
  panel.id = "cmt-emoji-composer";
  // z-index 100002 : AU-DESSUS du .modal-backdrop (10001, viewer CDV) et de la
  // feuille de réponse .cmt-sheet-ov (10001) d'où ce panel peut être ouvert.
  panel.style.cssText = "position:fixed;background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:10px;z-index:100002;box-shadow:0 6px 24px rgba(0,0,0,0.28);width:288px;box-sizing:border-box;";

  // ── Onglets segmentés (Emoji | GIF) ──
  var seg = document.createElement("div");
  seg.style.cssText = "display:flex;gap:4px;background:var(--bg-deep);border-radius:999px;padding:3px;margin-bottom:8px;";
  var tabEmoji = document.createElement("button");
  var tabGif = document.createElement("button");
  function styleTab(b, active) {
    b.style.cssText = "flex:1;border:none;border-radius:999px;font-size:12.5px;font-weight:700;padding:7px 10px;cursor:pointer;transition:all .15s;"
      + (active ? "background:var(--accent);color:#fff;box-shadow:0 1px 4px rgba(124,58,237,0.35);" : "background:transparent;color:var(--muted);");
  }
  tabEmoji.type = "button"; tabEmoji.textContent = "Emoji";
  tabGif.type = "button"; tabGif.textContent = "GIF";
  seg.appendChild(tabEmoji); seg.appendChild(tabGif);
  panel.appendChild(seg);

  // ── Conteneur de contenu (emoji OU gif) ──
  var content = document.createElement("div");
  panel.appendChild(content);

  function _insertEmoji(e) { _cmtInsertAtCursor(inp, e); }
  // Envoi RÉEL du GIF (après validation). Le texte EST l'URL → rendu en image par
  // _commentBodyHtml. Si un submitFn est fourni on l'appelle, sinon on laisse
  // l'URL dans le champ pour que l'utilisateur valide avec le bouton Envoyer du
  // composeur (ex. composeur de réponse).
  function _sendGif(url) {
    inp.value = url;
    if (submitFn && typeof window[submitFn] === "function") { try { window[submitFn](submitArg); } catch (e) {} }
    else { inp.focus(); if (typeof toast === "function") toast("GIF prêt — appuie sur Envoyer ✓"); }
    panel.remove();
  }

  function showEmoji() {
    styleTab(tabEmoji, true); styleTab(tabGif, false);
    content.innerHTML = "";
    // ── Recherche emoji (filtre par labels d'EMOJI_DATA, comme la messagerie) ──
    var search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Rechercher un emoji…";
    search.setAttribute("aria-label", "Rechercher un emoji");
    search.style.cssText = "width:100%;box-sizing:border-box;margin-bottom:8px;padding:8px 12px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg-deep);color:var(--text);font-size:16px;outline:none;";
    search.onclick = function (e) { e.stopPropagation(); };
    var grid = document.createElement("div");
    grid.style.cssText = "display:flex;flex-wrap:wrap;gap:2px;max-height:200px;overflow-y:auto;";
    content.appendChild(search);
    content.appendChild(grid);
    function renderGrid(list) {
      grid.innerHTML = "";
      if (!list.length) {
        var empty = document.createElement("div");
        empty.style.cssText = "width:100%;padding:18px;text-align:center;color:var(--muted);font-size:13px;";
        empty.textContent = "Aucun emoji trouvé";
        grid.appendChild(empty);
        return;
      }
      list.forEach(function (e) {
        var b = document.createElement("span");
        b.textContent = e;
        b.style.cssText = "cursor:pointer;font-size:18px;line-height:1;padding:5px;border-radius:8px;transition:background .15s,transform .1s;";
        b.onmouseover = function () { this.style.background = "rgba(124,58,237,0.18)"; this.style.transform = "scale(1.18)"; };
        b.onmouseout = function () { this.style.background = "transparent"; this.style.transform = "scale(1)"; };
        b.onclick = function (ev) { ev.stopPropagation(); _insertEmoji(e); };
        grid.appendChild(b);
      });
    }
    search.oninput = function () {
      var q = (search.value || "").toLowerCase().trim();
      if (!q) { renderGrid(emojis); return; }
      // Filtre par labels quand EMOJI_DATA est dispo, sinon sous-chaîne brute.
      var list = (typeof EMOJI_DATA !== "undefined" && EMOJI_DATA && EMOJI_DATA.length)
        ? EMOJI_DATA.filter(function (d) { return d.labels && d.labels.indexOf(q) !== -1; }).map(function (d) { return d.emoji; })
        : emojis.filter(function (e) { return e.indexOf(q) !== -1; });
      renderGrid(list);
    };
    renderGrid(emojis);
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
    search.placeholder = (typeof passioGifPlaceholder === "function") ? passioGifPlaceholder() : "Rechercher un GIF…";
    search.setAttribute("aria-label", "Rechercher un GIF");
    search.style.cssText = "width:100%;box-sizing:border-box;margin-bottom:8px;padding:8px 12px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg-deep);color:var(--text);font-size:16px;outline:none;";
    search.onclick = function (e) { e.stopPropagation(); };
    var grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-height:200px;overflow-y:auto;";
    content.appendChild(search);
    content.appendChild(grid);
    // ── Zone de VALIDATION : le GIF choisi s'affiche ici + bouton Envoyer. On ne
    // partage RIEN tant que l'utilisateur n'a pas validé (demande explicite). ──
    var stage = document.createElement("div");
    stage.style.cssText = "display:none;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);";
    var stagePrev = document.createElement("img");
    stagePrev.style.cssText = "width:44px;height:44px;border-radius:8px;object-fit:cover;flex-shrink:0;";
    var stageSend = document.createElement("button");
    stageSend.type = "button"; stageSend.textContent = "Envoyer ✓";
    stageSend.style.cssText = "flex:1;border:none;border-radius:10px;background:var(--accent);color:#fff;font-weight:700;font-size:13px;padding:9px 10px;cursor:pointer;";
    var stageCancel = document.createElement("button");
    stageCancel.type = "button"; stageCancel.textContent = "✕";
    stageCancel.setAttribute("aria-label", "Annuler le GIF");
    stageCancel.style.cssText = "border:1px solid var(--border);background:var(--bg-deep);color:var(--muted);border-radius:10px;font-size:13px;padding:9px 11px;cursor:pointer;";
    stage.appendChild(stagePrev); stage.appendChild(stageSend); stage.appendChild(stageCancel);
    content.appendChild(stage);
    var _staged = null;
    function _stageGif(url) { _staged = url; stagePrev.src = url; stage.style.display = "flex"; }
    stageSend.onclick = function (ev) { ev.stopPropagation(); if (_staged) _sendGif(_staged); };
    stageCancel.onclick = function (ev) { ev.stopPropagation(); _staged = null; stage.style.display = "none"; };
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
        cellEl.style.cssText = "aspect-ratio:1/1;background:var(--bg-soft);border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid var(--border);transition:border-color .15s;";
        var img = document.createElement("img");
        img.loading = "lazy"; img.decoding = "async"; img.src = gifUrl; img.alt = "GIF";
        img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
        cellEl.appendChild(img);
        cellEl.onmouseover = function () { this.style.borderColor = "var(--accent)"; };
        cellEl.onmouseout = function () { if (_staged !== gifUrl) this.style.borderColor = "var(--border)"; };
        // Clic = SÉLECTION (prévisualisation), pas envoi. L'envoi se fait via « Envoyer ✓ ».
        cellEl.onclick = function (evt) {
          evt.stopPropagation(); evt.preventDefault();
          grid.querySelectorAll("div").forEach(function (c) { c.style.borderColor = "var(--border)"; });
          cellEl.style.borderColor = "var(--accent)";
          _stageGif(gifUrl);
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
  var _staged = null; // { kind:"emoji"|"gif", val }
  function close() { panel.remove(); try { document.removeEventListener("click", cl); } catch (e) {} }
  function commit() {
    if (!_staged) return;
    try {
      if (_staged.kind === "emoji" && onEmoji) onEmoji(_staged.val);
      else if (_staged.kind === "gif" && onGif) onGif(_staged.val);
    } catch (err) {}
    close();
  }
  // Ligne de VALIDATION : l'emoji OU le gif choisi s'affiche ici + « Envoyer ✓ ».
  // Rien n'est appliqué tant qu'on n'a pas validé (demande explicite : prévisualiser
  // le choix sur une ligne avant de l'envoyer, PARTOUT — même panneau qu'ailleurs).
  var stage = document.createElement("div");
  stage.style.cssText = "display:none;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);";
  var stageFace = document.createElement("div");
  stageFace.style.cssText = "width:40px;height:40px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:26px;background:var(--bg-deep);overflow:hidden;";
  var stageSend = document.createElement("button");
  stageSend.type = "button"; stageSend.textContent = "Envoyer ✓";
  stageSend.style.cssText = "flex:1;border:none;border-radius:10px;background:var(--accent);color:#fff;font-weight:700;font-size:13px;padding:9px 10px;cursor:pointer;";
  var stageCancel = document.createElement("button");
  stageCancel.type = "button"; stageCancel.textContent = "✕"; stageCancel.setAttribute("aria-label", "Annuler le choix");
  stageCancel.style.cssText = "border:1px solid var(--border);background:var(--bg-deep);color:var(--muted);border-radius:10px;font-size:13px;padding:9px 11px;cursor:pointer;";
  stage.appendChild(stageFace); stage.appendChild(stageSend); stage.appendChild(stageCancel);
  stageSend.onclick = function (ev) { ev.stopPropagation(); commit(); };
  stageCancel.onclick = function (ev) { ev.stopPropagation(); _staged = null; stage.style.display = "none"; };
  function pickEmoji(e) { _staged = { kind: "emoji", val: e }; stageFace.textContent = e; stageFace.innerHTML = e; stage.style.display = "flex"; }
  function pickGif(url) { _staged = { kind: "gif", val: url }; stageFace.innerHTML = '<img src="' + safeUrlAttr(url) + '" style="width:100%;height:100%;object-fit:cover;"/>'; stage.style.display = "flex"; }

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
    search.placeholder = (typeof passioGifPlaceholder === "function") ? passioGifPlaceholder() : "Rechercher un GIF…";
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
    tabEmoji.type = "button"; tabEmoji.textContent = "Emoji";
    tabGif.type = "button"; tabGif.textContent = "GIF";
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
  panel.appendChild(stage); // ligne de validation (prévisualiser avant d'envoyer)

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

// ======== BOUTIQUE PASSIA — SUPPRIMÉE (ADR-009) ========
// Packs Passia, Pass Passion, achats simulés, crédit de solde et `setWalletTab`
// sont sortis du produit avec l'écran Wallet. Un besoin de paiement futur devra
// être un paiement DIRECT en monnaie réelle, sans monnaie intermédiaire PASSIO.

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
let _profileCacheGeneration = 0;
// Vidé à la déconnexion par purgeAccountScopedData (app-02). Le rechargement qui
// suit emporterait ce cache de toute façon, mais il peut échouer ou tarder : les
// profils consultés par le compte sortant ne doivent pas rester en mémoire.
function _clearProfileCache() { try { _profileCacheGeneration++; _profileCache.clear(); } catch (e) {} }

// Cache pré-rempli depuis les convs déjà connues
function _primeProfileCache(convs) {
  (convs || []).forEach(function(c) {
    // Jamais par-dessus une entrée déjà résolue : le nom gardé dans une
    // conversation est une COPIE, figée au moment où elle a été créée.
    if (c.userId && c.userName && !_profileCache.has(c.userId)) {
      _profileCache.set(c.userId, { username: c.userName, emoji: c.userEmoji || "✨", color: c.userColor || "#8b5cf6" });
    }
  });
}

// Récupère un profil avec cache — zéro requête Supabase si déjà connu
async function _fetchProfile(userId) {
  if (_profileCache.has(userId)) return _profileCache.get(userId);
  try {
    const { data, error } = await supa.from("profiles").select("username,emoji,color,avatar_url").eq("id", userId).maybeSingle();
    const repli = { username: "Passionné", emoji: "✨", color: "#8b5cf6", photoUrl: null };
    // ⚠️ `error` n'était pas lu : une coupure réseau ou un refus RLS momentané
    // donnait `data` vide, et le repli anonyme était MIS EN CACHE. Toute la session
    // affichait alors « Passionné ✨ » sans photo pour cette personne, jusqu'au
    // rechargement — un incident d'une seconde empoisonnait l'affichage durablement.
    // On ne met en cache que ce qu'on a réellement obtenu.
    if (error) { console.warn("profil " + userId + " :", error.message); return repli; }
    const prof = data ? { username: data.username || "Passionné", emoji: data.emoji || "✨", color: data.color || "#8b5cf6", photoUrl: data.avatar_url || null } : repli;
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
      // Même règle que _unionConvsById : un message sans id doit être conservé,
      // pas jeté. Clé de contenu en repli (émetteur + horodatage + début du texte).
      var _cle = function (m) {
        if (!m) return null;
        if (m.id) return "id:" + m.id;
        return "sig:" + (m.from || "") + "|" + (m.at || 0) + "|" + String(m.text || "").slice(0, 40);
      };
      var mainIds = new Set((main.messages||[]).map(_cle).filter(Boolean));
      var extraMsgs = (c.messages || []).filter(function(m){ var k = _cle(m); return k && !mainIds.has(k); });
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
  result.forEach(_dedoublonnerDecorConversation);
  return result;
}

// ⚠️ LE DÉCOR NE SE DÉDOUBLE PAS (2026-11-10). Les messages des cinq fils de
// démonstration (`SEED_CONVERSATIONS`) n'ont pas d'identifiant, et leur
// horodatage est RELATIF au démarrage (`Date.now() - 90 min`). La fusion des
// deux stores les reconnaît par « émetteur | horodatage | texte » : une graine
// semée à un autre démarrage est donc, pour elle, une AUTRE série de messages.
// Mesuré sur un appareil neuf, sans rien faire de spécial : 1ʳᵉ visite — la
// graine part dans IndexedDB (« migration initiale »), rien dans localStorage ;
// 2ᵉ visite — `getConversations()` sème une graine fraîche, `hydrateConvsFromIDB`
// l'unit à celle d'IndexedDB : chaque message d'exemple apparaît DEUX fois
// (8 au lieu de 4 dans « Léa Moreau »), puis l'état doublé est sauvegardé.
// Le même chemin s'ouvre chaque fois qu'un des deux stores manque (purge ITP
// de localStorage sur iPhone, quota).
// Un fil de démonstration est en lecture seule (`_estConvDemo` y refuse
// l'envoi) : deux messages sans identifiant, du même émetteur et du même texte,
// y sont forcément deux copies du décor. On garde la plus ANCIENNE (le fil
// vieillit comme il a été vu), on adopte les champs qu'elle n'a pas, et la date
// du fil suit son dernier message. Passe par `deduplicateConversations` : la
// lecture, la fusion ET la sauvegarde — un appareil déjà doublé se répare au
// prochain démarrage. Verrou : `controle-general-2026-11-10.spec.js` ⑥.
function _dedoublonnerDecorConversation(c) {
  try {
    if (!c || !Array.isArray(c.messages) || c.messages.length < 2) return;
    if (typeof SEED_CONVERSATIONS === "undefined" || !SEED_CONVERSATIONS.some(function (s) { return s.id === c.id; })) return;
    var vus = {};
    var gardes = [];
    c.messages.slice()
      .sort(function (a, b) { return ((a && a.at) || 0) - ((b && b.at) || 0); })
      .forEach(function (m) {
        if (!m) return;
        // Identifié, ou sans texte (une pièce jointe) : ce n'est pas le décor écrit.
        if (m.id || !m.text) { gardes.push(m); return; }
        var cle = (m.from || "") + "|" + String(m.text);
        var deja = vus[cle];
        if (!deja) { vus[cle] = m; gardes.push(m); return; }
        Object.keys(m).forEach(function (champ) {
          if (deja[champ] === undefined || deja[champ] === null || deja[champ] === "") deja[champ] = m[champ];
        });
      });
    if (gardes.length === c.messages.length) return;
    c.messages = gardes;
    var dernier = gardes[gardes.length - 1];
    if (dernier && dernier.at) c.lastAt = dernier.at;
  } catch (e) {
    try { if (typeof diagLog === "function") diagLog("conv_decor_doublons : " + (e && e.message)); } catch (_e) {}
  }
}

// ⚠️ UNE CONVERSATION DE DÉMONSTRATION SE DIT (UXO-03, contre-revue Astra,
// 2026-09-14). Cinq fils fictifs (`SEED_CONVERSATIONS`, interlocuteurs `u_…`
// absents de la base) étaient rendus comme de vraies conversations : nom sans
// étiquette, pastille « 3 » de non-lus sur l'onglet Messages, et un message
// qu'on y écrivait partait vers un compte qui n'existe pas. Même règle que le
// fil (`contenuDemoSignale`) : le décor se dit, ne compte pas, ne répond pas.
function _estConvDemo(c) {
  if (!c) return false;
  if (typeof SEED_CONVERSATIONS !== "undefined" && SEED_CONVERSATIONS.some(function (s) { return s.id === c.id; })) return true;
  // Un interlocuteur du SOCLE de démonstration (`state.seed.users`) — jamais un
  // simple préfixe `u_` : les bancs s'en servent pour des fixtures réelles.
  // ⚠️ ET JAMAIS UN PROFIL RÉEL MIS EN CACHE DANS CE MÊME TABLEAU (2026-09-15) :
  // `cacheRemoteProfile` (app-02) et les auteurs de stories y entrent avec
  // `distant: true`. Sans ce filtre, écrire à un vrai membre dont le profil
  // venait d'être chargé rendait « Conversation de démonstration » et
  // n'envoyait rien — mesuré sur le staging, le jour même du correctif UXO-03.
  try { return !c.isGroup && !!c.userId && (state.seed.users || []).some(function (u) { return u && u.id === c.userId && !u.distant; }); } catch (e) { return false; }
}
// ⚠️ LE NOM D'UNE CONVERSATION EST UNE COPIE (2026-10-13). `c.userName` est
// écrit à la création du fil et ne suivait plus le profil : un membre qui
// changeait de pseudo restait affiché sous l'ancien nom dans la liste Messages,
// alors que la ligne des passions, lue sur le profil vivant, était à jour —
// « Profil » au lieu de « Ben test 1 sur portable ». Le profil RÉEL mis en
// cache (`distant: true`, app-02) fait foi ; la copie est réalignée sur lui.
// Rend `true` si la conversation a changé (à sauvegarder).
function _alignerIdentiteConv(c) {
  if (!c || c.isGroup || !c.userId || typeof userById !== "function") return false;
  var u = null;
  try { u = userById(c.userId); } catch (e) { return false; }
  if (!u || !u.distant) return false;
  var change = false;
  if (u.name && u.name !== "Passionné" && u.name !== c.userName) { c.userName = u.name; change = true; }
  if (u.photoUrl && u.photoUrl !== c.userPhoto) { c.userPhoto = u.photoUrl; change = true; }
  return change;
}
// Non-lus RÉELS : la démonstration ne fait pas clignoter une pastille.
function _convNonLus() {
  var n = 0;
  // LOT-7 (MSG-C02) : une conversation en sourdine ne compte pas aux badges.
  try { (getConversations() || []).forEach(function (c) { if (!_estConvDemo(c) && !c._muted && !c.muted) n += (c.unread || 0); }); } catch (e) {}
  return n;
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
// ─── JOURNAL DES SUPPRESSIONS (pierres tombales locales) ────────────────────
// ADR-008. Les conversations vivent dans DEUX stores : localStorage (écriture
// synchrone) et IndexedDB (asynchrone, best-effort, résultat jamais lu). Au
// boot, _unionConvsById fusionne les deux — et cette union, qui existe pour ne
// jamais perdre un message, défaisait les suppressions : si l'onglet se ferme
// entre les deux écritures, la suppression n'existe que d'un côté et l'autre
// store la ressuscite. Reproduit le 2026-08-16 : une conversation et un message
// privé supprimés revenaient après redémarrage.
//
// Le journal donne aux deux stores ce qui leur manquait : de quoi distinguer
// « jamais existé » de « supprimé ». La propriété qu'on ne veut PAS perdre est
// préservée — la fusion continue de ne rien faire disparaître qui n'ait été
// explicitement supprimé ici.
//
// BORNÉ, délibérément : identifiants seuls, TTL 30 jours, 2000 entrées au plus.
// Sans ces bornes, ce journal deviendrait le prochain blob de 4,7 Mo
// (cf. SYNC-B64-005). Au-delà de 30 jours, le store distant fait autorité.
var CONV_TOMB_KEY = "passio_conv_deleted_v1";
var CONV_TOMB_TTL_MS = 30 * 24 * 60 * 60 * 1000;
var CONV_TOMB_MAX = 2000;

function convTombLoad() {
  try {
    var raw = localStorage.getItem(CONV_TOMB_KEY);
    if (!raw) return {};
    var j = JSON.parse(raw) || {};
    var limite = Date.now() - CONV_TOMB_TTL_MS, garde = {}, n = 0;
    Object.keys(j).forEach(function (k) { if (typeof j[k] === "number" && j[k] > limite) { garde[k] = j[k]; n++; } });
    // Si le plafond est dépassé, on garde les plus RÉCENTES : une suppression
    // ancienne a déjà été propagée partout, une récente peut encore être défaite.
    if (n > CONV_TOMB_MAX) {
      var tri = Object.keys(garde).sort(function (x, y) { return garde[y] - garde[x]; }).slice(0, CONV_TOMB_MAX);
      var reduit = {}; tri.forEach(function (k) { reduit[k] = garde[k]; });
      return reduit;
    }
    return garde;
  } catch (e) { return {}; }
}

// kind = "conv" | "msg". L'identifiant est préfixé pour qu'une conversation et
// un message ne puissent jamais se masquer l'un l'autre.
function convTombAdd(kind, id) {
  if (!id) return;
  try {
    var j = convTombLoad();
    j[kind + ":" + id] = Date.now();
    localStorage.setItem(CONV_TOMB_KEY, JSON.stringify(j));
  } catch (e) {}
}

function convTombHas(journal, kind, id) {
  return !!(id && journal && journal[kind + ":" + id]);
}
function convTombRemove(kind, id) {
  if (!id) return;
  try {
    var j = convTombLoad();
    delete j[kind + ":" + id];
    localStorage.setItem(CONV_TOMB_KEY, JSON.stringify(j));
  } catch (e) {}
}

// ⚠️ CE QUI EST SUPPRIMÉ NE RESSUSCITE PAS AU RECHARGEMENT SERVEUR (MSG-06,
// 2026-09-14). Le journal n'était consulté que par la fusion LOCALE
// (`_unionConvsById`) : `openConversation` réinjectait tout message serveur
// absent en local, le boot remettait toute conversation serveur, « Effacer le
// fil » ne vidait que le tableau local, « Supprimer la conversation » ne posait
// aucune pierre tombale. « Supprimer pour moi », puis rouvrir : le message
// était de retour.
//   · kind "clr" : le fil a été effacé à cet instant — tout message ANTÉRIEUR
//     (`at <= clr`) reste masqué, d'où qu'il vienne (fusion, réouverture, boot) ;
//   · kind "conv" : la conversation a été supprimée — elle n'est pas remise par
//     le boot ni par la fusion. Un NOUVEAU message de l'autre la fait
//     réapparaître, avec ce seul message (`_handleIncomingConvMessage` lève la
//     pierre "conv", garde "clr") — comme une messagerie ordinaire.
// Un seul point décide si un message est masqué : `_msgMasquePourMoi`.
function convClearedAt(journal, convId) {
  var v = journal && convId ? journal["clr:" + convId] : 0;
  return typeof v === "number" ? v : 0;
}
function _msgMasquePourMoi(journal, convId, m) {
  if (!m) return false;
  if (convTombHas(journal, "msg", m.id)) return true;
  var clr = convClearedAt(journal, convId);
  return !!(clr && (Number(m.at) || 0) <= clr);
}
// Conversations venues du serveur, expurgées de ce qui a été supprimé ici.
function _filtrerConvsServeur(convs) {
  var j = convTombLoad();
  return (convs || []).filter(function (c) { return c && c.id && !convTombHas(j, "conv", c.id); })
    .map(function (c) {
      if (!Array.isArray(c.messages)) return c;
      var gardes = c.messages.filter(function (m) { return !_msgMasquePourMoi(j, c.id, m); });
      return gardes.length === c.messages.length ? c : Object.assign({}, c, { messages: gardes });
    });
}

function _unionConvsById(a, b) {
  var _tomb = convTombLoad();
  var byId = {};
  [].concat(a || [], b || []).forEach(function(c) {
    if (!c || !c.id) return;
    if (convTombHas(_tomb, "conv", c.id)) return;   // conversation supprimée : ne ressuscite pas
    var ex = byId[c.id];
    if (!ex) { byId[c.id] = Object.assign({}, c, { messages: (c.messages || []).slice() }); return; }
    // ⚠️ Un message SANS id était purement et simplement ignoré ici : il n'entrait
    // jamais dans `ids`, et la boucle suivante le rejetait. Les messages des
    // conversations de démo n'ont pas d'id, et rien ne garantit qu'un message
    // venu d'ailleurs en ait toujours un. On leur fabrique une clé de contenu
    // (émetteur + horodatage + début du texte) : deux copies du même message se
    // dédupliquent, une copie unique n'est plus perdue.
    var cle = function (m) {
      if (!m) return null;
      if (m.id) return "id:" + m.id;
      return "sig:" + (m.from || "") + "|" + (m.at || 0) + "|" + String(m.text || "").slice(0, 40);
    };
    var ids = {};
    (ex.messages || []).forEach(function(m) { var k = cle(m); if (k) ids[k] = 1; });
    var parCle = {};
    (ex.messages || []).forEach(function(m) { var k = cle(m); if (k) parCle[k] = m; });
    (c.messages || []).forEach(function(m) {
      var k = cle(m);
      if (!k) return;
      if (!ids[k]) { ex.messages.push(m); ids[k] = 1; parCle[k] = m; return; }
      // Message présent des DEUX côtés : la copie retenue est celle d'IndexedDB, et
      // l'autre était jetée avec tout ce qu'elle portait en plus (réactions posées
      // depuis, statut de lecture, média résolu). On ne peut pas arbitrer « la plus
      // récente » — un message ne porte aucun horodatage de modification — alors on
      // ne tranche pas : on ADOPTE les champs que la copie retenue n'a pas. Union
      // strictement additive, aucune donnée ne peut être perdue par ce chemin.
      var garde = parCle[k];
      if (!garde || garde === m) return;
      Object.keys(m).forEach(function (champ) {
        var absent = garde[champ] === undefined || garde[champ] === null || garde[champ] === "";
        if (absent) garde[champ] = m[champ];
      });
    });
    if ((c.lastAt || 0) > (ex.lastAt || 0)) { ex.lastAt = c.lastAt; }
  });
  return Object.keys(byId).map(function(k) {
    // Filtrage des messages supprimés en UN SEUL point, à la sortie : les deux
    // branches ci-dessus (première copie et copies fusionnées) y passent
    // forcément. Le faire dans chaque branche laisserait un chemin non couvert.
    byId[k].messages = byId[k].messages.filter(function (m) { return !_msgMasquePourMoi(_tomb, k, m); });
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
    // ⚠️ `undefined` = LECTURE IMPOSSIBLE, pas « store vide » (cf. idbGet).
    // Confondre les deux faisait écraser le store durable par l'état local :
    // sur iPhone, où l'ITP peut avoir purgé localStorage au bout de sept jours
    // pendant qu'IndexedDB survivait, une erreur passagère effaçait TOUT
    // l'historique des conversations. En cas de doute on ne touche à rien : on
    // réessaiera au prochain démarrage.
    if (idbConvs === undefined) { _idbConvHydrated = false; return; }
    if (!idbConvs || !idbConvs.length) {
      // Migration initiale : pousser l'état actuel dans IDB.
      if (window.idbConvSave) window.idbConvSave(getConversations());
      return;
    }
    // ⚠️ getConversations(), PAS `conversationsState || []`. Cette fonction tourne en
    // tête de boot(), quand conversationsState est encore null : la « fusion sans
    // perte » se réduisait alors à _unionConvsById(idbConvs, []) — localStorage
    // n'était JAMAIS lu. Et comme conversationsState se retrouvait rempli juste
    // après, getConversations() n'allait plus jamais le consulter non plus.
    // Or idbConvSave est best-effort (il résout false sans que saveConversations
    // le vérifie) : un message écrit dans localStorage mais pas dans IndexedDB
    // disparaissait définitivement au démarrage suivant.
    var current = (typeof getConversations === "function") ? (getConversations() || []) : (conversationsState || []);
    conversationsState = deduplicateConversations(_unionConvsById(idbConvs, current));
    try { if (typeof renderMessages === "function") renderMessages(); } catch(e) {}
  }).catch(function() {});
}

// ⚠️ LE VERROU DE DÉCONNEXION VAUT AUSSI POUR LES CONVERSATIONS (D-01, audit
// du 2026-11-02). `doLogout` purge localStorage ET IndexedDB, puis
// `location.reload()` 1,2 s plus tard déclenche `beforeunload`, où `supaInit`
// a branché `saveConversationsNow` : `conversationsState` — encore en mémoire
// avec les messages privés du compte sortant — était RÉÉCRIT dans les deux
// stores. Mesuré au banc : après déconnexion + rechargement, « Message privé
// de A » était de retour dans `passio_conversations_v1`, dans IndexedDB et dans
// `getConversations()` du compte suivant. `saveState` consulte `_accountPurged`
// depuis le 2026-08-12 ; ces deux fonctions ne le faisaient pas (la fiche de
// `sortirCompteSansSession`, app-08, le disait déjà). Même verrou, même règle :
// une fois la purge faite, plus rien ne s'écrit. Verrou :
// audit-2026-11-navigation.spec.js ⑤ (rouge sur le code d'avant).
function _conversationsPurgees() {
  try { return typeof _accountPurged !== "undefined" && _accountPurged === true; } catch (e) { return false; }
}
function saveConversations() {
  if (_conversationsPurgees()) return;
  // Debounce : évite des dizaines d'écritures localStorage en rafale.
  // La déduplication (parcours de TOUTES les convs + messages) est aussi dans le
  // debounce : elle tournait en synchrone à CHAQUE appel (jank sur chaque envoi).
  clearTimeout(_saveConvTimer);
  _saveConvTimer = setTimeout(function() {
    if (_conversationsPurgees()) return;
    if (conversationsState) conversationsState = deduplicateConversations(conversationsState);
    try { localStorage.setItem("passio_conversations_v1", JSON.stringify(conversationsState)); } catch(e) {}
    // Store DURABLE (IndexedDB, sans limite ~5 Mo) : si le localStorage ci-dessus
    // échoue sur quota, les données restent sauvegardées ici sans perte.
    if (window.idbConvSave) window.idbConvSave(conversationsState);
  }, 250);
}

// Sauvegarde immédiate pour les cas critiques (fermeture de page, etc.)
function saveConversationsNow() {
  clearTimeout(_saveConvTimer);
  if (_conversationsPurgees()) return;
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
    
    <div style="font-weight:800;font-size:16px;margin-bottom:14px;">Nouveau message</div>
    <div style="position:relative;">
      <input id="_nmSearch" type="text" class="input" placeholder="Chercher un utilisateur…" autocomplete="off"
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

// La question actuellement posée par le champ de recherche, normalisée comme
// `_nmDoSearch` la reçoit. Sert à jeter une réponse réseau devenue obsolète.
function _nmRequeteCourante() {
  var inp = document.getElementById("_nmSearch");
  return plierRecherche(((inp && inp.value) || "").trim());
}

function _nmDoSearch(q) {
  var box = document.getElementById("_nmResults");
  if (!box) return;
  // La saisie BRUTE part au serveur (son ilike trouve « Léa » si l'on tape « léa ») ;
  // la version pliée sert aux comparaisons locales (MSG-C06).
  var brut = (q || "").trim();
  q = plierRecherche(brut);

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
  // LOT-5 (audit UX/UI du 2026-11-10, MSG-C03) : un COMPTE ne se voit proposer que
  // de vraies personnes. Les personnages d'exemple (cinq « Passionné » pour un
  // compte neuf, auxquels on ne peut pas écrire) sortent des suggestions comme
  // des résultats ; sans contact, une consigne au lieu de faux contacts.
  var compte = (typeof _compteAuthReel === "function") && _compteAuthReel();
  if (compte) all = all.filter(function (u) { return !estPersonneExemple(u.id); });
  // LOT-6 (REC-C03) : ni personne bloquée.
  all = all.filter(function (u) { return !(typeof isBlocked === "function" && isBlocked(u.id)); });

  var matches = q ? all.filter(function(u) { return plierRecherche(u.name).includes(q); }) : all;
  matches = matches.slice(0, 10);

  if (matches.length === 0) {
    box.innerHTML = (compte && !q)
      ? `<div class="nm-consigne" style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">Écris le nom d'une personne pour la trouver.</div>`
      : `<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">Aucun utilisateur trouvé</div>`;
    // Lancer aussi la recherche Supabase si query non vide
    if (q && typeof supaSearchUsers === "function" && supa && MY_UID) {
      // ⚠️ GARDE D'OBSOLESCENCE. Les réponses reviennent dans l'ordre du réseau,
      // pas dans celui de la frappe : taper « ab » puis « abc » pouvait laisser
      // la réponse d'« ab » écraser celle d'« abc ». On ne peint que si la
      // question posée est encore la question courante.
      var _qA = q;
      supaSearchUsers(brut).then(function(res) {
        if (_nmRequeteCourante() !== _qA) return;
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
    var _qB = q;
    supaSearchUsers(brut).then(function(res) {
      if (_nmRequeteCourante() !== _qB) return;   // cf. garde d'obsolescence
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
  return `<div class="_nm-row" data-uid="${escapeHtml(id)}" data-name="${escapeHtml(esc)}" data-emoji="${escapeHtml(emoji)}" data-color="${escapeHtml(color)}" data-photo="${escapeHtml(photoUrl || '')}"
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

  var q = plierRecherche(query.trim());

  // Seed local
  var seedUsers = ((state.seed && state.seed.users) ? state.seed.users : []).filter(function(u) {
    return plierRecherche(u.name).includes(q) || plierRecherche(u.passion).includes(q);
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
        passions: (typeof passionsPubliques === "function") ? passionsPubliques(u.passions) : (u.passions || []),
        bio: u.bio || ""
      };
    });

    // Seed : exclure ceux déjà dans Supabase
    var seedFiltered = seedUsers.filter(function(u) { return !supaIds.has(u.id); });
    // LOT-6 (REC-C03) : une personne bloquée n'est pas un résultat.
    var matches = supaFormatted.concat(seedFiltered).filter(function (u) { return !(typeof isBlocked === "function" && isBlocked(u.id)); }).slice(0, 8);

    if (matches.length === 0) {
      results.innerHTML = "<div style='padding:14px 16px;color:var(--muted);font-size:13px;text-align:center;'>Aucun utilisateur trouvé</div>";
      return;
    }

    results.innerHTML = matches.map(function(u) {
      var nameEsc = escapeHtml(u.name || "Passionné");
      var emoji = u.profileEmoji || "✨";
      // 2026-11-13 : plus de ligne de passions sous le pseudo dans la messagerie
      // (demande de Benjamin : « ce n'est pas joli et trop chargé »). Le pseudo
      // seul, comme dans la liste des conversations.
      // ⚠️ data-emoji recevait `profiles.emoji` BRUT dans un attribut simple-quoté :
      // une valeur du type `' onmouseover='…` refermait l'attribut et ouvrait un
      // gestionnaire d'événement. Tout ce qui entre ici doit être échappé, y compris
      // l'identifiant.
      return "<div class='msg-user-result-row' data-uid='" + escapeHtml(u.id || "") + "' data-name='" + nameEsc + "' data-emoji='" + escapeHtml(emoji) + "' data-avatar='" + escapeHtml(u.avatar||"#8b5cf6") + "' data-photo='" + escapeHtml(u.photoUrl || '') + "' onclick='_pickMsgUser(this)' style='display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);'>" +
        // ⚠️ ATTRIBUT EN GUILLEMETS, PAS EN APOSTROPHES : `avatarBg` émet ses propres
        // apostrophes (`url('…')`), et un attribut délimité par `'` se refermait
        // donc sur la première d'entre elles — balise cassée dès qu'un compte de
        // cette liste porte une photo. Pas une injection (`_cssUrl` encode les
        // apostrophes venues de l'URL), un défaut d'affichage. Préexistant.
        '<div style="width:38px;height:38px;border-radius:50%;background:' + avatarBg(u) + ';display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">'
         + avatarInner(u) + "</div>" +
        "<div style='flex:1;min-width:0;'>" +
          "<div style='font-weight:700;font-size:13px;color:var(--text);'>" + nameEsc + "</div>" +
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
  // ⚠️ Ouvrir un DM avec un compte que J'AI bloqué créait la conversation EN
  // BASE (`supaCreateConversation` insère les deux membres), puis `renderMessages`
  // la masquait au rendu : la ligne restait, et la conversation redevenait
  // visible au déblocage comme si elle avait toujours existé. On refuse en
  // amont. Seul ce sens est décidable ici — `blocks` est en `blocks_select_own`,
  // donc « on m'a bloqué » exige une fonction serveur (#134, constats 2 et 3).
  if (userId && typeof isBlocked === "function" && isBlocked(userId)) {
    toast("Compte bloqué — débloque-le pour lui écrire", "warning");
    return;
  }
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

// Vrai si un blocage existe entre ce compte et moi ET que ce n'est pas MOI qui
// ai bloqué — c'est donc lui. `is_blocked_with` (SECURITY DEFINER, comptes
// seulement) répond pour les deux sens sans révéler lequel ; le sens « moi »
// se lit dans ma propre liste. Visiteur, compte d'exemple, panne : faux — le
// profil s'affiche comme avant.
async function _profilIndisponiblePourMoi(authorId) {
  try {
    if (!authorId || typeof supa === "undefined" || !supa || !window._supaReal) return false;
    if (typeof _uidEstUnCompte === "function" && !_uidEstUnCompte()) return false;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(authorId))) return false;
    if (typeof isBlocked === "function" && isBlocked(authorId)) return false;
    var r = await supa.rpc("is_blocked_with", { _other: String(authorId) });
    return !!(r && !r.error && r.data === true);
  } catch (e) { return false; }
}

async function openUserProfile(authorId, source) {
  // Première visite : trace l'OUVERTURE d'un contenu par un visiteur — un
  // compteur, jamais un identifiant ni un libellé. Inerte hors mode invité.
  try { if (window.PassioFirstRun) PassioFirstRun.contenuOuvert("profil"); } catch (e) {}
  // ⚠️ PAS d'entrée d'historique ici : le profil visité s'affiche dans une
  // modale, et `openModal` en pose déjà une. Cf. openComments.

  console.log("[openUserProfile] authorId:", authorId, "source:", source);

  if (source === "me" || authorId === "me" || (typeof MY_UID !== "undefined" && MY_UID && authorId === MY_UID)) {
    goTo("profiles");
    return;
  }

  // PRO-C20 (décision de Benjamin du 2026-11-13, « 3 : b ») : le profil d'un
  // compte qui M'A bloqué n'est pas affiché — « Ce profil n'est pas
  // disponible », comme un compte supprimé, sans bouton menant à un refus
  // certain. (Un compte que J'AI bloqué garde son profil et « Débloquer », LOT-16.)
  if (await _profilIndisponiblePourMoi(authorId)) {
    openModal(`
      <div class="modal-handle"></div>
      <div class="modal-title">Ce profil n'est pas disponible</div>
      <div class="modal-subtitle">Il a peut-être été supprimé, ou n'est pas visible pour toi.</div>
      <button class="btn primary block" onclick="closeModal()">Fermer</button>
    `);
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
      let { data, error } = await supa.from("profiles").select(VISITED_PROFILE_COLS).eq("id", authorId).limit(1);
      console.log("[openUserProfile] Supabase response (by id):", data, "error:", error);

      // Si pas trouvé par ID, chercher par username (en cas de confusion entre ID et username)
      if ((!data || data.length === 0) && authorId && !authorId.startsWith("u_")) {
        console.log("[openUserProfile] Pas trouvé par id, cherchant par username:", authorId);
        const { data: dataByUsername } = await supa.from("profiles").select(VISITED_PROFILE_COLS).ilike("username", authorId).limit(1);
        if (dataByUsername && dataByUsername.length > 0) {
          data = dataByUsername;
          console.log("[openUserProfile] Trouvé par username:", dataByUsername);
        }
      }

      if (data && data.length > 0) {
        const profile = data[0];
        user = { id: profile.id, name: profile.username || "Passionné", profileEmoji: profile.emoji || "✨", avatar: profile.color || "#8b5cf6", passion: profile.passion_id || "", passions: Array.isArray(profile.passions) ? ((typeof passionsPubliques === "function") ? passionsPubliques(profile.passions) : profile.passions) : undefined, bio: profile.bio || "", photoUrl: profile.avatar_url || null, coverUrl: profile.cover_url || null, isPrivate: !!profile.is_private, rsLinks: Array.isArray(profile.rs_links) ? profile.rs_links : [] };
        try { cacheRemoteProfile(profile); } catch(e) {}
        // Profil RÉEL : `distant` — sinon `_estConvDemo` le prendrait pour un
        // personnage du socle et refuserait de lui écrire (2026-09-15).
        user.distant = true;
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

  // Ouverture par un LIEN PARTAGÉ (app-06) : le blocage se juge sur le compte
  // RÉSOLU, jamais sur la valeur reçue — celle-ci peut avoir été retrouvée par
  // pseudo. Seconde couche derrière la garde de forme du routeur. Bornée à la
  // source « lien » : les autres appelants gardent leur comportement d'avant.
  if (source === "lien" && typeof isBlocked === "function" && (isBlocked(user.id) || isBlocked(authorId))) {
    toast("Ce profil n'est pas disponible");
    return;
  }

  // ⚠️ À PARTIR D'ICI, L'IDENTIFIANT EST CELUI DU COMPTE RÉSOLU, JAMAIS LA VALEUR REÇUE
  // (2026-11-10, CLI-01 de l'audit de stabilisation). Le compte peut avoir été retrouvé
  // PAR PSEUDO (plus haut), et un pseudo n'est borné par la base qu'en longueur : un
  // guillemet y passe. La valeur reçue restait pourtant l'identifiant de toute la fiche —
  // écrite brute dans l'attribut `id` du bouton « Suivre », où un pseudo qui ferme le
  // guillemet puis écrit son propre attribut de clic posait SON code sur le bouton (le
  // premier attribut gagne), et passée telle quelle au suivi,
  // à la messagerie et aux lectures `author_id`, qui ne trouvaient rien.
  // (Ne pas recopier ici le début littéral de cet attribut : `suivre-compte-prive` ⑦
  // cherche sa PREMIÈRE occurrence dans ce fichier pour lire le gabarit.)
  // Verrou : tests/e2e/profil-visite-identifiant-hostile.spec.js.
  if (user.id && user.id !== authorId) authorId = user.id;

  // 🔄 Charger le profil COMPLET depuis Supabase (toujours, même si user déjà
  // trouvé en local) : passions enrichies (bio/photos), couverture, réseaux
  // sociaux, mode privé — pour reproduire le MÊME visuel que « mon profil ».
  let userPassions = [];
  const _profileId = user.id || authorId;
  if (typeof supa !== "undefined" && supa && _profileId) {
    try {
      const { data } = await supa.from("profiles")
        .select(VISITED_PROFILE_COLS)
        .eq("id", _profileId)
        .maybeSingle();
      if (data) {
        // Passions ARCHIVÉES retirées ici : publiées pour ne pas être perdues,
        // jamais montrées à un visiteur (cf. `passionsPubliques`, app-02).
        const _pubs = (typeof passionsPubliques === "function") ? passionsPubliques(data.passions) : (data.passions || []);
        if (_pubs.length) {
          userPassions = _pubs;
        } else if (data.passion_id) {
          userPassions = [{ id: data.passion_id, emoji: data.emoji || "✨" }];
        }
        // Enrichir le user avec les données fraîches de Supabase
        if (data.bio && !user.bio) user.bio = data.bio;
        if (data.avatar_url && !user.photoUrl) user.photoUrl = data.avatar_url;
        if (data.cover_url) user.coverUrl = data.cover_url;
        user.isPrivate = !!data.is_private;
        if (Array.isArray(data.rs_links)) user.rsLinks = data.rs_links;
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

  // 🎯 FILTRES de passion (ADR-010). Ces pastilles filtrent les publications de
  // la personne ; elles ne sont PAS des identités.
  //
  // ⚠️ Elles étaient jusqu'au 2026-08-30 de grandes `.profile-card` — photo,
  // couverture, bio par passion — multisélectionnables, c'est-à-dire visuellement
  // indiscernables d'une liste de comptes. Deux écrans jumeaux racontaient alors
  // deux modèles : mon profil avait déjà un filtre à choix UNIQUE avec un neutre
  // « Toutes », le profil visité gardait la multisélection d'avant. On aligne sur
  // la mécanique de mon écran, et sur le vocabulaire d'ADR-010.
  //
  // ⚠️ `p.emoji` vient du jsonb `profiles.passions` d'un AUTRE compte, colonne
  // que tout compte authentifié écrit librement sur SA ligne : un
  // `<img src=x onerror=…>` s'y exécutait avant le correctif du 2026-08-30.
  // Ne JAMAIS retirer l'échappement ci-dessous.
  // ⚠️ MÊME COMPOSANT QUE LE FIL ET QUE MON PROFIL (refonte multi-passion, §1).
  // Ces pastilles étaient d'abord de grandes `.profile-card` — indiscernables
  // d'une liste de comptes — puis des puces `.v10-vfilter` propres à cet écran.
  // Elles deviennent les BULLES `passionTileHTML` (app-02) : un seul rendu, donc
  // les mêmes dimensions et les mêmes états partout où une passion se choisit.
  // Le choix reste UNIQUE ici, comme sur mon profil.
  //
  // ⚠️ `p.emoji` et `p.label` viennent du jsonb `profiles.passions` d'un AUTRE
  // compte, colonne que toute session authentifiée écrit librement sur SA ligne :
  // un `<img src=x onerror=…>` s'y exécutait avant le correctif du 2026-08-30.
  // `passionTileHTML` échappe (texte + `safeUrlAttr` pour la photo) ; ne jamais
  // contourner ce chemin.
  const passionsHTML = userPassions.length > 0
    ? '<div id="visitedPassions" class="profile-strip v9-profile-strip" role="group" aria-label="Filtrer ses publications par passion">'
      + userPassions.map(p => {
          const pas = passionById(p.id);
          // ⚠️ L'ORDRE compte. `passionById` ne rend JAMAIS null : sur un id
          // inconnu il retombe sur `{ label: "Passion" }`. Placer son résultat
          // en premier rendait donc `p.label` — le libellé publié par l'auteur
          // dans le jsonb, justement pour ce cas — définitivement inatteignable.
          // Conséquence : une passion personnalisée s'affichait « 🧶 Passion »
          // chez tous les autres comptes, qui n'ont pas ce catalogue.
          const _catalogue = (pas && pas.label) || "";
          const label = (_catalogue && _catalogue !== "Passion" ? _catalogue : "")
            || p.label || _catalogue || "Passion";
          return passionTileHTML({
            emoji: p.emoji || "\u2728",
            label: label,
            photoUrl: passionPhotoUrl(pas),
            fallbackUrl: passionPhotoFallback(p.id),
            selected: false,
            dimmed: false,
            action: "visitedPassion", arg: p.id,
            title: label,
            tileKey: p.id,
          });
        }).join("")
      + '</div>'
    : '';

  // ⚠️ AUCUNE LIGNE DE PASSIONS SOUS LE PSEUDO, comme sur mon profil depuis le
  // 2026-09-02 (« supprime les titres de passion dans le profil sous le pseudo et
  // garde seulement les bulles dessous »). Ses passions sont dans
  // `#visitedPassions`, plus bas : elles s'y nomment une fois, et le tap y FILTRE
  // ses publications au lieu de quitter son profil.

  // 🔗 Réseaux sociaux — mêmes pastilles que sur mon profil.
  var RS_ICONS = { instagram:"📸", facebook:"👤", tiktok:"🎵", youtube:"▶️", twitter:"𝕏", linkedin:"💼", snapchat:"👻", autre:"🔗" };
  var rsLinks = Array.isArray(user.rsLinks) ? user.rsLinks : [];

  // 🔒 Compte privé : le contenu (posts/bobines/carnets) est réservé aux
  // abonnés ; l'en-tête (avatar, pseudo, passions, stats) reste visible.
  var isFollowing = (state.user.following || []).includes(authorId);
  var canSeeContent = !user.isPrivate || isFollowing;

  // 📚 TOUT le contenu de l'auteur : ce qu'on a déjà en local (fil + bobines,
  // qu'allFeedPosts exclut) ENRICHI d'un chargement serveur ciblé (ses posts
  // plus anciens que la page courante du fil n'étaient sinon jamais visibles).
  var localPosts = [
    ...(state.seed.posts || []),
    ...(state.supabasePosts || []),
    ...(state.userPosts || []),
  ].filter(function(p) { return p && p.authorId === authorId; });
  if (canSeeContent && typeof supaLoadPosts === "function" && window._supaReal) {
    try {
      var serverPosts = await supaLoadPosts(0, authorId);
      // Fusion dans le cache global : findPostAnywhere / openReelById (viewer
      // Bobines) / commentaires doivent retrouver ces posts hors de la modale.
      state.supabasePosts = state.supabasePosts || [];
      (serverPosts || []).forEach(function(sp) {
        if (!state.supabasePosts.some(function(p) { return p.id === sp.id; })) state.supabasePosts.push(sp);
      });
      localPosts = localPosts.concat(serverPosts || []);
    } catch(e) {}
  }
  var seenIds = new Set();
  var userPosts = localPosts.filter(function(p) {
    if (!p || !p.id || seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  }).sort(function(a,b) { return (b.createdAt||0) - (a.createdAt||0); });

  var postCount = userPosts.length;
  var followerCount = 0;
  var followingCount = 0;

  // Charger les vrais comptes abonnés / abonnements depuis Supabase
  if (typeof supa !== "undefined" && supa) {
    try {
      const [fRes, gRes] = await Promise.all([
        seulementAbonnementsAcceptes(supa.from("follows").select("*", { count: "exact", head: true }).eq("following_id", authorId)),
        seulementAbonnementsAcceptes(supa.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", authorId)),
      ]);
      followerCount = fRes.count || 0;
      followingCount = gRes.count || 0;
    } catch(e) {}
  }

  // État partagé de la vue « profil visité » : posts + sélections passion/type.
  // Conventions IDENTIQUES à mon écran profil : rien de coché = aucun filtre.
  // ⚠️ `isPrivate` EST PUBLIÉ EXPLICITEMENT, et pas déduit de `locked`.
  // `locked` vaut `isPrivate && !isFollowing` : s'en servir conflerait « compte
  // privé » et « je n'y ai pas accès », deux notions qui divergeront au premier
  // lot qui touche l'une des deux. C'est la SEULE trace de confidentialité d'un
  // compte visité côté client (`_profileCache` ne porte pas `is_private`).
  window._visited = { authorId: authorId, isPrivate: !!user.isPrivate, posts: userPosts, passionSel: new Set(), tabSel: new Set(), locked: !canSeeContent };

  // Onglets de contenu : MÊMES 5 icônes que sur mon profil (multi-sélection).
  var _VTAB_SVGS = {
    posts:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 9h8"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>',
    photos:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M4 17l4.5 -4.5a2 2 0 0 1 2.8 0L16 17"/><path d="M14 14.5l1.6 -1.6a2 2 0 0 1 2.8 0L20 14.5"/></svg>',
    videos:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="2.5"/><path d="M16 10.5l4.2 -2.6a.6 .6 0 0 1 .9 .5v7.2a.6 .6 0 0 1 -.9 .5l-4.2 -2.6z"/></svg>',
    bobines: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 4v16"/><path d="M16 4v16"/><path d="M4 8h4"/><path d="M4 16h4"/><path d="M16 8h4"/><path d="M16 16h4"/></svg>',
    // ⚠️ « carnets » a été REMPLACÉ par « audio » le 2026-08-31 : le Carnet de
    // voyage a quitté l'application (ADR-011 §6) et son onglet ne pouvait plus
    // rien montrer, tandis que le format audio/podcast, lui, se publie depuis
    // toujours sans avoir jamais eu de sous-filtre. Mon profil et le profil
    // visité tirent désormais du MÊME référentiel (`PROFILE_TAB_KEYS`, app-06).
    audio:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11c0 3.9 3.1 7 7 7s7-3.1 7-7"/><path d="M12 18v3.5"/><path d="M9 21.5h6"/></svg>'
  };
  var _VTAB_TITLES = { posts: "Posts", photos: "Photos", videos: "Vidéos", bobines: "Bobines", audio: "Audio / podcast" };
  // ⚠️ 2026-08-31 : plus de ligne d'aide au-dessus des sous-filtres (mon profil
  // l'a perdue le même jour). Les icônes portent déjà leur libellé.
  var tabsHTML = canSeeContent
    ? '<div class="profile-tabs" id="visitedTabs" role="group" aria-label="Filtrer par type de contenu (multi-sélection)">'
      + ((typeof PROFILE_TAB_KEYS !== "undefined") ? PROFILE_TAB_KEYS : ["posts","photos","videos","bobines","audio"]).map(function(k) {
          return '<button class="profile-tab" data-vtab="' + escapeHtml(k) + '" aria-pressed="false" onclick="switchVisitedTab(\'' + escapeJsArg(k) + '\')" title="' + escapeHtml(_VTAB_TITLES[k]) + '" aria-label="' + escapeHtml(_VTAB_TITLES[k]) + '">' + _VTAB_SVGS[k] + '<span class="profile-tab-lbl">' + escapeHtml(_VTAB_TITLES[k]) + '</span></button>';
        }).join("")
      + '</div>'
    : '';

  // ── DEUX SECTIONS, comme sur mon profil (refonte multi-passion, §1) :
  // « Publications » et « Activité ». Les cinq icônes de type de contenu
  // restent DANS « Publications » comme sous-filtres, exactement comme le lot
  // UI-7 les y a rangées chez moi — deux écrans jumeaux doivent raconter le
  // même modèle.
  var sectionsHTML = canSeeContent
    ? '<div class="v7-tabs" id="visitedSections" role="tablist" aria-label="Sections du profil">'
      + '<button type="button" class="v7-tab" role="tab" data-v9-vtab="publications" aria-selected="true" onclick="switchVisitedSection(\'publications\')">Publications</button>'
      + '<button type="button" class="v7-tab" role="tab" data-v9-vtab="activite" aria-selected="false" onclick="switchVisitedSection(\'activite\')">Activité</button>'
      + '</div>'
    : '';

  // Contenu initial : verrou « compte privé » pour un non-abonné, sinon rempli
  // par _renderVisitedContent() juste après l'ouverture de la modale.
  var contentHTML = canSeeContent
    ? ''
    : '<div style="text-align:center;padding:36px 20px;border:1px dashed var(--border);border-radius:16px;margin-top:16px;">'
      + '<div style="font-size:34px;margin-bottom:10px;">🔒</div>'
      + '<div data-prive-titre="1" style="font-weight:800;font-size:15px;color:var(--text);margin-bottom:6px;">' + (etatSuivi(authorId) === "attente" ? "Demande envoyée" : "Ce compte est privé") + '</div>'
      + '<div data-prive-texte="' + escapeHtml(TEXTE_COMPTE_PRIVE) + '" style="font-size:12px;color:var(--muted);line-height:1.5;">' + escapeHtml(etatSuivi(authorId) === "attente" ? TEXTE_DEMANDE_EN_VOL : TEXTE_COMPTE_PRIVE) + '</div>'
      + '</div>';

  // 🖼️ En-tête : MÊME visuel que le profil principal (couverture 3:2 + avatar
  // chevauchant + pseudo + bio + réseaux + stats), via les classes existantes
  // .main-profile-* — sans les contrôles d'édition, évidemment.
  // `_cssUrl` et non `safeUrlAttr` (audit 2026-11-06) : l'attribut est décodé AVANT le
  // CSS, une URL échappée pour le HTML ressortait donc de son `url(` non cité.
  var _coverSure = user.coverUrl ? _cssUrl(passioThumb(user.coverUrl, 880)) : null;
  var coverStyle = _coverSure
    ? "background:url('" + _coverSure + "') center/cover;"
    : 'background:linear-gradient(135deg, #8b5cf6, #6d28d9);';

  // LOT-16 (PRO-C07) : un compte que J'AI bloqué le dit, à la place des actions.
  var _bloqueParMoi = (typeof isBlocked === "function") && isBlocked(authorId);
  // LOT-16 (PRO-C09) : la croix vient d'`openModal` ; la seconde (un span) est retirée.
  // LOT-16 (PRO-C10) : ouvert depuis une liste, le profil y ramène.
  var _retourListe = source === "liste-abonnes"
    ? '<button type="button" class="profil-retour-liste" onclick="openFollowersList()">← Abonnés</button>'
    : source === "liste-abonnements"
      ? '<button type="button" class="profil-retour-liste" onclick="openFollowingList()">← Abonnements</button>'
      : '';
  var html = _retourListe + '\
    <!-- OPTIONS DU PROFIL VISITE : voir openVisitedProfileMenu ci-dessus. -->\
    <button class="profile-dots-btn on-cover" style="right:56px;z-index:20;" onclick="openVisitedProfileMenu(event,\'' + escapeJsArg(authorId) + '\',\'' + escapeJsArg(user.name || "") + '\')" title="Options" aria-label="Options du profil" aria-haspopup="menu">⋯</button>\
    \
    <!-- CARTE PROFIL (même structure que #mainProfileCard) -->\
    <div class="main-profile-card" style="margin:0 -18px 4px;border-radius:0;border-left:0;border-right:0;border-top:0;">\
      <div class="main-profile-cover" style="' + coverStyle + 'cursor:default;"></div>\
      <div class="main-profile-body">\
        <div class="main-profile-avatar-wrap">\
          <div class="main-profile-avatar" style="background:' + avatarBg(user, 352) + ';background-size:cover;background-position:center;cursor:default;">' + avatarInner(user) + '</div>\
        </div>\
        <div class="main-profile-username">' + escapeHtml(user.name || "Passionné") + (user.isPrivate ? ' <span title="Compte privé" style="font-size:13px;">🔒</span>' : '') + '</div>\
        ' + (user.bio ? '<div class="main-profile-bio">' + escapeHtml(user.bio) + '</div>' : '') + '\
        ' + (rsLinks.length ? '<div class="main-profile-rs">' + rsLinks.map(function(l) { return '<a class="main-profile-rs-link" href="' + safeUrlAttr(l.url || "") + '" target="_blank" rel="noopener">' + (RS_ICONS[l.platform] || "🔗") + ' ' + escapeHtml(l.platform || "lien") + '</a>'; }).join("") + '</div>' : '') + '\
        <div class="main-profile-stats">\
          <div class="main-profile-stat"><span>' + postCount + '</span><span>publication' + (postCount > 1 ? "s" : "") + '</span></div>\
          <div class="main-profile-stat"><span>' + followerCount + '</span><span>abonnés</span></div>\
          <div class="main-profile-stat"><span>' + followingCount + '</span><span>abonnements</span></div>\
        </div>\
      </div>\
    </div>\
    \
    <!-- BOUTONS -->\
    ' + (_bloqueParMoi
      ? '<div id="visitedProfileActions" class="profil-bloque" role="status"><span>Tu as bloqué ce compte.</span>'
        + '<button type="button" class="btn ghost profil-action" onclick="unblockUser(\'' + escapeJsArg(authorId) + '\',\'' + escapeJsArg(user.name || "") + '\');closeModal();">Débloquer</button></div>'
      : '') + '\
    <div id="' + (_bloqueParMoi ? 'visitedProfileActionsMasquees" hidden' : 'visitedProfileActions"') + ' style="display:flex;gap:8px;justify-content:center;margin:14px 0 4px;">\
      <button class="btn primary profil-action" onclick="closeModal();startDirectMessage(\'' + escapeJsArg(authorId) + '\',\'' + escapeJsArg(user.name || "Passionné") + '\',\'' + escapeJsArg(user.profileEmoji || "✨") + '\',\'' + escapeJsArg(user.avatar || "#8b5cf6") + '\',\'' + escapeJsArg(user.photoUrl || "") + '\')" style="flex:1;border-radius:14px;">Message</button>\
      <button class="btn ghost profil-action" id="followBtn_' + escapeHtml(authorId) + '"' + (estPersonneExemple(authorId) ? ' disabled aria-disabled="true" data-exemple="1"' : '') + ' onclick="toggleFollowUser(\'' + escapeJsArg(authorId) + '\',\'' + escapeJsArg(user.name || "") + '\')" title="' + escapeHtml(aideBoutonSuivi(authorId)) + '" aria-label="' + escapeHtml(aideBoutonSuivi(authorId)) + '"' + (etatSuivi(authorId) === "attente" ? ' data-suivi-attente="1"' : '') + ' style="flex:1;border-radius:14px;' + (isFollowing ? 'background:rgba(124, 58, 237, 0.1);color:var(--accent);border-color:var(--accent);' : (etatSuivi(authorId) === "attente" ? 'color:var(--accent);border-color:var(--accent);' : '')) + '">' + libelleBoutonSuivi(authorId) + '</button>\
    </div>\
    </div>\
    \
    ' + passionsHTML + '\
    ' + sectionsHTML + '\
    <div class="v7-pan" data-v9-vpan="publications">' + tabsHTML + '<div id="visitedContent">' + contentHTML + '</div></div>\
    <div class="v7-pan" data-v9-vpan="activite" hidden><div id="visitedEvents"></div></div>\
  ';
  openModal(html);
  // Passer en plein écran
  var modalEl = document.querySelector(".modal");
  if (modalEl) modalEl.classList.add("modal-fullscreen");
  // Remplit le contenu selon les sélections (comme renderProfileContent chez moi).
  _renderVisitedContent();
  _renderVisitedEvents();
  // « Activité » lit `allEvents()`, que seul le DÉMARRAGE remplissait : une
  // activité publiée après l'ouverture de l'app restait absente de ce profil
  // jusqu'à la relance (Jerem, 2026-10-23). On recharge donc ses activités,
  // comme ses publications plus haut, puis on repeint si la vue est la même.
  if (canSeeContent && window._supaReal && typeof supaLoadEvents === "function") {
    supaLoadEvents(authorId).then(function (evs) {
      if (!fusionnerEvenementsServeur(evs)) return;
      if (window._visited && window._visited.authorId === authorId) _renderVisitedEvents();
    }).catch(function (e) {
      if (typeof diagLog === "function") diagLog("profil_visite_activites_serveur " + (e && e.message));
    });
  }

  // Aide §8 « premier profil visité » : mettre en évidence Suivre / Message.
  // Différée d'un tick — la modale vient d'être injectée, son rectangle n'est
  // mesurable qu'après peinture.
  try {
    if (typeof montrerHint === "function") {
      setTimeout(function () { montrerHint("profil_visite", "#visitedProfileActions"); }, 350);
    }
  } catch (e) {}
}

// Menu ⋯ du PROFIL VISITÉ (2026-09-02). Il remplace la rangée de trois boutons
// « Partager / Signaler / Bloquer » posée sous la carte d'identité.
// ⚠️ Il réutilise `_profileDotsOpen` (app-06) plutôt que d'ouvrir une feuille :
// c'est déjà le composant des trois points de mon profil et des cartes passion,
// et deux popovers d'options auraient divergé au premier retouchage.
// ⚠️ Chaque entrée appelle la MÊME fonction qu'avant — aucune règle de
// modération n'est redéfinie ici, seule la surface change.
// ⚠️ Le bouton ⋯ est posé en `right: 56px` et non dans le coin : dans une
// modale, `.modal-close` occupe déjà le haut droite (top/right 12 px, 34 px de
// côté). Il est `position: absolute` et son ancêtre positionné est `.modal`
// (`position: relative`), pas la carte — inutile donc de positionner celle-ci,
// qui est en `overflow: hidden` et clipperait le menu si on l'y mettait.
// ⚠️ Et `.profile-dots-menu` a dû passer de 1200 à 10002 : `.modal-backdrop`
// est à 10001, donc le menu s'ouvrait DERRIÈRE la modale — dans le DOM, et
// invisible. C'est la première fois que ce composant sert depuis une modale.
function openVisitedProfileMenu(ev, authorId, name) {
  var bloque = (typeof isBlocked === "function") && isBlocked(authorId);
  _profileDotsOpen(ev, [
    { label: "Partager le profil", run: function () { shareUserProfile(authorId, name); }, sep: true },
    { label: "Signaler", run: function () { reportUser(authorId, name); } },
    bloque
      ? { label: "Débloquer", run: function () { unblockUser(authorId, name); closeModal(); } }
      : { label: "Bloquer", danger: true, run: function () { demanderBlocage(authorId, name); } }
  ]);
}

// ======== PROFIL VISITÉ — filtres passion + type de contenu ========
// Même mécanique que l'écran « mon profil » : les cartes passion ET les 5
// icônes de type sont des filtres cumulables ; rien de coché = tout affiché.
// L'état vit dans window._visited (posé par openUserProfile).

// Bascule une passion du profil visité. MULTISÉLECTION, comme mon profil et le
// Fil (demande de Benjamin, 2026-08-31) : cocher l'une n'éteint plus les autres,
// et tout décocher DIT « toutes » — c'est ce qui a permis de retirer la bulle
// « Toutes », qui faisait double emploi avec l'état vide.
function setVisitedPassion(pid) {
  var v = window._visited; if (!v) return;
  if (!pid) { v.passionSel = new Set(); }
  else if (v.passionSel.has(pid)) { v.passionSel.delete(pid); }
  else { v.passionSel.add(pid); }
  _syncVisitedUI();
  // ⚠️ Une seule sélection commande les DEUX sections : sans le second appel,
  // « Activité » resterait sur la passion précédente pendant que
  // « Publications » aurait changé — l'incohérence que le rail supprime.
  _renderVisitedContent();
  _renderVisitedEvents();
}

// ── Les deux sections du profil visité ────────────────────────────────────
function switchVisitedSection(cle) {
  var k = (cle === "activite") ? "activite" : "publications";
  document.querySelectorAll("#visitedSections [data-v9-vtab]").forEach(function (b) {
    b.setAttribute("aria-selected", b.getAttribute("data-v9-vtab") === k ? "true" : "false");
  });
  document.querySelectorAll("[data-v9-vpan]").forEach(function (p) {
    p.hidden = p.getAttribute("data-v9-vpan") !== k;
  });
  if (k === "activite") _renderVisitedEvents();
}

// L'activité PUBLIQUE d'un autre compte : les sorties qu'il organise. On ne
// montre pas ses participations — `event_attendees` n'est pas chargé pour un
// tiers, et l'inventer serait annoncer une présence qu'on n'a pas vérifiée.
// ⚠️ `passions` est une LISTE d'identifiants de passion (multisélection).
// Vide = aucune restriction. Elle acceptait auparavant une valeur unique ; la
// garder aurait fait perdre en silence toutes les passions cochées sauf une.
function _visitedEvents(authorId, passions) {
  var out = [];
  try {
    var tous = (typeof allEvents === "function") ? allEvents() : [];
    out = tous.filter(function (e) {
      return e && (e.organizerId === authorId || e.authorId === authorId);
    });
  } catch (e) {
    // Jamais muet : un catch large sur un chemin d'affichage a déjà masqué un
    // ReferenceError six jours dans ce dépôt.
    if (typeof diagLog === "function") diagLog("profil_visite_activites " + (e && e.message));
    return [];
  }
  var _p = Array.isArray(passions) ? passions : (passions ? [passions] : []);
  if (_p.length) out = out.filter(function (e) { return e && _p.indexOf(e.passion) > -1; });
  var maintenant = Date.now();
  out.sort(function (a, b) {
    var fa = a.date >= maintenant, fb = b.date >= maintenant;
    if (fa !== fb) return fa ? -1 : 1;
    return fa ? (a.date - b.date) : (b.date - a.date);
  });
  return out.slice(0, 8);
}

function _renderVisitedEvents() {
  var v = window._visited;
  var box = document.getElementById("visitedEvents");
  if (!v || !box) return;
  if (v.locked) {
    box.innerHTML = '<div class="empty"><div class="empty-icon">🔒</div><div class="empty-title">Ce compte est privé</div>'
      + '<div class="empty-text">Abonne-toi pour voir son activité.</div></div>';
    return;
  }
  var choisies = Array.from(v.passionSel);
  var evs = _visitedEvents(v.authorId, choisies);
  if (!evs.length) {
    var msg = choisies.length
      ? (choisies.length > 1
          ? "Aucune activité dans ces passions pour l'instant."
          : "Aucune activité dans cette passion pour l'instant.")
      : "Cette personne n'organise aucune activité pour le moment.";
    box.innerHTML = '<div class="empty"><div class="empty-icon">🤝</div><div class="empty-title">Rien à afficher</div>'
      + '<div class="empty-text">' + escapeHtml(msg) + '</div></div>';
    return;
  }
  box.innerHTML = evs.map(function (e) {
    var emoji = e.emoji || "📍";
    try { if (!e.emoji && typeof passionById === "function") emoji = (passionById(e.passion) || {}).emoji || "📍"; } catch (x) {}
    var vignette = e.coverUrl
      ? '<img loading="lazy" decoding="async" src="' + safeUrlAttr(urlMediaDirecte(e.coverUrl)) + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display=\'none\'"/>'
      : '<span style="font-size:20px;">' + escapeHtml(String(emoji)) + '</span>';
    var quand = "";
    try { quand = new Date(e.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); } catch (x) {}
    var bas = [quand, e.city ? String(e.city) : ""].filter(Boolean).join(" · ");
    return '<div onclick="closeModal();openEventDetails(\'' + escapeJsArg(String(e.id)) + '\')"'
      + ' style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-card);'
      + 'border:1px solid var(--border);border-radius:12px;margin-bottom:6px;cursor:pointer;">'
      + '<div style="width:44px;height:44px;flex:0 0 44px;border-radius:10px;overflow:hidden;'
      + 'background:var(--bg-tint);display:grid;place-items:center;">' + vignette + '</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-weight:700;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
      + escapeHtml(e.title || "Activité") + '</div>'
      + '<div style="font-size:10.5px;color:var(--muted);">' + escapeHtml(bas) + '</div>'
      + '</div></div>';
  }).join("");
}

// Conservée : d'anciens liens ou un handler encore en vol pourraient l'appeler.
// ⚠️ Elle passait `""` — donc « tout décocher » — quand la passion était déjà
// cochée. C'était juste en choix unique ; en multisélection cela effacerait
// AUSSI les autres passions cochées. `setVisitedPassion` bascule déjà : on lui
// délègue sans rien décider ici.
function toggleVisitedPassion(pid) {
  setVisitedPassion(pid);
}

function switchVisitedTab(tab) {
  var v = window._visited; if (!v) return;
  // LOT-16 (PRO-C04) : même règle que mon profil — un seul filtre de format à la
  // fois ; « Tout » (ou retoucher l'actif) les retire tous.
  var dejaSeul = v.tabSel.size === 1 && v.tabSel.has(tab);
  v.tabSel = new Set(dejaSeul || tab === "posts" ? [] : [tab]);
  _syncVisitedUI();
  _renderVisitedContent();
}

// Reflète les sélections sur les cartes passion (bordure accent, comme
// renderProfilesScreen) et les onglets (classe active + aria-pressed).
function _syncVisitedUI() {
  var v = window._visited; if (!v) return;
  var _unFiltre = v.passionSel.size > 0;
  document.querySelectorAll("#visitedPassions [data-passion-tile]").forEach(function(c) {
    var id = c.getAttribute("data-passion-tile") || "";
    // Plus de bulle « Toutes » : rien de coché DIT déjà « toutes ». Chaque bulle
    // ne répond donc que d'elle-même.
    var on = !!id && v.passionSel.has(id);
    c.classList.toggle("active", on);
    c.setAttribute("aria-pressed", on ? "true" : "false");
    // Mêmes états visuels que le Fil et que mon profil : l'opacité et l'échelle
    // sont posées en style inline par `passionTileHTML`, on les tient à jour.
    c.style.opacity = on ? "1" : (_unFiltre ? "0.3" : "1");
    c.style.transform = on ? "scale(1.07)" : "scale(1)";
    var lbl = c.querySelector(".profile-tile-label");
    if (lbl) { lbl.style.fontWeight = on ? "800" : "600"; lbl.style.color = on ? "var(--accent)" : ""; }
  });
  document.querySelectorAll("#visitedTabs .profile-tab").forEach(function(b) {
    var on = v.tabSel.has(b.getAttribute("data-vtab"));
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

// Rend #visitedContent — équivalent de renderProfileContent pour un profil
// visité : union des types cochés, grille 3 colonnes si la sélection vaut
// EXACTEMENT « photos » ou « bobines », sinon liste renderPostHTML.
// LOT-14 (audit UX/UI du 2026-11-10, BOB-C10) : une bobine ouverte depuis le
// profil VISITÉ ramène à ce profil quand on ferme le lecteur — la fenêtre du
// profil disparaissait, et l'on tombait sur « Mon profil ».
function ouvrirBobineDepuisProfil(id) {
  var v = window._visited;
  window._bobineRetourProfil = (v && v.authorId) ? String(v.authorId) : null;
  closeModal();
  openReelById(id);
}

function _renderVisitedContent() {
  var v = window._visited;
  var el = document.getElementById("visitedContent");
  if (!v || !el || v.locked) return; // verrou compte privé : ne rien écraser

  var posts = v.posts || [];
  if (v.passionSel.size) posts = posts.filter(function(p) { return v.passionSel.has(p.passion); });

  var KEYS = (typeof PROFILE_TAB_KEYS !== "undefined") ? PROFILE_TAB_KEYS : ["posts","photos","videos","bobines","audio"];
  var keys = KEYS.filter(function(k) { return v.tabSel.has(k); });
  if (keys.length && typeof PROFILE_TAB_PRED !== "undefined") {
    posts = posts.filter(function(p) { return keys.some(function(k) { return PROFILE_TAB_PRED[k](p); }); });
  }
  var single = keys.length === 1 ? keys[0] : null;

  // ⚠️ L'état vide doit dire QUI vide l'écran. Sans mention du filtre, il
  // affirme « aucune publication » à quelqu'un qui en a, ailleurs.
  var _nomFiltre = "";
  try {
    var _noms = [];
    v.passionSel.forEach(function (id) {
      var t = document.querySelector('#visitedPassions [data-passion-tile="' + CSS.escape(id) + '"] .profile-tile-label');
      if (t && t.textContent) _noms.push(t.textContent);
    });
    _nomFiltre = _noms.join(" · ");
  } catch (e) {}
  function _vEmpty(msg) {
    // ⚠️ « touche Toutes » ne veut plus rien dire : la bulle n'existe plus. Le
    // geste de sortie est de DÉCOCHER — le dire faux enverrait chercher un
    // bouton absent, ce qui est pire qu'un état vide muet.
    var sous = _nomFiltre
      ? "Rien en " + _nomFiltre + " — décoche cette passion pour voir le reste."
      : "Rien à afficher pour cette sélection.";
    return '<div class="empty"><div class="empty-icon">📭</div><div class="empty-title">' + escapeHtml(msg) + '</div><div class="empty-text">' + escapeHtml(sous) + '</div></div>';
  }

  if (single === "photos") {
    var photos = posts.filter(function(p) { return !p.isReel && (p.type === "photo" || p.image); });
    el.innerHTML = photos.length
      ? '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;">' + photos.map(function(p) {
          // Cellule d'un tiers d'écran (≤ 180 px) : la vignette, jamais la grande
          // (≤ 2 048 px) — la grille du profil VISITÉ avait été oubliée par le lot
          // images légères (contre-revue du 21/09). Une légère passe telle quelle.
          var src = p.image ? passioThumb(p.image, 360) : "";
          if (!src) return '<div style="aspect-ratio:1;border-radius:8px;background:linear-gradient(135deg,rgba(139,92,246,.28),rgba(28,25,56,.9));"></div>';
          return '<div style="aspect-ratio:1;border-radius:8px;overflow:hidden;"><img loading="lazy" decoding="async" src="' + safeUrlAttr(src) + '" style="width:100%;height:100%;object-fit:cover;"/></div>';
        }).join("") + '</div>'
      : _vEmpty("Aucune photo");
  } else if (single === "bobines") {
    var bobines = posts.filter(function(p) { return p.isReel && (p.video || p.image); });
    el.innerHTML = bobines.length
      ? '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;">' + bobines.map(function(p) {
          var poster = p.image || p.poster || "";
          var thumb = miniatureVideoPubliqueHTML(poster, p.video);
          return '<div onclick="ouvrirBobineDepuisProfil(\'' + escapeJsArg(p.id) + '\')" style="aspect-ratio:9/16;border-radius:8px;overflow:hidden;position:relative;cursor:pointer;">' + thumb + '<span style="position:absolute;left:6px;bottom:6px;font-size:14px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6));">🎞️</span></div>';
        }).join("") + '</div>'
      : _vEmpty("Aucune bobine");
  } else {
    el.innerHTML = posts.length
      ? posts.map(renderPostHTML).join("")
      : _vEmpty("Aucune publication");
  }
}

// Colonnes chargées pour un profil VISITÉ — tout ce qu'il faut pour reproduire
// le visuel du profil personnel (couverture, passions enrichies, réseaux
// sociaux, mode privé). Partagé par les 3 requêtes d'openUserProfile.
var VISITED_PROFILE_COLS = "id,username,emoji,color,passion_id,passions,bio,avatar_url,cover_url,is_private,rs_links";

// ⚠️ TOUS LES BOUTONS DE CE COMPTE, PAS « LE » BOUTON (2026-09-03).
// `document.getElementById("followBtn_" + userId)` rend le PREMIER dans l'ordre
// du document. Or trois surfaces émettent cet identifiant pour la même personne :
// le profil visité (ci-dessus), « Créateurs à suivre » de la page Rechercher
// (`#suggestedCreators`, app-06) et la fiche d'une passion (`#pexCreators`,
// app-07). L'écran précède la modale dans `index.html` : suivre quelqu'un DEPUIS
// LA MODALE écrivait bien l'état, mais retournait le bouton CACHÉ derrière —
// celui sous le doigt restait « Suivre », on retapait, et on se désabonnait en
// silence. Les surfaces marquent donc leurs boutons d'un `data-follow-uid` et on
// les retourne TOUS ; l'identifiant historique reste pris en compte pour les
// surfaces qui ne l'ont pas encore.
// LOT-6 (REC-C01) : repeint TOUS les boutons de suivi présents dans la page, avec
// le moteur unique (`_peindreBoutonsSuivi`, libellé de `libelleBoutonSuivi`).
function repeindreBoutonsSuiviVisibles() {
  var vus = {};
  Array.prototype.forEach.call(document.querySelectorAll('[data-follow-uid], [id^="followBtn_"]'), function (b) {
    var uid = b.getAttribute("data-follow-uid") || String(b.id || "").replace(/^followBtn_/, "");
    if (!uid || vus[uid]) return;
    vus[uid] = true;
    try { _peindreBoutonsSuivi(uid, etatSuivi(uid)); } catch (e) { try { diagLog("repeint suivi : " + (e && e.message)); } catch (_e) {} }
  });
}

function _boutonsSuivi(userId) {
  var out = [];
  try {
    var parId = document.getElementById("followBtn_" + userId);
    if (parId) out.push(parId);
  } catch (e) {}
  try {
    // Comparaison d'ATTRIBUT plutôt que sélecteur construit : un identifiant de
    // compte n'a pas à être échappé pour entrer dans une chaîne CSS.
    Array.prototype.forEach.call(document.querySelectorAll("[data-follow-uid]"), function (b) {
      if (b.getAttribute("data-follow-uid") === String(userId) && out.indexOf(b) < 0) out.push(b);
    });
  } catch (e) {}
  return out;
}

// ⚠️ UN BOUTON D'ÉTAT IGNORE LE SECOND TAP PENDANT L'ÉCRITURE (ROB-04,
// 2026-09-14). Mesuré : deux taps sur « Suivre » en 300 ms → POST follows puis
// DELETE follows, deux toasts contradictoires, état final « Suivre » ; deux
// taps sur « Bloquer » → deux INSERT blocks, deux toasts. Le verrou est levé
// quand la réponse du serveur est arrivée — jamais avant, jamais sur un
// minuteur. Même famille que `_likePending` et `_publishInProgress`.
var _ecritureSuiviEnCours = {};
var _ecritureBlocageEnCours = {};
function _verrouEcriture(table, id, promesse) {
  table[id] = true;
  return Promise.resolve(promesse).then(function (r) { delete table[id]; return r; }, function (e) { delete table[id]; throw e; });
}

// ⚠️ SUR UN COMPTE PRIVÉ, L'OPTIMISTE PROMETTAIT UN SUIVI QUI N'AURAIT PAS LIEU.
// L'affichage passait par « ✓ Suivi » en violet plein — le visuel d'un
// abonnement acquis — avant d'être corrigé en « Demande envoyée » au verdict du
// serveur. Or l'écran SAIT déjà que le compte est privé : il peint le 🔒 à côté
// du pseudo et le bloc « Ce compte est privé » juste en dessous. Quand on le
// sait, on n'annonce pas l'inverse pendant 100 ms.
// ⚠️ ELLE ÉCHOUE SUR « PUBLIC », et c'est voulu : `_profileCache` ne porte PAS
// `is_private` (seul `openUserProfile` le relit), donc hors du profil visité on
// ne sait rien et le comportement d'avant tient à l'octet près. Le SERVEUR
// tranche de toute façon (`trg_follows_statut`) ; ceci n'avance que ce que le
// client tient déjà pour acquis.
// Une phrase écrite en trois endroits finit par diverger sur celui qu'on oublie :
// le gabarit, l'attribut de restitution et le repli lisent la MÊME constante.
var TEXTE_DEMANDE_EN_VOL = "Tu verras ses publications dès qu'elle aura accepté ta demande.";
// « et carnets » retiré le 2026-11-09 : le Carnet de voyage n'existe plus
// (ADR-011), et ce texte s'affiche sur chaque profil privé visité.
var TEXTE_COMPTE_PRIVE = "Abonne-toi pour voir ses publications, photos et bobines.";

function _ciblePrivee(uid) {
  try {
    var v = window._visited;
    if (v && v.authorId === uid) return !!v.isPrivate;
  } catch (e) { try { diagLog("cible_privee: " + (e && e.message)); } catch (_) {} }
  return false;
}

// Le bloc « Ce compte est privé » du profil visité est peint À L'OUVERTURE et ne
// connaît donc que l'état d'alors : il continuait d'écrire « Abonne-toi pour
// voir ses publications » à quelqu'un dont la demande était déjà partie. C'est la
// surface qui EXPLIQUE, et elle mentait sur l'état — elle est repeinte à chaque
// changement de bouton, depuis `_peindreBoutonsSuivi`, seul point qui les écrit.
function _majBlocPriveVisite(userId) {
  try {
    var v = window._visited;
    if (!v || v.authorId !== userId) return;
    var attente = (typeof etatSuivi === "function") && etatSuivi(userId) === "attente";
    Array.prototype.forEach.call(document.querySelectorAll("[data-prive-titre]"), function (el) {
      el.textContent = attente ? "Demande envoyée" : "Ce compte est privé";
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-prive-texte]"), function (el) {
      el.textContent = attente
        ? TEXTE_DEMANDE_EN_VOL
        : (el.getAttribute("data-prive-texte") || TEXTE_COMPTE_PRIVE);
    });
  } catch (e) { try { diagLog("maj_bloc_prive: " + (e && e.message)); } catch (_) {} }
}

function toggleFollowUser(userId, userName) {
  // LOT-5 (REC-C02) : un personnage d'exemple n'existe pas — aucun suivi ne part,
  // ni en local ni en base, et c'est dit.
  if (estPersonneExemple(userId)) { toast("C'est un profil d'exemple : on ne peut pas le suivre."); return; }
  // Mode invité (première visite) : cette action engage le compte. Le gate
  // EXPLIQUE l'action puis propose la création de compte ; il ne rejoue jamais
  // l'action après coup. Rend `true` — donc inerte — hors mode invité.
  if (window.requireAuthentication && !requireAuthentication("suivre")) return;
  if (!_boutonsSuivi(userId).length) return;
  if (_ecritureSuiviEnCours[userId]) return; // écriture en cours : le tap est ignoré
  // Un geste MANUEL sur la personne qui m'a invité clôt l'invitation (app-06) :
  // aucun démarrage suivant ne doit défaire ce que je viens de décider.
  if (typeof invitationGesteManuel === "function") invitationGesteManuel(userId);
  state.user.following = state.user.following || [];
  state.user.followingPending = state.user.followingPending || [];
  var nom = userName || "cet utilisateur";
  var etat = etatSuivi(userId);

  // ⚠️ TROIS ÉTATS depuis le 2026-09-11 (compte privé = abonnement sur DEMANDE) :
  //   aucun → on demande ; le SERVEUR répond 'accepted' (compte public) ou
  //           'pending' (compte privé : la personne devra accepter) ;
  //   attente → un second tap ANNULE la demande (même ligne `follows`) ;
  //   suivi → on se désabonne.
  // L'affichage est optimiste vers l'état que le client CROIT atteignable —
  // « attente » quand il sait la cible privée (`_ciblePrivee`), « suivi » sinon —
  // puis CORRIGÉ au verdict : c'est `trg_follows_statut` qui tranche, pas nous.
  if (etat === "attente") {
    state.user.followingPending = state.user.followingPending.filter(function (id) { return id !== userId; });
    _peindreBoutonsSuivi(userId, "aucun");
    // ⚠️ Un geste DESTRUCTEUR dit par où revenir : c'est ce tap-là qui a effacé
    // une demande d'abonnement en production le 22/09, deux secondes après
    // l'avoir envoyée.
    toast("Demande annulée — appuie sur « Suivre » pour la renvoyer");
    // ⚠️ ON LIT LE VERDICT DE LA SUPPRESSION. Un DELETE refusé laissait la
    // demande vivante côté serveur pendant que l'écran la disait annulée — le
    // défaut rapporté, dans l'autre sens.
    _verrouEcriture(_ecritureSuiviEnCours, userId, supaUnfollowUser(userId)).then(function (r) {
      if (!r || r.ok !== false) return;
      if (state.user.followingPending.indexOf(userId) < 0) state.user.followingPending.push(userId);
      _peindreBoutonsSuivi(userId, "attente");
      toast("Annulation non enregistrée — ta demande est toujours en cours");
      saveState();
    }).catch(function () {});
    saveState();
    return;
  }
  if (etat === "aucun") {
    // Compte connu privé → l'optimiste va DIRECTEMENT en attente : on n'annonce
    // pas un abonnement que le serveur va refuser dans la milliseconde.
    var prive = _ciblePrivee(userId);
    if (prive) {
      if (state.user.followingPending.indexOf(userId) < 0) state.user.followingPending.push(userId);
      _peindreBoutonsSuivi(userId, "attente");
      toast("Demande envoyée à " + nom + " — tu verras ses publications dès qu'elle l'aura acceptée");
    } else {
      state.user.following.push(userId);
      _peindreBoutonsSuivi(userId, "suivi");
      toast("Tu suis " + nom + " !");
    }
    _verrouEcriture(_ecritureSuiviEnCours, userId, supaFollowUser(userId)).then(function (r) {
      // ⚠️ ÉCHEC RÉEL = ANNULER L'OPTIMISTE (invariant CLAUDE.md). Le lot ajoute
      // deux refus possibles sur `follows` (blocage, débit) : sans cette branche,
      // l'identifiant refusé restait dans `following`, était persisté, puis
      // fusionné en UNION au démarrage suivant — un « ✓ Suivi » que rien ne
      // pouvait plus retirer. `r` vaut `true`/objet sans `ok` sous les faux
      // clients des suites : seul un `ok: false` EXPLICITE est un refus.
      if (r && r.ok === false) {
        state.user.following = (state.user.following || []).filter(function (id) { return id !== userId; });
        state.user.followingPending = (state.user.followingPending || []).filter(function (id) { return id !== userId; });
        _peindreBoutonsSuivi(userId, "aucun");
        toast("Impossible de suivre " + nom + " pour le moment");
        saveState();
        return;
      }
      // ⚠️ LE VERDICT CORRIGE DANS LES DEUX SENS depuis que l'optimiste peut
      // partir en « attente » : un compte repassé PUBLIC entre le chargement du
      // profil et le tap rend 'accepted', et laisser « Demande envoyée » sur un
      // abonnement acquis ferait attendre une acceptation qui ne viendra jamais.
      // ⚠️ SEUL UN 'accepted' EXPLICITE PROMEUT. La règle symétrique est écrite
      // quelques lignes plus haut pour le refus (« seul un `ok: false` EXPLICITE
      // est un refus ») : `r === true` ou un objet sans `status` satisfont
      // « ≠ pending » et feraient annoncer un abonnement acquis à quelqu'un dont
      // la demande attend encore — et sur une base sans colonne `status` il n'y a
      // aucun mécanisme d'acceptation.
      if (r && r.status === "accepted" && prive) {
        state.user.followingPending = (state.user.followingPending || []).filter(function (id) { return id !== userId; });
        if (state.user.following.indexOf(userId) < 0) state.user.following.push(userId);
        _peindreBoutonsSuivi(userId, "suivi");
        toast("Tu suis " + nom + " !");
        saveState();
        return;
      }
      if (!r || r.status !== "pending") return;
      state.user.following = (state.user.following || []).filter(function (id) { return id !== userId; });
      if (state.user.followingPending.indexOf(userId) < 0) state.user.followingPending.push(userId);
      _peindreBoutonsSuivi(userId, "attente");
      if (!prive) toast("Demande envoyée à " + nom + " — tu verras ses publications dès qu'elle l'aura acceptée");
      saveState();
    }).catch(function () {});
    saveState();
    return;
  }
  state.user.following = state.user.following.filter(function (id) { return id !== userId; });
  _peindreBoutonsSuivi(userId, "aucun");
  toast("Tu ne suis plus " + nom);
  // ⚠️ LE VERDICT EST LU (ETAT-08, audit du 2026-11-10). Seul un `.catch` était
  // attaché : un DELETE refusé laissait l'abonnement vivant en base pendant que
  // l'écran disait « Tu ne suis plus » — et la lecture suivante le remettait.
  _verrouEcriture(_ecritureSuiviEnCours, userId, supaUnfollowUser(userId)).then(function (r) {
    if (!r || r.ok !== false) return;
    if ((state.user.following || []).indexOf(userId) < 0) state.user.following.push(userId);
    _peindreBoutonsSuivi(userId, "suivi");
    toast("Désabonnement non enregistré — tu suis toujours " + nom);
    saveState();
  }).catch(function () {});
  saveState();
}

// Peint TOUS les boutons « Suivre » d'un compte (jusqu'à trois surfaces) dans
// l'un des trois états. Seul point qui écrit ces libellés : `libelleBoutonSuivi`
// (app-02) est la source des mots, ceci n'en est que la mise en couleur.
function _peindreBoutonsSuivi(userId, etat) {
  // L'état est écrit AVANT chaque appel : le libellé se lit dans la seule table.
  var libelle = libelleBoutonSuivi(userId);
  // Appelée NUE, comme `libelleBoutonSuivi` juste au-dessus : un `typeof` y
  // masquerait une vraie erreur d'ordre de chargement au lieu de la faire voir.
  var aide = aideBoutonSuivi(userId);
  _boutonsSuivi(userId).forEach(function (btn) {
    btn.innerHTML = libelle;
    if (etat === "suivi" && btn.classList.contains("profil-action")) {
      // LOT-16 (PRO-C17) : sur le profil visité, l'ÉTAT n'est plus plus fort que
      // l'action — « Message » reste la seule action pleine ; « ✓ Suivi » est un
      // contour à fond léger (toujours distinct de « Demande envoyée », contour nu).
      btn.style.background = "rgba(124, 58, 237, 0.1)";
      btn.style.color = "var(--accent)";
      btn.style.borderColor = "var(--accent)";
    } else if (etat === "suivi") {
      btn.style.background = "var(--accent)";
      btn.style.color = "#fff";
      btn.style.borderColor = "var(--accent)";
    } else if (etat === "attente") {
      // ⚠️ « EN ATTENTE » N'EST PAS « PAS ENCORE DEMANDÉ ». Peint comme l'état
      // neutre, le bouton était indiscernable d'un « Suivre » qui n'aurait rien
      // fait — d'où le second tap qui a détruit la demande en production. Un
      // CONTOUR accent, jamais le violet plein, qui reste la marque du suivi
      // acquis : trois états, trois aspects.
      btn.style.background = "";
      btn.style.color = "var(--accent)";
      btn.style.borderColor = "var(--accent)";
    } else {
      btn.style.background = "";
      btn.style.color = "";
      btn.style.borderColor = "";
    }
    if (etat === "attente") btn.setAttribute("data-suivi-attente", "1"); else btn.removeAttribute("data-suivi-attente");
    // L'infobulle ET l'étiquette d'accessibilité disent ce qu'un tap fera : un
    // bouton d'état muet sur son geste est ce qui a coûté la demande du 22/09.
    if (aide) { btn.setAttribute("title", aide); btn.setAttribute("aria-label", aide); }
    else { btn.removeAttribute("title"); btn.removeAttribute("aria-label"); }
  });
  _majBlocPriveVisite(userId);
}

// ======== MODÉRATION (UI) ========
// ⚠️ « BLOQUÉ » N'EST ANNONCÉ QUE SI LE SERVEUR L'A ÉCRIT (MOD-04, 2026-09-14).
// `blockUser` posait l'id dans `state.user.blocked`, appelait `supaBlockUser`
// SANS attendre ni lire son verdict, et affichait « bloqué ». Or c'est la ligne
// `blocks` qui fait TOUT ce que bloquer promet : les six policies d'insertion
// (`is_blocked_with`), la sonnerie, `notify-call`. Un refus (RLS, réseau,
// session expirée) laissait un blocage PURement local — l'autre personne
// continuait d'écrire, de commenter, d'appeler — pendant que l'écran disait le
// contraire, et l'état local, lui, survivait à la réhydratation. Même famille
// que « signalement envoyé » annoncé sans écriture (2026-09-10).
// Optimiste à l'écran, puis le verdict : un échec ANNULE l'affichage et le dit.
// LOT-6 (audit UX/UI du 2026-11-10, TRA-C10) — UNE SEULE PORTE DE BLOCAGE.
// Quatre portes, deux comportements : immédiat au premier toucher (fil, profil,
// commentaire) ou boîte native (conversation). Toutes passent par cette feuille,
// qui dit les effets AVANT. `blockUser` reste l'exécutant (verdict serveur, retour
// arrière) ; rien n'est bloqué sans « Bloquer ».
async function demanderBlocage(userId, name) {
  if (!userId || userId === MY_UID || userId === "me") return false;
  var nom = name || "ce compte";
  var oui = await confirmerAction({
    titre: "Bloquer " + nom + " ?",
    texte: ["Vous ne verrez plus vos publications, commentaires et messages l'un de l'autre.",
            "Vous ne pourrez plus vous écrire, et l'abonnement est retiré. " + nom + " n'est pas prévenu·e."],
    libelle: "Bloquer", danger: true,
  });
  if (!oui) return false;
  return blockUser(userId, name);
}

async function blockUser(userId, name) {
  if (!userId || userId === MY_UID || userId === "me") return false;
  if (_ecritureBlocageEnCours[userId]) return false; // écriture en cours (ROB-04)
  var libelle = name || "Utilisateur";
  var blockedAvant = (state.user.blocked || []).slice();
  var followingAvant = (state.user.following || []).slice();
  state.user.blocked = state.user.blocked || [];
  if (!state.user.blocked.includes(userId)) state.user.blocked.push(userId);
  // Bloquer = ne plus suivre non plus
  state.user.following = (state.user.following || []).filter(id => id !== userId);
  saveState();
  closeModal();
  try { renderFeed(); } catch(e) {}
  try { renderMessages(); } catch(e) {}
  try { renderBell(); } catch(e) {}
  // Sans compte réel, rien ne peut être écrit : l'état reste local et on le dit.
  if (typeof supaBlockUser !== "function" || !window._supaReal || !(typeof _uidEstUnCompte === "function" && _uidEstUnCompte())) {
    toast("🚫 " + libelle + " bloqué sur cet appareil");
    return true;
  }
  var ok = false;
  try { ok = await _verrouEcriture(_ecritureBlocageEnCours, userId, supaBlockUser(userId)); } catch (e) { ok = false; }
  if (!ok) {
    state.user.blocked = blockedAvant;
    state.user.following = followingAvant;
    saveState();
    try { renderFeed(); } catch(e) {}
    try { renderMessages(); } catch(e) {}
    try { renderBell(); } catch(e) {}
    toast("⚠️ Blocage non enregistré — réessaie");
    try { if (typeof diagLog === "function") diagLog("blocage KO " + userId); } catch (e) {}
    return false;
  }
  if (typeof supaUnfollowUser === "function") { try { supaUnfollowUser(userId); } catch (e) {} }
  toast("🚫 " + libelle + " bloqué");
  return true;
}

async function unblockUser(userId, name) {
  if (!userId) return false;
  if (_ecritureBlocageEnCours[userId]) return false; // écriture en cours (ROB-04)
  var libelle = name || "Utilisateur";
  var blockedAvant = (state.user.blocked || []).slice();
  state.user.blocked = (state.user.blocked || []).filter(id => id !== userId);
  saveState();
  try { renderFeed(); } catch(e) {}
  try { if (typeof renderBlockedList === "function") renderBlockedList(); } catch(e) {}
  if (typeof supaUnblockUser !== "function" || !window._supaReal || !(typeof _uidEstUnCompte === "function" && _uidEstUnCompte())) {
    toast("✅ " + libelle + " débloqué sur cet appareil");
    return true;
  }
  var ok = false;
  try { ok = await _verrouEcriture(_ecritureBlocageEnCours, userId, supaUnblockUser(userId)); } catch (e) { ok = false; }
  if (!ok) {
    state.user.blocked = blockedAvant;
    saveState();
    try { renderFeed(); } catch(e) {}
    try { if (typeof renderBlockedList === "function") renderBlockedList(); } catch(e) {}
    toast("⚠️ Déblocage non enregistré — réessaie");
    return false;
  }
  toast("✅ " + libelle + " débloqué");
  return true;
}

// ⚠️ « SIGNALEMENT ENVOYÉ » ÉTAIT ANNONCÉ MÊME QUAND RIEN N'ÉTAIT ÉCRIT
// (2026-09-10). Quatre des cinq portes de signalement — `reportUser`,
// `reportPost`, `reportCommentEntry`, `reportEvent` — appelaient `supaReport`
// SANS `await` et sans lire son verdict, puis affichaient le remerciement de
// façon inconditionnelle. Seule `reportPassion` faisait bien. Le cas n'était pas
// théorique : la policy de production est `WITH CHECK (reporter_id =
// auth.uid()::text)`, et un visiteur sans compte porte un `MY_UID` fabriqué
// (`u_<aléatoire>`) — son signalement était donc REFUSÉ par la RLS, en silence
// (le SDK ne lève pas), et il lisait quand même « Notre équipe va vérifier ».
// Or « Signaler cet événement » est affiché aux visiteurs.
//
// Dans une application qui organise des rencontres physiques, un signalement
// qu'on croit parti et qui n'existe pas est le pire des défauts silencieux :
// la personne se croit protégée et cesse de chercher un autre recours.
//
// Toutes suivent désormais le patron de `reportPassion` : porte
// d'authentification AVANT l'écriture, `await`, lecture du verdict, et un
// message qui dit la VÉRITÉ dans les deux cas.
async function reportUser(userId, name) {
  if (!userId) return;
  try {
    if (typeof requireAuthentication === "function" && !requireAuthentication("signaler")) return;
  } catch (e) {}
  var motif = await _demanderMotifSignalement("ce compte");
  if (motif === null) return;   // annulé
  var ok = false;
  try { if (typeof supaReport === "function") ok = await supaReport("user", userId, motif); } catch (e) { ok = false; }
  closeModal();
  toast(ok
    ? "🚩 Signalement envoyé. Notre équipe va vérifier."
    : "Signalement déjà envoyé, ou impossible pour le moment.", ok ? "success" : "warning");
  if (ok) _accuserReceptionSignalement();
}

// ⚠️ ACCUSÉ DE RÉCEPTION (AUTH-11 / MOD-09, 2026-09-14). Le DSA (art. 16.4)
// demande qu'un signalement soit accusé ; jusqu'ici le toast disparaissait et
// rien ne restait. Une notification LOCALE, dans la cloche, garde la trace
// pour la personne ; la décision, elle, arrive du serveur (kind `moderation`,
// écrite par l'outil de modération).
function _accuserReceptionSignalement() {
  try { if (typeof pushNotification === "function") pushNotification("Signalement reçu — tu seras informé·e de la décision ici", "🛡️"); } catch (e) {}
}

// Signaler une STORY (MOD-02 laissait cette porte ouverte : aucune surface).
// Même contrat que les autres portes : authentification, motif, verdict lu.
async function reportStory(storyId) {
  if (!storyId) return;
  try {
    if (typeof requireAuthentication === "function" && !requireAuthentication("signaler")) return;
  } catch (e) {}
  var motif = await _demanderMotifSignalement("cette story");
  if (motif === null) return;
  var ok = false;
  try { if (typeof supaReport === "function") ok = await supaReport("story", storyId, motif); } catch (e) { ok = false; }
  toast(ok
    ? "Story signalée. Merci, on s'en occupe."
    : "Signalement déjà envoyé, ou impossible pour le moment.", ok ? "success" : "warning");
  if (ok) _accuserReceptionSignalement();
  return ok;
}

// Petite fenêtre de motif, partagée par les quatre portes. Elle rend le texte
// saisi, ou `null` si la personne renonce.
//
// ⚠️ LE MOTIF N'ÉTAIT JAMAIS RENSEIGNÉ : les cinq appelants passaient `""`, et
// les deux signalements de production le confirment (`reason=''`). Celui qui
// modère recevait donc un identifiant nu, sans savoir de quoi on accusait qui.
// `supaReport` tronque déjà à 500 caractères.
function _demanderMotifSignalement(quoi) {
  return new Promise(function (resoudre) {
    var fait = false;
    var observateur = null;
    var fini = function (v) {
      if (fait) return;
      fait = true;
      try { if (observateur) observateur.disconnect(); } catch (e) {}
      resoudre(v);
    };
    window._signalementValider = function () {
      var el = document.getElementById("signalementMotif");
      var motif = el ? String(el.value || "").trim() : "";
      // ⚠️ UN MOTIF VIDE N'EST PAS UN SIGNALEMENT (audit 2026-11-02, E-05) : la
      // fenêtre existait précisément pour que la modération reçoive autre chose
      // qu'un identifiant nu, mais « Envoyer » acceptait le champ vide — les deux
      // signalements de production ont `reason=''`. On garde la fenêtre ouverte
      // et on le dit ; renoncer reste possible par « Annuler ».
      if (motif.length < 3) {
        try { toast("Dis-nous en deux mots ce qui ne va pas (3 caractères au moins).", "warning"); } catch (e) {}
        try { if (el) el.focus(); } catch (e) {}
        return;
      }
      fini(motif);
      try { closeModal(); } catch (e) {}
    };
    window._signalementAnnuler = function () { fini(null); try { closeModal(); } catch (e) {} };
    try {
      openModal(''
        + '<div class="modal-handle"></div>'
        + '<div class="modal-title">Signaler ' + escapeHtml(String(quoi || "")) + '</div>'
        + '<div class="modal-subtitle">Dis-nous en deux mots ce qui ne va pas. '
        + 'Ton signalement est confidentiel.</div>'
        + '<label class="field"><span>Motif</span>'
        + '<textarea class="textarea" id="signalementMotif" placeholder="Ce qui te pose problème…"></textarea></label>'
        + '<div class="onb-footer">'
        + '<button type="button" class="btn primary block" onclick="_signalementValider()">Envoyer le signalement</button>'
        + '<button type="button" class="btn ghost block" onclick="_signalementAnnuler()">Annuler</button>'
        + '</div>');
      var champ = document.getElementById("signalementMotif");
      if (champ) champ.focus();

      // ⚠️ LA FENÊTRE SE FERME PAR QUATRE AUTRES CHEMINS QUE NOS DEUX BOUTONS :
      // le « × » injecté par `openModal`, le fond, `Escape`, et la poignée
      // `.modal-handle` — le geste le plus naturel sur un téléphone. Aucun
      // n'appelle `_signalementAnnuler` : sans ce guetteur, la promesse restait
      // PENDANTE À VIE et l'appelant ne reprenait jamais la main. Un abandon
      // doit se prononcer, comme un refus.
      // ⚠️ ET CES QUATRE CHEMINS NE VIDENT PAS LA FENÊTRE (revue du 2026-11-03) :
      // `closeModal` retire seulement `.active` du fond, le champ RESTE dans
      // `#modalContent`. Le guetteur qui n'attendait que la disparition du champ
      // ne se prononçait donc qu'à l'ouverture de la modale SUIVANTE — d'ici là,
      // `reportMessage`/`reportPost`/`reportUser`/`reportStory` restaient
      // suspendus. On guette aussi la classe du fond : `.active` perdue = fenêtre
      // fermée = abandon, sur-le-champ. « Envoyer » et « Annuler » appellent
      // `fini` AVANT `closeModal` : `fait` interdit la seconde résolution.
      // Le champ est comparé par IDENTITÉ (`isConnected`), jamais par son id : une
      // seconde fenêtre de motif ouverte par-dessus porte le même id, et la
      // première promesse ne doit pas lui survivre.
      var racine = document.getElementById("modalContent") || document.body;
      var fond = document.getElementById("modalBackdrop");
      var abandonnee = function () {
        if (!champ || !champ.isConnected) return true;
        return !!(fond && !fond.classList.contains("active"));
      };
      if (window.MutationObserver && racine) {
        observateur = new MutationObserver(function () {
          if (abandonnee()) fini(null);
        });
        observateur.observe(racine, { childList: true, subtree: true });
        if (fond) observateur.observe(fond, { attributes: true, attributeFilter: ["class"] });
      }
    } catch (e) {
      // ⚠️ ON N'ENCHAÎNE PAS SUR UN MOTIF VIDE. Un `catch` large ici masquerait
      // une ReferenceError (famille `diagLog`) et enverrait le signalement SANS
      // motif ni fenêtre — précisément le défaut que ce lot vient de fermer.
      try { if (typeof diagLog === "function") diagLog("signalement_motif_indisponible " + ((e && e.message) || "?")); } catch (e2) {}
      fini(null);
    }
  });
}

// ── SIGNALER UNE PASSION (2026-09-09) ─────────────────────────────────────
// Depuis le 2026-09-08, un nom écrit par un compte entre dans le référentiel
// COMMUN : il faut pouvoir le signaler. Aucune file nouvelle — `supaReport`
// (app-08) et la table `reports` servent déjà aux comptes et aux publications ;
// une seconde file aurait divergé au premier correctif.
//
// ⚠️ LE SIGNALEMENT NE RETIRE RIEN, et le message ne doit pas le laisser
// croire. Le retrait est un geste humain (`scripts/passions-moderation.js`),
// et il passe par `status = 'archived'` : la ligne survit, les publications
// qui la référencent aussi.
//
// ⚠️ ON LIT LE VERDICT. `supaReport` rend `false` sur un refus RLS comme sur un
// doublon — le SDK ne lève pas —, et annoncer « signalement envoyé » sur une
// écriture refusée est précisément le défaut que ce dépôt a déjà payé.
async function reportPassion(pid, label) {
  if (!pid) return;
  // La porte AVANT l'écriture : signaler suppose un compte (la RLS l'exige de
  // toute façon, `reporter_id = auth.uid()`).
  try {
    if (typeof requireAuthentication === "function" && !requireAuthentication("signaler")) return;
  } catch (e) {}
  var nom = String(label || pid);
  var ok = false;
  try {
    if (typeof supaReport === "function") ok = await supaReport("passion", pid, "");
  } catch (e) { ok = false; }
  if (ok) {
    toast("🚩 « " + nom + " » signalée. On vérifie.", "success");
  } else {
    // Le doublon est le cas le plus fréquent : l'index unique refuse un second
    // signalement de la même personne sur la même passion.
    toast("Signalement déjà envoyé, ou impossible pour le moment.");
  }
}

async function reportPost(postId) {
  if (!postId) return;
  try {
    if (typeof requireAuthentication === "function" && !requireAuthentication("signaler")) return;
  } catch (e) {}
  var motif = await _demanderMotifSignalement("cette publication");
  if (motif === null) return;
  var ok = false;
  try { if (typeof supaReport === "function") ok = await supaReport("post", postId, motif); } catch (e) { ok = false; }
  toast(ok
    ? "Publication signalée. Merci, on s'en occupe."
    : "Signalement déjà envoyé, ou impossible pour le moment.", ok ? "success" : "warning");
  if (ok) _accuserReceptionSignalement();
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
      <button class="btn ghost bloque-debloquer" onclick="unblockUser('${escapeJsArg(id)}','${escapeJsArg(name)}')">Débloquer</button>
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
    <div class="modal-title">Comptes bloqués</div>
    <div class="modal-subtitle">Leurs publications, commentaires et messages te sont masqués. Débloquer les rétablit, sans réabonnement automatique.</div>
    <div id="blockedListBox" style="max-height:320px;overflow-y:auto;margin-top:8px;">${_blockedListHtml()}</div>
    <button class="btn primary block" style="margin-top:12px;" onclick="closeModal()">OK</button>
  `);
  // LOT-17 (audit UX/UI du 2026-11-10, TRA-C09) : un compte absent du cache
  // local s'affichait « ? Utilisateur » — on relit son nom et sa photo sur
  // `profiles` (lecture publique, aucun droit nouveau), puis on repeint.
  try {
    var inconnus = (state.user.blocked || []).filter(function (id) { var u = userById(id); return !u || !u.name; });
    if (inconnus.length && typeof _resolveProfilesByIds === "function") {
      _resolveProfilesByIds(inconnus).then(function () { renderBlockedList(); }).catch(function () {});
    }
  } catch (e) {}
}

function shareUserProfile(userId, name) {
  // Lien COURT en production (aperçu du profil chez WhatsApp, iMessage…) : app-06.
  const rawUrl = (typeof lienPartageDe === "function")
    ? lienPartageDe("user", userId) : location.origin + location.pathname + "#user-" + userId;
  const url = (window.tel && tel.shareLink) ? tel.shareLink(rawUrl, "profile", userId, navigator.share ? "native" : "clipboard") : rawUrl;
  // LOT-12 (PAR-C07) : le profil passait directement à la feuille du téléphone,
  // sans rien montrer de ce qui part.
  ouvrirFeuillePartage({
    quoi: "profil", titre: name || "Profil PASSIO", url: url,
    message: "Découvre " + (name || "ce profil") + " sur PASSIO",
    voit: "La personne qui reçoit le lien voit ce profil et ses publications publiques.",
    idEnvoyer: "_shareUserOutBtn",
  });
}

function renderMessages() {
  const list = $("#messageList");
  if (!list) return;
  // Badge nav TOUJOURS à jour (visible depuis tous les écrans)…
  try { if (typeof renderMsgBadge === "function") renderMsgBadge(); } catch(e) {}
  // …mais la LISTE n'est reconstruite que si elle est visible. Elle était
  // rebuild à chaque envoi/réception même cachée derrière la conversation
  // plein écran ou un autre écran. goTo('messages') et closeConversation()
  // rappellent renderMessages() → rattrapage garanti à l'affichage.
  const _scr = document.getElementById("screen-messages");
  const _fp = document.getElementById("conv-fullpage");
  if ((_scr && !_scr.classList.contains("active")) || (_fp && _fp.classList.contains("active"))) return;
  const convs = getConversations();

  // Génère les pills lu/non lu
  renderMessageFilters();

  const _q = plierRecherche((window._msgSearchQuery || "").trim());
  const _showArch = !!window._showArchived;

  // Masquer les conversations avec un utilisateur bloqué (modération)
  let filtered = convs.filter(c => !(typeof isBlocked === "function" && isBlocked(c.userId)));

  // Bandeau « Archivées » : compteur + bascule (caché pendant une recherche).
  const archivedCount = filtered.filter(c => c.archived).length;
  const archRow = document.getElementById("archivedToggleRow");
  if (archRow) {
    if (_q) archRow.innerHTML = "";
    else if (_showArch) archRow.innerHTML = `<button class="btn ghost block" onclick="_toggleArchivedView()" style="font-size:13px;">← Retour aux conversations</button>`;
    else if (archivedCount) archRow.innerHTML = `<button class="btn ghost block" onclick="_toggleArchivedView()" style="font-size:13px;">Archivées (${archivedCount})</button>`;
    else archRow.innerHTML = "";
  }

  if (_q) {
    // Recherche globale : nom de conversation OU texte d'un message (archivées incluses).
    filtered = filtered.filter(c => {
      const name = plierRecherche(c.isGroup ? (c.groupName || "") : (c.userName || ""));
      if (name.indexOf(_q) > -1) return true;
      return (c.messages || []).some(m => plierRecherche(m.text || "").indexOf(_q) > -1);
    });
  } else {
    // Vue normale : actives, ou archivées si on a basculé.
    filtered = filtered.filter(c => _showArch ? c.archived : !c.archived);
  }
  // Épinglées d'abord, puis les VRAIES conversations, puis les exemples (LOT-5,
  // PCS-006 : elles étaient mêlées), chacune par date du dernier message.
  const _exConv = (c) => (typeof _estConvDemo === "function" && _estConvDemo(c)) ? 1 : 0;
  filtered.sort((a, b) => ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || (_exConv(a) - _exConv(b)) || (b.lastAt - a.lastAt));

  if (!filtered.length) {
    // Squelette shimmer tant que le chargement réseau initial n'est pas terminé
    // (évite le flash « Aucune conversation » au boot). Filet anti-squelette
    // éternel : au-delà de 8 s on bascule sur l'état vide normal.
    if (!_q && !_showArch && !window._convNetLoaded && window._supaReal !== false) {
      if (!window._convSkelTimeout) {
        window._convSkelTimeout = setTimeout(function () {
          // LOT-20 (MSG-C32) : le filet ne prétend plus que la lecture est finie —
          // il dit qu'elle est LENTE. « Aucune conversation » est réservé à une
          // lecture réellement revenue vide (`_convNetLoaded` posé par app-08).
          if (!window._convNetLoaded) window._convChargementLent = true;
          window._convNetLoaded = true;
          try { renderMessages(); } catch (e) {}
        }, 8000);
      }
      const empt0 = $("#messagesEmpty");
      if (empt0) empt0.style.display = "none";
      let skel = "";
      for (let i = 0; i < 4; i++) {
        skel += '<div class="msg-skel-row" aria-hidden="true"><div class="skeleton msg-skel-av"></div>'
          + '<div style="flex:1;"><div class="skeleton skel-line" style="width:' + (34 + (i * 19) % 38) + '%;margin-bottom:7px;"></div>'
          + '<div class="skeleton skel-line" style="width:' + (58 + (i * 13) % 30) + '%;height:9px;"></div></div></div>';
      }
      list.innerHTML = skel;
      return;
    }
    list.innerHTML = "";
    const empt = $("#messagesEmpty");
    if (empt) {
      empt.style.display = "block";
      const t = empt.querySelector(".empty-title"), x = empt.querySelector(".empty-text");
      if (_q) { if (t) t.textContent = "Aucun résultat"; if (x) x.textContent = "Aucune conversation ni message ne correspond à ta recherche."; }
      else if (_showArch) { if (t) t.textContent = "Aucune conversation archivée"; if (x) x.textContent = "Les conversations archivées apparaîtront ici."; }
      else if (window._convChargementLent) {
        if (t) t.textContent = "Chargement plus long que prévu…";
        if (x) x.textContent = "Tes conversations n'ont pas encore répondu.";
      }
      // MSG-C19 : la consigne envoyait vers un champ qui ne cherche pas de personnes.
      else { if (t) t.textContent = "Aucune conversation"; if (x) x.textContent = "Écris à une personne pour démarrer une discussion."; }
      _peindreActionEtatVideMessages(empt, !_q && !_showArch);
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

  let _identiteAlignee = false;
  visible.forEach(function (c) { if (_alignerIdentiteConv(c)) _identiteAlignee = true; });
  if (_identiteAlignee) saveConversations();

  list.innerHTML = visible.map(c => {
    const seedUsersArr = state.seed.users || [];
    const u = seedUsersArr.find(x => x.id === c.userId) || { name: "Inconnu", avatar: "#7c3aed", profileEmoji: "🙂" };
    const _visibles = (c.messages || []).filter(_msgVisiblePourMoi);
    const lastMsg = _visibles.length ? _visibles[_visibles.length - 1] : null;
    // MSG-C12 : une seule autorité (le TYPE d'abord), jamais l'étiquette technique.
    const _previewContent = lastMsg ? (_msgPreviewText(lastMsg) || "") : "";
    const previewText = (c.draft && c.id !== window._openedConvId)
      ? "Brouillon : " + c.draft
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
    // ⚠️ `_cssUrl`, comme l'en-tête de la conversation (plus bas) et le panneau
    // du groupe (app-05) : `passioThumb` TRANSFORME, il ne désinfecte pas (audit
    // D du 2026-11-02 — une `groupPhoto` « javascript: » traversait intacte dans
    // ce `url(` ; le socle de `audit-echappement` créditait à tort cette branche
    // de `safeUrlAttr`). Aujourd'hui la photo de groupe n'est écrite que par
    // l'appareil de son créateur (data URL), mais une ligne serveur ou une fusion
    // multi-appareils en ferait une donnée d'autrui : le contexte décide.
    const avatarStyle = (c.isGroup && c.groupPhoto)
      ? `background:url('${_cssUrl(passioThumb(c.groupPhoto, 192)) || ""}') center/cover;font-size:0;`
      : (c.isGroup ? `background:${displayAvatar};` : `background:${avatarBg(_convU)};`);
    const _convAvInner = (c.isGroup && c.groupPhoto) ? '' : (c.isGroup ? displayEmoji : avatarInner(_convU));

    const membresLine = c.isGroup
      ? `<div class="msg-passion" style="font-size:11px;color:var(--muted);">👥 ${(typeof nbMembresGroupe === "function" ? nbMembresGroupe(c) : ((c.userIds||[]).length || 0))} membres</div>`
      : "";

    const _demo = _estConvDemo(c);
    const _nonLus = _demo ? 0 : (c.unread || 0);
    return `<div class="msg-card ${_nonLus > 0 ? "unread" : ""}" ${_demo ? 'data-conv-demo="1"' : ""} onclick="openConversation('${escapeJsArg(c.id)}')">
      <div class="msg-avatar" style="${avatarStyle}">${_convAvInner}</div>
      <div class="msg-body">
        <div class="msg-head">
          <span class="msg-name">${c.pinned ? "📌 " : ""}${escapeHtml(displayName)}${(c._muted || c.muted) ? ' <span class="msg-sourdine" title="Notifications coupées" aria-label="Notifications coupées">🔕</span>' : ""}</span>
          <span class="msg-time">${lastMsg ? fmtMsgTime(c.lastAt) : ""}</span>
        </div>
        ${membresLine}
        ${_demo ? '<div class="msg-passion" style="font-size:11px;color:var(--muted);">Exemple PASSIO · réponse désactivée</div>' : ""}
        <div class="msg-preview ${_nonLus > 0 ? 'unread-preview' : ''}">${escapeHtml(previewText)}</div>
      </div>
      ${_nonLus > 0 ? `<div class="msg-badge">${_nonLus}</div>` : ""}
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
  toast(c.archived ? "Conversation archivée" : "Conversation désarchivée");
}

// Pointeur fin = souris/trackpad (poste de travail), par opposition au doigt.
// `matchMedia` peut manquer sur de très vieux moteurs : sans lui on considère
// l'appareil comme tactile, le choix qui ne peut pas ouvrir un clavier de force.
function _pointeurFin() {
  try {
    return !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches);
  } catch (e) { return false; }
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
  _alignerIdentiteConv(c); // pseudo changé depuis la création du fil
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
    // ⚠️ La photo de groupe est posée par N'IMPORTE QUEL membre : elle entrait
    // brute dans un url() CSS, où une parenthèse ou un guillemet suffisait à sortir
    // de la déclaration puis de l'attribut. _cssUrl pourcent-encode les deux.
    avatarHtml = `<div onclick="pickGroupPhoto('${escapeJsArg(convId)}')" style="position:relative;flex-shrink:0;cursor:pointer;">
      <div class="conv-fp-head-avatar" style="background:url('${_cssUrl(passioThumb(c.groupPhoto, 192)) || ""}') center/cover;font-size:0;"></div>
      <div style="position:absolute;bottom:-1px;right:-1px;width:14px;height:14px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:8px;border:1.5px solid var(--bg-soft);">📷</div>
    </div>`;
  } else {
    const _hu = { avatar: displayAvatar, profileEmoji: displayEmoji, photoUrl: (userById(c.userId) || {}).photoUrl || c.userPhoto || u.photoUrl || null };
    avatarHtml = `<div class="conv-fp-head-avatar" style="background:${avatarBg(_hu)};" onclick="${c.isGroup ? '' : `openUserProfile('${escapeJsArg(c.userId)}','seed')`}">${avatarInner(_hu)}</div>`;
  }

  // ── Header ──
  const headEl = document.getElementById("convFpHead");
  if (headEl) headEl.innerHTML = `
    <button class="conv-fp-back" onclick="closeConversation()" aria-label="Retour">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    ${avatarHtml}
    <div class="conv-fp-head-info" onclick="${c.isGroup ? '' : `openUserProfile('${escapeJsArg(c.userId)}','seed')`}">
      <div class="conv-fp-name">${escapeHtml(displayName)}</div>
      <div class="conv-fp-passion">${c.isGroup ? `👥 ${(c.userIds||[]).length} membres` : 'Voir le profil'}</div>
    </div>
    <div class="conv-actions">
      ${c.isGroup ? `<button class="conv-action-btn" onclick="showGroupMembers('${escapeJsArg(convId)}')" title="Membres">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      </button>` : ''}
      ${(c.isGroup || (typeof appelsDisponibles === "function" && !appelsDisponibles())) ? '' : `<button class="conv-action-btn" onclick="startCall('${escapeJsArg(convId)}','voice')" title="Appel audio">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.6 1.2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      </button>
      <button class="conv-action-btn" onclick="startCall('${escapeJsArg(convId)}','video')" title="Appel vidéo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
      </button>`}
      <button class="conv-action-btn" onclick="openConvSettings('${escapeJsArg(convId)}')" title="Paramètres">
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
    // LOT-20 (MSG-C59) : sur un clavier TACTILE il n'y a pas de Maj+Entrée — la
    // touche de retour envoyait le message en cours, impossible de sauter une
    // ligne. Au doigt, Entrée insère un saut de ligne et seul le bouton envoie ;
    // sur ordinateur (pointeur fin), Entrée envoie et Maj+Entrée saute une ligne.
    var _tactile = !_pointeurFin();
    inp.setAttribute("enterkeyhint", _tactile ? "enter" : "send");
    if (!inp.getAttribute("aria-label")) inp.setAttribute("aria-label", "Écrire un message");
    inp.onkeydown = function(e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !_tactile) { e.preventDefault(); sendMessageFp(convId, displayName); }
    };
  }
  if (btn) btn.onclick = () => sendMessageFp(convId, displayName);

  const fp = document.getElementById("conv-fullpage");
  var thread = document.getElementById("convFpThread");
  // Fond de conversation personnalisé (réglages → 🎨), sinon fond par défaut.
  if (thread) thread.style.background = c.bg || "var(--bg-deep)";

  // ⚠️ LE FIL EST PEINT AVANT QUE LE PANNEAU N'ENTRE À L'ÉCRAN.
  // Défaut vécu (« j'ouvre une conversation, les messages déjà envoyés ne
  // s'affichent pas, je dois retaper sur l'écran pour les faire apparaître ») :
  // `.active` était posé D'ABORD, donc la transition `translateX(100%) → 0`
  // démarrait sur un fil VIDE (ou sur celui de la conversation précédente), et
  // le contenu était injecté dans la foulée, alors que la couche composée du
  // panneau — promue en permanence par `will-change` et entièrement découpée
  // par l'`overflow:hidden` de `.app-shell` — venait d'être demandée vide.
  // Sur Android, ces tuiles revenaient blanches et n'étaient re-rasterisées
  // qu'à la prochaine invalidation, c'est-à-dire au premier toucher.
  // Règle générale : on ne révèle jamais un panneau animé avant d'y avoir mis
  // son contenu. (Le `will-change` permanent a été retiré de `styles.css` :
  // la transition promeut déjà la couche le temps de l'animation.)
  renderConvFpThread(c, displayName);
  // `_auBas` survit d'une conversation à l'autre (le nœud est réutilisé) :
  // une conversation qu'on ouvre part du bas, quelle que soit la précédente.
  if (thread) { thread.scrollTop = thread.scrollHeight; thread._auBas = true; thread._nouveaux = 0; }
  try { var _bas = document.getElementById("convFpBas"); if (_bas) _bas.hidden = true; } catch (e) {}

  // ── Afficher pleine page ──
  if (fp) {
    fp.setAttribute("data-conv-id", convId);
    fp.setAttribute("data-display-name", displayName);
    // Entrée d'historique : sans elle, le geste de retour depuis le bord de
    // l'écran ne fermait PAS la conversation — il changeait d'écran derrière
    // elle, puis quittait l'application au coup suivant.
    if (!fp.classList.contains("active")) pushOverlayHistory("conv", "#conv");
    fp.classList.add("active");
  }

  // Le fil est scrollé en bas AVANT l'entrée du panneau, donc pendant que
  // celui-ci est encore découpé : certaines hauteurs (médias, polices) ne sont
  // connues qu'une fois visible. On re-épingle le bas à la fin de la transition
  // (280 ms), sauf si la personne a déjà remonté le fil elle-même.
  setTimeout(function() {
    if (window._openedConvId !== convId) return;
    var t = document.getElementById("convFpThread");
    if (!t || t._loadingOlder) return;
    if (t.scrollTop + t.clientHeight >= t.scrollHeight - 80) t.scrollTop = t.scrollHeight;
  }, 320);

  // Le CTA IRL n'est jamais présent dans le HTML initial. Il est ajouté
  // seulement après le verdict serveur âge + blocage de #136. Le drapeau est actif
  // par défaut : visiteur et session expirée s'arrêtent avant le réseau
  // (`irlProposalServerVerdict`, app-07).
  if (!c.isGroup && typeof irlProposalEnabled === "function" && irlProposalEnabled()
      && typeof irlProposalMountConversationAction === "function") {
    irlProposalMountConversationAction(convId, c.userId);
  }

  // Souscrire aux nouveaux messages en temps réel
  _supaConvSpecificChannel(convId, displayName);
  _subscribeTyping(convId);
  // Accusés de lecture réels : je marque comme lu + je charge l'état de l'autre.
  try { if (typeof supaMarkRead === "function") supaMarkRead(convId); } catch(e) {}
  try { if (typeof supaLoadOtherRead === "function") supaLoadOtherRead(convId); } catch(e) {}

  // ⚠️ NE PAS DONNER LE FOCUS AU CHAMP SUR UN APPAREIL TACTILE.
  // Défaut vécu, mesuré le 2026-09-02 : `inp.focus()` s'exécutait DANS le geste
  // de tap qui ouvre la conversation, donc Android ouvrait le clavier virtuel.
  // Ce qui suit est mesuré, pas déduit (390 × 844, conversation de 40 messages,
  // viewport visible ramené à 500 px comme le fait le clavier) :
  //   · `syncAppViewportHeight` (app-09) REFUSE de rétrécir `--app-vh` pendant
  //     la frappe — garde `typing && h < prev * 0.75`, posée pour ne pas figer
  //     une hauteur amputée. `--app-vh` reste donc à 844 px ;
  //   · `.app-shell` garde ses 844 px alors que 500 seulement sont visibles ;
  //   · le fil va de y=60 à y=782 et, scrollé en bas, place le message le plus
  //     récent à y=699..761 — soit ENTIÈREMENT sous le clavier (mesure :
  //     `VISIBLE: false`). Le champ de saisie, à y≈782..844, l'est aussi.
  // À l'écran : on ouvre la conversation, on voit le HAUT du fil (les vieux
  // messages, ou du vide), et il faut taper ailleurs pour fermer le clavier —
  // « je suis obligé de recliquer sur l'écran pour faire tout apparaître ».
  // Aucune messagerie n'ouvre le clavier à l'ouverture d'un fil (WhatsApp,
  // Messenger, iMessage) : on le fait en touchant le champ. Le focus n'est donc
  // gardé que là où il est utile et sans effet de bord — pointeur fin, c'est-à-dire
  // souris et clavier physique.
  if (inp && _pointeurFin()) inp.focus();
  try { renderMessages(); } catch(e) {}

  // Charger TOUS les messages depuis Supabase (pas de limite, tous les anciens inclus)
  await _fusionnerMessagesServeur(convId, displayName, thread);
}

// La lecture serveur d'une conversation OUVERTE, fusionnée sans perdre l'état
// local (réaction, statut d'envoi, pierres tombales), re-rendue seulement si
// quelque chose a changé. Appelée à l'ouverture, et au RÉVEIL du socket
// (`_rtReveiller`, app-08) : ce qui est arrivé pendant le repos remonte ici.
async function _fusionnerMessagesServeur(convId, displayName, thread) {
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    try {
      var supaMessages = await supaLoadMessages(convId);
      if (window._openedConvId !== convId) return;
      var convs2 = getConversations();
      var c2 = convs2.find(function(x) { return x.id === convId; });
      if (!c2) return;
      // Ce que j'ai supprimé ici ne revient pas du serveur (MSG-06).
      var _tombOuv = convTombLoad();
      var remote = (supaMessages || []).filter(function (m) { return !_msgMasquePourMoi(_tombOuv, convId, m); });
      // Signature avant fusion : si rien ne change, on ÉVITE le 2ᵉ re-render
      // (flash visible + éléments média recréés à CHAQUE ouverture de conv).
      var _sigOf = function(list) { return (list || []).map(function(m){ return m.id + (m.status || ""); }).join(","); };
      var _sigBefore = _sigOf(c2.messages);
      var _readBefore = !!c2._otherRead;
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

      // Les retraits « pour tous » rejoués par `supaLoadMessages` atteignent la
      // copie locale (sinon un retrait manqué en temps réel ne quittait jamais
      // l'appareil) — seulement si l'auteur de la copie est l'expéditeur de la
      // ligne de contrôle, et jamais sur un message que le serveur rend encore.
      var _retraits = (supaMessages && supaMessages._retraitsPourTous) || [];
      if (_retraits.length && typeof _ctrlSuppressionAutorisee === "function") {
        var _parCible = {};
        _retraits.forEach(function (x) {
          if (!x || !x.target) return;
          if (!Object.prototype.hasOwnProperty.call(_parCible, x.target)) _parCible[x.target] = [];
          _parCible[x.target].push(x.from);
        });
        messages = messages.filter(function (m) {
          if (!m || !m.id || remoteMap[m.id] || !Object.prototype.hasOwnProperty.call(_parCible, m.id)) return true;
          return !_parCible[m.id].some(function (qui) { return _ctrlSuppressionAutorisee(m, qui); });
        });
      }

      // Ajouter les messages Supabase qui n'existent pas localement
      var localIds = new Set((c2.messages || []).map(function(m) { return m.id; }).filter(Boolean));
      remote.forEach(function(m) {
        if (!localIds.has(m.id)) messages.push(m);
      });

      c2.messages = messages;
      c2.messages.sort(function(a, b) { return (a.at || 0) - (b.at || 0); });
      c2._otherRead = true;
      saveConversations();
      // Re-render seulement si la fusion a réellement changé quelque chose
      // (nouveau message, statut, ou passage non-lu → lu des accusés).
      if (window._openedConvId === convId && (_sigOf(c2.messages) !== _sigBefore || !_readBefore)) {
        _rerendreFilSansArracher(c2, displayName);
      }
    } catch(e) { console.warn("openConversation supabase load error:", e); }
  }
}
// Rattrapage de la conversation ouverte depuis l'écran (nom et fil retrouvés
// dans le DOM : aucune référence gardée à travers un repos).
async function _rattraperConversationOuverte() {
  var convId = window._openedConvId;
  if (!convId) return;
  var fp = document.getElementById("conv-fullpage");
  var nom = fp ? (fp.getAttribute("data-display-name") || "") : "";
  var avant = (getConversations().find(function (x) { return x.id === convId; }) || {}).messages;
  avant = avant ? avant.length : 0;
  await _fusionnerMessagesServeur(convId, nom, document.getElementById("convFpThread"));
  if (window._openedConvId !== convId) return;
  var c = getConversations().find(function (x) { return x.id === convId; });
  if (!c) return;
  // Ce que le chemin temps réel faisait pour une conversation OUVERTE, le
  // rattrapage le fait aussi : ce qu'on a sous les yeux est lu (pastille et
  // accusé côté serveur), et les lectures de l'AUTRE pendant le repos sont
  // relues (✓✓) — sinon la liste recomptait ces messages « non lus ».
  c.unread = 0;
  if ((c.messages || []).length > avant) { try { if (typeof supaMarkRead === "function") supaMarkRead(convId); } catch (e) {} }
  try { if (typeof supaLoadOtherRead === "function") await supaLoadOtherRead(convId); } catch (e) {}
  try { if (typeof renderMsgBadge === "function") renderMsgBadge(); } catch (e) {}
  try { if (typeof renderMessages === "function") renderMessages(); } catch (e) {}
}
window._rattraperConversationOuverte = _rattraperConversationOuverte;

function renderConvFpThread(c, displayName) {
  var thread = document.getElementById("convFpThread");
  if (!thread) return;
  // ⚠️ UN MEMBRE BLOQUÉ NE S'AFFICHE PAS DANS UN GROUPE COMMUN (MSG-10, 2026-09-14).
  // Le blocage ne s'appliquait aux messages qu'à la RÉCEPTION temps réel
  // (`_handleIncomingConvMessage`) : l'historique rechargé et le fil rendu
  // montraient tout ce que la personne bloquée avait écrit dans un groupe
  // partagé — elle y reste membre (c'est l'organisateur qui l'exclut), mais
  // ce qu'elle écrit ne doit pas atteindre celui qui l'a bloquée.
  var allMsgs = (c.messages || []).filter(_msgVisiblePourMoi);

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
    // LOT-20 (MSG-C61) : des JOURS CALENDAIRES (minuit local), pas des tranches
    // de 24 h — un message d'hier soir passait sous « Aujourd'hui », suivi d'un
    // second « Aujourd'hui », et « Hier » désignait avant-hier.
    var diffDays = -joursCalendairesAvant(d.getTime(), now.getTime());
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return "Hier";
    if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
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
      // Holder [data-msgst] : _setMsgStatus patche cet indicateur EN PLACE
      // (sans re-render du fil, qui ramènerait le scroll en bas).
      statusInd = '<span data-msgst="' + escapeHtml(m.id) + '">' + _msgStatusIndHtml(c.id, m.id, m.status) + '</span>';
    }

    // Temps — affiché sur chaque message avec heure exacte (HH:MM)
    var isLastInGroup = (i === msgs.length - 1) || (msgs[i+1] && msgs[i+1].from !== m.from) || (msgs[i+1] && m.at && msgs[i+1].at && _dayKey(msgs[i+1].at) !== msgDay);
    var timeStr = '';
    if (m.at) {
      // LOT-20 (MSG-C62) : pas de « ✓ » sur un message qui n'est pas parti.
      var _pasParti = m.status === "sending" || m.status === "failed";
      var receipt = (isLastMe && isLastInGroup && !_pasParti) ? readReceipt : '';
      var d = new Date(m.at);
      var hours = String(d.getHours()).padStart(2, '0');
      var mins = String(d.getMinutes()).padStart(2, '0');
      var timeExact = hours + ':' + mins;
      timeStr = '<span class="conv-bubble-time">' + timeExact + receipt + statusInd + '</span>';
    } else if (isMe) {
      timeStr = '<span class="conv-bubble-time">' + ((isLastMe && isLastInGroup && m.status !== "sending" && m.status !== "failed") ? readReceipt : '') + statusInd + '</span>';
    }

    // Contenu
    var content = "";
    var isMedia = false;
    // LOT-4 (MSG-C50) : seuls les médias VISUELS perdent le fond de la bulle ; vocal,
    // document et position le gardent (blanc sur fond clair : 1,08:1 mesuré).
    var isVisuel = false;

    // Décoder le JSON du texte si nécessaire (messages média Supabase non encore décodés)
    applyMsgContentData(m);

    // safeUrlAttr : ces URLs viennent du JSON décodé d'un message ENVOYÉ PAR
    // L'AUTRE compte → sans neutralisation un correspondant pouvait sortir de
    // l'attribut src (XSS) ou pointer un href javascript:.
    if (m.gif) {
      isMedia = true; isVisuel = true;
      content = '<img src="' + safeUrlAttr(m.gif) + '" style="max-width:200px;max-height:160px;border-radius:12px;display:block;" loading="lazy"/>';
    } else if (m.video) {
      isMedia = true; isVisuel = true;
      // ⚠️ `playsinline` est OBLIGATOIRE : sans lui, iOS confisque la lecture et
      // bascule en lecteur plein écran natif dès le premier tap — on quitte la
      // conversation, on perd le fil, et il faut ressortir à la main. Android
      // lit en place. C'était le SEUL <video> du dépôt à ne pas le porter.
      // Et la balise était AUTO-FERMÉE (`/>`), ce qui n'existe pas en HTML pour
      // un élément à contenu : l'analyseur ouvre l'élément et avale ce qui suit.
      // Sans conséquence tant que rien ne suit dans la bulle — c'est un piège
      // posé pour le prochain qui ajoutera quelque chose derrière.
      // `attrMediaSrc` (app-02) : une PIÈCE JOINTE porte `data-pj` au lieu de `src`,
      // et `signerPiecesJointes(thread)` pose l'URL signée après le rendu — le seau
      // `attachments` est privé depuis le 2026-09-11. Un GIF (Tenor) garde son src.
      content = '<video ' + attrMediaSrc(m.video) + ' style="max-width:200px;max-height:200px;border-radius:12px;display:block;cursor:pointer;" controls playsinline preload="none"></video>';
    } else if (m.img) {
      isMedia = true; isVisuel = true;
      content = '<img loading="lazy" decoding="async" ' + attrMediaSrc(m.img) + ' style="max-width:200px;max-height:200px;border-radius:12px;display:block;cursor:pointer;" onclick="openFullImg(this.src)"/>';
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
      content = '<a ' + attrMediaSrc(m.fileUrl, "href") + ' target="_blank" rel="noopener" style="text-decoration:none;color:inherit;display:inline-block;">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:8px;cursor:pointer;">' +
        '<div style="width:36px;height:36px;border-radius:10px;background:' + docBg + ';border:1px solid ' + docBorder + ';display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">' + fileIcon + '</div>' +
        '<div style="min-width:0;"><div class="msg-fichier-nom" title="' + fname + '">' + fname + '</div>' +
        '<div style="font-size:10px;opacity:0.6;">Télécharger</div></div></div></a>';
    } else if (m.location) {
      isMedia = true;
      content = '<a href="' + safeUrlAttr(m.location.url || 'https://maps.google.com') + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">' +
        '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;">' +
        '<div style="font-size:20px;">📍</div>' +
        '<div><div style="font-size:13px;">Position</div><div style="font-size:11px;opacity:0.7;">' + escapeHtml(m.location.lat + ', ' + m.location.lng) + '</div></div></div></a>';
    } else if (m.voiceData && !m.isFile) {
      isMedia = true;
      var vDur = m.voiceDuration || 0;
      var vDurStr = Math.floor(vDur/60) + ':' + String(vDur%60).padStart(2,'0');
      var aid = 'aud_' + (m.id || i).toString().replace(/[^a-z0-9]/gi,'');
      window['_vd_' + aid] = m.voiceData;
      var waveBg = isMe ? 'rgba(255,255,255,0.2)' : 'rgba(139,92,246,0.12)';
      var waveFill = isMe ? 'rgba(255,255,255,0.6)' : 'var(--accent)';
      content = '<div style="display:flex;align-items:center;gap:8px;min-width:180px;max-width:240px;">' +
        '<button style="width:34px;height:34px;border-radius:50%;background:' + (isMe?'rgba(255,255,255,0.2)':'rgba(139,92,246,0.12)') + ';border:none;color:' + (isMe?'#fff':'var(--accent)') + ';cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;" onclick="_playVoiceById(\'' + escapeJsArg(aid) + '\')" id="pb_' + aid + '">▶</button>' +
        '<div style="flex:1;height:28px;background:' + waveBg + ';border-radius:8px;overflow:hidden;cursor:pointer;" onclick="_playVoiceById(\'' + escapeJsArg(aid) + '\')"><div id="wf_' + aid + '" style="height:100%;background:' + waveFill + ';border-radius:8px;width:0%;transition:width 0.15s;"></div></div>' +
        '<span id="dur_' + aid + '" style="font-size:11px;opacity:0.75;flex-shrink:0;min-width:30px;text-align:right;">' + vDurStr + '</span>' +
        '<button class="voice-speed-btn" onclick="_cycleVoiceSpeed()" style="flex-shrink:0;background:' + (isMe?'rgba(255,255,255,0.18)':'rgba(139,92,246,0.12)') + ';border:none;color:' + (isMe?'#fff':'var(--accent)') + ';font-size:10px;font-weight:800;border-radius:8px;padding:2px 6px;cursor:pointer;">' + (((window._voiceSpeed||1) % 1 === 0) ? (window._voiceSpeed||1) : String(window._voiceSpeed).replace(".",",")) + '×</button>' +
        '</div>';
    } else if (m.voiceData && m.isFile) {
      // LOT-20 (MSG-C51) : ma copie LOCALE d'un fichier audio envoyé était une
      // bulle vide (aucune branche ne la peignait) ; rechargée du serveur, la
      // même devenait une carte « 🎵 nom · Télécharger ». Même carte, tout de suite.
      isMedia = true;
      var aname = escapeHtml(m.fileName || 'Fichier audio');
      content = '<div style="display:flex;align-items:center;gap:10px;padding:4px 0;">' +
        (isMe
          ? '<div style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;" aria-hidden="true">🎵</div>'
          : '<div style="width:36px;height:36px;border-radius:10px;background:var(--bg-soft);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;" aria-hidden="true">🎵</div>') +
        '<div style="min-width:0;"><div class="msg-fichier-nom" title="' + aname + '">' + aname + '</div>' +
        '<div style="font-size:11px;opacity:0.75;">Fichier audio' + (m.fileSize ? ' · ' + escapeHtml(m.fileSize) : '') + '</div></div></div>';
    } else if (m.docData) {
      isMedia = true;
      var fname = escapeHtml(m.fileName || 'Fichier');
      var docBg = isMe ? 'rgba(255,255,255,0.12)' : 'var(--bg-soft)';
      var docBorder = isMe ? 'rgba(255,255,255,0.2)' : 'var(--border)';
      content = '<div style="display:flex;align-items:center;gap:10px;padding:4px 0;cursor:pointer;" onclick="_docDownload(\'' + escapeJsArg((m.id||i)) + '\')">' +
        '<div style="width:36px;height:36px;border-radius:10px;background:' + docBg + ';border:1px solid ' + docBorder + ';display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">📄</div>' +
        '<div style="min-width:0;"><div class="msg-fichier-nom" title="' + fname + '">' + fname + '</div>' +
        '<div style="font-size:10px;opacity:0.6;">' + escapeHtml((m.fileType||'') + (m.fileSize ? ' · '+m.fileSize : '')) + '</div></div></div>';
      // stocker pour le téléchargement
      window['_doc_' + (m.id||i)] = { data: m.docData, name: m.fileName || 'fichier' };
    } else if (m.text) {
      if (m.text.startsWith('📍')) {
        var parts2 = m.text.split(': ');
        // ⚠️ C'est un ATTRIBUT href alimenté par le texte d'un message reçu :
        // `escapeHtml` ne bloque PAS `javascript:` — seul `safeUrlAttr` le fait
        // (il n'accepte que http(s), data:image|audio|video et blob:).
        content = '<a href="' + safeUrlAttr(parts2[1]||'') + '" target="_blank" rel="noopener" style="color:inherit;">' + escapeHtml(m.text) + '</a>';
      } else {
        // LOT-20 (MSG-C67) : les liens http(s) d'un message s'ouvrent — échappement
        // D'ABORD, puis liens seulement (ni mentions ni mots-dièse ici).
        content = _liensMessage(escapeHtml(m.text));
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

    var bubbleStyle = isVisuel
      ? ' style="background:transparent;padding:0;box-shadow:none;' + extraBubbleStyle + '"'
      : (extraBubbleStyle ? ' style="' + extraBubbleStyle + '"' : '');

    // Bloc citation (réponse à un message)
    var replyHtml = "";
    if (m.replyTo && (m.replyTo.t || m.replyTo.n)) {
      replyHtml = '<div class="conv-reply-quote" onclick="_jumpToMsg(\'' + escapeJsArg((m.replyTo.id||'')) + '\')">' +
        '<span class="conv-reply-name">' + escapeHtml(m.replyTo.n || '') + '</span>' +
        '<span class="conv-reply-text">' + escapeHtml((m.replyTo.t || 'Pièce jointe').slice(0,80)) + '</span></div>';
    }

    // Réactions sous la bulle
    var reactHtml = "";
    if (m.reactions && Object.keys(m.reactions).length) {
      reactHtml = '<div class="conv-reactions ' + (isMe?'me':'them') + '">' +
        // ⚠️ La CLÉ de `m.reactions` vient de la ligne `conv_messages` de l'autre
        // compte : rien n'oblige un client à y mettre un emoji. Échappée à
        // l'affichage, comme tout payload librement insérable (règle CLAUDE.md).
        Object.keys(m.reactions).map(function(e){ return '<span class="conv-react-badge">' + escapeHtml(e) + (m.reactions[e]>1?(' '+escapeHtml(String(m.reactions[e]))):'') + '</span>'; }).join('') +
        '</div>';
    }

    parts.push(
      '<div class="conv-bubble-wrap ' + (isMe?'me':'them') + '" data-mid="' + escapeHtml((m.id||'')) + '" data-me="' + (isMe?'1':'0') + '">' +
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
  // ⚠️ APRÈS le innerHTML, jamais avant : les nœuds `data-pj` viennent d'être créés.
  if (typeof signerPiecesJointes === "function") signerPiecesJointes(thread);
  if (!c._loadingOlder) thread.scrollTop = thread.scrollHeight; // pas de saut en bas pendant le chargement d'historique
  _wireMsgActions(thread, c.id);
  _wireConvScroll(thread, c.id);
}

// Ré-épingle le bas du fil ouvert quand la GÉOMÉTRIE change (rotation, barre
// d'URL qui se replie, clavier fermé par un autre champ). Mesuré le 2026-09-02 :
// `scrollTop` est posé pour une hauteur de fil donnée ; quand `--app-vh` change,
// `.conv-fp-thread` (flex:1) change de hauteur et le dernier message peut sortir
// de l'écran sans qu'aucun événement de défilement ne survienne. On ne re-cale
// QUE si l'on était déjà en bas — sinon on arracherait la lecture de quelqu'un
// remonté dans l'historique.
function _convFpRepinBottom() {
  if (!window._openedConvId) return;
  var t = document.getElementById("convFpThread");
  if (!t || t._loadingOlder || t._loadingMore) return;
  if (t._auBas === false) return; // relecture en cours d'un historique : on ne touche à rien
  t.scrollTop = t.scrollHeight;
}

// Re-rendu du fil ouvert au RETOUR D'UNE LECTURE ASYNCHRONE (fusion serveur,
// accusés de lecture). Mesuré le 2026-10-18 : une lecture `conv_messages` qui
// revient 900 ms après l'ouverture ramenait en bas quelqu'un qui avait déjà
// remonté l'historique — `renderConvFpThread` remet toujours le bas. Sur un
// réseau mobile lent, c'est le cas ordinaire. On rend la position lue.
// La position se rend par un MESSAGE, pas par un nombre de pixels : la fusion
// change ce qui est AU-DESSUS du point de lecture (la tranche des derniers
// messages glisse, des plus anciens s'insèrent), et un `scrollTop` rendu tel
// quel montrait d'autres messages (contre-revue du 2026-10-19). On retient le
// premier message visible et son écart au haut du fil ; s'il n'est plus là,
// on revient aux pixels.
function _rerendreFilSansArracher(c, displayName) {
  var t = document.getElementById("convFpThread");
  var relecture = !!t && t._auBas === false;
  var haut = t ? t.scrollTop : 0;
  var ancre = null, ecart = 0;
  if (relecture) {
    var hautFil = t.getBoundingClientRect().top;
    var avant = t.querySelectorAll(".conv-bubble-wrap[data-mid]");
    for (var i = 0; i < avant.length; i++) {
      var r = avant[i].getBoundingClientRect();
      if (r.bottom > hautFil) { ancre = avant[i].getAttribute("data-mid"); ecart = r.top - hautFil; break; }
    }
  }
  renderConvFpThread(c, displayName);
  if (!t) return;
  if (!relecture) { t.scrollTop = t.scrollHeight; return; }
  t.scrollTop = haut;
  if (!ancre) return;
  var apres = t.querySelectorAll(".conv-bubble-wrap[data-mid]");
  for (var j = 0; j < apres.length; j++) {
    if (apres[j].getAttribute("data-mid") !== ancre) continue;
    t.scrollTop += (apres[j].getBoundingClientRect().top - t.getBoundingClientRect().top) - ecart;
    return;
  }
}

(function _wireConvFpGeometry() {
  if (typeof window === "undefined" || window._convFpGeomWired) return;
  window._convFpGeomWired = true;
  // Deux temps : tout de suite, puis après stabilisation des barres du navigateur
  // (même raison que les re-mesures différées de `--app-vh` dans app-09).
  var relancer = function() { _convFpRepinBottom(); setTimeout(_convFpRepinBottom, 250); };
  window.addEventListener("resize", relancer);
  window.addEventListener("orientationchange", function() { setTimeout(relancer, 220); });
  if (window.visualViewport) window.visualViewport.addEventListener("resize", relancer);
})();

// LOT-4 (audit UX/UI du 2026-11-10, MSG-C55) — retour aux derniers messages.
// Remonté de plus d'un écran, ou un message arrivé pendant la relecture : un
// bouton rond « ↓ » (44 px) au-dessus de la saisie ramène au dernier message, et
// dit combien sont arrivés (« 2 nouveaux messages ↓ »). On ne ramène JAMAIS en
// bas sans geste quelqu'un qui relit l'historique.
function _convMajBoutonBas(thread) {
  var fp = document.getElementById("conv-fullpage");
  if (!thread || !fp) return;
  var b = document.getElementById("convFpBas");
  var n = thread._nouveaux || 0;
  var loin = thread.scrollHeight - thread.scrollTop - thread.clientHeight > thread.clientHeight;
  var montrer = fp.classList.contains("active") && thread._auBas === false && (n > 0 || loin);
  if (!montrer) { if (b) b.hidden = true; return; }
  if (!b) {
    b = document.createElement("button");
    b.id = "convFpBas";
    b.type = "button";
    b.className = "conv-fp-bas";
    b.addEventListener("click", function () {
      var t = document.getElementById("convFpThread");
      if (!t) return;
      t.scrollTop = t.scrollHeight;
      t._auBas = true; t._nouveaux = 0;
      b.hidden = true;
    });
    fp.appendChild(b);
  }
  var r = thread.getBoundingClientRect();
  b.style.top = Math.max(0, Math.round(r.bottom - 56)) + "px";
  b.textContent = n > 0 ? (n === 1 ? "1 nouveau message ↓" : n + " nouveaux messages ↓") : "↓";
  b.setAttribute("aria-label", n > 0 ? b.textContent.replace(" ↓", "") + " — revenir en bas" : "Revenir aux derniers messages");
  b.classList.toggle("conv-fp-bas-compte", n > 0);
  b.hidden = false;
}

// Un message ENTRANT dans la conversation ouverte : rendu sans arracher la
// relecture, et compté s'il arrive hors de vue.
function _convMessageEntrant(c, displayName) {
  var t = document.getElementById("convFpThread");
  var relecture = !!t && t._auBas === false;
  _rerendreFilSansArracher(c, displayName);
  if (!t) return;
  if (relecture) t._nouveaux = (t._nouveaux || 0) + 1;
  _convMajBoutonBas(t);
}

// Scroll infini : charge une page de messages plus anciens quand on approche du
// haut du fil, en préservant la position visuelle.
// LOT-8 (audit UX/UI du 2026-11-10, SOC-C02) — LE PANNEAU FERMÉ EST INERTE.
// Hors champ (x = 390), le panneau de conversation restait atteignable au clavier
// et exposé aux lecteurs d'écran : huit commandes invisibles (Retour, Pièce
// jointe, Emoji, champ, Envoyer…). `inert` + `aria-hidden` suivent la classe
// `active`, quel que soit le chemin qui l'ouvre ou la ferme (trois fermetures
// distinctes) : l'observateur ne dépend d'aucun d'eux. L'ouverture injecte le
// contenu AVANT `.active` (règle « contenu avant révélation ») ; l'inertie tombe
// au même instant.
(function _brancherInertieConv() {
  function synchroniser(fp) {
    var ouvert = fp.classList.contains("active");
    if (ouvert) { fp.removeAttribute("inert"); fp.removeAttribute("aria-hidden"); }
    else { fp.setAttribute("inert", ""); fp.setAttribute("aria-hidden", "true"); }
  }
  function brancher() {
    var fp = document.getElementById("conv-fullpage");
    if (!fp || fp._inertieBranchee) return;
    fp._inertieBranchee = true;
    synchroniser(fp);
    try { new MutationObserver(function () { synchroniser(fp); }).observe(fp, { attributes: true, attributeFilter: ["class"] }); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", brancher); else brancher();
})();

function _wireConvScroll(thread, convId) {
  if (!thread) return;
  thread._curConvId = convId;
  if (thread._scrollWired) return;
  thread._scrollWired = true;
  // LOT-4 (MSG-C52) : une photo, une vidéo ou un GIF qui finit de charger fait
  // grandir le fil SOUS le point de lecture ; collé au bas, on y reste. Les
  // événements `load` ne remontent pas : on les capte à la descente.
  var recaler = function (e) {
    var el = e && e.target;
    if (!el || (el.tagName !== "IMG" && el.tagName !== "VIDEO")) return;
    if (thread._auBas === false || thread._loadingMore) return;
    thread.scrollTop = thread.scrollHeight;
  };
  thread.addEventListener("load", recaler, true);
  thread.addEventListener("loadedmetadata", recaler, true);
  thread.addEventListener("scroll", function() {
    // Mémorise si l'on est collé au bas : c'est la seule information que la
    // géométrie d'APRÈS un redimensionnement ne permet plus de retrouver.
    thread._auBas = (thread.scrollTop + thread.clientHeight >= thread.scrollHeight - 80);
    if (thread._auBas) thread._nouveaux = 0;
    _convMajBoutonBas(thread);
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
  var el = document.querySelector('.conv-bubble-wrap[data-mid="' + (window.CSS && CSS.escape ? CSS.escape(mid) : mid) + '"]');
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
// Libellés que les enveloppes réseau posent dans `content.text` (app-09, et le
// transfert plus bas). La clé est le texte tel qu'il arrive, la valeur ce qu'on
// affiche. Tout ce qui n'y figure pas est rendu tel quel.
var _LIBELLES_ENVELOPPE = {
  "🎞 GIF": "GIF",
  "📷 Photo": "Photo",
  "🎬 Vidéo": "Vidéo",
  "🎙 Message vocal": "Message vocal",
  "📍 Position": "Position",
  "🗑 Message supprimé": "Message supprimé",
};
function _sansEmojiEnveloppe(t) {
  if (!t) return t;
  if (_LIBELLES_ENVELOPPE[t]) return _LIBELLES_ENVELOPPE[t];
  if (t.indexOf("📄 ") === 0) return "Document · " + t.slice(2);
  if (t.indexOf("📎 ") === 0) return t.slice(2);
  return t;
}

// Un message est visible sauf s'il vient d'un compte que J'AI bloqué (le mien
// et les messages système restent). Un seul prédicat : fil, aperçu, mentions.
function _msgVisiblePourMoi(m) {
  if (!m || m.from === "me" || !m.from) return true;
  return !(typeof isBlocked === "function" && isBlocked(m.from));
}
// LOT-20 (audit UX/UI du 2026-11-10, MSG-C12 / C66) : le libellé d'un message
// se décide par son TYPE, avant de regarder son texte. Le texte d'une pièce
// jointe est une étiquette TECHNIQUE (« [DOC] topo.pdf », « [AUDIO] … »,
// « [MEDIA] atelier.jpg », app-09) et une position est une adresse Google
// Maps : la liste, la barre de réponse et la citation les affichaient tels
// quels. Une seule autorité pour les trois.
var _ETIQUETTE_PJ_RE = /^\[(MEDIA|IMAGE|PHOTO|VIDEO|AUDIO|DOC|FILE|FICHIER)\]\s*(.*)$/i;
function _msgEstTexte(m) {
  if (!m || !m.text || /^\{/.test(m.text)) return false;
  if (m.gif || m.img || m.video || m.voiceData || m.fileUrl || m.docData || m.location) return false;
  return !_ETIQUETTE_PJ_RE.test(m.text) && !/^📍 Ma position : https?:\/\//.test(m.text);
}
function _msgPreviewText(m) {
  if (!m) return "";
  if (m.gif) return "GIF"; if (m.img) return "Photo"; if (m.video) return "Vidéo";
  if (m.voiceData) return "Message vocal" + (m.voiceDuration ? " · " + m.voiceDuration : "");
  if (m.fileUrl || m.docData) return (/^audio\//.test(String(m.fileType || "")) ? "Fichier audio · " : "Document · ") + (m.fileName || "Fichier");
  if (m.location) return "Position";
  var t = String(m.text || "");
  if (/^📍 Ma position : https?:\/\//.test(t)) return "Position";
  var e = t.match(_ETIQUETTE_PJ_RE);
  if (e) {
    var k = e[1].toUpperCase(), nom = e[2] || "";
    if (k === "AUDIO") return /^message vocal/i.test(nom) ? nom : "Fichier audio · " + nom;
    if (k === "VIDEO") return "Vidéo";
    if (k === "MEDIA" || k === "IMAGE" || k === "PHOTO") return /\.(mp4|mov|webm|m4v)$/i.test(nom) ? "Vidéo" : "Photo";
    return "Document · " + (nom || "Fichier");
  }
  if (t && !/^\{/.test(t)) return _sansEmojiEnveloppe(t);
  return t || "Message";
}

function _openMsgActions(convId, msgId) {
  var r = _msgById(convId, msgId); if (!r || !r.m) return;
  var m = r.m, isMe = (m.from === "me");
  var reacts = ["❤️","😂","👍","😮","😢","🔥"];
  var reactRow = '<div style="display:flex;justify-content:space-around;padding:6px 4px 12px;">' +
    reacts.map(function(e){ return '<span onclick="_reactAndClose(\'' + escapeJsArg(convId) + '\',\'' + escapeJsArg(msgId) + '\',\'' + escapeJsArg(e) + '\')" style="font-size:26px;cursor:pointer;">' + e + '</span>'; }).join('') + '</div>';
  function item(icon, label, fn, danger) {
    return '<div class="csetting-item" onclick="' + fn + '"><div class="csetting-icon">' + icon + '</div>' +
      '<div class="csetting-label"' + (danger?' style="color:#ef4444;"':'') + '>' + label + '</div></div>';
  }
  // MSG-C66 : « Copier le texte » seulement pour un message de TEXTE.
  var canCopy = _msgEstTexte(m);
  // ⚠️ LES IDENTIFIANTS SONT ÉCRITS PAR D'AUTRES COMPTES (audit 2026-11-03) :
  // `conv_messages.id` et `conversations.id` sont posés par l'EXPÉDITEUR, sans
  // forme imposée par le serveur. Concaténés tels quels dans un onclick, un
  // identifiant forgé (`x'),alert(1),('`) s'exécutait chez quiconque appuyait
  // longuement sur le message — XSS stockée, même famille que B-01. Le rendu
  // des bulles les échappait (`data-mid`, escapeHtml) ; ce menu, non.
  var cj = escapeJsArg(convId), mj = escapeJsArg(msgId);
  openModal(
    '<div class="modal-handle"></div>' + reactRow +
    item('↩️', 'Répondre', "_setReplyTo('" + cj + "','" + mj + "')") +
    (canCopy ? item('📋', 'Copier le texte', "_copyMsg('" + cj + "','" + mj + "')") : '') +
    item('↪️', 'Transférer', "_forwardPick('" + cj + "','" + mj + "')") +
    // Signaler CE message (E-08, DSA : un contenu se signale, pas seulement son
    // auteur) — jamais pour les miens ni pour les messages système.
    (!isMe && m.from ? item('🚩', 'Signaler ce message', "reportMessage('" + cj + "','" + mj + "')") : '') +
    // LOT-4 (MSG-C58) : une seule entrée, séparée des autres ; la portée se choisit
    // dans la confirmation (« pour moi » / « pour tout le monde »).
    '<div style="height:1px;background:var(--border);margin:6px 0;"></div>' +
    item('🗑️', 'Supprimer…', "_demanderSuppressionMsg('" + cj + "','" + mj + "')", true)
  );
}

// Signaler un MESSAGE (E-08). Même contrat que les autres portes de signalement :
// authentification, motif obligatoire, verdict lu, accusé de réception. La cible
// est l'identifiant serveur du message (`reports.target_type = 'message'`, déjà
// admis par la contrainte de la table et par `scripts/moderation.js`, qui sait le
// retirer) ; le motif ne porte jamais le contenu du message, la modération le
// relit en base.
async function reportMessage(convId, msgId) {
  var r = _msgById(convId, msgId); if (!r || !r.m) return;
  if (r.m.from === "me" || !r.m.from) return;
  try {
    if (typeof requireAuthentication === "function" && !requireAuthentication("signaler")) return;
  } catch (e) {}
  var motif = await _demanderMotifSignalement("ce message");
  if (motif === null) return;   // annulé
  var ok = false;
  try { if (typeof supaReport === "function") ok = await supaReport("message", msgId, motif); } catch (e) { ok = false; }
  closeModal();
  toast(ok
    ? "🚩 Message signalé. Notre équipe va vérifier."
    : "Signalement déjà envoyé, ou impossible pour le moment.", ok ? "success" : "warning");
  if (ok) _accuserReceptionSignalement();
}

function _reactAndClose(convId, msgId, emoji) { closeModal(); _toggleReaction(convId, msgId, emoji); }

function _copyMsg(convId, msgId) {
  var r = _msgById(convId, msgId); if (!r || !r.m) return;
  var t = r.m.text || "";
  closeModal();
  // Le succès s'annonce APRÈS la réponse du presse-papiers (même défaut que FIL-C09).
  try {
    Promise.resolve(navigator.clipboard.writeText(t))
      .then(function () { toast("Copié"); }, function () { toast("Copie impossible"); });
  } catch(e) { toast("Copie impossible"); }
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
    '<div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:800;color:var(--accent);">Réponse à ' + escapeHtml(rt.n) + '</div>' +
    '<div style="font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(rt.t) + '</div></div>' +
    '<span onclick="_cancelReply()" style="font-size:18px;cursor:pointer;color:var(--muted);padding:0 4px;">✕</span></div>';
}

// LOT-4 (audit UX/UI du 2026-11-10) — FEUILLE DE CONFIRMATION de la messagerie.
// Au-dessus de tout (conversation pleine page ET fenêtre modale : `openModal`
// remplace la modale courante, cette feuille non). Texte posé par `textContent`
// (le nom d'un autre compte y passe). Fond, « Annuler » et Échap ferment sans agir.
//   o = { titre, texte, actions: [{ libelle, danger, agir }], annuler,
//         champ: { valeur, placeholder, multiligne, max } (LOT-6), surAnnuler }
// Avec `champ`, `agir` reçoit le texte saisi. `surAnnuler` est appelé quand la
// feuille se ferme SANS action (Annuler, fond, Échap).
function ouvrirFeuilleConfirmation(o) {
  o = o || {};
  // Une feuille encore ouverte se ferme par SON `fermer` : sa promesse se résout
  // (« non ») et son écouteur Échap part — un `remove()` nu les laissait en suspens.
  if (typeof window._fermerFeuilleConf === "function") { try { window._fermerFeuilleConf(); } catch (e) {} }
  var ancien = document.getElementById("feuilleConfirmation");
  if (ancien) ancien.remove();
  var ov = document.createElement("div");
  ov.id = "feuilleConfirmation";
  ov.className = "feuille-conf-ov";
  var f = document.createElement("div");
  f.className = "feuille-conf";
  f.setAttribute("role", "dialog");
  f.setAttribute("aria-modal", "true");
  f.setAttribute("aria-labelledby", "feuilleConfirmationTitre");
  var h = document.createElement("h2");
  h.id = "feuilleConfirmationTitre";
  h.className = "feuille-conf-titre";
  h.textContent = o.titre || "Confirmer ?";
  f.appendChild(h);
  (Array.isArray(o.texte) ? o.texte : (o.texte ? [o.texte] : [])).forEach(function (t) {
    var p = document.createElement("p");
    p.className = "feuille-conf-texte";
    p.textContent = t;
    f.appendChild(p);
  });
  var champ = null;
  if (o.champ) {
    champ = document.createElement(o.champ.multiligne ? "textarea" : "input");
    champ.className = "feuille-conf-champ";
    champ.id = "feuilleConfirmationChamp";
    if (!o.champ.multiligne) champ.type = "text";
    else champ.rows = 3;
    champ.value = o.champ.valeur || "";
    if (o.champ.placeholder) champ.placeholder = o.champ.placeholder;
    if (o.champ.max) champ.maxLength = o.champ.max;
    if (o.champ.lectureSeule) {
      champ.readOnly = true;
      champ.addEventListener("focus", function () { try { champ.select(); } catch (e) {} });
    }
    champ.setAttribute("aria-labelledby", "feuilleConfirmationTitre");
    f.appendChild(champ);
  }
  var agi = false;
  var fermer = function () {
    document.removeEventListener("keydown", surTouche, true);
    if (ov.parentNode) ov.parentNode.removeChild(ov);
    if (window._fermerFeuilleConf === fermer) window._fermerFeuilleConf = null;
    if (!agi && typeof o.surAnnuler === "function") { try { o.surAnnuler(); } catch (e) {} }
  };
  window._fermerFeuilleConf = fermer;
  var surTouche = function (e) { if (e.key === "Escape") { e.stopPropagation(); fermer(); } };
  (o.actions || []).forEach(function (a) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "feuille-conf-btn" + (a.danger ? " feuille-conf-danger" : " feuille-conf-primaire");
    b.textContent = a.libelle;
    if (a.id) b.setAttribute("data-conf", a.id);
    b.addEventListener("click", function () {
      agi = true;
      var saisi = champ ? champ.value : undefined;
      fermer();
      try { a.agir && a.agir(saisi); } catch (e) { try { diagLog("feuille_conf : " + (e && e.message)); } catch (_e) {} }
    });
    f.appendChild(b);
  });
  if (champ && !o.champ.multiligne) {
    champ.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var premier = f.querySelector(".feuille-conf-btn[data-conf]:not([data-conf='annuler'])");
      if (premier) { e.preventDefault(); premier.click(); }
    });
  }
  var annuler = document.createElement("button");
  annuler.type = "button";
  annuler.className = "feuille-conf-btn feuille-conf-annuler";
  annuler.setAttribute("data-conf", "annuler");
  annuler.textContent = o.annuler || "Annuler";
  annuler.addEventListener("click", fermer);
  f.appendChild(annuler);
  ov.appendChild(f);
  ov.addEventListener("click", function (e) { if (e.target === ov) fermer(); });
  document.addEventListener("keydown", surTouche, true);
  document.body.appendChild(ov);
  // Un geste DESTRUCTEUR ne se confirme pas d'un Entrée réflexe : le focus va sur « Annuler ».
  var destructeur = (o.actions || []).some(function (a) { return a && a.danger; });
  try { (champ || (destructeur ? annuler : f.querySelector(".feuille-conf-btn")) || annuler).focus(); } catch (e) {}
  return fermer;
}

// LOT-6 (audit UX/UI du 2026-11-10, TRA-C11) — LES BOÎTES NATIVES REMPLACÉES.
// Huit `confirm()` et quatre `prompt()` : une boîte système qui ne ressemble pas
// à PASSIO (titre = adresse du site sous Android), qui ne dit pas les
// conséquences et qu'un test ne capture pas. Deux promesses sur la feuille :
//   confirmerAction({ titre, texte, libelle, danger }) → true | false
//   demanderTexte({ titre, texte, valeur, placeholder, libelle, multiligne, max }) → texte | null
// LOT-10 (audit UX/UI du 2026-11-10, PAR-C04) — UN LIEN QU'ON N'A PAS PU COPIER.
// Le presse-papiers refusé, le lien n'apparaissait que 3 s dans un toast non
// sélectionnable — ou pas du tout pour une bobine. Il est posé dans un champ en
// lecture seule, sélectionné, avec « Copier » (nouvel essai, puis sélection
// manuelle si le navigateur refuse encore).
function montrerLienACopier(url, titre) {
  ouvrirFeuilleConfirmation({
    titre: titre || "Copie ce lien",
    texte: "Ton navigateur n'a pas autorisé la copie automatique. Le lien est sélectionné : copie-le, ou appuie sur « Copier ».",
    champ: { valeur: String(url || ""), lectureSeule: true },
    annuler: "Fermer",
    actions: [{ id: "copier", libelle: "Copier", danger: false, agir: function () {
      var ok = function () { toast("Lien copié"); };
      var echec = function () { montrerLienACopier(url, "Sélectionne le lien pour le copier"); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(String(url)).then(ok, echec);
        else echec();
      } catch (e) { echec(); }
    } }],
  });
  try { var c = document.getElementById("feuilleConfirmationChamp"); if (c) c.select(); } catch (e) {}
}

function confirmerAction(o) {
  o = o || {};
  return new Promise(function (resoudre) {
    ouvrirFeuilleConfirmation({
      titre: o.titre, texte: o.texte, annuler: o.annuler,
      actions: [{ id: "ok", libelle: o.libelle || "Confirmer", danger: o.danger !== false, agir: function () { resoudre(true); } }],
      surAnnuler: function () { resoudre(false); },
    });
  });
}
function demanderTexte(o) {
  o = o || {};
  return new Promise(function (resoudre) {
    ouvrirFeuilleConfirmation({
      titre: o.titre, texte: o.texte, annuler: o.annuler,
      champ: { valeur: o.valeur || "", placeholder: o.placeholder || "", multiligne: !!o.multiligne, max: o.max || 0 },
      actions: [{ id: "ok", libelle: o.libelle || "Valider", danger: false, agir: function (v) { resoudre(v == null ? "" : String(v)); } }],
      surAnnuler: function () { resoudre(null); },
    });
  });
}

// Le nom à qui l'on parle, pour les phrases de confirmation.
function _convInterlocuteur(c) {
  if (!c) return "ton interlocuteur";
  if (c.isGroup) return "les autres membres";
  return c.userName || "ton interlocuteur";
}

// LOT-4 (MSG-C58) : UNE entrée « Supprimer… » dans le menu ; elle explique les deux
// portées et demande confirmation. Les exécutants ci-dessous restent tels quels.
function _demanderSuppressionMsg(convId, msgId) {
  closeModal();
  var r = _msgById(convId, msgId); if (!r || !r.m) return;
  var qui = _convInterlocuteur(r.c);
  var aMoi = r.m.from === "me";
  var actions = [];
  if (aMoi) actions.push({ id: "tous", libelle: "Supprimer pour tout le monde", danger: true, agir: function () { _deleteMsgForAll(convId, msgId).catch(function (e) { try { diagLog("supprimer pour tous : " + (e && e.message)); } catch (_) {} }); } });
  actions.push({ id: "moi", libelle: "Supprimer pour moi", danger: true, agir: function () { _deleteMsgForMe(convId, msgId); } });
  ouvrirFeuilleConfirmation({
    titre: "Supprimer ce message ?",
    texte: aMoi
      ? ["Pour moi : il disparaît de cet appareil, il reste visible chez " + qui + ".", "Pour tout le monde : il disparaît aussi chez " + qui + "."]
      : ["Il disparaît de cet appareil. Il reste visible chez " + qui + "."],
    actions: actions,
  });
}

// Supprimer pour moi : retrait local uniquement.
function _deleteMsgForMe(convId, msgId) {
  closeModal();
  var r = _msgById(convId, msgId); if (!r || !r.m) return;
  r.c.messages = (r.c.messages || []).filter(function(x){ return x.id !== msgId; });
  convTombAdd("msg", msgId);        // sinon la fusion au boot le ressuscite (ADR-008)
  saveConversations();
  var fp = document.getElementById("conv-fullpage");
  renderConvFpThread(r.c, fp ? fp.getAttribute("data-display-name") : "");
  try { renderMessages(); } catch(e) {}
  toast("Message supprimé");
}

// Supprimer pour tous (mes messages) : retrait local + suppression Supabase +
// tombstone diffusé au destinataire (géré par _handleIncomingConvMessage type:del).
// ⚠️ ANNONCÉ = FAIT (ETAT-04, audit du 2026-11-10). Le DELETE partait sans être lu,
// la bulle disparaissait et une pierre tombale empêchait même de s'en apercevoir :
// sur un refus ou une coupure, le message restait lisible chez le destinataire
// pendant que l'écran disait « supprimé pour tous ». Pour un COMPTE, la base
// tranche d'abord ; un refus laisse la bulle et le dit.
async function _deleteMsgForAll(convId, msgId) {
  closeModal();
  var r0 = _msgById(convId, msgId); if (!r0 || !r0.m || r0.m.from !== "me") return;
  // Un message EN FILE hors ligne (« envoi… » sans réseau) se retire de sa file
  // d'abord : sans quoi il partirait après sa suppression. En ligne, un envoi en
  // cours peut poser sa ligne APRÈS notre DELETE : on attend qu'il finisse.
  var dansLaFile = false;
  try { dansLaFile = typeof _outboxLoad === "function" && _outboxLoad().some(function (x) { return x.msgId === msgId; }); } catch (e) {}
  if (r0.m.status === "sending") {
    var horsLigneNav = typeof navigator !== "undefined" && navigator.onLine === false;
    if (!(dansLaFile && horsLigneNav)) { toast("Ce message est encore en cours d'envoi — réessaie dans un instant."); return; }
  }
  if (dansLaFile || r0.m.status === "failed") { try { if (typeof _outboxRemove === "function") _outboxRemove(msgId); } catch (e) {} }
  // « en échec » ne veut pas dire « absent de la base » (réponse perdue APRÈS
  // l'écriture) : on tente toujours le DELETE, et 0 ligne sous MA session vaut
  // succès — ligne déjà partie (autre appareil, purge de nuit) ou jamais posée.
  var envoyeAuServeur = true;
  if (typeof supa !== "undefined" && supa && window._supaReal && typeof _compteAuthReel === "function" && _compteAuthReel()) {
    var v;
    try {
      v = _writeVerdict(await supa.from("conv_messages").delete().eq("id", msgId).eq("from_id", MY_UID).select("id"),
        { label: "message supprimé pour tous" });
      if (v.ok && v.rows === 0) {
        var moi = (typeof _sessionEstMoi === "function") ? await _sessionEstMoi() : false;
        if (!moi) v = { ok: false, error: null };   // session morte : 0 ligne ne prouve rien
        else envoyeAuServeur = false;               // rien en base à retirer chez l'autre
      }
    } catch (e) { v = { ok: false, error: e }; }
    if (!v.ok) {
      var horsLigne = typeof estEchecReseau === "function" && estEchecReseau(v.error);
      toast(horsLigne ? "Hors connexion : message non supprimé. Réessaie une fois en ligne."
                      : "Le message n'a pas pu être supprimé pour tout le monde. Réessaie.", "error");
      return;
    }
  }
  var jamaisEnvoye = !envoyeAuServeur;
  var r = _msgById(convId, msgId); if (!r || !r.m) return;
  r.c.messages = (r.c.messages || []).filter(function(x){ return x.id !== msgId; });
  convTombAdd("msg", msgId);        // sinon la fusion au boot le ressuscite (ADR-008)
  saveConversations();
  var fp = document.getElementById("conv-fullpage");
  renderConvFpThread(r.c, fp ? fp.getAttribute("data-display-name") : "");
  try { renderMessages(); } catch(e) {}
  if (!jamaisEnvoye && typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    // (La ligne est déjà supprimée ci-dessus pour un compte, verdict lu.)
    // ⚠️ LA PIÈCE JOINTE PART AVEC LE MESSAGE (MSG-03, 2026-09-14). La ligne
    // était supprimée, l'objet Storage jamais : photo, vidéo, vocal, fichier
    // restaient lisibles par tout membre de la conversation (URL signée), pour
    // toujours. La policy DELETE du seau exige `owner = auth.uid()` — c'est
    // l'auteur qui supprime, donc l'uploader. Verdict lu et tracé : un refus
    // n'annule pas la suppression du message, mais il ne se tait pas.
    _purgerPieceJointeDe(r.m);
    // Tombstone : prévient l'autre client de retirer le message.
    try {
      var tomb = JSON.stringify({ type: "del", target: msgId, text: "🗑 Message supprimé" });
      supa.from("conv_messages").insert({ id: "del_" + uid(), conv_id: convId, from_id: MY_UID, content: tomb, created_at: new Date().toISOString() }).then(function(){}, function(){});
    } catch(e) {}
  }
  toast("Message supprimé pour tous");
}

// Copie un objet du seau `attachments` dans le dossier d'une autre conversation
// et rend l'URL PUBLIQUE de la copie (celle que l'app stocke et signe ensuite),
// ou null si la copie est refusée.
function _copierPieceJointeVers(cheminSrc, targetConvId) {
  try {
    var nom = String(cheminSrc).split("/").pop() || ("pj_" + Date.now());
    var cheminDst = "attachments/" + targetConvId + "/" + Date.now() + "_" + nom;
    return Promise.resolve(supa.storage.from("attachments").copy(cheminSrc, cheminDst)).then(function (res) {
      if (res && res.error) {
        try { if (typeof diagLog === "function") diagLog("pj_copie KO " + String(res.error.message)); } catch (e) {}
        return null;
      }
      var pub = supa.storage.from("attachments").getPublicUrl(cheminDst);
      var url = pub && pub.data && pub.data.publicUrl;
      return url ? ((typeof cdnUrl === "function") ? cdnUrl(url) : url) : null;
    }, function () { return null; });
  } catch (e) { return Promise.resolve(null); }
}

// Chemin d'objet (seau `attachments`) d'un message média, ou null.
function _pieceJointeDuMessage(m) {
  if (!m || typeof pieceJointeChemin !== "function") return null;
  // ⚠️ MON média tout juste envoyé n'a ici que sa copie LOCALE (data URL) jusqu'à la
  // relecture du fil : sans `m.pj.url` (posé au dépôt, app-09), « supprimer pour
  // tous » laissait son objet dans le seau, et le transfert ne savait pas le copier
  // (2026-11-07, MSG-03).
  return pieceJointeChemin(m.img || m.video || m.fileUrl || m.voiceData || null)
    || (m.pj && m.pj.url ? pieceJointeChemin(m.pj.url) : null);
}

// Une URL `data:` — un fichier ENTIER, encodé dans l'URL — avec ce que le
// navigateur ignore devant un schéma (blancs et caractères de contrôle).
function _estUrlDonnees(u) {
  return typeof u === "string" && /^[\s\u0000-\u001f]*data:/i.test(u);
}

// La data-URL d'un message média dont le fichier n'est encore QUE sur cet
// appareil, ou null. Même ordre que `_pieceJointeDuMessage` : c'est ce champ-là
// que `_forwardTo` remplace.
function _urlLocaleDuMessage(m) {
  // `docData` : la copie locale d'un DOCUMENT que je viens d'envoyer (app-09) —
  // en dernier, comme dans la branche de copie de `_forwardTo`.
  var u = m ? (m.img || m.video || m.fileUrl || m.voiceData || m.docData || null) : null;
  return _estUrlDonnees(u) ? u : null;
}

// Téléverse une pièce jointe encore LOCALE (data-URL en base64) dans le dossier
// d'une conversation et rend l'URL PUBLIQUE de l'objet (celle que l'app stocke
// et signe ensuite), ou null si l'envoi est refusé. Même seau, même forme de
// chemin et même cache que l'envoi d'une pièce jointe (app-09, `_processAttach`) :
// la policy d'insertion du seau exige d'être membre de la conversation du chemin.
function _televerserPieceJointeVers(dataUrl, targetConvId) {
  try {
    var s = String(dataUrl);
    var tete = /^[\s\u0000-\u001f]*data:([^;,]*)(?:;[^;,]*)*;base64,/i.exec(s);
    if (!tete) return Promise.resolve(null);   // pas du base64 : rien de sûr à téléverser
    var type = (tete[1] || "application/octet-stream").toLowerCase();
    var octets = atob(s.slice(tete[0].length));
    var ia = new Uint8Array(octets.length);
    for (var i = 0; i < octets.length; i++) ia[i] = octets.charCodeAt(i);
    var ext = (type.split("/")[1] || "").replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
    var chemin = "attachments/" + targetConvId + "/" + Date.now() + "_" + Math.random().toString(36).slice(2, 11) + "_transfert." + ext;
    // Une mise à jour attend ce dépôt (pwa-detect.js), comme tout dépôt de pièce
    // jointe ; la fin est rendue sur TOUTE issue.
    var fin = (typeof _envoiCommence === "function") ? _envoiCommence() : function () {};
    // Un refus remonte au pilotage, comme le dépôt d'une pièce jointe (app-09) :
    // code fermé, jamais le libellé du serveur (il peut porter le nom du fichier).
    var refus = function (err) {
      try { if (typeof diagLog === "function") diagLog("pj_televersement KO " + String((err && err.message) || err).slice(0, 80)); } catch (e) {}
      try {
        if (typeof _pjSignaler === "function" && typeof _pjCodeEchec === "function") {
          var reseau = (typeof estEchecReseau === "function") && estEchecReseau(err);
          _pjSignaler({ rc: _pjCodeEchec(err, reseau), http: Number(err && err.status) || Number(err && err.statusCode) || 0, kind: "transfert", voie: "transfert", essai: 1, ko: Math.round(ia.length / 1024) });
        }
      } catch (e) {}
      return null;
    };
    return Promise.resolve(supa.storage.from("attachments").upload(chemin, new Blob([ia], { type: type }), {
      cacheControl: "31536000", // pièce jointe immuable, comme à l'envoi
      upsert: false,
      contentType: type,
    })).then(function (res) {
      if (res && res.error) return refus(res.error);
      var pub = supa.storage.from("attachments").getPublicUrl(chemin);
      var url = pub && pub.data && pub.data.publicUrl;
      return url ? ((typeof cdnUrl === "function") ? cdnUrl(url) : url) : null;
    }, refus).then(function (u) { fin(); return u; }, function () { fin(); return null; });
  } catch (e) {
    // `fin` est hissé (`var`) : posé si la levée vient de l'envoi lui-même.
    try { if (typeof fin === "function") fin(); } catch (_) {}
    try { if (typeof diagLog === "function") diagLog("pj_televersement KO " + String((e && e.message) || e).slice(0, 80)); } catch (_) {}
    return Promise.resolve(null);
  }
}
function _purgerPieceJointeDe(m) {
  var chemin = _pieceJointeDuMessage(m);
  if (!chemin || typeof supa === "undefined" || !supa || !window._supaReal) return Promise.resolve(false);
  try {
    return Promise.resolve(supa.storage.from("attachments").remove([chemin])).then(function (res) {
      var ok = !(res && res.error);
      try { if (typeof diagLog === "function") diagLog("pj_purge " + (ok ? "ok" : "KO " + String(res.error && res.error.message))); } catch (e) {}
      return ok;
    }, function () { return false; });
  } catch (e) { return Promise.resolve(false); }
}

// Transférer : choisir une conversation cible.
function _forwardPick(convId, msgId) {
  closeModal();
  window._forwardSrc = { convId: convId, msgId: msgId };
  var convs = getConversations().filter(function(c){ return !c.archived; }).sort(function(a,b){ return (b.lastAt||0)-(a.lastAt||0); }).slice(0, 30);
  var rows = convs.map(function(c){
    var name = c.isGroup ? (c.groupName || "Groupe") : (c.userName || "Conversation");
    return '<div class="csetting-item" onclick="_forwardTo(\'' + escapeJsArg(c.id) + '\')"><div class="csetting-icon">' + (c.isGroup?'👥':'💬') + '</div>' +
      '<div class="csetting-label">' + escapeHtml(name) + '</div></div>';
  }).join("");
  openModal('<div class="modal-handle"></div><div class="modal-title">Transférer vers…</div>' +
    '<div style="max-height:340px;overflow-y:auto;margin-top:8px;">' + (rows || '<div style="padding:20px;text-align:center;color:var(--muted);">Aucune conversation</div>') + '</div>');
}

// Le conteneur RÉEL d'un enregistrement audio (vocal ou fichier joint). La copie
// locale le porte (`data:audio/mp4;…` sur iPhone, `data:audio/webm;codecs=opus;…`
// sur Android) ; un vocal REÇU ne garde que son URL, et c'est l'extension de son
// objet qui le dit : `_sendVoiceMessage` (app-09) nomme tout vocal `voice.<ext>`
// d'après son conteneur (m4a, ogg, webm), une copie garde ce nom, et un vocal
// transféré depuis sa copie locale est déposé en `transfert.<sous-type>` (mp4,
// webm, ogg — `_televerserPieceJointeVers`). Jamais « audio/webm » d'office pour
// un enregistrement iPhone — c'est l'étiquette mensongère qui rendait ses
// vocaux injouables.
function _conteneurAudioDuMessage(m) {
  var v = (m && typeof m.voiceData === "string") ? m.voiceData : "";
  var duData = /^data:(audio\/[a-z0-9.+-]+)/i.exec(v);
  if (duData) return duData[1].toLowerCase();
  var chemin = ((typeof pieceJointeChemin === "function") && pieceJointeChemin(v)) || v.split(/[?#]/)[0];
  var ext = ((/\.([a-z0-9]{2,4})$/i.exec(chemin) || [])[1] || "").toLowerCase();
  if (ext === "m4a" || ext === "mp4") return "audio/mp4";
  if (ext === "ogg" || ext === "oga" || ext === "opus") return "audio/ogg";
  return "audio/webm";
}

async function _forwardTo(targetConvId) {
  closeModal();
  // ⚠️ L'AUTEUR EST CAPTURÉ ICI, AVANT TOUT `await` (ASTRA-21, revue audit-passio du
  // 2026-11-07) : la copie, et désormais le dépôt d'une copie locale, peuvent durer
  // des minutes pour une vidéo ; un compte remplacé entre-temps ne doit jamais
  // insérer le média de l'autre sous son nom.
  var _ctxTransfert = { generation: _outboxGenerationActuelle(), auteur: (typeof MY_UID !== "undefined" ? MY_UID : null) };
  var src = window._forwardSrc; if (!src) return;
  var r = _msgById(src.convId, src.msgId); if (!r || !r.m) return;
  var m = r.m;
  var convs = getConversations();
  var target = convs.find(function(x){ return x.id === targetConvId; }); if (!target) return;
  // Lu AVANT que la copie ne remplace l'URL : seule la copie locale porte le
  // conteneur dans son mime.
  var _conteneurAudio = m.voiceData ? _conteneurAudioDuMessage(m) : null;
  // ⚠️ UNE PIÈCE JOINTE TRANSFÉRÉE CHANGE DE DOSSIER (ASTRA-01, 2026-09-14).
  // Le transfert réutilisait l'URL d'origine, `attachments/<conv source>/…` ;
  // or le seau est privé et la lecture exige d'être membre de la conversation
  // DU CHEMIN : le destinataire du transfert, qui n'est pas membre de la
  // conversation source, ne pouvait ni signer ni lire. L'objet est COPIÉ dans
  // le dossier de la cible (le transféreur est membre des deux : SELECT sur
  // la source, INSERT sur la cible). Copie refusée = transfert refusé, dit —
  // jamais un message livré avec un média que personne ne peut ouvrir.
  var cheminSrc = _pieceJointeDuMessage(m);
  if (cheminSrc && typeof supa !== "undefined" && supa && window._supaReal) {
    var nouvelleUrl = await _copierPieceJointeVers(cheminSrc, targetConvId);
    if (!nouvelleUrl) { toast("⚠️ Transfert impossible : la pièce jointe n'a pas pu être copiée"); return; }
    m = Object.assign({}, m);
    if (m.img) m.img = nouvelleUrl; else if (m.video) m.video = nouvelleUrl;
    else if (m.fileUrl) m.fileUrl = nouvelleUrl; else if (m.voiceData) m.voiceData = nouvelleUrl;
    // Mon document tout juste envoyé n'a qu'une copie locale (`docData`) : il part
    // comme document, avec l'URL de la copie — il partait en message VIDE.
    else if (m.docData) { m.fileUrl = nouvelleUrl; delete m.docData; }
  }
  // ⚠️ UN MÉDIA ENCORE LOCAL NE PART JAMAIS EN BASE64 (2026-11-07). La copie de
  // l'AUTEUR d'une photo, d'une vidéo ou d'un vocal qu'il vient d'envoyer garde
  // sa data-URL (app-09, `_processAttach`, `_sendVoiceMessage`) : transférée
  // telle quelle, elle s'écrivait ENTIÈRE dans `conv_messages.content` — un
  // fichier de plusieurs Mo dans une ligne, diffusé en direct à chaque membre.
  // L'invariant « jamais de base64 en base », que seul le client tenait, rompu
  // par le client lui-même. Le fichier est TÉLÉVERSÉ dans le dossier de la cible,
  // comme à l'envoi ; refusé = transfert refusé, dit. La base refuse désormais
  // une telle enveloppe (CONTENU_MESSAGE_BORNE, plus bas).
  else {
    var urlLocale = _urlLocaleDuMessage(m);
    if (urlLocale) {
      var televersee = (typeof supa !== "undefined" && supa && window._supaReal) ? await _televerserPieceJointeVers(urlLocale, targetConvId) : null;
      if (!televersee) { toast("⚠️ Transfert impossible : la pièce jointe n'a pas pu être envoyée"); return; }
      m = Object.assign({}, m);
      if (m.img) m.img = televersee; else if (m.video) m.video = televersee;
      else if (m.fileUrl) m.fileUrl = televersee; else if (m.voiceData) m.voiceData = televersee;
      // Mon document tout juste envoyé n'a qu'une copie locale (`docData`) : il part
      // comme document — il partait en message VIDE.
      else if (m.docData) { m.fileUrl = televersee; delete m.docData; }
    }
  }
  // Reconstruit un envelope de contenu selon le type, puis insère localement + Supabase.
  var content = null, localMsg = { id: "msg_" + uid(), from: "me", at: Date.now() };
  if (m.img || m.video) { content = { type: "media", url: m.img || m.video, fileType: m.video ? "video/mp4" : "image/jpeg", filename: "média", text: m.video ? "🎬 Vidéo" : "📷 Photo" }; if (m.video) localMsg.video = m.video; else localMsg.img = m.img; }
  else if (m.gif) { content = { type: "gif", url: m.gif, text: "🎞 GIF" }; localMsg.gif = m.gif; }
  else if (m.fileUrl) { content = { type: "doc", url: m.fileUrl, filename: m.fileName || "Fichier", text: "📄 " + (m.fileName||"Fichier") }; localMsg.fileUrl = m.fileUrl; localMsg.fileName = m.fileName; localMsg.fileType = m.fileType; }
  else if (m.location) { content = { type: "location", lat: m.location.lat, lng: m.location.lng, url: m.location.url, text: "📍 Position" }; localMsg.location = m.location; }
  else if (m.voiceData && m.isFile) {
    // Un FICHIER audio joint (`_processAttach`, kind « audio ») n'est pas un vocal :
    // il part en fichier téléchargeable, comme le transfert d'un fichier audio reçu
    // — jamais avalé par le lecteur de vocaux du destinataire.
    content = { type: "doc", url: m.voiceData, filename: m.fileName || "Audio", text: "📄 " + (m.fileName || "Audio") };
    localMsg.fileUrl = m.voiceData; localMsg.fileName = m.fileName || "Audio"; localMsg.fileType = "audio";
  }
  else if (m.voiceData) {
    // ⚠️ UN VOCAL PART EN VOCAL (2026-11-07). Aucune branche ne lisait `voiceData` :
    // il tombait dans la branche texte — message VIDE pour mon vocal, « [AUDIO]
    // Message vocal (7s) » pour un vocal reçu, dont l'objet venait d'être copié pour
    // rien. Le destinataire reconnaît un vocal à son NOM « Message vocal (Ns) »
    // (`applyMsgContentData`), quel que soit le conteneur ; `fileType` dit le
    // conteneur réel, lu plus haut. La bulle locale porte l'URL de la COPIE : c'est
    // elle que « supprimer pour tous » purgera (`_purgerPieceJointeDe`).
    var _duree = Math.max(0, Math.round(Number(m.voiceDuration) || 0));
    content = { type: "audio", url: m.voiceData, fileType: _conteneurAudio, filename: "Message vocal (" + _duree + "s)", text: "🎙 Message vocal" };
    localMsg.voiceData = m.voiceData; localMsg.voiceDuration = _duree;
  }
  else { localMsg.text = m.text || ""; }
  // ⚠️ RIEN À TRANSFÉRER N'EST PAS UN MESSAGE VIDE (2026-11-07). Tout ce que les
  // branches ci-dessus ne savent pas lire tombait dans la branche texte et partait
  // VIDE — c'était le vocal. Refusé et dit, jamais inséré. Aucune copie ni aucun
  // dépôt ne peut précéder ce refus : ils ne visent que des médias lus plus haut.
  if (!content && !String(localMsg.text || "").trim()) { toast("⚠️ Ce message ne peut pas être transféré"); return; }
  // Les deux bornes du serveur, AVANT toute trace locale : une enveloppe dont
  // l'`url` est une data-URL (un GIF ou une position d'une ancienne version) et
  // un texte plus long que ce que ce client envoie lui-même (MSG_TEXTE_MAX).
  // Sinon le transfert resterait affiché ici, et la base le refuserait (23514).
  if (content && _estUrlDonnees(content.url)) { toast("⚠️ Transfert impossible : la pièce jointe n'a pas pu être envoyée"); return; }
  if (!content && localMsg.text.length > MSG_TEXTE_MAX) { toast("✋ Message trop long pour être transféré : " + MSG_TEXTE_MAX.toLocaleString("fr-FR") + " caractères au plus"); return; }
  // Le compte a changé (ou la file a été purgée) pendant la copie ou le dépôt :
  // rien ne part, ni en local ni en base (ASTRA-21).
  if (_outboxContextePerime(_ctxTransfert)) { try { if (typeof diagLog === "function") diagLog("transfert_perime"); } catch (e) {} return; }
  if (!target.messages) target.messages = [];
  target.messages.push(localMsg);
  target.lastAt = Date.now();
  saveConversations();
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    var raw = content ? JSON.stringify(content) : (localMsg.text || "");
    var payload = (typeof _withSenderMeta === "function") ? _withSenderMeta(raw) : raw;
    // ⚠️ Le verdict de l'écriture DOIT être lu. Ce chemin avalait les deux
    // callbacks (`.then(function(){}, function(){})`) : un transfert dont
    // l'insertion échouait restait affiché comme envoyé, sans statut d'échec ni
    // renvoi — et disparaissait au rechargement. C'est exactement le mode de
    // défaillance que l'invariant maison décrit, et le chemin d'envoi principal
    // (`sendMessageToSupabase`, quelques lignes plus bas) le traite déjà
    // correctement : statut « failed » + mise en file de renvoi.
    // Le transfert n'avait simplement jamais reçu ce traitement.
    // ⚠️ MÊME DÉFAUT QUE `_sendTextToSupa`, MÊME REMÈDE (ASTRA-21) : l'auteur du
    // transfert est capturé ICI, pas relu dans la continuation.
    var auteurTransfert = (typeof MY_UID !== "undefined" ? MY_UID : null);
    var genTransfert = _outboxGenerationActuelle();
    if (!auteurTransfert) { _setMsgStatus(targetConvId, localMsg.id, "failed"); }
    else try {
      supa.from("conv_messages")
        .insert({ id: localMsg.id, conv_id: targetConvId, from_id: auteurTransfert, content: payload, created_at: new Date().toISOString() })
        .then(function (res) {
          if (genTransfert !== _outboxGenerationActuelle() || (typeof MY_UID !== "undefined" ? MY_UID : null) !== auteurTransfert) { _setMsgStatus(targetConvId, localMsg.id, "failed"); return; }
          if (res && res.error) { _setMsgStatus(targetConvId, localMsg.id, "failed"); _outboxAdd(targetConvId, localMsg.id, payload, _estCompteReel(auteurTransfert) ? auteurTransfert : null, { generation: genTransfert, auteur: auteurTransfert }); }
          else { _setMsgStatus(targetConvId, localMsg.id, "sent"); _outboxRemove(localMsg.id); }
        })
        .catch(function () {
          if (genTransfert !== _outboxGenerationActuelle() || (typeof MY_UID !== "undefined" ? MY_UID : null) !== auteurTransfert) { _setMsgStatus(targetConvId, localMsg.id, "failed"); return; }
          _setMsgStatus(targetConvId, localMsg.id, "failed"); _outboxAdd(targetConvId, localMsg.id, payload, _estCompteReel(auteurTransfert) ? auteurTransfert : null, { generation: genTransfert, auteur: auteurTransfert });
        });
    } catch (e) {
      _setMsgStatus(targetConvId, localMsg.id, "failed"); _outboxAdd(targetConvId, localMsg.id, payload, _estCompteReel(auteurTransfert) ? auteurTransfert : null, { generation: genTransfert, auteur: auteurTransfert });
    }
  }
  try { renderMessages(); } catch(e) {}
  toast("Transféré");
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
  // ⚠️ L'IDENTITÉ VIENT DU SERVEUR, JAMAIS DE LA CHARGE UTILE (PRO-02, 2026-09-14).
  // `sp` (cf. _withSenderMeta, app-02) est écrit par l'ÉMETTEUR dans `content`,
  // que tout membre d'une conversation peut poser librement. Il primait sur la
  // ligne `profiles` de `from_id` : un membre d'un groupe se faisait nommer
  // « Benjamin » sur la ligne d'expéditeur, et en 1:1 le nom ET la photo de
  // l'en-tête suivaient le dernier message reçu. Le NOM et la PHOTO sont ceux
  // de `from_id` (profiles, par `_fetchProfile`/`cacheRemoteProfile`) ; le
  // persona ne fournit plus qu'un DÉCOR borné — un emoji court sans caractère
  // HTML (même règle que les réactions) et une couleur hexadécimale. `n` et
  // `ph` sont ignorés. Verrou : identite-expediteur-serveur.spec.js.
  if (d.sp && typeof d.sp === "object") {
    var _e = _reactionKeySure(d.sp.e);
    var _c = /^#[0-9a-f]{3,8}$/i.test(String(d.sp.c || "")) ? String(d.sp.c) : "";
    m.senderProfile = { e: _e || undefined, c: _c || undefined };
    if (_e) m.fromEmoji = _e;
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
    // ⚠️ Le conteneur d'un vocal DÉPEND de l'appareil qui l'a enregistré :
    // Safari/iOS produit de l'`audio/mp4`, Chrome/Android du webm. Tester
    // l'égalité stricte avec "audio/webm" faisait passer tout vocal iPhone pour
    // une pièce jointe quelconque — lecteur intégré perdu, durée perdue, y
    // compris à la réception sur Android. Le NOM est le discriminant sûr : tout
    // vocal part de `_sendVoiceMessage` avec « Message vocal (Xs) », quel que
    // soit le conteneur. `audio/webm` reste accepté pour les messages DÉJÀ en
    // base, envoyés avant que le conteneur réel soit transmis. On ne l'élargit
    // PAS à tout `audio/*` : une vraie pièce jointe audio doit rester
    // téléchargeable, pas être avalée par le lecteur de vocaux.
    var _ft = (d.fileType || "").toLowerCase();
    var isVoice = /^Message vocal/.test(d.filename || "") || _ft === "audio/webm";
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
    // Un vocal déposé dans le seau `attachments` (privé depuis le 2026-09-11) se
    // lit par URL signée : on la résout ICI, au premier tap, puis on rejoue
    // l'appel — le reste de la fonction ne connaît qu'un objet Audio prêt.
    if (typeof src === "string" && typeof pieceJointeChemin === "function" && pieceJointeChemin(src)) {
      if (window[audioKey + '_attente']) return;
      window[audioKey + '_attente'] = true;
      urlPieceJointeSignee(src).then(function (u) {
        window[audioKey + '_attente'] = false;
        window[audioKey] = new Audio(u || src);
        _playVoiceById(aid);
      });
      return;
    }
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
  }).catch(function (err) {
    if (pb) pb.textContent = '▶';
    // ⚠️ Un `catch` MUET ici laissait l'utilisateur taper sur ▶ sans que rien
    // n'arrive et sans la moindre explication. Cas réel sur iPhone : Safari ne
    // décode PAS le conteneur WebM, dans lequel étaient enregistrés tous les
    // vocaux envoyés depuis Android (et, avant le correctif de
    // `_sendVoiceMessage`, ceux envoyés depuis un iPhone aussi, mal étiquetés).
    // Les nouveaux vocaux partent désormais dans le conteneur réellement
    // encodé ; ceux DÉJÀ en base restent illisibles sur iPhone — on le DIT,
    // plutôt que de laisser croire à un bouton cassé.
    var code = (audio.error && audio.error.code) || 0;
    var illisible = code === 3 || code === 4;   // DECODE / SRC_NOT_SUPPORTED
    try {
      if (illisible) toast("🎧 Ce vocal a été enregistré dans un format que cet appareil ne sait pas lire.");
      else console.warn("[voice] lecture impossible:", err);
    } catch (e) {}
  });
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
// La CLÉ d'une réaction vient d'un AUTRE compte : `conv_messages.content` est
// une colonne libre, tout compte membre de la conversation y insère ce qu'il
// veut. L'échappement à l'affichage empêche l'exécution — mais sans filtre à
// l'ENTRÉE, la valeur hostile entre quand même dans `state`, part dans
// localStorage ET IndexedDB par `saveConversations`, et revient à chaque
// démarrage. On borne donc ce qui a le droit de devenir une clé de réaction.
//
// Volontairement PAS une liste blanche de plages Unicode : les emojis composés
// (👨‍👩‍👧, drapeaux, modificateurs de teinte) casseraient. On rejette ce qui n'a
// rien à faire dans un emoji — balisage, guillemets, antislash, caractères de
// contrôle — et ce qui est trop long pour en être un.
function _reactionKeySure(x) {
  var s = String(x == null ? "" : x);
  if (!s || s.length > 16) return "";
  if (/[<>&"'\\\u0000-\u001F]/.test(s)) return "";
  return s;
}

function _applyReactionEvent(c, ev) {
  if (!c || !ev || !ev.target) return;
  var emoji = _reactionKeySure(ev.emoji);
  if (!emoji) return;
  var tm = (c.messages || []).find(function(x){ return x.id === ev.target; });
  if (!tm) return;
  tm.reactions = tm.reactions || {};
  if (ev.op === "remove") {
    tm.reactions[emoji] = (tm.reactions[emoji] || 1) - 1;
    if (tm.reactions[emoji] <= 0) delete tm.reactions[emoji];
  } else {
    tm.reactions[emoji] = (tm.reactions[emoji] || 0) + 1;
  }
}

function sendMessageFp(convId, displayName) {
  // Mode invité (première visite) : cette action engage le compte. Le gate
  // EXPLIQUE l'action puis propose la création de compte ; il ne rejoue jamais
  // l'action après coup. Rend `true` — donc inerte — hors mode invité.
  if (window.requireAuthentication && !requireAuthentication("message")) return;
  // Une conversation de démonstration ne répond pas et n'envoie rien (UXO-03).
  try {
    var _cDemo = getConversations().find(function (x) { return x.id === convId; });
    if (_estConvDemo(_cDemo)) { toast("Conversation de démonstration — écris à un vrai membre depuis son profil"); return; }
  } catch (e) {}
  // 1. Récupérer le texte
  var inp = document.getElementById("convFpInput");
  if (!inp) { console.error("sendMessageFp: input not found"); return; }
  var txt = (inp.value || "").trim();
  if (!txt) return;
  // La borne du serveur (CONTENU_MESSAGE_BORNE) : au-delà de MSG_TEXTE_MAX, le
  // message ne part pas et le texte RESTE dans le champ — on ne vide rien avant
  // d'avoir dit pourquoi. 5 000 caractères : le plus long texte envoyé en
  // production en fait 68 (07/11) ; son enveloppe (profil d'envoi, réponse), même
  // entièrement échappée, reste sous 11 000 — loin des 20 000 de la base.
  if (txt.length > MSG_TEXTE_MAX) {
    toast("✋ Message trop long : " + MSG_TEXTE_MAX.toLocaleString("fr-FR") + " caractères au plus (il en fait " + txt.length.toLocaleString("fr-FR") + ")");
    return;
  }

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
  // `de` : le compte RÉEL qui a écrit ce message (AUTH-06) — c'est lui, et lui
  // seul, qui autorise un renvoi manuel reconstruit depuis le texte.
  var _localMsg = { id: msgId, from: "me", text: txt, at: Date.now(), status: "sending", de: _fileProprietaire() };
  var _reply = (window._replyTo && window._replyTo.convId === convId) ? { id: window._replyTo.id, t: window._replyTo.t, n: window._replyTo.n } : null;
  if (_reply) _localMsg.replyTo = _reply;
  c.messages.push(_localMsg);
  c.lastAt = Date.now();
  delete c.draft; // brouillon envoyé
  saveConversations();
  if (window._replyTo) { window._replyTo = null; try { _renderReplyBar(); } catch(e) {} }
  try { _hideMentionBox(); } catch(e) {}
  try { if (c.isGroup) _notifyMentions(c, txt, msgId); } catch(e) {} // résout les @mentionnés (portés au serveur après l'envoi)

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

// ⚠️ UNE FILE LOCALE APPARTIENT À UN COMPTE (AUTH-06, 2026-09-14).
// L'entrée ne portait aucun propriétaire et `_sendTextToSupa` reconstruit
// l'auteur avec `MY_UID` AU MOMENT DE L'ENVOI. Deux comptes se succèdent sur le
// même appareil (déconnexion, retour OAuth, `onAuthStateChange`) : un texte
// préparé par A et resté en file (hors-ligne, panne serveur) était rejoué au
// démarrage ou au retour du réseau avec `from_id = B` — accepté par le serveur
// dès que B est membre de la conversation (leur 1:1, un groupe commun). Même
// patron que la file des suppressions (`_enqueuePostDelete`, champ `uid`).
// Le propriétaire est le compte RÉEL (uuid Supabase) — jamais le `u_<aléatoire>`
// d'un visiteur, qui ne prouve rien (règle « MY_UID ne prouve pas qu'un compte
// existe »). Verrou : file-messages-par-compte.spec.js.
function _fileProprietaire() {
  try { return (typeof _uidEstUnCompte === "function" && _uidEstUnCompte()) ? MY_UID : null; } catch (e) { return null; }
}

// ⚠️ GÉNÉRATION DE FILE (ASTRA-21). Un envoi capture la génération courante ; une
// purge l'incrémente. Une continuation née avant la purge est PÉRIMÉE et ne
// réécrit plus rien — sans quoi une réponse tardive repeuple une file que l'on
// vient de vider, ce qui vide la purge de son sens. Volatile par construction :
// un rechargement de page est déjà une frontière (rien n'est plus en vol).
window._outboxGeneration = window._outboxGeneration || 1;
function _outboxGenerationActuelle() { return window._outboxGeneration; }
function _outboxInvaliderEnVol() { window._outboxGeneration = (window._outboxGeneration || 1) + 1; }
// Verdict sur une entrée au rejeu : « moi » (à envoyer), « autre » (à jeter).
// ⚠️ PLUS D'ADOPTION (ASTRA / AUTH-06, contre-revue du 2026-09-15). La version du
// 14/09 adoptait une entrée SANS propriétaire si son message était encore dans
// les conversations de l'appareil — or le chemin le plus court du changement de
// compte (`onAuthStateChange`, retour OAuth) ne purge PAS ce cache : le texte de
// A, préparé avant le 14/09, était adopté puis envoyé sous B. Une entrée sans
// propriétaire ne prouve rien ; elle sort de la file, son message reste à l'écran
// en échec, et seul un renvoi manuel par le compte qui l'a ÉCRIT (`de`) le fera
// partir. Le coût est borné : ces entrées datent d'avant le 14/09 au soir.
function _outboxVerdict(item, moi) {
  if (!item.owner) return "autre";
  return item.owner === moi ? "moi" : "autre";
}
// ⚠️ ASTRA-21 (contre-revue du 15/09/2026) — LE PROPRIÉTAIRE EST UN ARGUMENT,
// PLUS JAMAIS UNE LECTURE DU COMPTE COURANT.
// `_outboxAdd` appelait `_fileProprietaire()`, c'est-à-dire « qui est connecté
// MAINTENANT ». Or ses appelants sont des CONTINUATIONS : la réponse d'un envoi
// parti sous A revient parfois après que B a pris la place (déconnexion, retour
// OAuth, `onAuthStateChange`). Le texte de A rentrait alors en file sous le nom
// de B, et le vidage suivant l'envoyait avec `from_id = B`. Purger la file ne
// sauvait rien : la réponse tardive la REPEUPLAIT après la purge.
// L'auteur est donc capturé À L'ORIGINE de l'envoi et porté jusqu'au bout.
// Sans propriétaire, on n'écrit RIEN en file : une entrée qui ne sait pas à qui
// elle appartient est exactement ce qu'AUTH-06 refuse de rejouer.
// ⚠️ `owner` PEUT ÊTRE `null`, et c'est VOULU : c'est ce que `_fileProprietaire()`
// rendait déjà pour un visiteur (pas d'uuid d'auth). Une entrée sans
// propriétaire est stockée puis JETÉE au rejeu par `_outboxVerdict` — refuser
// de la stocker ici changerait le comportement hors ligne d'un visiteur, qui
// n'a rien à voir avec ASTRA-21. Ce qui compte, c'est que `owner` soit celui
// capturé À L'ORIGINE, jamais relu dans la continuation.
// ⚠️ ASTRA-43 (cinquième contre-revue, 15/09/2026) — L'INVALIDATION VIT ICI, AU
// SEUL ENDROIT QUI ÉCRIT LA FILE. La branche de résolution de `_sendTextToSupa`
// vérifiait génération et identité ; son `catch` (rejet réseau), et le chemin
// MÉDIA d'app-09, remettaient en file sans cette vérification. Reproduit :
// envoi suspendu, purge de la file, génération incrémentée, identité retirée,
// puis REJET → le texte revenait en file (owner A). Ce n'est pas un envoi sous
// B (l'owner reste A) : c'est une RÉSURRECTION après purge. Toute continuation
// passe désormais son contexte d'origine `{ generation, auteur }` ; s'il ne
// correspond plus au présent, rien n'est écrit et c'est tracé. Les appels SANS
// contexte (hors ligne, SDK absent : synchrones, à l'origine) restent tels quels.
function _outboxContextePerime(contexte) {
  if (!contexte) return false;
  var courant = (typeof MY_UID !== "undefined" ? MY_UID : null);
  return contexte.generation !== _outboxGenerationActuelle() || contexte.auteur !== courant;
}
function _outboxAdd(convId, msgId, content, owner, contexte) {
  // ⚠️ LA GÉNÉRATION : une purge (déconnexion, adoption d'un compte) invalide
  // tout ce qui était en vol. Une continuation née avant la purge ne doit pas
  // ressusciter une file que l'on vient de vider — c'est le second volet du
  // scénario d'Astra, et il n'est PAS couvert par le seul propriétaire (une
  // réponse tardive de A, sous A, repeuplerait la file purgée de A).
  if (_outboxContextePerime(contexte)) {
    try { if (typeof diagLog === "function") diagLog("msg_file_perimee " + String(msgId)); } catch (e) {}
    return false;
  }
  var tous = _outboxLoad();
  // ⚠️ LE COMPTEUR D'ESSAIS SURVIT À LA REMISE EN FILE, sinon il ne compte
  // RIEN : chaque échec transitoire repasse par ici, et une entrée neuve
  // repartirait de zéro à chaque tour — le plafond ne serait jamais atteint.
  // Défaut introduit puis corrigé le 2026-09-09, avant toute mise en ligne.
  var ancienne = tous.find(function(x){ return x.msgId === msgId; });
  var a = tous.filter(function(x){ return x.msgId !== msgId; });
  a.push({ convId: convId, msgId: msgId, content: content, at: Date.now(),
           essais: Number((ancienne && ancienne.essais) || 0),
           owner: owner });
  _outboxSave(a);
  return true;
}
function _outboxRemove(msgId) { _outboxSave(_outboxLoad().filter(function(x){ return x.msgId !== msgId; })); }

// LOT-20 (MSG-C19 / C32) : l'état vide de la messagerie se termine par une
// ACTION — « Nouveau message » (même geste que le « + »), ou « Réessayer »
// quand la lecture est lente. Bouton peint en DOM, sans onclick inline.
function _peindreActionEtatVideMessages(empt, actif) {
  if (!empt) return;
  var ancien = empt.querySelector("[data-msg-vide-action]");
  if (ancien) ancien.remove();
  if (!actif) return;
  var lent = !!window._convChargementLent;
  var b = document.createElement("button");
  b.type = "button";
  b.className = "btn primary msg-vide-action";
  b.setAttribute("data-msg-vide-action", lent ? "reessayer" : "nouveau");
  b.textContent = lent ? "Réessayer" : "Nouveau message";
  b.addEventListener("click", function () {
    if (lent) {
      window._convChargementLent = false;
      window._convNetLoaded = false;
      window._convSkelTimeout = null;
      try {
        if (typeof _rafraichirConversationsServeur === "function") {
          var p = _rafraichirConversationsServeur({ fusion: true });
          if (p && typeof p.catch === "function") p.catch(function (e) { try { diagLog("conversations : réessai — " + (e && e.message)); } catch (_) {} });
        }
      } catch (e) {}
      try { renderMessages(); } catch (e) {}
      return;
    }
    try { if (typeof openNewMessage === "function") openNewMessage(); } catch (e) {}
  });
  empt.appendChild(b);
}

// HTML de l'indicateur d'envoi (🕓 en cours / ⚠️ échec cliquable / rien si envoyé).
// LOT-20 (audit UX/UI du 2026-11-10, MSG-C62) : un seul état par message, en
// toutes lettres — « Envoi… », « En attente du réseau » (hors ligne : il part
// seul au retour), « Non envoyé · réessayer » en vraie cible de 44 px (c'était
// un mot rouge de 47 × 15 px collé à l'heure, à côté d'un « ✓ » mensonger).
function _msgStatusIndHtml(convId, msgId, status) {
  if (status === "sending") {
    var horsLigne = (typeof navigator !== "undefined" && navigator.onLine === false);
    return ' <span class="msg-st msg-st-envoi">🕓 ' + (horsLigne ? "En attente du réseau" : "Envoi…") + '</span>';
  }
  if (status === "failed") return ' <span class="msg-st msg-st-echec" role="button" tabindex="0" aria-label="Message non envoyé — réessayer" onclick="_retryMsg(\'' + escapeJsArg(convId) + '\',\'' + escapeJsArg(msgId) + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click();}">Non envoyé · réessayer</span>';
  return '';
}

// Met à jour le statut d'un message local. Patch EN PLACE de l'indicateur via le
// holder [data-msgst] : l'ancien re-render complet du fil à chaque 🕓→envoyé
// recréait 40 bulles (médias inclus) et ramenait le scroll tout en bas.
function _setMsgStatus(convId, msgId, status) {
  var convs = getConversations();
  var c = convs.find(function(x){ return x.id === convId; }); if (!c) return;
  var m = (c.messages || []).find(function(x){ return x.id === msgId; }); if (!m) return;
  m.status = status;
  saveConversations();
  if (window._openedConvId !== convId) return;
  var holder = document.querySelector('#convFpThread [data-msgst="' + (window.CSS && CSS.escape ? CSS.escape(msgId) : msgId) + '"]');
  if (holder) { holder.innerHTML = _msgStatusIndHtml(convId, msgId, status); return; }
  // Holder absent (message hors page affichée) : repli sur le re-render complet.
  try { var fp = document.getElementById("conv-fullpage"); renderConvFpThread(c, fp ? fp.getAttribute("data-display-name") : (c.userName||"")); } catch(e) {}
}

// ⚠️ UN REFUS DÉFINITIF NE SE REJOUE PAS (2026-09-09).
// Mesuré en production : 798 refus HTTP 403 sur `conv_messages` en six jours,
// pour QUATRE messages réellement partis. Toute défaillance était traitée à
// l'identique — coupure réseau, panne serveur ET refus de la règle d'accès —
// donc remise en file, et `_flushOutbox` la rejouait à chaque démarrage et à
// chaque retour de connexion. Un message que la RLS refuse ne passera JAMAIS :
// le rejouer indéfiniment ne le livre pas, ça noie seulement le vrai signal.
//
// ⚠️ ON NE PERD RIEN POUR AUTANT : le message reste dans la conversation,
// marqué « échec », avec son « réessayer » cliquable. On retire l'AUTOMATISME,
// jamais la possibilité — c'est la personne qui décide de retenter, une fois la
// cause levée (invitation acceptée, session rouverte).
//
// ⚠️ LE PLAFOND D'ESSAIS EST LA SECONDE CEINTURE, et il existe parce qu'on
// vient d'apprendre qu'un refus définitif peut prendre une forme qu'on ne
// connaît pas encore. Sans lui, la prochaine cause inconnue rouvrirait
// exactement le même défaut, avec un autre code.
var MSG_ESSAIS_MAX = 10;

// ⚠️ UN REFUS 403 SUR UN MESSAGE EST SOUVENT RÉPARABLE, ET LE JETER SERAIT
// PERDRE LA CONVERSATION (2026-09-10).
// Mesuré en production : 19 conversations sur 20 n'ont AUCUNE ligne
// `conv_members`. La policy d'insertion de `conv_messages` exige
// `is_conv_member(conv_id, auth.uid())` : sans membre, TOUT message est refusé,
// pour toujours. Ces conversations datent d'avant le correctif de policy du
// 2026-06-11 (`migration_fix_conv_members_insert.sql`), quand le créateur ne
// pouvait pas ajouter l'autre membre — l'insert échouait, la conversation
// restait, vide de membres.
//
// ⚠️ MAIS ELLES PORTENT TOUTES UN `created_by`, et la policy d'AUJOURD'HUI
// autorise `is_conversation_creator(conv_id)` : leur créateur PEUT donc
// réinscrire les membres manquants. La réparation est possible, il suffisait
// de la tenter.
//
// ⚠️ UNE SEULE TENTATIVE PAR CONVERSATION ET PAR SESSION. Sans ce verrou, un
// refus qui n'a rien à voir avec l'appartenance (compte bloqué, conversation
// d'un autre) relancerait la réparation à chaque message — on rouvrirait la
// boucle d'obstination que le correctif du 2026-09-09 vient de fermer, avec un
// appel de plus à chaque tour.
window._convReparationTentee = window._convReparationTentee || {};

async function _reparerAppartenanceConv(convId) {
  if (!convId || window._convReparationTentee[convId]) return false;
  window._convReparationTentee[convId] = true;
  try {
    var c = getConversations().find(function (x) { return x.id === convId; });
    // Conversation de groupe ou pair inconnu : on ne devine pas une liste de
    // membres. Le cas 1-à-1 est celui qui est mesuré, on s'y tient.
    if (!c || !c.userId) return false;
    // Deux inserts SÉPARÉS : un insert multi-lignes échoue ATOMIQUEMENT, donc
    // un membre déjà présent ferait échouer l'ajout de l'autre. C'est
    // exactement la faute d'origine de `migration_fix_conv_members_insert.sql`.
    var rMoi = await supa.from("conv_members").insert({ conv_id: convId, user_id: MY_UID });
    var rLui = await supa.from("conv_members").insert({ conv_id: convId, user_id: c.userId });
    // Un conflit de clé (déjà membre) n'est PAS un échec : ce qu'on voulait est
    // vrai. Seul un refus RLS dit que la réparation n'était pas permise.
    var echec = function (r) { return r && r.error && !/duplicate|already exists|23505/i.test(String(r.error.code || "") + String(r.error.message || "")); };
    var ok = !(echec(rMoi) && echec(rLui));
    try { if (typeof diagLog === "function") diagLog("conv_reparation " + (ok ? "ok" : "refus")); } catch (e) {}
    return ok;
  } catch (e) { return false; }
}

// ⚠️ LE CONTENU D'UN MESSAGE EST BORNÉ PAR LE SERVEUR (2026-11-07).
// L'invariant « jamais de base64 en base (→ Storage) » n'était tenu que par le
// client : `conv_messages.content` est un `text` sans contrainte, et tout compte
// connecté (une ancienne version, une requête forgée) pouvait y écrire un
// fichier entier. La migration `migration_conv_messages_contenu_borne_2026-11-07.sql`
// pose deux contraintes CHECK :
//   · `conv_messages_content_len_check` — 20 000 caractères au plus (le plus long
//     message de production mesuré le 07/11 en fait 551) ;
//   · `conv_messages_content_url_data_check` — l'`url` d'une enveloppe n'est
//     jamais une data-URL.
// Ce client se tient sous ces bornes : un texte de plus de MSG_TEXTE_MAX
// caractères ne part pas (`sendMessageFp`, `_forwardTo`), un média encore local
// passe par Storage avant d'être transféré (`_forwardTo`), et un refus 23514 est
// DÉFINITIF (`_refusDefinitif`). `CONTENU_MESSAGE_BORNE` est la chaîne que la
// migration exige dans le client SERVI avant de s'appliquer (`-- PREREQUIS-CLIENT:`,
// règle ④ de scripts/lib/barriere-migration.js).
var CONTENU_MESSAGE_BORNE = "conv_messages:contenu-borne";
var MSG_TEXTE_MAX = 5000;

// Ce qu'on DIT d'un refus de contenu par la base (23514), ou null pour un autre
// refus. Le message de PostgREST porte le nom de la contrainte.
function _motRefusContenu(err) {
  if (!err || String(err.code || "") !== "23514") return null;
  var m = String(err.message || "");
  try { if (typeof diagLog === "function") diagLog(CONTENU_MESSAGE_BORNE + " refus " + ((m.match(/conv_messages_content_\w+/) || ["?"])[0])); } catch (e) {}
  if (m.indexOf("conv_messages_content_url_data_check") >= 0) return "⚠️ Message non envoyé : sa pièce jointe n'a pas été téléversée";
  if (m.indexOf("conv_messages_content_len_check") >= 0) return "⚠️ Message non envoyé : il est trop long";
  return "⚠️ Message non envoyé : son contenu est refusé";
}

function _refusDefinitif(error, statut) {
  var code = String((error && error.code) || "");
  // 42501 = refus d'écriture par une policy PostgreSQL. Rien à rejouer.
  if (code === "42501") return true;
  // 23514 = une contrainte CHECK refuse la LIGNE elle-même (CONTENU_MESSAGE_BORNE :
  // trop long, pièce jointe en base64). Renvoyée telle quelle, elle sera refusée
  // pareil. PostgREST la rend en 400, que rien ici ne reconnaissait : la file
  // l'aurait rejouée à chaque démarrage, jusqu'à MSG_ESSAIS_MAX.
  if (code === "23514") return true;
  var st = Number(statut || (error && error.status) || 0);
  // ⚠️ 401 ET 403 sont DEUX causes distinctes qu'on traite pareil ICI, et
  // seulement ici : 401 = jeton absent ou expiré, 403 = la règle dit non. Dans
  // les deux cas, rejouer la même requête telle quelle échouera pareil.
  return st === 401 || st === 403;
}

// ⚠️ UN MESSAGE N'EST EN VOL QU'UNE FOIS (ROB-06, 2026-09-14). Deux vidages
// concurrents de la file (`online` + boot, ou deux « réessayer » rapprochés)
// lisaient la même file et envoyaient chaque message deux fois : quatre INSERT
// pour deux messages. Le serveur dédoublonnait par clé primaire, mais la
// seconde réponse (23505) écrasait le statut « envoyé » par « échec ». Tant
// qu'une écriture de `msgId` n'a pas répondu, tout nouvel envoi du même
// message est ignoré — et `_flushOutbox` ne compte pas d'essai pour lui.
var _msgEnVol = {};
function _msgEstEnVol(msgId) { return _msgEnVol[msgId] === true; }

// Envoie un message texte/enveloppe à Supabase, gère statut (sending→sent/failed)
// et la file d'attente : hors-ligne ou échec TRANSITOIRE → garde en outbox.
// ⚠️ `auteur` ET `generation` SONT CAPTURÉS À L'ORIGINE (ASTRA-21) et portés
// jusqu'au bout — réponse, rejet, réparation 403 comprise. Les appelants n'ont
// rien à passer : le premier appel les prend. Ce sont les RÉCURSIONS et les
// continuations qui les réutilisent, et c'est tout l'objet du correctif.
// ⚠️ DEUX IDENTITÉS, ET LES CONFONDRE CASSE LE PRODUIT. Une première rédaction
// prenait `_fileProprietaire()` comme auteur d'écriture : elle exigeait donc un
// uuid d'AUTH pour envoyer quoi que ce soit, alors que `MY_UID` peut être le
// `u_<aléatoire>` d'un visiteur. Mesuré en CI : 9 verrous rouges sur quatre
// suites, toutes avec la même signature — « 0 écriture là où 1 ou 2 étaient
// attendues ». Le produit n'émettait plus rien.
//   · l'identité d'ÉCRITURE est `MY_UID` — c'est elle qui part en `from_id`,
//     et le serveur tranche (la RLS refusera un placeholder) ;
//   · le PROPRIÉTAIRE DE LA FILE est le compte RÉEL, ou `null` (AUTH-06).
// ASTRA-21 ne demande pas de durcir qui peut écrire : il demande que ce qui est
// écrit le soit sous l'identité qui a COMPOSÉ le texte.
function _estCompteReel(uid) {
  try { return typeof uid === "string" && typeof RE_UID_COMPTE !== "undefined" && RE_UID_COMPTE.test(uid); }
  catch (e) { return false; }
}
// ───────── Flux « send_message » du chemin TEXTE (2026-11-06) ─────────
// Le chemin média (sendMessageToSupabase, app-09) portait son flux ; le chemin
// TEXTE — l'immense majorité des messages — n'en avait AUCUN : un message refusé
// n'existait au pilotage que s'il levait aussi un appel réseau en échec, et un
// message enregistré n'était jamais confirmé. Contrat :
// supabase/functions/_shared/contrats-actions.js (send_message). Ouvert à
// l'écriture RÉELLE, fermé au verdict de la base ; une mise en file locale se
// déclare « pending » (attente annoncée, pas un échec), un refus porte son code.
function _fluxEnvoiMessage(convId) {
  var cid = null;
  try { if (window.tel && tel.flowStart) cid = tel.flowStart("send_message", { convId: convId, kind: "text" }); } catch (e) {}
  return {
    etape: function (cle) { try { if (cid && window.tel) tel.step(cid, cle, "ok"); } catch (e) {} },
    regle: function (ok, err) { try { if (cid && window.tel && tel.settle) tel.settle(cid, "saved", ok, err || null); } catch (e) {} cid = null; },
    attente: function (motif) {
      try { if (cid && window.tel) { tel.step(cid, "queued", "ok", { rc: motif || "hors_ligne" }); tel.flowEnd(cid, "pending"); } } catch (e) {}
      cid = null;
    },
  };
}

function _sendTextToSupa(convId, msgId, content, auteur, generation) {
  var moi = auteur || (typeof MY_UID !== "undefined" ? MY_UID : null);
  var gen = generation || _outboxGenerationActuelle();
  // Sans identité du tout, on n'écrit ni en base ni en file.
  if (!moi) { _setMsgStatus(convId, msgId, "failed"); return; }
  // ⚠️ LA GARDE QUI MANQUAIT. L'auteur capturé doit ÊTRE l'identité courante au
  // moment où l'on écrit. Sinon on n'insère pas, on ne met pas en file, et on
  // laisse le message en échec à l'écran : son auteur le renverra lui-même.
  var courant = (typeof MY_UID !== "undefined" ? MY_UID : null);
  if (courant !== moi) {
    _setMsgStatus(convId, msgId, "failed");
    try { if (typeof diagLog === "function") diagLog("msg_auteur_diverge " + String(msgId)); } catch (e) {}
    return;
  }
  if (gen !== _outboxGenerationActuelle()) {
    _setMsgStatus(convId, msgId, "failed");
    try { if (typeof diagLog === "function") diagLog("msg_generation_perimee " + String(msgId)); } catch (e) {}
    return;
  }
  if (typeof supa === "undefined" || !supa || typeof MY_UID === "undefined" || !MY_UID || !window._supaReal) {
    _setMsgStatus(convId, msgId, "failed"); _outboxAdd(convId, msgId, content, _estCompteReel(moi) ? moi : null); return;
  }
  if (navigator && navigator.onLine === false) {
    _setMsgStatus(convId, msgId, "failed"); _outboxAdd(convId, msgId, content, _estCompteReel(moi) ? moi : null);
    _fluxEnvoiMessage(convId).attente("hors_ligne");
    return;
  }
  if (_msgEstEnVol(msgId)) return;
  _msgEnVol[msgId] = true;
  var _flux = _fluxEnvoiMessage(convId);
  // `from_id: moi` et non `MY_UID` : même si la garde ci-dessus était un jour
  // contournée, l'insertion ne peut pas partir sous une autre identité que
  // celle qui a écrit le texte.
  supa.from("conv_messages")
    .insert({ id: msgId, conv_id: convId, from_id: moi, content: content, created_at: new Date().toISOString() })
    .then(function(res) {
      delete _msgEnVol[msgId];
      // ⚠️ UNE PURGE PENDANT LE VOL PÉRIME CETTE RÉPONSE. Sans cette sortie, un
      // 503 revenu après une déconnexion remettait le texte en file — c'est le
      // « la réponse tardive repeuple la file purgée » d'ASTRA-21.
      if (gen !== _outboxGenerationActuelle() || (typeof MY_UID !== "undefined" ? MY_UID : null) !== moi) {
        // Le flux dit le verdict de la BASE, quoi que l'écran en fasse ensuite.
        _flux.regle(!(res && res.error), res && res.error);
        _setMsgStatus(convId, msgId, "failed");
        try { if (typeof diagLog === "function") diagLog("msg_reponse_perimee " + String(msgId)); } catch (e) {}
        return;
      }
      var _envoye = function () {
        _setMsgStatus(convId, msgId, "sent"); _outboxRemove(msgId);
        // ⚠️ LA NOTIFICATION ÉTAIT BRANCHÉE SUR UNE FONCTION MORTE (2026-09-10).
        // `_notifierMessage` n'était appelée que par `supaSendMessage`, qui n'a
        // AUCUN appelant dans le dépôt : le correctif du 2026-09-09 était écrit,
        // testé, documenté… et sur un chemin que personne n'emprunte. Les deux
        // vraies voies sont celle-ci (texte) et `sendMessageToSupabase` (média).
        // Mesuré en production : `notifications` ne portait AUCUNE ligne
        // `kind='message'`, y compris pour le message envoyé après le déploiement.
        // C'est ICI qu'il faut notifier : dans la branche de SUCCÈS, jamais avant
        // — annoncer un message que la base a refusé annoncerait un message qui
        // n'existe pas. Fire-and-forget : l'envoi n'attend pas la cloche.
        // (Identifiant déterministe `n_<msgId>_…` : un renvoi ne la double pas.)
        try { if (typeof _notifierMessage === "function") _notifierMessage(convId, msgId); } catch (e) {}
        // ASTRA-24 : les mentions du message, maintenant qu'il existe en base.
        try { if (typeof _mentionnerApresEnvoi === "function") _mentionnerApresEnvoi(msgId); } catch (e) {}
      };
      // Le code fermé d'un refus de RÈGLE (revue adversariale du 2026-11-06) : une
      // conversation avec un compte que J'AI bloqué (`isBlocked`) refuse en 42501 —
      // c'est la règle, pas une panne du parcours.
      var _codeRefus = function () {
        try {
          var refusRls = Number(res.status) === 403 || String(res.error && res.error.code) === "42501";
          var c = refusRls ? getConversations().find(function (x) { return x.id === convId; }) : null;
          if (c && c.userId && typeof isBlocked === "function" && isBlocked(c.userId)) return { code: "bloque", message: "bloque" };
        } catch (e) {}
        return res.error;
      };
      var _refuse = function () {
        _setMsgStatus(convId, msgId, "failed");
        // ⚠️ 403 SEULEMENT, JAMAIS 401 : un jeton absent ou expiré ne se répare
        // pas en ajoutant un membre, et tenter l'écriture sous une identité
        // qui n'existe pas consommerait la tentative unique pour rien.
        var estRefusAcces = Number(res.status) === 403 || String(res.error && res.error.code) === "42501";
        if (estRefusAcces && !window._convReparationTentee[convId]) {
          // ⚠️ LA RÉCURSION PORTE L'AUTEUR (ASTRA-21). Sans lui, elle relisait
          // `MY_UID` : si le compte avait changé pendant la réparation, le texte
          // de A repartait sous B — et sans passer par la file, donc hors de
          // portée de la garde d'AUTH-06.
          _reparerAppartenanceConv(convId).then(function (repare) {
            // Réparé : ce flux attend le suivant (le renvoi ouvre le sien).
            if (repare) { _flux.attente("reparation"); _sendTextToSupa(convId, msgId, content, moi, gen); return; }
            _flux.regle(false, _codeRefus());
            _setMsgStatus(convId, msgId, "failed"); _outboxRemove(msgId);
          });
          return;
        }
        if (_refusDefinitif(res.error, res.status)) {
          _flux.regle(false, _codeRefus());
          // Sortie de la file : plus AUCUN renvoi automatique pour celui-ci.
          _outboxRemove(msgId);
          // Le refus doit laisser une trace : sans elle, il redevient invisible
          // — c'est exactement ce qui a permis six jours de refus silencieux.
          try { if (typeof diagLog === "function") diagLog("msg_refus_definitif " + String((res.error && res.error.code) || res.status || "?")); } catch (e) {}
          // Un refus de CONTENU (23514) se DIT : réessayer n'y changera rien, il
          // faut raccourcir le texte ou renvoyer le fichier.
          var _motContenu = _motRefusContenu(res.error);
          if (_motContenu) { try { toast(_motContenu); } catch (e) {} }
        } else {
          // Rejoué par la file : un réseau absent est une ATTENTE ; le limiteur
          // anti-abus un refus légitime (« limite ») ; un serveur qui répond en
          // échec, un ÉCHEC de cet essai (le suivant aura le sien).
          var _code = typeof _codeEchecEcriture === "function" ? _codeEchecEcriture(res.error) : null;
          if (_code === "reseau") _flux.attente("hors_ligne");
          else _flux.regle(false, _code ? { code: _code, message: _code } : res.error);
          _outboxAdd(convId, msgId, content, _estCompteReel(moi) ? moi : null, { generation: gen, auteur: moi });
        }
      };
      if (res && res.error) {
        // ② RÉPONSE PERDUE PUIS RENVOI (2026-11-06). Le premier envoi a écrit la
        // ligne, sa réponse s'est perdue ; ce renvoi du MÊME identifiant reçoit
        // 23505. Sans ce rapprochement, le message restait « ⚠️ non envoyé » et
        // repartait en file à chaque démarrage, pour toujours, alors que le
        // destinataire le lisait. On ne le dit envoyé que sur PREUVE : conflit
        // sur `conv_messages_pkey`, et la ligne relue porte `from_id = moi`
        // (_conflitClePrimaire, _ligneDejaEnBase — app-02). Sinon, le refus suit
        // son cours ordinaire. Verrou : tests/e2e/parcours-flux.spec.js.
        if (typeof _conflitClePrimaire === "function" && _conflitClePrimaire(res.error, "conv_messages")) {
          // ⚠️ LA PREUVE FAIT PARTIE DU VOL (ROB-06, audit du 2026-11-06). La garde
          // venait d'être levée en tête de réponse : pendant la relecture, un
          // `online` ou le vidage du démarrage renvoyait le même message, qui
          // pouvait finir « réessayer » après avoir été prouvé en base. Et la
          // promesse est RENDUE : une exception de `_envoye`/`_refuse` rejoint
          // le `.catch` (échec + remise en file), elle ne s'échappe pas.
          _msgEnVol[msgId] = true;
          return _ligneDejaEnBase("conv_messages", msgId, "from_id", moi).then(function (dejaLa) {
            delete _msgEnVol[msgId];
            var encoreMoi = gen === _outboxGenerationActuelle() && (typeof MY_UID !== "undefined" ? MY_UID : null) === moi;
            if (dejaLa && encoreMoi) { _flux.etape("deja_en_base"); _flux.regle(true); _envoye(); return; }
            _refuse();
          }, function () { delete _msgEnVol[msgId]; _refuse(); });
        }
        _refuse();
      }
      else { _flux.regle(true); _envoye(); }
    })
    // ⚠️ ASTRA-43 : le REJET porte le même contexte que la résolution — sans lui,
    // une panne réseau revenue après la purge ressuscitait la file.
    .catch(function(err) {
      delete _msgEnVol[msgId];
      var _code = typeof _codeEchecEcriture === "function" ? _codeEchecEcriture(err) : null;
      if (_code === "reseau") _flux.attente("hors_ligne"); else _flux.regle(false, _code ? { code: _code, message: _code } : err);
      _setMsgStatus(convId, msgId, "failed"); _outboxAdd(convId, msgId, content, _estCompteReel(moi) ? moi : null, { generation: gen, auteur: moi });
    });
}

// Renvoi manuel d'un message en échec.
function _retryMsg(convId, msgId) {
  var item = _outboxLoad().find(function(x){ return x.msgId === msgId; });
  // L'entrée d'un AUTRE compte ne se renvoie pas, même à la main : elle sort de
  // la file et le message reste à l'écran, en échec — rien n'est perdu, rien
  // ne part sous une identité qui n'est pas la sienne.
  var moi = _fileProprietaire();
  // Une entrée sans propriétaire, ou d'un autre compte : elle sort de la file,
  // rien ne part sous une identité qui n'est pas prouvée (ASTRA / AUTH-06).
  if (item && (!item.owner || item.owner !== moi)) {
    _outboxRemove(msgId);
    _setMsgStatus(convId, msgId, "failed");
    try { if (typeof diagLog === "function") diagLog("msg_outbox_autre_compte retry"); } catch (e) {}
    item = null;
    if (!moi) { toast("Ce message ne peut pas être renvoyé depuis ce compte."); return; }
  }
  if (item) { _setMsgStatus(convId, msgId, "sending"); _sendTextToSupa(convId, msgId, item.content, item.owner); return; }
  // Pas en file → reconstruire depuis le texte, SEULEMENT si ce compte l'a écrit.
  var c = getConversations().find(function(x){ return x.id === convId; });
  var m = c && (c.messages||[]).find(function(x){ return x.id === msgId; });
  if (!m) return;
  if (!moi || !m.de || m.de !== moi) {
    _setMsgStatus(convId, msgId, "failed");
    try { if (typeof diagLog === "function") diagLog("msg_retry_auteur_non_prouve"); } catch (e) {}
    toast("Ce message a été écrit avec un autre compte ou une ancienne version — recopie-le pour l'envoyer.");
    return;
  }
  // Une PIÈCE JOINTE se renvoie depuis SA copie locale (`_pjRenvoyer`, app-09) —
  // jamais reconstruite en texte : `m.text` y est vide, et le renvoi serait parti en
  // message vide (2026-11-07). L'auteur vient d'être confronté au compte courant.
  if (m.pj && typeof _pjRenvoyer === "function") { _pjRenvoyer(convId, msgId); return; }
  _setMsgStatus(convId, msgId, "sending");
  // Reconstruit depuis le texte : l'auteur est `m.de`, celui inscrit à
  // l'écriture — et il vient d'être confronté au compte courant ci-dessus.
  // `envoi` : le contenu exact d'un GIF ou d'une position (LOT-1, MSG-C57) — sans
  // lui, un renvoi les reconstruirait en simple texte.
  _sendTextToSupa(convId, msgId, _withSenderMeta(m.envoi || m.text || ""), m.de);
}

// Vide la file d'attente (à la reconnexion ou au boot).
function _flushOutbox() {
  // Les pièces jointes dont le DÉPÔT attend le réseau ont leur file à part
  // (`passio_pj_outbox_v1`, `_pjFileVider`, app-09) et les mêmes déclencheurs :
  // démarrage et retour du réseau. Un échec ici ne doit pas taire le reste.
  try { if (typeof _pjFileVider === "function") _pjFileVider(); }
  catch (e) { try { if (typeof diagLog === "function") diagLog("pj_file_vider KO " + String((e && e.message) || e).slice(0, 80)); } catch (_) {} }
  var a = _outboxLoad();
  if (!a.length) return;
  // Session expirée (UXO-02) : on ne rejoue RIEN — sans compte joignable,
  // `_fileProprietaire()` rend null et chaque entrée serait jetée comme « autre ».
  if (typeof sessionExpiree === "function" && sessionExpiree()) return;
  if (navigator && navigator.onLine === false) return;
  // ⚠️ Les entrées d'AVANT ce correctif n'ont pas de compteur : `|| 0` les
  // adopte sans les jeter. Une file existante ne doit pas être perdue par une
  // mise à jour — elle porte des messages que la personne croit envoyés.
  var restants = [];
  var moi = _fileProprietaire();
  a.forEach(function(item){
    // ⚠️ Le compte d'ABORD, avant tout compteur et tout envoi : une entrée
    // d'un autre compte est jetée, sans toucher au statut d'un message qui
    // n'est pas dans nos conversations. Tracé — un rejeu refusé en silence
    // serait indiscernable d'une file vide.
    if (_outboxVerdict(item, moi) === "autre") {
      // Sans propriétaire (d'avant le 14/09) : si le message est encore ici, il
      // passe en échec à l'écran — visible, renvoyable par son auteur, jamais rejoué.
      if (!item.owner) _setMsgStatus(item.convId, item.msgId, "failed");
      try { if (typeof diagLog === "function") diagLog("msg_outbox_autre_compte flush"); } catch (e) {}
      return;
    }
    // Déjà en vol (vidage concurrent) : on le garde en file tel quel, sans
    // compter d'essai ni le renvoyer — sa réponse tranchera (ROB-06).
    if (_msgEstEnVol(item.msgId)) { restants.push(item); return; }
    var essais = Number(item.essais || 0) + 1;
    if (essais > MSG_ESSAIS_MAX) {
      // On ne renvoie plus tout seul, mais le message RESTE à l'écran, en
      // échec, avec son « réessayer ». On abandonne l'automatisme, pas le texte.
      _setMsgStatus(item.convId, item.msgId, "failed");
      try { if (typeof diagLog === "function") diagLog("msg_outbox_plafond " + essais); } catch (e) {}
      return;
    }
    item.essais = essais;
    restants.push(item);
    _setMsgStatus(item.convId, item.msgId, "sending");
    // ⚠️ C'est l'OWNER DE L'ENTRÉE qui gouverne, jamais une relecture du compte
    // courant (ASTRA-21) : `_outboxVerdict` vient de dire qu'ils coïncident, et
    // les repasser par une lecture rouvrirait la fenêtre qu'on ferme.
    _sendTextToSupa(item.convId, item.msgId, item.content, item.owner);
  });
  // ⚠️ On réécrit la file AVANT que les réponses n'arrivent : `_sendTextToSupa`
  // fait lui-même son `_outboxAdd`/`_outboxRemove` à la réponse, et il gagne.
  // Écrire après écraserait ses décisions par un instantané périmé.
  _outboxSave(restants);
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
  var members = (c.userIds || [])
    .filter(function(id){ return !(typeof isBlocked === "function" && isBlocked(id)); }) // un membre bloqué n'est pas proposé (MSG-10)
    .map(function(id){ return { id: id, name: (typeof _groupMemberName === "function" ? _groupMemberName(id) : "Membre") }; })
    .filter(function(m){ return !q || m.name.toLowerCase().indexOf(q) > -1; }).slice(0, 6);
  if (!members.length) { _hideMentionBox(); return; }
  var toolbar = document.querySelector("#conv-fullpage .conv-toolbar"); if (!toolbar) return;
  var box = document.getElementById("convMentionBox");
  if (!box) { box = document.createElement("div"); box.id = "convMentionBox"; box.style.cssText = "position:absolute;bottom:100%;left:8px;right:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;box-shadow:0 -4px 20px rgba(0,0,0,0.18);max-height:200px;overflow-y:auto;z-index:30;margin-bottom:6px;"; toolbar.style.position = "relative"; toolbar.appendChild(box); }
  // ⚠️ MSG-02 (2026-09-14) — rendu DOM, JAMAIS une chaîne HTML. L'ancienne
  // version interpolait le pseudo dans `onclick="_pickMention('…')"` avec pour
  // seule garde `.replace(/'/g,"\\'")` : un guillemet double FERMAIT l'attribut
  // et la suite du pseudo devenait un handler (`onmouseover="…"`) exécuté au
  // survol — la CSP autorise 'unsafe-inline'. Or ce pseudo est celui d'un AUTRE
  // compte (`_groupMemberName` → `profiles.username`, sans contrainte de
  // caractères). Même patron que `_showMentionBox` (commentaires) : textContent
  // + écouteur attaché, aucune interpolation. Verrou : mention-groupe-xss.spec.js.
  box.textContent = "";
  members.forEach(function(m){
    var nom = String(m.name);
    var row = document.createElement("div");
    row.className = "conv-mention-row";
    row.style.cssText = "display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);";
    var initiale = document.createElement("span");
    initiale.style.cssText = "width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;";
    initiale.textContent = nom.charAt(0).toUpperCase();
    var libelle = document.createElement("span");
    libelle.style.cssText = "font-size:13px;font-weight:600;";
    libelle.textContent = nom;
    row.appendChild(initiale);
    row.appendChild(libelle);
    // mousedown + preventDefault : le composeur garde le focus et son curseur,
    // que `_pickMention` lit (`selectionStart`) — un `click` arriverait après le blur.
    row.addEventListener("mousedown", function(ev){ ev.preventDefault(); _pickMention(nom); });
    box.appendChild(row);
  });
}
function _pickMention(name) {
  var inp = document.getElementById("convFpInput"); if (!inp) return;
  var pos = inp.selectionStart || inp.value.length;
  // Remplacement par FONCTION : avec une chaîne, `String.replace` interprète
  // `$&`, `$'`, `$$`… et un pseudo qui en contient serait inséré déformé.
  var before = inp.value.slice(0, pos).replace(/@([\wà-öø-ÿ' -]{0,20})$/i, function(){ return "@" + name + " "; });
  inp.value = before + inp.value.slice(pos);
  _hideMentionBox();
  inp.focus();
  try { autoResizeTextarea(inp); } catch(e) {}
}
// Les membres mentionnés (@nom) dans un message de groupe : RÉSOLUS en
// identifiants à la composition, MÉMORISÉS par message, et portés au serveur
// une fois le message ATTERRI (`_mentionnerApresEnvoi`, dans la branche de
// succès de `_sendTextToSupa`) — ASTRA-24.
window._mentionsEnAttente = window._mentionsEnAttente || {};
function _notifyMentions(c, text, msgId) {
  if (!c || !c.isGroup || !text || text.indexOf("@") < 0 || !msgId) return;
  var candidats = (c.userIds || []).map(function (id) { return { id: id, name: (typeof _groupMemberName === "function" ? _groupMemberName(id) : "") }; });
  var ids = _idsMentionnes(text, candidats);
  if (ids.length) window._mentionsEnAttente[msgId] = { convId: c.id, ids: ids };
}
function _mentionnerApresEnvoi(msgId) {
  var m = window._mentionsEnAttente && window._mentionsEnAttente[msgId];
  if (!m) return;
  delete window._mentionsEnAttente[msgId];
  if (typeof _mentionnerServeur === "function") { try { _mentionnerServeur("message", m.convId, m.ids); } catch (e) {} }
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
  // ⚠️ AUCUNE CONNEXION TEMPS RÉEL SANS COMPTE (capacité, 2026-09-20). Un
  // visiteur atteint cet appel en ouvrant une conversation de DÉMONSTRATION,
  // qui n'a aucune ligne serveur : le canal ne lui transporterait jamais rien,
  // et il coûterait une place sur les 500 du quota. Autorité unique :
  // `connexionTempsReelAutorisee` (app-02).
  if (typeof connexionTempsReelAutorisee === "function" && !connexionTempsReelAutorisee()) return;
  if (_typingChannel) { try { supa.removeChannel(_typingChannel); } catch(e) {} _typingChannel = null; }
  // ⚠️ PRIVÉ depuis le 2026-09-11 (policy `passio_rt_recevoir` : membres de la
  // conversation seulement). `window._rtPriveIndisponible` est posé par la
  // sonnerie d'appel (app-05) quand la souscription privée est REFUSÉE — migration
  // Realtime pas encore appliquée — et l'on replie alors sur le canal public.
  _typingChannel = _creerCanalTyping(convId, window._rtPriveIndisponible !== true);
}
// ⚠️ Un identifiant de conversation encore LOCAL (créée cet instant, ligne
// serveur pas encore écrite) n'est membre de rien pour `is_conv_member` : le
// canal privé est refusé pour CETTE conversation seulement. On replie alors sur
// le canal public de cette conversation, sans toucher à la sonde globale (la
// policy existe bien, c'est l'identifiant qui n'est pas encore connu).
function _creerCanalTyping(convId, prive) {
  var chan = supa.channel("typing:" + convId, { config: { private: prive } })
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      const bar = document.getElementById("convTypingBar");
      if (bar) { bar.textContent = (payload.user || "Quelqu'un") + " est en train d'écrire…"; bar.style.display = "block"; }
      clearTimeout(bar?._hideTimer);
      if (bar) bar._hideTimer = setTimeout(() => { bar.style.display = "none"; }, 4000);
    })
    .on("broadcast", { event: "stop_typing" }, () => {
      const bar = document.getElementById("convTypingBar");
      if (bar) bar.style.display = "none";
    });
  chan.subscribe((st, err) => {
    if (!prive || st !== "CHANNEL_ERROR" || _typingChannel !== chan) return;
    if (typeof _rtRefusDePolicy === "function" && !_rtRefusDePolicy(err)) return;
    // `removeChannel` est asynchrone et `supa.channel(topic)` rend le canal
    // existant tant qu'il n'est pas parti : on recrée APRÈS le départ.
    Promise.resolve(supa.removeChannel(chan)).catch(function () {}).then(function () {
      if (_typingChannel !== chan) return;
      _typingChannel = _creerCanalTyping(convId, false);
    });
  });
  return chan;
}

// À l'ouverture d'une conversation : rien à rejoindre hors v2.
// ⚠️ PLUS DE CANAL `conv_specific:<id>` (2026-11-09, « 📴 »). La soupape v1
// (`passio_realtime_v3="0"`) y écoutait `conv_messages` par `postgres_changes`,
// filtré sur la conversation ouverte ; la migration
// `migration_realtime_public_hors_cdc_2026-11-09.sql` a vidé la publication, et
// la liaison n'aurait plus rien reçu (le serveur réessayant sa création toutes
// les 5 à 10 s, canal ouvert). Les messages arrivent à TOUS les modes sauf v2
// par `user:<moi>` (`_subscribeUserTopic`), poussés par le serveur à chaque
// membre.
function _supaConvSpecificChannel(convId, displayName) {
  if (typeof supa === "undefined" || !supa) return;
  // ⚠️ AUCUNE CONNEXION TEMPS RÉEL SANS COMPTE (capacité, 2026-09-20). Un
  // visiteur atteint cet appel en ouvrant une conversation de DÉMONSTRATION,
  // qui n'a aucune ligne serveur : le canal ne lui transporterait jamais rien,
  // et il coûterait une place sur les 500 du quota. Autorité unique :
  // `connexionTempsReelAutorisee` (app-02).
  if (typeof connexionTempsReelAutorisee === "function" && !connexionTempsReelAutorisee()) return;
  // v2 : la réception passe par le canal PRIVÉ de la conv (abonné au boot / à
  // la création). On s'assure juste qu'il existe — pas de postgres_changes.
  if (!window.PASSIO_REALTIME_V3 && window.PASSIO_REALTIME_V2) {
    if (window._subscribePrivateConv) window._subscribePrivateConv(convId);
  }
  // Sinon (v3, et la soupape v1) : le topic privé par utilisateur, abonné une
  // fois au boot, couvre déjà cette conversation.
}

function closeConversation() {
  window._openedConvId = null;
  if (_typingChannel) { try { supa.removeChannel(_typingChannel); } catch(e) {} _typingChannel = null; }
  clearTimeout(_typingTimeout);
  saveConversationsNow(); // sauvegarde immédiate en quittant
  const bar = document.getElementById("convTypingBar");
  if (bar) bar.style.display = "none";
  const fp = document.getElementById("conv-fullpage");
  const etaitOuverte = !!(fp && fp.classList.contains("active"));
  if (fp) fp.classList.remove("active");
  if (etaitOuverte && typeof releaseOverlayHistory === "function") releaseOverlayHistory();
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
