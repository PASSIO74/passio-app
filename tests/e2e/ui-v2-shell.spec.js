// Lot UI-1 — cadre visuel et navigation V2, derrière l'aperçu `passio-ui-v2`.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① l'URL NORMALE garde exactement la navigation actuelle ;
//   ② l'aperçu expose cinq destinations, libellées et atteignables ;
//   ③ Bobines et CDV quittent la barre principale mais restent routables ;
//   ④ l'aperçu n'écrit AUCUN réglage durable et ne change pas le profil actif ;
//   ⑤ en 390 × 844 aucun libellé n'est tronqué et aucune cible n'est trop petite.
//
// Chaque test démarre sur un état onboardé injecté (CI-safe : aucun compte
// Supabase créé) et neutralise les écritures réseau, comme le helper partagé.
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");
const { onboardedState } = require("./app-helper");

const PREVIEW = "?passio_preview=passio-ui-v2";

// Les cinq entrées attendues, dans l'ordre exact de la direction produit.
const V2_NAV = [
  { key: "discover", label: "Découvrir", screen: "feed" },
  { key: "meet", label: "Rencontrer", screen: "irl" },
  { key: "create", label: "Créer", screen: null },
  { key: "messages", label: "Messages", screen: "messages" },
  { key: "profile", label: "Profil", screen: "profiles" },
];

async function boot(page, { preview = false, errors = null } = {}) {
  if (errors) {
    page.on("pageerror", (e) => errors.js.push("pageerror: " + e.message));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const txt = m.text();
      if (/Failed to load resource|net::|ERR_/.test(txt)) errors.network.push(txt);
      else errors.console.push(txt);
    });
  }
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    if (!localStorage.getItem("passio_mvp_state_v1")) {
      localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
    }
  }, [GATE_KEY, GATE_TOKEN, onboardedState(1)]);
  await page.goto("/index.html" + (preview ? PREVIEW : ""));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-feed");
    return el && el.classList.contains("active");
  }, null, { timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const l = document.getElementById("landing");
    if (l) l.classList.remove("active");
    window.supaPublishPostWithRetry = async () => false;
    window.supaUpsertProfile = async () => {};
  });
}

async function screenIsActive(page, screen) {
  await page.waitForFunction((s) => {
    const el = document.getElementById("screen-" + s);
    return el && el.classList.contains("active");
  }, screen, { timeout: 8000 });
}

// ── ① L'URL normale ne bouge pas ────────────────────────────────────────────
test("URL normale : la navigation actuelle est intacte, aucun nœud V2 créé", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { errors });

  // Pas un seul artefact de l'aperçu.
  await expect(page.locator("#appNavV2")).toHaveCount(0);
  await expect(page.locator("#v2CreateSheet")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.classList.contains("passio-ui-v2"))).toBe(false);

  // La barre historique reste VISIBLE et pilote toujours la navigation.
  const legacy = page.locator("#appNav");
  await expect(legacy).toBeVisible();
  await expect(page.locator('#appNav .nav-item[data-screen="feed"]')).toBeVisible();
  await expect(page.locator('#appNav .nav-item[data-screen="studio"]')).toBeVisible();
  await page.click('#appNav .nav-item[data-screen="irl"]');
  await screenIsActive(page, "irl");

  // Le haut du fil est explicitement préservé par la décision produit :
  // bulles de profils et ligne d'onglets Mood restent en place et inchangées.
  await page.click('#appNav .nav-item[data-screen="feed"]');
  await screenIsActive(page, "feed");
  await expect(page.locator("#profileStrip")).toHaveCount(1);
  await expect(page.locator("#moodSelector")).toHaveCount(1);

  expect(errors.js, "exceptions JS sur l'URL normale").toEqual([]);
  expect(errors.console, "console.error sur l'URL normale").toEqual([]);
});

