// ═══════════════════════════════════════════════════════════════════════════
// LOT-40 (audit UX/UI du 2026-11-10, MSG-C71) — UN GIF SE MONTRE AVANT DE PARTIR
// Toucher une vignette du panneau GIF de la messagerie l'envoyait aussitôt ; il
// est maintenant montré (« Envoyer ce GIF ? »). « Annuler » n'envoie rien et
// rouvre le panneau ; « Envoyer » le fait partir, une fois.
// Compte de démonstration local ; GIF et envoi simulés : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const AUTRE = "a1b2c3d4-0000-4000-8000-00000000c840";
const GIF = "https://static.klipy.com/ii/banc/l40.gif";

test("toucher un GIF l'aperçoit ; Annuler n'envoie rien ; Envoyer l'envoie une fois", async ({ page }) => {
  await page.route("**/static.klipy.com/**", (route) => route.fulfill({ status: 200, contentType: "image/gif",
    body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") }));
  await bootOnboarded(page);
  await page.evaluate(({ autre, gif }) => {
    conversationsState = [{ id: "c_l40", userId: autre, userName: "Léa", lastAt: Date.now(), messages: [] }];
    openConversation("c_l40");
    window.__envois = [];
    window._sendGif = (u) => window.__envois.push(u);
    window.passioFetchGifs = async () => [gif];
    const p = document.getElementById("convEmojiPanel");
    p._gifFilled = true;
    toggleEmojiPanel();
    switchEmojiTab("gif", document.querySelectorAll("#emojiTopBar [role=tab]")[1]);
    window._fillEmojiGifGrid("");
  }, { autre: AUTRE, gif: GIF });
  const vignette = page.locator("#gifGrid img").first();
  await expect(vignette).toHaveCount(1);

  await vignette.click();
  await expect(page.locator(".modal-title", { hasText: "Envoyer ce GIF ?" })).toBeVisible();
  await expect(page.locator("#pjApercuImg")).toHaveAttribute("src", GIF);
  await expect(page.locator("#pjApercuImg")).toHaveAttribute("alt", "GIF à envoyer");
  expect(await page.evaluate(() => window.__envois.length), "rien ne part au toucher").toBe(0);

  await page.locator("#pjApercuAnnuler").click();
  expect(await page.evaluate(() => window.__envois.length), "Annuler n'envoie rien").toBe(0);
  await expect(page.locator("#convEmojiPanel")).toHaveClass(/open/);

  await page.locator("#gifGrid img").first().click();
  await page.locator("#pjApercuEnvoyer").click();
  expect(await page.evaluate(() => window.__envois)).toEqual([GIF]);
});

test("MSG-C86 : une citation d'un message ancien charge les pages et y mène", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate((autre) => {
    const t0 = Date.now() - 200 * 60000;
    const msgs = Array.from({ length: 130 }, (_, i) => ({ id: "m40_" + i, from: i % 2 ? autre : "me", text: "message " + i, at: t0 + i * 60000 }));
    conversationsState = [{ id: "c_l40b", userId: autre, userName: "Léa", lastAt: Date.now(), messages: msgs }];
    openConversation("c_l40b");
    const avant = !!document.querySelector('.conv-bubble-wrap[data-mid="m40_3"]');
    window.__toasts = []; const t = window.toast; window.toast = (m) => window.__toasts.push(String(m));
    _jumpToMsg("m40_3");
    const apres = !!document.querySelector('.conv-bubble-wrap[data-mid="m40_3"]');
    _jumpToMsg("m40_inexistant");
    window.toast = t;
    return { avant, apres, toasts: window.__toasts };
  }, AUTRE);
  expect(r.avant, "le message cité n'est pas dans la première page").toBe(false);
  expect(r.apres, "il est chargé et affiché").toBe(true);
  expect(r.toasts).toEqual(["Ce message n'est plus disponible"]);
});
