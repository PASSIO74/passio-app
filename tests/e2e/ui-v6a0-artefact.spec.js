// ═══════════════════════════════════════════════════════════════════════════
// UI-6A0 SUR L'ARTEFACT DE PRODUCTION — le lot s'applique quand le moteur
// arrive APRÈS lui (2026-11-09)
//
// `ui-v6a0-activite.spec.js` tourne sur les fichiers de développement, où
// `js/ui-v6a0-activite.js` suit le bloc app : `openCreateEvent` existe à son
// chargement et l'enveloppe se pose tout de suite. En production,
// `scripts/build.js` inline le module dans la page, et le bloc app arrive en
// neuf scripts injectés APRÈS le gate, donc après `DOMContentLoaded`. Le module
// n'écoutait pas `passio:app-ready` : le lot ne s'est jamais appliqué en
// production (titre « Créer un événement IRL », pas de garde du double envoi),
// et toute sa suite restait verte. Mesuré : 10 rouges sur l'artefact, 0 en dev.
//
// Cette suite construit l'artefact (`scripts/build.js`, 0,2 s) et le sert À LA
// PLACE des fichiers de développement, sur la même origine : `bootOnboarded`, son
// isolation et ses routes restent ceux de toutes les suites. Le premier script du
// bloc est RETENU jusqu'à `DOMContentLoaded` : le moteur est absent à ce moment,
// comme en production, quelle que soit la vitesse de la machine.
//
//   ① sur l'artefact, le lot range la modale et garde l'envoi ;
//   ② un second `passio:app-ready`, même quand un autre module a enveloppé
//      `submitEvent` par-dessus le lot, ne pose pas une seconde enveloppe :
//      la seconde garde bloquerait TOUT envoi (zéro activité publiée).
// Fiche : docs/lots-ui/27-UI6A0-ARTEFACT-2026-11-09.md.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const RACINE = path.join(__dirname, "..", "..");
let dist = null;

test.beforeAll(() => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), "passio-v6a0-artefact-"));
  execFileSync(process.execPath, ["scripts/build.js", path.join(dist, "index.html")], { cwd: RACINE, stdio: "pipe" });
});

test.afterAll(() => {
  if (dist) fs.rmSync(dist, { recursive: true, force: true });
});

// Sert l'artefact à la place des fichiers de développement. Rend le journal des
// chemins demandés : la preuve que c'est bien l'artefact qui a tourné.
async function servirArtefact(page, baseURL) {
  const origine = new URL(baseURL).origin;
  let liberer;
  const domPret = new Promise((ok) => { liberer = ok; });
  const journal = [];
  await page.exposeFunction("__passioDomPret", () => { liberer(); });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      window.__moteurAuDcl = typeof window.openCreateEvent;
      window.__passioDomPret();
    }, { once: true });
  });
  await page.route((url) => url.origin === origine, async (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, "") || "index.html";
    journal.push(rel);
    if (/^app\/app-01/.test(rel)) await domPret;
    const f = path.join(dist, rel);
    if (f.startsWith(dist + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ path: f });
    return route.continue();
  });
  return journal;
}

// Même compteur que `ui-v6a0-activite.spec.js` ④ : `submitEvent` appelle
// `requireAdmission` (global) avant toute écriture ; ralenti et refusé, rien
// n'est écrit, et chaque passage dans le moteur est compté.
async function compterEnvois(page) {
  await page.evaluate(() => {
    window.__envois = 0;
    window.requireAuthentication = () => true;
    window.requireAdmission = async () => { window.__envois++; await new Promise((r) => setTimeout(r, 400)); return false; };
  });
}

async function ouvrir(page) {
  await page.evaluate(() => openCreateEvent());
  await page.waitForSelector("#modalContent #evTitle");
}

test.describe("UI-6A0 sur l'artefact de production", () => {
  test("① le moteur arrive après DOMContentLoaded : le lot range la modale et garde l'envoi", async ({ page, baseURL }) => {
    const journal = await servirArtefact(page, baseURL);
    await bootOnboarded(page, null, 1, {});

    // C'est bien l'artefact, et bien le scénario de production.
    expect(journal, "la page servie est l'artefact construit").toContain("app/app-07-ia-explore-irl.js");
    expect(journal.filter((r) => r.startsWith("js/ui-v") || r.startsWith("js/app-0")), "aucun fichier de développement").toEqual([]);
    expect(await page.evaluate(() => window.__moteurAuDcl), "moteur absent à DOMContentLoaded, comme en production").toBe("undefined");

    await ouvrir(page);
    await expect(page.locator("#modalContent .modal-title")).toHaveText("Créer une activité");
    expect(await page.evaluate(() => document.getElementById("modalContent").classList.contains("v6a0"))).toBe(true);
    await expect(page.locator("#modalContent details.v6a0-options")).toHaveCount(1);
    await expect(page.locator("#modalContent .v6a0-publier")).toHaveText("Publier l'activité");

    await compterEnvois(page);
    await page.locator("#modalContent .v6a0-publier").dblclick();
    await expect(page.locator("#modalContent .v6a0-publier")).toBeEnabled({ timeout: 3000 });
    expect(await page.evaluate(() => window.__envois), "deux clics, un envoi").toBe(1);
  });

  test("② un second passio:app-ready ne double pas l'enveloppe, même sous celle d'un autre module", async ({ page, baseURL }) => {
    await servirArtefact(page, baseURL);
    await bootOnboarded(page, null, 1, {});
    await page.evaluate(() => {
      // Un autre module enveloppe `submitEvent` par-dessus le lot : la fonction
      // exposée ne porte plus le marqueur `__v6a0`.
      const lot = window.submitEvent;
      window.submitEvent = function () { return lot.apply(this, arguments); };
      window.dispatchEvent(new Event("passio:app-ready"));
    });
    await ouvrir(page);
    await expect(page.locator("#modalContent .v6a0-publier")).toHaveText("Publier l'activité");
    await compterEnvois(page);
    await page.locator("#modalContent .v6a0-publier").click();
    await expect(page.locator("#modalContent .v6a0-publier")).toBeEnabled({ timeout: 3000 });
    expect(await page.evaluate(() => window.__envois), "un envoi : zéro voudrait dire une garde doublée").toBe(1);
  });
});
