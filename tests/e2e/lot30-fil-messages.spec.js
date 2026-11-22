// ═══════════════════════════════════════════════════════════════════════════
// LOT-30 (audit UX/UI du 2026-11-10) — FIL ET MESSAGES (SUITE)
//   ① FIL-C10 : le panneau de réaction reste dans l'écran, même ouvert depuis un
//      bouton tout en haut ; ses cases mesurent 40 px.
//   ② FIL-C26 : l'aperçu d'une carte n'écrit jamais « 🤍 0 ».
//   ③ MSG-C07 : la recherche des messages ne promet plus les messages ; un ×
//      la vide, et quitter l'écran aussi.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

for (const vue of [{ width: 360, height: 640 }, { width: 390, height: 844 }]) {
  test(`① FIL-C10 : panneau de réaction dans l'écran (${vue.width}×${vue.height})`, async ({ page }) => {
    await page.setViewportSize(vue);
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const mesures = [];
      for (const y of [6, 300, 590]) {
        const b = document.createElement("button");
        b.textContent = "😊";
        b.style.cssText = "position:fixed;left:20px;top:" + y + "px;width:40px;height:40px;z-index:5;";
        document.body.appendChild(b);
        emojiReactPanel({ currentTarget: b, target: b, stopPropagation() {}, preventDefault() {} }, () => {}, null);
        const p = document.getElementById("emoji-react-panel");
        const q = p.getBoundingClientRect();
        const cases = Array.from(p.querySelectorAll(".emoji-react-case")).map((c) => c.getBoundingClientRect());
        mesures.push({ y, haut: q.top, bas: q.bottom, gauche: q.left, droite: q.right, petite: Math.min(...cases.map((c) => Math.min(c.width, c.height))) });
        p.remove(); b.remove();
      }
      return { mesures, vw: innerWidth, vh: innerHeight };
    });
    for (const m of r.mesures) {
      expect(m.haut, `bouton à ${m.y} px : bord haut`).toBeGreaterThanOrEqual(8);
      expect(m.bas, `bouton à ${m.y} px : bord bas`).toBeLessThanOrEqual(r.vh - 8 + 0.5);
      expect(m.gauche).toBeGreaterThanOrEqual(8);
      expect(m.droite).toBeLessThanOrEqual(r.vw - 8 + 0.5);
      expect(m.petite, "cases de 40 px").toBeGreaterThanOrEqual(40);
    }
  });
}

test("② FIL-C26 : l'aperçu n'écrit jamais « 🤍 0 »", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const p = JSON.parse(JSON.stringify(state.seed.posts[0]));
    const auteur = (state.seed.users[0] || {}).id;
    p.id = "p_lot30";
    p.comments = [
      { id: "c_zero", authorId: auteur, text: "premier", likes: 0, likedBy: [], createdAt: Date.now() },
      { id: "c_deux", authorId: auteur, text: "second", likes: 2, likedBy: [], createdAt: Date.now() },
    ];
    const box = document.createElement("div");
    box.innerHTML = renderPostHTML(p);
    const lire = (id) => box.querySelector('.comment [data-cmtlike="' + id + '"]').textContent.trim();
    return { zero: lire("c_zero"), deux: lire("c_deux") };
  });
  expect(r.zero).toBe("🤍");
  expect(r.deux).toBe("🤍 2");
});

test("③ MSG-C07 : un × vide la recherche, et quitter l'écran aussi", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => goTo("messages"));
  const champ = page.locator("#convGlobalSearch");
  await expect(champ).toHaveAttribute("placeholder", "Rechercher une conversation…");
  const croix = page.locator("#convGlobalSearchClear");
  await expect(croix).toBeHidden();
  await champ.fill("zzzz-introuvable");
  await expect(croix).toBeVisible();
  const taille = await croix.boundingBox();
  expect(Math.min(taille.width, taille.height)).toBeGreaterThanOrEqual(44);
  await croix.click();
  await expect(champ).toHaveValue("");
  await expect(croix).toBeHidden();
  expect(await page.evaluate(() => window._msgSearchQuery)).toBe("");
  await champ.fill("zzzz");
  await page.evaluate(() => { goTo("feed"); goTo("messages"); });
  await expect(champ).toHaveValue("");
  expect(await page.evaluate(() => window._msgSearchQuery)).toBe("");
});
