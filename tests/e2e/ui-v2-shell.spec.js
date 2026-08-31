// Lot UI-1 — cadre visuel et navigation V2, actif par défaut depuis validation.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① le kill switch restaure exactement la navigation historique ;
//   ② l'URL normale expose cinq destinations, libellées et atteignables ;
//   ③ Bobines quitte la barre principale mais reste routable (CDV est retiré) ;
//   ④ la V2 n'écrit AUCUN réglage durable et ne change pas le profil actif ;
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

async function boot(page, { preview = false, legacy = false, errors = null } = {}) {
  if (errors) {
    page.on("pageerror", (e) => errors.js.push("pageerror: " + e.message));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const txt = m.text();
      if (/Failed to load resource|net::|ERR_/.test(txt)) errors.network.push(txt);
      else errors.console.push(txt);
    });
  }
  await page.addInitScript(([k, t, st, useLegacy]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    if (useLegacy) localStorage.setItem("passio_ui_v2", "0");
    if (!localStorage.getItem("passio_mvp_state_v1")) {
      localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
    }
  }, [GATE_KEY, GATE_TOKEN, onboardedState(1), legacy]);
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

// ── ① Le kill switch restaure l'interface historique ────────────────────────
test("kill switch : navigation historique intacte, aucun nœud V2 créé", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { legacy: true, errors });

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

  expect(errors.js, "exceptions JS avec le kill switch").toEqual([]);
  expect(errors.console, "console.error avec le kill switch").toEqual([]);
});

// ── ② Les cinq destinations sur l'URL normale ────────────────────────────────
test("URL normale : cinq entrées libellées, chacune menant à sa route existante", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { errors });

  const nav = page.locator("#appNavV2");
  await expect(nav).toBeVisible();
  // La barre historique est masquée, pas supprimée : les mécaniques qui la
  // cherchent (applyNavOrder, synchro d'état actif) tiennent.
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

  expect(errors.js, "exceptions JS dans la V2").toEqual([]);
  expect(errors.console, "console.error dans la V2").toEqual([]);
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

  // TOUT ce que l'on peut créer, d'un seul tenant et dans l'ordre : c'est
  // l'objet du changement du 2026-08-29 (« ça évite deux manips »).
  const titles = await sheet.locator(".v2-sheet-item-title").allTextContents();
  expect(titles).toEqual([
    "Publication", "Bobine", "Activité IRL", "Story", "Live vidéo", "Audio / podcast",
  ]);

  // Le sous-menu a disparu : ni « Plus », ni « Retour », nulle part.
  await expect(sheet.locator('[data-v2-create="more"]')).toHaveCount(0);
  await expect(sheet.locator('[data-v2-create="back"]')).toHaveCount(0);

  // Les six entrées sont atteignables SANS second tap, et chacune reste une
  // cible tactile réglementaire — c'est ce que la liste longue met en jeu.
  for (const key of ["post", "bobine", "irl", "story", "live", "audio"]) {
    const item = sheet.locator(`[data-v2-create="${key}"]`);
    await expect(item).toBeVisible();
    const h = await item.evaluate((el) => el.getBoundingClientRect().height);
    expect(h, `cible « ${key} » trop petite`).toBeGreaterThanOrEqual(44);
  }

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

  // Story → même éditeur média, en mode story (un seul tap depuis « + »).
  await page.click('#appNavV2 [data-v2-action="create"]');
  await sheet.locator('[data-v2-create="story"]').click();
  await page.waitForFunction(() => {
    const ed = document.getElementById("mediaEditor");
    return ed && ed.classList.contains("open");
  }, null, { timeout: 8000 });
  expect(await page.evaluate(() => document.getElementById("meTitle").textContent)).toBe("Story");
  await page.evaluate(() => { if (typeof meClose === "function") meClose(); });

  // Audio/podcast → Studio positionné sur le format audio.
  await page.click('#appNavV2 [data-v2-action="create"]');
  await sheet.locator('[data-v2-create="audio"]').click();
  await screenIsActive(page, "studio");
  await page.waitForFunction(() => {
    const b = document.getElementById("studioAudio");
    return b && getComputedStyle(b).display !== "none";
  }, null, { timeout: 8000 });

  // Live vidéo. Cette entrée est le SEUL point d'accès à
  // `startVideoLive()` depuis le 2026-08-28 : la bulle « Live » de la barre des
  // stories a été retirée le même jour (doublon d'une action de création placée
  // dans une barre qui montre ce que les gens publient). Le test vérifie que
  // l'entrée existe ET qu'elle appelle bien le moteur — sans la déclencher pour
  // de vrai, `startVideoLive` demandant la caméra.
  await page.evaluate(() => {
    window.__liveLance = 0;
    window.startVideoLive = function () { window.__liveLance++; };
  });
  await page.click('#appNavV2 [data-v2-action="create"]');
  await expect(sheet.locator('[data-v2-create="live"]')).toBeVisible();
  await sheet.locator('[data-v2-create="live"]').click();
  expect(await page.evaluate(() => window.__liveLance)).toBe(1);

  expect(errors.js, "exceptions JS pendant les créations").toEqual([]);
});

