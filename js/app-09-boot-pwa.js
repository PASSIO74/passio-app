// 🔒 Le boot attend le déverrouillage de l'Access Gate (code d'accès).
// Tant que le code n'est pas validé, AUCUNE donnée n'est chargée et aucun
// écran n'est rendu — couvre URL directes, routes internes et deep links.
(window.__gateReady || Promise.resolve()).then(() => boot()).catch(e => console.error("Boot error:", e));

// ======== PWA INSTALL OVERLAY ========
// (_isIOS, _isStandalone, _pwaInstalled sont déclarés dans le <head>)

function pwaShowOverlay() {
  const ov = document.getElementById("pwa-overlay");
  if (!ov || _isStandalone) return;
  // 🔧 FIX AUDIT 2026-06-10 : ne pas re-proposer l'installation si
  // l'utilisateur a déjà fermé l'overlay dans cette session.
  try { if (sessionStorage.getItem("passio_pwa_dismissed") === "1") return; } catch (e) {}
  const lp = document.getElementById("pwaLogoImg");
  if (lp) lp.src = LOGO_SRC;
  const content = document.getElementById("pwa-content");
  if (!content) { ov.style.display = "flex"; return; }

  const APP_URL = 'https://passio-app.netlify.app/';

  // ═══ CAS 1 : Prompt natif dispo (Chrome/Edge/Samsung/Opera sur Android ou Desktop) ═══
  if (window._pwaPrompt) {
    content.innerHTML = `
      <button class="pwa-btn-install" onclick="pwaInstall()">📲&nbsp;&nbsp;Installer PASSIO</button>
      <button class="pwa-btn-skip" onclick="pwaDismiss()">Plus tard</button>`;

  // ═══ CAS 2 : iPhone/iPad sur Safari ═══
  } else if (_isIOSSafari) {
    content.innerHTML = `
      <div style="background:#f5f3ff;border-radius:16px;padding:16px;margin-bottom:14px;">
        <div style="font-weight:800;color:#1e1b4b;margin-bottom:12px;text-align:center;">📱 Installer sur iPhone / iPad</div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
          <span style="font-size:28px;">1️⃣</span>
          <span style="font-size:13px;color:#374151;">Appuie sur <strong style="color:#6d28d9;">Partager ⬆️</strong> en bas de Safari</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:28px;">2️⃣</span>
          <span style="font-size:13px;color:#374151;">Choisis <strong style="color:#6d28d9;">"Sur l'écran d'accueil"</strong> puis <strong style="color:#6d28d9;">Ajouter</strong></span>
        </div>
      </div>
      <button class="pwa-btn-skip" onclick="pwaDismiss()">Fermer</button>`;

  // ═══ CAS 3 : iPhone/iPad sur Chrome/Firefox iOS → proposer Safari ou continuer ═══
  } else if (_isIOSOther) {
    const safariUrl = APP_URL;
    content.innerHTML = `
      <div style="text-align:center;padding:8px 0 16px;">
        <div style="font-size:44px;margin-bottom:10px;">🍎</div>
        <div style="font-size:16px;font-weight:800;color:#1e1b4b;margin-bottom:8px;">Installer PASSIO</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">Sur iPhone/iPad, seul <strong>Safari</strong> peut installer les apps web.</div>
        <button class="pwa-btn-install" onclick="window.location.href='${escapeJsArg(safariUrl)}'" style="margin-bottom:10px;">
          🧭&nbsp;&nbsp;Ouvrir dans Safari pour installer
        </button>
        <button class="pwa-btn-skip" onclick="pwaDismiss()">Continuer sans installer</button>
      </div>`;

  // ═══ CAS 4 : Android sans prompt (Firefox Android) → ouvre Chrome automatiquement ═══
  } else if (_isAndroid) {
    // Tente Chrome → Edge → Samsung Internet dans l'ordre
    var ci = 'intent://' + APP_URL.replace('https://','') + '#Intent;scheme=https;package=com.android.chrome;end';
    var ei = 'intent://' + APP_URL.replace('https://','') + '#Intent;scheme=https;package=com.microsoft.emmx;end';
    var si = 'intent://' + APP_URL.replace('https://','') + '#Intent;scheme=https;package=com.sec.android.app.sbrowser;end';
    // Redirection automatique vers Chrome, fallback Edge, fallback Samsung
    content.innerHTML = `
      <div style="text-align:center;padding:8px 0 16px;">
        <div style="font-size:44px;margin-bottom:8px;">📲</div>
        <div style="font-size:16px;font-weight:800;color:#1e1b4b;margin-bottom:6px;">Ouverture en cours…</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">PASSIO s'installe automatiquement dans ton navigateur</div>
        <div class="pwa-spinner" style="margin:0 auto 16px;width:36px;height:36px;border:4px solid #ede9fe;border-top-color:#7c3aed;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        <button class="pwa-btn-skip" onclick="pwaDismiss()">Annuler</button>
      </div>`;
    ov.style.display = "flex";
    // Cascade automatique : Chrome → Edge → Samsung
    setTimeout(() => { window.location.href = ci; }, 400);
    setTimeout(() => { window.location.href = ei; }, 1800);
    setTimeout(() => { window.location.href = si; }, 3200);
    return;

  // ═══ CAS 5 : Safari macOS → guide "Ajouter au Dock" ═══
  } else if (_isSafari && _isMac) {
    content.innerHTML = `
      <div style="background:#f5f3ff;border-radius:16px;padding:16px;margin-bottom:14px;">
        <div style="font-weight:800;color:#1e1b4b;margin-bottom:12px;text-align:center;">🖥 Installer sur Mac (Safari)</div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
          <span style="font-size:26px;">1️⃣</span>
          <span style="font-size:13px;color:#374151;">Dans Safari, clique sur le menu <strong style="color:#6d28d9;">Fichier</strong></span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:26px;">2️⃣</span>
          <span style="font-size:13px;color:#374151;">Choisis <strong style="color:#6d28d9;">"Ajouter au Dock…"</strong> puis <strong style="color:#6d28d9;">Ajouter</strong></span>
        </div>
      </div>
      <button class="pwa-btn-skip" onclick="pwaDismiss()">Fermer</button>`;

  // ═══ CAS 6 : Firefox Mac → ouvre Safari automatiquement ═══
  } else if (_isFirefox && _isMac) {
    content.innerHTML = `
      <div style="text-align:center;padding:8px 0 16px;">
        <div style="font-size:44px;margin-bottom:8px;">🧭</div>
        <div style="font-size:16px;font-weight:800;color:#1e1b4b;margin-bottom:6px;">Ouverture dans Safari…</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">Safari va s'ouvrir pour installer PASSIO sur ton Mac</div>
        <div style="margin:0 auto 16px;width:36px;height:36px;border:4px solid #ede9fe;border-top-color:#7c3aed;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        <button class="pwa-btn-skip" onclick="pwaDismiss()">Annuler</button>
      </div>`;
    ov.style.display = "flex";
    setTimeout(() => { window.location.href = APP_URL.replace('https://', 'x-safari-https://'); }, 500);
    return;

  // ═══ CAS 7 : Firefox Windows → ouvre Edge (pré-installé) ═══
  } else if (_isFirefox && _isWindows) {
    content.innerHTML = `
      <div style="text-align:center;padding:8px 0 16px;">
        <div style="font-size:44px;margin-bottom:8px;">🌐</div>
        <div style="font-size:16px;font-weight:800;color:#1e1b4b;margin-bottom:6px;">Ouverture dans Edge…</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">Microsoft Edge va s'ouvrir et installer PASSIO automatiquement</div>
        <div style="margin:0 auto 16px;width:36px;height:36px;border:4px solid #ede9fe;border-top-color:#0078d4;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        <button class="pwa-btn-skip" onclick="pwaDismiss()">Annuler</button>
      </div>`;
    ov.style.display = "flex";
    setTimeout(() => { window.location.href = 'microsoft-edge:' + APP_URL; }, 500);
    return;

  // ═══ CAS 8 : Autre cas non géré ═══
  } else {
    content.innerHTML = `
      <div style="text-align:center;padding:8px 0 16px;">
        <div style="font-size:44px;margin-bottom:8px;">📲</div>
        <div style="font-size:16px;font-weight:800;color:#1e1b4b;margin-bottom:8px;">Installer PASSIO</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">Ouvre ce lien dans <strong>Chrome</strong> ou <strong>Edge</strong> pour installer l'app en 1 clic.</div>
        <button class="pwa-btn-skip" onclick="pwaDismiss()">Fermer</button>
      </div>`;
  }

  ov.style.display = "flex";
}

async function pwaInstall() {
  var APP_URL = 'https://passio-app.netlify.app/';

  // iOS Safari → guide "Partager → Sur l'écran d'accueil"
  if (_isIOSSafari) { pwaShowOverlay(); return; }

  // iOS autre navigateur → ouvre Safari
  if (_isIOSOther) { window.location.href = APP_URL; return; }

  // Firefox Android → ouvre Chrome
  if (_isAndroid && _isFirefox) {
    window.location.href = 'intent://passio-app.netlify.app/#Intent;scheme=https;package=com.android.chrome;end';
    return;
  }

  // Firefox Windows → ouvre Edge
  if (_isFirefox && _isWindows) { window.location.href = 'microsoft-edge:' + APP_URL; return; }

  // Firefox Mac → ouvre Safari
  if (_isFirefox && _isMac) { window.location.href = APP_URL.replace('https://', 'x-safari-https://'); return; }

  // Safari Mac → guide "Fichier → Ajouter au Dock"
  if (_isSafari && _isMac) { pwaShowOverlay(); return; }

  // Chrome / Edge / Samsung / Opera → prompt natif
  if (window._pwaPrompt) {
    try {
      window._pwaPrompt.prompt();
      var r = await window._pwaPrompt.userChoice;
      window._pwaPrompt = null;
      if (r.outcome === 'accepted') {
        if (typeof toast === 'function') toast('PASSIO installée ! 🎉', 'success');
        var b = document.getElementById('btn-install-app');
        if (b) b.style.display = 'none';
      }
    } catch(e) {}
    return;
  }

  // Prompt pas encore arrivé → attendre 4s
  if (_supportsPWA) {
    // LOT-21 (TRA-C20) : plus de « Installation en cours… » — rien n'est en cours,
    // on attend seulement que le navigateur propose l'installation.
    await new Promise(function(res) {
      var t = 0, iv = setInterval(function() {
        t += 300;
        if (window._pwaPrompt || t >= 4000) { clearInterval(iv); res(); }
      }, 300);
    });
    if (window._pwaPrompt) {
      try {
        window._pwaPrompt.prompt();
        var r2 = await window._pwaPrompt.userChoice;
        window._pwaPrompt = null;
        if (r2.outcome === 'accepted') {
          if (typeof toast === 'function') toast('PASSIO installée ! 🎉', 'success');
        }
      } catch(e) {}
    } else {
      pwaShowBannerInstall();
    }
    return;
  }

  pwaShowOverlay();
}

function pwaShowBannerInstall() {
  var ov = document.getElementById("pwa-overlay");
  var content = document.getElementById("pwa-content");
  if (!ov || !content) return;
  var lp = document.getElementById("pwaLogoImg");
  if (lp && typeof LOGO_SRC !== 'undefined') lp.src = LOGO_SRC;

  // LOT-21 (audit UX/UI du 2026-11-10, TRA-C20) : sur un téléphone Android, la
  // consigne parlait de l'icône ⊕ de la barre d'adresse d'un ORDINATEUR — elle
  // n'existe pas sur mobile, où l'installation est dans le menu du navigateur.
  var _android = /Android/i.test(navigator.userAgent || "");
  var name = _isEdge ? 'Edge' : _isSamsung ? 'Samsung Internet' : 'Chrome';
  var hint = _android
    ? (_isSamsung
      ? 'Touche le menu <strong>≡</strong> en bas de l\'écran, puis « Ajouter la page à » → « Écran d\'accueil ».'
      : 'Touche le menu <strong>⋮</strong> en haut à droite, puis « Installer l\'application » (ou « Ajouter à l\'écran d\'accueil »).')
    : 'Dans la barre d\'adresse, en haut à droite, clique sur l\'icône d\'installation (un écran avec une flèche), puis « Installer ».';

  content.innerHTML =
    '<div style="text-align:center;padding:4px 0 12px;">' +
    '<div style="font-size:15px;font-weight:800;color:var(--text, #1f1235);margin-bottom:10px;">Installer PASSIO avec ' + name + '</div>' +
    '<div style="background:var(--accent-tile, #f5efff);border-radius:14px;padding:14px;margin-bottom:14px;text-align:left;font-size:14px;color:var(--text, #1f1235);line-height:1.6;">' +
    hint +
    '</div>' +
    '<button class="pwa-btn-install" onclick="pwaDismiss();window.focus();" style="margin-bottom:8px;">Compris</button>' +
    '<button class="pwa-btn-skip" onclick="pwaDismiss()">Fermer</button>' +
    '</div>';
  ov.style.display = "flex";
}

function togglePwd(id, btn) {
  const inp = document.getElementById(id);
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.textContent = show ? '🙈' : '👁';
}

// ═══ BANNER HORS-LIGNE ═══
// Le SW envoie { type:"OFFLINE" } quand il sert depuis le cache faute de réseau.
// On écoute aussi les événements natifs online/offline du navigateur.
(function _setupOfflineBanner() {
  // LOT-31 (TRA-C19) : `passio-hors-ligne` sur <body> fait monter le bandeau de
  // l'équipe au-dessus de celui-ci — les deux restent lisibles.
  function showOffline() {
    var b = document.getElementById("offlineBanner");
    if (b) b.style.display = "flex";
    try { document.body.classList.add("passio-hors-ligne"); } catch (e) {}
  }
  function hideOffline() {
    var b = document.getElementById("offlineBanner");
    if (b) b.style.display = "none";
    try { document.body.classList.remove("passio-hors-ligne"); } catch (e) {}
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function(e) {
      if (e.data && e.data.type === "OFFLINE") showOffline();
      if (e.data && e.data.type === "SW_UPDATED") {
        // Page occupée (appel, Live, saisie, enregistrement, média, envoi) : la mise à
        // jour s'appliquera seule à la fin (pwa-detect.js). « Recharge pour l'appliquer »
        // inviterait à couper soi-même ce que le report vient de protéger.
        if (typeof window.passioMajDifferee === "function" && window.passioMajDifferee()) return;
        // Propose un rechargement discret quand le SW a été mis à jour
        try { toast("✨ Mise à jour disponible — recharge pour l'appliquer", "info"); } catch(_) {}
      }
    });
  }
  window.addEventListener("offline", showOffline);
  window.addEventListener("online", function() {
    hideOffline();
    // Tente de re-synchroniser les posts au retour en ligne
    try {
      if (typeof supaLoadPosts === "function" && typeof MY_UID !== "undefined" && MY_UID) {
        supaLoadPosts().then(function(posts) {
          if (posts && posts.length > 0) {
            var extra = (window._feedExtraPosts || []).filter(function(p) {
              return !posts.some(function(x) { return x.id === p.id; });
            });
            state.supabasePosts = posts.concat(extra);
            var feedEl = document.getElementById("screen-feed");
            if (feedEl && feedEl.classList.contains("active")) renderFeed();
          }
        }).catch(function() {});
      }
    } catch(_) {}
  });
})();

// ═══ Wrappers messagerie — définis ici pour être sûrement disponibles ═══
// toggleEmojiPanel, toggleAttachMenu et openConvSettings sont dans le 2ème script
// mais ces stubs garantissent qu'ils existent même si le 2ème script ne charge pas.

// ═════════════════════════════════════════════════════════════════════════════════════
// SYSTÈME D'EMOJI/GIF - VERSION UNIFIÉ & CORRIGÉ
// ═════════════════════════════════════════════════════════════════════════════════════

