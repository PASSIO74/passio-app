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

test("② passioThumb ne demande AUCUNE transformation d'image : l'objet lui-même, au CDN Supabase", async ({ page }) => {
  // Depuis le 2026-11-09 : la transformation compte 100 images d'origine par mois
  // en Pro, et son URL est publique — n'importe qui pouvait épuiser le quota et
  // éteindre les vignettes de tous (relevé par `passio-red-team`). Toute image
  // envoyée a sa version légère ; une ancienne est servie telle quelle.
  await sansDonneesDistantes(page);
  await bootOnboarded(page);
  const r = await page.evaluate((supa) => ({
    direct: passioThumb(supa, 700),
    legere: passioThumb(supa + ".v720.webp", 192),
    relais: passioThumb("https://passio-app.netlify.app/media/content/photos/u1/x.jpg", 352),
    externe: passioThumb("https://exemple.org/photo.jpg", 700),
    data: passioThumb("data:image/png;base64,AAAA", 700),
    avatar: avatarBg({ photoUrl: supa, color: "#7c3aed" }, 192),
  }), SUPA);
  expect(r.direct).toBe(SUPA);
  expect(r.legere).toBe(SUPA + ".v720.webp");
  expect(r.relais).toBe(SUPA);
  expect(r.externe).toBe("https://exemple.org/photo.jpg");
  expect(r.data).toBe("data:image/png;base64,AAAA");
  for (const [cle, v] of Object.entries(r)) {
    expect(v, cle).not.toContain("render/image");
    expect(v, cle).not.toContain("width=");
  }
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
  // La vignette d'une ancienne URL part en direct vers l'OBJET (aucune
  // transformation, voir ②) — jamais vers le relais.
  expect(r.vignetteRelais).toBe(DIRECT);
  expect(r.vignetteLegereRelais).toBe(DIRECT + ".v720.webp");
});
