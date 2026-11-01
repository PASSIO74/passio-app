// ══════════════════════════════════════════════════════════════════════════
// LANCEMENT GRATUIT — LE MUR DES PASSIONS EST LEVÉ  (2026-11-01)
//
// « C'est parti, je lance l'app en gratuit, mets tout en place. »
// (`docs/PLAN_MONETISATION_2026-11-01.md`, phase 0, étape 2)
//
// Le plafond de trois passions et le quota de trois changements ne servaient
// qu'à une offre payante qui n'existe pas. Ils sont levés POUR TOUT LE MONDE par
// `PLAFOND_PASSIONS_EN_VIGUEUR = false` (app-06), qui réutilise le chemin déjà
// verrouillé du mode « passions illimitées » de l'éditeur.
//
// Ce que cette suite exige :
//   ① par défaut, un compte prend une 4ᵉ et une 5ᵉ passion SANS fenêtre payante ;
//   ② l'écran n'annonce plus aucune limite (« sur N », alerte de quota, porte) ;
//   ③ un changement fait pendant le lancement n'est JAMAIS facturé ensuite ;
//   ④ l'onboarding laisse choisir ses passions sans les borner à trois ;
//   ⑤ le plafond se RÉARME (adhésion de l'appareil) et ne rétrograde personne.
//
// Les suites qui éprouvent le plafond lui-même l'arment par
// `armerPlafondPassions` (app-helper) : celle-ci, non — elle mesure le DÉFAUT.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const APERCU = "?passio_preview=flat-passions-v1";

// Passions RÉELLES du référentiel plat (une passion inconnue s'affiche
// « ✨ Passion » et un test vert sur ce libellé ne dirait plus rien).
const DISPO = ["voyage", "cuisine", "photo", "podcast", "moto", "musique"];

async function poser(page, vivantes, { vitrineReelle = false } = {}) {
  await bootOnboarded(page, null, 1, { query: APERCU });
  await page.evaluate((o) => {
    // Aucune écriture distante : la suite mesure le client. ⑥ garde la FILE
    // réelle de la vitrine et remplace seulement l'écriture qu'elle ordonne.
    window.supaSaveUserState = async () => {};
    if (o.vitrine) window._supaSavePassionStateMaintenant = async () => true;
    else window.supaSavePassionState = async () => {};
    window.supaUpsertProfile = async () => {};
    state.user.profiles = o.dispo.slice(0, o.n).map((pid, i) => ({
      id: "lg_" + i, name: "QA", passion: pid, emoji: "✨", bio: "",
      color: "#8b5cf6", createdAt: i + 1,
    }));
    state.user.currentProfileId = state.user.profiles[0].id;
    state.user.passionChanges = { entries: [] };
    state.userPosts = [];
    saveState();
    goTo("profiles");
  }, { n: vivantes, dispo: DISPO, vitrine: vitrineReelle });
  await page.waitForTimeout(400);
}

const fenetrePayante = (page) => page.evaluate(() => {
  const m = document.getElementById("modalContent");
  const t = (m && m.textContent) || "";
  return /passions offertes|formule payante/i.test(t);
});

test("① par défaut, une 4ᵉ et une 5ᵉ passion s'ajoutent sans fenêtre payante", async ({ page }) => {
  await poser(page, 3);
  const avant = await page.evaluate(() => ({
    arme: plafondPassionsArme(),
    plafond: plafondPassionsActif(),
    quota: quotaChangementsActif(),
    places: String(passionsRestantesOffertes()),
  }));
  expect(avant.arme, "le plafond est armé sans que l'appareil l'ait demandé").toBe(false);
  expect(avant.plafond, "le plafond de passions s'applique encore au lancement").toBe(false);
  expect(avant.quota, "le quota de changements s'applique encore au lancement").toBe(false);
  expect(avant.places).toBe("Infinity");

  await page.evaluate((d) => { ajouterPassionAuCompte(d[3], ""); }, DISPO);
  await page.waitForTimeout(300);
  await page.evaluate((d) => { ajouterPassionAuCompte(d[4], ""); }, DISPO);
  await page.waitForTimeout(300);

  const apres = await page.evaluate(() => ({
    vivantes: nbPassionsVivantes(),
    atteint: plafondPassionsAtteint(),
  }));
  expect(apres.vivantes, "la 4ᵉ ou la 5ᵉ passion a été refusée").toBe(5);
  expect(apres.atteint).toBe(false);
  expect(await fenetrePayante(page), "une fenêtre payante s'est ouverte pendant le lancement").toBe(false);
});

test("② l'écran « Mes passions » n'annonce plus aucune limite", async ({ page }) => {
  await poser(page, 3);
  await page.evaluate(() => openPassionManager());
  await page.waitForTimeout(450);
  const vu = await page.evaluate(() => ({
    resume: (document.getElementById("passionsResume").textContent || "").trim(),
    quotaVisible: getComputedStyle(document.getElementById("profilesQuotaSub")).display !== "none",
    porte: document.getElementById("nouveauProfilLien").getAttribute("data-passion-porte"),
    mot: (document.getElementById("nouveauProfilSous").textContent || "").trim(),
  }));
  expect(vu.resume, "« sur N » annonce une limite qui ne borne plus rien").not.toContain(" sur ");
  expect(vu.quotaVisible, "l'alerte de quota reste affichée").toBe(false);
  expect(vu.porte, "la porte d'ajout est fermée au lancement").toBe("ouverte");
  expect(vu.mot).not.toContain("Limite");
});

