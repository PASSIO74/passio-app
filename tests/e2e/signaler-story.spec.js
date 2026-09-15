// Chantier 5 (MOD-02 résidu / AUTH-11 / MOD-09) — une story se signale, et tout
// signalement laisse un accusé de réception.
//
// LES DÉFAUTS (contre-revue Astra) : les stories n'avaient AUCUNE porte de
// signalement (MOD-02 n'avait ouvert que celle des publications) ; un
// signalement envoyé ne laissait qu'un toast qui disparaît — aucun accusé de
// réception (DSA art. 16.4), aucun endroit où la décision pourrait arriver.
// Ce que cette suite exige : ① le viewer d'une story d'un AUTRE compte réel
// porte une porte « ⋯ » → « Signaler cette story » (RÉINJECTION) ; ② ma story
// et une story de démonstration n'en ont pas ; ③ `reportStory` envoie
// `target_type = story` avec le motif, lit le verdict, et pose l'accusé de
// réception dans la cloche (RÉINJECTION) ; ④ une publication signalée reçoit
// le même accusé ; ⑤ la décision serveur (kind `moderation`) a sa cloche.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_LEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate(([moi, lea]) => {
    window._supaReal = true;
    window.__toasts = []; window.toast = (t) => window.__toasts.push(String(t));
    window.__reports = []; window.__ok = true;
    window.supaReport = async (type, id, motif) => { window.__reports.push({ type, id, motif }); return window.__ok; };
    window.supaMarkStoryView = async () => {};
    window.requireAuthentication = () => true;
    state.notifications = [];
    const t = Date.now();
    state.seed.stories = [
      { id: "st_lea", authorId: lea, authorName: "Léa", text: "story de Léa", content: "story de Léa", createdAt: t - 60000 },
      { id: "st_moi", authorId: moi, authorName: "Moi", text: "ma story", content: "ma story", createdAt: t - 50000 },
      { id: "st_demo", authorId: "u_demo", authorName: "Démo", text: "story démo", content: "story démo", createdAt: t - 40000 },
    ];
    state.seed.users = (state.seed.users || []).concat([{ id: lea, name: "Léa", avatar: "#888", profileEmoji: "🎸" }, { id: "u_demo", name: "Démo", avatar: "#888", profileEmoji: "✨" }]);
    renderStories();
  }, [UID_MOI, UID_LEA]);
}
const porte = (page) => page.evaluate(() => { const b = document.getElementById("storyReportBtn"); return !!(b && b.offsetParent !== null); });

test.describe("chantier 5 — signaler une story, accuser réception", () => {
  test("① la story d'un autre compte réel porte la porte de signalement", async ({ page }) => {
    await banc(page);
    await page.evaluate((lea) => openStoryGroup(lea), UID_LEA);
    // RÉINJECTION : `#storyReportBtn` n'existe pas sur le code d'avant.
    expect(await porte(page)).toBe(true);
    expect(await page.evaluate(() => document.getElementById("storyReportBtn").getAttribute("aria-label"))).toBe("Signaler cette story");
  });

  test("② ma story et une story de démonstration : aucune porte", async ({ page }) => {
    await banc(page);
    await page.evaluate((moi) => openStoryGroup(moi), UID_MOI);
    expect(await porte(page)).toBe(false);
    await page.evaluate(() => { closeStoryViewer(); openStoryGroup("u_demo"); });
    expect(await porte(page)).toBe(false);
  });

  test("③ signaler : target_type story + motif, verdict lu, accusé de réception dans la cloche", async ({ page }) => {
    await banc(page);
    await page.evaluate((lea) => openStoryGroup(lea), UID_LEA);
    await page.click("#storyReportBtn");
    await page.click("#storyReportGo");
    await page.waitForSelector("#signalementMotif");
    await page.fill("#signalementMotif", "contenu déplacé");
    await page.evaluate(() => _signalementValider());
    await page.waitForFunction(() => window.__reports.length === 1);
    const r = await page.evaluate(() => ({ reports: window.__reports, toasts: window.__toasts.slice(), notifs: (state.notifications || []).map((n) => n.text || n.content || "") }));
    expect(r.reports[0]).toEqual({ type: "story", id: "st_lea", motif: "contenu déplacé" });
    expect(r.toasts.some((t) => /Story signalée/.test(t))).toBe(true);
    // RÉINJECTION : sur le code d'avant, aucune notification locale « Signalement reçu ».
    expect(r.notifs.some((t) => /Signalement reçu/.test(t))).toBe(true);
  });

  test("③ bis refus serveur : dit, sans accusé de réception", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__ok = false; window.__toasts = []; state.notifications = [];
      window._demanderMotifSignalement = async () => "x";
      const ok = await reportStory("st_lea");
      return { ok, toasts: window.__toasts.slice(), notifs: (state.notifications || []).filter((n) => /Signalement reçu/.test(n.text || n.content || "")).length };
    });
    expect(r.ok).toBe(false);
    expect(r.toasts.some((t) => /impossible pour le moment/.test(t))).toBe(true);
    expect(r.notifs).toBe(0);
  });

  test("④ une publication signalée reçoit le même accusé de réception", async ({ page }) => {
    await banc(page);
    const n = await page.evaluate(async () => {
      state.notifications = []; window._demanderMotifSignalement = async () => "spam";
      await reportPost("p_quelconque");
      return (state.notifications || []).filter((x) => /Signalement reçu/.test(x.text || x.content || "")).length;
    });
    expect(n).toBe(1);
  });

  test("⑤ la décision du serveur (kind moderation) a sa cloche 🛡️", async ({ page }) => {
    await banc(page);
    expect(await page.evaluate(() => _notifEmoji("moderation"))).toBe("🛡️");
  });
});
