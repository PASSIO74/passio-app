// ═══════════════════════════════════════════════════════════════════════════
// BANC DE CHAOS — audit « robustesse-pannes », BILAN PASSIO 09/26.
// Serveur local (http-server 8113), gate 2125, état onboardé injecté.
// TOUT le trafic *.supabase.co est intercepté (page.route) : AUCUNE requête
// n'atteint la production. Le SDK supabase-js (CDN) est servi depuis une copie
// locale (dashboard/node_modules) pour que le VRAI client tourne et que les
// écritures REST partent réellement — et soient comptées.
// Chaque expérience écrit ses observations dans 02-chaos-observations.jsonl.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("/home/user/passio-app/node_modules/@playwright/test");
const fs = require("fs");
const path = require("path");
const { GATE_KEY, GATE_TOKEN } = require("/home/user/passio-app/tests/e2e/gate-helper");
const { onboardedState } = require("/home/user/passio-app/tests/e2e/app-helper");

const DIR = __dirname;
const OBS = path.join(DIR, "02-chaos-observations.jsonl");
const SDK = fs.readFileSync("/home/user/passio-app/dashboard/node_modules/@supabase/supabase-js/dist/umd/supabase.js", "utf8");
const SUPA_HOST = "njkiyoklssvefstljemx.supabase.co";
const UID = "11111111-2222-4333-8444-555555555555";

function noter(nom, obj) {
  const ligne = Object.assign({ scenario: nom, at: new Date().toISOString() }, obj);
  fs.appendFileSync(OBS, JSON.stringify(ligne) + "\n");
  console.log("OBS " + nom + " → " + JSON.stringify(obj).slice(0, 900));
}

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function fauxJeton() {
  const now = Math.floor(Date.now() / 1000);
  const jwt = b64url({ alg: "HS256", typ: "JWT" }) + "." + b64url({ sub: UID, aud: "authenticated", role: "authenticated", exp: now + 86400, iat: now, email: "audit@example.invalid", session_id: "s1" }) + ".sig";
  return JSON.stringify({ access_token: jwt, refresh_token: "rt-audit", token_type: "bearer", expires_in: 86400, expires_at: now + 86400,
    user: { id: UID, aud: "authenticated", role: "authenticated", email: "audit@example.invalid", app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date().toISOString() } });
}

// ── Faux Supabase (côté Node, via page.route) ─────────────────────────────
// mode REST : ok | 500 | 401 | 429 | malformed | slow | abort
async function armer(page, opts = {}) {
  const log = { req: [], ws: 0, mode: opts.mode || "ok", storage: opts.storage || "ok", auth: opts.auth || "ok", fn: opts.fn || "abort", delais: opts.delais || {} };
  page.__log = log;
  const pks = { conv_messages: new Set(), posts: new Set() };
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: SDK }));
  await page.route((u) => u.hostname === SUPA_HOST, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const m = req.method();
    const p = u.pathname;
    const entree = { t: Date.now(), m, p: p + (u.search ? "?" + u.search.slice(0, 60) : "") };
    log.req.push(entree);
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    const H = { "access-control-allow-origin": "*", "content-type": "application/json" };
    const json = (status, body, extra) => route.fulfill({ status, headers: Object.assign({}, H, extra || {}), body: typeof body === "string" ? body : JSON.stringify(body) });
    // ── Edge Functions
    if (p.startsWith("/functions/v1/")) {
      if (log.fn === "abort") return route.abort("connectionfailed");
      return json(200, { text: "réponse IA factice" });
    }
    // ── Storage
    if (p.startsWith("/storage/v1/")) {
      if (log.storage === "abort") return route.abort("connectionfailed");
      if (m === "POST" || m === "PUT") return json(200, { Key: "content/x", Id: "x" });
      return json(200, "");
    }
    // ── Auth
    if (p.startsWith("/auth/v1/")) {
      if (log.auth === "abort") return route.abort("connectionfailed");
      if (p.endsWith("/token")) return json(400, { error: "invalid_grant", error_description: "Invalid login credentials", msg: "Invalid login credentials" });
      if (p.endsWith("/logout")) return json(204, "");
      return json(200, {});
    }
    // ── REST
    if (p.startsWith("/rest/v1/")) {
      const table = p.split("/")[3] || "";
      entree.table = table;
      const mode = (log.modeParTable && log.modeParTable[table]) || log.mode;
      const delai = log.delais[table] || 0;
      if (delai) await new Promise((r) => setTimeout(r, delai));
      if (mode === "abort") return route.abort("connectionfailed");
      if (mode === "500") return json(500, { message: "internal error (chaos)", code: "XX000" });
      if (mode === "401") return json(401, { message: "JWT expired", code: "PGRST301" });
      if (mode === "429") return json(429, { message: "rate limited (chaos)" });
      if (mode === "malformed") return route.fulfill({ status: 200, headers: H, body: "{\"pas du json" });
      if (mode === "slow") { await new Promise((r) => setTimeout(r, 20000)); return json(200, []); }
      let body = null;
      try { body = req.postDataJSON(); } catch (e) { body = null; }
      if (m === "GET" || m === "HEAD") return json(200, [], { "content-range": "*/0" });
      if (m === "POST") {
        const rows = Array.isArray(body) ? body : (body ? [body] : []);
        if (pks[table]) {
          for (const r of rows) {
            if (r && r.id && pks[table].has(r.id)) {
              entree.dup = true;
              return json(409, { code: "23505", message: "duplicate key value violates unique constraint \"" + table + "_pkey\"", details: "Key (id)=(" + r.id + ") already exists.", hint: null });
            }
          }
          rows.forEach((r) => { if (r && r.id) pks[table].add(r.id); });
        }
        const out = rows.map((r) => Object.assign({ updated_at: new Date().toISOString() }, r));
        return json(201, out);
      }
      if (m === "PATCH") return json(200, []);           // 0 ligne touchée (comme une ligne absente)
      if (m === "DELETE") return json(200, [{ id: "x" }]);
      return json(200, []);
    }
    return route.abort("connectionfailed");
  });
  await page.routeWebSocket(/realtime\/v1\/websocket/, () => { log.ws++; });
  // Services tiers : coupés par défaut (le bac à sable n'y accède pas de toute façon).
  await page.route(/(tiles\.openfreemap\.org|unpkg\.com|api-adresse\.data\.gouv\.fr|photon\.komoot\.io|api\.giphy\.com|tenor\.googleapis\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|images\.unsplash\.com|media\.giphy\.com|picsum\.photos)/, (r) => r.abort("connectionfailed"));
  return log;
}

