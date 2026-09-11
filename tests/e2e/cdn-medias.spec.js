// ═══════════════════════════════════════════════════════════════════════════
// CACHE CDN DES MÉDIAS (2026-09-11) — les URLs passent par /media/* (Netlify Edge)
//
// Ce que ces cas verrouillent : ① `cdnUrl` réécrit une URL publique Supabase
// vers le CDN et laisse TOUT le reste intact (data:, externes) ; ② `passioThumb`
// sait demander une miniature à une URL CDN (sinon la miniature repartirait vers
// Supabase en direct, hors cache, et tout le gain disparaîtrait en silence) ;
// ③ `_cheminsMediaPost` retrouve le chemin Storage sous les DEUX formes, sinon
// chaque média publié via le CDN resterait orphelin à la suppression.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded, sansDonneesDistantes } = require("./app-helper");

const SUPA = "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/u1/x.jpg";

test("① cdnUrl : une URL publique Supabase part vers le CDN, le reste ne bouge pas", async ({ page }) => {
  await sansDonneesDistantes(page);
  await bootOnboarded(page);
  const r = await page.evaluate((supa) => ({
    base: window.PASSIO_CDN_BASE,
    cdn: cdnUrl(supa),
    data: cdnUrl("data:image/png;base64,AAAA"),
    externe: cdnUrl("https://exemple.org/photo.jpg"),
    nul: cdnUrl(null),
  }), SUPA);
  expect(r.base).toMatch(/^https:\/\/passio-app\.netlify\.app\/media$/);
  expect(r.cdn).toBe(r.base + "/content/photos/u1/x.jpg");
  expect(r.data).toBe("data:image/png;base64,AAAA");
  expect(r.externe).toBe("https://exemple.org/photo.jpg");
  expect(r.nul).toBeNull();
});

test("② passioThumb : une URL CDN reçoit sa largeur, une URL Supabase garde la transformation", async ({ page }) => {
  await sansDonneesDistantes(page);
  await bootOnboarded(page);
  const r = await page.evaluate((supa) => ({
    viaCdn: passioThumb(cdnUrl(supa), 700),
    viaCdnDejaParam: passioThumb(cdnUrl(supa) + "?width=100&quality=50", 700),
    direct: passioThumb(supa, 700),
    externe: passioThumb("https://exemple.org/photo.jpg", 700),
  }), SUPA);
  expect(r.viaCdn).toBe("https://passio-app.netlify.app/media/content/photos/u1/x.jpg?width=700&quality=75");
  // Une largeur déjà posée est REMPLACÉE, jamais empilée (deux `?` = URL invalide).
  expect(r.viaCdnDejaParam).toBe("https://passio-app.netlify.app/media/content/photos/u1/x.jpg?width=700&quality=75");
  expect(r.direct).toContain("/storage/v1/render/image/public/");
  expect(r.direct).not.toContain("passio-app.netlify.app");
  expect(r.externe).toBe("https://exemple.org/photo.jpg");
});

test("③ _cheminsMediaPost : le chemin Storage est retrouvé sous les deux formes d URL", async ({ page }) => {
  await sansDonneesDistantes(page);
  await bootOnboarded(page);
  const r = await page.evaluate((supa) => _cheminsMediaPost({
    image: supa,
    video: cdnUrl("https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/videos/u1/v.mp4") + "?width=700&quality=75",
    cover: "https://exemple.org/hors-storage.jpg",
    audio: null,
  }), SUPA);
  expect(r).toEqual(["photos/u1/x.jpg", "videos/u1/v.mp4"]);
});
