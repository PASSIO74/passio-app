// ============================================================================
// PRIX EN EUROS · SYSTÈME DE POINTS RETIRÉ (2026-08-29)
// ----------------------------------------------------------------------------
// Deux changements demandés le même jour, et qui se vérifient au même endroit :
//
//  ① Le prix d'un événement IRL est un prix RÉEL, en euros. Il s'affichait
//     « 12 💎 Passia » — ce qui laissait croire qu'on payait un atelier avec la
//     monnaie interne, non convertible. Le formulaire, la carte de la liste et
//     la fiche doivent dire la même chose : des euros.
//
//  ② Le système de points (⭐ étoiles, rangs, classement, « +N pts ») a été
//     retiré de l'app. Le moteur `grantReward` reste DÉFINI — une vingtaine de
//     chemins l'appellent, souvent sans garde — mais il est inerte. Le Passia,
//     lui, reste : c'est la monnaie du projet, et il n'a jamais été distribué
//     par ce barème.
//
// Ce que ce fichier NE teste pas : la boutique Passia et l'onglet Crypto, hors
// périmètre — ce sont des euros contre des Passia, ce qui n'a jamais changé.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const EVENT = {
  id: "ev_prix_test", title: "Atelier poterie du dimanche", passion: "cuisine",
  date: Date.now() + 3 * 86400000, time: "14:00", city: "Lyon",
  venue: "Atelier des Terres", price: 12, maxAttendees: 10,
  attendees: [], desc: "Tour, émaillage, cuisson.", ownerId: "u_lea",
};

async function injecter(page, ev) {
  await page.evaluate((e) => {
    state.seed.events = [e];
    state.userEvents = [];
    saveState();
    goTo("irl");
  }, ev);
  await page.waitForTimeout(900);
}

test.describe("① le prix d'un événement est en euros", () => {
  test("le formulaire demande des euros, jamais des Passia", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => openCreateEvent());
    await page.waitForTimeout(400);

    const champ = page.locator("#evPrice");
    await expect(champ).toHaveCount(1);
    const libelle = await page.evaluate(() =>
      document.getElementById("evPrice").closest("label").querySelector("span").textContent);
    expect(libelle).toContain("euros");
    expect(libelle).not.toMatch(/Passia|💎/);

    // Un tarif à la pièce (12,50 €) doit être saisissable : `step` valait 1.
    expect(await page.evaluate(() =>
      document.getElementById("evPrice").getAttribute("step"))).toBe("0.01");

    // Et le formulaire ne promet plus de points à la publication.
    const texte = await page.evaluate(() => document.getElementById("modalContent").textContent);
    expect(texte).not.toMatch(/\+\s*\d+\s*pts/);
  });

  test("le formateur couvre gratuit, entier et décimal", async ({ page }) => {
    await bootOnboarded(page);
    const rendu = await page.evaluate(() => ({
      zero: fmtEventPrice(0),
      vide: fmtEventPrice(""),
      nul: fmtEventPrice(null),
      entier: fmtEventPrice(12),
      decimal: fmtEventPrice(12.5),
      texte: fmtEventPrice("8"),
    }));
    expect(rendu.zero).toMatch(/Gratuit/);
    expect(rendu.vide).toMatch(/Gratuit/);
    expect(rendu.nul).toMatch(/Gratuit/);
    expect(rendu.entier).toContain("12");
    expect(rendu.entier).toContain("€");
    expect(rendu.decimal).toContain("12,50");
    expect(rendu.texte).toContain("8");
    // Aucune de ces sorties ne doit nommer la monnaie interne.
    Object.values(rendu).forEach(v => expect(v).not.toMatch(/Passia|💎/));
  });

  test("la carte de la liste et la fiche affichent le même prix, en euros", async ({ page }) => {
    await bootOnboarded(page);
    await injecter(page, EVENT);

    const liste = await page.evaluate(() => document.getElementById("eventList").textContent);
    expect(liste).toContain("12");
    expect(liste).toContain("€");
    expect(liste).not.toMatch(/💎\s*Passia/);

    await page.evaluate((id) => openEventDetails(id), EVENT.id);
    await page.waitForTimeout(700);
    const fiche = await page.evaluate(() => document.getElementById("eventDetailPage").textContent);
    expect(fiche).toContain("12");
    expect(fiche).toContain("€");
    expect(fiche).not.toMatch(/💎\s*Passia/);
  });

  test("un événement gratuit le dit, et ne parle pas d'euros", async ({ page }) => {
    await bootOnboarded(page);
    await injecter(page, { ...EVENT, id: "ev_gratuit", price: 0 });
    const liste = await page.evaluate(() => document.getElementById("eventList").textContent);
    expect(liste).toMatch(/Gratuit/);
  });
});

