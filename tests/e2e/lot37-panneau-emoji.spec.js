// ═══════════════════════════════════════════════════════════════════════════
// LOT-37 (audit UX/UI du 2026-11-10, MSG-C70) — PANNEAU EMOJI DE LA MESSAGERIE
//   ① aucune case n'est un demi-caractère ; huit colonnes de cases de 44 px ;
//      plus de bande de catégories vide ;
//   ② le panneau reste ouvert entre deux emojis, le curseur suit le texte ;
//   ③ l'onglet actif est à la couleur d'accent et annoncé.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const AUTRE = "a1b2c3d4-0000-4000-8000-00000000c837";

async function ouvrir(page) {
  await bootOnboarded(page);
  await page.evaluate((autre) => {
    conversationsState = [{ id: "c_l37", userId: autre, userName: "Léa", lastAt: Date.now(), messages: [] }];
    openConversation("c_l37");
  }, AUTRE);
  await page.waitForTimeout(300);
  await page.evaluate(() => toggleEmojiPanel());
  await expect(page.locator("#convEmojiPanel")).toHaveClass(/open/);
}

test("① des emojis entiers, huit colonnes de 44 px, pas de bande vide", async ({ page }) => {
  await ouvrir(page);
  const r = await page.evaluate(() => {
    const cases = [...document.querySelectorAll("#emojiGrid .emoji-item")];
    const casses = cases.filter((c) => /�|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(c.textContent));
    const tops = new Set(cases.slice(0, 16).map((c) => Math.round(c.getBoundingClientRect().top)));
    const premiere = cases.slice(0, 16).filter((c) => Math.round(c.getBoundingClientRect().top) === Math.min(...tops)).length;
    const b = cases[0].getBoundingClientRect();
    return { n: cases.length, casses: casses.length, colonnes: premiere, h: b.height, w: b.width, bande: !!document.getElementById("emojiCategoriesBar"), bouton: cases[0].tagName };
  });
  expect(r.n).toBeGreaterThan(100);
  expect(r.casses).toBe(0);
  expect(r.colonnes).toBe(8);
  expect(r.h).toBeGreaterThanOrEqual(44);
  expect(r.w).toBeGreaterThanOrEqual(40);
  expect(r.bande).toBe(false);
  expect(r.bouton).toBe("BUTTON");
});

test("② le panneau reste ouvert ; le curseur se place après chaque emoji", async ({ page }) => {
  await ouvrir(page);
  const cases = page.locator("#emojiGrid .emoji-item");
  await cases.nth(0).click();
  await expect(page.locator("#convEmojiPanel")).toHaveClass(/open/);
  await cases.nth(1).click();
  await expect(page.locator("#convEmojiPanel")).toHaveClass(/open/);
  const r = await page.evaluate(() => {
    const i = document.getElementById("convFpInput");
    const cs = [...document.querySelectorAll("#emojiGrid .emoji-item")];
    return { v: i.value, attendu: cs[0].textContent + cs[1].textContent, curseur: i.selectionStart, longueur: i.value.length };
  });
  expect(r.v).toBe(r.attendu);
  expect(r.curseur).toBe(r.longueur);
});

test("③ onglets : couleur d'accent, état annoncé", async ({ page }) => {
  await ouvrir(page);
  const onglets = page.locator("#emojiTopBar [role=tab]");
  await expect(onglets).toHaveCount(2);
  await onglets.nth(1).click();
  const r = await page.evaluate(() => {
    const [e, g] = document.querySelectorAll("#emojiTopBar [role=tab]");
    const sonde = document.createElement("div");
    sonde.style.background = "var(--accent)"; document.body.appendChild(sonde);
    const accent = getComputedStyle(sonde).backgroundColor; sonde.remove();
    return { e: e.getAttribute("aria-selected"), g: g.getAttribute("aria-selected"), fond: getComputedStyle(g).backgroundColor, accent, h: g.getBoundingClientRect().height };
  });
  expect(r.e).toBe("false");
  expect(r.g).toBe("true");
  expect(r.fond).toBe(r.accent);
  expect(r.h).toBeGreaterThanOrEqual(44);
});
