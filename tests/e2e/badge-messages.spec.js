// Messages non lus — l'indicateur doit exister quelque part.
//
// LE DÉFAUT. Le lot UI-7 §4 a retiré l'icône Messages du bandeau supérieur
// (« Messages est déjà une destination de la barre du bas »), en laissant
// `#msgDot` dans le DOM mais MASQUÉ, pour que les écritures existantes ne
// tombent pas dans le vide. Sauf que la barre du bas — ni l'historique, ni la
// V2 — n'a jamais porté de compteur. Résultat : `renderMsgBadge()` calculait le
// bon nombre et l'écrivait dans un élément invisible. Plus aucune surface de
// l'application n'indiquait un message non lu.
//
// Ce que cette suite exige : la pastille est sur l'entrée « Messages » de la
// barre réellement affichée, elle disparaît à zéro, elle plafonne à « 9+ », et
// elle survit au kill switch d'UI-1 (barre historique) — un indicateur qui
// disparaît avec un lot n'est pas un indicateur.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function poser(page, nonLus) {
  await page.evaluate((n) => {
    const convs = getConversations();
    convs.length = 0;
    if (n > 0) convs.push({
      id: "conv_badge", userId: "u_autre", userName: "Autre", userEmoji: "✨",
      userColor: "#7c3aed", passion: "musique", unread: n, lastAt: Date.now(),
      isGroup: false, messages: [],
    });
    renderMsgBadge();
  }, nonLus);
}

const pastille = (page) => page.locator('#appNavV2 [data-v2-key="messages"] .nav-msg-badge');

test.describe("Badge des messages non lus", () => {
  test("trois messages non lus : la pastille est sur la barre du bas, et elle le dit", async ({ page }) => {
    await bootOnboarded(page);
    await poser(page, 3);

    await expect(pastille(page)).toHaveCount(1);
    await expect(pastille(page)).toHaveText("3");
    // Le compte est aussi porté par le libellé accessible, pas seulement par la couleur.
    await expect(page.locator('#appNavV2 [data-v2-key="messages"]'))
      .toHaveAttribute("aria-label", "Messages, 3 non lus");
  });

  test("aucun message non lu : aucune pastille, et le libellé redevient neutre", async ({ page }) => {
    await bootOnboarded(page);
    await poser(page, 3);
    await expect(pastille(page)).toHaveCount(1);

    await poser(page, 0);
    await expect(pastille(page)).toHaveCount(0);
    await expect(page.locator('#appNavV2 [data-v2-key="messages"]'))
      .toHaveAttribute("aria-label", "Messages");
  });

  test("au-delà de neuf, la pastille plafonne à « 9+ »", async ({ page }) => {
    await bootOnboarded(page);
    await poser(page, 42);
    await expect(pastille(page)).toHaveText("9+");
  });

  test("kill switch UI-1 : Messages reste ATTEIGNABLE, et son compteur visible", async ({ page }) => {
    // ⚠️ Le vrai défaut trouvé en écrivant ce test : la barre du bas historique
    // n'a JAMAIS porté d'entrée Messages, et le lot UI-7 avait RETIRÉ l'icône du
    // bandeau supérieur au lieu de la masquer. Couper UI-1 laissait donc
    // l'application sans aucune porte vers Messages — un kill switch doit rendre
    // l'état d'avant, pas un état inédit.
    await page.addInitScript(() => localStorage.setItem("passio_ui_v2", "0"));
    await bootOnboarded(page);
    await poser(page, 2);

    await expect(page.locator("#appNavV2")).toHaveCount(0);
    const porte = page.locator("#topbarMessages");
    await expect(porte).toBeVisible();
    await expect(page.locator("#topbarMessages #msgDot")).toHaveText("2");

    await porte.click();
    await expect(page.locator("#screen-messages")).toHaveClass(/active/);
  });

  test("URL normale : l'icône Messages du bandeau est masquée, jamais retirée", async ({ page }) => {
    // UI-7 §4 tient : une seule porte à l'écran, celle de la barre du bas.
    await bootOnboarded(page);
    await expect(page.locator("#topbarMessages")).toHaveCount(1);
    await expect(page.locator("#topbarMessages")).toBeHidden();
  });

  test("la pastille historique du bandeau supérieur continue d'être écrite", async ({ page }) => {
    // #msgDot est masquée par UI-7 mais reste alimentée : son kill switch la rend,
    // et plusieurs chemins l'allument. La réparation ne doit pas la débrancher.
    await bootOnboarded(page);
    await poser(page, 5);
    expect(await page.evaluate(() => document.getElementById("msgDot").textContent)).toBe("5");
  });
});
