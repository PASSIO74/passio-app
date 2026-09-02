// ══════════════════════════════════════════════════════════════════════════
// ARCHIVES DE PASSIONS ET QUOTA DE CHANGEMENTS  (2026-09-02)
//
// Défaut rapporté par Benjamin après essai réel : « j'ai essayé d'archiver une
// passion, de passer à une autre, puis de revenir à celle archivée — mais elle
// n'apparaissait plus ». Trois causes distinctes, chacune suffisante :
//
//   ① Au plafond, `restaurerPassion` ouvrait une fenêtre payante MUETTE, qui
//      remplaçait la liste des archives. La passion refusait de revenir et il
//      n'y avait plus rien à cliquer : une porte fermée sans issue.
//   ② La seule trace d'une passion rangée était un LIEN dans `#profilesQuotaSub`,
//      lui-même dans `#passionManager`, un panneau `hidden` qu'on n'ouvre que
//      depuis le menu ⋯ du profil. Trois portes fermées devant une archive.
//   ③ Rien ne bornait la rotation : archiver libérait une place, donc un compte
//      pouvait posséder tout le référentiel en faisant tourner ses trois
//      emplacements — « la fonction payante n'est plus utile ».
//
// Et l'exigence produit qui va avec : « dans la démo sans compte, illimité ;
// sur un compte créé, limiter à trois changements, ensuite le mode payant ».
//
// ⚠️ CE QUE CETTE SUITE NE PROUVE PAS : rien ici ne touche Supabase. La
// persistance du journal à travers `user_state` est exercée en local (rechargement
// de page), pas contre la base réelle — la fusion serveur (`supaLoadUserState`)
// reste couverte par lecture de code, pas par exécution.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
const { GATE_KEY, GATE_TOKEN } = require("./gate-helper");

const APERCU = "?passio_preview=flat-passions-v1";

// Amène le compte à N passions vivantes. On POSE la situation, on ne prouve pas
// le chemin d'ajout (couvert par `passions-plates.spec.js`).
async function poserNPassions(page, n) {
  await page.evaluate((cible) => {
    const dispo = ["musique", "photo", "sport", "cuisine", "voyage"];
    state.user.profiles = dispo.slice(0, cible).map((pid, i) => ({
      id: "q_" + i, name: (state.user.general || {}).username || "QA",
      passion: pid, emoji: "✨", bio: "", color: "#8b5cf6", createdAt: Date.now() + i,
    }));
    state.user.currentProfileId = state.user.profiles[0].id;
    state.user.passionChanges = { entries: [] };
    saveState();
  }, n);
}

const lire = (page) => page.evaluate(() => ({
  vivantes: (state.user.profiles || []).filter((p) => !p.archived).map((p) => p.passion),
  archivees: (state.user.profiles || []).filter((p) => p.archived).map((p) => p.passion),
  restants: String(changementsPassionRestants()),
  journal: ((state.user.passionChanges || {}).entries || []).map((e) => e.type + ":" + e.passion),
}));

