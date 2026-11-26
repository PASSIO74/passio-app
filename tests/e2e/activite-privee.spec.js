// Activité PRIVÉE, sur invitation (2026-11-26).
//
// Demande de Benjamin : « il faut que l'on puisse faire une invitation ciblée et
// privée » — une activité créée pour inviter quelqu'un ne doit pas apparaître
// dans les activités publiques. La frontière est en BASE
// (`migration_activites_privees_2026-11-26.sql`, banc
// `tests/sql/migration-activites-privees.test.sh`) ; cette suite prouve que le
// client la sert :
//   ① création ordinaire : « Publique » par défaut, la case du fil visible ;
//      choisir « Privée » cache la case ;
//   ② publiée privée : la ligne envoyée porte `visibilite: 'privee'`, aucune
//      carte au fil, l'activité est notée hors fil ;
//   ③ depuis une conversation : « Privée » par défaut ; le droit de lecture
//      de l'invité (`supaInviterActivite`) part AVANT la carte et la
//      notification ; un refus n'envoie ni l'une ni l'autre ;
//   ④ « Retirer » l'invitation rend « Publique » ;
//   ⑤ la publication au fil refuse une activité privée, même pas notée hors fil ;
//   ⑥ `_eventRow` n'envoie la visibilité que si elle est connue, et elle n'est
//      JAMAIS une colonne « optionnelle » qu'un refus retirerait ;
//   ⑦ la fiche d'une activité privée le dit (« 🔒 Activité privée ») ;
//   ⑧ une série RÉCURRENTE privée ouvre TOUTES ses dates à l'invité.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const CONV = "ap_nina";
const NINA = "7a1f0c3e-5b2d-4e8f-9a6b-1c2d3e4f5a6b";

async function banc(page, opts = {}) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate(({ nina, invitOk }) => {
    ["supaUpdateEvent", "supaJoinEvent", "supaLeaveEvent", "supaSetEventRsvp", "supaLoadEvents",
      "supaLoadMyRsvps", "supaLoadEventCommentCounts", "supaCreateEventConversation",
      "supaJoinEventConversation", "supaLeaveEventConversation",
    ].forEach((fn) => { window[fn] = async () => null; });
    window.__publies = [];
    window.supaPublishEvent = async (ev) => { window.__publies.push(_eventRow(ev)); return true; };
    window.passioGeocode = async () => null;
    window._geocodeAddress = async () => null;
    window._supaReal = true;
    window.__publierAuFilOrig = publierActiviteAuFil;
    window.__auFil = [];
    window.publierActiviteAuFil = (ev) => { window.__auFil.push(ev.id); };
    window._joinEventConversation = async () => true;
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window._convNetLoaded = true;
    window.irlProposalServerVerdict = async () => ({ ok: true, reason: "ok" });
    window.__journal = [];
    window.__invites = [];
    window.supaInviterActivite = async (evId, ids) => {
      window.__journal.push("invite"); window.__invites.push({ evId, ids }); return invitOk;
    };
    window.supaInsertNotif = (to, kind, ref) => { window.__journal.push("notif:" + kind); };
    window._sendTextToSupa = () => { window.__journal.push("carte"); };
    state.userEvents = [];
    state.seed.events = [];
    if (typeof cacheRemoteProfile === "function") cacheRemoteProfile({ id: nina, username: "Nina Costa" });
    conversationsState = [{
      id: "ap_nina", userId: nina, userName: "Nina Costa",
      lastAt: Date.now() - 60000, unread: 0, archived: false, pinned: false,
      messages: [{ id: "m1", from: nina, text: "On se fait un truc ?", at: Date.now() - 60000 }],
    }];
  }, { nina: NINA, invitOk: opts.invitOk === undefined ? true : opts.invitOk });
}

