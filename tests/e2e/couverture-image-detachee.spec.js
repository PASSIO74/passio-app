// ═════════════════════════════════════════════════════════════════════
// LA COUVERTURE D'UNE CARTE DU FIL : UN `load` ARRIVÉ APRÈS UN NOUVEAU RENDU NE LÈVE RIEN
// (2026-11-10, STAB-02 de l'audit de stabilisation)
//
// Mesuré en production le 10/11 à 12:18 UTC (`client_errors` 210, iPhone, navigateur
// intégré d'Instagram) : `TypeError: null is not an object (evaluating
// 'this.parentNode.classList')`, dans l'attribut `onload` d'une couverture (`renderPostCover`,
// app-02). Le fil avait été repeint pendant que la photo d'exemple chargeait : son `load`
// est arrivé sur une image qui n'avait plus de parent. Rien de visible pour la personne ;
// une erreur de production à chaque fois, que la veille et la Sentinelle lisent.
//
// Ce que la suite garde, sur le gabarit RÉEL (`renderPostCover`), jamais sur une copie :
//   ① une image détachée avant la fin de son chargement ne lève aucune erreur ;
//   ② une image restée dans la carte marque toujours son parent `cover-ok` (c'est ce qui
//      retire la légende de repli : le correctif ne doit pas l'éteindre).
// Mutation : sans la garde `p&&` → ① rouge (Chromium : « Cannot read properties of null »,
// WebKit : « null is not an object »).
// ═════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Un GIF transparent d'un pixel, servi à la place de chaque image d'exemple (`/demo/u/…`
// est une fonction de bord de la production : le serveur de banc ne la connaît pas).
const GIF_1PX = Buffer.from("R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==", "base64");

test.describe("couverture d'une carte : le load d'une image détachée", () => {
  // ⚠️ SANS SERVICE WORKER : une fois la page contrôlée, c'est le worker qui demande l'image, et une
  // requête émise par un worker échappe à `page.route` — le banc recevait le 404 du serveur statique
  // au lieu de son image, donc `error` au lieu de `load` (mesuré en écrivant cette suite).
  test.use({ serviceWorkers: "block" });
  let erreurs;
  test.beforeEach(async ({ page }) => {
    erreurs = [];
    await bootOnboarded(page);
    page.on("pageerror", (e) => erreurs.push(String(e && e.message)));
    // Chaque image d'exemple attend 400 ms : le temps de la détacher avant son `load`.
    await page.route("**/demo/u/**", async (route) => {
      await new Promise((ok) => setTimeout(ok, 400));
      await route.fulfill({ status: 200, contentType: "image/gif", body: GIF_1PX });
    });
  });

  // Le gabarit réel, pour une couverture du catalogue d'exemples.
  const gabarit = () => {
    const cle = Object.keys(COVER_PHOTOS)[0];
    return renderPostCover({ id: "p_banc_couverture", cover: cle }, { label: "Musique", emoji: "🎵", color: "#8b5cf6" });
  };

  test("① une image détachée avant la fin de son chargement ne lève aucune erreur", async ({ page }) => {
    const pret = await page.evaluate((src) => {
      const html = (0, eval)("(" + src + ")")();
      const boite = document.createElement("div");
      boite.innerHTML = html;
      document.body.appendChild(boite);
      const img = boite.querySelector("img.post-cover-img");
      if (!img) return "gabarit sans image";
      // `loading="lazy"` ne chargerait jamais une image hors écran : on force le départ.
      img.loading = "eager";
      window.__imgDetachee = img;          // gardée en vie, comme le fait un chargement en cours
      window.__chargee = false;
      img.addEventListener("load", () => { window.__chargee = true; });
      img.parentNode.removeChild(img);     // le fil a été repeint : plus de parent
      boite.remove();
      return /\/demo\/u\//.test(img.src) ? "ok" : "adresse inattendue : " + img.src;
    }, gabarit.toString());
    expect(pret, "prémisse : le gabarit porte une image d'exemple").toBe("ok");
    await page.waitForFunction(() => window.__chargee === true, null, { timeout: 15000 });
    await page.waitForTimeout(100);
    expect(erreurs, "aucune erreur de page").toEqual([]);
  });

  test("② une image restée dans la carte marque toujours son parent cover-ok", async ({ page }) => {
    await page.evaluate((src) => {
      const html = (0, eval)("(" + src + ")")();
      const boite = document.createElement("div");
      boite.id = "bancCouverture";
      boite.innerHTML = html;
      document.body.appendChild(boite);
      boite.querySelector("img.post-cover-img").loading = "eager";
    }, gabarit.toString());
    await expect(page.locator("#bancCouverture .post-cover-photo.cover-ok"), "la légende de repli est retirée une fois la photo arrivée").toHaveCount(1, { timeout: 15000 });
    expect(erreurs).toEqual([]);
  });
});
