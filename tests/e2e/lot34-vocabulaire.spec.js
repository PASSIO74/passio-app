// ═══════════════════════════════════════════════════════════════════════════
// LOT-34 (audit UX/UI du 2026-11-10) — VOCABULAIRE
//   ① FIL-C22 : « publication », jamais « post », dans l'interface du fil et du
//      profil. Les textes de NOTIFICATION ne changent pas : le serveur les
//      reconnaît mot pour mot (trg_notifications_texte).
//   ② MSG-C27 : dans la messagerie, « personne » et « chercher ».
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("① FIL-C22 : aucune chaîne visible du fil ou du profil ne dit « post »", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const p = JSON.parse(JSON.stringify(state.seed.posts.find((x) => x.image) || state.seed.posts[0]));
    p.authorId = MY_UID;
    const box = document.createElement("div");
    box.innerHTML = renderPostHTML(p);
    const menu = box.querySelector(".post-menu-btn");
    const img = box.querySelector(".post-media img");
    return {
      menu: menu ? menu.getAttribute("aria-label") : null,
      alt: img ? img.getAttribute("alt") : null,
      vide: document.querySelector("#screen-feed .empty-title") ? document.querySelector("#screen-feed .empty-title").textContent : null,
      stat: document.getElementById("mainStatPosts").nextElementSibling.textContent,
    };
  });
  if (r.menu !== null) expect(r.menu).toBe("Options de la publication");
  if (r.alt !== null) expect(r.alt).toBe("Image de la publication");
  if (r.vide !== null) expect(r.vide).not.toMatch(/\bpost\b/i);
  expect(r.stat).toBe("publications");
  expect([r.menu, r.alt].some((x) => x !== null), "au moins une surface mesurée").toBe(true);
});

test("② MSG-C27 : « Chercher une personne… » dans les deux recherches", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    openNewMessage();
    await new Promise((res) => setTimeout(res, 150));
    const nm = document.getElementById("_nmSearch").getAttribute("placeholder");
    closeModal();
    conversationsState = [{ id: "c_g34", isGroup: true, groupName: "G", createdBy: MY_UID, userIds: ["a1b2c3d4-0000-4000-8000-00000000c7a1"], userId: "a1b2c3d4-0000-4000-8000-00000000c7a1", lastAt: Date.now(), messages: [] }];
    showGroupMembers("c_g34");
    await new Promise((res) => setTimeout(res, 80));
    const grp = document.getElementById("grpSearchInput").getAttribute("placeholder");
    closeModal();
    return { nm, grp };
  });
  expect(r.nm).toBe("Chercher une personne…");
  expect(r.grp).toBe("Chercher une personne…");
});
