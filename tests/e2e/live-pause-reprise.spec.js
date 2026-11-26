// ═══════════════════════════════════════════════════════════════════════════
// LIVE VIDÉO — PAUSE PUIS REPRISE PAR L'HÔTE (2026-11-26)
//
// Défaut vécu (capture Android) : « quand je mets pause je n'arrive pas à
// reprendre ». L'écran « en pause » (plein écran, z-index 6) recouvrait la barre
// de commandes (z-index 5) : le bouton ▶️ était dessous, intouchable.
//
// ① en pause, le bouton de la barre est TOUCHABLE (elementFromPoint) et reprend ;
// ② le gros bouton « Reprendre le live » du voile reprend aussi ;
// ③ le micro coupé AVANT la pause reste coupé après la reprise ;
// ④ basculer le micro pendant la pause ne rallume pas le son ;
// ⑤ le spectateur ne voit pas le bouton « Reprendre » ;
// ⑦ paysage + chat plein, ⑧ caméra retournée pendant la pause ;
// ⑥ à 360 px, TOUTES les commandes de l'hôte tiennent dans l'écran (le champ
//    sans `min-width: 0` poussait micro et caméra hors champ).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function hote(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.__envois = [];
    _vliveSend = (ev, p) => { window.__envois.push([ev, p]); };
    const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32;
    cv.getContext("2d").fillRect(0, 0, 32, 32);
    const stream = cv.captureStream(5);
    const ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    ac.createOscillator().connect(dest);
    stream.addTrack(dest.stream.getAudioTracks()[0]);
    window._vliveHost = { stream, pcs: {}, paused: false, title: "Banc" };
    _vliveRenderUI("host", { title: "Banc" });
  });
}

const pistes = (page) => page.evaluate(() => {
  const s = window._vliveHost.stream;
  return { video: s.getVideoTracks()[0].enabled, audio: s.getAudioTracks()[0].enabled, paused: !!window._vliveHost.paused };
});

async function toucherAuCentre(page, sel) {
  const box = await page.locator(sel).boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cible = await page.evaluate(([x, y, sel]) => {
    const el = document.elementFromPoint(x, y);
    return !!(el && el.closest(sel));
  }, [x, y, sel]);
  expect(cible, sel + " doit être le premier élément sous le doigt").toBe(true);
  await page.mouse.click(x, y);
}

test.describe("Live — pause et reprise", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("① le bouton de la barre reste touchable en pause et reprend", async ({ page }) => {
    await hote(page);
    await toucherAuCentre(page, "#vlivePauseBtn");
    await expect(page.locator("#vlivePaused")).toBeVisible();
    expect(await pistes(page)).toEqual({ video: false, audio: false, paused: true });
    await toucherAuCentre(page, "#vlivePauseBtn");
    await expect(page.locator("#vlivePaused")).toBeHidden();
    expect(await pistes(page)).toEqual({ video: true, audio: true, paused: false });
    const ev = await page.evaluate(() => window.__envois.filter(e => e[0] === "pause").map(e => e[1].on));
    expect(ev).toEqual([true, false]);
  });

  test("② le bouton « Reprendre le live » du voile reprend", async ({ page }) => {
    await hote(page);
    await page.locator("#vlivePauseBtn").click();
    await toucherAuCentre(page, ".vlive-resume-btn");
    await expect(page.locator("#vlivePaused")).toBeHidden();
    expect(await pistes(page)).toEqual({ video: true, audio: true, paused: false });
    await expect(page.locator("#vlivePauseBtn")).toHaveText("⏸");
  });

  test("③④ le micro garde son intention à travers la pause", async ({ page }) => {
    await hote(page);
    await page.locator("#vliveMicBtn").click();                 // micro coupé
    await page.locator("#vlivePauseBtn").click();               // pause
    await page.locator("#vliveMicBtn").click();                 // rallumé PENDANT la pause
    expect((await pistes(page)).audio).toBe(false);             // ④ silence tant que pause
    await page.locator("#vliveMicBtn").click();                 // recoupé
    await page.locator(".vlive-resume-btn").click();            // reprise
    expect(await pistes(page)).toEqual({ video: true, audio: false, paused: false }); // ③
    await expect(page.locator("#vliveMicBtn")).toHaveText("🔇");
  });

  test("⑤ le spectateur ne voit pas de bouton Reprendre", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => { _vliveRenderUI("viewer", { title: "Banc", author_name: "Hôte" }); _vliveShowPaused(true, false); });
    await expect(page.locator("#vlivePaused")).toBeVisible();
    await expect(page.locator(".vlive-resume-btn")).toHaveCount(0);
    const box = await page.locator(".vlive-close").boundingBox();
    const touchable = await page.evaluate(([x, y]) => !!(document.elementFromPoint(x, y) || {}).closest && !!document.elementFromPoint(x, y).closest(".vlive-close"), [box.x + box.width / 2, box.y + box.height / 2]);
    expect(touchable, "la croix du spectateur reste touchable en pause").toBe(true);
  });

  test("⑦ paysage, chat plein : le chat ne recouvre pas « Reprendre le live »", async ({ page }) => {
    await page.setViewportSize({ width: 812, height: 375 });
    await hote(page);
    await page.evaluate(() => {
      const l = document.getElementById("vliveChatList");
      for (let i = 0; i < 30; i++) { const d = document.createElement("div"); d.className = "vlive-chat-msg"; d.textContent = "message " + i; l.appendChild(d); }
    });
    await page.locator("#vlivePauseBtn").click();
    await toucherAuCentre(page, ".vlive-resume-btn");
    await expect(page.locator("#vlivePaused")).toBeHidden();
    expect((await pistes(page)).paused).toBe(false);
  });

  test("⑧ caméra retournée PENDANT l'échange de piste : la pause s'applique à la nouvelle", async ({ page }) => {
    await hote(page);
    const allumee = await page.evaluate(async () => {
      const H = window._vliveHost;
      let lacher;
      H.pcs = { v1: { pc: { getSenders: () => [{ track: { kind: "video" }, replaceTrack: () => new Promise(r => { lacher = r; }) }] } } };
      const cv = document.createElement("canvas"); cv.width = 16; cv.height = 16; cv.getContext("2d").fillRect(0, 0, 16, 16);
      navigator.mediaDevices.getUserMedia = async () => cv.captureStream(5);
      const p = flipVliveCamera();
      while (!lacher) await new Promise(r => setTimeout(r, 10));
      toggleVlivePause();          // pause posée pendant replaceTrack
      lacher();
      await p;
      return H.stream.getVideoTracks()[0].enabled;
    });
    expect(allumee).toBe(false);
  });

  for (const largeur of [360, 390]) {
    test(`⑥ à ${largeur} px, toutes les commandes de l'hôte sont dans l'écran`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 780 });
      await hote(page);
      const dehors = await page.evaluate((w) => Array.from(document.querySelectorAll(".vlive-chat-bar button, .vlive-topbar button"))
        .filter(b => { const r = b.getBoundingClientRect(); return r.left < 0 || r.right > w + 0.5 || r.width < 1; })
        .map(b => b.getAttribute("aria-label")), largeur);
      expect(dehors).toEqual([]);
    });
  }
});
