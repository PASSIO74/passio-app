// Seconde passe : week-end (sélecteur réel), édition à date passée (submitEvent(id)), Mes rencontres, XSS carte.
const path = require("path");
const fs = require("fs");
const { chromium } = require("@playwright/test");
const { bootOnboarded } = require("/home/user/passio-app/tests/e2e/app-helper.js");
const OUT = __dirname;
const PORT = process.env.PORT || "8204";
const R = { etapes: [], erreursJs: [] };
function log(etape, obj) { R.etapes.push(Object.assign({ etape }, obj)); console.log(etape, JSON.stringify(obj)); }
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:" + PORT, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => R.erreursJs.push(String(e.message)));
  page.on("dialog", (d) => d.accept());
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.__appels = [];
    const spy = (n, ret) => { window[n] = async (...a) => { window.__appels.push([n].concat(a.map(x => typeof x === "object" && x ? (x.id || "obj") : x))); return ret; }; };
    ["supaPublishEvent", "supaCancelEvent", "supaJoinEvent", "supaLeaveEvent", "supaSetEventRsvp", "supaCheckInEvent", "supaFirstWaitlisted", "supaLoadMyRsvps", "supaLoadEvents", "supaLoadEventPosts", "supaLoadEventReactions", "supaLoadEventComments", "supaLoadEventCommentCounts", "supaCreateEventConversation", "supaJoinEventConversation", "supaLeaveEventConversation", "supaInsertNotif"].forEach(n => spy(n, null));
    spy("supaUpdateEvent", true); spy("supaDeleteEvent", false); spy("supaPromoteFromWaitlist", false); spy("supaReport", true);
    window._supaReal = true;
    window.passioGeoSuggest = async () => []; window.passioGeocode = async () => null; window.passioReverseGeocode = async () => null; window._geocodeAddress = async () => null;
    window.irlUserLocation = { lat: 48.8566, lng: 2.3522 };
    const now = Date.now();
    const d = new Date(); const j = d.getDay(); const v = j === 0 ? -1 : 6 - j;
    const sam = new Date(d.getFullYear(), d.getMonth(), d.getDate() + v, 15, 0, 0, 0).getTime();
    const dim = new Date(d.getFullYear(), d.getMonth(), d.getDate() + v + 1, 11, 0, 0, 0).getTime();
    state.seed.events = [
      { id: "evA", title: "Jam <script>alert(1)</script>", passion: "musique", emoji: "🎸", city: "Paris", lat: 48.8566, lng: 2.3522, date: now + 2 * 86400000, time: "18:00", desc: "", attendees: [], maybes: [], waitlist: [], checkedIn: [], organizerId: "orga_tiers", status: "active", eventType: "<img src=x onerror=window.__xss=1>", venue: "<b>Cave</b>", address: "<u>12 rue</u>", contact: "\" onclick=\"window.__xss2=1" },
      { id: "evSam", title: "Samedi", passion: "cuisine", emoji: "🍳", city: "Paris", lat: 48.8566, lng: 2.3522, date: sam, time: "15:00", desc: "", attendees: [], maybes: [], waitlist: [], checkedIn: [], organizerId: "orga_tiers", status: "active" },
      { id: "evDim", title: "Dimanche", passion: "cuisine", emoji: "🍳", city: "Paris", lat: 48.8566, lng: 2.3522, date: dim, time: "11:00", desc: "", attendees: [], maybes: [], waitlist: [], checkedIn: [], organizerId: "orga_tiers", status: "active" },
      { id: "evLoin", title: "Dans 20 jours", passion: "cuisine", emoji: "🍳", city: "Paris", lat: 48.8566, lng: 2.3522, date: now + 20 * 86400000, time: "11:00", desc: "", attendees: [], maybes: [], waitlist: [], checkedIn: [], organizerId: "orga_tiers", status: "active" },
    ];
    state.userEvents = [{ id: "evMine", title: "Mon event", passion: "musique", emoji: "🎸", city: "Paris", lat: 48.8566, lng: 2.3522, date: now + 3 * 86400000, time: "18:00", desc: "", attendees: [MY_UID || "me"], maybes: [], waitlist: [], checkedIn: [], organizerId: MY_UID || "me", status: "active" }];
    state.user.joinedEvents = ["evMine"]; state.user.eventRsvp = { evMine: "going" }; state.user.checkedInEvents = [];
    window._irlRenderLimit = null; window._irlFilterSig = null; window._irlMapSig = null;
    irlPassionFilters.clear(); irlDateFilters.clear(); irlFilters.clear(); irlSearchQuery = ""; irlShowPast = false;
    goTo("irl"); renderIRL();
  });
  await page.waitForTimeout(600);
  const l0 = await page.evaluate(() => ({ cartes: Array.from(document.querySelectorAll("#eventList .event-card")).map(c => c.getAttribute("data-evid")), xss: window.__xss || null, titreCarte: (document.querySelector('#eventList .event-card[data-evid="evA"] .event-title') || {}).textContent, samediEstFutur: _findCanonicalEvent("evSam").date > Date.now() }));
  log("liste + XSS carte", l0);

  // Fiche evA : contact hostile dans href
  await page.evaluate(() => openEventDetails("evA"));
  await page.waitForTimeout(400);
  const f = await page.evaluate(() => ({ xss: window.__xss || null, xss2: window.__xss2 || null, hrefTel: (document.querySelector('#eventDetailContent a[href^="tel:"]') || {}).getAttribute ? document.querySelector('#eventDetailContent a[href^="tel:"]').getAttribute("href") : null, adresse: (Array.from(document.querySelectorAll(".event-detail-info-value")).map(x => x.innerHTML)).slice(0, 4) }));
  log("fiche evA XSS", f);
  await page.evaluate(() => { const a = document.querySelector('#eventDetailContent a[href^="tel:"]'); if (a) a.click(); });
  const f2 = await page.evaluate(() => ({ xss2: window.__xss2 || null }));
  log("clic sur lien contact hostile", f2);
  await page.evaluate(() => closeEventDetail());

  // Week-end via la page Filtre
  const we = await page.evaluate(async () => {
    PassioUIV4A5.open(); await new Promise(r => setTimeout(r, 300));
    const b = document.querySelector('[data-v4a5-quand="weekend"]');
    if (!b) return { case: false };
    b.click(); await new Promise(r => setTimeout(r, 400));
    return { case: true, pressed: b.getAttribute("aria-pressed"), filtres: Array.from(irlDateFilters), resultats: window._irlResultCount, pied: (document.querySelector(".v4a5-pied, [class*=v4a5-pied], .v4a5-footer") || {}).textContent || null, cartes: Array.from(document.querySelectorAll("#eventList .event-card")).map(c => c.getAttribute("data-evid")) };
  });
  log("case Ce week-end", we);
  await page.screenshot({ path: path.join(OUT, "07-filtre-weekend.jpg"), type: "jpeg", quality: 55 });
  const mine = await page.evaluate(async () => {
    document.querySelector('[data-v4a5-quand="weekend"]').click(); await new Promise(r => setTimeout(r, 300));
    const b = document.querySelector('[data-v4a5-vue] [data-irlfilter="joined"], [data-irlfilter="joined"]');
    if (!b) return { bouton: false };
    b.click(); await new Promise(r => setTimeout(r, 400));
    return { bouton: true, filtres: Array.from(irlFilters), resultats: window._irlResultCount, cartes: Array.from(document.querySelectorAll("#eventList .event-card")).map(c => c.getAttribute("data-evid")) };
  });
  log("Mes rencontres", mine);
  await page.evaluate(async () => { const b = document.querySelector('[data-irlfilter="joined"]'); if (b) b.click(); PassioUIV4A5.close(); });

  // Édition à date passée (submitEvent(id))
  const ed = await page.evaluate(async () => {
    openCreateEvent("evMine"); await new Promise(r => setTimeout(r, 300));
    const g = x => document.getElementById(x);
    const btn = Array.from(document.querySelectorAll("#modal button, .modal button")).find(b => /submitEvent/.test(b.getAttribute("onclick") || ""));
    const onclick = btn && btn.getAttribute("onclick");
    const d = new Date(Date.now() - 10 * 86400000); g("evDate").value = d.toISOString().slice(0, 10);
    window.__appels = []; await submitEvent("evMine"); await new Promise(r => setTimeout(r, 300));
    const ev = _findCanonicalEvent("evMine");
    return { onclickBouton: onclick, dateDansLePasse: ev.date < Date.now(), over: _eventIsOver(ev), appels: window.__appels.filter(a => /Update|Notif/.test(a[0])), visibleListe: !!document.querySelector('#eventList .event-card[data-evid="evMine"]') };
  });
  log("édition d'un événement avec une date passée", ed);

  // Signalement en rafale
  const rep = await page.evaluate(() => { window.__appels = []; for (let i = 0; i < 5; i++) reportEvent("evA"); return { appels: window.__appels.length }; });
  log("5 signalements successifs sans confirmation", rep);

  fs.writeFileSync(path.join(OUT, "emulation-resultats-2.json"), JSON.stringify(R, null, 2));
  await browser.close();
})().catch(e => { console.error("ECHEC", e); fs.writeFileSync(path.join(OUT, "emulation-resultats-2.json"), JSON.stringify(Object.assign(R, { erreur: String(e && e.stack || e) }), null, 2)); process.exit(1); });
