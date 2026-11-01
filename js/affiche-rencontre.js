// ══════════════════════════════════════════════════════════════════════════
// L'AFFICHE DE LA RENCONTRE  (2026-11-01 — lancement gratuit, phase 1)
// ──────────────────────────────────────────────────────────────────────────
// « C'est parti, je lance l'app en gratuit, mets tout en place. »
// (`docs/PLAN_MONETISATION_2026-11-01.md`, phase 1 : « recruter l'offre
// d'abord », QR codes dans les lieux partenaires.)
//
// Un organisateur ouvre sa rencontre et obtient, en un toucher, une AFFICHE
// au format A4 (1240 × 1754 px, 150 ppp) : passion, titre, date, lieu, prix et
// un grand QR code qui ouvre la rencontre. Il l'imprime pour le lieu, ou
// l'envoie telle quelle dans ses groupes (WhatsApp, Instagram…). C'est l'outil
// de la phase 1 : le lien entre un mur de bar, de salle d'escalade ou de
// boutique et une inscription sur PASSIO.
//
// ⚠️ LE QR NE PORTE QUE 106 OCTETS. Le générateur maison (`qrEncode`, app-07)
// s'arrête à la version 6 : il a été vérifié par aller-retour réel, on ne le
// pousse pas plus loin pour une affiche. Le lien court d'une rencontre
// (`/e/<id>`, 50 octets, 69 avec un uuid) + le suivi `?plk=lk_…` (33)
// tiennent ; l'invitation `?inv=<compte>` (41) en plus ne tient pas. Les candidats sont donc ESSAYÉS
// dans l'ordre — tout, puis sans invitation, puis le lien nu — et le premier
// que le générateur accepte gagne. Le SUIVI prime sur l'invitation : c'est lui
// qui dit, au pilotage, combien de scans une affiche a produits.
//
// ⚠️ L'AFFICHE EST UNE IMAGE, PAS DU HTML. Le titre, le lieu et la passion
// viennent de l'organisateur (donc d'un tiers pour qui scanne) : ils sont
// DESSINÉS sur un canevas, jamais injectés dans le DOM. La seule chaîne de la
// rencontre qui touche la page est le titre, dans l'aperçu, par `escapeHtml`.
//
// ⚠️ LE PRIX PASSE PAR `fmtEventPrice` — la SEULE fonction autorisée à écrire
// un prix à l'écran (ADR-009). Jamais de « + " €" » à la main.
//
// Coupures : `window.PASSIO_AFFICHE_RENCONTRE = false` ou
// `localStorage.passio_affiche_rencontre = "0"` — le bouton disparaît, rien
// d'autre ne change. Verrou : `tests/e2e/affiche-rencontre.spec.js`.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var VERSION = "affiche_v1";
  var LARGEUR = 1240, HAUTEUR = 1754;   // A4 portrait, 150 ppp
  var MARGE = 96;
  var VIOLET = "#6D32F4", VIOLET_CLAIR = "#8B5CF6";
  var POLICE = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  function actif() {
    try { if (window.PASSIO_AFFICHE_RENCONTRE === false) return false; } catch (e) {}
    try { if (localStorage.getItem("passio_affiche_rencontre") === "0") return false; } catch (e) {}
    return true;
  }

  // Un `catch` muet sur un chemin de décision masque un ReferenceError (le
  // défaut qui a coûté six jours de fil vide). Tout échec est audible, et
  // strictement TECHNIQUE : ni titre, ni lieu, ni identifiant de personne.
  function fail(ou, err) {
    var msg = "affiche (" + ou + ") : " + ((err && err.message) || err || "?");
    if (window.console && console.error) console.error("[affiche] " + ou + " :", err);
    try { if (typeof diagLog === "function") diagLog(msg); } catch (e) {}
    try {
      if (window.tel && window.tel.error) {
        window.tel.error(err instanceof Error ? err : new Error(msg),
          { action: "affiche_rencontre", meta: { v: VERSION, step: String(ou) } });
      }
    } catch (e) {}
  }

  function trouver(id) {
    try {
      var ev = (typeof _findCanonicalEvent === "function") ? _findCanonicalEvent(id) : null;
      if (!ev && typeof allEvents === "function") {
        ev = allEvents().find(function (e) { return e && e.id === id; }) || null;
      }
      return ev || null;
    } catch (e) { fail("trouver", e); return null; }
  }

  // ── Le lien porté par le QR ────────────────────────────────────────────
  function sansInvitation(url) {
    try { var u = new URL(url, location.href); u.searchParams.delete("inv"); return u.toString(); }
    catch (e) { return String(url || "").replace(/([?&])inv=[^&#]*&?/, "$1").replace(/[?&](#|$)/, "$1"); }
  }

  // « Trop long » est la SEULE réponse attendue du générateur : tout autre
  // échec (TypeError, générateur absent) est une panne, et se dit comme telle —
  // sinon elle se déguiserait en « lien trop long pour le QR ».
  function qrAccepte(texte) {
    try { qrEncode(texte); return true; }
    catch (e) {
      if (!/trop long/i.test(String((e && e.message) || ""))) fail("qrEncode", e);
      return false;
    }
  }

  // Gabarit d'un identifiant de suivi : `lk_` + `uid16()` de telemetry.js
  // (8 caractères d'horodatage, un tiret, 16 aléatoires = 28), plus 2 de marge.
  // On ne CRÉE le lien suivi que si un lien de cette longueur tient dans le
  // QR : sinon le pilotage compterait un lien créé qui ne peut pas s'ouvrir.
  var GABARIT_SUIVI = "lk_" + new Array(28).join("0");

  // Rend { url, base, lien } : `url` est ce que porte le QR, `base` le lien
  // sans suivi (écrit en clair au pied de l'affiche), `lien` l'identifiant de
  // suivi — ou null si la mesure d'usage est coupée.
  function lienAffiche(ev) {
    var brut = (typeof lienPartageDe === "function")
      ? lienPartageDe("event", ev.id)
      : location.origin + location.pathname + "#irl-event-" + encodeURIComponent(ev.id);
    var nu = sansInvitation(brut);
    var lk = null;
    try {
      var suivable = window.tel && typeof tel.linkCreate === "function" && typeof tel.tagUrl === "function";
      if (suivable && (qrAccepte(tel.tagUrl(brut, GABARIT_SUIVI)) || qrAccepte(tel.tagUrl(nu, GABARIT_SUIVI)))) {
        lk = tel.linkCreate("event", ev.id);
      }
    } catch (e) { fail("linkCreate", e); }
    var tague = function (u) { return (lk && tel.tagUrl) ? tel.tagUrl(u, lk) : u; };
    var candidats = [tague(brut), tague(nu), nu];
    for (var i = 0; i < candidats.length; i++) {
      if (qrAccepte(candidats[i])) {
        return { url: candidats[i], base: nu, lien: candidats[i] === nu ? null : lk };
      }
    }
    return { url: null, base: nu, lien: null };
  }

  // ── Les textes de l'affiche ────────────────────────────────────────────
  function majuscule(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }

  function texteDate(ev) {
    try {
      var d = new Date(ev.date);
      if (!isFinite(d.getTime())) return "";
      var jour = majuscule(d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));
      var heure = (typeof fmtEventDate === "function") ? fmtEventDate(ev.date).time : "";
      return jour + (heure ? " · " + heure : "");
    } catch (e) { fail("date", e); return ""; }
  }

  function textePassion(ev) {
    try {
      var p = (ev.passion && typeof passionById === "function") ? passionById(ev.passion) : null;
      // Le repli générique de `passionById` (« ✨ Passion ») n'a pas d'`id` :
      // l'imprimer sur une affiche ne dirait rien — on dit « Rencontre ».
      var connue = !!(p && p.id);
      var label = connue ? (p.label || "") : "";
      var emoji = (connue && p.emoji) || ev.emoji || "";
      return (emoji ? emoji + " " : "") + (label || "Rencontre");
    } catch (e) { return "Rencontre"; }
  }

  function texteLieu(ev) {
    return [ev.venue, ev.city].map(function (x) { return String(x || "").trim(); })
      .filter(Boolean).join(" · ");
  }

  function textePrix(ev) {
    var prix = (typeof fmtEventPrice === "function") ? fmtEventPrice(ev.price) : "Gratuit";
    var n = Number(ev.maxAttendees);
    return prix + (n > 0 ? " · " + n + " place" + (n > 1 ? "s" : "") : "");
  }

  // Découpe un texte en lignes qui tiennent dans `largeur`, au plus `max`
  // lignes ; la dernière se termine par « … » si le texte déborde. Un mot plus
  // long que la ligne est coupé (un titre sans espace ne sort pas du cadre).
  function lignes(ctx, texte, largeur, max) {
    var mots = String(texte || "").split(/\s+/).filter(Boolean);
    var tient = function (s) { return ctx.measureText(s).width <= largeur; };
    var out = [], cur = "", i = 0, reste = false;
    while (i < mots.length) {
      var mot = mots[i];
      var essai = cur ? cur + " " + mot : mot;
      if (tient(essai)) { cur = essai; i++; continue; }
      if (cur) {
        out.push(cur); cur = "";
        if (out.length >= max) { reste = true; break; }
        continue;
      }
      // Un mot seul plus long que la ligne : on le coupe là où il déborde.
      var k = mot.length - 1;
      while (k > 1 && !tient(mot.slice(0, k))) k--;
      if (k < 1) k = 1;
      out.push(mot.slice(0, k));
      mots[i] = mot.slice(k);
      if (!mots[i]) i++;
      if (out.length >= max) { reste = i < mots.length; break; }
    }
    if (cur) { if (out.length < max) out.push(cur); else reste = true; }
    if (reste && out.length) {
      var der = out[out.length - 1];
      while (der.length > 1 && !tient(der + "…")) der = der.slice(0, -1);
      out[out.length - 1] = der.replace(/\s+$/, "") + "…";
    }
    return out;
  }

  function centre(ctx, texte, y) {
    var w = ctx.measureText(texte).width;
    ctx.fillText(texte, Math.round((LARGEUR - w) / 2), y);
  }

  // ── Le dessin ──────────────────────────────────────────────────────────
  function dessiner(ev, lien) {
    var c = document.createElement("canvas");
    c.width = LARGEUR; c.height = HAUTEUR;
    var ctx = c.getContext("2d");
    if (!ctx) throw new Error("canevas 2D indisponible");
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, LARGEUR, HAUTEUR);

    // Bandeau : marque, passion, titre.
    ctx.font = "800 84px " + POLICE;
    var titre = lignes(ctx, ev.title || "Rencontre", LARGEUR - 2 * MARGE, 3);
    var yTitre = 360;
    var bas = yTitre + (titre.length - 1) * 98 + 76;
    var grad = ctx.createLinearGradient(0, 0, LARGEUR, bas);
    grad.addColorStop(0, VIOLET); grad.addColorStop(1, VIOLET_CLAIR);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, LARGEUR, bas);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 64px " + POLICE;
    ctx.fillText("PASSIO", MARGE, 150);
    ctx.font = "600 44px " + POLICE;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(lignes(ctx, textePassion(ev), LARGEUR - 2 * MARGE, 1)[0] || "", MARGE, 240);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 84px " + POLICE;
    titre.forEach(function (l, i) { ctx.fillText(l, MARGE, yTitre + i * 98); });

    // Détails.
    var y = bas + 110;
    var largeurTexte = LARGEUR - 2 * MARGE;
    ctx.fillStyle = "#1b1530";
    ctx.font = "700 50px " + POLICE;
    var date = texteDate(ev);
    if (date) { ctx.fillText(lignes(ctx, date, largeurTexte, 1)[0], MARGE, y); y += 78; }
    ctx.fillStyle = "#463c5c";
    ctx.font = "500 42px " + POLICE;
    var lieu = texteLieu(ev);
    if (lieu) { ctx.fillText(lignes(ctx, lieu, largeurTexte, 1)[0], MARGE, y); y += 70; }
    ctx.font = "600 42px " + POLICE;
    ctx.fillText(lignes(ctx, textePrix(ev), largeurTexte, 1)[0], MARGE, y);

    // Le QR, aussi grand que la page le permet (≥ 6 cm imprimé, au pire).
    var q = qrEncode(lien.url);
    var zone = q.size + 8;                         // 4 modules de marge de chaque côté
    var dispo = Math.min(600, HAUTEUR - 300 - (y + 70));
    var cellule = Math.max(4, Math.floor(dispo / zone));
    var cote = cellule * zone;
    var qx = Math.round((LARGEUR - cote) / 2), qy = y + 70;
    _geometrie = { url: lien.url, qx: qx, qy: qy, cellule: cellule, taille: q.size };
    ctx.fillStyle = VIOLET;
    ctx.fillRect(qx - 10, qy - 10, cote + 20, cote + 20);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qx, qy, cote, cote);
    ctx.fillStyle = "#000000";
    for (var r = 0; r < q.size; r++) {
      for (var k = 0; k < q.size; k++) {
        if (q.modules[r][k]) ctx.fillRect(qx + (k + 4) * cellule, qy + (r + 4) * cellule, cellule, cellule);
      }
    }

    ctx.fillStyle = VIOLET;
    ctx.font = "800 54px " + POLICE;
    centre(ctx, "Scanne pour t'inscrire", qy + cote + 96);

    // Pied : la promesse, et le lien en clair (sans suivi) pour qui ne scanne pas.
    ctx.fillStyle = "#6b6280";
    ctx.font = "500 32px " + POLICE;
    centre(ctx, "Le réseau des passions — gratuit, sans publicité", HAUTEUR - 118);
    ctx.font = "600 30px " + POLICE;
    centre(ctx, lignes(ctx, String(lien.base || "").replace(/^https?:\/\//, ""), largeurTexte, 1)[0] || "",
      HAUTEUR - 68);
    return c;
  }

  // Géométrie du dernier QR dessiné : lue par le banc, qui compare pixel par
  // pixel l'image produite à la matrice du générateur.
  var _geometrie = null;

  function enImage(c) {
    return new Promise(function (ok) {
      try { c.toBlob(function (b) { ok(b || null); }, "image/png"); }
      catch (e) { fail("toBlob", e); ok(null); }
    });
  }

  function nomFichier(ev) {
    var s = String(ev.title || "rencontre").toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    return "affiche-passio-" + (s || "rencontre") + ".png";
  }

  // ── La fenêtre ─────────────────────────────────────────────────────────
  var _urlObjet = null;
  function libererApercu() {
    if (_urlObjet) { try { URL.revokeObjectURL(_urlObjet); } catch (e) {} _urlObjet = null; }
  }

  function signalerPartage(lien, canal) {
    try { if (lien && window.tel && typeof tel.linkShare === "function") tel.linkShare(lien, canal); }
    catch (e) { fail("linkShare", e); }
  }

  async function ouvrir(id) {
    if (!actif()) return false;
    try {
      var ev = trouver(id);
      if (!ev) { if (typeof toast === "function") toast("Rencontre introuvable."); return false; }
      if (typeof _canManageEvent === "function" && !_canManageEvent(ev)) {
        if (typeof toast === "function") toast("Réservé à l'organisateur");
        return false;
      }
      if (typeof qrEncode !== "function") throw new Error("qrEncode absent");
      var lien = lienAffiche(ev);
      if (!lien.url) throw new Error("lien trop long pour le QR");
      var c = dessiner(ev, lien);
      var blob = await enImage(c);
      if (!blob) throw new Error("image vide");
      libererApercu();
      _urlObjet = URL.createObjectURL(blob);
      var fichier = null;
      try { fichier = new File([blob], nomFichier(ev), { type: "image/png" }); } catch (e) { fichier = null; }
      var peutPartager = false;
      try { peutPartager = !!(fichier && navigator.canShare && navigator.canShare({ files: [fichier] })); }
      catch (e) { peutPartager = false; }

      openModal('<div class="modal-handle"></div>'
        + '<div class="modal-title">Affiche de la rencontre</div>'
        + '<div class="affiche-sous">' + escapeHtml(ev.title || "") + '</div>'
        + '<img class="affiche-apercu" id="afficheApercu" alt="Affiche de la rencontre avec son QR code" src="'
        + escapeHtml(_urlObjet) + '"/>'
        + '<div class="affiche-aide">Imprime-la en A4 pour le lieu, ou envoie-la dans tes groupes : '
        + 'chaque scan ouvre la rencontre, et l\'inscription est gratuite.</div>'
        + (peutPartager
          ? '<button type="button" class="btn primary block" id="afficheBtnPartager" data-tel="affiche_partager">Partager l\'affiche</button>'
          : "")
        + '<a class="btn ' + (peutPartager ? "" : "primary ") + 'block affiche-telecharger" id="afficheBtnEnregistrer" data-tel="affiche_enregistrer" href="'
        + escapeHtml(_urlObjet) + '" download="' + escapeHtml(nomFichier(ev)) + '">Enregistrer l\'image</a>');

      var bp = document.getElementById("afficheBtnPartager");
      if (bp) {
        bp.addEventListener("click", function () {
          navigator.share({ files: [fichier], title: ev.title || "Rencontre PASSIO", text: "Inscris-toi : " + lien.url })
            .then(function () { signalerPartage(lien.lien, "affiche"); })
            .catch(function (e) { if (!e || e.name !== "AbortError") fail("share", e); });
        });
      }
      var be = document.getElementById("afficheBtnEnregistrer");
      if (be) be.addEventListener("click", function () { signalerPartage(lien.lien, "affiche_image"); });
      return true;
    } catch (e) {
      fail("ouvrir", e);
      if (typeof toast === "function") toast("L'affiche n'a pas pu être créée — réessaie dans un instant.", "warning");
      return false;
    }
  }

  // ── La porte : un bouton à côté du « QR d'accueil » de l'organisateur ───
  // `data-orga-qr` est posé par la fiche (app-07) sur ce bouton, qui n'existe
  // que pour qui gère la rencontre, à venir et non annulée — exactement quand
  // une affiche a un sens. La fiche est repeinte en entier (`innerHTML`) :
  // on POSE un frère après chaque repeinte, sans jamais régénérer son nœud.
  function poser() {
    if (!actif()) return;                  // verrou de coupure DANS la décoration
    try {
      var portes = document.querySelectorAll("#eventDetailContent [data-orga-qr]");
      var poses = document.querySelectorAll("#eventDetailContent [data-affiche-rencontre]");
      var dejaPose = function (id) {
        for (var j = 0; j < poses.length; j++) if (poses[j].getAttribute("data-affiche-rencontre") === id) return true;
        return false;
      };
      for (var i = 0; i < portes.length; i++) {
        var b = portes[i];
        // ⚠️ LE DOUBLON SE CHERCHE DANS TOUTE LA FICHE, PAS CHEZ LE VOISIN : un
        // module qui réorganise la fiche (UI-4B) peut déplacer le bouton ailleurs ;
        // le chercher seulement juste après le QR en reposerait un second.
        if (dejaPose(b.getAttribute("data-orga-qr") || "")) continue;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn ghost block affiche-rencontre-btn";
        btn.setAttribute("data-affiche-rencontre", b.getAttribute("data-orga-qr") || "");
        btn.setAttribute("data-tel", "affiche_ouvrir");
        btn.textContent = "Affiche à imprimer · QR d'inscription";
        b.parentNode.insertBefore(btn, b.nextSibling);
      }
    } catch (e) { fail("poser", e); }
  }

  function retirer() {
    try {
      var bs = document.querySelectorAll("[data-affiche-rencontre]");
      for (var i = 0; i < bs.length; i++) bs[i].remove();
    } catch (e) { fail("retirer", e); }
  }

  function onDocumentClick(e) {
    if (!e.target || !e.target.closest) return;
    var b = e.target.closest("[data-affiche-rencontre]");
    if (!b) return;
    e.preventDefault();
    if (!actif()) { retirer(); return; }
    ouvrir(b.getAttribute("data-affiche-rencontre"));
  }

  var observateur = null, planifie = false, ecoute = false, essais = 0;
  function planifier() {
    if (planifie) return;
    planifie = true;
    setTimeout(function () { planifie = false; if (actif()) poser(); else retirer(); }, 0);
  }

  function boot() {
    if (!ecoute) { document.addEventListener("click", onDocumentClick, true); ecoute = true; }
    if (observateur) return;
    var cible = document.getElementById("eventDetailContent");
    if (!cible) {
      // La fiche n'est pas encore dans le DOM : quelques reprises, bornées.
      if (essais++ < 40) setTimeout(boot, 250);
      return;
    }
    try {
      observateur = new MutationObserver(planifier);
      observateur.observe(cible, { childList: true });
      planifier();
    } catch (e) { fail("observer", e); }
  }

  window.PassioAffiche = {
    version: VERSION,
    actif: actif,
    ouvrir: ouvrir,
    poser: poser,
    // Exposés pour le banc : le lien choisi et les lignes de titre.
    _lien: function (id) { var ev = trouver(id); return ev ? lienAffiche(ev) : null; },
    _geometrie: function () { return _geometrie; },
    _lignes: function (texte, police, largeur, max) {
      var ctx = document.createElement("canvas").getContext("2d");
      ctx.font = police;
      return lignes(ctx, texte, largeur, max);
    },
  };

  // ⚠️ En production le bloc app arrive après ce module : on repart à zéro sur
  // `passio:app-ready`, sinon un budget de reprises brûlé avant l'app ne
  // reviendrait jamais.
  window.addEventListener("passio:app-ready", function () { essais = 0; boot(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