// Emoji database with labels for search
var EMOJI_DATA = [
  { emoji: "😀", labels: "sourire heureux joyeux grin" },
  { emoji: "😁", labels: "grand sourire dent rire" },
  { emoji: "😂", labels: "rire pleurer fou hilarant" },
  { emoji: "🤣", labels: "rire mort fou hilarant" },
  { emoji: "😃", labels: "sourire heureux joyeux yeux" },
  { emoji: "😄", labels: "sourire joie bonheur" },
  { emoji: "😅", labels: "sourire sueur nerveusement" },
  { emoji: "😆", labels: "rire amusement joie" },
  { emoji: "😉", labels: "clin oeil flirt" },
  { emoji: "😊", labels: "sourire heureux content blissful" },
  { emoji: "😇", labels: "halo saint angélique" },
  { emoji: "🥰", labels: "amour coeur adorer" },
  { emoji: "😍", labels: "coeur yeux amour adorable" },
  { emoji: "😘", labels: "bisou baiser amour" },
  { emoji: "😗", labels: "baiser lèvres amour" },
  { emoji: "😚", labels: "baiser joue amour" },
  { emoji: "😙", labels: "baiser coeur amour" },
  { emoji: "🥲", labels: "sourire douloureux triste" },
  { emoji: "😋", labels: "délicieux savoureux nourriture" },
  { emoji: "😛", labels: "langue taquiner joking" },
  { emoji: "😜", labels: "clin oeil langue joking" },
  { emoji: "🤪", labels: "fou sauvage crazy" },
  { emoji: "😌", labels: "soulagé souffle calme" },
  { emoji: "😔", labels: "triste déprimé déception" },
  { emoji: "😑", labels: "expression vide amused" },
  { emoji: "😐", labels: "neutre expression aucune" },
  { emoji: "😶", labels: "silencieux bouche silence" },
  { emoji: "😏", labels: "sourire moqueur skeptique" },
  { emoji: "😒", labels: "pas impressionné déception" },
  { emoji: "🙄", labels: "yeux roulant" },
  { emoji: "😬", labels: "malaise anxieux inquiet" },
  { emoji: "🤥", labels: "mensonge pinocchio" },
  { emoji: "😪", labels: "fatigué somnolent sommeil" },
  { emoji: "🤤", labels: "bave envie désir" },
  { emoji: "😴", labels: "dormir endormi zzz" },
  { emoji: "😷", labels: "masque malade maladie" },
  { emoji: "🤒", labels: "fièvre malade température" },
  { emoji: "🤕", labels: "bandeau blessé douleur" },
  { emoji: "🤮", labels: "vomir maladie nausée" },
  { emoji: "🤢", labels: "nausée malade envie" },
  { emoji: "🤧", labels: "atchoum éternuer nez" },
  { emoji: "❤️", labels: "coeur amour rouge love" },
  { emoji: "🧡", labels: "coeur orange" },
  { emoji: "💛", labels: "coeur jaune amitié" },
  { emoji: "💚", labels: "coeur vert nature eco" },
  { emoji: "💙", labels: "coeur bleu paix calm" },
  { emoji: "💜", labels: "coeur violet mystique" },
  { emoji: "🖤", labels: "coeur noir dark sombre" },
  { emoji: "🤍", labels: "coeur blanc pur pure" },
  { emoji: "🤎", labels: "coeur marron chocolat" },
  { emoji: "💔", labels: "coeur brisé cassé rupture" },
  { emoji: "💕", labels: "deux coeurs amour double" },
  { emoji: "💞", labels: "coeur revolution amour" },
  { emoji: "💓", labels: "coeur battant amour beat" },
  { emoji: "💗", labels: "coeur grandissant affection" },
  { emoji: "💖", labels: "coeur sparkles brillant amour" },
  { emoji: "💘", labels: "fleche amour cupidon" },
  { emoji: "💝", labels: "cadeau coeur present" },
  { emoji: "💟", labels: "coeur decoration ornament" },
  { emoji: "👋", labels: "salut main adieu wave" },
  { emoji: "🤚", labels: "main levée back" },
  { emoji: "🖐️", labels: "main ouverte cinq doigts" },
  { emoji: "✋", labels: "paume main stop arrêt" },
  { emoji: "👌", labels: "ok doigt approuver perfect" },
  { emoji: "🤌", labels: "doigt pincer italien" },
  { emoji: "✌️", labels: "victoire paix deux doigt" },
  { emoji: "🤞", labels: "doigts croisés chance" },
  { emoji: "🤟", labels: "aimer signe love hand" },
  { emoji: "🤘", labels: "cornes signe rocker metal" },
  { emoji: "🤙", labels: "appel telephone main" },
  { emoji: "👍", labels: "pouce levé ok bien super" },
  { emoji: "👎", labels: "pouce baisse non mal bad" },
  { emoji: "✊", labels: "poing poignée" },
  { emoji: "👊", labels: "poing punch coup" },
  { emoji: "🤛", labels: "poing gauche" },
  { emoji: "🤜", labels: "poing droit" },
  { emoji: "👏", labels: "applaudissement clap bravo" },
  { emoji: "🙌", labels: "mains levees celebrer" },
  { emoji: "👐", labels: "mains ouvertes welcome" },
  { emoji: "🤲", labels: "mains coupe offrir" },
  { emoji: "🤝", labels: "poignee main accord deal" },
  { emoji: "💅", labels: "ongles vernis" },
  { emoji: "👂", labels: "oreille" },
  { emoji: "👃", labels: "nez" },
  { emoji: "🧠", labels: "cerveau intelligence esprit" },
  { emoji: "🦷", labels: "dent dentiste" },
  { emoji: "🦴", labels: "os squelette" },
  { emoji: "👀", labels: "yeux voir regarder eyes" },
  { emoji: "👁️", labels: "oeil iris" },
  { emoji: "👅", labels: "langue taste gout" },
  { emoji: "👄", labels: "levre rouge bouche mouth" },
  { emoji: "🐶", labels: "chien doggy woof animal" },
  { emoji: "🐱", labels: "chat cat meow animal" },
  { emoji: "🐭", labels: "souris rat mouse" },
  { emoji: "🐹", labels: "hamster rongeur" },
  { emoji: "🐰", labels: "lapin rabbit bunny" },
  { emoji: "🦊", labels: "renard fox roux" },
  { emoji: "🐻", labels: "ours bear brun" },
  { emoji: "🐼", labels: "panda noir blanc" },
  { emoji: "🐨", labels: "koala" },
  { emoji: "🐯", labels: "tigre tiger bengal" },
  { emoji: "🦁", labels: "lion king roi" },
  { emoji: "🐮", labels: "vache cow boeuf" },
  { emoji: "🐷", labels: "cochon pig porc" },
  { emoji: "🐸", labels: "grenouille frog coasse" },
  { emoji: "🐵", labels: "singe monkey macaque" },
  { emoji: "🙈", labels: "singe silent ne voir" },
  { emoji: "🙉", labels: "singe sourd entendre" },
  { emoji: "🙊", labels: "singe sans parole silence" },
  { emoji: "🐔", labels: "poule chicken poussinn" },
  { emoji: "🐧", labels: "pingouin penguin froid" },
  { emoji: "🐦", labels: "oiseau bird vole" },
  { emoji: "🦆", labels: "canard duck quack" },
  { emoji: "🦅", labels: "aigle eagle faucon" },
  { emoji: "🦉", labels: "chouette owl hibou" },
  { emoji: "🦇", labels: "chauve-souris bat dark" },
  { emoji: "🐺", labels: "loup wolf gris howl" },
  { emoji: "🐗", labels: "sanglier wild boar" },
  { emoji: "🐴", labels: "cheval horse yeigh" },
  { emoji: "🦄", labels: "licorne unicorn magique" },
  { emoji: "🐝", labels: "abeille bee honey" },
  { emoji: "🐛", labels: "insecte bug crawl" },
  { emoji: "🦋", labels: "papillon butterfly voler" },
  { emoji: "🐌", labels: "escargot snail slow" },
  { emoji: "🐢", labels: "tortue turtle lent" },
  { emoji: "🐍", labels: "serpent snake reptile" },
  { emoji: "🐙", labels: "pieuvre octopus tentacule" },
  { emoji: "🦑", labels: "calmar squid mer" },
  { emoji: "🐠", labels: "poisson fish nage" },
  { emoji: "🐟", labels: "poisson bleu nage" },
  { emoji: "🐬", labels: "dauphin dolphin smart" },
  { emoji: "🐳", labels: "baleine whale geant" },
  { emoji: "🦈", labels: "requin shark dent" },
  { emoji: "🍕", labels: "pizza fromage tomate" },
  { emoji: "🍔", labels: "burger hamburger viande" },
  { emoji: "🍟", labels: "frite pomme terre" },
  { emoji: "🍗", labels: "aile poulet fried" },
  { emoji: "🌭", labels: "hot dog saucisse" },
  { emoji: "🌮", labels: "taco mexicain" },
  { emoji: "🌯", labels: "burrito wrap" },
  { emoji: "🥪", labels: "sandwich sandwich pain" },
  { emoji: "🍳", labels: "oeuf scramble petit dej" },
  { emoji: "🍲", labels: "soupe pot chaud" },
  { emoji: "🍛", labels: "curry rice plat chaud" },
  { emoji: "🍜", labels: "nouilles ramen noodle asie" },
  { emoji: "🍝", labels: "pates spaghetti pasta" },
  { emoji: "🍱", labels: "bento box japanese" },
  { emoji: "🍣", labels: "sushi japanese poisson" },
  { emoji: "🍰", labels: "gateau cake dessert sucre" },
  { emoji: "🎂", labels: "gateau anniversaire candles" },
  { emoji: "🧁", labels: "cupcake gateau petit sucre" },
  { emoji: "🍪", labels: "biscuit cookie sucre" },
  { emoji: "🍩", labels: "donut hole sucre" },
  { emoji: "🍫", labels: "chocolat chocolate brun sucre" },
  { emoji: "☕", labels: "cafe coffee noir chaud" },
  { emoji: "🍵", labels: "the tea breuvage chaud" },
  { emoji: "🍶", labels: "sake japanese alcool" },
  { emoji: "🍾", labels: "champagne alcool celebration" },
  { emoji: "🍷", labels: "vin rouge wine alcool" },
  { emoji: "🍺", labels: "biere beer alcool mousse" },
  { emoji: "🍻", labels: "biere toast cheers" },
  { emoji: "⚽", labels: "football soccer ball sport" },
  { emoji: "🏀", labels: "basketball ballon sport" },
  { emoji: "🎾", labels: "tennis raquette sport" },
  { emoji: "⚾", labels: "baseball balle sport" },
  { emoji: "🎱", labels: "billard boule noir" },
  { emoji: "🎯", labels: "cible but target" },
  { emoji: "🎳", labels: "bowling quille sport" },
  { emoji: "🎮", labels: "video game jeu controle" },
  { emoji: "🎬", labels: "clapper film cine movie" },
  { emoji: "🎤", labels: "micro chant music chanson" },
  { emoji: "🎧", labels: "casque audio music" },
  { emoji: "🎼", labels: "musique note portee" },
  { emoji: "🎹", labels: "piano music instrument" },
  { emoji: "🎷", labels: "saxophone jazz music" },
  { emoji: "🎺", labels: "trompette trumpet music" },
  { emoji: "🎸", labels: "guitare guitar music rock" },
  { emoji: "🥁", labels: "batterie drum drums music" },
  { emoji: "🚗", labels: "voiture car auto rouge" },
  { emoji: "🚕", labels: "taxi cab yellow" },
  { emoji: "🚙", labels: "jeep suv haut" },
  { emoji: "🚌", labels: "bus autobus transport" },
  { emoji: "🚎", labels: "trolleybus bus bleu" },
  { emoji: "🏎️", labels: "course car fast rapide" },
  { emoji: "✈️", labels: "avion airplane fly travel" },
  { emoji: "🛫", labels: "avion decollage takeoff" },
  { emoji: "🛬", labels: "avion atterissage landing" },
  { emoji: "🚀", labels: "fusee rocket espace cosmos" },
  { emoji: "⛵", labels: "voile sailing bateau mer" },
  { emoji: "🛳️", labels: "bateau ship cruise" },
  { emoji: "🎁", labels: "cadeau present gift celebration" },
  { emoji: "🎀", labels: "noeud ruban ribbon" },
  { emoji: "🎈", labels: "ballon party celebration" },
  { emoji: "🎉", labels: "confetti celebration party" },
  { emoji: "🎊", labels: "confetti ball celebration" },
  { emoji: "✉️", labels: "lettre email message" },
  { emoji: "📧", labels: "email letter message" },
  { emoji: "📝", labels: "bloc note notepad memo" },
  { emoji: "📁", labels: "dossier folder file" },
  { emoji: "📅", labels: "calendrier calendar date" },
  { emoji: "📌", labels: "punaise pushpin pin" },
  { emoji: "📍", labels: "pin location place" },
  { emoji: "🔒", labels: "cadenas lock secure" },
  { emoji: "🔓", labels: "cadenas open deverrouille" },
  { emoji: "🔑", labels: "clef key ouvre" },
  { emoji: "⚙️", labels: "roue gear setting" },
  { emoji: "🔧", labels: "clef wrench outil" },
  { emoji: "🔨", labels: "marteau hammer outil" },
  { emoji: "🛠️", labels: "marteau wrench outils" },
  { emoji: "💐", labels: "bouquet fleur flower" },
  { emoji: "🌹", labels: "rose rouge flower amour" },
  { emoji: "🌺", labels: "hibiscus tropical flower" },
  { emoji: "🌻", labels: "tournesol sunflower yellow" },
  { emoji: "🌼", labels: "fleur daisy flower" },
  { emoji: "🌷", labels: "tulipe tulip flower" },
  { emoji: "🌱", labels: "pousse seedling plant grow" },
  { emoji: "🌲", labels: "sapin evergreen tree forest" },
  { emoji: "🌳", labels: "arbre tree nature forest" },
  { emoji: "🌴", labels: "palmier palm tree tropical" },
  { emoji: "☀️", labels: "soleil sun sunny bright" },
  { emoji: "⛅", labels: "nuage cloud sunny sky" },
  { emoji: "🌤️", labels: "soleil nuage mostly sunny" },
  { emoji: "🌈", labels: "arc en ciel rainbow colorful" },
  { emoji: "☔", labels: "parapluie umbrella rain" },
  { emoji: "⭐", labels: "etoile star gold bright" },
  { emoji: "🌟", labels: "etoile star glow sparkle" },
  { emoji: "✨", labels: "etincelle sparkle magic shine" },
  { emoji: "⚡", labels: "foudre lightning thunder" },
  { emoji: "💥", labels: "explosion boom bang crash" },
  { emoji: "🔥", labels: "feu fire hot burn" }
];

// Create simpler emoji array for direct use
var EMOJIS = EMOJI_DATA.map(e => e.emoji);

// Search emojis by query
function _onEmojiSearch(query) {
  var grid = document.getElementById("emojiGrid");
  if (!grid) return;

  var q = query.toLowerCase().trim();
  var results = q ? EMOJI_DATA.filter(function(e) {
    return e.labels.includes(q);
  }).map(function(e) { return e.emoji; }) : EMOJIS;

  grid.innerHTML = "";
  if (results.length === 0) {
    grid.innerHTML = '<div style="grid-column:span 8;padding:20px;text-align:center;color:var(--muted);font-size:12px;">Aucun emoji trouvé</div>';
    return;
  }

  results.forEach(function(emoji) { grid.appendChild(_caseEmoji(emoji)); });
}

// Populate emoji grid
function _populateEmojiGrid() {
  var grid = document.getElementById("emojiGrid");
  if (!grid) return; // panel pas encore ouvert — appelé de nouveau à l'ouverture

  grid.innerHTML = "";

  if (typeof EMOJIS === 'undefined' || !Array.isArray(EMOJIS)) {
    grid.innerHTML = '<div style="grid-column:span 8;padding:20px;text-align:center;color:var(--muted);font-size:12px;">Emojis indisponibles</div>';
    return;
  }

  // Remplir avec tous les emojis
  EMOJIS.forEach(function(emoji) { grid.appendChild(_caseEmoji(emoji)); });
}

// LOT-37 (audit UX/UI du 2026-11-10, MSG-C70) : une case est un BOUTON de 44 px
// (huit colonnes), nommé par son emoji ; elle n'est jamais un demi-caractère.
function _caseEmoji(emoji) {
  var b = document.createElement("button");
  b.type = "button";
  b.className = "emoji-item";
  b.textContent = emoji;
  b.setAttribute("aria-label", emoji);
  b.onclick = function() { insertEmoji(emoji); };
  return b;
}

// Call on page load - avec délai pour garantir que le DOM est chargé
setTimeout(function() {
  _populateEmojiGrid();
}, 100);

// Insert emoji into message input
function insertEmoji(e) {
  try {
    var inp = document.getElementById("convFpInput");
    if (!inp) return;
    var start = inp.selectionStart != null ? inp.selectionStart : inp.value.length;
    var end = inp.selectionEnd != null ? inp.selectionEnd : inp.value.length;
    inp.value = inp.value.slice(0, start) + e + inp.value.slice(end);
    // LOT-37 (MSG-C70) : le panneau RESTE ouvert — on choisit souvent plusieurs
    // emojis de suite ; il se ferme à l'envoi, au bouton ou en touchant ailleurs.
    // Sur un écran tactile, le champ ne prend pas le focus : le clavier
    // recouvrirait le panneau. Le curseur se compte en unités UTF-16 (celles de
    // setSelectionRange) : compter les points de code le plaçait AU MILIEU de
    // l'emoji suivant.
    var tactile = false;
    try { tactile = window.matchMedia && window.matchMedia("(pointer: coarse)").matches; } catch(_) {}
    if (!tactile) inp.focus();
    var pos = start + e.length;
    try { inp.setSelectionRange(pos, pos); } catch(_) {}
    if (typeof autoResizeTextarea === "function") autoResizeTextarea(inp);
  } catch(err) { console.error("insertEmoji:", err); }
}

// Fermer le panel emoji
function _closeEmojiPanel() {
  var p = document.getElementById("convEmojiPanel");
  if(p && p.classList.contains("open")) {
    p.classList.remove("open");
    var btn = document.getElementById("btnEmoji");
    if(btn) btn.classList.remove("active");
  }
}

