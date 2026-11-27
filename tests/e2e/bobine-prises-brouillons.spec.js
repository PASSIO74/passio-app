// ═══════════════════════════════════════════════════════════════════════════
// BOBINE EN PLUSIEURS PRISES — ET BROUILLONS DE STORY / BOBINE (2026-11-27)
// Suite du lot story/bobine (« Ok fait tout », Benjamin). Par les vrais gestes,
// sur la caméra simulée de Chromium. Verrous :
//   ① plusieurs prises : toucher = filmer, toucher = PAUSE (on reste en
//      capture), toucher = reprendre, « Terminer » = aperçu ; la vidéo ne
//      contient que ce qui a été filmé (les pauses n'y sont pas) ;
//   ② plusieurs prises : maintenir filme, relâcher met en pause ; « Refaire »
//      et ✕ DEMANDENT avant de jeter ; la durée choisie borne le CUMUL ; ni
//      mode ni caméra ne changent entre deux prises ;
//   ③ brouillon : enregistré depuis « Abandonner ? », il survit au
//      rechargement, se reprend (média, textes, dessin, filtre, mode) et
//      disparaît une fois publié ;
//   ④ brouillon : il appartient à UN compte (pas montré à un autre, purgé à la
//      déconnexion) ; une écriture refusée ou une lecture impossible se DIT et
//      ne détruit rien ; six au plus ; le mode Créer (fond + texte) aussi.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.use({
  viewport: { width: 390, height: 780 },
  hasTouch: true,
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
});

const EDITION = () => document.getElementById("mediaEditor").classList.contains("phase-edit");
const CAPTURE = () => {
  const ed = document.getElementById("mediaEditor");
  return ed.classList.contains("phase-capture") && ed.classList.contains("me-cam-on");
};
const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

async function ouvrir(page, mode) {
  await bootOnboarded(page);
  await preparer(page);
  await page.evaluate((m) => meOpen(m), mode);
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
}
async function preparer(page) {
  await page.evaluate(() => {
    const l = document.getElementById("landing"); if (l) l.classList.remove("active");
    window.requireAuthentication = () => true;
    window.__toasts = [];
    const t = window.toast;
    window.toast = function (msg) { window.__toasts.push(String(msg)); return t.apply(this, arguments); };
  });
}
const atteint = (page, sel) => page.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { ok: !!t && (t === el || el.contains(t)), cx: r.left + r.width / 2, min: Math.round(Math.min(r.width, r.height)) }; });
const etat = (page) => page.evaluate(() => ({ rec: meCam.recording, pause: !!meCam.enPause, prises: meCam.nbPrises, enregistreur: meCam.recorder && meCam.recorder.state }));

