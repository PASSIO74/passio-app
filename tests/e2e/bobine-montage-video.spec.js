// ═══════════════════════════════════════════════════════════════════════════
// BOBINE ET STORY — MONTAGE VIDÉO DANS L'APP + ❓ QUESTION EN BOBINE (2026-11-26)
// « Sur les bobines, rajoute les mêmes fonctionnalités que sur les stories, et
// la possibilité de télécharger des vidéos et de les modifier direct dans
// l'app » (Benjamin).
//   ① ✂️ n'existe que pour une vidéo ; le passage choisi est ENCODÉ pour de vrai
//      (la vidéo publiée dure le passage, pas la source) ;
//   ② son coupé, annulation et geste retour : réglages transmis à la seule
//      autorité (`passioVideoPourEnvoi`), annuler rend le média intact ;
//   ③ vidéo de galerie trop longue : la piste s'ouvre AVANT tout encodage, on
//      choisit le passage (il était coupé d'office aux 60 premières secondes) ;
//   ④ un montage qui échoue ne retombe JAMAIS sur la vidéo entière ;
//   ⑤ ❓ Question en bobine : proposée à la création (le Sondage aussi depuis le
//      2026-11-27 — voir bobine-sondage.spec.js), rendue par
//      le lecteur de bobines, la réponse part à l'AUTEUR DE LA BOBINE affichée ;
//   ⑥ annuler l'import d'une vidéo longue garde la photo et ses calques.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

// Fabrique une vidéo webm de `secondes` dans la page (canvas + MediaRecorder) :
// aucun fichier binaire dans le dépôt. L'encodeur est forcé en webm, le seul que
// Chromium de banc sait RELIRE (pas de décodeur H.264).
async function preparer(page, mode, secondes) {
  await bootOnboarded(page);
  await page.evaluate(async ({ m, s }) => {
    window.requireAuthentication = () => true;
    window._passioBestVideoMime = () => "video/webm";
    try { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("banc")); } catch (e) {}
    const c = document.createElement("canvas"); c.width = 160; c.height = 120;
    const ctx = c.getContext("2d");
    const flux = c.captureStream(30);
    const rec = new MediaRecorder(flux, { mimeType: "video/webm" });
    const morceaux = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) morceaux.push(e.data); };
    let f = 0;
    const t = setInterval(() => { ctx.fillStyle = "hsl(" + ((f++ * 12) % 360) + ",80%,50%)"; ctx.fillRect(0, 0, 160, 120); }, 33);
    rec.start(200);
    await new Promise((r) => setTimeout(r, s * 1000));
    await new Promise((r) => { rec.onstop = r; rec.stop(); });
    clearInterval(t);
    window.__video = new File(morceaux, "banc.webm", { type: "video/webm" });
    meOpen(m);
  }, { m: mode, s: secondes });
}

async function importer(page) {
  await page.evaluate(async () => {
    const dt = new DataTransfer(); dt.items.add(window.__video);
    const i = document.getElementById("meMediaInput"); i.files = dt.files;
    await meOnMedia({ target: i });
  });
}

test("① ✂️ seulement pour une vidéo ; le passage choisi est réellement encodé", async ({ page }) => {
  test.setTimeout(60000);
  await preparer(page, "bobine", 4);
  await expect(page.locator("#meMontageBtn")).toBeHidden();
  await importer(page);
  await expect(page.locator("#mediaEditor")).toHaveClass(/phase-edit/);
  await expect(page.locator("#meMontageBtn")).toBeVisible();
  expect(await page.evaluate(() => meState.source && meState.source.origine)).toBe("fichier");

  await page.locator("#meMontageBtn").click();
  await expect(page.locator("#meMontage")).toBeVisible();
  await expect(page.locator("#meMtInfos")).toContainText("gardées sur");
  // Outils et Publier masqués pendant le montage.
  await expect(page.locator("#mePublishBtn")).toBeHidden();
  const duree = await page.evaluate(() => meMontage.duree);
  expect(duree).toBeGreaterThan(3);
  // Clavier sur les poignées : début +1 s, fin −1 s.
  await page.locator("#meMtDebut").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.locator("#meMtFin").focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  const sel = await page.evaluate(() => ({ debut: meMontage.debut, fin: meMontage.fin }));
  expect(sel.debut).toBeCloseTo(1, 1);
  expect(sel.fin).toBeCloseTo(duree - 1, 1);

  await page.locator("#meMtOk").click();
  await expect(page.locator("#meMontage")).toBeHidden({ timeout: 30000 });
  await expect.poll(() => page.evaluate(() => !!meState.montage), { timeout: 30000 }).toBe(true);
  const r = await page.evaluate(async () => {
    const b = _meDataUrlToBlob(meState.media);
    return { duree: await _meDureeFichier(b), montage: meState.montage, source: meState.source.blob === window.__video, video: meState.mediaType };
  });
  expect(r.video).toBe("video");
  expect(r.source, "la SOURCE est gardée pour rouvrir ✂️").toBe(true);
  expect(r.montage.debut).toBeCloseTo(1, 1);
  // La vidéo produite dure le PASSAGE (≈ durée − 2 s), pas la source.
  // Tolérance large : l'encodage suit l'horloge réelle, un banc saturé décale d'un demi-temps.
  expect(r.duree).toBeGreaterThan(duree - 2 - 1.2);
  expect(r.duree).toBeLessThan(duree - 2 + 1.2);
  // Rouvrir ✂️ reprend le passage appliqué, sur la source entière.
  await page.locator("#meMontageBtn").click();
  await expect.poll(() => page.evaluate(() => meMontage && meMontage.duree)).toBeGreaterThan(3);
  expect(await page.evaluate(() => meMontage.debut)).toBeCloseTo(1, 1);
});

