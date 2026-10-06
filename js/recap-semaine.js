// ══════════════════════════════════════════════════════════════════════════
// PASSIO — RÉCAP DE LA SEMAINE (2026-10-06)
// ──────────────────────────────────────────────────────────────────────────
// Rien ne disait à un compte ce qui s'était passé pour lui pendant la semaine :
// les notifications arrivent une à une dans la cloche, et le fil ne distingue
// pas ce qui est neuf. Mesuré le 2026-10-06 : sur les comptes créés entre 7 et
// 30 jours plus tôt, un sur trois seulement a fait un geste social dans sa
// première semaine — celui qui revient doit voir, d'un coup d'œil, qu'il se
// passe quelque chose autour de ses passions, et où.
//
// Une carte, une fois par semaine, en tête du fil : ces 7 derniers jours —
// publications dans tes passions, abonnements à ton profil, commentaires et
// mentions, j'aime, inscriptions à tes activités, activités à venir dans tes
// passions. Chaque ligne mène là où ça se passe.
//
// RÈGLES DU RÉENGAGEMENT SAIN (docs/PASSIO_NOTIFICATIONS_V2_HEALTHY_REENGAGEMENT_2026-08-20.md,
// §3 niveau D et §32) — le récap les tient toutes :
//   • DANS L'APP seulement : aucune notification système, aucun e-mail. Il ne
//     fait revenir personne, il résume quand on revient ;
//   • fréquence bornée : au plus UNE fois par semaine calendaire (lundi) et par
//     compte ; une semaine vide n'est pas annoncée — pas de carte ;
//   • des faits, aucun langage de pression : ni « tu as raté », ni série ;
//   • coupé en un geste (« Ne plus afficher le récap ») et dans Paramètres ›
//     Personnalisation › Notifications (`notifs.recap`, `passio_config`).
//   Coupure d'urgence : `localStorage.passio_recap_semaine = "0"` ou
//   `window.PASSIO_RECAP_SEMAINE = false` — le drapeau ne sait qu'ENLEVER.
//
// ⚠️ CARTE EN FRÈRE DE `#feedList`, JAMAIS DEDANS : `renderFeed` réécrit la
//    liste à chaque rendu. Même place que la carte de bienvenue des visiteurs,
//    qui ne s'affiche jamais pour un compte.
// ⚠️ TROIS LECTURES, en parallèle, au plus une fois par semaine et par compte.
//    La semaine est marquée AVANT de lire : une lecture en échec ne fait pas
//    relire à chaque ouverture. Le SDK ne LÈVE PAS sur un refus : `{ error }`
//    est lu et journalisé, et la ligne concernée se tait.
// ⚠️ `events` : jamais `select("*")` (colonnes réservées, 42501) — quatre
//    colonnes publiques nommées.
// ⚠️ UNE SESSION, ET UN COMPTE D'AU MOINS 3 JOURS. `_uidEstUnCompte()` est vrai
//    pour un identifiant laissé sur l'appareil sans session : sans session, on
//    ne lit RIEN (une lecture anonyme compterait des publications pour
//    personne). Et la première semaine d'un compte est celle de la découverte,
//    pas d'un récap — ce qui tient aussi les comptes jetables des suites
//    « production » à l'écart : créés il y a quelques minutes, ils ne lisent rien.
// ⚠️ Module HORS du bloc app : à l'évaluation, ni `state` ni `supa` n'existent.
//    Reprise bornée par `setTimeout` (jamais `requestAnimationFrame`), compteur
//    remis à zéro sur `passio:app-ready`.
// Verrou : tests/e2e/recap-semaine.spec.js.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var CLE_SEMAINE = "passio_recap_semaine_v1";   // { uid, semaine } — compte (ACCOUNT_SCOPED_KEYS)
  var CARTE_ID = "recapSemaine";
  var STYLE_ID = "recapSemaineCss";
  var FENETRE_MS = 7 * 864e5;
  var AGE_MIN_MS = 3 * 864e5;
  var ESSAIS_MAX = 20;
  var PAS_MS = 3000;
  var essais = 0;
  var enCours = false;
  var traiteCetteSession = false;

  function actif() {
    try { if (window.PASSIO_RECAP_SEMAINE === false) return false; } catch (e) {}
    try { if (localStorage.getItem("passio_recap_semaine") === "0") return false; } catch (e) {}
    return true;
  }

  // Le choix de la personne (Paramètres › Notifications). Absent = oui.
  function voulu() {
    try {
      var c = typeof getCurrentConfig === "function" ? getCurrentConfig() : null;
      return !(c && c.notifs && c.notifs.recap === false);
    } catch (e) { return true; }
  }

  function journal(quoi, e) {
    try { if (typeof diagLog === "function") diagLog("recap-semaine: " + quoi + " — " + (e && e.message ? e.message : e)); } catch (_) {}
  }

  function track(nom, meta) {
    try { if (window.tel && typeof tel.action === "function") tel.action(nom, meta || {}); } catch (e) {}
  }

  // Un VRAI compte : `MY_UID` est un `let` de portée script — lu par son nom nu.
  function compte() {
    try {
      if (typeof _uidEstUnCompte !== "function" || !_uidEstUnCompte()) return null;
      return typeof MY_UID === "string" ? MY_UID : null;
    } catch (e) { return null; }
  }

  // Semaine ISO 8601 (lundi), comptée sur la DATE LOCALE : « cette semaine »
  // est celle de la personne, pas celle d'UTC.
  function semaineIso(date) {
    var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    var jour = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - jour);
    var debut = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var n = Math.ceil(((d - debut) / 864e5 + 1) / 7);
    return d.getUTCFullYear() + "-S" + (n < 10 ? "0" : "") + n;
  }

  function dejaTraitee(uid, semaine) {
    try {
      var o = JSON.parse(localStorage.getItem(CLE_SEMAINE) || "null");
      return !!(o && o.uid === uid && o.semaine === semaine);
    } catch (e) { return false; }
  }

  function marquer(uid, semaine) {
    try { localStorage.setItem(CLE_SEMAINE, JSON.stringify({ uid: uid, semaine: semaine })); } catch (e) {}
  }

  function filPret() {
    var f = document.getElementById("screen-feed");
    if (!f || !f.classList.contains("active")) return false;
    var m = document.getElementById("modalBackdrop");
    if (m && m.classList.contains("active")) return false;
    var l = document.getElementById("feedList");
    return !!(l && l.parentNode);
  }

  function clientReel() {
    var s = window.supa;
    return window._supaReal && s && typeof s.from === "function" ? s : null;
  }

  // Âge du compte de la SESSION, en ms ; `null` sans session (ou illisible).
  // `getSession` lit le stockage local du SDK : aucun appel réseau.
  function ageCompte(s) {
    try {
      if (!s.auth || typeof s.auth.getSession !== "function") return Promise.resolve(null);
      return Promise.resolve(s.auth.getSession()).then(function (r) {
        var u = r && r.data && r.data.session && r.data.session.user;
        var t = u ? Date.parse(u.created_at) : NaN;
        return Number.isFinite(t) ? Date.now() - t : null;
      }, function (e) { journal("session", e); return null; });
    } catch (e) { journal("session", e); return Promise.resolve(null); }
  }

  // ── Lectures ───────────────────────────────────────────────────────────────
  function lire(uid) {
    var s = clientReel();
    var depuis = new Date(Date.now() - FENETRE_MS).toISOString();
    var maintenant = new Date().toISOString();
    var dansSept = new Date(Date.now() + FENETRE_MS).toISOString();
    var passions = [];
    try { if (typeof passionsPossedeesIds === "function") passions = passionsPossedeesIds(); } catch (e) { journal("passions", e); }
    var noms = ["publications", "notifications", "activites"];
    var lectures = [];
    try {
      lectures = [
        passions.length ? s.from("posts").select("id", { count: "exact", head: true })
          .in("passion_id", passions).neq("author_id", uid).gte("created_at", depuis) : null,
        s.from("notifications").select("kind").eq("user_id", uid).gte("created_at", depuis).limit(500),
        passions.length ? s.from("events").select("id,passion_id,date_at,status")
          .in("passion_id", passions).gte("date_at", maintenant).lte("date_at", dansSept).limit(50) : null,
      ];
    } catch (e) { journal("requetes", e); }
    return Promise.all(noms.map(function (nom, i) {
      var q = lectures[i];
      if (!q) return Promise.resolve(null);
      return Promise.resolve(q).then(function (r) {
        if (r && r.error) { journal(nom, r.error.message || r.error); return null; }
        return r || null;
      }, function (e) { journal(nom, e); return null; });
    })).then(function (rs) {
      return {
        publications: rs[0] && typeof rs[0].count === "number" ? rs[0].count : 0,
        notifications: rs[1] && Array.isArray(rs[1].data) ? rs[1].data : [],
        activites: rs[2] && Array.isArray(rs[2].data) ? rs[2].data : [],
      };
    });
  }

  // ── Ce qu'on dit — PURE, exposée au banc ───────────────────────────────────
  function compterParType(notifs) {
    var c = {};
    (notifs || []).forEach(function (n) { if (n && typeof n.kind === "string") c[n.kind] = (c[n.kind] || 0) + 1; });
    return c;
  }

  function lignes(r) {
    var out = [];
    var c = compterParType(r && r.notifications);
    var pub = r && typeof r.publications === "number" && r.publications > 0 ? r.publications : 0;
    if (pub) out.push({ cle: "fil", emoji: "📝", texte: pub + (pub > 1 ? " nouvelles publications" : " nouvelle publication") + " dans tes passions" });
    var ab = c.follow || 0;
    if (ab) out.push({ cle: "abonnes", emoji: "👋", texte: ab > 1 ? ab + " personnes se sont abonnées à toi" : "1 personne s'est abonnée à toi" });
    var com = (c.comment || 0) + (c.mention || 0);
    if (com) out.push({ cle: "commentaires", emoji: "💬", texte: com + (com > 1 ? " commentaires et mentions" : " commentaire ou mention") + " pour toi" });
    var j = c.like || 0;
    if (j) out.push({ cle: "jaime", emoji: "❤️", texte: j + " j'aime sur tes publications" });
    var ins = c.event_join || 0;
    if (ins) out.push({ cle: "inscriptions", emoji: "🙋", texte: ins + (ins > 1 ? " inscriptions" : " inscription") + " à tes activités" });
    var act = ((r && r.activites) || []).filter(function (e) { return e && e.status !== "cancelled"; }).length;
    if (act) out.push({ cle: "irl", emoji: "📍", texte: act + (act > 1 ? " activités" : " activité") + " dans tes passions ces 7 prochains jours" });
    return out;
  }

  // ── La carte ───────────────────────────────────────────────────────────────
  function poserStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = ""
      + ".recap-semaine{position:relative;margin:10px 12px 14px;padding:16px 44px 14px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md,16px);box-shadow:0 2px 12px rgba(24,18,48,.05)}"
      + ".recap-semaine-titre{font-size:17px;font-weight:800;color:var(--text);letter-spacing:-.2px}"
      + ".recap-semaine-sous{font-size:13px;color:var(--muted);margin-top:4px;line-height:1.45}"
      + ".recap-semaine-lignes{display:flex;flex-direction:column;gap:6px;margin:12px -28px 0 0}"
      + ".recap-semaine-ligne{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:8px 12px;border:1px solid var(--border);border-radius:12px;background:transparent;color:var(--text);font:inherit;font-size:14px;line-height:1.3;text-align:left;cursor:pointer}"
      + ".recap-semaine-ligne .recap-semaine-texte{flex:1 1 auto;min-width:0}"
      + ".recap-semaine-ligne .recap-semaine-fleche{color:var(--muted);font-size:18px}"
      + ".recap-semaine-fermer{position:absolute;top:4px;right:4px;width:44px;height:44px;border:none;background:none;color:var(--muted);font-size:22px;line-height:1;cursor:pointer}"
      + ".recap-semaine-couper{display:block;margin:8px auto 0;min-height:44px;padding:0 12px;border:none;background:none;color:var(--muted);font:inherit;font-size:12.5px;text-decoration:underline;cursor:pointer}";
    (document.head || document.documentElement).appendChild(st);
  }

  function retirer() {
    var c = document.getElementById(CARTE_ID);
    if (c && c.parentNode) c.parentNode.removeChild(c);
  }

  function aller(cle) {
    track("weekly_recap_clicked", { cible: cle });
    retirer();
    try {
      if (cle === "irl") { if (typeof goTo === "function") goTo("irl"); return; }
      if (cle === "fil") {
        var l = document.getElementById("feedList");
        if (l && typeof l.scrollIntoView === "function") l.scrollIntoView({ block: "start" });
        return;
      }
      if (typeof openNotifications === "function") openNotifications();
    } catch (e) { journal("aller " + cle, e); }
  }

  function couper() {
    try {
      var c = typeof getCurrentConfig === "function" ? getCurrentConfig() : {};
      var n = c.notifs || { posts: true, messages: true, likes: true, events: true, system: true };
      n.recap = false;
      c.notifs = n;
      if (typeof saveConfig === "function") saveConfig(c);
    } catch (e) { journal("couper", e); }
    track("weekly_recap_disabled", {});
    retirer();
    try { if (typeof toast === "function") toast("Récap coupé. Tu peux le remettre dans Paramètres › Personnalisation › Notifications."); } catch (e) {}
  }

  function poser(liste) {
    var fil = document.getElementById("feedList");
    if (!fil || !fil.parentNode || document.getElementById(CARTE_ID)) return false;
    poserStyle();
    var carte = document.createElement("section");
    carte.className = "recap-semaine";
    carte.id = CARTE_ID;
    carte.setAttribute("role", "region");
    carte.setAttribute("aria-labelledby", "recapSemaineTitre");

    var fermer = document.createElement("button");
    fermer.type = "button";
    fermer.className = "recap-semaine-fermer";
    fermer.setAttribute("aria-label", "Fermer le récap de la semaine");
    fermer.textContent = "×";
    fermer.addEventListener("click", function () { track("weekly_recap_closed", {}); retirer(); });

    var titre = document.createElement("div");
    titre.className = "recap-semaine-titre";
    titre.id = "recapSemaineTitre";
    titre.textContent = "Ta semaine sur PASSIO";
    var sous = document.createElement("div");
    sous.className = "recap-semaine-sous";
    sous.textContent = "Ces 7 derniers jours, autour de tes passions :";

    var boite = document.createElement("div");
    boite.className = "recap-semaine-lignes";
    liste.forEach(function (l) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "recap-semaine-ligne";
      b.setAttribute("data-recap", l.cle);
      var em = document.createElement("span");
      em.setAttribute("aria-hidden", "true");
      em.textContent = l.emoji;
      var tx = document.createElement("span");
      tx.className = "recap-semaine-texte";
      tx.textContent = l.texte;
      var fl = document.createElement("span");
      fl.className = "recap-semaine-fleche";
      fl.setAttribute("aria-hidden", "true");
      fl.textContent = "›";
      b.appendChild(em); b.appendChild(tx); b.appendChild(fl);
      b.addEventListener("click", function () { aller(l.cle); });
      boite.appendChild(b);
    });

    var stop = document.createElement("button");
    stop.type = "button";
    stop.className = "recap-semaine-couper";
    stop.textContent = "Ne plus afficher le récap";
    stop.addEventListener("click", couper);

    carte.appendChild(fermer); carte.appendChild(titre); carte.appendChild(sous);
    carte.appendChild(boite); carte.appendChild(stop);
    fil.parentNode.insertBefore(carte, fil);
    return true;
  }

  // ── Déroulé ────────────────────────────────────────────────────────────────
  function tenter() {
    if (!actif() || traiteCetteSession || enCours) return;
    var uid = compte();
    if (!uid || !clientReel() || !filPret()) {
      if (++essais < ESSAIS_MAX) setTimeout(tenter, PAS_MS);
      return;
    }
    traiteCetteSession = true;
    if (!voulu()) return;
    var semaine = semaineIso(new Date());
    if (dejaTraitee(uid, semaine)) return;
    enCours = true;
    ageCompte(clientReel()).then(function (age) {
      // Sans session, ou compte de moins de 3 jours : rien n'est lu, et la
      // semaine n'est PAS marquée — la prochaine ouverture réévalue.
      if (age === null || age < AGE_MIN_MS) { enCours = false; return null; }
      marquer(uid, semaine);
      return lire(uid).then(function (r) {
        enCours = false;
        // Le compte a pu changer pendant la lecture : on ne peint pas pour un autre.
        if (compte() !== uid || !actif() || !voulu()) return;
        var l = lignes(r);
        if (!l.length) return;
        if (poser(l)) track("weekly_recap_shown", { lignes: l.length });
      });
    }).then(null, function (e) { enCours = false; journal("lecture", e); });
  }

  function amorcer() {
    essais = 0;
    setTimeout(tenter, PAS_MS);
  }

  try {
    window.addEventListener("passio:app-ready", amorcer);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", amorcer, { once: true });
    else amorcer();
  } catch (e) { journal("amorce", e); }

  window.PassioRecapSemaine = {
    actif: actif,
    // Exposés pour le banc : la RÈGLE réelle, jamais une copie.
    lignes: lignes,
    semaineIso: semaineIso,
    tenter: tenter,
  };
})();
