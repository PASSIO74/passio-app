const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// ═══════════════════════════════════════════════════════════════════════════
// PHOTOS DE PUBLICATION : UNE VERSION LÉGÈRE À CÔTÉ DE LA GRANDE (2026-09-21)
//
// Le navigateur exécute le VRAI générateur (`_imageLegerePourFil`), le vrai
// envoi (`supaUploadMedia`, Storage simulé) et les vrais rendus. Aucun média
// distant. Ce que ce banc prouve :
//   · une grande photo donne une légère de 720 px de large, WebP, plus petite,
//     jamais agrandie, transparence et proportions conservées ;
//   · l'envoi pose la grande PUIS la légère à `<chemin complet>.v720.<ext>`
//     (le nom de la grande, extension comprise, reste dans celui de la légère),
//     et rend l'URL de la légère ; si la légère échoue, l'URL de la grande ;
//   · la légère se demande par l'APPELANT (`{ legere: true }`) : la publication,
//     et depuis le 2026-11-09 l'avatar, la couverture, la photo et le fond de
//     passion, la couverture d'activité et de bobine — sans légère, chacun
//     coûtait une transformation d'image (100 images d'origine/mois en Pro) ;
//     jamais la story, le GIF ni la vidéo ; un chemin réécrit (`upsert`) se
//     garde une heure (`{ cache: "3600" }`), le reste un an ;
//   · les URL rendues sont celles du CDN Supabase, plus celles du relais
//     `/media/*` (2026-11-09) ; une ancienne URL du relais se lit à la source ;
//   · `passioThumb` sert une légère telle quelle (aucune transformation), la
//     grille du profil et l'album d'une activité ne demandent plus la grande,
//     `imageGrande` retrouve l'original (et ne DEVINE jamais : une légère de
//     première forme, sans extension de grande, est rendue telle quelle) ;
//   · supprimer une publication (ou retirer une story refusée) emporte la
//     grande AVEC la légère — contre-revue du 21/09 : seule la légère partait.
// ═══════════════════════════════════════════════════════════════════════════

async function preparer(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    stopFeedRefreshLoop();
    MY_UID = "812aee2b-214f-4949-931e-842599b6d68b"; window.MY_UID = MY_UID;
    window._supaReal = true;
    window.__mesures = [];
    window.tel = { action: (nom, meta) => __mesures.push({ nom, meta }) };
    window.__envois = [];
    window.__refuserLegere = false;
    supa.storage = {
      from: () => ({
        upload: async (chemin, blob, opts) => {
          __envois.push({ chemin, type: blob.type, octets: blob.size, cache: opts && opts.cacheControl });
          if (__refuserLegere && /\.v720\./.test(chemin)) return { error: { message: "refusé" } };
          return { error: null };
        },
        getPublicUrl: (chemin) => ({ data: { publicUrl: "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/" + chemin } }),
        remove: async () => ({ error: null }),
      }),
    };
    // Fabrique d'images : dégradé + damier, format au choix, alpha optionnel.
    window.__image = (w, h, format, alpha) => {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      if (!alpha) { const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#ff0055"); g.addColorStop(1, "#0055ff"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
      for (let y = 0; y < h; y += 40) for (let x = 0; x < w; x += 40) { if (((x + y) / 40) % 2) { ctx.fillStyle = alpha ? "rgba(20,200,90,1)" : "#222"; ctx.fillRect(x, y, 20, 20); } }
      return c.toDataURL(format === "png" ? "image/png" : "image/jpeg", 0.92);
    };
    window.__dimensions = (dataUrl) => new Promise((ok) => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok(null); i.src = dataUrl; });
    window.__pixel = (dataUrl, x, y) => new Promise((ok) => { const i = new Image(); i.onload = () => { const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight; const ctx = c.getContext("2d"); ctx.drawImage(i, 0, 0); ok(Array.from(ctx.getImageData(x, y, 1, 1).data)); }; i.src = dataUrl; });
  });
}

test("une grande photo donne une légère de 720 px, WebP, plus petite, proportions gardées, jamais agrandie", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    const grande = __image(1600, 1200, "jpeg");
    const legere = await _imageLegerePourFil(grande);
    const dims = await __dimensions(legere.dataUrl);
    const petite = __image(300, 200, "jpeg");
    const legerePetite = await _imageLegerePourFil(petite);
    const gif = await _imageLegerePourFil("data:image/gif;base64,R0lGODlhAQABAAAAACw=");
    return { format: legere.format, largeur: legere.largeur, hauteur: legere.hauteur, dims,
      plusPetite: _octetsDataUrl(legere.dataUrl) < _octetsDataUrl(grande) * 0.85,
      petite: legerePetite && { w: legerePetite.largeur, h: legerePetite.hauteur }, gif };
  });
  expect(r.format).toBe("webp");
  expect([r.largeur, r.hauteur]).toEqual([720, 540]);
  expect(r.dims).toEqual({ w: 720, h: 540 });
  expect(r.plusPetite).toBe(true);
  // Une petite image n'est jamais agrandie : si une légère existe, elle garde 300×200.
  if (r.petite) expect(r.petite).toEqual({ w: 300, h: 200 });
  expect(r.gif).toBeNull();
});

