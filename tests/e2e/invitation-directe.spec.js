// Inviter DIRECTEMENT des personnes depuis « Créer une activité » (2026-11-27,
// demande de Benjamin : « dans créer une activité rajoute la possibilité de
// pouvoir inviter directement des gens »).
//
// Ce que cette suite prouve :
//   ① le formulaire ordinaire porte « Inviter des personnes » : conversations
//      récentes puis abonnements, pastilles retirables, bouton « Publier et
//      inviter N personnes » qui revient à son libellé — RIEN ne part avant ;
//   ② publiée (publique) : chaque invité reçoit la notification, la carte part
//      dans notre conversation 1:1 quand elle existe, aucune n'est créée ;
//   ③ privée : le droit de lecture part UNE fois pour tous, avant les notifications ;
//   ③ bis fenêtre fermée pendant la publication : les invités sont quand même invités ;
//   ④ un invité refusé par le verdict serveur ne reçoit rien ;
//   ⑤ ni à l'édition, ni sous coupure ; sans invité, rien ne part ;
//      depuis une conversation, le bandeau de la conversation remplace la section.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function banc(page, opts = {}) {
  await bootOnboarded(page, opts.errors || null, 1, {});
  await page.evaluate((o) => {
    ["supaUpdateEvent", "supaJoinEvent", "supaLeaveEvent", "supaSetEventRsvp", "supaLoadEvents",
      "supaLoadMyRsvps", "supaLoadEventCommentCounts", "supaCreateEventConversation",
      "supaJoinEventConversation", "supaLeaveEventConversation",
    ].forEach((fn) => { window[fn] = async () => null; });
    window.supaPublishEvent = async () => true;
    window.passioGeocode = async () => null;
    window._geocodeAddress = async () => null;
    window._supaReal = true;
    window.publierActiviteAuFil = () => {};
    window._joinEventConversation = async () => true;
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window._convNetLoaded = true;
    const refuses = o.refuses || [];
    window.irlProposalServerVerdict = async (id) => (refuses.indexOf(id) > -1 ? { ok: false, reason: "blocked" } : { ok: true, reason: "ok" });
    window.__notifs = [];
    window.supaInsertNotif = (to, kind, ref, txt) => { window.__notifs.push({ to, kind, ref, txt }); };
    window.__invites = [];
    window.supaInviterActivite = async (evId, ids) => { window.__invites.push({ evId, ids: ids.slice(), nNotifs: window.__notifs.length }); return true; };
    window.__envois = [];
    window._sendTextToSupa = (convId, msgId, content) => { window.__envois.push({ convId, msgId, content }); };
    state.userEvents = [];
    state.seed.events = [];
    [["u_id_nina", "Nina Costa"], ["u_id_leo", "Léo Martin"], ["u_id_sam", "Sam Durand"]]
      .forEach(([id, username]) => cacheRemoteProfile({ id, username }));
    state.user.following = ["u_id_sam"];
    const t = Date.now();
    conversationsState = [
      { id: "id_nina", userId: "u_id_nina", userName: "Nina Costa", lastAt: t - 60000, unread: 0, archived: false, pinned: false,
        messages: [{ id: "m1", from: "u_id_nina", text: "Coucou", at: t - 60000 }] },
      { id: "id_leo", userId: "u_id_leo", userName: "Léo Martin", lastAt: t - 120000, unread: 0, archived: false, pinned: false,
        messages: [{ id: "m2", from: "u_id_leo", text: "Salut", at: t - 120000 }] },
    ];
  }, opts);
}

const bandeau = (page) => page.locator("#evInviteBandeau");
const publierBtn = (page) => page.locator('#modalContent button[onclick^="submitEvent"]');

async function ouvrir(page) {
  await page.evaluate(() => openCreateEvent());
  await page.waitForSelector("#evInviteBandeau.ev-invite-directe", { timeout: 8000 });
  await page.waitForTimeout(150);
}

async function ajouter(page, nom) {
  const picker = bandeau(page).locator(".ev-invite-picker");
  if (await picker.isHidden()) await bandeau(page).locator(".ev-invite-ajouter").click();
  await bandeau(page).locator(".ev-invite-ligne", { hasText: nom }).locator("button").click();
}

async function publier(page) {
  await page.locator("#evTitle").fill("Balade du dimanche");
  await page.locator("#evTime").fill("18:00");
  await page.evaluate(() => { document.getElementById("evCity").value = "Annecy"; });
  await page.evaluate(() => submitEvent());
  await expect.poll(() => page.evaluate(() => state.userEvents.length)).toBe(1);
}

