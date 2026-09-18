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
const { bootVisiteur } = require("./first-run-helper");

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
  // ⚠️ ADR-011 : les pastilles `[data-vpid]` sont devenues les BULLES du Fil
  // (`passionTileHTML`, §1 « exactement le composant du fil »). La clé est
  // `data-passion-tile` et le libellé vit dans `.profile-tile-label` — lire le
  // `textContent` de la bulle rendrait « 🧶🧶Tricot », l'emoji étant peint deux
  // fois (avatar + glyphe décoratif `aria-hidden`). Ce que ce test garantit ne
  // bouge pas : le libellé publié par l'auteur gagne sur le repli générique.
  const libelles = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#visitedPassions [data-passion-tile]")).map((b) => {
      const lbl = b.querySelector(".profile-tile-label");
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
  // ⚠️ ADR-011 : les pastilles `[data-vpid]` sont devenues les BULLES du Fil
  // (`passionTileHTML`, §1 « exactement le composant du fil »). La clé est
  // `data-passion-tile` et le libellé vit dans `.profile-tile-label` — lire le
  // `textContent` de la bulle rendrait « 🧶🧶Tricot », l'emoji étant peint deux
  // fois (avatar + glyphe décoratif `aria-hidden`). Ce que ce test garantit ne
  // bouge pas : le libellé publié par l'auteur gagne sur le repli générique.
  const libelles = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#visitedPassions [data-passion-tile]")).map((b) => {
      const lbl = b.querySelector(".profile-tile-label");
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

// ⚠️ RÉÉCRIT LE 2026-09-18 — « les passions du fil sont celles du compte ».
// L'invariant de ③ (« une passion qui filtre le fil a toujours sa bulle ») ne
// bouge pas, mais il tient désormais par CONSTRUCTION pour un compte : une
// passion que le compte ne possède pas ne filtre plus rien (`setFeedPassions`
// la borne), donc elle n'a pas besoin de bulle — et n'en a pas. Le cas de
// l'onboarding qui posait « UNE créée, TROIS en intérêts » n'existe plus :
// chaque passion cochée devient une passion du compte. Les bulles d'intérêt
// sans profil ne survivent que chez un VISITEUR (③ bis).
test("③ une passion qui filtre le fil a toujours sa bulle — et un compte ne filtre que sur ce qu'il possède", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    state.user.profiles = [{ id: "pp_0", name: "QA", passion: "musique", emoji: "🎵", color: "#7c3aed" }];
    state.user.currentProfileId = "pp_0";
    setFeedPassions(["musique", "cuisine", "sport"]);
    goTo("feed");
    renderProfileStrip();
    return { actives: Array.from(_activeFeedPassions) };
  });
  await page.waitForTimeout(400);
  const bulles = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#profileStrip .profile-tile"))
      .map(t => (t.querySelector(".profile-tile-label") || {}).textContent || ""));
  // Seule la passion POSSÉDÉE filtre, et elle a sa bulle. Les deux autres ne
  // filtrent pas — et le rail n'en peint aucune fantôme.
  expect(r.actives).toEqual(["musique"]);
  expect(bulles.join("|")).toContain("Musique");
  expect(bulles.join("|")).not.toContain("Cuisine");
  expect(bulles.join("|")).not.toContain("Sport");

  // Dès que le compte POSSÈDE la passion, elle filtre ET elle a sa bulle.
  const apres = await page.evaluate(() => {
    ajouterPassionAuCompte("cuisine", "");
    const rail = document.getElementById("profileStrip");
    if (rail) rail._lastHtml = null;
    renderProfileStrip();
    return {
      actives: Array.from(_activeFeedPassions),
      bulles: Array.from(document.querySelectorAll("#profileStrip .profile-tile"))
        .map(t => (t.querySelector(".profile-tile-label") || {}).textContent || "").join("|"),
    };
  });
  expect(apres.actives).toEqual(["musique", "cuisine"]);
  expect(apres.bulles).toContain("Cuisine");
});

test("③ bis — chez un VISITEUR, une bulle d'intérêt est décochable, et ne crée aucun profil", async ({ page }) => {
  await bootVisiteur(page, { sansBienvenue: true });
  await page.evaluate(() => {
    setFeedPassions(["musique", "cuisine"]);
    goTo("feed");
    renderProfileStrip();
  });
  await page.waitForTimeout(300);
  const avant = await page.evaluate(() => (state.user.profiles || []).length);
  // Prémisse : les deux intérêts sont peints, sans profil (c'est un visiteur).
  const peintes = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#profileStrip .profile-tile"))
      .map(t => (t.querySelector(".profile-tile-label") || {}).textContent || "").join("|"));
  expect(peintes).toContain("Cuisine");

  await page.evaluate(() => toggleProfileFilter("cuisine"));
  await page.waitForTimeout(400);

  const apres = await page.evaluate(() => ({
    actives: Array.from(_activeFeedPassions),
    profils: (state.user.profiles || []).length,
    bulles: Array.from(document.querySelectorAll("#profileStrip .profile-tile"))
      .map(t => (t.querySelector(".profile-tile-label") || {}).textContent || "").join("|"),
  }));
  expect(apres.actives).not.toContain("cuisine");
  // Une bulle d'intérêt est un élément d'AFFICHAGE : la décocher la retire, et
  // n'a jamais créé de passion dans l'état.
  expect(apres.profils).toBe(avant);
  expect(apres.bulles).not.toContain("Cuisine");
});
