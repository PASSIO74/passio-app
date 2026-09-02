// Suite « Écran des passions » — spec §5 du lot Onboarding → premier moment de
// valeur (docs/PASSIO_ONBOARDING_TO_FIRST_VALUE_LOT_2026-08-20.md).
//
// Trois écarts corrigés :
//
// ① Plafond de 3. La spec veut 1 minimum, 3 en recommandation, 7 au maximum —
//    « ne pas bloquer un utilisateur qui n'a réellement qu'une passion forte
//    simplement pour satisfaire un chiffre produit ».
// ② La copie promettait « Chacune crée un profil dédié ». Depuis le lot 1 c'est
//    faux : onbFinish ne crée qu'UN profil de départ en V2. L'écran décrivait
//    une mécanique que le code ne fait plus.
// ③ Le profil de départ était `selectedPassions[0]`, choisi en silence. La spec
//    exige que « le choix ne soit pas silencieux » et modifiable d'un tap.
//
// Tout est derrière onbV2Actif() : le dernier test vérifie que le drapeau à
// false restaure l'écran d'origine à l'identique.
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

async function bootEcranPassions(page, { v2 = true } = {}) {
  // ⚠️ CONVENTION DE TEST — la même qu'aux mises en ligne d'UI-3A, UI-4 et UI-8.
  // Le lot `flat_passions_v1` (actif par défaut depuis le 2026-09-01) REMPLACE
  // la grille de 19 tuiles par une recherche, et change la copie de l'écran en
  // « Recherche et choisis directement ce que tu aimes. » — ce que le cahier des
  // charges demandait explicitement. Cette suite observe l'écran d'AVANT : elle
  // pose donc le kill switch du lot qui la recouvre et GARDE TOUTES SES
  // ASSERTIONS. La copie NEUVE est prouvée à part, dans `passions-plates.spec.js`.
  await page.addInitScript(([k, t, flag]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("flat_passions_v1", "0");
    window.PASSIO_ONBOARDING_V2 = flag;
  }, [GATE_KEY, GATE_TOKEN, v2]);
  await page.goto("/index.html");
  await page.waitForFunction(() => typeof renderPassionGrid === "function", null, { timeout: 20000 });
  await page.evaluate(() => {
    window.supaSaveUserState = async () => {};
    window.supaUpsertProfile = async () => {};
    window.supaInit = () => {};
    // Afficher RÉELLEMENT l'écran des passions, par la transition de l'app
    // elle-même (`exitLandingAsAuth`, le bouton « Créer un compte ») et non en
    // dévoilant le calque à la main : forcer #onboarding visible laissait la
    // landing active PAR-DESSUS, et son bouton primaire interceptait les clics —
    // mesuré, le test échouait sur un défaut qui n'existait que dans le test.
    // Seule l'étape d'auth est court-circuitée : elle exige un vrai compte
    // Supabase, ce qui ferait de cette suite un test opt-in.
    exitLandingAsAuth("signup");
    onbStepIdx = onbSteps.indexOf("passions");
    showOnbStep("passions");
    selectedPassions.length = 0;
    renderPassionGrid();
  });
}

test("§5 — jusqu'à 7 passions, la 8e est refusée", async ({ page }) => {
  await bootEcranPassions(page);
  const r = await page.evaluate(() => {
    const ids = allPassions().slice(0, 8).map((p) => p.id);
    ids.forEach((id) => togglePassion(id));
    return { retenues: selectedPassions.slice(), demandees: ids.length };
  });
  expect(r.demandees).toBe(8);
  expect(r.retenues.length).toBe(7);
});

test("§5 — une seule passion suffit pour entrer", async ({ page }) => {
  await bootEcranPassions(page);
  const r = await page.evaluate(() => {
    state.user.name = "Solo";
    state.user.birthYear = 1990;
    togglePassion(allPassions()[0].id);
    onbFinish();
    return {
      interets: Array.from(_activeFeedPassions),
      profils: (state.user.profiles || []).length,
      ecranActif: !!document.querySelector("#screen-feed.active"),
    };
  });
  expect(r.interets.length).toBe(1);
  expect(r.profils).toBe(1);
  expect(r.ecranActif).toBe(true);
});

