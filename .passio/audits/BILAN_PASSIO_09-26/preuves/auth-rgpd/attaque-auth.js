// Émulation Chromium (Playwright) — attaques auth/RGPD sur le serveur local :8107.
// Lecture seule sur le dépôt, aucune requête vers Supabase (tout *.supabase.co est abandonné).
const { chromium } = require("/home/user/passio-app/node_modules/@playwright/test");
const GATE_KEY = "passio_gate_v1";
const GATE_TOKEN = "67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f";
const BASE = "http://127.0.0.1:8107";
const UID = "11111111-2222-4333-8444-555555555555";
const out = {};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/supabase\.co|jsdelivr|unpkg|googleapis|gstatic|giphy|komoot|data\.gouv|openfreemap/, (r) => r.abort());
  const page = await ctx.newPage();
  await page.addInitScript(([k, t, uid]) => {
    sessionStorage.setItem(k, t);
    localStorage.setItem("passio_first_run_experience_v1", "0"); // onboarding historique
    localStorage.setItem("passio_uid", uid);                     // l'appareil connaît déjà ce compte (pas de purge d'adoption)
  }, [GATE_KEY, GATE_TOKEN, UID]);
  const toasts = [];
  await page.exposeFunction("_toastSpy", (t) => toasts.push(t));

  // ── A. Suppression de compte, réseau coupé : que dit l'écran ? ─────────────
  await page.goto(BASE + "/index.html");
  await page.waitForFunction(() => typeof doDeleteAccount === "function" && typeof openDeleteAccountConfirm === "function", null, { timeout: 30000 });
  await page.evaluate((uid) => {
    MY_UID = uid; window.MY_UID = uid;
    const st = document.getElementById("toastStack");
    new MutationObserver(() => { st.querySelectorAll(".toast, [class*=toast]").forEach((n) => window._toastSpy(n.textContent.trim())); }).observe(st, { childList: true, subtree: true });
    window._invokeCalls = 0;
    const f = supa.functions;
    if (f) { const orig = f.invoke; f.invoke = function () { window._invokeCalls++; return orig.apply(this, arguments); }; }
  }, UID);
  await page.evaluate(() => { openDeleteAccountConfirm(); document.getElementById("deleteConfirmInput").value = "SUPPRIMER"; });
  await page.evaluate(() => { const o = location.reload; window._reloaded = false; location.reload = () => { window._reloaded = true; }; });
  const invokeResult = await page.evaluate(async () => {
    let r = null; try { r = await supa.functions.invoke("delete-account"); } catch (e) { r = { threw: String(e && e.message) }; }
    return r;
  });
  await page.evaluate(() => doDeleteAccount());
  await page.waitForTimeout(2500);
  out.A_suppression_reseau_coupe = {
    reponse_invoke_delete_account: invokeResult,
    toasts: [...new Set(toasts)],
    reload_declenche: await page.evaluate(() => window._reloaded),
    jeton_local_restant: await page.evaluate(() => Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k)).length),
  };

  // ── B. Inscription avec confirmation d'e-mail : l'étape « âge » est-elle atteinte ? ──
  const page2 = await ctx.newPage();
  await page2.goto(BASE + "/index.html");
  await page2.waitForFunction(() => typeof onbDoAuth === "function" && window.supa && window.supa.auth, null, { timeout: 30000 });
  await page2.evaluate((uid) => {
    // signUp avec « Confirm email » : Supabase rend un user (identities non vides) et AUCUNE session.
    supa.auth.signUp = async () => ({ data: { user: { id: uid, identities: [{ id: "x" }] }, session: null }, error: null });
    supa.auth.signInWithPassword = async () => ({ data: { session: { user: { id: uid } }, user: { id: uid } }, error: null });
    supa.auth.getSession = async () => ({ data: { session: null }, error: null });
    window._reloaded = false; location.reload = () => { window._reloaded = true; };
    document.getElementById("onboarding").classList.add("active");
    showOnbStep("splash"); onbStepIdx = 0; switchAuthTab("signup");
    document.getElementById("authEmail").value = "audit@exemple.test";
    document.getElementById("authPhone").value = "0612345678";
    document.getElementById("authPassword").value = "abcdef";
    document.getElementById("authPasswordConfirm").value = "abcdef";
  }, UID);
  await page2.evaluate(() => onbDoAuth());
  await page2.waitForTimeout(800);
  const apresSignup = await page2.evaluate(() => ({
    message: document.getElementById("authMsg").textContent,
    etape_active: (document.querySelector(".onb-step.active") || {}).getAttribute?.("data-onb-step"),
    onglet: _authMode,
    telephone_en_etat_local: !!(state && state.user && state.user.general && state.user.general.phone),
  }));
  // …la personne confirme son e-mail, revient, se connecte :
  await page2.evaluate(() => { document.getElementById("authPassword").value = "abcdef"; });
  await page2.evaluate(() => onbDoAuth());
  await page2.waitForTimeout(1200);
  const apresSignin = await page2.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("passio_mvp_state_v1") || "null");
    return {
      reload_declenche: window._reloaded,
      etape_active: (document.querySelector(".onb-step.active") || {}).getAttribute?.("data-onb-step"),
      onboarded_persiste: !!(st && st.onboarded),
      birthYear_persiste: st && st.user ? st.user.birthYear : "(état absent)",
      isMinor_persiste: st && st.user ? st.user.isMinor : "(état absent)",
    };
  });
  out.B_inscription_confirmation_email = { apres_signup: apresSignup, apres_signin: apresSignin };

  // ── C. Télémétrie : identifiant d'appareil persistant posé sans compte ni consentement ? ──
  const page3 = await ctx.newPage();
  await page3.goto(BASE + "/index.html?telemetry=1");
  await page3.waitForFunction(() => window.PassioTelemetry, null, { timeout: 30000 });
  out.C_telemetrie_visiteur = await page3.evaluate(() => ({
    device_id_pose: !!localStorage.getItem("passio_device_id"),
    bouton_opt_out_dans_parametres: !!document.querySelector('#devPanel [onclick*="Telemetry"], #devPanel [onclick*="telemetry"]'),
    lien_cgu_ou_mentions_dans_parametres: !!Array.from(document.querySelectorAll("#devPanel button, #devPanel a")).find((b) => /CGU|conditions|mentions/i.test(b.textContent)),
    consentement_dans_formulaire_inscription: !!document.querySelector('#onboarding input[type="checkbox"]'),
  }));

  // ── D. Gate : contournement par le seul jeton sessionStorage (hash public) ─────
  const page4 = await ctx.newPage();
  await page4.addInitScript(() => sessionStorage.removeItem("passio_gate_v1"));
  await page4.goto(BASE + "/index.html");
  await page4.waitForSelector("#passioGate", { timeout: 15000 });
  const gateAvant = await page4.evaluate(() => document.documentElement.classList.contains("passio-locked"));
  await page4.evaluate((t) => sessionStorage.setItem("passio_gate_v1", t), GATE_TOKEN);
  await page4.reload();
  await page4.waitForTimeout(1500);
  out.D_gate = { verrouille_avant: gateAvant, verrouille_apres_jeton_console: await page4.evaluate(() => document.documentElement.classList.contains("passio-locked")), gate_present_apres: !!(await page4.$("#passioGate")) };

  await page.screenshot({ path: __dirname + "/A-suppression-reseau-coupe.png" }).catch(() => {});
  console.log(JSON.stringify(out, null, 1));
  require("fs").writeFileSync(__dirname + "/attaque-auth.resultat.json", JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error("ECHEC", e); process.exit(1); });