test("la transparence d'un PNG survit dans la légère", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    const png = __image(1440, 900, "png", true); // fond transparent, damier vert
    const legere = await _imageLegerePourFil(png);
    if (!legere) return { legere: null };
    const transparent = await __pixel(legere.dataUrl, 15, 15); // case vide du damier
    const opaque = await __pixel(legere.dataUrl, 25, 5);      // case peinte (x 40–60 en source → 20–30 en légère)
    return { format: legere.format, alphaTransparent: transparent[3], alphaOpaque: opaque[3], w: legere.largeur };
  });
  expect(r.legere === null ? "sans légère (aucun gain)" : r.format).toMatch(/webp|png|sans légère/);
  if (r.legere !== null) {
    expect(r.w).toBe(720);
    expect(r.alphaTransparent).toBe(0);
    expect(r.alphaOpaque).toBeGreaterThan(200);
  }
});

test("l'envoi pose la grande puis la légère, et rend l'URL de la légère ; sans légère possible, celle de la grande", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    const url = await supaUploadMedia("post_x", "photos", __image(1600, 1200, "jpeg"), "image", { legere: true });
    const envois = __envois.slice(); __envois.length = 0;
    __refuserLegere = true;
    const urlSansLegere = await supaUploadMedia("post_y", "photos", __image(1600, 1200, "jpeg"), "image", { legere: true });
    const envoisRefus = __envois.slice(); __envois.length = 0;
    return { url, envois, urlSansLegere, envoisRefus, mesures: __mesures.filter(m => m.nom === "image_legere") };
  });
  expect(r.envois.map(e => e.chemin)).toEqual(["photos/812aee2b-214f-4949-931e-842599b6d68b/post_x.jpg", "photos/812aee2b-214f-4949-931e-842599b6d68b/post_x.jpg.v720.webp"]);
  expect(r.envois.map(e => e.type)).toEqual(["image/jpeg", "image/webp"]);
  expect(r.envois[1].octets).toBeLessThan(r.envois[0].octets);
  // L'URL du CDN Supabase, plus celle du relais `/media/*` (2026-11-09).
  expect(r.url).toBe("https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/812aee2b-214f-4949-931e-842599b6d68b/post_x.jpg.v720.webp");
  expect(r.envois.map(e => e.cache)).toEqual(["31536000", "31536000"]);
  // Légère refusée : la grande vit seule, sans marqueur — le chemin d'avant.
  expect(r.envoisRefus.map(e => e.chemin)).toEqual(["photos/812aee2b-214f-4949-931e-842599b6d68b/post_y.jpg", "photos/812aee2b-214f-4949-931e-842599b6d68b/post_y.jpg.v720.webp"]);
  expect(r.urlSansLegere).toBe("https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/812aee2b-214f-4949-931e-842599b6d68b/post_y.jpg");
  expect(r.mesures.map(m => m.meta.issue)).toEqual(["legere", "envoi_legere_refuse"]);
  expect(r.mesures[0].meta.grande_octets).toBeGreaterThan(r.mesures[0].meta.legere_octets);
  expect(Object.keys(r.mesures[0].meta).sort()).toEqual(["format", "grande_octets", "issue", "largeur", "legere_octets"]);
});

test("sans `legere`, aucun second objet ; un GIF ou un dossier hors liste n'en reçoit jamais", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    const img = __image(1600, 1200, "jpeg");
    await supaUploadMedia("avatarPhoto_x", "avatars", img, "photo");
    await supaUploadMedia("cover_x", "covers", img, "photo");
    await supaUploadMedia("ev_x", "events", img, "photo");
    await supaUploadMedia("post_g", "photos", "data:image/gif;base64,R0lGODlhAQABAAAAACw=", "image", { legere: true });
    // Une story photo va dans le MÊME dossier que les publications (app-08,
    // supaPublishStory) : le dossier ne suffit pas, c'est l'appelant qui demande.
    await supaUploadMedia("story_x", "photos", img, "photo");
    // Un dossier hors de la liste ne reçoit jamais de légère, même demandée.
    await supaUploadMedia("autre_x", "documents", img, "photo", { legere: true });
    return { chemins: __envois.map(e => e.chemin), mesures: __mesures.filter(m => m.nom === "image_legere").length };
  });
  expect(r.chemins).toEqual([
    "avatars/812aee2b-214f-4949-931e-842599b6d68b/avatarPhoto_x.jpg",
    "covers/812aee2b-214f-4949-931e-842599b6d68b/cover_x.jpg",
    "events/812aee2b-214f-4949-931e-842599b6d68b/ev_x.jpg",
    "photos/812aee2b-214f-4949-931e-842599b6d68b/post_g.gif",
    "photos/812aee2b-214f-4949-931e-842599b6d68b/story_x.jpg",
    "documents/812aee2b-214f-4949-931e-842599b6d68b/autre_x.jpg",
  ]);
  expect(r.mesures).toBe(0);
});

