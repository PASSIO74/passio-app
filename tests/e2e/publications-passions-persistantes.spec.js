// ═══════════════════════════════════════════════════════════════════════════
// MES PUBLICATIONS ET MES PASSIONS NE DISPARAISSENT PAS À LA RÉOUVERTURE
//
// Défaut vécu le 2026-11-14 (compte « ben test ordi », ordinateur) : publier
// en « Course à pied », quitter, rouvrir — la passion et la publication avaient
// disparu du profil. La publication était BIEN en base (table `posts`) ; c'est
// l'appareil qui l'avait perdue :
//   ① `_applyUserState` REMPLAÇAIT `userPosts` par celui d'un blob serveur
//      plus ancien (`[]`) ;
//   ② l'onglet « Publications » ne lisait QUE `state.userPosts` ;
//   ③ la passion réactivée sur l'appareil était re-archivée par le blob du
//      1er septembre (aucune date de réactivation pour arbitrer).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const COMPTE = "20762060-78c4-40b9-ad2a-ee7c1cb19857";
const AUTRE = "812aee2b-214f-4949-931e-842599b6d68b";
const ARCHIVEE_LE = Date.parse("2026-09-01T14:46:30Z");

async function attendreApp(page) {
  await page.waitForFunction(
    () => typeof state !== "undefined" && !!state && !!state.user
      && typeof reactiverPassionsPubliees === "function"
      && typeof _applyUserState === "function" && typeof renderProfileContent === "function",
    null, { timeout: 20000 },
  );
}

test.describe("Publications et passions persistantes", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000);
    await bootOnboarded(page);
    await attendreApp(page);
    await page.evaluate(() => { window._supaReal = false; });   // aucune écriture ne part
  });

  test("① la fusion serveur GARDE ma publication locale absente du blob (jamais celle d'un autre)", async ({ page }) => {
    const r = await page.evaluate(({ COMPTE, AUTRE }) => {
      MY_UID = COMPTE;
      state.deletedPostIds = [];
      state.userPosts = [
        { id: "post_moi", authorId: COMPTE, passion: "running", type: "text", text: "soirée", createdAt: Date.now() },
        { id: "post_autre", authorId: AUTRE, passion: "musique", type: "text", text: "pas à moi", createdAt: Date.now() },
      ];
      const blob = JSON.parse(JSON.stringify({ user: state.user, userPosts: [], onboarded: true }));
      _applyUserState(blob);
      return (state.userPosts || []).map((p) => p.id);
    }, { COMPTE, AUTRE });
    expect(r).toContain("post_moi");
    expect(r).not.toContain("post_autre");
  });

  test("② une passion archivée où j'ai publié APRÈS l'archivage revient ; un archivage postérieur reste", async ({ page }) => {
    const r = await page.evaluate(({ COMPTE, ARCHIVEE_LE }) => {
      MY_UID = COMPTE;
      state.deletedPostIds = [];
      state.userPosts = [];
      const base = state.user.profiles.filter((p) => p && !p.archived).slice(0, 1);
      state.user.profiles = base.concat([
        { id: "pr_run", name: "ben", passion: "running", emoji: "🏃", archived: true, archivedAt: ARCHIVEE_LE, createdAt: 1 },
        { id: "pr_moto", name: "ben", passion: "moto-enduro", emoji: "🏍", archived: true, archivedAt: Date.now(), createdAt: 1 },
      ]);
      window._mesPublicationsServeur = [
        { id: "p1", authorId: COMPTE, passion: "running", type: "photo", text: "soirée trkl", createdAt: Date.now() - 60000 },
        { id: "p2", authorId: COMPTE, passion: "moto-enduro", type: "text", text: "vieux", createdAt: ARCHIVEE_LE - 1000 },
      ];
      const n = reactiverPassionsPubliees();
      const run = state.user.profiles.find((p) => p.passion === "running");
      const moto = state.user.profiles.find((p) => p.passion === "moto-enduro");
      return { n, run: { archived: run.archived, restoredAt: run.restoredAt }, motoArchivee: moto.archived };
    }, { COMPTE, ARCHIVEE_LE });
    expect(r.n).toBe(1);
    expect(r.run.archived).toBe(false);
    expect(r.run.restoredAt).toBeGreaterThan(0);
    expect(r.motoArchivee).toBe(true);
  });

  test("③ l'onglet Publications montre ma publication relue en base, absente de la copie locale", async ({ page }) => {
    await page.evaluate(({ COMPTE }) => {
      MY_UID = COMPTE;
      state.deletedPostIds = [];
      state.userPosts = [];
      const vivante = state.user.profiles.find((p) => p && !p.archived);
      window._mesPublicationsServeur = [
        { id: "p_srv", authorId: COMPTE, passion: vivante.passion, type: "text", mood: "all",
          text: "publication relue en base", content: "publication relue en base", createdAt: Date.now(), likes: 0, comments: [] },
      ];
      goTo("profiles");
    }, { COMPTE });
    await page.evaluate(() => renderProfileContent());
    await expect(page.locator("#myPosts")).toContainText("publication relue en base");
  });

  test("④ restaurer une passion DATE le geste (restoredAt), qui arbitre la fusion", async ({ page }) => {
    const r = await page.evaluate(() => {
      state.user.profiles.push({ id: "pr_arch", name: "x", passion: "photo", emoji: "📷", archived: true, archivedAt: 5, createdAt: 1 });
      restaurerPassion("pr_arch", true);
      const pr = state.user.profiles.find((p) => p.id === "pr_arch");
      return { archived: pr.archived, restoredAt: pr.restoredAt };
    });
    expect(r.archived).toBe(false);
    expect(r.restoredAt).toBeGreaterThan(5);
  });
});
