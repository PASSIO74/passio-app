const { chromium } = require('/home/user/passio-app/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: undefined });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/supabase\.co|netlify/, r => r.abort());
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    sessionStorage.setItem("passio_gate_v1", "67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f");
    localStorage.setItem("passio_first_run_experience_v1", "0");
  });
  await page.goto("http://127.0.0.1:8120/index.html", { waitUntil: "load" });
  await page.waitForFunction(() => typeof window._callOnInvite === "function" || typeof _callOnInvite === "function", null, { timeout: 15000 }).catch(()=>{});
  const res = await page.evaluate(() => {
    const out = {};
    out.fnExists = typeof _callOnInvite === "function";
    out.channelCfgSrc = typeof _callChannel === "function" ? _callChannel.toString() : null;
    // Simule un broadcast reçu sur ring:<victime> avec un `from` et un `name` choisis par l'émetteur
    _callOnInvite({ callId: "forge-123", from: "00000000-0000-4000-8000-000000000042", kind: "video", name: "Faux contact de confiance", emoji: "🎭" });
    const el = document.getElementById("callOverlay");
    out.overlayActive = !!(el && el.classList.contains("active"));
    out.nameShown = el ? (el.querySelector(".call-name") || {}).textContent : null;
    out.statusShown = el ? (el.querySelector(".call-status") || {}).textContent : null;
    out.incomingFrom = window._callIncoming && window._callIncoming.from;
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  await page.screenshot({ path: __dirname + "/sonnerie-forgee.png" });
  await b.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