// ── ② Les cinq destinations de l'aperçu ─────────────────────────────────────
test("aperçu : cinq entrées libellées, chacune menant à sa route existante", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { preview: true, errors });

  const nav = page.locator("#appNavV2");
  await expect(nav).toBeVisible();
  // La barre historique est masquée, pas supprimée : les mécaniques qui la
  // cherchent (applyNavOrder, dépromotion CDV, synchro d'état actif) tiennent.
  await expect(page.locator("#appNav")).toBeHidden();
  await expect(page.locator("#appNav")).toHaveCount(1);

  const items = nav.locator(".nav-v2-item");
  await expect(items).toHaveCount(5);

  for (let i = 0; i < V2_NAV.length; i++) {
    const entry = V2_NAV[i];
    const el = items.nth(i);
    await expect(el, `entrée ${i + 1}`).toHaveAttribute("data-v2-key", entry.key);
    // Libellé VISIBLE — c'est l'objet du lot, pas seulement présent dans le DOM.
    const label = el.locator(".nav-label");
    await expect(label).toBeVisible();
    await expect(label).toHaveText(entry.label);
  }

  // Les quatre destinations d'écran mènent réellement à leur écran.
  for (const entry of V2_NAV.filter((e) => e.screen)) {
    await nav.locator(`.nav-v2-item[data-v2-key="${entry.key}"]`).click();
    await screenIsActive(page, entry.screen);
    // …et l'entrée correspondante prend l'état actif.
    await expect(nav.locator(`.nav-v2-item[data-v2-key="${entry.key}"]`)).toHaveClass(/active/);
  }

  expect(errors.js, "exceptions JS dans l'aperçu").toEqual([]);
  expect(errors.console, "console.error dans l'aperçu").toEqual([]);
});

// ── Le bouton central ouvre une feuille, pas le Studio ──────────────────────
test("aperçu : « Créer » ouvre le sélecteur et non l'écran Studio", async ({ page }) => {
  await boot(page, { preview: true });

  const before = await page.evaluate(() => {
    const el = document.querySelector(".screen.active");
    return el ? el.id : null;
  });
  expect(before).toBe("screen-feed");

  await page.click('#appNavV2 [data-v2-action="create"]');
  const sheet = page.locator("#v2CreateSheet");
  await expect(sheet).toBeVisible();
  await expect(page.locator('#appNavV2 [data-v2-action="create"]')).toHaveAttribute("aria-expanded", "true");

  // L'écran n'a PAS changé : le tap n'active plus immédiatement le Studio.
  expect(await page.evaluate(() => document.querySelector(".screen.active").id)).toBe("screen-feed");

  // Les quatre choix de la direction produit, dans l'ordre.
  const titles = await sheet.locator(".v2-sheet-item-title").allTextContents();
  expect(titles).toEqual(["Publication", "Bobine", "Activité IRL", "Plus"]);

  // « Plus » reste dans la feuille et expose Story + audio/podcast.
  await sheet.locator('[data-v2-create="more"]').click();
  const more = await sheet.locator(".v2-sheet-item-title").allTextContents();
  expect(more).toEqual(["Story", "Audio / podcast", "Retour"]);
  await sheet.locator('[data-v2-create="back"]').click();
  await expect(sheet.locator('[data-v2-create="post"]')).toBeVisible();

  // Échap referme, le focus revient au bouton central (clavier utilisable).
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page.locator('#appNavV2 [data-v2-action="create"]')).toHaveAttribute("aria-expanded", "false");

  // « Publication » réutilise le moteur existant : elle ouvre le Studio.
  await page.click('#appNavV2 [data-v2-action="create"]');
  await sheet.locator('[data-v2-create="post"]').click();
  await screenIsActive(page, "studio");
  await expect(sheet).toBeHidden();
});