test("① plusieurs prises : filmer, mettre en pause, reprendre, terminer — la vidéo ne contient que le filmé", async ({ page }) => {
  await ouvrir(page, "bobine");
  await page.locator("#mePrisesBtn").tap();
  await expect(page.locator("#mePrisesBtn")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#meCaptureHint")).toHaveText("Appuie pour filmer une prise · appuie encore pour la mettre en pause");

  // Prise 1.
  await page.locator("#meShutter").tap();
  await expect.poll(() => etat(page)).toEqual({ rec: true, pause: false, prises: 1, enregistreur: "recording" });
  await expect(page.locator("#meCaptureHint")).toHaveText("Appuie pour mettre en pause");
  await page.waitForTimeout(1200);
  // Toucher : PAUSE — on reste en capture, rien n'est encore à l'aperçu.
  await page.locator("#meShutter").tap();
  await expect.poll(() => etat(page)).toEqual({ rec: true, pause: true, prises: 1, enregistreur: "paused" });
  expect(await page.evaluate(EDITION)).toBe(false);
  await expect(page.locator("#mediaEditor")).toHaveClass(/me-pause/);
  await expect(page.locator("#meRecTime")).toHaveText(/^0:0[12] · 1 prise$/);
  await expect(page.locator("#meCaptureHint")).toHaveText("Appuie pour filmer la suite · « Terminer » pour l'aperçu");
  // « Refaire » et « Terminer » ont pris la place de la galerie et de la caméra ; le déclencheur reste centré.
  for (const sel of ["#mePrisesRecommencer", "#mePrisesTerminer", "#meShutter", "#meBackBtn"]) {
    const m = await atteint(page, sel);
    expect(m.ok, sel + " reçoit le toucher").toBe(true);
    expect(m.min, sel + " mesure au moins 44 px").toBeGreaterThanOrEqual(44);
  }
  expect(Math.abs((await atteint(page, "#meShutter")).cx - 195)).toBeLessThanOrEqual(1);
  await expect(page.locator("#meGalleryThumb")).toBeHidden();
  await expect(page.locator("#meFlipBtn")).toBeHidden();
  await expect(page.locator("#meRail")).toBeHidden();
  await expect(page.locator("#meModes")).toBeHidden();
  // Entre deux prises : ni changement de mode, ni changement de caméra (l'enregistreur est lié au flux).
  const flux = await page.evaluate(() => meCam.stream.id);
  await page.evaluate(() => { meChoisirMode("story"); meFlipCamera(); });
  expect(await page.evaluate(() => ({ mode: meState.mode, flux: meCam.stream.id }))).toEqual({ mode: "bobine", flux });

  // La pause dure : elle ne comptera pas.
  const filmeAvant = await page.evaluate(() => _meTempsFilme());
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => _meTempsFilme()), "le temps filmé n'avance pas en pause").toBe(filmeAvant);

  // Prise 2, puis pause, puis « Terminer ».
  await page.locator("#meShutter").tap();
  await expect.poll(() => etat(page)).toEqual({ rec: true, pause: false, prises: 2, enregistreur: "recording" });
  await page.waitForTimeout(1000);
  await page.locator("#meShutter").tap();
  await expect.poll(() => etat(page)).toEqual({ rec: true, pause: true, prises: 2, enregistreur: "paused" });
  await expect(page.locator("#meRecTime")).toHaveText(/ · 2 prises$/);
  const filme = await page.evaluate(() => _meTempsFilme() / 1000);
  await page.locator("#mePrisesTerminer").tap();
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  const r = await page.evaluate(() => new Promise((res) => {
    const v = document.querySelector("#meMedia video");
    const fin = () => res({ type: meState.mediaType, source: meState.source && meState.source.duree, video: v ? v.duration : null, classes: document.getElementById("mediaEditor").className });
    if (v && v.readyState >= 1) fin(); else if (v) { v.addEventListener("loadedmetadata", fin, { once: true }); setTimeout(fin, 5000); } else fin();
  }));
  expect(r.type).toBe("video");
  // ~2,2 s filmées en 2 prises, pour ~3,7 s d'horloge : la pause n'est pas dans la vidéo.
  expect(r.source).toBeGreaterThan(1.8);
  expect(r.source, "la durée retenue est celle du filmé, pas de l'horloge").toBeLessThan(filme + 0.4);
  if (Number.isFinite(r.video)) expect(r.video, "la vidéo elle-même ne contient pas la pause").toBeLessThan(filme + 0.8);
  expect(r.classes).not.toMatch(/me-pause|me-prises|me-recording/);
  await expect(page.locator('[data-v7-bobine-act="continuer"]')).toBeVisible();
});

