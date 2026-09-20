const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
const { readFileSync } = require("fs");
const path = require("path");
// Playwright ne route pas les fetch interceptés par le service worker : le
// bloquer ici rend le comptage des vidéos locales complet et reproductible.
test.use({ serviceWorkers: "block" });

async function preparer(page, preferences) {
  // Même les profils/écritures hors du socle d'isolation restent locaux ici.
  await page.route(/https:\/\/[^/]+\.supabase\.co\//, route => route.fulfill({ contentType: "application/json", body: "[]" }));
  await bootOnboarded(page);
  await page.evaluate(prefs => {
    saveConfig({ content: prefs });
    state.seed.posts = [];
    state.supabasePosts = [];
    state.userPosts = Array.from({ length: 30 }, (_, i) => ({
      id: "media_capacite_" + i, authorId: "me", passion: "musique", type: "video", isReel: true,
      video: location.origin + "/__media_capacite__/" + i + ".webm", text: "Bobine locale",
      createdAt: Date.now() - i * 1000, likes: 0, comments: []
    }));
    window.__lecturesPubliques = [];
    window.__lectureNative = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.__lecturesPubliques.push(this.getAttribute("src"));
      return Promise.resolve();
    };
  }, preferences);
}

for (const prefs of [{ autoplay: false, dataEco: false }, { autoplay: true, dataEco: true }]) {
  test("Bobines : aucun média avant geste avec " + JSON.stringify(prefs), async ({ page }) => {
    await preparer(page, prefs);
    await page.evaluate(() => openReels());
    expect(await page.locator("#reelsList video[src]").count()).toBe(0);
    expect(await page.evaluate(() => __lecturesPubliques)).toEqual([]);
    await page.locator('#reelsList .reel-item').first().locator('[data-video-public-play]').click();
    await expect.poll(() => page.locator("#reelsList video[src]").count()).toBe(1);
    expect(await page.evaluate(() => __lecturesPubliques.length)).toBe(1);
    // Passer à une autre bobine ne transforme pas le geste précédent en opt-in global.
    await page.evaluate(() => { reelsState.current = 1; playReelAt(1); });
    expect(await page.locator("#reelsList video[src]").count()).toBe(0);
    expect(await page.evaluate(() => __lecturesPubliques.length)).toBe(1);
  });
}

test("Bobines : seule la vidéo courante reçoit une source, fermeture libère le média", async ({ page }) => {
  await preparer(page, { autoplay: true, dataEco: false });
  await page.evaluate(() => openReels());
  expect(await page.locator("#reelsList video").count()).toBe(30);
  expect(await page.locator("#reelsList video[src]").count()).toBe(1);
  await page.evaluate(() => { reelsState.current = 1; playReelAt(1); });
  const sources = await page.locator("#reelsList video[src]").evaluateAll(v => v.map(x => x.getAttribute("src")));
  expect(sources).toHaveLength(1);
  expect(sources[0]).toContain("/1.webm");
  await page.evaluate(() => closeReels());
  expect(await page.locator("#reelsList video[src]").count()).toBe(0);
});

test("Fil et détail : lire reste un geste explicite, même avec autoplay activé", async ({ page }) => {
  await preparer(page, { autoplay: true, dataEco: false });
  await page.evaluate(() => {
    const p = { ...state.userPosts[0], isReel: false };
    document.getElementById("feedList").innerHTML = renderPostHTML(p);
  });
  expect(await page.locator("#feedList video[src]").count()).toBe(0);
  await page.locator('#feedList [data-video-public-play]').click();
  expect(await page.locator("#feedList video[src]").count()).toBe(1);
  await page.evaluate(() => openPost("media_capacite_0"));
  expect(await page.locator('#postDetailPage video[data-video-public-src]').count()).toBe(1);
  expect(await page.locator('#postDetailPage video[src]').count()).toBe(0);
  await page.locator('#postDetailPage [data-video-public-play]').click();
  expect(await page.locator('#postDetailPage video[src]').count()).toBe(1);
  await page.evaluate(() => closePost());
  expect(await page.locator('#postDetailPage video[src]').count()).toBe(0);
});

