// Rencontrer — la CARTE et la FICHE d'une activité (2026-11-27).
// Faux serveur PostgREST multi-comptes (policies et RPC miroirs de la
// production), vrai SDK, vrais handlers — ou état local pour les cas sans base.
// AUCUNE écriture réelle.
//
// Défauts fermés (numéros du dossier de vérification), chacun ROUGE sur le code
// d'avant (contre-épreuve sur 8091) :
//   ①  195 — un re-rendu de la fiche (« Je participe », relecture) la ramenait
//       EN HAUT et effaçait le commentaire en cours d'écriture.
//   ②  208 — le mot laissé avec une note n'était montré à PERSONNE : il arrive
//       à l'organisation (et à elle seule), échappé.
//   ③  197 — un visiteur lisait « 0 participant · 3 places restantes » et « sois
//       le premier ! » sur une activité COMPLÈTE.
//   ④  ergonomie a) — « je participe » est une DEMANDE tant que l'organisation
//       ne l'a pas validée : « Demande envoyée » / « Participation confirmée » /
//       « En liste d'attente », mêmes mots sur la carte et au pied de la fiche.
//   ⑤  ergonomie b) + 204 — annulée ou terminée : ni places restantes, ni
//       inscription, ni calendrier, ni invitation.
//   ⑥  ergonomie c) + 202 — cadenas « Privée » sur la carte, badge lisible sur
//       l'en-tête sombre de la fiche.
//   ⑦  196 — « L'adresse exacte s'affiche après validation » sur une activité
//       qui n'a pas d'adresse, chez l'organisation et l'inscrit validé.
//   ⑧  211 — une réponse d'un état inconnu vidait toute la liste.
//   ⑨  206 — Entrée sur « Je participe » ouvrait la fiche au lieu d'inscrire.
//   ⑩  201 — une activité tout juste créée recevait de faux j'aime et commentaires.
//   ⑪  200 — ouvrir une activité d'exemple effaçait ses commentaires de démonstration.
//   ⑫  210 — profil de l'organisation illisible : la fiche montrait MON nom.
//   ⑬  214 — un contact « a@x.fr?subject=…&body=… » ouvrait un courriel pré-rempli.
//   ⑭  205 — une annulation relue ne changeait pas la fiche ouverte.
//   ⑮  203 — « Je suis sur place » offert à l'organisation et aux non-inscrits ;
//       un visiteur « pointait » une vraie activité sans rien écrire.
//   ⑯  209 — deux icônes de partage sur le héros de la fiche.
//   ⑰  213 — « #event-<id> » posé par la fiche n'était relu par aucun routeur.
//   ⑱  149 — un j'aime posé depuis un autre appareil : cœur vide sur la fiche, et
//       l'appui l'ajoutait une seconde fois au lieu de le retirer.
const { test, expect } = require("@playwright/test");
const { FauxServeur, ouvrirCompte } = require("./audit-2026-11-parcours-faux-serveur");
const { bootOnboarded } = require("./app-helper");

const ORGA = "aaaaaaaa-0000-4000-8000-000000000041";
const B = "bbbbbbbb-0000-4000-8000-000000000042";
const C = "cccccccc-0000-4000-8000-000000000043";
const W = "dddddddd-0000-4000-8000-000000000044";
const iso = (ms) => new Date(ms).toISOString().replace("Z", "");
const DESC_LONGUE = Array.from({ length: 40 }, (_, i) => "Ligne " + (i + 1) + " de la description, pour que la fiche défile vraiment.").join("\n");

function activite(srv, id, opts) {
  srv.t.events.push(Object.assign({ id, author_id: ORGA, organizer_id: ORGA, title: "Activité " + id, passion_id: "musique", city: "Annecy",
    emoji: "🎸", max_attendees: null, date_at: iso(Date.now() + 2 * 86400000), status: "active", co_organizers: [], visibilite: "publique",
    created_at: iso(Date.now() - 86400000), lat: 45.9, lng: 6.12 }, opts));
}
const ligne = (ev, u, rsvp, extra) => Object.assign({ event_id: ev, user_id: u, rsvp, created_at: new Date(Date.now() - 3600000).toISOString() }, extra || {});

