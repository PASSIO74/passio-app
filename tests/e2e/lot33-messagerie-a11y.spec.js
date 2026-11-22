// ═══════════════════════════════════════════════════════════════════════════
// LOT-33 (audit UX/UI du 2026-11-10) — MESSAGERIE : LECTEUR DE VOCAL ET IMAGES
//   ① MSG-C75 : le bouton de lecture s'appelle « Lire le message vocal », puis
//      « Mettre le message vocal en pause » pendant la lecture ; la vitesse dit
//      sa valeur ; leurs zones tactiles font 44 px.
//   ② MSG-C75 : photos et GIF du fil ont un texte alternatif qui dit qui les a
//      envoyés (échappé).
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const LEA = "a1b2c3d4-0000-4000-8000-00000000c6a1";

test("① lecteur de vocal nommé, état annoncé, zones de 44 px", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async (lea) => {
    function FauxAudio() { this.paused = true; this.playbackRate = 1; }
    FauxAudio.prototype.play = function () { this.paused = false; return Promise.resolve(); };
    FauxAudio.prototype.pause = function () { this.paused = true; };
    window.Audio = FauxAudio;
    window._voiceSpeed = 1;
    conversationsState = [{ id: "c_v", userId: lea, userName: "Léa", lastAt: Date.now(), messages: [{ id: "v1", from: lea, voiceData: "data:audio/webm;base64,AAAA", voiceDuration: 3, at: Date.now() }] }];
    openConversation("c_v");
    await new Promise((res) => setTimeout(res, 400));
    const pb = document.querySelector("#convFpThread .voice-play-btn");
    const vit = document.querySelector("#convFpThread .voice-speed-btn");
    const avant = pb.getAttribute("aria-label");
    const vitAvant = vit.getAttribute("aria-label");
    pb.click();
    await new Promise((res) => setTimeout(res, 30));
    const pendant = pb.getAttribute("aria-label");
    vit.click();
    const vitApres = document.querySelector("#convFpThread .voice-speed-btn").getAttribute("aria-label");
    const zone = (n) => { const a = getComputedStyle(n, "::after"); return [parseFloat(a.width), parseFloat(a.height)]; };
    return { avant, pendant, vitAvant, vitApres, zPb: zone(pb), zVit: zone(vit) };
  }, LEA);
  expect(r.avant).toBe("Lire le message vocal");
  expect(r.pendant).toBe("Mettre le message vocal en pause");
  expect(r.vitAvant).toBe("Vitesse de lecture : 1×");
  expect(r.vitApres).toBe("Vitesse de lecture : 1,5×");
  expect(r.zPb).toEqual([44, 44]);
  expect(r.zVit).toEqual([44, 44]);
});

test("② photos et GIF ont un texte alternatif échappé", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async (lea) => {
    conversationsState = [{ id: "c_i", userId: lea, userName: "Léa \"<b>\"", lastAt: Date.now(), messages: [
      { id: "i1", from: lea, img: "https://example.org/a.jpg", at: Date.now() - 2000 },
      { id: "g1", from: "me", gif: "https://example.org/b.gif", at: Date.now() - 1000 },
    ] }];
    openConversation("c_i");
    await new Promise((res) => setTimeout(res, 400));
    return Array.from(document.querySelectorAll("#convFpThread .conv-bubble img")).map((i) => i.getAttribute("alt"));
  }, LEA);
  expect(r).toEqual(["Photo envoyée par Léa \"<b>\"", "GIF envoyé par toi"]);
});
