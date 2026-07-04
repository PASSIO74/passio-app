/* ============================================================
   PASSIO · ACCESS GATE (verrouillage pré-lancement)
   ------------------------------------------------------------
   Bloque TOUTE l'application tant qu'un code d'accès valide
   n'a pas été saisi. Chargé en <head>, AVANT le code de l'app :
   - masque l'app (html.passio-locked) dès le parsing ;
   - expose window.__gateReady (Promise) que boot() attend ;
   - couvre routes internes, deep links et URL directes
     (SPA : tout passe par index.html, donc par ce gate).

   🔑 CHANGER LE CODE D'ACCÈS :
   1. Choisir le nouveau code, ex. "4807".
   2. Générer le hash :  node -e "console.log(require('crypto')
      .createHash('sha256').update('passio-gate-v1::4807').digest('hex'))"
      (ou dans la console navigateur : voir docs/SECURITE_CODE_ACCES.md)
   3. Remplacer GATE_HASH ci-dessous par le résultat.
   Le code n'est JAMAIS stocké en clair : seul son hash SHA-256
   salé est embarqué. Migration future (beta-testeurs, liste
   blanche, invitations) : remplacer verifyCode() par un appel
   à une Edge Function Supabase — voir docs/SECURITE_CODE_ACCES.md.
   ============================================================ */