// ── Les choix « Créer » rouvrent les moteurs EXISTANTS, ils n'en créent pas ──
test("aperçu : chaque choix « Créer » rebranche un éditeur existant", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { preview: true, errors });

  const sheet = page.locator("#v2CreateSheet");

  // Bobine → éditeur média du projet (`meOpen("bobine")`), pas un nouvel écran.
  await page.click('#appNavV2 [data-v2-action="create"]');
  await sheet.locator('[data-v2-create="bobine"]').click();
  await page.waitForFunction(() => {
    const ed = document.getElementById("mediaEditor");
    return ed && ed.classList.contains("open");
  }, null, { timeout: 8000 });
  expect(await page.evaluate(() => document.getElementById("meTitle").textContent)).toBe("Bobine");
  await page.evaluate(() => { if (typeof meClose === "function") meClose(); });

  // Activité IRL → formulaire d'événement existant (`openCreateEvent`).
  await page.click('#appNavV2 [data-v2-action="create"]');
  await sheet.locator('[data-v2-create="irl"]').click();
  await page.waitForFunction(() => {
    const b = document.getElementById("modalBackdrop");
    return b && b.classList.contains("active") && !!document.getElementById("evTitle");
  }, null, { timeout: 8000 });
  await page.evaluate(() => { if (typeof closeModal === "function") closeModal(); });

  // Plus → Story → même éditeur média, en mode story.
  await page.click('#appNavV2 [data-v2-action="create"]');
  await sheet.locator('[data-v2-create="more"]').click();
  await sheet.locator('[data-v2-create="story"]').click();
  await page.waitForFunction(() => {
    const ed = document.getElementById("mediaEditor");
    return ed && ed.classList.contains("open");
  }, null, { timeout: 8000 });
  expect(await page.evaluate(() => document.getElementById("meTitle").textContent)).toBe("Story");
  await page.evaluate(() => { if (typeof meClose === "function") meClose(); });

  // Plus → Audio/podcast → Studio positionné sur le format audio.
  await page.click('#appNavV2 [data-v2-action="create"]');
  await sheet.locator('[data-v2-create="more"]').click();
  await sheet.locator('[data-v2-create="audio"]').click();
  await screenIsActive(page, "studio");
  await page.waitForFunction(() => {
    const b = document.getElementById("studioAudio");
    return b && getComputedStyle(b).display !== "none";
  }, null, { timeout: 8000 });

  expect(errors.js, "exceptions JS pendant les créations").toEqual([]);
});

// ── ③ Bobines et CDV : hors barre principale, toujours routables ────────────
test("aperçu : Bobines et CDV sortent de la barre mais restent atteignables", async ({ page }) => {
  await boot(page, { preview: true });

  // Aucune entrée de la barre V2 ne pointe vers ces deux destinations.
  await expect(page.locator('#appNavV2 [data-screen="bobines"]')).toHaveCount(0);
  await expect(page.locator('#appNavV2 [data-screen="cdv"]')).toHaveCount(0);
  const keys = await page.$$eval("#appNavV2 .nav-v2-item", (els) =>
    els.map((e) => e.getAttribute("data-v2-key")));
  expect(keys).toEqual(["discover", "meet", "create", "messages", "profile"]);

  // Les routes historiques, elles, fonctionnent exactement comme avant.
  await page.evaluate(() => goTo("cdv"));
  await screenIsActive(page, "cdv");

  await page.evaluate(() => openReels());
  await page.waitForFunction(() => {
    const v = document.getElementById("reelsViewer");
    return v && v.classList.contains("open");
  }, null, { timeout: 8000 });
  await page.evaluate(() => { if (typeof closeReels === "function") closeReels(); });

  // Explorer et Studio restent des destinations valides hors barre primaire.
  await page.evaluate(() => goTo("explore"));
  await screenIsActive(page, "explore");
  await page.evaluate(() => goTo("studio"));
  await screenIsActive(page, "studio");

  // Deep link historique : le hash CDV continue de router.
  await page.evaluate(() => goTo("feed"));
  await screenIsActive(page, "feed");
  await page.evaluate(() => goTo("cdv"));
  await screenIsActive(page, "cdv");
});

// ── ④ L'aperçu ne persiste rien ─────────────────────────────────────────────
test("aperçu : aucun réglage durable écrit, profil actif inchangé", async ({ page }) => {
  await boot(page, { preview: true });

  const configBefore = await page.evaluate(() => localStorage.getItem("passio_config"));
  const profileBefore = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("passio_mvp_state_v1")).user.currentProfileId; }
    catch (e) { return null; }
  });

  // Usage complet de l'aperçu : les cinq entrées et la feuille « Créer ».
  for (const entry of V2_NAV.filter((e) => e.screen)) {
    await page.click(`#appNavV2 .nav-v2-item[data-v2-key="${entry.key}"]`);
    await screenIsActive(page, entry.screen);
  }
  await page.click('#appNavV2 [data-v2-action="create"]');
  await page.keyboard.press("Escape");

  // Rien n'a été écrit : ni drapeau d'aperçu, ni navOrder, ni profil actif.
  expect(await page.evaluate(() => localStorage.getItem("passio_ui_v2"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("passio_config"))).toBe(configBefore);
  expect(await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("passio_mvp_state_v1")).user.currentProfileId; }
    catch (e) { return null; }
  })).toBe(profileBefore);

  // Le kill switch reste prioritaire, même sur l'URL de l'aperçu.
  expect(await page.evaluate(() => {
    window.PASSIO_UI_V2 = false;
    return window.PassioUIV2.isEnabled();
  })).toBe(false);

  // Rafraîchir l'URL NORMALE restaure l'interface actuelle : c'est la garantie
  // centrale du contrat d'aperçu (l'état local est conservé par le helper).
  await page.goto("/index.html");
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-feed");
    return el && el.classList.contains("active");
  }, null, { timeout: 20000 });
  await expect(page.locator("#appNavV2")).toHaveCount(0);
  await expect(page.locator("#appNav")).toBeVisible();
});

