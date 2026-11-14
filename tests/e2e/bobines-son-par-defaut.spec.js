// ═══════════════════════════════════════════════════════════════════════════
// Bobines — le SON est ACTIVÉ par défaut (demande de Benjamin, 2026-11-14) :
// « si je n'en veux pas, c'est à moi de le couper ».
//   ① à l'ouverture, la bobine joue avec le son et le bouton affiche 🔊 ;
//   ② un navigateur qui refuse la lecture sonore hors geste ne fige pas la
//      bobine : elle repart sans son, 🔇 s'affiche, et le choix reste « son » ;
//      la toucher allume alors le son (et non l'éteint) ;
//   ③ couper le son vaut pour les bobines suivantes.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("le son des bobines est activé par défaut, avec repli sans son si le navigateur refuse", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
    // Le banc ne télécharge aucune vidéo : play() est simulé.
    const vraiPlay = HTMLMediaElement.prototype.play;
    let refuserSonore = false;
    HTMLMediaElement.prototype.play = function () {
      if (refuserSonore && !this.muted) return Promise.reject(new DOMException("refus", "NotAllowedError"));
      Object.defineProperty(this, "paused", { configurable: true, get: () => false });
      return Promise.resolve();
    };
    try {
      openReels();
      const items = [...document.querySelectorAll("#reelsList .reel-item")];
      const idx = items.findIndex((it) => it.querySelector("video"));
      const it = items[idx];
      const vid = it.querySelector("video");
      const btn = () => it.querySelector(".reel-sound-btn").textContent;
      reelsState.current = idx; playReelAt(idx); await attendre(50);
      const defaut = { soundOn: reelsState.soundOn, muted: vid.muted, bouton: btn() };

      // ② refus de la lecture sonore
      refuserSonore = true;
      delete vid.paused;
      vid.removeAttribute("src");
      playReelAt(idx); await attendre(50);
      const repli = { soundOn: reelsState.soundOn, muted: vid.muted, bouton: btn() };
      refuserSonore = false;
      toggleReelsSound();
      const apresToucher = { soundOn: reelsState.soundOn, muted: vid.muted, bouton: btn() };

      // ③ couper
      toggleReelsSound();
      const coupe = { soundOn: reelsState.soundOn, muted: vid.muted, bouton: btn() };
      closeReels();
      return { idx, defaut, repli, apresToucher, coupe };
    } finally { HTMLMediaElement.prototype.play = vraiPlay; }
  });
  expect(r.idx, "une bobine vidéo existe").toBeGreaterThanOrEqual(0);
  expect(r.defaut, "son activé par défaut").toEqual({ soundOn: true, muted: false, bouton: "🔊" });
  expect(r.repli, "refus : relance sans son, le choix reste « son »").toEqual({ soundOn: true, muted: true, bouton: "🔇" });
  expect(r.apresToucher, "toucher 🔇 allume le son").toEqual({ soundOn: true, muted: false, bouton: "🔊" });
  expect(r.coupe, "toucher 🔊 coupe le son").toEqual({ soundOn: false, muted: true, bouton: "🔇" });
});