test.describe("② le système de points a quitté l'app", () => {
  test("grantReward reste défini mais ne crédite plus rien", async ({ page }) => {
    await bootOnboarded(page);
    // DÉFINIE : une vingtaine d'appelants la nomment sans garde. La retirer
    // ferait planter la publication, le commentaire et le RSVP.
    expect(await page.evaluate(() => typeof grantReward === "function")).toBe(true);

    const avant = await page.evaluate(() => ({
      tx: (state.transactions || []).length,
      passia: state.user.passia || 0,
    }));
    await page.evaluate(() => {
      ["publish_text", "event_create", "event_join", "comment", "daily"].forEach(k => grantReward(k));
    });
    const apres = await page.evaluate(() => ({
      tx: (state.transactions || []).length,
      passia: state.user.passia || 0,
      score: state.user.score,
    }));
    expect(apres.tx).toBe(avant.tx);
    expect(apres.passia).toBe(avant.passia);
    expect(apres.score).toBe(20); // la valeur injectée par le helper, jamais incrémentée
  });

  test("le Wallet ne montre plus score, rang, anneau ni classement", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => goTo("wallet"));
    await page.waitForTimeout(700);

    for (const id of ["scoreNum", "rankLabel", "nextRankText", "ringFg", "heroScore", "leaderboard"]) {
      await expect(page.locator("#" + id), "#" + id + " doit avoir disparu").toHaveCount(0);
    }
    // Le Passia, lui, reste : c'est la monnaie du projet.
    await expect(page.locator("#heroPassia")).toHaveCount(1);
    await expect(page.locator("#passiaBalance")).toHaveCount(1);

    const texte = await page.evaluate(() => document.getElementById("screen-wallet").textContent);
    expect(texte).not.toMatch(/gagne des étoiles/i);
    expect(texte).not.toMatch(/Top Passionn/i);
    expect(texte).not.toMatch(/\+\s*\d+\s*pts/);
  });

  test("le Wallet se rend sans exception alors que ses nœuds ont été retirés", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors);
    // renderWallet écrivait dans #scoreNum & co. SANS garde : chaque écriture
    // est désormais gardée. Deux rendus successifs, dont un hors écran.
    await page.evaluate(() => { renderWallet(); goTo("wallet"); renderWallet(); });
    await page.waitForTimeout(600);
    expect(errors.js, "exceptions JS pendant le rendu du Wallet").toEqual([]);
  });

  test("l'historique du Wallet garde les DÉPENSES de Passia, pas seulement les gains", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => {
      state.transactions = [
        { id: "t1", kind: "like_received", passia: 1, label: "Palier de likes reçus", at: Date.now() },
        { id: "t2", kind: "tip_reel", passia: -1, label: "Soutien à un créateur", at: Date.now() },
        { id: "t3", kind: "publish_text", pts: 10, passia: 0, label: "Post publié", at: Date.now() },
      ];
      saveState(); goTo("wallet");
    });
    await page.waitForTimeout(600);
    const tx = await page.evaluate(() => document.getElementById("txList").textContent);
    expect(tx).toContain("Palier de likes");
    expect(tx, "une dépense (-1 💎) ne doit pas être filtrée").toContain("Soutien à un créateur");
    expect(tx, "une ligne à points seuls n'a plus rien à montrer").not.toContain("Post publié");
  });

  test("aucun écran du parcours ne promet de points", async ({ page }) => {
    await bootOnboarded(page);
    for (const ecran of ["feed", "profiles", "studio", "explore", "irl", "wallet"]) {
      await page.evaluate((e) => goTo(e), ecran);
      await page.waitForTimeout(350);
      const texte = await page.evaluate((e) => {
        const el = document.getElementById("screen-" + e);
        return el ? el.textContent : "";
      }, ecran);
      expect(texte, "écran " + ecran).not.toMatch(/\+\s*\d+\s*pts\b/);
    }
  });

  test("la pastille « ⭐ N » a quitté la ligne d'identité du profil", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors);
    await page.evaluate(() => goTo("profiles"));
    await page.waitForTimeout(600);
    await expect(page.locator("#mainProfileStars")).toHaveCount(0);
    await expect(page.locator("#profileStarsScore")).toHaveCount(0);
    // La pastille Passia, elle, est toujours là (masquée par UI-6, mais présente).
    await expect(page.locator("#topPassia")).toHaveCount(1);
    expect(errors.js).toEqual([]);
  });
});
