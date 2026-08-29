// ============================================================================
// LE STUDIO SURVIT À L'ÉDITEUR DE CARNET (2026-08-29)
// ----------------------------------------------------------------------------
// `activateStudioVlog()` (app-06) masque trois champs du Studio — le texte
// libre, la passion et le mood — parce que le carnet ne les utilise pas. Rien
// ne les rendait :
//
//   • `closeCarnetEditor()` remettait `studioType` à "text" et s'arrêtait là ;
//   • le SEUL chemin de restauration était le clic sur un onglet de format…
//     que le lot UI-6 a justement retiré de l'écran (« le composeur ne demande
//     plus de choisir un format »).
//
// Conséquence mesurée : ouvrir l'éditeur de carnet UNE fois laissait le Studio
// sans champ de saisie — définitivement, jusqu'au rechargement complet de la
// page. Aucune erreur, aucun message : un écran muet.
//
// Ce fichier tient les deux sorties : la porte (`closeCarnetEditor`) et le
// filet (`renderStudio`, pour qui quitte l'écran CDV par la navigation).
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const CHAMPS = ["#postText", "#fieldPassion", "#fieldMood"];

async function visibilites(page) {
  return page.evaluate((sels) => {
    const out = {};
    sels.forEach((s) => {
      const el = document.querySelector(s);
      const cible = s === "#postText" ? (el && el.closest(".field")) : el;
      out[s] = cible ? !!(cible.offsetWidth || cible.offsetHeight || cible.getClientRects().length) : null;
    });
    return out;
  }, CHAMPS);
}

async function ouvrirStudio(page) {
  await page.evaluate(() => goTo("studio"));
  await page.waitForTimeout(400);
}

test.describe("Studio après un passage par l'éditeur de carnet", () => {
  test("fermer l'éditeur rend au Studio ses champs", async ({ page }) => {
    await bootOnboarded(page);
    await ouvrirStudio(page);

    const avant = await visibilites(page);
    expect(avant["#postText"], "le champ texte doit être visible au départ").toBe(true);

    await page.evaluate(() => activateStudioVlog());
    await page.waitForTimeout(300);
    // L'éditeur de carnet a bien masqué les champs (sinon le test ne prouve rien).
    await ouvrirStudio(page);
    const pendant = await page.evaluate(() => {
      const f = document.querySelector("#postText").closest(".field");
      return f.style.display;
    });
    expect(pendant, "l'éditeur ouvert doit bien masquer le champ").toBe("none");

    await page.evaluate(() => { goTo("cdv"); closeCarnetEditor(); });
    await page.waitForTimeout(300);
    await ouvrirStudio(page);

    const apres = await visibilites(page);
    expect(apres["#postText"], "le champ texte doit être revenu").toBe(true);
    expect(apres["#fieldPassion"]).toBe(true);
    expect(await page.evaluate(() => studioType)).not.toBe("vlog");
  });

  test("quitter l'écran CDV sans fermer l'éditeur répare quand même le Studio", async ({ page }) => {
    await bootOnboarded(page);
    await ouvrirStudio(page);

    await page.evaluate(() => activateStudioVlog());
    await page.waitForTimeout(300);
    // Sortie par la NAVIGATION : `closeCarnetEditor` n'est jamais appelé.
    await page.evaluate(() => {
      const ed = document.getElementById("cdvEditor");
      if (ed) ed.style.display = "none";
      goTo("feed");
    });
    await page.waitForTimeout(300);
    await ouvrirStudio(page);

    const apres = await visibilites(page);
    expect(apres["#postText"]).toBe(true);
    expect(apres["#fieldPassion"]).toBe(true);
    // Et le type de publication n'est plus « carnet » : sans cela, publier
    // depuis le Studio créerait un carnet vide.
    expect(await page.evaluate(() => studioType)).not.toBe("vlog");
  });

  test("tant que l'éditeur de carnet est ouvert, les champs restent masqués", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => activateStudioVlog());
    await page.waitForTimeout(300);

    const r = await page.evaluate(() => {
      const ed = document.getElementById("cdvEditor");
      renderStudio();  // le filet ne doit PAS s'appliquer ici
      return {
        editeurOuvert: ed ? ed.style.display : null,
        type: studioType,
        texte: document.querySelector("#postText").closest(".field").style.display,
      };
    });
    expect(r.editeurOuvert).toBe("block");
    expect(r.type).toBe("vlog");
    expect(r.texte).toBe("none");
  });
});