test("③ un changement fait pendant le lancement n'est jamais facturé ensuite", async ({ page }) => {
  await poser(page, 4);
  await page.evaluate(() => { archiverPassion("lg_3"); archiverPassion("lg_2"); });
  await page.waitForTimeout(300);
  const journal = await page.evaluate(() =>
    ((state.user.passionChanges || {}).entries || []).filter((e) => e.type === "archive"));
  expect(journal.length, "les archivages n'ont pas été journalisés").toBe(2);
  expect(journal.every((e) => e.compte === false),
    "un archivage du lancement est marqué facturable").toBe(true);

  // Le jour où le plafond revient (PASSIO+), ces deux mouvements ne comptent pas.
  const rearme = await page.evaluate(() => {
    window.PASSIO_PLAFOND_PASSIONS = true;
    return {
      quota: quotaChangementsActif(),
      utilises: changementsPassionUtilises(),
      restants: changementsPassionRestants(),
      offerts: CHANGEMENTS_PASSION_OFFERTS,
    };
  });
  expect(rearme.quota, "le réarmement n'a pas rétabli le quota").toBe(true);
  expect(rearme.utilises, "des changements du lancement ont été facturés").toBe(0);
  expect(rearme.restants).toBe(rearme.offerts);
});

test("④ l'onboarding ne borne plus le choix des passions à trois", async ({ page }) => {
  await poser(page, 1);
  const vu = await page.evaluate(() => {
    const libre = onbMaxPassions();
    window.PASSIO_PLAFOND_PASSIONS = true;
    const arme = onbMaxPassions();
    return { libre, arme, spec: ONB_MAX_PASSIONS, offertes: PASSIONS_OFFERTES };
  });
  expect(vu.libre, "l'onboarding reste borné au plafond payant").toBe(vu.spec);
  expect(vu.arme, "réarmé, l'onboarding ne suit plus le plafond").toBe(Math.min(vu.spec, vu.offertes));
});

test("⑤ réarmé par l'appareil, le plafond revient — sans rétrograder personne", async ({ page }) => {
  await poser(page, 5);
  await page.evaluate(() => { localStorage.setItem(CLE_PLAFOND_PASSIONS, "1"); });
  const vu = await page.evaluate(() => ({
    arme: plafondPassionsArme(),
    plafond: plafondPassionsActif(),
    vivantes: nbPassionsVivantes(),
    atteint: plafondPassionsAtteint(),
  }));
  expect(vu.arme).toBe(true);
  expect(vu.plafond, "l'adhésion de l'appareil ne réarme pas le plafond").toBe(true);
  expect(vu.vivantes, "réarmer le plafond a retiré des passions gagnées au lancement").toBe(5);
  expect(vu.atteint).toBe(true);

  // Au-delà, le mur reparle — c'est la brique de PASSIO+.
  await page.evaluate((d) => { ajouterPassionAuCompte(d[5], ""); }, DISPO);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => nbPassionsVivantes())).toBe(5);
  expect(await fenetrePayante(page), "au plafond réarmé, le mur ne dit plus rien").toBe(true);
});

test("⑥ une rafale d'ajouts n'envoie qu'UNE écriture de la vitrine, portant toute la liste", async ({ page }) => {
  // Plafond levé, l'onboarding attache jusqu'à sept passions d'un coup ; chaque
  // ajout appelait `supaSavePassionState` en parallèle et la dernière écriture
  // ARRIVÉE gagnait — parfois la plus courte. Audit du 2026-11-01, point 5.
  await poser(page, 1, { vitrineReelle: true });
  await page.waitForTimeout(300);   // laisse passer les écritures du démarrage
  const vu = await page.evaluate(async (d) => {
    window.__envois = [];
    // On remplace l'écriture RÉELLE (la file reste celle du produit) : elle note
    // la liste qu'elle aurait envoyée et dure un peu, comme un aller-retour.
    window._supaSavePassionStateMaintenant = async () => {
      window.__envois.push(passionsVivantes().map((p) => p.passion).sort().join(","));
      await new Promise((r) => setTimeout(r, 150));
      return true;
    };
    const promesses = [];
    for (const pid of d.slice(1, 5)) {
      state.user.profiles.push({ id: "r_" + pid, name: "QA", passion: pid, emoji: "✨", bio: "", color: "#8b5cf6", createdAt: Date.now() });
      promesses.push(supaSavePassionState());
    }
    const verdicts = await Promise.all(promesses);
    const apresRafale = window.__envois.slice();
    // Pendant une écriture en vol, deux appels de plus se fondent en UNE suivante.
    const p1 = supaSavePassionState();
    await new Promise((r) => setTimeout(r, 20));
    state.user.profiles.push({ id: "r_x", name: "QA", passion: d[5], emoji: "✨", bio: "", color: "#8b5cf6", createdAt: Date.now() });
    const p2 = supaSavePassionState();
    const p3 = supaSavePassionState();
    await Promise.all([p1, p2, p3]);
    return { verdicts, apresRafale, tous: window.__envois.slice(), memeTour: p2 === p3 };
  }, DISPO);
  expect(vu.verdicts.every((v) => v === true), "un appelant n'a pas reçu le verdict de son écriture").toBe(true);
  expect(vu.apresRafale.length, "la rafale est partie en plusieurs écritures parallèles").toBe(1);
  expect(vu.apresRafale[0].split(",").length, "l'écriture unique ne porte pas toute la liste").toBe(5);
  expect(vu.tous.length, "les appels pendant le vol ne se sont pas fondus en une écriture").toBe(3);
  expect(vu.tous[2].split(",").length, "la dernière écriture n'est pas la plus récente").toBe(6);
  expect(vu.memeTour).toBe(true);
});
