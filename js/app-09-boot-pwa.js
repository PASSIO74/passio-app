boot().catch(e => console.error("Boot error:", e));

// ======== PWA INSTALL OVERLAY ========
// (_isIOS, _isStandalone, _pwaInstalled sont déclarés dans le <head>)

function pwaShowOverlay() {
  const ov = document.getElementById("pwa-overlay");
  if (!ov || _isStandalone) return;
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

  // ═══ CAS 3 : iPhone/iPad sur Chrome/Firefox iOS → rediriger vers Safari ═══
  } else if (_isIOSOther) {
    const safariUrl = APP_URL;
    content.innerHTML = `
      <div style="text-align:center;padding:8px 0 16px;">
        <div style="font-size:44px;margin-bottom:10px;">🍎</div>
        <div style="font-size:16px;font-weight:800;color:#1e1b4b;margin-bottom:8px;">Ouvrir dans Safari</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">Sur iPhone/iPad, seul <strong>Safari</strong> peut installer les apps web. Appuie sur le bouton ci-dessous :</div>
        <button class="pwa-btn-install" onclick="window.location.href='${safariUrl}'" style="margin-bottom:10px;">
          🧭&nbsp;&nbsp;Ouvrir dans Safari
        </button>
        <button class="pwa-btn-skip" onclick="pwaDismiss()">Plus tard</button>
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
    if (typeof toast === 'function') toast('Installation en cours…', 'info');
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

  // Icône adaptée selon le navigateur
  var icon = _isEdge ? '🟦' : '🟡';
  var name = _isEdge ? 'Edge' : _isSamsung ? 'Samsung Internet' : 'Chrome';
  var hint = _isEdge
    ? 'Regarde en haut à droite dans la barre d\'adresse : clique sur l\'icône <strong style="font-size:16px;">⊕</strong> ou <strong style="font-size:16px;">📥</strong> pour installer PASSIO.'
    : 'Regarde en haut à droite dans la barre d\'adresse : clique sur l\'icône <strong style="font-size:16px;">⊕</strong> ou <strong style="font-size:16px;">💾</strong> pour installer PASSIO.';

  content.innerHTML =
    '<div style="text-align:center;padding:4px 0 12px;">' +
    '<div style="font-size:40px;margin-bottom:10px;">' + icon + '</div>' +
    '<div style="font-size:15px;font-weight:800;color:#1e1b4b;margin-bottom:10px;">Installe via ' + name + '</div>' +
    '<div style="background:#f5f3ff;border-radius:14px;padding:14px;margin-bottom:14px;text-align:left;font-size:13px;color:#374151;line-height:1.6;">' +
    hint +
    '</div>' +
    '<button class="pwa-btn-install" onclick="pwaDismiss();window.focus();" style="margin-bottom:8px;">✅&nbsp;&nbsp;Compris, je cherche l\'icône</button>' +
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

  results.forEach(function(emoji) {
    var div = document.createElement("div");
    div.className = "emoji-item";
    div.textContent = emoji;
    div.onclick = function() { insertEmoji(emoji); };
    grid.appendChild(div);
  });
}

// Populate emoji grid
function _populateEmojiGrid() {
  var grid = document.getElementById("emojiGrid");
  if (!grid) {
    console.error("emojiGrid not found");
    return;
  }

  grid.innerHTML = "";

  // Vérifier que EMOJIS existe
  if (typeof EMOJIS === 'undefined' || !Array.isArray(EMOJIS)) {
    console.error("EMOJIS not defined or not an array");
    grid.innerHTML = '<div style="grid-column:span 8;padding:20px;text-align:center;color:red;">Erreur: Emojis non disponibles</div>';
    return;
  }

  // Remplir avec tous les emojis
  EMOJIS.forEach(function(emoji) {
    var div = document.createElement("div");
    div.className = "emoji-item";
    div.textContent = emoji;
    div.style.cursor = "pointer";
    div.onclick = function() {
      insertEmoji(emoji);
    };
    grid.appendChild(div);
  });

  console.log("✅ " + EMOJIS.length + " emojis populés");
}

// Call on page load - avec délai pour garantir que le DOM est chargé
setTimeout(function() {
  _populateEmojiGrid();
  console.log("✅ Emoji grid populated with " + EMOJIS.length + " emojis");
}, 100);

// Insert emoji into message input
function insertEmoji(e) {
  try {
    var inp = document.getElementById("convFpInput");
    if (!inp) return;
    var start = inp.selectionStart != null ? inp.selectionStart : inp.value.length;
    var end = inp.selectionEnd != null ? inp.selectionEnd : inp.value.length;
    inp.value = inp.value.slice(0, start) + e + inp.value.slice(end);
    inp.focus();
    var pos = start + [...e].length;
    try { inp.setSelectionRange(pos, pos); } catch(_) {}
    if (typeof autoResizeTextarea === "function") autoResizeTextarea(inp);
    _closeEmojiPanel();
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

    var convs = getConversations();
    var c = convs.find(x => x.id === convId);
    if (!c) {
      _diag("_sendGif: Conversation NOT FOUND");
      return;
    }

    var msgId = "msg_" + uid();
    if (!c.messages) c.messages = [];
    c.messages.push({ id: msgId, from: "me", text: "", gif: gifUrl, at: Date.now() });
    c.lastAt = Date.now();

    _diag("_sendGif: Message créé localement - msgId=" + msgId);
    saveConversations();

    if (typeof renderConvFpThread === "function") renderConvFpThread(c, displayName);
    if (typeof renderMessages === "function") renderMessages();

    // Sync Supabase
    if (typeof supa === 'undefined' || !supa) {
      _diag("_sendGif: Supabase NOT AVAILABLE");
      return;
    }
    if (!MY_UID) {
      _diag("_sendGif: MY_UID NOT SET");
      return;
    }

    _diag("_sendGif: Sync Supabase - Envoi du GIF...");
    _diag("_sendGif: MY_UID=" + MY_UID);

    // Vérifier que MY_UID est défini
    // Sync Supabase pour synchronisation multi-appareils
    _diag("_sendGif: Tentative Supabase...");

    // Encoder le GIF dans le content en JSON
    var contentData = {type: "gif", url: gifUrl, text: "🎬 GIF"};
    var contentJson = JSON.stringify(contentData);

    // Essayer INSERT SANS from_id d'abord (pour contourner la contrainte)
    supa.from("conv_messages").insert({
      id: msgId,
      conv_id: convId,
      content: contentJson,
      created_at: new Date().toISOString()
    }).then(function(res) {
      if (res.error) {
        _diag("_sendGif: Erreur sans from_id - " + res.error.message);
        // Fallback: essayer AVEC from_id
        _diag("_sendGif: Fallback - essai avec from_id...");
        if (MY_UID) {
          supa.from("conv_messages").insert({
            id: msgId,
            conv_id: convId,
            from_id: MY_UID,
            content: contentJson,
            created_at: new Date().toISOString()
          }).then(function(res2) {
            if (!res2.error) {
              _diag("_sendGif: ✅ Supabase OK (avec from_id)");
            }
          }).catch(function() {});
        }
      } else {
        _diag("_sendGif: ✅ Supabase OK (sans from_id)");
      }
    }).catch(function(err) {
      _diag("_sendGif: Catch - " + err.message);
    });

    _diag("_sendGif: ✅ Sauvegarde locale OK");
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

function handleAttachFile(input, kind) {
  var file = input.files && input.files[0];
  if (!file) {
    _diag("handleAttachFile: Aucun fichier sélectionné");
    return;
  }

  _diag("handleAttachFile: Fichier sélectionné - " + file.name + " (" + file.type + ")");

  var fp = document.getElementById("conv-fullpage");
  if (!fp) {
    _diag("handleAttachFile: conv-fullpage NOT FOUND");
    return alert("Ouvre une conversation d'abord");
  }

  var convId = fp.getAttribute("data-conv-id");
  var displayName = fp.getAttribute("data-display-name");
  if (!convId) {
    _diag("handleAttachFile: convId NOT FOUND");
    return;
  }

  _diag("handleAttachFile: convId=" + convId + ", kind=" + kind);

  // Lire le fichier pour l'affichage local ET pour l'upload à Supabase Storage
  var reader = new FileReader();
  reader.onload = function(e) {
    var dataUrl = e.target.result;
    _diag("handleAttachFile: FileReader completed - taille=" + dataUrl.length);

    var convs = getConversations ? getConversations() : (window.conversationsState || []);
    var c = convs.find(x => x.id === convId);
    if (!c || !c.messages) {
      _diag("handleAttachFile: Conversation NOT FOUND or no messages array");
      return;
    }

    var msgId = "msg_" + (Date.now().toString(36) + Math.random().toString(36).substr(2));
    var msg = {id: msgId, from: "me", text: "", at: Date.now()};

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
      _diag("handleAttachFile: AUDIO added");
    } else if(kind === 'doc') {
      msg.docData = dataUrl;
      msg.fileName = file.name;
      msg.fileSize = (file.size/1024).toFixed(0) + " KB";
      msg.fileType = file.name.split(".").pop().toUpperCase();
      _diag("handleAttachFile: DOCUMENT added");
    }

    c.messages.push(msg);
    c.lastAt = Date.now();

    _diag("handleAttachFile: Message ajouté localement");

    if(typeof saveConversations === 'function') saveConversations();
    if(typeof renderConvFpThread === 'function') renderConvFpThread(c, displayName);
    if(typeof renderMessages === 'function') renderMessages();

    // Upload à Supabase Storage pour la synchronisation
    _diag("handleAttachFile: Upload Supabase Storage...");

    var fileName = Date.now() + "_" + Math.random().toString(36).substr(2, 9) + "_" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    var storagePath = "attachments/" + convId + "/" + fileName;

    // Convertir le data URL en blob pour l'upload
    var byteString = atob(dataUrl.split(',')[1]);
    var ab = new ArrayBuffer(byteString.length);
    var ia = new Uint8Array(ab);
    for (var i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    var blob = new Blob([ab], { type: file.type });

    // Upload le fichier à Supabase Storage
    supa.storage.from("attachments").upload(storagePath, blob, {
      cacheControl: "3600",
      upsert: false
    }).then(function(storageRes) {
      if (storageRes.error) {
        _diag("handleAttachFile: ❌ Storage upload failed - " + storageRes.error.message + " (fallback sur data URL)");
        sendMessageToSupabase(msgId, convId, dataUrl, file.type, file.name, kind);
      } else {
        // Récupérer l'URL publique
        var storageUrl = supa.storage.from("attachments").getPublicUrl(storagePath).data.publicUrl;
        _diag("handleAttachFile: ✅ Storage URL: " + storageUrl);
        sendMessageToSupabase(msgId, convId, storageUrl, file.type, file.name, kind);
      }
    }).catch(function(err) {
      _diag("handleAttachFile: Storage exception - " + err.message + " (fallback)");
      sendMessageToSupabase(msgId, convId, dataUrl, file.type, file.name, kind);
    });

    _diag("handleAttachFile: ✅ Sauvegarde locale OK");
    input.value = "";
  };
  reader.readAsDataURL(file);
}

function sendMessageToSupabase(msgId, convId, fileUrl, fileType, fileName, kind) {
  // Encoder dans le content en JSON
  var contentData = {
    type: kind,
    filename: fileName,
    fileType: fileType,
    url: fileUrl,
    text: "[" + kind.toUpperCase() + "] " + fileName
  };
  var contentJson = JSON.stringify(contentData);

  _diag("handleAttachFile: Envoi à Supabase - URL length: " + fileUrl.length);

  // Essayer INSERT SANS from_id d'abord
  supa.from("conv_messages").insert({
    id: msgId,
    conv_id: convId,
    content: contentJson,
    created_at: new Date().toISOString()
  }).then(function(res) {
    if (res.error) {
      _diag("handleAttachFile: Erreur sans from_id - " + res.error.message);
      // Fallback: essayer AVEC from_id
      if (MY_UID) {
        _diag("handleAttachFile: Fallback - essai avec from_id...");
        supa.from("conv_messages").insert({
          id: msgId,
          conv_id: convId,
          from_id: MY_UID,
          content: contentJson,
          created_at: new Date().toISOString()
        }).then(function(res2) {
          if (!res2.error) {
            _diag("handleAttachFile: ✅ Supabase OK (avec from_id)");
          }
        }).catch(function() {});
      }
    } else {
      _diag("handleAttachFile: ✅ Supabase OK (sans from_id)");
    }
  }).catch(function(err) {
    _diag("handleAttachFile: Catch - " + err.message);
  });
}

function shareLocation() {
  var fp = document.getElementById("conv-fullpage");
  if (!fp) return alert("Ouvre une conversation d'abord");
  if (!navigator.geolocation) return alert("Géolocalisation non supportée");

  alert("Localisation en cours...");
  navigator.geolocation.getCurrentPosition(function(pos) {
    var lat = pos.coords.latitude.toFixed(5);
    var lng = pos.coords.longitude.toFixed(5);
    var url = "https://maps.google.com/?q=" + lat + "," + lng;

    var convId = fp.getAttribute("data-conv-id");
    var displayName = fp.getAttribute("data-display-name");
    var convs = getConversations ? getConversations() : (window.conversationsState || []);
    var c = convs.find(x => x.id === convId);
    if (!c) return;

    var msgId = "msg_" + (Date.now().toString(36) + Math.random().toString(36).substr(2));
    var msgText = "📍 Ma position : " + url;
    c.messages.push({id: msgId, from: "me", text: msgText, at: Date.now()});
    c.lastAt = Date.now();

    if(typeof saveConversations === 'function') saveConversations();

    // Sync Supabase pour synchronisation multi-appareils
    if(typeof supa !== 'undefined' && supa) {
      // Encoder dans le content en JSON
      var contentData = {
        type: "location",
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        url: url,
        text: msgText
      };
      var contentJson = JSON.stringify(contentData);

      // Essayer SANS from_id d'abord
      supa.from("conv_messages").insert({
        id: msgId,
        conv_id: convId,
        content: contentJson,
        created_at: new Date().toISOString()
      }).then(function(res) {
        if(res.error) {
          // Fallback: essayer AVEC from_id
          if (MY_UID) {
            supa.from("conv_messages").insert({
              id: msgId,
              conv_id: convId,
              from_id: MY_UID,
              content: contentJson,
              created_at: new Date().toISOString()
            }).catch(function() {});
          }
        }
      }).catch(function(err) {
        // Continuer même en cas d'erreur
      });
    }

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
  }, function() {
    alert("Impossible d'obtenir la position");
  });
}

function openConvFiles() {
  toggleAttachMenu();
  alert("Ouverture des pièces jointes (fonction en développement)");
}

function openConvSettings(convId) {
  try {
    var panel = document.getElementById("convSettingsPanel");
    var content = document.getElementById("convSettingsContent");
    if (!panel) return;
    var convs = getConversations();
    var c = convs.find(function(x) { return x.id === convId; });
    if (!c) return;
    content.innerHTML = `
      <div class="csetting-section">CONVERSATION</div>
      <div class="csetting-item" onclick="_toggleMuteConv('${convId}')">
        <div class="csetting-icon">${c._muted ? '🔕' : '🔔'}</div>
        <div class="csetting-label">${c._muted ? 'Activer les notifications' : 'Couper les notifications'}</div>
      </div>
      <div class="csetting-section">ACTIONS</div>
      <div class="csetting-item" onclick="_clearConvMessages('${convId}')">
        <div class="csetting-icon">🗑️</div>
        <div class="csetting-label" style="color:var(--muted);">Effacer les messages</div>
      </div>
      <div class="csetting-item" onclick="_exportConv('${convId}')">
        <div class="csetting-icon">📤</div>
        <div class="csetting-label">Exporter la conversation</div>
      </div>
      ${!c.isGroup ? `<div class="csetting-item" onclick="_deleteConv('${convId}')">
        <div class="csetting-icon">❌</div>
        <div class="csetting-label" style="color:#ef4444;">Supprimer la conversation</div>
      </div>` : ''}
    `;
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
}

function _clearConvMessages(convId) {
  if (!confirm("Effacer tous les messages ?")) return;
  var convs = getConversations();
  var c = convs.find(function(x){ return x.id === convId; });
  if (!c) return;
  c.messages = [];
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

function _deleteConv(convId) {
  if (!confirm("Supprimer cette conversation ?")) return;
  conversationsState = (conversationsState||[]).filter(function(c){ return c.id !== convId; });
  saveConversationsNow();
  closeConvSettings();
  closeConversation();
  toast("Conversation supprimée");
}
// ═══ fin wrappers messagerie ═══

function pwaDismiss() {
  const ov = document.getElementById("pwa-overlay");
  if (ov) {
    ov.style.animation = "pwaFadeIn .25s ease reverse both";
    setTimeout(() => { ov.style.display = "none"; ov.style.animation = ""; }, 220);
  }
}