function compter(log, table, methodes, depuis) {
  return log.req.filter((r) => r.table === table && (!methodes || methodes.includes(r.m)) && (!depuis || r.t >= depuis)).length;
}
function resume(log, depuis) {
  const out = {};
  log.req.filter((r) => !depuis || r.t >= depuis).forEach((r) => { const k = r.m + " " + (r.table || r.p.split("?")[0]); out[k] = (out[k] || 0) + 1; });
  return out;
}

async function booter(page, opts = {}) {
  const errors = { js: [], console: [] };
  page.on("pageerror", (e) => errors.js.push(String(e && e.message)));
  page.on("console", (m) => { if (m.type() === "error") errors.console.push(m.text().slice(0, 200)); });
  const st = opts.state || onboardedState(opts.nProfiles || 2);
  await page.addInitScript(([k, t, st, jeton, uid, extra, perms]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    if (st && !localStorage.getItem("passio_mvp_state_v1")) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
    if (jeton) { localStorage.setItem("sb-njkiyoklssvefstljemx-auth-token", jeton); localStorage.setItem("passio_uid", uid); }
    if (extra) Object.keys(extra).forEach((c) => localStorage.setItem(c, extra[c]));
    if (perms) {
      const refus = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
      try { Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: refus, enumerateDevices: () => Promise.resolve([]) }, configurable: true }); } catch (e) {}
      try { navigator.geolocation.getCurrentPosition = (ok, ko) => { setTimeout(() => ko && ko({ code: 1, message: "User denied Geolocation" }), 10); }; } catch (e) {}
      try { navigator.geolocation.watchPosition = (ok, ko) => { setTimeout(() => ko && ko({ code: 1, message: "User denied Geolocation" }), 10); return 1; }; } catch (e) {}
      try { Object.defineProperty(Notification, "permission", { get: () => "denied", configurable: true }); Notification.requestPermission = () => Promise.resolve("denied"); } catch (e) {}
    }
  }, [GATE_KEY, GATE_TOKEN, st, opts.session ? fauxJeton() : null, UID, opts.extra || null, !!opts.perms]);
  await page.goto("/index.html");
  if (!opts.sansAttente) {
    await page.waitForFunction(() => { const el = document.getElementById("screen-feed"); return el && el.classList.contains("active"); }, null, { timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const l = document.getElementById("landing"); if (l) l.classList.remove("active");
      window.__toasts = [];
      const o = window.toast;
      window.toast = function (m, t) { window.__toasts.push(String(m)); try { return o.apply(this, arguments); } catch (e) {} };
    });
  }
  return errors;
}

// Fixtures injectées dans l'état vivant
async function semerPostServeur(page, id) {
  await page.evaluate((id) => {
    state.seed.posts = []; window._feedExtraPosts = []; state.supabasePosts = [];
    state.supabasePosts.unshift({ id, authorId: "u_autre", fromSupabase: true, passion: "musique", text: "Publication serveur " + id, createdAt: Date.now(), likes: 0, comments: [], type: "text", mood: "all", authorName: "Autre", authorEmoji: "🎸", authorColor: "#333" });
    window._feedRefreshSig = null; window._feedDomSig = null; window._lastHtml = null;
    goTo("feed"); renderFeed();
  }, id);
  await page.waitForTimeout(600);
}
async function semerEvenement(page, id) {
  await page.evaluate((id) => {
    state.seed.events = state.seed.events || [];
    state.seed.events.push({ id, title: "Rencontre test", date: Date.now() + 86400000, passion: "musique", organizerId: "u_autre", authorId: "u_autre", fromSupabase: true, attendees: [], maybes: [], waitlist: [], city: "Paris", lat: 48.85, lng: 2.35, status: "active" });
    saveState();
  }, id);
}
async function semerConversation(page, id) {
  await page.evaluate((id) => {
    conversationsState = (typeof getConversations === "function" ? getConversations() : []) || [];
    conversationsState.push({ id, userId: "u_autre", userName: "Autre", messages: [{ id: "m0_" + id, from: "them", at: Date.now() - 60000, text: "salut" }] });
    saveConversationsNow();
  }, id);
}