(function () {
  "use strict";

  var GATE_SALT = "passio-gate-v1::";
  var GATE_HASH = "67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f";
  var GATE_KEY  = "passio_gate_v1"; // sessionStorage → redemandé à chaque ouverture
  var CODE_LEN  = 4;

  // ---- Déjà déverrouillé dans cette session ? ----
  var unlocked = false;
  try { unlocked = sessionStorage.getItem(GATE_KEY) === GATE_HASH; } catch (e) {}

  var resolveGate;
  window.__gateReady = unlocked
    ? Promise.resolve()
    : new Promise(function (res) { resolveGate = res; });

  if (unlocked) return;

  // Masque l'app immédiatement (avant tout rendu)
  document.documentElement.classList.add("passio-locked");

  // ---- SHA-256 : crypto.subtle (https/localhost) + fallback pur JS ----
  function sha256Hex(str) {
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(str))
        .then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return ("0" + b.toString(16)).slice(-2);
          }).join("");
        })
        .catch(function () { return Promise.resolve(sha256Fallback(str)); });
    }
    return Promise.resolve(sha256Fallback(str));
  }

  // Fallback SHA-256 minimal (contexte non sécurisé : file://, IP locale)
  function sha256Fallback(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var mathPow = Math.pow, maxWord = mathPow(2, 32), result = "";
    var words = [], asciiBitLength = ascii.length * 8;
    var hash = [], k = [], primeCounter = 0, isComposite = {}, candidate;
    for (candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i2 = 0; i2 < 313; i2 += candidate) isComposite[i2] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += "\x80";
    while (ascii.length % 64 - 56) ascii += "\x00";
    for (var i = 0; i < ascii.length; i++) {
      var j = ascii.charCodeAt(i);
      if (j >> 8) return ""; // ASCII only
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (asciiBitLength / maxWord) | 0;
    words[words.length] = asciiBitLength;
    for (var jj = 0; jj < words.length;) {
      var w = words.slice(jj, jj += 16), oldHash = hash;
      hash = hash.slice(0, 8);
      for (var ii = 0; ii < 64; ii++) {
        var w15 = w[ii - 15], w2 = w[ii - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7]
          + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
          + ((e & hash[5]) ^ (~e & hash[6])) + k[ii]
          + (w[ii] = (ii < 16) ? w[ii] : (w[ii - 16]
            + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3))
            + w[ii - 7]
            + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (var iii = 0; iii < 8; iii++) hash[iii] = (hash[iii] + oldHash[iii]) | 0;
    }
    for (var iv = 0; iv < 8; iv++) {
      for (var b = 3; b + 1; b--) {
        var byteV = (hash[iv] >> (b * 8)) & 255;
        result += ((byteV < 16) ? 0 : "") + byteV.toString(16);
      }
    }
    return result;
  }

  function verifyCode(input) {
    return sha256Hex(GATE_SALT + String(input)).then(function (h) {
      return h === GATE_HASH;
    });
  }

  // ---- Styles ----
  var css = ""
    + "html.passio-locked .app-shell,html.passio-locked #pwaLanding{display:none!important}"
    + "#passioGate{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;"
    + "background:radial-gradient(120% 120% at 20% 0%,#2e1065 0%,#1e1b4b 45%,#0f0a2e 100%);overflow:hidden;"
    + "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}"
    + "#passioGate::before{content:'';position:absolute;width:520px;height:520px;border-radius:50%;"
    + "background:radial-gradient(circle,rgba(167,139,250,.28),transparent 65%);top:-180px;right:-140px;filter:blur(8px);"
    + "animation:pgFloat 9s ease-in-out infinite alternate}"
    + "#passioGate::after{content:'';position:absolute;width:420px;height:420px;border-radius:50%;"
    + "background:radial-gradient(circle,rgba(124,58,237,.22),transparent 65%);bottom:-160px;left:-120px;filter:blur(8px);"
    + "animation:pgFloat 11s ease-in-out infinite alternate-reverse}"
    + "@keyframes pgFloat{from{transform:translateY(0) scale(1)}to{transform:translateY(34px) scale(1.07)}}"
    + ".pg-card{position:relative;z-index:2;width:min(360px,calc(100vw - 48px));padding:40px 28px 32px;border-radius:28px;"
    + "background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);"
    + "box-shadow:0 24px 70px rgba(0,0,0,.45);text-align:center;animation:pgIn .65s cubic-bezier(.22,1,.36,1) both}"
    // ⚠️ from opacity:.01 (pas 0) : à 0, le texte est peint UNE fois (ignoré par
    // le paint-timing) puis le fondu se joue sur le compositeur sans repaint →
    // Chrome n'émet JAMAIS de First Contentful Paint (Lighthouse NO_FCP, CrUX
    // faussé). À .01 le premier paint est « contentful » — visuellement identique.
    + "@keyframes pgIn{from{opacity:.01;transform:translateY(26px) scale(.96)}to{opacity:1;transform:none}}"
    + ".pg-logo{width:72px;height:72px;border-radius:20px;margin:0 auto 18px;display:block;"
    + "box-shadow:0 10px 30px rgba(124,58,237,.45);animation:pgPulse 2.6s ease-in-out infinite}"
    + "@keyframes pgPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}"
    + ".pg-badge{display:inline-block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#ddd6fe;"
    + "background:rgba(167,139,250,.16);border:1px solid rgba(167,139,250,.35);border-radius:999px;padding:4px 12px;margin-bottom:14px}"
    + ".pg-title{color:#fff;font-size:22px;font-weight:800;margin:0 0 6px}"
    + ".pg-sub{color:rgba(221,214,254,.75);font-size:13.5px;line-height:1.5;margin:0 0 26px}"
    + ".pg-dots{display:flex;justify-content:center;gap:14px;margin-bottom:22px;cursor:pointer}"
    + ".pg-dot{width:52px;height:60px;border-radius:16px;background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.18);"
    + "display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#fff;transition:all .18s ease}"
    + ".pg-dot.filled{background:rgba(167,139,250,.22);border-color:#a78bfa;box-shadow:0 0 0 3px rgba(167,139,250,.18)}"
    + ".pg-dot.active{border-color:#c4b5fd;box-shadow:0 0 0 3px rgba(196,181,253,.22)}"
    + ".pg-input{position:absolute;opacity:0;pointer-events:none;left:-9999px}"
    + ".pg-err{min-height:18px;font-size:12.5px;color:#fca5a5;margin-bottom:8px;opacity:0;transition:opacity .2s}"
    + ".pg-err.show{opacity:1}"
    + ".pg-card.shake{animation:pgShake .45s ease}"
    + "@keyframes pgShake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-7px)}40%,60%{transform:translateX(7px)}}"
    + ".pg-foot{font-size:11px;color:rgba(221,214,254,.45);margin-top:18px}"
    + "#passioGate.pg-unlock{animation:pgOut .55s cubic-bezier(.55,0,.55,.2) .25s both}"
    + "#passioGate.pg-unlock .pg-card{animation:pgCardOut .5s ease both}"
    + "@keyframes pgOut{to{opacity:0;visibility:hidden}}"
    + "@keyframes pgCardOut{to{opacity:0;transform:scale(1.06)}}"
    + ".pg-dot.ok{background:rgba(74,222,128,.2);border-color:#4ade80}"
    + "@media (prefers-reduced-motion:reduce){#passioGate::before,#passioGate::after,.pg-logo{animation:none!important}"
    + ".pg-card{animation-duration:.01s!important}}"
    // Onglet caché/prérendu : les animations CSS ne démarrent pas, or l'entrée de
    // .pg-card part de opacity:0 (fill both) → la page ne PEINT jamais rien
    // (constaté par Lighthouse : NO_FCP). Dans ce cas on saute l'animation.
    + "html.pg-noanim .pg-card{animation:none!important}";

  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  (document.head || document.documentElement).appendChild(styleEl);
  try { if (document.hidden) document.documentElement.classList.add("pg-noanim"); } catch (e) {}

  // Même logo que l'app (flèche Ascension)
  var LOGO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='gA' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%23ddd6fe'/><stop offset='1' stop-color='%23a78bfa'/></linearGradient></defs><rect width='100' height='100' rx='22' fill='url(%23gA)'/><path d='M24 24 L76 24 L24 76' stroke='%23ffffff' stroke-width='13' stroke-linecap='round' stroke-linejoin='round' fill='none'/><path d='M76 24 L76 76' stroke='%234c1d95' stroke-width='13' stroke-linecap='round' fill='none'/></svg>";

  function buildUI() {
    if (document.getElementById("passioGate")) return;

    var name = "";
    try {
      // ⚠️ La clé d'état est passio_mvp_state_v1 (STATE_KEY, app-02) — l'ancienne
      // lecture de "passio_state" ne trouvait jamais rien : le « Bon retour,
      // <prénom> » ne s'affichait jamais.
      var st = JSON.parse(localStorage.getItem("passio_mvp_state_v1") || localStorage.getItem("passio_state") || "null");
      name = (st && st.user && st.user.name) ? st.user.name : "";
    } catch (e) {}

    var gate = document.createElement("div");
    gate.id = "passioGate";
    gate.innerHTML =
      '<div class="pg-card" role="dialog" aria-label="Accès sécurisé PASSIO">' +
        '<img class="pg-logo" alt="PASSIO" src="' + LOGO + '"/>' +
        '<div class="pg-badge">Beta privée</div>' +
        '<h1 class="pg-title">' + (name ? "Bon retour, " + escapeHtmlGate(name) + " 👋" : "Bienvenue sur PASSIO") + "</h1>" +
        '<p class="pg-sub">L’application n’est pas encore ouverte au public.<br/>Saisis ton code d’accès pour continuer.</p>' +
        '<div class="pg-dots" id="pgDots"></div>' +
        '<input class="pg-input" id="pgInput" type="tel" inputmode="numeric" autocomplete="one-time-code" maxlength="' + CODE_LEN + '" aria-label="Code d’accès"/>' +
        '<div class="pg-err" id="pgErr">Code incorrect. Réessaie.</div>' +
        '<div class="pg-foot">Accès réservé · PASSIO © ' + new Date().getFullYear() + "</div>" +
      "</div>";
    document.body.appendChild(gate);

    var dotsWrap = gate.querySelector("#pgDots");
    var input = gate.querySelector("#pgInput");
    var err = gate.querySelector("#pgErr");
    var card = gate.querySelector(".pg-card");
    var checking = false;

    var dots = [];
    for (var i = 0; i < CODE_LEN; i++) {
      var d = document.createElement("div");
      d.className = "pg-dot";
      dotsWrap.appendChild(d);
      dots.push(d);
    }

    function render() {
      var v = input.value;
      for (var i = 0; i < CODE_LEN; i++) {
        dots[i].textContent = v[i] ? "•" : "";
        dots[i].classList.toggle("filled", !!v[i]);
        dots[i].classList.toggle("active", i === v.length && document.activeElement === input);
      }
    }

    function focusInput() { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } render(); }
    dotsWrap.addEventListener("click", focusInput);
    gate.addEventListener("click", function (ev) { if (ev.target === gate) focusInput(); });
    input.addEventListener("blur", render);
    input.addEventListener("focus", render);

    input.addEventListener("input", function () {
      input.value = input.value.replace(/\D/g, "").slice(0, CODE_LEN);
      err.classList.remove("show");
      render();
      if (input.value.length === CODE_LEN && !checking) {
        checking = true;
        var attempt = input.value;
        verifyCode(attempt).then(function (ok) {
          if (ok) {
            try { sessionStorage.setItem(GATE_KEY, GATE_HASH); } catch (e) {}
            dots.forEach(function (d) { d.classList.add("ok"); });
            gate.classList.add("pg-unlock");
            document.documentElement.classList.remove("passio-locked");
            setTimeout(function () {
              if (gate.parentNode) gate.parentNode.removeChild(gate);
            }, 1000);
            if (resolveGate) resolveGate();
          } else {
            checking = false;
            input.value = "";
            err.classList.add("show");
            card.classList.add("shake");
            setTimeout(function () { card.classList.remove("shake"); }, 500);
            render();
          }
        });
      }
    });

    setTimeout(focusInput, 700);
  }

  function escapeHtmlGate(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildUI);
  } else {
    buildUI();
  }
})();