test.describe("Inviter directement depuis « Créer une activité »", () => {
  test("① la section : candidats, pastilles, bouton — rien ne part avant la publication", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await banc(page, { errors });
    await ouvrir(page);
    await expect(bandeau(page).locator("strong")).toHaveText("Inviter des personnes");
    const libelle = await publierBtn(page).textContent();
    await bandeau(page).locator(".ev-invite-ajouter").click();
    const noms = await bandeau(page).locator(".ev-invite-ligne-nom").allTextContents();
    expect(noms.indexOf("Nina Costa")).toBeGreaterThan(-1);
    expect(noms.indexOf("Sam Durand")).toBeGreaterThan(noms.indexOf("Léo Martin"));

    await ajouter(page, "Léo Martin");
    await ajouter(page, "Sam Durand");
    await expect(bandeau(page).locator(".ev-invite-chip")).toHaveCount(2);
    await expect(bandeau(page).locator("strong")).toHaveText("Tu invites 2 personnes");
    await expect(publierBtn(page)).toHaveText("Publier et inviter 2 personnes");

    await bandeau(page).locator('.ev-invite-chip[data-invite="u_id_sam"] .ev-invite-chip-x').click();
    await expect(publierBtn(page)).toHaveText("Publier et inviter 1 personne");
    await bandeau(page).locator('.ev-invite-chip[data-invite="u_id_leo"] .ev-invite-chip-x').click();
    await expect(publierBtn(page)).toHaveText(libelle);

    expect(await page.evaluate(() => window.__notifs.length)).toBe(0);
    expect(await page.evaluate(() => window.__envois.length)).toBe(0);
    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("② publiée : notification pour chacun, carte dans le 1:1 existant seulement", async ({ page }) => {
    await banc(page);
    await ouvrir(page);
    await ajouter(page, "Léo Martin");
    await ajouter(page, "Sam Durand");
    const nbConvs = await page.evaluate(() => getConversations().length);
    await publier(page);
    await expect.poll(() => page.evaluate(() => window.__notifs.length)).toBe(2);
    const r = await page.evaluate(() => ({ id: state.userEvents[0].id, notifs: window.__notifs, envois: window.__envois, invites: window.__invites }));
    expect(r.notifs.map((n) => n.to).sort()).toEqual(["u_id_leo", "u_id_sam"]);
    r.notifs.forEach((n) => { expect(n.kind).toBe("event_invite"); expect(n.ref).toBe(r.id); });
    expect(r.envois.map((e) => e.convId)).toEqual(["id_leo"]);
    expect(r.invites).toEqual([]); // publique : aucun droit de lecture à poser
    expect(await page.evaluate(() => getConversations().length)).toBe(nbConvs);
    const leo = await page.evaluate(() => getConversations().find((c) => c.id === "id_leo").messages);
    expect(leo[leo.length - 1].text).toContain("Je t'invite à une activité");
  });

  test("③ privée : le droit de lecture part une fois pour tous, avant les notifications", async ({ page }) => {
    await banc(page);
    await ouvrir(page);
    await page.locator('label[for="evVisPrivee"]').click();
    await ajouter(page, "Nina Costa");
    await ajouter(page, "Sam Durand");
    await publier(page);
    await expect.poll(() => page.evaluate(() => window.__notifs.length)).toBe(2);
    const r = await page.evaluate(() => ({ id: state.userEvents[0].id, invites: window.__invites, vis: state.userEvents[0].visibilite }));
    expect(r.vis).toBe("privee");
    expect(r.invites.length).toBe(1); // un seul lot, jamais reposé invité par invité
    expect(r.invites[0].evId).toBe(r.id);
    expect(r.invites[0].ids.sort()).toEqual(["u_id_nina", "u_id_sam"]);
    expect(r.invites[0].nNotifs).toBe(0);
  });

  test("③ bis fermer la fenêtre pendant la publication ne perd pas les invités", async ({ page }) => {
    await banc(page);
    await ouvrir(page);
    await ajouter(page, "Léo Martin");
    await page.locator("#evTitle").fill("Balade du dimanche");
    await page.locator("#evTime").fill("18:00");
    await page.evaluate(() => {
      document.getElementById("evCity").value = "Annecy";
      const lent = () => new Promise((r) => setTimeout(() => r(null), 800));
      window.passioGeocode = lent; window._geocodeAddress = lent;
      submitEvent();
      setTimeout(() => { try { closeModal(); } catch (e) {} }, 100);
    });
    await expect.poll(() => page.evaluate(() => state.userEvents.length)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__notifs.map((n) => n.to))).toEqual(["u_id_leo"]);
  });

  test("④ un invité refusé par le verdict serveur ne reçoit rien", async ({ page }) => {
    await banc(page, { refuses: ["u_id_sam"] });
    await ouvrir(page);
    await ajouter(page, "Léo Martin");
    await ajouter(page, "Sam Durand");
    await expect(bandeau(page).locator(".ev-invite-chip")).toHaveCount(1);
    await publier(page);
    await expect.poll(() => page.evaluate(() => window.__notifs.length)).toBe(1);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__notifs.map((n) => n.to))).toEqual(["u_id_leo"]);
  });

  test("⑤ sans invité rien ne part ; ni à l'édition, ni sous coupure ; la conversation prend la place", async ({ page }) => {
    await banc(page);
    await ouvrir(page);
    await publier(page);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__notifs.length)).toBe(0);
    expect(await page.evaluate(() => window.__envois.length)).toBe(0);

    const evId = await page.evaluate(() => state.userEvents[0].id);
    await page.evaluate((id) => openCreateEvent(id), evId);
    await page.waitForSelector("#evTitle");
    await expect(bandeau(page)).toHaveCount(0);
    await page.evaluate(() => closeModal());

    await page.evaluate(() => { window.PASSIO_INVITE_DIRECTE = false; openCreateEvent(); });
    await page.waitForSelector("#evTitle");
    await expect(bandeau(page)).toHaveCount(0);
    await page.evaluate(() => { closeModal(); window.PASSIO_INVITE_DIRECTE = true; });

    // Depuis une conversation : un seul bandeau, celui de la conversation.
    await page.evaluate(() => goTo("messages"));
    await page.evaluate(() => openConversation("id_nina"));
    await page.waitForFunction(() => window._openedConvId, null, { timeout: 5000 });
    await page.waitForTimeout(250);
    await page.evaluate(() => window.PassioProposerIrl(true));
    await page.waitForSelector("#evInviteBandeau:not(.ev-invite-directe)", { timeout: 8000 });
    await expect(bandeau(page)).toHaveCount(1);
    await expect(bandeau(page).locator("strong")).toHaveText("Invitation pour Nina Costa");
  });
});
