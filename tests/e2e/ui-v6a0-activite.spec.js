// ═══════════════════════════════════════════════════════════
// UI-6A0 — « Créer une activité » (#174) : verrou du rangement
//
// js/ui-v6a0-activite.js RANGE la modale d'openCreateEvent sans toucher au
// moteur. Ce qui est tenu ici :
//   ① la hiérarchie : couverture, Titre, Passion, Description, Quand, Où,
//      Combien — puis « Plus d'options » (récurrence, contact, lien) ;
//   ② la couverture est un vrai contrôle : rôle, tabulation, Entrée ouvre le
//      sélecteur, nom qui suit l'état, « Retirer » hors de la zone ;
//   ② bis un geste ouvre UN sélecteur, jamais deux ;
//   ② ter le nom et l'aperçu suivent l'image RÉELLEMENT posée, pas un délai ;
//   ③ l'aperçu reprend la saisie, en TEXTE (aucun HTML interprété) ;
//   ④ deux clics sur « Publier l'activité » = un seul envoi ;
//   ⑤ coupé (`passio_ui_6a0="0"`), la modale d'avant revient, sans garde, et
//      le module ne touche plus à la couverture ;
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
const FICHIER_COUV = { name: "couv.png", mimeType: "image/png", buffer: PNG_1PX };
// L'image est posée par un FileReader : une photo lourde sur un téléphone chargé
// met le temps qu'elle veut. Le retard reproduit ça sans dépendre de la machine.
async function retarderLecture(page, ms) {
  await page.evaluate((retard) => {
    const lire = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (f) { setTimeout(() => lire.call(this, f), retard); };
  }, ms);
}
// Compte les sélecteurs ouverts par `geste`. Un second se prouve par son absence :
// d'où l'attente après le premier. ⚠️ `page.on("filechooser")` n'arme l'interception
// que par un message sans réponse attendue : créer le compteur AVANT `zone.focus()`,
// jamais au même tour que la touche (voir ②).
function compteurSelecteurs(page) {
  let ouverts = 0;
  page.on("filechooser", () => { ouverts++; });
  return async (nom, geste) => {
    ouverts = 0;
    await geste();
    await expect.poll(() => ouverts, `${nom} ouvre le sélecteur`).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    expect(ouverts, `${nom} : un seul sélecteur`).toBe(1);
  };
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
    // ⚠️ S'ABONNER AVANT `focus()`, JAMAIS AU MÊME TOUR QUE LA TOUCHE (2026-11-07).
    // `waitForEvent` n'arme l'interception du sélecteur de fichiers que par un
    // message sans réponse attendue, et `keyboard.press` emprunte un autre canal
    // jusqu'à la page : la touche arrivait parfois la première. Le sélecteur
    // s'ouvrait, mais sans événement (8 échecs sur 12, 12 sur 24 sous `Promise.all`).
    // `focus()` est l'aller-retour qui prouve l'interception en place : 0 sur 12.
    const choixAttendu = page.waitForEvent("filechooser");
    await zone.focus();
    await page.keyboard.press("Enter");
    const choix = await choixAttendu;
    await choix.setFiles({ name: "couv.png", mimeType: "image/png", buffer: PNG_1PX });
    await expect(zone).toHaveAttribute("aria-label", "Changer la couverture");
    const retirer = page.locator("#evCoverRemoveBtn");
    await expect(retirer).toBeVisible();
    expect(await retirer.evaluate((b) => !b.closest("#evCoverPreviewWrap")), "« Retirer » hors de la zone").toBe(true);
    await retirer.click();
    await expect(zone).toHaveAttribute("aria-label", "Ajouter une couverture");
    await expect(page.locator("#evCoverData")).toHaveValue("");
  });

  test("② bis un geste, un seul sélecteur de fichiers : Entrée, Espace, le clic", async ({ page }) => {
    await boot(page);
    await ouvrir(page);
    const zone = page.locator("#evCoverPreviewWrap");
    const compter = compteurSelecteurs(page);
    await zone.focus();
    await compter("Entrée", () => page.keyboard.press("Enter"));
    await compter("Espace", () => page.keyboard.press("Space"));
    await compter("le clic", () => zone.click());
  });

  // 1 000 ms : allonger le délai d'une relecture ne doit pas passer pour un correctif.
  for (const retard of [100, 1000]) {
    test(`② ter lecture du fichier retardée de ${retard} ms : le nom suit l'image posée`, async ({ page }) => {
      await boot(page);
      await ouvrir(page);
      const zone = page.locator("#evCoverPreviewWrap");
      await retarderLecture(page, retard);
      await page.setInputFiles("#evCoverFile", FICHIER_COUV);
      await expect(zone).toHaveAttribute("aria-label", "Changer la couverture");
      await expect(page.locator(".v6a0-cover-titre")).toHaveText("Changer la couverture");
    });
  }

  test("② ter l'aperçu déjà ouvert reçoit la photo quand elle arrive, et la perd au retrait", async ({ page }) => {
    await boot(page);
    await ouvrir(page);
    await page.click("#modalContent .v6a0-btn-apercu");
    const visuel = page.locator("#v6a0Apercu .v6a0-apercu-visuel img");
    await expect(visuel).toHaveCount(0);
    await retarderLecture(page, 100);
    await page.setInputFiles("#evCoverFile", FICHIER_COUV);
    await expect(visuel).toHaveCount(1);
    await page.locator("#evCoverRemoveBtn").click();
    await expect(visuel).toHaveCount(0);
  });

  test("② ter en modification, la couverture existante donne « Changer la couverture »", async ({ page }) => {
    await boot(page);
    const png = "data:image/png;base64," + PNG_1PX.toString("base64");
    await page.evaluate((coverUrl) => {
      const ev = state.seed.events[0];
      ev.coverUrl = coverUrl;
      openCreateEvent(ev.id);
    }, png);
    await page.waitForSelector("#modalContent #evTitle");
    await expect(page.locator("#modalContent .modal-title")).toHaveText("Modifier l'activité");
    await expect(page.locator("#evCoverPreviewWrap")).toHaveAttribute("aria-label", "Changer la couverture");
    await expect(page.locator("#evCoverRemoveBtn")).toBeVisible();
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
    await expect(page.locator("#modalContent .modal-title")).toHaveText("Créer une activité");
    expect(await page.evaluate(() => document.getElementById("modalContent").classList.contains("v6a0"))).toBe(false);
    await expect(page.locator("#modalContent details.v6a0-options")).toHaveCount(0);
    await compterEnvois(page);
    await page.evaluate(() => { submitEvent(); submitEvent(); });
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__envois), "sans le module, le moteur n'a pas de garde").toBe(2);
  });

  test("⑤ bis coupé, le module ne touche plus à la couverture, et Entrée y ouvre toujours un sélecteur", async ({ page }) => {
    await boot(page, { coupe: true });
    await ouvrir(page);
    const zone = page.locator("#evCoverPreviewWrap");
    const compter = compteurSelecteurs(page);
    await zone.focus();
    await compter("Entrée", () => page.keyboard.press("Enter"));
    await page.setInputFiles("#evCoverFile", FICHIER_COUV);
    await expect(page.locator("#evCoverData")).toHaveValue(/^data:image\/png/);
    await page.waitForTimeout(200);
    expect(await zone.getAttribute("aria-label"), "aucun nom posé par le module").toBeNull();
    expect(await zone.getAttribute("data-v6a0"), "zone non décorée").toBeNull();
    expect(await zone.evaluate((z) => z.classList.contains("v6a0-cover-pleine")), "aucune classe du module").toBe(false);
  });

  for (const largeur of [320, 390, 430]) {
    test(`⑥ capture ${largeur} px, sans débordement horizontal`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: largeur, height: 900 });
      await boot(page);
      await ouvrir(page);
      const deborde = await page.evaluate(() => {
        const m = document.getElementById("modalContent");
        return m.scrollWidth > m.clientWidth + 1;
      });
      expect(deborde, "aucun débordement horizontal").toBe(false);
      // ⚠️ LES CAPTURES VERSIONNÉES NE SE RÉÉCRIVENT QUE SUR DEMANDE (2026-11-10, STAB-11) : jusque-là chaque
      // passage de la suite modifiait docs/captures/ui-6a0/*.png — un arbre sale après `npm run test:local`, et
      // trois images prêtes à partir dans le commit de quelqu'un d'autre. `PASSIO_CAPTURES=1` les régénère.
      const cible = process.env.PASSIO_CAPTURES === "1"
        ? path.join(__dirname, "..", "..", "docs", "captures", "ui-6a0", `creer-activite-${largeur}.png`)
        : testInfo.outputPath(`creer-activite-${largeur}.png`);
      await page.locator("#modalContent").screenshot({ path: cible });
    });
  }
});
