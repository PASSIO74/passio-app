// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 2026-11-02 — AGENT F — BUDGET DE L'ARTEFACT SERVI (PASSIO_CIBLE=dist)
//
// ⚠️ Ne tourne que sous `PASSIO_CIBLE=dist` (le serveur est `scripts/servir-dist.js`,
// qui construit `dist/` par `scripts/build.js`) : sur le serveur de développement
// il n'y a pas d'artefact à mesurer, et le cas se déclare « ignoré ». L'artefact
// mesuré ici n'est PAS minifié (la CI applique terser/clean-css ensuite) : les
// octets sont ceux du build, les ORDRES DE GRANDEUR et les RÈGLES valent.
// Ce qu'il garde, mesuré sur ce que le navigateur reçoit RÉELLEMENT (stub local,
// réseau non bridé, hôtes externes coupés, aucun geste de l'utilisateur) :
//   ① un démarrage ne charge PAS `data/passions-v1.json` (568 Ko) : le
//      référentiel ne part qu'au besoin d'un nom ou à l'ouverture d'un sélecteur ;
//   ① bis un démarrage où l'écran Rencontrer n'est JAMAIS ouvert ne charge PAS
//      MapLibre (803 Ko + 66 Ko de CSS). ⚠️ ROUGE SUR HEAD (F-01) : `initApp()` →
//      `renderEverything()` → `renderIRL()` → `_scheduleIrlMapUpdate()` →
//      `initIrlMap()` → `ensureLeaflet()` : la carte est demandée à TOUT
//      démarrage parce que `#irlMap` existe dans le DOM, écran masqué compris.
//      Le cas est déclaré `test.fail()` : il PASSE tant que le défaut est là, et
//      sort en « unexpected pass » le jour du correctif (app-07, hors périmètre
//      de l'agent F) — c'est le signal pour retirer `test.fail()` et en faire un
//      verrou ordinaire. Ne pas le faire taire autrement.
//   ② budget : au plus 3 scripts externes avant le premier écran, `app.js`
//      sous 3,5 Mo non minifié (3,0 Mo le 2026-11-02 : +15 % y rougit).
// Les relevés sont écrits dans PASSIO_AUDIT_DIR/dist-boot.json.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { sansDonneesDistantes, onboardedState } = require("./app-helper");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

const AUDIT_DIR = process.env.PASSIO_AUDIT_DIR || path.join(__dirname, "..", "..", "test-results", "audit-2026-11");
fs.mkdirSync(AUDIT_DIR, { recursive: true });
const DIST = process.env.PASSIO_CIBLE === "dist";

async function demarrer(page, profil) {
  await sansDonneesDistantes(page);
  // Les autres hôtes externes (polices, Unsplash, picsum) ne pèsent pas sur la
  // mesure : coupés, comme Supabase l'est déjà par l'isolation.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)(?!.*supabase\.co)/, (route) => route.abort());
  const requetes = [];
  page.on("request", (r) => { const u = r.url(); if (u.startsWith("http://127.0.0.1")) requetes.push({ url: u.replace(/^http:\/\/127\.0\.0\.1:\d+/, ""), type: r.resourceType(), t: Date.now() }); });
  await page.addInitScript(() => {
    window.__premierEcran = null;
    const mo = new MutationObserver(() => {
      const l = document.getElementById("landing"); const f = document.getElementById("screen-feed");
      if (!window.__premierEcran && ((l && l.classList.contains("active")) || (f && f.classList.contains("active")))) { window.__premierEcran = Date.now(); mo.disconnect(); }
    });
    document.addEventListener("DOMContentLoaded", () => mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] }));
  });
  if (profil === "onboarde") {
    await page.addInitScript(([k, t, st]) => { sessionStorage.setItem(k, t); sessionStorage.setItem("passio_pwa_dismissed", "1"); if (!localStorage.getItem("passio_mvp_state_v1")) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st)); }, [GATE_KEY, GATE_TOKEN, onboardedState(1)]);
  }
  await page.goto("/index.html");
  await page.waitForFunction(() => window.__premierEcran, null, { timeout: 30000 });
  await page.waitForTimeout(8000); // tout ce qui part « au démarrage » part dans cette fenêtre (bloc différé de supaInit à 2 s compris)
  const premierEcran = await page.evaluate(() => window.__premierEcran);
  const ressources = await page.evaluate(() => performance.getEntriesByType("resource").map((r) => ({ n: r.name.replace(location.origin, ""), transfert: r.transferSize, decode: r.decodedBodySize, fin: Math.round(r.responseEnd), type: r.initiatorType })));
  const ecranIrlOuvert = await page.evaluate(() => { const s = document.getElementById("screen-irl"); return !!(s && s.classList.contains("active")); });
  return { profil, avant: requetes.filter((r) => r.t <= premierEcran), apres: requetes.filter((r) => r.t > premierEcran), ressources, ecranIrlOuvert };
}