test("② plusieurs prises : maintien = prise, relâché = pause ; « Refaire » et ✕ demandent ; la durée borne le cumul", async ({ page }) => {
  await ouvrir(page, "bobine");
  await page.locator("#mePrisesBtn").tap();
  // Maintenir filme, relâcher met en PAUSE (pas à l'aperçu).
  const b = await page.locator("#meShutter").boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => meCam.recording && !meCam.enPause)).toBe(true);
  await page.waitForTimeout(1100);
  await page.mouse.up();
  await expect.poll(() => etat(page)).toEqual({ rec: true, pause: true, prises: 1, enregistreur: "paused" });
  expect(await page.evaluate(EDITION)).toBe(false);

  // « Refaire » : question ; « Garder mes prises » ne jette rien.
  await page.locator("#mePrisesRecommencer").tap();
  const feuille = page.locator("#feuilleConfirmation");
  await expect(feuille.locator(".feuille-conf-titre")).toHaveText("Recommencer la bobine ?");
  await feuille.locator('[data-conf="annuler"]').tap();
  expect((await etat(page)).pause).toBe(true);
  // ✕ : des prises existent — on demande aussi.
  await page.locator("#meBackBtn").tap();
  await expect(feuille.locator(".feuille-conf-titre")).toHaveText("Abandonner cette bobine ?");
  await feuille.locator('[data-conf="annuler"]').tap();
  expect(await page.evaluate(() => ({ ouvert: document.getElementById("mediaEditor").classList.contains("open"), pause: !!meCam.enPause }))).toEqual({ ouvert: true, pause: true });
  // Le geste retour, lui, mène à l'APERÇU de ce qui est filmé (rien n'est jeté).
  // « Refaire » confirmé : retour à une capture nette, l'outil reste armé.
  await page.locator("#mePrisesRecommencer").tap();
  await feuille.locator('[data-conf="recommencer"]').tap();
  await expect.poll(() => page.evaluate(() => ({ rec: meCam.recording, classes: /me-pause|me-prises|me-recording/.test(document.getElementById("mediaEditor").className), arme: meCap.prises, media: meState.media }))).toEqual({ rec: false, classes: false, arme: true, media: null });
  await expect(page.locator("#meGalleryThumb")).toBeVisible();
  await expect(page.locator("#meRail")).toBeVisible();
  expect(await page.evaluate(EDITION), "rien n'est parti à l'aperçu").toBe(false);

  // La durée choisie borne le CUMUL des prises : atteinte, la reprise mène à l'aperçu.
  await page.locator("#meDureeBtn").tap();   // 15 s
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => meCam.recording && !meCam.enPause)).toBe(true);
  await page.waitForTimeout(900);
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => !!meCam.enPause)).toBe(true);
  await page.evaluate(() => { meCam.recCumul = _meDureeMaxMs() - 100; });   // 14,9 s déjà filmées
  await page.locator("#meShutter").tap();
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  expect(await page.evaluate(() => meState.mediaType)).toBe("video");

  // Sans l'outil, la bobine garde son geste d'origine : toucher = filmer, toucher = aperçu.
  await page.evaluate(() => meBackToCapture());
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await page.locator("#mePrisesBtn").tap();
  await expect(page.locator("#mePrisesBtn")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => meCam.recording)).toBe(true);
  await page.waitForTimeout(900);
  await page.locator("#meShutter").tap();
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  // En story, l'outil n'existe pas et s'éteint.
  await page.evaluate(() => { meBackToCapture(); });
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await page.locator("#mePrisesBtn").tap();
  await page.locator('#meModes [data-mode="story"]').tap();
  await expect(page.locator("#mePrisesBtn")).toBeHidden();
  expect(await page.evaluate(() => meCap.prises)).toBe(false);
});

