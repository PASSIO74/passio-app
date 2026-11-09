// ═══════════════════════════════════════════════════════════════════════════
// CDN DES MÉDIAS — du relais /media/* (2026-09-11) au CDN Supabase en direct (2026-11-09)
//
// Ce que ces cas verrouillent : ① `cdnUrl` reste le point unique de tout envoi —
// identité depuis le 2026-11-09 (`PASSIO_CDN_BASE = ""`), réécriture vers la base
// si on en pose une — et laisse TOUT le reste intact (data:, externes) ;
// ② `passioThumb` demande sa miniature au bon endroit dans les deux états ;
// ③ `_cheminsMediaPost` retrouve le chemin Storage sous les DEUX formes, sinon
// chaque média publié via le relais resterait orphelin à la suppression ;
// ④ une URL du relais déjà en base se lit à la SOURCE (`urlMediaDirecte`) : son
// cache ne servait rien (neuf `fwd=miss` d'affilée, mesuré le 2026-11-09) et
// chaque vue coûtait la bande passante de Netlify ET la sortie de Supabase.
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
  // Kill switch (`PASSIO_CDN_BASE = ""`) : cdnUrl rend l'URL INCHANGÉE — le test doit
  // rester vert dans les deux états, un kill switch qui rougit la CI n'en est pas un.
  if (r.base) {
    expect(r.base.startsWith("https://")).toBe(true);
    expect(r.base.endsWith("/media")).toBe(true);
    expect(r.cdn).toBe(r.base + "/content/photos/u1/x.jpg");
  } else {
    expect(r.cdn).toBe(SUPA);
  }
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
  const base = await page.evaluate(() => window.PASSIO_CDN_BASE);
  if (base) {
    expect(r.viaCdn).toBe(base + "/content/photos/u1/x.jpg?width=700&quality=75");
    // Une largeur déjà posée est REMPLACÉE, jamais empilée (deux `?` = URL invalide).
    expect(r.viaCdnDejaParam).toBe(base + "/content/photos/u1/x.jpg?width=700&quality=75");
  } else {
    // Kill switch : cdnUrl est l'identité, la miniature suit le chemin Supabase.
    expect(r.viaCdn).toContain("/storage/v1/render/image/public/");
  }
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

test("④ urlMediaDirecte : une URL du relais se lit au CDN Supabase, le seau privé et le reste ne bougent pas", async ({ page }) => {
  await sansDonneesDistantes(page);
  await bootOnboarded(page);
  const RELAIS = "https://passio-app.netlify.app/media/";
  const r = await page.evaluate((relais) => ({
    objet: urlMediaDirecte(relais + "content/photos/u1/x.jpg"),
    avecParametres: urlMediaDirecte(relais + "content/photos/u1/x.jpg?width=700&quality=75#f"),
    prive: urlMediaDirecte(relais + "attachments/attachments/c1/f.jpg"),
    supabase: urlMediaDirecte("https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/a.jpg"),
    autreHote: urlMediaDirecte("https://evil.example/media/content/a.jpg"),
    nul: urlMediaDirecte(null),
    vignetteRelais: passioThumb(relais + "content/photos/u1/x.jpg", 352),
    vignetteLegereRelais: passioThumb(relais + "content/photos/u1/x.jpg.v720.webp", 352),
  }), RELAIS);
  const DIRECT = "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/u1/x.jpg";
  expect(r.objet).toBe(DIRECT);
  // Les paramètres du relais tombent : la miniature se redemande par `passioThumb`.
  expect(r.avecParametres).toBe(DIRECT);
  // Une pièce jointe (seau privé) garde sa forme : seul le résolveur signé la lit.
  expect(r.prive).toBe(RELAIS + "attachments/attachments/c1/f.jpg");
  expect(r.supabase).toBe("https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/a.jpg");
  expect(r.autreHote).toBe("https://evil.example/media/content/a.jpg");
  expect(r.nul).toBeNull();
  // La vignette d'une ancienne URL part en direct vers la transformation Supabase,
  // celle d'une légère vers l'objet lui-même — jamais vers le relais.
  expect(r.vignetteRelais).toBe("https://njkiyoklssvefstljemx.supabase.co/storage/v1/render/image/public/content/photos/u1/x.jpg?width=352&quality=75");
  expect(r.vignetteLegereRelais).toBe(DIRECT + ".v720.webp");
});
