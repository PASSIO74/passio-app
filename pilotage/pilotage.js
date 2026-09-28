// PASSIO Pilotage — la version NUAGE, sans PC (2026-09-28).
// Données : Edge Function `pilotage` (Supabase), réservée au compte éditeur.
// Session : celle de PASSIO sur ce téléphone (même origine, même jeton).
// Règles : nœuds + textContent uniquement, jamais innerHTML ; les seuls liens
// posés vers l'extérieur vont à github.com ; seule écriture possible : relancer
// un workflow de la liste blanche (côté serveur, pas ici).
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const cfg = window.PILOTAGE_SUPABASE || {};
  const sb = window.supabase && window.supabase.createClient(cfg.url, cfg.anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const FONCTION = cfg.url + "/functions/v1/pilotage";
  let derniere = 0, enCours = false, compte = null;

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
  function lien(c, url, texte) {
    if (!/^https:\/\/github\.com\//.test(String(url || ""))) return;
    const a = el("a", null, texte || "Ouvrir sur GitHub"); a.href = url; a.target = "_blank"; a.rel = "noopener";
    const b = el("div", "carte-actions"); b.append(a); c.append(b);
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
  const nonLu = (id, titre) => vider(id).append(carte(titre, "Non lu", "Cette partie n'a pas pu être lue.", "gris"));

  // ─── Écrans ───────────────────────────────────────────────────────────────
  function ecran(nom) {
    $("ecranConnexion").hidden = nom !== "connexion";
    $("ecranRefus").hidden = nom !== "refus";
    $("app").hidden = nom !== "app";
  }
  function erreur(t) { const b = $("bandeauErreur"); b.hidden = !t; b.textContent = t || ""; }
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

  // ─── Appel de la fonction ─────────────────────────────────────────────────
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

  // ─── Rendu ────────────────────────────────────────────────────────────────
  function rendre(d) {
    const v = d.verdict || { couleur: "gris", titre: "Pas de nouvelles", raisons: [] };
    $("verdict").className = "verdict " + v.couleur;
    $("verdictTitre").textContent = v.titre;
    $("verdictDetail").textContent = (v.raisons || []).slice(0, 3).join(" · ");

    const s = d.sante, u = d.utilisateurs, gh = d.github;
    const ch = vider("chiffres");
    ch.append(
      chiffre(u ? u.maintenant.appareils : null, "appareils en ligne"),
      chiffre(u ? u.aujourdhui.comptes : null, "comptes actifs (24 h)"),
      chiffre(s ? s.erreursJs15 : null, "erreurs (15 min)", s && s.erreursJs15 >= 10 ? "rouge" : s && s.erreursJs15 ? "orange" : null),
      chiffre(d.signalements ? d.signalements.ouverts : null, "signalements", d.signalements && d.signalements.ouverts ? "orange" : null),
    );

    // Ce qui t'attend : issues suivies (hors PR)
    const at = vider("attente");
    let aFaire = 0;
    if (!gh) nonLu("attente", "Enquêtes GitHub");
    else {
      const issues = (gh.issues || []).filter((i) => !i.pr);
      if (!issues.length) at.append(carte("Rien ne t'attend", "OK", "Aucune enquête ni alerte ouverte.", "vert"));
      issues.forEach((i) => {
        const humain = i.labels.includes("humain");
        if (humain) aFaire++;
        const [mot, coul] = humain ? ["À toi", "rouge"] : i.labels.includes("sentinelle") ? ["Sentinelle", "orange"] : i.labels.includes("veille") ? ["Veille", "orange"] : ["Info", "gris"];
        const c = carte("#" + i.numero + " · " + i.titre, mot, "ouverte " + ilYA(i.depuis), coul);
        lien(c, i.url); at.append(c);
      });
    }
    const badge = $("badgeAccueil");
    badge.hidden = !aFaire; badge.textContent = String(aFaire);

    const er = vider("erreurs");
    if (!s) nonLu("erreurs", "Erreurs");
    else {
      if (!s.principales || !s.principales.length) er.append(carte("Aucune erreur", "OK", "", "vert"));
      (s.principales || []).forEach((x) => er.append(carte(x.message, x.n + " fois", x.comptes + " compte(s) · dernière " + ilYA(x.dernier), x.n >= 10 ? "rouge" : "orange")));
    }

    // Machines
    const ru = vider("runs");
    if (!gh) nonLu("runs", "Exécutions");
    else {
      const NOMS = { sentinelle: "Sentinelle", veille: "Veille de production", deploy: "Déploiement" };
      Object.keys(NOMS).forEach((k) => {
        const r = gh.runs && gh.runs[k];
        if (!r) { ru.append(carte(NOMS[k], "Inconnu", "", "gris")); return; }
        const [mot, coul] = r.etat !== "completed" ? ["En cours", "orange"] : r.conclusion === "success" ? ["OK", "vert"] : r.conclusion === "failure" ? ["Échec", "rouge"] : [r.conclusion || "?", "gris"];
        const c = carte(NOMS[k], mot, ilYA(r.le), coul); lien(c, r.url, "Voir l'exécution"); ru.append(c);
      });
    }
    const rl = vider("relances");
    if (!d.relancesPossibles || !d.relancesPossibles.length) rl.append(carte("Relances indisponibles", "", "Pour relancer depuis le téléphone, pose le secret PILOTAGE_GITHUB_TOKEN sur la fonction « pilotage » (voir Réglages sur GitHub). La Sentinelle tourne quand même toute seule.", "gris"));
    (d.relancesPossibles || []).forEach((x) => {
      const c = carte(x.libelle, "", "");
      const acts = el("div", "carte-actions");
      const b = el("button", "btn", "Lancer maintenant"); b.type = "button";
      b.addEventListener("click", async () => {
        if (!confirm("Lancer « " + x.libelle + " » maintenant ?")) return;
        b.disabled = true;
        try { await appeler({ action: "relancer", cible: x.cle }); b.textContent = "Lancé ✓"; }
        catch (e) { erreur("Relance refusée : " + e.message); b.disabled = false; }
      });
      acts.append(b); c.append(acts); rl.append(c);
    });
    const pr = vider("prs");
    if (gh) {
      const prs = (gh.issues || []).filter((i) => i.pr);
      if (!prs.length) pr.append(carte("Aucun correctif en attente", "", "", "gris"));
      prs.slice(0, 15).forEach((i) => { const c = carte("#" + i.numero + " · " + i.titre, "PR", "ouverte " + ilYA(i.depuis)); lien(c, i.url); pr.append(c); });
    }

    // Utilisateurs
    const m = vider("maintenant"), a = vider("aujourdhui"), co = vider("comptes");
    if (!u) { nonLu("maintenant", "Utilisateurs"); }
    else {
      m.append(chiffre(u.maintenant.comptes, "comptes connectés"), chiffre(u.maintenant.appareils, "appareils"));
      a.append(chiffre(u.aujourdhui.comptes, "comptes actifs"), chiffre(u.aujourdhui.appareils, "appareils"));
      co.append(chiffre(u.inscritsJour, "inscrits 24 h"), chiffre(u.inscritsSemaine, "inscrits 7 j"), chiffre(u.total, "au total"));
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
