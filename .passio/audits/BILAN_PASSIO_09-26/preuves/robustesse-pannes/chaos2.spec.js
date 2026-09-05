// Banc de chaos — complément (courses insert/delete, transfert double, jeton après 401).
// Même faux Supabase que chaos.spec.js, avec un ÉTAT serveur simulé pour follows et
// event_attendees afin d'observer l'ordre d'ARRIVÉE des écritures.
const { test } = require("/home/user/passio-app/node_modules/@playwright/test");
const fs = require("fs");
const path = require("path");
const { GATE_KEY, GATE_TOKEN } = require("/home/user/passio-app/tests/e2e/gate-helper");
const { onboardedState } = require("/home/user/passio-app/tests/e2e/app-helper");

const DIR = __dirname;
const OBS = path.join(DIR, "02b-chaos2-observations.jsonl");
const SDK = fs.readFileSync("/home/user/passio-app/dashboard/node_modules/@supabase/supabase-js/dist/umd/supabase.js", "utf8");
const SUPA_HOST = "njkiyoklssvefstljemx.supabase.co";
const UID = "11111111-2222-4333-8444-555555555555";
function noter(nom, obj) { const l = Object.assign({ scenario: nom, at: new Date().toISOString() }, obj); fs.appendFileSync(OBS, JSON.stringify(l) + "\n"); console.log("OBS " + nom + " → " + JSON.stringify(obj).slice(0, 900)); }
function b64url(o) { return Buffer.from(JSON.stringify(o)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function fauxJeton() {
  const now = Math.floor(Date.now() / 1000);
  const jwt = b64url({ alg: "HS256", typ: "JWT" }) + "." + b64url({ sub: UID, aud: "authenticated", role: "authenticated", exp: now + 86400, iat: now, email: "audit@example.invalid", session_id: "s1" }) + ".sig";
  return JSON.stringify({ access_token: jwt, refresh_token: "rt-audit", token_type: "bearer", expires_in: 86400, expires_at: now + 86400,
    user: { id: UID, aud: "authenticated", role: "authenticated", email: "audit@example.invalid", app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date().toISOString() } });
}

async function armer(page, opts = {}) {
  const log = { req: [], mode: opts.mode || "ok", delaisPost: opts.delaisPost || {}, serveur: { follows: new Set(), event_attendees: new Map(), conv_messages: new Set() }, auth: opts.auth || "ok", authHits: [] };
  page.__log = log;
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: SDK }));
  await page.route((u) => u.hostname === SUPA_HOST, async (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method(); const p = u.pathname;
    const entree = { t: Date.now(), m, p: p + (u.search ? "?" + u.search.slice(0, 80) : "") };
    log.req.push(entree);
    const H = { "access-control-allow-origin": "*", "content-type": "application/json" };
    const json = (status, body, extra) => route.fulfill({ status, headers: Object.assign({}, H, extra || {}), body: typeof body === "string" ? body : JSON.stringify(body) });
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/")) {
      log.authHits.push({ t: Date.now(), p, m, grant: u.searchParams.get("grant_type") });
      if (log.auth === "abort") return route.abort("connectionfailed");
      if (p.endsWith("/token")) return json(400, { error: "invalid_grant", error_description: "Invalid Refresh Token: Refresh Token Not Found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
      if (p.endsWith("/logout")) return json(204, "");
      return json(200, {});
    }
    if (p.startsWith("/storage/v1/") || p.startsWith("/functions/v1/")) return route.abort("connectionfailed");
    if (p.startsWith("/rest/v1/")) {
      const table = p.split("/")[3] || ""; entree.table = table;
      if (log.mode === "401") return json(401, { message: "JWT expired", code: "PGRST301" });
      let body = null; try { body = req.postDataJSON(); } catch (e) { body = null; }
      const S = log.serveur;
      if (m === "GET" || m === "HEAD") {
        if (table === "follows") return json(200, [...S.follows].map((id) => ({ following_id: id, follower_id: UID })));
        if (table === "event_attendees") return json(200, [...S.event_attendees.entries()].map(([k, v]) => ({ event_id: k, user_id: UID, rsvp: v })));
        return json(200, [], { "content-range": "*/0" });
      }
      if (m === "POST") {
        const delai = log.delaisPost[table] || 0; if (delai) await new Promise((r) => setTimeout(r, delai));
        entree.arrive = Date.now();
        const rows = Array.isArray(body) ? body : (body ? [body] : []);
        if (table === "follows") { const r = rows[0] || {}; if (S.follows.has(r.following_id)) return json(409, { code: "23505", message: "duplicate key value violates unique constraint" }); S.follows.add(r.following_id); entree.etatApres = [...S.follows]; return json(201, rows); }
        if (table === "event_attendees") { const r = rows[0] || {}; if (S.event_attendees.has(r.event_id)) return json(409, { code: "23505", message: "duplicate key value violates unique constraint" }); S.event_attendees.set(r.event_id, r.rsvp); entree.etatApres = [...S.event_attendees.entries()]; return json(201, rows); }
        if (table === "conv_messages") { const r = rows[0] || {}; if (S.conv_messages.has(r.id)) { entree.dup = true; return json(409, { code: "23505", message: "duplicate key value violates unique constraint \"conv_messages_pkey\"" }); } S.conv_messages.add(r.id); return json(201, rows); }
        return json(201, rows);
      }
      if (m === "PATCH") {
        if (table === "event_attendees") { const ev = u.searchParams.get("event_id"); const id = ev && ev.replace(/^eq\./, ""); if (id && S.event_attendees.has(id)) { S.event_attendees.set(id, (body || {}).rsvp); entree.etatApres = [...S.event_attendees.entries()]; return json(200, [{ event_id: id, rsvp: (body || {}).rsvp }]); } return json(200, []); }
        return json(200, []);
      }
      if (m === "DELETE") {
        entree.arrive = Date.now();
        if (table === "follows") { const f = u.searchParams.get("following_id"); const id = f && f.replace(/^eq\./, ""); const had = S.follows.delete(id); entree.etatApres = [...S.follows]; return json(200, had ? [{ following_id: id }] : []); }
        if (table === "event_attendees") { const ev = u.searchParams.get("event_id"); const id = ev && ev.replace(/^eq\./, ""); const had = S.event_attendees.delete(id); entree.etatApres = [...S.event_attendees.entries()]; return json(200, had ? [{ event_id: id }] : []); }
        return json(200, [{ id: "x" }]);
      }
      return json(200, []);
    }
    return route.abort("connectionfailed");
  });
  await page.routeWebSocket(/realtime\/v1\/websocket/, () => {});
  await page.route(/(tiles\.openfreemap\.org|unpkg\.com|api-adresse\.data\.gouv\.fr|photon\.komoot\.io|api\.giphy\.com|tenor\.googleapis\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|images\.unsplash\.com|media\.giphy\.com|picsum\.photos|loremflickr\.com|videos\.pexels\.com)/, (r) => r.abort("connectionfailed"));
  return log;
}
async function booter(page, opts = {}) {
  const errors = { js: [], console: [] };
  page.on("pageerror", (e) => errors.js.push(String(e && e.message)));
  const st = opts.state || onboardedState(2);
  await page.addInitScript(([k, t, st, jeton, uid]) => {
    sessionStorage.setItem(k, t); sessionStorage.setItem("passio_pwa_dismissed", "1");
    if (st && !localStorage.getItem("passio_mvp_state_v1")) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
    if (jeton) { localStorage.setItem("sb-njkiyoklssvefstljemx-auth-token", jeton); localStorage.setItem("passio_uid", uid); }
  }, [GATE_KEY, GATE_TOKEN, st, fauxJeton(), UID]);
  await page.goto("/index.html");
  await page.waitForFunction(() => { const el = document.getElementById("screen-feed"); return el && el.classList.contains("active"); }, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const l = document.getElementById("landing"); if (l) l.classList.remove("active"); window.__toasts = []; const o = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); try { return o.apply(this, arguments); } catch (e) {} }; });
  return errors;
}
async function semerConversation(page, id) {
  await page.evaluate((id) => { conversationsState = (typeof getConversations === "function" ? getConversations() : []) || []; conversationsState.push({ id, userId: "u_autre", userName: "Autre", messages: [{ id: "m0_" + id, from: "them", at: Date.now() - 60000, text: "salut" }] }); saveConversationsNow(); }, id);
}