test("② son coupé transmis ; annuler et geste retour rendent le média intact", async ({ page }) => {
  test.setTimeout(45000);
  await preparer(page, "story", 3);
  await importer(page);
  const avant = await page.evaluate(() => meState.media.length);
  await page.evaluate(() => {
    window.__appels = [];
    window.passioVideoPourEnvoi = (f, m) => { window.__appels.push(m || null); return Promise.resolve("data:video/webm;base64," + "A".repeat(4000)); };
  });
  // Annuler (✕ de la piste) : rien n'est encodé, le média est le même.
  await page.locator("#meMontageBtn").click();
  await expect(page.locator("#meMontage")).toBeVisible();
  await page.locator("#meMtAnnuler").click();
  await expect(page.locator("#meMontage")).toBeHidden();
  // Geste RETOUR : ferme la piste, garde l'éditeur.
  await page.locator("#meMontageBtn").click();
  await expect(page.locator("#meMontage")).toBeVisible();
  await page.evaluate(() => closeCurrentOverlay());
  await expect(page.locator("#meMontage")).toBeHidden();
  await expect(page.locator("#mediaEditor")).toHaveClass(/open/);
  expect(await page.evaluate(() => window.__appels.length)).toBe(0);
  expect(await page.evaluate(() => meState.media.length)).toBe(avant);
  // OK sans rien changer : rien n'est encodé.
  await page.locator("#meMontageBtn").click();
  await expect.poll(() => page.evaluate(() => meMontage && meMontage.duree)).toBeGreaterThan(2);
  await page.locator("#meMtOk").click();
  expect(await page.evaluate(() => window.__appels.length)).toBe(0);
  // Son coupé : passage entier, mais SANS son → un montage est demandé.
  await page.locator("#meMontageBtn").click();
  await expect.poll(() => page.evaluate(() => meMontage && meMontage.duree)).toBeGreaterThan(2);
  await page.locator("#meMtSon").click();
  await expect(page.locator("#meMtSon")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#meMtOk").click();
  await expect.poll(() => page.evaluate(() => window.__appels.length)).toBe(1);
  const m = await page.evaluate(() => window.__appels[0]);
  expect(m.sansSon).toBe(true);
  expect(m.debut).toBe(0);
  expect(await page.evaluate(() => meState.montage && meState.montage.sansSon)).toBe(true);
});

test("③ vidéo de galerie trop longue : on CHOISIT le passage avant d'encoder", async ({ page }) => {
  test.setTimeout(45000);
  await preparer(page, "bobine", 4);
  await page.evaluate(() => {
    VIDEO_DUREE_MAX = 2;
    window.__appels = [];
    const vrai = passioVideoPourEnvoi;
    window.passioVideoPourEnvoi = (f, m) => { window.__appels.push(m || null); return vrai(f, m); };
  });
  await importer(page);
  // Rien n'est encodé : la piste est ouverte sur la source.
  await expect(page.locator("#meMontage")).toBeVisible();
  expect(await page.evaluate(() => window.__appels.length)).toBe(0);
  await expect.poll(() => page.evaluate(() => meMontage && meMontage.fin)).toBeCloseTo(2, 1);
  // Le passage ne dépasse jamais la durée maximale : tirer la fin entraîne le début.
  await page.evaluate(() => _meMontagePoser("fin", meMontage.duree));
  const p = await page.evaluate(() => ({ d: meMontage.debut, f: meMontage.fin, duree: meMontage.duree }));
  expect(p.f - p.d).toBeCloseTo(2, 1);
  expect(p.f).toBeCloseTo(p.duree, 1);
  // Annuler une importation ramène à la capture.
  await page.locator("#meMtAnnuler").click();
  await expect(page.locator("#mediaEditor")).toHaveClass(/phase-capture/);
  expect(await page.evaluate(() => meState.media)).toBeNull();
  // Réimporter, choisir la fin, valider : le passage choisi part à l'encodage.
  await importer(page);
  await expect.poll(() => page.evaluate(() => meMontage && meMontage.duree)).toBeGreaterThan(3);
  await page.evaluate(() => _meMontagePoser("cadre", 99));
  await page.locator("#meMtOk").click();
  await expect.poll(() => page.evaluate(() => meState.mediaType), { timeout: 30000 }).toBe("video");
  const a = await page.evaluate(() => window.__appels[0]);
  expect(a.debut).toBeGreaterThan(1.5);
  expect(a.fin - a.debut).toBeCloseTo(2, 1);
});

test("④ un montage qui échoue ne publie jamais la vidéo entière", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    window.passioCompressVideo = () => Promise.reject(new Error("codec absent"));
    const petit = new File([new Uint8Array(50000)], "v.webm", { type: "video/webm" });
    try { await passioVideoPourEnvoi(petit, { debut: 1, fin: 3, sansSon: false }); return { ok: true }; }
    catch (e) { return { motif: e.motifUtilisateur }; }
  });
  expect(r.ok, "aucun repli brut pour un montage").toBeUndefined();
  expect(r.motif).toMatch(/Montage impossible/);
});

