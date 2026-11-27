// ═══════════════════════════════════════════════════════════════════════════
// ÉCRAN DE CAPTURE FAÇON INSTAGRAM — STORY ET BOBINE (2026-11-27)
// Retour de Benjamin, capture d'Instagram à l'appui : « les fonctionnalités de
// story et de bobine ne sont pas ergonomiques — copie Instagram, veille à ce
// que chaque onglet et fonctionnalité fonctionne parfaitement ».
//
// Chaque test passe par les VRAIS gestes (toucher, maintien) sur une caméra
// simulée par Chromium, et vérifie le résultat — jamais la seule présence d'un
// bouton. Verrous :
//   ① disposition : déclencheur centré dans les deux modes, galerie à gauche,
//      caméra à droite, et chaque commande reçoit SON toucher sur 44 px ;
//   ② onglets : Story ⇄ Bobine sur place (même caméra), Publier ouvre le
//      Studio, Live lance le direct — l'éditeur fermé, caméra éteinte ;
//   ③ bobine : toucher = filmer, toucher = arrêter (plus besoin de maintenir),
//      et la durée choisie borne la prise ;
//   ④ story : toucher = photo ; maintien = vidéo ; mains libres = toucher/toucher ;
//   ⑤ boomerang : un toucher donne une vidéo en aller-retour ;
//   ⑥ minuteur : décompte puis prise ; un toucher pendant le décompte l'annule ;
//   ⑦ flash : sans torche, l'écran éclaire le temps de la photo ;
//   ⑧ effets : la rangée s'ouvre au bouton, le filtre choisi suit la prise ;
//   ⑨ édition : chaque outil reçoit son toucher, Emoji et GIF sont dans le
//      tiroir Stickers, les outils s'effacent pendant un déplacement ;
//   ⑩ abandon : le bouton ‹ et le retour système DEMANDENT avant de tout jeter ;
//   ⑫ relecture indépendante : caméra tardive coupée, prise arrêtée sur son aperçu
//      (retour, veille), feuille de finition refermée seule, consigne du minuteur.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Drapeaux de caméra simulée : au niveau du FICHIER (cf. ui-v7-bobine-camera).
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

async function ouvrir(page, mode) {
  await bootOnboarded(page);
  await page.evaluate((m) => {
    window.requireAuthentication = () => true;
    window.__toasts = [];
    const t = window.toast;
    window.toast = function (msg) { window.__toasts.push(String(msg)); return t.apply(this, arguments); };
    meOpen(m);
  }, mode);
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
}
// L'élément reçoit-il son toucher en son centre, et sur quelle surface ?
function sousLeDoigt(page, sel) {
  return page.locator(sel).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { atteint: !!t && (t === el || el.contains(t)), w: Math.round(r.width), h: Math.round(r.height), cx: r.left + r.width / 2 };
  });
}
async function retourCapture(page) {
  await page.evaluate(() => meBackToCapture());
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
}

test("① disposition : déclencheur centré, chaque commande reçoit son toucher (story et bobine)", async ({ page }) => {
  await ouvrir(page, "story");
  for (const mode of ["story", "bobine"]) {
    if (mode === "bobine") await page.locator('#meModes [data-mode="bobine"]').tap();
    const sh = await sousLeDoigt(page, "#meShutter");
    expect(sh.atteint, mode + " : le déclencheur reçoit le toucher").toBe(true);
    expect(Math.abs(sh.cx - 195), mode + " : déclencheur centré").toBeLessThanOrEqual(1);
    const commandes = mode === "story"
      ? ["#meBackBtn", "#meFlashBtn", "#meGalleryThumb", "#meFlipBtn", "#meBgBtn", "#meBoomBtn", "#meEffetsBtn", "#meMainsBtn", "#meMinuteurBtn", "#meRailPlier"]
      : ["#meBackBtn", "#meFlashBtn", "#meGalleryThumb", "#meFlipBtn", "#meDureeBtn", "#meEffetsBtn", "#meMinuteurBtn", "#meRailPlier"];
    for (const sel of commandes) {
      const m = await sousLeDoigt(page, sel);
      expect(m.atteint, mode + " : " + sel + " reçoit le toucher").toBe(true);
      expect(Math.min(m.w, m.h), mode + " : " + sel + " mesure au moins 44 px").toBeGreaterThanOrEqual(44);
    }
    // Les outils de l'autre mode ne sont pas là.
    const absents = mode === "story" ? ["#meDureeBtn"] : ["#meBgBtn", "#meBoomBtn", "#meMainsBtn"];
    for (const sel of absents) await expect(page.locator(sel), mode + " : " + sel).toBeHidden();
  }
  // Galerie à gauche du déclencheur, caméra à droite.
  const g = await sousLeDoigt(page, "#meGalleryThumb"), f = await sousLeDoigt(page, "#meFlipBtn");
  expect(g.cx).toBeLessThan(195); expect(f.cx).toBeGreaterThan(195);
  // Replier la colonne masque les noms, la commande reste ; le choix est gardé.
  await page.locator("#meRailPlier").tap();
  await expect(page.locator("#meEffetsBtn .me-rail-lib")).toBeHidden();
  await expect(page.locator("#meRailPlier")).toHaveAttribute("aria-expanded", "false");
  expect((await sousLeDoigt(page, "#meEffetsBtn")).atteint).toBe(true);
  await page.locator("#meRailPlier").tap();
  await expect(page.locator("#meEffetsBtn .me-rail-lib")).toBeVisible();
});

