// ═══════════════════════════════════════════════════════════════════════════
// LOT-11 (audit UX/UI du 2026-11-10) — L'ÉCRAN RECHERCHER
// REC-C05 à REC-C19 : champ nommé avec sa croix, panneau qui se ferme, personnes
// avant six passions, « aucun résultat » qui aide, hors ligne dit, un seul compte
// de publications, ajouter une passion sans quitter la fiche, fiche en haut,
// tendances honnêtes, « à suivre » sans les suivis, bio en début de mot.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function ouvrir(page) {
  await bootOnboarded(page);
  await page.evaluate(() => { window.supaSearchUsers = async () => []; goTo("explore"); });
  await expect(page.locator("#explorerSearch")).toBeVisible();
}

test("REC-C13 / C07 : le champ est nommé, a sa croix ; Échap et un toucher dehors ferment le panneau", async ({ page }) => {
  await ouvrir(page);
  const champ = page.locator("#explorerSearch");
  await expect(champ).toHaveAttribute("type", "search");
  await expect(champ).toHaveAttribute("aria-label", "Chercher une passion ou une personne");
  await expect(page.locator("#explorerClear")).toBeHidden();
  await champ.fill("gui");
  await expect(page.locator("#explorerClear")).toBeVisible();
  const panneau = page.locator("#exploreSearchResults");
  await expect(panneau).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panneau).toBeHidden();
  // Échap sur un champ `type=search` l'efface aussi (geste natif) : on retape.
  await champ.fill("gui");
  await expect(panneau).toBeVisible();
  await page.mouse.click(5, 700);
  await expect(panneau, "un toucher hors du panneau le ferme").toBeHidden();
  await expect(champ).toHaveValue("gui");
  await champ.evaluate((e) => e.blur());
  await champ.focus();
  await expect(panneau, "revenir dans le champ rempli rouvre les résultats").toBeVisible();
  await page.locator("#explorerClear").click();
  await expect(champ).toHaveValue("");
  expect((await page.locator("#explorerClear").evaluate((b) => { b.hidden = false; const r = b.getBoundingClientRect(); return r.height; }))).toBeGreaterThanOrEqual(44);
});

test("REC-C06 : trois passions, puis « Voir N autres » ; l'en-tête des comptes dit « Personnes »", async ({ page }) => {
  await ouvrir(page);
  await page.evaluate(() => {
    window._exChercherPassions = async () => [1, 2, 3, 4, 5, 6].map((i) => ({ id: "p" + i, label: "Passion " + i, emoji: "🎸" }));
    window.supaSearchUsers = async () => [{ id: "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaa01", username: "Guillaume" }];
  });
  await page.locator("#explorerSearch").fill("gui");
  const panneau = page.locator("#exploreSearchResults");
  await expect(panneau).toContainText("Personnes");
  await expect(panneau).not.toContainText("Utilisateurs");
  await expect(panneau.locator(".ex-passion-plus:visible")).toHaveCount(0);
  await panneau.locator(".ex-voir-plus").click();
  await expect(panneau.locator(".ex-passion-plus:visible")).toHaveCount(3);
});

test("REC-C08 : « aucun résultat » conseille, et propose des passions actives", async ({ page }) => {
  await ouvrir(page);
  await page.evaluate(() => {
    window._exChercherPassions = async () => [];
    state.supabasePosts = [{ id: "pr1", passion: "musique", authorId: "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaa01", type: "text", text: "x", createdAt: Date.now() }];
  });
  await page.locator("#explorerSearch").fill("zzqxw");
  const panneau = page.locator("#exploreSearchResults");
  await expect(panneau).toContainText("mot plus court");
  await expect(panneau.locator(".ex-suggestions .pill")).toHaveCount(1);
});

test("REC-C12 : hors ligne, la cause est dite et le socle reste cherchable", async ({ page }) => {
  await ouvrir(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    window._exChercherPassions = () => Promise.reject(new Error("réseau"));
  });
  await page.locator("#explorerSearch").fill("musi");
  const panneau = page.locator("#exploreSearchResults");
  await expect(panneau).toContainText("Tu es hors ligne");
  await expect(panneau).toContainText("Musique");
});

test("REC-C09 / C10 / C11 : un seul compte ; « Ajouter à mes passions » reste sur la fiche ; la fiche s'ouvre en haut", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    state.supabasePosts = [1, 2, 3].map((i) => ({ id: "rm" + i, passion: "escalade", authorId: "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaa01", type: "text", text: "Voie " + i, createdAt: Date.now() - i }));
    openPassionExplorer("musique");
    const mc = document.getElementById("modalContent");
    mc.scrollTop = 900;                       // la fiche précédente défilée
    openPassionExplorer("escalade");
    return { haut: document.getElementById("modalContent").scrollTop, texte: document.getElementById("modalContent").textContent, tuile: nbPublicationsPassion("escalade") };
  });
  expect(r.haut, "la nouvelle fiche s'ouvre en haut").toBe(0);
  expect(r.texte).toContain(r.tuile + " publications");
  expect(r.texte).not.toMatch(/\d+ posts?\b/);
  await page.evaluate(() => { goTo("explore"); openPassionExplorer("escalade"); });
  const ajouter = page.locator("#modalContent .pex-ajouter");
  await expect(ajouter).toHaveText("＋ Ajouter à mes passions");
  await ajouter.click();
  await expect(page.locator("#modalContent")).toContainText("Ta passion");
  expect(await page.evaluate(() => document.getElementById("screen-explore").classList.contains("active")), "on reste dans la découverte").toBe(true);
});

test("REC-C17 : une fiche vide propose de publier sur la passion", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => { state.supabasePosts = []; state.seed.posts = []; openPassionExplorer("ceramique", "", "Céramique"); });
  await expect(page.locator("#modalContent .pex-publier")).toContainText("Publier sur Céramique");
});

test("REC-C14 / C05 : tendances sans « Hot » ; « à suivre » sans les personnes déjà suivies", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    state.supabasePosts = [];
    state.seed.users.forEach((x) => { x.distant = true; });
    const suivie = state.seed.users[0].id;
    state.user.following = [suivie];
    goTo("explore"); renderExplorer();
    return {
      titre: document.getElementById("trendingTitle").textContent,
      hot: !!document.querySelector(".tag-hot"),
      suivieProposee: !!document.querySelector('#suggestedCreators [data-follow-uid="' + suivie + '"]'),
    };
  });
  expect(r.titre).toBe("Pour commencer");
  expect(r.hot).toBe(false);
  expect(r.suivieProposee, "une personne suivie n'est pas « à suivre »").toBe(false);
});

test("REC-C16 : la bio ne compte qu'en début de mot sur une requête courte ; le pseudo passe devant", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    const lignes = [
      { id: "v1", username: "Victor Aubry", bio: "Passionné d'automobile" },
      { id: "t1", username: "Tom Girard", bio: "Guitare" },
      { id: "b1", username: "Ana", bio: "tomates du jardin" },
    ];
    window._supaReal = true;
    const faux = { from: () => ({ select: () => ({ or: () => ({ limit: async () => ({ data: lignes, error: null }) }) }) }) };
    try { supa = faux; } catch (e) {}
    return (await supaSearchUsers("tom")).map((u) => u.id);
  });
  expect(r).toEqual(["t1", "b1"]);
});
