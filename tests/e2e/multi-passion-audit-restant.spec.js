// Trois défauts confirmés par la vérification adversariale de l'audit multi-passion
// (17 confirmés sur 48 trouvailles brutes), corrigés le 2026-08-30.
//
//   ① Une passion PERSONNALISÉE s'affichait « 🧶 Passion » chez les autres : le
//      libellé publié par l'auteur dans le jsonb n'était jamais lu, parce que
//      `passionById` ne rend jamais null et gagnait toujours la priorité.
//   ② Le formulaire de création promettait une revue humaine « par l'équipe
//      PASSIO […] sous 48h ». Le code auto-approuvait après 5 secondes.
//   ③ Les passions choisies à l'onboarding filtraient le fil SANS bulle pour les
//      voir ni les retirer : l'onboarding en pose jusqu'à 7 dans le filtre mais
//      ne crée qu'un seul profil, et le rail ne dessinait que les profils.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supaUpsertProfile = async () => {};
  });
}

test("① le libellé d'une passion personnalisée est celui publié par son auteur", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    state.seed.users = (state.seed.users || []).filter(u => u.id !== "u_tricot");
    state.seed.users.push({
      id: "u_tricot", name: "Nour", profileEmoji: "🧶", avatar: "#8b5cf6",
      passion: "custom_tricot_ab12",
      // `label` voyage dans le jsonb PRÉCISÉMENT pour ce cas : le lecteur n'a
      // pas cette passion dans SON catalogue (`allPassions()`).
      passions: [{ id: "custom_tricot_ab12", emoji: "🧶", label: "Tricot" }],
    });
  });
  await page.evaluate(() => openUserProfile("u_tricot"));
  await page.waitForTimeout(1200);
  // ⚠️ DEUX DÉMÉNAGEMENTS SUCCESSIFS, ET C'EST LE SECOND QUI VAUT. ADR-011 a
  // fait des pastilles `[data-vpid]` les BULLES du Fil ; le 2026-09-02 elles
  // sont devenues des PASTILLES DE TEXTE (« trop gros trop visible »). La clé
  // reste `data-passion-tile`, le libellé vit maintenant dans `.v9-chip-nom`.
  // On lit le libellé et non le `textContent` de la pastille, qui porterait
  // aussi l'emoji. Ce que ce test garantit ne bouge pas : le libellé publié par
  // l'auteur gagne sur le repli générique de `passionById`.
  const libelles = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#visitedPassions [data-passion-tile]")).map((b) => {
      const lbl = b.querySelector(".v9-chip-nom");
      return lbl ? lbl.textContent.trim() : "";
    }));
  // Sans ce garde, les deux assertions ci-dessous passeraient sur une liste VIDE.
  // ⚠️ `> 0` et non `> 1` : le seuil comptait la bulle « Toutes », retirée le
  // 2026-08-31 avec le passage en multisélection. Ce compte visé est celui des
  // passions RÉELLES du compte visité, et il peut n'y en avoir qu'une.
  expect(libelles.length).toBeGreaterThan(0);
  expect(libelles).toContain("Tricot");
  // Le défaut : « Passion », le repli générique de `passionById`.
  expect(libelles).not.toContain("Passion");
});