test("§5 — la copie ne promet plus un profil par passion", async ({ page }) => {
  await bootEcranPassions(page);
  const r = await page.evaluate(() => ({
    titre: document.querySelector("#onbPassionsTitle").textContent.trim(),
    texte: document.querySelector("#onbPassionsText").textContent.trim(),
  }));
  expect(r.titre).toBe("Qu'est-ce qui te passionne ?");
  expect(r.texte).toBe("Choisis ce que tu veux voir dans ton Fil. Tu pourras tout modifier plus tard.");
  // « ne parler ni de score, ni de Passia, ni de rang » (§5), et surtout ne plus
  // annoncer une mécanique de profils que onbFinish ne fait plus.
  const interdits = /profil dédié|Passia|score|rang|niveau/i;
  expect(interdits.test(r.titre + " " + r.texte)).toBe(false);
});

test("§5 — le profil de départ est énoncé, et modifiable d'un tap", async ({ page }) => {
  await bootEcranPassions(page);
  const ids = await page.evaluate(() => {
    const trois = allPassions().slice(0, 3).map((p) => p.id);
    trois.forEach((id) => togglePassion(id));
    return trois;
  });

  const avant = await page.evaluate(() => ({
    visible: document.querySelector("#onbStarter").style.display,
    texte: document.querySelector("#onbStarter").textContent,
    actif: document.querySelector('#onbStarter [aria-pressed="true"]').getAttribute("data-passion-depart"),
    depart: selectedPassions[0],
  }));
  expect(avant.visible).toBe("block");
  // ADR-010 : le mot « profil » ne désigne plus une passion. Ici le TEXTE est
  // bien l'exigence (c'est un test de vocabulaire), on l'assert donc en toutes
  // lettres — contrairement aux ancres d'ouverture de modale, passées en
  // sélecteurs stables.
  expect(avant.texte).toContain("Ta passion de départ");
  expect(avant.actif).toBe(ids[0]);

  // Le tap sur la puce désigne, il ne décoche pas.
  await page.click(`#onbStarter [data-passion-depart="${ids[2]}"]`);
  const apres = await page.evaluate(() => ({
    actif: document.querySelector('#onbStarter [aria-pressed="true"]').getAttribute("data-passion-depart"),
    depart: selectedPassions[0],
    toujoursTrois: selectedPassions.length,
  }));
  expect(apres.actif).toBe(ids[2]);
  expect(apres.depart).toBe(ids[2]);
  expect(apres.toujoursTrois).toBe(3);

  // Et c'est bien CE profil que onbFinish crée.
  const cree = await page.evaluate(() => {
    state.user.name = "Testeur";
    state.user.birthYear = 1990;
    onbFinish();
    return {
      profils: (state.user.profiles || []).map((p) => p.passion),
      interets: Array.from(_activeFeedPassions),
    };
  });
  expect(cree.profils).toEqual([ids[2]]);
  expect(cree.interets.length).toBe(3);   // les deux autres restent des intérêts
});

test("§5 — la recherche filtre sans jamais masquer une passion déjà cochée", async ({ page }) => {
  await bootEcranPassions(page);
  const r = await page.evaluate(async () => {
    const champ = document.querySelector("#onbPassionSearch");
    const visibleAvant = champ.style.display;
    togglePassion("musique");
    champ.value = "voy";
    renderPassionGrid();
    const affichees = Array.from(document.querySelectorAll("#passionGrid .passion-tile[data-passion]"))
      .map((t) => t.getAttribute("data-passion"));
    champ.value = "";
    renderPassionGrid();
    const apresVidage = document.querySelectorAll("#passionGrid .passion-tile[data-passion]").length;
    return { visibleAvant, affichees, apresVidage, total: allPassions().length };
  });
  expect(r.total).toBeGreaterThan(12);      // prémisse : le catalogue est « long »
  expect(r.visibleAvant).toBe("block");
  expect(r.affichees).toContain("voyage");
  expect(r.affichees).toContain("musique");  // cochée → jamais masquée
  expect(r.affichees.length).toBeLessThan(r.total);
  expect(r.apresVidage).toBe(r.total);       // le vidage restaure tout
});