test("avatar et photo de passion : la légère est posée et rendue ; un chemin réécrit se garde une heure", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    const img = __image(1600, 1200, "jpeg");
    const avatar = await supaUploadMedia("avatarPhoto_x", "avatars", img, "photo", { legere: true });
    const envoisAvatar = __envois.slice(); __envois.length = 0;
    const passion = await supaUploadMedia("prof_1", "passion_photos", img, "photo", { legere: true, cache: "3600" });
    const envoisPassion = __envois.slice(); __envois.length = 0;
    // Une durée qui n'est pas un nombre de secondes ne passe pas : un an, comme avant.
    await supaUploadMedia("prof_2", "passion_covers", img, "photo", { legere: true, cache: "3600; evil" });
    const envoisInvalide = __envois.slice();
    return { avatar, envoisAvatar, passion, envoisPassion, envoisInvalide,
      vignette: passioThumb(avatar, 192), estLegere: estImageLegere(avatar) };
  });
  expect(r.envoisAvatar.map(e => e.chemin)).toEqual([
    "avatars/812aee2b-214f-4949-931e-842599b6d68b/avatarPhoto_x.jpg",
    "avatars/812aee2b-214f-4949-931e-842599b6d68b/avatarPhoto_x.jpg.v720.webp",
  ]);
  expect(r.avatar).toBe("https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/avatars/812aee2b-214f-4949-931e-842599b6d68b/avatarPhoto_x.jpg.v720.webp");
  // La vignette de l'avatar ne demande AUCUNE transformation d'image.
  expect(r.estLegere).toBe(true);
  expect(r.vignette).toBe(r.avatar);
  expect(r.envoisAvatar.map(e => e.cache)).toEqual(["31536000", "31536000"]);
  expect(r.passion).toBe("https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/passion_photos/812aee2b-214f-4949-931e-842599b6d68b/prof_1.jpg.v720.webp");
  expect(r.envoisPassion.map(e => e.cache)).toEqual(["3600", "3600"]);
  expect(r.envoisInvalide.map(e => e.cache)).toEqual(["31536000", "31536000"]);
});

test("les vrais appels : avatars, couvertures, passions, activités et bobines demandent la légère, la story non", async () => {
  const fs = require("fs"), path = require("path");
  const lire = (f) => fs.readFileSync(path.join(__dirname, "..", "..", "js", f), "utf8");
  const app06 = lire("app-06-reels-partage.js"), app07 = lire("app-07-ia-explore-irl.js");
  const app08 = lire("app-08-ui-modals-tour.js"), uiV7 = lire("ui-v7-lot.js");
  expect(app06).toContain('supaUploadMedia(key, folder, dataUrl, "photo", { legere: true })');
  expect(app06).toContain('supaUploadMedia(profileId, "passion_photos", base64, "photo", { legere: true, cache: "3600" })');
  expect(app06).toContain('supaUploadMedia(profileId + "_cover", "passion_covers", base64, "photo", { legere: true, cache: "3600" })');
  expect(app07).toContain('supaUploadMedia(ev.id, "events", coverUrl, "photo", { legere: true, cache: "3600" })');
  expect(uiV7).toContain('supaUploadMedia(cle, "photos", dataUrl, "image", { legere: true })');
  const debut = app08.indexOf("async function supaPublishStory(");
  const story = app08.slice(debut, debut + 4000);
  expect((story.match(/supaUploadMedia\([^)]*\)/) || [])[0]).toBe('supaUploadMedia(story.id, folder, story.media, mediaType || "photo")');
});

