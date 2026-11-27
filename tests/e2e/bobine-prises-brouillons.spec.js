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
//      déconnexion ; PAS de compte, pas de brouillon) ; une écriture refusée ou
//      une lecture impossible se DIT et ne détruit rien ; six au plus par
//      compte, et on le dit ; le mode Créer (fond + texte) aussi ; un média par
//      clé, sans orphelin ;
//   ⑤ plusieurs prises, les bords : minuteur armé (décompte à chaque reprise,
//      « Terminer » l'annule) ; enregistreur arrêté TOUT SEUL pendant une
//      pause — ce qui est filmé part à l'aperçu ;
//   ⑥ brouillon, les bords : l'écran est tenu pendant l'écriture (un seul
//      enregistrement, retour inerte) ; éditeur fermé ou compte changé pendant
//      l'écriture ; un brouillon publié n'est supprimé qu'au SUCCÈS — celui du
//      premier essai comme celui d'un renvoi (story et bobine).
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
// Un brouillon appartient à un COMPTE : le banc en pose un (sans compte, pas de brouillon — voir ④).
const COMPTE = "a1b2c3d4-0000-4000-8000-0000000000a1";
const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

async function ouvrir(page, mode) {
  await bootOnboarded(page);
  await preparer(page);
  await page.evaluate((m) => meOpen(m), mode);
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
}
async function preparer(page) {
  await page.evaluate((c) => { window.__compteBanc = c; }, COMPTE);
  await page.evaluate(() => {
    const l = document.getElementById("landing"); if (l) l.classList.remove("active");
    window.requireAuthentication = () => true;
    window._fileProprietaire = () => window.__compteBanc;
    window.__toasts = [];
    const t = window.toast;
    window.toast = function (msg) { window.__toasts.push(String(msg)); return t.apply(this, arguments); };
  });
}
const atteint = (page, sel) => page.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { ok: !!t && (t === el || el.contains(t)), cx: r.left + r.width / 2, min: Math.round(Math.min(r.width, r.height)) }; });
// Les clés de brouillon RÉELLEMENT présentes dans le stockage durable (un média sans fiche serait un orphelin).
const clesBrouillons = (page) => page.evaluate(() => new Promise((res) => {
  const rq = indexedDB.open("passio_store");
  rq.onerror = () => res(-1);
  rq.onsuccess = () => {
    const db = rq.result;
    const k = db.transaction("kv").objectStore("kv").getAllKeys();
    k.onsuccess = () => { db.close(); res(k.result.filter((x) => String(x).indexOf("brouillon_media_v1:") === 0).length); };
    k.onerror = () => { db.close(); res(-1); };
  };
}));
const masquerPage = (page, oui) => page.evaluate((o) => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => o });
  document.dispatchEvent(new Event("visibilitychange"));
}, oui);
const etat = (page) => page.evaluate(() => ({ rec: meCam.recording, pause: !!meCam.enPause, prises: meCam.nbPrises, enregistreur: meCam.recorder && meCam.recorder.state }));