test("② onglets : Story ⇄ Bobine sur place, Publier ouvre le Studio, Live lance le direct", async ({ page }) => {
  await ouvrir(page, "story");
  await expect(page.locator("#meModes .me-mode")).toHaveText(["Publier", "Story", "Bobine", "Live"]);
  for (const m of ["post", "story", "bobine", "live"]) {
    // Un onglet hors du champ se ramène en faisant défiler la bande : Playwright le fait au toucher.
    await page.locator('#meModes [data-mode="' + m + '"]').scrollIntoViewIfNeeded();
    expect((await sousLeDoigt(page, '#meModes [data-mode="' + m + '"]')).atteint, "onglet " + m).toBe(true);
  }
  const flux = () => page.evaluate(() => meCam.stream && meCam.stream.id);
  const avant = await flux();
  await page.locator('#meModes [data-mode="bobine"]').tap();
  await expect(page.locator('#meModes [data-mode="bobine"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('#meModes [data-mode="story"]')).toHaveAttribute("aria-selected", "false");
  let r = await page.evaluate(() => ({ mode: meState.mode, titre: document.getElementById("meTitle").textContent, accept: document.getElementById("meMediaInput").accept, consigne: document.getElementById("meCaptureHint").textContent }));
  expect(r).toEqual({ mode: "bobine", titre: "Bobine", accept: "video/*", consigne: "Appuie pour filmer · appuie encore pour arrêter" });
  expect(await flux(), "la caméra n'est pas rallumée").toBe(avant);
  // L'onglet actif est ramené au centre de la bande.
  await expect.poll(() => page.evaluate(() => { const b = document.getElementById("meModes").getBoundingClientRect(), a = document.querySelector("#meModes .me-mode.actif").getBoundingClientRect(); return Math.abs((a.left + a.width / 2) - (b.left + b.width / 2)); })).toBeLessThanOrEqual(3);
  await page.locator('#meModes [data-mode="story"]').tap();
  r = await page.evaluate(() => ({ mode: meState.mode, titre: document.getElementById("meTitle").textContent, accept: document.getElementById("meMediaInput").accept }));
  expect(r).toEqual({ mode: "story", titre: "Story", accept: "image/*,video/*" });
  expect(await flux()).toBe(avant);
  // Glisser sur la scène change aussi de mode (gauche → Bobine, droite → Story).
  const glisser = async (dx) => {
    await page.evaluate((d) => {
      const c = document.getElementById("meCanvas");
      const ev = (type, x) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 300, pointerId: 7, isPrimary: true, pointerType: "touch" }));
      ev("pointerdown", 200); ev("pointerup", 200 + d);
    }, dx);
  };
  await glisser(-140);
  expect(await page.evaluate(() => meState.mode)).toBe("bobine");
  await glisser(140);
  expect(await page.evaluate(() => meState.mode)).toBe("story");

  // « Publier » : l'éditeur se ferme (caméra éteinte) et le Studio s'ouvre.
  await page.locator('#meModes [data-mode="post"]').tap();
  await page.waitForFunction(() => document.getElementById("screen-studio").classList.contains("active"), null, { timeout: 8000 });
  r = await page.evaluate(() => ({ ouvert: document.getElementById("mediaEditor").classList.contains("open"), camera: !!meCam.stream }));
  expect(r).toEqual({ ouvert: false, camera: false });

  // « Live » : l'éditeur se ferme et le moteur du direct est appelé (une fois).
  await page.evaluate(() => { goTo("feed"); window.__lives = 0; window.startVideoLive = async () => { window.__lives++; }; meOpen("bobine"); });
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await page.locator('#meModes [data-mode="live"]').tap();
  await expect.poll(() => page.evaluate(() => window.__lives)).toBe(1);
  r = await page.evaluate(() => ({ ouvert: document.getElementById("mediaEditor").classList.contains("open"), camera: !!meCam.stream, lives: window.__lives }));
  expect(r).toEqual({ ouvert: false, camera: false, lives: 1 });
  // Le geste retour, après « Publier » ou « Live », n'est pas avalé par une entrée
  // d'historique orpheline de l'éditeur : il ne le rouvre pas et ne laisse rien derrière.
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (history.state || {}).overlay || null), "aucune entrée d'éditeur au sommet").not.toBe("media");
});

