// ═══════════════════════════════════════════════════════════════════════════
// MUSIQUE LIBRE DES STORIES (2026-11-26) — Openverse, simulé
// « Pour le son, trouve une solution gratuite » (Benjamin). Openverse (fondation
// WordPress) : API gratuite, morceaux sous licence libre.
//   ① la recherche part vers Openverse avec les SEULES licences commerciales ET
//      adaptables (by, by-sa, cc0, pdm — jamais « nd »), catégorie musique ;
//      un résultat d'un hébergeur inconnu, en http ou « nd » est écarté ;
//   ② choisir pose UN sticker 🎵 (le second remplace le premier), la musique
//      voyage, et le lecteur de story la joue ; elle s'arrête à la fermeture ;
//   ③ toucher le sticker ouvre le crédit (titre, artiste, licence, liens sûrs) ;
//   ④ hostile : source piégée = ni sticker ni lecture ; jamais dans une bobine.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

// WAV muet de 0,1 s : de quoi jouer sans réseau.
function wav() {
  const n = 800, b = Buffer.alloc(44 + n);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28);
  b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write("data", 36); b.writeUInt32LE(n, 40); b.fill(128, 44);
  return b;
}
const RESULTATS = [
  { id: "a1", title: "Soleil", creator: "Léa", url: "https://mp3d.jamendo.com/x/soleil.mp3", license: "by", license_version: "3.0", license_url: "https://creativecommons.org/licenses/by/3.0/", foreign_landing_url: "https://www.jamendo.com/track/1", duration: 120000 },
  { id: "a2", title: "Pluie", creator: "Sam", url: "https://cdn.freesound.org/previews/pluie.mp3", license: "cc0", license_version: "1.0", license_url: "https://creativecommons.org/publicdomain/zero/1.0/", foreign_landing_url: "https://freesound.org/s/2", duration: 60000 },
  { id: "x1", title: "Piège", creator: "X", url: "https://evil.example/t.mp3", license: "by" },
  { id: "x2", title: "Clair", creator: "X", url: "http://mp3d.jamendo.com/x/c.mp3", license: "by" },
  { id: "x3", title: "Sans modif", creator: "X", url: "https://mp3d.jamendo.com/x/nd.mp3", license: "by-nd" },
];

async function banc(page) {
  await page.route(/api\.openverse\.org/, (route) => {
    page.__requetes = (page.__requetes || []).concat(route.request().url());
    route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ results: RESULTATS }) });
  });
  await page.route(/jamendo\.com|freesound\.org/, (route) => route.fulfill({ status: 200, contentType: "audio/wav", body: wav() }));
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.requireAuthentication = () => true;
    try { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("banc")); } catch (e) {}
    meOpen("story");
  });
  await page.locator("#meBgBtn").click();
  await page.locator("#meTeChamp").fill("Ambiance");
  await page.locator("#meTeOk").click();
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await page.locator('#meStickerPanel [data-sticker="Musique"]').click();
}

test("① recherche Openverse : licences libres et adaptables seulement, hébergeurs sûrs", async ({ page }) => {
  await banc(page);
  await expect(page.locator("#meStickerPanel .me-musique-choix")).toHaveCount(2);
  const url = new URL(page.__requetes[0]);
  expect(url.origin + url.pathname).toBe("https://api.openverse.org/v1/audio/");
  expect(url.searchParams.get("license")).toBe("by,by-sa,cc0,pdm");
  expect(url.searchParams.get("category")).toBe("music");
  expect(url.searchParams.get("mature")).toBe("false");
  await expect(page.locator("#meStickerPanel")).toContainText("Soleil");
  await expect(page.locator("#meStickerPanel")).toContainText("CC BY 3.0");
  await expect(page.locator("#meStickerPanel")).not.toContainText("Piège");
  await expect(page.locator("#meStickerPanel")).not.toContainText("Sans modif");
  // Une puce relance la recherche.
  await page.locator("#meStickerPanel .me-musique-puces button", { hasText: "piano" }).click();
  await expect.poll(() => page.__requetes.length).toBeGreaterThan(1);
  expect(new URL(page.__requetes[page.__requetes.length - 1]).searchParams.get("q")).toBe("piano");
});

