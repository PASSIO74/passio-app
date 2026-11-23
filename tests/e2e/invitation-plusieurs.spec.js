// Inviter PLUSIEURS personnes à une activité créée depuis une conversation
// (2026-11-23, demande de Benjamin : « pouvoir rajouter d'autres membres »).
//
// Ce que cette suite prouve :
//   ① « + Ajouter des personnes » propose mes conversations récentes puis mes
//      abonnements ; ajouter fait des pastilles retirables, le bouton dit
//      « Créer et inviter 3 personnes » — et RIEN ne part avant la publication ;
//   ② publiée : la carte part dans la conversation d'origine ET dans la
//      conversation 1:1 existante de chaque invité ; un invité sans conversation
//      ne reçoit que la notification (aucune conversation créée d'office) ;
//      la carte de l'organisateur décompte « 3 invités · 3 en attente » et
//      porte « Inviter d'autres » ;
//   ③ un invité que le verdict serveur refuse repart de la liste et ne reçoit rien ;
//   ④ plafond : 10 personnes au plus ;
//   ⑤ un nom hostile reste du texte dans les pastilles et la liste ;
//   ⑥ groupe : l'entrée existe, les membres sont pré-cochés, la carte part UNE
//      fois dans le groupe, chaque membre reçoit la notification ; une
//      discussion d'activité (`evgrp_`) n'est jamais invitable ;
//   ⑥ bis un membre de groupe refusé par le verdict n'est ni notifié ni compté ;
//   ⑥ ter/quater/quinquies personne d'admis → rien ne part ; un membre parti
//      n'est pas notifié ; ni `evgrp_`, ni proposeur mineur, ni coupure ;
//   ⑦ le décompte suit les réponses (vient / hésite / en attente).
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
    window.__envois = [];
    window._sendTextToSupa = (convId, msgId, content) => { window.__envois.push({ convId, msgId, content }); };
    state.userEvents = [];
    state.seed.events = [];
    const profils = [["u_ip_nina", "Nina Costa"], ["u_ip_leo", "Léo Martin"], ["u_ip_sam", "Sam Durand"],
      ["u_ip_hostile", "<img src=x onerror=window.__xss=1>"]];
    for (let i = 0; i < 12; i++) profils.push(["u_ip_f" + i, "Abonné " + i]);
    profils.forEach(([id, username]) => cacheRemoteProfile({ id, username }));
    state.user.following = ["u_ip_sam", "u_ip_hostile"].concat(o.beaucoup ? Array.from({ length: 12 }, (_, i) => "u_ip_f" + i) : []);
    const t = Date.now();
    conversationsState = [
      { id: "ip_nina", userId: "u_ip_nina", userName: "Nina Costa", lastAt: t - 60000, unread: 0, archived: false, pinned: false,
        messages: [{ id: "m1", from: "u_ip_nina", text: "On fait un truc ?", at: t - 60000 }] },
      { id: "ip_leo", userId: "u_ip_leo", userName: "Léo Martin", lastAt: t - 120000, unread: 0, archived: false, pinned: false,
        messages: [{ id: "m2", from: "u_ip_leo", text: "Salut", at: t - 120000 }] },
      { id: "ip_grp", isGroup: true, groupName: "Les grimpeurs", userIds: ["me", "u_ip_leo", "u_ip_sam"], createdBy: MY_UID,
        lastAt: t - 180000, unread: 0, archived: false, pinned: false,
        messages: [{ id: "m3", from: "u_ip_leo", text: "Qui grimpe samedi ?", at: t - 180000 }] },
      { id: "evgrp_ip_x", isGroup: true, groupName: "📍 Sortie", userIds: ["me", "u_ip_leo"], lastAt: t - 240000,
        unread: 0, archived: false, pinned: false, messages: [] },
    ];
  }, opts);
}

async function ouvrirEtProposer(page, convId) {
  await page.evaluate(() => goTo("messages"));
  await page.evaluate((cid) => openConversation(cid), convId);
  await page.waitForFunction(() => window._openedConvId, null, { timeout: 5000 });
  await page.waitForTimeout(250);
  await page.evaluate(() => window.PassioProposerIrl(true));
  await page.waitForSelector("#evInviteBandeau", { timeout: 8000 });
  await page.waitForTimeout(150);
}

