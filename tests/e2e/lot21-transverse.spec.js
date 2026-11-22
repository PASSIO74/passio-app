// ═══════════════════════════════════════════════════════════════════════════
// LOT-21 (audit UX/UI du 2026-11-10) — RÈGLES TRANSVERSES (SUITE)
//   ① TRA-C13 / C28 : panneau Notifications — un seul « Fermer », Accepter /
//      Refuser à 44 px, « Hier, 19:25 », l'état de la permission du téléphone.
//   ② TRA-C12 : une notification dont la cible a disparu le dit, et le panneau
//      reste ouvert.
//   ③ TRA-C06 : « Affichage » — couleur, police, taille du texte (couleurs et
//      polices revenues le 2026-11-14) ; coins et ordre d'onglets retirés à l'ouverture.
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

test("③ TRA-C06 : « Affichage » — couleur, police et taille ; coins et ordre d'onglets retirés", async ({ page }) => {
  // 2026-11-14 (demande de Benjamin) : les couleurs et les polices REVIENNENT
  // dans « Affichage ». Restent retirés : coins, ordre d'onglets, « Appliquer ».
  await page.addInitScript(() => {
    if (!localStorage.getItem("__cfg_pose")) {
      localStorage.setItem("__cfg_pose", "1");
      localStorage.setItem("passio_config", JSON.stringify({ accent: "dark", radius: "pill", navOrder: ["feed"], fontFamily: "x", fontSize: "large" }));
    }
  });
  await boot(page);
  const r = await page.evaluate(() => {
    openConfigurator();
    const m = document.getElementById("modalContent");
    const cfg = JSON.parse(localStorage.getItem("passio_config"));
    return {
      titre: m.querySelector(".modal-title").textContent,
      texte: m.innerText,
      tailles: m.querySelectorAll(".config-taille").length,
      couleurs: m.querySelectorAll(".config-couleur").length,
      police: !!m.querySelector("#fontDropdown"),
      polices_chargees: document.querySelectorAll('link[href*="fonts.googleapis.com"]').length,
      cfg,
      surcharge: !!document.getElementById("passio-color-override"),
      coins: !!document.getElementById("passio-rd-override"),
      textColor: document.documentElement.style.getPropertyValue("--text"),
    };
  });
  expect(r.titre).toBe("Affichage");
  expect(r.tailles).toBe(4);
  expect(r.couleurs).toBe(7);
  expect(r.police).toBe(true);
  expect(r.polices_chargees, "aucune police chargée avant d'ouvrir la liste").toBe(0);
  for (const mot of ["coins", "Disposition des onglets", "Appliquer"]) expect(r.texte).not.toContain(mot);
  // Une couleur et une police inconnues sortent avec les clés hors charte.
  expect(r.cfg).toEqual({ fontSize: "large" });
  expect(r.surcharge).toBe(false);
  expect(r.coins).toBe(false);
  expect(r.textColor).toBe("");

  // Choisir une couleur l'applique tout de suite et la garde.
  const rose = await page.evaluate(() => {
    document.querySelector('.config-couleur:nth-child(2)').click();
    return {
      cfg: JSON.parse(localStorage.getItem("passio_config")),
      accent: document.documentElement.style.getPropertyValue("--accent"),
      actif: document.querySelector("#modalContent .config-couleur.actif").textContent.trim(),
    };
  });
  expect(rose.cfg.accent).toBe("rose");
  expect(rose.accent).toBe("#ec4899");
  expect(rose.actif).toBe("Rose");

  // Choisir une police dans la liste l'applique.
  const police = await page.evaluate(() => {
    toggleFontDropdown();
    const choix = Array.from(document.querySelectorAll("#fontDropdownList .config-police-choix"));
    const n = choix.length;
    choix.find((b) => b.textContent.includes("Poppins")).click();
    return {
      n,
      cfg: JSON.parse(localStorage.getItem("passio_config")),
      regle: (document.getElementById("passio-ff-override") || {}).textContent || "",
    };
  });
  expect(police.n).toBe(16);
  expect(police.cfg.fontFamily).toBe("poppins");
  expect(police.regle).toContain("Poppins");

  // Revenir au violet et à la police par défaut retire les réglages : la charte seule.
  const retour = await page.evaluate(() => {
    setConfig("accent", "violet");
    setConfig("fontFamily", "default");
    return {
      cfg: JSON.parse(localStorage.getItem("passio_config")),
      surcharge: !!document.getElementById("passio-color-override"),
      accent: document.documentElement.style.getPropertyValue("--accent"),
      police: !!document.getElementById("passio-ff-override"),
    };
  });
  expect(retour.cfg).toEqual({ fontSize: "large" });
  expect(retour.surcharge).toBe(false);
  expect(retour.accent).toBe("");
  expect(retour.police).toBe(false);

  // Le choix tient au rechargement.
  await page.evaluate(() => { setConfig("accent", "bleu"); });
  await page.reload();
  await page.waitForFunction(() => typeof openConfigurator === "function" && document.documentElement.style.getPropertyValue("--accent") === "#0ea5e9");
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