test.describe("Chaos PASSIO — audit robustesse-pannes", () => {
  test.beforeAll(() => { try { fs.unlinkSync(OBS); } catch (e) {} });

  // ───────────────────────── (a) DOUBLES CLICS ─────────────────────────
  test("A1 double clic J'aime", async ({ page }) => {
    const log = await armer(page);
    const errors = await booter(page, { session: true });
    await semerPostServeur(page, "p_dc_like");
    const btn = page.locator('[data-action="like"][onclick*="p_dc_like"]').first();
    await btn.scrollIntoViewIfNeeded();
    const t0 = Date.now();
    await btn.dblclick();
    await page.waitForTimeout(1500);
    const etat = await page.evaluate(() => {
      const p = findPostAnywhere("p_dc_like");
      return { likes: p && p.likes, liked: state.user.likedPosts.includes("p_dc_like"), toasts: window.__toasts.slice() };
    });
    const ecritures = { post_likes: resume({ req: log.req.filter((r) => r.table === "post_likes") }, t0), notifications: compter(log, "notifications", ["POST"], t0) };
    // Puis deux clics ESPACÉS de 1 s (> fenêtre anti-double-clic 800 ms)
    const t1 = Date.now();
    await btn.click(); await page.waitForTimeout(1000); await btn.click(); await page.waitForTimeout(1500);
    const etat2 = await page.evaluate(() => { const p = findPostAnywhere("p_dc_like"); return { likes: p && p.likes, liked: state.user.likedPosts.includes("p_dc_like") }; });
    noter("A1_like", { dblclick: { ecritures, etat }, deux_clics_1s: { ecritures: resume({ req: log.req.filter((r) => r.table === "post_likes") }, t1), etat: etat2 }, js: errors.js });
  });

  test("A2 double appel RSVP (deux taps simultanés)", async ({ page }) => {
    const log = await armer(page);
    const errors = await booter(page, { session: true });
    await semerEvenement(page, "ev_dc");
    const t0 = Date.now();
    const r = await page.evaluate(async () => {
      await Promise.all([setEventRsvp("ev_dc", "going"), setEventRsvp("ev_dc", "going")]);
      const ev = _findCanonicalEvent("ev_dc");
      return { attendees: ev.attendees, rsvp: myRsvp("ev_dc"), joined: state.user.joinedEvents, toasts: window.__toasts.slice() };
    });
    await page.waitForTimeout(1500);
    // Puis via la feuille RSVP : ouverture + double clic sur « Je viens »
    await page.evaluate(() => { _setMyRsvpLocal("ev_dc", null); const ev = _findCanonicalEvent("ev_dc"); ev.attendees = []; saveState(); openEventRsvpSheet("ev_dc"); });
    await page.waitForTimeout(400);
    const t1 = Date.now();
    let feuille = null;
    try {
      const b = page.locator('button[onclick*="setEventRsvp(\'ev_dc\', \'going\')"]').first();
      await b.dblclick({ timeout: 5000 });
      await page.waitForTimeout(1500);
      feuille = await page.evaluate(() => ({ attendees: _findCanonicalEvent("ev_dc").attendees, rsvp: myRsvp("ev_dc") }));
    } catch (e) { feuille = { erreur: String(e.message).slice(0, 120) }; }
    noter("A2_rsvp", { concurrent: { ecritures: resume({ req: log.req.filter((r) => r.table === "event_attendees") }, t0), etat: r }, feuille_dblclick: { ecritures: resume({ req: log.req.filter((r) => r.table === "event_attendees") }, t1), etat: feuille }, js: errors.js });
  });

  test("A3 double clic Publier (Studio)", async ({ page }) => {
    const log = await armer(page);
    const errors = await booter(page, { session: true });
    await page.evaluate(() => { goTo("studio"); });
    await page.waitForTimeout(800);
    await page.evaluate(() => { const t = document.getElementById("postText"); t.value = "Texte publié deux fois ?"; const s = document.getElementById("postPassion"); if (s && ![...s.options].some((o) => o.value === "musique")) { const o = document.createElement("option"); o.value = "musique"; s.appendChild(o); } if (s) s.value = "musique"; });
    const t0 = Date.now();
    const btn = page.locator('button[onclick="publishPost()"]').first();
    await btn.dblclick();
    await page.waitForTimeout(7000);
    const etat = await page.evaluate(() => ({ userPosts: state.userPosts.map((p) => ({ id: p.id, text: p.text, sync: p.syncStatus })), toasts: window.__toasts.slice() }));
    noter("A3_publier", { ecritures: resume(log, t0), etat, js: errors.js });
  });

  test("A4 double clic Envoyer (message)", async ({ page }) => {
    const log = await armer(page);
    const errors = await booter(page, { session: true });
    await semerConversation(page, "conv_dc");
    await page.evaluate(() => openConversation("conv_dc"));
    await page.waitForTimeout(1200);
    await page.fill("#convFpInput", "message envoyé deux fois ?");
    const t0 = Date.now();
    await page.locator("#convFpSendBtn").dblclick();
    await page.waitForTimeout(2500);
    const etat = await page.evaluate(() => { const c = getConversations().find((x) => x.id === "conv_dc"); return { messages: c.messages.filter((m) => m.from === "me").map((m) => ({ id: m.id, text: m.text, status: m.status })), outbox: _outboxLoad().length, toasts: window.__toasts.slice() }; });
    noter("A4_envoyer", { ecritures: resume(log, t0), etat, js: errors.js });
  });

  test("A5/A6 double tap Suivre et Bloquer", async ({ page }) => {
    const log = await armer(page);
    const errors = await booter(page, { session: true });
    const t0 = Date.now();
    const suivre = await page.evaluate(async () => {
      const b = document.createElement("button"); b.setAttribute("data-follow-uid", "u_autre"); b.id = "followBtn_u_autre"; b.textContent = "Suivre"; document.body.appendChild(b);
      toggleFollowUser("u_autre", "Autre"); toggleFollowUser("u_autre", "Autre");
      await new Promise((r) => setTimeout(r, 1500));
      return { following: state.user.following, bouton: b.textContent, toasts: window.__toasts.slice() };
    });
    const ecrSuivre = resume(log, t0);
    const t1 = Date.now();
    const bloquer = await page.evaluate(async () => {
      window.__toasts = [];
      blockUser("u_autre", "Autre"); blockUser("u_autre", "Autre");
      await new Promise((r) => setTimeout(r, 1500));
      return { blocked: state.user.blocked, toasts: window.__toasts.slice() };
    });
    noter("A5_suivre", { ecritures: ecrSuivre, etat: suivre, js: errors.js });
    noter("A6_bloquer", { ecritures: resume(log, t1), etat: bloquer });
  });

  // ───────────────────────── (b) ACTIONS SIMULTANÉES ─────────────────────────
  test("B1 publier pendant un envoi de message (insert conv_messages retardé 3 s)", async ({ page }) => {
    const log = await armer(page, { delais: { conv_messages: 3000 } });
    const errors = await booter(page, { session: true });
    await semerConversation(page, "conv_b1");
    await page.evaluate(() => openConversation("conv_b1"));
    await page.waitForTimeout(1000);
    await page.fill("#convFpInput", "message lent");
    const t0 = Date.now();
    await page.locator("#convFpSendBtn").click();
    await page.waitForTimeout(200);
    await page.evaluate(async () => { goTo("studio"); await new Promise((r) => setTimeout(r, 300)); const t = document.getElementById("postText"); t.value = "post pendant l'envoi"; const s = document.getElementById("postPassion"); if (s) { if (![...s.options].some((o) => o.value === "musique")) { const o = document.createElement("option"); o.value = "musique"; s.appendChild(o); } s.value = "musique"; } publishPost(); });
    await page.waitForTimeout(6000);
    const etat = await page.evaluate(() => { const c = getConversations().find((x) => x.id === "conv_b1"); return { msg: c.messages.filter((m) => m.from === "me").map((m) => ({ status: m.status })), posts: state.userPosts.map((p) => ({ id: p.id, authorId: p.authorId })), toasts: window.__toasts.slice() }; });
    const corps = log.req.filter((r) => r.t >= t0 && r.m === "POST" && (r.table === "posts" || r.table === "conv_messages")).map((r) => r.table);
    noter("B1_simultane", { ecritures: resume(log, t0), ordre: corps, etat, js: errors.js });
  });

  test("B2 changement de profil PENDANT la rédaction au Studio → quelle passion part ?", async ({ page }) => {
    const log = await armer(page);
    const errors = await booter(page, { session: true, nProfiles: 2 });
    const r = await page.evaluate(async () => {
      goTo("studio"); await new Promise((r) => setTimeout(r, 400));
      const t = document.getElementById("postText"); t.value = "rédigé sous musique";
      const s = document.getElementById("postPassion");
      const avant = { select: s && s.value, options: s ? [...s.options].map((o) => o.value) : null, profil: state.user.currentProfileId };
      switchToProfile("pp_1"); // sport
      await new Promise((r) => setTimeout(r, 400));
      const s2 = document.getElementById("postPassion");
      const apres = { select: s2 && s2.value, profil: state.user.currentProfileId, texte: document.getElementById("postText").value, studioActif: document.getElementById("screen-studio").classList.contains("active") };
      return { avant, apres };
    });
    const t0 = Date.now();
    await page.evaluate(() => { const s = document.getElementById("postPassion"); if (s && !s.value) s.value = s.options[0] && s.options[0].value; publishPost(); });
    await page.waitForTimeout(6000);
    const corps = await page.evaluate(() => state.userPosts.map((p) => ({ passion: p.passion, profileId: p.profileId, authorId: p.authorId })));
    const post = log.req.filter((r) => r.t >= t0 && r.table === "posts" && r.m === "POST");
    noter("B2_switch_studio", { r, postLocal: corps, insertPosts: post.length, js: errors.js });
  });

  test("B3 changement de profil pendant une conversation ouverte → quelle identité part ?", async ({ page }) => {
    const log = await armer(page);
    const errors = await booter(page, { session: true, nProfiles: 2 });
    await semerConversation(page, "conv_b3");
    await page.evaluate(() => openConversation("conv_b3"));
    await page.waitForTimeout(1000);
    await page.evaluate(() => { switchToProfile("pp_1"); });
    await page.waitForTimeout(500);
    const ouvert = await page.evaluate(() => ({ convOuverte: window._openedConvId, fpActive: !!(document.getElementById("conv-fullpage") && document.getElementById("conv-fullpage").classList.contains("active")) }));
    await page.fill("#convFpInput", "après bascule").catch(() => {});
    const t0 = Date.now();
    await page.evaluate(() => sendMessageFp("conv_b3", "Autre"));
    await page.waitForTimeout(2000);
    const ins = log.req.filter((r) => r.t >= t0 && r.table === "conv_messages" && r.m === "POST");
    let corps = null;
    try { corps = await page.evaluate(() => { const c = getConversations().find((x) => x.id === "conv_b3"); const m = c.messages.filter((x) => x.from === "me").pop(); return { status: m && m.status, meta: _withSenderMeta("x") }; }); } catch (e) { corps = String(e.message).slice(0, 100); }
    noter("B3_switch_conv", { ouvert, inserts: ins.length, corps, js: errors.js });
  });

  // ───────────────────────── (c) PERTE DE RÉSEAU ─────────────────────────
  test("C1 réseau coupé pendant le chargement du fil", async ({ page }) => {
    const log = await armer(page);
    const errors = await booter(page, { session: true });
    await page.context().setOffline(true);
    log.mode = "abort";
    const r = await page.evaluate(async () => {
      window.__toasts = [];
      const posts = await supaLoadPosts().catch((e) => "throw:" + e.message);
      await new Promise((r) => setTimeout(r, 800));
      const b = document.getElementById("offlineBanner");
      return { retour: Array.isArray(posts) ? "tableau " + posts.length : String(posts), banniere: b && b.style.display, banniereTexte: b && b.innerText.trim().slice(0, 80), onLine: navigator.onLine, cartes: document.querySelectorAll("#feedList .post-card, #feedList [data-post-id], #feedList .post").length, toasts: window.__toasts.slice() };
    });
    await page.context().setOffline(false);
    log.mode = "ok";
    await page.waitForTimeout(1500);
    const apres = await page.evaluate(() => ({ banniere: document.getElementById("offlineBanner").style.display, toasts: window.__toasts.slice() }));
    noter("C1_fil_offline", { pendant: r, apres, js: errors.js });
  });

  test("C2 message hors ligne → reprise → idempotence (double flush, 409)", async ({ page }) => {
    const log = await armer(page);
    const errors = await booter(page, { session: true });
    await semerConversation(page, "conv_c2");
    await page.evaluate(() => openConversation("conv_c2"));
    await page.waitForTimeout(1000);
    await page.context().setOffline(true);
    log.mode = "abort";
    await page.fill("#convFpInput", "envoyé hors ligne");
    await page.locator("#convFpSendBtn").click();
    await page.waitForTimeout(1500);
    const horsLigne = await page.evaluate(() => { const c = getConversations().find((x) => x.id === "conv_c2"); const m = c.messages.filter((x) => x.from === "me").pop(); return { status: m.status, indicateur: (document.querySelector('#convFpThread [data-msgst="' + m.id + '"]') || {}).textContent, outbox: _outboxLoad().map((x) => x.msgId), toasts: window.__toasts.slice() }; });
    const t0 = Date.now();
    await page.context().setOffline(false);
    log.mode = "ok";
    await page.waitForTimeout(3000);
    const reprise = await page.evaluate(() => { const c = getConversations().find((x) => x.id === "conv_c2"); const m = c.messages.filter((x) => x.from === "me").pop(); return { id: m.id, status: m.status, outbox: _outboxLoad().length, toasts: window.__toasts.slice() }; });
    const envoisReprise = log.req.filter((r) => r.t >= t0 && r.table === "conv_messages" && r.m === "POST").map((r) => ({ dup: !!r.dup }));
    // Double flush : le même message en file, deux flushs concurrents (online + boot 1,5 s, ou online + « réessayer »)
    const t1 = Date.now();
    const doubleFlush = await page.evaluate(async () => {
      const c = getConversations().find((x) => x.id === "conv_c2");
      const msgId = "msg_dbl_" + Date.now();
      c.messages.push({ id: msgId, from: "me", text: "double flush", at: Date.now(), status: "failed" });
      _outboxAdd("conv_c2", msgId, _withSenderMeta("double flush"));
      _flushOutbox(); _flushOutbox();
      await new Promise((r) => setTimeout(r, 2500));
      const m = c.messages.find((x) => x.id === msgId);
      return { msgId, status: m.status, outbox: _outboxLoad().map((x) => x.msgId), indicateur: (document.querySelector('#convFpThread [data-msgst="' + msgId + '"]') || {}).textContent };
    });
    const envoisDbl = log.req.filter((r) => r.t >= t1 && r.table === "conv_messages" && r.m === "POST").map((r) => ({ dup: !!r.dup }));
    // Et un troisième flush (ex. prochain retour en ligne) : la file se vide-t-elle ?
    const t2 = Date.now();
    const troisieme = await page.evaluate(async () => { _flushOutbox(); await new Promise((r) => setTimeout(r, 2000)); const c = getConversations().find((x) => x.id === "conv_c2"); const m = c.messages.find((x) => x.text === "double flush"); return { status: m && m.status, outbox: _outboxLoad().length }; });
    const envois3 = log.req.filter((r) => r.t >= t2 && r.table === "conv_messages" && r.m === "POST").map((r) => ({ dup: !!r.dup }));
    noter("C2_message_offline", { horsLigne, reprise, envoisReprise, doubleFlush, envoisDbl, troisiemeFlush: troisieme, envois3, js: errors.js });
  });

  test("C3 publication hors ligne → reprise ? → rechargement ?", async ({ page }) => {
    const log = await armer(page);
    const errors = await booter(page, { session: true });
    await page.context().setOffline(true);
    log.mode = "abort";
    await page.evaluate(async () => { goTo("studio"); await new Promise((r) => setTimeout(r, 300)); document.getElementById("postText").value = "publié hors ligne"; const s = document.getElementById("postPassion"); if (s) { if (![...s.options].some((o) => o.value === "musique")) { const o = document.createElement("option"); o.value = "musique"; s.appendChild(o); } s.value = "musique"; } publishPost(); });
    await page.waitForTimeout(8000);
    const horsLigne = await page.evaluate(() => ({ posts: state.userPosts.map((p) => ({ id: p.id, sync: p.syncStatus, pending: p._pendingSync })), toasts: window.__toasts.slice(), etiquette: (document.querySelector("#feedList") || {}).innerText && /Sync…|Local|En ligne/.exec(document.querySelector("#feedList").innerText) })).catch((e) => String(e.message));
    const t0 = Date.now();
    await page.context().setOffline(false);
    log.mode = "ok";
    await page.waitForTimeout(8000);
    const apresOnline = { insertsPosts: compter(log, "posts", ["POST"], t0), toutes: resume(log, t0) };
    const t1 = Date.now();
    await page.reload();
    await page.waitForFunction(() => document.getElementById("screen-feed") && document.getElementById("screen-feed").classList.contains("active"), null, { timeout: 30000 });
    await page.waitForTimeout(6000);
    const apresReload = { insertsPosts: compter(log, "posts", ["POST"], t1), postsLocaux: await page.evaluate(() => state.userPosts.map((p) => ({ id: p.id, sync: p.syncStatus }))) };
    noter("C3_publication_offline", { horsLigne, apresOnline, apresReload, js: errors.js });
  });

  test("C4 RSVP hors ligne", async ({ page }) => {
    const log = await armer(page);
    const errors = await booter(page, { session: true });
    await semerEvenement(page, "ev_c4");
    await page.context().setOffline(true);
    log.mode = "abort";
    const t0 = Date.now();
    const r = await page.evaluate(async () => { window.__toasts = []; await setEventRsvp("ev_c4", "going"); await new Promise((r) => setTimeout(r, 1500)); return { rsvp: myRsvp("ev_c4"), attendees: _findCanonicalEvent("ev_c4").attendees, toasts: window.__toasts.slice(), notifs: (state.notifications || []).slice(-1).map((n) => (n.text || n.html || "").slice(0, 60)) }; });
    const tentatives = resume(log, t0);
    await page.context().setOffline(false);
    log.mode = "ok";
    const t1 = Date.now();
    await page.waitForTimeout(6000);
    const reprise = resume({ req: log.req.filter((r) => r.table === "event_attendees") }, t1);
    noter("C4_rsvp_offline", { pendant: r, tentatives, repriseAutomatique: reprise, js: errors.js });
  });

  test("C5 changement de passion hors ligne (user_state)", async ({ page }) => {
    const log = await armer(page);
    const errors = await booter(page, { session: true, nProfiles: 1 });
    await page.waitForTimeout(3000);
    await page.context().setOffline(true);
    log.mode = "abort";
    const t0 = Date.now();
    const r = await page.evaluate(async () => { window.__toasts = []; state.user.profiles.push({ id: "pp_new", name: "Audit QA", passion: "cuisine", emoji: "🍳", color: "#7c3aed", createdAt: Date.now() }); saveState(); await new Promise((r) => setTimeout(r, 4000)); return { pending: Object.keys(localStorage).filter((k) => k.indexOf("passio_pending_user_state") === 0), toasts: window.__toasts.slice() }; });
    const tentatives = resume(log, t0);
    await page.context().setOffline(false);
    log.mode = "ok";
    const t1 = Date.now();
    await page.waitForTimeout(6000);
    const apresOnline = resume({ req: log.req.filter((r) => r.table === "user_state") }, t1);
    const t2 = Date.now();
    await page.reload();
    await page.waitForFunction(() => document.getElementById("screen-feed") && document.getElementById("screen-feed").classList.contains("active"), null, { timeout: 30000 });
    await page.waitForTimeout(6000);
    const apresReload = { user_state: resume({ req: log.req.filter((r) => r.table === "user_state") }, t2), pending: await page.evaluate(() => Object.keys(localStorage).filter((k) => k.indexOf("passio_pending_user_state") === 0)) };
    noter("C5_passion_offline", { pendant: r, tentatives, apresOnline, apresReload, js: errors.js });
  });

  // ───────────────────────── (d) REPRISE APRÈS RECHARGEMENT ─────────────────────────
  test("D reprise après rechargement d'une file (outbox message + user_state en attente)", async ({ page }) => {
    const log = await armer(page);
    const errors = await booter(page, { session: true });
    await semerConversation(page, "conv_d");
    await page.evaluate(() => {
      _outboxAdd("conv_d", "msg_d_1", _withSenderMeta("en file avant reload"));
      const c = getConversations().find((x) => x.id === "conv_d"); c.messages.push({ id: "msg_d_1", from: "me", text: "en file avant reload", at: Date.now(), status: "failed" }); saveConversationsNow();
      localStorage.setItem("passio_pending_user_state:" + MY_UID, JSON.stringify({ user_id: MY_UID, data: _syncableState(), updated_at: new Date().toISOString() }));
    });
    const cles = await page.evaluate(() => Object.keys(localStorage).filter((k) => /outbox|pending/.test(k)));
    const t0 = Date.now();
    await page.reload();
    await page.waitForFunction(() => document.getElementById("screen-feed") && document.getElementById("screen-feed").classList.contains("active"), null, { timeout: 30000 });
    await page.waitForTimeout(7000);
    const apres = await page.evaluate(() => { const c = getConversations().find((x) => x.id === "conv_d"); const m = c && c.messages.find((x) => x.id === "msg_d_1"); return { status: m && m.status, outbox: _outboxLoad().length, pending: Object.keys(localStorage).filter((k) => k.indexOf("passio_pending_user_state") === 0), idb: !!window.idbConvLoad }; });
    noter("D_reload_file", { clesAvant: cles, ecritures: resume(log, t0), apres, js: errors.js });
  });

  // ───────────────────────── (e) PERMISSIONS REFUSÉES ─────────────────────────
  test("E permissions refusées : micro (vocal), caméra (bobine), géoloc (Ma ville), push", async ({ page }) => {
    const log = await armer(page);
    const errors = await booter(page, { session: true, perms: true });
    const r = await page.evaluate(async () => {
      const out = {};
      window.__toasts = []; goTo("studio"); await new Promise((r) => setTimeout(r, 300));
      try { await toggleRecording(); } catch (e) { out.vocalErr = e.message; }
      await new Promise((r) => setTimeout(r, 600));
      out.vocal = { toasts: window.__toasts.slice(), statut: (document.getElementById("recStatus") || {}).textContent };
      window.__toasts = [];
      try { meOpen("studio"); } catch (e) { out.cameraErr = e.message; }
      await new Promise((r) => setTimeout(r, 1200));
      out.camera = { toasts: window.__toasts.slice(), overlay: !!document.querySelector("#meOverlay.active, #meOverlay[style*='flex'], .me-overlay.active") };
      try { if (typeof meClose === "function") meClose(); } catch (e) {}
      window.__toasts = []; goTo("irl"); await new Promise((r) => setTimeout(r, 300));
      try { requestUserLocation(); } catch (e) { out.geoErr = e.message; }
      await new Promise((r) => setTimeout(r, 1200));
      out.geoloc = { toasts: window.__toasts.slice(), titre: (document.getElementById("irlUserCityName") || {}).textContent, erreurFlag: typeof irlUserLocationError !== "undefined" ? irlUserLocationError : "n/a", pos: typeof irlUserLocation !== "undefined" ? irlUserLocation : null };
      window.__toasts = [];
      try { await requestCallNotifications(); } catch (e) { out.pushErr = e.message; }
      out.push = { toasts: window.__toasts.slice(), permission: Notification.permission };
      return out;
    });
    noter("E_permissions", Object.assign(r, { js: errors.js, consoleErr: errors.console.slice(0, 5) }));
  });

  // ───────────────────────── (f) RÉPONSES HOSTILES DE L'API ─────────────────────────
  for (const mode of ["500", "401", "429", "malformed", "slow"]) {
    test("F API hostile au boot puis 30 s : rest/v1 → " + mode, async ({ page }) => {
      test.setTimeout(150000);
      const log = await armer(page, { mode });
      const t0 = Date.now();
      const errors = await booter(page, { session: true, sansAttente: true });
      let feedActif = false;
      try { await page.waitForFunction(() => document.getElementById("screen-feed") && document.getElementById("screen-feed").classList.contains("active"), null, { timeout: 40000 }); feedActif = true; } catch (e) {}
      const tFeed = Date.now() - t0;
      await page.evaluate(() => { window.__toasts = []; const o = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); try { return o.apply(this, arguments); } catch (e) {} }; const l = document.getElementById("landing"); if (l) l.classList.remove("active"); }).catch(() => {});
      const tMesure = Date.now();
      await page.waitForTimeout(30000);
      const req30 = log.req.filter((r) => r.t >= tMesure);
      const parTable = {};
      req30.forEach((r) => { const k = r.m + " " + (r.table || r.p); parTable[k] = (parTable[k] || 0) + 1; });
      let ecrans = null;
      try {
        ecrans = await page.evaluate(async () => { const out = []; for (const s of ["profiles", "explore", "irl", "messages", "feed"]) { try { goTo(s); await new Promise((r) => setTimeout(r, 300)); out.push(s + ":" + (document.getElementById("screen-" + s) && document.getElementById("screen-" + s).classList.contains("active"))); } catch (e) { out.push(s + ":ERR " + e.message); } } return out; });
      } catch (e) { ecrans = "evaluate KO: " + e.message; }
      const toasts = await page.evaluate(() => (window.__toasts || []).slice(0, 10)).catch(() => null);
      const total = log.req.length;
      noter("F_api_" + mode, { feedActif, tFeedMs: tFeed, requetesTotal: total, requetes30s: req30.length, parTable30s: parTable, ecrans, toasts, js: errors.js.slice(0, 8), banniere: await page.evaluate(() => document.getElementById("offlineBanner").style.display).catch(() => null) });
    });
  }

  // ───────────────────────── (3) SIMULATION DE PANNES ─────────────────────────
  test("G1 Supabase totalement injoignable — visiteur sans compte", async ({ page }) => {
    const log = await armer(page, { mode: "abort", storage: "abort", auth: "abort" });
    const t0 = Date.now();
    const errors = await booter(page, { state: null, sansAttente: true });
    let feedActif = false;
    try { await page.waitForFunction(() => document.getElementById("screen-feed") && document.getElementById("screen-feed").classList.contains("active"), null, { timeout: 40000 }); feedActif = true; } catch (e) {}
    await page.waitForTimeout(4000);
    const r = await page.evaluate(() => ({ cartes: document.querySelectorAll("#feedList .post-card, #feedList [data-post-id], #feedList .post").length, feedTexte: (document.getElementById("feedList") || {}).innerText && document.getElementById("feedList").innerText.slice(0, 120), invite: document.documentElement.className, banniere: document.getElementById("offlineBanner").style.display, supaReal: !!window._supaReal, etatCompte: window._etatCompteCharge })).catch((e) => String(e.message));
    await page.screenshot({ path: path.join(DIR, "cap-G1-visiteur-supabase-down.png"), fullPage: false });
    noter("G1_supabase_down_visiteur", { feedActif, tMs: Date.now() - t0, r, requetes: resume(log), js: errors.js.slice(0, 8) });
  });

  test("G2 Supabase totalement injoignable — compte connecté avec cache local", async ({ page }) => {
    const log = await armer(page, { mode: "abort", storage: "abort", auth: "abort" });
    const st = onboardedState(2);
    st.userPosts = [{ id: "p_local_1", authorId: UID, passion: "musique", text: "mon post en cache", createdAt: Date.now() - 3600000, likes: 2, comments: [], type: "text", mood: "all", authorName: "Audit QA", authorEmoji: "🎵", authorColor: "#7c3aed", _source: "me" }];
    const t0 = Date.now();
    const errors = await booter(page, { session: true, state: st, sansAttente: true, extra: { passio_conversations_v1: JSON.stringify([{ id: "conv_cache", userId: "u_autre", userName: "Autre", messages: [{ id: "m1", from: "them", at: Date.now() - 100000, text: "coucou en cache" }] }]) } });
    let feedActif = false;
    try { await page.waitForFunction(() => document.getElementById("screen-feed") && document.getElementById("screen-feed").classList.contains("active"), null, { timeout: 40000 }); feedActif = true; } catch (e) {}
    await page.waitForTimeout(5000);
    const r = await page.evaluate(async () => {
      const out = { cartes: document.querySelectorAll("#feedList .post-card, #feedList [data-post-id], #feedList .post").length, monPostVisible: (document.getElementById("feedList") || { innerText: "" }).innerText.indexOf("mon post en cache") !== -1, banniere: document.getElementById("offlineBanner").style.display, supaReal: !!window._supaReal, uid: MY_UID, onboarded: state.onboarded, restaurationRequise: localStorage.getItem("passio_restauration_requise"), peutPousser: window._peutPousserEtat && window._peutPousserEtat() };
      goTo("messages"); await new Promise((r) => setTimeout(r, 800));
      out.convs = getConversations().filter((c) => c.id === "conv_cache").length;
      out.messagesTexte = (document.getElementById("screen-messages") || { innerText: "" }).innerText.indexOf("coucou en cache") !== -1 || (document.getElementById("screen-messages") || { innerText: "" }).innerText.indexOf("Autre") !== -1;
      window.__toasts = [];
      goTo("feed");
      return out;
    }).catch((e) => String(e.message));
    // Connexion pendant la panne
    const login = await page.evaluate(async () => {
      try { const r = await supa.auth.signInWithPassword({ email: "x@example.invalid", password: "xxxxxxxx" }); return { error: r.error && (r.error.name + ": " + r.error.message).slice(0, 120) }; } catch (e) { return { throw: String(e.message).slice(0, 120) }; }
    }).catch((e) => String(e.message));
    await page.screenshot({ path: path.join(DIR, "cap-G2-compte-supabase-down.png"), fullPage: false });
    noter("G2_supabase_down_compte", { feedActif, tMs: Date.now() - t0, r, login, requetes: resume(log), js: errors.js.slice(0, 8) });
  });

  test("G3 connexion pendant une panne Auth (auth/v1 coupé) : message affiché ?", async ({ page }) => {
    const log = await armer(page, { auth: "abort" });
    const errors = await booter(page, { state: null });
    const r = await page.evaluate(async () => {
      try { PassioFirstRun && PassioFirstRun.allerConnexion && PassioFirstRun.allerConnexion(); } catch (e) {}
      await new Promise((r) => setTimeout(r, 600));
      try { if (typeof switchAuthTab === "function") switchAuthTab("signin"); } catch (e) {}
      const e = document.getElementById("authEmail"), p = document.getElementById("authPassword");
      if (!e || !p) return { formulaire: false };
      e.value = "audit@example.invalid"; p.value = "motdepasse123";
      try { await onbDoAuth(); } catch (err) { return { throw: err.message }; }
      await new Promise((r) => setTimeout(r, 1500));
      const msg = document.getElementById("authMsg");
      return { formulaire: true, message: msg && msg.textContent.trim().slice(0, 160), classe: msg && msg.className };
    }).catch((e) => String(e.message));
    noter("G3_auth_down_connexion", { r, requetes: resume(log), js: errors.js.slice(0, 5) });
  });

  test("H realtime seul coupé : tentatives WebSocket en 30 s, envoi de message toujours possible", async ({ page }) => {
    test.setTimeout(120000);
    const log = await armer(page);
    const errors = await booter(page, { session: true });
    const ws0 = log.ws;
    const t0 = Date.now();
    await page.waitForTimeout(30000);
    const wsTentatives = log.ws - ws0;
    await semerConversation(page, "conv_h");
    await page.evaluate(() => openConversation("conv_h"));
    await page.waitForTimeout(800);
    await page.fill("#convFpInput", "sans realtime");
    const t1 = Date.now();
    await page.locator("#convFpSendBtn").click();
    await page.waitForTimeout(2000);
    const st = await page.evaluate(() => { const c = getConversations().find((x) => x.id === "conv_h"); return c.messages.filter((m) => m.from === "me").pop().status; });
    const polling = await page.evaluate(() => ({ subscribed: !!window._supaSubscribed, canaux: (supa.getChannels ? supa.getChannels().map((c) => c.topic) : null) }));
    noter("H_realtime_coupe", { wsTentatives30s: wsTentatives, wsTotal: log.ws, envoi: { status: st, inserts: compter(log, "conv_messages", ["POST"], t1) }, polling, lecturesConvMessages30s: log.req.filter((r) => r.t >= t0 && r.t < t1 && r.table === "conv_messages" && r.m === "GET").length, js: errors.js.slice(0, 5) });
  });

  test("I storage coupé : image d'une publication", async ({ page }) => {
    const log = await armer(page, { storage: "abort" });
    const errors = await booter(page, { session: true });
    await page.evaluate(() => {
      state.seed.posts = []; window._feedExtraPosts = []; state.supabasePosts = [{ id: "p_img", authorId: "u_autre", fromSupabase: true, passion: "musique", text: "photo", createdAt: Date.now(), likes: 0, comments: [], type: "photo", mood: "all", authorName: "Autre", authorEmoji: "🎸", authorColor: "#333", image: "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/x.jpg" }];
      window._feedRefreshSig = null; window._feedDomSig = null; window._lastHtml = null; goTo("feed"); renderFeed();
    });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => { const img = document.querySelector('#feedList img[src*="storage/v1"]'); if (!img) return { img: false }; return { img: true, complete: img.complete, naturalWidth: img.naturalWidth, onerror: !!img.getAttribute("onerror"), hauteur: img.getBoundingClientRect().height, alt: img.alt, placeholder: !!img.closest(".post-media").querySelector(".media-fallback, .placeholder") }; });
    await page.screenshot({ path: path.join(DIR, "cap-I-storage-down.png") });
    noter("I_storage_coupe", { r, requetesStorage: log.req.filter((x) => x.p.startsWith("/storage")).length, js: errors.js.slice(0, 5) });
  });

  test("J cartographie coupée (unpkg + tuiles) : vue Carte et liste", async ({ page }) => {
    const log = await armer(page);
    const errors = await booter(page, { session: true });
    await semerEvenement(page, "ev_j");
    const r = await page.evaluate(async () => {
      window.__toasts = []; goTo("irl"); await new Promise((r) => setTimeout(r, 800));
      const out = { listeCartes: document.querySelectorAll("#eventList .event-card, #eventList [data-event-id], #eventList .irl-card").length, listeTexte: (document.getElementById("eventList") || { innerText: "" }).innerText.indexOf("Rencontre test") !== -1 };
      let mapErr = null;
      try { await window.ensureMapLibre(); } catch (e) { mapErr = String(e && e.message); }
      out.ensureMap = mapErr;
      try { initIrlMap(); } catch (e) { out.vueErr = e.message; }
      try { if (typeof _syncIrlMapPeek === "function") { const w = document.getElementById("irlMapWrap"); if (w) w.classList.remove("peek"); } } catch (e) {}
      await new Promise((r) => setTimeout(r, 2500));
      out.toasts = window.__toasts.slice();
      out.mapWrap = !!document.getElementById("irlMapWrap");
      out.mapWrapTexte = (document.getElementById("irlMap") || { innerText: "" }).innerText.slice(0, 160); out.fallback = !!document.querySelector("#irlMap .irl-map-fallback");
      out.mapSupported = window.passioMapSupported && window.passioMapSupported();
      return out;
    }).catch((e) => String(e.message));
    noter("J_carto_coupee", { r, js: errors.js.slice(0, 5) });
  });

  test("K géocodage coupé, L GIF coupé, M Edge Functions coupées", async ({ page }) => {
    const log = await armer(page, { fn: "abort" });
    const errors = await booter(page, { session: true });
    const r = await page.evaluate(async () => {
      const out = {};
      const t0 = Date.now();
      out.geoSuggest = await passioGeoSuggest("10 rue de la paix Paris", 5);
      out.geoLyon = await passioGeocode("Lyon");
      out.geoMs = Date.now() - t0;
      out.villeDico = typeof FRANCE_CITIES !== "undefined" ? FRANCE_CITIES["lyon"] : null;
      const t1 = Date.now();
      const gifs = await passioFetchGifs("", 5);
      out.gif = { n: gifs.length, ms: Date.now() - t1, secours: gifs[0] && gifs[0].indexOf("media.giphy.com") !== -1 };
      const t2 = Date.now();
      out.askAi = { retour: await _aiAskRemote("bonjour", 3000), ms: Date.now() - t2 };
      return out;
    }).catch((e) => String(e.message));
    noter("KLM_geocode_gif_edge", { r, requetesFn: log.req.filter((x) => x.p.startsWith("/functions")).length, js: errors.js.slice(0, 5) });
  });

  test("M2 suppression de compte avec Edge Function delete-account injoignable", async ({ page }) => {
    const log = await armer(page, { fn: "abort" });
    const errors = await booter(page, { session: true });
    const r = await page.evaluate(async () => {
      window.__toasts = [];
      window.confirm = () => true;
      openDeleteAccountConfirm(); await new Promise((r) => setTimeout(r, 300));
      const inp = document.getElementById("deleteConfirmInput"); if (!inp) return { formulaire: false };
      inp.value = "SUPPRIMER";
      const reloadAvant = location.reload; let reloadDemande = false; try { Object.defineProperty(window.location, "reload", { value: () => { reloadDemande = true; }, configurable: true }); } catch (e) {}
      try { await doDeleteAccount(); } catch (e) { return { throw: e.message }; }
      await new Promise((r) => setTimeout(r, 1800));
      return { fonction: "doDeleteAccount", toasts: window.__toasts.slice(), reloadDemande, jeton: !!localStorage.getItem("sb-njkiyoklssvefstljemx-auth-token"), etat: !!localStorage.getItem("passio_mvp_state_v1") };
    }).catch((e) => String(e.message));
    noter("M2_delete_account_edge_down", { r, requetes: resume(log), js: errors.js.slice(0, 5) });
  });
});
