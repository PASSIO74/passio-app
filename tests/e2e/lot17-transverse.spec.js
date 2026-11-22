// ═══════════════════════════════════════════════════════════════════════════
// LOT-17 (audit UX/UI du 2026-11-10) — RÈGLES TRANSVERSES
//   ① TRA-C02 : un échec se peint en « warning » et dure selon sa longueur.
//   ② TRA-C21 / C22 : la fenêtre commune se nomme, prend le focus, le garde,
//      le rend ; une seule croix partout.
//   ③ TRA-C07 : « Vidéos et données » — plus de réglages qui ne font rien.
//   ④ TRA-C09 : un compte bloqué inconnu se relit ; « Débloquer » à 44 px.
//   ⑤ TRA-C25 / C27 : « À propos » dit la version qui tourne ; la suppression
//      propose d'abord la copie des données.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("① TRA-C02 : un échec est un « warning », la durée suit la longueur", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const a = toast("⚠️ Blocage non enregistré — réessaie");
    const b = toast("Lien copié");
    const c = toast("Refus explicite", "success");
    return {
      echec: a.className, roleEchec: a.getAttribute("role"), reussite: b.className, explicite: c.className,
      court: dureeToast("Lien copié", false), long: dureeToast("x".repeat(100), false), plafond: dureeToast("x".repeat(400), false),
    };
  });
  expect(r.echec).toContain("warning");
  expect(r.roleEchec).toBe("alert");
  expect(r.reussite).toContain("info");
  expect(r.explicite, "un type explicite reste souverain").toContain("success");
  expect([r.court, r.long, r.plafond]).toEqual([3000, 6000, 8000]);
});

test("② TRA-C21 / C22 : la fenêtre se nomme, prend le focus, le garde et le rend", async ({ page }) => {
  await bootOnboarded(page);
  await page.waitForTimeout(400);
  await page.locator(".topbar-bell[aria-label='Notifications']").focus();
  await page.evaluate(() => openNewMessage());
  const r = await page.evaluate(() => {
    const m = document.getElementById("modalContent");
    return {
      croix: m.querySelectorAll(".modal-close").length,
      nom: m.getAttribute("aria-labelledby") ? (document.getElementById(m.getAttribute("aria-labelledby")) || {}).textContent : m.getAttribute("aria-label"),
      dedans: m.contains(document.activeElement),
    };
  });
  expect(r.croix, "une seule croix").toBe(1);
  expect(r.nom, "la fenêtre a un nom").toBeTruthy();
  expect(r.dedans, "le focus entre dans la fenêtre").toBe(true);
  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.getElementById("modalContent").contains(document.activeElement)), "la tabulation reste dedans").toBe(true);
  await page.evaluate(() => closeModal());
  expect(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("aria-label")), "le focus revient à la cloche").toBe("Notifications");
});

test("③ TRA-C07 : « Vidéos et données » ne garde que les réglages branchés", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    openContentSettings();
    const m = document.getElementById("modalContent");
    return { titre: m.querySelector(".modal-title").textContent, sensible: !!document.getElementById("contentSensitive"), langue: !!document.getElementById("contentLang"), auto: !!document.getElementById("contentAutoplay") };
  });
  expect(r).toEqual({ titre: "Vidéos et données", sensible: false, langue: false, auto: true });
});

test("④ TRA-C09 : un compte bloqué inconnu se relit ; « Débloquer » à 44 px", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.__demandes = [];
    window._resolveProfilesByIds = async (ids) => { window.__demandes.push(ids.slice()); return {}; };
    state.user.blocked = ["11111111-2222-4333-8444-555555555555"];
    openBlockedList();
  });
  await page.waitForTimeout(200);
  // D'autres lectures du démarrage passent aussi par ce résolveur : on vérifie que
  // la liste a bien demandé SON compte inconnu.
  expect(await page.evaluate(() => window.__demandes)).toContainEqual(["11111111-2222-4333-8444-555555555555"]);
  const b = page.locator("#blockedListBox .bloque-debloquer").first();
  expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
});

test("⑤ TRA-C25 / C27 : la version qui tourne ; la copie des données avant la suppression", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    window.PASSIO_RELEASE = { buildId: "9e68d338eeda", commit: "c3fd69e1e0753eaf" };
    openAbout();
    const version = document.querySelector("#modalContent .a-propos-version").textContent;
    const logo = !!document.querySelector('#modalContent img[src="icon-192.png"]');
    openDeleteAccountConfirm();
    const m = document.getElementById("modalContent");
    const exp = m.querySelector(".suppression-export button");
    const champ = document.getElementById("deleteConfirmInput");
    return { version, logo, export: exp && exp.textContent, avantChamp: !!(exp && champ && (exp.compareDocumentPosition(champ) & Node.DOCUMENT_POSITION_FOLLOWING)) };
  });
  expect(r.version).toBe("Version 9e68d338eeda · c3fd69e1");
  expect(r.logo).toBe(true);
  expect(r.export).toBe("Télécharger mes données");
  expect(r.avantChamp, "proposée AVANT la confirmation").toBe(true);
});