// La bulle « Live » de création a quitté la barre des stories, mais les directs
// EN COURS doivent continuer d'y apparaître, mêlés aux autres bulles — c'est
// exactement ce que Benjamin a demandé. Sans ce test, retirer la bulle de
// création pourrait emporter les vrais lives sans que personne le voie.
test("barre des stories : plus de bulle de création Live, mais les vrais directs restent", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window._videoLives = [{
      id: "vl_test", author_id: "autre_compte", author_name: "Nina Costa",
      author_emoji: "🎸", author_photo: "", title: "Session guitare",
    }];
    renderStories();
  });

  const row = page.locator("#storiesRowFeed");
  // Aucune bulle de CRÉATION de live.
  await expect(row.locator(".story-ring.vlive-create")).toHaveCount(0);
  await expect(row.locator('[onclick="startVideoLive()"]')).toHaveCount(0);
  // Mais le direct réel est bien là, avec les autres.
  await expect(row.locator(".story-ring.vlive-ring")).toHaveCount(1);
  await expect(row.locator(".vlive-label")).toContainText("Nina");
  // Et « Ta story » n'a pas bougé.
  await expect(row.locator(".story-item").first()).toContainText("Ta story");
});

// ── ③ Bobines hors barre principale, toujours routable ─────────────────────
// ⚠️ CDV a quitté ce cas avec la fonctionnalité (ADR-011 §5). Ce qui le
// remplace n'est pas rien : sa route est REDIRIGÉE, donc un ancien lien ne
// laisse jamais l'application sans écran actif — c'est vérifié en fin de test.
test("aperçu : Bobines sort de la barre mais reste atteignable", async ({ page }) => {
  await boot(page, { preview: true });

  // Aucune entrée de la barre V2 ne pointe vers ces deux destinations.
  await expect(page.locator('#appNavV2 [data-screen="bobines"]')).toHaveCount(0);
  await expect(page.locator('#appNavV2 [data-screen="cdv"]')).toHaveCount(0);
  const keys = await page.$$eval("#appNavV2 .nav-v2-item", (els) =>
    els.map((e) => e.getAttribute("data-v2-key")));
  expect(keys).toEqual(["discover", "meet", "create", "messages", "profile"]);

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

  // Deep link historique : `#cdv` ne route plus vers un écran CDV — il n'y en a
  // plus — mais il REDIRIGE vers le fil. Un lien mémorisé ne doit jamais laisser
  // l'application sans écran actif.
  await page.evaluate(() => goTo("profiles"));
  await screenIsActive(page, "profiles");
  await page.evaluate(() => goTo("cdv"));
  await screenIsActive(page, "feed");
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

  // Le kill switch persistant restaure l'interface historique au rechargement.
  await page.evaluate(() => localStorage.setItem("passio_ui_v2", "0"));
  await page.goto("/index.html");
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-feed");
    return el && el.classList.contains("active");
  }, null, { timeout: 20000 });
  await expect(page.locator("#appNavV2")).toHaveCount(0);
  await expect(page.locator("#appNav")).toBeVisible();
});

