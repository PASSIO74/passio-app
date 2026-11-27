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
//   ⑧ une série RÉCURRENTE privée ouvre TOUTES ses dates à l'invité ;
//   ⑨ l'organisation voit la liste des invités (lue en base) et en RETIRE un ;
//   ⑩ « Copier le lien d'invitation privé » porte le code (`#ic-<id>.<code>`),
//      « Renouveler » le demande neuf ;
//   ⑪ un lien `#ic-` ouvert : le code quitte l'adresse, l'invitation est
//      rejointe puis l'activité ouverte ; refusée → dit, oubliée ; réseau → gardée ;
//      sans compte → gardée et reprise à la connexion ;
//   ⑫ un invité ne voit pas « Invités » ; la carte de Rencontrer et la carte
//      de conversation disent « Privée » ;
//   ⑬ à l'édition : le choix est là, pré-rempli ; passer en PRIVÉE envoie la
//      visibilité et retire la carte du fil (pierre tombale + file serveur) ;
//      revenir en publique ne republie rien.
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

  // Une activité privée de MON organisation, en local.
  async function activitePrivee(page, mienne) {
    await page.evaluate((m) => {
      window._compteAuthReel = () => true;
      // L'activité d'un AUTRE vit avec celles du serveur (`seed.events`) : tout
      // `userEvents` est « à moi » (`allEvents` le marque `_mine`).
      const liste = [{
        id: "ev_ap_g", title: "Dîner privé", passion: "musique", emoji: "🎵",
        date: Date.now() + 864e5, time: "20:00", city: "Annecy", visibilite: "privee",
        attendees: m ? [MY_UID, "7a1f0c3e-5b2d-4e8f-9a6b-1c2d3e4f5a6b"] : ["u_autre"], maybes: [], waitlist: [], checkedIn: [],
        organizerId: m ? MY_UID : "u_autre", authorId: m ? MY_UID : "u_autre",
      }];
      if (m) state.userEvents = liste;
      else { state.userEvents = []; state.seed.events = liste; }
    }, mienne);
  }

  test("⑨ l'organisation lit ses invités et en retire un", async ({ page }) => {
    await banc(page);
    await activitePrivee(page, true);
    await page.evaluate((nina) => {
      window.__retraits = [];
      window.supaLireInvitesActivite = async () => [nina];
      window.supaRetirerInviteActivite = async (ev, u) => { window.__retraits.push([ev, u]); return true; };
      openEventInvite("ev_ap_g");
    }, NINA);
    const ligne = page.locator(`[data-invite-prive="${NINA}"]`);
    await expect(ligne).toContainText("Nina Costa");
    await ligne.getByRole("button", { name: /Retirer/ }).click();
    // 2026-11-27 (ergonomie c) : 5 s pour annuler, comme pour inviter — rien ne
    // part au premier appui, le bouton devient « Annuler ».
    await expect(ligne.getByRole("button", { name: /Annuler/ })).toBeVisible();
    expect(await page.evaluate(() => window.__retraits.length)).toBe(0);
    await expect(ligne).toHaveCount(0, { timeout: 10000 });
    const r = await page.evaluate(() => ({ retraits: window.__retraits, att: state.userEvents[0].attendees }));
    expect(r.retraits).toEqual([["ev_ap_g", NINA]]);
    expect(r.att).not.toContain(NINA);
  });

  test("⑨ bis un retrait refusé par la base laisse la personne et le dit", async ({ page }) => {
    await banc(page);
    await activitePrivee(page, true);
    await page.evaluate((nina) => {
      window.supaLireInvitesActivite = async () => [nina];
      window.supaRetirerInviteActivite = async () => false;
      openEventInvite("ev_ap_g");
    }, NINA);
    const ligne = page.locator(`[data-invite-prive="${NINA}"]`);
    await ligne.getByRole("button", { name: /Retirer/ }).click();
    // Le retrait part au bout des 5 s pour annuler (2026-11-27) : on attend le refus.
    await page.waitForTimeout(6000);
    await expect(ligne).toHaveCount(1);
    expect(await page.evaluate(() => state.userEvents[0].attendees.length)).toBe(2);
  });

  test("⑩ le lien d'invitation privé porte le code ; renouveler le redemande", async ({ page }) => {
    await banc(page);
    await activitePrivee(page, true);
    const CODE = "ab".repeat(32);
    await page.evaluate((code) => {
      window.__codes = []; window.__partages = [];
      window.supaLireInvitesActivite = async () => [];
      window.supaCodeInvitationActivite = async (ev, ren) => { window.__codes.push([ev, ren]); return code; };
      window.partagerOuCopier = (d) => { window.__partages.push(d.url); };
      openEventInvite("ev_ap_g");
    }, CODE);
    await page.getByRole("button", { name: /Copier le lien d'invitation privé/ }).click();
    await expect.poll(() => page.evaluate(() => window.__partages.length)).toBe(1);
    await page.getByRole("button", { name: /Renouveler le lien/ }).click();
    await expect.poll(() => page.evaluate(() => window.__partages.length)).toBe(2);
    const r = await page.evaluate(() => ({ codes: window.__codes, url: window.__partages[0] }));
    expect(r.codes).toEqual([["ev_ap_g", false], ["ev_ap_g", true]]);
    expect(r.url).toMatch(new RegExp("#ic-ev_ap_g\\." + CODE + "$"));
    // Une activité PUBLIQUE garde le lien public d'avant.
    await page.evaluate(() => { state.userEvents[0].visibilite = "publique"; closeModal(); openEventInvite("ev_ap_g"); });
    await expect(page.getByRole("button", { name: /Envoyer le lien à quelqu'un d'autre/ })).toBeVisible();
  });

  test("⑪ un lien #ic- : rejoint, ouvert, code retiré de l'adresse ; refusé / réseau / sans compte", async ({ page }) => {
    await banc(page);
    const CODE = "cd".repeat(32);
    await page.evaluate(() => {
      window.__rejoints = []; window.__verdict = true; window.__ouvertes = [];
      window._compteAuthReel = () => true;
      window.supaRejoindreParCode = async (ev, c) => { window.__rejoints.push([ev, c]); return window.__verdict; };
      window._ouvrirActiviteDepuisNotification = (id) => { window.__ouvertes.push(id); return true; };
    });
    const ouvrir = (h) => page.evaluate((x) => { location.hash = x; }, h);
    await ouvrir("#ic-ev_x." + CODE);
    await expect.poll(() => page.evaluate(() => window.__ouvertes)).toEqual(["ev_x"]);
    let r = await page.evaluate(() => ({ h: location.hash, j: window.__rejoints, k: localStorage.getItem("passio_invitation_activite_v1") }));
    expect(r.h).toBe("");
    expect(r.j).toEqual([["ev_x", CODE]]);
    expect(r.k, "rejoint : le lien est oublié").toBeNull();

    await page.evaluate(() => { window.__verdict = false; });
    await ouvrir("#ic-ev_y." + CODE);
    await expect.poll(() => page.evaluate(() => window.__rejoints.length)).toBe(2);
    r = await page.evaluate(() => ({ o: window.__ouvertes, k: localStorage.getItem("passio_invitation_activite_v1") }));
    expect(r.o).toEqual(["ev_x"]);
    expect(r.k, "refusé : oublié").toBeNull();

    await page.evaluate(() => { window.__verdict = null; });
    await ouvrir("#ic-ev_z." + CODE);
    await expect.poll(() => page.evaluate(() => window.__rejoints.length)).toBe(3);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("passio_invitation_activite_v1")).id), "réseau : gardé").toBe("ev_z");

    // Sans compte : gardé, rien n'est appelé ; repris dès que le compte existe.
    await page.evaluate(() => { localStorage.removeItem("passio_invitation_activite_v1"); window._compteAuthReel = () => false; window.__verdict = true; });
    await ouvrir("#ic-ev_w." + CODE);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__rejoints.length)).toBe(3);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("passio_invitation_activite_v1")).id)).toBe("ev_w");
    await page.evaluate(() => { window._compteAuthReel = () => true; reprendreInvitationActivite(); });
    await expect.poll(() => page.evaluate(() => window.__ouvertes)).toEqual(["ev_x", "ev_w"]);
  });

  test("⑫ l'invité ne gère pas les invités ; les cartes disent « Privée »", async ({ page }) => {
    await banc(page);
    await activitePrivee(page, false);
    await page.evaluate(() => openEventDetails("ev_ap_g"));
    await expect(page.locator(".ev-badge-privee")).toBeVisible();
    await expect(page.locator('#eventDetailPage button[onclick^="openEventInvite"]')).toHaveCount(0);
    const carte = await page.evaluate(() => carteActiviteMessage(lienPartageDe("event", "ev_ap_g"), { id: "c", userId: "u_autre" }, false));
    expect(carte).toContain("Invitation privée");
    await page.evaluate(() => { document.getElementById("eventDetailPage").style.display = "none"; goTo("irl"); renderIRL(); });
    await expect.poll(() => page.locator(".ev-tag-privee").count()).toBeGreaterThan(0);
  });

  test("⑬ édition : rendre privée retire la carte du fil ; le choix est pré-rempli", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => {
      window.__maj = []; window.__suppr = [];
      window.supaUpdateEvent = async (ev) => { window.__maj.push(_eventRow(ev)); return true; };
      window._enqueuePostDelete = (id) => { window.__suppr.push(id); };
      window._prevenirInscrits = async () => ({});
      state.userEvents = [{
        id: "ev_ap_ed", title: "Rando", passion: "musique", emoji: "🎵", date: Date.now() + 864e5, time: "09:00",
        city: "Annecy", visibilite: "publique", attendees: [MY_UID], maybes: [], waitlist: [], checkedIn: [],
        organizerId: MY_UID, authorId: MY_UID,
      }];
      state.userPosts = [{ id: "post_ev_ev_ap_ed", authorId: MY_UID, text: "", sharedReelData: { kind: "event", id: "ev_ap_ed" }, ts: Date.now() }];
      openCreateEvent("ev_ap_ed");
    });
    await expect(page.locator("#evVisPublique")).toBeChecked();
    await expect(page.locator("#evAuFil"), "la case du fil n'existe qu'à la création").toHaveCount(0);
    await page.locator("#evVisPrivee").check();
    await page.evaluate(() => submitEvent("ev_ap_ed"));
    await expect.poll(() => page.evaluate(() => window.__suppr)).toEqual(["post_ev_ev_ap_ed"]);
    const r = await page.evaluate(() => ({
      ligne: window.__maj[0], post: !!findPostAnywhere("post_ev_ev_ap_ed"),
      horsFil: (state.user.activitesHorsFil || []).includes("ev_ap_ed"),
    }));
    expect(r.ligne.visibilite).toBe("privee");
    expect(r.post, "la carte a quitté les tableaux").toBe(false);
    expect(r.horsFil, "le rattrapage ne la republiera pas").toBe(true);

    // Rouvrir : « Privée » pré-coché ; repasser en publique ne republie rien.
    await page.evaluate(() => openCreateEvent("ev_ap_ed"));
    await expect(page.locator("#evVisPrivee")).toBeChecked();
    await page.locator("#evVisPublique").check();
    await page.evaluate(() => submitEvent("ev_ap_ed"));
    await expect.poll(() => page.evaluate(() => window.__maj.length)).toBe(2);
    expect(await page.evaluate(() => [window.__maj[1].visibilite, window.__auFil.length, window.__suppr.length])).toEqual(["publique", 0, 1]);
  });
});
