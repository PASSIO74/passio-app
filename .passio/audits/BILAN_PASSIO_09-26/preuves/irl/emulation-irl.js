// Émulation manuelle IRL — Chromium, serveur local 8104, AUCUNE écriture réseau
// (toutes les tables Supabase répondent [] et toute autre requête externe est
// coupée). Preuves déposées dans ce dossier. Lecture seule du dépôt.
const path = require("path");
const fs = require("fs");
const { chromium } = require("/home/user/passio-app/node_modules/@playwright/test");
const { bootOnboarded } = require("/home/user/passio-app/tests/e2e/app-helper.js");

const OUT = __dirname;
const BASE = "http://127.0.0.1:8104";
const R = { etapes: [], externes: [] };
function log(k, v) { R.etapes.push({ k, v }); console.log(k, JSON.stringify(v)); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: BASE, geolocation: { latitude: 45.9, longitude: 6.12 }, permissions: ["geolocation"] });
  const page = await ctx.newPage();
  // Toute requête hors serveur local est coupée (tuiles, géocodage, Supabase POST…)
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    R.externes.push(route.request().method() + " " + route.request().url().slice(0, 90));
    return route.abort();
  });
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors, 1);
  await page.evaluate(() => goTo("irl"));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "01-irl-liste.png") });

  // ── 1. Création : date passée refusée ──────────────────────────────────
  await page.evaluate(() => openCreateEvent());
  await page.waitForSelector("#evTitle");
  const hier = new Date(Date.now() - 2 * 86400000);
  const jour = (d) => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  await page.fill("#evTitle", "Test passé");
  await page.fill("#evCity", "Annecy");
  await page.fill("#evDate", jour(hier));
  await page.selectOption("#evPassion", "musique");
  const nbAvant = await page.evaluate(() => (state.userEvents || []).length);
  await page.evaluate(() => submitEvent());
  await page.waitForTimeout(400);
  const toastPasse = await page.evaluate(() => Array.from(document.querySelectorAll(".toast, .toast-item, [class*=toast]")).map(t => t.textContent.trim()).join(" | "));
  const nbApres = await page.evaluate(() => (state.userEvents || []).length);
  log("date_passee", { toast: toastPasse, creeQuandMeme: nbApres > nbAvant });
  await page.evaluate(() => closeModal());

  // ── 2. Création hostile (XSS) + apostrophe + prix + capacité ──────────
  await page.evaluate(() => openCreateEvent());
  await page.waitForSelector("#evTitle");
  const demain = new Date(Date.now() + 86400000);
  const XSS = "<img src=x onerror=\"window.__xss=1\">";
  await page.fill("#evTitle", "Jam d'Or " + XSS);
  await page.fill("#evCity", "Annecy");
  await page.fill("#evVenue", "Café d'Or " + XSS);
  await page.fill("#evAddress", "12 rue de l'Éveil " + XSS);
  await page.fill("#evPostal", "74000");
  await page.fill("#evDate", jour(demain));
  await page.fill("#evTime", "19:30");
  await page.fill("#evPrice", "12.5");
  await page.fill("#evMax", "2");
  await page.fill("#evContact", "06 00 00 00 00");
  await page.fill("#evLink", "javascript:alert(1)");
  await page.fill("#evDesc", "Desc " + XSS);
  await page.selectOption("#evPassion", "musique");
  await page.evaluate(() => submitEvent());
  await page.waitForTimeout(800);
  const cree = await page.evaluate(() => { const e = (state.userEvents || [])[0]; return e && { id: e.id, title: e.title, address: e.address, price: e.price, max: e.maxAttendees, lat: e.lat, lng: e.lng, attendees: e.attendees, rsvp: state.user.eventRsvp && state.user.eventRsvp[e.id] }; });
  log("creation_hostile", cree);
  await page.screenshot({ path: path.join(OUT, "02-apres-creation.png") });

  // ── 3. Fiche : adresse/contact visibles, XSS neutralisée, lien javascript: ──
  await page.evaluate((id) => openEventDetails(id), cree.id);
  await page.waitForTimeout(500);
  const fiche = await page.evaluate(() => {
    const c = document.getElementById("eventDetailContent");
    const links = Array.from(c.querySelectorAll("a")).map(a => a.getAttribute("href"));
    return { xss: window.__xss, texte: c.innerText.slice(0, 900), hrefs: links, prix: (c.innerText.match(/Prix\s*\n?\s*([^\n]+)/) || [])[1] };
  });
  log("fiche", fiche);
  await page.screenshot({ path: path.join(OUT, "03-fiche.png"), fullPage: false });

  // ── 4. Édition : v() n'échappe pas deux fois ──────────────────────────
  await page.evaluate((id) => openCreateEvent(id), cree.id);
  await page.waitForSelector("#evVenue");
  const venueEdit = await page.inputValue("#evVenue");
  const titleEdit = await page.inputValue("#evTitle");
  log("edition_valeurs", { venue: venueEdit, title: titleEdit, doubleEchappe: /&amp;|&#39;|&lt;/.test(venueEdit + titleEdit) });
  await page.evaluate(() => closeModal());

  // ── 5. Capacité + RSVP : événement seed complet, join → liste d'attente ─
  const rsvp = await page.evaluate(async () => {
    const ev = (state.seed.events || []).find(e => e.date > Date.now() && e.status !== "cancelled");
    ev.maxAttendees = 1; ev.attendees = ["u_autre"]; ev.maybes = []; ev.waitlist = [];
    await setEventRsvp(ev.id, "going");
    const a = { apresJoin: myRsvp(ev.id), waitlist: ev.waitlist.slice(), attendees: ev.attendees.slice() };
    // Forcer « going » alors que complet : passe par la garde ?
    await setEventRsvp(ev.id, "going");
    a.reForceGoing = myRsvp(ev.id);
    await setEventRsvp(ev.id, null);
    a.apresRetrait = myRsvp(ev.id);
    a.id = ev.id;
    return a;
  });
  log("rsvp_capacite", rsvp);

  // ── 6. Double clic sur « + Rejoindre » d'une carte (course locale) ──────
  const dbl = await page.evaluate(async () => {
    const ev = (state.seed.events || []).find(e => e.date > Date.now() && e.status !== "cancelled" && !e.maxAttendees);
    if (!ev) return { skip: true };
    ev.attendees = []; ev.maybes = []; ev.waitlist = [];
    _setMyRsvpLocal(ev.id, null); saveState();
    const before = myRsvp(ev.id);
    toggleJoinEvent(ev.id); toggleJoinEvent(ev.id);
    await new Promise(r => setTimeout(r, 300));
    return { id: ev.id, before, after: myRsvp(ev.id), attendees: ev.attendees.slice() };
  });
  log("double_clic_rejoindre", dbl);

  // ── 7. Filtres : Ce week-end / Mes événements / Mes rencontres ─────────
  await page.evaluate(() => { closeEventDetail(); goTo("irl"); });
  await page.waitForTimeout(300);
  const filt = await page.evaluate(async () => {
    const out = {};
    const total = _filterIrlEvents(allEvents()).length;
    out.total = total;
    out.v4a5 = !!(window.PassioUIV4A5 && PassioUIV4A5.isActive());
    if (out.v4a5) { PassioUIV4A5.open(); await new Promise(r => setTimeout(r, 200)); }
    const we = document.querySelector('[data-v4a5-quand="weekend"]');
    out.caseWeekend = !!we;
    if (we) { we.click(); await new Promise(r => setTimeout(r, 200)); out.weekend = _filterIrlEvents(allEvents()).length; out.weekendActif = irlDateFilterActif("weekend"); we.click(); }
    const mine = document.querySelector('[data-irlfilter="mine"]');
    out.caseMine = !!mine;
    if (mine) { mine.click(); await new Promise(r => setTimeout(r, 200)); out.mine = _filterIrlEvents(allEvents()).length; mine.click(); }
    const joined = document.querySelector('[data-irlfilter="joined"]');
    if (joined) { joined.click(); await new Promise(r => setTimeout(r, 200)); out.joined = _filterIrlEvents(allEvents()).length; joined.click(); }
    out.pied = (document.getElementById("v4a5Pied") || {}).innerText;
    out.nbActifs = _irlActiveFilterCount();
    return out;
  });
  log("filtres", filt);
  await page.screenshot({ path: path.join(OUT, "04-filtres.png") });
  await page.evaluate(() => { if (window.PassioUIV4A5) PassioUIV4A5.close(); });

  // ── 8. Carte : bibliothèque réellement chargée + tuiles ────────────────
  const carte = await page.evaluate(async () => {
    const out = { v4a3: !!(window.PassioUIV4A3 && PassioUIV4A3.isActive()) };
    if (window.PassioUIV4A3) PassioUIV4A3.setVue("carte");
    await new Promise(r => setTimeout(r, 2500));
    out.vue = window.PassioUIV4A3 && PassioUIV4A3.vue();
    out.maplibre = typeof window.maplibregl;
    out.L = typeof window.L;
    out.leafletVrai = !!(window.L && window.L.version);
    out.webgl = window._mapWebgl;
    out.fallback = (document.querySelector(".irl-map-fallback") || {}).innerText || null;
    const wrap = document.getElementById("irlMapWrap");
    out.wrapParent = wrap && wrap.parentElement && (wrap.parentElement.id || wrap.parentElement.className);
    out.wrapPrevSiblingIsList = !!(wrap && wrap.nextElementSibling && wrap.nextElementSibling.id === "eventList");
    out.scripts = Array.from(document.scripts).map(s => s.src).filter(s => /maplibre|leaflet/i.test(s));
    return out;
  });
  log("carte", carte);
  await page.screenshot({ path: path.join(OUT, "05-carte.png") });
  await page.evaluate(() => { if (window.PassioUIV4A3) PassioUIV4A3.setVue("liste"); });

  // ── 9. Check-in : code dérivable de l'id, pointage sans inscription, rejeu ─
  const chk = await page.evaluate(async () => {
    const ev = (state.seed.events || []).find(e => e.status !== "cancelled" && !state.user.eventRsvp[e.id]);
    ev.date = Date.now() + 10 * 60000; ev.endAt = ev.date + 7200000;
    const code = _eventCheckinCode(ev);
    const url = _eventCheckinUrl(ev);
    const out = { id: ev.id, code, url, rsvpAvant: myRsvp(ev.id), canCheckIn: _canCheckIn(ev) };
    _checkInViaCode(ev);
    out.checked = _hasCheckedIn(ev);
    out.rsvpApres = myRsvp(ev.id);
    _checkInViaCode(ev);
    out.rejeuBloqueLocal = (state.user.checkedInEvents || []).filter(x => x === ev.id).length;
    // Le code est-il recalculable par n'importe qui ? (fonction globale, algorithme public)
    out.recalcul = (typeof window._eventCheckinCode === "function") && window._eventCheckinCode({ id: ev.id }) === code;
    return out;
  });
  log("checkin", chk);

  // ── 10. Mineur : aucune garde IRL ──────────────────────────────────────
  const mineur = await page.evaluate(async () => {
    state.user.isMinor = true; state.user.birthYear = new Date().getFullYear() - 15; saveState();
    const ev = (state.seed.events || []).find(e => e.date > Date.now() && e.status !== "cancelled" && !e.maxAttendees);
    _setMyRsvpLocal(ev.id, null);
    await setEventRsvp(ev.id, "going");
    const out = { rsvpMineur: myRsvp(ev.id) };
    openCreateEvent();
    out.formulaireCreationOuvert = !!document.getElementById("evTitle");
    closeModal();
    const fiche = (function () { openEventDetails(ev.id); const t = document.getElementById("eventDetailContent").innerText; closeEventDetail(); return t; })();
    out.adresseVisibleMineur = /Adresse|Ville/.test(fiche);
    state.user.isMinor = false; saveState();
    return out;
  });
  log("mineur", mineur);

  // ── 11. Blocage : l'événement d'un compte bloqué reste listé ───────────
  const bloc = await page.evaluate(() => {
    const ev = (state.seed.events || []).find(e => e.date > Date.now() && e.status !== "cancelled" && e.organizerId && e.organizerId !== "me");
    state.user.blocked = [ev.organizerId];
    const visible = _filterIrlEvents(allEvents()).some(e => e.id === ev.id);
    renderIRL();
    const carte = !!document.querySelector('#eventList .event-card[data-evid="' + ev.id + '"]');
    state.user.blocked = [];
    return { organizer: ev.organizerId, encoreDansListe: visible, carteRendue: carte };
  });
  log("blocage", bloc);

  // ── 12. Annulation : qui est notifié (attendees seulement ?) ──────────
  const notif = await page.evaluate(() => {
    const ev = (state.userEvents || [])[0];
    ev.attendees = ["u_going"]; ev.maybes = ["u_maybe"]; ev.waitlist = ["u_wait"];
    const appels = [];
    window.supaInsertNotif = async (to, kind, ref, txt) => { appels.push({ to, kind, txt }); };
    _notifyEventAttendees(ev, "a annulé un événement auquel tu participais");
    return { appels };
  });
  log("annulation_notifies", notif);

  // ── 13. Promotion liste d'attente : retour RLS ignoré ? ────────────────
  const promo = await page.evaluate(async () => {
    const ev = (state.userEvents || [])[0];
    ev.maxAttendees = 5; ev.attendees = ["me"]; ev.waitlist = ["u_wait"];
    const appels = [];
    window._supaReal = true;
    window.supaPromoteFromWaitlist = async () => false;   // ce que rend la RLS (0 ligne)
    window.supaInsertNotif = async (to, kind, ref, txt) => { appels.push({ to, kind, txt }); };
    window.supaSetEventRsvp = async () => true; window.supaLeaveEvent = async () => true;
    await promoteWaitlisted(ev.id, "u_wait");
    const out = { notifEnvoyeeMalgreEchec: appels, attendeesLocal: ev.attendees.slice(), waitlistLocal: ev.waitlist.slice() };
    window._supaReal = false;
    return out;
  });
  log("promotion_waitlist", promo);

  // ── 14. Visiteur (première visite) : l'adresse est-elle affichée ? ──────
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: BASE });
  const p2 = await ctx2.newPage();
  await p2.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    const u = route.request().url();
    if (/rest\/v1\/events/.test(u) && route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "ev_prod_x", author_id: "u_orga", organizer_id: "u_orga", title: "Apéro réel", passion_id: "musique", lat: 45.9, lng: 6.12, city: "Annecy", date_at: new Date(Date.now() + 3 * 86400000).toISOString().replace("Z", ""), address: "7 rue du Domicile", postal_code: "74000", contact: "06 11 22 33 44", status: "active", max_attendees: 10 }]) });
    }
    if (/rest\/v1\//.test(u) && route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    return route.abort();
  });
  await p2.addInitScript(([k, t]) => { sessionStorage.setItem(k, t); sessionStorage.setItem("passio_pwa_dismissed", "1"); }, [require("/home/user/passio-app/tests/e2e/gate-helper.js").GATE_KEY, require("/home/user/passio-app/tests/e2e/gate-helper.js").GATE_TOKEN]);
  await p2.goto("/index.html");
  await p2.waitForTimeout(3500);
  const visiteur = await p2.evaluate(() => {
    const out = { visiteur: !!(window.PassioFirstRun && PassioFirstRun.estVisiteur()), MY_UID: typeof MY_UID !== "undefined" ? !!MY_UID : null };
    const ev = (state.seed.events || []).find(e => e.id === "ev_prod_x");
    out.evenementProdCharge = !!ev;
    if (ev) { goTo("irl"); openEventDetails(ev.id); out.fiche = document.getElementById("eventDetailContent").innerText.slice(0, 500); }
    return out;
  });
  log("visiteur_adresse", visiteur);
  await p2.screenshot({ path: path.join(OUT, "06-visiteur-fiche.png") });
  await ctx2.close();

  R.erreurs = errors;
  fs.writeFileSync(path.join(OUT, "emulation-resultats.json"), JSON.stringify(R, null, 2));
  await browser.close();
})().catch((e) => { console.error("ECHEC", e); R.echec = String(e && e.stack || e); fs.writeFileSync(path.join(OUT, "emulation-resultats.json"), JSON.stringify(R, null, 2)); process.exit(1); });
