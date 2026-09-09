// Script d'attaque en lecture seule (émulation Chromium) — domaine profils-passions.
// Lance : PLAYWRIGHT_BROWSERS_PATH=<liens> node attaques.js   (serveur http sur 8106)
const path = require("path");
const REPO = "/home/user/passio-app";
const { chromium } = require(path.join(REPO, "node_modules/@playwright/test"));
const { bootOnboarded } = require(path.join(REPO, "tests/e2e/app-helper.js"));
const OUT = __dirname;
const fs = require("fs");
const res = {};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:8106", viewport: { width: 390, height: 844 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  const errs = { js: [], console: [], network: [] };
  page.on("pageerror", (e) => errs.js.push(String(e && e.message)));
  await bootOnboarded(page, errs, 3, {});

  // A. Plafond côté client seulement : 10 passions poussées par la console.
  res.A_plafond_console = await page.evaluate(() => {
    const ids = ["voyage","photo","tech","yoga","moto","podcast","mode","art","running","fitness"];
    ids.forEach((pid, i) => state.user.profiles.push({ id: "hack_" + i, name: "Audit QA", passion: pid, emoji: "✨", color: "#7c3aed", createdAt: Date.now() }));
    saveState();
    try { renderProfilesScreen(); renderProfileStrip(); } catch (e) {}
    const ch = _chargeProfilComplete();
    const sync = _syncableState();
    return {
      vivantes: nbPassionsVivantes(),
      plafondAtteint: plafondPassionsAtteint(),
      publiees_profiles_passions: ch && ch.passions ? ch.passions.length : null,
      publiees_user_state: sync.user.profiles.length,
      identite_texte_me: identitePassionsTexte({ id: "me" }),
      rail_profil: document.querySelectorAll("#v9ProfilePassions .profile-tile").length,
      resume: (document.getElementById("passionsResume") || {}).textContent || null,
    };
  });
  await page.evaluate(() => { goTo("profiles"); openPassionManager(); });
  await page.screenshot({ path: path.join(OUT, "A-13-passions-console.png"), fullPage: false });
  // Remet 3 passions
  await page.evaluate(() => { state.user.profiles = state.user.profiles.filter(p => !/^hack_/.test(p.id)); state.user.currentProfileId = "pp_0"; saveState(); renderProfilesScreen(); });

  // B. Double appel de restaurerPassion.
  res.B_double_restore = await page.evaluate(() => {
    archiverPassion("pp_2", true);
    const avant = journalPassions().entries.length;
    const r1 = restaurerPassion("pp_2", true);
    const r2 = restaurerPassion("pp_2", true);
    const j = journalPassions().entries;
    return { r1, r2, entrees_avant: avant, entrees_apres: j.length, restores: j.filter(e => e.type === "restore").length, archives_facturees: changementsPassionUtilises(), restants: changementsPassionRestants() };
  });

  // C. Brouillon du Studio et changement de passion.
  res.C_studio_brouillon = await page.evaluate(() => {
    goTo("studio");
    const ta = document.getElementById("postText") || document.querySelector("#screen-studio textarea");
    if (ta) ta.value = "brouillon audit";
    const sel = document.getElementById("postPassion");
    const autre = Array.from(sel.options).map(o => o.value).find(v => v !== sel.value);
    sel.value = autre;
    onStudioPassionChange();
    const ta2 = document.getElementById("postText") || document.querySelector("#screen-studio textarea");
    return { autre, current_apres: (currentProfile() || {}).passion, texte_apres: ta2 ? ta2.value : null, select_apres: document.getElementById("postPassion").value };
  });

  // D. Sélecteur périmé : archivage de la passion courante PENDANT que le Studio est à l'écran (ex. synchro d'un autre appareil).
  res.D_select_perime = await page.evaluate(async () => {
    goTo("studio");
    const sel = document.getElementById("postPassion");
    const cur = currentProfile();
    const ok = archiverPassion(cur.id, true);      // silencieux = pas de re-rendu (chemin de l'échange / d'une synchro)
    const optionsApres = Array.from(document.getElementById("postPassion").options).map(o => o.value);
    const archivee = cur.passion;
    const encoreProposee = optionsApres.includes(archivee);
    let publie = null;
    if (encoreProposee) {
      document.getElementById("postPassion").value = archivee;
      const ta = document.getElementById("postText") || document.querySelector("#screen-studio textarea");
      if (ta) ta.value = "post audit dans passion archivee";
      try { await publishPost(); } catch (e) { publie = "erreur:" + (e && e.message); }
      const p = (state.userPosts || [])[0];
      const prof = (state.user.profiles || []).find(x => x.id === (p && p.profileId));
      publie = p ? { passion: p.passion, profileId: p.profileId, profil_archive: !!(prof && prof.archived) } : publie;
    }
    return { archivage_ok: ok, archivee, optionsApres, encoreProposee, publie };
  });

  // E. Libellé de passion hostile publié par un autre compte.
  res.E_xss_libelle = await page.evaluate(() => {
    const u = { id: "autre-uid", passions: [{ id: "zzz-inconnue", label: "<img src=x onerror=window.__xss=1>", emoji: "✨" }] };
    const html = identitePassionsHTML(u);
    const t = identitePassionsTexte(u);
    return { contient_img_brut: /<img/.test(html), texte: t, xss_declenche: !!window.__xss };
  });

  // F. Visiteur sans compte : plafond universel, quota illimité.
  res.F_visiteur = await page.evaluate(() => {
    state.onboarded = false; state.user.profiles = []; state.user.passionChanges = { entries: [] };
    const acceptees = ["voyage","photo","tech","yoga","moto"].map(pid => !!ajouterPassionAuCompte(pid, "")).filter(Boolean).length;
    const compte = comptePassioReel();
    const q = quotaChangementsActif();
    let archivagesLibres = 0;
    for (let i = 0; i < 5; i++) { const v = passionsVivantes(); if (v.length > 1 && archiverPassion(v[0].id, true)) archivagesLibres++; }
    return { comptePassioReel: compte, quotaActif: q, acceptees, vivantes: nbPassionsVivantes(), archivagesLibres, restants: changementsPassionRestants() };
  });
  try { closeModal(); } catch (e) {}

  // G. Mode « passions illimitées » : un simple drapeau localStorage lève tout, et tout part au serveur.
  res.G_illimite = await page.evaluate(() => {
    try { closeModal(); } catch (e) {}
    localStorage.setItem("passio_passions_illimitees_v1", "1");
    state.onboarded = true; state.user.profiles = []; state.user.passionChanges = { entries: [] };
    const acceptees = ["voyage","photo","tech","yoga","moto","podcast","mode","art"].map(pid => !!ajouterPassionAuCompte(pid, "")).filter(Boolean).length;
    const ch = _chargeProfilComplete();
    localStorage.setItem("passio_passions_illimitees_v1", "0");
    return { acceptees, vivantes: nbPassionsVivantes(), publiees_profiles_passions: ch && ch.passions ? ch.passions.length : null, plafondActif_apres_coupure: plafondPassionsActif() };
  });

  res.erreurs_js = errs.js;
  fs.writeFileSync(path.join(OUT, "attaques-resultat.json"), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 2));
  await browser.close();
})().catch((e) => { console.error("ECHEC", e); process.exit(1); });