test("① bis — une passion du catalogue garde son libellé de catalogue", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    state.seed.users = (state.seed.users || []).filter(u => u.id !== "u_cat");
    state.seed.users.push({
      id: "u_cat", name: "Sam", profileEmoji: "🍳", avatar: "#8b5cf6", passion: "cuisine",
      // Libellé publié VOLONTAIREMENT faux : le catalogue local doit gagner,
      // sinon un compte tiers choisirait le texte affiché chez les autres.
      passions: [{ id: "cuisine", emoji: "🍳", label: "ZZZ_LIBELLE_DISTANT" }],
    });
  });
  await page.evaluate(() => openUserProfile("u_cat"));
  await page.waitForTimeout(1200);
  // ⚠️ DEUX DÉMÉNAGEMENTS SUCCESSIFS, ET C'EST LE SECOND QUI VAUT. ADR-011 a
  // fait des pastilles `[data-vpid]` les BULLES du Fil ; le 2026-09-02 elles
  // sont devenues des PASTILLES DE TEXTE (« trop gros trop visible »). La clé
  // reste `data-passion-tile`, le libellé vit maintenant dans `.v9-chip-nom`.
  // On lit le libellé et non le `textContent` de la pastille, qui porterait
  // aussi l'emoji. Ce que ce test garantit ne bouge pas : le libellé publié par
  // l'auteur gagne sur le repli générique de `passionById`.
  const libelles = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#visitedPassions [data-passion-tile]")).map((b) => {
      const lbl = b.querySelector(".v9-chip-nom");
      return lbl ? lbl.textContent.trim() : "";
    }));
  // Sans ce garde, les deux assertions ci-dessous passeraient sur une liste VIDE.
  // ⚠️ `> 0` et non `> 1` : le seuil comptait la bulle « Toutes », retirée le
  // 2026-08-31 avec le passage en multisélection. Ce compte visé est celui des
  // passions RÉELLES du compte visité, et il peut n'y en avoir qu'une.
  expect(libelles.length).toBeGreaterThan(0);
  expect(libelles.join(" ")).not.toContain("ZZZ_LIBELLE_DISTANT");
});

test("② le formulaire ne promet plus de modération humaine", async ({ page }) => {
  await boot(page);
  const texte = await page.evaluate(() => {
    openCreateCustomPassion();
    const m = document.getElementById("modalContent");
    return m ? m.innerText : "";
  }).catch(() => "");
  if (texte) {
    expect(texte).not.toContain("48h");
    expect(texte).not.toContain("équipe PASSIO");
    expect(texte).not.toContain("examinée");
  }
  // Le contrôle qui compte, quel que soit le point d'entrée : plus aucune
  // promesse de revue humaine dans le code de l'application.
  const source = await page.evaluate(async () => {
    const r = await fetch("/js/app-02-state-utils.js");
    return await r.text();
  });
  expect(source).not.toContain("Ta demande sera examinée sous 48h");
  expect(source).not.toContain("Tu seras notifié quand elle sera examinée");
});

test("③ une passion qui filtre le fil a toujours sa bulle", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    // Exactement la situation produite par l'onboarding : UNE passion créée,
    // TROIS passions posées comme intérêts de lecture.
    state.user.profiles = [{ id: "pp_0", name: "QA", passion: "musique", emoji: "🎵", color: "#7c3aed" }];
    state.user.currentProfileId = "pp_0";
    setFeedPassions(["musique", "cuisine", "sport"]);
    goTo("feed");
    renderProfileStrip();
  });
  await page.waitForTimeout(400);
  const bulles = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#profileStrip .profile-tile"))
      .map(t => (t.querySelector(".profile-tile-label") || {}).textContent || ""));
  // Les trois passions qui décident du contenu sont visibles, pas seulement
  // celle qui a un profil.
  expect(bulles.join("|")).toContain("Musique");
  expect(bulles.join("|")).toContain("Cuisine");
  expect(bulles.join("|")).toContain("Sport");
});

test("③ bis — une bulle d'intérêt est décochable, et ne crée aucun profil", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    state.user.profiles = [{ id: "pp_0", name: "QA", passion: "musique", emoji: "🎵", color: "#7c3aed" }];
    state.user.currentProfileId = "pp_0";
    setFeedPassions(["musique", "cuisine"]);
    goTo("feed");
    renderProfileStrip();
  });
  await page.waitForTimeout(300);
  const avant = await page.evaluate(() => state.user.profiles.length);

  await page.evaluate(() => toggleProfileFilter("cuisine"));
  await page.waitForTimeout(400);

  const apres = await page.evaluate(() => ({
    actives: Array.from(_activeFeedPassions),
    profils: state.user.profiles.length,
    bulles: Array.from(document.querySelectorAll("#profileStrip .profile-tile"))
      .map(t => (t.querySelector(".profile-tile-label") || {}).textContent || "").join("|"),
  }));
  expect(apres.actives).not.toContain("cuisine");
  // Une bulle d'intérêt est un élément d'AFFICHAGE : la décocher la retire, et
  // n'a jamais créé de passion dans l'état.
  expect(apres.profils).toBe(avant);
  expect(apres.bulles).not.toContain("Cuisine");
});
