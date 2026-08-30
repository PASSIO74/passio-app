// Fuite mémoire — le Blob d'une bobine filmée localement n'était jamais révoqué.
//
// ⚠️ LE DÉFAUT, mesuré le 2026-08-30. `_reelVideoSrc(post)` (app-05) décode le
// base64 d'une bobine encore locale en Blob et mémorise l'URL objet dans une
// table globale indexée par identifiant :
//
//     window._reelBlobUrls[post.id] = URL.createObjectURL(blob)
//
// C'est le SEUL `createObjectURL` du dépôt sans `revokeObjectURL` en regard —
// les quatre autres (export calendrier app-07, aperçu média et sondeur audio
// app-08, redimensionnement d'image app-09) révoquent tous.
//
// Conséquence : une fois la bobine téléversée, `post.video` devient une URL
// https et le Blob n'a plus AUCUN usage — mais il reste retenu, avec sa vidéo
// pleine taille, jusqu'à la fin de la session. Filmer plusieurs bobines d'affilée
// accumule autant de vidéos en mémoire, sur un téléphone, pour rien.
//
// Le correctif est borné à cette lecture-là : on révoque quand `post.video` a
// cessé d'être une data URL — c'est-à-dire exactement quand l'URL objet devient
// inutile. Tant que la bobine n'est PAS téléversée, le Blob reste : il sert.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Un mp4 minuscule mais réel : `_meDataUrlToBlob` doit pouvoir le décoder.
const VIDEO_DATA_URL = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=";

async function poserEspionRevoke(page) {
  await page.evaluate(() => {
    window.__revoques = [];
    const vrai = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = function (u) { window.__revoques.push(u); return vrai(u); };
  });
}

test.describe("Bobine locale — cycle de vie de l'URL objet", () => {
  test("le Blob est révoqué dès que la bobine est téléversée", async ({ page }) => {
    await bootOnboarded(page);
    await poserEspionRevoke(page);

    const r = await page.evaluate((dataUrl) => {
      const post = { id: "reel_fuite_1", isReel: true, video: dataUrl };

      // 1. Bobine encore locale : une URL objet est créée et mise en cache.
      const avant = _reelVideoSrc(post);
      const cacheAvant = !!(window._reelBlobUrls || {})["reel_fuite_1"];

      // 2. Le téléversement aboutit : le post porte désormais une vraie URL.
      post.video = "https://exemple.test/bobine.mp4";
      const apres = _reelVideoSrc(post);

      return {
        avant, apres, cacheAvant,
        cacheApres: !!(window._reelBlobUrls || {})["reel_fuite_1"],
        revoques: window.__revoques.slice(),
      };
    }, VIDEO_DATA_URL);

    // Anti-creux : la situation décrite doit avoir été réellement construite.
    expect(r.avant, "une URL objet doit avoir été créée").toMatch(/^blob:/);
    expect(r.cacheAvant, "elle doit avoir été mise en cache").toBe(true);

    // Le cœur du correctif.
    expect(r.apres).toBe("https://exemple.test/bobine.mp4");
    expect(r.cacheApres, "l'entrée de cache doit avoir disparu").toBe(false);
    expect(r.revoques, "l'URL objet doit avoir été révoquée").toContain(r.avant);
  });

  test("tant que la bobine n'est PAS téléversée, le Blob est conservé et réutilisé", async ({ page }) => {
    // Garde de non-régression : révoquer trop tôt casserait la lecture d'une
    // bobine encore en base64 — le cas même pour lequel ce cache existe.
    await bootOnboarded(page);
    await poserEspionRevoke(page);

    const r = await page.evaluate((dataUrl) => {
      const post = { id: "reel_fuite_2", isReel: true, video: dataUrl };
      const a = _reelVideoSrc(post);
      const b = _reelVideoSrc(post);
      return { a, b, revoques: window.__revoques.slice() };
    }, VIDEO_DATA_URL);

    expect(r.a).toMatch(/^blob:/);
    expect(r.b, "la même URL objet doit être réutilisée").toBe(r.a);
    expect(r.revoques, "rien ne doit être révoqué tant qu'elle sert").toEqual([]);
  });

  test("une bobine déjà distante ne crée aucune URL objet", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const post = { id: "reel_fuite_3", isReel: true, video: "https://exemple.test/deja.mp4" };
      const src = _reelVideoSrc(post);
      return { src, cache: !!(window._reelBlobUrls || {})["reel_fuite_3"] };
    });
    expect(r.src).toBe("https://exemple.test/deja.mp4");
    expect(r.cache).toBe(false);
  });
});