test("⑤ ❓ Question en bobine : proposée, rendue, réponse à l'auteur de la bobine", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.requireAuthentication = () => true;
    try { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("banc")); } catch (e) {}
    meOpen("bobine");
    meEnterEditPhase();
  });
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await expect(page.locator('#meStickerPanel [data-sticker="Question"]')).toBeVisible();
  // Le Sondage aussi, depuis que ses votes ont leur table (2026-11-27, bobine-sondage.spec.js).
  await expect(page.locator('#meStickerPanel [data-sticker="Sondage"]')).toBeVisible();
  await page.evaluate(() => meClose());

  const r = await page.evaluate(async () => {
    window._uidEstUnCompte = () => true;
    window.__envois = [];
    window._envoyerALAuteurStory = (s, nom, texte) => { window.__envois.push({ a: s.authorId, texte }); return Promise.resolve("envoye"); };
    window.demanderTexte = () => Promise.resolve("Depuis 3 ans");
    const post = { id: "reel_q1", authorId: "auteur-bobine-42", authorName: "Léa", type: "photo", isReel: true, image: "", text: "",
      overlays: [{ type: "question", q: "Tu joues depuis quand ?", x: 50, y: 50 }, { type: "sondage", q: "?", a: "Oui", b: "Non", x: 50, y: 70 }], likes: 0, comments: [] };
    // Une story vue juste avant, d'un autre auteur : elle ne doit RIEN recevoir.
    storyGroups = [{ authorId: "autre-auteur", stories: [{ id: "s1", authorId: "autre-auteur", overlays: [] }] }];
    reelsState.items = [post];
    reelsState.open = true;
    const hote = document.createElement("div");
    hote.id = "banc-bobine";
    hote.innerHTML = renderReelHTML(post, 0);
    document.body.appendChild(hote);
    return { question: !!hote.querySelector(".st-question"), sondage: !!hote.querySelector(".st-sondage") };
  });
  expect(r.question).toBe(true);
  // Depuis le 2026-11-27 le sondage d'une bobine est RENDU par le lecteur (ses votes ont
  // leur table) ; c'est sa CRÉATION qui reste sous drapeau (voir bobine-sondage.spec.js).
  expect(r.sondage, "le sondage d'une bobine est rendu par le lecteur").toBe(true);
  await page.evaluate(() => document.querySelector("#banc-bobine .st-q-rep").click());
  await expect.poll(() => page.evaluate(() => window.__envois.length)).toBe(1);
  const e = await page.evaluate(() => window.__envois[0]);
  expect(e.a).toBe("auteur-bobine-42");
  expect(e.texte).toContain("Tu joues depuis quand ?");
  expect(e.texte).toContain("Depuis 3 ans");

  // Bobine dont la carte n'est pas dans un lecteur OUVERT : rien ne part.
  await page.evaluate(() => { reelsState.open = false; document.querySelector("#banc-bobine .st-q-rep").click(); });
  expect(await page.evaluate(() => window.__envois.length)).toBe(1);
});

test("⑥ annuler l'import d'une vidéo longue garde le travail en cours (photo + calques)", async ({ page }) => {
  test.setTimeout(45000);
  await preparer(page, "story", 3);
  await page.evaluate(() => {
    VIDEO_DUREE_MAX = 1;
    const c = document.createElement("canvas"); c.width = 4; c.height = 4;
    c.getContext("2d").fillRect(0, 0, 4, 4);
    meSetMedia(c.toDataURL("image/jpeg"), "photo");
    meAddOverlay({ type: "emoji", emoji: "🎸", size: 52, x: 50, y: 50 });
  });
  const avant = await page.evaluate(() => ({ media: meState.media, n: meState.overlays.length }));
  await importer(page);
  await expect(page.locator("#meMontage")).toBeVisible();
  await page.locator("#meMtAnnuler").click();
  await expect(page.locator("#meMontage")).toBeHidden();
  const apres = await page.evaluate(() => ({ media: meState.media, type: meState.mediaType, n: meState.overlays.length, phase: document.getElementById("mediaEditor").className }));
  expect(apres.media).toBe(avant.media);
  expect(apres.type).toBe("photo");
  expect(apres.n).toBe(avant.n);
  expect(apres.phase).toContain("phase-edit");
  await expect(page.locator("#meMedia img")).toHaveCount(1);
});
