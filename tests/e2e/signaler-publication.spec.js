// MOD-02 — une publication d'autrui a une porte de signalement.
//
// `reportPost` existait (motif demandé, verdict serveur lu), mais AUCUNE surface
// ne l'appelait : le ⋯ n'était rendu que sur ses propres publications. Un
// contenu illicite dans le fil n'avait pas de porte de signalement — ce que le
// DSA (art. 16) exige d'un hébergeur. Le ⋯ existe désormais sur la publication
// d'autrui et ouvre « Signaler / Bloquer » ; le contenu de démonstration (auteur
// `u_…`, absent de la base) n'en a pas.
//
//   ① fil : la publication d'un compte réel porte le ⋯ (RÉINJECTION), la mienne
//      aussi (suppression), la démo non ;
//   ② le ⋯ d'autrui ouvre la feuille avec « Signaler » et « Bloquer <nom> » ;
//   ③ « Signaler » appelle `reportPost` sur la bonne publication (câblage) ;
//   ④ vue détail : même règle ;
//   ⑤ à la SOURCE : un seul constructeur de bouton, appelé par les deux rendus.
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_LEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function preparer(page) {
  await bootOnboarded(page);
  await page.evaluate((lea) => {
    state.hintsVus = { feed_auteur: true, profil_visite: true, second_profil: true };
    try { fermerHint(); } catch (e) {}
    cacheRemoteProfile({ id: lea, username: "Léa", emoji: "🌿", color: "#22c55e" });
    state.supabasePosts = [{ id: "p_lea", authorId: lea, text: "publication de Léa", passion: "musique", mood: "all",
      createdAt: Date.now() - 1000, likes: 0, comments: [], _source: "supabase" }];
    state.userPosts = [{ id: "p_moi", authorId: "me", text: "ma publication", passion: "musique", mood: "all",
      createdAt: Date.now(), likes: 0, comments: [], _source: "user" }];
    state.feedFollowingOn = true; state.user.following = [lea];
    _feedDomSig = null; window._lastHtml = null;
    renderFeed();
  }, UID_LEA);
}

test.describe("MOD-02 — signaler une publication", () => {
  test("① le ⋯ existe sur la publication d'un compte réel, la mienne, jamais la démo", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate((lea) => {
      const lea_ = document.querySelector('[data-post-id="p_lea"], #post-p_lea, .post-card[data-id="p_lea"]');
      const html = document.getElementById("feedList").innerHTML;
      return {
        autrui: /openPostOptionsAutrui\('p_lea'\)/.test(html),
        moi: /openPostOptions\('p_moi'\)/.test(html),
        demo: (html.match(/openPostOptionsAutrui\('/g) || []).length,
        demoAuteurs: /openPostOptionsAutrui\('[^']*'\)[^<]*<\/button>/.test(html),
      };
    }, UID_LEA);
    // RÉINJECTION : sur le code d'avant, `openPostOptionsAutrui` n'existe nulle part.
    expect(r.autrui, "la publication de Léa porte le ⋯ « signaler ou bloquer »").toBe(true);
    expect(r.moi, "la mienne garde son ⋯ de suppression").toBe(true);
    expect(r.demo, "une seule publication d'autrui réelle : la démo (auteurs u_…) n'a pas de ⋯").toBe(1);
  });

  test("② le ⋯ d'autrui ouvre « Signaler » et « Bloquer Léa »", async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => openPostOptionsAutrui("p_lea"));
    const feuille = page.locator("#modalBackdrop.active .post-options-sheet");
    await expect(feuille).toBeVisible();
    await expect(feuille).toContainText("Signaler cette publication");
    await expect(feuille).toContainText("Bloquer Léa");
  });

  test("③ « Signaler » appelle reportPost sur la bonne publication", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async () => {
      window.__signales = [];
      window.reportPost = async (id) => { window.__signales.push(id); };
      openPostOptionsAutrui("p_lea");
      document.querySelector("#modalBackdrop.active .post-options-sheet .post-option").click();
      await new Promise((r) => setTimeout(r, 50));
      return { signales: window.__signales, ferme: !document.getElementById("modalBackdrop").classList.contains("active") };
    });
    expect(r.signales).toEqual(["p_lea"]);
    expect(r.ferme).toBe(true);
  });

  test("④ la vue détail d'une publication d'autrui porte le même ⋯", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async () => {
      await openPost("p_lea");
      const html = (document.getElementById("postDetailContent") || {}).innerHTML || "";
      return { autrui: /openPostOptionsAutrui\('p_lea'\)/.test(html) };
    });
    expect(r.autrui).toBe(true);
  });

  test("⑤ à la SOURCE : un seul constructeur, appelé par le fil et le détail", () => {
    const app02 = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-02-state-utils.js"), "utf8");
    expect((app02.match(/_boutonOptionsPost\(/g) || []).length, "définition + 2 appels").toBeGreaterThanOrEqual(3);
    expect(app02).not.toMatch(/_estMonPost\(p\) \? `<button class="post-menu-btn"/);
  });
});