// ══════════════════════════════════════════════════════════════════════════
// ① LE DÉFAUT RAPPORTÉ — archiver, changer, revenir
// ══════════════════════════════════════════════════════════════════════════
test.describe("revenir à une passion archivée", () => {
  test("① archiver, prendre une autre passion, puis revenir : la passion REVIENT", async ({ page }) => {
    // Le parcours exact de l'essai réel, de bout en bout.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);

    await page.evaluate(() => { goTo("profiles"); openPassionManager(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => archiverPassion("q_2"));   // « sport » quitte les actives
    await page.waitForTimeout(300);
    await page.evaluate(() => ajouterPassionAuCompte("voyage", ""));  // on prend autre chose
    await page.waitForTimeout(300);

    // ⚠️ AVANT LE CORRECTIF : ce clic ouvrait une fenêtre payante et la passion
    // restait archivée pour toujours. Elle propose maintenant l'ÉCHANGE.
    await page.evaluate(() => restaurerPassion("q_2"));
    await page.waitForTimeout(300);
    const lignes = page.locator("#modalContent [data-passion-echange]");
    await expect(lignes.first()).toBeVisible();

    // On range « voyage » pour reprendre « sport ».
    await page.evaluate(() => {
      const voyage = (state.user.profiles || []).find((p) => p.passion === "voyage" && !p.archived);
      document.querySelector('[data-passion-echange="' + voyage.id + '"] .v8-switch-go').click();
    });
    await page.waitForTimeout(500);

    const etat = await lire(page);
    expect(etat.vivantes, "la passion archivée n'est pas revenue").toContain("sport");
    expect(etat.archivees).toContain("voyage");
    expect(etat.vivantes.length, "l'échange a dépassé le plafond").toBe(3);
  });

  test("① bis — sous le plafond, reprendre une archive est direct et gratuit", async ({ page }) => {
    // La porte dérobée ④ du lot UI-8 reste fermée : on ne fait jamais payer la
    // reprise de ce qu'on possède déjà.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    const etat = await page.evaluate(() => {
      archiverPassion("q_2");
      restaurerPassion("q_2");
      return {
        vivantes: (state.user.profiles || []).filter((p) => !p.archived).length,
        archivee: !!(state.user.profiles || []).find((p) => p.id === "q_2" && p.archived),
        payante: ((document.getElementById("modalContent") || {}).textContent || "").includes("Trois passions offertes"),
      };
    });
    expect(etat.vivantes).toBe(3);
    expect(etat.archivee).toBe(false);
    expect(etat.payante, "reprendre une passion possédée a réclamé un paiement").toBe(false);
  });

  test("② la liste des archives est écrite EN CLAIR, plus derrière un lien", async ({ page }) => {
    // Cause ② : un lien dans un panneau masqué n'est pas une liste.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    await page.evaluate(() => { goTo("profiles"); openPassionManager(); });
    await page.waitForTimeout(400);

    // Rien d'archivé : pas de section vide qui laisserait une gouttière.
    await expect(page.locator("#passionArchiveBox")).toBeHidden();

    await page.evaluate(() => archiverPassion("q_2"));
    await page.waitForTimeout(400);

    const boite = page.locator("#passionArchiveBox");
    await expect(boite).toBeVisible();
    await expect(boite).toContainText("Passions archivées");
    await expect(boite).toContainText("Sport");
    // La date d'archivage est écrite : une archive sans date ne se distingue
    // pas d'une autre quand il y en a plusieurs.
    await expect(boite).toContainText(/Archivée le/);
    await expect(boite.locator('[data-v8-restaurer="q_2"]')).toBeVisible();
  });

  test("② bis — au plafond, le bouton annonce l'ÉCHANGE, pas « Restaurer »", async ({ page }) => {
    // Un bouton « Restaurer » qui ouvre une fenêtre payante ment sur son effet.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    await page.evaluate(() => { goTo("profiles"); openPassionManager(); archiverPassion("q_2"); });
    await page.waitForTimeout(400);
    await expect(page.locator('#passionArchiveBox [data-v8-restaurer="q_2"]')).toHaveText("Restaurer");

    await page.evaluate(() => { ajouterPassionAuCompte("voyage", ""); renderProfilesScreen(); });
    await page.waitForTimeout(400);
    await expect(page.locator('#passionArchiveBox [data-v8-restaurer="q_2"]')).toHaveText("Échanger");
  });

  test("② ter — la liste survit à un rechargement (elle est ENREGISTRÉE)", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    await page.evaluate(() => archiverPassion("q_2"));
    await page.waitForTimeout(400);

    await page.reload();
    // ⚠️ `state` est un `let` de portée script — PAS une propriété de `window`.
    await page.waitForFunction(() => typeof state !== "undefined" && state && Array.isArray(state.user.profiles),
      null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const etat = await lire(page);
    expect(etat.archivees, "l'archive n'a pas survécu au rechargement").toContain("sport");
    expect(etat.restants, "le compteur n'a pas survécu au rechargement").toBe("2");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ③ LE QUOTA DE CHANGEMENTS — ce qui rend l'offre payante utile
// ══════════════════════════════════════════════════════════════════════════
test.describe("le quota de changements", () => {
  test("③ trois changements offerts, le quatrième est barré", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await page.evaluate(() => {
      const dispo = ["musique", "photo", "sport", "cuisine", "voyage"];
      state.user.profiles = dispo.map((pid, i) => ({
        id: "q_" + i, name: "QA", passion: pid, emoji: "✨", bio: "", color: "#8b5cf6", createdAt: i,
      }));
      state.user.currentProfileId = "q_0";
      state.user.passionChanges = { entries: [] };
      saveState();
    });
    const suite = await page.evaluate(() => {
      const rendus = [];
      for (let i = 1; i <= 4; i++) rendus.push(archiverPassion("q_" + i));
      return {
        rendus,
        restants: String(changementsPassionRestants()),
        vivantes: (state.user.profiles || []).filter((p) => !p.archived).length,
      };
    });
    expect(suite.rendus).toEqual([true, true, true, false]);
    expect(suite.restants).toBe("0");
    expect(suite.vivantes, "un quatrième archivage est passé").toBe(2);
    await expect(page.locator("#modalContent")).toContainText("3 changements de passion");
  });

  test("③ bis — le coût est ANNONCÉ avant le geste, pas découvert après", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    await page.evaluate(() => confirmArchivePassion("q_2"));
    await page.waitForTimeout(300);
    const cout = page.locator("#modalContent [data-passion-cout]");
    await expect(cout).toBeVisible();
    await expect(cout).toContainText("consommera");
    await expect(cout).toContainText("3");
  });

  test("③ ter — le compteur est affiché sur l'écran de gestion", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    await page.evaluate(() => { goTo("profiles"); openPassionManager(); });
    await page.waitForTimeout(400);
    await expect(page.locator("#profilesQuotaSub [data-passion-compteur]")).toContainText("3 changements restants");
  });

  test("③ quater — RESTAURER ne consomme rien : un échange se paie UNE fois", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    const etat = await page.evaluate(() => {
      archiverPassion("q_2");
      const apresArchive = String(changementsPassionRestants());
      restaurerPassion("q_2");
      return { apresArchive, apresRestauration: String(changementsPassionRestants()) };
    });
    expect(etat.apresArchive).toBe("2");
    expect(etat.apresRestauration, "la restauration a été facturée en plus de l'archivage").toBe("2");
  });

  test("③ quinquies — l'échange consomme exactement UN changement", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    const etat = await page.evaluate(() => {
      archiverPassion("q_2");                  // 1er changement
      ajouterPassionAuCompte("voyage", "");    // la place est reprise
      const avant = String(changementsPassionRestants());
      const voyage = (state.user.profiles || []).find((p) => p.passion === "voyage" && !p.archived);
      echangerPassion("q_2", voyage.id);       // 2e changement, et un seul
      return { avant, apres: String(changementsPassionRestants()) };
    });
    expect(etat.avant).toBe("2");
    expect(etat.apres, "l'échange a été facturé deux fois").toBe("1");
  });

  test("③ sexies — archiver la DERNIÈRE passion reste refusé, et ne consomme rien", async ({ page }) => {
    // ⚠️ Un refus qui débite est pire qu'un refus : l'utilisateur paie un geste
    // qui n'a pas eu lieu. L'ordre compte — la garde « dernière vivante » doit
    // passer AVANT l'inscription au journal.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 1);
    const etat = await page.evaluate(() => {
      const rendu = archiverPassion("q_0");
      return { rendu, restants: String(changementsPassionRestants()),
               vivantes: (state.user.profiles || []).filter((p) => !p.archived).length };
    });
    expect(etat.rendu).toBe(false);
    expect(etat.vivantes).toBe(1);
    expect(etat.restants, "un refus a consommé un changement").toBe("3");
  });

  test("③ septies — archiver DEUX FOIS la même passion ne débite qu'une fois", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    const etat = await page.evaluate(() => {
      archiverPassion("q_2");
      const premier = String(changementsPassionRestants());
      archiverPassion("q_2");          // déjà rangée : rien à consommer
      return { premier, second: String(changementsPassionRestants()) };
    });
    expect(etat.premier).toBe("2");
    expect(etat.second).toBe("2");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ④ LA DÉMO SANS COMPTE — illimitée, et sans dette au moment de l'inscription
// ══════════════════════════════════════════════════════════════════════════
test.describe("la démo sans compte", () => {
  // Appareil VIERGE : ni état onboardé, ni uuid Supabase. C'est le seul cas où
  // `comptePassioReel()` est faux.
  async function bootVisiteur(page) {
    await page.addInitScript(([k, t]) => {
      sessionStorage.setItem(k, t);
      sessionStorage.setItem("passio_pwa_dismissed", "1");
    }, [GATE_KEY, GATE_TOKEN]);
    await page.goto("/index.html" + APERCU);
    // ⚠️ `state` est un `let` de portée script — PAS une propriété de `window`.
    await page.waitForFunction(() => typeof state !== "undefined" && state && state.user, null, { timeout: 20000 });
    await page.waitForTimeout(2500);
  }

  test("④ changements ILLIMITÉS sans compte — mais le plafond de trois tient", async ({ page }) => {
    // ⚠️ LES DEUX RÈGLES SONT DISTINCTES, et les confondre a coûté un trou réel
    // (voir « ④ quater » juste en dessous). « Illimité en démo » porte sur les
    // CHANGEMENTS. Le plafond de trois passions vivantes, lui, est universel :
    // c'est ce qu'il était avant ce lot, et c'est ce qui garantit qu'un visiteur
    // qui s'inscrit arrive dans son dû.
    await bootVisiteur(page);
    const etat = await page.evaluate(() => ({
      compteReel: comptePassioReel(),
      plafondActif: plafondPassionsActif(),
      quotaActif: quotaChangementsActif(),
      changements: String(changementsPassionRestants()),
    }));
    expect(etat.compteReel, "un appareil vierge est pris pour un compte").toBe(false);
    expect(etat.plafondActif, "le plafond de trois a été désarmé en démo").toBe(true);
    expect(etat.quotaActif, "le quota de changements est appliqué sans compte").toBe(false);
    expect(etat.changements).toBe("Infinity");
  });

  test("④ quater — AUCUN CRÉDIT DE DÉMO : le visiteur ne dépasse pas le plafond", async ({ page }) => {
    // ⚠️ LE MIROIR DE LA DETTE DE DÉMO, et il était réel — mesuré le 2026-09-02
    // sur le code de ce lot avant correctif : la porte d'ajout n'est PAS gardée
    // par `requireAuthentication` (le lot « première visite » la laisse ouverte
    // délibérément), donc un visiteur ajoutait HUIT passions puis créait son
    // compte et les gardait toutes — le plafond payant contourné à l'inscription,
    // définitivement. Un test qui n'exerce que l'archivage ne voit pas ce trou :
    // il faut passer par le MOTEUR D'AJOUT, celui que la porte appelle.
    await bootVisiteur(page);
    const etat = await page.evaluate(() => {
      const ids = ["musique", "photo", "sport", "cuisine", "voyage", "moto", "danse", "yoga"];
      let acceptees = 0;
      ids.forEach((id) => { try { if (ajouterPassionAuCompte(id, "")) acceptees++; } catch (e) {} });
      const enDemo = (state.user.profiles || []).filter((p) => !p.archived).length;
      state.onboarded = true;   // l'inscription, telle que la création de compte la fait
      return {
        acceptees,
        enDemo,
        apresInscription: (state.user.profiles || []).filter((p) => !p.archived).length,
        changementsApres: String(changementsPassionRestants()),
      };
    });
    expect(etat.acceptees, "le moteur d'ajout a accepté au-delà du plafond en démo").toBe(3);
    expect(etat.enDemo, "un visiteur a dépassé les trois passions vivantes").toBe(3);
    expect(etat.apresInscription, "le compte neuf hérite d'un dépassement du plafond").toBe(3);
    // Et il arrive avec ses trois changements intacts.
    expect(etat.changementsApres).toBe("3");
  });

  test("④ bis — un visiteur archive autant qu'il veut", async ({ page }) => {
    await bootVisiteur(page);
    const etat = await page.evaluate(() => {
      state.user.profiles = ["musique", "photo", "sport", "cuisine", "voyage"].map((p, i) => ({
        id: "v_" + i, name: "Visiteur", passion: p, emoji: "✨", bio: "", color: "#8b5cf6", createdAt: i,
      }));
      state.user.currentProfileId = "v_0";
      state.user.passionChanges = { entries: [] };
      for (let i = 1; i < 5; i++) archiverPassion("v_" + i);
      return {
        vivantes: (state.user.profiles || []).filter((p) => !p.archived).length,
        archivees: (state.user.profiles || []).filter((p) => p.archived).length,
      };
    });
    expect(etat.vivantes).toBe(1);
    expect(etat.archivees, "un visiteur a été bloqué par le quota").toBe(4);
  });

  test("④ ter — LA DÉMO NE LAISSE AUCUNE DETTE au compte créé ensuite", async ({ page }) => {
    // ⚠️ LE PIÈGE CENTRAL DE CE LOT. `state.onboarded` bascule à la création du
    // compte : sans un marqueur posé À L'ÉCRITURE, les quatre archivages d'essai
    // ci-dessus arrivaient sur le compte neuf comme des changements DÉJÀ
    // consommés — la démo illimitée facturait, avec un jour de retard.
    await bootVisiteur(page);
    const etat = await page.evaluate(() => {
      state.user.profiles = ["musique", "photo", "sport", "cuisine", "voyage"].map((p, i) => ({
        id: "v_" + i, name: "Visiteur", passion: p, emoji: "✨", bio: "", color: "#8b5cf6", createdAt: i,
      }));
      state.user.currentProfileId = "v_0";
      state.user.passionChanges = { entries: [] };
      for (let i = 1; i < 5; i++) archiverPassion("v_" + i);
      const enDemo = String(changementsPassionRestants());
      // L'inscription : c'est très exactement ce que fait la création de compte.
      state.onboarded = true;
      return { enDemo, apresInscription: String(changementsPassionRestants()),
               journal: (state.user.passionChanges.entries || []).length };
    });
    expect(etat.enDemo).toBe("Infinity");
    expect(etat.journal, "les mouvements de démo ne sont pas enregistrés du tout").toBe(4);
    expect(etat.apresInscription, "la démo a facturé après coup").toBe("3");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ⑤ KILL SWITCH — le quota vit sous `flat_passions_v1`, comme le plafond
// ══════════════════════════════════════════════════════════════════════════
test("⑤ drapeau coupé : ni plafond, ni quota de changements", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("flat_passions_v1", "0"); });
  await bootOnboarded(page, null, 1, { query: APERCU });
  await poserNPassions(page, 3);
  const etat = await page.evaluate(() => {
    archiverPassion("q_2");
    archiverPassion("q_1");
    return {
      restants: String(changementsPassionRestants()),
      atteint: quotaChangementsAtteint(),
      plafondActif: plafondPassionsActif(),
      quotaActif: quotaChangementsActif(),
      vivantes: (state.user.profiles || []).filter((p) => !p.archived).length,
    };
  });
  expect(etat.plafondActif, "le kill switch n'a pas éteint le plafond").toBe(false);
  expect(etat.quotaActif, "le kill switch n'a pas éteint le quota").toBe(false);
  expect(etat.restants).toBe("Infinity");
  expect(etat.atteint).toBe(false);
  expect(etat.vivantes).toBe(1);
});