// Send GIF to conversation
function _sendGif(gifUrl) {
  try {
    _diag("_sendGif: Envoi GIF: " + gifUrl.substring(0, 50) + "...");
    _closeEmojiPanel();
    var fp = document.getElementById("conv-fullpage");
    if (!fp) {
      _diag("_sendGif: conv-fullpage NOT FOUND");
      return;
    }
    var convId = fp.getAttribute("data-conv-id");
    var displayName = fp.getAttribute("data-display-name");
    if (!convId) {
      _diag("_sendGif: convId NOT FOUND");
      return;
    }
    _diag("_sendGif: convId=" + convId);

    // Mêmes portes que le texte (`sendMessageFp`) : un visiteur est invité à créer
    // son compte, une conversation de démonstration n'envoie rien.
    if (window.requireAuthentication && !requireAuthentication("message")) return;
    var convs = getConversations();
    var c = convs.find(x => x.id === convId);
    if (!c) {
      _diag("_sendGif: Conversation NOT FOUND");
      return;
    }
    if (typeof _estConvDemo === "function" && _estConvDemo(c)) { toast("Conversation de démonstration — écris à un vrai membre depuis son profil"); return; }

    var msgId = "msg_" + uid();
    var contentJson = JSON.stringify({type: "gif", url: gifUrl, text: "🎬 GIF"});
    if (!c.messages) c.messages = [];
    // ⚠️ LOT-1 (audit UX/UI du 2026-11-10, MSG-C57) : le GIF partait par un INSERT
    // à part, sans statut, dont l'échec n'était que journalisé — il restait affiché
    // « 18:48 ✓ » alors que la base n'avait rien (mesuré, panne 500 programmée).
    // Il passe désormais par le chemin COMMUN du texte (`_sendTextToSupa`) :
    // « envoi… », échec visible, file hors ligne, « réessayer ». `envoi` garde le
    // contenu exact pour qu'un renvoi reparte en GIF, pas en message vide.
    c.messages.push({ id: msgId, from: "me", text: "", gif: gifUrl, at: Date.now(), status: "sending", de: (typeof _fileProprietaire === "function" ? _fileProprietaire() : null), envoi: contentJson });
    c.lastAt = Date.now();
    saveConversations();

    if (typeof renderConvFpThread === "function") renderConvFpThread(c, displayName);
    if (typeof renderMessages === "function") renderMessages();

    _sendTextToSupa(convId, msgId, _withSenderMeta(contentJson));
  } catch(err) {
    _diag("_sendGif: EXCEPTION - " + err.message);
    console.error("_sendGif:", err);
  }
}

function toggleAttachMenu() {
  try {
    var menu = document.getElementById("convAttachMenu");
    if (!menu) return;
    var isOpen = menu.classList.contains("open");

    // Fermer emoji si ouvert
    document.getElementById("convEmojiPanel")?.classList.remove("open");
    document.getElementById("btnEmoji")?.classList.remove("active");

    menu.classList.toggle("open", !isOpen);
    document.getElementById("btnAttach")?.classList.toggle("active", !isOpen);
  } catch(e) {
    console.error("toggleAttachMenu:", e);
  }
}

// Pièces jointes functions
function triggerAttach(type) {
  var ids = { image: "attachImageFile", doc: "attachDocFile", audio: "attachAudioFile" };
  var input = document.getElementById(ids[type]);
  if(input) {
    input.click();
    // Fermer le menu après 300ms
    setTimeout(function() {
      var menu = document.getElementById("convAttachMenu");
      if(menu && menu.classList.contains("open")) {
        menu.classList.remove("open");
        var btn = document.getElementById("btnAttach");
        if(btn) btn.classList.remove("active");
      }
    }, 300);
  }
}

// ⚠️ `passioCompressImage` N'EST DÉFINIE QU'UNE FOIS : `window.passioCompressImage`,
// dans app-06 (WebP si le navigateur sait l'encoder, sinon JPEG ; 1600 px, 0,82).
// Une seconde définition vivait ici depuis le 2026-06-24 (`function`, JPEG seul,
// 1280 px, 0,72 — ajoutée en croyant la fonction « fantôme »). Avec l'ancien
// monolithe `app.js`, la déclaration était hissée en tête puis ÉCRASÉE par
// l'affectation d'app-06 : la production a toujours tourné sur celle d'app-06, le
// développement (9 balises) sur celle-ci. Le bloc app sortant désormais en 9 scripts
// (2026-11-09, PR #801), celle-ci aurait gagné en production aussi — des photos plus
// lourdes, sans un signal. Retirée ; `scripts/audit-globals.js` refuse désormais une
// affectation `window.X =` face à une `function X` d'un autre fichier du bloc.

// Reconnaît une vidéo par son type MIME, et à défaut par l'extension du nom :
// certains sélecteurs Android rendent un `type` vide. Seule autorité des portes
// qui trient image/vidéo — la recopier les ferait diverger.
function _passioEstVideo(file) {
  if (!file) return false;
  if ((file.type || "").indexOf("video/") === 0) return true;
  if (file.type) return false;              // un type présent et non-vidéo fait foi
  return /\.(mp4|mov|m4v|webm|mkv|3gp|avi)$/i.test(file.name || "");
}