async function ouvrirGroupe(page, convId) {
  await page.evaluate(() => goTo("messages"));
  await page.evaluate((cid) => openConversation(cid), convId);
  await page.waitForFunction((cid) => window._openedConvId === cid, convId, { timeout: 5000 });
  await page.waitForTimeout(300);
}

async function ajouter(page, nom) {
  const picker = page.locator("#evInviteBandeau .ev-invite-picker");
  if (await picker.isHidden()) await page.locator("#evInviteBandeau .ev-invite-ajouter").click();
  await page.locator("#evInviteBandeau .ev-invite-ligne", { hasText: nom }).locator("button").click();
}

const publierBtn = (page) => page.locator('#modalContent button[onclick^="submitEvent"]');

async function publier(page) {
  await page.evaluate(() => { document.getElementById("evCity").value = "Annecy"; });
  await page.evaluate(() => submitEvent());
  await expect.poll(() => page.evaluate(() => state.userEvents.length)).toBe(1);
}

const messages = (page, id) => page.evaluate((cid) => getConversations().find((c) => c.id === cid).messages, id);

test.describe("Inviter plusieurs personnes à une activité", () => {
  test("① ajouter des personnes : pastilles, bouton, rien ne part avant la publication", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await banc(page, { errors });
    await ouvrirEtProposer(page, "ip_nina");
    await page.locator("#evInviteBandeau .ev-invite-ajouter").click();
    const noms = await page.locator("#evInviteBandeau .ev-invite-ligne-nom").allTextContents();
    // Conversations récentes d'abord (Léo), puis abonnements (Sam) ; jamais Nina elle-même.
    expect(noms.indexOf("Léo Martin")).toBeGreaterThan(-1);
    expect(noms.indexOf("Sam Durand")).toBeGreaterThan(noms.indexOf("Léo Martin"));
    expect(noms).not.toContain("Nina Costa");

    await ajouter(page, "Léo Martin");
    await ajouter(page, "Sam Durand");
    await expect(page.locator("#evInviteBandeau .ev-invite-chip")).toHaveCount(2);
    await expect(publierBtn(page)).toHaveText("Créer et inviter 3 personnes");
    await expect(page.locator("#evInviteBandeau strong")).toHaveText("Invitation pour Nina Costa et 2 autres");
    // Recherche.
    await page.fill("#evInviteBandeau .ev-invite-recherche", "zzz");
    await expect(page.locator("#evInviteBandeau .ev-invite-vide")).toBeVisible();

    // Retirer une pastille.
    await page.locator('#evInviteBandeau .ev-invite-chip[data-invite="u_ip_sam"] .ev-invite-chip-x').click();
    await expect(page.locator("#evInviteBandeau .ev-invite-chip")).toHaveCount(1);
    await expect(publierBtn(page)).toHaveText("Créer et inviter 2 personnes");

    expect(await page.evaluate(() => window.__notifs.length)).toBe(0);
    expect(await page.evaluate(() => window.__envois.length)).toBe(0);
    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("② publiée : chaque invité la reçoit, sans conversation créée d'office", async ({ page }) => {
    await banc(page);
    await ouvrirEtProposer(page, "ip_nina");
    await ajouter(page, "Léo Martin");
    await ajouter(page, "Sam Durand");
    const nbConvs = await page.evaluate(() => getConversations().length);
    await publier(page);
    await expect.poll(() => page.evaluate(() => window.__notifs.length)).toBe(3);

    const r = await page.evaluate(() => ({ id: state.userEvents[0].id, notifs: window.__notifs, envois: window.__envois }));
    expect(r.notifs.map((n) => n.to).sort()).toEqual(["u_ip_leo", "u_ip_nina", "u_ip_sam"]);
    r.notifs.forEach((n) => { expect(n.kind).toBe("event_invite"); expect(n.ref).toBe(r.id); });
    expect(r.envois.map((e) => e.convId).sort()).toEqual(["ip_leo", "ip_nina"]);
    expect(await page.evaluate(() => getConversations().length)).toBe(nbConvs);
    const leo = await messages(page, "ip_leo");
    expect(leo[leo.length - 1].text).toContain("Je crée une activité pour t'inviter");

    await page.waitForFunction(() => window._openedConvId === "ip_nina", null, { timeout: 5000 });
    const carte = page.locator(`#convFpThread .msg-carte-activite[data-ev="${r.id}"]`);
    await expect(carte.locator(".mca-statut")).toHaveText("3 invités · 3 en attente");
    await expect(carte.locator(".mca-inviter")).toHaveText("Inviter d'autres");
    await expect(carte.locator(".mca-oui")).toHaveCount(0);
  });

  test("③ un invité refusé par le verdict serveur ne reçoit rien", async ({ page }) => {
    await banc(page, { refuses: ["u_ip_sam"] });
    await ouvrirEtProposer(page, "ip_nina");
    await ajouter(page, "Sam Durand");
    await expect(page.locator("#evInviteBandeau .ev-invite-chip")).toHaveCount(0);
    await expect(publierBtn(page)).toHaveText("Créer et inviter Nina Costa");
    await publier(page);
    await expect.poll(() => page.evaluate(() => window.__notifs.length)).toBe(1);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__notifs.map((n) => n.to))).toEqual(["u_ip_nina"]);
  });

  test("④ plafond : dix personnes au plus", async ({ page }) => {
    await banc(page, { beaucoup: true });
    await ouvrirEtProposer(page, "ip_nina");
    await page.locator("#evInviteBandeau .ev-invite-ajouter").click();
    for (let i = 0; i < 9; i++) await page.locator(`#evInviteBandeau .ev-invite-ligne-btn[data-invite="u_ip_f${i}"]`).click();
    await expect(page.locator("#evInviteBandeau .ev-invite-chip")).toHaveCount(9);
    await expect(publierBtn(page)).toHaveText("Créer et inviter 10 personnes");
    await expect(page.locator("#evInviteBandeau .ev-invite-ajouter")).toBeDisabled();
    await expect(page.locator("#evInviteBandeau .ev-invite-ligne button").first()).toBeDisabled();
    const n = await page.evaluate(() => { const ctx = window._evInviteCtx; return _inviteAjouter(ctx, "u_ip_f11", "x"); });
    expect(n).toBe(false);
  });

  test("⑤ un nom hostile reste du texte", async ({ page }) => {
    await banc(page);
    await ouvrirEtProposer(page, "ip_nina");
    await page.locator("#evInviteBandeau .ev-invite-ajouter").click();
    await ajouter(page, "<img src=x");
    await expect(page.locator("#evInviteBandeau .ev-invite-chip-nom")).toHaveText("<img src=x onerror=window.__xss=1>");
    expect(await page.locator("#evInviteBandeau img").count()).toBe(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test("⑥ groupe : la carte part une fois dans le groupe, chaque membre est notifié", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await banc(page, { errors });
    await page.evaluate(() => goTo("messages"));
    await page.evaluate(() => openConversation("ip_grp"));
    await page.waitForFunction(() => window._openedConvId === "ip_grp", null, { timeout: 5000 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getElementById("v6cProposerIrl") && !document.getElementById("v6cProposerIrl").hidden)).toBe(true);
    await page.evaluate(() => window.PassioProposerIrl(true));
    await page.waitForSelector("#evInviteBandeau", { timeout: 8000 });
    await expect(page.locator("#modalContent .modal-title")).toHaveText("Inviter Les grimpeurs");
    await expect(page.locator("#evInviteBandeau .ev-invite-chip")).toHaveCount(2);
    await expect(publierBtn(page)).toHaveText("Créer et inviter le groupe");
    await publier(page);
    await expect.poll(() => page.evaluate(() => window.__notifs.length)).toBe(2);
    const r = await page.evaluate(() => ({ id: state.userEvents[0].id, notifs: window.__notifs.map((n) => n.to).sort(), envois: window.__envois.map((e) => e.convId) }));
    expect(r.notifs).toEqual(["u_ip_leo", "u_ip_sam"]);
    // Un membre du groupe n'a pas la carte en double dans son 1:1.
    expect(r.envois).toEqual(["ip_grp"]);
    const grp = await messages(page, "ip_grp");
    expect(grp[grp.length - 1].text).toContain("Je crée une activité pour vous inviter");
    await page.waitForFunction(() => window._openedConvId === "ip_grp", null, { timeout: 5000 });
    await expect(page.locator(`#convFpThread .msg-carte-activite[data-ev="${r.id}"] .mca-statut`)).toHaveText("2 invités · 2 en attente");

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("⑥ bis groupe : un membre refusé par le verdict n'est ni notifié ni compté", async ({ page }) => {
    await banc(page, { refuses: ["u_ip_sam"] });
    await page.evaluate(() => goTo("messages"));
    await page.evaluate(() => openConversation("ip_grp"));
    await page.waitForFunction(() => window._openedConvId === "ip_grp", null, { timeout: 5000 });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.PassioProposerIrl(true));
    await page.waitForSelector("#evInviteBandeau", { timeout: 8000 });
    await publier(page);
    await expect.poll(() => page.evaluate(() => window.__notifs.length)).toBe(1);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__notifs.map((n) => n.to))).toEqual(["u_ip_leo"]);
    const id = await page.evaluate(() => state.userEvents[0].id);
    await page.waitForFunction(() => window._openedConvId === "ip_grp", null, { timeout: 5000 });
    await page.evaluate(() => _rafraichirFilOuvert());
    await expect(page.locator(`#convFpThread .msg-carte-activite[data-ev="${id}"] .mca-statut`)).toHaveText("1 invité · 1 en attente");
  });

  test("⑥ ter groupe : personne n'est admis → aucune carte, aucune notification", async ({ page }) => {
    await banc(page, { refuses: ["u_ip_leo", "u_ip_sam"] });
    await ouvrirGroupe(page, "ip_grp");
    await page.evaluate(() => window.PassioProposerIrl(true));
    await page.waitForSelector("#evInviteBandeau", { timeout: 8000 });
    const avant = (await messages(page, "ip_grp")).length;
    await publier(page);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.__notifs.length)).toBe(0);
    expect(await page.evaluate(() => window.__envois.length)).toBe(0);
    expect((await messages(page, "ip_grp")).length).toBe(avant);
  });

  test("⑥ quater groupe : un membre parti avant la publication n'est pas notifié", async ({ page }) => {
    await banc(page);
    await ouvrirGroupe(page, "ip_grp");
    await page.evaluate(() => window.PassioProposerIrl(true));
    await page.waitForSelector("#evInviteBandeau", { timeout: 8000 });
    await expect(page.locator("#evInviteBandeau .ev-invite-chip")).toHaveCount(2);
    await page.evaluate(() => { getConversations().find((c) => c.id === "ip_grp").userIds = ["me", "u_ip_leo"]; });
    await publier(page);
    await expect.poll(() => page.evaluate(() => window.__notifs.length)).toBe(1);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__notifs.map((n) => n.to))).toEqual(["u_ip_leo"]);
  });

  test("⑥ quinquies groupe : jamais une discussion d'activité, jamais sous les gardes du proposeur", async ({ page }) => {
    const entree = () => page.evaluate(() => { const n = document.getElementById("v6cProposerIrl"); return !!n && !n.hidden; });
    await banc(page);
    // Discussion d'activité : pas d'entrée, et l'appel direct ne fait rien.
    await ouvrirGroupe(page, "evgrp_ip_x");
    expect(await entree()).toBe(false);
    await page.evaluate(() => window.PassioProposerIrl(true));
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => !!document.getElementById("evTitle"))).toBe(false);
    // Groupe ordinaire : l'entrée existe…
    await ouvrirGroupe(page, "ip_grp");
    expect(await entree()).toBe(true);
    // …sauf proposeur mineur…
    await page.evaluate(() => { state.user.isMinor = true; closeConversation(); });
    await ouvrirGroupe(page, "ip_grp");
    expect(await entree()).toBe(false);
    await page.evaluate(() => window.PassioProposerIrl(true));
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => !!document.getElementById("evTitle"))).toBe(false);
    // …ou proposition IRL coupée.
    await page.evaluate(() => { state.user.isMinor = false; window.PASSIO_IRL_PROPOSAL_V1 = false; closeConversation(); });
    await ouvrirGroupe(page, "ip_grp");
    expect(await entree()).toBe(false);
  });

  test("⑦ le décompte suit les réponses", async ({ page }) => {
    await banc(page);
    await ouvrirEtProposer(page, "ip_nina");
    await ajouter(page, "Léo Martin");
    await ajouter(page, "Sam Durand");
    await publier(page);
    await page.waitForFunction(() => window._openedConvId === "ip_nina", null, { timeout: 5000 });
    const id = await page.evaluate(() => {
      const ev = state.userEvents[0];
      ev.attendees = (ev.attendees || []).concat(["u_ip_leo"]);
      ev.maybes = ["u_ip_sam"];
      _rafraichirFilOuvert();
      return ev.id;
    });
    await expect(page.locator(`#convFpThread .msg-carte-activite[data-ev="${id}"] .mca-statut`))
      .toHaveText("3 invités · 1 vient · 1 hésite · 1 en attente");
  });
});
