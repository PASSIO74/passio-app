const { chromium } = require("/home/user/passio-app/node_modules/@playwright/test");
const fs = require("fs"); const OUT = __dirname; const BASE = "http://127.0.0.1:8107";
const GATE_HASH = "67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f";
const UID_B = "22222222-2222-4222-8222-222222222222";
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const captures = []; const urls = [];
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ status: 200, contentType: "application/javascript", body: require("fs").readFileSync(__dirname + "/stub-supabase.js", "utf8") }));
  await page.route(/supabase\.co/, async r => {
    const u = r.request().url(); const m = r.request().method(); urls.push(m + " " + u.replace(/^https:\/\/[^/]+/, "").slice(0, 80));
    if (m === "POST" && /rest\/v1\/conv_messages/.test(u)) { captures.push({ url: u.replace(/^https:\/\/[^/]+/, ""), body: r.request().postData() }); return r.fulfill({ status: 201, contentType: "application/json", body: "[]" }); }
    if (/auth\/v1\/user/.test(u)) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: UID_B, aud: "authenticated", role: "authenticated", email: "b@example.invalid", user_metadata: {}, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" }) });
    if (m === "GET" || m === "HEAD") return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    return r.fulfill({ status: 201, contentType: "application/json", body: "[]" });
  });
  await page.addInitScript(([h, b]) => {
    sessionStorage.setItem("passio_gate_v1", h);
    localStorage.setItem("passio_outbox_v1", JSON.stringify([{ convId: "conv_A_B", msgId: "msg_prive_de_A", content: "message privé écrit par A", at: Date.now() }]));
    localStorage.setItem("passio_uid", b);
    localStorage.setItem("passio_mvp_state_v1", JSON.stringify({ onboarded: true, landingSeen: true, user: { name: "B", general: {}, profiles: [{ id: "p1", passionId: "musique", name: "B" }] } }));
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." + btoa(JSON.stringify({ sub: b, aud: "authenticated", role: "authenticated", exp, iat: exp - 3600, session_id: "s" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_") + ".c2ln";
    localStorage.setItem("sb-njkiyoklssvefstljemx-auth-token", JSON.stringify({ access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r", user: { id: b, aud: "authenticated", role: "authenticated", email: "b@example.invalid", user_metadata: {}, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" } }));
  }, [GATE_HASH, UID_B]);
  await page.goto(BASE + "/index.html"); await page.waitForTimeout(8000);
  const etat = await page.evaluate(() => ({ MY_UID: typeof MY_UID !== "undefined" ? MY_UID : null, supaReal: !!window._supaReal, onLine: navigator.onLine, outbox: localStorage.getItem("passio_outbox_v1"), flushDefini: typeof _flushOutbox }));
  const avantAppel = captures.length;
  await page.evaluate(() => { try { _flushOutbox(); } catch (e) { return String(e); } }); await page.waitForTimeout(3000);
  const res = { etat_apres_boot: etat, inserts_captes_au_boot: avantAppel, inserts_apres_flush_explicite: captures.slice(), requetes_supabase: urls.slice(0, 40) };
  fs.writeFileSync(OUT + "/emul-outbox-B-resultats.json", JSON.stringify(res, null, 2)); console.log(JSON.stringify(res, null, 2));
  await browser.close();
})().catch(e => { console.error("ECHEC", e); process.exit(1); });