// Convertit un data URL en File (ré-injection d'un média traité).
//
// ⚠️ LE TYPE ET L'EXTENSION VIENNENT DU DATA URL, JAMAIS D'UNE CONSTANTE.
// Cette fonction forçait `image/jpeg` + `.jpg` EN DUR, ce qui était juste tant
// qu'elle ne servait qu'à ré-injecter une image compressée — son seul appelant.
// Le lot « capacité » du 2026-09-19 lui a branché la VIDÉO (la troisième porte,
// juste en dessous) et a ainsi cassé l'envoi de vidéo en messagerie DE BOUT EN
// BOUT, sans lever la moindre erreur :
//   · `_processAttach` teste `file.type.startsWith("video/")`, devenu FAUX, donc
//     la vidéo partait en `msg.img` — vignette cassée chez l'expéditeur ;
//   · le blob déposé dans le seau `attachments` portait `image/jpeg` avec un
//     `cacheControl` d'un an — mauvais content-type figé pour un an ;
//   · `content.fileType` disait « image » au destinataire (`app-04`, branche
//     `d.fileType.indexOf("video/")`), qui recevait une image cassée, pour
//     toujours.
// Avant le lot, le `File` brut passait tel quel et `file.type` valait
// `video/mp4` : le chemin FONCTIONNAIT. C'est donc une régression complète
// introduite par un correctif — la faute de famille à chercher en premier quand
// un lot réutilise un helper écrit pour un autre média.
// ⚠️ Et le verrou du lot était VERT dessus : il n'assertait que la TAILLE du
// fichier traité. **Un verrou qui mesure la taille ne mesure pas le type.**
var _PASSIO_EXT_MEDIA = {
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "video/x-matroska": "mkv", "video/3gpp": "3gp",
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"
};
function _passioDataUrlToFile(durl, name) {
  var parts = String(durl || "").split(",");
  // `data:<mime>;base64` → le mime est entre les deux-points et le premier `;`.
  var mime = (/^data:([^;,]+)/.exec(parts[0]) || [])[1] || "application/octet-stream";
  var bstr = atob(parts[1]);
  var u8 = new Uint8Array(bstr.length);
  for (var i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
  // Extension : la table d'abord, sinon le sous-type du mime (`video/avi` → avi),
  // sinon `bin`. Jamais l'extension d'ORIGINE : le contenu a pu être transcodé
  // (webm → mp4), et un `.webm` portant du mp4 est le même mensonge à l'envers.
  var ext = _PASSIO_EXT_MEDIA[mime] || (mime.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "bin";
  var base = (name || "media").replace(/\.[^.]+$/, "");
  return new File([u8], base + "." + ext, { type: mime });
}

// ═══════════════════════════════════════════════════════════════════════════
// PIÈCE JOINTE — LE DÉPÔT A UN VERDICT, UNE FILE ET UN « RÉESSAYER » (2026-11-07)
// ───────────────────────────────────────────────────────────────────────────
// ⚠️ LE REPLI SUR LA DATA URL ÉTAIT UN ÉCHEC SILENCIEUX, ET IL DÉTRUISAIT LE MÉDIA.
// `_processAttach` et `_sendVoiceMessage` appelaient, sur un dépôt Storage en échec
// (refus OU coupure), `sendMessageToSupabase(…, dataUrl, …)`. La garde de cette
// dernière retirait bien le base64 (mesuré en production le 2026-11-07 : 0 ligne
// `conv_messages` porte une data URL sur 88), mais insérait à la place « 📎 … (non
// synchronisé) » et marquait le message ENVOYÉ. Trois conséquences, aucune visible :
//   · le destinataire ne recevait qu'une étiquette, jamais le média ;
//   · chez l'auteur, la relecture du fil à la prochaine ouverture REMPLACE la copie
//     locale par la ligne du serveur (`_fusionnerMessagesServeur`) : la photo de
//     l'auteur devenait l'étiquette — le média était perdu pour tout le monde ;
//   · hors ligne, l'étiquette partait en file (`_outboxAdd`) et c'est ELLE que le
//     retour du réseau envoyait : une coupure n'était jamais rattrapée.
// Rien n'en remontait au pilotage : `_diag` n'écrit qu'en mode debug.
//
// LA RÈGLE, désormais, pour toute pièce jointe (photo, vidéo, document, audio, vocal) :
//   · le message porte `status: "sending"` dès la bulle (🕓), `de` (le compte RÉEL
//     qui l'a écrit, AUTH-06) et `pj` — de quoi le redéposer depuis SA copie locale ;
//   · coupure réseau (`estEchecReseau`, seule autorité) → échec affiché ET file
//     `passio_pj_outbox_v1`, rejouée par `_flushOutbox` (démarrage, retour du
//     réseau) ; le chemin de l'objet est FIXÉ au premier essai : un renvoi après une
//     réponse perdue retrouve l'objet déjà là (409) au lieu d'en déposer un second ;
//   · refus réel → échec affiché, toast, aucun rejeu automatique ; « réessayer »
//     (`_retryMsg`) redépose depuis la copie locale ;
//   · toute issue manquée remonte (`tel.error`, action `piece_jointe_depot`) ;
//   · jamais de base64 vers `conv_messages`, sous aucune forme.
// La file est À PART de `passio_outbox_v1`, délibérément : une entrée sans contenu
// y serait insérée telle quelle par un client plus ancien (retour arrière Netlify).
// Verrou : tests/e2e/piece-jointe-depot-echec.spec.js.
var PJ_OUTBOX_KEY = "passio_pj_outbox_v1";
// Un dépôt de `msgId` à la fois (même raison que `_msgEnVol`, ROB-06) : le
// démarrage, le retour du réseau et « réessayer » peuvent se croiser.
var _pjEnVol = {};

function _pjFileLire() {
  try { var a = JSON.parse(localStorage.getItem(PJ_OUTBOX_KEY) || "[]"); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
function _pjFileEcrire(a) { try { localStorage.setItem(PJ_OUTBOX_KEY, JSON.stringify(a)); } catch (e) {} }
function _pjFileRetirer(msgId) {
  var a = _pjFileLire();
  var reste = a.filter(function (x) { return x && x.msgId !== msgId; });
  if (reste.length !== a.length) _pjFileEcrire(reste);
}
// `owner` est le compte RÉEL capturé À L'ORIGINE de l'envoi, jamais relu ici
// (ASTRA-21) ; `contexte` ({ generation, auteur }) périme une réponse revenue après
// une purge ou un changement de compte (ASTRA-43). Sans propriétaire, RIEN n'est
// écrit : une entrée qui ne sait pas à qui elle appartient ne se rejoue pas.
function _pjFileAjouter(convId, msgId, owner, contexte) {
  if (!owner) return false;
  if (typeof _outboxContextePerime === "function" && _outboxContextePerime(contexte)) {
    try { if (typeof diagLog === "function") diagLog("pj_file_perimee " + String(msgId)); } catch (e) {}
    return false;
  }
  var tous = _pjFileLire();
  // Le compteur d'essais SURVIT à la remise en file, sinon le plafond ne borne rien.
  var ancienne = tous.find(function (x) { return x && x.msgId === msgId; });
  var a = tous.filter(function (x) { return x && x.msgId !== msgId; });
  a.push({ convId: convId, msgId: msgId, owner: owner, at: Date.now(), essais: Number((ancienne && ancienne.essais) || 0) });
  _pjFileEcrire(a);
  return true;
}

// La bulle `msgId`, `null` si elle n'est pas (ou plus) dans les conversations, et
// `undefined` si la lecture a levé : une erreur ne doit jamais se lire « message
// disparu » — ce serait vider la file en silence.
function _pjMessage(convId, msgId) {
  try {
    var c = (getConversations() || []).find(function (x) { return x.id === convId; });
    return c ? ((c.messages || []).find(function (x) { return x.id === msgId; }) || null) : null;
  } catch (e) {
    try { if (typeof diagLog === "function") diagLog("pj_lecture KO " + String((e && e.message) || e).slice(0, 80)); } catch (_) {}
    return undefined;
  }
}
// « Supprimé pour moi / pour tous » pose une PIERRE TOMBALE (`convTombAdd("msg", …)`,
// app-04) : c'est elle, et elle seule, qui dit qu'une bulle absente a été VOULUE
// absente. Une bulle simplement introuvable (conversation réécrite, cache perdu)
// n'autorise ni à retirer un objet déposé ni à taire l'envoi.
function _pjSupprimee(msgId) {
  try { return typeof convTombHas === "function" && typeof convTombLoad === "function" && convTombHas(convTombLoad(), "msg", msgId); }
  catch (e) { return false; }
}
function _pjEstDataUrl(v) { return typeof v === "string" && /^data:/i.test(v); }
// La copie LOCALE du média, seule source d'un dépôt : champ et data URL, ou null.
function _pjCopieLocale(m) {
  if (!m) return null;
  var champs = ["img", "video", "voiceData", "docData"];
  for (var i = 0; i < champs.length; i++) if (_pjEstDataUrl(m[champs[i]])) return { champ: champs[i], donnees: m[champs[i]] };
  return null;
}
// data URL → Blob. Coupé sur « ;base64, », jamais sur la première virgule : un mime
// « video/webm;codecs=vp8,opus » en porte une (même piège qu'app-08).
function _pjBlob(dataUrl, type) {
  var s = String(dataUrl || "");
  var i = s.indexOf(";base64,");
  if (i === -1) return null;
  var mime = type || (/^data:([^;,]+)/i.exec(s) || [])[1] || "application/octet-stream";
  var bstr = atob(s.slice(i + 8));
  var u8 = new Uint8Array(bstr.length);
  for (var k = 0; k < bstr.length; k++) u8[k] = bstr.charCodeAt(k);
  return new Blob([u8], { type: mime });
}
// Chemin d'objet : `attachments/<conv>/<horodatage>_<aléa>_<nom>` — la policy
// d'écriture lit le 2ᵉ segment (`storage_chemin_autorise`, membre de la conv).
// L'aléa rend le chemin PROPRE à ce message : c'est ce qui permet de lire un 409
// au renvoi comme « déjà déposé par moi ».
function _pjCheminNeuf(convId, nom) {
  return "attachments/" + convId + "/" + Date.now() + "_" + Math.random().toString(36).substr(2, 9) + "_" +
    String(nom || "fichier").replace(/[^a-zA-Z0-9._-]/g, "_");
}
function _pjDejaDeposee(err) {
  if (!err) return false;
  var st = Number(err.status) || Number(err.statusCode) || 0;
  return st === 409 || String(err.statusCode || "") === "409" ||
    /already exists|duplicate/i.test(String(err.error || "") + " " + String(err.message || ""));
}
// Code FERMÉ de l'échec (jamais le libellé du serveur : il peut porter le nom du fichier).
function _pjCodeEchec(err, reseau) {
  if (reseau) return "reseau";
  var st = Number(err && err.status) || Number(err && err.statusCode) || 0;
  if (st === 413 || /too large|maximum allowed size/i.test(String((err && err.message) || ""))) return "trop_lourd";
  if (st === 429) return "limite";
  if (st === 401 || st === 403) return "refus";
  if (st >= 500) return "serveur";
  return st ? "http_" + st : "sans_code";
}
// L'enveloppe `content` d'une pièce jointe DÉJÀ déposée — la même, au champ près,
// que celle que construit `sendMessageToSupabase` (et `_withSenderMeta`).
function _pjContenu(pj, url) {
  var brut = JSON.stringify({ type: pj.kind, filename: pj.nom, fileType: pj.type, url: url, text: "[" + String(pj.kind || "").toUpperCase() + "] " + pj.nom });
  return (typeof _withSenderMeta === "function") ? _withSenderMeta(brut) : brut;
}
// Au pilotage : une coupure ou une limite atteinte est un AVERTISSEMENT (l'appareil,
// pas notre code) ; tout autre refus est une ERREUR. Aucun nom de fichier, aucun
// libellé serveur : un code fermé, un statut, le type et la voie.
function _pjSignaler(o) {
  try {
    if (!window.tel || !tel.error) return;
    var rc = o.rc || "sans_code";
    tel.error(new Error("piece_jointe_depot " + rc), {
      action: "piece_jointe_depot",
      severity: (rc === "reseau" || rc === "limite" || rc === "trop_lourd") ? "warn" : "error",
      meta: { rc: rc, http: Number(o.http) || 0, kind: String(o.kind || ""), voie: String(o.voie || "premier"), essai: Number(o.essai) || 0, ko: Number(o.ko) || 0 },
    });
  } catch (e) {}
}
// L'échec d'un dépôt : l'optimiste est défait (« réessayer »), la coupure part en
// file, le refus se dit — et le pilotage le sait.
function _pjEchec(convId, msgId, o) {
  try { if (typeof _setMsgStatus === "function") _setMsgStatus(convId, msgId, "failed"); } catch (e) {}
  var enFile = false;
  if (o.reseau) enFile = _pjFileAjouter(convId, msgId, o.proprietaire, o.contexte);
  else _pjFileRetirer(msgId);
  // L'entrée en file ne vaut que si la copie locale est écrite : tout de suite, pas
  // dans 250 ms (`saveConversations` est différé) — une coupure hors ligne conclut
  // dans la même seconde que la bulle, et un rechargement entre les deux laisserait
  // une file qui désigne un message jamais enregistré.
  if (enFile) { try { if (typeof saveConversationsNow === "function") saveConversationsNow(); } catch (e) {} }
  // ⚠️ Une coupure ne se signale qu'au PREMIER essai (ou à « réessayer »), jamais à
  // chaque rejeu de la file : `sante.erreursJs15` compte les `warn` (rouge à 10 en
  // 15 min), et un téléphone sur un réseau instable en rejouerait jusqu'à dix par
  // pièce jointe (revue audit-passio du 2026-11-07).
  if (!(o.reseau && o.voie === "rejeu")) _pjSignaler(o);
  try { if (typeof diagLog === "function") diagLog("pj_depot " + o.rc + (enFile ? " en_file" : "")); } catch (e) {}
  try {
    if (o.reseau && enFile) { if (o.interactif) toast("📶 Pas de réseau — la pièce jointe partira à la reconnexion"); }
    else if (o.rc === "trop_lourd") toast("⚠️ Fichier trop lourd pour être envoyé (50 Mo max)");
    else if (o.rc === "illisible") toast("⚠️ Pièce jointe introuvable sur cet appareil — joins-la de nouveau");
    else if (o.interactif || !o.reseau) toast("⚠️ Pièce jointe non envoyée — touche « réessayer »");
  } catch (e) {}
}

// Dépose le média du message `msgId` depuis sa copie locale, puis insère le message
// (`sendMessageToSupabase`, qui a son propre verdict et sa propre file).
// `o.voie` : « premier », « rejeu » (file), « manuel » (« réessayer ») ;
// `o.interactif` : la personne vient d'agir ; `o.proprietaire` / `o.contexte` :
// capturés à l'ORIGINE (ASTRA-21/43). Rend une promesse réglée au verdict.
function _pjDeposer(convId, msgId, o) {
  o = o || {};
  var m = _pjMessage(convId, msgId);
  // Lecture en erreur : on ne conclut rien, l'entrée de file reste pour le tour suivant.
  if (m === undefined) return Promise.resolve(false);
  var voie = o.voie || "premier";
  if (!m || !m.pj) {
    _pjFileRetirer(msgId);
    // Supprimée exprès (pierre tombale) : rien à envoyer. Sinon, la copie est PERDUE
    // et l'envoi n'aura pas lieu : le pilotage doit le savoir.
    if (!_pjSupprimee(msgId)) _pjSignaler({ rc: "copie_perdue", http: 0, kind: "", voie: voie, essai: 0, ko: 0 });
    try { if (typeof diagLog === "function") diagLog("pj_bulle_absente " + String(msgId)); } catch (e) {}
    return Promise.resolve(false);
  }
  var pj = m.pj;
  var contexte = o.contexte || {
    generation: (typeof _outboxGenerationActuelle === "function") ? _outboxGenerationActuelle() : null,
    auteur: (typeof MY_UID !== "undefined") ? MY_UID : null,
  };
  var proprietaire = (o.proprietaire !== undefined) ? o.proprietaire : ((typeof _fileProprietaire === "function") ? _fileProprietaire() : null);
  // Déjà déposée (l'insertion avait échoué, ou l'application a été tuée pendant
  // elle) : seule la LIGNE repart, jamais un second objet. Par `_sendTextToSupa`,
  // qui porte ce qu'il faut à un renvoi : un seul envoi en vol par message (ROB-06)
  // et, sur 23505, la preuve que la ligne est déjà là (`_conflitClePrimaire`) —
  // `sendMessageToSupabase` n'a ni l'un ni l'autre (revue audit-passio).
  if (pj.url) {
    _pjFileRetirer(msgId);
    try { if (typeof _setMsgStatus === "function") _setMsgStatus(convId, msgId, "sending"); } catch (e) {}
    if (typeof _sendTextToSupa === "function") _sendTextToSupa(convId, msgId, _pjContenu(pj, pj.url), m.de || proprietaire || undefined);
    else sendMessageToSupabase(msgId, convId, pj.url, pj.type, pj.nom, pj.kind);
    return Promise.resolve(true);
  }
  if (_pjEnVol[msgId]) return Promise.resolve(false);
  var base = { kind: pj.kind, voie: voie, interactif: !!o.interactif, proprietaire: proprietaire, contexte: contexte, essai: Number(pj.tentatives) || 0, ko: 0 };
  var copie = _pjCopieLocale(m);
  var blob = null;
  try { blob = copie ? _pjBlob(copie.donnees, pj.type) : null; } catch (e) { blob = null; }
  if (!blob) {
    // La copie locale manque ou ne se lit plus : rien à déposer, rien à rejouer.
    _pjEchec(convId, msgId, Object.assign(base, { reseau: false, rc: "illisible", http: 0 }));
    return Promise.resolve(false);
  }
  base.ko = Math.round(blob.size / 1024);
  // Sans client réel (SDK pas chargé) ou sans réseau, l'appareil ne joindra pas le
  // serveur : c'est une coupure, pas un refus — en file.
  var horsLigne = (typeof navigator !== "undefined" && navigator && navigator.onLine === false);
  if (typeof supa === "undefined" || !supa || !window._supaReal || horsLigne) {
    _pjEchec(convId, msgId, Object.assign(base, { reseau: true, rc: "reseau", http: 0 }));
    return Promise.resolve(false);
  }
  // LOT-43 (MSG-C22) : un brouillon devient une conversation AVANT le dépôt ;
  // un refus est une coupure (en file, comme sans réseau).
  if (typeof _convBrouillon === "function" && _convBrouillon(convId)) {
    return _materialiserConv(convId).then(function (ok) {
      if (!ok) { _pjEchec(convId, msgId, Object.assign(base, { reseau: true, rc: "reseau", http: 0 })); return false; }
      return _pjDeposer(convId, msgId, o);
    });
  }
  _pjEnVol[msgId] = true;
  // Une mise à jour attend ce dépôt (pwa-detect.js) : la copie n'est sûre qu'une
  // fois l'objet chez Storage ou l'entrée en file.
  var finEnvoi = _envoiCommence();
  pj.tentatives = (Number(pj.tentatives) || 0) + 1;
  base.essai = pj.tentatives;
  try { if (typeof _setMsgStatus === "function") _setMsgStatus(convId, msgId, "sending"); } catch (e) {}
  function conclure(ok, err) {
    delete _pjEnVol[msgId];
    try {
      // ⚠️ La réponse d'un dépôt parti sous A ne s'écrit jamais sous B, ni après une
      // purge : ni message inséré, ni file repeuplée (ASTRA-21/43).
      if (typeof _outboxContextePerime === "function" && _outboxContextePerime(contexte)) {
        try { if (typeof _setMsgStatus === "function") _setMsgStatus(convId, msgId, "failed"); } catch (e) {}
        try { if (typeof diagLog === "function") diagLog("pj_reponse_perimee " + String(msgId)); } catch (e) {}
        return false;
      }
      if (!ok) {
        var reseau = (typeof estEchecReseau === "function") && estEchecReseau(err);
        var http = Number(err && err.status) || Number(err && err.statusCode) || 0;
        var rc = _pjCodeEchec(err, reseau);
        // Comme le chemin TEXTE (`_sendTextToSupa`) : la policy du seau exige d'être
        // membre de la conversation (`storage_chemin_autorise`), et une conversation
        // sans lignes `conv_members` se répare — UNE fois par conversation et par
        // session (`_convReparationTentee`) —, puis le dépôt repart.
        if (http === 403 && typeof _reparerAppartenanceConv === "function"
            && window._convReparationTentee && !window._convReparationTentee[convId]) {
          var refus = function () { _pjEchec(convId, msgId, Object.assign(base, { reseau: false, rc: rc, http: http })); };
          Promise.resolve(_reparerAppartenanceConv(convId)).then(function (repare) {
            if (repare) _pjDeposer(convId, msgId, { voie: voie, interactif: !!o.interactif, proprietaire: proprietaire, contexte: contexte });
            else refus();
          }, refus);
          return false;
        }
        _pjEchec(convId, msgId, Object.assign(base, { reseau: reseau, rc: rc, http: http }));
        return false;
      }
      // Relu ICI, pas capturé au départ : la conversation a pu être réécrite.
      var mm = _pjMessage(convId, msgId);
      if (!mm && _pjSupprimee(msgId)) {
        // Supprimée EXPRÈS pendant le dépôt : l'objet ne doit pas rester sans message.
        _pjFileRetirer(msgId);
        try { supa.storage.from("attachments").remove([pj.chemin]); } catch (e) {}
        return false;
      }
      // L'URL CANONIQUE (`/object/public/attachments/…`) : `cdnUrl` la laisse intacte
      // pour ce seau privé, et `urlPieceJointeSignee` (app-02) la signe à l'affichage.
      var pub = supa.storage.from("attachments").getPublicUrl(pj.chemin);
      var brute = pub && pub.data && pub.data.publicUrl;
      var url = brute ? ((typeof cdnUrl === "function") ? cdnUrl(brute) : brute) : "";
      if (!url) { _pjEchec(convId, msgId, Object.assign(base, { reseau: false, rc: "url_absente", http: 0 })); return false; }
      pj.url = url;
      if (mm && mm.pj && mm.pj !== pj) mm.pj.url = url;
      _pjFileRetirer(msgId);
      try { saveConversations(); } catch (e) {}
      // Bulle introuvable mais pas supprimée (conversation réécrite) : le message part
      // QUAND MÊME — c'est le `pj` capturé au départ qui le décrit.
      if (!mm) { try { if (typeof diagLog === "function") diagLog("pj_bulle_absente_envoyee " + String(msgId)); } catch (e) {} }
      sendMessageToSupabase(msgId, convId, url, pj.type, pj.nom, pj.kind);
      return true;
    } finally { finEnvoi(); }
  }
  var envoi;
  try {
    envoi = Promise.resolve(supa.storage.from("attachments").upload(pj.chemin, blob, {
      cacheControl: pj.cache || "31536000", // pièce jointe immuable → cache, soulage l'egress
      upsert: false,
      contentType: blob.type,
    }));
  } catch (e) { envoi = Promise.reject(e); }
  return envoi.then(function (res) {
    var err = res && res.error;
    if (!err) return conclure(true);
    // Renvoi après une réponse perdue : l'objet est DÉJÀ là, sous un chemin qui
    // n'appartient qu'à ce message — c'est la preuve qu'il a été déposé.
    if (_pjDejaDeposee(err) && pj.tentatives > 1) return conclure(true);
    return conclure(false, err);
  }, function (err) { return conclure(false, err); });
}

// « réessayer » sur une pièce jointe (`_retryMsg`, app-04, qui a déjà confronté
// l'auteur `de` au compte courant).
function _pjRenvoyer(convId, msgId) {
  return _pjDeposer(convId, msgId, { voie: "manuel", interactif: true });
}

// ⚠️ UN DÉPÔT COUPÉ PAR LA FERMETURE DE L'APPLICATION N'A NI VERDICT NI FILE : la
// bulle est restée « envoi… » (🕓), sans « réessayer », pour toujours. Au premier
// vidage de la page, un message À MOI encore « sending » et né AVANT ce chargement
// (rien de ce qui est en vol ici ne date d'avant) repart en file. Jamais ceux de
// cette page : son insertion peut être en vol, et la doubler finirait en 23505
// puis « échec » sur un message livré (ROB-06). Le dépôt est idempotent (chemin
// fixé, 409 au renvoi) ; l'insertion d'un média déjà déposé repart par
// `_sendTextToSupa`, qui tient un seul envoi en vol par message — la file des
// MESSAGES peut porter le même, elle s'efface devant lui — et prouve un 23505.
var _PJ_CHARGEMENT = Date.now();
function _pjReprendreInterrompus(moi) {
  if (window._pjInterrompusRepris || !moi) return;
  window._pjInterrompusRepris = true;
  try {
    (getConversations() || []).forEach(function (c) {
      (c.messages || []).forEach(function (m) {
        if (!m || m.from !== "me" || !m.pj || m.status !== "sending" || m.de !== moi) return;
        if (!(Number(m.at) < _PJ_CHARGEMENT)) return;
        if (_pjEnVol[m.id] || (typeof _msgEstEnVol === "function" && _msgEstEnVol(m.id))) return;
        if (_pjFileAjouter(c.id, m.id, moi, null)) {
          try { if (typeof diagLog === "function") diagLog("pj_interrompue_reprise " + String(m.id)); } catch (e) {}
        }
      });
    });
  } catch (e) { try { if (typeof diagLog === "function") diagLog("pj_reprise KO " + String((e && e.message) || e).slice(0, 80)); } catch (_) {} }
}

// Rejoue les dépôts en attente — appelé par `_flushOutbox` (démarrage, retour du
// réseau). Mêmes règles que la file des messages : compte d'abord (une entrée d'un
// autre compte est jetée), un seul envoi en vol, plafond `MSG_ESSAIS_MAX`.
function _pjFileVider() {
  if (typeof sessionExpiree === "function" && sessionExpiree()) return;
  if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) return;
  if (typeof supa === "undefined" || !supa || !window._supaReal) return;
  var moi = (typeof _fileProprietaire === "function") ? _fileProprietaire() : null;
  _pjReprendreInterrompus(moi);
  var a = _pjFileLire();
  if (!a.length) return;
  var contexte = {
    generation: (typeof _outboxGenerationActuelle === "function") ? _outboxGenerationActuelle() : null,
    auteur: (typeof MY_UID !== "undefined") ? MY_UID : null,
  };
  var plafond = (typeof MSG_ESSAIS_MAX === "number") ? MSG_ESSAIS_MAX : 10;
  var restants = [], aLancer = [];
  a.forEach(function (item) {
    if (!item || !item.msgId) return;
    if (!item.owner || item.owner !== moi) {
      try { if (typeof diagLog === "function") diagLog("pj_file_autre_compte"); } catch (e) {}
      return;
    }
    if (_pjEnVol[item.msgId]) { restants.push(item); return; }
    var essais = Number(item.essais || 0) + 1;
    if (essais > plafond) {
      // Plus de renvoi automatique ; le message reste là, en échec, « réessayer ».
      try { if (typeof _setMsgStatus === "function") _setMsgStatus(item.convId, item.msgId, "failed"); } catch (e) {}
      try { if (typeof diagLog === "function") diagLog("pj_file_plafond " + essais); } catch (e) {}
      return;
    }
    item.essais = essais;
    restants.push(item);
    aLancer.push(item);
  });
  // La file est réécrite AVANT les envois : un dépôt qui conclut d'emblée (copie
  // illisible, coupure) la corrige par-dessus, jamais l'inverse.
  _pjFileEcrire(restants);
  aLancer.forEach(function (item) {
    _pjDeposer(item.convId, item.msgId, { voie: "rejeu", proprietaire: item.owner, contexte: contexte });
  });
}

// Mêmes portes que le TEXTE (`sendMessageFp`, app-04) : le mode invité explique
// puis propose un compte, et une conversation de démonstration n'envoie rien
// (UXO-03) — sans elles, un média joint à un exemple partait en 403, compté en
// erreur au pilotage (revue audit-passio du 2026-11-07).
function _pjEnvoiPermis() {
  if (window.requireAuthentication && !requireAuthentication("message")) return false;
  try {
    var fp = document.getElementById("conv-fullpage");
    var id = fp && fp.getAttribute("data-conv-id");
    var c = id ? (getConversations() || []).find(function (x) { return x.id === id; }) : null;
    if (typeof _estConvDemo === "function" && _estConvDemo(c)) {
      toast("Conversation de démonstration — écris à un vrai membre depuis son profil");
      return false;
    }
  } catch (e) {}
  return true;
}

function handleAttachFile(input, kind) {
  var file = input.files && input.files[0];
  if (!file) {
    _diag("handleAttachFile: Aucun fichier sélectionné");
    return;
  }
  if (!_pjEnvoiPermis()) { input.value = ""; return; }
  _mediaEnPreparation();
  // Images : compresser AVANT envoi (toute taille acceptée → ~150-400 Ko),
  // puis traiter le fichier compressé. Évite les uploads énormes et les échecs.
  if (kind === "media" && file.type && file.type.indexOf("image/") === 0 && typeof passioCompressImage === "function") {
    if (file.size > 40 * 1024 * 1024) { input.value = ""; return toast("Image trop lourde (>40 Mo)."); }
    passioCompressImage(file).then(function (durl) {
      // LOT-24 (MSG-C72) : la photo touchée dans la galerie partait SANS être
      // montrée — une vignette voisine, une capture personnelle, et c'était
      // envoyé. On la montre d'abord ; « Envoyer » la fait partir, « Annuler »
      // ne laisse rien. Aucun nouveau format de message.
      _apercuPhotoAvantEnvoi(durl, function () {
        _processAttach(input, kind, _passioDataUrlToFile(durl, file.name));
      }, function () { input.value = ""; });
    }).catch(function () { input.value = ""; toast("Impossible de lire cette image."); });
    return;
  }
  // ⚠️ LA TROISIÈME PORTE VIDÉO, ET ELLE N'AVAIT AUCUN PLAFOND (relevé par
  // `audit-passio`, 2026-09-19). `#attachImageFile` porte `accept="image/*,
  // video/*"` : une vidéo jointe à une conversation tombait ici, partait en
  // `FileReader` brut vers le seau `attachments`, et le contrôle de 40 Mo
  // juste au-dessus est IMAGE SEULEMENT — donc aucune borne du tout, plus
  // permissif que l'ancien Studio et ses 30 Mo.
  // Le lot « capacité » du même jour n'avait branché que `meOnMedia` et
  // `#videoInput` en écrivant « LES DEUX PORTES » : il y en avait trois. C'est
  // la famille que ce lot citait lui-même (`quickCreateProfile` et le Studio
  // sur le plafond de passions) — « corriger une surface, c'est corriger une
  // surface », y compris quand c'est soi qui corrige.
  // ⚠️ UNE VIDÉO PEUT ARRIVER SANS TYPE MIME. Certains sélecteurs Android rendent
  // `file.type === ""` : gardée sur le seul `type`, la porte laissait alors
  // repasser le fichier BRUT, sans aucune borne (le contrôle de 40 Mo ci-dessus
  // est IMAGE SEULEMENT). Ce n'est pas une régression — c'était l'état d'avant
  // pour toute vidéo — mais ce lot AFFIRME que cette porte est bornée, et une
  // affirmation qu'un cas dément est pire qu'un trou connu. Repli sur l'extension.
  if (kind === "media" && _passioEstVideo(file)
      && typeof passioVideoPourEnvoi === "function" && typeof _passioDataUrlToFile === "function") {
    passioVideoPourEnvoi(file).then(function (durl) {
      _processAttach(input, kind, _passioDataUrlToFile(durl, file.name));
    }).catch(function (e) {
      input.value = "";
      // Le refus PORTE son message (contrat de `passioVideoPourEnvoi`) ; sans
      // lui, un refus muet est indiscernable d'une panne.
      toast((e && e.motifUtilisateur) || "Impossible de lire cette vidéo.");
    });
    return;
  }
  _processAttach(input, kind, file);
}

// Aperçu d'une photo avant envoi (MSG-C72). Rendu DOM ; l'image est une URL
// `data:image/…` produite ICI par la compression, passée par `safeUrlAttr`.
// LOT-40 (MSG-C71) : le même aperçu sert au GIF (URL https du fournisseur, même
// désinfectant) — `titre` et `alt` disent ce qui va partir.
function _apercuPhotoAvantEnvoi(durl, envoyer, annuler, titre, alt) {
  var src = (typeof safeUrlAttr === "function") ? safeUrlAttr(durl) : "#";
  if (!src || src === "#") { envoyer(); return; }
  var decide = false;
  openModal(
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">' + escapeHtml(titre || "Envoyer cette photo ?") + '</div>' +
    '<div class="pj-apercu"><img id="pjApercuImg" alt="' + escapeHtml(alt || "Photo à envoyer") + '" /></div>' +
    '<div style="display:flex;gap:8px;margin-top:12px;">' +
      '<button type="button" class="btn ghost block" id="pjApercuAnnuler">Annuler</button>' +
      '<button type="button" class="btn primary block" id="pjApercuEnvoyer">Envoyer</button>' +
    '</div>'
  );
  var img = document.getElementById("pjApercuImg");
  if (img) img.src = src;
  var bE = document.getElementById("pjApercuEnvoyer");
  var bA = document.getElementById("pjApercuAnnuler");
  if (bE) bE.addEventListener("click", function () { if (decide) return; decide = true; closeModal(); envoyer(); });
  if (bA) bA.addEventListener("click", function () { if (decide) return; decide = true; closeModal(); annuler(); });
}

function _processAttach(input, kind, file) {
  _diag("handleAttachFile: Fichier sélectionné - " + file.name + " (" + file.type + ")");

  var fp = document.getElementById("conv-fullpage");
  if (!fp) {
    _diag("handleAttachFile: conv-fullpage NOT FOUND");
    return toast("Ouvre une conversation d'abord");
  }

  var convId = fp.getAttribute("data-conv-id");
  var displayName = fp.getAttribute("data-display-name");
  if (!convId) {
    _diag("handleAttachFile: convId NOT FOUND");
    return;
  }

  _diag("handleAttachFile: convId=" + convId + ", kind=" + kind);

  // Lire le fichier pour l'affichage local ET pour l'upload à Supabase Storage
  // ⚠️ UNE MISE À JOUR ATTEND CET ENVOI (pwa-detect.js) : rechargé en plein dépôt, le
  // message restait affiché chez son auteur et ne partait jamais, sans erreur ni file.
  var _finEnvoi = _envoiCommence();
  var reader = new FileReader();
  // Une lecture impossible se DIT (un refus montre toujours sa sortie) : sans ce
  // toast, choisir le fichier ne produisait rien, sans un mot.
  reader.onerror = function () { _finEnvoi(); input.value = ""; toast("Impossible de lire ce fichier."); };
  reader.onload = function(e) {
    var dataUrl = e.target.result;
    _diag("handleAttachFile: FileReader completed - taille=" + dataUrl.length);

    var convs = getConversations ? getConversations() : (window.conversationsState || []);
    var c = convs.find(x => x.id === convId);
    if (!c || !c.messages) {
      _diag("handleAttachFile: Conversation NOT FOUND or no messages array");
      _finEnvoi();
      return;
    }

    var msgId = "msg_" + (Date.now().toString(36) + Math.random().toString(36).substr(2));
    // « envoi… » dès la bulle : rien n'est envoyé tant que le dépôt ET l'insertion
    // n'ont pas répondu (l'ancienne bulle n'avait AUCUN statut — envoyée d'office).
    // `de` : le compte RÉEL qui l'écrit (AUTH-06), seul autorisé à « réessayer ».
    // `pj` : de quoi la redéposer depuis la copie locale — le chemin est fixé ICI.
    var msg = {id: msgId, from: "me", text: "", at: Date.now(), status: "sending",
      de: (typeof _fileProprietaire === "function") ? _fileProprietaire() : null,
      pj: { kind: kind, nom: file.name, type: file.type, chemin: _pjCheminNeuf(convId, file.name), cache: "31536000", tentatives: 0 }};

    // Affichage local avec le data URL
    if(kind === 'media') {
      if(file.type.startsWith("video/")) {
        msg.video = dataUrl;
        _diag("handleAttachFile: VIDEO added");
      } else {
        msg.img = dataUrl;
        _diag("handleAttachFile: IMAGE added");
      }
    } else if(kind === 'audio') {
      msg.voiceData = dataUrl;
      msg.voiceDuration = 0;
      msg.isFile = true;
      msg.fileName = file.name;
      msg.fileSize = tailleFichierLisible(file.size);
      _diag("handleAttachFile: AUDIO added");
    } else if(kind === 'doc') {
      msg.docData = dataUrl;
      msg.fileName = file.name;
      // LOT-20 (MSG-C83) : « moins de 1 Ko » plutôt que « 0 KB », en français.
      msg.fileSize = tailleFichierLisible(file.size);
      msg.fileType = file.name.split(".").pop().toUpperCase();
      _diag("handleAttachFile: DOCUMENT added");
    }

    c.messages.push(msg);
    c.lastAt = Date.now();

    _diag("handleAttachFile: Message ajouté localement");

    if(typeof saveConversations === 'function') saveConversations();
    if(typeof renderConvFpThread === 'function') renderConvFpThread(c, displayName);
    if(typeof renderMessages === 'function') renderMessages();

    // Dépôt Storage PUIS insertion, avec leur verdict (`_pjDeposer`, plus haut) :
    // ⛔ plus de repli sur la data URL — il annonçait envoyé un message sans média.
    // L'auteur et la génération de la file sont capturés ICI (ASTRA-21/43).
    _diag("handleAttachFile: Upload Supabase Storage...");
    _pjDeposer(convId, msgId, {
      voie: "premier", interactif: true, proprietaire: msg.de,
      contexte: { generation: (typeof _outboxGenerationActuelle === "function") ? _outboxGenerationActuelle() : null, auteur: (typeof MY_UID !== "undefined") ? MY_UID : null },
    });
    // Le dépôt tient son propre envoi dès son départ : la page reste retenue sans trou.
    _finEnvoi();
    input.value = "";
  };
  reader.readAsDataURL(file);
}

function sendMessageToSupabase(msgId, convId, fileUrl, fileType, fileName, kind) {
  // ⛔ JAMAIS DE BASE64 EN BASE — ET JAMAIS UN FAUX « ENVOYÉ » À LA PLACE (2026-11-07).
  // Un seul message de 5 Mo avait fait gonfler conv_messages à 24 Mo en beta. La
  // garde d'avant retirait la data URL puis insérait « 📎 … (non synchronisé) » en
  // annonçant le message ENVOYÉ : le destinataire n'avait qu'une étiquette, et la
  // relecture du fil remplaçait ensuite la copie locale de l'auteur par elle — le
  // média était perdu pour tous, sans un mot. Plus aucun appelant ne passe de data
  // URL (le dépôt a son verdict, `_pjDeposer`) ; si l'un d'eux le refaisait, RIEN ne
  // part : le message passe en échec, « réessayer » redépose depuis la copie locale,
  // et le pilotage le sait (c'est un défaut de NOTRE code, pas de l'appareil).
  if (typeof fileUrl === "string" && /^data:/i.test(fileUrl)) {
    _diag("sendMessageToSupabase: ⛔ data URL refusée (" + fileUrl.length + " octets) — rien n'est inséré");
    try { if (typeof _setMsgStatus === "function") _setMsgStatus(convId, msgId, "failed"); } catch (e) {}
    try { if (window.tel && tel.error) tel.error(new Error("piece_jointe_data_url"), { action: "piece_jointe_data_url", severity: "error", meta: { kind: String(kind || "") } }); } catch (e) {}
    try { toast("⚠️ Pièce jointe non envoyée — touche « réessayer »"); } catch (e) {}
    return;
  }
  try { window.tel && tel.action("send_message", { kind: kind || "text", hasFile: !!fileUrl, convId: convId }); } catch (e) {}
  // Traçage bout-en-bout : chaîne de validation « handler → requête → enregistré ».
  // L'étape « requête » est auto-taguée par le hook fetch ; on consigne ici le
  // résultat métier réel (enregistrement en base) + le verdict final.
  var _flowCid = null;
  try { if (window.tel && tel.flowStart) _flowCid = tel.flowStart("send_message", { convId: convId, kind: kind || "text" }); } catch (e) {}
  function _flowSaved(ok, detail, err) {
    try {
      if (!_flowCid || !window.tel) return;
      // Le média en échec part en FILE (`_outboxAdd`) : un réseau absent est une
      // ATTENTE, comme au chemin texte ; sinon le code fermé, ou celui de la base
      // (2026-11-06 : la raison n'était que dans `detail`, « sans_code » au pilotage).
      var code = !ok && typeof _codeEchecEcriture === "function" ? _codeEchecEcriture(err) : null;
      if (!ok && code === "reseau") {
        tel.step(_flowCid, "queued", "ok", { rc: "hors_ligne" });
        tel.flowEnd(_flowCid, "pending");
      } else {
        var meta = detail ? { detail: String(detail).slice(0, 120) } : null;
        var rc = code || (err && typeof err.code === "string" && err.code ? err.code : null);
        if (!ok && rc) { meta = meta || {}; meta.rc = String(rc).slice(0, 40); }
        tel.step(_flowCid, "saved", ok ? "ok" : "error", meta);
        tel.flowEnd(_flowCid, ok ? "ok" : "error");
      }
      _flowCid = null;
    } catch (e) {}
  }
  // Encoder dans le content en JSON (la data URL est refusée en tête de fonction).
  var contentData = {
    type: kind,
    filename: fileName,
    fileType: fileType,
    url: fileUrl,
    text: "[" + kind.toUpperCase() + "] " + fileName
  };
  var contentJson = JSON.stringify(contentData);

  _diag("handleAttachFile: Envoi à Supabase - URL length: " + (fileUrl ? fileUrl.length : 0));

  // AVEC from_id d'abord : la RLS v2 rejette toujours l'insert sans from_id
  // (WITH CHECK from_id = auth.uid()) — fallback sans from_id par prudence.
  // ⚠️ LE VERDICT DE L'ÉCRITURE DOIT ÊTRE VISIBLE. Ce chemin — photos, vidéos,
  // GIF, vocaux, documents, position — lisait bien `res.error`, mais n'en
  // faisait qu'un `_diag` et un événement de télémétrie : à l'écran le média
  // restait « envoyé », et il disparaissait au rechargement. Un vocal perdu ne
  // se refait pas. Le chemin TEXTE et le TRANSFERT traitent déjà ce cas de la
  // même façon depuis longtemps : statut « failed » + mise en file de renvoi
  // (`_outboxAdd`), le pictogramme « ⚠️ réessayer » étant rendu par
  // `_msgStatusIndHtml`. Le média n'avait simplement jamais reçu ce traitement.
  var _charge = _withSenderMeta(contentJson);
  // ⚠️ ASTRA-21 — L'AUTEUR EST CAPTURÉ ICI, AU DÉPART, et porté jusqu'aux
  // continuations. `_outboxAdd` prend désormais son propriétaire en ARGUMENT :
  // il ne le relit plus au moment de la réponse, où le compte peut avoir changé
  // sur cet appareil. Le chemin MÉDIA a exactement la même forme que le chemin
  // TEXTE — une insertion, une réponse qui revient plus tard — donc le même
  // remède. Sans cet argument, l'entrée partait en file SANS propriétaire et
  // `_outboxVerdict` la jetait au rejeu : le vocal en échec n'était plus
  // renvoyable. Mesuré en CI (message-media-echec), pas en local.
  var _auteurMedia = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : null;
  var _proprietaireMedia = (typeof _estCompteReel === "function" && _estCompteReel(_auteurMedia)) ? _auteurMedia : null;
  // ⚠️ ASTRA-43 : la GÉNÉRATION de la file est capturée ici aussi, comme l'auteur,
  // et portée jusqu'à l'échec — une purge pendant l'envoi du média périme la
  // remise en file (c'est `_outboxAdd` qui tranche, avec ce contexte).
  var _generationMedia = (typeof _outboxGenerationActuelle === "function") ? _outboxGenerationActuelle() : null;
  // Une mise à jour attend le verdict (pwa-detect.js) : ce chemin n'écrit dans la file
  // qu'à l'échec, et une insertion coupée par un rechargement n'en rendrait aucun.
  var _finEnvoi = _envoiCommence();
  function _echec(raison, err) {
    _diag("handleAttachFile: ❌ Échec définitif - " + raison);
    try { if (typeof _setMsgStatus === "function") _setMsgStatus(convId, msgId, "failed"); } catch (e) {}
    try { if (typeof _outboxAdd === "function") _outboxAdd(convId, msgId, _charge, _proprietaireMedia, { generation: _generationMedia, auteur: _auteurMedia }); } catch (e) {}
    _flowSaved(false, raison, err);
    _finEnvoi();
  }
  function _succes(voie) {
    _diag("handleAttachFile: ✅ Supabase OK (" + voie + ")");
    try { if (typeof _setMsgStatus === "function") _setMsgStatus(convId, msgId, "sent"); } catch (e) {}
    try { if (typeof _outboxRemove === "function") _outboxRemove(msgId); } catch (e) {}
    // Voie MÉDIA de la notification de message privé (photo, vocal, GIF,
    // document, position). Même raison qu'app-04 : `_notifierMessage` ne vivait
    // que sous `supaSendMessage`, sans appelant. Dans la branche de succès
    // seulement, et sans attendre — la cloche ne doit pas retarder l'envoi.
    try { if (typeof _notifierMessage === "function") _notifierMessage(convId, msgId); } catch (e) {}
    _flowSaved(true);
    _finEnvoi();
  }

  supa.from("conv_messages").insert({
    id: msgId,
    conv_id: convId,
    from_id: _auteurMedia,
    content: _charge,
    created_at: new Date().toISOString()
  }).then(function(res) {
    if (res.error) {
      _diag("handleAttachFile: Erreur avec from_id - " + res.error.message);
      supa.from("conv_messages").insert({
        id: msgId,
        conv_id: convId,
        content: _charge,
        created_at: new Date().toISOString()
      }).then(function(res2) {
        if (!res2.error) _succes("fallback sans from_id");
        else _echec(res2.error.message, res2.error);
      }).catch(function(e2) { _echec((e2 && e2.message) || "exception", e2); });
    } else {
      _succes("avec from_id");
    }
  }).catch(function(err) {
    _diag("handleAttachFile: Catch - " + err.message);
    _echec((err && err.message) || "exception", err);
  });
}

function shareLocation() {
  var fp = document.getElementById("conv-fullpage");
  // 🔧 UX 2026-06-10 : toasts non bloquants au lieu d'alert()
  if (!fp) return toast("Ouvre une conversation d'abord");
  if (!navigator.geolocation) return toast("Géolocalisation non supportée");

  toast("📍 Localisation en cours…");
  navigator.geolocation.getCurrentPosition(function(pos) {
    var lat = pos.coords.latitude.toFixed(5);
    var lng = pos.coords.longitude.toFixed(5);

    var convId = fp.getAttribute("data-conv-id");
    var convs = getConversations ? getConversations() : (window.conversationsState || []);
    var c = convs.find(x => x.id === convId);
    if (!c) return;

    if (typeof _estConvDemo === "function" && _estConvDemo(c)) { toast("Conversation de démonstration — écris à un vrai membre depuis son profil"); return; }

    // LOT-4 (audit UX/UI du 2026-11-10, MSG-C56) : la position exacte, au mètre près,
    // partait au premier toucher, sans aperçu. On montre ce qui part et à qui ; rien
    // ne part sans « Envoyer ma position ».
    var qui = (typeof _convInterlocuteur === "function") ? _convInterlocuteur(c) : (c.userName || "ton interlocuteur");
    if (typeof ouvrirFeuilleConfirmation !== "function") return _envoyerPositionMesuree(fp, c, lat, lng);
    ouvrirFeuilleConfirmation({
      titre: c.isGroup ? "Envoyer ta position actuelle au groupe ?" : "Envoyer ta position actuelle à " + qui + " ?",
      texte: ["Position précise : " + lat + ", " + lng + ".", "Elle part comme un lien vers une carte, visible par " + qui + "."],
      actions: [{ id: "envoyer", libelle: "Envoyer ma position", agir: function () { _envoyerPositionMesuree(fp, c, lat, lng); } }],
    });
  }, function() {
    toast("❌ Impossible d'obtenir la position");
  });
}

// L'envoi lui-même, après confirmation (MSG-C56).
function _envoyerPositionMesuree(fp, c, lat, lng) {
    var url = "https://maps.google.com/?q=" + lat + "," + lng;
    var convId = c.id;
    var displayName = fp.getAttribute("data-display-name");

    var msgId = "msg_" + (Date.now().toString(36) + Math.random().toString(36).substr(2));
    var msgText = "📍 Ma position : " + url;
    var contentJson = JSON.stringify({ type: "location", lat: parseFloat(lat), lng: parseFloat(lng), url: url, text: msgText });
    // ⚠️ LOT-1 (MSG-C57) : même chemin commun que le texte et le GIF — statut,
    // échec visible, file hors ligne, « réessayer » (l'INSERT séparé d'avant
    // avalait son échec, la position restait affichée comme envoyée).
    c.messages.push({id: msgId, from: "me", text: msgText, at: Date.now(), status: "sending", de: (typeof _fileProprietaire === "function" ? _fileProprietaire() : null), envoi: contentJson});
    c.lastAt = Date.now();

    if(typeof saveConversations === 'function') saveConversations();
    _sendTextToSupa(convId, msgId, _withSenderMeta(contentJson));

    if(typeof renderConvFpThread === 'function') renderConvFpThread(c, displayName);
    if(typeof renderMessages === 'function') renderMessages();

    // Fermer le menu après envoi
    setTimeout(function() {
      var menu = document.getElementById("convAttachMenu");
      if(menu && menu.classList.contains("open")) {
        menu.classList.remove("open");
        var btn = document.getElementById("btnAttach");
        if(btn) btn.classList.remove("active");
      }
    }, 300);
}

function openConvFiles() {
  // Ferme le menu pièce jointe (au lieu de le basculer) → appelable aussi depuis
  // le panneau Paramètres sans rouvrir le menu par effet de bord.
  try { document.getElementById("convAttachMenu")?.classList.remove("open"); document.getElementById("btnAttach")?.classList.remove("active"); } catch(e) {}
  try {
    var fp = document.getElementById("conv-fullpage");
    var panel = document.getElementById("convFilesPanel");
    var content = document.getElementById("convFilesContent");
    if (!fp || !panel || !content) return;
    var convId = fp.getAttribute("data-conv-id");
    var convs = getConversations();
    var c = convs.find(function (x) { return x.id === convId; });
    if (!c) return;

    var medias = [], voices = [], files = [];
    (c.messages || []).forEach(function (m, i) {
      if (typeof applyMsgContentData === "function") applyMsgContentData(m);
      var key = (m.id || i).toString().replace(/[^a-z0-9]/gi, "");
      if (m.gif) medias.push({ kind: "img", src: m.gif });
      else if (m.video) medias.push({ kind: "video", src: m.video });
      else if (m.img) medias.push({ kind: "img", src: m.img });
      else if (m.voiceData) voices.push({ aid: "g" + key, src: m.voiceData, dur: m.voiceDuration || 0, at: m.at, name: m.isFile ? m.fileName : null });
      else if (m.fileUrl) files.push({ name: m.fileName || "Fichier", url: m.fileUrl });
      else if (m.docData) files.push({ name: m.fileName || "Fichier", key: m.id || i, data: m.docData });
    });

    var html = "";
    if (medias.length) {
      html += '<div class="csetting-section">Médias (' + medias.length + ')</div><div class="conv-files-grid">';
      medias.forEach(function (md) {
        if (md.kind === "video") {
          // Pièce jointe → `data-pj`, URL signée posée par signerPiecesJointes après le innerHTML (seau privé, 2026-09-11).
          html += '<video ' + attrMediaSrc(md.src) + ' style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;cursor:pointer;" muted playsinline onclick="this.paused?this.play():this.pause()"></video>';
        } else {
          html += '<img ' + attrMediaSrc(md.src) + ' loading="lazy" decoding="async" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;cursor:pointer;" onclick="openFullImg(this.src)"/>';
        }
      });
      html += '</div>';
    }
    if (voices.length) {
      html += '<div class="csetting-section">Messages vocaux (' + voices.length + ')</div>';
      voices.forEach(function (v) {
        window["_vd_" + v.aid] = v.src;
        var durStr = Math.floor(v.dur / 60) + ":" + String(v.dur % 60).padStart(2, "0");
        var dateStr = v.at ? new Date(v.at).toLocaleDateString("fr-FR") : "";
        html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);">' +
          '<button id="pb_' + v.aid + '" onclick="_playVoiceById(\'' + escapeJsArg(v.aid) + '\')" style="width:34px;height:34px;border-radius:50%;background:rgba(139,92,246,0.12);border:none;color:var(--accent);cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">▶</button>' +
          '<div style="flex:1;height:28px;background:rgba(139,92,246,0.12);border-radius:8px;overflow:hidden;cursor:pointer;" onclick="_playVoiceById(\'' + escapeJsArg(v.aid) + '\')"><div id="wf_' + v.aid + '" style="height:100%;background:var(--accent);border-radius:8px;width:0%;transition:width 0.15s;"></div></div>' +
          '<span id="dur_' + v.aid + '" style="font-size:11px;color:var(--muted);flex-shrink:0;min-width:30px;text-align:right;">' + durStr + '</span>' +
          (dateStr ? '<span style="font-size:11px;color:var(--muted);flex-shrink:0;">' + dateStr + '</span>' : '') +
          '</div>';
      });
    }
    if (files.length) {
      html += '<div class="csetting-section">Fichiers (' + files.length + ')</div>';
      files.forEach(function (f) {
        var row = '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;">' +
          '<div style="width:36px;height:36px;border-radius:10px;background:var(--bg-soft);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">📄</div>' +
          '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(f.name) + '</div>' +
          '<div style="font-size:10px;color:var(--muted);">📥 Télécharger</div></div></div>';
        if (f.url) {
          html += '<a ' + attrMediaSrc(f.url, "href") + ' target="_blank" rel="noopener" style="text-decoration:none;">' + row + '</a>';
        } else {
          window["_doc_" + f.key] = { data: f.data, name: f.name };
          html += row.replace('<div style="display:flex;align-items:center;gap:12px;', '<div onclick="_docDownload(\'' + escapeJsArg(f.key) + '\')" style="display:flex;align-items:center;gap:12px;');
        }
      });
    }
    if (!html) {
      html = '<div style="padding:48px 24px;text-align:center;color:var(--muted);">' +
        '<div style="font-size:40px;margin-bottom:12px;">📁</div>' +
        '<div style="font-weight:700;color:var(--text);">Aucune pièce jointe</div>' +
        '<div style="font-size:13px;margin-top:6px;">Les photos, vidéos, vocaux et fichiers échangés dans cette conversation apparaîtront ici.</div></div>';
    }
    content.innerHTML = html;
    if (typeof signerPiecesJointes === "function") signerPiecesJointes(content);
    panel.classList.add("open");
  } catch (e) { console.error("openConvFiles:", e); }
}

function closeConvFiles() {
  var panel = document.getElementById("convFilesPanel");
  if (panel) panel.classList.remove("open");
}

function openConvSettings(convId) {
  try {
    var panel = document.getElementById("convSettingsPanel");
    var content = document.getElementById("convSettingsContent");
    if (!panel || !content) return;
    var convs = getConversations();
    var c = convs.find(function(x) { return x.id === convId; });
    if (!c) return;
    var isDM = !c.isGroup;
    var uid = (c.userId || "").replace(/'/g, "\\'");
    var uname = String(c.userName || "Utilisateur").replace(/'/g, "\\'");
    var blocked = isDM && typeof isBlocked === "function" && isBlocked(c.userId);

    // LOT-31 (audit UX/UI du 2026-11-10, MSG-C24) : une conversation d'EXEMPLE
    // proposait quatorze actions réelles (bloquer, signaler, exporter…) sur un
    // personnage qui n'existe pas. Elle n'en garde qu'une : la retirer.
    if (typeof _estConvDemo === "function" && _estConvDemo(c)) {
      var titreEx = document.getElementById("convSettingsTitre");
      if (titreEx) titreEx.textContent = c.userName || "Exemple";
      content.innerHTML =
        '<div class="csetting-section">EXEMPLE PASSIO</div>' +
        '<div class="csetting-note" style="padding:4px 16px 12px;color:var(--muted);font-size:13px;line-height:1.4;">Cette conversation montre à quoi ressemble la messagerie. Personne ne la lit.</div>' +
        '<div class="csetting-item csetting-danger" onclick="_deleteConv(\'' + escapeJsArg(convId) + '\')">' +
          '<div class="csetting-icon">' + picto("supprimer") + '</div><div class="csetting-label">Supprimer cet exemple</div></div>';
      panel.style.display = ""; panel.style.transform = ""; panel.style.pointerEvents = "";
      panel.classList.add("open");
      return;
    }

    // LOT-35 (audit UX/UI du 2026-11-10, MSG-C17) : quatorze entrées mal rangées.
    // Le titre dit de QUI il s'agit ; ce qui touche la conversation est groupé ;
    // les accusés de lecture, réglage de TOUT le compte, le disent ; ce qui efface
    // ou fait sortir est rassemblé en bas, dans un rouge lisible (.csetting-danger,
    // 6:1 au lieu de 3,5:1), « Effacer les messages » compris (il était gris).
    var titre = document.getElementById("convSettingsTitre");
    if (titre) titre.textContent = c.isGroup ? (c.groupName || "Groupe") : (c.userName || "Conversation");
    var item = function (action, icone, libelle, danger) {
      return '<div class="csetting-item' + (danger ? ' csetting-danger' : '') + '" onclick="' + action + '">' +
        '<div class="csetting-icon">' + icone + '</div><div class="csetting-label">' + libelle + '</div></div>';
    };
    var idJs = escapeJsArg(convId);
    var accuses = !((state.user.general || {}).readReceipts === false);
    content.innerHTML =
      '<div class="csetting-section">CONVERSATION</div>' +
      (isDM ? item("closeConvSettings();openUserProfile('" + escapeJsArg(uid) + "','seed')", picto("profil"), "Voir le profil") : '') +
      item("_toggleMuteConv('" + idJs + "')", c._muted ? picto("clocheCoupee") : picto("cloche"), c._muted ? 'Activer les notifications' : 'Couper les notifications') +
      item("_searchConv('" + idJs + "')", picto("recherche"), "Rechercher dans la conversation") +
      item("openConvFiles()", picto("trombone"), "Pièces jointes & médias") +
      item("_togglePinConv('" + idJs + "')", picto("epingler"), c.pinned ? 'Désépingler la conversation' : 'Épingler en haut de la liste') +
      item("_markConvUnread('" + idJs + "')", picto("nonLu"), "Marquer comme non lu") +
      item("_toggleArchiveConv('" + idJs + "')", picto("archiver"), c.archived ? 'Désarchiver' : 'Archiver la conversation') +
      item("_openConvBgPicker('" + idJs + "')", picto("palette"), "Fond de conversation") +
      (c.isGroup ? item("closeConvSettings();pickGroupPhoto('" + idJs + "')", picto("image"), "Changer la photo du groupe") : '') +
      item("_exportConv('" + idJs + "')", picto("exporter"), "Exporter la conversation") +

      '<div class="csetting-section">TON COMPTE</div>' +
      item("_toggleReadReceipts('" + idJs + "')", accuses ? picto("oeil") : picto("masquer"),
        'Accusés de lecture<span style="color:var(--muted);font-weight:600;"> · ' + (accuses ? 'activés' : 'désactivés') + '</span>' +
        '<div class="csetting-aide">Pour toutes tes conversations</div>') +

      (isDM ?
        '<div class="csetting-section">CONFIDENTIALITÉ</div>' +
        (blocked
          ? item("closeConvSettings();unblockUser('" + escapeJsArg(uid) + "','" + escapeJsArg(uname) + "')", picto("debloquer"), "Débloquer " + escapeHtml(c.userName || ''))
          : item("_blockFromConv('" + idJs + "')", picto("bloquer"), "Bloquer " + escapeHtml(c.userName || ''), true)) +
        item("closeConvSettings();reportUser('" + escapeJsArg(uid) + "','" + escapeJsArg(uname) + "')", picto("signaler"), "Signaler", true)
        : '') +

      '<div class="csetting-section">EFFACER</div>' +
      item("_clearConvMessages('" + idJs + "')", picto("supprimer"), "Effacer les messages", true) +
      // LOT-28 (audit UX/UI du 2026-11-10, MSG-C21) : un groupe n'a qu'UNE sortie,
      // « Quitter le groupe » (l'appartenance part, les messages cessent) — l'ancien
      // « Supprimer » ne retirait que la copie locale, et le prochain message le
      // faisait revenir. En 1:1, la portée est dans le libellé : « pour moi ».
      (c.isGroup
        ? item("closeConvSettings();leaveGroup('" + idJs + "')", picto("quitter"), "Quitter le groupe", true)
        : item("_deleteConv('" + idJs + "')", picto("supprimer"), "Supprimer pour moi", true));

    // 🔑 FIX : openConversation pose des styles inline (display:none, transform,
    // pointer-events) sur ce panneau → ils écrasaient la classe .open et le panneau
    // ne s'affichait jamais (« les trois points ne fonctionnent pas »). On les purge.
    panel.style.display = "";
    panel.style.transform = "";
    panel.style.pointerEvents = "";
    panel.classList.add("open");
  } catch(e) { console.error("openConvSettings:", e); }
}

function _toggleMuteConv(convId) {
  var convs = getConversations();
  var c = convs.find(function(x){ return x.id === convId; });
  if (!c) return;
  c._muted = !c._muted;
  saveConversations();
  openConvSettings(convId);
  toast(c._muted ? "🔕 Notifications coupées" : "🔔 Notifications activées");
  _ecrireSourdineServeur(convId, !!c._muted);
}

// MSG-C02, volet serveur (audit UX/UI du 2026-11-10) : la sourdine n'existait
// que sur CET appareil — l'expéditeur, lui, déclenchait la push vers tous les
// appareils du destinataire. Elle est écrite sur MA ligne `conv_members`
// (`muted`, seule colonne que la migration du 2026-11-13 me laisse écrire), et
// `notify-call` ne réveille plus un membre en sourdine. Le réglage LOCAL reste
// la vérité de cet appareil : un refus serveur ne l'annule pas, il le dit.
async function _ecrireSourdineServeur(convId, muted) {
  try {
    if (typeof supa === "undefined" || !supa || !window._supaReal) return;
    if (typeof _uidEstUnCompte === "function" && !_uidEstUnCompte()) return;
    if (!convId || typeof MY_UID === "undefined" || !MY_UID) return;
    var r = await supa.from("conv_members").update({ muted: muted })
      .eq("conv_id", convId).eq("user_id", MY_UID).select("conv_id");
    if (r && r.error) {
      var code = String(r.error.code || "");
      // Base pas encore migrée (colonne inconnue) : rien à dire, la sourdine
      // locale fonctionne comme avant.
      if (code === "42703" || code === "PGRST204") { try { diagLog("sourdine serveur : colonne absente"); } catch (e) {} return; }
      try { diagLog("sourdine serveur refusée " + code); } catch (e) {}
      toast("Sourdine enregistrée sur cet appareil seulement — tes autres appareils sonneront encore", "warning");
      return;
    }
    // Zéro ligne : la conversation n'existe pas en base (exemple, locale) — rien à dire.
  } catch (e) { try { diagLog("sourdine serveur : " + (e && e.message)); } catch (_) {} }
}

async function _clearConvMessages(convId) {
  // LOT-6 (TRA-C11) : feuille de l'application ; la portée est dite.
  if (!(await confirmerAction({ titre: "Effacer tous les messages ?", texte: "Ils disparaissent de cet appareil. Ils restent visibles chez les autres membres.", libelle: "Effacer les messages", danger: true }))) return;
  var convs = getConversations();
  var c = convs.find(function(x){ return x.id === convId; });
  if (!c) return;
  c.messages = [];
  // Marque « effacé avant maintenant » : sans elle, la réouverture rechargeait
  // tout l'historique depuis le serveur (MSG-06).
  if (typeof convTombAdd === "function") convTombAdd("clr", convId);
  saveConversations();
  var fp = document.getElementById("conv-fullpage");
  renderConvFpThread(c, fp ? fp.getAttribute("data-display-name") : "");
  closeConvSettings();
  toast("Messages effacés");
}

function _exportConv(convId) {
  var convs = getConversations();
  var c = convs.find(function(x){ return x.id === convId; });
  if (!c) return;
  var lines = (c.messages||[]).map(function(m) {
    var who = m.from === "me" ? "Moi" : (m.fromName || c.userName || "Autre");
    var time = m.at ? new Date(m.at).toLocaleString("fr-FR") : "";
    return "[" + time + "] " + who + ": " + (m.text||"[Media]");
  }).join("\n");
  var a = document.createElement("a");
  a.href = "data:text/plain;charset=utf-8," + encodeURIComponent(lines);
  a.download = "conv_" + (c.userName || c.id) + ".txt";
  a.click();
  toast("Exporté !");
}

async function _deleteConv(convId) {
  var _cDel = (getConversations() || []).find(function (x) { return x && x.id === convId; });
  var _exemple = typeof _estConvDemo === "function" && _estConvDemo(_cDel);
  if (!(await confirmerAction(_exemple
      ? { titre: "Supprimer cet exemple ?", texte: "Il disparaît de ta liste.", libelle: "Supprimer", danger: true }
      : { titre: "Supprimer cette conversation pour toi ?", texte: "Elle disparaît de ta liste et de cet appareil. L'autre personne garde tout l'historique.", libelle: "Supprimer pour moi", danger: true }))) return;
  conversationsState = (conversationsState||[]).filter(function(c){ return c.id !== convId; });
  // Pierres tombales : la conversation ne revient ni au boot ni par la fusion,
  // et son historique reste effacé si un nouveau message la fait réapparaître
  // (MSG-06). L'appartenance serveur n'est pas touchée : l'autre peut encore
  // écrire, et ce nouveau message seul sera montré.
  if (typeof convTombAdd === "function") { convTombAdd("clr", convId); convTombAdd("conv", convId); }
  saveConversationsNow();
  closeConvSettings();
  closeConversation();
  toast("Conversation supprimée");
}

// Accusés de lecture (✓✓) activables — réglage global du compte. Quand désactivés,
// on n'affiche plus les accusés dans le fil (renderConvFpThread les respecte).
function _toggleReadReceipts(convId) {
  state.user.general = state.user.general || {};
  var on = !(state.user.general.readReceipts === false);
  state.user.general.readReceipts = !on; // bascule
  try { saveState(); } catch(e) {}
  try { openConvSettings(convId); } catch(e) {}            // rafraîchit le libellé
  try {
    var fp = document.getElementById("conv-fullpage");
    var convs = getConversations();
    var cc = convs.find(function(x){ return x.id === convId; });
    if (cc) renderConvFpThread(cc, fp ? fp.getAttribute("data-display-name") : "");
  } catch(e) {}
  toast(state.user.general.readReceipts === false ? "🚫 Accusés de lecture désactivés" : "👁️ Accusés de lecture activés");
}

// Marquer la conversation comme non lue → revient à la liste avec le badge.
function _markConvUnread(convId) {
  var convs = getConversations();
  var c = convs.find(function(x){ return x.id === convId; });
  if (!c) return;
  c.unread = Math.max(1, c.unread || 0);
  saveConversations();
  closeConvSettings();
  try { if (typeof closeConversation === "function") closeConversation(); } catch(e) {}
  try { renderMessages(); } catch(e) {}
  try { if (typeof renderMsgBadge === "function") renderMsgBadge(); } catch(e) {}
  toast("📩 Marqué comme non lu");
}

// Bloquer depuis la conversation (avec confirmation) → masque ses messages + retour liste.
async function _blockFromConv(convId) {
  var convs = getConversations();
  var c = convs.find(function(x){ return x.id === convId; });
  if (!c || c.isGroup) return;
  // LOT-6 (TRA-C10) : la même feuille que les trois autres portes de blocage.
  var fait = await demanderBlocage(c.userId, c.userName);
  if (!fait) return;
  closeConvSettings();
  try { if (typeof closeConversation === "function") closeConversation(); } catch(e) {}
}

// Recherche de texte dans la conversation : filtre le fil sur les messages
// correspondants, avec un bandeau « Tout afficher » pour revenir.
async function _searchConv(convId) {
  closeConvSettings();
  var convs = getConversations();
  var c = convs.find(function(x){ return x.id === convId; });
  if (!c) return;
  // LOT-6 (TRA-C11) : un champ dans une feuille de l'application, plus de prompt().
  var q = await demanderTexte({ titre: "Rechercher dans la conversation", placeholder: "Un mot, un nom…", libelle: "Rechercher" });
  if (q == null) return;
  q = q.trim().toLowerCase();
  if (!q) return;
  var matches = (c.messages || []).filter(function(m){ return (m.text || "").toLowerCase().indexOf(q) > -1; });
  if (!matches.length) { toast("Aucun message trouvé pour « " + q + " »"); return; }
  var fp = document.getElementById("conv-fullpage");
  var dn = fp ? fp.getAttribute("data-display-name") : "";
  var clone = Object.assign({}, c, { messages: matches });
  renderConvFpThread(clone, dn);
  var thread = document.getElementById("convFpThread");
  if (thread) {
    var bar = document.createElement("div");
    bar.style.cssText = "position:sticky;top:0;z-index:5;background:var(--accent);color:#fff;padding:9px 12px;border-radius:10px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;font-size:13px;cursor:pointer;";
    bar.innerHTML = "<span>🔍 " + matches.length + " résultat(s) — « " + escapeHtml(q) + " »</span><span style=\"font-weight:800;\">✕ Tout afficher</span>";
    bar.onclick = function(){ renderConvFpThread(c, dn); };
    thread.insertBefore(bar, thread.firstChild);
  }
}

// Épingler / désépingler : la conversation remonte en tête de liste (tri dans
// renderMessages, qui place les .pinned en premier).
function _togglePinConv(convId) {
  var convs = getConversations();
  var c = convs.find(function(x){ return x.id === convId; });
  if (!c) return;
  c.pinned = !c.pinned;
  saveConversations();
  closeConvSettings();
  try { renderMessages(); } catch(e) {}
  toast(c.pinned ? "📌 Conversation épinglée" : "Conversation désépinglée");
}

// Fond de conversation : applique un dégradé/couleur au fil (#convFpThread),
// mémorisé par conversation (c.bg) et réappliqué à l'ouverture.
// LOT-35 (audit UX/UI du 2026-11-10, MSG-C16, MSG-C79) : cinq fonds sur six
// étaient sombres — un mode sombre par conversation, alors que le produit n'en a
// plus : heures et séparateurs (#6E6987) y tombaient à 3:1. Six fonds CLAIRS, où
// l'habillage du fil reste lisible. Un fond sombre déjà choisi (c.bg, mémorisé
// sur l'appareil) est traduit à l'affichage vers le clair de même rang.
var CONV_BGS = [
  { label: "Par défaut", css: "var(--bg-deep)" },
  { label: "Lavande",    css: "linear-gradient(160deg,#f4effe,#e9e1fc)" },
  { label: "Ciel",       css: "linear-gradient(160deg,#eef6fc,#dcecf7)" },
  { label: "Pêche",      css: "linear-gradient(160deg,#fdf2ec,#f9e3d8)" },
  { label: "Menthe",     css: "linear-gradient(160deg,#eef8f1,#dcefe3)" },
  { label: "Sable",      css: "linear-gradient(160deg,#f8f4ea,#eee6d4)" }
];
var CONV_BGS_SOMBRES = [
  "linear-gradient(160deg,#2a1a4a,#160d2a)",
  "linear-gradient(160deg,#0f2a3a,#0a1722)",
  "linear-gradient(160deg,#3a1a2a,#241019)",
  "linear-gradient(160deg,#16291f,#0d1a12)",
  "#0a0a0f"
];
function fondConvClair(css) {
  var i = CONV_BGS_SOMBRES.indexOf(String(css || ""));
  return i > -1 ? CONV_BGS[i + 1].css : (css || "var(--bg-deep)");
}

function _applyConvBg(css) {
  var thread = document.getElementById("convFpThread");
  if (thread) thread.style.background = fondConvClair(css);
}

function _openConvBgPicker(convId) {
  var convs = getConversations();
  var c = convs.find(function(x){ return x.id === convId; });
  if (!c) return;
  var swatches = CONV_BGS.map(function(b, i) {
    var sel = fondConvClair(c.bg) === b.css;
    return '<button type="button" class="conv-fond-choix" aria-pressed="' + (sel ? 'true' : 'false') + '" onclick="_setConvBg(\'' + escapeJsArg(convId) + '\',' + i + ')" style="cursor:pointer;border-radius:14px;overflow:hidden;border:2px solid ' + (sel ? 'var(--accent)' : 'var(--border)') + ';padding:0;background:none;font:inherit;">' +
      '<div style="height:62px;background:' + b.css + ';"></div>' +
      '<div style="font-size:12px;text-align:center;padding:6px 0;color:var(--text);font-weight:600;">' + b.label + '</div></button>';
  }).join("");
  openModal(
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">🎨 Fond de conversation</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px;">' + swatches + '</div>' +
    '<button class="btn primary block" style="margin-top:14px;" onclick="closeModal()">Terminé</button>'
  );
}

function _setConvBg(convId, idx) {
  var convs = getConversations();
  var c = convs.find(function(x){ return x.id === convId; });
  if (!c || !CONV_BGS[idx]) return;
  c.bg = CONV_BGS[idx].css;
  saveConversations();
  _applyConvBg(c.bg);
  closeModal();
  closeConvSettings();
  toast("🎨 Fond mis à jour");
}

/* ============================================================
   🔧 CORRECTIFS AUDIT 2026-06-10 — fonctions référencées par des
   onclick/oninput mais jamais définies (boutons morts + erreurs JS)
   ============================================================ */

// FIX 2 — Bouton retour du panneau "Paramètres de conversation"
// (aussi appelé après effacement/suppression d'une conversation).
function closeConvSettings() {
  var panel = document.getElementById("convSettingsPanel");
  if (panel) panel.classList.remove("open");
}

// FIX 3 — Auto-resize du champ message (oninput sur #convFpInput
// jetait une ReferenceError à chaque frappe).
function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

// FIX 4 — Recherche GIF du panneau Emoji/GIF. Depuis l'intégration API
// (backlog #5), la recherche interroge Tenor/Giphy via _fillEmojiGifGrid
// (emoji-misc.js) avec un debounce ; sans clé API, fallback liste locale.
var _gifSearchDeb = null;
function _onGifSearch(query) {
  clearTimeout(_gifSearchDeb);
  _gifSearchDeb = setTimeout(function () {
    if (window._fillEmojiGifGrid) window._fillEmojiGifGrid(query);
  }, 350);
}
window._onGifSearch = _onGifSearch;

// FIX 5 — Clic sur une image dans le chat : ouvre un visualiseur
// plein écran (avant : ReferenceError, rien ne se passait).
// Ferme la visionneuse (bouton, fond, Échap) en rendant son entrée d'historique ;
// `depuisRetour` : l'entrée vient d'être retirée par le navigateur.
function fermerVisionneuseImage(depuisRetour) {
  var v = document.getElementById("fullImgViewer");
  if (!v) return false;
  v.remove();
  if (!depuisRetour) { try { if (typeof releaseOverlayHistory === "function") releaseOverlayHistory(); } catch (e) {} }
  return true;
}

function openFullImg(src) {
  if (!src) return;
  var old = document.getElementById("fullImgViewer");
  if (old) old.remove();
  var v = document.createElement("div");
  v.id = "fullImgViewer";
  v.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(10,6,30,0.92);display:flex;align-items:center;justify-content:center;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:fadeIn .2s ease;overflow:hidden;touch-action:none;";
  // ⚠️ `src` vient d'un média de conversation, donc d'un AUTRE compte. N'échapper
  // que les guillemets laissait passer le schéma : le bouton « Télécharger » pose
  // `src` en href et clique dessus — un `javascript:` s'y exécuterait. On refuse
  // tout ce que safeUrlAttr n'accepte pas (http(s), data:image|audio|video, blob:).
  var esc = safeUrlAttr(src);
  if (esc === "#") return;
  v.innerHTML = '<img id="_fiv_img" src="' + escapeHtml(esc) + '" style="max-width:94vw;max-height:90vh;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.6);transition:transform .15s ease;will-change:transform;" alt=""/>' +
    '<div style="position:absolute;top:max(16px,env(safe-area-inset-top));right:16px;display:flex;gap:8px;">' +
      '<button id="_fiv_dl" aria-label="Télécharger" style="width:38px;height:38px;border-radius:50%;border:none;background:rgba(255,255,255,0.14);color:#fff;font-size:17px;cursor:pointer;">⬇️</button>' +
      '<button id="_fiv_close" aria-label="Fermer" style="width:38px;height:38px;border-radius:50%;border:none;background:rgba(255,255,255,0.14);color:#fff;font-size:20px;cursor:pointer;">✕</button>' +
    '</div>' +
    '<div style="position:absolute;bottom:max(14px,env(safe-area-inset-bottom));left:0;right:0;text-align:center;color:rgba(255,255,255,0.6);font-size:12px;pointer-events:none;">Double-tap pour zoomer · glisser pour déplacer</div>';
  document.body.appendChild(v);
  // LOT-24 (MSG-C73) : une entrée d'historique, comme une modale — le retour
  // système ferme l'image au lieu de fermer la conversation derrière elle.
  try { if (typeof pushOverlayHistory === "function") pushOverlayHistory("image", "#image"); } catch (e) {}
  var img = v.querySelector("#_fiv_img");
  var scale = 1, tx = 0, ty = 0, dragging = false, sx = 0, sy = 0, lastTap = 0;
  function apply() { img.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")"; img.style.cursor = scale > 1 ? "grab" : "zoom-in"; }
  function reset() { scale = 1; tx = 0; ty = 0; apply(); }
  v.querySelector("#_fiv_close").onclick = function (e) { e.stopPropagation(); fermerVisionneuseImage(); };
  v.querySelector("#_fiv_dl").onclick = function (e) { e.stopPropagation(); try { var a = document.createElement("a"); a.href = src; a.download = "passio_image"; a.click(); } catch (err) {} };
  // Fond cliqué (hors image) → fermer.
  v.addEventListener("click", function (e) { if (e.target === v) fermerVisionneuseImage(); });
  // Double-tap / double-clic → zoom toggle.
  img.addEventListener("click", function (e) {
    e.stopPropagation();
    var now = Date.now();
    if (now - lastTap < 300) { if (scale === 1) { scale = 2.5; } else { reset(); return; } apply(); }
    lastTap = now;
  });
  // Glisser quand zoomé → déplacer.
  img.addEventListener("pointerdown", function (e) { if (scale === 1) return; dragging = true; sx = e.clientX - tx; sy = e.clientY - ty; try { img.setPointerCapture(e.pointerId); } catch (err) {} });
  img.addEventListener("pointermove", function (e) { if (!dragging) return; tx = e.clientX - sx; ty = e.clientY - sy; img.style.transition = "none"; apply(); });
  img.addEventListener("pointerup", function () { dragging = false; img.style.transition = "transform .15s ease"; });
  apply();
}

// FIX 6 — Messages vocaux : le rendu (lecteur, waveform) existait
// déjà mais l'enregistrement n'était pas implémenté → bouton 🎙️ mort
// et ✕ de la barre d'enregistrement en erreur.
var _voiceRecorder = null, _voiceChunks = [], _voiceStartAt = 0, _voiceTimerInt = null, _voiceCancelled = false;
window._isRecording = false;

// LOT-4 (audit UX/UI du 2026-11-10, MSG-C53/C54) — LE GESTE DU MICRO.
// Avant : le micro s'ouvrait APRÈS que le doigt s'était levé (autorisation, flux
// lent), l'enregistrement continuait seul, et le toucher suivant l'ENVOYAIT ; glisser
// hors du bouton puis relâcher envoyait aussi. Désormais : on n'enregistre que doigt
// posé ; relâcher envoie ; glisser de plus de 80 px vers la gauche puis relâcher
// annule (la barre le dit). Un toucher bref ne capte rien et dit quoi faire.
var VOIX_SEUIL_ANNULER = 80;
var _voixGeste = null; // { x, annuler } tant que le doigt est posé
var VOIX_CONSIGNE = "Relâche pour envoyer · glisse vers la gauche pour annuler";
function _voixConsigneCourte() { try { toast("🎙️ Maintiens le micro pour enregistrer"); } catch (e) {} }
function _voixMajBarre() {
  var bar = document.getElementById("voiceRecordBar");
  var c = document.getElementById("voiceRecordConsigne");
  var annuler = !!(_voixGeste && _voixGeste.annuler);
  if (bar) bar.classList.toggle("voice-annule", annuler);
  if (c) c.textContent = annuler ? "Relâche pour annuler" : VOIX_CONSIGNE;
}
function _brancherBoutonVocal() {
  var b = document.getElementById("btnVoice");
  if (!b || b._voixBranche) return;
  b._voixBranche = true;
  var finir = function (e) {
    document.removeEventListener("pointermove", bouger, true);
    document.removeEventListener("pointerup", finir, true);
    document.removeEventListener("pointercancel", finir, true);
    var g = _voixGeste; _voixGeste = null;
    if (!g) return;
    if (e && e.type === "pointercancel") g.annuler = true;
    if (g.annuler) cancelVoiceRecord(); else stopVoiceRecord();
    _voixMajBarre();
  };
  var bouger = function (e) {
    if (!_voixGeste) return;
    var annuler = (_voixGeste.x - e.clientX) > VOIX_SEUIL_ANNULER;
    if (annuler !== _voixGeste.annuler) { _voixGeste.annuler = annuler; _voixMajBarre(); }
  };
  b.addEventListener("pointerdown", function (e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    _voixGeste = { x: e.clientX, annuler: false };
    _voixMajBarre();
    document.addEventListener("pointermove", bouger, true);
    document.addEventListener("pointerup", finir, true);
    document.addEventListener("pointercancel", finir, true);
    startVoiceRecord({ geste: true });
  });
  // Pas de menu « copier / partager » ni de sélection sous un appui long.
  b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", _brancherBoutonVocal); else _brancherBoutonVocal();

async function startVoiceRecord(opts) {
  var parGeste = !!(opts && opts.geste);
  if (window._isRecording) return;
  if (typeof _pjEnvoiPermis === "function" && !_pjEnvoiPermis()) return;
  if (!navigator.mediaDevices || !window.MediaRecorder) { toast("🎙️ Enregistrement non supporté sur cet appareil"); return; }
  try {
    // Micro TRAITÉ (anti-écho / anti-bruit / gain auto) + mono 48 kHz : voix
    // propre même enregistrée près d'un haut-parleur actif. Sans ces
    // contraintes, `audio: true` livrait le micro brut (souffle + écho).
    var stream = await navigator.mediaDevices.getUserMedia({ audio: {
      echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      channelCount: { ideal: 1 }, sampleRate: 48000,
    } });
    // Le doigt s'est levé pendant que le micro s'ouvrait : on ferme le flux tout de
    // suite, rien n'est capté, et on dit quoi faire (MSG-C53).
    if (parGeste && !_voixGeste) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      _voixConsigneCourte();
      return;
    }
    _voiceChunks = []; _voiceCancelled = false;
    // Débit 128 kbps EXPLICITE : le défaut de MediaRecorder est bas et variable
    // selon les navigateurs (voix étouffée).
    //
    // ⚠️ L'ORDRE DE PRÉFÉRENCE EST LE SUJET. Ce code demandait le WebM EN
    // PREMIER et ne gardait l'audio/mp4 que comme « repli Safari ». Conséquence
    // mesurée : Android, qui sait faire les deux, produisait TOUJOURS du WebM —
    // un conteneur que Safari ne décode PAS. Tout vocal envoyé depuis un Android
    // était donc muet sur iPhone, et le destinataire ne voyait qu'un bouton ▶
    // sans effet. Le repli n'était pas en cause : c'était la préférence.
    // On demande donc d'abord le conteneur que LES DEUX plateformes savent lire.
    // Là où mp4 n'est pas encodable, le WebM reste pris — comportement inchangé.
    var mime = (typeof _passioBestAudioMime === "function") ? _passioBestAudioMime() : "";
    if (!mime && MediaRecorder.isTypeSupported) {
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) mime = "audio/webm;codecs=opus";
      else if (MediaRecorder.isTypeSupported("audio/webm")) mime = "audio/webm";
    }
    var vrOpts = { audioBitsPerSecond: 128000 };
    if (mime) vrOpts.mimeType = mime;
    try { _voiceRecorder = new MediaRecorder(stream, vrOpts); }
    catch (e0) { _voiceRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
    _voiceRecorder.ondataavailable = function (e) { if (e.data && e.data.size) _voiceChunks.push(e.data); };
    _voiceRecorder.onstop = function () {
      stream.getTracks().forEach(function (t) { t.stop(); });
      _voiceUIStop();
      var elapsed = Date.now() - _voiceStartAt;
      if (!_voiceCancelled && elapsed < 600) _voixConsigneCourte(); // toucher trop court : dire quoi faire
      // LOT-27 (MSG-C81) : rien de capté (0 octet) — l'application ne disait rien.
      if (!_voiceCancelled && elapsed >= 600 && !_voiceChunks.length) toast("L'enregistrement n'a pas fonctionné, réessaie", "warning");
      if (_voiceCancelled || !_voiceChunks.length || elapsed < 600) return; // tap trop court / annulé
      _mediaEnPreparation();
      var dur = Math.max(1, Math.round(elapsed / 1000));
      var blob = new Blob(_voiceChunks, { type: _voiceRecorder.mimeType || "audio/webm" });
      var reader = new FileReader();
      reader.onload = function () { _sendVoiceMessage(reader.result, dur); };
      reader.readAsDataURL(blob);
    };
    _voiceRecorder.start();
    window._isRecording = true;
    _voiceStartAt = Date.now();
    var bar = document.getElementById("voiceRecordBar");
    if (bar) bar.classList.add("active");
    try { var _bv = document.getElementById("btnVoice"); if (_bv) _bv.classList.add("record-active"); } catch (e) {}
    _voixMajBarre();
    var timerEl = document.getElementById("voiceRecordTimer");
    _voiceTimerInt = setInterval(function () {
      if (!timerEl) return;
      var s = Math.floor((Date.now() - _voiceStartAt) / 1000);
      timerEl.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    }, 250);
  } catch (e) {
    console.warn("startVoiceRecord:", e);
    // LOT-27 (MSG-C81) : un message qui sait ce qu'il dit, et ce qu'il faut faire.
    var refus = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
    toast(refus
      ? "Micro bloqué — autorise-le dans les réglages du site pour envoyer un vocal"
      : "Micro indisponible sur cet appareil — impossible d'enregistrer un vocal", "warning");
  }
}

function _voiceUIStop() {
  window._isRecording = false;
  if (_voiceTimerInt) { clearInterval(_voiceTimerInt); _voiceTimerInt = null; }
  var bar = document.getElementById("voiceRecordBar");
  if (bar) bar.classList.remove("active", "voice-annule");
  try { var _bv = document.getElementById("btnVoice"); if (_bv) _bv.classList.remove("record-active"); } catch (e) {}
  var timerEl = document.getElementById("voiceRecordTimer");
  if (timerEl) timerEl.textContent = "0:00";
}

function stopVoiceRecord() {
  if (_voiceRecorder && window._isRecording) {
    try { _voiceRecorder.stop(); } catch (e) { _voiceUIStop(); }
  }
}

function cancelVoiceRecord() {
  _voiceCancelled = true;
  if (_voiceRecorder && window._isRecording) {
    try { _voiceRecorder.stop(); } catch (e) {}
  }
  _voiceUIStop();
}

function _sendVoiceMessage(dataUrl, duration) {
  try {
    var fp = document.getElementById("conv-fullpage");
    if (!fp) return;
    var convId = fp.getAttribute("data-conv-id");
    var displayName = fp.getAttribute("data-display-name");
    if (!convId) return;
    var convs = getConversations();
    var c = convs.find(function (x) { return x.id === convId; });
    if (!c) return;
    if (!c.messages) c.messages = [];
    var msgId = "msg_" + uid();
    // ⚠️ NE PAS coder le conteneur en dur. `startVoiceRecord` négocie déjà le
    // meilleur encodeur de l'appareil : webm/opus sur Android, `audio/mp4` sur
    // Safari/iOS (qui ne sait PAS produire de webm). Écrire « audio/webm » ici
    // envoyait donc un fichier mp4 nommé `.webm` et servi par Storage avec un
    // Content-Type mensonger : injouable pour TOUT LE MONDE, y compris pour le
    // destinataire Android. Le type réel est porté par la data-URL elle-même.
    var _vt = (String(dataUrl).match(/^data:([^;,]+)/) || [])[1] || "audio/webm";
    var _vext = _vt.indexOf("mp4") >= 0 ? "m4a" : (_vt.indexOf("ogg") >= 0 ? "ogg" : "webm");
    // Même pipeline que la pièce jointe (`_pjDeposer`) : « envoi… » dès la bulle,
    // dépôt puis insertion avec leur verdict, coupure en file, refus dit. ⛔ Le
    // vocal partait sinon par le même repli sur la data URL — même défaut, même
    // perte (2026-11-07). Un vocal perdu ne se refait pas.
    var _de = (typeof _fileProprietaire === "function") ? _fileProprietaire() : null;
    c.messages.push({ id: msgId, from: "me", text: "", voiceData: dataUrl, voiceDuration: duration, at: Date.now(),
      status: "sending", de: _de,
      pj: { kind: "audio", nom: "Message vocal (" + duration + "s)", type: _vt, chemin: _pjCheminNeuf(convId, "voice." + _vext), cache: "3600", tentatives: 0 } });
    c.lastAt = Date.now();
    saveConversations();
    if (typeof renderConvFpThread === "function") renderConvFpThread(c, displayName);
    if (typeof renderMessages === "function") renderMessages();

    // Le dépôt retient lui-même la page pendant l'envoi (pwa-detect.js), comme
    // pour une pièce jointe ; l'URL canonique passe par `cdnUrl`, et le lecteur la
    // signe au moment de lire (`_playVoiceById`, app-04).
    _pjDeposer(convId, msgId, {
      voie: "premier", interactif: true, proprietaire: _de,
      contexte: { generation: (typeof _outboxGenerationActuelle === "function") ? _outboxGenerationActuelle() : null, auteur: (typeof MY_UID !== "undefined") ? MY_UID : null },
    });
  } catch (e) { console.error("_sendVoiceMessage:", e); }
}
// ═══ fin wrappers messagerie ═══ (audit 2026-06-10)

function pwaDismiss() {
  const ov = document.getElementById("pwa-overlay");
  if (ov) {
    ov.style.animation = "pwaFadeIn .25s ease reverse both";
    setTimeout(() => { ov.style.display = "none"; ov.style.animation = ""; }, 220);
  }
  // 🔧 FIX AUDIT 2026-06-10 : mémorise le refus pour ne pas re-proposer
  // l'installation à chaque navigation dans la même session.
  try { sessionStorage.setItem("passio_pwa_dismissed", "1"); } catch (e) {}
}

// ═══ Cadrage bas : hauteur RÉELLE du viewport (--app-vh, 2026-07-22) ═══
// Bug corrigé : « certaines fois, à l'ouverture, la barre d'onglets est cachée
// par la barre système du téléphone ». `100dvh` est résolu par plusieurs
// navigateurs mobiles avec le GRAND viewport au tout premier paint (barre
// d'URL / barre système considérées absentes) ; comme body est en
// overflow:hidden, plus aucun scroll ni resize ne vient corriger ensuite et le
// shell reste trop haut pour toute la session. On mesure donc nous-mêmes le
// PLUS PETIT viewport visible et on l'impose via --app-vh (styles.css).
function _measureAppVh() {
  var h = window.innerHeight || document.documentElement.clientHeight || 0;
  var vv = window.visualViewport;
  // vv.height suit la barre d'URL ET la barre système : on prend le minimum.
  // Ignoré si l'utilisateur a zoomé (pinch) : vv.height n'est alors plus le
  // viewport de mise en page.
  if (vv && (!vv.scale || vv.scale <= 1.05)) {
    var vh = Math.round(vv.height);
    if (vh > 0 && vh < h) h = vh;
  }
  return h;
}

function syncAppViewportHeight() {
  var h = _measureAppVh();
  if (!h) return;
  var root = document.documentElement;
  var prev = parseFloat(root.style.getPropertyValue("--app-vh")) || 0;
  // Clavier virtuel ouvert : ne PAS figer une hauteur amputée (sinon le shell
  // reste rétréci après la fermeture du clavier).
  var ae = document.activeElement;
  var typing = !!(ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable));
  if (typing && prev && h < prev * 0.75) return;
  if (Math.abs(h - prev) < 1) return;
  root.style.setProperty("--app-vh", h + "px");
}

(function () {
  var raf = 0;
  function schedule() {
    // Page cachée : rAF est GELÉ par le navigateur (une rotation ou une barre
    // système apparue en arrière-plan ne serait jamais prise en compte) →
    // mesure directe, il n'y a de toute façon aucun rendu à ménager.
    if (document.hidden) { syncAppViewportHeight(); return; }
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; syncAppViewportHeight(); });
  }
  syncAppViewportHeight();
  // Les navigateurs mobiles stabilisent leurs barres APRÈS le premier paint :
  // quelques re-mesures différées valent mieux qu'une seule au chargement.
  [60, 300, 900].forEach(function (d) { setTimeout(syncAppViewportHeight, d); });
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", function () { setTimeout(syncAppViewportHeight, 200); });
  window.addEventListener("pageshow", schedule);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) schedule(); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", schedule);
    window.visualViewport.addEventListener("scroll", schedule);
  }
  // Filet : certains navigateurs mobiles changent la géométrie SANS émettre de
  // resize (c'est précisément le cas qui laissait la barre d'onglets sous la
  // barre système). Au premier contact tactile on re-vérifie — une lecture de
  // innerHeight, corrigée seulement en cas de divergence réelle.
  document.addEventListener("touchstart", function () {
    var cur = parseFloat(document.documentElement.style.getPropertyValue("--app-vh")) || 0;
    if (!cur || Math.abs(_measureAppVh() - cur) > 2) schedule();
  }, { passive: true });
})();