test("① plusieurs prises : filmer, mettre en pause, reprendre, terminer — la vidéo ne contient que le filmé", async ({ page }) => {
  test.setTimeout(90000);
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
  await expect(page.locator("#meRecTime")).toHaveText(/^0:0\d · 1 prise$/);
  await expect(page.locator("#meCaptureHint")).toHaveText("Appuie pour filmer la suite · « Terminer » pour l'aperçu");
  // « Refaire » et « Terminer » ont pris la place de la galerie et de la caméra ; le déclencheur reste centré.
  for (const sel of ["#mePrisesRecommencerBtn", "#mePrisesTerminerBtn", "#meShutter", "#meBackBtn"]) {
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
  // Les étiquettes d'accessibilité contiennent le libellé visible (« Refaire », « Terminer »).
  await expect(page.locator("#mePrisesRecommencerBtn")).toHaveAttribute("aria-label", "Refaire la bobine");
  await expect(page.locator("#mePrisesTerminerBtn")).toHaveAttribute("aria-label", /^Terminer/);
  await page.locator("#mePrisesTerminerBtn").tap();
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  await expect.poll(() => page.evaluate(() => !!(meState.source && meState.source.blob)), { timeout: 15000 }).toBe(true);
  const r = await page.evaluate(async () => ({
    type: meState.mediaType, source: meState.source.duree,
    // Durée MESURÉE du fichier lui-même, sans condition (MediaRecorder annonce souvent
    // une durée infinie : `_meDureeFichier` va la chercher au bout du fichier).
    video: await _meDureeFichier(meState.source.blob),
    classes: document.getElementById("mediaEditor").className,
  }));
  expect(r.type).toBe("video");
  // ~2,2 s filmées en 2 prises, pour ~3,7 s d'horloge : la pause n'est pas dans la vidéo.
  expect(r.source).toBeGreaterThan(1.8);
  expect(r.source, "la durée retenue est celle du filmé, pas de l'horloge").toBeLessThan(filme + 0.4);
  expect(r.video, "le fichier a une durée mesurable").toBeGreaterThan(1.5);
  expect(r.video, "la vidéo elle-même ne contient pas la pause").toBeLessThan(filme + 0.8);
  expect(r.classes).not.toMatch(/me-pause|me-prises|me-recording/);
  await expect(page.locator('[data-v7-bobine-act="continuer"]')).toBeVisible();
});

test("② plusieurs prises : maintien = prise, relâché = pause ; « Refaire » et ✕ demandent ; la durée borne le cumul", async ({ page }) => {
  test.setTimeout(150000);
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

  // « Refaire » : question ; le geste RETOUR ne ferme QUE la question (il n'arrête pas
  // la prise sous la feuille) ; « Garder mes prises » ne jette rien.
  await page.locator("#mePrisesRecommencerBtn").tap();
  const feuille = page.locator("#feuilleConfirmation");
  await expect(feuille.locator(".feuille-conf-titre")).toHaveText("Refaire la bobine ?");
  await page.goBack();
  await expect(feuille).toHaveCount(0);
  await expect.poll(() => etat(page)).toEqual({ rec: true, pause: true, prises: 1, enregistreur: "paused" });
  expect(await page.evaluate(EDITION), "le retour n'a pas mené à l'aperçu").toBe(false);
  await page.locator("#mePrisesRecommencerBtn").tap();
  await feuille.locator('[data-conf="annuler"]').tap();
  expect((await etat(page)).pause).toBe(true);
  // ✕ : des prises existent — on demande aussi.
  await page.locator("#meBackBtn").tap();
  await expect(feuille.locator(".feuille-conf-titre")).toHaveText("Abandonner cette bobine ?");
  await feuille.locator('[data-conf="annuler"]').tap();
  expect(await page.evaluate(() => ({ ouvert: document.getElementById("mediaEditor").classList.contains("open"), pause: !!meCam.enPause }))).toEqual({ ouvert: true, pause: true });
  // Page MASQUÉE pendant une prise (appel entrant, autre application) : en plusieurs
  // prises elle se met en PAUSE — elle ne part pas à l'aperçu, rien n'est perdu.
  await page.locator("#meShutter").tap();
  await expect.poll(() => etat(page)).toEqual({ rec: true, pause: false, prises: 2, enregistreur: "recording" });
  await page.waitForTimeout(600);
  await masquerPage(page, true);
  await expect.poll(() => etat(page)).toEqual({ rec: true, pause: true, prises: 2, enregistreur: "paused" });
  expect(await page.evaluate(EDITION)).toBe(false);
  await masquerPage(page, false);
  expect((await etat(page)).pause, "le retour au premier plan ne relance rien tout seul").toBe(true);
  // « Refaire » confirmé : retour à une capture nette, l'outil reste armé.
  await page.locator("#mePrisesRecommencerBtn").tap();
  await feuille.locator('[data-conf="recommencer"]').tap();
  await expect.poll(() => page.evaluate(() => ({ rec: meCam.recording, classes: /me-pause|me-prises|me-recording/.test(document.getElementById("mediaEditor").className), arme: meCap.prises, media: meState.media }))).toEqual({ rec: false, classes: false, arme: true, media: null });
  await expect(page.locator("#meGalleryThumb")).toBeVisible();
  await expect(page.locator("#meRail")).toBeVisible();
  expect(await page.evaluate(EDITION), "rien n'est parti à l'aperçu").toBe(false);

  // La durée choisie borne le CUMUL des prises : la reprise ne filme que ce qui RESTE,
  // puis s'arrête seule sur l'aperçu.
  await page.locator("#meDureeBtn").tap();   // 15 s
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => meCam.recording && !meCam.enPause)).toBe(true);
  await page.waitForTimeout(900);
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => !!meCam.enPause)).toBe(true);
  await page.evaluate(() => { meCam.recCumul = _meDureeMaxMs() - 1500; });   // 13,5 s déjà filmées
  await page.locator("#meShutter").tap();
  await expect.poll(() => etat(page)).toEqual({ rec: true, pause: false, prises: 2, enregistreur: "recording" });
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  await expect.poll(() => page.evaluate(() => !!(meState.source && meState.source.duree)), { timeout: 15000 }).toBe(true);
  const borne = await page.evaluate(() => ({ type: meState.mediaType, duree: meState.source.duree }));
  expect(borne.type).toBe("video");
  expect(borne.duree, "le cumul ne dépasse pas la durée choisie").toBeLessThanOrEqual(15.3);
  expect(borne.duree).toBeGreaterThan(14.5);
  // Mise en pause à moins de 0,4 s de la durée : il ne resterait rien à filmer — l'aperçu, pas une pause sans issue.
  await page.evaluate(() => meBackToCapture());
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => meCam.recording && !meCam.enPause)).toBe(true);
  await page.waitForTimeout(700);
  await page.evaluate(() => { meCam.recCumul = _meDureeMaxMs() - 300 - (Date.now() - meCam.segStart); });
  await page.locator("#meShutter").tap();
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  expect(await page.evaluate(() => ({ pause: !!meCam.enPause, rec: meCam.recording }))).toEqual({ pause: false, rec: false });

  // Le geste RETOUR pendant une pause mène à l'APERÇU de ce qui est filmé (rien n'est jeté).
  await page.evaluate(() => meBackToCapture());
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => meCam.recording && !meCam.enPause)).toBe(true);
  await page.waitForTimeout(900);
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => !!meCam.enPause)).toBe(true);
  await page.goBack();
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  expect(await page.evaluate(() => ({ ouvert: document.getElementById("mediaEditor").classList.contains("open"), type: meState.mediaType, rec: meCam.recording }))).toEqual({ ouvert: true, type: "video", rec: false });

  // Sans l'outil, la bobine garde son geste d'origine : toucher = filmer, toucher = aperçu.
  await page.evaluate(() => meBackToCapture());
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await page.locator("#mePrisesBtn").tap();
  await expect(page.locator("#mePrisesBtn")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => meCam.recording)).toBe(true);
  await page.waitForTimeout(900);
  // DOUBLE toucher pour arrêter : entre l'arrêt et la fin réelle de l'enregistreur, un
  // second déclenchement ne lance PAS une nouvelle prise par-dessus celle qui finit.
  const double = await page.evaluate(() => {
    const premier = meCam.recorder;
    meStopRecording();
    meStartRecording();
    return { relance: meCam.recording, meme: meCam.recorder === premier, attendue: _mePriseEnFin() };
  });
  expect(double).toEqual({ relance: false, meme: true, attendue: true });
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  await expect.poll(() => page.evaluate(() => meState.mediaType), { timeout: 15000 }).toBe("video");
  expect(await page.evaluate(() => ({ attendue: _mePriseEnFin(), duree: meState.source && meState.source.duree > 0.5 }))).toEqual({ attendue: false, duree: true });
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
  // Une FICHE légère dans l'index (ni média, ni contenu) et UN enregistrement sous sa clé.
  const stock = await page.evaluate(async () => {
    const index = await idbBrouillonsIndex();
    const enr = await idbBrouillonLire(index[0].id);
    return {
      n: index.length, fiche: Object.keys(index[0]).sort().join(","), compte: index[0].compte === window.__compteBanc,
      blob: enr.blob instanceof Blob, type: enr.blob.type,
      base64: JSON.stringify(Object.assign({}, enr, { blob: null })).includes("base64"),
      local: Object.keys(localStorage).some((k) => /brouillon/i.test(k) && k !== "passio_vlog_draft_v1"),
    };
  });
  expect(stock).toEqual({ n: 1, fiche: "apercu,at,bgIdx,compte,id,mediaType,mode", compte: true, blob: true, type: "image/jpeg", base64: false, local: false });
  expect(await clesBrouillons(page)).toBe(1);

  // Rechargement complet : le brouillon est toujours là, et se reprend depuis l'écran BOBINE.
  await page.evaluate(() => meClose());
  // La fermeture rend son entrée d'historique par un retour DIFFÉRÉ : recharger pendant
  // ce retour interrompt le rechargement (rouge sous charge, jamais seul).
  await expect.poll(() => page.evaluate(() => !(history.state || {}).overlay)).toBe(true);
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
  expect(await clesBrouillons(page), "un seul média en stock, pas un par enregistrement").toBe(1);
  // Story gardée SUR L'APPAREIL seulement (pas de serveur) : elle ne survivra pas au
  // rechargement — le brouillon RESTE, sinon ce travail n'existerait plus nulle part.
  await page.locator("#meBrouillonsBtn").tap();
  await page.locator("#meBrouillonsPanel .me-brouillon-reprendre").tap();
  await page.waitForFunction(EDITION, null, { timeout: 15000 });
  await page.evaluate(() => { window.__toasts.length = 0; window._supaReal = false; meState._enteredEditAt = 0; mePublish(); });
  await expect.poll(() => page.evaluate(() => window.__toasts.join("|"))).toContain("enregistrée sur cet appareil");
  await page.waitForTimeout(400);
  expect(await page.evaluate(async () => (await meBrouillonsLire()).length), "story locale : le brouillon est gardé").toBe(1);
  const story = await page.evaluate(() => state.seed.stories[0]);
  expect(story.overlays.map((o) => o.type)).toEqual(["dessin", "text", "emoji", "filtre"]);
  // Publiée AU SERVEUR : le brouillon disparaît, son média aussi, le bouton aussi.
  await page.evaluate(() => meOpen("story"));
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await page.locator("#meBrouillonsBtn").tap();
  await page.locator("#meBrouillonsPanel .me-brouillon-reprendre").tap();
  await page.waitForFunction(EDITION, null, { timeout: 15000 });
  await page.evaluate(() => {
    window.__vrai = { verdict: _publierStoryAvecVerdict, reel: window._supaReal, compte: window._uidEstUnCompte };
    _publierStoryAvecVerdict = async () => true; window._supaReal = true; window._uidEstUnCompte = () => true;
    meState._enteredEditAt = 0; mePublish();
  });
  await expect.poll(() => page.evaluate(async () => (await meBrouillonsLire()).length)).toBe(0);
  await expect.poll(() => clesBrouillons(page), { message: "le média part avec sa fiche" }).toBe(0);
  await page.evaluate(() => { _publierStoryAvecVerdict = window.__vrai.verdict; window._supaReal = window.__vrai.reel; window._uidEstUnCompte = window.__vrai.compte; });
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

  // ÉCRITURE REFUSÉE (quota, stockage indisponible) : on le dit, l'édition reste intacte,
  // rien n'est annoncé enregistré, et les brouillons déjà là survivent.
  await page.evaluate((photo) => { meSetMedia(photo, "photo"); meAddOverlay({ type: "text", text: "À garder", color: "#fff", size: 30, x: 50, y: 50 }); window.__toasts.length = 0; window.__vraiModifier = idbBrouillonsModifier; idbBrouillonsModifier = async () => ({ ok: false, cause: "quota" }); }, PHOTO);
  await page.locator("#meBackBtn").tap();
  await page.locator('#feuilleConfirmation [data-conf="brouillon"]').tap();
  await expect.poll(() => page.evaluate(() => window.__toasts.join("|"))).toContain("Brouillon non enregistré — plus assez de place sur l'appareil");
  expect(await page.evaluate(() => ({ edition: document.getElementById("mediaEditor").classList.contains("phase-edit"), n: meState.overlays.length, faux: window.__toasts.some((t) => /^Brouillon enregistré/.test(t)), voile: !!document.getElementById("meProgressOv") }))).toEqual({ edition: true, n: 1, faux: false, voile: false });
  await page.evaluate(() => { idbBrouillonsModifier = window.__vraiModifier; });
  // Une erreur de PROGRAMME pendant l'enregistrement n'est pas « plus de place » : elle
  // rend l'écran (ni voile, ni drapeau resté levé) et se dit autrement.
  expect(await page.evaluate(async () => {
    window.__toasts.length = 0;
    idbBrouillonsModifier = () => { throw new ReferenceError("banc"); };
    const ecrit = await meEnregistrerBrouillon();
    idbBrouillonsModifier = window.__vraiModifier;
    return { ecrit, dit: window.__toasts.join("|"), voile: !!document.getElementById("meProgressOv"), drapeau: meCap.brouillonEnCours, retour: document.getElementById("mediaEditor").classList.contains("phase-edit") };
  })).toEqual({ ecrit: false, dit: "⚠️ Brouillon non enregistré — stockage de l'appareil indisponible", voile: false, drapeau: false, retour: true });
  // ABANDON RÉEL de la transaction (la vraie, pas un faux) : un enregistrement non
  // clonable lève APRÈS un retrait déjà posé — tout est défait, le stock est inchangé.
  const abandon = await page.evaluate(async () => {
    const avant = await idbBrouillonsIndex();
    const r = await idbBrouillonsModifier((index) => ({ index: [], retirer: index.map((f) => f.id), poser: [{ id: "br_non_clonable", f: function () {} }] }));
    const apres = await idbBrouillonsIndex();
    return { r, memes: JSON.stringify(apres.map((f) => f.id)) === JSON.stringify(avant.map((f) => f.id)), n: apres.length, reste: !!(await idbBrouillonLire(avant[0].id)), intrus: await idbBrouillonLire("br_non_clonable") };
  });
  expect(abandon).toEqual({ r: { ok: false, cause: "erreur" }, memes: true, n: 1, reste: true, intrus: null });
  expect(await clesBrouillons(page)).toBe(1);
  // LECTURE IMPOSSIBLE de l'index : rien à montrer — et ce « rien » ne sert de base à
  // aucune écriture (la suivante passe par sa transaction, les brouillons déjà là survivent).
  await page.evaluate(() => { window.__vraiIndex = idbBrouillonsIndex; idbBrouillonsIndex = async () => undefined; });
  expect(await page.evaluate(async () => (await meBrouillonsLire()).length)).toBe(0);
  await page.evaluate(() => { idbBrouillonsIndex = window.__vraiIndex; });
  expect(await page.evaluate(async () => (await meBrouillonsLire()).length), "le brouillon du mode Créer est toujours là").toBe(1);

  // SIX au plus PAR COMPTE : le septième pousse MON plus ancien dehors — on le dit, son
  // média part avec lui, et le brouillon d'un AUTRE compte n'est pas touché.
  await page.evaluate(async () => {
    const c = window.__compteBanc;
    window.__compteBanc = "a1b2c3d4-0000-4000-8000-0000000000b2";
    meState.brouillonId = null; meState.overlays[0].text = "Celui d'un autre";
    await meEnregistrerBrouillon();
    window.__compteBanc = c; meState.brouillonId = null; window.__toasts.length = 0;
  });
  const n = await page.evaluate(async () => {
    for (let i = 0; i < 7; i++) { meState.brouillonId = null; meState.overlays[0].text = "Brouillon " + i; await meEnregistrerBrouillon(); }
    const l = await meBrouillonsLire();
    const texte = async (f) => (await idbBrouillonLire(f.id)).overlays[0].text;
    return { n: l.length, premier: await texte(l[0]), dernier: await texte(l[l.length - 1]), index: (await idbBrouillonsIndex()).length, dit: window.__toasts.filter((t) => /le plus ancien a été retiré/.test(t)).length };
  });
  // 1 (mode Créer) + 7 = 8 écrits pour mon compte : deux évictions, dites deux fois.
  expect(n).toEqual({ n: 6, premier: "Brouillon 6", dernier: "Brouillon 1", index: 7, dit: 2 });
  expect(await clesBrouillons(page), "six à moi + un à l'autre compte, aucun média orphelin").toBe(7);
  // Supprimer depuis la liste : on DEMANDE (la croix est à côté de « Reprendre »).
  await page.evaluate(() => meBackToCapture());
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await expect(page.locator("#meBrouillonsPastille")).toHaveText("6");
  await page.locator("#meBrouillonsBtn").tap();
  await expect(page.locator("#meBrouillonsPanel .me-brouillon")).toHaveCount(6);
  await page.locator("#meBrouillonsPanel .me-brouillon-suppr").first().tap();
  const feuille = page.locator("#feuilleConfirmation");
  await expect(feuille.locator(".feuille-conf-titre")).toHaveText("Supprimer ce brouillon ?");
  await feuille.locator('[data-conf="annuler"]').tap();
  await expect(page.locator("#meBrouillonsPanel .me-brouillon"), "« Garder » ne supprime rien et laisse la liste ouverte").toHaveCount(6);
  await page.locator("#meBrouillonsPanel .me-brouillon-suppr").first().tap();
  await feuille.locator('[data-conf="supprimer"]').tap();
  await expect(page.locator("#meBrouillonsPanel .me-brouillon")).toHaveCount(5);
  await expect(page.locator("#meBrouillonsPastille")).toHaveText("5");
  await expect.poll(() => clesBrouillons(page)).toBe(6);

  // QUATORZE JOURS : un brouillon périmé n'est plus montré — et il quitte l'appareil
  // (fiche ET média), sans attendre un prochain enregistrement.
  await page.evaluate(async () => {
    const miens = await meBrouillonsLire();
    window.__vieux = miens[miens.length - 1].id;
    await idbBrouillonsModifier((index) => ({ index: index.map((f) => f.id === window.__vieux ? Object.assign({}, f, { at: Date.now() - 15 * 86400000 }) : f) }));
  });
  expect(await page.evaluate(async () => { const l = await meBrouillonsLire(); return { n: l.length, montre: l.some((f) => f.id === window.__vieux) }; })).toEqual({ n: 4, montre: false });
  await expect.poll(() => clesBrouillons(page), { message: "le média du brouillon périmé est retiré" }).toBe(5);
  expect(await page.evaluate(async () => (await idbBrouillonsIndex()).some((f) => f.id === window.__vieux))).toBe(false);

  // UN COMPTE : un autre compte sur le même appareil ne voit que les siens…
  const autre = await page.evaluate(async () => {
    const c = window.__compteBanc;
    window.__compteBanc = "a1b2c3d4-0000-4000-8000-0000000000b2";
    const vus = (await meBrouillonsLire()).length;
    window.__compteBanc = c;
    return { vus, miens: (await meBrouillonsLire()).length };
  });
  expect(autre).toEqual({ vus: 1, miens: 4 });
  // … PAS DE COMPTE, PAS DE BROUILLON : rien n'est proposé, rien n'est écrit, rien n'est montré.
  await page.evaluate(() => { const p = document.getElementById("meBrouillonsPanel"); if (p) p.remove(); });
  await page.evaluate((photo) => { window.__compteBanc = null; meSetMedia(photo, "photo"); window.__toasts.length = 0; }, PHOTO);
  await page.waitForFunction(EDITION, null, { timeout: 15000 });
  await page.locator("#meBackBtn").tap();
  await expect(feuille.locator(".feuille-conf-btn")).toHaveText(["Abandonner", "Continuer la modification"]);
  await feuille.locator('[data-conf="annuler"]').tap();
  expect(await page.evaluate(async () => ({ ecrit: await meEnregistrerBrouillon(), vus: (await meBrouillonsLire()).length, dit: window.__toasts.join("|") }))).toEqual({ ecrit: false, vus: 0, dit: "⚠️ Brouillon non enregistré — connecte-toi pour garder un brouillon" });
  expect(await clesBrouillons(page)).toBe(5);
  await page.evaluate(() => meBackToCapture());
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await expect(page.locator("#meBrouillonsBtn"), "sans compte, le bouton ne se montre pas").toBeHidden();
  await page.evaluate((c) => { window.__compteBanc = c; }, COMPTE);
  // … et la purge du compte (déconnexion, suppression) efface TOUT du stockage durable : fiches et médias.
  await page.evaluate(() => meClose());
  expect(await page.evaluate(async () => { await purgeAccountScopedData(); return (await idbBrouillonsIndex()).length; })).toBe(0);
  expect(await clesBrouillons(page)).toBe(0);
});

