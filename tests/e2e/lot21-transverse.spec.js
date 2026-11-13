// ═══════════════════════════════════════════════════════════════════════════
// LOT-21 (audit UX/UI du 2026-11-10) — RÈGLES TRANSVERSES (SUITE)
//   ① TRA-C13 / C28 : panneau Notifications — un seul « Fermer », Accepter /
//      Refuser à 44 px, « Hier, 19:25 », l'état de la permission du téléphone.
//   ② TRA-C12 : une notification dont la cible a disparu le dit, et le panneau
//      reste ouvert.
//   ③ TRA-C06 : « Affichage » ne garde que la taille du texte ; les réglages
//      hors charte déjà posés sont retirés à l'ouverture.
//   ④ TRA-C29 / C20 : « Aide et retour » commence par l'aide ; sur Android,
//      la consigne d'installation parle du menu ⋮.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.__t = [];
    const t0 = window.toast;
    window.toast = function (m) { window.__t.push(String(m)); try { return t0.apply(this, arguments); } catch (e) { return null; } };
  });
}

test("① TRA-C13 / C28 : panneau Notifications — Fermer, 44 px, jour écrit, permission dite", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const hier = new Date(); hier.setDate(hier.getDate() - 1); hier.setHours(19, 25, 0, 0);
    state.notifications = [
      { id: "n_l21_dem", kind: "follow_request", fromId: "u_lea", text: "Léa veut te suivre", createdAt: Date.now() - 60e3, unread: true },
      { id: "n_l21_hier", kind: "like", refId: "p_x", fromId: "u_lea", text: "Léa a aimé ta publication", createdAt: hier.getTime(), unread: false },
    ];
    openNotifications();
    const m = document.getElementById("modalContent");
    const boutons = Array.from(m.querySelectorAll("button")).map((b) => b.textContent.trim());
    const acc = Array.from(m.querySelectorAll(".notif-demande-actions .btn")).map((b) => Math.round(b.getBoundingClientRect().height));
    const metas = Array.from(m.querySelectorAll(".notif-meta")).map((x) => x.textContent.trim());
    return { boutons, acc, metas, permission: (m.querySelector(".notif-permission") || {}).textContent || "" };
  });
  expect(r.boutons).not.toContain("Tout marquer lu");
  expect(r.boutons).toContain("Fermer");
  expect(r.acc.length).toBe(2);
  for (const h of r.acc) expect(h).toBeGreaterThanOrEqual(44);
  expect(r.metas[1]).toBe("Hier, 19:25");
  expect(r.permission).toMatch(/^Notifications du téléphone : /);
});

test("② TRA-C12 : une cible disparue se dit, le panneau reste ouvert", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    marquerPostSupprime("p_l21_parti");
    state.notifications = [{ id: "n_l21_x", kind: "like", refId: "p_l21_parti", fromId: "u_lea", text: "Léa a aimé ta publication", createdAt: Date.now(), unread: true }];
    openNotifications();
    clickNotif("n_l21_x");
    return { toast: window.__t.slice(-1)[0], ouvert: document.getElementById("modalBackdrop").classList.contains("active") };
  });
  expect(r.toast).toBe("Cette publication n'existe plus");
  expect(r.ouvert, "le panneau reste ouvert").toBe(true);
});

test("③ TRA-C06 : « Affichage » — la taille du texte seule, réglages hors charte retirés", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("passio_config", JSON.stringify({ accent: "dark", radius: "pill", navOrder: ["feed"], fontFamily: "x", fontSize: "large" })));
  await boot(page);
  const r = await page.evaluate(() => {
    openConfigurator();
    const m = document.getElementById("modalContent");
    const cfg = JSON.parse(localStorage.getItem("passio_config"));
    return {
      titre: m.querySelector(".modal-title").textContent,
      texte: m.innerText,
      tailles: m.querySelectorAll(".config-taille").length,
      cfg,
      surcharge: !!document.getElementById("passio-color-override"),
      textColor: document.documentElement.style.getPropertyValue("--text"),
    };
  });
  expect(r.titre).toBe("Affichage");
  expect(r.tailles).toBeGreaterThan(1);
  for (const mot of ["Sombre", "Police", "coins", "Disposition des onglets", "Appliquer"]) expect(r.texte).not.toContain(mot);
  expect(r.cfg).toEqual({ fontSize: "large" });
  expect(r.surcharge).toBe(false);
  expect(r.textColor).toBe("");
});

test("④ TRA-C29 / C20 : « Aide et retour » commence par l'aide ; Android parle du menu ⋮", async ({ page }) => {
  await boot(page);
  const aide = await page.evaluate(() => {
    feedbackModal();
    const m = document.getElementById("modalContent");
    return { titre: m.querySelector(".modal-title").textContent, texte: m.textContent };
  });
  expect(aide.titre).toBe("Aide et retour");
  expect(aide.texte).toContain("Ce que cette version pilote fait");
  expect(aide.texte).toContain("Une fonctionnalité à ajouter");
  expect(aide.texte).toContain("s'ouvre dans ta messagerie");
  expect(aide.texte).not.toContain("feature");
  const android = await page.evaluate(() => {
    closeModal();
    Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => "Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile" });
    pwaShowBannerInstall();
    return (document.getElementById("pwa-content") || {}).innerText || "";
  });
  expect(android).toContain("menu ⋮");
  expect(android).not.toContain("barre d'adresse");
});