test("③ brouillon : enregistré depuis « Abandonner ? », il survit au rechargement, se reprend en entier, disparaît une fois publié", async ({ page }) => {
  await ouvrir(page, "story");
  await expect(page.locator("#meBrouillonsBtn"), "pas de bouton sans brouillon").toBeHidden();
  await page.locator("#meShutter").tap();
  await page.waitForFunction(EDITION, null, { timeout: 15000 });
  await page.evaluate(() => {
    meAddOverlay({ type: "text", text: "Sortie vélo", color: "#facc15", size: 30, x: 40, y: 30, style: "fond", align: "left" });
    meAddOverlay({ type: "emoji", emoji: "🔥", x: 60, y: 70, size: 52 });
    meState.dessin = [{ c: "#ffffff", w: 6, p: [100, 100, 400, 400, 700, 200] }];
    _meDessinRendre();
    meChoisirFiltre("nb");
  });
  await page.locator("#meBackBtn").tap();
  const feuille = page.locator("#feuilleConfirmation");
  await expect(feuille.locator(".feuille-conf-btn")).toHaveText(["Enregistrer le brouillon", "Abandonner", "Continuer la modification"]);
  await feuille.locator('[data-conf="brouillon"]').tap();
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await expect.poll(() => page.evaluate(() => window.__toasts.join("|"))).toContain("Brouillon enregistré");
  await expect(page.locator("#meBrouillonsBtn")).toBeVisible();
  await expect(page.locator("#meBrouillonsPastille")).toHaveText("1");
  expect((await atteint(page, "#meBrouillonsBtn")).ok).toBe(true);
  // Le média est un BLOB en IndexedDB — jamais du base64, jamais dans localStorage.
  const stock = await page.evaluate(async () => {
    const l = await idbBrouillonsLoad();
    return { n: l.length, blob: l[0].blob instanceof Blob, type: l[0].blob.type, base64: JSON.stringify(Object.assign({}, l[0], { blob: null, apercu: null })).includes("base64"), local: Object.keys(localStorage).some((k) => /brouillon/i.test(k) && k !== "passio_vlog_draft_v1") };
  });
  expect(stock).toEqual({ n: 1, blob: true, type: "image/jpeg", base64: false, local: false });

  // Rechargement complet : le brouillon est toujours là, et se reprend depuis l'écran BOBINE.
  await page.evaluate(() => meClose());
  await page.reload();
  await page.waitForFunction(() => { const e = document.getElementById("screen-feed"); return e && e.classList.contains("active"); }, null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  await preparer(page);
  await page.evaluate(() => meOpen("bobine"));
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await expect(page.locator("#meBrouillonsBtn")).toBeVisible();
  await page.locator("#meBrouillonsBtn").tap();
  const ligne = page.locator("#meBrouillonsPanel .me-brouillon");
  await expect(ligne).toHaveCount(1);
  await expect(ligne.locator(".me-brouillon-texte b")).toHaveText("Story · photo");
  await expect(ligne.locator(".me-brouillon-vignette img")).toHaveCount(1);
  await ligne.locator(".me-brouillon-reprendre").tap();
  await page.waitForFunction(EDITION, null, { timeout: 15000 });
  const repris = await page.evaluate(() => ({
    mode: meState.mode, titre: document.getElementById("meTitle").textContent, type: meState.mediaType, image: /^data:image\//.test(meState.media || ""),
    overlays: meState.overlays.map((o) => [o.type, o.text || o.emoji, o.x, o.y, o.color || null, o.style || null, o.align || null]),
    rendus: document.querySelectorAll("#meOverlays .me-overlay").length, choisi: document.querySelectorAll("#meOverlays .me-overlay.selected").length,
    dessin: meState.dessin, traits: document.querySelectorAll("#meDessinSvg polyline").length,
    filtre: meState.filtre, filtreRendu: document.getElementById("meMedia").classList.contains("filtre-nb"), lie: !!meState.brouillonId,
  }));
  expect(repris).toEqual({
    mode: "story", titre: "Story", type: "photo", image: true,
    overlays: [["text", "Sortie vélo", 40, 30, "#facc15", "fond", "left"], ["emoji", "🔥", 60, 70, null, null, null]],
    rendus: 2, choisi: 0, dessin: [{ c: "#ffffff", w: 6, p: [100, 100, 400, 400, 700, 200] }], traits: 1,
    filtre: "nb", filtreRendu: true, lie: true,
  });
  // Repris mais pas encore publié : il reste enregistré (un rechargement ne le perdrait pas).
  expect(await page.evaluate(async () => (await meBrouillonsLire()).length)).toBe(1);
  // Ré-enregistré : il se REMPLACE, il ne se dédouble pas.
  await page.locator("#meBackBtn").tap();
  await feuille.locator('[data-conf="brouillon"]').tap();
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  expect(await page.evaluate(async () => (await meBrouillonsLire()).length)).toBe(1);
  // Publié : le brouillon disparaît, le bouton aussi.
  await page.locator("#meBrouillonsBtn").tap();
  await page.locator("#meBrouillonsPanel .me-brouillon-reprendre").tap();
  await page.waitForFunction(EDITION, null, { timeout: 15000 });
  await page.evaluate(() => { window._supaReal = false; meState._enteredEditAt = 0; mePublish(); });
  await expect.poll(() => page.evaluate(async () => (await meBrouillonsLire()).length)).toBe(0);
  const story = await page.evaluate(() => state.seed.stories[0]);
  expect(story.overlays.map((o) => o.type)).toEqual(["dessin", "text", "emoji", "filtre"]);
  await page.evaluate(() => meOpen("story"));
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await expect(page.locator("#meBrouillonsBtn")).toBeHidden();
});

test("④ brouillon : à UN compte, purgé avec lui ; un échec se dit et ne détruit rien ; six au plus ; mode Créer", async ({ page }) => {
  await ouvrir(page, "story");
  // Mode Créer : un fond (indice) et un texte, sans média.
  await page.locator("#meBgBtn").tap();
  await page.locator("#meTeChamp").fill("Qui vient dimanche ?");
  await page.evaluate(() => { meChangerFond(); meChangerFond(); });
  await page.locator("#meTeOk").tap();
  const fond = await page.evaluate(() => meState.bgIdx);
  expect(fond).toBe(2);
  await page.locator("#meBackBtn").tap();
  await page.locator('#feuilleConfirmation [data-conf="brouillon"]').tap();
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await page.locator("#meBrouillonsBtn").tap();
  await expect(page.locator("#meBrouillonsPanel .me-brouillon-texte b")).toHaveText("Story · texte");
  await page.locator("#meBrouillonsPanel .me-brouillon-reprendre").tap();
  await page.waitForFunction(EDITION, null, { timeout: 15000 });
  expect(await page.evaluate(() => ({ fond: meState.bgIdx, creer: document.getElementById("mediaEditor").classList.contains("me-fond"), media: meState.media, texte: meState.overlays[0].text, peint: document.getElementById("meCanvas").style.background.includes("gradient") }))).toEqual({ fond: 2, creer: true, media: null, texte: "Qui vient dimanche ?", peint: true });
  await page.evaluate(() => meBackToCapture());
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });

  // ÉCRITURE REFUSÉE (quota) : on le dit, l'édition reste intacte, rien n'est annoncé enregistré.
  await page.evaluate((photo) => { meSetMedia(photo, "photo"); meAddOverlay({ type: "text", text: "À garder", color: "#fff", size: 30, x: 50, y: 50 }); window.__toasts.length = 0; window.__vraiSave = idbBrouillonsSave; idbBrouillonsSave = async () => false; }, PHOTO);
  await page.locator("#meBackBtn").tap();
  await page.locator('#feuilleConfirmation [data-conf="brouillon"]').tap();
  await expect.poll(() => page.evaluate(() => window.__toasts.join("|"))).toContain("Brouillon non enregistré");
  expect(await page.evaluate(() => ({ edition: document.getElementById("mediaEditor").classList.contains("phase-edit"), n: meState.overlays.length, faux: window.__toasts.some((t) => t === "Brouillon enregistré") }))).toEqual({ edition: true, n: 1, faux: false });
  // LECTURE IMPOSSIBLE : on n'écrit pas par-dessus (les brouillons déjà là survivent).
  await page.evaluate(() => { idbBrouillonsSave = window.__vraiSave; window.__ecritures = 0; const s = idbBrouillonsSave; idbBrouillonsSave = function () { window.__ecritures++; return s.apply(this, arguments); }; window.__vraiLoad = idbBrouillonsLoad; idbBrouillonsLoad = async () => undefined; window.__toasts.length = 0; });
  expect(await page.evaluate(() => meEnregistrerBrouillon())).toBe(false);
  expect(await page.evaluate(() => ({ ecritures: window.__ecritures, dit: window.__toasts.join("|") }))).toEqual({ ecritures: 0, dit: "⚠️ Brouillon non enregistré — stockage de l'appareil indisponible" });
  await page.evaluate(() => { idbBrouillonsLoad = window.__vraiLoad; });
  expect(await page.evaluate(async () => (await meBrouillonsLire()).length), "le brouillon du mode Créer est toujours là").toBe(1);

  // SIX au plus : le septième pousse le plus ancien dehors.
  const n = await page.evaluate(async () => {
    for (let i = 0; i < 7; i++) { meState.brouillonId = null; meState.overlays[0].text = "Brouillon " + i; await meEnregistrerBrouillon(); }
    const l = await meBrouillonsLire();
    return { n: l.length, premier: l[0].overlays[0].text, dernier: l[l.length - 1].overlays[0].text };
  });
  expect(n).toEqual({ n: 6, premier: "Brouillon 6", dernier: "Brouillon 1" });
  // Supprimer depuis la liste : un de moins, la liste se repeint.
  await page.evaluate(() => meBackToCapture());
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await expect(page.locator("#meBrouillonsPastille")).toHaveText("6");
  await page.locator("#meBrouillonsBtn").tap();
  await expect(page.locator("#meBrouillonsPanel .me-brouillon")).toHaveCount(6);
  await page.locator("#meBrouillonsPanel .me-brouillon-suppr").first().tap();
  await expect(page.locator("#meBrouillonsPanel .me-brouillon")).toHaveCount(5);
  await expect(page.locator("#meBrouillonsPastille")).toHaveText("5");

  // UN COMPTE : un autre compte sur le même appareil ne voit pas ces brouillons…
  const autre = await page.evaluate(async () => {
    const vrai = window._fileProprietaire;
    window._fileProprietaire = () => "a1b2c3d4-0000-4000-8000-0000000000b2";
    const vus = (await meBrouillonsLire()).length;
    window._fileProprietaire = vrai;
    return { vus, miens: (await meBrouillonsLire()).length };
  });
  expect(autre).toEqual({ vus: 0, miens: 5 });
  // … et la purge du compte (déconnexion, suppression) les efface du stockage durable.
  await page.evaluate(() => { const p = document.getElementById("meBrouillonsPanel"); if (p) p.remove(); meClose(); });
  expect(await page.evaluate(async () => { await purgeAccountScopedData(); return (await idbBrouillonsLoad()).length; })).toBe(0);
});