test("③ bobine : toucher = filmer, toucher = arrêter ; la durée choisie borne la prise", async ({ page }) => {
  await ouvrir(page, "bobine");
  // Durée : 60 → 15 → 30 → 60, dite par le bouton et appliquée à la prise.
  await expect(page.locator("#meDureeBtn")).toHaveAttribute("aria-label", /60 secondes/);
  await page.locator("#meDureeBtn").tap();
  await expect(page.locator("#meDureeBtn")).toHaveAttribute("aria-label", /15 secondes/);
  await expect(page.locator("#meDureeIco")).toHaveText("15");
  expect(await page.evaluate(() => _meDureeMaxMs())).toBe(15000);
  await page.locator("#meDureeBtn").tap();
  expect(await page.evaluate(() => _meDureeMaxMs())).toBe(30000);

  // Un toucher BREF lance la prise, doigt levé elle continue.
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => meCam.recording)).toBe(true);
  await expect(page.locator("#mediaEditor")).toHaveClass(/me-verrouille/);
  await expect(page.locator("#meCaptureHint")).toHaveText("Appuie pour arrêter");
  await expect(page.locator("#meRecBadge")).toBeVisible();
  // Pendant la prise : ni onglets ni colonne d'outils (rien à toucher par mégarde).
  await expect(page.locator("#meRail")).toBeHidden();
  await expect(page.locator("#meModes")).toBeHidden();
  await page.evaluate(() => meChoisirMode("story"));
  expect(await page.evaluate(() => meState.mode), "pas de changement de mode en plein tournage").toBe("bobine");
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => meCam.recording), "toujours en cours, doigt levé").toBe(true);
  // Second toucher : arrêt, aperçu, deux issues.
  await page.locator("#meShutter").tap();
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  await expect(page.locator("#meMedia video")).toHaveCount(1);
  expect(await page.evaluate(() => meState.mediaType)).toBe("video");
  await expect(page.locator('[data-v7-bobine-act="recommencer"]')).toBeVisible();
  await expect(page.locator('[data-v7-bobine-act="continuer"]')).toBeVisible();

  // « Recommencer » rend la capture ; deux touchers coup sur coup ne publient rien.
  await page.locator('[data-v7-bobine-act="recommencer"]').tap();
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await page.evaluate(() => { meStartRecording(); meStopRecording(); });
  await expect.poll(() => page.evaluate(() => window.__toasts.join("|"))).toContain("Vidéo trop courte");
  expect(await page.evaluate(EDITION)).toBe(false);
});

test("④ story : toucher = photo ; maintien = vidéo ; mains libres = toucher / toucher", async ({ page }) => {
  await ouvrir(page, "story");
  await page.locator("#meShutter").tap();
  await page.waitForFunction(EDITION, null, { timeout: 15000 });
  expect(await page.evaluate(() => meState.mediaType)).toBe("photo");
  await expect(page.locator("#meMedia img")).toHaveCount(1);

  // Maintien : vidéo, arrêtée au relâché.
  await retourCapture(page);
  const b = await page.locator("#meShutter").boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => meCam.recording)).toBe(true);
  await page.waitForTimeout(1300);
  await page.mouse.up();
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  expect(await page.evaluate(() => meState.mediaType)).toBe("video");

  // Mains libres : un toucher lance, un toucher arrête — et c'est une VIDÉO.
  await retourCapture(page);
  await page.locator("#meMainsBtn").tap();
  await expect(page.locator("#meMainsBtn")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#meCaptureHint")).toHaveText("Appuie pour filmer · appuie encore pour arrêter");
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => meCam.recording)).toBe(true);
  await page.waitForTimeout(1300);
  expect(await page.evaluate(() => meCam.recording)).toBe(true);
  await page.locator("#meShutter").tap();
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  expect(await page.evaluate(() => meState.mediaType)).toBe("video");
  // Passer à la bobine éteint les outils propres à la story.
  await retourCapture(page);
  await page.locator('#meModes [data-mode="bobine"]').tap();
  expect(await page.evaluate(() => ({ m: meCap.mainsLibres, b: meCap.boomerang }))).toEqual({ m: false, b: false });
});