test("② choisir pose UN sticker, la musique voyage et le lecteur la joue puis l'arrête", async ({ page }) => {
  await banc(page);
  await page.locator('#meStickerPanel [data-musique="a1"]').click();
  await expect(page.locator("#meOverlays .me-sticker-musique")).toContainText("Soleil");
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await page.locator('#meStickerPanel [data-sticker="Musique"]').click();
  await page.locator('#meStickerPanel [data-musique="a2"]').click();
  await expect(page.locator("#meOverlays .me-sticker-musique")).toHaveCount(1);
  await expect(page.locator("#meOverlays .me-sticker-musique")).toContainText("Pluie");
  await page.evaluate(() => { window._supaReal = false; meState._enteredEditAt = 0; mePublish(); });
  const s = await page.evaluate(() => state.seed.stories[0]);
  const m = s.overlays.find((o) => o.type === "musique");
  expect(m).toMatchObject({ src: "https://cdn.freesound.org/previews/pluie.mp3", titre: "Pluie", artiste: "Sam", licence: "cc0" });
  expect(await page.evaluate(() => !_meMusiqueAudio || _meMusiqueAudio.paused), "l'aperçu de l'éditeur s'arrête à la publication").toBe(true);
  await page.evaluate((st) => { storyGroups = [{ authorId: st.authorId, stories: [st] }]; openStoryViewerAt(0, 0); }, s);
  await expect.poll(() => page.evaluate(() => _storyMusiqueAudio && _storyMusiqueAudio.src)).toBe("https://cdn.freesound.org/previews/pluie.mp3");
  await page.evaluate(() => closeStoryViewer());
  expect(await page.evaluate(() => _storyMusiqueAudio.paused)).toBe(true);
});

test("③ toucher le sticker ouvre le crédit, liens sûrs seulement", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => {
    const ov = [{ type: "musique", src: "https://mp3d.jamendo.com/x/soleil.mp3", titre: "Soleil", artiste: "Léa", licence: "by", version: "3.0",
      licenceUrl: "https://creativecommons.org/licenses/by/3.0/", page: "javascript:alert(1)", x: 50, y: 20 }];
    window._storyMusiqueJouer = () => {};
    storyGroups = [{ authorId: "u_x", stories: [{ id: "s_m", authorId: "u_x", authorName: "X", text: "", overlays: ov, createdAt: Date.now() }] }];
    openStoryViewerAt(0, 0);
  });
  await page.locator("#storyOverlays .st-musique").click();
  const corps = page.locator("#mcCorps");
  await expect(corps).toContainText("« Soleil »");
  await expect(corps).toContainText("Léa");
  await expect(corps.locator("a", { hasText: "Licence CC BY 3.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by/3.0/");
  await expect(corps.locator("a", { hasText: "page d'origine" })).toHaveCount(0);
  expect(await page.evaluate(() => window._storyEnPause)).toBe(true);
});

test("④ hostile : source piégée sans sticker ni lecture ; jamais dans une bobine", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const piege = [{ type: "musique", src: "https://evil.example/t.mp3", titre: "<img src=x onerror=alert(1)>", artiste: "x" }];
    const bon = [{ type: "musique", src: "https://mp3d.jamendo.com/x/s.mp3", titre: '"><svg onload=1>', artiste: "y" }];
    const d = document.createElement("div"); d.innerHTML = _storyOverlaysHtml(bon, { story: true });
    const els = Array.from(d.querySelectorAll("*"));
    return {
      piege: _storyOverlaysHtml(piege, { story: true }),
      actifs: els.filter((e) => /^(IMG|SVG|SCRIPT)$/i.test(e.tagName) || Array.from(e.attributes).some((a) => /^on/i.test(a.name))).length,
      sticker: d.querySelectorAll(".st-musique").length,
      bobine: _storyOverlaysHtml(bon),
      sures: [musiqueSourceSure("https://evil.example/x.mp3"), musiqueSourceSure("http://mp3d.jamendo.com/a.mp3"), musiqueSourceSure("https://jamendo.com.evil.example/a.mp3"), musiqueSourceSure("https://upload.wikimedia.org/a.ogg")],
    };
  });
  expect(r.piege).toBe("");
  expect(r.actifs).toBe(0);
  expect(r.sticker).toBe(1);
  expect(r.bobine).toBe("");
  expect(r.sures).toEqual(["", "", "", "https://upload.wikimedia.org/a.ogg"]);
});