test("⑤ plusieurs prises, les bords : minuteur à chaque reprise, « Terminer » l'annule ; un enregistreur arrêté tout seul mène à l'aperçu", async ({ page }) => {
  test.setTimeout(120000);
  await ouvrir(page, "bobine");
  await page.locator("#mePrisesBtn").tap();
  await page.locator("#meMinuteurBtn").tap();   // 3 s
  expect(await page.evaluate(() => meCap.minuteur)).toBe(3);
  // Première prise : après le décompte.
  await page.locator("#meShutter").tap();
  await expect(page.locator("#mediaEditor")).toHaveClass(/me-compte-actif/);
  await expect.poll(() => etat(page), { timeout: 15000 }).toEqual({ rec: true, pause: false, prises: 1, enregistreur: "recording" });
  await page.waitForTimeout(800);
  await page.locator("#meShutter").tap();
  await expect.poll(() => etat(page)).toEqual({ rec: true, pause: true, prises: 1, enregistreur: "paused" });
  // En pause, minuteur armé : la consigne dit que le toucher lance un DÉCOMPTE.
  await expect(page.locator("#meCaptureHint")).toHaveText("Appuie · la suite démarre dans 3 s · « Terminer » pour l'aperçu");
  await page.locator("#meShutter").tap();
  await expect(page.locator("#mediaEditor")).toHaveClass(/me-compte-actif/);
  expect((await etat(page)).pause, "pendant le décompte, la prise n'a pas repris").toBe(true);
  await expect.poll(() => etat(page), { timeout: 15000 }).toEqual({ rec: true, pause: false, prises: 2, enregistreur: "recording" });
  await page.waitForTimeout(700);
  await page.locator("#meShutter").tap();
  await expect.poll(() => etat(page)).toEqual({ rec: true, pause: true, prises: 2, enregistreur: "paused" });
  // « Terminer » pendant un décompte : le décompte s'annule, l'aperçu arrive, rien ne repart derrière.
  await page.locator("#meShutter").tap();
  await expect(page.locator("#mediaEditor")).toHaveClass(/me-compte-actif/);
  await page.locator("#mePrisesTerminerBtn").tap();
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  expect(await page.evaluate(() => ({ compte: !!meCap.compteTimer, actif: document.getElementById("mediaEditor").classList.contains("me-compte-actif"), affiche: document.getElementById("meCompte").textContent, type: meState.mediaType }))).toEqual({ compte: false, actif: false, affiche: "", type: "video" });
  await page.waitForTimeout(3500);
  expect(await page.evaluate(() => ({ edition: document.getElementById("mediaEditor").classList.contains("phase-edit"), rec: meCam.recording }))).toEqual({ edition: true, rec: false });

  // L'ENREGISTREUR S'ARRÊTE TOUT SEUL pendant une pause (piste coupée par le système) :
  // l'écran ne reste pas « en pause » sur un enregistreur mort — le filmé part à l'aperçu.
  await page.evaluate(() => { meBackToCapture(); });
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await page.locator("#meMinuteurBtn").tap();   // 10 s
  await page.locator("#meMinuteurBtn").tap();   // éteint
  expect(await page.evaluate(() => meCap.minuteur)).toBe(0);
  await page.locator("#meShutter").tap();
  await expect.poll(() => etat(page)).toEqual({ rec: true, pause: false, prises: 1, enregistreur: "recording" });
  await page.waitForTimeout(1000);
  await page.locator("#meShutter").tap();
  await expect.poll(() => etat(page)).toEqual({ rec: true, pause: true, prises: 1, enregistreur: "paused" });
  await page.waitForTimeout(1500);                          // la pause dure : elle ne doit pas compter
  await page.evaluate(() => { meCam.recorder.stop(); });   // personne n'a appelé meStopRecording
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  await expect.poll(() => page.evaluate(() => !!(meState.source && meState.source.duree)), { timeout: 15000 }).toBe(true);
  const seul = await page.evaluate(() => ({ rec: meCam.recording, pause: !!meCam.enPause, type: meState.mediaType, duree: meState.source.duree, classes: /me-pause|me-prises|me-recording/.test(document.getElementById("mediaEditor").className) }));
  expect(seul.duree).toBeGreaterThan(0.7);
  expect(seul.duree, "la durée exclut la pause (1,5 s) : c'est le temps filmé, pas l'horloge").toBeLessThan(2);
  expect({ rec: seul.rec, pause: seul.pause, type: seul.type, classes: seul.classes }).toEqual({ rec: false, pause: false, type: "video", classes: false });
  // UNE PAUSE EST BORNÉE (c'est elle qui borne `meCam.recording`, que la mise à jour de
  // l'application attend) : passé le délai, les prises vont à leur aperçu — pas jetées.
  await page.evaluate(() => { meBackToCapture(); window.__toasts.length = 0; window.__pauseMax = ME_PAUSE_MAX_MS; ME_PAUSE_MAX_MS = 400; });
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => meCam.recording && !meCam.enPause)).toBe(true);
  await page.waitForTimeout(900);
  await page.locator("#meShutter").tap();
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  await expect.poll(() => page.evaluate(() => meState.mediaType), { timeout: 15000 }).toBe("video");
  expect(await page.evaluate(() => ({ rec: meCam.recording, dit: window.__toasts.some((t) => /Pause trop longue/.test(t)), borne: window.__pauseMax }))).toEqual({ rec: false, dit: true, borne: 180000 });
  await page.evaluate(() => { ME_PAUSE_MAX_MS = window.__pauseMax; });
  // … et la prise SUIVANTE n'est pas avalée (un drapeau « silencieux » resté levé la jetait sans rien dire).
  await page.evaluate(() => { meBackToCapture(); });
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => meCam.recording && !meCam.enPause)).toBe(true);
  await page.waitForTimeout(900);
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => !!meCam.enPause)).toBe(true);
  await page.locator("#mePrisesTerminerBtn").tap();
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  await expect.poll(() => page.evaluate(() => meState.mediaType), { timeout: 15000 }).toBe("video");
});

