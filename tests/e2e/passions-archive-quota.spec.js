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
const { bootOnboarded, sansDonneesDistantes } = require("./app-helper");
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

  test("② bis — le bouton dit « Réactiver » dans les deux cas, et il AGIT", async ({ page }) => {
    // ⚠️ RÉÉCRIT LE 2026-09-03. Le bouton portait trois libellés selon l'état
    // (« Restaurer » / « Échanger » / « Indisponible ») : il faisait porter au
    // MOT l'explication de la règle de quota, que l'utilisateur devait
    // reconstituer en voyant le libellé changer sous ses yeux. Un seul libellé
    // désormais — « Réactiver », le geste — et la règle écrite en toutes lettres
    // sous la liste quand elle bloque. Ce que ce cas garde de sa version d'avant :
    // le bouton ne ment jamais sur son effet, donc il n'est ACTIF que quand il
    // agit vraiment.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    await page.evaluate(() => { goTo("profiles"); openPassionManager(); archiverPassion("q_2"); });
    await page.waitForTimeout(400);
    const sousLePlafond = page.locator('#passionArchiveBox [data-v8-restaurer="q_2"]');
    await expect(sousLePlafond).toHaveText("Réactiver");
    await expect(sousLePlafond).toHaveAttribute("data-v8-reactivation", "ouverte");
    await expect(sousLePlafond).toBeEnabled();

    // Au plafond avec un changement en réserve : même mot, et il agit encore —
    // `restaurerPassion` propose alors l'échange.
    await page.evaluate(() => { ajouterPassionAuCompte("voyage", ""); renderProfilesScreen(); });
    await page.waitForTimeout(400);
    const auPlafond = page.locator('#passionArchiveBox [data-v8-restaurer="q_2"]');
    await expect(auPlafond).toHaveText("Réactiver");
    await expect(auPlafond).toHaveAttribute("data-v8-reactivation", "ouverte");
    await expect(auPlafond).toBeEnabled();
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

  test("③ ter — le compteur est affiché sur la page « Mes passions »", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    await page.evaluate(() => { goTo("profiles"); openPassionManager(); });
    await page.waitForTimeout(400);
    // ⚠️ LES MOTS ONT CHANGÉ LE 2026-09-03, PAS LA SOURCE. Le nœud reste
    // `#profilesQuotaSub` et le nombre vient toujours de
    // `changementsPassionRestants()` ; il se lit désormais « N changements de
    // passion disponibles sur 3 », et bascule en ALERTE quand il tombe à zéro.
    const ligne = page.locator("#profilesQuotaSub [data-passion-compteur]");
    await expect(ligne).toContainText("3 changements de passion disponibles");
    await expect(page.locator("#profilesQuotaSub")).toHaveAttribute("data-passion-quota", "disponible");
    // Tant qu'un changement reste, AUCUNE alerte : une alerte permanente
    // n'alerte plus de rien.
    await expect(page.locator("#profilesQuotaSub.est-alerte")).toHaveCount(0);
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
    // ⚠️ ISOLATION DES DONNÉES DISTANTES — POSÉE ICI PARCE QUE CETTE SUITE
    // NAVIGUE ELLE-MÊME. `bootOnboarded` la pose par défaut, mais sa portée est
    // L'APPEL, pas le fichier : un `page.goto` maison garde son chemin exposé, et
    // le verdict du test dépend alors du CONTENU DE LA PRODUCTION. C'est ce qui a
    // rendu `main` rouge six fois en quatre jours et fait sauter autant de
    // déploiements. Verrou mécanique : `scripts/audit-tests-isolation.js`.
    await sansDonneesDistantes(page);
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

// ══════════════════════════════════════════════════════════════════════════
// ⑥ LES PORTES OUBLIÉES — trouvées par audit adversarial avant mise en ligne
// ──────────────────────────────────────────────────────────────────────────
// Le plafond a été posé le 2026-09-01 sur `ajouterPassionAuCompte`, mais DEUX
// autres chemins écrivaient dans l'ensemble vivant sans jamais y passer. Un
// plafond qui ne tient qu'à la porte qu'on avait en tête ne tient pas.
// ══════════════════════════════════════════════════════════════════════════
test.describe("les portes oubliées du plafond", () => {
  test("⑥ « + Créer profil » (page d'une passion) respecte le plafond", async ({ page }) => {
    // ⚠️ `quickCreateProfile` (app-07) poussait DIRECTEMENT dans
    // `state.user.profiles` : ni plafond, ni quota, ni journal, ni dédup avec
    // une entrée archivée. Depuis la page d'une passion, « + Créer profil »
    // ouvrait une quatrième, une cinquième, une dixième passion vivante.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    const etat = await page.evaluate(() => {
      quickCreateProfile("moto");
      return {
        vivantes: (state.user.profiles || []).filter((p) => !p.archived).length,
        fenetre: ((document.getElementById("modalContent") || {}).textContent || "").includes("Trois passions offertes"),
      };
    });
    expect(etat.vivantes, "une quatrième passion est passée par la page d'une passion").toBe(3);
    expect(etat.fenetre, "le refus est silencieux : rien n'explique pourquoi").toBe(true);
  });

  test("⑥ bis — sous le plafond, « + Créer profil » marche toujours", async ({ page }) => {
    // Un correctif qui ferme la porte pour tout le monde n'est pas un correctif.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 2);
    const etat = await page.evaluate(() => {
      quickCreateProfile("moto");
      const active = (state.user.profiles || []).find((p) => p.id === state.user.currentProfileId);
      return {
        vivantes: (state.user.profiles || []).filter((p) => !p.archived).length,
        active: active && active.passion,
      };
    });
    expect(etat.vivantes).toBe(3);
    expect(etat.active, "la passion créée ne devient pas celle du Studio").toBe("moto");
  });

  test("⑥ ter — « + Créer profil » sur une ARCHIVE la restaure, sans doublon", async ({ page }) => {
    // Avant : elle en créait une SECONDE entrée, que la fusion défensive d'app-02
    // dédupliquait ensuite en silence — en perdant la photo et la bio de l'entrée
    // d'origine.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    const etat = await page.evaluate(() => {
      archiverPassion("q_2");                    // « sport » part en archive
      quickCreateProfile("sport");               // on la reprend par cette porte
      const tous = (state.user.profiles || []).filter((p) => p.passion === "sport");
      return { entrees: tous.length, vivantes: tous.filter((p) => !p.archived).length };
    });
    expect(etat.entrees, "la passion a été recréée en doublon au lieu d'être restaurée").toBe(1);
    expect(etat.vivantes).toBe(1);
  });

  test("⑦ Studio : une passion REFUSÉE n'est jamais écrite dans #postPassion", async ({ page }) => {
    // ⚠️ `#postPassion` est la SEULE source de vérité de `publishPost`. Le
    // sélecteur écrivait `sel.value = id` AVANT d'appeler `ajouterPassionAuCompte` :
    // au plafond, l'ajout était refusé (fenêtre payante) mais le `<select>`
    // pointait déjà la passion refusée — on publiait dans une quatrième passion
    // qu'on ne possède pas, EN SILENCE. C'est le piège de `studioType` (UI-6).
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    const etat = await page.evaluate(() => {
      const sel = document.getElementById("postPassion");
      if (!sel) return { absent: true };
      const avant = sel.value;
      // On rejoue EXACTEMENT ce que fait `onValider` du sélecteur (app/passions-flat-ui).
      const id = "moto-enduro";
      if (!Array.prototype.some.call(sel.options, (o) => o.value === id)) {
        const o = document.createElement("option");
        o.value = id; o.textContent = "Enduro"; sel.appendChild(o);
      }
      ajouterPassionAuCompte(id, "");
      const possedee = (state.user.profiles || []).some((x) => x.passion === id && !x.archived);
      if (!possedee) {
        const orph = Array.prototype.filter.call(sel.options, (o) => o.value === id)[0];
        if (orph && orph.parentNode === sel) sel.removeChild(orph);
      } else { sel.value = id; }
      return {
        avant, apres: sel.value, possedee,
        optionRestante: Array.prototype.some.call(sel.options, (o) => o.value === id),
      };
    });
    expect(etat.absent).toBeFalsy();
    expect(etat.possedee, "le plafond a laissé passer la passion").toBe(false);
    expect(etat.apres, "le Studio publierait dans une passion refusée").toBe(etat.avant);
    expect(etat.optionRestante, "une passion non possédée reste proposée dans la liste").toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ⑧ LE MUR NE DOIT PAS ÊTRE UNE BOUCLE
// ══════════════════════════════════════════════════════════════════════════
test("⑧ quota épuisé : le bouton ne promet pas un échange impossible, et rien ne boucle", async ({ page }) => {
  // ⚠️ « Échanger » au plafond ALORS QUE LE QUOTA EST ÉPUISÉ ouvrait une fenêtre
  // payante SANS liste d'échange, dont l'unique action (« Gérer mes passions »)
  // ramenait au panneau — où le même bouton attendait. Un mur est acceptable ;
  // un mur qui se fait passer pour une porte et vous renvoie devant lui-même,
  // non. C'est la forme même du défaut que ce lot existe pour corriger.
  await bootOnboarded(page, null, 1, { query: APERCU });
  await poserNPassions(page, 3);
  const etat = await page.evaluate(() => {
    archiverPassion("q_2"); ajouterPassionAuCompte("voyage", "");
    archiverPassion("q_1"); ajouterPassionAuCompte("moto", "");
    archiverPassion("q_0"); ajouterPassionAuCompte("danse", "");
    goTo("profiles"); openPassionManager(); renderProfilesScreen();
    const btn = document.querySelector("#passionArchiveBox .v8-switch-go");
    const motif = document.querySelector("#passionArchiveBox [data-passion-reactivation]");
    return {
      restants: String(changementsPassionRestants()),
      vivantes: (state.user.profiles || []).filter((p) => !p.archived).length,
      libelle: btn && btn.textContent,
      desarme: !!(btn && btn.disabled),
      motif: motif ? motif.textContent : "",
    };
  });
  expect(etat.restants).toBe("0");
  expect(etat.vivantes).toBe(3);
  // ⚠️ 2026-09-03 : le mot ne porte plus l'explication, l'ÉTAT du bouton la
  // porte. « Réactiver » désarmé (`disabled`, donc son `onclick` ne part pas)
  // plus le motif écrit sous la liste — au lieu d'un libellé « Indisponible »
  // qu'il fallait interpréter.
  expect(etat.libelle, "le bouton ne dit plus son geste").toBe("Réactiver");
  expect(etat.desarme, "le bouton promet un échange que le quota interdit").toBe(true);
  expect(etat.motif, "rien ne dit POURQUOI la réactivation est impossible")
    .toContain("Réactivation possible lorsqu'un changement sera disponible");

  const fenetre = await page.evaluate(() => {
    const arch = (state.user.profiles || []).find((p) => p.archived);
    restaurerPassion(arch.id);
    const m = document.getElementById("modalContent");
    return {
      dit: (m.textContent || "").includes("changements de passion"),
      boutonGerer: !!m.querySelector('[data-tel="passion_paywall_gerer"]'),
      echanges: m.querySelectorAll("[data-passion-echange]").length,
    };
  });
  expect(fenetre.dit, "la fenêtre ne dit pas POURQUOI c'est bloqué").toBe(true);
  expect(fenetre.boutonGerer, "la fenêtre renvoie au panneau où le geste refusé attend — c'est la boucle").toBe(false);
  expect(fenetre.echanges).toBe(0);
});

// ══════════════════════════════════════════════════════════════════════════
// ⑨ LA DISCOVERABILITÉ — la liste existe, encore faut-il savoir qu'elle existe
// ══════════════════════════════════════════════════════════════════════════
test("⑨ la SEULE porte visible vers la gestion porte le compte d'archives", async ({ page }) => {
  // ⚠️ `#passionArchiveBox` rend la liste en clair, mais elle vit dans
  // `#passionManager`, `hidden` par défaut : après un rechargement, rien à
  // l'écran ne disait qu'on possède encore une passion rangée. La liste
  // existait, rien n'invitait à l'ouvrir — la moitié restante du défaut.
  await bootOnboarded(page, null, 1, { query: APERCU });
  await poserNPassions(page, 3);
  const libelles = await page.evaluate(() => {
    archiverPassion("q_2");
    let vus = [];
    const vrai = window._profileDotsOpen;
    window._profileDotsOpen = (ev, items) => { vus = items.map((i) => i.label); };
    openMainProfileMenu({ stopPropagation() {}, preventDefault() {}, currentTarget: document.body });
    window._profileDotsOpen = vrai;
    return vus.filter((l) => /passion/i.test(l));
  });
  expect(libelles.join(" "), "rien n'annonce l'archive depuis l'écran du profil").toContain("1 archivée");
});

// ══════════════════════════════════════════════════════════════════════════
// ⑩ LA FUSION MULTI-APPAREILS — la dette assumée à la livraison, refermée
// ──────────────────────────────────────────────────────────────────────────
// Livré le 2026-09-02 avec sa dette écrite noir sur blanc : « la fusion
// défensive de `supaLoadUserState` réinjecte les profils locaux absents du
// serveur sans consulter le plafond ». Mesuré le lendemain sur le code en
// production : deux appareils portant chacun TROIS passions DIFFÉRENTES
// convergeaient vers SIX vivantes, le plafond annonçant « 0 place restante »
// pendant que le compte en possédait six. Aucun geste volontaire n'était
// requis — un second téléphone suffisait.
//
// ⚠️ CES TESTS APPELLENT LA FONCTION RÉELLE `reinjecterProfilsLocauxBornes`
// (app-02), pas une copie de ses règles. Une copie ne prouverait que sa propre
// cohérence — c'est exactement ce que `audit-tests-creux.js` traque, et la
// raison pour laquelle `restaurerPassionActiveApresFusion` avait déjà été
// extraite en fonction nommée.
// ══════════════════════════════════════════════════════════════════════════
test.describe("la fusion multi-appareils", () => {
  // Fabrique des profils sans dépendre de l'état de la page.
  const PROFILS = (ids, archivees) => ids.map((pid, i) => ({
    id: (archivees ? "a_" : "x_") + pid, name: "QA", passion: pid,
    emoji: "✨", bio: "", color: "#8b5cf6", createdAt: i, archived: !!archivees,
  }));

  test("⑩ deux appareils, trois passions différentes chacun : le plafond tient", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    const r = await page.evaluate((f) => {
      const mk = eval(f);
      const fusion = reinjecterProfilsLocauxBornes(
        mk(["cuisine", "voyage", "moto"]),      // ce que le serveur porte
        mk(["musique", "photo", "sport"])       // ce que cet appareil ajoute
      );
      return {
        vivantes: fusion.filter((p) => !p.archived).map((p) => p.passion),
        archivees: fusion.filter((p) => p.archived).map((p) => p.passion),
        total: fusion.length,
      };
    }, PROFILS.toString());
    expect(r.vivantes.length, "la fusion a dépassé le plafond").toBe(3);
    // L'état SERVEUR fait foi : c'est lui qui reste vivant.
    expect(r.vivantes.sort()).toEqual(["cuisine", "moto", "voyage"]);
    // ⚠️ RIEN N'EST SUPPRIMÉ : les six entrées sont là, trois rangées.
    expect(r.total, "des passions ont été perdues dans la fusion").toBe(6);
    expect(r.archivees.sort()).toEqual(["musique", "photo", "sport"]);
  });

  test("⑩ bis — UN COMPTE QUI PORTE DÉJÀ PLUS DE TROIS PASSIONS N'EST PAS RÉTROGRADÉ", async ({ page }) => {
    // ⚠️ LE TEST QUI JUSTIFIE TOUTE LA FORME DU CORRECTIF. Le plafond date du
    // 2026-09-01 ; des comptes de production le précèdent et portent
    // légitimement plus de trois passions. Archiver « le surplus » les aurait
    // rétrogradés en silence, à leur prochaine synchronisation — c'est
    // précisément pourquoi le défaut avait été livré non corrigé plutôt que
    // corrigé de travers. Seules les entrées que la fusion AJOUTE sont bornées.
    await bootOnboarded(page, null, 1, { query: APERCU });
    const r = await page.evaluate((f) => {
      const mk = eval(f);
      const fusion = reinjecterProfilsLocauxBornes(
        mk(["musique", "photo", "sport", "cuisine", "voyage"]),   // 5 vivantes côté serveur
        mk(["moto"])                                              // une réinjection locale
      );
      return {
        serveurIntact: fusion.filter((p) => !p.archived).length,
        motoArchivee: fusion.some((p) => p.passion === "moto" && p.archived),
      };
    }, PROFILS.toString());
    expect(r.serveurIntact, "un compte antérieur au plafond a été rétrogradé").toBe(5);
    expect(r.motoArchivee, "la réinjection n'a pas été bornée").toBe(true);
  });

  test("⑩ ter — sous le plafond, la réinjection passe entière", async ({ page }) => {
    // Un correctif qui borne tout le monde n'est pas un correctif : la fusion
    // défensive existe pour une bonne raison (des passions créées entre la
    // dernière synchronisation et la fermeture).
    await bootOnboarded(page, null, 1, { query: APERCU });
    const r = await page.evaluate((f) => {
      const mk = eval(f);
      const fusion = reinjecterProfilsLocauxBornes(mk(["cuisine"]), mk(["musique", "photo"]));
      return { vivantes: fusion.filter((p) => !p.archived).length, archivees: fusion.filter((p) => p.archived).length };
    }, PROFILS.toString());
    expect(r.vivantes).toBe(3);
    expect(r.archivees, "une passion a été rangée alors qu'il restait de la place").toBe(0);
  });

  test("⑩ quater — une locale DÉJÀ archivée le reste, et ne consomme pas de place", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    const r = await page.evaluate((f) => {
      const mk = eval(f);
      const fusion = reinjecterProfilsLocauxBornes(
        mk(["cuisine"]),
        mk(["musique"]).concat(mk(["photo"], true))   // « photo » arrive déjà rangée
      );
      return {
        vivantes: fusion.filter((p) => !p.archived).map((p) => p.passion).sort(),
        archivees: fusion.filter((p) => p.archived).map((p) => p.passion),
      };
    }, PROFILS.toString());
    expect(r.vivantes).toEqual(["cuisine", "musique"]);
    expect(r.archivees, "une archive a consommé une place ou a été réveillée").toEqual(["photo"]);
  });

  test("⑩ quinquies — la fusion ne FACTURE rien : le compte n'a rien demandé", async ({ page }) => {
    // ⚠️ Ranger une passion à la fusion n'est pas un geste d'utilisateur. Si
    // c'était inscrit au journal, un simple changement de téléphone débiterait
    // des changements — et le compte perdrait son quota sans avoir rien fait.
    await bootOnboarded(page, null, 1, { query: APERCU });
    await poserNPassions(page, 3);
    const r = await page.evaluate((f) => {
      const mk = eval(f);
      const avant = String(changementsPassionRestants());
      reinjecterProfilsLocauxBornes(mk(["cuisine", "voyage", "moto"]), mk(["musique", "photo", "sport"]));
      return { avant, apres: String(changementsPassionRestants()),
               journal: ((state.user.passionChanges || {}).entries || []).length };
    }, PROFILS.toString());
    expect(r.avant).toBe("3");
    expect(r.apres, "la fusion a débité des changements").toBe("3");
    expect(r.journal, "la fusion a écrit au journal").toBe(0);
  });

  test("⑩ sexies — kill switch : drapeau coupé, la fusion ne range plus rien", async ({ page }) => {
    // Un drapeau coupé ne doit JAMAIS ranger une passion : il ne sait qu'enlever.
    await page.addInitScript(() => { localStorage.setItem("flat_passions_v1", "0"); });
    await bootOnboarded(page, null, 1, { query: APERCU });
    const r = await page.evaluate((f) => {
      const mk = eval(f);
      const fusion = reinjecterProfilsLocauxBornes(mk(["cuisine", "voyage", "moto"]), mk(["musique", "photo", "sport"]));
      return { vivantes: fusion.filter((p) => !p.archived).length, archivees: fusion.filter((p) => p.archived).length };
    }, PROFILS.toString());
    expect(r.vivantes).toBe(6);
    expect(r.archivees, "le kill switch n'a pas désarmé le bornage").toBe(0);
  });
});