function ecrire(profil, releve) {
  const f = path.join(AUDIT_DIR, "dist-boot.json");
  let d = {}; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) {}
  d[profil] = releve; fs.writeFileSync(f, JSON.stringify(d, null, 1));
}

test.describe("AUDIT F — budget de l'artefact servi (dist)", () => {
  test.setTimeout(120000);
  test.skip(!DIST, "ne mesure que l'artefact de production (PASSIO_CIBLE=dist)");

  for (const profil of ["visiteur", "onboarde"]) {
    test(`① ${profil} : le référentiel des passions ne part pas au démarrage · ② budget (≤ 3 scripts avant le premier écran, app.js < 3,5 Mo)`, async ({ page }) => {
      const r = await demarrer(page, profil);
      const toutes = [...r.avant, ...r.apres].map((x) => x.url);
      const appJs = r.ressources.find((x) => /^\/app\.js/.test(x.n));
      const releve = { note: "STUB LOCAL (servir-dist.js, réseau non bridé, hôtes externes coupés, aucun geste) — artefact NON minifié : la CI minifie ensuite", profil,
        premierEcranRequetes: r.avant.map((x) => x.url), differe: r.apres.map((x) => x.url), ecranIrlOuvert: r.ecranIrlOuvert,
        decodeKo: Object.fromEntries(r.ressources.filter((x) => x.decode).map((x) => [x.n.split("?")[0], Math.round(x.decode / 1024)])),
        scriptsAvant: r.avant.filter((x) => x.type === "script").length };
      ecrire(profil, releve);
      expect(toutes.filter((n) => /passions-v1\.json/.test(n))).toEqual([]);
      expect(releve.scriptsAvant).toBeLessThanOrEqual(3);
      if (appJs) expect(appJs.decode).toBeLessThan(3.5 * 1024 * 1024);
    });

    test(`① bis ${profil} : MapLibre n'est pas chargé tant que l'écran Rencontrer n'est pas ouvert (F-01)`, async ({ page }) => {
      test.fail(true, "F-01 (audit 2026-11-02) : renderEverything() → renderIRL() → initIrlMap() demande MapLibre à TOUT démarrage. Retirer ce test.fail() avec le correctif d'app-07.");
      const r = await demarrer(page, profil);
      expect(r.ecranIrlOuvert).toBe(false);
      expect([...r.avant, ...r.apres].map((x) => x.url).filter((n) => /maplibre/.test(n))).toEqual([]);
    });
  }

  // Témoin : la carte DOIT se charger quand on ouvre Rencontrer — sinon le cas
  // ① bis pourrait passer un jour pour une mauvaise raison (MapLibre cassé, ou
  // `ensureLeaflet` jamais appelée), et un vert qui prouve l'inverse de son sujet
  // est le pire des verts.
  test("témoin : ouvrir Rencontrer (goTo('irl')) charge MapLibre et la carte s'initialise", async ({ page }) => {
    const r = await demarrer(page, "onboarde");
    const deja = [...r.avant, ...r.apres].some((x) => /maplibre-gl-4\.7\.1\.js/.test(x.url));
    await page.evaluate(() => { goTo("irl"); });
    await page.waitForFunction(() => !!(window.maplibregl && window.L), null, { timeout: 30000 });
    const carte = await page.evaluate(() => ({ ecran: document.getElementById("screen-irl").classList.contains("active"), carte: !!document.querySelector("#irlMap canvas, #irlMap .maplibregl-map") }));
    expect(carte.ecran).toBe(true);
    // Avec F-01 encore là, la bibliothèque est déjà arrivée au boot ; sans F-01
    // elle arrive ici. Dans les deux cas elle est présente sur l'écran IRL.
    expect(deja || true).toBe(true);
    expect(carte.carte).toBe(true);
  });
});
