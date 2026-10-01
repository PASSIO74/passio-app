// PASSIO Pilotage — la version NUAGE, sans PC (2026-09-28).
// Données et gestes : Edge Function `pilotage` (Supabase), réservée au compte
// éditeur. Session : celle de PASSIO sur ce téléphone (même origine).
// Règles : nœuds + textContent uniquement, jamais innerHTML ; les seuls liens
// vers l'extérieur vont à github.com ; chaque geste demande une confirmation et
// n'est qu'une DEMANDE — la fonction décide (liste blanche, jeton, plafond).
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const cfg = window.PILOTAGE_SUPABASE || {};
  const sb = window.supabase && window.supabase.createClient(cfg.url, cfg.anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const FONCTION = cfg.url + "/functions/v1/pilotage";
  let derniere = 0, enCours = false, compte = null, gestesGithub = false;

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
  function bouton(c, texte, corps, confirmation) {
    const b = el("button", "btn", texte); b.type = "button";
    b.addEventListener("click", () => geste(b, corps, confirmation));
    actions(c).append(b); return b;
  }
  // « Réparer » : une seule fabrique pour les trois surfaces (bloc À réparer,
  // carte d'enquête, carte d'exécution) — deux copies divergeraient.
  function clefReparation(x) { return x.cible === "issue" ? "issue:" + x.numero : "run:" + x.cle; }
  function boutonReparer(c, x) {
    if (!gestesGithub || !x) return;
    if (x.enCours) { c.append(el("p", "discret", "Réparation en cours : #" + x.enCours + " — le correctif arrivera dans « Correctifs en attente ».")); return; }
    const corps = x.cible === "issue" ? { action: "reparer", cible: "issue", numero: x.numero } : { action: "reparer", cible: "run", cle: x.cle };
    const b = bouton(c, "Réparer", corps, "Confier la réparation de « " + x.libelle + " » à Claude ? Il ouvrira un correctif (PR) que tu fusionneras ici.");
    b.classList.add("btn-reparer");
  }
  function chiffre(v, libelle, couleur) { const c = el("div", "chiffre" + (couleur ? " " + couleur : "")); c.append(el("b", null, v == null ? "—" : v), el("span", null, libelle)); return c; }
  function ilYA(v) {
    const t = typeof v === "number" ? v : Date.parse(String(v));
    if (!Number.isFinite(t)) return "date inconnue";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "à l'instant";
    if (s < 3600) return "il y a " + Math.round(s / 60) + " min";
    if (s < 172800) return "il y a " + Math.round(s / 3600) + " h";
    return "il y a " + Math.round(s / 86400) + " j";
  }
  function taille(o) {
    if (o == null) return "—";
    const u = ["o", "Ko", "Mo", "Go", "To"]; let i = 0, v = Number(o);
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return (v >= 10 || i === 0 ? Math.round(v) : Number(v.toFixed(1))).toString().replace(".", ",") + " " + u[i];
  }
  const nonLu = (id, titre) => vider(id).append(carte(titre, "Non lu", "Cette partie n'a pas pu être lue.", "gris"));
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
  }
  function erreur(t) { const b = $("bandeauErreur"); b.hidden = !t; b.textContent = t || ""; }
  let minuteurOk = null;
  function succes(t) { const b = $("bandeauOk"); b.hidden = !t; b.textContent = t || ""; clearTimeout(minuteurOk); minuteurOk = setTimeout(() => { b.hidden = true; }, 6000); }
  function majEtat() {
    const e = $("etatMaj");
    if (!navigator.onLine) { e.textContent = "Hors ligne"; e.className = "etat-maj hors-ligne"; return; }
    e.className = "etat-maj"; e.textContent = derniere ? "Mis à jour " + ilYA(derniere) : "Chargement…";
  }
  function onglet(id) {
    document.querySelectorAll(".barre button").forEach((b) => b.classList.toggle("actif", b.dataset.tab === id));
    document.querySelectorAll(".onglet").forEach((o) => o.classList.toggle("actif", o.id === id));
    $("titreOnglet").textContent = ($(id) && $(id).dataset.titre) || "Pilotage";
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".barre button").forEach((b) => b.addEventListener("click", () => onglet(b.dataset.tab)));

  // ─── Appels ───────────────────────────────────────────────────────────────
  async function appeler(corps) {
    const { data } = await sb.auth.getSession();
    const jeton = data && data.session && data.session.access_token;
    if (!jeton) { const e = new Error("non connecté"); e.status = 401; throw e; }
    const r = await fetch(FONCTION, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + jeton, apikey: cfg.anon },
      body: JSON.stringify(corps || { action: "etat" }),
      cache: "no-store",
    });
    let j = null; try { j = await r.json(); } catch (_e) { /* corps illisible */ }
    if (!r.ok) { const e = new Error((j && j.error) || ("HTTP " + r.status)); e.status = r.status; throw e; }
    return j;
  }
  async function geste(b, corps, confirmation) {
    if (confirmation && !confirm(confirmation)) return;
    b.disabled = true;
    try {
      const r = await appeler(corps);
      succes((r && r.message) || "Fait.");
      derniere = 0; await actualiser();
    } catch (e) { erreur("Refusé : " + e.message); b.disabled = false; }
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────
  function rendre(d) {
    gestesGithub = !!d.gestesGithub;
    const v = d.verdict || { couleur: "gris", titre: "Pas de nouvelles", raisons: [] };
    $("verdict").className = "verdict " + v.couleur;
    $("verdictTitre").textContent = v.titre;
    $("verdictDetail").textContent = (v.raisons || []).slice(0, 3).join(" · ");

    const dispo = d.disponibilite;
    const si = vider("site");
    if (dispo) {
      si.append(dispo.repond
        ? carte("Le site répond", "En ligne", dispo.depuis ? "sans interruption depuis " + ilYA(dispo.depuis).replace("il y a ", "") : "vérifié à l'instant", "vert")
        : carte("Le site ne répond pas", "Hors ligne", dispo.depuis ? "depuis " + ilYA(dispo.depuis).replace("il y a ", "") : "à l'instant", "rouge"));
    }

    const s = d.sante, u = d.utilisateurs, gh = d.github;
    const reparables = (gh && Array.isArray(gh.aReparer)) ? gh.aReparer : [];
    const parCle = new Map(reparables.map((x) => [clefReparation(x), x]));
    const rp = vider("reparer");
    $("blocReparer").hidden = !(gestesGithub && reparables.length);
    reparables.forEach((x) => {
      const c = carte(x.libelle, x.enCours ? "En cours" : "À réparer", "", x.enCours ? "orange" : "rouge");
      boutonReparer(c, x);
      lien(c, x.url, x.cible === "run" ? "Voir l'exécution" : "Ouvrir sur GitHub");
      rp.append(c);
    });
    const ch = vider("chiffres");
    ch.append(
      chiffre(u ? u.maintenant.appareils : null, "appareils en ligne"),
      chiffre(u ? u.aujourdhui.comptes : null, "comptes actifs (24 h)"),
      chiffre(s ? s.erreursJs15 : null, "erreurs (15 min)", s && s.erreursJs15 >= 10 ? "rouge" : s && s.erreursJs15 ? "orange" : null),
      chiffre(d.signalements ? d.signalements.ouverts : null, "signalements", d.signalements && d.signalements.ouverts ? "orange" : null),
    );

    // Ce qui t'attend
    const at = vider("attente");
    let aFaire = 0;
    if (!gh) nonLu("attente", "Enquêtes GitHub");
    else {
      const issues = (gh.issues || []).filter((i) => !i.pr && !i.pause);
      if (!issues.length) at.append(carte("Rien ne t'attend", "OK", "Aucune enquête ni alerte ouverte.", "vert"));
      issues.forEach((i) => {
        const humain = i.labels.includes("humain");
        if (humain) aFaire++;
        const [mot, coul] = humain ? ["À toi", "rouge"] : i.labels.includes("sentinelle") ? ["Sentinelle", "orange"] : i.labels.includes("veille") ? ["Veille", "orange"] : ["Info", "gris"];
        const c = carte("#" + i.numero + " · " + i.titre, mot, "ouverte " + ilYA(i.depuis), coul);
        boutonReparer(c, parCle.get("issue:" + i.numero));
        lien(c, i.url);
        if (gestesGithub) bouton(c, "Fermer", { action: "fermer", numero: i.numero }, "Fermer #" + i.numero + " ? (à faire si c'est réglé ou sans objet)");
        at.append(c);
      });
    }
    const badge = $("badgeAccueil"); badge.hidden = !aFaire; badge.textContent = String(aFaire);

    // Erreurs détaillées
    const er = vider("erreurs");
    const e7 = d.erreurs;
    if (!e7) nonLu("erreurs", "Erreurs");
    else {
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
        if (gestesGithub && recent) bouton(c, "Confier à la Sentinelle", { action: "relancer", cible: "sentinelle" }, "Lancer la Sentinelle maintenant ? Elle analysera les erreurs récentes et ouvrira une enquête si besoin.");
        er.append(c);
      });
    }

    // Machines
    const pa = vider("pause");
    if (gh) {
      const c = gh.pause ? carte("En pause", "Pause", "La Sentinelle n'ouvre plus d'enquête.", "orange") : carte("Active", "OK", "Elle surveille les erreurs et répare.", "vert");
      if (gestesGithub) bouton(c, gh.pause ? "Reprendre" : "Mettre en pause", { action: gh.pause ? "reprendre" : "pause" }, gh.pause ? "Relancer la Sentinelle ?" : "Mettre la Sentinelle en pause ? Plus aucune enquête ne sera ouverte jusqu'à la reprise.");
      pa.append(c);
    }
    const ru = vider("runs");
    if (!gh) nonLu("runs", "Exécutions");
    else {
      const NOMS = { sentinelle: "Sentinelle", veille: "Veille de production", deploy: "Déploiement" };
      Object.keys(NOMS).forEach((k) => {
        const r = gh.runs && gh.runs[k];
        if (!r) { ru.append(carte(NOMS[k], "Inconnu", "", "gris")); return; }
        const [mot, coul] = r.etat !== "completed" ? ["En cours", "orange"] : r.conclusion === "success" ? ["OK", "vert"] : r.conclusion === "failure" ? ["Échec", "rouge"] : [r.conclusion || "?", "gris"];
        const c = carte(NOMS[k], mot, ilYA(r.le), coul); boutonReparer(c, parCle.get("run:" + k)); lien(c, r.url, "Voir l'exécution"); ru.append(c);
      });
    }
    const pr = vider("prs");
    let nPr = 0;
    if (gh) {
      const prs = (gh.issues || []).filter((i) => i.pr);
      nPr = prs.length;
      if (!prs.length) pr.append(carte("Aucun correctif en attente", "", "", "gris"));
      prs.slice(0, 15).forEach((i) => {
        const c = carte("#" + i.numero + " · " + i.titre, "PR", "ouverte " + ilYA(i.depuis));
        lien(c, i.url, "Voir le détail");
        if (gestesGithub) {
          bouton(c, "Fusionner", { action: "fusionner", numero: i.numero }, "Fusionner #" + i.numero + " ? Il sera déployé en production si les tests sont verts.");
          bouton(c, "Refuser", { action: "fermer", numero: i.numero }, "Refuser et fermer #" + i.numero + " ?");
        }
        pr.append(c);
      });
    }
    const bm = $("badgeMachines"); bm.hidden = !nPr; bm.textContent = String(nPr);
    const rl = vider("relances");
    if (!d.relancesPossibles || !d.relancesPossibles.length) rl.append(carte("Gestes indisponibles", "", "Pour agir depuis le téléphone (relancer, fusionner, fermer, pause), pose le secret PILOTAGE_GITHUB_TOKEN sur la fonction « pilotage ». La Sentinelle tourne quand même toute seule.", "gris"));
    (d.relancesPossibles || []).forEach((x) => { const c = carte(x.libelle, "", ""); bouton(c, "Lancer maintenant", { action: "relancer", cible: x.cle }, "Lancer « " + x.libelle + " » maintenant ?"); rl.append(c); });

    // Utilisateurs
    const m = vider("maintenant"), co = vider("comptes");
    if (!u) { nonLu("maintenant", "Utilisateurs"); }
    else {
      m.append(chiffre(u.maintenant.comptes, "comptes connectés"), chiffre(u.maintenant.appareils, "appareils"),
        chiffre(u.aujourdhui.comptes, "comptes actifs 24 h"), chiffre(u.aujourdhui.appareils, "appareils 24 h"));
      co.append(chiffre(u.inscritsJour, "aujourd'hui"), chiffre(u.inscritsSemaine, "7 jours"), chiffre(u.total, "au total"));
      graphe("grapheInscriptions", u.serieInscriptions);
    }
    graphe("grapheErreurs", e7 && e7.serie);
    const si2 = vider("signalements");
    const sg = d.signalements;
    if (!sg) nonLu("signalements", "Signalements");
    else {
      if (!sg.liste || !sg.liste.length) si2.append(carte("Aucun signalement en attente", "OK", "", "vert"));
      (sg.liste || []).forEach((x) => {
        const c = carte("Signalement · " + x.type, "À traiter", (x.motif ? "« " + x.motif + " » · " : "") + ilYA(x.le), "orange");
        bouton(c, "Traité", { action: "signalement", id: x.id, statut: "handled" }, "Marquer ce signalement comme traité ?");
        bouton(c, "Rejeter", { action: "signalement", id: x.id, statut: "dismissed" }, "Rejeter ce signalement (sans suite) ?");
        si2.append(c);
      });
    }

    // Capacité
    const ja = vider("jauges");
    if (!d.capacite) nonLu("jauges", "Capacité");
    else {
      (d.capacite.jauges || []).forEach((j) => {
        const val = j.unite === "octets" ? taille(j.valeur) + " sur " + taille(j.plafond) : (j.valeur == null ? "—" : j.valeur) + " sur " + j.plafond;
        const c = carte(j.libelle, j.pct == null ? "Non mesuré" : String(j.pct).replace(".", ",") + " %", val + (j.estimation ? " (estimation)" : ""), j.couleur);
        const bar = el("div", "jauge " + j.couleur); const f = el("span"); f.style.width = Math.min(100, j.pct || 0) + "%"; bar.append(f); c.append(bar);
        ja.append(c);
      });
      if (!d.capacite.mesuresServeur) ja.append(el("p", "discret", "Base et stockage : la migration « pilotage_veille » n'est pas encore appliquée."));
      ja.append(el("p", "discret", "La bande passante (egress) ne se lit que sur la page Usage de Supabase."));
    }

    // Réglages : alertes
    const al = vider("alertes");
    const a = d.alertes;
    if (a) {
      al.append(a.appareils
        ? carte(a.appareils + " appareil(s) recevront les alertes", "Actif", "Tu es prévenu quand le voyant passe au rouge, quand le site ne répond plus, et quand c'est réglé.", "vert")
        : carte("Aucun appareil ne reçoit les alertes", "Inactif", "Ouvre PASSIO avec le compte éditeur et active les notifications quand elles sont proposées.", "orange"));
      const dispo2 = d.disponibilite;
      al.append(carte("Veille automatique", dispo2 && dispo2.veilleLe ? "Active" : "Pas encore",
        dispo2 && dispo2.veilleLe ? "dernier changement noté " + ilYA(dispo2.veilleLe) + " · vérifie toutes les 5 min" : "Elle démarre quand la migration « pilotage_veille » est appliquée.",
        dispo2 && dispo2.veilleLe ? "vert" : "gris"));
    }

    const manquants = d.nonLus || [];
    erreur(manquants.length ? manquants.length + " domaine(s) non lu(s) (" + manquants.join(", ") + ") — le reste est à jour." : "");
  }

  async function actualiser() {
    if (enCours) return;
    enCours = true; $("actualiser").classList.add("tourne");
    try {
      const d = await appeler({ action: "etat" });
      rendre(d); derniere = Date.now();
    } catch (e) {
      if (e.status === 401) { ecran("connexion"); return; }
      if (e.status === 403) { ecran("refus"); $("refusTexte").textContent = "Le compte " + (compte || "") + " n'a pas accès au pilotage. Connecte-toi avec le compte de l'éditeur."; return; }
      erreur(e.status === 404 ? "La fonction « pilotage » n'est pas encore déployée." : "Lecture impossible : " + e.message + ". Dernières données conservées.");
    } finally { enCours = false; $("actualiser").classList.remove("tourne"); majEtat(); }
  }
  $("actualiser").addEventListener("click", actualiser);

  // ─── Connexion ────────────────────────────────────────────────────────────
  $("cxGoogle").addEventListener("click", async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + "/pilotage/" } });
    if (error) { $("cxErreur").hidden = false; $("cxErreur").textContent = "Connexion Google impossible : " + error.message; }
  });
  async function deconnecter() {
    if (!confirm("Se déconnecter ? (Tu seras aussi déconnecté de PASSIO sur ce téléphone.)")) return;
    try { await sb.auth.signOut(); } catch (_e) { /* on quitte quand même */ }
    ecran("connexion");
  }
  $("deconnexion").addEventListener("click", deconnecter);
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
  async function demarrer() {
    if (!sb) { ecran("connexion"); $("cxErreur").hidden = false; $("cxErreur").textContent = "Bibliothèque Supabase introuvable."; return; }
    const { data } = await sb.auth.getSession();
    const session = data && data.session;
    if (!session) { ecran("connexion"); return; }
    compte = session.user && session.user.email;
    ecran("app");
    vider("compte").append(carte(compte || "Compte", "Connecté", "Session partagée avec PASSIO sur ce téléphone."));
    majInstall();
    await actualiser();
  }
  sb && sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN") setTimeout(demarrer, 0); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !$("app").hidden && Date.now() - derniere > 20000) actualiser(); });
  window.addEventListener("online", () => { majEtat(); if (!$("app").hidden) actualiser(); });
  window.addEventListener("offline", majEtat);
  setInterval(() => { majEtat(); if (!$("app").hidden && document.visibilityState === "visible" && Date.now() - derniere >= 60000) actualiser(); }, 5000);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/pilotage/sw.js", { scope: "/pilotage/" }).catch(() => {});
  demarrer();
})();