test("Story économe : attend le geste et ne passe pas à la suivante avant lecture", async ({ page }) => {
  await preparer(page, { autoplay: true, dataEco: true });
  await page.evaluate(() => {
    storyGroups = [{ authorId: "me", stories: [
      { id: "capacite_story", authorId: "me", passion: "musique", media: location.origin + "/__media_capacite__/story.webm", mediaType: "video" },
      { id: "capacite_suite", authorId: "me", passion: "musique", text: "Suite" }
    ] }];
    openStoryViewerAt(0, 0);
  });
  expect(await page.locator("#storyMedia video[src]").count()).toBe(0);
  expect(await page.locator("#storyMedia video[data-video-public-src]").count()).toBe(1);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => storyItemIdx)).toBe(0);
  expect(await page.locator('#sp-0').evaluate(el => parseFloat(el.style.width))).toBe(0);
  await page.locator('#storyCard [data-video-public-play]').click();
  expect(await page.locator("#storyMedia video[src]").count()).toBe(1);
  expect(await page.evaluate(() => __lecturesPubliques.length)).toBe(1);
  await page.evaluate(() => closeStoryViewer());
  expect(await page.locator('#storyMedia video[src]').count()).toBe(0);
});

test("Quitter le fil coupe son média ; au retour le bouton permet une nouvelle lecture", async ({ page }) => {
  await preparer(page, { autoplay: true, dataEco: false });
  await page.evaluate(() => {
    state.userPosts = [{ ...state.userPosts[0], isReel: false }];
    _feedDomSig = null;
    renderFeed();
  });
  await page.locator('#feedList [data-video-public-play]').click();
  expect(await page.locator('#feedList video[src]').count()).toBe(1);
  await page.evaluate(() => goTo("messages"));
  expect(await page.locator('#feedList video[src]').count()).toBe(0);
  await page.evaluate(() => goTo("feed"));
  await expect(page.locator('#feedList [data-video-public-play]')).toBeVisible();
  await page.locator('#feedList [data-video-public-play]').click();
  expect(await page.locator('#feedList video[src]').count()).toBe(1);
});

