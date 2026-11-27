// Rencontrer — CRÉER, MODIFIER, GÉRER une activité (2026-11-27).
// Faux serveur PostgREST multi-comptes (vrai SDK, vrais handlers) pour tout ce
// qui écrit ; navigateur seul pour le formulaire pur. AUCUNE écriture réelle.
//
// Défauts fermés (dossier CRE), chacun reproduit avant d'être corrigé :
//
//   n° 226  Un seul message pour tous les refus : « réessaie quand tu auras du
//           réseau » devant un refus de droit ou un plafond, et l'activité
//           refusée restait dans la liste sans aucun geste pour la renvoyer (①②).
//   n° 219  Un envoi de couverture raté EFFAÇAIT l'ancienne (cover_url = null),
//           sous « Activité mise à jour » (③).
//   n° 216  Une copie locale gardant un ancien co-organisateur rendait
//           l'activité non modifiable pour toujours (④).
//   n° 220  Diffusion aux inscrits refusée : « Activité annulée », « Activité
//           mise à jour », sans un mot, sur l'appareil de création (⑤).
//   n° 228  Gestes de gestion sans garde ; annulation posée sur un objet
//           remplacé par une relecture pendant la confirmation (⑥⑦).
//   n° 229  Message groupé : fenêtre fermée avant le verdict (texte perdu),
//           clé neuve à chaque renvoi (doublon chez tous) (⑧).
//   n° 227  Suppression : la carte du fil `post_ev_<id>` et ma réponse restaient (⑨).
//   n° 225  Saisie illisible = gratuit, « 1e3 » = 1 place, longitude 0 = NULL (⑩⑪).
//   n° 222  Sans client Supabase : « Activité publiée ! » alors que rien n'est parti (⑫).
//   n° 223  Garde anti double envoi seulement dans l'habillage UI-6A0, et qui
//           avalait sans un mot l'appui d'un second formulaire ; rangement
//           UI-6A0 perdu dès la seconde ouverture (⑬⑭⑮).
//   n° 224  Type ou durée hors liste reclassés en silence à l'édition (⑯).
//   n° 218  `_evPlacePick` mélangeait deux lieux (adresse, code postal) (⑰).
//   n° 221  Série publique : une SECONDE carte au fil au démarrage suivant (⑱).
//
// Contre-épreuve : chaque cas est rouge sur le code d'avant (origin/main, 8091).
const { test, expect } = require("@playwright/test");
const { FauxServeur, ouvrirCompte } = require("./audit-2026-11-parcours-faux-serveur");
const { bootOnboarded } = require("./app-helper");

