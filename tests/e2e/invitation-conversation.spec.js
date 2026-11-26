// Inviter la personne de la conversation à une activité (2026-11-23).
//
// Demande de Benjamin : « en cliquant sur le bouton 📍 de la conversation,
// pouvoir proposer une activité à la personne avec qui on discute — je crée une
// activité pour t'inviter ». Ce que cette suite prouve :
//   ① le formulaire s'ouvre sous « Inviter <nom> », bandeau et bouton « Créer et
//      inviter <nom> » — et RIEN ne part tant qu'on n'a pas publié ;
//   ② « Retirer » rend une création normale (aucune invitation à la publication) ;
//   ③ publiée sur le serveur : un message part dans LA conversation (lien de
//      l'activité), la notification `event_invite` part, la conversation se
//      rouvre et le message est peint en CARTE « En attente de réponse » ;
//   ④ publication refusée ou locale : aucun message, aucune notification ;
//   ⑤ côté invité : « Je viens » passe par setEventRsvp, une réponse part dans la
//      conversation, la carte dit « Tu participes » ;
//   ⑥ côté organisateur : la carte dit « <nom> participe » quand c'est le cas ;
//   ⑦ un lien d'un AUTRE site, ou un titre hostile, reste du texte ;
//   ⑧ la coupure rend le formulaire et le lien d'avant ;
//   ⑨ une invitation ne part PAS dans le fil Découvrir par défaut (case décochée),
//      et l'activité est notée hors fil — le rattrapage ne la publiera pas ;
//   ⑩ une création ordinaire garde la carte du fil ; rendre l'invitation
//      publique puis cocher la case la publie aussi.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const CONV = "ic_nina";

async function banc(page, opts = {}) {
  if (opts.coupure) await page.addInitScript(() => localStorage.setItem("passio_invite_conv_v1", "0"));
  await bootOnboarded(page, opts.errors || null, 1, {});
  await page.evaluate((verdict) => {
    ["supaUpdateEvent", "supaJoinEvent", "supaLeaveEvent", "supaSetEventRsvp", "supaLoadEvents",
      "supaLoadMyRsvps", "supaLoadEventCommentCounts", "supaCreateEventConversation",
      "supaJoinEventConversation", "supaLeaveEventConversation",
    ].forEach((fn) => { window[fn] = async () => null; });
    window.supaPublishEvent = async () => verdict === true;
    window.passioGeocode = async () => null;
    window._geocodeAddress = async () => null;
    window._supaReal = verdict !== null;
    window.__publierAuFilOrig = publierActiviteAuFil;
    window.__auFil = [];
    window.publierActiviteAuFil = (ev) => { window.__auFil.push(ev.id); };
    window._joinEventConversation = async () => true;
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window._convNetLoaded = true;
    window.irlProposalServerVerdict = async () => ({ ok: true, reason: "ok" });
    window.__notifs = [];
    window.supaInsertNotif = (to, kind, ref, txt) => { window.__notifs.push({ to, kind, ref, txt }); };
    window.__envois = [];
    window._sendTextToSupa = (convId, msgId, content) => { window.__envois.push({ convId, msgId, content }); };
    state.userEvents = [];
    state.seed.events = [];
    // Un VRAI compte (profil distant mis en cache) : un interlocuteur du socle de
    // démonstration n'envoie rien (`_estConvDemo`), et c'est voulu.
    if (typeof cacheRemoteProfile === "function") cacheRemoteProfile({ id: "u_ic_reel", username: "Nina Costa" });
    conversationsState = [{
      id: "ic_nina", userId: "u_ic_reel", userName: "Nina Costa",
      lastAt: Date.now() - 60000, unread: 0, archived: false, pinned: false,
      messages: [{ id: "m1", from: "u_ic_reel", text: "Tu peux organiser un truc ?", at: Date.now() - 60000 }],
    }];
  }, opts.verdict === undefined ? true : opts.verdict);
}

async function ouvrirConv(page) {
  await page.evaluate(() => goTo("messages"));
  await page.evaluate((cid) => openConversation(cid), CONV);
  await page.waitForFunction(() => window._openedConvId, null, { timeout: 5000 });
  await page.waitForTimeout(250);
}

async function proposer(page) {
  await page.evaluate(() => window.PassioProposerIrl(true));
  await page.waitForSelector("#evTitle", { timeout: 8000 });
  await page.waitForTimeout(150);
}

const messagesNina = (page) => page.evaluate(() => getConversations().find((c) => c.id === "ic_nina").messages.length);

