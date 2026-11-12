// ═══════════════════════════════════════════════════════════════════════════
// LOT-8 (audit UX/UI du 2026-11-10) — ICÔNES, CIBLES, PANNEAU INERTE
//   ① FIL-C02 : la barre d'actions d'une publication parle — icônes SVG, nom
//        prononçable, état « aimé » exposé (aria-pressed), et chaque repeint
//        garde ces trois choses.
//   ② SOC-C02 : le panneau de conversation fermé n'est ni tabulable ni exposé.
//   ③ SOC-C01 : les commandes relevées par l'audit font 44 px de haut.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("① FIL-C02 : j'aime, commenter et réagir ont une icône, un nom et un état", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => { window.supaSetPostLike = async () => ({ ok: true }); window.supaLikePost = async () => ({ ok: true }); });
  const carte = page.locator("#feedList article.post").first();
  await expect(carte).toBeVisible();
  const like = carte.locator('.post-action[data-action="like"]');
  const lire = () => like.evaluate((el) => ({
    svg: !!el.querySelector("svg.pa-ico"), emoji: /[🤍❤️]/u.test(el.textContent),
    pressed: el.getAttribute("aria-pressed"), label: el.getAttribute("aria-label"), n: Number(el.getAttribute("data-n")),
    texte: el.querySelector(".pa-n") && el.querySelector(".pa-n").textContent,
  }));
  const avant = await lire();
  expect(avant.svg).toBe(true);
  expect(avant.emoji, "plus d'emoji dans la fonction").toBe(false);
  expect(avant.pressed).toBe("false");
  expect(avant.label).toBe("J'aime — " + avant.n + " j'aime");
  expect(avant.texte).toBe(String(avant.n));
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  const apres = await lire();
  expect(apres.n).toBe(avant.n + 1);
  expect(apres.label).toBe("Tu aimes — " + apres.n + " j'aime");
  expect(apres.svg, "le repeint garde l'icône").toBe(true);
  const cmt = carte.locator(".post-action[data-cmtcount]");
  await expect(cmt).toHaveAttribute("aria-label", /^Commenter — \d+ commentaires?$/);
  expect(await cmt.evaluate((el) => !!el.querySelector("svg.pa-ico") && !/💬/u.test(el.textContent))).toBe(true);
  await expect(carte.locator('.post-action[aria-label="Réagir"] svg.pa-ico')).toHaveCount(1);
  // Lisible : nombre en 13,5 px.
  expect(await like.locator(".pa-n").evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13.5);
});

test("② SOC-C02 : le panneau de conversation fermé n'est ni tabulable ni exposé ; ouvert, il l'est", async ({ page }) => {
  await bootOnboarded(page);
  const etat = () => page.evaluate(() => {
    const fp = document.getElementById("conv-fullpage");
    return { inert: fp.hasAttribute("inert"), cache: fp.getAttribute("aria-hidden"), actif: fp.classList.contains("active") };
  });
  expect(await etat()).toEqual({ inert: true, cache: "true", actif: false });
  // Tabulation depuis le haut de page : jamais dans le panneau fermé.
  const dedans = await page.evaluate(() => {
    const fp = document.getElementById("conv-fullpage");
    const tabulables = [...fp.querySelectorAll("button, textarea, input, [tabindex]")];
    tabulables.forEach((el) => el.focus());
    return fp.contains(document.activeElement);
  });
  expect(dedans, "aucune commande du panneau fermé ne prend le focus").toBe(false);
  await page.evaluate(() => {
    getConversations().push({ id: "c_l8", userId: "11111111-2222-4333-8444-555555555555", userName: "Camille", messages: [], lastAt: Date.now(), unread: 0 });
    openConversation("c_l8");
  });
  await expect.poll(etat).toEqual({ inert: false, cache: null, actif: true });
  await page.evaluate(() => closeConversation());
  await expect.poll(etat).toEqual({ inert: true, cache: "true", actif: false });
});

test("③ SOC-C01 : les commandes relevées font 44 px de haut", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootOnboarded(page);
  const hauteurs = await page.evaluate(() => {
    const h = (el) => (el ? Math.round(el.getBoundingClientRect().height) : null);
    const out = {};
    out.enteteProfil = h(document.querySelector(".app-topbar .topbar-left"));
    // Les filtres ne sont mesurés que là où ils sont affichés (masqués par l'interface V2).
    const filtres = [...document.querySelectorAll("#postMoodRow .pill")].map(h).filter((x) => x > 0);
    if (filtres.length) out.filtres = Math.min(...filtres);
    goTo("explore");
    out.recherche = h(document.getElementById("explorerSearch"));
    out.ok = h(document.querySelector('.explorer-hero button[onclick="filterExplore()"]'));
    return out;
  });
  for (const [k, v] of Object.entries(hauteurs)) expect(v, k).toBeGreaterThanOrEqual(44);
});