// ═══ En-tête du fil : filtres, moods et stories RESTENT AFFICHÉS ═══
// (retrait de l'en-tête rétractable, 2026-08-29, sur demande de Benjamin :
//  « quand je descends puis remonte, les profils et les moods ne s'affichent
//    plus — laisse-les apparaître constamment ».)
//
// Ce qu'il y avait ici : un écouteur de défilement qui posait `.chrome-collapsed`
// sur `.app-main` en descendant dans le fil (repliant `.profile-strip`,
// `.mood-selector` et `.stories-row`) et la retirait en remontant.
//
// ⚠️ Pourquoi il ne suffisait PAS de corriger la remontée. Le défaut vécu est
// réel et sa cause est identifiée : le garde anti-oscillation du 2026-08-28
// (`enStabilisation`) ne se relâchait qu'en observant DEUX événements de
// défilement consécutifs à la MÊME position. Sur mobile, le dernier événement
// d'un geste tactile arrive presque toujours à une position différente de la
// précédente, puis plus rien n'est émis : le verrou restait armé indéfiniment,
// et la remontée suivante était avalée par le `return` de stabilisation. En
// clair : une fois replié, l'en-tête ne se rouvrait plus.
//
// La bascule était donc coincée entre deux exigences contradictoires — replier
// déplace `scrollTop` (l'ancrage de Chrome compense mal), donc tout seuil
// symétrique fait osciller, et tout garde anti-oscillation fige. Le repli lui
// même n'apportait qu'un gain de place ; les passions, les moods et les stories
// sont au contraire les portes d'entrée du fil. On retire la bascule.
//
// Conséquences à connaître avant de la ressusciter :
//  · plus aucune transition `max-height` ne tourne au-dessus de `#feedList`
//    pendant le défilement — c'est ce mouvement sub-pixel permanent qui faisait
//    refuser des clics à Playwright (« element is not stable », cf.
//    tests/e2e/interactions.spec.js) ;
//  · les règles `.chrome-collapsed` ont été retirées de styles.css avec ce
//    code : aucune classe n'est plus posée nulle part.