test("§5 — la pastille ★ est ancrée dans SA tuile, pas ailleurs", async ({ page }) => {
  await bootEcranPassions(page);
  await page.evaluate(() => { togglePassion("musique"); });
  const r = await page.evaluate(() => {
    const tuile = document.querySelector('#passionGrid .passion-tile[data-passion="musique"]');
    const badge = tuile.querySelector('[data-depart="1"]');
    if (!badge) return null;
    const a = tuile.getBoundingClientRect(), b = badge.getBoundingClientRect();
    return {
      dedans: b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1,
      positionTuile: getComputedStyle(tuile).position,
    };
  });
  expect(r).not.toBeNull();
  expect(r.positionTuile).toBe("relative");
  expect(r.dedans).toBe(true);
});

test("§5 — drapeau V2 à false : écran d'origine strictement rétabli", async ({ page }) => {
  await bootEcranPassions(page, { v2: false });
  const r = await page.evaluate(() => {
    const ids = allPassions().slice(0, 5).map((p) => p.id);
    ids.forEach((id) => togglePassion(id));
    return {
      titre: document.querySelector("#onbPassionsTitle").textContent.trim(),
      texte: document.querySelector("#onbPassionsText").textContent.trim(),
      recherche: document.querySelector("#onbPassionSearch").style.display,
      depart: document.querySelector("#onbStarter").style.display,
      retenues: selectedPassions.length,
      etoiles: document.querySelectorAll('#passionGrid [data-depart="1"]').length,
    };
  });
  expect(r.titre).toBe("Tes premières passions");
  expect(r.texte).toBe("Choisis 1 à 3 passions. Chacune crée un profil dédié.");
  expect(r.recherche).toBe("none");
  expect(r.depart).toBe("none");
  expect(r.retenues).toBe(3);   // plafond historique
  expect(r.etoiles).toBe(0);
});

// ── §8 « Pas de tour forcé » ─────────────────────────────────────────────────
//
// Le lot 1 avait remplacé `launchTourSafe()` par `if (!v2) launchTourSafe()` en
// fin d'onbFinish, et la règle §8 semblait tenue. Mesuré le 2026-08-23 : le tour
// réapparaissait ~800 ms plus tard. `launchTourSafe` a QUATRE appelants
// (onbFinish, exitLanding, exitLandingAsAuth, initApp) ; les trois autres sont
// gardés par `if (!state.tourSeen)`, et sauter le seul appel d'onbFinish laissait
// ce drapeau à false. Le premier des trois à s'exécuter relançait le tour.
//
// Ce test attend donc VRAIMENT, et rechargeun coup : vérifier l'état juste après
// onbFinish aurait été vert sur du code cassé.
test("§8 — aucun tour forcé après l'inscription, ni à l'entrée ni au rechargement", async ({ page }) => {
  await bootEcranPassions(page);
  await page.evaluate(() => {
    state.user.name = "Testeur"; state.user.birthYear = 1990;
    togglePassion("musique");
    onbFinish();
  });

  const lire = () => page.evaluate(() => {
    const o = document.getElementById("tourOverlay");
    return { tourSeen: state.tourSeen, overlay: !!(o && o.classList.contains("active")) };
  });

  expect((await lire()).overlay).toBe(false);
  // launchTourSafe temporise 800 ms avant d'activer l'overlay : mesurer trop tôt
  // rendrait ce test vert sur le défaut qu'il doit attraper.
  await page.waitForTimeout(2200);
  const apres = await lire();
  expect(apres.overlay).toBe(false);
  expect(apres.tourSeen).toBe(true);   // le drapeau porte la règle, pas la chance

  await page.reload();
  await page.waitForFunction(() => typeof renderFeed === "function", null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  expect((await lire()).overlay).toBe(false);
});

test("§8 — drapeau V2 à false : le tour d'origine est bien relancé", async ({ page }) => {
  await bootEcranPassions(page, { v2: false });
  await page.evaluate(() => {
    state.user.name = "Testeur"; state.user.birthYear = 1990;
    togglePassion("musique");
    onbFinish();
  });
  await page.waitForTimeout(2200);
  const o = await page.evaluate(() => {
    const el = document.getElementById("tourOverlay");
    return !!(el && el.classList.contains("active"));
  });
  expect(o).toBe(true);
});
