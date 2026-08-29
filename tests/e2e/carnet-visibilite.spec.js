// Visibilité d'un carnet — « Privé » et « Abonnés » doivent tenir partout.
//
// LE DÉFAUT. La visibilité d'un carnet vit dans le blob jsonb `vlog` de la ligne
// `posts` — pas dans une colonne. La RLS ne peut donc PAS la faire respecter :
// la ligne part à tout compte autorisé à lire l'auteur. Le seul filet est
// CLIENT, et il n'était appliqué que par `allCarnets()` (l'onglet Carnets).
// Conséquence : un carnet marqué « Privé » n'apparaissait pas dans l'onglet
// Carnets, mais s'affichait dans le FIL de tout le monde, et s'y ouvrait
// entièrement — étapes, photos, lieux, budget.
//
// Ce que cette suite exige :
//   ① le fil n'affiche pas le carnet privé d'autrui ;
//   ② « Abonnés » distingue réellement l'abonné du non-abonné ;
//   ③ le viewer refuse d'ouvrir, quelle que soit la porte (c'est le point de
//      passage commun des dix appelants, dont le lien partagé #carnet-<id>) ;
//   ④ mon propre carnet privé, lui, reste visible et ouvrable — un correctif
//      qui masquerait tout serait aussi faux que l'absence de filtre.
//
// ⚠️ Ce filet est CLIENT. Il ferme l'exposition dans l'interface, pas la lecture
// de l'API : la vraie fermeture demande une colonne réelle et une policy, donc
// une migration — préparée hors de cette PR, pas appliquée sans supervision.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

function carnet(id, authorId, visibility, extra = {}) {
  return {
    id, type: "vlog", authorId, authorName: "Autre", authorEmoji: "🌍",
    destination: "Carnet " + id, visibility,
    steps: [{ id: "s1", place: "Lieu secret", text: "Étape" }],
    createdAt: Date.now(), passion: "musique", ...extra,
  };
}

async function injecter(page, carnets, following = []) {
  await page.evaluate(({ cs, foll }) => {
    state.supabasePosts = cs;
    state.user.following = foll;
    state.seed.posts = (state.seed.posts || []).filter((p) => p.type !== "vlog");
    if (typeof renderFeed === "function") renderFeed();
  }, { cs: carnets, foll: following });
}

const idsDuFil = (page) => page.evaluate(() => allFeedPosts().map((p) => p.id));

test.describe("Visibilité d'un carnet", () => {
  test("le fil n'affiche pas le carnet privé de quelqu'un d'autre", async ({ page }) => {
    await bootOnboarded(page);
    await injecter(page, [
      carnet("c_public", "u_autre", "public"),
      carnet("c_prive", "u_autre", "private"),
    ]);

    const ids = await idsDuFil(page);
    // Prémisse : le carnet public passe, sinon le test ne prouverait rien.
    expect(ids).toContain("c_public");
    expect(ids, "le carnet privé d'autrui ne doit pas atteindre le fil").not.toContain("c_prive");
  });

  test("« Abonnés » distingue l'abonné du non-abonné", async ({ page }) => {
    await bootOnboarded(page);
    await injecter(page, [carnet("c_abonnes", "u_suivi", "followers")], []);
    expect(await idsDuFil(page)).not.toContain("c_abonnes");

    await injecter(page, [carnet("c_abonnes", "u_suivi", "followers")], ["u_suivi"]);
    expect(await idsDuFil(page), "un abonné doit le voir").toContain("c_abonnes");
  });

  test("le viewer refuse d'ouvrir un carnet privé, quelle que soit la porte", async ({ page }) => {
    await bootOnboarded(page);
    await injecter(page, [carnet("c_prive", "u_autre", "private")]);

    const ouvert = await page.evaluate(() => {
      openVlogViewer("c_prive");
      const v = document.getElementById("vlogViewer");
      return !!(v && v.classList.contains("open"));
    });
    expect(ouvert, "le viewer ne doit pas s'ouvrir").toBe(false);
    await expect(page.locator("#toastStack .toast", { hasText: "n'est pas public" })).toBeVisible();
  });

  test("mon propre carnet privé reste visible et ouvrable", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => {
      state.seed.posts = (state.seed.posts || []).filter((p) => p.type !== "vlog");
      state.supabasePosts = [];
      state.userPosts = [{
        id: "c_moi", type: "vlog", authorId: MY_UID || "me", _source: "me",
        destination: "Mon carnet", visibility: "private",
        steps: [{ id: "s1", place: "Chez moi", text: "Étape" }],
        createdAt: Date.now(), passion: "musique",
      }];
      if (typeof renderFeed === "function") renderFeed();
    });

    expect(await idsDuFil(page)).toContain("c_moi");
    const ouvert = await page.evaluate(() => {
      openVlogViewer("c_moi");
      const v = document.getElementById("vlogViewer");
      return !!(v && v.classList.contains("open"));
    });
    expect(ouvert, "mon carnet privé doit s'ouvrir pour moi").toBe(true);
  });

  test("le lien partagé #carnet-<id> n'ouvre pas un carnet privé d'autrui", async ({ page }) => {
    await bootOnboarded(page);
    await injecter(page, [carnet("c_prive_lien", "u_autre", "private")]);
    await page.evaluate(() => { location.hash = "#carnet-c_prive_lien"; });
    await page.waitForTimeout(1200);
    await expect(page.locator("#vlogViewer.open")).toHaveCount(0);
  });
});