test("⑥ brouillon, les bords : écran tenu pendant l'écriture ; éditeur fermé ou compte changé en route ; supprimé seulement au SUCCÈS de la publication", async ({ page }) => {
  test.setTimeout(120000);
  await ouvrir(page, "story");
  const poser = (texte) => page.evaluate(({ photo, texte }) => { meSetMedia(photo, "photo"); meAddOverlay({ type: "text", text: texte, color: "#fff", size: 30, x: 50, y: 50 }); window.__toasts.length = 0; }, { photo: PHOTO, texte });
  // Une écriture LENTE (vidéo lourde) : la vraie transaction, retenue par le banc.
  await page.evaluate(() => {
    window.__vraiModifier = idbBrouillonsModifier;
    window.__lent = (ms) => { idbBrouillonsModifier = function (d) { return new Promise((res) => setTimeout(res, ms)).then(() => window.__vraiModifier(d)); }; };
    window.__rapide = () => { idbBrouillonsModifier = window.__vraiModifier; };
  });

  // ÉCRAN TENU : un voile, UN seul enregistrement (le second toucher ne dédouble rien), retour inerte.
  await poser("Un seul");
  await page.waitForFunction(EDITION, null, { timeout: 15000 });
  const tenu = await page.evaluate(async () => {
    __lent(600);
    const a = meEnregistrerBrouillon(), b = meEnregistrerBrouillon();
    const pendant = { voile: !!document.getElementById("meProgressOv"), pourcent: !!document.getElementById("meProgressPct"), retour: meRetourGarde(), edition: document.getElementById("mediaEditor").classList.contains("phase-edit"), feuille: !!document.getElementById("feuilleConfirmation") };
    const r = await Promise.all([a, b]);
    __rapide();
    return { pendant, r, apres: !!document.getElementById("meProgressOv"), n: (await meBrouillonsLire()).length };
  });
  expect(tenu).toEqual({ pendant: { voile: true, pourcent: false, retour: true, edition: true, feuille: false }, r: [true, false], apres: false, n: 1 });

  // ÉDITEUR FERMÉ pendant l'écriture : le brouillon est gardé, mais on ne rouvre pas la capture (caméra) derrière.
  await page.evaluate(() => { meState.brouillonId = null; __lent(600); });
  await page.locator("#meBackBtn").tap();
  await page.locator('#feuilleConfirmation [data-conf="brouillon"]').tap();
  await page.evaluate(() => meClose());
  await expect.poll(() => page.evaluate(async () => (await meBrouillonsLire()).length)).toBe(2);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => ({ ouvert: document.getElementById("mediaEditor").classList.contains("open"), camera: !!meCam.stream }))).toEqual({ ouvert: false, camera: false });

  // COMPTE CHANGÉ pendant l'écriture (déconnexion) : ce brouillon ne reste pas sur l'appareil.
  await page.evaluate(() => { __rapide(); meOpen("story"); });
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await poser("Orphelin");
  await page.waitForFunction(EDITION, null, { timeout: 15000 });
  const change = await page.evaluate(async () => {
    __lent(400);
    const p = meEnregistrerBrouillon();
    window.__compteBanc = "a1b2c3d4-0000-4000-8000-0000000000b2";
    const ecrit = await p;
    __rapide();
    return { ecrit, lie: !!meState.brouillonId, annonce: window.__toasts.some((t) => /^Brouillon enregistré/.test(t)) };
  });
  expect(change).toEqual({ ecrit: false, lie: false, annonce: false });
  // Le retrait suit l'écriture : ni chez l'autre compte, ni en stock.
  await expect.poll(() => clesBrouillons(page)).toBe(2);
  expect(await page.evaluate(async (c) => { const chezLAutre = (await meBrouillonsLire()).length; window.__compteBanc = c; return { chezLAutre, miens: (await meBrouillonsLire()).length }; }, COMPTE)).toEqual({ chezLAutre: 0, miens: 2 });

  // STORY : un envoi qui ÉCHOUE garde le brouillon ; il ne part qu'au succès.
  await page.evaluate(() => meBackToCapture());
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await page.locator("#meBrouillonsBtn").tap();
  await page.locator("#meBrouillonsPanel .me-brouillon-reprendre").first().tap();
  await page.waitForFunction(EDITION, null, { timeout: 15000 });
  await page.evaluate(() => { window.__vraiVerdictStory = _publierStoryAvecVerdict; _publierStoryAvecVerdict = async () => false; meState._enteredEditAt = 0; mePublish(); });
  await page.waitForTimeout(600);
  expect(await page.evaluate(async () => (await meBrouillonsLire()).length), "story refusée : le brouillon reste").toBe(2);
  await page.evaluate(() => { _publierStoryAvecVerdict = window.__vraiVerdictStory; });

  // BOBINE : l'identifiant du brouillon voyage SUR la publication. Premier essai en
  // échec → le brouillon reste ; le RENVOI qui aboutit (`_rejouerPublicationsEnAttente`)
  // le supprime. Un rappel passé au premier envoi ne voyait jamais ce second verdict.
  await page.evaluate(() => { meOpen("bobine"); });
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => meCam.recording)).toBe(true);
  await page.waitForTimeout(900);
  await page.locator("#meShutter").tap();
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  await expect.poll(() => page.evaluate(() => meState.mediaType === "video" && !!meState.media), { timeout: 15000 }).toBe(true);
  expect(await page.evaluate(() => meEnregistrerBrouillon())).toBe(true);
  // Un brouillon de bobine garde sa VIDÉO en Blob.
  expect(await page.evaluate(async () => { const e = await idbBrouillonLire(meState.brouillonId); return { n: (await meBrouillonsLire()).length, mode: e.mode, video: e.blob instanceof Blob && /^video\//.test(e.blob.type) && e.blob.size > 1000 }; })).toEqual({ n: 3, mode: "bobine", video: true });
  const envoi = await page.evaluate(async () => {
    const id = meState.brouillonId;
    // Le vrai verdict central (`_verdictPublication`), derrière un envoi que le banc décide.
    window.__essais = 0; window.__reussir = false;
    window.supaPublishPostWithRetry = async (post) => { window.__essais++; _verdictPublication(post, window.__reussir); return window.__reussir; };
    window.publicationRefuseeFautePassion = () => false;
    window.openReels = () => {};
    meState._enteredEditAt = 0;
    await mePublish();
    await new Promise((res) => setTimeout(res, 500));
    const post = state.userPosts[0];
    return { id, essais: window.__essais, bobine: post.isReel === true, porte: post._brouillonId === id, statut: post.syncStatus, reste: (await meBrouillonsLire()).some((f) => f.id === id) };
  });
  expect(envoi.essais).toBe(1);
  expect({ bobine: envoi.bobine, porte: envoi.porte, statut: envoi.statut, reste: envoi.reste }).toEqual({ bobine: true, porte: true, statut: "offline", reste: true });
  const renvoi = await page.evaluate(async (id) => {
    window.__reussir = true;
    clearTimeout(window._reelRetryTimer);
    // Le renvoi ne rejoue que MES publications, sous un compte réel.
    const vraiCompte = window._uidEstUnCompte, vraiReel = window._supaReal;
    window._supaReal = true; window._uidEstUnCompte = () => true;
    state.userPosts[0].authorId = MY_UID;
    const envoyees = await _rejouerPublicationsEnAttente();
    window._supaReal = vraiReel; window._uidEstUnCompte = vraiCompte;
    await new Promise((res) => setTimeout(res, 400));
    const post = state.userPosts[0];
    return { envoyees, essais: window.__essais, statut: post.syncStatus, porte: "_brouillonId" in post, reste: (await meBrouillonsLire()).some((f) => f.id === id), n: (await meBrouillonsLire()).length };
  }, envoi.id);
  expect(renvoi).toEqual({ envoyees: 1, essais: 2, statut: "synced", porte: false, reste: false, n: 2 });
  await expect.poll(() => clesBrouillons(page)).toBe(2);
});
