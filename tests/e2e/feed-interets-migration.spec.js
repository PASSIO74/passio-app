// Suite « Intérêts du Fil : migration et vide voulu » — spec §12 du lot
// Onboarding → premier moment de valeur.
//
// La spec dit les deux choses à la fois :
//
//   « si selectedFeedPassions absent/vide ET profils passion présents
//     → initialiser depuis les passions uniques des profils existants »
//   « Ne pas le faire si l'utilisateur a explicitement vidé ses filtres dans le
//     nouveau modèle : d'où l'intérêt d'un marqueur de migration explicite. »
//
// Sans marqueur, les deux cas sont INDISCERNABLES : une liste vide peut être un
// compte d'avant le modèle, ou un choix délibéré. Mesuré le 2026-08-23 : un
// utilisateur qui décochait sa dernière passion la retrouvait cochée au
// rechargement, à chaque démarrage. `state.feedInterestsMigrated` sépare les
// deux.
const { test, expect } = require("@playwright/test");
const { sansDonneesDistantes } = require("./app-helper");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

async function boot(page, etat) {
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    window.PASSIO_ONBOARDING_V2 = true;
    // ⚠️ addInitScript se rejoue à CHAQUE navigation, rechargement compris. Une
    // injection inconditionnelle réécrirait l'état d'origine par-dessus ce que
    // l'app vient d'enregistrer — et tout test qui recharge mesurerait alors son
    // propre harnais. Mesuré ici : la migration semblait rejouer au reload, alors
    // que c'était l'init script qui effaçait le marqueur.
    if (st && !sessionStorage.getItem("__etat_injecte")) {
      localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
      sessionStorage.setItem("__etat_injecte", "1");
    }
    window.__tel = [];
  }, [GATE_KEY, GATE_TOKEN, etat || null]);
  // ⚠️ ISOLATION DES DONNÉES DISTANTES — POSÉE ICI PARCE QUE CETTE SUITE
  // NAVIGUE ELLE-MÊME. `bootOnboarded` la pose par défaut, mais sa portée est
  // L'APPEL, pas le fichier : un `page.goto` maison garde son chemin exposé, et
  // le verdict du test dépend alors du CONTENU DE LA PRODUCTION. C'est ce qui a
  // rendu `main` rouge six fois en quatre jours et fait sauter autant de
  // déploiements. Verrou mécanique : `scripts/audit-tests-isolation.js`.
  await sansDonneesDistantes(page);
  await page.goto("/index.html");
  await page.waitForFunction(() => typeof setFeedPassions === "function", null, { timeout: 20000 });
  await page.evaluate(() => {
    window.supaSaveUserState = async () => {};
    window.supaUpsertProfile = async () => {};
    const vrai = (window.tel && window.tel.action) ? window.tel.action.bind(window.tel) : null;
    if (window.tel) window.tel.action = (n, m) => { window.__tel.push({ n, m }); if (vrai) { try { vrai(n, m); } catch (e) {} } };
  });
}

async function inscrire(page, passion) {
  await page.evaluate((pa) => {
    state.user.name = "Testeur"; state.user.birthYear = 1990;
    selectedPassions.length = 0; selectedPassions.push(pa);
    onbFinish();
  }, passion);
  await page.waitForTimeout(700);   // saveState est débouncé à 250 ms
}

const lire = (page) => page.evaluate(() => ({
  runtime: Array.from(_activeFeedPassions),
  persiste: state.selectedFeedPassions,
  migre: state.feedInterestsMigrated,
}));

test("§12 — retirer sa dernière passion tient au rechargement", async ({ page }) => {
  await boot(page);
  await inscrire(page, "musique");
  expect((await lire(page)).runtime).toEqual(["musique"]);

  // L'utilisateur décoche sa dernière passion : il veut un fil vide.
  await page.evaluate(() => { toggleProfileFilter("musique"); });
  await page.waitForTimeout(700);
  expect((await lire(page)).runtime).toEqual([]);

  await page.reload();
  await page.waitForFunction(() => typeof renderFeed === "function", null, { timeout: 20000 });
  await page.waitForTimeout(1200);

  const apres = await lire(page);
  // Son profil « musique » existe toujours — c'est justement ce que la migration
  // aurait repris pour lui remettre l'intérêt qu'il vient d'enlever.
  const profils = await page.evaluate(() => (state.user.profiles || []).map((p) => p.passion));
  expect(profils).toEqual(["musique"]);
  expect(apres.runtime).toEqual([]);
  expect(apres.persiste).toEqual([]);
});

