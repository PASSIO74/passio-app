// ═══════════════════════════════════════════════════════════════════════════
// LOT-3 (audit UX/UI du 2026-11-10) — DU FIL À LA RENCONTRE, SANS RUPTURE
//   ① ② IRL-C50 / PCS-C03 : après « Je participe », jamais le retrait sous le
//        doigt ; la date est dite et la suite proposée (moteurs existants).
//   ③    BOB-C03 : les quatre actions d'une bobine tiennent dans l'écran.
//   ④    REC-C04 : la fiche d'une passion mène à Rencontrer, filtré.
//   ⑤    PCS-C01 / FIL-C01 : « Voir l'activité » paraît dès que l'activité est
//        connue, sans repeindre le fil.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

function evenement(id, extra) {
  return Object.assign({
    id, title: "Jam acoustique", passion: "musique", emoji: "🎸",
    eventType: "Jam session", organizerId: "u_lea",
    date: Date.now() + 3 * 86400000, time: "18:30",
    city: "Lyon", venue: "Café des Arts", price: 0, maxAttendees: 12,
    attendees: ["u_karim", "u_nina"], maybes: [], waitlist: [],
    desc: "On installe deux guitares et on joue ce qui vient.",
  }, extra || {});
}

async function boot(page) {
  await bootOnboarded(page, null, 1);
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.supaLoadEventPosts = async () => [];
    window.supaLoadEventComments = async () => [];
    window._supaReal = false;
  });
}

async function ouvrirFiche(page, events, id) {
  await page.evaluate(([evts]) => {
    state.seed.events = evts;
    state.userEvents = [];
    state.user.joinedEvents = [];
    state.user.eventRsvp = {};
  }, [events]);
  await page.evaluate((evId) => openEventDetails(evId), id);
  await expect(page.locator("#eventDetailPage")).toBeVisible();
}

for (const largeur of [360, 390]) {
  test(`① ${largeur} px : sous le doigt de l'inscription, jamais le retrait ; un second appui laisse inscrit`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 780 });
    await boot(page);
    await ouvrirFiche(page, [evenement("ev_lot3")], "ev_lot3");
    const b = await page.locator("#eventDetailCta [data-v4b-rsvp-go]").boundingBox();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(400);
    const dessous = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el && el.closest("[data-v4b-rsvp-remove]") ? "retrait" : "autre";
    }, [cx, cy]);
    expect(dessous, "ce qui est sous le doigt juste après l'inscription").toBe("autre");
    await page.evaluate(() => { window.openEventChat = () => {}; window.openEventInvite = () => {}; });
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => myRsvp("ev_lot3"))).toBe("going");
    await expect(page.locator("#eventDetailCta [data-v4b-rsvp-remove]")).toHaveText("Je ne peux plus venir");
  });
}

test("② après « Je participe » : la date est dite, « Écrire aux participants » ouvre la discussion existante", async ({ page }) => {
  await boot(page);
  await ouvrirFiche(page, [evenement("ev_lot3b")], "ev_lot3b");
  await page.locator("#eventDetailCta [data-v4b-rsvp-go]").click();
  const cta = page.locator("#eventDetailCta");
  await expect(cta.locator("[data-v4b-rsvp-etat]")).toHaveText("✓ Tu participes");
  await expect(cta.locator(".v4b-rsvp-detail")).toContainText("l'organisation est prévenue");
  await expect(cta.locator("[data-v4b-rsvp-inviter]")).toBeVisible();
  await page.evaluate(() => { window.__chat = null; window.openEventChat = (id) => { window.__chat = id; }; });
  await cta.locator("[data-v4b-rsvp-chat]").click();
  expect(await page.evaluate(() => window.__chat)).toBe("ev_lot3b");
});

for (const largeur of [360, 390]) {
  test(`③ ${largeur} px : les quatre actions d'une bobine sont entièrement dans l'écran`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 780 });
    await boot(page);
    await page.evaluate(() => openReels());
    await page.waitForSelector(".reel-item .v5-actions-grille", { timeout: 15000 });
    const r = await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll(".reel-item .v5-actions-grille")).find((x) => { const b = x.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight && b.width > 0; })
        || document.querySelector(".reel-item .v5-actions-grille");
      return Array.from(row.querySelectorAll(".v5-chip")).map((c) => { const b = c.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), h: Math.round(b.height), t: c.textContent }; });
    });
    expect(r.length).toBe(4);
    for (const c of r) {
      expect(c.l, c.t).toBeGreaterThanOrEqual(0);
      expect(c.r, c.t).toBeLessThanOrEqual(largeur);
      expect(c.h, c.t).toBeGreaterThanOrEqual(44);
    }
  });
}

test("④ la fiche d'une passion propose « Voir les activités », qui ouvre Rencontrer filtré sur elle", async ({ page }) => {
  await boot(page);
  await page.evaluate((ev) => { state.seed.events = [ev]; }, evenement("ev_lot3c"));
  await page.evaluate(() => openPassionExplorer("musique"));
  const porte = page.locator("#modalContent .pex-activites");
  await expect(porte).toBeVisible();
  await expect(porte).toContainText("à venir");
  await porte.click();
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => ({ irl: document.getElementById("screen-irl").classList.contains("active"), filtre: (typeof irlPassionFilters !== "undefined" && irlPassionFilters.has) ? irlPassionFilters.has("musique") : null }));
  expect(r).toEqual({ irl: true, filtre: true });
});

test("⑤ « Voir l'activité » paraît dès que l'activité arrive, sans geste ni repeint du fil", async ({ page }) => {
  await boot(page);
  // Une publication reliée à une activité PAS ENCORE connue : aucune porte.
  await page.evaluate(() => {
    state.seed.events = (state.seed.events || []).filter((e) => e.id !== "ev_lot3d");
    state.supabasePosts = [{ id: "p_lot3d", authorId: "u_tom", authorName: "Tom", authorEmoji: "🎸", authorColor: "#7c3aed", passion: "musique", mood: "irl", type: "text", text: "Qui vient jouer samedi ?", createdAt: Date.now() - 1000, timestamp: Date.now() - 1000, likes: 0, comments: [], fromSupabase: true, eventId: "ev_lot3d" }];
    window._feedDomSig = null; renderFeed();
  });
  await page.waitForTimeout(600);
  const porte = page.locator('#feedList article[data-postid="p_lot3d"] .v3-tempt');
  await expect(porte).toHaveCount(0);
  // L'activité arrive du serveur, par le chemin ordinaire de la relecture.
  const repeintAvant = await page.evaluate(() => { window.__repeints = 0; const r = window.renderFeed; window.renderFeed = function () { window.__repeints++; return r.apply(this, arguments); }; return true; });
  expect(repeintAvant).toBe(true);
  // `rafraichirEvenements` ne lit que sous un client réel : on en pose un factice
  // (aucune requête ne part — la lecture elle-même est remplacée).
  const change = await page.evaluate((ev) => {
    window._supaReal = true;
    if (typeof supa === "undefined" || !supa) { try { supa = {}; } catch (e) {} }
    window.supaLoadEvents = async () => [Object.assign({ fromSupabase: true }, ev)];
    return rafraichirEvenements(true);
  }, evenement("ev_lot3d"));
  expect(change, "l'activité est bien arrivée par la relecture").toBe(true);
  await expect(porte).toHaveCount(1, { timeout: 2000 });
  expect(await page.evaluate(() => window.__repeints), "le fil n'est pas repeint").toBe(0);
});