test("⑤ boomerang : un toucher donne une courte vidéo en aller-retour", async ({ page }) => {
  await ouvrir(page, "story");
  await page.locator("#meBoomBtn").tap();
  await expect(page.locator("#meBoomBtn")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#meCaptureHint")).toHaveText("Appuie pour un boomerang");
  // Boomerang et mains libres s'excluent : un seul sens pour le toucher.
  await page.locator("#meMainsBtn").tap();
  await expect(page.locator("#meBoomBtn")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#meBoomBtn").tap();
  await expect(page.locator("#meMainsBtn")).toHaveAttribute("aria-pressed", "false");

  await page.locator("#meShutter").tap();
  await expect(page.locator("#mediaEditor")).toHaveClass(/me-boom-capture/);
  await expect(page.locator("#meCaptureHint")).toHaveText("Création du boomerang…");
  await page.waitForFunction(EDITION, null, { timeout: 40000 });
  const r = await page.evaluate(() => new Promise((res) => {
    const v = document.querySelector("#meMedia video");
    const fin = () => res({ type: meState.mediaType, video: /^data:video\//.test(meState.media || ""), duree: v ? v.duration : 0, boucle: !!(v && v.loop), enCours: meCap.boomEnCours });
    if (v && v.readyState >= 1) fin(); else if (v) { v.addEventListener("loadedmetadata", fin, { once: true }); setTimeout(fin, 5000); } else fin();
  }));
  expect(r.type).toBe("video");
  expect(r.video, "le média est une vraie vidéo").toBe(true);
  expect(r.boucle).toBe(true);
  expect(r.enCours).toBe(false);
  // 3 allers-retours de 30 images à 22 i/s ≈ 4 s : une vidéo, pas une image figée.
  if (Number.isFinite(r.duree)) expect(r.duree).toBeGreaterThan(1.5);
  await expect(page.locator("#mediaEditor")).not.toHaveClass(/me-boom-capture/);
});

test("⑥ minuteur : décompte puis prise ; un toucher pendant le décompte l'annule", async ({ page }) => {
  await ouvrir(page, "story");
  await page.locator("#meMinuteurBtn").tap();
  await expect(page.locator("#meMinuteurBtn")).toHaveAttribute("aria-label", "Minuteur : 3 secondes");
  await expect(page.locator("#meMinuteurPastille")).toHaveText("3 s");
  // Toucher : le décompte s'affiche, rien n'est pris tout de suite.
  await page.locator("#meShutter").tap();
  await expect(page.locator("#meCompte")).toBeVisible();
  await expect(page.locator("#meCompte")).toHaveText(/^[123]$/);
  expect(await page.evaluate(EDITION)).toBe(false);
  await expect(page.locator("#meCaptureHint")).toHaveText("Touche le bouton pour annuler");
  // Un toucher pendant le décompte l'annule.
  await page.locator("#meShutter").tap();
  await expect(page.locator("#meCompte")).toBeHidden();
  await page.waitForTimeout(3400);
  expect(await page.evaluate(EDITION), "annulé : aucune prise").toBe(false);
  // Nouveau décompte, mené au bout : la photo est prise.
  await page.locator("#meShutter").tap();
  await expect(page.locator("#meCompte")).toHaveText(/^[123]$/);
  await page.waitForFunction(EDITION, null, { timeout: 8000 });
  expect(await page.evaluate(() => meState.mediaType)).toBe("photo");
  // 3 → 10 → désactivé.
  await retourCapture(page);
  await page.locator("#meMinuteurBtn").tap();
  await expect(page.locator("#meMinuteurBtn")).toHaveAttribute("aria-label", "Minuteur : 10 secondes");
  await page.locator("#meMinuteurBtn").tap();
  await expect(page.locator("#meMinuteurBtn")).toHaveAttribute("aria-label", "Minuteur désactivé");
  await expect(page.locator("#meMinuteurPastille")).toBeHidden();
  // Fermer l'éditeur pendant un décompte ne déclenche rien après coup.
  await page.locator("#meMinuteurBtn").tap();
  await page.locator("#meShutter").tap();
  await expect(page.locator("#meCompte")).toHaveText(/^[123]$/);
  await page.evaluate(() => meClose());
  await page.waitForTimeout(3400);
  expect(await page.evaluate(() => ({ ouvert: document.getElementById("mediaEditor").classList.contains("open"), timer: meCap.compteTimer, media: meState.media }))).toEqual({ ouvert: false, timer: null, media: null });
});

test("⑦ flash : sans torche, l'écran éclaire le temps de la photo", async ({ page }) => {
  await ouvrir(page, "story");
  const flash = page.locator("#meFlashBtn");
  await expect(flash).toHaveAttribute("aria-pressed", "false");
  await expect(flash).toHaveAttribute("aria-label", "Flash désactivé");
  await flash.tap();
  await expect(flash).toHaveAttribute("aria-pressed", "true");
  await expect(flash).toHaveAttribute("aria-label", "Flash activé");
  // La caméra simulée n'a pas de torche : c'est le flash d'écran qui s'allume.
  await page.evaluate(() => {
    window.__flashVu = false;
    new MutationObserver(() => { if (document.getElementById("mediaEditor").classList.contains("me-flash-plein")) window.__flashVu = true; })
      .observe(document.getElementById("mediaEditor"), { attributes: true, attributeFilter: ["class"] });
  });
  await page.locator("#meShutter").tap();
  await page.waitForFunction(EDITION, null, { timeout: 15000 });
  const r = await page.evaluate(() => ({ vu: window.__flashVu, type: meState.mediaType, reste: document.getElementById("mediaEditor").classList.contains("me-flash-plein") }));
  expect(r).toEqual({ vu: true, type: "photo", reste: false });
  // Une nouvelle ouverture repart flash éteint.
  await page.evaluate(() => { meClose(); meOpen("story"); });
  await expect(flash).toHaveAttribute("aria-pressed", "false");
});

test("⑧ effets : la rangée s'ouvre au bouton, le filtre choisi suit la prise", async ({ page }) => {
  await ouvrir(page, "story");
  await expect(page.locator("#meFiltres"), "repliée par défaut").toBeHidden();
  await page.locator("#meEffetsBtn").tap();
  await expect(page.locator("#meFiltres")).toBeVisible();
  await expect(page.locator("#meEffetsBtn")).toHaveAttribute("aria-pressed", "true");
  await page.locator('#meFiltres [data-filtre="nb"]').tap();
  expect(await page.evaluate(() => document.getElementById("meCamVideo").classList.contains("filtre-nb"))).toBe(true);
  // La rangée ne recouvre ni le déclencheur ni les onglets.
  expect((await sousLeDoigt(page, "#meShutter")).atteint).toBe(true);
  expect((await sousLeDoigt(page, '#meModes [data-mode="story"]')).atteint).toBe(true);
  await page.locator("#meShutter").tap();
  await page.waitForFunction(EDITION, null, { timeout: 15000 });
  const r = await page.evaluate(() => ({ filtre: meState.filtre, media: document.getElementById("meMedia").classList.contains("filtre-nb") }));
  expect(r).toEqual({ filtre: "nb", media: true });
  // En édition la rangée est repliée ; le bouton « Effets » de la colonne la rouvre.
  await expect(page.locator("#meFiltres")).toBeHidden();
  await page.locator('.me-tool[aria-label="Filtres"]').tap();
  await expect(page.locator("#meFiltres")).toBeVisible();
  // Refermer puis rouvrir en capture : le bouton suit l'état.
  await retourCapture(page);
  await expect(page.locator("#meFiltres")).toBeHidden();
  await expect(page.locator("#meEffetsBtn")).toHaveAttribute("aria-pressed", "false");
});

test("⑨ édition : chaque outil reçoit son toucher ; Emoji et GIF sont dans le tiroir Stickers", async ({ page }) => {
  await ouvrir(page, "story");
  await page.locator("#meShutter").tap();
  await page.waitForFunction(EDITION, null, { timeout: 15000 });
  await page.evaluate(() => { meState._enteredEditAt = 0; });
  const outils = ["Ajouter un texte", "Ajouter un sticker", "Filtres", "Dessiner", "Changer de média"];
  for (const nom of outils) {
    const m = await sousLeDoigt(page, '.me-tool[aria-label="' + nom + '"]');
    expect(m.atteint, nom + " reçoit le toucher").toBe(true);
    expect(Math.min(m.w, m.h), nom + " mesure au moins 44 px").toBeGreaterThanOrEqual(44);
  }
  for (const sel of ["#meBackBtn", "#mePublishBtn"]) expect((await sousLeDoigt(page, sel)).atteint, sel).toBe(true);
  // Une photo ne se coupe pas : l'outil ✂️ n'est pas là.
  await expect(page.locator("#meMontageBtn")).toBeHidden();
  // Les noms des outils sont montrés à l'arrivée.
  await expect(page.locator('.me-tool[aria-label="Dessiner"] .me-tool-lib')).toBeVisible();
  // Le bouton du haut dit « revenir », plus « fermer ».
  await expect(page.locator("#meBackBtn")).toHaveAttribute("aria-label", "Revenir à l'appareil photo");

  // Tiroir Stickers : Emoji et GIF en tête, puis les stickers.
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').tap();
  const tuiles = await page.locator("#meStickerPanel .me-sticker-choix").evaluateAll((els) => els.map((e) => e.getAttribute("data-sticker")));
  expect(tuiles.slice(0, 5)).toEqual(["Emoji", "GIF", "Activité", "Mention", "Compte à rebours"]);
  expect(tuiles).toContain("Musique");
  await page.locator('#meStickerPanel [data-sticker="Emoji"]').tap();
  await expect(page.locator("#meEmojiBar")).toBeVisible();
  await page.locator("#meEmojiBar .me-panneau-emoji").first().tap();
  await expect(page.locator("#meOverlays .me-overlay.emoji")).toHaveCount(1);
  await expect(page.locator("#meEmojiBar")).toHaveCount(0);
  // Texte : la colonne ouvre l'écriture en place.
  await page.locator('.me-tool[aria-label="Ajouter un texte"]').tap();
  await expect(page.locator("#meTexteEditeur")).toBeVisible();
  await page.locator("#meTeChamp").fill("Bonjour");
  await page.locator("#meTeOk").tap();
  await expect(page.locator("#meOverlays .me-overlay.text")).toHaveCount(1);
  // Dessin : la barre s'ouvre, « OK » la referme.
  await page.locator('.me-tool[aria-label="Dessiner"]').tap();
  await expect(page.locator("#meDessinBarre")).toBeVisible();
  await page.locator("#meDessinOk").tap();
  await expect(page.locator("#meDessinBarre")).toBeHidden();

  // Pendant un déplacement, les outils s'effacent ; ils reviennent au relâché.
  const emoji = page.locator("#meOverlays .me-overlay.emoji");
  const eb = await emoji.boundingBox();
  await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
  await page.mouse.down();
  await page.mouse.move(eb.x + eb.width / 2 + 60, eb.y + eb.height / 2 + 80, { steps: 4 });
  await expect(page.locator("#mediaEditor")).toHaveClass(/me-glisse/);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".me-toolbar")).pointerEvents)).toBe("none");
  await page.mouse.up();
  await expect(page.locator("#mediaEditor")).not.toHaveClass(/me-glisse/);
  expect((await sousLeDoigt(page, "#mePublishBtn")).atteint).toBe(true);

  // Bobine : mêmes outils, sauf les stickers réservés à la story.
  await retourCapture(page);
  await page.evaluate(() => { meChoisirMode("bobine"); meSetMedia("data:video/webm;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAA", "video"); meState._enteredEditAt = 0; });
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').tap();
  const bob = await page.locator("#meStickerPanel .me-sticker-choix").evaluateAll((els) => els.map((e) => e.getAttribute("data-sticker")));
  // Le Sondage est proposé en bobine depuis le 2026-11-27 (sa table de votes existe) ; la Musique, non.
  expect(bob, "pas de Musique en bobine").toEqual(["Emoji", "GIF", "Activité", "Mention", "Compte à rebours", "Question", "Sondage"]);
  // ✂️ « Couper » n'est proposé que sur une vidéo, et reçoit son toucher dans la colonne.
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').tap();
  await expect(page.locator("#meStickerPanel")).toHaveCount(0);
  await expect(page.locator("#meMontageBtn")).toBeVisible();
  const couper = await sousLeDoigt(page, "#meMontageBtn");
  expect(couper.atteint).toBe(true);
  expect(Math.min(couper.w, couper.h)).toBeGreaterThanOrEqual(44);
});

