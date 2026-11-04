// PASSIO Pilotage — LE centre de pilotage, dans le nuage, sans PC (2026-09-28).
// Refait le 2026-11-04 autour des deux besoins de Benjamin : suivre la croissance
// (le nombre d'utilisateurs, et sa marche) et régler n'importe quel problème d'un
// seul toucher. Un seul écran, sans barre d'onglets ; le reste (d'où viennent les
// gens, détail technique, réglages) est rangé derrière trois lignes, en bas.
// Données et gestes : Edge Function `pilotage` (Supabase), réservée au compte
// éditeur. Session : celle de PASSIO sur ce téléphone (même origine).
// Règles : nœuds + textContent uniquement, jamais innerHTML ; les seuls liens
// vers l'extérieur sont ceux de LIENS_SURS ; un geste n'est qu'une DEMANDE — la
// fonction décide (liste blanche, jeton, plafond). Aucune confirmation : le toucher
// arme le geste, qui part 5 s plus tard ; retoucher l'annule (`armer`).
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const cfg = window.PILOTAGE_SUPABASE || {};
  const sb = window.supabase && window.supabase.createClient(cfg.url, cfg.anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const FONCTION = cfg.url + "/functions/v1/pilotage";
  // Au-delà, les données affichées sont dites PÉRIMÉES : une lecture a échoué
  // et l'écran montrerait sinon un vieux vert comme s'il était d'aujourd'hui.
  const PERIME_MS = 3 * 60e3;
  // Les seules adresses qu'un bouton « Régler » peut ouvrir (PAGES_REGLAGE, _shared/pilotage.js).
  const LIENS_SURS = /^https:\/\/(github\.com|supabase\.com\/dashboard|app\.netlify\.com|app\.brevo\.com)\//;
  let derniere = 0, enCours = false, compte = null, gestesGithub = false, erreursLecture = {};

  // ─── Nœuds ────────────────────────────────────────────────────────────────
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; }
  function vider(id) { const n = $(id); while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function carte(titre, etiquette, texte, couleur) {
    const c = el("article", "carte" + (couleur ? " " + couleur : ""));
    const t = el("div", "carte-tete");
    t.append(el("span", "carte-titre", titre));
    if (etiquette) t.append(el("span", "etiquette " + (couleur || "gris"), etiquette));
    c.append(t);
    if (texte) c.append(el("p", null, texte));
    return c;
  }
  function actions(c) { let a = c.querySelector(":scope > .carte-actions"); if (!a) { a = el("div", "carte-actions"); c.append(a); } return a; }
  function lien(c, url, texte) {
    if (!/^https:\/\/github\.com\//.test(String(url || ""))) return;
    const a = el("a", null, texte || "Ouvrir sur GitHub"); a.href = url; a.target = "_blank"; a.rel = "noopener";
    actions(c).append(a);
  }

  // ─── Un toucher, et c'est parti (2026-11-04) ──────────────────────────────
  // « Régler en un seul clic » : plus aucune boîte de confirmation du navigateur, qui
  // faisait deux touchers pour un. Le toucher ARME le geste, qui part seul au bout de 5 s ; le bouton
  // affiche « Annuler (5) » : retoucher annule, ce qui rattrape un doigt qui glisse.
  // Quitter la page fait partir le geste tout de suite : celui qui a touché
  // « Régler » puis verrouille son téléphone ne doit pas le retrouver en attente.
  const DELAI_ANNULER_MS = 5000;
  const delaiAnnuler = () => (Number.isFinite(window.PILOTAGE_DELAI_ANNULER_MS) ? window.PILOTAGE_DELAI_ANNULER_MS : DELAI_ANNULER_MS);
  const armes = new Set();
  function armer(b, partir) {
    const libelle = b.textContent, delai = delaiAnnuler(), fin = Date.now() + delai;
    const compter = () => { b.textContent = "Annuler (" + Math.max(1, Math.ceil((fin - Date.now()) / 1000)) + ")"; };
    const arreter = () => { clearTimeout(minuteur); clearInterval(rythme); armes.delete(arme); b.classList.remove("arme"); b.textContent = libelle; };
    const arme = {
      partir() { arreter(); partir(); },
      annuler() { arreter(); succes("Annulé : rien n'est parti."); relireSiAttendu(); },
    };
    b.style.setProperty("--delai", delai + "ms");
    b.classList.add("arme");
    compter();
    const rythme = setInterval(compter, 250);
    const minuteur = setTimeout(() => arme.partir(), delai);
    armes.add(arme);
    return arme;
  }
  /**
   * Un bouton à un toucher. `preparer` lit ce qu'il faut au toucher (un champ, un
   * aperçu) et rend ce qu'`action` recevra ; rien de rendu → rien n'est armé.
   */
  function toucher(b, preparer, action) {
    let arme = null;
    b.addEventListener("click", async () => {
      if (arme) { const a = arme; arme = null; a.annuler(); return; }
      if (b.disabled) return;
      let pret = true;
      if (preparer) {
        b.disabled = true;
        try { pret = await preparer(); }
        catch (e) { erreur("Refusé : " + e.message); pret = null; }
        b.disabled = false;
      }
      if (!pret) return;
      arme = armer(b, () => { arme = null; action(pret); });
    });
    return b;
  }
  async function envoyer(b, corps) {
    const libelle = b.textContent;
    b.disabled = true; b.textContent = "…";
    try {
      const r = await appeler(corps);
      succes((r && r.message) || "Fait.");
      await actualiser();
    } catch (e) { erreur("Refusé : " + e.message); b.disabled = false; b.textContent = libelle; }
  }
  function boutonGeste(texte, corps, classe) {
    const b = el("button", "btn" + (classe ? " " + classe : ""), texte); b.type = "button";
    // `corps` peut être une fonction : elle lit un champ AU TOUCHER (couper une
    // fonctionnalité, écrire un bandeau). Rien à envoyer → rien n'est armé.
    toucher(b, () => (typeof corps === "function" ? corps() : corps), (fige) => envoyer(b, fige));
    return b;
  }
  function bouton(c, texte, corps) { const b = boutonGeste(texte, corps); actions(c).append(b); return b; }

  // Retour arrière (2026-10-13) : le pilote VOIT ce qu'il va faire. Le toucher
  // demande l'aperçu (version servie → version qui serait remise, revalidée côté
  // serveur), l'écrit sous le problème pendant les 5 s d'annulation, puis envoie la
  // cible de l'aperçu, que la fonction refuse si la situation a changé entre-temps.
  function dateCourte(v) {
    const t = Date.parse(String(v || ""));
    return Number.isFinite(t) ? new Date(t).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "date inconnue";
  }
  function boutonRetourNu(texte, zone, classe) {
    const b = el("button", "btn" + (classe ? " " + classe : ""), texte); b.type = "button";
    toucher(b, async () => {
      const a = await appeler({ action: "retour_apercu" });
      const cible = (a && a.cible) || {}, courant = (a && a.courant) || {};
      let ap = zone.querySelector(".apercu");
      if (!ap) { ap = el("span", "apercu"); zone.append(ap); }
      ap.textContent = "Remet la version " + cible.commit + " (publiée le " + dateCourte(cible.publie) + ") à la place de " + courant.commit
        + " (publiée le " + dateCourte(courant.publie) + "). Le prochain déploiement de main remettra la version actuelle.";
      return cible;
    }, (cible) => envoyer(b, { action: "retour_arriere", cible: cible.id }));
    return b;
  }
  function boutonRetour(c, texte) { const b = boutonRetourNu(texte || "Remettre la version précédente", c, "btn-principal"); actions(c).append(b); return b; }

  /** Un chiffre clé : la valeur, ce qu'elle mesure, et une ligne de contexte (tendance). */
  function chiffre(v, libelle, couleur, sous) {
    const c = el("div", "chiffre" + (couleur ? " " + couleur : ""));
    c.append(el("b", null, v == null ? "—" : v), el("span", null, libelle));
    if (sous) c.append(el("small", "tendance" + (sous.classe ? " " + sous.classe : ""), sous.texte));
    return c;
  }
  /** La tendance rendue par la fonction → une ligne : ▲ +3 vs 7 j d'avant (verte si bonne nouvelle). */
  function ligneTendance(t, periode) {
    if (!t || typeof t !== "object") return null;
    const fleche = t.sens === "hausse" ? "▲" : t.sens === "baisse" ? "▼" : "=";
    const delta = Number(t.delta) || 0;
    return { texte: fleche + " " + (delta > 0 ? "+" : "") + delta + " vs " + periode, classe: t.bon === true ? "bon" : t.bon === false ? "mauvais" : "" };
  }
  function ilYA(v) {
    const t = typeof v === "number" ? v : Date.parse(String(v));
    if (!Number.isFinite(t)) return "date inconnue";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "à l'instant";
    if (s < 3600) return "il y a " + Math.round(s / 60) + " min";
    if (s < 172800) return "il y a " + Math.round(s / 3600) + " h";
    return "il y a " + Math.round(s / 86400) + " j";
  }
  function duree(ms) {
    const m = Math.round(Number(ms) / 60e3);
    if (!Number.isFinite(m)) return "?";
    return m < 60 ? m + " min" : m < 2880 ? Math.round(m / 60) + " h" : Math.round(m / 1440) + " j";
  }
  function taille(o) {
    if (o == null) return "—";
    const u = ["o", "Ko", "Mo", "Go", "To"]; let i = 0, v = Number(o);
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return (v >= 10 || i === 0 ? Math.round(v) : Number(v.toFixed(1))).toString().replace(".", ",") + " " + u[i];
  }
  // « Non lu », avec la raison quand la fonction la connaît : un bloc vide ou un
  // zéro passerait pour une mesure.
  function nonLu(id, titre, partie) {
    const raison = erreursLecture[partie || id];
    vider(id).append(carte(titre, "Non lu", "Cette partie n'a pas pu être lue" + (raison ? " (" + raison + ")" : "") + ".", "gris"));
  }
  function graphe(id, serie) {
    const g = vider(id);
    const s = Array.isArray(serie) ? serie : [];
    g.hidden = !s.length;
    const max = Math.max(1, ...s.map((x) => Number(x.n) || 0));
    s.forEach((x, i) => {
      const n = Number(x.n) || 0;
      const b = el("div", "barre-j" + (n ? "" : " zero"));
      b.style.height = Math.max(2, Math.round((n / max) * 100)) + "%";
      b.title = x.jour + " : " + n;
      if (i === 0 || i === s.length - 1) b.append(el("span", null, String(x.jour || "").slice(5).replace("-", "/")));
      g.append(b);
    });
  }
  function miniGraphe(serie) {
    const g = el("div", "mini-graphe");
    const s = Array.isArray(serie) ? serie : [];
    const max = Math.max(1, ...s.map((x) => Number(x.n) || 0));
    s.forEach((x) => { const b = el("span", Number(x.n) ? "" : "zero"); b.style.height = Math.max(6, Math.round((Number(x.n) / max) * 100)) + "%"; b.title = x.jour + " : " + x.n; g.append(b); });
    return g;
  }

  // ─── Écrans ───────────────────────────────────────────────────────────────
  function ecran(nom) {
    $("ecranConnexion").hidden = nom !== "connexion";
    $("ecranRefus").hidden = nom !== "refus";
    $("app").hidden = nom !== "app";
    if (nom === "app") dessinerMarche();
  }
  function erreur(t) { const b = $("bandeauErreur"); b.hidden = !t; b.textContent = t || ""; }
  $("bandeauErreur").addEventListener("click", () => erreur(""));
  let minuteurOk = null;
  function succes(t) { const b = $("bandeauOk"); b.hidden = !t; b.textContent = t || ""; clearTimeout(minuteurOk); minuteurOk = setTimeout(() => { b.hidden = true; }, 6000); }
  function majEtat() {
    const e = $("etatMaj");
    const age = derniere ? Date.now() - derniere : 0;
    const perime = !!derniere && age > PERIME_MS && !enCours;
    const p = $("perime");
    p.hidden = !perime;
    if (perime) p.textContent = "Ces informations datent de " + ilYA(derniere).replace("il y a ", "") + " : la dernière lecture a échoué. Touche ↻ pour réessayer.";
    $("verdict").classList.toggle("perime", perime);
    if (!navigator.onLine) { e.textContent = "Hors ligne"; e.className = "etat-maj hors-ligne"; return; }
    e.className = "etat-maj" + (perime ? " hors-ligne" : ""); e.textContent = derniere ? "Mis à jour " + ilYA(derniere) : "Chargement…";
  }

  // Navigation : l'accueil, et des pages qu'on quitte par « ‹ » ou par le bouton
  // retour du téléphone (sans l'historique, il fermait l'application installée).
  const VUES_LIEN = ["croissance", "details", "reglages"];
  function afficher(id) {
    document.querySelectorAll(".onglet").forEach((o) => o.classList.toggle("actif", o.id === id));
    $("titreOnglet").textContent = ($(id) && $(id).dataset.titre) || "Pilotage";
    $("retour").hidden = id === "accueil";
    window.scrollTo(0, 0);
    if (id === "accueil") dessinerMarche();
    if (id === "inscrits" && !inscritsCharges.length) chargerInscrits();
  }
  function aller(id) { history.pushState({ vue: id, depuisPage: true }, "", "#" + id); afficher(id); }
  const vueDuLien = () => {
    if (history.state && history.state.vue) return history.state.vue;
    const h = location.hash.slice(1);
    return VUES_LIEN.includes(h) ? h : "accueil";
  };
  window.addEventListener("popstate", () => afficher(vueDuLien()));
  $("retour").addEventListener("click", () => {
    if ($("retour").hidden) return;
    // Caché tout de suite : history.back() n'agit qu'un instant plus tard, et un double toucher
    // reculerait deux fois, jusqu'à quitter le pilotage.
    if (history.state && history.state.depuisPage) { $("retour").hidden = true; history.back(); return; }
    history.replaceState(null, "", location.pathname); afficher("accueil");
  });
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => aller(b.dataset.tab)));

  // ─── Appels ───────────────────────────────────────────────────────────────
  let pageQuittee = false;
  async function appeler(corps) {
    const { data } = await sb.auth.getSession();
    const jeton = data && data.session && data.session.access_token;
    if (!jeton) { const e = new Error("non connecté"); e.status = 401; throw e; }
    const action = (corps && corps.action) || "etat";
    const r = await fetch(FONCTION, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + jeton, apikey: cfg.anon },
      body: JSON.stringify(corps || { action: "etat" }),
      cache: "no-store",
      // Un geste doit arriver même si la page se ferme juste après son départ (voir `armer`).
      keepalive: pageQuittee && action !== "etat",
    });
    let j = null; try { j = await r.json(); } catch (_e) { /* corps illisible */ }
    if (!r.ok) { const e = new Error((j && j.error) || ("HTTP " + r.status)); e.status = r.status; throw e; }
    return j;
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────
  function rendre(d) {
    gestesGithub = !!d.gestesGithub;
    erreursLecture = (d.erreursLecture && typeof d.erreursLecture === "object") ? d.erreursLecture : {};
    rendreVerdict(d, rendreAFaire(d));
    rendreCroissanceAccueil(d);
    rendreChiffres(d);
    rendreNouveauxComptes(d);
    rendreSite(d);
    rendreErreurs(d);
    rendreUtilisateurs(d);
    rendreMachines(d);
    rendreCapacite(d);
    rendreCroissance(d);
    rendreHistorique(d);
    rendreReglages(d);
  }

  // Le voyant reste celui du serveur (`verdictAffiche` : jamais de vert sans avoir
  // tout lu). La phrase dessous dit ce qu'il y a à faire ; les raisons ne reviennent
  // que si aucune ligne ne les porte, et ce qui n'a pas été lu est toujours dit.
  function rendreVerdict(d, liste) {
    const v = d.verdict || { couleur: "gris", titre: "Pas de nouvelles", raisons: [] };
    $("verdict").className = "verdict " + v.couleur;
    $("panneau").className = "panneau " + v.couleur;
    $("verdictTitre").textContent = v.titre;
    const raisons = (Array.isArray(v.raisons) ? v.raisons : []).map(String);
    const nonLus = raisons.filter((r) => /^non lu/.test(r));
    const n = liste.problemes;
    const prevenu = d.alertes && d.alertes.appareils ? " Tu seras prévenu ici si quelque chose casse." : "";
    const phrase = liste.indisponible ? [] : n > 1 ? [n + " choses à régler."] : n === 1 ? ["1 chose à régler."]
      : liste.enCours ? ["Rien à régler : les machines s'en occupent."]
      : v.couleur === "vert" || !raisons.length ? ["Rien à régler." + prevenu] : raisons.filter((r) => !/^non lu/.test(r)).slice(0, 3);
    $("verdictDetail").textContent = phrase.concat(nonLus).join(" ");
  }

  // Une ligne : ce qui est cassé, ce que le bouton va faire, et le bouton. Le reste
  // (la référence technique, refuser, fermer, voir sur GitHub) se déplie en touchant
  // le texte. Les textes de tiers (titres d'issue, messages d'erreur, motifs) passent
  // par textContent.
  function boutonPrincipal(g, zone) {
    if (g.ouvrir) {
      if (!LIENS_SURS.test(String(g.ouvrir))) return null;
      const a = el("a", "btn btn-regler", g.libelle); a.href = g.ouvrir; a.target = "_blank"; a.rel = "noopener";
      return a;
    }
    if (g.special === "retour") return boutonRetourNu(g.libelle, zone, "btn-regler");
    if (g.special === "relire") {
      const b = el("button", "btn btn-regler", g.libelle); b.type = "button";
      b.addEventListener("click", () => actualiser());
      return b;
    }
    if (!g.corps || typeof g.corps !== "object" || typeof g.corps.action !== "string") return null;
    return boutonGeste(g.libelle, g.corps, "btn-regler");
  }
  function libelleLien(x) {
    const id = String(x.id || "");
    return id.startsWith("pr:") ? "Voir le détail" : id.startsWith("run:") ? "Voir l'exécution" : "Ouvrir sur GitHub";
  }
  const lignesOuvertes = new Set();
  function ligne(x) {
    const c = el("article", "ligne" + (x.couleur ? " " + x.couleur : ""));
    const gestes = (Array.isArray(x.gestes) ? x.gestes : []).filter((g) => g && (g.corps || g.special || g.ouvrir));
    const principal = gestes.find((g) => g.principal);
    const autres = gestes.filter((g) => g !== principal);
    const url = /^https:\/\/github\.com\//.test(String(x.url || "")) ? x.url : null;
    const titre = el("span", "ligne-titre", x.titre);
    const vus = [titre];
    if (x.quoi) vus.push(el("span", "ligne-quoi", x.quoi));
    if (x.detail) vus.push(el("span", "ligne-detail", x.detail));
    const suite = [];
    if (x.reference) suite.push(el("span", "ligne-reference", x.reference));
    if (autres.length || url) {
      const zone = el("div", "ligne-decisions");
      autres.forEach((g) => zone.append(boutonGeste(g.libelle, g.corps)));
      if (url) { const a = el("a", null, libelleLien(x)); a.href = url; a.target = "_blank"; a.rel = "noopener"; zone.append(a); }
      suite.push(zone);
    }
    // Replié quand un bouton suffit, ou qu'une machine s'en occupe. Une décision qu'aucune
    // machine ne prend (un signalement) et un geste « pour info » gardent tout sous les yeux.
    let visible;
    if ((principal || x.enCours) && suite.length) {
      const repli = el("details", "ligne-texte");
      visible = el("summary");
      visible.append(...vus);
      titre.classList.add("depliable");
      repli.append(visible, ...suite);
      // Une relecture repeint tout, chaque minute : ce qu'on est en train de lire reste ouvert.
      repli.open = lignesOuvertes.has(x.id);
      repli.addEventListener("toggle", () => { if (repli.open) lignesOuvertes.add(x.id); else lignesOuvertes.delete(x.id); });
      c.append(repli);
    } else {
      visible = el("div", "ligne-texte");
      visible.append(...vus, ...suite);
      c.append(visible);
    }
    const b = principal ? boutonPrincipal(principal, visible) : null;
    if (b) c.append(b);
    return c;
  }

  // Au plus trois problèmes d'un coup : la croissance reste sur le même écran.
  const PROBLEMES_VISIBLES = 3;
  let afaireDeplie = false, aRegler = [];
  function rendreAFaire(d) {
    const z = vider("afaire"), info = vider("pourInfo"), ec = vider("enCours");
    const suite = $("afaireSuite"), tout = $("toutRegler");
    aRegler = [];
    if (!Array.isArray(d.aFaire)) {
      // Une fonction qui ne rend pas la liste (pas encore mise à jour) : jamais un faux « rien à régler ».
      z.append(ligne({ titre: "Liste indisponible", quoi: "La fonction « pilotage » n'a pas rendu la liste : elle n'est sans doute pas encore à jour. Réessaie dans quelques minutes.", couleur: "gris" }));
      suite.hidden = true; tout.hidden = true; $("enCoursZone").hidden = true; $("pourInfoRepli").hidden = true;
      return { problemes: 0, enCours: 0, indisponible: true };
    }
    const toutes = d.aFaire.filter(Boolean);
    const problemes = toutes.filter((x) => x.prio <= 1 && !x.enCours);
    const enCoursListe = toutes.filter((x) => x.enCours);
    const pourInfo = toutes.filter((x) => x.prio >= 2 && !x.enCours);
    const visibles = afaireDeplie ? problemes : problemes.slice(0, PROBLEMES_VISIBLES);
    visibles.forEach((x) => z.append(ligne(x)));
    const caches = problemes.length - visibles.length;
    suite.hidden = !caches;
    suite.textContent = caches === 1 ? "Voir le dernier" : "Voir les " + caches + " autres";
    // « Tout régler » : les gestes `tout` de chaque problème, une seule fois chacun.
    const vus = new Set();
    problemes.forEach((x) => {
      const g = (Array.isArray(x.gestes) ? x.gestes : []).find((y) => y && y.principal && y.tout && y.corps);
      if (!g) return;
      const cle = JSON.stringify(g.corps);
      if (!vus.has(cle)) { vus.add(cle); aRegler.push(g.corps); }
    });
    tout.hidden = aRegler.length < 2;
    tout.textContent = "Tout régler (" + aRegler.length + ")";
    $("enCoursZone").hidden = !enCoursListe.length;
    enCoursListe.forEach((x) => ec.append(ligne(x)));
    $("pourInfoRepli").hidden = !pourInfo.length;
    $("pourInfoTitre").textContent = "Pour info (" + pourInfo.length + ")";
    pourInfo.forEach((x) => info.append(ligne(x)));
    return { problemes: problemes.length, enCours: enCoursListe.length, indisponible: false };
  }
  $("afaireSuite").addEventListener("click", () => {
    afaireDeplie = true;
    if (derniereLecture) rendreVerdict(derniereLecture, rendreAFaire(derniereLecture));
  });
  toucher($("toutRegler"), () => (aRegler.length ? aRegler.slice() : null), async (file) => {
    const b = $("toutRegler");
    b.disabled = true;
    let faits = 0;
    const refus = [];
    for (let i = 0; i < file.length; i++) {
      b.textContent = "Réglage " + (i + 1) + " sur " + file.length + "…";
      try { await appeler(file[i]); faits++; } catch (e) { refus.push(e.message); }
    }
    b.disabled = false;
    // Après la relecture, qui efface le bandeau d'erreur en réussissant.
    await actualiser();
    if (faits) succes(faits === 1 ? "1 problème pris en main." : faits + " problèmes pris en main.");
    if (refus.length) erreur(refus.length + " refusé" + (refus.length > 1 ? "s" : "") + " : " + refus.join(" "));
  });

  // ─── La marche des utilisateurs (2026-11-04) ──────────────────────────────
  // Une marche par jour où quelqu'un est arrivé : tant que l'app est petite, chaque
  // marche est une vraie personne. Le nombre se pose dans le vide que laisse
  // l'escalier en haut à gauche ; le tout tient sur le premier écran du téléphone.
  const SVG = "http://www.w3.org/2000/svg";
  const dessin = (tag, attrs) => { const n = document.createElementNS(SVG, tag); Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, String(v))); return n; };
  const jourMs = (j) => Date.parse(String(j) + "T00:00:00Z");
  const dateJour = (j, annee) => new Date(jourMs(j)).toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(annee ? { year: "numeric" } : {}), timeZone: "UTC" });
  let marche = [], marcheVue = null, marcheVeil = null;
  function dessinerMarche() {
    const zone = $("marche");
    while (zone.firstChild) zone.removeChild(zone.firstChild);
    $("marcheInfo").hidden = true;
    marcheVue = null;
    $("marcheAxe").hidden = !marche.length;
    if (!marche.length) return;
    const L = zone.clientWidth, H = zone.clientHeight;
    if (!L || !H) return;   // page cachée : l'observateur de taille la redessine au retour
    const haut = 10, droite = 7, bas = 1;
    const t0 = jourMs(marche[0].jour), t1 = Math.max(Date.now(), t0 + 864e5);
    const max = Math.max(1, marche[marche.length - 1].total);
    const x = (t) => ((t - t0) / (t1 - t0)) * (L - droite);
    const y = (v) => H - bas - (v / max) * (H - bas - haut);
    let trace = "M0 " + y(0).toFixed(1);
    marche.forEach((p) => { trace += " H" + x(jourMs(p.jour)).toFixed(1) + " V" + y(p.total).toFixed(1); });
    const finX = x(t1), finY = y(max);
    trace += " H" + finX.toFixed(1);
    const s = dessin("svg", { width: L, height: H, viewBox: "0 0 " + L + " " + H, "aria-hidden": "true" });
    s.append(
      dessin("line", { class: "marche-base", x1: 0, x2: L, y1: y(0) + 0.5, y2: y(0) + 0.5 }),
      dessin("path", { class: "marche-aire", d: trace + " V" + y(0).toFixed(1) + " H0 Z" }),
      dessin("path", { class: "marche-trait", d: trace }),
      dessin("circle", { class: "marche-bout", cx: finX, cy: finY, r: 4.5 }),
    );
    const repere = dessin("line", { class: "marche-repere", y1: 0, y2: H, visibility: "hidden" });
    const point = dessin("circle", { class: "marche-bout", r: 4.5, visibility: "hidden" });
    s.append(repere, point);
    zone.append(s);
    marcheVue = { x, y, repere, point, L };
  }
  function montrerPoint(i) {
    if (!marcheVue) return;
    const p = marche[i], X = marcheVue.x(jourMs(p.jour)), Y = marcheVue.y(p.total);
    const info = $("marcheInfo");
    while (info.firstChild) info.removeChild(info.firstChild);
    info.append(el("strong", null, p.total + (p.total > 1 ? " utilisateurs" : " utilisateur")), el("span", null, "le " + dateJour(p.jour) + " (+" + p.n + ")"));
    info.hidden = false;
    info.style.left = Math.max(0, Math.min(marcheVue.L - info.offsetWidth, X - info.offsetWidth / 2)) + "px";
    marcheVue.repere.setAttribute("x1", X); marcheVue.repere.setAttribute("x2", X); marcheVue.repere.setAttribute("visibility", "visible");
    marcheVue.point.setAttribute("cx", X); marcheVue.point.setAttribute("cy", Y); marcheVue.point.setAttribute("visibility", "visible");
    marcheI = i;
  }
  function cacherPoint() {
    $("marcheInfo").hidden = true;
    if (marcheVue) { marcheVue.repere.setAttribute("visibility", "hidden"); marcheVue.point.setAttribute("visibility", "hidden"); }
  }
  let marcheI = -1;
  function pointSous(e) {
    if (!marcheVue || !marche.length) return;
    const bord = $("marche").getBoundingClientRect(), px = e.clientX - bord.left;
    let meilleur = 0, ecart = Infinity;
    marche.forEach((p, i) => { const d = Math.abs(marcheVue.x(jourMs(p.jour)) - px); if (d < ecart) { ecart = d; meilleur = i; } });
    montrerPoint(meilleur);
  }
  $("marche").addEventListener("pointermove", pointSous);
  $("marche").addEventListener("pointerdown", (e) => {
    pointSous(e);
    // Au doigt, le relâcher ne doit pas tout effacer d'un coup : la valeur reste lisible 3 s.
    clearTimeout(marcheVeil);
    if (e.pointerType === "touch") marcheVeil = setTimeout(cacherPoint, 3000);
  });
  $("marche").addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") cacherPoint(); });
  $("marche").addEventListener("blur", cacherPoint);
  $("marche").addEventListener("keydown", (e) => {
    if (!marche.length || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const pas = e.key === "ArrowLeft" ? -1 : 1;
    const depart = marcheI < 0 || marcheI >= marche.length ? marche.length : marcheI;
    montrerPoint(Math.max(0, Math.min(marche.length - 1, depart + pas)));
  });
  if (window.ResizeObserver) new ResizeObserver(() => dessinerMarche()).observe($("marche"));
  $("totalUtilisateurs").addEventListener("click", () => ouvrirInscrits());

  function rendreCroissanceAccueil(d) {
    const act = d.activation, u = d.utilisateurs;
    const ins = act && act.inscrits && typeof act.inscrits.total === "number" ? act.inscrits : null;
    $("totalNombre").textContent = ins ? ins.total + (ins.tronque ? "+" : "") : "—";
    $("totalLibelle").textContent = ins && ins.total === 1 ? "utilisateur" : "utilisateurs";
    $("totalUtilisateurs").setAttribute("aria-label", (ins ? ins.total + (ins.tronque ? " au moins" : "") : "Nombre non lu :") + " utilisateurs, voir la liste");
    // Les chiffres de la courbe d'abord : ils s'additionnent exactement au total.
    const semaine = ins && typeof ins.semaine === "number" ? ins.semaine : u ? u.inscritsSemaine : null;
    const avant = ins && typeof ins.semainePrec === "number" ? ins.semainePrec : u ? u.inscritsSemainePrec : null;
    const mois = ins && typeof ins.mois === "number" ? ins.mois : null;
    const combien = (n) => (n ? "+" + n : "aucun");
    $("evolutionSemaine").textContent = semaine == null ? "Évolution non lue." : semaine ? "+" + semaine + " cette semaine." : "Aucun nouveau cette semaine.";
    const contexte = [];
    if (avant != null) contexte.push(combien(avant) + " la semaine d'avant");
    if (mois != null) contexte.push(combien(mois) + " sur 30 jours");
    $("evolutionAvant").textContent = contexte.length ? contexte.join(", ").replace(/^./, (c) => c.toUpperCase()) + "." : "";
    marche = ins && Array.isArray(ins.courbe) ? ins.courbe : [];
    if (marche.length) {
      const annee = marche[0].jour.slice(0, 4) !== new Date().toISOString().slice(0, 4);
      $("marcheDebut").textContent = dateJour(marche[0].jour, annee);
      $("marche").setAttribute("aria-label", "De " + marche[0].total + " le " + dateJour(marche[0].jour, annee) + " à " + marche[marche.length - 1].total + " utilisateurs aujourd'hui.");
    }
    dessinerMarche();
    // Un palier franchi cette semaine (_shared/pilotage.js) : une bonne nouvelle, et ce qu'elle appelle.
    const zp = vider("palier");
    const palier = Array.isArray(d.aFaire) ? d.aFaire.find((x) => x && x.franchi) : null;
    zp.hidden = !palier;
    if (palier) zp.append(el("strong", null, palier.titre), el("span", null, palier.detail));
    // Qui est là, maintenant : trois chiffres, jamais un faux zéro.
    const m5 = (u && u.maintenant) || null, j24 = (u && u.aujourdhui) || null;
    const au = vider("audience");
    [[m5 ? m5.appareils : null, "en ligne"], [j24 ? j24.comptes : null, "actifs sur 24 h"], [j24 ? j24.appareils : null, "visiteurs sur 24 h"]].forEach(([v, l]) => {
      const b = el("div");
      b.append(el("dt", null, l), el("dd", null, v == null ? "—" : v));
      au.append(b);
    });
  }

  function rendreChiffres(d) {
    const ch = vider("chiffres");
    const u = d.utilisateurs, er = d.erreurs, act = d.activation, t = d.tendances || {}, mel = d.miseEnLigne;
    const m5 = (u && u.maintenant) || null, j24 = (u && u.aujourdhui) || null;
    ch.append(
      chiffre(m5 ? m5.appareils : null, "en ligne maintenant", null, m5 ? { texte: m5.comptes + " compte(s) connecté(s)" } : null),
      chiffre(j24 ? j24.appareils : null, "visiteurs (24 h)", null, j24 ? { texte: j24.comptes + " compte(s) actif(s)" } : null),
      chiffre(u ? u.inscritsSemaine : null, "inscriptions (7 j)", null, ligneTendance(t.inscriptions, "7 j d'avant")),
      chiffre(er && er.total7 != null ? er.total7 : null, "erreurs (7 j)", er && er.total7 ? "orange" : null, ligneTendance(t.erreurs, "7 j d'avant")),
      chiffre(act && act.taux != null ? act.taux + " %" : null, "nouveaux comptes activés", act && act.taux != null && act.taux < 50 ? "orange" : null,
        act ? { texte: act.activesMures + " sur " + act.mures + " compte(s) de " + act.jours + " à " + act.cohorteJours + " j" } : null),
    );
    // Depuis la dernière mise en ligne : ce que la version servie a changé.
    if (mel && mel.etat === "ok") {
      const pire = mel.apres > mel.avant;
      ch.append(chiffre(mel.apres, "erreurs depuis la mise en ligne", pire ? "orange" : null,
        { texte: "mise en ligne " + ilYA(mel.le) + " · " + mel.avant + " sur les " + duree(mel.dureeMs) + " d'avant", classe: pire ? "mauvais" : mel.apres < mel.avant ? "bon" : "" }));
    } else if (mel && mel.etat === "en_cours") ch.append(chiffre("…", "mise en ligne en cours"));
    else if (mel && mel.etat === "failure") ch.append(chiffre("Échec", "dernière mise en ligne", "rouge"));
    else ch.append(chiffre(null, "erreurs depuis la mise en ligne", null, { texte: "date de mise en ligne inconnue" }));
  }

  // Les comptes créés, par leur NOM (2026-10-23) : le nom choisi dans l'app,
  // jamais l'e-mail (_shared/pilotage.js, comptesRecents). Écrit par la
  // personne : rendu en TEXTE. Accueil : les 3 derniers, nom et date ; « Utilisateurs » : tous, avec le détail.
  const ACCUEIL_COMPTES = 3;
  function listeComptes(liste, compacte) {
    const c = el("article", "carte");
    const ul = el("ul", "liste-comptes");
    liste.forEach((x) => {
      const li = el("li", "compte");
      const tete = el("div", "compte-tete");
      tete.append(x.nom ? el("span", "compte-nom", x.nom) : el("span", "compte-nom sans-nom", x.nomLu === false ? "Nom non lu" : "Profil pas encore rempli"));
      tete.append(el("span", "compte-quand", ilYA(x.cree)));
      li.append(tete);
      if (!compacte) {
        const det = el("p", "compte-detail");
        const morceaux = [];
        if (x.voie) morceaux.push(el("span", null, x.voie === "e-mail" ? "par e-mail" : "par " + x.voie));
        if (!x.confirme) morceaux.push(el("span", "orange", "e-mail pas encore confirmé"));
        if (x.actif === true) morceaux.push(el("span", "vert", "a fait un geste"));
        else if (x.actif === false) morceaux.push(el("span", null, "aucun geste pour l'instant"));
        morceaux.forEach((m, i) => { if (i) det.append(document.createTextNode(" · ")); det.append(m); });
        if (morceaux.length) li.append(det);
      }
      ul.append(li);
    });
    c.append(ul);
    return c;
  }
  function boutonTousInscrits(c, total) {
    const b = el("button", "btn", typeof total === "number" ? "Voir les " + total + " utilisateurs" : "Voir tous les utilisateurs"); b.type = "button";
    b.addEventListener("click", ouvrirInscrits);
    actions(c).append(b);
    return b;
  }
  function rendreNouveauxComptes(d) {
    const acc = vider("nouveauxComptes"), tout = vider("comptesCrees");
    const act = d.activation;
    const total = act && act.inscrits && typeof act.inscrits.total === "number" ? act.inscrits.total : null;
    // Détails : un accès à la liste complète (elle se lit à la demande).
    const cd = carte("Tous les utilisateurs", total == null ? "" : String(total), "Par leur nom, les plus récents d'abord. Comptes de test et compte de l'éditeur exclus.", "");
    boutonTousInscrits(cd, total);
    tout.append(cd);
    if (!act) { nonLu("nouveauxComptes", "Derniers arrivés", "activation"); return; }
    if (!Array.isArray(act.nouveaux)) {
      acc.append(carte("Liste indisponible", "Non lu", "La fonction « pilotage » n'a pas rendu la liste des comptes : elle n'est sans doute pas encore à jour.", "gris"));
      return;
    }
    const l = act.nouveaux;
    if (!l.length) {
      const vide = carte("Aucun compte créé ces 30 derniers jours", "", "", "");
      if (total) boutonTousInscrits(vide, total);
      acc.append(vide);
      return;
    }
    const carteAccueil = listeComptes(l.slice(0, ACCUEIL_COMPTES), true);
    carteAccueil.prepend(el("p", "derniers-titre", "Derniers arrivés"));
    boutonTousInscrits(carteAccueil, total);
    acc.append(carteAccueil);
  }

  // ─── Tous les utilisateurs (2026-10-24) ───────────────────────────────────
  // Ouverts en touchant le nombre : une page de 100 à la fois, les plus récents
  // d'abord, lue À LA DEMANDE (action `inscrits`) — jamais à chaque relecture de
  // l'état. Même rendu que les derniers arrivés (le nom, jamais l'e-mail ; écrit
  // par la personne : rendu en TEXTE).
  let inscritsCharges = [], inscritsPage = 0, inscritsPages = 1, inscritsEnCours = false;
  function ouvrirInscrits() {
    inscritsCharges = []; inscritsPage = 0; inscritsPages = 1;
    aller("inscrits");
  }
  async function chargerInscrits() {
    if (inscritsEnCours) return;
    inscritsEnCours = true;
    const liste = $("inscritsListe"), suite = $("inscritsSuite");
    suite.disabled = true;
    if (!inscritsCharges.length) { vider("inscritsListe").append(carte("Chargement…", "", "", "")); $("inscritsResume").textContent = ""; }
    try {
      const r = await appeler({ action: "inscrits", page: inscritsPage + 1 });
      const lot = Array.isArray(r && r.comptes) ? r.comptes : [];
      inscritsCharges = inscritsCharges.concat(lot);
      inscritsPage = Number(r.page) || inscritsPage + 1;
      inscritsPages = Number(r.pages) || 1;
      vider("inscritsListe");
      if (!inscritsCharges.length) liste.append(carte("Aucun utilisateur pour l'instant", "", "", ""));
      else liste.append(listeComptes(inscritsCharges));
      const total = Number(r.total) || 0;
      $("inscritsResume").textContent = total + " utilisateur" + (total > 1 ? "s" : "") + (r.tronque ? " au moins" : "") + ", hors comptes de test et compte de l'éditeur"
        + (inscritsPages > 1 ? ". " + inscritsCharges.length + " affichés." : ".");
      suite.hidden = inscritsPage >= inscritsPages;
    } catch (e) {
      if (e.status === 401) { ecran("connexion"); return; }
      const c = carte("Liste impossible à lire", "Non lu", e.message, "gris");
      const b = el("button", "btn", "Réessayer"); b.type = "button";
      b.addEventListener("click", () => chargerInscrits());
      actions(c).append(b);
      if (!inscritsCharges.length) vider("inscritsListe");
      liste.append(c);
    } finally {
      inscritsEnCours = false; suite.disabled = false;
    }
  }
  $("inscritsSuite").addEventListener("click", () => chargerInscrits());

  function rendreSite(d) {
    const dispo = d.disponibilite;
    const si = vider("site");
    if (!dispo) { nonLu("site", "Disponibilité", "disponibilite"); return; }
    si.append(dispo.repond
      ? carte("Le site répond", "En ligne", dispo.depuis ? "sans interruption depuis " + ilYA(dispo.depuis).replace("il y a ", "") : "vérifié à l'instant", "vert")
      : carte("Le site ne répond pas", "Hors ligne", dispo.depuis ? "depuis " + ilYA(dispo.depuis).replace("il y a ", "") : "à l'instant", "rouge"));
  }

  function rendreErreurs(d) {
    const er = vider("erreurs");
    const e7 = d.erreurs;
    graphe("grapheErreurs", e7 && e7.serie);
    if (!e7) { nonLu("erreurs", "Erreurs"); return; }
    if (!e7.details || !e7.details.length) er.append(carte("Aucune erreur sur 7 jours", "OK", "", "vert"));
    (e7.details || []).forEach((x) => {
      const recent = x.dernier && Date.now() - Date.parse(x.dernier) < 864e5;
      const c = carte(x.message, x.n + " fois", x.comptes + " compte(s) · dernière " + ilYA(x.dernier), recent ? (x.n >= 10 ? "rouge" : "orange") : "gris");
      const det = el("details", "repli");
      det.append(el("summary", null, "Détails"));
      det.append(el("p", null, "Première fois : " + ilYA(x.premier)));
      if (x.plateformes && x.plateformes.length) det.append(el("p", null, "Appareils : " + x.plateformes.map((p) => p.nom + " (" + p.n + ")").join(", ")));
      if (x.pages && x.pages.length) det.append(el("p", null, "Pages : " + x.pages.map((p) => p.nom + " (" + p.n + ")").join(", ")));
      det.append(el("p", null, "Sur 7 jours :"));
      det.append(miniGraphe(x.serie));
      c.append(det);
      er.append(c);
    });
    if (e7.detailsPartiels) er.append(el("p", "discret", "Détails calculés sur les 1 000 erreurs les plus récentes ; les totaux, eux, sont comptés en base."));
  }

  function rendreUtilisateurs(d) {
    const u = d.utilisateurs;
    const m = vider("maintenant"), co = vider("comptes");
    if (!u) { nonLu("maintenant", "Utilisateurs", "utilisateurs"); graphe("grapheInscriptions", []); }
    else {
      // Chaque fenêtre est mesurée à part (2026-10-13) : une passe de 24 h qui
      // échoue à l'échelle est dite « non mesurée », sans emporter le reste.
      const m5 = u.maintenant || {}, j24 = u.aujourdhui || {};
      m.append(chiffre(u.maintenant ? m5.comptes : null, "comptes connectés"), chiffre(u.maintenant ? m5.appareils : null, "appareils"),
        chiffre(u.aujourdhui ? j24.comptes : null, "comptes actifs 24 h"), chiffre(u.aujourdhui ? j24.appareils : null, "appareils 24 h"));
      // Public seulement depuis le 2026-10-05 : les écartés sont dits, pas tus.
      if (typeof j24.horsPublic === "number") m.append(chiffre(j24.horsPublic, "robots / équipe 24 h (non comptés)"));
      const ins = d.activation && d.activation.inscrits && typeof d.activation.inscrits.total === "number" ? d.activation.inscrits : null;
      co.append(chiffre(u.inscritsJour, "aujourd'hui"), chiffre(u.inscritsSemaine, "7 jours"), chiffre(ins ? ins.total + (ins.tronque ? "+" : "") : null, "inscrits au total"));
      graphe("grapheInscriptions", u.serieInscriptions);
    }
    // Activation (2026-10-06) : le taux ne compte que les comptes qui ont eu
    // leurs 7 jours entiers ; les plus jeunes sont « en cours », pas des échecs.
    const ac = vider("activation"), ap = $("activationPremiers"), act = d.activation, en = vider("entonnoir");
    ap.hidden = true;
    if (!act) { nonLu("activation", "Activation"); return; }
    ac.append(chiffre(act.taux == null ? null : act.taux + " %", "activés en " + act.jours + " j", act.taux != null && act.taux < 50 ? "orange" : ""),
      chiffre(act.activesMures + " / " + act.mures, "comptes de " + act.jours + " à " + act.cohorteJours + " j"),
      chiffre(act.enCours, "de moins de " + act.jours + " j" + (act.enCoursActives ? " (dont " + act.enCoursActives + " déjà actif" + (act.enCoursActives > 1 ? "s" : "") + ")" : "")));
    const premiers = Object.entries(act.premiers || {}).sort((x, y) => y[1] - x[1]).map(([g, n]) => g + " " + n).join(" · ");
    if (premiers) { ap.textContent = "Premier geste des comptes activés : " + premiers; ap.hidden = false; }
    // L'entonnoir (2026-10-23) : créés → e-mail confirmé → actifs. Sur un
    // échantillon (au-delà de 1 500 comptes), les étages ne se comparent plus.
    if (typeof act.crees === "number" && !act.echantillon) {
      const actifs = (Number(act.activesMures) || 0) + (Number(act.enCoursActives) || 0);
      const c = carte("Entonnoir des " + act.cohorteJours + " derniers jours", "", "", "");
      const l = el("div", "chiffres chiffres-petits");
      l.append(chiffre(act.crees, "comptes créés"), chiffre(act.cohorte, "e-mail confirmé"), chiffre(actifs, "ont fait un geste"));
      c.append(l);
      if (act.crees > act.cohorte) c.append(el("p", null, (act.crees - act.cohorte) + " compte(s) n'ont jamais confirmé leur e-mail."));
      en.append(c);
    }
  }

  function rendreMachines(d) {
    const gh = d.github;
    const pa = vider("pause"), ru = vider("runs");
    if (!gh) { nonLu("runs", "GitHub (Sentinelle, veille, mises en ligne)", "github"); }
    else {
      const c = gh.pause ? carte("Sentinelle en pause", "Pause", "Elle n'ouvre plus d'enquête.", "orange") : carte("Sentinelle active", "OK", "Elle surveille les erreurs et répare.", "vert");
      if (gestesGithub) bouton(c, gh.pause ? "Reprendre" : "Mettre en pause", { action: gh.pause ? "reprendre" : "pause" });
      pa.append(c);
      const NOMS = { sentinelle: "Sentinelle", veille: "Veille de production", deploy: "Mise en ligne (déploiement)" };
      Object.keys(NOMS).forEach((k) => {
        const r = gh.runs && gh.runs[k];
        if (!r) { ru.append(carte(NOMS[k], "Inconnu", "", "gris")); return; }
        const [mot, coul] = r.etat !== "completed" ? ["En cours", "orange"] : r.conclusion === "success" ? ["OK", "vert"] : r.conclusion === "failure" ? ["Échec", "rouge"] : [r.conclusion || "?", "gris"];
        const c2 = carte(NOMS[k], mot, "dernière exécution " + ilYA(r.le), coul); lien(c2, r.url, "Voir l'exécution"); ru.append(c2);
      });
      if (gh.luLe) ru.append(el("p", "discret", "GitHub lu " + ilYA(gh.luLe) + "."));
    }
    const rl = vider("relances");
    if (!d.relancesPossibles || !d.relancesPossibles.length) rl.append(carte("Gestes indisponibles", "", "Pour agir depuis le téléphone (relancer, fusionner, fermer, pause), pose le secret PILOTAGE_GITHUB_TOKEN sur la fonction « pilotage ». La Sentinelle tourne quand même toute seule.", "gris"));
    (d.relancesPossibles || []).forEach((x) => { const c = carte(x.libelle, "", ""); bouton(c, "Lancer maintenant", { action: "relancer", cible: x.cle }); rl.append(c); });
  }

  function rendreCapacite(d) {
    const ja = vider("jauges");
    if (!d.capacite) { nonLu("jauges", "Capacité", "capacite"); return; }
    (d.capacite.jauges || []).forEach((j) => {
      const val = j.unite === "octets" ? taille(j.valeur) + " sur " + taille(j.plafond) : (j.valeur == null ? "—" : j.valeur) + " sur " + j.plafond;
      const c = carte(j.libelle, j.pct == null ? "Non mesuré" : String(j.pct).replace(".", ",") + " %", val + (j.estimation ? " (estimation)" : ""), j.couleur);
      const bar = el("div", "jauge " + j.couleur); const f = el("span"); f.style.width = Math.min(100, j.pct || 0) + "%"; bar.append(f); c.append(bar);
      // Le geste à faire et son prix (2026-11-01), dit dès l'orange.
      if (j.geste && (j.couleur === "orange" || j.couleur === "rouge")) c.append(el("p", "geste", "À faire : " + j.geste + (j.prix ? " (~" + j.prix + " €/mois)" : "")));
      ja.append(c);
    });
    const co = vider("cout"), cout = d.capacite.cout;
    if (cout && Array.isArray(cout.lignes)) {
      const c = carte("Par mois aujourd'hui", "~" + cout.actuel + " €", cout.aPrevoir ? "À prévoir si tu fais les gestes des jauges orange : ~" + cout.aPrevoir + " € de plus par mois." : "Aucune jauge à l'orange : rien à prévoir.", cout.aPrevoir ? "orange" : "vert");
      const ul = el("ul", "liste-cout");
      cout.lignes.forEach((l) => ul.append(el("li", l.aPrevoir ? "a-prevoir" : null, l.libelle + " : " + (l.prix ? "~" + l.prix + " €" : "gratuit") + (l.aPrevoir ? " (à prévoir)" : ""))));
      c.append(ul, el("p", "discret", "Estimation : relis les tarifs sur la page Pricing de chaque service le jour du geste."));
      co.append(c);
    } else co.append(carte("Coût", "Non lu", "La fonction « pilotage » n'a pas rendu la facture : elle n'est sans doute pas encore à jour.", "gris"));
    if (!d.capacite.mesuresServeur) ja.append(el("p", "discret", "Base et stockage : la migration « pilotage_veille » n'est pas encore appliquée."));
    if (d.capacite.connexionsTronquees) ja.append(el("p", "discret", "Connexions : borne basse (lecture tronquée à 1 000 lignes) tant que la fonction « pilotage_audience » n'est pas en base."));
    ja.append(el("p", "discret", "La bande passante (egress) ne se lit que sur la page Usage de Supabase."));
  }

  // ─── Croissance (2026-11-01) ──────────────────────────────────────────────
  // Rendu de `_shared/croissance.js` (croissance()) : sources, liens partagés,
  // actifs par jour, rétention par cohorte. Des chiffres agrégés en base, aucun
  // nom ; les valeurs des sources sont réduites à [a-z0-9_.-] côté serveur.
  const pctTexte = (v) => (v == null ? "…" : v + " %");
  // Mois par mois : la même courbe que la marche de l'accueil, en tableau.
  function rendreMois() {
    const zone = vider("croissanceMois");
    if (!marche.length) { zone.append(carte("Pas encore de courbe", "", "Elle apparaît dès que la fonction « pilotage » est à jour.", "")); return; }
    const mois = new Map();
    marche.forEach((p) => { const k = p.jour.slice(0, 7); const m = mois.get(k) || { n: 0, total: 0 }; m.n += p.n; m.total = p.total; mois.set(k, m); });
    const c = el("article", "carte");
    const t = el("table", "tableau-retention");
    const tete = el("tr");
    ["Mois", "Nouveaux", "Total"].forEach((x) => tete.append(el("th", null, x)));
    t.append(tete);
    [...mois.entries()].reverse().slice(0, 24).forEach(([k, m]) => {
      const r = el("tr");
      r.append(el("td", null, new Date(k + "-15T00:00:00Z").toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })), el("td", null, "+" + m.n), el("td", null, m.total));
      t.append(r);
    });
    c.append(t);
    zone.append(c);
  }
  function rendreCroissance(d) {
    rendreMois();
    const cr = d.croissance;
    const etat = $("croissanceEtat"), ch = vider("croissanceChiffres"), so = vider("croissanceSources"), li = vider("croissanceLiens"), re = vider("croissanceRetention");
    if (cr === undefined) { etat.textContent = "La fonction « pilotage » n'est pas encore à jour."; graphe("grapheActifs", []); return; }
    if (!cr) { nonLu("croissanceSources", "Croissance", "croissance"); etat.textContent = ""; graphe("grapheActifs", []); return; }
    if (cr.absente) {
      etat.textContent = "";
      so.append(carte("Pas encore allumée", "Migration", "Appliquer " + (cr.migration || "la migration de croissance") + " (npm run migration:appliquer) : la base agrégera alors les sources et les retours chaque heure.", "gris"));
      graphe("grapheActifs", []);
      return;
    }
    etat.textContent = "30 derniers jours" + (cr.agregeLe ? " · agrégé jusqu'au " + String(cr.agregeLe).slice(8, 10) + "/" + String(cr.agregeLe).slice(5, 7) : "") + " · public seulement (ni robots, ni équipe, ni tests).";
    ch.append(
      chiffre(cr.inscriptions, "inscriptions (30 j)", null, cr.conversion != null ? { texte: cr.conversion + " % des appareils venus" } : null),
      chiffre(cr.actifsHier, "comptes actifs hier", null, cr.moyenne7 != null ? { texte: "moyenne 7 j : " + cr.moyenne7 } : null),
      chiffre(cr.visites, "appareils venus (30 j)"),
      chiffre(pctTexte(cr.viralite), "inscriptions par bouche-à-oreille", null, { texte: "via un lien partagé par un membre" }),
    );
    if (!cr.sources || !cr.sources.length) so.append(carte("Aucune visite agrégée pour l'instant", "", "Les sources apparaissent à la première heure pleine après la migration.", ""));
    else {
      const c = el("article", "carte");
      const ul = el("ul", "liste-sources");
      cr.sources.slice(0, 12).forEach((s) => {
        const l = el("li", "source");
        l.append(el("span", "source-nom", s.libelle), el("span", "source-chiffres", s.visites + " venus · " + s.inscriptions + " inscrits" + (s.conversion != null ? " · " + s.conversion + " %" : "")));
        ul.append(l);
      });
      c.append(ul);
      so.append(c);
    }
    if (cr.campagnes && cr.campagnes.length) so.append(carte("Campagnes (utm_campaign)", String(cr.campagnes.length), cr.campagnes.slice(0, 8).map((x) => x.valeur + " : " + x.n + " inscrit" + (x.n > 1 ? "s" : "")).join(" · "), ""));
    const lk = cr.liens || {};
    const cl = el("article", "carte");
    const cg = el("div", "chiffres chiffres-petits");
    cg.append(chiffre(lk.crees, "liens créés"), chiffre(lk.partages, "envoyés"), chiffre(lk.ouverts, "ouverts"), chiffre(lk.inscriptions, "comptes créés"));
    cl.append(cg);
    if (lk.canaux && lk.canaux.length) cl.append(el("p", "discret", "Envoyés par : " + lk.canaux.slice(0, 6).map((x) => x.valeur + " " + x.n).join(" · ")));
    li.append(cl);
    graphe("grapheActifs", cr.actifs || []);
    if (!cr.cohortes || !cr.cohortes.length) re.append(carte("Pas encore de cohorte", "", "Aucun compte confirmé ces 10 dernières semaines.", ""));
    else {
      const c = el("article", "carte");
      const t = el("table", "tableau-retention");
      const tete = el("tr");
      ["Semaine", "Comptes", "J1", "J7", "J30"].forEach((x) => tete.append(el("th", null, x)));
      t.append(tete);
      cr.cohortes.slice(0, 10).forEach((k) => {
        const r = el("tr");
        r.append(el("td", null, "du " + String(k.semaine).slice(8, 10) + "/" + String(k.semaine).slice(5, 7)), el("td", null, k.taille), el("td", null, pctTexte(k.j1)), el("td", null, pctTexte(k.j7)), el("td", null, pctTexte(k.j30)));
        t.append(r);
      });
      c.append(t);
      re.append(c);
    }
  }

  // Ce qui s'est passé : les changements du voyant notés par la veille (7 j).
  const NOMS_COULEUR = { vert: "Tout va bien", orange: "À surveiller", rouge: "Problème", gris: "Pas de nouvelles" };
  function rendreHistorique(d) {
    const h = vider("historique");
    if (!Array.isArray(d.historique)) { nonLu("historique", "Historique"); return; }
    if (!d.historique.length) { h.append(carte("Rien de noté cette semaine", "", "Le voyant n'a pas changé depuis 7 jours.", "")); return; }
    d.historique.forEach((x) => {
      const coul = Object.hasOwn(NOMS_COULEUR, x.couleur) ? x.couleur : "gris";
      const c = carte(NOMS_COULEUR[coul], x.dispo ? "" : "Site injoignable", (x.raisons || []).join(" · "), coul === "gris" ? "" : coul);
      c.append(el("p", "quand", ilYA(x.le) + " · " + dateCourte(x.le)));
      h.append(c);
    });
  }

  function rendreReglages(d) {
    // Protection automatique (2026-10-11) : les réglages distants.
    const prot = vider("protection");
    if (!d.reglages) nonLu("protection", "Protection", "reglages");
    else if (d.reglages.absente) prot.append(carte("Pas encore allumée", "Migration", "Appliquer " + (d.reglages.migration || "la migration des réglages distants") + " (npm run migration:appliquer) : la veille pourra alors ralentir l'app d'elle-même.", "gris"));
    else rendreProtection(prot, d.reglages);
    // Ce qui agit seul (2026-10-12) : réveil de la Sentinelle ; le retour arrière,
    // lui, n'est JAMAIS automatique — la veille le propose (sur l'accueil), le
    // pilote le fait.
    const au = d.autonomie;
    if (au) {
      prot.append(au.reveilSentinelle
        ? carte("Réveil de la Sentinelle", "Actif", "Dès que 2 comptes de plus de 24 h ont un échec en 30 min (erreur ou appel refusé) et qu'aucune enquête n'est en cours, la veille lance la Sentinelle sans attendre son horaire (2 fois par heure et 12 fois par jour au plus).", "vert")
        : carte("Réveil de la Sentinelle", "Inactif", "Il faut le secret PILOTAGE_GITHUB_TOKEN sur la fonction « pilotage ». La Sentinelle tourne quand même à son horaire.", "gris"));
      const ra = au.retour || {};
      const cr = ra.mode === "proposer"
        ? carte("Retour arrière", "Proposé", "Si une mise en ligne provoque un échec nouveau chez 5 comptes de plus de 7 jours, tu es prévenu sur l'accueil et sur le téléphone. Un toucher sur « Régler », et la version d'avant revient. Jamais seul : un retrait automatique pourrait annuler un correctif de sécurité.", "vert")
        : carte("Retour arrière", "Éteint", "Pour l'activer, poser le secret PILOTAGE_NETLIFY_TOKEN (jeton Netlify) sur la fonction « pilotage » — Supabase › Edge Functions › pilotage › Secrets. En attendant, le retour arrière reste le geste `npm run rollback:netlify` sur le PC.", "gris");
      if (ra.jeton) boutonRetour(cr);
      prot.append(cr);
    }
    // Alertes
    const al = vider("alertes");
    const a = d.alertes;
    if (!a) nonLu("alertes", "Alertes");
    else {
      al.append(a.appareils
        ? carte(a.appareils + " appareil(s) recevront les alertes", "Actif", "Tu es prévenu quand le voyant passe au rouge, quand le site ne répond plus, et quand c'est réglé.", "vert")
        : carte("Aucun appareil ne reçoit les alertes", "Inactif", "Ouvre PASSIO avec le compte éditeur et active les notifications quand elles sont proposées.", "orange"));
      const dispo = d.disponibilite;
      al.append(carte("Veille automatique", dispo && dispo.veilleLe ? "Active" : "Pas encore",
        dispo && dispo.veilleLe ? "dernier changement noté " + ilYA(dispo.veilleLe) + " · vérifie toutes les 5 min" : "Elle démarre quand la migration « pilotage_veille » est appliquée.",
        dispo && dispo.veilleLe ? "vert" : "gris"));
    }
  }

  // ─── Protection automatique ────────────────────────────────────────────────
  const NIVEAUX = ["Normal", "Économie (×2)", "Survie (×4)"];
  const EFFETS = ["", "rafraîchissements deux fois moins fréquents, temps réel endormi plus tôt",
    "rafraîchissements quatre fois moins fréquents, temps réel réservé à ce qu'on regarde"];
  const LIBELLES_COUPURES = {
    passio_invitations_v1: "Invitations", passio_invite_apres_creation_v1: "Inviter après avoir organisé",
    passio_liens_courts_v1: "Liens de partage courts", passio_irl_proposal_v1: "Proposer une activité",
    passio_rappels_push_v1: "Rappels d'activité (push)", passio_recap_semaine: "Récap de la semaine",
    passio_feed_rank: "Classement du fil", passio_feed_irl_bridge_v1: "Activités dans le fil",
    passio_feed_intents_v1: "Intentions du fil", passio_feed_window_v1: "Fenêtre du fil",
    passio_first_run_experience_v1: "Première visite guidée", flat_passions_v1: "Référentiel des passions plat",
  };
  const libelleCoupure = (k) => LIBELLES_COUPURES[k] ? LIBELLES_COUPURES[k] + " (" + k + ")" : k;
  function champ(tag, attrs) { const n = document.createElement(tag); n.className = "champ"; Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v)); return n; }
  function rendreProtection(zone, rg) {
    const dl = rg.delestage || { niveau: 0 };
    const n = [0, 1, 2].includes(dl.niveau) ? dl.niveau : 0;
    const qui = dl.pose_par === "pilote" ? "posé à la main" : dl.pose_par === "veille" ? "posé par la veille" : "réglage automatique";
    const cd = carte("Délestage : " + NIVEAUX[n], dl.pose_par === "pilote" ? "Manuel" : "Auto",
      [EFFETS[n], dl.motif, qui + (dl.maj ? " " + ilYA(dl.maj) : "")].filter(Boolean).join(" · "), n === 2 ? "rouge" : n === 1 ? "orange" : "vert");
    [0, 1, 2].forEach((k) => {
      if (k === n && dl.pose_par === "pilote") return;
      bouton(cd, NIVEAUX[k], { action: "reglages", cle: "delestage", valeur: { niveau: k } });
    });
    if (dl.pose_par === "pilote") bouton(cd, "Rendre à l'automatique", { action: "reglages", cle: "delestage", valeur: null });
    zone.append(cd);

    const coupees = (rg.coupures && rg.coupures.cles) || [];
    const cc = carte("Fonctionnalités coupées", coupees.length ? String(coupees.length) : "Aucune",
      coupees.length ? "Éteintes chez tout le monde : " + coupees.map(libelleCoupure).join(", ") : "Rien n'est coupé à distance.", coupees.length ? "orange" : "vert");
    coupees.forEach((k) => bouton(cc, "Rallumer : " + (LIBELLES_COUPURES[k] || k), { action: "reglages", cle: "coupures", valeur: { cles: coupees.filter((x) => x !== k) } }));
    const possibles = (rg.coupuresPossibles || []).filter((k) => !coupees.includes(k));
    if (possibles.length) {
      const sel = champ("select", { "aria-label": "Fonctionnalité à couper", id: "coupureChoix" });
      possibles.forEach((k) => { const o = document.createElement("option"); o.value = k; o.textContent = libelleCoupure(k); sel.append(o); });
      actions(cc).append(sel);
      bouton(cc, "Couper chez tout le monde", () => ({ action: "reglages", cle: "coupures", valeur: { cles: coupees.concat([sel.value]) } }));
    }
    zone.append(cc);

    const b = rg.bandeau;
    const cb = carte("Message à tous", b ? (b.niveau === "alerte" ? "Alerte" : "Info") : "Aucun", b ? "« " + b.texte + " »" : "Aucun message affiché.", b ? (b.niveau === "alerte" ? "rouge" : "orange") : "vert");
    if (b) bouton(cb, "Retirer le message", { action: "reglages", cle: "bandeau", valeur: null });
    const txt = champ("input", { type: "text", maxlength: "200", placeholder: "Ex. : inscriptions par e-mail saturées, passe par Google", "aria-label": "Texte du message", id: "bandeauTexte" });
    const niv = champ("select", { "aria-label": "Niveau du message", id: "bandeauNiveau" });
    [["info", "Info"], ["alerte", "Alerte"]].forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; niv.append(o); });
    actions(cb).append(txt, niv);
    bouton(cb, "Afficher à tous", () => { const t = txt.value.trim(); if (!t) { erreur("Écris d'abord le message."); return null; } return { action: "reglages", cle: "bandeau", valeur: { texte: t, niveau: niv.value } }; });
    zone.append(cb);
  }

  // Un geste qui tombe PENDANT une lecture ne doit pas laisser l'écran sur
  // l'état d'avant : la lecture en cours finit, puis une seconde part. Et une
  // relecture ne repeint jamais sous un geste armé : son bouton « Annuler »
  // disparaîtrait ; elle attend qu'il soit parti ou annulé.
  let aRelire = false, derniereLecture = null;
  function relireSiAttendu() { if (aRelire && !armes.size && !enCours) { aRelire = false; actualiser(); } }
  async function actualiser() {
    if (enCours || armes.size) { aRelire = true; return; }
    enCours = true; $("actualiser").classList.add("tourne");
    try {
      const d = await appeler({ action: "etat" });
      derniere = Date.now(); derniereLecture = d;
      if (armes.size) aRelire = true;
      else rendre(d);
      erreur("");
    } catch (e) {
      if (e.status === 401) { ecran("connexion"); return; }
      if (e.status === 403) { ecran("refus"); $("refusTexte").textContent = "Le compte " + (compte || "") + " n'a pas accès au pilotage. Connecte-toi avec le compte de l'éditeur."; return; }
      erreur(e.status === 404 ? "La fonction « pilotage » n'est pas encore déployée." : "Lecture impossible : " + e.message + ". Dernières données conservées.");
    } finally {
      enCours = false; $("actualiser").classList.remove("tourne"); majEtat();
      relireSiAttendu();
    }
  }
  $("actualiser").addEventListener("click", actualiser);
  // Quitter la page fait partir ce qui était armé (voir `armer`).
  function partirTout() { pageQuittee = true; [...armes].forEach((a) => a.partir()); }
  window.addEventListener("pagehide", partirTout);

  // ─── Connexion ────────────────────────────────────────────────────────────
  $("cxGoogle").addEventListener("click", async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + "/pilotage/" } });
    if (error) { $("cxErreur").hidden = false; $("cxErreur").textContent = "Connexion Google impossible : " + error.message; }
  });
  async function deconnecter() {
    try { await sb.auth.signOut(); } catch (_e) { /* on quitte quand même */ }
    ecran("connexion");
  }
  // Déconnecte aussi de PASSIO sur ce téléphone : retoucher pendant 5 s l'annule, comme tout geste.
  toucher($("deconnexion"), null, deconnecter);
  $("refusDeco").addEventListener("click", deconnecter);

  // ─── Installation ─────────────────────────────────────────────────────────
  let invitation = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); invitation = e; majInstall(); });
  function majInstall() {
    const installe = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    $("installer").hidden = !invitation || installe;
    $("installTexte").textContent = installe ? "C'est fait : le pilotage est installé sur ce téléphone."
      : /iphone|ipad|ipod/i.test(navigator.userAgent) ? "Sur iPhone : dans Safari, touche Partager (carré avec une flèche), puis « Sur l'écran d'accueil »."
      : invitation ? "Touche le bouton ci-dessous pour l'ajouter à ton écran d'accueil."
      : "Sur Android : menu ⋮ de Chrome, puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».";
  }
  $("installer").addEventListener("click", async () => { if (!invitation) return; invitation.prompt(); try { await invitation.userChoice; } catch (_e) { /* refus */ } invitation = null; majInstall(); });

  // ─── Démarrage ────────────────────────────────────────────────────────────
  let demarre = false;
  async function demarrer() {
    if (!sb) { ecran("connexion"); $("cxErreur").hidden = false; $("cxErreur").textContent = "Bibliothèque Supabase introuvable."; return; }
    const { data } = await sb.auth.getSession();
    const session = data && data.session;
    if (!session) { ecran("connexion"); return; }
    compte = session.user && session.user.email;
    ecran("app");
    vider("compte").append(carte(compte || "Compte", "Connecté", "Session partagée avec PASSIO sur ce téléphone."));
    majInstall();
    // Une seule fois : Supabase redit « SIGNED_IN » au retour sur l'onglet, sans que la page ait à bouger.
    if (!demarre) { demarre = true; const vue = vueDuLien(); if (vue !== "accueil") afficher(vue); }
    await actualiser();
  }
  sb && sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN") setTimeout(demarrer, 0); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { partirTout(); return; }
    pageQuittee = false;
    if (!$("app").hidden && Date.now() - derniere > 20000) actualiser();
  });
  window.addEventListener("online", () => { majEtat(); if (!$("app").hidden) actualiser(); });
  window.addEventListener("offline", majEtat);
  setInterval(() => { majEtat(); if (!$("app").hidden && document.visibilityState === "visible" && Date.now() - derniere >= 60000) actualiser(); }, 5000);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/pilotage/sw.js", { scope: "/pilotage/" }).catch(() => {});
  demarrer();
})();