// ── ④ ter — un « 1 » hérité reste sans effet propre ─────────────────────────
test("URL normale : un passio_ui_v2 « 1 » hérité ne change pas le défaut V2", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await page.addInitScript(() => {
    // Valeur laissée par une version antérieure du module.
    localStorage.setItem("passio_ui_v2", "1");
  });
  await boot(page, { errors });

  // La V2 vient du déploiement par défaut, pas de cette valeur héritée.
  await expect(page.locator("#appNavV2")).toBeVisible();
  await expect(page.locator("#v2CreateSheet")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.classList.contains("passio-ui-v2"))).toBe(true);
  expect(await page.evaluate(() => window.PassioUIV2.isEnabled())).toBe(true);

  // …et c'est bien la navigation V2 qui pilote l'écran.
  await expect(page.locator("#appNav")).toBeHidden();
  await page.click('#appNavV2 .nav-v2-item[data-v2-key="meet"]');
  await screenIsActive(page, "irl");

  // La valeur héritée est ignorée, pas réécrite : l'aperçu n'écrit jamais.
  expect(await page.evaluate(() => localStorage.getItem("passio_ui_v2"))).toBe("1");

  expect(errors.js, "exceptions JS avec une valeur héritée").toEqual([]);
});

// ── L'aide contextuelle ne doit jamais recouvrir la feuille « Créer » ───────
// Vécu en test : la bulle §8 est `position: fixed`, elle se posait par-dessus la
// feuille et interceptait le tap sur le premier choix. On la ferme à l'ouverture
// plutôt que de lui passer devant — un z-index laisserait une bulle orpheline.
test("aperçu : « Créer » ferme l'aide contextuelle qui la recouvrirait", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { preview: true, errors });

  // Profil unique → l'aide « second profil » s'arme sur l'écran Profil.
  expect(await page.evaluate(() => (state.user.profiles || []).length)).toBe(1);
  await page.click('#appNavV2 .nav-v2-item[data-v2-key="profile"]');
  await screenIsActive(page, "profiles");

  // On EXIGE que l'aide soit apparue : sans elle, le test ne prouverait rien.
  const aide = page.locator(".passio-hint");
  await expect(aide, "l'aide contextuelle doit s'afficher pour que le test ait un sens").toBeVisible({ timeout: 8000 });

  await page.click('#appNavV2 [data-v2-action="create"]');
  const sheet = page.locator("#v2CreateSheet");
  await expect(sheet).toBeVisible();

  // Plus aucune bulle : ni visible, ni orpheline dans le DOM.
  await expect(page.locator(".passio-hint")).toHaveCount(0);

  // Le premier choix est ENTIÈREMENT visible et réellement cliquable — c'est le
  // symptôme qui avait été observé, pas seulement la présence du nœud.
  const premier = sheet.locator('[data-v2-create="post"]');
  await expect(premier).toBeVisible();
  const geo = await premier.evaluate((el) => {
    const r = el.getBoundingClientRect();
    // Élément réellement au-dessus au centre de la cible ?
    const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      dansLEcran: r.top >= 0 && r.bottom <= window.innerHeight && r.height >= 44,
      atteignable: !!(dessus && el.contains(dessus)),
    };
  });
  expect(geo.dansLEcran, "premier choix entièrement dans l'écran, ≥ 44 px").toBe(true);
  expect(geo.atteignable, "premier choix atteignable au tap (rien par-dessus)").toBe(true);

  // Et il fonctionne : le clic réel ouvre bien le Studio.
  await premier.click();
  await screenIsActive(page, "studio");

  expect(errors.js, "exceptions JS pendant l'ouverture de Créer").toEqual([]);
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
