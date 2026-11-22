// Le bouton « Suivre » du profil visité suit CHAQUE geste (2026-11-14).
//
// Rapporté par Benjamin (deux captures) : sur le profil visité, le toast disait
// « Tu suis ben test ordi ! » puis « Tu ne suis plus ben test ordi », le
// compteur d'abonnés passait de 3 à 4 et retour — et le bouton restait figé sur
// « Demande envoyée ». Cause : « Créateurs à suivre » (app-06) émet le même
// `followBtn_<uid>` et précède la modale dans le document ; `_boutonsSuivi`
// prenait `getElementById`, donc le bouton CACHÉ, jamais celui sous le doigt.
// La suite reproduit l'ordre du document : un bouton homonyme AVANT celui du
// profil visité.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function poser(page, { prive }) {
  await page.evaluate((prive) => {
    window.supaFollowUser = async () => ({ ok: true, status: prive ? "pending" : "accepted" });
    window.supaUnfollowUser = async () => ({ ok: true });
    window.supaSaveUserState = async () => {};
    state.seed.users = (state.seed.users || []).filter((u) => u.id !== "u_ben");
    state.seed.users.push({ id: "u_ben", name: "Ben", profileEmoji: "🏃", avatar: "#8b5cf6", distant: true, isPrivate: prive });
    state.user.following = [];
    state.user.followingPending = [];
    // ① L'homonyme caché (« Créateurs à suivre »), PREMIER dans le document.
    const cache = document.createElement("button");
    cache.id = "followBtn_u_ben";
    cache.style.display = "none";
    document.body.insertBefore(cache, document.body.firstChild);
    // ② Le bouton du profil visité, tel que la modale le rend.
    const vu = document.createElement("button");
    vu.id = "followBtn_u_ben";
    vu.className = "btn ghost profil-action";
    vu.setAttribute("data-test-vu", "1");
    vu.textContent = libelleBoutonSuivi("u_ben");
    document.body.appendChild(vu);
  }, prive);
}

const libelleVu = (page) => page.evaluate(() => document.querySelector("[data-test-vu]").textContent.trim());

async function taper(page) {
  await page.evaluate(() => toggleFollowUser("u_ben", "Ben"));
  await page.waitForTimeout(150);
}

test("compte public : le bouton visible passe Suivre → ✓ Suivi → Suivre", async ({ page }) => {
  await bootOnboarded(page, null, 1, {});
  await poser(page, { prive: false });
  expect(await libelleVu(page)).toBe("Suivre");
  await taper(page);
  expect(await libelleVu(page), "« Tu suis Ben ! » → le bouton le dit").toBe("✓ Suivi");
  await taper(page);
  expect(await libelleVu(page), "« Tu ne suis plus Ben » → le bouton le dit").toBe("Suivre");
});

test("compte privé : Suivre → Demande envoyée → (annulée) Suivre", async ({ page }) => {
  await bootOnboarded(page, null, 1, {});
  await poser(page, { prive: true });
  await page.evaluate(() => { state.user.followingPending = []; });
  await taper(page);
  expect(await libelleVu(page)).toBe("Demande envoyée");
  await taper(page);
  expect(await libelleVu(page)).toBe("Suivre");
});

test("une demande ACCEPTÉE se repeint sur le bouton visible", async ({ page }) => {
  await bootOnboarded(page, null, 1, {});
  await poser(page, { prive: true });
  await page.evaluate(() => {
    state.user.following = ["u_ben"];
    _peindreBoutonsSuivi("u_ben", "suivi");
  });
  expect(await libelleVu(page)).toBe("✓ Suivi");
});
