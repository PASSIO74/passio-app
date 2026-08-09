// ═══════════════════════════════════════════════════════════════════════════
// QA-HELPER — briques partagées de la CAMPAGNE QA multi-comptes (qa-campaign).
//
// Réutilise le parcours d'inscription RÉEL prouvé par multi-comptes.spec.js :
// landing → « Créer un compte » → signUp e-mail/mot de passe (comptes jetables
// e2e_…@passio-e2e.test, purgés par le globalTeardown) → onboarding → reload
// pour que boot() rebranche supaInit + supaSubscribe (realtime) avec la session.
//
// ⚠️ ÉCRIT EN BASE RÉELLE (prod). Opt-in strict côté spec (PASSIO_QA_CAMPAIGN=1).
// ═══════════════════════════════════════════════════════════════════════════
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

const RT_MODE = process.env.PASSIO_E2E_RT || "";

// Inscrit UN utilisateur réel et renvoie son uid Supabase. `label` = prénom
// public (jamais d'e-mail dans l'app). Copie fidèle de signupAnonymous, isolée
// ici pour être partagée par la campagne. Robuste : lève une erreur claire si
// une étape échoue, pour que la campagne la classe en échec de setup.
async function signupUser(page, label, passionIndex = 0) {
  const step = (m) => console.log(`[signup ${label}] ${m}`);
  await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
  if (RT_MODE === "v2" || RT_MODE === "v3") {
    await page.addInitScript((mode) => { try { localStorage.setItem("passio_realtime_" + mode, "1"); } catch (e) {} }, RT_MODE);
  }
  await page.goto("/index.html");
  await page.waitForSelector("#landing.active", { timeout: 25000 });
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  await page.waitForFunction(() => typeof supa !== "undefined" && !!supa && typeof onbNext === "function", null, { timeout: 25000 });
  const email = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@passio-e2e.test`;
  await page.evaluate(async (em) => {
    try {
      const { data, error } = await supa.auth.signUp({ email: em, password: "Passio-qa-12345!" });
      if (data && data.session) { window.MY_UID = data.session.user.id; try { localStorage.setItem("passio_uid", window.MY_UID); } catch (e) {} }
      else if (error) console.warn("signUp qa error:", error.message);
    } catch (e) { console.warn("signUp qa exception:", e && e.message); }
    if (typeof onbNext === "function") onbNext();
  }, email);
  await page.waitForFunction(() => !!window.MY_UID, null, { timeout: 25000 });
  await page.locator("#birthYear").fill("1995");
  await page.getByRole("button", { name: "Valider" }).click();
  await page.locator("#userName").fill(label);
  await page.getByRole("button", { name: "Continuer" }).click();
  // Passion variée par utilisateur (repli sur la 1re tuile si l'index déborde).
  const tiles = page.locator("#passionGrid .passion-tile[data-passion]");
  const count = await tiles.count();
  await tiles.nth(count ? passionIndex % count : 0).click();
  await page.getByRole("button", { name: "Entrer sur PASSIO" }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForFunction(() => !!window.MY_UID && typeof supa !== "undefined" && !!supa, null, { timeout: 25000 });
  await page.waitForTimeout(2500); // supaInit + supaSubscribe (realtime)
  // La ligne profiles est créée en différé ; conv_members / follows ont une FK
  // vers profiles. On force l'upsert maintenant (comme l'app) et on vérifie.
  const profilOk = await page.evaluate(async () => {
    try {
      await supaUpsertProfile();
      const { data } = await supa.from("profiles").select("id").eq("id", MY_UID);
      return !!(data && data.length);
    } catch (e) { return "erreur: " + e.message; }
  });
  if (profilOk !== true) throw new Error("profil Supabase absent après upsert: " + profilOk);
  step("prêt (session + profil + realtime)");
  return page.evaluate(() => window.MY_UID);
}

// Diagnostic réseau : logge toute réponse Supabase ≥ 400 (URL + corps PostgREST).
function wireHttpDiag(log, pages) {
  for (const { who, page } of pages) {
    page.on("response", async (resp) => {
      if (resp.status() < 400 || resp.url().indexOf("supabase.co") === -1) return;
      let body = ""; try { body = (await resp.text()).slice(0, 240); } catch (e) {}
      log(`${who} HTTP ${resp.status()} ${resp.request().method()} ${resp.url().slice(0, 140)} → ${body}`);
    });
  }
}

module.exports = { signupUser, wireHttpDiag };