test("§12 — un compte ANTÉRIEUR au modèle est bien migré depuis ses profils", async ({ page }) => {
  // Ni selectedFeedPassions, ni marqueur : c'est le cas que la migration vise.
  await boot(page, {
    onboarded: true,
    landingSeen: true,
    user: {
      name: "Ancien", birthYear: 1990,
      profiles: [
        { id: "p1", name: "Ancien", passion: "musique", emoji: "🎸" },
        { id: "p2", name: "Ancien", passion: "photo", emoji: "📷" },
      ],
      currentProfileId: "p1",
    },
  });
  await page.waitForTimeout(1200);
  const r = await lire(page);
  expect(r.runtime).toEqual(["musique", "photo"]);
  expect(r.migre).toBe(true);
});

test("§12 — la migration émet sa télémétrie, avec des clés qui survivent au filtre PII", async ({ page }) => {
  // La migration du boot part AVANT que le test puisse poser son crochet sur
  // tel.action : on la rejoue explicitement sur un état neuf plutôt que de
  // prétendre observer celle du démarrage.
  await boot(page);
  const noms = await page.evaluate(() => {
    state.user.profiles = [{ id: "p1", name: "A", passion: "musique", emoji: "🎸" }];
    state.selectedFeedPassions = [];
    state.feedInterestsMigrated = false;
    restoreFeedPassions();
    return window.__tel.map((e) => e.n);
  });
  expect(noms).toContain("feed_interests_migrated");

  const src = await page.evaluate(async () => (await fetch("/js/telemetry.js")).text());
  const m = src.match(/DENY_KEY\s*=\s*(\/[\s\S]*?\/[gimsuy]*)\s*[;,\n]/);
  expect(m).not.toBeNull();
  const deny = eval(m[1]);
  const clefs = await page.evaluate(() => {
    const out = [];
    window.__tel.forEach((e) => Object.keys(e.m || {}).forEach((k) => out.push(k)));
    return Array.from(new Set(out));
  });
  expect(clefs.length).toBeGreaterThan(0);
  clefs.forEach((k) => {
    deny.lastIndex = 0;
    expect({ cle: k, jetee: deny.test(k) }).toEqual({ cle: k, jetee: false });
  });
});

test("§12 — la migration ne se rejoue jamais deux fois", async ({ page }) => {
  await boot(page, {
    onboarded: true,
    landingSeen: true,
    user: {
      name: "Ancien", birthYear: 1990,
      profiles: [{ id: "p1", name: "Ancien", passion: "musique", emoji: "🎸" }],
      currentProfileId: "p1",
    },
  });
  await page.waitForTimeout(1200);
  expect((await lire(page)).runtime).toEqual(["musique"]);

  // Le compte est désormais dans le nouveau modèle : il vide ses filtres.
  await page.evaluate(() => { setFeedPassions([]); });
  await page.waitForTimeout(700);

  await page.reload();
  await page.waitForFunction(() => typeof renderFeed === "function", null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  const apres = await lire(page);
  expect(apres.runtime).toEqual([]);   // la migration ne rejoue pas
  expect(apres.migre).toBe(true);
});

test("§12 — aucun profil, aucun intérêt : rien à migrer, et rien n'est inventé", async ({ page }) => {
  await boot(page, {
    onboarded: true, landingSeen: true,
    user: { name: "Vide", birthYear: 1990, profiles: [], currentProfileId: null },
  });
  await page.waitForTimeout(1200);
  const r = await lire(page);
  expect(r.runtime).toEqual([]);
  // Pas de profil ⇒ la migration n'a rien fait : le marqueur reste à false pour
  // qu'elle puisse s'exécuter plus tard, quand un profil existera.
  expect(r.migre).toBe(false);
  const noms = await page.evaluate(() => window.__tel.map((e) => e.n));
  expect(noms).not.toContain("feed_interests_migrated");
});
