// ═══════════════════════════════════════════════════════════════════════════
// LOT-42 (audit UX/UI du 2026-11-10, MSG-C88) — LA CONVERSATION SE CALE SUR LE
// CLAVIER
//   ① champ en focus + zone visible réduite (clavier simulé : visualViewport de
//      500 px sur 844) : le panneau prend la hauteur visible, l'en-tête et le
//      champ restent dans la zone visible ; `--app-vh` n'est pas touché ;
//   ② clavier fermé, puis focus perdu : plus rien d'inline, rien de figé.
// Le clavier est simulé (un navigateur de banc n'en a pas) : on remplace
// `window.visualViewport` par un objet qu'on pilote, puis on appelle
// `calerConvSurClavier`, le même chemin que ses écouteurs.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const AUTRE = "a1b2c3d4-0000-4000-8000-00000000c842";

test("① clavier ouvert : en-tête et champ dans la zone visible ; ② fermé : rien de figé", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async (autre) => {
    const msgs = Array.from({ length: 30 }, (_, i) => ({ id: "k" + i, from: i % 2 ? autre : "me", text: "message " + i, at: Date.now() - (30 - i) * 60000 }));
    conversationsState = [{ id: "c_l42", userId: autre, userName: "Léa", lastAt: Date.now(), messages: msgs }];
    openConversation("c_l42");
    await new Promise((res) => setTimeout(res, 400));
    const appVh = document.documentElement.style.getPropertyValue("--app-vh");
    const faux = { height: 500, offsetTop: 0, scale: 1, addEventListener() {}, removeEventListener() {} };
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => faux });
    const champ = document.getElementById("convFpInput");
    champ.focus();
    calerConvSurClavier();
    const fp = document.getElementById("conv-fullpage");
    const tete = fp.querySelector(".conv-fp-head").getBoundingClientRect();
    const zone = champ.getBoundingClientRect();
    const ouvert = { haut: tete.top, basChamp: zone.bottom, hauteur: fp.getBoundingClientRect().height,
      appVh: document.documentElement.style.getPropertyValue("--app-vh") };
    faux.height = 844;
    calerConvSurClavier();
    const ferme = { style: fp.getAttribute("style") || "", hauteur: fp.getBoundingClientRect().height };
    faux.height = 500;
    calerConvSurClavier();
    champ.blur();
    calerConvSurClavier();
    const flou = { style: fp.getAttribute("style") || "", classe: fp.classList.contains("conv-cale-clavier") };
    return { appVh, ouvert, ferme, flou };
  }, AUTRE);
  expect(r.ouvert.hauteur).toBe(500);
  expect(r.ouvert.haut).toBeGreaterThanOrEqual(0);
  expect(r.ouvert.basChamp).toBeLessThanOrEqual(500);
  expect(r.ouvert.appVh, "--app-vh n'est pas touché").toBe(r.appVh);
  expect(r.ferme.style).not.toMatch(/height|top/);
  expect(r.ferme.hauteur).toBeGreaterThan(800);
  expect(r.flou.style).not.toMatch(/height|top/);
  expect(r.flou.classe).toBe(false);
});