test("⑩ abandon : ‹ et le retour système demandent avant de jeter ce qui est préparé", async ({ page }) => {
  await ouvrir(page, "story");
  await page.locator("#meShutter").tap();
  await page.waitForFunction(EDITION, null, { timeout: 15000 });
  // ‹ : question, « Continuer » garde tout.
  await page.locator("#meBackBtn").tap();
  const feuille = page.locator("#feuilleConfirmation");
  await expect(feuille).toBeVisible();
  await expect(feuille.locator(".feuille-conf-titre")).toHaveText("Abandonner cette story ?");
  await feuille.locator('[data-conf="annuler"]').tap();
  await expect(feuille).toHaveCount(0);
  expect(await page.evaluate(() => ({ edition: document.getElementById("mediaEditor").classList.contains("phase-edit"), type: meState.mediaType }))).toEqual({ edition: true, type: "photo" });

  // Retour SYSTÈME : même question, l'éditeur reste ouvert.
  await page.goBack();
  await expect(feuille).toBeVisible();
  expect(await page.evaluate(() => document.getElementById("mediaEditor").classList.contains("open"))).toBe(true);
  // Un second retour vaut « Continuer ».
  await page.goBack();
  await expect(feuille).toHaveCount(0);
  expect(await page.evaluate(() => ({ ouvert: document.getElementById("mediaEditor").classList.contains("open"), type: meState.mediaType }))).toEqual({ ouvert: true, type: "photo" });
  // Tiroir ouvert : le retour le referme, lui seul.
  await page.evaluate(() => { meState._enteredEditAt = 0; });
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').tap();
  await expect(page.locator("#meStickerPanel")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#meStickerPanel")).toHaveCount(0);
  await expect(feuille).toHaveCount(0);
  expect(await page.evaluate(() => document.getElementById("mediaEditor").classList.contains("phase-edit"))).toBe(true);

  // « Abandonner » : retour à l'appareil photo, plus rien de préparé.
  await page.locator("#meBackBtn").tap();
  await feuille.locator('[data-conf="abandonner"]').tap();
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  expect(await page.evaluate(() => ({ media: meState.media, n: meState.overlays.length }))).toEqual({ media: null, n: 0 });
  await expect(page.locator("#meBackBtn")).toHaveAttribute("aria-label", "Fermer");
  // En capture (rien de préparé), le retour système ferme l'éditeur, caméra éteinte.
  await page.goBack();
  await expect.poll(() => page.evaluate(() => ({ ouvert: document.getElementById("mediaEditor").classList.contains("open"), camera: !!meCam.stream }))).toEqual({ ouvert: false, camera: false });
});

test("⑪ sans caméra : « Créer » et la galerie restent, les outils de caméra s'effacent", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.requireAuthentication = () => true;
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("banc"));
    meOpen("story");
  });
  await expect(page.locator("#mediaEditor")).toHaveClass(/me-no-cam/);
  await expect(page.locator("#meBgBtn")).toBeVisible();
  for (const sel of ["#meBoomBtn", "#meEffetsBtn", "#meMainsBtn", "#meMinuteurBtn", "#meFlashBtn"]) await expect(page.locator(sel), sel).toBeHidden();
  await expect(page.locator("#meCaptureHint")).toHaveText("Appuie pour choisir une photo ou une vidéo");
  // Les onglets fonctionnent aussi sans caméra.
  await page.locator('#meModes [data-mode="bobine"]').tap();
  await expect(page.locator("#meCaptureHint")).toHaveText("Appuie pour choisir une vidéo");
  await expect(page.locator("#meBgBtn")).toBeHidden();
  // Le déclencheur ouvre alors la galerie.
  const [choix] = await Promise.all([page.waitForEvent("filechooser", { timeout: 8000 }), page.locator("#meShutter").tap()]);
  expect(choix.isMultiple()).toBe(false);
});

