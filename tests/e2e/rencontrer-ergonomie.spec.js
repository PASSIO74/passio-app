// Rencontrer — ergonomie, visuel et accessibilité (2026-11-27).
// Revue sur captures réelles (320, 390 et 1440 px). Faux serveur PostgREST
// multi-comptes pour ce que la base décide (demandes à valider, retrait d'un
// participant), état local pour le reste. AUCUNE écriture réelle.
//
// Défauts fermés, chacun ROUGE sur le code d'avant (contre-épreuve sur 8091) :
//   ①  a) l'organisation ne voyait nulle part les demandes qui l'attendent :
//       pastille « N demande(s) à valider » sur la carte, bouton en tête de la
//       fiche et dans « Gérer » — le NOMBRE est celui de la base, pas des listes.
//   ②  b) une erreur du formulaire « Créer une activité » ne vivait que dans un
//       toast : elle s'écrit sous le champ (aria-invalid, aria-describedby), et le
//       focus va au premier champ fautif.
//   ③  c) « Gérer l'activité » : huit boutons identiques → Modifier · Inviter ·
//       Participants en tête, zone « sensible » à part ; « Retirer » un
//       participant ou un invité laisse 5 s pour annuler.
//   ④  d) après « Je participe » : retour à l'écran, et les rappels proposés en
//       BANDEAU — la feuille recouvrait la fiche.
//   ⑤  e) pendant l'activité, « Je suis arrivé·e » est l'action du pied.
//   ⑥  f) contrastes (bouton principal à 2,84:1, pastille « Dans 2 jours » à
//       1,68:1) et cibles (× des feuilles 34 px, « Plus d'options » 33 px).
//   ⑦  g) 320 px : héros + pied laissaient 17 % de l'écran ; ordinateur : le pied
//       était centré sur la fenêtre, 125 px à côté de la colonne de lecture.
//   ⑧  h) la fiche plein écran est un dialogue (focus dedans, Tab y reste, Échap
//       ferme, focus rendu au déclencheur, role + aria-modal + nom).
//   ⑨  (reste des constats « majeur ») même pied vert pour une demande, une place
//       validée et la liste d'attente ; dans la feuille de réponse, la réponse en
//       cours peinte en bouton principal, et « Je participe » qui promettait la
//       discussion avant la validation.
const { test, expect } = require("@playwright/test");
const { FauxServeur, ouvrirCompte } = require("./audit-2026-11-parcours-faux-serveur");
const { bootOnboarded } = require("./app-helper");

const ORGA = "aaaaaaaa-0000-4000-8000-000000000071";
const B = "bbbbbbbb-0000-4000-8000-000000000072";
const C = "cccccccc-0000-4000-8000-000000000073";
const W = "dddddddd-0000-4000-8000-000000000074";
const iso = (ms) => new Date(ms).toISOString().replace("Z", "");
const ligne = (ev, u, rsvp) => ({ event_id: ev, user_id: u, rsvp, created_at: new Date(Date.now() - 3600000).toISOString() });