async function ouvrirConvEtProposer(page) {
  await page.evaluate(() => goTo("messages"));
  await page.evaluate((cid) => openConversation(cid), CONV);
  await page.waitForFunction(() => window._openedConvId, null, { timeout: 5000 });
  await page.waitForTimeout(250);
  await page.evaluate(() => window.PassioProposerIrl(true));
  await page.waitForSelector("#evTitle", { timeout: 8000 });
  await page.waitForTimeout(150);
}

async function remplir(page, titre) {
  await page.locator("#evTime").fill("18:00");
  await page.evaluate((t) => {
    if (t) document.getElementById("evTitle").value = t;
    document.getElementById("evCity").value = "Annecy";
  }, titre || null);
}

test.describe("Activité privée, sur invitation", () => {
  test("① ② création ordinaire : publique par défaut ; privée → ni fil, ni annonce", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => openCreateEvent());
    await expect(page.locator("#evVisPublique")).toBeChecked();
    await expect(page.locator("#evAuFil")).toBeVisible();
    await page.locator("#evVisPrivee").check();
    await expect(page.locator("#evAuFil")).toBeHidden();
    await remplir(page, "Anniversaire surprise");
    await page.evaluate(() => submitEvent());
    await expect.poll(() => page.evaluate(() => window.__publies.length)).toBe(1);
    const r = await page.evaluate(() => ({
      ligne: window.__publies[0], ev: state.userEvents[0], auFil: window.__auFil,
      horsFil: state.user.activitesHorsFil || [],
    }));
    expect(r.ligne.visibilite).toBe("privee");
    expect(r.ev.visibilite).toBe("privee");
    expect(r.auFil, "aucune carte dans le fil").toEqual([]);
    expect(r.horsFil).toContain(r.ev.id);
  });

  test("② bis une création publique envoie « publique » et garde le fil", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => openCreateEvent());
    await remplir(page, "Rando au lac");
    await page.evaluate(() => submitEvent());
    await expect.poll(() => page.evaluate(() => window.__auFil.length)).toBe(1);
    expect(await page.evaluate(() => window.__publies[0].visibilite)).toBe("publique");
  });

  test("③ depuis une conversation : privée par défaut, le droit de lecture part AVANT la carte", async ({ page }) => {
    await banc(page);
    await ouvrirConvEtProposer(page);
    await expect(page.locator("#evVisPrivee")).toBeChecked();
    await expect(page.locator("#evAuFil")).toBeHidden();
    await remplir(page);
    await page.evaluate(() => submitEvent());
    await expect.poll(() => page.evaluate(() => window.__journal.includes("carte"))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__journal.includes("notif:event_invite"))).toBe(true);
    const r = await page.evaluate(() => ({ j: window.__journal, inv: window.__invites, ligne: window.__publies[0], ev: state.userEvents[0] }));
    expect(r.ligne.visibilite).toBe("privee");
    expect(r.j.indexOf("invite"), JSON.stringify(r.j)).toBeLessThan(r.j.indexOf("carte"));
    expect(r.j.indexOf("invite")).toBeLessThan(r.j.indexOf("notif:event_invite"));
    expect(r.inv[0]).toEqual({ evId: r.ev.id, ids: [NINA] });
    expect(await page.evaluate(() => window.__auFil)).toEqual([]);
  });

  test("③ bis invitation refusée par la base : ni carte, ni notification", async ({ page }) => {
    await banc(page, { invitOk: false });
    await ouvrirConvEtProposer(page);
    await remplir(page);
    await page.evaluate(() => submitEvent());
    await expect.poll(() => page.evaluate(() => window.__journal.length)).toBeGreaterThan(0);
    await page.waitForTimeout(600);
    const j = await page.evaluate(() => window.__journal);
    expect(j).not.toContain("carte");
    expect(j).not.toContain("notif:event_invite");
  });

  test("④ « Retirer » l'invitation rend une activité publique", async ({ page }) => {
    await banc(page);
    await ouvrirConvEtProposer(page);
    await page.locator("#evInviteBandeau .ev-invite-bandeau-x").click();
    await expect(page.locator("#evVisPublique")).toBeChecked();
    await expect(page.locator("#evAuFil")).toBeVisible();
  });

  test("⑤ ⑥ la publication au fil refuse une privée ; la visibilité n'est jamais optionnelle", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window._uidEstUnCompte = () => true;
      window.estPassionCanonique = () => true;
      const parti = [];
      window.supaPublishPostWithRetry = async (p) => { parti.push(p.id); return true; };
      const base = { id: "ev_ap_test", title: "Test", passion: "musique", date: Date.now() + 864e5, city: "Annecy" };
      const privee = await window.__publierAuFilOrig(Object.assign({}, base, { visibilite: "privee" }));
      return {
        privee, parti,
        sansVis: "visibilite" in _eventRow(base),
        avecVis: _eventRow(Object.assign({}, base, { visibilite: "privee" })).visibilite,
        optionnelle: _EVENT_OPTIONAL_COLS.includes("visibilite"),
        lue: _EVENT_COLS_PUBLIC.split(",").includes("visibilite"),
      };
    });
    expect(r.privee).toBe(false);
    expect(r.parti).toEqual([]);
    expect(r.sansVis, "inconnue : pas envoyée, la base garde la sienne").toBe(false);
    expect(r.avecVis).toBe("privee");
    expect(r.optionnelle, "un refus ne doit JAMAIS la retirer (l'activité partirait publique)").toBe(false);
    expect(r.lue).toBe(true);
  });

  test("⑦ la fiche d'une activité privée le dit", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => {
      state.userEvents = [{
        id: "ev_ap_fiche", title: "Dîner entre amis", passion: "musique", emoji: "🎵",
        date: Date.now() + 864e5, time: "20:00", city: "Annecy", visibilite: "privee",
        attendees: [MY_UID], maybes: [], waitlist: [], checkedIn: [], organizerId: MY_UID, authorId: MY_UID,
      }];
      openEventDetails("ev_ap_fiche");
    });
    await expect(page.locator(".ev-badge-privee")).toContainText("Activité privée");
  });

  test("⑧ série récurrente privée : l'invité est ouvert à TOUTES les dates", async ({ page }) => {
    await banc(page);
    await ouvrirConvEtProposer(page);
    await page.evaluate(() => {
      const sel = document.getElementById("evRecurrence");
      sel.value = "weekly"; sel.dispatchEvent(new Event("change"));
      document.getElementById("evOccurrences").value = "3";
    });
    await remplir(page);
    await page.evaluate(() => submitEvent());
    await expect.poll(() => page.evaluate(() => window.__journal.includes("carte"))).toBe(true);
    await expect.poll(() => page.evaluate(() => new Set(window.__invites.map((i) => i.evId)).size)).toBe(3);
    const r = await page.evaluate(() => ({
      ids: state.userEvents.map((e) => e.id).sort(),
      invites: window.__invites.map((i) => i.evId).sort(),
      privees: state.userEvents.every((e) => e.visibilite === "privee"),
    }));
    expect(r.ids.length).toBe(3);
    expect(r.privees).toBe(true);
    expect([...new Set(r.invites)].sort()).toEqual(r.ids);
  });

  test("⑧ bis une date de la série refusée ne fait pas tomber l'invitation", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => {
      window.supaInviterActivite = async (evId, ids) => {
        window.__journal.push("invite"); window.__invites.push({ evId, ids });
        return evId === state.userEvents[state.userEvents.length - 1].id;   // seule la date principale passe
      };
    });
    await ouvrirConvEtProposer(page);
    await page.evaluate(() => {
      const sel = document.getElementById("evRecurrence");
      sel.value = "weekly"; sel.dispatchEvent(new Event("change"));
      document.getElementById("evOccurrences").value = "3";
    });
    await remplir(page);
    await page.evaluate(() => submitEvent());
    await expect.poll(() => page.evaluate(() => window.__journal.includes("carte"))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__journal.includes("notif:event_invite"))).toBe(true);
  });
});