test("⑫ relecture : rien ne survit à une sortie — caméra tardive, prise en cours, veille, feuille de finition", async ({ page }) => {
  // (a) Le flux caméra arrive APRÈS la fermeture : il est coupé, jamais gardé allumé.
  await bootOnboarded(page);
  const tardif = await page.evaluate(async () => {
    window.requireAuthentication = () => true;
    window.__toasts = [];
    const t = window.toast;
    window.toast = function (msg) { window.__toasts.push(String(msg)); return t.apply(this, arguments); };
    const vrai = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let flux = null, rendu;
    // On attend la réponse RÉELLE de la caméra (pas une durée) : elle arrive 500 ms
    // après la demande, donc après la fermeture — puis on laisse `meStartCamera` conclure.
    const reponse = new Promise((r) => { rendu = r; });
    navigator.mediaDevices.getUserMedia = (c) => new Promise((res, rej) => setTimeout(() => vrai(c).then((s) => { flux = s; res(s); setTimeout(rendu, 100); }, (e) => { rej(e); rendu(); }), 500));
    meOpen("story");
    meClose();   // fermé pendant l'ouverture de la caméra
    await reponse;
    navigator.mediaDevices.getUserMedia = vrai;
    return { obtenu: !!flux, pistes: flux ? flux.getTracks().map((p) => p.readyState) : [], garde: !!meCam.stream, ouvert: document.getElementById("mediaEditor").classList.contains("open") };
  });
  expect(tardif.obtenu, "prémisse : la caméra a bien répondu, en retard").toBe(true);
  expect(tardif.pistes.every((e) => e === "ended"), "toutes les pistes sont arrêtées").toBe(true);
  expect(tardif.garde).toBe(false);
  expect(tardif.ouvert).toBe(false);

  // (b) Geste RETOUR pendant une prise lancée d'un toucher : elle s'arrête sur son aperçu.
  await page.evaluate(() => meOpen("bobine"));
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => meCam.recording)).toBe(true);
  await page.waitForTimeout(900);
  await page.goBack();
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  expect(await page.evaluate(() => ({ ouvert: document.getElementById("mediaEditor").classList.contains("open"), type: meState.mediaType, enCours: meCam.recording }))).toEqual({ ouvert: true, type: "video", enCours: false });

  // (c) Feuille de finition ouverte : le retour la referme, elle seule — ni question, ni feuille orpheline.
  await page.evaluate(() => { meState._enteredEditAt = 0; });
  await page.locator('[data-v7-bobine-act="continuer"]').tap();
  await expect(page.locator("#v7BobineSheet")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#v7BobineSheet")).toBeHidden();
  await expect(page.locator("#feuilleConfirmation")).toHaveCount(0);
  expect(await page.evaluate(EDITION)).toBe(true);
  // « Abandonner » depuis la feuille rouverte : la capture revient SANS la feuille dessus.
  await page.locator('[data-v7-bobine-act="continuer"]').tap();
  await expect(page.locator("#v7BobineSheet")).toBeVisible();
  await page.evaluate(() => meBackToCapture());
  await expect(page.locator("#v7BobineSheet")).toBeHidden();
  await page.waitForFunction(CAPTURE, null, { timeout: 20000 });

  // (d) L'application passe en arrière-plan pendant une prise verrouillée : elle s'arrête sur son aperçu.
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => meCam.recording)).toBe(true);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;
  });
  await page.waitForFunction(EDITION, null, { timeout: 20000 });
  expect(await page.evaluate(() => ({ type: meState.mediaType, enCours: meCam.recording }))).toEqual({ type: "video", enCours: false });

  // (e) Décompte en cours : le retour l'annule et l'éditeur reste ; rangée d'effets masquée pendant une prise.
  await retourCapture(page);
  await page.locator("#meMinuteurBtn").tap();
  await expect(page.locator("#meCaptureHint"), "minuteur armé : la consigne ne promet plus le maintien").toHaveText("Appuie · la vidéo démarre dans 3 s");
  await page.locator("#meShutter").tap();
  await expect(page.locator("#meCompte")).toHaveText(/^[123]$/);
  await page.goBack();
  await expect(page.locator("#meCompte")).toBeHidden();
  expect(await page.evaluate(() => ({ ouvert: document.getElementById("mediaEditor").classList.contains("open"), timer: meCap.compteTimer }))).toEqual({ ouvert: true, timer: null });
  await page.locator("#meMinuteurBtn").tap(); await page.locator("#meMinuteurBtn").tap();   // 10 s puis désactivé
  await page.locator("#meEffetsBtn").tap();
  await expect(page.locator("#meFiltres")).toBeVisible();
  await page.locator("#meShutter").tap();
  await expect.poll(() => page.evaluate(() => meCam.recording)).toBe(true);
  await expect(page.locator("#meFiltres"), "pas de rangée d'effets pendant la prise").toBeHidden();
  await page.waitForTimeout(900);   // une prise de moins d'une demi-seconde est refusée (« trop courte »)
  await page.locator("#meShutter").tap();
  await page.waitForFunction(EDITION, null, { timeout: 20000 });

  // (f) Flash : pendant l'éclair, ni second déclenchement ni changement de mode ; les onglets restent au clavier.
  await retourCapture(page);
  await page.locator('#meModes [data-mode="story"]').tap();
  const eclair = await page.evaluate(() => {
    meCap.flash = true;
    meCapturePhoto();
    const pendant = meCam._flashEnCours;
    meChoisirMode("bobine");
    return { pendant, mode: meState.mode, clavier: Array.from(document.querySelectorAll("#meModes .me-mode")).every((b) => b.tabIndex === 0) };
  });
  expect(eclair).toEqual({ pendant: true, mode: "story", clavier: true });
  await page.waitForFunction(EDITION, null, { timeout: 15000 });
  expect(await page.evaluate(() => ({ type: meState.mediaType, flash: meCam._flashEnCours }))).toEqual({ type: "photo", flash: false });
});
