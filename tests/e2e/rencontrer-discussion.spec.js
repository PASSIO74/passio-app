// Rencontrer — DISCUSSION, COMMENTAIRES, NOTIFICATIONS, RAPPELS autour d'une
// activité (2026-11-27). Faux serveur PostgREST multi-comptes (vrai SDK, vrais
// handlers) ; navigateur seul pour ce qui ne touche pas la base. AUCUNE
// écriture réelle.
//
// Défauts fermés (dossier DIS), chacun reproduit avant d'être corrigé :
//
//   n° 132  Feuille de commentaires ouverte puis fermée depuis la carte : la
//           fiche de la même activité restait sur « Chargement… », et tout
//           commentaire tapé dans la fiche partait dans le champ périmé de la
//           feuille fermée — rien envoyé, sans un mot (①).
//   n° 153  Composeur de la fiche et « Republier dans mon fil » sans porte
//           invité : un visiteur « publiait » en local seulement (②).
//   n° 151  GIF en commentaire d'activité : verdict non lu (fantôme sur refus),
//           pas de notification à l'organisation, deux toasts de succès (③④).
//   n° 152  Commentaires relus par la fiche sans `fromSupabase` : le j'aime
//           donné depuis la fiche ne notifiait jamais l'auteur (⑤).
//   n° 134  Participant VALIDÉ jamais entré dans la discussion du groupe (⑥).
//   n° 135  Désistement : la discussion restait dans la messagerie, et
//           « Quitter le groupe » échouait pour toujours (⑦⑧, panne réelle en non-régression dans ⑧).
//   n° 136  Discussion quittée puis rouverte depuis la fiche : la pierre
//           tombale la cachait de nouveau à chaque démarrage (⑨).
//   n° 139  « C'est noté : rappel la veille et 2 h avant » sans abonnement push
//           enregistré ; l'abonnement ne rendait aucun verdict (⑩⑪).
//   n° 145  Une édition écrivait `conv_id = NULL` depuis une copie sans lien :
//           la discussion se fermait à tous (⑫).
//   n° 147  Toute édition (coquille de titre) prévenait tous les inscrits et
//           consommait le plafond de diffusions (⑬).
//   n° 159  Fenêtre des membres générique sur une discussion d'activité :
//           « Ajouter » des personnages d'exemple, « Retirer », et l'organisation
//           pouvait quitter la discussion de sa propre activité (⑭).
//   n° 144  « t'invite à <b>Atelier</b> » : balises en clair dans la cloche (⑮).
//   n° 133  J'aime d'activité : « Publication introuvable ici » au toucher (⑯).
//   n° 157  Export .ics : 2 h fixes, proposé pour une activité annulée, « ajoutée
//           à ton calendrier » pour un simple téléchargement (⑰).
//   n° 160  Feuille de commentaires d'une activité : « Réponds à cette
//           publication. » (⑱).
//
// Contre-épreuve : chaque cas est rouge sur le code d'avant (origin/main, 8091).
const { test, expect } = require("@playwright/test");
const { FauxServeur, ouvrirCompte } = require("./audit-2026-11-parcours-faux-serveur");
const { bootOnboarded } = require("./app-helper");

