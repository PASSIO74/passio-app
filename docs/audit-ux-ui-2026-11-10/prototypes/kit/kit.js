/* Kit des prototypes de l'audit UX/UI PASSIO — navigation entre écrans maquettés.
   Aucune donnée réelle, aucun appel réseau, rien n'est enregistré.

   Dans le HTML du prototype :
     <section data-ecran="fil">…</section>            un écran (un seul visible à la fois)
     <div data-couche="partage">…</div>               une couche au-dessus de l'écran (feuille, menu, modale)
     data-aller="conversation"                        un clic mène à cet écran
     data-ouvrir="partage" / data-fermer="partage"    ouvre / ferme une couche
     data-action="nom"                                appelle PROTO.actions.nom(element, evenement)
     data-etat="cle:valeur"                           pose document.body.dataset[cle] = valeur (états CSS)
   Le parcours guidé est décrit par :
     <script type="application/json" id="proto-parcours">[{ "titre": "…", "note": "…", "ecran": "fil",
        "couches": ["partage"], "cible": "#idDeLaCible", "refs": "FIL-C03 · PAR-C01", "etat": {"cle": "valeur"} }]</script>
*/
(function () {
  "use strict";
  var tel = document.querySelector(".proto-telephone");
  if (!tel) return;
  var PROTO = window.PROTO = window.PROTO || {};
  PROTO.actions = PROTO.actions || {};
  var etapes = [];
  try { etapes = JSON.parse((document.getElementById("proto-parcours") || { textContent: "[]" }).textContent); } catch (e) { etapes = []; }
  var courant = -1;

  function ecran(nom) {
    var trouve = false;
    tel.querySelectorAll("[data-ecran]").forEach(function (s) { var oui = s.getAttribute("data-ecran") === nom; s.classList.toggle("proto-actif", oui); if (oui) trouve = true; });
    if (trouve) { PROTO.ecranCourant = nom; if (typeof PROTO.surEcran === "function") PROTO.surEcran(nom); }
    return trouve;
  }
  function couche(nom, ouvrir) {
    tel.querySelectorAll('[data-couche="' + nom + '"]').forEach(function (c) { c.classList.toggle("proto-ouverte", ouvrir); });
  }
  function fermerCouches() { tel.querySelectorAll("[data-couche].proto-ouverte").forEach(function (c) { c.classList.remove("proto-ouverte"); }); }
  function poserEtat(o) { if (!o) return; Object.keys(o).forEach(function (k) { document.body.dataset[k] = o[k]; }); }
  function viser(sel) {
    tel.querySelectorAll(".proto-cible-active").forEach(function (x) { x.classList.remove("proto-cible-active"); });
    if (!sel) return;
    var el = tel.querySelector(sel);
    if (el) { el.classList.add("proto-cible-active"); if (el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "auto" }); }
  }
  PROTO.ecran = ecran; PROTO.couche = couche; PROTO.fermerCouches = fermerCouches; PROTO.viser = viser; PROTO.etat = poserEtat;

  function allerEtape(i) {
    if (i < 0 || i >= etapes.length) return;
    courant = i;
    var e = etapes[i];
    if (typeof PROTO.avantEtape === "function") PROTO.avantEtape(e, i);
    fermerCouches();
    if (e.etat) poserEtat(e.etat);
    if (e.ecran) ecran(e.ecran);
    (e.couches || []).forEach(function (c) { couche(c, true); });
    viser(e.cible);
    if (typeof PROTO.surEtape === "function") PROTO.surEtape(e, i);
    peindre();
  }
  PROTO.allerEtape = allerEtape;

  var liste = document.querySelector(".proto-etapes");
  function peindre() {
    if (liste) liste.querySelectorAll("li").forEach(function (li, k) { if (k === courant) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current"); });
    var p = document.querySelector("[data-proto='precedent']"), s = document.querySelector("[data-proto='suivant']");
    if (p) p.disabled = courant <= 0;
    if (s) { s.disabled = courant >= etapes.length - 1; s.textContent = courant < 0 ? "Commencer le parcours" : "Étape suivante"; }
  }
  if (liste) {
    liste.innerHTML = etapes.map(function (e, i) {
      var t = document.createElement("div"); t.textContent = e.titre || ""; var n = document.createElement("div"); n.textContent = e.note || ""; var r = document.createElement("div"); r.textContent = e.refs || "";
      return '<li><button type="button" data-etape="' + i + '"><span><strong>' + t.innerHTML + "</strong><span>" + n.innerHTML + "</span>" + (e.refs ? '<span class="proto-refs">' + r.innerHTML + "</span>" : "") + "</span></button></li>";
    }).join("");
  }

  document.addEventListener("click", function (ev) {
    var t = ev.target, b;
    if ((b = t.closest("[data-etape]"))) { allerEtape(Number(b.getAttribute("data-etape"))); return; }
    if ((b = t.closest("[data-proto]"))) {
      var quoi = b.getAttribute("data-proto");
      if (quoi === "suivant") allerEtape(courant + 1);
      else if (quoi === "precedent") allerEtape(courant - 1);
      else if (quoi === "zones") { var on = document.body.classList.toggle("proto-montrer-zones"); b.setAttribute("aria-pressed", String(on)); }
      else if (quoi === "recommencer") { location.reload(); }
      return;
    }
    if (!tel.contains(t)) return;
    b = t.closest("[data-etat]"); if (b) { var kv = b.getAttribute("data-etat").split(":"); document.body.dataset[kv[0]] = kv.slice(1).join(":"); }
    b = t.closest("[data-action]"); if (b) { var f = PROTO.actions[b.getAttribute("data-action")]; if (typeof f === "function") f(b, ev); }
    b = t.closest("[data-fermer]"); if (b) { var nomF = b.getAttribute("data-fermer"); if (nomF === "*") fermerCouches(); else couche(nomF, false); }
    b = t.closest("[data-ouvrir]"); if (b) couche(b.getAttribute("data-ouvrir"), true);
    b = t.closest("[data-aller]"); if (b) { fermerCouches(); ecran(b.getAttribute("data-aller")); viser(null); }
  });
  document.addEventListener("keydown", function (ev) {
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "")) return;
    if (ev.key === "ArrowRight") allerEtape(courant + 1);
    if (ev.key === "ArrowLeft") allerEtape(courant - 1);
    if (ev.key === "Escape") fermerCouches();
  });

  // Écran de départ : le premier du parcours, sinon le premier du document.
  var depart = (etapes[0] && etapes[0].ecran) || (tel.querySelector("[data-ecran]") || { getAttribute: function () { return null; } }).getAttribute("data-ecran");
  if (depart) ecran(depart);
  peindre();
})();
