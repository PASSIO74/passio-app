// ═══════════════════════════════════════════════════════════════════════════
// LOT-44 (audit UX/UI du 2026-11-10) — TRANSVERSE ET MESSAGERIE
//   ① TRA-C24 : un toast ne commence plus par un emoji de fonction ; ✅/⚠️/❌
//      donnent le type ; un emoji de contenu reste.
//   ② MSG-C31 / MSG-C28 : un groupe se crée sans passion ; les cases disent
//      leur état et se cochent au clavier.
//   ③ MSG-C30 : un clic droit (appui long) sur une conversation de la liste
//      ouvre ses actions SANS l'ouvrir.
//   ④ TRA-C26 : les textes légaux ont un sommaire qui mène aux points.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const AUTRE = "a1b2c3d4-0000-4000-8000-00000000c845";

test("① toasts : pas d'emoji de fonction en tête, la nature par le type", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const a = toast("✅ Lien copié"), b = toast("❌ Échec de l'envoi"), c = toast("🔕 Notifications coupées"), d = toast("🎉 Bienvenue !");
    return { a: [a.textContent, a.className], b: [b.textContent, b.className], c: c.textContent, d: d.textContent };
  });
  expect(r.a[0]).toBe("Lien copié");
  expect(r.a[1]).toContain("success");
  expect(r.b[0]).toBe("Échec de l'envoi");
  expect(r.b[1]).toMatch(/error|warning/);
  expect(r.c).toBe("Notifications coupées");
  expect(r.d).toBe("🎉 Bienvenue !");
});

test("② groupe sans passion ; cases annoncées et cochables au clavier", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    window.__toasts = []; const t0 = window.toast; window.toast = (m) => { window.__toasts.push(String(m)); return document.createElement("div"); };
    openCreateGroup();
    await new Promise((res) => setTimeout(res, 150));
    const label = [...document.querySelectorAll(".modal .field span, #modalContent .field span")].map((s) => s.textContent).find((t) => /Passion/.test(t));
    const opt = document.querySelector(".group-user-option");
    const avant = opt.getAttribute("aria-checked");
    opt.focus();
    opt.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    const apres = opt.getAttribute("aria-checked");
    document.getElementById("groupName").value = "Sans passion";
    const n0 = getConversations().length;
    await confirmCreateGroup();
    window.toast = t0;
    const g = getConversations().find((c) => c.isGroup && c.groupName === "Sans passion");
    return { label, role: opt.getAttribute("role"), avant, apres, cree: !!g, n: getConversations().length - n0, toasts: window.__toasts };
  });
  expect(r.label).toMatch(/facultatif/);
  expect(r.role).toBe("checkbox");
  expect(r.avant).toBe("false");
  expect(r.apres).toBe("true");
  expect(r.toasts.join(" ")).not.toMatch(/au moins 1 passion/);
  expect(r.cree).toBe(true);
});

test("③ clic droit sur une conversation : ses actions, sans l'ouvrir", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate((autre) => {
    conversationsState = [{ id: "c_l44", userId: autre, userName: "Léa", lastAt: Date.now(), unread: 2, messages: [{ id: "z1", from: autre, text: "coucou", at: Date.now() }] }];
    saveConversationsNow(); goTo("messages"); renderMessages();
  }, AUTRE);
  await page.locator('#messageList .msg-card[data-conv-id="c_l44"]').click({ button: "right" });
  const titre = page.locator(".modal-title", { hasText: "Léa" });
  await expect(titre).toBeVisible();
  const r = await page.evaluate(() => ({
    entrees: [...document.querySelectorAll(".csetting-item .csetting-label")].map((x) => x.textContent),
    ouverte: !!(document.getElementById("conv-fullpage") && document.getElementById("conv-fullpage").classList.contains("active")),
    nonLus: getConversations().find((c) => c.id === "c_l44").unread,
  }));
  expect(r.entrees).toEqual(["Épingler en haut de la liste", "Marquer comme non lu", "Couper les notifications", "Archiver la conversation"]);
  expect(r.ouverte).toBe(false);
  expect(r.nonLus).toBe(2);
  await page.locator(".csetting-item", { hasText: "Épingler" }).click();
  expect(await page.evaluate(() => getConversations().find((c) => c.id === "c_l44").pinned)).toBe(true);
});

test("④ textes légaux : un sommaire qui mène aux points", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    openPrivacyPolicy();
    await new Promise((res) => setTimeout(res, 100));
    const liens = [...document.querySelectorAll(".legal-sommaire-lien")];
    const corps = document.querySelector(".legal-corps");
    const cible = liens[liens.length - 1];
    cible.click();
    await new Promise((res) => setTimeout(res, 600));
    const out = { n: liens.length, premier: liens[0] && liens[0].textContent, defile: corps.scrollTop > 0 };
    closeModal();
    return out;
  });
  expect(r.n).toBeGreaterThanOrEqual(8);
  expect(r.premier).toMatch(/^1\. /);
  expect(r.defile).toBe(true);
});