const ORGA = "aaaaaaaa-0000-4000-8000-000000000041";
const B = "bbbbbbbb-0000-4000-8000-000000000042";
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (status, body) => ({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" } });
const iso = (ms) => new Date(ms).toISOString().replace("Z", "");

// Un faux serveur dont les réponses peuvent être reprises au cas par cas :
// `srv.avant(req, url, m, body)` rend une réponse, ou rien pour le traitement normal.
// `prevenir` : réponse de la RPC `prevenir_inscrits_activite` (absente du banc commun).
function serveur() {
  const srv = new FauxServeur();
  srv.compte(ORGA, "orga_cre"); srv.compte(B, "bob_cre");
  srv.prevenir = [];          // appels reçus
  srv.reponsePrevenir = null; // null = succès (1 destinataire)
  srv.avant = null;
  const orig = srv.traiter.bind(srv);
  srv.traiter = async function (req) {
    const url = new URL(req.url()); const m = req.method();
    let body = null; try { body = JSON.parse(req.postData() || "null"); } catch (e) {}
    if (srv.avant) { const r = await srv.avant(req, url, m, body); if (r) return r; }
    if (m === "POST" && /\/rest\/v1\/rpc\/prevenir_inscrits_activite$/.test(url.pathname)) {
      const rep = srv.reponsePrevenir ? srv.reponsePrevenir(body) : { ok: true, destinataires: 1, prevenues: 1 };
      srv.prevenir.push({ genre: body.p_genre, cle: body.p_cle, message: body.p_message, rep });
      if (rep && rep.__http) return json(rep.__http, { code: "XX000", message: "panne" });
      return json(200, rep);
    }
    // `created_at` posé par la base (DEFAULT now()), comme en production.
    if (m === "POST" && /\/rest\/v1\/events$/.test(url.pathname) && body && !Array.isArray(body) && !body.created_at) {
      const r = await orig(req);
      const l = srv.t.events.find((e) => e.id === body.id);
      if (l && !l.created_at) l.created_at = srv.horodatageServeur();
      return r;
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
  srv.t.event_attendees.push({ event_id: id, user_id: r.author_id, rsvp: "going", created_at: new Date(Date.now() - 3600000).toISOString() });
  return r;
}

async function compte(browser, srv, uid = ORGA) {
  const ctx = await browser.newContext();
  const o = await ouvrirCompte(ctx, srv, uid, { nom: uid === ORGA ? "orga_cre" : "bob_cre" });
  await o.page.waitForFunction(() => window._supaInitTerminee === true, null, { timeout: 30000 });
  return { ctx, page: o.page };
}

// L'activité serveur en mémoire, comme après une lecture de Rencontrer.
async function charger(page, id) {
  await page.evaluate(async (id) => {
    const ev = (await supaLoadEvents()).find((e) => e.id === id);
    state.seed.events = (state.seed.events || []).filter((e) => e.id !== id);
    state.seed.events.unshift(ev);
    saveState();
  }, id);
}

// Saisie « à la main » : valeur + événements, comme une frappe.
async function poser(page, id, val) {
  await page.evaluate(([i, v]) => {
    const el = document.getElementById(i); if (!el) throw new Error("champ absent " + i);
    el.value = v;
    ["input", "change", "blur"].forEach((n) => el.dispatchEvent(new Event(n, { bubbles: true })));
  }, [id, val]);
}

async function remplir(page, titre, ville = "Paris") {
  await page.evaluate(() => { goTo("irl"); openCreateEvent(); });
  await expect(page.locator("#evTitle")).toHaveCount(1);
  await poser(page, "evTitle", titre);
  await poser(page, "evCity", ville);
  await poser(page, "evDate", new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
  await poser(page, "evTime", "19:00");
  await page.evaluate(() => {
    const s = document.getElementById("evPassion");
    const o = [...s.options].find((x) => x.value === "musique") || [...s.options].find((x) => x.value);
    s.value = o.value; s.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const toasts = (page) => page.evaluate(() => (window.__toasts || []).map((t) => ({ msg: t.msg, type: t.type })));
const msgs = async (page) => (await toasts(page)).map((t) => t.msg);
const raz = (page) => page.evaluate(() => { window.__toasts = []; });
const locale = (page, titre) => page.evaluate((t) => (state.userEvents || []).find((e) => e.title === t) || null, titre);
const finiDePublier = (page) => expect.poll(async () => (await msgs(page)).filter((m) => !/en cours|^Enregistrement/.test(m)).length, { timeout: 20000 }).toBeGreaterThan(0);

test.describe("Rencontrer — créer, modifier, gérer une activité", () => {
  test.setTimeout(150000);

  test("① n° 226 — refus définitif de la base à la création : pas un mot de « réseau », et pas d'activité fantôme", async ({ browser }) => {
    const srv = serveur();
    const { ctx, page } = await compte(browser, srv);
    try {
      for (const cas of [
        { nom: "droit", body: { code: "42501", message: "new row violates row-level security policy for table \"events\"" }, status: 403, garde: false },
        { nom: "plafond", body: { code: "P0001", message: "rate limit: max 15 insertions/minute sur events" }, status: 400, garde: true },
      ]) {
        const titre = "Refus " + cas.nom;
        await remplir(page, titre);
        srv.pannes.push({ table: "events", methode: "POST", status: cas.status, body: cas.body, fois: 1 });
        await raz(page);
        await page.evaluate(() => submitEvent());
        await finiDePublier(page);
        const dits = await msgs(page);
        expect(dits.join(" | "), cas.nom + " : le message ne parle pas de réseau").not.toMatch(/réseau/);
        expect(srv.t.events.some((e) => e.title === titre), "rien en base").toBe(false);
        const l = await locale(page, titre);
        if (cas.garde) expect(l && l._nonPubliee, "plafond passager : gardée ici, marquée non publiée").toBe(true);
        else expect(l, "refus de droit : l'activité ne reste pas dans ma liste").toBeNull();
      }
    } finally { await ctx.close(); }
  });

  test("② n° 226 — coupure réseau à la création : message réseau, puis « Publier maintenant » la crée vraiment", async ({ browser }) => {
    const srv = serveur();
    const { ctx, page } = await compte(browser, srv);
    try {
      let coupures = 1;
      await page.route(/supabase\.co\/rest\/v1\/events$/, (route) => {
        if (route.request().method() === "POST" && coupures > 0) { coupures--; return route.abort("internetdisconnected"); }
        return route.fallback();
      });
      const titre = "Coupure réseau";
      await remplir(page, titre);
      await raz(page);
      await page.evaluate(() => submitEvent());
      await finiDePublier(page);
      expect((await msgs(page)).join(" | ")).toMatch(/réseau/);
      const l = await locale(page, titre);
      expect(l && l._nonPubliee, "gardée ici, marquée non publiée").toBe(true);
      expect(srv.t.events.some((e) => e.title === titre)).toBe(false);
      // Le geste de renvoi (bouton « Publier maintenant » de « Gérer »).
      await page.evaluate((id) => { closeModal(); openEventManage(id); }, l.id);
      await page.locator("[data-republier]").click();
      await expect.poll(() => srv.t.events.some((e) => e.id === l.id), { timeout: 15000 }).toBe(true);
      await expect.poll(async () => !!(await locale(page, titre))._nonPubliee).toBe(false);
    } finally { await ctx.close(); }
  });

  test("③ n° 219 — nouvelle couverture dont l'envoi échoue : l'ancienne reste en base, et c'est dit", async ({ browser }) => {
    const srv = serveur();
    const ancienne = "https://xxxx.supabase.co/storage/v1/object/public/content/events/" + ORGA + "/evt_cre_3.jpg";
    activite(srv, "evt_cre_3", { cover_url: ancienne });
    srv.avant = (req, url, m) => (m === "POST" && url.pathname.startsWith("/storage/v1/object/")) ? json(500, { message: "panne stockage" }) : null;
    const { ctx, page } = await compte(browser, srv);
    try {
      await charger(page, "evt_cre_3");
      await page.evaluate(() => openCreateEvent("evt_cre_3"));
      // Le vrai champ fichier (le préremplissage d'édition réécrit la valeur cachée).
      await page.locator("#evCoverFile").setInputFiles({ name: "nouvelle.png", mimeType: "image/png", buffer: Buffer.from(PIXEL.split(",")[1], "base64") });
      await expect.poll(() => page.evaluate(() => document.getElementById("evCoverData").value.slice(0, 15))).toBe("data:image/png;");
      await raz(page);
      await page.evaluate(() => submitEvent("evt_cre_3"));
      await finiDePublier(page);
      await expect.poll(() => srv.journal.filter((r) => r.table === "events" && r.m === "PATCH").length).toBeGreaterThan(0);
      expect(srv.t.events.find((e) => e.id === "evt_cre_3").cover_url, "la couverture en base n'est pas effacée").toBe(ancienne);
      expect(await page.evaluate(() => _findCanonicalEvent("evt_cre_3").coverUrl)).toBe(ancienne);
      const t = await toasts(page);
      expect(t.some((x) => x.type === "warning" && /photo/.test(x.msg)), "un avertissement cite la photo : " + JSON.stringify(t)).toBe(true);
    } finally { await ctx.close(); }
  });

  test("④ n° 216 — copie locale portant un ancien co-organisateur : la modification part avec une liste vide et aboutit", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_cre_4");
    // Miroir de `rencontres_prive.activite_garde` : toute liste non vide → 42501.
    srv.avant = (req, url, m, body) => (m === "PATCH" && /\/rest\/v1\/events$/.test(url.pathname) && body && Array.isArray(body.co_organizers) && body.co_organizers.length)
      ? json(403, { code: "42501", message: "coorganisation_suspendue" }) : null;
    const { ctx, page } = await compte(browser, srv);
    try {
      await page.evaluate(async ([id, b]) => {
        const ev = (await supaLoadEvents()).find((e) => e.id === id);
        state.userEvents = [Object.assign({}, ev, { coOrganizers: [b], fromSupabase: false })];   // copie de création d'avant le 16/11
        saveState();
      }, ["evt_cre_4", B]);
      await page.evaluate(() => openCreateEvent("evt_cre_4"));
      await poser(page, "evTitle", "Atelier titre corrigé");
      await raz(page);
      await page.evaluate(() => submitEvent("evt_cre_4"));
      await finiDePublier(page);
      expect(await msgs(page)).toContain("Activité mise à jour");
      expect(srv.t.events.find((e) => e.id === "evt_cre_4").title, "la base a le nouveau titre").toBe("Atelier titre corrigé");
      expect(await page.evaluate(() => _findCanonicalEvent("evt_cre_4").coOrganizers)).toEqual([]);
    } finally { await ctx.close(); }
  });

  test("⑤ n° 220 — sur l'appareil de création, une diffusion refusée se dit : à l'annulation comme à la modification", async ({ browser }) => {
    const srv = serveur();
    const { ctx, page } = await compte(browser, srv);
    try {
      const titre = "Diffusion refusée";
      await remplir(page, titre);
      await page.evaluate(() => submitEvent());
      await expect.poll(() => srv.t.events.some((e) => e.title === titre), { timeout: 15000 }).toBe(true);
      const id = srv.t.events.find((e) => e.title === titre).id;
      srv.t.event_attendees.push({ event_id: id, user_id: B, rsvp: "going", created_at: new Date().toISOString() });
      await page.evaluate(() => rafraichirEvenements(true));
      await expect.poll(() => page.evaluate((i) => ((state.seed.events || []).find((e) => e.id === i) || {}).attendees || [], id)).toContain(B);

      // Modification : la base répond 500.
      srv.reponsePrevenir = () => ({ __http: 500 });
      await page.evaluate((i) => openCreateEvent(i), id);
      await poser(page, "evTime", "20:00");
      await raz(page);
      await page.evaluate((i) => submitEvent(i), id);
      await expect.poll(() => toasts(page), { timeout: 15000 }).toContainEqual(expect.objectContaining({ type: "warning" }));
      expect(await msgs(page)).toContain("Activité mise à jour");

      // Annulation : la base répond non_autorise.
      srv.reponsePrevenir = () => ({ ok: false, motif: "non_autorise" });
      await raz(page);
      await page.evaluate((i) => toggleCancelEvent(i), id);
      await expect.poll(() => srv.prevenir.filter((p) => p.genre === "event_cancelled").length).toBe(1);
      await expect.poll(() => msgs(page)).not.toEqual([]);
      const t = await toasts(page);
      expect(srv.t.events.find((e) => e.id === id).status).toBe("cancelled");
      expect(t.some((x) => x.type === "warning" && /prévenu/.test(x.msg)), "jamais « Activité annulée » seul : " + JSON.stringify(t)).toBe(true);
    } finally { await ctx.close(); }
  });

  test("⑥ n° 228 — un compte qui n'organise pas : ni formulaire d'édition, ni écriture d'annulation", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_cre_6");
    const { ctx, page } = await compte(browser, srv, B);
    try {
      await charger(page, "evt_cre_6");
      await raz(page);
      await page.evaluate(() => openCreateEvent("evt_cre_6"));
      await expect(page.locator("#modalBackdrop.active #evTitle")).toHaveCount(0);
      const j0 = srv.journal.length;
      await page.evaluate(() => toggleCancelEvent("evt_cre_6"));
      await page.evaluate(() => _sendEventBroadcast("evt_cre_6"));
      await pause(300);
      expect(srv.journal.slice(j0).filter((r) => r.m !== "GET" && (r.table === "events" || r.table === "prevenir_inscrits_activite")).map((r) => r.m + " " + r.table)).toEqual([]);
      expect(await msgs(page)).toContain("Seul l'organisateur peut gérer cette activité");
    } finally { await ctx.close(); }
  });

  test("⑦ n° 228 — relecture du serveur pendant la confirmation d'annulation : l'activité affichée est bien annulée", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_cre_7");
    const { ctx, page } = await compte(browser, srv);
    try {
      // Les relectures de fond sont tenues à l'écart : la seule qui compte ici est
      // celle que le test place pendant la feuille de confirmation.
      await page.evaluate(() => { window.rafraichirEvenements = async () => false; });
      await pause(800);
      await charger(page, "evt_cre_7");   // connue par la seule lecture serveur (autre appareil que la création)
      await page.evaluate(() => {
        // La relecture du serveur (retour au premier plan, `online`) tombe pendant la feuille.
        window.confirmerAction = async () => { fusionnerEvenementsServeur(await supaLoadEvents()); return true; };
      });
      const remplace = await page.evaluate(async () => {
        const avant = _findCanonicalEvent("evt_cre_7");
        await toggleCancelEvent("evt_cre_7");
        return _findCanonicalEvent("evt_cre_7") !== avant;
      });
      expect(remplace, "témoin : la relecture a remplacé l'objet").toBe(true);
      expect(srv.t.events.find((e) => e.id === "evt_cre_7").status).toBe("cancelled");
      expect(await page.evaluate(() => _findCanonicalEvent("evt_cre_7").status), "l'écran suit la base").toBe("cancelled");
    } finally { await ctx.close(); }
  });

  test("⑧ n° 229 — message groupé refusé : la fenêtre garde le texte, et le renvoi porte la MÊME clé", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_cre_8");
    srv.t.event_attendees.push({ event_id: "evt_cre_8", user_id: B, rsvp: "going", created_at: new Date().toISOString() });
    let pannes = 1;
    srv.reponsePrevenir = () => (pannes-- > 0 ? { ok: false, motif: "debit" } : { ok: true, destinataires: 1, prevenues: 1 });
    const { ctx, page } = await compte(browser, srv);
    try {
      await charger(page, "evt_cre_8");
      await page.evaluate(() => _messageEventAttendees("evt_cre_8"));
      await page.locator("#evBroadcast").fill("On se retrouve devant l'entrée nord");
      await page.locator("#modalContent button", { hasText: "Envoyer" }).click();
      await expect.poll(() => srv.prevenir.length).toBe(1);
      await expect(page.locator("#modalBackdrop.active #evBroadcast")).toHaveValue("On se retrouve devant l'entrée nord");
      await expect(page.locator("#modalContent button", { hasText: "Envoyer" })).toBeEnabled();
      await page.locator("#modalContent button", { hasText: "Envoyer" }).click();
      await expect.poll(() => srv.prevenir.length).toBe(2);
      expect(srv.prevenir[1].cle, "même geste, même clé : la base absorbe un rejeu").toBe(srv.prevenir[0].cle);
      await expect(page.locator("#modalBackdrop.active #evBroadcast")).toHaveCount(0);
    } finally { await ctx.close(); }
  });

  test("⑨ n° 227 — supprimer l'activité retire sa carte du fil et ma réponse", async ({ browser }) => {
    const srv = serveur();
    const { ctx, page } = await compte(browser, srv);
    try {
      const titre = "Activité à supprimer";
      await remplir(page, titre);
      await page.evaluate(() => submitEvent());
      await expect.poll(() => srv.t.events.some((e) => e.title === titre), { timeout: 15000 }).toBe(true);
      const id = srv.t.events.find((e) => e.title === titre).id;
      await expect.poll(() => srv.t.posts.some((p) => p.id === "post_ev_" + id), { timeout: 15000, message: "témoin : la carte est au fil" }).toBe(true);
      await page.evaluate((i) => deleteEventConfirm(i), id);
      await expect.poll(() => srv.t.events.some((e) => e.id === id)).toBe(false);
      await expect.poll(() => srv.t.posts.some((p) => p.id === "post_ev_" + id), { timeout: 20000, message: "la carte quitte la base" }).toBe(false);
      expect(await page.evaluate((i) => (state.user.eventRsvp || {})[i] || null, id), "ma réponse part avec l'activité").toBeNull();
      expect(await page.evaluate((i) => (state.userPosts || []).some((p) => p.id === "post_ev_" + i), id)).toBe(false);
    } finally { await ctx.close(); }
  });

  test("⑩ n° 225 — une longitude 0 (méridien de Greenwich) survit à une modification", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_cre_10", { city: "Villers-sur-Mer", lat: 49.32, lng: 0 });
    const { ctx, page } = await compte(browser, srv);
    try {
      await charger(page, "evt_cre_10");
      await page.evaluate(() => openCreateEvent("evt_cre_10"));
      await poser(page, "evTitle", "Atelier au méridien");
      await page.evaluate(() => submitEvent("evt_cre_10"));
      await expect.poll(() => srv.t.events.find((e) => e.id === "evt_cre_10").title, { timeout: 15000 }).toBe("Atelier au méridien");
      const l = srv.t.events.find((e) => e.id === "evt_cre_10");
      expect([l.lat, l.lng]).toEqual([49.32, 0]);
    } finally { await ctx.close(); }
  });

  test("⑪ n° 225 — nombres du formulaire : « 1e3 » places = 1000, « 2.5 » refusé, prix illisible refusé", async ({ browser }) => {
    const srv = serveur();
    const { ctx, page } = await compte(browser, srv);
    try {
      await remplir(page, "Mille places");
      await poser(page, "evMax", "1e3");
      await page.evaluate(() => submitEvent());
      await expect.poll(() => srv.t.events.some((e) => e.title === "Mille places"), { timeout: 15000 }).toBe(true);
      expect(srv.t.events.find((e) => e.title === "Mille places").max_attendees).toBe(1000);

      await remplir(page, "Places et demie");
      await poser(page, "evMax", "2.5");
      await raz(page);
      await page.evaluate(() => submitEvent());
      await expect.poll(() => msgs(page)).toContain("Le nombre de places doit être un nombre entier");

      await page.evaluate(() => closeModal());
      await remplir(page, "Prix illisible");
      await page.locator("#evPrice").fill("");
      await page.locator("#evPrice").pressSequentially("1e");
      expect(await page.locator("#evPrice").evaluate((el) => el.validity.badInput), "témoin : le navigateur juge la saisie illisible").toBe(true);
      await raz(page);
      await page.evaluate(() => submitEvent());
      await expect.poll(() => msgs(page)).toEqual([expect.stringMatching(/^Prix illisible/)]);
      await pause(300);
      expect(srv.t.events.some((e) => e.title === "Prix illisible" || e.title === "Places et demie"), "rien n'est parti").toBe(false);
    } finally { await ctx.close(); }
  });

  test("⑫ n° 222 — sans client Supabase, l'écran ne dit jamais « publiée »", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => {
      ["supaPublishEvent", "supaUpdateEvent", "supaJoinEvent"].forEach((fn) => { window[fn] = async () => true; });
      window._supaReal = false;
      window.__toasts = [];
      const _t = window.toast;
      window.toast = function (msg, type) { window.__toasts.push({ msg: String(msg), type: type || "info" }); return _t.apply(this, arguments); };
    });
    await remplir(page, "Jam sans serveur");
    await page.evaluate(() => submitEvent());
    await expect.poll(() => page.evaluate(() => state.userEvents.some((e) => e.title === "Jam sans serveur"))).toBe(true);
    await expect.poll(async () => (await toasts(page)).length).toBeGreaterThan(1);
    const t = await toasts(page);
    expect(t.some((x) => /publiée/.test(x.msg) || x.type === "success"), JSON.stringify(t)).toBe(false);
    expect(t.some((x) => x.type === "warning" && /uniquement sur cet appareil/.test(x.msg)), JSON.stringify(t)).toBe(true);
  });

  test("⑬ n° 223 — habillage UI-6A0 coupé : deux appuis pendant le géocodage ne créent qu'UNE activité", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => {
      localStorage.setItem("passio_ui_6a0", "0");
      ["supaPublishEvent", "supaUpdateEvent", "supaJoinEvent"].forEach((fn) => { window[fn] = async () => true; });
      window._supaReal = false;
      window._geocodeAddress = () => new Promise((r) => setTimeout(() => r({ lat: 45.1, lng: 5.1 }), 1200));
      state.userEvents = []; saveState();
    });
    await remplir(page, "Double appui", "Villeneuve-Inconnue");
    await page.evaluate(async () => {
      const a = submitEvent();
      await new Promise((r) => setTimeout(r, 300));
      const b = submitEvent();
      await Promise.all([a, b]);
    });
    await pause(500);
    expect(await page.evaluate(() => state.userEvents.filter((e) => e.title === "Double appui").length)).toBe(1);
  });

  test("⑭ n° 223 — publication lente : un SECOND formulaire n'est pas avalé, les deux activités partent", async ({ browser }) => {
    const srv = serveur();
    let premier = true;
    srv.avant = async (req, url, m, body) => {
      if (m === "POST" && /\/rest\/v1\/events$/.test(url.pathname) && body && body.title === "Lente" && premier) { premier = false; await pause(4000); }
      return null;
    };
    const { ctx, page } = await compte(browser, srv);
    try {
      await remplir(page, "Lente");
      await page.evaluate(() => { window.__lente = submitEvent(); });
      await expect(page.locator("#modalBackdrop.active #evTitle")).toHaveCount(0);
      await remplir(page, "Seconde");
      await page.evaluate(() => submitEvent());
      await expect.poll(() => srv.t.events.map((e) => e.title).sort(), { timeout: 20000 }).toEqual(["Lente", "Seconde"]);
    } finally { await ctx.close(); }
  });

  test("⑮ n° 223 (annexe) — le rangement UI-6A0 s'applique à CHAQUE ouverture du formulaire", async ({ page }) => {
    await bootOnboarded(page);
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => { goTo("irl"); openCreateEvent(); });
      await expect(page.locator("#modalContent .v6a0-actions"), "ouverture n° " + (i + 1)).toHaveCount(1);
      await page.evaluate(() => closeModal());
      await pause(400);
    }
  });

  test("⑯ n° 224 — type et durée hors liste : modifier le titre ne les reclasse pas", async ({ browser }) => {
    const srv = serveur();
    const debut = Date.now() + 4 * 86400000;
    activite(srv, "evt_cre_16", { event_type: "Sortie", date_at: iso(debut), end_at: iso(debut + 5 * 3600000) });
    const { ctx, page } = await compte(browser, srv);
    try {
      await charger(page, "evt_cre_16");
      await page.evaluate(() => openCreateEvent("evt_cre_16"));
      expect(await page.locator("#evType").inputValue()).toBe("Sortie");
      expect(Number(await page.locator("#evDuration").inputValue())).toBe(5);
      await poser(page, "evTitle", "Sortie corrigée");
      await page.evaluate(() => submitEvent("evt_cre_16"));
      await expect.poll(() => srv.t.events.find((e) => e.id === "evt_cre_16").title, { timeout: 15000 }).toBe("Sortie corrigée");
      const l = srv.t.events.find((e) => e.id === "evt_cre_16");
      expect(l.event_type).toBe("Sortie");
      expect((Date.parse(l.end_at) - Date.parse(l.date_at)) / 3600000).toBe(5);
    } finally { await ctx.close(); }
  });

  test("⑰ n° 218 — un choix dans la recherche de lieu REMPLACE le lieu (adresse, code postal), sans effacer un nom tapé", async ({ page }) => {
    await bootOnboarded(page);
    const val = () => page.evaluate(() => Object.fromEntries(["evVenue", "evAddress", "evPostal", "evCity"].map((i) => [i, document.getElementById(i).value])));
    await page.evaluate(() => {
      goTo("irl"); openCreateEvent();
      window._evSuggestCache = [
        { name: "12 Rue de la Paix", postcode: "75002", city: "Paris", lat: 48.869, lng: 2.331 },
        { name: "Place Bellecour", postcode: "69002", city: "Lyon", lat: 45.7578, lng: 4.8322 },
        { name: "Lac de la Thuile", postcode: "", city: "La Thuile", lat: 45.53, lng: 6.06 },
      ];
    });
    await page.evaluate(() => _evPlacePick(0));
    await page.evaluate(() => _evPlacePick(1));
    expect(await val()).toEqual({ evVenue: "Place Bellecour", evAddress: "", evPostal: "69002", evCity: "Lyon" });
    await page.evaluate(() => _evPlacePick(2));
    expect(await val(), "un résultat sans code postal ne garde pas celui d'avant").toEqual({ evVenue: "Lac de la Thuile", evAddress: "", evPostal: "", evCity: "La Thuile" });
    await page.evaluate(() => _evPlacePick(0));
    expect((await val()).evVenue, "le nom posé par une suggestion part avec elle").toBe("");
    await poser(page, "evVenue", "Chez Max");
    await page.evaluate(() => _evPlacePick(0));
    expect((await val()).evVenue, "un nom TAPÉ reste").toBe("Chez Max");
  });

  test("⑱ n° 221 — série publique : pas de seconde carte au fil au démarrage suivant ; sans carte, c'est la PREMIÈRE date qui la reçoit", async ({ browser }) => {
    const srv = serveur();
    const serie = (s, debutJ) => [0, 7, 14].map((j, i) => activite(srv, s + "_" + i, { series_id: s, recurrence: "weekly",
      date_at: iso(Date.now() + (debutJ + j) * 86400000), created_at: iso(Date.now() - 600000 + i * 1000) }));
    const a = serie("s_cre_a", 2), b = serie("s_cre_b", 3);
    // La carte de création de la série A, portée par sa première date.
    srv.t.posts.push({ id: "post_ev_" + a[0].id, author_id: ORGA, content: "", passion_id: "musique", created_at: new Date().toISOString(),
      shared_data: JSON.stringify({ kind: "event", id: a[0].id }) });
    const { ctx, page } = await compte(browser, srv);
    try {
      // Le démarrage a fait son rattrapage (`rafraichirEvenements`) ; un second passage, comme
      // à l'ouverture suivante, ne doit rien ajouter.
      const cartes = () => srv.t.posts.map((p) => p.id).filter((id) => /^post_ev_/.test(id)).sort();
      const attendu = ["post_ev_" + a[0].id, "post_ev_" + b[0].id].sort();
      await expect.poll(cartes, { timeout: 15000 }).toEqual(attendu);
      await page.evaluate(async () => rattraperActivitesAuFil(await supaLoadEvents()));
      await pause(500);
      expect(cartes()).toEqual(attendu);
    } finally { await ctx.close(); }
  });
});
