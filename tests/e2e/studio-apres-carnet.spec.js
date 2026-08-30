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

// ⚠️ DEUX mesures différentes, et c'est volontaire.
//   · `#postText` : on mesure la VISIBILITÉ réelle — c'est le symptôme vécu,
//     « le composeur n'a plus de champ de saisie ».
//   · `#fieldPassion` / `#fieldMood` : on mesure l'OVERRIDE EN LIGNE. Sous le
//     lot UI-6 ces deux champs sont normalement repliés (la passion derrière
//     « Modifier », le mood dans le <details> « Options ») : ils sont donc
//     invisibles même quand tout va bien. Ce que l'éditeur de carnet a posé, et
//     qu'il doit retirer, c'est le `style="display:none"` — le rendre laisse
//     UI-6 décider, ce qui est exactement le comportement attendu.
async function etatChamps(page) {
  return page.evaluate(() => {
    const champ = document.querySelector("#postText");
    const boite = champ && champ.closest(".field");
    const inline = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.style.display : null;
    };
    return {
      texteVisible: boite ? !!(boite.offsetWidth || boite.offsetHeight || boite.getClientRects().length) : null,
      texteInline: boite ? boite.style.display : null,
      passionInline: inline("#fieldPassion"),
      moodInline: inline("#fieldMood"),
    };
  });
}

async function ouvrirStudio(page) {
  await page.evaluate(() => goTo("studio"));
  await page.waitForTimeout(400);
}

test.describe("Studio après un passage par l'éditeur de carnet", () => {
  test("fermer l'éditeur rend au Studio ses champs", async ({ page }) => {
    await bootOnboarded(page);
    await ouvrirStudio(page);

    const avant = await etatChamps(page);
    expect(avant.texteVisible, "le champ texte doit être visible au départ").toBe(true);

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

    const apres = await etatChamps(page);
    expect(apres.texteVisible, "le champ texte doit être revenu").toBe(true);
    expect(apres.passionInline, "l'override du carnet doit être levé").not.toBe("none");
    expect(apres.moodInline).not.toBe("none");
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

    const apres = await etatChamps(page);
    expect(apres.texteVisible).toBe(true);
    expect(apres.passionInline).not.toBe("none");
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