// `participants_validation` (lecture de l'organisation, avec ses accords) et
// `valider_participant` (verdict de l'organisation) : le banc commun ne les
// connaît pas. Miroirs minimaux : seule l'organisation lit, les accords sont
// `srv.valides`, chaque verdict est journalisé dans `srv.verdicts`.
function avecValidation(srv) {
  srv.valides = new Set([ORGA]);
  srv.verdicts = [];
  const traiter = srv.traiter.bind(srv);
  srv.traiter = async (req) => {
    const url = new URL(req.url());
    const m = /\/rest\/v1\/rpc\/(participants_validation|valider_participant)$/.exec(url.pathname);
    if (!m) return traiter(req);
    const jwt = (req.headers()["authorization"] || "").replace(/^Bearer\s+/i, "").split(".")[1] || "";
    let me = null;
    try { const c = JSON.parse(Buffer.from(jwt.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); me = c.role === "authenticated" ? c.sub : null; } catch (e) {}
    let corps = {}; try { corps = JSON.parse(req.postData() || "{}"); } catch (e) {}
    const h = { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" };
    const orga = me && srv.organiseActivite(corps.p_event_id, me);
    if (m[1] === "valider_participant") {
      srv.verdicts.push({ t: Date.now(), me, uid: corps.p_user_id, accepter: corps.p_accepter });
      if (!orga) return { status: 200, contentType: "application/json", body: "false", headers: h };
      if (corps.p_accepter) srv.valides.add(corps.p_user_id);
      else { srv.valides.delete(corps.p_user_id); srv.t.event_attendees = srv.t.event_attendees.filter((a) => !(a.event_id === corps.p_event_id && a.user_id === corps.p_user_id)); }
      return { status: 200, contentType: "application/json", body: "true", headers: h };
    }
    const lignes = orga ? srv.t.event_attendees.filter((a) => a.event_id === corps.p_event_id)
      .map((a) => ({ user_id: a.user_id, rsvp: a.rsvp, valide: srv.valides.has(a.user_id) })) : [];
    return { status: 200, contentType: "application/json", body: JSON.stringify(lignes),
      headers: Object.assign({ "content-range": (lignes.length ? "0-" + (lignes.length - 1) : "*") + "/" + lignes.length }, h) };
  };
  return srv;
}
function activite(srv, id, opts) {
  srv.t.events.push(Object.assign({ id, author_id: ORGA, organizer_id: ORGA, title: "Atelier " + id, passion_id: "musique", city: "Annecy",
    emoji: "🎸", max_attendees: 8, date_at: iso(Date.now() + 2 * 86400000), status: "active", co_organizers: [], visibilite: "publique",
    created_at: iso(Date.now() - 86400000), lat: 45.9, lng: 6.12 }, opts));
}
async function ouvrir(browser, srv, uid, nom) {
  const ctx = await browser.newContext();
  const o = await ouvrirCompte(ctx, srv, uid, { nom });
  await o.page.waitForFunction(() => window._supaInitTerminee === true, null, { timeout: 30000 });
  await o.page.evaluate(async () => {
    state.seed.events = await supaLoadEvents();
    state.userEvents = [];
    saveState();
    goTo("irl");
    renderIRL();
  });
  return { ctx, page: o.page };
}

// État local : une activité d'autrui (identifiant hors seed, donc pas un
// « exemple »), sans aucun réseau.
async function local(page, ev, opts = {}) {
  await bootOnboarded(page);
  await page.evaluate(({ ev, rsvp }) => {
    ["supaPublishEvent", "supaUpdateEvent", "supaJoinEvent", "supaLeaveEvent", "supaSetEventRsvp", "supaLoadEvents", "supaLoadMyRsvps",
      "supaInsertNotif", "supaCreateEventConversation", "supaJoinEventConversation", "supaLeaveEventConversation"].forEach((fn) => { window[fn] = async () => null; });
    window._supaReal = false;
    window.requireAdmission = async () => true;
    window.__toasts = [];
    const t0 = window.toast;
    window.toast = function (msg, type) { window.__toasts.push({ msg: String(msg), type: type || "info" }); return t0.apply(this, arguments); };
    const base = state.seed.events.find((e) => e.id === "e1");
    const neuf = Object.assign({}, base, { attendees: ["u_autre"], maybes: [], waitlist: [], checkedIn: [], status: "active",
      organizerId: "u_autre", authorId: "u_autre", maxAttendees: 8, coOrganizers: [], counts: null, _mine: false }, ev);
    neuf.date = Date.now() + (ev.dans != null ? ev.dans : 2 * 86400000);
    if (ev.duree != null) neuf.endAt = neuf.date + ev.duree;
    state.seed.events = state.seed.events.filter((e) => e.id !== neuf.id);
    state.seed.events.unshift(neuf);
    if (rsvp) _setMyRsvpLocal(neuf.id, rsvp);
    saveState();
  }, { ev, rsvp: opts.rsvp || null });
}
// La fiche a fini d'entrer (une animation en cours fausse toute géométrie).
const animationsFinies = (page) => page.evaluate(() => Promise.all(document.getAnimations()
  .filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))));