test("une légère est servie telle quelle : aucune transformation, la grande se retrouve, les grilles ne demandent plus la grande", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(() => {
    const legere = "https://passio-app.netlify.app/media/content/photos/u/p.jpg.v720.webp";
    const ancienne = "https://passio-app.netlify.app/media/content/photos/u/p.jpg";
    const premiereForme = "https://passio-app.netlify.app/media/content/photos/u/q.v720.webp"; // légère du 21/09 sans extension de grande
    const post = { id: "img_1", authorId: "a", passion: "photo", mood: "all", type: "photo", image: legere, text: "", likes: 0, comments: [], fromSupabase: true, createdAt: Date.now() };
    const carte = document.createElement("div"); carte.innerHTML = renderPostHTML(post);
    const src = carte.querySelector(".post-media img") && carte.querySelector(".post-media img").getAttribute("src");
    return { estLegere: [estImageLegere(legere), estImageLegere(ancienne), estImageLegere(legere + "?x=1"), estImageLegere("photos/u/p.png.v720.jpg#f"), estImageLegere(premiereForme)],
      thumbLegere: passioThumb(legere, 700), thumbAncienne: passioThumb(ancienne, 700),
      grande: imageGrande(legere), grandePng: imageGrande("photos/u/p.png.v720.jpg?x=1"), grandeAncienne: imageGrande(ancienne), grandePremiereForme: imageGrande(premiereForme), src };
  });
  const ancienne = "https://passio-app.netlify.app/media/content/photos/u/p.jpg", premiereForme = "https://passio-app.netlify.app/media/content/photos/u/q.v720.webp";
  expect(r.estLegere).toEqual([true, false, true, true, true]);
  // Une URL de l'ancien relais `/media/*` se lit à la source, le CDN Supabase (2026-11-09).
  expect(r.thumbLegere).toBe("https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/u/p.jpg.v720.webp");
  expect(r.thumbAncienne).toBe("https://njkiyoklssvefstljemx.supabase.co/storage/v1/render/image/public/content/photos/u/p.jpg?width=700&quality=75");
  expect(r.grande).toBe("https://passio-app.netlify.app/media/content/photos/u/p.jpg");
  expect(r.grandePng).toBe("photos/u/p.png?x=1");
  expect(r.grandeAncienne).toBe(ancienne);
  expect(r.grandePremiereForme).toBe(premiereForme); // jamais une URL devinée
  expect(r.src).toBe("https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/u/p.jpg.v720.webp");
  // Mesuré à la SOURCE : la grille du profil et l'album d'une activité passent par passioThumb.
  const fs = require("fs"), path = require("path");
  const app06 = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-06-reels-partage.js"), "utf8");
  expect(app06).toContain('p.image?passioThumb(p.image, 360)');
  const app07 = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-07-ia-explore-irl.js"), "utf8");
  expect(app07).toContain('safeUrlAttr(passioThumb(p.image, 400))');
  // La grille « Photos » d'un profil VISITÉ (app-04), oubliée par le lot : vignette, jamais la grande.
  const app04 = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-04-comments-shop.js"), "utf8");
  expect(app04).toContain('var src = p.image ? passioThumb(p.image, 360) : "";');
});

test("supprimer une publication emporte la grande avec la légère ; une story refusée aussi ; les médias d'avant, un seul objet", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    const cdn = "https://passio-app.netlify.app/media/content/";
    const direct = "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/";
    const chemins = (image) => _cheminsMediaPost({ image });
    // Story refusée par la RLS : le retrait passe par le même dérivateur.
    window.__retires = [];
    supa.storage.from = () => ({ remove: async (paths) => { __retires.push(paths); return { error: null }; } });
    const src = await (await fetch("js/app-08-ui-modals-tour.js")).text();
    return {
      legere: chemins(cdn + "photos/u/p.jpg.v720.webp?x=1"),
      legerePng: chemins(direct + "photos/u/p.png.v720.jpg"),
      premiereForme: chemins(cdn + "photos/u/q.v720.webp"),
      ancienne: chemins(cdn + "photos/u/r.jpg"),
      video: _cheminsMediaPost({ video: cdn + "videos/u/v.mp4", cover: cdn + "photos/u/c.jpg.v720.webp" }),
      storyRefusee: src.includes('await supa.storage.from("content").remove(cheminsImageStorage(decodeURIComponent(_chemin)));'),
      helper: [cheminsImageStorage(""), cheminsImageStorage(null), cheminsImageStorage("photos/u/p.jpg.v720.webp#f")],
    };
  });
  expect(r.legere).toEqual(["photos/u/p.jpg.v720.webp", "photos/u/p.jpg"]);
  expect(r.legerePng).toEqual(["photos/u/p.png.v720.jpg", "photos/u/p.png"]);
  // Première forme (21/09) : l'extension de la grande est perdue, on tente les formats connus — `remove` ignore les absents.
  expect(r.premiereForme).toEqual(["photos/u/q.v720.webp", "photos/u/q.jpg", "photos/u/q.jpeg", "photos/u/q.png", "photos/u/q.webp"]);
  expect(r.ancienne).toEqual(["photos/u/r.jpg"]);
  expect(r.video).toEqual(["videos/u/v.mp4", "photos/u/c.jpg.v720.webp", "photos/u/c.jpg"]);
  expect(r.storyRefusee).toBe(true);
  expect(r.helper).toEqual([[], [], ["photos/u/p.jpg.v720.webp", "photos/u/p.jpg"]]);
});
