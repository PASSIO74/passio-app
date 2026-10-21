// ═══════════════════════════════════════════════════════════
// UI-6A0 — « Créer une activité » (#174) : verrou du rangement
//
// js/ui-v6a0-activite.js RANGE la modale d'openCreateEvent sans toucher au
// moteur. Ce qui est tenu ici :
//   ① la hiérarchie : couverture, Titre, Passion, Description, Quand, Où,
//      Combien — puis « Plus d'options » (récurrence, contact, lien) ;
//   ② la couverture est un vrai contrôle : rôle, tabulation, Entrée ouvre le
//      sélecteur, nom qui suit l'état, « Retirer » hors de la zone ;
//   ③ l'aperçu reprend la saisie, en TEXTE (aucun HTML interprété) ;
//   ④ deux clics sur « Publier l'activité » = un seul envoi ;
//   ⑤ coupé (`passio_ui_6a0="0"`), la modale d'avant revient, sans garde ;
//   ⑥ captures 320 / 390 / 430 pour la validation visuelle.
// ═══════════════════════════════════════════════════════════
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function boot(page, opts = {}) {
  if (opts.coupe) await page.addInitScript(() => localStorage.setItem("passio_ui_6a0", "0"));
  await bootOnboarded(page, null, 1, {});
}
async function ouvrir(page) {
  await page.evaluate(() => openCreateEvent());
  await page.waitForSelector("#modalContent #evTitle");
}
// Compte les passages dans le moteur : `submitEvent` appelle `requireAdmission`
// (global) avant toute écriture ; on le ralentit et on refuse, rien n'est écrit.
async function compterEnvois(page) {
  await page.evaluate(() => {
    window.__envois = 0;
    window.requireAuthentication = () => true;
    window.requireAdmission = async () => { window.__envois++; await new Promise((r) => setTimeout(r, 400)); return false; };
  });
}

test.describe("UI-6A0 — Créer une activité", () => {
  test("① hiérarchie : la photo d'abord, l'essentiel ensuite, les options repliées", async ({ page }) => {
    await boot(page);
    await ouvrir(page);
    await expect(page.locator("#modalContent .modal-title")).toHaveText("Créer une activité");
    const ordre = await page.evaluate(() => {
      const ids = ["evCoverPreviewWrap", "evTitle", "evPassion", "evDesc", "evDate", "evPlaceSearch", "evCity", "evMax"];
      const n = ids.map((id) => document.getElementById(id));
      if (n.some((x) => !x)) return "manquant";
      for (let i = 1; i < n.length; i++) {
        if (!(n[i - 1].compareDocumentPosition(n[i]) & Node.DOCUMENT_POSITION_FOLLOWING)) return `${ids[i - 1]} après ${ids[i]}`;
      }
      return "ok";
    });
    expect(ordre).toBe("ok");
    for (const id of ["evRecurrence", "evContact", "evLink"]) {
      expect(await page.evaluate((i) => !!document.getElementById(i).closest("details.v6a0-options"), id), `${id} dans « Plus d'options »`).toBe(true);
    }
    // Rien n'est retiré : chaque champ du moteur est là, une seule fois.
    const uniques = await page.evaluate(() => ["evTitle", "evPassion", "evType", "evDate", "evTime", "evDuration", "evRecurrence",
      "evPlaceSearch", "evVenue", "evAddress", "evPostal", "evCity", "evPrice", "evMax", "evContact", "evLink", "evDesc", "evCoverFile", "evCoverData"]
      .every((id) => document.querySelectorAll("#" + id).length === 1));
    expect(uniques, "tous les champs du moteur, une fois chacun").toBe(true);
    await expect(page.locator("#modalContent .v6a0-publier")).toHaveText("Publier l'activité");
    await expect(page.locator("#modalContent button.btn.primary")).toHaveCount(1);
  });

  test("② la couverture est un contrôle accessible, et « Retirer » vit hors de la zone", async ({ page }) => {
    await boot(page);
    await ouvrir(page);
    const zone = page.locator("#evCoverPreviewWrap");
    await expect(zone).toHaveAttribute("role", "button");
    await expect(zone).toHaveAttribute("tabindex", "0");
    await expect(zone).toHaveAttribute("aria-label", "Ajouter une couverture");
    await zone.focus();
    const [choix] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Enter")]);
    await choix.setFiles({ name: "couv.png", mimeType: "image/png", buffer: PNG_1PX });
    await expect(zone).toHaveAttribute("aria-label", "Changer la couverture");
    const retirer = page.locator("#evCoverRemoveBtn");
    await expect(retirer).toBeVisible();
    expect(await retirer.evaluate((b) => !b.closest("#evCoverPreviewWrap")), "« Retirer » hors de la zone").toBe(true);
    await retirer.click();
    await expect(zone).toHaveAttribute("aria-label", "Ajouter une couverture");
    await expect(page.locator("#evCoverData")).toHaveValue("");
  });

  test("③ l'aperçu reprend la saisie, en texte", async ({ page }) => {
    await boot(page);
    await ouvrir(page);
    await page.fill("#evTitle", "<img src=x onerror=window.__xss=1>Jam du jeudi");
    await page.fill("#evDesc", "On joue, on boit un verre.");
    await page.click("#modalContent .v6a0-btn-apercu");
    const apercu = page.locator("#v6a0Apercu");
    await expect(apercu).toBeVisible();
    await expect(apercu.locator(".v6a0-apercu-titre")).toHaveText("<img src=x onerror=window.__xss=1>Jam du jeudi");
    await expect(apercu.locator(".v6a0-apercu-desc")).toHaveText("On joue, on boit un verre.");
    expect(await page.evaluate(() => window.__xss === undefined && !document.querySelector("#v6a0Apercu img[src='x']"))).toBe(true);
  });

  test("④ deux clics sur « Publier l'activité » ne font qu'un envoi", async ({ page }) => {
    await boot(page);
    await ouvrir(page);
    await compterEnvois(page);
    await page.locator("#modalContent .v6a0-publier").dblclick();
    await expect(page.locator("#modalContent .v6a0-publier")).toBeEnabled({ timeout: 3000 });
    expect(await page.evaluate(() => window.__envois)).toBe(1);
  });

  test("⑤ coupé, la modale d'avant revient, sans rangement ni garde", async ({ page }) => {
    await boot(page, { coupe: true });
    await ouvrir(page);
    await expect(page.locator("#modalContent .modal-title")).toHaveText("Créer un événement IRL");
    expect(await page.evaluate(() => document.getElementById("modalContent").classList.contains("v6a0"))).toBe(false);
    await expect(page.locator("#modalContent details.v6a0-options")).toHaveCount(0);
    await compterEnvois(page);
    await page.evaluate(() => { submitEvent(); submitEvent(); });
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__envois), "sans le module, le moteur n'a pas de garde").toBe(2);
  });

  for (const largeur of [320, 390, 430]) {
    test(`⑥ capture ${largeur} px, sans débordement horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 900 });
      await boot(page);
      await ouvrir(page);
      const deborde = await page.evaluate(() => {
        const m = document.getElementById("modalContent");
        return m.scrollWidth > m.clientWidth + 1;
      });
      expect(deborde, "aucun débordement horizontal").toBe(false);
      await page.locator("#modalContent").screenshot({ path: path.join(__dirname, "..", "..", "docs", "captures", "ui-6a0", `creer-activite-${largeur}.png`) });
    });
  }
});