const DESC = Array.from({ length: 30 }, (_, i) => "Ligne " + (i + 1) + " de la description.").join("\n");

// Une cible tactile : la boîte mesure 44 px, et le point du bord haut comme du
// bord bas appartient bien à l'élément (`elementFromPoint`, jamais `::after`).
async function cible(loc) {
  return loc.evaluate(async (el) => {
    // Une feuille qui glisse encore : on mesure la boîte une fois immobile.
    el.scrollIntoView({ block: "center" });
    let r = el.getBoundingClientRect();
    for (let i = 0; i < 20; i++) {
      await new Promise((ok) => setTimeout(ok, 80));
      const n = el.getBoundingClientRect();
      if (n.top === r.top && n.left === r.left && n.height === r.height) break;
      r = n;
    }
    const a = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
    const cx = r.left + r.width / 2;
    return { w: Math.round(r.width), h: Math.round(r.height), haut: a(cx, r.top + 1), bas: a(cx, r.bottom - 1), gauche: a(r.left + 1, r.top + r.height / 2) };
  });
}

test.describe("Rencontrer — ergonomie, visuel et accessibilité", () => {
  test.setTimeout(150000);

  test("① l'organisation voit ses demandes à valider (nombre de la base) : carte, tête de fiche, « Gérer » — et elles disparaissent une fois traitées", async ({ browser }) => {
    const srv = avecValidation(new FauxServeur());
    [[ORGA, "orga_erg"], [B, "bob_erg"], [C, "cleo_erg"], [W, "wil_erg"]].forEach(([u, n]) => srv.compte(u, n));
    activite(srv, "evt_erg_1", { title: "Atelier demandes" });
    // B demande, C est déjà validée, W attend en file : UNE demande à valider,
    // alors que trois personnes « viennent » dans les listes locales.
    srv.t.event_attendees.push(ligne("evt_erg_1", ORGA, "going"), ligne("evt_erg_1", B, "going"), ligne("evt_erg_1", C, "going"), ligne("evt_erg_1", W, "waitlist"));
    srv.valides.add(C);
    const { ctx, page } = await ouvrir(browser, srv, ORGA, "orga_erg");
    try {
      const carte = page.locator('#eventList .event-card[data-evid="evt_erg_1"]');
      const pastille = carte.locator(".v4a2-demandes");
      await expect(pastille).toBeVisible({ timeout: 15000 });
      await expect(pastille).toHaveText("1 demande à valider");
      // La liste peut se repeindre pendant la mesure (carte remplacée) : on remesure.
      await expect.poll(async () => (await cible(pastille)).h).toBeGreaterThanOrEqual(44);
      // La pastille ouvre la validation, pas la fiche.
      await pastille.click();
      await expect(page.locator("#modalBackdrop.active .modal-title")).toHaveText("Participants");
      expect(await page.evaluate(() => document.getElementById("eventDetailPage").style.display)).not.toBe("flex");
      await page.evaluate(() => closeModal());

      // Tête de la fiche : avant « Le rendez-vous ».
      await page.evaluate(() => openEventDetails("evt_erg_1"));
      const tete = page.locator("#eventDetailContent [data-v4b-demandes]");
      await expect(tete).toHaveText("1 demande à valider");
      const ordre = await page.evaluate(() => {
        const t = document.querySelector("#eventDetailContent [data-v4b-demandes]").getBoundingClientRect().top;
        const r = document.querySelector('#eventDetailContent [data-v4b-sec="rendezvous"]').getBoundingClientRect().top;
        return t < r;
      });
      expect(ordre, "le bouton est EN TÊTE de la fiche").toBe(true);

      // « Gérer l'activité » : en tête aussi.
      await page.locator("#eventDetailCta [data-v4b-rsvp-gerer]").click();
      const gerer = page.locator("#modalBackdrop.active [data-gerer-demandes]");
      await expect(gerer).toHaveText("1 demande à valider");
      await gerer.click();
      const ligneB = page.locator('#modalBackdrop.active .ev-valid-row[data-uid="' + B + '"]');
      await expect(ligneB).toContainText("Demande en attente");
      // Les boutons de la fenêtre de validation : 44 px réels (f).
      const valider = ligneB.getByRole("button", { name: "Valider" });
      const mesure = await cible(valider);
      expect(mesure.h, "bouton Valider : 44 px").toBeGreaterThanOrEqual(44);
      expect(mesure.haut && mesure.bas).toBe(true);
      await valider.click();
      await expect.poll(() => srv.verdicts.filter((v) => v.uid === B && v.accepter === true).length).toBe(1);
      // Plus aucune demande : la tête de fiche et la carte se taisent.
      await expect(tete).toHaveCount(0);
      await page.evaluate(() => { closeModal(); closeEventDetail(); });
      await expect(pastille).toBeHidden();
    } finally { await ctx.close(); }
  });

  test("② formulaire : l'erreur s'écrit sous le champ, le champ est marqué, le focus va au premier champ fautif ; corriger efface le message", async ({ page }) => {
    await local(page, { id: "evt_erg_2" });
    await page.evaluate(() => {
      openCreateEvent();
      document.getElementById("evTitle").value = "ab";
      document.getElementById("evCity").value = "";
      document.getElementById("evTime").value = "18:00";
    });
    await page.evaluate(() => submitEvent());
    const titre = page.locator("#evTitle");
    await expect(titre).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#evCity")).toHaveAttribute("aria-invalid", "true");
    const r = await page.evaluate(() => {
      const champ = document.getElementById("evTitle");
      const ids = (champ.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
      const m = ids.map((i) => document.getElementById(i)).find(Boolean);
      const rc = champ.getBoundingClientRect(), rm = m ? m.getBoundingClientRect() : null;
      return { texte: m && m.textContent, sous: !!rm && rm.top >= rc.bottom - 1 && rm.height > 0 && rm.left < rc.right,
        couleur: m && getComputedStyle(m).color, focus: document.activeElement && document.activeElement.id };
    });
    expect(r.texte).toBe("Titre trop court (3 caractères min)");
    expect(r.sous, "le message est SOUS le champ, visible").toBe(true);
    expect(r.couleur, "en rouge, pas en gris de libellé").toBe("rgb(180, 35, 24)");
    expect(r.focus, "premier champ fautif dans l'ordre de la page").toBe("evTitle");
    await titre.pressSequentially("c");
    await expect(titre).not.toHaveAttribute("aria-invalid", "true");
    expect(await page.locator("#evTitleErreur").count()).toBe(0);
    await expect(page.locator("#evCity"), "l'autre erreur reste").toHaveAttribute("aria-invalid", "true");
  });

  async function orgaGestion(browser) {
    const srv = avecValidation(new FauxServeur());
    [[ORGA, "orga_erg"], [B, "bob_erg"]].forEach(([u, n]) => srv.compte(u, n));
    activite(srv, "evt_erg_3", { title: "Atelier gestion" });
    srv.t.event_attendees.push(ligne("evt_erg_3", ORGA, "going"), ligne("evt_erg_3", B, "going"));
    srv.valides.add(B);
    return { srv, ...(await ouvrir(browser, srv, ORGA, "orga_erg")) };
  }

  test("③ « Gérer » hiérarchisé : Modifier · Inviter · Participants en tête, annuler et supprimer dans une zone sensible à part", async ({ browser }) => {
    const { ctx, page } = await orgaGestion(browser);
    try {
      await page.evaluate(() => openEventManage("evt_erg_3"));
      const m = page.locator("#modalBackdrop.active");
      const r = await page.evaluate(() => {
        const boutons = [...document.querySelectorAll("#modalBackdrop.active #modalContent button")].filter((b) => b.getClientRects().length && !b.classList.contains("modal-close"));
        const noms = boutons.map((b) => b.textContent.trim());
        const zone = document.querySelector("#modalBackdrop.active .ev-gerer-danger");
        const dans = (t) => !!zone && [...zone.querySelectorAll("button")].some((b) => b.textContent.trim() === t);
        const fondZone = zone && getComputedStyle(zone).backgroundColor;
        const fondModale = getComputedStyle(document.querySelector("#modalBackdrop.active .modal") || document.body).backgroundColor;
        return { noms, annulerDansZone: dans("Annuler l'activité"), supprimerDansZone: dans("Supprimer définitivement"), fondZone, fondModale };
      });
      expect(r.noms.slice(0, 3), "l'essentiel en tête").toEqual(["Modifier les informations", "Inviter des personnes", "Participants"]);
      expect(r.annulerDansZone && r.supprimerDansZone, "annuler et supprimer dans la zone sensible").toBe(true);
      expect(r.fondZone, "la zone sensible se distingue").not.toBe(r.fondModale);
      expect(r.noms.indexOf("Supprimer définitivement")).toBeGreaterThan(r.noms.indexOf("Prévenir les inscrits"));
      // Le × des feuilles : 44 px réels (f).
      const x = await cible(m.locator(".modal-close").first());
      expect(x.w).toBeGreaterThanOrEqual(44);
      expect(x.h).toBeGreaterThanOrEqual(44);
      expect(x.haut && x.bas && x.gauche).toBe(true);
    } finally { await ctx.close(); }
  });

  test("③ bis « Retirer » un participant ou un invité : rien ne part au premier appui, « Annuler » retient, le retrait part au bout de 5 s", async ({ browser }) => {
    const { srv, ctx, page } = await orgaGestion(browser);
    try {
      // Retirer un participant : rien ne part tout de suite ; « Annuler » retient.
      await page.evaluate(() => openEventParticipantValidation("evt_erg_3"));
      const ligneB = page.locator('#modalBackdrop.active .ev-valid-row[data-uid="' + B + '"]');
      await ligneB.getByRole("button", { name: "Retirer" }).click();
      await expect(ligneB.getByRole("button", { name: "Annuler" })).toBeVisible();
      await page.waitForTimeout(1500);
      expect(srv.verdicts.length, "aucun retrait au premier appui").toBe(0);
      await ligneB.getByRole("button", { name: "Annuler" }).click();
      await page.waitForTimeout(5000);
      expect(srv.verdicts.length, "annulé : rien n'est parti").toBe(0);
      expect(srv.t.event_attendees.some((a) => a.event_id === "evt_erg_3" && a.user_id === B), "B toujours inscrit en base").toBe(true);
      // Sans annuler : le retrait part au bout du délai, une fois.
      await ligneB.getByRole("button", { name: "Retirer" }).click();
      await expect.poll(() => srv.verdicts.length, { timeout: 10000 }).toBe(1);
      expect(srv.verdicts[0]).toMatchObject({ uid: B, accepter: false });

      // Un invité d'une activité privée : même délai.
      const appels = await page.evaluate(async () => {
        closeModal();
        const ev = _findCanonicalEvent("evt_erg_3");
        ev.visibilite = "privee";
        window.__retraits = [];
        window.supaLireInvitesActivite = async () => ["u_invite_erg"];
        window.supaRetirerInviteActivite = async (e, u) => { window.__retraits.push(u); return true; };
        openEventInvite("evt_erg_3");
        await new Promise((r) => setTimeout(r, 300));
        document.querySelector('[data-invite-prive="u_invite_erg"] button').click();
        await new Promise((r) => setTimeout(r, 1500));
        const avant = window.__retraits.length;
        const libelle = document.querySelector('[data-invite-prive="u_invite_erg"] button').textContent;
        await new Promise((r) => setTimeout(r, 4500));
        return { avant, libelle, apres: window.__retraits.length };
      });
      expect(appels.avant, "invité : rien au premier appui").toBe(0);
      expect(appels.libelle).toBe("Annuler");
      expect(appels.apres, "invité : retiré au bout du délai").toBe(1);
    } finally { await ctx.close(); }
  });

  test("④ « Je participe » : le pied change aussitôt, un retour s'affiche, et les rappels arrivent en bandeau — jamais en feuille sur la fiche", async ({ page }) => {
    await local(page, { id: "evt_erg_4", title: "Jam du jeudi", dans: 5 * 3600e3 });
    await page.evaluate(() => {
      window._supaReal = true;
      window.requireAuthentication = () => true;
      window._uidEstUnCompte = () => true;
      window.supaSetEventRsvp = () => new Promise((r) => setTimeout(() => r(true), 1200));
      window.__notif = { permission: "default", requestPermission: async () => "granted" };
      Object.defineProperty(window, "Notification", { configurable: true, get: () => window.__notif });
      window.ensureCallPushSubscription = async () => true;
      localStorage.removeItem("passio_rappels_proposes_v1");
      openEventDetails("evt_erg_4");
    });
    await page.locator("#eventDetailCta [data-v4b-rsvp-go]").click();
    // Avant même le verdict (1,2 s), le pied dit l'état.
    await expect(page.locator("#eventDetailCta [data-v4b-rsvp-etat]")).toBeVisible({ timeout: 800 });
    await expect.poll(() => page.evaluate(() => window.__toasts.map((t) => t.msg))).toContain("C'est noté : tu participes !");
    const bandeau = page.locator("#bandeauRappels");
    await expect(bandeau).toBeVisible();
    await expect(bandeau).toContainText("Jam du jeudi");
    await expect(page.locator("#modalBackdrop.active"), "aucune feuille ne recouvre la fiche").toHaveCount(0);
    // La fiche reste utilisable : le bouton du pied est sous le doigt, pas sous le bandeau.
    const libre = await page.evaluate(() => {
      const b = document.querySelector("#eventDetailCta [data-v4b-rsvp-chat]");
      const r = b.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return t === b || b.contains(t);
    });
    expect(libre).toBe(true);
    // Et il ne mord sur aucune ligne du pied, même grandi par l'inscription.
    await expect.poll(() => page.evaluate(() => document.getElementById("bandeauRappels").getBoundingClientRect().bottom
      <= document.getElementById("eventDetailCta").getBoundingClientRect().top + 1)).toBe(true);
    await bandeau.getByRole("button", { name: "Plus tard" }).click();
    await expect(bandeau).toHaveCount(0);
  });

  test("⑤ pendant l'activité, « Je suis arrivé·e » est l'action principale du pied (et le corps ne le double pas)", async ({ page }) => {
    await local(page, { id: "evt_erg_5", title: "Jam en cours", dans: -30 * 60000, duree: 2 * 3600e3 }, { rsvp: "going" });
    await page.evaluate(() => {
      window.__pointe = [];
      window.checkInEvent = (id) => { window.__pointe.push(id); };
      openEventDetails("evt_erg_5");
    });
    const pointer = page.locator("#eventDetailCta [data-v4b-rsvp-pointer]");
    await expect(pointer).toHaveText("Je suis arrivé·e");
    await expect(pointer).toHaveClass(/primary/);
    const c = await cible(pointer);
    expect(c.h).toBeGreaterThanOrEqual(44);
    expect(c.haut && c.bas).toBe(true);
    await expect(page.locator("#eventDetailContent").getByRole("button", { name: "Je suis sur place" })).toHaveCount(0);
    await pointer.click();
    expect(await page.evaluate(() => window.__pointe)).toEqual(["evt_erg_5"]);
    // Témoin : hors de la fenêtre de pointage, le pied redevient celui d'un inscrit.
    await page.evaluate(() => { closeEventDetail(); const ev = _findCanonicalEvent("evt_erg_5") || allEvents().find((e) => e.id === "evt_erg_5"); ev.date = Date.now() + 3 * 86400000; ev.endAt = ev.date + 7200e3; openEventDetails("evt_erg_5"); });
    await expect(page.locator("#eventDetailCta [data-v4b-rsvp-chat]")).toBeVisible();
    await expect(pointer).toHaveCount(0);
  });

  test("⑥ contrastes et cibles : bouton principal ≥ 4,5:1, pastille « Dans 2 jours » ≥ 4,5:1, « Plus d'options » 44 px", async ({ page }) => {
    await local(page, { id: "evt_erg_6", title: "Bientôt" });
    const r = await page.evaluate(() => {
      const lum = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const L = ([r, g, b]) => 0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b);
      const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const rgba = (s) => (s.match(/[\d.]+/g) || []).map(Number);
      // Un fond translucide se lit posé sur la page de la fiche.
      const poser = (fg, fond) => { const a = fg.length > 3 ? fg[3] : 1; return [0, 1, 2].map((i) => fg[i] * a + fond[i] * (1 - a)); };
      const b = document.createElement("button");
      b.className = "btn primary";
      b.textContent = "Écrire aux participants";
      document.body.appendChild(b);
      const cs = getComputedStyle(b);
      const arrets = (cs.backgroundImage.match(/rgba?\([^)]*\)/g) || []).map(rgba);
      const texte = rgba(cs.color);
      const minBouton = Math.min(...arrets.map((c) => ratio(texte, c)));
      b.remove();
      openEventDetails("evt_erg_6");
      const p = document.querySelector("#eventDetailContent .event-detail-urgency");
      const ps = getComputedStyle(p);
      const pageFond = rgba(getComputedStyle(document.getElementById("eventDetailPage")).backgroundColor);
      const fond = poser(rgba(ps.backgroundColor), pageFond);
      return { arrets: arrets.length, minBouton, pastille: p.textContent.trim(), ratioPastille: ratio(rgba(ps.color), fond) };
    });
    expect(r.arrets, "prémisse : un dégradé").toBeGreaterThan(1);
    expect(r.minBouton, "texte blanc sur CHAQUE arrêt du dégradé").toBeGreaterThanOrEqual(4.5);
    expect(r.pastille).toBe("Dans 2 jours");
    expect(r.ratioPastille).toBeGreaterThanOrEqual(4.5);
    await page.evaluate(() => { closeEventDetail(); openCreateEvent(); });
    const plus = page.locator("#modalBackdrop.active .v6a0-options > summary");
    await expect(plus).toHaveText("Plus d'options");
    const c = await cible(plus);
    expect(c.h).toBeGreaterThanOrEqual(44);
    expect(c.haut && c.bas).toBe(true);
  });

  test("⑦ 320 px : le contenu garde sa place (héros plus bas, pied compact au défilement), sans qu'aucune action ne disparaisse", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await local(page, { id: "evt_erg_7", title: "Atelier petit écran", description: DESC }, { rsvp: "going" });
    await page.evaluate(() => openEventDetails("evt_erg_7"));
    await expect(page.locator("#eventDetailCta [data-v4b-rsvp-etat]")).toBeVisible();
    await animationsFinies(page);
    const haut = await page.evaluate(() => {
      const h = document.getElementById("eventDetailHero").getBoundingClientRect();
      const p = document.getElementById("eventDetailCta").getBoundingClientRect();
      return (p.top - h.bottom) / innerHeight;
    });
    expect(haut, "en haut de fiche, au moins un quart de l'écran au contenu").toBeGreaterThanOrEqual(0.25);
    await page.evaluate(() => { document.getElementById("eventDetailPage").scrollTop = 500; });
    await expect.poll(() => page.evaluate(() => document.getElementById("eventDetailCta").getBoundingClientRect().height)).toBeLessThanOrEqual(190);
    await expect.poll(() => page.evaluate(() => document.getElementById("eventDetailCta").getBoundingClientRect().top / innerHeight),
      { message: "en lisant, plus des deux tiers de l'écran au contenu" }).toBeGreaterThanOrEqual(0.66);
    // Aucune action n'a disparu du pied compact.
    for (const sel of ["[data-v4b-rsvp-chat]", "[data-v4b-rsvp-remove]"]) await expect(page.locator("#eventDetailCta " + sel)).toBeVisible();
  });

  test("⑦ bis ordinateur (1440 px, menu latéral) : le pied est centré sur la colonne de lecture, pas sur la fenêtre", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await local(page, { id: "evt_erg_7", title: "Atelier grand écran", description: DESC }, { rsvp: "going" });
    await page.evaluate(() => openEventDetails("evt_erg_7"));
    await expect(page.locator("#eventDetailCta .v4b-rsvp")).toBeVisible();
    await animationsFinies(page);
    const ecart = await page.evaluate(() => {
      const c = document.getElementById("eventDetailContent").getBoundingClientRect();
      const p = document.querySelector("#eventDetailCta .v4b-rsvp").getBoundingClientRect();
      return Math.abs((c.left + c.width / 2) - (p.left + p.width / 2));
    });
    expect(ecart, "pied et colonne de lecture sur le même axe").toBeLessThanOrEqual(4);
  });

  test("⑧ la fiche est un dialogue : nom, focus dedans, Tab y reste, Échap ferme et rend le focus au déclencheur", async ({ page }) => {
    await local(page, { id: "evt_erg_8", title: "Atelier clavier" });
    await page.evaluate(() => { goTo("irl"); renderIRL(); });
    const voir = page.locator('#eventList .event-card[data-evid="evt_erg_8"] .v4a2-voir');
    await voir.focus();
    await page.keyboard.press("Enter");
    const fiche = page.locator("#eventDetailPage");
    await expect(fiche).toBeVisible();
    await expect(fiche).toHaveAttribute("role", "dialog");
    await expect(fiche).toHaveAttribute("aria-modal", "true");
    await expect(fiche).toHaveAttribute("aria-label", "Atelier clavier");
    await expect.poll(() => page.evaluate(() => document.getElementById("eventDetailPage").contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press(i % 7 === 6 ? "Shift+Tab" : "Tab");
      const dedans = await page.evaluate(() => document.getElementById("eventDetailPage").contains(document.activeElement));
      expect(dedans, "Tab n° " + (i + 1) + " reste dans la fiche").toBe(true);
    }
    await page.evaluate(() => document.getElementById("eventDetailPage").focus());
    await page.keyboard.press("Escape");
    await expect(fiche).toBeHidden();
    expect(await page.evaluate(() => {
      const a = document.activeElement;
      return !!a && a.classList.contains("v4a2-voir") && !!a.closest('[data-evid="evt_erg_8"]');
    }), "le focus revient sur « Détails »").toBe(true);
  });
  test("⑨ l'état se lit sans la seule couleur : pied ambre pour une demande, vert une fois validée ; la réponse en cours de la feuille est marquée, pas peinte en bouton principal", async ({ page }) => {
    await local(page, { id: "evt_erg_9", title: "Atelier états", fromSupabase: true }, { rsvp: "going" });
    const fond = () => page.evaluate(() => getComputedStyle(document.querySelector("#eventDetailCta [data-v4b-rsvp-etat]")).backgroundColor);
    await page.evaluate(() => openEventDetails("evt_erg_9"));
    await expect(page.locator("#eventDetailCta [data-v4b-rsvp-etat]")).toHaveText("Demande envoyée");
    const demande = await fond();
    await page.evaluate(() => { [_findCanonicalEvent("evt_erg_9"), state.seed.events.find((e) => e.id === "evt_erg_9")].forEach((ev) => { if (ev) ev._accesPrive = true; }); closeEventDetail(); openEventDetails("evt_erg_9"); });
    await expect(page.locator("#eventDetailCta [data-v4b-rsvp-etat]")).toHaveText("Participation confirmée");
    expect(await fond(), "demande et place validée ne portent pas la même couleur").not.toBe(demande);
    await page.evaluate(() => { closeEventDetail(); openEventRsvpSheet("evt_erg_9"); });
    const r = await page.evaluate(() => [...document.querySelectorAll("#modalBackdrop.active .rsvp-option")].map((o) => ({
      titre: o.querySelector("b").textContent, presse: o.getAttribute("aria-pressed"), primaire: o.classList.contains("primary"), texte: o.textContent })));
    const actuelle = r.find((o) => o.titre === "Je participe");
    expect(actuelle.presse).toBe("true");
    expect(actuelle.primaire, "pas le remplissage du bouton principal").toBe(false);
    expect(actuelle.texte).toContain("Ta réponse actuelle");
    expect(r.filter((o) => o.presse === "true").length).toBe(1);
    expect(actuelle.texte, "une demande ne promet pas la discussion").not.toContain("tu rejoins la discussion");
  });
});