// `adresses_activites` (production) : une ligne pour l'organisation et pour qui
// VIENT — `rsvp = 'going'` ET un accord de l'organisation (`rencontres_prive.accords`).
// Le banc commun ne la connaît pas ; on l'ajoute ici, avec ses accords.
function avecAdresses(srv) {
  srv.accords = new Set();
  const traiter = srv.traiter.bind(srv);
  srv.traiter = async (req) => {
    const url = new URL(req.url());
    if (!/\/rest\/v1\/rpc\/adresses_activites$/.test(url.pathname)) return traiter(req);
    const jwt = (req.headers()["authorization"] || "").replace(/^Bearer\s+/i, "").split(".")[1] || "";
    let me = null;
    try { const c = JSON.parse(Buffer.from(jwt.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); me = c.role === "authenticated" ? c.sub : null; } catch (e) {}
    let corps = {}; try { corps = JSON.parse(req.postData() || "{}"); } catch (e) {}
    srv.journal.push({ t: Date.now(), me, m: req.method(), table: "adresses_activites", rpc: true, url: url.pathname, body: corps });
    const ids = (corps.p_event_ids || []).slice(0, 200);
    const vient = (e) => srv.accords.has(e.id + "|" + me) && srv.t.event_attendees.some((a) => a.event_id === e.id && a.user_id === me && a.rsvp === "going");
    const lignes = me ? srv.t.events.filter((e) => ids.includes(e.id) && (srv.organiseActivite(e.id, me) || vient(e)))
      .map((e) => ({ event_id: e.id, address: e.address || "", contact: e.contact || "" })) : [];
    return { status: 200, contentType: "application/json", body: JSON.stringify(lignes), headers: { "access-control-allow-origin": "*" } };
  };
  return srv;
}

async function ouvrir(browser, srv, uid, nom) {
  const ctx = await browser.newContext();
  const o = await ouvrirCompte(ctx, srv, uid, { nom });
  if (uid) await o.page.waitForFunction(() => window._supaInitTerminee === true, null, { timeout: 30000 });
  else await o.page.waitForTimeout(1500);
  return { ctx, page: o.page };
}

// Le VRAI chemin de lecture, puis les activités du serveur seules à l'écran.
async function charger(page, rsvps) {
  await page.evaluate(async (rsvps) => {
    const evs = await supaLoadEvents();
    state.seed.events = evs;
    state.userEvents = [];
    Object.entries(rsvps || {}).forEach(([id, r]) => _setMyRsvpLocal(id, r));
    saveState();
    goTo("irl");
    renderIRL();
  }, rsvps || {});
}
const carte = (page, id) => page.locator('#eventList .event-card[data-evid="' + id + '"]');

test.describe("Rencontrer — carte et fiche d'activité", () => {
  test.setTimeout(120000);

  test("① un re-rendu garde la position de lecture et le brouillon de commentaire, sans relire les commentaires", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(ORGA, "orga_fic"); srv.compte(B, "bob_fic");
    activite(srv, "evt_fic_1", { description: DESC_LONGUE, max_attendees: 8 });
    srv.t.event_attendees.push(ligne("evt_fic_1", ORGA, "going"));
    const { ctx, page } = await ouvrir(browser, srv, B, "bob_fic");
    try {
      await charger(page);
      await page.evaluate(() => openEventDetails("evt_fic_1"));
      await expect(page.locator("#eventDetailContent .v4b-fiche")).toHaveCount(1);
      await expect(page.locator("#eventCommentsList")).not.toContainText("Chargement");
      await page.locator("#eventCommentInput").pressSequentially("Mon brouillon, pas encore envoyé");
      // Au milieu de la description : ni le haut, ni le bas (que la hauteur du pied, qui change au geste, bornerait).
      const avant = await page.evaluate(() => { const p = document.getElementById("eventDetailPage"); p.scrollTop = Math.round((p.scrollHeight - p.clientHeight) / 2); return p.scrollTop; });
      expect(avant, "prémisse : la fiche défile").toBeGreaterThan(200);
      const j0 = srv.journal.length;
      await page.evaluate(() => toggleJoinEventDetail("evt_fic_1"));
      await page.waitForTimeout(3000);
      const apres = await page.evaluate(() => ({
        scroll: document.getElementById("eventDetailPage").scrollTop,
        valeur: document.getElementById("eventCommentInput").value,
        focus: document.activeElement && document.activeElement.id,
        rsvp: myRsvp("evt_fic_1"),
      }));
      expect(apres.rsvp, "prémisse : le geste a bien eu lieu").toBe("going");
      expect(Math.abs(apres.scroll - avant), "la fiche reste où on la lisait").toBeLessThan(80);
      expect(apres.valeur, "le brouillon est toujours là").toBe("Mon brouillon, pas encore envoyé");
      expect(apres.focus, "le champ garde le focus (clavier ouvert)").toBe("eventCommentInput");
      // Les lectures de la FICHE (`event_id=eq.`) ; celles de la liste (aperçus et compteurs, `in.(…)`,
      // différées par le lot « écran ») appartiennent à la liste, qui suit le geste.
      const lus = srv.journal.slice(j0).filter((r) => r.table === "event_comments" && r.m === "GET" && /event_id=eq./.test(r.url));
      const relectures = lus.length;
      expect(relectures, "un re-rendu ne relit pas les commentaires").toBe(0);
    } finally { await ctx.close(); }
  });

  test("② le mot laissé avec une note arrive à l'organisation — échappé — et à personne d'autre", async ({ browser }) => {
    const srv = new FauxServeur().migrerParticipants();
    srv.compte(ORGA, "orga_fic"); srv.compte(B, "bob_fic"); srv.compte(C, "cleo_fic");
    activite(srv, "evt_fic_2", { date_at: iso(Date.now() - 6 * 3600000), end_at: iso(Date.now() - 4 * 3600000) });
    srv.t.event_attendees.push(ligne("evt_fic_2", ORGA, "going"),
      ligne("evt_fic_2", B, "going", { rating: 4, feedback: "Super lieu <img src=x onerror=\"window.__xss=1\">, on n'entendait rien au fond", rated_at: new Date().toISOString() }));
    const o = await ouvrir(browser, srv, ORGA, "orga_fic");
    const t = await ouvrir(browser, srv, C, "cleo_fic");
    try {
      await charger(o.page);
      await o.page.evaluate(() => openEventDetails("evt_fic_2"));
      const bloc = o.page.locator("#eventDetailContent [data-evretours]");
      await expect(bloc).toContainText("Retours des participants");
      await expect(bloc).toContainText("on n'entendait rien au fond");
      await expect(bloc).toContainText("<img src=x");   // affiché comme du TEXTE
      await expect(bloc).toContainText("★★★★☆");
      expect(await o.page.evaluate(() => window.__xss), "aucune balise interprétée").toBeUndefined();
      // Un tiers ne voit aucun retour (la base ne lui rend rien, le client n'ouvre rien).
      await charger(t.page);
      await t.page.evaluate(() => openEventDetails("evt_fic_2"));
      await expect(t.page.locator("#eventDetailContent .v4b-fiche")).toHaveCount(1);
      await t.page.waitForTimeout(800);
      await expect(t.page.locator("#eventDetailContent")).not.toContainText("on n'entendait rien");
      await expect(t.page.locator("#eventDetailContent")).not.toContainText("Retours des participants");
    } finally { await o.ctx.close(); await t.ctx.close(); }
  });

  test("③ visiteur : ni « 0 participant », ni places libres, ni « sois le premier » sur une activité complète — le compte connecté lit toujours le vrai nombre", async ({ browser }) => {
    const srv = new FauxServeur().migrerParticipants();
    [ORGA, B, C, W].forEach((u, i) => srv.compte(u, "fic3_" + i));
    activite(srv, "evt_fic_3", { title: "Atelier complet", max_attendees: 3 });
    srv.t.event_attendees.push(ligne("evt_fic_3", ORGA, "going"), ligne("evt_fic_3", B, "going"), ligne("evt_fic_3", W, "going"),
      ligne("evt_fic_3", "eeeeeeee-0000-4000-8000-000000000045", "waitlist"));
    const v = await ouvrir(browser, srv, null);
    const t = await ouvrir(browser, srv, C, "cleo_fic");
    try {
      await charger(v.page);
      const monde = carte(v.page, "evt_fic_3").locator(".v4a2-monde");
      await expect(monde).toBeVisible();
      await expect(monde).not.toContainText("0 participant");
      await expect(monde).not.toContainText("places restantes");
      await expect(monde).toContainText("3 places au total");
      await v.page.evaluate(() => openEventDetails("evt_fic_3"));
      const contenu = v.page.locator("#eventDetailContent");
      await expect(contenu.locator(".v4b-rdv-places")).not.toContainText("0 participant");
      await expect(contenu).not.toContainText("sois le premier");
      await expect(contenu).not.toContainText("places disponibles");
      // Témoin : un compte connecté sans lien lit le nombre public.
      await charger(t.page);
      await expect(carte(t.page, "evt_fic_3").locator(".v4a2-monde")).toHaveText("3 participants · complet · 1 en attente");
    } finally { await v.ctx.close(); await t.ctx.close(); }
  });

  test("④ « Demande envoyée » tant que l'organisation n'a pas validé, puis « Participation confirmée » ; « En liste d'attente » — mêmes mots sur la carte et la fiche", async ({ browser }) => {
    const srv = avecAdresses(new FauxServeur());
    srv.compte(ORGA, "orga_fic"); srv.compte(B, "bob_fic");
    activite(srv, "evt_fic_4a", { title: "Demande", max_attendees: 6 });
    activite(srv, "evt_fic_4b", { title: "File", max_attendees: 1, date_at: iso(Date.now() + 3 * 86400000) });
    srv.t.event_attendees.push(ligne("evt_fic_4a", ORGA, "going"), ligne("evt_fic_4a", B, "going"),
      ligne("evt_fic_4b", ORGA, "going"), ligne("evt_fic_4b", B, "waitlist"));
    const { ctx, page } = await ouvrir(browser, srv, B, "bob_fic");
    try {
      await charger(page, { evt_fic_4a: "going", evt_fic_4b: "waitlist" });
      const rep = (id) => carte(page, id).locator('[data-v4a2-act="reponse"]');
      const pied = page.locator("#eventDetailCta [data-v4b-rsvp-etat]");
      await expect(rep("evt_fic_4a")).toHaveText("Demande envoyée");
      await page.evaluate(() => openEventDetails("evt_fic_4a"));
      await expect(pied).toHaveText("Demande envoyée");
      await expect(page.locator("#eventDetailCta .v4b-rsvp-detail")).toContainText("validation");
      // L'organisation valide : la relecture des accès le fait savoir.
      srv.accords.add("evt_fic_4a|" + B);
      await page.evaluate(() => _majAdresseActivite(_findCanonicalEvent("evt_fic_4a")));
      await expect(pied).toHaveText("Participation confirmée");
      await page.evaluate(() => closeEventDetail());
      await expect(rep("evt_fic_4a")).toHaveText("Participation confirmée");
      // Liste d'attente : les mêmes mots des deux côtés.
      await expect(rep("evt_fic_4b")).toHaveText("En liste d'attente");
      await page.evaluate(() => openEventDetails("evt_fic_4b"));
      await expect(pied).toHaveText("En liste d'attente");
    } finally { await ctx.close(); }
  });

  test("⑤ annulée ou terminée : ni places restantes, ni inscription, ni calendrier, ni invitation", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(ORGA, "orga_fic"); srv.compte(B, "bob_fic");
    activite(srv, "evt_fic_5a", { title: "Annulée", max_attendees: 5, status: "cancelled" });
    activite(srv, "evt_fic_5b", { title: "Terminée", max_attendees: 5, date_at: iso(Date.now() - 6 * 3600000), end_at: iso(Date.now() - 4 * 3600000) });
    srv.t.event_attendees.push(ligne("evt_fic_5a", ORGA, "going"), ligne("evt_fic_5b", ORGA, "going"));
    const { ctx, page } = await ouvrir(browser, srv, B, "bob_fic");
    try {
      await charger(page);
      const c = carte(page, "evt_fic_5a");
      await expect(c.locator(".v4a2-monde")).toBeVisible();
      await expect(c.locator(".v4a2-monde")).not.toContainText("place");
      await expect(c.locator('[data-v4a2-act="go"]')).toHaveCount(0);
      for (const id of ["evt_fic_5a", "evt_fic_5b"]) {
        await page.evaluate((id) => { closeEventDetail(); openEventDetails(id); }, id);
        const contenu = page.locator("#eventDetailContent");
        await expect(contenu.locator(".v4b-rdv-places")).toBeVisible();
        await expect(contenu.locator(".v4b-rdv-places")).not.toContainText("place");
        await expect(contenu).not.toContainText("places disponibles");
        await expect(contenu).not.toContainText("/ 5 max");
        await expect(contenu.getByRole("button", { name: "Ajouter au calendrier" })).toHaveCount(0);
        await expect(contenu.getByRole("button", { name: "Inviter" })).toHaveCount(0);
        await expect(page.locator("#eventDetailCta")).not.toContainText("Je participe");
      }
      await page.evaluate(() => { closeEventDetail(); window.__toasts = []; openEventInvite("evt_fic_5a"); });
      await expect(page.locator(".modal-title", { hasText: "Inviter mes abonnements" })).toHaveCount(0);
    } finally { await ctx.close(); }
  });

  test("⑥ « Privée » se voit sur la carte, et le badge de la fiche est lisible sur l'en-tête sombre", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(ORGA, "orga_fic"); srv.compte(B, "bob_fic");
    activite(srv, "evt_fic_6a", { title: "Dîner entre amis", visibilite: "privee" });
    activite(srv, "evt_fic_6b", { title: "Concert ouvert" });
    const { ctx, page } = await ouvrir(browser, srv, ORGA, "orga_fic");
    try {
      await charger(page);
      await expect(carte(page, "evt_fic_6a").locator(".v4a2").getByText(/Privée/)).toBeVisible();
      await expect(carte(page, "evt_fic_6b").locator(".v4a2")).toBeVisible();
      await expect(carte(page, "evt_fic_6b").locator(".v4a2-privee")).toBeHidden();
      await page.evaluate(() => openEventDetails("evt_fic_6a"));
      const badge = page.locator("#eventDetailHeroTitle .ev-badge-privee");
      await expect(badge).toBeVisible();
      const couleur = await badge.evaluate((el) => getComputedStyle(el).color);
      const [r, g, b] = couleur.match(/\d+/g).map(Number);
      expect(0.2126 * r + 0.7152 * g + 0.0722 * b, "texte clair sur l'en-tête sombre (" + couleur + ")").toBeGreaterThan(200);
    } finally { await ctx.close(); }
  });

  test("⑦ une activité sans adresse ne promet pas d'adresse « après validation » — ni à l'organisation, ni à l'inscrit validé", async ({ browser }) => {
    const srv = avecAdresses(new FauxServeur());
    srv.compte(ORGA, "orga_fic"); srv.compte(B, "bob_fic"); srv.compte(C, "cleo_fic");
    activite(srv, "evt_fic_7a", { title: "Balade au bord du lac", address: "" });
    activite(srv, "evt_fic_7b", { title: "Avec adresse", address: "54 bis rue des Marquisats" });
    srv.t.event_attendees.push(ligne("evt_fic_7a", ORGA, "going"), ligne("evt_fic_7a", B, "going"));
    srv.accords.add("evt_fic_7a|" + B);
    const NOTE = "L'adresse exacte s'affiche après validation";
    const o = await ouvrir(browser, srv, ORGA, "orga_fic");
    const b = await ouvrir(browser, srv, B, "bob_fic");
    const t = await ouvrir(browser, srv, C, "cleo_fic");
    try {
      for (const p of [o.page, b.page]) {
        await charger(p, p === b.page ? { evt_fic_7a: "going" } : {});
        await p.evaluate(() => openEventDetails("evt_fic_7a"));
        await expect(p.locator("#eventDetailContent .event-detail-info-card")).toBeVisible();
        await expect(p.locator("#eventDetailContent")).not.toContainText(NOTE);
      }
      // Témoin : un tiers, sur une activité qui A une adresse, garde la note.
      await charger(t.page);
      await t.page.evaluate(() => openEventDetails("evt_fic_7b"));
      await expect(t.page.locator("#eventDetailContent")).toContainText(NOTE);
    } finally { await o.ctx.close(); await b.ctx.close(); await t.ctx.close(); }
  });

  test("⑧ une réponse d'un état inconnu ne vide plus la liste", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      goTo("irl");
      renderIRL();
      // Une activité dont la carte est À L'ÉCRAN (c'est elle qui lit le libellé).
      const id = document.querySelector("#eventList .event-card[data-evid]").getAttribute("data-evid");
      state.user.eventRsvp = Object.assign({}, state.user.eventRsvp, { [id]: "interested" });
      let erreur = null;
      try { renderIRL(); _patchEventCardJoin(id); } catch (e) { erreur = e.message; }
      return { erreur, cartes: document.querySelectorAll("#eventList .event-card").length };
    });
    expect(r.erreur).toBeNull();
    expect(r.cartes).toBeGreaterThan(0);
  });

  test("⑨ clavier : Entrée sur « Je participe » inscrit, sans ouvrir la fiche ; Entrée sur la carte l'ouvre", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(ORGA, "orga_fic"); srv.compte(B, "bob_fic");
    activite(srv, "evt_fic_9", { title: "Clavier", max_attendees: 6 });
    srv.t.event_attendees.push(ligne("evt_fic_9", ORGA, "going"));
    const { ctx, page } = await ouvrir(browser, srv, B, "bob_fic");
    try {
      await charger(page);
      const go = carte(page, "evt_fic_9").locator("button.v4a2-go");
      await go.focus();
      await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() => myRsvp("evt_fic_9"))).toBe("going");
      expect(await page.evaluate(() => document.getElementById("eventDetailPage").style.display), "la fiche ne s'est pas ouverte").not.toBe("flex");
      await carte(page, "evt_fic_9").focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#eventDetailPage")).toBeVisible();
    } finally { await ctx.close(); }
  });

  test("⑩ une activité tout juste créée ne reçoit aucune interaction de démonstration ; un exemple, si", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const ev = { id: "evt_fic_10_neuve", title: "Ma nouvelle activité", passion: "musique", city: "Annecy", date: Date.now() + 2 * 86400000,
        organizerId: MY_UID, authorId: MY_UID, attendees: [MY_UID], maybes: [], waitlist: [], lat: 45.9, lng: 6.12 };
      state.userEvents = [ev].concat(state.userEvents || []);
      _seedDemoEventInteractions([ev, _findCanonicalEvent("e1") || allEvents().find((e) => e.id === "e1")]);
      const l = (window._eventLikes || {})[ev.id];
      const c = (window._eventCommentsCache || {})[ev.id] || [];
      const det = (window._eventReactDetail || {})[ev.id];
      return { likes: l ? l.likes : 0, reactions: l ? Object.keys(l.emojiCounts || {}).length : 0, commentaires: c.length,
        auteurs: det ? Object.keys(det).length : 0, exemple: !!(window._eventLikes || {}).e1 };
    });
    expect(r.likes, "aucun faux j'aime").toBe(0);
    expect(r.reactions, "aucune fausse réaction").toBe(0);
    expect(r.commentaires, "aucun faux commentaire").toBe(0);
    expect(r.auteurs).toBe(0);
    expect(r.exemple, "témoin : l'exemple e1 garde sa démonstration").toBe(true);
  });

  test("⑪ ouvrir une activité d'exemple ne relit pas la base et garde ses commentaires de démonstration", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(B, "bob_fic");
    const { ctx, page } = await ouvrir(browser, srv, B, "bob_fic");
    try {
      const id = await page.evaluate(() => {
        goTo("irl");
        const ex = allEvents().filter((e) => /^e\d+$/.test(e.id));
        // La démonstration ne se pose que sur un cache encore vierge.
        ex.forEach((x) => { delete window._eventCommentsCache[x.id]; });
        _seedDemoEventInteractions(ex);
        const e = ex.find((x) => (window._eventCommentsCache[x.id] || []).length > 0);
        return e && e.id;
      });
      expect(id, "prémisse : un exemple porte des commentaires de démonstration").toBeTruthy();
      const avant = await page.evaluate((id) => window._eventCommentsCache[id].length, id);
      const j0 = srv.journal.length;
      await page.evaluate((id) => openEventDetails(id), id);
      await expect(page.locator("#eventCommentsList")).not.toContainText("Chargement");
      await page.waitForTimeout(800);
      expect(await page.evaluate((id) => window._eventCommentsCache[id].length, id)).toBe(avant);
      await expect(page.locator("#eventCommentsList")).not.toContainText("Aucun commentaire");
      expect(srv.journal.slice(j0).filter((r) => r.table === "event_comments" && r.m === "GET").length, "aucune lecture pour un exemple").toBe(0);
    } finally { await ctx.close(); }
  });

  test("⑫ profil de l'organisation illisible : la fiche ne montre pas MON nom", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(B, "alice_spectatrice");   // l'organisation n'a PAS de profil
    activite(srv, "evt_fic_12", { title: "Sans profil" });
    const { ctx, page } = await ouvrir(browser, srv, B, "alice_spectatrice");
    try {
      await charger(page);
      await page.evaluate(() => openEventDetails("evt_fic_12"));
      const orga = page.locator("#eventDetailContent .event-detail-organizer");
      await expect(orga).toBeVisible();
      await expect(orga).not.toContainText("alice_spectatrice");
      await expect(orga).toContainText(/Passionné|Organisateur/);
    } finally { await ctx.close(); }
  });

  test("⑬ contact : pas de courriel pré-rempli ; l'adresse simple et le numéro restent des liens ; le lien de carte porte noopener", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => ({
      requete: _lienContactEvenement("a@x.fr?subject=Urgent&body=Envoie%20ton%20code"),
      copie: _lienContactEvenement("a@x.fr?cc=x%40y.zz"),
      simple: _lienContactEvenement("a@x.fr"),
      tel: _lienContactEvenement("06 12 34 56 78"),
    }));
    expect(r.requete).not.toContain("mailto:");
    expect(r.copie).not.toContain("mailto:");
    expect(r.simple).toContain('href="mailto:a@x.fr"');
    expect(r.tel).toContain('href="tel:0612345678"');
    await page.evaluate(() => {
      const ev = { id: "evt_fic_13", title: "Avec adresse", passion: "musique", city: "Annecy", address: "1 rue du Lac", date: Date.now() + 86400000,
        organizerId: "u_x", attendees: [], maybes: [], waitlist: [] };
      state.seed.events = [ev].concat(state.seed.events || []);
      openEventDetails("evt_fic_13");
    });
    await expect(page.locator("#eventDetailContent a", { hasText: "Voir sur Google Maps" })).toHaveAttribute("rel", /noopener/);
  });

  test("⑭ annulée pendant qu'on regarde : la relecture de la liste repeint la fiche ouverte", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(ORGA, "orga_fic"); srv.compte(B, "bob_fic");
    activite(srv, "evt_fic_14", { title: "Bientôt annulée", max_attendees: 5 });
    srv.t.event_attendees.push(ligne("evt_fic_14", ORGA, "going"));
    const { ctx, page } = await ouvrir(browser, srv, B, "bob_fic");
    try {
      await charger(page);
      await page.evaluate(() => openEventDetails("evt_fic_14"));
      await expect(page.locator("#eventDetailCta")).toContainText("Je participe");
      const h0 = await page.evaluate(() => history.length);
      srv.t.events.find((e) => e.id === "evt_fic_14").status = "cancelled";
      // Une relecture de fond peut être en vol : on attend la sienne, qui voit l'annulation.
      await expect.poll(() => page.evaluate(async () => {
        if (!_evenementsLectureEnVol) await rafraichirEvenements(true);
        return (_findCanonicalEvent("evt_fic_14") || {}).status;
      }), { timeout: 15000 }).toBe("cancelled");
      await expect(page.locator("#eventDetailCta")).toContainText("Activité annulée");
      await expect(page.locator("#eventDetailContent .event-detail-urgency.cancelled")).toBeVisible();
      await expect(page.locator("#eventDetailContent")).not.toContainText("Discussion des participants");
      expect(await page.evaluate(() => history.length), "aucune entrée d'historique en plus").toBe(h0);
    } finally { await ctx.close(); }
  });

  test("⑮ pointage : réservé à qui vient — pas à l'organisation, pas au non-inscrit ; un visiteur ne « pointe » pas une vraie activité", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(ORGA, "orga_fic"); srv.compte(B, "bob_fic"); srv.compte(C, "cleo_fic");
    activite(srv, "evt_fic_15", { title: "Tout à l'heure", date_at: iso(Date.now() + 20 * 60000) });
    srv.t.event_attendees.push(ligne("evt_fic_15", ORGA, "going"), ligne("evt_fic_15", B, "going"));
    const o = await ouvrir(browser, srv, ORGA, "orga_fic");
    const b = await ouvrir(browser, srv, B, "bob_fic");
    const t = await ouvrir(browser, srv, C, "cleo_fic");
    const v = await ouvrir(browser, srv, null);
    try {
      // 2026-11-27 (ergonomie e) : pendant la fenêtre de pointage, l'action est AU PIED
      // (« Je suis arrivé·e ») et le bouton du corps, doublon, est masqué : on cherche les deux.
      const surPlace = (p) => p.locator("#eventDetailPage").getByRole("button", { name: /^(Je suis sur place|Je suis arrivé·e)$/ });
      await charger(b.page, { evt_fic_15: "going" });
      await b.page.evaluate(() => openEventDetails("evt_fic_15"));
      await expect(surPlace(b.page), "témoin : l'inscrit le voit").toHaveCount(1);
      for (const p of [o.page, t.page]) {
        await charger(p);
        await p.evaluate(() => openEventDetails("evt_fic_15"));
        await expect(p.locator("#eventDetailContent .v4b-fiche")).toHaveCount(1);
        await expect(surPlace(p)).toHaveCount(0);
      }
      await charger(v.page);
      const r = await v.page.evaluate(async () => {
        window.__toasts = [];
        window.navigator.geolocation.getCurrentPosition = (ok) => ok({ coords: { latitude: 45.9, longitude: 6.12, accuracy: 10 } });
        checkInEvent("evt_fic_15");
        await new Promise((res) => setTimeout(res, 400));
        return { toasts: window.__toasts.map((x) => x.msg), pointe: (state.user.checkedInEvents || []).includes("evt_fic_15") };
      });
      expect(r.pointe, "rien n'est marqué pointé").toBe(false);
      expect(r.toasts).toContain("Connecte-toi pour pointer");
    } finally { await o.ctx.close(); await b.ctx.close(); await t.ctx.close(); await v.ctx.close(); }
  });

  test("⑱ j'aime posé ailleurs : la fiche montre le cœur plein comme la carte, et un appui le RETIRE (aucun doublon, aucune notification)", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(ORGA, "orga_fic"); srv.compte(B, "bob_fic");
    activite(srv, "evt_fic_18", { title: "Aimée ailleurs" });
    srv.t.event_reactions.push({ id: "r_fic_18", event_id: "evt_fic_18", user_id: B, emoji: "❤️", created_at: new Date().toISOString() });
    const { ctx, page } = await ouvrir(browser, srv, B, "bob_fic");
    try {
      await page.evaluate(() => { state.user.likedEvents = []; saveState(); });   // l'autre appareil n'a rien dit à celui-ci
      await charger(page);
      await expect.poll(() => page.evaluate(() => ((window._eventLikes || {}).evt_fic_18 || {}).liked)).toBe(true);
      await page.evaluate(() => openEventDetails("evt_fic_18"));
      const coeur = page.locator('#eventDetailContent [data-evlike="evt_fic_18"]');
      await expect(coeur).toHaveClass(/liked/);
      const j0 = srv.journal.length;
      await coeur.click();
      // (Le banc commun n'a pas de policy DELETE sur cette table : on juge la DEMANDE envoyée.)
      await expect.poll(() => srv.journal.slice(j0).filter((r) => r.table === "event_reactions" && r.m !== "GET").length).toBeGreaterThan(0);
      await page.waitForTimeout(800);
      await expect(coeur).not.toHaveClass(/liked/);
      const ecrits = srv.journal.slice(j0).filter((r) => r.m !== "GET");
      expect(ecrits.filter((r) => r.table === "event_reactions").map((r) => r.m)).toEqual(["DELETE"]);
      expect(ecrits.filter((r) => r.table === "notifications").length, "aucune notification").toBe(0);
    } finally { await ctx.close(); }
  });

  test("⑯ une seule icône de partage sur le héros, le bouton retour garde sa flèche", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => openEventDetails(allEvents()[0].id));
    const r = await page.evaluate(() => {
      const share = document.getElementById("eventDetailShareBtn");
      const back = document.querySelector("#eventDetailPage .event-detail-back:not(#eventDetailShareBtn)");
      return { avant: getComputedStyle(share, "::before").content, svgs: share.querySelectorAll("svg").length,
        retour: back ? getComputedStyle(back, "::before").content : null };
    });
    expect(r.avant).toBe("none");
    expect(r.svgs).toBe(1);
    expect(r.retour).toContain("←");
  });

  test("⑰ « #event-<id> » (posé par la fiche, puis rechargé ou copié) rouvre la fiche au démarrage", async ({ page }) => {
    // Le hash que pose la fiche ouverte…
    await bootOnboarded(page);
    const pose = await page.evaluate(() => { goTo("irl"); openEventDetails("e1"); return location.hash; });
    expect(pose, "prémisse : la fiche pose #event-<id>").toBe("#event-e1");
    // …relu par un démarrage neuf (rechargement, adresse copiée dans un autre onglet).
    const neuf = await page.context().newPage();
    await bootOnboarded(neuf, undefined, 1, { query: "#event-e1" });
    await expect(neuf.locator("#eventDetailPage")).toBeVisible({ timeout: 20000 });
    expect(await neuf.evaluate(() => window._openEventDetailId)).toBe("e1");
  });
});