// ═══ LOT-42 (audit UX/UI du 2026-11-10, MSG-C88) : la conversation se cale sur
// le CLAVIER. `syncAppViewportHeight` refuse — à raison — de réduire `--app-vh`
// pendant la frappe (une hauteur amputée resterait figée après la fermeture du
// clavier, zone réglée trois fois). Mais la coque garde alors toute sa hauteur
// et le navigateur fait glisser la page pour montrer le champ : l'en-tête
// (retour, nom) sort de l'écran. Pendant la frappe DANS une conversation, et
// seulement quand la zone visible a vraiment rétréci (clavier), SEUL
// #conv-fullpage prend la hauteur et la position de `visualViewport` : en-tête
// en haut, fil réduit, barre au-dessus du clavier. Tout est retiré dès que le
// clavier se ferme ou que le champ perd le focus — `--app-vh` n'est jamais
// touché.
function calerConvSurClavier() {
  try {
    var fp = document.getElementById("conv-fullpage");
    if (!fp) return;
    var vv = window.visualViewport;
    var ae = document.activeElement;
    var frappe = !!(ae && fp.contains(ae) && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable));
    var total = window.innerHeight || document.documentElement.clientHeight || 0;
    var clavier = !!(vv && total && fp.classList.contains("active") && frappe
      && (!vv.scale || vv.scale <= 1.05) && vv.height < total * 0.85);
    if (!clavier) {
      if (fp.classList.contains("conv-cale-clavier")) {
        fp.classList.remove("conv-cale-clavier");
        fp.style.removeProperty("top");
        fp.style.removeProperty("height");
        fp.style.removeProperty("bottom");
      }
      return;
    }
    var parent = fp.offsetParent || fp.parentElement;
    var haut = parent ? parent.getBoundingClientRect().top : 0;
    var thread = document.getElementById("convFpThread");
    var auBas = !!(thread && thread.scrollTop + thread.clientHeight >= thread.scrollHeight - 80);
    fp.classList.add("conv-cale-clavier");
    fp.style.setProperty("top", Math.round((vv.offsetTop || 0) - haut) + "px");
    fp.style.setProperty("bottom", "auto");
    fp.style.setProperty("height", Math.round(vv.height) + "px");
    if (auBas && thread) thread.scrollTop = thread.scrollHeight;
  } catch (e) { try { diagLog("calerConvSurClavier : " + (e && e.message)); } catch (_) {} }
}
(function () {
  var vv = window.visualViewport;
  if (vv) {
    vv.addEventListener("resize", calerConvSurClavier);
    vv.addEventListener("scroll", calerConvSurClavier);
  }
  document.addEventListener("focusin", function () { setTimeout(calerConvSurClavier, 0); });
  document.addEventListener("focusout", function () { setTimeout(calerConvSurClavier, 0); });
})();