test("Arrière-plan libère une bobine ; son bouton Lire reste disponible au retour", async ({ page }) => {
  await preparer(page, { autoplay: true, dataEco: false });
  await page.evaluate(() => {
    openReels();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await page.locator('#reelsList video[src]').count()).toBe(0);
  const bouton = page.locator('#reelsList .reel-item').first().locator('[data-video-public-play]');
  await expect(bouton).toBeVisible();
  await bouton.click();
  expect(await page.locator('#reelsList video[src]').count()).toBe(1);
});

test("Compression : profil mobile et garde anti-grossissement, conversion iPhone préservée", async ({ page }) => {
  await preparer(page, { autoplay: false, dataEco: true });
  const r = await page.evaluate(async () => {
    const demandes = [], mesures = [];
    window.tel = { action: (nom, meta) => mesures.push({ nom, meta }) };
    window._meReadFile = async () => "data:video/mp4;base64," + "A".repeat(4096);
    window._passioBestVideoMime = () => "video/mp4";
    window.passioCompressVideo = async (f, opts) => {
      demandes.push(opts);
      return "data:video/mp4;base64," + "A".repeat(4 * 1024 * 1024);
    };
    const original = new File([new Uint8Array(3 * 1024 * 1024)], "petit.mp4", { type: "video/mp4" });
    const pareil = await passioVideoPourEnvoi(original);
    const webm = new File([new Uint8Array(1024)], "court.webm", { type: "video/webm" });
    const converti = await passioVideoPourEnvoi(webm);
    window.passioCompressVideo = async () => "data:video/mp4;base64," + "A".repeat(2048);
    const reduit = await passioVideoPourEnvoi(original);
    return { demandes, pareil: pareil.length, converti: converti.length, reduit: reduit.length, mesures };
  });
  expect(r.demandes[0]).toEqual({ maxDim: 720, bitrate: 1200000 });
  expect(r.pareil).toBeLessThan(r.converti);
  expect(r.reduit).toBeLessThan(r.pareil);
  expect(r.mesures.map(x => x.meta.issue)).toEqual(["original_plus_petit", "transcodage", "compression"]);
  expect(r.mesures[2].meta.sortie_octets).toBe(1536);
});

test("Enregistrement préférences arrête les vidéos publiques, sans toucher aux appels privés", async ({ page }) => {
  await preparer(page, { autoplay: true, dataEco: false });
  await page.evaluate(() => {
    openReels();
    const prive = document.createElement("video");
    prive.id = "appelPriveTemoin"; prive.src = "blob:temoin-prive";
    document.body.appendChild(prive);
    openContentSettings();
    document.getElementById("contentDataEco").checked = true;
    saveContentSettings();
  });
  expect(await page.locator("#reelsList video[src]").count()).toBe(0);
  expect(await page.locator("#appelPriveTemoin").getAttribute("src")).toBe("blob:temoin-prive");
  expect(await page.evaluate(() => getCurrentConfig().content.dataEco)).toBe(true);
});

test("Mesure réseau isolée : 30 bobines, seuls les médias vus sont demandés", async ({ page }, testInfo) => {
  await preparer(page, { autoplay: true, dataEco: false });
  const fixture = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 90;
    canvas.getContext("2d").fillRect(0, 0, 160, 90);
    const stream = canvas.captureStream(10), chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
    rec.ondataavailable = ev => chunks.push(ev.data);
    const fini = new Promise(resolve => { rec.onstop = resolve; });
    rec.start(); await new Promise(r => setTimeout(r, 250)); rec.stop(); await fini;
    stream.getTracks().forEach(t => t.stop());
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    return btoa(String.fromCharCode(...bytes));
  });
  const demandes = { avant: new Set(), apres: new Set() };
  await page.route("**/__media_capacite__/**", route => {
    const chemin = new URL(route.request().url()).pathname;
    demandes[chemin.includes("/avant/") ? "avant" : "apres"].add(chemin);
    return route.fulfill({ contentType: "video/webm", body: Buffer.from(fixture, "base64") });
  });
  // Renderer historique véritable, au commit de départ de ce lot. Sa lecture
  // est locale ; ce cas n'interroge ni GitHub ni une vidéo de production.
  const rendererAvant = readFileSync(path.join(__dirname, "../fixtures/reel-renderer-605b6e2.txt"), "utf8");
  await page.evaluate(source => {
    HTMLMediaElement.prototype.play = window.__lectureNative;
    const renduAvant = (0, eval)("(" + source + ")");
    const ancien = document.createElement("div"); ancien.id = "mediasAvant";
    ancien.innerHTML = state.userPosts.map(p => renduAvant({ ...p, video: p.video.replace("/__media_capacite__/", "/__media_capacite__/avant/") })).join("");
    document.body.appendChild(ancien);
  }, rendererAvant);
  await expect.poll(() => demandes.avant.size).toBe(30);
  await page.evaluate(() => {
    document.getElementById("mediasAvant").remove();
    openReels();
  });
  await expect.poll(() => demandes.apres.size).toBe(1);
  await page.waitForTimeout(500);
  expect(demandes.apres.size).toBe(1);
  await page.evaluate(() => closeReels());
  const mesure = { fixture_octets: Buffer.from(fixture, "base64").length, videos_disponibles: 30,
    sources_demandees_avant: demandes.avant.size, sources_demandees_apres: demandes.apres.size,
    portee: "Chromium local, 30 copies d'une vidéo synthétique, ouverture Bobines uniquement ; aucune projection d'octets économisés en production" };
  await testInfo.attach("mesure-media-local", { body: JSON.stringify(mesure, null, 2), contentType: "application/json" });
  console.log("MESURE_MEDIA_LOCAL " + JSON.stringify(mesure));
});
