// ═══════════════════════════════════════════════════════════════════════════
// Fiche activité — pas de doublon entre le corps et le pied (2026-11-23).
// Benjamin : « il y a deux fois Gérer l'activité et Écrire aux participants,
// garde seulement les deux grands onglets en bas ». Le pied de l'organisation
// porte « Écrire aux participants » et « Gérer l'activité » : les boutons du
// corps qui font le même geste (`openEventChat`, `openEventManage`) sont
// masqués, et reviennent quand le pied ne les porte plus.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

function activite(extra) {
  return Object.assign({
    id: "ev_dbl_" + Math.random().toString(36).slice(2), title: "Atelier doublons", passion: "musique", emoji: "🎸",
    city: "Lyon", lat: 45.76, lng: 4.83, date: Date.now() + 2 * 864e5, time: "18:00",
    desc: "", attendees: ["u_a", "u_b"], maybes: [], waitlist: [], checkedIn: [], organizerId: "org_autre", authorId: "org_autre", status: "active",
  }, extra || {});
}

function visibles(page) {
  return page.evaluate(() => {
    const vis = (sel) => Array.from(document.querySelectorAll(sel)).filter((b) => b.offsetParent !== null).length;
    return {
      corpsChat: vis('#eventDetailContent button[onclick^="openEventChat("]'),
      corpsGerer: vis('#eventDetailContent button[onclick^="openEventManage("]'),
      piedChat: vis("#eventDetailCta [data-v4b-rsvp-chat]"),
      piedGerer: vis("#eventDetailCta [data-v4b-rsvp-gerer]"),
      calendrier: vis('#eventDetailContent button[onclick^="downloadEventIcs("]'),
      inviter: vis('#eventDetailContent button[onclick^="openEventInvite("]'),
    };
  });
}

test("organisation : « Écrire aux participants » et « Gérer l'activité » une seule fois, en bas", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate((ev) => {
    window.supaLoadEventComments = async () => [];
    ev.organizerId = ev.authorId = (typeof MY_UID !== "undefined" && MY_UID) || "me";
    state.userEvents = [ev];
    openEventDetails(ev.id);
  }, activite());
  await expect(page.locator("#eventDetailCta")).toContainText("Tu organises");
  await expect.poll(() => visibles(page)).toEqual({ corpsChat: 0, corpsGerer: 0, piedChat: 1, piedGerer: 1, calendrier: 1, inviter: 1 });
  // Masqués, pas retirés : le geste existe toujours dans le DOM.
  expect(await page.locator('#eventDetailContent [data-v4b-doublon="1"]').count()).toBe(2);
  // La section « discussion » n'a plus rien de visible : elle ne laisse pas de blanc.
  await expect(page.locator('#eventDetailContent [data-v4b-sec="discussion"]')).toBeHidden();
});

test("non inscrit : la discussion reste dans le corps ; inscrit : une seule fois, en bas", async ({ page }) => {
  await bootOnboarded(page);
  const ev = activite();
  await page.evaluate((e) => {
    window.supaLoadEventComments = async () => [];
    state.userEvents = [e];
    state.user.eventRsvp = {};
    openEventDetails(e.id);
  }, ev);
  await expect(page.locator("#eventDetailCta [data-v4b-rsvp-go]")).toBeVisible();
  await expect.poll(async () => (await visibles(page)).corpsChat).toBe(1);

  await page.locator("#eventDetailCta [data-v4b-rsvp-go]").click();
  await expect(page.locator("#eventDetailCta [data-v4b-rsvp-chat]")).toBeVisible();
  await expect.poll(async () => (await visibles(page)).corpsChat).toBe(0);
});
