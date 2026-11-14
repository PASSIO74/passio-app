// Sonde ENTRÉE 03 — porte de compte (geste engageant au Studio), formulaire d'inscription,
// erreurs, onglet connexion, mot de passe oublié, retour système. Rien ne part : le banc
// répond 422 à toute inscription en mode visiteur.
"use strict";
module.exports = async ({ page, photo }) => {
  const lire = () => page.evaluate(() => {
    const vis = (el) => { if (!el) return false; const c = getComputedStyle(el); const r = el.getBoundingClientRect(); return c.display !== "none" && c.visibility !== "hidden" && r.height > 0; };
    const b = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
    const onb = document.getElementById("onboarding");
    const mb = document.getElementById("modalBackdrop");
    return {
      ecran: (document.querySelector(".screen.active") || {}).id, hash: location.hash,
      modale: mb && mb.classList.contains("active") ? document.getElementById("modalContent").innerText.replace(/\s+/g, " ").slice(0, 300) : null,
      onboarding: vis(onb), onbScroll: onb ? [onb.scrollTop, onb.scrollHeight, onb.clientHeight] : null,
      authMsg: (document.getElementById("authMsg") || {}).innerText,
      authMsgCls: (document.getElementById("authMsg") || {}).className,
      refusConsent: (document.getElementById("authConsentRefus") || {}).innerText,
      refusPwd: (document.getElementById("authPwdRefus") || {}).innerText,
      regles: (document.getElementById("authPwdRules") || {}).innerText,
      resendTop: vis(document.getElementById("authResendTop")),
      champs: onb ? [...onb.querySelectorAll("input, button, [role=button], span[onclick]")].filter(vis).map((e) => ({ id: e.id, tag: e.tagName, type: e.type, im: e.getAttribute("inputmode"), ac: e.getAttribute("autocomplete"), txt: (e.innerText || e.getAttribute("aria-label") || e.placeholder || "").trim().slice(0, 40), boite: b(e), fs: getComputedStyle(e).fontSize })) : [],
      toasts: (window.__toastsVus || []).slice(-4),
      focus: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
    };
  });
  await page.evaluate(() => { window.__toastsVus = []; const o = window.toast; window.toast = function (m) { window.__toastsVus.push(String(m)); return o.apply(this, arguments); }; });
  const out = {};
  // 1. Geste engageant réel : publier au Studio.
  await page.evaluate(() => goTo("studio")); await page.waitForTimeout(1200);
  await page.evaluate(() => { const t = document.querySelector(".fr-tip .fr-tip-ok"); if (t) t.click(); });
  const zone = page.locator("#screen-studio textarea").first();
  if (await zone.count()) { await zone.fill("Mon premier essai"); }
  await page.locator("#screen-studio button", { hasText: /^Publier$/ }).first().click().catch((e) => { out.publierErr = String(e).slice(0, 120); });
  await page.waitForTimeout(1000);
  out.gate = await lire(); await photo("1-gate");
  // 2. « Créer mon compte »
  await page.locator("#modalContent button", { hasText: "Créer mon compte" }).click().catch(() => {});
  await page.waitForTimeout(1200);
  out.signup = await lire(); await photo("2-signup");
  // 3. Envoi à vide
  await page.locator("#authSubmitBtn").click(); await page.waitForTimeout(900);
  out.vide = await lire(); await photo("3-vide");
  // 4. E-mail invalide, mot de passe faible
  await page.locator("#onboarding #authName").fill("Camille").catch(() => {});
  await page.locator("#authBirthYear").fill("1994").catch(() => {});
  await page.locator("#authEmail").fill("camille@exemple");
  await page.locator("#authPassword").fill("abc");
  await page.locator("#authPasswordConfirm").fill("abd").catch(() => {});
  await page.locator("#authSubmitBtn").click(); await page.waitForTimeout(900);
  out.invalide = await lire(); await photo("4-invalide");
  // 5. Consentement non coché, reste valide
  await page.locator("#authEmail").fill("camille.audit@exemple.fr");
  await page.locator("#authPassword").fill("Velo-Lyon-2026!x");
  await page.locator("#authPasswordConfirm").fill("Velo-Lyon-2026!x").catch(() => {});
  await page.locator("#authSubmitBtn").click(); await page.waitForTimeout(900);
  out.sansConsent = await lire(); await photo("5-sans-consentement");
  // 6. Moins de 18 ans
  await page.locator("#authConsent").check().catch(() => {});
  await page.locator("#authBirthYear").fill("2012").catch(() => {});
  await page.locator("#authSubmitBtn").click(); await page.waitForTimeout(900);
  out.mineur = await lire(); await photo("6-mineur");
  // 7. Tout valide → le banc refuse (422)
  await page.locator("#authBirthYear").fill("1994").catch(() => {});
  await page.locator("#authSubmitBtn").click(); await page.waitForTimeout(2500);
  out.refusBanc = await lire(); await photo("7-refus-banc");
  // 8. Connexion
  await page.locator("#authTabSignin").click(); await page.waitForTimeout(500);
  out.signin = await lire(); await photo("8-signin");
  await page.locator("#authEmail").fill("camille.audit@exemple.fr");
  await page.locator("#authPassword").fill("faux-mot-de-passe");
  await page.locator("#authSubmitBtn").click(); await page.waitForTimeout(2500);
  out.signinErr = await lire(); await photo("9-signin-erreur");
  // 9. Mot de passe oublié, e-mail vidé
  await page.locator("#authEmail").fill("");
  await page.locator("#authForgotLink").click(); await page.waitForTimeout(1200);
  out.oubli = await lire(); await photo("10-oubli");
  // 10. Retour système
  await page.goBack(); await page.waitForTimeout(1000);
  out.retour = await lire(); await photo("11-retour");
  return out;
};
module.exports.demarrage = { mode: "visiteur" };
