// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES DISTANTS — l'interrupteur que toute la production écoute (2026-10-11)
//
// Avant ce fichier, aucun interrupteur SERVEUR ne coupait une fonctionnalité
// chez tout le monde (docs/RECUPERATION.md, EXP-03) : les drapeaux
// `passio_*="0"` sont locaux, par appareil. Ici, l'appareil LIT trois réglages
// posés en base (`public.reglages_distants`) par la fonction `pilotage` — à la
// main depuis le téléphone, ou par la veille quand la charge monte :
//
//   · délestage (0, 1, 2) — `delestageFacteur()` rend 1, 2 ou 4 ; les filets
//     de rafraîchissement, les compteurs visibles et le repos du temps réel
//     multiplient leurs délais par ce facteur, l'échantillon de télémétrie le
//     divise. Rien ne casse : on lit moins souvent. C'est ce qui laisse la
//     production RALENTIR au lieu de TOMBER devant un mur de capacité.
//   · coupures — des drapeaux d'une LISTE BLANCHE posés à "0" (la seule chose
//     qu'un drapeau sait faire : enlever). Effet immédiat pour ce qui lit son
//     drapeau à l'usage, au prochain démarrage pour le reste. On ne retire
//     QUE ce qu'on a posé soi-même (`passio_coupures_distantes_v1`) : un "0"
//     écrit à la main sur l'appareil n'est jamais levé par le serveur.
//   · bandeau — un message court à tous, rendu par `textContent`.
//
// ⚠️ TABLE ABSENTE (migration pas encore appliquée) = rien du tout : le 404 est
// mémorisé UNE HEURE (même contrat que `fil_compteurs`, app-08) et marqué
// `refus_attendu` par la télémétrie — ce n'est pas un défaut à ouvrir.
// ⚠️ INERTE EN LOCAL (localhost, banc Playwright) : les suites ne doivent jamais
// hériter d'un délestage posé en production. Un banc qui veut l'exercer pose
// `window.PASSIO_REGLAGES_DISTANTS = true` avant le chargement.
// Coupure : `localStorage.passio_reglages_distants = "0"` ou
// `window.PASSIO_REGLAGES_DISTANTS = false` — le module lève alors les
// coupures qu'il avait posées et ne lit plus rien.
// Logique serveur et banc : supabase/functions/_shared/reglages.js,
// tests/unit/reglages.test.mjs (confronte la liste blanche et les facteurs).
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";
  var CLE_CACHE = "passio_reglages_distants_v1";
  var CLE_POSEES = "passio_coupures_distantes_v1";
  var CLE_ABSENTE = "passio_reglages_distants_absente";
  var CLE_BANDEAU_FERME = "passio_bandeau_distant_ferme";
  var ABSENTE_MS = 60 * 60 * 1000;
  var PERIODE_MS = 5 * 60 * 1000;
  // Un délestage mis en cache ne survit pas indéfiniment sans confirmation :
  // un téléphone resté hors ligne une semaine ne doit pas démarrer ralenti.
  // Six heures, parce que c'est précisément sous charge que la relecture échoue.
  var DELESTAGE_VALIDE_MS = 6 * 60 * 60 * 1000;
  var BANDEAU_VALIDE_MS = 24 * 60 * 60 * 1000;
  var FACTEURS_DELESTAGE = { 0: 1, 1: 2, 2: 4 };
  var BANDEAU_MAX = 200;
  // ⚠️ COPIE de supabase/functions/_shared/reglages.js — confrontée par
  // tests/unit/reglages.test.mjs ④. Liste BLANCHE : jamais une clé de données.
  var COUPURES_AUTORISEES = [
    "flat_passions_v1",
    "passio_feed_intents_v1",
    "passio_feed_irl_bridge_v1",
    "passio_feed_rank",
    "passio_feed_window_v1",
    "passio_first_run_experience_v1",
    "passio_invitations_v1",
    "passio_invite_apres_creation_v1",
    "passio_irl_proposal_v1",
    "passio_liens_courts_v1",
    "passio_rappels_push_v1",
    "passio_recap_semaine",
    "passio_ui_3",
    "passio_ui_4a0",
    "passio_ui_4a1",
    "passio_ui_4a2",
    "passio_ui_4a3",
    "passio_ui_4a4",
    "passio_ui_4a5",
    "passio_ui_4b",
    "passio_ui_5",
    "passio_ui_6",
    "passio_ui_6a",
    "passio_ui_6b",
    "passio_ui_6c",
    "passio_ui_7",
    "passio_ui_8",
    "passio_ui_v2",
  ];

  function lire(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function ecrire(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function retirer(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function json(k, defaut) { try { var v = JSON.parse(lire(k) || "null"); return v == null ? defaut : v; } catch (e) { return defaut; } }

  function estLocal() {
    try {
      var h = String(location.hostname || "");
      return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "[::1]" || h === "::1" || /\.local$/.test(h) || location.protocol === "file:";
    } catch (e) { return true; }
  }
  function actif() {
    if (window.PASSIO_REGLAGES_DISTANTS === false) return false;
    if (lire("passio_reglages_distants") === "0") return false;
    if (window.PASSIO_REGLAGES_DISTANTS === true) return true;
    return !estLocal();
  }

  // ── Normalisation (même règles que le serveur, en plus strict : le client
  // ne fait confiance ni au cache ni au réseau) ──────────────────────────────
  function normaliser(lignes) {
    var r = { delestage: 0, coupures: [], bandeau: null };
    if (!Array.isArray(lignes)) return r;
    for (var i = 0; i < lignes.length; i++) {
      var l = lignes[i];
      if (!l || typeof l !== "object" || !l.valeur || typeof l.valeur !== "object") continue;
      if (l.cle === "delestage") {
        var n = l.valeur.niveau;
        if (n === 0 || n === 1 || n === 2) r.delestage = n;
      } else if (l.cle === "coupures" && Array.isArray(l.valeur.cles)) {
        var ok = l.valeur.cles.every(function (k) { return COUPURES_AUTORISEES.indexOf(k) !== -1; });
        if (ok) r.coupures = l.valeur.cles.filter(function (k, j, a) { return a.indexOf(k) === j; });
      } else if (l.cle === "bandeau" && typeof l.valeur.texte === "string") {
        var t = l.valeur.texte.replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
        if (t && t.length <= BANDEAU_MAX) r.bandeau = { texte: t, niveau: l.valeur.niveau === "alerte" ? "alerte" : "info", id: String(l.maj || "") + "|" + t };
      }
    }
    return r;
  }

  var etat = { delestage: 0, coupures: [], bandeau: null, recuLe: 0, lu: false };

  function depuisCache() {
    var c = json(CLE_CACHE, null);
    if (!c || typeof c !== "object" || !c.reglages) return;
    var age = Date.now() - Number(c.recuLe || 0);
    if (!isFinite(age) || age < 0) return;
    var r = c.reglages;
    etat.recuLe = Number(c.recuLe) || 0;
    etat.delestage = age < DELESTAGE_VALIDE_MS && (r.delestage === 1 || r.delestage === 2) ? r.delestage : 0;
    etat.coupures = Array.isArray(r.coupures) ? r.coupures.filter(function (k) { return COUPURES_AUTORISEES.indexOf(k) !== -1; }) : [];
    etat.bandeau = age < BANDEAU_VALIDE_MS && r.bandeau && typeof r.bandeau.texte === "string" ? r.bandeau : null;
  }

  // Pose "0" sur chaque coupure demandée qui n'est pas déjà à "0", lève celles
  // qu'ON avait posées et qui ne sont plus demandées. Jamais une autre clé.
  function appliquerCoupures(voulues) {
    var posees = json(CLE_POSEES, []);
    if (!Array.isArray(posees)) posees = [];
    posees = posees.filter(function (k) { return COUPURES_AUTORISEES.indexOf(k) !== -1; });
    var garder = [];
    for (var i = 0; i < posees.length; i++) {
      var k = posees[i];
      if (voulues.indexOf(k) !== -1) { garder.push(k); continue; }
      if (lire(k) === "0") retirer(k);
    }
    for (var j = 0; j < voulues.length; j++) {
      var c = voulues[j];
      if (COUPURES_AUTORISEES.indexOf(c) === -1 || garder.indexOf(c) !== -1) continue;
      if (lire(c) === "0") continue; // déjà coupé par l'appareil lui-même : pas à nous
      if (ecrire(c, "0")) garder.push(c);
    }
    if (garder.length) ecrire(CLE_POSEES, JSON.stringify(garder)); else retirer(CLE_POSEES);
  }

  // ── Bandeau ───────────────────────────────────────────────────────────────
  function bandeauFerme(id) { try { return sessionStorage.getItem(CLE_BANDEAU_FERME) === id; } catch (e) { return false; } }
  function peindreBandeau() {
    if (!document.body) return;
    var el = document.getElementById("passioBandeauDistant");
    var b = etat.bandeau;
    if (!b || bandeauFerme(b.id)) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("div");
      el.id = "passioBandeauDistant";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:10050;display:flex;align-items:center;gap:8px;"
        + "padding:calc(8px + env(safe-area-inset-top, 0px)) 12px 8px 16px;color:#fff;font:600 14px/1.35 system-ui,-apple-system,sans-serif;"
        + "box-shadow:0 2px 10px rgba(0,0,0,.25)";
      var t = document.createElement("span");
      t.className = "bandeau-distant-texte";
      t.style.cssText = "flex:1;min-width:0;overflow-wrap:anywhere";
      var x = document.createElement("button");
      x.type = "button";
      x.className = "bandeau-distant-fermer";
      x.setAttribute("aria-label", "Fermer le message");
      x.textContent = "×";
      x.style.cssText = "flex:none;min-width:44px;min-height:44px;border:0;background:transparent;color:inherit;font:700 22px/1 system-ui,sans-serif;cursor:pointer";
      x.addEventListener("click", function () {
        try { sessionStorage.setItem(CLE_BANDEAU_FERME, (etat.bandeau && etat.bandeau.id) || ""); } catch (e) {}
        var e2 = document.getElementById("passioBandeauDistant"); if (e2) e2.remove();
      });
      el.appendChild(t); el.appendChild(x);
      document.body.appendChild(el);
    }
    el.style.background = b.niveau === "alerte" ? "#b91c1c" : "#6d28d9";
    el.setAttribute("data-niveau", b.niveau);
    el.querySelector(".bandeau-distant-texte").textContent = b.texte;
  }

  // ── Lecture distante ──────────────────────────────────────────────────────
  var enCours = null, dernierEssai = 0, minuterie = null;
  function absenteRecemment() {
    var t = Number(lire(CLE_ABSENTE) || 0);
    return isFinite(t) && t > 0 && Date.now() - t < ABSENTE_MS;
  }
  function appliquer(r, recuLe) {
    var avant = etat.delestage;
    etat.delestage = r.delestage; etat.coupures = r.coupures; etat.bandeau = r.bandeau;
    etat.recuLe = recuLe; etat.lu = true;
    ecrire(CLE_CACHE, JSON.stringify({ recuLe: recuLe, reglages: { delestage: r.delestage, coupures: r.coupures, bandeau: r.bandeau } }));
    appliquerCoupures(r.coupures);
    peindreBandeau();
    if (avant !== etat.delestage) {
      try { if (typeof diagLog === "function") diagLog("reglages_distants: délestage " + avant + " → " + etat.delestage); } catch (e) {}
      try { window.dispatchEvent(new CustomEvent("passio:delestage", { detail: { niveau: etat.delestage, facteur: delestageFacteur() } })); } catch (e) {}
    }
  }
  function rafraichir(force) {
    if (!actif()) return Promise.resolve(false);
    if (enCours) return enCours;
    var cfg = window.PASSIO_SUPABASE;
    if (!cfg || !cfg.url || !cfg.anon || typeof fetch !== "function") return Promise.resolve(false);
    if (!force && absenteRecemment()) return Promise.resolve(false);
    dernierEssai = Date.now();
    enCours = fetch(cfg.url + "/rest/v1/reglages_distants?select=cle,valeur,maj", {
      headers: { apikey: cfg.anon, Authorization: "Bearer " + cfg.anon, Accept: "application/json" },
      cache: "no-store",
    }).then(function (res) {
      if (res.status === 404) { ecrire(CLE_ABSENTE, String(Date.now())); return false; }
      if (!res.ok) return false;
      return res.json().then(function (lignes) {
        retirer(CLE_ABSENTE);
        appliquer(normaliser(lignes), Date.now());
        return true;
      });
    }).catch(function () { return false; }).then(function (v) { enCours = null; return v; });
    return enCours;
  }
  function planifier() {
    if (minuterie) clearTimeout(minuterie);
    // ±30 s : cent mille appareils ne doivent pas relire à la même seconde.
    minuterie = setTimeout(function () {
      minuterie = null;
      if (!document.hidden) rafraichir(false);
      planifier();
    }, PERIODE_MS + Math.round((Math.random() - 0.5) * 60000));
  }

  // ── Démarrage ─────────────────────────────────────────────────────────────
  if (!actif()) {
    // Module coupé : on rend ce qu'on avait pris, et rien d'autre.
    if (lire("passio_reglages_distants") === "0" || window.PASSIO_REGLAGES_DISTANTS === false) appliquerCoupures([]);
  } else {
    depuisCache();
    appliquerCoupures(etat.coupures);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", peindreBandeau);
    else peindreBandeau();
    window.addEventListener("load", function () {
      setTimeout(function () { rafraichir(false); planifier(); }, 3000 + Math.round(Math.random() * 5000));
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && Date.now() - dernierEssai > PERIODE_MS) rafraichir(false);
    });
  }

  window.PassioReglages = {
    niveau: function () { return actif() ? etat.delestage : 0; },
    facteur: function () { return delestageFacteur(); },
    coupures: function () { return etat.coupures.slice(); },
    bandeau: function () { return etat.bandeau ? { texte: etat.bandeau.texte, niveau: etat.bandeau.niveau } : null; },
    rafraichir: rafraichir,
    actif: actif,
    _etat: etat,
  };
  window.__delestageNiveau = function () { return actif() ? etat.delestage : 0; };
})();

// Facteur de délestage : 1 (normal), 2 ou 4. Lu AU MOMENT d'armer un minuteur,
// jamais mis en cache par l'appelant — un délestage posé ou levé prend effet
// au prochain tour de chaque filet.
function delestageFacteur() {
  try {
    var n = typeof window.__delestageNiveau === "function" ? window.__delestageNiveau() : 0;
    return n === 2 ? 4 : n === 1 ? 2 : 1;
  } catch (e) { return 1; }
}
