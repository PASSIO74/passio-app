// ============================================================================
// L'EXPLORATION NE LIT PLUS LES MOODS DANS UN RAIL MASQUÉ (2026-08-29)
// ----------------------------------------------------------------------------
// Quand le fil n'a rien à montrer dans les passions suivies, il propose « ce qui
// vit ailleurs ». La liste des moods admis dans ce repli se construisait en
// lisant les BOUTONS de `#moodSelector` — un rail que le lot UI-7 a masqué au
// profit de `#feedIntentSelector`.
//
// Conséquence mesurée : `irl` n'a jamais eu de bouton dans ce rail, donc une
// publication « Rencontrer » venue d'une passion non suivie était exclue de
// l'exploration. Elle restait visible dans sa propre passion — le défaut n'était
// pas « invisible partout » — mais elle ne pouvait atteindre personne d'autre,
// c'est-à-dire exactement les gens qu'une invitation à se rencontrer vise.
//
// Le défaut n'était pas atteignable avant le 2026-08-29 : « Rencontrer » n'était
// choisissable nulle part dans le composer (#194 l'a ajouté le matin même).
//
// La source de vérité est désormais `PASSIO_MOOD_LABELS`. Elle reste une liste
// BLANCHE : un mood inconnu venu de la base n'entre toujours pas.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Poser une publication dans une passion que le compte NE SUIT PAS : c'est le
// seul chemin qui passe par le repli d'exploration.
async function explorer(page, mood) {
  return page.evaluate((m) => {
    const mienne = (state.user.profiles || []).map((p) => p.passion);
    const etrangere = (state.seed.passions || [])
      .map((p) => p.id).find((id) => !mienne.includes(id)) || "cuisine";
    state.seed.posts = [{
      id: "p_expl_" + String(m), authorId: "u_lea", passion: etrangere, mood: m,
      text: "Publication d'une passion non suivie.",
      createdAt: Date.now() - 3600000, likes: 0, comments: [],
    }];
    state.userPosts = []; state.supabasePosts = [];
    saveState(); goTo("feed"); renderFeed();
    return etrangere;
  }, mood);
}

const compte = (page) => page.evaluate(() =>
  document.querySelectorAll("#feedList .post").length);

test.describe("le repli d'exploration", () => {
  test("propose une publication « Rencontrer » d'une passion non suivie", async ({ page }) => {
    await bootOnboarded(page);
    await explorer(page, "irl");
    await page.waitForTimeout(800);
    // Avant correctif : 0 — `irl` n'avait aucun bouton dans `#moodSelector`.
    expect(await compte(page)).toBeGreaterThan(0);
  });

  test("propose aussi les moods qui ne sont plus publiables mais restent affichables", async ({ page }) => {
    await bootOnboarded(page);
    for (const m of ["chill", "actu"]) {
      await explorer(page, m);
      await page.waitForTimeout(800);
      expect(await compte(page), m).toBeGreaterThan(0);
    }
  });

  test("reste une liste BLANCHE : un mood inconnu n'entre pas", async ({ page }) => {
    await bootOnboarded(page);
    await explorer(page, "mood_invente_par_un_client_tiers");
    await page.waitForTimeout(800);
    expect(await compte(page)).toBe(0);
  });

  test("ne dépend plus du DOM : masquer le rail hérité ne change rien", async ({ page }) => {
    await bootOnboarded(page);
    await explorer(page, "irl");
    await page.waitForTimeout(800);
    const avant = await compte(page);
    // Le rail est déjà masqué sous UI-7 ; on le RETIRE pour prouver que le
    // classement n'en dépend plus du tout.
    await page.evaluate(() => {
      const r = document.getElementById("moodSelector");
      if (r) r.remove();
      renderFeed();
    });
    await page.waitForTimeout(800);
    expect(await compte(page)).toBe(avant);
  });
});