// ── ④ bis — une ancienne config `navOrder` est normalisée, jamais effacée ───
test("aperçu : ancien navOrder normalisé sans effacer les autres réglages", async ({ page }) => {
  // Configuration héritée : ordre personnalisé de l'ancienne barre + un réglage
  // sans rapport, qui doit survivre intact à la visite de l'aperçu.
  const CONFIG = { navOrder: ["cdv", "irl", "studio", "bobines", "feed"], accent: "ocean", radius: "pill" };
  await page.addInitScript((cfg) => {
    localStorage.setItem("passio_config", JSON.stringify(cfg));
  }, CONFIG);
  await boot(page, { preview: true });

  // La barre V2 impose son ordre produit : l'ancien classement ne la traverse pas.
  const keys = await page.$$eval("#appNavV2 .nav-v2-item", (els) =>
    els.map((e) => e.getAttribute("data-v2-key")));
  expect(keys).toEqual(["discover", "meet", "create", "messages", "profile"]);

  // …et la configuration de l'utilisateur ressort telle quelle, navOrder compris.
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("passio_config")));
  expect(after).toEqual(CONFIG);
});

// ── ⑤ Cadrage mobile 390 × 844 ──────────────────────────────────────────────
test("aperçu 390 × 844 : libellés entiers, cibles tactiles suffisantes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, { preview: true });

  const mesures = await page.$$eval("#appNavV2 .nav-v2-item", (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const label = el.querySelector(".nav-label");
      const lr = label.getBoundingClientRect();
      return {
        key: el.getAttribute("data-v2-key"),
        w: r.width, h: r.height,
        texte: label.textContent,
        // Troncature réelle : le texte déborde-t-il de sa boîte ?
        tronque: label.scrollWidth > Math.ceil(lr.width) + 1,
        labelVisible: getComputedStyle(label).display !== "none" && lr.height > 0,
      };
    }));

  expect(mesures).toHaveLength(5);
  for (const m of mesures) {
    expect(m.labelVisible, `libellé visible pour « ${m.texte} »`).toBe(true);
    expect(m.tronque, `libellé « ${m.texte} » tronqué`).toBe(false);
    // Seuil tactile : 44 px de haut minimum (référence mobile du projet).
    expect(m.h, `hauteur tactile de « ${m.texte} »`).toBeGreaterThanOrEqual(44);
    expect(m.w, `largeur tactile de « ${m.texte} »`).toBeGreaterThanOrEqual(44);
  }

  // La barre reste dans le cadre : elle ne doit pas dépasser sous l'écran.
  const dansLeCadre = await page.evaluate(() => {
    const r = document.getElementById("appNavV2").getBoundingClientRect();
    return r.bottom <= window.innerHeight + 1 && r.top > 0;
  });
  expect(dansLeCadre, "barre du bas dans la zone visible").toBe(true);

  // Les choix de la feuille « Créer » sont eux aussi confortables au pouce.
  await page.click('#appNavV2 [data-v2-action="create"]');
  const items = await page.$$eval("#v2CreateSheet .v2-sheet-item", (els) =>
    els.map((el) => ({ h: el.getBoundingClientRect().height,
                       t: el.querySelector(".v2-sheet-item-title").textContent })));
  for (const i of items) {
    expect(i.h, `hauteur du choix « ${i.t} »`).toBeGreaterThanOrEqual(44);
  }
});