test.describe("Chaos PASSIO — complément", () => {
  test.beforeAll(() => { try { fs.unlinkSync(OBS); } catch (e) {} });

  test("A7 Suivre : double tap avec INSERT lent (1,5 s) → l'état serveur diverge-t-il de l'écran ?", async ({ page }) => {
    const log = await armer(page, { delaisPost: { follows: 1500 } });
    const errors = await booter(page);
    const t0 = Date.now();
    const r = await page.evaluate(async () => {
      const b = document.createElement("button"); b.setAttribute("data-follow-uid", "u_autre"); b.id = "followBtn_u_autre"; b.textContent = "Suivre"; document.body.appendChild(b);
      toggleFollowUser("u_autre", "Autre"); await new Promise((r) => setTimeout(r, 150)); toggleFollowUser("u_autre", "Autre");
      await new Promise((r) => setTimeout(r, 4000));
      return { followingLocal: state.user.following, bouton: b.textContent, toasts: window.__toasts.slice() };
    });
    const ordre = log.req.filter((x) => x.t >= t0 && x.table === "follows" && x.m !== "OPTIONS").map((x) => ({ m: x.m, envoye: x.t - t0, arrive: x.arrive ? x.arrive - t0 : null, etatServeurApres: x.etatApres }));
    noter("A7_follow_course", { local: r, ordreServeur: ordre, serveurFinal: [...log.serveur.follows], notifsEnvoyees: log.req.filter((x) => x.t >= t0 && x.table === "notifications" && x.m === "POST").length, js: errors.js });
  });

  test("A8 RSVP carte : double tap toggleJoinEvent avec INSERT lent (1,5 s)", async ({ page }) => {
    const log = await armer(page, { delaisPost: { event_attendees: 1500 } });
    const errors = await booter(page);
    await page.evaluate(() => { state.seed.events = state.seed.events || []; state.seed.events.push({ id: "ev_a8", title: "Rencontre test", date: Date.now() + 86400000, passion: "musique", organizerId: "u_autre", authorId: "u_autre", fromSupabase: true, attendees: [], maybes: [], waitlist: [], city: "Paris", lat: 48.85, lng: 2.35, status: "active" }); saveState(); });
    const t0 = Date.now();
    const r = await page.evaluate(async () => {
      toggleJoinEvent("ev_a8"); await new Promise((r) => setTimeout(r, 150)); toggleJoinEvent("ev_a8");
      await new Promise((r) => setTimeout(r, 4500));
      return { rsvpLocal: myRsvp("ev_a8"), attendees: _findCanonicalEvent("ev_a8").attendees, toasts: window.__toasts.slice() };
    });
    const ordre = log.req.filter((x) => x.t >= t0 && x.table === "event_attendees").map((x) => ({ m: x.m, envoye: x.t - t0, arrive: x.arrive ? x.arrive - t0 : null, etatServeurApres: x.etatApres }));
    noter("A8_rsvp_course", { local: r, ordreServeur: ordre, serveurFinal: [...log.serveur.event_attendees.entries()], js: errors.js });
  });

  test("A9 Transférer : double clic sur la conversation cible", async ({ page }) => {
    const log = await armer(page);
    const errors = await booter(page);
    await semerConversation(page, "conv_src"); await semerConversation(page, "conv_cible");
    await page.evaluate(() => { const c = getConversations().find((x) => x.id === "conv_src"); c.messages.push({ id: "msg_src_1", from: "me", text: "à transférer", at: Date.now(), status: "sent" }); saveConversationsNow(); _forwardPick("conv_src", "msg_src_1"); });
    await page.waitForTimeout(500);
    const t0 = Date.now();
    const cible = page.locator('.csetting-item[onclick*="conv_cible"]').first();
    let clic = "dblclick";
    try { await cible.dblclick({ timeout: 4000 }); } catch (e) { clic = "erreur: " + String(e.message).slice(0, 100); }
    await page.waitForTimeout(2000);
    const r = await page.evaluate(() => { const c = getConversations().find((x) => x.id === "conv_cible"); return { messagesMe: c.messages.filter((m) => m.from === "me").map((m) => ({ id: m.id, text: m.text, status: m.status })), forwardSrc: !!window._forwardSrc, toasts: window.__toasts.slice() }; });
    noter("A9_transfert_double", { clic, local: r, insertsConvMessages: log.req.filter((x) => x.t >= t0 && x.table === "conv_messages" && x.m === "POST").length, js: errors.js });
  });

  test("A10 « réessayer » cliqué deux fois sur un message en échec (409 sur le second)", async ({ page }) => {
    const log = await armer(page, { delaisPost: { conv_messages: 800 } });
    const errors = await booter(page);
    await semerConversation(page, "conv_a10");
    await page.evaluate(() => openConversation("conv_a10"));
    await page.waitForTimeout(800);
    const t0 = Date.now();
    const r = await page.evaluate(async () => {
      const c = getConversations().find((x) => x.id === "conv_a10");
      const id = "msg_a10"; c.messages.push({ id, from: "me", text: "échec puis réessai", at: Date.now(), status: "failed" }); _outboxAdd("conv_a10", id, _withSenderMeta("échec puis réessai")); renderConvFpThread(c, "Autre");
      _retryMsg("conv_a10", id); _retryMsg("conv_a10", id);
      await new Promise((r) => setTimeout(r, 3000));
      const m = c.messages.find((x) => x.id === id);
      return { status: m.status, outbox: _outboxLoad().map((x) => x.msgId), indicateur: (document.querySelector('#convFpThread [data-msgst="' + id + '"]') || {}).textContent, toasts: window.__toasts.slice() };
    });
    const posts = log.req.filter((x) => x.t >= t0 && x.table === "conv_messages" && x.m === "POST").map((x) => ({ dup: !!x.dup }));
    noter("A10_retry_double", { local: r, posts, serveurContientMessage: log.serveur.conv_messages.has("msg_a10"), js: errors.js });
  });

  test("F401b REST en 401 pendant 30 s : le SDK tente-t-il un refresh, la session locale survit-elle ?", async ({ page }) => {
    test.setTimeout(120000);
    const log = await armer(page, { mode: "401" });
    const errors = await booter(page);
    const t0 = Date.now();
    await page.waitForTimeout(30000);
    const r = await page.evaluate(async () => ({ jetonLocal: !!localStorage.getItem("sb-njkiyoklssvefstljemx-auth-token"), uid: MY_UID, session: !!(await supa.auth.getSession()).data.session, onboarded: state.onboarded, toasts: window.__toasts.slice(0, 8), feed: document.getElementById("screen-feed").classList.contains("active") }));
    noter("F401b_session", { r, requetesRest30s: log.req.filter((x) => x.t >= t0 && x.p.startsWith("/rest")).length, authHits: log.authHits.map((a) => ({ p: a.p, grant: a.grant, t: a.t - t0 })), js: errors.js.slice(0, 5) });
  });
});