const ORGA = "aaaaaaaa-0000-4000-8000-000000000051";
const B = "bbbbbbbb-0000-4000-8000-000000000052";
const json = (status, body) => ({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" } });
const iso = (ms) => new Date(ms).toISOString().replace("Z", "");
const GIF = "https://media.giphy.com/media/abc123/giphy.gif";

// Faux serveur + RPC `prevenir_inscrits_activite` (absente du banc commun) et
// un crochet `srv.avant(req, url, m, body)` pour reprendre une réponse.
function serveur() {
  const srv = new FauxServeur();
  srv.compte(ORGA, "orga_dis"); srv.compte(B, "bob_dis");
  srv.prevenir = [];
  srv.avant = null;
  const orig = srv.traiter.bind(srv);
  srv.traiter = async function (req) {
    const url = new URL(req.url()); const m = req.method();
    let body = null; try { body = JSON.parse(req.postData() || "null"); } catch (e) {}
    if (srv.avant) { const r = await srv.avant(req, url, m, body); if (r) return r; }
    if (m === "POST" && /\/rest\/v1\/rpc\/prevenir_inscrits_activite$/.test(url.pathname)) {
      srv.prevenir.push({ genre: body.p_genre, message: body.p_message });
      return json(200, { ok: true, destinataires: 1, prevenues: 1 });
    }
    return orig(req);
  };
  return srv;
}

function activite(srv, id, extra = {}) {
  const debut = Date.now() + 3 * 86400000;
  const r = Object.assign({ id, author_id: ORGA, organizer_id: ORGA, title: "Atelier " + id, passion_id: "musique", city: "Annecy",
    emoji: "🎸", max_attendees: 10, date_at: iso(debut), end_at: iso(debut + 2 * 3600000), status: "active", co_organizers: [],
    visibilite: "publique", created_at: iso(Date.now() - 3600000), lat: 45.9, lng: 6.12, event_type: "Atelier" }, extra);
  srv.t.events.push(r);
  srv.t.event_attendees.push({ event_id: id, user_id: ORGA, rsvp: "going", created_at: new Date(Date.now() - 3600000).toISOString() });
  return r;
}

// Discussion d'activité existante : conversation + l'organisation membre.
function discussion(srv, evId, membres = [ORGA]) {
  const conv = "evgrp_" + evId;
  srv.t.events.find((e) => e.id === evId).conv_id = conv;
  srv.t.conversations.push({ id: conv, is_group: true, group_name: "📍 Atelier", created_by: ORGA, created_at: new Date().toISOString() });
  membres.forEach((u) => srv.t.conv_members.push({ conv_id: conv, user_id: u }));
  return conv;
}

async function compte(browser, srv, uid) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const o = await ouvrirCompte(ctx, srv, uid, { nom: uid === ORGA ? "orga_dis" : "bob_dis" });
  await o.page.waitForFunction(() => window._supaInitTerminee === true, null, { timeout: 30000 });
  return { ctx, page: o.page };
}

// L'activité serveur en mémoire, comme après une lecture de Rencontrer, et ma
// réponse connue de l'appareil.
async function charger(page, id, rsvp) {
  await page.evaluate(async ([id, rsvp]) => {
    const ev = (await supaLoadEvents()).find((e) => e.id === id);
    state.seed.events = (state.seed.events || []).filter((e) => e.id !== id);
    state.seed.events.unshift(ev);
    if (rsvp !== undefined) _setMyRsvpLocal(id, rsvp);
    saveState();
  }, [id, rsvp]);
}

const toasts = (page) => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
const raz = (page) => page.evaluate(() => { window.__toasts = []; });
const convLocale = (page, conv) => page.evaluate((c) => getConversations().some((x) => x && x.id === c), conv);
const membre = (srv, conv, uid) => srv.t.conv_members.some((m) => m.conv_id === conv && m.user_id === uid);

test.describe("Rencontrer — discussion, commentaires, notifications, rappels", () => {
  test.setTimeout(150000);

  test("① n° 132 — feuille de commentaires fermée : la fiche charge sa discussion et le commentaire de la fiche part", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_dis_1");
    activite(srv, "evt_dis_1b");
    srv.t.event_comments.push({ id: "ec_srv_1", event_id: "evt_dis_1", author_id: ORGA, author_name: "orga_dis", text: "Bienvenue à tous", created_at: iso(Date.now() - 60000) });
    const { ctx, page } = await compte(browser, srv, B);
    try {
      await charger(page, "evt_dis_1");
      await charger(page, "evt_dis_1b");
      // La feuille 💬 de la carte, ouverte puis fermée.
      await page.evaluate(() => openCommentSheet("evt_dis_1", "Atelier"));
      await expect(page.locator("#modalBackdrop.active #cmtThreadList")).toHaveCount(1);
      await page.evaluate(() => closeModal());
      await expect(page.locator("#modalBackdrop.active")).toHaveCount(0);
      // La fiche de la MÊME activité.
      await page.evaluate(() => openEventDetails("evt_dis_1"));
      await expect(page.locator("#eventCommentsList")).toContainText("Bienvenue à tous", { timeout: 10000 });
      // Un commentaire tapé dans la fiche.
      await page.evaluate(() => { document.getElementById("eventCommentInput").value = "On se retrouve où ?"; });
      await page.evaluate(() => addEventComment("evt_dis_1"));
      await expect.poll(() => srv.t.event_comments.filter((c) => c.author_id === B && c.text === "On se retrouve où ?").length).toBe(1);
      expect(await page.evaluate(() => document.getElementById("eventCommentInput").value)).toBe("");
      // Une AUTRE fiche : même chose.
      await page.evaluate(() => { closeEventDetail(); openEventDetails("evt_dis_1b"); });
      await page.waitForFunction(() => window._openEventDetailId === "evt_dis_1b");
      await page.evaluate(() => { document.getElementById("eventCommentInput").value = "Et ici ?"; addEventComment("evt_dis_1b"); });
      await expect.poll(() => srv.t.event_comments.filter((c) => c.event_id === "evt_dis_1b" && c.text === "Et ici ?").length).toBe(1);
    } finally { await ctx.close(); }
  });

  test("② n° 153 — visiteur : le composeur de la fiche et « Republier dans mon fil » passent par la porte", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_dis_2");
    const { ctx, page } = await compte(browser, srv, B);
    try {
      await charger(page, "evt_dis_2");
      // Le mode invité : la porte refuse (et le dit) — c'est elle qu'on mesure.
      await page.evaluate(() => {
        window.__portes = [];
        window.requireAuthentication = (ctxt) => { window.__portes.push(ctxt); return false; };
        window.__postsAvant = (state.userPosts || []).length;
      });
      await page.evaluate(() => openEventDetails("evt_dis_2"));
      await page.evaluate(() => { document.getElementById("eventCommentInput").value = "Coucou visiteur"; });
      await page.evaluate(() => addEventComment("evt_dis_2"));
      await page.evaluate(() => shareEventInFeed("evt_dis_2"));
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => ({ portes: window.__portes,
        cache: (_eventCommentsCache["evt_dis_2"] || []).filter((c) => c.text === "Coucou visiteur").length,
        champ: document.getElementById("eventCommentInput").value,
        posts: (state.userPosts || []).length - window.__postsAvant }));
      expect(r.portes).toEqual(["commenter", "publier"]);
      expect(r.cache, "aucun commentaire local").toBe(0);
      expect(r.champ, "le texte reste dans le champ").toBe("Coucou visiteur");
      expect(r.posts, "aucune publication locale").toBe(0);
      expect(srv.t.event_comments.length).toBe(0);
    } finally { await ctx.close(); }
  });

  test("③ n° 151 — GIF accepté : identifiant serveur, l'organisation notifiée, un seul toast", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_dis_3");
    const { ctx, page } = await compte(browser, srv, B);
    try {
      await charger(page, "evt_dis_3");
      await raz(page);
      // Le vrai rappel du panneau 😊 → GIF de la fiche.
      await page.evaluate((g) => {
        window.emojiReactPanel = (ev, surEmoji, surGif) => { surGif(g); return false; };
        showEmojiPickerForEvent("evt_dis_3", null);
      }, GIF);
      await expect.poll(() => srv.t.event_comments.filter((c) => c.text === GIF).length).toBe(1);
      const ligne = srv.t.event_comments.find((c) => c.text === GIF);
      await expect.poll(() => srv.t.notifications.filter((n) => n.user_id === ORGA && n.kind === "event_comment").length).toBe(1);
      await expect.poll(() => page.evaluate(() => (_eventCommentsCache["evt_dis_3"] || []).map((c) => c.id))).toEqual([ligne.id]);
      const t = await toasts(page);
      expect(t.filter((x) => /GIF/.test(x)), JSON.stringify(t)).toEqual(["GIF ajouté en commentaire 🎬"]);
    } finally { await ctx.close(); }
  });

  test("④ n° 151 — GIF refusé par la base : retiré de l'écran, pas de succès annoncé", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_dis_4");
    const { ctx, page } = await compte(browser, srv, B);
    try {
      await charger(page, "evt_dis_4");
      srv.pannes.push({ table: "event_comments", methode: "POST", status: 403, body: { code: "42501", message: "refus" } });
      await raz(page);
      await page.evaluate((g) => applyEventGifReaction("evt_dis_4", g), GIF);
      await expect.poll(() => toasts(page)).toContain("GIF non envoyé — réessaie");
      const r = await page.evaluate(() => (_eventCommentsCache["evt_dis_4"] || []).length);
      expect(r, "aucun GIF fantôme").toBe(0);
      expect((await toasts(page)).some((x) => /GIF ajouté|GIF envoyé/.test(x))).toBe(false);
    } finally { await ctx.close(); }
  });

  test("⑤ n° 152 — fiche ouverte sans lot d'aperçus : le j'aime d'un commentaire notifie son auteur", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_dis_5");
    srv.t.event_comments.push({ id: "ec_srv_5", event_id: "evt_dis_5", author_id: ORGA, author_name: "orga_dis", text: "Pensez à vos gourdes", created_at: iso(Date.now() - 60000) });
    const { ctx, page } = await compte(browser, srv, B);
    try {
      await charger(page, "evt_dis_5");
      await page.evaluate(() => { delete _eventCommentsCache["evt_dis_5"]; openEventDetails("evt_dis_5"); });
      await expect(page.locator("#eventCommentsList")).toContainText("Pensez à vos gourdes", { timeout: 10000 });
      const drapeaux = await page.evaluate(() => (_eventCommentsCache["evt_dis_5"] || []).map((c) => c.fromSupabase === true));
      expect(drapeaux).toEqual([true]);
      await page.evaluate(() => likeComment("evt_dis_5", "ec_srv_5"));
      await expect.poll(() => srv.t.notifications.filter((n) => n.user_id === ORGA && n.kind === "like" && n.from_id === B).length).toBe(1);
    } finally { await ctx.close(); }
  });

  test("⑥ n° 134 — validation reçue : le participant entre dans la discussion sans rien toucher", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_dis_6");
    const conv = discussion(srv, "evt_dis_6");
    srv.t.event_attendees.push({ event_id: "evt_dis_6", user_id: B, rsvp: "going", created_at: new Date().toISOString() });
    const { ctx, page } = await compte(browser, srv, B);
    try {
      await charger(page, "evt_dis_6", "going");
      expect(membre(srv, conv, B)).toBe(false);
      await page.evaluate(([id, orga]) => window._rtNotificationRecue({ id: "n_acc_dis_6", user_id: MY_UID, from_id: orga, kind: "event_accepted",
        ref_id: id, content: "Ta participation est confirmée.", created_at: new Date().toISOString().replace("Z", ""), seen: false }), ["evt_dis_6", ORGA]);
      await expect.poll(() => membre(srv, conv, B), { timeout: 10000 }).toBe(true);
      await expect.poll(() => convLocale(page, conv)).toBe(true);
    } finally { await ctx.close(); }
  });

  test("⑦ n° 135 — désistement : la discussion quitte la messagerie, y compris au redémarrage", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_dis_7");
    const conv = discussion(srv, "evt_dis_7");
    srv.t.event_attendees.push({ event_id: "evt_dis_7", user_id: B, rsvp: "going", created_at: new Date().toISOString() });
    const { ctx, page } = await compte(browser, srv, B);
    try {
      await charger(page, "evt_dis_7", "going");
      const entre = await page.evaluate((id) => _joinEventConversation(_findCanonicalEvent(id)), "evt_dis_7");
      expect(entre).toBe(true);
      expect(await convLocale(page, conv)).toBe(true);
      await page.evaluate((id) => setEventRsvp(id, null), "evt_dis_7");
      await expect.poll(() => membre(srv, conv, B)).toBe(false);
      await expect.poll(() => convLocale(page, conv)).toBe(false);
      await page.reload();
      await page.waitForFunction(() => window._supaInitTerminee === true, null, { timeout: 30000 });
      await page.waitForTimeout(800);
      expect(await convLocale(page, conv), "toujours absente après le redémarrage").toBe(false);
    } finally { await ctx.close(); }
  });

  test("⑧ n° 135 — copie locale orpheline (plus membre côté serveur) : une vraie panne garde la conversation, puis « Quitter le groupe » aboutit", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_dis_8");
    const conv = discussion(srv, "evt_dis_8");
    const { ctx, page } = await compte(browser, srv, B);
    try {
      await charger(page, "evt_dis_8");
      await page.evaluate((id) => _ensureLocalEventConv(_findCanonicalEvent(id)), "evt_dis_8");
      // Non-régression : une PANNE du retrait n'est pas « déjà parti » — on garde et on le dit.
      srv.pannes.push({ table: "conv_members", methode: "DELETE", status: 500, body: { message: "panne" }, fois: 1 });
      await raz(page);
      await page.evaluate((c) => leaveGroup(c), conv);
      await expect.poll(() => toasts(page)).toContain("Impossible de quitter le groupe pour l'instant — réessaie");
      expect(await convLocale(page, conv)).toBe(true);
      // Le serveur répond : zéro ligne, je ne suis déjà plus membre → la sortie aboutit.
      await raz(page);
      await page.evaluate((c) => leaveGroup(c), conv);
      await expect.poll(() => toasts(page)).toContain("Tu as quitté le groupe");
      expect(await convLocale(page, conv)).toBe(false);
    } finally { await ctx.close(); }
  });

  test("⑨ n° 136 — discussion quittée puis rouverte depuis la fiche : elle reste après le redémarrage", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_dis_10");
    srv.t.event_attendees.push({ event_id: "evt_dis_10", user_id: B, rsvp: "going", created_at: new Date().toISOString() });
    const conv = discussion(srv, "evt_dis_10", [ORGA, B]);
    const { ctx, page } = await compte(browser, srv, B);
    try {
      await charger(page, "evt_dis_10", "going");
      await page.evaluate((id) => _ensureLocalEventConv(_findCanonicalEvent(id)), "evt_dis_10");
      await page.evaluate((c) => leaveGroup(c), conv);
      await expect.poll(() => membre(srv, conv, B)).toBe(false);
      await page.evaluate((id) => openEventChat(id), "evt_dis_10");
      await expect.poll(() => membre(srv, conv, B)).toBe(true);
      expect(await page.evaluate((c) => convTombHas(convTombLoad(), "conv", c), conv), "la pierre est levée").toBe(false);
      await page.reload();
      await page.waitForFunction(() => window._supaInitTerminee === true, null, { timeout: 30000 });
      await expect.poll(() => convLocale(page, conv), { timeout: 10000 }).toBe(true);
    } finally { await ctx.close(); }
  });

  test("⑩ n° 139 — l'abonnement push échoue : pas de « C'est noté », un avertissement, la proposition pourra revenir", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      window.__toasts = [];
      const _t = window.toast;
      window.toast = function (m) { window.__toasts.push(String(m)); return _t.apply(this, arguments); };
      window.__notif = { permission: "granted", requestPermission: async () => "granted" };
      Object.defineProperty(window, "Notification", { configurable: true, get: () => window.__notif });
      localStorage.setItem("passio_rappels_proposes_v1", String(Date.now()));
      window.ensureCallPushSubscription = async () => false;
      const ko = await activerRappelsActivite();
      const apresKo = { toasts: window.__toasts.slice(), memo: localStorage.getItem("passio_rappels_proposes_v1") };
      window.__toasts = [];
      window.ensureCallPushSubscription = async () => true;
      const ok = await activerRappelsActivite();
      return { ko, apresKo, ok, toastsOk: window.__toasts.slice() };
    });
    expect(r.ko).toBe(false);
    expect(r.apresKo.toasts.some((t) => /C'est noté/.test(t)), JSON.stringify(r.apresKo.toasts)).toBe(false);
    expect(r.apresKo.toasts).toContain("Rappels pas encore activés sur ce téléphone — réessaie plus tard");
    expect(r.apresKo.memo, "la proposition peut revenir").toBeNull();
    expect(r.ok).toBe(true);
    expect(r.toastsOk).toContain("C'est noté : rappel la veille et 2 h avant ⏰");
  });

  test("⑪ n° 139 — ensureCallPushSubscription rend un verdict : false sans permission, false sur refus de l'upsert", async ({ browser }) => {
    const srv = serveur();
    // La base refuse la ligne d'abonnement (endpoint d'un autre compte, policy).
    srv.pannes.push({ table: "push_subscriptions", methode: "POST", status: 403, body: { code: "42501", message: "new row violates row-level security policy" } });
    const { ctx, page } = await compte(browser, srv, B);
    try {
      const r = await page.evaluate(async () => {
        const out = {};
        window.__notif = { permission: "denied" };
        Object.defineProperty(window, "Notification", { configurable: true, get: () => window.__notif });
        out.sansPermission = await ensureCallPushSubscription();
        // Permission accordée, navigateur abonné, mais la base refuse la ligne.
        window.__notif.permission = "granted";
        const fauxAbonnement = { endpoint: "https://push.example/ep1", options: {}, toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "x", auth: "y" } }; }, unsubscribe: async () => true };
        Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => fauxAbonnement, subscribe: async () => fauxAbonnement } }) } });
        if (!("PushManager" in window)) window.PushManager = function () {};
        window._pushEndpointRepris = true;   // pas de reprise d'endpoint : le refus est définitif
        out.refus = await ensureCallPushSubscription();
        return out;
      });
      srv.pannes.length = 0;
      expect(r.sansPermission).toBe(false);
      expect(r.refus).toBe(false);
    } finally { await ctx.close(); }
  });

  test("⑫ n° 145 — édition depuis une copie sans lien de discussion : conv_id n'est ni envoyé ni effacé", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_dis_13");
    const conv = discussion(srv, "evt_dis_13");
    const { ctx, page } = await compte(browser, srv, ORGA);
    try {
      await charger(page, "evt_dis_13");
      // La copie de création, jamais relue : sans convId (elle est préférée par _findCanonicalEvent).
      await page.evaluate((id) => {
        const ev = _findCanonicalEvent(id);
        state.userEvents = [Object.assign({}, ev, { convId: null })];
        saveState();
      }, "evt_dis_13");
      await page.evaluate(() => openCreateEvent("evt_dis_13"));
      await expect(page.locator("#evTitle")).toHaveCount(1);
      await page.evaluate(() => { const el = document.getElementById("evTitle"); el.value = "Atelier, coquille corrigée"; el.dispatchEvent(new Event("input", { bubbles: true })); });
      const j0 = srv.journal.length;
      await page.evaluate(() => submitEvent("evt_dis_13"));
      await expect.poll(() => srv.t.events.find((e) => e.id === "evt_dis_13").title).toBe("Atelier, coquille corrigée");
      const patchs = srv.journal.slice(j0).filter((r) => r.table === "events" && r.m === "PATCH");
      expect(patchs.length).toBeGreaterThan(0);
      expect(patchs.some((r) => r.body && "conv_id" in r.body), "aucun PATCH ne porte conv_id").toBe(false);
      expect(srv.t.events.find((e) => e.id === "evt_dis_13").conv_id).toBe(conv);
    } finally { await ctx.close(); }
  });

  test("⑬ n° 147 — une coquille de titre ne prévient personne ; un changement d'horaire, si", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_dis_14");
    srv.t.event_attendees.push({ event_id: "evt_dis_14", user_id: B, rsvp: "going", created_at: new Date().toISOString() });
    const { ctx, page } = await compte(browser, srv, ORGA);
    try {
      await charger(page, "evt_dis_14");
      const poser = (id, v) => page.evaluate(([i, v]) => { const el = document.getElementById(i); el.value = v; ["input", "change"].forEach((n) => el.dispatchEvent(new Event(n, { bubbles: true }))); }, [id, v]);
      await page.evaluate(() => openCreateEvent("evt_dis_14"));
      await poser("evTitle", "Atelier du jeudi");
      await raz(page);
      await page.evaluate(() => submitEvent("evt_dis_14"));
      await expect.poll(() => srv.t.events.find((e) => e.id === "evt_dis_14").title).toBe("Atelier du jeudi");
      await expect.poll(() => toasts(page)).toContain("Activité mise à jour");
      await page.waitForTimeout(500);
      expect(srv.prevenir.length, "une coquille ne part pas aux inscrits").toBe(0);
      await page.evaluate(() => openCreateEvent("evt_dis_14"));
      await poser("evTime", "21:30");
      await page.evaluate(() => submitEvent("evt_dis_14"));
      await expect.poll(() => srv.prevenir.length).toBe(1);
      expect(srv.prevenir[0].message).toContain("l’horaire");
    } finally { await ctx.close(); }
  });

  test("⑭ n° 159 — discussion d'activité : ni « Ajouter », ni « Retirer », et l'organisation ne la quitte pas", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_dis_15");
    srv.t.event_attendees.push({ event_id: "evt_dis_15", user_id: B, rsvp: "going", created_at: new Date().toISOString() });
    const conv = discussion(srv, "evt_dis_15", [ORGA, B]);
    const { ctx, page } = await compte(browser, srv, ORGA);
    try {
      await charger(page, "evt_dis_15");
      await page.evaluate(async () => { if (typeof _rafraichirConversationsServeur === "function") await _rafraichirConversationsServeur(); });
      await page.evaluate((id) => _ensureLocalEventConv(_findCanonicalEvent(id)), "evt_dis_15");
      await page.evaluate(([c, b, o]) => { const x = getConversations().find((y) => y.id === c); x.createdBy = o; x.userIds = [o, b]; }, [conv, B, ORGA]);
      await page.evaluate((c) => showGroupMembers(c), conv);
      await expect(page.locator("#modalBackdrop.active #grpTab_members")).toHaveCount(1);
      expect(await page.locator("#modalBackdrop.active #grpTab_add").count()).toBe(0);
      expect(await page.locator("#modalBackdrop.active .grp-retirer").count()).toBe(0);
      expect(await page.locator("#modalBackdrop.active button", { hasText: "Quitter le groupe" }).count()).toBe(0);
      await expect(page.locator("#modalBackdrop.active .grp-voir-activite")).toHaveCount(1);
      // Les gestes eux-mêmes refusent.
      const avant = await page.evaluate((c) => getConversations().find((y) => y.id === c).userIds.slice(), conv);
      await page.evaluate((c) => { addGroupMember(c, "u_lea"); }, conv);
      await page.evaluate((c) => leaveGroup(c), conv);
      await page.waitForTimeout(300);
      expect(await page.evaluate((c) => getConversations().find((y) => y.id === c).userIds, conv)).toEqual(avant);
      expect(membre(srv, conv, ORGA), "l'organisation reste membre").toBe(true);
      expect(await convLocale(page, conv)).toBe(true);
    } finally { await ctx.close(); }
  });

  test("⑮ n° 144 — le gras composé par la base s'affiche en gras, sans rien laisser passer d'autre", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      window.__xss = 0;
      state.notifications = [];
      mergeSupaNotifs([
        { id: "n_inv_144", kind: "event_invite", fromId: "u_orga", refId: "ev_x", text: "orga t'invite à <b>Atelier</b>", createdAt: Date.now(), unread: true, fromSupabase: true },
        { id: "n_hostile_144", kind: "like", fromId: "u_x", refId: "p_x", text: '<b onclick="window.__xss++">piège</b><img src=x onerror="window.__xss++">', createdAt: Date.now() - 1000, unread: true, fromSupabase: true },
      ]);
      openNotifications();
      await new Promise((r) => setTimeout(r, 500));
      const textes = [...document.querySelectorAll(".notif-text")].map((el) => ({ txt: el.textContent, gras: [...el.querySelectorAll("b")].map((b) => ({ t: b.textContent, attrs: b.attributes.length })), img: !!el.querySelector("img") }));
      return { textes, xss: window.__xss };
    });
    const inv = r.textes.find((x) => /t'invite/.test(x.txt));
    expect(inv.txt).not.toContain("<b>");
    expect(inv.gras).toEqual([{ t: "Atelier", attrs: 0 }]);
    const hostile = r.textes.find((x) => /piège/.test(x.txt));
    expect(hostile.img).toBe(false);
    expect(hostile.gras.every((g) => g.attrs === 0)).toBe(true);
    expect(r.xss).toBe(0);
  });

  test("⑯ n° 133 — un j'aime sur mon activité ouvre sa fiche, pas « Publication introuvable »", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_dis_17");
    const { ctx, page } = await compte(browser, srv, ORGA);
    try {
      await charger(page, "evt_dis_17");
      await raz(page);
      await page.evaluate(([id, b]) => {
        openNotifications();
        openNotifTarget({ id: "n_like_ev_133", kind: "like", fromId: b, refId: id, text: "bob_dis a aimé ton événement", createdAt: Date.now(), unread: true, fromSupabase: true });
      }, ["evt_dis_17", B]);
      await expect.poll(() => page.evaluate(() => window._openEventDetailId), { timeout: 10000 }).toBe("evt_dis_17");
      const t = await toasts(page);
      expect(t.some((x) => /Publication introuvable/.test(x)), JSON.stringify(t)).toBe(false);
    } finally { await ctx.close(); }
  });

  test("⑰ n° 157 — .ics : la vraie durée, un message juste, et rien pour une activité annulée", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => {
      window.__toasts = [];
      const _t = window.toast;
      window.toast = function (m) { window.__toasts.push(String(m)); return _t.apply(this, arguments); };
      const base = Date.UTC(2027, 0, 15, 9, 0, 0);
      state.userEvents = (state.userEvents || []).concat([
        { id: "ics_longue", title: "Rando 5 heures", date: base, endAt: base + 5 * 3600000, city: "Annecy", passion: "musique", organizerId: "me", attendees: [], status: "active" },
        { id: "ics_annulee", title: "Sortie annulee", date: base, endAt: base + 3600000, city: "Annecy", passion: "musique", organizerId: "me", attendees: [], status: "cancelled" },
      ]);
    });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.evaluate(() => downloadEventIcs("ics_longue"))]);
    const fs = require("fs");
    const contenu = fs.readFileSync(await dl.path(), "utf8");
    expect(contenu).toContain("DTSTART:20270115T090000Z");
    expect(contenu).toContain("DTEND:20270115T140000Z");
    const t1 = await page.evaluate(() => window.__toasts.slice());
    expect(t1.some((t) => /ajoutée à ton calendrier/.test(t)), JSON.stringify(t1)).toBe(false);
    let telecharge = false;
    page.once("download", () => { telecharge = true; });
    await page.evaluate(() => { window.__toasts = []; downloadEventIcs("ics_annulee"); });
    await page.waitForTimeout(500);
    expect(telecharge, "aucun fichier pour une activité annulée").toBe(false);
    expect(await page.evaluate(() => window.__toasts)).toContain("Cette activité est annulée");
  });

  test("⑱ n° 160 — la feuille de commentaires d'une activité parle d'activité, pas de publication", async ({ page }) => {
    await bootOnboarded(page);
    const sous = await page.evaluate(() => {
      const ev = allEvents()[0];
      openCommentSheet(ev.id, ev.title);
      const el = document.querySelector("#modalBackdrop.active .modal-subtitle");
      return el ? el.textContent : null;
    });
    expect(sous).toBe("Commente cette activité.");
  });
});