test.describe("Inviter la personne de la conversation à une activité", () => {
  test("① le formulaire invite Nina, et rien ne part avant la publication", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await banc(page, { errors });
    await ouvrirConv(page);
    const avant = await messagesNina(page);
    await proposer(page);

    await expect(page.locator("#modalContent .modal-title")).toHaveText("Inviter Nina Costa");
    await expect(page.locator("#evInviteBandeau")).toContainText("Invitation pour Nina Costa");
    await expect(page.locator('#modalContent button[onclick^="submitEvent"]')).toHaveText("Créer et inviter Nina Costa");
    // Le titre suggéré reste PUBLIC : il ne nomme personne.
    expect((await page.inputValue("#evTitle")).toLowerCase()).not.toContain("nina");
    expect(await messagesNina(page)).toBe(avant);
    expect(await page.evaluate(() => window.__notifs.length)).toBe(0);
    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("② « Retirer » rend une création normale, sans invitation", async ({ page }) => {
    await banc(page);
    await ouvrirConv(page);
    const avant = await messagesNina(page);
    await proposer(page);
    await page.locator("#evInviteBandeau .ev-invite-bandeau-x").click();
    await expect(page.locator("#evInviteBandeau")).toHaveCount(0);
    await expect(page.locator('#modalContent button[onclick^="submitEvent"]')).not.toContainText("inviter");
    await page.locator("#evTime").fill("18:00");
    await page.evaluate(() => { document.getElementById("evCity").value = "Annecy"; });
    await page.evaluate(() => submitEvent());
    await expect.poll(() => page.evaluate(() => state.userEvents.length)).toBe(1);
    expect(await messagesNina(page)).toBe(avant);
    expect(await page.evaluate(() => window.__notifs.length)).toBe(0);
  });

  test("③ publiée : l'invitation part dans la conversation, en carte", async ({ page }) => {
    await banc(page);
    await ouvrirConv(page);
    await proposer(page);
    await page.locator("#evTime").fill("18:00");
    await page.evaluate(() => { document.getElementById("evCity").value = "Annecy"; });
    await page.evaluate(() => submitEvent());
    await expect.poll(() => page.evaluate(() => window.__envois.length)).toBe(1);

    const r = await page.evaluate(() => {
      const ev = state.userEvents[0];
      const c = getConversations().find((x) => x.id === "ic_nina");
      const m = c.messages[c.messages.length - 1];
      return { id: ev.id, titre: ev.title, texte: m.text, from: m.from, envoi: window.__envois[0], notifs: window.__notifs };
    });
    expect(r.from).toBe("me");
    expect(r.texte).toContain("Je crée une activité pour t'inviter");
    expect(r.texte).toContain(r.titre);
    expect(r.texte).toContain("Annecy");
    expect(lienActivite(r.texte)).toBe(r.id);
    expect(r.envoi.convId).toBe("ic_nina");
    expect(r.notifs).toEqual([expect.objectContaining({ to: "u_ic_reel", kind: "event_invite", ref: r.id })]);

    // La conversation se rouvre, le message est une carte.
    await page.waitForFunction(() => window._openedConvId === "ic_nina", null, { timeout: 5000 });
    const carte = page.locator(`#convFpThread .msg-carte-activite[data-ev="${r.id}"]`);
    await expect(carte).toHaveCount(1);
    await expect(carte.locator(".mca-titre")).toHaveText(r.titre);
    await expect(carte.locator(".mca-statut")).toHaveText("En attente de réponse");
    // L'organisateur ne répond pas à sa propre invitation.
    await expect(carte.locator(".mca-oui")).toHaveCount(0);
    // La fenêtre générique « Inviter mes amis » n'est pas ouverte en plus.
    expect(await page.evaluate(() => !!document.getElementById("_inviteEvBtn"))).toBe(false);
  });

  test("④ publication refusée ou locale : aucun message, aucune notification", async ({ page }) => {
    for (const verdict of [false, null]) {
      await banc(page, { verdict });
      await ouvrirConv(page);
      const avant = await messagesNina(page);
      await proposer(page);
      await page.locator("#evTime").fill("18:00");
      await page.evaluate(() => { document.getElementById("evCity").value = "Annecy"; });
      await page.evaluate(() => submitEvent());
      await expect.poll(() => page.evaluate(() => state.userEvents.length)).toBe(1);
      await page.waitForTimeout(500);
      expect(await messagesNina(page), "verdict " + verdict).toBe(avant);
      expect(await page.evaluate(() => window.__notifs.length + window.__envois.length)).toBe(0);
    }
  });

  test("⑤ invitée : « Je viens » répond d'un geste, dans la conversation", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => {
      state.userEvents = [{ id: "ev_nina", title: "Concert au parc", passion: "musique", city: "Lyon",
        date: Date.now() + 3 * 86400000, time: "18:00", attendees: ["u_ic_reel"], maybes: [], waitlist: [],
        checkedIn: [], organizerId: "u_ic_reel", authorId: "u_ic_reel", status: "active" }];
      const c = getConversations().find((x) => x.id === "ic_nina");
      c.messages.push({ id: "m_inv", from: "u_ic_reel", at: Date.now(),
        text: "📅 Je crée une activité pour t'inviter !\nConcert au parc\n" + location.origin + location.pathname + "#irl-event-ev_nina" });
      window.__rsvp = [];
      window.setEventRsvp = async (id, r) => { window.__rsvp.push([id, r]); _setMyRsvpLocal(id, r); };
    });
    await ouvrirConv(page);
    const carte = page.locator('#convFpThread .msg-carte-activite[data-ev="ev_nina"]');
    await expect(carte).toHaveCount(1);
    await expect(carte.locator(".mca-entete")).toHaveText("📅 Je crée une activité pour t'inviter !");
    await carte.locator(".mca-oui").click();

    await expect.poll(() => page.evaluate(() => window.__envois.length)).toBe(1);
    const r = await page.evaluate(() => {
      const c = getConversations().find((x) => x.id === "ic_nina");
      return { rsvp: window.__rsvp, dernier: c.messages[c.messages.length - 1].text };
    });
    expect(r.rsvp).toEqual([["ev_nina", "going"]]);
    expect(r.dernier).toBe("✓ Je viens à « Concert au parc » !");
    const apres = page.locator('#convFpThread .msg-carte-activite[data-ev="ev_nina"]');
    await expect(apres.locator(".mca-statut")).toHaveText("✓ Tu participes");
    await expect(apres.locator(".mca-oui")).toHaveCount(0);
  });

  test("⑤ bis un RSVP refusé ne fait rien dire à la place de la personne", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => {
      state.userEvents = [{ id: "ev_nina", title: "Concert", passion: "musique", city: "Lyon",
        date: Date.now() + 3 * 86400000, time: "18:00", attendees: ["u_ic_reel"], maybes: [], waitlist: [],
        checkedIn: [], organizerId: "u_ic_reel", authorId: "u_ic_reel", status: "active" }];
      getConversations().find((x) => x.id === "ic_nina").messages.push({ id: "m_inv", from: "u_ic_reel", at: Date.now(),
        text: location.origin + location.pathname + "#irl-event-ev_nina" });
      window.setEventRsvp = async () => {};           // refus : rien n'a changé
    });
    await ouvrirConv(page);
    await page.locator('#convFpThread .msg-carte-activite .mca-oui').click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__envois.length)).toBe(0);
  });

  test("⑥ organisateur : la carte dit que Nina participe", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => {
      state.userEvents = [{ id: "ev_moi", title: "Sortie musique", passion: "musique", city: "Lyon",
        date: Date.now() + 3 * 86400000, time: "18:00", attendees: [MY_UID, "u_ic_reel"], maybes: [], waitlist: [],
        checkedIn: [], organizerId: MY_UID, authorId: MY_UID, status: "active" }];
      getConversations().find((x) => x.id === "ic_nina").messages.push({ id: "m_inv", from: "me", at: Date.now(),
        text: "📅 Je crée une activité pour t'inviter !\n" + location.origin + location.pathname + "#irl-event-ev_moi" });
    });
    await ouvrirConv(page);
    await expect(page.locator('#convFpThread .msg-carte-activite[data-ev="ev_moi"] .mca-statut')).toHaveText("✓ Nina Costa participe");
  });

  test("⑦ un lien d'un autre site et un titre hostile restent du texte", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => {
      state.userEvents = [{ id: "ev_x", title: "<img src=x onerror=window.__xss=1>", passion: "musique", city: "<b>Lyon</b>",
        date: Date.now() + 3 * 86400000, time: "18:00", attendees: [], maybes: [], waitlist: [],
        checkedIn: [], organizerId: "u_ic_reel", authorId: "u_ic_reel", status: "active" }];
      const c = getConversations().find((x) => x.id === "ic_nina");
      c.messages.push({ id: "m_a", from: "u_ic_reel", at: Date.now(), text: "Regarde https://exemple.test/e/ev_x" });
      c.messages.push({ id: "m_b", from: "u_ic_reel", at: Date.now() + 1, text: "<i>salut</i> " + location.origin + location.pathname + "#irl-event-ev_x" });
    });
    await ouvrirConv(page);
    await expect(page.locator('#convFpThread .conv-bubble-wrap[data-mid="m_a"] .msg-carte-activite')).toHaveCount(0);
    const carte = page.locator('#convFpThread .conv-bubble-wrap[data-mid="m_b"] .msg-carte-activite');
    await expect(carte).toHaveCount(1);
    await expect(carte.locator(".mca-titre")).toHaveText("<img src=x onerror=window.__xss=1>");
    await expect(carte.locator(".mca-entete")).toHaveText("<i>salut</i>");
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test("⑧ coupure : formulaire et lien d'avant", async ({ page }) => {
    await banc(page, { coupure: true });
    await page.evaluate(() => {
      getConversations().find((x) => x.id === "ic_nina").messages.push({ id: "m_l", from: "u_ic_reel", at: Date.now(),
        text: location.origin + location.pathname + "#irl-event-ev_y" });
    });
    await ouvrirConv(page);
    await expect(page.locator("#convFpThread .msg-carte-activite")).toHaveCount(0);
    await proposer(page);
    await expect(page.locator("#evInviteBandeau")).toHaveCount(0);
    await expect(page.locator("#modalContent .modal-title")).not.toContainText("Inviter");
  });

  test("⑨ invitation : pas de carte dans le fil par défaut, activité notée hors fil", async ({ page }) => {
    await banc(page);
    await ouvrirConv(page);
    await proposer(page);
    expect(await page.evaluate(() => document.getElementById("evAuFil").checked)).toBe(false);
    await page.locator("#evTime").fill("18:00");
    await page.evaluate(() => { document.getElementById("evCity").value = "Annecy"; });
    await page.evaluate(() => submitEvent());
    await expect.poll(() => page.evaluate(() => window.__envois.length)).toBe(1);
    const r = await page.evaluate(() => ({
      id: state.userEvents[0].id, auFil: window.__auFil, horsFil: state.user.activitesHorsFil || [],
    }));
    expect(r.auFil, "aucune carte dans le fil").toEqual([]);
    expect(r.horsFil).toContain(r.id);

    // La VRAIE publication au fil refuse une activité hors fil (création comme
    // rattrapage passent par elle) — contrôle : la même activité, pas hors fil, part.
    const verdict = await page.evaluate(async (id) => {
      window._uidEstUnCompte = () => true;
      window.estPassionCanonique = () => true;
      const parti = [];
      window.supaPublishPostWithRetry = async (p) => { parti.push(p.id); return true; };
      // Rendue publique ici : c'est le refus « hors fil » qu'on éprouve (une
      // invitation est PRIVÉE par défaut depuis le 2026-11-26, refusée au fil
      // pour cette raison-là — voir activite-privee.spec.js).
      const ev = Object.assign({}, state.userEvents[0], { visibilite: "publique" });
      const hors = await window.__publierAuFilOrig(ev);
      state.user.activitesHorsFil = [];
      state.userPosts = (state.userPosts || []).filter((p) => p.id !== "post_ev_" + id);
      const controle = await window.__publierAuFilOrig(ev);
      return { hors, controle, parti };
    }, r.id);
    expect(verdict.hors).toBe(false);
    expect(verdict.controle).toBe(true);
    expect(verdict.parti).toEqual(["post_ev_" + r.id]);
  });

  test("⑩ création ordinaire : la carte part au fil ; cochée pendant une invitation aussi", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => { openCreateEvent(); });
    expect(await page.evaluate(() => document.getElementById("evAuFil").checked)).toBe(true);
    await page.locator("#evTime").fill("18:00");
    await page.evaluate(() => { document.getElementById("evTitle").value = "Rando au lac"; document.getElementById("evCity").value = "Annecy"; });
    await page.evaluate(() => submitEvent());
    await expect.poll(() => page.evaluate(() => window.__auFil.length)).toBe(1);
    expect(await page.evaluate(() => (state.user.activitesHorsFil || []).length)).toBe(0);

    await ouvrirConv(page);
    await proposer(page);
    // Une invitation est privée par défaut (2026-11-26) : la case du fil
    // n'apparaît qu'une fois l'activité rendue publique.
    await expect(page.locator("#evAuFil")).toBeHidden();
    await page.locator("#evVisPublique").check();
    await page.locator("#evAuFil").check();
    await page.locator("#evTime").fill("18:00");
    await page.evaluate(() => { document.getElementById("evCity").value = "Annecy"; });
    await page.evaluate(() => submitEvent());
    await expect.poll(() => page.evaluate(() => window.__auFil.length)).toBe(2);
    expect(await page.evaluate(() => window.__envois.length), "l'invitation part quand même").toBe(1);
  });
});

// Identifiant d'activité d'un texte (forme courte `/e/<id>` ou `#irl-event-<id>`).
function lienActivite(texte) {
  const m = String(texte).match(/\/e\/([A-Za-z0-9_-]+)|#irl-event-([A-Za-z0-9_-]+)/);
  return m ? (m[1] || m[2]) : null;
}
